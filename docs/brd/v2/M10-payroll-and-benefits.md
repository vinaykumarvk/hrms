# Payroll and Benefits Management — HRMS Module BRD (v2.0)

**Module code:** M10-PAY
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory payroll rules
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v2.0
**Supersedes:** v1.0 (`docs/brd/v1/M10-payroll-and-benefits.md`)
**Revision basis:** Adversarial Council Review (`docs/evaluation/M10-payroll-and-benefits-council.md`) — all 24 Adopted Improvements incorporated; Critical/High risks R1–R8, R18 mitigated as concrete requirements and controls.
**Status:** Draft for Gate A review (revised)

---

## 1. Executive Summary

### 1.1 Purpose

The Payroll and Benefits Management module (**M10-PAY**) is the financial heart of the HRMS. It computes, controls, and disburses employee compensation each pay cycle; administers statutory deductions, loans, advances, perquisites, and benefits; **tracks every statutory deduction through to its actual deposit with the State (challan/CIN) and its posting to the books**; and produces every downstream financial and compliance artefact (payslips, bank disbursement files, statutory remittance schedules, Form-16/Form-24Q/tax statements, payroll registers, cost-to-organisation analytics, and full-and-final settlements). It publishes pay events to the **Digital Service Register (M12)** and feeds terminal-benefit and pension processing in **M11**.

M10 is engineered as a **configurable, rule-driven, audit-grade payroll *system of record*** — not merely a calculator. Pay is never hand-keyed into a ledger; it is *derived* from a versioned salary structure, a **point-in-time cross-module snapshot** of upstream facts (M01 master/bank/PAN/scheme, M03 attendance, M06 fixation, M09 recovery, org unit), and a deterministic computation pipeline. Once a payroll run is **finalised and locked, it is immutable** — corrections flow only through arrears, supplementary, off-cycle, or reopen-with-versioning runs, never through silent edits. Every rupee is traceable from snapshotted input → computed payslip → disbursed credit → **deposited statutory remittance → posted GL journal**, and is reversible only through a controlled adjustment with full audit.

The boundary of M10 is, per the Council's chairman ruling, **"compute + disburse + remit-to-State + post-to-GL-status"** — surgically wider than a calculator (it proves money was correctly *paid*, *remitted*, and *booked*, through to every employee's *exit*) but stopping short of becoming a general ledger.

### 1.2 Business Context and Problem Statement

Government payroll combines high volume with extreme regulatory sensitivity: pay matrices and scales (e.g., 7th CPC-style pay levels), Dearness Allowance (DA) revisions issued retrospectively, House Rent Allowance (HRA) by city class, GPF/CPF/NPS contributions, income-tax (TDS) with employee declarations, proofs, perquisites, surcharge/cess/relief, professional tax slabs **that differ by state of posting**, recoveries ordered by disciplinary authorities, statutory remittances under tight deadlines **that must be deposited and matched, not merely scheduled**, and full-and-final settlements for every separation. Manual or spreadsheet-driven payroll produces reconciliation gaps, over/under-payments, **duplicate disbursements**, YTD drift, audit findings, and litigation. M10 eliminates these by making the rule set explicit and versioned, the run reproducible from a defined snapshot, the disbursement double-payment-proof, the YTD an immutable derived ledger, and the controls enforceable.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Deterministic, reproducible monthly payroll | Re-running an unlocked cycle with identical inputs **and the same cross-module snapshot** yields byte-identical results |
| G2 | Statutory accuracy **through deposit** | 100% correct DA/HRA/PT/TDS/GPF/NPS/perquisite computation against published rules; zero statutory-deadline misses **proven against actual challan/CIN deposit, not just schedule generation** |
| G3 | Immutable, auditable finalised runs | No mutation of locked runs; every adjustment traceable to an arrear/supplementary/off-cycle/reopen-version entry with a lock-to-lock diff |
| G4 | Reconciliation integrity (extended) | Gross = sum(earnings); Net = Gross − sum(deductions); **Σ disbursed + Σ held + Σ failed = run net** — reconciled before disbursement; YTD ties to the immutable line ledger |
| G5 | Self-service | Employees access payslips, tax declarations, Form-16, loan statements, FnF status without HR intervention |
| G6 | Retrospective correctness | Arrears for back-dated DA/increment/pay-fixation computed automatically with full break-up and **dependent-allowance cascade**, with cross-FY relief via Form-10E |
| G7 | Cost transparency | Cost-to-organisation analytics by org unit, cadre, component, and period, including employer cost |
| G8 | No duplicate / no missing money | No double disbursement on resend (positive-pay guard); no net pay leaves the tie-out silently (suspense ledger) |
| G9 | Lifecycle completeness | Every employee's exit is settled through a single consolidated full-and-final run |

### 1.4 Scope Summary

In scope: salary structure & pay rules engine (constrained, versioned DSL); monthly payroll run engine with parallel/what-if runs and a **single-in-flight-run guarantee**; **cross-module point-in-time snapshot contract**; arrears & retrospective revisions with dependent-allowance cascade; supplementary & off-cycle payroll; LWP/leave-based deductions; subsistence-allowance and dies-non handling; statutory deductions (TDS, PT-by-state, GPF/PF, NPS, pension contribution, insurance); **taxable perquisite valuation (Rule 3, incl. concessional-loan perquisite)**; full TDS pipeline (standard deduction → Chapter VI-A → slab → surcharge with marginal relief → 4% cess → 87A rebate → 89(1)/Form-10E relief → previous-employer/Form-12B income); recoveries with legal-eligibility check; loans & advances; benefits administration incl. **leave encashment**; payslip generation **with reopen versioning**; bank disbursement with **DSC/HSM signature, bank-side batch reference, positive-pay reconciliation, and a suspense-hold ledger**; payroll register & reconciliation; **statutory remittance & liability tracking (deducted → deposited → matched) and GL cost-journal posting status**; Form-16/Form-24Q/tax statements; full-and-final settlement; approval, locking & reopen-versioning; feeds to M11 and M12.

Out of scope (owned elsewhere): the canonical employee master (M01), attendance/leave capture (M03), pension disbursement after retirement (M11), the SR ledger itself (M12), document storage internals (M13), and the **general-ledger book of record** (M10 produces the cost journal and tracks its posting status; Finance's ERP owns the GL).

### 1.5 Key Stakeholders

Payroll Officer, Payroll Manager/Controller, HR Officer/Admin, Department Head/Drawing & Disbursing Officer (DDO), Finance/Treasury, Employee (self-service), Auditor, System Administrator.

### 1.6 Success Criteria

A pay cycle is "successful" when: all eligible active employees are computed from a frozen cross-module snapshot; reconciliation balances to zero variance with `disbursed + held + failed = run net`; the run is approved and locked; payslips are published; the bank file is DSC-signed, transmitted once with a unique bank batch reference, and positively reconciled against the treasury debit; statutory schedules are produced **and their remittances deposited, challan-captured, and matched**; the cost journal is exported and its posting acknowledged; and pay events are posted to M12 — all within the cycle calendar with a complete audit trail. A separation is "successful" when the employee's full-and-final settlement nets all dues and recoveries into a single final payment with its own reconciliation and M11 handoff.

---

## 1A. Amendments (v1 → v2)

This table maps every Council **Adopted Improvement** (AI-1…AI-24) and **Risk** (R1…R19) to where and how it is incorporated. The v1 architectural spine (determinism, immutability, correction calculus, three-way tie-out, SoD-in-schema, effective-dated rates, what-if runs) is preserved verbatim; v2 is a "tighten and extend," not a rewrite.

| # | Adopted improvement (risk) | Incorporated where | How |
|---|---|---|---|
| AI-1 | Statutory remittance & liability tracking (R4) | **New FR-M10-19**; entity **E29 `statutory_remittances`**; §2.3 boundary amend; FR-17 feeds it; Form-16 Part A derives from MATCHED | deducted→deposited→matched lifecycle; challan/CIN/due-date/late-interest u/s 201 & 234E |
| AI-2 | Full-and-final settlement (R7) | **New FR-M10-20**; entity **E30 `fnf_settlements`**; cycle `run_type=FNF`; §10.6 state table | consolidated separation run nets notice pay, loan settle, leave encashment, final pay, gratuity, final TDS true-up; M11 handoff |
| AI-3 | Disbursement double-payment guard (R1 Critical) | FR-M10-14 (rewritten flow); `bank_disbursements` adds `bank_batch_ref`, positive-pay fields; status `SUSPECTED_PROCESSED` | bank-side unique batch ref + mandatory treasury-debit/positive-pay reconciliation before any resend; resend forbidden until confirmed non-debit |
| AI-4 | Bank-file-total contradiction / suspense (R2 Critical) | FR-M10-14; **new entity E31 `disbursement_holds`**; data-integrity rule #4 redefined | `Σ disbursed + Σ held + Σ failed = run net`; held net is an owned backlog with re-disbursement workflow |
| AI-5 | YTD mutable→derived ledger (R3 Critical) | FR-M10-06/07/16/17; data-integrity rule #9 rewritten; `deductions.cumulative_ytd` demoted to cached projection | statutory/tax YTD = immutable Σ over `payslip_lines` for FY across regular+arrears+off-cycle; safe reopen |
| AI-6 | Taxable perquisites (R5 High) | **New FR-M10-21**; entity **E32 `perquisites`**; `pay_components.category` adds `PERQUISITE`; FR-08 wires concessional-loan perquisite | Rule 3 valuation incl. concessional/interest-free loan & employer accommodation; feeds FR-07 taxable income |
| AI-7 | Deepened TDS pipeline (R5 High) | FR-M10-07 (rewritten computation); `tax_declarations` adds Form-12B & Form-10E fields | gross→std deduction→Ch.VI-A→slab→surcharge(+marginal relief)→4% cess→87A→89(1)/10E; previous-employer income |
| AI-8 | Cross-module point-in-time snapshot (R6 High) | **New FR-M10-22**; entity **E34 `run_input_snapshots`**; `payroll_runs.snapshot_id`; FR-04 consumes | as-of semantics for M01/M03/M06/M09/org; post-cutoff order handling; snapshot persisted onto run/payslip |
| AI-9 | Net-pay floor & attachment exemption (R8 High) | FR-M10-09 (BR + config); Appendix 16.3 rewritten; **new entity E35 `deduction_carryforwards`** | configurable protected floor per cadre/jurisdiction; CPC s.60 attachment exemption modelled separately; rolled-forward backlog owned & aged |
| AI-10 | Rounding-adjustment component & tolerance (R9) | FR-M10-04 BR; Appendix 16.2; `pay_components.category` adds `ROUNDING_ADJUSTMENT` | designated component absorbs Σ(rounded)−round(Σ); documented CRA/GPF remittance tolerance |
| AI-11 | Reopen payslip versioning & lock-to-lock diff (R10) | FR-M10-16; `payslips` adds `version`, `superseded_by_payslip_id`, `supersession_reason` | reopen → originals REVERSED, new payslip version; structured diff in `audit_log`; YTD recomputes from surviving set |
| AI-12 | Single-in-flight-run constraint (R11) | FR-M10-04/16; data-integrity rule #13; partial unique index | DB constraint / advisory lock prevents two concurrent FINAL (or conflicting) runs per cycle; `RUN_ALREADY_IN_FLIGHT` |
| AI-13 | PT state dimension (R12) | FR-M10-02/06; `rate_tables` adds `state`; PT_SLAB key includes work-state | PT resolved by employee's state of posting; multi-state within one legal entity |
| AI-14 | Subsistence-allowance & dies-non rules (R13) | FR-M10-04 BR + FR-M10-06 BR; Appendix 16.6 | subsistence initial % + escalation after N months; dies-non no-pay/no-service explicit business rules |
| AI-15 | Constrain & version the DSL (R14) | FR-M10-01 (rewritten validation); Appendix 16.7 | pinned decimal/null/precedence semantics; DSL grammar versioned independently; property-tested; restricted FORMULA escape hatch |
| AI-16 | DSC/HSM signature, not checksum-only (R15) | FR-M10-14; `bank_disbursements` adds `dsc_signature`, `signing_cert_ref`; §13 week-1 long-pole | cryptographic signature + verification on transmit and ack; checksum retained as integrity only |
| AI-17 | Mid-month inter-DDO transfer rule (R16) | FR-M10-22 BR + FR-M10-04 edge case; Appendix 16.8 | single "DDO-of-record for the transfer month" default with optional split-period payslip; correct control-account attribution |
| AI-18 | Cost-journal posting record & status (R4 / §2.3) | **New FR-M10-19** (GL posting sub-flow); entity **E33 `gl_journals`**; §2.3 amended | structured export object with `POSTED`/`ACKNOWLEDGED` status from Finance ERP; M10 does not own the GL |
| AI-19 | Remove bank-format over-engineering (R17) | FR-M10-14; `bank_disbursements.file_format` enum trimmed; §16.5 | ship treasury-accepted format only; retain `FileFormatStrategy` seam; ISO20022/CUSTOM marked DEFERRED |
| AI-20 | Strengthen migration/cutover gating (R18 delivery) | §13.2/§13.4 (rewritten gate) | 2-cycle parallel run must reconcile YTD accumulators + per-scheme statutory totals to zero variance before go-live; mid-year YTD seed is a signed-off dataset |
| AI-21 | Overpayment-recovery legal-eligibility check (R19) | FR-M10-09 (BR4 + AC); `deductions` recovery gate | flag legally-barred cases (Rafiq Masih line) for authority decision before scheduling; record justification |
| AI-22 | Arrears dependent-allowance cascade (R5/FR-10) | FR-M10-10 (Description, BR, AC) | retrospective basic change recomputes DA/HRA/TPT/NPS/GPF per month in order; arrear TDS delta flows through corrected YTD + Form-10E |
| AI-23 | Leave encashment as explicit rule (R7/D) | FR-M10-12 (new BR/AC) + FR-M10-20; `benefit_type`/`claim_type` add `LEAVE_ENCASHMENT`; component `LEAVE_ENCASHMENT` | eligible balance × per-day basis with caps & taxability; feeds regular/FnF/off-cycle |
| AI-24 | First-class backlog reporting (D) | §12 (new reports); FR-M10-09/14/19 surface | registers for un-recovered deductions, suspense-held net, overdue remittances — managed exceptions, not asserted invariants |

**Council Recommendation honoured:** Proceed to Gate A conditionally — spine preserved; the two Critical disbursement/YTD defects (R1–R3) closed; liability/exit rings (R4, R5, R7) added; cross-module snapshot (R6) defined; under-specified numbers (R8, R13) filled; R9–R19 applied as line-edits.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Salary Structure & Pay Matrix | M10-F01 | Pay scales/levels, components (basic, DA, HRA, allowances, special pay), eligibility rules |
| Pay Rules Engine | M10-F02 | Configurable, **constrained & versioned** earning/deduction formulae and computation order |
| Employee Compensation Assignment | M10-F03 | Per-employee salary structure binding, pay-fixation, increments |
| Payroll Run Engine | M10-F04 | Monthly cycle orchestration, computation, parallel/what-if runs, **single-in-flight guarantee** |
| Cross-Module Snapshot | M10-F19 | **Point-in-time as-of snapshot of M01/M03/M06/M09/org facts into the run** |
| Time & Leave Inputs | M10-F05 | LWP/leave-loss-of-pay and attendance ingestion from M03; subsistence/dies-non |
| Statutory Deductions | M10-F06 | TDS, professional tax (**by state**), GPF/PF, NPS, pension contribution, insurance |
| Income-Tax Declarations & Proofs | M10-F07 | Declarations, proofs, regime, **full surcharge/cess/relief/12B/10E pipeline** |
| Taxable Perquisites | M10-F20 | **Rule-3 perquisite valuation incl. concessional-loan & accommodation** |
| Loans & Advances | M10-F08 | Sanction, schedule, EMI recovery, foreclosure, interest, **perquisite linkage** |
| Recoveries & Adjustments | M10-F09 | Disciplinary recoveries (M09), overpayment recovery (**legal-eligibility gate**), ad-hoc |
| Arrears & Retrospective Revisions | M10-F10 | Back-dated DA/increment/pay-fixation arrear computation **with dependent cascade** |
| Supplementary & Off-Cycle Payroll | M10-F11 | Out-of-band payments, missed payments, bonus/ex-gratia |
| Benefits Administration | M10-F12 | Medical/health, LTC/LTA, gratuity accrual, reimbursements, group insurance, **leave encashment** |
| Payslip Generation | M10-F13 | Per-employee payslip rendering, publication, **reopen versioning**, self-service |
| Bank Disbursement | M10-F14 | **DSC-signed** file generation, validation, transmission, **positive-pay & suspense-hold** reconciliation |
| Payroll Register & Reconciliation | M10-F15 | Run register, control totals (**disbursed+held+failed=net**), variance, sign-off |
| Approval & Locking | M10-F16 | Multi-level approval, finalisation, immutability, **reopen-with-versioning** control |
| Statutory Outputs (Form-16/tax) | M10-F17 | Form-16 (Part A from MATCHED remittance), Form-24Q, PT/GPF/NPS schedules |
| Statutory Remittance & GL Posting | M10-F21 | **Deducted→deposited→matched liability loop; cost-journal posting status** |
| Full-and-Final Settlement | M10-F22 | **Consolidated separation run; M11 handoff** |
| Cost-to-Org Analytics | M10-F18 | Payroll cost, headcount cost, variance and trend analytics |

### 2.2 Common Capabilities (inherited from Shared Foundation)

All M10 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); maker-checker via the shared workflow engine; RBAC + org-unit row-level scoping; immutable `audit_log` write on every state change; `documents` (M13) for generated artefacts; `notifications` for events; `service_register_events` (M12) for pay events.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In M10? | Owner / Note |
|---|---|---|
| Employee master data | Reference only (**snapshotted as-of cutoff**) | M01 (golden source) |
| Attendance & leave balances | Consume only (**snapshotted**) | M03 (LWP days, paid/unpaid splits) |
| Promotion / pay-fixation order | Consume the order; compute pay impact | M06 issues; M10 fixes pay & computes arrears |
| Disciplinary recovery order | Consume; recover via payroll | M09 issues; M10 schedules recovery |
| Pension disbursement | Out | M11 (M10 supplies last-pay-drawn, contribution history, **FnF gratuity handoff**) |
| Service register pay events | Write events | M12 owns ledger; M10 appends |
| Document storage | Reference | M13 stores payslips/Form-16/bank files |
| Statutory deposit (challan/CIN) | **In — tracked to MATCHED** | M10 records deposit & matches; the banking/TRACES portal executes |
| General ledger posting | **Export + posting-status tracking** (amended from "export only") | M10 produces cost journal and tracks `POSTED`/`ACKNOWLEDGED`; Finance ERP owns the GL book of record |
| Bank core integration | File + API handshake (**DSC-signed, positive-pay reconciled**) | Treasury/Bank gateway is external |

### 2.4 Assumptions and Constraints

- Pay scales, DA rates, HRA city classes, **PT slabs keyed by state**, and tax slabs are **configurable master data**, sourced from government notifications and version-effective-dated.
- A single legal entity per deployment; multi-entity is a future extension but the data model is entity-aware (`legal_entity_id`). **Multi-state professional tax is supported within a single entity via a `state` dimension on PT slabs.**
- One primary monthly cycle plus arrears/supplementary/off-cycle/**FnF** cycles per period.
- The bank/treasury accepts **one defined, certified file format per deployment** (the treasury's format is shipped; ISO20022/CUSTOM are deferred behind a strategy seam). The bank file is **digitally signed (DSC/HSM)**, not merely checksummed.
- All money math uses fixed-point decimal (no binary float); rounding rules are explicit and configurable (default: round to nearest rupee, half-up; statutory deductions per their own rounding rules). **A designated rounding-adjustment component absorbs per-payslip residue so gross/net tie exactly.**
- **Determinism extends upstream:** a run is a pure function of (salary structure version, effective rate tables, M10 inputs, prior immutable line ledger, **and the cross-module snapshot** of M01/M03/M06/M09/org taken as-of the cutoff).
- **YTD is derived, never a mutable scalar:** statutory/tax year-to-date totals are the immutable sum over `payslip_lines` for the FY; `deductions.cumulative_ytd` is only a recomputable cache.

---

## 3. Roles & Permissions

### 3.1 Module Roles (extending the Shared RBAC baseline)

| Role | M10 responsibility |
|---|---|
| Employee (Self-Service) | View own payslips, salary structure, loan/benefit/perquisite/FnF statements; submit tax declarations, proofs & Form-12B; submit reimbursement/LTC/leave-encashment claims |
| Reporting Manager | Recommend/approve reimbursement and benefit claims for direct reports |
| Payroll Officer (Maker) | Configure pay components/rules, assign structures, run payroll (draft/parallel), enter adjustments, prepare bank file, capture remittance challans, prepare FnF |
| Payroll Manager / Controller (Checker) | Review reconciliation, approve & lock runs, authorise off-cycle/supplementary/FnF, **DSC-sign** bank file, **confirm positive-pay before any resend**, reopen-with-versioning, certify remittances & Form-16 |
| HR Officer / Admin | Maintain employee pay-relevant attributes within delegated scope; raise pay-fixation requests; initiate separation/FnF |
| Department Head / DDO | Sanction loans/advances; sanction off-cycle/FnF payments within authority; **adjudicate legally-barred overpayment recovery** |
| Finance / Treasury | Receive bank file & cost journal; confirm disbursement acknowledgement & **treasury debit (positive pay)**; acknowledge GL posting; confirm statutory deposits |
| Auditor (read-only) | Read all payroll data, registers, remittance ledger, audit log; no write |
| System Administrator | Manage master data (scales, DA/HRA/PT-by-state/tax tables), file format config, DSL grammar version, RBAC; **no transactional self-approval** |

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Lock, X=No access)

| Capability | Employee | Mgr | Payroll Officer | Payroll Mgr | HR Admin | DDO/Dept Head | Finance | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|
| Pay component / rule config | X | X | C/R/U (draft) | A | R | X | X | R | C/R/U |
| Pay scale / DA / HRA / PT-by-state / tax tables | X | X | R | R | R | X | X | R | C/R/U/A |
| Assign salary structure / pay-fixation | X | X | C/R/U | A | C (request) | X | X | R | X |
| Run payroll (draft / parallel) | X | X | C/R | R | X | X | X | R | X |
| Approve & lock payroll run | X | X | X | A | X | X | X | R | X |
| Reopen locked run (versioned) | X | X | X | A (justified) | X | X | X | R | X |
| Loans & advances sanction | X | R (own reports) | C/R | R | C (request) | A | X | R | X |
| Tax declaration / proofs / 12B | C/R/U (own) | X | R/A (verify) | R | R | X | X | R | X |
| Perquisite valuation | X | X | C/R/U | A | R | X | X | R | R |
| Reimbursement / LTC / leave-encashment claim | C/R (own) | A (recommend) | R/A (verify) | A | R | X | X | R | X |
| Off-cycle / supplementary / FnF payment | X | X | C/R | A | C (FnF init) | A (sanction) | X | R | X |
| Bank file generate / **DSC-sign** | X | X | C/R | A (sign) | X | X | R | R | X |
| Disbursement ack / **positive-pay confirm** | X | X | R/U | A (confirm) | X | X | C/R | R | X |
| Statutory remittance challan capture / match | X | X | C/R/U | A (certify) | X | X | R (confirm deposit) | R | X |
| GL cost-journal export / posting status | X | X | C/R | R | X | X | A (ack) | R | X |
| Payslip view | R (own) | R (reports) | R | R | R | R | X | R | X |
| Form-16 / statutory outputs | R (own) | X | C/R | A | R | X | R | R | X |
| Overpayment legal-eligibility adjudication | X | X | C (flag) | R | X | A (decide) | X | R | X |
| Cost-to-org analytics | X | R (own unit) | R | R | R | R | R | R | R |
| Audit log | X | X | R (own actions) | R | X | X | X | R | R |

**Segregation of duties:** maker ≠ checker is enforced — the Payroll Officer who runs/prepares cannot approve/lock, **DSC-sign the bank file, or confirm positive-pay**; the SysAdmin who configures tables cannot run or approve payroll for which they are also an employee subject. **The principal who DSC-signs the bank file must differ from the run creator; the principal who confirms the treasury debit (positive pay) before a resend must differ from the one who transmitted.**

---

## 4. Shared Application Foundation

M10 inherits the Shared Foundation §5 technical defaults verbatim: React + TypeScript (Tailwind + shadcn/ui) frontend; REST `/api/v1`; PostgreSQL primary store; encrypted object storage for payslips/Form-16; OIDC/SSO + MFA; JWT + RBAC + org-unit row-level scoping; canonical error envelope; OWASP ASVS; TLS 1.2+, encryption at rest; DPDP Act 2023 alignment; P95 < 500ms (interactive), batch SLAs defined in §9; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

**M10-specific foundation extensions:**

- **Money type:** `NUMERIC(15,2)` fixed-point for all amounts; rates as `NUMERIC(9,4)`; no floating point in computation. A **rounding-adjustment component** absorbs `Σ(rounded) − round(Σ)` residue per payslip so identities tie exactly.
- **Computation determinism (extended):** the run engine is a pure function of (salary structure version, rate tables effective on pay period, employee inputs, **prior immutable line ledger**, **and the cross-module input snapshot**). Same inputs + same snapshot → same outputs.
- **Cross-module snapshot:** every run persists an immutable `run_input_snapshots` row capturing the as-of values of M01 (employee/bank/PAN/scheme), M03 (attendance), M06 (fixation), M09 (recovery), and org_unit. Determinism and audit extend to upstream data (FR-22).
- **Immutability & versioning:** finalised payroll runs and their payslips are append-only snapshots; corrections create new artefacts; **reopen produces a new payslip *version*** (originals → REVERSED) with a lock-to-lock diff in `audit_log`.
- **YTD as derived ledger:** statutory/tax YTD is the immutable Σ over `payslip_lines` for the FY; `deductions.cumulative_ytd` is a recomputable cache only — never the source of truth.
- **Idempotency + single-in-flight:** all run/disbursement mutating endpoints accept an `Idempotency-Key`; additionally a **single-in-flight-run constraint** per cycle prevents two concurrent FINAL (or conflicting) runs.
- **Transactionality:** a payroll run commits as an all-or-nothing transaction per run; partial computation is held in a staging area until validated.
- **Disbursement safety:** bank files are **DSC/HSM digitally signed**; a **bank-side unique batch reference** plus **positive-pay/treasury-debit reconciliation** guard against duplicate disbursement; excluded/failed net pay is parked in a **suspense-hold ledger** so it never leaves the tie-out.
- **Encryption:** bank account numbers, PAN, salary amounts, and **DSC key material** are PII/financial/secret data — encrypted at rest, masked in UI by default, access logged; cryptographic signing keys live in an HSM, never in the application database.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| E01 | `employees` | Shared (M01) | M01 | Employee master (referenced; snapshotted) |
| E02 | `org_units` | Shared | Platform | Org hierarchy (referenced; snapshotted) |
| E03 | `designations` / `pay_scales` | Shared ref | Platform | Designation & pay-scale master (extended by E04) |
| E04 | `pay_matrix_levels` | M10 | M10 | Pay-matrix level/cell (basic-pay progression) |
| E05 | `pay_components` | M10 | M10 | Earning/deduction/**perquisite/rounding** component catalog |
| E06 | `pay_rules` | M10 | M10 | Versioned formula/rule per component (**constrained DSL**) |
| E07 | `rate_tables` | M10 | M10 | DA %, HRA class %, PT slabs (**by state**), tax slabs (effective-dated) |
| E08 | `employee_salary_structures` | M10 | M10 | Per-employee assigned structure (versioned) |
| E09 | `employee_salary_components` | M10 | M10 | Component-level overrides/values per structure version |
| E10 | `payroll_cycles` | M10 | M10 | A pay period + run-type definition (incl. **FNF**) |
| E11 | `payroll_runs` | M10 | M10 | A computation run instance (draft/parallel/final), **snapshot-bound** |
| E12 | `payslips` | M10 | M10 | Per-employee per-run computed result header (**versioned**) |
| E13 | `payslip_lines` | M10 | M10 | Earning/deduction line items — **the YTD source-of-truth ledger** |
| E14 | `deductions` | M10 | M10 | Statutory/voluntary deduction definitions & balances; `cumulative_ytd` cache only |
| E15 | `tax_declarations` | M10 | M10 | Income-tax declaration, proofs, **Form-12B & Form-10E** per FY |
| E16 | `loans_advances` | M10 | M10 | Loan/advance sanction & recovery schedule (**perquisite-linked**) |
| E17 | `loan_repayments` | M10 | M10 | Per-installment recovery ledger |
| E18 | `benefits` | M10 | M10 | Benefit enrolment (medical/LTC/insurance/gratuity/**leave-encashment**) |
| E19 | `benefit_claims` | M10 | M10 | Reimbursement / LTC / medical / **leave-encashment** claims |
| E20 | `arrears` | M10 | M10 | Retrospective revision arrear computations (**dependent cascade**) |
| E21 | `bank_disbursements` | M10 | M10 | Bank file batch + line + ack + **positive-pay + DSC signature** |
| E22 | `payroll_reconciliations` | M10 | M10 | Control totals & variance sign-off (**disbursed+held+failed=net**) |
| E23 | `gratuity_accruals` | M10 | M10 | Period gratuity accrual ledger |
| **E29** | **`statutory_remittances`** | **M10** | **M10** | **Deducted→deposited→matched liability tracker (challan/CIN/penalty)** |
| **E30** | **`fnf_settlements`** | **M10** | **M10** | **Full-and-final separation settlement header & components** |
| **E31** | **`disbursement_holds`** | **M10** | **M10** | **Suspense ledger for excluded/failed net pay (re-disbursement backlog)** |
| **E32** | **`perquisites`** | **M10** | **M10** | **Rule-3 taxable perquisite valuation per employee per FY** |
| **E33** | **`gl_journals`** | **M10** | **M10** | **Payroll cost-journal export object + posting status** |
| **E34** | **`run_input_snapshots`** | **M10** | **M10** | **Immutable as-of snapshot of M01/M03/M06/M09/org per run** |
| **E35** | **`deduction_carryforwards`** | **M10** | **M10** | **Owned, aged backlog of un-recovered (rolled-forward) deductions** |
| E24 | `audit_log` | Shared | Platform | Immutable audit (written) |
| E25 | `documents` | Shared (M13) | M13 | Payslip/Form-16/bank-file object metadata (referenced) |
| E26 | `notifications` | Shared | Platform | Outbound events (written) |
| E27 | `service_register_events` | Shared (M12) | M12 | Pay events appended |
| E28 | `workflow_instances`/`workflow_tasks` | Shared | Platform | Approvals (used) |

### 5.2 Full Field Tables — amended v1 entities (delta only) and new v2 entities

> v1 entities E04–E23 retain their full field tables from v1.0 verbatim except for the deltas below. New entities E29–E35 are specified in full.

#### E05 `pay_components` — amended

Adds to `category` enum: `PERQUISITE`, `ROUNDING_ADJUSTMENT`, `LEAVE_ENCASHMENT`. New field `dsl_grammar_version TEXT NULL` (pins the DSL grammar a FORMULA component was authored against; see FR-01/Appendix 16.7). All other fields unchanged.

#### E07 `rate_tables` — amended

Adds field `state TEXT NULL` (required when `table_type=PT_SLAB`; the employee's state of posting resolves the slab). Uniqueness/non-overlap key for PT becomes `(table_type, state, slab_min, slab_max, effective_from)`. All other fields unchanged.

#### E11 `payroll_runs` — amended

Adds: `snapshot_id UUID FK→run_input_snapshots NULL` (the cross-module as-of snapshot the run computed against); `in_flight_lock_key TEXT NULL` (advisory-lock token; partial unique index enforces one active FINAL run per cycle); `superseded_run_id UUID NULL` (set when a reopen creates a successor run). All other fields unchanged.

#### E12 `payslips` — amended

Adds: `version INT NOT NULL DEFAULT 1`; `superseded_by_payslip_id UUID FK→payslips NULL`; `supersession_reason ENUM(REOPEN, ARREAR_LINK, CORRECTION) NULL`; `snapshot_id UUID FK→run_input_snapshots NULL` (the upstream facts this payslip was computed from — bank account, scheme, org, PAN). `status` enum gains `SUPERSEDED`. On reopen the original moves to REVERSED/SUPERSEDED and a new `version` row is written. All other fields unchanged.

#### E14 `deductions` — amended

`cumulative_ytd` is **demoted to a recomputable cache** (documented: "non-authoritative; YTD truth = Σ `payslip_lines` for the FY"). Adds: `carryforward_id UUID FK→deduction_carryforwards NULL` (link when an amount could not be recovered and rolled forward); `attachment_exemption_basis TEXT NULL` (CPC s.60 exemption note for `COURT_ATTACHMENT`). All other fields unchanged.

#### E15 `tax_declarations` — amended

Adds: `previous_employer_income JSONB NULL` (Form-12B: gross salary, exemptions, TDS already deducted by prior employer for mid-year joiners); `relief_89_1 JSONB NULL` (Form-10E working — arrears spread across FYs and the computed relief); `surcharge NUMERIC(15,2) NULL`; `marginal_relief NUMERIC(15,2) NULL`; `cess NUMERIC(15,2) NULL`; `rebate_87a NUMERIC(15,2) NULL`; `standard_deduction NUMERIC(15,2) NULL`; `perquisite_total NUMERIC(15,2) NULL` (from E32). All other fields unchanged.

#### E16 `loans_advances` — amended

Adds: `is_concessional BOOL NOT NULL DEFAULT false` (true when interest_rate is below the prescribed SBI/Rule-3 reference rate, generating a taxable perquisite); `perquisite_reference_rate NUMERIC(9,4) NULL`; `perquisite_id UUID FK→perquisites NULL` (the perquisite this loan generates). All other fields unchanged.

#### E29 `statutory_remittances`

| Field | Type | Null | Notes |
|---|---|---|---|
| `remittance_id` | UUID PK | N | |
| `scheme` | ENUM | N | TDS, PT, GPF, CPF, NPS, PENSION, INSURANCE |
| `legal_entity_id` | UUID | N | |
| `state` | TEXT | Y | for PT (state of posting) |
| `period_month` | INT | N | liability period |
| `period_year` | INT | N | |
| `financial_year` | TEXT | N | e.g. `FY2026_27` |
| `deducted_total` | NUMERIC(18,2) | N | employee share, derived from `payslip_lines` |
| `employer_total` | NUMERIC(18,2) | Y | employer share (NPS/pension) |
| `remittable_total` | NUMERIC(18,2) | N | deducted + employer |
| `statutory_due_date` | DATE | N | deadline (e.g., 7th of next month for TDS) |
| `challan_no` | TEXT | Y | bank challan number |
| `cin` | TEXT | Y | Challan Identification Number / NPS-CRA ref |
| `deposit_date` | DATE | Y | actual deposit date |
| `deposited_amount` | NUMERIC(18,2) | Y | |
| `late_interest` | NUMERIC(18,2) | Y | u/s 201(1A)/234E computed if deposit_date > due_date |
| `tolerance_variance` | NUMERIC(15,2) | Y | rounding residue vs CRA/GPF (within documented tolerance) |
| `status` | ENUM | N | ACCRUED, SCHEDULED, DEPOSITED, MATCHED, OVERDUE, SHORT_PAID |
| `matched_by` | UUID | Y | certifier |
| `document_id` | UUID FK→documents | Y | challan/receipt scan (M13) |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E30 `fnf_settlements`

| Field | Type | Null | Notes |
|---|---|---|---|
| `fnf_id` | UUID PK | N | |
| `fnf_no` | TEXT unique | N | human key |
| `employee_id` | UUID FK→employees | N | |
| `separation_type` | ENUM | N | SUPERANNUATION, RESIGNATION, VRS, TERMINATION, DEATH, DISMISSAL |
| `last_working_date` | DATE | N | |
| `cycle_id` | UUID FK→payroll_cycles | Y | the FNF run_type cycle |
| `final_month_pay` | NUMERIC(15,2) | N | prorated to LWD |
| `leave_encashment` | NUMERIC(15,2) | Y | from FR-12 |
| `gratuity_amount` | NUMERIC(15,2) | Y | settled value (handoff/confirm with M11) |
| `notice_pay_recovery` | NUMERIC(15,2) | Y | shortfall recovery |
| `loan_settlement` | NUMERIC(15,2) | Y | unrecovered principal + interest |
| `other_recoveries` | NUMERIC(15,2) | Y | disciplinary/overpayment carryforwards |
| `final_tds` | NUMERIC(15,2) | Y | year-end true-up |
| `net_settlement` | NUMERIC(15,2) | N | final single payable (may be negative → recovery) |
| `m11_handoff_ref` | TEXT | Y | pension/terminal-benefit reference |
| `reconciliation_id` | UUID FK→payroll_reconciliations | Y | its own tie-out |
| `status` | ENUM | N | INITIATED, COMPUTED, RECONCILED, APPROVED, PAID, RECOVERY_PENDING, CLOSED |
| `sanctioned_by` | UUID | Y | DDO |
| `approved_by` | UUID | Y | Payroll Mgr (≠ creator) |
| audit fields | — | — | |

#### E31 `disbursement_holds`

| Field | Type | Null | Notes |
|---|---|---|---|
| `hold_id` | UUID PK | N | |
| `run_id` | UUID FK→payroll_runs | N | |
| `disbursement_id` | UUID FK→bank_disbursements | Y | source batch |
| `employee_id` | UUID FK→employees | N | |
| `payslip_id` | UUID FK→payslips | N | |
| `held_amount` | NUMERIC(15,2) | N | net pay parked in suspense |
| `reason` | ENUM | N | INVALID_ACCOUNT, ACCOUNT_FROZEN, ACK_FAILED, MISSING_ACCOUNT, COMPLIANCE_HOLD |
| `age_days` | INT | Y | days in suspense (for ageing report) |
| `redisbursement_run_id` | UUID FK→payroll_runs | Y | off-cycle that cleared it |
| `status` | ENUM | N | HELD, RESOLVING, REDISBURSED, REFUNDED, WRITTEN_BACK |
| `owner_id` | UUID | Y | accountable Payroll Officer |
| audit fields | — | — | |

#### E32 `perquisites`

| Field | Type | Null | Notes |
|---|---|---|---|
| `perquisite_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `financial_year` | TEXT | N | |
| `perq_type` | ENUM | N | CONCESSIONAL_LOAN, INTEREST_FREE_LOAN, RENT_FREE_ACCOMMODATION, CONCESSIONAL_ACCOMMODATION, MOTOR_CAR, OTHER |
| `valuation_method` | ENUM | N | RULE3_LOAN_SBI_RATE, RULE3_LICENSE_FEE, RULE3_FLAT, MANUAL |
| `source_ref` | TEXT | Y | loan_id / accommodation allotment ref |
| `taxable_value` | NUMERIC(15,2) | N | per-FY perquisite value added to taxable income |
| `monthly_value` | NUMERIC(15,2) | Y | spread for monthly TDS |
| `computed_basis` | JSONB | N | inputs (e.g., outstanding × (ref_rate − charged_rate)) |
| `status` | ENUM | N | DRAFT, ACTIVE, REVISED, CLOSED |
| audit fields | — | — | |

#### E33 `gl_journals`

| Field | Type | Null | Notes |
|---|---|---|---|
| `journal_id` | UUID PK | N | |
| `run_id` | UUID FK→payroll_runs | N | |
| `journal_no` | TEXT unique | N | |
| `period_month` | INT | N | |
| `period_year` | INT | N | |
| `lines` | JSONB | N | per-`gl_code` debit/credit (earnings cost, employer contributions, statutory liabilities, net-pay clearing) |
| `total_debit` | NUMERIC(18,2) | N | |
| `total_credit` | NUMERIC(18,2) | N | must equal total_debit |
| `export_document_id` | UUID FK→documents | Y | structured export object |
| `posting_status` | ENUM | N | DRAFT, EXPORTED, POSTED, ACKNOWLEDGED, REJECTED |
| `erp_reference` | TEXT | Y | Finance ERP voucher id |
| `acknowledged_by` | UUID | Y | Finance |
| audit fields | — | — | |

#### E34 `run_input_snapshots`

| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `cycle_id` | UUID FK→payroll_cycles | N | |
| `run_id` | UUID FK→payroll_runs | Y | bound on run start |
| `as_of_timestamp` | TIMESTAMP | N | the cutoff instant the snapshot represents |
| `m01_facts` | JSONB | N | per-employee: employee_id, bank_account (enc), pan, scheme(GPF/NPS), designation, cadre, employment_status, ddo_of_record |
| `m03_facts` | JSONB | N | per-employee paid/LWP/half days as-of |
| `m06_facts` | JSONB | Y | fixation orders effective ≤ cutoff |
| `m09_facts` | JSONB | Y | recovery orders effective ≤ cutoff |
| `org_facts` | JSONB | N | org_unit tree positions as-of |
| `post_cutoff_deferrals` | JSONB | Y | orders arriving after cutoff but before lock, deferred to next cycle/arrears |
| `checksum` | TEXT | N | snapshot hash (determinism evidence) |
| `is_frozen` | BOOL | N | true once run starts |
| audit fields | — | — | append-only |

#### E35 `deduction_carryforwards`

| Field | Type | Null | Notes |
|---|---|---|---|
| `carryforward_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `deduction_id` | UUID FK→deductions | Y | source deduction |
| `source_type` | ENUM | N | STATUTORY, COURT_ATTACHMENT, DISCIPLINARY, OVERPAYMENT, LOAN, VOLUNTARY |
| `original_amount` | NUMERIC(15,2) | N | amount that could not be recovered this cycle |
| `recovered_to_date` | NUMERIC(15,2) | N | |
| `outstanding` | NUMERIC(15,2) | N | original − recovered |
| `first_deferred_cycle` | TEXT | N | ageing start |
| `age_days` | INT | Y | for backlog report |
| `priority` | INT | N | recovery priority (see Appendix 16.3) |
| `owner_id` | UUID | Y | accountable officer |
| `status` | ENUM | N | OPEN, PARTIALLY_RECOVERED, CLEARED, WAIVED, WRITTEN_OFF |
| audit fields | — | — | |

### 5.3 Relationship Map

```
employees (M01) 1───n employee_salary_structures 1───n employee_salary_components ──n─1 pay_components 1───n pay_rules ──n─1 rate_tables
pay_matrix_levels 1───n employee_salary_structures
payroll_cycles 1───n payroll_runs 1───n payslips 1───n payslip_lines ──n─1 pay_components
payroll_runs n───1 run_input_snapshots   (snapshot the run computed against)
payroll_runs 1───1 payroll_reconciliations
payroll_runs 1───n bank_disbursements 1───n disbursement_holds   (suspense for excluded/failed net)
payroll_runs 1───1 gl_journals   (cost-journal export + posting status)
payslips 1───0..1 payslips (superseded_by — reopen versioning)
employees 1───n deductions / tax_declarations / loans_advances / benefits / arrears / gratuity_accruals / perquisites / fnf_settlements / deduction_carryforwards
loans_advances 1───0..1 perquisites   (concessional-loan perquisite)
benefits 1───n benefit_claims   (incl. LEAVE_ENCASHMENT)
payslip_lines n───1 arrears  (arrear lines reference their source arrear)
payslip_lines ──aggregate──> statutory_remittances (deducted_total derived from the FY line ledger)
payslip_lines ──aggregate──> YTD (tax/statutory year-to-date = Σ lines for FY; deductions.cumulative_ytd is a cache)
deductions 1───0..1 deduction_carryforwards   (un-recovered rolled-forward backlog)
fnf_settlements n───1 payroll_cycles (run_type=FNF);  fnf ──handoff──> M11
payslips n───1 documents (M13);  pay events ──> service_register_events (M12);  every mutation ──> audit_log
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `pay_scales` | M01/Platform | M10 (snapshotted) | — (M10 reads only) |
| `pay_matrix_levels`…`gratuity_accruals` (E04-E23) | M10 | M11, M12, M14 | M10 |
| `statutory_remittances`, `fnf_settlements`, `disbursement_holds`, `perquisites`, `gl_journals`, `run_input_snapshots`, `deduction_carryforwards` (E29-E35) | M10 | M11 (FnF/gratuity), M14 (analytics), Finance (GL/remittance) | M10 |
| `documents` | M13 | M10 (payslip/Form-16/bank/challan refs) | M10 (creates refs) |
| `service_register_events` | M12 | M10 | M10 (appends pay events) |
| `notifications`, `audit_log`, `workflow_*` | Platform | M10 | M10 |

### 5.5 Enum Catalog (delta from v1)

| Enum | Values |
|---|---|
| pay_component.category | BASIC, ALLOWANCE, SPECIAL_PAY, STATUTORY_DEDUCTION, VOLUNTARY_DEDUCTION, LOAN_RECOVERY, RECOVERY, **PERQUISITE, ROUNDING_ADJUSTMENT, LEAVE_ENCASHMENT** |
| rate_table.table_type | DA_RATE, HRA_CLASS, PT_SLAB (**+state key**), TAX_SLAB, NPS_RATE, GPF_RATE |
| cycle.run_type | REGULAR, SUPPLEMENTARY, ARREARS, OFF_CYCLE, BONUS, **FNF** |
| run.run_mode | DRAFT, PARALLEL_WHATIF, FINAL |
| payslip.status | DRAFT, FINAL, PUBLISHED, REVERSED, **SUPERSEDED** |
| payslip.supersession_reason | REOPEN, ARREAR_LINK, CORRECTION |
| disbursement.status | DRAFT, VALIDATED, SIGNED, TRANSMITTED, RECONCILED, REJECTED, **SUSPECTED_PROCESSED** |
| disbursement.file_format | NACH, FIXED_WIDTH (**active**); ISO20022, CUSTOM (**DEFERRED**) |
| disbursement.ack_status | NOT_SENT, SENT, ACK_SUCCESS, ACK_PARTIAL, ACK_FAILED, **POSITIVE_PAY_CONFIRMED** |
| hold.reason | INVALID_ACCOUNT, ACCOUNT_FROZEN, ACK_FAILED, MISSING_ACCOUNT, COMPLIANCE_HOLD |
| hold.status | HELD, RESOLVING, REDISBURSED, REFUNDED, WRITTEN_BACK |
| remittance.scheme | TDS, PT, GPF, CPF, NPS, PENSION, INSURANCE |
| remittance.status | ACCRUED, SCHEDULED, DEPOSITED, MATCHED, OVERDUE, SHORT_PAID |
| perquisite.perq_type | CONCESSIONAL_LOAN, INTEREST_FREE_LOAN, RENT_FREE_ACCOMMODATION, CONCESSIONAL_ACCOMMODATION, MOTOR_CAR, OTHER |
| gl_journal.posting_status | DRAFT, EXPORTED, POSTED, ACKNOWLEDGED, REJECTED |
| fnf.separation_type | SUPERANNUATION, RESIGNATION, VRS, TERMINATION, DEATH, DISMISSAL |
| fnf.status | INITIATED, COMPUTED, RECONCILED, APPROVED, PAID, RECOVERY_PENDING, CLOSED |
| carryforward.status | OPEN, PARTIALLY_RECOVERED, CLEARED, WAIVED, WRITTEN_OFF |
| benefit/claim.type (+) | …, **LEAVE_ENCASHMENT** |

(All v1 enums not listed here are unchanged.)

### 5.6 Data Integrity Rules (v2 — amended #4, #9, #13; added #14–#18)

1. **Earning/deduction identity:** for each payslip, `gross_earnings = Σ(lines where type=EARNING)`, `total_deductions = Σ(lines where type=DEDUCTION)`, `net_pay = gross_earnings − total_deductions`, `net_pay ≥ 0`. **A `ROUNDING_ADJUSTMENT` line absorbs `Σ(rounded)−round(Σ)` so the identity holds to the rupee.**
2. **Run totals:** `payroll_runs.gross_total/deduction_total/net_total` equal the sums of their (non-superseded) payslips; enforced at commit.
3. **Reconciliation gate:** a run cannot move to APPROVED unless a `payroll_reconciliations` row exists with `signoff_status=SIGNED_OFF` and zero unexplained variance.
4. **Bank-file integrity (REDEFINED — R2):** `Σ disbursed(net via bank file) + Σ held(disbursement_holds) + Σ failed(ack_failed) = payroll_runs.net_total` for the run. **No net pay leaves the tie-out silently;** excluded/invalid-account net is parked in `disbursement_holds` and re-disbursed via off-cycle. `record_count` = payees with net>0 *and* a valid account.
5. **Immutability & versioning:** when `payroll_runs.status=LOCKED`, all child payslips/lines are read-only (`is_immutable=true`); any change requires a new arrear/supplementary/off-cycle run **or a reopen that creates a new payslip `version` (original→SUPERSEDED/REVERSED)**.
6. **Effective-dating:** only one ACTIVE `employee_salary_structures` version per employee per date; overlapping effective ranges rejected.
7. **Statutory caps:** GPF/NPS/gratuity/PT/perquisite respect configured caps; computed amounts cannot exceed statutory ceilings.
8. **Loan ledger:** `Σ loan_repayments.principal_component = loans_advances.principal` at CLOSED; `outstanding_principal` monotonically non-increasing.
9. **YTD derivation (REDEFINED — R3):** statutory/tax YTD = immutable `Σ payslip_lines` for the FY over the **surviving (non-superseded)** payslip versions across regular+arrears+off-cycle. `deductions.cumulative_ytd` is a cache that must equal this derivation after any recompute; Form-16/Form-24Q derive from the ledger, guaranteeing tie-out and safe reopen.
10. **SoD:** `payroll_runs.approved_by ≠ created_by`; `bank_disbursements.signed_by ≠ run creator`; **positive-pay confirmer ≠ transmitter**; `fnf_settlements.approved_by ≠ created_by`.
11. **One structure snapshot per payslip:** `payslips.structure_version_ref` points to the structure version effective on the cycle period; **`payslips.snapshot_id` points to the run's frozen cross-module snapshot.**
12. **FK integrity & soft delete:** an employee with any non-CLOSED loan, active deduction, open carryforward, or unsettled gratuity/FnF cannot be hard-deleted; soft delete only.
13. **Single-in-flight run (NEW — R11):** a partial unique index / advisory lock permits at most one active (QUEUED/RUNNING/COMPLETED-unlocked) FINAL run per `cycle_id`; a second concurrent attempt fails with `RUN_ALREADY_IN_FLIGHT`.
14. **Remittance reconciliation (NEW — R4):** for each scheme/period, `statutory_remittances.deducted_total = Σ payslip_lines` for that scheme/period; status reaches MATCHED only when `deposited_amount` ties to `remittable_total` within the documented tolerance; OVERDUE when `today > statutory_due_date` and status < DEPOSITED; `late_interest` computed for late deposits.
15. **GL balance (NEW — R4):** `gl_journals.total_debit = total_credit`; the net-pay clearing line equals `Σ disbursed + Σ held`.
16. **Snapshot determinism (NEW — R6):** a FINAL run's `snapshot.checksum` is recorded; re-running against the same frozen snapshot reproduces identical payslips.
17. **Perquisite into tax (NEW — R5):** every ACTIVE `perquisites.taxable_value` for the FY is included in `tax_declarations.perquisite_total` and in projected taxable income; a concessional/interest-free loan (E16 `is_concessional=true`) must have a linked `perquisites` row.
18. **Carryforward conservation (NEW — R8):** `deduction_carryforwards.outstanding = original_amount − recovered_to_date ≥ 0`; recovery across cycles never exceeds the original ordered/owed amount.

### 5.7 Sample Data (new/amended entities; v1 sample rows retained)

**rate_tables (PT by state)**

| table_type | state | key | value_numeric | slab_min | slab_max | financial_year |
|---|---|---|---|---|---|---|
| PT_SLAB | KARNATAKA | 15001-99999 | 200.00 | 15001.00 | 99999.00 | FY2026_27 |
| PT_SLAB | MAHARASHTRA | 10001-99999 | 200.00 | 10001.00 | 99999.00 | FY2026_27 |
| PT_SLAB | WEST_BENGAL | 40001-60000 | 130.00 | 40001.00 | 60000.00 | FY2026_27 |

**statutory_remittances**

| scheme | period | financial_year | deducted_total | employer_total | statutory_due_date | challan_no | cin | deposit_date | late_interest | status |
|---|---|---|---|---|---|---|---|---|---|---|
| TDS | 06-2026 | FY2026_27 | 24500000.00 | — | 2026-07-07 | CH-88213 | 0510072026088213 | 2026-07-06 | 0.00 | MATCHED |
| NPS | 06-2026 | FY2026_27 | 8856000.00 | 12398400.00 | 2026-07-07 | — | — | — | — | ACCRUED |
| PT | 06-2026 | FY2026_27 | 1200000.00 | — | 2026-07-20 | — | — | — | — | SCHEDULED |

**fnf_settlements**

| fnf_no | employee_id | separation_type | last_working_date | final_month_pay | leave_encashment | gratuity_amount | loan_settlement | final_tds | net_settlement | status |
|---|---|---|---|---|---|---|---|---|---|---|
| FNF-2026-0007 | e-1001 | SUPERANNUATION | 2026-06-30 | 53420.00 | 1326000.00 | 2000000.00 | -1339000.00 | 142000.00 | 1898420.00 | APPROVED |
| FNF-2026-0011 | e-2050 | RESIGNATION | 2026-06-15 | 21800.00 | 0.00 | 0.00 | -6000.00 | 0.00 | 15800.00 | PAID |

**disbursement_holds**

| run_id | employee_id | held_amount | reason | age_days | status |
|---|---|---|---|---|---|
| run-9001 | e-3120 | 48230.00 | INVALID_ACCOUNT | 4 | HELD |
| run-9001 | e-3175 | 51990.00 | ACCOUNT_FROZEN | 4 | RESOLVING |

**perquisites**

| employee_id | financial_year | perq_type | valuation_method | source_ref | taxable_value | monthly_value | status |
|---|---|---|---|---|---|---|---|
| e-1001 | FY2026_27 | CONCESSIONAL_LOAN | RULE3_LOAN_SBI_RATE | LN-2026-0007 | 40170.00 | 3347.50 | ACTIVE |
| e-1002 | FY2026_27 | RENT_FREE_ACCOMMODATION | RULE3_LICENSE_FEE | ALLOT-7781 | 53880.00 | 4490.00 | ACTIVE |

**gl_journals (lines excerpt)**

| journal_no | period | total_debit | total_credit | posting_status | erp_reference |
|---|---|---|---|---|---|
| GLJ-2026-06-001 | 06-2026 | 184500000.00 | 184500000.00 | ACKNOWLEDGED | ERP-VCH-55012 |

**deduction_carryforwards**

| employee_id | source_type | original_amount | recovered_to_date | outstanding | first_deferred_cycle | age_days | status |
|---|---|---|---|---|---|---|---|
| e-4400 | OVERPAYMENT | 60000.00 | 15000.00 | 45000.00 | 2026-04-REGULAR | 90 | PARTIALLY_RECOVERED |
| e-4455 | COURT_ATTACHMENT | 12000.00 | 0.00 | 12000.00 | 2026-06-REGULAR | 1 | OPEN |

**run_input_snapshots (header excerpt)**

| snapshot_id | cycle_id | as_of_timestamp | checksum | is_frozen |
|---|---|---|---|---|
| snap-7781 | 2026-06-REGULAR | 2026-06-25T18:30:00Z | sha256:4f9c… | true |

---

## 6. Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table (Components / Backend Flow / Data Operations / Validation / Authorization / State Changes & Side Effects / Failure Handling / Dependencies / Test Guidance). v2 retains all 18 v1 FRs (amended where the Council required) and adds **FR-19…FR-22**.

---

### FR-M10-01 — Pay Component & Rules Engine Configuration (constrained, versioned DSL)

- **Module:** M10-F01 / M10-F02
- **Primary Role(s):** System Administrator (config), Payroll Manager (approve)
- **User Story:** As a System Administrator, I want to define earning/deduction/perquisite components and their versioned computation rules — against a **pinned, independently-versioned DSL grammar** — so that payroll math is configurable without code changes, fully auditable, and the formula escape hatch is bounded and safe.
- **Description:** Maintain the `pay_components` catalog and `pay_rules` (formula DSL, calc method, eligibility, rounding, computation order, effective dates). Rules are versioned; activating a new version retires the prior version's effective range. **The safe expression evaluator (Appendix 16.7) pins decimal semantics (fixed-point `NUMERIC`, no float), null-propagation (any null operand → rule exception, never silent 0), operator precedence, and a whitelisted token/function set; the DSL grammar carries its own `dsl_grammar_version`, versioned independently of rule versions.** The `FORMULA` escape hatch is restricted to vetted, property-tested expressions; arbitrary code execution is prohibited.
- **Acceptance Criteria:**
  - AC1: A component can be created with type, category (incl. `PERQUISITE`, `ROUNDING_ADJUSTMENT`, `LEAVE_ENCASHMENT`), calc method, taxable flag, and display order.
  - AC2: A rule version with an invalid expression (unknown reference, unbalanced parentheses, disallowed token, **ambiguous precedence, or a null-yielding reference**) is rejected with a precise error and line/column.
  - AC3: Activating a rule version sets `effective_to` on the prior ACTIVE version to one day before the new `effective_from`; no two ACTIVE versions overlap.
  - AC4: Computation order is unique within an effective window; duplicate orders rejected; **forward references to not-yet-computed components rejected (no circular refs).**
  - AC5: All changes require Payroll Manager approval (maker-checker) before becoming ACTIVE.
  - AC6: **A FORMULA component records the `dsl_grammar_version` it was authored against; a grammar upgrade re-validates (or quarantines) existing FORMULA rules before they run.**
- **Business Rules:**
  - BR1: A component referenced by any active employee structure cannot be deleted; only deactivated.
  - BR2: DEDUCTION components flagged `is_statutory=true` cannot be overridden below the statutory computation by a Payroll Officer.
  - BR3: Formula references are resolved in `computation_order`; forward references rejected.
  - BR4: **DSL property tests (decimal rounding, null propagation, precedence, division-by-zero) must pass before a FORMULA rule can be activated.**
- **Data Model References:** `pay_components`, `pay_rules`, `rate_tables`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/components` | create component |
| POST | `/api/v1/payroll/components/{id}/rules` | add rule version |
| POST | `/api/v1/payroll/rules/{id}:activate` | activate (checker) |
| GET | `/api/v1/payroll/components` | list (paginated) |
| GET | `/api/v1/payroll/dsl/grammar` | current DSL grammar version & token set |

- **UI Behavior Notes:** Rule editor with live syntax validation, a "test against sample employee" panel showing the evaluated trace, a version timeline, and a **DSL-grammar badge**. Activation button disabled for makers.
- **Edge Cases:** Circular references; activating a rule whose `rate_table` has no effective row for the period; deactivating a component mid-FY; **a grammar-version upgrade invalidating an in-use FORMULA rule.**
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RuleConfigController`, `ExpressionParser` (grammar-versioned), `RuleVersionService`, `ComponentRepository`, `DslPropertyTestRunner` |
| Backend Flow | Validate payload → parse expression to AST against pinned grammar (whitelist, decimal/null/precedence rules) → static-check references & order → run property tests → persist DRAFT → on activate, run SoD + checker check, close prior version, set ACTIVE in a transaction |
| Data Operations | INSERT component/rule; UPDATE prior rule `effective_to`; transactional |
| Validation | Whitelisted tokens; pinned decimal/null/precedence; reference existence; order uniqueness; effective-range non-overlap; grammar-version pin |
| Authorization | SysAdmin create; Payroll Manager activate; Auditor read |
| State Changes & Side Effects | rule.status DRAFT→ACTIVE; prior ACTIVE→RETIRED; audit_log; cache invalidation of rule set |
| Failure Handling | Parse error → 400 `RULE_EXPRESSION_INVALID`; overlap → 409 `RULE_VERSION_OVERLAP`; failed property test → 400 `DSL_PROPERTY_TEST_FAILED` |
| Dependencies | rate_tables (FR-02), workflow engine |
| Test Guidance | Property-test parser (malicious/edge/decimal/null/precedence expressions); non-overlap invariant; SoD; grammar-upgrade re-validation |

---

### FR-M10-02 — Pay Scale / Matrix & Statutory Rate Table Management (PT by state)

- **Module:** M10-F01
- **Primary Role(s):** System Administrator, Payroll Manager
- **User Story:** As an Administrator, I want to maintain pay-matrix levels and effective-dated statutory rate tables (DA%, HRA class %, **PT slabs keyed by state**, tax slabs, GPF/NPS rates) so that revisions issued by government notifications apply automatically from their effective date, including for multi-state employees.
- **Description:** CRUD for `pay_matrix_levels` and `rate_tables`, all effective-dated. **PT slabs carry a `state` dimension; resolution uses the employee's state of posting (from the cross-module snapshot).** A DA revision is entered once and applies to every eligible employee from `effective_from` (including retrospectively, triggering arrears via FR-10).
- **Acceptance Criteria:**
  - AC1: A new DA rate with a past `effective_from` is accepted and flagged "retrospective — will generate arrears".
  - AC2: Two overlapping effective rows for the same `table_type/state/key/regime/FY` are rejected.
  - AC3: Tax slabs require `regime` and `financial_year`; PT slabs require `state`, `slab_min`, `slab_max`.
  - AC4: Changes are versioned and audited; no in-place edit of a row already used in a LOCKED run (a new effective row is created instead).
  - AC5: **PT resolution for an employee returns the slab for the employee's snapshotted state of posting; a missing state→slab mapping raises a precise exception.**
- **Business Rules:**
  - BR1: HRA class % keyed by `city_class` (X/Y/Z).
  - BR2: A rate row used by any locked payslip is immutable; corrections are new effective rows.
  - BR3: Effective dates align to the 1st of a month unless an explicit mid-month proration policy is enabled.
  - BR4: **PT is resolved by state of posting, not legal-entity default; an employee transferred across states mid-year uses the destination state's slab from the effective transfer date.**
- **Data Model References:** `rate_tables` (incl. `state`), `pay_matrix_levels`, `pay_scales` (ref), `arrears` (downstream), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/rate-tables` | add effective-dated rate (PT requires `state`) |
| GET | `/api/v1/payroll/rate-tables?type=PT_SLAB&state=KARNATAKA&date=` | resolve rate as-of |
| POST | `/api/v1/payroll/pay-matrix` | add matrix level/cell |

- **UI Behavior Notes:** Effective-dated grid with "as-of date" + **state selector**; retrospective-entry warning banner; side-by-side compare of old vs new rate.
- **Edge Cases:** DA increase notified after the cycle is locked → arrears next cycle; pay-matrix cell deletion when referenced by a structure; mid-month DA effective date; **employee with no PT-state mapping; inter-state transfer mid-month.**
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RateTableController`, `EffectiveDateResolver`, `PayMatrixService`, `PtStateResolver` |
| Backend Flow | Validate effective range → check non-overlap (incl. state) → persist → if `effective_from` < current open cycle start, enqueue arrears candidate scan |
| Data Operations | INSERT rate row; never UPDATE locked-referenced rows |
| Validation | Non-overlap by (type,state,key,regime,FY); required fields by table_type; immutability vs locked runs |
| Authorization | SysAdmin write; Payroll Mgr approve; Auditor read |
| State Changes & Side Effects | New rate active; arrears scan enqueued; audit_log |
| Failure Handling | Overlap → 409 `RATE_OVERLAP`; locked-ref edit → 409 `RATE_LOCKED_IMMUTABLE`; missing PT state → 422 `PT_STATE_NOT_MAPPED` |
| Dependencies | FR-10 arrears engine, FR-22 snapshot (state of posting) |
| Test Guidance | Resolver boundary dates; retrospective trigger; PT-by-state resolution; inter-state transfer |

---

### FR-M10-03 — Employee Salary Structure Assignment & Versioning

- **Module:** M10-F03
- **Primary Role(s):** Payroll Officer (maker), Payroll Manager (checker), HR Admin (request)
- **User Story:** As a Payroll Officer, I want to assign and version each employee's salary structure (pay level, city class, component set, overrides) so that pay is derived correctly and every change is effective-dated and auditable.
- **Description:** Bind an employee to a `pay_matrix_level` and component set, producing `employee_salary_structures` + `employee_salary_components`. Each change (increment, revision, override) creates a new version; the prior version is SUPERSEDED. Overrides require a reason. Scheme (GPF vs NPS) is auto-attached by DOJ.
- **Acceptance Criteria:**
  - AC1: Creating a new version supersedes the prior ACTIVE version with contiguous effective ranges (no gap/overlap).
  - AC2: A FIXED_OVERRIDE component requires `override_amount` and `override_reason`.
  - AC3: Structure changes route through maker-checker before becoming ACTIVE.
  - AC4: A change with `effective_from` in a LOCKED period is rejected — handled as an arrear (FR-10).
- **Business Rules:** BR1: Exactly one ACTIVE version per employee at any date. BR2: City class drives HRA. BR3: Statutory deduction components auto-attached by scheme (GPF vs NPS per joining date).
- **Data Model References:** `employee_salary_structures`, `employee_salary_components`, `pay_matrix_levels`, `pay_components`, `deductions`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/employees/{id}/structures` | create new version |
| GET | `/api/v1/payroll/employees/{id}/structures` | version history |
| POST | `/api/v1/payroll/structures/{id}:approve` | checker approve |

- **UI Behavior Notes:** Structure builder showing auto-resolved components vs overrides; effective-date timeline; diff of versions; HRA auto-updates when city class changes.
- **Edge Cases:** GPF vs NPS by DOJ cutoff; mid-month transfer changing city class/**state**; override exceeding sanity bounds.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StructureController`, `StructureVersionService`, `SchemeResolver` |
| Backend Flow | Build component set from rules + scheme → apply overrides → validate → create version → close prior → maker-checker → ACTIVE |
| Data Operations | INSERT structure + components; UPDATE prior `effective_to`/status; transactional |
| Validation | Contiguity; override reason; locked-period guard; scheme correctness |
| Authorization | Payroll Officer create; Payroll Mgr approve |
| State Changes & Side Effects | new ACTIVE version; SR-relevant pay change emits M12 event on finalisation; audit_log |
| Failure Handling | Locked period → 409 `STRUCTURE_PERIOD_LOCKED`; overlap → 409 `STRUCTURE_OVERLAP` |
| Dependencies | FR-01/02, M06 (pay-fixation source), FR-10 |
| Test Guidance | Version contiguity; GPF/NPS by DOJ; override audit |

---

### FR-M10-04 — Monthly Payroll Run Engine (single-in-flight, rounding-balanced)

- **Module:** M10-F04
- **Primary Role(s):** Payroll Officer (run), Payroll Manager (oversee)
- **User Story:** As a Payroll Officer, I want to execute the monthly payroll run that computes every eligible employee's pay deterministically from a frozen cross-module snapshot so that gross, deductions, and net are derived from versioned rules and snapshotted inputs, with no concurrent conflicting run.
- **Description:** Orchestrates the cycle: freeze inputs at cutoff **and take the cross-module snapshot (FR-22)**, gather structure snapshots + leave/LWP (FR-05) + statutory deductions (FR-06) + loan recoveries (FR-08) + arrears (FR-10) + perquisites (FR-21), evaluate rules in computation order, **append a `ROUNDING_ADJUSTMENT` line to absorb residue**, persist `payslips` + `payslip_lines` with full `calc_trace`. Runs in a staging area first; the run is a single atomic commit. Supports DRAFT and FINAL modes. **A single-in-flight constraint prevents two concurrent FINAL runs per cycle.**
- **Acceptance Criteria:**
  - AC1: A draft run produces per-employee results with full computation trace and a quarantine list of failures (no partial commit).
  - AC2: Re-running the same cycle with unchanged inputs **and the same frozen snapshot** yields identical results (determinism).
  - AC3: Employees with computation errors are isolated; the run reports them without aborting valid computations.
  - AC4: `net_pay ≥ 0`; **un-recovered amounts roll forward into `deduction_carryforwards` (owned backlog), not silently dropped.**
  - AC5: Run totals equal the sum of payslips at commit; the rounding-adjustment line makes identities tie to the rupee.
  - AC6: **A second FINAL run attempt for a cycle with one in flight fails with `RUN_ALREADY_IN_FLIGHT`.**
- **Business Rules:**
  - BR1: Only ACTIVE employees in the **snapshot** scope on the pay date are included (joiners/leavers prorated).
  - BR2: A FINAL run requires the cycle to be INPUT_LOCKED and a frozen snapshot to exist.
  - BR3: Computation uses rate tables effective on the period, not "today".
  - BR4: **Suspended employees receive subsistence allowance only (Appendix 16.6): initial percentage of pay, escalating after a configured number of months; dies-non periods produce no pay and no qualifying service.**
  - BR5: **Mid-month inter-DDO transfer uses the "DDO-of-record for the transfer month" (Appendix 16.8) unless split-period payslips are enabled.**
- **Data Model References:** `payroll_cycles`, `payroll_runs` (`snapshot_id`, `in_flight_lock_key`), `payslips`, `payslip_lines`, `run_input_snapshots`, `employee_salary_structures`, `deductions`, `deduction_carryforwards`, `loans_advances`, `arrears`, `perquisites`, `rate_tables`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` | start a run (mode in body; acquires in-flight lock) |
| GET | `/api/v1/payroll/runs/{id}` | run status & totals |
| GET | `/api/v1/payroll/runs/{id}/exceptions` | per-employee failures |
| POST | `/api/v1/payroll/runs/{id}:cancel` | cancel draft (releases lock) |

- **UI Behavior Notes:** Run console with progress (computed/total), live totals, exception drill-down, per-employee trace viewer, **snapshot reference & checksum**, and an **in-flight lock indicator**. FINAL run gated behind reconciliation.
- **Edge Cases:** Mid-month joiner/leaver proration; suspended employee (subsistence); dies-non; missing structure; division-by-zero; very large cohort batch; **inter-DDO transfer month; concurrent FINAL attempt.**
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RunOrchestrator`, `ComputationEngine`, `InputAggregator`, `SnapshotBinder`, `RoundingBalancer`, `StagingRepository`, `InFlightLockManager`, async worker/queue |
| Backend Flow | Acquire in-flight lock → lock inputs → bind frozen snapshot → aggregate inputs (incl. perquisite monthly value) → compute components in order into staging → append rounding-adjustment → validate totals/identities → atomic commit payslips+lines+run totals → roll un-recovered to carryforwards |
| Data Operations | Bulk INSERT staging; transactional move to `payslips`/`payslip_lines`; UPDATE run totals; INSERT carryforwards |
| Validation | Identity equations; net≥0; scope eligibility; rate resolution; snapshot present; in-flight uniqueness |
| Authorization | Payroll Officer (own org scope); Manager read |
| State Changes & Side Effects | run QUEUED→RUNNING→COMPLETED/FAILED; cycle OPEN→COMPUTING→COMPUTED; audit_log; notifications |
| Failure Handling | Per-employee error → quarantine + `error_summary`; engine fault → run FAILED, no commit; concurrent FINAL → 409 `RUN_ALREADY_IN_FLIGHT`; idempotent restart |
| Dependencies | FR-01..03, 05, 06, 08, 10, 21, 22 |
| Test Guidance | Determinism vs frozen snapshot; proration; subsistence/dies-non; quarantine isolation; rounding tie-out; in-flight lock; large-batch perf; rollback on mid-commit failure |

---

### FR-M10-05 — Attendance & Leave (LWP) Input Integration (subsistence/dies-non)

- **Module:** M10-F05
- **Primary Role(s):** Payroll Officer, HR Admin
- **User Story:** As a Payroll Officer, I want to ingest paid/unpaid day counts and Leave-Without-Pay (LWP) from M03 **as-of the cutoff snapshot** so that loss-of-pay deductions, subsistence, and dies-non are computed accurately.
- **Description:** Pull approved attendance/leave for the cycle from M03 **into the run snapshot (FR-22)** (paid days, LWP days, half-days, unauthorised absence). Compute LWP loss-of-pay (per-day rate = monthly pay / days-in-month or /30 per policy). **Subsistence (suspended employees) and dies-non (no pay/no service) are computed per Appendix 16.6.** Inputs freeze at cutoff; late changes route to arrears.
- **Acceptance Criteria:**
  - AC1: LWP days reduce pay using the configured per-day basis; the reduction shows as a payslip line.
  - AC2: Paid_days + lwp_days reconcile to the period's calendar days for full-month employees.
  - AC3: Attendance received after cutoff is excluded (snapshot frozen) and queued for arrears/recovery.
  - AC4: Unauthorised absence beyond a threshold flags an exception (link to M09 if dies-non).
  - AC5: **A suspended employee is paid subsistence only; a dies-non period yields zero pay and zero qualifying service.**
- **Business Rules:** BR1: Per-day basis configurable (actual days vs 30-day). BR2: Half-pay leave reduces eligible components per policy. BR3: Joiner/leaver proration uses actual paid days. BR4: **Subsistence base and escalation, and dies-non, per Appendix 16.6.**
- **Data Model References:** `payslips` (paid_days/lwp_days), `payslip_lines` (LWP/subsistence line), `run_input_snapshots` (m03_facts), M03 attendance (read), `arrears` (late inputs).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/cycles/{id}/attendance-inputs` | fetched M03 inputs (from snapshot) |
| POST | `/api/v1/payroll/cycles/{id}/attendance-inputs:refresh` | re-pull before cutoff |

- **UI Behavior Notes:** Attendance input grid (employee × paid/LWP/half/subsistence), exceptions highlighted, "refresh from M03" with cutoff/snapshot lock indicator.
- **Edge Cases:** Retrospective leave regularisation post-lock; dies-non vs LWP; overlapping leave records; leave encashment interplay (FR-12).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AttendanceInputAdapter` (M03 client), `LWPCalculator`, `SubsistenceCalculator` |
| Backend Flow | Fetch approved M03 records for period into snapshot → map to paid/LWP/half/dies-non → compute per-day deduction or subsistence → feed run engine |
| Data Operations | Stage attendance inputs in snapshot keyed to cycle; write LWP/subsistence lines during run |
| Validation | Day-count reconciliation; cutoff/snapshot enforcement; threshold checks |
| Authorization | Payroll Officer scope |
| State Changes & Side Effects | LWP/subsistence line; exception flags; arrears candidate for late records |
| Failure Handling | M03 unavailable → 503 `UPSTREAM_UNAVAILABLE`, retry; mismatch → exception list |
| Dependencies | M03, FR-04, FR-10, FR-22 |
| Test Guidance | Per-day basis variants; proration; post-cutoff handling; subsistence escalation; dies-non path |

---

### FR-M10-06 — Statutory Deductions Computation (GPF/PF, NPS, PT-by-state, Pension, Insurance)

- **Module:** M10-F06
- **Primary Role(s):** Payroll Officer, Payroll Manager
- **User Story:** As a Payroll Officer, I want statutory deductions computed automatically per scheme and slab so that GPF/PF, NPS, **professional tax by state of posting**, pension contribution, and insurance are accurate and remittable, with YTD derived from the immutable line ledger.
- **Description:** For each employee, compute scheme-based deductions: GPF/CPF (% of basic, with voluntary top-up), NPS (employee 10% + employer 14% of basic+DA), **professional tax (state slab resolved by snapshotted state of posting)**, pension/insurance contributions, court attachments. **YTD is the derived Σ over `payslip_lines` for the FY (data-integrity rule #9); `deductions.cumulative_ytd` is only a recomputable cache.** Feeds the remittance tracker (FR-19).
- **Acceptance Criteria:**
  - AC1: NPS computes both employee and employer contributions; both appear (employer as info/cost line feeding the GL journal).
  - AC2: PT applies the correct **state** slab for the employee's gross within the month.
  - AC3: Statutory caps are enforced (e.g., GPF subscription limits).
  - AC4: **YTD figures recompute from the line ledger and remain correct across regular+arrears+off-cycle and after a reopen (no scalar drift).**
  - AC5: **Court-attachment deductions respect the CPC s.60 statutory exemption independently of the flat net-pay floor (FR-09); shortfall rolls into `deduction_carryforwards`.**
- **Business Rules:** BR1: GPF for pre-cutoff joiners; NPS for post-cutoff joiners (scheme by DOJ). BR2: Court-attachment deductions take legal priority within net-pay protection and their own exemption. BR3: Employer NPS/pension contributions are costs, not employee deductions. BR4: **PT resolved by state of posting (FR-02/BR4).** BR5: **Subsistence-only employees compute statutory deductions on the subsistence base per Appendix 16.6.**
- **Data Model References:** `deductions` (cache YTD), `payslip_lines` (YTD truth), `rate_tables` (PT-by-state/NPS/GPF), `deduction_carryforwards`, `statutory_remittances` (downstream), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/employees/{id}/deductions` | list deductions + derived YTD |
| POST | `/api/v1/payroll/employees/{id}/deductions` | add voluntary/manual deduction |
| GET | `/api/v1/payroll/runs/{id}/statutory-summary` | run-level statutory totals (feeds FR-19) |

- **UI Behavior Notes:** Deduction panel per employee showing scheme, rate, **derived YTD (with "recomputed from ledger" provenance)**; voluntary GPF top-up; employer-contribution info card; PT-state indicator.
- **Edge Cases:** Mid-year scheme migration; PT slab boundary; **inter-state transfer changing PT**; court attachment exceeding protected net (carryforward); NPS crossing basic+DA threshold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StatutoryDeductionService`, `SchemeResolver`, `SlabResolver` (state-aware), `YtdLedgerDeriver` |
| Backend Flow | Resolve scheme & PT state → compute each statutory line via rate tables → apply caps & priority & CPC exemption → write lines → recompute cache YTD from ledger |
| Data Operations | INSERT deduction lines; recompute `cumulative_ytd` cache from `payslip_lines`; INSERT carryforwards on shortfall |
| Validation | Cap enforcement; state-slab selection; net-protection & attachment exemption; YTD = Σ ledger |
| Authorization | Payroll Officer/Manager |
| State Changes & Side Effects | deduction lines; cache YTD refresh; cost lines for employer share; carryforward rows |
| Failure Handling | Missing rate row → run exception `RATE_NOT_FOUND`; missing PT state → `PT_STATE_NOT_MAPPED`; cap breach → clamp + flag |
| Dependencies | FR-02, FR-04, FR-09, FR-19, FR-22 |
| Test Guidance | Scheme-by-DOJ; PT-by-state boundaries; YTD ledger derivation across run types + reopen; attachment exemption + carryforward |

---

### FR-M10-07 — Income-Tax (TDS) Declarations, Proofs & Full Computation Pipeline

- **Module:** M10-F07 / M10-F06
- **Primary Role(s):** Employee (declare), Payroll Officer (verify), Payroll Manager
- **User Story:** As an Employee, I want to declare investments, capture previous-employer income (Form-12B), choose a regime, upload proofs, and see a transparent, traceable projected tax — surcharge, cess, rebate, and relief included — so that TDS is deducted accurately across the year.
- **Description:** Employees submit `tax_declarations` (regime, 80C/80D/HRA/home-loan items, **Form-12B previous-employer income**), upload proofs (M13). The engine projects annual taxable income — **including taxable perquisites from FR-21** — and computes tax through the **full documented pipeline: gross taxable → standard deduction → Chapter VI-A → slab tax (regime-correct) → surcharge (with marginal relief) → 4% health & education cess → 87A rebate → relief u/s 89(1) via Form-10E** — spreading TDS across remaining months. The opaque v1 `projected_tax` is replaced by this traceable chain (intermediate values persisted on `tax_declarations`). Payroll verifies proofs after cutoff; unverified declarations revert to conservative computation.
- **Acceptance Criteria:**
  - AC1: Switching regime recomputes the full pipeline and per-month TDS.
  - AC2: After proof cutoff, unverified declared deductions are excluded and TDS recomputed.
  - AC3: Declaration locks after FY proof cutoff (`lock_after_cutoff`).
  - AC4: Projected tax updates when salary/arrears/**perquisites** change.
  - AC5: **The computation persists each stage (std deduction, Ch-VI-A, slab, surcharge, marginal relief, cess, 87A, 89(1)) and is shown to the employee as a step-by-step breakdown.**
  - AC6: **Mid-year joiners' previous-employer income (Form-12B) is included in projected income and TDS.**
  - AC7: **Cross-FY arrears generate Form-10E relief reflected in TDS and Form-16.**
- **Business Rules:** BR1: New regime ignores most exemptions per statute. BR2: `TDS = (projected annual tax − YTD TDS from ledger) / remaining months`. BR3: Proof verification is maker-checker; partial verification reduces allowed amount. BR4: **Surcharge applies at statutory thresholds with marginal relief; 4% cess on (tax+surcharge); 87A rebate per regime limits.** BR5: **Perquisite value (FR-21) is added to taxable income before slab tax.**
- **Data Model References:** `tax_declarations` (incl. 12B/10E/surcharge/cess/87A/std-deduction/perquisite_total), `perquisites`, `documents` (proofs), `deductions` (TDS), `payslip_lines` (TDS YTD truth), `rate_tables` (TAX_SLAB).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/tax-declarations` | submit/update (self) |
| POST | `/api/v1/payroll/tax-declarations/{id}/proofs` | upload proof |
| POST | `/api/v1/payroll/tax-declarations/{id}/form12b` | capture previous-employer income |
| POST | `/api/v1/payroll/tax-declarations/{id}:verify` | verify (Payroll) |
| GET | `/api/v1/payroll/tax-declarations/{id}/projection` | full traceable projection breakdown |
| GET | `/api/v1/payroll/tax-declarations/{id}/form10e` | 89(1) relief working |

- **UI Behavior Notes:** Regime comparison wizard (old vs new side-by-side); declaration form with section limits; Form-12B entry; proof upload; **step-by-step projected-tax breakdown (std ded → Ch-VI-A → slab → surcharge → marginal relief → cess → 87A → 89(1))**; cutoff countdown.
- **Edge Cases:** Mid-year regime change restrictions; proof partially accepted; arrears spiking taxable income (→10E); employee leaving mid-year (final TDS via FnF FR-20); surcharge marginal-relief boundary; perquisite added late.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `TaxDeclarationController`, `TaxProjectionEngine` (full pipeline), `RegimeComparator`, `Form10EService`, `Form12BService`, `PerquisiteIntegrator`, document client (M13) |
| Backend Flow | Capture declaration + 12B + perquisites → project annual income (incl. arrears) → std deduction → Ch-VI-A → slab → surcharge+marginal relief → cess → 87A → 89(1)/10E → derive monthly TDS from ledger YTD → on verify finalise allowed amounts |
| Data Operations | INSERT/UPDATE declaration with all intermediate stages; link proof doc ids; update TDS deduction |
| Validation | Section caps; regime rules; cutoff lock; proof presence; surcharge thresholds; marginal-relief math |
| Authorization | Employee self; Payroll verify; Auditor read |
| State Changes & Side Effects | verification_status transitions; TDS recompute; notification on verify/reject |
| Failure Handling | Slab missing → `TAX_SLAB_NOT_FOUND`; over-declaration → clamp to cap |
| Dependencies | M13, FR-02, FR-19 (Form-16/24Q via remittance), FR-21 (perquisites), FR-20 (leaver) |
| Test Guidance | Regime switch math; surcharge+marginal relief; cess; 87A; 89(1)/10E cross-FY; Form-12B inclusion; perquisite inclusion; cutoff exclusion |

---

### FR-M10-08 — Loans & Advances Management (concessional-loan perquisite linkage)

- **Module:** M10-F08
- **Primary Role(s):** Employee (request), DDO/Dept Head (sanction), Payroll Officer (schedule/recover)
- **User Story:** As an Employee, I want to apply for loans/advances and have installments recovered automatically through payroll so that repayment is accurate, with interest, and any concessional-interest perquisite is correctly taxed.
- **Description:** Lifecycle for HBA/vehicle/computer/festival/GPF/salary advances: request → sanction → disburse → installment recovery (principal + interest) via payroll → foreclosure/closure. Maintains `loans_advances` + `loan_repayments` ledger; supports reducing/simple interest, holds, and foreclosure. **When the charged interest rate is below the prescribed reference rate, the loan is flagged `is_concessional` and generates a taxable perquisite (FR-21) wired into TDS (FR-07).**
- **Acceptance Criteria:**
  - AC1: On each run, the scheduled installment is recovered and the ledger updated (outstanding decreases).
  - AC2: Final installment closes the loan; `Σ principal_components = principal`.
  - AC3: Foreclosure computes outstanding principal + accrued interest and settles in one entry.
  - AC4: If net pay is insufficient, recovery is partial/skipped per policy and the shortfall rolls into `deduction_carryforwards`.
  - AC5: **A concessional/interest-free loan automatically creates/updates a `perquisites` row (Rule 3, reducing-balance × (reference − charged) rate); a rate change revises the perquisite.**
- **Business Rules:** BR1: Total deductions cannot push net below the protected minimum; loan recovery yields after statutory. BR2: Interest method fixed at sanction. BR3: A loan on hold skips recovery without penalty unless policy charges interest. BR4: **Concessional-loan perquisite valuation per Appendix 16.7/Rule 3; perquisite spread monthly into taxable income.**
- **Data Model References:** `loans_advances` (`is_concessional`, `perquisite_id`), `loan_repayments`, `perquisites`, `payslip_lines` (recovery line), `deduction_carryforwards`, `audit_log`, workflow (sanction).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/loans` | apply |
| POST | `/api/v1/payroll/loans/{id}:sanction` | DDO sanction |
| POST | `/api/v1/payroll/loans/{id}:foreclose` | foreclosure |
| GET | `/api/v1/payroll/loans/{id}/schedule` | amortization schedule |
| GET | `/api/v1/payroll/loans/{id}/perquisite` | concessional perquisite valuation |

- **UI Behavior Notes:** Loan application wizard with eligibility check; amortization preview; employee self-service statement; foreclosure calculator; **concessional-perquisite indicator with taxable-value preview**.
- **Edge Cases:** Insufficient net pay (carryforward); loan during LWP months; transfer mid-recovery; outstanding loan at retirement (settle in FnF FR-20 / M11); reference-rate revision mid-year.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `LoanController`, `AmortizationService`, `RecoveryScheduler`, `ConcessionalPerquisiteService` |
| Backend Flow | Sanction → generate schedule → flag concessional & create perquisite → each run pull due installment → split principal/interest → recover (net protection) → update ledger & perquisite |
| Data Operations | INSERT loan + schedule; per-run INSERT loan_repayment; UPDATE outstanding; INSERT/UPDATE perquisite |
| Validation | Net-protection; schedule integrity; foreclosure math; perquisite valuation |
| Authorization | Employee request; DDO sanction; Payroll recover |
| State Changes & Side Effects | status REQUESTED→…→CLOSED; recovery line; perquisite ACTIVE; carryforward on shortfall; notification |
| Failure Handling | Insufficient net → partial/skip flag `RECOVERY_INSUFFICIENT_NET` + carryforward; ledger never negative |
| Dependencies | FR-04, FR-07, FR-21, FR-20, M11 |
| Test Guidance | Amortization (simple/reducing); foreclosure; insufficient-net carryforward; closure invariant; concessional perquisite valuation & revision |

---

### FR-M10-09 — Recoveries & Ad-hoc Adjustments (net-pay floor, attachment exemption, legal-eligibility gate)

- **Module:** M10-F09
- **Primary Role(s):** Payroll Officer, Payroll Manager, DDO (overpayment adjudication), (source) Disciplinary Authority (M09)
- **User Story:** As a Payroll Officer, I want to apply recoveries ordered by disciplinary authorities and recover prior overpayments within a defined net-pay floor and statutory exemptions — and only where legally permitted — so that mandated deductions are executed accurately, traceably, and lawfully.
- **Description:** Ingest recovery orders from M09 and internally-detected overpayments; schedule recovery across cycles **within a configurable protected net-pay floor (per cadre/jurisdiction) and the CPC s.60 attachment exemption**; track recovered-to-date against ordered amount; **roll unmet amounts into `deduction_carryforwards` (owned, aged backlog)**. **Before scheduling an overpayment recovery, flag legally-barred cases (e.g., low-grade/retired employees per the Rafiq Masih line of rulings) for explicit DDO/authority decision with recorded justification.**
- **Acceptance Criteria:**
  - AC1: A disciplinary recovery order creates a scheduled recovery with a defined total and per-cycle amount.
  - AC2: Recovery never exceeds the ordered total; over-recovery is impossible.
  - AC3: Recovery respects the **configurable net-pay floor and per-attachment CPC s.60 exemption**; spillover rolls into carryforwards.
  - AC4: Recovered-to-date is reported and closes when the order is satisfied.
  - AC5: **An overpayment recovery against a legally-barred case is blocked until an authority records an explicit decision and justification.**
  - AC6: **Rolled-forward un-recovered deductions appear in a managed backlog screen with owner and ageing (FR-24/§12).**
- **Business Rules:** BR1: Disciplinary recoveries are authority-mandated and cannot be waived by Payroll. BR2: Overpayment recovery requires documented justification, **legal-eligibility check**, and employee notification. BR3: Recovery priority: statutory → court attachment (within s.60 exemption) → disciplinary → overpayment → loans → voluntary. BR4: **The protected floor is a configurable value (cadre/jurisdiction), distinct from the attachment exemption.**
- **Data Model References:** `deductions` (RECOVERY; `attachment_exemption_basis`), `deduction_carryforwards`, `payslip_lines`, M09 order (read), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/recoveries` | create recovery (from order/overpayment) |
| GET | `/api/v1/payroll/recoveries/{id}` | status & recovered-to-date |
| POST | `/api/v1/payroll/recoveries/{id}:hold` | pause (justified) |
| POST | `/api/v1/payroll/recoveries/{id}:adjudicate` | authority decision on legally-barred overpayment |
| GET | `/api/v1/payroll/carryforwards?ageing=` | rolled-forward backlog |

- **UI Behavior Notes:** Recovery tracker showing ordered vs recovered vs remaining; source-order link; priority indicator; **net-floor & exemption indicators; legal-eligibility flag with adjudication action; carryforward ageing**.
- **Edge Cases:** Multiple concurrent recoveries competing for limited net; employee retires before full recovery (FnF/M11); appeal in M09 reverses an order mid-recovery (refund); legally-barred retiree overpayment.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RecoveryService`, `PriorityResolver`, `NetFloorGuard`, `AttachmentExemptionCalculator`, `LegalEligibilityChecker`, M09 client |
| Backend Flow | Receive order → (overpayment) run legal-eligibility check → create schedule → each run apply within net floor + s.60 exemption by priority → track recovered-to-date → roll shortfall to carryforward → close when satisfied |
| Data Operations | INSERT recovery; per-run UPDATE recovered amount; payslip line; INSERT/UPDATE carryforward |
| Validation | Cannot exceed ordered total; priority ordering; net floor; s.60 exemption; legal-eligibility |
| Authorization | Payroll Officer/Manager; DDO adjudication; reversal needs Manager + source confirmation |
| State Changes & Side Effects | recovery active→closed; refund on appeal reversal; carryforward ageing; audit_log |
| Failure Handling | Over-recovery prevented; legally-barred → 409 `RECOVERY_LEGALLY_BARRED` until adjudicated; conflict resolved by priority |
| Dependencies | M09, FR-04, FR-20, M11 |
| Test Guidance | Priority ordering; over-recovery guard; net floor; s.60 exemption; legal-eligibility gate; appeal reversal refund; carryforward conservation |

---

### FR-M10-10 — Arrears & Retrospective Revisions Engine (dependent-allowance cascade)

- **Module:** M10-F10
- **Primary Role(s):** Payroll Officer, Payroll Manager
- **User Story:** As a Payroll Officer, I want the system to compute arrears for back-dated DA/increment/promotion/pay-fixation so that employees receive the exact difference owed, with **all dependent allowances recomputed** and statutory deductions and Form-10E relief re-derived on the differential.
- **Description:** When a retrospective change occurs (DA revision FR-02, pay-fixation M06, correction), the engine re-computes pay for each affected past month using then-effective rules. **A retrospective basic-pay change recomputes every dependent component in computation order for each historical month — DA (% basic), HRA (city-class % basic), TPT, NPS (basic+DA), GPF (% basic) — not just basic.** It derives the per-component per-month delta vs what was actually paid, recomputes statutory deductions (incl. TDS) on the differential, **flows the arrear TDS delta through the corrected YTD ledger and Form-10E relief**, and produces an `arrears` record paid through an ARREARS cycle.
- **Acceptance Criteria:**
  - AC1: For a back-dated basic/DA increase, arrears = Σ over affected months of (new − old) for **basic and every dependent component**, net of recomputed deductions.
  - AC2: The arrear references the source (notification/M06 order) and shows a month-wise, component-wise break-up.
  - AC3: Arrears recompute TDS impact via the **derived YTD ledger** and flow into Form-16/Form-10E (FR-17/FR-07).
  - AC4: Arrears for a LOCKED period never mutate the original payslip — they are additive lines linked via `arrear_ref`.
  - AC5: **The dependent-allowance cascade is shown explicitly in the month-wise grid (basic delta → DA/HRA/TPT/NPS/GPF deltas).**
- **Business Rules:** BR1: Arrears use rules effective in each historical month, not current rules. BR2: Negative arrears (downward revision) handled via recovery/carryforward. BR3: Promotion arrears link to M06 fixation order. BR4: **Cross-FY arrears generate Form-10E relief (FR-07).**
- **Data Model References:** `arrears` (`component_breakup` with cascade), `payslips`/`payslip_lines` (original read; arrear lines additive), `rate_tables` (historical), `payroll_cycles` (ARREARS), `deductions`, `tax_declarations` (10E).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/arrears:compute` | compute for trigger (DA/fixation) with cascade |
| GET | `/api/v1/payroll/arrears/{id}` | arrear breakup (component-wise cascade) |
| POST | `/api/v1/payroll/arrears/{id}:approve` | approve for payout |

- **UI Behavior Notes:** Arrears computation screen with month-wise grid showing **basic delta and each dependent-component delta (DA/HRA/TPT/NPS/GPF)**, source reference, net arrear after deduction recompute, 10E relief preview, approve-to-cycle action.
- **Edge Cases:** Overlapping retrospective changes (DA + promotion same window); employee separated during arrear window (→FnF); arrears crossing FYs (10E); downward revision causing recovery/carryforward.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ArrearsEngine`, `HistoricalRecomputer`, `DependentCascadeResolver`, `RateTableResolver`, `Form10EService` |
| Backend Flow | Identify affected employees/months → recompute each month with historical rules → cascade dependent components in computation order → diff vs actual paid → recompute statutory delta → 10E relief → persist arrear → route to ARREARS cycle |
| Data Operations | INSERT arrears with cascade `component_breakup`; additive `payslip_lines` with `arrear_ref`; link payout cycle; no mutation of originals |
| Validation | Historical rule resolution; cascade completeness; delta correctness; period bounds; immutability of source payslips |
| Authorization | Payroll Officer compute; Manager approve |
| State Changes & Side Effects | arrear COMPUTED→APPROVED→PAID; TDS YTD adjusted via ledger; 10E relief; M12 pay event if pay-scale changed |
| Failure Handling | Missing historical rate → exception; overlap → ordered application |
| Dependencies | FR-02, FR-06, FR-07, FR-17, M06, M12 |
| Test Guidance | DA back-dating cascade (DA/HRA/TPT/NPS/GPF deltas); promotion fixation arrears; cross-FY 10E; downward revision recovery |

---

### FR-M10-11 — Supplementary & Off-Cycle Payroll

- **Module:** M10-F11
- **Primary Role(s):** Payroll Officer, DDO (sanction), Payroll Manager (approve)
- **User Story:** As a Payroll Officer, I want to process supplementary and off-cycle payments so that missed payments, new-joiner first pay, bonuses, ex-gratia, **re-disbursement of held net pay**, and urgent corrections are paid outside the regular cycle with the same controls.
- **Description:** Create SUPPLEMENTARY/OFF_CYCLE/BONUS cycles for a defined employee set and component set, compute with the same engine and controls (snapshot, reconciliation, approval, DSC-signed bank file), and feed the same **derived YTD ledger**. Off-cycle payments require sanction. **Off-cycle is the channel that clears `disbursement_holds` (suspense) once accounts are corrected.**
- **Acceptance Criteria:**
  - AC1: An off-cycle payment for a defined cohort computes, reconciles, approves, and disburses independently of the regular cycle.
  - AC2: Off-cycle amounts contribute to the derived YTD ledger (statutory and tax).
  - AC3: Off-cycle requires DDO sanction and Manager approval (SoD enforced).
  - AC4: A duplicate off-cycle payment for the same purpose/employee is prevented (idempotency).
  - AC5: **Re-disbursing a held suspense amount references the originating `disbursement_holds` row and closes it on success.**
- **Business Rules:** BR1: Bonus/ex-gratia taxability applied per rules. BR2: Off-cycle cannot pay a component already paid for the same period unless flagged correction. BR3: Same reconciliation and locking gates apply. BR4: **Single-in-flight constraint applies per off-cycle cycle.**
- **Data Model References:** `payroll_cycles` (OFF_CYCLE/SUPPLEMENTARY), `payroll_runs`, `payslips`, `bank_disbursements`, `disbursement_holds`, `deductions`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles` | create supplementary/off-cycle |
| POST | `/api/v1/payroll/cycles/{id}/runs` | run it |
| POST | `/api/v1/payroll/cycles/{id}:sanction` | DDO sanction |
| POST | `/api/v1/payroll/holds/{id}:redisburse` | clear a suspense hold via off-cycle |

- **UI Behavior Notes:** Off-cycle wizard: select purpose (incl. "clear suspense holds"), cohort, components, amounts; preview; sanction & approve workflow; reuse the run console.
- **Edge Cases:** Off-cycle overlapping the regular run; bonus spanning multiple FYs; new joiner first-pay before structure fully approved; re-disbursement of a frozen-account hold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OffCycleService`, reuse `RunOrchestrator`/`ComputationEngine`, `HoldClearingService` |
| Backend Flow | Create off-cycle → sanction → compute cohort → reconcile → approve → disburse → update ledger YTD → close referenced holds |
| Data Operations | Same as FR-04 with run_type filter; idempotency key on creation; UPDATE `disbursement_holds` |
| Validation | Sanction present; duplicate-payment guard; component-period guard; single-in-flight |
| Authorization | DDO sanction; Payroll Officer run; Manager approve |
| State Changes & Side Effects | cycle lifecycle; YTD update; hold REDISBURSED; M12 events as applicable |
| Failure Handling | Duplicate → 409 `DUPLICATE_OFFCYCLE`; missing sanction → 403 |
| Dependencies | FR-04, FR-14, FR-16 |
| Test Guidance | YTD continuity; duplicate prevention; sanction SoD; multi-FY bonus; suspense-hold clearing |

---

### FR-M10-12 — Benefits Administration (Medical, LTC/LTA, Gratuity, Insurance, Reimbursements, Leave Encashment)

- **Module:** M10-F12
- **Primary Role(s):** Employee (claim), Reporting Manager (recommend), Payroll Officer/Manager (verify/pay)
- **User Story:** As an Employee, I want to enrol in and claim benefits (medical, LTC/LTA, reimbursements, **leave encashment**) and have gratuity/insurance administered so that I receive entitlements correctly and they reflect in pay, FnF, or off-cycle payout.
- **Description:** Manage benefit enrolment (`benefits`) and claims (`benefit_claims`, incl. `LEAVE_ENCASHMENT`) with workflow approval; accrue gratuity per period (`gratuity_accruals`); administer group insurance and reimbursement plans. **Leave encashment is computed as `eligible leave balance × per-day basis (basic+DA/30 or policy)`, subject to caps and taxability, and can feed regular pay, FnF (FR-20), or off-cycle.** Approved claims pay via payroll or off-cycle; LTC respects block-year rules.
- **Acceptance Criteria:**
  - AC1: A claim follows submit → recommend → approve → pay; approved amount ≤ entitlement/cap.
  - AC2: LTC claim validates block-year eligibility and prior utilisation.
  - AC3: Gratuity accrues per period using last-drawn basic+DA and years of service, capped at statutory ceiling.
  - AC4: Approved reimbursements appear on payslip (taxable per rules) or off-cycle payout.
  - AC5: **Leave encashment computes from the eligible balance × per-day basis with statutory cap and taxability; exempt portion (per s.10(10AA) for retirement) is excluded from taxable income.**
- **Business Rules:** BR1: Medical/LTC reimbursement taxability per statute. BR2: Gratuity payout settled by M11/FnF at separation; M10 maintains accrual. BR3: Claims require proofs (M13); duplicate proof reuse blocked. BR4: **Leave-encashment eligibility/caps configurable; retirement encashment exemption applied; encashment in service is taxable.**
- **Data Model References:** `benefits` (incl. LEAVE_ENCASHMENT), `benefit_claims`, `gratuity_accruals`, `documents`, `payslip_lines`/off-cycle, `fnf_settlements` (encashment feed), workflow.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/benefit-claims` | submit claim (incl. leave-encashment) |
| POST | `/api/v1/payroll/benefit-claims/{id}:approve` | approve |
| GET | `/api/v1/payroll/employees/{id}/gratuity-accrual` | accrual as-of |
| GET | `/api/v1/payroll/employees/{id}/leave-encashment:compute` | encashment computation preview |

- **UI Behavior Notes:** Benefits dashboard (entitlements, balances, block-year status); claim form with proof upload; gratuity accrual statement; **leave-encashment calculator showing eligible days × per-day basis, cap, taxable vs exempt split**.
- **Edge Cases:** LTC block-year carry-forward; medical claim exceeding cap; gratuity for employee with break in service; insurance premium recovery vs employer-paid; **encashment at retirement vs in-service taxability**.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenefitController`, `ClaimWorkflowService`, `GratuityAccrualJob`, `LeaveEncashmentCalculator` |
| Backend Flow | Submit claim → workflow (recommend/approve) → cap check → compute encashment (eligible × per-day, cap, exemption) → schedule payout (payroll/FnF/off-cycle); periodic gratuity accrual job |
| Data Operations | INSERT claim; UPDATE approved_amount/status; INSERT gratuity accrual; encashment line |
| Validation | Entitlement/cap; block-year; proof presence/uniqueness; encashment eligibility & exemption |
| Authorization | Employee submit; Manager recommend; Payroll approve |
| State Changes & Side Effects | claim status flow; payslip/off-cycle/FnF line; gratuity ledger; notifications |
| Failure Handling | Over-cap → clamp + reason; duplicate proof → 409 |
| Dependencies | M13, FR-04/11, FR-20, M11 (gratuity settlement) |
| Test Guidance | Block-year logic; cap enforcement; accrual math; encashment computation + retirement exemption; payout routing |

---

### FR-M10-13 — Payslip Generation, Self-Service Access & Reopen Versioning

- **Module:** M10-F13
- **Primary Role(s):** Payroll Officer (generate/publish), Employee (view)
- **User Story:** As an Employee, I want to view and download my monthly payslip with a full earnings/deductions break-up so that I understand my pay; and as Payroll I want to publish payslips securely once the run is locked, with **clear versioning when a period is reopened**.
- **Description:** Render `payslips` into a formatted document (PDF) stored in M13, with employer/employee details, component break-up, **derived YTD figures**, leave/LWP, loan/recovery status, perquisite and tax summary. Published only after run lock; immutable thereafter. **On reopen (FR-16) the original payslip becomes SUPERSEDED/REVERSED and a new payslip `version` is published; employees see the version history with the active version highlighted.**
- **Acceptance Criteria:**
  - AC1: Payslip totals match `payslips`/`payslip_lines` exactly (incl. rounding-adjustment).
  - AC2: Payslips publish only when the run is LOCKED.
  - AC3: Employees see only their own payslips; managers see direct reports per scope.
  - AC4: A published payslip is immutable; a correction generates a **new payslip version** (via reopen) or additive arrear/supplementary, with the prior version retained and marked SUPERSEDED.
  - AC5: **The payslip viewer shows the version number and a "what changed" summary between versions.**
- **Business Rules:** BR1: Bank account/PAN masked by default. BR2: Payslip includes **derived YTD** and tax-projection summary. BR3: Download access is logged. BR4: **Superseded versions remain accessible read-only for audit.**
- **Data Model References:** `payslips` (`version`, `superseded_by_payslip_id`), `payslip_lines`, `documents` (PDF), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/payslips:publish` | publish (post-lock) |
| GET | `/api/v1/payroll/employees/{id}/payslips` | list own payslips (incl. versions) |
| GET | `/api/v1/payroll/payslips/{id}/document` | download PDF |
| GET | `/api/v1/payroll/payslips/{id}/versions` | version history + diff |

- **UI Behavior Notes:** Payslip viewer with collapsible earnings/deductions, YTD tab, download; **version selector with active-version badge and lock-to-lock diff**; manager view scoped to reports; clear "provisional vs final vs superseded" badge.
- **Edge Cases:** Re-publish after arrears (additive) vs reopen (versioned); employee separated but needs historical payslips; large-batch PDF generation.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PayslipRenderer`, `DocumentClient` (M13), `PayslipController`, `VersionDiffService` |
| Backend Flow | On publish, validate run LOCKED → render PDF per employee version → store in M13 → set status PUBLISHED → notify; on reopen, supersede prior, render new version, persist diff |
| Data Operations | UPDATE payslip status/document_id/version; bulk render queued |
| Validation | Run lock; totals match; access scope; version integrity |
| Authorization | Payroll publish; Employee/Manager scoped read |
| State Changes & Side Effects | payslip FINAL→PUBLISHED→SUPERSEDED; document created; notification; access logged |
| Failure Handling | Render failure → retry queue; pre-lock publish → 409 `RUN_NOT_LOCKED` |
| Dependencies | FR-04/16, M13 |
| Test Guidance | Totals parity (incl. rounding); lock gate; scope isolation; reopen versioning & diff |

---

### FR-M10-14 — Bank Disbursement: DSC-Signed File, Positive-Pay Guard & Suspense-Hold Reconciliation

- **Module:** M10-F14
- **Primary Role(s):** Payroll Officer (generate), Payroll Manager (DSC-sign), Finance/Treasury (receive, positive-pay confirm)
- **User Story:** As a Payroll Manager, I want to generate, validate, **digitally sign (DSC/HSM)**, and transmit the bank disbursement file with a **unique bank-side batch reference**, and reconcile acknowledgements **and the treasury debit (positive pay)** so that net pay reaches every account exactly once, no payment is duplicated on resend, and no net pay leaves the tie-out silently.
- **Description:** Produce a `bank_disbursements` file (the **single treasury-certified format**; ISO20022/CUSTOM deferred) from a LOCKED run's net pay. **Excluded/invalid-account net pay is parked in `disbursement_holds` (suspense), not dropped** — preserving the tie-out `Σ disbursed + Σ held + Σ failed = run net`. The file carries a **bank-side unique batch reference (`bank_batch_ref`)** and is **DSC/HSM digitally signed** (checksum retained for integrity only). On transmit, the gateway echoes the batch reference. **A timeout/ambiguous ack moves the batch to `SUSPECTED_PROCESSED`; resend is forbidden until a mandatory positive-pay/treasury-debit reconciliation confirms the credits did NOT post.** Failed lines route to off-cycle re-disbursement (FR-11) via their hold rows.
- **Acceptance Criteria:**
  - AC1: **`Σ disbursed + Σ held + Σ failed = run net_total`** (data-integrity rule #4); `record_count` = payees with net>0 and a valid account.
  - AC2: File generation requires a LOCKED, reconciled run.
  - AC3: **DSC-signing is performed by a principal different from the run creator (SoD); the signature is verified on transmit and on ack.**
  - AC4: Acknowledgement reconciliation marks each line success/failed; failures move to `disbursement_holds`.
  - AC5: **On gateway timeout the batch goes `SUSPECTED_PROCESSED`; the system blocks any resend until a positive-pay reconciliation against the treasury account confirms non-debit; resend then issues a NEW `bank_batch_ref`.**
  - AC6: **Held net pay is an owned, aged backlog visible in a register (FR-24/§12) and cleared only via off-cycle re-disbursement.**
- **Business Rules:** BR1: Invalid/missing/frozen bank accounts → excluded → `disbursement_holds`, never silently removed from the tie-out. BR2: A file is transmitted once per `bank_batch_ref`; re-transmission requires a new batch with reason **and a confirmed non-debit**. BR3: **DSC/HSM signature is authenticity/non-repudiation; checksum is integrity only.** BR4: **No resend without positive-pay confirmation by a principal ≠ the transmitter.**
- **Data Model References:** `bank_disbursements` (`bank_batch_ref`, `dsc_signature`, `signing_cert_ref`, positive-pay fields, status incl. `SUSPECTED_PROCESSED`), `disbursement_holds`, `payslips` (net), `documents` (file), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/disbursements` | generate file (parks excluded → holds) |
| POST | `/api/v1/payroll/disbursements/{id}:sign` | DSC/HSM sign (Manager) |
| POST | `/api/v1/payroll/disbursements/{id}:transmit` | send to bank (unique batch ref) |
| POST | `/api/v1/payroll/disbursements/{id}/ack` | ingest acknowledgement |
| POST | `/api/v1/payroll/disbursements/{id}:positive-pay` | confirm treasury debit / non-debit before any resend |

- **UI Behavior Notes:** Disbursement console: validation results, **excluded accounts → suspense-hold list**, totals with **disbursed/held/failed tie-out cards**, **DSC-sign (gated by SoD)**, transmit, ack reconciliation grid, **SUSPECTED_PROCESSED banner with mandatory positive-pay confirmation before resend**.
- **Edge Cases:** Partial bank acknowledgement; account closed/frozen (→hold); duplicate transmission attempt; **gateway timeout → SUSPECTED_PROCESSED → positive-pay → confirmed non-debit → resend with new batch ref**; HSM unavailable at signing.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BankFileGenerator`, `FileFormatStrategy` (single active format), `DscSigner` (HSM client), `DisbursementController`, `BankGatewayClient`, `PositivePayReconciler`, `SuspenseHoldService` |
| Backend Flow | Validate run locked/reconciled → build file → exclude invalid accounts → **park excluded net into `disbursement_holds`** → checksum → **DSC/HSM sign** → transmit with unique `bank_batch_ref` → ingest ack → on timeout set `SUSPECTED_PROCESSED` → require positive-pay confirm → reconcile lines / route failures to holds |
| Data Operations | INSERT disbursement batch+lines + holds; UPDATE ack_status/details, signature, batch ref; store file in M13 |
| Validation | Tie-out (disbursed+held+failed=net); account validity; DSC signature; SoD on sign; positive-pay before resend |
| Authorization | Payroll generate; Manager DSC-sign; Finance read/ack/positive-pay (≠ transmitter) |
| State Changes & Side Effects | DRAFT→VALIDATED→SIGNED→TRANSMITTED→(SUSPECTED_PROCESSED)→RECONCILED; failed/excluded → holds; audit_log |
| Failure Handling | Gateway timeout → `SUSPECTED_PROCESSED`, **resend blocked** until `positive-pay` confirms non-debit; invalid accounts → 422 `INVALID_BANK_ACCOUNTS` (+holds); HSM down → 503 `SIGNING_UNAVAILABLE` |
| Dependencies | FR-04/16, FR-11 (re-disburse), FR-15 (tie-out), M13, HSM/DSC infra |
| Test Guidance | Tie-out incl. holds; SoD on DSC-sign; **duplicate-payment prevention via positive-pay**; SUSPECTED_PROCESSED flow; partial ack → holds; signature verify |

---

### FR-M10-15 — Payroll Register & Reconciliation (disbursed + held + failed = net)

- **Module:** M10-F15
- **Primary Role(s):** Payroll Officer, Payroll Manager (sign-off)
- **User Story:** As a Payroll Manager, I want a payroll register with control totals and variance analysis — **including the disbursed/held/failed split** — so that I can reconcile the run against the prior period and sign off before approval, with no money unaccounted.
- **Description:** Generate the payroll register (per-employee and component-summarised) and `payroll_reconciliations` with gross/deduction/net control totals, prior-period comparison, variance %, **and the disbursement tie-out `Σ disbursed + Σ held + Σ failed = net`**, plus an exceptions list (new joiners, leavers, large swings, negative nets, quarantined employees, **held suspense amounts, overdue remittances**). Sign-off is the gate before approval (FR-16).
- **Acceptance Criteria:**
  - AC1: Control totals equal the run totals and the sum of payslips (three-way tie-out, incl. rounding-adjustment).
  - AC2: Variance vs prior period is computed with drill-down to contributing employees/components.
  - AC3: A run cannot be approved until reconciliation is SIGNED_OFF.
  - AC4: All exceptions are listed and individually explainable/acknowledgeable.
  - AC5: **The disbursement tie-out (`disbursed + held + failed = net`) is displayed and must balance before disbursement is marked complete.**
- **Business Rules:** BR1: Variance beyond a configurable threshold requires explicit explanation before sign-off. BR2: Quarantined employees from FR-04 appear as exceptions and block sign-off until resolved or deferred. BR3: Sign-off is by a checker, not the run creator. BR4: **Held suspense amounts and overdue remittances surface as managed exceptions, not silent gaps.**
- **Data Model References:** `payroll_reconciliations`, `payroll_runs`, `payslips`, `disbursement_holds`, `statutory_remittances`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/runs/{id}/register` | register (paginated) |
| GET | `/api/v1/payroll/runs/{id}/reconciliation` | control totals, variance, disbursed/held/failed |
| POST | `/api/v1/payroll/runs/{id}/reconciliation:signoff` | sign off |

- **UI Behavior Notes:** Reconciliation dashboard: three-way tie-out cards, **disbursed/held/failed tie-out**, variance waterfall, exceptions table (incl. suspense holds & overdue remittances) with explain action, sign-off button gated by exception resolution.
- **Edge Cases:** Large variance from a legitimate DA arrear; first-ever run (no prior period); unresolved quarantine at sign-off; non-zero suspense at period close.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationService`, `VarianceAnalyzer`, `RegisterExporter`, `DisbursementTieoutService` |
| Backend Flow | Compute control totals → three-way tie-out → disbursed+held+failed tie-out → compare prior period → classify exceptions → require explanations → sign-off |
| Data Operations | INSERT/UPDATE reconciliation; read payslips/holds/remittance aggregates |
| Validation | Three-way tie-out; disbursed+held+failed=net; threshold explanation; exception closure |
| Authorization | Payroll Officer view; Manager sign-off (≠ creator) |
| State Changes & Side Effects | recon PENDING→SIGNED_OFF; unblocks approval; audit_log |
| Failure Handling | Tie-out mismatch → block + `RECON_TIEOUT_MISMATCH`; unresolved exceptions → cannot sign |
| Dependencies | FR-04, FR-14, FR-16, FR-19 |
| Test Guidance | Three-way tie-out; disbursed+held+failed; variance drill-down; sign-off SoD; quarantine & suspense blocking |

---

### FR-M10-16 — Payroll Approval, Finalisation, Locking & Reopen-Versioning

- **Module:** M10-F16
- **Primary Role(s):** Payroll Manager / Controller
- **User Story:** As a Payroll Manager, I want to approve and lock a reconciled payroll run so that results become immutable, payslips can publish, and disbursement can proceed — with a controlled, justified, **versioned** reopen path only when essential.
- **Description:** Multi-level approval moves a reconciled run to APPROVED then LOCKED. Locking freezes all payslips/lines (`is_immutable=true`) and the cycle (LOCKED). **A reopen requires Manager authority + justification, supersedes the original payslips (REVERSED/SUPERSEDED), creates a new payslip `version` and a successor run, persists a structured lock-to-lock diff in `audit_log`, and recomputes derived YTD from the surviving version set.** Reopen is disabled once disbursement has been transmitted (corrections then go to arrears/supplementary). **The single-in-flight constraint prevents a reopen successor from colliding with another run.**
- **Acceptance Criteria:**
  - AC1: Approval requires a SIGNED_OFF reconciliation; approver ≠ run creator.
  - AC2: Locking sets all child payslips immutable and the cycle to LOCKED.
  - AC3: No write to any locked payslip/line succeeds after lock.
  - AC4: **Reopen requires justification, supersedes originals, creates a new payslip version + successor run, records a lock-to-lock diff, recomputes YTD from surviving versions, and is blocked post-transmission.**
  - AC5: **A reopen/successor run cannot start while another FINAL run is in flight for the cycle (`RUN_ALREADY_IN_FLIGHT`).**
- **Business Rules:** BR1: Maker-checker enforced at approval. BR2: Locked runs are the system of record for the period. BR3: Post-disbursement corrections only via arrears/supplementary/off-cycle. BR4: **Reopen versioning preserves the original immutable payslip; nothing is overwritten.**
- **Data Model References:** `payroll_runs` (`superseded_run_id`, `in_flight_lock_key`), `payroll_cycles`, `payslips` (`version`, `superseded_by_payslip_id`), `payroll_reconciliations`, `audit_log`, workflow.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}:approve` | approve (checker) |
| POST | `/api/v1/payroll/runs/{id}:lock` | finalise & lock |
| POST | `/api/v1/payroll/runs/{id}:reopen` | reopen (justified, versioned) |
| GET | `/api/v1/payroll/runs/{id}/lock-diff?vs={priorRunId}` | lock-to-lock diff |

- **UI Behavior Notes:** Approval screen with reconciliation summary, approve/lock actions gated by role + SoD, **reopen dialog requiring justification and showing the impending supersession**, lock status badge, **lock-to-lock diff viewer**.
- **Edge Cases:** Attempt to lock without reconciliation; reopen after transmission; concurrent approval attempts (optimistic locking); reopen colliding with in-flight run.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ApprovalService`, `LockService`, `ReopenVersioningService`, `LockDiffService`, optimistic-lock + in-flight guards |
| Backend Flow | Approve (check recon + SoD) → lock (freeze payslips, set cycle LOCKED) in a transaction → enable publish/disbursement; reopen → acquire in-flight lock → supersede originals → create new payslip version + successor run → persist diff → recompute YTD |
| Data Operations | UPDATE run/cycle status; set payslips `is_immutable`/`version`/`superseded_by`; INSERT diff; transactional |
| Validation | Recon signed-off; SoD; transmission state for reopen; single-in-flight |
| Authorization | Payroll Manager only |
| State Changes & Side Effects | run APPROVED→LOCKED; reopen→REOPENED→successor COMPUTING; payslips→SUPERSEDED + new version; M12 pay events on lock; notifications |
| Failure Handling | Unsigned recon → 409 `RECON_NOT_SIGNED`; post-transmit reopen → 409 `REOPEN_BLOCKED`; in-flight collision → 409 `RUN_ALREADY_IN_FLIGHT` |
| Dependencies | FR-15, FR-13, FR-14, M12 |
| Test Guidance | Lock immutability; SoD; reopen versioning + diff + YTD recompute; reopen guardrails; concurrency/in-flight |

---

### FR-M10-17 — Statutory Outputs: Form-16 (Part A from MATCHED deposits), Form-24Q & Schedules

- **Module:** M10-F17
- **Primary Role(s):** Payroll Officer (generate), Payroll Manager (certify)
- **User Story:** As a Payroll Officer, I want to generate Form-16, Form-24Q (quarterly TDS), and PT/GPF/NPS remittance schedules so that the organisation meets statutory filing and remittance obligations accurately and on time — **with Form-16 Part A derived from actually-deposited-and-matched TDS, not merely deducted TDS**.
- **Description:** Aggregate **derived YTD** earnings, deductions, and TDS to produce employee Form-16 (Part A/B), Form-24Q quarterly returns, and remittance schedules for PT, GPF, NPS, and pension. **Form-16 Part A reconciles to `statutory_remittances` rows in MATCHED status (deposited & challan/CIN-matched), making the deadline guarantee (G2) provable.** Form-16 Part B reflects the full TDS pipeline (FR-07) incl. perquisites, surcharge, cess, 87A, and 89(1) relief. Schedules feed FR-19. Outputs reconciled against registers and the line ledger, stored in M13.
- **Acceptance Criteria:**
  - AC1: Form-16 TDS totals tie to Σ TDS `payslip_lines` for the FY (incl. arrears) **and to MATCHED `statutory_remittances` for Part A**.
  - AC2: Form-24Q quarterly totals reconcile to the sum of monthly TDS in that quarter.
  - AC3: Remittance schedules list per-scheme amounts with employee/employer split and feed FR-19.
  - AC4: Outputs are certified (maker-checker) before release and stored/versioned.
  - AC5: **Form-16 Part A flags any TDS deducted but not yet MATCHED (deposited), preventing premature/incorrect certification.**
- **Business Rules:** BR1: Section 89(1) relief (Form-10E, FR-07) reflected where arrears span FYs. BR2: PAN mandatory for Form-16; missing PAN flagged. BR3: Remittance deadlines tracked with reminders (Notifications) **via FR-19**. BR4: **Part A derives from deposited/MATCHED amounts; deducted-but-undeposited TDS cannot appear as deposited.**
- **Data Model References:** `payslip_lines` (YTD truth), `statutory_remittances` (MATCHED), `tax_declarations` (10E), `deductions` (cache), `documents`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/statutory/form16:generate` | generate Form-16 (FY); Part A from MATCHED |
| POST | `/api/v1/payroll/statutory/form24q:generate` | quarterly TDS return |
| GET | `/api/v1/payroll/statutory/remittances?scheme=PT&period=` | remittance schedule (feeds FR-19) |

- **UI Behavior Notes:** Statutory output center: select FY/quarter, generate, **reconcile-status indicator showing deducted vs deposited/MATCHED**, certify & release, employee Form-16 self-service download.
- **Edge Cases:** Mid-year joiner/leaver Form-16 (incl. Form-12B); revised return after correction/reopen; missing PAN; cross-FY arrears relief; TDS deducted but deposit pending.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `Form16Generator`, `Form24QGenerator`, `RemittanceScheduler`, `MatchedDepositReconciler`, document client |
| Backend Flow | Aggregate YTD per employee/scheme from ledger → reconcile to registers and MATCHED remittances → render outputs (Part A from MATCHED) → certify → store/version in M13 |
| Data Operations | Read YTD ledger + MATCHED remittances; INSERT output document refs; no payroll mutation |
| Validation | TDS tie-out (ledger + MATCHED); PAN presence; period completeness; deposited-vs-deducted |
| Authorization | Payroll generate; Manager certify; Employee self-download Form-16 |
| State Changes & Side Effects | output documents created; notifications; audit_log |
| Failure Handling | Tie-out mismatch → block + reconcile report; missing PAN → exception list; undeposited TDS → Part A blocked |
| Dependencies | FR-06/07/10/19, M13 |
| Test Guidance | Form-16 tie-out incl. arrears & MATCHED deposits; 24Q reconciliation; cross-FY relief; missing-PAN; undeposited-TDS block |

---

### FR-M10-18 — Parallel / What-If Run & Cost-to-Organisation Analytics

- **Module:** M10-F04 / M10-F18
- **Primary Role(s):** Payroll Manager, Department Head, Finance
- **User Story:** As a Payroll Manager, I want to run what-if/parallel payroll scenarios and view cost-to-organisation analytics so that I can model the impact of DA revisions, increments, or restructuring and report payroll cost by org/cadre/component — with the comparison output exportable to a board paper.
- **Description:** Execute PARALLEL_WHATIF runs against proposed parameters (e.g., new DA%) without affecting live data, producing comparison reports vs the actual run. Provide cost analytics: total payroll cost, headcount cost, component-/org-wise breakdown, period trends, and employer-contribution costs (NPS/pension/gratuity accrual). **The comparison output is a structured, exportable board-ready artefact (CSV/PDF), not a developer diff.**
- **Acceptance Criteria:**
  - AC1: A what-if run never writes live payslips/disbursements; results clearly labelled scenario data.
  - AC2: A comparison report shows delta (scenario vs actual) by component and org unit, **exportable as a board paper (PDF/CSV)**.
  - AC3: Cost analytics aggregate gross, deductions, net, and employer cost by org/cadre/component/period.
  - AC4: Analytics respect row-level org scope per role.
- **Business Rules:** BR1: Scenario runs are retained for audit and labelled. BR2: Employer contributions and gratuity accrual included in true cost-to-org. BR3: Analytics read from locked runs for actuals; scenarios for projections. BR4: **What-if runs do not acquire the FINAL in-flight lock and never block live runs.**
- **Data Model References:** `payroll_runs` (PARALLEL_WHATIF, segregated), `payslips` (scenario), aggregates over `payslip_lines`, `gratuity_accruals`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` (run_mode=PARALLEL_WHATIF) | scenario run |
| GET | `/api/v1/payroll/runs/{id}/comparison?vs={actualRunId}` | scenario vs actual (exportable) |
| GET | `/api/v1/payroll/analytics/cost-to-org?groupBy=org_unit,component&period=` | cost analytics |

- **UI Behavior Notes:** Scenario builder with parameter overrides; comparison view with **delta highlighting and an "export board paper" action**; analytics dashboard with drill-down charts and export; scope-aware filters.
- **Edge Cases:** Scenario over a very large cohort; comparing across structure versions; analytics across cycles with arrears.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | reuse `ComputationEngine` in scenario mode, `ComparisonService`, `CostAnalyticsService`, `BoardPaperExporter` |
| Backend Flow | Run engine with override params into segregated scenario store → compute deltas vs actual → render exportable comparison → aggregate cost analytics from locked runs |
| Data Operations | INSERT scenario payslips (flagged); read-only aggregates for analytics |
| Validation | Scenario isolation (no live write, no in-flight lock); scope enforcement |
| Authorization | Manager/Dept Head/Finance; org scope |
| State Changes & Side Effects | scenario run stored & labelled; no live side effects; audit_log |
| Failure Handling | Accidental live write prevented by mode guard; large query → async export |
| Dependencies | FR-04, FR-16, M14 |
| Test Guidance | Scenario isolation; delta correctness; board-paper export; analytics incl. employer cost; scope filtering |

---

### FR-M10-19 — Statutory Remittance & Liability Tracking + GL Cost-Journal Posting

- **Module:** M10-F21
- **Primary Role(s):** Payroll Officer (capture challan), Payroll Manager (certify/match), Finance (confirm deposit & GL acknowledgement)
- **User Story:** As a Payroll Manager, I want every statutory deduction tracked from accrued → deposited → matched (with challan/CIN, deadline, and late-interest), and the payroll cost-journal exported with a posting status, so that the organisation can *prove* it remitted to the State on time and booked the cost — not merely computed it.
- **Description:** Closes the **deducted → deposited → matched** loop. For each scheme/period, a `statutory_remittances` row accrues the derived liability (from the line ledger), is scheduled against its `statutory_due_date`, captures the actual `challan_no`/`cin`/`deposit_date`/`deposited_amount`, **computes late-deposit interest u/s 201(1A)/234E when deposited late**, and reaches MATCHED when the deposit ties (within tolerance). Separately, a `gl_journals` cost-journal export object is produced per run (debits/credits per `gl_code`), exported to Finance ERP, and tracked through `POSTED`/`ACKNOWLEDGED` (M10 does not own the GL). This satisfies G2 and underpins Form-16 Part A (FR-17).
- **Acceptance Criteria:**
  - AC1: A remittance row is created per scheme/period with `deducted_total = Σ payslip_lines` for that scheme/period (data-integrity rule #14).
  - AC2: Capturing `challan_no`/`cin`/`deposit_date` moves status to DEPOSITED; matching the amount (within tolerance) moves it to MATCHED.
  - AC3: A row past `statutory_due_date` without deposit is OVERDUE; **late interest u/s 201(1A)/234E is computed automatically.**
  - AC4: **Form-16 Part A (FR-17) derives only from MATCHED remittances.**
  - AC5: A `gl_journals` row balances (`total_debit = total_credit`) and tracks `POSTED`/`ACKNOWLEDGED`; net-pay clearing line = `Σ disbursed + Σ held` (data-integrity rule #15).
  - AC6: **Overdue remittances and short-payments surface in the §12 backlog/exception reporting.**
- **Business Rules:** BR1: Remittance amounts derive from the immutable ledger, never a mutable scalar. BR2: Documented CRA/GPF **rounding tolerance** absorbs per-employee residue (Appendix 16.2). BR3: Late interest formula configurable per scheme/section. BR4: **M10 tracks GL posting status only; Finance ERP is the GL book of record (§2.3 amended).**
- **Data Model References:** `statutory_remittances`, `gl_journals`, `payslip_lines` (derivation), `documents` (challan scans), `notifications` (deadlines), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/remittances:accrue` | accrue per scheme/period from ledger |
| POST | `/api/v1/payroll/remittances/{id}/challan` | capture challan/CIN/deposit |
| POST | `/api/v1/payroll/remittances/{id}:match` | match & certify (Manager) |
| GET | `/api/v1/payroll/remittances?status=OVERDUE` | overdue/short-paid backlog |
| POST | `/api/v1/payroll/runs/{id}/gl-journal:export` | export cost journal |
| POST | `/api/v1/payroll/gl-journals/{id}:acknowledge` | Finance posting acknowledgement |

- **UI Behavior Notes:** Remittance ledger: per-scheme/period cards showing accrued → scheduled → deposited → matched, deadline countdown, **late-interest indicator**, challan capture with document upload; GL journal viewer with balanced debit/credit and posting-status badge.
- **Edge Cases:** Partial deposit (SHORT_PAID); deposit after deadline (late interest); challan correction; reopen changing the derived liability after deposit; GL rejected by ERP.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RemittanceLedgerService`, `LateInterestCalculator`, `ChallanMatcher`, `GlJournalBuilder`, `ErpExportClient`, document client |
| Backend Flow | Accrue from ledger → schedule vs due date → capture challan/CIN → compute late interest if late → match within tolerance → MATCHED; build balanced GL journal → export → track POSTED/ACKNOWLEDGED |
| Data Operations | INSERT/UPDATE `statutory_remittances`, `gl_journals`; read `payslip_lines` aggregates; document refs |
| Validation | deducted_total = Σ ledger; debit=credit; tolerance; due-date/late-interest; deposited-vs-remittable |
| Authorization | Payroll capture; Manager match/certify; Finance acknowledge |
| State Changes & Side Effects | remittance ACCRUED→…→MATCHED/OVERDUE; gl_journal EXPORTED→POSTED→ACKNOWLEDGED; deadline notifications; audit_log |
| Failure Handling | Short deposit → SHORT_PAID; late → OVERDUE + interest; GL imbalance → block; ERP reject → REJECTED + retry |
| Dependencies | FR-06, FR-14, FR-17, M13, Finance ERP, TRACES/CRA |
| Test Guidance | Ledger-derived accrual; challan match & tolerance; late-interest u/s 201/234E; MATCHED→Form-16 Part A; balanced GL; posting-status lifecycle |

---

### FR-M10-20 — Full-and-Final Settlement (FnF)

- **Module:** M10-F22
- **Primary Role(s):** HR Admin (initiate), Payroll Officer (compute), DDO (sanction), Payroll Manager (approve), Finance (pay)
- **User Story:** As HR/Payroll, I want a single consolidated full-and-final settlement for every separating employee so that final-month pay, leave encashment, gratuity, notice-pay recovery, unrecovered loans, carryforwards, and a final TDS true-up net into one last payment (or recovery) — instead of a treasure hunt across five FRs.
- **Description:** On separation (superannuation/resignation/VRS/termination/death/dismissal), an FnF run (`payroll_cycles.run_type=FNF`) computes a `fnf_settlements` record netting: **final-month pay (prorated to last working date), leave encashment (FR-12, with retirement exemption), gratuity (settled/handed off to M11), notice-pay recovery, unrecovered loan principal+interest (FR-08), open `deduction_carryforwards`, and a final-year TDS true-up (FR-07)** into `net_settlement` (which may be negative → recovery). It has **its own reconciliation and SoD**, hands off pension/terminal-benefit data to M11, and emits the separation pay event to M12.
- **Acceptance Criteria:**
  - AC1: An FnF run produces a single `fnf_settlements` record consolidating all dues and recoveries.
  - AC2: `net_settlement = final_month_pay + leave_encashment + gratuity − notice_pay_recovery − loan_settlement − other_recoveries − final_tds` and ties to its own reconciliation.
  - AC3: FnF requires DDO sanction and Manager approval (approver ≠ creator).
  - AC4: **Open carryforwards and unrecovered loans are pulled into FnF; a negative net becomes a RECOVERY_PENDING obligation, not a silent write-off.**
  - AC5: **Gratuity is settled or handed off to M11 with a reference; last-pay-drawn and contribution history are supplied to M11.**
  - AC6: Final TDS true-up reflects full-year income incl. perquisites and any 89(1) relief.
- **Business Rules:** BR1: Same immutability/locking/SoD discipline as a regular run. BR2: Death cases route gratuity/dues per nominee rules (M11). BR3: Leave-encashment retirement exemption (s.10(10AA)) applied. BR4: **No employee record can be fully closed with an open FnF in RECOVERY_PENDING.**
- **Data Model References:** `fnf_settlements`, `payroll_cycles` (FNF), `payslips`/`payslip_lines`, `loans_advances`, `deduction_carryforwards`, `benefit_claims` (encashment), `gratuity_accruals`, `payroll_reconciliations`, `service_register_events` (M12), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/fnf` | initiate FnF for an employee |
| POST | `/api/v1/payroll/fnf/{id}:compute` | compute consolidated settlement |
| POST | `/api/v1/payroll/fnf/{id}:sanction` | DDO sanction |
| POST | `/api/v1/payroll/fnf/{id}:approve` | Manager approve (≠ creator) |
| GET | `/api/v1/payroll/fnf/{id}` | settlement breakdown |

- **UI Behavior Notes:** FnF workbench: a single screen showing every component (final pay, encashment, gratuity, notice recovery, loan settlement, carryforwards, final TDS) netting to one figure; sanction/approve workflow; M11 handoff panel; clear positive-payable vs recovery-pending state.
- **Edge Cases:** Death-in-service (nominee, gratuity exemption); negative net (recovery from terminal benefits via M11); separation mid-arrear-window; outstanding court attachment at exit; dismissal forfeiting some benefits.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FnFController`, `FnFConsolidationService`, reuse `ComputationEngine`/`ReconciliationService`, `M11HandoffClient`, `LeaveEncashmentCalculator`, `LoanSettlementService` |
| Backend Flow | Initiate → gather final pay + encashment + gratuity + recoveries + carryforwards + loan settlement → compute final TDS true-up → net → reconcile → sanction → approve → pay/recover → M11 handoff → M12 event |
| Data Operations | INSERT `fnf_settlements`; pull/close loans, carryforwards; INSERT reconciliation; payslip lines |
| Validation | Net-equation tie-out; SoD; encashment exemption; carryforward conservation; gratuity cap |
| Authorization | HR initiate; Payroll compute; DDO sanction; Manager approve; Finance pay |
| State Changes & Side Effects | fnf INITIATED→…→PAID/RECOVERY_PENDING→CLOSED; M11 handoff; M12 separation pay event; notifications |
| Failure Handling | Negative net → RECOVERY_PENDING (not write-off); missing gratuity confirm → block close |
| Dependencies | FR-04/07/08/09/12, M11, M12 |
| Test Guidance | Consolidation correctness; net equation; encashment exemption; negative-net recovery; gratuity handoff; SoD; death case |

---

### FR-M10-21 — Taxable Perquisite Valuation (Rule 3)

- **Module:** M10-F20
- **Primary Role(s):** Payroll Officer (value), Payroll Manager (approve), Employee (view)
- **User Story:** As a Payroll Officer, I want taxable perquisites valued per Rule 3 — especially the concessional/interest-free loan perquisite the system itself creates via FR-08, and employer-provided accommodation — so that TDS is not systematically under-deducted.
- **Description:** Compute and maintain `perquisites` per employee per FY for `CONCESSIONAL_LOAN`/`INTEREST_FREE_LOAN` (reducing-balance × (prescribed reference rate − charged rate)), `RENT_FREE_ACCOMMODATION`/`CONCESSIONAL_ACCOMMODATION` (license-fee method), motor car, and others. Each perquisite's `taxable_value` (and `monthly_value` spread) is **wired into FR-07 taxable income via a `PERQUISITE` category component**, closing the v1 gap where the system computed a concessional loan but never taxed its perquisite.
- **Acceptance Criteria:**
  - AC1: A concessional/interest-free loan (FR-08 `is_concessional=true`) automatically produces an ACTIVE `perquisites` row valued per Rule 3.
  - AC2: Employer-provided accommodation is valued by the license-fee method.
  - AC3: Each perquisite's `taxable_value` flows into `tax_declarations.perquisite_total` and projected taxable income (data-integrity rule #17).
  - AC4: A change in loan balance/rate or accommodation status revises the perquisite (REVISED) and re-projects TDS.
  - AC5: The perquisite appears on the payslip/tax summary as a non-cash taxable item.
- **Business Rules:** BR1: Reference rate (SBI/prescribed) is configurable, effective-dated. BR2: Perquisite is taxable income, not a cash earning; it increases TDS but not net pay. BR3: **Every `is_concessional` loan must have a linked perquisite (enforced).**
- **Data Model References:** `perquisites`, `loans_advances` (`is_concessional`, `perquisite_id`), `tax_declarations` (`perquisite_total`), `pay_components` (PERQUISITE), `payslip_lines`, `rate_tables` (reference rate).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/perquisites` | create/value a perquisite |
| GET | `/api/v1/payroll/employees/{id}/perquisites?fy=` | list per FY |
| POST | `/api/v1/payroll/perquisites/{id}:revise` | revise on basis change |

- **UI Behavior Notes:** Perquisite panel per employee: type, valuation method, computed basis (e.g., outstanding × rate delta), taxable value, monthly spread; link to source loan/accommodation; "non-cash taxable" badge.
- **Edge Cases:** Mid-year loan foreclosure (perquisite stops); reference-rate revision; accommodation surrendered mid-year; multiple concurrent perquisites.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PerquisiteController`, `Rule3LoanValuer`, `AccommodationValuer`, `TaxIntegrationService` |
| Backend Flow | Detect trigger (concessional loan/accommodation) → value per Rule 3 → persist perquisite → spread monthly → feed FR-07 taxable income → revise on basis change |
| Data Operations | INSERT/UPDATE `perquisites`; link to loan; update `tax_declarations.perquisite_total` |
| Validation | Rule-3 method correctness; reference-rate effective-dating; mandatory link for concessional loans |
| Authorization | Payroll Officer value; Manager approve; Employee read |
| State Changes & Side Effects | perquisite DRAFT→ACTIVE→REVISED/CLOSED; TDS re-projection; payslip non-cash line |
| Failure Handling | Missing reference rate → 422 `PERQ_REFERENCE_RATE_NOT_FOUND`; concessional loan w/o perquisite → block |
| Dependencies | FR-07, FR-08, FR-02 |
| Test Guidance | Concessional-loan Rule-3 valuation; accommodation license-fee; tax inclusion; foreclosure/rate-change revision; mandatory-link enforcement |

---

### FR-M10-22 — Cross-Module Point-in-Time Snapshot Contract

- **Module:** M10-F19
- **Primary Role(s):** Payroll Officer (run), Payroll Manager (oversee), System (automated)
- **User Story:** As a Payroll Manager, I want every run to compute against a frozen, as-of snapshot of upstream facts (M01 employee/bank/PAN/scheme, M03 attendance, M06 fixation, M09 recovery, org unit) so that determinism extends upstream and there is no ambiguity about *who* gets paid *how much* into *which account*.
- **Description:** Defines the snapshot-as-of contract the v1 BRD left silent. At cutoff, the engine captures an immutable `run_input_snapshots` row with the as-of values of all upstream facts and a `checksum`; the run computes only from the snapshot, and `payroll_runs.snapshot_id`/`payslips.snapshot_id` bind it. **Orders arriving after cutoff but before lock are deferred (recorded in `post_cutoff_deferrals`) to the next cycle/arrears — they are not silently in or out.** The snapshot also resolves the **bank account paid** (the snapshotted account, even if M01 changes before disbursement) and the **DDO-of-record for mid-month inter-DDO transfers** (Appendix 16.8).
- **Acceptance Criteria:**
  - AC1: Starting a FINAL run freezes a `run_input_snapshots` row (`is_frozen=true`) with a checksum; the run binds to it.
  - AC2: Re-running against the same frozen snapshot reproduces identical payslips (data-integrity rule #16).
  - AC3: **The bank account, PAN, scheme, and org unit used are the snapshotted values; a later M01 change does not alter the locked run or its disbursement account.**
  - AC4: **An M06 fixation or M09 recovery order effective ≤ cutoff is included; one arriving after cutoff is recorded in `post_cutoff_deferrals` and applied to the next cycle/arrears.**
  - AC5: **For a mid-month inter-DDO transfer, the DDO-of-record rule determines the payer and control-account attribution (Appendix 16.8).**
- **Business Rules:** BR1: The snapshot is append-only and immutable once frozen. BR2: What-if runs may take a non-frozen snapshot copy for scenarios. BR3: **Determinism is defined as a pure function of (structure version, effective rates, M10 inputs, prior ledger, frozen snapshot).** BR4: Post-cutoff orders are never silently dropped or silently applied.
- **Data Model References:** `run_input_snapshots`, `payroll_runs` (`snapshot_id`), `payslips` (`snapshot_id`), M01/M03/M06/M09/org (read), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/snapshot:freeze` | capture & freeze the as-of snapshot |
| GET | `/api/v1/payroll/snapshots/{id}` | snapshot facts & checksum |
| GET | `/api/v1/payroll/snapshots/{id}/deferrals` | post-cutoff deferred orders |

- **UI Behavior Notes:** Snapshot panel on the run console: as-of timestamp, checksum, per-source counts (employees, attendance, fixations, recoveries), and a **post-cutoff deferral list** with "carry to next cycle" confirmation.
- **Edge Cases:** Bank account changed in M01 after cutoff (snapshot account paid); fixation order arriving post-cutoff; inter-DDO transfer on cutoff day; M03 regularisation after snapshot.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SnapshotService`, `UpstreamFactCollector` (M01/M03/M06/M09/org clients), `SnapshotChecksum`, `DdoOfRecordResolver` |
| Backend Flow | At cutoff, collect as-of facts → persist immutable snapshot → checksum → freeze → bind to run; record post-cutoff arrivals as deferrals |
| Data Operations | INSERT `run_input_snapshots` (append-only); set `payroll_runs.snapshot_id`, `payslips.snapshot_id` |
| Validation | As-of correctness; immutability after freeze; checksum determinism; deferral capture |
| Authorization | Payroll Officer freeze; Manager oversee; system automated |
| State Changes & Side Effects | snapshot frozen; run bound; deferrals recorded; audit_log |
| Failure Handling | Upstream unavailable at freeze → 503 `UPSTREAM_UNAVAILABLE`, retry; mutation after freeze → 409 `SNAPSHOT_FROZEN` |
| Dependencies | M01, M03, M06, M09, org; FR-04 |
| Test Guidance | As-of correctness per source; determinism vs frozen snapshot; bank-account-changed case; post-cutoff deferral; inter-DDO DDO-of-record |

---

## 7. UI Requirements

| Screen | Primary role | Key elements | States covered |
|---|---|---|---|
| Payroll Run Console | Payroll Officer/Mgr | progress, live totals, exceptions, trace viewer, **snapshot ref+checksum, in-flight lock**, run/cancel | empty, computing, completed, failed, quarantine, locked-conflict |
| Reconciliation Dashboard | Payroll Mgr | three-way tie-out, **disbursed/held/failed tie-out**, variance waterfall, exceptions, sign-off | pending, signed-off, mismatch |
| Approval & Lock | Payroll Mgr | recon summary, approve/lock, **reopen-with-versioning + lock-to-lock diff** | reconciled, approved, locked, reopen-blocked |
| Salary Structure Builder | Payroll Officer | components vs overrides, effective timeline, version diff | draft, pending, active, superseded |
| Rule/Component Config | SysAdmin | rule editor w/ live validation, test panel, version timeline, **DSL-grammar badge** | draft, active, retired, invalid |
| Rate Tables | SysAdmin | effective-dated grid, as-of + **state selector**, retrospective warning | current, future, retrospective |
| Tax Declaration (self) | Employee | regime wizard, declaration form, **Form-12B, step-by-step tax breakdown (surcharge/cess/87A/10E)**, proof upload | draft, submitted, verified, rejected, locked |
| Perquisite Panel | Payroll/Employee | type, valuation basis, taxable value, monthly spread, source link | draft, active, revised, closed |
| Loans & Advances | Employee/DDO | application wizard, amortization, statement, foreclosure, **concessional-perquisite preview** | requested, sanctioned, recovering, closed |
| Benefits & Claims | Employee/Mgr | entitlements, claim form, proof upload, gratuity accrual, **leave-encashment calculator** | eligible, submitted, approved, paid, rejected |
| Payslip Viewer (self) | Employee | earnings/deductions break-up, YTD, download, **version selector + diff** | provisional, published, superseded, none |
| Bank Disbursement Console | Payroll Mgr/Finance | validation, **suspense-hold list, disbursed/held/failed cards, DSC-sign, SUSPECTED_PROCESSED + positive-pay confirm**, ack grid | draft, signed, transmitted, suspected-processed, partial-ack, failed |
| Statutory Output Center | Payroll Officer/Mgr | Form-16/24Q/remittance, **deducted-vs-MATCHED indicator**, certify | pending, generated, certified, mismatch |
| Remittance Ledger | Payroll/Finance | per-scheme accrued→deposited→matched, **deadline countdown, late-interest, challan capture** | accrued, scheduled, deposited, matched, overdue, short-paid |
| GL Journal Viewer | Payroll/Finance | balanced debit/credit per gl_code, posting status | draft, exported, posted, acknowledged, rejected |
| FnF Workbench | HR/Payroll/DDO/Mgr | consolidated settlement netting, M11 handoff, sanction/approve | initiated, computed, reconciled, approved, paid, recovery-pending |
| Carryforward / Backlog Register | Payroll/Finance | un-recovered deductions, suspense holds, overdue remittances with ageing & owner | empty, open, ageing, cleared |
| Cost-to-Org Analytics | Mgr/Finance | charts by org/cadre/component, scenario comparison, **board-paper export** | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; keyboard navigation & visible focus; dark mode; responsive/mobile-first for self-service (payslip, declaration, claims, FnF status); money masked by default with reveal+audit; all amounts formatted per locale; empty/loading/error/success/permission states for every screen; no skeleton placeholders in production — real fields, data, API calls, and states.

---

## 8. API & Integration

### 8.1 Conventions

REST under `/api/v1`; JSON; JWT bearer + RBAC + org-unit scoping; cursor or page/limit pagination (max 100); `Idempotency-Key` on mutating run/disbursement endpoints **plus single-in-flight-run enforcement per cycle**; all timestamps UTC ISO-8601.

### 8.2 Canonical Error Envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "city_class is required", "field": "city_class" }, "requestId": "req_8f2c..." }
```

### 8.3 Error-Code Catalog (shared + M10-specific; v2 additions in bold)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid input |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD denied |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | State conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled |
| UPSTREAM_UNAVAILABLE | 503 | M03/M13/bank gateway/upstream down |
| RULE_EXPRESSION_INVALID | 400 | Bad formula |
| **DSL_PROPERTY_TEST_FAILED** | 400 | FORMULA rule failed decimal/null/precedence property tests |
| RULE_VERSION_OVERLAP | 409 | Overlapping rule versions |
| RATE_OVERLAP | 409 | Overlapping rate rows |
| RATE_LOCKED_IMMUTABLE | 409 | Edit of locked-referenced rate |
| RATE_NOT_FOUND | 422 | No effective rate for period |
| **PT_STATE_NOT_MAPPED** | 422 | No PT slab for employee's state of posting |
| STRUCTURE_OVERLAP | 409 | Overlapping structure versions |
| STRUCTURE_PERIOD_LOCKED | 409 | Change in locked period |
| TAX_SLAB_NOT_FOUND | 422 | No tax slab for FY/regime |
| **PERQ_REFERENCE_RATE_NOT_FOUND** | 422 | No effective perquisite reference rate |
| RECOVERY_INSUFFICIENT_NET | 409 | Net too low for recovery (→carryforward) |
| **RECOVERY_LEGALLY_BARRED** | 409 | Overpayment recovery barred pending authority adjudication |
| DUPLICATE_OFFCYCLE | 409 | Duplicate off-cycle payment |
| **RUN_ALREADY_IN_FLIGHT** | 409 | Another FINAL run in flight for the cycle |
| **SNAPSHOT_FROZEN** | 409 | Mutation attempted after snapshot freeze |
| RECON_TIEOUT_MISMATCH | 409 | Control totals do not tie out (incl. disbursed+held+failed) |
| RECON_NOT_SIGNED | 409 | Approval before reconciliation |
| RUN_NOT_LOCKED | 409 | Publish/disburse before lock |
| REOPEN_BLOCKED | 409 | Reopen after transmission |
| INVALID_BANK_ACCOUNTS | 422 | Invalid/missing payee accounts (parked to holds) |
| **SIGNING_UNAVAILABLE** | 503 | HSM/DSC signing service unavailable |
| **RESEND_BLOCKED_POSITIVE_PAY** | 409 | Resend blocked until positive-pay non-debit confirmation |
| RUN_IMMUTABLE | 409 | Write to locked run/payslip |

### 8.4 JSON Examples

**Start a payroll run (acquires in-flight lock; binds snapshot)**

```http
POST /api/v1/payroll/cycles/{cycleId}/runs
Idempotency-Key: 0b4e-...
{ "run_mode": "FINAL", "snapshot_id": "snap-7781", "scope_filter": { "org_unit_id": "ou-12" } }
```
```json
{ "run_id": "run-9001", "run_no": "RUN-2026-06-001", "status": "QUEUED", "snapshot_checksum": "sha256:4f9c..." }
```

**Reconciliation tie-out (response — extended)**

```json
{ "run_id": "run-9001", "gross_control": 18450000.00, "deduction_control": 4820000.00,
  "net_control": 13630000.00, "disbursed": 13530000.00, "held": 100230.00, "failed": 0.00,
  "tieout_ok": true, "variance_pct": 1.42, "signoff_status": "PENDING",
  "exceptions": [ { "employee_id": "e-3120", "type": "SUSPENSE_HOLD", "amount": 48230.00, "reason": "INVALID_ACCOUNT" } ] }
```

**Suspected-processed → positive-pay guard (response)**

```json
{ "disbursement_id": "disb-5501", "status": "SUSPECTED_PROCESSED",
  "bank_batch_ref": "BNK-2026-06-0001",
  "message": "Gateway timeout. Resend blocked until positive-pay non-debit confirmation.",
  "next_action": "POST /disbursements/disb-5501:positive-pay" }
```

**Remittance match (response)**

```json
{ "remittance_id": "rem-7001", "scheme": "TDS", "period": "06-2026",
  "deducted_total": 24500000.00, "deposited_amount": 24500000.00, "cin": "0510072026088213",
  "status": "MATCHED", "late_interest": 0.00 }
```

**Bank file validation error (excluded → holds)**

```json
{ "error": { "code": "INVALID_BANK_ACCOUNTS", "message": "3 payees have invalid accounts; net parked to suspense holds",
  "field": "payees" }, "requestId": "req_2a91" }
```

### 8.5 Integration Points

| System | Direction | Purpose |
|---|---|---|
| M01 Employee | in (**snapshotted as-of**) | employee master, bank account, PAN, scheme attributes |
| M03 Attendance/Leave | in (**snapshotted**) | paid/LWP days |
| M06 Promotion/Pay-fixation | in | fixation orders → structure & arrears (post-cutoff → deferral) |
| M09 Disciplinary | in | recovery orders (post-cutoff → deferral) |
| M11 Pension | out | last-pay-drawn, contribution history, gratuity accrual, **FnF handoff** |
| M12 Service Register | out | pay/scale-change & **separation** events (append) |
| M13 Documents | in/out | store payslips/Form-16/bank files/**challan scans** |
| M14 Dashboards | out | payroll cost & KPIs, **backlog/exception metrics** |
| Bank/Treasury gateway | out/in | **DSC-signed** disbursement file + ack + **positive-pay/treasury-debit** reconciliation |
| Tax portal (TRACES) / NPS-CRA | out/in | Form-24Q/Form-16 formats; **challan/CIN deposit confirmation** |
| Finance ERP (GL) | out/in | **cost-journal export + posting acknowledgement** |
| HSM / DSC service | in | cryptographic signing of bank files |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance (interactive) | P95 < 500ms for reads/config; payslip view < 1s |
| Performance (batch) | Compute 50,000 employees within 30 min; bank file generation + **DSC signing** < 5 min; snapshot freeze < 3 min |
| Determinism | Identical inputs **+ identical frozen snapshot** produce identical outputs; reproducible runs |
| Availability | 99.9% uptime; batch windows scheduled off-peak |
| Scalability | Horizontal scaling of compute workers; partition by org unit/cohort |
| Integrity | ACID per run; three-way tie-out; **disbursed+held+failed=net**; net≥0; immutable locked runs; **derived YTD ledger** |
| Security | OIDC/SSO+MFA; RBAC+row-level scope; SoD; field-level encryption for bank/PAN/salary; **HSM-held DSC keys (never in DB)**; masked display with audited reveal |
| Privacy | DPDP Act 2023; PII minimisation; statutory retention; right-to-access via self-service |
| Auditability | Every state change in `audit_log`; immutable; calc_trace retained; **lock-to-lock diffs; snapshot checksums** |
| Recoverability | RPO ≤ 15min, RTO ≤ 4h; run staging allows safe restart |
| Accessibility | WCAG 2.1 AA |
| Observability | Per-run metrics, exception dashboards, **disbursement ack + positive-pay monitoring, remittance-deadline & suspense-hold ageing alerts**, alerting on SLA breach |
| Compliance | Statutory deadline tracking **proven to actual deposit (challan/CIN MATCHED)** for TDS/PT/GPF/NPS; late-interest computation |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 Payroll Cycle / Run

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | freeze inputs **+ snapshot** | INPUT_LOCKED | after cutoff; snapshot frozen |
| INPUT_LOCKED | start FINAL run | COMPUTING | Payroll Officer; **no in-flight run** |
| COMPUTING | compute success | COMPUTED | totals tie (incl. rounding) |
| COMPUTING | engine fault | OPEN (run FAILED) | no commit; lock released |
| COMPUTED | reconcile sign-off | RECONCILED | recon SIGNED_OFF; disbursed+held+failed=net |
| RECONCILED | approve | APPROVED | checker ≠ creator |
| APPROVED | lock | LOCKED | payslips frozen |
| LOCKED | publish & disburse | DISBURSED | bank ack success / positive-pay confirmed |
| DISBURSED | remit & post | CLOSED | remittances MATCHED; GL ACKNOWLEDGED |
| LOCKED | reopen (justified, versioned) | REOPENED | pre-transmission only; no in-flight run |
| REOPENED | re-run (successor) | COMPUTING | Manager authority; originals SUPERSEDED |

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
| RECOVERING | separation | (settle in FnF) |
| REQUESTED | reject | REJECTED |

### 10.3 Benefit Claim

| Current | Event | Next |
|---|---|---|
| DRAFT | submit | SUBMITTED |
| SUBMITTED | recommend | RECOMMENDED |
| RECOMMENDED | approve | APPROVED |
| RECOMMENDED/SUBMITTED | reject | REJECTED |
| APPROVED | pay | PAID |

### 10.4 Bank Disbursement (v2)

| Current | Event | Next |
|---|---|---|
| DRAFT | validate (park excluded → holds) | VALIDATED |
| VALIDATED | **DSC/HSM sign** | SIGNED |
| SIGNED | transmit (unique batch ref) | TRANSMITTED |
| TRANSMITTED | ack success/partial | RECONCILED |
| TRANSMITTED | gateway timeout / ambiguous | **SUSPECTED_PROCESSED** |
| SUSPECTED_PROCESSED | **positive-pay: non-debit confirmed** | DRAFT (resend new batch ref) |
| SUSPECTED_PROCESSED | **positive-pay: debit confirmed** | RECONCILED |
| TRANSMITTED | ack failed | REJECTED (→ holds) |

### 10.5 Tax Declaration

| Current | Event | Next |
|---|---|---|
| DRAFT | submit | SUBMITTED |
| SUBMITTED | verify | VERIFIED |
| SUBMITTED | partial verify | PARTIALLY_VERIFIED |
| SUBMITTED | reject | REJECTED |
| any | FY cutoff | LOCKED |

### 10.6 Statutory Remittance

| Current | Event | Next |
|---|---|---|
| ACCRUED | schedule | SCHEDULED |
| SCHEDULED | capture challan/CIN/deposit | DEPOSITED |
| DEPOSITED | match (within tolerance) | MATCHED |
| SCHEDULED/DEPOSITED | past due, undeposited | OVERDUE |
| DEPOSITED | partial deposit | SHORT_PAID |

### 10.7 Full-and-Final Settlement

| Current | Event | Next |
|---|---|---|
| INITIATED | compute | COMPUTED |
| COMPUTED | reconcile | RECONCILED |
| RECONCILED | sanction + approve (≠ creator) | APPROVED |
| APPROVED | pay (positive net) | PAID |
| APPROVED | negative net | RECOVERY_PENDING |
| PAID/RECOVERY_PENDING | settle & M11 handoff | CLOSED |

---

## 11. Notifications

| Event | Recipient | Channel | Trigger FR |
|---|---|---|---|
| Snapshot frozen / post-cutoff deferral recorded | Payroll Officer/Mgr | in-app | FR-22 |
| Payroll run completed | Payroll Officer/Mgr | in-app, email | FR-04 |
| Concurrent run blocked (in-flight) | Payroll Officer | in-app | FR-04/16 |
| Reconciliation needs sign-off | Payroll Mgr | in-app, email | FR-15 |
| Run approved & locked | Payroll team | in-app | FR-16 |
| Payslip published / new version after reopen | Employee | in-app, email | FR-13 |
| Bank file transmitted / ack received | Payroll Mgr, Finance | in-app, email | FR-14 |
| **Disbursement SUSPECTED_PROCESSED — positive-pay required** | Payroll Mgr, Finance | in-app, email | FR-14 |
| Disbursement line failed / suspense hold created | Payroll Officer | in-app, email | FR-14 |
| Tax proof cutoff approaching | Employee | in-app, email | FR-07 |
| Tax declaration verified/rejected | Employee | in-app | FR-07 |
| Perquisite valued / revised | Employee | in-app | FR-21 |
| Loan sanctioned / closed / foreclosed | Employee | in-app, email | FR-08 |
| Benefit / leave-encashment claim status change | Employee, Mgr | in-app | FR-12 |
| Arrears computed/paid (with cascade) | Employee | in-app | FR-10 |
| **Statutory remittance deadline approaching / OVERDUE** | Payroll Officer, Mgr | in-app, email | FR-19 |
| **GL journal posted / acknowledged / rejected** | Payroll, Finance | in-app | FR-19 |
| **FnF computed / approved / paid / recovery-pending** | Employee, Payroll, M11 | in-app, email | FR-20 |
| Overpayment recovery legally-barred — adjudication needed | DDO, Payroll Mgr | in-app, email | FR-09 |
| Recovery applied/closed | Employee | in-app | FR-09 |

All notifications written to the shared `notifications` ledger; sensitive amounts excluded from notification bodies (link to portal).

---

## 12. Reporting & Analytics

| Report | Audience | Content |
|---|---|---|
| Payroll Register | Payroll, Auditor | per-employee + component summary per run |
| Reconciliation Report | Payroll Mgr | three-way tie-out, **disbursed/held/failed**, variance, exceptions |
| **Statutory Remittance Ledger & Deadline Report** | Payroll, Finance, Auditor | per-scheme accrued→deposited→matched, challan/CIN, **overdue & late-interest** |
| **Suspense / Disbursement-Hold Register** | Payroll, Finance | held net pay by reason, ageing, owner, re-disbursement status |
| **Un-recovered Deduction (Carryforward) Backlog** | Payroll, Finance | rolled-forward deductions by source, ageing, owner |
| Statutory Remittance Schedules | Payroll, Finance | PT/GPF/NPS/pension/TDS per period with splits |
| Form-16 / Form-24Q | Employee/Statutory | annual tax statement (**Part A from MATCHED**) / quarterly TDS return |
| **GL Cost-Journal & Posting-Status Report** | Payroll, Finance | balanced debit/credit per gl_code, posting status |
| Bank Disbursement & Ack Report | Payroll, Finance | batch totals, success/failed lines, positive-pay status |
| Cost-to-Organisation | Mgr, Finance | gross/net/employer-cost by org/cadre/component/period |
| Loan & Advance Outstanding | Payroll, Finance | outstanding principal/interest by employee/type |
| Arrears Report | Payroll, Auditor | arrear computations (**dependent cascade**) and payouts |
| **Full-and-Final Settlement Register** | Payroll, HR, Finance | per-separation netting, recovery-pending, M11 handoff |
| **Perquisite Register** | Payroll, Auditor | taxable perquisites by type/employee/FY |
| What-If Comparison | Mgr, Finance | scenario vs actual deltas (**board-paper export**) |
| Headcount Cost Trend | Mgr, Finance | period-over-period cost movement |

All reports honour row-level org scope, are paginated/exportable (CSV/PDF), and feed M14 dashboards. **The three backlog registers (suspense holds, carryforwards, overdue remittances) surface managed exceptions as first-class views — not invariants asserted only in prose.**

---

## 13. Migration & Launch

### 13.1 Data Migration

| Step | Detail |
|---|---|
| Master data | Load pay scales, pay-matrix levels, DA/HRA/**PT-by-state**/tax tables (effective-dated) |
| Employee structures | Migrate current salary structure per employee with current version + history where available |
| Deduction setup | Migrate GPF/NPS/PT scheme assignments; **seed YTD as a signed-off dataset (not a mutable scalar) reconstructable into the line ledger** |
| Loans | Migrate outstanding loans with amortization remaining and recovered-to-date; **flag concessional loans and seed perquisites** |
| YTD accumulators | Load FY-to-date earnings/deductions/TDS for mid-year cutover as **immutable seed lines** (critical for Form-16 continuity) |
| Benefits | Migrate enrolments, LTC block-year utilisation, gratuity accrual baseline, **leave balances for encashment** |
| Open obligations | Migrate **open carryforwards, suspense holds (if any), and un-deposited statutory liabilities** into the remittance ledger |

### 13.2 Validation & Parallel Run (STRENGTHENED GATE — R18)

- Run a **parallel payroll** for at least 2 cycles vs the legacy system.
- **Gate (must pass before go-live):** reconcile to **zero variance** on (a) per-employee net, (b) **YTD accumulators**, and (c) **per-scheme statutory totals** (TDS/PT/GPF/NPS). Monthly-net-only reconciliation is insufficient.
- The mid-year **YTD seed is a verified, signed-off dataset**; the line-ledger derivation must reproduce the seeded YTD exactly.
- Validate Form-24Q and Form-16 Part A against **MATCHED** remittances before first live filing.

### 13.3 Cutover & Launch

- Freeze legacy; lock migrated balances; run first live cycle in DRAFT, reconcile (incl. disbursed/held/failed), then FINAL.
- Phased rollout by org unit/cohort; self-service (payslip/declaration/FnF) enabled after first successful published cycle.
- Rollback plan: retain legacy read-only; first-cycle abort path defined.

### 13.4 Launch Readiness Checklist

Master data loaded & approved (incl. PT-by-state); structures reconciled; **YTD signed-off seed loaded & ledger-reproduced**; **bank file format certified with bank in test AND DSC/HSM signing path provisioned and tested (a week-1 long-pole — start at project start, not launch)**; **positive-pay reconciliation channel established with treasury**; reconciliation tie-out (incl. disbursed+held+failed) passing; SoD roles assigned; statutory output formats validated against TRACES/CRA; **remittance challan-capture & GL export integration tested**; audit logging & snapshot checksums verified.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | pay_components, pay_rules | /components,/rules,/dsl/grammar | rule DRAFT→ACTIVE | parser, property tests, overlap, SoD |
| FR-02 | rate_tables (PT+state), pay_matrix_levels | /rate-tables | rate effective | non-overlap, retrospective, PT-by-state |
| FR-03 | employee_salary_structures/components | /structures | structure versions | contiguity, scheme |
| FR-04 | payroll_runs, payslips, payslip_lines, run_input_snapshots | /cycles/{}/runs | §10.1 | determinism, quarantine, rounding, in-flight |
| FR-05 | payslips (LWP/subsistence), M03 | /attendance-inputs | — | per-day basis, subsistence, dies-non |
| FR-06 | deductions, deduction_carryforwards | /deductions | §10.6 (feed) | scheme, PT-by-state, derived YTD |
| FR-07 | tax_declarations (12B/10E) | /tax-declarations | §10.5 | regime, surcharge/cess/87A/10E |
| FR-08 | loans_advances, loan_repayments, perquisites | /loans | §10.2 | amortization, foreclosure, concessional perquisite |
| FR-09 | deductions (RECOVERY), deduction_carryforwards | /recoveries | — | priority, net floor, s.60, legal-eligibility |
| FR-10 | arrears | /arrears:compute | arrear COMPUTED→PAID | cascade, cross-FY 10E |
| FR-11 | payroll_cycles (OFF_CYCLE), disbursement_holds | /cycles, /holds:redisburse | §10.1 | YTD, duplicate, hold clearing |
| FR-12 | benefits, benefit_claims, gratuity_accruals | /benefit-claims | §10.3 | block-year, accrual, encashment |
| FR-13 | payslips (versioned), documents | /payslips:publish, /versions | payslip status | totals parity, lock gate, reopen versioning |
| FR-14 | bank_disbursements, disbursement_holds | /disbursements, :positive-pay | §10.4 | tie-out+holds, DSC-sign, positive-pay |
| FR-15 | payroll_reconciliations | /reconciliation | recon PENDING→SIGNED | three-way + disbursed/held/failed |
| FR-16 | payroll_runs/cycles, payslips | /runs:lock, :reopen | §10.1 | immutability, reopen versioning, in-flight |
| FR-17 | payslip_lines (YTD), statutory_remittances | /statutory/* | — | Form-16 tie-out + MATCHED |
| FR-18 | payroll_runs (WHATIF) | /analytics, /comparison | — | isolation, board-paper export |
| **FR-19** | statutory_remittances, gl_journals | /remittances, /gl-journal | §10.6 | accrual, challan match, late interest, GL balance |
| **FR-20** | fnf_settlements | /fnf | §10.7 | consolidation, net equation, M11 handoff |
| **FR-21** | perquisites | /perquisites | perquisite DRAFT→ACTIVE | Rule-3 valuation, tax inclusion |
| **FR-22** | run_input_snapshots | /snapshot:freeze | snapshot frozen | as-of, determinism, deferral, inter-DDO |

### 14.2 Dependency Graph (build order)

1. FR-01, FR-02 (foundational config) → 2. FR-03 (structures) → 3. **FR-22 (snapshot)** → 4. FR-05, FR-06, FR-08, FR-09 (inputs/deductions) **+ TDS spike FR-07 pulled forward (E's advice)** → 5. FR-04 (engine) → 6. FR-10, FR-11 (arrears/off-cycle) → 7. FR-15, FR-16 (recon/lock) → 8. FR-13, FR-14 (payslip/bank, **DSC week-1 long-pole**) → 9. FR-07, FR-21, FR-17 (tax/perquisite/statutory) → 10. **FR-19 (remittance/GL)** → 11. FR-12 (benefits) → 12. **FR-20 (FnF)** → 13. FR-18 (what-if/analytics).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Config | FR-01, FR-02 | start |
| B: Compensation + TDS spike | FR-03, FR-06, FR-08, FR-09, **FR-07 spike** | A |
| S: Snapshot | **FR-22** | A (needs M01/M03/M06/M09 clients) |
| C: Engine | FR-04, FR-05, FR-10, FR-11 | B, S |
| D: Controls | FR-15, FR-16 | C |
| E: Output + Disbursement | FR-13, FR-14 (**DSC long-pole started week 1**), FR-17 | D |
| F: Tax & Perquisite | FR-07, FR-21 | B (FR-07 needs FR-02) |
| G: Liability & Exit | **FR-19, FR-20** | E, F |
| H: Benefits | FR-12 | B |
| I: Analytics | FR-18 | C, D |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Salary structure & pay matrix | FR-01,02,03 | yes | yes | yes | yes | none |
| Constrained/versioned DSL | FR-01 + App.16.7 | yes | yes | yes | yes | none |
| PT by state of posting | FR-02,06 | yes | yes | n/a | yes | none |
| Cross-module snapshot | FR-22 | yes (E34) | yes | yes | yes | none |
| Payroll run engine + single-in-flight + rounding | FR-04 | yes | yes | yes | yes | none |
| Subsistence / dies-non | FR-04,05 + App.16.6 | yes | yes | n/a | yes | none |
| Attendance/LWP input | FR-05 | yes | yes | n/a | yes | none |
| Statutory deductions + derived YTD | FR-06 | yes | yes | n/a | yes | none |
| Income tax/TDS full pipeline | FR-07,17 | yes | yes | yes | yes | none |
| Taxable perquisites | FR-21 | yes (E32) | yes | yes | yes | none |
| Loans & advances + concessional perquisite | FR-08 | yes | yes | yes | yes | none |
| Recoveries + net floor + s.60 + legal-eligibility | FR-09 | yes (E35) | yes | n/a | yes | none |
| Arrears + dependent cascade | FR-10 | yes | yes | yes | yes | none |
| Supplementary/off-cycle + hold clearing | FR-11 | yes | yes | yes | yes | none |
| Benefits + leave encashment | FR-12 | yes | yes | yes | yes | none |
| Payslip generation + reopen versioning | FR-13 | yes | yes | yes | yes | none |
| Bank disbursement + DSC + positive-pay + suspense | FR-14 | yes (E31) | yes | yes | yes | none |
| Register & reconciliation (disbursed+held+failed) | FR-15 | yes | yes | yes | yes | none |
| Approval & locking/immutability + reopen-versioning | FR-16 | yes | yes | yes | yes | none |
| Form-16/24Q/remittance (Part A from MATCHED) | FR-17 | yes | yes | n/a | yes | none |
| Statutory remittance liability + GL posting | FR-19 | yes (E29,E33) | yes | yes | yes | none |
| Full-and-final settlement | FR-20 | yes (E30) | yes | yes | yes | none |
| What-if & cost analytics + board-paper | FR-18 | yes | yes | n/a | yes | none |
| Backlog reporting (holds/carryforward/overdue) | §12 + FR-09,14,19 | yes | yes | n/a | yes | none |
| Feeds to M11 (pension/FnF) | FR-08,12,17,20 + §8.5 | yes | yes | yes | yes | none |
| Pay/separation events to M12 (SR) | FR-03,10,16,20 + §8.5 | yes | yes | yes | yes | none |

**Result: 0 unresolved gaps.** Every v1 capability plus every Council Adopted Improvement (AI-1…AI-24) and Risk mitigation (R1–R19) maps to at least one FR, entity, state, and test.

---

## 15. Glossary

| Term | Definition |
|---|---|
| Pay Matrix / Level | Government pay structure of levels and progression cells (e.g., 7th CPC) |
| Basic Pay | Core pay at the assigned matrix cell |
| DA | Dearness Allowance, % of basic, revised periodically |
| HRA | House Rent Allowance, % by city class (X/Y/Z) |
| LWP | Leave Without Pay — unpaid leave causing loss of pay |
| Subsistence allowance | Reduced pay to a suspended employee; initial % escalating after a configured duration (App.16.6) |
| Dies-non | A period treated as neither pay nor qualifying service |
| GPF / CPF | General/Contributory Provident Fund |
| NPS / PRAN | National Pension System / Permanent Retirement Account Number |
| PT | Professional Tax (state-levied, slab-based; **resolved by state of posting**) |
| TDS | Tax Deducted at Source (income tax withheld) |
| Perquisite | Non-cash taxable benefit valued under Rule 3 (e.g., concessional loan, accommodation) |
| Surcharge / Marginal relief | Additional tax above income thresholds, capped by marginal relief |
| Cess | 4% Health & Education cess on (tax + surcharge) |
| 87A rebate | Statutory rebate for incomes within the prescribed limit |
| 89(1) / Form-10E | Relief for arrears spread across financial years |
| Form-12B | Previous-employer income statement for mid-year joiners |
| Form-16 Part A / Part B | Deposited-TDS certificate (from TRACES/MATCHED) / income & tax computation |
| Form-24Q | Quarterly TDS return |
| Challan / CIN | Statutory deposit receipt / Challan Identification Number |
| Pay-fixation | Re-determination of pay on promotion/upgradation |
| Arrears | Retrospective pay difference owed for past periods (with dependent-allowance cascade) |
| Off-cycle / Supplementary | Payments outside the regular monthly run |
| LTC / LTA | Leave Travel Concession / Allowance |
| Leave encashment | Cash for eligible unused leave balance (taxable in service; partly exempt at retirement) |
| Gratuity | Lump-sum terminal benefit accrued over service |
| FnF | Full-and-Final settlement at separation |
| Reconciliation tie-out | Equality of run totals, payslip sums, and `disbursed+held+failed=net` |
| Suspense hold | Net pay parked when an account is invalid/failed, pending re-disbursement |
| Carryforward | Un-recovered deduction rolled forward as an owned, aged backlog |
| Positive pay | Reconciliation against the treasury debit confirming whether credits posted |
| DSC / HSM | Digital Signature Certificate / Hardware Security Module (file authenticity) |
| Single-in-flight run | At most one active FINAL run per cycle |
| Snapshot (as-of) | Frozen capture of upstream M01/M03/M06/M09/org facts a run computes from |
| DDO-of-record | The Drawing & Disbursing Officer responsible for paying a transfer-month employee |
| SoD | Segregation of Duties (maker ≠ checker; signer ≠ creator; positive-pay confirmer ≠ transmitter) |
| What-if / Parallel run | Scenario computation without affecting live data |
| Net pay protection | Configurable floor ensuring deductions cannot push net below a minimum |
| DDO | Drawing and Disbursing Officer |

---

## 16. Appendices

### 16.1 Computation Order (default earning→deduction sequence)

1. BASIC → 2. DA (% basic) → 3. HRA (city-class % basic) → 4. Transport & other allowances → 5. Special pay → 6. **Perquisite (non-cash, taxable-income only)** → 7. Gross earnings → 8. GPF/NPS (% basic / basic+DA) → 9. PT (state slab on gross) → 10. TDS (full pipeline) → 11. Loan recovery → 12. Court attachment/disciplinary recovery (by priority, within s.60 exemption) → 13. Voluntary deductions → 14. **Rounding adjustment** → 15. Net pay (with net-protection re-balancing; shortfall → carryforward).

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; rates `NUMERIC(9,4)`; no floating point.
- Component rounding per `pay_rules.rounding`; default NEAREST (half-up) to rupee.
- Statutory deductions use their prescribed rounding.
- **A `ROUNDING_ADJUSTMENT` component absorbs `Σ(rounded) − round(Σ)` per payslip so gross/net identities tie to the rupee.**
- **Remittance tolerance:** a documented per-scheme tolerance absorbs the residue of summed per-employee statutory pennies against NSDL-CRA / GPF reconciliation; variance beyond tolerance is an exception, not a silent pass.

### 16.3 Net-Pay Protection, Attachment Exemption & Recovery Priority

- **Protected floor:** a configurable minimum net (by cadre/jurisdiction); deductions cannot push net below it.
- **Court-attachment exemption:** computed independently per CPC s.60 (not the flat floor); the attachable portion is bounded by statute.
- **Priority:** statutory (TDS/PT/GPF/NPS) → court attachment (within s.60 exemption) → disciplinary recovery → overpayment recovery (after legal-eligibility check) → loans → voluntary.
- If net would fall below the floor/exemption, lower-priority recoveries are reduced/deferred and **rolled into `deduction_carryforwards`** (owned, aged), not dropped.

### 16.4 Immutability & Correction Policy

A LOCKED run and its payslips are immutable. Corrections never edit the original; they are issued as: (a) arrears (FR-10) for retrospective entitlement, (b) supplementary/off-cycle (FR-11) for missed/additional payments, (c) recovery (FR-09) for overpayments, or (d) **reopen-with-versioning (FR-16)** pre-transmission, which supersedes the original payslip into a new version with a lock-to-lock diff. Each correction references the original run for traceability; **YTD always derives from the surviving (non-superseded) line ledger.**

### 16.5 Assumptions Log

- Single legal entity per deployment (data model entity-aware for future multi-entity); **PT supports multiple states within the entity.**
- Bank/treasury supports **one documented, certified file format**; the format is shipped, others (ISO20022/CUSTOM) deferred behind a `FileFormatStrategy` seam.
- Government notifications drive rate-table updates; entered by SysAdmin and approved by Payroll Manager.
- 30-day vs actual-days LWP basis is a configurable policy switch.
- **DSC/HSM signing infrastructure and a treasury positive-pay channel are available (week-1 long-pole).**
- **Finance ERP accepts a structured cost-journal export and returns a posting acknowledgement.**

### 16.6 Subsistence Allowance & Dies-Non (NEW — R13)

- **Subsistence (suspended employees):** initial subsistence = configured percentage of pay (default 50% of pay + applicable DA) for the first configured period; escalates by a configured step after N months of continued suspension (default: increase after 3 months and again after 6 months, per rules), subject to authority review. Statutory deductions compute on the subsistence base.
- **Dies-non:** a period declared dies-non yields **no pay and no qualifying service**; it is neither LWP nor leave; it suppresses earnings for those days and is flagged to M12 for the service record.

### 16.7 Formula DSL Semantics & Security (NEW — R14)

- **Grammar versioning:** the DSL grammar carries a `dsl_grammar_version`, versioned independently of `pay_rules.version`; a FORMULA component pins the grammar it was authored against; grammar upgrades re-validate or quarantine existing FORMULA rules.
- **Decimal semantics:** all evaluation uses fixed-point `NUMERIC`; no binary float; rounding per component rule.
- **Null propagation:** any null operand raises a rule exception (never silently treated as 0).
- **Precedence:** explicit, documented operator precedence; ambiguous expressions are rejected at parse time.
- **Whitelist:** only whitelisted operators, functions, component-code references, and employee-attribute references are permitted; no I/O, no loops, no code execution.
- **Concessional-loan perquisite (Rule 3):** perquisite value = reducing monthly outstanding × ((prescribed reference rate − charged rate) / 12), summed over the FY; reference rate is effective-dated master data.
- **Property tests:** decimal rounding, null propagation, precedence, division-by-zero, and circular-reference detection must pass before a FORMULA rule activates.

### 16.8 Mid-Month Inter-DDO Transfer Rule (NEW — R16)

- **Default — DDO-of-record:** the DDO-of-record for the transfer month (the snapshotted DDO at cutoff, or the destination DDO per policy) pays the full month; the control account and bank file attribute to that DDO. This avoids split-payment ambiguity for the common case.
- **Optional — split-period payslip:** where policy requires, the month is split at the transfer date into two payslip segments (source-DDO days and destination-DDO days), each attributed to its DDO's control account, reconciled to the same employee net.
- The chosen mode is a configurable policy; the snapshot (FR-22) records the DDO-of-record so disbursement and control-account attribution are deterministic.

### 16.9 Disbursement Anti-Duplication Protocol (NEW — R1/R2)

1. Each transmission carries a **unique `bank_batch_ref`**; the bank echoes it on ack.
2. Excluded/invalid-account net pay is **parked in `disbursement_holds`** (suspense), preserving `Σ disbursed + Σ held + Σ failed = run net`.
3. On gateway timeout/ambiguous ack the batch enters **`SUSPECTED_PROCESSED`**; **no resend is permitted** until a **positive-pay/treasury-debit reconciliation** confirms the credits did **not** post.
4. A confirmed non-debit allows resend under a **new `bank_batch_ref`**; a confirmed debit moves the batch to RECONCILED.
5. The DSC/HSM signature provides authenticity/non-repudiation; the checksum provides integrity only. The positive-pay confirmer must differ from the transmitter (SoD).

