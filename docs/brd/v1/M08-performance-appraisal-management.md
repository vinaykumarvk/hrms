# Performance Appraisal Management — HRMS Module BRD

**Module code:** M08-PAM
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite")
**Document version:** v1.0
**Status:** Baseline for build (parallel-agent ready)
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM) layered on the public-sector statutory **APAR** (Annual Performance Appraisal Report) context.
**Upstream contract:** `docs/brd/SHARED_FOUNDATION.md` (canonical entities, conventions, RBAC, technical defaults). This BRD **references** shared elements and only **extends** them.

---

## Section 1 — Executive Summary

### 1.1 Purpose

Performance Appraisal Management (M08-PAM) is the system of engagement and adjudication for measuring, recording, moderating and certifying employee performance across an annual (and continuous) cycle. It unifies two worlds that government HR has historically kept apart:

1. **Modern continuous performance management (CPM)** — OKR/KRA-based goal-setting, cascading objectives, real-time feedback, check-ins, 360-degree feedback, competency assessment, and calibration — the practices best-in-class enterprises expect.
2. **The statutory APAR process** — a confidential, multi-tier adjudicated record authored by a **Reporting Officer**, scrutinised by a **Reviewing Officer**, and certified by an **Accepting Authority**, including numeric grading, the integrity/attribute columns, the pen-picture, mandatory **disclosure** of the full APAR to the officer reported upon, the right of **representation/appeal** against adverse or below-benchmark remarks, and the eventual **custody and posting** of the final grade to the Digital Service Register.

### 1.2 Business outcomes

| Outcome | Measure |
|---|---|
| Timely cycle completion | ≥ 95% of APARs certified within the statutory calendar window |
| Goal alignment | ≥ 90% of employees with approved, weighted, cascaded goals before cycle mid-point |
| Procedural fairness | 100% of adverse remarks disclosed; 100% of representations adjudicated within SLA |
| Defensible moderation | Every calibration adjustment carries a recorded, attributable rationale |
| Statutory integrity | 100% of final grades posted to M12 Service Register as append-only events |
| Workforce insight | Real-time rating-distribution and skew analytics for every org unit |

### 1.3 Scope at a glance

In scope: cycle configuration; templates; goal/KRA/KPI management with weightages and cascading; self-appraisal; APAR three-tier workflow; rating scales and numeric grade computation; disclosure and representation/appeal; calibration/normalisation/bell-curve moderation; continuous feedback and check-ins; 360-degree feedback; competency assessment with skill-gap → training linkage to M07; Performance Improvement Plans (PIP); custody/confidentiality controls; posting final ratings to M12 and feeding promotion eligibility to M06; performance analytics.

Out of scope (owned elsewhere): the employee master (M01), training delivery (M07), promotion decisioning (M06), disciplinary proceedings (M09), payroll/increment posting (M10), the Service Register ledger itself (M12), and the document object store (M13).

### 1.4 Key design principles

- **Confidentiality by construction.** APAR content is need-to-know; field-level and tier-aware visibility is enforced server-side, not in the UI alone.
- **Append-only certification.** Once certified and disclosed, an APAR grade is immutable except through the representation/expunction workflow; final grades are posted as immutable SR events.
- **Separation of duties.** Maker ≠ checker at every tier; no officer may report on, review, accept, or calibrate their own APAR.
- **Evidence-linked.** Every rating links to goals, check-ins, feedback and competency evidence so adjudication is defensible.
- **Configurable, not hard-coded.** Scales, weightages, benchmarks, workflows and disclosure rules are configuration, versioned per cycle.

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Description | Primary FRs |
|---|---|---|
| Cycle & template administration | Define appraisal cycles, eligibility, calendar, forms, scales | FR-M08-01, FR-M08-07 |
| Goal / objective management | KRA/KPI, OKR, cascading, weightages, mid-year revision | FR-M08-02 |
| Self-appraisal | Officer's self-assessment and achievement narrative | FR-M08-03 |
| APAR adjudication workflow | Reporting → Reviewing → Accepting tier flow | FR-M08-04, FR-M08-05, FR-M08-06 |
| Grading & rating | Scales, numeric grade roll-up, benchmark/adverse detection | FR-M08-07 |
| Disclosure & representation | Disclose APAR; appeal adverse remarks; expunction | FR-M08-08 |
| Calibration & moderation | Committee sessions, normalisation, bell-curve | FR-M08-09 |
| Continuous feedback & check-ins | Real-time feedback, periodic check-ins | FR-M08-10 |
| 360-degree feedback | Multi-rater nominations and aggregation | FR-M08-11 |
| Competency assessment | Competency rating + skill-gap → M07 training | FR-M08-12 |
| Performance Improvement Plan | PIP creation, milestones, outcome | FR-M08-13 |
| Downstream posting | Post final grade to M12; feed eligibility to M06 | FR-M08-14 |
| Custody & confidentiality | Disclosure log, access control, retention | FR-M08-15 |
| Analytics | Rating distribution, skew, completion, gap analytics | FR-M08-16 |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit:** every state change writes to `audit_log` (immutable).
- **Workflow engine:** `workflow_instances` / `workflow_tasks` drive the APAR tier flow and representation flow.
- **Documents:** supporting evidence, signed APAR PDFs and disclosure acknowledgements stored via M13 `documents`.
- **Notifications:** all task assignments, disclosures, deadlines via shared `notifications`.
- **Service Register:** final grades and adverse-remark events posted to M12 `service_register_events`.
- **RBAC + row-level org scoping:** standard across all endpoints; APAR adds tier-aware field-level scoping.
- **Pagination, soft-delete, UTC storage, `DD-MMM-YYYY` display:** per global conventions.

### 2.3 Boundaries & integration points

| Boundary | Direction | Contract |
|---|---|---|
| M01 Employee Master | read | Identity, designation, cadre, reporting chain, status |
| M06 Promotion/Progression | write (feed) | Final grade + benchmark eligibility flag per cycle |
| M07 Training & Skill | read/write | Competency framework (read); skill-gap nominations (write) |
| M09 Disciplinary | read | Active disciplinary/penalty status (affects APAR holds) |
| M12 Digital SR | write | Append-only `service_register_events` for final grade & adverse remarks |
| M13 Documents | read/write | Evidence, generated APAR PDF, disclosure acknowledgements |
| M14 Analytics | read | Exposes rating-distribution facts for cross-module dashboards |

### 2.4 Explicit exclusions

The module does **not** compute increments/pay (M10), does **not** decide promotions (only feeds eligibility to M06), does **not** run disciplinary inquiries (M09), and does **not** define the competency catalog (consumes M07's).

---

## Section 3 — Roles & Permissions

### 3.1 Module roles (extend Shared RBAC; do not contradict)

| Role | Origin | Description |
|---|---|---|
| Officer Reported Upon (Appraisee) | Shared: Employee | The employee whose performance is appraised; sets goals, self-appraises, views/represents APAR after disclosure |
| Reporting Officer (RO) | Shared: Reporting Manager (specialised) | First-tier appraiser; approves goals, writes assessment, integrity/pen-picture, initial grade |
| Reviewing Officer (RvO) | Shared: Dept Head (specialised) | Second-tier; concurs/varies RO assessment with recorded reasons |
| Accepting Authority (AA) | Shared: Appointing Authority (specialised) | Final certifying authority; settles grade, triggers disclosure |
| Calibration Committee Member | Module-specific | Participates in moderation sessions; proposes/votes adjustments |
| HR / APAR Cell Officer | Shared: HR Officer | Administers cycles, custody, disclosure dispatch, representation routing (non-adjudicating) |
| APAR Custodian | Module-specific (aligns with M12 Custodian) | Confidential custody, retention, expunction execution |
| Auditor (read-only) | Shared | Read APAR + audit log; no write |
| System Administrator | Shared | Configures scales, templates, workflows, RBAC; no self-adjudication |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-Delete/Withdraw, A=Approve/Adjudicate, X=No access)

| Capability | Appraisee | RO | RvO | AA | Calib. Member | HR/APAR Cell | Custodian | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|
| Configure cycle / template / scale | X | X | X | X | X | C R U | R | R | C R U |
| Set / approve goals | C R U (own) | A R U (reports) | R | R | X | R | X | R | X |
| Submit self-appraisal | C R U (own) | R | R | R | X | R | X | R | X |
| Write RO assessment | R (after disclosure) | C R U A | R | R | X | R | X | R | X |
| Write RvO review | X | R | C R U A | R | X | R | X | R | X |
| Accept / finalise grade | X | X | R | C R U A | R | R | X | R | X |
| Run calibration adjustment | X | R | R | R | C R A | R | X | R | X |
| Disclose APAR | R (recipient) | X | X | A | X | C A | R | R | X |
| File representation | C R (own) | R | R | A | X | R | R | R | X |
| Adjudicate representation | X | R | R | A | X | R | X | R | X |
| Create / manage PIP | R (own) | C R U A | A | R | X | R | X | R | X |
| Continuous feedback / check-in | C R (own+given) | C R U | C R | R | X | R | X | R | X |
| 360 feedback respond | C R (assigned) | C R | C R | R | X | C R U | X | R | X |
| Competency assessment | R (own) | C R U | R | A | X | R | X | R | X |
| Post grade to SR / feed M06 | X | X | X | trigger | X | A | A | R | X |
| View analytics | R (own only) | R (team) | R (org) | R (org) | R (calib scope) | R (org) | X | R | R |
| Access disclosure/custody log | R (own) | X | X | R | X | R | R A | R | R |

**Hard rule:** A user holding multiple roles is blocked at the API layer from acting on an APAR where they are the appraisee, or where they are any other tier in the same chain (self-adjudication and adjacent-tier conflict prevention).

---

## Section 4 — Shared Application Foundation

This module **inherits** Shared Foundation §5 verbatim and applies the following module specialisations.

- **Architecture:** React + TS (Tailwind + shadcn/ui) SPA; REST `/api/v1`; PostgreSQL; M13 object storage for evidence/PDF; CGG Data Centre deployment.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org scoping; **plus** APAR tier-aware field-level authorization (a server-side projection that strips fields the caller's tier/role may not see).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Inherited error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503).
- **Workflow:** APAR tier transitions and representation flow run on shared `workflow_instances`/`workflow_tasks`; M08 supplies the state machines (Section 12).
- **Security/compliance:** OWASP ASVS; TLS 1.2+; encryption at rest; DPDP Act 2023 alignment; APAR content classified **CONFIDENTIAL**; retention per statutory schedule (typically minimum service + statutory tail).
- **NFR baseline:** P95 < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min; RTO ≤ 4h (Section 10 extends).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

**Reused (defined in Shared Foundation — referenced, not redefined):** `employees`, `users`, `org_units`, `designations`, `cadres`, `roles`, `permissions`, `audit_log`, `documents`, `notifications`, `workflow_instances`, `workflow_tasks`, `service_register_events`.

**Module-owned entities (M08):**

| # | Entity | Purpose |
|---|---|---|
| E1 | `appraisal_cycles` | A configured appraisal period (statutory year / mid-year / continuous window) |
| E2 | `appraisal_templates` | Versioned form definition: sections, competencies, scale, weightage policy |
| E3 | `rating_scales` | Configurable grade scales (numeric + descriptor + benchmark thresholds) |
| E4 | `appraisal_forms` | The APAR instance for one appraisee × cycle (header, integrity, pen-picture, final grade) |
| E5 | `goals` | KRA/KPI/OKR with weightage, target, cascade parentage |
| E6 | `goal_checkins` | Periodic progress updates against a goal |
| E7 | `self_appraisals` | Appraisee's self-assessment payload for a form |
| E8 | `appraisal_assessments` | Per-tier (RO/RvO/AA) assessment record with grades and remarks |
| E9 | `competency_assessments` | Per-competency ratings and identified skill gaps |
| E10 | `continuous_feedback` | Real-time praise/constructive feedback notes |
| E11 | `feedback_360_requests` | A 360 nomination/request to a rater |
| E12 | `feedback_360_responses` | A rater's 360 response |
| E13 | `representations` | Appeal/representation against adverse or below-benchmark remarks |
| E14 | `calibration_sessions` | A moderation/normalisation committee session |
| E15 | `calibration_adjustments` | An individual rating change proposed/applied in calibration |
| E16 | `performance_improvement_plans` | PIP header tied to an appraisee |
| E17 | `pip_milestones` | Milestones/checkpoints within a PIP |
| E18 | `apar_disclosure_log` | Custody & disclosure/acknowledgement ledger (append-only) |

### 5.2 Full field tables

#### E1 — `appraisal_cycles`
| Field | Type | Null | Notes |
|---|---|---|---|
| `cycle_id` | UUID PK | N | |
| `cycle_code` | VARCHAR(40) UNIQUE | N | e.g. `APAR-2025-26` |
| `name` | VARCHAR(160) | N | |
| `cycle_type` | ENUM | N | ANNUAL_APAR, MID_YEAR, PROBATION, CONTINUOUS, AD_HOC |
| `fiscal_year` | VARCHAR(9) | N | `2025-2026` |
| `goal_window_start` | DATE | N | |
| `goal_window_end` | DATE | N | |
| `appraisal_period_start` | DATE | N | Performance period start |
| `appraisal_period_end` | DATE | N | |
| `self_appraisal_due` | DATE | Y | |
| `ro_due` | DATE | Y | |
| `rvo_due` | DATE | Y | |
| `aa_due` | DATE | Y | |
| `template_id` | UUID FK→E2 | N | |
| `rating_scale_id` | UUID FK→E3 | N | |
| `eligibility_rule` | JSONB | Y | cadre/designation/min-service filters |
| `disclosure_required` | BOOLEAN | N | default true |
| `calibration_enabled` | BOOLEAN | N | default true |
| `status` | ENUM | N | DRAFT, OPEN, GOALS_LOCKED, IN_PROGRESS, CALIBRATION, DISCLOSURE, CLOSED, ARCHIVED |
| audit fields | — | — | created_at, updated_at, created_by, updated_by, is_deleted |

#### E2 — `appraisal_templates`
| Field | Type | Null | Notes |
|---|---|---|---|
| `template_id` | UUID PK | N | |
| `template_code` | VARCHAR(40) UNIQUE | N | |
| `name` | VARCHAR(160) | N | |
| `version` | INT | N | immutable per published version |
| `applies_to_cadre` | VARCHAR[] | Y | |
| `sections` | JSONB | N | ordered section/field definitions |
| `competency_set` | JSONB | N | references M07 competency IDs |
| `weightage_policy` | JSONB | N | goal vs competency split, caps, sum=100 rule |
| `integrity_column_enabled` | BOOLEAN | N | statutory integrity attribute |
| `penpicture_min_words` | INT | Y | |
| `status` | ENUM | N | DRAFT, PUBLISHED, RETIRED |
| audit fields | — | — | |

#### E3 — `rating_scales`
| Field | Type | Null | Notes |
|---|---|---|---|
| `rating_scale_id` | UUID PK | N | |
| `scale_code` | VARCHAR(40) UNIQUE | N | e.g. `APAR-10PT` |
| `name` | VARCHAR(120) | N | |
| `min_value` | NUMERIC(4,2) | N | e.g. 1.00 |
| `max_value` | NUMERIC(4,2) | N | e.g. 10.00 |
| `grades` | JSONB | N | ordered [{label:"Outstanding",min:9,max:10,descriptor}] |
| `benchmark_grade` | NUMERIC(4,2) | N | promotion benchmark threshold |
| `adverse_threshold` | NUMERIC(4,2) | N | below = adverse remark |
| `decimal_places` | INT | N | default 2 |
| `status` | ENUM | N | ACTIVE, RETIRED |
| audit fields | — | — | |

#### E4 — `appraisal_forms` (APAR instance)
| Field | Type | Null | Notes |
|---|---|---|---|
| `form_id` | UUID PK | N | |
| `apar_no` | VARCHAR(40) UNIQUE | N | human key e.g. `APAR-2025-26-000142` |
| `cycle_id` | UUID FK→E1 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `org_unit_id` | UUID FK→org_units | N | snapshot at open |
| `designation_id` | UUID FK→designations | N | snapshot |
| `reporting_officer_id` | UUID FK→employees | N | resolved RO |
| `reviewing_officer_id` | UUID FK→employees | Y | |
| `accepting_authority_id` | UUID FK→employees | Y | |
| `integrity_certified` | ENUM | Y | BEYOND_DOUBT, WATCH, NOT_CERTIFIED |
| `integrity_remark` | TEXT | Y | required if not BEYOND_DOUBT |
| `pen_picture` | TEXT | Y | RO narrative |
| `provisional_grade` | NUMERIC(4,2) | Y | RO-stage grade |
| `reviewed_grade` | NUMERIC(4,2) | Y | RvO-stage grade |
| `final_grade` | NUMERIC(4,2) | Y | AA-certified grade |
| `final_grade_label` | VARCHAR(40) | Y | derived from scale |
| `is_adverse` | BOOLEAN | N | default false; set when below adverse_threshold |
| `below_benchmark` | BOOLEAN | N | default false |
| `calibrated` | BOOLEAN | N | default false |
| `pre_calibration_grade` | NUMERIC(4,2) | Y | preserved on adjustment |
| `disclosed_at` | TIMESTAMP | Y | |
| `acknowledged_at` | TIMESTAMP | Y | appraisee acknowledgement |
| `status` | ENUM | N | see Section 12 state machine |
| `workflow_instance_id` | UUID FK | Y | |
| `generated_pdf_doc_id` | UUID FK→documents | Y | |
| `posted_to_sr` | BOOLEAN | N | default false |
| `confidentiality_class` | ENUM | N | default CONFIDENTIAL |
| audit fields | — | — | |

#### E5 — `goals`
| Field | Type | Null | Notes |
|---|---|---|---|
| `goal_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `goal_type` | ENUM | N | KRA, KPI, OKR_OBJECTIVE, OKR_KEYRESULT, DEVELOPMENT |
| `parent_goal_id` | UUID FK→E5 | Y | cascade parentage |
| `cascaded_from_employee_id` | UUID FK→employees | Y | source of cascade |
| `title` | VARCHAR(200) | N | |
| `description` | TEXT | Y | |
| `metric` | VARCHAR(200) | Y | measure of success |
| `target_value` | VARCHAR(80) | Y | |
| `weightage` | NUMERIC(5,2) | N | percent; siblings sum to 100 |
| `due_date` | DATE | Y | |
| `achievement_pct` | NUMERIC(5,2) | Y | self/RO assessed |
| `self_rating` | NUMERIC(4,2) | Y | |
| `ro_rating` | NUMERIC(4,2) | Y | |
| `status` | ENUM | N | DRAFT, PROPOSED, APPROVED, REVISED, ACHIEVED, NOT_ACHIEVED, DROPPED |
| `approved_by` | UUID FK→employees | Y | RO |
| `approved_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E6 — `goal_checkins`
| Field | Type | Null | Notes |
|---|---|---|---|
| `checkin_id` | UUID PK | N | |
| `goal_id` | UUID FK→E5 | N | |
| `checkin_date` | DATE | N | |
| `progress_pct` | NUMERIC(5,2) | Y | |
| `status_note` | TEXT | Y | |
| `raised_by` | UUID FK→employees | N | appraisee or RO |
| `blockers` | TEXT | Y | |
| audit fields | — | — | |

#### E7 — `self_appraisals`
| Field | Type | Null | Notes |
|---|---|---|---|
| `self_appraisal_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 UNIQUE | N | one per form |
| `achievements` | TEXT | N | narrative |
| `goal_summary` | JSONB | Y | per-goal self rating snapshot |
| `competency_self_rating` | JSONB | Y | |
| `constraints_faced` | TEXT | Y | |
| `training_needs` | TEXT | Y | feeds competency/M07 |
| `submitted_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | DRAFT, SUBMITTED, RETURNED |
| audit fields | — | — | |

#### E8 — `appraisal_assessments`
| Field | Type | Null | Notes |
|---|---|---|---|
| `assessment_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `tier` | ENUM | N | REPORTING, REVIEWING, ACCEPTING |
| `assessor_id` | UUID FK→employees | N | |
| `overall_grade` | NUMERIC(4,2) | Y | |
| `section_grades` | JSONB | Y | per-section scoring |
| `remarks` | TEXT | Y | |
| `concurs_with_lower_tier` | BOOLEAN | Y | RvO/AA: agree with RO? |
| `variance_reason` | TEXT | Y | required if not concurring |
| `decision` | ENUM | Y | SUBMITTED, RETURNED, CONCURRED, VARIED, CERTIFIED |
| `acted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E9 — `competency_assessments`
| Field | Type | Null | Notes |
|---|---|---|---|
| `comp_assessment_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `competency_id` | UUID | N | references M07 competency catalog |
| `competency_name` | VARCHAR(160) | N | snapshot |
| `required_level` | INT | N | from role profile (M07) |
| `self_level` | INT | Y | |
| `assessed_level` | INT | Y | RO assessed |
| `gap` | INT | Y | derived required − assessed |
| `gap_severity` | ENUM | Y | NONE, MINOR, MODERATE, CRITICAL |
| `training_nomination_id` | UUID | Y | M07 nomination created from gap |
| audit fields | — | — | |

#### E10 — `continuous_feedback`
| Field | Type | Null | Notes |
|---|---|---|---|
| `feedback_id` | UUID PK | N | |
| `subject_employee_id` | UUID FK→employees | N | |
| `author_id` | UUID FK→employees | N | |
| `cycle_id` | UUID FK→E1 | Y | |
| `feedback_type` | ENUM | N | PRAISE, CONSTRUCTIVE, COACHING, GENERAL |
| `visibility` | ENUM | N | PRIVATE_TO_SUBJECT, MANAGER_ONLY, MANAGER_AND_SUBJECT |
| `body` | TEXT | N | |
| `linked_goal_id` | UUID FK→E5 | Y | |
| `is_acknowledged` | BOOLEAN | N | default false |
| audit fields | — | — | |

#### E11 — `feedback_360_requests`
| Field | Type | Null | Notes |
|---|---|---|---|
| `request_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `subject_employee_id` | UUID FK→employees | N | |
| `rater_id` | UUID FK→employees | N | |
| `rater_relationship` | ENUM | N | PEER, SUBORDINATE, MANAGER, INTERNAL_CUSTOMER, EXTERNAL |
| `anonymous` | BOOLEAN | N | default true |
| `due_date` | DATE | Y | |
| `status` | ENUM | N | INVITED, IN_PROGRESS, SUBMITTED, DECLINED, EXPIRED |
| audit fields | — | — | |

#### E12 — `feedback_360_responses`
| Field | Type | Null | Notes |
|---|---|---|---|
| `response_id` | UUID PK | N | |
| `request_id` | UUID FK→E11 UNIQUE | N | |
| `ratings` | JSONB | N | per-competency/behaviour scores |
| `strengths` | TEXT | Y | |
| `improvements` | TEXT | Y | |
| `submitted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E13 — `representations`
| Field | Type | Null | Notes |
|---|---|---|---|
| `representation_id` | UUID PK | N | |
| `rep_no` | VARCHAR(40) UNIQUE | N | |
| `form_id` | UUID FK→E4 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `grounds` | TEXT | N | basis of appeal |
| `contested_items` | JSONB | N | which remarks/grades contested |
| `supporting_doc_ids` | UUID[] | Y | M13 documents |
| `filed_at` | TIMESTAMP | N | |
| `sla_due_at` | TIMESTAMP | N | statutory window |
| `decision` | ENUM | Y | UPHELD, PARTIALLY_UPHELD, REJECTED, EXPUNGED, MODIFIED |
| `decision_authority_id` | UUID FK→employees | Y | competent authority |
| `decision_reason` | TEXT | Y | |
| `revised_grade` | NUMERIC(4,2) | Y | if modified |
| `status` | ENUM | N | FILED, UNDER_REVIEW, DECIDED, CLOSED |
| audit fields | — | — | |

#### E14 — `calibration_sessions`
| Field | Type | Null | Notes |
|---|---|---|---|
| `session_id` | UUID PK | N | |
| `cycle_id` | UUID FK→E1 | N | |
| `org_unit_scope` | UUID FK→org_units | N | population scoped |
| `method` | ENUM | N | BELL_CURVE, NORMALISATION, FORCED_DISTRIBUTION, COMMITTEE_REVIEW |
| `target_distribution` | JSONB | Y | e.g. {Outstanding:10,VeryGood:20,...} |
| `committee_member_ids` | UUID[] | N | |
| `scheduled_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | PLANNED, IN_SESSION, COMPLETED, CANCELLED |
| `outcome_summary` | TEXT | Y | |
| audit fields | — | — | |

#### E15 — `calibration_adjustments`
| Field | Type | Null | Notes |
|---|---|---|---|
| `adjustment_id` | UUID PK | N | |
| `session_id` | UUID FK→E14 | N | |
| `form_id` | UUID FK→E4 | N | |
| `old_grade` | NUMERIC(4,2) | N | |
| `proposed_grade` | NUMERIC(4,2) | N | |
| `applied_grade` | NUMERIC(4,2) | Y | after vote |
| `rationale` | TEXT | N | mandatory |
| `vote_record` | JSONB | Y | member decisions |
| `status` | ENUM | N | PROPOSED, APPROVED, REJECTED, APPLIED |
| audit fields | — | — | |

#### E16 — `performance_improvement_plans`
| Field | Type | Null | Notes |
|---|---|---|---|
| `pip_id` | UUID PK | N | |
| `pip_no` | VARCHAR(40) UNIQUE | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `form_id` | UUID FK→E4 | Y | originating APAR (if any) |
| `initiated_by` | UUID FK→employees | N | RO |
| `reason` | TEXT | N | |
| `start_date` | DATE | N | |
| `target_end_date` | DATE | N | |
| `success_criteria` | TEXT | N | |
| `outcome` | ENUM | Y | SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| `status` | ENUM | N | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED |
| audit fields | — | — | |

#### E17 — `pip_milestones`
| Field | Type | Null | Notes |
|---|---|---|---|
| `milestone_id` | UUID PK | N | |
| `pip_id` | UUID FK→E16 | N | |
| `title` | VARCHAR(200) | N | |
| `due_date` | DATE | N | |
| `metric` | VARCHAR(200) | Y | |
| `progress_note` | TEXT | Y | |
| `status` | ENUM | N | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| audit fields | — | — | |

#### E18 — `apar_disclosure_log` (append-only)
| Field | Type | Null | Notes |
|---|---|---|---|
| `disclosure_log_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `event_type` | ENUM | N | DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, EXPUNGED |
| `actor_id` | UUID FK→employees | N | |
| `actor_role` | VARCHAR(60) | N | |
| `ip_address` | INET | Y | |
| `detail` | JSONB | Y | |
| `event_at` | TIMESTAMP | N | append-only; no update/delete |

### 5.3 Relationship map

```
appraisal_cycles (E1) ──1:N──> appraisal_forms (E4) ──1:1──> self_appraisals (E7)
   │  └─FK template (E2), rating_scale (E3)               ├─1:N──> goals (E5) ──1:N──> goal_checkins (E6)
   │                                                       ├─1:N──> appraisal_assessments (E8)  [RO/RvO/AA]
appraisal_templates (E2) ──refs M07 competency catalog    ├─1:N──> competency_assessments (E9) ──> M07 nomination
rating_scales (E3) ──defines──> grade/benchmark/adverse   ├─1:N──> feedback_360_requests (E11) ──1:1──> responses (E12)
                                                           ├─1:N──> representations (E13)
calibration_sessions (E14) ──1:N──> calibration_adjustments (E15) ──N:1──> appraisal_forms (E4)
performance_improvement_plans (E16) ──1:N──> pip_milestones (E17); E16 ──N:1──> employees, ──0:1──> form (E4)
continuous_feedback (E10) ──N:1──> employees (subject/author), ──0:1──> goals (E5)
apar_disclosure_log (E18) ──N:1──> appraisal_forms (E4)   [append-only custody ledger]
appraisal_forms (E4) ──posts──> service_register_events (M12); ──feeds──> M06 eligibility; ──generates──> documents (M13)
```

### 5.4 Ownership / reuse matrix

| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations` | M01 | M08 (read) | M01 |
| competency catalog | M07 | M08 (read) | M07 |
| `service_register_events` | M12 | M08, M14 | M08 (append), others |
| `documents` | M13 | M08 | M08 (evidence/PDF) |
| `notifications`, `audit_log`, `workflow_*` | Platform | M08 | M08 |
| E1–E18 (this module) | **M08** | M14 (analytics), M06 (eligibility feed) | M08 |
| promotion eligibility feed | M06 | M06 | M08 (write) |
| training nominations | M07 | M07 | M08 (write from skill gap) |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| cycle_type | ANNUAL_APAR, MID_YEAR, PROBATION, CONTINUOUS, AD_HOC |
| cycle.status | DRAFT, OPEN, GOALS_LOCKED, IN_PROGRESS, CALIBRATION, DISCLOSURE, CLOSED, ARCHIVED |
| template.status | DRAFT, PUBLISHED, RETIRED |
| rating_scale.status | ACTIVE, RETIRED |
| form.status | DRAFT, GOALS_PENDING, GOALS_APPROVED, SELF_APPRAISAL, RO_ASSESSMENT, RVO_REVIEW, AA_ACCEPTANCE, CALIBRATION, DISCLOSED, REPRESENTATION, FINALISED, POSTED, EXPUNGED, WITHDRAWN |
| integrity_certified | BEYOND_DOUBT, WATCH, NOT_CERTIFIED |
| goal_type | KRA, KPI, OKR_OBJECTIVE, OKR_KEYRESULT, DEVELOPMENT |
| goal.status | DRAFT, PROPOSED, APPROVED, REVISED, ACHIEVED, NOT_ACHIEVED, DROPPED |
| self_appraisal.status | DRAFT, SUBMITTED, RETURNED |
| assessment.tier | REPORTING, REVIEWING, ACCEPTING |
| assessment.decision | SUBMITTED, RETURNED, CONCURRED, VARIED, CERTIFIED |
| gap_severity | NONE, MINOR, MODERATE, CRITICAL |
| feedback_type | PRAISE, CONSTRUCTIVE, COACHING, GENERAL |
| feedback.visibility | PRIVATE_TO_SUBJECT, MANAGER_ONLY, MANAGER_AND_SUBJECT |
| rater_relationship | PEER, SUBORDINATE, MANAGER, INTERNAL_CUSTOMER, EXTERNAL |
| 360.status | INVITED, IN_PROGRESS, SUBMITTED, DECLINED, EXPIRED |
| representation.decision | UPHELD, PARTIALLY_UPHELD, REJECTED, EXPUNGED, MODIFIED |
| representation.status | FILED, UNDER_REVIEW, DECIDED, CLOSED |
| calibration.method | BELL_CURVE, NORMALISATION, FORCED_DISTRIBUTION, COMMITTEE_REVIEW |
| calibration.status | PLANNED, IN_SESSION, COMPLETED, CANCELLED |
| adjustment.status | PROPOSED, APPROVED, REJECTED, APPLIED |
| pip.status | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED |
| pip.outcome | SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| milestone.status | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| disclosure.event_type | DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, EXPUNGED |

### 5.6 Data integrity rules

1. **Weightage sum.** For a given `form_id`, weightages of sibling APPROVED goals at the same cascade level must sum to 100 (±0.01). Enforced on goal-lock transition.
2. **Scale bounds.** Any grade (`provisional/reviewed/final/self/ro/proposed/applied`) must lie within `[rating_scales.min_value, max_value]`.
3. **Adverse / benchmark derivation.** `is_adverse = final_grade < adverse_threshold`; `below_benchmark = final_grade < benchmark_grade`. Derived on certification; never client-supplied.
4. **Tier ordering.** An `appraisal_assessments` row for REVIEWING cannot exist before REPORTING is SUBMITTED/CONCURRED; ACCEPTING requires REVIEWING complete.
5. **Self-adjudication block.** `appraisee_id` ∉ {reporting_officer_id, reviewing_officer_id, accepting_authority_id}; all four distinct.
6. **One self-appraisal.** Unique `(form_id)` on `self_appraisals`.
7. **One form per appraisee per cycle.** Unique `(cycle_id, appraisee_id)` on `appraisal_forms`.
8. **Disclosure precedence.** `representations` may only be FILED after `appraisal_forms.disclosed_at` is set.
9. **Immutability after FINALISED.** No update to grade fields once status ≥ FINALISED except via representation (sets EXPUNGED/MODIFIED with new audit chain).
10. **Append-only ledgers.** `apar_disclosure_log` and posted `service_register_events` accept INSERT only.
11. **Calibration provenance.** Applying a `calibration_adjustment` must set `appraisal_forms.pre_calibration_grade` (if null) and `calibrated=true`; `rationale` non-empty.
12. **Confidentiality.** Reading APAR content requires passing tier-aware authorization; denied reads append `ACCESS_DENIED` to `apar_disclosure_log`.
13. **FK respect + soft delete.** All FKs enforced; soft delete via `is_deleted` (ledgers exempt). Cascade is logical, never physical for statutory records.

### 5.7 Sample data (2–3 rows per entity)

**E1 appraisal_cycles**
| cycle_id | cycle_code | cycle_type | fiscal_year | status |
|---|---|---|---|---|
| 5c1…01 | APAR-2025-26 | ANNUAL_APAR | 2025-2026 | IN_PROGRESS |
| 5c1…02 | MIDYR-2025-26 | MID_YEAR | 2025-2026 | OPEN |
| 5c1…03 | PROB-2025-Q2 | PROBATION | 2025-2026 | CLOSED |

**E2 appraisal_templates**
| template_id | template_code | version | applies_to_cadre | status |
|---|---|---|---|---|
| t…01 | APAR-GAZ-A | 3 | {GAZETTED_A} | PUBLISHED |
| t…02 | APAR-NONGAZ | 2 | {NON_GAZETTED} | PUBLISHED |
| t…03 | OKR-EXEC | 1 | {EXECUTIVE} | DRAFT |

**E3 rating_scales**
| rating_scale_id | scale_code | min | max | benchmark_grade | adverse_threshold |
|---|---|---|---|---|---|
| r…01 | APAR-10PT | 1.00 | 10.00 | 6.00 | 4.00 |
| r…02 | APAR-5PT | 1.00 | 5.00 | 3.00 | 2.00 |
| r…03 | OKR-PCT | 0.00 | 100.00 | 70.00 | 40.00 |

**E4 appraisal_forms**
| form_id | apar_no | appraisee_id | reporting_officer_id | final_grade | is_adverse | status |
|---|---|---|---|---|---|---|
| f…01 | APAR-2025-26-000142 | emp…77 | emp…12 | 8.40 | false | DISCLOSED |
| f…02 | APAR-2025-26-000143 | emp…88 | emp…12 | 3.50 | true | REPRESENTATION |
| f…03 | APAR-2025-26-000144 | emp…99 | emp…30 | NULL | false | RO_ASSESSMENT |

**E5 goals**
| goal_id | form_id | goal_type | title | weightage | status |
|---|---|---|---|---|---|
| g…01 | f…01 | KRA | Reduce case backlog by 25% | 40.00 | ACHIEVED |
| g…02 | f…01 | KPI | Citizen grievance SLA ≥ 95% | 30.00 | ACHIEVED |
| g…03 | f…01 | DEVELOPMENT | Complete leadership programme | 30.00 | APPROVED |

**E6 goal_checkins**
| checkin_id | goal_id | checkin_date | progress_pct | raised_by |
|---|---|---|---|---|
| c…01 | g…01 | 2025-09-30 | 60.00 | emp…77 |
| c…02 | g…01 | 2025-12-31 | 85.00 | emp…77 |
| c…03 | g…02 | 2025-12-31 | 92.00 | emp…12 |

**E7 self_appraisals**
| self_appraisal_id | form_id | submitted_at | status |
|---|---|---|---|
| s…01 | f…01 | 2026-04-10T09:00Z | SUBMITTED |
| s…02 | f…02 | 2026-04-11T10:00Z | SUBMITTED |
| s…03 | f…03 | NULL | DRAFT |

**E8 appraisal_assessments**
| assessment_id | form_id | tier | assessor_id | overall_grade | decision |
|---|---|---|---|---|---|
| a…01 | f…01 | REPORTING | emp…12 | 8.20 | CONCURRED |
| a…02 | f…01 | REVIEWING | emp…30 | 8.40 | VARIED |
| a…03 | f…01 | ACCEPTING | emp…45 | 8.40 | CERTIFIED |

**E9 competency_assessments**
| comp_assessment_id | form_id | competency_name | required_level | assessed_level | gap_severity |
|---|---|---|---|---|---|
| ca…01 | f…01 | Public Service Ethics | 4 | 4 | NONE |
| ca…02 | f…01 | Data-Driven Decisions | 4 | 2 | MODERATE |
| ca…03 | f…03 | Stakeholder Mgmt | 3 | 1 | CRITICAL |

**E10 continuous_feedback**
| feedback_id | subject_employee_id | author_id | feedback_type | visibility |
|---|---|---|---|---|
| cf…01 | emp…77 | emp…12 | PRAISE | MANAGER_AND_SUBJECT |
| cf…02 | emp…88 | emp…12 | CONSTRUCTIVE | MANAGER_ONLY |
| cf…03 | emp…99 | emp…30 | COACHING | MANAGER_AND_SUBJECT |

**E11 feedback_360_requests**
| request_id | form_id | rater_id | rater_relationship | status |
|---|---|---|---|---|
| q…01 | f…01 | emp…21 | PEER | SUBMITTED |
| q…02 | f…01 | emp…34 | SUBORDINATE | IN_PROGRESS |
| q…03 | f…01 | emp…55 | INTERNAL_CUSTOMER | INVITED |

**E12 feedback_360_responses**
| response_id | request_id | submitted_at |
|---|---|---|
| rs…01 | q…01 | 2026-03-20T12:00Z |
| rs…02 | q…02 | NULL |
| rs…03 | q…04 | 2026-03-22T08:00Z |

**E13 representations**
| representation_id | rep_no | form_id | decision | status |
|---|---|---|---|---|
| rp…01 | REP-2025-26-0007 | f…02 | NULL | UNDER_REVIEW |
| rp…02 | REP-2025-26-0008 | f…02 | NULL | FILED |
| rp…03 | REP-2024-25-0099 | f…77 | PARTIALLY_UPHELD | CLOSED |

**E14 calibration_sessions**
| session_id | cycle_id | method | org_unit_scope | status |
|---|---|---|---|---|
| cs…01 | 5c1…01 | BELL_CURVE | ou…Dir | COMPLETED |
| cs…02 | 5c1…01 | COMMITTEE_REVIEW | ou…Div | IN_SESSION |
| cs…03 | 5c1…01 | NORMALISATION | ou…Reg | PLANNED |

**E15 calibration_adjustments**
| adjustment_id | session_id | form_id | old_grade | proposed_grade | status |
|---|---|---|---|---|---|
| adj…01 | cs…01 | f…01 | 8.60 | 8.40 | APPLIED |
| adj…02 | cs…01 | f…05 | 9.20 | 8.80 | PROPOSED |
| adj…03 | cs…01 | f…06 | 5.00 | 6.00 | REJECTED |

**E16 performance_improvement_plans**
| pip_id | pip_no | appraisee_id | outcome | status |
|---|---|---|---|---|
| pip…01 | PIP-2025-0003 | emp…88 | NULL | ACTIVE |
| pip…02 | PIP-2025-0004 | emp…91 | EXTENDED | UNDER_REVIEW |
| pip…03 | PIP-2024-0011 | emp…14 | SUCCESSFUL | CLOSED |

**E17 pip_milestones**
| milestone_id | pip_id | title | due_date | status |
|---|---|---|---|---|
| pm…01 | pip…01 | Clear 50 pending files | 2026-07-31 | ON_TRACK |
| pm…02 | pip…01 | Complete remedial training | 2026-08-15 | PENDING |
| pm…03 | pip…02 | Reduce error rate < 2% | 2026-06-30 | AT_RISK |

**E18 apar_disclosure_log**
| disclosure_log_id | form_id | event_type | actor_id | event_at |
|---|---|---|---|---|
| dl…01 | f…01 | DISCLOSED | emp…99(HR) | 2026-05-01T06:00Z |
| dl…02 | f…01 | ACKNOWLEDGED | emp…77 | 2026-05-03T07:30Z |
| dl…03 | f…02 | ACCESS_DENIED | emp…21 | 2026-05-02T05:10Z |

---

## Section 6 — Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table.

---

### FR-M08-01 — Appraisal Cycle & Template Configuration

- **Module:** M08-PAM
- **Primary Role(s):** System Administrator, HR/APAR Cell Officer
- **User Story:** As an HR administrator, I want to configure an appraisal cycle with its calendar, eligible population, template, and rating scale so that the correct APAR/OKR process runs for the right employees with statutory deadlines.

**Description.** Create and manage `appraisal_cycles` bound to a published `appraisal_template` and `rating_scale`, with goal/self/RO/RvO/AA windows, eligibility rules, and toggles for disclosure and calibration. Opening a cycle materialises one `appraisal_forms` per eligible employee with the RO/RvO/AA chain resolved from M01.

**Acceptance Criteria.**
1. A cycle cannot move to OPEN unless `template_id` is PUBLISHED and `rating_scale_id` is ACTIVE.
2. Opening a cycle generates exactly one form per eligible employee (idempotent re-run adds only newly eligible).
3. RO/RvO/AA are resolved from M01 reporting chain at open; unresolved chains are flagged, not silently dropped.
4. Eligibility rule filters by cadre/designation/min-service and excludes employees with status RETIRED/RESIGNED/DECEASED/TERMINATED.
5. Calendar dates must be chronologically ordered and within the fiscal year.

**Business Rules.**
- BR1: `goal_window_end ≤ appraisal_period_end`; `self_appraisal_due ≤ ro_due ≤ rvo_due ≤ aa_due`.
- BR2: A published template version is immutable; changes require a new version.
- BR3: A cycle in IN_PROGRESS may not change its scale/template.
- BR4: Suspended employees (M09) get forms but are flagged `hold` until disciplinary status clears.

**Data Model References.**
| Entity | Use |
|---|---|
| E1 appraisal_cycles | create/manage |
| E2 appraisal_templates | bind (read PUBLISHED) |
| E3 rating_scales | bind (read ACTIVE) |
| E4 appraisal_forms | bulk materialise on open |
| employees, org_units (M01) | resolve chain & eligibility |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/cycles |
| PUT | /api/v1/pam/cycles/{cycleId} |
| POST | /api/v1/pam/cycles/{cycleId}/open |
| GET | /api/v1/pam/cycles |
| POST | /api/v1/pam/templates |
| POST | /api/v1/pam/rating-scales |

**UI Behavior Notes.** Wizard: Basics → Calendar → Eligibility → Template/Scale → Review. Eligibility preview shows live count and unresolved-chain warnings before open. Open is a guarded action with confirmation and a generated-forms summary.

**Edge Cases.** Mid-cycle joiners (run incremental materialise); employees with no RO; circular reporting; template retired after binding (block); duplicate open click (idempotent).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CycleService`, `TemplateService`, `RatingScaleService`, `FormMaterialiser`, `EligibilityResolver`, `ChainResolver` |
| Backend Flow | Validate → persist cycle → on open: resolve eligibility → resolve chains → batch-insert forms in a transaction → enqueue notifications |
| Data Operations | INSERT E1/E2/E3; bulk INSERT E4; SELECT employees/org_units; write audit_log |
| Validation | Date ordering, template PUBLISHED, scale ACTIVE, eligibility schema, fiscal-year bounds |
| Authorization | Sys Admin/HR only; org-scoped; no self in generated chain |
| State Changes & Side Effects | cycle DRAFT→OPEN; forms created in GOALS_PENDING; notifications to appraisees+ROs |
| Failure Handling | Partial materialise rolled back atomically; unresolved chains returned as `CHAIN_UNRESOLVED` report, cycle stays OPEN with flagged forms |
| Dependencies | M01 (chain), platform notifications, workflow engine |
| Test Guidance | Unit: date validation, weight of eligibility filter. Integration: idempotent open, incremental joiners, atomic rollback |

---

### FR-M08-02 — Goal / Objective Setting (KRA/KPI/OKR, Cascading, Weightages)

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As an officer, I want to set weighted KRAs/KPIs aligned to my reporting officer's objectives so that my appraisal is measured against agreed, cascaded goals.

**Description.** Appraisees draft goals (KRA/KPI/OKR/development) with metric, target, weightage and optional cascade parent. ROs review, request changes, and approve. On goal-lock, weightages are validated to sum to 100 and the form advances. Mid-cycle revision is supported with audit trail.

**Acceptance Criteria.**
1. Sibling APPROVED goals must sum to 100% weightage before goal-lock.
2. A goal may cascade from an RO/skip-level goal, recording `parent_goal_id`/`cascaded_from_employee_id`.
3. RO can return a goal with comments (status PROPOSED→DRAFT); appraisee resubmits.
4. Approved goals are immutable except via REVISED, which preserves the prior version in audit.
5. Goal-lock transitions form GOALS_PENDING→GOALS_APPROVED and blocks new goal creation without re-open.

**Business Rules.**
- BR1: Weightage ∈ (0,100]; total = 100 ±0.01.
- BR2: Only RO may APPROVE; appraisee cannot self-approve.
- BR3: Revisions after lock require RO approval and reason; mid-year cycle window must be open.
- BR4: DROPPED goals are excluded from weightage sum and grade roll-up.

**Data Model References.**
| Entity | Use |
|---|---|
| E5 goals | create/approve/revise |
| E4 appraisal_forms | status transition on lock |
| employees | cascade source resolution |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/goals |
| PUT | /api/v1/pam/goals/{goalId} |
| POST | /api/v1/pam/goals/{goalId}/approve |
| POST | /api/v1/pam/goals/{goalId}/return |
| POST | /api/v1/pam/forms/{formId}/goals/lock |

**UI Behavior Notes.** Goal board with weightage meter (running total with red until 100). Cascade picker shows RO/skip-level goals. Inline approve/return with comment. Locked state shows read-only badges.

**Edge Cases.** Weight ≠ 100 at lock (block with delta); cascade parent dropped after child created (warn); concurrent edits (optimistic lock `updated_at`); appraisee edits after lock (forbidden).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `GoalService`, `WeightageValidator`, `CascadeResolver`, `GoalLockService` |
| Backend Flow | CRUD goals → RO approve/return → lock validates sum + all-approved → transition form |
| Data Operations | INSERT/UPDATE E5; UPDATE E4.status; audit_log on every transition |
| Validation | Weightage range/sum, status transition legality, role check, optimistic lock |
| Authorization | Appraisee own goals; RO on reports; both org-scoped |
| State Changes & Side Effects | goal DRAFT↔PROPOSED→APPROVED→REVISED; form GOALS_PENDING→GOALS_APPROVED; notify RO/appraisee |
| Failure Handling | Lock fails with `WEIGHTAGE_IMBALANCE` listing delta; partial approvals retained |
| Dependencies | FR-M08-01 (form exists), M01 chain |
| Test Guidance | Unit: weightage sum, transition matrix. Integration: cascade integrity, lock gating, revision audit chain |

---

### FR-M08-03 — Self-Appraisal Submission

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee
- **User Story:** As an officer, I want to record my achievements, self-ratings and constraints so the appraising officers have my account of the year.

**Description.** Appraisee completes the self-appraisal: achievement narrative, per-goal self-ratings/achievement %, competency self-ratings, constraints, and training needs. Submission locks self-edit and advances the form to RO_ASSESSMENT. RO may RETURN for revision before assessing.

**Acceptance Criteria.**
1. Self-appraisal can be submitted only when form status is SELF_APPRAISAL and goals are APPROVED.
2. Achievements narrative is mandatory; per-goal self-ratings must be within scale bounds.
3. Submission timestamps `submitted_at`, sets status SUBMITTED, advances form to RO_ASSESSMENT.
4. RO can RETURN (status→RETURNED, form→SELF_APPRAISAL) with comments; appraisee resubmits.
5. After RO begins assessment, the self-appraisal becomes read-only to the appraisee.

**Business Rules.**
- BR1: Exactly one self-appraisal per form.
- BR2: Self-ratings are advisory; they do not auto-populate RO grades.
- BR3: Missing self-appraisal at RO due date allows RO to proceed with a recorded "self-appraisal not submitted" flag.

**Data Model References.**
| Entity | Use |
|---|---|
| E7 self_appraisals | create/submit |
| E5 goals | snapshot self ratings |
| E4 appraisal_forms | status transition |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/self-appraisal |
| PUT | /api/v1/pam/forms/{formId}/self-appraisal |
| POST | /api/v1/pam/forms/{formId}/self-appraisal/submit |
| POST | /api/v1/pam/forms/{formId}/self-appraisal/return |

**UI Behavior Notes.** Tabbed form (Summary / Goals / Competencies / Constraints & Needs). Autosave drafts. Submit shows a confirmation summarising goals and self-grades. Read-only after RO start.

**Edge Cases.** Submit before goals approved (forbidden); rating out of bounds (reject); resubmit after return; deadline passed with no submission (RO override path).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SelfAppraisalService`, `ScaleValidator`, `FormTransitionService` |
| Backend Flow | Upsert draft → validate on submit → transition form → notify RO |
| Data Operations | UPSERT E7; UPDATE E5 self_rating; UPDATE E4.status; audit_log |
| Validation | Narrative present, scale bounds, single-per-form, status gate |
| Authorization | Appraisee only on own form; RO return only |
| State Changes & Side Effects | self DRAFT→SUBMITTED/RETURNED; form SELF_APPRAISAL→RO_ASSESSMENT; notify RO |
| Failure Handling | Out-of-bounds → VALIDATION_ERROR field-level; return preserves draft |
| Dependencies | FR-M08-02 (goals approved) |
| Test Guidance | Unit: bounds, single-per-form. Integration: submit/return loop, RO-no-submission override |

---

### FR-M08-04 — Reporting Officer Assessment (APAR Tier 1)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer
- **User Story:** As a reporting officer, I want to assess my subordinate's goals and competencies, certify integrity, write the pen-picture and assign a provisional grade so the APAR can proceed to review.

**Description.** RO records section/goal grades, competency assessed-levels, the statutory **integrity** certification, the **pen-picture** narrative, and a `provisional_grade`. Submission creates a REPORTING `appraisal_assessments` row and advances the form to RVO_REVIEW.

**Acceptance Criteria.**
1. Integrity certification is mandatory; if not BEYOND_DOUBT, `integrity_remark` is required.
2. Pen-picture must meet template `penpicture_min_words` if configured.
3. Provisional grade within scale bounds; section grades roll up consistently per weightage policy.
4. Submission writes REPORTING assessment, sets `appraisal_forms.provisional_grade`, advances to RVO_REVIEW.
5. RO may RETURN the self-appraisal before assessing (links FR-M08-03).

**Business Rules.**
- BR1: RO must be the resolved `reporting_officer_id`; cannot be the appraisee.
- BR2: Adverse provisional grade (< adverse_threshold) requires explicit remark substantiation.
- BR3: Competency gaps with CRITICAL/MODERATE severity flag for FR-M08-12 nomination.
- BR4: RO assessment is immutable after RvO begins.

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create REPORTING |
| E4 appraisal_forms | integrity, pen_picture, provisional_grade, status |
| E9 competency_assessments | assessed levels, gaps |
| E5 goals | ro_rating/achievement |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/reporting |
| PUT | /api/v1/pam/forms/{formId}/assessment/reporting |
| POST | /api/v1/pam/forms/{formId}/assessment/reporting/submit |

**UI Behavior Notes.** Split view: appraisee self-input vs RO input. Integrity selector with conditional remark. Word-count meter on pen-picture. Grade roll-up preview from section/goal scores.

**Edge Cases.** Self-appraisal not submitted (proceed with flag); integrity NOT_CERTIFIED without remark (block); grade roll-up mismatch (recompute server-side authoritative); RO transferred mid-cycle (custody handoff per FR-M08-15).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ROAssessmentService`, `IntegrityValidator`, `GradeRollupEngine`, `CompetencyGapDetector` |
| Backend Flow | Upsert draft → validate integrity/penpicture/grades → compute roll-up → persist assessment + form fields → detect gaps → transition |
| Data Operations | INSERT E8(REPORTING); UPDATE E4; UPSERT E9; UPDATE E5; audit_log |
| Validation | Integrity rule, min-words, scale bounds, roll-up consistency, role identity |
| Authorization | Only resolved RO; org-scoped; self-block |
| State Changes & Side Effects | form RO_ASSESSMENT→RVO_REVIEW; gap flags raised; notify RvO |
| Failure Handling | Missing remark → VALIDATION_ERROR; roll-up authoritative server-side |
| Dependencies | FR-M08-02/03, FR-M08-07 (scale), FR-M08-12 (gaps) |
| Test Guidance | Unit: integrity conditional, roll-up math. Integration: full RO submit, gap detection, immutability after RvO |

---

### FR-M08-05 — Reviewing Officer Review (APAR Tier 2)

- **Module:** M08-PAM
- **Primary Role(s):** Reviewing Officer
- **User Story:** As a reviewing officer, I want to concur with or vary the reporting officer's assessment with recorded reasons so the APAR reflects a second, independent scrutiny.

**Description.** RvO views the RO assessment, either concurs (carries grade forward) or varies (sets `reviewed_grade` with mandatory `variance_reason`), and may add review remarks. Completing advances the form to AA_ACCEPTANCE. RvO may RETURN to RO with comments.

**Acceptance Criteria.**
1. RvO must record `concurs_with_lower_tier`; if false, `variance_reason` and `reviewed_grade` are required.
2. `reviewed_grade` within scale bounds.
3. Completion writes REVIEWING assessment and advances to AA_ACCEPTANCE.
4. RvO may RETURN to RO (form→RO_ASSESSMENT) with comments.
5. RvO cannot be the RO or the appraisee.

**Business Rules.**
- BR1: A downward variance crossing the adverse threshold must include substantiating remarks.
- BR2: RvO review is immutable after AA begins.
- BR3: If RO and RvO are the same person by org structure, the cycle config must designate an alternate RvO (escalation, not silent collapse).

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create REVIEWING |
| E4 appraisal_forms | reviewed_grade, status |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/reviewing |
| PUT | /api/v1/pam/forms/{formId}/assessment/reviewing |
| POST | /api/v1/pam/forms/{formId}/assessment/reviewing/submit |
| POST | /api/v1/pam/forms/{formId}/assessment/reviewing/return |

**UI Behavior Notes.** RO assessment shown read-only beside RvO input. Concur toggle reveals variance fields. Grade-delta indicator vs RO. Return action with comment.

**Edge Cases.** RvO == RO (block, require alternate); variance without reason (block); RvO acts after AA started (forbidden); RvO declines to vary an adverse RO grade (still records concurrence with note).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RvOReviewService`, `VarianceValidator`, `FormTransitionService` |
| Backend Flow | Load RO assessment → validate concur/variance → persist REVIEWING → set reviewed_grade → transition |
| Data Operations | INSERT E8(REVIEWING); UPDATE E4; audit_log |
| Validation | Variance reason conditional, scale bounds, role identity, tier ordering |
| Authorization | Only resolved RvO; not RO/appraisee |
| State Changes & Side Effects | form RVO_REVIEW→AA_ACCEPTANCE or →RO_ASSESSMENT (return); notify AA/RO |
| Failure Handling | Same-person conflict → FORBIDDEN with `TIER_CONFLICT`; missing reason → VALIDATION_ERROR |
| Dependencies | FR-M08-04 |
| Test Guidance | Unit: variance conditional, tier order. Integration: concur vs vary paths, return-to-RO, conflict block |

---

### FR-M08-06 — Accepting Authority Acceptance (APAR Tier 3)

- **Module:** M08-PAM
- **Primary Role(s):** Accepting Authority
- **User Story:** As the accepting authority, I want to settle the final grade and certify the APAR so it can be calibrated, disclosed and posted to the service register.

**Description.** AA reviews RO and RvO assessments, settles `final_grade` (must record reason if differing from `reviewed_grade`), and certifies. Certification derives `final_grade_label`, `is_adverse`, `below_benchmark`, writes an ACCEPTING assessment (decision CERTIFIED), and advances to CALIBRATION (if enabled) else DISCLOSURE.

**Acceptance Criteria.**
1. AA must settle `final_grade` within scale bounds; deviation from `reviewed_grade` requires reason.
2. Certification derives label/adverse/benchmark flags server-side (never client).
3. Form advances to CALIBRATION if `cycle.calibration_enabled`, else DISCLOSURE (if `disclosure_required`) else FINALISED.
4. AA cannot be RO, RvO or appraisee.
5. Once certified, grade fields are immutable except via calibration or representation.

**Business Rules.**
- BR1: Adverse final grade mandates the disclosure path and substantiating remarks present across tiers.
- BR2: AA certification is a guarded, logged action requiring re-authentication (step-up).
- BR3: AA may RETURN to RvO once with reasons before certifying.

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create ACCEPTING (CERTIFIED) |
| E4 appraisal_forms | final_grade, flags, status |
| E3 rating_scales | derive label/flags |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/accepting |
| PUT | /api/v1/pam/forms/{formId}/assessment/accepting |
| POST | /api/v1/pam/forms/{formId}/assessment/accepting/certify |
| POST | /api/v1/pam/forms/{formId}/assessment/accepting/return |

**UI Behavior Notes.** Three-column compare (RO/RvO/AA). Final-grade slider bounded by scale; deviation reason appears on change. Certify requires MFA step-up confirmation. Post-certify badges (adverse/benchmark).

**Edge Cases.** AA deviates downward to adverse (force remark + disclosure); calibration disabled (skip to disclosure); disclosure disabled (rare; direct finalise); step-up auth fails (abort, no state change).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AAAcceptanceService`, `GradeDerivationService`, `StepUpAuthGuard`, `FormTransitionService` |
| Backend Flow | Load tiers → validate final grade/deviation → step-up auth → derive flags → persist ACCEPTING + form → route next state |
| Data Operations | INSERT E8(ACCEPTING); UPDATE E4 (final_grade, label, flags, status); audit_log |
| Validation | Scale bounds, deviation reason, role identity, step-up token |
| Authorization | Only resolved AA; not RO/RvO/appraisee; MFA step-up |
| State Changes & Side Effects | form AA_ACCEPTANCE→CALIBRATION/DISCLOSURE/FINALISED; notify HR/custodian |
| Failure Handling | Step-up fail → AUTH_REQUIRED, no mutation; deviation w/o reason → VALIDATION_ERROR |
| Dependencies | FR-M08-05, FR-M08-07, FR-M08-09, FR-M08-08 |
| Test Guidance | Unit: derivation, routing matrix. Integration: certify with/without calibration, adverse routing, step-up abort |

---

### FR-M08-07 — Rating Scales & Numeric Grade Computation

- **Module:** M08-PAM
- **Primary Role(s):** System Administrator (config), all assessors (consume)
- **User Story:** As an administrator, I want configurable rating scales with benchmark/adverse thresholds and a deterministic grade roll-up so every grade is computed consistently and defensibly.

**Description.** Defines `rating_scales` (numeric range, ordered grade bands with descriptors, benchmark and adverse thresholds, decimal precision) and the deterministic roll-up that converts weighted goal/section/competency scores into an overall numeric grade and its descriptor label.

**Acceptance Criteria.**
1. Grade bands are contiguous, non-overlapping, and cover `[min,max]`.
2. Roll-up = Σ(section_score × weightage)/100, rounded to scale `decimal_places`.
3. `label` is resolved from bands; `benchmark_grade`/`adverse_threshold` produce `below_benchmark`/`is_adverse`.
4. Scales in use by an active cycle are RETIRE-locked, not edited.
5. The same roll-up function is the single source used by RO/RvO/AA stages.

**Business Rules.**
- BR1: `min < max`; `adverse_threshold ≤ benchmark_grade ≤ max`.
- BR2: Changing a scale requires a new ACTIVE scale; historical forms keep their original scale (snapshot via cycle binding).
- BR3: Rounding is half-up at scale precision; documented and consistent.

**Data Model References.**
| Entity | Use |
|---|---|
| E3 rating_scales | define/retire |
| E4 appraisal_forms | grade fields, labels, flags |
| E8 appraisal_assessments | section/overall grades |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/rating-scales |
| PUT | /api/v1/pam/rating-scales/{id} |
| GET | /api/v1/pam/rating-scales |
| POST | /api/v1/pam/forms/{formId}/grade/preview |

**UI Behavior Notes.** Scale builder with band editor validating contiguity. Grade preview component reused across all assessment stages showing computed value + band label live.

**Edge Cases.** Overlapping bands (block); grade exactly on band boundary (inclusive-lower rule); zero-weight goals (excluded); precision mismatch across stages (single function enforces).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RatingScaleService`, `GradeRollupEngine` (pure function), `BandResolver` |
| Backend Flow | CRUD scales with contiguity validation; roll-up engine consumed by FR-04/05/06 |
| Data Operations | INSERT/UPDATE E3; read in grade computations; audit_log |
| Validation | Band contiguity/coverage, threshold ordering, precision |
| Authorization | Sys Admin config; assessors read/preview only |
| State Changes & Side Effects | scale ACTIVE↔RETIRED; no direct form mutation (preview only) |
| Failure Handling | Invalid bands → VALIDATION_ERROR with band index; retire-locked edit → CONFLICT |
| Dependencies | none upstream; consumed by FR-04/05/06/09/14/16 |
| Test Guidance | Unit: contiguity, roll-up math, boundary rounding. Property test: monotonic label mapping |

---

### FR-M08-08 — Disclosure of APAR & Representation / Appeal Against Adverse Remarks

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Appraisee, Accepting/Competent Authority
- **User Story:** As an officer, I want the full APAR disclosed to me and the right to represent against adverse or below-benchmark remarks so the process is fair and statutorily compliant.

**Description.** After certification (and calibration), HR discloses the full APAR to the appraisee, who acknowledges. The appraisee may file a `representation` within the statutory window against contested remarks/grades. A competent authority adjudicates (UPHELD / PARTIALLY_UPHELD / REJECTED / EXPUNGED / MODIFIED). Expunction/modification updates the final grade via a controlled, audited path and re-discloses.

**Acceptance Criteria.**
1. Disclosure transitions form to DISCLOSED, sets `disclosed_at`, appends DISCLOSED to disclosure log, notifies appraisee.
2. Appraisee acknowledgement sets `acknowledged_at`; representation is permitted only after disclosure.
3. Representation must be filed within `sla_due_at`; late filings are flagged and require condonation.
4. Adjudication records decision, authority, reason; MODIFIED sets `revised_grade`; EXPUNGED nullifies adverse remark and recomputes flags.
5. Every disclosure/view/download/denied access is recorded in `apar_disclosure_log`.

**Business Rules.**
- BR1: Adverse or below-benchmark APARs must be disclosed (mandatory); favourable APARs disclosed per cycle config.
- BR2: A representation may contest only items present in the disclosed APAR.
- BR3: The adjudicating authority must be senior to the AA and not in the appraisee's reporting chain for that cycle.
- BR4: Post-adjudication the form returns to FINALISED with a new grade snapshot; the prior grade is preserved.

**Data Model References.**
| Entity | Use |
|---|---|
| E13 representations | file/adjudicate |
| E4 appraisal_forms | disclosed_at, acknowledged_at, grade flags |
| E18 apar_disclosure_log | append events |
| documents (M13) | acknowledgement, supporting docs |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/disclose |
| POST | /api/v1/pam/forms/{formId}/acknowledge |
| POST | /api/v1/pam/forms/{formId}/representations |
| POST | /api/v1/pam/representations/{repId}/decide |
| GET | /api/v1/pam/forms/{formId}/disclosure-log |

**UI Behavior Notes.** Disclosure viewer with watermark + acknowledge button. Representation form with item-pickers tied to disclosed remarks and document upload. Adjudication console for competent authority. SLA countdown badge.

**Edge Cases.** Late representation (condonation flow); EXPUNGED grade crossing back above benchmark (recompute eligibility feed FR-M08-14); multiple representations (sequence; second blocked until first decided); appraisee declines to acknowledge (deemed-disclosed after configured period, logged).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `DisclosureService`, `RepresentationService`, `AdjudicationService`, `DisclosureLogger`, `GradeDerivationService` |
| Backend Flow | Disclose → log+notify → acknowledge → file rep (SLA check) → adjudicate → recompute grade/flags → re-disclose if changed |
| Data Operations | INSERT E13; UPDATE E4; INSERT E18 (append-only); link documents; write SR event on expunction (FR-14); audit_log |
| Validation | Post-disclosure gate, SLA window, contested-item membership, authority seniority |
| Authorization | HR disclose; appraisee file own; competent authority adjudicate (not in chain) |
| State Changes & Side Effects | form DISCLOSED→REPRESENTATION→FINALISED; flags recomputed; notifications |
| Failure Handling | Out-of-window → CONFLICT `REPRESENTATION_WINDOW_CLOSED` (condonation override); denied access logged ACCESS_DENIED |
| Dependencies | FR-M08-06/07, M13, FR-M08-14 (SR) |
| Test Guidance | Unit: SLA gate, item membership. Integration: full disclose→represent→expunge→recompute→re-disclose, deemed-disclosure |

---

### FR-M08-09 — Calibration / Normalisation / Bell-Curve Moderation

- **Module:** M08-PAM
- **Primary Role(s):** Calibration Committee Member, HR/APAR Cell
- **User Story:** As a calibration committee, we want to moderate grades across a population against a target distribution so ratings are fair and comparable across reporting officers.

**Description.** HR convenes a `calibration_session` over an org-scoped population using a method (bell-curve, normalisation, forced distribution, or committee review) with an optional target distribution. The committee proposes `calibration_adjustments` with mandatory rationale; adjustments are voted and applied. Applying preserves `pre_calibration_grade`, sets `calibrated=true`, and recomputes flags.

**Acceptance Criteria.**
1. Only certified forms (post-AA) within scope enter a session.
2. Every adjustment requires a non-empty `rationale`; applied adjustment preserves the pre-calibration grade.
3. Distribution view shows current vs target before/after; skew metrics computed.
4. Applying an adjustment updates `final_grade`, recomputes label/adverse/benchmark, and logs the change.
5. A committee member who is RO/RvO/AA/appraisee for a given form cannot vote on that form.

**Business Rules.**
- BR1: Calibration runs before disclosure; an already-disclosed form cannot be silently re-graded (must go via representation).
- BR2: Adjustment magnitude beyond a configured threshold requires committee quorum approval.
- BR3: Downward adjustment crossing the adverse threshold mandates substantiating rationale and forces disclosure path.

**Data Model References.**
| Entity | Use |
|---|---|
| E14 calibration_sessions | convene/run |
| E15 calibration_adjustments | propose/vote/apply |
| E4 appraisal_forms | final_grade, pre_calibration_grade, calibrated, flags |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/calibration/sessions |
| GET | /api/v1/pam/calibration/sessions/{id}/distribution |
| POST | /api/v1/pam/calibration/sessions/{id}/adjustments |
| POST | /api/v1/pam/calibration/adjustments/{id}/vote |
| POST | /api/v1/pam/calibration/adjustments/{id}/apply |

**UI Behavior Notes.** Distribution histogram (current vs target) with draggable grade chips; each move opens a rationale modal. Voting panel; quorum indicator. Audit trail sidebar.

**Edge Cases.** Adjusting an adverse/below-benchmark borderline (recompute flags); member conflict on a form (exclude vote); session cancelled after partial applies (applied stay, preserve provenance); empty population (block).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CalibrationSessionService`, `DistributionEngine`, `AdjustmentService`, `QuorumValidator`, `GradeDerivationService` |
| Backend Flow | Convene → load certified pop → compute distribution → propose/vote/apply adjustments → recompute flags |
| Data Operations | INSERT E14/E15; UPDATE E4 (grade, pre_cal, calibrated, flags); audit_log |
| Validation | Rationale present, scope/status gate, conflict exclusion, quorum, magnitude threshold |
| Authorization | Committee members (no self/chain form); HR convene |
| State Changes & Side Effects | form ...→CALIBRATION→ (back to certified) ; final_grade changes logged |
| Failure Handling | Missing rationale → VALIDATION_ERROR; conflict vote → FORBIDDEN; quorum unmet → CONFLICT |
| Dependencies | FR-M08-06/07; precedes FR-M08-08 |
| Test Guidance | Unit: distribution math, quorum. Integration: apply→recompute flags, provenance preservation, conflict exclusion |

---

### FR-M08-10 — Continuous Feedback & Check-Ins

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As a manager and employee, we want lightweight, year-round feedback and goal check-ins so the appraisal is grounded in continuous evidence rather than recency bias.

**Description.** Authenticated users record `continuous_feedback` (praise/constructive/coaching) on a subject with controlled visibility, optionally linked to a goal. Appraisees and ROs log `goal_checkins` with progress %. These artefacts surface as evidence during RO assessment.

**Acceptance Criteria.**
1. Feedback respects `visibility`; PRIVATE_TO_SUBJECT is hidden from the manager and vice-versa per setting.
2. Check-ins update goal progress and timeline; do not change the goal's final rating automatically.
3. Feedback and check-ins for the cycle are surfaced (read-only) in the RO assessment view.
4. Subject can acknowledge feedback.
5. Feedback is immutable after acknowledgement except by author within an edit window.

**Business Rules.**
- BR1: Feedback authors cannot be anonymous in continuous feedback (named accountability); 360 anonymity is separate (FR-M08-11).
- BR2: A manager cannot delete constructive feedback to manipulate the record (soft-delete only, audited).
- BR3: Check-in progress is advisory evidence, not an authoritative grade.

**Data Model References.**
| Entity | Use |
|---|---|
| E10 continuous_feedback | create/acknowledge |
| E6 goal_checkins | create |
| E5 goals | progress linkage |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/feedback |
| GET | /api/v1/pam/feedback?subjectId= |
| POST | /api/v1/pam/feedback/{id}/acknowledge |
| POST | /api/v1/pam/goals/{goalId}/checkins |

**UI Behavior Notes.** Feedback feed on employee profile; visibility selector with clear labels. Goal timeline with check-in markers. RO assessment shows an evidence panel aggregating both.

**Edge Cases.** Visibility downgrade after creation (audited); feedback on inactive employee (block); check-in progress > 100 (clamp/validate); cross-org feedback (org-scope check).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FeedbackService`, `CheckinService`, `VisibilityResolver`, `EvidenceAggregator` |
| Backend Flow | Create feedback/check-in → enforce visibility → aggregate for assessment view |
| Data Operations | INSERT E10/E6; UPDATE E5 progress; audit_log |
| Validation | Visibility enum, progress range, org scope, edit-window |
| Authorization | Authenticated org-scoped; subject acknowledge; author edit window |
| State Changes & Side Effects | feedback acknowledged; goal progress updated; no grade change |
| Failure Handling | Progress OOB → VALIDATION_ERROR; visibility breach → FORBIDDEN at projection |
| Dependencies | FR-M08-02 (goals), FR-M08-04 (evidence surfacing) |
| Test Guidance | Unit: visibility projection, clamp. Integration: evidence aggregation, soft-delete audit |

---

### FR-M08-11 — 360-Degree Feedback

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Reporting Officer, Raters
- **User Story:** As an organisation, we want multi-rater (peer/subordinate/customer) feedback so appraisals capture a rounded view of behaviour and impact.

**Description.** For eligible forms, HR/RO nominate raters across relationships. Raters receive `feedback_360_requests`, submit `feedback_360_responses` (per-competency/behaviour scores + qualitative). Responses are aggregated (respecting anonymity and minimum-N suppression) and surfaced as input to RO assessment and competency assessment.

**Acceptance Criteria.**
1. Raters are nominated with a relationship type; the appraisee cannot rate themselves.
2. Anonymous responses are aggregated only when ≥ minimum-N raters of that relationship responded (suppression below threshold).
3. A rater can submit exactly one response per request; declines/expiries are tracked.
4. Aggregated 360 view is read-only evidence in RO assessment; individual anonymous responses are never attributable in the UI.
5. 360 windows align to cycle dates.

**Business Rules.**
- BR1: Minimum-N (default 3) protects rater anonymity; below-N relationship buckets show "insufficient responses".
- BR2: External raters use a scoped, time-boxed access token (no full system access).
- BR3: 360 results inform but do not directly set the APAR grade.

**Data Model References.**
| Entity | Use |
|---|---|
| E11 feedback_360_requests | nominate/track |
| E12 feedback_360_responses | submit/aggregate |
| E9 competency_assessments | optional input |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/360/requests |
| GET | /api/v1/pam/360/requests/assigned |
| POST | /api/v1/pam/360/requests/{id}/respond |
| GET | /api/v1/pam/forms/{formId}/360/summary |

**UI Behavior Notes.** Nomination grid by relationship. Rater questionnaire (mobile-friendly). Summary radar/bar charts with anonymity-suppressed buckets clearly labelled.

**Edge Cases.** Fewer than N respond (suppress); rater leaves org mid-window (expire request); duplicate submission (block); external token expiry (deny with clear message).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `Feedback360Service`, `RaterTokenService`, `AggregationEngine`, `AnonymitySuppressor` |
| Backend Flow | Nominate → dispatch invites → collect responses → aggregate with min-N suppression → expose summary |
| Data Operations | INSERT E11/E12; read for aggregation; audit_log |
| Validation | Self-rating block, one-per-request, min-N, window dates, token validity |
| Authorization | HR/RO nominate; assigned rater respond; appraisee sees aggregate only |
| State Changes & Side Effects | request INVITED→SUBMITTED/DECLINED/EXPIRED; summary computed |
| Failure Handling | Below-N → suppressed bucket; expired token → AUTH_REQUIRED |
| Dependencies | FR-M08-01 (forms), FR-M08-04 (surfacing) |
| Test Guidance | Unit: min-N suppression, one-per-request. Integration: external token flow, aggregate anonymity |

---

### FR-M08-12 — Competency Assessment & Skill-Gap → Training Linkage (M07)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer, Appraisee, HR
- **User Story:** As a reporting officer, I want to assess competencies against role-required levels and turn gaps into training nominations so development is closed-loop with the training module.

**Description.** Using the M07 competency catalog and role-required levels, the RO assesses each competency's `assessed_level`; the system derives `gap` and `gap_severity`. MODERATE/CRITICAL gaps generate training nominations to M07 (linking `training_nomination_id`), feeding M07's calendar/nomination flow.

**Acceptance Criteria.**
1. Competencies and required levels are read from M07 (snapshotted onto the form for historical fidelity).
2. `gap = required_level − assessed_level`; severity derived per configurable bands.
3. MODERATE/CRITICAL gaps offer a one-click "nominate to training" creating an M07 nomination and storing its ID.
4. Self competency ratings (from self-appraisal) display alongside RO assessed levels.
5. Closed nominations reflect status back on the competency assessment view.

**Business Rules.**
- BR1: A nomination is created only with an active M07 training mapped to the competency; otherwise a development-need is logged.
- BR2: Competency assessment is part of the RO stage and locks with it.
- BR3: Required levels come from the role/designation profile in M07; ad-hoc overrides are recorded with reason.

**Data Model References.**
| Entity | Use |
|---|---|
| E9 competency_assessments | assess/derive gap |
| M07 competency catalog | read required levels |
| M07 nominations | write nomination (FK by id) |
| E7 self_appraisals | self levels |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/competencies |
| PUT | /api/v1/pam/forms/{formId}/competencies |
| POST | /api/v1/pam/forms/{formId}/competencies/{id}/nominate |

**UI Behavior Notes.** Competency grid: required vs self vs assessed, gap badge (colour by severity), nominate button on gaps. Nomination status chip after creation.

**Edge Cases.** No training mapped to a critical gap (log development-need, no nomination); M07 unavailable (queue nomination, retry); negative gap (over-competent → no nomination); catalog changed after snapshot (use snapshot).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CompetencyAssessmentService`, `GapEngine`, `M07NominationClient`, `SnapshotService` |
| Backend Flow | Load catalog snapshot → RO assesses → derive gaps → on nominate call M07 → store nomination id |
| Data Operations | UPSERT E9; read M07 catalog; POST M07 nomination; audit_log |
| Validation | Level bounds, severity bands, training-mapping existence |
| Authorization | RO assess; appraisee read own; HR read org |
| State Changes & Side Effects | gaps flagged; M07 nomination created (side effect); status reflected |
| Failure Handling | M07 down → UPSTREAM_UNAVAILABLE, queue+retry; unmapped gap → development-need logged |
| Dependencies | M07, FR-M08-03/04 |
| Test Guidance | Unit: gap derivation, severity bands. Integration: nomination round-trip, M07-down queueing, snapshot fidelity |

---

### FR-M08-13 — Performance Improvement Plan (PIP)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer, Reviewing Officer, HR
- **User Story:** As a reporting officer, I want to place an underperforming officer on a structured improvement plan with milestones and a fair outcome so improvement is supported and documented.

**Description.** For below-benchmark/adverse outcomes (or ad hoc), RO initiates a `performance_improvement_plan` with reason, period, success criteria and `pip_milestones`. Progress is tracked; the plan concludes with an outcome (successful/extended/unsuccessful/abandoned). PIP records are confidential and auditable, and an unsuccessful PIP can be referenced by M06/M09 per policy.

**Acceptance Criteria.**
1. A PIP requires reason, start/target dates, success criteria and ≥1 milestone.
2. Milestones track status (pending/on-track/at-risk/met/missed) with progress notes.
3. RvO concurrence is required to activate a PIP (segregation of duties).
4. Closing a PIP requires an outcome and summary; outcome is auditable.
5. An active PIP is visible to appraisee, RO, RvO and HR only.

**Business Rules.**
- BR1: A PIP linked to an APAR references the originating `form_id`.
- BR2: An EXTENDED outcome creates a successor PIP linked to the prior.
- BR3: PIP existence does not by itself change an APAR grade; it is supportive documentation.

**Data Model References.**
| Entity | Use |
|---|---|
| E16 performance_improvement_plans | create/close |
| E17 pip_milestones | track |
| E4 appraisal_forms | optional origin link |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/pips |
| POST | /api/v1/pam/pips/{id}/activate |
| PUT | /api/v1/pam/pips/{id}/milestones/{mid} |
| POST | /api/v1/pam/pips/{id}/close |
| GET | /api/v1/pam/pips?employeeId= |

**UI Behavior Notes.** PIP wizard (reason → criteria → milestones → review). Milestone board with status chips. Activation gated on RvO concurrence. Outcome modal on close.

**Edge Cases.** Activation without RvO concurrence (block); employee transferred during PIP (custody handoff to new RO); overlapping active PIPs (block second); abandoned due to long leave (record reason).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `PIPService`, `MilestoneService`, `ConcurrenceGuard` |
| Backend Flow | Create draft → RvO concur → activate → track milestones → close with outcome |
| Data Operations | INSERT E16/E17; UPDATE statuses; audit_log |
| Validation | Required fields, ≥1 milestone, concurrence present, single-active-per-employee |
| Authorization | RO create; RvO concur; HR oversight; appraisee read own |
| State Changes & Side Effects | pip DRAFT→ACTIVE→UNDER_REVIEW→CLOSED; successor link on EXTENDED |
| Failure Handling | Activate w/o concurrence → FORBIDDEN; overlap → CONFLICT |
| Dependencies | FR-M08-06 (outcome), FR-M08-15 (custody) |
| Test Guidance | Unit: required-field/concurrence gates. Integration: extend→successor link, transfer handoff |

---

### FR-M08-14 — Posting Final Ratings to Service Register (M12) & Promotion Eligibility Feed (M06)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, APAR Custodian (trigger); System (post)
- **User Story:** As HR, I want certified final grades posted to the statutory Service Register and promotion eligibility fed to the promotion module so the appraisal becomes part of the employee's permanent record and informs career progression.

**Description.** On finalisation (post-disclosure, representation window closed/decided), the system posts an append-only `service_register_events` entry to M12 (final grade, label, adverse flag, cycle) and writes a promotion-eligibility record to M06 (benchmark-met flag, grade, cycle). Posting is idempotent, transactional with outbox semantics, and immutable once posted.

**Acceptance Criteria.**
1. A form posts only when status is FINALISED and (representation closed or window expired).
2. The SR event is append-only and idempotent (one event per `(form_id)`); re-posts are no-ops.
3. The M06 eligibility feed carries `below_benchmark`/`final_grade`/`cycle_id` and is updated if a representation later modifies the grade (corrective event, never silent overwrite).
4. Posting sets `appraisal_forms.posted_to_sr=true` and logs to disclosure log.
5. If M12/M06 are unavailable, posting is queued via outbox and retried; no data loss.

**Business Rules.**
- BR1: Posting is the only sanctioned write of appraisal outcome to M12 from M08.
- BR2: A grade modified by representation post-posting creates a corrective SR event referencing the original (statutory traceability), not an edit.
- BR3: Promotion decisioning remains with M06; M08 only feeds eligibility evidence.

**Data Model References.**
| Entity | Use |
|---|---|
| E4 appraisal_forms | finalise + posted flag |
| service_register_events (M12) | append final grade/adverse |
| M06 eligibility feed | write benchmark/grade |
| E18 apar_disclosure_log | log posting |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/finalise |
| POST | /api/v1/pam/forms/{formId}/post-to-sr |
| GET | /api/v1/pam/forms/{formId}/posting-status |

**UI Behavior Notes.** Finalise action with checklist (disclosed, representation resolved). Posting status panel showing SR event id and M06 feed status; retry indicator if queued.

**Edge Cases.** Representation decided after posting (corrective event); M12 down (outbox retry); duplicate post (idempotent no-op); grade unchanged after representation (no corrective event).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FinalisationService`, `SRPostingService` (outbox), `M06EligibilityClient`, `IdempotencyGuard` |
| Backend Flow | Finalise → write outbox record → post SR event + M06 feed in transaction → mark posted → on rep-change emit corrective |
| Data Operations | UPDATE E4; INSERT service_register_events (append); POST M06; INSERT E18; audit_log; outbox table |
| Validation | Status gate, representation resolution, idempotency key |
| Authorization | HR/Custodian trigger; system posts; no edits |
| State Changes & Side Effects | form FINALISED→POSTED; SR + M06 records created |
| Failure Handling | M12/M06 down → UPSTREAM_UNAVAILABLE; outbox retry with backoff; never partial-commit |
| Dependencies | FR-M08-08, M12, M06 |
| Test Guidance | Unit: idempotency, status gate. Integration: outbox retry, corrective event on rep-modify, no-op re-post |

---

### FR-M08-15 — Custody, Confidentiality & Access Control of APAR

- **Module:** M08-PAM
- **Primary Role(s):** APAR Custodian, HR/APAR Cell, Auditor
- **User Story:** As the APAR custodian, I want every access to confidential APARs controlled and logged, with custody transferable on officer movement, so confidentiality and statutory custody obligations are met.

**Description.** Enforces field-level, tier-aware authorization for APAR content; logs all access events (view/download/denied) to `apar_disclosure_log`; supports custody transfer when officers move between offices (M05) and retention/disposal per statutory schedule. Generated APAR PDFs are watermarked and stored encrypted in M13.

**Acceptance Criteria.**
1. Reading any APAR content passes server-side tier-aware authorization; unauthorised reads return FORBIDDEN and append ACCESS_DENIED.
2. Every successful view/download appends VIEWED/DOWNLOADED with actor, role, IP, timestamp.
3. Custody transfer (on transfer/posting) reassigns custodian and logs CUSTODY_TRANSFER without altering content.
4. APAR PDFs are watermarked (recipient + timestamp) and encrypted at rest in M13.
5. Retention disposal is a controlled, audited action gated by statutory schedule and approval.

**Business Rules.**
- BR1: Confidentiality class CONFIDENTIAL by default; downgrade requires authority + reason.
- BR2: Auditor has read + log access but cannot mutate.
- BR3: Disclosure log is append-only and tamper-evident; no deletes.
- BR4: Custody follows the officer's service record; orphaned custody is escalated, never dropped.

**Data Model References.**
| Entity | Use |
|---|---|
| E18 apar_disclosure_log | append all access/custody events |
| E4 appraisal_forms | confidentiality_class, custodian linkage |
| documents (M13) | encrypted PDF storage |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId} (tier-projected) |
| GET | /api/v1/pam/forms/{formId}/pdf |
| POST | /api/v1/pam/forms/{formId}/custody-transfer |
| GET | /api/v1/pam/forms/{formId}/access-log |
| POST | /api/v1/pam/forms/{formId}/dispose |

**UI Behavior Notes.** Content rendered through a permission-aware projection (fields the caller may not see are absent, not greyed). PDF viewer with watermark. Access-log table for custodian/auditor. Custody-transfer dialog.

**Edge Cases.** Multi-role caller (lowest-privilege projection wins); transfer to office with no custodian (escalate); disposal before retention end (block); concurrent downloads (each logged).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `TierProjectionService`, `AccessLogger`, `CustodyService`, `PDFRenderService`, `RetentionService` |
| Backend Flow | Every read passes projection guard → log event → return projected payload; custody/disposal as guarded actions |
| Data Operations | INSERT E18 (append-only); UPDATE E4 custodian/class; M13 store; audit_log |
| Validation | Role/tier matrix, retention schedule, downgrade authority |
| Authorization | Tier-aware field-level; custodian/auditor scoped; no mutation by auditor |
| State Changes & Side Effects | custody reassignment; access events logged; disposal sets archived/disposed |
| Failure Handling | Unauthorised → FORBIDDEN + ACCESS_DENIED log; orphan custody → escalation notification |
| Dependencies | M05 (transfer triggers), M13, all read endpoints |
| Test Guidance | Unit: projection matrix, append-only enforcement. Integration: denied-read logging, custody handoff, watermark/encryption |

---

### FR-M08-16 — Performance Analytics & Rating Distribution

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Dept Head/AA, Auditor (read), feeds M14
- **User Story:** As HR leadership, I want analytics on rating distribution, skew, completion and skill gaps so I can detect bias, monitor progress and inform workforce planning.

**Description.** Provides aggregated, role-scoped analytics: rating distribution vs target (pre/post calibration), grading skew by RO/org unit, cycle completion funnel, adverse/representation rates, competency-gap heatmaps, and 360 participation. Exposes a read API consumed by M14. All analytics are computed on de-identified aggregates respecting confidentiality.

**Acceptance Criteria.**
1. Distribution charts show pre- vs post-calibration and current vs target.
2. Skew detection flags ROs/units whose distribution deviates beyond a configurable threshold.
3. Completion funnel reports counts per form status with overdue highlighting.
4. Aggregates honour minimum-N suppression to protect confidentiality; no drill-down to individual APAR content beyond the caller's authorization.
5. Analytics endpoints are paginated/bounded and cached with freshness ≤ 15 min.

**Business Rules.**
- BR1: Org scoping restricts each caller's analytics to their authorised population.
- BR2: Individual-level data is exposed only to those already authorised to view that APAR.
- BR3: M14 consumes only the aggregated, suppressed facts.

**Data Model References.**
| Entity | Use |
|---|---|
| E4 appraisal_forms | grades, flags, status |
| E15 calibration_adjustments | pre/post comparison |
| E9 competency_assessments | gap heatmaps |
| E11/E12 360 | participation |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/analytics/distribution |
| GET | /api/v1/pam/analytics/skew |
| GET | /api/v1/pam/analytics/completion |
| GET | /api/v1/pam/analytics/competency-gaps |

**UI Behavior Notes.** Dashboard: distribution histogram, skew table with flags, completion funnel, gap heatmap. Filters by cycle/org/cadre. Export respects authorization.

**Edge Cases.** Small populations (suppress); mid-cycle (partial data labelled provisional); calibration not run (post = pre); unauthorised drill-down (denied).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AnalyticsService`, `DistributionEngine` (reused), `SkewDetector`, `SuppressionGuard`, `CacheLayer` |
| Backend Flow | Query scoped aggregates → suppress < N → compute skew/funnel → cache → serve |
| Data Operations | SELECT aggregate over E4/E9/E15/E11-12; read-only; no writes |
| Validation | Org scope, min-N suppression, threshold config |
| Authorization | Role/org-scoped; aggregate-only for non-authorised individual data |
| State Changes & Side Effects | none (read-only); cache populate |
| Failure Handling | Cache miss → recompute; oversized query → paginate/limit |
| Dependencies | FR-M08-06/07/09/12/11; feeds M14 |
| Test Guidance | Unit: suppression, skew math. Integration: scoped aggregation, cache freshness, M14 contract |

---

## Section 7 — UI Requirements

### 7.1 Key screens

| Screen | Primary users | Purpose | Key states |
|---|---|---|---|
| Cycle Admin Console | HR, Sys Admin | Configure/open cycles, templates, scales | empty, draft, validating, open, error |
| My Appraisal (Appraisee) | Appraisee | Goals, self-appraisal, disclosure, representation | empty, draft, submitted, returned, disclosed, locked |
| Goal Board | Appraisee, RO | Set/approve weighted cascaded goals | weightage-incomplete, balanced, locked |
| RO/RvO/AA Assessment Workbench | RO, RvO, AA | Tiered assessment, compare, certify | pending, in-progress, returned, certified |
| Calibration Studio | Committee, HR | Distribution moderation | planned, in-session, applied, completed |
| Disclosure & Representation Centre | HR, Appraisee, Authority | Disclose, acknowledge, appeal, adjudicate | disclosed, ack, filed, decided, SLA-breach |
| Continuous Feedback / Check-ins | All | Year-round feedback & progress | empty, feed, acknowledged |
| 360 Feedback | HR, raters | Nominate, respond, summary | invited, in-progress, suppressed, summary |
| Competency & Gaps | RO, Appraisee | Assess competencies, nominate training | gap-flagged, nominated, no-mapping |
| PIP Workspace | RO, RvO, HR | Create/track/close PIPs | draft, active, at-risk, closed |
| Custody & Access Log | Custodian, Auditor | Access ledger, custody transfer | normal, denied-events, transfer |
| Performance Analytics | HR, leadership | Distribution/skew/completion/gaps | provisional, suppressed, full |

### 7.2 Cross-cutting UI rules

- Mobile-first, responsive; collapsible sidebar with menu icons and hamburger toggle.
- Every screen implements empty, loading, error, success, permission-denied, and (where relevant) offline states — no skeleton-only screens; real fields, data, API calls and states.
- WCAG 2.1 AA: keyboard navigation, visible focus, AA contrast, ARIA labels; dark mode supported via design tokens.
- Confidential content uses permission-aware projection (hidden, not greyed) and watermarked PDFs.
- All lists paginated (max 100/page); destructive/guarded actions confirm with consequence summary; certification/disposal require MFA step-up.
- Dates display `DD-MMM-YYYY`; money INR with i18n; timestamps in user timezone.

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/pam`; JSON; JWT bearer; RBAC + org scope + tier projection.
- All list endpoints paginated (`?page=&limit=` max 100, or cursor); sortable; filterable.
- Idempotency keys on posting/certify actions; optimistic concurrency via `If-Match`/`updated_at`.

### 8.2 Canonical error envelope

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Weightage must total 100%", "field": "goals.weightage" },
  "requestId": "b7c2a1e4-7f3d-4a90-9d2f-1c2b3a4d5e6f"
}
```

### 8.3 Error-code catalog (inherited + module-specific)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/business validation failed |
| AUTH_REQUIRED | 401 | Missing/invalid token or step-up needed |
| FORBIDDEN | 403 | Role/tier/org/self-adjudication denied |
| NOT_FOUND | 404 | Resource not found / not in scope |
| CONFLICT | 409 | State or uniqueness conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled server error |
| UPSTREAM_UNAVAILABLE | 503 | M07/M12/M06/M13 unavailable |
| WEIGHTAGE_IMBALANCE | 422 | Goal weightages ≠ 100% at lock |
| TIER_CONFLICT | 409 | Same person across tiers / self-adjudication |
| SELF_ADJUDICATION_BLOCKED | 403 | Caller is appraisee on this form |
| INVALID_STATE_TRANSITION | 409 | Action not allowed in current form status |
| GRADE_OUT_OF_RANGE | 422 | Grade outside scale bounds |
| REPRESENTATION_WINDOW_CLOSED | 409 | SLA window elapsed (condonation required) |
| DISCLOSURE_REQUIRED | 409 | Action blocked until APAR disclosed |
| CALIBRATION_RATIONALE_REQUIRED | 422 | Adjustment without rationale |
| MIN_N_SUPPRESSED | 200 | Aggregate suppressed (informational) |
| CUSTODY_ORPHANED | 409 | No custodian resolvable on transfer |
| ALREADY_POSTED | 409 | SR posting is idempotent no-op |

### 8.4 JSON examples

**Submit RO assessment (request):**
```json
POST /api/v1/pam/forms/{formId}/assessment/reporting/submit
{
  "integrity_certified": "BEYOND_DOUBT",
  "pen_picture": "A diligent officer who cleared the case backlog...",
  "section_grades": [{ "section": "KRA", "grade": 8.5, "weightage": 70 },
                     { "section": "COMPETENCY", "grade": 7.5, "weightage": 30 }],
  "provisional_grade": 8.2
}
```

**Certify (response):**
```json
{
  "form_id": "f...01",
  "apar_no": "APAR-2025-26-000142",
  "final_grade": 8.40,
  "final_grade_label": "Very Good",
  "is_adverse": false,
  "below_benchmark": false,
  "status": "CALIBRATION",
  "requestId": "..."
}
```

**Post-to-SR (idempotent no-op):**
```json
{ "error": { "code": "ALREADY_POSTED", "message": "APAR already posted to Service Register", "field": "form_id" }, "requestId": "..." }
```

### 8.5 Integration contracts

| System | Mode | Payload |
|---|---|---|
| M12 SR | append event (outbox) | `{type:"APAR_FINAL_GRADE", employee_id, cycle_id, final_grade, label, is_adverse, form_ref}` |
| M06 eligibility | feed (upsert by cycle) | `{employee_id, cycle_id, final_grade, below_benchmark}` |
| M07 training | nomination POST | `{employee_id, competency_id, gap_severity, source:"APAR"}` |
| M13 documents | store/fetch | encrypted PDF + acknowledgement metadata |
| Notifications | publish | task/deadline/disclosure events |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; bulk form materialise (10k forms) < 2 min async; analytics queries < 2s cached |
| Availability | 99.9% uptime; degraded-read mode if M12/M06 down (queue writes via outbox) |
| Scalability | Horizontal scaling; supports ≥ 200k employees; calibration sessions over ≥ 5k forms |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; tier-aware field-level authz; MFA step-up for certify/dispose |
| Privacy | DPDP Act 2023 alignment; PII minimisation; confidential classification; min-N suppression in analytics |
| Auditability | Every state change in `audit_log`; APAR access in append-only `apar_disclosure_log`; tamper-evident |
| Reliability | Outbox + retry with backoff for SR/M06/M07 posting; no partial commits; idempotent posting |
| Recoverability | RPO ≤ 15 min; RTO ≤ 4h; point-in-time restore for statutory records |
| Accessibility | WCAG 2.1 AA; keyboard/focus; dark mode |
| Observability | Structured logs (no PII values), metrics, traces with `requestId`; SLA dashboards for cycle progress |
| Retention | Statutory retention schedule; controlled, approved disposal only |
| i18n/l10n | Locale dates `DD-MMM-YYYY`, INR money, multilingual labels |

---

## Section 10 — Workflow & State Diagrams (State Tables)

### 10.1 Appraisal form (APAR) state machine

| Current | Event | Guard | Next | Side effects |
|---|---|---|---|---|
| DRAFT | cycle open | eligible | GOALS_PENDING | notify appraisee/RO |
| GOALS_PENDING | goals lock | weightage=100, all approved | GOALS_APPROVED | notify appraisee |
| GOALS_APPROVED | self window open | — | SELF_APPRAISAL | notify appraisee |
| SELF_APPRAISAL | self submit | narrative present | RO_ASSESSMENT | notify RO |
| RO_ASSESSMENT | RO submit | integrity+penpicture+grade valid | RVO_REVIEW | notify RvO |
| RO_ASSESSMENT | RO return self | — | SELF_APPRAISAL | notify appraisee |
| RVO_REVIEW | RvO submit | concur/variance valid | AA_ACCEPTANCE | notify AA |
| RVO_REVIEW | RvO return | — | RO_ASSESSMENT | notify RO |
| AA_ACCEPTANCE | certify | step-up, grade valid | CALIBRATION / DISCLOSURE / FINALISED | derive flags |
| CALIBRATION | calibration complete | session done | DISCLOSURE / FINALISED | flags recomputed |
| DISCLOSURE | disclose | — | DISCLOSED | log+notify appraisee |
| DISCLOSED | acknowledge | — | DISCLOSED (ack set) | log |
| DISCLOSED | file representation | within SLA | REPRESENTATION | notify authority |
| DISCLOSED | window expires | no rep | FINALISED | — |
| REPRESENTATION | decide | authority valid | FINALISED | recompute grade if modified/expunged |
| FINALISED | post to SR | rep resolved | POSTED | SR + M06 events |
| any (pre-POSTED) | withdraw (admin) | reason | WITHDRAWN | log |
| FINALISED/POSTED | expunge (statutory) | authority | EXPUNGED | corrective SR event |

### 10.2 Goal state machine

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | propose | weightage set | PROPOSED |
| PROPOSED | RO approve | RO role | APPROVED |
| PROPOSED | RO return | — | DRAFT |
| APPROVED | revise | window open + RO approve | REVISED |
| APPROVED/REVISED | mark achieved | cycle end | ACHIEVED / NOT_ACHIEVED |
| any | drop | reason | DROPPED |

### 10.3 Representation state machine

| Current | Event | Guard | Next |
|---|---|---|---|
| FILED | take up | authority assigned | UNDER_REVIEW |
| UNDER_REVIEW | decide | reason recorded | DECIDED |
| DECIDED | close | grade applied | CLOSED |

### 10.4 PIP state machine

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | RvO concur + activate | concurrence | ACTIVE |
| ACTIVE | review | period checkpoint | UNDER_REVIEW |
| UNDER_REVIEW | close | outcome set | CLOSED |
| UNDER_REVIEW | extend | approval | (successor) ACTIVE |

### 10.5 Calibration adjustment state machine

| Current | Event | Guard | Next |
|---|---|---|---|
| PROPOSED | vote | quorum | APPROVED / REJECTED |
| APPROVED | apply | rationale present | APPLIED |

---

## Section 11 — Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Cycle opened / goals due | Appraisee, RO | in-app, email | PAM_CYCLE_OPEN |
| Goals returned / approved | Appraisee | in-app, email | PAM_GOAL_STATUS |
| Self-appraisal due / returned | Appraisee | in-app, email | PAM_SELF_DUE |
| RO/RvO/AA task assigned | Respective officer | in-app, email | PAM_TIER_TASK |
| Deadline approaching / overdue | Owner + escalation | in-app, email | PAM_SLA_REMINDER |
| 360 invitation | Rater | email (token link) | PAM_360_INVITE |
| Calibration session scheduled | Committee | in-app, email | PAM_CALIB_SCHED |
| APAR disclosed | Appraisee | in-app, email | PAM_DISCLOSED |
| Representation filed / decided | Authority / Appraisee | in-app, email | PAM_REP_STATUS |
| Grade posted to SR | HR, Custodian | in-app | PAM_SR_POSTED |
| Competency gap → training nominated | Appraisee, HR | in-app | PAM_TRAINING_NOM |
| PIP activated / milestone at-risk / closed | Appraisee, RO, RvO | in-app, email | PAM_PIP_STATUS |
| Unauthorised access attempt | Custodian, Auditor | in-app | PAM_ACCESS_DENIED |

All notifications write to shared `notifications`; no PII values in payloads beyond identifiers; respect quiet hours and user preferences.

---

## Section 12 — Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| Cycle completion funnel | HR, leadership | Counts per form status, overdue, by org/cadre |
| Rating distribution (pre/post calibration) | HR, AA | Histogram vs target; skew per RO/unit |
| Grading-skew / bias flags | HR | ROs/units beyond deviation threshold |
| Adverse & representation rate | HR, Auditor | Adverse counts, representation volume/outcomes, SLA breaches |
| Competency-gap heatmap | HR, L&D (M07) | Gaps by competency/org; nomination conversion |
| 360 participation | HR | Response rates by relationship; suppression flags |
| PIP outcomes | HR | Active/closed PIPs, success rate |
| Benchmark eligibility feed | M06 | Employees meeting/below benchmark per cycle |
| Custody & access audit | Custodian, Auditor | Access events, denied attempts, custody transfers |

All analytics respect org scope and min-N suppression; feed M14 via the read API; freshness ≤ 15 min.

---

## Section 13 — Migration & Launch

### 13.1 Data migration

| Source | Target | Approach |
|---|---|---|
| Legacy APAR records (paper/scanned) | E4 + M13 documents | Digitise; capture final grade, label, adverse flag, cycle; link scanned PDF |
| Historical grades | service_register_events (M12) | Back-post as historical events (non-idempotent flagged), preserving original dates |
| Competency framework | M07 read | Map legacy competencies to M07 catalog |
| Reporting chains | M01 | Reconcile RO/RvO/AA history per cycle |

### 13.2 Migration rules

- Historical records imported in `ARCHIVED` cycle/form status; no re-adjudication.
- Final grades validated against the historical scale (snapshot), not the current scale.
- All migrated APARs default to CONFIDENTIAL; access logged from import onward.
- Reconciliation report lists unmapped chains/competencies for manual resolution (no silent drops).

### 13.3 Launch plan

1. Pilot one department for one cycle (config → goals → assessment → disclosure → posting).
2. Validate calibration and representation flows with real committees.
3. Verify M12/M06/M07 integration end-to-end (including outbox retry).
4. Train ROs/RvOs/AAs and custodians; publish confidentiality SOP.
5. Phased rollout by cadre; monitor SLA dashboards; cutover legacy capture.

### 13.4 Rollback / contingency

- Outbox enables safe replay if downstream modules lag.
- Feature flags per capability (calibration, 360, PIP) for staged enablement.
- Statutory records are append-only; corrections via corrective events, never destructive edits.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state machine)

| FR | Entities | Key APIs | State machine |
|---|---|---|---|
| FR-M08-01 | E1,E2,E3,E4 | /cycles, /open, /templates, /rating-scales | cycle, form(create) |
| FR-M08-02 | E5,E4 | /goals, /approve, /lock | goal, form(goals) |
| FR-M08-03 | E7,E5,E4 | /self-appraisal* | form(self) |
| FR-M08-04 | E8,E4,E9,E5 | /assessment/reporting* | form(RO) |
| FR-M08-05 | E8,E4 | /assessment/reviewing* | form(RvO) |
| FR-M08-06 | E8,E4,E3 | /assessment/accepting* | form(AA) |
| FR-M08-07 | E3,E4,E8 | /rating-scales, /grade/preview | (grade engine) |
| FR-M08-08 | E13,E4,E18,docs | /disclose, /representations, /decide | form(disclosure/rep), representation |
| FR-M08-09 | E14,E15,E4 | /calibration/* | calibration, form(calibration) |
| FR-M08-10 | E10,E6,E5 | /feedback, /checkins | (no form transition) |
| FR-M08-11 | E11,E12,E9 | /360/* | 360 request |
| FR-M08-12 | E9,M07,E7 | /competencies*, /nominate | (RO stage) |
| FR-M08-13 | E16,E17,E4 | /pips* | PIP |
| FR-M08-14 | E4,SR(M12),M06,E18 | /finalise, /post-to-sr | form(finalise/post) |
| FR-M08-15 | E18,E4,docs | /pdf, /custody-transfer, /access-log, /dispose | (custody events) |
| FR-M08-16 | E4,E15,E9,E11/12 | /analytics/* | (read-only) |

### 14.2 Dependency graph

```
FR-01 ──> FR-02 ──> FR-03 ──> FR-04 ──> FR-05 ──> FR-06 ──> FR-09 ──> FR-08 ──> FR-14
                    │           │                                  │
FR-07 (scale) ──────┴───────────┴──> consumed by FR-04/05/06/09/16 │
FR-10 (continuous) ── feeds evidence into FR-04                     │
FR-11 (360) ── feeds FR-04                                          │
FR-12 (competency) ── part of FR-04, writes M07                     │
FR-13 (PIP) ── follows FR-06 outcome                               │
FR-15 (custody) ── cross-cuts all reads/PDF                        │
FR-16 (analytics) ── reads FR-06/07/09/11/12, feeds M14 ───────────┘
```

### 14.3 Parallel-agent build plan

| Wave | FRs (parallelisable) | Rationale |
|---|---|---|
| W1 (foundation) | FR-07, FR-01 | Scales then cycle/forms; no peer deps |
| W2 | FR-02, FR-10, FR-15 | Goals, continuous feedback, custody scaffolding |
| W3 | FR-03, FR-11, FR-12 | Self-appraisal, 360, competency (depend on forms/goals) |
| W4 | FR-04, FR-05, FR-06 | Tier assessments (sequential within, parallel tooling) |
| W5 | FR-09, FR-13 | Calibration, PIP |
| W6 | FR-08, FR-14 | Disclosure/representation, posting |
| W7 | FR-16 | Analytics last (reads all) |

Shared contracts (error catalog, state machines, grade engine, tier-projection) are built first as libraries to avoid drift across parallel agents.

### 14.4 Final reconciliation table (0 unresolved gaps)

| Concern | Covered by | Status |
|---|---|---|
| Goal setting + cascading + weightage | FR-02 | Resolved |
| Self-appraisal | FR-03 | Resolved |
| APAR three-tier (RO/RvO/AA) | FR-04/05/06 | Resolved |
| Rating scales + numeric grading | FR-07 | Resolved |
| Disclosure to officer | FR-08, FR-15 | Resolved |
| Representation/appeal against adverse | FR-08 | Resolved |
| Calibration/normalisation/bell-curve | FR-09 | Resolved |
| Continuous feedback & check-ins | FR-10 | Resolved |
| 360-degree feedback | FR-11 | Resolved |
| Competency assessment + M07 skill-gap→training | FR-12 | Resolved |
| Integrity/attribute columns + pen-picture | FR-04 (E4 fields) | Resolved |
| PIP | FR-13 | Resolved |
| Custody & confidentiality | FR-15 | Resolved |
| Post final ratings to SR (M12) | FR-14 | Resolved |
| Feed promotion eligibility (M06) | FR-14 | Resolved |
| Analytics on rating distribution | FR-16 | Resolved |
| Audit/notifications/workflow reuse | Shared Foundation + all FRs | Resolved |
| Sample data per entity | Section 5.7 | Resolved |
| Error catalog + envelope | Section 8 | Resolved |
| State machines | Section 10 | Resolved |
| **Unresolved gaps** | — | **0** |

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| APAR | Annual Performance Appraisal Report — statutory confidential appraisal record |
| Appraisee / Officer Reported Upon | Employee whose performance is appraised |
| Reporting Officer (RO) | First-tier appraiser (direct supervisor) |
| Reviewing Officer (RvO) | Second-tier reviewer of the RO's assessment |
| Accepting Authority (AA) | Final certifying authority for the APAR |
| KRA / KPI | Key Result Area / Key Performance Indicator |
| OKR | Objectives and Key Results |
| Pen-picture | RO's qualitative narrative summary of the officer |
| Integrity column | Statutory certification of the officer's integrity |
| Benchmark grade | Minimum grade qualifying for promotion eligibility |
| Adverse remark | Below-threshold remark/grade requiring disclosure and appealable |
| Representation | Officer's formal appeal against adverse/below-benchmark remarks |
| Expunction | Removal of an adverse remark following a successful representation |
| Calibration / Normalisation | Committee moderation to ensure fair, comparable ratings |
| Bell curve / Forced distribution | Distribution-based moderation method |
| PIP | Performance Improvement Plan |
| 360-degree feedback | Multi-rater feedback from peers/subordinates/customers |
| Custody | Statutory confidential safekeeping of APAR records |
| Min-N suppression | Withholding aggregates below a minimum count to protect privacy |
| Outbox | Reliable async write pattern for cross-module posting |

---

## Section 16 — Appendices

### Appendix A — Sample 10-point APAR scale bands
| Band | Range | Descriptor |
|---|---|---|
| Outstanding | 9.00–10.00 | Exceptional, role-model performance |
| Very Good | 7.00–8.99 | Consistently exceeds expectations |
| Good | 6.00–6.99 | Meets expectations (benchmark) |
| Average | 4.00–5.99 | Partially meets expectations |
| Below Average | 1.00–3.99 | Adverse — improvement required |

### Appendix B — Tier-aware field visibility (illustrative)
| Field | Appraisee (pre-disclosure) | RO | RvO | AA | Auditor |
|---|---|---|---|---|---|
| Goals / self-appraisal | full | full | full | full | full |
| RO remarks/grade | hidden | full | full | full | full |
| RvO remarks/grade | hidden | hidden | full | full | full |
| AA final grade | after disclosure | read | read | full | full |
| Integrity remark | after disclosure | author | read | read | full |

### Appendix C — Statutory calendar (illustrative APAR year)
| Milestone | Indicative window |
|---|---|
| Goal setting | Apr–May (period start) |
| Self-appraisal | Apr (period end +) |
| RO assessment | within 30 days of self |
| RvO review | within 15 days of RO |
| AA acceptance | within 15 days of RvO |
| Calibration | post-AA, pre-disclosure |
| Disclosure | within 15 days of acceptance |
| Representation window | within statutory days of disclosure |
| Posting to SR | after representation resolution |

### Appendix D — Assumptions & open items
- Exact statutory representation window (days) and condonation authority are configuration, set per jurisdiction at deployment.
- Competency catalog and role-required levels are owned by M07; M08 consumes snapshots.
- Adjudicating authority seniority rules are configurable to the deploying government's service rules.

### Appendix E — Reuse confirmation
This BRD reuses, without redefining, the Shared Foundation canonical entities (`employees`, `users`, `org_units`, `designations`, `cadres`, `roles`, `permissions`, `audit_log`, `documents`, `notifications`, `workflow_instances`, `workflow_tasks`, `service_register_events`) and conventions (IDs, audit fields, statuses, time/locale, pagination, maker-checker, RBAC baseline, technical defaults, error envelope). Module-specific entities E1–E18 extend, and do not conflict with, the shared model.
