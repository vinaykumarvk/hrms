# Retirement and Pension Management — HRMS Module BRD

**Module code:** M11-PEN
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory pension rules (CCS Pension Rules-style framework, NPS, GPF, Jeevan Pramaan/DLC)
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v1.0
**Status:** Draft for Gate A review

---

## 1. Executive Summary

### 1.1 Purpose

The Retirement and Pension Management module (**M11-PEN**) governs the complete lifecycle of an employee's separation from service and the lifelong administration of their pensionary and terminal benefits. It manages every **separation type** (superannuation/age retirement, voluntary retirement (VRS), compulsory retirement ordered under disciplinary proceedings, invalidation/medical retirement, death-in-service, and resignation); computes **qualifying service** and the full benefit set (basic pension, commutation, family/enhanced family pension, retirement and death gratuity, leave encashment, GPF final withdrawal); generates the statutory **Pension Payment Order (PPO)**; and maintains the **pensioner master** and pensioner lifecycle (life-certificate/Jeevan Pramaan, restoration of commuted portion, conversion to family pension on a pensioner's death, and pension revision on DA or pay-commission changes).

M11 is engineered as a **rule-driven, audit-grade benefit engine** that is deterministic and reproducible. Benefits are never hand-keyed; they are *derived* from verified service history in the **Digital Service Register (M12)**, last-pay-drawn and contribution history from **Payroll (M10)**, leave balances from **M03**, and disciplinary orders from **M09**, evaluated against versioned, effective-dated pension rule tables. Once a benefit case is **sanctioned and a PPO is issued, the calculation snapshot is immutable** — corrections flow only through controlled revision/re-issue with full audit. Every rupee of pension is traceable from qualifying-service input through PPO to disbursement.

### 1.2 Business Context and Problem Statement

Public-sector retirement processing is high-stakes, statutorily intricate, and time-critical: an employee who superannuates on the last day of a month must receive pension from the next day without a break. Processing combines **service-record verification** (gap-free service from joining to retirement), **qualifying-service arithmetic** (deducting non-qualifying spells such as extraordinary leave without pay, dies-non, and unauthorised absence), **dual pension regimes** (Old Pension Scheme (OPS) for pre-cutoff entrants vs the National Pension System (NPS) for later entrants), **commutation actuarial factors**, **family-pension rules** (normal vs enhanced rates and eligibility windows), **gratuity ceilings**, and **DA/pay-commission revisions** applied to a live pensioner population for decades. Manual processing produces delayed first pensions, miscalculated benefits, audit objections, litigation, and hardship to families of deceased employees. M11 eliminates these by making the rule set explicit and versioned, the computation reproducible and traceable, the workflow gated by service verification and no-dues, and the pensioner lifecycle fully digital.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Zero break in pension | First pension/anticipatory pension authorised on/before the day after retirement for 100% of cases |
| G2 | Deterministic, reproducible benefit computation | Re-running a case with identical verified inputs yields byte-identical benefit figures and trace |
| G3 | Statutory accuracy | 100% correct qualifying-service, pension, commutation, gratuity, family-pension computation against published rules |
| G4 | Service-verified eligibility | No PPO issued without M12 SR verification complete and no-dues cleared |
| G5 | Digital, self-service retirement | Retiring employee tracks case, runs estimators, and submits forms online; pensioner submits Digital Life Certificate online |
| G6 | Lifelong pensioner integrity | Correct DA/pay-commission revision, commuted-portion restoration, and family-pension conversion across the pensioner's life |
| G7 | Forecasting & liability transparency | Accurate due-for-retirement forecasts and pension-liability analytics by org unit, cadre, and horizon |

### 1.4 Scope Summary

In scope: retirement forecasting & due-for-retirement lists; separation-case management for all separation types; pre-retirement processing (1–2 years ahead: SR verification with M12, no-dues clearance, anticipatory pension); qualifying-service computation with non-qualifying-spell deduction; pension calculation (basic, NPS vs OPS handling); commutation; retirement & death gratuity; family & enhanced family pension; terminal benefits & final settlement (incl. leave encashment from M03, GPF final withdrawal); PPO generation (incl. digital PPO); pensioner master & lifecycle (life certificate/Jeevan Pramaan, restoration of commuted portion, family-pension conversion on pensioner death); pension revision on DA/pay-commission; treasury/bank/Pension Disbursing Authority (PDA) integration; retirement self-service portal & benefit estimators/what-if; pensioner grievance management; and forecasting & pension-liability analytics.

Out of scope (owned elsewhere): the canonical employee master (M01); the SR ledger itself (M12) — M11 reads/verifies and appends retirement events; payroll computation of in-service salary and the monthly active-employee payslip (M10) — M11 consumes last-pay-drawn and contribution history; leave capture and encashable-balance maintenance (M03); disciplinary adjudication that issues a compulsory-retirement penalty order (M09) — M11 consumes the order; document storage internals (M13); and core banking/treasury ledger posting beyond producing and reconciling the disbursement file.

### 1.5 Key Stakeholders

Retiring Employee / Pensioner / Family Pensioner (self-service), Pension Officer/Dealing Assistant (maker), Pension Sanctioning Authority / Head of Office (checker), HR Officer/Admin, SR Custodian/Registrar (M12), Payroll Officer (M10 last-pay & contributions), Department Head / Appointing Authority, Treasury / Pension Disbursing Authority (PDA) / Bank, Medical Board (invalidation), Auditor, System Administrator.

### 1.6 Success Criteria

A retirement case is "successful" when: the separation is recorded with the correct type and date; service is verified gap-free in M12; no-dues is cleared; qualifying service and all benefits are computed deterministically with full trace and sanctioned by an authority distinct from the maker; the PPO (and where applicable anticipatory pension) is issued before pension commencement; terminal benefits and GPF are settled; the pensioner is enrolled in the pensioner master; the disbursement instruction is accepted by the PDA/bank; and a retirement event is appended to M12 — all with a complete, immutable audit trail.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Retirement Forecasting & Due-for-Retirement | M11-F01 | Projected superannuation dates, horizon lists, alerts, workload forecasting |
| Separation Case Management | M11-F02 | Initiate/track all separation types with type-specific data & workflow |
| Pre-Retirement Processing | M11-F03 | SR verification (M12), no-dues clearance, anticipatory pension, 1–2-year lead pipeline |
| Qualifying Service Computation | M11-F04 | Count service, deduct non-qualifying spells (EOL/LWP, dies-non, absence), round per rule |
| Pension Calculation | M11-F05 | Basic pension (OPS) / NPS handling, emoluments base, minimum/maximum, proportionate pension |
| Commutation of Pension | M11-F06 | Commuted value, commutation factor by age, residual pension, restoration timeline |
| Gratuity Computation | M11-F07 | Retirement gratuity & death gratuity with service slabs and statutory ceiling |
| Family & Enhanced Family Pension | M11-F08 | Normal & enhanced family pension, eligibility, beneficiary hierarchy & windows |
| Terminal Benefits & Final Settlement | M11-F09 | Leave encashment (M03), composite final settlement, recoveries netting |
| GPF Final Withdrawal | M11-F10 | GPF final balance, interest, advances adjustment, final authorisation |
| PPO Generation & Digital PPO | M11-F11 | Pension Payment Order (single/double-comp), e-PPO, PPO number registry |
| Pensioner Master & Lifecycle | M11-F12 | Pensioner record, Jeevan Pramaan/DLC, restoration, family-pension conversion on death |
| Pension Revision | M11-F13 | DA revision & pay-commission revision across the pensioner population |
| Treasury / Bank / PDA Integration | M11-F14 | Disbursement instructions, PPO authorisation transfer, acknowledgement reconciliation |
| Retirement Self-Service & Estimators | M11-F15 | Employee portal, benefit estimator / what-if, form submission, status tracking |
| Pensioner Grievance Management | M11-F16 | Grievance intake, routing, SLA, resolution for pensioners/family pensioners |
| Forecasting & Pension-Liability Analytics | M11-F17 | Liability projection, benefit-cost analytics, SLA & ageing dashboards |

### 2.2 Common Capabilities (inherited from Shared Foundation)

All M11 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); maker-checker via the shared workflow engine; RBAC + org-unit row-level scoping; immutable `audit_log` write on every state change; `documents` (M13) for generated artefacts (PPO, sanction orders, calculation sheets); `notifications` for events; `service_register_events` (M12) for retirement/separation events.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In M11? | Owner / Note |
|---|---|---|
| Employee master data | Reference only | M01 (golden source) |
| Service history / SR ledger | Verify & append | M12 owns ledger; M11 verifies gap-free service & appends retirement events |
| Last-pay-drawn & contribution history | Consume only | M10 supplies emoluments base, GPF/NPS contributions |
| Leave encashable balance | Consume only | M03 supplies encashable EL balance; M11 computes encashment amount |
| Compulsory-retirement penalty order | Consume the order | M09 adjudicates; M11 processes the resulting separation |
| Disciplinary recovery against benefits | Consume; net from settlement | M09 issues recovery; M11 nets within statutory protection |
| Active-employee payroll run | Out | M10 (M11 begins at separation/retirement) |
| Pension monthly disbursement ledger | Instruction + reconcile | PDA/Treasury/Bank disburse; M11 instructs & reconciles |
| Document storage internals | Reference | M13 stores PPO/sanction/calc-sheet objects |
| Medical fitness adjudication | Consume verdict | Medical Board issues invalidation certificate; M11 records & uses it |

### 2.4 Assumptions and Constraints

- Pension/commutation/gratuity rules, DA rates for pensioners, commutation factors by age, family-pension rates, and gratuity ceilings are **configurable, effective-dated master data**, sourced from government notifications and version-controlled.
- The OPS/NPS cutover date (date of joining boundary) is configurable; scheme is derived from `employees.date_of_joining` and recorded contribution history, overridable with justification and audit.
- A single legal entity per deployment; the data model is entity-aware (`legal_entity_id`) for future multi-entity.
- All money math uses fixed-point decimal (`NUMERIC`); rounding rules per statutory prescription are explicit and configurable (default benefit rounding to the next higher rupee where rules so require).
- "Emoluments" / "average emoluments" base and the reckonable period (e.g., last-drawn vs 10-month average, whichever beneficial) are configurable policy parameters resolved per case and snapshotted.
- Digital Life Certificate integrates with a Jeevan Pramaan-style service; manual life-certificate capture is always available as a fallback.

---

## 3. Roles & Permissions

### 3.1 Module Roles (extending the Shared RBAC baseline)

| Role | M11 responsibility |
|---|---|
| Employee / Retiring Employee (Self-Service) | View own forecast & case status, run estimators, submit pension forms/options (commutation, nominee), upload documents |
| Pensioner / Family Pensioner (Self-Service) | View PPO & pension details, submit Digital Life Certificate, raise grievances, update bank/contact |
| Pension Officer / Dealing Assistant (Maker) | Create/process separation cases, compute qualifying service & benefits, prepare PPO, prepare disbursement |
| Pension Sanctioning Authority / Head of Office (Checker) | Verify and sanction benefits, authorise PPO, approve revisions, authorise anticipatory pension |
| HR Officer / Admin | Initiate cases, assist data entry, manage no-dues coordination within delegated scope |
| SR Custodian / Registrar (M12) | Certify gap-free service verification used by the case |
| Payroll Officer (M10) | Confirm last-pay-drawn, recoveries, GPF/NPS contribution figures |
| Department Head / Appointing Authority | Accept VRS, initiate compulsory retirement linkage (from M09), sanction within authority |
| Treasury / PDA / Bank | Receive disbursement & PPO authorisation; confirm acknowledgement |
| Medical Board | Record invalidation/medical-unfitness certificate for invalidation retirement |
| Auditor (read-only) | Read all cases, calculations, PPOs, pensioner data, and audit log; no write |
| System Administrator | Manage rule tables (DA, commutation factors, family-pension rates, ceilings, OPS/NPS cutover), RBAC; **no transactional self-approval** |

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Sanction, X=No access)

| Capability | Employee/Retiree | Pensioner | Pension Officer | Sanctioning Auth | HR Admin | SR Custodian | Payroll Officer | Treasury/PDA | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| Retirement forecast / due-list | R (own) | X | C/R | R | R | R | R | X | R | R |
| Separation case | R (own) | X | C/R/U | A | C/R (request) | R | R | X | R | X |
| SR verification certificate | R (own) | X | R | R | R | C/R/A | X | X | R | X |
| No-dues clearance | R (own) | X | C/R/U | R | C/R/U | X | R (payroll dues) | X | R | X |
| Qualifying service computation | R (own) | X | C/R/U | A | X | R | X | X | R | X |
| Pension / commutation / gratuity calc | R (own) | R (own) | C/R/U | A | X | X | R | X | R | X |
| Family pension setup | R (own) | R (own) | C/R/U | A | C (request) | X | X | X | R | X |
| Terminal benefits / GPF settlement | R (own) | X | C/R/U | A | R | X | R | X | R | X |
| PPO generation / authorisation | R (own e-PPO) | R (own e-PPO) | C/R | A (authorise) | X | X | X | R | R | X |
| Pensioner master | X | R/U (own contact/bank) | C/R/U | A | R | X | X | R | R | X |
| Life certificate / DLC | X | C/R (own) | R/U (verify) | R | R | X | X | X | R | X |
| Restoration of commuted portion | X | R (own) | C/R | A | X | X | X | X | R | X |
| Pension revision (DA/pay-commission) | X | R (own) | C/R | A | X | X | X | X | R | X |
| Disbursement instruction | X | X | C/R | A (authorise) | X | X | R | R/U (ack) | R | X |
| Benefit estimator / what-if | R (own) | R (own) | C/R | R | R | X | X | X | R | X |
| Grievance | X | C/R (own) | R/U (resolve) | A (escalated) | R | X | X | X | R | X |
| Rule tables (DA/factors/rates/ceilings) | X | X | R | R | R | X | X | X | R | C/R/U/A |
| Liability / analytics | X | X | R | R | R (own unit) | X | X | X | R | R |
| Audit log | X | X | R (own actions) | R | X | X | X | X | R | R |

**Segregation of duties:** maker ≠ checker is enforced — the Pension Officer who computes/prepares a case cannot sanction it or authorise its PPO; the SysAdmin who maintains rule tables cannot sanction a case in which they are the subject. SR verification (M12 Custodian) and no-dues sign-offs are independent control points.

---

## 4. Shared Application Foundation

M11 inherits the Shared Foundation §5 technical defaults verbatim: React + TypeScript (Tailwind + shadcn/ui) frontend; REST `/api/v1`; PostgreSQL primary store; encrypted object storage for PPOs/sanction orders/calculation sheets; OIDC/SSO + MFA; JWT + RBAC + org-unit row-level scoping; canonical error envelope; OWASP ASVS; TLS 1.2+, encryption at rest; DPDP Act 2023 alignment; P95 < 500ms (interactive), batch SLAs in §10; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

**M11-specific foundation extensions:**

- **Money type:** `NUMERIC(15,2)` for all benefit amounts; rates/factors as `NUMERIC(9,4)`; service durations as integer years/months/days; no floating point in computation.
- **Computation determinism:** every benefit engine is a pure function of (verified service record, emoluments snapshot, scheme, rule tables effective on the relevant date, beneficiary data). Same inputs → same outputs; a `calc_trace` (JSONB) is persisted with each calculation.
- **Immutability:** a sanctioned calculation and its issued PPO are append-only snapshots; corrections create a new revision linked to the original (no silent edit).
- **Idempotency:** all case-progression, PPO-issue, revision, and disbursement mutating endpoints accept an `Idempotency-Key` header.
- **Transactionality:** sanction, PPO issue, and family-pension conversion each commit as all-or-nothing transactions; multi-step settlement writes use transactions.
- **Encryption & PII:** bank account numbers, PAN/national_id, nominee details, and benefit amounts are PII/financial data — encrypted at rest, masked in UI by default, access logged. Deceased-employee/family-pensioner data handled with heightened sensitivity.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| E01 | `employees` | Shared (M01) | M01 | Employee master (referenced) |
| E02 | `org_units` | Shared | Platform | Org hierarchy (referenced) |
| E03 | `service_register_events` | Shared (M12) | M12 | Service ledger (verified/read; retirement events appended) |
| E04 | `separation_cases` | M11 | M11 | Master case for a separation/retirement of all types |
| E05 | `qualifying_service_records` | M11 | M11 | Computed qualifying service per case with reckonable totals |
| E06 | `non_qualifying_spells` | M11 | M11 | Per-spell non-qualifying periods deducted from gross service |
| E07 | `pension_calculations` | M11 | M11 | Basic/proportionate pension computation snapshot (OPS) / NPS treatment |
| E08 | `commutation_records` | M11 | M11 | Commuted value, factor, residual pension, restoration schedule |
| E09 | `gratuity_calculations` | M11 | M11 | Retirement & death gratuity computation with ceiling |
| E10 | `family_pension_records` | M11 | M11 | Family pension entitlement, normal/enhanced rates, beneficiaries |
| E11 | `terminal_settlements` | M11 | M11 | Composite final settlement incl. leave encashment & recoveries |
| E12 | `gpf_final_settlements` | M11 | M11 | GPF final balance, interest, advances adjustment, authorisation |
| E13 | `ppo_records` | M11 | M11 | Pension Payment Order header + registry + e-PPO |
| E14 | `pensioners` | M11 | M11 | Pensioner master & lifecycle status |
| E15 | `pensioner_life_certificates` | M11 | M11 | Annual life certificate / Digital Life Certificate (DLC) records |
| E16 | `pension_revisions` | M11 | M11 | DA / pay-commission revision batches and per-pensioner deltas |
| E17 | `pension_disbursements` | M11 | M11 | Disbursement instruction batches/lines & PDA acknowledgement |
| E18 | `retirement_forecasts` | M11 | M11 | Materialised due-for-retirement projections & workload |
| E19 | `pension_grievances` | M11 | M11 | Pensioner/family grievance tickets with SLA |
| E20 | `benefit_estimates` | M11 | M11 | Self-service / what-if benefit estimation snapshots (non-binding) |
| E21 | `nominees_beneficiaries` | M11 | M11 | Nominee/beneficiary register for gratuity, GPF, family pension |
| E22 | `audit_log` | Shared | Platform | Immutable audit (written) |
| E23 | `documents` | Shared (M13) | M13 | PPO/sanction/calc-sheet object metadata (referenced) |
| E24 | `notifications` | Shared | Platform | Outbound events (written) |
| E25 | `workflow_instances`/`workflow_tasks` | Shared | Platform | Approvals (used) |

### 5.2 Full Field Tables (M11-owned entities)

#### E04 `separation_cases`

| Field | Type | Null | Notes |
|---|---|---|---|
| `case_id` | UUID PK | N | |
| `case_no` | TEXT unique | N | human key e.g. `PEN-2026-000123` |
| `employee_id` | UUID FK→employees | N | subject |
| `separation_type` | ENUM | N | SUPERANNUATION, VOLUNTARY_RETIREMENT, COMPULSORY_RETIREMENT, INVALIDATION, DEATH_IN_SERVICE, RESIGNATION |
| `pension_scheme` | ENUM | N | OPS, NPS (derived, overridable w/ reason) |
| `retirement_date` | DATE | N | date of cessation of service |
| `pension_commence_date` | DATE | Y | day after retirement (or per rule) |
| `reason_ref` | TEXT | Y | M09 order id (compulsory), VRS application id, medical board ref, death report ref |
| `notice_date` | DATE | Y | VRS notice / order date |
| `initiated_by_role` | ENUM | N | SELF, HR, SYSTEM_FORECAST, DISCIPLINARY_M09 |
| `sr_verification_id` | UUID FK→qualifying_service_records | Y | links verified service |
| `no_dues_status` | ENUM | N | NOT_STARTED, IN_PROGRESS, CLEARED, BLOCKED |
| `anticipatory_pension_flag` | BOOL | N | anticipatory pension authorised |
| `status` | ENUM | N | DRAFT, INITIATED, SR_VERIFICATION, NO_DUES, CALCULATION, PENDING_SANCTION, SANCTIONED, PPO_ISSUED, SETTLED, CLOSED, ON_HOLD, REJECTED |
| `legal_entity_id` | UUID | N | |
| `org_unit_id` | UUID FK→org_units | N | scope |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E05 `qualifying_service_records`

| Field | Type | Null | Notes |
|---|---|---|---|
| `qsr_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `service_start_date` | DATE | N | date of joining (reckonable) |
| `service_end_date` | DATE | N | retirement/death date |
| `gross_service_y` | INT | N | gross years |
| `gross_service_m` | INT | N | gross months |
| `gross_service_d` | INT | N | gross days |
| `non_qualifying_days` | INT | N | total deducted days (sum of spells) |
| `net_qualifying_y` | INT | N | net qualifying years after deduction |
| `net_qualifying_m` | INT | N | net qualifying months |
| `net_qualifying_d` | INT | N | net qualifying days |
| `reckonable_half_years` | INT | N | rounded half-years used for benefit (per rule) |
| `weightage_years` | INT | Y | additional qualifying weightage (e.g., VRS) |
| `sr_verified` | BOOL | N | M12 gap-free verification complete |
| `sr_verified_by` | UUID FK→users | Y | SR Custodian |
| `sr_verified_at` | TIMESTAMP | Y | |
| `verification_notes` | TEXT | Y | gaps/condonations recorded |
| `status` | ENUM | N | DRAFT, VERIFIED, LOCKED |
| audit fields | — | — | |

#### E06 `non_qualifying_spells`

| Field | Type | Null | Notes |
|---|---|---|---|
| `spell_id` | UUID PK | N | |
| `qsr_id` | UUID FK→qualifying_service_records | N | |
| `spell_type` | ENUM | N | EOL_LWP_NON_QUALIFYING, DIES_NON, UNAUTHORISED_ABSENCE, SUSPENSION_NON_DUTY, BREAK_IN_SERVICE, OTHER |
| `source_module` | ENUM | N | M03, M04, M09, MANUAL |
| `source_ref` | TEXT | Y | leave/SR event id, M09 order id |
| `from_date` | DATE | N | |
| `to_date` | DATE | N | |
| `days` | INT | N | computed inclusive days |
| `condoned` | BOOL | N | condoned (counts as qualifying) |
| `condonation_ref` | TEXT | Y | order authorising condonation |
| `remarks` | TEXT | Y | |
| audit fields | — | — | |

#### E07 `pension_calculations`

| Field | Type | Null | Notes |
|---|---|---|---|
| `pension_calc_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `scheme` | ENUM | N | OPS, NPS |
| `emoluments_base` | NUMERIC(15,2) | Y | last-drawn or average emoluments (OPS) |
| `emoluments_method` | ENUM | Y | LAST_DRAWN, AVG_10_MONTH, BENEFICIAL_OF_BOTH |
| `avg_emoluments` | NUMERIC(15,2) | Y | 10-month average if used |
| `qualifying_half_years` | INT | Y | from QSR |
| `pension_fraction` | NUMERIC(9,4) | Y | e.g. 0.50 of base (full), proportionate if short service |
| `basic_pension` | NUMERIC(15,2) | Y | computed monthly basic pension (OPS) |
| `minimum_pension_applied` | BOOL | N | floored to statutory minimum |
| `maximum_pension_cap_applied` | BOOL | N | capped to statutory maximum |
| `nps_corpus_ref` | TEXT | Y | NPS PRAN / corpus reference (NPS) |
| `nps_annuity_estimate` | NUMERIC(15,2) | Y | indicative annuity (NPS, informational) |
| `nps_lumpsum_estimate` | NUMERIC(15,2) | Y | indicative withdrawal (NPS) |
| `calc_trace` | JSONB | N | step-by-step derivation |
| `rule_version_ref` | TEXT | N | effective rule snapshot id |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, SUPERSEDED |
| audit fields | — | — | |

#### E08 `commutation_records`

| Field | Type | Null | Notes |
|---|---|---|---|
| `commutation_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `pension_calc_id` | UUID FK→pension_calculations | N | |
| `opted` | BOOL | N | employee opted to commute |
| `commuted_fraction` | NUMERIC(9,4) | Y | fraction of pension commuted (≤ statutory max, e.g. 0.40) |
| `commuted_pension_amount` | NUMERIC(15,2) | Y | monthly pension portion commuted |
| `age_next_birthday` | INT | Y | for factor lookup |
| `commutation_factor` | NUMERIC(9,4) | Y | from factor table by age |
| `commuted_value` | NUMERIC(15,2) | Y | lump sum = commuted×factor×12 |
| `residual_pension` | NUMERIC(15,2) | Y | basic − commuted portion |
| `restoration_due_date` | DATE | Y | date commuted portion restores (e.g., 15 yrs) |
| `restored` | BOOL | N | restoration applied |
| `restored_on` | DATE | Y | |
| `calc_trace` | JSONB | Y | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, RESTORED, SUPERSEDED |
| audit fields | — | — | |

#### E09 `gratuity_calculations`

| Field | Type | Null | Notes |
|---|---|---|---|
| `gratuity_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `gratuity_type` | ENUM | N | RETIREMENT_GRATUITY, DEATH_GRATUITY |
| `emoluments_base` | NUMERIC(15,2) | N | basic+DA at relevant date |
| `qualifying_half_years` | INT | N | capped per rule (e.g. max 66) |
| `service_slab_factor` | NUMERIC(9,4) | Y | death-gratuity slab multiplier by service length |
| `computed_amount` | NUMERIC(15,2) | N | before ceiling |
| `statutory_ceiling` | NUMERIC(15,2) | N | effective ceiling |
| `ceiling_applied` | BOOL | N | |
| `payable_amount` | NUMERIC(15,2) | N | min(computed, ceiling) |
| `withheld_amount` | NUMERIC(15,2) | Y | withheld pending no-dues |
| `nominee_split` | JSONB | Y | beneficiary apportionment (death gratuity) |
| `calc_trace` | JSONB | N | |
| `rule_version_ref` | TEXT | N | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, SUPERSEDED |
| audit fields | — | — | |

#### E10 `family_pension_records`

| Field | Type | Null | Notes |
|---|---|---|---|
| `fp_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | Y | from death-in-service or pensioner death conversion |
| `source_pensioner_id` | UUID FK→pensioners | Y | when converted on pensioner death |
| `employee_id` | UUID FK→employees | N | original employee |
| `emoluments_base` | NUMERIC(15,2) | N | base for family pension |
| `normal_rate_pct` | NUMERIC(9,4) | N | e.g. 0.30 of emoluments |
| `enhanced_rate_pct` | NUMERIC(9,4) | Y | e.g. 0.50 of emoluments |
| `normal_amount` | NUMERIC(15,2) | N | monthly normal family pension |
| `enhanced_amount` | NUMERIC(15,2) | Y | monthly enhanced family pension |
| `enhanced_from` | DATE | Y | enhanced period start |
| `enhanced_to` | DATE | Y | enhanced period end (7 yrs / age-67 rule etc.) |
| `current_beneficiary_id` | UUID FK→nominees_beneficiaries | Y | active recipient |
| `beneficiary_hierarchy` | JSONB | Y | ordered eligible-beneficiary chain |
| `eligibility_review_date` | DATE | Y | next review (minor majority, remarriage, disability) |
| `calc_trace` | JSONB | N | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, ACTIVE, TRANSFERRED, CEASED, SUPERSEDED |
| audit fields | — | — | |

#### E11 `terminal_settlements`

| Field | Type | Null | Notes |
|---|---|---|---|
| `settlement_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `leave_encashment_days` | INT | Y | encashable EL days (from M03) |
| `leave_encashment_amount` | NUMERIC(15,2) | Y | computed encashment |
| `gratuity_ref` | UUID FK→gratuity_calculations | Y | |
| `gpf_settlement_ref` | UUID FK→gpf_final_settlements | Y | |
| `commuted_value_ref` | UUID FK→commutation_records | Y | |
| `other_dues` | JSONB | Y | group insurance, deposit-linked insurance, etc. |
| `recoveries_total` | NUMERIC(15,2) | Y | M09/overpayment/loan recoveries netted |
| `recovery_refs` | JSONB | Y | links to recovery orders |
| `gross_settlement` | NUMERIC(18,2) | N | sum of components |
| `net_settlement` | NUMERIC(18,2) | N | gross − recoveries |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, PARTIALLY_WITHHELD, SUPERSEDED |
| audit fields | — | — | |

#### E12 `gpf_final_settlements`

| Field | Type | Null | Notes |
|---|---|---|---|
| `gpf_settlement_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `gpf_account_no` | TEXT | Y | encrypted/masked |
| `closing_balance` | NUMERIC(15,2) | N | from M10 contribution ledger |
| `interest_upto_date` | NUMERIC(15,2) | Y | interest accrued to settlement date |
| `outstanding_advances` | NUMERIC(15,2) | Y | unrecovered GPF advances |
| `final_payable` | NUMERIC(15,2) | N | closing+interest−advances |
| `nominee_split` | JSONB | Y | for death cases |
| `authorised_by` | UUID FK→users | Y | sanctioning authority |
| `authorised_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | DRAFT, COMPUTED, AUTHORISED, PAID, SUPERSEDED |
| audit fields | — | — | |

#### E13 `ppo_records`

| Field | Type | Null | Notes |
|---|---|---|---|
| `ppo_id` | UUID PK | N | |
| `ppo_no` | TEXT unique | N | statutory PPO number (registry-issued) |
| `case_id` | UUID FK→separation_cases | N | |
| `pensioner_id` | UUID FK→pensioners | Y | set on enrolment |
| `ppo_type` | ENUM | N | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, REVISED |
| `pension_calc_ref` | UUID FK→pension_calculations | Y | |
| `family_pension_ref` | UUID FK→family_pension_records | Y | |
| `basic_pension` | NUMERIC(15,2) | Y | sanctioned basic |
| `commuted_portion` | NUMERIC(15,2) | Y | |
| `residual_pension` | NUMERIC(15,2) | Y | |
| `pda_id` | UUID | Y | pension disbursing authority/treasury/bank |
| `effective_from` | DATE | N | pension commencement |
| `e_ppo_document_id` | UUID FK→documents | Y | digital PPO artefact |
| `authorised_by` | UUID FK→users | Y | sanctioning authority |
| `authorised_at` | TIMESTAMP | Y | |
| `supersedes_ppo_id` | UUID FK→ppo_records | Y | for REVISED PPOs |
| `status` | ENUM | N | DRAFT, ISSUED, AUTHORISED_TO_PDA, ACTIVE, SUPERSEDED, CANCELLED |
| audit fields | — | — | |

#### E14 `pensioners`

| Field | Type | Null | Notes |
|---|---|---|---|
| `pensioner_id` | UUID PK | N | |
| `pensioner_no` | TEXT unique | N | human key |
| `employee_id` | UUID FK→employees | Y | original employee (null only for external migrations) |
| `pensioner_type` | ENUM | N | SELF_PENSIONER, FAMILY_PENSIONER |
| `current_ppo_id` | UUID FK→ppo_records | Y | active PPO |
| `current_monthly_pension` | NUMERIC(15,2) | Y | post-revision current value |
| `bank_account_masked` | TEXT | Y | encrypted at rest |
| `pda_id` | UUID | Y | disbursing authority |
| `date_of_commencement` | DATE | N | |
| `date_of_birth` | DATE | Y | for age-based events |
| `last_life_certificate_date` | DATE | Y | |
| `next_life_certificate_due` | DATE | Y | |
| `lifecycle_status` | ENUM | N | ACTIVE, SUSPENDED_NO_LC, DECEASED, CONVERTED_TO_FAMILY, CEASED |
| `date_of_death` | DATE | Y | triggers family-pension conversion |
| `contact` | JSONB | Y | phone/email/address |
| audit fields | — | — | |

#### E15 `pensioner_life_certificates`

| Field | Type | Null | Notes |
|---|---|---|---|
| `lc_id` | UUID PK | N | |
| `pensioner_id` | UUID FK→pensioners | N | |
| `period_year` | INT | N | LC year |
| `submission_mode` | ENUM | N | DIGITAL_DLC, PHYSICAL, VIDEO_KYC, BANK_CERTIFIED |
| `dlc_reference` | TEXT | Y | Jeevan Pramaan-style proof id |
| `submitted_on` | DATE | Y | |
| `verified` | BOOL | N | |
| `verified_by` | UUID FK→users | Y | |
| `valid_until` | DATE | Y | |
| `status` | ENUM | N | DUE, SUBMITTED, VERIFIED, REJECTED, OVERDUE |
| audit fields | — | — | |

#### E16 `pension_revisions`

| Field | Type | Null | Notes |
|---|---|---|---|
| `revision_id` | UUID PK | N | |
| `revision_batch_no` | TEXT unique | N | human key |
| `revision_type` | ENUM | N | DA_REVISION, PAY_COMMISSION_REVISION, RULE_CORRECTION |
| `effective_from` | DATE | N | |
| `parameter_ref` | TEXT | Y | DA% / pay-commission table id |
| `scope_filter` | JSONB | Y | pensioner cohort filter |
| `pensioner_id` | UUID FK→pensioners | Y | per-line (when expanded) |
| `old_pension` | NUMERIC(15,2) | Y | |
| `new_pension` | NUMERIC(15,2) | Y | |
| `arrear_amount` | NUMERIC(15,2) | Y | retrospective arrear |
| `calc_trace` | JSONB | Y | |
| `status` | ENUM | N | DRAFT, COMPUTED, APPROVED, APPLIED, FAILED, SUPERSEDED |
| audit fields | — | — | |

#### E17 `pension_disbursements`

| Field | Type | Null | Notes |
|---|---|---|---|
| `disbursement_id` | UUID PK | N | |
| `batch_no` | TEXT unique | N | human key |
| `disbursement_type` | ENUM | N | FIRST_PENSION, MONTHLY_PENSION, ARREAR, TERMINAL_BENEFIT, GRATUITY, COMMUTED_VALUE, GPF |
| `pda_id` | UUID | Y | treasury/bank/PDA |
| `period_month` | INT | Y | |
| `period_year` | INT | Y | |
| `pensioner_id` | UUID FK→pensioners | Y | per-line |
| `case_id` | UUID FK→separation_cases | Y | for terminal/one-time payments |
| `amount` | NUMERIC(15,2) | N | |
| `instruction_status` | ENUM | N | DRAFT, AUTHORISED, TRANSMITTED, ACKNOWLEDGED, PARTIALLY_ACK, FAILED, RECONCILED |
| `ack_reference` | TEXT | Y | PDA/bank acknowledgement id |
| `failure_reason` | TEXT | Y | |
| audit fields | — | — | |

#### E18 `retirement_forecasts`

| Field | Type | Null | Notes |
|---|---|---|---|
| `forecast_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `projected_retirement_date` | DATE | N | superannuation date from DOB + retirement age |
| `retirement_age` | INT | N | applicable superannuation age (cadre rule) |
| `months_to_retirement` | INT | N | computed at refresh |
| `horizon_bucket` | ENUM | N | LT_6M, M6_12, M12_24, GT_24 |
| `case_initiated` | BOOL | N | a separation_case exists |
| `org_unit_id` | UUID FK→org_units | N | |
| `cadre` | TEXT | Y | |
| `last_refreshed_at` | TIMESTAMP | N | |
| audit fields | — | — | |

#### E19 `pension_grievances`

| Field | Type | Null | Notes |
|---|---|---|---|
| `grievance_id` | UUID PK | N | |
| `grievance_no` | TEXT unique | N | human key |
| `pensioner_id` | UUID FK→pensioners | Y | |
| `case_id` | UUID FK→separation_cases | Y | for pre-PPO grievances |
| `category` | ENUM | N | PAYMENT_NOT_RECEIVED, WRONG_AMOUNT, REVISION_NOT_APPLIED, LC_ISSUE, BANK_DETAIL, PPO_ERROR, OTHER |
| `description` | TEXT | N | |
| `priority` | ENUM | N | LOW, MEDIUM, HIGH, CRITICAL |
| `assigned_to` | UUID FK→users | Y | |
| `sla_due_at` | TIMESTAMP | Y | |
| `resolution` | TEXT | Y | |
| `status` | ENUM | N | OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, ESCALATED, REOPENED |
| audit fields | — | — | |

#### E20 `benefit_estimates`

| Field | Type | Null | Notes |
|---|---|---|---|
| `estimate_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `scenario_name` | TEXT | Y | what-if label |
| `assumed_retirement_date` | DATE | N | |
| `assumed_scheme` | ENUM | Y | OPS, NPS |
| `assumed_emoluments` | NUMERIC(15,2) | Y | |
| `assumed_commute_fraction` | NUMERIC(9,4) | Y | |
| `estimated_basic_pension` | NUMERIC(15,2) | Y | |
| `estimated_commuted_value` | NUMERIC(15,2) | Y | |
| `estimated_gratuity` | NUMERIC(15,2) | Y | |
| `estimated_leave_encashment` | NUMERIC(15,2) | Y | |
| `is_binding` | BOOL | N | always false (indicative) |
| `calc_trace` | JSONB | Y | |
| audit fields | — | — | |

#### E21 `nominees_beneficiaries`

| Field | Type | Null | Notes |
|---|---|---|---|
| `nominee_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `benefit_scope` | ENUM | N | GRATUITY, GPF, FAMILY_PENSION, LEAVE_ENCASHMENT, ALL |
| `name` | TEXT | N | |
| `relationship` | ENUM | N | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, DISABLED_CHILD, OTHER |
| `dob` | DATE | Y | minority/majority & disability tracking |
| `share_pct` | NUMERIC(9,4) | Y | apportionment |
| `is_disabled_dependent` | BOOL | N | lifelong family pension eligibility |
| `eligibility_order` | INT | Y | hierarchy rank |
| `valid_from` | DATE | Y | |
| `valid_to` | DATE | Y | |
| `status` | ENUM | N | ACTIVE, SUPERSEDED, INELIGIBLE |
| audit fields | — | — | |

### 5.3 Relationship Map

- `employees (M01) 1—N separation_cases` — an employee may have at most one ACTIVE case; historic cases retained.
- `separation_cases 1—1 qualifying_service_records 1—N non_qualifying_spells`.
- `separation_cases 1—1 pension_calculations 1—1 commutation_records`.
- `separation_cases 1—N gratuity_calculations` (retirement or death gratuity).
- `separation_cases 1—1 terminal_settlements`; `terminal_settlements 1—1 gpf_final_settlements`.
- `separation_cases 1—N family_pension_records` (death-in-service path).
- `separation_cases 1—N ppo_records`; `ppo_records 1—1 pensioners` (active PPO).
- `pensioners 1—N pensioner_life_certificates`, `1—N pension_disbursements`, `1—N pension_revisions (lines)`, `1—N pension_grievances`.
- `pensioners (SELF, DECEASED) 1—1 family_pension_records (converted)` — conversion on pensioner death.
- `employees 1—N nominees_beneficiaries`; `family_pension_records N—1 nominees_beneficiaries (current_beneficiary)`.
- `employees 1—1 retirement_forecasts` (latest), `1—N benefit_estimates`.
- All entities write `audit_log`; generated PPOs/sanctions/calc-sheets reference `documents` (M13); retirement events append to `service_register_events` (M12).

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by | Notes |
|---|---|---|---|---|
| employees | M01 | M11 | M01 | golden master |
| service_register_events | M12 | M11 | M11 (append retirement) | gap-free verification source |
| last-pay / contributions | M10 | M11 | M10 | emoluments base, GPF/NPS |
| leave encashable balance | M03 | M11 | M03 | encashment input |
| separation_cases … benefit_estimates (E04–E21) | M11 | M14, Auditor | M11 | module-owned |
| documents | M13 | M11 | M11 (metadata) | PPO/sanction objects |
| notifications | Platform | — | M11 | events |
| audit_log | Platform | Auditor | M11 | immutable |

### 5.5 Enum Catalog

| Enum | Values |
|---|---|
| separation_type | SUPERANNUATION, VOLUNTARY_RETIREMENT, COMPULSORY_RETIREMENT, INVALIDATION, DEATH_IN_SERVICE, RESIGNATION |
| pension_scheme | OPS, NPS |
| case.status | DRAFT, INITIATED, SR_VERIFICATION, NO_DUES, CALCULATION, PENDING_SANCTION, SANCTIONED, PPO_ISSUED, SETTLED, CLOSED, ON_HOLD, REJECTED |
| no_dues_status | NOT_STARTED, IN_PROGRESS, CLEARED, BLOCKED |
| spell_type | EOL_LWP_NON_QUALIFYING, DIES_NON, UNAUTHORISED_ABSENCE, SUSPENSION_NON_DUTY, BREAK_IN_SERVICE, OTHER |
| emoluments_method | LAST_DRAWN, AVG_10_MONTH, BENEFICIAL_OF_BOTH |
| gratuity_type | RETIREMENT_GRATUITY, DEATH_GRATUITY |
| ppo_type | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, REVISED |
| ppo.status | DRAFT, ISSUED, AUTHORISED_TO_PDA, ACTIVE, SUPERSEDED, CANCELLED |
| pensioner_type | SELF_PENSIONER, FAMILY_PENSIONER |
| lifecycle_status | ACTIVE, SUSPENDED_NO_LC, DECEASED, CONVERTED_TO_FAMILY, CEASED |
| lc.submission_mode | DIGITAL_DLC, PHYSICAL, VIDEO_KYC, BANK_CERTIFIED |
| lc.status | DUE, SUBMITTED, VERIFIED, REJECTED, OVERDUE |
| revision_type | DA_REVISION, PAY_COMMISSION_REVISION, RULE_CORRECTION |
| disbursement_type | FIRST_PENSION, MONTHLY_PENSION, ARREAR, TERMINAL_BENEFIT, GRATUITY, COMMUTED_VALUE, GPF |
| instruction_status | DRAFT, AUTHORISED, TRANSMITTED, ACKNOWLEDGED, PARTIALLY_ACK, FAILED, RECONCILED |
| horizon_bucket | LT_6M, M6_12, M12_24, GT_24 |
| grievance.category | PAYMENT_NOT_RECEIVED, WRONG_AMOUNT, REVISION_NOT_APPLIED, LC_ISSUE, BANK_DETAIL, PPO_ERROR, OTHER |
| grievance.status | OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, ESCALATED, REOPENED |
| family_pension.status | DRAFT, COMPUTED, SANCTIONED, ACTIVE, TRANSFERRED, CEASED, SUPERSEDED |
| relationship | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, DISABLED_CHILD, OTHER |

### 5.6 Data Integrity Rules

- **IR1:** At most one `separation_cases` row per employee in a non-terminal status (DRAFT..PPO_ISSUED).
- **IR2:** `qualifying_service_records.net_qualifying_*` = gross − sum(`non_qualifying_spells.days` where not condoned); `sr_verified=true` required before case → CALCULATION.
- **IR3:** A case cannot reach PENDING_SANCTION unless `no_dues_status=CLEARED` (or anticipatory-pension exception explicitly authorised) **and** `qualifying_service_records.status=LOCKED`.
- **IR4:** `commutation_records.commuted_fraction ≤` statutory max; `residual_pension = basic_pension − commuted_pension_amount ≥ 0`.
- **IR5:** `gratuity_calculations.payable_amount = min(computed_amount, statutory_ceiling)`; `ceiling_applied` set accordingly.
- **IR6:** PPO issue requires case `status=SANCTIONED`; `ppo_no` unique and registry-allocated; a REVISED PPO must reference `supersedes_ppo_id` and supersede exactly one ACTIVE PPO.
- **IR7:** A `pensioners` row is created only on PPO authorisation; `current_ppo_id` always points to the single ACTIVE PPO.
- **IR8:** On `pensioners.date_of_death` set for a SELF_PENSIONER, a `family_pension_records` (CONVERTED) row and a FAMILY_PENSION PPO must be created or the case flagged; original pensioner moves to CONVERTED_TO_FAMILY.
- **IR9:** `pension_revisions` lines are immutable once APPLIED; corrections create a new revision batch.
- **IR10:** Life certificate overdue beyond grace ⇒ `pensioners.lifecycle_status=SUSPENDED_NO_LC` and monthly disbursement held (not deleted).
- **IR11:** Sum of `nominees_beneficiaries.share_pct` per `benefit_scope` (where apportioned) = 100.00 when status ACTIVE.
- **IR12:** All money `NUMERIC`; no floating point; benefit rounding per `rule_version_ref`.
- **IR13:** Sanctioned `pension_calculations`/`commutation_records`/`gratuity_calculations` are immutable (status SUPERSEDED on revision; never updated in place).

### 5.7 Sample Data (2-3 rows per key entity)

**separation_cases**

| case_no | employee_id | separation_type | pension_scheme | retirement_date | no_dues_status | status |
|---|---|---|---|---|---|---|
| PEN-2026-000123 | e-1001 | SUPERANNUATION | OPS | 2026-09-30 | CLEARED | PPO_ISSUED |
| PEN-2026-000124 | e-2087 | DEATH_IN_SERVICE | OPS | 2026-06-12 | IN_PROGRESS | CALCULATION |
| PEN-2026-000125 | e-3310 | VOLUNTARY_RETIREMENT | NPS | 2026-12-31 | NOT_STARTED | SR_VERIFICATION |

**qualifying_service_records**

| qsr_id | case_id | service_start_date | service_end_date | gross_service_y | non_qualifying_days | net_qualifying_y | reckonable_half_years | sr_verified | status |
|---|---|---|---|---|---|---|---|---|---|
| qsr-9001 | PEN-2026-000123 | 1991-08-01 | 2026-09-30 | 35 | 92 | 34 | 66 | true | LOCKED |
| qsr-9002 | PEN-2026-000124 | 2009-03-15 | 2026-06-12 | 17 | 0 | 17 | 34 | true | VERIFIED |
| qsr-9003 | PEN-2026-000125 | 2010-07-01 | 2026-12-31 | 16 | 30 | 16 | 33 | false | DRAFT |

**non_qualifying_spells**

| spell_id | qsr_id | spell_type | source_module | from_date | to_date | days | condoned |
|---|---|---|---|---|---|---|---|
| nq-1 | qsr-9001 | EOL_LWP_NON_QUALIFYING | M03 | 2008-04-01 | 2008-06-30 | 91 | false |
| nq-2 | qsr-9001 | DIES_NON | M09 | 2015-02-10 | 2015-02-10 | 1 | false |
| nq-3 | qsr-9003 | EOL_LWP_NON_QUALIFYING | M04 | 2019-09-01 | 2019-09-30 | 30 | false |

**pension_calculations**

| pension_calc_id | case_id | scheme | emoluments_base | pension_fraction | basic_pension | minimum_pension_applied | status |
|---|---|---|---|---|---|---|---|
| pc-7001 | PEN-2026-000123 | OPS | 112000.00 | 0.5000 | 56000.00 | false | SANCTIONED |
| pc-7002 | PEN-2026-000124 | OPS | 78000.00 | 0.5000 | 39000.00 | false | COMPUTED |
| pc-7003 | PEN-2026-000125 | NPS | 96000.00 | null | null | false | DRAFT |

**commutation_records**

| commutation_id | case_id | opted | commuted_fraction | commutation_factor | commuted_value | residual_pension | restoration_due_date |
|---|---|---|---|---|---|---|---|
| cm-5001 | PEN-2026-000123 | true | 0.4000 | 8.3710 | 2249548.80 | 33600.00 | 2041-10-01 |
| cm-5002 | PEN-2026-000124 | false | null | null | null | null | null |

**gratuity_calculations**

| gratuity_id | case_id | gratuity_type | emoluments_base | qualifying_half_years | computed_amount | statutory_ceiling | payable_amount | status |
|---|---|---|---|---|---|---|---|---|
| gr-3001 | PEN-2026-000123 | RETIREMENT_GRATUITY | 124000.00 | 66 | 2046000.00 | 2000000.00 | 2000000.00 | SANCTIONED |
| gr-3002 | PEN-2026-000124 | DEATH_GRATUITY | 86000.00 | 34 | 1032000.00 | 2000000.00 | 1032000.00 | COMPUTED |

**family_pension_records**

| fp_id | case_id | employee_id | emoluments_base | normal_rate_pct | enhanced_rate_pct | normal_amount | enhanced_amount | status |
|---|---|---|---|---|---|---|---|---|
| fp-2001 | PEN-2026-000124 | e-2087 | 78000.00 | 0.3000 | 0.5000 | 23400.00 | 39000.00 | COMPUTED |
| fp-2002 | null | e-0900 | 64000.00 | 0.3000 | null | 19200.00 | null | ACTIVE |

**ppo_records**

| ppo_no | case_id | ppo_type | basic_pension | commuted_portion | residual_pension | effective_from | status |
|---|---|---|---|---|---|---|---|
| PPO-AP-2026-0099 | PEN-2026-000123 | ANTICIPATORY | 50400.00 | 0.00 | 50400.00 | 2026-10-01 | SUPERSEDED |
| PPO-2026-004512 | PEN-2026-000123 | SERVICE_PENSION | 56000.00 | 22400.00 | 33600.00 | 2026-10-01 | ACTIVE |

**pensioners**

| pensioner_no | employee_id | pensioner_type | current_monthly_pension | lifecycle_status | next_life_certificate_due |
|---|---|---|---|---|---|
| PNR-000123 | e-1001 | SELF_PENSIONER | 33600.00 | ACTIVE | 2026-11-30 |
| PNR-000900 | e-0900 | FAMILY_PENSIONER | 19200.00 | ACTIVE | 2026-11-30 |

**pension_revisions**

| revision_batch_no | revision_type | effective_from | pensioner_id | old_pension | new_pension | arrear_amount | status |
|---|---|---|---|---|---|---|---|
| DA-2026-07 | DA_REVISION | 2026-07-01 | PNR-000123 | 33600.00 | 34608.00 | 1008.00 | APPLIED |
| DA-2026-07 | DA_REVISION | 2026-07-01 | PNR-000900 | 19200.00 | 19776.00 | 576.00 | APPLIED |

---

## 6. Functional Requirements

### FR-M11-01 — Retirement Forecasting & Due-for-Retirement Lists

- **Module:** M11-F01
- **Primary Role(s):** Pension Officer, HR Admin
- **User Story:** As a Pension Officer, I want an automatically refreshed list of employees due to retire by horizon so that processing can start 1–2 years ahead and no first pension is delayed.
- **Description:** Compute each active employee's projected superannuation date from `dob` + applicable retirement age (cadre-specific rule), classify into horizon buckets, surface those due within 24/12/6 months, flag whether a case is already initiated, and drive proactive alerts and workload planning. Refreshed nightly and on-demand.
- **Acceptance Criteria:**
  - AC1: Projected retirement date = last day of the month in which the employee attains the configured superannuation age (per cadre rule), recomputed on DOB/cadre change.
  - AC2: Lists filter by org unit, cadre, horizon bucket, and "case not yet initiated".
  - AC3: Employees crossing the 18-month threshold without a case trigger an alert to the responsible Pension Officer.
  - AC4: The forecast excludes employees already separated (RETIRED/DECEASED/RESIGNED/TERMINATED).
- **Business Rules:** BR1: Retirement age is configurable by cadre/category (e.g., 60/62/65). BR2: Forecast is read-only projection; it never auto-creates a case (Pension Officer initiates). BR3: Mid-month attainment retires on the month-end per policy.
- **Data Model References:** `retirement_forecasts`, `employees` (read), `org_units` (read), `separation_cases` (case_initiated flag).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/forecasts` | due-for-retirement list (filters: horizon, org_unit, cadre) |
| POST | `/api/v1/pension/forecasts:refresh` | recompute projections |
| GET | `/api/v1/pension/forecasts/{employeeId}` | one employee's projection |

- **UI Behavior Notes:** Due-for-retirement worklist with horizon tabs (≤6M/6–12M/12–24M), per-row "initiate case" action, alert badges, export. Self-service shows the employee their own projected date.
- **Edge Cases:** DOB correction shifting the date; cadre change altering retirement age; extension of service order; employee already deceased mid-horizon; leap-year/month-end arithmetic.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ForecastProjector`, `HorizonClassifier`, nightly scheduler, `AlertEmitter` |
| Backend Flow | For each active employee → resolve retirement age (cadre rule) → compute superannuation date → bucket → upsert `retirement_forecasts` → emit threshold alerts |
| Data Operations | Bulk upsert forecasts; index on `(horizon_bucket, org_unit_id)` and `projected_retirement_date` |
| Validation | DOB present; retirement-age rule resolved; exclude separated statuses |
| Authorization | Pension Officer/HR (org scope); employee reads own |
| State Changes & Side Effects | forecast rows refreshed; notifications for threshold crossings |
| Failure Handling | Missing DOB → exception list, not a crash; rule unresolved → flagged UNRESOLVED |
| Dependencies | M01 (DOB/cadre), §10 none |
| Test Guidance | Month-end arithmetic; cadre-specific ages; DOB-change recompute; alert threshold; separated-exclusion |

---

### FR-M11-02 — Separation Case Management (All Separation Types)

- **Module:** M11-F02
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want to create and drive a separation case for any separation type so that the correct rules, workflow, and benefit set apply from the start.
- **Description:** Create a `separation_cases` record selecting the type (superannuation/VRS/compulsory/invalidation/death-in-service/resignation), derive the pension scheme (OPS/NPS), capture type-specific inputs (VRS notice, M09 compulsory-retirement order ref, medical-board ref, death report ref), and progress the case through the standard state machine with maker-checker gates. Type drives which downstream FRs are mandatory (e.g., death-in-service → family pension + death gratuity; resignation → typically no pension, only GPF/leave encashment subject to rules).
- **Acceptance Criteria:**
  - AC1: Each type enforces its required inputs (e.g., COMPULSORY_RETIREMENT requires a valid M09 order ref; INVALIDATION requires a medical-board certificate; DEATH_IN_SERVICE requires date of death and nominee data).
  - AC2: Scheme (OPS/NPS) is auto-derived from DOJ vs cutover and shown; override requires reason + audit.
  - AC3: Only an authority distinct from the maker can sanction (SoD).
  - AC4: Resignation/dismissal paths correctly suppress pension where rules disallow it and still allow GPF/leave settlement.
  - AC5: At most one active case per employee (IR1) is enforced.
- **Business Rules:** BR1: Compulsory retirement is initiated only from an M09 penalty order. BR2: Death-in-service auto-spawns the family-pension and death-gratuity sub-flows. BR3: VRS requires minimum qualifying service per rule and may add weightage. BR4: A case cannot skip SR verification or no-dues except via explicit anticipatory-pension exception.
- **Data Model References:** `separation_cases`, `employees` (read), `service_register_events` (append on closure), `workflow_instances`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases` | create case |
| GET | `/api/v1/pension/cases/{id}` | case detail & status |
| PATCH | `/api/v1/pension/cases/{id}` | update type-specific inputs |
| POST | `/api/v1/pension/cases/{id}:advance` | transition state |
| POST | `/api/v1/pension/cases/{id}:sanction` | sanction (checker) |

- **UI Behavior Notes:** Case workspace with a stage tracker (SR verification → no-dues → calculation → sanction → PPO → settlement), type-specific input panels, document upload, and an activity/audit timeline. Death-in-service uses a compassionate fast-track layout.
- **Edge Cases:** Death during pre-retirement processing (convert SUPERANNUATION → DEATH_IN_SERVICE); VRS withdrawal before acceptance; compulsory retirement under appeal in M09; scheme misclassification; re-employed pensioner separating again.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CaseService`, `SeparationTypePolicy`, `SchemeResolver`, workflow engine adapter |
| Backend Flow | Validate type inputs → derive scheme → create case → open workflow → on each advance enforce guards → on sanction lock calc snapshot |
| Data Operations | Insert case; status transitions; append SR event on closure; document links |
| Validation | Type-required fields; single-active-case; SoD on sanction; scheme override reason |
| Authorization | Pension Officer create/update; Sanctioning Authority sanction; org scope |
| State Changes & Side Effects | case.status machine (§10.1); audit_log; notifications; SR event append |
| Failure Handling | Missing required ref → 422 `CASE_INPUT_INCOMPLETE`; duplicate active case → 409 `DUPLICATE_ACTIVE_CASE` |
| Dependencies | M09 (compulsory), M01, M12, FR-03..09 |
| Test Guidance | Each type's required-input matrix; SoD; single-active-case; scheme derivation/override; death conversion |

---

### FR-M11-03 — Pre-Retirement Processing (SR Verification, No-Dues, Anticipatory Pension)

- **Module:** M11-F03
- **Primary Role(s):** Pension Officer, SR Custodian (M12), HR Admin, Sanctioning Authority
- **User Story:** As a Pension Officer, I want to run SR verification, drive no-dues clearance, and authorise anticipatory pension 1–2 years ahead so that benefits are ready before the retirement date and pension never breaks.
- **Description:** Orchestrate the lead pipeline: request gap-free service verification from M12 (SR Custodian certifies), coordinate no-dues clearance across stakeholders (payroll/loans, library, quarters, IT assets, etc.), and — when final pension cannot be sanctioned in time — authorise **anticipatory pension** (a provisional pension/gratuity within rule limits) so the pensioner is paid from day one, later adjusted against the final sanction.
- **Acceptance Criteria:**
  - AC1: Case cannot advance to CALCULATION until `qualifying_service_records.sr_verified=true`.
  - AC2: No-dues is a checklist with per-item owner/status; case cannot reach PENDING_SANCTION until CLEARED (or anticipatory exception).
  - AC3: Anticipatory pension issues a provisional PPO (ANTICIPATORY) within the configured percentage cap and is later superseded by the final PPO with adjustment.
  - AC4: Outstanding dues are recorded and netted into terminal settlement, not silently ignored.
- **Business Rules:** BR1: Anticipatory pension ≤ configured % of estimated pension; anticipatory gratuity withheld until no-dues. BR2: SR verification gaps must be condoned by order before counting as qualifying. BR3: No-dues blocking items hold gratuity but not the basic anticipatory pension.
- **Data Model References:** `separation_cases` (no_dues_status, anticipatory_pension_flag), `qualifying_service_records`, `service_register_events` (read/verify), `ppo_records` (ANTICIPATORY), `terminal_settlements` (recoveries).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/sr-verification:request` | request M12 verification |
| POST | `/api/v1/pension/cases/{id}/sr-verification:certify` | SR Custodian certify |
| GET/PATCH | `/api/v1/pension/cases/{id}/no-dues` | no-dues checklist |
| POST | `/api/v1/pension/cases/{id}/anticipatory-pension` | authorise anticipatory pension |

- **UI Behavior Notes:** Pre-retirement cockpit: SR verification status with gap list, no-dues checklist grid (owner, status, remarks), and anticipatory-pension authorisation panel with cap enforcement and projected first-pension date.
- **Edge Cases:** Verification reveals a service gap requiring condonation; a no-dues owner unresponsive near deadline; anticipatory pension already paid then final pension lower (recover excess); employee on deputation/foreign service spells.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SRVerificationClient`, `NoDuesCoordinator`, `AnticipatoryPensionService` |
| Backend Flow | Request verification → M12 certifies → lock QSR → run no-dues checklist → if time-critical compute anticipatory within cap → issue ANTICIPATORY PPO |
| Data Operations | Update case flags; create ANTICIPATORY ppo; record dues as recovery candidates |
| Validation | sr_verified gate; no-dues CLEARED gate; anticipatory cap; condonation order present |
| Authorization | SR Custodian certify; Pension Officer coordinate; Authority authorise anticipatory |
| State Changes & Side Effects | case SR_VERIFICATION→NO_DUES→CALCULATION; ANTICIPATORY PPO ACTIVE; notifications |
| Failure Handling | M12 down → 503 `UPSTREAM_UNAVAILABLE`; gap uncondoned → block with `SERVICE_GAP_UNRESOLVED` |
| Dependencies | M12, M10 (payroll dues), FR-02, FR-04, FR-11 |
| Test Guidance | Gate enforcement; anticipatory cap; later adjustment/recovery; gap condonation path |

---

### FR-M11-04 — Qualifying Service Computation

- **Module:** M11-F04
- **Primary Role(s):** Pension Officer, SR Custodian
- **User Story:** As a Pension Officer, I want qualifying service computed from verified service with non-qualifying spells deducted so that pension and gratuity use the legally correct service length.
- **Description:** Compute gross service from joining to retirement/death, enumerate non-qualifying spells (extraordinary leave/LWP not counting, dies-non, unauthorised absence, certain suspension periods, breaks in service) sourced from M03/M04/M09 and manual entries, deduct uncondoned spells, apply weightage where applicable (e.g., VRS), and round to reckonable half-years per rule. Produces an auditable, locked `qualifying_service_records`.
- **Acceptance Criteria:**
  - AC1: `net_qualifying = gross − Σ(uncondoned non-qualifying days)`; condoned spells count as qualifying.
  - AC2: Reckonable half-years rounded per the configured rounding rule (e.g., ≥3 months counts as a half-year).
  - AC3: Each non-qualifying spell traces to a source (M03/M04 leave event, M09 order, or manual with justification).
  - AC4: VRS weightage is added only when rules permit and within the cap (and capped at the date-of-superannuation service).
  - AC5: Record locks on verification; later changes require a new version.
- **Business Rules:** BR1: EOL on medical certificate may be qualifying; EOL otherwise non-qualifying (policy flag). BR2: Dies-non never qualifies. BR3: Minimum qualifying service for pension eligibility is enforced (else proportionate/no pension per rule).
- **Data Model References:** `qualifying_service_records`, `non_qualifying_spells`, `service_register_events` (read), M03/M04 leave (read), M09 orders (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/qualifying-service:compute` | compute QSR |
| GET | `/api/v1/pension/cases/{id}/qualifying-service` | QSR + spells |
| POST | `/api/v1/pension/cases/{id}/qualifying-service/spells` | add/condone a spell |
| POST | `/api/v1/pension/cases/{id}/qualifying-service:lock` | lock after verification |

- **UI Behavior Notes:** Service-ledger timeline showing joining→retirement with shaded non-qualifying spells, an editable spell table (type, source, condonation), and a live qualifying-service total with half-year rounding shown.
- **Edge Cases:** Overlapping spells; spell spanning a pay-commission boundary; military/prior service to be counted; condonation order arriving after lock (new version); fraction-of-day rounding.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `QualifyingServiceEngine`, `SpellAggregator`, `HalfYearRounder` |
| Backend Flow | Gather verified service span → pull spells from M03/M04/M09 → dedupe/merge overlaps → deduct uncondoned → add weightage → round → persist + trace → lock |
| Data Operations | Insert QSR + spells; version on change; lock flag |
| Validation | Inclusive day math; overlap merge; condonation refs; weightage cap |
| Authorization | Pension Officer compute; SR Custodian verify; lock by Officer post-verify |
| State Changes & Side Effects | QSR DRAFT→VERIFIED→LOCKED; audit_log; feeds FR-05/07 |
| Failure Handling | Source unavailable → 503; overlap conflict → flagged for manual resolution |
| Dependencies | M03/M04/M09/M12, FR-03, feeds FR-05, FR-07 |
| Test Guidance | Spell deduction; overlap merge; half-year rounding; weightage cap; condonation; versioning on lock |

---

### FR-M11-05 — Pension Calculation (OPS / NPS)

- **Module:** M11-F05
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want basic pension computed from emoluments and qualifying service under the correct scheme so that the monthly pension is statutorily accurate.
- **Description:** For OPS, compute basic pension = pension-fraction × emoluments base (last-drawn or 10-month average, whichever beneficial), using qualifying half-years, apply proportionate reduction for short qualifying service, and floor/cap to statutory minimum/maximum. For NPS, M11 does not compute a defined-benefit pension; it records corpus/PRAN references and produces indicative annuity/lump-sum figures plus any NPS-specific additional relief, routing to the NPS annuity service. A full `calc_trace` and effective rule snapshot are persisted.
- **Acceptance Criteria:**
  - AC1: OPS basic pension = configured fraction (e.g., 50%) of emoluments base for full qualifying service; proportionate below the threshold.
  - AC2: Emoluments method selectable (last-drawn / 10-month average / beneficial-of-both) and snapshotted from M10.
  - AC3: Statutory minimum and maximum pension are enforced with flags set.
  - AC4: NPS cases are clearly marked non-OPS; defined-benefit pension is not fabricated; indicative figures labelled non-binding.
  - AC5: Re-computation with identical inputs is byte-identical; rule version is recorded.
- **Business Rules:** BR1: Scheme from `separation_cases.pension_scheme`. BR2: Emoluments exclude non-reckonable allowances per rule. BR3: Additional old-age pension increments (e.g., at 80/85/90/95/100 years) are scheduled as future revisions (FR-13).
- **Data Model References:** `pension_calculations`, `qualifying_service_records` (read), M10 last-pay/emoluments (read), rule tables (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/pension:compute` | compute pension |
| GET | `/api/v1/pension/cases/{id}/pension` | pension calc + trace |

- **UI Behavior Notes:** Pension worksheet showing emoluments source, method comparison (last-drawn vs average), fraction, min/max flags, and a step-by-step trace panel; NPS view shows corpus/annuity estimator instead.
- **Edge Cases:** Short qualifying service (proportionate); employee with pay anomaly in last 10 months; revision retro-affecting emoluments; OPS/NPS borderline DOJ; re-employed pensioner.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionEngine`, `EmolumentsResolver` (M10 client), `MinMaxGuardRail`, `NPSAdapter` |
| Backend Flow | Resolve scheme → fetch emoluments → compute by method → apply fraction & proportionate → floor/cap → persist trace + rule version |
| Data Operations | Insert `pension_calculations`; supersede prior on recompute |
| Validation | Fraction bounds; min/max; emoluments present; determinism |
| Authorization | Pension Officer compute; Authority sanction (via case) |
| State Changes & Side Effects | calc DRAFT→COMPUTED→SANCTIONED; SUPERSEDED on revision; audit_log |
| Failure Handling | Emoluments missing → 422 `EMOLUMENTS_UNAVAILABLE`; rule missing → 422 `RULE_NOT_EFFECTIVE` |
| Dependencies | M10, FR-04, feeds FR-06, FR-11 |
| Test Guidance | Method comparison; proportionate; min/max; NPS labelling; determinism; rule-version capture |

---

### FR-M11-06 — Commutation of Pension

- **Module:** M11-F06
- **Primary Role(s):** Retiring Employee (opt), Pension Officer, Sanctioning Authority
- **User Story:** As a retiring employee, I want to commute a portion of my pension into a lump sum so that I receive upfront capital, with my residual pension and restoration date correctly computed.
- **Description:** Capture the employee's commutation option (fraction ≤ statutory maximum), look up the commutation factor by age-next-birthday, compute commuted value = commuted monthly pension × factor × 12, reduce the monthly pension to residual, and schedule restoration of the commuted portion after the statutory period (e.g., 15 years).
- **Acceptance Criteria:**
  - AC1: Commuted fraction is bounded by the statutory maximum (e.g., 40%); over-limit is rejected.
  - AC2: Commutation factor resolves from the effective age-factor table by age-next-birthday.
  - AC3: Commuted value, residual pension, and restoration due date are computed and shown with trace.
  - AC4: Residual pension feeds the PPO; restoration is scheduled and later applied (FR-12) restoring full basic.
  - AC5: Opting out leaves full basic pension and no commuted value.
- **Business Rules:** BR1: Commutation requires medical fitness unless within the no-medical window post-retirement. BR2: Restoration date = commutation date + statutory restoration period. BR3: Commuted portion still attracts DA on full (un-commuted) basic per rule.
- **Data Model References:** `commutation_records`, `pension_calculations` (read), commutation-factor rule table (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/commutation` | submit/compute commutation |
| GET | `/api/v1/pension/cases/{id}/commutation` | commutation detail |

- **UI Behavior Notes:** Commutation calculator with a fraction slider (capped), live commuted-value and residual-pension preview, factor display by age, and restoration-date callout; self-service preview before formal option.
- **Edge Cases:** Age boundary changing the factor; commutation after the no-medical window (medical board required); death before restoration (restoration not applicable to family pension); fraction exactly at the cap.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CommutationEngine`, `FactorTableResolver`, `RestorationScheduler` |
| Backend Flow | Validate fraction ≤ max → resolve factor by age → commuted value = commuted×factor×12 → residual = basic−commuted → schedule restoration |
| Data Operations | Insert `commutation_records`; link to pension calc; restoration due-date set |
| Validation | Fraction cap; factor found; residual ≥ 0; medical-window check |
| Authorization | Employee opts; Officer computes; Authority sanctions |
| State Changes & Side Effects | commutation DRAFT→COMPUTED→SANCTIONED; restoration job scheduled |
| Failure Handling | Over-limit → 422 `COMMUTATION_EXCEEDS_LIMIT`; factor missing → 422 `FACTOR_NOT_FOUND` |
| Dependencies | FR-05, feeds FR-09, FR-11, FR-12 (restoration) |
| Test Guidance | Cap enforcement; factor lookup by age; value/residual math; restoration scheduling; opt-out |

---

### FR-M11-07 — Gratuity Computation (Retirement & Death)

- **Module:** M11-F07
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want retirement and death gratuity computed with the correct service slabs and statutory ceiling so that the lump-sum terminal benefit is accurate and within limits.
- **Description:** Compute retirement gratuity = ¼ × emoluments (basic+DA) × qualifying half-years (capped, e.g., max 16.5×emoluments / 66 half-years), and death gratuity by service-length slabs (e.g., <1yr=2×, 1–5yr=6×, 5–11yr=12×, 11–20yr=20×, >20yr=½×emoluments per half-year), each capped at the statutory ceiling and apportioned to nominees for death cases.
- **Acceptance Criteria:**
  - AC1: Retirement gratuity uses capped qualifying half-years and the statutory ceiling; `payable=min(computed,ceiling)`.
  - AC2: Death gratuity applies the correct slab multiplier by service length.
  - AC3: Death gratuity is apportioned per nominee shares totalling 100%.
  - AC4: Gratuity may be withheld pending no-dues and released on clearance.
  - AC5: Ceiling-applied and withheld flags are set and visible.
- **Business Rules:** BR1: Emoluments = basic + DA at retirement/death date. BR2: Half-years capped per rule. BR3: Statutory ceiling effective-dated; the ceiling on the relevant date applies. BR4: No minimum-service bar for death gratuity (payable from day one of service).
- **Data Model References:** `gratuity_calculations`, `qualifying_service_records` (read), `nominees_beneficiaries` (read), ceiling rule table (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gratuity:compute` | compute gratuity |
| GET | `/api/v1/pension/cases/{id}/gratuity` | gratuity detail |

- **UI Behavior Notes:** Gratuity worksheet with emoluments, half-years, slab (death), ceiling comparison, nominee apportionment grid, and withhold toggle with reason; trace panel.
- **Edge Cases:** Service exactly at a slab boundary; computed below vs above ceiling; nominee share misconfiguration; death gratuity with no valid nominee (escheat/legal-heir process); retirement gratuity withheld for pending disciplinary case.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GratuityEngine`, `SlabResolver`, `CeilingGuard`, `NomineeApportioner` |
| Backend Flow | Resolve emoluments+half-years → compute (retirement formula or death slab) → apply ceiling → apportion to nominees → withhold if no-dues pending |
| Data Operations | Insert `gratuity_calculations`; nominee split JSONB; link to settlement |
| Validation | Half-year cap; ceiling; nominee shares=100%; slab selection |
| Authorization | Officer compute; Authority sanction |
| State Changes & Side Effects | gratuity DRAFT→COMPUTED→SANCTIONED→PAID; withheld state; audit_log |
| Failure Handling | Ceiling missing → 422 `RULE_NOT_EFFECTIVE`; bad nominee split → 422 `NOMINEE_SPLIT_INVALID` |
| Dependencies | FR-04, M09 (withhold), feeds FR-09 |
| Test Guidance | Slab boundaries; ceiling min; apportionment; withhold/release; death day-one eligibility |

---

### FR-M11-08 — Family & Enhanced Family Pension

- **Module:** M11-F08
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want family pension computed with normal and enhanced rates and the correct beneficiary so that the family of a deceased employee/pensioner is paid accurately and the right person receives it over time.
- **Description:** Compute family pension at the normal rate (e.g., 30% of emoluments) and, where eligible, the enhanced rate (e.g., 50%) for a limited window (e.g., 7 years or until the employee would have turned 67/age rule, whichever earlier). Maintain the ordered beneficiary hierarchy (spouse → eligible children by age → disabled child for life → dependent parents), eligibility review dates (minor majority, remarriage, disability), and transfer of pension to the next beneficiary on cessation.
- **Acceptance Criteria:**
  - AC1: Normal and enhanced amounts compute from emoluments × configured rates.
  - AC2: Enhanced family pension applies only within the eligible window, then steps down to normal automatically (scheduled).
  - AC3: The active beneficiary follows the hierarchy; on a cessation event, pension transfers to the next eligible beneficiary, not stops (unless none remain).
  - AC4: Disabled-dependent beneficiaries receive lifelong family pension per rule.
  - AC5: Both death-in-service and conversion-on-pensioner-death paths produce a family-pension record and a FAMILY_PENSION PPO.
- **Business Rules:** BR1: Enhanced rate min(enhanced formula, would-be pension) per rule. BR2: Only one beneficiary draws at a time (except twins/eligible split per rule). BR3: Remarriage/employment may cease eligibility except for disabled children/widow per rule.
- **Data Model References:** `family_pension_records`, `nominees_beneficiaries`, `pension_calculations` (read), `pensioners` (source on conversion).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/family-pension:compute` | compute family pension |
| GET | `/api/v1/pension/family-pension/{id}` | family pension detail |
| POST | `/api/v1/pension/family-pension/{id}:transfer` | transfer to next beneficiary |

- **UI Behavior Notes:** Family-pension panel with normal/enhanced amounts, the enhanced-window timeline, an ordered beneficiary list with eligibility-review dates, and a transfer action with reason capture.
- **Edge Cases:** Multiple eligible children needing sequencing; disabled child needing lifelong pension; remarriage of widow (rule-dependent continuation); enhanced window shorter due to age rule; simultaneous death of employee and spouse.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FamilyPensionEngine`, `BeneficiaryHierarchyResolver`, `EnhancedWindowScheduler`, `TransferService` |
| Backend Flow | Compute normal+enhanced → set enhanced window → select first eligible beneficiary → schedule step-down & reviews → on cessation transfer to next |
| Data Operations | Insert `family_pension_records`; beneficiary hierarchy JSONB; transfer updates current_beneficiary |
| Validation | Rate bounds; window dates; single active beneficiary; disability flag |
| Authorization | Officer compute; Authority sanction; Officer transfer with review |
| State Changes & Side Effects | fp DRAFT→COMPUTED→SANCTIONED→ACTIVE→TRANSFERRED/CEASED; PPO FAMILY_PENSION; notifications |
| Failure Handling | No eligible beneficiary → flag for legal-heir process; bad window → 422 |
| Dependencies | FR-05, FR-12 (conversion), feeds FR-11 |
| Test Guidance | Normal/enhanced math; window step-down; hierarchy transfer; disabled-lifelong; conversion path |

---

### FR-M11-09 — Terminal Benefits & Final Settlement

- **Module:** M11-F09
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (M10)
- **User Story:** As a Pension Officer, I want a composite final settlement that brings together leave encashment, gratuity, commuted value, GPF, and recoveries so that the employee's one-time dues are paid net of legitimate recoveries.
- **Description:** Assemble the terminal settlement: compute leave encashment from M03 encashable EL balance × per-day emoluments (capped per rule), pull gratuity (FR-07), commuted value (FR-06), and GPF (FR-10), add other dues (group/deposit-linked insurance), net legitimate recoveries (M09 disciplinary, overpayment, outstanding loans/advances) within statutory protection, and produce gross and net settlement for authorisation and disbursement.
- **Acceptance Criteria:**
  - AC1: Leave encashment = min(encashable EL days, statutory cap) × per-day (basic+DA); shown as a line.
  - AC2: Settlement gross = Σ components; net = gross − recoveries; each recovery traces to an order.
  - AC3: Recoveries cannot exceed statutory limits; excess is deferred/flagged, never silently dropped.
  - AC4: Withheld components (e.g., gratuity pending no-dues, or pending disciplinary case) are excluded from immediate payout and tracked.
  - AC5: Final settlement requires SANCTIONED benefit sub-calculations.
- **Business Rules:** BR1: Leave encashment capped per rule (e.g., 300 days). BR2: Recovery priority and net protection per Appendix 16.3. BR3: Pending disciplinary case may withhold gratuity per M09 linkage.
- **Data Model References:** `terminal_settlements`, M03 leave balance (read), `gratuity_calculations`, `commutation_records`, `gpf_final_settlements`, M09 recoveries (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/settlement:compute` | assemble settlement |
| GET | `/api/v1/pension/cases/{id}/settlement` | settlement detail |
| POST | `/api/v1/pension/cases/{id}/settlement:sanction` | sanction settlement |

- **UI Behavior Notes:** Settlement summary with component breakdown (encashment, gratuity, commuted value, GPF, insurance), recoveries list with order links, withheld items, and gross/net totals; export of the settlement sheet.
- **Edge Cases:** Negative net (recoveries > dues) → recover from pension/flag; leave balance disputed; loan foreclosure interplay with M10; insurance claim pending; death case routing dues to nominees.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SettlementAssembler`, `LeaveEncashmentCalc` (M03 client), `RecoveryNetter` |
| Backend Flow | Pull components → compute encashment → sum gross → net recoveries within protection → set withheld → produce net |
| Data Operations | Insert `terminal_settlements`; link sub-calc refs; recovery refs JSONB |
| Validation | Encashment cap; recovery limits; sub-calc SANCTIONED; net ≥ protected floor or flagged |
| Authorization | Officer compute; Authority sanction; Payroll Officer confirm recoveries |
| State Changes & Side Effects | settlement DRAFT→COMPUTED→SANCTIONED→PAID/PARTIALLY_WITHHELD; audit_log |
| Failure Handling | M03 down → 503; recovery over-limit → defer + `RECOVERY_EXCEEDS_PROTECTION` flag |
| Dependencies | M03, M09, M10, FR-06, FR-07, FR-10, feeds FR-14 |
| Test Guidance | Encashment cap; netting/priority; withhold; negative-net handling; death routing |

---
### FR-M11-10 — GPF Final Withdrawal

- **Module:** M11-F10
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (M10)
- **User Story:** As a Pension Officer, I want the GPF final balance with interest and advances adjusted so that the provident-fund corpus is settled correctly at retirement or death.
- **Description:** Retrieve the GPF closing balance and contribution ledger from M10, compute interest up to the settlement date, deduct any outstanding GPF advances/withdrawals, derive the final payable, apportion to nominees for death cases, and route for authorisation. (NPS cases are handled via NPS exit, not GPF.)
- **Acceptance Criteria:**
  - AC1: Final payable = closing balance + interest-to-date − outstanding advances.
  - AC2: Interest computed at the effective GPF rate for the period to settlement.
  - AC3: Death cases apportion to nominees totalling 100%.
  - AC4: GPF final withdrawal requires authorisation distinct from the maker.
  - AC5: GPF settlement is only for GPF/OPS subscribers; NPS subscribers are routed to NPS exit.
- **Business Rules:** BR1: GPF closing balance is the system of record from M10. BR2: Interest rate is effective-dated master data. BR3: Unrecovered advances are mandatory deductions.
- **Data Model References:** `gpf_final_settlements`, M10 GPF ledger (read), `nominees_beneficiaries` (read), GPF-rate rule table (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gpf:compute` | compute GPF final |
| POST | `/api/v1/pension/cases/{id}/gpf:authorise` | authorise GPF payment |

- **UI Behavior Notes:** GPF settlement panel with closing balance, interest accrual, advances, final payable, nominee split (death), and authorise action; masked account number with audited reveal.
- **Edge Cases:** Advance recovered partially in last salary; interest boundary at financial-year close; missing/zero balance for NPS subscriber; nominee dispute.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GPFSettlementEngine`, `InterestCalculator`, M10 GPF client |
| Backend Flow | Fetch closing balance → compute interest to date → deduct advances → final payable → apportion (death) → authorise |
| Data Operations | Insert `gpf_final_settlements`; link to terminal settlement |
| Validation | Balance source present; interest rate effective; advances reconciled; nominee 100% |
| Authorization | Officer compute; Authority authorise (SoD) |
| State Changes & Side Effects | gpf DRAFT→COMPUTED→AUTHORISED→PAID; audit_log; feeds FR-09 |
| Failure Handling | M10 ledger unavailable → 503; NPS subscriber → 409 `SCHEME_MISMATCH` |
| Dependencies | M10, FR-09, FR-14 |
| Test Guidance | Interest math; advance deduction; nominee split; NPS routing; SoD |

---

### FR-M11-11 — PPO Generation & Digital PPO

- **Module:** M11-F11
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise)
- **User Story:** As a Sanctioning Authority, I want to issue a registry-numbered Pension Payment Order so that the pensioner's entitlement is formally authorised and transmitted to the disbursing authority.
- **Description:** Generate the PPO from the sanctioned pension (and family pension/commutation) figures, allocate a unique `ppo_no` from the registry, render a digital PPO (e-PPO) document (M13), bind it to a Pension Disbursing Authority, and produce the pensioner half / disbursing-authority half. Supports SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, and REVISED PPOs; a REVISED PPO supersedes the prior active PPO with continuity of `ppo_no` lineage.
- **Acceptance Criteria:**
  - AC1: PPO issues only when the case is SANCTIONED (or anticipatory authorised for ANTICIPATORY type).
  - AC2: `ppo_no` is unique and registry-allocated; a REVISED PPO references and supersedes exactly one ACTIVE PPO.
  - AC3: e-PPO is generated as a signed document artefact and made available to the pensioner self-service.
  - AC4: PPO carries basic pension, commuted portion, residual, effective-from, and PDA binding.
  - AC5: Authorising the PPO creates/links the pensioner master record (FR-12).
- **Business Rules:** BR1: Anticipatory PPO is provisional and superseded by the final PPO. BR2: Authoriser ≠ preparer (SoD). BR3: PPO effective-from = pension commencement date.
- **Data Model References:** `ppo_records`, `pension_calculations`, `commutation_records`, `family_pension_records`, `pensioners`, `documents`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/ppo:generate` | generate draft PPO |
| POST | `/api/v1/pension/ppos/{id}:authorise` | authorise & issue PPO |
| GET | `/api/v1/pension/ppos/{id}` | PPO detail + e-PPO link |
| POST | `/api/v1/pension/ppos/{id}:revise` | issue REVISED PPO |

- **UI Behavior Notes:** PPO composer showing sanctioned figures, PDA selector, registry number allocation, e-PPO preview, and authorise action; supersession banner for revised PPOs; pensioner self-service e-PPO download.
- **Edge Cases:** Registry number collision/retry; anticipatory→final supersession with arrear adjustment; revision before authorisation; PDA change after issue; family-pension PPO on death-in-service.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PPOComposer`, `PPONumberRegistry`, `EPPORenderer` (M13), `PensionerLinker` |
| Backend Flow | Assemble figures → allocate ppo_no (transactional) → render e-PPO → bind PDA → authorise → create/link pensioner → mark prior SUPERSEDED on revise |
| Data Operations | Insert `ppo_records`; document link; pensioner upsert; supersede prior PPO |
| Validation | Case SANCTIONED; unique ppo_no; single ACTIVE PPO; SoD |
| Authorization | Officer prepare; Authority authorise |
| State Changes & Side Effects | ppo DRAFT→ISSUED→AUTHORISED_TO_PDA→ACTIVE; prior→SUPERSEDED; SR event append; notifications |
| Failure Handling | Number collision → retry/idempotent; not sanctioned → 409 `CASE_NOT_SANCTIONED` |
| Dependencies | FR-05..09, M13, feeds FR-12, FR-14 |
| Test Guidance | Number uniqueness; SoD; supersession lineage; e-PPO generation; pensioner linkage |

---

### FR-M11-12 — Pensioner Master & Lifecycle Management

- **Module:** M11-F12
- **Primary Role(s):** Pension Officer, Pensioner/Family Pensioner (self-service), Sanctioning Authority
- **User Story:** As a Pension Officer, I want a pensioner master that tracks life certificates, restoration, and family-pension conversion so that the pensioner is correctly maintained for life and beyond.
- **Description:** Maintain the `pensioners` record from PPO authorisation onward: capture annual life certificate / Digital Life Certificate (Jeevan Pramaan-style), suspend disbursement on overdue LC, restore the commuted portion automatically at the restoration due date (full basic pension resumes), and on a self-pensioner's death convert to family pension — creating the family-pension record and FAMILY_PENSION PPO and transferring disbursement to the eligible beneficiary.
- **Acceptance Criteria:**
  - AC1: Life certificate has a yearly due date; overdue beyond grace sets `SUSPENDED_NO_LC` and holds disbursement.
  - AC2: Submitting/verifying an LC (digital or physical) reactivates the pensioner and releases held pension with arrear.
  - AC3: At the restoration due date, the commuted portion is restored and `current_monthly_pension` reflects full basic (FR-06 link).
  - AC4: On `date_of_death` for a self-pensioner, the system spawns family-pension conversion (FR-08) and a FAMILY_PENSION PPO, moving the pensioner to CONVERTED_TO_FAMILY.
  - AC5: Pensioner contact/bank self-updates route through maker-checker before disbursement uses them.
- **Business Rules:** BR1: LC grace period configurable. BR2: Restoration applies only to the original pensioner (not transferred to family pension). BR3: Family-pension conversion uses the recorded beneficiary hierarchy.
- **Data Model References:** `pensioners`, `pensioner_life_certificates`, `commutation_records` (restoration), `family_pension_records`, `ppo_records`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/pensioners/{id}` | pensioner detail & lifecycle |
| POST | `/api/v1/pension/pensioners/{id}/life-certificate` | submit LC / DLC |
| POST | `/api/v1/pension/pensioners/{id}:report-death` | record death → conversion |
| PATCH | `/api/v1/pension/pensioners/{id}` | update bank/contact (maker-checker) |

- **UI Behavior Notes:** Pensioner 360 view: pension summary, LC status with due/overdue badges, restoration countdown, conversion history, and bank/contact with masked reveal; pensioner self-service LC submission (digital with fallback) and grievance entry.
- **Edge Cases:** Restoration date coinciding with a DA revision; death reported late (arrears/over-payment recovery from estate); LC submitted just after suspension; family pensioner's own death (next beneficiary); fraudulent LC detection.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionerService`, `LifeCertificateProcessor` (DLC client), `RestorationJob`, `DeathConversionOrchestrator` |
| Backend Flow | On PPO auth create pensioner → schedule LC due & restoration → LC submit/verify toggles active/suspended → restoration job restores basic → death triggers FR-08 conversion + FAMILY PPO |
| Data Operations | Upsert pensioner; insert LC; update lifecycle_status; create family pension + PPO on death |
| Validation | LC due/grace; restoration date; death date ≥ commencement; bank-change maker-checker |
| Authorization | Pensioner self-LC; Officer verify; Authority sanction conversion |
| State Changes & Side Effects | lifecycle ACTIVE↔SUSPENDED_NO_LC→DECEASED→CONVERTED_TO_FAMILY; disbursement hold/release; notifications |
| Failure Handling | DLC service down → fallback to physical/video-KYC; conversion missing beneficiary → legal-heir flag |
| Dependencies | FR-06, FR-08, FR-11, FR-14 |
| Test Guidance | LC suspend/release+arrear; restoration; death conversion + PPO; bank-change control; family-pensioner death chain |

---

### FR-M11-13 — Pension Revision (DA & Pay-Commission)

- **Module:** M11-F13
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), SysAdmin (rule tables)
- **User Story:** As a Pension Officer, I want to apply DA and pay-commission revisions across the pensioner population so that every pensioner's pension stays current with arrears computed automatically.
- **Description:** Run revision batches: a DA revision applies a new dearness-relief percentage to eligible pensioners; a pay-commission revision re-fixes basic pension per the new formula/multiplier and notional pay fixation. Compute old vs new pension and retrospective arrears, approve the batch, and apply per-pensioner deltas (updating `pensioners.current_monthly_pension` and queuing arrear disbursements). Also schedules additional old-age pension increments (e.g., at 80/85/90/95/100 years).
- **Acceptance Criteria:**
  - AC1: A DA-revision batch recomputes dearness relief for all eligible pensioners as of the effective date.
  - AC2: A pay-commission batch re-fixes basic pension and computes arrears from the effective date.
  - AC3: Old vs new and arrear amounts are computed per pensioner with trace; batch requires approval before APPLY.
  - AC4: Applied revisions are immutable; corrections create a new batch.
  - AC5: Age-based additional pension increments auto-apply on the pensioner's milestone birthday.
- **Business Rules:** BR1: DA/pay-commission parameters are effective-dated master data (SysAdmin maintained, approved). BR2: Family pensioners are revised by the same batch with family-pension rules. BR3: Arrears netting respects any prior over-payment.
- **Data Model References:** `pension_revisions`, `pensioners`, rule tables (DA/pay-commission), `pension_disbursements` (arrears).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/revisions` | create revision batch (type, effective, scope) |
| POST | `/api/v1/pension/revisions/{id}:compute` | compute per-pensioner deltas |
| POST | `/api/v1/pension/revisions/{id}:approve` | approve batch |
| POST | `/api/v1/pension/revisions/{id}:apply` | apply to pensioners |

- **UI Behavior Notes:** Revision console with batch parameters, computed delta preview (old→new, arrear), affected-count, exception list, approve/apply gates, and rollback-before-apply; per-pensioner drill-down.
- **Edge Cases:** Pensioner whose restoration/age-increment coincides; partial-month effective date; pensioner deceased between compute and apply; pay-commission notional fixation anomaly; DA negative revision.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RevisionEngine`, `ArrearCalculator`, `BatchApprover`, scheduler for age increments |
| Backend Flow | Build cohort → compute new pension + arrear per pensioner into staging → approve → atomic apply updating pensioners + queue arrears |
| Data Operations | Insert revision lines (staging) → on apply update `pensioners.current_monthly_pension`, insert arrear disbursements |
| Validation | Effective date; eligibility; immutability post-apply; determinism |
| Authorization | Officer compute; Authority approve; SoD; SysAdmin only on tables |
| State Changes & Side Effects | revision DRAFT→COMPUTED→APPROVED→APPLIED; arrears queued; notifications |
| Failure Handling | Per-pensioner error → quarantine line, batch continues; apply fault → no partial commit |
| Dependencies | M14 (liability), FR-12, feeds FR-14 |
| Test Guidance | DA recompute; pay-commission re-fix; arrear math; immutability; age-increment; deceased-mid-batch |

---

### FR-M11-14 — Treasury / Bank / PDA Integration

- **Module:** M11-F14
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise), Treasury/PDA/Bank
- **User Story:** As a Pension Officer, I want to transmit authorised pension and terminal-benefit payment instructions to the disbursing authority and reconcile acknowledgements so that pensioners are actually paid and exceptions are caught.
- **Description:** Produce disbursement instruction batches for first pension, monthly pension, arrears, gratuity, commuted value, GPF, and terminal benefits; transfer PPO authorisation to the Pension Disbursing Authority/treasury/bank in the agreed format; track transmission and acknowledgement; and reconcile paid/failed lines back to cases and pensioners, raising exceptions for failures.
- **Acceptance Criteria:**
  - AC1: Only AUTHORISED instructions (SoD: authoriser ≠ preparer) are transmitted.
  - AC2: Each disbursement line ties to a PPO/pensioner/case and an amount; batch totals reconcile to the sum of lines.
  - AC3: Acknowledgements update `instruction_status` (ACKNOWLEDGED/PARTIALLY_ACK/FAILED) and failed lines raise exceptions/grievances.
  - AC4: First pension instruction is generated to commence on the pension start date (no break).
  - AC5: Idempotent transmission prevents duplicate payments.
- **Business Rules:** BR1: Invalid/missing bank or PDA binding blocks the line. BR2: Failed lines are retried or re-routed, never silently abandoned. BR3: Monthly pension respects LC suspension (held lines excluded).
- **Data Model References:** `pension_disbursements`, `ppo_records`, `pensioners`, `terminal_settlements`, `pension_revisions` (arrears).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/disbursements` | create instruction batch |
| POST | `/api/v1/pension/disbursements/{id}:authorise` | authorise batch |
| POST | `/api/v1/pension/disbursements/{id}:transmit` | transmit to PDA/bank |
| POST | `/api/v1/pension/disbursements/{id}/ack` | record acknowledgement |

- **UI Behavior Notes:** Disbursement console with batch validation (invalid accounts, held LC lines), authorise/transmit gates, acknowledgement reconciliation grid (paid/failed), and exception drill-down to grievance creation.
- **Edge Cases:** Partial bank acknowledgement; bank account closed; duplicate transmission retry; PDA format rejection; pensioner suspended for LC mid-batch; clawback of an over-payment.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DisbursementBatcher`, `PDAGatewayAdapter`, `AckReconciler`, `ExceptionRouter` |
| Backend Flow | Build lines → validate accounts/PDA/LC → authorise → transmit (idempotent) → ingest ack → reconcile → raise exceptions |
| Data Operations | Insert disbursement batch+lines; update instruction_status; link grievance on failure |
| Validation | Authorised gate; account validity; totals tie-out; idempotency |
| Authorization | Officer prepare; Authority authorise; Treasury ack |
| State Changes & Side Effects | instruction DRAFT→AUTHORISED→TRANSMITTED→ACKNOWLEDGED/PARTIALLY_ACK/FAILED→RECONCILED; notifications |
| Failure Handling | Gateway down → 503 + retry queue; invalid account → 422 `INVALID_BANK_ACCOUNTS`; duplicate → idempotent no-op |
| Dependencies | FR-09, FR-11, FR-12, FR-13, feeds FR-16 (grievance) |
| Test Guidance | Tie-out; SoD; idempotency; partial ack; LC-hold exclusion; failure→grievance |

---

### FR-M11-15 — Retirement Self-Service Portal & Benefit Estimators / What-If

- **Module:** M11-F15
- **Primary Role(s):** Employee / Retiring Employee, Pensioner (self-service)
- **User Story:** As a retiring employee, I want to see my retirement timeline, estimate my benefits under different scenarios, and submit my pension forms online so that I can plan and act without visiting an office.
- **Description:** Provide a self-service portal where employees view their projected retirement date and case status, run **benefit estimators / what-if** (vary assumed emoluments, commutation fraction, retirement date) producing indicative (non-binding) basic pension, commuted value, gratuity, and leave encashment, submit pension options (commutation choice, nominee details, bank details) into the case, upload documents, and track each processing stage. Pensioners reuse the portal for e-PPO, LC, and grievances.
- **Acceptance Criteria:**
  - AC1: Estimators clearly label results as indicative/non-binding (`is_binding=false`) and never write to the live case.
  - AC2: What-if scenarios can vary commutation fraction, emoluments, and date, recomputing all four headline figures.
  - AC3: Submitted options (commutation, nominee, bank) flow into the case via maker-checker, not directly into sanctioned data.
  - AC4: The employee sees a real-time stage tracker mirroring the case state machine.
  - AC5: All self-service screens cover empty/loading/error/success/permission states (no skeleton placeholders).
- **Business Rules:** BR1: Estimators use current rule tables but flag that final figures depend on verified service and emoluments. BR2: Self-service writes require the employee's identity/MFA and route to Pension Officer review.
- **Data Model References:** `benefit_estimates`, `separation_cases` (status read; option submissions), `nominees_beneficiaries`, `retirement_forecasts` (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/estimates` | run a benefit estimate / what-if |
| GET | `/api/v1/pension/me/case` | my case status & tracker |
| POST | `/api/v1/pension/me/options` | submit commutation/nominee/bank options |

- **UI Behavior Notes:** Estimator with sliders/inputs and a comparison table across saved scenarios; retirement-journey tracker; option-submission wizard with validation and confirmation; pensioner tab for e-PPO/LC/grievance.
- **Edge Cases:** Estimator run before any case exists; assumptions diverging from verified service; multiple saved scenarios; option submitted after sanction (blocked); accessibility/keyboard-only use.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `EstimatorEngine` (reuses FR-05/06/07 in dry-run), `SelfServiceCaseView`, `OptionIntake` |
| Backend Flow | Run engines in non-persisting mode with assumed inputs → return figures + trace → save scenario; options submitted → workflow task to Officer |
| Data Operations | Insert `benefit_estimates` (is_binding=false); option submissions create workflow tasks |
| Validation | Identity/MFA; assumption bounds; no write to sanctioned data; option-after-sanction block |
| Authorization | Employee (own); Pensioner (own) |
| State Changes & Side Effects | estimate saved; option workflow task; notifications |
| Failure Handling | Engine error → friendly message; submission after sanction → 409 `CASE_LOCKED_FOR_OPTIONS` |
| Dependencies | FR-01, FR-05, FR-06, FR-07, FR-09 |
| Test Guidance | Non-binding isolation; what-if recompute; option maker-checker; state coverage; a11y |

---

### FR-M11-16 — Pensioner Grievance Management

- **Module:** M11-F16
- **Primary Role(s):** Pensioner / Family Pensioner, Pension Officer, Sanctioning Authority
- **User Story:** As a pensioner, I want to raise and track grievances about my pension so that issues like non-receipt, wrong amount, or unapplied revision are resolved within an SLA.
- **Description:** Provide grievance intake (categorised), routing to the responsible Pension Officer, SLA tracking with escalation, linkage to the underlying case/PPO/disbursement, and resolution with audit. Auto-creates grievances from disbursement failures (FR-14) and surfaces ageing and SLA-breach analytics.
- **Acceptance Criteria:**
  - AC1: A grievance captures category, description, priority, and links to pensioner/case where known.
  - AC2: SLA due date is set by category/priority; breach escalates to the Sanctioning Authority.
  - AC3: Disbursement failures auto-create a grievance linked to the failed line.
  - AC4: Resolution requires a recorded action and notifies the pensioner; reopen is supported.
  - AC5: Grievance status follows the state machine with full audit.
- **Business Rules:** BR1: SLA matrix configurable by category/priority. BR2: Critical grievances (payment-not-received) auto-prioritise. BR3: Closure requires resolution text.
- **Data Model References:** `pension_grievances`, `pensioners`, `separation_cases`, `pension_disbursements` (link).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/grievances` | raise grievance |
| GET | `/api/v1/pension/grievances/{id}` | grievance detail |
| POST | `/api/v1/pension/grievances/{id}:assign` | assign/route |
| POST | `/api/v1/pension/grievances/{id}:resolve` | resolve/close |

- **UI Behavior Notes:** Grievance inbox with SLA timers, priority badges, linked-record context, resolution form, and pensioner-facing tracker; ageing/breach dashboard for officers.
- **Edge Cases:** Grievance on a closed case; duplicate grievances; escalation when officer unavailable; grievance reopened after closure; multilingual descriptions.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GrievanceService`, `SLATimer`, `EscalationEngine`, `AutoGrievanceFromDisbursement` |
| Backend Flow | Intake → set SLA → assign → track timer → escalate on breach → resolve → notify → allow reopen |
| Data Operations | Insert/update `pension_grievances`; link to case/PPO/disbursement |
| Validation | Required fields; SLA matrix; resolution text on close |
| Authorization | Pensioner raise (own); Officer resolve; Authority on escalation |
| State Changes & Side Effects | OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED / ESCALATED / REOPENED; notifications |
| Failure Handling | Assignment to unavailable officer → re-route; missing link → allow unlinked with flag |
| Dependencies | FR-12, FR-14 |
| Test Guidance | SLA/escalation; auto-creation from failure; resolve/reopen; linkage; state machine |

---

### FR-M11-17 — Forecasting & Pension-Liability Analytics

- **Module:** M11-F17
- **Primary Role(s):** Pension Officer, Department Head, Auditor
- **User Story:** As a Department Head, I want pension-liability and processing analytics so that I can plan budgets, staffing, and SLA compliance.
- **Description:** Provide analytics over the retirement pipeline and pensioner population: due-for-retirement workload by horizon/org/cadre, projected pension-liability (current and future, factoring DA/pay-commission scenarios), benefit-cost breakdown (pension/gratuity/commutation/family pension), processing SLA and ageing (case stage durations, first-pension-on-time rate), and grievance trends. Read-only aggregations sourced from M11 entities; feeds M14.
- **Acceptance Criteria:**
  - AC1: Liability projection aggregates `pensioners.current_monthly_pension` × 12 plus pipeline cases, with scenario sliders for DA/pay-commission.
  - AC2: Workload analytics show counts by horizon bucket, org unit, and cadre.
  - AC3: SLA analytics compute first-pension-on-time rate and average stage durations.
  - AC4: All analytics respect org-unit row-level scope; export honours permissions.
  - AC5: Figures reconcile to underlying records (no fabricated aggregates).
- **Business Rules:** BR1: Analytics are read-only and never mutate cases/pensioners. BR2: Scenario projections are clearly labelled assumptions. BR3: Auditor sees all; managers see own scope.
- **Data Model References:** `retirement_forecasts`, `pensioners`, `separation_cases`, `pension_calculations`, `gratuity_calculations`, `family_pension_records`, `pension_grievances` (all read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/analytics/liability` | liability projection (scenario params) |
| GET | `/api/v1/pension/analytics/workload` | due-for-retirement workload |
| GET | `/api/v1/pension/analytics/sla` | processing SLA & ageing |

- **UI Behavior Notes:** Analytics dashboard with liability projection chart (scenario sliders), workload by horizon/org/cadre, SLA gauges (first-pension-on-time), benefit-cost composition, and grievance trend; export with scope enforcement.
- **Edge Cases:** Sparse data for small org units; scenario extremes; mid-year pay-commission; scope-restricted export; very large pensioner population performance.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AnalyticsAggregator`, `LiabilityProjector`, `SLAComputer` |
| Backend Flow | Query M11 aggregates with scope filter → apply scenario params → return series; cache hot aggregates |
| Data Operations | Read-only aggregate queries; materialised views for heavy aggregates |
| Validation | Scope enforcement; reconciliation to source; scenario bounds |
| Authorization | Manager (own scope), Officer, Auditor (all) |
| State Changes & Side Effects | none (read-only); feeds M14 |
| Failure Handling | Timeout on huge cohort → paginated/streamed; scope breach → 403 |
| Dependencies | FR-01, FR-05..13, M14 |
| Test Guidance | Reconciliation; scope; scenario projection; SLA math; large-cohort performance |

---
## 7. UI Requirements

| Screen | Primary role | Key elements | States covered |
|---|---|---|---|
| Due-for-Retirement Worklist | Pension Officer | horizon tabs, filters, initiate-case, alerts, export | empty, loaded, alert, scope-restricted |
| Separation Case Workspace | Pension Officer/Authority | stage tracker, type-specific panels, documents, audit timeline | draft, in-progress, pending-sanction, sanctioned, rejected, on-hold |
| Pre-Retirement Cockpit | Pension Officer/SR Custodian | SR verification & gap list, no-dues checklist, anticipatory-pension panel | not-started, in-progress, cleared, blocked |
| Qualifying Service Editor | Pension Officer | service timeline, spell table, condonation, live half-year total | draft, verified, locked |
| Pension Worksheet | Pension Officer/Authority | emoluments method compare, fraction, min/max flags, trace; NPS estimator | draft, computed, sanctioned, superseded |
| Commutation Calculator | Employee/Officer | fraction slider (capped), value/residual preview, restoration date | draft, computed, sanctioned, restored |
| Gratuity Worksheet | Officer/Authority | emoluments, half-years, slab, ceiling, nominee split, withhold | draft, computed, sanctioned, withheld, paid |
| Family Pension Panel | Officer/Authority | normal/enhanced amounts, window timeline, beneficiary hierarchy, transfer | computed, active, transferred, ceased |
| Terminal Settlement | Officer/Authority | component breakdown, recoveries, withheld, gross/net, export | draft, computed, sanctioned, partially-withheld, paid |
| GPF Settlement | Officer/Authority | balance, interest, advances, final payable, nominee split (masked) | draft, computed, authorised, paid |
| PPO Composer | Officer/Authority | figures, PDA selector, registry number, e-PPO preview, authorise | draft, issued, authorised, active, superseded |
| Pensioner 360 | Officer/Pensioner | pension summary, LC status, restoration countdown, conversion history, bank (masked) | active, suspended-no-LC, deceased, converted |
| Revision Console | Officer/Authority | batch params, delta preview, exceptions, approve/apply gates, drill-down | draft, computed, approved, applied, failed |
| Disbursement Console | Officer/Authority/Treasury | validation, authorise/transmit, ack reconciliation, exceptions | draft, authorised, transmitted, acknowledged, partial-ack, failed |
| Retirement Self-Service | Employee/Pensioner | timeline tracker, benefit estimator/what-if, option wizard, e-PPO, LC | empty, loaded, error, success, permission |
| Grievance Inbox & Tracker | Pensioner/Officer | SLA timers, priority, linked context, resolution form, ageing dashboard | open, assigned, in-progress, resolved, escalated, reopened |
| Pension Analytics | Manager/Officer/Auditor | liability projection, workload, SLA gauges, benefit-cost, grievance trend | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; keyboard navigation & visible focus; dark mode; responsive/mobile-first for self-service (estimator, options, e-PPO, LC, grievance); money/bank/PAN masked by default with audited reveal; amounts and dates formatted per locale (`DD-MMM-YYYY`); empty/loading/error/success/permission states for every screen; compassionate, simplified flow for death-in-service and family-pension; no skeleton placeholders in production — real fields, data, API calls, and states.

---

## 8. API & Integration

### 8.1 Conventions

REST under `/api/v1`; JSON; JWT bearer + RBAC + org-unit scoping; cursor or page/limit pagination (max 100); `Idempotency-Key` on mutating case-progression, PPO-issue, revision, and disbursement endpoints; all timestamps UTC ISO-8601; money `NUMERIC` strings to avoid float drift.

### 8.2 Canonical Error Envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "retirement_date is required", "field": "retirement_date" }, "requestId": "req_a1b2..." }
```

### 8.3 Error-Code Catalog (shared + M11-specific)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid input |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD denied |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | State conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled |
| UPSTREAM_UNAVAILABLE | 503 | M03/M10/M12/M13/PDA gateway down |
| DUPLICATE_ACTIVE_CASE | 409 | Employee already has an active case |
| CASE_INPUT_INCOMPLETE | 422 | Type-required field missing |
| SERVICE_GAP_UNRESOLVED | 409 | Uncondoned service gap blocks progress |
| EMOLUMENTS_UNAVAILABLE | 422 | M10 emoluments not resolvable |
| RULE_NOT_EFFECTIVE | 422 | No effective rule/rate for the relevant date |
| COMMUTATION_EXCEEDS_LIMIT | 422 | Commuted fraction over statutory max |
| FACTOR_NOT_FOUND | 422 | No commutation factor for age |
| NOMINEE_SPLIT_INVALID | 422 | Nominee shares do not total 100% |
| RECOVERY_EXCEEDS_PROTECTION | 409 | Recovery breaches net protection |
| SCHEME_MISMATCH | 409 | Operation invalid for OPS/NPS scheme |
| CASE_NOT_SANCTIONED | 409 | PPO/settlement before sanction |
| DUPLICATE_PPO_NUMBER | 409 | PPO number collision |
| CASE_LOCKED_FOR_OPTIONS | 409 | Self-service option after sanction |
| INVALID_BANK_ACCOUNTS | 422 | Invalid/missing payee/PDA binding |
| REVISION_IMMUTABLE | 409 | Edit of an applied revision |
| LC_OVERDUE_SUSPENDED | 409 | Action blocked by life-certificate suspension |

### 8.4 JSON Examples

**Compute qualifying service**

```http
POST /api/v1/pension/cases/{caseId}/qualifying-service:compute
Idempotency-Key: qs-7c1e-...
```
```json
{ "qsr_id": "qsr-9001", "gross_service_y": 35, "non_qualifying_days": 92,
  "net_qualifying_y": 34, "reckonable_half_years": 66, "sr_verified": true, "status": "VERIFIED" }
```

**Compute commutation (over-limit error)**

```json
{ "error": { "code": "COMMUTATION_EXCEEDS_LIMIT",
  "message": "commuted_fraction 0.55 exceeds statutory maximum 0.40", "field": "commuted_fraction" },
  "requestId": "req_5f3a" }
```

**Authorise PPO (response)**

```json
{ "ppo_id": "ppo-4512", "ppo_no": "PPO-2026-004512", "ppo_type": "SERVICE_PENSION",
  "basic_pension": "56000.00", "commuted_portion": "22400.00", "residual_pension": "33600.00",
  "effective_from": "2026-10-01", "status": "AUTHORISED_TO_PDA", "pensioner_id": "PNR-000123" }
```

**Disbursement acknowledgement (partial)**

```json
{ "batch_no": "DISB-2026-10-001", "instruction_status": "PARTIALLY_ACK",
  "acknowledged": 1240, "failed": 3,
  "exceptions": [ { "pensioner_id": "PNR-000777", "reason": "ACCOUNT_CLOSED" } ] }
```

### 8.5 Integration Points

| System | Direction | Purpose |
|---|---|---|
| M01 Employee | in | employee master, DOB, cadre, DOJ (scheme/forecast) |
| M03 Attendance/Leave | in | encashable leave balance; non-qualifying leave spells |
| M04 Leave–SR Integration | in | non-qualifying leave events in SR |
| M09 Disciplinary | in | compulsory-retirement order; recoveries; gratuity withhold |
| M10 Payroll | in | last-pay-drawn/emoluments, GPF/NPS contributions, recoveries |
| M12 Service Register | in/out | gap-free service verification (in); retirement/separation events (append) |
| M13 Documents | in/out | store PPO/sanction order/calculation sheet artefacts |
| M14 Dashboards | out | pension liability, workload, SLA KPIs |
| Treasury / PDA / Bank | out/in | disbursement & PPO authorisation; acknowledgement |
| Jeevan Pramaan / DLC service | in | Digital Life Certificate verification |
| NPS / CRA (PRAN) | in/out | NPS corpus reference, annuity/withdrawal handoff |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance (interactive) | P95 < 500ms for reads/config; benefit estimator < 1.5s |
| Performance (batch) | DA revision for 100,000 pensioners within 30 min; monthly disbursement batch < 10 min |
| Determinism | Identical verified inputs produce identical benefit figures; reproducible with rule-version capture |
| Continuity (critical) | First pension/anticipatory authorised before pension commencement for 100% of cases |
| Availability | 99.9% uptime; batch windows scheduled off-peak |
| Scalability | Horizontal scaling of revision/disbursement workers; partition pensioner population by PDA/org |
| Integrity | ACID per case sanction, PPO issue, conversion, revision-apply; immutable sanctioned snapshots & applied revisions |
| Security | OIDC/SSO+MFA; RBAC+row-level scope; SoD; field-level encryption for bank/PAN/nominee/benefit amounts; masked display with audited reveal |
| Privacy | DPDP Act 2023; PII minimisation; heightened sensitivity for deceased/family data; statutory retention (pension records retained for the pensioner's life + statutory tail) |
| Auditability | Every state change in `audit_log`; immutable; `calc_trace` retained for all computations |
| Recoverability | RPO ≤ 15min, RTO ≤ 4h; staged compute allows safe restart of revisions/disbursements |
| Accessibility | WCAG 2.1 AA; simplified compassionate flows for bereaved families |
| Observability | First-pension-on-time SLA monitoring, LC-overdue alerts, disbursement-ack monitoring, revision exception dashboards |
| Compliance | Statutory pension/commutation/gratuity/family-pension rules; effective-dated rule versioning; audit objection traceability |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 Separation Case

| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | INITIATED | type-required inputs present |
| INITIATED | request SR verification | SR_VERIFICATION | Pension Officer |
| SR_VERIFICATION | SR certified | NO_DUES | qsr.sr_verified=true |
| NO_DUES | no-dues cleared | CALCULATION | no_dues CLEARED or anticipatory exception |
| CALCULATION | benefits computed | PENDING_SANCTION | qsr LOCKED & calcs COMPUTED |
| PENDING_SANCTION | sanction | SANCTIONED | checker ≠ maker |
| SANCTIONED | issue PPO | PPO_ISSUED | PPO authorised |
| PPO_ISSUED | settle terminal benefits | SETTLED | settlement PAID |
| SETTLED | close | CLOSED | SR event appended |
| any (non-terminal) | hold | ON_HOLD | with reason |
| any (non-terminal) | reject | REJECTED | with reason |
| ON_HOLD | resume | (prior state) | authority |

### 10.2 PPO

| Current | Event | Next |
|---|---|---|
| DRAFT | generate | ISSUED |
| ISSUED | authorise | AUTHORISED_TO_PDA |
| AUTHORISED_TO_PDA | PDA accepts / pensioner enrolled | ACTIVE |
| ACTIVE | revise | SUPERSEDED (new REVISED PPO ACTIVE) |
| ISSUED/ACTIVE | cancel (error) | CANCELLED |

### 10.3 Pensioner Lifecycle

| Current | Event | Next |
|---|---|---|
| ACTIVE | LC overdue beyond grace | SUSPENDED_NO_LC |
| SUSPENDED_NO_LC | LC submitted & verified | ACTIVE |
| ACTIVE | report death (self) | DECEASED |
| DECEASED | family-pension conversion | CONVERTED_TO_FAMILY |
| ACTIVE/CONVERTED | no eligible beneficiary / cessation | CEASED |

### 10.4 Pension Revision Batch

| Current | Event | Next |
|---|---|---|
| DRAFT | compute deltas | COMPUTED |
| COMPUTED | approve | APPROVED |
| APPROVED | apply | APPLIED |
| COMPUTED/APPROVED | compute fault | FAILED |
| APPLIED | (immutable) | — |

### 10.5 Disbursement Instruction

| Current | Event | Next |
|---|---|---|
| DRAFT | authorise | AUTHORISED |
| AUTHORISED | transmit | TRANSMITTED |
| TRANSMITTED | full ack | ACKNOWLEDGED |
| TRANSMITTED | partial ack | PARTIALLY_ACK |
| TRANSMITTED | rejected | FAILED |
| ACKNOWLEDGED/PARTIALLY_ACK | reconcile | RECONCILED |

### 10.6 Family Pension

| Current | Event | Next |
|---|---|---|
| DRAFT | compute | COMPUTED |
| COMPUTED | sanction | SANCTIONED |
| SANCTIONED | begin payment | ACTIVE |
| ACTIVE | beneficiary cessation w/ next eligible | TRANSFERRED |
| ACTIVE/TRANSFERRED | no eligible beneficiary | CEASED |

### 10.7 Grievance

| Current | Event | Next |
|---|---|---|
| OPEN | assign | ASSIGNED |
| ASSIGNED | start work | IN_PROGRESS |
| IN_PROGRESS | resolve | RESOLVED |
| RESOLVED | close | CLOSED |
| any | SLA breach | ESCALATED |
| CLOSED | reopen | REOPENED |

---

## 11. Notifications

| Event | Recipient | Channel | Trigger FR |
|---|---|---|---|
| Employee crosses retirement horizon threshold | Pension Officer | in-app, email | FR-01 |
| Separation case initiated / sanctioned | Employee, Officer, Authority | in-app, email | FR-02 |
| SR verification required / certified | SR Custodian, Officer | in-app, email | FR-03 |
| No-dues item pending / cleared | No-dues owners, Officer | in-app, email | FR-03 |
| Anticipatory pension authorised | Employee, PDA | in-app, email | FR-03 |
| Benefits computed / sanctioned | Employee, Authority | in-app, email | FR-05..09 |
| PPO issued (e-PPO available) | Pensioner, PDA | in-app, email, SMS | FR-11 |
| Life certificate due / overdue / suspension | Pensioner | in-app, email, SMS | FR-12 |
| Commuted portion restored | Pensioner | in-app, email | FR-12 |
| Pension revised (DA/pay-commission) with arrear | Pensioner | in-app, email | FR-13 |
| Disbursement transmitted / failed | Officer, Pensioner (on failure) | in-app, email, SMS | FR-14 |
| Family pension sanctioned / transferred | Family pensioner, Authority | in-app, email | FR-08, FR-12 |
| Grievance raised / resolved / escalated | Pensioner, Officer, Authority | in-app, email | FR-16 |

---

## 12. Reporting & Analytics

| Report / Dashboard | Audience | Contents |
|---|---|---|
| Due-for-Retirement Forecast | Pension Officer, Dept Head | counts by horizon/org/cadre; case-initiation status |
| Pension Liability Projection | Dept Head, Finance, Auditor | current & projected annual liability; DA/pay-commission scenarios |
| Benefit-Cost Composition | Finance, Auditor | pension/gratuity/commutation/family-pension cost split |
| Processing SLA & Ageing | Pension Officer, Dept Head | stage durations; first-pension-on-time rate; backlog |
| Pensioner Population & Lifecycle | Officer, Auditor | active/suspended/converted; LC compliance; age distribution |
| Revision Impact | Officer, Finance | per-batch old→new, arrear totals, exceptions |
| Disbursement Reconciliation | Officer, Treasury | transmitted vs acknowledged vs failed; ageing of failures |
| Grievance Trends | Officer, Dept Head | volume by category; SLA compliance; reopen rate |
| Audit & Compliance Register | Auditor | sanction trail, SoD adherence, rule-version usage, immutability proofs |

All analytics are read-only, org-unit scoped, reconcile to source records, and feed M14.

---

## 13. Migration & Launch

### 13.1 Data Migration

- Migrate the existing pensioner population: pensioner master, current pension, PPO numbers, PDA bindings, bank details (encrypted), LC status, and commutation/restoration schedules.
- Migrate in-flight separation cases at their current stage with verified service and computed benefits where available.
- Map legacy separation types, schemes (OPS/NPS), and rule versions; load effective-dated rule tables (DA, commutation factors, family-pension rates, gratuity ceilings, retirement ages).
- Load nominee/beneficiary registers and family-pension hierarchies for active family pensioners.

### 13.2 Validation & Parallel Run

- Recompute a statistically significant sample of legacy pensions/gratuities and reconcile to legacy figures within tolerance; investigate variances.
- Run a parallel DA revision against legacy output and tie out per-pensioner deltas.
- Validate PPO-number uniqueness and PDA bindings; dry-run a disbursement batch in a sandbox PDA channel.

### 13.3 Cutover & Launch

- Freeze legacy writes; final delta migration; switch disbursement instructions to M11; verify first post-cutover monthly disbursement end-to-end with PDA acknowledgement.
- Enable pensioner self-service (e-PPO, LC, grievance) after data validation.

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| Rule tables loaded & approved (DA, factors, rates, ceilings, ages) | required |
| Pensioner master reconciled to legacy counts & sums | required |
| Sample benefit recomputation within tolerance | required |
| PPO-number registry continuity verified | required |
| Disbursement sandbox tie-out with PDA | required |
| SoD roles & approvals configured | required |
| DLC/Jeevan Pramaan integration tested with fallback | required |
| Audit log & immutability verified | required |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | retirement_forecasts | /forecasts | — | month-end arithmetic, alerts |
| FR-02 | separation_cases | /cases | §10.1 | type inputs, SoD, single-active |
| FR-03 | separation_cases, qsr, ppo(ANTICIPATORY) | /sr-verification, /no-dues, /anticipatory-pension | §10.1 | gates, anticipatory cap |
| FR-04 | qualifying_service_records, non_qualifying_spells | /qualifying-service | qsr DRAFT→LOCKED | spell deduction, half-years |
| FR-05 | pension_calculations | /pension:compute | calc states | OPS/NPS, min/max, determinism |
| FR-06 | commutation_records | /commutation | §10 (restoration) | cap, factor, residual |
| FR-07 | gratuity_calculations | /gratuity | gratuity states | slab, ceiling, apportionment |
| FR-08 | family_pension_records, nominees | /family-pension | §10.6 | normal/enhanced, hierarchy |
| FR-09 | terminal_settlements | /settlement | settlement states | encashment, netting, withhold |
| FR-10 | gpf_final_settlements | /gpf | gpf states | interest, advances, NPS routing |
| FR-11 | ppo_records, pensioners | /ppo, /ppos | §10.2 | uniqueness, supersession, SoD |
| FR-12 | pensioners, life_certificates | /pensioners, /life-certificate | §10.3 | LC suspend, restoration, conversion |
| FR-13 | pension_revisions | /revisions | §10.4 | DA/pay-comm, arrear, immutability |
| FR-14 | pension_disbursements | /disbursements | §10.5 | tie-out, idempotency, ack |
| FR-15 | benefit_estimates, separation_cases | /estimates, /me/* | — | non-binding, what-if, options |
| FR-16 | pension_grievances | /grievances | §10.7 | SLA, escalation, auto-create |
| FR-17 | (read aggregates) | /analytics/* | — | reconciliation, scope, projection |

### 14.2 Dependency Graph (build order)

1. FR-01 (forecast) + FR-02 (case) → 2. FR-03 (pre-retirement) + FR-04 (qualifying service) → 3. FR-05 (pension) → 4. FR-06 (commutation), FR-07 (gratuity), FR-10 (GPF) → 5. FR-08 (family pension), FR-09 (settlement) → 6. FR-11 (PPO) → 7. FR-12 (pensioner lifecycle) → 8. FR-13 (revision), FR-14 (disbursement) → 9. FR-15 (self-service), FR-16 (grievance) → 10. FR-17 (analytics).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Pipeline foundation | FR-01, FR-02 | start |
| B: Eligibility | FR-03, FR-04 | A |
| C: Benefit engines | FR-05, FR-06, FR-07, FR-10 | B |
| D: Family & settlement | FR-08, FR-09 | C |
| E: Order & pensioner | FR-11, FR-12 | D |
| F: Ongoing ops | FR-13, FR-14 | E |
| G: Self-service & grievance | FR-15, FR-16 | C (FR-15 estimators), E (FR-16) |
| H: Analytics | FR-17 | C, E, F |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Retirement forecasting & due-lists | FR-01 | yes | yes | n/a | yes | none |
| Separation types (all 6) | FR-02 | yes | yes | yes | yes | none |
| Pre-retirement (SR verify, no-dues, anticipatory) | FR-03 | yes | yes | yes | yes | none |
| Qualifying service & non-qualifying deduction | FR-04 | yes | yes | yes | yes | none |
| Pension calc (OPS vs NPS) | FR-05 | yes | yes | yes | yes | none |
| Commutation & restoration | FR-06, FR-12 | yes | yes | yes | yes | none |
| Gratuity (retirement & death) | FR-07 | yes | yes | yes | yes | none |
| Family & enhanced family pension | FR-08 | yes | yes | yes | yes | none |
| Terminal benefits & leave encashment | FR-09 | yes | yes | yes | yes | none |
| GPF final withdrawal | FR-10 | yes | yes | yes | yes | none |
| PPO & digital PPO | FR-11 | yes | yes | yes | yes | none |
| Pensioner master & lifecycle (LC/Jeevan Pramaan) | FR-12 | yes | yes | yes | yes | none |
| Family-pension conversion on pensioner death | FR-08, FR-12 | yes | yes | yes | yes | none |
| Pension revision (DA/pay-commission) | FR-13 | yes | yes | yes | yes | none |
| Treasury/bank/PDA integration | FR-14 | yes | yes | yes | yes | none |
| Self-service portal & estimators/what-if | FR-15 | yes | yes | n/a | yes | none |
| Pensioner grievance | FR-16 | yes | yes | yes | yes | none |
| Forecasting & liability analytics | FR-17 | yes | yes | n/a | yes | none |
| Inputs from M03/M09/M10/M12 | FR-04,05,09,10 + §8.5 | yes | yes | n/a | yes | none |
| Retirement events to M12 (SR) | FR-02,11 + §8.5 | yes | yes | yes | yes | none |

**Result: 0 unresolved gaps.** Every module-focus capability (all separation types, forecasting/due-lists, pre-retirement processing, qualifying service with non-qualifying deduction, pension OPS/NPS, commutation, family/enhanced family pension, gratuity retirement/death, leave encashment, terminal/final settlement, GPF final withdrawal, PPO/e-PPO, pensioner master & lifecycle, Jeevan Pramaan/DLC, restoration, family-pension conversion, DA/pay-commission revision, treasury/bank/PDA integration, self-service & estimators, grievance, analytics, and M03/M09/M10/M12 integration) maps to at least one FR.

---

## 15. Glossary

| Term | Definition |
|---|---|
| Superannuation | Retirement on attaining the prescribed age |
| VRS | Voluntary Retirement Scheme — retirement before superannuation on the employee's request |
| Compulsory retirement | Retirement imposed as a penalty via disciplinary proceedings (M09) |
| Invalidation retirement | Retirement on medical unfitness certified by a medical board |
| Death-in-service | Cessation by death while in service (triggers family pension & death gratuity) |
| Qualifying service | Service counted for pension/gratuity after deducting non-qualifying spells |
| Non-qualifying spell | A period (EOL/LWP, dies-non, unauthorised absence) not counted as qualifying |
| Dies-non | A day treated as "no service, no pay" |
| Emoluments / Average emoluments | Pay base for benefits — last-drawn or 10-month average (whichever beneficial) |
| Basic pension | Monthly defined-benefit pension (OPS) |
| Commutation | Converting a portion of pension into a lump sum |
| Commutation factor | Age-based multiplier converting commuted pension to a lump sum |
| Restoration | Resumption of the commuted portion after the statutory period |
| Retirement gratuity | Lump-sum terminal benefit based on service & emoluments |
| Death gratuity | Lump-sum benefit to nominees on death-in-service (service-slab based) |
| Family pension | Pension to the eligible family of a deceased employee/pensioner |
| Enhanced family pension | Higher family-pension rate for a limited initial window |
| Leave encashment | Cash payment for unused earned leave at separation |
| GPF | General Provident Fund — final balance settled at separation |
| OPS / NPS | Old Pension Scheme (defined benefit) / National Pension System (defined contribution) |
| PPO | Pension Payment Order — statutory pension authorisation document |
| e-PPO / Digital PPO | Electronically generated, signed PPO artefact |
| PDA | Pension Disbursing Authority (treasury/bank) |
| Jeevan Pramaan / DLC | Digital Life Certificate verifying a pensioner is alive |
| Anticipatory pension | Provisional pension paid before final sanction to avoid a break |
| Pay-commission revision | Re-fixation of pension on a new pay-commission framework |
| Dearness Relief / DA | Inflation-linked relief revised periodically on pension |
| SoD | Segregation of Duties (maker ≠ checker) |

---

## 16. Appendices

### 16.1 Benefit Computation Order (default sequence)

1. Verify gap-free service (M12) → 2. Compute qualifying service (deduct non-qualifying spells, round half-years) → 3. Resolve emoluments base (M10; last-drawn vs 10-month average, beneficial) → 4. Basic pension (OPS) / NPS handling → 5. Commutation (option, factor, value, residual, restoration schedule) → 6. Gratuity (retirement/death, slab, ceiling) → 7. Family pension (where applicable; normal/enhanced) → 8. Leave encashment (M03) → 9. GPF final → 10. Net recoveries within protection → 11. Sanction → 12. PPO issue → 13. Disbursement & pensioner enrolment.

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; factors/rates `NUMERIC(9,4)`; service in integer Y/M/D; no floating point.
- Benefit rounding per `rule_version_ref` (default: round to the next higher rupee where rules so prescribe).
- Half-year rounding for qualifying service per the configured rule (e.g., ≥3 months = one half-year).

### 16.3 Recovery Priority & Net Protection

Statutory dues → court attachment → disciplinary recovery (M09) → government over-payment → outstanding loans/advances (M10) → other. If recoveries would breach the protected floor, lower-priority recoveries are deferred and flagged (`RECOVERY_EXCEEDS_PROTECTION`); spillover may be recovered from future pension where rules allow.

### 16.4 Immutability & Correction Policy

A SANCTIONED calculation, an ISSUED/ACTIVE PPO, and an APPLIED revision are immutable. Corrections never edit the original; they are issued as: (a) a SUPERSEDING calculation/REVISED PPO (linked via `supersedes_ppo_id`), (b) a new revision batch, or (c) a recovery/arrear. Anticipatory PPOs are always superseded by the final PPO with adjustment. Each correction references the original for traceability.

### 16.5 OPS vs NPS Handling

- Scheme is derived from `employees.date_of_joining` versus the configured cutover; recorded contribution history corroborates; override requires reason + audit.
- OPS: M11 computes defined-benefit pension, commutation, gratuity, family pension, and GPF.
- NPS: M11 records corpus/PRAN, produces indicative annuity/withdrawal figures, routes to the NPS/CRA exit and annuity service, and computes any NPS-specific additional relief/family benefit per rule; GPF is not applicable.

### 16.6 Assumptions Log

- Single legal entity per deployment (data model entity-aware for future multi-entity).
- Pension/commutation/gratuity/family-pension/DA/ceiling/retirement-age parameters are effective-dated master data entered by SysAdmin and approved.
- PDA/treasury/bank supports a documented file/API format; format is pluggable.
- Jeevan Pramaan/DLC integration is available with physical/video-KYC fallback.
- Emoluments method and reckonable period are configurable policy parameters resolved and snapshotted per case.
