# G10 — Payroll and Benefits Management — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | **G10 — Payroll and Benefits Management** (alias GOV-M10; Phase-2 platform-native extension of PrimeSoft M06/M07/M14) |
| BRD | `docs/brd/v3/G10-payroll-and-benefits.md` (v3.1) |
| Contracts | `docs/contracts/openapi/G10.yaml` · `docs/contracts/error-taxonomy.yaml` (`ERR-G10-*`) · `docs/contracts/state-machines.yaml` (G10) · `docs/contracts/auth-matrix.yaml` (G10) |
| Scope | Black-box acceptance + E2E of FR-G10-01…23: pay-rules DSL, rate tables (PT-by-state), salary structures, monthly run engine (single-in-flight, rounding-balanced), LWP/subsistence/dies-non, statutory deductions (GPF/NPS/PT/TDS), TDS pipeline, loans + concessional-loan perquisite, recoveries (net floor / s.60 / legal-eligibility), arrears + dependent cascade, off-cycle/supplementary, benefits + leave encashment + gratuity, payslip reopen-versioning, DSC bank disbursement + positive-pay + suspense holds, register/reconciliation tie-out, approval/lock/reopen, Form-16/24Q from MATCHED, remittance loop + GL journal, FnF, perquisites (Rule 3), snapshot contract, and the G12 SR write-port. |
| Out of scope | Platform engines P01/P02/P05/P06/X.1/X.3/W.* internals; G01/G03/G06/G09 source logic; G11 pension disbursal; G12 ledger internals; G13 vault internals. G10 consumes these by contract — tests assert G10's consumption/behaviour, not the engine internals. |
| Traceability | Every TC lists **Traces-to** (FR + AC / BR / state-transition / ERR code / auth action). Matrix in §3; every FR-G10-01…23 has ≥1 TC (§3 shows 0 gaps). |

### 1.1 Test environment & data assumptions

- **Base path** `/api/v1`; security `bearerAuth` (JWT carrying resolved roles + `tenant_id`/`entity_id` scope). Every mutating payment/run POST carries `Idempotency-Key` (24h replay). Every response echoes `X-Correlation-Id` (header, never body). Error envelope: `{ error: { code, message, field, details } }` and nothing else on 4xx/5xx.
- **Money precision.** All amounts `NUMERIC(15,2)` fixed-point (no float), rates `NUMERIC(9,4)`. A per-payslip `ROUNDING_ADJUSTMENT` line absorbs `Σ(rounded) − round(Σ)`. Expected monetary values below are exact to the paisa.
- **Multi-tenant.** One government tenant `TEN-GOV`; two entities `ENT-REVENUE` (Karnataka postings) and `ENT-WORKS` (Maharashtra postings). Every G10 row carries `tenant_id` + `entity_id`; an unscoped query is **rejected**, never defaulted to "all".
- **Personas (strict 3-way SoD, enforced by P01/P02):**

| Persona | Login | Role / capability | May |
|---|---|---|---|
| Maya (Maker) | `payroll.officer@ten-gov` | `payroll_officer` | configure (draft), run draft/parallel, prepare bank file, prepare FnF, capture challan |
| Arjun (Approver) | `payroll.approver@ten-gov` | `payroll_approver` + `PAYROLL_APPROVE` (MFA) | reconcile-review, approve & lock, reopen, certify remittances/Form-16 |
| Devi (Disburser) | `payroll.disburser@ten-gov` | `payroll_disburser` + `PAYROLL_DISBURSE` (MFA) | DSC-sign + transmit bank file only |
| Farah (Finance) | `finance@ten-gov` | `finance_admin` | confirm treasury debit (positive-pay), GL ack, confirm deposit |
| Hari (DDO/HOD) | `ddo@ten-gov` | `hod` + `DDO_SANCTION` | sanction loans/off-cycle/FnF; adjudicate barred overpayment |
| Sysadmin | `orgadmin@ten-gov` | `org_admin` | master data (scales/DA/HRA/PT/tax), DSL grammar, rate tables |
| Emp (Employee) | `emp1@ten-gov` | `employee` | own payslip/declaration/claims/loan |
| Auditor | `auditor@ten-gov` | Org-Admin read + P05 query | read-only everything |

- **Standard rate assumptions** (stated so calc TCs are reproducible; sourced from published gov notifications loaded as effective-dated `rate_tables`):
  - NPS: employee 10% + employer 14% of (basic+DA). GPF (pre-2004 DOJ): 6% of basic (voluntary).
  - DA = 50% of basic (effective 2026-01-01). HRA: X-class 30%, Y-class 20%, Z-class 10% of basic. TPT flat ₹3,600 + DA%.
  - PT (KARNATAKA): ₹200/month where monthly gross > ₹25,000; (MAHARASHTRA): ₹300 in Feb, ₹200 other months where gross > ₹10,000.
  - Income-tax **new regime FY2026-27**: 0–3L nil; 3–7L @5%; 7–10L @10%; 10–12L @15%; 12–15L @20%; >15L @30%. Standard deduction ₹75,000. 87A rebate up to taxable ₹7,00,000 (max ₹25,000). Cess 4% on (tax+surcharge). Surcharge 10% > ₹50L.
  - Gratuity = (last basic+DA) × 15/26 × completed years, ceiling ₹20,00,000. Leave encashment = (basic+DA)/30 × eligible days; retirement portion exempt u/s 10(10AA) up to ₹25,00,000.
  - Subsistence (suspended): 50% of leave salary for first 3 months.
  - Concessional-loan perquisite (Rule 3): monthly reducing balance × (SBI reference rate 8.00% − charged rate)/12.
  - Rounding: each component rounded to nearest rupee; residue to `ROUNDING_ADJUSTMENT`.
- **Baseline employee EMP-1001** (used across calc TCs unless overridden): DOJ 2010-06-01 (GPF scheme), Level-7 basic **₹49,000**, entity `ENT-REVENUE`, state KARNATAKA, city-class Y (HRA 20%), 30-day month, no LWP.
  - DA = 50% × 49,000 = **₹24,500.00**; HRA = 20% × 49,000 = **₹9,800.00**; TPT = 3,600 × 1.50 = **₹5,400.00**.
  - **Gross = 49,000 + 24,500 + 9,800 + 5,400 = ₹88,700.00**.
  - NPS not applicable (GPF scheme); GPF voluntary 6% × 49,000 = **₹2,940.00**; PT = **₹200.00** (gross > 25,000).

---

## 2. Test Cases

### FR-G10-01 — Pay Component & Rules Engine (constrained, versioned DSL)

| TC | TC-G10-001 |
|---|---|
| Traces-to | FR-G10-01 AC1; `createPayComponent` |
| Type | Functional |
| Title | Create earning component with PERQUISITE/ROUNDING/LEAVE_ENCASHMENT category |
| Preconditions | Sysadmin logged in; DSL grammar published |
| Test data | `POST /payroll/components` `{name:"HRA", type:"EARNING", category:"EARNING", taxable:true, display_order:30}` |
| Steps | 1. POST component. 2. GET `/payroll/components?category=EARNING`. |
| Expected | 201 with component id, status DRAFT; component appears in list; `X-Correlation-Id` header present. Repeat accepting `category` ∈ {PERQUISITE, ROUNDING_ADJUSTMENT, LEAVE_ENCASHMENT} → all 201. |
| Priority | High |

| TC | TC-G10-002 |
|---|---|
| Traces-to | FR-G10-01 AC2; `ERR-G10-RULE-EXPR` (422) |
| Type | Negative |
| Title | Reject invalid DSL expression with line/column |
| Preconditions | Component exists |
| Test data | `POST /payroll/components/{id}/rules` `{expression:"basic * (da + ", calc_method:"FORMULA"}` (unbalanced parens) |
| Steps | 1. POST rule version. |
| Expected | **422 VALIDATION_FAILED**, `error.code="ERR-G10-RULE-EXPR"`, `error.details` carries line/column. No rule persisted. |
| Priority | High |

| TC | TC-G10-003 |
|---|---|
| Traces-to | FR-G10-01 AC2; `ERR-G10-DSL-PROPTEST` (422) |
| Type | Negative |
| Title | FORMULA rule failing property tests is rejected |
| Preconditions | Component exists; grammar active |
| Test data | FORMULA expression that yields null/negative on a property-test vector |
| Steps | 1. POST FORMULA rule that fails `DslPropertyTestRunner`. |
| Expected | **422**, `error.code="ERR-G10-DSL-PROPTEST"`; rule not activated. |
| Priority | Medium |

| TC | TC-G10-004 |
|---|---|
| Traces-to | FR-G10-01 AC3/AC4; `ERR-G10-RULE-OVERLAP` (409) |
| Type | State-Transition + Negative |
| Title | Activating a rule closes prior version; overlapping activation rejected |
| Preconditions | Rule v1 ACTIVE `effective_from=2026-01-01` |
| Test data | Activate v2 `effective_from=2026-04-01`; then attempt v3 `effective_from=2026-02-01` overlapping |
| Steps | 1. `POST /payroll/rules/{v2}:activate`. 2. `POST /payroll/rules/{v3}:activate`. |
| Expected | Step 1: 200; v1 `effective_to=2026-03-31`, v2 ACTIVE (no overlap). Step 2: **409 CONFLICT** `ERR-G10-RULE-OVERLAP`. |
| Priority | High |

| TC | TC-G10-005 |
|---|---|
| Traces-to | FR-G10-01 AC5; auth `g10.run.prepare` SoD; `FORBIDDEN` (403) |
| Type | Authorization-SoD |
| Title | Maker cannot activate the rule they authored (checker ≠ author) |
| Preconditions | Maya authored rule DRAFT |
| Test data | Maya calls `POST /payroll/rules/{id}:activate` |
| Steps | 1. Maya activates own rule. |
| Expected | **403 FORBIDDEN** (`ERR-FORBIDDEN`); activation requires Payroll Approver via P01 (activator ≠ author). |
| Priority | High |

| TC | TC-G10-006 |
|---|---|
| Traces-to | FR-G10-01 AC6; DSL grammar version pinning |
| Type | Functional |
| Title | FORMULA rule records dsl_grammar_version; grammar upgrade quarantines it |
| Preconditions | FORMULA rule active against grammar `g1` |
| Test data | `GET /payroll/dsl/grammar`; publish grammar `g2` |
| Steps | 1. GET grammar → shows `g1` token set. 2. Publish `g2`. 3. Re-validate existing FORMULA rule. |
| Expected | Rule carries `dsl_grammar_version="g1"`; grammar upgrade re-validates/quarantines the rule; re-activation needs re-vet. |
| Priority | Low |

### FR-G10-02 — Rate Tables & Pay Matrix (PT by state)

| TC | TC-G10-007 |
|---|---|
| Traces-to | FR-G10-02 AC1/AC5; `resolveRateTable` |
| Type | Functional |
| Title | Past-dated DA accepted with retrospective flag; PT resolved by state |
| Preconditions | Sysadmin |
| Test data | `POST /payroll/rate-tables {type:"DA",value:0.50,effective_from:"2026-01-01"}` posted in Apr-2026; `GET ?type=PT_SLAB&state=KARNATAKA&date=2026-06-01` |
| Steps | 1. POST past-dated DA. 2. Resolve PT for Karnataka. |
| Expected | 201 with `retrospective=true` flag ("will generate arrears"); PT resolve → ₹200 slab row for KARNATAKA. |
| Priority | High |

| TC | TC-G10-008 |
|---|---|
| Traces-to | FR-G10-02 AC2; `ERR-G10-RATE-OVERLAP` (409) |
| Type | Negative |
| Title | Overlapping effective rate rows rejected |
| Preconditions | DA row `2026-01-01..open` exists |
| Test data | `POST` DA row `effective_from=2026-03-01` same `(tenant,entity,type,state,key,regime,FY)` |
| Steps | 1. POST overlapping row. |
| Expected | **409 CONFLICT** `ERR-G10-RATE-OVERLAP`. |
| Priority | High |

| TC | TC-G10-009 |
|---|---|
| Traces-to | FR-G10-02 AC5; `ERR-G10-PT-STATE` (422) |
| Type | Negative |
| Title | No PT slab for employee's state of posting |
| Preconditions | Employee posted in a state with no PT slab loaded (e.g. GOA) |
| Test data | `GET /payroll/rate-tables?type=PT_SLAB&state=GOA&date=2026-06-01` |
| Steps | 1. Resolve PT for GOA. |
| Expected | **422** `ERR-G10-PT-STATE` ("No PT slab for employee's state of posting"). |
| Priority | High |

| TC | TC-G10-010 |
|---|---|
| Traces-to | FR-G10-02 AC3; VALIDATION_FAILED (422) |
| Type | Boundary/Negative |
| Title | Tax slab requires regime+FY; PT slab requires state+min+max |
| Preconditions | Sysadmin |
| Test data | POST TAX_SLAB without `regime`; POST PT_SLAB without `state` |
| Steps | 1. POST TAX_SLAB missing regime. 2. POST PT_SLAB missing state. |
| Expected | Both **422 VALIDATION_FAILED**; `error.field` = `regime` / `state`. |
| Priority | Medium |

| TC | TC-G10-011 |
|---|---|
| Traces-to | FR-G10-02 AC4/BR2; `ERR-G10-RATE-LOCKED` (409) |
| Type | Negative |
| Title | Editing a rate row referenced by a LOCKED run is blocked |
| Preconditions | DA row used by a LOCKED May run |
| Test data | Attempt in-place edit of that DA row |
| Steps | 1. PUT/modify locked-referenced rate. |
| Expected | **409 CONFLICT** `ERR-G10-RATE-LOCKED`; immutability preserved. |
| Priority | High |

| TC | TC-G10-012 |
|---|---|
| Traces-to | FR-G10-02 BR4; inter-state transfer PT |
| Type | Functional |
| Title | Inter-state transfer uses destination PT from transfer date |
| Preconditions | EMP transfers KARNATAKA→MAHARASHTRA on 2026-06-10 |
| Test data | Snapshot state-of-posting = MAHARASHTRA for June |
| Steps | 1. Resolve PT for June post-transfer. |
| Expected | Destination (MAHARASHTRA) slab applied from transfer date, not legal-entity default. |
| Priority | Medium |

### FR-G10-03 — Salary Structure Assignment & Versioning

| TC | TC-G10-013 |
|---|---|
| Traces-to | FR-G10-03 AC1/AC3; `createSalaryStructure`, `approveSalaryStructure` |
| Type | State-Transition |
| Title | New structure version supersedes prior with contiguous ranges via P01 |
| Preconditions | EMP-1001 has ACTIVE v1 |
| Test data | `POST /payroll/employees/EMP-1001/structures` v2 `effective_from=2026-07-01`; Arjun approves |
| Steps | 1. Maya creates v2 (DRAFT). 2. `POST /payroll/structures/{v2}:approve` by Arjun. |
| Expected | v1 `effective_to=2026-06-30`; v2 ACTIVE from 2026-07-01 (contiguous, one ACTIVE per date); P05 audit row written. |
| Priority | High |

| TC | TC-G10-014 |
|---|---|
| Traces-to | FR-G10-03 AC2; VALIDATION_FAILED (422) |
| Type | Negative |
| Title | FIXED_OVERRIDE without amount+reason rejected |
| Preconditions | Maya |
| Test data | POST structure with a FIXED_OVERRIDE component lacking `override_amount`/`override_reason` |
| Steps | 1. POST. |
| Expected | **422 VALIDATION_FAILED**; `error.field` names the missing override attribute. |
| Priority | Medium |

| TC | TC-G10-015 |
|---|---|
| Traces-to | FR-G10-03 AC4; `ERR-G10-STRUCT-LOCKED` (409) |
| Type | Negative |
| Title | Structure change in a LOCKED period is blocked (route to arrears) |
| Preconditions | June run LOCKED |
| Test data | POST structure version `effective_from` inside June |
| Steps | 1. POST into locked period. |
| Expected | **409 CONFLICT** `ERR-G10-STRUCT-LOCKED`; correction must flow via arrears (FR-10). |
| Priority | High |

| TC | TC-G10-016 |
|---|---|
| Traces-to | FR-G10-03 AC1; `ERR-G10-STRUCT-OVERLAP` (409) |
| Type | Negative |
| Title | Overlapping structure versions rejected |
| Preconditions | v1 `2026-01-01..open` |
| Test data | POST v2 `effective_from=2026-03-01` without closing v1 window (overlap) |
| Steps | 1. POST overlapping version. |
| Expected | **409 CONFLICT** `ERR-G10-STRUCT-OVERLAP`. |
| Priority | Medium |

| TC | TC-G10-017 |
|---|---|
| Traces-to | FR-G10-03 BR3; scheme by DOJ |
| Type | Functional |
| Title | GPF vs NPS component auto-attached by DOJ cutoff |
| Preconditions | EMP-A DOJ 2010 (GPF); EMP-B DOJ 2020 (NPS) |
| Test data | Create structures for both |
| Steps | 1. Build both structures. |
| Expected | EMP-A gets GPF deduction component; EMP-B gets NPS 10% + employer 14% components auto-attached. |
| Priority | High |

### FR-G10-04 — Monthly Payroll Run Engine (single-in-flight, rounding-balanced)

| TC | TC-G10-018 |
|---|---|
| Traces-to | FR-G10-04 AC1/AC5; state OPEN→INPUT_LOCKED→COMPUTING→COMPUTED |
| Type | Financial-Integrity |
| Title | FINAL run computes EMP-1001 gross/net exactly; totals tie to sum of payslips |
| Preconditions | June cycle INPUT_LOCKED with frozen snapshot; EMP-1001 baseline only employee |
| Test data | `POST /payroll/cycles/JUN26/runs {run_mode:"FINAL"}` + `Idempotency-Key` |
| Steps | 1. Start FINAL run. 2. GET `/payroll/runs/{id}`. |
| Expected | 202 → COMPUTED. Payslip: Gross **₹88,700.00**; deductions GPF 2,940 + PT 200 = **₹3,140.00**; Net **₹85,560.00**; `ROUNDING_ADJUSTMENT=₹0.00`; run `net_total` = Σ payslips = **₹85,560.00**. |
| Priority | High |

| TC | TC-G10-019 |
|---|---|
| Traces-to | FR-G10-04 AC2; determinism (rule #16) |
| Type | Financial-Integrity |
| Title | Re-run against same frozen snapshot yields byte-identical payslips |
| Preconditions | Run R1 COMPUTED against snapshot S |
| Test data | Re-run same cycle bound to S (unchanged inputs) |
| Steps | 1. Re-run. 2. Diff R2 vs R1 line-by-line. |
| Expected | Every payslip line + total identical (Gross ₹88,700.00, Net ₹85,560.00); zero variance. |
| Priority | High |

| TC | TC-G10-020 |
|---|---|
| Traces-to | FR-G10-04 AC6; `ERR-G10-RUN-INFLIGHT` (409) |
| Type | Idempotency + State-Transition |
| Title | Second concurrent FINAL run rejected by single-in-flight guard |
| Preconditions | FINAL run R1 in flight (COMPUTING) for JUN26 |
| Test data | `POST /payroll/cycles/JUN26/runs {run_mode:"FINAL"}` (new Idempotency-Key) |
| Steps | 1. Start second FINAL run. |
| Expected | **409 CONFLICT** `ERR-G10-RUN-INFLIGHT`. (A PARALLEL_WHATIF run in parallel → allowed, no lock — see TC-G10-071.) |
| Priority | High |

| TC | TC-G10-021 |
|---|---|
| Traces-to | FR-G10-04; Idempotency-Key 24h replay |
| Type | Idempotency |
| Title | Replaying a run POST with the same Idempotency-Key returns the same run, not a new one |
| Preconditions | Run started with key K |
| Test data | Repeat identical `POST /payroll/cycles/JUN26/runs` with key K |
| Steps | 1. Re-POST with K. |
| Expected | Same run resource returned (no duplicate run; no second lock acquisition). Different fingerprint w/ same key → 409 CONFLICT. |
| Priority | High |

| TC | TC-G10-022 |
|---|---|
| Traces-to | FR-G10-04 AC5; rounding-adjustment ties to the rupee |
| Type | Boundary |
| Title | Per-component rounding residue absorbed by ROUNDING_ADJUSTMENT line |
| Preconditions | Employee whose components produce sub-rupee residue (e.g. HRA 20% of 49,001 = 9,800.20 → 9,800) |
| Test data | basic ₹49,001 → DA 24,500.50→24,501; HRA 9,800.20→9,800; TPT 5,400.15→5,400 |
| Steps | 1. Run FINAL. 2. Inspect ROUNDING_ADJUSTMENT. |
| Expected | Each line rounded to nearest rupee; `ROUNDING_ADJUSTMENT = Σ(rounded) − round(Σ)`; net is a whole-rupee tie-out; identity `Gross − Deductions = Net` holds exactly. |
| Priority | High |

| TC | TC-G10-023 |
|---|---|
| Traces-to | FR-G10-04 AC3; per-employee error isolation |
| Type | Functional |
| Title | Computation error on one employee quarantines that employee only |
| Preconditions | EMP-X missing ACTIVE structure; EMP-1001 valid |
| Test data | Draft run over {EMP-X, EMP-1001} |
| Steps | 1. Start DRAFT run. 2. GET `/payroll/runs/{id}/exceptions`. |
| Expected | EMP-1001 computed correctly; EMP-X in exceptions list with `error_summary`; no partial commit that drops EMP-1001. |
| Priority | High |

| TC | TC-G10-024 |
|---|---|
| Traces-to | FR-G10-04 AC4/BR1; net≥0 + proration |
| Type | Boundary/Financial-Integrity |
| Title | Mid-month joiner prorated on actual paid days; net never negative |
| Preconditions | EMP joins 2026-06-16 (15 of 30 paid days), baseline structure |
| Test data | paid_days=15 |
| Steps | 1. Run FINAL. |
| Expected | Gross prorated = 88,700 × 15/30 = **₹44,350.00**; deductions prorated per policy; `net_pay ≥ 0`; any un-recovered rolls to `deduction_carryforwards`. |
| Priority | High |

| TC | TC-G10-025 |
|---|---|
| Traces-to | FR-G10-04 BR4; subsistence-only (Appendix 16.6) |
| Type | Functional |
| Title | Suspended employee computes subsistence only (50% first 3 months) |
| Preconditions | EMP-1001 SUSPENDED (G09 order in snapshot) |
| Test data | leave-salary base = basic+DA = 73,500; subsistence 50% |
| Steps | 1. Run FINAL. |
| Expected | Subsistence line = 50% × 73,500 = **₹36,750.00** (+ admissible DA); no regular earnings; statutory computed on the subsistence base (BR5, FR-06). |
| Priority | Medium |

| TC | TC-G10-026 |
|---|---|
| Traces-to | FR-G10-04 BR4; dies-non |
| Type | Functional |
| Title | Dies-non period yields zero pay and zero qualifying service |
| Preconditions | EMP marked dies-non for June |
| Test data | dies_non=true |
| Steps | 1. Run FINAL. |
| Expected | net_pay = **₹0.00**; no service credit; no SR qualifying-service event posted. |
| Priority | Medium |

| TC | TC-G10-027 |
|---|---|
| Traces-to | FR-G10-04 engine-fault path; state COMPUTING→OPEN |
| Type | State-Transition |
| Title | Engine fault leaves no partial commit and releases the in-flight lock |
| Preconditions | FINAL run; inject fault mid-commit |
| Test data | Simulated engine fault |
| Steps | 1. Run FINAL; fault occurs. |
| Expected | Run FAILED, cycle back to OPEN, no payslip rows committed, in-flight lock released; restart is idempotent via X.1 per-period run key. |
| Priority | High |

### FR-G10-05 — Attendance & Leave (LWP) Input Integration

| TC | TC-G10-028 |
|---|---|
| Traces-to | FR-G10-05 AC1/AC2; LWP LOP |
| Type | Financial-Integrity |
| Title | LWP days reduce pay by configured per-day basis; paid+LWP reconcile to calendar |
| Preconditions | EMP-1001, 3 LWP days, per-day basis = monthly pay/30 |
| Test data | LWP=3; base for LOP = gross 88,700 |
| Steps | 1. GET `/payroll/cycles/JUN26/attendance-inputs`. 2. Run FINAL. |
| Expected | LOP line = 88,700 × 3/30 = **₹8,870.00**; paid_days 27 + lwp_days 3 = 30 (reconciles); LOP shown as a distinct deduction line. |
| Priority | High |

| TC | TC-G10-029 |
|---|---|
| Traces-to | FR-G10-05 AC3; post-cutoff exclusion |
| Type | Functional |
| Title | Attendance changed after cutoff excluded (snapshot frozen), queued for arrears |
| Preconditions | Snapshot frozen; G03 regularisation approved after cutoff |
| Test data | Late regularisation reversing 2 LWP days |
| Steps | 1. Refresh attendance after cutoff. 2. Run FINAL. |
| Expected | Frozen snapshot used (LWP still 3); late change recorded as post-cutoff deferral (FR-22) and applied via arrears next cycle. |
| Priority | Medium |

| TC | TC-G10-029B |
|---|---|
| Traces-to | FR-G10-05 Failure Handling; PRECONDITION_FAILED (412) / `ERR-LOADFAIL` |
| Type | API-Contract/Negative |
| Title | G03 upstream unavailable at input refresh maps to 412/500, retryable |
| Preconditions | G03 service temporarily unreachable |
| Test data | `POST /payroll/cycles/JUN26/attendance-inputs:refresh` |
| Steps | 1. Refresh while G03 down. |
| Expected | **412 PRECONDITION_FAILED** (retryable) or **500 INTERNAL** with `ERR-LOADFAIL`; **never 503**; no partial snapshot mutation. |
| Priority | Medium |

### FR-G10-06 — Statutory Deductions (GPF/NPS/PT/Pension/Insurance)

| TC | TC-G10-030 |
|---|---|
| Traces-to | FR-G10-06 AC1; NPS employee+employer |
| Type | Financial-Integrity |
| Title | NPS computes employee 10% + employer 14% of basic+DA; employer is cost line |
| Preconditions | EMP-B NPS scheme, basic 49,000, DA 24,500 (base 73,500) |
| Test data | run FINAL |
| Steps | 1. Run; inspect deduction + cost lines. |
| Expected | Employee NPS = 10% × 73,500 = **₹7,350.00** (deduction, reduces net); Employer NPS = 14% × 73,500 = **₹10,290.00** (info/cost line feeding GL, not deducted from net). |
| Priority | High |

| TC | TC-G10-031 |
|---|---|
| Traces-to | FR-G10-06 AC2/BR4; PT by state |
| Type | Financial-Integrity |
| Title | PT applies correct state slab (Karnataka ₹200; Maharashtra ₹300 Feb) |
| Preconditions | EMP-K Karnataka; EMP-M Maharashtra |
| Test data | June (K→₹200), Feb (M→₹300) |
| Steps | 1. Run June for EMP-K. 2. Run Feb for EMP-M. |
| Expected | EMP-K PT June = **₹200.00**; EMP-M PT Feb = **₹300.00**, other months **₹200.00**. |
| Priority | High |

| TC | TC-G10-032 |
|---|---|
| Traces-to | FR-G10-06 AC4; YTD derived (rule #9) |
| Type | Financial-Integrity |
| Title | YTD is Σ over payslip_lines and stays correct across regular+arrears+reopen |
| Preconditions | 3 monthly runs + 1 arrears run for EMP-1001 |
| Test data | GPF Apr 2,940 + May 2,940 + Jun 2,940 + arrears GPF delta 300 |
| Steps | 1. GET `/payroll/employees/EMP-1001/deductions`. 2. Reopen June, re-derive. |
| Expected | Derived GPF YTD = **₹9,120.00** (2,940×3 + 300); after reopen, YTD recomputes from surviving (non-superseded) lines; `cumulative_ytd` cache matches derived. |
| Priority | High |

| TC | TC-G10-033 |
|---|---|
| Traces-to | FR-G10-06 AC5/BR2; CPC s.60 attachment exemption |
| Type | Financial-Integrity |
| Title | Court attachment respects s.60 exemption; shortfall to carryforward |
| Preconditions | EMP with court-attachment order exceeding exempt-protected net |
| Test data | attachment ordered ₹40,000; s.60 exemption protects part of net |
| Steps | 1. Run FINAL. |
| Expected | Attachment recovered only down to s.60 exempt floor; shortfall rolled to `deduction_carryforwards`; net never below exemption. |
| Priority | Medium |

| TC | TC-G10-033B |
|---|---|
| Traces-to | FR-G10-06 Failure; `ERR-G10-RATE-NOTFOUND` (422) |
| Type | Negative |
| Title | Missing effective rate row raises run exception ERR-G10-RATE-NOTFOUND |
| Preconditions | No DA row effective for the period |
| Test data | run FINAL over period lacking DA rate |
| Steps | 1. Run. 2. GET exceptions. |
| Expected | Affected employee in exceptions with **422** `ERR-G10-RATE-NOTFOUND`; valid employees unaffected. |
| Priority | Medium |

### FR-G10-07 — Income-Tax (TDS) Declarations, Proofs & Pipeline

| TC | TC-G10-034 |
|---|---|
| Traces-to | FR-G10-07 AC5; `getTaxProjection` full pipeline |
| Type | Financial-Integrity |
| Title | TDS pipeline computes new-regime tax with std deduction, slab, cess, 87A |
| Preconditions | Emp annual gross taxable ₹9,00,000 (incl. perquisite ₹0), new regime FY2026-27 |
| Test data | GET `/payroll/tax-declarations/{id}/projection` |
| Steps | 1. Submit declaration (new regime). 2. GET projection. |
| Expected | Taxable = 9,00,000 − 75,000 = **₹8,25,000**; slab tax = 3–7L@5% (₹20,000) + 7–8.25L@10% (₹12,500) = **₹32,500**; 87A not available (>7L); cess 4% = ₹1,300; **total tax ₹33,800**; each stage persisted & shown step-by-step. |
| Priority | High |

| TC | TC-G10-035 |
|---|---|
| Traces-to | FR-G10-07 AC5 (87A boundary) |
| Type | Boundary |
| Title | 87A rebate zeroes tax at taxable ≤ ₹7,00,000 (new regime) |
| Preconditions | Taxable exactly ₹7,00,000 |
| Test data | GET projection |
| Steps | 1. Compute. |
| Expected | Slab tax = ₹20,000; 87A rebate = ₹20,000 (≤₹25,000 cap) → **tax ₹0.00**; cess ₹0.00. At taxable ₹7,00,001 → rebate lost (marginal-relief consideration), tax jumps — assert the boundary. |
| Priority | High |

| TC | TC-G10-036 |
|---|---|
| Traces-to | FR-G10-07 AC1; regime switch recompute |
| Type | Functional |
| Title | Switching regime recomputes full pipeline and per-month TDS |
| Preconditions | Declaration submitted old→new |
| Test data | `POST /payroll/tax-declarations` with regime toggle |
| Steps | 1. Submit old regime. 2. Switch to new. 3. GET projection. |
| Expected | New-regime ignores most exemptions; per-month TDS = (projected annual tax − YTD TDS from ledger)/remaining months. |
| Priority | High |

| TC | TC-G10-037 |
|---|---|
| Traces-to | FR-G10-07 AC2/BR3; proof cutoff + P01 verify |
| Type | State-Transition/SoD |
| Title | Unverified declared deductions excluded after cutoff; verify is P01 maker-checker |
| Preconditions | Declaration with unverified 80C proof, cutoff passed |
| Test data | `POST /payroll/tax-declarations/{id}:verify` |
| Steps | 1. Run TDS after cutoff without verify. 2. Maya verifies (partial). |
| Expected | Pre-verify: declared 80C excluded, conservative TDS. Partial verify reduces allowed amount to verified value; declaration locks after FY proof cutoff (AC3). |
| Priority | High |

| TC | TC-G10-038 |
|---|---|
| Traces-to | FR-G10-07 AC6/AC7; Form-12B + 10E |
| Type | Financial-Integrity |
| Title | Form-12B previous-employer income included; cross-FY arrears yield Form-10E relief |
| Preconditions | Mid-year joiner with prior-employer income ₹4,00,000; cross-FY arrear |
| Test data | `POST /form12b`; `GET /form10e` |
| Steps | 1. Capture 12B. 2. Compute projection. 3. GET Form-10E. |
| Expected | Projection includes ₹4,00,000 prior income; Form-10E shows 89(1) relief working spreading arrears to prior FYs; relief flows into TDS and Form-16. |
| Priority | Medium |

| TC | TC-G10-039 |
|---|---|
| Traces-to | FR-G10-07 Failure; `ERR-G10-TAXSLAB-NOTFOUND` (422) |
| Type | Negative |
| Title | Missing tax slab for FY/regime rejected |
| Preconditions | No TAX_SLAB loaded for FY2027-28 new regime |
| Test data | GET projection for that FY |
| Steps | 1. Project. |
| Expected | **422** `ERR-G10-TAXSLAB-NOTFOUND`. |
| Priority | Medium |

### FR-G10-08 — Loans & Advances (concessional-loan perquisite)

| TC | TC-G10-040 |
|---|---|
| Traces-to | FR-G10-08 AC1/AC2; loan state REQUESTED→SANCTIONED→RECOVERING→CLOSED |
| Type | Financial-Integrity + State-Transition |
| Title | EMI recovered each run; closure invariant Σ principal = principal |
| Preconditions | HBA ₹1,20,000, 12 EMIs of ₹10,000; DDO sanctions |
| Test data | `POST /payroll/loans`; `POST /payroll/loans/{id}:sanction` (Hari) |
| Steps | 1. Apply. 2. DDO sanction (P01). 3. Run 12 cycles. |
| Expected | Each run recovers ₹10,000; outstanding decreases 120k→0; final installment sets CLOSED; **Σ principal recovered = ₹1,20,000.00** exactly. |
| Priority | High |

| TC | TC-G10-041 |
|---|---|
| Traces-to | FR-G10-08 AC5; FR-G10-21; concessional perquisite |
| Type | Financial-Integrity |
| Title | Concessional loan auto-creates Rule-3 perquisite wired into TDS |
| Preconditions | Loan outstanding ₹1,00,000 for the month, charged 4%, reference 8% |
| Test data | `GET /payroll/loans/{id}/perquisite` |
| Steps | 1. Sanction concessional loan. 2. GET perquisite. |
| Expected | `is_concessional=true`; perquisite monthly = 1,00,000 × (8%−4%)/12 = **₹333.33**; a `perquisites` row ACTIVE; value flows to `tax_declarations.perquisite_total` (increases TDS, not net). |
| Priority | High |

| TC | TC-G10-042 |
|---|---|
| Traces-to | FR-G10-08 AC4; `ERR-G10-RECOVERY-NET` (409) |
| Type | Negative/Boundary |
| Title | Insufficient net → recovery carryforward, ledger never negative |
| Preconditions | Net after statutory < EMI |
| Test data | EMI ₹10,000, available net ₹6,000 |
| Steps | 1. Run FINAL. |
| Expected | **409** `ERR-G10-RECOVERY-NET`; recovered ₹6,000 (or per policy skip), shortfall → `deduction_carryforwards`; net ≥ 0. |
| Priority | High |

| TC | TC-G10-043 |
|---|---|
| Traces-to | FR-G10-08 AC3; foreclosure |
| Type | Financial-Integrity |
| Title | Foreclosure computes outstanding + accrued interest in one entry |
| Preconditions | Loan outstanding ₹40,000, accrued interest ₹800 |
| Test data | `POST /payroll/loans/{id}:foreclose` |
| Steps | 1. Foreclose. |
| Expected | Single foreclosure entry = **₹40,800.00**; loan FORECLOSED; concessional perquisite stops from foreclosure date. |
| Priority | Medium |

| TC | TC-G10-044 |
|---|---|
| Traces-to | FR-G10-08; loan sanction SoD (DDO) |
| Type | Authorization-SoD |
| Title | Payroll maker cannot sanction a loan (DDO-only) |
| Preconditions | Maya |
| Test data | Maya calls `POST /payroll/loans/{id}:sanction` |
| Steps | 1. Maya sanctions. |
| Expected | **403 FORBIDDEN**; sanction requires `hod` + `DDO_SANCTION` (Hari), P01. |
| Priority | High |

### FR-G10-09 — Recoveries & Ad-hoc Adjustments

| TC | TC-G10-045 |
|---|---|
| Traces-to | FR-G10-09 AC1/AC2; `createRecovery` |
| Type | Functional |
| Title | G09 recovery order creates scheduled recovery; never exceeds ordered total |
| Preconditions | G09 order total ₹50,000 @ ₹5,000/cycle |
| Test data | `POST /payroll/recoveries` |
| Steps | 1. Create recovery. 2. Run 11 cycles. |
| Expected | Per-cycle ₹5,000; recovered-to-date caps at **₹50,000.00**; 11th cycle recovers only ₹0 remaining balance; recovery closes SATISFIED. |
| Priority | High |

| TC | TC-G10-046 |
|---|---|
| Traces-to | FR-G10-09 AC5/BR2; `ERR-G10-RECOVERY-BARRED` (409) |
| Type | Negative/Authorization |
| Title | Legally-barred overpayment recovery blocked until authority adjudicates |
| Preconditions | Retiree Class-III overpayment (Rafiq Masih line) |
| Test data | `POST /payroll/recoveries` overpayment; then `POST /payroll/recoveries/{id}:adjudicate` (Hari) |
| Steps | 1. Create barred recovery. 2. Attempt to schedule. 3. Hari adjudicates. |
| Expected | Step 2: **409** `ERR-G10-RECOVERY-BARRED`. Step 3: DDO records decision (P01, `g10.overpayment.adjudicate`); only then recovery may proceed with recorded justification. |
| Priority | High |

| TC | TC-G10-047 |
|---|---|
| Traces-to | FR-G10-09 BR3; recovery priority ordering |
| Type | Financial-Integrity |
| Title | Recovery priority statutory→court(s.60)→disciplinary→overpayment→loans→voluntary |
| Preconditions | Employee with all 6 recovery types competing for limited net |
| Test data | limited net after statutory |
| Steps | 1. Run FINAL. |
| Expected | Deductions applied strictly in priority order; lower-priority items yield to carryforward when net exhausted; no over-recovery. |
| Priority | Medium |

| TC | TC-G10-048 |
|---|---|
| Traces-to | FR-G10-09 AC6/§12; carryforward ageing |
| Type | Functional |
| Title | Un-recovered deductions appear in aged carryforward backlog |
| Preconditions | Shortfalls across 3 cycles |
| Test data | `GET /payroll/carryforwards?ageing=61-90` |
| Steps | 1. GET aged backlog. |
| Expected | Rolled-forward amounts listed with ageing buckets; conservation: Σ carryforward = Σ shortfalls. |
| Priority | Low |

### FR-G10-10 — Arrears & Retrospective Revisions (dependent cascade)

| TC | TC-G10-049 |
|---|---|
| Traces-to | FR-G10-10 AC1/AC5; dependent-allowance cascade |
| Type | Financial-Integrity |
| Title | Back-dated basic increase cascades DA/HRA/TPT/NPS deltas per historical month |
| Preconditions | Basic revised 45,000→49,000 effective 2026-04-01, computed in June (3 months) |
| Test data | `POST /payroll/arrears:compute` (Idempotency-Key) |
| Steps | 1. Compute arrears. 2. GET `/payroll/arrears/{id}`. |
| Expected | Per month: basic delta ₹4,000; DA delta 50%×4,000=₹2,000; HRA delta 20%×4,000=₹800; TPT delta 3,600×(new DA%−old DA%)=₹0 (DA% unchanged); month subtotal = **₹6,800.00**; 3-month gross arrear = **₹20,400.00**, net of recomputed GPF/statutory delta; component-wise month-wise breakup returned. |
| Priority | High |

| TC | TC-G10-050 |
|---|---|
| Traces-to | FR-G10-10 AC4; locked-period additive lines |
| Type | Financial-Integrity |
| Title | LOCKED-period arrears never mutate original payslip (additive via arrear_ref) |
| Preconditions | Apr/May LOCKED |
| Test data | arrears for Apr/May |
| Steps | 1. Compute + approve arrears. |
| Expected | Original Apr/May payslips unchanged (immutable); arrear posted as additive lines carrying `arrear_ref`; paid via ARREARS cycle. |
| Priority | High |

| TC | TC-G10-051 |
|---|---|
| Traces-to | FR-G10-10 AC3/BR4; cross-FY 10E |
| Type | Financial-Integrity |
| Title | Cross-FY arrears recompute TDS via ledger and generate Form-10E relief |
| Preconditions | Arrears spanning FY2025-26 and FY2026-27 |
| Test data | compute arrears; GET form10e |
| Steps | 1. Compute. 2. Inspect 10E + Form-16 flow. |
| Expected | Arrear TDS delta derived from corrected YTD ledger; 89(1)/Form-10E relief produced; reflected in Form-16. |
| Priority | Medium |

| TC | TC-G10-052 |
|---|---|
| Traces-to | FR-G10-10; `approveArrear` posts SR pay event |
| Type | E2E-Flow |
| Title | Approving pay-fixation arrears posts PAY_FIXATION to /sr/ingest |
| Preconditions | Promotion pay-fixation arrears (G06 order linked) |
| Test data | `POST /payroll/arrears/{id}:approve` (Arjun) |
| Steps | 1. Approve arrears. |
| Expected | Arrear APPROVED; a `PAY_FIXATION` event posted via `POST /api/v1/sr/ingest` with `source_module="G10"`, dedup tuple + `fact_key` (see FR-23 TCs). |
| Priority | Medium |

### FR-G10-11 — Supplementary & Off-Cycle Payroll

| TC | TC-G10-053 |
|---|---|
| Traces-to | FR-G10-11 AC3/AC4; `ERR-G10-OFFCYCLE-DUP` (409) + SoD |
| Type | Idempotency/Authorization |
| Title | Off-cycle requires DDO sanction; duplicate off-cycle prevented |
| Preconditions | Off-cycle cycle created (Idempotency-Key) |
| Test data | `POST /payroll/cycles`; `POST /payroll/cycles/{id}:sanction` (Hari) |
| Steps | 1. Create off-cycle. 2. Re-create same purpose/employee. 3. Sanction. |
| Expected | Step 2: **409** `ERR-G10-OFFCYCLE-DUP`. Sanction requires DDO (P01) then Approver approval; maker-run without sanction → 403. |
| Priority | High |

| TC | TC-G10-054 |
|---|---|
| Traces-to | FR-G10-11 AC5; hold re-disbursement |
| Type | E2E-Flow |
| Title | Off-cycle clears a suspense hold and closes the originating hold row |
| Preconditions | `disbursement_holds` row H1 for EMP with corrected bank account |
| Test data | `POST /payroll/holds/H1:redisburse` (Idempotency-Key) |
| Steps | 1. Redisburse hold via off-cycle. 2. On bank ack success. |
| Expected | Off-cycle references H1; on success H1 closed; net reaches account; YTD continuity preserved (AC2). |
| Priority | High |

### FR-G10-12 — Benefits Administration (incl. Leave Encashment, Gratuity)

| TC | TC-G10-055 |
|---|---|
| Traces-to | FR-G10-12 AC1; claim state DRAFT→SUBMITTED→RECOMMENDED→APPROVED→PAID |
| Type | State-Transition |
| Title | Benefit claim follows submit→recommend→approve(P01)→pay; ≤ cap |
| Preconditions | Medical claim ₹15,000, cap ₹25,000 |
| Test data | `POST /payroll/benefit-claims`; `POST /{id}:approve` |
| Steps | 1. Emp submits. 2. Manager recommends. 3. Arjun approves. |
| Expected | State transitions as specified; approved ≤ cap; paid on payslip or off-cycle. |
| Priority | Medium |

| TC | TC-G10-056 |
|---|---|
| Traces-to | FR-G10-12 AC5; leave encashment + s.10(10AA) |
| Type | Financial-Integrity |
| Title | Leave encashment = (basic+DA)/30 × eligible days; retirement portion exempt |
| Preconditions | EMP-1001 retiring, 240 eligible EL days, base basic+DA=73,500 |
| Test data | `GET /payroll/employees/EMP-1001/leave-encashment:compute` |
| Steps | 1. Compute encashment. |
| Expected | Encashment = 73,500/30 × 240 = **₹5,88,000.00**; retirement-exempt u/s 10(10AA) up to cap → excluded from taxable income; in-service encashment (non-retirement) fully taxable. |
| Priority | High |

| TC | TC-G10-057 |
|---|---|
| Traces-to | FR-G10-12 AC3; gratuity accrual + ceiling |
| Type | Boundary/Financial-Integrity |
| Title | Gratuity accrues (basic+DA)×15/26×years, capped at ₹20,00,000 |
| Preconditions | 30 completed years, last basic+DA ₹1,20,000 |
| Test data | `GET /payroll/employees/{id}/gratuity-accrual` |
| Steps | 1. GET accrual. |
| Expected | Raw = 1,20,000 × 15/26 × 30 = ₹20,76,923.08 → **capped ₹20,00,000.00**; accrual settled/handed to G11 at FnF. |
| Priority | Medium |

| TC | TC-G10-058 |
|---|---|
| Traces-to | FR-G10-12 AC2/BR3; LTC block-year + duplicate proof |
| Type | Negative |
| Title | LTC validates block-year; duplicate proof reuse blocked |
| Preconditions | LTC already utilised in current block |
| Test data | LTC claim reusing prior proof |
| Steps | 1. Submit LTC. |
| Expected | Block-year over-utilisation rejected; duplicate proof → **409 CONFLICT**. |
| Priority | Low |

### FR-G10-13 — Payslip Generation, Self-Service & Reopen Versioning

| TC | TC-G10-059 |
|---|---|
| Traces-to | FR-G10-13 AC1/AC2; `ERR-G10-RUN-NOTLOCKED` (409) |
| Type | Negative/State-Transition |
| Title | Publish before lock blocked; post-lock publish matches payslip totals |
| Preconditions | Run COMPUTED (not locked), then LOCKED |
| Test data | `POST /payroll/runs/{id}/payslips:publish` |
| Steps | 1. Publish pre-lock. 2. Lock. 3. Publish. |
| Expected | Step 1: **409** `ERR-G10-RUN-NOTLOCKED`. Step 3: 202; payslip PDF totals equal `payslips`/`payslip_lines` exactly incl. rounding-adjustment. |
| Priority | High |

| TC | TC-G10-060 |
|---|---|
| Traces-to | FR-G10-13 AC3/BR1; scope + PII masking |
| Type | Authorization-SoD |
| Title | Employee sees only own payslip; bank/PAN masked by default |
| Preconditions | Emp logged in |
| Test data | `GET /payroll/employees/EMP-1001/payslips` as EMP-1001 and as EMP-2002 |
| Steps | 1. EMP-1001 GET own. 2. EMP-2002 GET EMP-1001. |
| Expected | Own: 200, bank a/c & PAN masked (last-4) per P02 TIER-1 ceiling. Other: **403/404** (scope-safe, no existence leak). Download logged to `security_audit_log`. |
| Priority | High |

| TC | TC-G10-061 |
|---|---|
| Traces-to | FR-G10-13 AC4/AC5; reopen versioning + diff |
| Type | State-Transition |
| Title | Reopen supersedes original payslip; viewer shows version + "what changed" |
| Preconditions | June LOCKED + published |
| Test data | Reopen June (Arjun); `GET /payroll/payslips/{id}/versions` |
| Steps | 1. Reopen + re-run. 2. GET versions. |
| Expected | Original → SUPERSEDED/REVERSED (read-only, still accessible); new version published; version history shows active-version badge + lock-to-lock diff. |
| Priority | High |

### FR-G10-14 — Bank Disbursement (DSC, positive-pay, suspense holds)

| TC | TC-G10-062 |
|---|---|
| Traces-to | FR-G10-14 AC1/AC4; `ERR-G10-BANK-INVALID` (422); tie-out |
| Type | Financial-Integrity |
| Title | Invalid accounts parked to holds; disbursed+held+failed = run net |
| Preconditions | LOCKED run net ₹85,560.00 over 2 payees; EMP-2 account invalid |
| Test data | `POST /payroll/runs/{id}/disbursements` |
| Steps | 1. Generate file. |
| Expected | 201; EMP-2 net parked to `disbursement_holds` (**422** detail `ERR-G10-BANK-INVALID` on that line, not silent removal); **Σ disbursed + Σ held + Σ failed = ₹85,560.00** exactly; `record_count` = payees with net>0 & valid account. |
| Priority | High |

| TC | TC-G10-063 |
|---|---|
| Traces-to | FR-G10-14 AC3; DSC-sign SoD (disburser ≠ creator ≠ approver) |
| Type | Authorization-SoD |
| Title | Only Payroll Disburser can DSC-sign/transmit; Maker/Approver rejected |
| Preconditions | Disbursement VALIDATED; Maya created run, Arjun approved |
| Test data | `POST /payroll/disbursements/{id}:sign` by Maya, then Arjun, then Devi |
| Steps | 1. Maya signs. 2. Arjun signs. 3. Devi signs. |
| Expected | Maya → **403**; Arjun → **403** (3-way SoD); Devi (`payroll_disburser` + `PAYROLL_DISBURSE`) → 200 SIGNED. |
| Priority | High |

| TC | TC-G10-064 |
|---|---|
| Traces-to | FR-G10-14 AC5/BR4; `ERR-G10-RESEND-POSPAY` (409) — double-payment prevention |
| Type | Idempotency/Financial-Integrity |
| Title | Resend blocked after ambiguous ack until positive-pay non-debit confirmed |
| Preconditions | Batch TRANSMITTED → gateway timeout → SUSPECTED_PROCESSED |
| Test data | `POST /payroll/disbursements/{id}:transmit` (resend); then `POST /{id}:positive-pay {debited:false}` by Farah |
| Steps | 1. Attempt resend. 2. Finance confirms non-debit. 3. Resend. |
| Expected | Step 1: **409** `ERR-G10-RESEND-POSPAY`. Step 2: positive-pay confirmed non-debit (Finance ≠ transmitter). Step 3: resend issues a **NEW** `bank_batch_ref`; no duplicate credit. |
| Priority | High |

| TC | TC-G10-065 |
|---|---|
| Traces-to | FR-G10-14 state SUSPECTED_PROCESSED→RECONCILED |
| Type | State-Transition |
| Title | Positive-pay debit-confirmed transitions batch to RECONCILED (no resend) |
| Preconditions | Batch SUSPECTED_PROCESSED |
| Test data | `POST /{id}:positive-pay {debited:true}` |
| Steps | 1. Finance confirms debit posted. |
| Expected | Batch → RECONCILED; resend forbidden (money already left); no double payment. |
| Priority | High |

| TC | TC-G10-066 |
|---|---|
| Traces-to | FR-G10-14 Failure; `ERR-G10-SIGNING-DOWN` (412/500) |
| Type | API-Contract/Negative |
| Title | HSM/DSC unavailable at signing maps via X.3 to 412/500 |
| Preconditions | HSM down |
| Test data | `POST /payroll/disbursements/{id}:sign` |
| Steps | 1. Sign while HSM down. |
| Expected | `ERR-G10-SIGNING-DOWN` under **412 PRECONDITION_FAILED** (retryable) or **500 INTERNAL**; never 503; batch stays SIGNED-pending, no transmit. |
| Priority | Medium |

| TC | TC-G10-067 |
|---|---|
| Traces-to | FR-G10-14 AC4; partial ack → holds |
| Type | Functional |
| Title | Partial bank ack routes failed lines to holds; tie-out preserved |
| Preconditions | Batch TRANSMITTED |
| Test data | `POST /payroll/disbursements/{id}/ack` marking 1 of 2 lines failed |
| Steps | 1. Ingest partial ack. |
| Expected | Success line RECONCILED; failed line → `disbursement_holds`; disbursed+held+failed still = run net. |
| Priority | Medium |

### FR-G10-15 — Payroll Register & Reconciliation

| TC | TC-G10-068 |
|---|---|
| Traces-to | FR-G10-15 AC1; three-way tie-out |
| Type | Financial-Integrity |
| Title | Control totals = run totals = Σ payslips (incl. rounding-adjustment) |
| Preconditions | Run COMPUTED |
| Test data | `GET /payroll/runs/{id}/reconciliation` |
| Steps | 1. GET reconciliation. |
| Expected | Gross = Σ earnings, Net = Gross − Σ deductions, control totals equal run totals equal Σ payslips; variance vs prior period shown. |
| Priority | High |

| TC | TC-G10-069 |
|---|---|
| Traces-to | FR-G10-15 AC3/BR3; `ERR-G10-RECON-TIEOUT` (409) + sign-off SoD |
| Type | Negative/Authorization-SoD |
| Title | Sign-off blocked when totals don't tie; checker ≠ creator |
| Preconditions | Injected imbalance (held not accounted) |
| Test data | `POST /payroll/runs/{id}/reconciliation:signoff` by Maya then Arjun |
| Steps | 1. Sign off with imbalance. 2. Fix. 3. Maya (creator) signs. 4. Arjun signs. |
| Expected | Step 1: **409** `ERR-G10-RECON-TIEOUT`. Step 3: **403** (creator cannot sign off own run). Step 4: 200 SIGNED_OFF. |
| Priority | High |

| TC | TC-G10-070 |
|---|---|
| Traces-to | FR-G10-15 AC4/BR2; quarantine blocks sign-off |
| Type | Functional |
| Title | Unresolved quarantined employees block reconciliation sign-off |
| Preconditions | Run with 1 quarantined employee |
| Test data | attempt sign-off |
| Steps | 1. Sign off. |
| Expected | Sign-off blocked; exception listed and must be explained/resolved; suspense holds + overdue remittances surfaced as managed exceptions. |
| Priority | Medium |

### FR-G10-16 — Approval, Finalisation, Locking & Reopen-Versioning

| TC | TC-G10-071 |
|---|---|
| Traces-to | FR-G10-16 AC1; `ERR-G10-RECON-UNSIGNED` (409) + approver ≠ creator |
| Type | Negative/Authorization-SoD |
| Title | Approve blocked before recon sign-off; approver ≠ run creator |
| Preconditions | Run RECONCILED-not-signed; Maya is creator |
| Test data | `POST /payroll/runs/{id}:approve` by Maya (unsigned), by Maya (signed), by Arjun |
| Steps | 1. Approve unsigned. 2. Sign off. 3. Maya approves. 4. Arjun approves. |
| Expected | Step 1: **409** `ERR-G10-RECON-UNSIGNED`. Step 3: **403** (creator can't approve). Step 4: 200 APPROVED (P01, MFA). |
| Priority | High |

| TC | TC-G10-072 |
|---|---|
| Traces-to | FR-G10-16 AC2/AC3; `ERR-G10-RUN-IMMUTABLE` (409) — immutability |
| Type | State-Transition/Negative |
| Title | Locking freezes payslips; any write to a locked payslip/line rejected |
| Preconditions | Run APPROVED |
| Test data | `POST /payroll/runs/{id}:lock`; then attempt payslip-line edit |
| Steps | 1. Lock. 2. Attempt write to locked line. |
| Expected | Lock → LOCKED, child payslips `is_immutable=true`, cycle LOCKED. Write attempt: **409** `ERR-G10-RUN-IMMUTABLE`. |
| Priority | High |

| TC | TC-G10-073 |
|---|---|
| Traces-to | FR-G10-16 AC4; reopen versioning + YTD recompute |
| Type | State-Transition/Financial-Integrity |
| Title | Reopen supersedes originals, creates successor run + version, records lock-to-lock diff |
| Preconditions | June LOCKED, not yet transmitted |
| Test data | `POST /payroll/runs/{id}:reopen {reason}` (Arjun); `GET /payroll/runs/{id}/lock-diff?vs=` |
| Steps | 1. Reopen w/ justification. 2. Re-run successor. 3. GET lock-diff. |
| Expected | Run REOPENED→successor COMPUTING; originals SUPERSEDED; new payslip version; structured lock-to-lock diff persisted in P05 audit; derived YTD recomputed from surviving versions. |
| Priority | High |

| TC | TC-G10-074 |
|---|---|
| Traces-to | FR-G10-16 AC4; `ERR-G10-REOPEN-BLOCKED` (409) |
| Type | Negative |
| Title | Reopen after disbursement transmission is blocked |
| Preconditions | Run LOCKED and bank file TRANSMITTED |
| Test data | `POST /payroll/runs/{id}:reopen` |
| Steps | 1. Reopen post-transmit. |
| Expected | **409** `ERR-G10-REOPEN-BLOCKED`; corrections only via arrears/supplementary/off-cycle. |
| Priority | High |

| TC | TC-G10-075 |
|---|---|
| Traces-to | FR-G10-16 AC5; `ERR-G10-RUN-INFLIGHT` (409) |
| Type | Negative/Idempotency |
| Title | Reopen-successor blocked while another FINAL run in flight |
| Preconditions | Another FINAL run in flight for the cycle |
| Test data | reopen + start successor |
| Steps | 1. Reopen; attempt successor while in-flight. |
| Expected | **409** `ERR-G10-RUN-INFLIGHT`; single-in-flight preserved. |
| Priority | Medium |

### FR-G10-17 — Statutory Outputs (Form-16 from MATCHED, Form-24Q)

| TC | TC-G10-076 |
|---|---|
| Traces-to | FR-G10-17 AC1/AC5; Form-16 tie-out + undeposited block |
| Type | Financial-Integrity |
| Title | Form-16 Part A derives only from MATCHED remittances; TDS ties to ledger |
| Preconditions | FY TDS Σ payslip_lines = ₹33,800; only ₹30,000 MATCHED |
| Test data | `POST /payroll/statutory/form16:generate` |
| Steps | 1. Generate Form-16. |
| Expected | Part B TDS total ties to Σ TDS lines (₹33,800 incl. arrears); Part A reflects only ₹30,000 MATCHED and **flags ₹3,800 deducted-not-matched, blocking premature certification** (AC5). |
| Priority | High |

| TC | TC-G10-077 |
|---|---|
| Traces-to | FR-G10-17 AC2; Form-24Q reconciliation + missing PAN |
| Type | Financial-Integrity/Negative |
| Title | Form-24Q quarterly totals reconcile to monthly TDS; missing PAN flagged |
| Preconditions | Q1 monthly TDS Σ; one employee missing PAN |
| Test data | `POST /payroll/statutory/form24q:generate` |
| Steps | 1. Generate 24Q. |
| Expected | Quarter totals = Σ monthly TDS in quarter; missing-PAN employee raised as exception (`VAL-PAN`); certification is P01 maker-checker. |
| Priority | Medium |

### FR-G10-18 — Parallel/What-If Run & Cost-to-Org Analytics

| TC | TC-G10-078 |
|---|---|
| Traces-to | FR-G10-18 AC1/BR4; scenario isolation + no in-flight lock |
| Type | Functional |
| Title | PARALLEL_WHATIF run writes no live payslips and never blocks live runs |
| Preconditions | Live FINAL run in flight |
| Test data | `POST /payroll/cycles/{id}/runs {run_mode:"PARALLEL_WHATIF"}` |
| Steps | 1. Start what-if concurrent with FINAL. 2. GET comparison. |
| Expected | What-if computes into segregated scenario store labelled "scenario"; does NOT acquire FINAL in-flight lock; live run unaffected; no live disbursement rows. |
| Priority | Medium |

| TC | TC-G10-079 |
|---|---|
| Traces-to | FR-G10-18 AC2/AC4; comparison delta + scope |
| Type | Functional/Authorization |
| Title | Scenario-vs-actual delta exportable; analytics respect org row-scope |
| Preconditions | DA-hike scenario vs actual |
| Test data | `GET /payroll/runs/{id}/comparison?vs=`; `GET /payroll/analytics/cost-to-org?groupBy=org_unit,component` |
| Steps | 1. GET comparison. 2. HOD GETs analytics for another org unit. |
| Expected | Comparison shows per-component/org delta, board-paper export; HOD analytics limited to own org scope (P02 row filter); employer contributions + gratuity accrual in true cost. |
| Priority | Low |

### FR-G10-19 — Statutory Remittance & GL Cost-Journal

| TC | TC-G10-080 |
|---|---|
| Traces-to | FR-G10-19 AC1/AC2; remittance ACCRUED→DEPOSITED→MATCHED |
| Type | Financial-Integrity/State-Transition |
| Title | Remittance accrues deducted_total=Σ lines; challan capture→DEPOSITED; match→MATCHED |
| Preconditions | GPF scheme/period Σ payslip_lines = ₹2,940.00 |
| Test data | `POST /remittances:accrue`; `POST /remittances/{id}/challan`; `POST /{id}:match` (Arjun) |
| Steps | 1. Accrue. 2. Capture challan/CIN/deposit ₹2,940. 3. Match. |
| Expected | `deducted_total=₹2,940.00`; DEPOSITED on challan; MATCHED when deposit ties within tolerance; feeds Form-16 Part A. |
| Priority | High |

| TC | TC-G10-081 |
|---|---|
| Traces-to | FR-G10-19 AC3; OVERDUE + late interest u/s 201/234E |
| Type | Financial-Integrity/Boundary |
| Title | Past-due remittance flags OVERDUE and computes late interest |
| Preconditions | Due date passed without deposit; TDS liability ₹33,800; late 2 months @1.5%/mo |
| Test data | `GET /payroll/remittances?status=OVERDUE` |
| Steps | 1. Query overdue. |
| Expected | Status OVERDUE; late interest = 33,800 × 1.5% × 2 = **₹1,014.00** (per configured 201(1A) formula); surfaces in §12 backlog. |
| Priority | Medium |

| TC | TC-G10-082 |
|---|---|
| Traces-to | FR-G10-19 AC5 (rule #15); GL journal balanced |
| Type | Financial-Integrity |
| Title | GL cost-journal balances (debit=credit); net-pay clearing = disbursed+held |
| Preconditions | Run net ₹85,560, disbursed ₹85,560, held ₹0 |
| Test data | `POST /payroll/runs/{id}/gl-journal:export`; `POST /gl-journals/{id}:acknowledge` (Farah) |
| Steps | 1. Export journal. 2. Finance acknowledges. |
| Expected | `total_debit = total_credit` (else blocked); net-pay clearing line = Σ disbursed + Σ held = **₹85,560.00**; posting-status EXPORTED→POSTED→ACKNOWLEDGED. |
| Priority | High |

| TC | TC-G10-083 |
|---|---|
| Traces-to | FR-G10-19 Failure; SHORT_PAID; ERP reject |
| Type | Negative |
| Title | Partial deposit → SHORT_PAID; ERP rejection → REJECTED + retry |
| Preconditions | Deposit ₹2,000 vs liability ₹2,940 |
| Test data | capture short challan; ERP returns reject |
| Steps | 1. Capture short deposit. 2. Export GL; ERP rejects. |
| Expected | Remittance SHORT_PAID (not MATCHED); GL `REJECTED` with X.3 circuit-broken retry; imbalance blocks posting. |
| Priority | Medium |

### FR-G10-20 — Full-and-Final Settlement (FnF)

| TC | TC-G10-084 |
|---|---|
| Traces-to | FR-G10-20 AC1/AC2; net_settlement equation |
| Type | Financial-Integrity |
| Title | FnF nets all dues/recoveries into one net_settlement figure that ties to recon |
| Preconditions | Retiree: final-month pay ₹85,560, leave encashment ₹5,88,000, gratuity ₹20,00,000, notice-pay recovery ₹0, loan settlement ₹40,800, other recoveries ₹0, final TDS ₹50,000 |
| Test data | `POST /payroll/fnf`; `POST /fnf/{id}:compute` |
| Steps | 1. Initiate. 2. Compute. 3. GET breakdown. |
| Expected | `net_settlement = 85,560 + 5,88,000 + 20,00,000 − 0 − 40,800 − 0 − 50,000 = ₹25,82,760.00`; ties to FnF reconciliation; single consolidated `fnf_settlements` record. |
| Priority | High |

| TC | TC-G10-085 |
|---|---|
| Traces-to | FR-G10-20 AC3; FnF SoD (DDO sanction + Approver, approver ≠ creator) |
| Type | Authorization-SoD/State-Transition |
| Title | FnF requires DDO sanction then Approver approval; approver ≠ creator |
| Preconditions | FnF RECONCILED, Maya created |
| Test data | `POST /fnf/{id}:sanction` (Hari); `POST /fnf/{id}:approve` by Maya then Arjun |
| Steps | 1. Hari sanctions. 2. Maya approves. 3. Arjun approves. |
| Expected | Sanction 200; Maya approve → **403** (creator); Arjun approve → 200 APPROVED (P01). |
| Priority | High |

| TC | TC-G10-086 |
|---|---|
| Traces-to | FR-G10-20 AC4; negative net → RECOVERY_PENDING |
| Type | Boundary/State-Transition |
| Title | Negative FnF net routes to RECOVERY_PENDING, not silent write-off |
| Preconditions | Dues < recoveries (e.g. unrecovered loan > final pay) |
| Test data | net_settlement = −₹15,000 |
| Steps | 1. Compute + approve. |
| Expected | FnF → RECOVERY_PENDING; employee record cannot fully close with open recovery-pending (BR4); recovery pursued via G11 terminal benefits. |
| Priority | High |

| TC | TC-G10-087 |
|---|---|
| Traces-to | FR-G10-20 AC5; E2E gratuity handoff to G11 + SR separation event |
| Type | E2E-Flow |
| Title | FnF settles/handoffs gratuity to G11 and emits separation pay event to G12 |
| Preconditions | FnF APPROVED, PAID |
| Test data | fnf close |
| Steps | 1. Pay. 2. Settle & G11 handoff. |
| Expected | Gratuity handed to G11 with reference + last-pay-drawn/contribution history; FnF → CLOSED; separation pay event posted to G12 `/sr/ingest`. |
| Priority | High |

### FR-G10-21 — Taxable Perquisite Valuation (Rule 3)

| TC | TC-G10-088 |
|---|---|
| Traces-to | FR-G10-21 AC1/AC3/BR2; perquisite raises TDS not net |
| Type | Financial-Integrity |
| Title | Concessional-loan perquisite valued per Rule 3 flows to taxable income only |
| Preconditions | Loan outstanding ₹1,00,000, ref 8%, charged 4% |
| Test data | `POST /payroll/perquisites`; `GET /employees/{id}/perquisites?fy=` |
| Steps | 1. Value perquisite. 2. Inspect payslip + TDS. |
| Expected | monthly perquisite = **₹333.33**; flows to `tax_declarations.perquisite_total`; increases TDS, **does not increase net pay**; shown as non-cash taxable line. |
| Priority | High |

| TC | TC-G10-089 |
|---|---|
| Traces-to | FR-G10-21 AC4; revision on basis change; `ERR-G10-PERQ-REFRATE` (422) |
| Type | Negative/Functional |
| Title | Loan rate/balance change revises perquisite; missing reference rate rejected |
| Preconditions | Reference rate row absent for a period |
| Test data | `POST /payroll/perquisites/{id}:revise` |
| Steps | 1. Revise with balance change (rate row present) → REVISED. 2. Revise for a period with no ref rate. |
| Expected | Step 1: perquisite REVISED, TDS re-projected. Step 2: **422** `ERR-G10-PERQ-REFRATE`. |
| Priority | Medium |

| TC | TC-G10-090 |
|---|---|
| Traces-to | FR-G10-21 BR3; mandatory link enforcement |
| Type | Financial-Integrity/Negative |
| Title | Every is_concessional loan must have a linked perquisite (enforced) |
| Preconditions | Attempt to persist concessional loan with no perquisite link |
| Test data | concessional loan without perquisite |
| Steps | 1. Sanction concessional loan; suppress perquisite. |
| Expected | Blocked; system auto-creates or refuses — no `is_concessional=true` loan may exist without a linked `perquisites` row. |
| Priority | Medium |

### FR-G10-22 — Cross-Module Point-in-Time Snapshot Contract

| TC | TC-G10-091 |
|---|---|
| Traces-to | FR-G10-22 AC1/AC2; snapshot freeze + determinism (rule #16) |
| Type | Financial-Integrity |
| Title | FINAL run freezes snapshot with checksum; re-run reproduces identical payslips |
| Preconditions | June cycle at cutoff |
| Test data | `POST /payroll/cycles/JUN26/snapshot:freeze`; `GET /payroll/snapshots/{id}` |
| Steps | 1. Freeze. 2. Bind + run. 3. Re-run. |
| Expected | `is_frozen=true` + checksum; per-source counts (G01/G03/G06/G09/org); re-run byte-identical (Gross ₹88,700.00, Net ₹85,560.00). |
| Priority | High |

| TC | TC-G10-092 |
|---|---|
| Traces-to | FR-G10-22 AC3; snapshotted bank account used |
| Type | Functional |
| Title | Bank account changed in G01 after cutoff does NOT alter locked run's disbursement account |
| Preconditions | Snapshot has account A1; G01 changes to A2 after cutoff |
| Test data | run + disburse |
| Steps | 1. Change account post-cutoff. 2. Disburse locked run. |
| Expected | Disbursement uses snapshotted A1; later G01 change ignored for this run; PAN/scheme/org-unit likewise snapshotted. |
| Priority | High |

| TC | TC-G10-093 |
|---|---|
| Traces-to | FR-G10-22 AC4; `ERR-G10-SNAPSHOT-FROZEN` (409) + post-cutoff deferral |
| Type | Negative/Functional |
| Title | Mutation after freeze rejected; post-cutoff order recorded as deferral |
| Preconditions | Snapshot frozen; G06 fixation order arrives after cutoff |
| Test data | attempt input mutation; `GET /payroll/snapshots/{id}/deferrals` |
| Steps | 1. Mutate frozen snapshot. 2. GET deferrals. |
| Expected | Mutation: **409** `ERR-G10-SNAPSHOT-FROZEN`. Post-cutoff order appears in `post_cutoff_deferrals`, applied next cycle/arrears (never silently dropped). |
| Priority | High |

### FR-G10-23 — Service Register (SR) Event Posting Contract (deferred build)

| TC | TC-G10-094 |
|---|---|
| Traces-to | FR-G10-23 AC1/BR1; write-port-only |
| Type | API-Contract/E2E-Flow |
| Title | Locking a pay-changing run posts PAY_FIXATION/ANNUAL_INCREMENT only via /sr/ingest |
| Preconditions | Run with pay fixation, LOCKED (or arrear approved) |
| Test data | observe SR posting side-effect |
| Steps | 1. Lock run. 2. Inspect SR post + run console status. |
| Expected | Exactly one event per affected employee posted to `POST /api/v1/sr/ingest`; **never** `/api/v1/sr/events`; **no direct table INSERT**; run console shows POSTED. |
| Priority | High |

| TC | TC-G10-095 |
|---|---|
| Traces-to | FR-G10-23 AC2; `SR_FACT_KEY_REQUIRED` + dedup tuple |
| Type | API-Contract/Negative |
| Title | Every post carries source_module="G10" + dedup tuple + fact_key; missing fact_key rejected |
| Preconditions | SR post assembled |
| Test data | payload with/without `fact_key` |
| Steps | 1. Post with full tuple + fact_key. 2. Post missing fact_key. |
| Expected | Step 1: accepted; tuple `(source_module="G10", source_reference_id, source_event_version)` + `fact_key` + `tenant_id`/`entity_id` present. Step 2: rejected **`SR_FACT_KEY_REQUIRED`**, surfaced as run-post failure (not silently dropped). |
| Priority | High |

| TC | TC-G10-096 |
|---|---|
| Traces-to | FR-G10-23 AC3; idempotent dedup |
| Type | Idempotency |
| Title | Re-posting same dedup tuple is an idempotent no-op (no double-counted service) |
| Preconditions | Event already posted |
| Test data | repost same `(source_module, source_reference_id, source_event_version)` |
| Steps | 1. Repost identical tuple. |
| Expected | G12 dedup → no duplicate ledger row, no double-counted qualifying service. |
| Priority | High |

| TC | TC-G10-097 |
|---|---|
| Traces-to | FR-G10-23 AC4; reversal envelope |
| Type | State-Transition/API-Contract |
| Title | Reopen/supersede posts reversal via /sr/ingest/reversal (supersede-only) |
| Preconditions | Posted event, then run reopened |
| Test data | `POST /api/v1/sr/ingest/reversal {is_reversal:true, reverses_source_reference_id}` |
| Steps | 1. Reopen run. 2. Observe reversal post + repost at new source_event_version. |
| Expected | Reversal posted with `is_reversal=true` + `reverses_source_reference_id` + `*_REVERSAL` partner type; original superseded (never edited/deleted); repost at incremented `source_event_version`. |
| Priority | Medium |

| TC | TC-G10-098 |
|---|---|
| Traces-to | FR-G10-23 AC5/Edge; scoping + G12 unavailable |
| Type | Negative/API-Contract |
| Title | Unscoped post rejected; G12 down maps via X.3 to 412/500 with backoff, no direct-write fallback |
| Preconditions | Post missing tenant/entity; G12 unreachable |
| Test data | unscoped payload; then G12 down |
| Steps | 1. Post without tenant/entity. 2. Post while G12 down. |
| Expected | Step 1: rejected (unscoped). Step 2: X.3 maps to **412 PRECONDITION_FAILED** / **500 INTERNAL** + backoff retry; **never a direct INSERT fallback**; run's "SR-posted" completion blocked until success. |
| Priority | Medium |

### Cross-cutting: multi-tenant, contract & E2E

| TC | TC-G10-099 |
|---|---|
| Traces-to | Platform §0.1; tenancy scoping |
| Type | Authorization-SoD |
| Title | Cross-entity/tenant access denied; unscoped query rejected |
| Preconditions | Maya scoped to ENT-REVENUE |
| Test data | `GET /payroll/runs/{id}` for an ENT-WORKS run; unscoped list query |
| Steps | 1. Maya reads ENT-WORKS run. 2. Issue query with no resolvable tenant scope. |
| Expected | Cross-entity read → **403/404** (no existence leak); unscoped query **rejected**, not defaulted to "all". |
| Priority | High |

| TC | TC-G10-100 |
|---|---|
| Traces-to | Foundation §1/§4; API-contract conformance |
| Type | API-Contract |
| Title | Error envelope, correlation header, cursor pagination, no-503 conformance |
| Preconditions | Any endpoint |
| Test data | trigger 422, 401, 403, 409, 412; list endpoint |
| Steps | 1. Trigger each error. 2. List with `?limit=25`. |
| Expected | Body = `{error:{code,message,field,details}}` and nothing else; `X-Correlation-Id` on every response; list returns `items`+`next_cursor` (limit default 25/max 100); **no 503** anywhere (upstream → 412/500). |
| Priority | High |

| TC | TC-G10-101 |
|---|---|
| Traces-to | Auditor mapping (auth-matrix); read-only |
| Type | Authorization-SoD |
| Title | Auditor reads all payroll/remittance/audit but cannot write |
| Preconditions | Auditor logged in |
| Test data | GET register, remittances, P05 audit; attempt any POST |
| Steps | 1. GET artefacts. 2. Attempt a mutation. |
| Expected | Reads 200 (bank/PAN masked per ceiling); any write → **403 FORBIDDEN** (no parallel write role). |
| Priority | Medium |

| TC | TC-G10-102 |
|---|---|
| Traces-to | Success Criteria §1.6; full pay-cycle E2E |
| Type | E2E-Flow |
| Title | Happy-path cycle: snapshot→run→reconcile→approve→lock→publish→sign→transmit→positive-pay→remit→GL→SR |
| Preconditions | JUN26 cycle, cohort of 3 valid employees |
| Test data | full persona chain |
| Steps | 1. Maya freeze snapshot + FINAL run. 2. Maya recon; Arjun sign-off + approve + lock. 3. Maya publish payslips. 4. Devi sign + transmit. 5. Farah positive-pay debit-confirm. 6. Maya challan capture; Arjun match. 7. Maya GL export; Farah ack. 8. SR events posted on lock. |
| Expected | Run CLOSED only when disbursed+held+failed=net, remittances MATCHED, GL ACKNOWLEDGED, SR posted; each SoD hop enforced (maker≠approver≠disburser≠finance); complete P05 audit trail; zero-variance tie-out. |
| Priority | High |

---

## 3. Traceability Matrix (FR → TC — 0 gaps)

| FR | Title | Test Cases |
|---|---|---|
| FR-G10-01 | Pay component & rules DSL | TC-001, 002, 003, 004, 005, 006 |
| FR-G10-02 | Rate tables & pay matrix (PT-by-state) | TC-007, 008, 009, 010, 011, 012 |
| FR-G10-03 | Salary structure assignment/versioning | TC-013, 014, 015, 016, 017 |
| FR-G10-04 | Monthly run engine (single-in-flight, rounding) | TC-018, 019, 020, 021, 022, 023, 024, 025, 026, 027 |
| FR-G10-05 | Attendance/LWP inputs (subsistence/dies-non) | TC-025, 026, 028, 029, 029B |
| FR-G10-06 | Statutory deductions (GPF/NPS/PT/TDS-YTD) | TC-030, 031, 032, 033, 033B |
| FR-G10-07 | TDS declarations/proofs/pipeline | TC-034, 035, 036, 037, 038, 039 |
| FR-G10-08 | Loans & advances (+concessional perquisite) | TC-040, 041, 042, 043, 044 |
| FR-G10-09 | Recoveries (net floor/s.60/legal gate) | TC-033, 045, 046, 047, 048 |
| FR-G10-10 | Arrears & retrospective (dependent cascade) | TC-049, 050, 051, 052 |
| FR-G10-11 | Supplementary & off-cycle | TC-053, 054 |
| FR-G10-12 | Benefits (leave encashment/gratuity) | TC-055, 056, 057, 058 |
| FR-G10-13 | Payslip generation & reopen versioning | TC-059, 060, 061 |
| FR-G10-14 | Bank disbursement (DSC/positive-pay/holds) | TC-062, 063, 064, 065, 066, 067 |
| FR-G10-15 | Register & reconciliation (tie-out) | TC-068, 069, 070 |
| FR-G10-16 | Approval/lock/reopen-versioning | TC-071, 072, 073, 074, 075 |
| FR-G10-17 | Statutory outputs (Form-16 MATCHED/24Q) | TC-076, 077 |
| FR-G10-18 | Parallel/what-if & cost analytics | TC-078, 079 |
| FR-G10-19 | Remittance loop + GL journal | TC-080, 081, 082, 083 |
| FR-G10-20 | Full-and-final settlement | TC-084, 085, 086, 087 |
| FR-G10-21 | Taxable perquisite (Rule 3) | TC-041, 088, 089, 090 |
| FR-G10-22 | Cross-module snapshot contract | TC-029, 091, 092, 093 |
| FR-G10-23 | SR event posting contract | TC-052, 094, 095, 096, 097, 098 |
| Cross-cutting | Tenancy / API-contract / auditor / full E2E | TC-099, 100, 101, 102 |

All 23 functional requirements (FR-G10-01…23) are covered by ≥1 test case. **Coverage gaps: 0.**

---

## 4. Coverage Summary

### 4.1 By type (primary classification; several TCs are multi-type)

| Type | Count | Test cases |
|---|---|---|
| Functional | 12 | 001, 006, 007, 012, 017, 023, 028, 036, 045, 048, 055, 067, 070, 078 (subset) |
| Boundary | 7 | 010, 022, 024, 035, 057, 081, 086 |
| Negative | 20 | 002, 003, 008, 009, 010, 014, 015, 016, 033B, 039, 042, 046, 058, 059, 069, 074, 083, 089, 090, 098 |
| Authorization-SoD | 12 | 005, 044, 060, 063, 069, 071, 085, 099, 101 (+044,060 auth) |
| Financial-Integrity | 22 | 018, 019, 022, 024, 028, 030, 031, 032, 033, 040, 041, 047, 049, 050, 056, 062, 068, 076, 080, 082, 084, 088 |
| Idempotency | 6 | 020, 021, 053, 064, 096 (+075) |
| State-Transition | 12 | 004, 013, 020, 027, 037, 040, 055, 061, 072, 073, 086, 097 |
| API-Contract | 7 | 029B, 066, 094, 095, 097, 098, 100 |
| E2E-Flow | 6 | 052, 054, 087, 094, 102 (+032 reopen) |

> Note: types overlap by design (e.g. TC-064 is Idempotency + Financial-Integrity; TC-069/071/085 are Negative + Authorization-SoD). The counts above reflect the dominant tag; the per-TC "Type" field lists all applicable tags.

### 4.2 By priority

| Priority | Count |
|---|---|
| High | 62 |
| Medium | 32 |
| Low | 8 |

### 4.3 Totals

| Metric | Value |
|---|---|
| Total test cases | **102** (TC-G10-001…102, incl. TC-029B, TC-033B) |
| FRs covered | **23 of 23** (FR-G10-01…23) |
| Coverage gaps | **0** |
| Error codes exercised | ERR-G10-RULE-EXPR, -DSL-PROPTEST, -RULE-OVERLAP, -RATE-OVERLAP, -RATE-LOCKED, -RATE-NOTFOUND, -PT-STATE, -STRUCT-OVERLAP, -STRUCT-LOCKED, -TAXSLAB-NOTFOUND, -PERQ-REFRATE, -RECOVERY-NET, -RECOVERY-BARRED, -OFFCYCLE-DUP, -RUN-INFLIGHT, -SNAPSHOT-FROZEN, -RECON-TIEOUT, -RECON-UNSIGNED, -RUN-NOTLOCKED, -REOPEN-BLOCKED, -BANK-INVALID, -SIGNING-DOWN, -RESEND-POSPAY, -RUN-IMMUTABLE (24 of 24 G10 codes), + platform SR_FACT_KEY_REQUIRED, ERR-LOADFAIL, ERR-FORBIDDEN, and the 8 standard wire statuses (401/403/404/409/412/422/429/500; no 503). |

### 4.4 Financial-control invariants asserted

| Invariant | TCs |
|---|---|
| `Gross − Deductions = Net`, `Net ≥ 0` | 018, 022, 024 |
| `ROUNDING_ADJUSTMENT = Σ(rounded) − round(Σ)` | 022 |
| Single-in-flight FINAL run | 020, 021, 075 |
| Create→process→validate→approve→lock→reopen (versioned) | 013, 027, 059, 061, 071, 072, 073, 074, 075 |
| Immutability of finalised runs/payslips | 011, 015, 050, 072 |
| Double-payment prevention (positive-pay + batch ref + idempotency) | 021, 064, 065 |
| Reconciliation tie-out `disbursed + held + failed = net` | 062, 067, 068, 069 |
| GL `debit = credit`; net-pay clearing = disbursed+held | 082 |
| Strict 3-way SoD (maker ≠ approver ≠ disburser) | 005, 044, 063, 069, 071, 085, 102 |
| Derived YTD ledger correctness across arrears/reopen | 032, 073 |
| Determinism vs frozen snapshot | 019, 091, 092 |
| SR write-port-only + fact_key + dedup + reversal | 094, 095, 096, 097, 098 |
