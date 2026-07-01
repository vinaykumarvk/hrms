# G11 — Retirement and Pension Management — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | G11 — Retirement and Pension Management (alias `GOV-M11`; supersedes `M11-PEN`) |
| Program | Government HRMS — PrimeSoft platform extension (net-new statutory pension engine) |
| Spec version under test | BRD v3.0 (`docs/brd/v3/G11-retirement-and-pension.md`) |
| API contract | `docs/contracts/openapi/G11.yaml` (OpenAPI 3.1, `/api/v1`) |
| Error taxonomy | `docs/contracts/error-taxonomy.yaml` — `ERR-G11-*` under the platform 8-code table |
| State machines | `docs/contracts/state-machines.yaml` (G11) + BRD §10.1–10.10 |
| Authorization | `docs/contracts/auth-matrix.yaml` (G11 roles/actions) + RBAC v1.7 (P02) |
| Scope | FR-G11-01 … FR-G11-24 + SR-ledger posting contract (§8.7) + calc appendices §16 |
| Test levels | Acceptance (black-box API), Financial-Integrity (exact-value), State-Transition, Authorization, Data-Integrity, API-Contract, and one full E2E flow |

### 1.1 Traceability convention

Every case cites **Traces-to** = FR id + AC/BR/edge/state/appendix anchor. Negatives assert the **exact `ERR-G11-*` code (carried in `error.code` or `details.reason`) + HTTP wire status**. Financial cases assert **exact monetary values** in `NUMERIC(15,2)` rupee strings.

### 1.2 Test-environment & data assumptions

| Concern | Assumption |
|---|---|
| Multi-tenancy | Single government tenant `T1`; departments as entities `E-REV` (Revenue) and `E-HEALTH` (Health). Every row carries `tenant_id`/`entity_id`; unscoped queries are rejected (P02 §0.1), never defaulted to "all". |
| Personas / roles | `PO` = Pension Officer (maker, `pension_officer`, MFA), `SA` = Pension Sanctioning Authority (checker, `pension_sanctioning_authority`, MFA), `PDA` = Pension Disbursing Authority (`pension_disbursing_authority`), `SRC` = SR Custodian (G12, `sr_custodian`), `PAYO` = Payroll Officer (G10, `payroll_officer`), `MED` = Medical Board (`medical_board`), `SYS` = Org Admin/SysAdmin (rule tables), `AUD` = Auditor (org-admin read + P05 query), `EMP` = Employee/Pensioner (self-service). |
| Money precision | All benefit amounts `NUMERIC(15,2)`; rates/factors `NUMERIC(9,4)`; service in integer Y/M/D. No floating point. Rounding per E36. |
| Platform conventions | Bearer JWT (P02); `Idempotency-Key` required on every transaction-creating POST (24h replay → original result); cursor pagination (`?limit=` default 25/max 100 + `cursor=`); `X-Correlation-Id` echoed + audited; canonical `{error:{code,message,field,details}}` envelope; P05 DB-trigger captures every mutation immutably. |
| Rule tables (effective 30-Jun-2026) | E35 min pension `₹9,000.00`, min-service threshold `10 years`; commuted fraction max `0.40`; gratuity base ceiling `₹20,00,000.00`, `+25%` step per 50% DA threshold crossed; commutation factor age-next-birthday `61 = 8.1940`; family-pension normal `0.3000` / enhanced `0.5000`; gratuity exemption cap `₹20,00,000.00`; leave-encashment cap `300 days`. |
| Standard financial fixture — `EMP-SUP-01` (superannuation, OPS) | last basic `₹1,00,000.00`; DA 50% ⇒ emoluments (basic+DA) `₹1,50,000.00`; net qualifying service `33y 0m` ⇒ `66` reckonable half-years (capped); avg-12-month pay `₹1,20,000.00`. |

---

## 2. Test Cases

### FR-G11-01 — Retirement Forecasting & Due-for-Retirement Lists

#### TC-G11-001
| Field | Value |
|---|---|
| Traces-to | FR-G11-01 / AC1, BR3 |
| Type | Financial-Integrity (date arithmetic) |
| Title | Projected retirement date = last day of month of superannuation-age attainment |
| Preconditions | `EMP-SUP-01` DOB `15-Mar-1965`; E34 superannuation age `60` for cadre |
| Test data | Attainment of age 60 on `15-Mar-2025` |
| Steps | 1. `GET /api/v1/pension/forecasts/{employeeId}` as PO. |
| Expected | `200`; `projected_retirement_date = 31-Mar-2025` (last day of attainment month, not the birthday). Field present, `X-Correlation-Id` echoed. |
| Priority | High |

#### TC-G11-002
| Field | Value |
|---|---|
| Traces-to | FR-G11-01 / AC2 |
| Type | API-Contract |
| Title | Forecast list filters by horizon/org_unit/cadre and is cursor-paginated |
| Preconditions | ≥30 forecast rows in `E-REV` |
| Test data | `?horizon_months=12&org_unit_id=OU1&cadre=GROUP_B&limit=25` |
| Steps | 1. `GET /api/v1/pension/forecasts` with filters. 2. Follow `next_cursor`. |
| Expected | `200`; page ≤25 rows all matching filters; `next_cursor` present; no `offset` param accepted. |
| Priority | Medium |

#### TC-G11-003
| Field | Value |
|---|---|
| Traces-to | FR-G11-01 / AC3 |
| Type | Functional |
| Title | Crossing the 18-month threshold with no case emits `MSG-G11-FORECAST-ALERT` |
| Preconditions | Employee at 18-month threshold, `case_initiated=false` |
| Test data | `POST /api/v1/pension/forecasts:refresh` (delegates JOB-G11-FORECAST) |
| Steps | 1. Trigger refresh. 2. Inspect X.2 notification queue for the responsible PO. |
| Expected | `202` JobAccepted; one `MSG-G11-FORECAST-ALERT` to the PO; row flagged case-not-initiated. |
| Priority | Medium |

#### TC-G11-004
| Field | Value |
|---|---|
| Traces-to | FR-G11-01 / AC4 |
| Type | Boundary |
| Title | Separated employees excluded from forecast |
| Preconditions | Employees in RETIRED, DECEASED, RESIGNED, TERMINATED |
| Test data | Mixed active/separated population |
| Steps | 1. Refresh forecasts. 2. `GET /api/v1/pension/forecasts`. |
| Expected | `200`; none of the four separated statuses appear; only ACTIVE/ON_LEAVE projected. |
| Priority | Medium |

---

### FR-G11-02 — Separation Case Management (all separation types)

#### TC-G11-005
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC1 (SUPERANNUATION) |
| Type | Functional |
| Title | Create a SUPERANNUATION case; scheme auto-derived OPS |
| Preconditions | `EMP-SUP-01` DOJ pre-NPS cutover |
| Test data | `POST /api/v1/pension/cases` `{separation_type:SUPERANNUATION, retirement_date:30-Jun-2025}` + `Idempotency-Key` |
| Steps | 1. Create case as PO. |
| Expected | `201`; `pension_scheme=OPS` derived; `status=INITIATED`; P01 instance started; `case_no` like `PEN-2025-*`. |
| Priority | High |

#### TC-G11-006
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC1 (COMPULSORY_RETIREMENT), BR1 |
| Type | Negative |
| Title | Compulsory retirement without a valid G09 penalty order is rejected |
| Preconditions | No G09 compulsory-retirement order for subject |
| Test data | `{separation_type:COMPULSORY_RETIREMENT, reason_ref:null}` |
| Steps | 1. Create case as PO. |
| Expected | `422 VALIDATION_FAILED`, `details.reason=CASE_INPUT_INCOMPLETE` (`VAL-G11-CASE`); field `reason_ref`; no case created. |
| Priority | High |

#### TC-G11-007
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC1 (INVALIDATION) |
| Type | Functional |
| Title | INVALIDATION case requires a medical-board certificate |
| Preconditions | MED certificate ref available |
| Test data | `{separation_type:INVALIDATION, reason_ref:MED-2025-77}` |
| Steps | 1. Create as PO with cert. 2. Create a second without cert. |
| Expected | Step 1 `201`; step 2 `422 VALIDATION_FAILED` (`CASE_INPUT_INCOMPLETE`, field `reason_ref`). |
| Priority | High |

#### TC-G11-008
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC1 (DEATH_IN_SERVICE), BR2 |
| Type | State-Transition |
| Title | DEATH_IN_SERVICE auto-spawns family-pension (IN_SERVICE) and death-gratuity sub-flows |
| Preconditions | E26 family register populated (spouse rank 1) |
| Test data | `{separation_type:DEATH_IN_SERVICE, reason_ref:DR-88, retirement_date=date_of_death}` |
| Steps | 1. Create case. 2. Inspect spawned sub-flows. |
| Expected | `201`; family-pension record with `enhanced_basis=IN_SERVICE` and death-gratuity flow created; compassionate fast-track layout flag. |
| Priority | High |

#### TC-G11-009
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC1 (VOLUNTARY_RETIREMENT), BR3 |
| Type | Functional |
| Title | VRS case captures notice + eligibility; may add weightage |
| Preconditions | Subject meets minimum qualifying service for VRS |
| Test data | `{separation_type:VOLUNTARY_RETIREMENT, notice_date:01-Apr-2025}` |
| Steps | 1. Create as PO. |
| Expected | `201`; VRS notice captured; weightage eligibility flagged (distinct from prior service). |
| Priority | Medium |

#### TC-G11-010
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC4 (RESIGNATION) |
| Type | Functional |
| Title | RESIGNATION suppresses pension but allows GPF/leave settlement |
| Preconditions | Resignation accepted |
| Test data | `{separation_type:RESIGNATION}` |
| Steps | 1. Create case; drive to settlement. |
| Expected | `201`; pension path suppressed per rule; GPF + leave-encashment settlement still permitted. |
| Priority | Medium |

#### TC-G11-011
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC5, IR1 |
| Type | Negative |
| Title | At most one active case per employee |
| Preconditions | An active case already exists for `EMP-SUP-01` |
| Test data | Second `POST /api/v1/pension/cases` for same employee |
| Steps | 1. Create duplicate active case. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-DUP-CASE`; no second case. |
| Priority | High |

#### TC-G11-012
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC2, BR5 |
| Type | Data-Integrity |
| Title | Scheme override requires reason and is P05-audited |
| Preconditions | Case with derived `OPS` |
| Test data | `PATCH /pension/cases/{id}` `{pension_scheme:NPS}` without reason, then with reason |
| Steps | 1. Override without reason. 2. Override with reason. |
| Expected | Step 1 `422` `ERR-REASON-REQ`; step 2 `200`, override written with an immutable P05 audit row capturing old→new + reason. |
| Priority | High |

#### TC-G11-013
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC2a, §10.1 |
| Type | State-Transition |
| Title | `proceedings_pending=true` routes to the provisional path and flags DCRG full-withholding |
| Preconditions | G09 proceedings ACTIVE (`proceedings_ref` set) |
| Test data | `{proceedings_pending:true, proceedings_ref:DC-9001}` |
| Steps | 1. Create/advance case. |
| Expected | `201/200`; P01 CONDITIONAL routes to FR-22 provisional path; DCRG flagged for full withholding; sanction restricted to PROVISIONAL. |
| Priority | High |

#### TC-G11-014
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / AC3; auth-matrix `g11.pension.sanction` |
| Type | Authorization |
| Title | Maker cannot sanction own case (SoD, maker≠checker) |
| Preconditions | Case at PENDING_SANCTION created by PO-1 |
| Test data | `POST /pension/cases/{id}:sanction` as PO-1 (the maker) |
| Steps | 1. Same user who created the case attempts sanction. |
| Expected | `403 FORBIDDEN`, `details.reason=SOD_MAKER_EQ_CHECKER`; sanction blocked (P01/P02 intersection). |
| Priority | Critical |

#### TC-G11-015
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / edge (death during pre-retirement) |
| Type | State-Transition |
| Title | SUPERANNUATION → DEATH_IN_SERVICE conversion mid-pipeline |
| Preconditions | Active SUPERANNUATION case in SR_VERIFICATION |
| Test data | Death reported before retirement date |
| Steps | 1. Convert type via `PATCH`/advance. |
| Expected | `200`; type becomes DEATH_IN_SERVICE; family-pension (IN_SERVICE) + death-gratuity sub-flows spawned; audit trail continuous. |
| Priority | Medium |

#### TC-G11-016
| Field | Value |
|---|---|
| Traces-to | FR-G11-02 / API-Contract; Idempotency |
| Type | API-Contract |
| Title | Idempotency-Key replay of case creation returns the original result |
| Preconditions | Case created with key `K1` |
| Test data | Re-POST identical body with same `Idempotency-Key:K1` within 24h |
| Steps | 1. Repeat create with K1. |
| Expected | `201` returning the **same** `case_id` (no duplicate); no second P01 instance. |
| Priority | High |

---

### FR-G11-03 — Pre-Retirement Processing (SR verification, no-dues, anticipatory pension)

#### TC-G11-017
| Field | Value |
|---|---|
| Traces-to | FR-G11-03 / AC1; §10.1 gate |
| Type | State-Transition |
| Title | Case cannot advance to CALCULATION until FR-18 SIGNED_OFF/LOCKED and `qsr.sr_verified=true` |
| Preconditions | Verification record still DISCREPANCIES_OPEN |
| Test data | `POST /pension/cases/{id}:advance` to CALCULATION |
| Steps | 1. Advance before sign-off. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-VERIFICATION-INCOMPLETE`; case stays SR_VERIFICATION. |
| Priority | Critical |

#### TC-G11-018
| Field | Value |
|---|---|
| Traces-to | FR-G11-03 / AC1; auth `g11.sr.verify` |
| Type | Authorization |
| Title | Only SR Custodian may certify service verification; SRC≠case maker |
| Preconditions | Verification ATTESTED |
| Test data | `POST /pension/cases/{id}/sr-verification:certify` as PO, then as SRC |
| Steps | 1. Certify as PO. 2. Certify as SRC. |
| Expected | Step 1 `403 FORBIDDEN`; step 2 `200` certified (SoD SRC≠maker). |
| Priority | High |

#### TC-G11-019
| Field | Value |
|---|---|
| Traces-to | FR-G11-03 / AC1; edge (G12 unavailable) |
| Type | Negative |
| Title | G12 verification request when upstream unavailable maps to 412 after X.3 retry |
| Preconditions | G12 SR port unreachable |
| Test data | `POST /pension/cases/{id}/sr-verification:request` |
| Steps | 1. Request verification while G12 down. |
| Expected | `412 PRECONDITION_FAILED`, `ERR-PRECOND` (upstream retryable; never a public 503). |
| Priority | Medium |

#### TC-G11-020
| Field | Value |
|---|---|
| Traces-to | FR-G11-03 / AC3, BR1 |
| Type | Financial-Integrity |
| Title | Anticipatory pension capped at configured % of estimated pension; gratuity withheld |
| Preconditions | Estimated basic pension `₹50,000.00`; anticipatory cap 80% |
| Test data | `POST /pension/cases/{id}/anticipatory-pension` `{amount:45000.00}` then `{amount:41000.00}` |
| Steps | 1. Request `₹45,000` (>80%). 2. Request `₹40,000`. |
| Expected | Step 1 `422 VALIDATION_FAILED` (`VAL-G11-PENSION`, cap breach ₹40,000.00 max); step 2 `201` ANTICIPATORY PPO; anticipatory gratuity withheld until no-dues. |
| Priority | High |

#### TC-G11-021
| Field | Value |
|---|---|
| Traces-to | FR-G11-03 / AC2, AC4, BR3 |
| Type | State-Transition |
| Title | Case cannot reach PENDING_SANCTION until no-dues CLEARED; blocking items hold gratuity not basic pension |
| Preconditions | No-dues checklist with one BLOCKED branch |
| Test data | `PATCH /pension/cases/{id}/no-dues` |
| Steps | 1. Advance to PENDING_SANCTION with a blocked branch. 2. Clear all. |
| Expected | Step 1 `409 CONFLICT` (no-dues not CLEARED); outstanding dues recorded as recovery candidates; step 2 CLEARED → advance permitted. |
| Priority | High |

---

### FR-G11-04 — Qualifying Service Computation (from G03/G04 leave data)

#### TC-G11-022
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC1, BR1, BR2 |
| Type | Financial-Integrity |
| Title | Net qualifying = gross − uncondoned non-qualifying (LWP/dies-non) + counted prior service — exact months |
| Preconditions | FR-18 SIGNED_OFF. Gross service joining `01-Jan-1988` → retire `31-Dec-2024` = `37y 0m 0d`. G03/G04: EOL-without-medical (LWP) `5 months` + dies-non `1 month` = `6 months` uncondoned non-qualifying. E39 verified prior military service `3y 0m` (no prior pension). |
| Test data | `POST /pension/cases/{id}/qualifying-service:compute` |
| Steps | 1. Compute QSR. |
| Expected | `200`; `non_qualifying_days` = 6 months; `prior_service_days` = 3y; `net_qualifying = 37y − 6m + 3y = 39y 6m`; each spell traces to its G03/G04/G09 source; `calc_trace` present. |
| Priority | Critical |

#### TC-G11-023
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC1 (condonation), BR1; E29 |
| Type | Data-Integrity |
| Title | Condoned spell (E29 order) counts as qualifying |
| Preconditions | 3 months of the LWP condoned via E29 order `COND-11` |
| Test data | `POST /pension/cases/{id}/qualifying-service/spells` (condone) then recompute |
| Steps | 1. Condone 3m. 2. Recompute QSR. |
| Expected | `200/201`; uncondoned non-qualifying drops from 6m to 3m; condonation order linked to the resolving spell; net qualifying rises by 3m. |
| Priority | High |

#### TC-G11-024
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC2; E36; §16.2 |
| Type | Boundary |
| Title | Reckonable half-year rounding per E36 (3-month boundary) |
| Preconditions | Net qualifying `39y 6m` and `39y 2m` variants |
| Test data | Two QSR computations |
| Steps | 1. Compute with 39y 6m. 2. Compute with 39y 2m. |
| Expected | 39y 6m → `79` half-years (6m = one half-year); 39y 2m → `78` half-years (2m <3m ignored per E36). |
| Priority | High |

#### TC-G11-025
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC2 (cap); E36 |
| Type | Boundary |
| Title | Reckonable half-years capped per E36 (66) |
| Preconditions | Net qualifying 40y (80 half-years raw) |
| Test data | Compute QSR |
| Steps | 1. Compute. |
| Expected | `reckonable_half_years` capped at `66` (for gratuity); cap flag recorded in trace. |
| Priority | Medium |

#### TC-G11-026
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC4a, BR4; E39 |
| Type | Negative |
| Title | Prior military service excluded when prior pension already drawn |
| Preconditions | E39 record `verified=true`, `pension_already_drawn=true` |
| Test data | `POST /pension/cases/{id}/prior-service` then compute |
| Steps | 1. Add prior service with pension drawn. 2. Compute. |
| Expected | Prior service **not** added (AC4a); `prior_service_days` excludes it; reason recorded. VRS `weightage_years` remains distinct from `prior_service_days` (BR4). |
| Priority | High |

#### TC-G11-027
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC5; E35; §16.5 |
| Type | Boundary |
| Title | `meets_min_pension_service` false just below 10 years → SERVICE_GRATUITY route |
| Preconditions | Net qualifying `9y 11m` |
| Test data | Compute QSR |
| Steps | 1. Compute. |
| Expected | `meets_min_pension_service=false`; downstream FR-05 must yield `benefit_outcome=SERVICE_GRATUITY_ONLY`. |
| Priority | High |

#### TC-G11-028
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC5; E35 |
| Type | Boundary |
| Title | `meets_min_pension_service` true at exactly 10 years → FULL_PENSION route |
| Preconditions | Net qualifying `10y 0m` |
| Test data | Compute QSR |
| Steps | 1. Compute. |
| Expected | `meets_min_pension_service=true`; FR-05 eligible for FULL_PENSION flat 50%. |
| Priority | High |

#### TC-G11-029
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC3; ERR-G11-VERIFICATION-INCOMPLETE |
| Type | Negative |
| Title | Compute rejected before FR-18 sign-off (input-provenance gate) |
| Preconditions | Verification not signed off |
| Test data | `POST /pension/cases/{id}/qualifying-service:compute` |
| Steps | 1. Compute pre-sign-off. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-VERIFICATION-INCOMPLETE`. |
| Priority | Critical |

#### TC-G11-030
| Field | Value |
|---|---|
| Traces-to | FR-G11-04 / AC5 (lock), edge (overlap); ERR-G11-SPELL-NOT-ATTESTED |
| Type | State-Transition |
| Title | QSR lock blocked while spells unattested; overlapping spells merged before deduction |
| Preconditions | Two overlapping LWP spells; one unattested |
| Test data | `POST /pension/cases/{id}/qualifying-service:lock` |
| Steps | 1. Attempt lock with an unattested spell. 2. Verify overlap merge. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-SPELL-NOT-ATTESTED`; overlapping days counted once (merged), not double-deducted. |
| Priority | High |

---

### FR-G11-05 — Pension Calculation (OPS / NPS / UPS / service gratuity)

#### TC-G11-031
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC1; §16.5 |
| Type | Financial-Integrity |
| Title | OPS basic pension = flat 50% of emoluments for ≥10 years (no proportionate reduction) |
| Preconditions | `EMP-SUP-01`, net qualifying 33y (≥10), emoluments base `₹1,00,000.00` |
| Test data | `POST /pension/cases/{id}/pension:compute` `{emoluments_method:LAST_DRAWN}` |
| Steps | 1. Compute pension. |
| Expected | `200`; `benefit_outcome=FULL_PENSION`; `pension_fraction=0.5000`; `basic_pension=₹50,000.00`; `rule_version_ref` FK set; `calc_trace` present. |
| Priority | Critical |

#### TC-G11-032
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC1a; §16.5 |
| Type | Financial-Integrity |
| Title | <10 years → no monthly pension, routed to SERVICE_GRATUITY |
| Preconditions | Net qualifying `9y 11m`; emoluments base `₹60,000.00` |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `200`; `basic_pension=null`; `benefit_outcome=SERVICE_GRATUITY_ONLY`; FULL_PENSION and SERVICE_GRATUITY mutually exclusive (IR3a). |
| Priority | High |

#### TC-G11-033
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC3; E35 |
| Type | Boundary |
| Title | Statutory minimum pension floor applied with flag |
| Preconditions | Computed basic `₹8,200.00` < min `₹9,000.00` |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `200`; `basic_pension=₹9,000.00`; `minimum_pension_applied=true`. |
| Priority | High |

#### TC-G11-034
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC3; E35 |
| Type | Boundary |
| Title | Statutory maximum pension cap applied with flag |
| Preconditions | Computed basic above E35 maximum |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `200`; `basic_pension` capped to E35 max; `maximum_pension_cap_applied=true`. |
| Priority | Medium |

#### TC-G11-035
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC4b; §16.6 |
| Type | Financial-Integrity |
| Title | UPS opted-in assured payout ≈ 50% of last-12-month average pay + min guarantee |
| Preconditions | `ups_opted_in=true`; avg-12-month pay `₹1,20,000.00`; E35 UPS min `₹10,000.00` |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `200`; `benefit_outcome=UPS_ASSURED`; `ups_assured_payout=₹60,000.00`; `emoluments_method=AVG_12_MONTH`; `ups_min_guarantee_applied=false` (60k>10k). |
| Priority | High |

#### TC-G11-036
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC4a; §16.6 |
| Type | Financial-Integrity |
| Title | NPS death-in-service computes CCS-NPS Rules 2021 OPS-equivalent default |
| Preconditions | NPS subscriber, DEATH_IN_SERVICE |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `200`; `benefit_outcome=NPS_DEFAULT_FAMILY`; `nps_default_benefit_amount` = OPS-equivalent family pension; deterministic. |
| Priority | High |

#### TC-G11-037
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC4, G2; §16.6 |
| Type | Data-Integrity |
| Title | NPS superannuation records corpus/annuity as indicative, excluded from determinism |
| Preconditions | NPS subscriber, superannuation; CRA figures over X.3 |
| Test data | Compute pension |
| Steps | 1. Compute; re-compute. |
| Expected | `200`; `benefit_outcome=NPS_INDICATIVE`; `nps_annuity_estimate`/`nps_lumpsum_estimate` labelled indicative; no defined-benefit pension fabricated; determinism guarantee does not cover these fields. |
| Priority | Medium |

#### TC-G11-038
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / Failure (emoluments missing) |
| Type | Negative |
| Title | Missing emoluments from G10 → ERR-G11-EMOLUMENTS |
| Preconditions | G10 emoluments snapshot absent |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-EMOLUMENTS`. |
| Priority | High |

#### TC-G11-039
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / Failure (rule row missing) |
| Type | Negative |
| Title | No effective rule row for the date → ERR-G11-RULE-NOT-EFFECTIVE |
| Preconditions | E30/E35 row not EFFECTIVE for retirement date |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-RULE-NOT-EFFECTIVE`. |
| Priority | High |

#### TC-G11-040
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / Failure (UPS opt-in absent) |
| Type | Negative |
| Title | UPS computation without opt-in → ERR-G11-SCHEME-MISMATCH |
| Preconditions | Scheme UPS requested but `ups_opted_in=false` |
| Test data | Compute pension |
| Steps | 1. Compute. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-SCHEME-MISMATCH`. |
| Priority | Medium |

#### TC-G11-041
| Field | Value |
|---|---|
| Traces-to | FR-G11-05 / AC5, G2 |
| Type | Financial-Integrity |
| Title | Re-computation with identical inputs + snapshotted rule version is byte-identical |
| Preconditions | `EMP-SUP-01` computed once (`rule_version_ref=R1`) |
| Test data | Recompute with same inputs/rule version |
| Steps | 1. Compute. 2. Recompute. |
| Expected | Identical `basic_pension=₹50,000.00` and identical `calc_trace`; same `rule_version_ref` FK. |
| Priority | High |

---

### FR-G11-06 — Commutation of Pension

#### TC-G11-042
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC1, AC2, AC3; §16 |
| Type | Financial-Integrity |
| Title | Commuted value = commuted × factor × 12; residual = basic − commuted |
| Preconditions | Basic pension `₹50,000.00`; fraction `0.40`; age-next-birthday `61`, factor `8.1940` |
| Test data | `POST /pension/cases/{id}/commutation` `{opted:true, commuted_fraction:0.40}` |
| Steps | 1. Compute commutation. |
| Expected | `200`; `commuted_pension_amount=₹20,000.00`; `commutation_factor=8.1940`; `commuted_value=₹19,66,560.00` (20000×8.1940×12); `residual_pension=₹30,000.00`; `commutation_factor_ref` FK captured. |
| Priority | Critical |

#### TC-G11-043
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC1; ERR-G11-COMMUTATION-LIMIT |
| Type | Negative |
| Title | Commuted fraction above statutory max rejected |
| Preconditions | Statutory max `0.40` |
| Test data | `{commuted_fraction:0.45}` |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-COMMUTATION-LIMIT`; no record. |
| Priority | High |

#### TC-G11-044
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC2; ERR-G11-FACTOR-NOT-FOUND |
| Type | Negative |
| Title | Missing E31 factor for age-next-birthday → ERR-G11-FACTOR-NOT-FOUND |
| Preconditions | No E31 row for the resolved age |
| Test data | Compute commutation |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-FACTOR-NOT-FOUND`. |
| Priority | Medium |

#### TC-G11-045
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC3a, BR2 |
| Type | Financial-Integrity |
| Title | restoration_due_date = reduction_effective_date + 15 years |
| Preconditions | `reduction_effective_date=01-Jul-2025` (= commuted-value payment date) |
| Test data | Compute commutation |
| Steps | 1. Compute. |
| Expected | `200`; `restoration_due_date=01-Jul-2040`; DA continues on full basic per BR3. |
| Priority | High |

#### TC-G11-046
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC3a, edge (migrated unknown dates) |
| Type | Boundary |
| Title | Migrated pensioner with unknown dates → manual restoration review, not auto-scheduled |
| Preconditions | `migrated_date_unknown=true` |
| Test data | Compute commutation |
| Steps | 1. Compute. |
| Expected | `200`; `restoration_due_date=null`; flagged for manual review; `JOB-G11-RESTORE` not scheduled. |
| Priority | Medium |

#### TC-G11-047
| Field | Value |
|---|---|
| Traces-to | FR-G11-06 / AC5 |
| Type | Functional |
| Title | Opting out leaves full basic pension and no commuted value |
| Preconditions | Basic `₹50,000.00` |
| Test data | `{opted:false}` |
| Steps | 1. Compute. |
| Expected | `200`; `commuted_value=null`; residual = full `₹50,000.00`. |
| Priority | Medium |

---

### FR-G11-07 — Gratuity (retirement / death / service, DA-stepped ceiling)

#### TC-G11-048
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC1, BR1; §16 |
| Type | Financial-Integrity |
| Title | Retirement gratuity = ¼ × emoluments × half-years; payable = min(computed, ceiling) |
| Preconditions | Emoluments (basic+DA) `₹1,50,000.00`; capped half-years `66`; DA 50% ⇒ ceiling stepped to `₹25,00,000.00` |
| Test data | `POST /pension/cases/{id}/gratuity:compute` `{gratuity_type:RETIREMENT_GRATUITY}` |
| Steps | 1. Compute. |
| Expected | `200`; `computed_amount = 0.25×150000×66 = ₹24,75,000.00`; `statutory_ceiling=₹25,00,000.00`; `payable_amount=₹24,75,000.00`; `ceiling_applied=false`; `ceiling_ref` FK captured. |
| Priority | Critical |

#### TC-G11-049
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC1, AC5; BR3a; E33 auto-step |
| Type | Boundary |
| Title | DA-stepped ceiling binds when computed exceeds it |
| Preconditions | Computed `₹26,00,000.00`; DA 50% ⇒ ceiling `₹25,00,000.00` |
| Test data | Compute gratuity |
| Steps | 1. Compute. |
| Expected | `200`; `payable_amount=₹25,00,000.00`; `ceiling_applied=true`. |
| Priority | High |

#### TC-G11-050
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / BR3a; E33; §Improvement 21 |
| Type | Boundary |
| Title | Ceiling auto-steps +25% per 50% DA threshold crossed |
| Preconditions | Base ceiling `₹20,00,000.00` |
| Test data | Three DA scenarios: 25%, 50%, 100% |
| Steps | 1. Resolve ceiling at each DA. |
| Expected | DA 25% → `₹20,00,000.00` (no crossing); DA 50% → `₹25,00,000.00` (one crossing); DA 100% → `₹30,00,000.00` (two crossings, 20L×1.5); no manual edit possible. |
| Priority | High |

#### TC-G11-051
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC2a, BR4; §16.5 |
| Type | Financial-Integrity |
| Title | Service gratuity (<10 yrs) one-time lump sum, no DCRG ceiling |
| Preconditions | Net qualifying `8y 0m` = 16 half-years; emoluments `₹60,000.00`; multiplier ½ month per half-year |
| Test data | `{gratuity_type:SERVICE_GRATUITY}` |
| Steps | 1. Compute. |
| Expected | `200`; `computed_amount = 16×0.5×60000 = ₹4,80,000.00`; `payable_amount=₹4,80,000.00`; `ceiling_applied=false` (no DCRG ceiling). |
| Priority | High |

#### TC-G11-052
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC2, BR4; death gratuity |
| Type | Financial-Integrity |
| Title | Death gratuity applies correct slab multiplier; no minimum-service bar |
| Preconditions | DEATH_IN_SERVICE; service `4y` (slab multiplier per E33 = 6× emoluments); emoluments `₹1,50,000.00` |
| Test data | `{gratuity_type:DEATH_GRATUITY}` |
| Steps | 1. Compute. |
| Expected | `200`; `service_slab_factor=6`; `computed_amount=₹9,00,000.00`; computed even for short service (BR4). |
| Priority | High |

#### TC-G11-053
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC3; ERR-G11-NOMINEE-SPLIT; VAL-NOMINEE |
| Type | Negative |
| Title | Death-gratuity nominee shares not totalling 100% rejected |
| Preconditions | Nominee split 60% + 30% (=90%) |
| Test data | `{gratuity_type:DEATH_GRATUITY, nominee_split:[{60},{30}]}` |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-NOMINEE-SPLIT`; correct 100% split then apportions. |
| Priority | High |

#### TC-G11-054
| Field | Value |
|---|---|
| Traces-to | FR-G11-07 / AC4; §10; WITHHELD_PROCEEDINGS |
| Type | State-Transition |
| Title | Retirement gratuity fully withheld pending Rule-9 proceedings |
| Preconditions | `proceedings_pending=true` (FR-22) |
| Test data | Compute gratuity |
| Steps | 1. Compute. |
| Expected | `200`; `withheld_amount = payable_amount`; `status=WITHHELD_PROCEEDINGS`; excluded from immediate payout. |
| Priority | High |

---

### FR-G11-08 — Family & Enhanced Family Pension (path-specific window, dual/twin)

#### TC-G11-055
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC1, AC2; §16.7 (IN_SERVICE) |
| Type | Financial-Integrity |
| Title | Death-in-service: enhanced 50% for 10 years no age cap, step-down to normal 30% |
| Preconditions | Last pay `₹1,00,000.00`; E32 normal `0.3000`/enhanced `0.5000`; death `01-Jul-2025` |
| Test data | `POST /pension/cases/{id}/family-pension:compute` `{enhanced_basis:IN_SERVICE}` |
| Steps | 1. Compute. |
| Expected | `200`; `enhanced_amount=₹50,000.00`; `normal_amount=₹30,000.00`; `enhanced_from=01-Jul-2025`, `enhanced_to=30-Jun-2035` (+10y, no age cap); `enhanced_window_rule` recorded; scheduled step-down to `₹30,000.00`. |
| Priority | Critical |

#### TC-G11-056
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC2, BR1; §16.7 (AFTER_RETIREMENT) |
| Type | Financial-Integrity |
| Title | Death-after-retirement: enhanced window = min(+7y, age-67, would-be-superannuation) |
| Preconditions | Pensioner dies at age 64 on `01-Jul-2025`; would-be-superannuation `31-Jul-2028` |
| Test data | `{enhanced_basis:AFTER_RETIREMENT}` |
| Steps | 1. Compute. |
| Expected | `200`; `enhanced_to = min(01-Jul-2032, age-67=~2028, 31-Jul-2028) = 31-Jul-2028`; enhanced = min(enhanced formula, would-be pension) per BR1; recorded in `enhanced_window_rule`. |
| Priority | High |

#### TC-G11-057
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC2a; §16.7 |
| Type | State-Transition |
| Title | Both step-downs are tested invariants (enhanced → normal auto-scheduled) |
| Preconditions | FP ACTIVE with enhanced window |
| Test data | Advance clock past `enhanced_to` |
| Steps | 1. Cross window expiry. |
| Expected | Amount steps from enhanced to `normal_amount` automatically (§10.6 auto step-down); no manual action. |
| Priority | High |

#### TC-G11-058
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC3, BR4; ERR-G11-FP-NOT-NOMINEE |
| Type | Negative |
| Title | Recipient must be an E26 family member (rank-driven), not an E21 nominee |
| Preconditions | Claimant is an E21 nominee but not in the E26 family register |
| Test data | Compute FP naming the nominee |
| Steps | 1. Attempt to set nominee as recipient. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-FP-NOT-NOMINEE`; recipient resolved from E26 by `statutory_rank`. |
| Priority | High |

#### TC-G11-059
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC3 (transfer) |
| Type | State-Transition |
| Title | On cessation, family pension transfers to the next eligible E26 member |
| Preconditions | Current recipient ceases (e.g. widow remarriage); next eligible child exists |
| Test data | `POST /pension/family-pension/{id}:transfer` `{to_family_member_id, reason}` |
| Steps | 1. Transfer. |
| Expected | `200`; `status=TRANSFERRED`; `current_family_member_id` = next E26 rank; reason captured. |
| Priority | High |

#### TC-G11-060
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC4 |
| Type | Functional |
| Title | Disabled-dependent member receives lifelong family pension |
| Preconditions | E26 member `is_disabled_dependent=true` |
| Test data | Compute FP |
| Steps | 1. Compute; simulate age-25 cutoff passing. |
| Expected | Eligibility persists lifelong (no age-25 cessation) for disabled dependent. |
| Priority | Medium |

#### TC-G11-061
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC6, BR2; IR14 |
| Type | Financial-Integrity |
| Title | Dual family pension (both spouses govt servants) subject to E32 dual cap |
| Preconditions | Both spouses were govt servants; two FP entitlements |
| Test data | Compute both FPs |
| Steps | 1. Compute; apply dual cap. |
| Expected | `dual_family_pension=true`; combined amount limited to the E32 dual cap; `dual_cap_applied=true`. |
| Priority | High |

#### TC-G11-062
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC6; IR14 |
| Type | Financial-Integrity |
| Title | Twins/multiple eligible children draw simultaneously (concurrent shares = 100%) |
| Preconditions | Twins both eligible |
| Test data | Compute FP with two E26 children |
| Steps | 1. Compute. |
| Expected | Each child `concurrent_share_pct=0.5000`; total = 100%; both draw simultaneously per rule. |
| Priority | Medium |

#### TC-G11-063
| Field | Value |
|---|---|
| Traces-to | FR-G11-08 / AC5 |
| Type | State-Transition |
| Title | Both death-in-service and conversion paths produce a FP record + FAMILY_PENSION PPO |
| Preconditions | (a) death-in-service case; (b) pensioner-death conversion |
| Test data | Compute FP on each path |
| Steps | 1. Compute for both paths. |
| Expected | Each yields a `pen_family_pension_records` row and a FAMILY_PENSION PPO. |
| Priority | Medium |

---

### FR-G11-09 — Terminal Benefits & Final Settlement (with Tax/TDS)

#### TC-G11-064
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC1, BR1 |
| Type | Financial-Integrity |
| Title | Leave encashment = min(encashable days, 300) × per-day (basic+DA) |
| Preconditions | Encashable EL `320 days`; emoluments `₹1,50,000.00` ⇒ per-day `₹5,000.00` |
| Test data | `POST /pension/cases/{id}/settlement:compute` |
| Steps | 1. Compute settlement. |
| Expected | `200`; capped to `300` days; `leave_encashment_amount = 300×5000 = ₹15,00,000.00`. |
| Priority | High |

#### TC-G11-065
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC2a; §16.8 |
| Type | Financial-Integrity |
| Title | Gratuity exemption up to ₹20L cap; excess taxable |
| Preconditions | DCRG `₹25,00,000.00` |
| Test data | Compute settlement |
| Steps | 1. Compute tax step. |
| Expected | `gratuity_exempt_amount=₹20,00,000.00`; `gratuity_taxable_amount=₹5,00,000.00` in `tax_breakdown`. |
| Priority | Critical |

#### TC-G11-066
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC2a; §16.8 |
| Type | Financial-Integrity |
| Title | Commuted pension & leave encashment fully exempt (govt employee); net = gross − recoveries − TDS |
| Preconditions | Commuted value `₹19,66,560.00`; leave encashment `₹15,00,000.00`; recoveries `₹0` |
| Test data | Compute settlement |
| Steps | 1. Compute. |
| Expected | `commutation_exempt_amount=₹19,66,560.00`; `leave_encashment_exempt_amount=₹15,00,000.00`; taxable_total reflects only DCRG excess; `net_settlement = gross − recoveries − tds_amount`. |
| Priority | High |

#### TC-G11-067
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC2a; §16.8 (89(1)) |
| Type | Financial-Integrity |
| Title | Section 89(1) relief computed on arrears spanning years |
| Preconditions | Revision arrears spanning FYs |
| Test data | Compute settlement with arrears |
| Steps | 1. Compute. |
| Expected | `section_89_relief` computed and captured in `tax_breakdown`; reduces TDS accordingly. |
| Priority | Medium |

#### TC-G11-068
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC3, BR2; §16.3; ERR-G11-RECOVERY-PROTECTION |
| Type | Negative |
| Title | Recovery breaching the protected floor is deferred, never silently dropped |
| Preconditions | Recoveries exceed statutory net-protection floor |
| Test data | Compute settlement |
| Steps | 1. Compute with over-limit recovery. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-RECOVERY-PROTECTION`; excess deferred/flagged; recovery priority per §16.3. |
| Priority | High |

#### TC-G11-069
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / Failure (tax rule missing) |
| Type | Negative |
| Title | Missing tax rule → ERR-G11-TAX-RULE |
| Preconditions | Tax-rule params not effective |
| Test data | Compute settlement |
| Steps | 1. Compute. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-TAX-RULE`. |
| Priority | Medium |

#### TC-G11-070
| Field | Value |
|---|---|
| Traces-to | FR-G11-09 / AC5; ERR-G11-CASE-NOT-SANCTIONED |
| Type | Negative |
| Title | Settlement sanction requires SANCTIONED sub-calculations |
| Preconditions | Sub-calcs still COMPUTED, not SANCTIONED |
| Test data | `POST /pension/cases/{id}/settlement:sanction` |
| Steps | 1. Sanction settlement. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-CASE-NOT-SANCTIONED`. |
| Priority | Medium |

---

### FR-G11-10 — GPF Final Withdrawal

#### TC-G11-071
| Field | Value |
|---|---|
| Traces-to | FR-G11-10 / AC1, AC2 |
| Type | Financial-Integrity |
| Title | GPF final = closing balance + interest-to-date − outstanding advances |
| Preconditions | G10 closing balance `₹18,00,000.00`; interest-to-date `₹45,000.00`; advance `₹1,00,000.00` |
| Test data | `POST /pension/cases/{id}/gpf:compute` |
| Steps | 1. Compute. |
| Expected | `200`; final payable = `18,00,000 + 45,000 − 1,00,000 = ₹17,45,000.00`. |
| Priority | High |

#### TC-G11-072
| Field | Value |
|---|---|
| Traces-to | FR-G11-10 / AC5; ERR-G11-SCHEME-MISMATCH |
| Type | Negative |
| Title | GPF only for GPF/OPS subscribers; NPS/UPS routed to NPS exit |
| Preconditions | NPS subscriber |
| Test data | Compute GPF |
| Steps | 1. Compute for NPS subscriber. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-SCHEME-MISMATCH`. |
| Priority | Medium |

#### TC-G11-073
| Field | Value |
|---|---|
| Traces-to | FR-G11-10 / AC4; auth (SoD) |
| Type | Authorization |
| Title | GPF authorisation requires an authority distinct from the maker |
| Preconditions | GPF computed by PO |
| Test data | `POST /pension/cases/{id}/gpf:authorise` as PO then SA |
| Steps | 1. Authorise as PO (maker). 2. Authorise as SA. |
| Expected | Step 1 `403 FORBIDDEN` (SoD); step 2 `200` AUTHORISED. |
| Priority | High |

---

### FR-G11-11 — PPO Generation & Digital PPO

#### TC-G11-074
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / AC1; ERR-G11-CASE-NOT-SANCTIONED |
| Type | Negative |
| Title | PPO generation blocked until case is SANCTIONED |
| Preconditions | Case at CALCULATION (not sanctioned) |
| Test data | `POST /pension/cases/{id}/ppo:generate` `{ppo_type:SERVICE_PENSION}` |
| Steps | 1. Generate PPO. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-CASE-NOT-SANCTIONED`. |
| Priority | High |

#### TC-G11-075
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / AC1, AC4, AC5; auth `g11.pension.sanction` |
| Type | State-Transition |
| Title | Authorise PPO → AUTHORISED_TO_PDA, creates/links pensioner, carries figures |
| Preconditions | Case SANCTIONED; PPO DRAFT |
| Test data | `POST /pension/ppos/{id}:authorise` as SA |
| Steps | 1. Authorise. |
| Expected | `200`; `status=AUTHORISED_TO_PDA`; carries basic/commuted/residual/effective_from/PDA; pensioner master created (FR-12); authoriser≠preparer. |
| Priority | High |

#### TC-G11-076
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / AC2; ERR-G11-DUP-PPO |
| Type | Negative |
| Title | Duplicate active PPO on a case rejected; ppo_no unique |
| Preconditions | An ACTIVE PPO already exists |
| Test data | Generate a second PPO of same type |
| Steps | 1. Generate duplicate. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-DUP-PPO`; single ACTIVE PPO invariant holds. |
| Priority | High |

#### TC-G11-077
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / AC2 (revise); §10.2 |
| Type | State-Transition |
| Title | REVISED PPO supersedes exactly one ACTIVE PPO |
| Preconditions | ACTIVE PPO exists |
| Test data | `POST /pension/ppos/{id}:revise` `{reason}` |
| Steps | 1. Revise. |
| Expected | `201`; new REVISED PPO ACTIVE; prior → SUPERSEDED; `supersedes_ppo_id` set to exactly one. |
| Priority | Medium |

#### TC-G11-078
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / AC6, BR4; FR-22 |
| Type | Functional |
| Title | PROVISIONAL PPO links E41 and carries relief formula for PDA_APPLIES_RELIEF |
| Preconditions | Provisional pension record E41; PDA model PDA_APPLIES_RELIEF |
| Test data | Generate `{ppo_type:PROVISIONAL}` |
| Steps | 1. Generate. |
| Expected | `201`; `provisional_ref` set; PPO carries basic + `relief_formula_ref` (not full amount) per model. |
| Priority | Medium |

#### TC-G11-079
| Field | Value |
|---|---|
| Traces-to | FR-G11-11 / edge (registry collision) |
| Type | Data-Integrity |
| Title | PPO number registry collision retried idempotently (no gap/duplicate) |
| Preconditions | Concurrent PPO issuance |
| Test data | Two concurrent authorise calls |
| Steps | 1. Issue concurrently. |
| Expected | Unique `ppo_no` allocated transactionally; idempotent retry on collision; no duplicate number. |
| Priority | Medium |

---

### FR-G11-12 — Pensioner Master & Lifecycle

#### TC-G11-080
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC1, AC2; §10.3 |
| Type | State-Transition |
| Title | Overdue LC beyond grace → SUSPENDED_NO_LC; verified LC reactivates + releases arrear |
| Preconditions | LC overdue beyond grace |
| Test data | `POST /pension/pensioners/{id}/life-certificate` after suspension |
| Steps | 1. Cross grace (JOB-G11-LC-REMIND). 2. Submit/verify LC. |
| Expected | Step 1 `SUSPENDED_NO_LC`, disbursement held; step 2 `201`, back to ACTIVE, held pension released with arrear. |
| Priority | High |

#### TC-G11-081
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC1; ERR-G11-LC-SUSPENDED |
| Type | Negative |
| Title | Action on a suspended LC returns ERR-G11-LC-SUSPENDED |
| Preconditions | LC suspended |
| Test data | Attempt a disbursement-dependent action |
| Steps | 1. Trigger action needing an active LC. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-LC-SUSPENDED`. |
| Priority | Medium |

#### TC-G11-082
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC3, BR2; JOB-G11-RESTORE |
| Type | Financial-Integrity |
| Title | At restoration date (reduction+15y) commuted portion restored to full basic |
| Preconditions | Residual `₹30,000.00`; basic `₹50,000.00`; restoration due `01-Jul-2040` |
| Test data | Advance clock to restoration date |
| Steps | 1. Run JOB-G11-RESTORE. |
| Expected | `current_monthly_pension = ₹50,000.00`; `restored=true`; restoration applies only to the original pensioner. |
| Priority | High |

#### TC-G11-083
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC4, BR3; §10.3 |
| Type | State-Transition |
| Title | Self-pensioner death → family-pension conversion (AFTER_RETIREMENT) + FAMILY_PENSION PPO |
| Preconditions | ACTIVE pensioner; E26 spouse eligible |
| Test data | `POST /pension/pensioners/{id}:report-death` `{date_of_death, source:REPORTED}` |
| Steps | 1. Report death. |
| Expected | `200`; pensioner → CONVERTED_TO_FAMILY; FP record `enhanced_basis=AFTER_RETIREMENT`; FAMILY_PENSION PPO; SR `FAMILY_PENSION_SANCTIONED` posted. |
| Priority | High |

#### TC-G11-084
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC5, BR (bank change); FR-14 |
| Type | Authorization |
| Title | Pensioner bank self-update routes through P01 maker-checker + penny-drop before use |
| Preconditions | Pensioner submits new bank account |
| Test data | `PATCH /pension/pensioners/{id}` `{bank_account}` |
| Steps | 1. Submit change; 2. attempt disbursement before verify. |
| Expected | `200` queued (E·AR via P01); disbursement uses new account only after `pen_bank_account_verifications` PASSED; penny-drop fail → `422 ERR-G11-ACCOUNT-VERIFY`. |
| Priority | High |

#### TC-G11-085
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / AC6; FR-20; ERR-G11-DRAWN-AFTER-DEATH |
| Type | State-Transition |
| Title | FR-20-detected death opens E38 recovery when pension drawn after death |
| Preconditions | Death detected via DBT anomaly; drawals after date_of_death |
| Test data | Confirm death; reconcile |
| Steps | 1. Confirm FR-20 flag. |
| Expected | Conversion triggered; E38 recovery row opened; further drawal blocked with `409 ERR-G11-DRAWN-AFTER-DEATH`. |
| Priority | High |

#### TC-G11-086
| Field | Value |
|---|---|
| Traces-to | FR-G11-12 / edge (restoration coincides with DA revision) |
| Type | Financial-Integrity |
| Title | Restoration coinciding with DA revision applies in §16.9 order |
| Preconditions | Restoration + DA share the effective date |
| Test data | Concurrent events |
| Steps | 1. Apply both on same date. |
| Expected | Restoration (order 2) applied before DA (order 3); applied order recorded in `calc_trace`. |
| Priority | Medium |

---

### FR-G11-13 — Pension Revision (DA & pay-commission)

#### TC-G11-087
| Field | Value |
|---|---|
| Traces-to | FR-G11-13 / AC1, BR4 |
| Type | Financial-Integrity |
| Title | DA revision recomputes relief for M11_COMPUTES_FULL; issues relief order for PDA_APPLIES_RELIEF |
| Preconditions | Mixed cohort by `disbursement_model`; DA 42%→46% |
| Test data | `POST /pension/revisions` then `:compute` |
| Steps | 1. Create + compute batch. |
| Expected | `200`; M11_COMPUTES_FULL pensioners get recomputed monthly figure + old/new + arrears; PDA_APPLIES_RELIEF pensioners get a relief order marked for reconciliation. |
| Priority | High |

#### TC-G11-088
| Field | Value |
|---|---|
| Traces-to | FR-G11-13 / AC2, AC3 |
| Type | Financial-Integrity |
| Title | Pay-commission batch re-fixes basic and computes arrears from effective date; P01 approval before APPLY |
| Preconditions | Pay-commission re-fix rule effective |
| Test data | Create pay-commission revision |
| Steps | 1. Compute. 2. Approve (P01). 3. Apply. |
| Expected | Basic re-fixed; arrears from effective date; per-pensioner old→new + trace; APPLY blocked until APPROVED. |
| Priority | High |

#### TC-G11-089
| Field | Value |
|---|---|
| Traces-to | FR-G11-13 / AC6; §16.9 |
| Type | Financial-Integrity |
| Title | Concurrent same-date events apply in §16.9 order; order recorded in calc_trace |
| Preconditions | One pensioner with pay-commission re-fix + restoration + DA + age-increment all effective same date |
| Test data | Compute revision |
| Steps | 1. Compute. |
| Expected | Applied strictly: (1) pay-commission re-fix → (2) restoration → (3) DA → (4) age increment; `calc_trace` records the applied order (tested invariant). |
| Priority | Critical |

#### TC-G11-090
| Field | Value |
|---|---|
| Traces-to | FR-G11-13 / AC4; §16.4; ERR-G11-REVISION-IMMUTABLE |
| Type | Negative |
| Title | Applied revision is immutable; re-apply rejected |
| Preconditions | Revision already APPLIED |
| Test data | `POST /pension/revisions/{id}:apply` again |
| Steps | 1. Re-apply. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-REVISION-IMMUTABLE`; corrections require a new batch. |
| Priority | High |

#### TC-G11-091
| Field | Value |
|---|---|
| Traces-to | FR-G11-13 / AC5; edge (deceased mid-batch) |
| Type | Boundary |
| Title | Age-based increment auto-applies on milestone birthday; deceased-mid-batch quarantined to E38 |
| Preconditions | Pensioner turns 80; another dies between compute and apply |
| Test data | Compute + apply batch |
| Steps | 1. Apply. |
| Expected | 80-year increment auto-applied; deceased line quarantined and routed to E38 (no partial commit on apply fault). |
| Priority | Medium |

---

### FR-G11-14 — Treasury / Bank / PDA Integration (pre-credit verification)

#### TC-G11-092
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC1a, BR1a; IR16 |
| Type | Financial-Integrity |
| Title | FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED line not transmitted unless account PASSED |
| Preconditions | One line's `pen_bank_account_verifications` = FAILED |
| Test data | `POST /pension/disbursements/{id}:transmit` |
| Steps | 1. Transmit batch with an unverified line. |
| Expected | `409 CONFLICT`; the unverified line blocked (IR16); verified lines may proceed. |
| Priority | Critical |

#### TC-G11-093
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC (penny-drop); ERR-G11-ACCOUNT-VERIFY |
| Type | Negative |
| Title | Penny-drop / name-IFSC mismatch fails account verification |
| Preconditions | Account name mismatch at NPCI mapper (X.3) |
| Test data | `POST /pension/accounts:verify` |
| Steps | 1. Verify a mismatched account. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-ACCOUNT-VERIFY`; result stored as FAILED (blocks first credit). |
| Priority | High |

#### TC-G11-094
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC; ERR-G11-INVALID-ACCOUNT |
| Type | Negative |
| Title | Structurally invalid bank details rejected |
| Preconditions | Malformed IFSC/account number |
| Test data | `POST /pension/accounts:verify` |
| Steps | 1. Verify malformed account. |
| Expected | `422 VALIDATION_FAILED`, `error.code=ERR-G11-INVALID-ACCOUNT`. |
| Priority | Medium |

#### TC-G11-095
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC1; auth `g11.ppo.disburse` |
| Type | Authorization |
| Title | Only AUTHORISED batches are transmitted; PDA ≠ sanctioning authority |
| Preconditions | Batch in DRAFT |
| Test data | `POST /pension/disbursements/{id}:transmit` before authorise |
| Steps | 1. Transmit un-authorised batch. |
| Expected | `409 CONFLICT` (not AUTHORISED); after authorise (SA), transmit permitted; PDA role distinct from SA (SoD). |
| Priority | High |

#### TC-G11-096
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC5; Idempotency |
| Type | API-Contract |
| Title | Idempotent transmission prevents duplicate payment |
| Preconditions | Batch transmitted with key `D1` |
| Test data | Re-transmit with same `Idempotency-Key:D1` |
| Steps | 1. Re-transmit. |
| Expected | `202` returning original transmission result; no duplicate credit (X.3 idempotency). |
| Priority | High |

#### TC-G11-097
| Field | Value |
|---|---|
| Traces-to | FR-G11-14 / AC3, BR2; §10.5 |
| Type | State-Transition |
| Title | Per-line ack reconciliation; failed lines raise exceptions, retried never abandoned |
| Preconditions | Batch TRANSMITTED; partial ack |
| Test data | `POST /pension/disbursements/{id}/ack` |
| Steps | 1. Record partial ack (some failed). |
| Expected | `200`; status → PARTIALLY_ACK then RECONCILED; failed lines raise exceptions/grievances with the bank/treasury taxonomy; retried via X.3 backoff. |
| Priority | Medium |

---

### FR-G11-15 — Self-Service Portal & Estimators

#### TC-G11-098
| Field | Value |
|---|---|
| Traces-to | FR-G11-15 / estimator; auth `g11.pensioner.self_service` |
| Type | Functional |
| Title | Outcome-framed estimate is non-binding and self-scoped |
| Preconditions | EMP logged in (self) |
| Test data | `POST /pension/estimates` (what-if) |
| Steps | 1. Run estimate. |
| Expected | `200`; non-binding `pen_benefit_estimates` snapshot; employee sees only own projection (`scope:self`). |
| Priority | Medium |

#### TC-G11-099
| Field | Value |
|---|---|
| Traces-to | FR-G11-15; ERR-G11-CASE-LOCKED-OPTIONS |
| Type | Negative |
| Title | Submitting options on a locked case is rejected |
| Preconditions | Case locked for options |
| Test data | `POST /pension/me/options` |
| Steps | 1. Submit commutation/nominee options. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-CASE-LOCKED-OPTIONS`. |
| Priority | Medium |

---

### FR-G11-16 — Grievance Management

#### TC-G11-100
| Field | Value |
|---|---|
| Traces-to | FR-G11-16; §10.7 |
| Type | State-Transition |
| Title | Grievance lifecycle OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED with SLA escalation |
| Preconditions | Pensioner raises grievance |
| Test data | `POST /pension/grievances`; `:assign`; `:resolve` |
| Steps | 1. Raise, assign, resolve, close; 2. breach SLA on another. |
| Expected | State transitions valid; SLA breach → ESCALATED (P01 timer); CLOSED may REOPEN. |
| Priority | Medium |

---

### FR-G11-17 — Forecasting & Pension-Liability Analytics

#### TC-G11-101
| Field | Value |
|---|---|
| Traces-to | FR-G11-17; auth (Auditor read) |
| Type | Functional |
| Title | Liability projection scoped and parameterised (horizon/DA scenario) |
| Preconditions | Pensioner population loaded |
| Test data | `GET /pension/analytics/liability?horizon_years=10&da_scenario_pct=5` |
| Steps | 1. Query. |
| Expected | `200`; projection scoped to caller's entity; scenario params honoured; feeds G14. |
| Priority | Low |

---

### FR-G11-18 — Service-Record Completeness & Discrepancy Resolution (3-point sign-off)

#### TC-G11-102
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / AC1 |
| Type | Data-Integrity |
| Title | Verification build enumerates every gap/discrepancy as an E28 ledger line with source |
| Preconditions | Service span vs G12 with 2 gaps |
| Test data | `POST /pension/cases/{id}/service-verification:build` |
| Steps | 1. Build. |
| Expected | `200`; `gap_count`/`discrepancy_open_count` set; each E28 line has type/period/source (G03/G04/G09/G10/G12)/required resolution. |
| Priority | High |

#### TC-G11-103
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / AC2; ERR-G11-SPELL-NOT-ATTESTED |
| Type | Negative |
| Title | Unattested non-qualifying spell blocks sign-off |
| Preconditions | One spell unattested |
| Test data | `POST /pension/cases/{id}/service-verification:signoff` |
| Steps | 1. Sign off with an unattested spell. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-SPELL-NOT-ATTESTED`. |
| Priority | High |

#### TC-G11-104
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / AC3, BR1 |
| Type | Negative |
| Title | Condonation requires an E29 order, not free text |
| Preconditions | Discrepancy resolved as "condone" without an order ref |
| Test data | `POST /pension/cases/{id}/service-verification/discrepancies/{did}:resolve` |
| Steps | 1. Resolve as condone with free text only. |
| Expected | `422 VALIDATION_FAILED` (missing E29 order); with a valid E29 order (order no/date/authority/document) → resolved and linked. |
| Priority | High |

#### TC-G11-105
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / AC4; state-machine G11 PARALLEL_ALL_OF |
| Type | State-Transition |
| Title | Sign-off requires SR Custodian + Payroll Officer + Pension Officer (P01 PARALLEL_ALL_OF) |
| Preconditions | Verification ATTESTED; only two of three attestations |
| Test data | `:signoff` |
| Steps | 1. Sign off with 2/3. 2. Complete third. |
| Expected | Step 1 blocked (not all branches joined); step 2 all three present → `signoff_complete=true` → SIGNED_OFF → LOCKED. |
| Priority | Critical |

#### TC-G11-106
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / AC5; IR2a; ERR-G11-DISCREPANCY-OPEN |
| Type | Negative |
| Title | CALCULATION gate: open discrepancy blocks certify/advance |
| Preconditions | `discrepancy_open_count>0` |
| Test data | Advance to CALCULATION |
| Steps | 1. Advance with open ledger. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-DISCREPANCY-OPEN`; requires `discrepancy_open_count=0` AND `spells_attested_count=spells_total_count`. |
| Priority | Critical |

#### TC-G11-107
| Field | Value |
|---|---|
| Traces-to | FR-G11-18 / BR3; §10.8 |
| Type | State-Transition |
| Title | Re-opening a LOCKED verification creates a new version and re-gates downstream calcs |
| Preconditions | Verification LOCKED; new evidence arrives |
| Test data | Re-open / rebuild |
| Steps | 1. Re-open. |
| Expected | New version → DRAFT; downstream FR-04/05 re-gated until re-signed. |
| Priority | Medium |

---

### FR-G11-19 — Effective-Dated Pension Rule-Table Management

#### TC-G11-108
| Field | Value |
|---|---|
| Traces-to | FR-G11-19 / AC1; edge (overlap) |
| Type | Negative |
| Title | Overlapping effective windows per key rejected |
| Preconditions | Existing EFFECTIVE E30 row overlapping the new one |
| Test data | `POST /pension/rules/da_relief_rates` (overlapping window) |
| Steps | 1. Create overlapping row. |
| Expected | `409 CONFLICT`; non-overlap constraint enforced. |
| Priority | High |

#### TC-G11-109
| Field | Value |
|---|---|
| Traces-to | FR-G11-19 / AC2, BR1; SoD |
| Type | Authorization |
| Title | Rule row approval requires an approver distinct from the maintainer |
| Preconditions | DRAFT row created by SYS-1 |
| Test data | `POST /pension/rules/da_relief_rates/{rowId}:approve` as SYS-1 then a distinct approver |
| Steps | 1. Self-approve. 2. Distinct-approve. |
| Expected | Step 1 `403 FORBIDDEN` (self-approve); step 2 `200` → APPROVED/EFFECTIVE. |
| Priority | High |

#### TC-G11-110
| Field | Value |
|---|---|
| Traces-to | FR-G11-19 / AC3, BR3; §16.4; IR17 |
| Type | Data-Integrity |
| Title | Referenced rule row is SUPERSEDED not deleted; historic calcs keep their FK |
| Preconditions | A calc references row `R1`; a new EFFECTIVE row supersedes it |
| Test data | Supersede R1; re-read historic calc |
| Steps | 1. Supersede. 2. Read old calc. |
| Expected | R1 → SUPERSEDED (soft-delete only); historic `rule_version_ref` still resolves to R1 (immutability). |
| Priority | High |

#### TC-G11-111
| Field | Value |
|---|---|
| Traces-to | FR-G11-19 / AC4; E33/E30 |
| Type | Boundary |
| Title | Gratuity ceiling auto-steps when DA crosses two thresholds at once |
| Preconditions | DA jumps 40%→110% (crosses 50% and 100%) |
| Test data | `GET /pension/rules/gratuity_ceilings/resolve?asOf=...` |
| Steps | 1. Resolve ceiling. |
| Expected | `current_effective_ceiling = ₹30,00,000.00` (two +25% steps, 20L×1.5); computed, not manually edited. |
| Priority | Medium |

---

### FR-G11-20 — Proactive Death Detection & Overpayment Recovery

#### TC-G11-112
| Field | Value |
|---|---|
| Traces-to | FR-G11-20 / AC1 |
| Type | Functional |
| Title | Reconciliation job flags probable deaths with source/confidence |
| Preconditions | Death-registry/DBT signals over X.3 |
| Test data | `POST /pension/death-detection:run`; `GET /pension/death-detection/flags` |
| Steps | 1. Run recon. 2. List flags. |
| Expected | `200`; probable-death flags carry `death_detected_source` (DEATH_REGISTRY/DBT_ANOMALY/LC_FAILURE) + confidence; advisory until confirmed. |
| Priority | High |

#### TC-G11-113
| Field | Value |
|---|---|
| Traces-to | FR-G11-20 / AC3; ERR-G11-DRAWN-AFTER-DEATH |
| Type | Financial-Integrity |
| Title | Confirmed death with post-death drawal opens E38, holds disbursement, triggers conversion |
| Preconditions | Confirmed death; drawals after date_of_death `₹50,000.00` × 2 months |
| Test data | Confirm + `POST /pension/overpayments` |
| Steps | 1. Confirm death. 2. Open recovery. |
| Expected | E38 opened for `₹1,00,000.00`; disbursement held; FR-12 conversion triggered; further drawal `409 ERR-G11-DRAWN-AFTER-DEATH`. |
| Priority | High |

#### TC-G11-114
| Field | Value |
|---|---|
| Traces-to | FR-G11-20 / AC4 |
| Type | State-Transition |
| Title | Recovery modes FROM_FAMILY_PENSION / FROM_ESTATE / FROM_LEGAL_HEIR / WRITE_OFF, each P05-audited |
| Preconditions | E38 IDENTIFIED |
| Test data | `POST /pension/overpayments/{id}:recover` (each mode) |
| Steps | 1. Record partial recovery. 2. Write-off remainder (authority). |
| Expected | E38 IDENTIFIED→NOTIFIED→UNDER_RECOVERY→RECOVERED/WRITTEN_OFF; partial tracked; each mutation P05-audited; write-off needs authority. |
| Priority | High |

#### TC-G11-115
| Field | Value |
|---|---|
| Traces-to | FR-G11-20 / AC5 |
| Type | Functional |
| Title | "Pension drawn after death" exception report lists open drawals with ageing |
| Preconditions | ≥1 open post-death drawal |
| Test data | `GET /pension/reports/drawn-after-death` |
| Steps | 1. Query. |
| Expected | `200`; report lists all open post-death drawals with ageing buckets. |
| Priority | Medium |

#### TC-G11-116
| Field | Value |
|---|---|
| Traces-to | FR-G11-20 / edge (false positive); §X.3 |
| Type | Boundary |
| Title | False-positive registry match dismissible with reason; signal source down degrades gracefully |
| Preconditions | Live pensioner falsely matched; then X.3 source down |
| Test data | Dismiss flag; re-run with source down |
| Steps | 1. Dismiss false positive. 2. Run with source down. |
| Expected | Dismissed with reason (P05); no recovery opened; source-down → X.3 circuit-break, flags carried over, job degrades (no crash). |
| Priority | Medium |

---

### FR-G11-21 — PDA Registry & Disbursement Model

#### TC-G11-117
| Field | Value |
|---|---|
| Traces-to | FR-G11-21 / AC2, BR3; ERR-G11-PDA-NOT-CERTIFIED |
| Type | Negative |
| Title | PDA cannot go live until sandbox-certified |
| Preconditions | PDA `sandbox_certified=false` |
| Test data | `POST /pension/pdas/{id}:activate` |
| Steps | 1. Activate uncertified PDA. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-PDA-NOT-CERTIFIED`. |
| Priority | High |

#### TC-G11-118
| Field | Value |
|---|---|
| Traces-to | FR-G11-21 / AC1, BR2 |
| Type | Data-Integrity |
| Title | PDA records model + P04 credential ref; bound pensioner inherits model (denormalised) |
| Preconditions | PDA registered with model PDA_APPLIES_RELIEF |
| Test data | `POST /pension/pdas`; bind to a PPO |
| Steps | 1. Register. 2. Bind. |
| Expected | E37 records model/interface/contract-version/ack-schema/penny-drop/P04 cred ref; `pensioners.disbursement_model` = PDA_APPLIES_RELIEF; credentials never inline. |
| Priority | Medium |

#### TC-G11-119
| Field | Value |
|---|---|
| Traces-to | FR-G11-21 / AC5; edge (model change) |
| Type | State-Transition |
| Title | Changing a PDA's model is P05-audited and re-certified in sandbox before effect |
| Preconditions | ACTIVE PDA changing treasury→CPPC |
| Test data | Update model; re-certify |
| Steps | 1. Change model. |
| Expected | Change requires re-certification before taking effect; P05 audit; FR-13/14 branch updates only post-recert. |
| Priority | Medium |

---

### FR-G11-22 — Provisional Pension (Rule 9)

#### TC-G11-120
| Field | Value |
|---|---|
| Traces-to | FR-G11-22 / AC1, AC2 |
| Type | Financial-Integrity |
| Title | Provisional pension payable from commencement; DCRG fully withheld |
| Preconditions | `proceedings_pending=true`, G09 ref present |
| Test data | `POST /pension/cases/{id}/provisional-pension` |
| Steps | 1. Create provisional. |
| Expected | `201`; E41 row + PROVISIONAL PPO; provisional pension from commencement (no break); `dcrg_withheld=true`, amount captured, excluded from settlement payout. |
| Priority | High |

#### TC-G11-121
| Field | Value |
|---|---|
| Traces-to | FR-G11-22 / AC4, BR1; ERR-G11-PROVISIONAL-PENDING |
| Type | Negative |
| Title | DCRG release / final sanction blocked while proceedings ACTIVE |
| Preconditions | E41 status ACTIVE (proceedings ACTIVE) |
| Test data | Attempt DCRG release / final sanction |
| Steps | 1. Release DCRG while ACTIVE. |
| Expected | `409 CONFLICT`, `error.code=ERR-G11-PROVISIONAL-PENDING`. |
| Priority | High |

#### TC-G11-122
| Field | Value |
|---|---|
| Traces-to | FR-G11-22 / AC3; §10.9 (EXONERATED) |
| Type | State-Transition |
| Title | Conclusion EXONERATED → release DCRG + final PPO supersedes provisional |
| Preconditions | E41 ACTIVE |
| Test data | `POST /pension/cases/{id}/provisional-pension:conclude` `{conclusion_outcome:EXONERATED}` |
| Steps | 1. Conclude. |
| Expected | `200`; E41 → CONCLUDED_REGULARISED; DCRG released; final PPO supersedes provisional; provisional adjusted with arrears. |
| Priority | High |

#### TC-G11-123
| Field | Value |
|---|---|
| Traces-to | FR-G11-22 / AC3; §10.9 (PENALTY_WITH_RECOVERY) |
| Type | State-Transition |
| Title | Conclusion PENALTY_WITH_RECOVERY → recover then release balance |
| Preconditions | E41 ACTIVE |
| Test data | `:conclude` `{conclusion_outcome:PENALTY_WITH_RECOVERY}` |
| Steps | 1. Conclude. |
| Expected | `200`; E41 → CONCLUDED_RECOVERY; decided recovery applied, then withheld balance released. |
| Priority | Medium |

#### TC-G11-124
| Field | Value |
|---|---|
| Traces-to | FR-G11-22 / AC4; VALIDATION_FAILED |
| Type | Negative |
| Title | Missing G09 proceedings ref rejected |
| Preconditions | No `proceedings_ref` |
| Test data | Create provisional without ref |
| Steps | 1. Create. |
| Expected | `422 VALIDATION_FAILED`; proceedings ref mandatory. |
| Priority | Medium |

---

### FR-G11-23 — Audit Objection Management

#### TC-G11-125
| Field | Value |
|---|---|
| Traces-to | FR-G11-23 / AC1, AC2; auth (Auditor read + P05) |
| Type | Functional |
| Title | Objection captures source + linked case/PPO/pensioner + disputed calc_trace; SLA set |
| Preconditions | AUD raises against a case's `calc_trace` |
| Test data | `POST /pension/audit-objections` |
| Steps | 1. Raise objection. |
| Expected | `201`; captures source/link/`calc_trace` ref/text; SLA due date set (P01); routes to responsible PO. |
| Priority | Medium |

#### TC-G11-126
| Field | Value |
|---|---|
| Traces-to | FR-G11-23 / AC3, BR2; §16.4 |
| Type | Data-Integrity |
| Title | ACCEPTED_CORRECTED closure links a pen_revisions correction (never a silent edit) |
| Preconditions | Objection RESPONDED |
| Test data | `POST /pension/audit-objections/{id}:close` `{outcome:ACCEPTED_CORRECTED}` |
| Steps | 1. Close with correction. |
| Expected | `200`; links a `pen_revisions` correction; correction outside the revision workflow → `409 CONFLICT`; P05 audit. |
| Priority | High |

#### TC-G11-127
| Field | Value |
|---|---|
| Traces-to | FR-G11-23 / BR1; VALIDATION_FAILED |
| Type | Negative |
| Title | Close without a recorded outcome/rationale rejected |
| Preconditions | Objection RESPONDED |
| Test data | `:close` without outcome |
| Steps | 1. Close with no outcome. |
| Expected | `422 VALIDATION_FAILED`. |
| Priority | Medium |

---

### FR-G11-24 — Digital Delivery & DigiLocker / DBT Linkage

#### TC-G11-128
| Field | Value |
|---|---|
| Traces-to | FR-G11-24 / AC1, AC5 |
| Type | Functional |
| Title | Authorised e-PPO pushed to DigiLocker; ref recorded and status visible |
| Preconditions | PPO AUTHORISED |
| Test data | `POST /pension/ppos/{id}:deliver-digilocker`; `GET .../delivery-status` |
| Steps | 1. Deliver. 2. Query status. |
| Expected | `200`; `digilocker_pushed=true`, `digilocker_ref` set; status delivered/queued visible to pensioner + officer. |
| Priority | Medium |

#### TC-G11-129
| Field | Value |
|---|---|
| Traces-to | FR-G11-24 / AC4 |
| Type | Boundary |
| Title | DigiLocker push failure is non-blocking (X.3 retry) and does not block PPO authorisation |
| Preconditions | DigiLocker down |
| Test data | Authorise PPO then deliver |
| Steps | 1. Authorise (PPO active). 2. Deliver while down. |
| Expected | PPO authorisation succeeds; delivery queues on X.3 retry (failed-retrying); self-service fallback download available. |
| Priority | Medium |

#### TC-G11-130
| Field | Value |
|---|---|
| Traces-to | FR-G11-24 / AC3, BR2; PII masking (P02) |
| Type | Data-Integrity |
| Title | PPO linked to Aadhaar/PRAN stored encrypted & masked on serialization |
| Preconditions | Pensioner Aadhaar/PRAN provided |
| Test data | `POST /pension/pensioners/{id}:link-aadhaar-pran` |
| Steps | 1. Link. 2. Read pensioner as non-owner role. |
| Expected | `aadhaar_masked`/`pran` linked; TIER-1 masked on serialization by P02 (over-broad query cannot leak); access logged. |
| Priority | High |

---

### SR-Ledger Posting Contract (§8.7) & End-to-End

#### TC-G11-131
| Field | Value |
|---|---|
| Traces-to | §8.7 writer; FR-G11-02 closure |
| Type | Data-Integrity |
| Title | Case closure posts SEPARATION/SUPERANNUATION to POST /api/v1/sr/ingest with source_module="G11" |
| Preconditions | SUPERANNUATION case reaching closure |
| Test data | Close case; inspect SR ingest call |
| Steps | 1. Close case. |
| Expected | Posting to canonical `POST /api/v1/sr/ingest` (not `/sr/events`); dedup tuple `(source_module="G11", source_reference_id=case/sanction id, source_event_version)`; explicit `tenant_id`+`entity_id`; `SUPERANNUATION` sends `fact_key` (missing → `SR_FACT_KEY_REQUIRED`); append is in the same transaction as closure; P05 captures it. |
| Priority | High |

#### TC-G11-132
| Field | Value |
|---|---|
| Traces-to | §8.7; DEATH_IN_SERVICE boundary |
| Type | Data-Integrity |
| Title | G11 posts DEATH_IN_SERVICE separation consequence but NOT the DECEASED master flag |
| Preconditions | Death-in-service case closure |
| Test data | Close; inspect SR ingest |
| Steps | 1. Close. |
| Expected | `DEATH_IN_SERVICE` event posted by G11; `DECEASED` master identity flag NOT posted by G11 (owned by G01); `FAMILY_PENSION_SANCTIONED` posted on FP sanction. |
| Priority | High |

#### TC-G11-133
| Field | Value |
|---|---|
| Traces-to | §8.7 reversal; §16.4 |
| Type | Data-Integrity |
| Title | SR correction is supersede-only via /sr/ingest/reversal (never delete/edit) |
| Preconditions | A posted separation event needs correction |
| Test data | `POST /api/v1/sr/ingest/reversal` |
| Steps | 1. Reverse. |
| Expected | Uses `is_reversal=true` + `reverses_source_reference_id`; `source_event_version` increments on supersession; no hard delete; G12 auto-spawns corrigendum. |
| Priority | Medium |

#### TC-G11-134
| Field | Value |
|---|---|
| Traces-to | §8.7 façade rule |
| Type | API-Contract |
| Title | Module façade must relay to /sr/ingest, never write the ledger table directly |
| Preconditions | Internal `:post-to-sr` façade invoked |
| Test data | Trigger façade |
| Steps | 1. Invoke façade. |
| Expected | Relays to `POST /api/v1/sr/ingest`; does not use `/api/v1/sr/events`; does not write ledger directly. |
| Priority | Medium |

#### TC-G11-135
| Field | Value |
|---|---|
| Traces-to | FR-G11-02..14, §8.7, §16.1 |
| Type | E2E-Flow |
| Title | Full superannuation E2E: separation → 3-point verification → pension calc → PPO → SR post → disbursement |
| Preconditions | `EMP-SUP-01`; rule tables EFFECTIVE; PDA certified (M11_COMPUTES_FULL) |
| Test data | End-to-end run following §16.1 sequence |
| Steps | 1. Create SUPERANNUATION case (PO). 2. Build + 3-point sign-off verification (SRC+PAYO+PO). 3. Compute QSR (33y) + lock. 4. Compute pension `₹50,000.00`. 5. Commutation 40% → value `₹19,66,560.00`, residual `₹30,000.00`. 6. Retirement gratuity `₹24,75,000.00`. 7. Settlement + tax. 8. Sanction (SA). 9. Generate + authorise SERVICE_PENSION PPO; SR `SUPERANNUATION` posted to `/sr/ingest`. 10. Penny-drop PASSED. 11. Transmit first-pension disbursement. |
| Expected | Case DRAFT→…→CLOSED; each gate enforced; exact monetary values as above; PPO effective-from = day after retirement (no break); SR `SUPERANNUATION` event with `source_module="G11"` + `fact_key`; disbursement transmitted only after account PASSED; full immutable P05 trail. |
| Priority | Critical |

#### TC-G11-136
| Field | Value |
|---|---|
| Traces-to | FR-G11-02/08/11/12, §8.7 |
| Type | E2E-Flow |
| Title | Death-in-service E2E: case → family pension (IN_SERVICE) → FAMILY_PENSION PPO → SR post |
| Preconditions | DEATH_IN_SERVICE; E26 spouse rank 1 |
| Test data | End-to-end death-in-service |
| Steps | 1. Create DEATH_IN_SERVICE case. 2. Death gratuity + FP (IN_SERVICE, enhanced 10y). 3. Sanction. 4. Authorise FAMILY_PENSION PPO. 5. SR posts `DEATH_IN_SERVICE` + `FAMILY_PENSION_SANCTIONED`. |
| Expected | Enhanced `₹50,000.00` for 10y then normal `₹30,000.00`; DECEASED master flag NOT posted by G11; both SR events posted to `/sr/ingest`; compassionate fast-track. |
| Priority | High |

#### TC-G11-137
| Field | Value |
|---|---|
| Traces-to | FR-G11-05/13; §16.9; determinism (G2) |
| Type | Financial-Integrity |
| Title | Determinism regression: re-run whole case with snapshotted rule versions is identical |
| Preconditions | Completed case snapshot with `rule_version_ref` FKs |
| Test data | Re-run engines with same signed-off inputs + snapshotted versions |
| Steps | 1. Re-run pension/commutation/gratuity/revision. |
| Expected | All figures + `calc_trace` byte-identical; concurrent-event order per §16.9 stable; indicative NPS/UPS-annuity fields excluded. |
| Priority | High |

---

### Authorization & Multi-Tenancy (cross-cutting)

#### TC-G11-138
| Field | Value |
|---|---|
| Traces-to | Auth-matrix G11; RBAC §0.1 scoping |
| Type | Authorization |
| Title | Cross-entity read of another department's case returns NOT_FOUND (no existence leak) |
| Preconditions | PO scoped to `E-REV`; case in `E-HEALTH` |
| Test data | `GET /pension/cases/{healthCaseId}` as E-REV PO |
| Steps | 1. Read out-of-scope case. |
| Expected | `404 NOT_FOUND` (indistinguishable from absent; P02 never leaks existence). |
| Priority | High |

#### TC-G11-139
| Field | Value |
|---|---|
| Traces-to | RBAC; auth (unauthenticated) |
| Type | Authorization |
| Title | Missing/expired bearer token → UNAUTHENTICATED |
| Preconditions | No/expired JWT |
| Test data | `GET /pension/cases/{id}` without token |
| Steps | 1. Call without token. |
| Expected | `401 UNAUTHENTICATED`. |
| Priority | High |

#### TC-G11-140
| Field | Value |
|---|---|
| Traces-to | Auth-matrix `g11.invalidation.assess` |
| Type | Authorization |
| Title | Only Medical Board may certify invalidation; PO cannot |
| Preconditions | INVALIDATION case |
| Test data | Certify invalidation as PO vs MED |
| Steps | 1. Certify as PO. 2. Certify as MED. |
| Expected | Step 1 `403 FORBIDDEN`; step 2 `200` (case-scoped TIER-2 medical). |
| Priority | Medium |

#### TC-G11-141
| Field | Value |
|---|---|
| Traces-to | RBAC PII ceiling; §3.9 |
| Type | Authorization |
| Title | Bank/PAN/Aadhaar TIER-1 fields masked to non-privileged roles; reveal audited |
| Preconditions | Pensioner with bank/PAN/Aadhaar |
| Test data | Read pensioner as a manager vs PO |
| Steps | 1. Read as manager. 2. Reveal as PO. |
| Expected | Manager sees masked (last-4/hidden) — PII ceiling overrides upward; PO audited reveal; over-broad query cannot leak a masked field. |
| Priority | High |

#### TC-G11-142
| Field | Value |
|---|---|
| Traces-to | NFR security; MFA high-privilege statutory roles |
| Type | Authorization |
| Title | High-privilege statutory action requires MFA step-up |
| Preconditions | SA session without MFA |
| Test data | `POST /pension/cases/{id}:sanction` |
| Steps | 1. Sanction without MFA. |
| Expected | Blocked pending MFA step-up (PO/SA/PDA/SRC are MFA-enforced); after step-up, permitted. |
| Priority | High |

---

## 3. Traceability Matrix (FR → TC ids)

| FR | Title | Test cases | Gaps |
|---|---|---|---|
| FR-G11-01 | Retirement forecasting & due-lists | TC-001, 002, 003, 004 | none |
| FR-G11-02 | Separation case mgmt (all types) | TC-005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 131, 132, 135, 136 | none |
| FR-G11-03 | Pre-retirement (SR verify, no-dues, anticipatory) | TC-017, 018, 019, 020, 021 | none |
| FR-G11-04 | Qualifying service (G03/G04 leave data) | TC-022, 023, 024, 025, 026, 027, 028, 029, 030, 135 | none |
| FR-G11-05 | Pension calc (OPS/NPS/UPS/service gratuity) | TC-031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 135, 137 | none |
| FR-G11-06 | Commutation | TC-042, 043, 044, 045, 046, 047, 135 | none |
| FR-G11-07 | Gratuity (DA-stepped ceiling) | TC-048, 049, 050, 051, 052, 053, 054, 135 | none |
| FR-G11-08 | Family & enhanced family pension | TC-055, 056, 057, 058, 059, 060, 061, 062, 063, 136 | none |
| FR-G11-09 | Terminal settlement + tax/TDS | TC-064, 065, 066, 067, 068, 069, 070, 135 | none |
| FR-G11-10 | GPF final withdrawal | TC-071, 072, 073 | none |
| FR-G11-11 | PPO / e-PPO | TC-074, 075, 076, 077, 078, 079, 135, 136 | none |
| FR-G11-12 | Pensioner master & lifecycle | TC-080, 081, 082, 083, 084, 085, 086, 136 | none |
| FR-G11-13 | Pension revision (DA/pay-commission) | TC-087, 088, 089, 090, 091, 137 | none |
| FR-G11-14 | Treasury/PDA integration + penny-drop | TC-092, 093, 094, 095, 096, 097, 135 | none |
| FR-G11-15 | Self-service portal & estimators | TC-098, 099 | none |
| FR-G11-16 | Grievance management | TC-100 | none |
| FR-G11-17 | Forecasting & liability analytics | TC-101 | none |
| FR-G11-18 | Service-record completeness & discrepancy (3-point) | TC-102, 103, 104, 105, 106, 107, 135 | none |
| FR-G11-19 | Effective-dated rule tables | TC-108, 109, 110, 111 | none |
| FR-G11-20 | Proactive death detection & recovery | TC-085, 112, 113, 114, 115, 116 | none |
| FR-G11-21 | PDA registry & disbursement model | TC-117, 118, 119 | none |
| FR-G11-22 | Provisional pension (Rule 9) | TC-013, 054, 120, 121, 122, 123, 124 | none |
| FR-G11-23 | Audit objection management | TC-125, 126, 127 | none |
| FR-G11-24 | Digital delivery & DigiLocker/DBT | TC-128, 129, 130 | none |
| §8.7 | SR-ledger posting contract | TC-131, 132, 133, 134, 135, 136 | none |
| X-cut | Authorization / multi-tenancy / PII / MFA | TC-014, 018, 073, 095, 138, 139, 140, 141, 142 | none |

**FR coverage: 24 of 24 FRs + SR-posting contract (§8.7) covered — 0 gaps.**

---

## 4. Coverage Summary

### 4.1 By type

| Type | Count |
|---|---|
| Financial-Integrity | 31 |
| Negative | 31 |
| State-Transition | 23 |
| Functional | 14 |
| Boundary | 14 |
| Data-Integrity | 12 |
| Authorization | 11 |
| API-Contract | 4 |
| E2E-Flow | 2 |
| **Total** | **142** |

> Note: each TC is tallied once under its primary type. Several cases carry a secondary dimension (e.g. an Authorization case that is also a State-Transition) noted in the case body. Total distinct test cases = **142** (TC-G11-001 … TC-G11-142).

### 4.2 By priority

| Priority | Count |
|---|---|
| Critical | 14 |
| High | 80 |
| Medium | 47 |
| Low | 1 |
| **Total** | **142** |

### 4.3 Mandatory-coverage checklist

| Required area | Covered by |
|---|---|
| Separation types (superannuation/VRS/compulsory/invalidation/death/resignation) | TC-005, 006, 007, 008, 009, 010, 015 |
| Retirement forecasting / due-lists | TC-001…004 |
| 3-point service verification (P01 PARALLEL_ALL_OF) + discrepancy resolution | TC-102, 103, 104, 105, 106, 107 |
| Qualifying-service from G03/G04 leave data (LWP/dies-non exact months) | TC-022, 023, 024, 025, 026, 027, 028 |
| Pension calc (OPS/NPS/UPS/service-gratuity + formula + ceiling) | TC-031…041 |
| Commutation (value + restoration timing) | TC-042, 045, 046, 082 |
| Gratuity (DA-stepped ceiling) | TC-048, 049, 050, 051, 052 |
| Family pension (enhanced vs normal, path-specific window, dual/twin) | TC-055, 056, 057, 061, 062 |
| Terminal settlement + tax (89(1), ₹20L cap) | TC-064, 065, 066, 067 |
| PPO / e-PPO | TC-074…079, 128 |
| Pensioner lifecycle (LC/Jeevan Pramaan, conversion on death) | TC-080, 083, 084, 085 |
| Effective-dated rule tables (DA revision) | TC-108, 109, 110, 111, 050 |
| Death detection + overpayment recovery | TC-112, 113, 114, 115, 116 |
| Penny-drop bank verification (X.3) | TC-092, 093, 094 |
| E2E: separation → verification → calc → PPO → SR /sr/ingest posting | TC-135, 136, 131, 132 |
| Boundary (qualifying-service rounding, min/max pension) | TC-024, 025, 027, 028, 033, 034 |
| State-transition (valid + invalid) | TC-013, 017, 021, 054, 077, 083, 105, 106, 122, 123 |
| Financial-integrity | 26 cases (see 4.1) |
| Authorization | TC-014, 018, 073, 095, 138…142 |
