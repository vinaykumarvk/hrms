# G08 — Performance Appraisal Management — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | G08 — Performance Appraisal Management (alias `GOV-M08`; EXTEND of PrimeSoft M09) |
| BRD | `/Users/n15318/hrms/docs/brd/v3/G08-performance-appraisal-management.md` (v3.0) |
| API contract | `/Users/n15318/hrms/docs/contracts/openapi/G08.yaml` (OpenAPI 3.1, base `/api/v1`) |
| Error taxonomy | `/Users/n15318/hrms/docs/contracts/error-taxonomy.yaml` (ERR-G08-* + 8-code platform table) |
| State machines | `/Users/n15318/hrms/docs/contracts/state-machines.yaml` (§G08 appraisal_form / goal / representation / pip) |
| Auth matrix | `/Users/n15318/hrms/docs/contracts/auth-matrix.yaml` (§G08 roles, capability flags, action codes) |
| Scope | FR-G08-01 … FR-G08-22 (statutory APAR core + Phase-2 flagged differentiators) |
| Suite version | 1.0 |

### 1.1 Traceability model
Every TC carries **Traces-to** (FR + AC/BR/Edge). Negative TCs assert the exact **error `code`** (carried in `error.code`) **and** the HTTP status of the 8-code platform table. Section 3 maps every FR → TC (0 gaps). Section 4 counts by type/priority.

### 1.2 Platform HTTP status table (assert against these only)
`VALIDATION_FAILED=422` · `UNAUTHENTICATED=401` · `FORBIDDEN=403` · `NOT_FOUND=404` · `CONFLICT=409` · `PRECONDITION_FAILED=412` · `RATE_LIMITED=429` · `INTERNAL=500`. `403`/`404` never leak existence of out-of-scope records (P02). Correlation id is in the `X-Correlation-Id` response header, never a body field.

### 1.3 ERR-G08-* → HTTP quick map
| Code | HTTP | Code | HTTP |
|---|---|---|---|
| ERR-G08-WEIGHTAGE | 422 | ERR-G08-SEALED | 409 |
| ERR-G08-TIERCONFLICT | 409 | ERR-G08-CHAIN | 412 |
| ERR-G08-SELFADJ | 403 | ERR-G08-SIGN | 412 |
| ERR-G08-COI | 403 | ERR-G08-SIGNINVALID | 422 |
| ERR-G08-STATE | 409 | ERR-G08-DUALCTRL | 403 |
| ERR-G08-GRADERANGE | 422 | ERR-G08-TAMPER | 409 |
| ERR-G08-ADVEVID | 422 | ERR-G08-ERRATA | 409 |
| ERR-G08-REPWINDOW | 409 | ERR-G08-ALREADYPOSTED | 409 |
| ERR-G08-DISCLOSE | 409 | ERR-G08-CUSTODYORPHAN | 409 |
| ERR-G08-RATIFY | 409 | ERR-G08-FORCEDDIST | 422 |

### 1.4 Test-environment & data assumptions
- **Multi-tenant:** all requests carry a Bearer JWT with resolved roles + `tenant_id`/`entity_id` scope. Tenant `T1` is the system under test; tenant `T2` exists to prove cross-tenant isolation. Every business row carries `tenant_id`; an unscoped query is **rejected, not defaulted to all**.
- **Personas / roles** (auth-matrix §G08):
  - `EMP-APPRAISEE` — Employee (appraisee, "Me" workspace).
  - `RO1`, `RO2` — Reporting Officers (Manager L1 + flag `g08_appraiser_roles`; resolved by P01 reporting-chain position). RO1 supervises Apr–Oct; RO2 Nov–Mar.
  - `RVO` — Reviewing Officer (skip-level + `g08_appraiser_roles`).
  - `AA` — Accepting Authority (role `g08_accepting_authority`; MFA-enforced).
  - `COMP-AUTH` — Competent Authority (role `g08_competent_authority`; senior to AA, not in chain) + flag `g08_condonation`.
  - `CALIB-MBR` — Calibration Committee Member (flag `g08.calibration-member`).
  - `HR-CELL` — HR Admin + Performance Admin (cycle/custody/disclosure admin).
  - `CUSTODIAN` — role `g08_apar_custodian`.
  - `DUAL-CTRL` — second custodian/HR with flag `g08_dual_control`.
  - `HEIR` — Legal heir / nominee (time-bound individual entitlement).
  - `AUDITOR` — Org-Admin read + read-only entitlement.
  - `SYS-ADMIN` — Org Admin / Platform Super Admin (config only, no self-adjudication).
- **APAR confidentiality:** APAR content is CONFIDENTIAL; served through the P02 PII Protection Ceiling + **field-mask-on-serialization** (masked fields **absent**, not greyed, with a "why hidden" reason). Multi-role callers get the **lowest-privilege** mask (intersection).
- **Signature (DSC/eSign):** MFA step-up (P02) authenticates the session; the **digital signature (E23)** binds the record — distinct controls. Certification/ack/ratify/expunge/No-Report/seal-release/dispose/downgrade all require a VALID signature.
- **Fixtures:** cycle `APAR-2025-26` (fiscal `2025-2026`), template `APAR-OFFR-V2` (PUBLISHED, `requires_dsc=true`, `weightage_policy={performance_sum:100, goal_split_pct:70, competency_split_pct:30, development_in_sum:false}`), scale `APAR-10PT` (min 1.00, max 10.00, `benchmark_grade=6.00`, `adverse_threshold=4.00`, `decimal_places=2`), `min_supervision_months=3.0`, `representation_window_days=30`, `deemed_disclosure_days=15`. Idempotency-Key supplied on all unsafe POSTs; 24h replay window.
- **G12 write-port:** final grade posts via internal façade `POST /g08/forms/{formId}/post-to-sr` → canonical `POST /api/v1/sr/ingest` with `event_type=APAR_FINAL_GRADE`, `event_category=APPRAISAL`, `source_module=G08`, `source_reference_id=form_id`, dedup tuple `(source_module, source_reference_id, source_event_version)`.

---

## 2. Test Cases

### FR-G08-01 — Appraisal Cycle & Template Configuration

#### TC-G08-001
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC1/AC2, BR1 |
| Type | Functional |
| Title | Create and open an appraisal cycle materialises one form per eligible employee |
| Preconditions | `SYS-ADMIN`/`HR-CELL` logged in; template `APAR-OFFR-V2` PUBLISHED; scale `APAR-10PT` ACTIVE; 3 eligible officers with resolvable chains |
| Test data | `POST /g08/cycles` {cycle_code:`APAR-2025-26`, cycle_type:`ANNUAL_APAR`, fiscal_year:`2025-2026`, template_id, rating_scale_id, ordered window dates} then `POST /g08/cycles/{id}/open` with Idempotency-Key `K1` |
| Steps | 1. Create cycle. 2. Open cycle. |
| Expected | 201 on create (status `DRAFT`); 200 on open; status `OPEN`; exactly 3 `appraisal_forms` created, each status `GOALS_PENDING` with RO/RvO/AA resolved from M01 chain; `X-Correlation-Id` echoed |
| Priority | P1 |

#### TC-G08-002
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC2 |
| Type | Data-Integrity |
| Title | Re-opening a cycle with same Idempotency-Key is an idempotent no-op; adds only newly-eligible |
| Preconditions | Cycle from TC-G08-001 OPEN with 3 forms; a 4th officer becomes eligible (mid-cycle joiner) |
| Test data | Repeat `POST /g08/cycles/{id}/open` with same key `K1`; then a fresh key `K2` |
| Steps | 1. Re-open with `K1`. 2. Re-open with `K2` after joiner added. |
| Expected | `K1` replay returns the original result, still 3 forms (no duplicates). `K2` incrementally materialises only the 4th form (total 4); existing 3 untouched |
| Priority | P1 |

#### TC-G08-003
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC1, BR3 |
| Type | Negative |
| Title | Cannot open a cycle bound to a non-PUBLISHED template |
| Preconditions | Cycle bound to a template in DRAFT status |
| Test data | `POST /g08/cycles/{id}/open` |
| Expected | 412 `PRECONDITION_FAILED` (template not PUBLISHED / scale not ACTIVE precondition unmet); no forms created |
| Priority | P1 |

#### TC-G08-004
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC5, BR1 |
| Type | Boundary |
| Title | Cycle calendar dates must be chronologically ordered within the fiscal year |
| Preconditions | `SYS-ADMIN` logged in |
| Test data | Create cycle with `self_appraisal_due` > `ro_due` (violates `self ≤ ro ≤ rvo ≤ aa`), and `goal_window_end` > `appraisal_period_end` |
| Steps | 1. `POST /g08/cycles` with mis-ordered dates. |
| Expected | 422 `VALIDATION_FAILED` (`VAL-DATE`/`VAL-EFFECTIVE`); `field` names the offending date; no cycle persisted |
| Priority | P2 |

#### TC-G08-005
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC4 |
| Type | Functional |
| Title | Eligibility excludes RETIRED/RESIGNED/DECEASED/TERMINATED lifecycle states |
| Preconditions | Population includes one RETIRED and one active officer meeting cadre/min-service |
| Test data | Eligibility rule cadre=`GROUP_A`, min-service 1yr |
| Steps | 1. Preview eligibility. 2. Open. |
| Expected | RETIRED officer excluded from form materialisation; count reflects active-only; preview shows the exclusion |
| Priority | P2 |

#### TC-G08-006
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC6 (R12), ERR-G08-CHAIN |
| Type | State-Transition |
| Title | Apex officer with unconfigured chain-truncation policy is held, never silently dropped |
| Preconditions | An apex officer whose resolved chain cannot satisfy "all distinct"; `chain_truncation_policy` unset |
| Test data | `POST /g08/cycles/{id}/open` |
| Steps | 1. Open cycle covering the apex officer. |
| Expected | 412 `PRECONDITION_FAILED` `ERR-G08-CHAIN`; the apex form flagged `CHAIN_TRUNCATED_UNCONFIGURED` and held; other forms proceed |
| Priority | P1 |

#### TC-G08-007
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC6 (R12) |
| Type | Functional |
| Title | Configured chain-truncation policy (DESIGNATED_ALTERNATE / SINGLE_TIER) resolves apex chain |
| Preconditions | Apex officer; `chain_truncation_policy` = DESIGNATED_ALTERNATE with named alternate |
| Test data | Open cycle |
| Expected | Form materialised with `chain_truncated=true`, `chain_config=DESIGNATED_ALTERNATE`; alternate resolved as the missing tier; no error |
| Priority | P2 |

#### TC-G08-008
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 AC7 (R3), FR-G08-17 |
| Type | State-Transition |
| Title | Officer under active G09 charge is materialised sealed at open |
| Preconditions | One eligible officer has active G09 charge/sub-judice |
| Test data | Open cycle |
| Expected | That officer's form created with `sealed_cover=true`, status `SEALED_COVER`, `sealed_cover_case_ref` set; SEALED appended to `apar_disclosure_log` |
| Priority | P1 |

#### TC-G08-009
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 BR3, FR-G08-22 |
| Type | Negative |
| Title | Cannot change scale/template of a cycle in IN_PROGRESS (errata only) |
| Preconditions | Cycle IN_PROGRESS |
| Test data | `PUT /g08/cycles/{id}` changing `rating_scale_id` |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; correction only via FR-G08-22 errata path |
| Priority | P2 |

---

### FR-G08-02 — Goal / Objective Setting, Weightage & Snapshot-on-Lock

#### TC-G08-010
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC1 (R6) |
| Type | Functional |
| Title | Create a form-less, cross-cycle goal (form_id null, cycle_id null) |
| Preconditions | `EMP-APPRAISEE` logged in; no open form yet |
| Test data | `POST /g08/goals` {goal_type:`OKR_OBJECTIVE`, period_scope:`CROSS_CYCLE`, title:`Digitise land records`, weightage:40} |
| Expected | 201; goal persisted with `form_id`=null, `cycle_id`=null, status `DRAFT`; owned by appraisee |
| Priority | P2 |

#### TC-G08-011
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC2/AC5 (R21), state-machine goals-lock |
| Type | Functional |
| Title | Goals lock succeeds when performance siblings sum to exactly 100 and all APPROVED |
| Preconditions | Form `GOALS_PENDING`; 3 APPROVED performance goals weightages 40/35/25; 1 DEVELOPMENT goal weight 10 |
| Test data | `POST /g08/forms/{formId}/goals/lock` (Idempotency-Key) |
| Steps | 1. Lock goals. |
| Expected | 200; one immutable `form_goal_snapshots` row per approved goal; each goal `snapshotted=true`; form → `GOALS_APPROVED`; DEVELOPMENT goal excluded from the 100 sum but snapshotted separately |
| Priority | P1 |

#### TC-G08-012
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC2, BR1, ERR-G08-WEIGHTAGE |
| Type | Boundary |
| Title | Goal lock rejected when performance weightages != 100 (delta reported) |
| Preconditions | Form `GOALS_PENDING`; performance goals sum to 95.00 |
| Test data | `POST /g08/forms/{formId}/goals/lock` |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-WEIGHTAGE`; `details` shows delta = -5.00; no snapshot written; form stays `GOALS_PENDING` |
| Priority | P1 |

#### TC-G08-013
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC2, BR1 (R21) |
| Type | Boundary |
| Title | DEVELOPMENT goals are excluded from the 100% performance sum |
| Preconditions | Form `GOALS_PENDING`; performance goals = 100.00; one DEVELOPMENT goal weight 15 |
| Test data | Lock goals |
| Expected | 200; lock succeeds; DEVELOPMENT weight not counted in the 100 sum (no `ERR-G08-WEIGHTAGE`); DEVELOPMENT never contributes to numeric grade |
| Priority | P2 |

#### TC-G08-014
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 BR2, AC (self-approve) |
| Type | Authorization |
| Title | Appraisee cannot approve own goal (SoD; only RO approves) |
| Preconditions | `EMP-APPRAISEE` owns a PROPOSED goal |
| Test data | `POST /g08/goals/{goalId}/approve` as `EMP-APPRAISEE` |
| Expected | 403 `FORBIDDEN` (P02 SoD; approve reserved for RO); goal stays PROPOSED |
| Priority | P1 |

#### TC-G08-015
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC3 |
| Type | Negative |
| Title | Cascade that forms a cycle is rejected (VAL-FLOW-NOCYCLE) |
| Preconditions | Goal A parent of B; attempt to set A.parent = B |
| Test data | `PUT /g08/goals/{A}` {parent_goal_id: B} |
| Expected | 422 `VALIDATION_FAILED` (`VAL-FLOW-NOCYCLE`); cascade cycle blocked |
| Priority | P2 |

#### TC-G08-016
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC6, BR5, Edge (appraisee edits snapshot) |
| Type | Data-Integrity |
| Title | Post-lock live-goal edits do not alter the immutable snapshot |
| Preconditions | Form `GOALS_APPROVED` with snapshot written |
| Test data | `PUT /g08/goals/{goalId}` changing weightage 40→50 (via controlled RO revision) then `GET /g08/forms/{formId}/goal-snapshots` |
| Steps | 1. Revise live goal. 2. Read snapshots. |
| Expected | Snapshot row unchanged (still 40); roll-up continues to read snapshot; snapshot append-only; change is P05-audited |
| Priority | P1 |

#### TC-G08-017
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 AC4, goal state-machine PROPOSED→DRAFT |
| Type | State-Transition |
| Title | RO returns a proposed goal; appraisee resubmits |
| Preconditions | Goal PROPOSED; `RO1` logged in |
| Test data | `POST /g08/goals/{goalId}/return` {reason:"tighten metric"} then appraisee re-proposes |
| Expected | 200; goal PROPOSED→DRAFT with comment; appraisee edits and re-proposes → PROPOSED; RO approve → APPROVED |
| Priority | P2 |

---

### FR-G08-03 — Self-Appraisal Submission

#### TC-G08-018
| Field | Value |
|---|---|
| Traces-to | FR-G08-03 AC1/AC3, state-machine self submit |
| Type | Functional |
| Title | Appraisee submits self-appraisal; form advances to RO_ASSESSMENT |
| Preconditions | Form `SELF_APPRAISAL`, goals APPROVED (snapshot exists) |
| Test data | `PUT .../self-appraisal` {achievements:"...", per-goal self ratings in bounds} then `POST .../self-appraisal/submit` |
| Expected | 200; `submitted_at` set, status SUBMITTED; form `SELF_APPRAISAL`→`RO_ASSESSMENT`; RO(s) notified |
| Priority | P1 |

#### TC-G08-019
| Field | Value |
|---|---|
| Traces-to | FR-G08-03 AC1, Edge (submit before goals approved) |
| Type | Negative |
| Title | Self-appraisal submit blocked before goals approved |
| Preconditions | Form `GOALS_PENDING` (no snapshot) |
| Test data | `POST .../self-appraisal/submit` |
| Expected | 412 `PRECONDITION_FAILED` (goals not APPROVED / status gate); no advance |
| Priority | P1 |

#### TC-G08-020
| Field | Value |
|---|---|
| Traces-to | FR-G08-03 AC2, Edge (rating out of bounds) |
| Type | Boundary |
| Title | Per-goal self-rating outside scale bounds rejected |
| Preconditions | Scale `APAR-10PT` (1–10); form SELF_APPRAISAL |
| Test data | `PUT .../self-appraisal` with a self-rating of 12.0 |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-GRADERANGE`; field-level; draft preserved without the bad value |
| Priority | P2 |

#### TC-G08-021
| Field | Value |
|---|---|
| Traces-to | FR-G08-03 AC5 |
| Type | Authorization |
| Title | Self-appraisal is read-only to appraisee after RO begins assessment |
| Preconditions | Form advanced to RO_ASSESSMENT; RO has opened assessment |
| Test data | `PUT .../self-appraisal` as `EMP-APPRAISEE` |
| Expected | 409 `CONFLICT` `ERR-G08-STATE` (locked for self-edit); read still permitted |
| Priority | P2 |

---

### FR-G08-04 — Reporting Officer Assessment (Tier 1, multi-RO, DSC)

#### TC-G08-022
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 AC1/AC4, BR1 |
| Type | Functional |
| Title | RO submits signed part-period assessment with integrity + pen-picture + grade |
| Preconditions | Form RO_ASSESSMENT; `RO1` assigned to period 1 (Apr–Oct, 7 months); VALID DSC available |
| Test data | `PUT .../assessment/reporting?periodId=P1` {integrity_certified:`BEYOND_DOUBT`, pen_picture (≥ min words), grade 7.20} then `POST .../assessment/reporting/submit` {signature_id} |
| Expected | 200; REPORTING `appraisal_assessments` row written with valid `signature_id`; period P1 SUBMITTED |
| Priority | P1 |

#### TC-G08-023
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 AC1, Edge (integrity NOT_CERTIFIED without remark) |
| Type | Negative |
| Title | Integrity not BEYOND_DOUBT without remark is blocked |
| Preconditions | Form RO_ASSESSMENT |
| Test data | `PUT .../assessment/reporting` {integrity_certified:`WATCH`, integrity_remark:null} |
| Expected | 422 `VALIDATION_FAILED` (`VAL-COMMENT`); `field=integrity_remark`; not saved |
| Priority | P1 |

#### TC-G08-024
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 AC6 (R5), ERR-G08-ADVEVID |
| Type | Negative |
| Title | Adverse part-period grade without disclosable evidence is blocked |
| Preconditions | Form RO_ASSESSMENT; grade 3.50 (below `adverse_threshold` 4.00); `adverse_evidence_refs` empty |
| Test data | `POST .../assessment/reporting/submit` {grade:3.50, adverse_evidence_refs:[]} |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-ADVEVID`; anonymous MSF/restricted feedback not accepted as sole basis; no state change |
| Priority | P1 |

#### TC-G08-025
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 BR1, ERR-G08-SELFADJ |
| Type | Authorization |
| Title | RO who is the appraisee on the form is blocked (self-adjudication) |
| Preconditions | Caller resolves as both RO and appraisee on the same form |
| Test data | `POST .../assessment/reporting/submit` |
| Expected | 403 `FORBIDDEN` `ERR-G08-SELFADJ`; blocked at `Authorization.check` |
| Priority | P1 |

#### TC-G08-026
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 AC4, Edge (DSC token failure) |
| Type | Negative |
| Title | RO submit aborts with no state change when DSC signing fails |
| Preconditions | Form RO_ASSESSMENT; X.3 signing provider returns failure |
| Test data | `POST .../assessment/reporting/submit` (signing ceremony fails) |
| Expected | 412 `PRECONDITION_FAILED` `ERR-G08-SIGN`; assessment not committed; form unchanged |
| Priority | P1 |

#### TC-G08-027
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 AC4 (R4), FR-G08-18 |
| Type | Functional |
| Title | Multi-RO: form advances to RVO_REVIEW only when all periods SUBMITTED/NO_REPORT |
| Preconditions | Form has period P1 (`RO1`, 7 mo) and P2 (`RO2`, 5 mo) |
| Test data | Submit P1 only, then submit P2 |
| Steps | 1. Submit P1. 2. Check status. 3. Submit P2. 4. Check status. |
| Expected | After P1 only: form stays RO_ASSESSMENT. After P2: supervision-weighted `provisional_grade` computed; form → RVO_REVIEW; RvO notified |
| Priority | P1 |

#### TC-G08-028
| Field | Value |
|---|---|
| Traces-to | FR-G08-04 BR4 |
| Type | Data-Integrity |
| Title | RO assessment is immutable after RvO begins |
| Preconditions | Form RVO_REVIEW; RvO has opened |
| Test data | `PUT .../assessment/reporting` as `RO1` |
| Expected | 409 `CONFLICT` `ERR-G08-STATE` (anchored by DSC + P05); no mutation |
| Priority | P2 |

---

### FR-G08-05 — Reviewing Officer Review (Tier 2)

#### TC-G08-029
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC1/AC3, state-machine RvO submit |
| Type | Functional |
| Title | RvO concurs and signs; form advances to AA_ACCEPTANCE |
| Preconditions | Form RVO_REVIEW; `RVO` logged in |
| Test data | `POST .../assessment/reviewing/submit` {concurs_with_lower_tier:true, signature_id} |
| Expected | 200; REVIEWING assessment CONCURRED with DSC; aggregated grade carried; form → AA_ACCEPTANCE |
| Priority | P1 |

#### TC-G08-030
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC1, ERR-REASON-REQ |
| Type | Negative |
| Title | RvO variance without reason/reviewed_grade is blocked |
| Preconditions | Form RVO_REVIEW |
| Test data | `POST .../assessment/reviewing/submit` {concurs_with_lower_tier:false, variance_reason:null, reviewed_grade:null} |
| Expected | 422 `VALIDATION_FAILED` (`ERR-REASON-REQ`); `field=variance_reason`; not advanced |
| Priority | P1 |

#### TC-G08-031
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC5, ERR-G08-TIERCONFLICT |
| Type | Authorization |
| Title | RvO who is also an RO on the form is blocked (tier conflict) |
| Preconditions | Caller resolves as RvO and as an RO period assessor on the same form |
| Test data | `POST .../assessment/reviewing/submit` |
| Expected | 409 `CONFLICT` `ERR-G08-TIERCONFLICT`; requires alternate/truncation config |
| Priority | P1 |

#### TC-G08-032
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC5 (R22), ERR-G08-COI |
| Type | Authorization |
| Title | RvO with declared conflict of interest must recuse before acting |
| Preconditions | Form RVO_REVIEW; `RVO` is close relation of appraisee |
| Test data | 1. `POST .../assessment/reviewing/submit` without recusal. 2. `POST /g08/forms/{formId}/recuse` {reason:`RELATION`}. |
| Expected | Step 1: 403 `FORBIDDEN` `ERR-G08-COI`. Step 2: 201 recusal recorded (E22); form routes to alternate RvO |
| Priority | P1 |

#### TC-G08-033
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC4, state-machine RvO return |
| Type | State-Transition |
| Title | RvO returns the form to RO tier with comments |
| Preconditions | Form RVO_REVIEW |
| Test data | `POST .../assessment/reviewing/return` {reason:"pen-picture insufficient"} |
| Expected | 200; form RVO_REVIEW→RO_ASSESSMENT; RO notified; prior RO draft reopened |
| Priority | P2 |

#### TC-G08-034
| Field | Value |
|---|---|
| Traces-to | FR-G08-05 AC6 (R5), BR1 |
| Type | Negative |
| Title | Downward variance crossing adverse threshold requires disclosable evidence |
| Preconditions | Form RVO_REVIEW; RvO sets `reviewed_grade` 3.80 (below 4.00) with no evidence |
| Test data | `POST .../assessment/reviewing/submit` {concurs:false, reviewed_grade:3.80, adverse_evidence_refs:[]} |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-ADVEVID`; evidence mandatory for adverse variance |
| Priority | P2 |

---

### FR-G08-06 — Accepting Authority Acceptance (Tier 3, DSC)

#### TC-G08-035
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC2/AC3, BR2, state-machine certify |
| Type | Functional |
| Title | AA certifies final grade with MFA step-up + DSC; flags derived server-side; opens disclosure |
| Preconditions | Form AA_ACCEPTANCE; `AA` MFA step-up token valid; VALID DSC; not sealed |
| Test data | `POST .../assessment/accepting/certify` {final_grade:7.00, stepup_token, signature_id} |
| Expected | 200; `final_grade_label` derived from scale, `is_adverse=false`, `below_benchmark=false` (all server-side); ACCEPTING CERTIFIED row with `certification_signature_id`; contribution-level mapped; form AA_ACCEPTANCE→DISCLOSURE |
| Priority | P1 |

#### TC-G08-036
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC3, ERR-G08-SIGN |
| Type | Negative |
| Title | Certification without step-up or DSC does not commit |
| Preconditions | Form AA_ACCEPTANCE; missing step-up token / DSC |
| Test data | `POST .../assessment/accepting/certify` without signature_id |
| Expected | 412 `PRECONDITION_FAILED` `ERR-G08-SIGN` (or 401 `UNAUTHENTICATED` on step-up failure); no grade mutation; form unchanged |
| Priority | P1 |

#### TC-G08-037
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC1, BR (deviation reason) |
| Type | Boundary |
| Title | AA deviation from reviewed_grade requires a reason |
| Preconditions | Form AA_ACCEPTANCE; `reviewed_grade`=7.00 |
| Test data | `PUT .../assessment/accepting` {final_grade:8.50, deviation_reason:null} |
| Expected | 422 `VALIDATION_FAILED`; `field=deviation_reason`; not saved |
| Priority | P2 |

#### TC-G08-038
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC1, ERR-G08-GRADERANGE |
| Type | Boundary |
| Title | Final grade outside scale bounds rejected |
| Preconditions | Scale 1–10; form AA_ACCEPTANCE |
| Test data | `POST .../assessment/accepting/certify` {final_grade:11.00} |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-GRADERANGE`; not certified |
| Priority | P2 |

#### TC-G08-039
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 BR4 (R3), FR-G08-17, ERR-G08-SEALED |
| Type | Negative |
| Title | AA cannot certify a sealed-cover form to FINALISED/POSTED |
| Preconditions | Form `sealed_cover=true`, status SEALED_COVER |
| Test data | `POST .../assessment/accepting/certify` |
| Expected | 409 `CONFLICT` `ERR-G08-SEALED`; assessment may be held but form parks in SEALED_COVER |
| Priority | P1 |

#### TC-G08-040
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC5/AC6 (R1) |
| Type | Data-Integrity |
| Title | Certified grade is immutable except via ratified calibration or representation |
| Preconditions | Form DISCLOSURE (certified) |
| Test data | `PUT .../assessment/accepting` changing `final_grade` |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; direct grade edit rejected post-certification |
| Priority | P1 |

#### TC-G08-041
| Field | Value |
|---|---|
| Traces-to | FR-G08-06 AC4 (R22) |
| Type | Authorization |
| Title | AA who is RO/RvO/appraisee on the form is blocked |
| Preconditions | Caller resolves as AA and RvO on same form |
| Test data | `POST .../assessment/accepting/certify` |
| Expected | 409 `CONFLICT` `ERR-G08-TIERCONFLICT` (or 403 `ERR-G08-COI` if declared COI); not certified |
| Priority | P2 |

---

### FR-G08-07 — Rating Scales & Numeric Grade Computation

#### TC-G08-042
| Field | Value |
|---|---|
| Traces-to | FR-G08-07 AC1, Edge (overlapping bands) |
| Type | Boundary |
| Title | Rating scale bands must be contiguous, non-overlapping, covering [min,max] |
| Preconditions | `SYS-ADMIN` logged in |
| Test data | `POST /g08/rating-scales` with bands [1–4],[4–7] (overlap at 4) leaving 7–10 uncovered |
| Expected | 422 `VALIDATION_FAILED`; `details` names offending band index; scale not created |
| Priority | P2 |

#### TC-G08-043
| Field | Value |
|---|---|
| Traces-to | FR-G08-07 AC2, BR1 (R21) |
| Type | Functional |
| Title | Grade preview computes two-part roll-up (goal_split·goalScore + comp_split·compScore) from snapshots |
| Preconditions | Form with locked snapshots; policy split 70/30 |
| Test data | `POST /g08/forms/{formId}/grade/preview` {section/goal inputs} |
| Expected | 200; goalScore = Σ(snapshot_goal_score×snapshot_weightage)/100; final = 0.70·goalScore + 0.30·compScore, rounded to 2 dp; DEVELOPMENT excluded; label resolved from bands |
| Priority | P1 |

#### TC-G08-044
| Field | Value |
|---|---|
| Traces-to | FR-G08-07 BR1 |
| Type | Boundary |
| Title | Weightage policy split must sum to 100 |
| Preconditions | Creating template weightage policy |
| Test data | `POST /g08/templates` {goal_split_pct:70, competency_split_pct:40} |
| Expected | 422 `VALIDATION_FAILED` (split≠100); template not published |
| Priority | P2 |

#### TC-G08-045
| Field | Value |
|---|---|
| Traces-to | FR-G08-07 AC3 |
| Type | Boundary |
| Title | Benchmark and adverse thresholds derive below_benchmark / is_adverse correctly at boundaries |
| Preconditions | Scale `benchmark_grade=6.00`, `adverse_threshold=4.00` |
| Test data | Preview grades 6.00, 5.99, 4.00, 3.99 |
| Expected | 6.00 → below_benchmark=false; 5.99 → below_benchmark=true; 4.00 → is_adverse=false; 3.99 → is_adverse=true (below-threshold is adverse) |
| Priority | P1 |

#### TC-G08-046
| Field | Value |
|---|---|
| Traces-to | FR-G08-07 AC4 |
| Type | Negative |
| Title | A scale in use by an active cycle is RETIRE-locked, not edited |
| Preconditions | Scale bound to an active cycle |
| Test data | `PUT /g08/rating-scales/{scaleId}` changing bands |
| Expected | 409 `CONFLICT`; edit rejected; new ACTIVE version required (historical forms keep original via snapshot) |
| Priority | P2 |

---

### FR-G08-08 — Mandatory Disclosure & Representation / Appeal

#### TC-G08-047
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC1 (R7), state-machine disclose |
| Type | Functional |
| Title | HR discloses the entire APAR (mandatory, full); no non-disclosure branch |
| Preconditions | Form DISCLOSURE (certified); `HR-CELL` logged in |
| Test data | `POST /g08/forms/{formId}/disclose` {channel:`HYBRID`} |
| Expected | 200; form → DISCLOSED; `dispatched_at`/`disclosed_at` set; DISPATCHED + DISCLOSED appended to `apar_disclosure_log`; appraisee notified (X.2); the full report (every grading/remark) disclosed |
| Priority | P1 |

#### TC-G08-048
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC2 (R8) |
| Type | Functional |
| Title | Acknowledgement (eSign) starts the representation window per clock-start config |
| Preconditions | Form DISCLOSED; `representation_clock_start=ACKNOWLEDGEMENT`; `EMP-APPRAISEE` |
| Test data | `POST /g08/forms/{formId}/acknowledge` {signature_id} |
| Expected | 200; `acknowledged_at` set; `representation_window_start_at`=ack time; `_end_at`=+30 days; both dispatch and ack timestamps recorded |
| Priority | P1 |

#### TC-G08-049
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC2 (R8), JOB-M09-AUTOACK |
| Type | State-Transition |
| Title | Deemed-disclosure on non-acknowledgement still opens the representation window |
| Preconditions | Form DISCLOSED; no ack after `deemed_disclosure_days=15` |
| Test data | Advance clock 15 days; `JOB-M09-AUTOACK` runs |
| Expected | Deemed-disclosure recorded; window opens from dispatch; event logged; no ack timestamp but window active |
| Priority | P2 |

#### TC-G08-050
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC3, BR2 |
| Type | Functional |
| Title | Appraisee files a representation within the window contesting a disclosed adverse remark |
| Preconditions | Form DISCLOSED with adverse remark; window open |
| Test data | `POST /g08/forms/{formId}/representations` {grounds, contested_items:[disclosed remark id], supporting_doc_ids} |
| Expected | 201; representation FILED; `sla_due_at`/`disposal_deadline_at` set; form → REPRESENTATION; authority notified |
| Priority | P1 |

#### TC-G08-051
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC3, ERR-G08-REPWINDOW |
| Type | Negative |
| Title | Representation filed after the window elapsed is rejected (condonation required) |
| Preconditions | Window `_end_at` in the past; not condoned |
| Test data | `POST /g08/forms/{formId}/representations` |
| Expected | 409 `CONFLICT` `ERR-G08-REPWINDOW`; `is_late` path requires condonation |
| Priority | P1 |

#### TC-G08-052
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC3 (R20) |
| Type | Functional |
| Title | Condonation authority condones a late representation, opening review |
| Preconditions | Late representation exists; `COMP-AUTH` holds flag `g08_condonation` |
| Test data | `POST /g08/representations/{repId}/condone` {reason} |
| Expected | 200; `condoned=true`, `condonation_authority_id`/reason recorded; representation FILED→UNDER_REVIEW |
| Priority | P2 |

#### TC-G08-053
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC4, BR3, BR4 |
| Type | Functional |
| Title | Competent authority expunges an adverse remark (DSC), grade/flags recomputed, re-disclosed |
| Preconditions | Representation UNDER_REVIEW; `COMP-AUTH` senior to AA, not in chain, no COI |
| Test data | `POST /g08/representations/{repId}/decide` {decision:`EXPUNGED`, reason, signature_id} |
| Expected | 200; adverse remark nullified; `is_adverse`/`below_benchmark` recomputed; DSC-signed; form returns to FINALISED with new signed grade snapshot (prior preserved); re-disclosed if changed |
| Priority | P1 |

#### TC-G08-054
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC4, ERR-G08-SIGN |
| Type | Negative |
| Title | Representation decision without a DSC does not commit |
| Preconditions | Representation UNDER_REVIEW |
| Test data | `POST /g08/representations/{repId}/decide` {decision:`MODIFIED`, revised_grade:5.00, signature_id:null} |
| Expected | 412 `PRECONDITION_FAILED` `ERR-G08-SIGN`; no grade change |
| Priority | P2 |

#### TC-G08-055
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC5 (R20), state-machine escalate |
| Type | State-Transition |
| Title | Rejected representation escalates to an external tribunal (CAT) — chain closed, not dangling |
| Preconditions | Representation DECIDED = REJECTED |
| Test data | `POST /g08/representations/{repId}/escalate` {external_reference:`CAT`, external_ref_no:"OA/123/2026"} |
| Expected | 200; `escalation_level` incremented; `external_reference`/`external_ref_no` recorded; status ESCALATED |
| Priority | P2 |

#### TC-G08-056
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 Edge (multiple representations) |
| Type | Negative |
| Title | A second representation is blocked until the first is decided |
| Preconditions | One representation already FILED/UNDER_REVIEW |
| Test data | `POST /g08/forms/{formId}/representations` (second) |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; sequenced; second allowed only after first DECIDED |
| Priority | P2 |

#### TC-G08-057
| Field | Value |
|---|---|
| Traces-to | FR-G08-08 AC6, FR-G08-15 |
| Type | PII-Confidentiality |
| Title | Every disclosure/view/download/denied access is recorded in the disclosure log |
| Preconditions | Form DISCLOSED; appraisee views and downloads |
| Test data | `GET /g08/forms/{formId}/disclosure-log?limit=25` |
| Expected | Append-only ledger shows DISPATCHED, DISCLOSED, VIEWED, DOWNLOADED with actor/role/IP/timestamp; cursor-paginated; P05 + OPEN-PLAT-03 anchored |
| Priority | P2 |

---

### FR-G08-09 — Calibration as Ratified Recommendation (Phase-2 flag)

#### TC-G08-058
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC2 (R1), BR1 |
| Type | Functional |
| Title | Committee proposes a recommendation with mandatory rationale; never writes final_grade |
| Preconditions | Flag `g08.calibration` on; session IN_SESSION; `CALIB-MBR` |
| Test data | `POST /g08/calibration/sessions/{id}/recommendations` {form_id, proposed_grade:7.50, rationale:"comparability"} |
| Expected | 201; recommendation stored; certified `final_grade` unchanged (committee cannot mutate it) |
| Priority | P1 |

#### TC-G08-059
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC4 (R1), ERR-G08-RATIFY |
| Type | Negative |
| Title | Applying a calibration change without competent-authority ratification is blocked |
| Preconditions | Recommendation voted but not ratified |
| Test data | Attempt to apply the recommended grade directly (unratified) |
| Expected | 409 `CONFLICT` `ERR-G08-RATIFY`; grade changes only via ratified path |
| Priority | P1 |

#### TC-G08-060
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC4 (R1) |
| Type | Functional |
| Title | AA/competent authority ratifies (step-up + DSC), creating a signed calibration_adjustment |
| Preconditions | Recommendation RECOMMENDED; `AA` step-up + DSC |
| Test data | `POST /g08/calibration/recommendations/{recId}/ratify` {stepup_token, signature_id} |
| Expected | 200; `calibration_adjustments` row created; `pre_calibration_grade` preserved; `final_grade` updated to ratified value; flags recomputed; `calibrated=true` |
| Priority | P1 |

#### TC-G08-061
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC6 (R2), ERR-G08-FORCEDDIST |
| Type | Negative |
| Title | Forced distribution method is unavailable; calibration is a recommendation, not forced-distribution |
| Preconditions | Session creation |
| Test data | `POST /g08/calibration/sessions` {method:`FORCED_DISTRIBUTION`} |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-FORCEDDIST`; only COMMITTEE_REVIEW/NORMALISATION (BELL_CURVE only if flagged); grading absolute |
| Priority | P1 |

#### TC-G08-062
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC3 (R2) |
| Type | Functional |
| Title | Distribution view shows current vs target as diagnostic only — no quota enforced |
| Preconditions | Session with population |
| Test data | `GET /g08/calibration/sessions/{id}/distribution` |
| Expected | 200; current vs target (`VAL-DISTRIB`) labelled diagnostic; no action auto-applies or pressures any grade |
| Priority | P2 |

#### TC-G08-063
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 AC5 (R22), ERR-G08-COI |
| Type | Authorization |
| Title | A member who is RO/RvO/AA/appraisee (or declared COI) for a form cannot vote |
| Preconditions | `CALIB-MBR` is the RO of the form under recommendation |
| Test data | `POST /g08/calibration/recommendations/{recId}/vote` |
| Expected | 403 `FORBIDDEN` `ERR-G08-COI`; recusal recorded (E22); vote not counted |
| Priority | P2 |

---

### FR-G08-10 — Continuous Feedback & Check-Ins (Phase-2 flag)

#### TC-G08-064
| Field | Value |
|---|---|
| Traces-to | FR-G08-10 AC1, BR4 |
| Type | PII-Confidentiality |
| Title | Feedback visibility mask: PRIVATE_TO_SUBJECT hidden from manager |
| Preconditions | Flag `g08.continuous-feedback` on; feedback with `visibility=PRIVATE_TO_SUBJECT` |
| Test data | `GET /g08/feedback?subjectId=EMP` as `RO1` |
| Expected | Private-to-subject feedback absent from RO serialization (field-mask); subject sees it; P02-enforced |
| Priority | P2 |

#### TC-G08-065
| Field | Value |
|---|---|
| Traces-to | FR-G08-10 AC2, Edge (progress > 100) |
| Type | Boundary |
| Title | Goal check-in progress clamped/validated at VAL-ACHV bounds |
| Preconditions | Goal exists |
| Test data | `POST /g08/goals/{goalId}/checkins` {progress_pct:130} |
| Expected | 422 `VALIDATION_FAILED` (`VAL-ACHV`); does not auto-change the final rating |
| Priority | P3 |

#### TC-G08-066
| Field | Value |
|---|---|
| Traces-to | FR-G08-10 BR4, FR-G08-04 (R5) |
| Type | Negative |
| Title | MANAGER_ONLY/PRIVATE feedback cannot be the sole basis of an adverse remark |
| Preconditions | Only non-disclosable feedback backs an adverse RO grade |
| Test data | RO submits adverse grade citing only MANAGER_ONLY feedback as evidence |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-ADVEVID`; restricted feedback rejected as sole basis (blocked at FR-04) |
| Priority | P2 |

---

### FR-G08-11 — Multi-Source / 360 Feedback (Phase-2 flag)

#### TC-G08-067
| Field | Value |
|---|---|
| Traces-to | FR-G08-11 AC2, BR1 |
| Type | Functional |
| Title | Anonymous MSF aggregated only at/above minimum-N; below-N buckets suppressed |
| Preconditions | Flag `g08.msf-360` on; min-N=3; 2 peer responses only |
| Test data | `GET /g08/forms/{formId}/360/summary` |
| Expected | Peer bucket shows "insufficient responses" (suppressed, <3); no attributable individual data |
| Priority | P2 |

#### TC-G08-068
| Field | Value |
|---|---|
| Traces-to | FR-G08-11 AC1/AC3 |
| Type | Negative |
| Title | Appraisee cannot self-rate; a rater submits exactly one response per request |
| Preconditions | 360 request assigned to a rater who already responded |
| Test data | 1. Nominate appraisee as own rater. 2. `POST /g08/360/requests/{id}/respond` twice. |
| Expected | Step 1: 422 `VALIDATION_FAILED` (self-rating blocked). Step 2: second submit 409 `CONFLICT` (one-per-request) |
| Priority | P2 |

#### TC-G08-069
| Field | Value |
|---|---|
| Traces-to | FR-G08-11 AC4, BR3, FR-G08-04 (R5) |
| Type | Negative |
| Title | MSF aggregate alone cannot substantiate an adverse statutory entry |
| Preconditions | Only MSF aggregate backs an adverse RO grade |
| Test data | RO submits adverse grade citing only MSF aggregate |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-ADVEVID`; MSF informs but is not sole adverse basis |
| Priority | P2 |

---

### FR-G08-12 — Competency Assessment & Skill-Gap → Training (G07)

#### TC-G08-070
| Field | Value |
|---|---|
| Traces-to | FR-G08-12 AC2 |
| Type | Functional |
| Title | System derives gap and gap_severity from required vs assessed levels |
| Preconditions | Competency required_level=4; RO assesses assessed_level=2 |
| Test data | `PUT /g08/forms/{formId}/competencies` {competency_id, assessed_level:2} |
| Expected | 200; `gap=2`; `gap_severity` per bands (e.g. MODERATE/CRITICAL); self level shown alongside |
| Priority | P2 |

#### TC-G08-071
| Field | Value |
|---|---|
| Traces-to | FR-G08-12 AC3, BR1 |
| Type | Functional |
| Title | MODERATE/CRITICAL gap creates a G07 training nomination and stores its id |
| Preconditions | Competency assessment with CRITICAL gap; active G07 training mapped |
| Test data | `POST /g08/forms/{formId}/competencies/{compId}/nominate` |
| Expected | 201; G07 nomination created; `training_nomination_id` stored on the competency assessment |
| Priority | P2 |

---

### FR-G08-13 — Performance Improvement Plan (PIP)

#### TC-G08-072
| Field | Value |
|---|---|
| Traces-to | FR-G08-13 AC1/AC3, state-machine pip activate |
| Type | Functional |
| Title | PIP created with ≥1 milestone; RvO concurrence required to activate |
| Preconditions | Below-benchmark outcome; `RO1` creates PIP; `RVO` concurs |
| Test data | `POST /g08/pips` {reason, dates, success_criteria, milestones:[…]} then `POST /g08/pips/{id}/activate` |
| Expected | 201 PIP DRAFT; activate → ACTIVE only after RvO concurrence (P01 maker-checker) |
| Priority | P2 |

#### TC-G08-073
| Field | Value |
|---|---|
| Traces-to | FR-G08-13 AC3, Edge (activate without concurrence) |
| Type | Negative |
| Title | PIP activation without RvO concurrence is blocked |
| Preconditions | PIP DRAFT; no RvO concurrence |
| Test data | `POST /g08/pips/{id}/activate` |
| Expected | 403 `FORBIDDEN`; activation gated on concurrence |
| Priority | P2 |

#### TC-G08-074
| Field | Value |
|---|---|
| Traces-to | FR-G08-13 Edge (overlapping active PIPs) |
| Type | Negative |
| Title | A second overlapping active PIP for the same employee is blocked |
| Preconditions | One ACTIVE PIP for the employee |
| Test data | `POST /g08/pips` (second, overlapping) then activate |
| Expected | 409 `CONFLICT`; single-active-per-employee enforced |
| Priority | P3 |

---

### FR-G08-14 — Posting to G12 SR & G06 Eligibility Feed

#### TC-G08-075
| Field | Value |
|---|---|
| Traces-to | FR-G08-14 AC1/AC2 |
| Type | Functional |
| Title | Finalise then post APAR_FINAL_GRADE to canonical /sr/ingest (event_category APPRAISAL) |
| Preconditions | Form FINALISED (disclosed, representation resolved, `sealed_cover=false`) |
| Test data | `POST /g08/forms/{formId}/finalise` then `POST /g08/forms/{formId}/post-to-sr` (Idempotency-Key) |
| Expected | 200; façade relays to `POST /api/v1/sr/ingest` with {event_type:`APAR_FINAL_GRADE`, event_category:`APPRAISAL`, source_module:`G08`, source_reference_id:form_id, source_event_version, final_grade, is_adverse, chain_anchor_ref, fact_key:null}; `posted_to_sr=true`; form → POSTED; POSTED appended to disclosure log |
| Priority | P1 |

#### TC-G08-076
| Field | Value |
|---|---|
| Traces-to | FR-G08-14 AC2, ERR-G08-ALREADYPOSTED |
| Type | Data-Integrity |
| Title | Re-posting is an idempotent no-op keyed on the G12 dedup tuple |
| Preconditions | Form already POSTED |
| Test data | `POST /g08/forms/{formId}/post-to-sr` again |
| Expected | 409 `CONFLICT` `ERR-G08-ALREADYPOSTED` (or 200 no-op); dedup on `(source_module=G08, source_reference_id=form_id, source_event_version)`; no duplicate SR event |
| Priority | P1 |

#### TC-G08-077
| Field | Value |
|---|---|
| Traces-to | FR-G08-14 AC1/AC3, BR4 (R3), ERR-G08-SEALED |
| Type | Negative |
| Title | Sealed-cover form is blocked from posting and its G06 feed is suppressed |
| Preconditions | Form `sealed_cover=true` |
| Test data | `POST /g08/forms/{formId}/post-to-sr` |
| Expected | 409 `CONFLICT` `ERR-G08-SEALED`; no SR event; G06 eligibility feed suppressed |
| Priority | P1 |

#### TC-G08-078
| Field | Value |
|---|---|
| Traces-to | FR-G08-14 AC3, BR2 |
| Type | Data-Integrity |
| Title | A grade modified by representation after posting emits a corrective SR event (never an edit) |
| Preconditions | Form POSTED; representation later modifies grade above benchmark |
| Test data | Decide representation MODIFIED post-posting |
| Expected | A new corrective `service_register_events` referencing the original (`VAL-SR-EVENT`); G06 feed updated by corrective event; original event never edited |
| Priority | P1 |

#### TC-G08-079
| Field | Value |
|---|---|
| Traces-to | FR-G08-14 AC5 |
| Type | API-Contract |
| Title | SR posting queues via X.3 outbox when G12/G06 unavailable; no data loss |
| Preconditions | G12 upstream returns unavailable |
| Test data | `POST /g08/forms/{formId}/post-to-sr` |
| Expected | 412 `PRECONDITION_FAILED` (upstream retryable) or queued-accepted; act queued to outbox + dead-letter and retried; no partial commit |
| Priority | P2 |

---

### FR-G08-15 — Custody, Confidentiality, Tamper-Evidence, Access Control

#### TC-G08-080
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC1 (R17), auth-matrix |
| Type | PII-Confidentiality |
| Title | APAR read is field-masked per caller tier; absent fields carry a "why hidden" reason |
| Preconditions | Confidential APAR; caller with partial visibility |
| Test data | `GET /g08/forms/{formId}` as a lower-tier caller |
| Expected | 200; fields the tier may not see are **absent** (not greyed) with a plain-language reason code; multi-role caller gets the lowest-privilege (intersection) mask |
| Priority | P1 |

#### TC-G08-081
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC1, BR (scope safety) |
| Type | Authorization |
| Title | Unauthorised APAR read returns FORBIDDEN and logs ACCESS_DENIED without leaking existence |
| Preconditions | Caller has no scope on the form (different chain/org) |
| Test data | `GET /g08/forms/{formId}` |
| Expected | 403 `FORBIDDEN` (or 404 for out-of-scope, indistinguishable from absent); ACCESS_DENIED appended to log + `security_audit_log`; no content leaked |
| Priority | P1 |

#### TC-G08-082
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC3 (R11) |
| Type | Data-Integrity |
| Title | /verify confirms OPEN-PLAT-03 chain integrity over the form's P05 events |
| Preconditions | Form with intact disclosure/custody chain |
| Test data | `GET /g08/forms/{formId}/access-log/verify` |
| Expected | 200; chain verified OK; anchored heads reported |
| Priority | P1 |

#### TC-G08-083
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 Edge (chain mismatch), ERR-G08-TAMPER |
| Type | Data-Integrity |
| Title | /verify raises tamper error when the chain does not reconcile |
| Preconditions | Injected tamper / broken hash chain |
| Test data | `GET /g08/forms/{formId}/access-log/verify` |
| Expected | 409 `CONFLICT` `ERR-G08-TAMPER`; auditor alerted; ledger unmodified |
| Priority | P1 |

#### TC-G08-084
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC7 (R23), ERR-G08-DUALCTRL |
| Type | Authorization |
| Title | Retention disposal by a single person is blocked (dual-control required) |
| Preconditions | Form past retention; `CUSTODIAN` as maker only |
| Test data | `POST /g08/forms/{formId}/dispose` (maker) then attempt to also approve as same person |
| Expected | 403 `FORBIDDEN` `ERR-G08-DUALCTRL`; distinct checker (`DUAL-CTRL`) + step-up + DSC required for `/dispose/approve` |
| Priority | P1 |

#### TC-G08-085
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC7, dual-control happy path |
| Type | Functional |
| Title | Disposal completes with distinct maker + checker + step-up + DSC |
| Preconditions | Form past retention; `CUSTODIAN` maker, `DUAL-CTRL` checker |
| Test data | `POST .../dispose` (maker) then `POST .../dispose/approve` (checker, step-up + signature_id) |
| Expected | 200; disposal executed; two distinct principals recorded; DSC-signed; P05 audited |
| Priority | P2 |

#### TC-G08-086
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC5 (R15) |
| Type | Functional |
| Title | Legal-heir time-boxed read access granted on death; HEIR_ACCESS logged |
| Preconditions | Deceased officer's APAR; verified heir claimant |
| Test data | `POST /g08/forms/{formId}/heir-access` {heir, expiry} then `HEIR` reads |
| Expected | 200; time-bound entitlement granted; HEIR_ACCESS appended; heir read masked per statute; unverified claimant blocked |
| Priority | P2 |

#### TC-G08-087
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 BR6 (R15) |
| Type | Negative |
| Title | DPDP erasure request against an in-retention APAR is refused with legal basis |
| Preconditions | APAR within statutory retention |
| Test data | Erasure request against the form |
| Expected | Refused; legal basis recorded (statutory retention overrides erasure); P05 redaction-marker basis logged |
| Priority | P2 |

#### TC-G08-088
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 AC4, Edge (orphan custody), ERR-G08-CUSTODYORPHAN |
| Type | Negative |
| Title | Custody transfer to an office with no resolvable custodian is escalated, not dropped |
| Preconditions | Officer moved (G05) to office lacking a custodian |
| Test data | `POST /g08/forms/{formId}/custody-transfer` |
| Expected | 409 `CONFLICT` `ERR-G08-CUSTODYORPHAN`; escalated; content unchanged; never silently dropped |
| Priority | P2 |

#### TC-G08-089
| Field | Value |
|---|---|
| Traces-to | FR-G08-15 BR2, auth-matrix (Auditor) |
| Type | Authorization |
| Title | Auditor has read + log + verify but cannot mutate |
| Preconditions | `AUDITOR` logged in |
| Test data | `GET /g08/forms/{formId}`, `GET .../access-log/verify`, then `POST .../dispose` |
| Expected | Reads/verify 200; any mutation → 403 `FORBIDDEN` |
| Priority | P2 |

---

### FR-G08-16 — Performance & Bias-Disparity Analytics

#### TC-G08-090
| Field | Value |
|---|---|
| Traces-to | FR-G08-16 AC1/AC5 |
| Type | Functional |
| Title | Distribution analytics show pre- vs post-calibration; endpoints cursor-bounded |
| Preconditions | Cycle with certified + calibrated forms; `HR-CELL` |
| Test data | `GET /g08/analytics/distribution?limit=25&cursor=` |
| Expected | 200; pre vs post + current vs target (diagnostic); cursor-paginated; freshness ≤ 15 min |
| Priority | P2 |

#### TC-G08-091
| Field | Value |
|---|---|
| Traces-to | FR-G08-16 AC3/AC4 (R13), BR4 |
| Type | PII-Confidentiality |
| Title | Bias-disparity view suppresses protected-attribute buckets below minimum-N |
| Preconditions | A gender/cadre bucket with < min-N members |
| Test data | `GET /g08/analytics/bias-disparity?dimension=gender` |
| Expected | 200; adverse-rate/below-benchmark/grade-mean by dimension over time; sub-min-N buckets suppressed; no individual protected attribute exposed |
| Priority | P2 |

#### TC-G08-092
| Field | Value |
|---|---|
| Traces-to | FR-G08-16 BR1, AC4 |
| Type | Authorization |
| Title | Analytics are P02-scoped; no drill-down beyond caller's authorised population |
| Preconditions | `RO1` (team scope) requests org-wide analytics |
| Test data | `GET /g08/analytics/skew` as `RO1` |
| Expected | Results limited to RO1's authorised population; unauthorised drill-down denied (403) |
| Priority | P2 |

---

### FR-G08-17 — Sealed Cover Procedure

#### TC-G08-093
| Field | Value |
|---|---|
| Traces-to | FR-G08-17 AC1/AC2, state-machine seal |
| Type | State-Transition |
| Title | G09 charge seals the form; FINALISED/POSTED blocked and G06 feed suppressed |
| Preconditions | Form in-flight; G09 raises active charge |
| Test data | G09 charge event / `POST /g08/forms/{formId}/seal` |
| Expected | `sealed_cover=true`, reason/case_ref/`sealed_at` set, status SEALED_COVER; SEALED appended; finalise/post blocked; G06 feed suppressed |
| Priority | P1 |

#### TC-G08-094
| Field | Value |
|---|---|
| Traces-to | FR-G08-17 AC3/AC4, BR1 |
| Type | Functional |
| Title | Competent authority releases sealed cover with DSC on G09 conclusion; lifecycle resumes |
| Preconditions | Form SEALED_COVER; G09 concluded; `COMP-AUTH` |
| Test data | `POST /g08/forms/{formId}/seal/release` {g09_outcome_ref, signature_id} |
| Expected | 200; `SEALED_COVER_RELEASE` signature; UNSEALED appended; `sealed_released_at` set; form resumes → DISCLOSURE (prior status); eligibility re-evaluated per outcome |
| Priority | P1 |

#### TC-G08-095
| Field | Value |
|---|---|
| Traces-to | FR-G08-17 BR1 |
| Type | Authorization |
| Title | Only the Competent Authority (not RO/RvO) may release a sealed cover |
| Preconditions | Form SEALED_COVER; `RO1` attempts release |
| Test data | `POST /g08/forms/{formId}/seal/release` as `RO1` |
| Expected | 403 `FORBIDDEN`; release reserved for Competent Authority |
| Priority | P2 |

#### TC-G08-096
| Field | Value |
|---|---|
| Traces-to | FR-G08-17 Edge (release without G09 ref / DSC) |
| Type | Negative |
| Title | Release without G09 conclusion reference or DSC is rejected |
| Preconditions | Form SEALED_COVER |
| Test data | 1. release without `g09_outcome_ref`. 2. release without `signature_id`. |
| Expected | Case 1: 422 `VALIDATION_FAILED`. Case 2: 412 `PRECONDITION_FAILED` `ERR-G08-SIGN`. No unseal |
| Priority | P2 |

---

### FR-G08-18 — Multi-RO Part-Period Reports & No-Report Certificate

#### TC-G08-097
| Field | Value |
|---|---|
| Traces-to | FR-G08-18 AC1, BR1, Edge (overlap) |
| Type | Boundary |
| Title | Report periods must tile the appraisal period without gaps/overlaps |
| Preconditions | Form; defining periods |
| Test data | `POST /g08/forms/{formId}/report-periods` with P1 Apr–Nov, P2 Oct–Mar (overlap Oct–Nov) |
| Expected | 409 `CONFLICT` (`VAL-G08-PERIODTILE`); overlap rejected; gaps flagged unsupervised |
| Priority | P2 |

#### TC-G08-098
| Field | Value |
|---|---|
| Traces-to | FR-G08-18 AC3, BR2 |
| Type | Functional |
| Title | Period below min_supervision_months issues a DSC-signed No-Report Certificate, excluded from aggregation |
| Preconditions | Period P2 supervision 2.0 months (< 3.0) |
| Test data | `POST /g08/forms/{formId}/report-periods/{periodId}/no-report` {reason, signature_id} |
| Expected | 200; `no_report_certificate=true`; DSC-signed; excluded from `provisional_grade` aggregation |
| Priority | P1 |

#### TC-G08-099
| Field | Value |
|---|---|
| Traces-to | FR-G08-18 AC4 |
| Type | Data-Integrity |
| Title | Provisional grade is the supervision-weighted mean of valid period grades (deterministic) |
| Preconditions | P1 grade 8.00 (7 mo), P2 grade 6.00 (5 mo), both valid |
| Test data | `POST /g08/forms/{formId}/report-periods/aggregate` |
| Expected | `provisional_grade` = (8.00×7 + 6.00×5)/12 = 7.17 (2 dp); `weight_in_aggregate` recorded per period; single deterministic function reused by analytics |
| Priority | P1 |

#### TC-G08-100
| Field | Value |
|---|---|
| Traces-to | FR-G08-18 AC5, ERR-G08-STATE |
| Type | State-Transition |
| Title | Form advances to RVO_REVIEW only when every period is SUBMITTED or NO_REPORT |
| Preconditions | P1 SUBMITTED, P2 still DRAFT |
| Test data | Attempt aggregate/advance |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; advance blocked until all periods resolved |
| Priority | P2 |

---

### FR-G08-19 — SLA Auto-Escalation & Authoring-Right Transfer

#### TC-G08-101
| Field | Value |
|---|---|
| Traces-to | FR-G08-19 AC1/AC2 |
| Type | Functional |
| Title | Overdue RO beyond grace transfers authoring right to the next higher authority |
| Preconditions | RO past `ro_due` + grace; `JOB-M09-SLA` runs |
| Test data | Advance clock; run SLA job |
| Expected | Authoring task reassigned RO→RvO (per escalation config); `is_escalated_author=true`; logged + notified; escalation, not just a reminder |
| Priority | P1 |

#### TC-G08-102
| Field | Value |
|---|---|
| Traces-to | FR-G08-19 AC3/AC4 |
| Type | Functional |
| Title | No-Report-due-to-RO recorded at tier (DSC-signed) when service rule prescribes |
| Preconditions | RO non-responsive; rule prescribes No-Report |
| Test data | `POST /g08/forms/{formId}/no-report-tier` {tier:REPORTING, signature_id} |
| Expected | 200; No-Report at RO tier, DSC-signed; `is_escalated_author=true`; flow continues |
| Priority | P2 |

#### TC-G08-103
| Field | Value |
|---|---|
| Traces-to | FR-G08-19 Edge (apex / conflicted transferee), R12 |
| Type | State-Transition |
| Title | Apex tier with no higher authority records No-Report / routes to designated alternate; conflicted transferee skipped |
| Preconditions | AA is apex, no higher authority; alternate configured; next transferee is conflicted |
| Test data | AA overdue; SLA escalates |
| Expected | Escalation routes to designated alternate or records No-Report (never silent stall); conflicted transferee (COI/SoD) skipped to next eligible |
| Priority | P2 |

---

### FR-G08-20 — Digital Signature & Non-Repudiation

#### TC-G08-104
| Field | Value |
|---|---|
| Traces-to | FR-G08-20 AC1/AC2 (R10) |
| Type | Functional |
| Title | Signing ceremony hashes canonical payload, invokes X.3, stores VALID signature; act commits |
| Preconditions | AA certifying; X.3 provider up |
| Test data | `POST /g08/signatures` {entity_type, entity_id, method:`DSC`} |
| Expected | 201; stores `signature_value`, `certificate_serial`, `signed_payload_hash` (SHA-256), `verification_status=VALID`; dependent act commits only with the VALID signature attached |
| Priority | P1 |

#### TC-G08-105
| Field | Value |
|---|---|
| Traces-to | FR-G08-20 AC1, ERR-G08-SIGNINVALID |
| Type | Negative |
| Title | Expired/invalid certificate at signing is rejected |
| Preconditions | Signer certificate expired |
| Test data | `POST /g08/signatures` with expired cert |
| Expected | 422 `VALIDATION_FAILED` `ERR-G08-SIGNINVALID`; signature not stored VALID; dependent act blocked |
| Priority | P1 |

#### TC-G08-106
| Field | Value |
|---|---|
| Traces-to | FR-G08-20 BR1 |
| Type | Data-Integrity |
| Title | A signature binds exactly one entity; reuse across entities is rejected |
| Preconditions | Signature already bound to one assessment |
| Test data | Attempt to attach the same `signature_id` to a second entity |
| Expected | 409 `CONFLICT` (or 422); one-entity binding enforced; reuse rejected |
| Priority | P2 |

#### TC-G08-107
| Field | Value |
|---|---|
| Traces-to | FR-G08-20 AC4, Edge (later revocation) |
| Type | Data-Integrity |
| Title | Later REVOKED/EXPIRED status is recorded append-only without altering the original payload |
| Preconditions | VALID signature later revoked; `GET .../verify` |
| Test data | `GET /g08/signatures/{id}/verify` after revocation |
| Expected | Reports INVALID/REVOKED; original `signed_payload_hash`/payload unchanged; alert raised; append-only |
| Priority | P2 |

#### TC-G08-108
| Field | Value |
|---|---|
| Traces-to | FR-G08-20 BR3, Edge (provider down) |
| Type | Negative |
| Title | Provider outage queues the act as pending-signature; never auto-bypasses |
| Preconditions | X.3 signing provider unavailable |
| Test data | Certify while provider down |
| Expected | 412 `PRECONDITION_FAILED` `ERR-G08-SIGN`; act queued pending (X.3 dead-letter); no state change; no bypass |
| Priority | P2 |

---

### FR-G08-21 — Probation Confirmation Appraisal

#### TC-G08-109
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 AC1/AC2/AC4, BR2 |
| Type | E2E-Flow |
| Title | Probation cycle yields CONFIRMED outcome, DSC-signed, fed to G01 and G12 (PROBATION_CONFIRMED) |
| Preconditions | `cycle_type=PROBATION`; probation form through RO→RvO→AA |
| Test data | `POST /g08/forms/{formId}/probation/decide` {probation_outcome:`CONFIRMED`, confirmation_date, signature_id} → disclose → finalise |
| Expected | `probation_outcome=CONFIRMED`; confirmation date recorded (mirrors M09); G01 status/confirmation fed; `/sr/ingest` event `PROBATION_CONFIRMED` (category APPRAISAL); does NOT feed G06 benchmark |
| Priority | P1 |

#### TC-G08-110
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 AC3, BR3, Edge (cap reached) |
| Type | Negative |
| Title | Extension beyond probation_extension_max_months is blocked |
| Preconditions | Probationer already extended to the cap |
| Test data | `POST /g08/forms/{formId}/probation/extend` |
| Expected | 409 `CONFLICT`; blocked; escalate to higher authority with reason |
| Priority | P2 |

#### TC-G08-111
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 AC5 |
| Type | State-Transition |
| Title | DISCHARGE_RECOMMENDED routes to competent authority and references G09/G01 |
| Preconditions | Probation form; AA recommends discharge |
| Test data | `POST /g08/forms/{formId}/probation/decide` {probation_outcome:`DISCHARGE_RECOMMENDED`} |
| Expected | Routed to competent authority; referenced to G09/G01 per policy; DSC-signed |
| Priority | P2 |

---

### FR-G08-22 — Cycle Errata / Controlled Correction

#### TC-G08-112
| Field | Value |
|---|---|
| Traces-to | FR-G08-22 AC1/AC2 |
| Type | Functional |
| Title | Errata proposal computes impact set; apply requires dual-control approval |
| Preconditions | Wrong `adverse_threshold` discovered mid-cycle; `HR-CELL` proposes |
| Test data | `POST /g08/cycles/{cycleId}/errata/propose` {parameter, rationale} → `GET .../errata/{id}/impact` → `POST .../approve` → `POST .../apply` |
| Expected | Impact set (count + list) returned; apply requires P01 maker+checker; old→new re-derivation provenance recorded for certified forms |
| Priority | P2 |

#### TC-G08-113
| Field | Value |
|---|---|
| Traces-to | FR-G08-22 AC3, BR2/BR3 |
| Type | Data-Integrity |
| Title | Errata re-derives flags and emits corrective G06/G12 events; newly-adverse cases re-open disclosure |
| Preconditions | Errata makes a previously favourable posted case newly adverse |
| Test data | Apply errata |
| Expected | `is_adverse`/`below_benchmark` re-derived; corrective SR/G06 events (never silent overwrite); fresh disclosure + representation window for newly-adverse cases; officers re-notified |
| Priority | P1 |

#### TC-G08-114
| Field | Value |
|---|---|
| Traces-to | FR-G08-22 Edge (concurrent errata), ERR-G08-ERRATA |
| Type | Negative |
| Title | Concurrent errata on the same cycle is serialized |
| Preconditions | An errata already applying on the cycle |
| Test data | `POST /g08/cycles/{cycleId}/errata/{id2}/apply` concurrently |
| Expected | 409 `CONFLICT` `ERR-G08-ERRATA`; second serialized/rejected |
| Priority | P2 |

---

### Cross-cutting: Authorization, API-Contract, Multi-tenant

#### TC-G08-115
| Field | Value |
|---|---|
| Traces-to | Platform §4, auth-matrix (deny-by-default) |
| Type | Authorization |
| Title | Unauthenticated request is rejected |
| Preconditions | No/expired Bearer token |
| Test data | `GET /g08/forms/{formId}` without Authorization |
| Expected | 401 `UNAUTHENTICATED`; `X-Correlation-Id` still returned |
| Priority | P1 |

#### TC-G08-116
| Field | Value |
|---|---|
| Traces-to | Platform §0.1 multi-tenant isolation |
| Type | Authorization |
| Title | Cross-tenant access to another tenant's APAR is not found/forbidden |
| Preconditions | `HR-CELL` of tenant T1 requests a T2 form id |
| Test data | `GET /g08/forms/{T2_formId}` |
| Expected | 404 `NOT_FOUND` (out-of-scope indistinguishable from absent); no T2 data leaked |
| Priority | P1 |

#### TC-G08-117
| Field | Value |
|---|---|
| Traces-to | Platform §4 (canonical envelope) |
| Type | API-Contract |
| Title | Error responses use the canonical envelope with X-Correlation-Id in the header |
| Preconditions | Any 4xx (e.g. TC-G08-012) |
| Test data | Trigger a validation error |
| Expected | Body = `{error:{code,message,field,details}}` and nothing else; `X-Correlation-Id` in response header, never in body |
| Priority | P2 |

#### TC-G08-118
| Field | Value |
|---|---|
| Traces-to | Platform §4 (cursor pagination) |
| Type | API-Contract |
| Title | List endpoints are cursor-paginated with default 25 / max 100 |
| Preconditions | > 25 rating scales exist |
| Test data | `GET /g08/rating-scales?limit=200` then follow `next_cursor` |
| Expected | `limit` capped at 100; `next_cursor` returned; following the cursor returns the next page with no overlap/gap |
| Priority | P2 |

#### TC-G08-119
| Field | Value |
|---|---|
| Traces-to | Platform §4 (Idempotency-Key, 24h replay) |
| Type | API-Contract |
| Title | Replaying an unsafe POST with the same Idempotency-Key returns the original result |
| Preconditions | A goal-lock already performed with key `K9` |
| Test data | Repeat `POST /g08/forms/{formId}/goals/lock` with `K9` |
| Expected | 200; original snapshot result replayed; no duplicate snapshots; within 24h window |
| Priority | P2 |

#### TC-G08-120
| Field | Value |
|---|---|
| Traces-to | Platform §0.1 (unscoped query rejected) |
| Type | Data-Integrity |
| Title | An unscoped list query is rejected, not defaulted to all tenants |
| Preconditions | Query missing tenant/entity scope resolution |
| Test data | List forms without resolvable scope |
| Expected | Rejected (403/422); never returns all-tenant data |
| Priority | P2 |

---

### E2E flow

#### TC-G08-121
| Field | Value |
|---|---|
| Traces-to | FR-G08-01→02→03→04→05→06→08→14 (state-machine happy path) |
| Type | E2E-Flow |
| Title | End-to-end annual APAR: configure → goals → self → RO → RvO → AA certify → disclose → finalise → APAR_FINAL_GRADE to /sr/ingest → G06 eligibility |
| Preconditions | Clean cycle; personas provisioned; DSC provider up |
| Test data | Full fixture path across the tier chain |
| Steps | 1. HR opens cycle (form GOALS_PENDING). 2. Appraisee sets goals summing 100; RO approves; goals lock → snapshot (GOALS_APPROVED). 3. Appraisee submits self-appraisal (→RO_ASSESSMENT). 4. RO(s) sign part-period assessments; aggregate provisional (→RVO_REVIEW). 5. RvO concurs + signs (→AA_ACCEPTANCE). 6. AA step-up + DSC certify; flags derived (→DISCLOSURE). 7. HR discloses full APAR; appraisee eSign-acknowledges; window passes with no representation (→FINALISED). 8. Finalise + post-to-SR. |
| Expected | Terminal status POSTED; `/sr/ingest` received `APAR_FINAL_GRADE` {event_category:APPRAISAL, source_module:G08, source_reference_id:form_id, final_grade, below_benchmark, chain_anchor_ref, fact_key:null}; G06 eligibility fed by reference (below_benchmark/final_grade/cycle_id); every tier act DSC-signed and P05-audited; disclosure log chain verifiable |
| Priority | P1 |

#### TC-G08-122
| Field | Value |
|---|---|
| Traces-to | FR-G08-06→08→14, calibration-vs-applied (R1), representation recompute |
| Type | E2E-Flow |
| Title | Adverse APAR: calibration recommendation (not forced) → AA ratifies → disclose adverse → representation expunges → grade recomputed → corrective G06 feed |
| Preconditions | Certified form with below-benchmark adverse grade + disclosable evidence |
| Steps | 1. Calibration committee recommends a change (rationale) — final_grade unchanged until ratified. 2. AA ratifies with step-up + DSC (calibration_adjustment; pre_calibration_grade preserved). 3. Disclose full adverse APAR; appraisee acknowledges. 4. Appraisee files representation within window. 5. Competent authority (senior, not in chain, no COI) expunges adverse remark with DSC. 6. Flags recomputed above benchmark; re-disclosed; finalise + post. |
| Expected | Calibration never mutated the grade autonomously (only ratified adjustment did); post-expunction grade crosses back above benchmark; corrective SR event + updated G06 eligibility (never silent overwrite); representation chain CLOSED |
| Priority | P1 |

### v3.2 Field-Reconciliation Additions — Config masters, cycle exclusions, probation confirmations, calibration acknowledgement, goal metric/pillar/alignment

> Covers the v3.2 ADD-only reconciliation (BRD §5 E24–E34 + goal/self/calibration/PIP columns; data-model Sections 3–4; OpenAPI v3.2 paths). Config/master rows are tenant-scoped with `VAL-MASTER-UNIQUE` codes and `status` ∈ DRAFT/ACTIVE/ARCHIVED. Negative TCs assert the exact wire code (8-code table) and, where a specific `ERR-G08-*` applies, that code.

#### TC-G08-123
| Field | Value |
|---|---|
| Traces-to | FR-G08-01, FR-G08-02 (v3.2 E24/E25) |
| Type | Functional |
| Title | Configure a scorecard pillar and a measurement metric (PMS config masters) |
| Preconditions | `SYS-ADMIN`/`HR-CELL` logged in; tenant `T1` scope resolved |
| Test data | `POST /g08/scorecard-pillars` {pillar_code:`FINANCIAL`, name:`Financial Perspective`} then `POST /g08/metrics` {metric_code:`DB_Default_Metric_Percentage`, name:`Percentage`}, both with Idempotency-Key |
| Steps | 1. Create pillar. 2. Create metric. |
| Expected | 201 on each; `status=ACTIVE` by default; tenant-scoped rows returned with ids; `X-Correlation-Id` echoed |
| Priority | P1 |

#### TC-G08-124
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 (v3.2 E24), `VAL-MASTER-UNIQUE` |
| Type | Negative |
| Title | Duplicate tenant-scoped pillar_code is rejected |
| Preconditions | Pillar `FINANCIAL` from TC-G08-123 exists in `T1` |
| Test data | `POST /g08/scorecard-pillars` {pillar_code:`FINANCIAL`, name:`Dup`} |
| Expected | 409 `CONFLICT` (uniqueness on `(tenant_id, pillar_code)`); no second row created |
| Priority | P2 |

#### TC-G08-125
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 (v3.2 E28) |
| Type | Functional |
| Title | Configure a goal-plan master with the per-field flag matrix as jsonb |
| Preconditions | `SYS-ADMIN`/`HR-CELL`; entity scope resolved |
| Test data | `POST /g08/goal-plans` {goal_plan_code:`GP-OKR-2025`, name:`OKR FY25`, methodology:`OKR`, start_date, end_date (≥start), enable_goal_weightage_limits:true, min_weightage:0, max_weightage:100, field_settings:{...}} |
| Expected | 201; `status=ACTIVE`; `field_settings` persisted verbatim (jsonb, not exploded); `end_date ≥ start_date` accepted |
| Priority | P2 |

#### TC-G08-126
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 (v3.2 E28), BR (date/weightage bounds) |
| Type | Negative |
| Title | Goal-plan with end_date before start_date is rejected |
| Preconditions | As TC-G08-125 |
| Test data | `POST /g08/goal-plans` {goal_plan_code:`GP-BAD`, name:`Bad`, start_date:`2025-12-01`, end_date:`2025-01-01`} |
| Expected | 422 `VALIDATION_FAILED` (`ck_goal_plans_dates`); no row created |
| Priority | P2 |

#### TC-G08-127
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 (v3.2 goals.metric_id/scorecard_pillar_id/aligned_to_goal_id) |
| Type | Functional |
| Title | Create a goal carrying metric, scorecard pillar, timeline and alignment |
| Preconditions | Pillar `FINANCIAL` (E24) + metric `Percentage` (E25) ACTIVE; form `GOALS_PENDING`; a parent objective goal `G-OBJ` exists for alignment |
| Test data | `POST /g08/goals` {appraisee_id, goal_type:`KRA`, period_scope:`SINGLE_CYCLE`, title:`Cost reduction`, weightage:40, metric_id, metric_criteria:`% vs budget`, target_prefix:`INR`, timeline_start_date, timeline_end_date, scorecard_pillar_id, aligned_to_goal_id:`G-OBJ`, goal_source:`SELF`, category:`Customer`} |
| Expected | 201; goal persists `metric_id`, `scorecard_pillar_id`, `aligned_to_goal_id`, `timeline_*`, `goal_source=SELF`, `category`; `block_edit_achievement` defaults false |
| Priority | P1 |

#### TC-G08-128
| Field | Value |
|---|---|
| Traces-to | FR-G08-02 (v3.2 goals.scorecard_pillar_id), P02 scope |
| Type | Negative |
| Title | Goal referencing an out-of-scope scorecard pillar is not found |
| Preconditions | Caller in `T1`; `scorecard_pillar_id` belongs to tenant `T2` |
| Test data | `POST /g08/goals` {…, scorecard_pillar_id:`<T2 pillar>`} |
| Expected | 404 `NOT_FOUND` (out-of-scope master indistinguishable from absent; no T2 leak); goal not created |
| Priority | P2 |

#### TC-G08-129
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 (v3.2 E33 appraisal_cycle_exclusions) |
| Type | Functional |
| Title | Manually exclude an employee from an appraisal cycle |
| Preconditions | Cycle `APAR-2025-26` OPEN; appraisee eligible; `HR-CELL` logged in |
| Test data | `POST /g08/cycles/{cycleId}/exclusions` {appraisee_id, exclusion_source:`MANUAL`, exclusion_reason:`On probation`, detail:`Probation ends 11 Sep 2026`, justification:`…`, reversibility:`REVERSIBLE`} |
| Expected | 201; `status=EXCLUDED`; unique `(tenant_id, cycle_id, appraisee_id)`; appraisee omitted from cycle materialisation |
| Priority | P1 |

#### TC-G08-130
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 (v3.2 E33 reversibility/re-inclusion) |
| Type | State-Transition |
| Title | Reverse (re-include) a reversible cycle exclusion |
| Preconditions | Exclusion from TC-G08-129 EXCLUDED, `reversibility=REVERSIBLE` |
| Test data | `POST /g08/cycles/{cycleId}/exclusions/{exclusionId}/reverse` |
| Expected | 200; `status=RE_INCLUDED`; `re_included_at`/`re_included_by` recorded; appraisee re-materialised into the cycle |
| Priority | P2 |

#### TC-G08-131
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 (v3.2 E33 unique constraint) |
| Type | Negative |
| Title | Excluding an already-excluded appraisee is rejected |
| Preconditions | Appraisee already EXCLUDED on the cycle (TC-G08-129) |
| Test data | `POST /g08/cycles/{cycleId}/exclusions` {same appraisee_id} |
| Expected | 409 `CONFLICT` (uniqueness on `(tenant_id, cycle_id, appraisee_id)`); no duplicate |
| Priority | P2 |

#### TC-G08-132
| Field | Value |
|---|---|
| Traces-to | FR-G08-01 (v3.2 E33), ERR-G08-STATE |
| Type | Negative |
| Title | Reversing a PERMANENT cycle exclusion is blocked |
| Preconditions | An exclusion with `reversibility=PERMANENT`, `status=EXCLUDED` |
| Test data | `POST /g08/cycles/{cycleId}/exclusions/{exclusionId}/reverse` |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; remains EXCLUDED; no re-inclusion |
| Priority | P2 |

#### TC-G08-133
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 (v3.2 E34 probation_confirmations) |
| Type | Functional |
| Title | Manager recommends confirmation, HR approves → CONFIRMED |
| Preconditions | Probation record open (`status=IN_PROBATION`); `RO1` = recommending manager; `HR-CELL` distinct approver |
| Test data | `POST /g08/probation-confirmations` {confirmation_no:`PC-001`, appraisee_id, date_of_joining, probation_end_date} → `POST .../{id}/recommend` {manager_recommendation:`RECOMMEND_CONFIRMATION`, manager_comments} → `POST .../{id}/approve` {confirmation_effective_date, hr_approver_id} |
| Steps | 1. Open record. 2. Manager recommends confirmation (→PENDING_HR_APPROVAL). 3. HR approves. |
| Expected | 201 open; 200 recommend (status `PENDING_HR_APPROVAL`, recommendation stored); 200 approve (status `CONFIRMED`, `hr_approved_at` set, effective date recorded); probation-confirmation feed to G01/M02 |
| Priority | P1 |

#### TC-G08-134
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 (v3.2 E34 extension) |
| Type | State-Transition |
| Title | Manager recommends extension then probation is extended → EXTENDED |
| Preconditions | Probation record `IN_PROBATION` / `PENDING_MANAGER` |
| Test data | `POST .../{id}/recommend` {manager_recommendation:`RECOMMEND_EXTENSION`} → `POST .../{id}/extend` {extension_months:3, probation_end_date:`2026-12-11`} |
| Expected | 200 on both; `status=EXTENDED`; `extension_months=3`; new `probation_end_date` recorded |
| Priority | P2 |

#### TC-G08-135
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 (v3.2 E34 lifecycle), ERR-G08-STATE |
| Type | Negative |
| Title | Approving a probation confirmation before any manager recommendation is blocked |
| Preconditions | Probation record `IN_PROBATION` with no recommendation recorded |
| Test data | `POST /g08/probation-confirmations/{id}/approve` {confirmation_effective_date} |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; not approved; status unchanged |
| Priority | P2 |

#### TC-G08-136
| Field | Value |
|---|---|
| Traces-to | FR-G08-21 (v3.2 E34 SoD), ERR-G08-SELFADJ |
| Type | Negative |
| Title | HR approver equal to the recommending manager (maker = checker) is forbidden |
| Preconditions | Recommendation recorded by `RO1`; approver resolves to the same principal (`RO1`) |
| Test data | `POST .../{id}/approve` with `hr_approver_id = RO1` (the recommender) |
| Expected | 403 `FORBIDDEN` `ERR-G08-SELFADJ`; no self-approval; approval rejected |
| Priority | P1 |

#### TC-G08-137
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 (v3.2 calibration_recommendations employee_ack_*) |
| Type | Functional |
| Title | Employee acknowledges a published calibration recommendation with comments |
| Preconditions | Recommendation RATIFIED and disclosed to the appraisee; caller is the appraisee (`EMP-APPRAISEE`) |
| Test data | `POST /g08/calibration/recommendations/{recId}/acknowledge` {employee_ack_status:`ACKNOWLEDGED_WITH_COMMENTS`, employee_ack_comments:`Noted, request 1:1`} |
| Expected | 200; `employee_ack_status=ACKNOWLEDGED_WITH_COMMENTS`; `employee_ack_comments` + `employee_ack_at` recorded; P05-audited |
| Priority | P2 |

#### TC-G08-138
| Field | Value |
|---|---|
| Traces-to | FR-G08-09 (v3.2 ack gate), ERR-G08-STATE |
| Type | Negative |
| Title | Acknowledging a calibration recommendation before it is ratified/disclosed is blocked |
| Preconditions | Recommendation in `PROPOSED`/`VOTING` (not yet ratified/disclosed) |
| Test data | `POST /g08/calibration/recommendations/{recId}/acknowledge` {employee_ack_status:`ACKNOWLEDGED`} |
| Expected | 409 `CONFLICT` `ERR-G08-STATE`; `employee_ack_status` remains `AWAITING` |
| Priority | P2 |

---

## 3. Traceability Matrix (FR → TC, 0 gaps)

| FR | Description | Test Cases |
|---|---|---|
| FR-G08-01 | Cycle & template configuration | TC-G08-001, 002, 003, 004, 005, 006, 007, 008, 009, 121, 129, 130, 131, 132 |
| FR-G08-02 | Goal setting, weightage, snapshot-on-lock | TC-G08-010, 011, 012, 013, 014, 015, 016, 017, 119, 121, 123, 124, 125, 126, 127, 128 |
| FR-G08-03 | Self-appraisal | TC-G08-018, 019, 020, 021, 121 |
| FR-G08-04 | Reporting Officer assessment (multi-RO, DSC) | TC-G08-022, 023, 024, 025, 026, 027, 028, 066, 069, 121 |
| FR-G08-05 | Reviewing Officer review | TC-G08-029, 030, 031, 032, 033, 034, 121 |
| FR-G08-06 | Accepting Authority certification | TC-G08-035, 036, 037, 038, 039, 040, 041, 121, 122 |
| FR-G08-07 | Rating scales & grade computation | TC-G08-042, 043, 044, 045, 046 |
| FR-G08-08 | Mandatory disclosure & representation | TC-G08-047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 121, 122 |
| FR-G08-09 | Calibration as ratified recommendation | TC-G08-058, 059, 060, 061, 062, 063, 122, 137, 138 |
| FR-G08-10 | Continuous feedback & check-ins | TC-G08-064, 065, 066 |
| FR-G08-11 | Multi-source / 360 feedback | TC-G08-067, 068, 069 |
| FR-G08-12 | Competency assessment & G07 linkage | TC-G08-070, 071 |
| FR-G08-13 | Performance Improvement Plan | TC-G08-072, 073, 074 |
| FR-G08-14 | Posting to G12 SR & G06 feed | TC-G08-075, 076, 077, 078, 079, 121, 122 |
| FR-G08-15 | Custody, confidentiality, tamper-evidence | TC-G08-080, 081, 082, 083, 084, 085, 086, 087, 088, 089 |
| FR-G08-16 | Performance & bias-disparity analytics | TC-G08-090, 091, 092 |
| FR-G08-17 | Sealed Cover Procedure | TC-G08-008, 039, 077, 093, 094, 095, 096 |
| FR-G08-18 | Multi-RO part-period & No-Report | TC-G08-027, 097, 098, 099, 100 |
| FR-G08-19 | SLA auto-escalation & authoring transfer | TC-G08-101, 102, 103 |
| FR-G08-20 | Digital signature & non-repudiation | TC-G08-026, 036, 054, 104, 105, 106, 107, 108 |
| FR-G08-21 | Probation confirmation appraisal | TC-G08-109, 110, 111, 133, 134, 135, 136 |
| FR-G08-22 | Cycle errata / controlled correction | TC-G08-112, 113, 114 |
| Platform (cross-cutting) | Auth, multi-tenant, API contract | TC-G08-115, 116, 117, 118, 119, 120 |

All 22 FRs covered; **0 gaps**.

---

## 4. Coverage Summary

### 4.1 By type
| Type | Count | Test Cases |
|---|---|---|
| Functional | 32 | 001, 005, 007, 010, 011, 013, 018, 022, 029, 043, 047, 048, 050, 052, 053, 058, 060, 062, 070, 071, 072, 075, 085, 086, 090, 094, 098, 101, 102, 104, 112, 123, 125, 127, 129, 133, 137 |
| Boundary | 10 | 004, 012, 013, 020, 037, 038, 042, 044, 045, 065, 097 |
| Negative | 33 | 003, 009, 019, 023, 024, 026, 030, 034, 036, 046, 051, 054, 056, 059, 061, 066, 068, 069, 073, 074, 077, 087, 088, 096, 108, 110, 114, 124, 126, 128, 131, 132, 135, 136, 138 |
| Authorization | 13 | 014, 021, 025, 031, 032, 041, 063, 081, 084, 089, 092, 095, 115, 116 |
| PII-Confidentiality | 5 | 057, 064, 080, 086, 091 |
| State-Transition | 10 | 006, 008, 017, 033, 049, 055, 093, 100, 103, 111, 130, 134 |
| Data-Integrity | 11 | 002, 016, 028, 040, 076, 078, 082, 083, 099, 106, 107, 120 |
| API-Contract | 4 | 079, 117, 118, 119 |
| E2E-Flow | 4 | 109, 121, 122 |

(Some TCs carry a primary type in the table above; a handful legitimately span two categories — the primary type is used for the count. Total distinct TCs = 138.)

### 4.2 Consolidated counts
| Type (primary) | Count |
|---|---|
| Functional | 36 |
| Negative | 35 |
| Authorization | 14 |
| Data-Integrity | 12 |
| Boundary | 11 |
| State-Transition | 12 |
| PII-Confidentiality | 5 |
| API-Contract | 4 |
| E2E-Flow | 3 |
| Data-Integrity/Boundary overlap TCs | (counted once above) |
| **Total** | **138** |

### 4.3 By priority
| Priority | Count |
|---|---|
| P1 (statutory-critical) | 60 |
| P2 (important) | 72 |
| P3 (edge/low) | 6 |
| **Total** | **138** |

### 4.4 Error-code coverage
All 20 ERR-G08-* codes are asserted by at least one negative TC:
`WEIGHTAGE`(012) · `TIERCONFLICT`(031,041) · `SELFADJ`(025,136) · `COI`(032,063) · `STATE`(009,021,028,040,056,100,132,135,138) · `GRADERANGE`(020,038) · `ADVEVID`(024,034,066,069) · `REPWINDOW`(051) · `DISCLOSE`(covered via disclosure gate on 047/050) · `RATIFY`(059) · `FORCEDDIST`(061) · `SEALED`(039,077) · `CHAIN`(006) · `SIGN`(026,036,054,096,108) · `SIGNINVALID`(105) · `DUALCTRL`(084) · `TAMPER`(083) · `ERRATA`(114) · `ALREADYPOSTED`(076) · `CUSTODYORPHAN`(088).
