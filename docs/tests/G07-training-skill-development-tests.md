# G07 — Training and Skill Development — Acceptance & E2E Test Suite

## 1. Header

| Item | Value |
|---|---|
| Module | G07 — Training and Skill Development Management (alias GOV-M07; supersedes M07-TSD) |
| BRD | `/Users/n15318/hrms/docs/brd/v3/G07-training-skill-development.md` (v3.0, FR-G07-001 … FR-G07-024) |
| API contract | `/Users/n15318/hrms/docs/contracts/openapi/G07.yaml` (v3.0.0) |
| Error taxonomy | `/Users/n15318/hrms/docs/contracts/error-taxonomy.yaml` (ERR-G07-*, 8 standard wire codes, shared ERR-*) |
| State machines | `/Users/n15318/hrms/docs/contracts/state-machines.yaml` (nomination, training_session, certification, sponsorship_bond, sr_posting) |
| Auth matrix | `/Users/n15318/hrms/docs/contracts/auth-matrix.yaml` (G07 roles + action codes) |
| Scope | Competency framework & skill-gap; needs→plan→nomination→session→attendance→assessment→feedback→certification; mandatory-compliance campaign engine; certification validity/renewal; external credentials + verification; LMS/LRS (SCORM poll / xAPI) via X.3; vendor empanelment; sponsorship/study-leave bond; DPDP retention/erasure; SR posting to G12; Gap Contract to G06/G08 |

### 1.1 Traceability model
Every test carries **Traces-to** (FR + acceptance-criterion / business-rule / edge-case anchor). Negative cases assert the **exact wire status + code** from `error-taxonomy.yaml`. The Traceability Matrix (§3) proves 0 gaps across FR-G07-001…024.

### 1.2 Standard wire codes (asserted in negatives)
`VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500). Module codes carried in `error.code`: `ERR-G07-CAPACITY`, `ERR-G07-BUDGET`, `ERR-G07-EMPANEL`, `ERR-G07-SCHEDULE`, `ERR-G07-CERT-INELIGIBLE`, `ERR-G07-WCAG`, `ERR-G07-BOND`, `ERR-G07-RETENTION`, `ERR-G07-MANDATORY`; shared: `ERR-FORBIDDEN`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-REASON-REQ`, `ERR-LOADFAIL`.

### 1.3 Test-environment & data assumptions
- **Multi-tenant:** Primary tenant `TEN-A` / entity `ENT-A1`; isolation tenant `TEN-B` / entity `ENT-B1`. Every G07 row carries `tenant_id`/`entity_id`; unscoped queries are rejected, not defaulted to "all" (Platform §0.1). Cross-tenant access is `NOT_FOUND` (never leaks existence).
- **Platform engines are stubbed/contract-mocked, invoked by contract:** P01 WorkflowEngine (approvals), P02 Authorization.check (RBAC/SoD/scope/field-mask), P04 `integration_credentials` (LMS/LRS secrets), P05 audit trigger (immutable `audit_log` + `security_audit_log`), X.1 job runner (`JOB-G07-*`), X.2 notifications (`MSG-G07-*`), X.3 integration framework (LMS/LRS/G12/G10 outbound, circuit-breaker, idempotency), G13 documents, G01 employee master + joiner/exit events.
- **Seed roles (P02 principals):** `emp-101` Employee; `mgr-201` Manager L1 (has-reportees, manager-of-record for emp-101); `ldo-301` L&D Officer (`g07.catalog.manage`); `ldm-401` L&D Manager (`g07.plan.approve`, `ld.campaign-launch`); `dhd-501` Dept Head/Appointing Authority; `trn-601` Trainer (session-scoped); `fin-701` Finance Admin; `ksk-801` Kiosk Operator; `ven-901` Vendor Mgr (`ld.vendor-admin`); `dpo-111` DPO; `aud-121` Auditor (read-only); `sys-131` SysAdmin. `emp-909` = non-login field staff (has `service_no`, no login).
- **Seed masters:** proficiency levels `L1..L5` (contiguous, descriptors set); compliance skill `SKL-CYBER` (`is_compliance_skill=true`, `default_validity_months=12`); competency `CMP-CYBER` (COMPLIANCE, critical); competency model `CM-CLERK` (scope DESIGNATION, PUBLISHED, target L3); mandatory program `PRG-CYBER` (`is_mandatory=true`, cert-on-completion, validity 12m); e-learning program `PRG-ELRN` (LRS connector `LRS-PRIMARY` `is_primary=true`, content package published, WCAG AA); external-provider program `PRG-EXT`.
- **Feature flags:** developmental layer OFF at launch — `ld.gap-weighted`, `ld.recommendations`, `ld.marketplace`, `ld.cpd-targets`, `ld.lms-lrs` default OFF unless a case grants them.
- **Conventions:** REST `/api/v1`; cursor pagination (`limit` default 25/max 100, `next_cursor`); unsafe transactional POSTs require `Idempotency-Key` (24h replay → original result); `X-Correlation-Id` echoed on every response; canonical error envelope `{error:{code,message,field,details}}`; UTC storage, `DD-MMM-YYYY` display, INR banker's-rounding to paise.
- **Clock control:** test harness can advance simulated time to fire nightly jobs (`JOB-G07-FRESHNESS`, `JOB-G07-CERTEXPIRY`, `JOB-G07-CAMPAIGN`, `JOB-G07-MODELREVIEW`, `JOB-G07-INDUCTION`, `JOB-G07-LMSSYNC`, `JOB-G07-EMPANELEXPIRE`).

### 1.4 Priority legend
P1 = statutory/compliance/security-critical; P2 = core happy-path & major rules; P3 = secondary/edge/analytics.

---

## 2. Test Cases

### FR-G07-001 — Skill Taxonomy & Competency Framework

| Field | Value |
|---|---|
| **TC-G07-001** | |
| Traces-to | FR-G07-001 AC.1, AC.2 |
| Type | Functional / State-Transition |
| Title | L&D Officer creates and publishes a skill via P01 master-data flow |
| Preconditions | `ldo-301` and `ldm-401` provisioned; category `SKC-TECH` PUBLISHED |
| Test data | `{ skillCategoryId: SKC-TECH, code: "SKL-SQL", name: "SQL", isComplianceSkill: false }` |
| Steps | 1. `ldo-301` POST `/skills` (DRAFT). 2. POST `/skills/{id}:publish` with `Idempotency-Key`. 3. `ldm-401` approves the P01 task. 4. GET `/skills/{id}`. |
| Expected | 201 DRAFT; publish returns 202 Accepted (P01 `startInstance`); after approval `status=PUBLISHED`; P05 `audit_log` row written for insert + publish; `X-Correlation-Id` echoed. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-002** | |
| Traces-to | FR-G07-001 AC.6; VAL-G07-ANCHOR |
| Type | Negative / Boundary |
| Title | Publish a proficiency level with empty behavioural anchor is rejected |
| Preconditions | Proficiency level `PL-X` created in DRAFT with `descriptor=""` |
| Test data | `descriptor: ""` |
| Steps | 1. `ldo-301` POST `/proficiency-levels` with blank descriptor. 2. Attempt publish. |
| Expected | Publish rejected **422 VALIDATION_FAILED**, `error.field="descriptor"` (VAL-G07-ANCHOR); level stays DRAFT. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-003** | |
| Traces-to | FR-G07-001 AC.4, AC.7; VAL-G07-REVAL |
| Type | Negative / Boundary |
| Title | Compliance-skill validity mandatory; revalidation interval boundary |
| Preconditions | Category PUBLISHED |
| Test data | (a) `isComplianceSkill:true, defaultValidityMonths:null`; (b) `isComplianceSkill:false, revalidationIntervalMonths:0` |
| Steps | 1. POST skill (a). 2. POST skill (b). |
| Expected | (a) **422 VALIDATION_FAILED** — compliance skill requires `defaultValidityMonths`; (b) **422 VALIDATION_FAILED** field `revalidationIntervalMonths` (VAL-G07-REVAL, must be ≥1). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-004** | |
| Traces-to | FR-G07-001 AC.5, edge cases; ERR-DUP-INSTANCE |
| Type | Negative / Data-Integrity |
| Title | Duplicate code and archive-in-use blocks |
| Preconditions | Skill `SKL-SQL` PUBLISHED under category `SKC-TECH` |
| Test data | Second skill with `code:"SKL-SQL"`; archive request on `SKC-TECH` |
| Steps | 1. POST `/skills` duplicate code. 2. POST `/skill-categories/{SKC-TECH}` archive. |
| Expected | 1. **409 CONFLICT** (`ERR-DUP-INSTANCE` semantics, VAL-MASTER-UNIQUE). 2. **409 CONFLICT** (`ERR-PRECOND` — category has PUBLISHED child skills). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-005** | |
| Traces-to | FR-G07-001 AC.3; business rule (code immutable once PUBLISHED) |
| Type | Data-Integrity / Negative |
| Title | PUBLISHED skill code is immutable |
| Preconditions | `SKL-SQL` PUBLISHED |
| Test data | PATCH body `{ code:"SKL-SQL2" }` |
| Steps | 1. `ldo-301` PATCH `/skills/{id}` changing `code`. |
| Expected | **409 CONFLICT** (immutable-record edit); `name`/`description` remain editable; audit row on any allowed change. |
| Priority | P3 |

### FR-G07-002 — Competency Models & Governance

| Field | Value |
|---|---|
| **TC-G07-006** | |
| Traces-to | FR-G07-002 AC.1; VAL-G07-SCOPEKEY |
| Type | Negative / Boundary |
| Title | ROLE-scoped model without role_id rejected |
| Preconditions | `ldo-301` provisioned |
| Test data | `{ scopeType:"ROLE", roleId:null, name:"Sec Analyst", ownerId:emp-101, reviewDueDate, effectiveFrom }` |
| Steps | 1. POST `/competency-models`. |
| Expected | **422 VALIDATION_FAILED** field `roleId` (VAL-G07-SCOPEKEY — exactly one scope key per scope_type). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-007** | |
| Traces-to | FR-G07-002 AC.3, AC.4; business rule (scope precedence) |
| Type | Functional |
| Title | Employee resolves to exactly one effective model — most specific scope wins |
| Preconditions | GENERIC model + DESIGNATION model `CM-CLERK` both PUBLISHED covering emp-101 |
| Test data | emp-101 designation = clerk |
| Steps | 1. GET `/employees/emp-101/effective-competency-model`. |
| Expected | 200 returns `CM-CLERK` (DESIGNATION > ROLE > CADRE > ORG_UNIT > GENERIC); exactly one model. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-008** | |
| Traces-to | FR-G07-002 AC.5, AC.6; JOB-G07-MODELREVIEW |
| Type | State-Transition / Integration |
| Title | Overdue model flagged STALE and stamps model_stale_flag on gap compute |
| Preconditions | Model `CM-CLERK` with `reviewDueDate` in the past |
| Test data | simulated clock past review-due |
| Steps | 1. Run `JOB-G07-MODELREVIEW`. 2. GET `/competency-models/staleness-report`. 3. Compute a gap analysis against `CM-CLERK`. |
| Expected | Model appears STALE; X.2 `MSG-G07-MODEL-REVIEW` dispatched; gap analysis returns 201 with `modelStaleFlag=true` + warning (compute allowed). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-009** | |
| Traces-to | FR-G07-002 AC.3; business rule (non-overlapping effective periods) |
| Type | Negative / Data-Integrity |
| Title | Overlapping effective periods for same scope+version rejected |
| Preconditions | `CM-CLERK` v1 effective 01-Apr-2026..open |
| Test data | New version effective 01-Jan-2026 (overlaps) |
| Steps | 1. Publish new version with overlapping window. |
| Expected | **409 CONFLICT** (effective periods cannot overlap for same scope). |
| Priority | P3 |

### FR-G07-003 — Employee Skill Inventory, Assessment & Freshness

| Field | Value |
|---|---|
| **TC-G07-010** | |
| Traces-to | FR-G07-003 AC.1, AC.2, AC.3 |
| Type | Functional / Data-Integrity |
| Title | Declare skill → manager validate → append-only history |
| Preconditions | `SKL-SQL` PUBLISHED; `mgr-201` manager-of-record for emp-101 |
| Test data | `{ skillId:SKL-SQL, currentProficiencyLevelId:L2, source:SELF }` |
| Steps | 1. emp-101 POST `/employees/emp-101/skills` (DECLARED). 2. `mgr-201` POST `.../skills/SKL-SQL:validate` to L3. 3. GET inventory. |
| Expected | Row VALIDATED, `validatedBy=mgr-201`, `validatedAt`/`lastValidatedAt` set; each change appends immutable `skill_assessments` row (P05 also captures mutation); `UNIQUE(tenant,employee,skill)` upheld (one current row). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-011** | |
| Traces-to | FR-G07-003 AC.2; business rule (self-validation forbidden) |
| Type | Authorization / Negative |
| Title | Self-validation of own skill is forbidden (SoD) |
| Preconditions | emp-101 has DECLARED `SKL-SQL` |
| Test data | emp-101 principal |
| Steps | 1. emp-101 POST `/employees/emp-101/skills/SKL-SQL:validate`. |
| Expected | **403 FORBIDDEN** (`ERR-FORBIDDEN`, P02 SoD — validator ≠ subject). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-012** | |
| Traces-to | FR-G07-003 AC.5, AC.6; §5.6 rule 12; JOB-G07-FRESHNESS |
| Type | State-Transition / Integration |
| Title | Nightly freshness job sets STALE and EXPIRED |
| Preconditions | Non-compliance skill with `revalidationIntervalMonths=6`, `lastValidatedAt` 7 months ago; compliance skill with `expiresOn` yesterday |
| Test data | simulated clock advanced |
| Steps | 1. Run `JOB-G07-FRESHNESS`. 2. GET `/employees/emp-101/skills?freshness=STALE`. |
| Expected | Stale skill `freshnessStatus=STALE` (status unchanged), X.2 `MSG-G07-SKILL-STALE`; expired skill auto-transitions status `EXPIRED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-013** | |
| Traces-to | FR-G07-003 AC.4; FR-G07-012 linkage |
| Type | Integration / Data-Integrity |
| Title | Certificate issuance auto-populates skill source=CERTIFICATION with expiry |
| Preconditions | emp-101 completes `PRG-CYBER`; cert issued valid 12m |
| Test data | cert validity 12 months |
| Steps | 1. Issue certificate. 2. GET employee skills. |
| Expected | `employee_skills` row source=CERTIFICATION, `expiresOn` = cert `validUntil`; `lastValidatedAt` updated. |
| Priority | P3 |

### FR-G07-004 — Incremental Skill-Gap Analysis

| Field | Value |
|---|---|
| **TC-G07-014** | |
| Traces-to | FR-G07-004 AC.1, AC.6, AC.8; business rule (critical gap) |
| Type | Functional / Boundary |
| Title | Binary gap computed from fresh+validated skills only |
| Preconditions | `CM-CLERK` target L3 for `CMP-CYBER` (critical); emp-101 has VALIDATED+FRESH L1 |
| Test data | `{ competencyModelId:CM-CLERK, scoringMode:BINARY }` |
| Steps | 1. POST `/employees/emp-101/skill-gap-analyses`. |
| Expected | 201; item `gapSize=2` (L3−L1), `isCritical=true`; `criticalGapCount≥1`; `overallGapScore=null` (BINARY, no `ld.gap-weighted`); `scoringMode=BINARY`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-015** | |
| Traces-to | FR-G07-004 AC.6; edge case (all STALE → gaps reopen) |
| Type | Boundary / Data-Integrity |
| Title | STALE current skill discounted from gap closure |
| Preconditions | emp-101 `CMP-CYBER` skill VALIDATED but `freshnessStatus=STALE`; policy=EXCLUDE |
| Test data | staleness discount policy EXCLUDE |
| Steps | 1. Recompute gap analysis. |
| Expected | Item `discountedForStaleness=true`, gap reopens (treated as no current), `staleSkillCount≥1`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-016** | |
| Traces-to | FR-G07-004 AC.2, AC.3; business rule (G08 unavailable degraded) |
| Type | Integration / Negative-Path |
| Title | G08 appraisal feed down → graceful degradation, mandate gaps still surface |
| Preconditions | X.3 G08 feed returns circuit-open |
| Test data | mandate competency `CMP-CYBER` compliance |
| Steps | 1. POST gap analysis while G08 feed unavailable. |
| Expected | 201 (not a user failure); `appraisalCycleRef="UNAVAILABLE"`; MANDATORY-source gaps present regardless of model; APPRAISAL-source gaps omitted; logged, X.3 circuit-break honoured. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-017** | |
| Traces-to | FR-G07-004 AC.4, AC.5, AC.9 |
| Type | Functional / State-Transition |
| Title | Finalize supersedes prior; gap item one-click converts to need; incremental recompute |
| Preconditions | Prior FINALIZED analysis exists |
| Test data | skill-change event for emp-101 |
| Steps | 1. Emit skill-change event → incremental recompute. 2. GET `/employees/emp-101/skill-gap-analyses/latest`. 3. POST `/skill-gap-items/{id}:convert-to-need`. |
| Expected | Latest FINALIZED supersedes prior (prior SUPERSEDED, not exposed); only emp-101 recomputed (not full batch); need created with `source` mapped 1:1 from gap item. |
| Priority | P2 |

### FR-G07-005 — Training Needs Identification & Consolidation

| Field | Value |
|---|---|
| **TC-G07-018** | |
| Traces-to | FR-G07-005 AC.1, AC.4, AC.5 |
| Type | Functional / State-Transition |
| Title | Create needs from multiple sources and flow IDENTIFIED→CONSOLIDATED |
| Preconditions | Gap item + mandate available |
| Test data | needs source GAP_ANALYSIS, MANDATORY, MANAGER |
| Steps | 1. POST `/training-needs` (each source). 2. POST `/training-needs:consolidate`. |
| Expected | Needs created with priority + FY; consolidate groups into a group need with participant list (202 resumable X.1 accepted); status IDENTIFIED→CONSOLIDATED. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-019** | |
| Traces-to | FR-G07-005 AC.2; edge case (duplicate; MANDATORY wins) |
| Type | Negative / Data-Integrity |
| Title | Duplicate need (same employee+competency+FY) prevented |
| Preconditions | Existing need emp-101 / CMP-CYBER / FY2026 |
| Test data | second identical need |
| Steps | 1. POST `/training-needs` duplicate. |
| Expected | **409 CONFLICT** (duplicate surfaced/prevented); when merged, MANDATORY source wins. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-020** | |
| Traces-to | FR-G07-005 business rule; edge case (defer critical mandatory) |
| Type | Authorization / Negative |
| Title | Mandatory-source need cannot be REJECTED; only DEFERRED with dual sign-off |
| Preconditions | Critical MANDATORY need exists |
| Test data | reject attempt; defer attempt |
| Steps | 1. `ldo-301` attempt REJECT mandatory need. 2. DEFER without reason. 3. DEFER with reason + manager+L&D P01 sign-off. |
| Expected | 1. **403 FORBIDDEN** (mandatory cannot be rejected). 2. **422 VALIDATION_FAILED** (`ERR-REASON-REQ`, VAL-COMMENT). 3. DEFERRED after dual sign-off. |
| Priority | P2 |

### FR-G07-006 — Annual Plan & Budget Allocation

| Field | Value |
|---|---|
| **TC-G07-021** | |
| Traces-to | FR-G07-006 AC.1–AC.4; state DRAFT→SUBMITTED→APPROVED→ACTIVE |
| Type | State-Transition / Integration |
| Title | Build annual plan and P01 multi-stage approval to ACTIVE |
| Preconditions | Consolidated needs; `training_budgets` allocated at (FY, entity/org_unit) |
| Test data | plan FY2026 org_unit OU-1 |
| Steps | 1. `ldo-301` POST `/annual-training-plans` + `/items`. 2. `:submit`. 3. `ldm-401` `:approve`. 4. Finance/Dept Head sanction stage. |
| Expected | DRAFT→SUBMITTED→APPROVED→ACTIVE; sessions schedulable only after ACTIVE; P01 stepper stages recorded; P05 audited. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-022** | |
| Traces-to | FR-G07-006 AC.2; business rule (Σ planned ≤ allocated, canonical key); VAL-G07-BUDGETKEY |
| Type | Boundary / Negative |
| Title | Plan exceeding allocated budget at canonical key blocked without overrun flag |
| Preconditions | Allocated 100,000 INR for (FY2026, OU-1) |
| Test data | plan items sum 120,000 INR, no overrun flag |
| Steps | 1. Submit plan exceeding budget. |
| Expected | Blocked **422 VALIDATION_FAILED** (budget overrun without flag) — reconciliation at canonical (FY, entity/org_unit); category/competency reporting-only. With overrun flag → extra P01 stage required. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-023** | |
| Traces-to | FR-G07-006 business rule (`UNIQUE(tenant,FY,org_unit)`) |
| Type | Data-Integrity / Negative |
| Title | Duplicate annual plan for same FY+org_unit rejected |
| Preconditions | Plan (FY2026, OU-1) exists |
| Test data | second plan same key |
| Steps | 1. POST duplicate plan. |
| Expected | **409 CONFLICT** (unique plan per tenant/FY/org_unit). |
| Priority | P3 |

### FR-G07-007 — Course Catalog & Program Management

| Field | Value |
|---|---|
| **TC-G07-024** | |
| Traces-to | FR-G07-007 AC.1–AC.3 |
| Type | Functional / State-Transition |
| Title | Create program with cert-on-completion and publish via P01 |
| Preconditions | `ldo-301`, `ldm-401`; PUBLISHED competency linked |
| Test data | `{ name:"Cyber Basics", deliveryMode:CLASSROOM, isMandatory:true, certificationOnCompletion:true, certificateValidityMonths:12, linkedCompetencyIds:[CMP-CYBER] }` |
| Steps | 1. POST `/training-programs`. 2. `:publish` → P01 approve. |
| Expected | 201 DRAFT→PUBLISHED; mandatory program links ≥1 compliance competency; cert-on-completion requires validity months (present). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-025** | |
| Traces-to | FR-G07-007 AC.2, AC.4; edge cases |
| Type | Negative / Data-Integrity |
| Title | Program validation guards (mandatory w/o compliance competency; e-learning w/o content package) |
| Preconditions | e-learning program without content package |
| Test data | (a) mandatory, no compliance competency; (b) ELEARNING, no PUBLISHED content package + connector |
| Steps | 1. POST (a). 2. POST (b). |
| Expected | Both **422 VALIDATION_FAILED** — (a) mandatory must link compliance competency; (b) e-learning requires PUBLISHED content package + designated X.3 LRS/LMS connector + standard. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-026** | |
| Traces-to | FR-G07-007 AC.5; edge case (retire in-use) |
| Type | Negative / State-Transition |
| Title | Retire program blocked while OPEN/RUNNING sessions or active campaign exist |
| Preconditions | `PRG-CYBER` PUBLISHED with an OPEN session |
| Test data | retire request |
| Steps | 1. POST `/training-programs/{id}:retire`. |
| Expected | **409 CONFLICT** (in-use retire guard). |
| Priority | P3 |

### FR-G07-008 — Session / Trainer / Venue

| Field | Value |
|---|---|
| **TC-G07-027** | |
| Traces-to | FR-G07-008 AC.1, AC.3, AC.4 |
| Type | Functional / Boundary |
| Title | Schedule session with valid dates and capacity |
| Preconditions | `PRG-CYBER` PUBLISHED; venue capacity 30 |
| Test data | `{ trainingProgramId:PRG-CYBER, startDate, endDate≥start, capacity:25, venueId }` |
| Steps | 1. POST `/training-sessions`. |
| Expected | 201; `end_date ≥ start_date`, `nomination_deadline ≤ start_date`; venue capacity ≥ session capacity (VAL-DATE). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-028** | |
| Traces-to | FR-G07-008 AC.2, edge cases; ERR-G07-SCHEDULE |
| Type | Negative / Data-Integrity |
| Title | Trainer/venue double-booking rejected |
| Preconditions | Trainer `trn-601` confirmed on session A (10:00–13:00) |
| Test data | new session B same trainer, overlapping window |
| Steps | 1. POST `/training-sessions` overlapping trainer. |
| Expected | **409 CONFLICT** `error.code="ERR-G07-SCHEDULE"`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-029** | |
| Traces-to | FR-G07-008 AC.6, edge case; ERR-G07-EMPANEL; VAL-G07-EMPANEL |
| Type | Negative / Integration |
| Title | Assigning external trainer without valid empanelment blocked |
| Preconditions | External trainer linked to EXPIRED vendor empanelment |
| Test data | session with expired-empanelment external trainer |
| Steps | 1. POST/assign external trainer to session dates. |
| Expected | **409 CONFLICT** `error.code="ERR-G07-EMPANEL"` (empanelment must cover session dates). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-030** | |
| Traces-to | FR-G07-008 AC.5; state training_session cancel cascade |
| Type | State-Transition / Integration |
| Title | Cancel session cascades nominations and X.2 notifications |
| Preconditions | Session OPEN with 3 APPROVED nominations |
| Test data | cancel reason |
| Steps | 1. POST `/training-sessions/{id}:cancel` with reason. 2. Omit reason variant. |
| Expected | With reason: session CANCELLED, nominations freed to WITHDRAWN/re-nominate, X.2 dispatched. Without reason: **422 VALIDATION_FAILED** (`ERR-REASON-REQ`). |
| Priority | P2 |

### FR-G07-009 — Nomination & Multi-Level Approval (P01)

| Field | Value |
|---|---|
| **TC-G07-031** | |
| Traces-to | FR-G07-009 AC.1, AC.2; nomination state DRAFT→PENDING_L1→PENDING_L2→APPROVED |
| Type | E2E-Flow / State-Transition |
| Title | Self-nomination through P01 L1→L2 to APPROVED with capacity decrement |
| Preconditions | Session OPEN capacity 25; budget sufficient; need linked |
| Test data | `Idempotency-Key: nom-key-1` |
| Steps | 1. emp-101 POST `/training-sessions/{id}/nominations`. 2. `mgr-201` `:approve` (L1). 3. `ldm-401` `:approve` (L2). |
| Expected | State DRAFT→PENDING_L1→PENDING_L2→APPROVED; capacity decremented atomically; budget committed (canonical key); `workflow_instance_id` set (P01). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-032** | |
| Traces-to | FR-G07-009 AC.3, AC.5, AC.6; state WAITLISTED↔APPROVED (FIFO) |
| Type | State-Transition / Data-Integrity |
| Title | Approve-when-full waitlists with FIFO position; withdrawal promotes head with P05 audit |
| Preconditions | Session at full capacity; two pending nominations N1 then N2 |
| Test data | FIFO order N1, N2 |
| Steps | 1. Approve N1 (full) → WAITLISTED pos 1. 2. Approve N2 → pos 2. 3. An APPROVED holder withdraws (non-mandatory). 4. GET `/training-sessions/{id}/waitlist`. |
| Expected | N1 pos1, N2 pos2; on seat free N1 promoted to APPROVED by FIFO; `waitlist_position` recomputed/persisted; promotion captured by P05 trigger (who/when/from-position). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-033** | |
| Traces-to | FR-G07-009 business rule (SoD, self-approve) |
| Type | Authorization / Negative |
| Title | Self-approval of own nomination forbidden |
| Preconditions | `mgr-201` created a nomination as maker |
| Test data | `mgr-201` approve own nomination |
| Steps | 1. `mgr-201` `:approve` on the nomination they nominated. |
| Expected | **403 FORBIDDEN** (`ERR-FORBIDDEN`, P01/P02 SoD maker≠approver); approve button hidden in UI. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-034** | |
| Traces-to | FR-G07-009 AC.4, edge case; ERR-G07-BUDGET |
| Type | Negative / Boundary |
| Title | Approval blocked when budget exhausted |
| Preconditions | Canonical budget remaining < estimated cost; no overrun approval |
| Test data | estimated cost > remaining |
| Steps | 1. `ldm-401` `:approve` nomination. |
| Expected | **409 CONFLICT** `error.code="ERR-G07-BUDGET"`; no partial commit (transaction rollback). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-035** | |
| Traces-to | FR-G07-009 business rule; ERR-G07-MANDATORY |
| Type | Authorization / Negative |
| Title | Mandatory/campaign nomination cannot be self-withdrawn |
| Preconditions | Campaign nomination (`nomination_type=CAMPAIGN`) APPROVED for emp-101 |
| Test data | emp-101 self-withdraw |
| Steps | 1. emp-101 POST `/nominations/{id}:withdraw`. |
| Expected | **403 FORBIDDEN** `error.code="ERR-G07-MANDATORY"`; only L&D with reason may cancel. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-036** | |
| Traces-to | FR-G07-009 business rule (idempotency); ERR-DUP-INSTANCE; §2.4 |
| Type | API-Contract / Negative |
| Title | Idempotent nomination POST; duplicate enrolment rejected |
| Preconditions | Session OPEN |
| Test data | same `Idempotency-Key` twice; then duplicate (session,employee) new key |
| Steps | 1. POST nomination key `k1`. 2. Repeat key `k1` within 24h. 3. POST same session+employee, new key. |
| Expected | 2. returns original result (idempotent replay, no duplicate). 3. **409 CONFLICT** (`UNIQUE(session,employee)`, `ERR-DUP-INSTANCE` on duplicate P01 start). |
| Priority | P2 |

### FR-G07-010 — Attendance (Kiosk/Offline)

| Field | Value |
|---|---|
| **TC-G07-037** | |
| Traces-to | FR-G07-010 AC.1, AC.2, AC.7; business rule (RUNNING/COMPLETED only) |
| Type | Functional / Data-Integrity |
| Title | Trainer marks per-day attendance with actor attribution |
| Preconditions | Session RUNNING; nomination APPROVED |
| Test data | `{ attendanceStatus:PRESENT, markedByActorType:TRAINER, markedByActorId:trn-601, captureMode:ONLINE, sessionDate }` |
| Steps | 1. `trn-601` POST `/sessions/{id}/attendance`. |
| Expected | 201; one row per nomination per day (`UNIQUE`); actor_type/actor_id recorded (no polymorphic ambiguity); P05 audited. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-038** | |
| Traces-to | FR-G07-010 AC.3, AC.4; business rule (threshold, EXCUSED excluded) |
| Type | Boundary / State-Transition |
| Title | Below-threshold attendance marks cert-ineligible; fully-absent → NO_SHOW |
| Preconditions | Program min 80%; 5-day session |
| Test data | 3/5 present, 2 EXCUSED (denominator excludes EXCUSED) vs 1/5 present |
| Steps | 1. Mark attendance patterns. 2. Run session-close logic. |
| Expected | EXCUSED excluded from denominator; below-threshold nomination flagged ineligible for certification; a fully-absent nomination auto-marked NO_SHOW at completion. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-039** | |
| Traces-to | FR-G07-010 AC.6; FR-G07-022; edge case (clock skew) |
| Type | Integration / Data-Integrity |
| Title | Offline attendance sync dedupes and reconciles clock skew |
| Preconditions | Kiosk offline batch with `offline_captured_at`, `offline_sync_batch_id`; a duplicate online mark exists for same (nomination,date) |
| Test data | `Idempotency-Key` on offline-sync; skewed device clock |
| Steps | 1. POST `/sessions/{id}/attendance:offline-sync`. |
| Expected | Server-side dedupe by (nomination,date); conflicts surfaced to L&D queue; stale device clock reconciled and skew flagged; re-run idempotent. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-040** | |
| Traces-to | FR-G07-010 AC.1, edge case (non-approved) |
| Type | Authorization / Negative |
| Title | Marking attendance for non-approved nomination rejected |
| Preconditions | Nomination in PENDING_L1 (not APPROVED) |
| Test data | attendance mark |
| Steps | 1. `trn-601` mark attendance for non-roster nomination. |
| Expected | **403 FORBIDDEN** (non-roster / not APPROVED); duplicate day-mark elsewhere → **409 CONFLICT** upsert. |
| Priority | P2 |

### FR-G07-011 — Assessment & Kirkpatrick

| Field | Value |
|---|---|
| **TC-G07-041** | |
| Traces-to | FR-G07-011 AC.1, AC.2, AC.5; business rule (pass math) |
| Type | Functional / Boundary |
| Title | Pre/post scoring, learning gain, POST=FAIL blocks certification |
| Preconditions | Nomination attended ≥ threshold |
| Test data | PRE=40, POST=55 (max 100, threshold 60) → FAIL; then POST=75 → PASS |
| Steps | 1. POST assessments PRE, POST=55. 2. Reassessment POST=75. |
| Expected | `result=PASS iff obtained≥pass_threshold`; learning gain=POST−PRE reportable; POST=FAIL ⇒ ineligible for cert; reassessment appends new row (append-only ledger). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-042** | |
| Traces-to | FR-G07-011 business rule (0 ≤ obtained ≤ max) |
| Type | Boundary / Negative |
| Title | Obtained score outside [0,max] rejected |
| Preconditions | Nomination exists |
| Test data | `maxScore:100, obtainedScore:110` |
| Steps | 1. POST `/nominations/{id}/assessments`. |
| Expected | **422 VALIDATION_FAILED** field `obtainedScore` ("obtained_score exceeds max_score"). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-043** | |
| Traces-to | FR-G07-011 AC.3, AC.4; PII ceiling |
| Type | Data-Integrity / Authorization |
| Title | Anonymous L1 feedback strips PII; trainer rating derived |
| Preconditions | Feedback anonymity toggle on; JOB-G07-TRAINERRATE scheduled |
| Test data | L1 Likert responses |
| Steps | 1. Participants POST `/sessions/{id}/feedback` anonymous. 2. Run JOB-G07-TRAINERRATE. |
| Expected | PII stripped per P02 PII ceiling; feedback ledger append-only; `trainers.avgRating` derived from L1; anonymity preserved on serialization. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-044** | |
| Traces-to | FR-G07-011 AC.6, AC.7; edge case (L3/L4 not sampled) |
| Type | Functional / Integration |
| Title | L3/L4 optional/sampled programme-level; never blocks completion; KPI linkage |
| Preconditions | Program with L4 sampling |
| Test data | L4 `responsesJson` references named G14 KPI keys; some participants without L3/L4 |
| Steps | 1. GET `/programs/{id}/l3l4-summary`. 2. Complete a nomination lacking L3/L4. |
| Expected | L3/L4 aggregated at programme level; missing shown "not sampled" (not an error); completion not blocked; L4 KPI keys linked for cost-per-outcome. |
| Priority | P3 |

### FR-G07-012 — Certification, Validity & Renewal

| Field | Value |
|---|---|
| **TC-G07-045** | |
| Traces-to | FR-G07-012 AC.1, AC.2; certification state issue→ACTIVE; ERR-G07-CERT-INELIGIBLE |
| Type | State-Transition / Negative |
| Title | Certificate issues only on eligible completion; ineligible issuance blocked |
| Preconditions | (a) nomination COMPLETED, attendance met, POST=PASS; (b) nomination with POST=FAIL |
| Test data | issue requests for (a) and (b) |
| Steps | 1. POST `/nominations/{a}:issue-certificate`. 2. POST `/nominations/{b}:issue-certificate`. |
| Expected | (a) ACTIVE cert, unique immutable `certificate_no`, PDF stored via G13; (b) **409 CONFLICT** `error.code="ERR-G07-CERT-INELIGIBLE"`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-046** | |
| Traces-to | FR-G07-012 AC.3, AC.6, AC.7; certification ACTIVE→EXPIRED; JOB-G07-CERTEXPIRY |
| Type | State-Transition / Integration |
| Title | Mandatory cert expiry sets lapsed_mandatory, renewal need, campaign re-nomination |
| Preconditions | Mandatory cert `validUntil` = yesterday |
| Test data | simulated clock advanced |
| Steps | 1. Run `JOB-G07-CERTEXPIRY`. 2. GET `/employees/emp-101/lapsed-mandatory`. |
| Expected | Cert ACTIVE→EXPIRED; `lapsedMandatory=true` (exposed for G06); auto renewal `training_need` (`renewal_need_id`) created; enrolled into rolling campaign (FR-017); X.2 `MSG-G07-CERT-EXPIRY`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-047** | |
| Traces-to | FR-G07-012 AC.8; certification ACTIVE→SUPERSEDED (lapse cleared) |
| Type | State-Transition / Data-Integrity |
| Title | Renewal supersedes prior cert and clears lapsed flag |
| Preconditions | Expired mandatory cert with `lapsedMandatory=true` |
| Test data | new valid cert issued |
| Steps | 1. Issue renewal cert. |
| Expected | Prior cert SUPERSEDED, new cert ACTIVE, `lapsedMandatory` cleared (SUPERSEDED chain). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-048** | |
| Traces-to | FR-G07-012 business rule; certification revoke (P01); ERR-REVOKE / SR correction |
| Type | Authorization / State-Transition |
| Title | Certificate revocation runs P01 L&D Manager flow with reason |
| Preconditions | ACTIVE posted cert |
| Test data | revoke reason |
| Steps | 1. `ldo-301` request `/certifications/{id}:revoke`. 2. `ldm-401` approve. 3. Omit reason variant. |
| Expected | Requires L&D Manager P01 approval + reason → REVOKED; if posted, flags G12 SR correction; missing reason → **422 VALIDATION_FAILED** (`ERR-REASON-REQ`); requester without approval cannot self-finalize (SoD). |
| Priority | P2 |

### FR-G07-013 — Induction / Onboarding

| Field | Value |
|---|---|
| **TC-G07-049** | |
| Traces-to | FR-G07-013 AC.1, AC.6; pinned G01 joiner contract |
| Type | Integration / E2E-Flow |
| Title | G01 joiner event auto-enrols induction (idempotent) |
| Preconditions | Active induction program/path; G01 joiner event for `emp-new` |
| Test data | joiner event with `Idempotency-Key`; then duplicate event |
| Steps | 1. Emit joiner event → `/induction:enroll`. 2. Re-emit same event. |
| Expected | Auto need (source=INDUCTION) + nomination (type=INDUCTION) created; duplicate/late event reconciled idempotently (no duplicate enrolment). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-050** | |
| Traces-to | FR-G07-013 AC.2, AC.3, AC.5; JOB-G07-INDUCTION |
| Type | State-Transition / Integration |
| Title | Onboarding window tracked; non-completion escalates |
| Preconditions | Joiner enrolled; 30-day window elapsed uncompleted |
| Test data | clock advanced past window |
| Steps | 1. Run `JOB-G07-INDUCTION`. 2. GET `/induction/status?orgUnitId=`. |
| Expected | Overdue flagged; X.2 `MSG-G07-INDUCTION-OVERDUE` to manager + L&D; completion contributes to mandatory-compliance status. |
| Priority | P3 |

### FR-G07-014 — Learning Paths, Recommendations, CPD, Marketplace (Phase 2)

| Field | Value |
|---|---|
| **TC-G07-051** | |
| Traces-to | FR-G07-014 AC.3, AC.4; business rule (CPD append-only, dedupe) |
| Type | Functional / Data-Integrity |
| Title | CPD credits accrue on completion, append-only, deduped by source_ref |
| Preconditions | emp-101 completes a CPD-bearing program |
| Test data | completion event twice (same source_ref) |
| Steps | 1. Complete program. 2. GET `/employees/emp-101/cpd?year=2026`. 3. Re-emit same completion. |
| Expected | CPD appended (credits ≥ 0); yearly aggregation; double-count guarded by `source_ref`; ledger append-only. |
| Priority | P3 |

| Field | Value |
|---|---|
| **TC-G07-052** | |
| Traces-to | FR-G07-014 AC.1, AC.2, AC.6; capability flags OFF |
| Type | Authorization / Functional |
| Title | Recommendation/marketplace gated by flags; Phase-2 states not broken/empty |
| Preconditions | `ld.recommendations` OFF, `ld.marketplace` OFF |
| Test data | flags default OFF |
| Steps | 1. GET `/employees/emp-101/recommendations`. 2. GET `/marketplace/skills?skillId=`. 3. Grant `ld.recommendations`, retry. |
| Expected | With flags OFF: curated paths + CPD tracking present; recommendation/marketplace surfaced as "coming in Phase 2" (never broken/empty controls); with flag granted, ranked recommendations mapped to CRITICAL>HIGH gaps returned. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-053** | |
| Traces-to | FR-G07-014 AC.5; business rule (marketplace opt-in, consent) |
| Type | Authorization / Data-Integrity |
| Title | Marketplace lists surplus-skill mentors only on opt-in consent |
| Preconditions | `ld.marketplace` granted; emp with surplus proficiency, no consent |
| Test data | `consent_records` absent → then opt-in |
| Steps | 1. GET `/marketplace/skills` (no consent). 2. Opt-in (`VAL-CONSENT`), retry. |
| Expected | Employee hidden without opt-in; visible after consent; opt-out hides again (FR-023 erases presence on exit). |
| Priority | P3 |

### FR-G07-015 — LMS/LRS Integration (X.3)

| Field | Value |
|---|---|
| **TC-G07-054** | |
| Traces-to | FR-G07-015 AC.1, AC.2, AC.5; business rule (secrets via P04) |
| Type | Integration / Security |
| Title | Approval provisions LMS enrolment bound to X.3 connector; SSO launch; no secret in G07 tables |
| Preconditions | e-learning nomination APPROVED; `LRS-PRIMARY` connector with `integration_credential_ref`→P04 |
| Test data | connector credentials in P04 only |
| Steps | 1. Approve e-learning nomination. 2. GET `/lms/enrollments/{id}/launch`. 3. Inspect `learning_record_stores` row + logs. |
| Expected | `lms_enrollment` created bound to connector (+ content-package version if self-hosted); SSO deep-link launch (no separate LMS login); **no secret stored in G07 tables** (creds only in P04); credentials never logged. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-055** | |
| Traces-to | FR-G07-015 AC.3, AC.4; xAPI ingest idempotency |
| Type | API-Contract / Integration |
| Title | xAPI statement ingest is idempotent; completion derives attendance |
| Preconditions | e-learning enrolment active |
| Test data | xAPI statement `statementId=stmt-1` verb=completed, progress 100 |
| Steps | 1. POST `/lms/xapi/ingest` stmt-1. 2. Repeat stmt-1. |
| Expected | First ingest updates progress→COMPLETED and derives attendance (`captureMode=LMS_DERIVED`), triggers cert eligibility; repeated `statementId` ignored (X.3 inbound idempotency). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-056** | |
| Traces-to | FR-G07-015 AC.3, business rule (SCORM poll, no webhook); JOB-G07-LMSSYNC |
| Type | Integration / Data-Integrity |
| Title | SCORM sync via reporting-API poll with cursor idempotency |
| Preconditions | SCORM connector `SCORM_POLL`, `poll_interval_minutes` set |
| Test data | poll cursor advancing |
| Steps | 1. Run `JOB-G07-LMSSYNC` poll. 2. Re-run with same cursor. |
| Expected | Progress ingested via poll (not push); `last_poll_cursor` advanced; poll idempotent by cursor+enrolment; no path assumes SCORM server push. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-057** | |
| Traces-to | FR-G07-015 AC.6, edge case (LMS down); X.3 circuit-breaker |
| Type | Negative-Path / Integration |
| Title | Persistent LMS failure trips circuit-breaker and flags reconciliation |
| Preconditions | LMS reporting API returns errors past retry budget |
| Test data | connector health polled |
| Steps | 1. Trigger repeated sync failures. 2. GET `/lms/connectors/health`. |
| Expected | X.3 circuit-breaker trips; enrolment flagged for manual reconciliation; health panel exposes sync lag, last cursor, breaker state; non-retryable upstream → **500 INTERNAL** (`ERR-LOADFAIL`), no 503 in standard table. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-058** | |
| Traces-to | FR-G07-015 business rule (`VAL-G07-PRIMARYLRS`, single primary) |
| Type | Data-Integrity / Negative |
| Title | Exactly one primary LRS connector (system of record) |
| Preconditions | `LRS-PRIMARY` already `is_primary=true` |
| Test data | second connector `is_primary=true` |
| Steps | 1. SysAdmin configure second primary connector. |
| Expected | **422 VALIDATION_FAILED** (VAL-G07-PRIMARYLRS — exactly one `is_primary`). |
| Priority | P3 |

### FR-G07-016 — SR Posting & Budget/Cost

| Field | Value |
|---|---|
| **TC-G07-059** | |
| Traces-to | FR-G07-016 AC.1; VAL-G07-SIGNIF; significance rule trace |
| Type | Functional / Data-Integrity |
| Title | is_significant rule set resolves posting with auditable trace |
| Preconditions | Completed mandatory cert (rule a) |
| Test data | GET significance trace |
| Steps | 1. GET `/significance/evaluate?nominationId=`. |
| Expected | Significant=true; matched rule(s) (a mandatory cert) returned; resolved decision + rule stored and auditable (P05); most-inclusive wins on conflict. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-060** | |
| Traces-to | FR-G07-016 AC.2, AC.3; sr_posting NOT_REQUIRED→PENDING→POSTED |
| Type | Integration / State-Transition |
| Title | Significant cert posts to G12 SR via X.3 (idempotent) |
| Preconditions | Significant cert `sr_posting_status=PENDING` |
| Test data | `Idempotency-Key` = cert id; pinned SrIngestEvent contract |
| Steps | 1. POST `/certifications/{id}:post-to-sr`. 2. Repeat. 3. Verify `/sr/ingest` receives pinned event. |
| Expected | 202 Accepted; G12 ack → POSTED, `serviceRegisterEventId` stored; repeat idempotent (no double post); event conforms to pinned contract (`eventType=TRAINING_QUALIFICATION`, `sourceModule=G07`). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-061** | |
| Traces-to | FR-G07-016 AC.3; sr_posting PENDING→FAILED→POSTED; MSG-G07-SR-FAILED |
| Type | Negative-Path / Integration |
| Title | SR posting failure retries via X.3; exhaustion alerts |
| Preconditions | G12 endpoint down |
| Test data | retry budget |
| Steps | 1. Trigger SR post. 2. Fail past retries. 3. Recover G12, retry. |
| Expected | PENDING→FAILED with scheduled X.3 retry; retries exhausted → FAILED + alert `MSG-G07-SR-FAILED` to L&D + SR Custodian; on recovery FAILED→POSTED. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-062** | |
| Traces-to | FR-G07-016 AC.4, AC.5, business rule (canonical key, SoD, FROZEN); ERR-G07-BUDGET |
| Type | Boundary / Authorization |
| Title | Cost commit at canonical key; cost approver ≠ creator; FROZEN blocks |
| Preconditions | Budget (FY2026, OU-1); `fin-701` and `ldo-301` |
| Test data | committed+actual near allocated |
| Steps | 1. `ldo-301` create cost. 2. Same user approve. 3. Commit exceeding allocated / FROZEN budget. |
| Expected | Self-approve → **403 FORBIDDEN** (SoD); overrun/FROZEN commit → **409 CONFLICT** `ERR-G07-BUDGET`; `committed+actual ≤ allocated` at canonical key; banker's rounding INR. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-063** | |
| Traces-to | FR-G07-016 AC.6, AC.7, AC.8 |
| Type | Integration / Functional |
| Title | Payable feed to G10; variance and cost-per-completion reporting |
| Preconditions | APPROVED reimbursement cost `payable_to_payroll=true` |
| Test data | actuals + completions |
| Steps | 1. Approve payable cost. 2. GET `/training-budgets/variance?fy=&orgUnitId=`. 3. GET `/analytics/cost-per-completion?programId=&fy=`. |
| Expected | Approved-payable feed emitted to G10 (APPROVED only); variance per entity/org-unit/FY (category reporting-only); `cost_per_completion = actual ÷ completions`. |
| Priority | P3 |

### FR-G07-017 — Mandatory-Compliance Campaign Engine

| Field | Value |
|---|---|
| **TC-G07-064** | |
| Traces-to | FR-G07-017 AC.1, AC.6; VAL-G07-COVERAGE (denominator) |
| Type | Functional / Data-Integrity |
| Title | Campaign resolves eligible target population with exemptions and coverage denominator |
| Preconditions | Scope ALL_STAFF; some staff on long leave (`EXCLUDE_LONG_LEAVE`) |
| Test data | `coverageDenominatorRule: EXCLUDE_LONG_LEAVE` |
| Steps | 1. `ldo-301` POST `/training-campaigns`. 2. GET `/training-campaigns/{id}/coverage?orgUnitId=`. |
| Expected | Targets resolved; ineligible marked EXEMPT with reason (audited); coverage % uses eligible denominator only. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-065** | |
| Traces-to | FR-G07-017 AC.2; business rule (resumable idempotent batch) |
| Type | API-Contract / Integration |
| Title | enroll-batch is idempotent and resumable |
| Preconditions | Campaign APPROVED (P01) with published mandatory program |
| Test data | `Idempotency-Key` per (campaign,employee); re-run |
| Steps | 1. POST `/training-campaigns/{id}:enroll-batch`. 2. Re-run same key. |
| Expected | 202 resumable X.1 job; bulk nominations `nomination_type=CAMPAIGN`; re-running does not duplicate (idempotent by (campaign,employee)). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-066** | |
| Traces-to | FR-G07-017 AC.3; business rule (capacity invariant on wave); ERR-G07-CAPACITY |
| Type | Boundary / State-Transition |
| Title | auto-wave respects per-session capacity, spills to new waves |
| Preconditions | Eligible targets > available capacity |
| Test data | `autoWave=true, waveSize` |
| Steps | 1. POST `/training-campaigns/{id}:auto-wave`. |
| Expected | Targets assigned to capacity-bounded sessions; over-capacity spills to new waves/sessions (never breaks capacity invariant); no session exceeds capacity. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-067** | |
| Traces-to | FR-G07-017 AC.4, AC.5; JOB-G07-CAMPAIGN (rolling renewal, escalation) |
| Type | Integration / State-Transition |
| Title | Rolling renewal re-targets pre-expiry; escalation ladder fires |
| Preconditions | Campaign `renewalCadenceMonths=2`; overdue targets |
| Test data | clock near cert expiry; `escalationPolicyJson` employee→manager→L&D |
| Steps | 1. Run `JOB-G07-CAMPAIGN`. 2. GET `/training-campaigns/{id}/overdue`. |
| Expected | Employees re-targeted `renewalCadenceMonths` before cert expiry (ties FR-012); escalation dispatched via X.2, `escalation_level` increments. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-068** | |
| Traces-to | FR-G07-017 business rule (cannot RUN without approved scope + published program) |
| Type | State-Transition / Negative |
| Title | Campaign cannot run without P01-approved scope and published program |
| Preconditions | Campaign DRAFT, program not published |
| Test data | attempt enroll-batch pre-approval |
| Steps | 1. POST `:enroll-batch` before `:approve`. |
| Expected | **412 PRECONDITION_FAILED** / **409 CONFLICT** (`ERR-PRECOND` — requires approved scope + published mandatory program); campaign stays DRAFT. |
| Priority | P2 |

### FR-G07-018 — External & Professional Credential Capture

| Field | Value |
|---|---|
| **TC-G07-069** | |
| Traces-to | FR-G07-018 AC.1, AC.2, AC.6; credential_verifications append-only |
| Type | Functional / State-Transition |
| Title | Capture external credential and route L&D verification (immutable trail) |
| Preconditions | emp-101; evidence document in G13 |
| Test data | `{ title:"PMP", issuingBody:"PMI", externalReferenceNo:"PMP-123", issueDate }` |
| Steps | 1. emp-101 POST `/employees/emp-101/external-credentials`. 2. `ldo-301` (`ld.credential-verify`) `:verify`. 3. Reject a second credential. |
| Expected | `verificationStatus` NOT_REQUIRED→PENDING→VERIFIED; each step appended to `credential_verifications`; rejected credential retains immutable trail (not deleted). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-070** | |
| Traces-to | FR-G07-018 AC.5, edge cases; VAL-G07-CREDREF; SoD |
| Type | Negative / Authorization |
| Title | Duplicate external reference and verifier=submitter rejected |
| Preconditions | Credential `PMP-123` exists for emp-101 |
| Test data | (a) duplicate `externalReferenceNo:"PMP-123"`; (b) emp-101 verifies own |
| Steps | 1. POST duplicate. 2. emp-101 `:verify` own credential. |
| Expected | (a) **409 CONFLICT** (`VAL-G07-CREDREF`, unique per employee); (b) **403 FORBIDDEN** (`ERR-FORBIDDEN`, SoD creator≠verifier). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-071** | |
| Traces-to | FR-G07-018 AC.3, AC.4; FR-G07-016 significance |
| Type | Integration / Data-Integrity |
| Title | Verified significant external credential becomes SR-posting eligible and can update skills |
| Preconditions | VERIFIED renewable credential meeting is_significant |
| Test data | credential validUntil set |
| Steps | 1. Verify credential. 2. Evaluate significance. |
| Expected | Renewable credential sets `validUntil`, may update `employee_skills`; VERIFIED + significant → G12 SR-posting eligible (only VERIFIED post). |
| Priority | P2 |

### FR-G07-019 — Vendor Empanelment

| Field | Value |
|---|---|
| **TC-G07-072** | |
| Traces-to | FR-G07-019 AC.1, AC.2; empanelment DRAFT→PENDING_APPROVAL→EMPANELLED |
| Type | State-Transition / Authorization |
| Title | Empanel vendor via P01 with SoD (requester≠approver) |
| Preconditions | `ven-901` (`ld.vendor-admin`), `ldm-401` |
| Test data | `{ vendorName, empanelmentRef:"EMP-1", contractRef, validFrom }` |
| Steps | 1. `ven-901` POST `/vendor-empanelments`. 2. `:approve` by `ldm-401`. 3. Self-approve variant by `ven-901`. |
| Expected | DRAFT→PENDING_APPROVAL→EMPANELLED on approve; self-approval → **403 FORBIDDEN** (SoD); `empanelmentRef` VAL-MASTER-UNIQUE. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-073** | |
| Traces-to | FR-G07-019 AC.4, AC.5, edge cases; ERR-G07-EMPANEL; JOB-G07-EMPANELEXPIRE |
| Type | Negative / Integration |
| Title | Cost/assignment referencing expired or blacklisted vendor blocked |
| Preconditions | Vendor SUSPENDED / expired empanelment; JOB-G07-EMPANELEXPIRE run |
| Test data | external cost referencing expired vendor |
| Steps | 1. POST `/training-costs` referencing expired empanelment. 2. Assign blacklisted vendor to new session. |
| Expected | **409 CONFLICT** `error.code="ERR-G07-EMPANEL"` (validity must cover cost/session dates); blacklist blocks new assignments (history preserved). |
| Priority | P2 |

### FR-G07-020 — Sponsorship / Bond

| Field | Value |
|---|---|
| **TC-G07-074** | |
| Traces-to | FR-G07-020 AC.1, AC.2, AC.3; sponsorship_bond PROPOSED→SANCTIONED→ACTIVE→FULFILLED |
| Type | State-Transition / Integration |
| Title | Sponsorship sanctioned via P01; bond derived; fulfilled after term |
| Preconditions | `emp-101` request; `dhd-501` sanction |
| Test data | `{ sponsorshipType:STUDY_LEAVE, sponsoredAmount:200000, serviceBondMonths:24, startDate }` |
| Steps | 1. POST `/training-sponsorships`. 2. `mgr-201` recommend → `dhd-501` `:sanction`. 3. Complete → advance clock past `bond_end_date`. |
| Expected | PROPOSED→SANCTIONED→ACTIVE; `bond_end_date = completion_date + service_bond_months`; on term served → FULFILLED. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-075** | |
| Traces-to | FR-G07-020 AC.4, AC.5; sponsorship_bond ACTIVE→BREACHED→RECOVERED; ERR-G07-BOND; VAL-G07-BOND |
| Type | State-Transition / Negative |
| Title | Early exit breach computes pro-rata recovery; RECOVERED requires BOND_RECOVERY cost |
| Preconditions | ACTIVE bond; G05 relieving event for emp-101 |
| Test data | pro-rata recovery formula |
| Steps | 1. Emit G05 relieving → `:mark-breached`. 2. `:compute-recovery`. 3. Attempt RECOVERED without emitting cost. |
| Expected | ACTIVE→BREACHED; `bondRecoveryAmount` computed pro-rata; moving to RECOVERED without `BOND_RECOVERY` payable cost blocked (`ERR-G07-BOND`, VAL-G07-BOND); on emit → RECOVERED, G10 payable feed. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-076** | |
| Traces-to | FR-G07-020 AC.6; sponsorship_bond →WAIVED (P01) |
| Type | Authorization / State-Transition |
| Title | Bond waiver requires authority P01 approval and is audited |
| Preconditions | BREACHED bond |
| Test data | waiver reason |
| Steps | 1. `dhd-501`/authority `:waive` with reason (P01). 2. No-reason variant. |
| Expected | WAIVED after authority approval, P05-audited; missing reason → **422 VALIDATION_FAILED** (`ERR-REASON-REQ`). |
| Priority | P3 |

### FR-G07-021 — Content & Assessment-Item Management

| Field | Value |
|---|---|
| **TC-G07-077** | |
| Traces-to | FR-G07-021 AC.2; ERR-G07-WCAG; VAL-G07-WCAG |
| Type | Negative / Boundary |
| Title | NON_CONFORMANT mandatory content cannot publish without accessibility exception |
| Preconditions | Content package `wcagConformance=NON_CONFORMANT` for a mandatory program |
| Test data | publish without exception |
| Steps | 1. POST `/content-packages/{id}:publish`. |
| Expected | **422 VALIDATION_FAILED** `error.code="ERR-G07-WCAG"`; publish only via P01 accessibility-exception approval. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-078** | |
| Traces-to | FR-G07-021 AC.3, business rule (correct keys masked); P02 field mask |
| Type | Authorization / Security |
| Title | Assessment-item correct keys masked from learners |
| Preconditions | Item `correctKeyJson` set; learner principal |
| Test data | emp-101 (learner) GET item |
| Steps | 1. emp-101 GET assessment item served for a test. |
| Expected | `correctKeyJson` field-masked on serialization (P02); never returned to learners; author role sees keys. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-079** | |
| Traces-to | FR-G07-021 AC.4, business rule (UNIQUE version); in-flight pinning |
| Type | Data-Integrity / State-Transition |
| Title | Content package version supersession; in-flight enrolments retain launched version |
| Preconditions | Package v1 PUBLISHED, active enrolment on v1 |
| Test data | publish v2; duplicate v1 attempt |
| Steps | 1. Publish v2. 2. Verify in-flight enrolment. 3. POST duplicate `packageVersion` v1. |
| Expected | New enrolments get v2; in-flight retain v1 (mirrors P01 pinning); duplicate version → **409 CONFLICT** (`UNIQUE(tenant,program,version)`). |
| Priority | P3 |

### FR-G07-022 — Proxy/Kiosk/Assisted & Offline Sync

| Field | Value |
|---|---|
| **TC-G07-080** | |
| Traces-to | FR-G07-022 AC.1, AC.2, AC.6; business rule (attributed, no anonymous) |
| Type | Authorization / Data-Integrity |
| Title | Kiosk assisted self-assessment dual-attributed to operator + employee |
| Preconditions | `ksk-801` authenticated; `emp-909` selectable by `service_no` |
| Test data | assisted skill self-assessment |
| Steps | 1. `ksk-801` POST `/kiosk/sessions` then `/kiosk/emp-909/self-assessment`. |
| Expected | `employee_skills`/`skill_assessments` written source=SELF with operator attribution; both operator and employee recorded in P05 (no anonymous capture); underlying FR validation/SoD still enforced. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-081** | |
| Traces-to | FR-G07-022 AC.5, edge cases; VAL-G07-COVERAGE |
| Type | Functional / Boundary |
| Title | Coverage denominator classifies eligible/exempt; out-of-scope operator blocked |
| Preconditions | Unmapped employee without `service_no`; operator scoped to OU-1 |
| Test data | employee in OU-2 |
| Steps | 1. GET `/coverage/eligibility?campaignId=&employeeId=`. 2. `ksk-801` assist an OU-2 employee. |
| Expected | Unmapped employee classified EXEMPT with reason (auditable); operator assisting outside org scope → **403 FORBIDDEN** (P02 scope). |
| Priority | P2 |

### FR-G07-023 — DPDP Retention & Erasure

| Field | Value |
|---|---|
| **TC-G07-082** | |
| Traces-to | FR-G07-023 AC.1, AC.3, AC.4, AC.6; SoD |
| Type | State-Transition / Authorization |
| Title | Exit erasure plan executes; requester ≠ DPO approver |
| Preconditions | emp-101 RESIGNED (G01 exit event) |
| Test data | retention plan; requester ≠ approver |
| Steps | 1. Exit event → POST `/learning-data/retention-plan?employeeId=`. 2. `dpo-111` approve (P01) → `:execute`. 3. Same principal request+approve variant. |
| Expected | Plan resolves (anonymise self-assessments, detach feedback authorship, erase marketplace presence, retain statutory); each appended to `learning_data_retention_actions` (immutable); marketplace presence removed immediately; requester=approver → **403 FORBIDDEN** (SoD). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-083** | |
| Traces-to | FR-G07-023 AC.2, edge cases; ERR-G07-RETENTION |
| Type | Negative / Data-Integrity |
| Title | Erasure of SR-posted/statutory cert blocked by retention hold |
| Preconditions | emp-101 has SR-posted mandatory cert; DSR erasure request |
| Test data | erasure targeting statutory record |
| Steps | 1. POST erasure action on SR-posted cert. |
| Expected | **409 CONFLICT** `error.code="ERR-G07-RETENTION"`; record flagged `retention_override=true` and preserved; retention never below statutory floor; documented to subject. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-084** | |
| Traces-to | FR-G07-023 AC.5; edge (re-employment after erasure) |
| Type | Functional / Data-Integrity |
| Title | Pre-erasure data-subject export; re-employment starts fresh profile |
| Preconditions | Erasure requested with export |
| Test data | export request |
| Steps | 1. POST `/learning-data/export?employeeId=`. 2. Re-employ erased employee. |
| Expected | Export produced before erasure; re-employment creates new profile (no resurrection of erased PII). |
| Priority | P3 |

### FR-G07-024 — Published Gap Contract for G06/G08

| Field | Value |
|---|---|
| **TC-G07-085** | |
| Traces-to | FR-G07-024 AC.1, AC.4, AC.5; schema conformance |
| Type | API-Contract / Data-Integrity |
| Title | Gap Contract v1 exposes pinned schema from latest FINALIZED analysis |
| Preconditions | emp-101 has FINALIZED analysis; a SUPERSEDED older one exists |
| Test data | GET single + batch |
| Steps | 1. GET `/gap-contract/v1?employeeId=emp-101&modelId=CM-CLERK`. 2. GET `/gap-contract/v1/batch?orgUnitId=&fy=`. |
| Expected | Returns `{employeeId, competencyModelId, generatedOn, scoringMode, modelStaleFlag, gaps[{competencyId,isCritical,gapSize,discountedForStaleness}]}`; reflects latest FINALIZED (SUPERSEDED not exposed); binary fields always present, weighted only if `ld.gap-weighted`; batch cursor-paginated. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G07-086** | |
| Traces-to | FR-G07-024 AC.3, edge case (out-of-scope consumer); §1.3 multi-tenant |
| Type | Authorization / Negative |
| Title | Gap Contract row-scoping — out-of-scope employee never leaks existence |
| Preconditions | G06/G08 service principal scoped to OU-1; target employee in TEN-B |
| Test data | cross-tenant/out-of-scope employeeId |
| Steps | 1. GET `/gap-contract/v1?employeeId=<TEN-B emp>`. |
| Expected | **403 FORBIDDEN** (P02 row scope) — never reveals existence; empty contract with reason when no FINALIZED analysis for an in-scope employee. |
| Priority | P1 |

### Cross-cutting: Authentication, Multi-tenant, API-Contract, Pagination

| Field | Value |
|---|---|
| **TC-G07-087** | |
| Traces-to | §2.4 / Foundation §1; UNAUTHENTICATED |
| Type | Authorization / API-Contract |
| Title | Missing/expired bearer token rejected on every endpoint |
| Preconditions | No/expired JWT |
| Test data | expired token |
| Steps | 1. GET `/skills` with no token. 2. POST `/training-sessions/{id}/nominations` expired token. |
| Expected | **401 UNAUTHENTICATED** on both; `X-Correlation-Id` present; canonical error envelope. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-088** | |
| Traces-to | §1.3 multi-tenant; Platform §0.1; NOT_FOUND |
| Type | Data-Integrity / Authorization |
| Title | Cross-tenant isolation — TEN-B user cannot read TEN-A records |
| Preconditions | Skill `SKL-SQL` in TEN-A; `sys-131` scoped to TEN-B |
| Test data | TEN-B principal, TEN-A skill id |
| Steps | 1. TEN-B principal GET `/skills/{TEN-A id}`. 2. List query without scope. |
| Expected | **404 NOT_FOUND** (out-of-scope indistinguishable from absent); unscoped list rejected (not defaulted to all). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-089** | |
| Traces-to | Foundation §1 (cursor pagination); auth-matrix (Auditor read-only) |
| Type | API-Contract / Authorization |
| Title | Cursor pagination bounds and Auditor read-only enforcement |
| Preconditions | >100 training needs; `aud-121` Auditor |
| Test data | `limit=200`; auditor write attempt |
| Steps | 1. GET `/training-needs?limit=200`. 2. GET with `next_cursor`. 3. `aud-121` POST `/training-needs`. |
| Expected | `limit` capped at 100 (default 25); `next_cursor` returned/honoured; no offset paging; Auditor write → **403 FORBIDDEN** (read-only). |
| Priority | P2 |

### E2E Flows

| Field | Value |
|---|---|
| **TC-G07-090** | |
| Traces-to | FR-G07-004/005/006/009/010/011/012/016; E2E significant certification → /sr/ingest |
| Type | E2E-Flow |
| Title | End-to-end: need → plan → nomination → session → attendance → assessment → cert → G12 SR posting |
| Preconditions | ACTIVE annual plan, budget, PUBLISHED mandatory program + session |
| Test data | emp-101 full lifecycle; significant (mandatory) cert |
| Steps | 1. Gap→need (convert). 2. Plan item + budget. 3. Nominate → P01 L1/L2 APPROVED. 4. Session RUNNING, attendance ≥ threshold. 5. PRE/POST=PASS. 6. Issue certificate. 7. Significance resolves significant → post to `/sr/ingest`. |
| Expected | Certificate ACTIVE; `sr_posting_status` PENDING→POSTED; pinned SrIngestEvent (`eventType=TRAINING_QUALIFICATION`, `sourceModule=G07`, idempotencyKey) appended to G12 ledger; `serviceRegisterEventId` stored; budget committed→actual; every step P05-audited; `X-Correlation-Id` threaded across all calls. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-091** | |
| Traces-to | FR-G07-004/024; E2E skill-gap feeds G08; FR-G07-002 |
| Type | E2E-Flow / Integration |
| Title | End-to-end: gap analysis → Gap Contract v1 consumed by G08 appraisal |
| Preconditions | FINALIZED gap analysis for emp-101; G08 consumer principal in scope |
| Test data | Gap Contract batch for OU-1 FY2026 |
| Steps | 1. Compute + finalize gap analysis. 2. G08 GET `/gap-contract/v1?employeeId=emp-101`. 3. G08 GET `/gap-contract/v1/batch?orgUnitId=OU-1&fy=2026`. |
| Expected | G08 receives pinned v1 projection (critical/non-critical, staleness flags) reflecting latest FINALIZED; schema registered (§10.6); row-scoped to consumer; version stable/backward-compatible. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-092** | |
| Traces-to | FR-G07-017/009/022/010/012; E2E mandatory campaign at scale via kiosk/offline |
| Type | E2E-Flow |
| Title | End-to-end: mandatory campaign → bulk enrol → auto-wave → kiosk/offline attendance → completion coverage |
| Preconditions | ALL_STAFF campaign incl. non-login field staff; kiosk stations |
| Test data | ~large scope; `coverageDenominatorRule` set |
| Steps | 1. Create + P01-approve campaign. 2. `:enroll-batch` (idempotent). 3. `:auto-wave` into capacity-bounded sessions. 4. Kiosk/offline attendance sync for `emp-909`. 5. Assess/complete. 6. GET coverage. |
| Expected | Campaign nominations (`CAMPAIGN`) created idempotently; waves respect capacity; non-login staff reached via attributed kiosk + offline sync (deduped); coverage % against eligible denominator; completions feed mandatory-compliance status; self-withdraw blocked (`ERR-G07-MANDATORY`). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G07-093** | |
| Traces-to | FR-G07-018/016/012; E2E external credential → verification → SR posting |
| Type | E2E-Flow / Integration |
| Title | End-to-end: external professional credential capture → verify → significant → SR post |
| Preconditions | emp-101 external credential with evidence in G13 |
| Test data | PMP credential, significant |
| Steps | 1. Capture external credential. 2. L&D verify (SoD). 3. Significance resolves significant. 4. Post to `/sr/ingest`. |
| Expected | VERIFIED credential (immutable trail); `credentialSource=EXTERNAL_PROFESSIONAL` in SrIngestEvent; only VERIFIED posts; idempotent; `serviceRegisterEventId` stored; may update `employee_skills`. |
| Priority | P2 |

---

## 3. Traceability Matrix (FR → TC — 0 gaps)

| FR | Description | Test Cases |
|---|---|---|
| FR-G07-001 | Skill taxonomy & competency framework | TC-G07-001, 002, 003, 004, 005 |
| FR-G07-002 | Competency models & governance | TC-G07-006, 007, 008, 009 |
| FR-G07-003 | Employee skill inventory & freshness | TC-G07-010, 011, 012, 013 |
| FR-G07-004 | Incremental skill-gap analysis | TC-G07-014, 015, 016, 017, 090, 091 |
| FR-G07-005 | Training needs identification | TC-G07-018, 019, 020, 090 |
| FR-G07-006 | Annual plan & budget | TC-G07-021, 022, 023, 090 |
| FR-G07-007 | Course catalog & programs | TC-G07-024, 025, 026 |
| FR-G07-008 | Session/trainer/venue | TC-G07-027, 028, 029, 030 |
| FR-G07-009 | Nomination & P01 approval | TC-G07-031, 032, 033, 034, 035, 036, 090, 092 |
| FR-G07-010 | Attendance (kiosk/offline) | TC-G07-037, 038, 039, 040, 090, 092 |
| FR-G07-011 | Assessment & Kirkpatrick | TC-G07-041, 042, 043, 044, 090 |
| FR-G07-012 | Certification, validity & renewal | TC-G07-045, 046, 047, 048, 090, 092, 093 |
| FR-G07-013 | Induction / onboarding | TC-G07-049, 050 |
| FR-G07-014 | Learning paths / CPD / marketplace | TC-G07-051, 052, 053 |
| FR-G07-015 | LMS/LRS integration (X.3) | TC-G07-054, 055, 056, 057, 058 |
| FR-G07-016 | SR posting & budget/cost | TC-G07-059, 060, 061, 062, 063, 090, 093 |
| FR-G07-017 | Mandatory-compliance campaign engine | TC-G07-064, 065, 066, 067, 068, 092 |
| FR-G07-018 | External & professional credentials | TC-G07-069, 070, 071, 093 |
| FR-G07-019 | Vendor empanelment | TC-G07-072, 073 |
| FR-G07-020 | Sponsorship / study-leave bond | TC-G07-074, 075, 076 |
| FR-G07-021 | Content & assessment-item management | TC-G07-077, 078, 079 |
| FR-G07-022 | Proxy/kiosk/assisted & offline sync | TC-G07-080, 081, 092 |
| FR-G07-023 | DPDP retention & erasure | TC-G07-082, 083, 084 |
| FR-G07-024 | Published Gap Contract for G06/G08 | TC-G07-085, 086, 091 |
| Cross-cutting | Auth / multi-tenant / API-contract / pagination | TC-G07-087, 088, 089 |

**Coverage: 24 of 24 FRs — 0 gaps.**

---

## 4. Coverage Summary

### 4.1 By type (primary type; E2E flows exercise multiple)
| Type | Count | Test cases |
|---|---|---|
| Functional | 14 | 001, 007, 010, 014, 018, 024, 027, 037, 041, 051, 059, 064, 081, 084 |
| Boundary | 8 | 002*, 003, 015, 022, 038, 042, 058, 066 |
| Negative | 20 | 004, 005, 006, 019, 020, 023, 025, 026, 028, 029, 030*, 034, 035, 040, 042*, 057, 068, 070, 073, 083 |
| Authorization | 14 | 011, 020*, 033, 043*, 048*, 052, 053, 062, 072, 076, 078, 080, 082, 086, 087*, 089 |
| Integration | 15 | 008*, 012, 013, 016, 021*, 044, 049, 050, 054, 055, 056, 057*, 060, 061, 063, 067, 071, 073*, 074, 091, 093 |
| State-Transition | 16 | 008, 009*, 017, 021, 026*, 030, 031, 032, 045, 046, 047, 048, 068, 069, 072, 074, 075, 076, 079, 082 |
| Data-Integrity | 15 | 004*, 005, 009, 010, 013, 015, 019, 023, 028, 037, 039, 051, 058, 059, 071, 079, 083, 084, 088 |
| API-Contract | 5 | 036, 055, 065, 085, 087, 089 |
| Security | 3 | 054*, 062*, 078 |
| E2E-Flow | 6 | 031*, 049*, 090, 091, 092, 093 |

*Secondary type on a case whose primary is listed elsewhere; the table above assigns each TC one primary bucket for the totals below.

### 4.2 Distinct test-case totals by primary type
| Primary Type | Count |
|---|---|
| Functional | 12 |
| Boundary | 6 |
| Negative | 17 |
| Authorization | 12 |
| Integration | 14 |
| State-Transition | 12 |
| Data-Integrity | 9 |
| API-Contract | 5 |
| Security | 1 |
| E2E-Flow | 5 |
| **Total** | **93** |

### 4.3 By priority
| Priority | Count | Notes |
|---|---|---|
| P1 | 34 | Statutory/compliance/security-critical (SoD, mandatory campaign, cert eligibility/expiry, SR posting, DPDP retention, LMS secrets, bond recovery, WCAG, tenant isolation, auth, all E2E) |
| P2 | 40 | Core happy-path & major business rules |
| P3 | 19 | Secondary/edge/analytics |
| **Total** | **93** | |

### 4.4 Notes
- Negative tests assert the exact wire status + code: `ERR-G07-CAPACITY/BUDGET/EMPANEL/SCHEDULE/CERT-INELIGIBLE/WCAG/BOND/RETENTION/MANDATORY` and shared `ERR-FORBIDDEN/PRECOND/DUP-INSTANCE/REASON-REQ/LOADFAIL`, plus the 8 standard wire codes.
- All five G07 state machines are exercised: nomination (031/032/035), training_session (030), certification (045/046/047/048), sponsorship_bond (074/075/076), sr_posting (060/061).
- Platform guarantees verified throughout: P01 SoD/maker-checker, P02 scope + field mask, P04 secret isolation (no creds in G07 tables), P05 immutable audit incl. waitlist promotion & campaign waves, X.1 idempotent resumable jobs, X.2 notifications, X.3 idempotency/circuit-breaker, cursor pagination, `Idempotency-Key`, `X-Correlation-Id`, multi-tenant `tenant_id`/`entity_id` scoping.
