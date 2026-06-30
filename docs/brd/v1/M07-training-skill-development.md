# Training and Skill Development Management — HRMS Module BRD

**Module code:** M07-TSD
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector HCM, hosted at CGG Data Centre
**Document version:** v1.0
**Status:** Approved for build (parallel-agent ready)
**Foundation contract:** This BRD inherits and does not redefine the canonical entities, roles, conventions, and technical defaults in `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`. Shared entities (`employees`, `users`, `org_units`, `roles`, `audit_log`, `documents`, `notifications`, `service_register_events`, `workflow_instances`/`workflow_tasks`) are referenced, not redefined.

---

## 1. Executive Summary

### 1.1 Purpose
The Training and Skill Development Management module (M07-TSD) is the enterprise system that closes the loop between **what the workforce can do today** and **what each role demands**. It establishes a governed **competency and skill framework**, maintains a per-employee **skill inventory**, computes **skill-gap analysis**, converts gaps into a governed **annual training plan and calendar**, manages the full **training delivery lifecycle** (course catalog, nomination, scheduling, attendance, assessment, Kirkpatrick evaluation, certification), tracks **mandatory compliance and induction training**, governs the **training budget**, and posts significant trainings and qualifications to the statutory **Digital Service Register (M12-SR)**.

### 1.2 Business context
For a public-sector employer, training is not only a capability lever but a **statutory and audit obligation**: mandatory compliance training (e.g., conduct rules, cyber-security, POSH, ethics), induction for new entrants, and the recording of significant qualifications/trainings in the service register are legally consequential. M07-TSD therefore combines **world-class HCM learning capabilities** (skills marketplace, learning paths, micro-learning, LMS/SCORM/xAPI integration, AI skill recommendations, CPD credit tracking) with **public-sector rigour** (maker-checker nominations, budget sanction, segregation of duties, immutable audit, statutory SR posting).

### 1.3 Key outcomes
- A single competency taxonomy and role-based competency models drive objective skill-gap measurement.
- Training needs originate from three reconciled sources: competency gaps, **appraisal development gaps imported from M08-PAM**, and statutory mandates.
- Every nomination, attendance mark, assessment, certificate, and cost entry is auditable and traceable to a need.
- Mandatory and induction training compliance is measurable and dashboard-visible at any time.
- Significant trainings/qualifications post automatically to the Digital SR (M12) as append-only events.

### 1.4 Scope summary
M07-TSD owns competency/skill master data, the skill inventory, training programs and sessions, nominations, attendance, assessment, feedback, certification, learning paths, CPD records, the training budget, and LMS-integration metadata. It consumes employee master data (M01), appraisal gaps (M08), org structure, documents (M13), and notifications, and it writes events to the Digital SR (M12) and analytics to M14.

### 1.5 Success metrics (KPIs)
| KPI | Target | Source |
|---|---|---|
| Mandatory-compliance training completion | ≥ 98% within statutory window | M07 |
| Annual training-plan execution rate | ≥ 90% of planned man-days delivered | M07 |
| Skill-gap closure rate (year-on-year) | ≥ 25% of critical gaps closed | M07 + M08 |
| Average post-training learning gain (post − pre score) | ≥ 20 percentage points | M07 |
| Certificate validity compliance (no lapsed mandatory certs) | 100% | M07 |
| Budget utilisation variance | within ±10% of sanctioned | M07 |

---

## 2. Scope & Boundaries

### 2.1 In scope
1. Skill taxonomy and competency framework (categories, skills, competencies, proficiency-level catalog).
2. Role-based competency models with required proficiency targets.
3. Per-employee skill inventory with self/manager/validated assessment and currency/expiry.
4. Skill-gap analysis vs competency model and reconciled with M08 appraisal development gaps.
5. Training needs identification, consolidation, and prioritisation.
6. Annual training calendar and plan with budget allocation.
7. Course catalog and program management: internal, external, e-learning/LMS, blended, micro-learning.
8. Session/batch scheduling, trainer management, venue management, capacity and waitlist.
9. Nomination and multi-level approval workflow (maker-checker, budget sanction).
10. Attendance capture (per session/day), pre/post assessment, Kirkpatrick L1–L4 feedback evaluation.
11. Certification issuance, validity, renewal/recertification reminders.
12. Mandatory compliance training tracking and induction/onboarding training.
13. Learning paths, skill-based recommendations, CPD/credit tracking, skills marketplace.
14. LMS integration (SCORM 1.2/2004, xAPI/Tin Can) enrollment and completion sync.
15. Training budget and cost tracking (planned vs committed vs actual).
16. Posting of significant trainings/qualifications to the Digital Service Register (M12).

### 2.2 Out of scope (owned elsewhere)
- Employee master record and job data → **M01-EPM**.
- Appraisal goals, ratings, and the development-gap source data → **M08-PAM** (M07 consumes a read-only feed).
- Promotion/seniority decisions that may consider training → **M06-PPP** (M07 supplies certification data; decision is M06).
- Payroll disbursement of training reimbursements → **M10-PAY** (M07 supplies an approved-cost payable feed only).
- Statutory SR ledger itself → **M12-SR** (M07 writes events; M12 owns the ledger).
- Document binary storage and encryption → **M13-DMS** (M07 stores `document_id` references).
- Cross-module executive dashboards → **M14-DAS** (M07 exposes datamarts/queries).

### 2.3 Feature Module Map
| Feature group | Capability | Primary FRs |
|---|---|---|
| Competency framework | Taxonomy, competencies, proficiency levels, competency models | FR-TSD-001, FR-TSD-002 |
| Skill inventory & gaps | Employee skills, assessments, gap analysis | FR-TSD-003, FR-TSD-004 |
| Planning | Needs identification, annual plan/calendar, budget allocation | FR-TSD-005, FR-TSD-006 |
| Catalog & delivery | Programs, sessions, trainers, venues | FR-TSD-007, FR-TSD-008 |
| Enrolment | Nomination & approval workflow | FR-TSD-009 |
| Execution | Attendance, assessment, feedback | FR-TSD-010, FR-TSD-011 |
| Compliance | Certification/renewal, mandatory & induction training | FR-TSD-012, FR-TSD-013 |
| Modern learning | Learning paths, recommendations, CPD, marketplace | FR-TSD-014 |
| Integration | LMS SCORM/xAPI sync | FR-TSD-015 |
| Statutory & finance | SR posting, budget/cost tracking & reporting | FR-TSD-016 |

### 2.4 Common Capabilities (inherited, applied throughout)
- **Audit:** every create/update/state-change writes to `audit_log` (FR-agnostic).
- **Soft delete:** `is_deleted` on all non-ledger entities; ledgers (assessment results, SR events) are append-only.
- **Maker-checker:** nominations, budget changes, certificate revocation, and master-data publication route through `workflow_instances`/`workflow_tasks`.
- **RBAC + row-level scoping:** all queries scoped by `org_unit_id` subtree of the actor.
- **Pagination:** all list endpoints paginated, hard max page size 100.
- **i18n / locale:** UTC storage, `DD-MMM-YYYY` display, INR currency default.
- **Notifications:** state transitions raise `notifications` ledger entries (email/SMS/in-app).
- **Documents:** all uploads (certificates, materials, attendance sheets) reference `documents.document_id` (M13).

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict §4 of Foundation)
| Role | Description |
|---|---|
| **Employee (Self-Service)** | View own skill inventory, gaps, learning path; self-assess skills; express interest/self-nominate; attend e-learning; view own certificates and CPD. |
| **Reporting Manager** | Validate direct reports' skills; recommend/approve nominations (L1); view team gaps and plan. |
| **L&D Officer (HR)** | Manage catalog, sessions, trainers, venues; identify/consolidate needs; build plan; record attendance/assessment; issue certificates. |
| **L&D Manager / Training Head** | Approve annual plan and budget; final-approve nominations (L2); approve budget sanction; approve certificate revocation. |
| **Department Head / Appointing Authority** | Sanction departmental nominations and budget where required by policy. |
| **Trainer / Facilitator** | View assigned sessions and rosters; mark attendance; enter assessment scores; close session. (Internal trainers are `users`; external trainers may be vendor logins or proxied by L&D Officer.) |
| **Finance / Budget Controller** | Define and monitor training budgets; reconcile committed vs actual cost. |
| **SR Custodian / Registrar (M12)** | Receives/validates SR postings of significant trainings; cannot edit M07 records. |
| **Auditor (read-only)** | Cross-module read + audit log; no write. |
| **System Administrator** | Configure taxonomy publication, enums, LMS integration, RBAC; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-delete/Disable, A=Approve, X=Execute/Operate)
| Capability \ Role | Employee | Mgr | L&D Officer | L&D Mgr | Dept Head | Trainer | Finance | SR Cust. | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| Skill taxonomy / competency master | R | R | C R U | A | R | R | – | R | R | C R U D |
| Competency models | R | R | C R U | A | R | – | – | – | R | R |
| Own skill inventory | R U(self-assess) | R | R U | R | R | – | – | – | R | – |
| Team skill validation | – | U A | R U | R | R | – | – | – | R | – |
| Skill-gap analysis | R(own) | R(team) | C R | R | R(dept) | – | – | – | R | – |
| Training needs | R(own) | C R | C R U | A | A | – | – | – | R | – |
| Annual plan & calendar | R | R | C R U | A | A(dept) | R | R | – | R | – |
| Course catalog / programs | R | R | C R U D | A | R | R | – | – | R | – |
| Sessions / trainers / venues | R | R | C R U D | A | R | R(own) | – | – | R | – |
| Nomination | C(self) R | C A(L1) | C R U | A(L2) | A | – | – | – | R | – |
| Budget definition | R | – | R | A | R | R | C R U | – | R | – |
| Attendance | R(own) | R(team) | C R U X | R | R | C R U X | – | – | R | – |
| Assessment scores | R(own) | R(team) | C R U | R | – | C R U | – | – | R | – |
| Feedback (Kirkpatrick) | C(own) R | R | R U(analysis) | R | R | R | – | – | R | – |
| Certification issue | R(own) | R | C R U | A | R | – | – | R(posted) | R | – |
| Certificate revoke | – | – | C(request) | A | – | – | – | – | R | – |
| CPD / learning path | R U(self) | R | C R U | A | R | – | – | – | R | – |
| LMS integration config | – | – | R | R | – | – | – | – | R | C R U |
| SR posting | – | – | X(trigger) | A | – | – | – | R(receive) | R | – |
| Cost entry / reconciliation | R(own) | R | C R U | A | R | R | C R U A | – | R | – |

Segregation-of-duties is enforced everywhere: **maker ≠ checker**, no self-approval of one's own nomination, budget sanctioner ≠ cost recorder.

---

## 4. Shared Application Foundation

M07-TSD inherits the §5 technical defaults of the Foundation:
- **Frontend:** React + TypeScript, Tailwind + shadcn/ui, WCAG 2.1 AA.
- **API:** REST under `/api/v1`, canonical error envelope, standard error codes plus module-specific codes (see §10).
- **Datastore:** PostgreSQL primary; object storage for documents via M13.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org-unit scoping.
- **Workflow:** shared `workflow_instances`/`workflow_tasks` engine for maker-checker and multi-level approvals.
- **Audit:** every state change writes immutable `audit_log`.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, India DPDP Act 2023 alignment, statutory retention.
- **Integration bus:** asynchronous, idempotent event publication to M12-SR and M10-PAY; consumes M08-PAM development-gap feed and M01 employee master via internal APIs/events.

**Shared entities referenced (not redefined):** `employees` (M01), `org_units`, `users`, `roles`, `designations`, `audit_log`, `documents` (M13), `notifications`, `service_register_events` (M12), `workflow_instances`/`workflow_tasks`.

---

## 5. Holistic Data Model

### 5.1 Entity inventory
| # | Entity | Type | Owner | Description |
|---|---|---|---|---|
| 1 | `skill_categories` | Master | M07 | Top-level grouping of the skill taxonomy (e.g., Technical, Behavioural, Domain, Compliance). |
| 2 | `skills` | Master | M07 | Atomic skill within a category (the skill taxonomy leaves). |
| 3 | `proficiency_levels` | Master | M07 | Ordered proficiency scale (e.g., 1-Awareness … 5-Expert). |
| 4 | `competencies` | Master | M07 | Higher-order competency definitions, optionally composed of skills. |
| 5 | `competency_models` | Master | M07 | Role/designation-scoped competency model header. |
| 6 | `competency_model_items` | Master | M07 | Required competency + target proficiency lines within a model. |
| 7 | `employee_skills` | Transactional | M07 | Per-employee current skill inventory with proficiency, source, currency. |
| 8 | `skill_assessments` | Append-only | M07 | History of self/manager/validated skill assessment events. |
| 9 | `skill_gap_analyses` | Transactional | M07 | Computed gap snapshot per employee vs a model and reconciled with M08. |
| 10 | `skill_gap_items` | Transactional | M07 | Per-competency gap lines within a gap analysis. |
| 11 | `training_needs` | Transactional | M07 | Identified individual/group training need, prioritised and sourced. |
| 12 | `annual_training_plans` | Transactional | M07 | Yearly plan header per org unit / financial year. |
| 13 | `training_plan_items` | Transactional | M07 | Planned program lines with target audience, man-days, budget. |
| 14 | `training_programs` | Master | M07 | Course catalog entry (internal/external/e-learning/blended). |
| 15 | `training_sessions` | Transactional | M07 | Scheduled batch/session of a program. |
| 16 | `trainers` | Master | M07 | Internal/external trainer/faculty profiles. |
| 17 | `venues` | Master | M07 | Physical/virtual training venues with capacity. |
| 18 | `training_nominations` | Transactional | M07 | An employee's nomination/enrollment in a session, with workflow. |
| 19 | `training_attendance` | Transactional | M07 | Per-nomination, per-session-day attendance records. |
| 20 | `training_assessments` | Append-only | M07 | Pre/post test results per nomination. |
| 21 | `training_feedback` | Append-only | M07 | Kirkpatrick L1–L4 feedback/evaluation per nomination/session. |
| 22 | `certifications` | Transactional | M07 | Issued certificates with validity/renewal and SR-posting state. |
| 23 | `training_budgets` | Transactional | M07 | Budget allocation per org unit / FY / category. |
| 24 | `training_costs` | Transactional | M07 | Committed/actual cost entries against budget/session/nomination. |
| 25 | `learning_paths` | Master | M07 | Curated/recommended ordered sequence of programs toward a goal. |
| 26 | `learning_path_items` | Master | M07 | Ordered steps within a learning path. |
| 27 | `cpd_records` | Append-only | M07 | Continuing professional development credits earned. |
| 28 | `lms_enrollments` | Transactional | M07 | LMS/SCORM/xAPI enrollment + completion sync metadata. |

### 5.2 Field tables

#### 5.2.1 `skill_categories`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_category_id` | UUID | PK | |
| `code` | VARCHAR(30) | UNIQUE, NOT NULL | e.g., `TECH`, `BEHAV`, `COMPL` |
| `name` | VARCHAR(120) | NOT NULL | |
| `description` | TEXT | | |
| `parent_category_id` | UUID | FK→skill_categories | Optional self-reference for sub-categories |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| `display_order` | INT | DEFAULT 0 | |
| audit fields | — | | `created_at,…,is_deleted` |

#### 5.2.2 `skills`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_id` | UUID | PK | |
| `skill_category_id` | UUID | FK→skill_categories, NOT NULL | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `description` | TEXT | | |
| `is_compliance_skill` | BOOLEAN | DEFAULT false | Maps to mandatory training |
| `default_validity_months` | INT | NULL | For skills requiring renewal |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.3 `proficiency_levels`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `proficiency_level_id` | UUID | PK | |
| `level_order` | INT | UNIQUE, NOT NULL | 1..N ascending |
| `code` | VARCHAR(20) | UNIQUE, NOT NULL | `L1`..`L5` |
| `name` | VARCHAR(60) | NOT NULL | Awareness/Working/Proficient/Advanced/Expert |
| `descriptor` | TEXT | | Behavioural anchor |
| `status` | ENUM | NOT NULL | PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.4 `competencies`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `competency_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `competency_type` | ENUM | NOT NULL | TECHNICAL, BEHAVIOURAL, LEADERSHIP, FUNCTIONAL, COMPLIANCE |
| `description` | TEXT | | |
| `linked_skill_ids` | UUID[] | FK refs→skills | Composing skills (optional) |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.5 `competency_models`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `competency_model_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `scope_type` | ENUM | NOT NULL | DESIGNATION, CADRE, ROLE, ORG_UNIT, GENERIC |
| `designation_id` | UUID | FK→designations, NULL | When scope=DESIGNATION |
| `cadre` | VARCHAR(60) | NULL | When scope=CADRE |
| `org_unit_id` | UUID | FK→org_units, NULL | When scope=ORG_UNIT |
| `effective_from` | DATE | NOT NULL | |
| `effective_to` | DATE | NULL | |
| `version` | INT | NOT NULL DEFAULT 1 | |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.6 `competency_model_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `competency_model_item_id` | UUID | PK | |
| `competency_model_id` | UUID | FK→competency_models, NOT NULL | |
| `competency_id` | UUID | FK→competencies, NOT NULL | |
| `target_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | Required level |
| `weight` | NUMERIC(5,2) | DEFAULT 1.0 | For weighted gap scoring |
| `is_critical` | BOOLEAN | DEFAULT false | Critical-gap flag |
| UNIQUE(`competency_model_id`,`competency_id`) | — | | |
| audit fields | — | | |

#### 5.2.7 `employee_skills`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `employee_skill_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `skill_id` | UUID | FK→skills, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `source` | ENUM | NOT NULL | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `validated_by` | UUID | FK→employees, NULL | Manager/L&D validator |
| `validated_at` | TIMESTAMP | NULL | |
| `acquired_on` | DATE | NULL | |
| `expires_on` | DATE | NULL | Currency for renewable skills |
| `status` | ENUM | NOT NULL | DECLARED, VALIDATED, EXPIRED, REVOKED |
| UNIQUE(`employee_id`,`skill_id`) | — | | One current row per skill |
| audit fields | — | | |

#### 5.2.8 `skill_assessments` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_assessment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `skill_id` | UUID | FK→skills, NOT NULL | |
| `assessed_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `assessment_type` | ENUM | NOT NULL | SELF, MANAGER, TEST, EXTERNAL |
| `assessed_by` | UUID | FK→employees, NOT NULL | |
| `evidence_document_id` | UUID | FK→documents, NULL | |
| `comments` | TEXT | | |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| `created_at`,`created_by` | — | append-only | No update/delete |

#### 5.2.9 `skill_gap_analyses`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_analysis_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `competency_model_id` | UUID | FK→competency_models, NOT NULL | |
| `appraisal_cycle_ref` | VARCHAR(40) | NULL | M08 cycle id reconciled |
| `overall_gap_score` | NUMERIC(6,2) | | Weighted aggregate |
| `critical_gap_count` | INT | DEFAULT 0 | |
| `generated_on` | TIMESTAMP | NOT NULL | |
| `status` | ENUM | NOT NULL | DRAFT, FINALIZED, SUPERSEDED |
| audit fields | — | | |

#### 5.2.10 `skill_gap_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_item_id` | UUID | PK | |
| `skill_gap_analysis_id` | UUID | FK→skill_gap_analyses, NOT NULL | |
| `competency_id` | UUID | FK→competencies, NOT NULL | |
| `target_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NULL | NULL = no current skill |
| `gap_size` | INT | NOT NULL | target_order − current_order (≥0) |
| `is_critical` | BOOLEAN | DEFAULT false | |
| `source` | ENUM | NOT NULL | MODEL, APPRAISAL, MANDATE |
| audit fields | — | | |

#### 5.2.11 `training_needs`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_need_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NULL | NULL for group/org needs |
| `org_unit_id` | UUID | FK→org_units, NULL | For group needs |
| `competency_id` | UUID | FK→competencies, NULL | |
| `skill_id` | UUID | FK→skills, NULL | |
| `source` | ENUM | NOT NULL | GAP_ANALYSIS, APPRAISAL, MANDATORY, MANAGER, SELF, INDUCTION |
| `source_ref` | VARCHAR(64) | NULL | e.g., gap_analysis_id / appraisal gap id |
| `priority` | ENUM | NOT NULL | LOW, MEDIUM, HIGH, CRITICAL |
| `financial_year` | VARCHAR(9) | NOT NULL | e.g., `2026-2027` |
| `status` | ENUM | NOT NULL | IDENTIFIED, CONSOLIDATED, PLANNED, ADDRESSED, DEFERRED, REJECTED |
| audit fields | — | | |

#### 5.2.12 `annual_training_plans`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `annual_training_plan_id` | UUID | PK | |
| `financial_year` | VARCHAR(9) | NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `total_planned_mandays` | INT | DEFAULT 0 | |
| `total_planned_budget` | NUMERIC(14,2) | DEFAULT 0 | INR |
| `status` | ENUM | NOT NULL | DRAFT, SUBMITTED, APPROVED, ACTIVE, CLOSED |
| `approved_by` | UUID | FK→employees, NULL | |
| `approved_at` | TIMESTAMP | NULL | |
| UNIQUE(`financial_year`,`org_unit_id`) | — | | |
| audit fields | — | | |

#### 5.2.13 `training_plan_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_plan_item_id` | UUID | PK | |
| `annual_training_plan_id` | UUID | FK→annual_training_plans, NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NULL | May be TBD at plan time |
| `competency_id` | UUID | FK→competencies, NULL | |
| `target_audience` | TEXT | | Description / cadre |
| `target_participant_count` | INT | DEFAULT 0 | |
| `planned_mandays` | INT | DEFAULT 0 | |
| `planned_budget` | NUMERIC(14,2) | DEFAULT 0 | |
| `target_quarter` | ENUM | NULL | Q1,Q2,Q3,Q4 |
| `status` | ENUM | NOT NULL | PLANNED, SCHEDULED, COMPLETED, DROPPED |
| audit fields | — | | |

#### 5.2.14 `training_programs`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_program_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `title` | VARCHAR(200) | NOT NULL | |
| `description` | TEXT | | |
| `delivery_mode` | ENUM | NOT NULL | CLASSROOM, ELEARNING, BLENDED, EXTERNAL, ON_THE_JOB, WEBINAR |
| `provider_type` | ENUM | NOT NULL | INTERNAL, EXTERNAL, VENDOR, GOVT_INSTITUTE |
| `is_mandatory` | BOOLEAN | DEFAULT false | Compliance training |
| `is_induction` | BOOLEAN | DEFAULT false | Onboarding |
| `duration_hours` | NUMERIC(6,2) | | |
| `default_capacity` | INT | NULL | |
| `cpd_credits` | NUMERIC(6,2) | DEFAULT 0 | |
| `linked_competency_ids` | UUID[] | FK refs→competencies | Outcomes |
| `certification_on_completion` | BOOLEAN | DEFAULT false | |
| `cert_validity_months` | INT | NULL | |
| `default_cost_per_participant` | NUMERIC(12,2) | DEFAULT 0 | |
| `material_document_ids` | UUID[] | FK refs→documents | |
| `lms_course_ref` | VARCHAR(120) | NULL | External LMS/SCORM id |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, RETIRED |
| audit fields | — | | |

#### 5.2.15 `training_sessions`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_session_id` | UUID | PK | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | |
| `batch_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NOT NULL | end ≥ start |
| `session_mode` | ENUM | NOT NULL | CLASSROOM, ONLINE, BLENDED |
| `venue_id` | UUID | FK→venues, NULL | |
| `online_meeting_url` | VARCHAR(300) | NULL | |
| `primary_trainer_id` | UUID | FK→trainers, NULL | |
| `capacity` | INT | NOT NULL | |
| `enrolled_count` | INT | DEFAULT 0 | Maintained transactionally |
| `waitlist_count` | INT | DEFAULT 0 | |
| `nomination_deadline` | DATE | NULL | |
| `status` | ENUM | NOT NULL | DRAFT, OPEN, FULL, RUNNING, COMPLETED, CANCELLED |
| audit fields | — | | |

#### 5.2.16 `trainers`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `trainer_id` | UUID | PK | |
| `trainer_type` | ENUM | NOT NULL | INTERNAL, EXTERNAL |
| `employee_id` | UUID | FK→employees, NULL | When internal |
| `full_name` | VARCHAR(150) | NOT NULL | |
| `organisation` | VARCHAR(150) | NULL | External org |
| `email` | VARCHAR(150) | NULL | |
| `phone` | VARCHAR(20) | NULL | |
| `expertise_skill_ids` | UUID[] | FK refs→skills | |
| `avg_feedback_rating` | NUMERIC(4,2) | NULL | Derived |
| `status` | ENUM | NOT NULL | ACTIVE, INACTIVE, BLACKLISTED |
| audit fields | — | | |

#### 5.2.17 `venues`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `venue_id` | UUID | PK | |
| `name` | VARCHAR(150) | NOT NULL | |
| `venue_type` | ENUM | NOT NULL | PHYSICAL, VIRTUAL |
| `org_unit_id` | UUID | FK→org_units, NULL | |
| `address` | TEXT | NULL | |
| `seating_capacity` | INT | NULL | |
| `facilities` | TEXT | NULL | Projector, lab, etc. |
| `status` | ENUM | NOT NULL | ACTIVE, INACTIVE |
| audit fields | — | | |

#### 5.2.18 `training_nominations`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_nomination_id` | UUID | PK | |
| `training_session_id` | UUID | FK→training_sessions, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_need_id` | UUID | FK→training_needs, NULL | Traceability to need |
| `nomination_type` | ENUM | NOT NULL | SELF, MANAGER, HR, MANDATORY, INDUCTION |
| `nominated_by` | UUID | FK→employees, NOT NULL | |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| `status` | ENUM | NOT NULL | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `estimated_cost` | NUMERIC(12,2) | DEFAULT 0 | |
| `completion_status` | ENUM | NULL | PASS, FAIL, INCOMPLETE |
| UNIQUE(`training_session_id`,`employee_id`) | — | | No duplicate enrolment |
| audit fields | — | | |

#### 5.2.19 `training_attendance`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_attendance_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `session_date` | DATE | NOT NULL | One row per training day |
| `attendance_status` | ENUM | NOT NULL | PRESENT, ABSENT, LATE, EXCUSED |
| `check_in_at` | TIMESTAMP | NULL | |
| `check_out_at` | TIMESTAMP | NULL | |
| `marked_by` | UUID | FK→employees/trainers, NOT NULL | |
| `evidence_document_id` | UUID | FK→documents, NULL | Signed sheet |
| UNIQUE(`training_nomination_id`,`session_date`) | — | | |
| audit fields | — | | |

#### 5.2.20 `training_assessments` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_assessment_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `assessment_phase` | ENUM | NOT NULL | PRE, POST, REASSESSMENT |
| `max_score` | NUMERIC(6,2) | NOT NULL | |
| `obtained_score` | NUMERIC(6,2) | NOT NULL | 0 ≤ obtained ≤ max |
| `pass_threshold` | NUMERIC(6,2) | NOT NULL | |
| `result` | ENUM | NOT NULL | PASS, FAIL |
| `assessed_by` | UUID | FK→employees/trainers, NOT NULL | |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.21 `training_feedback` (append-only, Kirkpatrick)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_feedback_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | NULL for trainer/org-level L4 |
| `training_session_id` | UUID | FK→training_sessions, NOT NULL | |
| `kirkpatrick_level` | ENUM | NOT NULL | L1_REACTION, L2_LEARNING, L3_BEHAVIOUR, L4_RESULTS |
| `rating` | NUMERIC(4,2) | NULL | 1–5 scale for L1 |
| `responses_json` | JSONB | NULL | Structured questionnaire |
| `submitted_by` | UUID | FK→employees, NULL | Anonymous-capable |
| `is_anonymous` | BOOLEAN | DEFAULT false | |
| `submitted_at` | TIMESTAMP | NOT NULL | |
| `created_at` | — | append-only | |

#### 5.2.22 `certifications`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `certification_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `certificate_no` | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable |
| `title` | VARCHAR(200) | NOT NULL | |
| `issuing_authority` | VARCHAR(150) | NOT NULL | |
| `issue_date` | DATE | NOT NULL | |
| `valid_until` | DATE | NULL | NULL = lifetime |
| `is_mandatory` | BOOLEAN | DEFAULT false | |
| `certificate_document_id` | UUID | FK→documents, NULL | |
| `sr_posting_status` | ENUM | NOT NULL | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `service_register_event_id` | UUID | FK→service_register_events, NULL | M12 ref after posting |
| `status` | ENUM | NOT NULL | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |
| audit fields | — | | |

#### 5.2.23 `training_budgets`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_budget_id` | UUID | PK | |
| `financial_year` | VARCHAR(9) | NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `skill_category_id` | UUID | FK→skill_categories, NULL | Optional categorisation |
| `allocated_amount` | NUMERIC(14,2) | NOT NULL | |
| `committed_amount` | NUMERIC(14,2) | DEFAULT 0 | Derived from approved nominations |
| `actual_spent_amount` | NUMERIC(14,2) | DEFAULT 0 | Derived from actual costs |
| `status` | ENUM | NOT NULL | DRAFT, APPROVED, CLOSED, FROZEN |
| UNIQUE(`financial_year`,`org_unit_id`,`skill_category_id`) | — | | |
| audit fields | — | | |

#### 5.2.24 `training_costs`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_cost_id` | UUID | PK | |
| `training_budget_id` | UUID | FK→training_budgets, NOT NULL | |
| `training_session_id` | UUID | FK→training_sessions, NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `cost_type` | ENUM | NOT NULL | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, OTHER |
| `amount` | NUMERIC(12,2) | NOT NULL | |
| `cost_stage` | ENUM | NOT NULL | COMMITTED, ACTUAL |
| `payable_to_payroll` | BOOLEAN | DEFAULT false | Reimbursement → M10 feed |
| `invoice_document_id` | UUID | FK→documents, NULL | |
| `status` | ENUM | NOT NULL | DRAFT, APPROVED, PAID, CANCELLED |
| audit fields | — | | |

#### 5.2.25 `learning_paths`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_path_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `target_competency_id` | UUID | FK→competencies, NULL | Goal |
| `target_designation_id` | UUID | FK→designations, NULL | Role aspiration |
| `is_recommended_engine` | BOOLEAN | DEFAULT false | AI-generated vs curated |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.26 `learning_path_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_path_item_id` | UUID | PK | |
| `learning_path_id` | UUID | FK→learning_paths, NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | |
| `sequence_order` | INT | NOT NULL | |
| `is_optional` | BOOLEAN | DEFAULT false | |
| UNIQUE(`learning_path_id`,`sequence_order`) | — | | |
| audit fields | — | | |

#### 5.2.27 `cpd_records` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `cpd_record_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `source_type` | ENUM | NOT NULL | TRAINING, CERTIFICATION, EXTERNAL_EVENT, SELF_LEARNING |
| `source_ref` | VARCHAR(64) | NULL | nomination/cert id |
| `credits` | NUMERIC(6,2) | NOT NULL | |
| `credit_year` | VARCHAR(9) | NOT NULL | |
| `verified_by` | UUID | FK→employees, NULL | |
| `awarded_at` | TIMESTAMP | NOT NULL | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.28 `lms_enrollments`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `lms_enrollment_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `lms_course_ref` | VARCHAR(120) | NOT NULL | |
| `lms_user_ref` | VARCHAR(120) | NOT NULL | |
| `standard` | ENUM | NOT NULL | SCORM_12, SCORM_2004, XAPI, NONE |
| `progress_pct` | NUMERIC(5,2) | DEFAULT 0 | 0–100 |
| `completion_status` | ENUM | NOT NULL | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |
| `score` | NUMERIC(6,2) | NULL | |
| `last_synced_at` | TIMESTAMP | NULL | |
| `lms_statement_id` | VARCHAR(120) | NULL | xAPI statement / idempotency key |
| audit fields | — | | |

### 5.3 Relationship map
```
skill_categories 1—* skills
skills *—* competencies (competencies.linked_skill_ids)
proficiency_levels 1—* (employee_skills, competency_model_items, skill_gap_items)
competency_models 1—* competency_model_items *—1 competencies
employees 1—* employee_skills *—1 skills
employees 1—* skill_assessments
employees 1—* skill_gap_analyses 1—* skill_gap_items *—1 competencies
skill_gap_items —> training_needs (source_ref)        [M08 appraisal gaps feed source=APPRAISAL]
training_needs *—* training_plan_items (via annual_training_plans)
annual_training_plans 1—* training_plan_items *—1 training_programs
training_programs 1—* training_sessions *—1 venues, *—1 trainers
training_sessions 1—* training_nominations *—1 employees, *—1 training_needs
training_nominations 1—* training_attendance
training_nominations 1—* training_assessments
training_nominations 1—* training_feedback (also session-level)
training_nominations 1—1 certifications (when applicable) —> service_register_events (M12)
training_nominations 1—1 lms_enrollments
training_budgets 1—* training_costs *—1 training_sessions/nominations
learning_paths 1—* learning_path_items *—1 training_programs
employees 1—* cpd_records
documents (M13) referenced by: skill_assessments, training_programs, training_attendance, certifications, training_costs
notifications, audit_log, workflow_instances/tasks referenced throughout
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations` | M01 | M07 (read) | M01 |
| `documents` | M13 | M07 | M07 stores refs; binaries M13 |
| `service_register_events` | M12 | M07 (read posted ref) | M07 appends training/qualification events |
| `notifications`, `audit_log`, `workflow_*` | Platform | M07 | M07 |
| Appraisal development gaps | M08 | M07 (read feed) | M08 |
| Payroll reimbursement payable | M10 | M10 | M07 emits feed |
| All `skill_*`, `competency_*`, `training_*`, `certifications`, `learning_*`, `cpd_*`, `lms_*` | **M07** | M14, M06 (certs), M08 | M07 |

### 5.5 Enum & reference catalog
| Enum | Values |
|---|---|
| `employment_status` (inherited M01) | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| master `status` (taxonomy/competency/program) | DRAFT, PUBLISHED, ARCHIVED / RETIRED |
| `competency_type` | TECHNICAL, BEHAVIOURAL, LEADERSHIP, FUNCTIONAL, COMPLIANCE |
| `scope_type` | DESIGNATION, CADRE, ROLE, ORG_UNIT, GENERIC |
| `employee_skills.source` | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `employee_skills.status` | DECLARED, VALIDATED, EXPIRED, REVOKED |
| `assessment_type` | SELF, MANAGER, TEST, EXTERNAL |
| `skill_gap_analyses.status` | DRAFT, FINALIZED, SUPERSEDED |
| `skill_gap_items.source` | MODEL, APPRAISAL, MANDATE |
| `training_needs.source` | GAP_ANALYSIS, APPRAISAL, MANDATORY, MANAGER, SELF, INDUCTION |
| `training_needs.priority` | LOW, MEDIUM, HIGH, CRITICAL |
| `training_needs.status` | IDENTIFIED, CONSOLIDATED, PLANNED, ADDRESSED, DEFERRED, REJECTED |
| `annual_training_plans.status` | DRAFT, SUBMITTED, APPROVED, ACTIVE, CLOSED |
| `delivery_mode` | CLASSROOM, ELEARNING, BLENDED, EXTERNAL, ON_THE_JOB, WEBINAR |
| `provider_type` | INTERNAL, EXTERNAL, VENDOR, GOVT_INSTITUTE |
| `training_sessions.status` | DRAFT, OPEN, FULL, RUNNING, COMPLETED, CANCELLED |
| `training_nominations.status` | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `attendance_status` | PRESENT, ABSENT, LATE, EXCUSED |
| `assessment_phase` | PRE, POST, REASSESSMENT |
| `kirkpatrick_level` | L1_REACTION, L2_LEARNING, L3_BEHAVIOUR, L4_RESULTS |
| `certifications.status` | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |
| `sr_posting_status` | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `cost_type` | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, OTHER |
| `cost_stage` | COMMITTED, ACTUAL |
| `lms standard` | SCORM_12, SCORM_2004, XAPI, NONE |
| `lms completion_status` | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |

### 5.6 Data integrity rules
1. **Proficiency ordering:** `skill_gap_items.gap_size = max(0, target.level_order − current.level_order)`; never negative.
2. **One current skill row:** `UNIQUE(employee_id, skill_id)` on `employee_skills`; history lives in `skill_assessments`.
3. **No duplicate enrolment:** `UNIQUE(training_session_id, employee_id)` on `training_nominations`.
4. **Capacity invariant:** `training_sessions.enrolled_count ≤ capacity`; beyond capacity → status WAITLISTED, not APPROVED.
5. **Score bounds:** `0 ≤ obtained_score ≤ max_score`; `result = PASS` iff `obtained_score ≥ pass_threshold`.
6. **Date sanity:** `training_sessions.end_date ≥ start_date`; `nomination_deadline ≤ start_date`; `certifications.valid_until > issue_date`.
7. **Budget non-overcommit:** an APPROVED nomination cost may not push `committed_amount > allocated_amount` unless budget status allows overrun (config); else CONFLICT.
8. **SR posting only when due:** `service_register_event_id` set only when `sr_posting_status = POSTED`; significant/mandatory certs require POSTED before status can become SUPERSEDED.
9. **Append-only ledgers:** `skill_assessments`, `training_assessments`, `training_feedback`, `cpd_records`, and SR events accept no UPDATE/DELETE.
10. **Segregation of duties:** `nominated_by ≠ approver`; budget `approved_by ≠ training_costs.created_by` for the same chain.
11. **Mandatory completion:** a mandatory program nomination cannot be CANCELLED by the employee; only L&D with reason.
12. **Referential currency:** an `employee_skill` with `expires_on < today` is auto-transitioned to EXPIRED by the nightly job.

### 5.7 Sample data (2–3 rows per representative entity)

**`skills`**
| skill_id | skill_category_id | code | name | is_compliance_skill | default_validity_months | status |
|---|---|---|---|---|---|---|
| s-1001 | sc-TECH | TECH-PG-SQL | PostgreSQL Administration | false | NULL | PUBLISHED |
| s-1002 | sc-COMPL | COMPL-CYBER | Cyber-Security Awareness | true | 12 | PUBLISHED |
| s-1003 | sc-BEHAV | BEHAV-COMM | Written Communication | false | NULL | PUBLISHED |

**`proficiency_levels`**
| proficiency_level_id | level_order | code | name |
|---|---|---|---|
| pl-1 | 1 | L1 | Awareness |
| pl-3 | 3 | L3 | Proficient |
| pl-5 | 5 | L5 | Expert |

**`competency_models`**
| competency_model_id | code | name | scope_type | designation_id | effective_from | version | status |
|---|---|---|---|---|---|---|---|
| cm-9001 | CM-AAO | Asst. Accounts Officer Model | DESIGNATION | desg-AAO | 2026-04-01 | 1 | PUBLISHED |
| cm-9002 | CM-SYSADM | System Administrator Model | DESIGNATION | desg-SADM | 2026-04-01 | 2 | PUBLISHED |

**`employee_skills`**
| employee_skill_id | employee_id | skill_id | current_proficiency_level_id | source | status | expires_on |
|---|---|---|---|---|---|---|
| es-5001 | emp-3001 | s-1001 | pl-3 | ASSESSMENT | VALIDATED | NULL |
| es-5002 | emp-3001 | s-1002 | pl-1 | CERTIFICATION | VALIDATED | 2026-07-15 |
| es-5003 | emp-3002 | s-1003 | pl-3 | SELF | DECLARED | NULL |

**`training_needs`**
| training_need_id | employee_id | competency_id | source | priority | financial_year | status |
|---|---|---|---|---|---|---|
| tn-7001 | emp-3001 | comp-SQL | GAP_ANALYSIS | HIGH | 2026-2027 | CONSOLIDATED |
| tn-7002 | emp-3002 | comp-COMM | APPRAISAL | MEDIUM | 2026-2027 | PLANNED |
| tn-7003 | NULL (org-unit ou-12) | comp-CYBER | MANDATORY | CRITICAL | 2026-2027 | PLANNED |

**`training_programs`**
| training_program_id | code | title | delivery_mode | provider_type | is_mandatory | duration_hours | certification_on_completion | status |
|---|---|---|---|---|---|---|---|---|
| tp-2001 | TP-CYBER-101 | Cyber-Security Essentials | ELEARNING | INTERNAL | true | 4 | true | PUBLISHED |
| tp-2002 | TP-SQL-201 | Advanced PostgreSQL | CLASSROOM | EXTERNAL | false | 24 | true | PUBLISHED |
| tp-2003 | TP-INDUCT-001 | New Entrant Induction | BLENDED | INTERNAL | true | 40 | false | PUBLISHED |

**`training_sessions`**
| training_session_id | training_program_id | batch_code | start_date | end_date | capacity | enrolled_count | status |
|---|---|---|---|---|---|---|---|
| ts-3001 | tp-2002 | SQL201-B01 | 2026-08-10 | 2026-08-12 | 25 | 20 | OPEN |
| ts-3002 | tp-2001 | CYBER-B07 | 2026-07-01 | 2026-07-01 | 500 | 480 | RUNNING |

**`training_nominations`**
| training_nomination_id | training_session_id | employee_id | training_need_id | nomination_type | status | estimated_cost |
|---|---|---|---|---|---|---|
| nm-4001 | ts-3001 | emp-3001 | tn-7001 | MANAGER | APPROVED | 8000.00 |
| nm-4002 | ts-3002 | emp-3002 | tn-7003 | MANDATORY | APPROVED | 0.00 |

**`certifications`**
| certification_id | employee_id | certificate_no | title | issue_date | valid_until | is_mandatory | sr_posting_status | status |
|---|---|---|---|---|---|---|---|---|
| ct-6001 | emp-3001 | CERT-2026-000123 | Advanced PostgreSQL | 2026-08-12 | NULL | false | POSTED | ACTIVE |
| ct-6002 | emp-3002 | CERT-2026-000456 | Cyber-Security Essentials | 2026-07-01 | 2027-07-01 | true | POSTED | ACTIVE |

**`training_budgets`**
| training_budget_id | financial_year | org_unit_id | allocated_amount | committed_amount | actual_spent_amount | status |
|---|---|---|---|---|---|---|
| tb-8001 | 2026-2027 | ou-12 | 5000000.00 | 1200000.00 | 350000.00 | APPROVED |
| tb-8002 | 2026-2027 | ou-15 | 2000000.00 | 0.00 | 0.00 | DRAFT |

---

## 6. Functional Requirements

> Each FR follows: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, Low-Level Design table.

---

### FR-TSD-001 — Skill Taxonomy & Competency Framework Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager/SysAdmin (publish/approve), Auditor (read)
- **User Story:** As an L&D Officer, I want to define and publish a governed skill taxonomy and competency catalog so that all downstream skill and training processes use a single controlled vocabulary.
- **Description:** CRUD for `skill_categories`, `skills`, `competencies`, and `proficiency_levels` with a DRAFT→PUBLISHED→ARCHIVED lifecycle. Publication requires maker-checker. Compliance skills carry a default validity used to drive renewal.
- **Acceptance Criteria:**
  1. An L&D Officer can create categories, skills, competencies, and proficiency levels in DRAFT.
  2. Publication of any master record requires L&D Manager approval via the workflow engine.
  3. PUBLISHED records cannot have their `code` changed; only ARCHIVE or new version.
  4. A skill flagged `is_compliance_skill=true` must have `default_validity_months` set.
  5. Archiving a category is blocked if it has PUBLISHED child skills (CONFLICT).
- **Business Rules:**
  - `code` is globally unique per entity and immutable once PUBLISHED.
  - Proficiency levels are globally ordered (`level_order` unique, contiguous, ascending).
  - A competency may compose 0..N skills; deleting a skill referenced by a PUBLISHED competency is blocked.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `skill_categories` | C/R/U/Archive |
  | `skills` | C/R/U/Archive |
  | `competencies` | C/R/U/Archive |
  | `proficiency_levels` | C/R/U/Archive |
  | `audit_log`, `workflow_instances` | Write |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/skills`, `/api/v1/competencies`, `/api/v1/skill-categories`, `/api/v1/proficiency-levels` |
  | PATCH | `/api/v1/skills/{id}` (incl. `:publish`, `:archive`) |
  | GET | `/api/v1/skills?categoryId=&status=` (paginated) |
- **UI Behavior Notes:** Tree view of categories→skills; competency builder with skill multi-select; publish action shows confirmation and routes to checker. Status badges. Inline validation for compliance validity.
- **Edge Cases:** Duplicate `code` (409 RESOURCE_CONFLICT); archiving in-use master (409 IN_USE); reordering proficiency levels that are already referenced (allowed but warns, recomputes gaps lazily).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `TaxonomyController`, `CompetencyService`, `MasterDataPublisher`, `WorkflowClient` |
  | Backend Flow | Validate → persist DRAFT → on publish, create workflow_instance → on approval, set PUBLISHED + audit |
  | Data Operations | Insert/update master tables; FK integrity checks before archive |
  | Validation | Unique/immutable `code`; compliance-validity required; contiguous level order |
  | Authorization | L&D Officer create/update; L&D Manager/SysAdmin publish; row scope = global master (SysAdmin) |
  | State Changes & Side Effects | DRAFT→PUBLISHED→ARCHIVED; publish notifies subscribers; gap caches invalidated |
  | Failure Handling | 409 on duplicate/in-use; 422 on missing validity; rollback on workflow failure |
  | Dependencies | Workflow engine, audit_log, notifications |
  | Test Guidance | Unit: code immutability, level ordering; Integration: publish workflow; Negative: archive in-use |

---

### FR-TSD-002 — Role-Based Competency Models & Proficiency Targets
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager (approve)
- **User Story:** As an L&D Officer, I want to build versioned competency models mapped to designations/cadres/roles with target proficiency levels so that skill gaps can be measured objectively.
- **Description:** Create `competency_models` with `competency_model_items` (competency + target proficiency + weight + critical flag), scoped by designation/cadre/role/org-unit/generic, with effective dating and versioning.
- **Acceptance Criteria:**
  1. A model can be scoped to a designation, cadre, role, org-unit, or generic; exactly one scope key matches the scope_type.
  2. Each item references a PUBLISHED competency and a valid proficiency target.
  3. Publishing a new version supersedes the prior version for the same scope on `effective_from`.
  4. A given employee resolves to exactly one effective model (most specific scope wins).
- **Business Rules:**
  - Effective periods for the same scope+version cannot overlap.
  - Scope resolution precedence: DESIGNATION > ROLE > CADRE > ORG_UNIT > GENERIC.
  - Weights within a model are used for weighted gap scoring; default 1.0.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `competency_models` | C/R/U/Version |
  | `competency_model_items` | C/R/U/D |
  | `competencies`, `proficiency_levels` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/competency-models` |
  | POST | `/api/v1/competency-models/{id}/items` |
  | POST | `/api/v1/competency-models/{id}:publish` |
  | GET | `/api/v1/employees/{empId}/effective-competency-model` |
- **UI Behavior Notes:** Model editor grid (competency, target level dropdown, weight, critical toggle); scope selector with dependent fields; version timeline; "resolve for employee" preview.
- **Edge Cases:** Overlapping effective periods (409); no model resolves for an employee (returns GENERIC fallback or 404 with guidance); duplicate competency in a model (409).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CompetencyModelService`, `ScopeResolver`, `ModelVersioner` |
  | Backend Flow | Validate scope → persist header+items DRAFT → publish creates version, closes prior effective_to |
  | Data Operations | Insert model+items; unique(model,competency); effective-date range check |
  | Validation | Single scope key; published competency refs; non-overlap |
  | Authorization | L&D Officer maker; L&D Manager approve |
  | State Changes & Side Effects | New PUBLISHED version supersedes prior; invalidates gap caches |
  | Failure Handling | 409 overlap/duplicate; 422 invalid scope |
  | Dependencies | FR-TSD-001 masters |
  | Test Guidance | Scope precedence matrix; versioning supersession; weighted-score inputs |

---

### FR-TSD-003 — Employee Skill Inventory & Assessment
- **Module:** M07-TSD
- **Primary Role(s):** Employee (self-assess), Reporting Manager (validate), L&D Officer
- **User Story:** As an employee, I want to declare and maintain my skills with proficiency levels, and have my manager validate them, so that my skill profile is accurate and trusted.
- **Description:** Maintain `employee_skills` (one current row per skill) with full history in `skill_assessments`. Sources: self, manager, test, certification, import. Validation transitions DECLARED→VALIDATED. Currency/expiry tracked for renewable skills.
- **Acceptance Criteria:**
  1. An employee can add/update a skill with a self-assessed proficiency level (status DECLARED).
  2. A manager can validate or adjust the proficiency (status VALIDATED, records validator + timestamp).
  3. Every change appends an immutable `skill_assessments` row.
  4. A skill acquired via a PUBLISHED certificate auto-populates with source=CERTIFICATION and `expires_on` from cert validity.
  5. Skills past `expires_on` auto-transition to EXPIRED nightly.
- **Business Rules:**
  - `UNIQUE(employee_id, skill_id)`; updates overwrite the current row, never duplicate.
  - Only the manager-of-record or L&D may VALIDATE; self-validation forbidden.
  - Evidence document optional for self, recommended for EXTERNAL.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `employee_skills` | C/R/U |
  | `skill_assessments` | Append |
  | `documents`, `employees`, `skills`, `proficiency_levels` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/employees/{empId}/skills` |
  | POST | `/api/v1/employees/{empId}/skills` |
  | PATCH | `/api/v1/employees/{empId}/skills/{skillId}` |
  | POST | `/api/v1/employees/{empId}/skills/{skillId}:validate` |
- **UI Behavior Notes:** Skill card grid with proficiency meter, source/validation badge, expiry chip; manager "validate" inline action; evidence upload; expired skills visually flagged red.
- **Edge Cases:** Manager validates a skill not declared (creates VALIDATED row source=MANAGER); concurrent self+manager edit (last write wins on current row, both appended to history); expiry on weekend handled by nightly job.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SkillInventoryService`, `AssessmentLedger`, `ExpiryJob`, `CertSkillSync` |
  | Backend Flow | Upsert current row → append assessment → emit event for gap recompute |
  | Data Operations | Upsert employee_skills; insert skill_assessments; nightly batch expiry update |
  | Validation | One row per (emp,skill); validator ≠ employee; level valid |
  | Authorization | Self for own DECLARE; manager/L&D for VALIDATE; row scope by org subtree |
  | State Changes & Side Effects | DECLARED→VALIDATED→EXPIRED/REVOKED; triggers gap recompute |
  | Failure Handling | 403 self-validate; 409 stale-version (optimistic lock) |
  | Dependencies | FR-TSD-001/002; FR-TSD-012 cert sync |
  | Test Guidance | History append count; expiry job; cert→skill propagation |

---

### FR-TSD-004 — Skill-Gap Analysis (Model + Appraisal Reconciliation)
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, Reporting Manager, Employee (own)
- **User Story:** As an L&D Officer, I want to compute each employee's skill gaps against their effective competency model and reconcile them with appraisal development gaps from M08 so that training needs are evidence-based.
- **Description:** Generate `skill_gap_analyses` + `skill_gap_items` by comparing the resolved competency model targets to the employee's current validated skills, then merging M08 development gaps (source=APPRAISAL) and statutory mandates (source=MANDATE). Produces weighted gap score and critical-gap count.
- **Acceptance Criteria:**
  1. Gap analysis resolves the employee's effective model and computes `gap_size = max(0, target − current)` per competency.
  2. Appraisal development gaps for the latest cycle are imported and merged (no duplicates by competency).
  3. Mandatory/compliance competencies the employee lacks appear as MANDATE-source gaps regardless of model.
  4. Finalizing a new analysis supersedes the prior FINALIZED one for the employee.
  5. Each gap item can be one-click converted into a `training_need` (FR-TSD-005).
- **Business Rules:**
  - Only VALIDATED `employee_skills` count toward closing a gap (DECLARED-only does not).
  - Critical gap = `is_critical` competency with `gap_size ≥ 1`.
  - If M08 feed is unavailable, analysis proceeds with model+mandate sources and flags `appraisal_cycle_ref=UNAVAILABLE`.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `skill_gap_analyses`, `skill_gap_items` | C/R |
  | `competency_models`, `employee_skills`, `proficiency_levels` | R |
  | M08 appraisal-gap feed | R (external) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/employees/{empId}/skill-gap-analyses` |
  | GET | `/api/v1/employees/{empId}/skill-gap-analyses/latest` |
  | POST | `/api/v1/skill-gap-items/{id}:convert-to-need` |
- **UI Behavior Notes:** Radar/heatmap of target vs current; gap list sortable by criticality; "create training need" buttons; source legend (model/appraisal/mandate); manager team-rollup view.
- **Edge Cases:** No effective model (uses GENERIC, warns); M08 down (degraded mode); employee has higher-than-target proficiency (gap 0, surplus highlighted for marketplace FR-TSD-014).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `GapEngine`, `AppraisalFeedClient`, `MandateResolver` |
  | Backend Flow | Resolve model → diff skills → fetch M08 gaps → merge+dedupe → persist snapshot → finalize supersedes |
  | Data Operations | Insert analysis+items; mark prior SUPERSEDED |
  | Validation | gap_size ≥ 0; dedupe by competency; only VALIDATED skills close gaps |
  | Authorization | L&D/manager for team; employee own read |
  | State Changes & Side Effects | DRAFT→FINALIZED→SUPERSEDED; emits need-candidate events |
  | Failure Handling | M08 timeout → degraded mode (503 logged, not surfaced as failure) |
  | Dependencies | FR-TSD-002/003; M08-PAM feed |
  | Test Guidance | Merge/dedupe correctness; degraded mode; critical-count math |

---

### FR-TSD-005 — Training Needs Identification & Consolidation
- **Module:** M07-TSD
- **Primary Role(s):** Reporting Manager, L&D Officer, L&D Manager (prioritise)
- **User Story:** As an L&D Officer, I want to capture, consolidate, and prioritise individual and group training needs from gaps, appraisals, mandates, and manager input so that the annual plan is demand-driven.
- **Description:** Manage `training_needs` from multiple sources, deduplicate at individual/group level, prioritise, and roll up by org-unit/competency for plan input. Supports consolidation of identical needs across employees into a group need.
- **Acceptance Criteria:**
  1. Needs can be created from a gap item, an appraisal gap, a mandate, manager input, self request, or induction.
  2. The system surfaces duplicate needs (same employee+competency, same FY) and prevents duplicates.
  3. L&D can consolidate multiple individual needs into a group need with a participant list.
  4. Needs carry a priority and a financial year and flow to status CONSOLIDATED then PLANNED.
- **Business Rules:**
  - Mandatory-source needs cannot be REJECTED, only DEFERRED with justification.
  - Group needs reference an org_unit and an implicit participant set (the consolidated individual needs).
  - Priority is derived-suggested (CRITICAL if from a critical gap or mandate) but L&D may override with reason.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_needs` | C/R/U |
  | `skill_gap_items` | R (source) |
  | `org_units`, `competencies` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-needs` |
  | GET | `/api/v1/training-needs?fy=&orgUnitId=&priority=&status=` |
  | POST | `/api/v1/training-needs:consolidate` |
- **UI Behavior Notes:** Needs inbox with source filters; consolidation wizard grouping by competency; priority editor; FY selector; duplicate warning banner.
- **Edge Cases:** Same need from gap and mandate (merged, source=MANDATE wins); consolidating across org-units (blocked, scope mismatch); deferring a critical mandatory need requires manager+L&D dual sign-off.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NeedService`, `Consolidator`, `DuplicateGuard` |
  | Backend Flow | Validate source → dedupe check → persist → consolidate creates group need linking individuals |
  | Data Operations | Insert/update training_needs; unique(emp,competency,fy) soft guard |
  | Validation | Mandatory cannot be rejected; same-FY dedupe |
  | Authorization | Manager creates for team; L&D consolidates/prioritises |
  | State Changes & Side Effects | IDENTIFIED→CONSOLIDATED→PLANNED→ADDRESSED/DEFERRED/REJECTED |
  | Failure Handling | 409 duplicate; 403 reject-mandatory |
  | Dependencies | FR-TSD-004 |
  | Test Guidance | Dedupe; consolidation participant set; mandatory-defer dual sign-off |

---

### FR-TSD-006 — Annual Training Calendar, Plan & Budget Allocation
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (build), L&D Manager (approve), Dept Head/Finance (sanction)
- **User Story:** As an L&D Manager, I want to build and approve an annual training plan and calendar with budget allocation per org-unit so that delivery is governed and funded.
- **Description:** Compose `annual_training_plans` with `training_plan_items` from consolidated needs, allocate `training_budgets`, and publish a quarter-bucketed calendar. Plan moves DRAFT→SUBMITTED→APPROVED→ACTIVE→CLOSED.
- **Acceptance Criteria:**
  1. A plan can pull consolidated needs and propose plan items with target audience, man-days, and budget.
  2. Plan total budget must reconcile to allocated `training_budgets` for the FY/org-unit.
  3. Approval requires L&D Manager; budget sanction requires Finance/Dept Head per policy.
  4. Once APPROVED→ACTIVE, sessions can be scheduled against plan items.
  5. A read-only annual calendar view aggregates sessions by quarter and org-unit.
- **Business Rules:**
  - `UNIQUE(financial_year, org_unit_id)` per plan.
  - Sum of `training_plan_items.planned_budget` must be ≤ allocated budget (overrun requires explicit approval flag).
  - Closing a plan requires all items COMPLETED or DROPPED.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `annual_training_plans`, `training_plan_items` | C/R/U |
  | `training_budgets` | C/R/U |
  | `training_needs` | R/U (→PLANNED) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/annual-training-plans` |
  | POST | `/api/v1/annual-training-plans/{id}/items` |
  | POST | `/api/v1/annual-training-plans/{id}:submit` / `:approve` |
  | GET | `/api/v1/training-calendar?fy=&orgUnitId=` |
- **UI Behavior Notes:** Plan builder with needs picker; budget reconciliation bar (allocated vs planned); quarter calendar (Gantt-style) view; approval workflow stepper.
- **Edge Cases:** Plan exceeds budget (block unless overrun flag + dual approval); needs added after approval (amendment workflow, version note); FY rollover copies recurring mandatory programs.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PlanService`, `BudgetReconciler`, `CalendarProjector` |
  | Backend Flow | Build draft from needs → reconcile budget → submit→approve workflow → activate |
  | Data Operations | Insert plan+items+budgets; update needs to PLANNED |
  | Validation | Unique fy+org; budget sum ≤ allocated; close requires terminal items |
  | Authorization | L&D build; L&D Mgr approve; Finance sanction |
  | State Changes & Side Effects | DRAFT→SUBMITTED→APPROVED→ACTIVE→CLOSED; commits budget |
  | Failure Handling | 409 duplicate plan; 422 budget overrun without flag |
  | Dependencies | FR-TSD-005, FR-TSD-016 budget |
  | Test Guidance | Budget reconciliation; approval gating; calendar aggregation |

---

### FR-TSD-007 — Course Catalog & Training Program Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager (publish)
- **User Story:** As an L&D Officer, I want to maintain a catalog of training programs (internal, external, e-learning, blended, micro-learning) with outcomes, certification rules, and cost so that sessions and learning paths can be built from reusable programs.
- **Description:** CRUD for `training_programs` with delivery mode, provider type, mandatory/induction flags, linked competencies (outcomes), CPD credits, certification-on-completion + validity, default cost and capacity, materials, and LMS course reference.
- **Acceptance Criteria:**
  1. A program defines delivery mode, provider type, duration, and outcome competencies.
  2. Mandatory/induction flags are settable; mandatory programs must link ≥1 compliance competency.
  3. `certification_on_completion=true` requires a `cert_validity_months` (NULL = lifetime allowed only if explicitly chosen).
  4. E-learning programs require an `lms_course_ref` and a SCORM/xAPI standard.
  5. Retiring a program is blocked if it has OPEN/RUNNING sessions.
- **Business Rules:**
  - `code` unique and immutable once PUBLISHED.
  - CPD credits ≥ 0; default cost ≥ 0.
  - Linked competencies must be PUBLISHED.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_programs` | C/R/U/Retire |
  | `competencies`, `documents` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-programs` |
  | GET | `/api/v1/training-programs?mode=&provider=&mandatory=&q=` |
  | PATCH | `/api/v1/training-programs/{id}` (`:publish`,`:retire`) |
- **UI Behavior Notes:** Catalog grid + cards with filters; program editor with outcome competency picker, materials upload, LMS link, cost; mandatory/induction toggles surface dependent fields.
- **Edge Cases:** E-learning without LMS ref (422); retire with active sessions (409); duplicate code (409).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ProgramService`, `LmsLinkValidator` |
  | Backend Flow | Validate → persist DRAFT → publish via workflow → catalog index update |
  | Data Operations | Insert/update training_programs; FK checks on retire |
  | Validation | Unique code; mandatory→compliance competency; e-learning→lms ref |
  | Authorization | L&D maker; L&D Mgr publish |
  | State Changes & Side Effects | DRAFT→PUBLISHED→RETIRED; feeds learning paths and sessions |
  | Failure Handling | 409 in-use retire; 422 missing dependent fields |
  | Dependencies | FR-TSD-001; FR-TSD-015 LMS |
  | Test Guidance | Mandatory rule; LMS-ref requirement; retire guard |

---

### FR-TSD-008 — Session/Batch Scheduling, Trainer & Venue Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, Trainer (view)
- **User Story:** As an L&D Officer, I want to schedule sessions/batches of a program and manage trainers and venues with capacity so that delivery is logistically sound and conflict-free.
- **Description:** CRUD `training_sessions` (batch, dates, mode, venue/online URL, trainer, capacity, nomination deadline), plus `trainers` and `venues` master management with conflict detection (trainer/venue double-booking).
- **Acceptance Criteria:**
  1. A session links to a PUBLISHED program and sets capacity, dates, mode, and nomination deadline.
  2. The system prevents scheduling a trainer or venue with an overlapping confirmed session (conflict).
  3. `end_date ≥ start_date` and `nomination_deadline ≤ start_date`.
  4. Online sessions require a meeting URL; classroom sessions require a venue with sufficient capacity.
  5. Cancelling a session cascades notifications and frees nominations to WITHDRAWN/re-nominate.
- **Business Rules:**
  - `batch_code` unique.
  - Venue capacity ≥ session capacity for PHYSICAL.
  - Trainer must have at least one matching expertise skill (warning, not hard block).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_sessions` | C/R/U/Cancel |
  | `trainers`, `venues` | C/R/U |
  | `training_programs` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sessions` |
  | GET | `/api/v1/training-sessions?programId=&status=&from=&to=` |
  | POST | `/api/v1/training-sessions/{id}:cancel` |
  | POST | `/api/v1/trainers`, `/api/v1/venues` |
- **UI Behavior Notes:** Scheduling calendar with drag-to-create; conflict warnings inline; capacity meter; trainer/venue pickers with availability; cancel dialog requiring reason.
- **Edge Cases:** Double-booking (409 SCHEDULE_CONFLICT); over-capacity venue (422); cancel a RUNNING session (allowed with reason, attendance preserved).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SessionService`, `ConflictDetector`, `ResourceCalendar` |
  | Backend Flow | Validate dates+resources → conflict check → persist → emit calendar event |
  | Data Operations | Insert session; lock trainer/venue slots; update on cancel |
  | Validation | Date order; deadline ≤ start; capacity ≤ venue; unique batch |
  | Authorization | L&D Officer; Trainer read-own |
  | State Changes & Side Effects | DRAFT→OPEN→FULL→RUNNING→COMPLETED/CANCELLED; notifications on cancel |
  | Failure Handling | 409 conflict; 422 capacity/date; rollback partial |
  | Dependencies | FR-TSD-007; notifications |
  | Test Guidance | Conflict matrix; capacity rules; cancel cascade |

---

### FR-TSD-009 — Nomination & Multi-Level Approval Workflow
- **Module:** M07-TSD
- **Primary Role(s):** Employee (self), Reporting Manager (L1), L&D Manager (L2), L&D Officer
- **User Story:** As a manager, I want to nominate employees (or approve self-nominations) for sessions through a maker-checker workflow with budget checks and capacity/waitlist handling so that enrolment is controlled and funded.
- **Description:** Create `training_nominations` linked to a session and (ideally) a `training_need`, routed through the workflow engine: SELF/MANAGER/HR/MANDATORY/INDUCTION types, L1 (manager) and L2 (L&D Manager) approvals, budget commitment, capacity enforcement with waitlist.
- **Acceptance Criteria:**
  1. An employee can self-nominate; a manager can nominate reports; L&D/HR can nominate anyone in scope.
  2. Nomination routes PENDING_L1→PENDING_L2→APPROVED; mandatory/induction may auto-approve per policy.
  3. On APPROVED, capacity is decremented; if full, nomination becomes WAITLISTED.
  4. Approval commits estimated cost to the org-unit budget (FR-TSD-016); insufficient budget blocks approval unless overrun-approved.
  5. Withdrawal before the nomination deadline frees a seat and promotes the next waitlisted nomination.
- **Business Rules:**
  - `nominated_by ≠ approver` at each level (segregation of duties).
  - `UNIQUE(session, employee)` — no double nomination.
  - Mandatory nominations cannot be self-withdrawn; only L&D with reason.
  - Waitlist promotion is FIFO by nomination timestamp.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_nominations` | C/R/U |
  | `training_sessions` | R/U (counts) |
  | `workflow_instances`/`tasks` | C/U |
  | `training_budgets` | R/U (commit) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sessions/{id}/nominations` |
  | POST | `/api/v1/nominations/{id}:approve` / `:reject` / `:withdraw` |
  | GET | `/api/v1/nominations?employeeId=&status=&sessionId=` |
- **UI Behavior Notes:** Nominate dialog with need linkage and cost preview; approver task inbox; capacity/waitlist indicator; budget-impact banner; SoD prevents self-approve (button hidden).
- **Edge Cases:** Approve when full (auto-waitlist); budget exhausted (409 BUDGET_EXCEEDED unless override); employee on leave/transferred mid-flow (flag, allow L&D decision); duplicate nomination (409).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NominationService`, `ApprovalWorkflow`, `CapacityManager`, `BudgetCommitter` |
  | Backend Flow | Create → workflow L1→L2 → on approve: capacity check (transaction) → commit budget → set APPROVED/WAITLISTED |
  | Data Operations | Insert nomination; atomic update enrolled_count; update committed_amount |
  | Validation | SoD; unique(session,emp); budget availability; deadline for withdraw |
  | Authorization | Self/manager/L&D create; manager L1; L&D Mgr L2 |
  | State Changes & Side Effects | DRAFT→PENDING_L1→PENDING_L2→APPROVED/WAITLISTED/REJECTED→WITHDRAWN/COMPLETED/NO_SHOW; notifications |
  | Failure Handling | 409 budget/duplicate/capacity race (optimistic lock retry); rollback on partial |
  | Dependencies | FR-TSD-008, FR-TSD-016; workflow engine |
  | Test Guidance | SoD enforcement; capacity race; waitlist FIFO; budget commit/rollback |

---

### FR-TSD-010 — Attendance Capture
- **Module:** M07-TSD
- **Primary Role(s):** Trainer, L&D Officer
- **User Story:** As a trainer, I want to mark per-day attendance for a session's roster so that completion and certification can be determined accurately.
- **Description:** Capture `training_attendance` per nomination per session-day (PRESENT/ABSENT/LATE/EXCUSED) with optional check-in/out times and a signed-sheet document. Drives completion eligibility and NO_SHOW detection.
- **Acceptance Criteria:**
  1. Trainer/L&D can mark attendance for each enrolled (APPROVED) nomination per session day.
  2. One attendance record per nomination per day (`UNIQUE`).
  3. Attendance below the program's minimum threshold marks the nomination ineligible for certification.
  4. A fully-absent nomination is auto-marked NO_SHOW at session completion.
  5. For e-learning, attendance is derived from LMS progress (FR-TSD-015) rather than manual marking.
- **Business Rules:**
  - Attendance can only be marked for sessions in RUNNING/COMPLETED state.
  - Minimum attendance % (default 80) is configurable per program.
  - EXCUSED days are excluded from the attendance-percentage denominator.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_attendance` | C/R/U |
  | `training_nominations` | R/U (completion) |
  | `documents` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/sessions/{id}/attendance` (bulk per day) |
  | GET | `/api/v1/sessions/{id}/attendance?date=` |
  | PATCH | `/api/v1/attendance/{id}` |
- **UI Behavior Notes:** Roster grid with day columns; bulk "mark all present"; per-cell status; upload signed sheet; attendance-% summary; locked once session COMPLETED (correction via L&D with audit).
- **Edge Cases:** Marking attendance for non-approved nomination (403); duplicate day mark (409 upsert); session spanning weekends/holidays (only configured training days counted).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceService`, `CompletionEvaluator` |
  | Backend Flow | Validate session state → upsert per-day records → recompute attendance% → set completion eligibility |
  | Data Operations | Upsert training_attendance; update nomination on completion |
  | Validation | Session RUNNING/COMPLETED; unique(nom,date); EXCUSED denominator rule |
  | Authorization | Trainer for own session; L&D any; row scope |
  | State Changes & Side Effects | Drives nomination COMPLETED/NO_SHOW; cert eligibility flag |
  | Failure Handling | 403 non-roster; 409 duplicate; 422 wrong state |
  | Dependencies | FR-TSD-009; FR-TSD-015 (e-learning) |
  | Test Guidance | Threshold math; EXCUSED handling; NO_SHOW auto-mark |

---

### FR-TSD-011 — Assessment (Pre/Post) & Kirkpatrick Evaluation
- **Module:** M07-TSD
- **Primary Role(s):** Trainer, L&D Officer, Employee (feedback)
- **User Story:** As a trainer, I want to record pre/post assessment scores and collect Kirkpatrick L1–L4 feedback so that learning effectiveness and impact are measurable.
- **Description:** Append-only `training_assessments` (PRE/POST/REASSESSMENT with score, threshold, result) and `training_feedback` across Kirkpatrick levels (L1 reaction, L2 learning, L3 behaviour, L4 results), with anonymous-capable participant feedback and trainer-rating derivation.
- **Acceptance Criteria:**
  1. Pre and post assessments can be recorded per nomination; POST result drives completion PASS/FAIL.
  2. Learning gain = POST − PRE score is computed and reportable.
  3. Participants can submit L1/L2 feedback (anonymous-capable); L3/L4 captured later by L&D/manager.
  4. Trainer `avg_feedback_rating` is derived from L1 ratings.
  5. A nomination with POST result FAIL is ineligible for certification (re-assessment allowed).
- **Business Rules:**
  - `0 ≤ obtained_score ≤ max_score`; `result=PASS` iff `obtained ≥ pass_threshold`.
  - Feedback ledger is append-only and anonymisable (no `submitted_by` exposure when anonymous).
  - L4 (results) feedback can be session/org-level (nomination NULL).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_assessments` | Append |
  | `training_feedback` | Append |
  | `training_nominations` | R/U (completion) |
  | `trainers` | U (rating) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/nominations/{id}/assessments` |
  | POST | `/api/v1/sessions/{id}/feedback` |
  | GET | `/api/v1/sessions/{id}/evaluation-summary` |
- **UI Behavior Notes:** Score entry grid (pre/post columns, auto pass/fail); learning-gain chart; feedback form (Likert + free text) with anonymity toggle; trainer scorecard; Kirkpatrick dashboard.
- **Edge Cases:** Post without pre (gain not computable, flagged); anonymous feedback (PII stripped); re-assessment after fail (new append row, completion recomputed).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AssessmentLedger`, `FeedbackService`, `KirkpatrickAggregator`, `TrainerRatingJob` |
  | Backend Flow | Append assessment → compute result → update completion → feedback append → nightly trainer rating |
  | Data Operations | Insert assessments/feedback (append-only); update nomination/trainer derived fields |
  | Validation | Score bounds; threshold; anonymity enforcement |
  | Authorization | Trainer/L&D scores; participant feedback own; anonymity protected |
  | State Changes & Side Effects | POST→completion PASS/FAIL; drives certification eligibility |
  | Failure Handling | 422 score bounds; append-only (no update on ledger) |
  | Dependencies | FR-TSD-010, FR-TSD-012 |
  | Test Guidance | Pass/fail logic; learning gain; anonymity; trainer rating math |

---

### FR-TSD-012 — Certification, Validity & Renewal; Mandatory Compliance Tracking
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (issue), L&D Manager (approve revoke)
- **User Story:** As an L&D Officer, I want to issue certificates on successful completion, track validity and renewals, and monitor mandatory-compliance currency so that statutory training obligations are always met.
- **Description:** Issue `certifications` on completion (attendance + POST pass), generate certificate numbers and PDFs (M13), track `valid_until` and renewal reminders, auto-expire, support revocation (workflow), and produce a mandatory-compliance currency view across the workforce.
- **Acceptance Criteria:**
  1. A certificate issues only when the nomination is COMPLETED with attendance threshold met and POST=PASS (where applicable).
  2. `certificate_no` is unique and immutable; a PDF document is generated and stored via M13.
  3. Certificates with `valid_until` past today auto-transition to EXPIRED nightly and notify the employee/manager.
  4. Renewal reminders fire at configurable lead times (e.g., 60/30/7 days before expiry).
  5. A mandatory-compliance dashboard shows each employee's required vs held vs lapsed mandatory certs.
- **Business Rules:**
  - Revocation requires L&D Manager approval and a reason; sets status REVOKED and (if posted) flags an SR correction.
  - Issuing a renewable cert updates the linked `employee_skill.expires_on`.
  - Significant/mandatory certs trigger SR posting (FR-TSD-016) with `sr_posting_status=PENDING`.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `certifications` | C/R/U |
  | `documents` | C (PDF) |
  | `employee_skills` | U (expiry) |
  | `service_register_events` | (via FR-016) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/nominations/{id}:issue-certificate` |
  | GET | `/api/v1/employees/{empId}/certifications` |
  | POST | `/api/v1/certifications/{id}:revoke` |
  | GET | `/api/v1/compliance/mandatory-status?orgUnitId=` |
- **UI Behavior Notes:** Certificate issue action with eligibility check; certificate viewer/download; expiry timeline; renewal reminder banners; compliance heatmap by org-unit with drill-down.
- **Edge Cases:** Issue when ineligible (403 with reasons); duplicate issue (409, one cert per nomination); revoke a posted cert (workflow + SR correction event); lifetime cert (`valid_until` NULL — never expires).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CertificationService`, `CertPdfGenerator`, `ExpiryReminderJob`, `ComplianceTracker` |
  | Backend Flow | Verify eligibility → generate no+PDF → persist → update skill expiry → enqueue SR posting → schedule reminders |
  | Data Operations | Insert certification; create document; update employee_skills; SR event enqueue |
  | Validation | Eligibility (attendance+pass); unique cert_no; valid_until > issue |
  | Authorization | L&D issue; L&D Mgr revoke; employee read-own |
  | State Changes & Side Effects | ACTIVE→EXPIRED/REVOKED/SUPERSEDED; notifications; SR posting |
  | Failure Handling | 403 ineligible; 409 duplicate; SR failure → sr_posting_status=FAILED + retry |
  | Dependencies | FR-TSD-010/011, FR-TSD-016, M13 |
  | Test Guidance | Eligibility gate; expiry job; reminder schedule; compliance rollup |

---

### FR-TSD-013 — Induction / Onboarding Training Program
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, HR Officer, Reporting Manager
- **User Story:** As an L&D Officer, I want new entrants to be auto-enrolled into a structured induction program with tracked completion so that onboarding is consistent and compliant.
- **Description:** On a new-joiner event from M01, auto-create induction training needs and nominations into the configured induction program/learning path, track completion within an onboarding window, and escalate non-completion.
- **Acceptance Criteria:**
  1. A new-joiner event (M01 `date_of_joining`) triggers auto-nomination into the active induction program(s).
  2. Induction completion is tracked against an onboarding window (e.g., 30/60/90 days).
  3. Non-completion within the window escalates to the manager and L&D.
  4. Induction modules can be classroom, e-learning, or blended and reuse FR-TSD-007 programs.
  5. Induction completion contributes to mandatory-compliance status (FR-TSD-012).
- **Business Rules:**
  - Induction nominations are type=INDUCTION and may auto-approve (no L1/L2) per policy.
  - The induction program/learning path is configurable per cadre/designation.
  - Missing induction blocks nothing technically but is surfaced as a compliance exception.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_needs` (source=INDUCTION) | C |
  | `training_nominations` (type=INDUCTION) | C |
  | `learning_paths` | R |
  | M01 joiner event | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/induction:enroll` (event-driven + manual) |
  | GET | `/api/v1/induction/status?orgUnitId=` |
- **UI Behavior Notes:** Onboarding tracker per new joiner with module checklist and progress; manager view of team induction; overdue flags; configurable induction template editor.
- **Edge Cases:** Late joiner data sync (back-dated window); transfer during induction (induction follows employee); re-induction on re-employment.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `InductionService`, `JoinerEventListener`, `OnboardingTracker` |
  | Backend Flow | Consume joiner event → resolve induction template by cadre → auto-create needs+nominations → track window → escalate |
  | Data Operations | Insert needs+nominations; track completion; notifications |
  | Validation | One active induction enrolment per joiner; window dates |
  | Authorization | L&D/HR; manager read team |
  | State Changes & Side Effects | Auto-enrol; completion feeds compliance; escalations |
  | Failure Handling | Idempotent on duplicate joiner events; retry on M01 lag |
  | Dependencies | FR-TSD-007/009/012/014; M01 |
  | Test Guidance | Event idempotency; window escalation; transfer continuity |

---

### FR-TSD-014 — Learning Paths, Recommendations, CPD & Skills Marketplace
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (curate), Employee (consume), Reporting Manager
- **User Story:** As an employee, I want personalised learning paths, skill-based recommendations, CPD credit tracking, and a skills marketplace so that I can grow toward my role and aspirations.
- **Description:** Curate `learning_paths` + `learning_path_items` toward a target competency/designation; generate skill-gap-driven program recommendations; track `cpd_records` credits; and expose a skills marketplace matching surplus skills (from gap analysis) to mentoring/project opportunities.
- **Acceptance Criteria:**
  1. L&D can curate published learning paths; the recommendation engine can also generate suggested paths from an employee's gaps.
  2. An employee sees a ranked recommendation list mapped to their critical gaps.
  3. Completing a program awards CPD credits per the program's `cpd_credits`, appended to `cpd_records`.
  4. CPD totals are aggregated per credit year and shown against any target.
  5. The skills marketplace lists employees with surplus proficiency (current > model target) as potential mentors/SMEs.
- **Business Rules:**
  - Recommendations prioritise CRITICAL > HIGH gaps and mandatory mandates.
  - CPD ledger is append-only; credits ≥ 0; verified credits flagged.
  - Marketplace participation is opt-in (employee consent) and respects data-privacy.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `learning_paths`, `learning_path_items` | C/R/U |
  | `cpd_records` | Append |
  | `skill_gap_items`, `employee_skills` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/employees/{empId}/recommendations` |
  | POST | `/api/v1/learning-paths` |
  | GET | `/api/v1/employees/{empId}/cpd?year=` |
  | GET | `/api/v1/marketplace/skills?skillId=` |
- **UI Behavior Notes:** Path explorer with progress rings; recommendation cards tied to gaps; CPD dashboard with year totals; marketplace directory with opt-in toggle and contact action.
- **Edge Cases:** No gaps (shows growth/aspiration paths); CPD double-count guarded by source_ref; marketplace opt-out hides employee entirely.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LearningPathService`, `RecommendationEngine`, `CpdLedger`, `MarketplaceService` |
  | Backend Flow | Resolve gaps → rank programs (rules/score) → render recommendations; on completion append CPD; marketplace queries surplus skills |
  | Data Operations | Insert paths/items; append cpd_records; read gap/skill data |
  | Validation | CPD ≥ 0; dedupe by source_ref; opt-in consent |
  | Authorization | L&D curate; employee own; manager team |
  | State Changes & Side Effects | CPD accrual; recommendation cache; marketplace visibility |
  | Failure Handling | Graceful empty states; consent enforcement |
  | Dependencies | FR-TSD-004/007/011 |
  | Test Guidance | Ranking; CPD dedupe; consent/visibility |

---

### FR-TSD-015 — LMS Integration (SCORM / xAPI) & E-Learning Sync
- **Module:** M07-TSD
- **Primary Role(s):** SysAdmin (config), L&D Officer, Employee (learner)
- **User Story:** As an L&D Officer, I want e-learning enrolments to sync progress and completion from the LMS via SCORM/xAPI so that online learning is tracked alongside classroom training without manual entry.
- **Description:** Configure LMS integration, create `lms_enrollments` on e-learning nomination approval, launch courses (SSO deep-link), and ingest progress/completion/score via SCORM run-time or xAPI statements (idempotent by `lms_statement_id`), feeding attendance (FR-TSD-010) and completion (FR-TSD-012).
- **Acceptance Criteria:**
  1. Approving a nomination for an e-learning program provisions an `lms_enrollment` with the LMS course/user refs.
  2. Learners launch the course via SSO deep-link; no separate LMS login.
  3. Progress and completion sync back (webhook/poll) and update `progress_pct`, `completion_status`, and `score`.
  4. xAPI statements are idempotent — a repeated `lms_statement_id` is ignored.
  5. Completion via LMS auto-derives attendance and triggers certification eligibility.
- **Business Rules:**
  - Supported standards: SCORM 1.2, SCORM 2004, xAPI; NONE for non-tracked.
  - `progress_pct` in [0,100]; COMPLETED requires progress ≥ program completion criterion.
  - Sync failures retry with backoff; persistent failure flags the enrolment for manual reconciliation.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `lms_enrollments` | C/R/U |
  | `training_nominations` | R/U |
  | `training_attendance` | C (derived) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/lms/enrollments` (auto on approval) |
  | GET | `/api/v1/lms/enrollments/{id}/launch` (SSO deep-link) |
  | POST | `/api/v1/lms/webhook` (xAPI/SCORM callback, signed) |
- **UI Behavior Notes:** "Launch course" button; progress bar synced; completion badge; reconciliation queue for failed syncs; admin LMS config panel (endpoint, keys via env, standard).
- **Edge Cases:** Duplicate xAPI statement (ignored); LMS down (queued, retried); partial progress then withdrawal (enrolment cancelled, progress retained for audit); clock skew on statement timestamps.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LmsService`, `ScormAdapter`, `XapiIngestor`, `SsoLauncher`, `SyncRetryWorker` |
  | Backend Flow | On approval provision enrolment → SSO launch → webhook/poll ingest (verify signature) → idempotent update → derive attendance/completion |
  | Data Operations | Upsert lms_enrollments keyed by statement id; insert derived attendance |
  | Validation | Standard enum; progress bounds; signature verify; idempotency key |
  | Authorization | SysAdmin config; learner launch-own; webhook via signed secret |
  | State Changes & Side Effects | NOT_STARTED→IN_PROGRESS→COMPLETED/FAILED; feeds FR-010/012 |
  | Failure Handling | Retry+backoff; reconciliation queue; 401 on bad signature |
  | Dependencies | FR-TSD-007/009/010/012; SSO; secrets via env |
  | Test Guidance | Idempotency; signature; retry; completion derivation |

---

### FR-TSD-016 — Service Register Posting & Training Budget / Cost Tracking
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer/Manager, Finance/Budget Controller, SR Custodian (receive)
- **User Story:** As an L&D Manager, I want significant trainings and qualifications posted to the Digital Service Register and full budget/cost tracking maintained so that statutory records are complete and spend is governed.
- **Description:** Post significant training completions and certifications as append-only `service_register_events` to M12 (idempotent, with retry/failure handling), and maintain `training_budgets`/`training_costs` with planned→committed→actual tracking, reimbursement payable feed to M10, and budget variance reporting.
- **Acceptance Criteria:**
  1. Significant/mandatory training completions and certifications post to M12 as append-only SR events (idempotent by source ref).
  2. Posting state is tracked (NOT_REQUIRED/PENDING/POSTED/FAILED) with automatic retry on FAILED.
  3. Approved nominations commit cost to the relevant `training_budget` (`committed_amount`).
  4. Actual costs (trainer/venue/material/travel/reimbursement/LMS) reduce remaining budget and reconcile to invoices.
  5. Reimbursement-type costs flagged `payable_to_payroll` emit an approved-payable feed to M10.
  6. Budget variance (allocated vs committed vs actual) is reportable per org-unit/FY/category.
- **Business Rules:**
  - SR events are append-only; corrections (e.g., cert revocation) post a new corrective event, never edit.
  - `committed + actual` must not exceed `allocated` unless budget allows overrun (FROZEN blocks all new commitment).
  - Cost approver ≠ cost creator (SoD); payable feed only for APPROVED costs.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `service_register_events` (M12) | Append |
  | `certifications` | U (sr_posting_status) |
  | `training_budgets` | C/R/U |
  | `training_costs` | C/R/U |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/certifications/{id}:post-to-sr` (also auto) |
  | POST | `/api/v1/training-budgets`, `/api/v1/training-costs` |
  | GET | `/api/v1/training-budgets/variance?fy=&orgUnitId=` |
- **UI Behavior Notes:** SR posting status chips with retry; budget dashboard (allocated/committed/actual bars, variance %); cost entry with invoice upload; payable-to-payroll toggle; reconciliation view.
- **Edge Cases:** SR posting timeout (PENDING→retry→FAILED with alert); double-post prevented by idempotency key; budget overrun attempt (409 unless override+approval); FROZEN budget blocks commitment; FX/rounding on cost (banker's rounding, INR).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SrPostingService`, `BudgetService`, `CostService`, `PayrollPayableEmitter`, `RetryWorker` |
  | Backend Flow | On significant completion → build SR event (idempotency key=cert/nomination id) → POST M12 → set POSTED/FAILED; budget commit on approval; actual cost reconcile; payable feed to M10 |
  | Data Operations | Append SR event (M12); update cert posting status; update budget committed/actual; insert costs |
  | Validation | Idempotency; append-only; budget non-overcommit; SoD on costs |
  | Authorization | L&D/Mgr post; Finance budget/cost; SR Custodian receive |
  | State Changes & Side Effects | sr_posting_status transitions; budget commit/actual; payroll feed |
  | Failure Handling | Retry+backoff; FAILED alert; 409 overrun/duplicate; transaction on cost+budget |
  | Dependencies | FR-TSD-009/012; M12-SR; M10-PAY |
  | Test Guidance | Idempotent posting; retry; budget invariant; SoD; payable feed |

---

## 7. UI Requirements

### 7.1 Global UI principles
- React + TypeScript, Tailwind + shadcn/ui; responsive and mobile-first; WCAG 2.1 AA (keyboard nav, focus order, 4.5:1 contrast, ARIA labels); dark mode supported.
- Every screen implements **empty / loading / error / success / permission-denied / offline** states (no skeleton-only screens).
- `DD-MMM-YYYY` dates, INR currency formatting, locale-aware.
- All lists paginated (≤100), filterable, sortable, with column-level RBAC.

### 7.2 Key screens
| Screen | Primary roles | Key elements |
|---|---|---|
| My Skills & Growth | Employee | Skill cards with proficiency meters, gaps radar, recommendations, CPD totals, certificates |
| Team Skills (Manager) | Manager | Team heatmap, validation queue, nomination actions, team plan |
| Competency Framework Admin | L&D Officer | Taxonomy tree, competency builder, proficiency catalog, publish workflow |
| Competency Model Editor | L&D Officer | Model grid (competency/target/weight/critical), scope, version timeline |
| Skill-Gap Analysis | L&D/Manager | Target-vs-current visualisation, gap list, convert-to-need |
| Training Needs Inbox | L&D/Manager | Source-filtered needs, consolidation wizard, priority editor |
| Annual Plan & Calendar | L&D Manager | Plan builder, budget reconciliation bar, quarter Gantt calendar |
| Course Catalog | L&D/All | Program cards/grid, filters, program editor |
| Session Scheduler | L&D | Calendar create, conflict warnings, capacity meter, trainer/venue pickers |
| Nomination & Approvals | Manager/L&D | Nominate dialog, approver inbox, waitlist/capacity, budget-impact banner |
| Attendance Console | Trainer/L&D | Roster grid, per-day marking, bulk actions, signed-sheet upload |
| Assessment & Feedback | Trainer/Employee | Score grid, learning-gain chart, feedback forms, Kirkpatrick dashboard |
| Certifications & Compliance | L&D/Employee | Certificate viewer, expiry timeline, mandatory-compliance heatmap |
| Onboarding Tracker | L&D/HR/Manager | Induction checklist, window progress, overdue flags |
| Learning Paths & Marketplace | Employee/L&D | Path explorer, recommendation cards, CPD dashboard, marketplace directory |
| Budget & Cost Dashboard | Finance/L&D | Allocated/committed/actual bars, variance, cost entry, payable feed |

---

## 8. (merged into Section 6 FR structure — see LLD tables per FR)

> Low-Level Design is embedded per FR in Section 6 as mandated. No separate section is duplicated.

---

## 9. NFRs (Non-Functional Requirements)

| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; gap-analysis batch for 10k employees < 30 min; catalog/list endpoints < 300ms |
| Scalability | Horizontal scaling; supports 200k employees, 5k concurrent learners, 50k annual nominations |
| Availability | 99.9% uptime; graceful degradation when M08/LMS/M12 are unavailable |
| Resilience | RPO ≤ 15min, RTO ≤ 4h; idempotent SR/LMS/payroll integrations with retry+DLQ |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; RBAC + row-level org scoping; signed LMS webhooks; secrets via env |
| Privacy | India DPDP Act 2023 alignment; anonymous feedback; marketplace opt-in; PII minimisation; no PII in logs |
| Auditability | Every state change in `audit_log`; append-only ledgers immutable; full traceability need→nomination→cert→SR |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Structured logs with `requestId`; metrics for nomination throughput, SR posting success, sync lag; alerting on FAILED postings |
| Data retention | Statutory retention for certifications/SR-posted training (lifetime); operational data per schedule |
| Localisation | UTC storage; locale display; INR default; i18n-ready strings |

---

## 10. API & Integration

### 10.1 Conventions
- Base path `/api/v1`; JWT bearer auth; RBAC enforced; all lists paginated (`page`,`limit≤100` or cursor).
- Idempotency-Key header for POST that triggers external effects (SR posting, LMS provisioning, payroll feed).

### 10.2 Canonical error envelope
```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "obtained_score exceeds max_score", "field": "obtained_score" },
  "requestId": "req-7f3a9c2e"
}
```

### 10.3 Error-code catalog
| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/payload validation failed |
| AUTH_REQUIRED | 401 | Missing/invalid token (incl. bad LMS webhook signature) |
| FORBIDDEN | 403 | RBAC/SoD/self-approval/self-validation denied |
| NOT_FOUND | 404 | Entity not found / no effective competency model |
| RESOURCE_CONFLICT | 409 | Duplicate code / duplicate nomination / in-use archive |
| SCHEDULE_CONFLICT | 409 | Trainer/venue double-booking |
| CAPACITY_EXCEEDED | 409 | Session full (→ waitlist) |
| BUDGET_EXCEEDED | 409 | Cost commitment exceeds allocated (no override) |
| INELIGIBLE_FOR_CERTIFICATION | 409 | Attendance/assessment criteria not met |
| MANDATORY_CANNOT_BE_CANCELLED | 403 | Self-withdrawal of mandatory training |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled server error |
| UPSTREAM_UNAVAILABLE | 503 | M08/M12/LMS/M10 unavailable (degraded mode) |
| SR_POSTING_FAILED | 502 | Service Register posting failed (retryable) |

### 10.4 Example requests/responses

**Create nomination**
```json
POST /api/v1/training-sessions/ts-3001/nominations
{ "employeeId": "emp-3001", "trainingNeedId": "tn-7001", "nominationType": "MANAGER" }

201 Created
{ "trainingNominationId": "nm-4001", "status": "PENDING_L1", "estimatedCost": 8000.00 }
```

**Approve nomination — budget exceeded**
```json
POST /api/v1/nominations/nm-4099:approve
409 Conflict
{ "error": { "code": "BUDGET_EXCEEDED", "message": "Committing 8000.00 exceeds remaining budget 4500.00 for ou-12 FY2026-2027", "field": "estimatedCost" }, "requestId": "req-12ab" }
```

**LMS xAPI webhook (idempotent)**
```json
POST /api/v1/lms/webhook
{ "lmsEnrollmentId": "le-9001", "statementId": "stmt-abc-123", "verb": "completed", "progressPct": 100, "score": 88 }

200 OK
{ "applied": true, "completionStatus": "COMPLETED" }
```

**SR posting result**
```json
POST /api/v1/certifications/ct-6001:post-to-sr
202 Accepted
{ "srPostingStatus": "PENDING", "idempotencyKey": "cert:ct-6001" }
```

### 10.5 Integration points
| Direction | Counterparty | Mechanism | Idempotency |
|---|---|---|---|
| Consume employee master & joiner events | M01-EPM | API/event | event id |
| Consume appraisal development gaps | M08-PAM | API/event (read) | cycle+emp |
| Append SR events | M12-SR | API (async, retry) | cert/nomination id |
| Emit reimbursement payable | M10-PAY | event/feed | cost id |
| Store/retrieve documents | M13-DMS | API | document id |
| LMS course launch & sync | External LMS | SSO deep-link + signed webhook/poll | xAPI statement id |
| Notifications | Platform | event | notification id |
| Analytics datamart | M14-DAS | read views/export | n/a |

---

## 11. Workflow & State Diagrams (state tables)

### 11.1 Nomination state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| DRAFT | submit | PENDING_L1 | maker≠approver; need linked |
| PENDING_L1 | manager approve | PENDING_L2 | SoD |
| PENDING_L1 | reject | REJECTED | reason required |
| PENDING_L2 | L&D approve | APPROVED | capacity+budget check; commit budget; decrement capacity |
| PENDING_L2 | approve when full | WAITLISTED | enqueue FIFO |
| APPROVED | withdraw (before deadline) | WITHDRAWN | free seat → promote waitlist; release commitment |
| WAITLISTED | seat frees | APPROVED | FIFO promotion |
| APPROVED | session completes (attended+pass) | COMPLETED | issue cert eligibility |
| APPROVED | session completes (fully absent) | NO_SHOW | mark, notify |
| any non-terminal | mandatory self-withdraw | (blocked) | MANDATORY_CANNOT_BE_CANCELLED |

### 11.2 Training session state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | open nominations | OPEN | program PUBLISHED |
| OPEN | capacity reached | FULL | enrolled = capacity |
| OPEN/FULL | start date reached | RUNNING | — |
| RUNNING | end + closeout | COMPLETED | attendance/assessment finalised |
| any pre-completion | cancel | CANCELLED | reason; cascade nominations + notifications |

### 11.3 Certification state table
| Current | Event | Next | Guard |
|---|---|---|---|
| (none) | issue | ACTIVE | eligibility met; cert_no generated |
| ACTIVE | valid_until passed | EXPIRED | nightly job; notify |
| ACTIVE | renewal issued | SUPERSEDED | new cert ACTIVE |
| ACTIVE/EXPIRED | revoke | REVOKED | L&D Mgr approval; SR correction if posted |

### 11.4 SR posting state table
| Current | Event | Next | Guard |
|---|---|---|---|
| NOT_REQUIRED | significant flag set | PENDING | mandatory/significant |
| PENDING | post success | POSTED | M12 ack; store event id |
| PENDING | post failure | FAILED | retry scheduled |
| FAILED | retry success | POSTED | within retry budget |
| FAILED | retries exhausted | FAILED | alert L&D + SR Custodian |

### 11.5 Annual plan state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | budget reconciled |
| SUBMITTED | approve | APPROVED | L&D Mgr + Finance |
| APPROVED | activate | ACTIVE | FY start |
| ACTIVE | close | CLOSED | all items terminal |

---

## 12. Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Nomination pending approval | Manager / L&D Mgr | Email + in-app | NOM_PENDING |
| Nomination approved/rejected/waitlisted | Employee, nominator | Email + in-app | NOM_DECISION |
| Waitlist promotion | Employee | Email + SMS | NOM_PROMOTED |
| Session reminder (T-3 days) | Enrolled + trainer | Email + SMS | SESSION_REMINDER |
| Session cancelled | Enrolled + trainer | Email + SMS + in-app | SESSION_CANCELLED |
| Pre/post assessment due | Trainer | In-app | ASSESS_DUE |
| Feedback request (post-session) | Participants | Email + in-app | FEEDBACK_REQUEST |
| Certificate issued | Employee | Email + in-app | CERT_ISSUED |
| Certificate expiry (60/30/7 days) | Employee + manager | Email + in-app | CERT_EXPIRY |
| Mandatory training overdue | Employee + manager + L&D | Email + escalation | MANDATORY_OVERDUE |
| Induction window overdue | New joiner + manager + L&D | Email + escalation | INDUCTION_OVERDUE |
| SR posting failed | L&D + SR Custodian | Email + in-app | SR_POST_FAILED |
| Budget threshold breached (≥90%) | Finance + L&D Mgr | Email + in-app | BUDGET_THRESHOLD |
| LMS sync reconciliation needed | L&D | In-app | LMS_RECON |

All notifications write to the shared `notifications` ledger; respect user channel preferences and quiet hours; localisable templates.

---

## 13. Reporting & Analytics

| Report | Audience | Key metrics / dimensions |
|---|---|---|
| Skill inventory & coverage | L&D/Mgr | Skills by category, proficiency distribution, validated vs declared |
| Skill-gap heatmap | L&D/Mgr/Dept Head | Critical gaps by org-unit, competency, designation |
| Training plan execution | L&D Mgr | Planned vs delivered man-days, by quarter/org-unit |
| Nomination funnel | L&D | Nominated→approved→attended→completed conversion |
| Learning effectiveness (Kirkpatrick) | L&D | L1 reaction scores, L2 learning gain, L3 behaviour, L4 results |
| Mandatory-compliance status | L&D/Auditor/Dept Head | Required vs held vs lapsed mandatory certs; % compliant |
| Certification register | L&D/Auditor | Active/expired/revoked; upcoming renewals |
| Induction compliance | HR/L&D | On-time vs overdue induction completion |
| CPD credit summary | Employee/L&D | Credits by year vs target |
| Trainer performance | L&D | Avg feedback rating, sessions delivered, pass rates |
| Budget utilisation & variance | Finance/L&D Mgr | Allocated/committed/actual, variance %, cost type breakdown |
| LMS engagement | L&D | Enrolments, completion rate, avg time-to-complete |

Reports exposed as datamarts/views to M14-DAS; all support org-unit scoping, FY filters, CSV/PDF export, and respect RBAC.

---

## 14. Migration & Launch

### 14.1 Data migration
| Source | Target | Approach |
|---|---|---|
| Legacy skill/competency lists | `skill_categories`/`skills`/`competencies` | Map → validate → bulk import (source=IMPORT), L&D review before PUBLISH |
| Existing employee qualifications/certs | `certifications`, `employee_skills` | Import with `sr_posting_status=NOT_REQUIRED` for historical; flag significant for back-posting |
| Historical training records | `training_programs`/`sessions`/`nominations` (closed) | Load as COMPLETED for history/analytics |
| Legacy budgets | `training_budgets` | Load current+prior FY for variance baselines |

### 14.2 Cutover & launch
1. Load and publish taxonomy, proficiency levels, competencies, and models (Gate: L&D sign-off).
2. Import employee skills/certs; run reconciliation report (zero unmatched employees).
3. Configure LMS integration in a staging tenant; validate SCORM/xAPI round-trip.
4. Pilot with one department (induction + mandatory compliance), validate SR posting end-to-end.
5. Org-wide rollout; enable annual plan for the current FY.
6. Post-launch: monitor SR posting success, nomination throughput, compliance dashboard.

### 14.3 Rollback & safety
- Idempotent imports re-runnable; SR back-posting gated behind explicit approval.
- Feature flags per capability (marketplace, recommendations, LMS).
- Append-only ledgers ensure no destructive migration of historical evidence.

---

## 15. Traceability / Dependency / Parallel-Agent Plan

### 15.1 Traceability matrix (FR → entities → APIs → key BRs)
| FR | Primary entities | Key APIs | Depends on |
|---|---|---|---|
| FR-TSD-001 | skill_categories, skills, competencies, proficiency_levels | /skills,/competencies | — |
| FR-TSD-002 | competency_models(+items) | /competency-models | 001 |
| FR-TSD-003 | employee_skills, skill_assessments | /employees/{}/skills | 001,002 |
| FR-TSD-004 | skill_gap_analyses(+items) | /skill-gap-analyses | 002,003, M08 |
| FR-TSD-005 | training_needs | /training-needs | 004 |
| FR-TSD-006 | annual_training_plans(+items), training_budgets | /annual-training-plans | 005,016 |
| FR-TSD-007 | training_programs | /training-programs | 001,015 |
| FR-TSD-008 | training_sessions, trainers, venues | /training-sessions | 007 |
| FR-TSD-009 | training_nominations | /nominations | 008,016 |
| FR-TSD-010 | training_attendance | /sessions/{}/attendance | 009,015 |
| FR-TSD-011 | training_assessments, training_feedback | /nominations/{}/assessments | 010 |
| FR-TSD-012 | certifications | /certifications | 010,011,016 |
| FR-TSD-013 | training_needs/nominations (induction) | /induction | 007,009,012,014, M01 |
| FR-TSD-014 | learning_paths(+items), cpd_records | /recommendations,/cpd | 004,007,011 |
| FR-TSD-015 | lms_enrollments | /lms/* | 007,009,010,012 |
| FR-TSD-016 | service_register_events, training_budgets, training_costs | /post-to-sr,/training-budgets | 009,012, M12, M10 |

### 15.2 Parallel-agent build plan
| Wave | FRs (parallelisable) | Rationale |
|---|---|---|
| 1 (foundation) | 001, 007 (catalog skeleton), 016 budget tables | Master data + budget base, no cross-deps |
| 2 | 002, 008, 015 config | Build on masters |
| 3 | 003, 005, 006 | Inventory, needs, plan |
| 4 | 004, 009 | Gap engine + nomination workflow |
| 5 | 010, 011, 014 | Execution + learning |
| 6 | 012, 013, 016 posting | Certification, induction, SR posting integration |

### 15.3 External dependencies
| Dependency | Module | Type | Fallback |
|---|---|---|---|
| Employee master / joiner events | M01 | Hard | cache + retry |
| Appraisal development gaps | M08 | Soft | degraded gap mode |
| Service Register | M12 | Hard (statutory) | queue + retry + alert |
| Documents | M13 | Hard | block upload, allow metadata |
| Payroll payable | M10 | Soft | queue feed |
| LMS | External | Soft | manual attendance fallback |

### 15.4 Final Reconciliation Table (0 unresolved gaps)
| Mandated element | Covered by | Status |
|---|---|---|
| Competency/skill framework | FR-TSD-001/002 | ✅ |
| Proficiency levels | FR-TSD-001; proficiency_levels | ✅ |
| Skill inventory per employee | FR-TSD-003 | ✅ |
| Skill-gap analysis | FR-TSD-004 | ✅ |
| Annual training calendar & plan | FR-TSD-006 | ✅ |
| Course catalog | FR-TSD-007 | ✅ |
| Internal/external/e-learning programmes | FR-TSD-007/015 | ✅ |
| Training needs linked to appraisal gaps (M08) | FR-TSD-004/005 | ✅ |
| Nomination & approval workflow | FR-TSD-009 | ✅ |
| Batch/session scheduling | FR-TSD-008 | ✅ |
| Trainer & venue management | FR-TSD-008 | ✅ |
| Attendance | FR-TSD-010 | ✅ |
| Pre/post assessment | FR-TSD-011 | ✅ |
| Feedback / Kirkpatrick evaluation | FR-TSD-011 | ✅ |
| Certification & validity/renewal | FR-TSD-012 | ✅ |
| Mandatory compliance training | FR-TSD-012 | ✅ |
| Induction/onboarding training | FR-TSD-013 | ✅ |
| Training budget & cost tracking | FR-TSD-006/016 | ✅ |
| Service Register posting (M12) | FR-TSD-016 | ✅ |
| LMS integration (SCORM/xAPI) | FR-TSD-015 | ✅ |
| Learning paths | FR-TSD-014 | ✅ |
| Skill-based recommendations | FR-TSD-014 | ✅ |
| Micro-learning | FR-TSD-007 (delivery_mode/duration) | ✅ |
| CPD/credit tracking | FR-TSD-014 | ✅ |
| Skills marketplace | FR-TSD-014 | ✅ |
| Employees & appraisal gaps referenced | M01/M08 integration | ✅ |
| Required entities (competency, skill, training-program, training-nomination, training-session, certification) | Section 5 | ✅ |

**Unresolved gaps: 0.**

---

## 16. Glossary & Appendices

### 16.1 Glossary
| Term | Definition |
|---|---|
| Competency | A cluster of related skills/behaviours required for effective role performance. |
| Skill | An atomic, assessable capability within the taxonomy. |
| Proficiency level | An ordered measure of capability depth (e.g., Awareness→Expert). |
| Competency model | The set of competencies + target proficiencies a role/cadre requires. |
| Skill gap | The positive difference between required and current proficiency. |
| Kirkpatrick model | Four-level training evaluation: Reaction, Learning, Behaviour, Results. |
| CPD | Continuing Professional Development credits earned through learning. |
| SCORM / xAPI | E-learning interoperability standards for tracking course progress/completion. |
| Learning path | An ordered sequence of programs toward a competency/role goal. |
| Skills marketplace | Internal directory matching surplus skills to mentoring/project needs. |
| Service Register (SR) | Statutory append-only service record ledger (M12). |
| Mandatory/compliance training | Legally/policy-required training with currency and renewal obligations. |
| Induction | Structured onboarding training for new entrants. |
| Maker-checker | Segregation-of-duties control: creator ≠ approver. |

### 16.2 Appendices
- **A. Default proficiency scale:** L1 Awareness, L2 Working, L3 Proficient, L4 Advanced, L5 Expert.
- **B. Default thresholds (configurable):** min attendance 80%; assessment pass 50%; renewal reminders 60/30/7 days; induction windows 30/60/90 days; budget alert ≥90%.
- **C. Standard Kirkpatrick questionnaire keys:** L1 (relevance, trainer, materials, logistics, overall); L2 (pre/post score); L3 (manager-observed behaviour change at T+90); L4 (KPI/business outcome linkage).
- **D. SR-significant training criteria:** mandatory certifications, externally accredited qualifications, programmes ≥ configured duration, and promotion-relevant trainings (M06).
- **E. Inherited shared definitions:** see `SHARED_FOUNDATION.md` §2–§5 (entities, conventions, roles, technical defaults). Not redefined here.
