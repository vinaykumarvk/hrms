# Retirement and Pension Management — Government HRMS Module BRD (G11, v3.0 · platform-grounded)

**Module code:** G11 (alias `GOV-M11`; supersedes the `SHARED_FOUNDATION` id `M11-PEN`)
**Program:** Government HRMS — a public-sector configuration and extension of the **PrimeSoft HRMS** platform (Vision §1.1; `PLATFORM_FOUNDATION.md` §1)
**Relationship (from `MODULE_RECONCILIATION.md` §A):** **NET-NEW (gov-specific)** — PrimeSoft has no pension/superannuation engine. G11 authors the pension/terminal-benefits calculation engine, commutation, qualifying-service consumption and pension-sanction case **as net-new statutory business logic that runs on the platform engines** (P01 workflow, P05 audit, P06 migration) and consumes G01 master + the G12 SR ledger.
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory pension rules (CCS Pension Rules-style framework, NPS, **UPS (eff. 01-Apr-2025)**, GPF, Jeevan Pramaan/DLC, DoPPW *Bhavishya*/DigiLocker benchmarks), **re-grounded onto the PrimeSoft platform contracts**.
**Source of truth (authority order, `PLATFORM_FOUNDATION.md` §1.1):**
- **Master BRD v2.1** owns requirements, data-model conventions, RBAC matrix, NFR thresholds, notification triggers, state machines.
- **RBAC Design v1.7** owns the access-control model; G11 adds gov roles + capability flags as ADDITIONS.
- **Foundation FS v1.6** owns the `VAL-*`/`JOB-*`/`MSG-*`/`ERR-*` catalogues; G11 authors only `VAL-G11-*` / `JOB-G11-*` / `MSG-G11-*` / `ERR-G11-*` and registers them in the Foundation indexes.
- **Platform Spec v1.6** owns engine internals (P01–P06), X.1–X.3 infrastructure, W.1–W.3 configured-content models; G11 references services and configures flows/forms, never re-implementing an engine.
- This BRD **references** the v2 functional rigor (`docs/brd/v2/M11-retirement-and-pension.md`) and the platform grounding (`docs/brd/PLATFORM_FOUNDATION.md`, `docs/brd/MODULE_RECONCILIATION.md`).

**Document version:** v3.0 (platform re-grounded — supersedes v2.0). Preserves **all** v2 content, entities, FRs, state machines, calculation appendices and rigor; re-anchors every cross-cutting concern (workflow, audit, jobs, integrations, RBAC, API conventions, NFR, migration, multi-tenancy) onto the existing PrimeSoft platform.
**Status:** Re-grounded for platform-consistency review. v2's seven Critical findings (R1–R7), eleven High/Medium/Low findings (R8–R18) and three world-class additions remain incorporated; v3 adds the platform alignment and the v2→v3 amendment ledger.

> **Reading rule (inherited from `PLATFORM_FOUNDATION.md`).** Where this BRD authors net-new statutory logic that PrimeSoft genuinely lacks it is the **`GAP (gov-specific)`** surface; everywhere else it consumes a platform contract by id (`P01`, `P05`, `X.3`, `RBAC v1.7`, …). When a v2 convention conflicts with the real platform, the platform governs (logged in `## Amendments (v2 → v3)` and traceable to `MODULE_RECONCILIATION.md` §C).

---

## 1. Executive Summary

### 1.1 Purpose

The Retirement and Pension Management module (**G11**) governs the complete lifecycle of an employee's separation from service and the lifelong administration of their pensionary and terminal benefits. It manages every **separation type** (superannuation/age retirement, voluntary retirement (VRS), compulsory retirement ordered under disciplinary proceedings, invalidation/medical retirement, death-in-service, and resignation); computes **qualifying service** (now including structured **counted prior/military service**) and the full benefit set (basic pension, **service gratuity for <10-year service**, commutation, family/enhanced family pension, retirement and death gratuity, leave encashment, GPF final withdrawal) **net of statutory tax/TDS**; generates the statutory **Pension Payment Order (PPO)** including **provisional PPOs for pending proceedings (Rule 9)**; and maintains the **pensioner master** and pensioner lifecycle (life-certificate/Jeevan Pramaan, restoration of commuted portion, conversion to family pension on a pensioner's death, **proactive death-detection and overpayment recovery**, and pension revision on DA or pay-commission changes under a **deterministic revision-application order**).

G11 is engineered as a **rule-driven, audit-grade benefit engine** that is deterministic and reproducible **on top of a rigorous input-provenance gate** — and it is engineered as a **platform-native module**: every approval/maker-checker step runs on the **P01 WorkflowEngine**; every mutation is captured immutably by the **P05 dual audit log** (DB-trigger, 7-yr); every scheduled computation runs on the **X.1 background-job runner** as a registered `JOB-G11-*` job; every external call (treasury/PDA, DigiLocker, penny-drop, DBT) runs on the **X.3 integration framework** with credentials from **P04**; and access is enforced by **P02** against the **RBAC v1.7** model. Benefits are never hand-keyed; they are *derived* from verified service history in the **Digital Service Register (G12 SR ledger)**, last-pay-drawn and contribution history from **Payroll (G10)**, leave balances and LWP spells from **Attendance & Leave (G03)** and the **Leave→SR integration (G04)**, and disciplinary orders from **Disciplinary Cases (G09)**, evaluated against **first-class, effective-dated, versioned pension rule-table entities** (DA/Dearness-Relief rates, commutation factors, family-pension rates, gratuity ceilings with the DA-linked auto-step, retirement ages, minimum/maximum pension, rounding) managed through the **platform configuration cascade and versioning**. Crucially, computation is **gated by an e-SR completeness & discrepancy-resolution stage** (per-spell reason-code attestation, condonation register, multi-point sign-off) so that determinism defends correct numbers rather than amplifying upstream defects. Once a benefit case is **sanctioned and a PPO is issued, the calculation snapshot is immutable** — enforced through P05 — and corrections flow only through controlled revision/re-issue with full audit. Every rupee of pension is traceable from qualifying-service input through PPO to disbursement, and every audit objection is tracked to closure.

### 1.2 Business Context and Problem Statement

Public-sector retirement processing is high-stakes, statutorily intricate, and time-critical: an employee who superannuates on the last day of a month must receive pension from the next day without a break. Processing combines **service-record verification** (gap-free service from joining to retirement), **qualifying-service arithmetic** (deducting non-qualifying spells such as extraordinary leave without pay, dies-non, and unauthorised absence, and *adding* counted prior service), **three pension regimes** — **Old Pension Scheme (OPS)** for pre-cutoff entrants, **National Pension System (NPS)** for later entrants (with the **CCS (Implementation of NPS) Rules 2021** death/invalidation default benefit), and the **Unified Pension Scheme (UPS)** assured payout for opted-in employees — **commutation actuarial factors**, **family-pension rules** (normal vs enhanced rates with *path-specific* eligibility windows), **gratuity ceilings**, **tax/TDS treatment** of terminal benefits, and **DA/pay-commission revisions** applied to a live pensioner population for decades, sometimes by **bank CPPCs that themselves apply Dearness Relief**. Manual processing produces delayed first pensions, miscalculated benefits, audit objections, litigation, pension drawn into deceased pensioners' accounts, and hardship to bereaved families. G11 eliminates these by making the rule set explicit and versioned (through the platform config cascade), the computation reproducible and traceable **only after the input is proven complete**, the workflow gated by service verification and no-dues (on P01), the disbursement model explicit per PDA (over X.3), fraud caught proactively, and the pensioner lifecycle fully digital — with a **plain-language citizen layer** over the statutory core.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Zero break in pension | First pension/anticipatory/provisional pension authorised on/before the day after retirement for 100% of cases |
| G2 | Deterministic, reproducible benefit computation | Re-running a case **with the snapshotted rule version and the same verified inputs** yields identical benefit figures and trace. *External/indicative NPS-CRA and UPS-annuity figures are explicitly excluded from the determinism guarantee.* |
| G3 | Statutory accuracy | 100% correct qualifying-service, pension (flat 50% ≥10 yrs / service gratuity <10 yrs), commutation, gratuity, *path-specific* family-pension, UPS/NPS-default, and tax computation against published rules |
| G4 | Service-verified eligibility | No CALCULATION without a **signed-off service-verification record** (discrepancy ledger closed, spells attested); no PPO without G12 SR verification complete and no-dues cleared |
| G5 | Digital, self-service retirement | Retiring employee tracks case via a **3-state plain-language tracker**, runs **outcome-framed estimators**, and submits forms online (W.2 forms on P01); pensioner submits Digital Life Certificate online and receives the e-PPO in **DigiLocker** (over X.3) |
| G6 | Lifelong pensioner integrity | Correct DA/pay-commission revision under a **deterministic application order**, commuted-portion restoration on the **reduction-date+15yr** schedule, family-pension conversion, and proactive death/fraud control across the pensioner's life |
| G7 | Forecasting & liability transparency | Accurate due-for-retirement forecasts and pension-liability analytics by org unit, cadre, and horizon (feeding G14) |
| G8 | Audit-objection closure | 100% of AG/internal-audit objections tracked from raise to closure with linkage to the case and `calc_trace`, all mutations captured in the P05 audit substrate |
| **G9 (platform)** | **Platform-native execution** | Every approval runs on P01; every mutation captured by P05; every batch on X.1 as a `JOB-G11-*`; every external call on X.3 with P04 credentials; access enforced by P02 against RBAC v1.7. **Zero bespoke workflow/audit/job/integration plumbing.** |

### 1.4 Scope Summary

In scope: retirement forecasting & due-for-retirement lists; separation-case management for all separation types; **e-SR completeness & discrepancy-resolution gate**; pre-retirement processing (1–2 years ahead: SR verification with G12, no-dues clearance, anticipatory pension); **provisional pension for pending proceedings (Rule 9)**; qualifying-service computation with non-qualifying-spell deduction **and counted prior-service addition**; pension calculation (basic OPS flat-rate / **service gratuity** / **NPS death-default** / **UPS assured payout**); commutation **with explicit reduction/restoration timing**; retirement, death **and service** gratuity (ceiling **auto-stepping on DA milestones**); **path-specific** family & enhanced family pension driven by a **statutory family-members register** (with **dual family pension and twin/multiple-children** support); terminal benefits & final settlement (incl. leave encashment from G03, GPF final withdrawal) **with tax/TDS and Section 89(1) relief**; PPO generation (incl. digital PPO, **DigiLocker delivery over X.3**); pensioner master & lifecycle (life certificate/Jeevan Pramaan, restoration, family-pension conversion); **proactive death-detection (death-registry/Aadhaar-DBT reconciliation over X.3) and overpayment recovery from estate**; pension revision on DA/pay-commission under a **deterministic ordering rule** and an explicit **paymaster-vs-authoriser disbursement model**; treasury/bank/PDA integration on the **X.3 framework with a defined payload-versioned contract and pre-credit penny-drop verification**; retirement self-service portal & **outcome-framed estimators/what-if**; pensioner grievance management; **audit-objection management**; **effective-dated rule-table management (via the platform config cascade)**; and forecasting & pension-liability analytics (to G14).

Out of scope (owned elsewhere): the canonical employee master (**G01**, on the platform `employees` master); the SR ledger itself (**G12** — the net-new gov ledger on the P05 substrate) — G11 **consumes** the ledger for qualifying-service verification **and IS the SR writer for the separation/superannuation/retirement life events**, posting them to the canonical **`POST /api/v1/sr/ingest`** write-port (see §8.7, `source_module="G11"`); G11 does not own the ledger engine, only authors the separation events it emits; payroll computation of in-service salary and the monthly active-employee payslip (**G10**, extending PrimeSoft M06/M07) — G11 consumes last-pay-drawn and contribution history; leave capture and encashable-balance maintenance (**G03**) and the leave→SR posting (**G04**); disciplinary adjudication that issues a compulsory-retirement penalty order or recovery (**G09**) — G11 consumes the order; document storage internals (**platform `documents` / DocumentGen**, the G13 vault) — G11 references, never redefines; core banking/treasury ledger posting beyond producing and reconciling the disbursement file and (where the PDA is a CPPC) the Dearness-Relief application that the bank performs. **All workflow, RBAC, audit, notification, job-runner, migration and configured-content engines are platform-provided (P01–P06, X.1–X.3, W.1–W.3) and consumed by id, never re-authored.**

### 1.5 Key Stakeholders

Retiring Employee / Pensioner / Family Pensioner (self-service via the **Me** workspace), **Pension Officer / Dealing Assistant (maker — new RBAC v1.7 entity-scoped module-admin role, analogous to Payroll Admin)**, **Pension Sanctioning Authority / Head of Office (checker — new RBAC v1.7 role, P01 approver, SoD-enforced)**, HR Officer/Admin (`hr_admin`), **SR Custodian/Registrar (G12 — new role + capability flag on the SR ledger)**, Payroll Officer (**G10** last-pay & contributions), Department Head / Appointing Authority, **Treasury / Pension Disbursing Authority (PDA) / Bank CPPC (new role + capability flag; integration over X.3)**, Medical Board (invalidation), **Auditor / AG (mapped to Org-Admin read + P05 query entitlement — no parallel write role)**, **Disciplinary Authority (G09, provisional-pension linkage)**, System Administrator (rule tables — mapped to Org Admin / Platform Super Admin). All roles, scoping, SoD and PII ceilings are owned by **RBAC v1.7** and enforced by **P02**; G11 only adds the new roles/flags as ADDITIONS (see §6 and §`Alignment`).

### 1.6 Success Criteria

A retirement case is "successful" when: the separation is recorded with the correct type and date (P01 case flow); **service verification is signed off with the discrepancy ledger closed and every non-qualifying spell reason-code-attested**; no-dues is cleared; qualifying service (including counted prior service) and all benefits — under the correct OPS/NPS/UPS regime, with service gratuity where service <10 yrs, path-specific family pension, and tax/TDS — are computed deterministically against a snapshotted rule version with full trace and sanctioned by an authority distinct from the maker (SoD enforced by P01/P02); the PPO (and where applicable anticipatory **or provisional** pension) is issued before pension commencement; terminal benefits and GPF are settled net of tax; the pensioner is enrolled in the pensioner master; the disbursement instruction passes **pre-credit account verification** and is accepted by the PDA/bank over X.3 under the recorded disbursement model; and a retirement event is appended to **G12** — all with a complete, immutable **P05** audit trail and any audit objection tracked to closure.

---

## 2. Amendments (v1 → v2)

The v2 amendment ledger (21 adopted council improvements R1–R18 + three world-class additions) is **preserved in full** and carried forward unchanged. It is reproduced here for continuity; the platform re-grounding deltas are in the separate **`## Amendments (v2 → v3: platform re-grounding)`** table near the end of this document.

| # | Adopted improvement (risk) | Where incorporated in v2/v3 | How |
|---|---|---|---|
| 1 | Split enhanced family-pension window by path (R1, **Critical**) | §5.2 `family_pension_records`; FR-G11-08; §5.5; §16.7 | IN_SERVICE → 10 yrs no age cap; AFTER_RETIREMENT → 7 yrs / age-67 / would-be-superannuation, whichever earlier; both step-downs tested |
| 2 | Replace proportionate pension; add Service Gratuity (R2, **Critical**) | FR-G11-05, FR-G11-07; §5.5 `gratuity_type`; §16.5 | ≥10 yrs = flat 50%; <10 yrs = no pension, one-time service gratuity |
| 3 | Add UPS + government-NPS death/invalidation defaults (R3, **Critical**) | §5.2 `pension_calculations`; FR-G11-05; §5.5 `pension_scheme` adds UPS; §16.6 | UPS assured payout (~50% of last-12-mo avg) + opt-in flag; CCS-NPS Rules 2021 default |
| 4 | Separate family-members register from nominees (R4, **Critical**) | E26 `family_members`; FR-G11-08; IR8/IR14 | Form 3/14 statutory family register drives family-pension hierarchy; nomination ≠ family-pension eligibility |
| 5 | e-SR completeness & discrepancy-resolution stage (R5, **Critical**) | E27/E28/E29; FR-G11-18; FR-G11-04 gated on it; IR2a | Discrepancy ledger, per-spell reason-code attestation, condonation register, multi-point sign-off |
| 6 | Record paymaster-vs-authoriser model (R6, **Critical**) | E37 `pension_disbursing_authorities`; FR-G11-21; FR-13/14 branch | M11_COMPUTES_FULL vs PDA_APPLIES_RELIEF |
| 7 | Model effective-dated rule-table entities (R7, **Critical**) | E30–E36; FR-G11-19; `rule_version_ref` FK | Real, versioned, effective-dated rows on the platform config cascade |
| 8 | Define PDA/treasury interface contract (R8, High) | FR-G11-21 + §8.6 (now an X.3 payload-versioned contract) | Concrete contract replaces "pluggable" hand-wave |
| 9 | Proactive death-detection & overpayment recovery (R9, High) | E38; FR-G11-20; FR-12 link | Death-registry/Aadhaar-DBT reconciliation over X.3, anomaly detection, recovery-from-estate |
| 10 | Provisional Pension (Rule 9) as first-class (R10, High) | E41; FR-G11-22; `ppo_type` adds PROVISIONAL | Provisional pension + fully-withheld DCRG until proceedings conclude |
| 11 | Disambiguate commutation/restoration timing (R11, High) | E08; FR-G11-06; IR4a | restoration = reduction date + 15 yrs; migrated-unknown-date handling |
| 12 | Tax/TDS on terminal settlement (R12, High) | E11; FR-G11-09; §16.8 | Gratuity ₹20L cap, commutation/leave exemption, TDS, Section 89(1) relief |
| 13 | Deterministic revision-application order (R13, High) | FR-G11-13; §16.9 | pay-commission re-fix → restoration → DA → age increment |
| 14 | Dual family pension & twins/multiple children (R14, Medium) | FR-G11-08; `concurrent_share_pct`; IR14 | Dual FP (with cap) + simultaneous twin/eligible-children shares |
| 15 | Pre-credit bank-account verification (R15, Medium) | E42; FR-G11-14; `ERR-G11-ACCOUNT-VERIFY` | Penny-drop / name-IFSC (NPCI mapper) over X.3 before first credit |
| 16 | Plain-language citizen layer (R16, Medium) | FR-G11-15; §7; §11 | 3-state tracker, outcome-framed estimator, LC calendar, bereavement guide |
| 17 | Reword determinism goal G2 (R17, Low) | §1.3 G2; §9 | "identical given snapshotted rule version + verified inputs" |
| 18 | Structured counted prior service (R18, Medium) | E39; FR-G11-04; §5.5 `prior_service_type` | Ex-servicemen / prior central/state/temporary service |
| 19 | Audit-objection tracking entity (world-class) | E40; FR-G11-23; §12 | AG/internal-audit objections with response/closure workflow, on P05 |
| 20 | Digital-delivery (DigiLocker) for e-PPO (best-in-class) | FR-G11-24; FR-11 link; §8.5 (over X.3) | Push signed e-PPO/revision orders to DigiLocker; link PPO ↔ Aadhaar/PRAN |
| 21 | Auto-revise gratuity ceiling on DA milestones (supports R7) | E33; FR-G11-07; FR-G11-19 | Ceiling steps up 25% each time DA crosses a 50% threshold |

---

## 3. Scope & Boundaries

### 3.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Retirement Forecasting & Due-for-Retirement | G11-F01 | Projected superannuation dates, horizon lists, alerts, workload forecasting (`JOB-G11-FORECAST` on X.1) |
| Separation Case Management | G11-F02 | Initiate/track all separation types with type-specific data & **P01 workflow**; scheme OPS/NPS/UPS |
| Pre-Retirement Processing | G11-F03 | SR verification (G12), no-dues clearance, anticipatory pension, 1–2-year lead pipeline |
| Qualifying Service Computation | G11-F04 | Count service, deduct non-qualifying spells (G03/G04), **add counted prior service**, round per rule |
| Pension Calculation | G11-F05 | Basic pension (OPS flat-rate) / **service gratuity** / **NPS death-default** / **UPS assured payout** |
| Commutation of Pension | G11-F06 | Commuted value, factor by age, residual, **reduction-date-based restoration** timeline |
| Gratuity Computation | G11-F07 | Retirement, death **and service** gratuity; statutory ceiling **auto-stepping on DA milestones** |
| Family & Enhanced Family Pension | G11-F08 | **Path-specific** normal & enhanced family pension from the **family-members register**; dual/twin support |
| Terminal Benefits & Final Settlement | G11-F09 | Leave encashment (G03), composite settlement, recoveries netting, **tax/TDS & 89(1) relief** |
| GPF Final Withdrawal | G11-F10 | GPF final balance, interest, advances adjustment, final authorisation |
| PPO Generation & Digital PPO | G11-F11 | PPO (service/family/anticipatory/**provisional**/revised), e-PPO (DocumentGen), PPO registry |
| Pensioner Master & Lifecycle | G11-F12 | Pensioner record, Jeevan Pramaan/DLC, restoration, family-pension conversion on death |
| Pension Revision | G11-F13 | DA & pay-commission revision under a **deterministic application order** (`JOB-G11-PENSION-RUN`) |
| Treasury / Bank / PDA Integration | G11-F14 | Disbursement instructions over **X.3**, **penny-drop verification**, PPO authorisation transfer, ack reconciliation |
| Retirement Self-Service & Estimators | G11-F15 | **Plain-language** portal (Me workspace), **outcome-framed** estimator/what-if, W.2 form submission |
| Pensioner Grievance Management | G11-F16 | Grievance intake, routing, SLA (P01 SLA timers), resolution |
| Forecasting & Pension-Liability Analytics | G11-F17 | Liability projection, benefit-cost analytics, SLA & ageing dashboards (to G14) |
| Service-Record Completeness & Discrepancy Resolution | G11-F18 | e-SR completeness gate: discrepancy ledger, spell attestation, condonation register, sign-off |
| Effective-Dated Pension Rule-Table Management | G11-F19 | DA, factors, FP rates, gratuity ceilings (auto-step), ages, min/max, rounding — versioned via config cascade |
| Proactive Death Detection & Overpayment Recovery | G11-F20 | Death-registry/DBT reconciliation over X.3 (`JOB-G11-DEATHRECON`), anomaly detection, recovery-from-estate |
| PDA Registry & Disbursement Model | G11-F21 | PDA master, `pda_disbursement_model`, X.3 integration contract, sandbox tie-out |
| Provisional Pension (Rule 9 — Pending Proceedings) | G11-F22 | Provisional pension + fully-withheld DCRG until proceedings conclude |
| Audit Objection Management | G11-F23 | AG/internal-audit objection intake, response, closure, linkage to case & trace (on P05) |
| Digital Delivery & DigiLocker / DBT Linkage | G11-F24 | Push e-PPO/revision orders to DigiLocker over X.3; link PPO ↔ Aadhaar/PRAN |

### 3.2 Common Capabilities (inherited from the PrimeSoft platform)

All G11 features inherit, **by id and not by re-authoring** (`PLATFORM_FOUNDATION.md` §5/§9): UUID PKs + human business keys; **`tenant_id`/`entity_id` on every business table with data-layer scoping (Platform §0.1)**; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency; **cursor pagination only** (`?limit=` default 25/max 100 + `cursor=` → `next_cursor`); **maker-checker via the P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`, in-flight version pinning, SLA/escalation); **RBAC v1.7 + five-dimension row-level scoping enforced by P02**; **immutable P05 dual-log audit (`audit_log` + `security_audit_log`) written by DB trigger on every mutation**; platform **`documents`/DocumentGen** for generated artefacts (PPO, sanction orders, calculation sheets — the G13 vault); **X.2 notifications** referenced by `MSG-*` id; **G12 `service_register_events`** for retirement/separation events (the net-new gov ledger on the P05 substrate); **X.1 job runner** for all scheduled work; **X.3 integration framework** for all external calls with **P04** credentials; **P06** ETL+V for legacy migration; the canonical **`{error:{code,message,field,details}}`** envelope + `X-Correlation-Id` header + the 8-code error table.

### 3.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In G11? | Owner / Note |
|---|---|---|
| Employee master data | Reference only | **G01** (golden source on platform `employees`) |
| Service history / SR ledger | Verify, **reconcile discrepancies** & **write (separation/superannuation events)** | **G12** owns the ledger engine (net-new gov ledger on P05); G11 **consumes** it for the completeness/discrepancy gate (FR-G11-18) **and is the canonical SR writer** for the separation/superannuation/retirement life events, posting via **`POST /api/v1/sr/ingest`** (`source_module="G11"`; §8.7) |
| Last-pay-drawn & contribution history | Consume only | **G10** supplies emoluments base, GPF/NPS contributions |
| Leave encashable balance & LWP/non-qualifying spells | Consume only | **G03** supplies encashable EL balance and leave events; **G04** posts leave events to the SR; G11 computes encashment / deductions |
| Compulsory-retirement penalty order | Consume the order | **G09** adjudicates (P01 due-process flow); G11 processes the resulting separation |
| Pending departmental/judicial proceedings | **Consume status; drive provisional pension** | **G09** supplies proceedings status; G11 issues provisional pension & withholds DCRG (FR-G11-22) |
| Disciplinary recovery against benefits | Consume; net from settlement | **G09** issues recovery; G11 nets within statutory protection |
| Active-employee payroll run | Out | **G10** (G11 begins at separation/retirement) |
| Pension monthly disbursement & **Dearness-Relief application** | Instruction + reconcile over X.3; **DR by G11 or by PDA per model** | PDA/Treasury/Bank disburse; where PDA is a CPPC it applies DR (FR-G11-21 model) |
| Document storage internals | Reference | Platform **`documents`/DocumentGen** (G13 vault) store PPO/sanction/calc-sheet objects |
| Medical fitness adjudication | Consume verdict | Medical Board issues invalidation certificate; G11 records & uses it |
| Income-tax assessment | Compute TDS at source only | G11 computes exemptions/TDS/89(1) on terminal benefits; final assessment is the tax authority's |
| Death-registry / Aadhaar-DBT signals | **Reconcile over X.3** | G11 ingests death/payment signals to detect post-death drawals (FR-G11-20) |
| Workflow / audit / notification / job / migration / RBAC engines | **Consume by id** | **Platform P01/P05/X.2/X.1/P06/P02** — never re-implemented |

### 3.4 Assumptions and Constraints

- Pension/commutation/gratuity rules, DA rates for pensioners, commutation factors by age, family-pension rates, and gratuity ceilings are **first-class, effective-dated rule-table entities** (E30–E36), version-controlled and approved through the **platform configuration cascade** (`platform default → tenant → entity → employee`; Platform §0.3) and effective-dated via the **`VAL-EFFECTIVE` / `JOB-G11-EFFDATE`** staging mechanism (changes staged, not written live; Foundation §1/§3.3). `rule_version_ref` is a **foreign key** to a concrete rule-version row, not free text.
- The OPS/NPS/UPS cutover dates and the UPS opt-in window are configurable config entities; scheme is derived from `employees.date_of_joining` (G01) and recorded contribution history (G10), overridable with justification and **P05-audited** reason. **UPS** applies to opted-in NPS employees from 01-Apr-2025.
- The deployment is **one PrimeSoft tenant** (single government); each department/directorate is an `entity` (Standalone / Group-Company model, Vision §1.4). The data model is **tenant- and entity-aware** (`tenant_id`/`entity_id` non-nullable; scoping at the data layer).
- All money math uses fixed-point decimal (`NUMERIC`); rounding rules per statutory prescription are explicit and configurable via E36 (`rounding_rules`).
- "Emoluments" / "average emoluments" base and the reckonable period are configurable policy parameters resolved per case and snapshotted. **UPS** uses the last-12-month average pay base.
- Digital Life Certificate integrates with a Jeevan Pramaan-style service **over X.3**; manual life-certificate capture (physical/video-KYC/bank-certified) is always available as a fallback.
- The **disbursement model is explicit per PDA** (FR-G11-21): some PDAs are paid an exact computed amount (M11_COMPUTES_FULL); CPPC banks are sent the basic + relief formula and apply DR themselves (PDA_APPLIES_RELIEF). Determinism and batch sizing branch on this; both run over **X.3**.
- Determinism is guaranteed **only after** the service-verification record is signed off (FR-G11-18) and against the snapshotted rule version; external NPS-CRA/UPS-annuity figures are indicative and excluded.

---

## 4. Platform Foundation Adopted (replaces v2 §4 "Shared Application Foundation")

G11 does **not** re-author technical defaults. It adopts the PrimeSoft platform contracts verbatim (`PLATFORM_FOUNDATION.md`):

- **Multi-tenancy & scoping (Platform §0.1):** every G11 table carries non-nullable `tenant_id` and (entity-scoped) `entity_id`; all access is scoped at the persistence layer; an unscoped query is **rejected, not defaulted to "all"**. Cross-entity reach is Org-Admin-only as a widened filter; cross-tenant reach is Platform-Super-Admin-only.
- **Authentication & session (Platform §0.2; RBAC):** bearer JWT carries resolved roles + tenant/entity scope; permissions resolved per request by **P02**. **MFA enforced** for the high-privilege statutory roles (Pension Officer, Sanctioning Authority, PDA, SR Custodian) per `PLATFORM_FOUNDATION.md` §3.1.
- **API conventions (Foundation §1):** `/api/v1`; **`Idempotency-Key`** on every transaction-creating POST (24h replay returns the original result); **cursor pagination only**; **`X-Correlation-Id`** echoed and written to every audit/log line; effective-dated mutations accept `effective_from` and are staged.
- **Canonical error envelope + 8-code table (Foundation §1):** `{ "error": { "code", "message", "field", "details" } }`; codes `VALIDATION_FAILED (422)`, `UNAUTHENTICATED (401)`, `FORBIDDEN (403)`, `NOT_FOUND (404)`, `CONFLICT (409)`, `PRECONDITION_FAILED (412)`, `RATE_LIMITED (429)`, `INTERNAL (500)`. Domain conditions are conveyed as a `details.reason`/`ERR-G11-*` id under one of these codes (see §8.3).
- **Money type:** `NUMERIC(15,2)` for benefit amounts; rates/factors `NUMERIC(9,4)`; service durations integer Y/M/D; no floating point.
- **Computation determinism (restated):** every benefit engine is a pure function of (**signed-off** verified service record, emoluments snapshot from G10, scheme, **rule-version rows** effective on the relevant date, beneficiary/family data). Same inputs → same outputs **given the snapshotted rule version**; a `calc_trace` (JSONB) is persisted with each calculation.
- **Input-provenance gate:** no benefit engine runs until the case has a `service_verifications` row in `SIGNED_OFF`/`LOCKED` status with its discrepancy ledger closed and every spell attested (FR-G11-18).
- **Immutability (via P05):** a sanctioned calculation and its issued PPO are append-only snapshots; the **P05 DB-trigger** captures every mutation immutably (`audit_log` grants no UPDATE/DELETE; the only permitted mutation is a DPDPA right-to-erasure redaction marker). Corrections create a new revision linked to the original — **no silent edit is possible because the audit trigger cannot be bypassed**.
- **Transactionality:** sanction, PPO issue, family-pension conversion, revision-apply, and death-conversion each commit as all-or-nothing transactions; multi-step settlement writes use transactions.
- **Encryption & PII (RBAC §3.9 / P02):** bank account numbers, PAN/national_id/Aadhaar/PRAN, nominee/family details and benefit amounts are Tier-1/Tier-2 PII/financial — encrypted at rest, **masked on serialization by P02** (an over-broad query cannot leak a masked field), access logged. The **PII Protection Ceiling overrides everything upward**. Death-registry/DBT reconciliation data is processed under DPDP purpose-limitation.
- **NFR baseline (`PLATFORM_FOUNDATION.md` §8.2 — overrides the invented v2 NFR):** Standard API p95 < 500 ms @ 300 concurrent; read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; **uptime 99.5%/month** (not 99.9%); **RTO < 4 h, RPO < 1 h** (not 15 min); 100% audit capture; WCAG 2.1 AA; soft-delete only.
- **Determinism contract for concurrent events:** when multiple pensioner events share an effective date, the engine applies them in the mandatory order of §16.9.

---

## 5. Holistic Data Model

Every G11-owned entity below additionally carries **`tenant_id` (non-nullable)** and **`entity_id` (entity-scoped)** plus the platform audit fields (`created_at/updated_at/created_by/updated_by/is_deleted`); the **P05 DB trigger** writes an immutable `audit_log` row on every INSERT/UPDATE/soft-DELETE. These are not repeated in every field table — they are universal per `PLATFORM_FOUNDATION.md` §2/§5.

### 5.1 Entity Inventory

| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| E01 | `employees` | Platform/G01 | G01 | Employee master (referenced) |
| E02 | `org_units` | Platform | Platform | Org hierarchy (referenced) |
| E03 | `service_register_events` | **G12 (net-new gov ledger on P05)** | G12 | Service ledger (verified/read; retirement events appended) |
| E04 | `pen_separation_cases` | G11 | G11 | Master case for a separation/retirement of all types |
| E05 | `pen_qualifying_service_records` | G11 | G11 | Computed qualifying service per case |
| E06 | `pen_non_qualifying_spells` | G11 | G11 | Per-spell non-qualifying periods deducted |
| E07 | `pen_pension_calculations` | G11 | G11 | Basic/service-gratuity/NPS-default/UPS computation snapshot |
| E08 | `pen_commutation_records` | G11 | G11 | Commuted value, factor, residual, restoration schedule |
| E09 | `pen_gratuity_calculations` | G11 | G11 | Retirement/death/service gratuity with ceiling |
| E10 | `pen_family_pension_records` | G11 | G11 | Family pension entitlement, path-specific rates |
| E11 | `pen_terminal_settlements` | G11 | G11 | Composite final settlement incl. leave encashment, recoveries & tax |
| E12 | `pen_gpf_final_settlements` | G11 | G11 | GPF final balance, interest, advances, authorisation |
| E13 | `pen_ppo_records` | G11 | G11 | Pension Payment Order header + registry + e-PPO |
| E14 | `pen_pensioners` | G11 | G11 | Pensioner master & lifecycle status |
| E15 | `pen_life_certificates` | G11 | G11 | Annual life certificate / DLC records |
| E16 | `pen_revisions` | G11 | G11 | DA / pay-commission revision batches & per-pensioner deltas |
| E17 | `pen_disbursements` | G11 | G11 | Disbursement instruction batches/lines & PDA acknowledgement |
| E18 | `pen_retirement_forecasts` | G11 | G11 | Materialised due-for-retirement projections |
| E19 | `pen_grievances` | G11 | G11 | Pensioner/family grievance tickets with SLA |
| E20 | `pen_benefit_estimates` | G11 | G11 | Self-service / what-if estimation snapshots (non-binding) |
| E21 | `pen_nominees_beneficiaries` | G11 | G11 | Nominee register for **gratuity, GPF, leave encashment** (NOT family pension) |
| E26 | `pen_family_members` | G11 | G11 | **Statutory family register (Form 3/14)** driving family-pension eligibility |
| E27 | `pen_service_verifications` | G11 | G11 | e-SR completeness/sign-off record gating CALCULATION |
| E28 | `pen_service_discrepancies` | G11 | G11 | Discrepancy-ledger lines |
| E29 | `pen_condonation_orders` | G11 | G11 | Condonation register (orders, not free text) |
| E30 | `pen_da_relief_rates` | G11 | G11 | Effective-dated Dearness Relief % rule table |
| E31 | `pen_commutation_factors` | G11 | G11 | Commutation factor by age-next-birthday, effective-dated |
| E32 | `pen_family_pension_rates` | G11 | G11 | Normal/enhanced family-pension rate rule table |
| E33 | `pen_gratuity_ceilings` | G11 | G11 | Gratuity statutory ceiling with DA-linked auto-step |
| E34 | `pen_retirement_age_rules` | G11 | G11 | Superannuation age by cadre/category, effective-dated |
| E35 | `pen_pension_limit_rules` | G11 | G11 | Min/max pension & service-thresholds rule table |
| E36 | `pen_rounding_rules` | G11 | G11 | Half-year & money rounding rules, effective-dated |
| E37 | `pen_disbursing_authorities` | G11 | G11 | PDA registry with `pda_disbursement_model` & X.3 integration config |
| E38 | `pen_overpayment_recoveries` | G11 | G11 | Post-death/other overpayment identification & recovery |
| E39 | `pen_prior_service_records` | G11 | G11 | Structured counted prior/military service |
| E40 | `pen_audit_objections` | G11 | G11 | AG/internal-audit objections with response/closure |
| E41 | `pen_provisional_pension_records` | G11 | G11 | Rule-9 provisional pension with withheld DCRG |
| E42 | `pen_bank_account_verifications` | G11 | G11 | Penny-drop / name-IFSC pre-credit verification results |
| — | `audit_log` / `security_audit_log` | **Platform P05** | Platform | Immutable dual audit log (written by DB trigger) |
| — | `documents` | **Platform / G13** | Platform | PPO/sanction/calc-sheet object metadata (referenced) |
| — | `notifications` | **Platform X.2** | Platform | Outbound events (written via X.2/W.3) |
| — | `workflows` / `workflow_instances` / `workflow_actions` | **Platform P01** | Platform | Approvals (used; **not** a custom `workflow_tasks`) |
| — | `integration_credentials` | **Platform P04** | Platform | Encrypted credentials for treasury/PDA/DigiLocker/DBT (used by X.3) |
| — | `migration_runs` | **Platform P06** | Platform | Migration ledger for legacy pensioner/pension data |

**G11-owned entity count: 34** (E04–E21 = 18; E26–E42 = 16). Platform/other-module referenced: E01–E03 and all P0x/X.x platform tables — **G11 does not define `audit_log`, `workflow_instances`, `service_register_events`, `notifications`, or `integration_credentials`**; it consumes them (`MODULE_RECONCILIATION.md` §C/§D).

### 5.2 Full Field Tables (G11-owned entities)

Carried-forward entities E04–E21 retain their v2 field tables; the changed ones are reproduced with new/changed fields marked. New entities E26–E42 are given full field tables. **Note:** entity table names are prefixed `pen_` to avoid collision in the shared platform schema; v2 logical names are retained in prose.

#### E04 `pen_separation_cases` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `case_id` | UUID PK | N | |
| `case_no` | TEXT unique | N | human key e.g. `PEN-2026-000123` |
| `tenant_id` / `entity_id` | UUID | N | **(platform)** data-layer scope |
| `employee_id` | UUID FK→employees (G01) | N | subject |
| `separation_type` | ENUM | N | SUPERANNUATION, VOLUNTARY_RETIREMENT, COMPULSORY_RETIREMENT, INVALIDATION, DEATH_IN_SERVICE, RESIGNATION |
| `pension_scheme` | ENUM | N | OPS, NPS, UPS (derived, overridable w/ P05-audited reason) |
| `ups_opted_in` | BOOL | N | UPS opt-in flag (NPS-eligible cohort) |
| `retirement_date` | DATE | N | cessation of service |
| `pension_commence_date` | DATE | Y | day after retirement (or per rule) |
| `reason_ref` | TEXT | Y | G09 order id / VRS application id / medical board ref / death report ref |
| `proceedings_pending` | BOOL | N | pending G09 proceedings at retirement (Rule 9 → provisional) |
| `proceedings_ref` | TEXT | Y | **G09** proceedings id |
| `notice_date` | DATE | Y | VRS notice / order date |
| `initiated_by_role` | ENUM | N | SELF, HR, SYSTEM_FORECAST, DISCIPLINARY_G09 |
| `workflow_instance_id` | UUID FK→workflow_instances (**P01**) | Y | the case approval instance on P01 |
| `service_verification_id` | UUID FK→pen_service_verifications | Y | signed-off e-SR completeness record |
| `sr_verification_id` | UUID FK→pen_qualifying_service_records | Y | verified service |
| `no_dues_status` | ENUM | N | NOT_STARTED, IN_PROGRESS, CLEARED, BLOCKED |
| `anticipatory_pension_flag` | BOOL | N | anticipatory pension authorised |
| `provisional_pension_flag` | BOOL | N | provisional pension authorised (Rule 9) |
| `pda_id` | UUID FK→pen_disbursing_authorities | Y | bound PDA (carries disbursement model) |
| `status` | ENUM | N | DRAFT, INITIATED, SR_VERIFICATION, NO_DUES, CALCULATION, PENDING_SANCTION, SANCTIONED, PPO_ISSUED, SETTLED, CLOSED, ON_HOLD, REJECTED |
| `org_unit_id` | UUID FK→org_units | N | scope |
| audit fields | — | — | **(platform)** + P05 trigger capture |

#### E05 `pen_qualifying_service_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `qsr_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `service_start_date` | DATE | N | date of joining (reckonable) |
| `service_end_date` | DATE | N | retirement/death date |
| `gross_service_y/m/d` | INT | N | gross years/months/days |
| `non_qualifying_days` | INT | N | total deducted days (sum of uncondoned spells) |
| `prior_service_days` | INT | N | total counted prior/military service added (from E39) |
| `net_qualifying_y/m/d` | INT | N | net qualifying after deduction and prior-service addition |
| `reckonable_half_years` | INT | N | rounded half-years (per E36) |
| `weightage_years` | INT | Y | VRS weightage — distinct from prior service |
| `meets_min_pension_service` | BOOL | N | true if net qualifying ≥ E35 threshold; false ⇒ service gratuity only |
| `sr_verified` | BOOL | N | G12 gap-free verification complete |
| `sr_verified_by` | UUID FK→users | Y | SR Custodian (G12 role) |
| `sr_verified_at` | TIMESTAMP | Y | |
| `verification_notes` | TEXT | Y | detail lives in E27–E29 |
| `status` | ENUM | N | DRAFT, VERIFIED, LOCKED |

#### E07 `pen_pension_calculations` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `pension_calc_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `scheme` | ENUM | N | OPS, NPS, UPS |
| `benefit_outcome` | ENUM | N | FULL_PENSION, SERVICE_GRATUITY_ONLY, NPS_DEFAULT_FAMILY, NPS_DEFAULT_INVALID, UPS_ASSURED, NPS_INDICATIVE |
| `emoluments_base` | NUMERIC(15,2) | Y | last-drawn or average emoluments (from **G10**) |
| `emoluments_method` | ENUM | Y | LAST_DRAWN, AVG_10_MONTH, BENEFICIAL_OF_BOTH, AVG_12_MONTH (UPS) |
| `avg_emoluments` | NUMERIC(15,2) | Y | averaging base if used |
| `qualifying_half_years` | INT | Y | from QSR |
| `pension_fraction` | NUMERIC(9,4) | Y | flat 0.50 for ≥10 yrs (proportionate deprecated; §16.5) |
| `basic_pension` | NUMERIC(15,2) | Y | monthly basic pension (OPS) |
| `minimum_pension_applied` | BOOL | N | floored to statutory minimum (E35) |
| `maximum_pension_cap_applied` | BOOL | N | capped to statutory maximum (E35) |
| `ups_assured_payout` | NUMERIC(15,2) | Y | ~50% of last-12-month average pay (UPS) |
| `ups_min_guarantee_applied` | BOOL | N | UPS minimum guarantee applied |
| `nps_default_benefit_amount` | NUMERIC(15,2) | Y | OPS-equivalent family/invalid pension under CCS-NPS Rules 2021 |
| `nps_corpus_ref` | TEXT | Y | NPS PRAN / corpus ref (from CRA over X.3) |
| `nps_annuity_estimate` | NUMERIC(15,2) | Y | indicative annuity (excluded from determinism) |
| `nps_lumpsum_estimate` | NUMERIC(15,2) | Y | indicative withdrawal |
| `calc_trace` | JSONB | N | step-by-step derivation |
| `rule_version_ref` | UUID FK→rule-version row | N | effective rule snapshot (FK) |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, SUPERSEDED |

#### E08 `pen_commutation_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `commutation_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `pension_calc_id` | UUID FK→pen_pension_calculations | N | |
| `opted` | BOOL | N | employee opted to commute |
| `commuted_fraction` | NUMERIC(9,4) | Y | ≤ statutory max (e.g. 0.40) |
| `commuted_pension_amount` | NUMERIC(15,2) | Y | monthly pension portion commuted |
| `age_next_birthday` | INT | Y | for factor lookup |
| `commutation_factor` | NUMERIC(9,4) | Y | resolved from E31 by age |
| `commutation_factor_ref` | UUID FK→pen_commutation_factors | Y | exact factor row used |
| `commuted_value` | NUMERIC(15,2) | Y | lump sum = commuted×factor×12 |
| `residual_pension` | NUMERIC(15,2) | Y | basic − commuted portion |
| `commutation_payment_date` | DATE | Y | date commuted value is paid |
| `reduction_effective_date` | DATE | Y | date monthly pension is reduced (= payment date per rule) |
| `restoration_due_date` | DATE | Y | = `reduction_effective_date` + statutory period (15 yrs) |
| `migrated_date_unknown` | BOOL | N | migrated pensioner unknown dates → manual restoration review |
| `restored` | BOOL | N | restoration applied (`JOB-G11-RESTORE`) |
| `restored_on` | DATE | Y | |
| `calc_trace` | JSONB | Y | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, RESTORED, SUPERSEDED |

#### E09 `pen_gratuity_calculations` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `gratuity_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `gratuity_type` | ENUM | N | RETIREMENT_GRATUITY, DEATH_GRATUITY, SERVICE_GRATUITY |
| `emoluments_base` | NUMERIC(15,2) | N | basic+DA at relevant date (from G10) |
| `qualifying_half_years` | INT | N | capped per rule (e.g. max 66) |
| `service_slab_factor` | NUMERIC(9,4) | Y | death-gratuity slab multiplier |
| `service_gratuity_months` | NUMERIC(9,4) | Y | service-gratuity multiplier (<10 yrs) |
| `computed_amount` | NUMERIC(15,2) | N | before ceiling |
| `statutory_ceiling` | NUMERIC(15,2) | N | resolved from E33 (incl. DA auto-step) |
| `ceiling_ref` | UUID FK→pen_gratuity_ceilings | Y | exact ceiling row used |
| `ceiling_applied` | BOOL | N | |
| `payable_amount` | NUMERIC(15,2) | N | min(computed, ceiling); service gratuity has no DCRG ceiling |
| `withheld_amount` | NUMERIC(15,2) | Y | withheld pending no-dues or Rule-9 proceedings (fully withheld) |
| `nominee_split` | JSONB | Y | beneficiary apportionment (death gratuity) — from E21 |
| `calc_trace` | JSONB | N | |
| `rule_version_ref` | UUID FK→rule-version row | N | FK |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, WITHHELD_PROCEEDINGS, SUPERSEDED |

#### E10 `pen_family_pension_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `fp_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | Y | from death-in-service or conversion |
| `source_pensioner_id` | UUID FK→pen_pensioners | Y | when converted on pensioner death |
| `employee_id` | UUID FK→employees | N | original employee |
| `enhanced_basis` | ENUM | N | IN_SERVICE \| AFTER_RETIREMENT — drives the window rule |
| `emoluments_base` | NUMERIC(15,2) | N | base for family pension |
| `normal_rate_pct` | NUMERIC(9,4) | N | e.g. 0.30 (from E32) |
| `enhanced_rate_pct` | NUMERIC(9,4) | Y | e.g. 0.50 (from E32) |
| `normal_amount` | NUMERIC(15,2) | N | monthly normal family pension |
| `enhanced_amount` | NUMERIC(15,2) | Y | monthly enhanced family pension |
| `enhanced_from` | DATE | Y | enhanced period start |
| `enhanced_to` | DATE | Y | per `enhanced_basis`: IN_SERVICE = +10 yrs no age cap; AFTER_RETIREMENT = min(+7 yrs, age-67/would-be-superannuation) |
| `enhanced_window_rule` | TEXT | N | which window rule was applied (audit) |
| `current_family_member_id` | UUID FK→pen_family_members | Y | active recipient (E26, not nominees) |
| `beneficiary_hierarchy` | JSONB | Y | ordered eligible-family chain snapshot from E26 |
| `dual_family_pension` | BOOL | N | both spouses govt servants → two family pensions (with cap) |
| `dual_cap_applied` | BOOL | N | statutory dual-FP cap applied |
| `eligibility_review_date` | DATE | Y | next review |
| `calc_trace` | JSONB | N | |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, ACTIVE, TRANSFERRED, CEASED, SUPERSEDED |

#### E11 `pen_terminal_settlements` (changed — tax)

| Field | Type | Null | Notes |
|---|---|---|---|
| `settlement_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `leave_encashment_days` | INT | Y | encashable EL days (from **G03**) |
| `leave_encashment_amount` | NUMERIC(15,2) | Y | computed encashment |
| `gratuity_ref` | UUID FK→pen_gratuity_calculations | Y | |
| `gpf_settlement_ref` | UUID FK→pen_gpf_final_settlements | Y | |
| `commuted_value_ref` | UUID FK→pen_commutation_records | Y | |
| `other_dues` | JSONB | Y | group insurance, deposit-linked insurance, etc. |
| `recoveries_total` | NUMERIC(15,2) | Y | G09/overpayment/loan recoveries netted |
| `recovery_refs` | JSONB | Y | links to recovery orders (G09/E38/G10) |
| `gross_settlement` | NUMERIC(18,2) | N | sum of components |
| `gratuity_exempt_amount` | NUMERIC(15,2) | Y | exempt up to ₹20L cap |
| `gratuity_taxable_amount` | NUMERIC(15,2) | Y | excess over exemption |
| `commutation_exempt_amount` | NUMERIC(15,2) | Y | commuted-pension exemption |
| `leave_encashment_exempt_amount` | NUMERIC(15,2) | Y | leave-encashment exemption |
| `taxable_total` | NUMERIC(18,2) | Y | net taxable across components |
| `tds_amount` | NUMERIC(15,2) | Y | TDS deducted at source |
| `section_89_relief` | NUMERIC(15,2) | Y | Section 89(1) relief on arrears |
| `tax_breakdown` | JSONB | Y | per-component exempt/taxable/TDS lines + rule refs |
| `net_settlement` | NUMERIC(18,2) | N | gross − recoveries − TDS |
| `status` | ENUM | N | DRAFT, COMPUTED, SANCTIONED, PAID, PARTIALLY_WITHHELD, SUPERSEDED |

#### E13 `pen_ppo_records` (changed)

| Field | Type | Null | Notes |
|---|---|---|---|
| `ppo_id` | UUID PK | N | |
| `ppo_no` | TEXT unique | N | statutory PPO number (registry-issued) |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `pensioner_id` | UUID FK→pen_pensioners | Y | set on enrolment |
| `ppo_type` | ENUM | N | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, PROVISIONAL, REVISED |
| `pension_calc_ref` | UUID FK→pen_pension_calculations | Y | |
| `family_pension_ref` | UUID FK→pen_family_pension_records | Y | |
| `provisional_ref` | UUID FK→pen_provisional_pension_records | Y | for PROVISIONAL PPOs |
| `basic_pension` | NUMERIC(15,2) | Y | sanctioned basic |
| `relief_formula_ref` | UUID FK→pen_da_relief_rates | Y | relief formula for PDA_APPLIES_RELIEF |
| `commuted_portion` | NUMERIC(15,2) | Y | |
| `residual_pension` | NUMERIC(15,2) | Y | |
| `pda_id` | UUID FK→pen_disbursing_authorities | Y | PDA (carries model) |
| `effective_from` | DATE | N | pension commencement |
| `e_ppo_document_id` | UUID FK→documents (**platform/G13**) | Y | digital PPO artefact (DocumentGen) |
| `digilocker_pushed` | BOOL | N | e-PPO delivered to DigiLocker (over X.3) |
| `digilocker_ref` | TEXT | Y | DigiLocker issued-document URI |
| `authorised_by` | UUID FK→users | Y | sanctioning authority |
| `authorised_at` | TIMESTAMP | Y | |
| `supersedes_ppo_id` | UUID FK→pen_ppo_records | Y | for REVISED/final-over-provisional PPOs |
| `status` | ENUM | N | DRAFT, ISSUED, AUTHORISED_TO_PDA, ACTIVE, SUPERSEDED, CANCELLED |

#### E14 `pen_pensioners` (changed)

Carries v2 fields plus: `aadhaar_masked` TEXT Y (encrypted, masked by P02; for DBT/death reconciliation), `pran` TEXT Y (NPS/UPS linkage), `disbursement_model` ENUM N (denormalised from PDA) M11_COMPUTES_FULL\|PDA_APPLIES_RELIEF, `death_detected_source` ENUM Y REPORTED\|DEATH_REGISTRY\|DBT_ANOMALY\|LC_FAILURE, `overpayment_open` BOOL N. All other v2 fields unchanged; `tenant_id`/`entity_id` + audit fields per platform.

#### E26 `pen_family_members` (new — statutory family register, Form 3/14)

| Field | Type | Null | Notes |
|---|---|---|---|
| `family_member_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | the government servant |
| `name` | TEXT | N | |
| `relationship` | ENUM | N | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, DISABLED_CHILD, WIDOWED_DAUGHTER, DEPENDENT_SIBLING, OTHER |
| `dob` | DATE | Y | minority/majority, age-25 cutoff (`VAL-DOB`) |
| `is_disabled_dependent` | BOOL | N | lifelong family pension eligibility |
| `is_minor` | BOOL | N | computed |
| `marital_status` | ENUM | Y | UNMARRIED, MARRIED, WIDOWED, DIVORCED |
| `is_govt_servant` | BOOL | N | for dual-family-pension determination |
| `statutory_rank` | INT | N | rule-defined family-pension priority |
| `concurrent_share_pct` | NUMERIC(9,4) | Y | twins/multiple eligible children drawing simultaneously |
| `eligibility_status` | ENUM | N | ELIGIBLE, NOT_YET_ELIGIBLE, CEASED, UNDER_REVIEW |
| `cessation_reason` | ENUM | Y | MAJORITY, MARRIAGE, EMPLOYMENT, INCOME_THRESHOLD, DEATH, REMARRIAGE_NA |
| `form_ref` | TEXT | Y | Form 3/14 document reference (platform `documents`/G13) |
| `valid_from` / `valid_to` | DATE | Y | |
| `status` | ENUM | N | ACTIVE, SUPERSEDED, REMOVED |

#### E27 `pen_service_verifications` (new — e-SR completeness gate)

| Field | Type | Null | Notes |
|---|---|---|---|
| `verification_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `coverage_from` / `coverage_to` | DATE | N | service span under verification |
| `gap_count` | INT | N | open gaps detected (vs G12 ledger) |
| `discrepancy_open_count` | INT | N | unresolved ledger lines |
| `spells_attested_count` | INT | N | non-qualifying spells reason-code-attested |
| `spells_total_count` | INT | N | total spells requiring attestation |
| `sr_custodian_signoff_by` | UUID FK→users | Y | **G12** custodian |
| `payroll_signoff_by` | UUID FK→users | Y | **G10** officer (emoluments/contributions provenance) |
| `pension_officer_signoff_by` | UUID FK→users | Y | maker attestation |
| `signoff_workflow_instance_id` | UUID FK→workflow_instances (**P01**) | Y | the three-point sign-off runs as a P01 PARALLEL_ALL_OF flow |
| `signoff_complete` | BOOL | N | all required sign-offs present |
| `status` | ENUM | N | DRAFT, DISCREPANCIES_OPEN, ATTESTED, SIGNED_OFF, LOCKED |

#### E28 `pen_service_discrepancies` (new — discrepancy ledger)

| Field | Type | Null | Notes |
|---|---|---|---|
| `discrepancy_id` | UUID PK | N | |
| `verification_id` | UUID FK→pen_service_verifications | N | |
| `discrepancy_type` | ENUM | N | SERVICE_GAP, MISSING_REASON_CODE, SUSPENSION_UNREGULARISED, OVERLAPPING_SPELL, MISSING_ORDER, PAY_ANOMALY, PRIOR_SERVICE_UNVERIFIED, OTHER |
| `period_from` / `period_to` | DATE | Y | |
| `source_module` | ENUM | Y | G03, G04, G09, G10, G12, MANUAL |
| `source_ref` | TEXT | Y | event/order id |
| `description` | TEXT | N | |
| `resolution_action` | ENUM | Y | REASON_CODE_ATTESTED, CONDONED, REGULARISED, WAIVED, CORRECTED_IN_SOURCE, ESCALATED |
| `condonation_order_id` | UUID FK→pen_condonation_orders | Y | when resolved by condonation |
| `resolved_by` | UUID FK→users | Y | |
| `resolved_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | OPEN, RESOLVED, CONDONED, WAIVED, ESCALATED |

#### E29 `pen_condonation_orders` (new — condonation register)

| Field | Type | Null | Notes |
|---|---|---|---|
| `condonation_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→pen_separation_cases | Y | |
| `order_no` | TEXT unique | N | authorising order number |
| `order_date` | DATE | N | |
| `authority` | TEXT | N | sanctioning authority of the condonation |
| `condonation_type` | ENUM | N | BREAK_IN_SERVICE, DEFICIENCY_IN_QUALIFYING_SERVICE, EOL_TREATED_QUALIFYING, OTHER |
| `period_from` / `period_to` | DATE | Y | |
| `condoned_days` | INT | N | days made qualifying |
| `document_id` | UUID FK→documents (platform/G13) | Y | scanned order |
| `status` | ENUM | N | VALID, REVOKED |

#### E30–E36 rule tables (new — effective-dated via the platform config cascade)

These are **config entities** managed through `platform default → tenant → entity → employee` cascade (Platform §0.3), effective-dated via `VAL-EFFECTIVE` and applied by **`JOB-G11-EFFDATE`** (staged, not live), versioned with `DRAFT→APPROVED→EFFECTIVE→SUPERSEDED`, and SoD-approved (maintainer ≠ approver, enforced by P01/P02). Field tables (unchanged from v2):

- **E30 `pen_da_relief_rates`:** `da_rate_id` PK, `effective_from`/`effective_to`, `applies_to` (PENSIONER), `da_percent` NUMERIC(9,4), `pay_commission_basis`, `version_no`, `status`, `approved_by`/`approved_at`.
- **E31 `pen_commutation_factors`:** `factor_id` PK, `effective_from`/`effective_to`, `age_next_birthday` INT, `factor` NUMERIC(9,4), `version_no`, `status`.
- **E32 `pen_family_pension_rates`:** `fp_rate_id` PK, `effective_from`/`effective_to`, `normal_rate_pct`, `enhanced_rate_pct`, `enhanced_in_service_years` (10), `enhanced_after_retire_years` (7), `enhanced_after_retire_age_cap` (67), `dual_fp_cap_amount`, `version_no`, `status`.
- **E33 `pen_gratuity_ceilings`:** `ceiling_id` PK, `effective_from`/`effective_to`, `base_ceiling`, `da_threshold_pct`, `auto_step_pct` (0.25), `current_effective_ceiling`, `da_rate_ref` FK→E30, `version_no`, `status`. Ceiling auto-steps +25% per 50% DA threshold crossed.
- **E34 `pen_retirement_age_rules`:** `age_rule_id` PK, `effective_from`/`effective_to`, `cadre`, `category`, `superannuation_age` INT, `version_no`, `status`.
- **E35 `pen_pension_limit_rules`:** `limit_id` PK, `effective_from`/`effective_to`, `min_pension`, `max_pension`, `min_qualifying_years_for_pension` (10), `min_qualifying_years_for_full` (10), `ups_min_guarantee`, `version_no`, `status`.
- **E36 `pen_rounding_rules`:** `rounding_id` PK, `effective_from`/`effective_to`, `half_year_threshold_months`, `money_rounding` ENUM (NEXT_HIGHER_RUPEE, NEAREST_RUPEE), `qualifying_service_cap_half_years`, `version_no`, `status`.

#### E37 `pen_disbursing_authorities` (new — PDA registry & X.3 model)

| Field | Type | Null | Notes |
|---|---|---|---|
| `pda_id` | UUID PK | N | |
| `pda_code` | TEXT unique | N | human key |
| `pda_name` | TEXT | N | |
| `pda_type` | ENUM | N | TREASURY, BANK_CPPC, POST_OFFICE |
| `pda_disbursement_model` | ENUM | N | M11_COMPUTES_FULL \| PDA_APPLIES_RELIEF |
| `interface_type` | ENUM | N | FILE_SFTP, REST_API (both run on **X.3**) |
| `integration_credential_ref` | TEXT | Y | **P04 `integration_credentials`** id (encrypted) — never inline secrets |
| `payload_contract_version` | TEXT | Y | X.3 payload version (§8.6) |
| `ack_schema_ref` | TEXT | Y | §8.6 ack schema version |
| `penny_drop_supported` | BOOL | N | account-verification capability |
| `sandbox_certified` | BOOL | N | X.3 sandbox tie-out completed (§13) |
| `status` | ENUM | N | ACTIVE, SUSPENDED, RETIRED |

#### E38 `pen_overpayment_recoveries` (new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `overpayment_id` | UUID PK | N | |
| `pensioner_id` | UUID FK→pen_pensioners | N | |
| `trigger` | ENUM | N | POST_DEATH_DRAWAL, LATE_DEATH_REPORT, REVISION_EXCESS, ANTICIPATORY_EXCESS, DBT_ANOMALY, OTHER |
| `detected_via` | ENUM | N | DEATH_REGISTRY, AADHAAR_DBT, LC_FAILURE, MANUAL, ANOMALY_JOB |
| `period_from` / `period_to` | DATE | Y | over-drawn period |
| `overpaid_amount` | NUMERIC(15,2) | N | |
| `recovered_amount` | NUMERIC(15,2) | Y | |
| `recovery_mode` | ENUM | Y | FROM_FAMILY_PENSION, FROM_ESTATE, FROM_LEGAL_HEIR, WRITE_OFF |
| `legal_heir_ref` | TEXT | Y | |
| `status` | ENUM | N | IDENTIFIED, NOTIFIED, UNDER_RECOVERY, RECOVERED, WRITTEN_OFF, LEGAL |

#### E39 `pen_prior_service_records` (new — counted prior/military service)

| Field | Type | Null | Notes |
|---|---|---|---|
| `prior_service_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→pen_separation_cases | Y | |
| `prior_service_type` | ENUM | N | MILITARY, PRIOR_CENTRAL, PRIOR_STATE, PRIOR_TEMPORARY, AUTONOMOUS_BODY |
| `from_date` / `to_date` | DATE | N | prior service span |
| `counted_days` | INT | N | days counted toward qualifying service |
| `pro_forma_ref` | TEXT | Y | pro-forma/verification order reference |
| `pension_already_drawn` | BOOL | N | exclusion/condition |
| `verified` | BOOL | N | |
| `verified_by` | UUID FK→users | Y | |
| `status` | ENUM | N | DRAFT, VERIFIED, COUNTED, REJECTED |

#### E40 `pen_audit_objections` (new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `objection_id` | UUID PK | N | |
| `objection_no` | TEXT unique | N | human key |
| `source` | ENUM | N | AG_AUDIT, INTERNAL_AUDIT, TREASURY, SELF_DETECTED |
| `case_id` | UUID FK→pen_separation_cases | Y | |
| `ppo_id` | UUID FK→pen_ppo_records | Y | |
| `pensioner_id` | UUID FK→pen_pensioners | Y | |
| `calc_trace_ref` | TEXT | Y | linkage to the disputed `calc_trace` |
| `objection_text` | TEXT | N | |
| `raised_on` | DATE | N | |
| `sla_due_at` | TIMESTAMP | Y | P01 SLA timer |
| `response_text` | TEXT | Y | |
| `outcome` | ENUM | Y | ACCEPTED_CORRECTED, DROPPED, RECOVERY_RAISED, SETTLED |
| `linked_revision_id` | UUID FK→pen_revisions | Y | correction issued |
| `status` | ENUM | N | RAISED, UNDER_RESPONSE, RESPONDED, ACCEPTED, DROPPED, CLOSED |

#### E41 `pen_provisional_pension_records` (new — Rule 9)

| Field | Type | Null | Notes |
|---|---|---|---|
| `provisional_id` | UUID PK | N | |
| `case_id` | UUID FK→pen_separation_cases | N | |
| `proceedings_ref` | TEXT | N | **G09** departmental/judicial proceedings id |
| `proceedings_type` | ENUM | N | DEPARTMENTAL, JUDICIAL |
| `provisional_pension_amount` | NUMERIC(15,2) | N | provisional monthly pension |
| `dcrg_withheld` | BOOL | N | DCRG fully withheld (true until conclusion) |
| `dcrg_withheld_amount` | NUMERIC(15,2) | N | |
| `commenced_on` | DATE | N | provisional pension start |
| `proceedings_concluded_on` | DATE | Y | |
| `conclusion_outcome` | ENUM | Y | EXONERATED, PENALTY_NO_RECOVERY, PENALTY_WITH_RECOVERY |
| `final_recovery_amount` | NUMERIC(15,2) | Y | post-decision recovery |
| `status` | ENUM | N | ACTIVE, CONCLUDED_REGULARISED, CONCLUDED_RECOVERY |

#### E42 `pen_bank_account_verifications` (new — penny-drop over X.3)

| Field | Type | Null | Notes |
|---|---|---|---|
| `verification_id` | UUID PK | N | |
| `pensioner_id` | UUID FK→pen_pensioners | Y | |
| `case_id` | UUID FK→pen_separation_cases | Y | |
| `account_no_masked` | TEXT | N | encrypted at rest, masked by P02 |
| `ifsc` | TEXT | N | `VAL-IFSC` |
| `account_name` | TEXT | N | as supplied |
| `method` | ENUM | N | PENNY_DROP, NAME_IFSC_MATCH, NPCI_MAPPER (all via X.3) |
| `name_match_score` | NUMERIC(9,4) | Y | fuzzy match score |
| `verified_name` | TEXT | Y | name returned by bank |
| `result` | ENUM | N | PENDING, MATCH, NAME_MISMATCH, ACCOUNT_INVALID, FAILED |
| `verified_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | PENDING, PASSED, BLOCKED |

### 5.3 Relationship Map (unchanged from v2)

- `pen_separation_cases 1—1 pen_service_verifications 1—N pen_service_discrepancies`; `pen_service_discrepancies N—1 pen_condonation_orders`.
- `pen_separation_cases 1—1 pen_qualifying_service_records 1—N pen_non_qualifying_spells`; `pen_qualifying_service_records 1—N pen_prior_service_records`.
- `pen_separation_cases 1—1 pen_pension_calculations 1—1 pen_commutation_records`.
- `pen_separation_cases 1—N pen_gratuity_calculations` (retirement, death, or service gratuity).
- `pen_separation_cases 1—1 pen_terminal_settlements 1—1 pen_gpf_final_settlements`.
- `employees 1—N pen_family_members`; `pen_family_pension_records N—1 pen_family_members (current recipient)` — **family pension is driven by E26, not E21**.
- `employees 1—N pen_nominees_beneficiaries` — restricted to GRATUITY/GPF/LEAVE_ENCASHMENT scopes only.
- `pen_separation_cases 1—N pen_ppo_records`; PROVISIONAL PPO `1—1 pen_provisional_pension_records`; `pen_ppo_records 1—1 pen_pensioners` (active PPO).
- `pen_disbursing_authorities 1—N pen_ppo_records / pen_pensioners / pen_disbursements` (carries disbursement model).
- `pen_pensioners 1—N pen_overpayment_recoveries`, `1—N pen_bank_account_verifications`, `1—N pen_audit_objections`.
- All benefit calcs `N—1 rule-version rows` (E30–E36) via `rule_version_ref` (FK).
- **Platform edges:** every entity writes **`audit_log` (P05)** via DB trigger; case/sign-off/sanction/revision approvals run on **`workflow_instances` (P01)**; generated PPOs/sanctions/calc-sheets reference platform **`documents`** (G13 vault); retirement events append to **`service_register_events` (G12)**; outbound events are **`notifications` (X.2)**; external calls use **`integration_credentials` (P04)** over **X.3**; e-PPO pushed to DigiLocker (FR-G11-24, over X.3).

### 5.4 Ownership / Reuse Matrix (delta)

Unchanged from v2 for E04–E21. New G11-owned entities E26–E42 are owned/written by G11, read by G14/Auditor; `pen_disbursing_authorities` and the rule tables (E30–E36) are written only by SysAdmin (Org Admin) under SoD approval (FR-G11-19/21) and read by every benefit engine. `pen_family_members` is sourced from G01/employee Form-3/14 declarations but mastered in G11 for pension purposes. All platform tables (`audit_log`, `workflow_instances`, `service_register_events`, `notifications`, `integration_credentials`, `migration_runs`, `documents`) are **referenced, never owned**.

### 5.5 Enum Catalog (additions/changes over v1, carried)

| Enum | Values |
|---|---|
| pension_scheme | OPS, NPS, UPS |
| gratuity_type | RETIREMENT_GRATUITY, DEATH_GRATUITY, SERVICE_GRATUITY |
| ppo_type | SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, PROVISIONAL, REVISED |
| benefit_outcome | FULL_PENSION, SERVICE_GRATUITY_ONLY, NPS_DEFAULT_FAMILY, NPS_DEFAULT_INVALID, UPS_ASSURED, NPS_INDICATIVE |
| enhanced_basis | IN_SERVICE, AFTER_RETIREMENT |
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
| nominees_beneficiaries.benefit_scope | GRATUITY, GPF, LEAVE_ENCASHMENT (FAMILY_PENSION removed — now E26) |

### 5.6 Data Integrity Rules (carried from v2, platform-aware)

- **IR2 (amended):** `net_qualifying = gross − Σ(uncondoned non-qualifying days) + Σ(counted prior-service days)`; condoned spells (E29) count as qualifying.
- **IR2a:** a case cannot enter CALCULATION unless its `pen_service_verifications` row is `SIGNED_OFF`/`LOCKED` with `discrepancy_open_count = 0` and `spells_attested_count = spells_total_count`. The three-point sign-off is a **P01 PARALLEL_ALL_OF** flow.
- **IR3a:** if `meets_min_pension_service = false`, no FULL_PENSION row may exist; a SERVICE_GRATUITY row is mandatory.
- **IR4a:** `restoration_due_date = reduction_effective_date + statutory_period`; `migrated_date_unknown = true` → manual review, not auto-applied by `JOB-G11-RESTORE`.
- **IR8 (amended):** family-pension eligibility/hierarchy derive from E26 by `statutory_rank`, never from E21. On a self-pensioner death, a CONVERTED `pen_family_pension_records` row + FAMILY_PENSION PPO are created with `enhanced_basis = AFTER_RETIREMENT`.
- **IR8a:** death-in-service family pension uses `enhanced_basis = IN_SERVICE`; after-retirement conversion uses AFTER_RETIREMENT. Windows computed from E32.
- **IR14 (amended):** Σ `nominees.share_pct` per scope (GRATUITY/GPF/LEAVE_ENCASHMENT) = 100.00 (`VAL-NOMINEE`). Family-pension twins/eligible children draw per `concurrent_share_pct` summing to 100.00; dual FP subject to `dual_fp_cap_amount`.
- **IR15:** a PROVISIONAL PPO requires `proceedings_pending = true` and `dcrg_withheld = true`; DCRG released/recovered only on `proceedings_concluded_on`.
- **IR16:** no FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE disbursement line to an account may be TRANSMITTED unless a `pen_bank_account_verifications` row for that account is `PASSED`.
- **IR17:** `rule_version_ref` must point to a rule-version row whose status was EFFECTIVE on the relevant date; SUPERSEDED rows remain referenced by historic calcs (immutability via P05).
- **IR18:** when ≥2 revision events share an effective date for one pensioner, they apply in the §16.9 order; `calc_trace` records the applied order.
- **IR19:** an E38 row in IDENTIFIED/NOTIFIED/UNDER_RECOVERY holds the pensioner's disbursement where rules require, and links to any family-pension conversion.
- All v1 IRs (IR1, IR5–IR7, IR9–IR13) carried forward unchanged.

### 5.7 Sample Data

The v2 sample rows (separation_cases, family_members, service_verifications, service_discrepancies, pension_calculations, gratuity_calculations, family_pension_records, commutation_records, terminal_settlements, disbursing_authorities, rule tables, provisional_pension_records, audit_objections, bank_account_verifications, prior_service_records) are **carried forward unchanged** (each now additionally carrying `tenant_id`/`entity_id`). They are not re-printed here; see `docs/brd/v2/M11-retirement-and-pension.md` §5.7 for the illustrative 2–3 rows per entity. Key representative values are unchanged (e.g. PPO `PPO-2026-004512`, restoration `2041-10-15`, gratuity ceiling auto-stepped to `2,500,000`).

---

## 6. Functional Requirements

> Re-grounding rule for every FR: approvals/maker-checker run on **P01** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`, SoD enforced by P01/P02, in-flight version pinning); every mutation is captured by the **P05** DB-trigger; scheduled work runs as a registered **`JOB-G11-*`** job on **X.1**; external calls run on **X.3** with **P04** credentials; access is checked via **`Authorization.check` (P02)** against **RBAC v1.7**; notifications fire via **X.2** referencing **`MSG-G11-*`** ids; data-collection screens are **W.2 forms** referencing **`VAL-*`/`VAL-G11-*`**; every entity carries `tenant_id`/`entity_id`. FRs marked **(enhanced)** carry v2 content with adopted-improvement changes; FR-18–FR-24 are net-new statutory engines. All v2 ACs, BRs, edge cases and LLD rows are preserved.

### FR-G11-01 — Retirement Forecasting & Due-for-Retirement Lists

- **Module:** G11-F01
- **Primary Role(s):** Pension Officer, HR Admin
- **User Story:** As a Pension Officer, I want an automatically refreshed list of employees due to retire by horizon so processing starts 1–2 years ahead and no first pension is delayed.
- **Description:** Compute each active employee's projected superannuation date from `dob` + applicable retirement age (resolved from `pen_retirement_age_rules` E34 via the config cascade), classify into horizon buckets, surface those due within 24/12/6 months, flag whether a case is already initiated, and drive proactive alerts. Refreshed nightly by **`JOB-G11-FORECAST`** (X.1; idempotent per-period run key, backoff ×3, `JOB-FAIL`→`MSG-SYS-JOBFAIL`) and on-demand.
- **Acceptance Criteria:**
  - AC1: Projected retirement date = last day of the month in which the employee attains the configured superannuation age (per E34 cadre rule), recomputed on DOB/cadre change.
  - AC2: Lists filter by org unit, cadre, horizon bucket, "case not yet initiated"; cursor-paginated.
  - AC3: Employees crossing the 18-month threshold without a case trigger an X.2 alert (`MSG-G11-FORECAST-ALERT`) to the responsible Pension Officer.
  - AC4: Forecast excludes separated employees (RETIRED/DECEASED/RESIGNED/TERMINATED).
- **Business Rules:** BR1: Retirement age from E34 (effective-dated, cadre/category). BR2: Read-only projection; never auto-creates a case. BR3: Mid-month attainment retires on month-end per policy.
- **Data Model References:** `pen_retirement_forecasts`, `pen_retirement_age_rules` (read), `employees` (G01, read), `org_units` (read), `pen_separation_cases` (case_initiated flag).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/forecasts` | due-for-retirement list (cursor; filters horizon/org_unit/cadre) |
| POST | `/api/v1/pension/forecasts:refresh` | recompute (delegates to `JOB-G11-FORECAST`) |
| GET | `/api/v1/pension/forecasts/{employeeId}` | one employee's projection |

- **UI Behavior Notes:** Due-for-retirement worklist (Admin workspace) with horizon tabs, per-row "initiate case", alert badges, export; canonical empty/loading/error/no-permission/partial-data states (Foundation §3). Self-service shows the employee their own projected date (Me workspace).
- **Edge Cases:** DOB correction; cadre change altering retirement age (E34 lookup); extension-of-service order; deceased mid-horizon; leap-year/month-end arithmetic.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ForecastProjector`, `HorizonClassifier`, `JOB-G11-FORECAST` (X.1), `AlertEmitter` (X.2) |
| Backend Flow | For each active employee → resolve retirement age (E34) → compute superannuation date → bucket → upsert forecast → emit threshold alerts via X.2 |
| Data Operations | Bulk upsert; index on `(tenant_id, horizon_bucket, org_unit_id)`, `projected_retirement_date` |
| Validation | DOB present (`VAL-DOB`); E34 rule resolved; exclude separated statuses |
| Authorization | `Authorization.check` (P02): Pension Officer/HR (org scope); employee reads own |
| State Changes & Side Effects | forecasts refreshed; X.2 threshold notifications; P05 audit on writes |
| Failure Handling | Missing DOB → exception list; E34 unresolved → flagged UNRESOLVED; job terminal failure → `MSG-SYS-JOBFAIL` |
| Dependencies | G01, E34, X.1, X.2 |
| Test Guidance | Month-end arithmetic; cadre ages from E34; DOB-change recompute; alert threshold; separated-exclusion |

---

### FR-G11-02 — Separation Case Management (All Separation Types) **(enhanced)**

- **Module:** G11-F02
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want to create and drive a separation case for any separation type and pension regime so the correct rules, workflow, and benefit set apply from the start.
- **Description:** Create a `pen_separation_cases` record selecting the type, derive the pension scheme (OPS/NPS/UPS), capture type-specific inputs (VRS notice, G09 compulsory-retirement order ref, medical-board ref, death report ref, pending-proceedings flag), bind a PDA (carrying its disbursement model), and progress through the state machine with **maker-checker gates running on P01** (`WorkflowEngine.startInstance({ workflow_code: 'G11_SEPARATION_CASE', subject_ref: case_id, … })`; the flow is a **W.1 configured flow definition**, SEQUENTIAL with a CONDITIONAL provisional-pension branch; SoD enforced by P01/P02). Type drives which downstream FRs are mandatory.
- **Acceptance Criteria:**
  - AC1: Each type enforces required inputs (COMPULSORY_RETIREMENT → valid G09 order; INVALIDATION → medical-board certificate; DEATH_IN_SERVICE → date of death + E26 family data).
  - AC2: Scheme auto-derived from DOJ vs cutover + UPS opt-in; override requires reason + P05 audit.
  - AC2a: If `proceedings_pending = true`, the case is routed (P01 CONDITIONAL stage) to the provisional-pension path (FR-G11-22) and DCRG flagged for full withholding.
  - AC3: Only an authority distinct from the maker can sanction (SoD enforced by P01/P02 — multi-role INTERSECTION, no self-approval).
  - AC4: Resignation/dismissal paths suppress pension where rules disallow but still allow GPF/leave settlement.
  - AC5: At most one active case per employee (IR1).
- **Business Rules:** BR1: Compulsory retirement only from a G09 penalty order. BR2: Death-in-service auto-spawns family-pension (`enhanced_basis=IN_SERVICE`) and death-gratuity sub-flows. BR3: VRS requires minimum qualifying service and may add weightage. BR4: A case cannot skip the FR-G11-18 gate or no-dues except via explicit anticipatory/provisional exception. BR5: UPS opt-in recorded once, irreversible per rule; scheme override P05-audited.
- **Data Model References:** `pen_separation_cases`, `pen_disbursing_authorities` (read), `pen_family_members` (read on death), `employees` (G01, read), `service_register_events` (G12, append on closure), `workflow_instances` (P01).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases` | create case (`Idempotency-Key` required — workflow-initiating) |
| GET | `/api/v1/pension/cases/{id}` | case detail & status |
| PATCH | `/api/v1/pension/cases/{id}` | update type-specific inputs / PDA / scheme override |
| POST | `/api/v1/pension/cases/{id}:advance` | transition state (P01 advance) |
| POST | `/api/v1/pension/cases/{id}:sanction` | sanction (P01 approve; checker) |

- **UI Behavior Notes:** Case workspace (Admin) with P01 stage tracker, type-specific panels, scheme badge (OPS/NPS/UPS), PDA selector, document upload (platform `documents`), P05 audit timeline. Death-in-service uses a compassionate fast-track layout.
- **Edge Cases:** Death during pre-retirement (convert SUPERANNUATION→DEATH_IN_SERVICE); VRS withdrawal before acceptance; compulsory retirement under appeal; scheme misclassification; NPS→UPS opt-in boundary; re-employed pensioner; proceedings pending at retirement.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CaseService`, `SeparationTypePolicy`, `SchemeResolver`, `PDABinder`, P01 workflow adapter |
| Backend Flow | Validate type inputs → derive scheme + UPS opt-in → bind PDA → create case → `WorkflowEngine.startInstance` → guards on advance (FR-18 gate, proceedings CONDITIONAL routing) → on P01 approve lock calc snapshot |
| Data Operations | Insert case; P01-driven transitions; append SR event to G12 on closure; document links |
| Validation | `VAL-G11-CASE` (type-required fields, single-active); SoD via P02; scheme/UPS override reason (`ERR-REASON-REQ`); proceedings routing |
| Authorization | `Authorization.check`: Pension Officer create/update; Authority sanction; org scope |
| State Changes & Side Effects | case.status machine (§10.1); P05 audit_log; X.2 notifications; G12 SR append |
| Failure Handling | Missing ref → 422 `VALIDATION_FAILED` (`details.reason=CASE_INPUT_INCOMPLETE`); duplicate active → 409 `CONFLICT` (`ERR-G11-DUP-CASE`) |
| Dependencies | G09, G01, G12, E26, E37, P01, FR-18, FR-03..09, FR-22 |
| Test Guidance | Type input matrix; SoD; single-active; scheme derivation incl. UPS; death conversion; proceedings routing |

---

### FR-G11-03 — Pre-Retirement Processing (SR Verification, No-Dues, Anticipatory Pension) **(enhanced)**

- **Module:** G11-F03
- **Primary Role(s):** Pension Officer, SR Custodian (G12), HR Admin, Sanctioning Authority
- **User Story:** As a Pension Officer, I want to run SR verification, drive no-dues clearance, and authorise anticipatory pension 1–2 years ahead so benefits are ready before the retirement date and pension never breaks.
- **Description:** Orchestrate the lead pipeline: trigger the FR-G11-18 completeness gate and request gap-free verification from **G12** (SR Custodian certifies), coordinate no-dues clearance (P01 PARALLEL_ALL_OF checklist), and authorise **anticipatory pension** within rule limits (issuing an ANTICIPATORY PPO) when final pension cannot be sanctioned in time. Pending-proceedings cases use provisional pension (FR-G11-22).
- **Acceptance Criteria:**
  - AC1: Case cannot advance to CALCULATION until the `pen_service_verifications` record is SIGNED_OFF/LOCKED (FR-G11-18) **and** `qsr.sr_verified=true`.
  - AC2: No-dues is a checklist with per-item owner/status (P01 stages); case cannot reach PENDING_SANCTION until CLEARED (or anticipatory/provisional exception).
  - AC3: Anticipatory pension issues an ANTICIPATORY PPO within the configured cap, later superseded by the final PPO with adjustment.
  - AC4: Outstanding dues recorded and netted into terminal settlement, never silently ignored.
- **Business Rules:** BR1: Anticipatory pension ≤ configured % of estimated pension; anticipatory gratuity withheld until no-dues. BR2: SR gaps condoned by E29 order before counting as qualifying. BR3: No-dues blocking items hold gratuity but not the basic anticipatory pension.
- **Data Model References:** `pen_separation_cases`, `pen_service_verifications` (gate), `pen_qualifying_service_records`, `service_register_events` (G12, read/verify), `pen_ppo_records` (ANTICIPATORY), `pen_terminal_settlements` (recoveries).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/sr-verification:request` | request G12 verification |
| POST | `/api/v1/pension/cases/{id}/sr-verification:certify` | SR Custodian certify |
| GET/PATCH | `/api/v1/pension/cases/{id}/no-dues` | no-dues checklist |
| POST | `/api/v1/pension/cases/{id}/anticipatory-pension` | authorise anticipatory pension |

- **UI Behavior Notes:** Pre-retirement cockpit: verification gate status, SR gap list (from G12), no-dues checklist grid, anticipatory-pension panel with cap enforcement and projected first-pension date.
- **Edge Cases:** Verification reveals a gap requiring condonation; unresponsive no-dues owner near deadline (P01 SLA escalation); anticipatory paid then final lower (recover excess); deputation/foreign-service spells; case also has pending proceedings.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SRVerificationClient` (G12 over service contract), `NoDuesCoordinator` (P01), `AnticipatoryPensionService` |
| Backend Flow | Trigger FR-18 gate → request G12 verification → certify → lock QSR → no-dues P01 flow → if time-critical compute anticipatory within cap → issue ANTICIPATORY PPO |
| Data Operations | Update case flags; create ANTICIPATORY ppo; record dues as recovery candidates |
| Validation | FR-18 sign-off gate; sr_verified gate; no-dues gate; anticipatory cap (`VAL-G11-PENSION`); condonation present |
| Authorization | SR Custodian certify; Officer coordinate; Authority authorise anticipatory |
| State Changes & Side Effects | case SR_VERIFICATION→NO_DUES→CALCULATION; ANTICIPATORY PPO ACTIVE; X.2 notifications |
| Failure Handling | G12 unavailable → X.3/service-contract retry then 412 `PRECONDITION_FAILED`; gap uncondoned → `ERR-G11-SERVICE-GAP`; not signed off → 409 `ERR-G11-VERIFICATION-INCOMPLETE` |
| Dependencies | G12, G10, FR-18, FR-02, FR-04, FR-11, FR-22 |
| Test Guidance | Gate enforcement; anticipatory cap; later adjustment/recovery; condonation path |

---

### FR-G11-04 — Qualifying Service Computation **(enhanced)**

- **Module:** G11-F04
- **Primary Role(s):** Pension Officer, SR Custodian
- **User Story:** As a Pension Officer, I want qualifying service computed from verified service with non-qualifying spells deducted and counted prior service added so pension and gratuity use the legally correct service length.
- **Description:** Compute gross service joining→retirement/death, enumerate non-qualifying spells (from **G03** leave/LWP events and **G04** SR postings), deduct uncondoned spells, add structured counted prior/military service from E39, apply VRS weightage, and round to reckonable half-years per E36. Determines `meets_min_pension_service` (E35) routing FULL_PENSION vs SERVICE_GRATUITY. Produces an auditable, locked QSR. Runs only after the FR-G11-18 record is signed off.
- **Acceptance Criteria:**
  - AC1: `net_qualifying = gross − Σ(uncondoned non-qualifying days) + Σ(counted prior-service days)`; condoned spells (E29) count as qualifying.
  - AC2: Reckonable half-years rounded per E36; capped per E36.
  - AC3: Each non-qualifying spell traces to a source (G03/G04 event, G09 order, or manual w/ justification) and is reason-code-attested in FR-G11-18.
  - AC4: VRS weightage added only when rules permit and within cap.
  - AC4a: Counted prior service from E39 added only when `verified=true` and `pension_already_drawn=false`.
  - AC5: `meets_min_pension_service` set from E35; if false, FR-G11-05 produces SERVICE_GRATUITY_ONLY. Record locks on verification; later changes require a new version.
- **Business Rules:** BR1: EOL on medical certificate may be qualifying; otherwise non-qualifying (attested in FR-18). BR2: Dies-non never qualifies. BR3: Min qualifying service via E35. BR4: Prior service counted distinctly from VRS weightage (`prior_service_days` vs `weightage_years`).
- **Data Model References:** `pen_qualifying_service_records`, `pen_non_qualifying_spells`, `pen_prior_service_records` (E39), `pen_condonation_orders` (E29), E35/E36 (read), `service_register_events` (G12, read), G03/G04/G09 (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/qualifying-service:compute` | compute QSR |
| GET | `/api/v1/pension/cases/{id}/qualifying-service` | QSR + spells + prior service |
| POST | `/api/v1/pension/cases/{id}/qualifying-service/spells` | add/condone a spell |
| POST | `/api/v1/pension/cases/{id}/prior-service` | add/verify counted prior service |
| POST | `/api/v1/pension/cases/{id}/qualifying-service:lock` | lock after verification |

- **UI Behavior Notes:** Service-ledger timeline with shaded non-qualifying spells, a separate counted-prior-service band, editable spell table, prior-service panel, live qualifying-service total with half-year rounding and a min-service/service-gratuity indicator.
- **Edge Cases:** Overlapping spells; spell spanning a pay-commission boundary; prior military service with prior pension drawn (exclusion); condonation after lock (new version); fraction-of-day rounding; net just below the 10-year threshold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `QualifyingServiceEngine`, `SpellAggregator`, `PriorServiceCounter`, `HalfYearRounder` (E36) |
| Backend Flow | Require FR-18 sign-off → gather verified span (G12) → pull spells (G03/G04) → dedupe/merge overlaps → deduct uncondoned → add E39 prior service → add weightage → round (E36) → set `meets_min_pension_service` (E35) → persist+trace → lock |
| Data Operations | Insert QSR + spells; link prior-service rows; version on change; lock flag |
| Validation | `VAL-G11-QUALSVC` (inclusive day math; overlap merge; condonation refs; weightage/prior-service caps); FR-18 gate |
| Authorization | Officer compute; SR Custodian verify; lock post-verify |
| State Changes & Side Effects | QSR DRAFT→VERIFIED→LOCKED; feeds FR-05/07; P05 audit |
| Failure Handling | Source unavailable → 412 `PRECONDITION_FAILED`; overlap conflict → manual resolution; not signed off → 409 `ERR-G11-VERIFICATION-INCOMPLETE` |
| Dependencies | FR-18, G03/G04/G09/G12, E29/E39/E35/E36, feeds FR-05/FR-07 |
| Test Guidance | Spell deduction; overlap merge; prior-service addition; half-year rounding/cap; min-service routing; versioning |

---

### FR-G11-05 — Pension Calculation (OPS / NPS / UPS, Service Gratuity, NPS Defaults) **(enhanced — R2, R3)**

- **Module:** G11-F05
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want pension computed under the correct regime — including service gratuity for short service, UPS assured payout, and NPS death/invalidation defaults — so every cohort is statutorily correct.
- **Description:** Branch by `benefit_outcome`: **OPS ≥10 yrs** = flat **50%** of emoluments base (from **G10**); **<10 yrs** = no pension → SERVICE_GRATUITY (FR-07); **UPS opted-in** = assured payout ≈ 50% of last-12-month average pay with E35 guarantee; **NPS death/invalidation** = CCS-NPS Rules 2021 default; **NPS superannuation** = corpus/PRAN (from CRA over X.3) + indicative annuity/lump-sum (non-deterministic). A full `calc_trace` and `rule_version_ref` (FK) are persisted. Proportionate reduction for short service is removed.
- **Acceptance Criteria:**
  - AC1: OPS basic pension = flat 50% of emoluments base for ≥10 years qualifying (no proportionate reduction).
  - AC1a: For <10 years, no monthly pension; routed to SERVICE_GRATUITY; `benefit_outcome=SERVICE_GRATUITY_ONLY`.
  - AC2: Emoluments method selectable (last-drawn / 10-month / beneficial-of-both / 12-month UPS) and snapshotted from **G10**.
  - AC3: Statutory min/max (E35) enforced with flags.
  - AC4: NPS superannuation marked non-OPS; no defined-benefit pension fabricated; indicative figures excluded from determinism.
  - AC4a: NPS death-in-service/invalidation computes the CCS-NPS Rules 2021 OPS-equivalent default.
  - AC4b: UPS opted-in computes assured payout (~50% of 12-month average) with the UPS minimum guarantee.
  - AC5: Re-computation with identical inputs and the snapshotted rule version is identical; rule version recorded as FK.
- **Business Rules:** BR1: Scheme from case `pension_scheme` + `ups_opted_in`. BR2: Emoluments exclude non-reckonable allowances. BR3: Age-based additional pension increments scheduled as future revisions (FR-13). BR4: SERVICE_GRATUITY branch mutually exclusive with FULL_PENSION (IR3a).
- **Data Model References:** `pen_pension_calculations`, `pen_qualifying_service_records` (read), E35/E30 (read), G10 emoluments (read), `pen_gratuity_calculations` (SERVICE_GRATUITY handoff).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/pension:compute` | compute pension / route service gratuity / UPS / NPS-default |
| GET | `/api/v1/pension/cases/{id}/pension` | pension calc + trace + benefit_outcome |

- **UI Behavior Notes:** Pension worksheet showing benefit-outcome branch, emoluments comparison, flat-50% indicator, min/max flags, trace panel; UPS card, NPS-default card, service-gratuity redirect callout; NPS-superannuation corpus/annuity estimator (labelled indicative).
- **Edge Cases:** Net just below/above 10 years; pay anomaly in last 10/12 months; revision retro-affecting emoluments; OPS/NPS/UPS borderline DOJ/opt-in; re-employed pensioner; NPS death-in-service default vs indicative.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionEngine`, `BenefitOutcomeRouter`, `EmolumentsResolver` (G10), `MinMaxGuardRail` (E35), `UPSCalculator`, `NPSDefaultCalculator`, `NPSIndicativeAdapter` (CRA over X.3) |
| Backend Flow | Resolve scheme/outcome → if <10 yrs route SERVICE_GRATUITY → else compute by branch → floor/cap → persist trace + rule-version FK |
| Data Operations | Insert pension_calculations; supersede prior on recompute; SERVICE_GRATUITY handoff |
| Validation | `VAL-G11-PENSION` (branch correctness; flat-50%; min/max; emoluments present; determinism vs indicative exclusion) |
| Authorization | Officer compute; Authority sanction (via case) |
| State Changes & Side Effects | calc DRAFT→COMPUTED→SANCTIONED; SUPERSEDED on revision; P05 audit |
| Failure Handling | Emoluments missing → 422 `ERR-G11-EMOLUMENTS`; rule row missing → 422 `ERR-G11-RULE-NOT-EFFECTIVE`; UPS opt-in absent → 409 `ERR-G11-SCHEME-MISMATCH` |
| Dependencies | G10, FR-04, E35, feeds FR-06, FR-07, FR-11 |
| Test Guidance | Flat-50% ≥10 yrs; service-gratuity routing <10 yrs; UPS assured + guarantee; NPS death-default; NPS indicative exclusion; rule-version capture |

---

### FR-G11-06 — Commutation of Pension **(enhanced — R11)**

- **Module:** G11-F06
- **Primary Role(s):** Retiring Employee (opt), Pension Officer, Sanctioning Authority
- **User Story:** As a retiring employee, I want to commute a portion of my pension into a lump sum, with residual pension and restoration date correctly computed from the reduction date.
- **Description:** Capture the commutation option (fraction ≤ statutory max), resolve the factor by age-next-birthday from E31 (FK captured), compute commuted value = commuted × factor × 12, reduce monthly pension to residual from the reduction-effective date, and schedule restoration = reduction date + 15 yrs (applied by **`JOB-G11-RESTORE`** on X.1). Handles migrated pensioners with unknown dates.
- **Acceptance Criteria:**
  - AC1: Commuted fraction bounded by statutory maximum (e.g. 40%); over-limit rejected.
  - AC2: Factor resolves from the effective E31 table by age-next-birthday (FK captured).
  - AC3: Commuted value, residual pension, reduction-effective date computed and shown with trace.
  - AC3a: `restoration_due_date = reduction_effective_date + 15 yrs`; `migrated_date_unknown=true` → manual review, not auto-scheduled.
  - AC4: Residual pension feeds the PPO; restoration scheduled and later applied (FR-12) restoring full basic.
  - AC5: Opting out leaves full basic pension and no commuted value.
- **Business Rules:** BR1: Commutation requires medical fitness unless within the no-medical window post-retirement. BR2: Pension reduced from the date of receipt of commuted value; restoration is 15 yrs from that date. BR3: Commuted portion still attracts DA on the full basic per rule.
- **Data Model References:** `pen_commutation_records`, `pen_commutation_factors` (E31, read), `pen_pension_calculations` (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/commutation` | submit/compute commutation |
| GET | `/api/v1/pension/cases/{id}/commutation` | commutation detail |

- **UI Behavior Notes:** Commutation calculator with capped fraction slider, live commuted-value/residual preview, factor display by age (E31), explicit reduction-date→restoration-date callout; self-service preview; migrated-unknown-date warning banner.
- **Edge Cases:** Age boundary changing the factor; commutation after the no-medical window; death before restoration; fraction at the cap; migrated pensioner with unknown dates.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `CommutationEngine`, `FactorTableResolver` (E31), `RestorationScheduler` (`JOB-G11-RESTORE`) |
| Backend Flow | Validate fraction ≤ max → resolve factor (E31 FK) → commuted value → residual → set reduction date → restoration = reduction+15y (or flag migrated-unknown) |
| Data Operations | Insert commutation_records; link pension calc + factor row; restoration scheduled on X.1 |
| Validation | `VAL-G11-PENSION` (fraction cap; factor found; residual ≥ 0; medical-window; date disambiguation) |
| Authorization | Employee opts; Officer computes; Authority sanctions |
| State Changes & Side Effects | commutation DRAFT→COMPUTED→SANCTIONED; `JOB-G11-RESTORE` scheduled |
| Failure Handling | Over-limit → 422 `ERR-G11-COMMUTATION-LIMIT`; factor missing → 422 `ERR-G11-FACTOR-NOT-FOUND` |
| Dependencies | FR-05, E31, X.1, feeds FR-09, FR-11, FR-12 |
| Test Guidance | Cap; factor lookup; value/residual; reduction-date-based restoration; migrated-unknown; opt-out |

---

### FR-G11-07 — Gratuity Computation (Retirement, Death & Service) **(enhanced — R2, Improvement 21)**

- **Module:** G11-F07
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker)
- **User Story:** As a Pension Officer, I want retirement, death and service gratuity computed with the correct slabs and an auto-stepping statutory ceiling so the lump-sum benefit is accurate and within limits.
- **Description:** Compute retirement gratuity (¼ × emoluments × qualifying half-years, capped), death gratuity (service-length slabs), and service gratuity (<10-yr qualifying: one-time lump sum, no DCRG ceiling). The statutory ceiling resolves from E33 and auto-steps +25% whenever DA crosses each 50% threshold. Death/retirement gratuity apportioned to nominees (E21) for death cases.
- **Acceptance Criteria:**
  - AC1: Retirement gratuity uses capped half-years and the E33 ceiling; `payable=min(computed,ceiling)`.
  - AC2: Death gratuity applies the correct slab multiplier by service length.
  - AC2a: Service gratuity (service <10 yrs) computes the one-time lump sum with no DCRG ceiling; `gratuity_type=SERVICE_GRATUITY`.
  - AC3: Death gratuity apportioned per nominee shares totalling 100% (E21, `VAL-NOMINEE`).
  - AC4: Gratuity may be withheld pending no-dues or fully withheld pending Rule-9 proceedings (FR-22).
  - AC5: Ceiling-applied/withheld flags set; the E33 ceiling row used is captured (`ceiling_ref`).
- **Business Rules:** BR1: Emoluments = basic + DA at retirement/death date. BR2: Half-years capped per E36. BR3: Statutory ceiling effective-dated (E33). BR3a: Ceiling auto-steps +25% per 50% DA threshold crossed (E33), no manual edit. BR4: No minimum-service bar for death gratuity.
- **Data Model References:** `pen_gratuity_calculations`, `pen_qualifying_service_records` (read), `pen_nominees_beneficiaries` (E21, read), `pen_gratuity_ceilings` (E33, read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gratuity:compute` | compute gratuity (retirement/death/service) |
| GET | `/api/v1/pension/cases/{id}/gratuity` | gratuity detail |

- **UI Behavior Notes:** Gratuity worksheet with type selector, emoluments, half-years, slab/service-gratuity multiplier, ceiling comparison (auto-step shown), nominee apportionment grid, withhold toggle (no-dues/proceedings) with reason; trace panel.
- **Edge Cases:** Service at a slab boundary; service <10 yrs (no ceiling); computed below/above ceiling; DA crossing 50% mid-period; no valid nominee (escheat/legal-heir); retirement gratuity fully withheld for proceedings.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GratuityEngine`, `SlabResolver`, `ServiceGratuityCalc`, `CeilingGuard` (E33 auto-step), `NomineeApportioner` |
| Backend Flow | Resolve emoluments+half-years → select formula → resolve ceiling with auto-step (E33) → apply ceiling (except service gratuity) → apportion → withhold if no-dues/proceedings |
| Data Operations | Insert gratuity_calculations; capture ceiling_ref; nominee split JSONB; link to settlement |
| Validation | Half-year cap; ceiling + auto-step; `VAL-NOMINEE`=100%; slab/branch selection |
| Authorization | Officer compute; Authority sanction |
| State Changes & Side Effects | gratuity DRAFT→COMPUTED→SANCTIONED→PAID; WITHHELD_PROCEEDINGS; P05 audit |
| Failure Handling | Ceiling row missing → 422 `ERR-G11-RULE-NOT-EFFECTIVE`; bad nominee split → 422 `ERR-G11-NOMINEE-SPLIT` |
| Dependencies | FR-04, FR-05 (handoff), G09/FR-22 (withhold), E33, feeds FR-09 |
| Test Guidance | Slab boundaries; service-gratuity (no ceiling); ceiling auto-step; apportionment; withhold/release; death day-one |

---

### FR-G11-08 — Family & Enhanced Family Pension **(enhanced — R1, R4, R14)**

- **Module:** G11-F08
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), HR Admin
- **User Story:** As a Pension Officer, I want family pension computed at the correct path-specific rate to the statutorily-eligible family member(s) so bereaved families are paid accurately, including dual and twin cases.
- **Description:** Compute family pension at normal rate (e.g. 30%, E32) and, where eligible, enhanced rate (e.g. 50%) for a path-specific window driven by `enhanced_basis`: death-in-service → 10 years no age cap; death-after-retirement → 7 years or up to age 67 / would-be-superannuation, whichever earlier. Eligibility/hierarchy derive from the **E26 family-members register** by `statutory_rank` — never nominees. Supports dual family pension (E32 cap) and simultaneous twin/multiple eligible children (`concurrent_share_pct`). Maintains review dates and transfer to the next eligible member on cessation.
- **Acceptance Criteria:**
  - AC1: Normal and enhanced amounts compute from emoluments × E32 rates.
  - AC2: Enhanced window computed from `enhanced_basis`: IN_SERVICE = +10 yrs, no age cap; AFTER_RETIREMENT = min(+7 yrs, age-67, would-be-superannuation). Steps down to normal automatically (scheduled).
  - AC2a: Applied window rule recorded in `enhanced_window_rule`; both step-downs tested.
  - AC3: Active recipient and hierarchy from E26 by `statutory_rank`; on cessation pension transfers to the next eligible member unless none remain.
  - AC4: Disabled-dependent members receive lifelong family pension per rule.
  - AC5: Both death-in-service and conversion-on-pensioner-death paths produce a family-pension record and FAMILY_PENSION PPO.
  - AC6: Dual family pension permitted (both spouses govt servants) subject to the E32 dual cap; twins/multiple children draw simultaneously per `concurrent_share_pct`=100%.
- **Business Rules:** BR1: Enhanced rate = min(enhanced formula, would-be pension). BR1a: Window selection mandatory and path-driven (IR8a). BR2: Dual family pension and simultaneous twin/eligible-children shares allowed per rule (IR14). BR3: Remarriage/employment may cease eligibility except disabled children/widow. BR4: Recipient is the rule-defined family member (E26); nomination (E21) does not confer family-pension eligibility.
- **Data Model References:** `pen_family_pension_records`, `pen_family_members` (E26), `pen_family_pension_rates` (E32), `pen_pension_calculations` (read), `pen_pensioners` (source on conversion).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/family-pension:compute` | compute family pension (path-specific) |
| GET | `/api/v1/pension/family-pension/{id}` | family pension detail |
| POST | `/api/v1/pension/family-pension/{id}:transfer` | transfer to next eligible family member |

- **UI Behavior Notes:** Family-pension panel with normal/enhanced amounts, path-specific enhanced-window timeline, ordered E26 family-members list with review dates/ranks, dual-FP indicator, twin/multiple-children concurrent-share grid, transfer action with reason capture.
- **Edge Cases:** Multiple eligible children/twins (concurrent shares); disabled child lifelong; remarriage of widow; after-retirement window shorter due to age-67; both spouses govt servants (dual FP cap); simultaneous death of employee and spouse; nominee present but not a family member.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FamilyPensionEngine`, `EnhancedWindowResolver`, `FamilyMemberHierarchyResolver` (E26), `DualFPCapGuard`, `TransferService` |
| Backend Flow | Compute normal+enhanced (E32) → set window by `enhanced_basis` → select first eligible member (E26 rank) → apply dual-FP cap / concurrent shares → schedule step-down & reviews → on cessation transfer |
| Data Operations | Insert family_pension_records; hierarchy snapshot from E26; transfer updates current member |
| Validation | Rate bounds (E32); window-by-basis; family-member eligibility; dual cap; concurrent shares=100% |
| Authorization | Officer compute; Authority sanction; Officer transfer with review |
| State Changes & Side Effects | fp DRAFT→COMPUTED→SANCTIONED→ACTIVE→TRANSFERRED/CEASED; FAMILY_PENSION PPO; X.2 notifications |
| Failure Handling | No eligible member → legal-heir flag; wrong window basis → 422; nominee-as-recipient attempt → 409 `ERR-G11-FP-NOT-NOMINEE` |
| Dependencies | FR-05, E26, E32, FR-12 (conversion), feeds FR-11 |
| Test Guidance | IN_SERVICE 10y vs AFTER_RETIREMENT 7y/age-67 step-downs; E26 hierarchy/transfer; dual FP cap; twins shares; disabled-lifelong; conversion path |

---

### FR-G11-09 — Terminal Benefits & Final Settlement (with Tax/TDS) **(enhanced — R12)**

- **Module:** G11-F09
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (G10)
- **User Story:** As a Pension Officer, I want a composite final settlement bringing together leave encashment, gratuity, commuted value, GPF, recoveries, and statutory tax/TDS so one-time dues are paid net of legitimate recoveries and correct tax.
- **Description:** Assemble the terminal settlement: leave encashment from **G03** (× per-day emoluments, capped), gratuity (FR-07), commuted value (FR-06), GPF (FR-10), other dues, net legitimate recoveries within statutory protection, and compute tax/TDS (gratuity ₹20L cap, commuted-pension exemption, leave-encashment exemption, taxable totals, TDS, Section 89(1) relief). Produces gross, taxable, TDS, net-of-tax settlement for sanction and disbursement.
- **Acceptance Criteria:**
  - AC1: Leave encashment = min(encashable EL days, statutory cap) × per-day (basic+DA); shown as a line.
  - AC2: Gross = Σ components; net = gross − recoveries − TDS; each recovery traces to an order.
  - AC2a: Tax step computes per-component exempt/taxable splits, TDS, Section 89(1) relief, captured in `tax_breakdown`.
  - AC3: Recoveries cannot exceed statutory limits; excess deferred/flagged, never silently dropped.
  - AC4: Withheld components (gratuity pending no-dues, or fully withheld for Rule-9 proceedings) excluded from immediate payout and tracked.
  - AC5: Final settlement requires SANCTIONED sub-calculations.
- **Business Rules:** BR1: Leave encashment capped per rule (e.g. 300 days). BR2: Recovery priority and net protection per §16.3. BR3: Pending disciplinary/Rule-9 proceedings withholds gratuity (G09/FR-22). BR4: Tax exemptions/TDS computed from effective tax-rule parameters; net-of-tax payout shown.
- **Data Model References:** `pen_terminal_settlements` (tax fields), G03 leave balance (read), `pen_gratuity_calculations`, `pen_commutation_records`, `pen_gpf_final_settlements`, G09 recoveries (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/settlement:compute` | assemble settlement (incl. tax) |
| GET | `/api/v1/pension/cases/{id}/settlement` | settlement detail (gross/taxable/TDS/net) |
| POST | `/api/v1/pension/cases/{id}/settlement:sanction` | sanction settlement (P01 approve) |

- **UI Behavior Notes:** Settlement summary with component breakdown, tax panel (exempt vs taxable per component, TDS, 89(1) relief), recoveries list with order links, withheld items, gross/taxable/TDS/net totals; export of settlement + tax sheet.
- **Edge Cases:** Negative net (recoveries > dues); gratuity exceeding ₹20L; arrears spanning years (89(1) relief); leave balance disputed; loan foreclosure interplay; insurance pending; death routing dues to nominees with tax treatment.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SettlementAssembler`, `LeaveEncashmentCalc` (G03), `RecoveryNetter`, `TaxEngine` (exemptions/TDS/89(1)) |
| Backend Flow | Pull components → compute encashment → sum gross → compute tax → net recoveries within protection → set withheld → produce net-of-tax |
| Data Operations | Insert terminal_settlements incl. tax fields + tax_breakdown; link sub-calc refs |
| Validation | Encashment cap; recovery limits; sub-calc SANCTIONED; tax-rule effective; net ≥ protected floor or flagged |
| Authorization | Officer compute; Authority sanction; Payroll (G10) confirm recoveries |
| State Changes & Side Effects | settlement DRAFT→COMPUTED→SANCTIONED→PAID/PARTIALLY_WITHHELD; P05 audit |
| Failure Handling | G03 unavailable → 412 `PRECONDITION_FAILED`; recovery over-limit → 409 `ERR-G11-RECOVERY-PROTECTION`; tax rule missing → 422 `ERR-G11-TAX-RULE` |
| Dependencies | G03, G09, G10, FR-06, FR-07, FR-10, FR-22, feeds FR-14 |
| Test Guidance | Encashment cap; netting/priority; tax exemptions; TDS; 89(1) relief; withhold; negative-net; death routing |

---

### FR-G11-10 — GPF Final Withdrawal

- **Module:** G11-F10
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Payroll Officer (G10)
- **User Story:** As a Pension Officer, I want the GPF final balance with interest and advances adjusted so the provident-fund corpus is settled correctly at retirement or death.
- **Description:** Retrieve the GPF closing balance and contribution ledger from **G10**, compute interest to settlement date (effective GPF rate), deduct outstanding advances, derive final payable, apportion to nominees (E21) for death cases, and route for authorisation. NPS/UPS cases use NPS exit, not GPF.
- **Acceptance Criteria:** AC1: Final payable = closing balance + interest-to-date − outstanding advances. AC2: Interest at the effective GPF rate. AC3: Death cases apportion to nominees totalling 100% (E21). AC4: GPF withdrawal requires authorisation distinct from the maker (SoD). AC5: GPF only for GPF/OPS subscribers; NPS/UPS routed to NPS exit.
- **Business Rules:** BR1: GPF closing balance is the G10 system of record. BR2: Interest rate effective-dated. BR3: Unrecovered advances are mandatory deductions.
- **Data Model References:** `pen_gpf_final_settlements`, G10 GPF ledger (read), `pen_nominees_beneficiaries` (E21, read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/gpf:compute` | compute GPF final |
| POST | `/api/v1/pension/cases/{id}/gpf:authorise` | authorise GPF payment |

- **UI Behavior Notes:** GPF panel with closing balance, interest accrual, advances, final payable, nominee split (death), authorise action; masked account number (P02) with audited reveal.
- **Edge Cases:** Advance partially recovered in last salary; interest boundary at FY close; zero balance for NPS subscriber; nominee dispute.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GPFSettlementEngine`, `InterestCalculator`, G10 GPF client |
| Backend Flow | Fetch closing balance (G10) → interest to date → deduct advances → final payable → apportion (death) → authorise |
| Data Operations | Insert gpf_final_settlements; link to terminal settlement |
| Validation | Balance source present; interest rate effective; advances reconciled; `VAL-NOMINEE` 100% |
| Authorization | Officer compute; Authority authorise (SoD via P02) |
| State Changes & Side Effects | gpf DRAFT→COMPUTED→AUTHORISED→PAID; feeds FR-09; P05 audit |
| Failure Handling | G10 ledger unavailable → 412 `PRECONDITION_FAILED`; NPS/UPS subscriber → 409 `ERR-G11-SCHEME-MISMATCH` |
| Dependencies | G10, FR-09, FR-14 |
| Test Guidance | Interest math; advance deduction; nominee split; NPS/UPS routing; SoD |

---

### FR-G11-11 — PPO Generation & Digital PPO **(enhanced — R10, Improvement 20)**

- **Module:** G11-F11
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise)
- **User Story:** As a Sanctioning Authority, I want to issue a registry-numbered PPO — service, family, anticipatory, provisional, or revised — so the pensioner's entitlement is formally authorised, transmitted to the PDA, and delivered digitally.
- **Description:** Generate the PPO from sanctioned figures, allocate a unique `ppo_no`, render a digital PPO via the platform **DocumentGen** service (signed artefact in `documents`/G13), bind a PDA, for PDA_APPLIES_RELIEF carry basic + relief-formula reference, and produce pensioner/disbursing halves. Supports SERVICE_PENSION, FAMILY_PENSION, ANTICIPATORY, PROVISIONAL (Rule 9), REVISED. On P01 authorisation, the e-PPO is pushed to DigiLocker (over X.3, FR-24) and linked to Aadhaar/PRAN.
- **Acceptance Criteria:**
  - AC1: PPO issues only when the case is SANCTIONED (or anticipatory/provisional authorised).
  - AC2: `ppo_no` unique and registry-allocated; a REVISED PPO references and supersedes exactly one ACTIVE PPO.
  - AC3: e-PPO generated as a signed artefact (DocumentGen), available to self-service and delivered to DigiLocker (FR-24).
  - AC4: PPO carries basic pension, commuted portion, residual, effective-from, PDA binding, and (for PDA_APPLIES_RELIEF) the relief-formula reference.
  - AC5: Authorising the PPO creates/links the pensioner master record (FR-12).
  - AC6: A PROVISIONAL PPO links to `pen_provisional_pension_records` and is superseded by the final PPO on proceedings conclusion.
- **Business Rules:** BR1: Anticipatory/provisional PPOs superseded by the final PPO with adjustment. BR2: Authoriser ≠ preparer (SoD via P01/P02). BR3: PPO effective-from = pension commencement date. BR4: For PDA_APPLIES_RELIEF the PPO carries basic + relief formula; for M11_COMPUTES_FULL the disbursement carries the full computed amount.
- **Data Model References:** `pen_ppo_records`, `pen_pension_calculations`, `pen_commutation_records`, `pen_family_pension_records`, `pen_provisional_pension_records`, `pen_disbursing_authorities`, `pen_pensioners`, `documents` (G13).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/ppo:generate` | generate draft PPO |
| POST | `/api/v1/pension/ppos/{id}:authorise` | authorise & issue PPO (+DigiLocker push) |
| GET | `/api/v1/pension/ppos/{id}` | PPO detail + e-PPO link |
| POST | `/api/v1/pension/ppos/{id}:revise` | issue REVISED PPO |

- **UI Behavior Notes:** PPO composer showing sanctioned figures, type selector (incl. PROVISIONAL), PDA selector (model badge), registry number, e-PPO preview, DigiLocker-delivery indicator, authorise action; supersession banner; self-service e-PPO download.
- **Edge Cases:** Registry number collision/retry (idempotent); anticipatory/provisional→final supersession with arrear adjustment; revision before authorisation; PDA change after issue; family-pension PPO on death-in-service; DigiLocker push failure (X.3 retry queue).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PPOComposer`, `PPONumberRegistry`, `EPPORenderer` (DocumentGen), `PensionerLinker`, `DigiLockerPublisher` (X.3, FR-24) |
| Backend Flow | Assemble figures → allocate ppo_no (transactional) → render e-PPO (DocumentGen) → bind PDA + relief formula → P01 authorise → create/link pensioner → push DigiLocker (X.3) → mark prior SUPERSEDED on revise |
| Data Operations | Insert ppo_records; document link; pensioner upsert; supersede prior; set digilocker_ref |
| Validation | Case SANCTIONED; unique ppo_no (`VAL-MASTER-UNIQUE`); single ACTIVE PPO; SoD; provisional linkage |
| Authorization | Officer prepare; Authority authorise (P01) |
| State Changes & Side Effects | ppo DRAFT→ISSUED→AUTHORISED_TO_PDA→ACTIVE; prior→SUPERSEDED; G12 SR append; X.2 notifications; DigiLocker push |
| Failure Handling | Number collision → idempotent retry; not sanctioned → 409 `ERR-G11-CASE-NOT-SANCTIONED`; DigiLocker down → X.3 queue + retry (non-blocking) |
| Dependencies | FR-05..09, FR-22, E37, DocumentGen/G13, FR-24, feeds FR-12, FR-14 |
| Test Guidance | Uniqueness; SoD; supersession lineage (incl. provisional→final); e-PPO + DigiLocker; relief-formula carriage; pensioner linkage |

---

### FR-G11-12 — Pensioner Master & Lifecycle Management **(enhanced — R9 link, R11)**

- **Module:** G11-F12
- **Primary Role(s):** Pension Officer, Pensioner/Family Pensioner (self-service), Sanctioning Authority
- **User Story:** As a Pension Officer, I want a pensioner master that tracks life certificates, restoration, family-pension conversion, and proactive death/fraud signals so the pensioner is correctly maintained for life and beyond.
- **Description:** Maintain `pen_pensioners` from PPO authorisation: capture annual LC/DLC (verified over X.3 against Jeevan Pramaan; LC reminders via **`JOB-G11-LC-REMIND`**), suspend disbursement on overdue LC, restore the commuted portion at reduction-date+15yr (**`JOB-G11-RESTORE`**), and on a self-pensioner death convert to family pension (E26-driven, FR-08, `enhanced_basis=AFTER_RETIREMENT`). Consumes proactive death-detection signals (FR-20) and links any overpayment recovery (E38).
- **Acceptance Criteria:**
  - AC1: LC has a yearly due date; overdue beyond grace sets `SUSPENDED_NO_LC` and holds disbursement.
  - AC2: Submitting/verifying an LC reactivates the pensioner and releases held pension with arrear.
  - AC3: At restoration due date (reduction+15yr), the commuted portion is restored; `current_monthly_pension` reflects full basic.
  - AC4: On `date_of_death` for a self-pensioner, the system spawns family-pension conversion (E26/FR-08) and a FAMILY_PENSION PPO, moving the pensioner to CONVERTED_TO_FAMILY.
  - AC5: Pensioner contact/bank self-updates route through P01 maker-checker and pass pre-credit account verification (FR-14) before disbursement uses them.
  - AC6: A death detected via FR-20 triggers conversion and, if pension was drawn after death, opens an E38 recovery row.
- **Business Rules:** BR1: LC grace period configurable. BR2: Restoration applies only to the original pensioner. BR3: Family-pension conversion uses the E26 hierarchy. BR4: Late-reported death reconciles drawn-after-death pension into E38 recovery.
- **Data Model References:** `pen_pensioners`, `pen_life_certificates`, `pen_commutation_records` (restoration), `pen_family_pension_records`, `pen_family_members` (E26), `pen_ppo_records`, `pen_overpayment_recoveries` (E38).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/pensioners/{id}` | pensioner detail & lifecycle |
| POST | `/api/v1/pension/pensioners/{id}/life-certificate` | submit LC / DLC |
| POST | `/api/v1/pension/pensioners/{id}:report-death` | record death → conversion |
| PATCH | `/api/v1/pension/pensioners/{id}` | update bank/contact (P01 maker-checker + verification) |

- **UI Behavior Notes:** Pensioner 360: pension summary, LC status with due/overdue badges and a plain-language LC calendar (FR-15/§11), restoration countdown, conversion history, death-signal panel (FR-20), overpayment-recovery panel (E38), bank/contact (masked reveal); self-service LC submission with fallback and grievance entry.
- **Edge Cases:** Restoration coinciding with a DA revision (ordering §16.9); death reported late (E38 recovery); LC submitted just after suspension; family pensioner's own death (next E26 member); fraudulent LC detection; death detected by FR-20 before family reports it.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PensionerService`, `LifeCertificateProcessor` (DLC over X.3), `JOB-G11-RESTORE`, `DeathConversionOrchestrator`, `OverpaymentLinker` (E38) |
| Backend Flow | On PPO auth create pensioner → schedule LC due (`JOB-G11-LC-REMIND`) & restoration (`JOB-G11-RESTORE`) → LC submit/verify toggles active/suspended → restoration restores basic → death triggers conversion + FAMILY PPO + (if drawn-after-death) E38 recovery |
| Data Operations | Upsert pensioner; insert LC; update lifecycle_status; create family pension + PPO; open E38 row |
| Validation | LC due/grace; restoration date; death date ≥ commencement; bank-change P01 maker-checker + FR-14 verification |
| Authorization | Pensioner self-LC (Me); Officer verify; Authority sanction conversion |
| State Changes & Side Effects | lifecycle ACTIVE↔SUSPENDED_NO_LC→DECEASED→CONVERTED_TO_FAMILY/CEASED; disbursement hold/release; X.2 notifications |
| Failure Handling | DLC down → physical/video-KYC fallback; conversion missing family member → legal-heir flag; bank verification fail → block |
| Dependencies | FR-06, FR-08, FR-11, FR-14, FR-20, E26, E38, X.1, X.3 |
| Test Guidance | LC suspend/release+arrear; restoration timing; death conversion + PPO; FR-20 detection + E38 recovery; bank-change control; family-pensioner death chain |

---

### FR-G11-13 — Pension Revision (DA & Pay-Commission) **(enhanced — R6, R13)**

- **Module:** G11-F13
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), SysAdmin (rule tables)
- **User Story:** As a Pension Officer, I want to apply DA and pay-commission revisions across the pensioner population under a deterministic application order and the correct disbursement model so every pensioner's pension stays current with arrears computed correctly.
- **Description:** Run revision batches as **`JOB-G11-PENSION-RUN`** (X.1; per-period run key, period lock, backoff ×3) branching on the PDA disbursement model: **M11_COMPUTES_FULL** → recompute the full monthly figure, compute old vs new + arrears, instruct exact amounts (FR-14); **PDA_APPLIES_RELIEF (CPPC)** → issue a relief order (new DA% / pay-commission basis) for the bank to apply, and reconcile. When multiple events share an effective date for one pensioner, apply strictly in the §16.9 order. Also schedules age-based additional pension increments (80/85/90/95/100).
- **Acceptance Criteria:**
  - AC1: A DA-revision batch recomputes Dearness Relief for M11_COMPUTES_FULL pensioners as of the effective date; for PDA_APPLIES_RELIEF it issues a relief order and marks lines for reconciliation.
  - AC2: A pay-commission batch re-fixes basic pension and computes arrears from the effective date.
  - AC3: Old vs new and arrear amounts computed per pensioner with trace; batch requires P01 approval before APPLY.
  - AC4: Applied revisions are immutable (P05); corrections create a new batch.
  - AC5: Age-based additional pension increments auto-apply on the milestone birthday.
  - AC6: When ≥2 events share an effective date, they apply in the §16.9 order; the applied order is recorded in `calc_trace` (tested invariant).
- **Business Rules:** BR1: DA/pay-commission parameters are effective-dated rule-table rows (E30, SysAdmin-approved via config cascade). BR2: Family pensioners revised by the same batch. BR3: Arrears netting respects prior over-payment (E38). BR4: Revision branch determined by `pensioners.disbursement_model`.
- **Data Model References:** `pen_revisions`, `pen_pensioners`, `pen_da_relief_rates` (E30), `pen_disbursing_authorities` (model), `pen_disbursements` (arrears), `pen_overpayment_recoveries` (netting).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/revisions` | create revision batch (type, effective, scope) |
| POST | `/api/v1/pension/revisions/{id}:compute` | compute deltas / relief orders per model |
| POST | `/api/v1/pension/revisions/{id}:approve` | approve batch (P01) |
| POST | `/api/v1/pension/revisions/{id}:apply` | apply (instruct or issue relief order) |

- **UI Behavior Notes:** Revision console with batch parameters, model-segmented preview, delta preview (old→new, arrear), affected counts, event-ordering panel (§16.9), exception list, approve/apply gates, rollback-before-apply; per-pensioner drill-down.
- **Edge Cases:** Pensioner whose restoration/age-increment coincides (ordering §16.9); partial-month effective date; deceased between compute and apply (E38); pay-commission notional fixation anomaly; DA negative revision; mixed-model batch.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RevisionEngine` (`JOB-G11-PENSION-RUN`), `DisbursementModelRouter`, `EventOrderResolver` (§16.9), `ArrearCalculator`, P01 `BatchApprover`, age-increment scheduler |
| Backend Flow | Build cohort → segment by model → recompute + arrears (full) / build relief order (relief) → resolve concurrent-event order (§16.9) → P01 approve → atomic apply |
| Data Operations | Insert revision lines (staging) → on apply update `current_monthly_pension` / record relief order; insert arrears |
| Validation | Effective date (`VAL-EFFECTIVE`); eligibility; immutability post-apply (P05); deterministic ordering; model branch |
| Authorization | Officer compute; Authority approve (P01); SoD; SysAdmin only on tables |
| State Changes & Side Effects | revision DRAFT→COMPUTED→APPROVED→APPLIED; arrears queued / relief order emitted (X.3); X.2 notifications |
| Failure Handling | Per-pensioner error → quarantine line; apply fault → no partial commit; job terminal failure → `MSG-SYS-JOBFAIL` |
| Dependencies | E30, E37, G14, FR-12, FR-14, E38, X.1 |
| Test Guidance | DA recompute (full) vs relief-order (CPPC); pay-commission re-fix; arrear math; immutability; §16.9 ordering invariant; age-increment; deceased-mid-batch |

---

### FR-G11-14 — Treasury / Bank / PDA Integration (with Pre-Credit Verification) **(enhanced — R6, R8, R15)**

- **Module:** G11-F14
- **Primary Role(s):** Pension Officer (prepare), Sanctioning Authority (authorise), Treasury/PDA/Bank
- **User Story:** As a Pension Officer, I want to transmit authorised payment instructions to the disbursing authority over a defined interface, verify accounts before first credit, and reconcile acknowledgements so pensioners are paid correctly and a wrong-account payment is prevented.
- **Description:** Produce disbursement instruction batches (`JOB-G11-DISBURSE` on X.1) per the **X.3 payload-versioned PDA contract (§8.6)** for first pension, monthly pension (per model), arrears, gratuity, commuted value, GPF, terminal benefits; run pre-credit account verification (penny-drop / name-IFSC / NPCI mapper, E42, over X.3) before the first credit and block on mismatch; transfer PPO authorisation; track transmission/acknowledgement using the contract's ack schema and error taxonomy; reconcile paid/failed lines and raise exceptions/grievances; retry/re-route failures. **All external calls go through the X.3 framework — idempotent, circuit-broken, payload-versioned, credentials from P04.**
- **Acceptance Criteria:**
  - AC1: Only AUTHORISED instructions (SoD) are transmitted.
  - AC1a: No FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE line is transmitted to an account unless its `pen_bank_account_verifications` row is PASSED; mismatch blocks the line (IR16).
  - AC2: Each line ties to a PPO/pensioner/case and an amount; batch totals reconcile to the sum of lines.
  - AC3: Acknowledgements update `instruction_status` per the §8.6 ack schema; failed lines raise exceptions/grievances using the bank/treasury error taxonomy.
  - AC4: First pension instruction generated to commence on the pension start date (no break).
  - AC5: Idempotent transmission (X.3 idempotency + `Idempotency-Key`) prevents duplicate payments.
- **Business Rules:** BR1: Invalid/missing bank or PDA binding blocks the line. BR1a: Account verification (E42) must be PASSED before first credit; re-verification on bank-detail change. BR2: Failed lines retried (X.3 circuit-breaker/backoff) or re-routed, never silently abandoned. BR3: Monthly pension respects LC suspension and the disbursement model.
- **Data Model References:** `pen_disbursements`, `pen_bank_account_verifications` (E42), `pen_disbursing_authorities` (E37, contract+model), `pen_ppo_records`, `pen_pensioners`, `pen_terminal_settlements`, `pen_revisions` (arrears); `integration_credentials` (P04).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/disbursements` | create instruction batch |
| POST | `/api/v1/pension/accounts:verify` | run penny-drop / name-IFSC verification (X.3) |
| POST | `/api/v1/pension/disbursements/{id}:authorise` | authorise batch |
| POST | `/api/v1/pension/disbursements/{id}:transmit` | transmit to PDA/bank (X.3, per §8.6) |
| POST | `/api/v1/pension/disbursements/{id}/ack` | record acknowledgement |

- **UI Behavior Notes:** Disbursement console with batch validation (invalid/unverified accounts, held LC lines, model badge), account-verification status column (penny-drop result), authorise/transmit gates, acknowledgement reconciliation grid (paid/failed with error-taxonomy reasons), exception drill-down to grievance creation.
- **Edge Cases:** Partial bank acknowledgement; account closed; name mismatch on penny-drop (block); duplicate transmission retry; PDA format rejection (contract error taxonomy); pensioner suspended for LC mid-batch; clawback/overpayment (E38); CPPC relief-order vs computed-amount batches.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DisbursementBatcher` (`JOB-G11-DISBURSE`), `AccountVerifier` (E42, X.3), `PDAGatewayAdapter` (X.3, §8.6), `AckReconciler`, `ExceptionRouter` |
| Backend Flow | Build lines → verify accounts (E42 over X.3) → validate accounts/PDA/LC/model → authorise → transmit (X.3 idempotent, per contract) → ingest ack → reconcile → raise exceptions/E38 |
| Data Operations | Insert batch+lines; insert E42 verifications; update instruction_status; link grievance on failure |
| Validation | Authorised gate; account verification PASSED (IR16); totals tie-out; idempotency; model branch |
| Authorization | Officer prepare; Authority authorise; Treasury/PDA role ack |
| State Changes & Side Effects | instruction DRAFT→AUTHORISED→TRANSMITTED→ACKNOWLEDGED/PARTIALLY_ACK/FAILED→RECONCILED; X.2 notifications; P05 audit |
| Failure Handling | Gateway down → X.3 circuit-break + retry queue (then 412 `PRECONDITION_FAILED`); invalid account → 422 `ERR-G11-INVALID-ACCOUNT`; verification fail → 422 `ERR-G11-ACCOUNT-VERIFY`; duplicate → idempotent no-op |
| Dependencies | E37, E42, P04, X.3, FR-09, FR-11, FR-12, FR-13, feeds FR-16 |
| Test Guidance | Tie-out; SoD; penny-drop block-on-mismatch; idempotency; partial ack; LC-hold exclusion; model branch; failure→grievance |

---

### FR-G11-15 — Retirement Self-Service Portal & Benefit Estimators / What-If **(enhanced — R16)**

- **Module:** G11-F15
- **Primary Role(s):** Employee / Retiring Employee, Pensioner (self-service, Me workspace)
- **User Story:** As a retiring employee, I want to see my retirement journey in plain language, estimate my benefits as outcomes I understand, and submit my forms online so I can plan and act without visiting an office.
- **Description:** A self-service portal (Me workspace) with a 3-state plain-language tracker (In progress / Approved / Being paid) over the internal state machine, an outcome-framed benefit estimator / what-if, option submission (commutation, nominee, family-member, bank) via **P01 maker-checker (W.2 forms)**, document upload, an LC annual calendar, and a step-by-step bereavement/death-reporting guide. Pensioners reuse the portal for e-PPO (incl. DigiLocker), LC, and grievances. Mobile-responsive, WCAG 2.1 AA, canonical UI states.
- **Acceptance Criteria:**
  - AC1: Estimators label results indicative/non-binding (`is_binding=false`) and never write to the live case.
  - AC2: What-if can vary commutation fraction, emoluments, and date, recomputing all headline figures, expressed as plain-language outcomes.
  - AC3: Submitted options flow into the case via P01 maker-checker, not directly into sanctioned data.
  - AC4: The employee sees a 3-state citizen tracker; the internal state machine is not mirrored; legal terms retained only where statutory, with plain-language explanations.
  - AC5: All self-service screens cover empty/loading/error/success/permission states (no skeleton placeholders; Foundation §3).
  - AC6: An LC annual calendar shows when the LC is due, the four submission options, and what happens if missed.
  - AC7: A bereavement guide walks a family member through reporting a death and claiming family pension, mapped to FR-12/FR-08.
- **Business Rules:** BR1: Estimators use current rule tables but flag that final figures depend on verified service and emoluments. BR2: Self-service writes require identity/MFA (P02) and route to Pension Officer review (P01).
- **Data Model References:** `pen_benefit_estimates`, `pen_separation_cases` (status read; option submissions), `pen_nominees_beneficiaries`, `pen_family_members` (E26 declarations), `pen_retirement_forecasts` (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/estimates` | run an outcome-framed estimate / what-if |
| GET | `/api/v1/pension/me/case` | my 3-state tracker |
| POST | `/api/v1/pension/me/options` | submit commutation/nominee/family/bank options |
| GET | `/api/v1/pension/me/lc-calendar` | LC due dates & submission options |

- **UI Behavior Notes:** Estimator with sliders/inputs and an outcome card plus scenario comparison; 3-state journey tracker with plain-language stage descriptions; option wizard (W.2 forms); LC calendar; bereavement guide; pensioner tab for e-PPO/DigiLocker/LC/grievance. Mobile-first, WCAG 2.1 AA.
- **Edge Cases:** Estimator before any case; assumptions diverging from verified service; multiple saved scenarios; option after sanction (blocked); accessibility/keyboard-only; low-literacy/elderly user.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `EstimatorEngine` (reuses FR-05/06/07 dry-run), `OutcomeFramer`, `CitizenTracker` (3-state mapper), `OptionIntake` (P01/W.2), `LCCalendar`, `BereavementGuide` |
| Backend Flow | Run engines non-persisting → frame outcomes in plain language → save scenario; map internal state → 3 citizen states; options → P01 workflow task to Officer |
| Data Operations | Insert benefit_estimates (is_binding=false); option submissions create P01 workflow tasks |
| Validation | Identity/MFA (P02); assumption bounds; no write to sanctioned data; option-after-sanction block |
| Authorization | Employee (own, Me); Pensioner (own, Me) |
| State Changes & Side Effects | estimate saved; P01 option task; X.2 notifications |
| Failure Handling | Engine error → friendly message (`ERR-LOADFAIL`); submission after sanction → 409 `ERR-G11-CASE-LOCKED-OPTIONS` |
| Dependencies | FR-01, FR-05, FR-06, FR-07, FR-09, FR-12, P01/W.2 |
| Test Guidance | Non-binding isolation; outcome-framed what-if; 3-state mapping; option maker-checker; LC calendar; bereavement guide; state coverage; a11y |

---

### FR-G11-16 — Pensioner Grievance Management

- **Module:** G11-F16
- **Primary Role(s):** Pensioner / Family Pensioner, Pension Officer, Sanctioning Authority
- **User Story:** As a pensioner, I want to raise and track grievances so issues like non-receipt, wrong amount, or unapplied revision are resolved within an SLA.
- **Description:** Grievance intake (categorised, W.2 form), routing, **SLA tracking with escalation on P01 SLA timers**, linkage to case/PPO/disbursement, and resolution with P05 audit. Auto-creates grievances from disbursement failures (FR-14) and surfaces ageing/SLA-breach analytics (to G14).
- **Acceptance Criteria:** AC1: Captures category, description, priority, links to pensioner/case. AC2: SLA due date by category/priority; breach escalates to the Sanctioning Authority (P01 escalation → X.2). AC3: Disbursement failures auto-create a grievance linked to the failed line. AC4: Resolution requires a recorded action and notifies the pensioner; reopen supported. AC5: Status follows the state machine with full P05 audit.
- **Business Rules:** BR1: SLA matrix configurable (W.1/SLA setting). BR2: Critical grievances (payment-not-received) auto-prioritise. BR3: Closure requires resolution text (`VAL-COMMENT`).
- **Data Model References:** `pen_grievances`, `pen_pensioners`, `pen_separation_cases`, `pen_disbursements` (link).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/grievances` | raise grievance |
| GET | `/api/v1/pension/grievances/{id}` | grievance detail |
| POST | `/api/v1/pension/grievances/{id}:assign` | assign/route |
| POST | `/api/v1/pension/grievances/{id}:resolve` | resolve/close |

- **UI Behavior Notes:** Grievance inbox with SLA timers, priority badges, linked-record context, resolution form, pensioner-facing tracker; ageing/breach dashboard.
- **Edge Cases:** Grievance on a closed case; duplicates; escalation when officer unavailable (P01 delegate); reopened after closure; multilingual descriptions.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `GrievanceService`, P01 `SLATimer`/`EscalationEngine`, `AutoGrievanceFromDisbursement` |
| Backend Flow | Intake → set SLA → assign → P01 timer → escalate on breach → resolve → notify (X.2) → allow reopen |
| Data Operations | Insert/update grievances; link to case/PPO/disbursement |
| Validation | Required fields; SLA matrix; resolution text on close (`VAL-COMMENT`) |
| Authorization | Pensioner raise (own); Officer resolve; Authority on escalation |
| State Changes & Side Effects | OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED/ESCALATED/REOPENED; X.2 notifications |
| Failure Handling | Unavailable officer → re-route (P01); missing link → unlinked with flag |
| Dependencies | FR-12, FR-14, P01 |
| Test Guidance | SLA/escalation; auto-creation; resolve/reopen; linkage; state machine |

---

### FR-G11-17 — Forecasting & Pension-Liability Analytics

- **Module:** G11-F17
- **Primary Role(s):** Pension Officer, Department Head, Auditor
- **User Story:** As a Department Head, I want pension-liability and processing analytics so I can plan budgets, staffing, and SLA compliance.
- **Description:** Analytics over the retirement pipeline and pensioner population, feeding **G14** (PrimeSoft M16 analytics): due-for-retirement workload; projected pension-liability (DA/pay-commission scenarios); benefit-cost breakdown; processing SLA & ageing; grievance trends; and audit-objection ageing (FR-23). Read-only aggregations from G11 entities, **scoped per the user's RBAC entitlement (P02)**.
- **Acceptance Criteria:** AC1: Liability projection aggregates `pensioners.current_monthly_pension` × 12 plus pipeline cases, with scenario sliders. AC2: Workload by horizon/org/cadre. AC3: SLA analytics compute first-pension-on-time rate and average stage durations. AC4: All analytics respect org-unit row-level scope (P02); export honours permissions. AC5: Figures reconcile to underlying records.
- **Business Rules:** BR1: Read-only. BR2: Scenario projections labelled assumptions. BR3: Auditor sees all (Org-Admin read); managers see own scope.
- **Data Model References:** `pen_retirement_forecasts`, `pen_pensioners`, `pen_separation_cases`, `pen_pension_calculations`, `pen_gratuity_calculations`, `pen_family_pension_records`, `pen_grievances`, `pen_audit_objections` (all read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/analytics/liability` | liability projection (scenario params) |
| GET | `/api/v1/pension/analytics/workload` | due-for-retirement workload |
| GET | `/api/v1/pension/analytics/sla` | processing SLA & ageing |

- **UI Behavior Notes:** Analytics dashboard (in G14) with liability projection, workload, SLA gauges, benefit-cost composition, grievance trend, audit-objection ageing; export with scope enforcement.
- **Edge Cases:** Sparse data for small units; scenario extremes; mid-year pay-commission; scope-restricted export; very large pensioner population performance.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AnalyticsAggregator`, `LiabilityProjector`, `SLAComputer` (feeds G14) |
| Backend Flow | Query aggregates with P02 scope filter → apply scenario params → return series; cache hot aggregates |
| Data Operations | Read-only aggregates; materialised views for heavy aggregates |
| Validation | Scope enforcement (P02); reconciliation to source; scenario bounds |
| Authorization | Manager (own scope), Officer, Auditor (Org-Admin read) |
| State Changes & Side Effects | none (read-only); feeds G14 |
| Failure Handling | Timeout on huge cohort → paginated/streamed; scope breach → 403 `FORBIDDEN` |
| Dependencies | FR-01, FR-05..13, FR-23, G14 |
| Test Guidance | Reconciliation; scope; scenario projection; SLA math; large-cohort performance |

---

### FR-G11-18 — Service-Record Completeness & Discrepancy Resolution **(new — R5; GAP gov-specific engine on P01/P05)**

- **Module:** G11-F18
- **Primary Role(s):** Pension Officer (maker), SR Custodian (G12), Payroll Officer (G10), Sanctioning Authority
- **User Story:** As a Pension Officer, I want a rigorous service-record completeness gate that resolves every discrepancy and attests every non-qualifying spell before any benefit is computed, so determinism defends correct numbers.
- **Description:** Before CALCULATION, build a `pen_service_verifications` (E27) record over the full service span: detect gaps/discrepancies into a discrepancy ledger (E28); require per-non-qualifying-spell reason-code attestation; record condonations as orders in a condonation register (E29); and require **multi-point sign-off (SR Custodian + Payroll Officer + Pension Officer) as a P01 PARALLEL_ALL_OF flow**. CALCULATION is gated on this record being SIGNED_OFF/LOCKED with zero open discrepancies and all spells attested (IR2a). This is a net-new statutory engine authoring its own business logic but running on P01 (the sign-off flow) and P05 (immutable audit).
- **Acceptance Criteria:**
  - AC1: A `pen_service_verifications` record enumerates every gap/discrepancy as an E28 ledger line with type, period, source (G03/G04/G09/G10/G12), and required resolution.
  - AC2: Each non-qualifying spell must be reason-code-attested before sign-off; unattested spells block sign-off.
  - AC3: Condonations are recorded as E29 orders (order no, date, authority, document) and linked to the resolving discrepancy.
  - AC4: Sign-off requires SR Custodian + Payroll Officer + Pension Officer attestations (P01 PARALLEL_ALL_OF); `signoff_complete=true` sets SIGNED_OFF then LOCKED.
  - AC5: A case cannot enter CALCULATION unless the record is SIGNED_OFF/LOCKED, `discrepancy_open_count=0`, and `spells_attested_count=spells_total_count` (IR2a).
- **Business Rules:** BR1: Free-text resolution is not accepted for condonation — an E29 order is mandatory. BR2: Reason codes come from the controlled list. BR3: Re-opening a locked verification creates a new version and re-gates downstream calcs.
- **Data Model References:** `pen_service_verifications` (E27), `pen_service_discrepancies` (E28), `pen_condonation_orders` (E29), `pen_non_qualifying_spells` (attestation), `service_register_events` (G12, read), G03/G04/G09/G10 (read).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/service-verification:build` | build/refresh the verification + discrepancy ledger |
| GET | `/api/v1/pension/cases/{id}/service-verification` | verification + ledger + attestations |
| POST | `/api/v1/pension/cases/{id}/service-verification/discrepancies/{did}:resolve` | resolve a ledger line |
| POST | `/api/v1/pension/cases/{id}/service-verification:signoff` | multi-point sign-off (P01) → SIGNED_OFF/LOCKED |

- **UI Behavior Notes:** Verification workbench: discrepancy ledger grid, spell-attestation panel with reason-code dropdowns, condonation-order register with document upload, a three-signature sign-off bar (P01 PARALLEL_ALL_OF), and a prominent gate-status banner showing whether CALCULATION is unblocked.
- **Edge Cases:** Legacy spell with no reason code; condonation order on paper only (scan + register); overlapping discrepancies; sign-off attempted with open lines (blocked); new evidence after lock (re-version); prior-service discrepancy (links E39).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ServiceVerificationBuilder`, `DiscrepancyDetector`, `SpellAttestationService`, `CondonationRegister`, `MultiSignoffGate` (P01 PARALLEL_ALL_OF) |
| Backend Flow | Build span (vs G12) → detect gaps/discrepancies → write ledger → require attestations + condonation orders → P01 collect three sign-offs → set SIGNED_OFF/LOCKED → unblock FR-04/05 |
| Data Operations | Insert E27/E28/E29; update spell attestations; version on re-open |
| Validation | All discrepancies resolved; all spells attested; condonation orders present; three sign-offs |
| Authorization | Officer build/resolve; SR Custodian + Payroll + Officer sign-off (P01); Authority oversight |
| State Changes & Side Effects | verification DRAFT→DISCREPANCIES_OPEN→ATTESTED→SIGNED_OFF→LOCKED; gates case CALCULATION; P05 audit |
| Failure Handling | Open lines on sign-off → 409 `ERR-G11-DISCREPANCY-OPEN`; unattested spell → 409 `ERR-G11-SPELL-NOT-ATTESTED`; missing condonation order → 422 `VALIDATION_FAILED` |
| Dependencies | G12, G03/G04/G09/G10, P01, feeds FR-04, FR-05; gate in §10.1 |
| Test Guidance | Ledger completeness; spell attestation gate; condonation-order requirement; three-point sign-off; CALCULATION gate (IR2a); re-version |

---

### FR-G11-19 — Effective-Dated Pension Rule-Table Management **(new — R7, Improvement 21; on the config cascade)**

- **Module:** G11-F19
- **Primary Role(s):** System Administrator (Org Admin — maintain), Sanctioning Authority / Rule Approver (approve), Auditor (read)
- **User Story:** As a System Administrator, I want first-class, effective-dated, versioned rule tables for every benefit parameter so the benefit engines compute against real, approved, auditable rows.
- **Description:** Manage the rule-table entities E30–E36 through the **platform configuration cascade (`platform default → tenant → entity → employee`)** and versioning, each effective-dated (staged via `VAL-EFFECTIVE` / `JOB-G11-EFFDATE`) with a `DRAFT→APPROVED→EFFECTIVE→SUPERSEDED` lifecycle and **SoD (maintainer ≠ approver) enforced by P01/P02**. Every benefit calculation's `rule_version_ref` is a FK to the exact EFFECTIVE row used (IR17). The gratuity ceiling auto-steps +25% per 50% DA threshold crossed (E33), driven by E30.
- **Acceptance Criteria:**
  - AC1: Each rule table supports effective-dated rows with non-overlapping windows per key; a new effective row supersedes the prior.
  - AC2: A rule row follows DRAFT→APPROVED→EFFECTIVE→SUPERSEDED; only an approver distinct from the maintainer can APPROVE (SoD, P01/P02).
  - AC3: Benefit engines resolve the EFFECTIVE row for the relevant date and capture its id as `rule_version_ref` (FK); SUPERSEDED rows remain referenced by historic calcs (immutability, IR17, P05).
  - AC4: The gratuity ceiling (E33) auto-computes `current_effective_ceiling` by stepping +25% each time DA (E30) crosses each 50% threshold — no manual edit.
  - AC5: Missing/inactive rule rows for a required date raise `ERR-G11-RULE-NOT-EFFECTIVE` to the calling engine.
- **Business Rules:** BR1: SysAdmin maintains; a distinct approver approves (SoD); no self-approve. BR2: Government-notification reference captured per row. BR3: No row deleted once referenced; it is SUPERSEDED (soft-delete only).
- **Data Model References:** E30–E36 (`pen_da_relief_rates`..`pen_rounding_rules`).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/rules/{table}` | list rows (filter by effective date) |
| POST | `/api/v1/pension/rules/{table}` | create DRAFT row |
| POST | `/api/v1/pension/rules/{table}/{rowId}:approve` | approve (SoD) → APPROVED/EFFECTIVE |
| GET | `/api/v1/pension/rules/{table}/resolve?asOf=YYYY-MM-DD` | resolve the EFFECTIVE row for a date |

- **UI Behavior Notes:** Rule-table admin (Admin workspace) with table selector, effective-dated row grid, a P01 maker-checker approval flow, a version diff view, and a gratuity-ceiling panel showing the DA-driven auto-step; read-only for Auditor.
- **Edge Cases:** Overlapping windows (rejected); approving as the maintainer (blocked by SoD); a calc referencing a SUPERSEDED row (allowed for history); DA crossing two thresholds at once; retro-effective row affecting pending calcs.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RuleTableService`, `EffectiveDateResolver`, `RuleApprovalWorkflow` (P01), `GratuityCeilingAutoStepper` |
| Backend Flow | Create DRAFT → P01 approve (SoD) → set EFFECTIVE + supersede prior (config cascade) → engines resolve by date → E33 auto-step from E30 |
| Data Operations | Insert/version rule rows; non-overlap constraint per key; FK from calcs |
| Validation | `VAL-MASTER-UNIQUE`; non-overlapping windows; SoD on approve; no-delete-if-referenced; auto-step math; `VAL-EFFECTIVE` |
| Authorization | SysAdmin maintain; distinct Approver approve (P01); Auditor read |
| State Changes & Side Effects | rule row DRAFT→APPROVED→EFFECTIVE→SUPERSEDED; P05 audit |
| Failure Handling | Overlap → 409 `CONFLICT`; self-approve → 403 `FORBIDDEN`; resolve-miss → 422 `ERR-G11-RULE-NOT-EFFECTIVE` |
| Dependencies | Config cascade, P01/P02, consumed by FR-01, FR-05, FR-06, FR-07, FR-08, FR-13 |
| Test Guidance | Effective-date resolution; SoD approval; immutability of referenced rows; ceiling auto-step; retro-effective re-resolve |

---

### FR-G11-20 — Proactive Death Detection & Overpayment Recovery **(new — R9; over X.3)**

- **Module:** G11-F20
- **Primary Role(s):** Pension Officer, Sanctioning Authority, Auditor
- **User Story:** As a Pension Officer, I want proactive detection of pensioner deaths and payment anomalies plus a structured recovery-from-estate workflow so pension is not drawn into a deceased pensioner's account for months.
- **Description:** Run a **death-registry / Aadhaar-DBT reconciliation job (`JOB-G11-DEATHRECON` on X.1, calls over X.3 with P04 credentials)** and payment-anomaly/dormancy detection against the pensioner population. On a confirmed death where pension was drawn after the date of death, open an E38 recovery row, halt disbursement, trigger family-pension conversion (FR-12/FR-08), and drive recovery from family pension / estate / legal heir with a "pension drawn after death" exception report.
- **Acceptance Criteria:**
  - AC1: A scheduled job reconciles pensioner records against death-registry/Aadhaar-DBT signals (X.3) and flags probable deaths with a confidence/source.
  - AC2: Anomaly detection flags dormancy/abnormal patterns for review.
  - AC3: On confirmed death with post-death drawal, an E38 row is created, disbursement held, FR-12 conversion triggered.
  - AC4: Recovery supports FROM_FAMILY_PENSION / FROM_ESTATE / FROM_LEGAL_HEIR / WRITE_OFF, each P05-audited; partial recovery tracked.
  - AC5: A "pension drawn after death" exception report lists all open post-death drawals with ageing.
- **Business Rules:** BR1: Detection signals advisory until confirmed. BR2: Recovery-from-estate follows the statutory order. BR3: DBT/registry data processed under DPDP purpose-limitation, retained only as needed.
- **Data Model References:** `pen_overpayment_recoveries` (E38), `pen_pensioners` (death fields), `pen_family_pension_records` (conversion), `pen_disbursements` (hold); `integration_credentials` (P04).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/death-detection:run` | run reconciliation/anomaly job |
| GET | `/api/v1/pension/death-detection/flags` | probable-death / anomaly flags |
| POST | `/api/v1/pension/overpayments` | open a recovery row |
| POST | `/api/v1/pension/overpayments/{id}:recover` | record recovery (mode, amount) |
| GET | `/api/v1/pension/reports/drawn-after-death` | exception report |

- **UI Behavior Notes:** Death-detection console with flag queue (source, confidence), confirm/dismiss, an overpayment-recovery workspace, and the drawn-after-death exception report with ageing.
- **Edge Cases:** False-positive registry match (dismiss with reason); death confirmed long after the fact; pensioner already converted (recover from family pension); legal-heir dispute; write-off approval; signal source unavailable (X.3 circuit-break, job degrades gracefully).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DeathReconciliationJob` (`JOB-G11-DEATHRECON`, X.3), `AnomalyDetector`, `OverpaymentRecoveryService`, `ExceptionReporter` |
| Backend Flow | Reconcile pensioners vs registry/DBT (X.3) → flag probable deaths/anomalies → on confirmation open E38 + hold disbursement + trigger FR-12 → drive recovery → report |
| Data Operations | Insert E38 rows; update pensioner death fields; hold disbursement lines |
| Validation | Confirmation before recovery; statutory recovery order; DPDP retention |
| Authorization | Officer confirm/recover; Authority approve write-off; Auditor read |
| State Changes & Side Effects | E38 IDENTIFIED→NOTIFIED→UNDER_RECOVERY→RECOVERED/WRITTEN_OFF/LEGAL; disbursement hold; conversion trigger; P05 audit |
| Failure Handling | Signal source down → X.3 circuit-break, job degrades, flags carried over; false positive → dismiss with reason |
| Dependencies | FR-12, FR-08, FR-14, X.1, X.3, P04; external death-registry/Aadhaar-DBT |
| Test Guidance | Reconciliation match; anomaly flagging; post-death overpayment creation + hold; recovery modes; exception report ageing; false-positive |

---

### FR-G11-21 — PDA Registry & Disbursement Model + X.3 Interface Contract **(new — R6, R8)**

- **Module:** G11-F21
- **Primary Role(s):** System Administrator (maintain), Pension Officer, Treasury/PDA/Bank (integration), Sanctioning Authority
- **User Story:** As an administrator, I want each Pension Disbursing Authority registered with an explicit disbursement model and a defined X.3 interface contract so FR-13/FR-14 behave correctly per PDA and the longest-lead integration is not a launch-blocker.
- **Description:** Maintain `pen_disbursing_authorities` (E37) with `pda_disbursement_model` (M11_COMPUTES_FULL vs PDA_APPLIES_RELIEF), interface type (FILE_SFTP/REST_API on **X.3**), the §8.6 payload-versioned field list and ack schema, the bank/treasury error taxonomy, retry/re-route (X.3 circuit-breaker), penny-drop capability, **credentials from P04**, and a sandbox-certification flag. The model drives FR-13 and FR-14. Opening and certifying each PDA contract is a week-1 parallel workstream (§13).
- **Acceptance Criteria:**
  - AC1: Each PDA records model, interface type, payload contract version, ack schema, penny-drop capability, and its P04 credential ref.
  - AC2: FR-13/FR-14 branch on `pda_disbursement_model`; a PDA cannot go live (`status=ACTIVE`) until `sandbox_certified=true`.
  - AC3: The X.3 interface contract (§8.6) defines the disbursement field list, ack schema, and bank/treasury error taxonomy; transmissions conform to the payload contract version.
  - AC4: Retry/re-route semantics configured per PDA and honoured by FR-14 (X.3).
  - AC5: Changing a PDA's model or contract is P05-audited and re-certified in sandbox before taking effect.
- **Business Rules:** BR1: SysAdmin maintains; Authority approves go-live after sandbox certification. BR2: A pensioner/PPO bound to a PDA inherits its model (denormalised to `pensioners.disbursement_model`). BR3: No production transmission to an uncertified PDA. BR4: Credentials never inline — always via P04 `integration_credentials`.
- **Data Model References:** `pen_disbursing_authorities` (E37), `pen_ppo_records`/`pen_pensioners`/`pen_disbursements` (binding), §8.6 contract, `integration_credentials` (P04).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pension/pdas` | list PDAs + models |
| POST | `/api/v1/pension/pdas` | register/maintain a PDA |
| POST | `/api/v1/pension/pdas/{id}:certify` | mark sandbox-certified |
| POST | `/api/v1/pension/pdas/{id}:activate` | go-live (requires certification) |

- **UI Behavior Notes:** PDA registry with model badges, interface/contract version, penny-drop capability, sandbox-certification status, activate gate; contract-field reference (§8.6) link.
- **Edge Cases:** PDA changing from treasury to CPPC (model change, re-certify); contract version bump; uncertified PDA bound to a case; mixed-model pensioner migration; re-route to an alternate PDA on persistent failure.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PDARegistryService`, `DisbursementModelResolver`, `ContractVersionManager` (X.3 payload versioning), `SandboxCertifier` |
| Backend Flow | Register PDA + model + contract + P04 credential ref → X.3 sandbox tie-out → certify → activate → FR-13/14 resolve model at runtime |
| Data Operations | Insert/update E37; denormalise model to pensioners; bind to PPO/disbursement |
| Validation | Certification before activate; contract conformance; model branch coherence |
| Authorization | SysAdmin maintain; Authority activate; Auditor read |
| State Changes & Side Effects | PDA ACTIVE/SUSPENDED/RETIRED; model propagated; P05 audit |
| Failure Handling | Activate uncertified → 409 `ERR-G11-PDA-NOT-CERTIFIED`; contract mismatch on transmit → fail with taxonomy code |
| Dependencies | FR-13, FR-14, §8.6, X.3, P04; external PDA/treasury/bank |
| Test Guidance | Model branch propagation; sandbox-certify gate; contract conformance; re-route; model-change re-certification |

---

### FR-G11-22 — Provisional Pension (Rule 9 — Pending Proceedings) **(new — R10)**

- **Module:** G11-F22
- **Primary Role(s):** Pension Officer (maker), Sanctioning Authority (checker), Disciplinary Authority (G09)
- **User Story:** As a Pension Officer, I want a first-class provisional-pension path for retirees with pending departmental/judicial proceedings so they are paid a provisional pension while DCRG is fully withheld until the proceedings conclude.
- **Description:** When `proceedings_pending=true`, create a `pen_provisional_pension_records` (E41) with a provisional monthly pension and fully-withheld DCRG, issue a PROVISIONAL PPO (FR-11), and pay the provisional pension to avoid a break. On proceedings conclusion (**G09** linkage), regularise to a final pension/PPO (release withheld DCRG) or apply the decided recovery — never silently release DCRG before conclusion.
- **Acceptance Criteria:**
  - AC1: A case with pending proceedings produces an E41 row and a PROVISIONAL PPO; provisional pension payable from commencement (no break).
  - AC2: DCRG fully withheld (`dcrg_withheld=true`, amount captured) and excluded from terminal settlement payout until conclusion.
  - AC3: On conclusion, `conclusion_outcome` ∈ {EXONERATED, PENALTY_NO_RECOVERY, PENALTY_WITH_RECOVERY} drives regularisation: EXONERATED/PENALTY_NO_RECOVERY → release DCRG and issue final PPO superseding the provisional; PENALTY_WITH_RECOVERY → apply recovery then release the balance.
  - AC4: The G09 proceedings reference is mandatory; the linkage guard prevents final sanction/DCRG release while proceedings are ACTIVE.
  - AC5: Provisional pension later adjusted against the final pension with arrears/recovery.
- **Business Rules:** BR1: DCRG release impossible while E41 `status=ACTIVE`. BR2: Provisional pension amount per rule (typically the would-be pension). BR3: Conclusion must reference the G09 decision.
- **Data Model References:** `pen_provisional_pension_records` (E41), `pen_separation_cases` (proceedings flags), `pen_ppo_records` (PROVISIONAL), `pen_gratuity_calculations` (DCRG withheld), `pen_terminal_settlements` (exclusion).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/cases/{id}/provisional-pension` | create provisional pension + withhold DCRG |
| GET | `/api/v1/pension/cases/{id}/provisional-pension` | provisional detail |
| POST | `/api/v1/pension/cases/{id}/provisional-pension:conclude` | conclude on G09 decision → regularise/recover |

- **UI Behavior Notes:** Provisional-pension panel showing proceedings reference/status, provisional monthly amount, fully-withheld DCRG, a conclusion action with outcome selector, and the regularisation/recovery preview; PROVISIONAL badge on the PPO composer.
- **Edge Cases:** Proceedings prolonged for years; employee dies during proceedings (family pension + DCRG handling); exoneration with arrears; penalty with partial recovery; proceedings under appeal; anticipatory→provisional conversion.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ProvisionalPensionService`, `DCRGWithholder`, `ProceedingsLinkageGuard` (G09), `RegularisationOrchestrator` |
| Backend Flow | On proceedings_pending → create E41 + withhold DCRG → issue PROVISIONAL PPO → pay provisional → on conclusion regularise/recover → final PPO supersedes provisional |
| Data Operations | Insert E41; mark gratuity WITHHELD_PROCEEDINGS; exclude from settlement; supersede PPO on conclusion |
| Validation | Proceedings ref present; DCRG fully withheld; no release while ACTIVE (IR15); conclusion outcome required |
| Authorization | Officer create; Authority sanction; Disciplinary Authority (G09) supplies decision |
| State Changes & Side Effects | E41 ACTIVE→CONCLUDED_REGULARISED/CONCLUDED_RECOVERY; PROVISIONAL→final PPO; P05 audit |
| Failure Handling | DCRG release attempt while ACTIVE → 409 `ERR-G11-PROVISIONAL-PENDING`; missing proceedings ref → 422 `VALIDATION_FAILED` |
| Dependencies | G09, FR-07 (DCRG), FR-09, FR-11 |
| Test Guidance | Provisional payment no-break; DCRG full withhold + no-release guard; all three conclusion outcomes; final PPO supersession; arrears/recovery |

---

### FR-G11-23 — Audit Objection Management **(new — Improvement 19; on P05)**

- **Module:** G11-F23
- **Primary Role(s):** Auditor / AG, Pension Officer, Sanctioning Authority
- **User Story:** As an Auditor, I want AG/internal-audit objections against pension cases tracked from raise to closure with linkage to the case and calculation trace so the audit-objection-traceability goal is a built capability.
- **Description:** Capture audit objections (`pen_audit_objections`, E40) raised by AG/internal audit/treasury against a case/PPO/pensioner, linked to the disputed `calc_trace`; route to the Pension Officer for response within an SLA (P01 SLA timer); record the outcome (accepted-and-corrected via a linked revision, dropped, recovery raised, settled); surface ageing/closure analytics (FR-17, §12). The Auditor role maps to **Org-Admin read + P05 query entitlement** — no parallel write role.
- **Acceptance Criteria:**
  - AC1: An objection captures source, linked case/PPO/pensioner, the disputed `calc_trace` reference, and objection text.
  - AC2: An SLA due date is set (P01); the objection routes to the responsible Pension Officer with escalation on breach.
  - AC3: A response is recorded; the outcome drives closure — ACCEPTED_CORRECTED links a `pen_revisions` correction; DROPPED closes with rationale; RECOVERY_RAISED links an E38 recovery.
  - AC4: Objection status follows RAISED→UNDER_RESPONSE→RESPONDED→ACCEPTED/DROPPED→CLOSED with full P05 audit.
  - AC5: Open objections are visible on the case and in the Audit & Compliance Register (§12).
- **Business Rules:** BR1: Closure requires a recorded outcome and rationale. BR2: A correction is applied only through the amendment/revision workflow (never a silent edit — enforced by P05 immutability). BR3: Auditor raises; Officer responds; Authority approves corrective revision.
- **Data Model References:** `pen_audit_objections` (E40), `pen_separation_cases`, `pen_ppo_records`, `pen_pensioners`, `pen_revisions` (correction), `pen_overpayment_recoveries` (recovery link).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/audit-objections` | raise an objection |
| GET | `/api/v1/pension/audit-objections/{id}` | objection detail |
| POST | `/api/v1/pension/audit-objections/{id}:respond` | record response |
| POST | `/api/v1/pension/audit-objections/{id}:close` | close with outcome |

- **UI Behavior Notes:** Audit-objection inbox with SLA timers, source/priority, linked case/PPO/trace context, response form, outcome selector (revision/recovery linkage), ageing/closure dashboard; Auditor-facing tracker.
- **Edge Cases:** Objection on a closed case; objection requiring a rule re-interpretation (escalate); objection withdrawn by audit; multiple objections on one case; objection leading to recovery from a deceased pensioner's estate (E38).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AuditObjectionService`, P01 `SLATimer`, `OutcomeResolver` (revision/recovery linkage) |
| Backend Flow | Raise → set SLA → route → respond → resolve outcome (link revision/recovery) → close |
| Data Operations | Insert/update E40; link to case/PPO/trace/revision/recovery |
| Validation | Required fields; outcome + rationale on close; correction via revision workflow |
| Authorization | Auditor raise (Org-Admin read + entitlement); Officer respond; Authority approve corrective revision |
| State Changes & Side Effects | RAISED→UNDER_RESPONSE→RESPONDED→ACCEPTED/DROPPED→CLOSED; X.2 notifications; P05 audit |
| Failure Handling | Close without outcome → 422 `VALIDATION_FAILED`; correction outside workflow → 409 `CONFLICT` |
| Dependencies | FR-05..13 (calc_trace), FR-13 (revision), FR-20 (recovery), FR-17/§12 |
| Test Guidance | Trace linkage; SLA/escalation; outcome-driven closure; revision/recovery linkage; register visibility |

---

### FR-G11-24 — Digital Delivery & DigiLocker / DBT Linkage **(new — Improvement 20; over X.3)**

- **Module:** G11-F24
- **Primary Role(s):** Pension Officer, Pensioner (self-service), System Administrator
- **User Story:** As a pensioner, I want my signed e-PPO and revision orders delivered to DigiLocker and my PPO linked to my Aadhaar/PRAN so I have authoritative, portable digital access to my pension documents.
- **Description:** On PPO authorisation (FR-11) and revision-order issue (FR-13), **push the signed e-PPO/revision order to DigiLocker over X.3** (idempotent, circuit-broken, payload-versioned, credentials from P04) as an issued document, record the DigiLocker reference, and link the PPO to the pensioner's Aadhaar/PRAN for DBT and death-reconciliation (FR-20). Provide a resilient retrying delivery channel (X.3 retry queue) with a self-service fallback download. The pre-retirement workflow is benchmarked against *Bhavishya* (§13).
- **Acceptance Criteria:**
  - AC1: An authorised e-PPO is pushed to DigiLocker (X.3); `digilocker_pushed=true` and `digilocker_ref` recorded.
  - AC2: Revision orders are similarly delivered to the pensioner's DigiLocker.
  - AC3: The PPO is linked to Aadhaar/PRAN (`aadhaar_masked`/`pran`, encrypted, masked by P02) for DBT and FR-20 reconciliation.
  - AC4: DigiLocker push is non-blocking — failure queues an X.3 retry and does not block PPO authorisation; a self-service fallback download is always available.
  - AC5: Delivery status is visible to the pensioner and officer.
- **Business Rules:** BR1: Only signed, authorised artefacts are delivered. BR2: Aadhaar/PRAN stored encrypted, masked, access-logged (DPDP). BR3: Delivery failures retried with backoff (X.3); never silently dropped.
- **Data Model References:** `pen_ppo_records` (digilocker fields), `pen_pensioners` (aadhaar/pran), `documents` (G13, signed e-PPO), `pen_revisions` (orders); `integration_credentials` (P04).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/pension/ppos/{id}:deliver-digilocker` | push e-PPO to DigiLocker (X.3) |
| POST | `/api/v1/pension/revisions/{id}:deliver-digilocker` | push revision order |
| GET | `/api/v1/pension/ppos/{id}/delivery-status` | delivery status |
| POST | `/api/v1/pension/pensioners/{id}:link-aadhaar-pran` | link Aadhaar/PRAN |

- **UI Behavior Notes:** Delivery panel on the PPO composer and pensioner 360 showing DigiLocker delivery status (delivered/queued/failed-retrying), Aadhaar/PRAN linkage status (masked), fallback download button; pensioner self-service shows "Available in DigiLocker".
- **Edge Cases:** DigiLocker outage (X.3 queue + retry); pensioner without DigiLocker/Aadhaar (fallback download, manual linkage later); Aadhaar mismatch; revision order delivery for a converted family pensioner; re-delivery after a REVISED PPO supersession.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DigiLockerPublisher` (X.3), `AadhaarPRANLinker`, `DeliveryRetryQueue` (X.3) |
| Backend Flow | On PPO/revision authorisation → render signed artefact (DocumentGen) → push to DigiLocker (X.3) → record ref → link Aadhaar/PRAN → on failure enqueue X.3 retry |
| Data Operations | Update ppo digilocker fields; pensioner aadhaar/pran; delivery-status log |
| Validation | Signed artefact only; encryption/masking (P02); retry on failure |
| Authorization | Officer/system deliver; Pensioner read own; SysAdmin config |
| State Changes & Side Effects | digilocker_pushed set; X.3 retry queue; X.2 notifications; P05 audit |
| Failure Handling | DigiLocker down → X.3 queue + backoff (non-blocking); Aadhaar mismatch → flag for manual linkage |
| Dependencies | FR-11, FR-13, FR-20, DocumentGen/G13, X.3, P04; external DigiLocker/UIDAI/CRA |
| Test Guidance | e-PPO + revision delivery; ref capture; Aadhaar/PRAN linkage; non-blocking failure + retry; fallback download |

---

## 7. UI Requirements

All screens implement the **platform canonical UI-state standard** (Foundation §3): empty / loading (skeleton, no layout shift) / error (inline `ERR-*` id + retry, never a raw 500) / no-permission (gating menu hidden; deep-link → `ERR-FORBIDDEN`, not a 404 leak) / partial-data (render authorised, mask the rest per RBAC). PII/financial fields render **masked on serialization by P02** with the `E·AR` request-change pattern for sensitive edits. Screens live in the **Me / My Team / Admin** workspaces per RBAC role holdings. The shared component vocabulary (inline-edit field, effective-dated field, masked field, multi-step wizard, list+filter+bulk-action toolbar, approval action bar with P01 stage aliases, attachment control `VAL-FILE`, comment box `VAL-COMMENT`, date/effective-date picker, read-only audit-trail panel) is reused — not re-authored.

| Screen | Workspace / Primary role | Key elements | States covered |
|---|---|---|---|
| Due-for-Retirement Worklist | Admin / Pension Officer | horizon tabs, filters, initiate-case, alerts, export | empty, loaded, alert, scope-restricted |
| Separation Case Workspace | Admin / Pension Officer/Authority | P01 stage tracker, type-specific panels, scheme badge, PDA selector, documents, P05 audit timeline | draft, in-progress, pending-sanction, sanctioned, rejected, on-hold |
| Service-Verification Workbench | Admin / Officer/SR Custodian/Payroll | discrepancy ledger, spell-attestation, condonation-order register, three-point P01 sign-off bar, gate-status banner | draft, discrepancies-open, attested, signed-off, locked |
| Pre-Retirement Cockpit | Admin / Officer/SR Custodian | verification gate, SR gap list, no-dues checklist, anticipatory-pension panel | not-started, in-progress, cleared, blocked |
| Qualifying Service Editor | Admin / Pension Officer | service timeline, spell table, prior-service panel, condonation, live half-year total, min-service indicator | draft, verified, locked |
| Pension Worksheet | Admin / Officer/Authority | benefit-outcome branch, emoluments compare, flat-50% flag, UPS card, NPS-default card, service-gratuity redirect, trace | draft, computed, sanctioned, superseded |
| Commutation Calculator | Me / Admin — Employee/Officer | capped fraction slider, value/residual preview, factor (E31), reduction-date→restoration-date callout | draft, computed, sanctioned, restored |
| Gratuity Worksheet | Admin / Officer/Authority | type selector, half-years, slab, ceiling (auto-step), nominee split, withhold | draft, computed, sanctioned, withheld, paid |
| Family Pension Panel | Admin / Officer/Authority | normal/enhanced amounts, path-specific window timeline, E26 hierarchy, dual-FP/twins shares, transfer | computed, active, transferred, ceased |
| Terminal Settlement | Admin / Officer/Authority | component breakdown, tax panel (exempt/taxable/TDS/89(1)), recoveries, withheld, gross/taxable/TDS/net, export | draft, computed, sanctioned, partially-withheld, paid |
| GPF Settlement | Admin / Officer/Authority | balance, interest, advances, final payable, nominee split (masked) | draft, computed, authorised, paid |
| PPO Composer | Admin / Officer/Authority | figures, type selector (incl. PROVISIONAL), PDA selector (model badge), registry number, e-PPO preview, DigiLocker indicator, authorise | draft, issued, authorised, active, superseded |
| Provisional-Pension Panel | Admin / Officer/Authority | proceedings ref/status, provisional amount, withheld DCRG, conclusion action | active, concluded-regularised, concluded-recovery |
| Pensioner 360 | Admin/Me / Officer/Pensioner | pension summary, LC status + calendar, restoration countdown, conversion history, death-signal & overpayment panels, bank (masked) | active, suspended-no-LC, deceased, converted |
| Revision Console | Admin / Officer/Authority | batch params, model-segmented preview, delta preview, event-ordering panel (§16.9), exceptions, approve/apply gates | draft, computed, approved, applied, failed |
| Disbursement Console | Admin / Officer/Authority/Treasury | validation, account-verification (penny-drop) column, model badge, authorise/transmit, ack reconciliation, exceptions | draft, authorised, transmitted, acknowledged, partial-ack, failed |
| Rule-Table Admin | Admin / SysAdmin/Approver/Auditor | table selector, effective-dated row grid, P01 approval flow, version diff, gratuity-ceiling auto-step panel | draft, approved, effective, superseded |
| PDA Registry | Admin / SysAdmin/Authority | PDA list, model badges, interface/contract, penny-drop capability, certify/activate | active, suspended, retired |
| Death-Detection Console | Admin / Officer/Auditor | flag queue (source/confidence), confirm/dismiss, overpayment-recovery workspace, drawn-after-death report | flagged, confirmed, under-recovery, recovered |
| Audit-Objection Inbox | Admin / Auditor/Officer | SLA timers, linked case/PPO/trace, response form, outcome selector, ageing dashboard | raised, under-response, responded, accepted, dropped, closed |
| Retirement Self-Service | Me / Employee/Pensioner | 3-state plain-language tracker, outcome-framed estimator/what-if, option wizard (W.2), LC calendar, bereavement guide, e-PPO/DigiLocker | empty, loaded, error, success, permission |
| Grievance Inbox & Tracker | Admin/Me / Pensioner/Officer | SLA timers, priority, linked context, resolution form, ageing dashboard | open, assigned, in-progress, resolved, escalated, reopened |
| Pension Analytics | Admin / Manager/Officer/Auditor (in G14) | liability projection, workload, SLA gauges, benefit-cost, grievance trend, audit-objection ageing | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; responsive breakpoints 375/768/1280 px, touch targets ≥ 44×44 px; keyboard navigation & visible focus; dark mode; mobile-first self-service; money/bank/PAN/Aadhaar/PRAN **masked by P02** with audited reveal; amounts/dates per locale (`DD-MMM-YYYY`); the five canonical states on every screen; plain-language, compassionate flows for death-in-service/family-pension/bereavement; the citizen surface shows a **3-state tracker**, never the internal state machine; **no skeleton placeholders in production**.

---

## 8. API & Integration

### 8.1 Conventions (platform — Foundation §1)

REST under **`/api/v1`**; JSON; **JWT bearer carrying resolved roles/entity scope, enforced per request by P02 (`Authorization.check`)**; **five-dimension row-level scoping at the data layer** (an unscoped query is rejected); **cursor pagination only** (`?limit=` default 25 / max 100 + `cursor=` → `next_cursor`); **`Idempotency-Key`** on every transaction-creating POST (case-progression, sign-off, PPO-issue, revision, disbursement, account-verification — 24h replay returns the original result); **`X-Correlation-Id`** generated/echoed and written to every P05 audit and log line; `?sort=field:asc|desc`; effective-dated mutations accept `effective_from` (staged via `JOB-G11-EFFDATE`); timestamps UTC ISO-8601; money as `NUMERIC` strings.

### 8.2 Canonical Error Envelope (platform — overrides v2)

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "retirement_date is required", "field": "retirement_date", "details": { "reason": "CASE_INPUT_INCOMPLETE" } } }
```

2xx returns the resource payload; 4xx/5xx return the envelope above. The **correlation id is carried in the `X-Correlation-Id` response header, not a body `requestId`** (override of the v2 `{…, requestId}` shape; `MODULE_RECONCILIATION.md` §C).

### 8.3 Error-Code Catalog (platform 8-code table + G11 domain reasons)

G11 adopts the **platform 8-code table verbatim**; every domain condition is conveyed as a `details.reason` (or a registered `ERR-G11-*` message id) under one of these HTTP codes. The v2 codes are re-mapped (`VALIDATION_ERROR 400`→`VALIDATION_FAILED 422`; `AUTH_REQUIRED 401`→`UNAUTHENTICATED`; `INTERNAL_ERROR 500`→`INTERNAL`; `UPSTREAM_UNAVAILABLE 503` dropped — upstream failures are handled via **X.3 circuit-breaking + mapping** and surfaced as `PRECONDITION_FAILED 412`/`INTERNAL 500` with `ERR-LOADFAIL`).

| Platform code | HTTP | G11 use (domain `reason` / `ERR-G11-*`) |
|---|---|---|
| `VALIDATION_FAILED` | 422 | `CASE_INPUT_INCOMPLETE`, `ERR-G11-EMOLUMENTS`, `ERR-G11-RULE-NOT-EFFECTIVE`, `ERR-G11-COMMUTATION-LIMIT`, `ERR-G11-FACTOR-NOT-FOUND`, `ERR-G11-NOMINEE-SPLIT`, `ERR-G11-TAX-RULE`, `ERR-G11-INVALID-ACCOUNT`, `ERR-G11-ACCOUNT-VERIFY` |
| `UNAUTHENTICATED` | 401 | missing/expired session |
| `FORBIDDEN` | 403 | role/scope/SoD denied (P02); never leaks out-of-scope existence |
| `NOT_FOUND` | 404 | entity absent or out of scope |
| `CONFLICT` | 409 | `ERR-G11-DUP-CASE`, `ERR-G11-SERVICE-GAP`, `ERR-G11-VERIFICATION-INCOMPLETE`, `ERR-G11-DISCREPANCY-OPEN`, `ERR-G11-SPELL-NOT-ATTESTED`, `ERR-G11-FP-NOT-NOMINEE`, `ERR-G11-RECOVERY-PROTECTION`, `ERR-G11-SCHEME-MISMATCH`, `ERR-G11-CASE-NOT-SANCTIONED`, `ERR-G11-DUP-PPO`, `ERR-G11-CASE-LOCKED-OPTIONS`, `ERR-G11-REVISION-IMMUTABLE`, `ERR-G11-LC-SUSPENDED`, `ERR-G11-PROVISIONAL-PENDING`, `ERR-G11-PDA-NOT-CERTIFIED`, `ERR-G11-AUDIT-OBJECTION-OPEN`, `ERR-G11-DRAWN-AFTER-DEATH`; idempotency replay / duplicate workflow start (`ERR-DUP-INSTANCE`) |
| `PRECONDITION_FAILED` | 412 | upstream (G03/G10/G12/PDA/DigiLocker/registry) unavailable after X.3 retry; a required precondition unmet (`ERR-PRECOND`) |
| `RATE_LIMITED` | 429 | throttled |
| `INTERNAL` | 500 | unexpected server error (`ERR-LOADFAIL`) |

All `ERR-G11-*` and `MSG-G11-*` ids are registered in the **Foundation FS §5 Message Catalogue master index**; all `VAL-G11-*` ids (`VAL-G11-CASE`, `VAL-G11-QUALSVC`, `VAL-G11-PENSION`, `VAL-G11-COMMUTE`, `VAL-G11-FP`, `VAL-G11-PDA`) in **Foundation FS §2**; all `JOB-G11-*` ids in **Foundation FS §4** (see §`Alignment` for the job register).

### 8.4 JSON Examples (platform envelope)

**Service-verification sign-off (gate)**

```json
{ "verification_id": "sv-1001", "discrepancy_open_count": 0,
  "spells_attested_count": 2, "spells_total_count": 2, "signoff_complete": true, "status": "LOCKED" }
```

**Account verification failure (penny-drop, platform envelope + X-Correlation-Id header)**

```json
{ "error": { "code": "VALIDATION_FAILED", "field": "account_name",
  "message": "name mismatch: supplied 'R Kumar' vs bank 'Rajesh Kumar Sharma' (score 0.62)",
  "details": { "reason": "ERR-G11-ACCOUNT-VERIFY", "score": 0.62 } } }
```

**Authorise PPO (response, with DigiLocker + model)**

```json
{ "ppo_id": "ppo-4512", "ppo_no": "PPO-2026-004512", "ppo_type": "SERVICE_PENSION",
  "basic_pension": "56000.00", "commuted_portion": "22400.00", "residual_pension": "33600.00",
  "effective_from": "2026-10-01", "status": "AUTHORISED_TO_PDA", "pensioner_id": "PNR-000123",
  "pda_disbursement_model": "PDA_APPLIES_RELIEF", "relief_formula_ref": "da-2026-07",
  "digilocker_pushed": true, "digilocker_ref": "dl://issued/PPO-2026-004512" }
```

### 8.5 Integration Points (all external calls over X.3 with P04 credentials)

| System | Direction | Purpose | Channel |
|---|---|---|---|
| G01 Employee | in | employee master, DOB, cadre, DOJ, family declarations | internal (platform `employees`) |
| G03 Attendance/Leave | in | encashable leave balance; non-qualifying leave spells + reason codes | internal |
| G04 Leave→SR Integration | in | non-qualifying leave events posted in the SR | internal |
| G09 Disciplinary | in | compulsory-retirement order; proceedings status (provisional); recoveries; gratuity withhold | internal |
| G10 Payroll | in | last-pay-drawn/emoluments, GPF/NPS contributions, recoveries; verification provenance sign-off | internal |
| G12 Service Register | in/out | gap-free verification + discrepancy resolution (**in, consumer**); **separation/superannuation/retirement life events posted via `POST /api/v1/sr/ingest`** (**out, G11 is the SR writer** — §8.7) | internal (G12 ledger on P05) |
| Platform Documents / DocumentGen (G13 vault) | in/out | store/sign PPO/sanction/calc-sheet artefacts | internal service contract |
| G14 Dashboards | out | pension liability, workload, SLA, audit-objection KPIs | internal |
| Treasury / PDA / Bank CPPC | out/in | disbursement & PPO authorisation per disbursement model + §8.6 contract; ack | **X.3** (P04 creds) |
| Bank / NPCI mapper | out/in | penny-drop / name-IFSC account verification (pre-credit) | **X.3** (P04 creds) |
| Jeevan Pramaan / DLC | in | Digital Life Certificate verification | **X.3** (P04 creds) |
| NPS / CRA (PRAN) | in/out | NPS corpus reference, annuity/withdrawal handoff; UPS linkage | **X.3** (P04 creds) |
| Death registry / Aadhaar-DBT | in | proactive death-detection / overpayment reconciliation (FR-20) | **X.3** (P04 creds) |
| DigiLocker / UIDAI | out | e-PPO/revision-order delivery; Aadhaar/PRAN linkage (FR-24) | **X.3** (P04 creds) |
| Income-tax (TDS reference) | reference | tax-parameter reference for FR-09 TDS/89(1) | config / **X.3** if live |

### 8.6 PDA / Treasury Interface Contract (X.3 payload-versioned — R8)

Defines the concrete disbursement interface that FR-14/FR-21 implement on the **X.3 integration framework** (idempotent outbound calls, circuit-breaking, payload versioning, per-integration error mapping; credentials from **P04 `integration_credentials`**). Replaces v2's "pluggable" hand-wave and v2's bespoke transport assumptions.

- **Transport:** FILE_SFTP (signed, encrypted batch files) or REST_API (mTLS), per `interface_type` — both executed by X.3.
- **Disbursement line fields:** `batch_no`, `line_no`, `ppo_no`, `pensioner_no`, `disbursement_type`, `period_month/year`, `amount` (M11_COMPUTES_FULL) **or** `basic_pension` + `relief_formula_ref` (PDA_APPLIES_RELIEF), `account_no` (encrypted), `ifsc`, `account_name`, `verification_ref` (E42), `idempotency_key`.
- **Batch header/trailer:** `pda_code`, `payload_contract_version`, `line_count`, `control_total`, `generated_at`, `signature`.
- **Acknowledgement schema:** per-line `ack_status` ∈ {PAID, FAILED, RETURNED}, `ack_reference`, `failure_code` (error taxonomy), `paid_at`; batch-level `acknowledged_count`, `failed_count`, `control_total_ack`.
- **Bank/treasury error taxonomy (mapped by X.3 per-integration mapping to G11 exceptions/grievances):** `ACCOUNT_CLOSED`, `ACCOUNT_FROZEN`, `NAME_MISMATCH`, `INVALID_IFSC`, `LIMIT_EXCEEDED`, `DUPLICATE`, `PENSIONER_DECEASED`, `OTHER`.
- **Retry / re-route:** failed lines retried per the X.3 circuit-breaker policy (max attempts, backoff); persistent failures re-routed to an alternate PDA or raised as grievances; X.3 idempotency prevents double payment.
- **Sandbox tie-out:** every PDA must pass an X.3 sandbox batch (control-total tie-out, ack round-trip, penny-drop) before `sandbox_certified=true` and go-live (FR-21).

### 8.7 SR-Ledger Posting Contract — G11 as the separation/superannuation SR writer (FR-G11-SR; D1/D2 remediation)

G11 has **two distinct roles** against the **G12 Service Register**, and they are not contradictory:

1. **Consumer (input):** G11 reads/verifies the ledger for **qualifying-service** computation and runs the completeness/discrepancy gate (FR-G11-18, FR-G11-04), drawing non-qualifying spells/leave from **G04/G03** and service spans from **G12** — this consumer role is unchanged.
2. **Writer (output):** G11 **IS the canonical SR writer** for the **separation / superannuation / retirement life events** (and their benefit consequences). It does not own the ledger engine; it authors only the events below and posts them to the **single canonical write-port**.

**Write-port (canonical, D1):** all postings go to **`POST /api/v1/sr/ingest`** (and reversals to **`POST /api/v1/sr/ingest/reversal`**). A module-local `POST /api/v1/pension/cases/{id}:post-to-sr` is permitted **only as an internal façade that relays to `POST /api/v1/sr/ingest`** — it MUST NOT write the ledger table directly and MUST NOT use `/api/v1/sr/events`.

**Event types emitted by G11 (cite the exact G12-published `event_type_code` verbatim):**

| `event_type_code` | Emitted when | Notes |
|---|---|---|
| `SEPARATION` | any separation case reaches closure | generic separation life event |
| `SUPERANNUATION` | age/superannuation retirement | qualifying-service-bearing |
| `RETIREMENT` | retirement-on-completion / invalidation retirement | qualifying-service-bearing |
| `VOLUNTARY_RETIREMENT` | VRS accepted | qualifying-service-bearing (incl. weightage) |
| `RESIGNATION` | resignation accepted | service forfeiture per rule |
| `DEATH_IN_SERVICE` | death-in-service separation/benefit consequence | **G11 posts the death-in-service separation consequence; it does NOT post the `DECEASED` master flag — that is G01's identity event.** |
| `FAMILY_PENSION_SANCTIONED` | family pension sanctioned (death-in-service or conversion) | benefit-consequence event |

**Ingest payload contract (D1):**
- **Dedup tuple (mandatory on every ingest call):** `(source_module, source_reference_id, source_event_version)`, with explicit **`source_module="G11"`** (NOT inferred), validated against the event type's `allowed_source_modules`. `source_reference_id` is the G11 case / sanction id (no legacy `source_event_id`); `source_event_version` increments on supersession.
- **`fact_key` (mandatory for qualifying-service-bearing events):** `SEPARATION`, `SUPERANNUATION`, `RETIREMENT`, `VOLUNTARY_RETIREMENT` MUST derive and send `fact_key` per the event type's `fact_correlation_rule` (G12 FR-01); missing → `SR_FACT_KEY_REQUIRED`.
- **Scoping:** explicit required **`tenant_id`** and **`entity_id`** on the payload (G12 hashes `tenant_id`+`employee_id` into `entry_hash`).
- **Idempotency:** the HTTP `Idempotency-Key` header may be a writer-local hash, but the **persisted dedup tuple above is the contract**.
- **Reversal/correction:** never delete/edit (supersede-only); use the G12 **`is_reversal=true`** + `reverses_source_reference_id` envelope via `POST /api/v1/sr/ingest/reversal` with the published partner type. G12 auto-spawns the corrigendum.

**Where it runs:** FR-G11-02 (separation case closure), FR-G11-08 (family-pension sanction) and FR-G11-11 (PPO issue) relay their SR postings through this contract; the append is part of the same all-or-nothing transaction as the closure/sanction commit, with **P05** capturing the mutation.

---

## 9. Non-Functional Requirements (platform baseline + G11 specifics)

The platform NFR baseline (`PLATFORM_FOUNDATION.md` §8.2) **overrides the invented v2 NFR** (99.9%→99.5%, RPO 15min→1h).

| Category | Requirement |
|---|---|
| Performance (interactive) | Platform p95 < 500 ms @ 300 concurrent; reads/config per platform read-heavy targets (p95 < 300 ms cached / < 1000 ms uncached); benefit estimator < 1.5s; account verification (penny-drop, X.3) < 3s; writes p95 < 1500 ms |
| Performance (batch, X.1) | **M11_COMPUTES_FULL:** DA revision (`JOB-G11-PENSION-RUN`) for 100,000 pensioners within 30 min; monthly disbursement batch (`JOB-G11-DISBURSE`) < 10 min. **PDA_APPLIES_RELIEF:** relief-order issue + reconciliation < 5 min |
| Determinism | Identical results given the snapshotted rule version (E30–E36 FK) and signed-off verified inputs; external/indicative NPS-CRA/UPS-annuity figures excluded; concurrent-event order per §16.9 (tested invariant) |
| Input provenance | No benefit engine runs without a SIGNED_OFF/LOCKED service-verification record (FR-18, IR2a) |
| Continuity (critical) | First pension/anticipatory/provisional authorised before pension commencement for 100% of cases |
| Availability | **99.5%/month** (platform baseline); batch windows off-peak (X.1) |
| Scalability | Horizontal scaling of revision/disbursement workers; partition pensioner population by PDA/org/model; per-tenant job isolation (X.1) |
| Integrity | ACID per case sanction, PPO issue, conversion, revision-apply, death-conversion; immutable sanctioned snapshots & applied revisions enforced by **P05 DB-trigger**; pre-credit verification before first credit |
| Security | OIDC/SSO + **MFA for high-privilege statutory roles**; **RBAC v1.7 + five-dimension row-level scope enforced by P02**; SoD (incl. rule-table maker≠approver) by P01/P02; field-level encryption for bank/PAN/Aadhaar/PRAN/nominee/family/benefit amounts; **masked on serialization by P02** with audited reveal |
| Privacy | DPDP Act 2023; PII minimisation; heightened sensitivity for deceased/family data; death-registry/DBT data purpose-limited; **statutory retention never below the platform 7-yr floor** (P05) |
| Auditability | Every state change captured by **P05 DB-trigger** (`audit_log`), immutable, 7-yr; `calc_trace` retained; audit objections tracked to closure (FR-23); reading an audit log is itself audited |
| Recoverability | **RTO < 4 h, RPO < 1 h** (platform baseline); staged compute allows safe restart of revisions/disbursements; X.1 catch-up policy |
| Accessibility | WCAG 2.1 AA; plain-language, compassionate flows; 3-state citizen tracker; large-text/elderly-friendly self-service |
| Observability | Per platform §0.5: structured logs (correlation id), metrics, traces; first-pension-on-time SLA, LC-overdue alerts, disbursement-ack monitoring, revision exceptions, drawn-after-death exceptions, audit-objection ageing; job-run audit rows (X.1); notification-delivery metrics (X.2) |
| Compliance | Statutory pension/commutation/gratuity/family-pension/UPS/NPS-default/tax rules; effective-dated rule-table versioning on the config cascade (FR-19); audit-objection traceability (FR-23) |
| Tamper-evidence | Tracks **OPEN-PLAT-03** (audit hash-chaining to WORM) rather than inventing a parallel mechanism (Platform §P05/§Z) |

---

## 10. Workflow & State Diagrams (State Tables)

All approval/maker-checker transitions below are executed by **P01** (`workflow_instances`/`workflow_actions`, in-flight version pinning, SLA/escalation, SoD by P01/P02). State tables are carried from v2 unchanged.

### 10.1 Separation Case (FR-18 gate, proceedings)

| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | INITIATED | type-required inputs present |
| INITIATED | request SR verification | SR_VERIFICATION | Pension Officer |
| SR_VERIFICATION | service verification signed off **and** SR certified | NO_DUES | **FR-18 record SIGNED_OFF/LOCKED (IR2a)** & qsr.sr_verified=true |
| NO_DUES | no-dues cleared | CALCULATION | no_dues CLEARED or anticipatory/provisional exception |
| CALCULATION | benefits computed | PENDING_SANCTION | qsr LOCKED & calcs COMPUTED |
| PENDING_SANCTION | sanction (P01 approve) | SANCTIONED | checker ≠ maker (SoD); **if proceedings_pending, only PROVISIONAL path (FR-22)** |
| SANCTIONED | issue PPO | PPO_ISSUED | PPO authorised |
| PPO_ISSUED | settle terminal benefits | SETTLED | settlement PAID (DCRG withheld if proceedings) |
| SETTLED | close | CLOSED | SR event appended (G12) |
| any (non-terminal) | hold | ON_HOLD | with reason |
| any (non-terminal) | reject | REJECTED | with reason |
| ON_HOLD | resume | (prior state) | authority |

### 10.2 PPO (PROVISIONAL)

| Current | Event | Next |
|---|---|---|
| DRAFT | generate | ISSUED |
| ISSUED | authorise (P01) | AUTHORISED_TO_PDA |
| AUTHORISED_TO_PDA | PDA accepts / pensioner enrolled | ACTIVE |
| ACTIVE | revise | SUPERSEDED (new REVISED PPO ACTIVE) |
| ACTIVE (ANTICIPATORY/PROVISIONAL) | final/regularised | SUPERSEDED (final PPO ACTIVE) |
| ISSUED/ACTIVE | cancel (error) | CANCELLED |

### 10.3 Pensioner Lifecycle (proactive death)

| Current | Event | Next |
|---|---|---|
| ACTIVE | LC overdue beyond grace (`JOB-G11-LC-REMIND`) | SUSPENDED_NO_LC |
| SUSPENDED_NO_LC | LC submitted & verified | ACTIVE |
| ACTIVE | report death (self) **or FR-20 confirmed death** | DECEASED |
| DECEASED | family-pension conversion (E26) | CONVERTED_TO_FAMILY |
| DECEASED | post-death drawal detected | (open E38 overpayment recovery) |
| ACTIVE/CONVERTED | no eligible family member / cessation | CEASED |

### 10.4 Pension Revision Batch (ordering per §16.9)

| Current | Event | Next |
|---|---|---|
| DRAFT | compute deltas / relief orders | COMPUTED |
| COMPUTED | approve (P01) | APPROVED |
| APPROVED | apply (instruct or relief order) | APPLIED |
| COMPUTED/APPROVED | compute fault | FAILED |
| APPLIED | (immutable, P05) | — |

### 10.5 Disbursement Instruction (pre-credit verification precedes)

| Current | Event | Next |
|---|---|---|
| (pre) | account verification PASSED (E42, X.3) | (enables transmit) |
| DRAFT | authorise | AUTHORISED |
| AUTHORISED | transmit (X.3) | TRANSMITTED |
| TRANSMITTED | full ack | ACKNOWLEDGED |
| TRANSMITTED | partial ack | PARTIALLY_ACK |
| TRANSMITTED | rejected | FAILED |
| ACKNOWLEDGED/PARTIALLY_ACK | reconcile | RECONCILED |

### 10.6 Family Pension (path-specific window)

| Current | Event | Next |
|---|---|---|
| DRAFT | compute (enhanced_basis window) | COMPUTED |
| COMPUTED | sanction (P01) | SANCTIONED |
| SANCTIONED | begin payment | ACTIVE |
| ACTIVE | enhanced window expiry | (auto step-down to normal) |
| ACTIVE | beneficiary cessation w/ next eligible (E26) | TRANSFERRED |
| ACTIVE/TRANSFERRED | no eligible family member | CEASED |

### 10.7 Grievance

| Current | Event | Next |
|---|---|---|
| OPEN | assign | ASSIGNED |
| ASSIGNED | start work | IN_PROGRESS |
| IN_PROGRESS | resolve | RESOLVED |
| RESOLVED | close | CLOSED |
| any | SLA breach (P01) | ESCALATED |
| CLOSED | reopen | REOPENED |

### 10.8 Service Verification

| Current | Event | Next |
|---|---|---|
| DRAFT | build ledger | DISCREPANCIES_OPEN |
| DISCREPANCIES_OPEN | all discrepancies resolved & spells attested | ATTESTED |
| ATTESTED | three-point sign-off (P01 PARALLEL_ALL_OF) | SIGNED_OFF |
| SIGNED_OFF | lock | LOCKED |
| LOCKED | new evidence | (new version → DRAFT) |

### 10.9 Provisional Pension

| Current | Event | Next |
|---|---|---|
| (case) | proceedings_pending | ACTIVE (provisional pension paid, DCRG withheld) |
| ACTIVE | conclusion: EXONERATED / PENALTY_NO_RECOVERY | CONCLUDED_REGULARISED (release DCRG, final PPO) |
| ACTIVE | conclusion: PENALTY_WITH_RECOVERY | CONCLUDED_RECOVERY (recover then release balance) |

### 10.10 Rule-Table Row & Audit Objection

| Rule row | Event | Next |
|---|---|---|
| DRAFT | approve (SoD, P01) | APPROVED |
| APPROVED | reach effective date (`JOB-G11-EFFDATE`) | EFFECTIVE |
| EFFECTIVE | new effective row | SUPERSEDED |

| Audit objection | Event | Next |
|---|---|---|
| RAISED | route | UNDER_RESPONSE |
| UNDER_RESPONSE | respond | RESPONDED |
| RESPONDED | accept (link revision) / drop | ACCEPTED / DROPPED |
| ACCEPTED/DROPPED | close | CLOSED |

---

## 11. Notifications (via X.2 / W.3; `MSG-G11-*` ids)

Channels per BRD §9.1 — **IN_APP + EMAIL fire in parallel for approvals**; **EMAIL for approval-workflow and statutory notices (pension sanction, PPO, charge-linked) is mandatory and not user-suppressible** (Platform §X.2 / BRD §9.9). Recipients/channels resolved by **W.3**; templates referenced by `MSG-G11-*` id (never inlined); retry exponential backoff up to 5 attempts + dead-letter queue; every dispatch P05-audited.

| Event | Recipient | Channel | Trigger FR | Msg id |
|---|---|---|---|---|
| Employee crosses retirement horizon threshold | Pension Officer | in-app, email | FR-01 | `MSG-G11-FORECAST-ALERT` |
| Separation case initiated / sanctioned | Employee, Officer, Authority | in-app, email | FR-02 | `MSG-G11-CASE-*` |
| Service-verification discrepancy assigned / signed off | Officer, SR Custodian, Payroll | in-app, email | FR-18 | `MSG-G11-SIGNOFF-*` |
| SR verification required / certified | SR Custodian, Officer | in-app, email | FR-03 | `MSG-G11-SR-*` |
| No-dues item pending / cleared | No-dues owners, Officer | in-app, email | FR-03 | `MSG-G11-NODUES-*` |
| Anticipatory / provisional pension authorised | Employee, PDA | in-app, email | FR-03, FR-22 | `MSG-G11-PROVISIONAL` |
| Benefits computed / sanctioned (incl. service gratuity / UPS / NPS-default) | Employee, Authority | in-app, email | FR-05..09 | `MSG-G11-BENEFIT-*` |
| PPO issued (e-PPO available **in DigiLocker**) | Pensioner, PDA | in-app, email, SMS | FR-11, FR-24 | `MSG-G11-PPO-ISSUED` |
| Life-certificate calendar reminder / due / overdue / suspension | Pensioner | in-app, email, SMS | FR-12, FR-15 | `MSG-G11-LC-*` |
| Commuted portion restored (reduction+15yr) | Pensioner | in-app, email | FR-12 | `MSG-G11-RESTORE` |
| Pension revised (DA/pay-commission) with arrear / relief order | Pensioner | in-app, email | FR-13 | `MSG-G11-REVISION` |
| Disbursement transmitted / failed; account-verification mismatch | Officer, Pensioner (on failure) | in-app, email, SMS | FR-14 | `MSG-G11-DISBURSE-*` |
| Family pension sanctioned / transferred; bereavement guidance | Family member, Authority | in-app, email | FR-08, FR-12, FR-15 | `MSG-G11-FP-*` |
| Probable death flagged / overpayment opened | Officer, Auditor | in-app, email | FR-20 | `MSG-G11-DEATH-*` |
| Audit objection raised / responded / escalated / closed | Auditor, Officer, Authority | in-app, email | FR-23 | `MSG-G11-AUDITOBJ-*` |
| Grievance raised / resolved / escalated | Pensioner, Officer, Authority | in-app, email | FR-16 | `MSG-G11-GRIEVANCE-*` |

---

## 12. Reporting & Analytics (read-only, P02-scoped, feeds G14)

| Report / Dashboard | Audience | Contents |
|---|---|---|
| Due-for-Retirement Forecast | Pension Officer, Dept Head | counts by horizon/org/cadre; case-initiation status |
| Pension Liability Projection | Dept Head, Finance, Auditor | current & projected annual liability; DA/pay-commission scenarios |
| Benefit-Cost Composition | Finance, Auditor | pension/gratuity/commutation/family-pension/service-gratuity/UPS cost split |
| Processing SLA & Ageing | Pension Officer, Dept Head | stage durations; first-pension-on-time rate; backlog; service-verification gate time |
| Pensioner Population & Lifecycle | Officer, Auditor | active/suspended/converted; LC compliance; age distribution |
| Revision Impact | Officer, Finance | per-batch old→new, arrear totals, exceptions, model split |
| Disbursement Reconciliation | Officer, Treasury | transmitted vs acknowledged vs failed; ageing; account-verification failures |
| Pension Drawn After Death (Exception) | Officer, Auditor | post-death drawals, overpayment & recovery status (FR-20) |
| Grievance Trends | Officer, Dept Head | volume by category; SLA compliance; reopen rate |
| Audit & Compliance Register | Auditor | sanction trail, SoD adherence, rule-version usage, P05 immutability proofs, open/closed audit objections with trace linkage (FR-23) |

All analytics are read-only, **scoped per the user's RBAC entitlement at the data layer (P02)**, reconcile to source records, and feed **G14** (PrimeSoft M16 analytics).

---

## 13. Migration & Launch (on P06)

Legacy pensioner/pension data migrates through the **P06 ETL+V framework** (Extract → Validate → Transform → Load → Verify; scripted idempotently; **three mandatory staging dry runs gate cutover**; waves; `migration_runs` ledger; failed records logged with source row + violated rule). Every migrated G11 table carries a **`g11_source_id` traceability + dedup column** (the `GAP (gov-specific)` analogue of `darwinbox_source_id` — the legacy source is the government pension register, not Darwinbox).

### 13.1 Data Migration

- Migrate the existing pensioner population: pensioner master, current pension, PPO numbers, **PDA bindings + disbursement model**, bank details (encrypted), **Aadhaar/PRAN**, LC status, and commutation/restoration schedules (capturing reduction dates; flag `migrated_date_unknown` where unavailable).
- Migrate in-flight separation cases at their current stage with verified service and computed benefits where available; build service-verification records (FR-18) for in-flight cases.
- Map legacy separation types and schemes (OPS/NPS/UPS); **load and sign off the effective-dated rule-table entities (E30–E36)** through the config cascade — the genuine critical path.
- Load the **family-members register (E26)** (Form 3/14) distinct from nominee registers (E21); load **prior-service records (E39)**.

### 13.2 Validation & Parallel Run

- Recompute a statistically significant sample of legacy pensions/gratuities (incl. service-gratuity, UPS, NPS-default, path-specific family pension, tax) and reconcile within tolerance.
- Run a parallel DA revision against legacy output and tie out per-pensioner deltas per disbursement model.
- Validate PPO-number uniqueness and PDA bindings; **dry-run a disbursement batch in an X.3 sandbox PDA channel with the §8.6 contract and penny-drop tie-out** (FR-21).
- Tie out the gratuity-ceiling auto-step against the current DA level.

### 13.3 Cutover & Launch

- Freeze legacy writes; final delta migration (P06 cutover freeze); switch disbursement instructions to G11; verify the first post-cutover monthly disbursement end-to-end with PDA acknowledgement per model.
- Enable pensioner self-service (3-state tracker, outcome estimator, e-PPO/DigiLocker, LC calendar, bereavement guide) after data validation.
- Benchmark the pre-retirement workflow against **DoPPW *Bhavishya***; enable **DigiLocker** delivery over X.3 (FR-24).

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| Rule-table entities (E30–E36) loaded, approved & signed off (config cascade) | required (critical path) |
| PDA registry + disbursement model + §8.6 X.3 contract + sandbox certification | required (week-1 workstream) |
| Service-verification (FR-18) gate operational (P01 sign-off) | required |
| Pensioner master reconciled to legacy counts & sums (P06 reconciliation) | required |
| Sample benefit recomputation within tolerance (incl. service-gratuity/UPS/NPS-default/tax) | required |
| Family-members register (E26) loaded distinct from nominees | required |
| Penny-drop / account-verification operational (X.3) | required |
| PPO-number registry continuity verified | required |
| Disbursement sandbox tie-out with PDA (control total + ack + penny-drop, X.3) | required |
| SoD roles & approvals (incl. rule-table maker≠approver) configured in RBAC v1.7 | required |
| DLC/Jeevan Pramaan + DigiLocker integration tested with fallback (X.3) | required |
| Death-registry/Aadhaar-DBT reconciliation (FR-20) operational (X.3) | required |
| P05 audit, immutability & audit-objection tracking verified | required |
| `JOB-G11-*` jobs registered on X.1 with Foundation §4 index entries | required |

---

## Alignment with PrimeSoft Platform

This section satisfies `PLATFORM_FOUNDATION.md` §9.6: it maps each G11 FR to the platform service(s) it runs on and names the `GAP (gov-specific)` engines G11 authors.

### A. FR → Platform Service Map

| FR | P01 Workflow | P02 RBAC | P05 Audit | X.1 Jobs | X.2 Notif | X.3 Integration | P04 Creds | P06 Migration | W.1/W.2 | GAP (gov-specific) engine authored |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-01 Forecasting | — | ✓ | ✓ | `JOB-G11-FORECAST` | ✓ | — | — | — | — | forecast projector |
| FR-02 Separation case | ✓ (case flow) | ✓ (SoD) | ✓ | — | ✓ | — | — | ✓ | W.1/W.2 | separation-case engine |
| FR-03 Pre-retirement | ✓ (no-dues) | ✓ | ✓ | — | ✓ | — | — | — | W.1 | anticipatory-pension logic |
| FR-04 Qualifying service | — | ✓ | ✓ | — | — | — | — | — | — | **qualifying-service ledger** |
| FR-05 Pension calc | ✓ (sanction) | ✓ | ✓ | — | ✓ | X.3 (CRA) | ✓ | — | — | **pension calculation engine** |
| FR-06 Commutation | ✓ | ✓ | ✓ | `JOB-G11-RESTORE` | ✓ | — | — | — | — | commutation engine |
| FR-07 Gratuity | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | gratuity engine |
| FR-08 Family pension | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | family-pension engine |
| FR-09 Terminal settlement | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | settlement + tax engine |
| FR-10 GPF | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | GPF settlement engine |
| FR-11 PPO | ✓ (authorise) | ✓ (SoD) | ✓ | — | ✓ | X.3 (DigiLocker) | ✓ | — | DocumentGen | PPO registry + e-PPO |
| FR-12 Pensioner lifecycle | ✓ (bank change) | ✓ | ✓ | `JOB-G11-LC-REMIND`, `JOB-G11-RESTORE` | ✓ | X.3 (DLC) | ✓ | — | — | pensioner master/lifecycle |
| FR-13 Revision | ✓ (approve) | ✓ | ✓ | `JOB-G11-PENSION-RUN`, `JOB-G11-EFFDATE` | ✓ | X.3 (relief orders) | ✓ | — | — | revision engine + §16.9 order |
| FR-14 Disbursement/PDA | ✓ (authorise) | ✓ | ✓ | `JOB-G11-DISBURSE` | ✓ | **X.3 (treasury/PDA, penny-drop)** | ✓ | — | — | disbursement engine |
| FR-15 Self-service | ✓ (options) | ✓ (MFA) | ✓ | — | ✓ | — | — | — | W.2 forms | estimator/citizen layer |
| FR-16 Grievance | ✓ (SLA) | ✓ | ✓ | — | ✓ | — | — | — | W.1 | grievance engine |
| FR-17 Analytics | — | ✓ (scope) | ✓ | — | — | — | — | — | — | liability analytics (feeds G14) |
| FR-18 Service verification | ✓ (PARALLEL_ALL_OF sign-off) | ✓ | ✓ | — | ✓ | — | — | — | W.1 | **e-SR completeness gate** |
| FR-19 Rule tables | ✓ (approve, SoD) | ✓ | ✓ | `JOB-G11-EFFDATE` | — | — | — | ✓ | config cascade | effective-dated rule tables |
| FR-20 Death detection | ✓ (write-off) | ✓ | ✓ | `JOB-G11-DEATHRECON` | ✓ | **X.3 (death registry/DBT)** | ✓ | — | — | death-detection + recovery |
| FR-21 PDA registry | ✓ (activate) | ✓ | ✓ | — | — | **X.3 (sandbox cert)** | ✓ | — | — | PDA registry + model |
| FR-22 Provisional pension | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | Rule-9 provisional engine |
| FR-23 Audit objection | ✓ (SLA) | ✓ (Auditor=Org-Admin read) | ✓ | — | ✓ | — | — | — | — | audit-objection tracker |
| FR-24 DigiLocker/DBT | — | ✓ | ✓ | — | ✓ | **X.3 (DigiLocker/UIDAI/CRA)** | ✓ | — | DocumentGen | digital-delivery linkage |

### B. `JOB-G11-*` Register (registered against Foundation FS §4; runs on X.1)

| Job id | Purpose | Cadence | Runner guarantees (X.1) |
|---|---|---|---|
| `JOB-G11-FORECAST` | Refresh due-for-retirement projections & threshold alerts | nightly | idempotent per-period key; backoff ×3; `JOB-FAIL`→`MSG-SYS-JOBFAIL` |
| `JOB-G11-EFFDATE` | Apply effective-dated rule-table rows due today (config cascade) | daily | period-aware; staged-not-live |
| `JOB-G11-PENSION-RUN` | DA/pay-commission revision batch (model-segmented) | on-event / scheduled | period lock; per-tenant isolation; run audit row |
| `JOB-G11-DISBURSE` | Monthly disbursement instruction batch (X.3 transmit) | monthly | idempotent; period lock |
| `JOB-G11-RESTORE` | Commuted-portion restoration at reduction+15yr | daily | idempotent; catch-up policy |
| `JOB-G11-LC-REMIND` | Life-certificate due/overdue reminders & suspension | daily | idempotent |
| `JOB-G11-DEATHRECON` | Death-registry/Aadhaar-DBT reconciliation & anomaly detection (X.3) | daily | degrades gracefully on X.3 circuit-break |
| `JOB-G11-SIGNOFF-REMIND` | Remind pending FR-18 three-point sign-off tasks | daily | idempotent |

### C. RBAC v1.7 Role Additions (registered in RBAC §4.3/§2.2; SoD by P01/P02)

| Government actor | Expressed as (RBAC v1.7) | SoD / scope |
|---|---|---|
| **Pension / Dealing Officer** | new entity-scoped module-admin role (analogous to Payroll Admin, RBAC §2.2) + capability flag | maker; entity + org-unit scope; MFA |
| **Pension Sanctioning Authority / Head of Office** | new role (P01 approver) | checker; cannot self-approve (multi-role INTERSECTION); MFA |
| **SR Custodian / Registrar (G12)** | new entity-scoped role + capability flag on the G12 ledger | certifies SR; case-scoped |
| **PDA / Treasury / Bank CPPC** | new role + capability flag; integration identity over X.3 | disbursement ack; no calc authority |
| **Disciplinary Authority (G09)** | existing G09 new role (referenced) | supplies proceedings decision (FR-22) |
| **Auditor / AG** | **map to Org-Admin read + time-bound entitlement + P05 query access** | read-all; raises objections; **no parallel write role** |
| **System Administrator** | **map to Org Admin / Platform Super Admin** | rule-table maintain; no transactional self-approval |

All new roles/flags are **ADDITIONS** to the RBAC v1.7 taxonomy (never a parallel scheme); PII Protection Ceiling and field masking apply unchanged; capability flags are Org-Admin-granted and P05-audited.

### D. Net-New (`GAP gov-specific`) Engines Authored by G11

Per `MODULE_RECONCILIATION.md` §D, G11 authors the statutory business logic PrimeSoft lacks — **`qualifying_service_ledger`, `pension_calculation`, `commutation`, `terminal_benefits`, `pension_sanction`** (and the FR-18 completeness gate, FR-19 rule tables, FR-20 death detection, FR-21 PDA model, FR-22 Rule-9 provisional pension) — each **running on P01 (workflow), P05 (audit), P06 (migration)** and consuming G01 + the G12 SR ledger. No platform engine is re-implemented.

---

## Amendments (v2 → v3: platform re-grounding)

| # | v2 (invented `SHARED_FOUNDATION`) | v3 (platform-grounded) | Source |
|---|---|---|---|
| 1 | Module code `M11-PEN` | **`G11`** (alias `GOV-M11`); cross-refs re-keyed to `G01/G03/G04/G09/G10/G12/G14` | `MODULE_RECONCILIATION.md` §B |
| 2 | "Shared workflow engine" + `workflow_instances`/`workflow_tasks` | **P01 WorkflowEngine** (`workflows`/`workflow_instances`/`workflow_actions`); five patterns; in-flight version pinning; SoD by P01/P02; W.1/W.2 configured flows/forms | §C, Platform §P01 |
| 3 | Local `audit_log`, "immutable on every state change" | **P05 dual log** (`audit_log` + `security_audit_log`), DB-trigger capture, immutable, 7-yr; tamper-evidence tracks OPEN-PLAT-03 | §C, Platform §P05 |
| 4 | Module-local schedulers ("refreshed nightly", restoration/revision jobs) | **X.1 job runner** with registered **`JOB-G11-*`** ids (Foundation §4); idempotent, backoff ×3, `JOB-FAIL`→`MSG-SYS-JOBFAIL`, per-tenant isolation, period lock | §C/§D, Platform §X.1 |
| 5 | Bespoke PDA/treasury/DigiLocker/penny-drop/DBT "pluggable" integrations | **X.3 integration framework** — idempotent, circuit-broken, payload-versioned, per-integration error mapping; **credentials from P04 `integration_credentials`** | §C, Platform §X.3/§P04 |
| 6 | Error envelope `{error:{code,message,field}, requestId}`; codes `VALIDATION_ERROR 400`, `AUTH_REQUIRED 401`, `INTERNAL_ERROR 500`, `UPSTREAM_UNAVAILABLE 503` | **`{error:{code,message,field,details}}` + `X-Correlation-Id` header**; platform **8-code table** (422/401/403/404/409/412/429/500); 503 dropped (X.3 mapping → 412/500); domain `reason`/`ERR-G11-*` | §C, Foundation §1 |
| 7 | "cursor or page/limit, max 100" pagination | **Cursor pagination only**, `limit` default 25 / max 100, `next_cursor` | §C, Foundation §1 |
| 8 | Multi-tenancy omitted | **`tenant_id`/`entity_id` non-nullable on every G11 table**; data-layer scoping; unscoped query rejected | §C, Platform §0.1 |
| 9 | Invented role list (Pension Officer, Sanctioning Authority, SR Custodian, Auditor, SysAdmin) | **RBAC v1.7 roles + new gov roles/flags as ADDITIONS**; Auditor→Org-Admin read; SysAdmin→Org/Platform Admin; SoD by P01/P02; MFA for high-privilege roles | §C/§6.6, RBAC v1.7 |
| 10 | NFR 99.9% uptime, RPO ≤ 15 min | **99.5%/month, RPO < 1 h, RTO < 4 h** (platform baseline); p95 < 500 ms & WCAG 2.1 AA retained; soft-delete only | §C, Platform §8.2 |
| 11 | `service_register_events` as a "shared platform entity"; documents/notifications local | **G12 net-new gov ledger on the P05 substrate** (written by G04/G05/G06/G09 **and G11** — G11 writes the separation/superannuation life events via `POST /api/v1/sr/ingest`, see §8.7; read/consumed by G11 for qualifying service); **platform `documents`/DocumentGen** (G13) and **X.2 `notifications`** consumed by id | §C/§D |
| 12 | Migration undefined | **P06 ETL+V** — 3 dry runs, waves, `migration_runs`, **`g11_source_id`** traceability (gov source register) | §C, Platform §P06 |
| 13 | Effective-dated rule tables as standalone master data | Managed through the **platform config cascade** (`platform→tenant→entity→employee`) + versioning; staged via `VAL-EFFECTIVE`/`JOB-G11-EFFDATE`; SoD on approve | Platform §0.3, Foundation §1/§3.3 |
| 14 | `VAL-*`/`MSG-*`/`ERR-*` inlined per module | Cite Foundation `VAL-*`/`MSG-*`/`ERR-*` by id; author only **`VAL-G11-*` / `MSG-G11-*` / `ERR-G11-*` / `JOB-G11-*`** and register them in the Foundation indexes | §C, Foundation §2/§4/§5 |
| 15 | PII handling stated generically | **P02 PII Protection Ceiling + field masking on serialization**; Tier-1/Tier-2 masking for Aadhaar/PAN/PRAN/bank/benefit amounts; `E·AR` request-change pattern | RBAC §3.9, Platform §P02 |
| 16 | New `## Alignment with PrimeSoft Platform` + this amendment table | added (FR→service map, JOB register, RBAC additions, GAP engines) | `PLATFORM_FOUNDATION.md` §9.6 |
| 17 | Entity table names unprefixed (collision risk in shared schema) | G11 entities prefixed **`pen_`**; logical names retained in prose | platform schema hygiene |

---

## Amendments (v3 → v3.1: cross-module remediation)

Resolves the cross-module integration findings (R1–R5) per `docs/review/REMEDIATION.md` (D1/D2; R1 finding **F-05**). The G12 SR ingestion contract is frozen by G12; G11 conforms as an SR **writer**.

| # | Finding / decision | v3.0 (contradictory / implicit) | v3.1 (remediated) | Source |
|---|---|---|---|---|
| A1 | **F-05 — G11 write-vs-consume role contradictory.** Reviews had G11 listed both as an SR writer and as "consumes only"; nobody authoritatively owned the separation/superannuation event. **DECISION: G11 IS the SR writer** for those life events. | §1.4 / §3.3 / §8.5 said only "reads/verifies and **appends** retirement events"; §`Amendments v2→v3` row 11 listed SR writers as G04/G05/G06/G09 (G11 excluded) | Writer role made **explicit and non-contradictory** in the out-of-scope para (§1.4), the boundary table (§3.3), the integration table (§8.5) and amendment row 11; G11 **consumes** the ledger for qualifying service **and** posts separation events | REMEDIATION D1/D2; R1 F-05 |
| A2 | **Explicit SR-posting section** authored citing the exact G12-published `event_type_code`s for G11. | implicit "append SR event on closure" only | New **§8.7 SR-Ledger Posting Contract**, codes verbatim: `SEPARATION`, `SUPERANNUATION`, `RETIREMENT`, `VOLUNTARY_RETIREMENT`, `RESIGNATION`, `DEATH_IN_SERVICE`, `FAMILY_PENSION_SANCTIONED` | REMEDIATION D2 |
| A3 | **`DECEASED` vs `DEATH_IN_SERVICE` de-duplication.** | undifferentiated "death" handling | §8.7 records that **G01 posts the `DECEASED` master flag**; **G11 posts only the `DEATH_IN_SERVICE`** separation/benefit consequence — no duplication | REMEDIATION D2 |
| A4 | **Canonical write-port + dedup tuple.** | no canonical endpoint / dedup tuple stated for G11 postings | §8.7: all postings via **`POST /api/v1/sr/ingest`** (façades relay, never direct INSERT); dedup tuple **`(source_module, source_reference_id, source_event_version)`** with explicit **`source_module="G11"`** | REMEDIATION D1 |
| A5 | **`fact_key` for qualifying-service-bearing events.** | not specified | §8.7: `fact_key` **required** for `SEPARATION`/`SUPERANNUATION`/`RETIREMENT`/`VOLUNTARY_RETIREMENT`; missing → `SR_FACT_KEY_REQUIRED` | REMEDIATION D1 |
| A6 | **Explicit scoping + reversal envelope.** | scoping/reversal implicit | §8.7: explicit **`tenant_id`+`entity_id`** on the payload; supersede-only corrections via the G12 **`is_reversal=true`** + `reverses_source_reference_id` envelope (`/sr/ingest/reversal`) | REMEDIATION D1 |
| A7 | **Consumer role preserved.** | — | G11's CONSUMER role for qualifying-service input from G12/G04/G03 (FR-G11-18/04) is **unchanged**; only the writer role is made explicit | REMEDIATION D2 note |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → Platform Services → States → Tests)

| FR | Key Entities | Key APIs | Platform services | States | Test focus |
|---|---|---|---|---|---|
| FR-01 | pen_retirement_forecasts, E34 | /forecasts | X.1, X.2, P02 | — | month-end arithmetic, E34 ages, alerts |
| FR-02 | pen_separation_cases, E37 | /cases | P01, P02, P05, G12 | §10.1 | type inputs, scheme, SoD, single-active |
| FR-03 | pen_separation_cases, E27, qsr, ppo(ANTICIPATORY) | /sr-verification, /no-dues, /anticipatory-pension | P01, G12, G10 | §10.1 | gates (FR-18+sr), anticipatory cap |
| FR-04 | pen_qualifying_service_records, spells, E39 | /qualifying-service, /prior-service | P05, G03/G04/G12 | qsr DRAFT→LOCKED | deduction+prior-service, half-years, min-service routing |
| FR-05 | pen_pension_calculations | /pension:compute | P01, P05, X.3 (CRA), G10 | calc states | flat-50%, service-gratuity, UPS, NPS-default, determinism |
| FR-06 | pen_commutation_records, E31 | /commutation | X.1 (`JOB-G11-RESTORE`) | §10 | cap, factor, residual, reduction-date restoration |
| FR-07 | pen_gratuity_calculations, E33 | /gratuity | P05 | gratuity states | retirement/death/service, ceiling auto-step, apportionment |
| FR-08 | pen_family_pension_records, E26, E32 | /family-pension | P01, P05 | §10.6 | path-specific window, E26 hierarchy, dual/twins |
| FR-09 | pen_terminal_settlements | /settlement | P01, G03/G09/G10 | settlement states | encashment, netting, tax/TDS/89(1), withhold |
| FR-10 | pen_gpf_final_settlements | /gpf | P01, G10 | gpf states | interest, advances, NPS/UPS routing |
| FR-11 | pen_ppo_records, E41 | /ppo, /ppos | P01, DocumentGen, X.3 (DigiLocker) | §10.2 | uniqueness, supersession, DigiLocker, SoD |
| FR-12 | pen_pensioners, life_certs, E38 | /pensioners, /life-certificate | X.1, X.3 (DLC) | §10.3 | LC suspend, restoration timing, conversion, death-signal |
| FR-13 | pen_revisions, E30, E37 | /revisions | X.1 (`JOB-G11-PENSION-RUN`), P01, X.3 | §10.4 | model branch, §16.9 ordering, arrear, immutability |
| FR-14 | pen_disbursements, E42 | /disbursements, /accounts:verify | **X.3, P04**, X.1 | §10.5 | tie-out, penny-drop, idempotency, ack, model |
| FR-15 | pen_benefit_estimates, cases, E26 | /estimates, /me/* | P01/W.2, P02 (MFA) | — | 3-state tracker, outcome-framed, options, LC calendar, bereavement |
| FR-16 | pen_grievances | /grievances | P01 (SLA), X.2 | §10.7 | SLA, escalation, auto-create |
| FR-17 | (read aggregates), E40 | /analytics/* | P02 (scope), G14 | — | reconciliation, scope, projection, objection ageing |
| FR-18 | E27, E28, E29 | /service-verification | P01 (PARALLEL_ALL_OF), P05 | §10.8 | ledger, attestation, condonation orders, sign-off gate |
| FR-19 | E30–E36 | /rules/* | config cascade, P01, X.1 (`JOB-G11-EFFDATE`) | §10.10 | effective-date resolve, SoD approve, immutability, ceiling auto-step |
| FR-20 | pen_overpayment_recoveries, pensioners | /death-detection, /overpayments | X.1 (`JOB-G11-DEATHRECON`), **X.3, P04** | §10.3 | reconciliation, anomaly, recovery modes, exception report |
| FR-21 | pen_disbursing_authorities | /pdas | **X.3, P04** | §10.10(PDA) | model branch, certify/activate, §8.6 contract |
| FR-22 | pen_provisional_pension_records, ppo(PROVISIONAL) | /provisional-pension | P01, G09 | §10.9 | provisional pay, DCRG withhold, 3 conclusions |
| FR-23 | pen_audit_objections | /audit-objections | P01 (SLA), P05 | §10.10 | trace linkage, SLA, outcome closure, revision/recovery |
| FR-24 | pen_ppo_records(digilocker), pensioners(aadhaar/pran) | /ppos:deliver-digilocker | **X.3, P04**, DocumentGen | — | delivery, ref capture, Aadhaar/PRAN, non-blocking retry |

### 14.2 Dependency Graph (build order)

0. **Platform readiness (precondition):** P01/P02/P05/P04/X.1/X.2/X.3/P06 live; RBAC v1.7 gov-role additions registered; G12 SR ledger available → 1. **FR-19 (rule tables on config cascade) + FR-21 (PDA model/X.3 contract) [week-1 critical path]** → 2. FR-01 + FR-02 → 3. **FR-18 (service verification, P01 sign-off)** + FR-03 + FR-04 → 4. FR-05 → 5. FR-06, FR-07, FR-10 → 6. FR-08, FR-09 → 7. FR-11 (PPO), FR-22 (provisional) → 8. FR-12, FR-24 (DigiLocker over X.3) → 9. FR-13 (revision), FR-14 (disbursement/penny-drop over X.3), FR-20 (death detection over X.3) → 10. FR-15, FR-16, FR-23 → 11. FR-17 (analytics → G14).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| **0: Foundations (critical path)** | FR-19, FR-21 | platform readiness (week 1) |
| A: Pipeline foundation | FR-01, FR-02 | platform readiness |
| B: Input provenance & eligibility | FR-18, FR-03, FR-04 | 0, A |
| C: Benefit engines | FR-05, FR-06, FR-07, FR-10 | B |
| D: Family & settlement | FR-08, FR-09 | C |
| E: Order & pensioner | FR-11, FR-22, FR-12, FR-24 | D |
| F: Ongoing ops | FR-13, FR-14, FR-20 | E, 0 |
| G: Self-service, grievance & audit | FR-15, FR-16, FR-23 | C (FR-15), E (FR-16/23) |
| H: Analytics | FR-17 | C, E, F |

### 14.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)

| Requirement area | Covered by | Entities | APIs | Platform service | States | Tests | Gap |
|---|---|---|---|---|---|---|---|
| Retirement forecasting & due-lists | FR-01 | yes | yes | X.1/X.2/P02 | n/a | yes | none |
| Separation types (all 6) + OPS/NPS/UPS | FR-02 | yes | yes | P01/P05/G12 | yes | yes | none |
| Service-record completeness & discrepancy gate | FR-18 | yes | yes | P01/P05 | yes | yes | none |
| Pre-retirement (SR verify, no-dues, anticipatory) | FR-03 | yes | yes | P01/G12/G10 | yes | yes | none |
| Qualifying service + non-qualifying deduction + prior service | FR-04 | yes | yes | G03/G04/G12/P05 | yes | yes | none |
| Pension calc (flat-50% / service gratuity / UPS / NPS-default / NPS indicative) | FR-05 | yes | yes | P01/P05/X.3 | yes | yes | none |
| Commutation & reduction-date restoration | FR-06, FR-12 | yes | yes | X.1 | yes | yes | none |
| Gratuity (retirement, death, service) + ceiling auto-step | FR-07 | yes | yes | P05 | yes | yes | none |
| Family & enhanced family pension (path-specific, E26-driven, dual/twins) | FR-08 | yes | yes | P01/P05 | yes | yes | none |
| Terminal benefits, leave encashment & tax/TDS/89(1) | FR-09 | yes | yes | P01/G03/G09/G10 | yes | yes | none |
| GPF final withdrawal | FR-10 | yes | yes | P01/G10 | yes | yes | none |
| PPO & digital PPO (+ provisional, DigiLocker) | FR-11, FR-24 | yes | yes | P01/DocumentGen/X.3 | yes | yes | none |
| Pensioner master & lifecycle (LC/Jeevan Pramaan) | FR-12 | yes | yes | X.1/X.3 | yes | yes | none |
| Proactive death detection & overpayment recovery | FR-20 | yes | yes | X.1/X.3/P04 | yes | yes | none |
| Provisional pension (Rule 9) | FR-22 | yes | yes | P01/G09 | yes | yes | none |
| Pension revision (DA/pay-commission) + ordering + model | FR-13 | yes | yes | X.1/P01/X.3 | yes | yes | none |
| Treasury/bank/PDA integration + penny-drop + contract | FR-14, FR-21 | yes | yes | **X.3/P04** | yes | yes | none |
| Rule-table management (DA/factors/rates/ceilings/ages/limits/rounding) | FR-19 | yes | yes | config cascade/P01 | yes | yes | none |
| Self-service portal, 3-state tracker & outcome estimators | FR-15 | yes | yes | P01/W.2/P02 | n/a | yes | none |
| Pensioner grievance | FR-16 | yes | yes | P01 | yes | yes | none |
| Audit-objection management | FR-23 | yes | yes | P01/P05 | yes | yes | none |
| Forecasting & liability analytics | FR-17 | yes | yes | P02/G14 | n/a | yes | none |
| Inputs from G03/G09/G10/G12 | FR-04,05,09,10,18 + §8.5 | yes | yes | internal | n/a | yes | none |
| Retirement events to G12 (SR) | FR-02,11 + §8.5 | yes | yes | G12/P05 | yes | yes | none |
| **Platform: multi-tenancy (`tenant_id`/`entity_id`)** | §4, §5 | yes | n/a | Platform §0.1 | n/a | yes | none |
| **Platform: workflow on P01** | all approval FRs | n/a | yes | P01 | §10 | yes | none |
| **Platform: audit on P05** | all FRs | n/a | n/a | P05 | n/a | yes | none |
| **Platform: jobs on X.1 (`JOB-G11-*`)** | FR-01,06,12,13,14,19,20 | n/a | n/a | X.1 | n/a | yes | none |
| **Platform: integrations on X.3 + P04 creds** | FR-05,11,12,14,20,21,24 | yes | yes | X.3/P04 | n/a | yes | none |
| **Platform: notifications on X.2/W.3** | §11 | n/a | n/a | X.2 | n/a | yes | none |
| **Platform: RBAC v1.7 additions + SoD** | §6.6/Alignment §C | n/a | n/a | P02 | n/a | yes | none |
| **Platform: migration on P06** | §13 | yes | n/a | P06 | n/a | yes | none |
| **Platform: API conventions + error envelope** | §8 | n/a | yes | Foundation §1 | n/a | yes | none |

**Result: 0 unresolved gaps.** Every G11 capability, every adopted council improvement (R1–R18 + the three world-class additions), and every platform contract (P01–P06, X.1–X.3, W.1–W.3, RBAC v1.7, NFR baseline) maps to at least one FR, entity, API, platform service, state, and test.

---

## 15. Glossary (additions to v1, carried; platform terms added)

| Term | Definition |
|---|---|
| UPS (Unified Pension Scheme) | Assured-payout scheme (eff. 01-Apr-2025) for opted-in NPS employees — ~50% of last-12-month average pay with a minimum guarantee |
| NPS death/invalidation default | CCS (Implementation of NPS) Rules 2021 OPS-equivalent family/invalid pension on death-in-service/invalidation |
| Service gratuity | One-time lump sum for <10-year qualifying service (no monthly pension), no DCRG ceiling |
| Provisional pension (Rule 9) | Pension paid to a retiree with pending proceedings, DCRG fully withheld until conclusion |
| Enhanced-family-pension basis | IN_SERVICE (10 yrs, no age cap) vs AFTER_RETIREMENT (7 yrs / age-67 / would-be-superannuation) |
| Family-members register (Form 3/14) | Statutory list of rule-defined family members determining family-pension eligibility (distinct from nominees) |
| Dual family pension | Two family pensions where both spouses were government servants, subject to a cap |
| Reduction-effective date | Date the monthly pension is reduced on commutation (= commuted-value receipt date); restoration = +15 yrs |
| Disbursement model | M11_COMPUTES_FULL (G11 computes the full monthly amount) vs PDA_APPLIES_RELIEF (the PDA/CPPC applies DR) |
| Penny-drop | Pre-credit bank-account verification (name-IFSC / NPCI mapper) over X.3 before the first payment |
| Service-verification gate | The signed-off e-SR completeness/discrepancy record (FR-18) required before any benefit computation |
| Condonation register | The register of orders (not free text) that condone service gaps/deficiencies |
| Audit objection | An AG/internal-audit query against a pension case, tracked from raise to closure (FR-23) on P05 |
| DigiLocker delivery | Pushing the signed e-PPO/revision order to the pensioner's DigiLocker over X.3 |
| DCRG | Death-cum-Retirement Gratuity (retirement/death gratuity) |
| Section 89(1) relief | Income-tax relief on arrears spread across years |
| Bhavishya | DoPPW pre-retirement/pension-processing benchmark model |
| **P01 WorkflowEngine** | The platform workflow engine running all G11 approvals/maker-checker (Platform §P01) |
| **P02 Authorization.check** | The platform RBAC enforcement service (deny-by-default → role → INTERSECTION → entitlement → flag → PII ceiling → scope → field mask) |
| **P05 dual audit log** | `audit_log` + `security_audit_log`, DB-trigger capture, immutable, 7-yr (Platform §P05) |
| **X.1 / X.2 / X.3** | Platform background-job runner / notification infrastructure / integration framework |
| **P04 integration_credentials** | Platform encrypted credential store used by X.3 for treasury/PDA/DigiLocker/DBT |
| **P06 ETL+V** | Platform migration toolkit (3 dry runs, waves, `migration_runs`, source-id traceability) |
| **Config cascade** | `platform default → tenant → entity → employee` versioned configuration model (Platform §0.3) |

(All v1/v2 glossary terms carried forward unchanged.)

---

## 16. Appendices

### 16.1 Benefit Computation Order (default sequence)

1. **Build & sign off service verification (FR-18, P01 PARALLEL_ALL_OF)** → 2. Verify gap-free service (G12) → 3. Compute qualifying service (deduct non-qualifying spells from G03/G04, add counted prior service, round half-years per E36) → 4. Resolve emoluments base (G10) → 5. **Route by benefit outcome:** ≥10 yrs → basic pension (OPS flat-50% / UPS assured / NPS-default); <10 yrs → service gratuity; NPS superannuation → indicative → 6. Commutation (option, factor, value, residual, reduction-date restoration schedule on `JOB-G11-RESTORE`) → 7. Gratuity (retirement/death/service, slab, ceiling with DA auto-step) → 8. Family pension (path-specific window, E26-driven) → 9. Leave encashment (G03) → 10. GPF final (G10) → 11. Tax/TDS/89(1) → 12. Net recoveries within protection → 13. Sanction (P01; provisional if proceedings) → 14. PPO issue (DocumentGen + DigiLocker over X.3) → 15. Pre-credit account verification (E42 over X.3) → 16. Disbursement (X.3) & pensioner enrolment. Every mutation captured by P05.

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; factors/rates `NUMERIC(9,4)`; service in integer Y/M/D; no floating point.
- Benefit/half-year rounding per `pen_rounding_rules` (E36), referenced via `rule_version_ref` (FK).

### 16.3 Recovery Priority & Net Protection

Statutory dues → court attachment → disciplinary recovery (G09) → government over-payment (incl. post-death overpayment E38) → outstanding loans/advances (G10) → other. Breaching the protected floor defers lower-priority recoveries (`CONFLICT` / `ERR-G11-RECOVERY-PROTECTION`); spillover recovered from future pension/estate where rules allow.

### 16.4 Immutability & Correction Policy

A SANCTIONED calculation, an ISSUED/ACTIVE PPO, and an APPLIED revision are immutable — **enforced by the P05 DB-trigger (no UPDATE/DELETE on `audit_log`; mutations on business tables produce a new immutable audit row)**. Corrections are issued as a SUPERSEDING calculation/REVISED PPO, a new revision batch, or a recovery/arrear — never a silent edit. Anticipatory/provisional PPOs are superseded by the final PPO with adjustment. Rule-table rows are SUPERSEDED, never deleted once referenced (IR17). Audit-objection corrections flow only through the revision workflow (FR-23).

### 16.5 Pension Eligibility & Service Gratuity (R2)

- **≥10 years qualifying service:** flat **50%** of emoluments base (no proportionate reduction). The pre-2006 proportionate fraction is deprecated.
- **<10 years qualifying service:** **no monthly pension** — a one-time **service gratuity** (`gratuity_type=SERVICE_GRATUITY`), a multiplier of emoluments per completed half-year, with **no DCRG ceiling**.
- Branch determined by `meets_min_pension_service` against `pen_pension_limit_rules` (E35).

### 16.6 OPS vs NPS vs UPS Handling (R3)

- Scheme derived from DOJ vs cutover + UPS opt-in; override P05-audited.
- **OPS:** G11 computes defined-benefit pension, commutation, gratuity, family pension, GPF.
- **NPS — superannuation:** record corpus/PRAN (CRA over X.3); indicative annuity/withdrawal (non-binding, excluded from determinism); no GPF.
- **NPS — death-in-service/invalidation:** compute the CCS-NPS Rules 2021 default benefit = OPS-equivalent family/invalid pension.
- **UPS (opted-in):** assured payout ≈ 50% of last-12-month average pay with the E35 minimum guarantee; opt-in recorded and irreversible per rule.

### 16.7 Enhanced Family Pension Windows (R1)

| Path (`enhanced_basis`) | Enhanced rate window | Step-down |
|---|---|---|
| IN_SERVICE (death-in-service) | **10 years, no age cap** (post-2013 CCS amendment) | to normal after 10 yrs |
| AFTER_RETIREMENT (death after retirement) | **7 years OR up to age 67 / would-be-superannuation, whichever earlier** | to normal at window end |

Both windows are computed from `pen_family_pension_rates` (E32) and recorded in `enhanced_window_rule`; both step-downs are tested invariants.

### 16.8 Tax / TDS on Terminal Benefits (R12)

| Component | Exemption treatment | Notes |
|---|---|---|
| Gratuity (DCRG) | Exempt up to the ₹20,00,000 cap; excess taxable | `gratuity_exempt_amount` / `gratuity_taxable_amount` |
| Commuted pension | Exempt per rule (govt employees fully exempt) | `commutation_exempt_amount` |
| Leave encashment | Exempt per the applicable cap | `leave_encashment_exempt_amount` |
| Arrears (revision/89(1)) | Section 89(1) relief computed | `section_89_relief` |
| TDS | Deducted on the net taxable total | `tds_amount`; `net_settlement = gross − recoveries − TDS` |

### 16.9 Deterministic Revision-Application Order (R13)

When multiple events share an effective date for one pensioner, apply strictly in this order; record the applied order in `calc_trace`:

1. **Pay-commission re-fixation** (re-fixes the basic).
2. **Commuted-portion restoration** (changes the base on which relief is computed).
3. **DA / Dearness Relief** (applied on the re-fixed/restored basic).
4. **Age-based additional pension** (80/85/90/95/100-year increments).

This ordering is part of the determinism contract (IR18) and a tested invariant.

### 16.10 Assumptions Log

- One PrimeSoft tenant per deployment; entity-aware (`tenant_id`/`entity_id`) for departments/directorates.
- All benefit parameters are **first-class effective-dated rule-table rows (E30–E36)** on the **config cascade**, maintained by SysAdmin and approved by a distinct approver (SoD via P01/P02); `rule_version_ref` is a FK.
- **Disbursement model is explicit per PDA** (E37); FR-13/FR-14 branch on it; batch sizing differs by model; both run over X.3.
- PDA/treasury/bank conforms to the **§8.6 X.3 payload-versioned contract**; sandbox certification precedes go-live; credentials from P04.
- Jeevan Pramaan/DLC and DigiLocker/UIDAI/CRA integrations available over X.3 with fallbacks.
- Death-registry/Aadhaar-DBT signals available for FR-20 reconciliation (advisory until confirmed).
- Determinism holds **given the snapshotted rule version and signed-off verified inputs**; external NPS/UPS-annuity figures excluded.
- All platform engines (P01–P06, X.1–X.3, W.1–W.3) are live and consumed by id; G11 authors no platform plumbing.
