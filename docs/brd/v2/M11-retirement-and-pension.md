# Retirement and Pension Management — HRMS Module BRD (v2.0)

**Module code:** M11-PEN
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory pension rules (CCS Pension Rules-style framework, NPS, **UPS (eff. 01-Apr-2025)**, GPF, Jeevan Pramaan/DLC, DoPPW *Bhavishya*/DigiLocker benchmarks)
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v2.0 (supersedes v1.0)
**Status:** Revised for Gate A re-review — incorporates the adopted improvements from the Adversarial Council Report (`docs/evaluation/M11-retirement-and-pension-council.md`, 2026-06-30)
**Revision basis:** Conditional-GO council verdict. Seven Critical findings (R1–R7) and eleven High/Medium/Low findings (R8–R18) plus three world-class additions are incorporated as concrete requirements, entities, fields, rules, states, and controls. The sound v1 spine (determinism + `calc_trace` + `rule_version_ref`, immutability-by-supersession, SoD, no-break anticipatory engineering, full pensioner lifecycle) is preserved unchanged.

---

## 1. Executive Summary

### 1.1 Purpose

The Retirement and Pension Management module (**M11-PEN**) governs the complete lifecycle of an employee's separation from service and the lifelong administration of their pensionary and terminal benefits. It manages every **separation type** (superannuation/age retirement, voluntary retirement (VRS), compulsory retirement ordered under disciplinary proceedings, invalidation/medical retirement, death-in-service, and resignation); computes **qualifying service** (now including structured **counted prior/military service**) and the full benefit set (basic pension, **service gratuity for <10-year service**, commutation, family/enhanced family pension, retirement and death gratuity, leave encashment, GPF final withdrawal) **net of statutory tax/TDS**; generates the statutory **Pension Payment Order (PPO)** including **provisional PPOs for pending proceedings (Rule 9)**; and maintains the **pensioner master** and pensioner lifecycle (life-certificate/Jeevan Pramaan, restoration of commuted portion, conversion to family pension on a pensioner's death, **proactive death-detection and overpayment recovery**, and pension revision on DA or pay-commission changes under a **deterministic revision-application order**).

M11 is engineered as a **rule-driven, audit-grade benefit engine** that is deterministic and reproducible **on top of a rigorous input-provenance gate**. Benefits are never hand-keyed; they are *derived* from verified service history in the **Digital Service Register (M12)**, last-pay-drawn and contribution history from **Payroll (M10)**, leave balances from **M03**, and disciplinary orders from **M09**, evaluated against **first-class, effective-dated, versioned pension rule-table entities** (DA/Dearness-Relief rates, commutation factors, family-pension rates, gratuity ceilings with the DA-linked auto-step, retirement ages, minimum/maximum pension, rounding). Crucially, computation is **gated by an e-SR completeness & discrepancy-resolution stage** (per-spell reason-code attestation, condonation register, multi-point sign-off) so that determinism defends correct numbers rather than amplifying upstream defects. Once a benefit case is **sanctioned and a PPO is issued, the calculation snapshot is immutable** — corrections flow only through controlled revision/re-issue with full audit. Every rupee of pension is traceable from qualifying-service input through PPO to disbursement, and every audit objection is tracked to closure.

### 1.2 Business Context and Problem Statement

Public-sector retirement processing is high-stakes, statutorily intricate, and time-critical: an employee who superannuates on the last day of a month must receive pension from the next day without a break. Processing combines **service-record verification** (gap-free service from joining to retirement), **qualifying-service arithmetic** (deducting non-qualifying spells such as extraordinary leave without pay, dies-non, and unauthorised absence, and *adding* counted prior service), **three pension regimes** — **Old Pension Scheme (OPS)** for pre-cutoff entrants, **National Pension System (NPS)** for later entrants (with the **CCS (Implementation of NPS) Rules 2021** death/invalidation default benefit), and the **Unified Pension Scheme (UPS)** assured payout for opted-in employees — **commutation actuarial factors**, **family-pension rules** (normal vs enhanced rates with *path-specific* eligibility windows), **gratuity ceilings**, **tax/TDS treatment** of terminal benefits, and **DA/pay-commission revisions** applied to a live pensioner population for decades, sometimes by **bank CPPCs that themselves apply Dearness Relief**. Manual processing produces delayed first pensions, miscalculated benefits, audit objections, litigation, pension drawn into deceased pensioners' accounts, and hardship to bereaved families. M11 eliminates these by making the rule set explicit and versioned, the computation reproducible and traceable **only after the input is proven complete**, the workflow gated by service verification and no-dues, the disbursement model explicit per PDA, fraud caught proactively, and the pensioner lifecycle fully digital — with a **plain-language citizen layer** over the statutory core.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Zero break in pension | First pension/anticipatory/provisional pension authorised on/before the day after retirement for 100% of cases |
| G2 | Deterministic, reproducible benefit computation | Re-running a case **with the snapshotted rule version and the same verified inputs** yields identical benefit figures and trace. *External/indicative NPS-CRA and UPS-annuity figures are explicitly excluded from the determinism guarantee.* |
| G3 | Statutory accuracy | 100% correct qualifying-service, pension (flat 50% ≥10 yrs / service gratuity <10 yrs), commutation, gratuity, *path-specific* family-pension, UPS/NPS-default, and tax computation against published rules |
| G4 | Service-verified eligibility | No CALCULATION without a **signed-off service-verification record** (discrepancy ledger closed, spells attested); no PPO without M12 SR verification complete and no-dues cleared |
| G5 | Digital, self-service retirement | Retiring employee tracks case via a **3-state plain-language tracker**, runs **outcome-framed estimators**, and submits forms online; pensioner submits Digital Life Certificate online and receives the e-PPO in **DigiLocker** |
| G6 | Lifelong pensioner integrity | Correct DA/pay-commission revision under a **deterministic application order**, commuted-portion restoration on the **reduction-date+15yr** schedule, family-pension conversion, and proactive death/fraud control across the pensioner's life |
| G7 | Forecasting & liability transparency | Accurate due-for-retirement forecasts and pension-liability analytics by org unit, cadre, and horizon |
| G8 | Audit-objection closure (new) | 100% of AG/internal-audit objections tracked from raise to closure with linkage to the case and `calc_trace` |

### 1.4 Scope Summary

In scope: retirement forecasting & due-for-retirement lists; separation-case management for all separation types; **e-SR completeness & discrepancy-resolution gate**; pre-retirement processing (1–2 years ahead: SR verification with M12, no-dues clearance, anticipatory pension); **provisional pension for pending proceedings (Rule 9)**; qualifying-service computation with non-qualifying-spell deduction **and counted prior-service addition**; pension calculation (basic OPS flat-rate / **service gratuity** / **NPS death-default** / **UPS assured payout**); commutation **with explicit reduction/restoration timing**; retirement, death **and service** gratuity (ceiling **auto-stepping on DA milestones**); **path-specific** family & enhanced family pension driven by a **statutory family-members register** (with **dual family pension and twin/multiple-children** support); terminal benefits & final settlement (incl. leave encashment from M03, GPF final withdrawal) **with tax/TDS and Section 89(1) relief**; PPO generation (incl. digital PPO, **DigiLocker delivery**); pensioner master & lifecycle (life certificate/Jeevan Pramaan, restoration, family-pension conversion); **proactive death-detection (death-registry/Aadhaar-DBT reconciliation) and overpayment recovery from estate**; pension revision on DA/pay-commission under a **deterministic ordering rule** and an explicit **paymaster-vs-authoriser disbursement model**; treasury/bank/PDA integration with a **defined interface contract and pre-credit penny-drop verification**; retirement self-service portal & **outcome-framed estimators/what-if**; pensioner grievance management; **audit-objection management**; **effective-dated rule-table management**; and forecasting & pension-liability analytics.

Out of scope (owned elsewhere): the canonical employee master (M01); the SR ledger itself (M12) — M11 reads/verifies and appends retirement events; payroll computation of in-service salary and the monthly active-employee payslip (M10) — M11 consumes last-pay-drawn and contribution history; leave capture and encashable-balance maintenance (M03); disciplinary adjudication that issues a compulsory-retirement penalty order or recovery (M09) — M11 consumes the order; document storage internals (M13); and core banking/treasury ledger posting beyond producing and reconciling the disbursement file and (where the PDA is a CPPC) the Dearness-Relief application that the bank performs.

### 1.5 Key Stakeholders

Retiring Employee / Pensioner / Family Pensioner (self-service), Pension Officer/Dealing Assistant (maker), Pension Sanctioning Authority / Head of Office (checker), HR Officer/Admin, SR Custodian/Registrar (M12), Payroll Officer (M10 last-pay & contributions), Department Head / Appointing Authority, Treasury / Pension Disbursing Authority (PDA) / Bank CPPC, Medical Board (invalidation), **Auditor / AG (audit objections)**, **Disciplinary Authority (M09, provisional-pension linkage)**, System Administrator (rule tables).

### 1.6 Success Criteria

A retirement case is "successful" when: the separation is recorded with the correct type and date; **service verification is signed off with the discrepancy ledger closed and every non-qualifying spell reason-code-attested**; no-dues is cleared; qualifying service (including counted prior service) and all benefits — under the correct OPS/NPS/UPS regime, with service gratuity where service <10 yrs, path-specific family pension, and tax/TDS — are computed deterministically against a snapshotted rule version with full trace and sanctioned by an authority distinct from the maker; the PPO (and where applicable anticipatory **or provisional** pension) is issued before pension commencement; terminal benefits and GPF are settled net of tax; the pensioner is enrolled in the pensioner master; the disbursement instruction passes **pre-credit account verification** and is accepted by the PDA/bank under the recorded disbursement model; and a retirement event is appended to M12 — all with a complete, immutable audit trail and any audit objection tracked to closure.

---

## 2. Amendments (v1 → v2)

This table maps every adopted improvement (and its source risk) to where and how it is incorporated. All 21 adopted improvements are reflected.

| # | Adopted improvement (risk) | Where incorporated in v2 | How |
|---|---|---|---|
| 1 | Split enhanced family-pension window by path (R1, **Critical**) | §5.2 `family_pension_records` (new `enhanced_basis` + split window fields); FR-08 (AC2/AC2a, BR1a); §5.5 enum `enhanced_basis`; §10.6; §16.7 | IN_SERVICE → 10 yrs no age cap; AFTER_RETIREMENT → 7 yrs / age-67 / would-be-superannuation, whichever earlier; both step-downs tested |
| 2 | Replace proportionate pension; add Service Gratuity (R2, **Critical**) | FR-05 (rewritten AC1, AC1a), FR-07 (SERVICE_GRATUITY branch); §5.5 enum `gratuity_type`; §16.5 | ≥10 yrs = flat 50%; <10 yrs = no pension, one-time service gratuity; proportionate fraction deprecated |
| 3 | Add UPS + government-NPS death/invalidation defaults (R3, **Critical**) | §5.2 `pension_calculations` (UPS/NPS-default fields); FR-05 (AC4 rewritten, AC4a/AC4b); §5.5 enum `pension_scheme` adds UPS; §16.6 | UPS assured payout (~50% of last-12-mo avg) + opt-in flag; CCS-NPS Rules 2021 OPS-equivalent family/invalid default |
| 4 | Separate family-members register from nominees (R4, **Critical**) | New entity E26 `family_members`; FR-08 (family-eligibility now driven by E26); `nominees_beneficiaries` restricted to gratuity/GPF/leave-encashment; IR8, IR14, relationship map | Form 3/Form 14 statutory family register drives family-pension hierarchy; nomination ≠ family-pension eligibility |
| 5 | e-SR completeness & discrepancy-resolution stage (R5, **Critical**) | New entities E27 `service_verifications`, E28 `service_discrepancies`, E29 `condonation_orders`; new FR-18; FR-04 gated on FR-18; §10.1 guard; IR2a | Discrepancy ledger, per-spell reason-code attestation, condonation register (orders not free text), multi-point sign-off gate CALCULATION |
| 6 | Record paymaster-vs-authoriser model (R6, **Critical**) | New entity E37 `pension_disbursing_authorities` (`pda_disbursement_model`); new FR-21; FR-13 & FR-14 branch on model; §9 NFR batch sizing | M11_COMPUTES_FULL vs PDA_APPLIES_RELIEF; FR-13 recompute-and-instruct vs notify-relief-order-and-reconcile |
| 7 | Model effective-dated rule-table entities (R7, **Critical**) | New entities E30–E36 (DA relief, commutation factors, family-pension rates, gratuity ceilings, retirement ages, pension limits, rounding rules); new FR-19; `rule_version_ref` now FK | Real, versioned, effective-dated rows; load + sign-off in §13.4 |
| 8 | Define PDA/treasury interface contract (R8, High) | FR-21 + §8.6 (file/API field list, ack schema, error taxonomy, retry/re-route, sandbox); §13 week-1 workstream | Concrete contract replaces "pluggable" hand-wave |
| 9 | Proactive death-detection & overpayment recovery (R9, High) | New entities E38 `pension_overpayment_recoveries`, E40-adjacent reconciliation job; new FR-20; FR-12 link; §12 exception report | Death-registry/Aadhaar-DBT reconciliation, anomaly/dormancy detection, recovery-from-estate workflow |
| 10 | Provisional Pension (Rule 9) as first-class (R10, High) | New entity E41 `provisional_pension_records`; new FR-22; `ppo_type` adds PROVISIONAL; §5.5; §10.2; M09 guard | Provisional pension + fully-withheld DCRG until proceedings conclude, with post-decision recovery |
| 11 | Disambiguate commutation/restoration timing (R11, High) | §5.2 `commutation_records` (`commutation_payment_date`, `reduction_effective_date`); FR-06 (BR2 rewritten, AC3a); IR4a | restoration = reduction date + 15 yrs; migrated-unknown-date handling |
| 12 | Tax/TDS on terminal settlement (R12, High) | §5.2 `terminal_settlements` (tax fields + `tax_breakdown` JSONB); FR-09 (AC2a, BR4); §16.8 | Gratuity ₹20L cap exemption, commutation exemption, leave-encashment exemption, TDS lines, Section 89(1) relief |
| 13 | Deterministic revision-application order (R13, High) | FR-13 (AC6, BR4); §16.9; NFR determinism row | Mandatory order: pay-commission re-fix → restoration → DA → age increment; tested invariant |
| 14 | Dual family pension & twins/multiple children (R14, Medium) | FR-08 (BR2 replaced); `family_members.concurrent_share_pct`; IR14 | Dual family pension (with cap) + simultaneous twin/eligible-children shares |
| 15 | Pre-credit bank-account verification (R15, Medium) | New entity E42 `bank_account_verifications`; FR-14 (AC1a, BR1a); error `ACCOUNT_VERIFICATION_FAILED` | Penny-drop / name-IFSC (NPCI mapper) before first credit; block on mismatch |
| 16 | Plain-language citizen layer (R16, Medium) | FR-15 (rewritten AC4, AC6/AC7); §7 (citizen screens); §11 (LC calendar, bereavement guide) | 3-state tracker (In progress / Approved / Being paid), outcome-framed estimator, LC calendar, bereavement guide |
| 17 | Reword determinism goal G2 (R17, Low) | §1.3 G2; §9 Determinism | "identical given snapshotted rule version + verified inputs"; external NPS/UPS figures excluded |
| 18 | Structured counted prior service (R18, Medium) | New entity E39 `prior_service_records`; FR-04 (AC4a, BR4); §5.5 enum `prior_service_type` | Ex-servicemen / prior central/state/temporary service, distinct from VRS weightage |
| 19 | Audit-objection tracking entity (world-class) | New entity E40 `audit_objections`; new FR-23; §12 Audit & Compliance Register | AG/internal-audit objections with response/closure workflow, linked to case + `calc_trace` |
| 20 | Digital-delivery (DigiLocker) for e-PPO (best-in-class) | FR-24 (new); FR-11 link; §8.5 integrations; §13 Bhavishya benchmark | Push signed e-PPO/revision orders to DigiLocker; link PPO ↔ Aadhaar/PRAN |
| 21 | Auto-revise gratuity ceiling on DA milestones (supports R7) | E33 `gratuity_ceilings` (`da_threshold_pct`, `auto_step_pct`); FR-07 (BR3a); FR-19 | Ceiling steps up 25% each time DA crosses a 50% threshold, driven by the rule-table entity |

---

## 3. Scope & Boundaries

### 3.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Retirement Forecasting & Due-for-Retirement | M11-F01 | Projected superannuation dates, horizon lists, alerts, workload forecasting |
| Separation Case Management | M11-F02 | Initiate/track all separation types with type-specific data & workflow; scheme OPS/NPS/UPS |
| Pre-Retirement Processing | M11-F03 | SR verification (M12), no-dues clearance, anticipatory pension, 1–2-year lead pipeline |
| Qualifying Service Computation | M11-F04 | Count service, deduct non-qualifying spells, **add counted prior service**, round per rule |
| Pension Calculation | M11-F05 | Basic pension (OPS flat-rate) / **service gratuity** / **NPS death-default** / **UPS assured payout** |
| Commutation of Pension | M11-F06 | Commuted value, factor by age, residual, **reduction-date-based restoration** timeline |
| Gratuity Computation | M11-F07 | Retirement, death **and service** gratuity; statutory ceiling **auto-stepping on DA milestones** |
| Family & Enhanced Family Pension | M11-F08 | **Path-specific** normal & enhanced family pension from the **family-members register**; dual/twin support |
| Terminal Benefits & Final Settlement | M11-F09 | Leave encashment (M03), composite settlement, recoveries netting, **tax/TDS & 89(1) relief** |
| GPF Final Withdrawal | M11-F10 | GPF final balance, interest, advances adjustment, final authorisation |
| PPO Generation & Digital PPO | M11-F11 | PPO (service/family/anticipatory/**provisional**/revised), e-PPO, PPO number registry |
| Pensioner Master & Lifecycle | M11-F12 | Pensioner record, Jeevan Pramaan/DLC, restoration, family-pension conversion on death |
| Pension Revision | M11-F13 | DA & pay-commission revision under a **deterministic application order**; disbursement-model aware |
| Treasury / Bank / PDA Integration | M11-F14 | Disbursement instructions, **penny-drop verification**, PPO authorisation transfer, ack reconciliation |
| Retirement Self-Service & Estimators | M11-F15 | **Plain-language** portal, **outcome-framed** estimator/what-if, form submission, status tracking |
| Pensioner Grievance Management | M11-F16 | Grievance intake, routing, SLA, resolution for pensioners/family pensioners |
| Forecasting & Pension-Liability Analytics | M11-F17 | Liability projection, benefit-cost analytics, SLA & ageing dashboards |
| Service-Record Completeness & Discrepancy Resolution | M11-F18 | e-SR completeness gate: discrepancy ledger, spell attestation, condonation register, sign-off |
| Effective-Dated Pension Rule-Table Management | M11-F19 | DA, factors, FP rates, gratuity ceilings (auto-step), ages, min/max, rounding — versioned master data |
| Proactive Death Detection & Overpayment Recovery | M11-F20 | Death-registry/DBT reconciliation, anomaly detection, recovery-from-estate |
| PDA Registry & Disbursement Model | M11-F21 | PDA master, `pda_disbursement_model`, interface contract, sandbox tie-out |
| Provisional Pension (Rule 9 — Pending Proceedings) | M11-F22 | Provisional pension + fully-withheld DCRG until proceedings conclude |
| Audit Objection Management | M11-F23 | AG/internal-audit objection intake, response, closure, linkage to case & trace |
| Digital Delivery & DigiLocker / DBT Linkage | M11-F24 | Push e-PPO/revision orders to DigiLocker; link PPO ↔ Aadhaar/PRAN |

### 3.2 Common Capabilities (inherited from Shared Foundation)

All M11 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); maker-checker via the shared workflow engine; RBAC + org-unit row-level scoping; immutable `audit_log` write on every state change; `documents` (M13) for generated artefacts (PPO, sanction orders, calculation sheets); `notifications` for events; `service_register_events` (M12) for retirement/separation events.

### 3.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In M11? | Owner / Note |
|---|---|---|
| Employee master data | Reference only | M01 (golden source) |
| Service history / SR ledger | Verify, **reconcile discrepancies** & append | M12 owns ledger; M11 runs the completeness/discrepancy gate (FR-18) and appends retirement events |
| Last-pay-drawn & contribution history | Consume only | M10 supplies emoluments base, GPF/NPS contributions |
| Leave encashable balance | Consume only | M03 supplies encashable EL balance; M11 computes encashment amount |
| Compulsory-retirement penalty order | Consume the order | M09 adjudicates; M11 processes the resulting separation |
| Pending departmental/judicial proceedings | **Consume status; drive provisional pension** | M09 supplies proceedings status; M11 issues provisional pension & withholds DCRG (FR-22) |
| Disciplinary recovery against benefits | Consume; net from settlement | M09 issues recovery; M11 nets within statutory protection |
| Active-employee payroll run | Out | M10 (M11 begins at separation/retirement) |
| Pension monthly disbursement & **Dearness-Relief application** | Instruction + reconcile; **DR by M11 or by PDA per model** | PDA/Treasury/Bank disburse; where PDA is a CPPC it applies DR (FR-21 model) |
| Document storage internals | Reference | M13 stores PPO/sanction/calc-sheet objects |
| Medical fitness adjudication | Consume verdict | Medical Board issues invalidation certificate; M11 records & uses it |
| Income-tax assessment | Compute TDS at source only | M11 computes exemptions/TDS/89(1) relief on terminal benefits; final assessment is the tax authority's |
| Death-registry / Aadhaar-DBT signals | **Reconcile** | M11 ingests death/payment signals to detect post-death drawals (FR-20) |

### 3.4 Assumptions and Constraints

- Pension/commutation/gratuity rules, DA rates for pensioners, commutation factors by age, family-pension rates, and gratuity ceilings are **first-class, effective-dated rule-table entities** (E30–E36), version-controlled and approved (FR-19), sourced from government notifications. `rule_version_ref` is a **foreign key** to a concrete rule-version row, not free text.
- The OPS/NPS/UPS cutover dates (date-of-joining boundaries and the UPS opt-in window) are configurable; scheme is derived from `employees.date_of_joining` and recorded contribution history, overridable with justification and audit. **UPS** applies to opted-in NPS employees from 01-Apr-2025.
- A single legal entity per deployment; the data model is entity-aware (`legal_entity_id`) for future multi-entity.
- All money math uses fixed-point decimal (`NUMERIC`); rounding rules per statutory prescription are explicit and configurable via E36 (`rounding_rules`).
- "Emoluments" / "average emoluments" base and the reckonable period are configurable policy parameters resolved per case and snapshotted. **UPS** uses the last-12-month average pay base.
- Digital Life Certificate integrates with a Jeevan Pramaan-style service; manual life-certificate capture (physical/video-KYC/bank-certified) is always available as a fallback.
- The **disbursement model is explicit per PDA** (FR-21): some PDAs are paid an exact computed amount (M11_COMPUTES_FULL); CPPC banks are sent the basic + relief formula and apply DR themselves (PDA_APPLIES_RELIEF). Determinism and batch sizing assumptions branch on this.
- Determinism is guaranteed **only after** the service-verification record is signed off (FR-18) and against the snapshotted rule version; external NPS-CRA/UPS-annuity figures are indicative and excluded from the guarantee.

---

## 4. Shared Application Foundation

M11 inherits the Shared Foundation §5 technical defaults verbatim: React + TypeScript (Tailwind + shadcn/ui) frontend; REST `/api/v1`; PostgreSQL primary store; encrypted object storage for PPOs/sanction orders/calculation sheets; OIDC/SSO + MFA; JWT + RBAC + org-unit row-level scoping; canonical error envelope; OWASP ASVS; TLS 1.2+, encryption at rest; DPDP Act 2023 alignment; P95 < 500ms (interactive), batch SLAs in §9; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

**M11-specific foundation extensions:**

- **Money type:** `NUMERIC(15,2)` for all benefit amounts; rates/factors as `NUMERIC(9,4)`; service durations as integer years/months/days; no floating point in computation.
- **Computation determinism (restated):** every benefit engine is a pure function of (**signed-off** verified service record, emoluments snapshot, scheme, **rule-version rows** effective on the relevant date, beneficiary/family data). Same inputs → same outputs **given the snapshotted rule version**; a `calc_trace` (JSONB) is persisted with each calculation. External NPS-CRA/UPS-annuity figures are indicative and outside the guarantee.
- **Input-provenance gate (new):** no benefit engine runs until the case has a `service_verifications` row in `SIGNED_OFF`/`LOCKED` status with its discrepancy ledger closed and every non-qualifying spell reason-code-attested (FR-18).
- **Immutability:** a sanctioned calculation and its issued PPO are append-only snapshots; corrections create a new revision linked to the original (no silent edit).
- **Idempotency:** all case-progression, PPO-issue, revision, disbursement, and **account-verification** mutating endpoints accept an `Idempotency-Key` header.
- **Transactionality:** sanction, PPO issue, family-pension conversion, **revision-apply**, and **death-conversion** each commit as all-or-nothing transactions; multi-step settlement writes use transactions.
- **Encryption & PII:** bank account numbers, PAN/national_id/Aadhaar, nominee/family details, and benefit amounts are PII/financial data — encrypted at rest, masked in UI by default, access logged. Deceased-employee/family-pensioner data handled with heightened sensitivity. **Death-registry/DBT reconciliation data** is processed under DPDP purpose-limitation and retained only as needed for fraud control.
- **Determinism contract for concurrent events:** when multiple pensioner events share an effective date, the engine applies them in the mandatory order of §16.9 (pay-commission re-fixation → commuted-portion restoration → DA/Dearness-Relief → age-based additional pension).

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
| E07 | `pension_calculations` | M11 | M11 | Basic/service-gratuity/NPS-default/UPS computation snapshot |
| E08 | `commutation_records` | M11 | M11 | Commuted value, factor, residual pension, restoration schedule |
| E09 | `gratuity_calculations` | M11 | M11 | Retirement/death/service gratuity computation with ceiling |
| E10 | `family_pension_records` | M11 | M11 | Family pension entitlement, path-specific normal/enhanced rates |
| E11 | `terminal_settlements` | M11 | M11 | Composite final settlement incl. leave encashment, recoveries & tax |
| E12 | `gpf_final_settlements` | M11 | M11 | GPF final balance, interest, advances adjustment, authorisation |
| E13 | `ppo_records` | M11 | M11 | Pension Payment Order header + registry + e-PPO |
| E14 | `pensioners` | M11 | M11 | Pensioner master & lifecycle status |
| E15 | `pensioner_life_certificates` | M11 | M11 | Annual life certificate / Digital Life Certificate (DLC) records |
| E16 | `pension_revisions` | M11 | M11 | DA / pay-commission revision batches and per-pensioner deltas |
| E17 | `pension_disbursements` | M11 | M11 | Disbursement instruction batches/lines & PDA acknowledgement |
| E18 | `retirement_forecasts` | M11 | M11 | Materialised due-for-retirement projections & workload |
| E19 | `pension_grievances` | M11 | M11 | Pensioner/family grievance tickets with SLA |
| E20 | `benefit_estimates` | M11 | M11 | Self-service / what-if benefit estimation snapshots (non-binding) |
| E21 | `nominees_beneficiaries` | M11 | M11 | Nominee register for **gratuity, GPF, leave encashment** (NOT family pension) |
| E26 | `family_members` | M11 | M11 | **Statutory family register (Form 3/14)** driving family-pension eligibility |
| E27 | `service_verifications` | M11 | M11 | e-SR completeness/sign-off record gating CALCULATION |
| E28 | `service_discrepancies` | M11 | M11 | Discrepancy-ledger lines against the service record |
| E29 | `condonation_orders` | M11 | M11 | Condonation register (orders, not free text) |
| E30 | `da_relief_rates` | M11 | M11 | Effective-dated Dearness Relief % rule table |
| E31 | `commutation_factors` | M11 | M11 | Commutation factor by age-next-birthday, effective-dated |
| E32 | `family_pension_rates` | M11 | M11 | Normal/enhanced family-pension rate rule table |
| E33 | `gratuity_ceilings` | M11 | M11 | Gratuity statutory ceiling with DA-linked auto-step |
| E34 | `retirement_age_rules` | M11 | M11 | Superannuation age by cadre/category, effective-dated |
| E35 | `pension_limit_rules` | M11 | M11 | Minimum/maximum pension & service-thresholds rule table |
| E36 | `rounding_rules` | M11 | M11 | Half-year & money rounding rules, effective-dated |
| E37 | `pension_disbursing_authorities` | M11 | M11 | PDA registry with `pda_disbursement_model` & interface config |
| E38 | `pension_overpayment_recoveries` | M11 | M11 | Post-death/other overpayment identification & recovery-from-estate |
| E39 | `prior_service_records` | M11 | M11 | Structured counted prior/military service feeding qualifying service |
| E40 | `audit_objections` | M11 | M11 | AG/internal-audit objections with response/closure workflow |
| E41 | `provisional_pension_records` | M11 | M11 | Rule-9 provisional pension with withheld DCRG |
| E42 | `bank_account_verifications` | M11 | M11 | Penny-drop / name-IFSC pre-credit verification results |
| E22 | `audit_log` | Shared | Platform | Immutable audit (written) |
| E23 | `documents` | Shared (M13) | M13 | PPO/sanction/calc-sheet object metadata (referenced) |
| E24 | `notifications` | Shared | Platform | Outbound events (written) |
| E25 | `workflow_instances`/`workflow_tasks` | Shared | Platform | Approvals (used) |

**M11-owned entity count: 34** (E04–E21 carried from v1 = 18; E26–E42 new = 16). Shared referenced: E01–E03, E22–E25.

### 5.2 Full Field Tables (M11-owned entities)

Carried-forward entities E04–E21 retain their v1 field tables; only the **changed** ones are reproduced in full below with new fields marked **(new)**. All new entities E26–E42 are given full field tables.

#### E04 `separation_cases` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `case_id` | UUID PK | N | |
| `case_no` | TEXT unique | N | human key e.g. `PEN-2026-000123` |
| `employee_id` | UUID FK→employees | N | subject |
| `separation_type` | ENUM | N | SUPERANNUATION, VOLUNTARY_RETIREMENT, COMPULSORY_RETIREMENT, INVALIDATION, DEATH_IN_SERVICE, RESIGNATION |
| `pension_scheme` | ENUM | N | OPS, NPS, **UPS** (derived, overridable w/ reason) |
| `ups_opted_in` | BOOL | N | **(new)** UPS opt-in flag (only meaningful for NPS-eligible cohort) |
| `retirement_date` | DATE | N | date of cessation of service |
| `pension_commence_date` | DATE | Y | day after retirement (or per rule) |
| `reason_ref` | TEXT | Y | M09 order id (compulsory), VRS application id, medical board ref, death report ref |
| `proceedings_pending` | BOOL | N | **(new)** pending departmental/judicial proceedings at retirement (Rule 9 → provisional) |
| `proceedings_ref` | TEXT | Y | **(new)** M09 proceedings id |
| `notice_date` | DATE | Y | VRS notice / order date |
| `initiated_by_role` | ENUM | N | SELF, HR, SYSTEM_FORECAST, DISCIPLINARY_M09 |
| `service_verification_id` | UUID FK→service_verifications | Y | **(new)** links the signed-off e-SR completeness record |
| `sr_verification_id` | UUID FK→qualifying_service_records | Y | links verified service |
| `no_dues_status` | ENUM | N | NOT_STARTED, IN_PROGRESS, CLEARED, BLOCKED |
| `anticipatory_pension_flag` | BOOL | N | anticipatory pension authorised |
| `provisional_pension_flag` | BOOL | N | **(new)** provisional pension authorised (Rule 9) |
| `pda_id` | UUID FK→pension_disbursing_authorities | Y | **(new)** bound PDA (carries disbursement model) |
| `status` | ENUM | N | DRAFT, INITIATED, SR_VERIFICATION, NO_DUES, CALCULATION, PENDING_SANCTION, SANCTIONED, PPO_ISSUED, SETTLED, CLOSED, ON_HOLD, REJECTED |
| `legal_entity_id` | UUID | N | |
| `org_unit_id` | UUID FK→org_units | N | scope |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E05 `qualifying_service_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `qsr_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `service_start_date` | DATE | N | date of joining (reckonable) |
| `service_end_date` | DATE | N | retirement/death date |
| `gross_service_y/m/d` | INT | N | gross years/months/days |
| `non_qualifying_days` | INT | N | total deducted days (sum of uncondoned spells) |
| `prior_service_days` | INT | N | **(new)** total counted prior/military service added (from E39) |
| `net_qualifying_y/m/d` | INT | N | net qualifying after deduction **and prior-service addition** |
| `reckonable_half_years` | INT | N | rounded half-years used for benefit (per E36) |
| `weightage_years` | INT | Y | additional qualifying weightage (e.g., VRS) — distinct from prior service |
| `meets_min_pension_service` | BOOL | N | **(new)** true if net qualifying ≥ min-service threshold (E35); false ⇒ service gratuity only |
| `sr_verified` | BOOL | N | M12 gap-free verification complete |
| `sr_verified_by` | UUID FK→users | Y | SR Custodian |
| `sr_verified_at` | TIMESTAMP | Y | |
| `verification_notes` | TEXT | Y | gaps/condonations summary (detail lives in E27–E29) |
| `status` | ENUM | N | DRAFT, VERIFIED, LOCKED |
| audit fields | — | — | |

#### E07 `pension_calculations` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `pension_calc_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `scheme` | ENUM | N | OPS, NPS, **UPS** |
| `benefit_outcome` | ENUM | N | **(new)** FULL_PENSION, SERVICE_GRATUITY_ONLY, NPS_DEFAULT_FAMILY, NPS_DEFAULT_INVALID, UPS_ASSURED, NPS_INDICATIVE |
| `emoluments_base` | NUMERIC(15,2) | Y | last-drawn or average emoluments (OPS) |
| `emoluments_method` | ENUM | Y | LAST_DRAWN, AVG_10_MONTH, BENEFICIAL_OF_BOTH, **AVG_12_MONTH (UPS)** |
| `avg_emoluments` | NUMERIC(15,2) | Y | averaging base if used |
| `qualifying_half_years` | INT | Y | from QSR |
| `pension_fraction` | NUMERIC(9,4) | Y | **flat 0.50 for ≥10 yrs** (proportionate fraction deprecated; see §16.5) |
| `basic_pension` | NUMERIC(15,2) | Y | computed monthly basic pension (OPS) |
| `minimum_pension_applied` | BOOL | N | floored to statutory minimum (E35) |
| `maximum_pension_cap_applied` | BOOL | N | capped to statutory maximum (E35) |
| `ups_assured_payout` | NUMERIC(15,2) | Y | **(new)** ~50% of last-12-month average pay (UPS) |
| `ups_min_guarantee_applied` | BOOL | N | **(new)** UPS minimum guarantee (e.g., ₹10,000) applied |
| `nps_default_benefit_amount` | NUMERIC(15,2) | Y | **(new)** OPS-equivalent family/invalid pension under CCS-NPS Rules 2021 |
| `nps_corpus_ref` | TEXT | Y | NPS PRAN / corpus reference (NPS) |
| `nps_annuity_estimate` | NUMERIC(15,2) | Y | indicative annuity (NPS, informational — excluded from determinism) |
| `nps_lumpsum_estimate` | NUMERIC(15,2) | Y | indicative withdrawal (NPS) |
| `calc_trace` | JSONB | N | step-by-step derivation |
| `rule_version_ref` | UUID FK→rule-version row | N | **(changed: now FK, not TEXT)** effective rule snapshot |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, SUPERSEDED |
| audit fields | — | — | |

#### E08 `commutation_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `commutation_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `pension_calc_id` | UUID FK→pension_calculations | N | |
| `opted` | BOOL | N | employee opted to commute |
| `commuted_fraction` | NUMERIC(9,4) | Y | ≤ statutory max (e.g. 0.40) |
| `commuted_pension_amount` | NUMERIC(15,2) | Y | monthly pension portion commuted |
| `age_next_birthday` | INT | Y | for factor lookup |
| `commutation_factor` | NUMERIC(9,4) | Y | FK-resolved from E31 by age |
| `commutation_factor_ref` | UUID FK→commutation_factors | Y | **(new)** exact factor row used |
| `commuted_value` | NUMERIC(15,2) | Y | lump sum = commuted×factor×12 |
| `residual_pension` | NUMERIC(15,2) | Y | basic − commuted portion |
| `commutation_payment_date` | DATE | Y | **(new)** date commuted value is paid |
| `reduction_effective_date` | DATE | Y | **(new)** date monthly pension is reduced (= payment date per rule) |
| `restoration_due_date` | DATE | Y | **(changed)** = `reduction_effective_date` + statutory period (15 yrs) |
| `migrated_date_unknown` | BOOL | N | **(new)** true for migrated pensioners with unknown dates → manual restoration review |
| `restored` | BOOL | N | restoration applied |
| `restored_on` | DATE | Y | |
| `calc_trace` | JSONB | Y | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, RESTORED, SUPERSEDED |
| audit fields | — | — | |

#### E09 `gratuity_calculations` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `gratuity_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `gratuity_type` | ENUM | N | RETIREMENT_GRATUITY, DEATH_GRATUITY, **SERVICE_GRATUITY** |
| `emoluments_base` | NUMERIC(15,2) | N | basic+DA at relevant date |
| `qualifying_half_years` | INT | N | capped per rule (e.g. max 66) |
| `service_slab_factor` | NUMERIC(9,4) | Y | death-gratuity slab multiplier by service length |
| `service_gratuity_months` | NUMERIC(9,4) | Y | **(new)** service-gratuity multiplier (e.g. 0.5 month emoluments per half-year, <10 yrs) |
| `computed_amount` | NUMERIC(15,2) | N | before ceiling |
| `statutory_ceiling` | NUMERIC(15,2) | N | resolved from E33 (incl. DA auto-step) |
| `ceiling_ref` | UUID FK→gratuity_ceilings | Y | **(new)** exact ceiling row used |
| `ceiling_applied` | BOOL | N | |
| `payable_amount` | NUMERIC(15,2) | N | min(computed, ceiling); service gratuity has no DCRG ceiling |
| `withheld_amount` | NUMERIC(15,2) | Y | withheld pending no-dues **or Rule-9 proceedings (fully withheld)** |
| `nominee_split` | JSONB | Y | beneficiary apportionment (death gratuity) — from E21 |
| `calc_trace` | JSONB | N | |
| `rule_version_ref` | UUID FK→rule-version row | N | **(changed: FK)** |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, WITHHELD_PROCEEDINGS, SUPERSEDED |
| audit fields | — | — | |

#### E10 `family_pension_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `fp_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | Y | from death-in-service or pensioner death conversion |
| `source_pensioner_id` | UUID FK→pensioners | Y | when converted on pensioner death |
| `employee_id` | UUID FK→employees | N | original employee |
| `enhanced_basis` | ENUM | N | **(new)** IN_SERVICE \| AFTER_RETIREMENT — drives the window rule |
| `emoluments_base` | NUMERIC(15,2) | N | base for family pension |
| `normal_rate_pct` | NUMERIC(9,4) | N | e.g. 0.30 of emoluments (from E32) |
| `enhanced_rate_pct` | NUMERIC(9,4) | Y | e.g. 0.50 of emoluments (from E32) |
| `normal_amount` | NUMERIC(15,2) | N | monthly normal family pension |
| `enhanced_amount` | NUMERIC(15,2) | Y | monthly enhanced family pension |
| `enhanced_from` | DATE | Y | enhanced period start |
| `enhanced_to` | DATE | Y | **(changed)** computed per `enhanced_basis`: IN_SERVICE = +10 yrs no age cap; AFTER_RETIREMENT = min(+7 yrs, age-67/would-be-superannuation) |
| `enhanced_window_rule` | TEXT | N | **(new)** which window rule was applied (audit) |
| `current_family_member_id` | UUID FK→family_members | Y | **(changed: FK to E26, not nominees)** active recipient |
| `beneficiary_hierarchy` | JSONB | Y | ordered eligible-family chain snapshot from E26 |
| `dual_family_pension` | BOOL | N | **(new)** both spouses govt servants → two family pensions (with cap) |
| `dual_cap_applied` | BOOL | N | **(new)** statutory dual-FP cap applied |
| `eligibility_review_date` | DATE | Y | next review (minor majority, remarriage, disability) |
| `calc_trace` | JSONB | N | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, ACTIVE, TRANSFERRED, CEASED, SUPERSEDED |
| audit fields | — | — | |

#### E11 `terminal_settlements` (changed — tax added)

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
| `gratuity_exempt_amount` | NUMERIC(15,2) | Y | **(new)** exempt up to ₹20L cap |
| `gratuity_taxable_amount` | NUMERIC(15,2) | Y | **(new)** excess over exemption |
| `commutation_exempt_amount` | NUMERIC(15,2) | Y | **(new)** commuted-pension exemption |
| `leave_encashment_exempt_amount` | NUMERIC(15,2) | Y | **(new)** leave-encashment exemption |
| `taxable_total` | NUMERIC(18,2) | Y | **(new)** net taxable across components |
| `tds_amount` | NUMERIC(15,2) | Y | **(new)** TDS deducted at source |
| `section_89_relief` | NUMERIC(15,2) | Y | **(new)** Section 89(1) relief on arrears |
| `tax_breakdown` | JSONB | Y | **(new)** per-component exempt/taxable/TDS lines + rule refs |
| `net_settlement` | NUMERIC(18,2) | N | gross − recoveries − TDS |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, PARTIALLY_WITHHELD, SUPERSEDED |
| audit fields | — | — | |

#### E13 `ppo_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `ppo_id` | UUID PK | N | |
| `ppo_no` | TEXT unique | N | statutory PPO number (registry-issued) |
| `case_id` | UUID FK→separation_cases | N | |
| `pensioner_id` | UUID FK→pensioners | Y | set on enrolment |
| `ppo_type` | ENUM | N | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, **PROVISIONAL**, REVISED |
| `pension_calc_ref` | UUID FK→pension_calculations | Y | |
| `family_pension_ref` | UUID FK→family_pension_records | Y | |
| `provisional_ref` | UUID FK→provisional_pension_records | Y | **(new)** for PROVISIONAL PPOs |
| `basic_pension` | NUMERIC(15,2) | Y | sanctioned basic |
| `relief_formula_ref` | UUID FK→da_relief_rates | Y | **(new)** relief formula carried for PDA_APPLIES_RELIEF model |
| `commuted_portion` | NUMERIC(15,2) | Y | |
| `residual_pension` | NUMERIC(15,2) | Y | |
| `pda_id` | UUID FK→pension_disbursing_authorities | Y | PDA/treasury/bank (carries disbursement model) |
| `effective_from` | DATE | N | pension commencement |
| `e_ppo_document_id` | UUID FK→documents | Y | digital PPO artefact |
| `digilocker_pushed` | BOOL | N | **(new)** e-PPO delivered to DigiLocker |
| `digilocker_ref` | TEXT | Y | **(new)** DigiLocker issued-document URI |
| `authorised_by` | UUID FK→users | Y | sanctioning authority |
| `authorised_at` | TIMESTAMP | Y | |
| `supersedes_ppo_id` | UUID FK→ppo_records | Y | for REVISED/final-over-provisional PPOs |
| `status` | ENUM | N | DRAFT, ISSUED, AUTHORISED_TO_PDA, ACTIVE, SUPERSEDED, CANCELLED |
| audit fields | — | — | |

#### E14 `pensioners` (changed)

Carries v1 fields plus: `aadhaar_masked` TEXT Y **(new)** (encrypted, for DBT/death reconciliation), `pran` TEXT Y **(new)** (NPS/UPS linkage), `disbursement_model` ENUM N **(new, denormalised from PDA)** M11_COMPUTES_FULL\|PDA_APPLIES_RELIEF, `death_detected_source` ENUM Y **(new)** REPORTED\|DEATH_REGISTRY\|DBT_ANOMALY\|LC_FAILURE, `overpayment_open` BOOL N **(new)**. All other v1 fields unchanged.


#### E26 `family_members` (new — statutory family register, Form 3/14)

| Field | Type | Null | Notes |
|---|---|---|---|
| `family_member_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | the government servant |
| `name` | TEXT | N | |
| `relationship` | ENUM | N | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, DISABLED_CHILD, WIDOWED_DAUGHTER, DEPENDENT_SIBLING, OTHER |
| `dob` | DATE | Y | minority/majority, age-25 cutoff, age tracking |
| `is_disabled_dependent` | BOOL | N | lifelong family pension eligibility |
| `is_minor` | BOOL | N | computed |
| `marital_status` | ENUM | Y | UNMARRIED, MARRIED, WIDOWED, DIVORCED — drives eligibility/remarriage rules |
| `is_govt_servant` | BOOL | N | for dual-family-pension determination |
| `statutory_rank` | INT | N | rule-defined family-pension priority (spouse=1, eligible child by age, disabled=lifelong, parents) |
| `concurrent_share_pct` | NUMERIC(9,4) | Y | for twins/multiple eligible children drawing simultaneously |
| `eligibility_status` | ENUM | N | ELIGIBLE, NOT_YET_ELIGIBLE, CEASED, UNDER_REVIEW |
| `cessation_reason` | ENUM | Y | MAJORITY, MARRIAGE, EMPLOYMENT, INCOME_THRESHOLD, DEATH, REMARRIAGE_NA |
| `form_ref` | TEXT | Y | Form 3 / Form 14 document reference (M13) |
| `valid_from` / `valid_to` | DATE | Y | |
| `status` | ENUM | N | ACTIVE, SUPERSEDED, REMOVED |
| audit fields | — | — | |

#### E27 `service_verifications` (new — e-SR completeness gate)

| Field | Type | Null | Notes |
|---|---|---|---|
| `verification_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `coverage_from` / `coverage_to` | DATE | N | service span under verification |
| `gap_count` | INT | N | open gaps detected |
| `discrepancy_open_count` | INT | N | unresolved discrepancy-ledger lines |
| `spells_attested_count` | INT | N | non-qualifying spells with reason-code attestation |
| `spells_total_count` | INT | N | total non-qualifying spells requiring attestation |
| `sr_custodian_signoff_by` | UUID FK→users | Y | M12 custodian |
| `payroll_signoff_by` | UUID FK→users | Y | M10 officer (emoluments/contributions provenance) |
| `pension_officer_signoff_by` | UUID FK→users | Y | maker attestation |
| `signoff_complete` | BOOL | N | all required sign-offs present |
| `status` | ENUM | N | DRAFT, DISCREPANCIES_OPEN, ATTESTED, SIGNED_OFF, LOCKED |
| audit fields | — | — | |

#### E28 `service_discrepancies` (new — discrepancy ledger)

| Field | Type | Null | Notes |
|---|---|---|---|
| `discrepancy_id` | UUID PK | N | |
| `verification_id` | UUID FK→service_verifications | N | |
| `discrepancy_type` | ENUM | N | SERVICE_GAP, MISSING_REASON_CODE, SUSPENSION_UNREGULARISED, OVERLAPPING_SPELL, MISSING_ORDER, PAY_ANOMALY, PRIOR_SERVICE_UNVERIFIED, OTHER |
| `period_from` / `period_to` | DATE | Y | |
| `source_module` | ENUM | Y | M03, M04, M09, M10, M12, MANUAL |
| `source_ref` | TEXT | Y | event/order id |
| `description` | TEXT | N | |
| `resolution_action` | ENUM | Y | REASON_CODE_ATTESTED, CONDONED, REGULARISED, WAIVED, CORRECTED_IN_SOURCE, ESCALATED |
| `condonation_order_id` | UUID FK→condonation_orders | Y | when resolved by condonation |
| `resolved_by` | UUID FK→users | Y | |
| `resolved_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | OPEN, RESOLVED, CONDONED, WAIVED, ESCALATED |
| audit fields | — | — | |

#### E29 `condonation_orders` (new — condonation register)

| Field | Type | Null | Notes |
|---|---|---|---|
| `condonation_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→separation_cases | Y | |
| `order_no` | TEXT unique | N | authorising order number |
| `order_date` | DATE | N | |
| `authority` | TEXT | N | sanctioning authority of the condonation |
| `condonation_type` | ENUM | N | BREAK_IN_SERVICE, DEFICIENCY_IN_QUALIFYING_SERVICE, EOL_TREATED_QUALIFYING, OTHER |
| `period_from` / `period_to` | DATE | Y | |
| `condoned_days` | INT | N | days made qualifying |
| `document_id` | UUID FK→documents | Y | scanned order (M13) |
| `status` | ENUM | N | VALID, REVOKED |
| audit fields | — | — | |

#### E30 `da_relief_rates` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `da_rate_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | effective-dated window |
| `applies_to` | ENUM | N | PENSIONER (Dearness Relief); also used as relief formula on PPO |
| `da_percent` | NUMERIC(9,4) | N | e.g. 0.5000 = 50% |
| `pay_commission_basis` | TEXT | Y | 7CPC/8CPC basis tag |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| `approved_by` / `approved_at` | — | Y | SysAdmin approval (SoD) |
| audit fields | — | — | |

#### E31 `commutation_factors` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `factor_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `age_next_birthday` | INT | N | lookup key |
| `factor` | NUMERIC(9,4) | N | commutation multiplier |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E32 `family_pension_rates` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `fp_rate_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `normal_rate_pct` | NUMERIC(9,4) | N | e.g. 0.30 |
| `enhanced_rate_pct` | NUMERIC(9,4) | N | e.g. 0.50 |
| `enhanced_in_service_years` | INT | N | 10 (no age cap) |
| `enhanced_after_retire_years` | INT | N | 7 |
| `enhanced_after_retire_age_cap` | INT | N | 67 |
| `dual_fp_cap_amount` | NUMERIC(15,2) | Y | statutory cap on two family pensions |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E33 `gratuity_ceilings` (new — rule table, DA auto-step)

| Field | Type | Null | Notes |
|---|---|---|---|
| `ceiling_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `base_ceiling` | NUMERIC(15,2) | N | e.g. 2,000,000 |
| `da_threshold_pct` | NUMERIC(9,4) | N | DA crossing each 50% triggers a step |
| `auto_step_pct` | NUMERIC(9,4) | N | 0.25 (ceiling +25% per threshold crossed) |
| `current_effective_ceiling` | NUMERIC(15,2) | N | base after applicable auto-steps |
| `da_rate_ref` | UUID FK→da_relief_rates | Y | DA driving the step |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E34 `retirement_age_rules` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `age_rule_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `cadre` | TEXT | Y | null = default |
| `category` | TEXT | Y | e.g. teaching, judicial |
| `superannuation_age` | INT | N | e.g. 60/62/65 |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E35 `pension_limit_rules` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `limit_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `min_pension` | NUMERIC(15,2) | N | statutory minimum |
| `max_pension` | NUMERIC(15,2) | N | statutory maximum (e.g. 50% of highest pay) |
| `min_qualifying_years_for_pension` | INT | N | 10 (below ⇒ service gratuity) |
| `min_qualifying_years_for_full` | INT | N | 10 (≥ ⇒ flat 50%) |
| `ups_min_guarantee` | NUMERIC(15,2) | Y | UPS assured minimum |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E36 `rounding_rules` (new — rule table)

| Field | Type | Null | Notes |
|---|---|---|---|
| `rounding_id` | UUID PK | N | |
| `effective_from` / `effective_to` | DATE | N/Y | |
| `half_year_threshold_months` | INT | N | e.g. ≥3 months = one half-year |
| `money_rounding` | ENUM | N | NEXT_HIGHER_RUPEE, NEAREST_RUPEE |
| `qualifying_service_cap_half_years` | INT | N | e.g. 66 |
| `version_no` | INT | N | |
| `status` | ENUM | N | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E37 `pension_disbursing_authorities` (new — PDA registry & model)

| Field | Type | Null | Notes |
|---|---|---|---|
| `pda_id` | UUID PK | N | |
| `pda_code` | TEXT unique | N | human key |
| `pda_name` | TEXT | N | |
| `pda_type` | ENUM | N | TREASURY, BANK_CPPC, POST_OFFICE |
| `pda_disbursement_model` | ENUM | N | **M11_COMPUTES_FULL** \| **PDA_APPLIES_RELIEF** |
| `interface_type` | ENUM | N | FILE_SFTP, REST_API |
| `file_format_ref` | TEXT | Y | §8.6 contract version |
| `ack_schema_ref` | TEXT | Y | §8.6 ack schema version |
| `penny_drop_supported` | BOOL | N | account-verification capability |
| `sandbox_certified` | BOOL | N | tie-out completed (§13) |
| `status` | ENUM | N | ACTIVE, SUSPENDED, RETIRED |
| audit fields | — | — | |

#### E38 `pension_overpayment_recoveries` (new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `overpayment_id` | UUID PK | N | |
| `pensioner_id` | UUID FK→pensioners | N | |
| `trigger` | ENUM | N | POST_DEATH_DRAWAL, LATE_DEATH_REPORT, REVISION_EXCESS, ANTICIPATORY_EXCESS, DBT_ANOMALY, OTHER |
| `detected_via` | ENUM | N | DEATH_REGISTRY, AADHAAR_DBT, LC_FAILURE, MANUAL, ANOMALY_JOB |
| `period_from` / `period_to` | DATE | Y | over-drawn period |
| `overpaid_amount` | NUMERIC(15,2) | N | |
| `recovered_amount` | NUMERIC(15,2) | Y | |
| `recovery_mode` | ENUM | Y | FROM_FAMILY_PENSION, FROM_ESTATE, FROM_LEGAL_HEIR, WRITE_OFF |
| `legal_heir_ref` | TEXT | Y | |
| `status` | ENUM | N | IDENTIFIED, NOTIFIED, UNDER_RECOVERY, RECOVERED, WRITTEN_OFF, LEGAL |
| audit fields | — | — | |

#### E39 `prior_service_records` (new — counted prior/military service)

| Field | Type | Null | Notes |
|---|---|---|---|
| `prior_service_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→separation_cases | Y | |
| `prior_service_type` | ENUM | N | MILITARY, PRIOR_CENTRAL, PRIOR_STATE, PRIOR_TEMPORARY, AUTONOMOUS_BODY |
| `from_date` / `to_date` | DATE | N | prior service span |
| `counted_days` | INT | N | days counted toward qualifying service |
| `pro_forma_ref` | TEXT | Y | pro-forma/verification order reference |
| `pension_already_drawn` | BOOL | N | if a prior pension exists (exclusion/condition) |
| `verified` | BOOL | N | |
| `verified_by` | UUID FK→users | Y | |
| `status` | ENUM | N | DRAFT, VERIFIED, COUNTED, REJECTED |
| audit fields | — | — | |

#### E40 `audit_objections` (new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `objection_id` | UUID PK | N | |
| `objection_no` | TEXT unique | N | human key |
| `source` | ENUM | N | AG_AUDIT, INTERNAL_AUDIT, TREASURY, SELF_DETECTED |
| `case_id` | UUID FK→separation_cases | Y | |
| `ppo_id` | UUID FK→ppo_records | Y | |
| `pensioner_id` | UUID FK→pensioners | Y | |
| `calc_trace_ref` | TEXT | Y | linkage to the disputed `calc_trace` |
| `objection_text` | TEXT | N | |
| `raised_on` | DATE | N | |
| `sla_due_at` | TIMESTAMP | Y | |
| `response_text` | TEXT | Y | |
| `outcome` | ENUM | Y | ACCEPTED_CORRECTED, DROPPED, RECOVERY_RAISED, SETTLED |
| `linked_revision_id` | UUID FK→pension_revisions | Y | correction issued |
| `status` | ENUM | N | RAISED, UNDER_RESPONSE, RESPONDED, ACCEPTED, DROPPED, CLOSED |
| audit fields | — | — | |

#### E41 `provisional_pension_records` (new — Rule 9)

| Field | Type | Null | Notes |
|---|---|---|---|
| `provisional_id` | UUID PK | N | |
| `case_id` | UUID FK→separation_cases | N | |
| `proceedings_ref` | TEXT | N | M09 departmental/judicial proceedings id |
| `proceedings_type` | ENUM | N | DEPARTMENTAL, JUDICIAL |
| `provisional_pension_amount` | NUMERIC(15,2) | N | provisional monthly pension |
| `dcrg_withheld` | BOOL | N | DCRG fully withheld (always true until conclusion) |
| `dcrg_withheld_amount` | NUMERIC(15,2) | N | |
| `commenced_on` | DATE | N | provisional pension start |
| `proceedings_concluded_on` | DATE | Y | |
| `conclusion_outcome` | ENUM | Y | EXONERATED, PENALTY_NO_RECOVERY, PENALTY_WITH_RECOVERY |
| `final_recovery_amount` | NUMERIC(15,2) | Y | post-decision recovery |
| `status` | ENUM | N | ACTIVE, CONCLUDED_REGULARISED, CONCLUDED_RECOVERY |
| audit fields | — | — | |

#### E42 `bank_account_verifications` (new — penny-drop)

| Field | Type | Null | Notes |
|---|---|---|---|
| `verification_id` | UUID PK | N | |
| `pensioner_id` | UUID FK→pensioners | Y | |
| `case_id` | UUID FK→separation_cases | Y | |
| `account_no_masked` | TEXT | N | encrypted at rest |
| `ifsc` | TEXT | N | |
| `account_name` | TEXT | N | as supplied |
| `method` | ENUM | N | PENNY_DROP, NAME_IFSC_MATCH, NPCI_MAPPER |
| `name_match_score` | NUMERIC(9,4) | Y | fuzzy match score |
| `verified_name` | TEXT | Y | name returned by bank |
| `result` | ENUM | N | PENDING, MATCH, NAME_MISMATCH, ACCOUNT_INVALID, FAILED |
| `verified_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | PENDING, PASSED, BLOCKED |
| audit fields | — | — | |

### 5.3 Relationship Map (changes from v1)

- `separation_cases 1—1 service_verifications 1—N service_discrepancies`; `service_discrepancies N—1 condonation_orders`.
- `separation_cases 1—1 qualifying_service_records 1—N non_qualifying_spells`; `qualifying_service_records 1—N prior_service_records` (added).
- `separation_cases 1—1 pension_calculations 1—1 commutation_records`.
- `separation_cases 1—N gratuity_calculations` (retirement, death, **or service** gratuity).
- `separation_cases 1—1 terminal_settlements 1—1 gpf_final_settlements` (tax fields on settlement).
- `employees 1—N family_members`; `family_pension_records N—1 family_members (current recipient)` — **family pension is driven by E26, not E21**.
- `employees 1—N nominees_beneficiaries` — restricted to GRATUITY/GPF/LEAVE_ENCASHMENT scopes only.
- `separation_cases 1—N ppo_records`; PROVISIONAL PPO `1—1 provisional_pension_records`; `ppo_records 1—1 pensioners` (active PPO).
- `pension_disbursing_authorities 1—N ppo_records / pensioners / pension_disbursements` (carries disbursement model).
- `pensioners 1—N pension_overpayment_recoveries`, `1—N bank_account_verifications`, `1—N audit_objections`.
- All benefit calcs `N—1 rule-version rows` (E30–E36) via `rule_version_ref` (now FK).
- `separation_cases / ppo_records 1—N audit_objections`.
- All entities write `audit_log`; generated PPOs/sanctions/calc-sheets reference `documents` (M13); retirement events append to `service_register_events` (M12); e-PPO pushed to DigiLocker (FR-24).

### 5.4 Ownership / Reuse Matrix (delta)

Unchanged from v1 for E04–E21 and shared entities. New M11-owned entities E26–E42 are owned/written by M11, read by M14/Auditor; `pension_disbursing_authorities` and the rule tables (E30–E36) are written only by SysAdmin under approval (FR-19/FR-21) and read by every benefit engine. `family_members` is sourced from M01/employee Form-3/14 declarations but mastered in M11 for pension purposes.

### 5.5 Enum Catalog (additions/changes over v1)

| Enum | Values |
|---|---|
| pension_scheme | OPS, NPS, **UPS** |
| gratuity_type | RETIREMENT_GRATUITY, DEATH_GRATUITY, **SERVICE_GRATUITY** |
| ppo_type | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, **PROVISIONAL**, REVISED |
| pension_calc.benefit_outcome | FULL_PENSION, SERVICE_GRATUITY_ONLY, NPS_DEFAULT_FAMILY, NPS_DEFAULT_INVALID, UPS_ASSURED, NPS_INDICATIVE |
| family_pension.enhanced_basis | IN_SERVICE, AFTER_RETIREMENT |
| pda_disbursement_model | M11_COMPUTES_FULL, PDA_APPLIES_RELIEF |
| service_verification.status | DRAFT, DISCREPANCIES_OPEN, ATTESTED, SIGNED_OFF, LOCKED |
| service_discrepancy.status | OPEN, RESOLVED, CONDONED, WAIVED, ESCALATED |
| discrepancy_type | SERVICE_GAP, MISSING_REASON_CODE, SUSPENSION_UNREGULARISED, OVERLAPPING_SPELL, MISSING_ORDER, PAY_ANOMALY, PRIOR_SERVICE_UNVERIFIED, OTHER |
| prior_service_type | MILITARY, PRIOR_CENTRAL, PRIOR_STATE, PRIOR_TEMPORARY, AUTONOMOUS_BODY |
| family_member.relationship | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, DISABLED_CHILD, WIDOWED_DAUGHTER, DEPENDENT_SIBLING, OTHER |
| overpayment.status | IDENTIFIED, NOTIFIED, UNDER_RECOVERY, RECOVERED, WRITTEN_OFF, LEGAL |
| audit_objection.status | RAISED, UNDER_RESPONSE, RESPONDED, ACCEPTED, DROPPED, CLOSED |
| provisional.status | ACTIVE, CONCLUDED_REGULARISED, CONCLUDED_RECOVERY |
| account_verification.result | PENDING, MATCH, NAME_MISMATCH, ACCOUNT_INVALID, FAILED |
| rule_table.status (E30–E36) | DRAFT, APPROVED, EFFECTIVE, SUPERSEDED |
| nominees_beneficiaries.benefit_scope | GRATUITY, GPF, LEAVE_ENCASHMENT (**FAMILY_PENSION removed — now E26**) |

All v1 enums not listed here are carried forward unchanged.

### 5.6 Data Integrity Rules (changes/additions over v1)

- **IR2 (amended):** `net_qualifying = gross − Σ(uncondoned non-qualifying days) + Σ(counted prior-service days)`; condoned spells (via E29) count as qualifying.
- **IR2a (new):** A case cannot enter CALCULATION unless its `service_verifications` row is `SIGNED_OFF`/`LOCKED` with `discrepancy_open_count = 0` and `spells_attested_count = spells_total_count`.
- **IR3a (new):** If `qualifying_service_records.meets_min_pension_service = false` (net < min-service threshold E35), no `pension_calculations` FULL_PENSION row may exist; a `SERVICE_GRATUITY` `gratuity_calculations` row is mandatory instead.
- **IR4a (new):** `commutation_records.restoration_due_date = reduction_effective_date + statutory_period`; if `migrated_date_unknown = true`, restoration is flagged for manual review and not auto-applied.
- **IR8 (amended):** Family-pension eligibility and hierarchy derive from `family_members` (E26) by `statutory_rank`, never from `nominees_beneficiaries`. On a SELF_PENSIONER death, a `family_pension_records` (CONVERTED) row + FAMILY_PENSION PPO are created with `enhanced_basis = AFTER_RETIREMENT`.
- **IR8a (new):** Death-in-service family pension uses `enhanced_basis = IN_SERVICE` (10-yr window, no age cap); after-retirement conversion uses AFTER_RETIREMENT (7-yr/age-67 window). Windows are computed from E32, not hand-set.
- **IR14 (amended):** Sum of `nominees_beneficiaries.share_pct` per apportioned scope (GRATUITY/GPF/LEAVE_ENCASHMENT) = 100.00. For family pension, simultaneous twins/eligible children draw per `family_members.concurrent_share_pct` summing to 100.00; dual family pension is permitted subject to `family_pension_rates.dual_fp_cap_amount`.
- **IR15 (new):** A PROVISIONAL PPO requires `separation_cases.proceedings_pending = true` and `provisional_pension_records.dcrg_withheld = true`; DCRG is released or recovered only on `proceedings_concluded_on`.
- **IR16 (new):** No disbursement line for a FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE type to a given account may be TRANSMITTED unless a `bank_account_verifications` row for that account is `PASSED`.
- **IR17 (new):** `rule_version_ref` on every benefit calculation must point to a rule-version row whose status was EFFECTIVE on the relevant date; SUPERSEDED rows remain referenced by historic calcs (immutability).
- **IR18 (new):** When ≥2 revision events share an effective date for one pensioner, they are applied strictly in the §16.9 order; the `calc_trace` records the applied order.
- **IR19 (new):** A `pension_overpayment_recoveries` row in IDENTIFIED/NOTIFIED/UNDER_RECOVERY holds (does not delete) the pensioner's disbursement where rules require, and links to any family-pension conversion.
- All v1 IRs (IR1, IR5–IR7, IR9–IR13) carried forward unchanged.

### 5.7 Sample Data (new/changed entities; 2–3 rows each)

**separation_cases (with scheme/proceedings)**

| case_no | separation_type | pension_scheme | ups_opted_in | proceedings_pending | status |
|---|---|---|---|---|---|
| PEN-2026-000123 | SUPERANNUATION | OPS | false | false | PPO_ISSUED |
| PEN-2026-000130 | SUPERANNUATION | UPS | true | false | CALCULATION |
| PEN-2026-000131 | SUPERANNUATION | OPS | false | true | PENDING_SANCTION |

**family_members**

| family_member_id | employee_id | relationship | statutory_rank | is_disabled_dependent | concurrent_share_pct | eligibility_status |
|---|---|---|---|---|---|---|
| fm-001 | e-2087 | SPOUSE | 1 | false | 100.0000 | ELIGIBLE |
| fm-002 | e-2087 | SON | 2 | false | null | NOT_YET_ELIGIBLE |
| fm-003 | e-4500 | DISABLED_CHILD | 3 | true | 100.0000 | ELIGIBLE |

**service_verifications**

| verification_id | case_id | discrepancy_open_count | spells_attested_count | spells_total_count | status |
|---|---|---|---|---|---|
| sv-1001 | PEN-2026-000123 | 0 | 2 | 2 | LOCKED |
| sv-1002 | PEN-2026-000130 | 1 | 0 | 1 | DISCREPANCIES_OPEN |

**service_discrepancies**

| discrepancy_id | verification_id | discrepancy_type | resolution_action | status |
|---|---|---|---|---|
| sd-1 | sv-1001 | MISSING_REASON_CODE | REASON_CODE_ATTESTED | RESOLVED |
| sd-2 | sv-1001 | SERVICE_GAP | CONDONED | CONDONED |
| sd-3 | sv-1002 | PRIOR_SERVICE_UNVERIFIED | ESCALATED | OPEN |

**pension_calculations (outcomes incl. service gratuity / UPS / NPS-default)**

| pension_calc_id | case_id | scheme | benefit_outcome | pension_fraction | basic_pension | ups_assured_payout | status |
|---|---|---|---|---|---|---|---|
| pc-7001 | PEN-2026-000123 | OPS | FULL_PENSION | 0.5000 | 56000.00 | null | SANCTIONED |
| pc-7010 | PEN-2026-000130 | UPS | UPS_ASSURED | null | null | 58000.00 | COMPUTED |
| pc-7011 | PEN-2026-000140 | OPS | SERVICE_GRATUITY_ONLY | null | null | null | COMPUTED |
| pc-7012 | PEN-2026-000124 | NPS | NPS_DEFAULT_FAMILY | null | null | null | COMPUTED |

**gratuity_calculations (incl. SERVICE_GRATUITY + ceiling auto-step)**

| gratuity_id | case_id | gratuity_type | qualifying_half_years | computed_amount | statutory_ceiling | payable_amount | status |
|---|---|---|---|---|---|---|---|
| gr-3001 | PEN-2026-000123 | RETIREMENT_GRATUITY | 66 | 2046000.00 | 2500000.00 | 2046000.00 | SANCTIONED |
| gr-3010 | PEN-2026-000140 | SERVICE_GRATUITY | 16 | 688000.00 | null | 688000.00 | COMPUTED |
| gr-3002 | PEN-2026-000124 | DEATH_GRATUITY | 34 | 1032000.00 | 2500000.00 | 1032000.00 | COMPUTED |

(Note: ceiling 2,500,000 reflects E33 auto-step after DA crossed 50%.)

**family_pension_records (path-specific window)**

| fp_id | case_id | enhanced_basis | normal_amount | enhanced_amount | enhanced_from | enhanced_to | status |
|---|---|---|---|---|---|---|---|
| fp-2001 | PEN-2026-000124 | IN_SERVICE | 23400.00 | 39000.00 | 2026-06-13 | 2036-06-12 | COMPUTED |
| fp-2002 | (conv) | AFTER_RETIREMENT | 19200.00 | 32000.00 | 2030-02-01 | 2034-01-31 | ACTIVE |

**commutation_records (timing)**

| commutation_id | commuted_value | residual_pension | commutation_payment_date | reduction_effective_date | restoration_due_date |
|---|---|---|---|---|---|
| cm-5001 | 2249548.80 | 33600.00 | 2026-10-15 | 2026-10-15 | 2041-10-15 |

**terminal_settlements (tax)**

| settlement_id | gross_settlement | gratuity_exempt_amount | gratuity_taxable_amount | tds_amount | section_89_relief | net_settlement |
|---|---|---|---|---|---|---|
| ts-9001 | 4800000.00 | 2000000.00 | 46000.00 | 9200.00 | 0.00 | 4790800.00 |

**pension_disbursing_authorities**

| pda_code | pda_type | pda_disbursement_model | interface_type | penny_drop_supported | status |
|---|---|---|---|---|---|
| TREAS-HYD-01 | TREASURY | M11_COMPUTES_FULL | FILE_SFTP | true | ACTIVE |
| SBI-CPPC-01 | BANK_CPPC | PDA_APPLIES_RELIEF | REST_API | true | ACTIVE |

**da_relief_rates / commutation_factors / pension_limit_rules (rule tables)**

| table | sample row |
|---|---|
| da_relief_rates | effective_from 2026-07-01, da_percent 0.5300, status EFFECTIVE |
| commutation_factors | age_next_birthday 61, factor 8.3710, effective_from 2009-01-01, status EFFECTIVE |
| pension_limit_rules | min_pension 9000.00, max_pension 125000.00, min_qualifying_years_for_pension 10, ups_min_guarantee 10000.00 |

**provisional_pension_records**

| provisional_id | case_id | proceedings_type | provisional_pension_amount | dcrg_withheld | status |
|---|---|---|---|---|---|
| pp-001 | PEN-2026-000131 | DEPARTMENTAL | 50000.00 | true | ACTIVE |

**audit_objections**

| objection_no | source | case_id | outcome | status |
|---|---|---|---|---|
| AO-2026-0007 | AG_AUDIT | PEN-2026-000123 | null | UNDER_RESPONSE |
| AO-2026-0008 | INTERNAL_AUDIT | PEN-2025-000900 | ACCEPTED_CORRECTED | CLOSED |

**bank_account_verifications**

| verification_id | pensioner_id | method | result | status |
|---|---|---|---|---|
| bv-001 | PNR-000123 | PENNY_DROP | MATCH | PASSED |
| bv-002 | PNR-000777 | NPCI_MAPPER | NAME_MISMATCH | BLOCKED |

**prior_service_records**

| prior_service_id | employee_id | prior_service_type | counted_days | pension_already_drawn | status |
|---|---|---|---|---|---|
| ps-001 | e-1001 | MILITARY | 2920 | false | COUNTED |
| ps-002 | e-3310 | PRIOR_STATE | 1460 | false | VERIFIED |


---

## 6. Functional Requirements

> FRs marked **(enhanced)** carry v1 content forward with the adopted-improvement changes woven in (new ACs/BRs flagged). FRs FR-18–FR-24 are **(new)**. Every FR retains ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and full LLD table.

### FR-M11-01 — Retirement Forecasting & Due-for-Retirement Lists

- **Module:** M11-F01
- **Primary Role(s):** Pension Officer, HR Admin
- **User Story:** As a Pension Officer, I want an automatically refreshed list of employees due to retire by horizon so that processing can start 1–2 years ahead and no first pension is delayed.
- **Description:** Compute each active employee's projected superannuation date from `dob` + applicable retirement age (now resolved from the `retirement_age_rules` rule table E34), classify into horizon buckets, surface those due within 24/12/6 months, flag whether a case is already initiated, and drive proactive alerts and workload planning. Refreshed nightly and on-demand.
- **Acceptance Criteria:**
  - AC1: Projected retirement date = last day of the month in which the employee attains the configured superannuation age (per E34 cadre rule), recomputed on DOB/cadre change.
  - AC2: Lists filter by org unit, cadre, horizon bucket, and "case not yet initiated".
  - AC3: Employees crossing the 18-month threshold without a case trigger an alert to the responsible Pension Officer.
  - AC4: The forecast excludes employees already separated (RETIRED/DECEASED/RESIGNED/TERMINATED).
- **Business Rules:** BR1: Retirement age resolved from E34 (effective-dated, by cadre/category). BR2: Forecast is read-only projection; never auto-creates a case. BR3: Mid-month attainment retires on month-end per policy.
- **Data Model References:** `retirement_forecasts`, `retirement_age_rules` (read), `employees` (read), `org_units` (read), `separation_cases` (case_initiated flag).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/forecasts` | due-for-retirement list (filters: horizon, org_unit, cadre) |
| POST | `/api/v1/pension/forecasts:refresh` | recompute projections |
| GET | `/api/v1/pension/forecasts/{employeeId}` | one employee's projection |

- **UI Behavior Notes:** Due-for-retirement worklist with horizon tabs, per-row "initiate case" action, alert badges, export. Self-service shows the employee their own projected date.
- **Edge Cases:** DOB correction; cadre change altering retirement age (E34 lookup); extension-of-service order; deceased mid-horizon; leap-year/month-end arithmetic.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ForecastProjector`, `HorizonClassifier`, nightly scheduler, `AlertEmitter` |
| Backend Flow | For each active employee → resolve retirement age (E34) → compute superannuation date → bucket → upsert forecast → emit threshold alerts |
| Data Operations | Bulk upsert; index on `(horizon_bucket, org_unit_id)`, `projected_retirement_date` |
| Validation | DOB present; E34 rule resolved; exclude separated statuses |
| Authorization | Pension Officer/HR (org scope); employee reads own |
| State Changes & Side Effects | forecasts refreshed; threshold notifications |
| Failure Handling | Missing DOB → exception list; E34 unresolved → flagged UNRESOLVED |
| Dependencies | M01, E34 |
| Test Guidance | Month-end arithmetic; cadre ages from E34; DOB-change recompute; alert threshold; separated-exclusion |

---

### FR-M11-02 — Separation Case Management (All Separation Types) **(enhanced)**

- **Module:** M11-F02
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want to create and drive a separation case for any separation type and pension regime so that the correct rules, workflow, and benefit set apply from the start.
- **Description:** Create a `separation_cases` record selecting the type, derive the pension scheme (**OPS/NPS/UPS**), capture type-specific inputs (VRS notice, M09 compulsory-retirement order ref, medical-board ref, death report ref, **pending-proceedings flag**), bind a **PDA (carrying its disbursement model)**, and progress through the state machine with maker-checker gates. Type drives which downstream FRs are mandatory (death-in-service → family pension + death gratuity; resignation → typically GPF/leave only; **pending proceedings → provisional pension path FR-22**).
- **Acceptance Criteria:**
  - AC1: Each type enforces required inputs (COMPULSORY_RETIREMENT → valid M09 order; INVALIDATION → medical-board certificate; DEATH_IN_SERVICE → date of death + family-member data from E26).
  - AC2: Scheme (OPS/NPS/UPS) auto-derived from DOJ vs cutover and UPS opt-in; override requires reason + audit.
  - AC2a: **(new)** If `proceedings_pending = true`, the case is routed to the provisional-pension path (FR-22) and DCRG is flagged for full withholding.
  - AC3: Only an authority distinct from the maker can sanction (SoD).
  - AC4: Resignation/dismissal paths suppress pension where rules disallow it but still allow GPF/leave settlement.
  - AC5: At most one active case per employee (IR1).
- **Business Rules:** BR1: Compulsory retirement initiated only from an M09 penalty order. BR2: Death-in-service auto-spawns family-pension (`enhanced_basis=IN_SERVICE`) and death-gratuity sub-flows. BR3: VRS requires minimum qualifying service and may add weightage. BR4: A case cannot skip the service-verification gate (FR-18) or no-dues except via explicit anticipatory/provisional exception. BR5: **(new)** UPS opt-in is recorded once and is irreversible per rule; scheme override audited.
- **Data Model References:** `separation_cases`, `pension_disbursing_authorities` (read), `family_members` (read on death), `employees` (read), `service_register_events` (append on closure), `workflow_instances`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases` | create case |
| GET | `/api/v1/pension/cases/{id}` | case detail & status |
| PATCH | `/api/v1/pension/cases/{id}` | update type-specific inputs / PDA / scheme override |
| POST | `/api/v1/pension/cases/{id}:advance` | transition state |
| POST | `/api/v1/pension/cases/{id}:sanction` | sanction (checker) |

- **UI Behavior Notes:** Case workspace with stage tracker (service-verification → no-dues → calculation → sanction → PPO → settlement), type-specific panels, scheme badge (OPS/NPS/UPS), PDA selector, document upload, audit timeline. Death-in-service uses a compassionate fast-track layout.
- **Edge Cases:** Death during pre-retirement (convert SUPERANNUATION→DEATH_IN_SERVICE); VRS withdrawal before acceptance; compulsory retirement under appeal; scheme misclassification; NPS→UPS opt-in boundary; re-employed pensioner separating again; proceedings pending at retirement.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CaseService`, `SeparationTypePolicy`, `SchemeResolver` (OPS/NPS/UPS), `PDABinder`, workflow adapter |
| Backend Flow | Validate type inputs → derive scheme + UPS opt-in → bind PDA → create case → open workflow → guards on advance (incl. FR-18 gate, proceedings routing) → on sanction lock calc snapshot |
| Data Operations | Insert case; transitions; append SR event on closure; document links |
| Validation | Type-required fields; single-active-case; SoD; scheme/UPS override reason; proceedings routing |
| Authorization | Pension Officer create/update; Authority sanction; org scope |
| State Changes & Side Effects | case.status machine (§10.1); audit_log; notifications; SR append |
| Failure Handling | Missing ref → 422 `CASE_INPUT_INCOMPLETE`; duplicate active → 409 `DUPLICATE_ACTIVE_CASE` |
| Dependencies | M09, M01, M12, E26, E37, FR-18, FR-03..09, FR-22 |
| Test Guidance | Type input matrix; SoD; single-active; scheme derivation incl. UPS; death conversion; proceedings routing |

---

### FR-M11-03 — Pre-Retirement Processing (SR Verification, No-Dues, Anticipatory Pension) **(enhanced)**

- **Module:** M11-F03
- **Primary Role(s):** Pension Officer, SR Custodian (M12), HR Admin, Sanctioning Authority
- **User Story:** As a Pension Officer, I want to run SR verification, drive no-dues clearance, and authorise anticipatory pension 1–2 years ahead so that benefits are ready before the retirement date and pension never breaks.
- **Description:** Orchestrate the lead pipeline: trigger the **service-verification completeness gate (FR-18)** and request gap-free verification from M12 (SR Custodian certifies), coordinate no-dues clearance, and — when final pension cannot be sanctioned in time — authorise **anticipatory pension** within rule limits so the pensioner is paid from day one, later adjusted against the final sanction. (Pending-proceedings cases use provisional pension FR-22 instead of/alongside anticipatory.)
- **Acceptance Criteria:**
  - AC1: Case cannot advance to CALCULATION until the `service_verifications` record is SIGNED_OFF/LOCKED (FR-18) **and** `qualifying_service_records.sr_verified=true`.
  - AC2: No-dues is a checklist with per-item owner/status; case cannot reach PENDING_SANCTION until CLEARED (or anticipatory/provisional exception).
  - AC3: Anticipatory pension issues a provisional PPO (ANTICIPATORY) within the configured cap and is later superseded by the final PPO with adjustment.
  - AC4: Outstanding dues recorded and netted into terminal settlement, never silently ignored.
- **Business Rules:** BR1: Anticipatory pension ≤ configured % of estimated pension; anticipatory gratuity withheld until no-dues. BR2: SR verification gaps must be condoned by order (E29) before counting as qualifying. BR3: No-dues blocking items hold gratuity but not the basic anticipatory pension.
- **Data Model References:** `separation_cases`, `service_verifications` (gate), `qualifying_service_records`, `service_register_events` (read/verify), `ppo_records` (ANTICIPATORY), `terminal_settlements` (recoveries).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/sr-verification:request` | request M12 verification |
| POST | `/api/v1/pension/cases/{id}/sr-verification:certify` | SR Custodian certify |
| GET/PATCH | `/api/v1/pension/cases/{id}/no-dues` | no-dues checklist |
| POST | `/api/v1/pension/cases/{id}/anticipatory-pension` | authorise anticipatory pension |

- **UI Behavior Notes:** Pre-retirement cockpit: service-verification gate status, SR gap list, no-dues checklist grid, anticipatory-pension panel with cap enforcement and projected first-pension date.
- **Edge Cases:** Verification reveals a gap requiring condonation; unresponsive no-dues owner near deadline; anticipatory paid then final lower (recover excess); deputation/foreign-service spells; case also has pending proceedings (provisional path).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SRVerificationClient`, `NoDuesCoordinator`, `AnticipatoryPensionService` |
| Backend Flow | Trigger FR-18 gate → request M12 verification → certify → lock QSR → no-dues checklist → if time-critical compute anticipatory within cap → issue ANTICIPATORY PPO |
| Data Operations | Update case flags; create ANTICIPATORY ppo; record dues as recovery candidates |
| Validation | FR-18 sign-off gate; sr_verified gate; no-dues gate; anticipatory cap; condonation present |
| Authorization | SR Custodian certify; Officer coordinate; Authority authorise anticipatory |
| State Changes & Side Effects | case SR_VERIFICATION→NO_DUES→CALCULATION; ANTICIPATORY PPO ACTIVE; notifications |
| Failure Handling | M12 down → 503; gap uncondoned → `SERVICE_GAP_UNRESOLVED`; verification not signed off → 409 `SERVICE_VERIFICATION_INCOMPLETE` |
| Dependencies | M12, M10, FR-18, FR-02, FR-04, FR-11, FR-22 |
| Test Guidance | Gate enforcement (FR-18 + sr_verified); anticipatory cap; later adjustment/recovery; condonation path |

---

### FR-M11-04 — Qualifying Service Computation **(enhanced)**

- **Module:** M11-F04
- **Primary Role(s):** Pension Officer, SR Custodian
- **User Story:** As a Pension Officer, I want qualifying service computed from verified service with non-qualifying spells deducted and counted prior service added so that pension and gratuity use the legally correct service length.
- **Description:** Compute gross service joining→retirement/death, enumerate non-qualifying spells, deduct uncondoned spells, **add structured counted prior/military service from `prior_service_records` (E39)**, apply VRS weightage where applicable, and round to reckonable half-years per E36. Determines `meets_min_pension_service` (E35 threshold) which routes to FULL_PENSION vs SERVICE_GRATUITY. Produces an auditable, locked `qualifying_service_records`. Runs only after the FR-18 verification record is signed off.
- **Acceptance Criteria:**
  - AC1: `net_qualifying = gross − Σ(uncondoned non-qualifying days) + Σ(counted prior-service days)`; condoned spells (E29) count as qualifying.
  - AC2: Reckonable half-years rounded per E36 (e.g. ≥3 months = a half-year); capped per E36.
  - AC3: Each non-qualifying spell traces to a source (M03/M04 event, M09 order, or manual with justification) and is reason-code-attested in FR-18.
  - AC4: VRS weightage added only when rules permit and within cap (capped at date-of-superannuation service).
  - AC4a: **(new)** Counted prior service from E39 is added only when `verified=true` and `pension_already_drawn=false`; military/prior-central/state/temporary types handled per pro-forma rules.
  - AC5: `meets_min_pension_service` set from E35; if false, FR-05 produces SERVICE_GRATUITY_ONLY (no FULL_PENSION). Record locks on verification; later changes require a new version.
- **Business Rules:** BR1: EOL on medical certificate may be qualifying; otherwise non-qualifying (attested in FR-18). BR2: Dies-non never qualifies. BR3: Min qualifying service enforced via E35 (else service gratuity per FR-07). BR4: **(new)** Prior service counted distinctly from VRS weightage; both feed net qualifying but are tracked separately (`prior_service_days` vs `weightage_years`).
- **Data Model References:** `qualifying_service_records`, `non_qualifying_spells`, `prior_service_records` (E39), `condonation_orders` (E29), `pension_limit_rules`/`rounding_rules` (read), `service_register_events` (read), M03/M04/M09 (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/qualifying-service:compute` | compute QSR |
| GET | `/api/v1/pension/cases/{id}/qualifying-service` | QSR + spells + prior service |
| POST | `/api/v1/pension/cases/{id}/qualifying-service/spells` | add/condone a spell |
| POST | `/api/v1/pension/cases/{id}/prior-service` | add/verify counted prior service |
| POST | `/api/v1/pension/cases/{id}/qualifying-service:lock` | lock after verification |

- **UI Behavior Notes:** Service-ledger timeline (joining→retirement) with shaded non-qualifying spells and a separate counted-prior-service band, editable spell table, prior-service panel, and a live qualifying-service total with half-year rounding and a min-service/service-gratuity indicator.
- **Edge Cases:** Overlapping spells; spell spanning a pay-commission boundary; prior military service with prior pension drawn (exclusion); condonation arriving after lock (new version); fraction-of-day rounding; net just below the 10-year threshold (service-gratuity branch).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `QualifyingServiceEngine`, `SpellAggregator`, `PriorServiceCounter`, `HalfYearRounder` (E36) |
| Backend Flow | Require FR-18 sign-off → gather verified span → pull spells → dedupe/merge overlaps → deduct uncondoned → add E39 prior service → add weightage → round (E36) → set `meets_min_pension_service` (E35) → persist+trace → lock |
| Data Operations | Insert QSR + spells; link prior-service rows; version on change; lock flag |
| Validation | Inclusive day math; overlap merge; condonation refs; weightage/prior-service caps; FR-18 gate |
| Authorization | Officer compute; SR Custodian verify; lock post-verify |
| State Changes & Side Effects | QSR DRAFT→VERIFIED→LOCKED; feeds FR-05/07 |
| Failure Handling | Source unavailable → 503; overlap conflict → manual resolution; verification not signed off → 409 `SERVICE_VERIFICATION_INCOMPLETE` |
| Dependencies | FR-18, M03/M04/M09/M12, E29/E39/E35/E36, feeds FR-05/FR-07 |
| Test Guidance | Spell deduction; overlap merge; prior-service addition; half-year rounding/cap; min-service routing; versioning |

---

### FR-M11-05 — Pension Calculation (OPS / NPS / UPS, Service Gratuity, NPS Defaults) **(enhanced — R2, R3)**

- **Module:** M11-F05
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want pension computed under the correct regime — including service gratuity for short service, UPS assured payout, and NPS death/invalidation defaults — so that every cohort is statutorily correct.
- **Description:** Branch by `benefit_outcome`:
  - **OPS, ≥10 yrs qualifying:** basic pension = **flat 50%** of emoluments base (last-drawn / 10-month average / beneficial-of-both), floored/capped to E35 minimum/maximum. *Proportionate reduction for short service is removed.*
  - **OPS/UPS/NPS, <10 yrs qualifying:** **no pension** — route to **SERVICE_GRATUITY** (FR-07); set `benefit_outcome=SERVICE_GRATUITY_ONLY`.
  - **UPS (opted-in):** **assured payout ≈ 50% of last-12-month average pay** (AVG_12_MONTH), with the E35 UPS minimum guarantee; `benefit_outcome=UPS_ASSURED`.
  - **NPS death-in-service / invalidation:** compute the **CCS-NPS Rules 2021 default benefit** = OPS-equivalent family/invalid pension; `benefit_outcome=NPS_DEFAULT_FAMILY`/`NPS_DEFAULT_INVALID`.
  - **NPS superannuation (no default):** record corpus/PRAN, produce **indicative** (non-binding, non-deterministic) annuity/lump-sum; `benefit_outcome=NPS_INDICATIVE`.
  A full `calc_trace` and the `rule_version_ref` (FK) are persisted.
- **Acceptance Criteria:**
  - AC1: **(rewritten)** OPS basic pension = **flat 50%** of emoluments base for **≥10 years** qualifying service (no proportionate reduction).
  - AC1a: **(new)** For **<10 years** qualifying, no monthly pension is produced; the case is routed to SERVICE_GRATUITY (FR-07) and `benefit_outcome=SERVICE_GRATUITY_ONLY`.
  - AC2: Emoluments method selectable (last-drawn / 10-month average / beneficial-of-both / **12-month average for UPS**) and snapshotted from M10.
  - AC3: Statutory minimum and maximum (E35) enforced with flags.
  - AC4: **(rewritten)** NPS superannuation is marked non-OPS; defined-benefit pension is not fabricated; indicative figures labelled non-binding and excluded from determinism.
  - AC4a: **(new)** NPS death-in-service/invalidation computes the CCS-NPS Rules 2021 OPS-equivalent default benefit.
  - AC4b: **(new)** UPS opted-in cases compute the assured payout (~50% of 12-month average) with the UPS minimum guarantee.
  - AC5: Re-computation with identical inputs and the snapshotted rule version is identical; rule version recorded as FK.
- **Business Rules:** BR1: Scheme from `separation_cases.pension_scheme` + `ups_opted_in`. BR2: Emoluments exclude non-reckonable allowances per rule. BR3: Age-based additional pension increments (80/85/90/95/100) scheduled as future revisions (FR-13). BR4: **(new)** SERVICE_GRATUITY branch is mutually exclusive with FULL_PENSION (IR3a).
- **Data Model References:** `pension_calculations`, `qualifying_service_records` (read), `pension_limit_rules`/`da_relief_rates` (read), M10 emoluments (read), `gratuity_calculations` (SERVICE_GRATUITY handoff).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/pension:compute` | compute pension / route service gratuity / UPS / NPS-default |
| GET | `/api/v1/pension/cases/{id}/pension` | pension calc + trace + benefit_outcome |

- **UI Behavior Notes:** Pension worksheet showing benefit-outcome branch, emoluments method comparison, flat-50% indicator, min/max flags, trace panel; a distinct **UPS** card (12-month average, assured payout, guarantee), an **NPS-default** card, and a **service-gratuity** redirect callout when service <10 yrs; NPS-superannuation shows the corpus/annuity estimator (labelled indicative).
- **Edge Cases:** Net just below/above 10 years (service-gratuity vs flat-50% boundary); pay anomaly in last 10/12 months; revision retro-affecting emoluments; OPS/NPS/UPS borderline DOJ/opt-in; re-employed pensioner; NPS death-in-service default vs indicative.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionEngine`, `BenefitOutcomeRouter`, `EmolumentsResolver` (M10), `MinMaxGuardRail` (E35), `UPSCalculator`, `NPSDefaultCalculator`, `NPSIndicativeAdapter` |
| Backend Flow | Resolve scheme/outcome → if <10 yrs route SERVICE_GRATUITY → else compute by branch (OPS flat-50% / UPS assured / NPS-default / NPS-indicative) → floor/cap → persist trace + rule-version FK |
| Data Operations | Insert `pension_calculations`; supersede prior on recompute; SERVICE_GRATUITY handoff to FR-07 |
| Validation | Branch correctness; flat-50% (no proportionate); min/max; emoluments present; determinism vs indicative exclusion |
| Authorization | Officer compute; Authority sanction (via case) |
| State Changes & Side Effects | calc DRAFT→COMPUTED→SANCTIONED; SUPERSEDED on revision |
| Failure Handling | Emoluments missing → 422 `EMOLUMENTS_UNAVAILABLE`; rule row missing → 422 `RULE_NOT_EFFECTIVE`; UPS opt-in absent for UPS branch → 409 `SCHEME_MISMATCH` |
| Dependencies | M10, FR-04, E35, feeds FR-06, FR-07, FR-11 |
| Test Guidance | Flat-50% ≥10 yrs; service-gratuity routing <10 yrs; UPS assured + guarantee; NPS death-default; NPS indicative exclusion from determinism; rule-version capture |

---

### FR-M11-06 — Commutation of Pension **(enhanced — R11)**

- **Module:** M11-F06
- **Primary Role(s):** Retiring Employee (opt), Pension Officer, Sanctioning Authority
- **User Story:** As a retiring employee, I want to commute a portion of my pension into a lump sum so that I receive upfront capital, with my residual pension and restoration date correctly computed from the reduction date.
- **Description:** Capture the commutation option (fraction ≤ statutory max), resolve the commutation factor by age-next-birthday from `commutation_factors` (E31, FK captured), compute commuted value = commuted monthly pension × factor × 12, reduce the monthly pension to residual **from the reduction-effective date**, and schedule restoration = **reduction date + statutory period (15 yrs)**. Disambiguates commutation/payment/reduction dates and handles migrated pensioners with unknown dates.
- **Acceptance Criteria:**
  - AC1: Commuted fraction bounded by statutory maximum (e.g. 40%); over-limit rejected.
  - AC2: Commutation factor resolves from the effective E31 table by age-next-birthday (factor row FK captured).
  - AC3: Commuted value, residual pension, and the **reduction-effective date** are computed and shown with trace.
  - AC3a: **(new)** `restoration_due_date = reduction_effective_date + 15 yrs`; for migrated pensioners with `migrated_date_unknown=true`, restoration is flagged for manual review, not auto-scheduled.
  - AC4: Residual pension feeds the PPO; restoration is scheduled and later applied (FR-12) restoring full basic.
  - AC5: Opting out leaves full basic pension and no commuted value.
- **Business Rules:** BR1: Commutation requires medical fitness unless within the no-medical window post-retirement. BR2: **(rewritten)** Pension is reduced from the **date of receipt of commuted value** (`reduction_effective_date`); restoration is 15 yrs from that date, not from retirement. BR3: Commuted portion still attracts DA on the full (un-commuted) basic per rule.
- **Data Model References:** `commutation_records`, `commutation_factors` (E31, read), `pension_calculations` (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/commutation` | submit/compute commutation |
| GET | `/api/v1/pension/cases/{id}/commutation` | commutation detail |

- **UI Behavior Notes:** Commutation calculator with a capped fraction slider, live commuted-value and residual preview, factor display by age (E31 row), and an explicit **reduction-date → restoration-date** callout; self-service preview before formal option; migrated-unknown-date warning banner.
- **Edge Cases:** Age boundary changing the factor; commutation after the no-medical window (medical board); death before restoration (restoration N/A to family pension); fraction at the cap; migrated pensioner with unknown commutation/reduction date.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CommutationEngine`, `FactorTableResolver` (E31), `RestorationScheduler` |
| Backend Flow | Validate fraction ≤ max → resolve factor (E31 FK) → commuted value = commuted×factor×12 → residual = basic−commuted → set reduction date → restoration = reduction+15y (or flag migrated-unknown) |
| Data Operations | Insert `commutation_records`; link pension calc + factor row; restoration scheduled |
| Validation | Fraction cap; factor found; residual ≥ 0; medical-window; date disambiguation |
| Authorization | Employee opts; Officer computes; Authority sanctions |
| State Changes & Side Effects | commutation DRAFT→COMPUTED→SANCTIONED; restoration job scheduled on reduction date |
| Failure Handling | Over-limit → 422 `COMMUTATION_EXCEEDS_LIMIT`; factor missing → 422 `FACTOR_NOT_FOUND` |
| Dependencies | FR-05, E31, feeds FR-09, FR-11, FR-12 (restoration) |
| Test Guidance | Cap; factor lookup; value/residual; reduction-date-based restoration; migrated-unknown handling; opt-out |

---

### FR-M11-07 — Gratuity Computation (Retirement, Death & Service) **(enhanced — R2, Improvement 21)**

- **Module:** M11-F07
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want retirement, death and service gratuity computed with the correct slabs and an auto-stepping statutory ceiling so that the lump-sum benefit is accurate and within limits.
- **Description:** Compute **retirement gratuity** = ¼ × emoluments (basic+DA) × qualifying half-years (capped), **death gratuity** by service-length slabs, and **service gratuity** (for <10-year qualifying service: a one-time lump sum, e.g. ½ month's emoluments per completed half-year, **no DCRG ceiling**). The statutory ceiling is resolved from `gratuity_ceilings` (E33) and **auto-steps up 25% whenever DA crosses each 50% threshold**. Death/retirement gratuity apportioned to nominees (E21) for death cases.
- **Acceptance Criteria:**
  - AC1: Retirement gratuity uses capped qualifying half-years and the E33 ceiling; `payable=min(computed,ceiling)`.
  - AC2: Death gratuity applies the correct slab multiplier by service length.
  - AC2a: **(new)** Service gratuity (service <10 yrs) computes the one-time lump sum with **no DCRG ceiling** and `gratuity_type=SERVICE_GRATUITY`.
  - AC3: Death gratuity apportioned per nominee shares totalling 100% (E21).
  - AC4: Gratuity may be withheld pending no-dues **or fully withheld pending Rule-9 proceedings** (FR-22).
  - AC5: Ceiling-applied/withheld flags set; the E33 ceiling row used is captured (`ceiling_ref`).
- **Business Rules:** BR1: Emoluments = basic + DA at retirement/death date. BR2: Half-years capped per E36. BR3: Statutory ceiling effective-dated (E33). BR3a: **(new)** Ceiling auto-steps +25% per 50% DA threshold crossed, driven by E33 (`da_threshold_pct`, `auto_step_pct`) — no manual master-data edit. BR4: No minimum-service bar for death gratuity (payable from day one).
- **Data Model References:** `gratuity_calculations`, `qualifying_service_records` (read), `nominees_beneficiaries` (E21, read), `gratuity_ceilings` (E33, read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gratuity:compute` | compute gratuity (retirement/death/service) |
| GET | `/api/v1/pension/cases/{id}/gratuity` | gratuity detail |

- **UI Behavior Notes:** Gratuity worksheet with gratuity-type selector, emoluments, half-years, slab (death) / service-gratuity multiplier, ceiling comparison (with the auto-step shown), nominee apportionment grid, and withhold toggle (no-dues / proceedings) with reason; trace panel.
- **Edge Cases:** Service at a slab boundary; service <10 yrs (service-gratuity branch, no ceiling); computed below vs above ceiling; DA crossing a 50% threshold mid-period (ceiling auto-step); no valid nominee (escheat/legal-heir); retirement gratuity fully withheld for pending proceedings.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GratuityEngine`, `SlabResolver`, `ServiceGratuityCalc`, `CeilingGuard` (E33 auto-step), `NomineeApportioner` |
| Backend Flow | Resolve emoluments+half-years → select formula (retirement / death slab / service) → resolve ceiling with auto-step (E33) → apply ceiling (except service gratuity) → apportion → withhold if no-dues/proceedings |
| Data Operations | Insert `gratuity_calculations`; capture ceiling_ref; nominee split JSONB; link to settlement |
| Validation | Half-year cap; ceiling + auto-step; nominee shares=100%; slab/branch selection |
| Authorization | Officer compute; Authority sanction |
| State Changes & Side Effects | gratuity DRAFT→COMPUTED→SANCTIONED→PAID; WITHHELD_PROCEEDINGS state; audit_log |
| Failure Handling | Ceiling row missing → 422 `RULE_NOT_EFFECTIVE`; bad nominee split → 422 `NOMINEE_SPLIT_INVALID` |
| Dependencies | FR-04, FR-05 (service-gratuity handoff), M09/FR-22 (withhold), E33, feeds FR-09 |
| Test Guidance | Slab boundaries; service-gratuity (no ceiling); ceiling auto-step on DA milestone; apportionment; withhold/release; death day-one |

---

### FR-M11-08 — Family & Enhanced Family Pension **(enhanced — R1, R4, R14)**

- **Module:** M11-F08
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want family pension computed at the correct path-specific rate to the statutorily-eligible family member(s) so that bereaved families are paid accurately, including dual and twin cases.
- **Description:** Compute family pension at the normal rate (e.g. 30% of emoluments, E32) and, where eligible, the enhanced rate (e.g. 50%) for a **path-specific window driven by `enhanced_basis`**: **death-in-service → enhanced for 10 years with no age cap**; **death-after-retirement → enhanced for 7 years or up to age 67 / the date the deceased would have superannuated, whichever earlier**. Eligibility and hierarchy derive from the **statutory family-members register `family_members` (E26)** by `statutory_rank` — never from nominees. Supports **dual family pension** (both spouses government servants, subject to the E32 cap) and **simultaneous twin/multiple eligible children** shares (`concurrent_share_pct`). Maintains eligibility review dates and transfer to the next eligible member on cessation.
- **Acceptance Criteria:**
  - AC1: Normal and enhanced amounts compute from emoluments × E32 rates.
  - AC2: **(rewritten)** Enhanced window is computed from `enhanced_basis`: IN_SERVICE = +10 yrs, no age cap; AFTER_RETIREMENT = min(+7 yrs, age-67, would-be-superannuation date). Then steps down to normal automatically (scheduled).
  - AC2a: **(new)** The applied window rule is recorded in `enhanced_window_rule` for audit; both step-downs are tested.
  - AC3: **(rewritten)** The active recipient and hierarchy come from `family_members` (E26) by `statutory_rank`; on cessation, pension transfers to the next eligible member (not stops) unless none remain.
  - AC4: Disabled-dependent members receive lifelong family pension per rule.
  - AC5: Both death-in-service and conversion-on-pensioner-death paths produce a family-pension record and a FAMILY_PENSION PPO.
  - AC6: **(new)** Dual family pension is permitted (both spouses govt servants) subject to the E32 dual cap; twins/multiple eligible children draw simultaneously per `concurrent_share_pct` summing to 100%.
- **Business Rules:** BR1: Enhanced rate = min(enhanced formula, would-be pension) per rule. BR1a: **(new)** Window selection is mandatory and path-driven (IR8a). BR2: **(replaced)** The absolute "only one beneficiary at a time" is removed; dual family pension and simultaneous twin/eligible-children shares are allowed per rule (IR14). BR3: Remarriage/employment may cease eligibility except for disabled children/widow per rule. BR4: **(new)** Family-pension recipient is the rule-defined family member (E26); nomination (E21) does not confer family-pension eligibility.
- **Data Model References:** `family_pension_records`, `family_members` (E26), `family_pension_rates` (E32), `pension_calculations` (read), `pensioners` (source on conversion).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/family-pension:compute` | compute family pension (path-specific) |
| GET | `/api/v1/pension/family-pension/{id}` | family pension detail |
| POST | `/api/v1/pension/family-pension/{id}:transfer` | transfer to next eligible family member |

- **UI Behavior Notes:** Family-pension panel with normal/enhanced amounts, the **path-specific** enhanced-window timeline (labelled IN_SERVICE 10y / AFTER_RETIREMENT 7y-age67), an ordered **family-members** list (E26) with eligibility-review dates and ranks, dual-FP indicator, twin/multiple-children concurrent-share grid, and a transfer action with reason capture.
- **Edge Cases:** Multiple eligible children sequencing/twins (concurrent shares); disabled child lifelong; remarriage of widow (rule-dependent); after-retirement window shorter due to age-67; both spouses govt servants (dual FP cap); simultaneous death of employee and spouse; nominee present but not a family member (must not receive family pension).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FamilyPensionEngine`, `EnhancedWindowResolver` (path-specific), `FamilyMemberHierarchyResolver` (E26), `DualFPCapGuard`, `TransferService` |
| Backend Flow | Compute normal+enhanced (E32) → set window by `enhanced_basis` → select first eligible family member (E26 rank) → apply dual-FP cap / concurrent shares → schedule step-down & reviews → on cessation transfer to next |
| Data Operations | Insert `family_pension_records`; hierarchy snapshot from E26; transfer updates current member |
| Validation | Rate bounds (E32); window-by-basis; family-member eligibility; dual cap; concurrent shares=100% |
| Authorization | Officer compute; Authority sanction; Officer transfer with review |
| State Changes & Side Effects | fp DRAFT→COMPUTED→SANCTIONED→ACTIVE→TRANSFERRED/CEASED; FAMILY_PENSION PPO; notifications |
| Failure Handling | No eligible family member → legal-heir flag; wrong window basis → 422; nominee-as-recipient attempt → 409 `FAMILY_PENSION_NOT_NOMINEE_DRIVEN` |
| Dependencies | FR-05, E26, E32, FR-12 (conversion), feeds FR-11 |
| Test Guidance | IN_SERVICE 10y vs AFTER_RETIREMENT 7y/age-67 step-downs; E26-driven hierarchy/transfer; dual FP cap; twins concurrent shares; disabled-lifelong; conversion path |


---

### FR-M11-09 — Terminal Benefits & Final Settlement (with Tax/TDS) **(enhanced — R12)**

- **Module:** M11-F09
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (M10)
- **User Story:** As a Pension Officer, I want a composite final settlement that brings together leave encashment, gratuity, commuted value, GPF, recoveries, and statutory tax/TDS so that the employee's one-time dues are paid net of legitimate recoveries and correct tax.
- **Description:** Assemble the terminal settlement: leave encashment from M03 (× per-day emoluments, capped), gratuity (FR-07), commuted value (FR-06), GPF (FR-10), other dues, net legitimate recoveries within statutory protection, **and compute tax/TDS**: gratuity exemption (₹20L cap), commuted-pension exemption, leave-encashment exemption, taxable totals, TDS lines, and **Section 89(1) relief** on arrears. Produces gross, taxable, TDS, and net-of-tax settlement for authorisation and disbursement.
- **Acceptance Criteria:**
  - AC1: Leave encashment = min(encashable EL days, statutory cap) × per-day (basic+DA); shown as a line.
  - AC2: Settlement gross = Σ components; net = gross − recoveries − TDS; each recovery traces to an order.
  - AC2a: **(new)** Tax step computes per-component exempt/taxable splits (gratuity ₹20L cap, commutation exemption, leave-encashment exemption), TDS, and Section 89(1) relief on arrears, captured in `tax_breakdown`.
  - AC3: Recoveries cannot exceed statutory limits; excess deferred/flagged, never silently dropped.
  - AC4: Withheld components (gratuity pending no-dues, or fully withheld for Rule-9 proceedings) excluded from immediate payout and tracked.
  - AC5: Final settlement requires SANCTIONED benefit sub-calculations.
- **Business Rules:** BR1: Leave encashment capped per rule (e.g. 300 days). BR2: Recovery priority and net protection per §16.3. BR3: Pending disciplinary case / Rule-9 proceedings withholds gratuity (M09/FR-22 linkage). BR4: **(new)** Tax exemptions/TDS computed from effective tax-rule parameters; exempt amounts and TDS surfaced; net-of-tax payout shown.
- **Data Model References:** `terminal_settlements` (incl. tax fields), M03 leave balance (read), `gratuity_calculations`, `commutation_records`, `gpf_final_settlements`, M09 recoveries (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/settlement:compute` | assemble settlement (incl. tax) |
| GET | `/api/v1/pension/cases/{id}/settlement` | settlement detail (gross/taxable/TDS/net) |
| POST | `/api/v1/pension/cases/{id}/settlement:sanction` | sanction settlement |

- **UI Behavior Notes:** Settlement summary with component breakdown, a **tax panel** (exempt vs taxable per component, TDS, 89(1) relief), recoveries list with order links, withheld items, and gross/taxable/TDS/net totals; export of the settlement + tax sheet.
- **Edge Cases:** Negative net (recoveries > dues) → recover from pension/flag; gratuity exceeding ₹20L (taxable excess); arrears spanning years (89(1) relief); leave balance disputed; loan foreclosure interplay; insurance pending; death case routing dues to nominees with tax treatment.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SettlementAssembler`, `LeaveEncashmentCalc` (M03), `RecoveryNetter`, `TaxEngine` (exemptions/TDS/89(1)) |
| Backend Flow | Pull components → compute encashment → sum gross → compute tax exemptions/TDS/89(1) → net recoveries within protection → set withheld → produce net-of-tax |
| Data Operations | Insert `terminal_settlements` incl. tax fields + tax_breakdown; link sub-calc refs |
| Validation | Encashment cap; recovery limits; sub-calc SANCTIONED; tax-rule effective; net ≥ protected floor or flagged |
| Authorization | Officer compute; Authority sanction; Payroll confirm recoveries |
| State Changes & Side Effects | settlement DRAFT→COMPUTED→SANCTIONED→PAID/PARTIALLY_WITHHELD |
| Failure Handling | M03 down → 503; recovery over-limit → `RECOVERY_EXCEEDS_PROTECTION`; tax rule missing → 422 `TAX_RULE_NOT_EFFECTIVE` |
| Dependencies | M03, M09, M10, FR-06, FR-07, FR-10, FR-22, feeds FR-14 |
| Test Guidance | Encashment cap; netting/priority; tax exemptions (gratuity/commutation/leave); TDS; 89(1) relief; withhold; negative-net; death routing |

---

### FR-M11-10 — GPF Final Withdrawal

- **Module:** M11-F10
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (M10)
- **User Story:** As a Pension Officer, I want the GPF final balance with interest and advances adjusted so that the provident-fund corpus is settled correctly at retirement or death.
- **Description:** Retrieve the GPF closing balance and contribution ledger from M10, compute interest to settlement date (effective GPF rate), deduct outstanding advances, derive final payable, apportion to nominees (E21) for death cases, and route for authorisation. NPS/UPS cases use NPS exit, not GPF.
- **Acceptance Criteria:**
  - AC1: Final payable = closing balance + interest-to-date − outstanding advances.
  - AC2: Interest computed at the effective GPF rate for the period.
  - AC3: Death cases apportion to nominees totalling 100% (E21).
  - AC4: GPF withdrawal requires authorisation distinct from the maker.
  - AC5: GPF only for GPF/OPS subscribers; NPS/UPS subscribers routed to NPS exit.
- **Business Rules:** BR1: GPF closing balance is the M10 system of record. BR2: Interest rate effective-dated. BR3: Unrecovered advances are mandatory deductions.
- **Data Model References:** `gpf_final_settlements`, M10 GPF ledger (read), `nominees_beneficiaries` (E21, read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gpf:compute` | compute GPF final |
| POST | `/api/v1/pension/cases/{id}/gpf:authorise` | authorise GPF payment |

- **UI Behavior Notes:** GPF panel with closing balance, interest accrual, advances, final payable, nominee split (death), authorise action; masked account number with audited reveal.
- **Edge Cases:** Advance partially recovered in last salary; interest boundary at FY close; zero balance for NPS subscriber; nominee dispute.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GPFSettlementEngine`, `InterestCalculator`, M10 GPF client |
| Backend Flow | Fetch closing balance → interest to date → deduct advances → final payable → apportion (death) → authorise |
| Data Operations | Insert `gpf_final_settlements`; link to terminal settlement |
| Validation | Balance source present; interest rate effective; advances reconciled; nominee 100% |
| Authorization | Officer compute; Authority authorise (SoD) |
| State Changes & Side Effects | gpf DRAFT→COMPUTED→AUTHORISED→PAID; feeds FR-09 |
| Failure Handling | M10 ledger unavailable → 503; NPS/UPS subscriber → 409 `SCHEME_MISMATCH` |
| Dependencies | M10, FR-09, FR-14 |
| Test Guidance | Interest math; advance deduction; nominee split; NPS/UPS routing; SoD |

---

### FR-M11-11 — PPO Generation & Digital PPO **(enhanced — R10, Improvement 20)**

- **Module:** M11-F11
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise)
- **User Story:** As a Sanctioning Authority, I want to issue a registry-numbered Pension Payment Order — service, family, anticipatory, provisional, or revised — so that the pensioner's entitlement is formally authorised and transmitted to the disbursing authority and delivered digitally.
- **Description:** Generate the PPO from sanctioned figures, allocate a unique `ppo_no`, render a digital PPO (e-PPO, M13), bind a PDA (carrying its disbursement model), **for PDA_APPLIES_RELIEF PDAs carry the basic + relief-formula reference**, and produce pensioner/disbursing halves. Supports SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, **PROVISIONAL** (Rule 9, FR-22), and REVISED PPOs; a REVISED/final PPO supersedes the prior active PPO. On authorisation, the e-PPO is **pushed to DigiLocker** and the PPO is linked to Aadhaar/PRAN (FR-24).
- **Acceptance Criteria:**
  - AC1: PPO issues only when the case is SANCTIONED (or anticipatory/provisional authorised for those types).
  - AC2: `ppo_no` unique and registry-allocated; a REVISED PPO references and supersedes exactly one ACTIVE PPO.
  - AC3: e-PPO generated as a signed artefact, available to self-service **and delivered to DigiLocker** (FR-24).
  - AC4: PPO carries basic pension, commuted portion, residual, effective-from, PDA binding, **and (for PDA_APPLIES_RELIEF) the relief-formula reference**.
  - AC5: Authorising the PPO creates/links the pensioner master record (FR-12).
  - AC6: **(new)** A PROVISIONAL PPO links to `provisional_pension_records` and is superseded by the final PPO on proceedings conclusion.
- **Business Rules:** BR1: Anticipatory/provisional PPOs are superseded by the final PPO with adjustment. BR2: Authoriser ≠ preparer (SoD). BR3: PPO effective-from = pension commencement date. BR4: **(new)** For PDA_APPLIES_RELIEF, the PPO carries basic + relief formula; for M11_COMPUTES_FULL, the disbursement carries the full computed amount (FR-13/FR-14).
- **Data Model References:** `ppo_records`, `pension_calculations`, `commutation_records`, `family_pension_records`, `provisional_pension_records`, `pension_disbursing_authorities`, `pensioners`, `documents`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/ppo:generate` | generate draft PPO |
| POST | `/api/v1/pension/ppos/{id}:authorise` | authorise & issue PPO (+DigiLocker push) |
| GET | `/api/v1/pension/ppos/{id}` | PPO detail + e-PPO link |
| POST | `/api/v1/pension/ppos/{id}:revise` | issue REVISED PPO |

- **UI Behavior Notes:** PPO composer showing sanctioned figures, PPO-type selector (incl. PROVISIONAL), PDA selector (with disbursement-model badge), registry number allocation, e-PPO preview, DigiLocker-delivery indicator, authorise action; supersession banner; self-service e-PPO download.
- **Edge Cases:** Registry number collision/retry; anticipatory/provisional→final supersession with arrear adjustment; revision before authorisation; PDA change after issue; family-pension PPO on death-in-service; DigiLocker push failure (retry queue).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PPOComposer`, `PPONumberRegistry`, `EPPORenderer` (M13), `PensionerLinker`, `DigiLockerPublisher` (FR-24) |
| Backend Flow | Assemble figures → allocate ppo_no (transactional) → render e-PPO → bind PDA + relief formula if applicable → authorise → create/link pensioner → push DigiLocker → mark prior SUPERSEDED on revise |
| Data Operations | Insert `ppo_records`; document link; pensioner upsert; supersede prior; set digilocker_ref |
| Validation | Case SANCTIONED; unique ppo_no; single ACTIVE PPO; SoD; provisional linkage |
| Authorization | Officer prepare; Authority authorise |
| State Changes & Side Effects | ppo DRAFT→ISSUED→AUTHORISED_TO_PDA→ACTIVE; prior→SUPERSEDED; SR append; notifications; DigiLocker push |
| Failure Handling | Number collision → idempotent retry; not sanctioned → 409 `CASE_NOT_SANCTIONED`; DigiLocker down → queue + retry (non-blocking) |
| Dependencies | FR-05..09, FR-22, E37, M13, FR-24, feeds FR-12, FR-14 |
| Test Guidance | Uniqueness; SoD; supersession lineage (incl. provisional→final); e-PPO + DigiLocker; relief-formula carriage; pensioner linkage |

---

### FR-M11-12 — Pensioner Master & Lifecycle Management **(enhanced — R9 link, R11)**

- **Module:** M11-F12
- **Primary Role(s):** Pension Officer, Pensioner/Family Pensioner (self-service), Sanctioning Authority
- **User Story:** As a Pension Officer, I want a pensioner master that tracks life certificates, restoration, family-pension conversion, and proactive death/fraud signals so that the pensioner is correctly maintained for life and beyond.
- **Description:** Maintain the `pensioners` record from PPO authorisation: capture annual LC/DLC, suspend disbursement on overdue LC, restore the commuted portion automatically at the **reduction-date+15yr** due date, and on a self-pensioner's death convert to family pension (E26-driven, FR-08, `enhanced_basis=AFTER_RETIREMENT`) creating the family-pension record and FAMILY_PENSION PPO. Consumes **proactive death-detection signals (FR-20)** and links any **overpayment recovery (E38)**.
- **Acceptance Criteria:**
  - AC1: LC has a yearly due date; overdue beyond grace sets `SUSPENDED_NO_LC` and holds disbursement.
  - AC2: Submitting/verifying an LC reactivates the pensioner and releases held pension with arrear.
  - AC3: At the restoration due date (reduction+15yr), the commuted portion is restored; `current_monthly_pension` reflects full basic.
  - AC4: On `date_of_death` for a self-pensioner, the system spawns family-pension conversion (E26/FR-08) and a FAMILY_PENSION PPO, moving the pensioner to CONVERTED_TO_FAMILY.
  - AC5: Pensioner contact/bank self-updates route through maker-checker **and pass pre-credit account verification (FR-14)** before disbursement uses them.
  - AC6: **(new)** A death detected via FR-20 (registry/DBT/anomaly) triggers conversion and, if pension was drawn after death, opens a `pension_overpayment_recoveries` (E38) row.
- **Business Rules:** BR1: LC grace period configurable. BR2: Restoration applies only to the original pensioner. BR3: Family-pension conversion uses the E26 family hierarchy. BR4: **(new)** Late-reported death reconciles drawn-after-death pension into E38 recovery.
- **Data Model References:** `pensioners`, `pensioner_life_certificates`, `commutation_records` (restoration), `family_pension_records`, `family_members` (E26), `ppo_records`, `pension_overpayment_recoveries` (E38).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/pensioners/{id}` | pensioner detail & lifecycle |
| POST | `/api/v1/pension/pensioners/{id}/life-certificate` | submit LC / DLC |
| POST | `/api/v1/pension/pensioners/{id}:report-death` | record death → conversion |
| PATCH | `/api/v1/pension/pensioners/{id}` | update bank/contact (maker-checker + verification) |

- **UI Behavior Notes:** Pensioner 360 view: pension summary, LC status with due/overdue badges and a **plain-language LC calendar** (FR-15/§11), restoration countdown (reduction+15yr), conversion history, death-signal panel (FR-20), overpayment-recovery panel (E38), bank/contact with masked reveal; self-service LC submission with fallback and grievance entry.
- **Edge Cases:** Restoration coinciding with a DA revision (ordering §16.9); death reported late (E38 recovery from estate); LC submitted just after suspension; family pensioner's own death (next E26 member); fraudulent LC detection; death detected by FR-20 before family reports it.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionerService`, `LifeCertificateProcessor` (DLC), `RestorationJob`, `DeathConversionOrchestrator`, `OverpaymentLinker` (E38) |
| Backend Flow | On PPO auth create pensioner → schedule LC due & restoration (reduction+15y) → LC submit/verify toggles active/suspended → restoration restores basic → death (reported or FR-20) triggers conversion + FAMILY PPO + (if drawn-after-death) E38 recovery |
| Data Operations | Upsert pensioner; insert LC; update lifecycle_status; create family pension + PPO; open E38 row |
| Validation | LC due/grace; restoration date; death date ≥ commencement; bank-change maker-checker + FR-14 verification |
| Authorization | Pensioner self-LC; Officer verify; Authority sanction conversion |
| State Changes & Side Effects | lifecycle ACTIVE↔SUSPENDED_NO_LC→DECEASED→CONVERTED_TO_FAMILY/CEASED; disbursement hold/release; notifications |
| Failure Handling | DLC down → physical/video-KYC fallback; conversion missing family member → legal-heir flag; bank verification fail → block |
| Dependencies | FR-06, FR-08, FR-11, FR-14, FR-20, E26, E38 |
| Test Guidance | LC suspend/release+arrear; restoration timing; death conversion + PPO; FR-20-driven detection + E38 recovery; bank-change control; family-pensioner death chain |

---

### FR-M11-13 — Pension Revision (DA & Pay-Commission) **(enhanced — R6, R13)**

- **Module:** M11-F13
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), SysAdmin (rule tables)
- **User Story:** As a Pension Officer, I want to apply DA and pay-commission revisions across the pensioner population under a deterministic application order and the correct disbursement model so that every pensioner's pension stays current with arrears computed correctly.
- **Description:** Run revision batches branching on the **PDA disbursement model**:
  - **M11_COMPUTES_FULL PDAs:** recompute the full monthly figure (DA/pay-commission re-fixation), compute old vs new + arrears, and **instruct exact amounts** (FR-14).
  - **PDA_APPLIES_RELIEF (CPPC) PDAs:** **do not recompute every line**; instead **issue a relief order** (new DA% / pay-commission basis) for the bank to apply, and **reconcile** rather than instruct each amount.
  When multiple events share an effective date for one pensioner, apply them strictly in the **§16.9 deterministic order** (pay-commission re-fixation → commuted-portion restoration → DA → age-based additional pension). Also schedules age-based additional pension increments (80/85/90/95/100).
- **Acceptance Criteria:**
  - AC1: A DA-revision batch recomputes Dearness Relief for M11_COMPUTES_FULL pensioners as of the effective date; for PDA_APPLIES_RELIEF pensioners it issues a relief order and marks lines for reconciliation.
  - AC2: A pay-commission batch re-fixes basic pension and computes arrears from the effective date.
  - AC3: Old vs new and arrear amounts computed per pensioner with trace; batch requires approval before APPLY.
  - AC4: Applied revisions are immutable; corrections create a new batch.
  - AC5: Age-based additional pension increments auto-apply on the milestone birthday.
  - AC6: **(new)** When ≥2 events share an effective date for a pensioner, they apply in the mandatory §16.9 order; the applied order is recorded in `calc_trace` (tested invariant).
- **Business Rules:** BR1: DA/pay-commission parameters are effective-dated rule-table rows (E30, SysAdmin-approved). BR2: Family pensioners revised by the same batch with family-pension rules. BR3: Arrears netting respects prior over-payment (E38). BR4: **(new)** Revision branch and amount/relief-order behaviour are determined by `pensioners.disbursement_model`.
- **Data Model References:** `pension_revisions`, `pensioners`, `da_relief_rates` (E30), `pension_disbursing_authorities` (model), `pension_disbursements` (arrears), `pension_overpayment_recoveries` (netting).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/revisions` | create revision batch (type, effective, scope) |
| POST | `/api/v1/pension/revisions/{id}:compute` | compute deltas / relief orders per model |
| POST | `/api/v1/pension/revisions/{id}:approve` | approve batch |
| POST | `/api/v1/pension/revisions/{id}:apply` | apply (instruct or issue relief order) |

- **UI Behavior Notes:** Revision console with batch parameters, model-segmented preview (computed-amount cohort vs relief-order cohort), delta preview (old→new, arrear), affected counts, **event-ordering panel** showing §16.9 application order for affected pensioners, exception list, approve/apply gates, rollback-before-apply; per-pensioner drill-down.
- **Edge Cases:** Pensioner whose restoration/age-increment coincides with the revision (ordering §16.9); partial-month effective date; deceased between compute and apply (E38); pay-commission notional fixation anomaly; DA negative revision; mixed-model batch.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RevisionEngine`, `DisbursementModelRouter`, `EventOrderResolver` (§16.9), `ArrearCalculator`, `BatchApprover`, age-increment scheduler |
| Backend Flow | Build cohort → segment by model → for M11_COMPUTES_FULL recompute + arrears; for PDA_APPLIES_RELIEF build relief order → resolve concurrent-event order (§16.9) → approve → atomic apply (update pensioners / queue arrears / emit relief order) |
| Data Operations | Insert revision lines (staging) → on apply update `current_monthly_pension` (full model) or record relief order (relief model); insert arrears |
| Validation | Effective date; eligibility; immutability post-apply; deterministic ordering; model branch |
| Authorization | Officer compute; Authority approve; SoD; SysAdmin only on tables |
| State Changes & Side Effects | revision DRAFT→COMPUTED→APPROVED→APPLIED; arrears queued / relief order emitted; notifications |
| Failure Handling | Per-pensioner error → quarantine line; apply fault → no partial commit |
| Dependencies | E30, E37, M14, FR-12, FR-14, E38 |
| Test Guidance | DA recompute (full) vs relief-order (CPPC); pay-commission re-fix; arrear math; immutability; §16.9 ordering invariant; age-increment; deceased-mid-batch |

---

### FR-M11-14 — Treasury / Bank / PDA Integration (with Pre-Credit Verification) **(enhanced — R6, R8, R15)**

- **Module:** M11-F14
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise), Treasury/PDA/Bank
- **User Story:** As a Pension Officer, I want to transmit authorised payment instructions to the disbursing authority over a defined interface, verify accounts before first credit, and reconcile acknowledgements so that pensioners are paid correctly and the most expensive error — paying a wrong account — is prevented.
- **Description:** Produce disbursement instruction batches per the **PDA interface contract (§8.6)** for first pension, monthly pension (per disbursement model), arrears, gratuity, commuted value, GPF, and terminal benefits; **run pre-credit account verification (penny-drop / name-IFSC / NPCI mapper, E42) before the first credit** to any account and block on mismatch; transfer PPO authorisation; track transmission and acknowledgement using the contract's ack schema and error taxonomy; reconcile paid/failed lines and raise exceptions/grievances; retry/re-route failures.
- **Acceptance Criteria:**
  - AC1: Only AUTHORISED instructions (SoD) are transmitted.
  - AC1a: **(new)** No FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE line is transmitted to an account unless a `bank_account_verifications` row for that account is PASSED; mismatch blocks the line (IR16).
  - AC2: Each line ties to a PPO/pensioner/case and an amount; batch totals reconcile to the sum of lines.
  - AC3: Acknowledgements update `instruction_status` per the §8.6 ack schema; failed lines raise exceptions/grievances using the bank/treasury error taxonomy.
  - AC4: First pension instruction generated to commence on the pension start date (no break).
  - AC5: Idempotent transmission prevents duplicate payments.
- **Business Rules:** BR1: Invalid/missing bank or PDA binding blocks the line. BR1a: **(new)** Account verification (E42) must be PASSED before first credit; re-verification required on bank-detail change. BR2: Failed lines retried or re-routed, never silently abandoned. BR3: Monthly pension respects LC suspension and the disbursement model (full amount vs basic+relief for CPPC).
- **Data Model References:** `pension_disbursements`, `bank_account_verifications` (E42), `pension_disbursing_authorities` (E37, contract+model), `ppo_records`, `pensioners`, `terminal_settlements`, `pension_revisions` (arrears).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/disbursements` | create instruction batch |
| POST | `/api/v1/pension/accounts:verify` | run penny-drop / name-IFSC verification |
| POST | `/api/v1/pension/disbursements/{id}:authorise` | authorise batch |
| POST | `/api/v1/pension/disbursements/{id}:transmit` | transmit to PDA/bank (per §8.6) |
| POST | `/api/v1/pension/disbursements/{id}/ack` | record acknowledgement |

- **UI Behavior Notes:** Disbursement console with batch validation (invalid/unverified accounts, held LC lines, model badge), **account-verification status column (penny-drop result)**, authorise/transmit gates, acknowledgement reconciliation grid (paid/failed with error-taxonomy reasons), exception drill-down to grievance creation.
- **Edge Cases:** Partial bank acknowledgement; account closed; name mismatch on penny-drop (block); duplicate transmission retry; PDA format rejection (contract error taxonomy); pensioner suspended for LC mid-batch; clawback/overpayment (E38); CPPC relief-order vs computed-amount batches.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DisbursementBatcher`, `AccountVerifier` (E42 penny-drop/NPCI), `PDAGatewayAdapter` (§8.6), `AckReconciler`, `ExceptionRouter` |
| Backend Flow | Build lines → verify accounts (E42) → validate accounts/PDA/LC/model → authorise → transmit (idempotent, per contract) → ingest ack → reconcile → raise exceptions/E38 |
| Data Operations | Insert batch+lines; insert E42 verifications; update instruction_status; link grievance on failure |
| Validation | Authorised gate; account verification PASSED (IR16); totals tie-out; idempotency; model branch |
| Authorization | Officer prepare; Authority authorise; Treasury ack |
| State Changes & Side Effects | instruction DRAFT→AUTHORISED→TRANSMITTED→ACKNOWLEDGED/PARTIALLY_ACK/FAILED→RECONCILED; notifications |
| Failure Handling | Gateway down → 503 + retry queue; invalid account → 422 `INVALID_BANK_ACCOUNTS`; verification fail → 422 `ACCOUNT_VERIFICATION_FAILED`; duplicate → idempotent no-op |
| Dependencies | E37, E42, FR-09, FR-11, FR-12, FR-13, feeds FR-16 |
| Test Guidance | Tie-out; SoD; penny-drop block-on-mismatch; idempotency; partial ack; LC-hold exclusion; model branch; failure→grievance |

---

### FR-M11-15 — Retirement Self-Service Portal & Benefit Estimators / What-If **(enhanced — R16)**

- **Module:** M11-F15
- **Primary Role(s):** Employee / Retiring Employee, Pensioner (self-service)
- **User Story:** As a retiring employee, I want to see my retirement journey in plain language, estimate my benefits as outcomes I understand, and submit my forms online so that I can plan and act without visiting an office.
- **Description:** A self-service portal with a **3-state plain-language tracker** (In progress / Approved / Being paid) over the internal state machine, an **outcome-framed benefit estimator / what-if** that phrases results as decisions ("If you take ₹22.4 lakh now, your monthly pension is ₹33,600 instead of ₹56,000, and it returns to ₹56,000 in Oct 2041"), option submission (commutation, nominee, family-member, bank) via maker-checker, document upload, an **LC annual calendar**, and a **step-by-step bereavement/death-reporting guide** for families. Pensioners reuse the portal for e-PPO (incl. DigiLocker), LC, and grievances.
- **Acceptance Criteria:**
  - AC1: Estimators label results indicative/non-binding (`is_binding=false`) and never write to the live case.
  - AC2: What-if can vary commutation fraction, emoluments, and date, recomputing all headline figures, **expressed as plain-language outcomes** (take-now vs monthly-now vs restore-date).
  - AC3: Submitted options flow into the case via maker-checker, not directly into sanctioned data.
  - AC4: **(rewritten)** The employee sees a **3-state citizen tracker** (In progress / Approved / Being paid) — the internal state machine is not mirrored to the citizen; legal terms (PPO, commutation) are retained only where statutory, with plain-language explanations.
  - AC5: All self-service screens cover empty/loading/error/success/permission states (no skeleton placeholders).
  - AC6: **(new)** An **LC annual calendar** shows when the life certificate is due, the four submission options, and what happens if missed (plain language).
  - AC7: **(new)** A **bereavement guide** walks a family member through reporting a death and claiming family pension (who to tell, day-one steps, documents), mapped to FR-12/FR-08.
- **Business Rules:** BR1: Estimators use current rule tables but flag that final figures depend on verified service and emoluments. BR2: Self-service writes require identity/MFA and route to Pension Officer review.
- **Data Model References:** `benefit_estimates`, `separation_cases` (status read; option submissions), `nominees_beneficiaries`, `family_members` (E26 declarations), `retirement_forecasts` (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/estimates` | run an outcome-framed estimate / what-if |
| GET | `/api/v1/pension/me/case` | my 3-state tracker |
| POST | `/api/v1/pension/me/options` | submit commutation/nominee/family/bank options |
| GET | `/api/v1/pension/me/lc-calendar` | LC due dates & submission options |

- **UI Behavior Notes:** Estimator with sliders/inputs and an **outcome card** ("take now / monthly now / restores in MMM-YYYY") plus a scenario comparison; 3-state journey tracker with plain-language stage descriptions; option wizard with validation; LC calendar; bereavement guide; pensioner tab for e-PPO/DigiLocker/LC/grievance. Mobile-first, WCAG 2.1 AA.
- **Edge Cases:** Estimator before any case; assumptions diverging from verified service; multiple saved scenarios; option after sanction (blocked); accessibility/keyboard-only; low-literacy/elderly user (plain language, large text).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `EstimatorEngine` (reuses FR-05/06/07 dry-run), `OutcomeFramer`, `CitizenTracker` (3-state mapper), `OptionIntake`, `LCCalendar`, `BereavementGuide` |
| Backend Flow | Run engines non-persisting → frame outcomes in plain language → save scenario; map internal state → 3 citizen states; options → workflow task to Officer |
| Data Operations | Insert `benefit_estimates` (is_binding=false); option submissions create workflow tasks |
| Validation | Identity/MFA; assumption bounds; no write to sanctioned data; option-after-sanction block |
| Authorization | Employee (own); Pensioner (own) |
| State Changes & Side Effects | estimate saved; option workflow task; notifications |
| Failure Handling | Engine error → friendly message; submission after sanction → 409 `CASE_LOCKED_FOR_OPTIONS` |
| Dependencies | FR-01, FR-05, FR-06, FR-07, FR-09, FR-12 |
| Test Guidance | Non-binding isolation; outcome-framed what-if; 3-state mapping; option maker-checker; LC calendar; bereavement guide; state coverage; a11y |

---

### FR-M11-16 — Pensioner Grievance Management

- **Module:** M11-F16
- **Primary Role(s):** Pensioner / Family Pensioner, Pension Officer, Sanctioning Authority
- **User Story:** As a pensioner, I want to raise and track grievances so that issues like non-receipt, wrong amount, or unapplied revision are resolved within an SLA.
- **Description:** Grievance intake (categorised), routing, SLA tracking with escalation, linkage to case/PPO/disbursement, and resolution with audit. Auto-creates grievances from disbursement failures (FR-14) and surfaces ageing and SLA-breach analytics.
- **Acceptance Criteria:**
  - AC1: A grievance captures category, description, priority, and links to pensioner/case where known.
  - AC2: SLA due date set by category/priority; breach escalates to the Sanctioning Authority.
  - AC3: Disbursement failures auto-create a grievance linked to the failed line.
  - AC4: Resolution requires a recorded action and notifies the pensioner; reopen supported.
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

- **UI Behavior Notes:** Grievance inbox with SLA timers, priority badges, linked-record context, resolution form, pensioner-facing tracker; ageing/breach dashboard.
- **Edge Cases:** Grievance on a closed case; duplicates; escalation when officer unavailable; reopened after closure; multilingual descriptions.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GrievanceService`, `SLATimer`, `EscalationEngine`, `AutoGrievanceFromDisbursement` |
| Backend Flow | Intake → set SLA → assign → track timer → escalate on breach → resolve → notify → allow reopen |
| Data Operations | Insert/update `pension_grievances`; link to case/PPO/disbursement |
| Validation | Required fields; SLA matrix; resolution text on close |
| Authorization | Pensioner raise (own); Officer resolve; Authority on escalation |
| State Changes & Side Effects | OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED/ESCALATED/REOPENED; notifications |
| Failure Handling | Unavailable officer → re-route; missing link → unlinked with flag |
| Dependencies | FR-12, FR-14 |
| Test Guidance | SLA/escalation; auto-creation; resolve/reopen; linkage; state machine |

---

### FR-M11-17 — Forecasting & Pension-Liability Analytics

- **Module:** M11-F17
- **Primary Role(s):** Pension Officer, Department Head, Auditor
- **User Story:** As a Department Head, I want pension-liability and processing analytics so that I can plan budgets, staffing, and SLA compliance.
- **Description:** Analytics over the retirement pipeline and pensioner population: due-for-retirement workload by horizon/org/cadre; projected pension-liability (current/future, DA/pay-commission scenarios); benefit-cost breakdown (pension/gratuity/commutation/family pension); processing SLA & ageing (stage durations, first-pension-on-time); grievance trends; **and audit-objection ageing (FR-23)**. Read-only aggregations from M11 entities; feeds M14.
- **Acceptance Criteria:**
  - AC1: Liability projection aggregates `pensioners.current_monthly_pension` × 12 plus pipeline cases, with scenario sliders for DA/pay-commission.
  - AC2: Workload analytics show counts by horizon bucket, org unit, cadre.
  - AC3: SLA analytics compute first-pension-on-time rate and average stage durations.
  - AC4: All analytics respect org-unit row-level scope; export honours permissions.
  - AC5: Figures reconcile to underlying records (no fabricated aggregates).
- **Business Rules:** BR1: Analytics read-only. BR2: Scenario projections labelled assumptions. BR3: Auditor sees all; managers see own scope.
- **Data Model References:** `retirement_forecasts`, `pensioners`, `separation_cases`, `pension_calculations`, `gratuity_calculations`, `family_pension_records`, `pension_grievances`, `audit_objections` (all read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/analytics/liability` | liability projection (scenario params) |
| GET | `/api/v1/pension/analytics/workload` | due-for-retirement workload |
| GET | `/api/v1/pension/analytics/sla` | processing SLA & ageing |

- **UI Behavior Notes:** Analytics dashboard with liability projection (scenario sliders), workload by horizon/org/cadre, SLA gauges, benefit-cost composition, grievance trend, audit-objection ageing; export with scope enforcement.
- **Edge Cases:** Sparse data for small units; scenario extremes; mid-year pay-commission; scope-restricted export; very large pensioner population performance.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AnalyticsAggregator`, `LiabilityProjector`, `SLAComputer` |
| Backend Flow | Query aggregates with scope filter → apply scenario params → return series; cache hot aggregates |
| Data Operations | Read-only aggregates; materialised views for heavy aggregates |
| Validation | Scope enforcement; reconciliation to source; scenario bounds |
| Authorization | Manager (own scope), Officer, Auditor (all) |
| State Changes & Side Effects | none (read-only); feeds M14 |
| Failure Handling | Timeout on huge cohort → paginated/streamed; scope breach → 403 |
| Dependencies | FR-01, FR-05..13, FR-23, M14 |
| Test Guidance | Reconciliation; scope; scenario projection; SLA math; large-cohort performance |


---

### FR-M11-18 — Service-Record Completeness & Discrepancy Resolution **(new — R5)**

- **Module:** M11-F18
- **Primary Role(s):** Pension Officer (maker), SR Custodian (M12), Payroll Officer (M10), Sanctioning Authority
- **User Story:** As a Pension Officer, I want a rigorous service-record completeness gate that resolves every discrepancy and attests every non-qualifying spell before any benefit is computed, so that determinism defends correct numbers rather than amplifying upstream defects.
- **Description:** Before CALCULATION, build a `service_verifications` (E27) record over the full service span: detect gaps and discrepancies into a **discrepancy ledger (E28)**; require **per-non-qualifying-spell reason-code attestation** (e.g., EOL medical vs non-medical, suspension regularised vs not); record condonations as **orders in a condonation register (E29)**, not free text; and require **multi-point sign-off** (SR Custodian + Payroll Officer + Pension Officer). CALCULATION is gated on this record being SIGNED_OFF/LOCKED with zero open discrepancies and all spells attested (IR2a).
- **Acceptance Criteria:**
  - AC1: A `service_verifications` record enumerates every gap/discrepancy as an E28 ledger line with type, period, source, and required resolution.
  - AC2: Each non-qualifying spell must be reason-code-attested (qualifying vs non-qualifying) before sign-off; unattested spells block sign-off.
  - AC3: Condonations are recorded as E29 orders (order no, date, authority, document) and linked to the resolving discrepancy.
  - AC4: Sign-off requires SR Custodian, Payroll Officer, and Pension Officer attestations; `signoff_complete=true` sets status SIGNED_OFF then LOCKED.
  - AC5: A case cannot enter CALCULATION (FR-04/FR-05) unless the record is SIGNED_OFF/LOCKED, `discrepancy_open_count=0`, and `spells_attested_count=spells_total_count` (IR2a).
- **Business Rules:** BR1: Free-text resolution is not accepted for condonation — an E29 order is mandatory. BR2: Reason codes for spells must come from the controlled list (drives qualifying/non-qualifying treatment in FR-04). BR3: Re-opening a locked verification (new evidence) creates a new version and re-gates downstream calcs.
- **Data Model References:** `service_verifications` (E27), `service_discrepancies` (E28), `condonation_orders` (E29), `non_qualifying_spells` (attestation), `service_register_events` (M12, read), M03/M04/M09/M10 (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/service-verification:build` | build/refresh the verification + discrepancy ledger |
| GET | `/api/v1/pension/cases/{id}/service-verification` | verification + ledger + attestations |
| POST | `/api/v1/pension/cases/{id}/service-verification/discrepancies/{did}:resolve` | resolve a ledger line (attest/condone/regularise) |
| POST | `/api/v1/pension/cases/{id}/service-verification:signoff` | multi-point sign-off → SIGNED_OFF/LOCKED |

- **UI Behavior Notes:** Verification workbench: discrepancy ledger grid (type, period, source, status, resolution), spell-attestation panel with reason-code dropdowns, condonation-order register with document upload, a three-signature sign-off bar (SR Custodian / Payroll / Officer), and a prominent "gate status" banner showing whether CALCULATION is unblocked.
- **Edge Cases:** Legacy spell with no reason code (must be attested before sign-off); condonation order on paper only (scan + register); overlapping discrepancies; sign-off attempted with open lines (blocked); new evidence after lock (re-version); prior-service discrepancy (links E39).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ServiceVerificationBuilder`, `DiscrepancyDetector`, `SpellAttestationService`, `CondonationRegister`, `MultiSignoffGate` |
| Backend Flow | Build span → detect gaps/discrepancies → write ledger → require attestations + condonation orders → collect three sign-offs → set SIGNED_OFF/LOCKED → unblock FR-04/05 |
| Data Operations | Insert E27/E28/E29; update spell attestations; version on re-open |
| Validation | All discrepancies resolved; all spells attested; condonation orders present; three sign-offs |
| Authorization | Officer build/resolve; SR Custodian + Payroll + Officer sign-off; Authority oversight |
| State Changes & Side Effects | verification DRAFT→DISCREPANCIES_OPEN→ATTESTED→SIGNED_OFF→LOCKED; gates case CALCULATION |
| Failure Handling | Open lines on sign-off → 409 `DISCREPANCY_UNRESOLVED`; unattested spell → 409 `SPELL_NOT_ATTESTED`; missing condonation order → 422 |
| Dependencies | M12, M03/M04/M09/M10, feeds FR-04, FR-05; gate in §10.1 |
| Test Guidance | Ledger completeness; spell attestation gate; condonation-order requirement; three-point sign-off; CALCULATION gate (IR2a); re-version on new evidence |

---

### FR-M11-19 — Effective-Dated Pension Rule-Table Management **(new — R7, Improvement 21)**

- **Module:** M11-F19
- **Primary Role(s):** System Administrator (maintain), Sanctioning Authority / Rule Approver (approve), Auditor (read)
- **User Story:** As a System Administrator, I want first-class, effective-dated, versioned rule tables for every benefit parameter so that the benefit engines compute against real, approved, auditable rows instead of a free-text reference.
- **Description:** Manage the rule-table entities — `da_relief_rates` (E30), `commutation_factors` (E31), `family_pension_rates` (E32), `gratuity_ceilings` (E33, with DA-linked auto-step), `retirement_age_rules` (E34), `pension_limit_rules` (E35), `rounding_rules` (E36) — each effective-dated and versioned with a DRAFT→APPROVED→EFFECTIVE→SUPERSEDED lifecycle and SoD (maintainer ≠ approver). Every benefit calculation's `rule_version_ref` is a foreign key to the exact EFFECTIVE row used on the relevant date (IR17). The gratuity ceiling auto-steps +25% per 50% DA threshold crossed (E33), driven by E30 (Improvement 21).
- **Acceptance Criteria:**
  - AC1: Each rule table supports effective-dated rows with non-overlapping effective windows per key; creating a new effective row supersedes the prior.
  - AC2: A rule row follows DRAFT→APPROVED→EFFECTIVE→SUPERSEDED; only an approver distinct from the maintainer can APPROVE (SoD).
  - AC3: Benefit engines resolve the EFFECTIVE row for the relevant date and capture its id as `rule_version_ref` (FK); SUPERSEDED rows remain referenced by historic calcs (immutability, IR17).
  - AC4: The gratuity ceiling (E33) auto-computes `current_effective_ceiling` by stepping +25% (`auto_step_pct`) each time DA (E30) crosses each 50% threshold (`da_threshold_pct`) — no manual ceiling edit.
  - AC5: Missing/inactive rule rows for a required date raise `RULE_NOT_EFFECTIVE` to the calling engine.
- **Business Rules:** BR1: SysAdmin maintains; a distinct approver approves (SoD); SysAdmin cannot approve their own change. BR2: Government-notification reference is captured per row. BR3: No row may be deleted once referenced by any calc; it is SUPERSEDED.
- **Data Model References:** `da_relief_rates`, `commutation_factors`, `family_pension_rates`, `gratuity_ceilings`, `retirement_age_rules`, `pension_limit_rules`, `rounding_rules` (E30–E36).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/rules/{table}` | list rows (filter by effective date) |
| POST | `/api/v1/pension/rules/{table}` | create DRAFT row |
| POST | `/api/v1/pension/rules/{table}/{rowId}:approve` | approve (SoD) → APPROVED/EFFECTIVE |
| GET | `/api/v1/pension/rules/{table}/resolve?asOf=YYYY-MM-DD` | resolve the EFFECTIVE row for a date |

- **UI Behavior Notes:** Rule-table admin with a table selector, effective-dated row grid (version, window, status), a maker-checker approval flow, a diff view between versions, and a gratuity-ceiling panel showing the DA-driven auto-step computation; read-only for Auditor.
- **Edge Cases:** Overlapping effective windows (rejected); approving as the maintainer (blocked by SoD); a calc referencing a now-SUPERSEDED row (allowed for history); DA crossing two thresholds at once (two auto-steps); retro-effective row affecting pending calcs (re-resolve).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RuleTableService`, `EffectiveDateResolver`, `RuleApprovalWorkflow`, `GratuityCeilingAutoStepper` |
| Backend Flow | Create DRAFT → approve (SoD) → set EFFECTIVE + supersede prior → engines resolve by date → E33 auto-step from E30 |
| Data Operations | Insert/version rule rows; non-overlap constraint per key; FK from calcs |
| Validation | Non-overlapping windows; SoD on approve; no-delete-if-referenced; auto-step math |
| Authorization | SysAdmin maintain; distinct Approver approve; Auditor read |
| State Changes & Side Effects | rule row DRAFT→APPROVED→EFFECTIVE→SUPERSEDED; audit_log |
| Failure Handling | Overlap → 409; self-approve → 403; resolve-miss → 422 `RULE_NOT_EFFECTIVE` |
| Dependencies | Consumed by FR-01, FR-05, FR-06, FR-07, FR-08, FR-13 |
| Test Guidance | Effective-date resolution; SoD approval; immutability of referenced rows; ceiling auto-step on DA milestone; retro-effective re-resolve |

---

### FR-M11-20 — Proactive Death Detection & Overpayment Recovery **(new — R9)**

- **Module:** M11-F20
- **Primary Role(s):** Pension Officer, Sanctioning Authority, Auditor
- **User Story:** As a Pension Officer, I want proactive detection of pensioner deaths and payment anomalies plus a structured recovery-from-estate workflow so that pension is not drawn into a deceased pensioner's account for months and any overpayment is recovered.
- **Description:** Run a **death-registry / Aadhaar-DBT reconciliation job** and **payment-anomaly/dormancy detection** against the pensioner population to flag probable deaths and suspicious patterns earlier than the passive annual LC suspension. On a confirmed death where pension was drawn after the date of death, open a `pension_overpayment_recoveries` (E38) row, halt further disbursement, trigger family-pension conversion (FR-12/FR-08), and drive **recovery from family pension / estate / legal heir** with a "pension drawn after death" exception report.
- **Acceptance Criteria:**
  - AC1: A scheduled job reconciles pensioner records against death-registry/Aadhaar-DBT signals and flags probable deaths with a confidence/source.
  - AC2: Anomaly detection flags dormancy/abnormal patterns (e.g., no LC + unusual withdrawal) for review.
  - AC3: On confirmed death with post-death drawal, an E38 recovery row is created (overpaid amount, period), disbursement is held, and FR-12 conversion is triggered.
  - AC4: Recovery supports modes FROM_FAMILY_PENSION / FROM_ESTATE / FROM_LEGAL_HEIR / WRITE_OFF, each audited; partial recovery tracked.
  - AC5: A "pension drawn after death" exception report lists all open post-death drawals with ageing.
- **Business Rules:** BR1: Detection signals are advisory until confirmed; confirmation requires officer action or an authoritative registry match. BR2: Recovery-from-estate follows the statutory order and protections. BR3: DBT/registry data processed under DPDP purpose-limitation, retained only as needed.
- **Data Model References:** `pension_overpayment_recoveries` (E38), `pensioners` (death fields), `family_pension_records` (conversion), `pension_disbursements` (hold).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/death-detection:run` | run reconciliation/anomaly job |
| GET | `/api/v1/pension/death-detection/flags` | probable-death / anomaly flags |
| POST | `/api/v1/pension/overpayments` | open a recovery row |
| POST | `/api/v1/pension/overpayments/{id}:recover` | record recovery (mode, amount) |
| GET | `/api/v1/pension/reports/drawn-after-death` | exception report |

- **UI Behavior Notes:** Death-detection console with flag queue (source, confidence), confirm/dismiss actions, an overpayment-recovery workspace (overpaid amount, period, mode, legal-heir details, progress), and the drawn-after-death exception report with ageing.
- **Edge Cases:** False-positive registry match (dismiss with reason); death confirmed long after the fact (large overpayment); pensioner already converted (recover from family pension); legal-heir dispute; write-off approval; signal source unavailable (job degrades gracefully).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DeathReconciliationJob`, `AnomalyDetector`, `OverpaymentRecoveryService`, `ExceptionReporter` |
| Backend Flow | Reconcile pensioners vs registry/DBT → flag probable deaths/anomalies → on confirmation open E38 + hold disbursement + trigger FR-12 → drive recovery → report |
| Data Operations | Insert E38 rows; update pensioner death fields; hold disbursement lines |
| Validation | Confirmation before recovery; statutory recovery order; DPDP retention |
| Authorization | Officer confirm/recover; Authority approve write-off; Auditor read |
| State Changes & Side Effects | E38 IDENTIFIED→NOTIFIED→UNDER_RECOVERY→RECOVERED/WRITTEN_OFF/LEGAL; disbursement hold; conversion trigger |
| Failure Handling | Signal source down → job degrades, flags carried over; false positive → dismiss with reason |
| Dependencies | FR-12, FR-08, FR-14; external death-registry/Aadhaar-DBT |
| Test Guidance | Reconciliation match; anomaly flagging; post-death overpayment creation + hold; recovery modes; exception report ageing; false-positive handling |

---

### FR-M11-21 — PDA Registry & Disbursement Model + Interface Contract **(new — R6, R8)**

- **Module:** M11-F21
- **Primary Role(s):** System Administrator (maintain), Pension Officer, Treasury/PDA/Bank (integration), Sanctioning Authority
- **User Story:** As an administrator, I want each Pension Disbursing Authority registered with an explicit disbursement model and a defined interface contract so that FR-13/FR-14 behave correctly per PDA and the longest-lead integration is not a launch-blocker.
- **Description:** Maintain `pension_disbursing_authorities` (E37) with `pda_disbursement_model` (**M11_COMPUTES_FULL** vs **PDA_APPLIES_RELIEF**), interface type (FILE_SFTP/REST_API), the §8.6 file/API field list and acknowledgement schema, the bank/treasury error taxonomy, retry/re-route semantics, penny-drop capability, and a sandbox-certification flag. The model drives FR-13 (recompute-and-instruct vs notify-relief-order-and-reconcile) and FR-14 (full amount vs basic+relief). Opening and certifying each PDA contract is a week-1 parallel workstream (§13).
- **Acceptance Criteria:**
  - AC1: Each PDA records its disbursement model, interface type, contract version, ack schema, and penny-drop capability.
  - AC2: FR-13 and FR-14 branch on `pda_disbursement_model`; a PDA cannot go live (`status=ACTIVE`) until `sandbox_certified=true`.
  - AC3: The interface contract (§8.6) defines the disbursement file/API field list, ack schema, and bank/treasury error taxonomy; transmissions conform to the PDA's contract version.
  - AC4: Retry/re-route semantics are configured per PDA and honoured by FR-14.
  - AC5: Changing a PDA's model or contract is audited and re-certified in sandbox before taking effect.
- **Business Rules:** BR1: SysAdmin maintains; Authority approves go-live after sandbox certification. BR2: A pensioner/PPO bound to a PDA inherits its model (denormalised to `pensioners.disbursement_model`). BR3: No production transmission to an uncertified PDA.
- **Data Model References:** `pension_disbursing_authorities` (E37), `ppo_records`/`pensioners`/`pension_disbursements` (binding), §8.6 contract.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/pdas` | list PDAs + models |
| POST | `/api/v1/pension/pdas` | register/maintain a PDA |
| POST | `/api/v1/pension/pdas/{id}:certify` | mark sandbox-certified |
| POST | `/api/v1/pension/pdas/{id}:activate` | go-live (requires certification) |

- **UI Behavior Notes:** PDA registry with model badges (M11_COMPUTES_FULL / PDA_APPLIES_RELIEF), interface/contract version, penny-drop capability, sandbox-certification status, and activate gate; contract-field reference (§8.6) link.
- **Edge Cases:** PDA changing from treasury to CPPC (model change, re-certify); contract version bump; uncertified PDA bound to a case (block go-live); mixed-model pensioner migration; re-route to an alternate PDA on persistent failure.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PDARegistryService`, `DisbursementModelResolver`, `ContractVersionManager`, `SandboxCertifier` |
| Backend Flow | Register PDA + model + contract → sandbox tie-out → certify → activate → FR-13/14 resolve model at runtime |
| Data Operations | Insert/update E37; denormalise model to pensioners; bind to PPO/disbursement |
| Validation | Certification before activate; contract conformance; model branch coherence |
| Authorization | SysAdmin maintain; Authority activate; Auditor read |
| State Changes & Side Effects | PDA ACTIVE/SUSPENDED/RETIRED; model propagated; audit_log |
| Failure Handling | Activate uncertified → 409; contract mismatch on transmit → fail with taxonomy code |
| Dependencies | FR-13, FR-14, §8.6; external PDA/treasury/bank |
| Test Guidance | Model branch propagation; sandbox-certify gate; contract conformance; re-route; model-change re-certification |

---

### FR-M11-22 — Provisional Pension (Rule 9 — Pending Proceedings) **(new — R10)**

- **Module:** M11-F22
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Disciplinary Authority (M09)
- **User Story:** As a Pension Officer, I want a first-class provisional-pension path for retirees with pending departmental/judicial proceedings so that they are paid a provisional pension while DCRG is fully withheld until the proceedings conclude.
- **Description:** When `separation_cases.proceedings_pending=true`, create a `provisional_pension_records` (E41) with a provisional monthly pension and **fully-withheld DCRG (death-cum-retirement gratuity)**, issue a **PROVISIONAL PPO** (FR-11), and pay the provisional pension to avoid a break. On proceedings conclusion (M09 linkage), regularise to a final pension/PPO (release withheld DCRG) or apply the decided recovery — never silently release DCRG before conclusion.
- **Acceptance Criteria:**
  - AC1: A case with pending proceedings produces a `provisional_pension_records` row and a PROVISIONAL PPO; provisional pension is payable from commencement (no break).
  - AC2: DCRG is **fully withheld** (`dcrg_withheld=true`, amount captured) and excluded from terminal settlement payout until conclusion.
  - AC3: On conclusion, `conclusion_outcome` ∈ {EXONERATED, PENALTY_NO_RECOVERY, PENALTY_WITH_RECOVERY} drives regularisation: EXONERATED/PENALTY_NO_RECOVERY → release DCRG and issue final PPO superseding the provisional; PENALTY_WITH_RECOVERY → apply recovery then release the balance.
  - AC4: The M09 proceedings reference is mandatory and the linkage guard prevents final sanction/DCRG release while proceedings are ACTIVE.
  - AC5: Provisional pension is later adjusted against the final pension with arrears/recovery.
- **Business Rules:** BR1: DCRG release is impossible while `provisional_pension_records.status=ACTIVE`. BR2: Provisional pension amount per rule (typically equals the would-be pension). BR3: Conclusion must reference the M09 decision.
- **Data Model References:** `provisional_pension_records` (E41), `separation_cases` (proceedings flags), `ppo_records` (PROVISIONAL), `gratuity_calculations` (DCRG withheld), `terminal_settlements` (exclusion).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/provisional-pension` | create provisional pension + withhold DCRG |
| GET | `/api/v1/pension/cases/{id}/provisional-pension` | provisional detail |
| POST | `/api/v1/pension/cases/{id}/provisional-pension:conclude` | conclude on M09 decision → regularise/recover |

- **UI Behavior Notes:** Provisional-pension panel showing proceedings reference/status, provisional monthly amount, fully-withheld DCRG, a conclusion action with outcome selector, and the regularisation/recovery preview; PROVISIONAL badge on the PPO composer.
- **Edge Cases:** Proceedings prolonged for years (continuing provisional pension); employee dies during proceedings (family pension + DCRG handling); exoneration with arrears; penalty with partial recovery; proceedings under appeal; conversion of anticipatory→provisional.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ProvisionalPensionService`, `DCRGWithholder`, `ProceedingsLinkageGuard` (M09), `RegularisationOrchestrator` |
| Backend Flow | On proceedings_pending → create E41 + withhold DCRG → issue PROVISIONAL PPO → pay provisional → on conclusion regularise/recover → final PPO supersedes provisional |
| Data Operations | Insert E41; mark gratuity WITHHELD_PROCEEDINGS; exclude from settlement; supersede PPO on conclusion |
| Validation | Proceedings ref present; DCRG fully withheld; no release while ACTIVE (IR15); conclusion outcome required |
| Authorization | Officer create; Authority sanction; Disciplinary Authority supplies decision |
| State Changes & Side Effects | E41 ACTIVE→CONCLUDED_REGULARISED/CONCLUDED_RECOVERY; PROVISIONAL→final PPO; audit_log |
| Failure Handling | DCRG release attempt while ACTIVE → 409 `PROVISIONAL_PROCEEDINGS_PENDING`; missing proceedings ref → 422 |
| Dependencies | M09, FR-07 (DCRG), FR-09, FR-11 |
| Test Guidance | Provisional payment no-break; DCRG full withhold + no-release guard; all three conclusion outcomes; final PPO supersession; arrears/recovery |

---

### FR-M11-23 — Audit Objection Management **(new — Improvement 19)**

- **Module:** M11-F23
- **Primary Role(s):** Auditor / AG, Pension Officer, Sanctioning Authority
- **User Story:** As an Auditor, I want AG/internal-audit objections against pension cases tracked from raise to closure with linkage to the case and calculation trace so that the module's audit-objection-traceability goal is a built capability, not a slogan.
- **Description:** Capture audit objections (`audit_objections`, E40) raised by AG/internal audit/treasury against a case/PPO/pensioner, linked to the disputed `calc_trace`; route to the Pension Officer for response within an SLA; record the outcome (accepted-and-corrected via a linked revision, dropped, recovery raised, settled); and surface ageing/closure analytics (FR-17, §12).
- **Acceptance Criteria:**
  - AC1: An objection captures source, linked case/PPO/pensioner, the disputed `calc_trace` reference, and objection text.
  - AC2: An SLA due date is set; the objection routes to the responsible Pension Officer with escalation on breach.
  - AC3: A response is recorded; the outcome drives closure — ACCEPTED_CORRECTED links a `pension_revisions` correction; DROPPED closes with rationale; RECOVERY_RAISED links an E38 recovery.
  - AC4: Objection status follows RAISED→UNDER_RESPONSE→RESPONDED→ACCEPTED/DROPPED→CLOSED with full audit.
  - AC5: Open objections are visible on the case and in the Audit & Compliance Register (§12).
- **Business Rules:** BR1: Closure requires a recorded outcome and rationale. BR2: A correction is applied only through the amendment/revision workflow (never a silent edit). BR3: Auditor raises; Officer responds; Authority approves corrective revision.
- **Data Model References:** `audit_objections` (E40), `separation_cases`, `ppo_records`, `pensioners`, `pension_revisions` (correction), `pension_overpayment_recoveries` (recovery link).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/audit-objections` | raise an objection |
| GET | `/api/v1/pension/audit-objections/{id}` | objection detail |
| POST | `/api/v1/pension/audit-objections/{id}:respond` | record response |
| POST | `/api/v1/pension/audit-objections/{id}:close` | close with outcome |

- **UI Behavior Notes:** Audit-objection inbox with SLA timers, source/priority, linked case/PPO/trace context, response form, outcome selector (with revision/recovery linkage), and an ageing/closure dashboard; Auditor-facing tracker.
- **Edge Cases:** Objection on a closed case; objection requiring a rule re-interpretation (escalate); objection withdrawn by audit; multiple objections on one case; objection leading to recovery from a deceased pensioner's estate (E38).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AuditObjectionService`, `SLATimer`, `OutcomeResolver` (revision/recovery linkage) |
| Backend Flow | Raise → set SLA → route → respond → resolve outcome (link revision/recovery) → close |
| Data Operations | Insert/update E40; link to case/PPO/trace/revision/recovery |
| Validation | Required fields; outcome + rationale on close; correction via revision workflow |
| Authorization | Auditor raise; Officer respond; Authority approve corrective revision |
| State Changes & Side Effects | RAISED→UNDER_RESPONSE→RESPONDED→ACCEPTED/DROPPED→CLOSED; notifications |
| Failure Handling | Close without outcome → 422; correction outside workflow → 409 |
| Dependencies | FR-05..13 (calc_trace), FR-13 (revision), FR-20 (recovery), FR-17/§12 |
| Test Guidance | Trace linkage; SLA/escalation; outcome-driven closure; revision/recovery linkage; register visibility |

---

### FR-M11-24 — Digital Delivery & DigiLocker / DBT Linkage **(new — Improvement 20)**

- **Module:** M11-F24
- **Primary Role(s):** Pension Officer, Pensioner (self-service), System Administrator
- **User Story:** As a pensioner, I want my signed e-PPO and revision orders delivered to DigiLocker and my PPO linked to my Aadhaar/PRAN so that I have authoritative, portable digital access to my pension documents — matching the DoPPW *Bhavishya* best-in-class bar.
- **Description:** On PPO authorisation (FR-11) and on revision-order issue (FR-13), **push the signed e-PPO/revision order to DigiLocker** as an issued document, record the DigiLocker reference, and **link the PPO to the pensioner's Aadhaar/PRAN** for DBT and death-reconciliation (FR-20). Provide a resilient, retrying delivery channel with a self-service fallback download. The pre-retirement workflow is benchmarked against *Bhavishya* (§13).
- **Acceptance Criteria:**
  - AC1: An authorised e-PPO is pushed to DigiLocker; `ppo_records.digilocker_pushed=true` and `digilocker_ref` recorded.
  - AC2: Revision orders (DA/pay-commission) are similarly delivered to the pensioner's DigiLocker.
  - AC3: The PPO is linked to Aadhaar/PRAN (`pensioners.aadhaar_masked`/`pran`) for DBT and FR-20 reconciliation.
  - AC4: DigiLocker push is non-blocking — failure queues a retry and does not block PPO authorisation; a self-service fallback download is always available.
  - AC5: Delivery status is visible to the pensioner and officer.
- **Business Rules:** BR1: Only signed, authorised artefacts are delivered. BR2: Aadhaar/PRAN stored encrypted, masked, access-logged (DPDP). BR3: Delivery failures retried with backoff; never silently dropped.
- **Data Model References:** `ppo_records` (digilocker fields), `pensioners` (aadhaar/pran), `documents` (M13, signed e-PPO), `pension_revisions` (orders).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/ppos/{id}:deliver-digilocker` | push e-PPO to DigiLocker |
| POST | `/api/v1/pension/revisions/{id}:deliver-digilocker` | push revision order |
| GET | `/api/v1/pension/ppos/{id}/delivery-status` | delivery status |
| POST | `/api/v1/pension/pensioners/{id}:link-aadhaar-pran` | link Aadhaar/PRAN |

- **UI Behavior Notes:** Delivery panel on the PPO composer and pensioner 360 showing DigiLocker delivery status (delivered/queued/failed-retrying), Aadhaar/PRAN linkage status (masked), and a fallback download button; pensioner self-service shows "Available in DigiLocker" with a link.
- **Edge Cases:** DigiLocker outage (queue + retry); pensioner without DigiLocker/Aadhaar (fallback download, manual linkage later); Aadhaar mismatch; revision order delivery for a converted family pensioner; re-delivery after a REVISED PPO supersession.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DigiLockerPublisher`, `AadhaarPRANLinker`, `DeliveryRetryQueue` |
| Backend Flow | On PPO/revision authorisation → render signed artefact (M13) → push to DigiLocker → record ref → link Aadhaar/PRAN → on failure enqueue retry |
| Data Operations | Update ppo digilocker fields; pensioner aadhaar/pran; delivery-status log |
| Validation | Signed artefact only; encryption/masking; retry on failure |
| Authorization | Officer/system deliver; Pensioner read own; SysAdmin config |
| State Changes & Side Effects | digilocker_pushed set; retry queue; notifications |
| Failure Handling | DigiLocker down → queue + backoff (non-blocking); Aadhaar mismatch → flag for manual linkage |
| Dependencies | FR-11, FR-13, FR-20, M13; external DigiLocker/UIDAI/CRA |
| Test Guidance | e-PPO + revision delivery; ref capture; Aadhaar/PRAN linkage; non-blocking failure + retry; fallback download |


---

## 7. UI Requirements

| Screen | Primary role | Key elements | States covered |
|---|---|---|---|
| Due-for-Retirement Worklist | Pension Officer | horizon tabs, filters, initiate-case, alerts, export | empty, loaded, alert, scope-restricted |
| Separation Case Workspace | Pension Officer/Authority | stage tracker, type-specific panels, scheme badge (OPS/NPS/UPS), PDA selector, documents, audit timeline | draft, in-progress, pending-sanction, sanctioned, rejected, on-hold |
| Service-Verification Workbench (new) | Pension Officer/SR Custodian/Payroll | discrepancy ledger, spell-attestation panel, condonation-order register, three-point sign-off bar, gate-status banner | draft, discrepancies-open, attested, signed-off, locked |
| Pre-Retirement Cockpit | Pension Officer/SR Custodian | verification gate, SR gap list, no-dues checklist, anticipatory-pension panel | not-started, in-progress, cleared, blocked |
| Qualifying Service Editor | Pension Officer | service timeline, spell table, prior-service panel, condonation, live half-year total, min-service/service-gratuity indicator | draft, verified, locked |
| Pension Worksheet | Pension Officer/Authority | benefit-outcome branch, emoluments compare, flat-50% flag, UPS card, NPS-default card, service-gratuity redirect, trace | draft, computed, sanctioned, superseded |
| Commutation Calculator | Employee/Officer | capped fraction slider, value/residual preview, factor (E31), reduction-date→restoration-date callout | draft, computed, sanctioned, restored |
| Gratuity Worksheet | Officer/Authority | type selector (retirement/death/service), half-years, slab, ceiling (with auto-step), nominee split, withhold | draft, computed, sanctioned, withheld, paid |
| Family Pension Panel | Officer/Authority | normal/enhanced amounts, path-specific window timeline, family-members (E26) hierarchy, dual-FP/twins shares, transfer | computed, active, transferred, ceased |
| Terminal Settlement | Officer/Authority | component breakdown, **tax panel** (exempt/taxable/TDS/89(1)), recoveries, withheld, gross/taxable/TDS/net, export | draft, computed, sanctioned, partially-withheld, paid |
| GPF Settlement | Officer/Authority | balance, interest, advances, final payable, nominee split (masked) | draft, computed, authorised, paid |
| PPO Composer | Officer/Authority | figures, type selector (incl. PROVISIONAL), PDA selector (model badge), registry number, e-PPO preview, DigiLocker indicator, authorise | draft, issued, authorised, active, superseded |
| Provisional-Pension Panel (new) | Officer/Authority | proceedings ref/status, provisional amount, withheld DCRG, conclusion action | active, concluded-regularised, concluded-recovery |
| Pensioner 360 | Officer/Pensioner | pension summary, LC status + calendar, restoration countdown, conversion history, death-signal & overpayment panels, bank (masked) | active, suspended-no-LC, deceased, converted |
| Revision Console | Officer/Authority | batch params, model-segmented preview, delta preview, event-ordering panel (§16.9), exceptions, approve/apply gates | draft, computed, approved, applied, failed |
| Disbursement Console | Officer/Authority/Treasury | validation, account-verification (penny-drop) column, model badge, authorise/transmit, ack reconciliation, exceptions | draft, authorised, transmitted, acknowledged, partial-ack, failed |
| Rule-Table Admin (new) | SysAdmin/Approver/Auditor | table selector, effective-dated row grid, approval flow, version diff, gratuity-ceiling auto-step panel | draft, approved, effective, superseded |
| PDA Registry (new) | SysAdmin/Authority | PDA list, model badges, interface/contract, penny-drop capability, certify/activate | active, suspended, retired |
| Death-Detection Console (new) | Officer/Auditor | flag queue (source/confidence), confirm/dismiss, overpayment-recovery workspace, drawn-after-death report | flagged, confirmed, under-recovery, recovered |
| Audit-Objection Inbox (new) | Auditor/Officer | SLA timers, linked case/PPO/trace, response form, outcome selector, ageing dashboard | raised, under-response, responded, accepted, dropped, closed |
| Retirement Self-Service | Employee/Pensioner | **3-state plain-language tracker**, outcome-framed estimator/what-if, option wizard, LC calendar, bereavement guide, e-PPO/DigiLocker | empty, loaded, error, success, permission |
| Grievance Inbox & Tracker | Pensioner/Officer | SLA timers, priority, linked context, resolution form, ageing dashboard | open, assigned, in-progress, resolved, escalated, reopened |
| Pension Analytics | Manager/Officer/Auditor | liability projection, workload, SLA gauges, benefit-cost, grievance trend, audit-objection ageing | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; keyboard navigation & visible focus; dark mode; responsive/mobile-first for self-service (estimator, options, e-PPO/DigiLocker, LC, grievance, bereavement guide); money/bank/PAN/Aadhaar masked by default with audited reveal; amounts/dates per locale (`DD-MMM-YYYY`); empty/loading/error/success/permission states for every screen; **plain-language, compassionate flows** for death-in-service, family-pension, and bereavement; the citizen surface shows a **3-state tracker**, never the internal state machine; no skeleton placeholders in production.

---

## 8. API & Integration

### 8.1 Conventions

REST under `/api/v1`; JSON; JWT bearer + RBAC + org-unit scoping; cursor or page/limit pagination (max 100); `Idempotency-Key` on mutating case-progression, PPO-issue, revision, disbursement, and account-verification endpoints; timestamps UTC ISO-8601; money `NUMERIC` strings.

### 8.2 Canonical Error Envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "retirement_date is required", "field": "retirement_date" }, "requestId": "req_a1b2..." }
```

### 8.3 Error-Code Catalog (shared + M11-specific; additions marked ★)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid input |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD denied |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | State conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled |
| UPSTREAM_UNAVAILABLE | 503 | M03/M10/M12/M13/PDA/DigiLocker/registry gateway down |
| DUPLICATE_ACTIVE_CASE | 409 | Employee already has an active case |
| CASE_INPUT_INCOMPLETE | 422 | Type-required field missing |
| SERVICE_GAP_UNRESOLVED | 409 | Uncondoned service gap blocks progress |
| ★ SERVICE_VERIFICATION_INCOMPLETE | 409 | FR-18 record not SIGNED_OFF/LOCKED (gates CALCULATION) |
| ★ DISCREPANCY_UNRESOLVED | 409 | Open discrepancy-ledger line at sign-off |
| ★ SPELL_NOT_ATTESTED | 409 | Non-qualifying spell lacks reason-code attestation |
| EMOLUMENTS_UNAVAILABLE | 422 | M10 emoluments not resolvable |
| RULE_NOT_EFFECTIVE | 422 | No EFFECTIVE rule row for the relevant date |
| COMMUTATION_EXCEEDS_LIMIT | 422 | Commuted fraction over statutory max |
| FACTOR_NOT_FOUND | 422 | No commutation factor for age |
| NOMINEE_SPLIT_INVALID | 422 | Nominee shares do not total 100% |
| ★ FAMILY_PENSION_NOT_NOMINEE_DRIVEN | 409 | Attempt to pay family pension to a nominee who is not a rule-defined family member |
| RECOVERY_EXCEEDS_PROTECTION | 409 | Recovery breaches net protection |
| SCHEME_MISMATCH | 409 | Operation invalid for OPS/NPS/UPS scheme |
| ★ TAX_RULE_NOT_EFFECTIVE | 422 | No effective tax parameter for the settlement |
| CASE_NOT_SANCTIONED | 409 | PPO/settlement before sanction |
| DUPLICATE_PPO_NUMBER | 409 | PPO number collision |
| CASE_LOCKED_FOR_OPTIONS | 409 | Self-service option after sanction |
| INVALID_BANK_ACCOUNTS | 422 | Invalid/missing payee/PDA binding |
| ★ ACCOUNT_VERIFICATION_FAILED | 422 | Penny-drop / name-IFSC verification failed or not PASSED |
| REVISION_IMMUTABLE | 409 | Edit of an applied revision |
| LC_OVERDUE_SUSPENDED | 409 | Action blocked by life-certificate suspension |
| ★ PROVISIONAL_PROCEEDINGS_PENDING | 409 | DCRG release / final sanction attempted while Rule-9 proceedings active |
| ★ PDA_NOT_CERTIFIED | 409 | Production transmission to an uncertified PDA |
| ★ AUDIT_OBJECTION_OPEN | 409 | Closure/correction outside the amendment workflow |
| ★ PENSION_DRAWN_AFTER_DEATH | 409 | Disbursement attempted for a pensioner flagged deceased |

### 8.4 JSON Examples

**Service-verification sign-off (gate)**

```json
{ "verification_id": "sv-1001", "discrepancy_open_count": 0,
  "spells_attested_count": 2, "spells_total_count": 2, "signoff_complete": true, "status": "LOCKED" }
```

**Pension compute — service-gratuity branch (<10 yrs)**

```json
{ "pension_calc_id": "pc-7011", "scheme": "OPS", "benefit_outcome": "SERVICE_GRATUITY_ONLY",
  "basic_pension": null, "service_gratuity_ref": "gr-3010", "rule_version_ref": "limit-2026-01" }
```

**Family pension — path-specific window (death-in-service)**

```json
{ "fp_id": "fp-2001", "enhanced_basis": "IN_SERVICE", "normal_amount": "23400.00",
  "enhanced_amount": "39000.00", "enhanced_from": "2026-06-13", "enhanced_to": "2036-06-12",
  "enhanced_window_rule": "IN_SERVICE_10Y_NO_AGE_CAP" }
```

**Account verification failure (penny-drop)**

```json
{ "error": { "code": "ACCOUNT_VERIFICATION_FAILED",
  "message": "name mismatch: supplied 'R Kumar' vs bank 'Rajesh Kumar Sharma' (score 0.62)", "field": "account_name" },
  "requestId": "req_9f2c" }
```

**Authorise PPO (response, with DigiLocker + model)**

```json
{ "ppo_id": "ppo-4512", "ppo_no": "PPO-2026-004512", "ppo_type": "SERVICE_PENSION",
  "basic_pension": "56000.00", "commuted_portion": "22400.00", "residual_pension": "33600.00",
  "effective_from": "2026-10-01", "status": "AUTHORISED_TO_PDA", "pensioner_id": "PNR-000123",
  "pda_disbursement_model": "PDA_APPLIES_RELIEF", "relief_formula_ref": "da-2026-07",
  "digilocker_pushed": true, "digilocker_ref": "dl://issued/PPO-2026-004512" }
```

**Provisional pension (Rule 9)**

```json
{ "provisional_id": "pp-001", "proceedings_type": "DEPARTMENTAL",
  "provisional_pension_amount": "50000.00", "dcrg_withheld": true, "status": "ACTIVE" }
```

### 8.5 Integration Points

| System | Direction | Purpose |
|---|---|---|
| M01 Employee | in | employee master, DOB, cadre, DOJ (scheme/forecast), family declarations |
| M03 Attendance/Leave | in | encashable leave balance; non-qualifying leave spells + reason codes |
| M04 Leave–SR Integration | in | non-qualifying leave events in SR |
| M09 Disciplinary | in | compulsory-retirement order; **proceedings status (provisional)**; recoveries; gratuity withhold |
| M10 Payroll | in | last-pay-drawn/emoluments, GPF/NPS contributions, recoveries; verification provenance sign-off |
| M12 Service Register | in/out | gap-free verification + discrepancy resolution (in); retirement events (append) |
| M13 Documents | in/out | store/sign PPO/sanction/calc-sheet artefacts |
| M14 Dashboards | out | pension liability, workload, SLA, audit-objection KPIs |
| Treasury / PDA / Bank CPPC | out/in | disbursement & PPO authorisation per **disbursement model + §8.6 contract**; ack |
| Bank / NPCI mapper | out/in | **penny-drop / name-IFSC account verification** (pre-credit) |
| Jeevan Pramaan / DLC | in | Digital Life Certificate verification |
| NPS / CRA (PRAN) | in/out | NPS corpus reference, annuity/withdrawal handoff; **UPS** linkage |
| Death registry / Aadhaar-DBT | in | **proactive death-detection / overpayment reconciliation** (FR-20) |
| DigiLocker / UIDAI | out | **e-PPO/revision-order delivery; Aadhaar/PRAN linkage** (FR-24) |
| Income-tax (TDS reference) | reference | tax-parameter reference for FR-09 TDS/89(1) computation |

### 8.6 PDA / Treasury Interface Contract (new — R8)

Defines the concrete disbursement interface that FR-14/FR-21 implement; replaces v1's "pluggable" hand-wave.

- **Transport:** FILE_SFTP (signed, encrypted batch files) or REST_API (mTLS), per `pension_disbursing_authorities.interface_type`.
- **Disbursement line fields:** `batch_no`, `line_no`, `ppo_no`, `pensioner_no`, `disbursement_type`, `period_month/year`, `amount` (M11_COMPUTES_FULL) **or** `basic_pension` + `relief_formula_ref` (PDA_APPLIES_RELIEF), `account_no` (encrypted), `ifsc`, `account_name`, `verification_ref` (E42), `idempotency_key`.
- **Batch header/trailer:** `pda_code`, `contract_version`, `line_count`, `control_total`, `generated_at`, `signature`.
- **Acknowledgement schema:** per-line `ack_status` ∈ {PAID, FAILED, RETURNED}, `ack_reference`, `failure_code` (from the error taxonomy), `paid_at`; batch-level `acknowledged_count`, `failed_count`, `control_total_ack`.
- **Bank/treasury error taxonomy:** `ACCOUNT_CLOSED`, `ACCOUNT_FROZEN`, `NAME_MISMATCH`, `INVALID_IFSC`, `LIMIT_EXCEEDED`, `DUPLICATE`, `PENSIONER_DECEASED`, `OTHER` — each mapped to an M11 exception/grievance.
- **Retry / re-route:** failed lines retried per PDA policy (max attempts, backoff); persistent failures re-routed to an alternate PDA or raised as grievances; idempotency prevents double payment.
- **Sandbox tie-out:** every PDA must pass a sandbox batch (control-total tie-out, ack round-trip, penny-drop) before `sandbox_certified=true` and go-live (FR-21).

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance (interactive) | P95 < 500ms for reads/config; benefit estimator < 1.5s; account verification (penny-drop) < 3s |
| Performance (batch) | **M11_COMPUTES_FULL:** DA revision for 100,000 pensioners within 30 min; monthly disbursement batch < 10 min. **PDA_APPLIES_RELIEF:** relief-order issue + reconciliation is far lighter (transmit orders, not 100k computed lines) — target < 5 min |
| Determinism | **Identical results given the snapshotted rule version (E30–E36 FK) and signed-off verified inputs.** External/indicative NPS-CRA and UPS-annuity figures are excluded from the guarantee. Concurrent-event application follows the §16.9 order (tested invariant) |
| Input provenance | No benefit engine runs without a SIGNED_OFF/LOCKED service-verification record (FR-18, IR2a) |
| Continuity (critical) | First pension/anticipatory/provisional authorised before pension commencement for 100% of cases |
| Availability | 99.9% uptime; batch windows off-peak |
| Scalability | Horizontal scaling of revision/disbursement workers; partition pensioner population by PDA/org/model |
| Integrity | ACID per case sanction, PPO issue, conversion, revision-apply, death-conversion; immutable sanctioned snapshots & applied revisions; pre-credit verification before first credit |
| Security | OIDC/SSO+MFA; RBAC+row-level scope; SoD (incl. rule-table maker≠approver); field-level encryption for bank/PAN/Aadhaar/PRAN/nominee/family/benefit amounts; masked display with audited reveal |
| Privacy | DPDP Act 2023; PII minimisation; heightened sensitivity for deceased/family data; death-registry/DBT data purpose-limited; statutory retention (pensioner life + tail) |
| Auditability | Every state change in `audit_log`; immutable; `calc_trace` retained; audit objections tracked to closure (FR-23) |
| Recoverability | RPO ≤ 15min, RTO ≤ 4h; staged compute allows safe restart of revisions/disbursements |
| Accessibility | WCAG 2.1 AA; plain-language, compassionate flows; 3-state citizen tracker; large-text/elderly-friendly self-service |
| Observability | First-pension-on-time SLA, LC-overdue alerts, disbursement-ack monitoring, revision exception dashboards, drawn-after-death exceptions, audit-objection ageing |
| Compliance | Statutory pension/commutation/gratuity/family-pension/UPS/NPS-default/tax rules; effective-dated rule-table versioning (FR-19); audit-objection traceability (FR-23) |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 Separation Case (amended — FR-18 gate, proceedings)

| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | INITIATED | type-required inputs present |
| INITIATED | request SR verification | SR_VERIFICATION | Pension Officer |
| SR_VERIFICATION | service verification signed off **and** SR certified | NO_DUES | **FR-18 record SIGNED_OFF/LOCKED (IR2a)** & qsr.sr_verified=true |
| NO_DUES | no-dues cleared | CALCULATION | no_dues CLEARED or anticipatory/provisional exception |
| CALCULATION | benefits computed | PENDING_SANCTION | qsr LOCKED & calcs COMPUTED |
| PENDING_SANCTION | sanction | SANCTIONED | checker ≠ maker; **if proceedings_pending, only PROVISIONAL path (FR-22)** |
| SANCTIONED | issue PPO | PPO_ISSUED | PPO authorised |
| PPO_ISSUED | settle terminal benefits | SETTLED | settlement PAID (DCRG withheld if proceedings) |
| SETTLED | close | CLOSED | SR event appended |
| any (non-terminal) | hold | ON_HOLD | with reason |
| any (non-terminal) | reject | REJECTED | with reason |
| ON_HOLD | resume | (prior state) | authority |

### 10.2 PPO (amended — PROVISIONAL)

| Current | Event | Next |
|---|---|---|
| DRAFT | generate | ISSUED |
| ISSUED | authorise | AUTHORISED_TO_PDA |
| AUTHORISED_TO_PDA | PDA accepts / pensioner enrolled | ACTIVE |
| ACTIVE | revise | SUPERSEDED (new REVISED PPO ACTIVE) |
| ACTIVE (ANTICIPATORY/PROVISIONAL) | final/regularised | SUPERSEDED (final PPO ACTIVE) |
| ISSUED/ACTIVE | cancel (error) | CANCELLED |

### 10.3 Pensioner Lifecycle (amended — proactive death)

| Current | Event | Next |
|---|---|---|
| ACTIVE | LC overdue beyond grace | SUSPENDED_NO_LC |
| SUSPENDED_NO_LC | LC submitted & verified | ACTIVE |
| ACTIVE | report death (self) **or FR-20 confirmed death** | DECEASED |
| DECEASED | family-pension conversion (E26) | CONVERTED_TO_FAMILY |
| DECEASED | post-death drawal detected | (open E38 overpayment recovery) |
| ACTIVE/CONVERTED | no eligible family member / cessation | CEASED |

### 10.4 Pension Revision Batch (carried; ordering per §16.9)

| Current | Event | Next |
|---|---|---|
| DRAFT | compute deltas / relief orders | COMPUTED |
| COMPUTED | approve | APPROVED |
| APPROVED | apply (instruct or relief order) | APPLIED |
| COMPUTED/APPROVED | compute fault | FAILED |
| APPLIED | (immutable) | — |

### 10.5 Disbursement Instruction (carried; pre-credit verification precedes)

| Current | Event | Next |
|---|---|---|
| (pre) | account verification PASSED (E42) | (enables transmit) |
| DRAFT | authorise | AUTHORISED |
| AUTHORISED | transmit | TRANSMITTED |
| TRANSMITTED | full ack | ACKNOWLEDGED |
| TRANSMITTED | partial ack | PARTIALLY_ACK |
| TRANSMITTED | rejected | FAILED |
| ACKNOWLEDGED/PARTIALLY_ACK | reconcile | RECONCILED |

### 10.6 Family Pension (carried; path-specific window)

| Current | Event | Next |
|---|---|---|
| DRAFT | compute (enhanced_basis window) | COMPUTED |
| COMPUTED | sanction | SANCTIONED |
| SANCTIONED | begin payment | ACTIVE |
| ACTIVE | enhanced window expiry | (auto step-down to normal) |
| ACTIVE | beneficiary cessation w/ next eligible (E26) | TRANSFERRED |
| ACTIVE/TRANSFERRED | no eligible family member | CEASED |

### 10.7 Grievance (carried)

| Current | Event | Next |
|---|---|---|
| OPEN | assign | ASSIGNED |
| ASSIGNED | start work | IN_PROGRESS |
| IN_PROGRESS | resolve | RESOLVED |
| RESOLVED | close | CLOSED |
| any | SLA breach | ESCALATED |
| CLOSED | reopen | REOPENED |

### 10.8 Service Verification (new)

| Current | Event | Next |
|---|---|---|
| DRAFT | build ledger | DISCREPANCIES_OPEN |
| DISCREPANCIES_OPEN | all discrepancies resolved & spells attested | ATTESTED |
| ATTESTED | three-point sign-off | SIGNED_OFF |
| SIGNED_OFF | lock | LOCKED |
| LOCKED | new evidence | (new version → DRAFT) |

### 10.9 Provisional Pension (new)

| Current | Event | Next |
|---|---|---|
| (case) | proceedings_pending | ACTIVE (provisional pension paid, DCRG withheld) |
| ACTIVE | conclusion: EXONERATED / PENALTY_NO_RECOVERY | CONCLUDED_REGULARISED (release DCRG, final PPO) |
| ACTIVE | conclusion: PENALTY_WITH_RECOVERY | CONCLUDED_RECOVERY (recover then release balance) |

### 10.10 Rule-Table Row (new) & Audit Objection (new)

| Rule row | Event | Next |
|---|---|---|
| DRAFT | approve (SoD) | APPROVED |
| APPROVED | reach effective date | EFFECTIVE |
| EFFECTIVE | new effective row | SUPERSEDED |

| Audit objection | Event | Next |
|---|---|---|
| RAISED | route | UNDER_RESPONSE |
| UNDER_RESPONSE | respond | RESPONDED |
| RESPONDED | accept (link revision) / drop | ACCEPTED / DROPPED |
| ACCEPTED/DROPPED | close | CLOSED |

---

## 11. Notifications

| Event | Recipient | Channel | Trigger FR |
|---|---|---|---|
| Employee crosses retirement horizon threshold | Pension Officer | in-app, email | FR-01 |
| Separation case initiated / sanctioned | Employee, Officer, Authority | in-app, email | FR-02 |
| Service-verification discrepancy assigned / signed off | Officer, SR Custodian, Payroll | in-app, email | FR-18 |
| SR verification required / certified | SR Custodian, Officer | in-app, email | FR-03 |
| No-dues item pending / cleared | No-dues owners, Officer | in-app, email | FR-03 |
| Anticipatory / provisional pension authorised | Employee, PDA | in-app, email | FR-03, FR-22 |
| Benefits computed / sanctioned (incl. service gratuity / UPS / NPS-default) | Employee, Authority | in-app, email | FR-05..09 |
| PPO issued (e-PPO available **in DigiLocker**) | Pensioner, PDA | in-app, email, SMS | FR-11, FR-24 |
| **Life certificate calendar reminder** / due / overdue / suspension | Pensioner | in-app, email, SMS | FR-12, FR-15 |
| Commuted portion restored (reduction+15yr) | Pensioner | in-app, email | FR-12 |
| Pension revised (DA/pay-commission) with arrear / relief order | Pensioner | in-app, email | FR-13 |
| Disbursement transmitted / failed; **account-verification mismatch** | Officer, Pensioner (on failure) | in-app, email, SMS | FR-14 |
| Family pension sanctioned / transferred; **bereavement guidance** | Family member, Authority | in-app, email | FR-08, FR-12, FR-15 |
| **Probable death flagged / overpayment opened** | Officer, Auditor | in-app, email | FR-20 |
| **Audit objection raised / responded / escalated / closed** | Auditor, Officer, Authority | in-app, email | FR-23 |
| Grievance raised / resolved / escalated | Pensioner, Officer, Authority | in-app, email | FR-16 |

---

## 12. Reporting & Analytics

| Report / Dashboard | Audience | Contents |
|---|---|---|
| Due-for-Retirement Forecast | Pension Officer, Dept Head | counts by horizon/org/cadre; case-initiation status |
| Pension Liability Projection | Dept Head, Finance, Auditor | current & projected annual liability; DA/pay-commission scenarios |
| Benefit-Cost Composition | Finance, Auditor | pension/gratuity/commutation/family-pension/service-gratuity/UPS cost split |
| Processing SLA & Ageing | Pension Officer, Dept Head | stage durations; first-pension-on-time rate; backlog; service-verification gate time |
| Pensioner Population & Lifecycle | Officer, Auditor | active/suspended/converted; LC compliance; age distribution |
| Revision Impact | Officer, Finance | per-batch old→new, arrear totals, exceptions, model split |
| Disbursement Reconciliation | Officer, Treasury | transmitted vs acknowledged vs failed; ageing; account-verification failures |
| **Pension Drawn After Death (Exception)** | Officer, Auditor | post-death drawals, overpayment & recovery status (FR-20) |
| Grievance Trends | Officer, Dept Head | volume by category; SLA compliance; reopen rate |
| **Audit & Compliance Register** | Auditor | sanction trail, SoD adherence, rule-version usage, immutability proofs, **open/closed audit objections with trace linkage (FR-23)** |

All analytics are read-only, org-unit scoped, reconcile to source records, and feed M14.

---

## 13. Migration & Launch

### 13.1 Data Migration

- Migrate the existing pensioner population: pensioner master, current pension, PPO numbers, **PDA bindings + disbursement model**, bank details (encrypted), **Aadhaar/PRAN**, LC status, and commutation/restoration schedules (**capturing reduction dates; flag `migrated_date_unknown` where unavailable**).
- Migrate in-flight separation cases at their current stage with verified service and computed benefits where available; build service-verification records (FR-18) for in-flight cases.
- Map legacy separation types and schemes (**OPS/NPS/UPS**); **load and sign off the effective-dated rule-table entities (E30–E36): DA, commutation factors, family-pension rates, gratuity ceilings (with auto-step), retirement ages, min/max, rounding** — the genuine critical path.
- Load the **family-members register (E26)** (Form 3/14) for active family pensioners distinct from nominee registers (E21); load **prior-service records (E39)**.

### 13.2 Validation & Parallel Run

- Recompute a statistically significant sample of legacy pensions/gratuities (incl. **service-gratuity, UPS, NPS-default, path-specific family pension, tax**) and reconcile within tolerance; investigate variances.
- Run a parallel DA revision against legacy output and tie out per-pensioner deltas **per disbursement model**.
- Validate PPO-number uniqueness and PDA bindings; **dry-run a disbursement batch in a sandbox PDA channel with the §8.6 contract and penny-drop tie-out** (FR-21).
- Tie out the **gratuity-ceiling auto-step** against the current DA level.

### 13.3 Cutover & Launch

- Freeze legacy writes; final delta migration; switch disbursement instructions to M11; verify the first post-cutover monthly disbursement end-to-end with PDA acknowledgement **per model**.
- Enable pensioner self-service (3-state tracker, outcome estimator, e-PPO/DigiLocker, LC calendar, bereavement guide) after data validation.
- Benchmark the pre-retirement workflow against the **DoPPW *Bhavishya*** model; enable **DigiLocker** delivery (FR-24).

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| **Rule-table entities (E30–E36) loaded, approved & signed off** | required (critical path) |
| **PDA registry + disbursement model + §8.6 contract + sandbox certification** | required (week-1 workstream) |
| **Service-verification (FR-18) gate operational** | required |
| Pensioner master reconciled to legacy counts & sums | required |
| Sample benefit recomputation within tolerance (incl. service-gratuity/UPS/NPS-default/tax) | required |
| **Family-members register (E26) loaded distinct from nominees** | required |
| **Penny-drop / account-verification operational** | required |
| PPO-number registry continuity verified | required |
| Disbursement sandbox tie-out with PDA (control total + ack + penny-drop) | required |
| SoD roles & approvals (incl. rule-table maker≠approver) configured | required |
| DLC/Jeevan Pramaan + **DigiLocker** integration tested with fallback | required |
| **Death-registry/Aadhaar-DBT reconciliation (FR-20) operational** | required |
| Audit log, immutability & audit-objection tracking verified | required |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | retirement_forecasts, retirement_age_rules | /forecasts | — | month-end arithmetic, E34 ages, alerts |
| FR-02 | separation_cases, pension_disbursing_authorities | /cases | §10.1 | type inputs, scheme OPS/NPS/UPS, SoD, single-active |
| FR-03 | separation_cases, service_verifications, qsr, ppo(ANTICIPATORY) | /sr-verification, /no-dues, /anticipatory-pension | §10.1 | gates (FR-18+sr), anticipatory cap |
| FR-04 | qualifying_service_records, non_qualifying_spells, prior_service_records | /qualifying-service, /prior-service | qsr DRAFT→LOCKED | deduction+prior-service, half-years, min-service routing |
| FR-05 | pension_calculations | /pension:compute | calc states | flat-50%, service-gratuity, UPS, NPS-default, determinism |
| FR-06 | commutation_records, commutation_factors | /commutation | §10 (restoration) | cap, factor, residual, reduction-date restoration |
| FR-07 | gratuity_calculations, gratuity_ceilings | /gratuity | gratuity states | retirement/death/service, ceiling auto-step, apportionment |
| FR-08 | family_pension_records, family_members, family_pension_rates | /family-pension | §10.6 | path-specific window, E26 hierarchy, dual/twins |
| FR-09 | terminal_settlements | /settlement | settlement states | encashment, netting, tax/TDS/89(1), withhold |
| FR-10 | gpf_final_settlements | /gpf | gpf states | interest, advances, NPS/UPS routing |
| FR-11 | ppo_records, pensioners, provisional_pension_records | /ppo, /ppos | §10.2 | uniqueness, supersession (incl. provisional), DigiLocker, SoD |
| FR-12 | pensioners, life_certificates, overpayment_recoveries | /pensioners, /life-certificate | §10.3 | LC suspend, restoration timing, conversion, death-signal |
| FR-13 | pension_revisions, da_relief_rates, pdas | /revisions | §10.4 | model branch, §16.9 ordering, arrear, immutability |
| FR-14 | pension_disbursements, bank_account_verifications | /disbursements, /accounts:verify | §10.5 | tie-out, penny-drop, idempotency, ack, model |
| FR-15 | benefit_estimates, separation_cases, family_members | /estimates, /me/* | — | 3-state tracker, outcome-framed, options, LC calendar, bereavement |
| FR-16 | pension_grievances | /grievances | §10.7 | SLA, escalation, auto-create |
| FR-17 | (read aggregates), audit_objections | /analytics/* | — | reconciliation, scope, projection, objection ageing |
| FR-18 | service_verifications, service_discrepancies, condonation_orders | /service-verification | §10.8 | ledger, attestation, condonation orders, sign-off gate |
| FR-19 | da_relief_rates..rounding_rules (E30–E36) | /rules/* | §10.10 | effective-date resolve, SoD approve, immutability, ceiling auto-step |
| FR-20 | pension_overpayment_recoveries, pensioners | /death-detection, /overpayments | §10.3 | reconciliation, anomaly, recovery modes, exception report |
| FR-21 | pension_disbursing_authorities | /pdas | §10.10(PDA) | model branch, certify/activate, §8.6 contract |
| FR-22 | provisional_pension_records, ppo(PROVISIONAL) | /provisional-pension | §10.9 | provisional pay, DCRG withhold, 3 conclusions |
| FR-23 | audit_objections | /audit-objections | §10.10 | trace linkage, SLA, outcome closure, revision/recovery |
| FR-24 | ppo_records(digilocker), pensioners(aadhaar/pran) | /ppos:deliver-digilocker | — | delivery, ref capture, Aadhaar/PRAN, non-blocking retry |

### 14.2 Dependency Graph (build order)

1. **FR-19 (rule tables) + FR-21 (PDA model/contract) [week-1 critical path]** → 2. FR-01 (forecast) + FR-02 (case) → 3. **FR-18 (service verification)** + FR-03 (pre-retirement) + FR-04 (qualifying service) → 4. FR-05 (pension incl. service-gratuity/UPS/NPS-default) → 5. FR-06 (commutation), FR-07 (gratuity), FR-10 (GPF) → 6. FR-08 (family pension), FR-09 (settlement incl. tax) → 7. FR-11 (PPO), FR-22 (provisional) → 8. FR-12 (pensioner lifecycle), FR-24 (DigiLocker) → 9. FR-13 (revision), FR-14 (disbursement incl. penny-drop), FR-20 (death detection) → 10. FR-15 (self-service), FR-16 (grievance), FR-23 (audit objections) → 11. FR-17 (analytics).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| **0: Foundations (critical path)** | FR-19, FR-21 | start (week 1) |
| A: Pipeline foundation | FR-01, FR-02 | start |
| B: Input provenance & eligibility | FR-18, FR-03, FR-04 | 0, A |
| C: Benefit engines | FR-05, FR-06, FR-07, FR-10 | B |
| D: Family & settlement | FR-08, FR-09 | C |
| E: Order & pensioner | FR-11, FR-22, FR-12, FR-24 | D |
| F: Ongoing ops | FR-13, FR-14, FR-20 | E, 0 |
| G: Self-service, grievance & audit | FR-15, FR-16, FR-23 | C (FR-15), E (FR-16/23) |
| H: Analytics | FR-17 | C, E, F |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Retirement forecasting & due-lists | FR-01 | yes | yes | n/a | yes | none |
| Separation types (all 6) + OPS/NPS/UPS | FR-02 | yes | yes | yes | yes | none |
| Service-record completeness & discrepancy gate | FR-18 | yes | yes | yes | yes | none |
| Pre-retirement (SR verify, no-dues, anticipatory) | FR-03 | yes | yes | yes | yes | none |
| Qualifying service + non-qualifying deduction + prior service | FR-04 | yes | yes | yes | yes | none |
| Pension calc (flat-50% / service gratuity / UPS / NPS-default / NPS indicative) | FR-05 | yes | yes | yes | yes | none |
| Commutation & reduction-date restoration | FR-06, FR-12 | yes | yes | yes | yes | none |
| Gratuity (retirement, death, service) + ceiling auto-step | FR-07 | yes | yes | yes | yes | none |
| Family & enhanced family pension (path-specific, E26-driven, dual/twins) | FR-08 | yes | yes | yes | yes | none |
| Terminal benefits, leave encashment & tax/TDS/89(1) | FR-09 | yes | yes | yes | yes | none |
| GPF final withdrawal | FR-10 | yes | yes | yes | yes | none |
| PPO & digital PPO (+ provisional, DigiLocker) | FR-11, FR-24 | yes | yes | yes | yes | none |
| Pensioner master & lifecycle (LC/Jeevan Pramaan) | FR-12 | yes | yes | yes | yes | none |
| Proactive death detection & overpayment recovery | FR-20 | yes | yes | yes | yes | none |
| Provisional pension (Rule 9) | FR-22 | yes | yes | yes | yes | none |
| Pension revision (DA/pay-commission) + ordering + model | FR-13 | yes | yes | yes | yes | none |
| Treasury/bank/PDA integration + penny-drop + contract | FR-14, FR-21 | yes | yes | yes | yes | none |
| Rule-table management (DA/factors/rates/ceilings/ages/limits/rounding) | FR-19 | yes | yes | yes | yes | none |
| Self-service portal, 3-state tracker & outcome estimators | FR-15 | yes | yes | n/a | yes | none |
| Pensioner grievance | FR-16 | yes | yes | yes | yes | none |
| Audit-objection management | FR-23 | yes | yes | yes | yes | none |
| Forecasting & liability analytics | FR-17 | yes | yes | n/a | yes | none |
| Inputs from M03/M09/M10/M12 | FR-04,05,09,10,18 + §8.5 | yes | yes | n/a | yes | none |
| Retirement events to M12 (SR) | FR-02,11 + §8.5 | yes | yes | yes | yes | none |

**Result: 0 unresolved gaps.** Every module-focus capability and every adopted council improvement (R1–R18 + the three world-class additions) maps to at least one FR, entity, API, state, and test.

---

## 15. Glossary (additions to v1)

| Term | Definition |
|---|---|
| UPS (Unified Pension Scheme) | Assured-payout scheme (eff. 01-Apr-2025) for opted-in NPS employees — ~50% of last-12-month average pay with a minimum guarantee |
| NPS death/invalidation default | CCS (Implementation of NPS) Rules 2021 OPS-equivalent family/invalid pension for NPS employees on death-in-service/invalidation |
| Service gratuity | One-time lump sum for <10-year qualifying service (no monthly pension), no DCRG ceiling |
| Provisional pension (Rule 9) | Pension paid to a retiree with pending departmental/judicial proceedings, with DCRG fully withheld until conclusion |
| Enhanced-family-pension basis | IN_SERVICE (10 yrs, no age cap) vs AFTER_RETIREMENT (7 yrs / age-67 / would-be-superannuation) |
| Family-members register (Form 3/14) | The statutory list of rule-defined family members that determines family-pension eligibility (distinct from nominees) |
| Dual family pension | Two family pensions where both spouses were government servants, subject to a cap |
| Reduction-effective date | Date the monthly pension is reduced on commutation (= commuted-value receipt date); restoration = this date + 15 yrs |
| Disbursement model | Whether M11 computes the full monthly amount (M11_COMPUTES_FULL) or the PDA/CPPC applies Dearness Relief (PDA_APPLIES_RELIEF) |
| Penny-drop | Pre-credit bank-account verification (name-IFSC / NPCI mapper) before the first payment |
| Service-verification gate | The signed-off e-SR completeness/discrepancy record (FR-18) required before any benefit computation |
| Condonation register | The register of orders (not free text) that condone service gaps/deficiencies |
| Audit objection | An AG/internal-audit query against a pension case, tracked from raise to closure (FR-23) |
| DigiLocker delivery | Pushing the signed e-PPO/revision order to the pensioner's DigiLocker |
| DCRG | Death-cum-Retirement Gratuity (retirement/death gratuity) |
| Section 89(1) relief | Income-tax relief on arrears spread across years |
| Bhavishya | DoPPW pre-retirement/pension-processing benchmark model |

(All v1 glossary terms carried forward unchanged.)

---

## 16. Appendices

### 16.1 Benefit Computation Order (default sequence, amended)

1. **Build & sign off service verification (FR-18)** → 2. Verify gap-free service (M12) → 3. Compute qualifying service (deduct non-qualifying spells, **add counted prior service**, round half-years) → 4. Resolve emoluments base (M10) → 5. **Route by benefit outcome:** ≥10 yrs → basic pension (OPS flat-50% / UPS assured / NPS-default); <10 yrs → service gratuity; NPS superannuation → indicative → 6. Commutation (option, factor, value, residual, **reduction-date restoration schedule**) → 7. Gratuity (retirement/death/service, slab, **ceiling with DA auto-step**) → 8. Family pension (path-specific window, E26-driven) → 9. Leave encashment (M03) → 10. GPF final → 11. **Tax/TDS/89(1)** → 12. Net recoveries within protection → 13. Sanction (provisional if proceedings) → 14. PPO issue (+ DigiLocker) → 15. **Pre-credit account verification** → 16. Disbursement & pensioner enrolment.

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; factors/rates `NUMERIC(9,4)`; service in integer Y/M/D; no floating point.
- Benefit/half-year rounding per `rounding_rules` (E36), referenced via `rule_version_ref` (FK).

### 16.3 Recovery Priority & Net Protection

Statutory dues → court attachment → disciplinary recovery (M09) → government over-payment (incl. **post-death overpayment E38**) → outstanding loans/advances (M10) → other. Breaching the protected floor defers lower-priority recoveries (`RECOVERY_EXCEEDS_PROTECTION`); spillover recovered from future pension/estate where rules allow.

### 16.4 Immutability & Correction Policy

A SANCTIONED calculation, an ISSUED/ACTIVE PPO, and an APPLIED revision are immutable. Corrections are issued as a SUPERSEDING calculation/REVISED PPO, a new revision batch, or a recovery/arrear — never a silent edit. Anticipatory/provisional PPOs are superseded by the final PPO with adjustment. Rule-table rows are SUPERSEDED, never deleted once referenced (IR17). Audit-objection corrections flow only through the revision workflow (FR-23).

### 16.5 Pension Eligibility & Service Gratuity (amended — R2)

- **≥10 years qualifying service:** flat **50%** of emoluments base (no proportionate reduction). The pre-2006 proportionate fraction is deprecated.
- **<10 years qualifying service:** **no monthly pension** — a one-time **service gratuity** (`gratuity_type=SERVICE_GRATUITY`), computed as a multiplier of emoluments per completed half-year, with **no DCRG ceiling**.
- The branch is determined by `qualifying_service_records.meets_min_pension_service` against `pension_limit_rules` (E35).

### 16.6 OPS vs NPS vs UPS Handling (amended — R3)

- Scheme derived from DOJ vs cutover + UPS opt-in; override audited.
- **OPS:** M11 computes defined-benefit pension, commutation, gratuity, family pension, GPF.
- **NPS — superannuation:** record corpus/PRAN; **indicative** annuity/withdrawal (non-binding, excluded from determinism); NPS exit/annuity handoff; no GPF.
- **NPS — death-in-service/invalidation:** compute the **CCS-NPS Rules 2021 default benefit** = OPS-equivalent family/invalid pension.
- **UPS (opted-in):** **assured payout ≈ 50% of last-12-month average pay** with the E35 minimum guarantee; opt-in recorded and irreversible per rule.

### 16.7 Enhanced Family Pension Windows (new — R1)

| Path (`enhanced_basis`) | Enhanced rate window | Step-down |
|---|---|---|
| IN_SERVICE (death-in-service) | **10 years, no age cap** (post-2013 CCS amendment) | to normal after 10 yrs |
| AFTER_RETIREMENT (death after retirement) | **7 years OR up to age 67 / the date the deceased would have superannuated, whichever earlier** | to normal at window end |

Both windows are computed from `family_pension_rates` (E32) and recorded in `enhanced_window_rule`; both step-downs are tested invariants.

### 16.8 Tax / TDS on Terminal Benefits (new — R12)

| Component | Exemption treatment | Notes |
|---|---|---|
| Gratuity (DCRG) | Exempt up to the ₹20,00,000 cap; excess taxable | `gratuity_exempt_amount` / `gratuity_taxable_amount` |
| Commuted pension | Exempt per rule (govt employees fully exempt) | `commutation_exempt_amount` |
| Leave encashment | Exempt per the applicable cap | `leave_encashment_exempt_amount` |
| Arrears (revision/89(1)) | Section 89(1) relief computed | `section_89_relief` |
| TDS | Deducted on the net taxable total | `tds_amount`; `net_settlement = gross − recoveries − TDS` |

### 16.9 Deterministic Revision-Application Order (new — R13)

When multiple events share an effective date for one pensioner, apply strictly in this order; record the applied order in `calc_trace`:

1. **Pay-commission re-fixation** (re-fixes the basic).
2. **Commuted-portion restoration** (changes the base on which relief is computed).
3. **DA / Dearness Relief** (applied on the re-fixed/restored basic).
4. **Age-based additional pension** (80/85/90/95/100-year increments).

This ordering is part of the determinism contract (IR18) and a tested invariant.

### 16.10 Assumptions Log (amended)

- Single legal entity per deployment (entity-aware for future multi-entity).
- All benefit parameters are **first-class effective-dated rule-table rows (E30–E36)** entered by SysAdmin and approved by a distinct approver (SoD); `rule_version_ref` is a FK.
- **Disbursement model is explicit per PDA** (E37); FR-13/FR-14 branch on it; batch sizing differs by model.
- PDA/treasury/bank conforms to the **§8.6 interface contract**; sandbox certification precedes go-live.
- Jeevan Pramaan/DLC and **DigiLocker/UIDAI/CRA** integrations available with fallbacks.
- Death-registry/Aadhaar-DBT signals available for FR-20 reconciliation (advisory until confirmed).
- Determinism holds **given the snapshotted rule version and signed-off verified inputs**; external NPS/UPS-annuity figures are excluded.
