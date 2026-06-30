# Payroll and Benefits Management — Government HRMS Module BRD (G10, v3.0 · platform-grounded)

**Module code:** G10 (alias GOV-M10; supersedes the `M10-PAY` code from `SHARED_FOUNDATION.md` §1 per `MODULE_RECONCILIATION.md` §B)
**Program:** Government / Public-Sector HRMS — a **Phase-2 extension of the PrimeSoft HRMS platform**
**Platform relationship (per `MODULE_RECONCILIATION.md` §A):** **SPANS-MULTIPLE / EXTEND (roadmap).** PrimeSoft Phase-1 **excludes payroll** (Master BRD v2.1 §2.1.3, §2.2: M06 Payroll, M07 Statutory Compliance, M14 Benefits are Phase 2/3). G10 is therefore built as a **platform-native Phase-2 module** that EXTENDS the PrimeSoft M06/M07/M14 roadmap with public-sector pay scales, allowances, and statutory rules — **not** authored as a parallel payroll engine.
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory payroll rules, **re-grounded onto the PrimeSoft platform contracts**.
**Source of truth (authority order):** `PLATFORM_FOUNDATION.md` and `MODULE_RECONCILIATION.md` (which together **supersede** the invented `SHARED_FOUNDATION.md`), grounded in **Master BRD v2.1 · Product Vision v2.6 · Platform Specification v1.6 · RBAC Design v1.7 · Foundation FS v1.6**. This BRD **consumes** platform contracts by id (P01–P06, X.1–X.3, W.1–W.3, RBAC v1.7, VAL-*/MSG-*/ERR-*) and never re-authors them.
**Document version:** v3.1 (cross-module SR remediation; v3.0 platform re-grounded)
**Supersedes:** v2.0 (`docs/brd/v2/M10-payroll-and-benefits.md`); v1.0 (`docs/brd/v1/M10-payroll-and-benefits.md`)
**Revision basis:** v3 preserves **all** v2 content and rigor (the v1→v2 Adversarial Council improvements AI-1…AI-24 and risk mitigations R1–R19 remain intact) and **re-anchors** every cross-cutting concern — workflow, RBAC, audit, notifications, jobs, migration, integrations, API conventions, tenancy, NFR — onto the existing PrimeSoft platform engines. See **§15 Alignment with PrimeSoft Platform** and the **Amendments (v2 → v3)** table below.
**Status:** Draft for Gate A review (platform-grounded)
**Sequencing:** Phase-2. G10 sequences **after the Phase-2 platform payroll substrate (PrimeSoft M06/M07) is live** (`MODULE_RECONCILIATION.md` §E), and after the Phase-1 platform (P01–P06, X, W, RBAC) is operational.

---

## Amendments (v2 → v3: platform re-grounding)

This table records every change made to re-ground the v2 BRD onto the PrimeSoft platform. The **business spine is unchanged** — determinism, immutability, three-way + disbursed/held/failed tie-out, derived-YTD ledger, snapshot contract, DSC/positive-pay disbursement, remittance-to-MATCHED, FnF, perquisites, dependent-allowance cascade are all preserved verbatim. v3 changes only *what platform substrate the spine runs on*.

| # | Re-grounding change | v2 (invented) | v3 (platform-grounded) | Source |
|---|---|---|---|---|
| RG-1 | **Module re-key** | `M10-PAY`, features `M10-Fxx`, FRs `FR-M10-xx` | `G10`, features `G10-Fxx`, FRs `FR-G10-xx`; upstream/downstream re-keyed `G01/G03/G06/G09/G11/G12/G13/G14` | Recon §B |
| RG-2 | **Workflow / approvals / locking** | bespoke "shared workflow engine", `workflow_instances`/`workflow_tasks` | **P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`, idempotent), entities `workflows`/`workflow_instances`/`workflow_actions`, 5 patterns (Appendix D), in-flight version pinning; flows are **W.1** definitions | Platform §P01; Recon §C |
| RG-3 | **RBAC & SoD** | invented role list (Payroll Officer/Manager/SysAdmin/Auditor…) | **RBAC v1.7** taxonomy; Payroll roles expressed as **ADDITIONS** (new roles + capability flags) with strict SoD — **Payroll Officer ≠ Payroll Approver ≠ Payroll Disburser**; enforcement by **P02 `Authorization.check`**; PII/financial masking via the **P02 PII Protection Ceiling** | RBAC v1.7; Foundation §6; Platform §P02 |
| RG-4 | **Audit** | local `audit_log` "shared platform" entity | **P05 dual logs** `audit_log` + `security_audit_log`, **DB-trigger** capture (100% mutations, no API bypass), immutable, ≥7-yr; tamper-evidence tracks **OPEN-PLAT-03** (hash-chain) | Platform §P05; Recon §C |
| RG-5 | **Notifications** | local `notifications` handling | **X.2** infrastructure; `MSG-G10-*` templates registered in Foundation §5; payslip/statutory notices **mandatory, non-suppressible**; IN_APP+EMAIL parallel; retry ×5 + DLQ | Platform §X.2; BRD §9.9 |
| RG-6 | **Background jobs** | implicit batch jobs | **X.1** runner; jobs registered as `JOB-G10-*` (run, snapshot-freeze, remittance-accrue, gratuity-accrual, deadline-reminder) in Foundation §4; idempotent per-period run key, ×3 backoff, period lock, `JOB-FAIL`→`MSG-SYS-JOBFAIL` | Platform §X.1; Foundation §4 |
| RG-7 | **External integrations** | direct bank/TRACES/CRA/ERP calls | **X.3** integration framework: idempotent outbound calls, circuit-breaking, payload versioning, per-integration error mapping; **credentials via P04 `integration_credentials`** (encrypted, rotated) | Platform §X.3, §P04 |
| RG-8 | **Migration** | undefined / generic | **P06** ETL+V, **Wave 3 (payroll history, Phase-2, zero-tolerance on numeric discrepancies)**, 3 dry runs, `migration_runs` ledger, `<gov>_source_id` traceability | Platform §P06; Recon §C/§D |
| RG-9 | **API conventions** | `/api/v1`, "cursor or page/limit", `Idempotency-Key`, `requestId` body | `/api/v1`; **cursor pagination only** (`limit` default 25 / max 100 / `next_cursor`); `Idempotency-Key` (24h replay) **mandatory on payment/run POSTs**; **`X-Correlation-Id` response header** (not body `requestId`) | Foundation §1; Recon §C |
| RG-10 | **Error envelope & codes** | `{error:{code,message,field}, requestId}`; `VALIDATION_ERROR 400`, `AUTH_REQUIRED 401`, `INTERNAL_ERROR 500`, `UPSTREAM_UNAVAILABLE 503` | `{error:{code,message,field,details}}` + correlation header; platform 8-code table — `VALIDATION_FAILED 422`, `UNAUTHENTICATED 401`, `INTERNAL 500`, `PRECONDITION_FAILED 412`; **no 503** (upstream failure handled via X.3 mapping → `INTERNAL`/`PRECONDITION_FAILED` + `ERR-LOADFAIL`); module business codes registered as `ERR-G10-*` | Foundation §1; Recon §C |
| RG-11 | **Multi-tenancy** | omitted | **`tenant_id` (non-null) + `entity_id` (where entity-scoped) on every G10 entity**; data-layer scoping; unscoped query **rejected, not defaulted to "all"** | Platform §0.1; Recon §C |
| RG-12 | **NFR baseline** | 99.9% uptime, RPO ≤ 15min | **99.5%/month, RPO < 1h, RTO < 4h, p95 < 500ms, WCAG 2.1 AA** | Vision §2.9; BRD §7; Recon §C |
| RG-13 | **Validation library** | restated rules | cite **`VAL-*`** ids (`VAL-PAN`, `VAL-IFSC`, `VAL-AADHAAR`, `VAL-CURRENCY`, `VAL-EFFECTIVE`, `VAL-DATE`, `VAL-FILE`, `VAL-FNF`, `VAL-SEP`, `VAL-ENUM`, `VAL-CONSENT`); author module-unique **`VAL-G10-*`** and register in Foundation §2 | Foundation §2 |
| RG-14 | **Configured content** | bespoke screens | approval/maker-checker flows are **W.1** definitions; data-collection/claim/declaration screens are **W.2** forms binding `VAL-*`; notification recipients are **W.3** config | Platform §W |
| RG-15 | **Snapshot upstream sources** | M01/M03/M06/M09/org | **G01** (employee master, PrimeSoft M01) / **G03** (attendance & leave, PrimeSoft M04+M05) / **G06** (promotion/pay-fixation) / **G09** (disciplinary recovery) / org_unit | Recon §A |
| RG-16 | **Downstream feeds** | M11 pension, M12 SR | **G11** pension/terminal-benefits (FnF handoff) and **G12 SR ledger** (pay/separation events), the latter on the **P05 audit/immutability substrate** | Recon §A/§D |
| RG-17 | **GL & banking** | generic | bank disbursement + statutory-portal + ERP GL calls run on **X.3**; **DSC/HSM keys never in the application DB** (P04 credential pattern + HSM); GL posting-status tracking only (Finance ERP owns the book of record) | Platform §X.3, §P04 |
| RG-18 | **Document storage** | M13 | **G13** Document Management (PrimeSoft M11 vault) for payslips/Form-16/bank files/challan scans | Recon §A |

> **No new business requirements were introduced in v3** beyond what platform grounding demands (added SoD roles, tenant/entity columns, platform ids). Every v2 FR, entity, acceptance criterion, business rule, state, and test is preserved and re-pointed at a platform service.

---

## Amendments (v3 → v3.1: cross-module remediation)

These changes converge the G10→G12 Service-Register contract onto the **frozen G12 SR ingestion contract** (`docs/review/REMEDIATION.md` §D1/§D2; R1 findings F-02, F-09, F-14). G10 remains **Phase-2 / deferred build**; only the *posting contract* is authored now so the edge is specified rather than "effectively unspecified". The business spine is unchanged.

| # | Remediation change | Before (v3.0) | After (v3.1) | Source |
|---|---|---|---|---|
| CR-1 | **Author explicit SR-posting FR** | SR write "appends" with no endpoint/codes/idempotency (F-09) | **FR-G10-23** (deferred build / Phase-2): posts to canonical **`POST /api/v1/sr/ingest`**; module façade relays only; no direct ledger write; no `/api/v1/sr/events` | REMEDIATION §D1/§D2; R1 F-09 |
| CR-2 | **Cite verbatim G12 event codes** | SR triggers unspecified, no `event_type_code` | `PAY_FIXATION`, `ANNUAL_INCREMENT`, `INCREMENT_WITHHELD`, `PAY_PROTECTION` (`source_module="G10"`); pay-fixation SR is **G10's, not G06's** | REMEDIATION §D2; R1 F-09 |
| CR-3 | **`fact_key` mandatory** | absent on G10 SR payload (F-02) | `fact_key` derived per the type's `fact_correlation_rule` for every (qualifying-service-bearing) code; missing → `SR_FACT_KEY_REQUIRED` | REMEDIATION §D1; R1 F-02 |
| CR-4 | **Dedup tuple + scoping** | no dedup tuple, no explicit provenance/scoping | `(source_module, source_reference_id, source_event_version)` with explicit `source_module="G10"`; explicit `tenant_id`+`entity_id`; reversal via G12 `is_reversal` envelope | REMEDIATION §D1 |
| CR-5 | **Ledger framing fix** | "Platform (G12)" / platform-primitive wording (F-14) | "**net-new G12 gov ledger on the P05 substrate (not a platform primitive)**" in §5.1, §5.4, §8.5 | REMEDIATION §D4; R1 F-14 |

---

## 1. Executive Summary

### 1.1 Purpose

The Payroll and Benefits Management module (**G10**) is the financial heart of the government HRMS and the lead **Phase-2** statutory-financial module on the PrimeSoft platform. It computes, controls, and disburses employee compensation each pay cycle; administers statutory deductions, loans, advances, perquisites, and benefits; **tracks every statutory deduction through to its actual deposit with the State (challan/CIN) and its posting to the books**; and produces every downstream financial and compliance artefact (payslips, bank disbursement files, statutory remittance schedules, Form-16/Form-24Q/tax statements, payroll registers, cost-to-organisation analytics, and full-and-final settlements). It publishes pay events to the **Digital Service Register (G12)** — which runs on the **P05 audit/immutability substrate** — and feeds terminal-benefit and pension processing in **G11**.

G10 is engineered as a **configurable, rule-driven, audit-grade payroll *system of record*** — not merely a calculator — **running on the PrimeSoft platform engines**: approvals/locking on **P01**, authorization/SoD on **P02**, audit on **P05**, jobs on **X.1**, notifications on **X.2**, bank/portal/GL integrations on **X.3**, and migration on **P06 wave 3**. Pay is never hand-keyed into a ledger; it is *derived* from a versioned salary structure, a **point-in-time cross-module snapshot** of upstream facts (G01 master/bank/PAN/scheme, G03 attendance, G06 fixation, G09 recovery, org unit), and a deterministic computation pipeline. Once a payroll run is **finalised and locked, it is immutable** (enforced by P05 DB-trigger audit and append-only versioning) — corrections flow only through arrears, supplementary, off-cycle, or reopen-with-versioning runs, never through silent edits. Every rupee is traceable from snapshotted input → computed payslip → disbursed credit → **deposited statutory remittance → posted GL journal**, and is reversible only through a controlled adjustment with full audit.

The boundary of G10 is **"compute + disburse + remit-to-State + post-to-GL-status"** — surgically wider than a calculator (it proves money was correctly *paid*, *remitted*, and *booked*, through to every employee's *exit*) but stopping short of becoming a general ledger.

### 1.2 Business Context and Problem Statement

Government payroll combines high volume with extreme regulatory sensitivity: pay matrices and scales (e.g., 7th CPC-style pay levels), Dearness Allowance (DA) revisions issued retrospectively, House Rent Allowance (HRA) by city class, GPF/CPF/NPS contributions, income-tax (TDS) with employee declarations, proofs, perquisites, surcharge/cess/relief, professional tax slabs **that differ by state of posting**, recoveries ordered by disciplinary authorities, statutory remittances under tight deadlines **that must be deposited and matched, not merely scheduled**, and full-and-final settlements for every separation. Manual or spreadsheet-driven payroll produces reconciliation gaps, over/under-payments, **duplicate disbursements**, YTD drift, audit findings, and litigation. G10 eliminates these by making the rule set explicit and versioned, the run reproducible from a defined snapshot, the disbursement double-payment-proof, the YTD an immutable derived ledger, and the controls enforceable — **all on platform substrate so the controls are platform-uniform, not module-bespoke**.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Deterministic, reproducible monthly payroll | Re-running an unlocked cycle with identical inputs **and the same cross-module snapshot** yields byte-identical results |
| G2 | Statutory accuracy **through deposit** | 100% correct DA/HRA/PT/TDS/GPF/NPS/perquisite computation against published rules; zero statutory-deadline misses **proven against actual challan/CIN deposit, not just schedule generation** |
| G3 | Immutable, auditable finalised runs | No mutation of locked runs; every adjustment traceable to an arrear/supplementary/off-cycle/reopen-version entry with a lock-to-lock diff, captured by **P05 DB-trigger** audit |
| G4 | Reconciliation integrity (extended) | Gross = sum(earnings); Net = Gross − sum(deductions); **Σ disbursed + Σ held + Σ failed = run net** — reconciled before disbursement; YTD ties to the immutable line ledger |
| G5 | Self-service | Employees access payslips, tax declarations, Form-16, loan statements, FnF status without HR intervention (P02-scoped, P03 chat for policy Q&A) |
| G6 | Retrospective correctness | Arrears for back-dated DA/increment/pay-fixation computed automatically with full break-up and **dependent-allowance cascade**, with cross-FY relief via Form-10E |
| G7 | Cost transparency | Cost-to-organisation analytics by org unit, cadre, component, and period, including employer cost; feeds **G14** dashboards |
| G8 | No duplicate / no missing money | No double disbursement on resend (positive-pay guard over **X.3**); no net pay leaves the tie-out silently (suspense ledger) |
| G9 | Lifecycle completeness | Every employee's exit is settled through a single consolidated full-and-final run; pension/terminal-benefit handoff to **G11** |
| G10 | **Platform-native** | Every cross-cutting concern runs on a named platform service (P01/P02/P05/P06, X.1–X.3, W.1–W.3); G10 authors **only public-sector payroll business logic** |

### 1.4 Scope Summary

In scope: salary structure & pay rules engine (constrained, versioned DSL); monthly payroll run engine with parallel/what-if runs and a **single-in-flight-run guarantee**; **cross-module point-in-time snapshot contract** (over G01/G03/G06/G09/org); arrears & retrospective revisions with dependent-allowance cascade; supplementary & off-cycle payroll; LWP/leave-based deductions; subsistence-allowance and dies-non handling; statutory deductions (TDS, PT-by-state, GPF/PF, NPS, pension contribution, insurance); **taxable perquisite valuation (Rule 3, incl. concessional-loan perquisite)**; full TDS pipeline (standard deduction → Chapter VI-A → slab → surcharge with marginal relief → 4% cess → 87A rebate → 89(1)/Form-10E relief → previous-employer/Form-12B income); recoveries with legal-eligibility check; loans & advances; benefits administration incl. **leave encashment**; payslip generation **with reopen versioning**; bank disbursement (over **X.3**) with **DSC/HSM signature, bank-side batch reference, positive-pay reconciliation, and a suspense-hold ledger**; payroll register & reconciliation; **statutory remittance & liability tracking (deducted → deposited → matched) and GL cost-journal posting status**; Form-16/Form-24Q/tax statements; full-and-final settlement; approval, locking & reopen-versioning **on P01**; feeds to G11 and G12.

Out of scope (owned elsewhere): the canonical employee master (**G01** — PrimeSoft M01), attendance/leave capture (**G03** — PrimeSoft M04/M05), pension disbursement after retirement (**G11**), the SR ledger itself (**G12**, on P05 substrate), document storage internals (**G13** — PrimeSoft M11), the **general-ledger book of record** (G10 produces the cost journal and tracks its posting status; Finance's ERP owns the GL), and **all platform engines** (P01–P06, X, W) which G10 consumes by id and never re-implements.

### 1.5 Key Stakeholders

Payroll Officer (maker), Payroll Approver (checker), Payroll Disburser (DSC-sign/transmit), HR Admin, Department Head/Drawing & Disbursing Officer (DDO), Finance/Treasury (Finance Admin), Employee (self-service), Auditor (Org-Admin read + entitlement), Organisation Admin / Platform Super Admin (configuration). All expressed within **RBAC v1.7** (see §3).

### 1.6 Success Criteria

A pay cycle is "successful" when: all eligible active employees are computed from a frozen cross-module snapshot; reconciliation balances to zero variance with `disbursed + held + failed = run net`; the run is approved and locked **on P01** (approver ≠ creator, SoD enforced by P02); payslips are published; the bank file is DSC-signed, transmitted once with a unique bank batch reference over **X.3**, and positively reconciled against the treasury debit; statutory schedules are produced **and their remittances deposited, challan-captured, and matched**; the cost journal is exported and its posting acknowledged; and pay events are posted to **G12** — all within the cycle calendar with a complete **P05** audit trail. A separation is "successful" when the employee's full-and-final settlement nets all dues and recoveries into a single final payment with its own reconciliation and **G11** handoff.

---

## 1A. Provenance — v1 → v2 Adopted Improvements (preserved)

The v1→v2 Adversarial Council improvements (AI-1…AI-24) and risk mitigations (R1–R19) remain **fully intact** in v3; v3 changes only the platform substrate (see the v2→v3 Amendments table above). The original v1→v2 mapping is retained for traceability.

| # | Adopted improvement (risk) | Where (v3 ids) | How |
|---|---|---|---|
| AI-1 | Statutory remittance & liability tracking (R4) | **FR-G10-19**; entity **E29 `statutory_remittances`** | deducted→deposited→matched lifecycle; challan/CIN/due-date/late-interest u/s 201 & 234E |
| AI-2 | Full-and-final settlement (R7) | **FR-G10-20**; entity **E30 `fnf_settlements`**; cycle `run_type=FNF` | consolidated separation run; G11 handoff |
| AI-3 | Disbursement double-payment guard (R1) | FR-G10-14; `bank_disbursements` positive-pay fields; status `SUSPECTED_PROCESSED` | bank-side unique batch ref + mandatory treasury-debit reconciliation before any resend |
| AI-4 | Bank-file-total contradiction / suspense (R2) | FR-G10-14; entity **E31 `disbursement_holds`** | `Σ disbursed + Σ held + Σ failed = run net` |
| AI-5 | YTD mutable→derived ledger (R3) | FR-G10-06/07/16/17; `deductions.cumulative_ytd` demoted to cache | statutory/tax YTD = immutable Σ over `payslip_lines` |
| AI-6 | Taxable perquisites (R5) | **FR-G10-21**; entity **E32 `perquisites`** | Rule 3 valuation incl. concessional-loan & accommodation |
| AI-7 | Deepened TDS pipeline (R5) | FR-G10-07; `tax_declarations` 12B/10E fields | full surcharge/marginal-relief/cess/87A/89(1) chain |
| AI-8 | Cross-module point-in-time snapshot (R6) | **FR-G10-22**; entity **E34 `run_input_snapshots`** | as-of semantics for G01/G03/G06/G09/org |
| AI-9 | Net-pay floor & attachment exemption (R8) | FR-G10-09; entity **E35 `deduction_carryforwards`** | protected floor + CPC s.60 exemption; rolled-forward backlog |
| AI-10 | Rounding-adjustment component & tolerance (R9) | FR-G10-04; `pay_components.category` adds `ROUNDING_ADJUSTMENT` | absorbs Σ(rounded)−round(Σ) |
| AI-11 | Reopen payslip versioning & lock-to-lock diff (R10) | FR-G10-16; `payslips` version fields | reopen → originals REVERSED, new version; diff in P05 audit |
| AI-12 | Single-in-flight-run constraint (R11) | FR-G10-04/16; partial unique index | `RUN_ALREADY_IN_FLIGHT` (`ERR-G10-RUN-INFLIGHT`) |
| AI-13 | PT state dimension (R12) | FR-G10-02/06; `rate_tables.state` | PT by state of posting |
| AI-14 | Subsistence-allowance & dies-non rules (R13) | FR-G10-04/05; Appendix 16.6 | subsistence % + escalation; dies-non |
| AI-15 | Constrain & version the DSL (R14) | FR-G10-01; Appendix 16.7 | pinned decimal/null/precedence; versioned grammar |
| AI-16 | DSC/HSM signature, not checksum-only (R15) | FR-G10-14; HSM keys via P04/HSM, never in DB | cryptographic signature on transmit/ack |
| AI-17 | Mid-month inter-DDO transfer rule (R16) | FR-G10-22/04; Appendix 16.8 | DDO-of-record default; optional split-period |
| AI-18 | Cost-journal posting record & status (R4) | **FR-G10-19**; entity **E33 `gl_journals`** | structured export + `POSTED`/`ACKNOWLEDGED` over X.3 |
| AI-19 | Remove bank-format over-engineering (R17) | FR-G10-14; `file_format` enum trimmed | ship treasury format; ISO20022/CUSTOM DEFERRED |
| AI-20 | Strengthen migration/cutover gating (R18) | §13; **P06 wave 3 zero-tolerance** | 2-cycle parallel run reconciles YTD + per-scheme totals |
| AI-21 | Overpayment-recovery legal-eligibility check (R19) | FR-G10-09 | Rafiq Masih line flagged for authority decision |
| AI-22 | Arrears dependent-allowance cascade (R5/FR-10) | FR-G10-10 | retrospective basic recomputes DA/HRA/TPT/NPS/GPF per month |
| AI-23 | Leave encashment as explicit rule (R7) | FR-G10-12 + FR-G10-20 | eligible balance × per-day basis with caps & taxability |
| AI-24 | First-class backlog reporting (D) | §12; FR-G10-09/14/19 | registers for un-recovered deductions, suspense, overdue remittances |

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Salary Structure & Pay Matrix | G10-F01 | Pay scales/levels, components (basic, DA, HRA, allowances, special pay), eligibility rules |
| Pay Rules Engine | G10-F02 | Configurable, **constrained & versioned** earning/deduction formulae and computation order |
| Employee Compensation Assignment | G10-F03 | Per-employee salary structure binding, pay-fixation, increments |
| Payroll Run Engine | G10-F04 | Monthly cycle orchestration, computation, parallel/what-if runs, **single-in-flight guarantee** (X.1 job `JOB-G10-RUN`) |
| Cross-Module Snapshot | G10-F19 | **Point-in-time as-of snapshot of G01/G03/G06/G09/org facts into the run** |
| Time & Leave Inputs | G10-F05 | LWP/leave-loss-of-pay and attendance ingestion from **G03**; subsistence/dies-non |
| Statutory Deductions | G10-F06 | TDS, professional tax (**by state**), GPF/PF, NPS, pension contribution, insurance |
| Income-Tax Declarations & Proofs | G10-F07 | Declarations, proofs, regime, **full surcharge/cess/relief/12B/10E pipeline** |
| Taxable Perquisites | G10-F20 | **Rule-3 perquisite valuation incl. concessional-loan & accommodation** |
| Loans & Advances | G10-F08 | Sanction (P01), schedule, EMI recovery, foreclosure, interest, **perquisite linkage** |
| Recoveries & Adjustments | G10-F09 | Disciplinary recoveries (G09), overpayment recovery (**legal-eligibility gate**), ad-hoc |
| Arrears & Retrospective Revisions | G10-F10 | Back-dated DA/increment/pay-fixation arrear computation **with dependent cascade** |
| Supplementary & Off-Cycle Payroll | G10-F11 | Out-of-band payments, missed payments, bonus/ex-gratia |
| Benefits Administration | G10-F12 | Medical/health, LTC/LTA, gratuity accrual, reimbursements, group insurance, **leave encashment** |
| Payslip Generation | G10-F13 | Per-employee payslip rendering, publication, **reopen versioning**, self-service; stored in **G13** |
| Bank Disbursement | G10-F14 | **DSC-signed** file generation, validation, transmission (**X.3**), **positive-pay & suspense-hold** reconciliation |
| Payroll Register & Reconciliation | G10-F15 | Run register, control totals (**disbursed+held+failed=net**), variance, sign-off |
| Approval & Locking | G10-F16 | Multi-level approval (**P01**), finalisation, immutability, **reopen-with-versioning** control |
| Statutory Outputs (Form-16/tax) | G10-F17 | Form-16 (Part A from MATCHED remittance), Form-24Q, PT/GPF/NPS schedules |
| Statutory Remittance & GL Posting | G10-F21 | **Deducted→deposited→matched liability loop; cost-journal posting status** (X.3 to ERP) |
| Full-and-Final Settlement | G10-F22 | **Consolidated separation run; G11 handoff** |
| Cost-to-Org Analytics | G10-F18 | Payroll cost, headcount cost, variance and trend analytics; feeds **G14** |

### 2.2 Common Capabilities (inherited from the PrimeSoft platform)

All G10 features inherit, **by id, from the platform** (not from a re-authored foundation): `tenant_id`/`entity_id` on every entity with **data-layer scoping** (Platform §0.1); UUID PKs + human business keys; platform audit columns; UPPER_SNAKE_CASE status enums; UTC storage / locale display; INR currency (Phase-1 INR-only) with i18n money formatting; **cursor pagination** (`limit` default 25, max 100, `next_cursor`); **maker-checker via P01**; **RBAC v1.7 + P02 row-level scoping + PII ceiling**; **P05 dual-log immutable audit** on every state change (DB-trigger); **G13** document vault for generated artefacts; **X.2** notifications; **G12** SR ledger for pay/separation events; **VAL-*** validation library; **X.1** jobs; **X.3** integrations with **P04** credentials.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In G10? | Owner / Note |
|---|---|---|
| Employee master data | Reference only (**snapshotted as-of cutoff**) | **G01** (golden source; PrimeSoft M01) |
| Attendance & leave balances | Consume only (**snapshotted**) | **G03** (LWP days, paid/unpaid splits; PrimeSoft M04 Leave + M05 Attendance) |
| Promotion / pay-fixation order | Consume the order; compute pay impact | **G06** issues; G10 fixes pay & computes arrears |
| Disciplinary recovery order | Consume; recover via payroll | **G09** issues; G10 schedules recovery |
| Pension disbursement | Out | **G11** (G10 supplies last-pay-drawn, contribution history, **FnF gratuity handoff**) |
| Service register pay events | Write events | **G12** owns the ledger (P05 substrate); G10 appends |
| Document storage | Reference | **G13** stores payslips/Form-16/bank files (PrimeSoft M11 vault) |
| Statutory deposit (challan/CIN) | **In — tracked to MATCHED** | G10 records deposit & matches; the banking/TRACES portal executes via **X.3** |
| General ledger posting | **Export + posting-status tracking** | G10 produces cost journal and tracks `POSTED`/`ACKNOWLEDGED` via **X.3**; Finance ERP owns the GL book of record |
| Bank core integration | File + API handshake (**DSC-signed, positive-pay reconciled**) | Treasury/Bank gateway is external, called over **X.3**; credentials in **P04** |
| Workflow / approvals | Consume | **P01** (no bespoke engine) |
| Authorization / SoD / PII masking | Consume | **P02** + RBAC v1.7 |
| Audit | Consume | **P05** dual logs (DB-trigger) |
| Notifications / jobs / migration | Consume | **X.2 / X.1 / P06** |

### 2.4 Assumptions and Constraints

- Pay scales, DA rates, HRA city classes, **PT slabs keyed by state**, and tax slabs are **configurable master data**, sourced from government notifications, version-effective-dated via the platform config cascade (`platform → tenant → entity → employee`) and the **`VAL-EFFECTIVE`** / effective-date job mechanism (Platform §0.3, §3.3).
- The government deployment is **one PrimeSoft tenant**; each department/directorate is an **`entity`** (Standalone / Group Company model, Vision §1.4). The data model is tenant- and entity-aware on every table. **Multi-state professional tax** is supported within a single entity via a `state` dimension on PT slabs.
- One primary monthly cycle plus arrears/supplementary/off-cycle/**FnF** cycles per period.
- The bank/treasury accepts **one defined, certified file format per deployment**; ISO20022/CUSTOM deferred behind a strategy seam. The bank file is **digitally signed (DSC/HSM)**; signing keys live in an HSM and **never in the application database**; integration credentials are held in **P04 `integration_credentials`**.
- All money math uses fixed-point decimal (no binary float); rounding rules explicit and configurable; a designated rounding-adjustment component absorbs per-payslip residue.
- **Determinism extends upstream:** a run is a pure function of (salary structure version, effective rate tables, G10 inputs, prior immutable line ledger, **and the cross-module snapshot** of G01/G03/G06/G09/org taken as-of the cutoff).
- **YTD is derived, never a mutable scalar.**
- **Phase-2 sequencing:** G10 goes live after the PrimeSoft Phase-1 platform (P01–P06, X, W, RBAC v1.7) and the Phase-2 payroll substrate (M06/M07) are operational; payroll history migrates on **P06 wave 3 (zero-tolerance)**.

---

## 3. Roles & Permissions (RBAC v1.7 — expressed as ADDITIONS)

G10 does **not** define a parallel access-control scheme. It maps every actor onto the **RBAC v1.7** taxonomy (Platform §P02; `PLATFORM_FOUNDATION.md` §6) and expresses public-sector payroll actors as **new entity-scoped roles + capability flags ADDED to the taxonomy** and registered in RBAC §2.2/§4.3. Enforcement (deny-by-default → role grant → multi-role intersection → entitlement → capability flag → **PII Protection Ceiling** → data-scope filter → field mask on serialization) is performed by **P02 `Authorization.check`** — G10 endpoints never re-implement permission logic. **SoD (maker ≠ checker, signer ≠ creator, no self-approval) is enforced by P01/P02**, not coded per module.

### 3.1 Government payroll roles as RBAC additions

| G10 actor | Express in RBAC v1.7 as | Notes |
|---|---|---|
| **Payroll Officer (Maker)** | new entity-scoped module-admin role `payroll_officer` (analogous to **Payroll Admin**, RBAC §2.2) | configure components/rules (draft), assign structures, run payroll (draft/parallel), enter adjustments, prepare bank file, capture remittance challans, prepare FnF. **Cannot approve, sign, or confirm positive-pay.** |
| **Payroll Approver / Controller (Checker)** | new entity-scoped role `payroll_approver` + capability flag `PAYROLL_APPROVE` | review reconciliation, **approve & lock runs on P01**, authorise off-cycle/supplementary/FnF, reopen-with-versioning, certify remittances & Form-16. **≠ run creator.** |
| **Payroll Disburser** | new entity-scoped role `payroll_disburser` + capability flag `PAYROLL_DISBURSE` | **DSC-sign** the bank file and transmit over X.3. **Distinct from Officer and Approver** (strict 3-way SoD). |
| Employee (Self-Service) | existing **`employee`** (RBAC §2.4) | view own payslips/structure/loan/benefit/perquisite/FnF; submit declarations/proofs/Form-12B; submit reimbursement/LTC/leave-encashment claims (W.2 forms) |
| Reporting Manager | existing **`l1_manager`** (RBAC §2.3) | recommend/approve reimbursement & benefit claims for direct reports (P01) |
| HR Admin | existing **`hr_admin`** (single-entity superset, RBAC §3.1.1) | maintain pay-relevant attributes within scope; raise pay-fixation requests; initiate separation/FnF |
| Department Head / DDO | existing **`hod`** + capability flag `DDO_SANCTION` | sanction loans/advances; sanction off-cycle/FnF within authority; **adjudicate legally-barred overpayment recovery** |
| Finance / Treasury | existing **`finance_admin`** (Phase-2 payroll approval/payslip per BRD §3.3) | receive bank file & cost journal; confirm disbursement ack & **treasury debit (positive pay)**; acknowledge GL posting; confirm statutory deposits |
| Auditor (read-only) | **map to** Org-Admin audit access + read-only **individual entitlement** (RBAC §3.2; P05 query access) | read all payroll data, registers, remittance ledger, **P05 audit logs**; no write. **Do not invent a parallel Auditor role with write capability.** |
| System Administrator | **map to** Org Admin / Platform Super Admin (RBAC §2.1) | manage master data (scales, DA/HRA/PT-by-state/tax tables), file-format config, DSL grammar version, RBAC; **no transactional self-approval** |

> New roles/flags (`payroll_officer`, `payroll_approver`, `payroll_disburser`, `PAYROLL_APPROVE`, `PAYROLL_DISBURSE`, `DDO_SANCTION`) are registered in **RBAC §2.2/§4.3** via the working-group process (RBAC §14). High-privilege payroll roles require **MFA** by default (Vision §2.2; Foundation §3.1).

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Lock, S=Sign/Disburse, X=No access)

Resolved by **P02** at request time; this matrix is the RBAC-addition request, not a parallel model.

| Capability | Employee | Mgr (L1) | Payroll Officer | Payroll Approver | Payroll Disburser | HR Admin | DDO/HOD | Finance | Auditor | Org/SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| Pay component / rule config | X | X | C/R/U (draft) | A | X | R | X | X | R | C/R/U |
| Pay scale / DA / HRA / PT-by-state / tax tables | X | X | R | R | X | R | X | X | R | C/R/U/A |
| Assign salary structure / pay-fixation | X | X | C/R/U | A | X | C (request) | X | X | R | X |
| Run payroll (draft / parallel) | X | X | C/R | R | X | X | X | X | R | X |
| Approve & lock payroll run | X | X | X | A | X | X | X | X | R | X |
| Reopen locked run (versioned) | X | X | X | A (justified) | X | X | X | X | R | X |
| Loans & advances sanction | X | R (own reports) | C/R | R | X | C (request) | A | X | R | X |
| Tax declaration / proofs / 12B | C/R/U (own) | X | R/A (verify) | R | X | R | X | X | R | X |
| Perquisite valuation | X | X | C/R/U | A | X | R | X | X | R | R |
| Reimbursement / LTC / leave-encashment claim | C/R (own) | A (recommend) | R/A (verify) | A | X | R | X | X | R | X |
| Off-cycle / supplementary / FnF payment | X | X | C/R | A | X | C (FnF init) | A (sanction) | X | R | X |
| Bank file generate | X | X | C/R | X | C/R | X | X | R | R | X |
| Bank file **DSC-sign / transmit** | X | X | X | X | **S** | X | X | R | R | X |
| Disbursement ack / **positive-pay confirm** | X | X | R | X | X | X | X | A (confirm) | R | X |
| Statutory remittance challan capture / match | X | X | C/R/U | A (certify) | X | X | X | R (confirm deposit) | R | X |
| GL cost-journal export / posting status | X | X | C/R | R | X | X | X | A (ack) | R | X |
| Payslip view | R (own) | R (reports) | R | R | X | R | R | X | R | X |
| Form-16 / statutory outputs | R (own) | X | C/R | A | X | R | X | R | R | X |
| Overpayment legal-eligibility adjudication | X | X | C (flag) | R | X | X | A (decide) | X | R | X |
| Cost-to-org analytics | X | R (own unit) | R | R | X | R | R | R | R | R |
| Audit log (P05) | X | X | R (own actions) | R | X | X | X | X | R | R |

**Segregation of duties (enforced by P01/P02, not coded):** the **Payroll Officer** who runs/prepares cannot approve/lock, **DSC-sign**, or confirm positive-pay; the **Payroll Approver** who locks is **≠ run creator**; the **Payroll Disburser** who DSC-signs/transmits is **≠ run creator and ≠ approver**; the principal who confirms the treasury debit (positive pay) before a resend is **≠ the transmitter**; `fnf_settlements.approved_by ≠ created_by`. The Org/SysAdmin who configures tables **cannot run or approve payroll** for which they are an employee subject. The **PII Protection Ceiling** (bank account, PAN, salary amounts) overrides every role upward — no Org Admin or module admin lifts it; masking is applied **on serialization** by P02.

---

## 4. Platform Foundation (consumed, not re-authored)

G10 consumes the PrimeSoft platform contracts verbatim (Platform Spec v1.6; Foundation FS v1.6; RBAC v1.7). The invented `SHARED_FOUNDATION` §5 defaults are **overridden** per `MODULE_RECONCILIATION.md` §C.

- **Tenancy:** `tenant_id` (non-null) + `entity_id` (where entity-scoped) on every G10 entity; data-layer scoping; unscoped queries rejected (Platform §0.1).
- **Auth/session:** Bearer-token (JWT) session carrying resolved roles + tenant/entity scope; permissions resolved per request by P02; MFA for high-privilege payroll roles (Platform §0.2; Vision §2.2).
- **API conventions:** `/api/v1`; cursor pagination only; `Idempotency-Key` (24h replay window) on payment/run POSTs; `X-Correlation-Id` response header; canonical error envelope + 8-code table (Foundation §1) — see §8.
- **Money type:** `NUMERIC(15,2)` amounts, `NUMERIC(9,4)` rates; fixed-point; a `ROUNDING_ADJUSTMENT` component absorbs `Σ(rounded) − round(Σ)` per payslip.
- **Computation determinism (extended):** pure function of (structure version, effective rate tables, employee inputs, prior immutable line ledger, cross-module snapshot).
- **Cross-module snapshot:** every run persists an immutable `run_input_snapshots` row of as-of values of G01/G03/G06/G09/org (FR-G10-22).
- **Immutability & versioning:** finalised runs/payslips are append-only; reopen produces a new payslip *version* (originals → REVERSED) with a lock-to-lock diff recorded in the **P05 `audit_log`**.
- **YTD as derived ledger:** YTD = immutable Σ over `payslip_lines` for the FY; `deductions.cumulative_ytd` is a cache only.
- **Idempotency + single-in-flight:** mutating run/disbursement endpoints accept `Idempotency-Key`; a partial unique index enforces one active FINAL run per cycle.
- **Audit:** **P05 dual logs** (`audit_log` for mutations + `security_audit_log` for auth/permission events), captured by **DB-trigger** (100% coverage, no API bypass), immutable, ≥7-yr retention; tamper-evidence tracks OPEN-PLAT-03 (hash-chain). G10 defines **no** local `audit_log`.
- **Workflow:** approvals/sanctions/locking run on **P01** (`workflows`/`workflow_instances`/`workflow_actions`; 5 patterns; in-flight version pinning); flows are **W.1** definitions, forms are **W.2**, notification recipients **W.3**.
- **Disbursement safety:** bank files DSC/HSM-signed (keys in HSM, never in DB; integration creds in P04); unique bank batch ref + positive-pay reconciliation over **X.3**; excluded/failed net parked in a suspense-hold ledger.
- **Encryption / PII:** bank account, PAN, salary amounts are PII/financial — encrypted at rest, masked in UI by default (P02 ceiling on serialization), access logged in `security_audit_log`.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

Platform-provided entities are **referenced, never redefined** (Recon §D). Every G10-owned entity carries `tenant_id`/`entity_id` + platform audit columns.

| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| E01 | `employees` | Platform (G01) | G01 / PrimeSoft M01 | Employee master (referenced; snapshotted) |
| E02 | `org_units` | Platform | Platform | Org hierarchy (referenced; snapshotted) |
| E03 | `designations` / `pay_scales` | Platform ref | Platform | Designation & pay-scale master (extended by E04) |
| E04 | `pay_matrix_levels` | G10 | G10 | Pay-matrix level/cell (basic-pay progression) |
| E05 | `pay_components` | G10 | G10 | Earning/deduction/**perquisite/rounding** component catalog |
| E06 | `pay_rules` | G10 | G10 | Versioned formula/rule per component (**constrained DSL**) |
| E07 | `rate_tables` | G10 | G10 | DA %, HRA class %, PT slabs (**by state**), tax slabs (effective-dated) |
| E08 | `employee_salary_structures` | G10 | G10 | Per-employee assigned structure (versioned) |
| E09 | `employee_salary_components` | G10 | G10 | Component-level overrides/values per structure version |
| E10 | `payroll_cycles` | G10 | G10 | A pay period + run-type definition (incl. **FNF**) |
| E11 | `payroll_runs` | G10 | G10 | A computation run instance (draft/parallel/final), **snapshot-bound** |
| E12 | `payslips` | G10 | G10 | Per-employee per-run computed result header (**versioned**) |
| E13 | `payslip_lines` | G10 | G10 | Earning/deduction line items — **the YTD source-of-truth ledger** |
| E14 | `deductions` | G10 | G10 | Statutory/voluntary deduction definitions & balances; `cumulative_ytd` cache only |
| E15 | `tax_declarations` | G10 | G10 | Income-tax declaration, proofs, **Form-12B & Form-10E** per FY |
| E16 | `loans_advances` | G10 | G10 | Loan/advance sanction & recovery schedule (**perquisite-linked**) |
| E17 | `loan_repayments` | G10 | G10 | Per-installment recovery ledger |
| E18 | `benefits` | G10 | G10 | Benefit enrolment (medical/LTC/insurance/gratuity/**leave-encashment**) |
| E19 | `benefit_claims` | G10 | G10 | Reimbursement / LTC / medical / **leave-encashment** claims |
| E20 | `arrears` | G10 | G10 | Retrospective revision arrear computations (**dependent cascade**) |
| E21 | `bank_disbursements` | G10 | G10 | Bank file batch + line + ack + **positive-pay + DSC signature** |
| E22 | `payroll_reconciliations` | G10 | G10 | Control totals & variance sign-off (**disbursed+held+failed=net**) |
| E23 | `gratuity_accruals` | G10 | G10 | Period gratuity accrual ledger |
| **E29** | **`statutory_remittances`** | **G10** | **G10** | **Deducted→deposited→matched liability tracker (challan/CIN/penalty)** |
| **E30** | **`fnf_settlements`** | **G10** | **G10** | **Full-and-final separation settlement header & components** |
| **E31** | **`disbursement_holds`** | **G10** | **G10** | **Suspense ledger for excluded/failed net pay** |
| **E32** | **`perquisites`** | **G10** | **G10** | **Rule-3 taxable perquisite valuation per employee per FY** |
| **E33** | **`gl_journals`** | **G10** | **G10** | **Payroll cost-journal export object + posting status** |
| **E34** | **`run_input_snapshots`** | **G10** | **G10** | **Immutable as-of snapshot of G01/G03/G06/G09/org per run** |
| **E35** | **`deduction_carryforwards`** | **G10** | **G10** | **Owned, aged backlog of un-recovered (rolled-forward) deductions** |
| — | `audit_log` / `security_audit_log` | **Platform (P05)** | Platform | Immutable dual audit (written via DB-trigger) — **referenced, not redefined** |
| — | `documents` | **Platform (G13)** | G13 / PrimeSoft M11 | Payslip/Form-16/bank-file/challan object metadata (referenced) |
| — | `notifications` | **Platform (X.2)** | Platform | Outbound events (written via X.2) |
| — | `service_register_events` | **G12 (net-new, P05 substrate)** | G12 | Pay/separation events posted via `POST /api/v1/sr/ingest` (FR-G10-23) — a **net-new G12 gov ledger on the P05 substrate, not a platform primitive** |
| — | `workflows` / `workflow_instances` / `workflow_actions` | **Platform (P01)** | Platform | Approvals (used; **not** `workflow_tasks`) |
| — | `integration_credentials` | **Platform (P04)** | Platform | Bank/TRACES/CRA/ERP creds (encrypted; used by X.3) |
| — | `migration_runs` | **Platform (P06)** | Platform | ETL+V ledger (payroll history wave 3) |

> v3 **removes** the v2 entries that treated `audit_log`, `notifications`, `service_register_events`, and `workflow_instances`/`workflow_tasks` as G10-defined "shared" tables; they are **platform-provided** and consumed by id (Recon §C/§D).

### 5.2 Amended v1 entities (delta) and new v2 entities — unchanged from v2 except tenancy

> All v1 entities E04–E23 retain their full v2 field tables; all v2 entities E29–E35 retain their full v2 field tables. **v3 adds `tenant_id UUID NOT NULL` and (where entity-scoped) `entity_id UUID NOT NULL` to every G10-owned entity, and replaces the bespoke `audit fields` line with the platform audit columns captured by the P05 DB-trigger.** The field-level content below is reproduced verbatim from v2.

#### E05 `pay_components` — amended
Adds to `category` enum: `PERQUISITE`, `ROUNDING_ADJUSTMENT`, `LEAVE_ENCASHMENT`. New field `dsl_grammar_version TEXT NULL` (pins the DSL grammar a FORMULA component was authored against; FR-G10-01/Appendix 16.7). Plus `tenant_id`/`entity_id`.

#### E07 `rate_tables` — amended
Adds field `state TEXT NULL` (required when `table_type=PT_SLAB`). Uniqueness/non-overlap key for PT: `(tenant_id, entity_id, table_type, state, slab_min, slab_max, effective_from)`.

#### E11 `payroll_runs` — amended
Adds: `snapshot_id UUID FK→run_input_snapshots NULL`; `in_flight_lock_key TEXT NULL` (partial unique index enforces one active FINAL run per `(tenant_id, entity_id, cycle_id)`); `superseded_run_id UUID NULL`; `workflow_instance_id UUID NULL` (the P01 instance driving approval/lock).

#### E12 `payslips` — amended
Adds: `version INT NOT NULL DEFAULT 1`; `superseded_by_payslip_id UUID FK→payslips NULL`; `supersession_reason ENUM(REOPEN, ARREAR_LINK, CORRECTION) NULL`; `snapshot_id UUID FK→run_input_snapshots NULL`; `document_id` references the **G13** vault. `status` enum gains `SUPERSEDED`.

#### E14 `deductions` — amended
`cumulative_ytd` demoted to recomputable cache. Adds: `carryforward_id UUID FK→deduction_carryforwards NULL`; `attachment_exemption_basis TEXT NULL` (CPC s.60).

#### E15 `tax_declarations` — amended
Adds: `previous_employer_income JSONB NULL` (Form-12B); `relief_89_1 JSONB NULL` (Form-10E); `surcharge`, `marginal_relief`, `cess`, `rebate_87a`, `standard_deduction`, `perquisite_total` `NUMERIC(15,2) NULL`.

#### E16 `loans_advances` — amended
Adds: `is_concessional BOOL NOT NULL DEFAULT false`; `perquisite_reference_rate NUMERIC(9,4) NULL`; `perquisite_id UUID FK→perquisites NULL`. Loan sanction routes through **P01** (`workflow_instance_id`).

#### E29 `statutory_remittances`
| Field | Type | Null | Notes |
|---|---|---|---|
| `remittance_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | platform scoping |
| `scheme` | ENUM | N | TDS, PT, GPF, CPF, NPS, PENSION, INSURANCE |
| `state` | TEXT | Y | for PT (state of posting) |
| `period_month` / `period_year` | INT | N | liability period |
| `financial_year` | TEXT | N | e.g. `FY2026_27` |
| `deducted_total` | NUMERIC(18,2) | N | employee share, derived from `payslip_lines` |
| `employer_total` | NUMERIC(18,2) | Y | employer share (NPS/pension) |
| `remittable_total` | NUMERIC(18,2) | N | deducted + employer |
| `statutory_due_date` | DATE | N | deadline (e.g., 7th of next month for TDS) |
| `challan_no` / `cin` | TEXT | Y | bank challan / CIN / NPS-CRA ref |
| `deposit_date` | DATE | Y | actual deposit date |
| `deposited_amount` | NUMERIC(18,2) | Y | |
| `late_interest` | NUMERIC(18,2) | Y | u/s 201(1A)/234E if late |
| `tolerance_variance` | NUMERIC(15,2) | Y | rounding residue vs CRA/GPF |
| `status` | ENUM | N | ACCRUED, SCHEDULED, DEPOSITED, MATCHED, OVERDUE, SHORT_PAID |
| `matched_by` | UUID | Y | certifier |
| `document_id` | UUID FK→G13 documents | Y | challan/receipt scan |
| platform audit cols | — | — | created_at/by, updated_at/by, is_deleted (P05 trigger) |

#### E30 `fnf_settlements`
Full v2 field table preserved (`fnf_id`, `fnf_no`, `employee_id`, `separation_type` ENUM, `last_working_date`, `cycle_id`, `final_month_pay`, `leave_encashment`, `gratuity_amount`, `notice_pay_recovery`, `loan_settlement`, `other_recoveries`, `final_tds`, `net_settlement`, `g11_handoff_ref` (was `m11_handoff_ref`), `reconciliation_id`, `status` ENUM, `sanctioned_by`, `approved_by` (≠ creator)) + `tenant_id`/`entity_id` + platform audit cols. `VAL-FNF`/`VAL-SEP` apply.

#### E31 `disbursement_holds`
Full v2 field table preserved (`hold_id`, `run_id`, `disbursement_id`, `employee_id`, `payslip_id`, `held_amount`, `reason` ENUM, `age_days`, `redisbursement_run_id`, `status` ENUM, `owner_id`) + `tenant_id`/`entity_id` + platform audit cols.

#### E32 `perquisites`
Full v2 field table preserved (`perquisite_id`, `employee_id`, `financial_year`, `perq_type` ENUM, `valuation_method` ENUM, `source_ref`, `taxable_value`, `monthly_value`, `computed_basis` JSONB, `status` ENUM) + tenancy + audit cols.

#### E33 `gl_journals`
Full v2 field table preserved (`journal_id`, `run_id`, `journal_no`, `period_month/year`, `lines` JSONB, `total_debit`, `total_credit`, `export_document_id`→G13, `posting_status` ENUM, `erp_reference`, `acknowledged_by`) + tenancy + audit cols. ERP export over **X.3**.

#### E34 `run_input_snapshots`
Full v2 field table preserved (`snapshot_id`, `cycle_id`, `run_id`, `as_of_timestamp`, `g01_facts` JSONB (was `m01_facts`: employee/bank(enc)/PAN/scheme/designation/cadre/status/ddo_of_record), `g03_facts` JSONB (was `m03_facts`), `g06_facts` JSONB, `g09_facts` JSONB, `org_facts` JSONB, `post_cutoff_deferrals` JSONB, `checksum`, `is_frozen`) + tenancy + append-only audit cols.

#### E35 `deduction_carryforwards`
Full v2 field table preserved (`carryforward_id`, `employee_id`, `deduction_id`, `source_type` ENUM, `original_amount`, `recovered_to_date`, `outstanding`, `first_deferred_cycle`, `age_days`, `priority`, `owner_id`, `status` ENUM) + tenancy + audit cols.

### 5.3 Relationship Map

```
employees (G01) 1───n employee_salary_structures 1───n employee_salary_components ──n─1 pay_components 1───n pay_rules ──n─1 rate_tables
pay_matrix_levels 1───n employee_salary_structures
payroll_cycles 1───n payroll_runs 1───n payslips 1───n payslip_lines ──n─1 pay_components
payroll_runs n───1 run_input_snapshots          (snapshot the run computed against)
payroll_runs n───1 workflow_instances (P01)      (approval/lock instance)
payroll_runs 1───1 payroll_reconciliations
payroll_runs 1───n bank_disbursements 1───n disbursement_holds   (suspense for excluded/failed net)
payroll_runs 1───1 gl_journals   (cost-journal export + posting status → Finance ERP via X.3)
payslips 1───0..1 payslips (superseded_by — reopen versioning); payslips n───1 documents (G13)
employees 1───n deductions / tax_declarations / loans_advances / benefits / arrears / gratuity_accruals / perquisites / fnf_settlements / deduction_carryforwards
loans_advances 1───0..1 perquisites   (concessional-loan perquisite)
benefits 1───n benefit_claims   (incl. LEAVE_ENCASHMENT)
payslip_lines n───1 arrears; payslip_lines ──aggregate──> statutory_remittances; payslip_lines ──aggregate──> YTD
deductions 1───0..1 deduction_carryforwards
fnf_settlements n───1 payroll_cycles (run_type=FNF);  fnf ──handoff──> G11
pay/separation events ──> service_register_events (G12, P05 substrate);  every mutation ──DB-trigger──> P05 audit_log
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `pay_scales` | G01/Platform | G10 (snapshotted) | — (G10 reads only) |
| `pay_matrix_levels`…`gratuity_accruals` (E04-E23) | G10 | G11, G12, G14 | G10 |
| E29-E35 (remittances, FnF, holds, perquisites, GL, snapshots, carryforwards) | G10 | G11 (FnF/gratuity), G14 (analytics), Finance (GL/remittance) | G10 |
| `documents` | G13 (PrimeSoft M11) | G10 | G10 (creates refs) |
| `service_register_events` (net-new G12 gov ledger on P05 substrate — not a platform primitive) | G12 | G10 | G10 posts pay/separation events via `POST /api/v1/sr/ingest` (FR-G10-23; no direct ledger write) |
| `audit_log`/`security_audit_log` | P05 | G10, Auditor | P05 DB-trigger (G10 mutations captured automatically) |
| `notifications`, `workflows`/`workflow_*`, `integration_credentials`, `migration_runs` | Platform (X.2/P01/P04/P06) | G10 | Platform (G10 triggers via service contract) |

### 5.5 Enum Catalog (delta from v1 — unchanged in v3)

Identical to v2: `pay_component.category` adds `PERQUISITE, ROUNDING_ADJUSTMENT, LEAVE_ENCASHMENT`; `rate_table.table_type` PT_SLAB +state; `cycle.run_type` adds `FNF`; `run.run_mode` DRAFT/PARALLEL_WHATIF/FINAL; `payslip.status` adds `SUPERSEDED`; `disbursement.status` adds `SUSPECTED_PROCESSED`; `disbursement.file_format` NACH/FIXED_WIDTH active, ISO20022/CUSTOM DEFERRED; `disbursement.ack_status` adds `POSITIVE_PAY_CONFIRMED`; `hold.reason`/`hold.status`; `remittance.scheme`/`remittance.status`; `perquisite.perq_type`; `gl_journal.posting_status`; `fnf.separation_type`/`fnf.status`; `carryforward.status`; `benefit/claim.type` adds `LEAVE_ENCASHMENT`. (All values exactly as v2 §5.5.)

### 5.6 Data Integrity Rules (v2 rules preserved verbatim; audit now via P05)

1. **Earning/deduction identity** with `ROUNDING_ADJUSTMENT` line absorbing residue (net ≥ 0).
2. **Run totals** equal sums of non-superseded payslips; enforced at commit.
3. **Reconciliation gate:** APPROVED requires `payroll_reconciliations.signoff_status=SIGNED_OFF` + zero unexplained variance.
4. **Bank-file integrity:** `Σ disbursed + Σ held + Σ failed = payroll_runs.net_total`; excluded net parked in `disbursement_holds`.
5. **Immutability & versioning:** LOCKED runs are read-only; change requires arrear/supplementary/off-cycle or reopen-versioning (original → SUPERSEDED/REVERSED).
6. **Effective-dating:** one ACTIVE structure version per employee per date; overlaps rejected.
7. **Statutory caps:** GPF/NPS/gratuity/PT/perquisite respect configured ceilings.
8. **Loan ledger:** `Σ loan_repayments.principal = loans_advances.principal` at CLOSED; outstanding monotonically non-increasing.
9. **YTD derivation:** YTD = immutable Σ `payslip_lines` over surviving (non-superseded) versions; `cumulative_ytd` is a cache; Form-16/24Q derive from the ledger.
10. **SoD (enforced by P01/P02):** `payroll_runs.approved_by ≠ created_by`; `bank_disbursements.signed_by ≠ creator ≠ approver`; positive-pay confirmer ≠ transmitter; `fnf_settlements.approved_by ≠ created_by`.
11. **One structure + snapshot per payslip:** `structure_version_ref` + `snapshot_id`.
12. **FK integrity & soft delete:** no hard delete (platform-wide); employee with open loan/deduction/carryforward/FnF cannot be soft-closed.
13. **Single-in-flight run:** partial unique index / advisory lock; second concurrent FINAL → `ERR-G10-RUN-INFLIGHT` (409).
14. **Remittance reconciliation:** `deducted_total = Σ payslip_lines` per scheme/period; MATCHED only when deposit ties within tolerance; OVERDUE past due date; late interest computed.
15. **GL balance:** `total_debit = total_credit`; net-pay clearing line = `Σ disbursed + Σ held`.
16. **Snapshot determinism:** FINAL run records `snapshot.checksum`; re-run reproduces identical payslips.
17. **Perquisite into tax:** every ACTIVE `perquisites.taxable_value` included in `tax_declarations.perquisite_total`; concessional loan must have a linked perquisite.
18. **Carryforward conservation:** `outstanding = original − recovered ≥ 0`; recovery never exceeds ordered amount.

> Audit-trail integrity for all 18 rules is provided by the **P05 DB-trigger** (no application path can suppress an audit row), not by application-level audit writes.

### 5.7 Sample Data

v2 sample rows retained (rate_tables PT-by-state; statutory_remittances; fnf_settlements; disbursement_holds; perquisites; gl_journals; deduction_carryforwards; run_input_snapshots header) — now each row additionally carries `tenant_id`/`entity_id`. (Values exactly as v2 §5.7.)

---

## 6. Functional Requirements

> Each FR retains its v2 structure (ID, Module, Roles, User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behaviour, Edge Cases, LLD). v3 re-grounds: approvals/locking on **P01**; authorization/SoD on **P02**; audit on **P05**; jobs `JOB-G10-*` on **X.1**; notifications `MSG-G10-*` on **X.2**; bank/portal/ERP calls on **X.3** (creds in **P04**); upstream G01/G03/G06/G09; downstream G11/G12/G13; platform error codes (`ERR-G10-*` + 8-code table). All 22 FRs (18 v1 + FR-19…22) preserved.

---

### FR-G10-01 — Pay Component & Rules Engine Configuration (constrained, versioned DSL)

- **Module:** G10-F01 / G10-F02
- **Primary Role(s):** Org/SysAdmin (config), Payroll Approver (approve via P01)
- **User Story:** As an Administrator, I want to define earning/deduction/perquisite components and their versioned computation rules — against a **pinned, independently-versioned DSL grammar** — so that payroll math is configurable without code changes, fully auditable (P05), and the formula escape hatch is bounded and safe.
- **Description:** Maintain `pay_components` and `pay_rules` (formula DSL, calc method, eligibility, rounding, computation order, effective dates). Rules versioned; the safe expression evaluator (Appendix 16.7) pins decimal/null/precedence semantics and a whitelisted token/function set; the DSL grammar carries its own `dsl_grammar_version`. The `FORMULA` escape hatch is restricted to vetted, property-tested expressions. **Activation is a maker-checker flow configured on P01 (W.1).**
- **Acceptance Criteria:**
  - AC1: A component can be created with type, category (incl. `PERQUISITE`, `ROUNDING_ADJUSTMENT`, `LEAVE_ENCASHMENT`), calc method, taxable flag, display order.
  - AC2: A rule version with an invalid expression (unknown reference, unbalanced parens, disallowed token, ambiguous precedence, null-yielding reference) is rejected (`ERR-G10-RULE-EXPR`, 422) with line/column.
  - AC3: Activating a rule version sets `effective_to` on the prior ACTIVE version to one day before the new `effective_from`; no overlap.
  - AC4: Computation order unique within an effective window; forward references rejected (no circular refs).
  - AC5: All changes require **Payroll Approver** approval via a **P01** maker-checker instance before ACTIVE.
  - AC6: A FORMULA component records `dsl_grammar_version`; a grammar upgrade re-validates/quarantines existing FORMULA rules.
- **Business Rules:** BR1: A component referenced by an active structure cannot be deleted, only deactivated. BR2: `is_statutory=true` deductions cannot be overridden below statutory by a Payroll Officer (P02). BR3: Formula references resolved in `computation_order`; forward refs rejected. BR4: DSL property tests must pass before a FORMULA rule activates.
- **Data Model References:** `pay_components`, `pay_rules`, `rate_tables`; audit via **P05** (DB-trigger).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/components` | create component |
| POST | `/api/v1/payroll/components/{id}/rules` | add rule version |
| POST | `/api/v1/payroll/rules/{id}:activate` | activate (P01 checker) |
| GET | `/api/v1/payroll/components` | list (cursor-paginated) |
| GET | `/api/v1/payroll/dsl/grammar` | current DSL grammar version & token set |

- **UI Behaviour:** Rule editor with live validation, "test against sample employee" trace panel, version timeline, DSL-grammar badge; activation gated for makers (P02). W.2 form for component metadata.
- **Edge Cases:** Circular refs; activating a rule whose `rate_table` has no effective row; deactivating mid-FY; grammar-version upgrade invalidating an in-use FORMULA rule.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RuleConfigController`, `ExpressionParser` (grammar-versioned), `RuleVersionService`, `ComponentRepository`, `DslPropertyTestRunner` |
| Backend Flow | Validate → parse to AST against pinned grammar → static-check refs & order → property tests → persist DRAFT → on activate, **P01 SoD/checker** + close prior version + set ACTIVE in a transaction |
| Data Operations | INSERT component/rule; UPDATE prior `effective_to`; transactional; P05 trigger captures audit |
| Validation | `VAL-G10-DSL-TOKEN`, `VAL-G10-RULE-ORDER`, `VAL-EFFECTIVE`; whitelist; decimal/null/precedence; grammar pin |
| Authorization | P02: SysAdmin create; Payroll Approver activate; Auditor read |
| State & Side Effects | rule DRAFT→ACTIVE; prior→RETIRED; P05 audit; rule-set cache invalidation |
| Failure Handling | Parse error → `ERR-G10-RULE-EXPR` (422); overlap → `ERR-G10-RULE-OVERLAP` (409); failed property test → `ERR-G10-DSL-PROPTEST` (422) |
| Dependencies | rate_tables (FR-02), **P01**, **P02**, **P05** |
| Test Guidance | Property-test parser; non-overlap invariant; SoD; grammar-upgrade re-validation |

---

### FR-G10-02 — Pay Scale / Matrix & Statutory Rate Table Management (PT by state)

- **Module:** G10-F01
- **Primary Role(s):** Org/SysAdmin, Payroll Approver
- **User Story:** As an Administrator, I want to maintain pay-matrix levels and effective-dated statutory rate tables (DA%, HRA class %, **PT slabs keyed by state**, tax slabs, GPF/NPS rates) so revisions apply automatically from their effective date, including for multi-state employees, using the platform **effective-date** mechanism (`VAL-EFFECTIVE`, Foundation §1/§3.3).
- **Description:** CRUD for `pay_matrix_levels` and `rate_tables`, all effective-dated. PT slabs carry a `state` dimension resolved from the snapshotted state of posting. A DA revision is entered once and applies from `effective_from` (retrospective → arrears via FR-10).
- **Acceptance Criteria:** AC1: Past-dated DA accepted and flagged "retrospective — will generate arrears". AC2: Overlapping effective rows for same `(tenant,entity,table_type,state,key,regime,FY)` rejected. AC3: Tax slabs require `regime`+`financial_year`; PT slabs require `state`,`slab_min`,`slab_max`. AC4: Versioned & audited (P05); no in-place edit of a row used in a LOCKED run. AC5: PT resolution returns the slab for the snapshotted state; missing mapping → `ERR-G10-PT-STATE` (422).
- **Business Rules:** BR1: HRA class % by `city_class` (X/Y/Z). BR2: A row used by a locked payslip is immutable. BR3: Effective dates align to the 1st unless mid-month proration enabled. BR4: PT by state of posting, not legal-entity default; inter-state transfer uses destination slab from the transfer date.
- **Data Model References:** `rate_tables` (incl. `state`), `pay_matrix_levels`, `pay_scales` (ref), `arrears` (downstream); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/rate-tables` | add effective-dated rate (PT requires `state`) |
| GET | `/api/v1/payroll/rate-tables?type=PT_SLAB&state=KARNATAKA&date=` | resolve rate as-of |
| POST | `/api/v1/payroll/pay-matrix` | add matrix level/cell |

- **UI Behaviour:** Effective-dated grid with as-of date + state selector; retrospective warning banner; old-vs-new compare.
- **Edge Cases:** DA notified after lock → arrears next cycle; cell deletion when referenced; mid-month DA; employee with no PT-state mapping; inter-state transfer mid-month.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RateTableController`, `EffectiveDateResolver`, `PayMatrixService`, `PtStateResolver` |
| Backend Flow | Validate range → non-overlap check (incl. state) → persist → if past-dated, enqueue arrears candidate scan (**X.1** `JOB-G10-ARREAR-SCAN`) |
| Validation | `VAL-EFFECTIVE`, `VAL-G10-RATE-NONOVERLAP`, `VAL-ENUM`; required fields by table_type; immutability vs locked runs |
| Authorization | P02: SysAdmin write; Payroll Approver approve; Auditor read |
| Failure Handling | Overlap → `ERR-G10-RATE-OVERLAP` (409); locked-ref edit → `ERR-G10-RATE-LOCKED` (409); missing PT state → `ERR-G10-PT-STATE` (422) |
| Dependencies | FR-10, FR-22 (state of posting), **P05**, **X.1** |
| Test Guidance | Resolver boundary dates; retrospective trigger; PT-by-state; inter-state transfer |

---

### FR-G10-03 — Employee Salary Structure Assignment & Versioning

- **Module:** G10-F03
- **Primary Role(s):** Payroll Officer (maker), Payroll Approver (checker via P01), HR Admin (request)
- **User Story:** As a Payroll Officer, I want to assign and version each employee's salary structure so that pay is derived correctly and every change is effective-dated and auditable (P05).
- **Description:** Bind an employee to a `pay_matrix_level` + component set → `employee_salary_structures` + `employee_salary_components`. Each change creates a new version (prior SUPERSEDED). Overrides require a reason. Scheme (GPF vs NPS) auto-attached by DOJ. **Approval is a P01 maker-checker instance.**
- **Acceptance Criteria:** AC1: New version supersedes prior ACTIVE with contiguous ranges. AC2: A FIXED_OVERRIDE requires `override_amount`+`override_reason`. AC3: Changes route through **P01** maker-checker before ACTIVE. AC4: A change in a LOCKED period → handled as arrear (FR-10).
- **Business Rules:** BR1: One ACTIVE version per employee per date. BR2: City class drives HRA. BR3: Statutory deduction components auto-attached by scheme.
- **Data Model References:** `employee_salary_structures`, `employee_salary_components`, `pay_matrix_levels`, `pay_components`, `deductions`; P05 audit; `workflows` (P01).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/employees/{id}/structures` | create new version |
| GET | `/api/v1/payroll/employees/{id}/structures` | version history |
| POST | `/api/v1/payroll/structures/{id}:approve` | P01 checker approve |

- **UI Behaviour:** Structure builder (auto-resolved components vs overrides); effective-date timeline; version diff; HRA auto-updates on city-class change.
- **Edge Cases:** GPF vs NPS by DOJ cutoff; mid-month transfer changing city class/state; override exceeding sanity bounds.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StructureController`, `StructureVersionService`, `SchemeResolver` |
| Backend Flow | Build component set from rules + scheme → apply overrides → validate → create version → close prior → **P01 maker-checker** → ACTIVE |
| Authorization | P02: Payroll Officer create; Payroll Approver approve |
| State & Side Effects | new ACTIVE version; SR-relevant pay change emits **G12** event on finalisation; P05 audit |
| Failure Handling | Locked period → `ERR-G10-STRUCT-LOCKED` (409); overlap → `ERR-G10-STRUCT-OVERLAP` (409) |
| Dependencies | FR-01/02, **G06** (pay-fixation source), FR-10, **P01**, **G12** |
| Test Guidance | Version contiguity; GPF/NPS by DOJ; override audit |

---

### FR-G10-04 — Monthly Payroll Run Engine (single-in-flight, rounding-balanced)

- **Module:** G10-F04
- **Primary Role(s):** Payroll Officer (run), Payroll Approver (oversee)
- **User Story:** As a Payroll Officer, I want to execute the monthly payroll run that computes every eligible employee's pay deterministically from a frozen cross-module snapshot, with no concurrent conflicting run.
- **Description:** Orchestrates the cycle as an **X.1 job (`JOB-G10-RUN`)**: freeze inputs at cutoff and take the cross-module snapshot (FR-22), gather structure snapshots + leave/LWP (FR-05) + statutory deductions (FR-06) + loan recoveries (FR-08) + arrears (FR-10) + perquisites (FR-21), evaluate rules in order, append a `ROUNDING_ADJUSTMENT` line, persist `payslips`+`payslip_lines` with full `calc_trace`. Single atomic commit; DRAFT and FINAL modes. A **single-in-flight constraint** (partial unique index + X.1 period lock) prevents two concurrent FINAL runs per cycle.
- **Acceptance Criteria:** AC1: Draft run → per-employee results + full trace + quarantine list (no partial commit). AC2: Re-run with unchanged inputs + same frozen snapshot → identical results. AC3: Computation errors isolated; run reports them without aborting valid computations. AC4: `net_pay ≥ 0`; un-recovered amounts roll into `deduction_carryforwards`. AC5: Run totals = sum of payslips at commit; rounding-adjustment ties to the rupee. AC6: Second FINAL attempt → `ERR-G10-RUN-INFLIGHT` (409).
- **Business Rules:** BR1: Only ACTIVE employees in the snapshot scope on pay date (joiners/leavers prorated). BR2: FINAL requires INPUT_LOCKED + frozen snapshot. BR3: Rate tables effective on the period, not "today". BR4: Suspended employees → subsistence only (Appendix 16.6); dies-non → no pay/no service. BR5: Mid-month inter-DDO transfer uses DDO-of-record for the transfer month (Appendix 16.8).
- **Data Model References:** `payroll_cycles`, `payroll_runs` (`snapshot_id`, `in_flight_lock_key`, `workflow_instance_id`), `payslips`, `payslip_lines`, `run_input_snapshots`, `employee_salary_structures`, `deductions`, `deduction_carryforwards`, `loans_advances`, `arrears`, `perquisites`, `rate_tables`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` | start a run (mode in body; acquires in-flight lock; `Idempotency-Key` required) |
| GET | `/api/v1/payroll/runs/{id}` | run status & totals |
| GET | `/api/v1/payroll/runs/{id}/exceptions` | per-employee failures (cursor-paginated) |
| POST | `/api/v1/payroll/runs/{id}:cancel` | cancel draft (releases lock) |

- **UI Behaviour:** Run console (computed/total progress, live totals, exception drill-down, per-employee trace, snapshot ref+checksum, in-flight lock indicator). FINAL gated behind reconciliation.
- **Edge Cases:** Mid-month joiner/leaver proration; suspended (subsistence); dies-non; missing structure; division-by-zero; very large cohort; inter-DDO transfer month; concurrent FINAL.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RunOrchestrator`, `ComputationEngine`, `InputAggregator`, `SnapshotBinder`, `RoundingBalancer`, `StagingRepository`, `InFlightLockManager`; runs as **X.1** job worker |
| Backend Flow | Acquire in-flight lock (X.1 period lock) → lock inputs → bind frozen snapshot → aggregate (incl. perquisite monthly value) → compute in order into staging → append rounding-adjustment → validate identities → atomic commit → roll un-recovered to carryforwards |
| Validation | `VAL-G10-IDENTITY`, `VAL-CURRENCY`; net≥0; scope eligibility; rate resolution; snapshot present; in-flight uniqueness |
| Authorization | P02: Payroll Officer (own entity/org scope); Approver read |
| State & Side Effects | run QUEUED→RUNNING→COMPLETED/FAILED; cycle OPEN→COMPUTING→COMPUTED; **P05 audit**; **X.2** notifications |
| Failure Handling | Per-employee error → quarantine + `error_summary`; engine fault → FAILED, no commit; concurrent FINAL → `ERR-G10-RUN-INFLIGHT` (409); idempotent restart (X.1 per-period run key) |
| Dependencies | FR-01..03, 05, 06, 08, 10, 21, 22; **X.1**, **P05**, **X.2** |
| Test Guidance | Determinism vs frozen snapshot; proration; subsistence/dies-non; quarantine isolation; rounding tie-out; in-flight lock; large-batch perf; rollback on mid-commit failure |

---

### FR-G10-05 — Attendance & Leave (LWP) Input Integration (subsistence/dies-non)

- **Module:** G10-F05
- **Primary Role(s):** Payroll Officer, HR Admin
- **User Story:** As a Payroll Officer, I want to ingest paid/unpaid day counts and LWP from **G03** as-of the cutoff snapshot so LOP, subsistence, and dies-non are computed accurately.
- **Description:** Pull approved attendance/leave for the cycle from **G03** (PrimeSoft M04 Leave + M05 Attendance) **into the run snapshot (FR-22)** by reference. Compute LWP LOP (per-day rate = monthly pay / days-in-month or /30 per policy). Subsistence and dies-non per Appendix 16.6. Inputs freeze at cutoff; late changes route to arrears.
- **Acceptance Criteria:** AC1: LWP days reduce pay using the configured per-day basis; reduction shows as a line. AC2: paid+LWP reconcile to calendar days for full-month employees. AC3: Attendance after cutoff excluded (snapshot frozen), queued for arrears. AC4: Unauthorised absence beyond threshold flags an exception (link to G09 if dies-non). AC5: Suspended → subsistence only; dies-non → zero pay/zero qualifying service.
- **Business Rules:** BR1: Per-day basis configurable. BR2: Half-pay leave reduces eligible components per policy. BR3: Joiner/leaver proration uses actual paid days. BR4: Subsistence base/escalation & dies-non per Appendix 16.6.
- **Data Model References:** `payslips` (paid_days/lwp_days), `payslip_lines` (LWP/subsistence line), `run_input_snapshots` (`g03_facts`), **G03** attendance (read), `arrears` (late inputs).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/cycles/{id}/attendance-inputs` | fetched G03 inputs (from snapshot) |
| POST | `/api/v1/payroll/cycles/{id}/attendance-inputs:refresh` | re-pull before cutoff |

- **UI Behaviour:** Attendance input grid (employee × paid/LWP/half/subsistence); exceptions highlighted; "refresh from G03" with cutoff/snapshot lock indicator.
- **Edge Cases:** Retrospective leave regularisation post-lock; dies-non vs LWP; overlapping leave records; leave-encashment interplay (FR-12).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AttendanceInputAdapter` (G03 client), `LWPCalculator`, `SubsistenceCalculator` |
| Backend Flow | Fetch approved G03 records for period into snapshot → map to paid/LWP/half/dies-non → compute per-day deduction or subsistence → feed run engine |
| Authorization | P02: Payroll Officer scope |
| Failure Handling | G03 unavailable → handled via service-contract error mapping → `PRECONDITION_FAILED` (412) / `INTERNAL` (500) + `ERR-LOADFAIL`, retry; mismatch → exception list |
| Dependencies | **G03**, FR-04, FR-10, FR-22 |
| Test Guidance | Per-day basis variants; proration; post-cutoff handling; subsistence escalation; dies-non path |

---

### FR-G10-06 — Statutory Deductions Computation (GPF/PF, NPS, PT-by-state, Pension, Insurance)

- **Module:** G10-F06
- **Primary Role(s):** Payroll Officer, Payroll Approver
- **User Story:** As a Payroll Officer, I want statutory deductions computed automatically per scheme and slab so GPF/PF, NPS, PT-by-state, pension, and insurance are accurate and remittable, with YTD derived from the immutable line ledger.
- **Description:** Compute GPF/CPF, NPS (employee 10% + employer 14% of basic+DA), PT (state slab resolved by snapshotted state of posting), pension/insurance, court attachments. **YTD = derived Σ over `payslip_lines` (rule #9)**; `cumulative_ytd` is a cache. Feeds the remittance tracker (FR-19).
- **Acceptance Criteria:** AC1: NPS computes employee + employer; employer appears as info/cost line feeding the GL journal. AC2: PT applies the correct state slab. AC3: Statutory caps enforced. AC4: YTD recomputes from the ledger and stays correct across regular+arrears+off-cycle and after reopen. AC5: Court-attachment respects CPC s.60 exemption independently of the flat floor (FR-09); shortfall → carryforward.
- **Business Rules:** BR1: GPF/NPS scheme by DOJ. BR2: Court-attachment priority within net-pay protection + own exemption. BR3: Employer NPS/pension are costs, not employee deductions. BR4: PT by state of posting. BR5: Subsistence-only employees compute on the subsistence base.
- **Data Model References:** `deductions` (cache YTD), `payslip_lines` (YTD truth), `rate_tables`, `deduction_carryforwards`, `statutory_remittances` (downstream); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/employees/{id}/deductions` | list deductions + derived YTD |
| POST | `/api/v1/payroll/employees/{id}/deductions` | add voluntary/manual deduction |
| GET | `/api/v1/payroll/runs/{id}/statutory-summary` | run-level statutory totals (feeds FR-19) |

- **UI Behaviour:** Deduction panel per employee (scheme, rate, derived YTD with "recomputed from ledger" provenance); voluntary GPF top-up; employer-contribution info card; PT-state indicator.
- **Edge Cases:** Mid-year scheme migration; PT slab boundary; inter-state transfer changing PT; court attachment exceeding protected net (carryforward); NPS crossing basic+DA threshold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StatutoryDeductionService`, `SchemeResolver`, `SlabResolver` (state-aware), `YtdLedgerDeriver` |
| Backend Flow | Resolve scheme & PT state → compute each statutory line via rate tables → apply caps & priority & CPC exemption → write lines → recompute cache YTD from ledger |
| Failure Handling | Missing rate → run exception `ERR-G10-RATE-NOTFOUND` (422); missing PT state → `ERR-G10-PT-STATE` (422); cap breach → clamp + flag |
| Dependencies | FR-02, FR-04, FR-09, FR-19, FR-22 |
| Test Guidance | Scheme-by-DOJ; PT-by-state boundaries; YTD ledger derivation across run types + reopen; attachment exemption + carryforward |

---

### FR-G10-07 — Income-Tax (TDS) Declarations, Proofs & Full Computation Pipeline

- **Module:** G10-F07 / G10-F06
- **Primary Role(s):** Employee (declare), Payroll Officer (verify), Payroll Approver
- **User Story:** As an Employee, I want to declare investments, capture previous-employer income (Form-12B via a W.2 form), choose a regime, upload proofs (G13), and see a transparent, traceable projected tax — surcharge, cess, rebate, and relief included — so TDS is accurate across the year.
- **Description:** Employees submit `tax_declarations` (regime, 80C/80D/HRA/home-loan, Form-12B), upload proofs (**G13**). The engine projects annual taxable income — **incl. taxable perquisites from FR-21** — through the full pipeline: gross taxable → standard deduction → Chapter VI-A → slab tax → surcharge (with marginal relief) → 4% cess → 87A rebate → 89(1)/Form-10E relief — spreading TDS across remaining months. Intermediate values persisted on `tax_declarations`. Proof verification is a **P01** maker-checker flow after cutoff; unverified declarations revert to conservative computation.
- **Acceptance Criteria:** AC1: Switching regime recomputes the full pipeline and per-month TDS. AC2: After proof cutoff, unverified declared deductions excluded, TDS recomputed. AC3: Declaration locks after FY proof cutoff. AC4: Projected tax updates when salary/arrears/perquisites change. AC5: Each stage persisted and shown as a step-by-step breakdown. AC6: Mid-year joiners' Form-12B income included. AC7: Cross-FY arrears generate Form-10E relief in TDS and Form-16.
- **Business Rules:** BR1: New regime ignores most exemptions per statute. BR2: `TDS = (projected annual tax − YTD TDS from ledger) / remaining months`. BR3: Proof verification is **P01** maker-checker; partial verification reduces allowed amount. BR4: Surcharge with marginal relief; 4% cess; 87A per regime. BR5: Perquisite value (FR-21) added before slab tax.
- **Data Model References:** `tax_declarations` (12B/10E/surcharge/cess/87A/std-deduction/perquisite_total), `perquisites`, **G13** documents (proofs), `deductions` (TDS), `payslip_lines` (TDS YTD truth), `rate_tables` (TAX_SLAB).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/tax-declarations` | submit/update (self) |
| POST | `/api/v1/payroll/tax-declarations/{id}/proofs` | upload proof (G13) |
| POST | `/api/v1/payroll/tax-declarations/{id}/form12b` | capture previous-employer income |
| POST | `/api/v1/payroll/tax-declarations/{id}:verify` | verify (Payroll, P01) |
| GET | `/api/v1/payroll/tax-declarations/{id}/projection` | full traceable projection breakdown |
| GET | `/api/v1/payroll/tax-declarations/{id}/form10e` | 89(1) relief working |

- **UI Behaviour:** Regime comparison wizard; declaration W.2 form with section limits; Form-12B entry; proof upload; step-by-step projected-tax breakdown; cutoff countdown.
- **Edge Cases:** Mid-year regime change restrictions; partial proof acceptance; arrears spiking taxable income (→10E); leaver mid-year (final TDS via FnF FR-20); surcharge marginal-relief boundary; perquisite added late.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `TaxDeclarationController`, `TaxProjectionEngine`, `RegimeComparator`, `Form10EService`, `Form12BService`, `PerquisiteIntegrator`, G13 document client |
| Backend Flow | Capture declaration + 12B + perquisites → project annual income → std ded → Ch-VI-A → slab → surcharge+marginal relief → cess → 87A → 89(1)/10E → derive monthly TDS from ledger YTD → on verify (P01) finalise allowed amounts |
| Validation | `VAL-PAN`; section caps; regime rules; cutoff lock; proof presence; surcharge thresholds; marginal-relief math |
| Authorization | P02: Employee self; Payroll verify; Auditor read |
| Failure Handling | Slab missing → `ERR-G10-TAXSLAB-NOTFOUND` (422); over-declaration → clamp to cap |
| Dependencies | **G13**, FR-02, FR-19, FR-21, FR-20; **P01** |
| Test Guidance | Regime switch math; surcharge+marginal relief; cess; 87A; 89(1)/10E cross-FY; Form-12B inclusion; perquisite inclusion; cutoff exclusion |

---

### FR-G10-08 — Loans & Advances Management (concessional-loan perquisite linkage)

- **Module:** G10-F08
- **Primary Role(s):** Employee (request), DDO/HOD (sanction via P01), Payroll Officer (schedule/recover)
- **User Story:** As an Employee, I want to apply for loans/advances and have installments recovered automatically through payroll, with interest, and any concessional-interest perquisite correctly taxed.
- **Description:** Lifecycle for HBA/vehicle/computer/festival/GPF/salary advances: request → **P01 sanction** → disburse → installment recovery → foreclosure/closure. Maintains `loans_advances`+`loan_repayments`. When charged rate < reference rate, the loan is flagged `is_concessional` and generates a taxable perquisite (FR-21) wired into TDS (FR-07).
- **Acceptance Criteria:** AC1: Each run recovers the scheduled installment; outstanding decreases. AC2: Final installment closes the loan; `Σ principal = principal`. AC3: Foreclosure computes outstanding + accrued interest in one entry. AC4: Insufficient net → partial/skip per policy; shortfall → `deduction_carryforwards`. AC5: Concessional/interest-free loan auto-creates/updates a `perquisites` row (Rule 3); rate change revises it.
- **Business Rules:** BR1: Total deductions cannot push net below the protected minimum; loan recovery yields after statutory. BR2: Interest method fixed at sanction. BR3: A loan on hold skips recovery unless policy charges interest. BR4: Concessional-loan perquisite per Appendix 16.7/Rule 3.
- **Data Model References:** `loans_advances` (`is_concessional`, `perquisite_id`, `workflow_instance_id`), `loan_repayments`, `perquisites`, `payslip_lines`, `deduction_carryforwards`; **P01** sanction; P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/loans` | apply |
| POST | `/api/v1/payroll/loans/{id}:sanction` | DDO sanction (P01) |
| POST | `/api/v1/payroll/loans/{id}:foreclose` | foreclosure |
| GET | `/api/v1/payroll/loans/{id}/schedule` | amortization schedule |
| GET | `/api/v1/payroll/loans/{id}/perquisite` | concessional perquisite valuation |

- **UI Behaviour:** Loan application wizard (eligibility check); amortization preview; self-service statement; foreclosure calculator; concessional-perquisite indicator with taxable-value preview.
- **Edge Cases:** Insufficient net (carryforward); loan during LWP months; transfer mid-recovery; outstanding loan at retirement (settle in FnF FR-20 / G11); reference-rate revision mid-year.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `LoanController`, `AmortizationService`, `RecoveryScheduler`, `ConcessionalPerquisiteService` |
| Backend Flow | **P01 sanction** → generate schedule → flag concessional & create perquisite → each run pull due installment → split principal/interest → recover (net protection) → update ledger & perquisite |
| Authorization | P02: Employee request; DDO sanction; Payroll recover |
| Failure Handling | Insufficient net → `ERR-G10-RECOVERY-NET` (409) + carryforward; ledger never negative |
| Dependencies | FR-04, FR-07, FR-21, FR-20, **G11**, **P01** |
| Test Guidance | Amortization (simple/reducing); foreclosure; insufficient-net carryforward; closure invariant; concessional perquisite valuation & revision |

---

### FR-G10-09 — Recoveries & Ad-hoc Adjustments (net-pay floor, attachment exemption, legal-eligibility gate)

- **Module:** G10-F09
- **Primary Role(s):** Payroll Officer, Payroll Approver, DDO (overpayment adjudication), (source) Disciplinary Authority (**G09**)
- **User Story:** As a Payroll Officer, I want to apply recoveries ordered by disciplinary authorities and recover prior overpayments within a defined net-pay floor and statutory exemptions — and only where legally permitted.
- **Description:** Ingest recovery orders from **G09** and internally-detected overpayments; schedule recovery within a configurable protected net-pay floor and CPC s.60 exemption; track recovered-to-date; roll unmet amounts into `deduction_carryforwards`. Before scheduling an overpayment recovery, flag legally-barred cases (Rafiq Masih line) for explicit DDO/authority decision (via a **P01** flow) with recorded justification.
- **Acceptance Criteria:** AC1: A G09 recovery order creates a scheduled recovery with defined total + per-cycle amount. AC2: Recovery never exceeds ordered total. AC3: Respects the floor + s.60 exemption; spillover → carryforwards. AC4: Recovered-to-date reported; closes when satisfied. AC5: Recovery against a legally-barred case blocked until an authority records a decision (`ERR-G10-RECOVERY-BARRED`). AC6: Rolled-forward un-recovered deductions appear in a managed backlog (FR-24/§12).
- **Business Rules:** BR1: Disciplinary recoveries cannot be waived by Payroll. BR2: Overpayment recovery requires documented justification, legal-eligibility check, and employee notification (X.2). BR3: Priority: statutory → court attachment (s.60) → disciplinary → overpayment → loans → voluntary. BR4: Protected floor configurable (cadre/jurisdiction), distinct from attachment exemption.
- **Data Model References:** `deductions` (RECOVERY; `attachment_exemption_basis`), `deduction_carryforwards`, `payslip_lines`, **G09** order (read); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/recoveries` | create recovery (from order/overpayment) |
| GET | `/api/v1/payroll/recoveries/{id}` | status & recovered-to-date |
| POST | `/api/v1/payroll/recoveries/{id}:hold` | pause (justified) |
| POST | `/api/v1/payroll/recoveries/{id}:adjudicate` | authority decision (P01) |
| GET | `/api/v1/payroll/carryforwards?ageing=` | rolled-forward backlog |

- **UI Behaviour:** Recovery tracker (ordered vs recovered vs remaining); source-order link; priority indicator; net-floor & exemption indicators; legal-eligibility flag with adjudication action; carryforward ageing.
- **Edge Cases:** Multiple concurrent recoveries competing for limited net; retire before full recovery (FnF/G11); appeal in G09 reverses an order mid-recovery (refund); legally-barred retiree overpayment.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RecoveryService`, `PriorityResolver`, `NetFloorGuard`, `AttachmentExemptionCalculator`, `LegalEligibilityChecker`, G09 client |
| Backend Flow | Receive order → (overpayment) legal-eligibility check → create schedule → each run apply within floor + s.60 by priority → track recovered-to-date → roll shortfall to carryforward → close when satisfied |
| Authorization | P02: Payroll Officer/Approver; DDO adjudication; reversal needs Approver + source confirmation |
| Failure Handling | Over-recovery prevented; legally-barred → `ERR-G10-RECOVERY-BARRED` (409) until adjudicated; conflict resolved by priority |
| Dependencies | **G09**, FR-04, FR-20, **G11**, **P01** |
| Test Guidance | Priority ordering; over-recovery guard; net floor; s.60 exemption; legal-eligibility gate; appeal reversal refund; carryforward conservation |

---

### FR-G10-10 — Arrears & Retrospective Revisions Engine (dependent-allowance cascade)

- **Module:** G10-F10
- **Primary Role(s):** Payroll Officer, Payroll Approver
- **User Story:** As a Payroll Officer, I want the system to compute arrears for back-dated DA/increment/promotion/pay-fixation so employees receive the exact difference owed, with all dependent allowances recomputed and statutory deductions and Form-10E relief re-derived on the differential.
- **Description:** When a retrospective change occurs (DA revision FR-02, pay-fixation **G06**, correction), the engine recomputes pay for each affected past month using then-effective rules. A retrospective basic-pay change recomputes every dependent component in order per historical month — DA, HRA, TPT, NPS, GPF. It derives per-component per-month deltas vs actually paid, recomputes statutory deductions (incl. TDS) on the differential, flows arrear TDS delta through the corrected YTD ledger and Form-10E relief, and produces an `arrears` record paid through an ARREARS cycle.
- **Acceptance Criteria:** AC1: Arrears = Σ over months of (new − old) for basic and every dependent component, net of recomputed deductions. AC2: References the source (notification/G06 order); month-wise component-wise break-up. AC3: Recompute TDS via the derived YTD ledger; flow into Form-16/10E. AC4: LOCKED-period arrears never mutate the original payslip (additive lines via `arrear_ref`). AC5: Dependent-allowance cascade shown explicitly.
- **Business Rules:** BR1: Use rules effective in each historical month. BR2: Negative arrears via recovery/carryforward. BR3: Promotion arrears link to G06 fixation order. BR4: Cross-FY arrears → Form-10E relief (FR-07).
- **Data Model References:** `arrears` (`component_breakup`), `payslips`/`payslip_lines`, `rate_tables` (historical), `payroll_cycles` (ARREARS), `deductions`, `tax_declarations` (10E).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/arrears:compute` | compute for trigger (DA/fixation) with cascade |
| GET | `/api/v1/payroll/arrears/{id}` | arrear breakup (component-wise cascade) |
| POST | `/api/v1/payroll/arrears/{id}:approve` | approve for payout (P01) |

- **UI Behaviour:** Arrears screen with month-wise grid (basic delta + DA/HRA/TPT/NPS/GPF deltas), source reference, net arrear after deduction recompute, 10E relief preview, approve-to-cycle action.
- **Edge Cases:** Overlapping retrospective changes; separation during arrear window (→FnF); arrears crossing FYs (10E); downward revision causing recovery/carryforward.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ArrearsEngine`, `HistoricalRecomputer`, `DependentCascadeResolver`, `RateTableResolver`, `Form10EService` |
| Backend Flow | Identify affected employees/months → recompute each month with historical rules → cascade dependent components → diff vs actual → recompute statutory delta → 10E relief → persist arrear → route to ARREARS cycle |
| Authorization | P02: Payroll Officer compute; Approver approve (P01) |
| State & Side Effects | arrear COMPUTED→APPROVED→PAID; TDS YTD adjusted via ledger; 10E relief; **G12** pay event if pay-scale changed |
| Failure Handling | Missing historical rate → exception; overlap → ordered application |
| Dependencies | FR-02, FR-06, FR-07, FR-17, **G06**, **G12** |
| Test Guidance | DA back-dating cascade; promotion fixation arrears; cross-FY 10E; downward revision recovery |

---

### FR-G10-11 — Supplementary & Off-Cycle Payroll

- **Module:** G10-F11
- **Primary Role(s):** Payroll Officer, DDO (sanction), Payroll Approver
- **User Story:** As a Payroll Officer, I want to process supplementary and off-cycle payments so missed payments, new-joiner first pay, bonuses, ex-gratia, re-disbursement of held net pay, and urgent corrections are paid outside the regular cycle with the same controls.
- **Description:** Create SUPPLEMENTARY/OFF_CYCLE/BONUS cycles for a defined cohort, compute with the same engine and controls (snapshot, reconciliation, **P01** approval, DSC-signed bank file over X.3), feed the same derived YTD ledger. Off-cycle requires **P01 sanction**. Off-cycle clears `disbursement_holds` once accounts are corrected.
- **Acceptance Criteria:** AC1: Off-cycle for a cohort computes/reconciles/approves/disburses independently. AC2: Off-cycle contributes to derived YTD. AC3: Off-cycle requires DDO sanction + Approver approval (SoD via P01/P02). AC4: Duplicate off-cycle for same purpose/employee prevented (`Idempotency-Key`). AC5: Re-disbursing a held amount references the originating `disbursement_holds` row and closes it on success.
- **Business Rules:** BR1: Bonus/ex-gratia taxability per rules. BR2: Off-cycle cannot pay a component already paid for the period unless flagged correction. BR3: Same reconciliation/locking gates. BR4: Single-in-flight per off-cycle cycle.
- **Data Model References:** `payroll_cycles` (OFF_CYCLE/SUPPLEMENTARY), `payroll_runs`, `payslips`, `bank_disbursements`, `disbursement_holds`, `deductions`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles` | create supplementary/off-cycle (`Idempotency-Key`) |
| POST | `/api/v1/payroll/cycles/{id}/runs` | run it |
| POST | `/api/v1/payroll/cycles/{id}:sanction` | DDO sanction (P01) |
| POST | `/api/v1/payroll/holds/{id}:redisburse` | clear a suspense hold via off-cycle |

- **UI Behaviour:** Off-cycle wizard (purpose incl. "clear suspense holds", cohort, components, amounts); preview; sanction & approve (P01); reuse the run console.
- **Edge Cases:** Off-cycle overlapping the regular run; bonus spanning FYs; new joiner first-pay before structure fully approved; re-disbursement of a frozen-account hold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OffCycleService`, reuse `RunOrchestrator`/`ComputationEngine`, `HoldClearingService` |
| Backend Flow | Create off-cycle → **P01 sanction** → compute cohort → reconcile → approve → disburse (X.3) → update ledger YTD → close referenced holds |
| Failure Handling | Duplicate → `ERR-G10-OFFCYCLE-DUP` (409); missing sanction → `FORBIDDEN` (403) |
| Dependencies | FR-04, FR-14, FR-16, **P01** |
| Test Guidance | YTD continuity; duplicate prevention; sanction SoD; multi-FY bonus; suspense-hold clearing |

---

### FR-G10-12 — Benefits Administration (Medical, LTC/LTA, Gratuity, Insurance, Reimbursements, Leave Encashment)

- **Module:** G10-F12
- **Primary Role(s):** Employee (claim), Reporting Manager (recommend via P01), Payroll Officer/Approver (verify/pay)
- **User Story:** As an Employee, I want to enrol in and claim benefits (medical, LTC/LTA, reimbursements, leave encashment) and have gratuity/insurance administered so I receive entitlements correctly and they reflect in pay, FnF, or off-cycle payout.
- **Description:** Manage `benefits` and `benefit_claims` (incl. `LEAVE_ENCASHMENT`) with **P01** workflow approval; accrue gratuity per period via **X.1 `JOB-G10-GRATUITY-ACCRUAL`**; administer group insurance and reimbursement plans. Leave encashment = `eligible balance × per-day basis (basic+DA/30 or policy)`, subject to caps and taxability; can feed regular pay, FnF (FR-20), or off-cycle. LTC respects block-year rules.
- **Acceptance Criteria:** AC1: Claim follows submit → recommend → approve (P01) → pay; approved ≤ entitlement/cap. AC2: LTC validates block-year eligibility/prior utilisation. AC3: Gratuity accrues per period using last-drawn basic+DA + years of service, capped at statutory ceiling. AC4: Approved reimbursements appear on payslip (taxable per rules) or off-cycle. AC5: Leave encashment computes from eligible balance × per-day basis with cap and taxability; retirement-exempt portion (s.10(10AA)) excluded from taxable income.
- **Business Rules:** BR1: Medical/LTC taxability per statute. BR2: Gratuity payout settled by G11/FnF at separation; G10 maintains accrual. BR3: Claims require proofs (G13); duplicate proof reuse blocked. BR4: Leave-encashment eligibility/caps configurable; retirement exemption applied; in-service encashment taxable.
- **Data Model References:** `benefits` (incl. LEAVE_ENCASHMENT), `benefit_claims`, `gratuity_accruals`, **G13** documents, `payslip_lines`/off-cycle, `fnf_settlements` (encashment feed); **P01** workflow.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/benefit-claims` | submit claim (incl. leave-encashment) |
| POST | `/api/v1/payroll/benefit-claims/{id}:approve` | approve (P01) |
| GET | `/api/v1/payroll/employees/{id}/gratuity-accrual` | accrual as-of |
| GET | `/api/v1/payroll/employees/{id}/leave-encashment:compute` | encashment computation preview |

- **UI Behaviour:** Benefits dashboard (entitlements, balances, block-year status); claim W.2 form with proof upload; gratuity accrual statement; leave-encashment calculator (eligible days × per-day basis, cap, taxable vs exempt split).
- **Edge Cases:** LTC block-year carry-forward; medical claim exceeding cap; gratuity for break in service; insurance premium recovery vs employer-paid; encashment at retirement vs in-service taxability.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenefitController`, `ClaimWorkflowService` (P01), `GratuityAccrualJob` (X.1), `LeaveEncashmentCalculator` |
| Backend Flow | Submit claim → **P01** (recommend/approve) → cap check → compute encashment (eligible × per-day, cap, exemption) → schedule payout (payroll/FnF/off-cycle); periodic gratuity accrual job (X.1) |
| Authorization | P02: Employee submit; Manager recommend; Payroll approve |
| Failure Handling | Over-cap → clamp + reason; duplicate proof → `CONFLICT` (409) |
| Dependencies | **G13**, FR-04/11, FR-20, **G11**, **P01**, **X.1** |
| Test Guidance | Block-year logic; cap enforcement; accrual math; encashment + retirement exemption; payout routing |

---

### FR-G10-13 — Payslip Generation, Self-Service Access & Reopen Versioning

- **Module:** G10-F13
- **Primary Role(s):** Payroll Officer (generate/publish), Employee (view)
- **User Story:** As an Employee, I want to view and download my monthly payslip with a full break-up; and as Payroll I want to publish payslips securely once the run is locked, with clear versioning when a period is reopened.
- **Description:** Render `payslips` into a PDF stored in **G13**, with employer/employee details, component break-up, derived YTD, leave/LWP, loan/recovery status, perquisite and tax summary. Published only after run lock; immutable thereafter. On reopen (FR-16) the original becomes SUPERSEDED/REVERSED and a new version is published; employees see version history with the active version highlighted. Publication notifications via **X.2**.
- **Acceptance Criteria:** AC1: Payslip totals match `payslips`/`payslip_lines` exactly (incl. rounding-adjustment). AC2: Publish only when run LOCKED. AC3: Employees see only their own (P02); managers see direct reports per scope. AC4: A published payslip is immutable; a correction → new version (reopen) or additive arrear/supplementary, prior version SUPERSEDED. AC5: Viewer shows version number + "what changed" summary.
- **Business Rules:** BR1: Bank account/PAN masked by default (P02 ceiling). BR2: Includes derived YTD + tax-projection summary. BR3: Download access logged (`security_audit_log`). BR4: Superseded versions remain accessible read-only.
- **Data Model References:** `payslips` (`version`, `superseded_by_payslip_id`), `payslip_lines`, **G13** documents (PDF); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/payslips:publish` | publish (post-lock) |
| GET | `/api/v1/payroll/employees/{id}/payslips` | list own payslips (incl. versions) |
| GET | `/api/v1/payroll/payslips/{id}/document` | download PDF (G13) |
| GET | `/api/v1/payroll/payslips/{id}/versions` | version history + diff |

- **UI Behaviour:** Payslip viewer (collapsible earnings/deductions, YTD tab, download); version selector with active-version badge + lock-to-lock diff; manager view scoped to reports; "provisional/final/superseded" badge.
- **Edge Cases:** Re-publish after arrears (additive) vs reopen (versioned); separated employee needing historical payslips; large-batch PDF generation (X.1).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PayslipRenderer`, `DocumentClient` (G13), `PayslipController`, `VersionDiffService` |
| Backend Flow | On publish, validate run LOCKED → render PDF per version → store in G13 → status PUBLISHED → **X.2** notify; on reopen, supersede prior, render new version, persist diff |
| Authorization | P02: Payroll publish; Employee/Manager scoped read; masking on serialization |
| Failure Handling | Render failure → retry queue (X.1); pre-lock publish → `ERR-G10-RUN-NOTLOCKED` (409) |
| Dependencies | FR-04/16, **G13**, **X.2** |
| Test Guidance | Totals parity; lock gate; scope isolation; reopen versioning & diff |

---

### FR-G10-14 — Bank Disbursement: DSC-Signed File, Positive-Pay Guard & Suspense-Hold Reconciliation

- **Module:** G10-F14
- **Primary Role(s):** Payroll Officer (generate), **Payroll Disburser** (DSC-sign/transmit), Finance/Treasury (positive-pay confirm)
- **User Story:** As a Payroll Disburser, I want to generate, validate, DSC-sign, and transmit the bank disbursement file with a unique bank-side batch reference over **X.3**, and reconcile acknowledgements and the treasury debit (positive pay) so net pay reaches every account exactly once, no payment is duplicated on resend, and no net pay leaves the tie-out silently.
- **Description:** Produce a `bank_disbursements` file (single treasury-certified format; ISO20022/CUSTOM deferred) from a LOCKED run's net pay. Excluded/invalid-account net parked in `disbursement_holds`, preserving `Σ disbursed + Σ held + Σ failed = run net`. The file carries a bank-side unique `bank_batch_ref` and is DSC/HSM-signed (keys in HSM, never in DB; integration creds in **P04**). Transmission and ack handling run on the **X.3 integration framework** (idempotent outbound calls, circuit-breaking, payload versioning, per-integration error mapping). A timeout/ambiguous ack moves the batch to `SUSPECTED_PROCESSED`; **resend is forbidden until a mandatory positive-pay/treasury-debit reconciliation confirms the credits did NOT post.** Failed lines route to off-cycle re-disbursement (FR-11) via their hold rows.
- **Acceptance Criteria:** AC1: `Σ disbursed + Σ held + Σ failed = run net_total`; `record_count` = payees with net>0 and a valid account. AC2: File generation requires a LOCKED, reconciled run. AC3: DSC-signing by the **Payroll Disburser** ≠ run creator ≠ approver (SoD via P02); signature verified on transmit and on ack. AC4: Ack reconciliation marks each line success/failed; failures → `disbursement_holds`. AC5: On gateway timeout the batch → `SUSPECTED_PROCESSED`; resend blocked until positive-pay confirms non-debit; resend then issues a NEW `bank_batch_ref`. AC6: Held net pay is an owned, aged backlog (FR-24/§12), cleared only via off-cycle.
- **Business Rules:** BR1: Invalid/missing/frozen accounts → `disbursement_holds`, never silently removed. BR2: A file transmitted once per `bank_batch_ref`; re-transmission requires a new batch + reason + confirmed non-debit. BR3: DSC/HSM signature = authenticity/non-repudiation; checksum = integrity only. BR4: No resend without positive-pay confirmation by a principal ≠ transmitter.
- **Data Model References:** `bank_disbursements` (`bank_batch_ref`, `dsc_signature`, `signing_cert_ref`, positive-pay fields, status incl. `SUSPECTED_PROCESSED`), `disbursement_holds`, `payslips` (net), **G13** documents (file); **X.3**/**P04**; P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/disbursements` | generate file (parks excluded → holds) |
| POST | `/api/v1/payroll/disbursements/{id}:sign` | DSC/HSM sign (Disburser) |
| POST | `/api/v1/payroll/disbursements/{id}:transmit` | send to bank over X.3 (unique batch ref, `Idempotency-Key`) |
| POST | `/api/v1/payroll/disbursements/{id}/ack` | ingest acknowledgement |
| POST | `/api/v1/payroll/disbursements/{id}:positive-pay` | confirm treasury debit / non-debit before any resend |

- **UI Behaviour:** Disbursement console: validation results, excluded accounts → suspense-hold list, disbursed/held/failed tie-out cards, DSC-sign (gated by SoD), transmit, ack reconciliation grid, SUSPECTED_PROCESSED banner with mandatory positive-pay confirmation before resend.
- **Edge Cases:** Partial bank ack; account closed/frozen (→hold); duplicate transmission attempt; gateway timeout → SUSPECTED_PROCESSED → positive-pay → confirmed non-debit → resend with new batch ref; HSM unavailable at signing.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BankFileGenerator`, `FileFormatStrategy` (single active format), `DscSigner` (HSM client), `DisbursementController`, `BankGatewayClient` (over **X.3**), `PositivePayReconciler`, `SuspenseHoldService` |
| Backend Flow | Validate run locked/reconciled → build file → exclude invalid accounts → park excluded net into `disbursement_holds` → checksum → DSC/HSM sign → transmit with unique `bank_batch_ref` via **X.3** → ingest ack → on timeout set `SUSPECTED_PROCESSED` → require positive-pay confirm → reconcile lines / route failures to holds |
| Validation | `VAL-IFSC`; tie-out (disbursed+held+failed=net); account validity; DSC signature; SoD on sign; positive-pay before resend |
| Authorization | P02: Payroll Officer generate; **Disburser** DSC-sign/transmit (≠ creator ≠ approver); Finance positive-pay (≠ transmitter) |
| State & Side Effects | DRAFT→VALIDATED→SIGNED→TRANSMITTED→(SUSPECTED_PROCESSED)→RECONCILED; failed/excluded → holds; P05 audit |
| Failure Handling | Gateway timeout → `SUSPECTED_PROCESSED`, resend blocked until positive-pay (`ERR-G10-RESEND-POSPAY`, 409); invalid accounts → `ERR-G10-BANK-INVALID` (422) (+holds); HSM down → `ERR-G10-SIGNING-DOWN` (mapped via X.3 → 412/500) |
| Dependencies | FR-04/16, FR-11, FR-15, **G13**, **X.3**, **P04**, HSM/DSC infra |
| Test Guidance | Tie-out incl. holds; SoD on DSC-sign; duplicate-payment prevention via positive-pay; SUSPECTED_PROCESSED flow; partial ack → holds; signature verify |

---

### FR-G10-15 — Payroll Register & Reconciliation (disbursed + held + failed = net)

- **Module:** G10-F15
- **Primary Role(s):** Payroll Officer, Payroll Approver (sign-off)
- **User Story:** As a Payroll Approver, I want a payroll register with control totals and variance analysis — including the disbursed/held/failed split — so I can reconcile the run before approval, with no money unaccounted.
- **Description:** Generate the register and `payroll_reconciliations` with gross/deduction/net control totals, prior-period comparison, variance %, the disbursement tie-out, and an exceptions list (joiners, leavers, large swings, negative nets, quarantined employees, held suspense, overdue remittances). Sign-off is the gate before approval (FR-16).
- **Acceptance Criteria:** AC1: Control totals = run totals = sum of payslips (three-way, incl. rounding-adjustment). AC2: Variance vs prior period with drill-down. AC3: A run cannot be approved until reconciliation SIGNED_OFF. AC4: All exceptions listed and individually explainable. AC5: The disbursement tie-out displayed and must balance before disbursement is marked complete.
- **Business Rules:** BR1: Variance beyond a configurable threshold requires explanation before sign-off. BR2: Quarantined employees (FR-04) appear as exceptions and block sign-off. BR3: Sign-off by a checker ≠ run creator (P02). BR4: Held suspense + overdue remittances surface as managed exceptions.
- **Data Model References:** `payroll_reconciliations`, `payroll_runs`, `payslips`, `disbursement_holds`, `statutory_remittances`; P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/runs/{id}/register` | register (cursor-paginated) |
| GET | `/api/v1/payroll/runs/{id}/reconciliation` | control totals, variance, disbursed/held/failed |
| POST | `/api/v1/payroll/runs/{id}/reconciliation:signoff` | sign off |

- **UI Behaviour:** Reconciliation dashboard (three-way tie-out cards, disbursed/held/failed tie-out, variance waterfall, exceptions table with explain action, sign-off button gated by exception resolution).
- **Edge Cases:** Large variance from a legitimate DA arrear; first-ever run (no prior); unresolved quarantine at sign-off; non-zero suspense at period close.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationService`, `VarianceAnalyzer`, `RegisterExporter`, `DisbursementTieoutService` |
| Backend Flow | Compute control totals → three-way tie-out → disbursed+held+failed tie-out → compare prior period → classify exceptions → require explanations → sign-off |
| Authorization | P02: Payroll Officer view; Approver sign-off (≠ creator) |
| Failure Handling | Tie-out mismatch → `ERR-G10-RECON-TIEOUT` (409); unresolved exceptions → cannot sign |
| Dependencies | FR-04, FR-14, FR-16, FR-19 |
| Test Guidance | Three-way tie-out; disbursed+held+failed; variance drill-down; sign-off SoD; quarantine & suspense blocking |

---

### FR-G10-16 — Payroll Approval, Finalisation, Locking & Reopen-Versioning

- **Module:** G10-F16
- **Primary Role(s):** Payroll Approver / Controller
- **User Story:** As a Payroll Approver, I want to approve and lock a reconciled payroll run so results become immutable, payslips can publish, and disbursement can proceed — with a controlled, justified, versioned reopen path only when essential.
- **Description:** Multi-level approval on **P01** moves a reconciled run to APPROVED then LOCKED. Locking freezes payslips/lines (`is_immutable=true`) and the cycle (LOCKED). A reopen requires Approver authority + justification, supersedes originals (REVERSED/SUPERSEDED), creates a new payslip version and successor run, persists a structured lock-to-lock diff in the **P05 `audit_log`**, and recomputes derived YTD from surviving versions. Reopen disabled once disbursement transmitted. Single-in-flight prevents a reopen successor colliding with another run.
- **Acceptance Criteria:** AC1: Approval requires SIGNED_OFF reconciliation; approver ≠ run creator (P01/P02 SoD). AC2: Locking sets child payslips immutable and the cycle LOCKED. AC3: No write to any locked payslip/line succeeds after lock. AC4: Reopen requires justification, supersedes originals, creates a new version + successor run, records a lock-to-lock diff, recomputes YTD, and is blocked post-transmission. AC5: A reopen/successor cannot start while another FINAL run is in flight (`ERR-G10-RUN-INFLIGHT`).
- **Business Rules:** BR1: Maker-checker enforced at approval (P01). BR2: Locked runs are the system of record. BR3: Post-disbursement corrections only via arrears/supplementary/off-cycle. BR4: Reopen versioning preserves the original immutable payslip.
- **Data Model References:** `payroll_runs` (`superseded_run_id`, `in_flight_lock_key`, `workflow_instance_id`), `payroll_cycles`, `payslips` (`version`, `superseded_by_payslip_id`), `payroll_reconciliations`; **P01** workflow; **P05** audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}:approve` | approve (P01 checker) |
| POST | `/api/v1/payroll/runs/{id}:lock` | finalise & lock |
| POST | `/api/v1/payroll/runs/{id}:reopen` | reopen (justified, versioned) |
| GET | `/api/v1/payroll/runs/{id}/lock-diff?vs={priorRunId}` | lock-to-lock diff |

- **UI Behaviour:** Approval screen (reconciliation summary, approve/lock gated by role + SoD), reopen dialog requiring justification and showing impending supersession, lock status badge, lock-to-lock diff viewer.
- **Edge Cases:** Lock without reconciliation; reopen after transmission; concurrent approval attempts (optimistic locking); reopen colliding with in-flight run.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ApprovalService` (P01), `LockService`, `ReopenVersioningService`, `LockDiffService`, optimistic-lock + in-flight guards |
| Backend Flow | Approve (check recon + **P01 SoD**) → lock (freeze payslips, cycle LOCKED) in a transaction → enable publish/disbursement; reopen → acquire in-flight lock → supersede originals → create new version + successor run → persist diff → recompute YTD |
| Authorization | P02: Payroll Approver only |
| State & Side Effects | run APPROVED→LOCKED; reopen→REOPENED→successor COMPUTING; payslips→SUPERSEDED + new version; **G12** pay events on lock; **X.2** notifications; **P05** audit |
| Failure Handling | Unsigned recon → `ERR-G10-RECON-UNSIGNED` (409); post-transmit reopen → `ERR-G10-REOPEN-BLOCKED` (409); in-flight collision → `ERR-G10-RUN-INFLIGHT` (409) |
| Dependencies | FR-15, FR-13, FR-14, **G12**, **P01**, **P05** |
| Test Guidance | Lock immutability; SoD; reopen versioning + diff + YTD recompute; reopen guardrails; concurrency/in-flight |

---

### FR-G10-17 — Statutory Outputs: Form-16 (Part A from MATCHED deposits), Form-24Q & Schedules

- **Module:** G10-F17
- **Primary Role(s):** Payroll Officer (generate), Payroll Approver (certify)
- **User Story:** As a Payroll Officer, I want to generate Form-16, Form-24Q, and PT/GPF/NPS remittance schedules so the organisation meets filing and remittance obligations accurately — with Form-16 Part A derived from actually-deposited-and-matched TDS.
- **Description:** Aggregate derived YTD earnings/deductions/TDS to produce Form-16 (Part A/B), Form-24Q, and remittance schedules. Form-16 Part A reconciles to `statutory_remittances` in MATCHED status, making the deadline guarantee (G2) provable. Part B reflects the full TDS pipeline (FR-07). Schedules feed FR-19. Outputs reconciled against registers and the line ledger, stored in **G13**; portal formats exchanged over **X.3** (TRACES/CRA).
- **Acceptance Criteria:** AC1: Form-16 TDS totals tie to Σ TDS `payslip_lines` for the FY (incl. arrears) and to MATCHED `statutory_remittances` for Part A. AC2: Form-24Q quarterly totals reconcile to monthly TDS in the quarter. AC3: Remittance schedules list per-scheme amounts with split and feed FR-19. AC4: Outputs certified (P01 maker-checker) before release and stored/versioned. AC5: Part A flags TDS deducted but not yet MATCHED, preventing premature certification.
- **Business Rules:** BR1: Section 89(1) relief (Form-10E, FR-07) reflected for cross-FY arrears. BR2: PAN mandatory (`VAL-PAN`); missing PAN flagged. BR3: Remittance deadlines tracked with reminders (X.2) via FR-19. BR4: Part A derives from deposited/MATCHED amounts only.
- **Data Model References:** `payslip_lines` (YTD truth), `statutory_remittances` (MATCHED), `tax_declarations` (10E), `deductions` (cache), **G13** documents; P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/statutory/form16:generate` | generate Form-16 (FY); Part A from MATCHED |
| POST | `/api/v1/payroll/statutory/form24q:generate` | quarterly TDS return |
| GET | `/api/v1/payroll/statutory/remittances?scheme=PT&period=` | remittance schedule (feeds FR-19) |

- **UI Behaviour:** Statutory output center (select FY/quarter, generate, reconcile-status indicator deducted vs deposited/MATCHED, certify & release, employee Form-16 self-service download).
- **Edge Cases:** Mid-year joiner/leaver Form-16 (incl. Form-12B); revised return after correction/reopen; missing PAN; cross-FY arrears relief; TDS deducted but deposit pending.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `Form16Generator`, `Form24QGenerator`, `RemittanceScheduler`, `MatchedDepositReconciler`, G13 document client; TRACES/CRA exchange over X.3 |
| Backend Flow | Aggregate YTD per employee/scheme from ledger → reconcile to registers and MATCHED remittances → render outputs (Part A from MATCHED) → certify (P01) → store/version in G13 |
| Authorization | P02: Payroll generate; Approver certify; Employee self-download |
| Failure Handling | Tie-out mismatch → block + reconcile report; missing PAN → exception list; undeposited TDS → Part A blocked |
| Dependencies | FR-06/07/10/19, **G13**, **X.3** |
| Test Guidance | Form-16 tie-out incl. arrears & MATCHED deposits; 24Q reconciliation; cross-FY relief; missing-PAN; undeposited-TDS block |

---

### FR-G10-18 — Parallel / What-If Run & Cost-to-Organisation Analytics

- **Module:** G10-F04 / G10-F18
- **Primary Role(s):** Payroll Approver, Department Head, Finance
- **User Story:** As a Payroll Approver, I want to run what-if/parallel scenarios and view cost-to-organisation analytics so I can model the impact of DA revisions, increments, or restructuring — with the comparison exportable to a board paper.
- **Description:** Execute PARALLEL_WHATIF runs against proposed parameters without affecting live data, producing comparison reports vs the actual run. Provide cost analytics (total payroll cost, headcount cost, component-/org-wise breakdown, period trends, employer-contribution costs). The comparison is a structured, exportable board-ready artefact (CSV/PDF). Analytics feed **G14** dashboards.
- **Acceptance Criteria:** AC1: A what-if run never writes live payslips/disbursements; results labelled scenario data. AC2: Comparison shows delta (scenario vs actual) by component/org, exportable as board paper. AC3: Cost analytics aggregate gross/deductions/net/employer cost by org/cadre/component/period. AC4: Analytics respect row-level org scope per role (P02).
- **Business Rules:** BR1: Scenario runs retained for audit and labelled. BR2: Employer contributions + gratuity accrual included in true cost-to-org. BR3: Analytics read locked runs for actuals; scenarios for projections. BR4: What-if runs do not acquire the FINAL in-flight lock and never block live runs.
- **Data Model References:** `payroll_runs` (PARALLEL_WHATIF, segregated), `payslips` (scenario), aggregates over `payslip_lines`, `gratuity_accruals`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` (run_mode=PARALLEL_WHATIF) | scenario run |
| GET | `/api/v1/payroll/runs/{id}/comparison?vs={actualRunId}` | scenario vs actual (exportable) |
| GET | `/api/v1/payroll/analytics/cost-to-org?groupBy=org_unit,component&period=` | cost analytics |

- **UI Behaviour:** Scenario builder (parameter overrides); comparison view with delta highlighting + "export board paper"; analytics dashboard with drill-down + export; scope-aware filters.
- **Edge Cases:** Scenario over a very large cohort; comparing across structure versions; analytics across cycles with arrears.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | reuse `ComputationEngine` in scenario mode, `ComparisonService`, `CostAnalyticsService`, `BoardPaperExporter` |
| Backend Flow | Run engine with override params into segregated scenario store → compute deltas vs actual → render exportable comparison → aggregate cost analytics from locked runs |
| Authorization | P02: Approver/Dept Head/Finance; org scope |
| Failure Handling | Accidental live write prevented by mode guard; large query → async export (X.1) |
| Dependencies | FR-04, FR-16, **G14** |
| Test Guidance | Scenario isolation; delta correctness; board-paper export; analytics incl. employer cost; scope filtering |

---

### FR-G10-19 — Statutory Remittance & Liability Tracking + GL Cost-Journal Posting

- **Module:** G10-F21
- **Primary Role(s):** Payroll Officer (capture challan), Payroll Approver (certify/match), Finance (confirm deposit & GL ack)
- **User Story:** As a Payroll Approver, I want every statutory deduction tracked from accrued → deposited → matched (with challan/CIN, deadline, late-interest), and the payroll cost-journal exported with a posting status, so the organisation can *prove* it remitted to the State on time and booked the cost.
- **Description:** Closes the deducted → deposited → matched loop. For each scheme/period a `statutory_remittances` row accrues the derived liability (from the line ledger), is scheduled against `statutory_due_date`, captures actual `challan_no`/`cin`/`deposit_date`/`deposited_amount`, computes late-deposit interest u/s 201(1A)/234E when late, and reaches MATCHED when the deposit ties (within tolerance). Separately, a `gl_journals` cost-journal export object is produced per run, exported to Finance ERP over **X.3**, and tracked through `POSTED`/`ACKNOWLEDGED` (G10 does not own the GL). Deadline reminders via **X.1 `JOB-G10-REMIT-DEADLINE`** + **X.2**. Satisfies G2 and underpins Form-16 Part A (FR-17).
- **Acceptance Criteria:** AC1: A remittance row per scheme/period with `deducted_total = Σ payslip_lines` (rule #14). AC2: Capturing challan/CIN/deposit → DEPOSITED; matching within tolerance → MATCHED. AC3: Past due without deposit → OVERDUE; late interest computed automatically. AC4: Form-16 Part A (FR-17) derives only from MATCHED. AC5: A `gl_journals` row balances (`total_debit = total_credit`) and tracks `POSTED`/`ACKNOWLEDGED`; net-pay clearing line = `Σ disbursed + Σ held` (rule #15). AC6: Overdue/short-payments surface in §12 backlog reporting.
- **Business Rules:** BR1: Remittance amounts derive from the immutable ledger. BR2: Documented CRA/GPF rounding tolerance (Appendix 16.2). BR3: Late-interest formula configurable per scheme/section. BR4: G10 tracks GL posting status only; Finance ERP is the book of record.
- **Data Model References:** `statutory_remittances`, `gl_journals`, `payslip_lines` (derivation), **G13** documents (challan scans), **X.2** notifications; **X.3** ERP/portal; P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/remittances:accrue` | accrue per scheme/period from ledger |
| POST | `/api/v1/payroll/remittances/{id}/challan` | capture challan/CIN/deposit |
| POST | `/api/v1/payroll/remittances/{id}:match` | match & certify (Approver) |
| GET | `/api/v1/payroll/remittances?status=OVERDUE` | overdue/short-paid backlog |
| POST | `/api/v1/payroll/runs/{id}/gl-journal:export` | export cost journal (X.3 to ERP) |
| POST | `/api/v1/payroll/gl-journals/{id}:acknowledge` | Finance posting acknowledgement |

- **UI Behaviour:** Remittance ledger (per-scheme/period cards accrued→scheduled→deposited→matched, deadline countdown, late-interest indicator, challan capture with G13 upload); GL journal viewer (balanced debit/credit, posting-status badge).
- **Edge Cases:** Partial deposit (SHORT_PAID); deposit after deadline (late interest); challan correction; reopen changing derived liability after deposit; GL rejected by ERP.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RemittanceLedgerService`, `LateInterestCalculator`, `ChallanMatcher`, `GlJournalBuilder`, `ErpExportClient` (over **X.3**), G13 document client |
| Backend Flow | Accrue from ledger → schedule vs due date → capture challan/CIN → compute late interest if late → match within tolerance → MATCHED; build balanced GL journal → export (X.3) → track POSTED/ACKNOWLEDGED |
| Authorization | P02: Payroll capture; Approver match/certify; Finance acknowledge |
| State & Side Effects | remittance ACCRUED→…→MATCHED/OVERDUE; gl_journal EXPORTED→POSTED→ACKNOWLEDGED; X.2 deadline notifications; P05 audit |
| Failure Handling | Short deposit → SHORT_PAID; late → OVERDUE + interest; GL imbalance → block; ERP reject → REJECTED + retry (X.3 circuit-broken) |
| Dependencies | FR-06, FR-14, FR-17, **G13**, **X.3** (Finance ERP, TRACES/CRA), **X.1**, **X.2** |
| Test Guidance | Ledger-derived accrual; challan match & tolerance; late-interest u/s 201/234E; MATCHED→Form-16 Part A; balanced GL; posting-status lifecycle |

---

### FR-G10-20 — Full-and-Final Settlement (FnF)

- **Module:** G10-F22
- **Primary Role(s):** HR Admin (initiate), Payroll Officer (compute), DDO (sanction), Payroll Approver (approve), Finance (pay)
- **User Story:** As HR/Payroll, I want a single consolidated full-and-final settlement for every separating employee so final-month pay, leave encashment, gratuity, notice-pay recovery, unrecovered loans, carryforwards, and a final TDS true-up net into one last payment (or recovery).
- **Description:** On separation, an FnF run (`payroll_cycles.run_type=FNF`) computes a `fnf_settlements` record netting final-month pay (prorated to LWD), leave encashment (FR-12, retirement exemption), gratuity (settled/handed off to **G11**), notice-pay recovery, unrecovered loan principal+interest (FR-08), open `deduction_carryforwards`, and a final-year TDS true-up (FR-07) into `net_settlement` (may be negative → recovery). Its own reconciliation and SoD (P01/P02); hands off pension/terminal-benefit data to **G11**; emits the separation pay event to **G12**.
- **Acceptance Criteria:** AC1: A single `fnf_settlements` record consolidating all dues/recoveries. AC2: `net_settlement = final_month_pay + leave_encashment + gratuity − notice_pay_recovery − loan_settlement − other_recoveries − final_tds` and ties to its own reconciliation. AC3: FnF requires DDO sanction + Approver approval (P01; approver ≠ creator). AC4: Open carryforwards and unrecovered loans pulled in; negative net → RECOVERY_PENDING, not a silent write-off. AC5: Gratuity settled or handed off to G11 with a reference; last-pay-drawn + contribution history supplied to G11. AC6: Final TDS true-up reflects full-year income incl. perquisites and 89(1) relief.
- **Business Rules:** BR1: Same immutability/locking/SoD as a regular run. BR2: Death cases route gratuity/dues per nominee rules (G11). BR3: Leave-encashment retirement exemption (s.10(10AA)). BR4: No employee record fully closed with an open FnF in RECOVERY_PENDING.
- **Data Model References:** `fnf_settlements`, `payroll_cycles` (FNF), `payslips`/`payslip_lines`, `loans_advances`, `deduction_carryforwards`, `benefit_claims` (encashment), `gratuity_accruals`, `payroll_reconciliations`, `service_register_events` (**G12**); **P01** workflow; P05 audit. `VAL-FNF`/`VAL-SEP` apply.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/fnf` | initiate FnF for an employee |
| POST | `/api/v1/payroll/fnf/{id}:compute` | compute consolidated settlement |
| POST | `/api/v1/payroll/fnf/{id}:sanction` | DDO sanction (P01) |
| POST | `/api/v1/payroll/fnf/{id}:approve` | Approver approve (≠ creator, P01) |
| GET | `/api/v1/payroll/fnf/{id}` | settlement breakdown |

- **UI Behaviour:** FnF workbench (single screen netting all components to one figure; sanction/approve P01 workflow; G11 handoff panel; positive-payable vs recovery-pending state).
- **Edge Cases:** Death-in-service (nominee, gratuity exemption); negative net (recovery from terminal benefits via G11); separation mid-arrear-window; outstanding court attachment at exit; dismissal forfeiting benefits.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FnFController`, `FnFConsolidationService`, reuse `ComputationEngine`/`ReconciliationService`, `G11HandoffClient`, `LeaveEncashmentCalculator`, `LoanSettlementService` |
| Backend Flow | Initiate → gather final pay + encashment + gratuity + recoveries + carryforwards + loan settlement → compute final TDS true-up → net → reconcile → **P01 sanction → approve** → pay/recover → G11 handoff → **G12** event |
| Authorization | P02: HR initiate; Payroll compute; DDO sanction; Approver approve; Finance pay |
| State & Side Effects | fnf INITIATED→…→PAID/RECOVERY_PENDING→CLOSED; G11 handoff; **G12** separation pay event; X.2 notifications; P05 audit |
| Failure Handling | Negative net → RECOVERY_PENDING (not write-off); missing gratuity confirm → block close |
| Dependencies | FR-04/07/08/09/12, **G11**, **G12**, **P01** |
| Test Guidance | Consolidation correctness; net equation; encashment exemption; negative-net recovery; gratuity handoff; SoD; death case |

---

### FR-G10-21 — Taxable Perquisite Valuation (Rule 3)

- **Module:** G10-F20
- **Primary Role(s):** Payroll Officer (value), Payroll Approver (approve), Employee (view)
- **User Story:** As a Payroll Officer, I want taxable perquisites valued per Rule 3 — especially the concessional/interest-free loan perquisite the system creates via FR-08, and employer-provided accommodation — so TDS is not systematically under-deducted.
- **Description:** Compute and maintain `perquisites` per employee per FY for concessional/interest-free loans (reducing-balance × (reference rate − charged rate)), rent-free/concessional accommodation (license-fee method), motor car, and others. Each perquisite's `taxable_value` (+ `monthly_value`) is wired into FR-07 taxable income via a `PERQUISITE` category component.
- **Acceptance Criteria:** AC1: A concessional/interest-free loan (FR-08 `is_concessional=true`) auto-produces an ACTIVE `perquisites` row valued per Rule 3. AC2: Employer accommodation valued by license-fee method. AC3: Each `taxable_value` flows into `tax_declarations.perquisite_total` (rule #17). AC4: A change in loan balance/rate or accommodation status revises the perquisite (REVISED) and re-projects TDS. AC5: Perquisite appears on payslip/tax summary as a non-cash taxable item.
- **Business Rules:** BR1: Reference rate configurable, effective-dated. BR2: Perquisite is taxable income, not a cash earning — increases TDS, not net pay. BR3: Every `is_concessional` loan must have a linked perquisite (enforced).
- **Data Model References:** `perquisites`, `loans_advances` (`is_concessional`, `perquisite_id`), `tax_declarations` (`perquisite_total`), `pay_components` (PERQUISITE), `payslip_lines`, `rate_tables` (reference rate).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/perquisites` | create/value a perquisite |
| GET | `/api/v1/payroll/employees/{id}/perquisites?fy=` | list per FY |
| POST | `/api/v1/payroll/perquisites/{id}:revise` | revise on basis change |

- **UI Behaviour:** Perquisite panel (type, valuation method, computed basis, taxable value, monthly spread, link to source loan/accommodation, "non-cash taxable" badge).
- **Edge Cases:** Mid-year loan foreclosure (perquisite stops); reference-rate revision; accommodation surrendered mid-year; multiple concurrent perquisites.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PerquisiteController`, `Rule3LoanValuer`, `AccommodationValuer`, `TaxIntegrationService` |
| Backend Flow | Detect trigger (concessional loan/accommodation) → value per Rule 3 → persist perquisite → spread monthly → feed FR-07 taxable income → revise on basis change |
| Authorization | P02: Payroll Officer value; Approver approve; Employee read |
| Failure Handling | Missing reference rate → `ERR-G10-PERQ-REFRATE` (422); concessional loan w/o perquisite → block |
| Dependencies | FR-07, FR-08, FR-02 |
| Test Guidance | Concessional-loan Rule-3 valuation; accommodation license-fee; tax inclusion; foreclosure/rate-change revision; mandatory-link enforcement |

---

### FR-G10-22 — Cross-Module Point-in-Time Snapshot Contract

- **Module:** G10-F19
- **Primary Role(s):** Payroll Officer (run), Payroll Approver (oversee), System (X.1 automated)
- **User Story:** As a Payroll Approver, I want every run to compute against a frozen, as-of snapshot of upstream facts (G01 employee/bank/PAN/scheme, G03 attendance, G06 fixation, G09 recovery, org unit) so determinism extends upstream and there is no ambiguity about *who* gets paid *how much* into *which account*.
- **Description:** Defines the snapshot-as-of contract. At cutoff, an **X.1 job (`JOB-G10-SNAPSHOT-FREEZE`)** captures an immutable `run_input_snapshots` row with as-of values of all upstream facts (consumed **by reference** from G01/G03/G06/G09/org) and a `checksum`; the run computes only from the snapshot. Orders arriving after cutoff but before lock are deferred (recorded in `post_cutoff_deferrals`) to the next cycle/arrears. The snapshot also resolves the bank account paid (snapshotted account even if G01 changes before disbursement) and the DDO-of-record for mid-month inter-DDO transfers (Appendix 16.8).
- **Acceptance Criteria:** AC1: Starting a FINAL run freezes a `run_input_snapshots` row (`is_frozen=true`) with a checksum; the run binds to it. AC2: Re-running against the same frozen snapshot reproduces identical payslips (rule #16). AC3: Bank account, PAN, scheme, org unit used are the snapshotted values; a later G01 change does not alter the locked run or its disbursement account. AC4: A G06 fixation or G09 recovery order effective ≤ cutoff is included; one after cutoff is recorded in `post_cutoff_deferrals` and applied to the next cycle/arrears. AC5: For a mid-month inter-DDO transfer, the DDO-of-record rule determines payer + control-account attribution.
- **Business Rules:** BR1: Snapshot is append-only and immutable once frozen. BR2: What-if runs may take a non-frozen snapshot copy. BR3: Determinism = pure function of (structure version, effective rates, G10 inputs, prior ledger, frozen snapshot). BR4: Post-cutoff orders never silently dropped or applied.
- **Data Model References:** `run_input_snapshots`, `payroll_runs` (`snapshot_id`), `payslips` (`snapshot_id`), G01/G03/G06/G09/org (read by reference); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/snapshot:freeze` | capture & freeze the as-of snapshot |
| GET | `/api/v1/payroll/snapshots/{id}` | snapshot facts & checksum |
| GET | `/api/v1/payroll/snapshots/{id}/deferrals` | post-cutoff deferred orders |

- **UI Behaviour:** Snapshot panel on the run console (as-of timestamp, checksum, per-source counts, post-cutoff deferral list with "carry to next cycle" confirmation).
- **Edge Cases:** Bank account changed in G01 after cutoff (snapshot account paid); fixation order arriving post-cutoff; inter-DDO transfer on cutoff day; G03 regularisation after snapshot.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SnapshotService`, `UpstreamFactCollector` (G01/G03/G06/G09/org clients), `SnapshotChecksum`, `DdoOfRecordResolver`; runs as **X.1** job |
| Backend Flow | At cutoff, collect as-of facts → persist immutable snapshot → checksum → freeze → bind to run; record post-cutoff arrivals as deferrals |
| Authorization | P02: Payroll Officer freeze; Approver oversee; system automated |
| Failure Handling | Upstream unavailable at freeze → service-contract error mapping → `PRECONDITION_FAILED` (412)/`INTERNAL` (500) + retry (X.1 backoff); mutation after freeze → `ERR-G10-SNAPSHOT-FROZEN` (409) |
| Dependencies | **G01**, **G03**, **G06**, **G09**, org; FR-04; **X.1**, **P05** |
| Test Guidance | As-of correctness per source; determinism vs frozen snapshot; bank-account-changed case; post-cutoff deferral; inter-DDO DDO-of-record |

---

### FR-G10-23 — Service Register (SR) Event Posting Contract *(deferred build / Phase-2)*

- **Module:** G10 cross-cutting SR write-port (consumed by FR-G10-03/10/16/20). **Build status: DEFERRED — Phase-2.** The *contract* is authored now (per `MODULE_RECONCILIATION.md` §D1/§D2; R1 findings F-02/F-09/F-14) so the G10→G12 interface is fully specified — not "effectively unspecified" — even though G10 builds after the (frozen) G12 SR ingestion contract and the Phase-2 payroll substrate (M06/M07) are live.
- **Primary Role(s):** System (G10 run/lock pipeline, automated); Payroll Approver (the run lock / arrear approval is the posting trigger). No interactive UI actor — posting is a side-effect of finalisation, never hand-keyed.
- **User Story:** As the government, I want every pay-establishment event G10 finalises (pay fixation, annual increment, increment withholding, pay protection) posted exactly once to the canonical G12 Service Register through its single write-port, with a semantic `fact_key` that prevents the same real-world fact being double-counted for qualifying service, so each employee's service record is complete, non-duplicated, and reversible.
- **Description:** On finalisation/lock of the relevant run (FR-G10-16) or arrear approval (FR-G10-10), G10 posts each qualifying pay event to the **canonical G12 write-port `POST /api/v1/sr/ingest`** — the **only** ledger write path (`MODULE_RECONCILIATION.md` §D1). G10 **never** writes `service_register_events` directly and **never** uses `/api/v1/sr/events`. A module-local façade (`POST /api/v1/payroll/sr:post`) is permitted only as an internal relay that **forwards to `POST /api/v1/sr/ingest`**. Reversals/corrections (a reopened or superseded run, FR-G10-16) post through `POST /api/v1/sr/ingest/reversal` using G12's `is_reversal=true` + `reverses_source_reference_id` envelope and the published `*_REVERSAL` partner type; G12 auto-spawns the corrigendum (supersede-only — never delete/edit). **The pay-fixation SR event is G10's, not G06's** — G06 posts the *establishment* event, G10 posts the *pay* event; no double-claim (`MODULE_RECONCILIATION.md` §D2). The ledger is a **net-new G12 gov ledger on the P05 substrate, not a platform primitive.**
- **Event types (cite G12's published `event_type_code` verbatim; `source_module="G10"`):**

| `event_type_code` | Emitted when | Qualifying-service-bearing → `fact_key` required |
|---|---|---|
| `PAY_FIXATION` | pay fixed/re-fixed on a G06 order (FR-G10-03/10) | yes |
| `ANNUAL_INCREMENT` | annual increment granted (FR-G10-03/16) | yes |
| `INCREMENT_WITHHELD` | increment withheld (penalty / efficiency-bar; G09-linked) | yes |
| `PAY_PROTECTION` | pay protected on transfer / re-appointment | yes |

- **Ingest payload contract (per G12 FR-01):**
  - **Dedup tuple (mandatory on every ingest call):** `(source_module, source_reference_id, source_event_version)` with explicit **`source_module="G10"`** (not inferred). `source_reference_id` is the G10 originating-record key (`payslip_id` / `arrear_id` / `run_id`); `source_event_version` increments on supersession. No legacy `source_event_id`.
  - **`fact_key` (mandatory):** every event type above is qualifying-service-bearing, so G10 **derives and sends `fact_key`** per the type's `fact_correlation_rule` (G12 FR-01). Missing → G12 rejects with `SR_FACT_KEY_REQUIRED`.
  - **Scoping:** explicit required **`tenant_id`** and **`entity_id`** on the payload (G12 hashes `tenant_id`+`employee_id` into `entry_hash`).
  - **Provenance/validation:** `source_module="G10"` is validated against the type's `allowed_source_modules`; the HTTP `Idempotency-Key` header may be a writer-local hash, but the persisted dedup tuple is the contract.
  - **Reversal:** `is_reversal=true` + `reverses_source_reference_id` + published `*_REVERSAL` partner type via `POST /api/v1/sr/ingest/reversal`.
- **Acceptance Criteria:** AC1: Locking a run that fixes/changes pay posts one of `PAY_FIXATION`/`ANNUAL_INCREMENT`/`INCREMENT_WITHHELD`/`PAY_PROTECTION` per affected employee to `POST /api/v1/sr/ingest` — never to `/api/v1/sr/events`, never a direct table INSERT. AC2: Every posted event carries the full dedup tuple with `source_module="G10"` and a derived `fact_key`; a payload missing `fact_key` is rejected `SR_FACT_KEY_REQUIRED` and surfaces as a run-post failure (not silently dropped). AC3: Re-posting the same `(source_module, source_reference_id, source_event_version)` is idempotent (G12 dedup) — no duplicate ledger row, no double-counted qualifying service. AC4: Reopening/superseding a run posts a reversal via `/sr/ingest/reversal` with `is_reversal=true` + `reverses_source_reference_id`; the original is superseded, never edited/deleted. AC5: `tenant_id` and `entity_id` are present and validated; an unscoped post is rejected. AC6 (deferred-build gate): until G10 is built, the G10→SR edge is "contracted, not-yet-implemented" and G12 lists `G10` in `allowed_source_modules` for all four codes.
- **Business Rules:** BR1: `POST /api/v1/sr/ingest` (+ `/reversal`) is the sole write path; any module-local endpoint is a relay only. BR2: One SR post per real-world pay fact, de-duplicated by tuple + `fact_key`. BR3: Supersede-only — corrections are reversal+repost, never in-place edit. BR4: Posting is a side-effect of finalisation/lock (FR-G10-16) or arrear approval (FR-G10-10); a failed post blocks the run's "SR-posted" completion and retries on X.3 backoff (no direct-write fallback). BR5: Pay-fixation event ownership is G10's; the establishment event is G06's — no double-claim.
- **Data Model References:** `service_register_events` (**G12-owned — net-new G12 gov ledger on the P05 substrate, not a platform primitive**; referenced, never written directly); G10 source records `payslips`/`arrears`/`payroll_runs` (supply `source_reference_id`/`source_event_version`); `run_input_snapshots` (supplies the as-of facts behind `fact_key`); P05 audit.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/sr/ingest` | **canonical G12 write-port** — post a pay event (dedup tuple + `fact_key` + `tenant_id`/`entity_id` + `source_module="G10"`) |
| POST | `/api/v1/sr/ingest/reversal` | post a reversal (`is_reversal=true` + `reverses_source_reference_id` + `*_REVERSAL` type) |
| POST | `/api/v1/payroll/sr:post` | *(optional internal façade)* relays to `POST /api/v1/sr/ingest`; no direct ledger write |

- **UI Behaviour:** None (system side-effect). The run console surfaces SR-post status (POSTED / FAILED-RETRYING / REJECTED `SR_FACT_KEY_REQUIRED`) per the canonical UI-state standard; no operator hand-keys SR rows.
- **Edge Cases:** missing `fact_key` → `SR_FACT_KEY_REQUIRED` (block, surface, retry after derivation); duplicate-tuple replay → idempotent no-op; reopened run → reversal + repost at new `source_event_version`; G12 unavailable at lock → X.3 mapping → `INTERNAL` (500)/`PRECONDITION_FAILED` (412) + backoff retry (never a direct-INSERT fallback); a pay-fixation that is also a G06 establishment event → G10 posts only the pay event.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SrEventPoster` (G12 `/sr/ingest` client over X.3), `FactKeyDeriver` (applies the type's `fact_correlation_rule`), `DedupTupleBuilder` (`source_module="G10"`, `source_reference_id`, `source_event_version`), `SrReversalPoster` |
| Backend Flow | run lock / arrear approval → build event(s) → derive `fact_key` → assemble dedup tuple + `tenant_id`/`entity_id` → `POST /api/v1/sr/ingest` (with `Idempotency-Key`) → on supersession `POST /api/v1/sr/ingest/reversal` |
| Authorization | P02: only the G10 system identity posts; no interactive grant; SoD unaffected (posting follows an already-SoD-gated lock) |
| Failure Handling | missing `fact_key` → `SR_FACT_KEY_REQUIRED`; G12 down → X.3 circuit-break + backoff, no direct write; never `/api/v1/sr/events` |
| Dependencies | **G12** (write-port, event catalog, `fact_correlation_rule`, `allowed_source_modules`), FR-G10-16, FR-G10-10, FR-G10-03, **X.3**, **P05**. **Build: DEFERRED / Phase-2.** |
| Test Guidance | write-port-only (assert no `/sr/events`, no direct INSERT); dedup tuple + `source_module="G10"` present; `fact_key` present for all four codes (allowlist test — R1 F-02); idempotent replay; reversal envelope; tenant/entity required |

---

## 7. UI Requirements

Screens consume the platform **canonical UI-state standard** (empty / loading / error / no-permission / partial-data; masked fields per RBAC; `E·AR` request-change pattern — Foundation §3). Data-collection screens are **W.2 forms** binding `VAL-*` ids; approval screens surface **P01** task state.

| Screen | Primary role | Key elements | States covered |
|---|---|---|---|
| Payroll Run Console | Payroll Officer/Approver | progress, live totals, exceptions, trace viewer, snapshot ref+checksum, in-flight lock, run/cancel | empty, computing, completed, failed, quarantine, locked-conflict |
| Reconciliation Dashboard | Payroll Approver | three-way tie-out, disbursed/held/failed tie-out, variance waterfall, exceptions, sign-off | pending, signed-off, mismatch |
| Approval & Lock | Payroll Approver | recon summary, approve/lock (P01), reopen-with-versioning + lock-to-lock diff | reconciled, approved, locked, reopen-blocked |
| Salary Structure Builder | Payroll Officer | components vs overrides, effective timeline, version diff | draft, pending, active, superseded |
| Rule/Component Config | Org/SysAdmin | rule editor w/ live validation, test panel, version timeline, DSL-grammar badge | draft, active, retired, invalid |
| Rate Tables | Org/SysAdmin | effective-dated grid, as-of + state selector, retrospective warning | current, future, retrospective |
| Tax Declaration (self) | Employee | regime wizard, declaration form, Form-12B, step-by-step tax breakdown, proof upload | draft, submitted, verified, rejected, locked |
| Perquisite Panel | Payroll/Employee | type, valuation basis, taxable value, monthly spread, source link | draft, active, revised, closed |
| Loans & Advances | Employee/DDO | application wizard, amortization, statement, foreclosure, concessional-perquisite preview | requested, sanctioned, recovering, closed |
| Benefits & Claims | Employee/Mgr | entitlements, claim form, proof upload, gratuity accrual, leave-encashment calculator | eligible, submitted, approved, paid, rejected |
| Payslip Viewer (self) | Employee | earnings/deductions break-up, YTD, download, version selector + diff | provisional, published, superseded, none |
| Bank Disbursement Console | Payroll Disburser/Finance | validation, suspense-hold list, disbursed/held/failed cards, DSC-sign, SUSPECTED_PROCESSED + positive-pay confirm, ack grid | draft, signed, transmitted, suspected-processed, partial-ack, failed |
| Statutory Output Center | Payroll Officer/Approver | Form-16/24Q/remittance, deducted-vs-MATCHED indicator, certify | pending, generated, certified, mismatch |
| Remittance Ledger | Payroll/Finance | per-scheme accrued→deposited→matched, deadline countdown, late-interest, challan capture | accrued, scheduled, deposited, matched, overdue, short-paid |
| GL Journal Viewer | Payroll/Finance | balanced debit/credit per gl_code, posting status | draft, exported, posted, acknowledged, rejected |
| FnF Workbench | HR/Payroll/DDO/Approver | consolidated settlement netting, G11 handoff, sanction/approve | initiated, computed, reconciled, approved, paid, recovery-pending |
| Carryforward / Backlog Register | Payroll/Finance | un-recovered deductions, suspense holds, overdue remittances with ageing & owner | empty, open, ageing, cleared |
| Cost-to-Org Analytics | Approver/Finance | charts by org/cadre/component, scenario comparison, board-paper export | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; keyboard navigation & visible focus; dark mode; responsive at **375 / 768 / 1280 px** with touch targets ≥ 44×44 px (Vision §2.9) for self-service; money masked by default with reveal+audit (P02 ceiling); locale-formatted amounts; every screen covers empty/loading/error/no-permission/partial-data; no skeleton placeholders in production — real fields, data, API calls, and states.

---

## 8. API & Integration

### 8.1 Conventions (platform — Foundation §1; Recon §C)

REST under **`/api/v1`**; JSON; JWT bearer carrying resolved roles + tenant/entity scope; **P02 `Authorization.check`** for every endpoint (no re-implemented permission logic); **cursor pagination only** (`?limit=` default 25 / max 100 + `cursor=`; response carries `next_cursor`); **`Idempotency-Key`** on all transaction-creating POSTs (24h replay returns the original result) — **mandatory for run start, disbursement transmit, off-cycle create, remittance, and FnF**; **`X-Correlation-Id`** carried/assigned on every request, echoed in the response header and written to every P05 audit and log line; effective-dated mutations accept `effective_from` (staged, not live); all timestamps UTC ISO-8601.

### 8.2 Canonical Error Envelope (platform)

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "state is required for PT_SLAB", "field": "state", "details": { } } }
```

2xx returns the resource payload; 4xx/5xx return the envelope above. The correlation id is the **`X-Correlation-Id` response header**, not a body `requestId`.

### 8.3 Error Codes

**Platform standard table (Foundation §1 — adopted verbatim):**

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | 422 | input failed a VAL-* / VAL-G10-* rule |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks out-of-scope existence) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state conflict |
| `PRECONDITION_FAILED` | 412 | a required precondition not met (incl. upstream/integration unavailable, mapped via X.3) |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error |

**G10 module business codes (`ERR-G10-*`, registered in Foundation §5; each maps to a standard HTTP above):**

| Code | HTTP | Meaning |
|---|---|---|
| `ERR-G10-RULE-EXPR` | 422 | Bad formula expression |
| `ERR-G10-DSL-PROPTEST` | 422 | FORMULA rule failed property tests |
| `ERR-G10-RULE-OVERLAP` | 409 | Overlapping rule versions |
| `ERR-G10-RATE-OVERLAP` | 409 | Overlapping rate rows |
| `ERR-G10-RATE-LOCKED` | 409 | Edit of locked-referenced rate |
| `ERR-G10-RATE-NOTFOUND` | 422 | No effective rate for period |
| `ERR-G10-PT-STATE` | 422 | No PT slab for employee's state of posting |
| `ERR-G10-STRUCT-OVERLAP` | 409 | Overlapping structure versions |
| `ERR-G10-STRUCT-LOCKED` | 409 | Structure change in locked period |
| `ERR-G10-TAXSLAB-NOTFOUND` | 422 | No tax slab for FY/regime |
| `ERR-G10-PERQ-REFRATE` | 422 | No effective perquisite reference rate |
| `ERR-G10-RECOVERY-NET` | 409 | Net too low for recovery (→carryforward) |
| `ERR-G10-RECOVERY-BARRED` | 409 | Overpayment recovery barred pending authority adjudication |
| `ERR-G10-OFFCYCLE-DUP` | 409 | Duplicate off-cycle payment |
| `ERR-G10-RUN-INFLIGHT` | 409 | Another FINAL run in flight for the cycle |
| `ERR-G10-SNAPSHOT-FROZEN` | 409 | Mutation attempted after snapshot freeze |
| `ERR-G10-RECON-TIEOUT` | 409 | Control totals do not tie out (incl. disbursed+held+failed) |
| `ERR-G10-RECON-UNSIGNED` | 409 | Approval before reconciliation sign-off |
| `ERR-G10-RUN-NOTLOCKED` | 409 | Publish/disburse before lock |
| `ERR-G10-REOPEN-BLOCKED` | 409 | Reopen after transmission |
| `ERR-G10-BANK-INVALID` | 422 | Invalid/missing payee accounts (parked to holds) |
| `ERR-G10-SIGNING-DOWN` | 412 | HSM/DSC signing service unavailable (X.3-mapped) |
| `ERR-G10-RESEND-POSPAY` | 409 | Resend blocked until positive-pay non-debit confirmation |
| `ERR-G10-RUN-IMMUTABLE` | 409 | Write to locked run/payslip |

> The v2 `VALIDATION_ERROR (400)`, `AUTH_REQUIRED (401)`, `INTERNAL_ERROR (500)`, and `UPSTREAM_UNAVAILABLE (503)` are **retired** (Recon §C): use `VALIDATION_FAILED (422)`, `UNAUTHENTICATED`, `INTERNAL`, and — for upstream/integration failures — `PRECONDITION_FAILED (412)`/`INTERNAL (500)` via the **X.3** per-integration error mapping (`ERR-LOADFAIL` to the user). No 503 in the standard table.

### 8.4 JSON Examples

**Start a payroll run (acquires in-flight lock; binds snapshot)**

```http
POST /api/v1/payroll/cycles/{cycleId}/runs
Idempotency-Key: 0b4e-...
X-Correlation-Id: corr-7f31-...
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

**Validation error (platform envelope)**

```json
{ "error": { "code": "ERR-G10-BANK-INVALID", "message": "3 payees have invalid accounts; net parked to suspense holds",
  "field": "payees", "details": { "count": 3 } } }
```
(`X-Correlation-Id: corr-2a91-...` returned as a response header.)

### 8.5 Integration Points (all external calls via X.3; creds via P04)

| System | Direction | Purpose | Runs on |
|---|---|---|---|
| G01 Employee (PrimeSoft M01) | in (snapshotted) | employee master, bank account, PAN, scheme | internal ref |
| G03 Attendance/Leave (PrimeSoft M04/M05) | in (snapshotted) | paid/LWP days | internal ref |
| G06 Promotion/Pay-fixation | in | fixation orders → structure & arrears (post-cutoff → deferral) | internal ref |
| G09 Disciplinary | in | recovery orders (post-cutoff → deferral) | internal ref |
| G11 Pension | out | last-pay-drawn, contribution history, gratuity accrual, FnF handoff | internal ref |
| G12 Service Register | out | pay events (`PAY_FIXATION`/`ANNUAL_INCREMENT`/`INCREMENT_WITHHELD`/`PAY_PROTECTION`) + separation event via **`POST /api/v1/sr/ingest`** (FR-G10-23; dedup tuple + `fact_key`; net-new G12 gov ledger on P05 substrate — not a platform primitive) | internal ref (G12) |
| G13 Documents (PrimeSoft M11) | in/out | store payslips/Form-16/bank files/challan scans | internal ref |
| G14 Dashboards (PrimeSoft M16) | out | payroll cost & KPIs, backlog/exception metrics | internal ref |
| Bank/Treasury gateway | out/in | DSC-signed disbursement file + ack + positive-pay/treasury-debit reconciliation | **X.3** + P04 |
| Tax portal (TRACES) / NPS-CRA | out/in | Form-24Q/Form-16 formats; challan/CIN deposit confirmation | **X.3** + P04 |
| Finance ERP (GL) | out/in | cost-journal export + posting acknowledgement | **X.3** + P04 |
| HSM / DSC service | in | cryptographic signing of bank files (keys never in DB) | **P04** creds + HSM |

---

## 9. Non-Functional Requirements (platform baseline — Vision §2.9; BRD §7; Recon §C)

| Category | Requirement |
|---|---|
| Performance (interactive) | Standard API **p95 < 500ms @ 300 concurrent**; read-heavy reports p95 < 300ms cached / < 1000ms uncached; writes p95 < 1500ms; payslip view < 1s |
| Performance (batch) | Compute 50,000 employees within 30 min; bank file generation + DSC signing < 5 min; snapshot freeze < 3 min (X.1 jobs) |
| Determinism | Identical inputs + identical frozen snapshot → identical outputs; reproducible runs |
| Availability | **99.5%/month** (≤ 3.6 h downtime); batch windows off-peak; maintenance window Sun 01:00–04:00 IST |
| Scalability | Architecture supports up to 100 tenants without re-engineering; horizontal scaling of compute workers; partition by org unit/cohort |
| Integrity | ACID per run; three-way tie-out; disbursed+held+failed=net; net≥0; immutable locked runs; derived YTD ledger; no hard delete (soft delete only) |
| Security | OIDC/Google SSO + MFA (high-privilege payroll roles); JWT + RBAC v1.7 + P02 row-level scope; SoD; AES-256-GCM PII at rest; per-tenant KMS envelope encryption; **HSM-held DSC keys (never in DB)**; masked display with audited reveal; VAPT zero Critical/High at go-live |
| Privacy | DPDPA 2023; PII minimisation; statutory retention floors (never below); right-to-access via self-service; consent via `consent_records` |
| Auditability | **P05 dual-log, DB-trigger, 100% mutation capture, zero gaps, immutable, ≥7-yr**; calc_trace retained; lock-to-lock diffs; snapshot checksums; tamper-evidence tracks OPEN-PLAT-03 |
| Recoverability | **RPO < 1h, RTO < 4h**; run staging allows safe restart; DR replica in a second Indian region |
| Accessibility | WCAG 2.1 AA — all web screens |
| Observability | Per-run metrics; exception dashboards; disbursement ack + positive-pay monitoring; remittance-deadline & suspense-hold ageing alerts; X.1 job run audit; SLA-breach alerting (P01 escalation → X.2) |
| Compliance | Statutory deadline tracking proven to actual deposit (challan/CIN MATCHED) for TDS/PT/GPF/NPS; late-interest computation |

---

## 10. Workflow & State Diagrams (State Tables)

State machines run on **P01** where approval is involved; G10 owns the domain state, P01 owns the approval-instance lifecycle and in-flight version pinning.

### 10.1 Payroll Cycle / Run

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | freeze inputs + snapshot (X.1) | INPUT_LOCKED | after cutoff; snapshot frozen |
| INPUT_LOCKED | start FINAL run | COMPUTING | Payroll Officer; no in-flight run |
| COMPUTING | compute success | COMPUTED | totals tie (incl. rounding) |
| COMPUTING | engine fault | OPEN (run FAILED) | no commit; lock released |
| COMPUTED | reconcile sign-off | RECONCILED | recon SIGNED_OFF; disbursed+held+failed=net |
| RECONCILED | approve (P01) | APPROVED | checker ≠ creator |
| APPROVED | lock | LOCKED | payslips frozen |
| LOCKED | publish & disburse (X.3) | DISBURSED | bank ack success / positive-pay confirmed |
| DISBURSED | remit & post | CLOSED | remittances MATCHED; GL ACKNOWLEDGED |
| LOCKED | reopen (justified, versioned, P01) | REOPENED | pre-transmission only; no in-flight run |
| REOPENED | re-run (successor) | COMPUTING | Approver authority; originals SUPERSEDED |

### 10.2 Loan

| Current | Event | Next |
|---|---|---|
| REQUESTED | sanction (P01) | SANCTIONED |
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
| SUBMITTED | recommend (P01) | RECOMMENDED |
| RECOMMENDED | approve (P01) | APPROVED |
| RECOMMENDED/SUBMITTED | reject | REJECTED |
| APPROVED | pay | PAID |

### 10.4 Bank Disbursement

| Current | Event | Next |
|---|---|---|
| DRAFT | validate (park excluded → holds) | VALIDATED |
| VALIDATED | DSC/HSM sign (Disburser) | SIGNED |
| SIGNED | transmit via X.3 (unique batch ref) | TRANSMITTED |
| TRANSMITTED | ack success/partial | RECONCILED |
| TRANSMITTED | gateway timeout / ambiguous | SUSPECTED_PROCESSED |
| SUSPECTED_PROCESSED | positive-pay: non-debit confirmed | DRAFT (resend new batch ref) |
| SUSPECTED_PROCESSED | positive-pay: debit confirmed | RECONCILED |
| TRANSMITTED | ack failed | REJECTED (→ holds) |

### 10.5 Tax Declaration

| Current | Event | Next |
|---|---|---|
| DRAFT | submit | SUBMITTED |
| SUBMITTED | verify (P01) | VERIFIED |
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
| RECONCILED | sanction + approve (≠ creator, P01) | APPROVED |
| APPROVED | pay (positive net) | PAID |
| APPROVED | negative net | RECOVERY_PENDING |
| PAID/RECOVERY_PENDING | settle & G11 handoff | CLOSED |

---

## 11. Notifications (X.2 — MSG-G10-*; W.3 recipient config)

All notifications run on the **X.2** infrastructure: `IN_APP` + `EMAIL` fire in parallel for approvals; **EMAIL for approval-workflow and statutory notifications is mandatory and non-suppressible** (BRD §9.9); retry exponential backoff up to 5 attempts + dead-letter queue; every dispatch audit-logged. Templates are referenced by **`MSG-G10-*`** id (registered in Foundation §5), never inlined; recipients/channels are **W.3** config. Sensitive amounts are excluded from notification bodies (link to portal).

| Event | `MSG-G10-*` | Recipient | Channel | Trigger FR |
|---|---|---|---|---|
| Snapshot frozen / post-cutoff deferral recorded | `MSG-G10-SNAPSHOT` | Payroll Officer/Approver | in-app | FR-22 |
| Payroll run completed | `MSG-G10-RUN-DONE` | Payroll Officer/Approver | in-app, email | FR-04 |
| Concurrent run blocked (in-flight) | `MSG-G10-RUN-INFLIGHT` | Payroll Officer | in-app | FR-04/16 |
| Reconciliation needs sign-off | `MSG-G10-RECON` | Payroll Approver | in-app, email | FR-15 |
| Run approved & locked | `MSG-G10-LOCKED` | Payroll team | in-app | FR-16 |
| Payslip published / new version after reopen | `MSG-G10-PAYSLIP` | Employee | in-app, email | FR-13 |
| Bank file transmitted / ack received | `MSG-G10-DISB-ACK` | Payroll Disburser, Finance | in-app, email | FR-14 |
| Disbursement SUSPECTED_PROCESSED — positive-pay required | `MSG-G10-POSPAY` | Payroll Disburser, Finance | in-app, email | FR-14 |
| Disbursement line failed / suspense hold created | `MSG-G10-HOLD` | Payroll Officer | in-app, email | FR-14 |
| Tax proof cutoff approaching | `MSG-G10-TAXCUTOFF` | Employee | in-app, email | FR-07 |
| Tax declaration verified/rejected | `MSG-G10-TAXVERIFY` | Employee | in-app | FR-07 |
| Perquisite valued / revised | `MSG-G10-PERQ` | Employee | in-app | FR-21 |
| Loan sanctioned / closed / foreclosed | `MSG-G10-LOAN` | Employee | in-app, email | FR-08 |
| Benefit / leave-encashment claim status change | `MSG-G10-CLAIM` | Employee, Mgr | in-app | FR-12 |
| Arrears computed/paid (with cascade) | `MSG-G10-ARREAR` | Employee | in-app | FR-10 |
| Statutory remittance deadline approaching / OVERDUE | `MSG-G10-REMIT-DUE` | Payroll Officer, Approver | in-app, email | FR-19 |
| GL journal posted / acknowledged / rejected | `MSG-G10-GL` | Payroll, Finance | in-app | FR-19 |
| FnF computed / approved / paid / recovery-pending | `MSG-G10-FNF` | Employee, Payroll, G11 | in-app, email | FR-20 |
| Overpayment recovery legally-barred — adjudication needed | `MSG-G10-RECOVERY-BARRED` | DDO, Payroll Approver | in-app, email | FR-09 |
| Recovery applied/closed | `MSG-G10-RECOVERY` | Employee | in-app | FR-09 |
| Scheduled job failure (X.1) | `MSG-SYS-JOBFAIL` (shared) | Ops | email | X.1 |

---

## 12. Reporting & Analytics

All reports honour row-level org scope (P02), are cursor-paginated/exportable (CSV/PDF), and feed **G14** dashboards. The three backlog registers (suspense holds, carryforwards, overdue remittances) surface managed exceptions as first-class views.

| Report | Audience | Content |
|---|---|---|
| Payroll Register | Payroll, Auditor | per-employee + component summary per run |
| Reconciliation Report | Payroll Approver | three-way tie-out, disbursed/held/failed, variance, exceptions |
| Statutory Remittance Ledger & Deadline Report | Payroll, Finance, Auditor | per-scheme accrued→deposited→matched, challan/CIN, overdue & late-interest |
| Suspense / Disbursement-Hold Register | Payroll, Finance | held net pay by reason, ageing, owner, re-disbursement status |
| Un-recovered Deduction (Carryforward) Backlog | Payroll, Finance | rolled-forward deductions by source, ageing, owner |
| Statutory Remittance Schedules | Payroll, Finance | PT/GPF/NPS/pension/TDS per period with splits |
| Form-16 / Form-24Q | Employee/Statutory | annual tax statement (Part A from MATCHED) / quarterly TDS return |
| GL Cost-Journal & Posting-Status Report | Payroll, Finance | balanced debit/credit per gl_code, posting status |
| Bank Disbursement & Ack Report | Payroll, Finance | batch totals, success/failed lines, positive-pay status |
| Cost-to-Organisation | Approver, Finance | gross/net/employer-cost by org/cadre/component/period |
| Loan & Advance Outstanding | Payroll, Finance | outstanding principal/interest by employee/type |
| Arrears Report | Payroll, Auditor | arrear computations (dependent cascade) and payouts |
| Full-and-Final Settlement Register | Payroll, HR, Finance | per-separation netting, recovery-pending, G11 handoff |
| Perquisite Register | Payroll, Auditor | taxable perquisites by type/employee/FY |
| What-If Comparison | Approver, Finance | scenario vs actual deltas (board-paper export) |
| Headcount Cost Trend | Approver, Finance | period-over-period cost movement |

---

## 13. Migration & Launch (P06 — ETL+V; payroll history = Wave 3, zero-tolerance)

Legacy payroll/statutory data migrates on the **P06 Migration Toolkit** (Extract → Validate → Transform → Load → Verify, idempotent; `migration_runs` ledger; `<gov>_source_id` traceability against the actual legacy register, not Darwinbox; three mandatory staging dry runs gate cutover). **Payroll history is P06 Wave 3 — explicitly zero-tolerance on numeric discrepancies** (Platform §P06).

### 13.1 Data Migration

| Step | Detail |
|---|---|
| Master data | Load pay scales, pay-matrix levels, DA/HRA/PT-by-state/tax tables (effective-dated) |
| Employee structures | Migrate current salary structure per employee with version + history where available |
| Deduction setup | Migrate GPF/NPS/PT scheme assignments; seed YTD as a signed-off dataset reconstructable into the line ledger |
| Loans | Migrate outstanding loans with amortization remaining and recovered-to-date; flag concessional loans and seed perquisites |
| YTD accumulators | Load FY-to-date earnings/deductions/TDS for mid-year cutover as immutable seed lines (Form-16 continuity) |
| Benefits | Migrate enrolments, LTC block-year utilisation, gratuity accrual baseline, leave balances for encashment |
| Open obligations | Migrate open carryforwards, suspense holds (if any), and un-deposited statutory liabilities into the remittance ledger |

### 13.2 Validation & Parallel Run (P06 Wave-3 zero-tolerance gate — R18)

- Run a **parallel payroll** for at least 2 cycles vs the legacy system.
- **Gate (must pass before go-live):** reconcile to **zero variance** on (a) per-employee net, (b) YTD accumulators, and (c) per-scheme statutory totals (TDS/PT/GPF/NPS). Monthly-net-only reconciliation is insufficient. This is the **Wave-3 zero-tolerance** standard.
- The mid-year YTD seed is a verified, signed-off dataset; the line-ledger derivation must reproduce the seeded YTD exactly.
- Validate Form-24Q and Form-16 Part A against MATCHED remittances before first live filing.

### 13.3 Cutover & Launch

- Freeze legacy; lock migrated balances; run first live cycle in DRAFT, reconcile (incl. disbursed/held/failed), then FINAL.
- Phased rollout by org unit/cohort; self-service (payslip/declaration/FnF) enabled after first successful published cycle.
- Rollback plan: retain legacy read-only ≥ 4 weeks (P06); first-cycle abort path defined.
- **Sequencing:** G10 cutover follows Phase-1 platform go-live and the Phase-2 payroll substrate (M06/M07) being live (Recon §E).

### 13.4 Launch Readiness Checklist

Master data loaded & approved (incl. PT-by-state); structures reconciled; YTD signed-off seed loaded & ledger-reproduced; **bank file format certified with bank in test AND DSC/HSM signing path provisioned and tested (a week-1 long-pole)**; **X.3 integrations registered with credentials in P04 (bank, TRACES/CRA, Finance ERP)**; positive-pay reconciliation channel established with treasury; reconciliation tie-out (incl. disbursed+held+failed) passing; **RBAC v1.7 roles/flags (`payroll_officer`/`payroll_approver`/`payroll_disburser`, `PAYROLL_APPROVE`/`PAYROLL_DISBURSE`/`DDO_SANCTION`) registered and SoD verified**; `JOB-G10-*` registered in Foundation §4 and tested on X.1; `MSG-G10-*` registered in Foundation §5; statutory output formats validated against TRACES/CRA; remittance challan-capture & GL export integration tested; **P05 audit logging & snapshot checksums verified**.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests → Platform service)

| FR | Key Entities | Key APIs | State | Test focus | Platform service |
|---|---|---|---|---|---|
| FR-01 | pay_components, pay_rules | /components,/rules,/dsl/grammar | rule DRAFT→ACTIVE | parser, property tests, overlap, SoD | P01, P02, P05 |
| FR-02 | rate_tables (PT+state), pay_matrix_levels | /rate-tables | rate effective | non-overlap, retrospective, PT-by-state | X.1, P05 |
| FR-03 | employee_salary_structures/components | /structures | structure versions | contiguity, scheme | P01, G06, G12 |
| FR-04 | payroll_runs, payslips, payslip_lines, run_input_snapshots | /cycles/{}/runs | §10.1 | determinism, quarantine, rounding, in-flight | X.1, P05, X.2 |
| FR-05 | payslips (LWP/subsistence), G03 | /attendance-inputs | — | per-day basis, subsistence, dies-non | G03 |
| FR-06 | deductions, deduction_carryforwards | /deductions | §10.6 (feed) | scheme, PT-by-state, derived YTD | P05 |
| FR-07 | tax_declarations (12B/10E) | /tax-declarations | §10.5 | regime, surcharge/cess/87A/10E | P01, G13 |
| FR-08 | loans_advances, loan_repayments, perquisites | /loans | §10.2 | amortization, foreclosure, concessional perquisite | P01, G11 |
| FR-09 | deductions (RECOVERY), deduction_carryforwards | /recoveries | — | priority, net floor, s.60, legal-eligibility | P01, G09, G11 |
| FR-10 | arrears | /arrears:compute | arrear COMPUTED→PAID | cascade, cross-FY 10E | G06, G12 |
| FR-11 | payroll_cycles (OFF_CYCLE), disbursement_holds | /cycles, /holds:redisburse | §10.1 | YTD, duplicate, hold clearing | P01, X.3 |
| FR-12 | benefits, benefit_claims, gratuity_accruals | /benefit-claims | §10.3 | block-year, accrual, encashment | P01, X.1, G11, G13 |
| FR-13 | payslips (versioned), G13 documents | /payslips:publish, /versions | payslip status | totals parity, lock gate, reopen versioning | G13, X.2 |
| FR-14 | bank_disbursements, disbursement_holds | /disbursements, :positive-pay | §10.4 | tie-out+holds, DSC-sign, positive-pay | X.3, P04, G13 |
| FR-15 | payroll_reconciliations | /reconciliation | recon PENDING→SIGNED | three-way + disbursed/held/failed | P02, P05 |
| FR-16 | payroll_runs/cycles, payslips | /runs:lock, :reopen | §10.1 | immutability, reopen versioning, in-flight | P01, P05, G12 |
| FR-17 | payslip_lines (YTD), statutory_remittances | /statutory/* | — | Form-16 tie-out + MATCHED | G13, X.3 |
| FR-18 | payroll_runs (WHATIF) | /analytics, /comparison | — | isolation, board-paper export | G14, X.1 |
| FR-19 | statutory_remittances, gl_journals | /remittances, /gl-journal | §10.6 | accrual, challan match, late interest, GL balance | X.3, X.1, X.2, G13 |
| FR-20 | fnf_settlements | /fnf | §10.7 | consolidation, net equation, G11 handoff | P01, G11, G12 |
| FR-21 | perquisites | /perquisites | perquisite DRAFT→ACTIVE | Rule-3 valuation, tax inclusion | — |
| FR-22 | run_input_snapshots | /snapshot:freeze | snapshot frozen | as-of, determinism, deferral, inter-DDO | X.1, P05, G01/G03/G06/G09 |

### 14.2 Dependency Graph (build order)

Pre-req: **Phase-1 platform (P01–P06, X, W, RBAC v1.7) live + Phase-2 payroll substrate (M06/M07) live.** Then:
1. FR-01, FR-02 (config) → 2. FR-03 (structures) → 3. FR-22 (snapshot) → 4. FR-05, FR-06, FR-08, FR-09 (inputs/deductions) + TDS spike FR-07 pulled forward → 5. FR-04 (engine) → 6. FR-10, FR-11 (arrears/off-cycle) → 7. FR-15, FR-16 (recon/lock on P01) → 8. FR-13, FR-14 (payslip/bank, DSC + X.3 week-1 long-pole) → 9. FR-07, FR-21, FR-17 (tax/perquisite/statutory) → 10. FR-19 (remittance/GL over X.3) → 11. FR-12 (benefits) → 12. FR-20 (FnF) → 13. FR-18 (what-if/analytics).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Config | FR-01, FR-02 | platform live |
| B: Compensation + TDS spike | FR-03, FR-06, FR-08, FR-09, FR-07 spike | A |
| S: Snapshot | FR-22 | A (needs G01/G03/G06/G09 clients) |
| C: Engine | FR-04, FR-05, FR-10, FR-11 | B, S |
| D: Controls | FR-15, FR-16 | C |
| E: Output + Disbursement | FR-13, FR-14 (DSC/X.3 long-pole week 1), FR-17 | D |
| F: Tax & Perquisite | FR-07, FR-21 | B |
| G: Liability & Exit | FR-19, FR-20 | E, F |
| H: Benefits | FR-12 | B |
| I: Analytics | FR-18 | C, D |

### 14.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)

| Requirement area | Covered by | Entities | APIs | States | Tests | Platform grounding | Gap |
|---|---|---|---|---|---|---|---|
| Salary structure & pay matrix | FR-01,02,03 | yes | yes | yes | yes | P01/P02/P05 | none |
| Constrained/versioned DSL | FR-01 + App.16.7 | yes | yes | yes | yes | P01 (activate) | none |
| PT by state of posting | FR-02,06 | yes | yes | n/a | yes | effective-date (VAL-EFFECTIVE) | none |
| Cross-module snapshot | FR-22 | yes (E34) | yes | yes | yes | X.1, G01/G03/G06/G09 | none |
| Payroll run engine + single-in-flight + rounding | FR-04 | yes | yes | yes | yes | X.1 (JOB-G10-RUN), P05 | none |
| Subsistence / dies-non | FR-04,05 + App.16.6 | yes | yes | n/a | yes | G03 | none |
| Attendance/LWP input | FR-05 | yes | yes | n/a | yes | G03 (PrimeSoft M04/M05) | none |
| Statutory deductions + derived YTD | FR-06 | yes | yes | n/a | yes | P05 | none |
| Income tax/TDS full pipeline | FR-07,17 | yes | yes | yes | yes | P01, G13 | none |
| Taxable perquisites | FR-21 | yes (E32) | yes | yes | yes | — | none |
| Loans & advances + concessional perquisite | FR-08 | yes | yes | yes | yes | P01 (sanction) | none |
| Recoveries + net floor + s.60 + legal-eligibility | FR-09 | yes (E35) | yes | n/a | yes | P01, G09 | none |
| Arrears + dependent cascade | FR-10 | yes | yes | yes | yes | G06, G12 | none |
| Supplementary/off-cycle + hold clearing | FR-11 | yes | yes | yes | yes | P01, X.3 | none |
| Benefits + leave encashment | FR-12 | yes | yes | yes | yes | P01, X.1, G11 | none |
| Payslip generation + reopen versioning | FR-13 | yes | yes | yes | yes | G13, X.2 | none |
| Bank disbursement + DSC + positive-pay + suspense | FR-14 | yes (E31) | yes | yes | yes | X.3, P04, HSM | none |
| Register & reconciliation (disbursed+held+failed) | FR-15 | yes | yes | yes | yes | P02, P05 | none |
| Approval & locking/immutability + reopen-versioning | FR-16 | yes | yes | yes | yes | P01, P05 | none |
| Form-16/24Q/remittance (Part A from MATCHED) | FR-17 | yes | yes | n/a | yes | G13, X.3 (TRACES/CRA) | none |
| Statutory remittance liability + GL posting | FR-19 | yes (E29,E33) | yes | yes | yes | X.3 (ERP), X.1, X.2 | none |
| Full-and-final settlement | FR-20 | yes (E30) | yes | yes | yes | P01, G11, G12 | none |
| What-if & cost analytics + board-paper | FR-18 | yes | yes | n/a | yes | G14 | none |
| Backlog reporting (holds/carryforward/overdue) | §12 + FR-09,14,19 | yes | yes | n/a | yes | G14 | none |
| Feeds to G11 (pension/FnF) | FR-08,12,17,20 + §8.5 | yes | yes | yes | yes | G11 | none |
| Pay/separation events to G12 (SR) | FR-03,10,16,20 + §8.5 | yes | yes | yes | yes | G12 (P05 substrate) | none |
| **Multi-tenancy (tenant_id/entity_id)** | §4, §5; every entity | yes | n/a | n/a | yes | Platform §0.1 | none |
| **Workflow on P01** | FR-01,03,07,08,11,12,16,20 | workflows/instances/actions | yes | yes | yes | P01 | none |
| **RBAC v1.7 + SoD (3-way payroll)** | §3 | RBAC roles/flags | n/a | n/a | yes | P02, RBAC v1.7 | none |
| **Audit on P05 dual-log** | §5.6; all FRs | audit_log/security_audit_log | n/a | n/a | yes | P05 (DB-trigger) | none |
| **Notifications on X.2 (MSG-G10-*)** | §11 | notifications | n/a | n/a | yes | X.2, W.3 | none |
| **Jobs on X.1 (JOB-G10-*)** | FR-04,12,19,22 | jobs | n/a | n/a | yes | X.1, Foundation §4 | none |
| **Integrations on X.3 (creds via P04)** | FR-14,17,19 | integration_credentials | yes | yes | yes | X.3, P04 | none |
| **Migration on P06 wave 3 (zero-tolerance)** | §13 | migration_runs | n/a | n/a | yes | P06 | none |
| **API conventions + error envelope/codes** | §8 | — | yes | n/a | yes | Foundation §1 | none |
| **NFR baseline (99.5%/RPO 1h/p95 500ms/WCAG AA)** | §9 | — | n/a | n/a | yes | Vision §2.9; BRD §7 | none |
| **Phase-2 sequencing (after M06/M07)** | header, §2.4, §13.3 | — | n/a | n/a | n/a | Recon §A/§E | none |

**Result: 0 unresolved gaps.** Every v1 capability, every v1→v2 Council improvement (AI-1…AI-24) and risk mitigation (R1–R19), and every v2→v3 platform re-grounding change (RG-1…RG-18) maps to at least one FR/entity/state/test **and a named platform service**.

---

## 15. Alignment with PrimeSoft Platform (FR → service map)

G10 authors **only public-sector payroll business logic**; every cross-cutting concern runs on a named platform service. This section discharges Authoring Rule §9.6 of `PLATFORM_FOUNDATION.md`.

### 15.1 FR → platform service map

| FR | P01 Workflow | P02 RBAC | P04 Creds | P05 Audit | P06 Migr | X.1 Jobs | X.2 Notif | X.3 Integr | W.1/W.2/W.3 | Gov upstream/downstream |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-01 Rules/DSL | activate (maker-checker) | config rights | — | mutation log | — | — | — | — | W.2 form | — |
| FR-02 Rate tables | — | config rights | — | mutation log | — | arrears scan | — | — | — | — |
| FR-03 Structure | maker-checker | scope | — | log | — | — | — | — | W.2 | G06; G12 event |
| FR-04 Run engine | — | run scope | — | log | — | JOB-G10-RUN | run-done | — | — | snapshot of G01/G03/G06/G09 |
| FR-05 LWP input | — | scope | — | log | — | — | — | — | — | G03 |
| FR-06 Statutory deductions | — | scope | — | log | — | — | — | — | — | — |
| FR-07 TDS pipeline | proof verify | self/verify | — | log | — | — | tax cutoff | TRACES (via 17/19) | W.2 declaration | G13 proofs |
| FR-08 Loans | sanction | request/sanction | — | log | — | — | loan | — | W.2 | G11 (exit) |
| FR-09 Recoveries | adjudicate | adjudicate | — | log | — | — | barred | — | — | G09 |
| FR-10 Arrears | approve | compute/approve | — | log | — | — | arrear | — | — | G06; G12 |
| FR-11 Off-cycle | sanction | sanction | — | log | — | — | — | bank disb. | — | — |
| FR-12 Benefits | recommend/approve | submit/approve | — | log | — | gratuity accrual | claim | — | W.2 | G11; G13 |
| FR-13 Payslip | — | scoped read | — | access log | — | bulk render | payslip | — | — | G13 |
| FR-14 Bank disbursement | — | 3-way SoD | bank creds | log | — | — | pos-pay/hold | **bank gateway** | — | G13 |
| FR-15 Reconciliation | — | sign-off SoD | — | log | — | — | recon | — | — | — |
| FR-16 Approval/lock | approve/lock/reopen | Approver only | — | lock-diff log | — | — | locked | — | — | G12 events |
| FR-17 Form-16/24Q | certify | generate/certify | portal creds | log | — | — | — | **TRACES/CRA** | — | G13 |
| FR-18 What-if/analytics | — | scope | — | log | — | async export | — | — | — | G14 |
| FR-19 Remittance/GL | — | match/certify/ack | ERP/portal creds | log | — | deadline reminder | remit/GL | **Finance ERP, TRACES/CRA** | — | G13 |
| FR-20 FnF | sanction/approve | SoD | — | log | — | — | FnF | — | W.2 | G11 handoff; G12 |
| FR-21 Perquisites | approve | value/approve | — | log | — | — | perq | — | — | — |
| FR-22 Snapshot | — | freeze rights | — | append log | — | JOB-G10-SNAPSHOT-FREEZE | snapshot | — | — | G01/G03/G06/G09/org |

### 15.2 What G10 authors vs consumes

- **G10 authors (business logic only):** the pay-rules/DSL engine, computation pipeline, cross-module snapshot contract, derived-YTD ledger, statutory deduction/TDS/perquisite math, arrears cascade, disbursement anti-duplication protocol, remittance-to-MATCHED loop, GL cost-journal, FnF consolidation, and the public-sector `pay_scale`/allowance/deduction masters that extend PrimeSoft M06/M07.
- **G10 consumes (never re-implements):** P01 (workflow/approval/lock), P02 (RBAC/authorization/PII masking), P04 (integration credentials), P05 (dual-log audit), P06 (migration), X.1 (jobs), X.2 (notifications), X.3 (integrations), W.1/W.2/W.3 (configured flows/forms/notification config), the `VAL-*` library, the RBAC v1.7 model, and the platform API/error/NFR conventions.
- **No `GAP (gov-specific)` *engine* is authored by G10** — unlike G11 pension or G12 SR, payroll is an **EXTEND (roadmap)** of PrimeSoft M06/M07/M14, not a net-new statutory engine. The only net-new artefacts are public-sector master data and the `VAL-G10-*`/`JOB-G10-*`/`MSG-G10-*`/`ERR-G10-*` ids registered against the Foundation indexes.

### 15.3 Registered platform ids (Foundation indexes)

- **Jobs (Foundation §4):** `JOB-G10-RUN`, `JOB-G10-SNAPSHOT-FREEZE`, `JOB-G10-ARREAR-SCAN`, `JOB-G10-GRATUITY-ACCRUAL`, `JOB-G10-REMIT-DEADLINE`.
- **Validation (Foundation §2):** reuse `VAL-PAN`, `VAL-AADHAAR`, `VAL-IFSC`, `VAL-CURRENCY`, `VAL-EFFECTIVE`, `VAL-DATE`, `VAL-FILE`, `VAL-ENUM`, `VAL-CONSENT`, `VAL-FNF`, `VAL-SEP`, `VAL-COMMENT`; author `VAL-G10-DSL-TOKEN`, `VAL-G10-RULE-ORDER`, `VAL-G10-RATE-NONOVERLAP`, `VAL-G10-IDENTITY`, `VAL-G10-TIEOUT`, `VAL-G10-YTD-DERIVE`.
- **Messages (Foundation §5):** `MSG-G10-*` per §11; `ERR-G10-*` per §8.3.
- **RBAC (RBAC §2.2/§4.3):** roles `payroll_officer`, `payroll_approver`, `payroll_disburser`; capability flags `PAYROLL_APPROVE`, `PAYROLL_DISBURSE`, `DDO_SANCTION`.

---

## 16. Glossary

| Term | Definition |
|---|---|
| Pay Matrix / Level | Government pay structure of levels and progression cells (e.g., 7th CPC) |
| Basic Pay | Core pay at the assigned matrix cell |
| DA / HRA | Dearness Allowance (% basic) / House Rent Allowance (% by city class X/Y/Z) |
| LWP | Leave Without Pay — unpaid leave causing loss of pay (sourced from **G03**) |
| Subsistence allowance | Reduced pay to a suspended employee; initial % escalating after a configured duration (App.16.6) |
| Dies-non | A period treated as neither pay nor qualifying service |
| GPF / CPF / NPS / PRAN | Provident funds / National Pension System / PRAN |
| PT | Professional Tax (state-levied, slab-based; resolved by state of posting) |
| TDS | Tax Deducted at Source |
| Perquisite | Non-cash taxable benefit valued under Rule 3 (e.g., concessional loan, accommodation) |
| Surcharge / Marginal relief / Cess / 87A / 89(1)/Form-10E / Form-12B | Tax pipeline elements (see FR-07) |
| Form-16 Part A / Part B / Form-24Q | Deposited-TDS certificate (from MATCHED) / income & tax computation / quarterly TDS return |
| Challan / CIN | Statutory deposit receipt / Challan Identification Number |
| Pay-fixation | Re-determination of pay on promotion/upgradation (from **G06**) |
| Arrears | Retrospective pay difference owed (with dependent-allowance cascade) |
| Off-cycle / Supplementary | Payments outside the regular monthly run |
| LTC / LTA / Leave encashment / Gratuity / FnF | Benefit and terminal-settlement terms (see FR-12, FR-20) |
| Reconciliation tie-out | Equality of run totals, payslip sums, and `disbursed+held+failed=net` |
| Suspense hold / Carryforward / Positive pay | Disbursement and recovery integrity constructs (see FR-14, FR-09) |
| DSC / HSM | Digital Signature Certificate / Hardware Security Module (file authenticity; keys never in DB) |
| Single-in-flight run | At most one active FINAL run per cycle |
| Snapshot (as-of) | Frozen capture of upstream **G01/G03/G06/G09**/org facts a run computes from |
| DDO / DDO-of-record | Drawing and Disbursing Officer / the DDO responsible for paying a transfer-month employee |
| SoD | Segregation of Duties (Officer ≠ Approver ≠ Disburser; positive-pay confirmer ≠ transmitter) — enforced by P01/P02 |
| **P01–P06** | PrimeSoft platform engines: Workflow, RBAC, Chat, Tenant/Org Admin, Audit, Migration |
| **X.1 / X.2 / X.3** | Platform Background Jobs / Notifications / Integration Framework |
| **W.1 / W.2 / W.3** | Configured Process Flows / Forms / Notification Configuration |
| **G01…G14** | Government module codes (Recon §B); G10 = Payroll & Benefits, extending PrimeSoft M06/M07/M14 |
| **tenant_id / entity_id** | Platform multi-tenancy scoping columns on every entity (Platform §0.1) |

---

## 17. Appendices

### 16.1 Computation Order (default earning→deduction sequence)

1. BASIC → 2. DA (% basic) → 3. HRA (city-class % basic) → 4. Transport & other allowances → 5. Special pay → 6. Perquisite (non-cash, taxable-income only) → 7. Gross earnings → 8. GPF/NPS (% basic / basic+DA) → 9. PT (state slab on gross) → 10. TDS (full pipeline) → 11. Loan recovery → 12. Court attachment/disciplinary recovery (by priority, within s.60 exemption) → 13. Voluntary deductions → 14. Rounding adjustment → 15. Net pay (with net-protection re-balancing; shortfall → carryforward).

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; rates `NUMERIC(9,4)`; no floating point.
- Component rounding per `pay_rules.rounding`; default NEAREST (half-up) to rupee; statutory deductions use prescribed rounding.
- A `ROUNDING_ADJUSTMENT` component absorbs `Σ(rounded) − round(Σ)` per payslip so gross/net identities tie to the rupee.
- **Remittance tolerance:** a documented per-scheme tolerance absorbs the residue of summed per-employee statutory pennies against NSDL-CRA / GPF reconciliation; variance beyond tolerance is an exception, not a silent pass.

### 16.3 Net-Pay Protection, Attachment Exemption & Recovery Priority

- **Protected floor:** a configurable minimum net (by cadre/jurisdiction); deductions cannot push net below it.
- **Court-attachment exemption:** computed independently per CPC s.60 (not the flat floor); the attachable portion is bounded by statute.
- **Priority:** statutory (TDS/PT/GPF/NPS) → court attachment (within s.60) → disciplinary recovery → overpayment recovery (after legal-eligibility check) → loans → voluntary.
- Spillover below floor/exemption is rolled into `deduction_carryforwards` (owned, aged), not dropped.

### 16.4 Immutability & Correction Policy

A LOCKED run and its payslips are immutable (P05 DB-trigger audit + append-only versioning). Corrections never edit the original; they are issued as: (a) arrears (FR-10), (b) supplementary/off-cycle (FR-11), (c) recovery (FR-09), or (d) reopen-with-versioning (FR-16) pre-transmission, which supersedes the original into a new version with a lock-to-lock diff. Each correction references the original run; YTD always derives from the surviving (non-superseded) line ledger.

### 16.5 Assumptions Log

- One PrimeSoft tenant; each department/directorate an entity; PT supports multiple states within the entity.
- Bank/treasury supports one documented, certified file format; ISO20022/CUSTOM deferred behind a `FileFormatStrategy` seam.
- Government notifications drive rate-table updates; entered by SysAdmin (Org Admin) and approved by Payroll Approver via P01.
- 30-day vs actual-days LWP basis is a configurable policy switch.
- DSC/HSM signing infrastructure and a treasury positive-pay channel are available (week-1 long-pole); integration credentials live in **P04**, calls run on **X.3**.
- Finance ERP accepts a structured cost-journal export over X.3 and returns a posting acknowledgement.
- Phase-2 sequencing: G10 follows Phase-1 platform + Phase-2 payroll substrate (M06/M07) go-live.

### 16.6 Subsistence Allowance & Dies-Non (R13)

- **Subsistence (suspended employees):** initial = configured % of pay (default 50% of pay + applicable DA) for the first configured period; escalates by a configured step after N months of continued suspension (default: increase after 3 and again after 6 months), subject to authority review. Statutory deductions compute on the subsistence base.
- **Dies-non:** a period yields no pay and no qualifying service; neither LWP nor leave; suppresses earnings for those days and is flagged to **G12** for the service record.

### 16.7 Formula DSL Semantics & Security (R14)

- **Grammar versioning:** `dsl_grammar_version`, versioned independently of `pay_rules.version`; FORMULA components pin the grammar; upgrades re-validate/quarantine existing rules.
- **Decimal semantics:** fixed-point `NUMERIC`; no binary float.
- **Null propagation:** any null operand raises a rule exception (never silently 0).
- **Precedence:** explicit, documented; ambiguous expressions rejected at parse time.
- **Whitelist:** only whitelisted operators/functions/component-code/employee-attribute references; no I/O, loops, or code execution.
- **Concessional-loan perquisite (Rule 3):** value = reducing monthly outstanding × ((reference rate − charged rate) / 12), summed over the FY; reference rate is effective-dated master data.
- **Property tests:** decimal rounding, null propagation, precedence, division-by-zero, and circular-reference detection must pass before a FORMULA rule activates (`VAL-G10-DSL-TOKEN`/`VAL-G10-RULE-ORDER`).

### 16.8 Mid-Month Inter-DDO Transfer Rule (R16)

- **Default — DDO-of-record:** the DDO-of-record for the transfer month (snapshotted DDO at cutoff, or destination DDO per policy) pays the full month; control account and bank file attribute to that DDO.
- **Optional — split-period payslip:** where policy requires, the month is split at the transfer date into two segments, each attributed to its DDO's control account, reconciled to the same employee net.
- The chosen mode is configurable; the snapshot (FR-22) records the DDO-of-record so disbursement and control-account attribution are deterministic.

### 16.9 Disbursement Anti-Duplication Protocol (R1/R2)

1. Each transmission (over **X.3**) carries a unique `bank_batch_ref`; the bank echoes it on ack.
2. Excluded/invalid-account net pay is parked in `disbursement_holds` (suspense), preserving `Σ disbursed + Σ held + Σ failed = run net`.
3. On gateway timeout/ambiguous ack the batch enters `SUSPECTED_PROCESSED`; no resend is permitted until a positive-pay/treasury-debit reconciliation confirms the credits did not post.
4. A confirmed non-debit allows resend under a new `bank_batch_ref`; a confirmed debit moves the batch to RECONCILED.
5. The DSC/HSM signature provides authenticity/non-repudiation (keys in HSM, never in DB); the checksum provides integrity only. The positive-pay confirmer must differ from the transmitter (SoD enforced by P02). Outbound calls are idempotent and circuit-broken by the **X.3** framework.

---

*End of G10 Payroll and Benefits Management BRD v3.0 (platform-grounded). Preserves all v2 content and rigor; re-anchored onto PrimeSoft platform engines P01–P06, X.1–X.3, W.1–W.3, RBAC v1.7, and the Foundation VAL-*/MSG-*/ERR-* catalogues. 0 unresolved gaps.*











