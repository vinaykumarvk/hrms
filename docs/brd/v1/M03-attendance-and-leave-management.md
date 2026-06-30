# Attendance and Leave Management — HRMS Module BRD

**Module code:** M03-ATL
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector context, hosted at CGG Data Centre.
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) layered on public-sector statutory rules.
**Source of truth for shared elements:** `docs/brd/SHARED_FOUNDATION.md` (referenced, never redefined).
**Document version:** v1.0 — 2026-06-30.

---

## 1. Executive Summary

### 1.1 Purpose
The Attendance and Leave Management module (M03-ATL) is the time-and-absence system of record for the HRMS. It captures **when and how employees work** (biometric / RFID / mobile-geo punches, shifts, rosters, overtime, work-from-home, on-duty/tour, holidays) and **when and why they are absent** (a full public-sector leave catalog with configurable accrual, carry-forward, encashment, and a fully auditable leave-balance ledger). It exposes self-service to employees, team controls to managers, configuration to HR, and feeds two downstream systems of record: the statutory **Digital Service Register** (via Module 04-LSR → M12-SR) and **Payroll** (M10-PAY) for loss-of-pay treatment.

### 1.2 Business problem
Public-sector time and leave administration is today fragmented across registers, spreadsheets, and disconnected biometric devices. This causes: leave balances that cannot be trusted, manual loss-of-pay (LWP) errors in payroll, no statutory leave posting into the Service Register, no team visibility for managers, and no audit trail for regularisation and backdating. M03-ATL replaces this with a single configurable engine and immutable ledgers.

### 1.3 Goals & success metrics
| # | Goal | Metric / target |
|---|---|---|
| G1 | Trustworthy leave balances | 100% of balance changes traceable to a ledger entry; zero unreconciled balances at year-close. |
| G2 | Automated attendance capture | ≥ 95% of daily attendance auto-computed without manual intervention. |
| G3 | Accurate payroll feed | 0 LWP discrepancies between M03 export and M10 import per cycle. |
| G4 | Statutory compliance | 100% of approved leave events posted to Digital SR (via M04) within SLA. |
| G5 | Self-service adoption | ≥ 90% of leave applications submitted by employees themselves (web/mobile). |
| G6 | Approval timeliness | P50 leave-approval turnaround ≤ 24h; auto-escalation on breach. |

### 1.4 Scope summary
**In scope:** shift & roster management; holiday calendars by location; punch ingestion & deduplication; daily attendance processing; missed-punch regularisation; overtime; WFH; on-duty/tour; compensatory-off; leave-type & accrual policy configuration; accrual engine; leave-balance ledger; leave application/approval/cancellation; backdated leave; team calendar & conflict detection; leave-year close (carry-forward / lapse); encashment (incl. on retirement); attendance-and-leave → payroll feed.
**Out of scope (referenced, not built here):** statutory SR posting internals (M04/M12), payroll computation (M10), terminal-benefit settlement (M11), document storage internals (M13), cross-module analytics surface (M14).

### 1.5 Key stakeholders
Employees, Reporting Managers, HR Officers/Admins, Department Heads/Sanctioning Authorities, Payroll Officers (consumers), SR Custodian (consumer via M04), Auditors, System Administrators.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Area | Sub-area | FRs |
|---|---|---|
| **Time & Attendance** | Shift & roster management | FR-01 |
| | Holiday calendar by location | FR-02 |
| | Punch ingestion (biometric/RFID/mobile-geo) | FR-03 |
| | Daily attendance processing & status computation | FR-04 |
| | Missed-punch regularisation | FR-05 |
| | Overtime capture & approval | FR-06 |
| | Work-from-home (WFH) | FR-07 |
| | On-duty / tour / outdoor duty | FR-08 |
| | Compensatory-off earning & redemption | FR-09 |
| **Leave Management** | Leave-type & accrual-policy configuration | FR-10 |
| | Accrual engine & leave-balance ledger | FR-11 |
| | Leave application & approval workflow | FR-12 |
| | Leave cancellation & modification | FR-13 |
| | Backdated leave & team-calendar conflict detection | FR-14 |
| | Leave-year close: carry-forward, lapse, half-pay conversion | FR-15 |
| | Leave encashment (in-service & on retirement) | FR-16 |
| **Integration** | Attendance & leave → payroll (LWP) feed | FR-17 |
| | Mobile/web self-service surface & notification triggers | FR-18 |

### 2.2 Common Capabilities (inherited from Shared Foundation)
- RBAC + org-unit row-level scoping; maker-checker via shared `workflow_instances`/`workflow_tasks`.
- Immutable `audit_log` write on every state change; soft delete (`is_deleted`) except append-only ledgers.
- UTC storage, locale display (`DD-MMM-YYYY`), INR currency; cursor/page pagination (max 100).
- Canonical API error envelope and standard error codes; OIDC/SSO + MFA + JWT.

### 2.3 Boundaries & ownership
| Concern | Owner | M03 relationship |
|---|---|---|
| Employee master, designation, org tree | M01-EPM | **Reads** (golden source). |
| Statutory SR ledger | M12-SR (written via M04-LSR) | **Emits** approved-leave events to M04; never writes SR directly. |
| Payroll computation | M10-PAY | **Emits** LWP/OT/attendance feed; M10 computes pay. |
| Terminal benefits / pension | M11-PEN | **Supplies** leave-encashment-eligible balance on retirement. |
| Document storage | M13-DMS | **References** `documents` for medical certificates, tour orders. |
| Notifications delivery | Shared platform | **Triggers** `notifications`. |

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared baseline; do not contradict)
| Role | Description |
|---|---|
| **Employee (Self-Service)** | Apply/cancel own leave, view own balance & ledger, regularise own punches, apply WFH/OD/comp-off/OT, view own roster & holidays. |
| **Reporting Manager** | Approve/recommend leave, regularisation, OT, WFH, OD for direct reports; view team calendar; flag conflicts. |
| **HR Officer** | Configure rosters/holidays per scope, operate on behalf of employees, run accrual/close, correct ledger via adjustment. |
| **HR Admin** | All HR Officer rights + leave-type/policy configuration, year-close execution, org-wide reports. |
| **Sanctioning Authority (Dept Head)** | Final sanction for special leaves (Maternity, Study, Sabbatical, Commuted, LWP, encashment). |
| **Payroll Officer** | Read-only consumer of the LWP/OT feed; trigger/reconcile export. |
| **Auditor** | Read-only across all entities incl. ledger and audit log. No write. |
| **System Administrator** | Device registration, integration config, enum/reference master data; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-Delete, A=Approve, X=Execute job; blank=none)
| Capability | Employee | Manager | HR Officer | HR Admin | Sanct. Auth | Payroll | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|
| View own attendance/leave | R | R | R | R | R | | R | |
| View team attendance/leave | | R | R | R | R | | R | |
| Apply leave / WFH / OD / comp-off / OT | C | C(self) | C(on behalf) | C(on behalf) | | | | |
| Approve leave / regularisation / OT | | A | A | A | A | | | |
| Sanction special leave & encashment | | | R | A | A | | | |
| Regularise missed punch | C(self) | A | C/A | C/A | | | R | |
| Configure shifts / rosters | | R | C/U | C/U | | | R | |
| Configure holidays | | R | C/U | C/U | | | R | |
| Configure leave types & accrual policy | | | R | C/U | | | R | |
| Run accrual / year-close job | | | X(scope) | X | | | R | |
| Ledger manual adjustment (maker-checker) | | | C(maker) | A(checker) | | | R | |
| Run/reconcile payroll feed export | | | R | R | | X | R | |
| Register devices / integration config | | | | R | | | R | C/U |
| View audit log | own | team | scope | org | scope | | all | scope |

**Segregation of duties:** maker ≠ checker; no self-approval (an employee who is also a manager cannot approve their own leave); ledger adjustments always require a distinct checker.

---

## 4. Shared Application Foundation
This module **inherits** the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`) without redefinition:
- **Entities reused:** `employees`, `users`, `org_units`, `designations`, `cadres`, `roles`/`permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks`.
- **Conventions:** UUIDv4 PKs + human business keys; standard audit columns; UPPER_SNAKE_CASE enums; UTC storage / locale display; paginated lists (max 100); maker-checker through the shared workflow engine.
- **Tech defaults:** React+TS (Tailwind/shadcn) front-end; REST `/api/v1`; PostgreSQL; object storage for documents; OIDC/SSO+MFA+JWT; RBAC + org-unit row-level scoping.
- **Error envelope:** `{ "error": { "code", "message", "field" }, "requestId" }`.
- **NFR baseline:** P95 < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min / RTO ≤ 4h; OWASP ASVS; DPDP-Act-2023-aligned PII handling.

M03 extends the shared workflow engine with module workflow templates (leave approval, regularisation, encashment) and the shared `notifications` ledger with module event types.

---

## 5. Holistic Data Model

### 5.1 Entity inventory
| # | Entity | Type | Ownership | Note |
|---|---|---|---|---|
| E1 | `shifts` | Master | M03 (new) | Shift definitions (timings, grace, break, night flag). |
| E2 | `rosters` | Transactional | M03 (new) | Employee-to-shift assignment over a date range. |
| E3 | `holiday_calendars` | Master | M03 (new) | Named calendar bound to location/org scope. |
| E4 | `holidays` | Master | M03 (new) | Individual holiday dates within a calendar. |
| E5 | `attendance_devices` | Master | M03 (new) | Registered biometric/RFID/mobile capture sources. |
| E6 | `attendance_punches` | Append-only ledger | M03 (new) | Raw punch events (in/out) ingested from devices/mobile. |
| E7 | `attendance_daily` | Transactional | M03 (new) | Computed per-employee-per-day attendance status. |
| E8 | `regularisation_requests` | Transactional | M03 (new) | Missed-punch / status correction requests. |
| E9 | `overtime_records` | Transactional | M03 (new) | OT claim, approval, payable/comp-off treatment. |
| E10 | `attendance_exceptions` | Transactional | M03 (new) | WFH / On-Duty / Tour records. |
| E11 | `comp_off_ledger` | Append-only ledger | M03 (new) | Compensatory-off earn/redeem/expire entries. |
| E12 | `leave_types` | Master | M03 (new) | Leave catalog (CL/EL/HPL/Commuted/Maternity/etc.). |
| E13 | `leave_accrual_policies` | Master | M03 (new) | Accrual/carry-forward/encashment rule set per leave type + scope. |
| E14 | `leave_balances` | Transactional (derived) | M03 (new) | Current balance snapshot per employee/leave-type/leave-year. |
| E15 | `leave_balance_ledger` | Append-only ledger | M03 (new) | Immutable debit/credit history (single source of truth for balances). |
| E16 | `leave_applications` | Transactional | M03 (new) | Leave requests + approval lifecycle. |
| E17 | `leave_application_days` | Transactional | M03 (new) | Per-day breakdown (full/first-half/second-half) of an application. |
| E18 | `leave_encashment_requests` | Transactional | M03 (new) | In-service & retirement encashment claims. |
| E19 | `leave_year_close_runs` | Job/audit | M03 (new) | Year-close execution records (carry-forward/lapse/conversion). |
| E20 | `payroll_attendance_feed` | Integration ledger | M03 (new) | LWP/OT/attendance export batches to M10. |

Reused (not redefined): `employees`, `users`, `org_units`, `designations`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks`.

### 5.2 Full field tables

#### E1 `shifts`
| Field | Type | Constraints | Description |
|---|---|---|---|
| shift_id | UUID | PK | Identity. |
| shift_code | VARCHAR(20) | UNIQUE, NOT NULL | Human key e.g. `GEN`, `NIGHT-A`. |
| name | VARCHAR(100) | NOT NULL | Display name. |
| start_time | TIME | NOT NULL | Shift start (local). |
| end_time | TIME | NOT NULL | Shift end (local). |
| grace_minutes | INT | NOT NULL, DEFAULT 10 | Late-grace window. |
| half_day_threshold_minutes | INT | NOT NULL | Worked-minutes boundary for half-day. |
| full_day_threshold_minutes | INT | NOT NULL | Worked-minutes boundary for full day. |
| break_minutes | INT | NOT NULL, DEFAULT 0 | Unpaid break. |
| is_night_shift | BOOLEAN | NOT NULL, DEFAULT false | Spans midnight. |
| org_unit_scope_id | UUID | FK → org_units | Applicability scope. |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E2 `rosters`
| Field | Type | Constraints | Description |
|---|---|---|---|
| roster_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Assignee. |
| shift_id | UUID | FK → shifts, NOT NULL | Assigned shift. |
| effective_from | DATE | NOT NULL | Start. |
| effective_to | DATE | NULL | End (open = current). |
| weekly_off_pattern | JSONB | NOT NULL | e.g. `["SUN"]` or alternating-Saturday rule. |
| assigned_by | UUID | FK → users | Creator. |
| status | ENUM | NOT NULL | `DRAFT`/`PUBLISHED`/`SUPERSEDED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: no overlapping `PUBLISHED` roster for the same `employee_id` over the same date range.

#### E3 `holiday_calendars`
| Field | Type | Constraints | Description |
|---|---|---|---|
| calendar_id | UUID | PK | Identity. |
| calendar_code | VARCHAR(30) | UNIQUE, NOT NULL | Human key e.g. `HQ-2026`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| year | INT | NOT NULL | Calendar year. |
| location_scope_id | UUID | FK → org_units | Location/region scope. |
| status | ENUM | NOT NULL | `DRAFT`/`PUBLISHED`/`ARCHIVED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E4 `holidays`
| Field | Type | Constraints | Description |
|---|---|---|---|
| holiday_id | UUID | PK | Identity. |
| calendar_id | UUID | FK → holiday_calendars, NOT NULL | Parent. |
| holiday_date | DATE | NOT NULL | Date. |
| name | VARCHAR(120) | NOT NULL | e.g. "Republic Day". |
| holiday_type | ENUM | NOT NULL | `GAZETTED`/`RESTRICTED`/`SECTIONAL`/`OPTIONAL`. |
| is_restricted_optional | BOOLEAN | NOT NULL, DEFAULT false | Employee-elective (RH). |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`calendar_id`,`holiday_date`).

#### E5 `attendance_devices`
| Field | Type | Constraints | Description |
|---|---|---|---|
| device_id | UUID | PK | Identity. |
| device_code | VARCHAR(40) | UNIQUE, NOT NULL | Serial/registration key. |
| device_type | ENUM | NOT NULL | `BIOMETRIC`/`RFID`/`MOBILE_APP`/`WEB`. |
| location_org_unit_id | UUID | FK → org_units | Physical placement. |
| geofence | JSONB | NULL | Lat/long + radius for mobile/site validation. |
| api_key_hash | VARCHAR(255) | NULL | Hashed device credential (never plaintext). |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`/`DECOMMISSIONED`. |
| last_seen_at | TIMESTAMPTZ | NULL | Heartbeat. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E6 `attendance_punches` (append-only)
| Field | Type | Constraints | Description |
|---|---|---|---|
| punch_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| device_id | UUID | FK → attendance_devices | Source. |
| punch_time | TIMESTAMPTZ | NOT NULL | Event time (UTC). |
| punch_direction | ENUM | NULL | `IN`/`OUT`/`AUTO` (direction inferred if null). |
| capture_method | ENUM | NOT NULL | `BIOMETRIC`/`RFID`/`MOBILE_GEO`/`WEB`/`MANUAL`. |
| geo_lat | NUMERIC(9,6) | NULL | Mobile latitude. |
| geo_long | NUMERIC(9,6) | NULL | Mobile longitude. |
| source_ref | VARCHAR(120) | NULL | Device-side raw event id (idempotency). |
| ingestion_status | ENUM | NOT NULL | `ACCEPTED`/`DUPLICATE`/`REJECTED`. |
| created_at, created_by | std | | (Append-only: no update/soft-delete.) |

Constraint: UNIQUE(`device_id`,`source_ref`) for idempotent ingestion.

#### E7 `attendance_daily`
| Field | Type | Constraints | Description |
|---|---|---|---|
| attendance_daily_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| attendance_date | DATE | NOT NULL | Day. |
| roster_id | UUID | FK → rosters | Applicable shift assignment. |
| first_in | TIMESTAMPTZ | NULL | Earliest IN. |
| last_out | TIMESTAMPTZ | NULL | Latest OUT. |
| worked_minutes | INT | NOT NULL, DEFAULT 0 | Computed. |
| status | ENUM | NOT NULL | `PRESENT`/`ABSENT`/`HALF_DAY`/`ON_LEAVE`/`HOLIDAY`/`WEEKLY_OFF`/`WFH`/`ON_DUTY`/`MISSING_PUNCH`. |
| late_minutes | INT | NOT NULL, DEFAULT 0 | Lateness vs grace. |
| early_exit_minutes | INT | NOT NULL, DEFAULT 0 | Early departure. |
| leave_application_id | UUID | FK → leave_applications, NULL | If on leave. |
| is_regularised | BOOLEAN | NOT NULL, DEFAULT false | Corrected via FR-05. |
| processing_run_id | UUID | NULL | Batch that computed it. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`employee_id`,`attendance_date`).

#### E8 `regularisation_requests`
| Field | Type | Constraints | Description |
|---|---|---|---|
| regularisation_id | UUID | PK | Identity. |
| attendance_daily_id | UUID | FK → attendance_daily, NOT NULL | Day corrected. |
| employee_id | UUID | FK → employees, NOT NULL | Requester. |
| requested_status | ENUM | NOT NULL | Target status (e.g. `PRESENT`). |
| proposed_first_in | TIMESTAMPTZ | NULL | Corrected IN. |
| proposed_last_out | TIMESTAMPTZ | NULL | Corrected OUT. |
| reason | TEXT | NOT NULL | Justification. |
| supporting_document_id | UUID | FK → documents | Optional proof. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval chain. |
| status | ENUM | NOT NULL | `DRAFT`/`SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E9 `overtime_records`
| Field | Type | Constraints | Description |
|---|---|---|---|
| overtime_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| attendance_date | DATE | NOT NULL | Day worked OT. |
| ot_minutes | INT | NOT NULL | Approved minutes. |
| ot_treatment | ENUM | NOT NULL | `PAID`/`COMP_OFF`. |
| rate_multiplier | NUMERIC(4,2) | NULL | e.g. 1.5/2.0 for paid OT. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`PAID`/`CONVERTED_TO_COMPOFF`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E10 `attendance_exceptions` (WFH / On-Duty / Tour)
| Field | Type | Constraints | Description |
|---|---|---|---|
| exception_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| exception_type | ENUM | NOT NULL | `WFH`/`ON_DUTY`/`TOUR`. |
| start_date | DATE | NOT NULL | From. |
| end_date | DATE | NOT NULL | To. |
| location_text | VARCHAR(200) | NULL | Tour/OD location. |
| reason | TEXT | NOT NULL | Purpose. |
| supporting_document_id | UUID | FK → documents | Tour order/approval. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E11 `comp_off_ledger` (append-only)
| Field | Type | Constraints | Description |
|---|---|---|---|
| comp_off_entry_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| entry_type | ENUM | NOT NULL | `EARN`/`REDEEM`/`EXPIRE`/`ADJUST`. |
| days | NUMERIC(4,2) | NOT NULL | Signed quantity. |
| source_ref_type | ENUM | NULL | `OVERTIME`/`HOLIDAY_WORK`/`LEAVE_APPLICATION`/`MANUAL`. |
| source_ref_id | UUID | NULL | Originating record. |
| earned_on | DATE | NULL | Earn date. |
| expires_on | DATE | NULL | Expiry of earned comp-off. |
| balance_after | NUMERIC(6,2) | NOT NULL | Running balance. |
| remarks | TEXT | NULL | Note. |
| created_at, created_by | std | | (Append-only.) |

#### E12 `leave_types`
| Field | Type | Constraints | Description |
|---|---|---|---|
| leave_type_id | UUID | PK | Identity. |
| leave_code | VARCHAR(20) | UNIQUE, NOT NULL | `CL`,`EL`,`HPL`,`COMMUTED`,`MAT`,`PAT`,`CCL`,`STUDY`,`MED`,`SAB`,`LWP`,`COMPOFF`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| category | ENUM | NOT NULL | `PAID`/`HALF_PAY`/`UNPAID`/`SPECIAL`. |
| is_accruable | BOOLEAN | NOT NULL | Whether accrual engine grants it. |
| is_encashable | BOOLEAN | NOT NULL | Encashment eligible. |
| affects_pay | BOOLEAN | NOT NULL | Triggers LWP/half-pay payroll impact. |
| gender_eligibility | ENUM | NOT NULL | `ALL`/`FEMALE`/`MALE`. |
| requires_document | BOOLEAN | NOT NULL | e.g. Medical needs certificate. |
| max_continuous_days | INT | NULL | Statutory cap (e.g. Maternity 180). |
| applicable_cadre_ids | JSONB | NULL | Cadre restriction. |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E13 `leave_accrual_policies`
| Field | Type | Constraints | Description |
|---|---|---|---|
| policy_id | UUID | PK | Identity. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Target type. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Applicability (null = global). |
| scope_cadre_id | UUID | FK → cadres, NULL | Cadre applicability. |
| accrual_frequency | ENUM | NOT NULL | `ANNUAL`/`MONTHLY`/`HALF_YEARLY`/`ON_JOINING`/`NONE`. |
| accrual_quantity | NUMERIC(5,2) | NOT NULL | Units credited per cycle. |
| accrual_basis | ENUM | NOT NULL | `CALENDAR`/`SERVICE_LENGTH`/`ATTENDANCE_PRORATED`. |
| max_balance_cap | NUMERIC(6,2) | NULL | Ceiling. |
| carry_forward_allowed | BOOLEAN | NOT NULL | Year-end carry. |
| carry_forward_cap | NUMERIC(6,2) | NULL | Max carried. |
| encashment_cap_days | NUMERIC(6,2) | NULL | Max encashable. |
| lapse_rule | ENUM | NOT NULL | `LAPSE_EXCESS`/`NO_LAPSE`/`CONVERT_TO_HPL`. |
| min_balance_for_encash | NUMERIC(6,2) | NULL | Threshold. |
| effective_from | DATE | NOT NULL | Version start. |
| effective_to | DATE | NULL | Version end. |
| status | ENUM | NOT NULL | `ACTIVE`/`SUPERSEDED`/`DRAFT`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E14 `leave_balances` (derived snapshot)
| Field | Type | Constraints | Description |
|---|---|---|---|
| balance_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type. |
| leave_year | INT | NOT NULL | Balance year. |
| opening_balance | NUMERIC(6,2) | NOT NULL | Carried-in. |
| accrued | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD accrued. |
| availed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD used. |
| encashed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD encashed. |
| lapsed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD lapsed. |
| current_balance | NUMERIC(6,2) | NOT NULL | Live balance (= reconciles to ledger). |
| last_ledger_entry_id | UUID | FK → leave_balance_ledger | Reconciliation anchor. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`employee_id`,`leave_type_id`,`leave_year`).

#### E15 `leave_balance_ledger` (append-only — single source of truth)
| Field | Type | Constraints | Description |
|---|---|---|---|
| ledger_entry_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type. |
| leave_year | INT | NOT NULL | Year. |
| entry_type | ENUM | NOT NULL | `ACCRUAL`/`OPENING`/`AVAIL`/`AVAIL_REVERSAL`/`ENCASHMENT`/`LAPSE`/`CARRY_FORWARD`/`ADJUSTMENT`/`HPL_CONVERSION`. |
| amount | NUMERIC(6,2) | NOT NULL | Signed (+credit / −debit). |
| balance_after | NUMERIC(6,2) | NOT NULL | Running balance post-entry. |
| source_ref_type | ENUM | NULL | `LEAVE_APPLICATION`/`ACCRUAL_RUN`/`YEAR_CLOSE`/`ENCASHMENT`/`MANUAL`. |
| source_ref_id | UUID | NULL | Originating record. |
| effective_date | DATE | NOT NULL | When effective. |
| remarks | TEXT | NULL | Note. |
| reversed_by_entry_id | UUID | FK → self, NULL | If reversed. |
| created_at, created_by | std | | (Append-only; never updated/deleted.) |

#### E16 `leave_applications`
| Field | Type | Constraints | Description |
|---|---|---|---|
| application_id | UUID | PK | Identity. |
| application_no | VARCHAR(30) | UNIQUE, NOT NULL | Human key. |
| employee_id | UUID | FK → employees, NOT NULL | Applicant. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type. |
| start_date | DATE | NOT NULL | From. |
| end_date | DATE | NOT NULL | To. |
| total_days | NUMERIC(5,2) | NOT NULL | Computed (excl. holidays/weekly-off unless prefix/suffix rule). |
| reason | TEXT | NOT NULL | Justification. |
| is_backdated | BOOLEAN | NOT NULL, DEFAULT false | Past-dated flag. |
| contact_during_leave | VARCHAR(120) | NULL | Address/phone. |
| supporting_document_id | UUID | FK → documents | Medical cert / order. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval chain. |
| status | ENUM | NOT NULL | `DRAFT`/`SUBMITTED`/`RECOMMENDED`/`APPROVED`/`REJECTED`/`CANCELLED`/`WITHDRAWN`. |
| sr_posting_status | ENUM | NOT NULL | `NOT_REQUIRED`/`PENDING`/`POSTED`/`FAILED`. |
| applied_on_behalf_by | UUID | FK → users, NULL | HR proxy. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E17 `leave_application_days`
| Field | Type | Constraints | Description |
|---|---|---|---|
| application_day_id | UUID | PK | Identity. |
| application_id | UUID | FK → leave_applications, NOT NULL | Parent. |
| leave_date | DATE | NOT NULL | Day. |
| day_portion | ENUM | NOT NULL | `FULL`/`FIRST_HALF`/`SECOND_HALF`. |
| day_units | NUMERIC(3,2) | NOT NULL | 1.0 / 0.5. |
| is_non_working | BOOLEAN | NOT NULL, DEFAULT false | Holiday/weekly-off sandwiched. |
| created_at, created_by | std | | Audit. |

Constraint: UNIQUE(`application_id`,`leave_date`).

#### E18 `leave_encashment_requests`
| Field | Type | Constraints | Description |
|---|---|---|---|
| encashment_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Encashable type. |
| encashment_type | ENUM | NOT NULL | `IN_SERVICE`/`RETIREMENT`/`LTC`. |
| days_requested | NUMERIC(6,2) | NOT NULL | Quantity. |
| days_approved | NUMERIC(6,2) | NULL | After validation. |
| amount_estimated | NUMERIC(12,2) | NULL | Indicative (M10 computes final). |
| effective_date | DATE | NOT NULL | Settlement date. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval. |
| payroll_feed_id | UUID | FK → payroll_attendance_feed, NULL | Export linkage. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`SETTLED`/`CANCELLED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E19 `leave_year_close_runs`
| Field | Type | Constraints | Description |
|---|---|---|---|
| close_run_id | UUID | PK | Identity. |
| leave_year | INT | NOT NULL | Year being closed. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope (null = all). |
| run_status | ENUM | NOT NULL | `DRAFT`/`SIMULATED`/`COMMITTED`/`FAILED`. |
| employees_processed | INT | NOT NULL, DEFAULT 0 | Count. |
| total_carried | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Sum carried-forward. |
| total_lapsed | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Sum lapsed. |
| total_converted | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | HPL conversions. |
| executed_by | UUID | FK → users | Operator. |
| simulation_report_doc_id | UUID | FK → documents, NULL | Dry-run output. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E20 `payroll_attendance_feed`
| Field | Type | Constraints | Description |
|---|---|---|---|
| feed_id | UUID | PK | Identity. |
| pay_period | VARCHAR(7) | NOT NULL | `YYYY-MM`. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| lwp_days | NUMERIC(5,2) | NOT NULL, DEFAULT 0 | Loss-of-pay days. |
| half_pay_days | NUMERIC(5,2) | NOT NULL, DEFAULT 0 | HPL days. |
| paid_ot_minutes | INT | NOT NULL, DEFAULT 0 | Payable OT. |
| present_days | NUMERIC(5,2) | NOT NULL | Working days present. |
| encashment_amount | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Encashment to pay. |
| export_status | ENUM | NOT NULL | `PENDING`/`EXPORTED`/`ACKED`/`FAILED`. |
| exported_at | TIMESTAMPTZ | NULL | Timestamp. |
| m10_batch_ref | VARCHAR(60) | NULL | Payroll-side ack ref. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`pay_period`,`employee_id`).

### 5.3 Relationship map
```
employees (M01) 1───∞ rosters ∞───1 shifts
employees 1───∞ attendance_punches ───∞ attendance_devices
employees 1───∞ attendance_daily 1───0..1 leave_applications
attendance_daily 1───∞ regularisation_requests
employees 1───∞ overtime_records ───┐
employees 1───∞ attendance_exceptions │ (EARN source)
overtime_records / holidays-worked ──┴──> comp_off_ledger (∞)
leave_types 1───∞ leave_accrual_policies (scoped, versioned)
leave_types 1───∞ leave_balances ∞───1 employees
leave_balances 1:1-anchor leave_balance_ledger (append-only history)
employees 1───∞ leave_applications 1───∞ leave_application_days
leave_applications ∞───1 leave_types ; ∞───1 workflow_instances
leave_applications ──(approved)──> service_register_events (via M04-LSR)
leave_applications / encashment / OT / attendance_daily ──> payroll_attendance_feed ──> M10-PAY
leave_year_close_runs ──writes──> leave_balance_ledger
all state changes ──> audit_log ; all events ──> notifications
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| employees, org_units, designations, cadres | M01 | M03 | M01 only |
| service_register_events | M12 | M03 (status) | M04 (on behalf of M03) |
| documents | M13 | M03 | M03 (uploads cert/order) |
| notifications, audit_log, workflow_* | Platform | M03 | M03 |
| shifts, rosters, holiday_*, attendance_*, comp_off_ledger | M03 | M14, M10 | M03 |
| leave_* (types/policies/balances/ledger/applications/encashment/close) | M03 | M14, M10, M11, M04 | M03 |
| payroll_attendance_feed | M03 | M10 | M03 (export); M10 (ack only) |

### 5.5 Enum catalog
| Enum | Values |
|---|---|
| employment_status (M01) | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| shift.status | ACTIVE, INACTIVE |
| roster.status | DRAFT, PUBLISHED, SUPERSEDED |
| holiday_type | GAZETTED, RESTRICTED, SECTIONAL, OPTIONAL |
| device_type | BIOMETRIC, RFID, MOBILE_APP, WEB |
| capture_method | BIOMETRIC, RFID, MOBILE_GEO, WEB, MANUAL |
| punch_direction | IN, OUT, AUTO |
| ingestion_status | ACCEPTED, DUPLICATE, REJECTED |
| attendance_daily.status | PRESENT, ABSENT, HALF_DAY, ON_LEAVE, HOLIDAY, WEEKLY_OFF, WFH, ON_DUTY, MISSING_PUNCH |
| regularisation.status | DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED |
| overtime.status | SUBMITTED, APPROVED, REJECTED, PAID, CONVERTED_TO_COMPOFF |
| ot_treatment | PAID, COMP_OFF |
| exception_type | WFH, ON_DUTY, TOUR |
| comp_off.entry_type | EARN, REDEEM, EXPIRE, ADJUST |
| leave.category | PAID, HALF_PAY, UNPAID, SPECIAL |
| gender_eligibility | ALL, FEMALE, MALE |
| accrual_frequency | ANNUAL, MONTHLY, HALF_YEARLY, ON_JOINING, NONE |
| accrual_basis | CALENDAR, SERVICE_LENGTH, ATTENDANCE_PRORATED |
| lapse_rule | LAPSE_EXCESS, NO_LAPSE, CONVERT_TO_HPL |
| ledger.entry_type | ACCRUAL, OPENING, AVAIL, AVAIL_REVERSAL, ENCASHMENT, LAPSE, CARRY_FORWARD, ADJUSTMENT, HPL_CONVERSION |
| leave_application.status | DRAFT, SUBMITTED, RECOMMENDED, APPROVED, REJECTED, CANCELLED, WITHDRAWN |
| sr_posting_status | NOT_REQUIRED, PENDING, POSTED, FAILED |
| day_portion | FULL, FIRST_HALF, SECOND_HALF |
| encashment_type | IN_SERVICE, RETIREMENT, LTC |
| encashment.status | SUBMITTED, APPROVED, REJECTED, SETTLED, CANCELLED |
| close_run.status | DRAFT, SIMULATED, COMMITTED, FAILED |
| feed.export_status | PENDING, EXPORTED, ACKED, FAILED |

### 5.6 Data integrity rules
1. **Ledger-balance reconciliation:** `leave_balances.current_balance` MUST equal the `balance_after` of the latest `leave_balance_ledger` entry for that (employee, leave_type, leave_year). Enforced by trigger + nightly reconciliation job.
2. **Non-negative balances:** an `AVAIL`/`ENCASHMENT` debit cannot drive `balance_after` below 0 except for leave types explicitly allowing advance (e.g. Maternity) configured in policy.
3. **Append-only ledgers:** `leave_balance_ledger`, `comp_off_ledger`, `attendance_punches` permit INSERT only; corrections via compensating entries (`ADJUSTMENT`/`AVAIL_REVERSAL`), never UPDATE/DELETE.
4. **One status per day:** UNIQUE(`employee_id`,`attendance_date`) on `attendance_daily`; UNIQUE(`employee_id`,`leave_date`) across active leave application days (no double-booking).
5. **Idempotent ingestion:** UNIQUE(`device_id`,`source_ref`) on punches; replays mark `DUPLICATE`.
6. **Transactional writes:** leave approval = (insert ledger debit + update balance + update application status + enqueue SR posting + enqueue notification) in a single DB transaction.
7. **FK integrity:** all employee/org references resolve to active M01 records; soft-deleted employees block new applications.
8. **Gender/eligibility guard:** Maternity/CCL restricted to `gender_eligibility=FEMALE`; Paternity to `MALE`; cadre restrictions enforced at apply-time.
9. **Date sanity:** `end_date >= start_date`; backdated leave only within configurable window; future-dated punches rejected.
10. **No self-approval:** `workflow_tasks.assignee_id` ≠ application `created_by`/`employee_id`.

### 5.7 Sample data (2-3 rows per new entity)
**shifts**
| shift_code | name | start_time | end_time | grace_minutes | is_night_shift | status |
|---|---|---|---|---|---|---|
| GEN | General | 09:30 | 17:30 | 10 | false | ACTIVE |
| NIGHT-A | Night A | 22:00 | 06:00 | 15 | true | ACTIVE |

**rosters**
| employee (service_no) | shift_code | effective_from | effective_to | weekly_off_pattern | status |
|---|---|---|---|---|---|
| GOV-1001 | GEN | 2026-01-01 | (open) | ["SUN","SAT2","SAT4"] | PUBLISHED |
| GOV-2087 | NIGHT-A | 2026-04-01 | 2026-06-30 | ["SUN"] | PUBLISHED |

**holiday_calendars / holidays**
| calendar_code | year | location_scope | holiday_date | name | holiday_type |
|---|---|---|---|---|---|
| HQ-2026 | 2026 | Head Office | 2026-01-26 | Republic Day | GAZETTED |
| HQ-2026 | 2026 | Head Office | 2026-08-15 | Independence Day | GAZETTED |
| DIST-2026 | 2026 | District Office | 2026-09-05 | Local Festival | SECTIONAL |

**attendance_devices**
| device_code | device_type | location | status |
|---|---|---|---|
| BIO-HQ-01 | BIOMETRIC | Head Office Gate | ACTIVE |
| MOB-APP | MOBILE_APP | (geo) | ACTIVE |

**attendance_punches**
| employee | device_code | punch_time (UTC) | direction | capture_method | ingestion_status |
|---|---|---|---|---|---|
| GOV-1001 | BIO-HQ-01 | 2026-06-29T04:02:11Z | IN | BIOMETRIC | ACCEPTED |
| GOV-1001 | BIO-HQ-01 | 2026-06-29T12:35:40Z | OUT | BIOMETRIC | ACCEPTED |

**attendance_daily**
| employee | attendance_date | first_in | last_out | worked_minutes | status | late_minutes |
|---|---|---|---|---|---|---|
| GOV-1001 | 2026-06-29 | 09:32 | 18:05 | 478 | PRESENT | 0 |
| GOV-2087 | 2026-06-29 | (null) | (null) | 0 | ON_LEAVE | 0 |

**regularisation_requests**
| employee | requested_status | proposed_first_in | reason | status |
|---|---|---|---|---|
| GOV-1001 | PRESENT | 2026-06-25 09:35 | Biometric failed at gate | APPROVED |
| GOV-2087 | PRESENT | 2026-06-20 22:10 | Forgot to punch in | SUBMITTED |

**overtime_records**
| employee | attendance_date | ot_minutes | ot_treatment | status |
|---|---|---|---|---|
| GOV-2087 | 2026-06-15 | 180 | PAID | APPROVED |
| GOV-1001 | 2026-06-18 | 240 | COMP_OFF | CONVERTED_TO_COMPOFF |

**attendance_exceptions**
| employee | exception_type | start_date | end_date | reason | status |
|---|---|---|---|---|---|
| GOV-1001 | WFH | 2026-06-22 | 2026-06-22 | Network maintenance at office | APPROVED |
| GOV-2087 | TOUR | 2026-06-10 | 2026-06-12 | Field inspection — District B | APPROVED |

**comp_off_ledger**
| employee | entry_type | days | source_ref_type | earned_on | expires_on | balance_after |
|---|---|---|---|---|---|---|
| GOV-1001 | EARN | +1.0 | OVERTIME | 2026-06-18 | 2026-09-18 | 1.0 |
| GOV-1001 | REDEEM | -1.0 | LEAVE_APPLICATION | 2026-06-26 | (n/a) | 0.0 |

**leave_types**
| leave_code | name | category | is_accruable | is_encashable | affects_pay | gender | max_continuous_days |
|---|---|---|---|---|---|---|---|
| EL | Earned Leave | PAID | true | true | false | ALL | 180 |
| HPL | Half-Pay Leave | HALF_PAY | true | false | true | ALL | 24 |
| MAT | Maternity Leave | SPECIAL | false | false | false | FEMALE | 180 |

**leave_accrual_policies**
| leave_type | frequency | quantity | basis | carry_forward | cf_cap | lapse_rule | effective_from |
|---|---|---|---|---|---|---|---|
| EL | HALF_YEARLY | 15 | CALENDAR | true | 300 | LAPSE_EXCESS | 2026-01-01 |
| HPL | HALF_YEARLY | 10 | CALENDAR | true | (none) | NO_LAPSE | 2026-01-01 |
| CL | ANNUAL | 12 | CALENDAR | false | 0 | LAPSE_EXCESS | 2026-01-01 |

**leave_balances**
| employee | leave_type | leave_year | opening | accrued | availed | current_balance |
|---|---|---|---|---|---|---|
| GOV-1001 | EL | 2026 | 120 | 15 | 5 | 130 |
| GOV-2087 | CL | 2026 | 0 | 12 | 3 | 9 |

**leave_balance_ledger**
| employee | leave_type | entry_type | amount | balance_after | source_ref_type | effective_date |
|---|---|---|---|---|---|---|
| GOV-1001 | EL | ACCRUAL | +15 | 135 | ACCRUAL_RUN | 2026-01-01 |
| GOV-1001 | EL | AVAIL | -5 | 130 | LEAVE_APPLICATION | 2026-06-29 |

**leave_applications / leave_application_days**
| application_no | employee | leave_type | start_date | end_date | total_days | status | sr_posting_status |
|---|---|---|---|---|---|---|---|
| LV-2026-000451 | GOV-1001 | EL | 2026-06-29 | 2026-07-03 | 5 | APPROVED | POSTED |
| LV-2026-000452 | GOV-2087 | CL | 2026-06-20 | 2026-06-20 | 0.5 | SUBMITTED | NOT_REQUIRED |

**leave_encashment_requests**
| employee | leave_type | encashment_type | days_requested | status |
|---|---|---|---|---|
| GOV-1001 | EL | IN_SERVICE | 15 | APPROVED |
| GOV-5500 | EL | RETIREMENT | 300 | SETTLED |

**leave_year_close_runs**
| leave_year | scope | run_status | employees_processed | total_carried | total_lapsed |
|---|---|---|---|---|---|
| 2025 | (all) | COMMITTED | 4820 | 58200 | 1240 |
| 2026 | Head Office | SIMULATED | 612 | 7100 | 95 |

**payroll_attendance_feed**
| pay_period | employee | lwp_days | half_pay_days | paid_ot_minutes | encashment_amount | export_status |
|---|---|---|---|---|---|---|
| 2026-06 | GOV-2087 | 2 | 1 | 180 | 0 | EXPORTED |
| 2026-06 | GOV-1001 | 0 | 0 | 0 | 45000 | PENDING |

---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table.

---

### FR-01 — Shift & Roster Management
- **Module:** Time & Attendance
- **Primary Role(s):** HR Officer, HR Admin (configure); Employee/Manager (view)
- **User Story:** As an HR Officer, I want to define shifts and assign employees to rosters so that attendance is evaluated against the correct working pattern.
- **Description:** Create/maintain shift definitions (timings, grace, thresholds, night flag, breaks) and assign employees to shifts over date ranges with a weekly-off pattern. Supports rotating rosters and bulk assignment by org unit.
- **Acceptance Criteria:**
  1. HR can create a shift with start/end/grace/thresholds and scope.
  2. HR can assign one or more employees to a shift for a date range with a weekly-off pattern.
  3. Overlapping PUBLISHED rosters for the same employee/date are rejected with `ROSTER_OVERLAP`.
  4. Publishing a roster supersedes any prior open-ended roster for the same employee from the new `effective_from`.
  5. Employees and managers can view applicable shift/weekly-off for any date.
- **Business Rules:**
  - Night shifts (`is_night_shift=true`) attribute the worked period to the shift start date.
  - Weekly-off pattern supports fixed days and alternating Saturdays (e.g. `SAT2`,`SAT4`).
  - Only ACTIVE shifts may be assigned.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | shifts | CRUD shift master |
  | rosters | Assignment records |
  | org_units, employees | Scope & assignee |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/shifts | Create shift |
  | POST | /api/v1/atl/rosters | Assign roster |
  | GET | /api/v1/atl/rosters?employeeId= | View roster |
- **UI Behavior Notes:** Shift form with time pickers; roster assignment grid with multi-select employees and a visual weekly-off picker; conflict banner on overlap.
- **Edge Cases:** Mid-period shift change; employee transferred (M05) mid-roster; alternating-Saturday boundary at month/year edge; DST not applicable (IST fixed).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ShiftService`, `RosterService`, `RosterConflictValidator`, React `RosterPlanner` |
  | Backend Flow | Validate scope → check overlap → persist → publish supersedes prior → audit |
  | Data Operations | INSERT shifts/rosters; UPDATE prior roster `status=SUPERSEDED` (txn) |
  | Validation | Time order, threshold sanity, overlap, ACTIVE shift only |
  | Authorization | RBAC HR + org-unit scope |
  | State Changes & Side Effects | roster DRAFT→PUBLISHED→SUPERSEDED; triggers attendance recompute for affected future days |
  | Failure Handling | `ROSTER_OVERLAP` 409; `INVALID_SHIFT_TIMES` 400 |
  | Dependencies | M01 employees, org_units |
  | Test Guidance | Overlap rejection; night-shift date attribution; supersede chain; alt-Saturday calc |

---

### FR-02 — Holiday Calendar Management (by location)
- **Module:** Time & Attendance
- **Primary Role(s):** HR Admin (configure); all (view)
- **User Story:** As an HR Admin, I want location-specific holiday calendars so attendance and leave-day computation honour the right holidays per office.
- **Description:** Define yearly holiday calendars bound to org/location scope, with gazetted/restricted/sectional/optional types; employees elect Restricted Holidays (RH) within a cap.
- **Acceptance Criteria:**
  1. HR can create a calendar for a year/location and add holidays.
  2. Duplicate date in the same calendar is rejected (`HOLIDAY_DUPLICATE`).
  3. Publishing a calendar makes it the basis for attendance/leave computation in scope.
  4. Employees can elect up to N restricted holidays (configurable).
  5. Holidays sandwiched between leave can be configured to count or not.
- **Business Rules:** A holiday on a roster weekly-off does not double-grant; an employee inherits the calendar of their org unit/location; RH cap default 2.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | holiday_calendars | Calendar master |
  | holidays | Dates |
  | org_units | Location scope |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/holiday-calendars | Create calendar |
  | POST | /api/v1/atl/holiday-calendars/{id}/holidays | Add holiday |
  | GET | /api/v1/atl/holidays?date=&orgUnitId= | Resolve holidays |
- **UI Behavior Notes:** Calendar grid view; bulk import (CSV) of holidays; RH-election self-service with remaining-count badge.
- **Edge Cases:** Mid-year office relocation (which calendar applies); national vs sectional overlap on same date; RH already availed when calendar edited.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `HolidayCalendarService`, `HolidayResolver`, `RHElectionService` |
  | Backend Flow | Resolve employee location → pick PUBLISHED calendar → return holiday set |
  | Data Operations | INSERT calendar/holidays; UPSERT RH election |
  | Validation | Unique date, RH cap, year match |
  | Authorization | HR Admin write; all read |
  | State Changes & Side Effects | DRAFT→PUBLISHED→ARCHIVED; recompute affected attendance_daily |
  | Failure Handling | `HOLIDAY_DUPLICATE` 409; `RH_CAP_EXCEEDED` 409 |
  | Dependencies | M01 org_units |
  | Test Guidance | Location resolution; RH cap; sandwich rule toggle |

---

### FR-03 — Attendance Punch Ingestion (biometric / RFID / mobile-geo)
- **Module:** Time & Attendance
- **Primary Role(s):** System (devices), Employee (mobile/web), SysAdmin (device config)
- **User Story:** As the system, I want to reliably ingest punches from biometric/RFID devices and the mobile app so daily attendance can be computed accurately and idempotently.
- **Description:** Accept punch events from registered devices (batch push or pull) and from the mobile app with geofence validation; deduplicate; classify direction; store raw immutably.
- **Acceptance Criteria:**
  1. A punch with a known `(device_id, source_ref)` already ingested is marked `DUPLICATE`, not re-stored.
  2. Mobile punches outside the device geofence are `REJECTED` with `GEOFENCE_VIOLATION`.
  3. Punches from unknown/inactive devices are rejected (`DEVICE_NOT_AUTHORIZED`).
  4. Future-dated punches are rejected (`INVALID_PUNCH_TIME`).
  5. All accepted punches are immutable and append-only.
- **Business Rules:** Device authenticated via hashed API key/cert; mobile requires authenticated user + GPS; direction inferred (odd=IN/even=OUT) when not supplied; clock skew tolerance ±5 min.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_punches | Raw store |
  | attendance_devices | Source auth & geofence |
  | employees | Owner |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/punches/ingest | Device batch ingest |
  | POST | /api/v1/atl/punches/mobile | Mobile geo punch |
- **UI Behavior Notes:** Mobile "Punch In/Out" button with live GPS + map pin; confirmation toast with server time; offline queue with sync.
- **Edge Cases:** Device clock drift; duplicate replays after network retry; multiple devices same gate; GPS spoofing (flag + review); offline mobile punches synced later (timestamp = capture time).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PunchIngestController`, `DeviceAuthFilter`, `GeofenceValidator`, `DedupeService` |
  | Backend Flow | Auth device/user → validate geofence/time → dedupe by source_ref → INSERT → enqueue daily-recompute |
  | Data Operations | INSERT punches only (append-only); UNIQUE conflict ⇒ DUPLICATE |
  | Validation | Device active, geofence, time skew, future-date |
  | Authorization | Device API key / authenticated user (self) |
  | State Changes & Side Effects | Triggers FR-04 recompute for the punch date |
  | Failure Handling | `GEOFENCE_VIOLATION` 422; `DEVICE_NOT_AUTHORIZED` 403; `INVALID_PUNCH_TIME` 400 |
  | Dependencies | attendance_devices, M01 |
  | Test Guidance | Idempotent replay; geofence boundary; offline-sync ordering; skew tolerance |

---

### FR-04 — Daily Attendance Processing & Status Computation
- **Module:** Time & Attendance
- **Primary Role(s):** System (scheduled), HR Officer (rerun)
- **User Story:** As the system, I want to compute each employee's daily attendance status from punches, roster, holidays, leave, and exceptions so that downstream payroll and reports are accurate.
- **Description:** Nightly (and on-demand) batch derives `attendance_daily` by combining punches, roster/shift, holiday calendar, approved leave, and WFH/OD exceptions; computes worked minutes, late/early, and final status.
- **Acceptance Criteria:**
  1. Days with approved leave → `ON_LEAVE`; holiday → `HOLIDAY`; weekly-off → `WEEKLY_OFF`.
  2. Worked minutes ≥ full-day threshold → `PRESENT`; between half and full → `HALF_DAY`; below → `ABSENT`.
  3. Punch-in only / out only → `MISSING_PUNCH`.
  4. WFH/OD approved → `WFH`/`ON_DUTY` regardless of punches.
  5. Re-running for a date is idempotent and overwrites only system-computed (non-regularised) rows.
- **Business Rules:** Precedence: Leave > Holiday > Weekly-off > WFH/OD > Punch-derived. Night-shift spans attributed to shift start date. Regularised days are not overwritten.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_daily | Output |
  | attendance_punches, rosters, holidays, leave_applications, attendance_exceptions | Inputs |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/attendance/process | Trigger run (date/scope) |
  | GET | /api/v1/atl/attendance/daily?employeeId=&from=&to= | View |
- **UI Behavior Notes:** Monthly attendance grid with color-coded statuses; legend; drill to punches; HR "reprocess" action with scope picker.
- **Edge Cases:** Late punch sync after run (auto re-trigger); employee with no roster (defaults to GEN or flagged); leave approved after processing (re-trigger); mid-day status change.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceProcessor`, `StatusResolver`, scheduler job |
  | Backend Flow | For each employee/date: load inputs → apply precedence → compute minutes/late → UPSERT (skip regularised) → record `processing_run_id` |
  | Data Operations | UPSERT attendance_daily (UNIQUE employee/date) in batched txns |
  | Validation | Roster existence, input completeness |
  | Authorization | System; HR rerun scoped |
  | State Changes & Side Effects | Sets daily status; feeds FR-17; emits ABSENT alert notification |
  | Failure Handling | Partial-batch isolation; failed employee logged, batch continues; `PROCESSING_ERROR` 500 |
  | Dependencies | FR-01,02,03,07,08,12 |
  | Test Guidance | Precedence matrix; threshold boundaries; idempotent rerun; night-shift attribution |

---

### FR-05 — Missed-Punch Regularisation
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (raise), Manager/HR (approve)
- **User Story:** As an employee, I want to regularise a missed or incorrect punch with justification so my attendance reflects reality after approval.
- **Description:** Employee submits a correction for a `MISSING_PUNCH`/`ABSENT`/`HALF_DAY` day with proposed times and reason; routed to manager; on approval the daily status is corrected and locked as regularised.
- **Acceptance Criteria:**
  1. Employee can raise regularisation only for own past days within the configurable window (default 15 days).
  2. Approval updates `attendance_daily` and sets `is_regularised=true`.
  3. Rejected requests leave attendance unchanged with reason logged.
  4. A monthly cap on regularisations is enforced (`REGULARISATION_LIMIT`).
  5. Audit captures before/after status.
- **Business Rules:** Cannot regularise a finalized/payroll-locked period; manager approval required; HR can act on behalf; document optional but configurable per status.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | regularisation_requests | Request |
  | attendance_daily | Target |
  | workflow_instances/tasks | Approval |
  | documents | Proof |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/regularisations | Raise |
  | POST | /api/v1/atl/regularisations/{id}/decision | Approve/reject |
- **UI Behavior Notes:** From attendance grid, "Regularise" on an eligible day opens a form; manager inbox shows pending; status timeline.
- **Edge Cases:** Period locked by payroll; cap exceeded; backdated beyond window; concurrent regularisation + leave on same day (conflict).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `RegularisationService`, `WorkflowEngineAdapter`, `AttendanceProcessor` |
  | Backend Flow | Validate eligibility/window/cap/lock → create workflow → on approve update daily (txn) + audit |
  | Data Operations | INSERT request; UPDATE attendance_daily on approval |
  | Validation | Window, cap, period-lock, self-only |
  | Authorization | Self create; manager/HR approve (no self-approve) |
  | State Changes & Side Effects | request SUBMITTED→APPROVED/REJECTED; daily corrected; FR-17 recompute |
  | Failure Handling | `PERIOD_LOCKED` 409; `REGULARISATION_LIMIT` 409; `WINDOW_EXPIRED` 422 |
  | Dependencies | FR-04, FR-17 |
  | Test Guidance | Window/cap enforcement; lock guard; before/after audit |

---

### FR-06 — Overtime Capture & Approval
- **Module:** Time & Attendance
- **Primary Role(s):** Employee/Manager (claim/recommend), HR/Authority (approve)
- **User Story:** As an employee, I want approved overtime to be either paid or converted to compensatory-off so extra hours are fairly compensated.
- **Description:** Capture OT from worked-minutes beyond shift or on holidays/weekly-offs; submit claim with treatment (paid/comp-off); on approval, paid OT flows to payroll feed and comp-off credits the comp-off ledger.
- **Acceptance Criteria:**
  1. OT can only be claimed where actual worked minutes exceed shift end + grace (validated against punches).
  2. Approved `PAID` OT contributes `paid_ot_minutes` to the payroll feed.
  3. Approved `COMP_OFF` OT creates an `EARN` entry in `comp_off_ledger` with expiry.
  4. OT rate multiplier applies per policy (e.g. 2x on holidays).
  5. Duplicate OT for the same date is prevented.
- **Business Rules:** Comp-off earned expires after configurable days (default 90); holiday/weekly-off OT defaults to comp-off unless paid-OT policy applies; max OT/month cap.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | overtime_records | Claim |
  | comp_off_ledger | Comp-off earn |
  | payroll_attendance_feed | Paid OT |
  | attendance_daily | Validation source |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/overtime | Claim |
  | POST | /api/v1/atl/overtime/{id}/decision | Approve/reject |
- **UI Behavior Notes:** OT claim shows computed eligible minutes (read-only) with treatment toggle; approver sees evidence; comp-off balance widget.
- **Edge Cases:** OT claimed but punches don't support it (rejected); comp-off expiry before redemption; OT on a leave day; cap exceeded.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `OvertimeService`, `CompOffLedgerService`, `WorkflowEngineAdapter` |
  | Backend Flow | Validate against punches → workflow → on approve branch PAID/COMP_OFF (txn writes feed or ledger) |
  | Data Operations | INSERT overtime; INSERT comp_off_ledger EARN or feed update |
  | Validation | Worked-minutes proof, cap, duplicate |
  | Authorization | Self/manager claim; HR/authority approve |
  | State Changes & Side Effects | SUBMITTED→APPROVED→PAID/CONVERTED_TO_COMPOFF; comp-off balance updated |
  | Failure Handling | `OT_NOT_SUPPORTED_BY_PUNCHES` 422; `OT_CAP_EXCEEDED` 409 |
  | Dependencies | FR-03/04, FR-09, FR-17 |
  | Test Guidance | Paid vs comp-off branch; expiry set; cap; punch validation |

---

### FR-07 — Work-From-Home (WFH)
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (apply), Manager (approve)
- **User Story:** As an employee, I want to request work-from-home days so my attendance is recorded as working without office punches.
- **Description:** Employee applies for WFH for a date range; on approval the affected days are computed as `WFH` (counted as present) in FR-04; optional WFH-day cap per month.
- **Acceptance Criteria:**
  1. Approved WFH days show as `WFH` and count as present for payroll.
  2. WFH cannot overlap an existing approved leave/holiday.
  3. Monthly WFH cap enforced if configured.
  4. Manager approval required; HR can apply on behalf.
- **Business Rules:** WFH excluded on weekly-off/holiday (no-op); WFH may still require optional self check-in via mobile (policy).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_exceptions | WFH record |
  | attendance_daily | Status output |
  | workflow_instances | Approval |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/exceptions (type=WFH) | Apply |
  | POST | /api/v1/atl/exceptions/{id}/decision | Approve |
- **UI Behavior Notes:** Date-range picker with conflict pre-check; approved WFH appears on team calendar (FR-14).
- **Edge Cases:** WFH overlapping leave; cap exceeded; cancellation after partial period.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceExceptionService`, `ConflictChecker` |
  | Backend Flow | Validate overlap/cap → workflow → approve → FR-04 recompute |
  | Data Operations | INSERT exception; recompute daily |
  | Validation | Overlap, cap, date sanity |
  | Authorization | Self apply; manager approve |
  | State Changes & Side Effects | exception SUBMITTED→APPROVED; daily=WFH |
  | Failure Handling | `EXCEPTION_OVERLAP` 409; `WFH_CAP_EXCEEDED` 409 |
  | Dependencies | FR-04, FR-14 |
  | Test Guidance | Overlap/cap; present-counting; weekly-off no-op |

---

### FR-08 — On-Duty / Tour / Outdoor Duty
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (apply), Manager/Authority (approve)
- **User Story:** As a field officer, I want to record on-duty/tour days so my absence from the office is treated as official duty, not leave.
- **Description:** Capture On-Duty/Tour with location, purpose, and supporting order; approved days compute as `ON_DUTY` (present); links to tour order document.
- **Acceptance Criteria:**
  1. Approved OD/Tour days show `ON_DUTY` and count as present.
  2. Tour requires a location and may require an order document.
  3. OD cannot overlap approved leave.
  4. Tour spanning weekly-off/holiday optionally counts per policy.
- **Business Rules:** Tour may generate comp-off if it includes holidays worked (policy); OD distinct from WFH in reports.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_exceptions | OD/Tour record |
  | documents | Tour order |
  | attendance_daily | Status output |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/exceptions (type=ON_DUTY/TOUR) | Apply |
  | POST | /api/v1/atl/exceptions/{id}/decision | Approve |
- **UI Behavior Notes:** Tour form with location, purpose, document upload; map optional.
- **Edge Cases:** Tour extended beyond approved range; OD overlapping leave; document missing when required.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceExceptionService`, `DocumentRefValidator` |
  | Backend Flow | Validate → workflow → approve → recompute; optional comp-off earn |
  | Data Operations | INSERT exception; optional comp_off_ledger EARN |
  | Validation | Location/doc required, overlap |
  | Authorization | Self apply; authority approve |
  | State Changes & Side Effects | daily=ON_DUTY; possible comp-off |
  | Failure Handling | `DOCUMENT_REQUIRED` 422; `EXCEPTION_OVERLAP` 409 |
  | Dependencies | M13 documents, FR-04, FR-09 |
  | Test Guidance | OD present-counting; doc enforcement; holiday-in-tour comp-off |

---

### FR-09 — Compensatory-Off Earning & Redemption
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (redeem), System/Manager (earn/approve)
- **User Story:** As an employee, I want comp-off credited for approved holiday/OT work and to redeem it as time off before it expires.
- **Description:** Maintain an append-only comp-off ledger; earn entries from FR-06/FR-08; redeem via a comp-off leave application; expire unused credits on a scheduled job.
- **Acceptance Criteria:**
  1. Earn entries credit the ledger with an `expires_on`.
  2. Redemption debits FIFO from non-expired credits.
  3. Redemption beyond balance is rejected (`COMP_OFF_INSUFFICIENT`).
  4. A daily job expires past-due credits (`EXPIRE` entries) and notifies owners ahead of expiry.
  5. Ledger balance reconciles to `balance_after` of latest entry.
- **Business Rules:** FIFO consumption; default 90-day validity; comp-off counted as paid present day; no negative balance.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | comp_off_ledger | Earn/redeem/expire |
  | leave_applications (COMPOFF type) | Redemption |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/comp-off/balance?employeeId= | Balance |
  | POST | /api/v1/atl/comp-off/redeem | Redeem |
- **UI Behavior Notes:** Comp-off wallet showing credits with expiry countdown; redeem flow reuses leave application UI.
- **Edge Cases:** Redeem on a day that later becomes holiday; expiry during pending redemption; partial-day redemption.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CompOffLedgerService`, `CompOffExpiryJob`, `FifoConsumer` |
  | Backend Flow | Earn insert (FR-06/08); redeem validates balance → REDEEM entry + leave application; expiry job inserts EXPIRE |
  | Data Operations | INSERT ledger entries (append-only) |
  | Validation | Sufficient non-expired balance, FIFO |
  | Authorization | Self redeem; system earn/expire |
  | State Changes & Side Effects | balance updated; leave application created on redeem |
  | Failure Handling | `COMP_OFF_INSUFFICIENT` 409; `COMP_OFF_EXPIRED` 422 |
  | Dependencies | FR-06, FR-08, FR-12 |
  | Test Guidance | FIFO order; expiry job; reconciliation; negative-balance block |

---

### FR-10 — Leave-Type & Accrual-Policy Configuration
- **Module:** Leave Management
- **Primary Role(s):** HR Admin
- **User Story:** As an HR Admin, I want to configure leave types and their accrual/carry-forward/encashment policies so the engine applies the correct statutory rules per cadre and office.
- **Description:** Maintain the leave catalog (CL, EL, HPL, Commuted, Maternity, Paternity, Child-Care, Study, Medical, Sabbatical, LWP, Comp-off) and versioned accrual policies scoped by org unit/cadre with caps, carry-forward, lapse, and encashment rules.
- **Acceptance Criteria:**
  1. HR can create/deactivate leave types with category, eligibility, document, and caps.
  2. HR can define a versioned accrual policy per type/scope with frequency, quantity, basis, caps, carry-forward, lapse rule, encashment cap.
  3. Overlapping ACTIVE policies for the same type/scope/date are rejected.
  4. Gender/cadre eligibility is enforced downstream at apply-time.
  5. Policy changes are versioned (effective_from/to), never destructive.
- **Business Rules:** Statutory caps preset (Maternity 180, Paternity 15, etc.) but editable; HPL = half-pay; Commuted leave debits 2× EL-equivalent per policy; LWP affects pay and service.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_types | Catalog |
  | leave_accrual_policies | Rules |
  | org_units, cadres | Scope |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-types | Create type |
  | POST | /api/v1/atl/leave-policies | Create policy |
  | GET | /api/v1/atl/leave-policies?leaveTypeId= | List versions |
- **UI Behavior Notes:** Leave-type admin grid; policy builder wizard with live rule summary; version history timeline.
- **Edge Cases:** Two scopes match an employee (most-specific wins); policy edited mid-year (applies prospectively); deactivating a type with open balances (blocked).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveTypeService`, `AccrualPolicyService`, `PolicyResolver` |
  | Backend Flow | Validate scope/overlap → version prior (SUPERSEDED) → persist new |
  | Data Operations | INSERT type/policy; UPDATE prior policy status |
  | Validation | Overlap, cap sanity, eligibility |
  | Authorization | HR Admin only |
  | State Changes & Side Effects | policy DRAFT→ACTIVE→SUPERSEDED; affects future accrual |
  | Failure Handling | `POLICY_OVERLAP` 409; `TYPE_IN_USE` 409 |
  | Dependencies | M01 cadres/org_units |
  | Test Guidance | Most-specific resolution; versioning; eligibility enforcement |

---

### FR-11 — Accrual Engine & Leave-Balance Ledger
- **Module:** Leave Management
- **Primary Role(s):** System (scheduled), HR Officer (adjust)
- **User Story:** As the system, I want to accrue leave per policy and record every balance change in an immutable ledger so balances are always auditable and reconcilable.
- **Description:** Scheduled accrual job credits leave per policy (annual/monthly/half-yearly, prorated by service/attendance) writing `ACCRUAL` ledger entries; every avail/encash/lapse/adjustment also writes the ledger; balances are the reconciled projection.
- **Acceptance Criteria:**
  1. Accrual job credits the correct quantity per active policy and updates balance.
  2. Every balance mutation writes exactly one ledger entry with `balance_after`.
  3. `leave_balances.current_balance` always equals latest ledger `balance_after` (reconciliation passes).
  4. Pro-rated accrual on mid-year joining/leaving is computed per basis.
  5. Manual adjustments require maker-checker and a reason.
- **Business Rules:** Accrual respects `max_balance_cap`; suspended/LWP periods may suspend accrual per policy; HPL accrues separately; no balance change occurs outside the ledger.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_balance_ledger | Source of truth |
  | leave_balances | Projection |
  | leave_accrual_policies | Rules |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/accrual/run | Trigger accrual (scope) |
  | GET | /api/v1/atl/leave-ledger?employeeId=&leaveTypeId= | Ledger view |
  | POST | /api/v1/atl/leave-ledger/adjust | Manual adjustment (maker) |
- **UI Behavior Notes:** Balance card per leave type; ledger statement view (date, type, +/-, balance) downloadable; adjustment form with checker step.
- **Edge Cases:** Re-run accrual (idempotent guard per cycle); cap reached (credit truncated + note); negative adjustment that would go below 0; concurrent avail during accrual.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AccrualEngine`, `LeaveLedgerService`, `BalanceProjector`, `ReconciliationJob` |
  | Backend Flow | For each employee/policy: compute accrual (cap-aware) → INSERT ledger + UPDATE balance (txn) → idempotency key per cycle |
  | Data Operations | INSERT ledger (append-only); UPDATE balances |
  | Validation | Idempotency, cap, non-negative |
  | Authorization | System run; HR adjust (maker-checker) |
  | State Changes & Side Effects | balances updated; notifications on credit; reconciliation flag |
  | Failure Handling | `ACCRUAL_ALREADY_RUN` 409; `LEDGER_RECON_MISMATCH` 500 (alert) |
  | Dependencies | FR-10; M01 service dates |
  | Test Guidance | Reconciliation invariant; idempotent re-run; proration; cap truncation; maker-checker |

---

### FR-12 — Leave Application & Approval Workflow
- **Module:** Leave Management
- **Primary Role(s):** Employee (apply), Manager (recommend), HR/Authority (approve)
- **User Story:** As an employee, I want to apply for leave with half-day support and have it approved through the right chain, with my balance and the Service Register updated automatically.
- **Description:** Employee applies (type, dates, half-day portions, reason, document); system validates balance/eligibility/conflicts; routes through configurable approval chain; on approval, debits the ledger, sets attendance to ON_LEAVE, and (for SR-relevant types) enqueues a Digital SR posting via M04.
- **Acceptance Criteria:**
  1. Total days computed excluding weekly-off/holidays unless sandwich rule applies; half-day = 0.5 unit.
  2. Application blocked if balance insufficient (except advance-allowed types) — `INSUFFICIENT_BALANCE`.
  3. On approval, a single transaction: ledger `AVAIL` debit + balance update + application APPROVED + attendance ON_LEAVE + SR enqueue + notification.
  4. Eligibility (gender/cadre/document) enforced.
  5. Approval chain configurable (Manager → HR; special leaves → Sanctioning Authority).
  6. SR-relevant approved leave sets `sr_posting_status=PENDING` then `POSTED` on M04 ack.
- **Business Rules:** No double-booking a day; Commuted/Medical require document; Maternity/CCL gender-restricted; advance leave only for configured types; balance held (soft-reserve) on submit to prevent oversubscription.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications, leave_application_days | Request |
  | leave_balance_ledger, leave_balances | Debit |
  | attendance_daily | ON_LEAVE |
  | service_register_events (via M04) | Statutory post |
  | workflow_instances/tasks | Approval |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-applications | Apply |
  | POST | /api/v1/atl/leave-applications/{id}/decision | Approve/reject/recommend |
  | GET | /api/v1/atl/leave-applications?employeeId=&status= | List |
- **UI Behavior Notes:** Apply wizard: type → date range with per-day half/full toggle → live balance preview → document upload → submit; approver inbox with team-conflict indicator; status timeline with SR-posting badge.
- **Edge Cases:** Balance changes between submit and approve (soft-reserve resolves); overlapping application; holiday sandwiched; SR posting fails (retry queue, status FAILED, HR alert); applicant = approver (blocked).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveApplicationService`, `LeaveValidator`, `WorkflowEngineAdapter`, `LeaveLedgerService`, `SRPostingProducer` |
  | Backend Flow | Validate eligibility/balance/conflicts → soft-reserve → create workflow → on final approve run txn (ledger debit, balance, status, attendance, SR enqueue, notify) |
  | Data Operations | INSERT application+days; INSERT ledger AVAIL; UPDATE balance/attendance; enqueue SR + notification |
  | Validation | Balance, eligibility, conflict, dates, document |
  | Authorization | Self apply; chain approve (no self-approval) |
  | State Changes & Side Effects | DRAFT→SUBMITTED→[RECOMMENDED]→APPROVED/REJECTED; sr_posting NOT_REQUIRED/PENDING/POSTED/FAILED; employment_status hint ON_LEAVE to M01 |
  | Failure Handling | `INSUFFICIENT_BALANCE` 409; `LEAVE_OVERLAP` 409; `ELIGIBILITY_FAILED` 422; `SR_POSTING_FAILED` async-retry |
  | Dependencies | FR-10/11, M04-LSR, M01 |
  | Test Guidance | Atomic approval txn; soft-reserve; SR enqueue; conflict block; half-day units; rollback on partial failure |

---

### FR-13 — Leave Cancellation & Modification
- **Module:** Leave Management
- **Primary Role(s):** Employee (request), Manager/HR (approve)
- **User Story:** As an employee, I want to cancel or withdraw leave (whole or partial, before or after start) so unused leave is credited back correctly.
- **Description:** Support withdrawal of a SUBMITTED application and cancellation of an APPROVED one (full or partial future days); approved cancellation reverses the ledger debit (`AVAIL_REVERSAL`), restores attendance, and reverses/cancels any SR posting via M04.
- **Acceptance Criteria:**
  1. SUBMITTED application can be withdrawn by applicant (no approval needed) → balance soft-reserve released.
  2. APPROVED future leave can be cancelled (full/partial) with approval → `AVAIL_REVERSAL` credit for the cancelled days only.
  3. Past/availed days cannot be cancelled (`CANNOT_CANCEL_PAST`).
  4. Attendance for cancelled days recomputed; SR posting reversal enqueued for SR-relevant leave.
  5. Audit captures original vs revised.
- **Business Rules:** Partial cancellation only for future, contiguous-tail or specific days per policy; encashed/closed-year leave not cancellable; reversal amount = exact debited units for cancelled days.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications, leave_application_days | Modify |
  | leave_balance_ledger | Reversal |
  | attendance_daily | Recompute |
  | service_register_events (via M04) | Reversal |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-applications/{id}/withdraw | Withdraw |
  | POST | /api/v1/atl/leave-applications/{id}/cancel | Cancel (full/partial) |
- **UI Behavior Notes:** Cancel modal with selectable future days and credited-back preview; status changes to CANCELLED/WITHDRAWN.
- **Edge Cases:** Cancel after partial availment; concurrent payroll lock; SR already posted (reversal event); cancel of comp-off redemption restores comp-off credit.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveCancellationService`, `LeaveLedgerService`, `SRPostingProducer` |
  | Backend Flow | Validate cancellable days → workflow (if approved) → txn: AVAIL_REVERSAL credit + balance + status + attendance recompute + SR reversal enqueue |
  | Data Operations | INSERT ledger AVAIL_REVERSAL; UPDATE application/days/balance |
  | Validation | Future-only, not-locked, not-encashed |
  | Authorization | Self withdraw; manager/HR approve cancel |
  | State Changes & Side Effects | →CANCELLED/WITHDRAWN; balance restored; SR reversed |
  | Failure Handling | `CANNOT_CANCEL_PAST` 422; `PERIOD_LOCKED` 409 |
  | Dependencies | FR-12, M04 |
  | Test Guidance | Partial reversal accuracy; soft-reserve release; SR reversal; comp-off restore |

---

### FR-14 — Backdated Leave & Team-Calendar Conflict Detection
- **Module:** Leave Management
- **Primary Role(s):** Employee (apply), Manager (view/approve)
- **User Story:** As a manager, I want a team leave calendar that flags coverage conflicts and to control backdated leave so staffing and compliance are maintained.
- **Description:** Allow backdated leave within a configurable window with mandatory justification and elevated approval; provide a manager team calendar visualising leave/WFH/OD/holidays and flagging concurrent-absence thresholds.
- **Acceptance Criteria:**
  1. Backdated leave permitted only within window (default 30 days) and flagged `is_backdated=true` with elevated approval.
  2. Team calendar shows all team members' leave/WFH/OD/holidays for a selected month.
  3. When concurrent approved absences exceed a configurable threshold (e.g. >30% of team), a conflict warning is shown to the approver.
  4. Backdated leave beyond window is rejected (`BACKDATE_WINDOW_EXCEEDED`).
  5. Manager can filter calendar by status/leave type.
- **Business Rules:** Backdated leave still validates balance for the relevant leave-year; conflict threshold advisory (does not auto-block) but recorded; calendar respects org-unit row-level scope.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications | Backdate + calendar |
  | attendance_exceptions | Calendar overlay |
  | holidays | Calendar overlay |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/team-calendar?managerId=&month= | Calendar |
  | GET | /api/v1/atl/leave-applications/conflicts?orgUnitId=&range= | Conflict check |
- **UI Behavior Notes:** Month grid, rows=employees, cells color-coded; conflict heat indicator; backdated badge; approver sees conflict % before deciding.
- **Edge Cases:** Backdate crossing leave-year boundary (uses correct year balance); large teams (paginated calendar); overlapping holiday on backdated leave.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `TeamCalendarService`, `ConflictDetector`, `BackdateValidator` |
  | Backend Flow | Backdate: validate window + correct leave-year balance → FR-12 chain (elevated). Calendar: aggregate team absences by day |
  | Data Operations | Read-heavy aggregation; INSERT application (backdate via FR-12) |
  | Validation | Window, leave-year balance, scope |
  | Authorization | Manager scope; self apply |
  | State Changes & Side Effects | conflict advisory recorded on workflow task |
  | Failure Handling | `BACKDATE_WINDOW_EXCEEDED` 422 |
  | Dependencies | FR-12, FR-07/08, FR-02 |
  | Test Guidance | Window enforcement; cross-year balance; threshold calc; scope isolation |

---

### FR-15 — Leave-Year Close: Carry-Forward, Lapse & HPL Conversion
- **Module:** Leave Management
- **Primary Role(s):** HR Admin
- **User Story:** As an HR Admin, I want to close the leave year, carrying forward eligible balances, lapsing excess, and converting per policy, with a dry-run before committing.
- **Description:** Year-close job processes each employee's balances per policy: compute carry-forward (capped), lapse excess, convert (e.g. EL→HPL) where configured, post opening balances for the new year — all via ledger entries; supports SIMULATED dry-run with report before COMMIT.
- **Acceptance Criteria:**
  1. SIMULATED run produces a report (per employee: carried/lapsed/converted/opening) without writing balances.
  2. COMMITTED run writes `CARRY_FORWARD`, `LAPSE`, `HPL_CONVERSION`, and `OPENING` ledger entries atomically per employee.
  3. Carry-forward respects `carry_forward_cap`; excess lapses per `lapse_rule`.
  4. New leave-year `leave_balances` rows are created with correct opening balances.
  5. A committed year cannot be re-committed (`YEAR_ALREADY_CLOSED`).
- **Business Rules:** EL excess beyond CF cap lapses; CL typically lapses fully (no CF); HPL may have no-lapse; close is irreversible except via maker-checker adjustment; run is idempotent per (year, scope).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_year_close_runs | Run record |
  | leave_balance_ledger | CF/LAPSE/CONVERSION/OPENING |
  | leave_balances | New-year rows |
  | leave_accrual_policies | CF/lapse rules |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/year-close/simulate | Dry-run |
  | POST | /api/v1/atl/year-close/commit | Commit |
  | GET | /api/v1/atl/year-close/{runId} | Run report |
- **UI Behavior Notes:** Year-close console: scope picker → simulate → downloadable report → confirm-commit with explicit warning; progress bar.
- **Edge Cases:** Employees joined mid-year; pending leave applications spanning year boundary (block or split); retirees during year; partial-scope close then org-wide close.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `YearCloseService`, `CarryForwardCalculator`, `LeaveLedgerService` |
  | Backend Flow | Lock scope → per employee compute CF/lapse/convert → SIMULATE (report) or COMMIT (txn ledger+balances) → mark run |
  | Data Operations | INSERT ledger + new balances (txn per employee) |
  | Validation | Idempotency, pending-leave guard, cap |
  | Authorization | HR Admin only |
  | State Changes & Side Effects | run DRAFT→SIMULATED→COMMITTED; new-year balances live |
  | Failure Handling | `YEAR_ALREADY_CLOSED` 409; `PENDING_LEAVE_BLOCKS_CLOSE` 409 |
  | Dependencies | FR-10/11 |
  | Test Guidance | Dry-run no-write; CF cap & lapse; conversion; idempotency; opening correctness |

---

### FR-16 — Leave Encashment (In-Service & On Retirement)
- **Module:** Leave Management
- **Primary Role(s):** Employee (request), HR/Authority (approve), Payroll (settle)
- **User Story:** As an employee (or retiree), I want to encash eligible leave so I receive payment for unused balance per policy, with retirement encashment feeding terminal benefits.
- **Description:** Submit encashment for encashable types within caps; on approval, debit ledger (`ENCASHMENT`) and post amount to the payroll feed; retirement encashment integrates with M11 terminal-benefit settlement and is capped (e.g. EL ≤ 300 days).
- **Acceptance Criteria:**
  1. Encashment allowed only for `is_encashable` types within `encashment_cap_days` and `min_balance_for_encash`.
  2. Approval debits `ENCASHMENT` ledger entry and creates a payroll-feed amount.
  3. Retirement encashment (`RETIREMENT`) is linked to M11 and capped per policy.
  4. Estimated amount shown (M10 computes final pay).
  5. Insufficient/over-cap requests rejected.
- **Business Rules:** EL retirement encashment capped at 300 days (policy-editable); HPL not encashable; in-service encashment may need LTC linkage; settlement marks `SETTLED` after payroll ack.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_encashment_requests | Request |
  | leave_balance_ledger | ENCASHMENT debit |
  | payroll_attendance_feed | Amount export |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/encashments | Request |
  | POST | /api/v1/atl/encashments/{id}/decision | Approve/reject |
- **UI Behavior Notes:** Encashment form with eligible-balance and cap display, estimated amount; retiree flow surfaced from M11 context.
- **Edge Cases:** Encashment + pending leave reducing balance; cap reached across multiple requests in a year; retirement date change; encashment then cancellation before settlement.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `EncashmentService`, `LeaveLedgerService`, `PayrollFeedProducer` |
  | Backend Flow | Validate eligibility/cap/balance → workflow → approve txn: ENCASHMENT debit + feed amount → settle on M10/M11 ack |
  | Data Operations | INSERT encashment + ledger ENCASHMENT; UPDATE feed |
  | Validation | Encashable, cap, min-balance |
  | Authorization | Self request; HR/authority approve; payroll settle |
  | State Changes & Side Effects | SUBMITTED→APPROVED→SETTLED; balance reduced |
  | Failure Handling | `ENCASHMENT_CAP_EXCEEDED` 409; `NOT_ENCASHABLE` 422 |
  | Dependencies | FR-11, M10, M11 |
  | Test Guidance | Cap enforcement; ledger debit; retirement linkage; settle on ack |

---

### FR-17 — Attendance & Leave → Payroll (LWP) Feed
- **Module:** Integration
- **Primary Role(s):** System (generate), Payroll Officer (reconcile)
- **User Story:** As a Payroll Officer, I want an accurate per-period feed of LWP, half-pay, paid-OT, present days, and encashment so payroll computes pay correctly without manual reconciliation.
- **Description:** For each pay period, aggregate per-employee LWP days (from LWP/absent), half-pay days (HPL), paid-OT minutes, present days, and encashment amounts into `payroll_attendance_feed`; expose to M10 with ack handshake; lock the period to prevent retroactive change after export.
- **Acceptance Criteria:**
  1. Feed generated per `pay_period` aggregates LWP, half-pay, paid-OT, present days, encashment per employee.
  2. LWP derived from `ABSENT` days + LWP-type leave; half-pay from HPL leave.
  3. After EXPORTED, the period is locked; later corrections require an adjustment entry in the next period.
  4. M10 ack updates status to `ACKED`; failures set `FAILED` with retry.
  5. Feed reconciles to attendance_daily + leave ledger for the period.
- **Business Rules:** Present-counting statuses: PRESENT, WFH, ON_DUTY, ON_LEAVE (paid), HALF_DAY (0.5); LWP/absent reduce pay; period lock aligns with FR-05/FR-13 lock guards.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | payroll_attendance_feed | Output |
  | attendance_daily, leave_applications, overtime_records, leave_encashment_requests | Inputs |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/payroll-feed/generate | Generate period feed |
  | GET | /api/v1/atl/payroll-feed?payPeriod= | Retrieve |
  | POST | /api/v1/atl/payroll-feed/{id}/ack | M10 acknowledgement |
- **UI Behavior Notes:** Payroll reconciliation screen: per-employee feed table, totals, export + lock action, ack status; discrepancy highlights.
- **Edge Cases:** Late regularisation after lock (next-period adjustment); employee transferred mid-period (split across org units); encashment settled in different period; re-generation before lock (overwrite).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PayrollFeedService`, `PeriodLockManager`, `FeedReconciler` |
  | Backend Flow | Aggregate period inputs → UPSERT feed (UNIQUE period/employee) → export → lock → on ack mark ACKED |
  | Data Operations | UPSERT feed; status transitions |
  | Validation | Period not double-locked; reconciliation |
  | Authorization | System generate; payroll read/ack |
  | State Changes & Side Effects | PENDING→EXPORTED→ACKED/FAILED; period lock set |
  | Failure Handling | `PERIOD_ALREADY_LOCKED` 409; `M10_ACK_TIMEOUT` retry |
  | Dependencies | FR-04/05/06/12/16, M10 |
  | Test Guidance | Aggregation accuracy; lock guard; ack handshake; reconciliation invariant |

---

### FR-18 — Mobile/Web Self-Service Surface & Notification Triggers
- **Module:** Integration / Self-Service
- **Primary Role(s):** Employee, Manager
- **User Story:** As an employee, I want a mobile and web self-service surface to punch, apply for leave, check balances, and receive timely notifications about my requests.
- **Description:** Unified self-service surface (web + mobile) exposing punch, leave apply/cancel, balance & ledger, comp-off wallet, team calendar (managers), and an approvals inbox; every lifecycle event triggers a `notifications` entry (push/email/in-app) via the shared platform.
- **Acceptance Criteria:**
  1. Employee can punch, apply/cancel leave, view balance/ledger, and view request status from mobile and web.
  2. Manager can approve/reject from the inbox on mobile and web.
  3. Each state transition (submitted, recommended, approved, rejected, cancelled, low-balance, accrual-credited, comp-off-expiring, regularisation-decided) emits a notification.
  4. Notifications respect user channel preferences and are recorded in `notifications`.
  5. Surface is WCAG 2.1 AA compliant and responsive.
- **Business Rules:** Notifications are non-blocking (async); failures retried; sensitive details minimised in push payloads (deep-link to app); escalation reminder if an approval task is pending beyond SLA.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | notifications | Outbound ledger |
  | leave_applications, attendance_punches, comp_off_ledger, regularisation_requests | Event sources |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/self-service/summary | Dashboard data |
  | GET | /api/v1/atl/approvals/inbox | Pending approvals |
  | GET | /api/v1/atl/notifications?status= | Notifications |
- **UI Behavior Notes:** Mobile-first dashboard: balance cards, quick-punch, apply-leave CTA, pending-approvals badge; in-app notification center; deep links.
- **Edge Cases:** Offline mobile (queued actions); duplicate notification suppression; channel preference off (in-app fallback); SLA escalation to next approver.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SelfServiceController`, `ApprovalInboxService`, `NotificationProducer`, React PWA |
  | Backend Flow | Aggregate self-service data; on each transition publish notification event → shared platform delivers |
  | Data Operations | INSERT notifications; read aggregations |
  | Validation | Auth (self/manager scope), channel prefs |
  | Authorization | Employee self; manager team |
  | State Changes & Side Effects | notification records; SLA escalation tasks |
  | Failure Handling | `NOTIFY_DELIVERY_FAILED` async-retry; degrade to in-app |
  | Dependencies | All FRs; shared notifications/workflow |
  | Test Guidance | Event→notification mapping; offline queue; escalation; accessibility |

---

## 7. UI Requirements

### 7.1 Key screens
| Screen | Primary role | Purpose | Key states |
|---|---|---|---|
| Self-Service Dashboard | Employee | Balances, quick-punch, apply CTA, status | empty/loading/error/success |
| Apply-Leave Wizard | Employee | Type→dates(half/full)→balance preview→document→submit | validation/insufficient-balance/conflict |
| Leave Ledger Statement | Employee/HR | Immutable balance history, downloadable | empty/loaded |
| Attendance Grid (monthly) | Employee/Manager | Color-coded daily status, drill to punches | loading/empty |
| Regularisation Form | Employee | Correct missed punch | window-expired/cap-exceeded |
| Approvals Inbox | Manager | Approve/reject/recommend with context | empty/pending/overdue |
| Team Leave Calendar | Manager | Team absences + conflict heat | empty/loading |
| Comp-Off Wallet | Employee | Credits with expiry countdown, redeem | empty/expiring |
| Shift & Roster Planner | HR | Define shifts, assign rosters | overlap-warning |
| Holiday Calendar Admin | HR | Manage calendars/holidays, RH election | duplicate-warning |
| Leave-Type & Policy Builder | HR Admin | Configure types/policies (versioned) | overlap-warning |
| Year-Close Console | HR Admin | Simulate→report→commit | simulated/committed |
| Payroll Reconciliation | Payroll | Period feed, export, lock, ack | locked/exported/failed |

### 7.2 Cross-cutting UI rules
- Mobile-first, responsive; collapsible sidebar with hamburger; dark-mode support.
- Every screen implements empty/loading/error/success/permission states (no skeleton-only UI).
- Dates `DD-MMM-YYYY`; balances with one-decimal precision; INR with locale formatting.
- WCAG 2.1 AA: keyboard navigation, focus order, contrast, ARIA on calendars/grids.
- Toasts for action results; modals for destructive (cancel, year-close commit) with explicit confirmation.
- All list/grid views paginated (max 100) with filters and CSV export where applicable.
- i18n-ready (English + regional language); no hardcoded strings.

---

## 8. API & Integration

### 8.1 Conventions
Base path `/api/v1/atl`. JWT bearer auth; RBAC + org-unit scope enforced server-side. All lists paginated (`?page=&limit=` max 100 or cursor). Idempotency-Key header supported on POST mutation endpoints.

### 8.2 Canonical error envelope
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "End date must be on or after start date.", "field": "end_date" }, "requestId": "req-8f1c2a" }
```

### 8.3 Error-code catalog
| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Generic field validation failure |
| AUTH_REQUIRED | 401 | Missing/invalid token |
| FORBIDDEN | 403 | RBAC/scope/self-approval violation |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Generic conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unexpected server error |
| UPSTREAM_UNAVAILABLE | 503 | M04/M10/M11 dependency down |
| ROSTER_OVERLAP | 409 | Overlapping published roster |
| HOLIDAY_DUPLICATE | 409 | Duplicate holiday date in calendar |
| RH_CAP_EXCEEDED | 409 | Restricted-holiday cap exceeded |
| GEOFENCE_VIOLATION | 422 | Mobile punch outside geofence |
| DEVICE_NOT_AUTHORIZED | 403 | Unknown/inactive device |
| INVALID_PUNCH_TIME | 400 | Future/implausible punch time |
| PROCESSING_ERROR | 500 | Attendance processing failure |
| PERIOD_LOCKED | 409 | Payroll period locked |
| REGULARISATION_LIMIT | 409 | Monthly regularisation cap exceeded |
| WINDOW_EXPIRED | 422 | Regularisation/backdate window passed |
| OT_NOT_SUPPORTED_BY_PUNCHES | 422 | OT not justified by punches |
| OT_CAP_EXCEEDED | 409 | OT monthly cap exceeded |
| EXCEPTION_OVERLAP | 409 | WFH/OD overlaps existing record |
| WFH_CAP_EXCEEDED | 409 | WFH cap exceeded |
| DOCUMENT_REQUIRED | 422 | Mandatory document missing |
| COMP_OFF_INSUFFICIENT | 409 | Not enough comp-off balance |
| COMP_OFF_EXPIRED | 422 | Comp-off credit expired |
| POLICY_OVERLAP | 409 | Overlapping accrual policy |
| TYPE_IN_USE | 409 | Leave type has open balances |
| ACCRUAL_ALREADY_RUN | 409 | Accrual cycle already executed |
| LEDGER_RECON_MISMATCH | 500 | Balance/ledger reconciliation failure |
| INSUFFICIENT_BALANCE | 409 | Leave balance too low |
| LEAVE_OVERLAP | 409 | Leave double-booking |
| ELIGIBILITY_FAILED | 422 | Gender/cadre/document eligibility failed |
| SR_POSTING_FAILED | 502 | Digital SR posting failed (async retry) |
| CANNOT_CANCEL_PAST | 422 | Past/availed leave cannot be cancelled |
| BACKDATE_WINDOW_EXCEEDED | 422 | Backdated leave outside window |
| YEAR_ALREADY_CLOSED | 409 | Leave year already closed |
| PENDING_LEAVE_BLOCKS_CLOSE | 409 | Open application spans year boundary |
| ENCASHMENT_CAP_EXCEEDED | 409 | Encashment over cap |
| NOT_ENCASHABLE | 422 | Leave type not encashable |
| PERIOD_ALREADY_LOCKED | 409 | Payroll period already locked |

### 8.4 Endpoint examples

**1) Apply leave** — `POST /api/v1/atl/leave-applications`
```json
// Request
{
  "leaveTypeId": "11111111-1111-1111-1111-111111111111",
  "startDate": "2026-07-10",
  "endDate": "2026-07-14",
  "days": [
    {"leaveDate": "2026-07-10", "dayPortion": "FULL"},
    {"leaveDate": "2026-07-13", "dayPortion": "FULL"},
    {"leaveDate": "2026-07-14", "dayPortion": "FIRST_HALF"}
  ],
  "reason": "Family function",
  "contactDuringLeave": "+91-90000-00000",
  "supportingDocumentId": null
}
// 201 Created
{
  "applicationId": "aaaa1111-...",
  "applicationNo": "LV-2026-000453",
  "status": "SUBMITTED",
  "totalDays": 2.5,
  "srPostingStatus": "NOT_REQUIRED",
  "balancePreview": { "leaveCode": "EL", "before": 130.0, "softReserved": 2.5, "available": 127.5 },
  "requestId": "req-1a2b3c"
}
```

**2) Insufficient balance** — same endpoint, error
```json
// 409 Conflict
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Available EL balance 1.5 is less than requested 2.5.", "field": "days" }, "requestId": "req-4d5e6f" }
```

**3) Approve leave** — `POST /api/v1/atl/leave-applications/{id}/decision`
```json
// Request
{ "decision": "APPROVE", "comment": "Approved." }
// 200 OK
{
  "applicationId": "aaaa1111-...",
  "status": "APPROVED",
  "ledgerEntryId": "led-9988-...",
  "balanceAfter": 127.5,
  "attendanceUpdated": true,
  "srPostingStatus": "PENDING",
  "requestId": "req-7g8h9i"
}
```

**4) Mobile geo punch** — `POST /api/v1/atl/punches/mobile`
```json
// Request
{ "punchTime": "2026-06-30T03:32:00Z", "geoLat": 17.385044, "geoLong": 78.486671, "sourceRef": "mob-2026063009021" }
// 201 Created
{ "punchId": "pch-2233-...", "ingestionStatus": "ACCEPTED", "punchDirection": "IN", "requestId": "req-aj0k1l" }
// 422 (outside geofence)
{ "error": { "code": "GEOFENCE_VIOLATION", "message": "Location is 850m outside the permitted site radius.", "field": "geoLat" }, "requestId": "req-zz9" }
```

**5) Leave balance/ledger** — `GET /api/v1/atl/leave-ledger?employeeId=...&leaveTypeId=...&leaveYear=2026`
```json
// 200 OK
{
  "employeeId": "emp-1001", "leaveCode": "EL", "leaveYear": 2026, "currentBalance": 127.5,
  "entries": [
    { "ledgerEntryId": "led-1", "entryType": "OPENING", "amount": 120.0, "balanceAfter": 120.0, "effectiveDate": "2026-01-01" },
    { "ledgerEntryId": "led-2", "entryType": "ACCRUAL", "amount": 15.0, "balanceAfter": 135.0, "effectiveDate": "2026-01-01" },
    { "ledgerEntryId": "led-3", "entryType": "AVAIL", "amount": -7.5, "balanceAfter": 127.5, "effectiveDate": "2026-06-29", "sourceRefType": "LEAVE_APPLICATION" }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 3 },
  "requestId": "req-led-1"
}
```

### 8.5 Integration contracts
| Integration | Direction | Mechanism | Notes |
|---|---|---|---|
| Digital SR (M04→M12) | Outbound | Async event/queue on leave approval & cancellation | `sr_posting_status` tracks PENDING/POSTED/FAILED; idempotent by application_id; retry with backoff |
| Payroll (M10) | Outbound | Period feed + ack handshake | Period lock after export; corrections via next-period adjustment |
| Pension/Terminal benefits (M11) | Bidirectional | Retirement encashment-eligible balance | M11 requests eligible balance; M03 supplies + debits on settlement |
| Document store (M13) | Outbound | Document reference IDs | Medical certs, tour orders |
| Notifications | Outbound | Shared platform | Per-event triggers, channel prefs |
| Employee master (M01) | Inbound | Read API/replica | Golden source; soft-deleted blocks new applications |

---

## 9. Non-Functional Requirements
| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; punch ingest throughput ≥ 500 events/s; nightly attendance processing of 50k employees < 30 min; team-calendar render < 1s. |
| Scalability | Horizontal scaling of API and batch workers; partition ledgers by leave_year; device ingest queue-buffered. |
| Availability | 99.9% uptime; degraded-mode read of balances if batch workers down. |
| Reliability | RPO ≤ 15 min, RTO ≤ 4h; idempotent ingestion, accrual, and feed generation; at-least-once SR posting with dedupe. |
| Security | OIDC/SSO + MFA; RBAC + org-unit row-level scoping; device API keys hashed; OWASP ASVS; TLS 1.2+; encryption at rest; no PII in push payloads; full audit trail. |
| Privacy | DPDP-Act-2023 alignment; geo-location minimised & purpose-bound; medical certificates access-restricted (M13); retention per statutory schedule. |
| Auditability | Immutable `audit_log` + append-only ledgers; before/after captured on regularisation/adjustment/cancellation. |
| Accessibility | WCAG 2.1 AA across web/mobile. |
| Observability | Structured logs with requestId; metrics on ingest lag, processing duration, reconciliation status, SR-posting backlog, feed ack latency; alerts on `LEDGER_RECON_MISMATCH` and SR/feed failures. |
| Localisation | UTC storage; IST display; i18n strings; INR money formatting. |
| Maintainability | Configurable policies/enums via master data; no hardcoded statutory constants; versioned policies. |

---

## 10. Workflow & State Diagrams

### 10.1 Leave application state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | save draft | DRAFT | — |
| DRAFT | submit | SUBMITTED | balance soft-reserve; notify approver |
| SUBMITTED | recommend | RECOMMENDED | manager recommends (multi-step chains) |
| SUBMITTED/RECOMMENDED | approve | APPROVED | txn: ledger debit + attendance + SR enqueue + notify |
| SUBMITTED/RECOMMENDED | reject | REJECTED | release soft-reserve; notify |
| SUBMITTED | withdraw | WITHDRAWN | release soft-reserve |
| APPROVED | cancel (future) | CANCELLED | AVAIL_REVERSAL credit; SR reversal; recompute attendance |

### 10.2 Regularisation state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | notify manager |
| SUBMITTED | approve | APPROVED | update attendance_daily, is_regularised=true |
| SUBMITTED | reject | REJECTED | no change; reason logged |
| SUBMITTED | cancel | CANCELLED | by requester |

### 10.3 Overtime state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| SUBMITTED | approve(PAID) | APPROVED→PAID | feed paid_ot_minutes |
| SUBMITTED | approve(COMP_OFF) | APPROVED→CONVERTED_TO_COMPOFF | comp_off_ledger EARN |
| SUBMITTED | reject | REJECTED | — |

### 10.4 Year-close run state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| DRAFT | simulate | SIMULATED | produce report, no writes |
| SIMULATED | commit | COMMITTED | ledger CF/LAPSE/CONVERSION/OPENING + new balances |
| DRAFT/SIMULATED | error | FAILED | rollback; alert |

### 10.5 Payroll feed state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| PENDING | export | EXPORTED | lock period |
| EXPORTED | M10 ack | ACKED | finalise |
| EXPORTED | ack-timeout | FAILED | retry |

### 10.6 Approval routing matrix
| Leave/request type | Step 1 | Step 2 | Step 3 |
|---|---|---|---|
| CL / Comp-off | Reporting Manager | — | — |
| EL / HPL | Reporting Manager | HR Officer | — |
| Maternity / Paternity / CCL / Medical | Reporting Manager | HR Officer | Sanctioning Authority |
| Commuted / Study / Sabbatical / LWP | Reporting Manager | HR Officer | Sanctioning Authority |
| Regularisation / OT / WFH / OD | Reporting Manager | (HR optional) | — |
| Encashment (in-service) | HR Officer | Sanctioning Authority | — |
| Encashment (retirement) | HR Officer | Sanctioning Authority | M11 settlement |

---

## 11. Notifications
| Event | Trigger FR | Recipients | Channels | Content (PII-minimised) |
|---|---|---|---|---|
| Leave submitted | FR-12 | Approver | in-app, email, push | Applicant name, type, dates, deep-link |
| Leave approved/rejected | FR-12 | Applicant | in-app, email, push | Decision, dates, balance after |
| Leave cancelled | FR-13 | Applicant, approver | in-app, email | Cancelled days, credited-back |
| Approval pending > SLA | FR-18 | Approver, then escalation | push, email | Reminder + deep-link |
| Low balance warning | FR-11/12 | Employee | in-app | Type, remaining balance |
| Accrual credited | FR-11 | Employee | in-app | Type, credited units, new balance |
| Comp-off expiring (T-7) | FR-09 | Employee | in-app, push | Days expiring, expiry date |
| Regularisation decided | FR-05 | Employee | in-app, email | Day, decision |
| OT approved | FR-06 | Employee | in-app | Minutes, treatment |
| Absent today | FR-04 | Employee, manager | in-app | Date flagged |
| SR posting failed | FR-12 | HR Officer | in-app, email | Application no, retry status |
| Payroll feed exported | FR-17 | Payroll Officer | in-app | Period, totals |
| Year-close committed | FR-15 | HR Admin | in-app, email | Scope, carried/lapsed totals |

All notifications recorded in shared `notifications`; respect channel preferences; async with retry; in-app fallback.

---

## 12. Reporting & Analytics
| Report | Audience | Contents |
|---|---|---|
| Monthly Attendance Register | HR/Manager | Per-employee daily status grid, present/absent/leave totals |
| Leave Balance Statement | Employee/HR | Per-type opening/accrued/availed/encashed/lapsed/current |
| Leave Ledger Export | Auditor/HR | Immutable entry-level history |
| Leave Utilisation Analytics | HR/Mgmt | Leave taken by type/department/period; trends |
| Absenteeism & LWP Report | HR/Payroll | LWP days, chronic absenteeism flags |
| Overtime & Comp-Off Report | HR/Payroll | OT minutes, paid vs comp-off, expiry exposure |
| Team Leave Calendar Export | Manager | Absences and conflicts |
| Year-Close Reconciliation | HR Admin/Auditor | Carried/lapsed/converted per employee |
| Statutory Leave Posting Status | SR Custodian/HR | SR posting success/failure per application |
| Encashment Liability Report | HR/Finance | Outstanding encashable balance valuation |

All reports: org-unit scoped, paginated, CSV/PDF export, scheduled-email option; aggregate feeds surfaced to M14-DAS. No PII beyond role entitlement.

---

## 13. Migration & Launch

### 13.1 Data migration
| Step | Source | Target | Validation |
|---|---|---|---|
| Leave types & policies | Legacy registers / rules | leave_types, leave_accrual_policies | Statutory caps verified |
| Opening leave balances | Legacy ledgers/spreadsheets | leave_balance_ledger (OPENING) + leave_balances | Reconciliation = 0 mismatch |
| Holiday calendars | Office circulars | holiday_calendars/holidays | Per-location completeness |
| Roster/shift assignments | HR records | shifts/rosters | No overlaps |
| Devices | IT inventory | attendance_devices | Geofence configured |
| Historical attendance (optional) | Biometric exports | attendance_punches/daily | Spot reconciliation |

### 13.2 Cutover & rollout
- Phased: configuration (types/policies/holidays/shifts) → balance migration with reconciliation sign-off → device integration → pilot org unit → org-wide.
- Parallel run for one leave cycle and one payroll cycle before decommissioning legacy.
- Go/No-Go gate: 0 reconciliation mismatches; SR posting and payroll feed validated end-to-end.

### 13.3 Rollback
- Migration executed in reversible batches; ledger OPENING entries tagged with migration run id for clean reversal; feature flags per FR.

### 13.4 Launch readiness checklist
Balances reconciled; policies signed off by HR/legal; SR (M04) and payroll (M10) handshakes tested; notifications verified; RBAC scopes validated; accessibility audit passed; runbooks and on-call in place.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Requirement → Entity → API traceability
| FR | Entities | Key APIs | Depends on |
|---|---|---|---|
| FR-01 | shifts, rosters | /shifts, /rosters | M01 |
| FR-02 | holiday_calendars, holidays | /holiday-calendars | M01 |
| FR-03 | attendance_punches, attendance_devices | /punches/* | FR-01/02 |
| FR-04 | attendance_daily | /attendance/process | FR-01,02,03,07,08,12 |
| FR-05 | regularisation_requests, attendance_daily | /regularisations | FR-04 |
| FR-06 | overtime_records, comp_off_ledger | /overtime | FR-03/04, FR-09 |
| FR-07 | attendance_exceptions | /exceptions | FR-04 |
| FR-08 | attendance_exceptions, documents | /exceptions | FR-04, M13 |
| FR-09 | comp_off_ledger | /comp-off/* | FR-06/08, FR-12 |
| FR-10 | leave_types, leave_accrual_policies | /leave-types, /leave-policies | M01 |
| FR-11 | leave_balance_ledger, leave_balances | /accrual/run, /leave-ledger | FR-10 |
| FR-12 | leave_applications, leave_application_days, ledger, attendance_daily | /leave-applications | FR-10/11, M04, M01 |
| FR-13 | leave_applications, ledger | /withdraw, /cancel | FR-12, M04 |
| FR-14 | leave_applications, attendance_exceptions | /team-calendar | FR-12, FR-07/08 |
| FR-15 | leave_year_close_runs, ledger, balances | /year-close/* | FR-10/11 |
| FR-16 | leave_encashment_requests, ledger, feed | /encashments | FR-11, M10, M11 |
| FR-17 | payroll_attendance_feed | /payroll-feed/* | FR-04/05/06/12/16, M10 |
| FR-18 | notifications | /self-service/*, /approvals/inbox | all FRs |

### 14.2 Cross-module dependency register
| Dependency | Type | Direction | Risk / mitigation |
|---|---|---|---|
| M01-EPM employee master | Hard | Inbound read | Golden source; cache + soft-delete guard |
| M04-LSR → M12-SR posting | Hard | Outbound async | Retry/backoff; FAILED tracking + HR alert |
| M10-PAY payroll feed | Hard | Outbound | Period lock + ack handshake |
| M11-PEN retirement encashment | Medium | Bidirectional | Cap + settlement-on-ack |
| M13-DMS documents | Medium | Outbound ref | Reference-only; access-controlled |
| Notifications/Workflow platform | Hard | Outbound | Async, degrade to in-app |

### 14.3 Parallel-agent build plan
| Track | FRs | Can run in parallel with | Sequencing note |
|---|---|---|---|
| A: Config foundations | FR-01, FR-02, FR-10 | B, D | Must precede C, E |
| B: Attendance capture | FR-03, FR-04 | A, D | FR-04 needs FR-01/02 published |
| C: Leave core | FR-11, FR-12 | D | Needs FR-10 |
| D: Exceptions & OT | FR-06, FR-07, FR-08, FR-09 | A, B | FR-09 needs FR-12 for redemption |
| E: Corrections | FR-05, FR-13 | — | Need FR-04 / FR-12 |
| F: Periodic & integration | FR-14, FR-15, FR-16, FR-17 | — | Need core + capture complete |
| G: Self-service | FR-18 | last | Integrates all |

### 14.4 Final Reconciliation Table (0 unresolved gaps)
| Check | Status | Evidence |
|---|---|---|
| All 18 FRs have entities, APIs, LLD | RESOLVED | §6 each FR complete |
| All 20 new entities have full field tables + sample rows | RESOLVED | §5.2, §5.7 |
| Shared entities referenced, not redefined | RESOLVED | §4, §5.4 |
| Every enum cataloged | RESOLVED | §5.5 |
| Integrity rules incl. ledger reconciliation | RESOLVED | §5.6 |
| Error codes for all failure paths | RESOLVED | §8.3 |
| SR posting via M04 (not duplicated) | RESOLVED | FR-12/13, §8.5 |
| Payroll feed (LWP) defined | RESOLVED | FR-17 |
| Encashment incl. retirement (M11) | RESOLVED | FR-16 |
| Leave-balance ledger with audit | RESOLVED | E15, FR-11 |
| Roles/permissions complete | RESOLVED | §3 |
| Workflow/state tables | RESOLVED | §10 |
| Notifications mapped | RESOLVED | §11 |
| Migration & reconciliation plan | RESOLVED | §13 |
| Traceability complete | RESOLVED | §14.1 |
| **Unresolved gaps** | **0** | — |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Accrual | Periodic crediting of leave per policy. |
| Carry-forward | Balance carried into the next leave year, subject to cap. |
| Comp-off | Compensatory leave earned for OT/holiday work. |
| Commuted Leave | HPL converted to full-pay leave at 2:1 debit (medical). |
| Earned Leave (EL) | Accruable, encashable privilege leave. |
| Half-Pay Leave (HPL) | Leave paid at half salary; affects pay. |
| Encashment | Conversion of unused leave to a monetary payment. |
| Geofence | Permitted GPS radius for mobile punches. |
| Leave Ledger | Append-only immutable record of all balance changes. |
| LWP | Leave Without Pay — unpaid absence affecting pay and service. |
| Regularisation | Correction of a missed/incorrect punch. |
| Roster | Employee-to-shift assignment over a date range. |
| RH | Restricted (optional) Holiday, employee-elected. |
| Sandwich rule | Treatment of holidays/weekly-offs falling within leave. |
| Soft-reserve | Provisional hold on balance at submission to prevent oversubscription. |
| SR / Digital SR | Statutory Digital Service Register (M12, posted via M04). |
| Year-close | Annual leave processing: carry-forward, lapse, conversion, opening. |

## 16. Appendices

### Appendix A — Public-sector leave catalog defaults (editable per policy)
| Code | Name | Category | Accrual | Encashable | Notes |
|---|---|---|---|---|---|
| CL | Casual Leave | PAID | 12/yr | No | No carry-forward; ≤ continuous cap |
| EL | Earned Leave | PAID | 15/half-yr | Yes | CF cap 300; retirement encash ≤ 300 |
| HPL | Half-Pay Leave | HALF_PAY | 10/half-yr | No | Affects pay (half) |
| COMMUTED | Commuted Leave | PAID | from HPL | No | 2 HPL : 1 commuted; medical doc |
| MAT | Maternity | SPECIAL | event | No | ≤ 180 days; FEMALE |
| PAT | Paternity | SPECIAL | event | No | ≤ 15 days; MALE |
| CCL | Child-Care Leave | SPECIAL | quota | No | FEMALE; statutory quota |
| STUDY | Study Leave | SPECIAL | sanction | No | Authority sanction |
| MED | Medical Leave | PAID/HPL | per rule | No | Certificate required |
| SAB | Sabbatical | SPECIAL | sanction | No | Authority sanction |
| LWP | Leave Without Pay | UNPAID | n/a | No | Affects pay & service |
| COMPOFF | Compensatory Off | PAID | earned | No | 90-day expiry, FIFO |

### Appendix B — Attendance status precedence
`ON_LEAVE` > `HOLIDAY` > `WEEKLY_OFF` > `WFH`/`ON_DUTY` > punch-derived (`PRESENT`/`HALF_DAY`/`ABSENT`/`MISSING_PUNCH`).

### Appendix C — Key configurable parameters
| Parameter | Default |
|---|---|
| Regularisation window | 15 days |
| Regularisation monthly cap | 3 |
| Backdated-leave window | 30 days |
| Comp-off validity | 90 days |
| RH election cap | 2 |
| Team concurrent-absence conflict threshold | 30% |
| EL carry-forward cap | 300 days |
| EL retirement encashment cap | 300 days |
| Clock-skew tolerance | ±5 min |

### Appendix D — Referenced modules
M01-EPM, M04-LSR, M10-PAY, M11-PEN, M12-SR, M13-DMS, M14-DAS, and shared workflow/notification/audit platform per `SHARED_FOUNDATION.md`.
