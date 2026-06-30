# Promotion, Posting & Progression Monitoring — HRMS Module BRD

**Module code:** M06-PPP
**Program:** Enterprise HRMS Suite ("PeopleGov / HRMS Suite") — government/public-sector HCM
**Document version:** v1.0
**Status:** Approved for build (parallel-agent ready)
**Authoring standard:** Conforms to the program Shared Foundation Brief (`/docs/brd/SHARED_FOUNDATION.md`). Canonical entities (`employees`, `users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `audit_log`, `documents`, `notifications`, `service_register_events`, `workflow_instances`/`workflow_tasks`) are **referenced, not redefined**.

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Promotion, Posting & Progression Monitoring module (M06-PPP) is the statutory and managerial engine that governs how a public-sector employee **moves upward** through the organisation: how seniority is established, how promotions are adjudicated by Departmental Promotion Committees (DPCs) and promotion panels, how the resulting orders and probation are managed, how financial up-gradation schemes (ACP/MACP) are sanctioned even in the absence of a functional promotion, how the employee is **posted** into the new role, and how the organisation **monitors** every employee's progression — due-for-promotion alerts, stagnation, increment timeliness, and career-path modelling.

Promotion in a government context is a quasi-judicial, rule-bound, reservation-aware, audit-heavy process. A wrongly computed seniority position, an overlooked vigilance case, a mis-applied reservation roster point, or an un-recorded probation declaration can each trigger litigation, tribunal proceedings, and the unwinding of an entire promotion batch. M06-PPP therefore treats **eligibility computation, panel adjudication, roster compliance, and immutable service-register posting** as first-class, fully-audited capabilities.

### 1.2 Business context & statutory drivers

- **Seniority** is the spine of public-sector careers. It determines eligibility zones, panel inclusion, and order-of-promotion. Tentative seniority lists are published, objections/representations invited, disposed, and a final list notified — all with statutory cut-off dates.
- **Departmental Promotion Committee (DPC)** is the constitutional body that evaluates the eligible field and prepares Select Lists. Its proceedings, benchmarks (e.g., APAR grading thresholds), and minutes are statutory records.
- **Reservation roster** (SC/ST/OBC/EWS/PwBD) compliance is mandatory; roster points, carry-forward, and de-reservation rules must be enforced and auditable.
- **Vigilance/disciplinary clearance** is a precondition; "sealed cover" procedure must be supported where a charge is pending.
- **Financial up-gradation** schemes (Time-Bound Promotion / Assured Career Progression / Modified Assured Career Progression — ACP/MACP) guarantee pay progression on completion of qualifying service (e.g., 10/20/30 years) to combat stagnation, independent of vacancy-based promotion.
- Every promotion, posting, officiating arrangement, probation declaration, and financial up-gradation is a **statutory service event** that must post to the Digital Service Register (M12) as an append-only entry.

### 1.3 Scope summary

In scope: seniority management; eligibility computation; DPC/panel workflow; select-list and promotion-order generation; probation lifecycle; ad-hoc/officiating/in-situ promotion; ACP/MACP financial up-gradation; post-promotion posting; and progression monitoring (due-for-promotion, stagnation, increment monitoring, career-path & succession modelling).

Out of scope (owned elsewhere): APAR capture & ratings (M08, referenced), disciplinary/vigilance case management (M09, referenced), lateral transfer/relieving/joining mechanics (M05, reused for posting movement), payroll fixation arithmetic execution (M10, M06 sanctions and hands off the pay event), the SR ledger itself (M12, M06 writes events).

### 1.4 Primary outcomes & KPIs

| Outcome | KPI | Target |
|---|---|---|
| Accurate seniority | Seniority objections upheld vs. raised | < 3% |
| Timely promotions | Vacancies filled within statutory DPC cycle | ≥ 95% within cycle |
| Roster compliance | Roster points filled per reservation policy | 100% audited, 0 unresolved deviations |
| Zero stagnation surprises | Eligible employees not flagged before due date | 0 |
| Financial up-gradation timeliness | MACP sanctioned within 30 days of due date | ≥ 98% |
| Audit integrity | Promotion events posted to Digital SR | 100%, reconciled |
| Litigation reduction | Promotion orders set aside on procedural grounds | Year-on-year decline |

### 1.5 Module personas (summary)

HR Officer (case preparation), Establishment/Seniority Section, DPC Member & DPC Secretary, Reviewing/Appointing Authority, Vigilance Clearance Officer, Reservation/Roster Officer, Department Head, Employee (self-service progression view & representations), SR Custodian (M12), Auditor (read-only). Full matrix in Section 3.

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Sub-module | Code | Description | Key entities |
|---|---|---|---|
| Seniority Management | PPP-SEN | Cadre-wise seniority lists, eligibility zone, tentative/final lists, objections | `seniority_lists`, `seniority_entries`, `seniority_objections` |
| Eligibility Computation | PPP-ELG | Rule-driven eligibility (qualifying service, APAR, vigilance, roster) | `eligibility_rules`, `eligibility_assessments` |
| Promotion Case & DPC | PPP-DPC | Promotion case, DPC/panel constitution, proceedings, select list | `promotion_cases`, `promotion_panels`, `promotion_panel_members`, `promotion_candidates`, `dpc_proceedings` |
| Promotion Orders & Probation | PPP-ORD | Order generation, acceptance, probation period & declaration | `promotion_orders`, `probation_records` |
| Ad-hoc / Officiating / In-situ | PPP-OFF | Temporary upward arrangements pending regular promotion | `officiating_arrangements` |
| Financial Up-gradation (ACP/MACP) | PPP-FIN | Time-bound/assured career progression sanctions | `financial_upgradations`, `macp_assessments` |
| Posting after Promotion | PPP-POST | Place promoted employee into a post/station | `promotion_postings` (reuses M05 movement) |
| Reservation Roster | PPP-ROS | Roster registers, point allocation, carry-forward, de-reservation | `reservation_rosters`, `roster_points` |
| Progression Monitoring | PPP-MON | Due-for-promotion, stagnation, increment monitoring | `progression_alerts`, `increment_monitor` |
| Career-Path & Succession | PPP-CAR | Career-path models, succession plans, eligibility dashboards | `career_paths`, `career_path_stages`, `succession_plans`, `succession_candidates` |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied here)

- **Maker-checker** on every statutory artefact (seniority list publication, select list approval, order issue, MACP sanction) via shared `workflow_instances`/`workflow_tasks`.
- **Immutable audit** (`audit_log`) on every state change; **append-only SR posting** (`service_register_events`) on every promotion/posting/financial event.
- **Document management** (M13 `documents`) for DPC minutes, orders, objection letters, roster registers — versioned, access-controlled.
- **Notifications** (shared ledger) for alerts, panel invitations, order publication, representation acknowledgements.
- **RBAC + org-unit row-level scoping**; **segregation of duties** (maker ≠ checker; no self-promotion adjudication).
- **Pagination** (max page size 100) on all list endpoints; **i18n** (DD-MMM-YYYY, INR).

### 2.3 In-scope / Out-of-scope boundary table

| Capability | In M06 | Owned/relied elsewhere |
|---|---|---|
| Seniority computation & lists | ✅ | Source person/job data from M01 |
| Eligibility rule engine | ✅ | APAR ratings from M08; disciplinary/vigilance from M09 |
| DPC / panel proceedings | ✅ | — |
| Promotion orders & probation | ✅ | Document storage M13 |
| Officiating/ad-hoc/in-situ | ✅ | — |
| ACP/MACP sanction | ✅ (sanction) | Pay fixation arithmetic & disbursement M10 |
| Posting movement execution | ✅ (initiate) | Relieving/joining mechanics reuse M05 |
| Service event ledger | Writes events | Ledger owned by M12 |
| Workforce dashboards (cross-module) | Module dashboards | Enterprise analytics M14 |

### 2.4 Assumptions & dependencies

- M01 provides authoritative `employees`, `designations`, `cadres`, `pay_scales`, `org_units`.
- M08 exposes a stable APAR rating read API (per-employee, per-year, grading + benchmark band).
- M09 exposes a disciplinary/vigilance status read API (pending charge, penalty currency, sealed-cover applicability).
- M12 accepts SR event writes idempotently (keyed by `source_module` + `source_event_id`).
- M05 provides the relieving/joining workflow that PPP-POST hands a promotion-posting movement to.
- Reservation policy parameters (percentages, roster cycle length) are configurable master data, not hard-coded.

---

## Section 3 — Roles & Permissions

### 3.1 Module roles (extend shared baseline)

| Role | Description | SoD note |
|---|---|---|
| Employee (Self-Service) | Views own seniority position, eligibility, progression timeline; files objections/representations | Cannot view others' comparative data |
| Establishment/Seniority Officer | Builds/maintains seniority lists, disposes objections | Maker for seniority; cannot self-approve publication |
| HR Officer (Promotion Desk) | Prepares promotion cases, assembles eligible field, drafts orders | Maker; cannot be a panel member on own case |
| Reservation/Roster Officer | Maintains rosters, validates roster-point compliance | Independent control on DPC select list |
| Vigilance Clearance Officer | Records vigilance/disciplinary clearance or sealed-cover flag | Read from M09; attests clearance |
| DPC Secretary | Convenes DPC, records proceedings, compiles select list | Cannot vote/grade |
| DPC Member / Panel Member | Evaluates candidates, assigns benchmark verdict | Cannot be in own promotion field |
| Appointing/Reviewing Authority | Approves select list, signs promotion/MACP orders | Checker; maker ≠ checker enforced |
| Department Head | Sanctions officiating arrangements, posting decisions | — |
| SR Custodian (M12) | Confirms SR posting reconciliation | Read-only into M06 |
| Auditor | Read-only across module + audit log | No write |
| System Administrator | Configures eligibility rules, roster policy, career-path templates | No transactional self-approval |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=none)

| Capability | Employee | Est./Sen. Officer | HR Promotion | Roster Officer | Vigilance Officer | DPC Secretary | DPC Member | Appointing Auth. | Dept Head | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| View own progression | R | R | R | R | R | R | R | R | R | R | R |
| Seniority list build | X | C/U | R | R | X | R | R | R | R | R | X |
| Publish seniority list | X | C(maker) | R | R | X | R | R | A | R | R | X |
| File objection | C(self) | R/U(dispose) | R | X | X | R | X | A | R | R | X |
| Eligibility computation | R(self) | R | C/R | R | R(contrib) | R | R | R | R | R | U(rules) |
| Constitute panel/DPC | X | X | C | R | X | C/U | R | A | R | R | X |
| Record DPC proceedings | X | X | R | R | R | C/U | C(verdict) | R | R | R | X |
| Approve select list | X | X | R | A(roster) | A(vigilance) | R | R | A | R | R | X |
| Issue promotion order | X | X | C(maker) | R | R | R | X | A | R | R | X |
| Probation declaration | R(self) | X | C | X | R | X | X | A | R | R | X |
| Officiating arrangement | R(self) | X | C | X | R | X | X | A | A | R | X |
| ACP/MACP sanction | R(self) | X | C(maker) | R | R | R(screen) | R(screen) | A | R | R | X |
| Initiate posting | R(self) | X | C | X | X | X | X | A | A | R | X |
| Roster maintenance | X | X | R | C/U | X | X | X | A | R | R | X |
| Progression alerts config | X | R | R | X | X | X | X | R | R | R | C/U |
| Career-path/succession | R(self) | X | C/U | X | X | X | X | A | C/U | R | U(template) |

---

## Section 4 — Shared Application Foundation (inherited)

This module **inherits** the program technical defaults (Shared Foundation §5) without restating them as new requirements:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST API under `/api/v1`; PostgreSQL; encrypted object storage for documents; CGG Data Centre deployment.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + org-unit row-level scoping (a DPC member sees only candidates within authorised cadre/org scope).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module-specific (Section 9).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h (module-specific NFRs in Section 10).
- **Shared engines reused:** `workflow_instances`/`workflow_tasks` (maker-checker), `audit_log`, `documents` (M13), `notifications`, `service_register_events` (M12).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| 1 | `seniority_lists` | Module (new) | M06 | A cadre/grade-scoped seniority list (tentative or final) |
| 2 | `seniority_entries` | Module (new) | M06 | One employee's position within a seniority list |
| 3 | `seniority_objections` | Module (new) | M06 | Objection/representation against a tentative entry |
| 4 | `eligibility_rules` | Module (new) | M06 | Configurable rule set per promotion channel |
| 5 | `eligibility_assessments` | Module (new) | M06 | Computed eligibility result per employee per case |
| 6 | `promotion_cases` | Module (new) | M06 | A promotion exercise (from→to grade, vacancies, cycle) |
| 7 | `promotion_panels` | Module (new) | M06 | DPC/panel constituted for a case |
| 8 | `promotion_panel_members` | Module (new) | M06 | Membership of a panel |
| 9 | `promotion_candidates` | Module (new) | M06 | A candidate considered in a case (with verdict) |
| 10 | `dpc_proceedings` | Module (new) | M06 | DPC meeting record, benchmark, minutes, select list |
| 11 | `promotion_orders` | Module (new) | M06 | Issued promotion order for a selected candidate |
| 12 | `probation_records` | Module (new) | M06 | Probation period & declaration for a promotion |
| 13 | `officiating_arrangements` | Module (new) | M06 | Ad-hoc/officiating/in-situ upward arrangement |
| 14 | `financial_upgradations` | Module (new) | M06 | ACP/MACP sanction record |
| 15 | `macp_assessments` | Module (new) | M06 | Screening committee assessment feeding a MACP sanction |
| 16 | `reservation_rosters` | Module (new) | M06 | Roster register per cadre/grade |
| 17 | `roster_points` | Module (new) | M06 | Individual roster point with reservation status |
| 18 | `promotion_postings` | Module (new) | M06 | Posting of promoted employee to a post/station |
| 19 | `career_paths` | Module (new) | M06 | Career-path model template |
| 20 | `career_path_stages` | Module (new) | M06 | Ordered stage within a career path |
| 21 | `succession_plans` | Module (new) | M06 | Succession plan for a critical position |
| 22 | `succession_candidates` | Module (new) | M06 | Identified successor with readiness |
| 23 | `progression_alerts` | Module (new) | M06 | Generated due-for-promotion/stagnation/increment alert |
| 24 | `increment_monitor` | Module (new) | M06 | Annual/increment due tracking row |
| — | `employees` | Canonical | M01 | Referenced (not redefined) |
| — | `designations`/`cadres`/`pay_scales` | Canonical | M01 | Referenced |
| — | `org_units` | Canonical | Platform | Referenced |
| — | `service_register_events` | Canonical | M12 | Written by M06 |
| — | `documents` | Canonical | M13 | Referenced |
| — | `notifications` | Canonical | Platform | Written by M06 |
| — | `audit_log` | Canonical | Platform | Written by M06 |
| — | `workflow_instances`/`workflow_tasks` | Canonical | Platform | Used by M06 |

### 5.2 Full field tables

#### 5.2.1 `seniority_lists`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `seniority_list_id` | UUID | PK | |
| `list_no` | VARCHAR(40) | UNIQUE, NOT NULL | Human-readable (e.g., `SEN/ASO/2026/01`) |
| `cadre_id` | UUID | FK→cadres, NOT NULL | Scope cadre |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | Grade/feeder grade |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | NULL = state-wide |
| `as_on_date` | DATE | NOT NULL | Seniority reckoning date |
| `list_type` | ENUM | NOT NULL | TENTATIVE, FINAL |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED_TENTATIVE, OBJECTIONS_OPEN, OBJECTIONS_CLOSED, FINALISED, SUPERSEDED |
| `objection_window_start` | DATE | NULL | |
| `objection_window_end` | DATE | NULL | |
| `supersedes_list_id` | UUID | FK→seniority_lists, NULL | Prior list replaced |
| `published_by` | UUID | FK→users, NULL | Checker who approved publication |
| `document_id` | UUID | FK→documents, NULL | Notified PDF |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std audit | | |

#### 5.2.2 `seniority_entries`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `seniority_entry_id` | UUID | PK | |
| `seniority_list_id` | UUID | FK→seniority_lists, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `rank_position` | INTEGER | NOT NULL | 1 = senior-most |
| `reckoning_basis` | ENUM | NOT NULL | DOJ_GRADE, REGULARISATION_DATE, MERIT_BATCH, DOB_TIEBREAK, ROSTER_POINT |
| `entry_into_grade_date` | DATE | NOT NULL | Date of entry into feeder grade |
| `tiebreak_value` | VARCHAR(60) | NULL | Recorded tiebreaker (e.g., DOB, batch rank) |
| `reservation_category` | ENUM | NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `is_provisional` | BOOLEAN | NOT NULL DEFAULT true | Cleared on finalisation |
| `remarks` | TEXT | NULL | |
| std audit fields | | | UNIQUE(`seniority_list_id`,`employee_id`); UNIQUE(`seniority_list_id`,`rank_position`) |

#### 5.2.3 `seniority_objections`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `objection_id` | UUID | PK | |
| `objection_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `seniority_list_id` | UUID | FK, NOT NULL | |
| `raised_by_employee_id` | UUID | FK→employees, NOT NULL | |
| `target_entry_id` | UUID | FK→seniority_entries, NULL | Entry contested |
| `objection_type` | ENUM | NOT NULL | WRONG_POSITION, WRONG_DATE, OMISSION, CATEGORY_ERROR, OTHER |
| `grounds` | TEXT | NOT NULL | |
| `supporting_document_id` | UUID | FK→documents, NULL | |
| `status` | ENUM | NOT NULL | SUBMITTED, UNDER_REVIEW, UPHELD, REJECTED, PARTIALLY_UPHELD, WITHDRAWN |
| `disposal_remarks` | TEXT | NULL | |
| `disposed_by` | UUID | FK→users, NULL | |
| `disposed_at` | TIMESTAMP | NULL | |
| std audit fields | | | |

#### 5.2.4 `eligibility_rules`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `eligibility_rule_id` | UUID | PK | |
| `rule_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `from_grade_id` | UUID | FK→designations, NOT NULL | Feeder grade |
| `to_grade_id` | UUID | FK→designations, NOT NULL | Promotion grade |
| `channel` | ENUM | NOT NULL | PROMOTION, MACP, OFFICIATING |
| `min_qualifying_service_years` | NUMERIC(4,1) | NOT NULL | In feeder grade |
| `min_qualifying_service_months` | INTEGER | NULL | Granular alt |
| `apar_lookback_years` | INTEGER | NOT NULL | e.g., 5 |
| `apar_benchmark` | ENUM | NOT NULL | GOOD, VERY_GOOD, OUTSTANDING |
| `apar_min_count_meeting_benchmark` | INTEGER | NOT NULL | e.g., 4 of 5 |
| `requires_vigilance_clearance` | BOOLEAN | NOT NULL DEFAULT true | |
| `disqualify_if_penalty_current` | BOOLEAN | NOT NULL DEFAULT true | |
| `requires_qualification` | VARCHAR(120) | NULL | Mandatory qualification/exam |
| `roster_applicable` | BOOLEAN | NOT NULL DEFAULT true | |
| `effective_from`/`effective_to` | DATE | | Versioned rule |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.5 `eligibility_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `assessment_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK→promotion_cases, NULL | NULL for MACP-only |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `qualifying_service_years` | NUMERIC(5,2) | NOT NULL | Computed |
| `apar_pass` | BOOLEAN | NOT NULL | |
| `apar_detail_json` | JSONB | NULL | Per-year ratings snapshot from M08 |
| `vigilance_status` | ENUM | NOT NULL | CLEAR, SEALED_COVER, NOT_CLEAR, PENDING |
| `disciplinary_status` | ENUM | NOT NULL | CLEAR, PENALTY_CURRENT, CHARGE_PENDING |
| `qualification_met` | BOOLEAN | NOT NULL | |
| `overall_result` | ENUM | NOT NULL | ELIGIBLE, NOT_ELIGIBLE, SEALED_COVER, PROVISIONALLY_ELIGIBLE |
| `failure_reasons` | JSONB | NULL | Array of reason codes |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| std audit fields | | | UNIQUE(`promotion_case_id`,`employee_id`) |

#### 5.2.6 `promotion_cases`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `promotion_case_id` | UUID | PK | |
| `case_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `from_grade_id` | UUID | FK→designations, NOT NULL | |
| `to_grade_id` | UUID | FK→designations, NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | |
| `vacancy_count` | INTEGER | NOT NULL, CHECK ≥ 0 | |
| `vacancy_year` | INTEGER | NOT NULL | DPC cycle/panel year |
| `promotion_mode` | ENUM | NOT NULL | SENIORITY_FIT, SELECTION_MERIT, SENIORITY_CUM_FITNESS |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `crucial_date` | DATE | NOT NULL | Eligibility reckoning date |
| `status` | ENUM | NOT NULL | DRAFT, FIELD_ASSEMBLED, ELIGIBILITY_DONE, PANEL_CONSTITUTED, DPC_HELD, SELECT_LIST_APPROVED, ORDERS_ISSUED, CLOSED, CANCELLED |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| std audit fields | | | |

#### 5.2.7 `promotion_panels`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `panel_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `panel_type` | ENUM | NOT NULL | DPC, DEPARTMENTAL_SELECTION_COMMITTEE, REVIEW_DPC, SCREENING_COMMITTEE |
| `convened_date` | DATE | NULL | |
| `quorum_required` | INTEGER | NOT NULL | |
| `status` | ENUM | NOT NULL | CONSTITUTED, CONVENED, CONCLUDED, DISSOLVED |
| std audit fields | | | |

#### 5.2.8 `promotion_panel_members`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `panel_member_id` | UUID | PK | |
| `panel_id` | UUID | FK, NOT NULL | |
| `member_employee_id` | UUID | FK→employees, NULL | Internal member |
| `external_member_name` | VARCHAR(120) | NULL | e.g., UPSC/PSC nominee |
| `member_role` | ENUM | NOT NULL | CHAIRPERSON, MEMBER, SECRETARY, COMMISSION_NOMINEE, EXPERT |
| `attendance` | ENUM | NULL | PRESENT, ABSENT, RECUSED |
| `recusal_reason` | TEXT | NULL | Conflict of interest |
| std audit fields | | | CHECK(member_employee_id IS NOT NULL OR external_member_name IS NOT NULL) |

#### 5.2.9 `promotion_candidates`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `candidate_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `seniority_entry_id` | UUID | FK→seniority_entries, NULL | Link to seniority |
| `zone_of_consideration` | ENUM | NOT NULL | IN_ZONE, EXTENDED_ZONE, OUT_OF_ZONE |
| `eligibility_assessment_id` | UUID | FK, NULL | |
| `reservation_category` | ENUM | NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `roster_point_id` | UUID | FK→roster_points, NULL | Reserved point filled |
| `dpc_verdict` | ENUM | NULL | FIT, NOT_FIT, UNFIT, SEALED_COVER, DEFERRED, SUPERSEDED |
| `select_list_rank` | INTEGER | NULL | Position in approved select list |
| `is_selected` | BOOLEAN | NOT NULL DEFAULT false | |
| `remarks` | TEXT | NULL | |
| std audit fields | | | UNIQUE(`promotion_case_id`,`employee_id`) |

#### 5.2.10 `dpc_proceedings`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `proceeding_id` | UUID | PK | |
| `panel_id` | UUID | FK, NOT NULL | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `meeting_date` | DATE | NOT NULL | |
| `benchmark_applied` | ENUM | NOT NULL | GOOD, VERY_GOOD, OUTSTANDING |
| `quorum_met` | BOOLEAN | NOT NULL | |
| `minutes_document_id` | UUID | FK→documents, NULL | |
| `select_list_count` | INTEGER | NOT NULL | |
| `reserve_list_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `sealed_cover_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `status` | ENUM | NOT NULL | DRAFT_MINUTES, APPROVED, RATIFIED |
| `approved_by` | UUID | FK→users, NULL | Appointing authority |
| std audit fields | | | |

#### 5.2.11 `promotion_orders`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `order_id` | UUID | PK | |
| `order_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `promotion_case_id` | UUID | FK, NULL | NULL for officiating-only |
| `candidate_id` | UUID | FK→promotion_candidates, NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `order_type` | ENUM | NOT NULL | REGULAR_PROMOTION, AD_HOC, OFFICIATING, IN_SITU, MACP |
| `from_designation_id` | UUID | FK→designations, NOT NULL | |
| `to_designation_id` | UUID | FK→designations, NOT NULL | |
| `from_pay_scale_id` | UUID | FK→pay_scales, NULL | |
| `to_pay_scale_id` | UUID | FK→pay_scales, NULL | |
| `effective_date` | DATE | NOT NULL | |
| `notional_date` | DATE | NULL | For notional promotion/seniority |
| `acceptance_status` | ENUM | NOT NULL | PENDING, ACCEPTED, DECLINED, DEEMED_ACCEPTED |
| `status` | ENUM | NOT NULL | DRAFT, ISSUED, PUBLISHED, EFFECTED, SUPERSEDED, CANCELLED |
| `order_document_id` | UUID | FK→documents, NULL | |
| `sr_event_id` | UUID | FK→service_register_events, NULL | Posting linkage |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| std audit fields | | | |

#### 5.2.12 `probation_records`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `probation_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `probation_start` | DATE | NOT NULL | |
| `probation_months` | INTEGER | NOT NULL | e.g., 24 |
| `scheduled_end` | DATE | NOT NULL | Computed |
| `extended_to` | DATE | NULL | If extended |
| `status` | ENUM | NOT NULL | ON_PROBATION, EXTENDED, DECLARED_SATISFACTORY, REVERTED, DISCHARGED |
| `declaration_date` | DATE | NULL | |
| `declared_by` | UUID | FK→users, NULL | |
| `remarks` | TEXT | NULL | |
| std audit fields | | | |

#### 5.2.13 `officiating_arrangements`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `arrangement_id` | UUID | PK | |
| `arrangement_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `arrangement_type` | ENUM | NOT NULL | AD_HOC, OFFICIATING, IN_SITU, CURRENT_DUTY_CHARGE |
| `against_post_id` | UUID | FK→designations, NOT NULL | Higher post held |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NULL | Open-ended until regularised |
| `linked_case_id` | UUID | FK→promotion_cases, NULL | Regular case pending |
| `regularised_order_id` | UUID | FK→promotion_orders, NULL | On regularisation |
| `status` | ENUM | NOT NULL | ACTIVE, EXTENDED, REGULARISED, TERMINATED, LAPSED |
| `pay_allowed` | BOOLEAN | NOT NULL DEFAULT true | Officiating pay |
| std audit fields | | | |

#### 5.2.14 `financial_upgradations`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `upgradation_id` | UUID | PK | |
| `upgradation_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `scheme` | ENUM | NOT NULL | TBP, ACP, MACP | (Time-Bound/Assured/Modified Assured) |
| `upgrade_level` | ENUM | NOT NULL | FIRST, SECOND, THIRD | (1st/2nd/3rd financial up-gradation) |
| `qualifying_years_completed` | NUMERIC(5,2) | NOT NULL | e.g., 10/20/30 |
| `due_date` | DATE | NOT NULL | When entitlement falls due |
| `granted_pay_level_id` | UUID | FK→pay_scales, NULL | Next pay level granted |
| `effective_date` | DATE | NULL | |
| `macp_assessment_id` | UUID | FK→macp_assessments, NULL | |
| `status` | ENUM | NOT NULL | DUE, UNDER_SCREENING, SANCTIONED, DEFERRED, REJECTED, EFFECTED |
| `deferral_reason` | TEXT | NULL | e.g., penalty currency |
| `order_id` | UUID | FK→promotion_orders, NULL | MACP order linkage |
| `sr_event_id` | UUID | FK→service_register_events, NULL | |
| std audit fields | | | |

#### 5.2.15 `macp_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `macp_assessment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `screening_committee_panel_id` | UUID | FK→promotion_panels, NULL | |
| `benchmark_required` | ENUM | NOT NULL | GOOD, VERY_GOOD | |
| `benchmark_met` | BOOLEAN | NOT NULL | |
| `promotions_earned_count` | INTEGER | NOT NULL | Regular promotions already taken (caps MACP) |
| `result` | ENUM | NOT NULL | RECOMMENDED, NOT_RECOMMENDED, DEFERRED | |
| `assessment_date` | DATE | NOT NULL | |
| std audit fields | | | |

#### 5.2.16 `reservation_rosters`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `roster_id` | UUID | PK | |
| `roster_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | |
| `roster_type` | ENUM | NOT NULL | PROMOTION_RESERVATION, DIRECT_RECRUITMENT, POST_BASED, VACANCY_BASED |
| `cycle_size` | INTEGER | NOT NULL | e.g., 100/200-point |
| `policy_version` | VARCHAR(20) | NOT NULL | Reservation policy applied |
| `status` | ENUM | NOT NULL | ACTIVE, REVISED, ARCHIVED |
| std audit fields | | | |

#### 5.2.17 `roster_points`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `roster_point_id` | UUID | PK | |
| `roster_id` | UUID | FK, NOT NULL | |
| `point_number` | INTEGER | NOT NULL | Sequence within cycle |
| `reserved_for` | ENUM | NOT NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `status` | ENUM | NOT NULL | VACANT, FILLED, CARRIED_FORWARD, DE_RESERVED, INTERCHANGED |
| `filled_by_employee_id` | UUID | FK→employees, NULL | |
| `filled_in_case_id` | UUID | FK→promotion_cases, NULL | |
| `carry_forward_from_point_id` | UUID | FK→roster_points, NULL | |
| std audit fields | | | UNIQUE(`roster_id`,`point_number`) |

#### 5.2.18 `promotion_postings`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `posting_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `to_org_unit_id` | UUID | FK→org_units, NOT NULL | Posting office/station |
| `to_post_designation_id` | UUID | FK→designations, NOT NULL | |
| `posting_type` | ENUM | NOT NULL | LOCAL, OUT_STATION, DEPUTATION |
| `m05_movement_id` | UUID | NULL | Reference to M05 relieving/joining movement |
| `report_by_date` | DATE | NULL | Joining deadline |
| `status` | ENUM | NOT NULL | PENDING, RELIEVED, JOINED, CANCELLED |
| `sr_event_id` | UUID | FK→service_register_events, NULL | |
| std audit fields | | | |

#### 5.2.19 `career_paths`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `career_path_id` | UUID | PK | |
| `path_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `path_name` | VARCHAR(120) | NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NULL | |
| `description` | TEXT | NULL | |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.20 `career_path_stages`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `stage_id` | UUID | PK | |
| `career_path_id` | UUID | FK, NOT NULL | |
| `stage_order` | INTEGER | NOT NULL | |
| `designation_id` | UUID | FK→designations, NOT NULL | |
| `typical_years_in_stage` | NUMERIC(4,1) | NULL | |
| `required_competencies` | JSONB | NULL | Link to M07 competencies |
| std audit fields | | | UNIQUE(`career_path_id`,`stage_order`) |

#### 5.2.21 `succession_plans`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_plan_id` | UUID | PK | |
| `critical_position_designation_id` | UUID | FK→designations, NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `incumbent_employee_id` | UUID | FK→employees, NULL | |
| `risk_of_loss` | ENUM | NOT NULL | LOW, MEDIUM, HIGH |
| `status` | ENUM | NOT NULL | DRAFT, ACTIVE, REVIEWED, ARCHIVED |
| std audit fields | | | |

#### 5.2.22 `succession_candidates`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_candidate_id` | UUID | PK | |
| `succession_plan_id` | UUID | FK, NOT NULL | |
| `candidate_employee_id` | UUID | FK→employees, NOT NULL | |
| `readiness` | ENUM | NOT NULL | READY_NOW, READY_1_2Y, READY_3Y_PLUS, DEVELOPMENT_NEEDED |
| `bench_rank` | INTEGER | NULL | |
| std audit fields | | | UNIQUE(`succession_plan_id`,`candidate_employee_id`) |

#### 5.2.23 `progression_alerts`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `alert_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `alert_type` | ENUM | NOT NULL | DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING |
| `due_date` | DATE | NULL | |
| `severity` | ENUM | NOT NULL | INFO, WARNING, CRITICAL |
| `status` | ENUM | NOT NULL | OPEN, ACKNOWLEDGED, ACTIONED, DISMISSED, EXPIRED |
| `context_json` | JSONB | NULL | Rule trace |
| std audit fields | | | |

#### 5.2.24 `increment_monitor`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `increment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `increment_type` | ENUM | NOT NULL | ANNUAL, STAGNATION_INCREMENT, EFFICIENCY_BAR | |
| `due_date` | DATE | NOT NULL | |
| `status` | ENUM | NOT NULL | DUE, RELEASED, WITHHELD, DEFERRED | |
| `withheld_reason` | TEXT | NULL | |
| `released_effective_date` | DATE | NULL | |
| std audit fields | | | UNIQUE(`employee_id`,`increment_type`,`due_date`) |

### 5.3 Relationship map

```
employees (M01) ──< seniority_entries >── seniority_lists ──< seniority_objections
employees ──< eligibility_assessments >── eligibility_rules
promotion_cases ──< eligibility_assessments
promotion_cases ──< promotion_candidates >── seniority_entries
promotion_cases ──< promotion_panels ──< promotion_panel_members
promotion_panels ──< dpc_proceedings >── promotion_cases
promotion_candidates ──< promotion_orders ──< probation_records
promotion_orders ──< promotion_postings ── org_units
promotion_orders >── service_register_events (M12)
employees ──< officiating_arrangements >── promotion_cases (linked)
employees ──< financial_upgradations >── macp_assessments
reservation_rosters ──< roster_points >── promotion_candidates
career_paths ──< career_path_stages ── designations
succession_plans ──< succession_candidates ── employees
employees ──< progression_alerts
employees ──< increment_monitor
documents (M13) referenced by: seniority_lists, seniority_objections, dpc_proceedings, promotion_orders
audit_log (platform) written by: all state transitions
workflow_instances/tasks (platform) drive: list publication, select-list approval, order issue, MACP sanction
```

### 5.4 Ownership / Reuse matrix

| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `employees`, `designations`, `cadres`, `pay_scales` | M01 | M06 | M01 only |
| `org_units` | Platform | M06 | Platform |
| `service_register_events` | M12 | M06, M14 | M06 (events), M12 |
| `documents` | M13 | M06 | M06 (uploads via M13 API) |
| `notifications` | Platform | M06 | M06 |
| `audit_log` | Platform | Auditor, M14 | M06 (auto) |
| `workflow_instances/tasks` | Platform | M06 | M06 |
| All `seniority_*`, `promotion_*`, `eligibility_*`, `dpc_*`, `officiating_*`, `financial_*`, `macp_*`, `reservation_*`, `roster_*`, `career_*`, `succession_*`, `progression_*`, `increment_*`, `probation_records` | M06 | M14 (analytics), M10/M11 (pay/pension consume orders & upgradations) | M06 |
| APAR ratings | M08 | M06 (read) | M08 |
| Disciplinary/vigilance status | M09 | M06 (read) | M09 |

### 5.5 Enum catalog

| Enum group | Values |
|---|---|
| seniority_list.status | DRAFT, PUBLISHED_TENTATIVE, OBJECTIONS_OPEN, OBJECTIONS_CLOSED, FINALISED, SUPERSEDED |
| seniority_list.list_type | TENTATIVE, FINAL |
| seniority_entry.reckoning_basis | DOJ_GRADE, REGULARISATION_DATE, MERIT_BATCH, DOB_TIEBREAK, ROSTER_POINT |
| objection.status | SUBMITTED, UNDER_REVIEW, UPHELD, REJECTED, PARTIALLY_UPHELD, WITHDRAWN |
| objection.type | WRONG_POSITION, WRONG_DATE, OMISSION, CATEGORY_ERROR, OTHER |
| eligibility.overall_result | ELIGIBLE, NOT_ELIGIBLE, SEALED_COVER, PROVISIONALLY_ELIGIBLE |
| eligibility.vigilance_status | CLEAR, SEALED_COVER, NOT_CLEAR, PENDING |
| eligibility.disciplinary_status | CLEAR, PENALTY_CURRENT, CHARGE_PENDING |
| promotion_case.status | DRAFT, FIELD_ASSEMBLED, ELIGIBILITY_DONE, PANEL_CONSTITUTED, DPC_HELD, SELECT_LIST_APPROVED, ORDERS_ISSUED, CLOSED, CANCELLED |
| promotion_case.mode | SENIORITY_FIT, SELECTION_MERIT, SENIORITY_CUM_FITNESS |
| panel.type | DPC, DEPARTMENTAL_SELECTION_COMMITTEE, REVIEW_DPC, SCREENING_COMMITTEE |
| panel.status | CONSTITUTED, CONVENED, CONCLUDED, DISSOLVED |
| panel_member.role | CHAIRPERSON, MEMBER, SECRETARY, COMMISSION_NOMINEE, EXPERT |
| panel_member.attendance | PRESENT, ABSENT, RECUSED |
| candidate.zone | IN_ZONE, EXTENDED_ZONE, OUT_OF_ZONE |
| candidate.dpc_verdict | FIT, NOT_FIT, UNFIT, SEALED_COVER, DEFERRED, SUPERSEDED |
| proceeding.benchmark | GOOD, VERY_GOOD, OUTSTANDING |
| proceeding.status | DRAFT_MINUTES, APPROVED, RATIFIED |
| order.type | REGULAR_PROMOTION, AD_HOC, OFFICIATING, IN_SITU, MACP |
| order.status | DRAFT, ISSUED, PUBLISHED, EFFECTED, SUPERSEDED, CANCELLED |
| order.acceptance_status | PENDING, ACCEPTED, DECLINED, DEEMED_ACCEPTED |
| probation.status | ON_PROBATION, EXTENDED, DECLARED_SATISFACTORY, REVERTED, DISCHARGED |
| officiating.type | AD_HOC, OFFICIATING, IN_SITU, CURRENT_DUTY_CHARGE |
| officiating.status | ACTIVE, EXTENDED, REGULARISED, TERMINATED, LAPSED |
| financial.scheme | TBP, ACP, MACP |
| financial.upgrade_level | FIRST, SECOND, THIRD |
| financial.status | DUE, UNDER_SCREENING, SANCTIONED, DEFERRED, REJECTED, EFFECTED |
| roster.type | PROMOTION_RESERVATION, DIRECT_RECRUITMENT, POST_BASED, VACANCY_BASED |
| roster_point.reserved_for | GEN, SC, ST, OBC, EWS, PWBD |
| roster_point.status | VACANT, FILLED, CARRIED_FORWARD, DE_RESERVED, INTERCHANGED |
| posting.type | LOCAL, OUT_STATION, DEPUTATION |
| posting.status | PENDING, RELIEVED, JOINED, CANCELLED |
| succession.readiness | READY_NOW, READY_1_2Y, READY_3Y_PLUS, DEVELOPMENT_NEEDED |
| alert.type | DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING |
| alert.severity / status | INFO/WARNING/CRITICAL ; OPEN/ACKNOWLEDGED/ACTIONED/DISMISSED/EXPIRED |
| increment.type / status | ANNUAL/STAGNATION_INCREMENT/EFFICIENCY_BAR ; DUE/RELEASED/WITHHELD/DEFERRED |

### 5.6 Data integrity rules

1. **Unique rank per list:** `(seniority_list_id, rank_position)` and `(seniority_list_id, employee_id)` both unique; no duplicate or skipped ranks (enforced on publish).
2. **Single active final list per scope:** at most one `seniority_lists` with `list_type=FINAL, status=FINALISED` per `(cadre_id, grade_designation_id, org_unit_scope_id)`; superseding one flips the prior to `SUPERSEDED`.
3. **Eligibility immutability after DPC:** `eligibility_assessments` for a case are frozen (copy-on-write snapshot) once the case reaches `DPC_HELD`.
4. **Selected ⇒ eligible:** `promotion_candidates.is_selected=true` requires linked `eligibility_assessment.overall_result ∈ {ELIGIBLE, SEALED_COVER}` (sealed cover kept in sealed envelope, not effected until cleared).
5. **Vacancy cap:** count of `is_selected=true` candidates ≤ `promotion_cases.vacancy_count` (reserve list excluded).
6. **Roster point single fill:** a `roster_points.status=FILLED` row links exactly one `filled_by_employee_id`; reserved point cannot be filled by a non-matching category unless `DE_RESERVED`/`INTERCHANGED` with recorded authority.
7. **Order references valid candidate:** a `REGULAR_PROMOTION` order requires `candidate_id` with `dpc_verdict=FIT` and `is_selected=true`.
8. **No self-adjudication:** an employee appearing in `promotion_candidates` for a case cannot be a `promotion_panel_members` member of that case's panel (must `RECUSED`).
9. **SR posting completeness:** every `promotion_orders.status=EFFECTED`, `promotion_postings.status=JOINED`, and `financial_upgradations.status=EFFECTED` must have a non-null `sr_event_id`.
10. **MACP cap:** `financial_upgradations` count per employee ≤ 3 across scheme lifetime; `promotions_earned_count + macp_count ≤ 3` (configurable per policy).
11. **Probation arithmetic:** `scheduled_end = probation_start + probation_months`; declaration only when `status=ON_PROBATION/EXTENDED` and probation period lapsed.
12. **Effective dates monotonic:** `promotion_orders.effective_date ≥ DPC approval date` unless `notional_date` recorded with authority reference.
13. **Soft delete:** statutory entities (orders, SR-linked, finalised lists) cannot be hard-deleted; only `SUPERSEDED`/`CANCELLED` with audit.
14. **Transactional writes:** select-list approval (writes candidates + proceedings + roster points + workflow), order issue (order + SR event + notification), and MACP sanction (upgradation + order + SR event) each execute in a single DB transaction.

### 5.7 Sample data (2-3 rows per key entity)

**seniority_lists**

| seniority_list_id | list_no | cadre_id | grade_designation_id | as_on_date | list_type | status |
|---|---|---|---|---|---|---|
| 5a1…01 | SEN/ASO/2026/01 | cad-ASO | desg-ASO | 2026-01-01 | TENTATIVE | OBJECTIONS_OPEN |
| 5a1…02 | SEN/SO/2025/02 | cad-SO | desg-SO | 2025-07-01 | FINAL | FINALISED |
| 5a1…03 | SEN/US/2026/01 | cad-US | desg-US | 2026-01-01 | TENTATIVE | DRAFT |

**seniority_entries**

| seniority_entry_id | seniority_list_id | employee_id | rank_position | reckoning_basis | entry_into_grade_date | reservation_category |
|---|---|---|---|---|---|---|
| se-001 | 5a1…01 | emp-1001 | 1 | DOJ_GRADE | 2012-06-15 | GEN |
| se-002 | 5a1…01 | emp-1042 | 2 | DOJ_GRADE | 2012-06-15 | SC |
| se-003 | 5a1…01 | emp-1110 | 3 | DOB_TIEBREAK | 2013-01-02 | OBC |

**promotion_cases**

| promotion_case_id | case_no | from_grade_id | to_grade_id | vacancy_count | vacancy_year | promotion_mode | crucial_date | status |
|---|---|---|---|---|---|---|---|---|
| pc-2026-ASO-SO | PROM/2026/ASO-SO/01 | desg-ASO | desg-SO | 12 | 2026 | SENIORITY_CUM_FITNESS | 2026-01-01 | DPC_HELD |
| pc-2026-SO-US | PROM/2026/SO-US/01 | desg-SO | desg-US | 5 | 2026 | SELECTION_MERIT | 2026-01-01 | PANEL_CONSTITUTED |

**promotion_candidates**

| candidate_id | promotion_case_id | employee_id | zone_of_consideration | dpc_verdict | select_list_rank | is_selected | reservation_category |
|---|---|---|---|---|---|---|---|
| cand-01 | pc-2026-ASO-SO | emp-1001 | IN_ZONE | FIT | 1 | true | GEN |
| cand-02 | pc-2026-ASO-SO | emp-1042 | IN_ZONE | SEALED_COVER | null | false | SC |
| cand-03 | pc-2026-ASO-SO | emp-1110 | IN_ZONE | FIT | 2 | true | OBC |

**promotion_orders**

| order_id | order_no | employee_id | order_type | from_designation_id | to_designation_id | effective_date | acceptance_status | status |
|---|---|---|---|---|---|---|---|---|
| ord-01 | PROM-ORD/2026/001 | emp-1001 | REGULAR_PROMOTION | desg-ASO | desg-SO | 2026-04-01 | ACCEPTED | EFFECTED |
| ord-02 | MACP-ORD/2026/044 | emp-2050 | MACP | desg-ASO | desg-ASO | 2026-03-01 | DEEMED_ACCEPTED | EFFECTED |

**financial_upgradations**

| upgradation_id | upgradation_no | employee_id | scheme | upgrade_level | qualifying_years_completed | due_date | status |
|---|---|---|---|---|---|---|---|
| fu-01 | MACP/2026/044 | emp-2050 | MACP | FIRST | 10.00 | 2026-03-01 | EFFECTED |
| fu-02 | MACP/2026/045 | emp-2090 | MACP | SECOND | 20.00 | 2026-06-15 | UNDER_SCREENING |
| fu-03 | MACP/2026/046 | emp-2120 | MACP | FIRST | 10.00 | 2026-07-01 | DEFERRED |

**reservation_rosters / roster_points**

| roster_id | roster_no | cadre_id | grade_designation_id | roster_type | cycle_size | status |
|---|---|---|---|---|---|---|
| ros-01 | ROS/SO/PROM/100 | cad-SO | desg-SO | PROMOTION_RESERVATION | 100 | ACTIVE |

| roster_point_id | roster_id | point_number | reserved_for | status | filled_by_employee_id |
|---|---|---|---|---|---|
| rp-01 | ros-01 | 1 | GEN | FILLED | emp-1001 |
| rp-07 | ros-01 | 7 | SC | CARRIED_FORWARD | null |
| rp-08 | ros-01 | 8 | OBC | FILLED | emp-1110 |

**progression_alerts**

| alert_id | employee_id | alert_type | due_date | severity | status |
|---|---|---|---|---|---|
| al-01 | emp-3001 | DUE_FOR_PROMOTION | 2026-09-01 | WARNING | OPEN |
| al-02 | emp-2090 | MACP_DUE | 2026-06-15 | CRITICAL | ACKNOWLEDGED |
| al-03 | emp-3300 | STAGNATION | 2026-04-30 | CRITICAL | OPEN |

---

## Section 6 — Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table.

---

### FR-PPP-001 — Cadre-wise Seniority List Generation

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment/Seniority Officer (maker), Appointing Authority (checker)
- **User Story:** As an Establishment Officer, I want to generate a cadre/grade-scoped seniority list reckoned on a chosen date so that promotions and eligibility zones rest on a defensible seniority order.
- **Description:** System assembles all employees in a feeder grade within scope, computes a provisional rank using a configurable reckoning basis (date of joining in grade, regularisation date, merit-batch rank), applies tie-breakers (DOB, batch order), tags reservation category, and produces a `DRAFT` seniority list with ranked entries.

**Acceptance Criteria**
1. Given a cadre + grade + as-on date, the system lists every active employee in that feeder grade within org scope.
2. Ranks are contiguous (1..N) with no duplicates or gaps.
3. Tie-breaks apply deterministically and the applied basis is recorded per entry.
4. The draft is editable until publication; every manual rank override is audited with a reason.
5. Reservation category is populated from M01 and shown per entry.

**Business Rules**
- Reckoning basis precedence and tie-break order are configuration, not code.
- Officers on deputation/long leave are included with a status flag but retain seniority position.
- An employee may appear in exactly one active list per scope.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | Create draft header |
| `seniority_entries` | Ranked rows |
| `employees`, `designations`, `cadres` | Source population |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists` | Create + auto-generate entries |
| GET | `/api/v1/seniority-lists/{id}` | Fetch list + entries |
| PATCH | `/api/v1/seniority-lists/{id}/entries/{entryId}` | Manual rank override (audited) |

**UI Behavior Notes:** Wizard (scope → basis → preview ranked grid). Drag-to-reorder with mandatory reason modal; tie-break column visible; export to PDF preview.

**Edge Cases:** identical DOJ and DOB (fall to next tie-break/seniority-no); employee with grade entry date missing (flagged, excluded from ranking until resolved); retro-regularisation altering position.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityListController`, `SeniorityComputationService`, `TieBreakResolver`, `SeniorityRepository` |
| Backend Flow | Validate scope → query feeder-grade population from M01 → apply reckoning basis → resolve ties → assign 1..N → persist header+entries in one tx |
| Data Operations | INSERT `seniority_lists` (DRAFT); bulk INSERT `seniority_entries`; audit each |
| Validation | Scope exists; as-on date not future beyond config; population non-empty |
| Authorization | `seniority.list.create` + org-unit scope |
| State Changes & Side Effects | List → DRAFT; audit_log entries; no SR posting (not yet statutory) |
| Failure Handling | Missing grade-entry date → partial result with `flagged_entries[]`; tx rollback on any constraint breach |
| Dependencies | M01 master data |
| Test Guidance | Unit: tie-break determinism; integration: contiguous-rank invariant; override audit recorded |

---

### FR-PPP-002 — Tentative Seniority Publication, Objections & Finalisation

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment Officer, Employee (objector), Appointing Authority (checker)
- **User Story:** As an employee, I want to view the tentative seniority list and file objections within the statutory window so that errors are corrected before the list is finalised.
- **Description:** Publishes a draft as `PUBLISHED_TENTATIVE`, opens a configurable objection window, lets in-scope employees file objections/representations, routes them for disposal, applies upheld corrections (re-ranking with audit), then finalises the list (`FINALISED`) and notifies.

**Acceptance Criteria**
1. Publication requires checker approval via workflow and freezes the entry set as the tentative baseline.
2. Objections accepted only within `[objection_window_start, objection_window_end]`.
3. Each objection has a recorded disposal (UPHELD/REJECTED/PARTIALLY_UPHELD) with remarks; objector is notified.
4. Upheld objections trigger a re-rank that preserves contiguity and is fully audited.
5. Finalisation supersedes any prior final list for the scope and produces a notified PDF stored in M13.

**Business Rules**
- Objections after window close are auto-rejected as `TIME_BARRED` unless an authority grants condonation.
- Finalisation blocked while any objection is `SUBMITTED`/`UNDER_REVIEW`.
- A finalised list is immutable; corrections post-finalisation require a fresh superseding list.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | status transitions |
| `seniority_objections` | objection lifecycle |
| `seniority_entries` | re-rank on upheld |
| `documents`, `notifications`, `workflow_instances` | publish/notify/approve |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists/{id}/publish` | Publish tentative (checker) |
| POST | `/api/v1/seniority-lists/{id}/objections` | File objection |
| POST | `/api/v1/objections/{id}/dispose` | Dispose objection |
| POST | `/api/v1/seniority-lists/{id}/finalise` | Finalise list |

**UI Behavior Notes:** Employee sees own position highlighted; "File Objection" CTA active only in window; officer Kanban of objections by status; finalise button gated with pre-flight checklist.

**Edge Cases:** mass objections on same entry; objection upheld that cascades multiple rank shifts; condonation of late objection; concurrent finalise attempts (idempotent lock).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityPublishService`, `ObjectionService`, `ReRankService`, `WorkflowClient` |
| Backend Flow | publish→checker task→on approve set PUBLISHED_TENTATIVE; objection submit→validate window→workflow; dispose→if upheld call ReRank; finalise→guard open objections→supersede prior→generate PDF→notify |
| Data Operations | UPDATE list status; INSERT/UPDATE objections; UPDATE entries on re-rank (tx); INSERT document, notifications |
| Validation | window dates; objector in scope; no open objections at finalise |
| Authorization | publish/finalise: checker; objection: self; dispose: establishment |
| State Changes & Side Effects | DRAFT→PUBLISHED_TENTATIVE→OBJECTIONS_OPEN/CLOSED→FINALISED→(prior SUPERSEDED); notifications; audit |
| Failure Handling | late objection → `OBJECTION_WINDOW_CLOSED`; finalise with open objections → `OBJECTIONS_PENDING`; PDF gen failure → finalise rolled back |
| Dependencies | M13 documents, notification engine, workflow |
| Test Guidance | window boundary tests; re-rank contiguity after upheld; supersede single-active invariant |

---

### FR-PPP-003 — Configurable Eligibility Rule Engine & Computation

- **Module:** PPP-ELG
- **Primary Role(s):** System Administrator (rule config), HR Promotion Officer (run), Vigilance Officer (attest)
- **User Story:** As an HR Officer, I want the system to compute each employee's promotion eligibility against configured rules so that the eligible field is objective, explainable, and audit-proof.
- **Description:** Evaluates qualifying service, APAR benchmark (read from M08), vigilance/disciplinary status (read from M09), mandatory qualification, and roster applicability per `eligibility_rules`, producing an `eligibility_assessments` record with overall result and itemised pass/fail reasons including sealed-cover handling.

**Acceptance Criteria**
1. Qualifying service computed as continuous service in feeder grade up to `crucial_date`.
2. APAR pass = at least `apar_min_count_meeting_benchmark` of last `apar_lookback_years` meet `apar_benchmark`.
3. Pending disciplinary charge ⇒ result `SEALED_COVER`; current penalty ⇒ `NOT_ELIGIBLE` (per rule flags).
4. Every assessment stores an explainable reason set (`failure_reasons[]`).
5. Re-running re-computes only `DRAFT`/`FIELD_ASSEMBLED` cases; frozen post `DPC_HELD`.

**Business Rules**
- Rules are version-effective-dated; the rule effective on `crucial_date` applies.
- Missing APAR years are treated per policy (e.g., counted as below-benchmark or as gap-blocking alert).
- Vigilance "not cleared" overrides APAR pass.

**Data Model References**

| Entity | Use |
|---|---|
| `eligibility_rules` | rule definition |
| `eligibility_assessments` | computed result |
| `employees` (M01), APAR (M08), disciplinary (M09) | inputs |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{caseId}/compute-eligibility` | Batch compute |
| GET | `/api/v1/employees/{id}/eligibility?caseId=` | Single assessment |
| GET/POST/PUT | `/api/v1/eligibility-rules` | Manage rules |

**UI Behavior Notes:** Eligibility grid with green/amber/red per criterion; hover tooltip shows rule trace; sealed-cover candidates badged; bulk "explain" export.

**Edge Cases:** APAR API timeout (assessment marked `PENDING`, retried); employee with broken service (suspension period) affecting qualifying service; rule changed mid-cycle (snapshot rule used).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `EligibilityEngine`, `QualifyingServiceCalculator`, `AparGateway(M08)`, `DisciplinaryGateway(M09)`, `RuleResolver` |
| Backend Flow | resolve effective rule → compute service → fetch APAR + disciplinary → evaluate gates → derive overall_result + reasons → upsert assessment |
| Data Operations | UPSERT `eligibility_assessments` (snapshot JSON of inputs); audit |
| Validation | case in pre-DPC state; rule active on crucial_date |
| Authorization | `eligibility.compute`; rule mgmt = Sys Admin |
| State Changes & Side Effects | case → ELIGIBILITY_DONE when all assessed; may raise `APAR_GAP_BLOCKING` alerts |
| Failure Handling | upstream M08/M09 unavailable → `UPSTREAM_UNAVAILABLE`, partial save with PENDING, scheduled retry |
| Dependencies | M08, M09, eligibility rules |
| Test Guidance | benchmark counting; sealed-cover path; effective-dated rule selection; broken-service deduction |

---

### FR-PPP-004 — Promotion Case Creation & Eligible-Field Assembly

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer
- **User Story:** As an HR Officer, I want to create a promotion case for a from→to grade with a vacancy count and assemble the zone of consideration so that the DPC evaluates the correct field.
- **Description:** Creates a `promotion_cases` record, computes the zone of consideration (e.g., vacancies × multiplier, extended zone for reserved categories), pulls candidates from the relevant final seniority list, links eligibility assessments, and marks candidates `IN_ZONE`/`EXTENDED_ZONE`/`OUT_OF_ZONE`.

**Acceptance Criteria**
1. Case requires a finalised seniority list for the feeder grade/scope.
2. Zone of consideration computed from configurable multiplier of `vacancy_count`.
3. Candidates ordered by seniority; reserved-category extended zone applied where roster requires.
4. Each candidate links to its eligibility assessment.
5. Case status advances DRAFT → FIELD_ASSEMBLED → ELIGIBILITY_DONE.

**Business Rules**
- Vacancy count must be sanctioned (validated against an establishment input/parameter).
- Zone multiplier and extended-zone rules are configurable.
- Out-of-zone candidates are retained for audit but not placed before DPC unless zone extended with authority.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_cases`, `promotion_candidates` | case + field |
| `seniority_lists`/`seniority_entries` | source ordering |
| `eligibility_assessments` | linkage |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases` | Create case |
| POST | `/api/v1/promotion-cases/{id}/assemble-field` | Build candidate field |
| GET | `/api/v1/promotion-cases/{id}/candidates` | List candidates |

**UI Behavior Notes:** Case header with vacancy + zone summary cards; candidate table with zone band coloring and eligibility chips; "Assemble Field" action with preview of who falls in/out of zone.

**Edge Cases:** insufficient eligible candidates for vacancies (under-filled case warning); tied seniority at zone boundary (include both); reserved vacancies exceed eligible reserved candidates (roster carry-forward trigger).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PromotionCaseService`, `ZoneCalculator`, `CandidateAssembler` |
| Backend Flow | create case → fetch final seniority list → compute zone size → select top-N (+ extended) → create candidates → link eligibility → set status |
| Data Operations | INSERT case; bulk INSERT candidates; audit |
| Validation | final list exists; vacancy_count ≥ 0; rule present |
| Authorization | `promotion.case.create` + scope |
| State Changes & Side Effects | case status transitions; may flag under-fill |
| Failure Handling | no final list → `SENIORITY_LIST_NOT_FINAL`; empty field → `NO_ELIGIBLE_CANDIDATES` warning (case stays DRAFT) |
| Dependencies | FR-001/002 (seniority), FR-003 (eligibility) |
| Test Guidance | zone math; boundary tie inclusion; extended-zone reserved logic |

---

### FR-PPP-005 — DPC / Promotion Panel Constitution & Proceedings

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer (constitute), DPC Secretary, DPC Members, Appointing Authority (approve)
- **User Story:** As a DPC Secretary, I want to constitute the committee, record attendance/quorum, capture each candidate's fitness verdict against the benchmark, and compile a select list so that the promotion decision is statutorily valid.
- **Description:** Constitutes a `promotion_panels` with members (internal + external/commission nominee), records `dpc_proceedings` (benchmark applied, quorum, minutes), captures per-candidate `dpc_verdict`, builds a select list + reserve list + sealed-cover list, and routes for appointing-authority approval.

**Acceptance Criteria**
1. Panel constitution validates quorum config and conflict-of-interest recusal (candidate cannot be member).
2. Proceedings record benchmark, quorum-met flag, and a minutes document.
3. Each in-zone candidate receives a verdict; sealed-cover candidates flagged and excluded from effected select list.
4. Select-list count ≤ vacancy count; reserve list ordered.
5. Approval by appointing authority is a checker step distinct from the secretary/maker.

**Business Rules**
- Quorum must be met for a valid sitting; otherwise meeting recorded as adjourned.
- Benchmark applied must match the rule's `apar_benchmark` unless an authority records a deviation.
- Supersession (placing a junior above a senior) requires recorded reasons.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_panels`, `promotion_panel_members` | committee |
| `dpc_proceedings` | meeting record |
| `promotion_candidates` | verdict + select rank |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/panels` | Constitute panel |
| POST | `/api/v1/panels/{id}/proceedings` | Record proceedings |
| PATCH | `/api/v1/candidates/{id}/verdict` | Set candidate verdict |
| POST | `/api/v1/promotion-cases/{id}/select-list/approve` | Approve select list |

**UI Behavior Notes:** Panel builder with recusal warnings; live quorum indicator; candidate evaluation grid with verdict dropdown + benchmark reference; minutes upload; select-list approval screen with vacancy/roster reconciliation panel.

**Edge Cases:** member recuses mid-meeting dropping below quorum; benchmark deviation; supersession requiring reason; sealed-cover candidate later cleared (FR-008 re-open path).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PanelService`, `ProceedingsService`, `VerdictService`, `SelectListBuilder`, `WorkflowClient` |
| Backend Flow | constitute → validate recusal/quorum → record proceedings → capture verdicts → build select/reserve/sealed lists → checker approval → set case SELECT_LIST_APPROVED |
| Data Operations | INSERT panel + members + proceedings; UPDATE candidates verdict/rank/is_selected (tx); INSERT minutes document |
| Validation | quorum; no candidate-as-member; select count ≤ vacancies |
| Authorization | constitute: HR; verdict: members; approve: appointing authority |
| State Changes & Side Effects | case → DPC_HELD → SELECT_LIST_APPROVED; roster points provisionally tagged (FR-006); audit |
| Failure Handling | quorum fail → `QUORUM_NOT_MET`; conflict member → `PANEL_CONFLICT_OF_INTEREST`; over-selection → `VACANCY_EXCEEDED` |
| Dependencies | FR-004 field, FR-006 roster, workflow, M13 |
| Test Guidance | quorum/recusal; select-cap; supersession reason mandatory; maker≠checker |

---

### FR-PPP-006 — Reservation Roster Management & Compliance

- **Module:** PPP-ROS
- **Primary Role(s):** Reservation/Roster Officer (maker), Appointing Authority (checker)
- **User Story:** As a Roster Officer, I want to maintain the reservation roster and validate that each promotion fills the correct roster point so that reservation policy (SC/ST/OBC/EWS/PwBD), carry-forward, and de-reservation are demonstrably compliant.
- **Description:** Maintains `reservation_rosters` and `roster_points`, assigns selected candidates to roster points by category, handles carry-forward of unfilled reserved points and de-reservation/interchange with recorded authority, and produces a roster-compliance report reconciling the case's selections against policy.

**Acceptance Criteria**
1. Each selected candidate maps to a roster point matching their reservation category, or an explicitly de-reserved/interchanged point.
2. Unfilled reserved points are carried forward (linked) rather than silently dropped.
3. Roster compliance report shows points filled vs. due per category with deviations.
4. De-reservation/interchange requires authority reference and is audited.
5. Roster point cannot be double-filled.

**Business Rules**
- Reservation percentages and cycle size are policy configuration.
- Backlog/carry-forward vacancies are prioritised per policy before fresh points.
- PwBD horizontal reservation applied across categories per policy.

**Data Model References**

| Entity | Use |
|---|---|
| `reservation_rosters`, `roster_points` | register |
| `promotion_candidates` | filling |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/rosters` | Create roster |
| POST | `/api/v1/rosters/{id}/points/{pointId}/fill` | Fill point |
| POST | `/api/v1/rosters/{id}/points/{pointId}/de-reserve` | De-reserve/interchange |
| GET | `/api/v1/promotion-cases/{id}/roster-compliance` | Compliance report |

**UI Behavior Notes:** 100-point roster grid with category color legend; filled/vacant/carried-forward states; compliance panel with category tallies and deviation flags; de-reserve action with mandatory authority field.

**Edge Cases:** no eligible reserved candidate (carry-forward + possible de-reservation after policy limit); interchange between SC/ST; EWS roster overlap; over-reservation breaching 50% ceiling (warning).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `RosterService`, `RosterComplianceCalculator`, `CarryForwardEngine` |
| Backend Flow | on select-list approval → match candidates to points by category → carry forward unfilled reserved → emit compliance report |
| Data Operations | UPDATE roster_points (FILLED/CARRIED_FORWARD/DE_RESERVED) in tx; audit |
| Validation | category match; no double-fill; ceiling checks |
| Authorization | fill: roster officer; de-reserve: checker |
| State Changes & Side Effects | roster points status; compliance artefact; audit |
| Failure Handling | double-fill → `ROSTER_POINT_OCCUPIED`; category mismatch → `ROSTER_CATEGORY_MISMATCH` |
| Dependencies | FR-005 select list |
| Test Guidance | carry-forward linkage; ceiling warning; interchange authority required |

---

### FR-PPP-007 — Promotion Order Generation, Acceptance & SR Posting

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer (maker), Appointing Authority (checker)
- **User Story:** As an HR Officer, I want to generate promotion orders for selected candidates, capture acceptance, and post the event to the Digital Service Register so that the promotion is legally effected and permanently recorded.
- **Description:** Generates `promotion_orders` from approved select-list candidates, produces the order document (M13), captures acceptance/decline (with deemed acceptance after a window), transitions order to `EFFECTED`, and writes an idempotent SR event to M12 — all transactionally.

**Acceptance Criteria**
1. Orders generate only for `is_selected=true, dpc_verdict=FIT` candidates.
2. Each order carries from/to designation + pay scale, effective (and optional notional) date.
3. Acceptance window enforced; non-response after window ⇒ `DEEMED_ACCEPTED` per policy.
4. On `EFFECTED`, an SR event is posted to M12 with `sr_event_id` stored; `employees.designation_id` update is initiated for M01.
5. Order issue + SR posting + notification occur in one transaction; partial failure rolls back.

**Business Rules**
- A declined promotion is recorded; the next reserve-list candidate may be considered per policy.
- Notional dates require authority reference; affect seniority, not arrears unless sanctioned.
- Order numbering is gap-free per series.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_orders` | order record |
| `promotion_candidates` | source |
| `service_register_events` (M12), `documents` (M13), `notifications` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/orders/generate` | Bulk-generate orders |
| POST | `/api/v1/orders/{id}/accept` | Record acceptance |
| POST | `/api/v1/orders/{id}/effect` | Effect + SR post |
| GET | `/api/v1/orders/{id}` | Fetch order |

**UI Behavior Notes:** Batch order generation with preview; per-order status chips; acceptance capture (self-service or on behalf); "Effect & Post to SR" action shows SR confirmation; declined orders surface reserve-list suggestion.

**Edge Cases:** SR (M12) unavailable at effect time (order held in `ISSUED`, retried, not falsely EFFECTED); duplicate effect call (idempotent on SR key); candidate retires/dies between selection and order (order cancelled, SR not posted).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OrderService`, `OrderNumberGenerator`, `SrPostingGateway(M12)`, `EmployeeUpdateGateway(M01)`, `DocumentService(M13)` |
| Backend Flow | generate (validate selected) → render document → checker issue → acceptance → effect: tx{update order EFFECTED, post SR (idempotent key=order_id), notify, signal M01 designation change} |
| Data Operations | INSERT orders; UPDATE acceptance/status; INSERT document; INSERT service_register_events; audit |
| Validation | candidate selected+FIT; effective ≥ approval date; series continuity |
| Authorization | generate: HR; effect/issue: appointing authority |
| State Changes & Side Effects | DRAFT→ISSUED→(ACCEPTED/DEEMED)→EFFECTED; SR posted; M01 designation update; probation auto-created (FR-009) |
| Failure Handling | SR down → keep ISSUED, `UPSTREAM_UNAVAILABLE`, retry queue; tx rollback on any failure (no orphan SR) |
| Dependencies | FR-005/006, M12, M13, M01 |
| Test Guidance | idempotent SR posting; deemed-acceptance timer; rollback on SR failure; series gap-free |

---

### FR-PPP-008 — Sealed Cover Handling & Deferred/Review DPC

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer, Vigilance Officer, Appointing Authority
- **User Story:** As an HR Officer, I want to keep promotion recommendations of employees with pending disciplinary/vigilance proceedings in a sealed cover and open it on case conclusion so that due process is honoured without prejudicing or pre-judging the employee.
- **Description:** When eligibility yields `SEALED_COVER`, the DPC still assesses fitness but the recommendation is sealed; the post is filled provisionally/kept vacant per policy; on conclusion of the disciplinary case (M09 signal), a Review DPC opens the cover and either effects promotion (with notional date/seniority) or records supersession.

**Acceptance Criteria**
1. Sealed-cover candidates are flagged; their verdict is recorded but not effected.
2. The system tracks the linked M09 case and listens for its conclusion.
3. On exoneration, a Review DPC effects the promotion with notional date preserving seniority.
4. On penalty, the sealed cover results in supersession/deferral per policy, audited.
5. Sealed-cover status visible only to authorised roles.

**Business Rules**
- Sealed cover cannot remain open indefinitely; periodic review reminders generated.
- Notional promotion on exoneration may carry arrears only if separately sanctioned.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_candidates` (dpc_verdict=SEALED_COVER) | sealed record |
| `eligibility_assessments` (SEALED_COVER) | source |
| `promotion_orders` (notional_date) | on opening |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/sealed-covers?status=open` | List sealed covers |
| POST | `/api/v1/sealed-covers/{candidateId}/review` | Open cover via Review DPC |

**UI Behavior Notes:** Restricted "Sealed Covers" workspace; linked disciplinary case status badge; review action gated until M09 conclusion; notional-date input on opening.

**Edge Cases:** disciplinary case partially upheld (minor penalty) — policy decides; employee retires while sealed (handled per pension rules, flagged to M11); multiple sealed covers across cycles.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SealedCoverService`, `DisciplinaryGateway(M09)`, `ReviewDpcService` |
| Backend Flow | on SEALED_COVER verdict → mark sealed → subscribe to M09 conclusion → on signal → Review DPC → effect (notional) or supersede |
| Data Operations | UPDATE candidate/verdict; INSERT order on opening; audit; SR post if effected |
| Validation | M09 case concluded before opening; authority for notional date |
| Authorization | restricted to vigilance/appointing roles |
| State Changes & Side Effects | sealed→opened→(EFFECTED notional / SUPERSEDED); reminders |
| Failure Handling | M09 signal missing → periodic review alert; cannot open prematurely → `SEALED_COVER_NOT_REVIEWABLE` |
| Dependencies | M09, FR-005, FR-007 |
| Test Guidance | exoneration notional path; penalty supersession; restricted visibility |

---

### FR-PPP-009 — Probation Lifecycle on Promotion

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer, Reporting Manager (input), Appointing Authority (declare)
- **User Story:** As an HR Officer, I want promotion to optionally start a probation period that is tracked, extendable, and concluded by a satisfactory declaration so that confirmation in the promoted grade is properly governed.
- **Description:** On effecting a promotion that carries probation, the system creates `probation_records`, schedules the end date, raises a `PROBATION_ENDING` alert before due, supports extension or reversion, and records the satisfactory-completion declaration (which posts a confirmation SR event).

**Acceptance Criteria**
1. Probation auto-created when the promotion grade has a configured probation period.
2. `scheduled_end = probation_start + probation_months`.
3. Alert raised configurable days before `scheduled_end`.
4. Extension records new `extended_to` and reason; reversion transitions employee back and audits.
5. Satisfactory declaration sets `DECLARED_SATISFACTORY` and posts a confirmation SR event.

**Business Rules**
- Multiple extensions allowed up to a policy cap.
- Reversion during probation reverses the promotion order (`SUPERSEDED`) with SR posting.

**Data Model References**

| Entity | Use |
|---|---|
| `probation_records` | lifecycle |
| `promotion_orders` | source/linkage |
| `service_register_events`, `progression_alerts` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/probations?status=on_probation` | List |
| POST | `/api/v1/probations/{id}/extend` | Extend |
| POST | `/api/v1/probations/{id}/declare` | Declare satisfactory |
| POST | `/api/v1/probations/{id}/revert` | Revert |

**UI Behavior Notes:** Probation tracker with countdown; extension modal (reason mandatory); declare action with checklist; reverted cases clearly badged.

**Edge Cases:** declaration after long delay (deemed-confirmation policy); reversion after partial service; extension beyond cap (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProbationService`, `ProbationScheduler`, `SrPostingGateway` |
| Backend Flow | on order EFFECTED with probation → create record → scheduler raises alert pre-end → extend/declare/revert handlers |
| Data Operations | INSERT/UPDATE probation_records; SR post on declare/revert; audit |
| Validation | period elapsed before declare; extension within cap |
| Authorization | declare/revert: appointing authority |
| State Changes & Side Effects | ON_PROBATION→EXTENDED→DECLARED_SATISFACTORY / REVERTED; SR events |
| Failure Handling | extension over cap → `PROBATION_EXTENSION_LIMIT`; declare before period → `PROBATION_NOT_COMPLETE` |
| Dependencies | FR-007, M12 |
| Test Guidance | end-date arithmetic; alert timing; revert reverses order + SR |

---

### FR-PPP-010 — Ad-hoc / Officiating / In-situ Promotion

- **Module:** PPP-OFF
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As a Department Head, I want to place an employee in a higher post on ad-hoc/officiating/in-situ basis pending a regular DPC so that operational continuity is maintained without bypassing due process.
- **Description:** Creates `officiating_arrangements` of a chosen type with start (and optional end) dates, optional officiating pay, links to a pending regular promotion case, supports extension/termination, and regularises into a regular promotion order when the DPC concludes (preserving service for seniority/MACP as policy allows).

**Acceptance Criteria**
1. Arrangement records type, post, org unit, dates, and pay eligibility.
2. Ad-hoc/officiating duration tracked; extensions audited; lapses auto-flagged.
3. Linking to a regular case enables one-click regularisation on DPC selection.
4. Regularisation creates a regular order and closes the arrangement (`REGULARISED`).
5. Arrangement posts an SR event (officiating start/end).

**Business Rules**
- Ad-hoc promotion confers no automatic seniority unless regularised.
- Officiating pay allowed only when the arrangement type/policy permits.
- An employee cannot hold two conflicting upward arrangements for the same post simultaneously.

**Data Model References**

| Entity | Use |
|---|---|
| `officiating_arrangements` | record |
| `promotion_cases`, `promotion_orders` | linkage/regularisation |
| `service_register_events` | postings |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/officiating` | Create arrangement |
| POST | `/api/v1/officiating/{id}/extend` | Extend |
| POST | `/api/v1/officiating/{id}/regularise` | Regularise to order |
| POST | `/api/v1/officiating/{id}/terminate` | Terminate |

**UI Behavior Notes:** Arrangement form with type and pay toggle; active-arrangements list with duration meter; regularise CTA appears when linked case is `SELECT_LIST_APPROVED`.

**Edge Cases:** officiating exceeds permissible duration (compliance flag); regular DPC supersedes the officiating incumbent (officiating terminated, not regularised); overlapping arrangements (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OfficiatingService`, `RegularisationService`, `SrPostingGateway` |
| Backend Flow | create → SR post (start) → extend/terminate → regularise: create regular order, close arrangement, SR post |
| Data Operations | INSERT/UPDATE officiating_arrangements; INSERT order on regularise; SR events; audit |
| Validation | no overlapping arrangement; pay flag per policy |
| Authorization | create: dept head/HR; regularise: appointing authority |
| State Changes & Side Effects | ACTIVE→EXTENDED→REGULARISED/TERMINATED/LAPSED; SR |
| Failure Handling | overlap → `OFFICIATING_OVERLAP`; regularise without linked selection → `NO_REGULAR_SELECTION` |
| Dependencies | FR-005/007, M12 |
| Test Guidance | duration tracking; regularisation linkage; overlap prevention |

---

### FR-PPP-011 — Financial Up-gradation (ACP/MACP) Sanction

- **Module:** PPP-FIN
- **Primary Role(s):** HR Promotion Officer (maker), Screening Committee, Appointing Authority (sanction)
- **User Story:** As an HR Officer, I want the system to detect when an employee is due for a financial up-gradation (TBP/ACP/MACP) on completing qualifying service and to process the screening and sanction so that stagnating employees get assured pay progression on time.
- **Description:** Continuously evaluates qualifying service to flag `financial_upgradations` as `DUE`, runs a screening-committee assessment (`macp_assessments`) against the benchmark, applies the up-gradation cap (max three, counting regular promotions), sanctions the next pay level, generates a MACP order (reusing FR-007), and posts the SR + hands the pay event to M10.

**Acceptance Criteria**
1. Due detection on completing the configured qualifying service (e.g., 10/20/30 years) with no qualifying promotion in the interim.
2. Screening assessment records benchmark-met; failing benchmark defers per policy.
3. Total financial up-gradations + regular promotions capped per policy (default 3).
4. Sanction grants the next pay level effective from due date; deferred if penalty current.
5. Sanction creates a `MACP` order, posts SR, and emits a pay-fixation event to M10.

**Business Rules**
- MACP counts promotions already availed; a regular promotion may reset/adjust the MACP clock per policy.
- Refusal of regular promotion may affect MACP entitlement per policy.
- Deferral on disciplinary penalty currency; re-evaluated on penalty expiry.

**Data Model References**

| Entity | Use |
|---|---|
| `financial_upgradations`, `macp_assessments` | record + screening |
| `promotion_orders` (type=MACP) | order |
| `service_register_events`, M10 pay event | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/financial-upgradations?status=due` | Due list |
| POST | `/api/v1/financial-upgradations/{id}/screen` | Screening assessment |
| POST | `/api/v1/financial-upgradations/{id}/sanction` | Sanction + order + SR |
| POST | `/api/v1/financial-upgradations/{id}/defer` | Defer |

**UI Behavior Notes:** MACP due dashboard with countdown and cap tracker; screening form with benchmark; sanction action shows pay-level change preview; deferred items with reason.

**Edge Cases:** employee took regular promotion shortly before MACP due (recompute clock); penalty imposed between due and sanction (defer); cap reached (no further up-gradation, informational).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `MacpEngine`, `QualifyingServiceCalculator`, `ScreeningService`, `OrderService`, `PayEventGateway(M10)`, `SrPostingGateway` |
| Backend Flow | scheduler computes due → create DUE record + alert → screen → sanction: tx{create MACP order, post SR, emit M10 pay event, set EFFECTED} |
| Data Operations | INSERT financial_upgradations + macp_assessments; INSERT order; SR event; audit |
| Validation | qualifying service met; cap not exceeded; no current penalty |
| Authorization | sanction: appointing authority; screen: committee |
| State Changes & Side Effects | DUE→UNDER_SCREENING→SANCTIONED→EFFECTED / DEFERRED/REJECTED; SR; M10 event |
| Failure Handling | cap exceeded → `MACP_CAP_REACHED`; penalty current → auto-defer; M10 down → SR held, retry |
| Dependencies | M08 (benchmark), M09 (penalty), M10 (pay), M12 |
| Test Guidance | due arithmetic; cap with promotions; defer-on-penalty; clock recompute |

---

### FR-PPP-012 — Posting after Promotion

- **Module:** PPP-POST
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As an HR Officer, I want to post a promoted employee to a specific post/station and drive the relieving/joining through the transfer workflow so that the promotion translates into an actual placement with a clean service record.
- **Description:** Creates `promotion_postings` for an effected promotion, selects the destination org unit/post and posting type, hands a movement to the M05 relieving/joining workflow, tracks relieving and joining, and posts the posting/joining SR event on completion.

**Acceptance Criteria**
1. Posting can be created only for an `EFFECTED` promotion order.
2. Destination post/org unit validated as sanctioned/vacant.
3. M05 movement reference stored; status reflects RELIEVED/JOINED.
4. Report-by date enforced; non-joining handled per policy.
5. On JOINED, a posting SR event is posted and `employees.org_unit_id` update initiated for M01.

**Business Rules**
- A promotion may be local (no station change) or out-station (full relieving/joining).
- Failure to join by deadline may lead to order review per policy.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_postings` | posting record |
| `promotion_orders` | source |
| M05 movement, `service_register_events` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/orders/{id}/postings` | Create posting |
| GET | `/api/v1/postings/{id}` | Status |
| POST | `/api/v1/postings/{id}/sync-movement` | Sync with M05 |

**UI Behavior Notes:** Posting form with destination picker and vacancy check; movement status timeline (relieved → in-transit → joined); report-by countdown.

**Edge Cases:** no vacant post at destination (blocked/queued); employee declines posting (links to acceptance in FR-007); local promotion (skip relieving, immediate join).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PostingService`, `M05MovementGateway`, `SrPostingGateway`, `EmployeeUpdateGateway(M01)` |
| Backend Flow | validate order EFFECTED → create posting → if out-station, create M05 movement → sync statuses → on JOINED post SR + signal M01 |
| Data Operations | INSERT/UPDATE promotion_postings; SR on joined; audit |
| Validation | order EFFECTED; destination sanctioned/vacant |
| Authorization | create: HR/dept head; approve: appointing authority |
| State Changes & Side Effects | PENDING→RELIEVED→JOINED; SR; M01 org_unit update |
| Failure Handling | no vacancy → `POST_NOT_AVAILABLE`; not joined by deadline → alert + policy review |
| Dependencies | FR-007, M05, M12, M01 |
| Test Guidance | local vs out-station; M05 sync; SR on joined |

---

### FR-PPP-013 — Progression Monitoring (Due-for-Promotion, Stagnation, Increment)

- **Module:** PPP-MON
- **Primary Role(s):** HR Officer, Reporting Manager, Employee (self), System (scheduler)
- **User Story:** As an HR Officer, I want the system to proactively flag who is due for promotion, who is stagnating, whose increment is due, and whose probation/APAR blocks progression so that no entitlement is missed and no employee stagnates unseen.
- **Description:** A scheduled engine evaluates each employee against career rules and generates `progression_alerts` (DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING) and maintains `increment_monitor` rows; surfaces dashboards and self-service progression timelines; supports acknowledgement/action.

**Acceptance Criteria**
1. Alerts generated on configurable lead time before due dates; deduplicated per employee/type/cycle.
2. Stagnation defined as years in grade beyond a configurable threshold without promotion/up-gradation.
3. Increment due rows track ANNUAL/STAGNATION/EFFICIENCY_BAR with release/withhold status.
4. Employees see their own progression timeline and open alerts.
5. Alerts can be acknowledged, actioned (linking to a case/MACP), or dismissed with reason.

**Business Rules**
- Alert thresholds are configuration per cadre/grade.
- APAR gaps blocking eligibility raise `APAR_GAP_BLOCKING` to prompt M08 follow-up.
- Increment withheld due to penalty (M09) is reflected and auto-released on expiry.

**Data Model References**

| Entity | Use |
|---|---|
| `progression_alerts`, `increment_monitor` | monitoring |
| `eligibility_assessments`, `financial_upgradations` | inputs |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/progression/alerts?type=&status=` | List alerts |
| POST | `/api/v1/progression/alerts/{id}/acknowledge` | Acknowledge |
| GET | `/api/v1/employees/{id}/progression-timeline` | Self timeline |
| POST | `/api/v1/progression/run` | Trigger run (admin) |

**UI Behavior Notes:** HR monitoring dashboard with alert counts by type/severity; filters by cadre/org; employee self-service timeline (joining → grades → promotions → upcoming due dates); increment register grid.

**Edge Cases:** employee due in two cycles simultaneously (dedupe by cycle); alert generated then employee promoted (alert auto-closed); increment withheld then penalty set aside (auto-release).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProgressionEngine`, `AlertScheduler`, `IncrementMonitorService`, `EligibilityEngine(reuse)` |
| Backend Flow | nightly job → evaluate each in-scope employee → compute due/stagnation/increment → upsert alerts (dedupe) → notify; ack/action handlers |
| Data Operations | UPSERT progression_alerts, increment_monitor; notifications; audit |
| Validation | dedupe key (employee+type+cycle); thresholds present |
| Authorization | HR/manager read scope; employee self only |
| State Changes & Side Effects | alerts OPEN→ACKNOWLEDGED→ACTIONED/DISMISSED/EXPIRED; notifications |
| Failure Handling | job partial failure → resumable checkpoint; missing thresholds → config alert |
| Dependencies | FR-003/011, M08, M09 |
| Test Guidance | dedupe; auto-close on promotion; stagnation threshold; increment withhold/release |

---

### FR-PPP-014 — Career-Path Modelling, Succession Planning & Eligibility Dashboard

- **Module:** PPP-CAR
- **Primary Role(s):** HR Officer, Department Head, System Administrator (templates), Employee (self view)
- **User Story:** As a Department Head, I want to model career paths, maintain succession plans for critical positions, and view eligibility dashboards so that the organisation plans talent flow and an employee understands their growth route.
- **Description:** Defines `career_paths` with ordered `career_path_stages` (designation, typical tenure, competencies linked to M07), builds `succession_plans` with ranked `succession_candidates` and readiness levels for critical positions, and presents an eligibility dashboard projecting who becomes eligible when.

**Acceptance Criteria**
1. A career path is an ordered sequence of designations with typical tenure and competency links.
2. Employees can view their mapped career path and next stage with projected eligibility date.
3. Succession plans identify critical positions, incumbents, risk of loss, and ranked successors with readiness.
4. Eligibility dashboard projects upcoming eligible cohorts per grade/cycle.
5. Templates are configurable by admin; plans are versioned.

**Business Rules**
- Career-path stages must reference valid designations; ordering unique and contiguous.
- Succession readiness derived from tenure, APAR, and competency coverage (advisory, not auto-promotion).
- Critical-position risk is set by HR/dept head, not auto-computed (may be assisted).

**Data Model References**

| Entity | Use |
|---|---|
| `career_paths`, `career_path_stages` | path model |
| `succession_plans`, `succession_candidates` | succession |
| `eligibility_assessments` | dashboard projection |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/PUT | `/api/v1/career-paths` | Manage paths |
| GET | `/api/v1/employees/{id}/career-path` | Self path |
| GET/POST | `/api/v1/succession-plans` | Manage plans |
| GET | `/api/v1/eligibility-dashboard?grade=&cycle=` | Projection |

**UI Behavior Notes:** Career-path visual stepper; succession "9-box"-style readiness grid; eligibility dashboard with cohort projection and drill-down; employee self-service growth view.

**Edge Cases:** position with no ready successor (bench-risk highlight); employee mapped to multiple paths (primary path flagged); designation deprecated mid-path (path versioned).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `CareerPathService`, `SuccessionService`, `EligibilityProjectionService`, `CompetencyGateway(M07)` |
| Backend Flow | manage path templates → map employees → compute projected eligibility (reuse engine) → render dashboards; succession plan CRUD with readiness |
| Data Operations | CRUD career_paths/stages, succession_plans/candidates; audit |
| Validation | contiguous stage order; valid designations; readiness enum |
| Authorization | template: admin; plans: HR/dept head; self view: employee |
| State Changes & Side Effects | plan status DRAFT→ACTIVE→REVIEWED→ARCHIVED |
| Failure Handling | invalid stage order → `CAREER_PATH_INVALID`; deprecated designation → version + warn |
| Dependencies | M07 competencies, FR-003 |
| Test Guidance | stage ordering; projection accuracy; readiness grid; self-view scoping |

---

## Section 7 — UI Requirements

### 7.1 Screen inventory

| Screen | Primary roles | Key elements | States covered |
|---|---|---|---|
| Seniority Workbench | Est. Officer | Scope wizard, ranked grid, override modal, publish/finalise | empty, loading, error, success, permission |
| Tentative List (Employee) | Employee | Own position highlight, file-objection CTA (window-gated) | empty, window-closed, success |
| Objection Manager | Est. Officer | Kanban by status, disposal modal | empty, loading, error |
| Eligibility Grid | HR Officer | Criterion chips (R/A/G), rule-trace tooltip, sealed-cover badge | loading, partial (PENDING), error |
| Promotion Case Console | HR Officer | Case header cards, candidate field, zone bands | empty, under-fill warning |
| DPC Workspace | DPC Sec/Members | Panel builder (recusal), quorum meter, verdict grid, minutes upload | error (quorum/conflict) |
| Select List Approval | Appointing Auth. | Vacancy/roster reconciliation, approve | error (vacancy exceeded) |
| Roster Grid | Roster Officer | 100-point grid, category legend, compliance panel, de-reserve modal | error (double-fill) |
| Orders Console | HR Officer | Batch generate, acceptance capture, effect & SR confirm | error (SR down), success |
| Sealed Cover Workspace | Vigilance/Auth. | Restricted list, M09 status badge, review action | permission, empty |
| Probation Tracker | HR Officer | Countdown, extend/declare/revert | success, blocked (cap) |
| Officiating Console | Dept Head | Arrangement form, duration meter, regularise CTA | overlap error |
| MACP Dashboard | HR Officer | Due countdown, cap tracker, screen/sanction, pay preview | deferred state |
| Posting Console | HR Officer | Destination picker, movement timeline, report-by countdown | no-vacancy error |
| Progression Monitoring Dashboard | HR/Manager | Alert counts by type/severity, filters | empty, loading |
| Employee Progression Timeline | Employee | Career timeline, upcoming due dates, open alerts | empty, success |
| Career-Path & Succession | HR/Dept Head | Path stepper, readiness grid, eligibility projection | empty, bench-risk |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA: keyboard navigable grids, focus-visible, ARIA on status chips and countdowns; color is never the sole signal (icon + label with category/severity color).
- Dark mode supported via design tokens; no hardcoded colors.
- Every list paginated (max 100), with server-side sort/filter; empty/loading/error/success/permission states explicit (no skeleton-only screens).
- Destructive/statutory actions (finalise, effect order, sanction MACP, revert probation) require confirmation with summary of side effects (SR posting, pay change).
- Dates display DD-MMM-YYYY; money INR formatted; all times shown in user timezone.
- Row-level scoping: users see only data within their org/cadre authorisation.

---

## Section 8 — (reserved — see Section 9 API & Integration)

> Section numbering follows the 16-section authoring standard; API & Integration is consolidated in Section 9.

---

## Section 9 — API & Integration

### 9.1 Conventions

- Base path `/api/v1`; JSON; JWT bearer; RBAC + org scoping enforced server-side.
- All list endpoints support `?page=&limit=` (max 100), `?sort=`, and resource-specific filters; responses include `pagination` metadata.
- Idempotency: SR-posting and order-effecting endpoints accept an `Idempotency-Key` header; SR writes keyed by `source_module=M06` + `source_event_id`.

### 9.2 Canonical error envelope

```json
{
  "error": { "code": "VACANCY_EXCEEDED", "message": "Selected candidates (13) exceed sanctioned vacancies (12).", "field": "select_list" },
  "requestId": "req-9f2c1a7e"
}
```

### 9.3 Module error-code catalog

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Generic input validation |
| AUTH_REQUIRED | 401 | Missing/invalid token |
| FORBIDDEN | 403 | Role/scope not permitted |
| NOT_FOUND | 404 | Resource absent |
| CONFLICT | 409 | Generic state conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unexpected |
| UPSTREAM_UNAVAILABLE | 503 | M08/M09/M10/M12 dependency down |
| SENIORITY_RANK_CONFLICT | 409 | Duplicate/gap rank on publish |
| OBJECTION_WINDOW_CLOSED | 409 | Objection filed outside window |
| OBJECTIONS_PENDING | 409 | Finalise blocked by open objections |
| SENIORITY_LIST_NOT_FINAL | 409 | Case needs a finalised list |
| NO_ELIGIBLE_CANDIDATES | 409 | Field empty |
| QUORUM_NOT_MET | 409 | DPC quorum failure |
| PANEL_CONFLICT_OF_INTEREST | 409 | Candidate cannot be panel member |
| VACANCY_EXCEEDED | 409 | Select count > vacancies |
| ROSTER_POINT_OCCUPIED | 409 | Double-fill attempt |
| ROSTER_CATEGORY_MISMATCH | 409 | Wrong category fill |
| SEALED_COVER_NOT_REVIEWABLE | 409 | M09 case not concluded |
| PROBATION_NOT_COMPLETE | 409 | Declare before period elapsed |
| PROBATION_EXTENSION_LIMIT | 409 | Extension over cap |
| OFFICIATING_OVERLAP | 409 | Conflicting arrangement |
| NO_REGULAR_SELECTION | 409 | Regularise without selection |
| MACP_CAP_REACHED | 409 | Up-gradation cap exhausted |
| POST_NOT_AVAILABLE | 409 | Destination post unavailable |
| SR_POSTING_FAILED | 503 | SR write to M12 failed (held for retry) |

### 9.4 Representative JSON examples

**Create promotion case (request)**
```json
{
  "from_grade_id": "desg-ASO",
  "to_grade_id": "desg-SO",
  "cadre_id": "cad-ASO",
  "vacancy_count": 12,
  "vacancy_year": 2026,
  "promotion_mode": "SENIORITY_CUM_FITNESS",
  "eligibility_rule_id": "rule-ASO-SO",
  "crucial_date": "2026-01-01"
}
```

**Compute eligibility (response, excerpt)**
```json
{
  "caseId": "pc-2026-ASO-SO",
  "assessed": 28,
  "results": [
    { "employee_id": "emp-1001", "overall_result": "ELIGIBLE", "qualifying_service_years": 13.6, "apar_pass": true, "vigilance_status": "CLEAR" },
    { "employee_id": "emp-1042", "overall_result": "SEALED_COVER", "disciplinary_status": "CHARGE_PENDING", "failure_reasons": ["VIGILANCE_PENDING"] }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 28 }
}
```

**Effect promotion order (response)**
```json
{
  "order_id": "ord-01",
  "order_no": "PROM-ORD/2026/001",
  "status": "EFFECTED",
  "sr_event_id": "sr-evt-55012",
  "effective_date": "2026-04-01"
}
```

### 9.5 Integration contracts

| Integration | Direction | Contract |
|---|---|---|
| M01 Employee master | read + write-signal | Read person/job/designation; signal designation/org_unit change on effect/join |
| M08 APAR | read | `GET /m08/apar?employeeId=&years=`: grading + benchmark band per year |
| M09 Disciplinary/Vigilance | read + event | Status read; subscribe to case-conclusion events for sealed cover |
| M10 Payroll | event | Emit pay-fixation event on MACP/promotion effect |
| M12 Digital SR | write (idempotent) | Append service event keyed by source_event_id |
| M13 Documents | read/write | Upload/version orders, minutes, lists |
| M05 Transfer | create/sync | Create relieving/joining movement for out-station postings |
| M07 Training | read | Competency references for career-path stages |
| Notifications | write | Alerts, invitations, acknowledgements |

---

## Section 10 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 < 500ms for reads; eligibility batch compute of 5,000 employees < 5 min (async with progress); seniority list (10k entries) generation < 60s |
| Scalability | Horizontal stateless API; batch jobs partitioned by cadre/org for parallelism |
| Availability | 99.9% uptime; SR-posting retries with backoff; degraded read mode if M08/M09 down |
| Consistency | Statutory writes (order effect, MACP sanction, select-list approval) are ACID transactions; SR posting idempotent |
| Security | OWASP ASVS; RBAC + row-level org scoping; sealed-cover data restricted; parameterised queries only; secrets via env |
| Privacy | DPDP Act 2023 alignment; PII minimisation in comparative views; reservation category masked from unauthorised roles |
| Auditability | Every state change in `audit_log`; statutory artefacts immutable & versioned; full reconstruction of any promotion decision |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Structured logs with requestId; metrics on batch durations, SR-posting success rate, alert generation counts; alerting on SR-post failure backlog |
| Retention | Seniority lists, DPC minutes, orders retained per statutory schedule (typically permanent for service-record-linked artefacts) |
| Recovery | RPO ≤ 15min; RTO ≤ 4h |
| Localisation | DD-MMM-YYYY, INR, timezone-aware; i18n-ready labels |

---

## Section 11 — Workflow & State Diagrams (State Tables)

### 11.1 Seniority list lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | DRAFT | scope valid | entries generated |
| DRAFT | publish (checker) | PUBLISHED_TENTATIVE | ranks contiguous | baseline frozen |
| PUBLISHED_TENTATIVE | open window | OBJECTIONS_OPEN | window dates set | notify scope |
| OBJECTIONS_OPEN | window close | OBJECTIONS_CLOSED | date passed | — |
| OBJECTIONS_CLOSED | finalise | FINALISED | no open objections | supersede prior, PDF, notify |
| FINALISED | supersede | SUPERSEDED | new final issued | — |

### 11.2 Promotion case lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | assemble field | FIELD_ASSEMBLED | final list exists | candidates created |
| FIELD_ASSEMBLED | compute eligibility | ELIGIBILITY_DONE | rule active | assessments |
| ELIGIBILITY_DONE | constitute panel | PANEL_CONSTITUTED | quorum config | panel created |
| PANEL_CONSTITUTED | hold DPC | DPC_HELD | quorum met | verdicts, eligibility frozen |
| DPC_HELD | approve select list | SELECT_LIST_APPROVED | count ≤ vacancies; roster ok | roster points tagged |
| SELECT_LIST_APPROVED | issue orders | ORDERS_ISSUED | candidates FIT | orders + SR |
| ORDERS_ISSUED | close | CLOSED | all effected/declined | — |
| any (pre-orders) | cancel | CANCELLED | authority | audit |

### 11.3 Promotion order lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | issue (checker) | ISSUED | candidate FIT | document |
| ISSUED | accept | ACCEPTED→ | within window | — |
| ISSUED | no response | DEEMED_ACCEPTED→ | window lapsed | — |
| ACCEPTED/DEEMED | effect | EFFECTED | SR available | SR post, M01 signal, probation create |
| ISSUED | decline | (status) DECLINED | — | reserve consideration |
| EFFECTED | supersede | SUPERSEDED | reversion/error | SR correction |

### 11.4 Financial up-gradation lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | due detected | DUE | service met | alert |
| DUE | screen | UNDER_SCREENING | committee | assessment |
| UNDER_SCREENING | sanction | SANCTIONED | benchmark met, cap ok, no penalty | order |
| SANCTIONED | effect | EFFECTED | — | SR + M10 pay event |
| DUE/UNDER_SCREENING | defer | DEFERRED | penalty current | re-eval on expiry |
| UNDER_SCREENING | reject | REJECTED | benchmark fail | audit |

### 11.5 Officiating arrangement lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | ACTIVE | no overlap | SR start |
| ACTIVE | extend | EXTENDED | within policy | audit |
| ACTIVE/EXTENDED | regularise | REGULARISED | linked selection | regular order, SR |
| ACTIVE/EXTENDED | terminate | TERMINATED | authority | SR end |
| ACTIVE/EXTENDED | lapse | LAPSED | end date passed | flag |

### 11.6 Probation lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | order effected (probation) | ON_PROBATION | period configured | scheduled_end set |
| ON_PROBATION | extend | EXTENDED | within cap | reason |
| ON_PROBATION/EXTENDED | declare | DECLARED_SATISFACTORY | period elapsed | confirmation SR |
| ON_PROBATION/EXTENDED | revert | REVERTED | authority | order superseded, SR |

---

## Section 12 — Notifications

| Event | Trigger | Recipients | Channel | Template key |
|---|---|---|---|---|
| Tentative list published | publish | In-scope employees | email/in-app | SEN_TENTATIVE_PUBLISHED |
| Objection acknowledged | objection submit | Objector | in-app | OBJ_ACK |
| Objection disposed | dispose | Objector | email/in-app | OBJ_DISPOSED |
| Final list notified | finalise | In-scope employees | email/in-app | SEN_FINAL |
| DPC convened | panel convened | Panel members | email | DPC_INVITE |
| Select list approved | approval | HR, candidates (selected) | in-app | SELECT_LIST_APPROVED |
| Promotion order issued | issue | Promoted employee | email/in-app | PROM_ORDER_ISSUED |
| Acceptance reminder | window nearing | Promoted employee | email | PROM_ACCEPT_REMINDER |
| Probation ending | lead-time before end | HR, manager | in-app | PROBATION_ENDING |
| MACP due | due detection | HR, employee | email/in-app | MACP_DUE |
| MACP sanctioned | sanction | Employee, payroll | email/in-app | MACP_SANCTIONED |
| Stagnation alert | threshold breach | HR, manager | in-app | STAGNATION_ALERT |
| Sealed cover review due | M09 conclusion / periodic | Vigilance, HR | email | SEALED_COVER_REVIEW |
| Posting issued / report-by | posting create | Promoted employee | email/in-app | POSTING_REPORT_BY |

All notifications recorded in shared `notifications` ledger; respect user preferences; statutory notices also generate a document of record where required.

---

## Section 13 — Reporting & Analytics

| Report | Description | Primary consumer |
|---|---|---|
| Seniority register (cadre-wise) | Current finalised seniority per cadre/grade | Establishment, Auditor |
| DPC proceedings & select-list report | Per-case minutes, verdicts, select/reserve/sealed lists | Appointing authority, Auditor |
| Roster compliance report | Points filled vs. due by category, carry-forward, de-reservation log | Roster officer, Auditor |
| Promotion throughput | Vacancies vs. filled vs. cycle time | HR leadership, M14 |
| Stagnation report | Employees beyond grade-tenure threshold without progression | HR, Dept head |
| MACP due & granted | Upcoming/granted financial up-gradations, deferrals | HR, Payroll |
| Due-for-promotion projection | Eligible cohorts by grade/cycle | HR, leadership |
| Succession readiness | Critical positions, bench strength, risk | Leadership |
| Audit trail extract | All state changes for a case/employee | Auditor |
| Litigation-risk register | Supersessions, objections upheld, sealed covers pending | Legal/HR |

Module reports expose data to M14 (enterprise analytics) via read APIs/materialised views; all reports respect org/cadre scoping and are exportable (PDF/CSV) with audit of export.

---

## Section 14 — Migration & Launch

### 14.1 Data migration

| Step | Source | Target | Validation |
|---|---|---|---|
| Legacy seniority lists | Existing registers/spreadsheets | `seniority_lists`/`seniority_entries` | rank contiguity; employee match by service_no |
| Past promotions | Service books / legacy HRMS | `promotion_orders` (status=EFFECTED, historical) | designation transitions valid; SR backfill |
| Existing MACP grants | Pay records | `financial_upgradations` (EFFECTED) | cap ≤ 3; scheme/level mapping |
| Active officiating | Office orders | `officiating_arrangements` (ACTIVE) | no overlaps |
| Reservation rosters | Roster registers | `reservation_rosters`/`roster_points` | cycle integrity; filled points reconcile |
| Ongoing probations | Service records | `probation_records` | end-date arithmetic |

- Migration runs in a staging environment; reconciliation report must show 0 unmatched mandatory records before cutover.
- Historical SR backfill posts idempotently to M12 with `historical=true` flag.

### 14.2 Configuration before launch

- Eligibility rules per grade pair; zone multipliers; benchmark thresholds.
- Reservation policy parameters; roster cycle sizes.
- Probation periods per grade; MACP qualifying-year schedule and cap.
- Alert lead times and stagnation thresholds; career-path templates.

### 14.3 Launch strategy

- Phase 1: Seniority + eligibility (read-only verification with HR).
- Phase 2: Promotion case → DPC → orders + SR posting (pilot cadre).
- Phase 3: MACP, officiating, posting integration with M05/M10.
- Phase 4: Progression monitoring, career-path/succession, dashboards.
- Each phase gated by reconciliation against legacy and SR posting verification.

### 14.4 Rollback & cutover

- Feature-flagged module; legacy registers retained read-only during parallel run.
- Rollback plan: disable write endpoints, retain data, revert to legacy for in-flight cases; no SR events deleted (corrections only).

---

## Section 15 — Traceability, Dependency & Parallel-Agent Plan

### 15.1 FR ↔ Entity ↔ API traceability matrix

| FR | Sub-module | Primary entities | Key endpoints | Upstream deps |
|---|---|---|---|---|
| FR-PPP-001 | PPP-SEN | seniority_lists, seniority_entries | POST /seniority-lists | M01 |
| FR-PPP-002 | PPP-SEN | seniority_lists, seniority_objections | publish/finalise/objections | M13, notif, workflow |
| FR-PPP-003 | PPP-ELG | eligibility_rules, eligibility_assessments | compute-eligibility | M08, M09 |
| FR-PPP-004 | PPP-DPC | promotion_cases, promotion_candidates | assemble-field | FR-001/002/003 |
| FR-PPP-005 | PPP-DPC | promotion_panels, dpc_proceedings | panels/proceedings/verdict | FR-004/006, M13 |
| FR-PPP-006 | PPP-ROS | reservation_rosters, roster_points | rosters/points | FR-005 |
| FR-PPP-007 | PPP-ORD | promotion_orders | orders/effect | FR-005/006, M12/M13/M01 |
| FR-PPP-008 | PPP-DPC | promotion_candidates (sealed) | sealed-covers/review | M09, FR-005/007 |
| FR-PPP-009 | PPP-ORD | probation_records | probations | FR-007, M12 |
| FR-PPP-010 | PPP-OFF | officiating_arrangements | officiating | FR-005/007, M12 |
| FR-PPP-011 | PPP-FIN | financial_upgradations, macp_assessments | financial-upgradations | M08/M09/M10/M12 |
| FR-PPP-012 | PPP-POST | promotion_postings | orders/postings | FR-007, M05/M12/M01 |
| FR-PPP-013 | PPP-MON | progression_alerts, increment_monitor | progression/alerts | FR-003/011, M08/M09 |
| FR-PPP-014 | PPP-CAR | career_paths, succession_plans | career-paths/succession | M07, FR-003 |

### 15.2 Dependency graph (build order)

```
M01, M08, M09, M12, M13 (external, available)
  └─ FR-001 ─ FR-002 ─┐
  └─ FR-003 ──────────┤
                      └─ FR-004 ─ FR-005 ─ FR-006 ─ FR-007 ─┬─ FR-008
                                                            ├─ FR-009
                                                            ├─ FR-010
                                                            ├─ FR-011 (also M10)
                                                            └─ FR-012 (also M05)
  FR-003/011 ─ FR-013
  M07/FR-003 ─ FR-014
```

### 15.3 Parallel-agent work packages

| Package | FRs | Can run parallel with | Shared-entity contention |
|---|---|---|---|
| WP-A Seniority | FR-001, FR-002 | WP-B | seniority_* (own) |
| WP-B Eligibility | FR-003 | WP-A | eligibility_* (own); reads M08/M09 |
| WP-C Case+DPC+Roster | FR-004, FR-005, FR-006 | (after A,B) | promotion_*, roster_* (own) |
| WP-D Orders+Probation | FR-007, FR-009 | WP-E,F (after C) | promotion_orders, probation_* ; coordinate SR posting interface |
| WP-E Officiating | FR-010 | WP-D,F | officiating_* (own); shares OrderService |
| WP-F MACP | FR-011 | WP-D,E | financial_* (own); shares OrderService + SR |
| WP-G Posting | FR-012 | after WP-D | promotion_postings; M05 contract |
| WP-H Monitoring | FR-013 | after B,F | progression_*, increment_* (own) |
| WP-I Career/Succession | FR-014 | after B | career_*, succession_* (own) |
| WP-J Sealed cover | FR-008 | after C,D | promotion_candidates (status fields) — coordinate with WP-C |

**Shared contracts to lock before parallel build:** `SrPostingGateway` (M12) interface, `OrderService.create()` signature (reused by FR-007/010/011), `EligibilityEngine` interface (reused by FR-004/013/014), error-code catalog (Section 9.3), and enum catalog (Section 5.5).

### 15.4 Final Reconciliation Table (0 unresolved gaps)

| Concern | Covered by | Status |
|---|---|---|
| Seniority lists, tentative/final, objections | FR-001, FR-002 | ✅ Resolved |
| Eligibility (qualifying service, APAR M08, vigilance/discipline M09, roster) | FR-003 | ✅ Resolved |
| Promotion case & zone of consideration | FR-004 | ✅ Resolved |
| DPC/panel constitution & proceedings, select list | FR-005 | ✅ Resolved |
| Reservation roster compliance, carry-forward, de-reservation | FR-006 | ✅ Resolved |
| Promotion orders, acceptance, SR posting (M12) | FR-007 | ✅ Resolved |
| Sealed-cover / Review DPC due process | FR-008 | ✅ Resolved |
| Promotion & probation lifecycle | FR-009 | ✅ Resolved |
| Ad-hoc/officiating/in-situ promotion | FR-010 | ✅ Resolved |
| Financial up-gradation ACP/MACP (M10 pay) | FR-011 | ✅ Resolved |
| Posting after promotion (M05) | FR-012 | ✅ Resolved |
| Progression monitoring: due-for-promotion, stagnation, increment | FR-013 | ✅ Resolved |
| Career-path modelling, succession, eligibility dashboard | FR-014 | ✅ Resolved |
| SR posting for all promotion/posting/financial events (M12) | FR-007/009/010/011/012 | ✅ Resolved |
| Canonical entity reuse (employees, designations, pay_scales, org_units, etc.) | Section 5 | ✅ Resolved |
| Roles & SoD (maker≠checker, no self-adjudication) | Section 3, integrity rule 8/14 | ✅ Resolved |
| Error envelope + module error codes | Section 9 | ✅ Resolved |
| NFRs, security, privacy, audit | Section 10 | ✅ Resolved |
| Notifications, reporting, migration | Sections 12-14 | ✅ Resolved |
| **Unresolved gaps** | — | **0** |

---

## Section 16 — Glossary & Appendices

### 16.1 Glossary

| Term | Definition |
|---|---|
| Seniority list | Ranked register of employees in a feeder grade used to determine promotion order |
| Tentative / Final list | Draft list open to objections vs. notified, binding list |
| DPC | Departmental Promotion Committee — statutory body adjudicating promotions |
| Benchmark | Minimum APAR grading threshold (Good/Very Good/Outstanding) for fitness |
| Zone of consideration | Set of senior-most eligible candidates considered for available vacancies |
| Sealed cover | Procedure withholding a promotion recommendation while a disciplinary/vigilance case is pending |
| Supersession | Promoting a junior over a senior with recorded reasons |
| Reservation roster | Register applying SC/ST/OBC/EWS/PwBD reservation to posts/vacancies |
| Carry-forward | Unfilled reserved point rolled to a future cycle |
| De-reservation | Converting a reserved point to unreserved per policy with authority |
| ACP/MACP | Assured / Modified Assured Career Progression — time-bound financial up-gradation schemes |
| Officiating / Ad-hoc / In-situ | Temporary upward placements pending regular promotion |
| Probation | Trial period in the promoted grade before confirmation |
| Notional date | A date assigned for seniority/pay purposes without immediate arrears |
| Digital SR | Digital Service Register (M12) — statutory service-event ledger |
| Stagnation | Prolonged service in a grade without promotion/up-gradation |

### 16.2 Appendix A — Configuration parameters

| Parameter | Example default | Scope |
|---|---|---|
| Zone multiplier | 3× vacancies | per grade |
| Objection window | 30 days | per list |
| Acceptance window | 15 days | per order |
| Probation period | 24 months | per grade |
| MACP schedule | 10/20/30 years | program |
| MACP cap | 3 | program |
| Stagnation threshold | grade-specific (e.g., 8 yrs) | per grade |
| Alert lead time | 90 days | per alert type |
| Reservation % / cycle | policy-defined | program |

### 16.3 Appendix B — Assumptions & open items

| Item | Assumption | Owner/Date to confirm |
|---|---|---|
| APAR read API shape | M08 provides per-year grading + benchmark band | M08 team |
| Disciplinary event stream | M09 emits case-conclusion events | M09 team |
| Pay fixation handoff | M10 consumes pay event; M06 does not compute pay | M10 team |
| Reservation policy version | Provided as configurable master data | Roster authority |
| SR idempotency key | `source_module + source_event_id` accepted by M12 | M12 team |

### 16.4 Appendix C — Standards referenced

- Shared Foundation Brief (`/docs/brd/SHARED_FOUNDATION.md`)
- OWASP ASVS; WCAG 2.1 AA; India DPDP Act 2023
- Public-sector DPC/seniority/reservation/MACP procedural conventions (parameterised, not hard-coded)

---

*End of M06-PPP BRD v1.0.*
