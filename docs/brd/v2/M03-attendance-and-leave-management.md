# Attendance and Leave Management — HRMS Module BRD (v2.0)

**Module code:** M03-ATL
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector context, hosted at CGG Data Centre.
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) layered on public-sector statutory rules (CCS Leave Rules).
**Source of truth for shared elements:** `docs/brd/SHARED_FOUNDATION.md` (referenced, never redefined).
**Document version:** v2.0 — 2026-06-30 (supersedes v1.0).
**Revision basis:** Adversarial Council report `docs/evaluation/M03-attendance-and-leave-management-council.md` — all adopted improvements and High/Critical risk mitigations (R1–R19) incorporated; see §1.6 Amendments table.

---

## 1. Executive Summary

### 1.1 Purpose
The Attendance and Leave Management module (M03-ATL) is the time-and-absence system of record for the HRMS. It captures **when and how employees work** (biometric / RFID / mobile-geo punches, shifts, rosters, overtime, work-from-home, on-duty/tour, holidays) and **when and why they are absent** (a full public-sector leave catalog with configurable accrual, carry-forward, encashment, and a fully auditable leave-balance ledger). It exposes self-service to employees, team controls to managers, configuration to HR, and feeds two downstream systems of record: the statutory **Digital Service Register** (via Module 04-LSR → M12-SR) and **Payroll** (M10-PAY) for loss-of-pay treatment.

### 1.2 Business problem
Public-sector time and leave administration is today fragmented across registers, spreadsheets, and disconnected biometric devices. This causes: leave balances that cannot be trusted, manual loss-of-pay (LWP) errors in payroll, no statutory leave posting into the Service Register, no team visibility for managers, and no audit trail for regularisation and backdating. M03-ATL replaces this with a single configurable engine and immutable ledgers, with concurrency-safe balance debits, DPDP-compliant biometric/geo governance, and anti-fraud controls.

### 1.3 Goals & success metrics
| # | Goal | Metric / target |
|---|---|---|
| G1 | Trustworthy leave balances | 100% of balance changes traceable to a ledger entry; zero unreconciled balances at year-close; **zero lost-update / oversubscription incidents** (concurrency-controlled). |
| G2 | Automated attendance capture | ≥ 95% of daily attendance auto-computed without manual intervention. |
| G3 | Accurate payroll feed | 0 LWP discrepancies between M03 export and M10 import per cycle; **0 silent corruptions of locked periods** (next-period adjustment only). |
| G4 | Statutory compliance | 100% of approved leave events posted to Digital SR (via M04) within SLA; **100% of biometric/geo capture covered by a recorded lawful basis + consent or non-biometric fallback.** |
| G5 | Self-service adoption | ≥ 90% of leave applications submitted by employees themselves (web/mobile). |
| G6 | Approval timeliness | P50 leave-approval turnaround ≤ 24h; auto-escalation **and auto-delegation** on breach/absence. |
| G7 | Fraud resistance | ≥ 99% of buddy-punching / impossible-travel anomalies auto-flagged for review before payroll feed lock. |

### 1.4 Scope summary
**In scope:** shift & roster management; holiday calendars by location; punch ingestion, deduplication & **anomaly/fraud detection**; daily attendance processing & **sub-day allocation**; missed-punch regularisation; overtime; WFH; on-duty/tour; compensatory-off; leave-type & accrual policy configuration (incl. **commuted 2:1**, **leave-year basis**, **rounding/proration**, **sandwich rule per type**); accrual engine; **concurrency-controlled** leave-balance ledger and **soft-reserve reservations**; **entitlement counters** for sanction-based leave; leave application/approval/cancellation; backdated leave; team calendar & conflict detection; **approval delegation/out-of-office**; leave-year close (carry-forward / lapse); encashment (incl. **retirement EL+HPL shortfall make-up** and **LTC**); attendance-and-leave → payroll feed with **locked-period adjustments**; **DPDP biometric/geo consent & non-biometric fallback**; **best-in-class absence features** (what-if forecast, mass-leave/shutdown, blackout/freeze, return-to-work).
**Out of scope (referenced, not built here):** statutory SR posting internals (M04/M12), payroll computation (M10), terminal-benefit settlement (M11), document storage internals (M13), cross-module analytics surface (M14).

### 1.5 Key stakeholders
Employees, Reporting Managers, HR Officers/Admins, Department Heads/Sanctioning Authorities, Payroll Officers (consumers), SR Custodian (consumer via M04), Auditors, Data Protection Officer (DPDP), System Administrators.

### 1.6 Amendments (v1 → v2)
Every adopted improvement from the council report is mapped to where and how it is incorporated. Risk IDs (Rn) refer to the council Risk Register.

| # (council) | Risk | Adopted improvement | Incorporated in (v2) |
|---|---|---|---|
| 1 | R1 | `leave_reservations` entity for real soft-reserve; netted into `available` | §5.2 E21; FR-12 AC2/BR; §5.6 rule 11; §10.1 |
| 2 | R1 | Concurrency control: `version` (optimistic lock) + `SELECT … FOR UPDATE` on balance debit | §5.2 E14 (`version`); §5.6 rule 12; FR-11/FR-12 LLD; error `OPTIMISTIC_LOCK_CONFLICT` |
| 3 | R2 | Per-day allocation set (sum ≤ 1.0); `attendance_daily.status` becomes derived rollup; `present_units` fixes feed | §5.2 E22 `attendance_day_allocations`; FR-04 rewrite; FR-17 present-units; §5.6 rule 13 |
| 4 | R3 | Explicit accrual rounding mode + proration formula + leave-year basis per type | §5.2 E13 (`rounding_mode`), E12 (`year_basis`); FR-11 rewrite + worked example; App. C |
| 5 | R4 | Commuted Leave 2:1 modelled via `debit_ratio` + `debits_against_leave_type_id` | §5.2 E12; FR-10/FR-12 rules; §5.6 rule 14; error `COMMUTED_REQUIRES_HPL` |
| 6 | R5 | Retirement encashment shortfall: EL to cap, then HPL cash-equivalent to 300; HPL retirement-encash exception | FR-16 rewrite; §5.2 E12 (`is_encashable_on_retirement`); App. A |
| 7 | R6 | Recompute vs locked period: never overwrite fed days; emit next-period adjustment | §5.2 E23 `payroll_feed_adjustments`; FR-01/02/05/17 rules; error `LOCKED_PERIOD_ADJUSTMENT_EMITTED` |
| 8 | R7,R14 | `leave_entitlements` counter (career/event quota, eligibility) for sanction leave; removes negative-balance special case | §5.2 E24; FR-22 (new); FR-12 eligibility; §5.6 rule 15 |
| 9 | R8 | `attendance_processing_runs` entity | §5.2 E25; FR-04 |
| 10 | R8 | `rh_elections` entity | §5.2 E26; FR-02 |
| 11 | R8 | `module_config` entity for Appendix-C tunables (scoped, effective-dated) | §5.2 E27; App. C; all configurable FRs |
| 12 | R11 | `approval_delegations` entity + auto-route in routing matrix | §5.2 E28; FR-19 (new); §10.6 |
| 13 | R14 | `employee_dependents` source for CCL/Maternity eligibility | §5.2 E29; FR-22; FR-12 |
| 14 | R9 | DPDP lawful basis + `biometric_consents` + non-biometric fallback + storage statement + retention/purge schedule | §5.2 E30; FR-21 (new); §9 Privacy; App. E |
| 15 | R10 | Anti-fraud: liveness/photo-on-punch, device binding, anomaly detection, `flagged_for_review` + review workflow | §5.2 E31 `punch_anomaly_reviews`; FR-03 fields; FR-20 (new) |
| 16 | R12 | LTC encashment fully specified (10 EL days/block, 60-day career cap, linkage) | FR-16; §5.2 E18 (`ltc_block_ref`); App. A |
| 17 | R13 | Sandwich rule per leave type with worked example; bound to `total_days`/`is_non_working` | §5.2 E12 (`sandwich_rule`); FR-12 rewrite + example; §5.6 rule 16 |
| 18 | R15 | FR-04 sole writer of `attendance_daily`; FR-05/07/08/12 enqueue recompute | FR-04/05/07/08/12 LLD; §5.6 rule 17 |
| 19 | R16 | Punch→`attendance_date` derivation (shift-anchored local date); DST as explicit assumption | FR-03/FR-04 rules; App. B; §9 Localisation |
| 20 | R17 | `comp_off_ledger` sole source of comp-off balance; COMPOFF type = redemption vehicle only | FR-09 rewrite; §5.2 E12 note; §5.6 rule 18 |
| 21 | R18 | Integrity rule `SUM(day_units)=total_days` enforced by trigger/validator | §5.6 rule 19; FR-12 validation; error `DAY_UNITS_MISMATCH` |
| 22 | R19 | Advance-EL clawback on exit; accrual treatment during SUSPENDED/dies-non | FR-11/FR-16 rules; §5.6 rule 20; error `ADVANCE_CLAWBACK_REQUIRED` |
| 23 | Outsider | End-to-end worked example (apply→reserve→approve→ledger→attendance→SR→payroll→close) | §5.8 (new) |
| 24 | Executor | Corrected Final Reconciliation Table (honest, reflects v2 additions) | §14.4 rewrite |
| 25 | Proponent | Best-in-class features: what-if forecast, mass-leave/shutdown, blackout/freeze, return-to-work | §5.2 E27 (`leave_blackouts`-as-config) + FR-23 (new) |

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Area | Sub-area | FRs |
|---|---|---|
| **Time & Attendance** | Shift & roster management | FR-01 |
| | Holiday calendar by location | FR-02 |
| | Punch ingestion (biometric/RFID/mobile-geo) + capture-time governance | FR-03 |
| | Daily attendance processing, sub-day allocation & status computation | FR-04 |
| | Missed-punch regularisation | FR-05 |
| | Overtime capture & approval | FR-06 |
| | Work-from-home (WFH) | FR-07 |
| | On-duty / tour / outdoor duty | FR-08 |
| | Compensatory-off earning & redemption | FR-09 |
| **Leave Management** | Leave-type & accrual-policy configuration | FR-10 |
| | Accrual engine, rounding/proration & leave-balance ledger | FR-11 |
| | Leave application & approval workflow (reservation, concurrency, sandwich) | FR-12 |
| | Leave cancellation & modification | FR-13 |
| | Backdated leave & team-calendar conflict detection | FR-14 |
| | Leave-year close: carry-forward, lapse, half-pay conversion | FR-15 |
| | Leave encashment (in-service, LTC & on retirement) | FR-16 |
| **Integration & Governance** | Attendance & leave → payroll (LWP) feed + locked-period adjustments | FR-17 |
| | Mobile/web self-service surface & notification triggers | FR-18 |
| | Approval delegation & out-of-office routing | FR-19 *(new)* |
| | Time-fraud & punch anomaly detection & review | FR-20 *(new)* |
| | DPDP biometric/geo consent, lawful basis & non-biometric fallback | FR-21 *(new)* |
| | Leave entitlement counters for sanction-based leave | FR-22 *(new)* |
| | Best-in-class absence features (forecast, mass-leave, blackout, return-to-work) | FR-23 *(new)* |

### 2.2 Common Capabilities (inherited from Shared Foundation)
- RBAC + org-unit row-level scoping; maker-checker via shared `workflow_instances`/`workflow_tasks`.
- Immutable `audit_log` write on every state change; soft delete (`is_deleted`) except append-only ledgers.
- UTC storage, locale display (`DD-MMM-YYYY`), INR currency; cursor/page pagination (max 100).
- Canonical API error envelope and standard error codes; OIDC/SSO + MFA + JWT.

### 2.3 Boundaries & ownership
| Concern | Owner | M03 relationship |
|---|---|---|
| Employee master, designation, org tree, dependents | M01-EPM | **Reads** (golden source); `employee_dependents` ideally co-located with M01, mirrored/read by M03 (§5.2 E29). |
| Statutory SR ledger | M12-SR (written via M04-LSR) | **Emits** approved-leave events to M04; never writes SR directly. |
| Payroll computation | M10-PAY | **Emits** LWP/OT/attendance feed + adjustments; M10 computes pay. |
| Terminal benefits / pension | M11-PEN | **Supplies** leave-encashment-eligible balance (EL+HPL make-up) on retirement. |
| Document storage | M13-DMS | **References** `documents` for medical certificates, tour orders, punch photos, fitness certificates. |
| Notifications delivery | Shared platform | **Triggers** `notifications`. |

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared baseline; do not contradict)
| Role | Description |
|---|---|
| **Employee (Self-Service)** | Apply/cancel own leave, view own balance & ledger & **what-if forecast**, regularise own punches, apply WFH/OD/comp-off/OT, manage **own punch consent / non-biometric enrolment**, view own roster & holidays. |
| **Reporting Manager** | Approve/recommend leave, regularisation, OT, WFH, OD for direct reports; view team calendar; flag conflicts; **set own delegation when absent**. |
| **HR Officer** | Configure rosters/holidays per scope, operate on behalf of employees, run accrual/close, correct ledger via adjustment, **action mass-leave/shutdown and return-to-work**. |
| **HR Admin** | All HR Officer rights + leave-type/policy configuration, year-close execution, **module_config & blackout/freeze management**, org-wide reports. |
| **Sanctioning Authority (Dept Head)** | Final sanction for special leaves (Maternity, Study, Sabbatical, Commuted, LWP, encashment). |
| **Payroll Officer** | Read-only consumer of the LWP/OT feed; trigger/reconcile export; review locked-period **adjustments**. |
| **Auditor** | Read-only across all entities incl. ledger, reservations, consents, anomaly reviews, and audit log. No write. |
| **Data Protection Officer (DPO)** | Read-only across consent/biometric/geo governance + retention/purge oversight; approves lawful-basis configuration. |
| **Anomaly Reviewer (HR/Security)** | Reviews `flagged_for_review` punches; approve/reject/escalate; cannot self-clear own punches. |
| **System Administrator** | Device registration, integration config, enum/reference master data; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-Delete, A=Approve, X=Execute job; blank=none)
| Capability | Employee | Manager | HR Officer | HR Admin | Sanct. Auth | Payroll | Auditor | DPO | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|
| View own attendance/leave | R | R | R | R | R | | R | | |
| View team attendance/leave | | R | R | R | R | | R | | |
| Apply leave / WFH / OD / comp-off / OT | C | C(self) | C(on behalf) | C(on behalf) | | | | | |
| Approve leave / regularisation / OT | | A | A | A | A | | | | |
| Sanction special leave & encashment | | | R | A | A | | | | |
| Regularise missed punch | C(self) | A | C/A | C/A | | | R | | |
| Configure shifts / rosters | | R | C/U | C/U | | | R | | |
| Configure holidays / RH | | R | C/U | C/U | | | R | | |
| Configure leave types & accrual policy | | | R | C/U | | | R | | |
| Manage module_config / blackout / freeze | | | R | C/U | | | R | R | |
| Run accrual / year-close job | | | X(scope) | X | | | R | | |
| Ledger manual adjustment (maker-checker) | | | C(maker) | A(checker) | | | R | | |
| Run/reconcile payroll feed export & adjustments | | | R | R | | X | R | | |
| Set approval delegation | | C(self) | C(on behalf) | C/U | | | R | | |
| Manage punch consent / non-biometric enrolment | C(self) | | C(on behalf) | C/U | | | R | R | |
| Review flagged punch anomalies | | A(team) | A | A | | | R | R | |
| Mass-leave / shutdown / return-to-work | | | C/X | C/X | | | R | | |
| Register devices / integration config | | | | R | | | R | | C/U |
| Configure lawful basis / retention policy | | | | R | | | R | A | C/U |
| View audit log | own | team | scope | org | scope | | all | governance | scope |

**Segregation of duties:** maker ≠ checker; no self-approval (an employee who is also a manager cannot approve their own leave); ledger adjustments always require a distinct checker; an anomaly reviewer cannot clear their own flagged punch; a delegate must not be the applicant.

---

## 4. Shared Application Foundation
This module **inherits** the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`) without redefinition:
- **Entities reused:** `employees`, `users`, `org_units`, `designations`, `cadres`, `roles`/`permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks`.
- **Conventions:** UUIDv4 PKs + human business keys; standard audit columns; UPPER_SNAKE_CASE enums; UTC storage / locale display; paginated lists (max 100); maker-checker through the shared workflow engine.
- **Tech defaults:** React+TS (Tailwind/shadcn) front-end; REST `/api/v1`; PostgreSQL; object storage for documents; OIDC/SSO+MFA+JWT; RBAC + org-unit row-level scoping.
- **Error envelope:** `{ "error": { "code", "message", "field" }, "requestId" }`.
- **NFR baseline:** P95 < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min / RTO ≤ 4h; OWASP ASVS; DPDP-Act-2023-aligned PII handling.

M03 extends the shared workflow engine with module workflow templates (leave approval, regularisation, encashment, anomaly review, return-to-work) and the shared `notifications` ledger with module event types. Sensitive-personal-data handling (biometric templates, geo) is governed under M03's DPDP layer (FR-21, §9, App. E).

---

## 5. Holistic Data Model

### 5.1 Entity inventory
| # | Entity | Type | Ownership | Note |
|---|---|---|---|---|
| E1 | `shifts` | Master | M03 (new) | Shift definitions (timings, grace, break, night flag, **midnight date-anchor rule**). |
| E2 | `rosters` | Transactional | M03 (new) | Employee-to-shift assignment over a date range. |
| E3 | `holiday_calendars` | Master | M03 (new) | Named calendar bound to location/org scope. |
| E4 | `holidays` | Master | M03 (new) | Individual holiday dates within a calendar. |
| E5 | `attendance_devices` | Master | M03 (new) | Registered capture sources; **device↔employee binding & liveness capability**. |
| E6 | `attendance_punches` | Append-only ledger | M03 (new) | Raw punch events; **photo/liveness/anomaly fields**. |
| E7 | `attendance_daily` | Transactional (derived rollup) | M03 (new) | Per-employee-per-day rollup; **status now a derived projection over allocations**. |
| E8 | `regularisation_requests` | Transactional | M03 (new) | Missed-punch / status correction requests. |
| E9 | `overtime_records` | Transactional | M03 (new) | OT claim, approval, payable/comp-off treatment. |
| E10 | `attendance_exceptions` | Transactional | M03 (new) | WFH / On-Duty / Tour records. |
| E11 | `comp_off_ledger` | Append-only ledger | M03 (new) | **Sole source of truth** for compensatory-off balance. |
| E12 | `leave_types` | Master | M03 (new) | Leave catalog + **debit_ratio, year_basis, sandwich_rule, sanction flag, retirement-encash**. |
| E13 | `leave_accrual_policies` | Master | M03 (new) | Accrual/CF/encash rules + **rounding_mode, proration_method**. |
| E14 | `leave_balances` | Transactional (derived) | M03 (new) | Balance snapshot + **`version` (optimistic lock)** + reserved netting anchor. |
| E15 | `leave_balance_ledger` | Append-only ledger | M03 (new) | Immutable debit/credit history (single source of truth for balances). |
| E16 | `leave_applications` | Transactional | M03 (new) | Leave requests + approval lifecycle. |
| E17 | `leave_application_days` | Transactional | M03 (new) | Per-day breakdown (full/first-half/second-half) of an application. |
| E18 | `leave_encashment_requests` | Transactional | M03 (new) | In-service, **LTC** & retirement encashment claims. |
| E19 | `leave_year_close_runs` | Job/audit | M03 (new) | Year-close execution records. |
| E20 | `payroll_attendance_feed` | Integration ledger | M03 (new) | LWP/OT/attendance export batches to M10. |
| **E21** | `leave_reservations` | Transactional | M03 (**v2 new**) | Soft-reserve holds netted into `available`. *(R1)* |
| **E22** | `attendance_day_allocations` | Transactional | M03 (**v2 new**) | Sub-day allocation set (sum ≤ 1.0) per employee/day. *(R2)* |
| **E23** | `payroll_feed_adjustments` | Integration ledger | M03 (**v2 new**) | Next-period corrections to locked feed periods. *(R6)* |
| **E24** | `leave_entitlements` | Transactional counter | M03 (**v2 new**) | Career/event quotas + eligibility for sanction leave. *(R7,R14)* |
| **E25** | `attendance_processing_runs` | Job/audit | M03 (**v2 new**) | Resolves `attendance_daily.processing_run_id`. *(R8)* |
| **E26** | `rh_elections` | Transactional | M03 (**v2 new**) | Restricted-holiday elections + cap. *(R8)* |
| **E27** | `module_config` | Master (scoped, effective-dated) | M03 (**v2 new**) | Appendix-C tunables + blackout/freeze + mass-leave config. *(R8, Proponent)* |
| **E28** | `approval_delegations` | Transactional | M03 (**v2 new**) | Out-of-office delegate routing. *(R11)* |
| **E29** | `employee_dependents` | Master (M01-aligned, read/mirror) | M01/M03 (**v2 new**) | Children/dependents for CCL/Maternity eligibility. *(R14)* |
| **E30** | `biometric_consents` | Transactional/governance | M03 (**v2 new**) | DPDP consent + lawful basis + fallback election. *(R9)* |
| **E31** | `punch_anomaly_reviews` | Transactional | M03 (**v2 new**) | Review lifecycle for flagged punches. *(R10)* |

Reused (not redefined): `employees`, `users`, `org_units`, `designations`, `cadres`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks`.

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
| date_anchor_rule | ENUM | NOT NULL, DEFAULT `SHIFT_START_LOCAL_DATE` | Punch→attendance_date derivation (`SHIFT_START_LOCAL_DATE`/`PUNCH_LOCAL_DATE`). *(R16)* |
| display_timezone | VARCHAR(40) | NOT NULL, DEFAULT `Asia/Kolkata` | Local zone for date bucketing (multi-TZ ready). *(R16)* |
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
| weekly_off_pattern | JSONB | NOT NULL | e.g. `["SUN","SAT2","SAT4"]` (see App. B legend). |
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
| rh_cap | INT | NOT NULL, DEFAULT 2 | Restricted-holiday election cap (overridable via module_config). |
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
| supports_liveness | BOOLEAN | NOT NULL, DEFAULT false | Capable of liveness/photo capture. *(R10)* |
| binding_mode | ENUM | NOT NULL, DEFAULT `OPEN` | `OPEN`/`EMPLOYEE_BOUND` (RFID/mobile bound to a single employee). *(R10)* |
| template_storage | ENUM | NOT NULL, DEFAULT `ON_DEVICE` | Biometric template location: `ON_DEVICE`/`SERVER_ENCRYPTED`/`NONE`. *(R9)* |
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
| attendance_date | DATE | NOT NULL | Derived local/shift-anchored date (App. B). *(R16)* |
| punch_direction | ENUM | NULL | `IN`/`OUT`/`AUTO`. |
| capture_method | ENUM | NOT NULL | `BIOMETRIC`/`RFID`/`MOBILE_GEO`/`WEB`/`MANUAL`/`OTP_FALLBACK`. |
| geo_lat | NUMERIC(9,6) | NULL | Mobile latitude. |
| geo_long | NUMERIC(9,6) | NULL | Mobile longitude. |
| photo_document_id | UUID | FK → documents, NULL | Photo-on-punch (anti-fraud). *(R10)* |
| liveness_score | NUMERIC(4,3) | NULL | 0–1 liveness confidence. *(R10)* |
| consent_id | UUID | FK → biometric_consents, NULL | Governing consent at capture. *(R9)* |
| source_ref | VARCHAR(120) | NULL | Device-side raw event id (idempotency). |
| ingestion_status | ENUM | NOT NULL | `ACCEPTED`/`DUPLICATE`/`REJECTED`/`FLAGGED_FOR_REVIEW`. *(R10)* |
| anomaly_flags | JSONB | NULL | e.g. `["IMPOSSIBLE_TRAVEL","DUP_SECOND"]`. *(R10)* |
| created_at, created_by | std | | (Append-only: no update/soft-delete.) |

Constraint: UNIQUE(`device_id`,`source_ref`) for idempotent ingestion.

#### E7 `attendance_daily` (derived rollup)
| Field | Type | Constraints | Description |
|---|---|---|---|
| attendance_daily_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| attendance_date | DATE | NOT NULL | Day. |
| roster_id | UUID | FK → rosters | Applicable shift assignment. |
| first_in | TIMESTAMPTZ | NULL | Earliest IN. |
| last_out | TIMESTAMPTZ | NULL | Latest OUT. |
| worked_minutes | INT | NOT NULL, DEFAULT 0 | Computed. |
| status | ENUM | NOT NULL | **Derived display rollup** over `attendance_day_allocations` (highest-precedence allocation). *(R2)* |
| present_units | NUMERIC(3,2) | NOT NULL, DEFAULT 0 | Sum of present-counting allocation fractions (feeds FR-17). *(R2)* |
| late_minutes | INT | NOT NULL, DEFAULT 0 | Lateness vs grace. |
| early_exit_minutes | INT | NOT NULL, DEFAULT 0 | Early departure. |
| leave_application_id | UUID | FK → leave_applications, NULL | Primary leave linkage (if any). |
| is_regularised | BOOLEAN | NOT NULL, DEFAULT false | Corrected via FR-05. |
| processing_run_id | UUID | FK → attendance_processing_runs, NULL | Batch that computed it. *(R8)* |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`employee_id`,`attendance_date`). **FR-04 is the sole writer (R15).**

#### E22 `attendance_day_allocations` *(v2 new — R2)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| allocation_id | UUID | PK | Identity. |
| attendance_daily_id | UUID | FK → attendance_daily, NOT NULL | Parent day. |
| employee_id | UUID | FK → employees, NOT NULL | Owner (denormalised for query). |
| attendance_date | DATE | NOT NULL | Day. |
| segment_status | ENUM | NOT NULL | `PRESENT`/`ON_LEAVE`/`WFH`/`ON_DUTY`/`HOLIDAY`/`WEEKLY_OFF`/`ABSENT`/`HALF_DAY`/`MISSING_PUNCH`. |
| day_fraction | NUMERIC(3,2) | NOT NULL, CHECK 0 < day_fraction ≤ 1.0 | Fraction of the day (e.g. 0.5). |
| counts_as_present | BOOLEAN | NOT NULL | Whether the fraction counts toward `present_units`. |
| source_ref_type | ENUM | NULL | `LEAVE_APPLICATION`/`EXCEPTION`/`PUNCH`/`HOLIDAY`/`SYSTEM`. |
| source_ref_id | UUID | NULL | Originating record. |
| created_at, updated_at, created_by, updated_by | std | | Audit columns. |

Constraint: `SUM(day_fraction)` per (`employee_id`,`attendance_date`) MUST be ≤ 1.0 (enforced — error `ALLOCATION_EXCEEDS_DAY`).

#### E8 `regularisation_requests`
| Field | Type | Constraints | Description |
|---|---|---|---|
| regularisation_id | UUID | PK | Identity. |
| attendance_daily_id | UUID | FK → attendance_daily, NOT NULL | Day corrected. |
| employee_id | UUID | FK → employees, NOT NULL | Requester. |
| requested_status | ENUM | NOT NULL | Target status. |
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
| day_portion | ENUM | NOT NULL, DEFAULT `FULL` | `FULL`/`FIRST_HALF`/`SECOND_HALF` (sub-day support). *(R2)* |
| location_text | VARCHAR(200) | NULL | Tour/OD location. |
| reason | TEXT | NOT NULL | Purpose. |
| supporting_document_id | UUID | FK → documents | Tour order/approval. |
| workflow_instance_id | UUID | FK → workflow_instances | Approval. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

#### E11 `comp_off_ledger` (append-only — sole comp-off balance source, R17)
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
| is_sanction_based | BOOLEAN | NOT NULL, DEFAULT false | Governed by entitlement counter, not accruable balance (E24). *(R7)* |
| is_encashable | BOOLEAN | NOT NULL | In-service encashment eligible. |
| is_encashable_on_retirement | BOOLEAN | NOT NULL, DEFAULT false | Retirement-only encash (e.g. HPL make-up). *(R5)* |
| affects_pay | BOOLEAN | NOT NULL | Triggers LWP/half-pay payroll impact. |
| gender_eligibility | ENUM | NOT NULL | `ALL`/`FEMALE`/`MALE`. |
| requires_document | BOOLEAN | NOT NULL | e.g. Medical needs certificate. |
| debit_ratio | NUMERIC(4,2) | NOT NULL, DEFAULT 1.00 | Units debited per availed day (COMMUTED = 2.00). *(R4)* |
| debits_against_leave_type_id | UUID | FK → leave_types, NULL | Pot actually debited (COMMUTED → HPL). *(R4)* |
| year_basis | ENUM | NOT NULL, DEFAULT `CALENDAR` | `CALENDAR`/`FINANCIAL`/`CAREER`/`EVENT`. *(R3, First-Principles)* |
| sandwich_rule | ENUM | NOT NULL, DEFAULT `EXCLUDE` | `EXCLUDE`/`INCLUDE_IF_SANDWICHED`/`ALWAYS_INCLUDE` — how holidays/weekly-offs within leave count. *(R13)* |
| requires_return_to_work_cert | BOOLEAN | NOT NULL, DEFAULT false | Fitness/return-to-work workflow after long medical leave. *(Proponent)* |
| max_continuous_days | INT | NULL | Statutory cap. |
| applicable_cadre_ids | JSONB | NULL | Cadre restriction. |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

> **Note (R17):** `COMPOFF` is a **redemption vehicle only** — it has NO `leave_balances` row and NO accrual policy; its balance lives solely in `comp_off_ledger`. Availing COMPOFF debits the comp-off ledger, not the leave ledger.

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
| rounding_mode | ENUM | NOT NULL, DEFAULT `NEAREST_HALF_CARRY` | `NEAREST_HALF_CARRY`/`ROUND_DOWN`/`ROUND_UP`/`BANKERS`. *(R3)* |
| proration_method | ENUM | NOT NULL, DEFAULT `DAYS_IN_SERVICE_OVER_CYCLE` | Mid-cycle join/exit formula. *(R3)* |
| suspend_accrual_on_lwp | BOOLEAN | NOT NULL, DEFAULT true | Suspend accrual during LWP/SUSPENDED/dies-non. *(R19)* |
| max_balance_cap | NUMERIC(6,2) | NULL | Ceiling. |
| carry_forward_allowed | BOOLEAN | NOT NULL | Year-end carry. |
| carry_forward_cap | NUMERIC(6,2) | NULL | Max carried. |
| encashment_cap_days | NUMERIC(6,2) | NULL | Max encashable. |
| retirement_encash_cap_days | NUMERIC(6,2) | NULL | Combined EL+HPL retirement ceiling (e.g. 300). *(R5)* |
| lapse_rule | ENUM | NOT NULL | `LAPSE_EXCESS`/`NO_LAPSE`/`CONVERT_TO_HPL`. |
| min_balance_for_encash | NUMERIC(6,2) | NULL | Threshold. |
| advance_allowed | BOOLEAN | NOT NULL, DEFAULT false | Negative balance permitted (advance leave). |
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
| leave_year | INT | NOT NULL | Balance year (per type `year_basis`). |
| opening_balance | NUMERIC(6,2) | NOT NULL | Carried-in. |
| accrued | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD accrued. |
| availed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD used. |
| reserved | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | Active soft-reserve total (from E21). *(R1)* |
| encashed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD encashed. |
| lapsed | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | YTD lapsed. |
| current_balance | NUMERIC(6,2) | NOT NULL | Live balance (= reconciles to ledger). |
| available_balance | NUMERIC(6,2) | NOT NULL | `current_balance − reserved` (shown to user). *(R1)* |
| version | BIGINT | NOT NULL, DEFAULT 0 | **Optimistic-lock version**, incremented on every debit/credit. *(R1/R2)* |
| last_ledger_entry_id | UUID | FK → leave_balance_ledger | Reconciliation anchor. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`employee_id`,`leave_type_id`,`leave_year`).

#### E21 `leave_reservations` *(v2 new — R1)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| reservation_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type reserved against. |
| leave_year | INT | NOT NULL | Year. |
| application_id | UUID | FK → leave_applications, NOT NULL | Source application. |
| reserved_units | NUMERIC(6,2) | NOT NULL | Held quantity (post debit_ratio). |
| status | ENUM | NOT NULL | `RESERVED`/`RELEASED`/`CONSUMED`. |
| expires_at | TIMESTAMPTZ | NULL | Auto-release if approval not completed in window. |
| created_at, updated_at, created_by, updated_by | std | | Audit columns. |

Constraint: net `RESERVED` units roll up into `leave_balances.reserved`; `CONSUMED` on approval (converted to `AVAIL` debit), `RELEASED` on reject/withdraw/expiry.

#### E15 `leave_balance_ledger` (append-only — single source of truth)
| Field | Type | Constraints | Description |
|---|---|---|---|
| ledger_entry_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type. |
| leave_year | INT | NOT NULL | Year. |
| entry_type | ENUM | NOT NULL | `ACCRUAL`/`OPENING`/`AVAIL`/`AVAIL_REVERSAL`/`ENCASHMENT`/`LAPSE`/`CARRY_FORWARD`/`ADJUSTMENT`/`HPL_CONVERSION`/`CLAWBACK`. *(R19)* |
| amount | NUMERIC(6,2) | NOT NULL | Signed (+credit / −debit). |
| balance_after | NUMERIC(6,2) | NOT NULL | Running balance post-entry. |
| source_ref_type | ENUM | NULL | `LEAVE_APPLICATION`/`ACCRUAL_RUN`/`YEAR_CLOSE`/`ENCASHMENT`/`MANUAL`/`EXIT_CLAWBACK`. |
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
| total_days | NUMERIC(5,2) | NOT NULL | Computed per `sandwich_rule` & `debit_ratio`. *(R13/R4)* |
| ledger_debit_units | NUMERIC(6,2) | NOT NULL | Units actually debited (= total_days × debit_ratio). *(R4)* |
| reason | TEXT | NOT NULL | Justification. |
| is_backdated | BOOLEAN | NOT NULL, DEFAULT false | Past-dated flag. |
| contact_during_leave | VARCHAR(120) | NULL | Address/phone. |
| supporting_document_id | UUID | FK → documents | Medical cert / order. |
| reservation_id | UUID | FK → leave_reservations, NULL | Active soft-reserve. *(R1)* |
| workflow_instance_id | UUID | FK → workflow_instances | Approval chain. |
| status | ENUM | NOT NULL | `DRAFT`/`SUBMITTED`/`RECOMMENDED`/`APPROVED`/`REJECTED`/`CANCELLED`/`WITHDRAWN`. |
| sr_posting_status | ENUM | NOT NULL | `NOT_REQUIRED`/`PENDING`/`POSTED`/`FAILED`. |
| return_to_work_status | ENUM | NULL | `NOT_REQUIRED`/`PENDING`/`CLEARED` (long medical). *(Proponent)* |
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
| is_non_working | BOOLEAN | NOT NULL, DEFAULT false | Holiday/weekly-off; counted per `sandwich_rule`. *(R13)* |
| created_at, created_by | std | | Audit. |

Constraint: UNIQUE(`application_id`,`leave_date`); **`SUM(day_units)` MUST equal `leave_applications.total_days`** (R18, error `DAY_UNITS_MISMATCH`).

#### E18 `leave_encashment_requests`
| Field | Type | Constraints | Description |
|---|---|---|---|
| encashment_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Encashable type. |
| encashment_type | ENUM | NOT NULL | `IN_SERVICE`/`RETIREMENT`/`LTC`. |
| days_requested | NUMERIC(6,2) | NOT NULL | Quantity. |
| days_approved | NUMERIC(6,2) | NULL | After validation. |
| el_days_component | NUMERIC(6,2) | NULL | EL portion (retirement split). *(R5)* |
| hpl_days_component | NUMERIC(6,2) | NULL | HPL make-up portion to reach cap. *(R5)* |
| ltc_block_ref | VARCHAR(30) | NULL | LTC block identifier (4-yr block). *(R12)* |
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
| present_units | NUMERIC(5,2) | NOT NULL | Present-counting units (from allocations, R2). |
| encashment_amount | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Encashment to pay. |
| export_status | ENUM | NOT NULL | `PENDING`/`EXPORTED`/`ACKED`/`FAILED`. |
| is_locked | BOOLEAN | NOT NULL, DEFAULT false | Locked after export. *(R6)* |
| exported_at | TIMESTAMPTZ | NULL | Timestamp. |
| m10_batch_ref | VARCHAR(60) | NULL | Payroll-side ack ref. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: UNIQUE(`pay_period`,`employee_id`).

#### E23 `payroll_feed_adjustments` *(v2 new — R6)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| adjustment_id | UUID | PK | Identity. |
| original_feed_id | UUID | FK → payroll_attendance_feed, NOT NULL | Locked period being corrected. |
| applied_in_pay_period | VARCHAR(7) | NOT NULL | Next open period carrying the correction. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| adjustment_type | ENUM | NOT NULL | `LWP_DELTA`/`HALF_PAY_DELTA`/`OT_DELTA`/`PRESENT_DELTA`/`ENCASHMENT_DELTA`. |
| delta_value | NUMERIC(12,2) | NOT NULL | Signed correction. |
| reason | TEXT | NOT NULL | Source (late regularisation, roster edit, cancellation). |
| source_ref_type | ENUM | NOT NULL | `REGULARISATION`/`ROSTER_EDIT`/`HOLIDAY_EDIT`/`LEAVE_CANCEL`/`MANUAL`. |
| source_ref_id | UUID | NULL | Originating record. |
| status | ENUM | NOT NULL | `PENDING`/`EXPORTED`/`ACKED`. |
| created_at, updated_at, created_by, updated_by | std | | Audit columns. |

#### E24 `leave_entitlements` *(v2 new — R7,R14)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| entitlement_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Sanction-based type. |
| quota_basis | ENUM | NOT NULL | `CAREER`/`EVENT`/`ANNUAL`. |
| total_quota_days | NUMERIC(6,2) | NOT NULL | e.g. CCL 730 (career), Maternity 180 (event). |
| consumed_days | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | Used to date. |
| remaining_days | NUMERIC(6,2) | NOT NULL | Derived (quota − consumed). |
| eligibility_predicate | JSONB | NULL | e.g. `{"surviving_children_max":2,"child_age_max":18}`. *(R14)* |
| valid_from | DATE | NULL | Window start (event types). |
| valid_to | DATE | NULL | Window end. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit columns. |

Constraint: avail against a sanction type checks `leave_entitlements` (not a positive accruable balance); the ledger still records an informational `AVAIL` entry — removing the negative-balance special case. *(R7)*

#### E25 `attendance_processing_runs` *(v2 new — R8)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| run_id | UUID | PK | Identity. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope (null = all). |
| date_from | DATE | NOT NULL | Range start. |
| date_to | DATE | NOT NULL | Range end. |
| trigger_type | ENUM | NOT NULL | `SCHEDULED`/`ON_DEMAND`/`RECOMPUTE_ENQUEUED`. |
| status | ENUM | NOT NULL | `QUEUED`/`RUNNING`/`COMPLETED`/`PARTIAL`/`FAILED`. |
| employees_processed | INT | NOT NULL, DEFAULT 0 | Count. |
| employees_failed | INT | NOT NULL, DEFAULT 0 | Count. |
| started_at | TIMESTAMPTZ | NULL | Start. |
| finished_at | TIMESTAMPTZ | NULL | End. |
| created_at, created_by | std | | Audit. |

#### E26 `rh_elections` *(v2 new — R8)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| election_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Elector. |
| calendar_id | UUID | FK → holiday_calendars, NOT NULL | Calendar. |
| holiday_id | UUID | FK → holidays, NOT NULL | Elected RH (must be RESTRICTED). |
| leave_year | INT | NOT NULL | Year. |
| status | ENUM | NOT NULL | `ELECTED`/`CANCELLED`. |
| created_at, updated_at, created_by, updated_by | std | | Audit. |

Constraint: UNIQUE(`employee_id`,`holiday_id`); count of `ELECTED` per (employee, leave_year) ≤ `rh_cap` (error `RH_CAP_EXCEEDED`).

#### E27 `module_config` *(v2 new — R8, Proponent)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| config_id | UUID | PK | Identity. |
| config_key | VARCHAR(60) | NOT NULL | e.g. `REGULARISATION_WINDOW_DAYS`, `BACKDATE_WINDOW_DAYS`, `COMPOFF_VALIDITY_DAYS`, `RH_CAP`, `CONFLICT_THRESHOLD_PCT`, `CLOCK_SKEW_MIN`, `RESERVATION_TTL_MIN`, `BLACKOUT_PERIOD`, `MASS_LEAVE`. |
| config_value | JSONB | NOT NULL | Scalar or structured (e.g. blackout `{from,to,leaveTypes}`). |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope (null = global). |
| effective_from | DATE | NOT NULL | Version start. |
| effective_to | DATE | NULL | Version end. |
| status | ENUM | NOT NULL | `ACTIVE`/`SUPERSEDED`/`DRAFT`. |
| created_at, updated_at, created_by, updated_by | std | | Audit. |

Constraint: most-specific scope wins; no overlapping ACTIVE versions for the same (`config_key`,`scope`).

#### E28 `approval_delegations` *(v2 new — R11)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| delegation_id | UUID | PK | Identity. |
| delegator_user_id | UUID | FK → users, NOT NULL | Absent approver. |
| delegate_user_id | UUID | FK → users, NOT NULL | Stand-in approver. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Limited scope (null = all delegator's). |
| request_types | JSONB | NULL | e.g. `["LEAVE","REGULARISATION","OT"]` (null = all). |
| from_date | DATE | NOT NULL | Start. |
| to_date | DATE | NOT NULL | End. |
| auto_on_sla_breach | BOOLEAN | NOT NULL, DEFAULT true | Also fires on SLA breach, not just date window. |
| status | ENUM | NOT NULL | `ACTIVE`/`EXPIRED`/`REVOKED`. |
| created_at, updated_at, created_by, updated_by | std | | Audit. |

Constraint: `delegate_user_id` ≠ applicant; delegate must hold an approver role in scope.

#### E29 `employee_dependents` *(v2 new — R14; M01-aligned)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| dependent_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Parent employee. |
| relation | ENUM | NOT NULL | `CHILD`/`SPOUSE`/`PARENT`/`OTHER`. |
| dob | DATE | NULL | For child-age eligibility (CCL). |
| is_surviving | BOOLEAN | NOT NULL, DEFAULT true | Surviving-children rule. |
| is_disabled | BOOLEAN | NOT NULL, DEFAULT false | Extends CCL age cap. |
| created_at, updated_at, created_by, updated_by, is_deleted | std | | Audit. |

> **Note:** This data ideally lives in M01-EPM; M03 reads/mirrors it. If M01 does not yet expose it, M03 owns this table and emits a dependency-amendment request to M01.

#### E30 `biometric_consents` *(v2 new — R9)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| consent_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Data principal. |
| lawful_basis | ENUM | NOT NULL | `STATUTORY_DUTY`/`CONSENT`/`EMPLOYMENT_CONTRACT`. *(R9)* |
| capture_types | JSONB | NOT NULL | e.g. `["BIOMETRIC","GEO","PHOTO"]`. |
| consent_status | ENUM | NOT NULL | `GRANTED`/`WITHDRAWN`/`NOT_REQUIRED`. |
| fallback_method | ENUM | NULL | `RFID`/`MANUAL`/`OTP` for non-enrolled/refusing. *(R9)* |
| consent_document_id | UUID | FK → documents, NULL | Signed consent artefact. |
| granted_at | TIMESTAMPTZ | NULL | When granted. |
| withdrawn_at | TIMESTAMPTZ | NULL | When withdrawn. |
| retention_until | DATE | NULL | Purge anchor for biometric/geo data. *(R9)* |
| created_at, updated_at, created_by, updated_by | std | | Audit. |

#### E31 `punch_anomaly_reviews` *(v2 new — R10)*
| Field | Type | Constraints | Description |
|---|---|---|---|
| review_id | UUID | PK | Identity. |
| punch_id | UUID | FK → attendance_punches, NOT NULL | Flagged punch. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| anomaly_type | ENUM | NOT NULL | `IMPOSSIBLE_TRAVEL`/`DUPLICATE_SECOND`/`GEO_MISMATCH`/`LOW_LIVENESS`/`DEVICE_BINDING_MISMATCH`. |
| detected_at | TIMESTAMPTZ | NOT NULL | When flagged. |
| reviewer_user_id | UUID | FK → users, NULL | Assigned reviewer (≠ owner). |
| workflow_instance_id | UUID | FK → workflow_instances | Review chain. |
| status | ENUM | NOT NULL | `OPEN`/`CONFIRMED_VALID`/`CONFIRMED_FRAUD`/`ESCALATED`. |
| resolution_notes | TEXT | NULL | Outcome. |
| created_at, updated_at, created_by, updated_by | std | | Audit. |

### 5.3 Relationship map
```
employees (M01) 1───∞ rosters ∞───1 shifts
employees 1───∞ attendance_punches ───∞ attendance_devices
attendance_punches 0..1───1 biometric_consents ; punch (flagged) 1───∞ punch_anomaly_reviews
employees 1───∞ attendance_daily 1───∞ attendance_day_allocations   (sum day_fraction ≤ 1.0)
attendance_daily ∞───1 attendance_processing_runs
attendance_daily 1───∞ regularisation_requests
employees 1───∞ overtime_records ──┐
employees 1───∞ attendance_exceptions │ (EARN source)
overtime_records / holidays-worked ──┴──> comp_off_ledger (∞, sole comp-off balance)
leave_types 1───∞ leave_accrual_policies (scoped, versioned)
leave_types (COMMUTED).debits_against ──> leave_types (HPL)         (2:1 debit, R4)
leave_types (sanction) 1───∞ leave_entitlements ∞───1 employees     (R7)
employees 1───∞ employee_dependents (CCL/Maternity eligibility, R14)
leave_types 1───∞ leave_balances ∞───1 employees  [version = optimistic lock]
leave_balances 1:1-anchor leave_balance_ledger (append-only history)
employees 1───∞ leave_reservations ∞───1 leave_applications        (soft-reserve, R1)
employees 1───∞ leave_applications 1───∞ leave_application_days
leave_applications ──(approved)──> service_register_events (via M04-LSR)
leave_applications / encashment / OT / attendance_daily ──> payroll_attendance_feed ──> M10-PAY
payroll_attendance_feed (locked) 1───∞ payroll_feed_adjustments     (next-period, R6)
leave_year_close_runs ──writes──> leave_balance_ledger
approval_delegations ──reroute──> workflow_tasks                    (R11)
module_config ──governs──> all configurable thresholds/blackouts
all state changes ──> audit_log ; all events ──> notifications
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| employees, org_units, designations, cadres | M01 | M03 | M01 only |
| employee_dependents | M01 (or M03 interim) | M03 | M01/M03 |
| service_register_events | M12 | M03 (status) | M04 (on behalf of M03) |
| documents | M13 | M03 | M03 (uploads cert/order/photo) |
| notifications, audit_log, workflow_* | Platform | M03 | M03 |
| shifts, rosters, holiday_*, rh_elections, attendance_*, comp_off_ledger | M03 | M14, M10 | M03 |
| leave_* (types/policies/balances/ledger/applications/reservations/entitlements/encashment/close) | M03 | M14, M10, M11, M04 | M03 |
| biometric_consents, punch_anomaly_reviews | M03 | DPO, Auditor | M03 |
| module_config, approval_delegations | M03 | M03 | M03 |
| payroll_attendance_feed, payroll_feed_adjustments | M03 | M10 | M03 (export); M10 (ack only) |

### 5.5 Enum catalog
| Enum | Values |
|---|---|
| employment_status (M01) | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| shift.status | ACTIVE, INACTIVE |
| shift.date_anchor_rule | SHIFT_START_LOCAL_DATE, PUNCH_LOCAL_DATE |
| roster.status | DRAFT, PUBLISHED, SUPERSEDED |
| holiday_type | GAZETTED, RESTRICTED, SECTIONAL, OPTIONAL |
| device_type | BIOMETRIC, RFID, MOBILE_APP, WEB |
| device.binding_mode | OPEN, EMPLOYEE_BOUND |
| device.template_storage | ON_DEVICE, SERVER_ENCRYPTED, NONE |
| capture_method | BIOMETRIC, RFID, MOBILE_GEO, WEB, MANUAL, OTP_FALLBACK |
| punch_direction | IN, OUT, AUTO |
| ingestion_status | ACCEPTED, DUPLICATE, REJECTED, FLAGGED_FOR_REVIEW |
| anomaly_type | IMPOSSIBLE_TRAVEL, DUPLICATE_SECOND, GEO_MISMATCH, LOW_LIVENESS, DEVICE_BINDING_MISMATCH |
| anomaly_review.status | OPEN, CONFIRMED_VALID, CONFIRMED_FRAUD, ESCALATED |
| attendance_daily.status (derived rollup) | PRESENT, ABSENT, HALF_DAY, ON_LEAVE, HOLIDAY, WEEKLY_OFF, WFH, ON_DUTY, MISSING_PUNCH |
| allocation.segment_status | PRESENT, ON_LEAVE, WFH, ON_DUTY, HOLIDAY, WEEKLY_OFF, ABSENT, HALF_DAY, MISSING_PUNCH |
| processing_run.status | QUEUED, RUNNING, COMPLETED, PARTIAL, FAILED |
| regularisation.status | DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED |
| overtime.status | SUBMITTED, APPROVED, REJECTED, PAID, CONVERTED_TO_COMPOFF |
| ot_treatment | PAID, COMP_OFF |
| exception_type | WFH, ON_DUTY, TOUR |
| comp_off.entry_type | EARN, REDEEM, EXPIRE, ADJUST |
| leave.category | PAID, HALF_PAY, UNPAID, SPECIAL |
| leave.year_basis | CALENDAR, FINANCIAL, CAREER, EVENT |
| leave.sandwich_rule | EXCLUDE, INCLUDE_IF_SANDWICHED, ALWAYS_INCLUDE |
| gender_eligibility | ALL, FEMALE, MALE |
| accrual_frequency | ANNUAL, MONTHLY, HALF_YEARLY, ON_JOINING, NONE |
| accrual_basis | CALENDAR, SERVICE_LENGTH, ATTENDANCE_PRORATED |
| rounding_mode | NEAREST_HALF_CARRY, ROUND_DOWN, ROUND_UP, BANKERS |
| lapse_rule | LAPSE_EXCESS, NO_LAPSE, CONVERT_TO_HPL |
| ledger.entry_type | ACCRUAL, OPENING, AVAIL, AVAIL_REVERSAL, ENCASHMENT, LAPSE, CARRY_FORWARD, ADJUSTMENT, HPL_CONVERSION, CLAWBACK |
| reservation.status | RESERVED, RELEASED, CONSUMED |
| entitlement.quota_basis | CAREER, EVENT, ANNUAL |
| leave_application.status | DRAFT, SUBMITTED, RECOMMENDED, APPROVED, REJECTED, CANCELLED, WITHDRAWN |
| return_to_work_status | NOT_REQUIRED, PENDING, CLEARED |
| sr_posting_status | NOT_REQUIRED, PENDING, POSTED, FAILED |
| day_portion | FULL, FIRST_HALF, SECOND_HALF |
| encashment_type | IN_SERVICE, RETIREMENT, LTC |
| encashment.status | SUBMITTED, APPROVED, REJECTED, SETTLED, CANCELLED |
| close_run.status | DRAFT, SIMULATED, COMMITTED, FAILED |
| feed.export_status | PENDING, EXPORTED, ACKED, FAILED |
| feed_adjustment.type | LWP_DELTA, HALF_PAY_DELTA, OT_DELTA, PRESENT_DELTA, ENCASHMENT_DELTA |
| feed_adjustment.status | PENDING, EXPORTED, ACKED |
| delegation.status | ACTIVE, EXPIRED, REVOKED |
| consent.lawful_basis | STATUTORY_DUTY, CONSENT, EMPLOYMENT_CONTRACT |
| consent.status | GRANTED, WITHDRAWN, NOT_REQUIRED |
| consent.fallback_method | RFID, MANUAL, OTP |
| module_config.status | ACTIVE, SUPERSEDED, DRAFT |

### 5.6 Data integrity rules
1. **Ledger-balance reconciliation:** `leave_balances.current_balance` MUST equal the `balance_after` of the latest `leave_balance_ledger` entry for that (employee, leave_type, leave_year). Enforced by trigger + nightly reconciliation job.
2. **Non-negative balances:** an `AVAIL`/`ENCASHMENT` debit cannot drive `balance_after` below 0 except where `leave_accrual_policies.advance_allowed=true`.
3. **Append-only ledgers:** `leave_balance_ledger`, `comp_off_ledger`, `attendance_punches` permit INSERT only; corrections via compensating entries, never UPDATE/DELETE.
4. **One day-row, many allocations:** UNIQUE(`employee_id`,`attendance_date`) on `attendance_daily`; allocations in `attendance_day_allocations` for that day MUST sum `day_fraction` ≤ 1.0 (R2). UNIQUE(`application_id`,`leave_date`) across active leave application days.
5. **Idempotent ingestion:** UNIQUE(`device_id`,`source_ref`) on punches; replays mark `DUPLICATE`.
6. **Transactional writes:** leave approval = (consume reservation + insert ledger debit + update balance with version check + write allocations recompute-enqueue + update application status + enqueue SR posting + enqueue notification) in a single DB transaction.
7. **FK integrity:** all employee/org references resolve to active M01 records; soft-deleted employees block new applications.
8. **Gender/eligibility guard:** Maternity/CCL restricted to `gender_eligibility=FEMALE`; Paternity to `MALE`; cadre restrictions and **dependent-based eligibility (E29)** enforced at apply-time.
9. **Date sanity:** `end_date >= start_date`; backdated leave only within configurable window; future-dated punches rejected.
10. **No self-approval / no self-clear:** `workflow_tasks.assignee_id` ≠ application `created_by`/`employee_id`; an anomaly reviewer ≠ punch owner; a delegate ≠ applicant.
11. **Soft-reserve persistence (R1):** every `SUBMITTED` application holds a `leave_reservations` row; `leave_balances.reserved` = Σ active `RESERVED` units; `available_balance = current_balance − reserved`; reservations auto-`RELEASED` after `RESERVATION_TTL_MIN` if undecided.
12. **Concurrency control (R1):** balance debits acquire `SELECT … FOR UPDATE` on the `leave_balances` row and assert the optimistic `version`; a stale version aborts with `OPTIMISTIC_LOCK_CONFLICT`; two concurrent approvals cannot both pass the available-balance check.
13. **Present-units derivation (R2):** `attendance_daily.present_units` = Σ `day_fraction` of allocations where `counts_as_present=true`; FR-17 LWP/half-pay/present figures derive from allocations, not from a single status label.
14. **Commuted 2:1 (R4):** availing a leave type with `debit_ratio>1` and `debits_against_leave_type_id` set posts the debit (units × ratio) against the referenced pot's ledger/balance; insufficient target balance → `COMMUTED_REQUIRES_HPL`.
15. **Sanction entitlement (R7,R14):** sanction-based types (`is_sanction_based=true`) validate against `leave_entitlements.remaining_days` and `eligibility_predicate` at apply-time; ledger records informational `AVAIL` without a negative-balance exception.
16. **Sandwich rule (R13):** `leave_application_days.is_non_working` days are included in `total_days`/debit per the leave type's `sandwich_rule`; computed deterministically and shown in balance preview.
17. **Single attendance writer (R15):** only FR-04 writes `attendance_daily`/`attendance_day_allocations`; FR-05/07/08/12/13 enqueue a recompute via `attendance_processing_runs`.
18. **Comp-off SSOT (R17):** comp-off balance lives only in `comp_off_ledger`; no `leave_balances` row for COMPOFF.
19. **Day-units equality (R18):** `SUM(leave_application_days.day_units)` MUST equal `leave_applications.total_days` (trigger + validator; error `DAY_UNITS_MISMATCH`).
20. **Advance clawback (R19):** on RESIGNED/TRANSFERRED/DECEASED/RETIRED before advance-credited leave is earned, a `CLAWBACK` ledger entry (or payroll recovery via feed adjustment) reverses the unearned units; accrual is suspended during LWP/SUSPENDED/dies-non per `suspend_accrual_on_lwp`.
21. **Locked-period immutability (R6):** a feed period with `is_locked=true` is never overwritten; corrections are recorded in `payroll_feed_adjustments` against the next open period.
22. **Consent gating (R9):** a `BIOMETRIC`/`MOBILE_GEO` punch requires an active governing `biometric_consents` (GRANTED or STATUTORY_DUTY); otherwise the employee's `fallback_method` is used or the punch is `REJECTED` with `CONSENT_REQUIRED`.

### 5.7 Sample data (2-3 rows per new entity)
**shifts**
| shift_code | name | start_time | end_time | grace | is_night | date_anchor_rule | status |
|---|---|---|---|---|---|---|---|
| GEN | General | 09:30 | 17:30 | 10 | false | PUNCH_LOCAL_DATE | ACTIVE |
| NIGHT-A | Night A | 22:00 | 06:00 | 15 | true | SHIFT_START_LOCAL_DATE | ACTIVE |

**rosters**
| employee | shift_code | effective_from | effective_to | weekly_off_pattern | status |
|---|---|---|---|---|---|
| GOV-1001 | GEN | 2026-01-01 | (open) | ["SUN","SAT2","SAT4"] | PUBLISHED |
| GOV-2087 | NIGHT-A | 2026-04-01 | 2026-06-30 | ["SUN"] | PUBLISHED |

**holiday_calendars / holidays**
| calendar_code | year | location | holiday_date | name | holiday_type |
|---|---|---|---|---|---|
| HQ-2026 | 2026 | Head Office | 2026-01-26 | Republic Day | GAZETTED |
| HQ-2026 | 2026 | Head Office | 2026-09-05 | Local Festival | RESTRICTED |

**attendance_devices**
| device_code | device_type | binding_mode | supports_liveness | template_storage | status |
|---|---|---|---|---|---|
| BIO-HQ-01 | BIOMETRIC | OPEN | true | ON_DEVICE | ACTIVE |
| MOB-APP | MOBILE_APP | EMPLOYEE_BOUND | true | NONE | ACTIVE |

**attendance_punches**
| employee | device | punch_time (UTC) | attendance_date | direction | capture_method | ingestion_status |
|---|---|---|---|---|---|---|
| GOV-1001 | BIO-HQ-01 | 2026-06-29T04:02:11Z | 2026-06-29 | IN | BIOMETRIC | ACCEPTED |
| GOV-2087 | BIO-HQ-01 | 2026-06-29T16:31:00Z | 2026-06-29 | IN | BIOMETRIC | FLAGGED_FOR_REVIEW |

**attendance_daily / attendance_day_allocations**
| employee | attendance_date | status (rollup) | present_units | allocation: segment×fraction |
|---|---|---|---|---|
| GOV-1001 | 2026-06-29 | PRESENT | 1.00 | PRESENT×1.0 |
| GOV-2087 | 2026-06-29 | HALF_DAY | 0.50 | ON_LEAVE×0.5 + PRESENT×0.5 |

**attendance_processing_runs**
| scope | date_from | date_to | trigger_type | status | employees_processed |
|---|---|---|---|---|---|
| (all) | 2026-06-29 | 2026-06-29 | SCHEDULED | COMPLETED | 4820 |
| Head Office | 2026-06-30 | 2026-06-30 | RECOMPUTE_ENQUEUED | RUNNING | 120 |

**rh_elections**
| employee | calendar | holiday | leave_year | status |
|---|---|---|---|---|
| GOV-1001 | HQ-2026 | Local Festival | 2026 | ELECTED |
| GOV-2087 | HQ-2026 | Local Festival | 2026 | ELECTED |

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
| employee | exception_type | start_date | end_date | day_portion | status |
|---|---|---|---|---|---|
| GOV-1001 | WFH | 2026-06-22 | 2026-06-22 | FULL | APPROVED |
| GOV-2087 | TOUR | 2026-06-10 | 2026-06-12 | FULL | APPROVED |

**comp_off_ledger**
| employee | entry_type | days | source_ref_type | earned_on | expires_on | balance_after |
|---|---|---|---|---|---|---|
| GOV-1001 | EARN | +1.0 | OVERTIME | 2026-06-18 | 2026-09-18 | 1.0 |
| GOV-1001 | REDEEM | -1.0 | LEAVE_APPLICATION | 2026-06-26 | (n/a) | 0.0 |

**leave_types**
| leave_code | category | is_accruable | is_sanction_based | debit_ratio | debits_against | year_basis | sandwich_rule | retire_encash |
|---|---|---|---|---|---|---|---|---|
| EL | PAID | true | false | 1.00 | (self) | CALENDAR | INCLUDE_IF_SANDWICHED | true |
| HPL | HALF_PAY | true | false | 1.00 | (self) | CALENDAR | INCLUDE_IF_SANDWICHED | true(retire) |
| COMMUTED | PAID | false | false | 2.00 | HPL | CALENDAR | INCLUDE_IF_SANDWICHED | false |
| MAT | SPECIAL | false | true | 1.00 | (self) | EVENT | ALWAYS_INCLUDE | false |
| CCL | SPECIAL | false | true | 1.00 | (self) | CAREER | EXCLUDE | false |

**leave_accrual_policies**
| leave_type | frequency | quantity | basis | rounding_mode | carry_forward | cf_cap | retire_cap | lapse_rule |
|---|---|---|---|---|---|---|---|---|
| EL | HALF_YEARLY | 15 | CALENDAR | NEAREST_HALF_CARRY | true | 300 | 300 | LAPSE_EXCESS |
| HPL | HALF_YEARLY | 10 | CALENDAR | NEAREST_HALF_CARRY | true | (none) | 300(combined) | NO_LAPSE |
| CL | ANNUAL | 12 | CALENDAR | ROUND_DOWN | false | 0 | 0 | LAPSE_EXCESS |

**leave_balances**
| employee | leave_type | year | opening | accrued | availed | reserved | current | available | version |
|---|---|---|---|---|---|---|---|---|---|
| GOV-1001 | EL | 2026 | 120 | 15 | 5 | 2.5 | 130 | 127.5 | 7 |
| GOV-2087 | CL | 2026 | 0 | 12 | 3 | 0 | 9 | 9 | 3 |

**leave_reservations**
| employee | leave_type | application | reserved_units | status | expires_at |
|---|---|---|---|---|---|
| GOV-1001 | EL | LV-2026-000453 | 2.5 | RESERVED | 2026-07-02T10:00Z |
| GOV-2087 | CL | LV-2026-000460 | 1.0 | RELEASED | (n/a) |

**leave_balance_ledger**
| employee | leave_type | entry_type | amount | balance_after | source_ref_type | effective_date |
|---|---|---|---|---|---|---|
| GOV-1001 | EL | ACCRUAL | +15 | 135 | ACCRUAL_RUN | 2026-01-01 |
| GOV-1001 | EL | AVAIL | -5 | 130 | LEAVE_APPLICATION | 2026-06-29 |
| GOV-5500 | EL | CLAWBACK | -3 | 12 | EXIT_CLAWBACK | 2026-05-31 |

**leave_entitlements**
| employee | leave_type | quota_basis | total_quota | consumed | remaining | eligibility_predicate |
|---|---|---|---|---|---|---|
| GOV-3300 | CCL | CAREER | 730 | 120 | 610 | {"surviving_children_max":2,"child_age_max":18} |
| GOV-3300 | MAT | EVENT | 180 | 0 | 180 | {"surviving_children_max":2} |

**employee_dependents**
| employee | relation | dob | is_surviving | is_disabled |
|---|---|---|---|---|
| GOV-3300 | CHILD | 2020-03-15 | true | false |
| GOV-3300 | CHILD | 2016-09-01 | true | false |

**leave_applications / leave_application_days**
| application_no | employee | leave_type | start | end | total_days | ledger_debit_units | status | sr_posting |
|---|---|---|---|---|---|---|---|---|
| LV-2026-000451 | GOV-1001 | EL | 2026-06-29 | 2026-07-03 | 5 | 5 | APPROVED | POSTED |
| LV-2026-000470 | GOV-3300 | COMMUTED | 2026-07-10 | 2026-07-11 | 2 | 4 | SUBMITTED | NOT_REQUIRED |

**leave_encashment_requests**
| employee | leave_type | encashment_type | days_requested | el_component | hpl_component | ltc_block_ref | status |
|---|---|---|---|---|---|---|---|
| GOV-5500 | EL | RETIREMENT | 300 | 240 | 60 | (n/a) | SETTLED |
| GOV-1001 | EL | LTC | 10 | 10 | 0 | LTC-2025-2028 | APPROVED |

**leave_year_close_runs**
| leave_year | scope | run_status | employees | total_carried | total_lapsed |
|---|---|---|---|---|---|
| 2025 | (all) | COMMITTED | 4820 | 58200 | 1240 |
| 2026 | Head Office | SIMULATED | 612 | 7100 | 95 |

**payroll_attendance_feed / payroll_feed_adjustments**
| pay_period | employee | lwp_days | half_pay_days | paid_ot_min | present_units | is_locked |
|---|---|---|---|---|---|---|
| 2026-06 | GOV-2087 | 2 | 1 | 180 | 19.5 | true |
| (adj) 2026-07 | GOV-2087 | LWP_DELTA −1 (late regularisation of 2026-06-20) | | | | PENDING |

**module_config**
| config_key | config_value | scope | effective_from | status |
|---|---|---|---|---|
| BACKDATE_WINDOW_DAYS | 30 | (global) | 2026-01-01 | ACTIVE |
| BLACKOUT_PERIOD | {"from":"2026-03-25","to":"2026-03-31","leaveTypes":["EL","CL"]} | Finance Dept | 2026-01-01 | ACTIVE |

**approval_delegations**
| delegator | delegate | scope | request_types | from | to | auto_on_sla_breach | status |
|---|---|---|---|---|---|---|---|
| MGR-44 | MGR-45 | Team A | ["LEAVE","OT"] | 2026-07-01 | 2026-07-10 | true | ACTIVE |

**biometric_consents**
| employee | lawful_basis | capture_types | consent_status | fallback_method | retention_until |
|---|---|---|---|---|---|
| GOV-1001 | STATUTORY_DUTY | ["BIOMETRIC","GEO"] | GRANTED | RFID | 2031-06-29 |
| GOV-2200 | CONSENT | ["BIOMETRIC"] | WITHDRAWN | MANUAL | 2026-12-31 |

**punch_anomaly_reviews**
| punch | employee | anomaly_type | status | reviewer |
|---|---|---|---|---|
| pch-9001 | GOV-2087 | IMPOSSIBLE_TRAVEL | OPEN | HR-OFF-7 |
| pch-9002 | GOV-1500 | DUPLICATE_SECOND | CONFIRMED_VALID | HR-OFF-7 |

### 5.8 End-to-end worked example — "one leave day, end to end" *(R23 / Outsider)*
> GOV-1001 (EL year basis CALENDAR, current 130.0, reserved 0). Applies for 0.5-day EL on 2026-07-10 (FIRST_HALF), works the afternoon.

1. **Apply (FR-12):** `total_days = 0.5` (sandwich rule N/A — single working day), `ledger_debit_units = 0.5 × debit_ratio(1.0) = 0.5`. A `leave_reservations` row (0.5, RESERVED) is created; `leave_balances.reserved` → 0.5, `available_balance` → 129.5. Balance preview shows `before 130.0, softReserved 0.5, available 129.5`. (`SUM(day_units)=0.5=total_days` passes — R18.)
2. **Concurrency (R1):** a second concurrent application by the same employee re-reads `available_balance` already net of the 0.5 reservation; the balance row is locked `FOR UPDATE` with version assertion at debit time.
3. **Approve (FR-12, single txn):** reservation `CONSUMED`; ledger `AVAIL −0.5` (balance_after 129.5); `leave_balances.current_balance` 129.5, `reserved` 0, `version`++; application `APPROVED`; SR enqueue (`PENDING`); notification queued. A recompute is **enqueued** (not written) for 2026-07-10 (R15).
4. **Attendance (FR-04, sole writer):** recompute writes two allocations for 2026-07-10 — `ON_LEAVE×0.5 (counts_as_present=true, paid)` + `PRESENT×0.5` — `present_units = 1.0`; `status` rollup = `PRESENT`/`HALF_DAY` per precedence (R2).
5. **SR (M04):** approved EL event posts to Digital SR; `sr_posting_status` → `POSTED` on ack.
6. **Payroll feed (FR-17):** July period aggregates `present_units` (1.0 for that day), `lwp_days 0`, `half_pay_days 0`. If 2026-07 is later locked and a regularisation changes the day, a `payroll_feed_adjustments` row corrects the next open period (R6).
7. **Year-close (FR-15):** at 2026 close, EL above CF cap (300) lapses; opening 2027 balance posted as `OPENING` ledger entry; reconciliation = 0 mismatch.

---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. v2 additions are marked.

---

### FR-01 — Shift & Roster Management
- **Module:** Time & Attendance
- **Primary Role(s):** HR Officer, HR Admin (configure); Employee/Manager (view)
- **User Story:** As an HR Officer, I want to define shifts and assign employees to rosters so that attendance is evaluated against the correct working pattern.
- **Description:** Create/maintain shift definitions (timings, grace, thresholds, night flag, breaks, **date-anchor rule & display timezone**) and assign employees to shifts over date ranges with a weekly-off pattern. Supports rotating rosters and bulk assignment by org unit.
- **Acceptance Criteria:**
  1. HR can create a shift with start/end/grace/thresholds, scope, and `date_anchor_rule`.
  2. HR can assign one or more employees to a shift for a date range with a weekly-off pattern.
  3. Overlapping PUBLISHED rosters for the same employee/date are rejected with `ROSTER_OVERLAP`.
  4. Publishing a roster supersedes any prior open-ended roster for the same employee from the new `effective_from`.
  5. Employees and managers can view applicable shift/weekly-off for any date.
  6. **(v2/R6)** A roster edit affecting a date in a locked payroll period does NOT overwrite the fed day; it emits a `payroll_feed_adjustments` record for the next open period.
- **Business Rules:**
  - Night shifts (`is_night_shift=true`) attribute the worked period to the shift start date via `date_anchor_rule=SHIFT_START_LOCAL_DATE` (R16).
  - Weekly-off pattern supports fixed days and alternating Saturdays (`SAT2`,`SAT4` = 2nd/4th Saturday of the month — App. B legend).
  - Only ACTIVE shifts may be assigned.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | shifts | CRUD shift master |
  | rosters | Assignment records |
  | attendance_processing_runs | Recompute enqueue on edit |
  | payroll_feed_adjustments | Locked-period correction (R6) |
  | org_units, employees | Scope & assignee |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/shifts | Create shift |
  | POST | /api/v1/atl/rosters | Assign roster |
  | GET | /api/v1/atl/rosters?employeeId= | View roster |
- **UI Behavior Notes:** Shift form with time pickers and date-anchor selector; roster assignment grid with multi-select employees and a visual weekly-off picker; conflict banner on overlap; locked-period warning on retroactive edit.
- **Edge Cases:** Mid-period shift change; employee transferred (M05) mid-roster; alternating-Saturday boundary at month/year edge; **roster edit into a locked period → adjustment, not overwrite**; multi-timezone (display_timezone) attribution.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ShiftService`, `RosterService`, `RosterConflictValidator`, `RecomputeEnqueuer`, React `RosterPlanner` |
  | Backend Flow | Validate scope → check overlap → persist → publish supersedes prior → enqueue recompute (locked-period guard → adjustment) → audit |
  | Data Operations | INSERT shifts/rosters; UPDATE prior roster `status=SUPERSEDED`; INSERT processing_run / feed_adjustment (txn) |
  | Validation | Time order, threshold sanity, overlap, ACTIVE shift only, locked-period guard |
  | Authorization | RBAC HR + org-unit scope |
  | State Changes & Side Effects | roster DRAFT→PUBLISHED→SUPERSEDED; enqueues FR-04 recompute (never direct write) |
  | Failure Handling | `ROSTER_OVERLAP` 409; `INVALID_SHIFT_TIMES` 400; `LOCKED_PERIOD_ADJUSTMENT_EMITTED` 200(info) |
  | Dependencies | M01 employees, org_units; FR-04, FR-17 |
  | Test Guidance | Overlap rejection; night-shift date attribution; supersede chain; alt-Saturday calc; locked-period adjustment |

---

### FR-02 — Holiday Calendar Management (by location)
- **Module:** Time & Attendance
- **Primary Role(s):** HR Admin (configure); all (view)
- **User Story:** As an HR Admin, I want location-specific holiday calendars so attendance and leave-day computation honour the right holidays per office.
- **Description:** Define yearly holiday calendars bound to org/location scope, with gazetted/restricted/sectional/optional types; employees elect Restricted Holidays (RH) within a cap, persisted in **`rh_elections`**.
- **Acceptance Criteria:**
  1. HR can create a calendar for a year/location and add holidays.
  2. Duplicate date in the same calendar is rejected (`HOLIDAY_DUPLICATE`).
  3. Publishing a calendar makes it the basis for attendance/leave computation in scope.
  4. **(v2/R8)** Employees elect up to `rh_cap` restricted holidays, stored in `rh_elections`; exceeding the cap → `RH_CAP_EXCEEDED`.
  5. Holidays sandwiched between leave count or not per the leave type's `sandwich_rule` (R13).
  6. **(v2/R6)** Holiday edits affecting a locked payroll period emit a feed adjustment, not an overwrite.
- **Business Rules:** A holiday on a roster weekly-off does not double-grant; an employee inherits the calendar of their org unit/location; RH cap default 2 (overridable via `module_config`).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | holiday_calendars | Calendar master |
  | holidays | Dates |
  | rh_elections | RH election persistence (R8) |
  | org_units | Location scope |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/holiday-calendars | Create calendar |
  | POST | /api/v1/atl/holiday-calendars/{id}/holidays | Add holiday |
  | POST | /api/v1/atl/rh-elections | Elect RH |
  | GET | /api/v1/atl/holidays?date=&orgUnitId= | Resolve holidays |
- **UI Behavior Notes:** Calendar grid view; bulk import (CSV) of holidays; RH-election self-service with remaining-count badge backed by `rh_elections`.
- **Edge Cases:** Mid-year office relocation (which calendar applies); national vs sectional overlap on same date; RH already availed when calendar edited; RH cap change mid-year.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `HolidayCalendarService`, `HolidayResolver`, `RHElectionService` |
  | Backend Flow | Resolve employee location → pick PUBLISHED calendar → return holiday set; RH election validates cap against `rh_elections` |
  | Data Operations | INSERT calendar/holidays; INSERT/UPDATE rh_elections; enqueue recompute |
  | Validation | Unique date, RH cap, year match, locked-period guard |
  | Authorization | HR Admin write; all read; self RH-elect |
  | State Changes & Side Effects | DRAFT→PUBLISHED→ARCHIVED; enqueue FR-04 recompute |
  | Failure Handling | `HOLIDAY_DUPLICATE` 409; `RH_CAP_EXCEEDED` 409 |
  | Dependencies | M01 org_units; FR-04 |
  | Test Guidance | Location resolution; RH cap via table; sandwich rule binding; adjustment on locked edit |

---

### FR-03 — Attendance Punch Ingestion (biometric / RFID / mobile-geo)
- **Module:** Time & Attendance
- **Primary Role(s):** System (devices), Employee (mobile/web), SysAdmin (device config)
- **User Story:** As the system, I want to reliably ingest punches from biometric/RFID devices and the mobile app so daily attendance can be computed accurately, idempotently, **with consent governance and anti-fraud screening**.
- **Description:** Accept punch events from registered devices and the mobile app with geofence validation; deduplicate; classify direction; **derive `attendance_date` via the shift's date-anchor rule**; **screen for anomalies and gate on consent**; store raw immutably.
- **Acceptance Criteria:**
  1. A punch with a known `(device_id, source_ref)` already ingested is marked `DUPLICATE`, not re-stored.
  2. Mobile punches outside the device geofence are `REJECTED` with `GEOFENCE_VIOLATION`.
  3. Punches from unknown/inactive devices are rejected (`DEVICE_NOT_AUTHORIZED`).
  4. Future-dated punches are rejected (`INVALID_PUNCH_TIME`).
  5. All accepted punches are immutable and append-only.
  6. **(v2/R16)** `attendance_date` is derived from the applicable shift's `date_anchor_rule` (night shift → shift start local date).
  7. **(v2/R9)** A biometric/geo punch lacking an active governing consent uses the employee's `fallback_method`; if none, it is `REJECTED` with `CONSENT_REQUIRED`.
  8. **(v2/R10)** Punches triggering anomaly rules (impossible travel, duplicate-second, geo mismatch, low liveness, device-binding mismatch) are stored with `ingestion_status=FLAGGED_FOR_REVIEW` and open a `punch_anomaly_reviews` case (see FR-20).
- **Business Rules:** Device authenticated via hashed API key/cert; mobile requires authenticated user + GPS; direction inferred (odd=IN/even=OUT) when not supplied; clock skew tolerance ±`CLOCK_SKEW_MIN` (module_config); `EMPLOYEE_BOUND` devices reject punches for a different employee.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_punches | Raw store (photo/liveness/anomaly fields) |
  | attendance_devices | Source auth, geofence, binding, liveness |
  | biometric_consents | Consent gating (R9) |
  | punch_anomaly_reviews | Fraud review (R10) |
  | employees | Owner |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/punches/ingest | Device batch ingest |
  | POST | /api/v1/atl/punches/mobile | Mobile geo punch (+ optional photo/liveness) |
- **UI Behavior Notes:** Mobile "Punch In/Out" with live GPS + map pin and optional liveness/selfie; confirmation toast with server time; offline queue with sync; consent banner if not enrolled, offering fallback.
- **Edge Cases:** Device clock drift; duplicate replays after network retry; multiple devices same gate; GPS spoofing → `FLAGGED_FOR_REVIEW`; offline mobile punches synced later; consent withdrawn between punches (fallback engages).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PunchIngestController`, `DeviceAuthFilter`, `GeofenceValidator`, `DedupeService`, `ConsentGate`, `AnomalyScreener`, `AttendanceDateDeriver` |
  | Backend Flow | Auth device/user → consent gate (or fallback) → validate geofence/time → derive attendance_date → dedupe → anomaly screen → INSERT (ACCEPTED/FLAGGED) → enqueue daily-recompute |
  | Data Operations | INSERT punches only (append-only); UNIQUE conflict ⇒ DUPLICATE; INSERT anomaly_review when flagged |
  | Validation | Device active, geofence, time skew, future-date, consent, binding, anomaly rules |
  | Authorization | Device API key / authenticated user (self) |
  | State Changes & Side Effects | Enqueues FR-04 recompute for the derived date; opens anomaly case |
  | Failure Handling | `GEOFENCE_VIOLATION` 422; `DEVICE_NOT_AUTHORIZED` 403; `INVALID_PUNCH_TIME` 400; `CONSENT_REQUIRED` 403 |
  | Dependencies | attendance_devices, biometric_consents, FR-04, FR-20, M01 |
  | Test Guidance | Idempotent replay; geofence boundary; offline-sync ordering; skew tolerance; date derivation; consent/fallback; anomaly flag |

---

### FR-04 — Daily Attendance Processing, Sub-Day Allocation & Status Computation
- **Module:** Time & Attendance
- **Primary Role(s):** System (scheduled), HR Officer (rerun)
- **User Story:** As the system, I want to compute each employee's daily attendance as a **sub-day allocation set** from punches, roster, holidays, leave, and exceptions so that part-leave/part-present days and downstream payroll are accurate.
- **Description:** Nightly (and on-demand) batch derives `attendance_daily` + `attendance_day_allocations` by combining punches, roster/shift, holiday calendar, approved leave (incl. half-day), and WFH/OD exceptions; computes worked minutes, late/early, `present_units`, and a derived `status` rollup. **FR-04 is the sole writer of `attendance_daily`/allocations (R15).**
- **Acceptance Criteria:**
  1. Days with approved leave → an `ON_LEAVE` allocation; holiday → `HOLIDAY`; weekly-off → `WEEKLY_OFF`.
  2. Worked minutes ≥ full-day threshold → `PRESENT`; between half and full → `HALF_DAY`; below → `ABSENT`.
  3. Punch-in only / out only → `MISSING_PUNCH`.
  4. WFH/OD approved → `WFH`/`ON_DUTY` allocation regardless of punches.
  5. Re-running for a date is idempotent and overwrites only system-computed (non-regularised) rows; recorded under an `attendance_processing_runs` row.
  6. **(v2/R2)** A day with half-day leave and a worked afternoon produces TWO allocations (e.g. `ON_LEAVE×0.5` + `PRESENT×0.5`) summing ≤ 1.0; `present_units` reflects both; `status` is the highest-precedence rollup.
  7. **(v2/R15)** FR-04 consumes recompute requests enqueued by FR-05/07/08/12/13; those FRs never write `attendance_daily` directly.
- **Business Rules:** Precedence for rollup: Leave > Holiday > Weekly-off > WFH/OD > Punch-derived (App. B). Night-shift spans attributed per `date_anchor_rule`. Regularised days are not overwritten. Allocation sum ≤ 1.0 enforced (`ALLOCATION_EXCEEDS_DAY`).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_daily | Output rollup |
  | attendance_day_allocations | Sub-day allocations (R2) |
  | attendance_processing_runs | Run record (R8) |
  | attendance_punches, rosters, holidays, leave_applications, attendance_exceptions | Inputs |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/attendance/process | Trigger run (date/scope) |
  | GET | /api/v1/atl/attendance/daily?employeeId=&from=&to= | View (with allocations) |
- **UI Behavior Notes:** Monthly attendance grid with color-coded statuses; cells showing split allocations (e.g. half-leave/half-present); legend; drill to punches; HR "reprocess" action with scope picker and run-history.
- **Edge Cases:** Late punch sync after run (auto re-trigger); employee with no roster (defaults to GEN or flagged); leave approved after processing (recompute enqueued); part-day OD + part-day leave; allocation overflow guarded.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceProcessor`, `AllocationResolver`, `StatusRollupDeriver`, `ProcessingRunTracker`, scheduler job |
  | Backend Flow | Open run → for each employee/date: load inputs → build allocation set (≤1.0) → compute minutes/late/present_units → derive status rollup → UPSERT (skip regularised) → close run |
  | Data Operations | UPSERT attendance_daily + allocations (UNIQUE employee/date) in batched txns; INSERT processing_run |
  | Validation | Roster existence, input completeness, allocation-sum ≤ 1.0 |
  | Authorization | System; HR rerun scoped |
  | State Changes & Side Effects | Sets daily allocations/status/present_units; feeds FR-17; emits ABSENT alert notification |
  | Failure Handling | Partial-batch isolation; failed employee logged, run=PARTIAL; `PROCESSING_ERROR` 500; `ALLOCATION_EXCEEDS_DAY` 422 |
  | Dependencies | FR-01,02,03,07,08,12 (recompute enqueue) |
  | Test Guidance | Precedence matrix; threshold boundaries; half-leave+present allocation; idempotent rerun; sole-writer invariant; night-shift attribution |

---

### FR-05 — Missed-Punch Regularisation
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (raise), Manager/HR (approve)
- **User Story:** As an employee, I want to regularise a missed or incorrect punch with justification so my attendance reflects reality after approval.
- **Description:** Employee submits a correction for a `MISSING_PUNCH`/`ABSENT`/`HALF_DAY` day with proposed times and reason; routed to manager; on approval an **FR-04 recompute is enqueued** and the day is locked as regularised.
- **Acceptance Criteria:**
  1. Employee can raise regularisation only for own past days within the configurable window (`REGULARISATION_WINDOW_DAYS`, default 15).
  2. **(v2/R15)** Approval enqueues an FR-04 recompute that sets `is_regularised=true`; FR-05 does not write `attendance_daily` directly.
  3. Rejected requests leave attendance unchanged with reason logged.
  4. A monthly cap on regularisations is enforced (`REGULARISATION_LIMIT`).
  5. Audit captures before/after status.
  6. **(v2/R6)** Regularisation of a day in a locked payroll period emits a `payroll_feed_adjustments` correction for the next open period; it never overwrites the fed day.
- **Business Rules:** Manager approval required; HR can act on behalf; document optional but configurable per status; window/cap sourced from `module_config`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | regularisation_requests | Request |
  | attendance_processing_runs | Recompute enqueue |
  | payroll_feed_adjustments | Locked-period correction (R6) |
  | workflow_instances/tasks | Approval |
  | documents | Proof |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/regularisations | Raise |
  | POST | /api/v1/atl/regularisations/{id}/decision | Approve/reject |
- **UI Behavior Notes:** From attendance grid, "Regularise" on an eligible day opens a form; manager inbox shows pending; status timeline; locked-period notice.
- **Edge Cases:** Period locked by payroll → adjustment; cap exceeded; backdated beyond window; concurrent regularisation + leave on same day (allocation reconciliation).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `RegularisationService`, `WorkflowEngineAdapter`, `RecomputeEnqueuer`, `FeedAdjustmentService` |
  | Backend Flow | Validate eligibility/window/cap → create workflow → on approve enqueue FR-04 recompute (or feed adjustment if locked) + audit |
  | Data Operations | INSERT request; INSERT processing_run/feed_adjustment on approval |
  | Validation | Window, cap, period-lock, self-only |
  | Authorization | Self create; manager/HR approve (no self-approve) |
  | State Changes & Side Effects | request SUBMITTED→APPROVED/REJECTED; recompute enqueued; FR-17 adjustment if locked |
  | Failure Handling | `PERIOD_LOCKED`→adjustment; `REGULARISATION_LIMIT` 409; `WINDOW_EXPIRED` 422 |
  | Dependencies | FR-04, FR-17 |
  | Test Guidance | Window/cap enforcement; locked-period adjustment; before/after audit; recompute-not-direct-write |

---

### FR-06 — Overtime Capture & Approval
- **Module:** Time & Attendance
- **Primary Role(s):** Employee/Manager (claim/recommend), HR/Authority (approve)
- **User Story:** As an employee, I want approved overtime to be either paid or converted to compensatory-off so extra hours are fairly compensated.
- **Description:** Capture OT from worked-minutes beyond shift or on holidays/weekly-offs; submit claim with treatment (paid/comp-off); on approval, paid OT flows to payroll feed and comp-off credits the **comp_off_ledger (sole comp-off SSOT, R17)**.
- **Acceptance Criteria:**
  1. OT can only be claimed where actual worked minutes exceed shift end + grace (validated against punches).
  2. Approved `PAID` OT contributes `paid_ot_minutes` to the payroll feed.
  3. Approved `COMP_OFF` OT creates an `EARN` entry in `comp_off_ledger` with expiry.
  4. OT rate multiplier applies per policy (e.g. 2x on holidays).
  5. Duplicate OT for the same date is prevented.
- **Business Rules:** Comp-off earned expires after `COMPOFF_VALIDITY_DAYS` (default 90); holiday/weekly-off OT defaults to comp-off unless paid-OT policy applies; max OT/month cap.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | overtime_records | Claim |
  | comp_off_ledger | Comp-off earn (SSOT) |
  | payroll_attendance_feed | Paid OT |
  | attendance_daily | Validation source |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/overtime | Claim |
  | POST | /api/v1/atl/overtime/{id}/decision | Approve/reject |
- **UI Behavior Notes:** OT claim shows computed eligible minutes (read-only) with treatment toggle; approver sees evidence; comp-off balance widget reads `comp_off_ledger`.
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
- **Description:** Employee applies for WFH for a date range (optionally half-day); on approval the affected days are computed as a `WFH` allocation (counted as present) by **FR-04 (recompute enqueued, R15)**; optional WFH-day cap per month.
- **Acceptance Criteria:**
  1. Approved WFH days produce a `WFH` allocation that counts as present for payroll.
  2. WFH cannot overlap an existing approved leave/holiday (allocation conflict).
  3. Monthly WFH cap enforced if configured.
  4. Manager approval required; HR can apply on behalf.
  5. **(v2/R15)** Approval enqueues an FR-04 recompute; FR-07 does not write `attendance_daily`.
- **Business Rules:** WFH excluded on weekly-off/holiday (no-op); WFH may still require optional self check-in via mobile (policy); half-day WFH supported via `day_portion`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_exceptions | WFH record |
  | attendance_processing_runs | Recompute enqueue |
  | workflow_instances | Approval |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/exceptions (type=WFH) | Apply |
  | POST | /api/v1/atl/exceptions/{id}/decision | Approve |
- **UI Behavior Notes:** Date-range picker with conflict pre-check and half-day toggle; approved WFH appears on team calendar (FR-14).
- **Edge Cases:** WFH overlapping leave; cap exceeded; cancellation after partial period; half-day WFH + half-day present.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceExceptionService`, `ConflictChecker`, `RecomputeEnqueuer` |
  | Backend Flow | Validate overlap/cap → workflow → approve → enqueue FR-04 recompute |
  | Data Operations | INSERT exception; enqueue recompute |
  | Validation | Overlap, cap, date sanity |
  | Authorization | Self apply; manager approve |
  | State Changes & Side Effects | exception SUBMITTED→APPROVED; allocation WFH on recompute |
  | Failure Handling | `EXCEPTION_OVERLAP` 409; `WFH_CAP_EXCEEDED` 409 |
  | Dependencies | FR-04, FR-14 |
  | Test Guidance | Overlap/cap; present-counting allocation; weekly-off no-op; recompute-not-direct-write |

---

### FR-08 — On-Duty / Tour / Outdoor Duty
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (apply), Manager/Authority (approve)
- **User Story:** As a field officer, I want to record on-duty/tour days so my absence from the office is treated as official duty, not leave.
- **Description:** Capture On-Duty/Tour with location, purpose, and supporting order; approved days compute as an `ON_DUTY` allocation (present) via **FR-04 (recompute enqueued)**; links to tour order document.
- **Acceptance Criteria:**
  1. Approved OD/Tour days produce an `ON_DUTY` allocation and count as present.
  2. Tour requires a location and may require an order document.
  3. OD cannot overlap approved leave.
  4. Tour spanning weekly-off/holiday optionally counts per policy.
  5. **(v2/R15)** Approval enqueues FR-04 recompute; FR-08 does not write `attendance_daily`.
- **Business Rules:** Tour may generate comp-off if it includes holidays worked (policy → `comp_off_ledger`); OD distinct from WFH in reports; half-day OD supported via `day_portion`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | attendance_exceptions | OD/Tour record |
  | documents | Tour order |
  | attendance_processing_runs | Recompute enqueue |
  | comp_off_ledger | Optional EARN |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/exceptions (type=ON_DUTY/TOUR) | Apply |
  | POST | /api/v1/atl/exceptions/{id}/decision | Approve |
- **UI Behavior Notes:** Tour form with location, purpose, document upload; map optional.
- **Edge Cases:** Tour extended beyond approved range; OD overlapping leave; document missing when required; holiday-in-tour comp-off.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceExceptionService`, `DocumentRefValidator`, `RecomputeEnqueuer` |
  | Backend Flow | Validate → workflow → approve → enqueue FR-04 recompute; optional comp-off earn |
  | Data Operations | INSERT exception; optional comp_off_ledger EARN; enqueue recompute |
  | Validation | Location/doc required, overlap |
  | Authorization | Self apply; authority approve |
  | State Changes & Side Effects | ON_DUTY allocation on recompute; possible comp-off |
  | Failure Handling | `DOCUMENT_REQUIRED` 422; `EXCEPTION_OVERLAP` 409 |
  | Dependencies | M13 documents, FR-04, FR-09 |
  | Test Guidance | OD present-counting; doc enforcement; holiday-in-tour comp-off; recompute-not-direct-write |

---

### FR-09 — Compensatory-Off Earning & Redemption
- **Module:** Time & Attendance
- **Primary Role(s):** Employee (redeem), System/Manager (earn/approve)
- **User Story:** As an employee, I want comp-off credited for approved holiday/OT work and to redeem it as time off before it expires.
- **Description:** Maintain an append-only **`comp_off_ledger` as the single source of truth for comp-off balance (R17)**; earn entries from FR-06/FR-08; redeem via a COMPOFF leave application (redemption vehicle only — no `leave_balances` row); expire unused credits on a scheduled job.
- **Acceptance Criteria:**
  1. Earn entries credit the ledger with an `expires_on`.
  2. Redemption debits FIFO from non-expired credits.
  3. Redemption beyond balance is rejected (`COMP_OFF_INSUFFICIENT`).
  4. A daily job expires past-due credits (`EXPIRE` entries) and notifies owners ahead of expiry.
  5. Ledger balance reconciles to `balance_after` of latest entry.
  6. **(v2/R17)** COMPOFF leave applications debit `comp_off_ledger` only; there is no parallel COMPOFF `leave_balances`/ledger row.
- **Business Rules:** FIFO consumption; default 90-day validity; comp-off counted as paid present allocation; no negative balance.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | comp_off_ledger | Earn/redeem/expire (SSOT) |
  | leave_applications (COMPOFF type) | Redemption vehicle |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/comp-off/balance?employeeId= | Balance |
  | POST | /api/v1/atl/comp-off/redeem | Redeem |
- **UI Behavior Notes:** Comp-off wallet showing credits with expiry countdown; redeem flow reuses leave application UI but targets the comp-off ledger.
- **Edge Cases:** Redeem on a day that later becomes holiday; expiry during pending redemption; partial-day redemption.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CompOffLedgerService`, `CompOffExpiryJob`, `FifoConsumer` |
  | Backend Flow | Earn insert (FR-06/08); redeem validates balance → REDEEM entry + COMPOFF application; expiry job inserts EXPIRE |
  | Data Operations | INSERT ledger entries (append-only) |
  | Validation | Sufficient non-expired balance, FIFO, no parallel leave_balances row |
  | Authorization | Self redeem; system earn/expire |
  | State Changes & Side Effects | comp-off balance updated; COMPOFF application created on redeem; FR-04 recompute |
  | Failure Handling | `COMP_OFF_INSUFFICIENT` 409; `COMP_OFF_EXPIRED` 422 |
  | Dependencies | FR-06, FR-08, FR-12 |
  | Test Guidance | FIFO order; expiry job; reconciliation; negative-balance block; SSOT (no dual source) |

---

### FR-10 — Leave-Type & Accrual-Policy Configuration
- **Module:** Leave Management
- **Primary Role(s):** HR Admin
- **User Story:** As an HR Admin, I want to configure leave types and their accrual/carry-forward/encashment policies — including commuted 2:1, leave-year basis, rounding, and sandwich rule — so the engine applies the correct statutory rules per cadre and office.
- **Description:** Maintain the leave catalog and versioned accrual policies scoped by org unit/cadre with caps, carry-forward, lapse, encashment, **`debit_ratio`/`debits_against_leave_type_id` (commuted), `year_basis`, `sandwich_rule`, `rounding_mode`/`proration_method`, sanction flag, retirement-encash flag**.
- **Acceptance Criteria:**
  1. HR can create/deactivate leave types with category, eligibility, document, caps, **year_basis, sandwich_rule, debit_ratio, sanction flag**.
  2. HR can define a versioned accrual policy per type/scope with frequency, quantity, basis, **rounding_mode, proration_method**, caps, carry-forward, lapse rule, encashment caps.
  3. Overlapping ACTIVE policies for the same type/scope/date are rejected (`POLICY_OVERLAP`).
  4. Gender/cadre/**dependent** eligibility is enforced downstream at apply-time.
  5. Policy changes are versioned (effective_from/to), never destructive.
  6. **(v2/R4)** A type with `debit_ratio>1` MUST specify `debits_against_leave_type_id` (e.g. COMMUTED→HPL) or be rejected (`COMMUTED_REQUIRES_HPL` at config validation).
- **Business Rules:** Statutory caps preset (Maternity 180, Paternity 15, etc.) but editable; HPL = half-pay; **Commuted leave debits 2× HPL (R4)**; LWP affects pay and service; sanction-based types defined via `is_sanction_based` and backed by `leave_entitlements` (FR-22).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_types | Catalog (+ v2 fields) |
  | leave_accrual_policies | Rules (+ rounding/proration) |
  | leave_entitlements | Sanction quotas (link) |
  | org_units, cadres | Scope |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-types | Create type |
  | POST | /api/v1/atl/leave-policies | Create policy |
  | GET | /api/v1/atl/leave-policies?leaveTypeId= | List versions |
- **UI Behavior Notes:** Leave-type admin grid; policy builder wizard with live rule summary (showing debit-ratio target, year basis, sandwich behaviour, rounding); version history timeline.
- **Edge Cases:** Two scopes match an employee (most-specific wins); policy edited mid-year (applies prospectively); deactivating a type with open balances (blocked); commuted target HPL deactivated.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveTypeService`, `AccrualPolicyService`, `PolicyResolver`, `CommutedLinkValidator` |
  | Backend Flow | Validate scope/overlap/commuted-link → version prior (SUPERSEDED) → persist new |
  | Data Operations | INSERT type/policy; UPDATE prior policy status |
  | Validation | Overlap, cap sanity, eligibility, debit-ratio target presence |
  | Authorization | HR Admin only |
  | State Changes & Side Effects | policy DRAFT→ACTIVE→SUPERSEDED; affects future accrual |
  | Failure Handling | `POLICY_OVERLAP` 409; `TYPE_IN_USE` 409; `COMMUTED_REQUIRES_HPL` 422 |
  | Dependencies | M01 cadres/org_units |
  | Test Guidance | Most-specific resolution; versioning; commuted-link validation; sandwich/year-basis persistence |

---

### FR-11 — Accrual Engine, Rounding/Proration & Leave-Balance Ledger
- **Module:** Leave Management
- **Primary Role(s):** System (scheduled), HR Officer (adjust)
- **User Story:** As the system, I want to accrue leave per policy with a defined rounding and proration rule and record every balance change in an immutable, concurrency-safe ledger so balances are always auditable and reconcilable.
- **Description:** Scheduled accrual job credits leave per policy writing `ACCRUAL` ledger entries with **explicit rounding (`rounding_mode`) and proration (`proration_method`) per leave-year basis**; every avail/encash/lapse/adjustment/**clawback** also writes the ledger; balances are the reconciled projection with an **optimistic `version`**.
- **Acceptance Criteria:**
  1. Accrual job credits the correct quantity per active policy and updates balance.
  2. Every balance mutation writes exactly one ledger entry with `balance_after`.
  3. `leave_balances.current_balance` always equals latest ledger `balance_after` (reconciliation passes).
  4. **(v2/R3)** Pro-rated accrual on mid-year joining/leaving uses `proration_method`; the fraction is rounded per `rounding_mode` (default nearest-0.5 with fractional remainder carried to next cycle); a worked example is documented (App. C).
  5. Manual adjustments require maker-checker and a reason.
  6. **(v2/R1)** Balance debits use `SELECT … FOR UPDATE` + `version` assertion; a concurrent stale debit fails with `OPTIMISTIC_LOCK_CONFLICT`.
  7. **(v2/R19)** Accrual is suspended during LWP/SUSPENDED/dies-non per `suspend_accrual_on_lwp`; on exit before advance-credited leave is earned, a `CLAWBACK` entry reverses unearned units.
- **Business Rules:** Accrual respects `max_balance_cap`; HPL accrues separately; no balance change occurs outside the ledger; rounding remainder carried forward, never silently dropped.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_balance_ledger | Source of truth (+ CLAWBACK) |
  | leave_balances | Projection (+ version) |
  | leave_accrual_policies | Rules (rounding/proration) |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/accrual/run | Trigger accrual (scope) |
  | GET | /api/v1/atl/leave-ledger?employeeId=&leaveTypeId= | Ledger view |
  | POST | /api/v1/atl/leave-ledger/adjust | Manual adjustment (maker) |
- **UI Behavior Notes:** Balance card per leave type; ledger statement view (date, type, +/-, balance) downloadable; adjustment form with checker step; rounding-remainder note.
- **Edge Cases:** Re-run accrual (idempotent guard per cycle); cap reached (credit truncated + note); negative adjustment below 0; **concurrent avail during accrual (version conflict resolved)**; mid-year exit clawback; rounding remainder carry.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AccrualEngine`, `RoundingProrator`, `LeaveLedgerService`, `BalanceProjector`, `ReconciliationJob`, `ClawbackService` |
  | Backend Flow | For each employee/policy: compute prorated accrual → apply rounding (carry remainder) → lock balance row (FOR UPDATE + version) → INSERT ledger + UPDATE balance/version (txn) → idempotency key per cycle |
  | Data Operations | INSERT ledger (append-only); UPDATE balances with version increment |
  | Validation | Idempotency, cap, non-negative, version, suspend-on-LWP |
  | Authorization | System run; HR adjust (maker-checker) |
  | State Changes & Side Effects | balances/version updated; notifications on credit; reconciliation flag; clawback on exit |
  | Failure Handling | `ACCRUAL_ALREADY_RUN` 409; `LEDGER_RECON_MISMATCH` 500 (alert); `OPTIMISTIC_LOCK_CONFLICT` 409 |
  | Dependencies | FR-10; M01 service dates/employment_status |
  | Test Guidance | Reconciliation invariant; idempotent re-run; proration+rounding worked example; cap truncation; lost-update race; clawback; LWP suspend |

---

### FR-12 — Leave Application & Approval Workflow (Reservation, Concurrency, Sandwich)
- **Module:** Leave Management
- **Primary Role(s):** Employee (apply), Manager (recommend), HR/Authority (approve)
- **User Story:** As an employee, I want to apply for leave with half-day support and have it approved through the right chain, with a real balance reservation, deterministic sandwich-rule day counting, and my balance and the Service Register updated automatically and atomically.
- **Description:** Employee applies (type, dates, half-day portions, reason, document); system computes `total_days` per **`sandwich_rule`** and `ledger_debit_units` per **`debit_ratio`**, validates `available_balance` (net of reservations) or **`leave_entitlements`** for sanction types, creates a **`leave_reservations` hold**, routes through a configurable approval chain (with **delegation**, FR-19); on approval, atomically consumes the reservation, debits the ledger (against the correct pot for commuted), enqueues an FR-04 recompute to set the `ON_LEAVE` allocation, and (for SR-relevant types) enqueues a Digital SR posting via M04.
- **Acceptance Criteria:**
  1. **(v2/R13)** `total_days` includes weekly-off/holidays per the leave type's `sandwich_rule`, deterministically, and is shown in the balance preview; `SUM(day_units)=total_days` (R18).
  2. **(v2/R1)** On submit, a `leave_reservations` row holds `ledger_debit_units`; `available_balance` reflects the hold; insufficient available balance → `INSUFFICIENT_BALANCE` (except advance-allowed types).
  3. **(v2/R1)** On approval, a single transaction: lock balance row (FOR UPDATE + version) → consume reservation → ledger `AVAIL` debit (against `debits_against_leave_type_id` if set) → balance/version update → application APPROVED → enqueue FR-04 recompute → SR enqueue → notification.
  4. Eligibility (gender/cadre/document/**dependent**) enforced; sanction types validated against `leave_entitlements` (FR-22).
  5. Approval chain configurable (Manager → HR; special leaves → Sanctioning Authority); absent approver auto-routes to delegate (FR-19).
  6. SR-relevant approved leave sets `sr_posting_status=PENDING` then `POSTED` on M04 ack.
  7. **(v2/R4)** Availing COMMUTED debits 2× against HPL; insufficient HPL → `COMMUTED_REQUIRES_HPL`.
  8. **(v2/Proponent)** Applications in a configured blackout/freeze window are blocked (`BLACKOUT_PERIOD`); long-medical types set `return_to_work_status=PENDING` (FR-23).
- **Business Rules:** No double-booking a day; Commuted/Medical require document; Maternity/CCL gender+dependent-restricted; advance leave only for configured types; balance held via real reservation (not phantom).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications, leave_application_days | Request |
  | leave_reservations | Soft-reserve (R1) |
  | leave_balance_ledger, leave_balances | Debit (version) |
  | leave_entitlements | Sanction validation (R7) |
  | attendance_processing_runs | Recompute enqueue (R15) |
  | service_register_events (via M04) | Statutory post |
  | workflow_instances/tasks, approval_delegations | Approval + delegation |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-applications | Apply |
  | POST | /api/v1/atl/leave-applications/{id}/decision | Approve/reject/recommend |
  | GET | /api/v1/atl/leave-applications?employeeId=&status= | List |
- **UI Behavior Notes:** Apply wizard: type → date range with per-day half/full toggle → live balance preview (showing softReserved/available and sandwich-counted days) → document upload → submit; approver inbox with team-conflict indicator and delegate badge; status timeline with SR-posting badge.
- **Edge Cases:** Balance changes between submit and approve (reservation + version resolve); concurrent approvals (lost-update prevented); holiday sandwiched (rule-driven); SR posting fails (retry queue, FAILED, HR alert); applicant = approver/delegate (blocked); commuted with low HPL; blackout window.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveApplicationService`, `SandwichCalculator`, `ReservationService`, `LeaveValidator`, `EntitlementValidator`, `WorkflowEngineAdapter`, `LeaveLedgerService`, `RecomputeEnqueuer`, `SRPostingProducer` |
  | Backend Flow | Compute total_days (sandwich) + debit_units (ratio) → validate available/entitlement/blackout → create reservation → workflow (with delegation) → on final approve run txn (lock+version, consume reservation, ledger debit, balance, status, recompute enqueue, SR enqueue, notify) |
  | Data Operations | INSERT application+days+reservation; INSERT ledger AVAIL; UPDATE balance/version; enqueue recompute + SR + notification |
  | Validation | Balance/available, entitlement, eligibility, dependent, conflict, dates, document, day-units equality, blackout |
  | Authorization | Self apply; chain approve (no self-approval; delegate ≠ applicant) |
  | State Changes & Side Effects | DRAFT→SUBMITTED→[RECOMMENDED]→APPROVED/REJECTED; reservation RESERVED→CONSUMED/RELEASED; sr_posting; recompute enqueued |
  | Failure Handling | `INSUFFICIENT_BALANCE` 409; `LEAVE_OVERLAP` 409; `ELIGIBILITY_FAILED` 422; `OPTIMISTIC_LOCK_CONFLICT` 409; `COMMUTED_REQUIRES_HPL` 422; `ENTITLEMENT_EXCEEDED` 409; `DAY_UNITS_MISMATCH` 422; `BLACKOUT_PERIOD` 409; `SR_POSTING_FAILED` async-retry |
  | Dependencies | FR-10/11/19/22/23, M04-LSR, M01 |
  | Test Guidance | Atomic approval txn; reservation lifecycle; lost-update race; sandwich day-count; commuted 2:1; entitlement check; recompute-not-direct-write; rollback on partial failure |

---

### FR-13 — Leave Cancellation & Modification
- **Module:** Leave Management
- **Primary Role(s):** Employee (request), Manager/HR (approve)
- **User Story:** As an employee, I want to cancel or withdraw leave (whole or partial, before or after start) so unused leave is credited back correctly.
- **Description:** Support withdrawal of a SUBMITTED application (releases reservation) and cancellation of an APPROVED one (full or partial future days); approved cancellation reverses the ledger debit (`AVAIL_REVERSAL`, against the correct pot for commuted), enqueues an FR-04 recompute, and reverses/cancels any SR posting via M04; locked-period impacts emit a feed adjustment.
- **Acceptance Criteria:**
  1. SUBMITTED application can be withdrawn by applicant (no approval) → `leave_reservations` `RELEASED`; `available_balance` restored.
  2. APPROVED future leave can be cancelled (full/partial) with approval → `AVAIL_REVERSAL` credit for cancelled days only.
  3. Past/availed days cannot be cancelled (`CANNOT_CANCEL_PAST`).
  4. **(v2/R15)** Attendance for cancelled days recomputed via FR-04 enqueue; SR posting reversal enqueued for SR-relevant leave.
  5. Audit captures original vs revised.
  6. **(v2/R6)** Cancellation touching a locked payroll period emits a `payroll_feed_adjustments` correction.
- **Business Rules:** Partial cancellation only for future, contiguous-tail or specific days per policy; encashed/closed-year leave not cancellable; reversal amount = exact debited units (post debit_ratio) for cancelled days; commuted reversal credits HPL.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications, leave_application_days | Modify |
  | leave_reservations | Release |
  | leave_balance_ledger | Reversal |
  | attendance_processing_runs | Recompute enqueue |
  | payroll_feed_adjustments | Locked-period (R6) |
  | service_register_events (via M04) | Reversal |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/leave-applications/{id}/withdraw | Withdraw |
  | POST | /api/v1/atl/leave-applications/{id}/cancel | Cancel (full/partial) |
- **UI Behavior Notes:** Cancel modal with selectable future days and credited-back preview; status changes to CANCELLED/WITHDRAWN.
- **Edge Cases:** Cancel after partial availment; concurrent payroll lock → adjustment; SR already posted (reversal event); cancel of comp-off redemption restores comp-off credit; commuted reversal to HPL.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LeaveCancellationService`, `ReservationService`, `LeaveLedgerService`, `RecomputeEnqueuer`, `FeedAdjustmentService`, `SRPostingProducer` |
  | Backend Flow | Validate cancellable days → workflow (if approved) → txn: AVAIL_REVERSAL credit + balance/version + status + recompute enqueue + SR reversal enqueue (+ feed adjustment if locked) |
  | Data Operations | INSERT ledger AVAIL_REVERSAL; UPDATE application/days/balance/reservation |
  | Validation | Future-only, not-locked(→adjust), not-encashed |
  | Authorization | Self withdraw; manager/HR approve cancel |
  | State Changes & Side Effects | →CANCELLED/WITHDRAWN; balance restored; SR reversed; recompute enqueued |
  | Failure Handling | `CANNOT_CANCEL_PAST` 422; `PERIOD_LOCKED`→adjustment |
  | Dependencies | FR-12, FR-04, FR-17, M04 |
  | Test Guidance | Partial reversal accuracy; reservation release; SR reversal; comp-off restore; commuted-to-HPL reversal; locked-period adjustment |

---

### FR-14 — Backdated Leave & Team-Calendar Conflict Detection
- **Module:** Leave Management
- **Primary Role(s):** Employee (apply), Manager (view/approve)
- **User Story:** As a manager, I want a team leave calendar that flags coverage conflicts and to control backdated leave so staffing and compliance are maintained.
- **Description:** Allow backdated leave within a configurable window (`BACKDATE_WINDOW_DAYS`) with mandatory justification and elevated approval; provide a manager team calendar visualising leave/WFH/OD/holidays and flagging concurrent-absence thresholds (`CONFLICT_THRESHOLD_PCT`).
- **Acceptance Criteria:**
  1. Backdated leave permitted only within window and flagged `is_backdated=true` with elevated approval.
  2. Team calendar shows all team members' leave/WFH/OD/holidays for a selected month.
  3. Concurrent approved absences exceeding the configurable threshold show a conflict warning to the approver.
  4. Backdated leave beyond window is rejected (`BACKDATE_WINDOW_EXCEEDED`).
  5. Manager can filter calendar by status/leave type.
  6. **(v2/R3)** Backdated leave validates against the correct leave-year balance per the type's `year_basis`.
- **Business Rules:** Backdated leave still validates balance/reservation for the relevant leave-year; conflict threshold advisory (does not auto-block) but recorded; calendar respects org-unit row-level scope; thresholds/windows from `module_config`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_applications | Backdate + calendar |
  | attendance_exceptions | Calendar overlay |
  | holidays | Calendar overlay |
  | module_config | Window/threshold |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/team-calendar?managerId=&month= | Calendar |
  | GET | /api/v1/atl/leave-applications/conflicts?orgUnitId=&range= | Conflict check |
- **UI Behavior Notes:** Month grid, rows=employees, cells color-coded; conflict heat indicator; backdated badge; approver sees conflict % before deciding.
- **Edge Cases:** Backdate crossing leave-year boundary (uses correct year basis); large teams (paginated calendar); overlapping holiday on backdated leave.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `TeamCalendarService`, `ConflictDetector`, `BackdateValidator` |
  | Backend Flow | Backdate: validate window + correct leave-year balance → FR-12 chain (elevated). Calendar: aggregate team absences by day |
  | Data Operations | Read-heavy aggregation; INSERT application (backdate via FR-12) |
  | Validation | Window, leave-year basis, scope |
  | Authorization | Manager scope; self apply |
  | State Changes & Side Effects | conflict advisory recorded on workflow task |
  | Failure Handling | `BACKDATE_WINDOW_EXCEEDED` 422 |
  | Dependencies | FR-12, FR-07/08, FR-02 |
  | Test Guidance | Window enforcement; cross-year-basis balance; threshold calc; scope isolation |

---

### FR-15 — Leave-Year Close: Carry-Forward, Lapse & HPL Conversion
- **Module:** Leave Management
- **Primary Role(s):** HR Admin
- **User Story:** As an HR Admin, I want to close the leave year, carrying forward eligible balances, lapsing excess, and converting per policy, with a dry-run before committing.
- **Description:** Year-close job processes each employee's balances per policy and **per leave-type `year_basis`**: compute carry-forward (capped), lapse excess, convert (e.g. EL→HPL) where configured, post opening balances for the new year — all via ledger entries; supports SIMULATED dry-run with report before COMMIT.
- **Acceptance Criteria:**
  1. SIMULATED run produces a report (per employee: carried/lapsed/converted/opening) without writing balances.
  2. COMMITTED run writes `CARRY_FORWARD`, `LAPSE`, `HPL_CONVERSION`, and `OPENING` ledger entries atomically per employee.
  3. Carry-forward respects `carry_forward_cap`; excess lapses per `lapse_rule`.
  4. New leave-year `leave_balances` rows are created with correct opening balances and reset `version`.
  5. A committed year cannot be re-committed (`YEAR_ALREADY_CLOSED`).
  6. **(v2)** Ordering is pinned: encashment-before-lapse, then carry-forward, then opening; documented and deterministic.
- **Business Rules:** EL excess beyond CF cap lapses; CL typically lapses fully (no CF); HPL may have no-lapse; close is irreversible except via maker-checker adjustment; run is idempotent per (year, scope); accrual (FR-11) and close ordering vs Jan/Jul EL credit pinned.
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
- **Edge Cases:** Employees joined mid-year; pending leave applications spanning year boundary (block or split); retirees during year; partial-scope close then org-wide close; financial vs calendar year basis differences.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `YearCloseService`, `CarryForwardCalculator`, `LeaveLedgerService` |
  | Backend Flow | Lock scope → per employee per year_basis compute CF/lapse/convert (ordered) → SIMULATE (report) or COMMIT (txn ledger+balances) → mark run |
  | Data Operations | INSERT ledger + new balances (txn per employee) |
  | Validation | Idempotency, pending-leave guard, cap, ordering |
  | Authorization | HR Admin only |
  | State Changes & Side Effects | run DRAFT→SIMULATED→COMMITTED; new-year balances live |
  | Failure Handling | `YEAR_ALREADY_CLOSED` 409; `PENDING_LEAVE_BLOCKS_CLOSE` 409 |
  | Dependencies | FR-10/11 |
  | Test Guidance | Dry-run no-write; CF cap & lapse; conversion; idempotency; opening correctness; ordering determinism |

---

### FR-16 — Leave Encashment (In-Service, LTC & On Retirement)
- **Module:** Leave Management
- **Primary Role(s):** Employee (request), HR/Authority (approve), Payroll (settle)
- **User Story:** As an employee (or retiree), I want to encash eligible leave so I receive payment for unused balance per policy, with retirement encashment correctly making up the 300-day cap from EL and HPL.
- **Description:** Submit encashment for encashable types within caps; on approval, debit ledger (`ENCASHMENT`) and post amount to the payroll feed; **retirement encashment encashes EL up to cap then HPL cash-equivalent to make up the statutory ceiling (R5)**; **LTC encashment follows the 10-EL-days-per-block / 60-career-day rule (R12)**; retirement integrates with M11.
- **Acceptance Criteria:**
  1. In-service encashment allowed only for `is_encashable` types within `encashment_cap_days` and `min_balance_for_encash`.
  2. Approval debits `ENCASHMENT` ledger entry and creates a payroll-feed amount.
  3. **(v2/R5)** RETIREMENT encashment computes `el_days_component` (EL to cap) then `hpl_days_component` (HPL cash-equivalent) to reach `retirement_encash_cap_days` (e.g. 300); HPL is encashable at retirement only (`is_encashable_on_retirement`).
  4. **(v2/R12)** LTC encashment caps at 10 EL days per LTC block and 60 EL days over career; linked via `ltc_block_ref`; exceeding → `LTC_BLOCK_EXHAUSTED`.
  5. Estimated amount shown (M10 computes final); insufficient/over-cap requests rejected.
- **Business Rules:** EL retirement encashment + HPL make-up combined ≤ `retirement_encash_cap_days`; in-service LTC linkage required for LTC type; settlement marks `SETTLED` after payroll ack.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_encashment_requests | Request (+ el/hpl components, ltc_block_ref) |
  | leave_balance_ledger | ENCASHMENT debit (EL + HPL retirement) |
  | payroll_attendance_feed | Amount export |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/encashments | Request |
  | POST | /api/v1/atl/encashments/{id}/decision | Approve/reject |
- **UI Behavior Notes:** Encashment form with eligible-balance and cap display, EL/HPL split for retirement, LTC block selector and remaining career cap, estimated amount; retiree flow surfaced from M11 context.
- **Edge Cases:** Encashment + pending leave reducing balance; cap reached across multiple requests in a year; retirement date change; encashment then cancellation before settlement; HPL make-up when EL alone < 300; LTC block exhausted.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `EncashmentService`, `RetirementShortfallCalculator`, `LtcCapValidator`, `LeaveLedgerService`, `PayrollFeedProducer` |
  | Backend Flow | Validate eligibility/cap/balance → for RETIREMENT compute EL then HPL make-up; for LTC check block/career cap → workflow → approve txn: ENCASHMENT debit(s) + feed amount → settle on M10/M11 ack |
  | Data Operations | INSERT encashment + ledger ENCASHMENT (EL and/or HPL); UPDATE feed |
  | Validation | Encashable, cap, min-balance, retirement combined cap, LTC block/career |
  | Authorization | Self request; HR/authority approve; payroll settle |
  | State Changes & Side Effects | SUBMITTED→APPROVED→SETTLED; balance reduced (EL+HPL) |
  | Failure Handling | `ENCASHMENT_CAP_EXCEEDED` 409; `NOT_ENCASHABLE` 422; `LTC_BLOCK_EXHAUSTED` 409 |
  | Dependencies | FR-11, M10, M11 |
  | Test Guidance | In-service cap; retirement EL+HPL make-up to 300; LTC 10/60 rule; ledger debit split; settle on ack |

---

### FR-17 — Attendance & Leave → Payroll (LWP) Feed + Locked-Period Adjustments
- **Module:** Integration
- **Primary Role(s):** System (generate), Payroll Officer (reconcile)
- **User Story:** As a Payroll Officer, I want an accurate per-period feed of LWP, half-pay, paid-OT, present units, and encashment — with locked periods corrected only via next-period adjustments — so payroll computes pay correctly without retroactive drift.
- **Description:** For each pay period, aggregate per-employee LWP days, half-pay days (HPL), paid-OT minutes, **`present_units` (from allocations, R2)**, and encashment amounts into `payroll_attendance_feed`; expose to M10 with ack handshake; **lock the period after export and route any later correction to `payroll_feed_adjustments` in the next open period (R6)**.
- **Acceptance Criteria:**
  1. Feed generated per `pay_period` aggregates LWP, half-pay, paid-OT, present_units, encashment per employee.
  2. LWP derived from `ABSENT`/LWP-type allocations; half-pay from HPL leave; present_units from present-counting allocations.
  3. **(v2/R6)** After EXPORTED, `is_locked=true`; later corrections create a `payroll_feed_adjustments` row in the next open period — the locked feed is never overwritten.
  4. M10 ack updates status to `ACKED`; failures set `FAILED` with retry.
  5. Feed reconciles to attendance_daily allocations + leave ledger for the period.
- **Business Rules:** Present-counting statuses: PRESENT, WFH, ON_DUTY, ON_LEAVE (paid), HALF_DAY (0.5 via allocation); LWP/absent reduce pay; period lock aligns with FR-01/02/05/13 adjustment behaviour.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | payroll_attendance_feed | Output |
  | payroll_feed_adjustments | Locked-period corrections (R6) |
  | attendance_daily, attendance_day_allocations, leave_applications, overtime_records, leave_encashment_requests | Inputs |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/payroll-feed/generate | Generate period feed |
  | GET | /api/v1/atl/payroll-feed?payPeriod= | Retrieve |
  | GET | /api/v1/atl/payroll-feed/adjustments?payPeriod= | Retrieve adjustments |
  | POST | /api/v1/atl/payroll-feed/{id}/ack | M10 acknowledgement |
- **UI Behavior Notes:** Payroll reconciliation screen: per-employee feed table, totals, export + lock action, ack status; separate adjustments panel; discrepancy highlights.
- **Edge Cases:** Late regularisation after lock → adjustment; employee transferred mid-period (split across org units); encashment settled in different period; re-generation before lock (overwrite allowed); adjustment ack handshake.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PayrollFeedService`, `PeriodLockManager`, `FeedAdjustmentService`, `FeedReconciler` |
  | Backend Flow | Aggregate period inputs (allocations) → UPSERT feed (UNIQUE period/employee) → export → lock; post-lock corrections → INSERT feed_adjustment in next period; on ack mark ACKED |
  | Data Operations | UPSERT feed; INSERT adjustments; status transitions |
  | Validation | Period not double-locked; reconciliation; adjustment-only-after-lock |
  | Authorization | System generate; payroll read/ack |
  | State Changes & Side Effects | PENDING→EXPORTED→ACKED/FAILED; is_locked set; adjustments emitted |
  | Failure Handling | `PERIOD_ALREADY_LOCKED` 409; `LOCKED_PERIOD_ADJUSTMENT_EMITTED` 200(info); `M10_ACK_TIMEOUT` retry |
  | Dependencies | FR-04/05/06/12/16, M10 |
  | Test Guidance | Aggregation from allocations; lock guard; adjustment routing; ack handshake; reconciliation invariant |

---

### FR-18 — Mobile/Web Self-Service Surface & Notification Triggers
- **Module:** Integration / Self-Service
- **Primary Role(s):** Employee, Manager
- **User Story:** As an employee, I want a mobile and web self-service surface to punch, apply for leave, check balances and forecasts, and receive timely notifications about my requests.
- **Description:** Unified self-service surface (web + mobile) exposing punch (with consent/fallback), leave apply/cancel, balance & ledger & **what-if forecast (FR-23)**, comp-off wallet, team calendar (managers), approvals inbox (with **delegation**), and consent management; every lifecycle event triggers a `notifications` entry.
- **Acceptance Criteria:**
  1. Employee can punch, apply/cancel leave, view balance/ledger/forecast, and view request status from mobile and web.
  2. Manager can approve/reject from the inbox on mobile and web; delegated items are clearly labelled.
  3. Each state transition (submitted, recommended, approved, rejected, cancelled, low-balance, accrual-credited, comp-off-expiring, regularisation-decided, **anomaly-flagged, delegation-active, return-to-work-due**) emits a notification.
  4. Notifications respect user channel preferences and are recorded in `notifications`.
  5. Surface is WCAG 2.1 AA compliant and responsive.
- **Business Rules:** Notifications async, non-blocking, retried; sensitive details minimised in push payloads (deep-link); escalation reminder + auto-delegation if an approval task is pending beyond SLA (FR-19).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | notifications | Outbound ledger |
  | leave_applications, attendance_punches, comp_off_ledger, regularisation_requests, approval_delegations, punch_anomaly_reviews | Event sources |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/self-service/summary | Dashboard data |
  | GET | /api/v1/atl/approvals/inbox | Pending approvals (incl. delegated) |
  | GET | /api/v1/atl/notifications?status= | Notifications |
- **UI Behavior Notes:** Mobile-first dashboard: balance cards, what-if forecast, quick-punch, apply-leave CTA, pending-approvals badge; in-app notification center; deep links; consent/fallback management.
- **Edge Cases:** Offline mobile (queued actions); duplicate notification suppression; channel preference off (in-app fallback); SLA escalation to delegate/next approver.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SelfServiceController`, `ApprovalInboxService`, `NotificationProducer`, React PWA |
  | Backend Flow | Aggregate self-service data; on each transition publish notification event → shared platform delivers |
  | Data Operations | INSERT notifications; read aggregations |
  | Validation | Auth (self/manager scope), channel prefs |
  | Authorization | Employee self; manager team + delegated |
  | State Changes & Side Effects | notification records; SLA escalation/delegation tasks |
  | Failure Handling | `NOTIFY_DELIVERY_FAILED` async-retry; degrade to in-app |
  | Dependencies | All FRs; FR-19; shared notifications/workflow |
  | Test Guidance | Event→notification mapping; offline queue; escalation/delegation; accessibility |

---

### FR-19 — Approval Delegation & Out-of-Office Routing *(v2 new — R11)*
- **Module:** Integration / Workflow
- **Primary Role(s):** Manager/Approver (set), HR (administer)
- **User Story:** As a manager going on leave, I want to delegate my approval authority so leave/regularisation/OT requests for my team are not jammed while I am away.
- **Description:** Approvers (or HR on their behalf) define a delegation to another qualified approver for a date range and/or on SLA breach; the workflow engine auto-routes pending and incoming approval tasks to the delegate within scope.
- **Acceptance Criteria:**
  1. An approver can create a delegation with delegate, scope, request types, and date window.
  2. During an active delegation, new and pending approval tasks in scope route to the delegate.
  3. On SLA breach (if `auto_on_sla_breach`), the task auto-routes to the delegate even without a date-window delegation.
  4. A delegate who is the applicant is rejected (`DELEGATE_IS_APPLICANT`); no delegate available on a jammed queue raises `NO_DELEGATE_AVAILABLE` and escalates to HR.
  5. Delegations are revocable and auto-expire at `to_date`.
- **Business Rules:** Delegate must hold an approver role within scope; segregation of duties preserved (delegate ≠ applicant, maker ≠ checker); delegation recorded in `audit_log`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | approval_delegations | Delegation record |
  | workflow_tasks | Re-routing target |
  | users | Delegator/delegate |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/delegations | Create delegation |
  | POST | /api/v1/atl/delegations/{id}/revoke | Revoke |
  | GET | /api/v1/atl/delegations?delegatorId= | List |
- **UI Behavior Notes:** "Out of office / delegate approvals" panel with delegate picker, scope, dates; inbox shows delegated items with origin badge.
- **Edge Cases:** Overlapping delegations; delegate also absent (chained/escalation to HR); delegation during pending tasks; revocation mid-window.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `DelegationService`, `WorkflowRouter`, `SlaEscalationJob` |
  | Backend Flow | On task creation/SLA tick → resolve active delegation in scope → reassign task to delegate (or escalate to HR) → notify |
  | Data Operations | INSERT/UPDATE delegation; UPDATE workflow_task assignee |
  | Validation | Delegate role, scope, delegate≠applicant, window |
  | Authorization | Self/HR set; system route |
  | State Changes & Side Effects | task reassignment; notifications to delegate |
  | Failure Handling | `DELEGATE_IS_APPLICANT` 422; `NO_DELEGATE_AVAILABLE` 409 |
  | Dependencies | FR-12/05/06; shared workflow |
  | Test Guidance | Window routing; SLA auto-route; SoD guard; escalation when no delegate |

---

### FR-20 — Time-Fraud & Punch Anomaly Detection & Review *(v2 new — R10)*
- **Module:** Integration / Governance
- **Primary Role(s):** System (detect), Anomaly Reviewer/HR (review)
- **User Story:** As HR/Security, I want suspicious punches automatically flagged and reviewed so buddy-punching and spoofing do not corrupt attendance or payroll.
- **Description:** Screen each accepted punch (FR-03) for anomalies — impossible travel between consecutive punches, duplicate same-second punches, geo mismatch, low liveness, device-binding mismatch — and open a `punch_anomaly_reviews` case for reviewer disposition before the punch contributes to a locked payroll feed.
- **Acceptance Criteria:**
  1. Punches matching anomaly rules are stored `FLAGGED_FOR_REVIEW` and a review case is opened.
  2. A reviewer (≠ punch owner) can confirm valid, confirm fraud, or escalate.
  3. `CONFIRMED_FRAUD` excludes the punch from attendance computation and notifies HR/Security.
  4. `CONFIRMED_VALID` releases the punch for normal FR-04 processing.
  5. Anomaly cases unresolved before period lock are surfaced in the payroll reconciliation screen.
- **Business Rules:** Detection thresholds (`IMPOSSIBLE_TRAVEL` speed, liveness min) configurable via `module_config`; optional liveness/photo-on-punch enforced per device capability; device-to-employee binding checked for `EMPLOYEE_BOUND` devices.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | punch_anomaly_reviews | Review lifecycle |
  | attendance_punches | Flagged source |
  | attendance_devices | Binding/liveness capability |
  | workflow_instances | Review chain |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/anomalies?status= | List flagged punches |
  | POST | /api/v1/atl/anomalies/{id}/decision | Confirm valid/fraud/escalate |
- **UI Behavior Notes:** Anomaly review queue with punch detail, map, photo, liveness score, consecutive-punch travel calc; disposition actions; SoD lock preventing self-review.
- **Edge Cases:** False-positive impossible-travel across adjacent geofences; device clock skew causing duplicate-second; liveness failure on poor lighting; reviewer = owner blocked.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AnomalyScreener`, `AnomalyReviewService`, `WorkflowEngineAdapter` |
  | Backend Flow | On punch ingest screen → if anomaly INSERT review + flag punch → reviewer disposition → release/exclude → notify |
  | Data Operations | INSERT anomaly_review; UPDATE review status (punch append-only) |
  | Validation | Reviewer≠owner, threshold config |
  | Authorization | Reviewer/HR; auditor/DPO read |
  | State Changes & Side Effects | OPEN→CONFIRMED_VALID/CONFIRMED_FRAUD/ESCALATED; FR-04 inclusion/exclusion |
  | Failure Handling | `ANOMALY_REVIEW_REQUIRED` 202; self-review blocked 403 |
  | Dependencies | FR-03, FR-04, FR-17 |
  | Test Guidance | Each anomaly rule; SoD; valid/fraud disposition effect on attendance; pre-lock surfacing |

---

### FR-21 — DPDP Biometric/Geo Consent, Lawful Basis & Non-Biometric Fallback *(v2 new — R9)*
- **Module:** Governance / Privacy
- **Primary Role(s):** Employee (consent), HR/DPO (govern), SysAdmin (config)
- **User Story:** As a data principal and as a government data fiduciary, we want biometric/geo capture to have a recorded lawful basis, captured consent, a non-biometric fallback, and an explicit retention/purge schedule, so attendance is DPDP-Act-2023 compliant.
- **Description:** Record per-employee lawful basis (statutory duty / consent / contract), capture consent for biometric/geo/photo, provide an alternative `fallback_method` (RFID/manual/OTP) for non-enrolled or refusing employees, declare biometric-template storage location, and enforce a retention/purge schedule for punches/geo/leave records.
- **Acceptance Criteria:**
  1. Each employee has a `biometric_consents` record with a lawful basis before biometric/geo capture is permitted.
  2. Consent can be granted or withdrawn; withdrawal engages the `fallback_method` for future punches.
  3. A biometric/geo punch without a valid governing basis is rejected with `CONSENT_REQUIRED` and the employee is offered fallback.
  4. Biometric template storage location is declared per device (`template_storage`) and surfaced to the DPO.
  5. A retention/purge job removes biometric/geo/punch data past `retention_until` per the schedule (App. E); leave records retained per statutory schedule.
  6. DPO can audit lawful basis, consent status, and purge execution.
- **Business Rules:** Mandatory biometric attendance requires `STATUTORY_DUTY` or explicit `CONSENT`; non-enrolled employees must always have a working fallback; geo minimised and purpose-bound; no PII in push payloads.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | biometric_consents | Consent/lawful basis/fallback/retention |
  | attendance_devices | Template storage declaration |
  | attendance_punches | Consent linkage; purge target |
  | documents | Signed consent artefact |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | /api/v1/atl/consents | Grant/record consent |
  | POST | /api/v1/atl/consents/{id}/withdraw | Withdraw consent |
  | GET | /api/v1/atl/consents?employeeId= | View governance status |
  | POST | /api/v1/atl/retention/purge-run | Execute purge (HR/DPO) |
- **UI Behavior Notes:** Consent management screen (lawful basis, capture types, fallback election, signed-consent upload); DPO governance dashboard (consent coverage, template-storage map, purge log).
- **Edge Cases:** Employee refuses biometric (fallback mandatory); consent withdrawn mid-day; device storing templates server-side requiring encryption; purge of records still under legal hold; statutory-duty basis overriding consent withdrawal for mandatory attendance.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ConsentService`, `LawfulBasisResolver`, `FallbackEnroller`, `RetentionPurgeJob` |
  | Backend Flow | Resolve lawful basis at punch (FR-03 gate) → enforce consent/fallback → schedule retention → purge past `retention_until` |
  | Data Operations | INSERT/UPDATE consent; DELETE/anonymise expired biometric/geo data |
  | Validation | Basis present, fallback availability, legal-hold guard |
  | Authorization | Self consent; HR/DPO govern |
  | State Changes & Side Effects | consent GRANTED/WITHDRAWN; punch gating; purge execution audited |
  | Failure Handling | `CONSENT_REQUIRED` 403; `FALLBACK_UNAVAILABLE` 409; `PURGE_BLOCKED_LEGAL_HOLD` 409 |
  | Dependencies | FR-03, M13 documents, audit_log |
  | Test Guidance | Basis gating; withdrawal→fallback; purge schedule; legal-hold guard; DPO audit |

---

### FR-22 — Leave Entitlement Counters for Sanction-Based Leave *(v2 new — R7, R14)*
- **Module:** Leave Management
- **Primary Role(s):** System/HR (maintain), Employee (consume via FR-12)
- **User Story:** As HR, I want sanction-based leave (Maternity, Paternity, CCL, Study, Sabbatical, LWP) governed by career/event quotas and eligibility predicates rather than a phantom accruable balance, so statutory limits are enforced cleanly.
- **Description:** Maintain `leave_entitlements` counters (career/event/annual quota, consumed, remaining) and eligibility predicates (surviving children, child age, gender) for sanction-based types; FR-12 validates against these instead of a positive balance, while the ledger still records informational `AVAIL` entries — removing the `is_accruable=false` + negative-balance special case.
- **Acceptance Criteria:**
  1. Each sanction-based type has an entitlement counter per employee (career quota e.g. CCL 730, event cap e.g. Maternity 180).
  2. Applying consumes `remaining_days`; exceeding raises `ENTITLEMENT_EXCEEDED`.
  3. **(v2/R14)** Eligibility predicates (e.g. ≤2 surviving children for CCL/Maternity, child age ≤18/22-if-disabled) are checked against `employee_dependents`; failure raises `INELIGIBLE_DEPENDENT`.
  4. The leave ledger records an informational `AVAIL` entry for traceability without a negative-balance exception.
  5. Counters are auditable and adjustable via maker-checker.
- **Business Rules:** Career quotas persist across leave years; event quotas reset per qualifying event; eligibility predicate stored as JSONB and evaluated at apply-time; LWP tracked for service/pay impact.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | leave_entitlements | Quota/eligibility counter |
  | employee_dependents | Eligibility source (R14) |
  | leave_balance_ledger | Informational AVAIL |
  | leave_types | `is_sanction_based` link |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/entitlements?employeeId= | View counters |
  | POST | /api/v1/atl/entitlements/adjust | Maker-checker adjustment |
- **UI Behavior Notes:** Entitlement panel showing quota/consumed/remaining and eligibility status; apply wizard surfaces remaining quota and eligibility check for sanction types.
- **Edge Cases:** Child crossing age cap mid-application; additional surviving child changing eligibility; career quota near exhaustion; event window expiry; disabled-child extended cap.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `EntitlementService`, `EligibilityEvaluator`, `LeaveLedgerService` |
  | Backend Flow | On sanction apply → evaluate predicate vs dependents → check remaining → reserve/consume counter → ledger informational AVAIL |
  | Data Operations | UPDATE entitlement consumed/remaining; INSERT ledger AVAIL |
  | Validation | Quota, predicate, gender, window |
  | Authorization | System/HR maintain; self consume |
  | State Changes & Side Effects | counter decrement; ledger record |
  | Failure Handling | `ENTITLEMENT_EXCEEDED` 409; `INELIGIBLE_DEPENDENT` 422 |
  | Dependencies | FR-10/12, E29 dependents |
  | Test Guidance | Quota enforcement; predicate eval (children/age/disabled); informational ledger; no negative-balance path |

---

### FR-23 — Best-in-Class Absence Features (Forecast, Mass-Leave, Blackout, Return-to-Work) *(v2 new — Proponent)*
- **Module:** Leave Management / Self-Service
- **Primary Role(s):** Employee (forecast), HR (mass-leave/blackout/return-to-work)
- **User Story:** As an organisation, we want modern absence capabilities — balance what-if forecasting, organisation-wide shutdown/mass-leave, leave blackout/freeze windows, and a return-to-work workflow after long medical leave — to match best-in-class HCM suites.
- **Description:** (a) **What-if forecast:** project a leave balance to a future date factoring scheduled accruals, approved future leave, and lapse. (b) **Mass-leave/shutdown:** HR applies a leave/holiday to an org-unit cohort in one action (e.g. office shutdown). (c) **Blackout/freeze:** configure windows (via `module_config`) where specified leave types are blocked. (d) **Return-to-work:** after long medical leave, require a fitness/return-to-work clearance before attendance resumes.
- **Acceptance Criteria:**
  1. Employee can request a balance forecast for a future date; the projection shows accruals, committed leave, and lapse risk.
  2. HR can execute a mass-leave/shutdown for a cohort, creating per-employee applications/holidays atomically with a summary report.
  3. Applications for blocked types in an active blackout window are rejected with `BLACKOUT_PERIOD`.
  4. Long-medical leave (configured types) sets `return_to_work_status=PENDING`; attendance for post-leave days is gated until `CLEARED` with a fitness certificate (M13).
  5. All four features respect RBAC, org-unit scope, and audit.
- **Business Rules:** Forecast is read-only and uses the same accrual/rounding engine (FR-11); mass-leave honours per-employee balance/entitlement (skips ineligible with a report); blackout windows are scoped and effective-dated; return-to-work clearance routed via workflow.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | module_config | Blackout/mass-leave/forecast config |
  | leave_applications | Mass-leave + return-to-work status |
  | leave_balances, leave_balance_ledger | Forecast source |
  | documents | Fitness certificate |
  | workflow_instances | Return-to-work approval |
- **API References:**
  | Method | Path | Purpose |
  |---|---|---|
  | GET | /api/v1/atl/leave-balances/forecast?employeeId=&asOf= | What-if forecast |
  | POST | /api/v1/atl/mass-leave | Org-wide shutdown/mass apply |
  | POST | /api/v1/atl/leave-applications/{id}/return-to-work | Clear RTW |
- **UI Behavior Notes:** Forecast slider/date-picker with projected balance chart; mass-leave console with cohort selector, type, dates and dry-run summary; blackout config in policy admin; return-to-work task in HR inbox with certificate upload.
- **Edge Cases:** Forecast across year-close boundary; mass-leave with some ineligible employees (partial apply + report); overlapping blackout windows; return-to-work overdue; forecast vs reserved balance.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `BalanceForecastService`, `MassLeaveService`, `BlackoutValidator`, `ReturnToWorkService` |
  | Backend Flow | Forecast: replay accrual/lapse to asOf (read-only). Mass-leave: cohort resolve → per-employee FR-12 (txn, skip ineligible) → report. Blackout: FR-12 validation gate. RTW: workflow → CLEARED → enable attendance |
  | Data Operations | Read-only forecast; INSERT cohort applications; UPDATE return_to_work_status |
  | Validation | Scope, eligibility, blackout window, RTW certificate |
  | Authorization | Self forecast; HR mass-leave/RTW; HR Admin blackout |
  | State Changes & Side Effects | cohort applications APPROVED; RTW PENDING→CLEARED |
  | Failure Handling | `BLACKOUT_PERIOD` 409; `RETURN_TO_WORK_PENDING` 409 |
  | Dependencies | FR-11/12/15, M13 |
  | Test Guidance | Forecast accuracy vs engine; mass-leave partial apply; blackout block; RTW gating |

---

## 7. UI Requirements

### 7.1 Key screens
| Screen | Primary role | Purpose | Key states |
|---|---|---|---|
| Self-Service Dashboard | Employee | Balances, forecast, quick-punch, apply CTA, status | empty/loading/error/success |
| Apply-Leave Wizard | Employee | Type→dates(half/full)→sandwich/reserve preview→document→submit | validation/insufficient-balance/conflict/blackout |
| Leave Ledger Statement | Employee/HR | Immutable balance history, downloadable | empty/loaded |
| Balance Forecast | Employee | What-if projection to a future date | loading/projected |
| Attendance Grid (monthly) | Employee/Manager | Color-coded daily status + sub-day allocations, drill to punches | loading/empty |
| Regularisation Form | Employee | Correct missed punch | window-expired/cap-exceeded/locked-period |
| Approvals Inbox | Manager | Approve/reject/recommend (incl. delegated) | empty/pending/overdue/delegated |
| Team Leave Calendar | Manager | Team absences + conflict heat | empty/loading |
| Comp-Off Wallet | Employee | Credits with expiry countdown, redeem | empty/expiring |
| Consent & Fallback | Employee/DPO | Manage biometric/geo consent & fallback | granted/withdrawn |
| Anomaly Review Queue | Reviewer/HR | Disposition flagged punches | empty/open/resolved |
| Delegation Panel | Manager/HR | Out-of-office delegate setup | active/expired |
| Shift & Roster Planner | HR | Define shifts, assign rosters | overlap-warning/locked-period |
| Holiday Calendar Admin | HR | Manage calendars/holidays, RH election | duplicate-warning |
| Leave-Type & Policy Builder | HR Admin | Configure types/policies (commuted/sandwich/rounding) | overlap-warning |
| Mass-Leave Console | HR | Shutdown/mass-leave cohort apply | dry-run/applied |
| Year-Close Console | HR Admin | Simulate→report→commit | simulated/committed |
| Payroll Reconciliation | Payroll | Period feed, adjustments, export, lock, ack | locked/exported/failed |

### 7.2 Cross-cutting UI rules
- Mobile-first, responsive; collapsible sidebar with hamburger; dark-mode support.
- Every screen implements empty/loading/error/success/permission states (no skeleton-only UI).
- Dates `DD-MMM-YYYY`; balances with one-decimal precision; INR with locale formatting.
- WCAG 2.1 AA: keyboard navigation, focus order, contrast, ARIA on calendars/grids.
- Toasts for action results; modals for destructive (cancel, year-close commit, mass-leave, purge) with explicit confirmation.
- All list/grid views paginated (max 100) with filters and CSV export where applicable.
- i18n-ready (English + regional language); no hardcoded strings.

---

## 8. API & Integration

### 8.1 Conventions
Base path `/api/v1/atl`. JWT bearer auth; RBAC + org-unit scope enforced server-side. All lists paginated (`?page=&limit=` max 100 or cursor). Idempotency-Key header supported on POST mutation endpoints. Optimistic concurrency via `If-Match`/`version` on balance-affecting writes.

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
| CONSENT_REQUIRED | 403 | Biometric/geo capture lacks lawful basis/consent *(R9)* |
| FALLBACK_UNAVAILABLE | 409 | No non-biometric fallback configured *(R9)* |
| PURGE_BLOCKED_LEGAL_HOLD | 409 | Retention purge blocked by legal hold *(R9)* |
| ANOMALY_REVIEW_REQUIRED | 202 | Punch flagged for anomaly review *(R10)* |
| PROCESSING_ERROR | 500 | Attendance processing failure |
| ALLOCATION_EXCEEDS_DAY | 422 | Sub-day allocations exceed 1.0 *(R2)* |
| PERIOD_LOCKED | 409 | Payroll period locked |
| LOCKED_PERIOD_ADJUSTMENT_EMITTED | 200 | Correction routed to next-period adjustment *(R6)* |
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
| COMMUTED_REQUIRES_HPL | 422 | Commuted debit target/HPL insufficient *(R4)* |
| ACCRUAL_ALREADY_RUN | 409 | Accrual cycle already executed |
| LEDGER_RECON_MISMATCH | 500 | Balance/ledger reconciliation failure |
| OPTIMISTIC_LOCK_CONFLICT | 409 | Concurrent balance write/version conflict *(R1)* |
| INSUFFICIENT_BALANCE | 409 | Available leave balance too low |
| ENTITLEMENT_EXCEEDED | 409 | Sanction-leave quota exceeded *(R7)* |
| INELIGIBLE_DEPENDENT | 422 | Dependent eligibility failed (CCL/Maternity) *(R14)* |
| LEAVE_OVERLAP | 409 | Leave double-booking |
| DAY_UNITS_MISMATCH | 422 | SUM(day_units) ≠ total_days *(R18)* |
| BLACKOUT_PERIOD | 409 | Leave blocked in blackout/freeze window *(Proponent)* |
| ELIGIBILITY_FAILED | 422 | Gender/cadre/document eligibility failed |
| ADVANCE_CLAWBACK_REQUIRED | 409 | Unearned advance leave on exit *(R19)* |
| SR_POSTING_FAILED | 502 | Digital SR posting failed (async retry) |
| CANNOT_CANCEL_PAST | 422 | Past/availed leave cannot be cancelled |
| BACKDATE_WINDOW_EXCEEDED | 422 | Backdated leave outside window |
| YEAR_ALREADY_CLOSED | 409 | Leave year already closed |
| PENDING_LEAVE_BLOCKS_CLOSE | 409 | Open application spans year boundary |
| ENCASHMENT_CAP_EXCEEDED | 409 | Encashment over cap |
| NOT_ENCASHABLE | 422 | Leave type not encashable |
| LTC_BLOCK_EXHAUSTED | 409 | LTC block/career encashment cap exceeded *(R12)* |
| PERIOD_ALREADY_LOCKED | 409 | Payroll period already locked |
| DELEGATE_IS_APPLICANT | 422 | Delegate equals applicant *(R11)* |
| NO_DELEGATE_AVAILABLE | 409 | No delegate for jammed approval queue *(R11)* |
| RETURN_TO_WORK_PENDING | 409 | Attendance gated pending RTW clearance *(Proponent)* |

### 8.4 Endpoint examples

**1) Apply leave (with reservation + sandwich)** — `POST /api/v1/atl/leave-applications`
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
  "ledgerDebitUnits": 2.5,
  "reservationId": "res-77a1-...",
  "srPostingStatus": "NOT_REQUIRED",
  "balancePreview": { "leaveCode": "EL", "before": 130.0, "reserved": 2.5, "available": 127.5, "sandwichCountedDays": 0 },
  "requestId": "req-1a2b3c"
}
```

**2) Insufficient available balance** — same endpoint, error
```json
// 409 Conflict
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Available EL balance 1.5 (after reservations) is less than requested 2.5.", "field": "days" }, "requestId": "req-4d5e6f" }
```

**3) Approve leave (atomic, version-checked)** — `POST /api/v1/atl/leave-applications/{id}/decision`
```json
// Request
{ "decision": "APPROVE", "comment": "Approved.", "expectedVersion": 7 }
// 200 OK
{
  "applicationId": "aaaa1111-...",
  "status": "APPROVED",
  "ledgerEntryId": "led-9988-...",
  "balanceAfter": 127.5,
  "reservationStatus": "CONSUMED",
  "attendanceRecomputeEnqueued": true,
  "srPostingStatus": "PENDING",
  "requestId": "req-7g8h9i"
}
// 409 Conflict (concurrent stale write)
{ "error": { "code": "OPTIMISTIC_LOCK_CONFLICT", "message": "Balance changed since read; retry.", "field": "version" }, "requestId": "req-7g8h9z" }
```

**4) Mobile geo punch (consent + anomaly)** — `POST /api/v1/atl/punches/mobile`
```json
// Request
{ "punchTime": "2026-06-30T03:32:00Z", "geoLat": 17.385044, "geoLong": 78.486671, "sourceRef": "mob-2026063009021", "photoDocumentId": "doc-self-1", "livenessScore": 0.94 }
// 201 Created
{ "punchId": "pch-2233-...", "ingestionStatus": "ACCEPTED", "attendanceDate": "2026-06-30", "punchDirection": "IN", "requestId": "req-aj0k1l" }
// 202 Accepted (flagged)
{ "punchId": "pch-2234-...", "ingestionStatus": "FLAGGED_FOR_REVIEW", "anomalyFlags": ["IMPOSSIBLE_TRAVEL"], "reviewId": "rev-91", "requestId": "req-aj0k1m" }
// 403 (no consent / no fallback)
{ "error": { "code": "CONSENT_REQUIRED", "message": "No active lawful basis for biometric capture; configure fallback.", "field": "capture" }, "requestId": "req-zz9" }
```

**5) Leave balance/ledger** — `GET /api/v1/atl/leave-ledger?employeeId=...&leaveTypeId=...&leaveYear=2026`
```json
// 200 OK
{
  "employeeId": "emp-1001", "leaveCode": "EL", "leaveYear": 2026,
  "currentBalance": 127.5, "reserved": 0.0, "availableBalance": 127.5, "version": 8,
  "entries": [
    { "ledgerEntryId": "led-1", "entryType": "OPENING", "amount": 120.0, "balanceAfter": 120.0, "effectiveDate": "2026-01-01" },
    { "ledgerEntryId": "led-2", "entryType": "ACCRUAL", "amount": 15.0, "balanceAfter": 135.0, "effectiveDate": "2026-01-01" },
    { "ledgerEntryId": "led-3", "entryType": "AVAIL", "amount": -7.5, "balanceAfter": 127.5, "effectiveDate": "2026-06-29", "sourceRefType": "LEAVE_APPLICATION" }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 3 },
  "requestId": "req-led-1"
}
```

**6) Balance forecast (what-if)** — `GET /api/v1/atl/leave-balances/forecast?employeeId=...&leaveTypeId=...&asOf=2026-12-31`
```json
// 200 OK
{
  "leaveCode": "EL", "asOf": "2026-12-31",
  "currentBalance": 127.5,
  "projectedAccruals": 15.0,
  "committedFutureLeave": -10.0,
  "projectedLapse": -2.5,
  "projectedBalance": 130.0,
  "requestId": "req-fc-1"
}
```

### 8.5 Integration contracts
| Integration | Direction | Mechanism | Notes |
|---|---|---|---|
| Digital SR (M04→M12) | Outbound | Async event/queue on leave approval & cancellation | `sr_posting_status` PENDING/POSTED/FAILED; idempotent by application_id; retry with backoff |
| Payroll (M10) | Outbound | Period feed + adjustments + ack handshake | Period lock after export; corrections via `payroll_feed_adjustments` next period (R6) |
| Pension/Terminal benefits (M11) | Bidirectional | Retirement encashment-eligible balance (EL+HPL make-up) | M11 requests eligible balance; M03 supplies + debits on settlement (R5) |
| Document store (M13) | Outbound | Document reference IDs | Medical certs, tour orders, punch photos, fitness certs, consent artefacts |
| Notifications | Outbound | Shared platform | Per-event triggers, channel prefs |
| Employee master (M01) | Inbound | Read API/replica | Golden source; dependents (E29); soft-deleted blocks new applications |

---

## 9. Non-Functional Requirements
| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; punch ingest throughput ≥ 500 events/s (incl. anomaly screen); nightly attendance processing of 50k employees < 30 min; team-calendar render < 1s; balance-debit lock contention < 1% retries. |
| Scalability | Horizontal scaling of API and batch workers; partition ledgers by leave_year; device ingest queue-buffered. |
| Availability | 99.9% uptime; degraded-mode read of balances if batch workers down. |
| Reliability | RPO ≤ 15 min, RTO ≤ 4h; idempotent ingestion, accrual, and feed generation; at-least-once SR posting with dedupe; **lost-update race prevented by optimistic lock (R1)**. |
| Security | OIDC/SSO + MFA; RBAC + org-unit row-level scoping; device API keys hashed; device-to-employee binding; OWASP ASVS; TLS 1.2+; encryption at rest; no PII in push payloads; full audit trail. |
| Privacy (DPDP) | DPDP-Act-2023 alignment; **recorded lawful basis + consent for biometric/geo (R9)**; biometric templates stored per declared `template_storage` and encrypted if server-side; geo minimised & purpose-bound; medical/fitness certs access-restricted (M13); **explicit retention & purge schedule (App. E)**; non-biometric fallback for all. |
| Anti-fraud | Liveness/photo-on-punch option; impossible-travel/duplicate-second/geo-mismatch/binding anomaly detection; mandatory review before locked-period contribution (R10). |
| Auditability | Immutable `audit_log` + append-only ledgers; before/after captured on regularisation/adjustment/cancellation; reservation, consent, anomaly, and delegation actions audited. |
| Accessibility | WCAG 2.1 AA across web/mobile. |
| Observability | Structured logs with requestId; metrics on ingest lag, processing duration, reconciliation status, SR-posting backlog, feed ack latency, **reservation leak, lock-conflict rate, anomaly backlog, consent coverage**; alerts on `LEDGER_RECON_MISMATCH`, SR/feed failures, **and unresolved anomalies before lock**. |
| Localisation | UTC storage; per-shift `display_timezone` for date bucketing (IST default; multi-TZ ready — DST explicitly revisitable, App. B); i18n strings; INR money formatting. |
| Maintainability | Configurable policies/enums/thresholds via `module_config` and versioned policies; no hardcoded statutory constants. |

---
## 10. Workflow & State Diagrams

### 10.1 Leave application state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | save draft | DRAFT | — |
| DRAFT | submit | SUBMITTED | create `leave_reservations` hold; reserved netted into available; notify approver |
| SUBMITTED | recommend | RECOMMENDED | manager recommends (multi-step chains); delegate-aware |
| SUBMITTED/RECOMMENDED | approve | APPROVED | txn: lock balance (FOR UPDATE+version) → consume reservation → ledger debit → recompute enqueue → SR enqueue → notify |
| SUBMITTED/RECOMMENDED | reject | REJECTED | release reservation (RELEASED); notify |
| SUBMITTED | withdraw | WITHDRAWN | release reservation |
| SUBMITTED | reservation TTL expiry | DRAFT/expired | auto-release reservation (R1) |
| APPROVED | cancel (future) | CANCELLED | AVAIL_REVERSAL credit; SR reversal; recompute enqueue; feed adjustment if locked |

### 10.2 Regularisation state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | notify manager/delegate |
| SUBMITTED | approve | APPROVED | enqueue FR-04 recompute (is_regularised=true); feed adjustment if locked |
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
| SIMULATED | commit | COMMITTED | ledger CF/LAPSE/CONVERSION/OPENING + new balances (ordered) |
| DRAFT/SIMULATED | error | FAILED | rollback; alert |

### 10.5 Payroll feed state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| PENDING | export | EXPORTED | set is_locked=true |
| EXPORTED | M10 ack | ACKED | finalise |
| EXPORTED | ack-timeout | FAILED | retry |
| (locked) | late correction | adjustment PENDING | INSERT payroll_feed_adjustments next period (R6) |

### 10.6 Approval routing matrix (delegation-aware, R11)
| Leave/request type | Step 1 | Step 2 | Step 3 | Delegation/Escalation |
|---|---|---|---|---|
| CL / Comp-off | Reporting Manager | — | — | Active delegate or SLA-escalate |
| EL / HPL | Reporting Manager | HR Officer | — | Active delegate or SLA-escalate |
| Maternity / Paternity / CCL / Medical | Reporting Manager | HR Officer | Sanctioning Authority | Entitlement+dependent check (FR-22); delegate-aware |
| Commuted / Study / Sabbatical / LWP | Reporting Manager | HR Officer | Sanctioning Authority | Commuted→HPL debit; delegate-aware |
| Regularisation / OT / WFH / OD | Reporting Manager | (HR optional) | — | Delegate or SLA-escalate |
| Encashment (in-service / LTC) | HR Officer | Sanctioning Authority | — | LTC cap check (FR-16) |
| Encashment (retirement) | HR Officer | Sanctioning Authority | M11 settlement | EL+HPL make-up (R5) |
| Punch anomaly | Anomaly Reviewer | (escalate) HR/Security | — | Reviewer ≠ owner (R10) |
| Return-to-work | HR Officer | — | — | Fitness certificate required |

### 10.7 Punch anomaly review state table (R10)
| Current | Event | Next | Side effect |
|---|---|---|---|
| (flagged) | open | OPEN | case created; punch excluded pending review |
| OPEN | confirm valid | CONFIRMED_VALID | release punch to FR-04 |
| OPEN | confirm fraud | CONFIRMED_FRAUD | exclude punch; notify HR/Security |
| OPEN | escalate | ESCALATED | route to HR/Security |

### 10.8 Consent state table (R9)
| Current | Event | Next | Side effect |
|---|---|---|---|
| (none) | record basis/consent | GRANTED / NOT_REQUIRED | enable biometric/geo capture |
| GRANTED | withdraw | WITHDRAWN | engage fallback_method for future punches |
| any | retention expiry | (purged) | biometric/geo data anonymised/deleted |

---

## 11. Notifications
| Event | Trigger FR | Recipients | Channels | Content (PII-minimised) |
|---|---|---|---|---|
| Leave submitted | FR-12 | Approver/delegate | in-app, email, push | Applicant name, type, dates, deep-link |
| Leave approved/rejected | FR-12 | Applicant | in-app, email, push | Decision, dates, balance after |
| Leave cancelled | FR-13 | Applicant, approver | in-app, email | Cancelled days, credited-back |
| Approval pending > SLA | FR-18/19 | Approver, then delegate/escalation | push, email | Reminder + deep-link |
| Delegation active | FR-19 | Delegate | in-app, email | Scope, dates |
| Low balance warning | FR-11/12 | Employee | in-app | Type, remaining/available balance |
| Accrual credited | FR-11 | Employee | in-app | Type, credited units, new balance |
| Comp-off expiring (T-7) | FR-09 | Employee | in-app, push | Days expiring, expiry date |
| Regularisation decided | FR-05 | Employee | in-app, email | Day, decision |
| OT approved | FR-06 | Employee | in-app | Minutes, treatment |
| Absent today | FR-04 | Employee, manager | in-app | Date flagged |
| Punch anomaly flagged | FR-20 | Reviewer, HR/Security | in-app, email | Anomaly type, deep-link (no biometric data) |
| Consent withdrawn / fallback engaged | FR-21 | Employee, DPO | in-app | Capture type, fallback method |
| Return-to-work due | FR-23 | Employee, HR | in-app, email | Clearance required before resuming |
| SR posting failed | FR-12 | HR Officer | in-app, email | Application no, retry status |
| Payroll feed exported / adjustment | FR-17 | Payroll Officer | in-app | Period, totals, adjustment ref |
| Year-close committed | FR-15 | HR Admin | in-app, email | Scope, carried/lapsed totals |

All notifications recorded in shared `notifications`; respect channel preferences; async with retry; in-app fallback.

---

## 12. Reporting & Analytics
| Report | Audience | Contents |
|---|---|---|
| Monthly Attendance Register | HR/Manager | Per-employee daily status grid (with sub-day allocations), present/absent/leave totals |
| Leave Balance Statement | Employee/HR | Per-type opening/accrued/availed/reserved/encashed/lapsed/current |
| Leave Ledger Export | Auditor/HR | Immutable entry-level history |
| Leave Utilisation Analytics | HR/Mgmt | Leave taken by type/department/period; trends |
| Absenteeism & LWP Report | HR/Payroll | LWP days, chronic absenteeism flags |
| Overtime & Comp-Off Report | HR/Payroll | OT minutes, paid vs comp-off, expiry exposure |
| Team Leave Calendar Export | Manager | Absences and conflicts |
| Year-Close Reconciliation | HR Admin/Auditor | Carried/lapsed/converted per employee |
| Statutory Leave Posting Status | SR Custodian/HR | SR posting success/failure per application |
| Encashment Liability Report | HR/Finance | Outstanding encashable balance valuation (EL+HPL retirement exposure) |
| Anomaly & Fraud Review Report | HR/Security/Auditor | Flagged punches, dispositions, fraud confirmations |
| Consent & Retention Compliance Report | DPO/Auditor | Consent coverage, lawful-basis map, purge execution log |
| Entitlement Utilisation Report | HR | Sanction-leave quota/consumed/remaining per employee |

All reports: org-unit scoped, paginated, CSV/PDF export, scheduled-email option; aggregate feeds surfaced to M14-DAS. No PII beyond role entitlement; biometric/geo never exported.

---

## 13. Migration & Launch

### 13.1 Data migration
| Step | Source | Target | Validation |
|---|---|---|---|
| Leave types & policies | Legacy registers / rules | leave_types, leave_accrual_policies | Statutory caps, commuted-link, sandwich/year-basis verified |
| Sanction entitlements | Service records | leave_entitlements | Career/event quotas + dependents reconciled |
| Opening leave balances | Legacy ledgers/spreadsheets | leave_balance_ledger (OPENING) + leave_balances (version 0) | Reconciliation = 0 mismatch |
| Holiday calendars | Office circulars | holiday_calendars/holidays | Per-location completeness |
| Roster/shift assignments | HR records | shifts/rosters | No overlaps; date-anchor set |
| Devices & consent | IT inventory / HR | attendance_devices, biometric_consents | Geofence/binding/template-storage + lawful basis recorded |
| Module config | Legacy parameters | module_config | All Appendix-C tunables migrated |
| Historical attendance (optional) | Biometric exports | attendance_punches/daily/allocations | Spot reconciliation |

### 13.2 Cutover & rollout
- Phased: configuration (types/policies/holidays/shifts/module_config) → entitlement + balance migration with reconciliation sign-off → device integration + consent capture → pilot org unit → org-wide.
- Parallel run for one leave cycle and one payroll cycle before decommissioning legacy.
- Go/No-Go gate: 0 reconciliation mismatches; SR posting and payroll feed (incl. adjustments) validated end-to-end; consent coverage ≥ 100% or fallback enrolled.

### 13.3 Rollback
- Migration executed in reversible batches; ledger OPENING entries tagged with migration run id for clean reversal; feature flags per FR.

### 13.4 Launch readiness checklist
Balances + entitlements reconciled; policies signed off by HR/legal; commuted/sandwich/rounding configured; SR (M04) and payroll (M10) handshakes + adjustments tested; consent/lawful-basis + retention schedule signed off by DPO; anomaly review queue staffed; notifications verified; RBAC scopes validated; accessibility audit passed; runbooks and on-call in place.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Requirement → Entity → API traceability
| FR | Entities | Key APIs | Depends on |
|---|---|---|---|
| FR-01 | shifts, rosters, attendance_processing_runs, payroll_feed_adjustments | /shifts, /rosters | M01 |
| FR-02 | holiday_calendars, holidays, rh_elections | /holiday-calendars, /rh-elections | M01 |
| FR-03 | attendance_punches, attendance_devices, biometric_consents, punch_anomaly_reviews | /punches/* | FR-01/02/20/21 |
| FR-04 | attendance_daily, attendance_day_allocations, attendance_processing_runs | /attendance/process | FR-01,02,03,07,08,12 |
| FR-05 | regularisation_requests, attendance_processing_runs, payroll_feed_adjustments | /regularisations | FR-04, FR-17 |
| FR-06 | overtime_records, comp_off_ledger | /overtime | FR-03/04, FR-09 |
| FR-07 | attendance_exceptions, attendance_processing_runs | /exceptions | FR-04 |
| FR-08 | attendance_exceptions, documents, attendance_processing_runs | /exceptions | FR-04, M13 |
| FR-09 | comp_off_ledger | /comp-off/* | FR-06/08, FR-12 |
| FR-10 | leave_types, leave_accrual_policies, leave_entitlements | /leave-types, /leave-policies | M01 |
| FR-11 | leave_balance_ledger, leave_balances | /accrual/run, /leave-ledger | FR-10 |
| FR-12 | leave_applications, leave_application_days, leave_reservations, ledger, leave_entitlements, attendance_processing_runs | /leave-applications | FR-10/11/19/22/23, M04, M01 |
| FR-13 | leave_applications, leave_reservations, ledger, payroll_feed_adjustments | /withdraw, /cancel | FR-12, FR-04, M04 |
| FR-14 | leave_applications, attendance_exceptions, module_config | /team-calendar | FR-12, FR-07/08 |
| FR-15 | leave_year_close_runs, ledger, balances | /year-close/* | FR-10/11 |
| FR-16 | leave_encashment_requests, ledger, feed | /encashments | FR-11, M10, M11 |
| FR-17 | payroll_attendance_feed, payroll_feed_adjustments, attendance_day_allocations | /payroll-feed/* | FR-04/05/06/12/16, M10 |
| FR-18 | notifications | /self-service/*, /approvals/inbox | all FRs, FR-19 |
| FR-19 | approval_delegations, workflow_tasks | /delegations | FR-12; workflow |
| FR-20 | punch_anomaly_reviews, attendance_punches | /anomalies | FR-03/04 |
| FR-21 | biometric_consents, attendance_devices, attendance_punches | /consents, /retention/purge-run | FR-03, M13 |
| FR-22 | leave_entitlements, employee_dependents, ledger | /entitlements | FR-10/12, M01 |
| FR-23 | module_config, leave_applications, balances, documents | /forecast, /mass-leave, /return-to-work | FR-11/12/15, M13 |

### 14.2 Cross-module dependency register
| Dependency | Type | Direction | Risk / mitigation |
|---|---|---|---|
| M01-EPM employee master + dependents | Hard | Inbound read | Golden source; cache + soft-delete guard; E29 dependents (interim M03-owned) |
| M04-LSR → M12-SR posting | Hard | Outbound async | Retry/backoff; FAILED tracking + HR alert |
| M10-PAY payroll feed | Hard | Outbound | Period lock + next-period adjustments + ack handshake |
| M11-PEN retirement encashment | Medium | Bidirectional | EL+HPL make-up cap + settlement-on-ack |
| M13-DMS documents | Medium | Outbound ref | Reference-only; access-controlled (certs, photos, consent) |
| Notifications/Workflow platform | Hard | Outbound | Async, degrade to in-app; delegation routing |

### 14.3 Parallel-agent build plan
| Track | FRs | Can run in parallel with | Sequencing note |
|---|---|---|---|
| A: Config foundations | FR-01, FR-02, FR-10, **module_config** | B, D | Must precede C, E |
| B: Attendance capture & governance | FR-03, FR-04, **FR-20, FR-21** | A, D | FR-04 needs FR-01/02; FR-03 needs FR-21 consent |
| C: Leave core | FR-11, FR-12, **FR-22 (reservation/concurrency/entitlement)** | D | Needs FR-10; **R1/R2 resolved before parcelling** |
| D: Exceptions & OT | FR-06, FR-07, FR-08, FR-09 | A, B | FR-09 needs FR-12 for redemption |
| E: Corrections | FR-05, FR-13 | — | Need FR-04 / FR-12 |
| F: Periodic & integration | FR-14, FR-15, FR-16, FR-17, **FR-19** | — | Need core + capture complete |
| G: Self-service & best-in-class | FR-18, **FR-23** | last | Integrates all |

### 14.4 Final Reconciliation Table (honest — reflects v2 additions)
| Check | Status | Evidence |
|---|---|---|
| All 23 FRs have entities, APIs, LLD | RESOLVED | §6 each FR complete (FR-01…FR-23) |
| All 31 new entities have full field tables + sample rows | RESOLVED | §5.2, §5.7 |
| Shared entities referenced, not redefined | RESOLVED | §4, §5.4 |
| Every enum cataloged (incl. v2 enums) | RESOLVED | §5.5 |
| Soft-reserve has real persistence (R1) | RESOLVED | E21, §5.6 r11, FR-12, §10.1 |
| Concurrency control on balance debit (R1) | RESOLVED | E14 version, §5.6 r12, FR-11/12, error OPTIMISTIC_LOCK_CONFLICT |
| Sub-day allocation; status as rollup (R2) | RESOLVED | E22, FR-04, §5.6 r13, FR-17 present_units |
| Accrual rounding/proration + year-basis (R3) | RESOLVED | E12/E13 fields, FR-11, App. C |
| Commuted 2:1 modelled (R4) | RESOLVED | E12 debit_ratio, §5.6 r14, FR-10/12 |
| Retirement EL+HPL make-up (R5) | RESOLVED | FR-16, E12/E18 fields |
| Locked-period adjustment, not overwrite (R6) | RESOLVED | E23, FR-01/02/05/13/17, §5.6 r21 |
| Sanction entitlement counters (R7,R14) | RESOLVED | E24, E29, FR-22, §5.6 r15 |
| Dangling entities added (R8) | RESOLVED | E25 runs, E26 rh_elections, E27 module_config |
| Approver delegation (R11) | RESOLVED | E28, FR-19, §10.6 |
| DPDP biometric/geo consent + retention (R9) | RESOLVED | E30, FR-21, §9, App. E |
| Anti-fraud anomaly detection (R10) | RESOLVED | E31, FR-20, FR-03 fields |
| LTC fully specified (R12) | RESOLVED | FR-16, E18 ltc_block_ref, App. A |
| Sandwich rule per type + example (R13) | RESOLVED | E12 sandwich_rule, FR-12, §5.6 r16 |
| FR-04 sole writer of attendance (R15) | RESOLVED | FR-04/05/07/08/12 LLD, §5.6 r17 |
| Punch→date derivation (R16) | RESOLVED | E1 date_anchor_rule, FR-03/04, App. B |
| Comp-off SSOT (R17) | RESOLVED | FR-09, E12 note, §5.6 r18 |
| SUM(day_units)=total_days (R18) | RESOLVED | §5.6 r19, FR-12, error DAY_UNITS_MISMATCH |
| Advance-EL clawback + LWP accrual (R19) | RESOLVED | FR-11/16, §5.6 r20 |
| End-to-end worked example | RESOLVED | §5.8 |
| Best-in-class features (forecast/mass-leave/blackout/RTW) | RESOLVED | FR-23, E27 |
| Error codes for all failure paths (incl. v2) | RESOLVED | §8.3 |
| Integrity rules incl. ledger reconciliation | RESOLVED | §5.6 (22 rules) |
| Workflow/state tables (incl. anomaly/consent) | RESOLVED | §10 |
| Notifications mapped | RESOLVED | §11 |
| Migration & reconciliation plan | RESOLVED | §13 |
| Traceability complete | RESOLVED | §14.1 |
| **Unresolved gaps** | **0** | All council R1–R19 + adopted improvements 1–25 incorporated (see §1.6) |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Accrual | Periodic crediting of leave per policy, with defined rounding/proration. |
| Allocation (sub-day) | A fractional portion of a day assigned a status; allocations for a day sum ≤ 1.0. |
| Carry-forward | Balance carried into the next leave year, subject to cap. |
| Comp-off | Compensatory leave earned for OT/holiday work; balance held solely in `comp_off_ledger`. |
| Commuted Leave | HPL converted to full-pay (medical) leave; availing 1 day debits 2 HPL days (`debit_ratio` 2.0 against HPL). |
| Consent (DPDP) | Recorded lawful basis/consent for biometric/geo capture; withdrawable, with non-biometric fallback. |
| Delegation | Temporary reassignment of approval authority to a qualified delegate (out-of-office/SLA). |
| Earned Leave (EL) | Accruable, encashable privilege leave. |
| Entitlement counter | Career/event quota + eligibility predicate governing sanction-based leave. |
| Half-Pay Leave (HPL) | Leave paid at half salary; affects pay; encashable only at retirement (make-up). |
| Encashment | Conversion of unused leave to a monetary payment (in-service, LTC, retirement). |
| Geofence | Permitted GPS radius for mobile punches. |
| Leave Ledger | Append-only immutable record of all balance changes (single source of truth). |
| Leave-year basis | The year axis for a leave type: CALENDAR/FINANCIAL/CAREER/EVENT. |
| Locked period | A payroll feed period closed after export; corrected only via next-period adjustments. |
| LTC | Leave Travel Concession: EL encashment of 10 days per 4-year block, capped 60 days over career. |
| LWP | Leave Without Pay — unpaid absence affecting pay and service. |
| Reservation (soft-reserve) | A persisted balance hold (`leave_reservations`) created on submit; netted into available balance. |
| Regularisation | Correction of a missed/incorrect punch. |
| Roster | Employee-to-shift assignment over a date range. |
| RH | Restricted (optional) Holiday, employee-elected (`rh_elections`). |
| Sandwich rule | Per-leave-type treatment of holidays/weekly-offs falling within leave (EXCLUDE/INCLUDE_IF_SANDWICHED/ALWAYS_INCLUDE). |
| SR / Digital SR | Statutory Digital Service Register (M12, posted via M04). |
| Year-close | Annual leave processing: carry-forward, lapse, conversion, opening. |

## 16. Appendices

### Appendix A — Public-sector leave catalog defaults (editable per policy)
| Code | Name | Category | Accrual | Sanction-based | Debit ratio (→pot) | Year basis | In-service encash | Retirement encash | Notes |
|---|---|---|---|---|---|---|---|---|---|
| CL | Casual Leave | PAID | 12/yr | No | 1.0 | CALENDAR | No | No | No carry-forward; ≤ continuous cap |
| EL | Earned Leave | PAID | 15/half-yr | No | 1.0 | CALENDAR | Yes (incl. LTC) | Yes (≤300) | CF cap 300 |
| HPL | Half-Pay Leave | HALF_PAY | 10/half-yr | No | 1.0 | CALENDAR | No | Yes (make-up to 300) | Affects pay (half) |
| COMMUTED | Commuted Leave | PAID | from HPL | No | 2.0 (→HPL) | CALENDAR | No | No | 2 HPL : 1 commuted; medical doc |
| MAT | Maternity | SPECIAL | event | Yes | 1.0 | EVENT | No | No | ≤180 days; FEMALE; ≤2 surviving children |
| PAT | Paternity | SPECIAL | event | Yes | 1.0 | EVENT | No | No | ≤15 days; MALE |
| CCL | Child-Care Leave | SPECIAL | career quota | Yes | 1.0 | CAREER | No | No | FEMALE; 730-day career quota; child age ≤18 (22 if disabled) |
| STUDY | Study Leave | SPECIAL | sanction | Yes | 1.0 | CAREER | No | No | Authority sanction |
| MED | Medical Leave | PAID/HPL | per rule | No | 1.0 | CALENDAR | No | per rule | Certificate + return-to-work |
| SAB | Sabbatical | SPECIAL | sanction | Yes | 1.0 | CAREER | No | No | Authority sanction |
| LWP | Leave Without Pay | UNPAID | n/a | Yes | 1.0 | EVENT | No | No | Affects pay & service; suspends accrual |
| COMPOFF | Compensatory Off | PAID | earned | No | n/a (comp_off_ledger) | n/a | No | No | 90-day expiry, FIFO; no leave_balances row |

### Appendix B — Attendance status precedence, weekly-off legend & date derivation
- **Rollup precedence:** `ON_LEAVE` > `HOLIDAY` > `WEEKLY_OFF` > `WFH`/`ON_DUTY` > punch-derived (`PRESENT`/`HALF_DAY`/`ABSENT`/`MISSING_PUNCH`). The `attendance_daily.status` is the highest-precedence allocation; `present_units` is the sum of present-counting allocation fractions (R2).
- **Weekly-off legend:** `SUN`=Sunday; `SAT2`=2nd Saturday of the month; `SAT4`=4th Saturday of the month (i.e. nth Saturday, not date-of-month). *(Outsider clarification)*
- **Punch→attendance_date derivation (R16):** the applicable shift's `date_anchor_rule` governs bucketing. `PUNCH_LOCAL_DATE` = local date of the punch in `display_timezone`; `SHIFT_START_LOCAL_DATE` = the local date the night shift started (so a 22:00–06:00 NIGHT-A shift attributes the 02:00 punch to the prior calendar day). **DST assumption:** IST (`Asia/Kolkata`) has no DST; multi-timezone deployments must revisit bucketing — declared as an explicit, revisitable assumption rather than "not applicable".

### Appendix C — Key configurable parameters (held in `module_config`, scoped & effective-dated)
| Parameter (config_key) | Default | Notes |
|---|---|---|
| REGULARISATION_WINDOW_DAYS | 15 days | |
| REGULARISATION_LIMIT | 3 / month | |
| BACKDATE_WINDOW_DAYS | 30 days | |
| COMPOFF_VALIDITY_DAYS | 90 days | |
| RH_CAP | 2 | Overrides calendar default |
| CONFLICT_THRESHOLD_PCT | 30% | Team concurrent-absence advisory |
| EL_CF_CAP_DAYS | 300 days | |
| EL_RETIREMENT_ENCASH_CAP_DAYS | 300 days | Combined EL+HPL make-up (R5) |
| LTC_BLOCK_DAYS / LTC_CAREER_CAP_DAYS | 10 / 60 days | LTC encashment (R12) |
| CLOCK_SKEW_MIN | ±5 min | |
| RESERVATION_TTL_MIN | 4320 (72h) | Auto-release undecided reservation (R1) |
| IMPOSSIBLE_TRAVEL_KMH | 900 km/h | Anomaly threshold (R10) |
| LIVENESS_MIN_SCORE | 0.80 | Anomaly threshold (R10) |
| ACCRUAL_ROUNDING_MODE | NEAREST_HALF_CARRY | Per-policy override (R3) |
| BLACKOUT_PERIOD | (none) | Structured `{from,to,leaveTypes,scope}` (Proponent) |

**Worked proration + rounding example (R3):** Employee joins 2026-04-16 under EL `HALF_YEARLY` accrual of 15 days for the Jan–Jun cycle, `proration_method=DAYS_IN_SERVICE_OVER_CYCLE`, `rounding_mode=NEAREST_HALF_CARRY`. Days in service Apr-16→Jun-30 = 76 of 181 cycle days. Raw accrual = 15 × 76/181 = 6.30 days. Rounded to nearest 0.5 = 6.5; fractional remainder (6.30 − 6.5 = −0.20) is carried as a `remainder_carry` into the next cycle so cumulative accrual never drifts. Ledger posts `ACCRUAL +6.5`.

### Appendix D — Referenced modules
M01-EPM, M04-LSR, M10-PAY, M11-PEN, M12-SR, M13-DMS, M14-DAS, and shared workflow/notification/audit platform per `SHARED_FOUNDATION.md`.

### Appendix E — DPDP Data Retention & Purge Schedule (R9)
| Data class | Retention | Purge mechanism | Lawful basis |
|---|---|---|---|
| Biometric templates | Active employment + 0 days post-exit (templates not retained after separation) | Device/server template wipe on exit | Statutory duty / consent |
| Geo-location of punches | 180 days rolling | Anonymise lat/long after 180 days; keep punch fact | Purpose-bound (attendance) |
| Punch photos (liveness) | 90 days (or until anomaly case closed) | Delete from M13 after window | Anti-fraud |
| Raw punches | 3 years (statutory audit) | Archive then purge | Statutory audit |
| Attendance daily/allocations | 8 years | Archive | Service record support |
| Leave applications & ledger | Permanent / per service-register statutory schedule | Retained (immutable) | Statutory service record |
| Consent records | Employment + 8 years | Archive | Accountability |
| Anomaly review records | 8 years | Archive | Audit/fraud |

Purge runs (FR-21) honour legal holds (`PURGE_BLOCKED_LEGAL_HOLD`) and are logged to `audit_log`; the DPO signs off the schedule at launch and annually.
