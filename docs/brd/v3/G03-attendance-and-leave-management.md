# Attendance and Leave Management — Government HRMS Module BRD (G03, v3.0 · platform-grounded)

**Government module code:** G03 (alias GOV-M03; supersedes the `M03-ATL` code used in v2).
**Relationship to PrimeSoft platform:** **EXTEND / REUSE** of PrimeSoft **M04 Leave** + **M05 Attendance** (`MODULE_RECONCILIATION.md` §A — "SPANS-MULTIPLE / EXTEND"). Two PrimeSoft modules already cover this one government module. G03 **reuses** the existing leave-type/accrual/holiday/comp-off engine (M04) and the shift/roster/punch/regularisation engine (M05) and their validation (`VAL-LV`, `VAL-AT`, `VAL-HOLD`) and jobs (`JOB-M04-*`, `JOB-M05-*`); it **adds** only the public-sector-specific leave catalog (Earned/HPL/Commuted/Maternity/Paternity/Study/CCL/LWP etc.) and statutory accrual/encashment/sandwich rules as **extensions** to the platform leave model.
**Runs on platform engines:** approvals on **P01 WorkflowEngine**; authorization + field masking on **P02**; audit on **P05** dual logs (DB-trigger); migration on **P06**; background jobs on **X.1**; notifications on **X.2**; configured flows/forms on **W.1/W.2/W.3**.
**Grounding artefacts (authoritative):** `docs/brd/PLATFORM_FOUNDATION.md` and `docs/brd/MODULE_RECONCILIATION.md`. These **supersede** the invented `SHARED_FOUNDATION.md` conventions referenced by v2.
**Source of truth for shared elements:** Master BRD v2.1 · Product Vision v2.6 · Platform Spec v1.6 · RBAC Design v1.7 · Foundation FS v1.6 — referenced by id, never re-authored.
**Document version:** v3.2 — 2026-07-01 (field reconciliation of v3.1; ADD-ONLY sync of §5 to the reconciled G03 data model). Supersedes v3.0/v3.1 headers below, which are retained for lineage.
**Prior version:** v3.0 — 2026-07-01 (platform re-grounding of v2.0; preserves all v2 functional content and rigor).
**Revision basis:** v2.0 council-hardened BRD (risks R1–R19, improvements 1–25) re-anchored onto PrimeSoft per the platform authoring rules (`PLATFORM_FOUNDATION.md` §9; `MODULE_RECONCILIATION.md` §E). See `## Amendments (v2 → v3: platform re-grounding)`. The v3.1→v3.2 data-model field reconciliation is captured in `## Amendments (v3.1 → v3.2: field reconciliation)`.

---

## Amendments (v3.1 → v3.2: field reconciliation)

This revision is an **ADD-ONLY** synchronisation of §5 to the reconciled G03 data model (`docs/data-model/03-G03-attendance-leave.sql`, SECTIONS 13b + 13c). All v3.0/v3.1 content is preserved verbatim; only new entities, columns, enums, and inventory/ownership rows are added. Two reconciliation passes drove it: the **CSV pass** (PrimeSoft vendor config exports, `docs/data-model/reconciliation/g03-leave-attendance.md`) and the **prototype pass** (PrimeSoft M04/M05 UI screens, `docs/data-model/reconciliation/prototype-g03-leave-attendance.md`).

**Config-vs-data framing (governs this whole amendment).** The vendor exports carry **~700 raw policy toggles** (Leaves_Policy ~230 cols, Attendance_Policy ~260, Tenant_Leaves_Compoff ~280) and the prototype adds screen-level request-window / display / auto-route switches. The **vast majority are POLICY CONFIGURATION, not data attributes**: they live in the existing `module_config` (E27, effective-dated) or in new per-policy **`*_config jsonb`** columns (`policy_config`, `leave_type_config`, `accrual_config`, `shift_config`, `recurrence_config`). A CSV/screen field was promoted to a **first-class schema column** only when it is a genuine, queryable DATA attribute. Everything else is explicitly W-config. Manager/team roll-up screens (`team-leave`, `team-attendance`, `office-attendance`) are **derived reads**, not storage.

### New entities added (§5.1 inventory + §5.2 field tables)
| New entity | Inv. # | Ownership | Source |
|---|---|---|---|
| `attendance_policies` | E32 | **EXTEND M05** | CSV export `Attendance_Policy_Export.csv` (+`Attendance_Settings`) |
| `overtime_policies` | E33 | **EXTEND M04/M05** | CSV exports `Tenant_Leaves_Compoff_Export.csv` + `Overtime_Slabs/Threshold/Indexing` |
| `attendance_networks` | E34 | **G03 new** | CSV export `Attendance_Ip_Export.csv` (IP-restriction ranges) |
| `geofences` | E35 | **G03 new** | CSV export `Geofencing-Export.csv` (+`CheckIn_Settings_Export`) |
| `leave_reasons` | E36 | **EXTEND M04** | Prototype screen `leave-reasons` (FR-M04-003) |
| `attendance_reasons` | E37 | **EXTEND M05** | Prototype screen `attendance-reasons` (FR-M05-005) |
| `leave_balance_adjustments` | E38 | **G03 new** | Prototype screen `leave-balance-adjust` (FR-M04-021) |
| `leave_revocations` | E39 | **G03 new** | Prototype screen `leave-revocation` (FR-M04-005) |
| `attendance_lock_periods` | E40 | **G03 new** | Prototype screen `attendance-lock` (FR-M05-007) |

### New/changed columns on existing entities (§5.2 field tables)
| Entity | Columns added | Source |
|---|---|---|
| `leave_types` (E12) | is_hourly_leave, hours_per_day, hourly_min_minutes, hourly_multiple_minutes, allow_hourly_across_midnight, max_days_per_year, max_availed_per_year, max_days_per_month, min_advance_notice_days, max_future_apply_days, allow_half_day, attachment_mandatory_beyond_days, is_special_leave, has_unlimited_balance, **leave_type_config** (jsonb) | CSV `Leaves_Policy_Export.csv` / `Unpaid_Leave_Export.csv` |
| `leave_accrual_policies` (E13) | **accrual_config** (jsonb) | CSV `Leaves_Policy_Export.csv` (working-days/hours & custom-accrual patterns = config) |
| `shifts` (E1) | is_wfh_shift, leave_deduction_factor, standard_working_minutes, attendance_policy_id (FK), overtime_policy_id (FK), **shift_config** (jsonb) [CSV `Attendance_Shift_Export.csv`]; shift_type (enum) [prototype `attendance-shifts`, FR-M05-003] | CSV + prototype |
| `holidays` (E4) | day_name, repeat_next_year, is_national, recurrence_type, **recurrence_config** (jsonb) [CSV `all-Holiday-Export.csv`]; holiday_category, description [prototype `holiday-calendar-config`] | CSV + prototype |
| `overtime_records` (E9) | overtime_policy_id (FK) [CSV]; reason, worked_on_holiday, worked_on_weekly_off [prototype `request-ot`, FR-M05-008] | CSV + prototype |
| `comp_off_ledger` (E11) | overtime_policy_id (FK) | CSV `Tenant_Leaves_Compoff_Export.csv` |
| `leave_applications` (E16) | approver_note, hourly_minutes | Prototype `apply-leave` (FR-M04-017) |
| `geofences` (E35, new) | address, max_employees | Prototype `geofencing` (FR-M05-004) |
| `attendance_devices` (E5) | biometric_modality (enum) | Prototype `biometric-mgmt` (FR-M05-006) |
| `attendance_policies` (E32, new) | wfh_cap_per_month, working_days_per_week, daily_required_minutes | Prototype `attendance-policies` (FR-M05-002) |

### New enums added (§5.5 catalog)
`g03_ot_calc_frequency`, `g03_holiday_recurrence` (CSV pass); `g03_shift_type`, `g03_leave_adjustment_type`, `g03_adjustment_status`, `g03_revocation_type`, `g03_lock_resolution_mode`, `g03_lock_status`, `g03_biometric_modality`, `g03_holiday_category` (prototype pass).

> **Note — POLICY toggles are configuration, not columns.** Most attendance/leave policy switches (pro-rata, clubbing, prefix/suffix, block-leave, future-cycle, request windows, hide/display flags, per-frequency OT approval routing, regularisation/geofence enablement) are **W-config**: they ride in `module_config` or the new `*_config jsonb` columns, **not** as first-class schema columns. Only genuine DATA attributes were promoted to columns above.

---

## 0. How to read this v3

- **All v2 functional rigor is preserved.** Every v2 FR (FR-01…FR-23), entity (E1…E31), integrity rule, state table, error path, worked example, and appendix is retained.
- **What changed is the grounding**, not the behaviour: module code (`G03`), multi-tenancy (`tenant_id`/`entity_id` on every table), platform engines (P01/P02/P05/P06/X/W) instead of invented "shared" engines, the platform API conventions + error envelope/codes, the RBAC v1.7 model, the platform NFR baseline, and reuse of the existing PrimeSoft M04/M05 data model instead of forking parallel leave/attendance tables.
- Two new sections — **`## Alignment with PrimeSoft Platform`** (FR → platform-service map) and **`## Amendments (v2 → v3: platform re-grounding)`** — make the re-grounding explicit and auditable.
- Reading rule for traceability uses the platform form, e.g. `(Platform §P01)`, `(Foundation §1)`, `(RBAC §2.2)`, `(Recon §C)`.

---

## 1. Executive Summary

### 1.1 Purpose
The Attendance and Leave Management module (**G03**) is the time-and-absence system of record for the government HRMS, delivered as a **public-sector extension of PrimeSoft M04 Leave + M05 Attendance**. It captures **when and how employees work** (biometric / RFID / mobile-geo punches, shifts, rosters, overtime, work-from-home, on-duty/tour, holidays) and **when and why they are absent** (a full public-sector leave catalog with configurable accrual, carry-forward, encashment, and a fully auditable leave-balance ledger). It exposes self-service to employees (Me workspace), team controls to managers (My Team workspace), configuration to Leave/Attendance/HR Admins, and feeds two downstream systems of record: the statutory **Digital Service Register** (via the separate **G04** Leave→SR module → **G12-SR** ledger) and **Payroll** (**G10**, extending PrimeSoft M06/M07) for loss-of-pay treatment.

### 1.2 Business problem
Public-sector time and leave administration is today fragmented across registers, spreadsheets, and disconnected biometric devices. This causes: leave balances that cannot be trusted, manual loss-of-pay (LWP) errors in payroll, no statutory leave posting into the Service Register, no team visibility for managers, and no audit trail for regularisation and backdating. G03 replaces this with the configurable PrimeSoft M04/M05 engine extended with public-sector statutory rules and immutable ledgers, with concurrency-safe balance debits, DPDP-compliant biometric/geo governance, and anti-fraud controls — all on platform-provided audit (P05), workflow (P01), and authorization (P02) substrates.

### 1.3 Goals & success metrics
| # | Goal | Metric / target |
|---|---|---|
| G1 | Trustworthy leave balances | 100% of balance changes traceable to a ledger entry; zero unreconciled balances at year-close; **zero lost-update / oversubscription incidents** (concurrency-controlled). |
| G2 | Automated attendance capture | ≥ 95% of daily attendance auto-computed without manual intervention (via `JOB-M05-CLOSE` extended). |
| G3 | Accurate payroll feed | 0 LWP discrepancies between G03 export and G10 import per cycle; **0 silent corruptions of locked periods** (next-period adjustment only; aligns with `JOB-M05-LOCK`). |
| G4 | Statutory compliance | 100% of approved leave events posted to Digital SR (via G04) within SLA; **100% of biometric/geo capture covered by a recorded lawful basis + consent or non-biometric fallback** (P05 consent substrate; `VAL-CONSENT`). |
| G5 | Self-service adoption | ≥ 90% of leave applications submitted by employees themselves (web/mobile, Me workspace). |
| G6 | Approval timeliness | P50 leave-approval turnaround ≤ 24h; P01 SLA auto-escalation **and auto-delegation** on breach/absence. |
| G7 | Fraud resistance | ≥ 99% of buddy-punching / impossible-travel anomalies auto-flagged for review before payroll feed lock. |

### 1.4 Scope summary
**In scope (G03 extensions over M04/M05):** shift & roster management (M05); holiday calendars by location (M05); punch ingestion, deduplication & **anomaly/fraud detection** (M05); daily attendance processing & **sub-day allocation** (M05 extended); missed-punch regularisation (M05, `VAL-AT`); overtime; WFH; on-duty/tour; compensatory-off (M04/M05); leave-type & accrual policy configuration (M04, `VAL-LV`) incl. **commuted 2:1**, **leave-year basis**, **rounding/proration**, **sandwich rule per type** (extends `JOB-M04-SANDWICH`); accrual engine (`JOB-M04-ACCRUAL`); **concurrency-controlled** leave-balance ledger and **soft-reserve reservations**; **entitlement counters** for sanction-based leave; leave application/approval/cancellation (P01); backdated leave; team calendar & conflict detection (My Team workspace); **approval delegation/out-of-office** (P01 `delegate`); leave-year close / carry-forward / lapse (`JOB-M04-CARRYFWD`); encashment (incl. **retirement EL+HPL shortfall make-up** and **LTC**); attendance-and-leave → payroll feed with **locked-period adjustments** (`JOB-M04-LOP`/`JOB-M05-LOP`); **DPDP biometric/geo consent & non-biometric fallback**; **best-in-class absence features** (what-if forecast, mass-leave/shutdown, blackout/freeze via `VAL-HOLD`, return-to-work).
**Out of scope (referenced, not built here):** statutory SR posting internals (**G04** → **G12-SR**); payroll computation (**G10**); terminal-benefit/pension settlement (**G11**); document storage internals (**G13**, PrimeSoft M11); cross-module analytics surface (**G14**, PrimeSoft M16); the platform engines themselves (P01–P06, X, W — consumed, never re-authored).

### 1.5 Key stakeholders
Employees, Reporting Managers (L1–L5 / HOD), Leave Admin, Attendance Admin, HR Admin, Sanctioning Authority (Dept Head — gov role addition), Payroll Officer (consumer), SR Custodian (consumer via G04 — gov role addition), Auditors (Org-Admin read + entitlement), Data Protection Officer (DPDPA — gov capability flag), System Administrators (Org/Platform Admin).

### 1.6 Amendments (v1 → v2) — retained for lineage
The full v1→v2 council amendment table (improvements 1–25, risks R1–R19) is preserved verbatim below; it documents how the leave/attendance engine was hardened. The **v2→v3** platform re-grounding is captured separately in `## Amendments (v2 → v3: platform re-grounding)`.

| # (council) | Risk | Adopted improvement | Incorporated in (v2, carried to v3) |
|---|---|---|---|
| 1 | R1 | `leave_reservations` entity for real soft-reserve; netted into `available` | §5.2 E21; FR-12; §5.6 r11 |
| 2 | R1 | Concurrency control: `version` (optimistic lock) + `SELECT … FOR UPDATE` on balance debit | §5.2 E14; §5.6 r12; FR-11/12; error `OPTIMISTIC_LOCK_CONFLICT` |
| 3 | R2 | Per-day allocation set (sum ≤ 1.0); derived `status`; `present_units` | §5.2 E22; FR-04; FR-17; §5.6 r13 |
| 4 | R3 | Accrual rounding mode + proration + leave-year basis per type | §5.2 E12/E13; FR-11; App. C |
| 5 | R4 | Commuted 2:1 via `debit_ratio` + `debits_against_leave_type_id` | §5.2 E12; FR-10/12; §5.6 r14; error `COMMUTED_REQUIRES_HPL` |
| 6 | R5 | Retirement encashment EL→cap then HPL make-up to 300 | FR-16; §5.2 E12/E18; App. A |
| 7 | R6 | Locked period: never overwrite; next-period adjustment | §5.2 E23; FR-01/02/05/17; error `LOCKED_PERIOD_ADJUSTMENT_EMITTED` |
| 8 | R7,R14 | `leave_entitlements` counter for sanction leave | §5.2 E24; FR-22; §5.6 r15 |
| 9 | R8 | `attendance_processing_runs` entity | §5.2 E25; FR-04 |
| 10 | R8 | `rh_elections` entity | §5.2 E26; FR-02 |
| 11 | R8 | `module_config` (effective-dated tunables) | §5.2 E27; App. C |
| 12 | R11 | `approval_delegations` + auto-route | §5.2 E28; FR-19; §10.6 |
| 13 | R14 | `employee_dependents` for CCL/Maternity eligibility | §5.2 E29; FR-22 |
| 14 | R9 | DPDP lawful basis + `biometric_consents` + fallback + retention | §5.2 E30; FR-21; §9; App. E |
| 15 | R10 | Anti-fraud anomaly detection + `punch_anomaly_reviews` | §5.2 E31; FR-20; FR-03 |
| 16 | R12 | LTC encashment fully specified | FR-16; §5.2 E18; App. A |
| 17 | R13 | Sandwich rule per type with example | §5.2 E12; FR-12; §5.6 r16 |
| 18 | R15 | FR-04 sole writer of attendance | FR-04/05/07/08/12 LLD; §5.6 r17 |
| 19 | R16 | Punch→`attendance_date` derivation (shift-anchored) | FR-03/04; App. B |
| 20 | R17 | `comp_off_ledger` sole comp-off source | FR-09; §5.6 r18 |
| 21 | R18 | `SUM(day_units)=total_days` integrity | §5.6 r19; FR-12; error `DAY_UNITS_MISMATCH` |
| 22 | R19 | Advance-EL clawback on exit; accrual suspend on LWP | FR-11/16; §5.6 r20 |
| 23 | Outsider | End-to-end worked example | §5.8 |
| 24 | Executor | Corrected Final Reconciliation Table | §14.4 |
| 25 | Proponent | Forecast, mass-leave/shutdown, blackout/freeze, return-to-work | FR-23; E27 |

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Area | Sub-area | FRs | Platform basis |
|---|---|---|---|
| **Time & Attendance** | Shift & roster management | FR-01 | PrimeSoft **M05** (extend); `VAL-AT` |
| | Holiday calendar by location | FR-02 | M05; `VAL-AT` |
| | Punch ingestion + capture governance | FR-03 | M05; devices registered in **P04**; `VAL-CONSENT` |
| | Daily attendance processing, sub-day allocation & status | FR-04 | M05; `JOB-M05-CLOSE` (extend) |
| | Missed-punch regularisation | FR-05 | M05; `VAL-AT`; P01 |
| | Overtime capture & approval | FR-06 | M05/M04; P01 |
| | Work-from-home (WFH) | FR-07 | M05; P01 |
| | On-duty / tour / outdoor duty | FR-08 | M05; P01 |
| | Compensatory-off earning & redemption | FR-09 | M04/M05 comp-off (extend) |
| **Leave Management** | Leave-type & accrual-policy configuration | FR-10 | PrimeSoft **M04** (extend); `VAL-LV` |
| | Accrual engine, rounding/proration & ledger | FR-11 | M04; `JOB-M04-ACCRUAL` (extend) |
| | Leave application & approval (reservation, concurrency, sandwich) | FR-12 | M04; **P01**; `VAL-LV`; `JOB-M04-SANDWICH` |
| | Leave cancellation & modification | FR-13 | M04; P01 |
| | Backdated leave & team-calendar conflict detection | FR-14 | M04; My Team workspace |
| | Leave-year close: carry-forward, lapse, conversion | FR-15 | M04; `JOB-M04-CARRYFWD` (extend) |
| | Leave encashment (in-service, LTC & retirement) | FR-16 | M04 (extend); G10/G11 |
| **Integration & Governance** | Attendance & leave → payroll (LWP) feed + adjustments | FR-17 | `JOB-M04-LOP`/`JOB-M05-LOP` (extend); X.3 |
| | Mobile/web self-service surface & notification triggers | FR-18 | Me/My Team workspaces; **X.2** |
| | Approval delegation & out-of-office routing | FR-19 | **P01** `delegate` |
| | Time-fraud & punch anomaly detection & review | FR-20 | M05 + P01 review flow |
| | DPDP biometric/geo consent, lawful basis & fallback | FR-21 | **P05** `consent_records`; `VAL-CONSENT` |
| | Leave entitlement counters for sanction-based leave | FR-22 | M04 extension (gov-specific) |
| | Best-in-class absence features (forecast, mass-leave, blackout, RTW) | FR-23 | M04 extension; `VAL-HOLD` |

### 2.2 Common Capabilities (inherited from the PrimeSoft platform — never redefined)
- **Multi-tenancy:** `tenant_id` (and entity-scoped `entity_id`) on every G03 table; data-layer row-level scoping; unscoped queries rejected, not defaulted (Platform §0.1; Recon §C).
- **RBAC + scoping:** five scoping dimensions (reporting chain, `org_units`, UAG, contribution level, entity); enforcement by **P02 `Authorization.check`** only; **PII Protection Ceiling** governs biometric/identity fields (RBAC §3.9; §6).
- **Maker-checker / approvals:** **P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`); `workflows`/`workflow_instances`/`workflow_actions`; SoD enforced by P01/P02; in-flight version pinning (Platform §P01; Recon §C).
- **Audit:** **P05** dual logs (`audit_log` + `security_audit_log`), DB-trigger capture, immutable, ≥ 7-yr; tamper-evidence tracks OPEN-PLAT-03 (Platform §P05). G03 does **not** define its own `audit_log`.
- **Append-only domain ledgers** (`leave_balance_ledger`, `comp_off_ledger`, `attendance_punches`) remain G03-owned business ledgers and additionally fire P05 triggers.
- **API:** `/api/v1`; `Idempotency-Key` on workflow-initiating POSTs (24h replay); **cursor pagination** (`limit` default 25/max 100, `next_cursor`); `X-Correlation-Id` header; canonical error envelope + 8-code table (Foundation §1; Recon §C).
- **NFR baseline:** p95 < 500 ms; **99.5%/month uptime**; **RPO < 1 h / RTO < 4 h**; WCAG 2.1 AA; DPDPA-aligned PII handling (Vision §2.9; Recon §C).

### 2.3 Boundaries & ownership
| Concern | Owner | G03 relationship |
|---|---|---|
| Employee master, designation, org tree, dependents | **G01** (PrimeSoft M01) | **Reads** (golden source); `employee_dependents` co-located with G01, mirrored/read by G03 (§5.2 E29). |
| Statutory SR ledger | **G12-SR** (written via **G04** Leave→SR) | **Emits** approved-leave events to **G04**; never writes SR directly. (Recon §A/§D — G04/G12 net-new.) |
| Payroll computation | **G10** (extends PrimeSoft M06/M07, roadmap) | **Emits** LWP/OT/attendance feed + adjustments; G10 computes pay. |
| Terminal benefits / pension | **G11** (net-new gov) | **Supplies** leave-encashment-eligible balance (EL+HPL make-up) on retirement. |
| Document storage | **G13** (PrimeSoft M11) | **References** `documents` for medical certs, tour orders, punch photos, fitness certs, consent artefacts. |
| Workflow / Authz / Audit / Migration / Notifications / Jobs | **Platform** (P01/P02/P05/P06/X.2/X.1) | **Consumes** by id; never re-implements. |

---

## 3. Roles & Permissions (mapped to RBAC v1.7 — ADDITIONS only)

> Per `PLATFORM_FOUNDATION.md` §6 and Recon §C, G03 does **not** invent a parallel role scheme. It **reuses** the RBAC v1.7 taxonomy and expresses government statutory actors as **new roles + capability flags ADDED** to the taxonomy, with SoD enforced by P01/P02. Approvers resolve via **reporting-chain position** (P01 approver-resolution) surfaced in the **My Team** workspace; admins act in the **Admin** workspace.

### 3.1 Role mapping
| G03 actor (v2 name) | RBAC v1.7 expression | Notes |
|---|---|---|
| **Employee (Self-Service)** | `employee` (RBAC §2.4) — Me workspace | Apply/cancel own leave, view own balance/ledger/forecast, regularise own punches, apply WFH/OD/comp-off/OT, manage own punch consent/fallback, view own roster/holidays. |
| **Reporting Manager** | `l1_manager`…`l5_manager` / `hod` (RBAC §2.3) — My Team workspace | Approve/recommend leave, regularisation, OT, WFH, OD for reports via P01 reporting-chain resolution; team calendar; set own delegation. |
| **HR Officer / HR Admin** | `hr_admin` (superset, RBAC §2.2/§3.1.1) | All Leave Admin + Attendance Admin rights; operate on behalf; run accrual/close; ledger adjustment (maker-checker via P01); mass-leave/RTW; **leave encashment authorisation is HR-Admin-only** (BRD §3.1.1). |
| **Leave configuration** | `leave_admin` (RBAC §2.2 — M04 single-entity) | Configure leave types/policies/accrual, override balances (P01 maker-checker), manage holiday calendar, approve/reject leave; **cannot authorise encashment** (HR Admin only). |
| **Attendance configuration** | `attendance_admin` (RBAC §2.2 — M05 single-entity) | Configure shifts/rosters, biometric device mapping (registered in **P04**), lock/unlock periods, override punches, approve/reject attendance requests. |
| **Sanctioning Authority (Dept Head)** | **NEW gov role** (sanctioning authority) — register RBAC §2.2/§4.3 | Final sanction for special leaves (Maternity, Study, Sabbatical, Commuted, LWP, encashment); P01 approver; SoD (no self-approve). |
| **Payroll Officer** | `payroll_admin` (RBAC §2.2) | Read-only consumer of LWP/OT feed; trigger/reconcile export; review locked-period adjustments. |
| **Auditor** | **Org-Admin read + read-only individual entitlement** (RBAC §3.2; Recon §C) — *not* a parallel write role | Read across entities incl. ledger, reservations, consents, anomaly reviews; P05 query access; no write. |
| **Data Protection Officer (DPO)** | **NEW capability flag** on a governance role (RBAC §4.3) | Read across consent/biometric/geo governance + retention/purge oversight; approves lawful-basis config; PII-ceiling-bound. |
| **Anomaly Reviewer (HR/Security)** | **NEW capability flag** (RBAC §4.3) | Reviews `FLAGGED_FOR_REVIEW` punches; approve/reject/escalate via P01; cannot self-clear own punches (SoD by P02). |
| **System Administrator** | **Org Admin / Platform Super Admin** (RBAC §2.1; Recon §C) | Device/IP registration (P04), integration config (X.3/P04), reference master data; no transactional self-approval. |

All new roles/flags are **registered in RBAC §2.2/§4.3** via the working-group process (RBAC §14). **Segregation of duties** (maker ≠ checker; no self-approval; reviewer ≠ punch owner; delegate ≠ applicant) is enforced by **P01/P02**, not re-coded in G03 (Recon §C).

### 3.2 Permission matrix (action-level per RBAC §5: V=View, E=Edit, A=Approve, X=Execute job, Adm=Admin; blank=none)
| Capability | Employee | Manager (L1–HOD) | Leave Admin | Attendance Admin | HR Admin | Sanct. Auth | Payroll | Auditor | DPO | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|
| View own attendance/leave | V | V | V | V | V | | | V | | |
| View team attendance/leave | | V | V | V | V | V | | V | | |
| Apply leave / WFH / OD / comp-off / OT | E | E(self) | E(on behalf) | E(on behalf) | E(on behalf) | | | | | |
| Approve leave / regularisation / OT | | A | A | A | A | A | | | | |
| Sanction special leave & encashment | | | V | | A | A | | | | |
| Regularise missed punch | E(self) | A | | E/A | E/A | | | V | | |
| Configure shifts / rosters | | V | | E | E | | | V | | |
| Configure holidays / RH | | V | E | E | E | | | V | | |
| Configure leave types & accrual policy | | | E | | E | | | V | | |
| Manage module_config / blackout / freeze | | | E | E | E | | | V | V | |
| Run accrual / year-close job (X.1) | | | X(scope) | | X | | | V | | |
| Ledger manual adjustment (P01 maker-checker) | | | E(maker) | | A(checker) | | | V | | |
| Run/reconcile payroll feed export & adjustments | | | | V | V | | X | V | | |
| Set approval delegation (P01) | | E(self) | E(on behalf) | E(on behalf) | E/Adm | | | V | | |
| Manage punch consent / non-biometric enrolment | E(self) | | E(on behalf) | E(on behalf) | E/Adm | | | V | V | |
| Review flagged punch anomalies (P01) | | A(team) | | A | A | | | V | V | |
| Mass-leave / shutdown / return-to-work | | | E/X | | E/X | | | V | | |
| Register devices / integration config (P04) | | | | V | V | | | V | | Adm |
| Configure lawful basis / retention policy | | | | | V | | | V | A | Adm |
| View audit log (P05) | own | team | scope | scope | org | scope | | all | governance | scope |

---

## 4. Platform Foundation Consumed (not redefined)

This module **inherits** the PrimeSoft platform (`PLATFORM_FOUNDATION.md`) and the PrimeSoft M04/M05 data model without redefinition:

- **Platform entities reused (referenced, never redefined):** `tenants`, `employees`/`org_units`/`designations`/`grades` (G01/M01), `users`/`roles`/`permissions` (RBAC), `documents` (G13/M11), `notifications` (X.2), `audit_log` + `security_audit_log` (P05), `workflows`/`workflow_instances`/`workflow_actions` (P01), `consent_records` (P05/DPDPA), `integration_credentials` (P04), `migration_runs` (P06).
- **PrimeSoft M04/M05 model reused/extended:** leave types, accrual policies, holiday calendars, shifts/rosters, comp-off, regularisation, punch/device structures already exist in M04/M05. G03 **aligns its entities to those** and adds public-sector columns/types as **extensions** — it does **not** fork parallel `leave_balances`/attendance tables where the platform already defines them (see §5.0 reconciliation note).
- **Conventions:** UUID PKs + human business keys; standard audit columns; UPPER_SNAKE_CASE enums; UTC storage / locale display (`DD-MMM-YYYY`); **cursor** pagination (limit 25/100, `next_cursor`); maker-checker through **P01**.
- **Validation:** cite `VAL-LV` (leave application balance/limit/notice), `VAL-AT` (attendance punch/shift/window), `VAL-HOLD` (hold/blackout window), `VAL-CONSENT`, `VAL-DEPENDENT`, `VAL-DATE`, `VAL-EFFECTIVE`, `VAL-FILE`, `VAL-COMMENT`, `VAL-ENUM` (Foundation §2). Author only module-unique `VAL-G03-*` (see §8.6) and register them in the Foundation index.
- **Error envelope:** `{ "error": { "code", "message", "field", "details": {} } }` + `X-Correlation-Id` header (no body `requestId`).
- **NFR baseline:** p95 < 500 ms; 99.5%/month uptime; RPO < 1 h / RTO < 4 h; WCAG 2.1 AA; DPDPA-aligned.

G03 extends **P01** with module workflow definitions (leave approval, regularisation, encashment, anomaly review, return-to-work) as **configured W.1 flows** and **W.2 forms** (not coded engines), and extends **X.2** with module `MSG-G03-*` event types. Sensitive-personal-data handling (biometric templates, geo) is governed under the platform **P05 consent / DPDPA** layer plus G03's statutory retention schedule (FR-21, §9, App. E).

---

## 5. Holistic Data Model

### 5.0 Reconciliation with the PrimeSoft M04/M05 model (re-grounding note)
Per Recon §A (G03 = EXTEND of M04 Leave + M05 Attendance) and §C/§E (no parallel forks):

- **Reuse, don't fork.** Where PrimeSoft M04/M05 already define a structure (leave types, accrual/policy, holiday calendar, shift/roster, comp-off, regularisation, punch/device), the G03 entities below are the **public-sector projection/extension of those existing tables**, not new parallel tables. The "Ownership" column reads **`EXTEND M04`/`EXTEND M05`** for these; engineering maps each to the existing PrimeSoft table + added gov columns.
- **Public-sector additions** (EL/HPL/Commuted/Maternity/Paternity/CCL/Study/LWP types, statutory accrual/encashment/sandwich rules, entitlement counters, retirement EL+HPL make-up) are **extension columns/types** on the M04 model, marked **`G03 ext`**.
- **Genuinely net-new G03 entities** absent from M04/M05 (soft-reserve reservations, sub-day allocations, payroll-feed adjustments, anomaly reviews, DPDP consent linkage, RH elections, module config, delegations) are marked **`G03 new`** and still run on platform substrates (P01/P05).
- **`tenant_id` (non-nullable) and `entity_id` (where entity-scoped) are added to EVERY entity below** and to every reused M04/M05 table projection; data-layer scoping applies; unscoped queries are rejected (Platform §0.1; Recon §C). To avoid repetition, the standard tenancy + audit columns are stated once in §5.1.1 and not re-listed in every field table.
- **Audit is P05, not local.** No G03 entity defines `audit_log`; every INSERT/UPDATE/soft-DELETE fires the P05 DB-trigger. `is_deleted` soft-delete only (no hard delete).
- **Workflow linkage uses `workflow_instances` / `workflow_actions` (P01)**, replacing the v2 `workflow_tasks` references throughout (Recon §C).
- **SR linkage** (`sr_posting_status`, posting) is consumed via **G04**; the SR ledger itself is **G12-SR** — G03 references, never writes it.

### 5.1 Entity inventory (re-grounded)
| # | Entity | Type | Ownership (platform-grounded) | Note |
|---|---|---|---|---|
| E1 | `shifts` | Master | **EXTEND M05** | Shift definitions (timings, grace, break, night flag, midnight date-anchor rule). |
| E2 | `rosters` | Transactional | **EXTEND M05** | Employee-to-shift assignment over a date range. |
| E3 | `holiday_calendars` | Master | **EXTEND M05** | Named calendar bound to location/org scope. |
| E4 | `holidays` | Master | **EXTEND M05** | Individual holiday dates within a calendar. |
| E5 | `attendance_devices` | Master | **EXTEND M05** (registered in **P04**) | Capture sources; device↔employee binding & liveness; devices/IP registered in P04 before use (Platform §P04). |
| E6 | `attendance_punches` | Append-only ledger | **EXTEND M05** (+P05 trigger) | Raw punch events; photo/liveness/anomaly fields. |
| E7 | `attendance_daily` | Transactional (derived rollup) | **EXTEND M05** | Per-employee-per-day rollup; status derived over allocations. |
| E8 | `regularisation_requests` | Transactional | **EXTEND M05** (P01 flow) | Missed-punch / status correction; `VAL-AT`. |
| E9 | `overtime_records` | Transactional | **EXTEND M05** (P01 flow) | OT claim, approval, payable/comp-off treatment. |
| E10 | `attendance_exceptions` | Transactional | **EXTEND M05** (P01 flow) | WFH / On-Duty / Tour records. |
| E11 | `comp_off_ledger` | Append-only ledger | **EXTEND M04/M05** (+P05 trigger) | Sole source of truth for comp-off balance. |
| E12 | `leave_types` | Master | **EXTEND M04** + `G03 ext` | Leave catalog + debit_ratio, year_basis, sandwich_rule, sanction flag, retirement-encash (gov columns). |
| E13 | `leave_accrual_policies` | Master | **EXTEND M04** + `G03 ext` | Accrual/CF/encash rules + rounding_mode, proration_method. |
| E14 | `leave_balances` | Transactional (derived) | **EXTEND M04** | Balance snapshot + `version` (optimistic lock) + reserved netting anchor. **Not a new fork** — the M04 balance table extended with `version`/`reserved`. |
| E15 | `leave_balance_ledger` | Append-only ledger | **EXTEND M04** (+P05 trigger) | Immutable debit/credit history (single source of truth for balances). |
| E16 | `leave_applications` | Transactional | **EXTEND M04** (P01 flow) | Leave requests + approval lifecycle (`workflow_instance_id` → P01). |
| E17 | `leave_application_days` | Transactional | **EXTEND M04** | Per-day breakdown (full/first-half/second-half). |
| E18 | `leave_encashment_requests` | Transactional | **EXTEND M04** + `G03 ext` (P01 flow) | In-service, LTC & retirement encashment; EL/HPL split. |
| E19 | `leave_year_close_runs` | Job/audit | **EXTEND M04** (`JOB-M04-CARRYFWD`) | Year-close execution records. |
| E20 | `payroll_attendance_feed` | Integration ledger | **EXTEND M04/M05** (`JOB-*-LOP`; X.3) | LWP/OT/attendance export batches to **G10**. |
| **E21** | `leave_reservations` | Transactional | **G03 new** | Soft-reserve holds netted into `available`. *(R1)* |
| **E22** | `attendance_day_allocations` | Transactional | **G03 new** | Sub-day allocation set (sum ≤ 1.0). *(R2)* |
| **E23** | `payroll_feed_adjustments` | Integration ledger | **G03 new** | Next-period corrections to locked feed periods. *(R6)* |
| **E24** | `leave_entitlements` | Transactional counter | **G03 new** (gov-specific) | Career/event quotas + eligibility for sanction leave. *(R7,R14)* |
| **E25** | `attendance_processing_runs` | Job/audit | **G03 new** (X.1 job) | Resolves `attendance_daily.processing_run_id`. *(R8)* |
| **E26** | `rh_elections` | Transactional | **G03 new** | Restricted-holiday elections + cap. *(R8)* |
| **E27** | `module_config` | Master (scoped, effective-dated) | **G03 new** (config cascade, `VAL-EFFECTIVE`) | Appendix-C tunables + blackout/freeze + mass-leave. *(R8, Proponent)* |
| **E28** | `approval_delegations` | Transactional | **G03 new** (feeds **P01** `delegate`) | Out-of-office delegate routing. *(R11)* |
| **E29** | `employee_dependents` | Master (**G01/M01-owned**) | **REFERENCE G01/M01** (read-only; not redefined) | Canonical dependents for CCL/Maternity eligibility; G03 reads, never re-declares. *(R14)* |
| **E29a** | `dependent_leave_eligibility` | Transactional satellite | **G03 new** (1:1 FK → G01 `employee_dependents`) | Leave-specific `is_surviving` predicate only; no shared columns. *(R14; D5)* |
| **E30** | `biometric_consents` | Governance | **G03 new** (links **P05 `consent_records`**) | DPDP consent + lawful basis + fallback election. *(R9)* |
| **E31** | `punch_anomaly_reviews` | Transactional | **G03 new** (P01 review flow) | Review lifecycle for flagged punches. *(R10)* |
| **E32** | `attendance_policies` | Master | **EXTEND M05** | Grace/buffer/absconding/edit-window/NSD/WFH-cap DATA; ~230 request & display toggles ride in `policy_config` jsonb. *(v3.2 CSV)* |
| **E33** | `overtime_policies` | Master | **EXTEND M04/M05** | OT calc-frequency, caps, multipliers, comp-off credit rules; slabs/thresholds/indexing as jsonb sets; routing in `policy_config`. *(v3.2 CSV)* |
| **E34** | `attendance_networks` | Master | **G03 new** | IP-restriction ranges (`ip_from`/`ip_to` inet) for network-bound punch capture. *(v3.2 CSV)* |
| **E35** | `geofences` | Master | **G03 new** | Named, reusable, location-assignable geofences (lat/long/radius/address/capacity). Distinct from `attendance_devices.geofence` inline point. *(v3.2 CSV+proto)* |
| **E36** | `leave_reasons` | Master (tenant-configurable value set) | **EXTEND M04** | Leave-dropdown reason master (code/category/doc/route/threshold) per CONVENTIONS §4. *(v3.2 proto; FR-M04-003)* |
| **E37** | `attendance_reasons` | Master (tenant-configurable value set) | **EXTEND M05** | Regularisation reason master (code/category/doc/auto-approve/frequency-cap). *(v3.2 proto; FR-M05-005)* |
| **E38** | `leave_balance_adjustments` | Transactional | **G03 new** (P01 flow) | Approvable balance-adjustment request → posts `ADJUSTMENT` to `leave_balance_ledger`. *(v3.2 proto; FR-M04-021)* |
| **E39** | `leave_revocations` | Transactional | **G03 new** (P01 flow) | Post-approval revocation of approved leave → posts `AVAIL_REVERSAL` refund. *(v3.2 proto; FR-M04-005)* |
| **E40** | `attendance_lock_periods` | Transactional | **G03 new** (X.1/M06 handoff) | Monthly attendance lock cycle at org scope (distinct from per-employee feed `is_locked`). *(v3.2 proto; FR-M05-007)* |

Reused platform entities (not redefined): `tenants`, `employees`, `users`, `org_units`, `designations`, `grades`/`cadres`, `documents`, `notifications`, `audit_log`/`security_audit_log`, `workflows`/`workflow_instances`/`workflow_actions`, `consent_records`, `integration_credentials`, `migration_runs`; the SR ledger `service_register_events` is **G12-SR** (net-new gov), written via **G04**.

#### 5.1.1 Standard tenancy + audit columns (applied to EVERY entity; stated once)
| Field | Type | Constraints | Description |
|---|---|---|---|
| tenant_id | UUID | NOT NULL | Tenant scope; data-layer enforced; unscoped query rejected (Platform §0.1). |
| entity_id | UUID | NOT NULL where entity-scoped | Legal-entity/directorate scope (Vision §1.4). |
| created_at, updated_at | TIMESTAMPTZ | NOT NULL | Standard audit timestamps (also captured by P05 trigger). |
| created_by, updated_by | UUID | FK → users | Actor. |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft-delete only (no hard delete); append-only ledgers omit this. |

> The per-entity field tables in §5.2 list **domain fields only**; `tenant_id`, `entity_id`, and the audit columns above are implied on each. Append-only ledgers (`leave_balance_ledger`, `comp_off_ledger`, `attendance_punches`) carry `tenant_id`/`entity_id` + `created_at`/`created_by` and permit INSERT only.

### 5.2 Full field tables
> Domain fields only; the §5.1.1 tenancy + audit columns are implied on every entity. Workflow links use `workflow_instance_id` → **P01 `workflow_instances`**.

#### E1 `shifts` (EXTEND M05)
| Field | Type | Constraints | Description |
|---|---|---|---|
| shift_id | UUID | PK | Identity. |
| shift_code | VARCHAR(20) | UNIQUE per tenant, NOT NULL | Human key e.g. `GEN`, `NIGHT-A` (`VAL-MASTER-UNIQUE`). |
| name | VARCHAR(100) | NOT NULL | Display name. |
| start_time / end_time | TIME | NOT NULL | Shift window (local). |
| grace_minutes | INT | NOT NULL, DEFAULT 10 | Late-grace window. |
| half_day_threshold_minutes / full_day_threshold_minutes | INT | NOT NULL | Worked-minutes boundaries. |
| break_minutes | INT | NOT NULL, DEFAULT 0 | Unpaid break. |
| is_night_shift | BOOLEAN | NOT NULL, DEFAULT false | Spans midnight. |
| date_anchor_rule | ENUM | NOT NULL, DEFAULT `SHIFT_START_LOCAL_DATE` | `SHIFT_START_LOCAL_DATE`/`PUNCH_LOCAL_DATE` (R16). |
| display_timezone | VARCHAR(40) | NOT NULL, DEFAULT `Asia/Kolkata` | Local zone for date bucketing. |
| org_unit_scope_id | UUID | FK → org_units | Applicability scope. |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`. |
| is_wfh_shift | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Is WFH Shift? |
| shift_type | ENUM (`g03_shift_type`) | NOT NULL, DEFAULT `FIXED` | **`v3.2 proto`** (FR-M05-003) — `FIXED`/`FLEXIBLE`/`ROTATIONAL`; flex window rides in `shift_config`. |
| leave_deduction_factor | NUMERIC(4,2) | NULL | **`v3.2 CSV`** — leave-deduction factor for the shift. |
| standard_working_minutes | INT | NULL | **`v3.2 CSV`** — standard working hours (stored as minutes). |
| attendance_policy_id | UUID | FK → attendance_policies (E32), NULL | **`v3.2 CSV`** — governing attendance policy. |
| overtime_policy_id | UUID | FK → overtime_policies (E33), NULL | **`v3.2 CSV`** — OT policy enabled in the shift. |
| shift_config | JSONB | NULL | **`v3.2 CSV`** — null-shift, alt-work-schedule, no-OT-on-day toggles (**config, not data**). |

#### E2 `rosters` (EXTEND M05)
| Field | Type | Constraints | Description |
|---|---|---|---|
| roster_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees (G01), NOT NULL | Assignee. |
| shift_id | UUID | FK → shifts, NOT NULL | Assigned shift. |
| effective_from | DATE | NOT NULL | Start (`VAL-EFFECTIVE`). |
| effective_to | DATE | NULL | End (open = current). |
| weekly_off_pattern | JSONB | NOT NULL | e.g. `["SUN","SAT2","SAT4"]` (App. B). |
| assigned_by | UUID | FK → users | Creator. |
| status | ENUM | NOT NULL | `DRAFT`/`PUBLISHED`/`SUPERSEDED`. |

Constraint: no overlapping `PUBLISHED` roster for the same `employee_id`/date range (`VAL-G03-ROSTER-OVERLAP`).

#### E3 `holiday_calendars` (EXTEND M05)
| Field | Type | Constraints | Description |
|---|---|---|---|
| calendar_id | UUID | PK | Identity. |
| calendar_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key e.g. `HQ-2026`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| year | INT | NOT NULL | Calendar year. |
| location_scope_id | UUID | FK → org_units | Location/region scope. |
| rh_cap | INT | NOT NULL, DEFAULT 2 | RH election cap (overridable via module_config). |
| status | ENUM | NOT NULL | `DRAFT`/`PUBLISHED`/`ARCHIVED`. |

#### E4 `holidays` (EXTEND M05)
| Field | Type | Constraints | Description |
|---|---|---|---|
| holiday_id | UUID | PK | Identity. |
| calendar_id | UUID | FK → holiday_calendars, NOT NULL | Parent. |
| holiday_date | DATE | NOT NULL | Date. |
| name | VARCHAR(120) | NOT NULL | e.g. "Republic Day". |
| holiday_type | ENUM | NOT NULL | `GAZETTED`/`RESTRICTED`/`SECTIONAL`/`OPTIONAL`. |
| is_restricted_optional | BOOLEAN | NOT NULL, DEFAULT false | Employee-elective (RH). |
| day_name | VARCHAR(12) | NULL | **`v3.2 CSV`** — day-of-week label (Sunday…). |
| repeat_next_year | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Repeat Next Year (import-forward). |
| is_national | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Holiday Type National(2). |
| recurrence_type | ENUM (`g03_holiday_recurrence`) | NOT NULL, DEFAULT `STATIC_DATE` | **`v3.2 CSV`** — `STATIC_DATE`/`DAY_OF_MONTH`. |
| recurrence_config | JSONB | NULL | **`v3.2 CSV`** — `{occurrence, month, day}` for `DAY_OF_MONTH`. |
| holiday_category | ENUM (`g03_holiday_category`) | NULL | **`v3.2 proto`** — `NATIONAL`/`REGIONAL`/`RELIGIOUS`/`COMPANY_SPECIFIC`. |
| description | TEXT | NULL | **`v3.2 proto`** — notes / description. |

Constraint: UNIQUE(`calendar_id`,`holiday_date`) (`VAL-G03-HOLIDAY-DUP`).

#### E5 `attendance_devices` (EXTEND M05; registered in P04)
| Field | Type | Constraints | Description |
|---|---|---|---|
| device_id | UUID | PK | Identity (device + IP registered in **P04** before use, Platform §P04). |
| device_code | VARCHAR(40) | UNIQUE per tenant, NOT NULL | Serial/registration key. |
| device_type | ENUM | NOT NULL | `BIOMETRIC`/`RFID`/`MOBILE_APP`/`WEB`. |
| location_org_unit_id | UUID | FK → org_units | Physical placement. |
| geofence | JSONB | NULL | Lat/long + radius. |
| api_key_hash | VARCHAR(255) | NULL | Hashed device credential; rotation via **P04 `integration_credentials`** (never plaintext). |
| supports_liveness | BOOLEAN | NOT NULL, DEFAULT false | Liveness/photo capability. |
| binding_mode | ENUM | NOT NULL, DEFAULT `OPEN` | `OPEN`/`EMPLOYEE_BOUND`. |
| template_storage | ENUM | NOT NULL, DEFAULT `ON_DEVICE` | `ON_DEVICE`/`SERVER_ENCRYPTED`/`NONE` (DPDPA). |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`/`DECOMMISSIONED`. |
| last_seen_at | TIMESTAMPTZ | NULL | Heartbeat. |
| biometric_modality | ENUM (`g03_biometric_modality`) | NULL | **`v3.2 proto`** (FR-M05-006) — `FINGERPRINT`/`FACE`/`IRIS`/`CARD`/`NONE`. |

#### E6 `attendance_punches` (EXTEND M05; append-only; +P05 trigger)
| Field | Type | Constraints | Description |
|---|---|---|---|
| punch_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| device_id | UUID | FK → attendance_devices | Source. |
| punch_time | TIMESTAMPTZ | NOT NULL | Event time (UTC). |
| attendance_date | DATE | NOT NULL | Shift-anchored local date (App. B). |
| punch_direction | ENUM | NULL | `IN`/`OUT`/`AUTO`. |
| capture_method | ENUM | NOT NULL | `BIOMETRIC`/`RFID`/`MOBILE_GEO`/`WEB`/`MANUAL`/`OTP_FALLBACK`. |
| geo_lat / geo_long | NUMERIC(9,6) | NULL | Mobile coordinates (PII-ceiling; purpose-bound). |
| photo_document_id | UUID | FK → documents (G13), NULL | Photo-on-punch. |
| liveness_score | NUMERIC(4,3) | NULL | 0–1 confidence. |
| consent_id | UUID | FK → biometric_consents, NULL | Governing consent at capture (`VAL-CONSENT`). |
| source_ref | VARCHAR(120) | NULL | Device-side raw event id (idempotency). |
| ingestion_status | ENUM | NOT NULL | `ACCEPTED`/`DUPLICATE`/`REJECTED`/`FLAGGED_FOR_REVIEW`. |
| anomaly_flags | JSONB | NULL | e.g. `["IMPOSSIBLE_TRAVEL"]`. |

Constraint: UNIQUE(`device_id`,`source_ref`) for idempotent ingestion. Append-only.

#### E7 `attendance_daily` (EXTEND M05; derived rollup)
| Field | Type | Constraints | Description |
|---|---|---|---|
| attendance_daily_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| attendance_date | DATE | NOT NULL | Day. |
| roster_id | UUID | FK → rosters | Applicable assignment. |
| first_in / last_out | TIMESTAMPTZ | NULL | Earliest IN / latest OUT. |
| worked_minutes | INT | NOT NULL, DEFAULT 0 | Computed. |
| status | ENUM | NOT NULL | Derived rollup over allocations (R2). |
| present_units | NUMERIC(3,2) | NOT NULL, DEFAULT 0 | Σ present-counting allocation fractions (feeds FR-17). |
| late_minutes / early_exit_minutes | INT | NOT NULL, DEFAULT 0 | Lateness / early departure. |
| leave_application_id | UUID | FK → leave_applications, NULL | Primary leave linkage. |
| is_regularised | BOOLEAN | NOT NULL, DEFAULT false | Corrected via FR-05. |
| processing_run_id | UUID | FK → attendance_processing_runs, NULL | Batch (`JOB-M05-CLOSE` extended). |

Constraint: UNIQUE(`employee_id`,`attendance_date`). **FR-04 is the sole writer (R15).**

#### E8 `regularisation_requests` (EXTEND M05; P01 flow; `VAL-AT`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| regularisation_id | UUID | PK | Identity. |
| attendance_daily_id | UUID | FK → attendance_daily, NOT NULL | Day corrected. |
| employee_id | UUID | FK → employees, NOT NULL | Requester. |
| requested_status | ENUM | NOT NULL | Target status. |
| proposed_first_in / proposed_last_out | TIMESTAMPTZ | NULL | Corrected times. |
| reason | TEXT | NOT NULL | Justification (`VAL-COMMENT`). |
| supporting_document_id | UUID | FK → documents | Optional proof (`VAL-FILE`). |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Approval chain. |
| status | ENUM | NOT NULL | `DRAFT`/`SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |

#### E9 `overtime_records` (EXTEND M05; P01 flow)
| Field | Type | Constraints | Description |
|---|---|---|---|
| overtime_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| attendance_date | DATE | NOT NULL | Day worked OT. |
| ot_minutes | INT | NOT NULL | Approved minutes. |
| ot_treatment | ENUM | NOT NULL | `PAID`/`COMP_OFF`. |
| rate_multiplier | NUMERIC(4,2) | NULL | e.g. 1.5/2.0. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Approval. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`PAID`/`CONVERTED_TO_COMPOFF`. |
| overtime_policy_id | UUID | FK → overtime_policies (E33), NULL | **`v3.2 CSV`** — governing OT policy (lineage). |
| reason | TEXT | NULL | **`v3.2 proto`** (FR-M05-008) — reason / comments (request-ot). |
| worked_on_holiday | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 proto`** — worked on holiday. |
| worked_on_weekly_off | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 proto`** — worked on weekly off. |

#### E10 `attendance_exceptions` (EXTEND M05; WFH/On-Duty/Tour; P01 flow)
| Field | Type | Constraints | Description |
|---|---|---|---|
| exception_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| exception_type | ENUM | NOT NULL | `WFH`/`ON_DUTY`/`TOUR`. |
| start_date / end_date | DATE | NOT NULL | Range. |
| day_portion | ENUM | NOT NULL, DEFAULT `FULL` | `FULL`/`FIRST_HALF`/`SECOND_HALF`. |
| location_text | VARCHAR(200) | NULL | Tour/OD location. |
| reason | TEXT | NOT NULL | Purpose. |
| supporting_document_id | UUID | FK → documents | Tour order/approval. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Approval. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |

#### E11 `comp_off_ledger` (EXTEND M04/M05; append-only; sole comp-off source, R17; +P05 trigger)
| Field | Type | Constraints | Description |
|---|---|---|---|
| comp_off_entry_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| entry_type | ENUM | NOT NULL | `EARN`/`REDEEM`/`EXPIRE`/`ADJUST`. |
| days | NUMERIC(4,2) | NOT NULL | Signed quantity. |
| source_ref_type | ENUM | NULL | `OVERTIME`/`HOLIDAY_WORK`/`LEAVE_APPLICATION`/`MANUAL`. |
| source_ref_id | UUID | NULL | Originating record. |
| earned_on / expires_on | DATE | NULL | Earn date / expiry (`JOB-M04-SMART` reminder). |
| balance_after | NUMERIC(6,2) | NOT NULL | Running balance. |
| remarks | TEXT | NULL | Note. |
| overtime_policy_id | UUID | FK → overtime_policies (E33), NULL | **`v3.2 CSV`** — governing OT policy (comp-off credit lineage). |

#### E12 `leave_types` (EXTEND M04 + `G03 ext`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| leave_type_id | UUID | PK | Identity. |
| leave_code | VARCHAR(20) | UNIQUE per tenant, NOT NULL | `CL`,`EL`,`HPL`,`COMMUTED`,`MAT`,`PAT`,`CCL`,`STUDY`,`MED`,`SAB`,`LWP`,`COMPOFF`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| category | ENUM | NOT NULL | `PAID`/`HALF_PAY`/`UNPAID`/`SPECIAL`. |
| is_accruable | BOOLEAN | NOT NULL | Accrual engine grants it. |
| is_sanction_based | BOOLEAN | NOT NULL, DEFAULT false | **`G03 ext`** — governed by entitlement counter (E24), not accruable balance. |
| is_encashable | BOOLEAN | NOT NULL | In-service encashment eligible. |
| is_encashable_on_retirement | BOOLEAN | NOT NULL, DEFAULT false | **`G03 ext`** — retirement-only encash (HPL make-up). |
| affects_pay | BOOLEAN | NOT NULL | Triggers LWP/half-pay (`JOB-M04-LOP`). |
| gender_eligibility | ENUM | NOT NULL | `ALL`/`FEMALE`/`MALE`. |
| requires_document | BOOLEAN | NOT NULL | Medical needs certificate (`VAL-FILE`). |
| debit_ratio | NUMERIC(4,2) | NOT NULL, DEFAULT 1.00 | **`G03 ext`** — units per availed day (COMMUTED = 2.00). |
| debits_against_leave_type_id | UUID | FK → leave_types, NULL | **`G03 ext`** — pot debited (COMMUTED → HPL). |
| year_basis | ENUM | NOT NULL, DEFAULT `CALENDAR` | **`G03 ext`** — `CALENDAR`/`FINANCIAL`/`CAREER`/`EVENT`. |
| sandwich_rule | ENUM | NOT NULL, DEFAULT `EXCLUDE` | **`G03 ext`** — `EXCLUDE`/`INCLUDE_IF_SANDWICHED`/`ALWAYS_INCLUDE` (binds `JOB-M04-SANDWICH`). |
| requires_return_to_work_cert | BOOLEAN | NOT NULL, DEFAULT false | RTW workflow after long medical. |
| max_continuous_days | INT | NULL | Statutory cap. |
| applicable_cadre_ids | JSONB | NULL | Cadre restriction. |
| status | ENUM | NOT NULL | `ACTIVE`/`INACTIVE`. |
| is_hourly_leave | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Is Hourly Leave? |
| hours_per_day | NUMERIC(4,2) | NULL | **`v3.2 CSV`** — No of Hours in a Day (hourly-leave basis). |
| hourly_min_minutes | INT | NULL | **`v3.2 CSV`** — min leave duration per application (minutes). |
| hourly_multiple_minutes | INT | NULL | **`v3.2 CSV`** — allow hourly leave only in multiples of (minutes). |
| allow_hourly_across_midnight | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — allow hourly leave across midnight. |
| max_days_per_year | NUMERIC(6,2) | NULL | **`v3.2 CSV`** — Maximum Leave Allowed Per Year. |
| max_availed_per_year | NUMERIC(6,2) | NULL | **`v3.2 CSV`** — Maximum Leave that can be availed per year. |
| max_days_per_month | NUMERIC(6,2) | NULL | **`v3.2 CSV`** — Maximum Leave Allowed Per Month. |
| min_advance_notice_days | INT | NULL | **`v3.2 CSV`** — minimum advance notice for application (days). |
| max_future_apply_days | INT | NULL | **`v3.2 CSV`** — max number of future days leave is allowed for. |
| allow_half_day | BOOLEAN | NOT NULL, DEFAULT true | **`v3.2 CSV`** — Allow half-day. |
| attachment_mandatory_beyond_days | INT | NULL | **`v3.2 CSV`** — attachment mandatory if application > X days. |
| is_special_leave | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Is this a Special Leave. |
| has_unlimited_balance | BOOLEAN | NOT NULL, DEFAULT false | **`v3.2 CSV`** — Leave With Unlimited Balance. |
| leave_type_config | JSONB | NULL | **`v3.2 CSV`** — long-tail policy toggles (pro-rata, clubbing, prefix/suffix, block-leave, future-cycle, probation, display) (**config, not data**). |

> **Note (R17):** `COMPOFF` is a **redemption vehicle only** — no `leave_balances` row, no accrual policy; its balance lives solely in `comp_off_ledger`.

#### E13 `leave_accrual_policies` (EXTEND M04 + `G03 ext`; drives `JOB-M04-ACCRUAL`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| policy_id | UUID | PK | Identity. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Target type. |
| scope_org_unit_id / scope_cadre_id | UUID | FK, NULL | Applicability (null = global). |
| accrual_frequency | ENUM | NOT NULL | `ANNUAL`/`MONTHLY`/`HALF_YEARLY`/`ON_JOINING`/`NONE`. |
| accrual_quantity | NUMERIC(5,2) | NOT NULL | Units per cycle. |
| accrual_basis | ENUM | NOT NULL | `CALENDAR`/`SERVICE_LENGTH`/`ATTENDANCE_PRORATED`. |
| rounding_mode | ENUM | NOT NULL, DEFAULT `NEAREST_HALF_CARRY` | **`G03 ext`** — `NEAREST_HALF_CARRY`/`ROUND_DOWN`/`ROUND_UP`/`BANKERS`. |
| proration_method | ENUM | NOT NULL, DEFAULT `DAYS_IN_SERVICE_OVER_CYCLE` | **`G03 ext`** — mid-cycle join/exit formula. |
| suspend_accrual_on_lwp | BOOLEAN | NOT NULL, DEFAULT true | Suspend during LWP/SUSPENDED/dies-non (R19). |
| max_balance_cap | NUMERIC(6,2) | NULL | Ceiling. |
| carry_forward_allowed | BOOLEAN | NOT NULL | Year-end carry (`JOB-M04-CARRYFWD`). |
| carry_forward_cap / encashment_cap_days | NUMERIC(6,2) | NULL | Caps. |
| retirement_encash_cap_days | NUMERIC(6,2) | NULL | **`G03 ext`** — combined EL+HPL ceiling (e.g. 300). |
| lapse_rule | ENUM | NOT NULL | `LAPSE_EXCESS`/`NO_LAPSE`/`CONVERT_TO_HPL`. |
| min_balance_for_encash | NUMERIC(6,2) | NULL | Threshold. |
| advance_allowed | BOOLEAN | NOT NULL, DEFAULT false | Negative balance permitted. |
| effective_from / effective_to | DATE | NOT NULL / NULL | Version window (`VAL-EFFECTIVE`; config cascade). |
| status | ENUM | NOT NULL | `ACTIVE`/`SUPERSEDED`/`DRAFT`. |
| accrual_config | JSONB | NULL | **`v3.2 CSV`** — accrual-based-on working-days/hours, custom-accrual patterns, tenure/allotment brackets (**config, not data**). |

#### E14 `leave_balances` (EXTEND M04; derived snapshot)
| Field | Type | Constraints | Description |
|---|---|---|---|
| balance_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Type. |
| leave_year | INT | NOT NULL | Per type `year_basis`. |
| opening_balance / accrued / availed / encashed / lapsed | NUMERIC(6,2) | NOT NULL (DEFAULT 0) | YTD components. |
| reserved | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | **`G03 ext`** — active soft-reserve total (from E21). |
| current_balance | NUMERIC(6,2) | NOT NULL | Live balance (reconciles to ledger). |
| available_balance | NUMERIC(6,2) | NOT NULL | **`G03 ext`** — `current_balance − reserved`. |
| version | BIGINT | NOT NULL, DEFAULT 0 | **`G03 ext`** — optimistic-lock version (R1/R2). |
| last_ledger_entry_id | UUID | FK → leave_balance_ledger | Reconciliation anchor. |

Constraint: UNIQUE(`employee_id`,`leave_type_id`,`leave_year`).

#### E15 `leave_balance_ledger` (EXTEND M04; append-only single source of truth; +P05 trigger)
| Field | Type | Constraints | Description |
|---|---|---|---|
| ledger_entry_id | UUID | PK | Identity. |
| employee_id / leave_type_id | UUID | FK, NOT NULL | Owner / type. |
| leave_year | INT | NOT NULL | Year. |
| entry_type | ENUM | NOT NULL | `ACCRUAL`/`OPENING`/`AVAIL`/`AVAIL_REVERSAL`/`ENCASHMENT`/`LAPSE`/`CARRY_FORWARD`/`ADJUSTMENT`/`HPL_CONVERSION`/`CLAWBACK`. |
| amount | NUMERIC(6,2) | NOT NULL | Signed (+credit / −debit). |
| balance_after | NUMERIC(6,2) | NOT NULL | Running balance. |
| source_ref_type | ENUM | NULL | `LEAVE_APPLICATION`/`ACCRUAL_RUN`/`YEAR_CLOSE`/`ENCASHMENT`/`MANUAL`/`EXIT_CLAWBACK`. |
| source_ref_id | UUID | NULL | Originating record. |
| effective_date | DATE | NOT NULL | When effective. |
| remarks | TEXT | NULL | Note. |
| reversed_by_entry_id | UUID | FK → self, NULL | If reversed. |

#### E16 `leave_applications` (EXTEND M04; P01 flow)
| Field | Type | Constraints | Description |
|---|---|---|---|
| application_id | UUID | PK | Identity. |
| application_no | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key. |
| employee_id / leave_type_id | UUID | FK, NOT NULL | Applicant / type. |
| start_date / end_date | DATE | NOT NULL | Range (`VAL-DATE`). |
| total_days | NUMERIC(5,2) | NOT NULL | Per `sandwich_rule` & `debit_ratio`. |
| ledger_debit_units | NUMERIC(6,2) | NOT NULL | `total_days × debit_ratio`. |
| reason | TEXT | NOT NULL | Justification. |
| is_backdated | BOOLEAN | NOT NULL, DEFAULT false | Past-dated flag. |
| contact_during_leave | VARCHAR(120) | NULL | Address/phone. |
| supporting_document_id | UUID | FK → documents | Medical cert / order. |
| reservation_id | UUID | FK → leave_reservations, NULL | Active soft-reserve. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Approval chain. |
| status | ENUM | NOT NULL | `DRAFT`/`SUBMITTED`/`RECOMMENDED`/`APPROVED`/`REJECTED`/`CANCELLED`/`WITHDRAWN`. |
| sr_posting_status | ENUM | NOT NULL | `NOT_REQUIRED`/`PENDING`/`POSTED`/`FAILED` (consumed via **G04**). |
| leave_spell_lineage_id | UUID | NOT NULL | Stable correlation key for the leave spell, constant across approve→amend→cancel. Minted by G03 and exposed on the signed approved-leave event consumed by **G04** (G04 FR-01 correlation key); G04 dedupes by `leave_spell_lineage_id + event_sequence`. G03 emits the event to G04 and never calls `POST /api/v1/sr/ingest`. |
| return_to_work_status | ENUM | NULL | `NOT_REQUIRED`/`PENDING`/`CLEARED`. |
| applied_on_behalf_by | UUID | FK → users, NULL | HR proxy. |
| approver_note | TEXT | NULL | **`v3.2 proto`** — message to approver ("optional context for your manager"); distinct from `reason`. |
| hourly_minutes | INT | NULL | **`v3.2 proto`** (FR-M04-017) — hourly-leave duration; `total_days` remains the debit basis. |

#### E17 `leave_application_days` (EXTEND M04)
| Field | Type | Constraints | Description |
|---|---|---|---|
| application_day_id | UUID | PK | Identity. |
| application_id | UUID | FK → leave_applications, NOT NULL | Parent. |
| leave_date | DATE | NOT NULL | Day. |
| day_portion | ENUM | NOT NULL | `FULL`/`FIRST_HALF`/`SECOND_HALF`. |
| day_units | NUMERIC(3,2) | NOT NULL | 1.0 / 0.5. |
| is_non_working | BOOLEAN | NOT NULL, DEFAULT false | Holiday/weekly-off; counted per `sandwich_rule`. |

Constraint: UNIQUE(`application_id`,`leave_date`); **`SUM(day_units)` = `leave_applications.total_days`** (`VAL-G03-DAYUNITS`).

#### E18 `leave_encashment_requests` (EXTEND M04 + `G03 ext`; P01 flow)
| Field | Type | Constraints | Description |
|---|---|---|---|
| encashment_id | UUID | PK | Identity. |
| employee_id / leave_type_id | UUID | FK, NOT NULL | Owner / type. |
| encashment_type | ENUM | NOT NULL | `IN_SERVICE`/`RETIREMENT`/`LTC`. |
| days_requested / days_approved | NUMERIC(6,2) | NOT NULL / NULL | Quantity. |
| el_days_component / hpl_days_component | NUMERIC(6,2) | NULL | **`G03 ext`** — retirement EL/HPL split (R5). |
| ltc_block_ref | VARCHAR(30) | NULL | **`G03 ext`** — LTC 4-yr block id (R12). |
| amount_estimated | NUMERIC(12,2) | NULL | Indicative (G10 computes final). |
| effective_date | DATE | NOT NULL | Settlement date. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Approval. |
| payroll_feed_id | UUID | FK → payroll_attendance_feed, NULL | Export linkage. |
| status | ENUM | NOT NULL | `SUBMITTED`/`APPROVED`/`REJECTED`/`SETTLED`/`CANCELLED`. |

#### E19 `leave_year_close_runs` (EXTEND M04; `JOB-M04-CARRYFWD`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| close_run_id | UUID | PK | Identity. |
| leave_year | INT | NOT NULL | Year being closed. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope. |
| run_status | ENUM | NOT NULL | `DRAFT`/`SIMULATED`/`COMMITTED`/`FAILED`. |
| employees_processed | INT | NOT NULL, DEFAULT 0 | Count. |
| total_carried / total_lapsed / total_converted | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Sums. |
| executed_by | UUID | FK → users | Operator. |
| simulation_report_doc_id | UUID | FK → documents, NULL | Dry-run output. |

#### E20 `payroll_attendance_feed` (EXTEND M04/M05; `JOB-*-LOP`; X.3 outbound)
| Field | Type | Constraints | Description |
|---|---|---|---|
| feed_id | UUID | PK | Identity. |
| pay_period | VARCHAR(7) | NOT NULL | `YYYY-MM`. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| lwp_days / half_pay_days | NUMERIC(5,2) | NOT NULL, DEFAULT 0 | LOP / HPL days. |
| paid_ot_minutes | INT | NOT NULL, DEFAULT 0 | Payable OT. |
| present_units | NUMERIC(5,2) | NOT NULL | Present-counting units (R2). |
| encashment_amount | NUMERIC(12,2) | NOT NULL, DEFAULT 0 | Encashment to pay. |
| export_status | ENUM | NOT NULL | `PENDING`/`EXPORTED`/`ACKED`/`FAILED`. |
| is_locked | BOOLEAN | NOT NULL, DEFAULT false | Locked after export (`JOB-M05-LOCK`). |
| exported_at | TIMESTAMPTZ | NULL | Timestamp. |
| g10_batch_ref | VARCHAR(60) | NULL | Payroll-side ack ref (G10). |

Constraint: UNIQUE(`pay_period`,`employee_id`).

#### E21 `leave_reservations` (G03 new — R1)
| Field | Type | Constraints | Description |
|---|---|---|---|
| reservation_id | UUID | PK | Identity. |
| employee_id / leave_type_id | UUID | FK, NOT NULL | Owner / type. |
| leave_year | INT | NOT NULL | Year. |
| application_id | UUID | FK → leave_applications, NOT NULL | Source. |
| reserved_units | NUMERIC(6,2) | NOT NULL | Held quantity (post debit_ratio). |
| status | ENUM | NOT NULL | `RESERVED`/`RELEASED`/`CONSUMED`. |
| expires_at | TIMESTAMPTZ | NULL | Auto-release TTL (`RESERVATION_TTL_MIN`). |

#### E22 `attendance_day_allocations` (G03 new — R2)
| Field | Type | Constraints | Description |
|---|---|---|---|
| allocation_id | UUID | PK | Identity. |
| attendance_daily_id | UUID | FK → attendance_daily, NOT NULL | Parent day. |
| employee_id | UUID | FK → employees, NOT NULL | Owner (denormalised). |
| attendance_date | DATE | NOT NULL | Day. |
| segment_status | ENUM | NOT NULL | `PRESENT`/`ON_LEAVE`/`WFH`/`ON_DUTY`/`HOLIDAY`/`WEEKLY_OFF`/`ABSENT`/`HALF_DAY`/`MISSING_PUNCH`. |
| day_fraction | NUMERIC(3,2) | NOT NULL, CHECK 0 < x ≤ 1.0 | Fraction of day. |
| counts_as_present | BOOLEAN | NOT NULL | Counts toward `present_units`. |
| source_ref_type | ENUM | NULL | `LEAVE_APPLICATION`/`EXCEPTION`/`PUNCH`/`HOLIDAY`/`SYSTEM`. |
| source_ref_id | UUID | NULL | Originating record. |

Constraint: `SUM(day_fraction)` per (`employee_id`,`attendance_date`) ≤ 1.0 (`VAL-G03-ALLOC`).

#### E23 `payroll_feed_adjustments` (G03 new — R6)
| Field | Type | Constraints | Description |
|---|---|---|---|
| adjustment_id | UUID | PK | Identity. |
| original_feed_id | UUID | FK → payroll_attendance_feed, NOT NULL | Locked period corrected. |
| applied_in_pay_period | VARCHAR(7) | NOT NULL | Next open period. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| adjustment_type | ENUM | NOT NULL | `LWP_DELTA`/`HALF_PAY_DELTA`/`OT_DELTA`/`PRESENT_DELTA`/`ENCASHMENT_DELTA`. |
| delta_value | NUMERIC(12,2) | NOT NULL | Signed correction. |
| reason | TEXT | NOT NULL | Source. |
| source_ref_type | ENUM | NOT NULL | `REGULARISATION`/`ROSTER_EDIT`/`HOLIDAY_EDIT`/`LEAVE_CANCEL`/`MANUAL`. |
| source_ref_id | UUID | NULL | Originating record. |
| status | ENUM | NOT NULL | `PENDING`/`EXPORTED`/`ACKED`. |

#### E24 `leave_entitlements` (G03 new — R7,R14; gov-specific)
| Field | Type | Constraints | Description |
|---|---|---|---|
| entitlement_id | UUID | PK | Identity. |
| employee_id / leave_type_id | UUID | FK, NOT NULL | Owner / sanction type. |
| quota_basis | ENUM | NOT NULL | `CAREER`/`EVENT`/`ANNUAL`. |
| total_quota_days | NUMERIC(6,2) | NOT NULL | e.g. CCL 730, Maternity 180. |
| consumed_days | NUMERIC(6,2) | NOT NULL, DEFAULT 0 | Used to date. |
| remaining_days | NUMERIC(6,2) | NOT NULL | Derived. |
| eligibility_predicate | JSONB | NULL | e.g. `{"surviving_children_max":2,"child_age_max":18}` (`VAL-DEPENDENT`). |
| valid_from / valid_to | DATE | NULL | Event-type window. |

Constraint: sanction avail checks `leave_entitlements` (not positive balance); ledger records informational `AVAIL`.

#### E25 `attendance_processing_runs` (G03 new — R8; X.1 job)
| Field | Type | Constraints | Description |
|---|---|---|---|
| run_id | UUID | PK | Identity. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope. |
| date_from / date_to | DATE | NOT NULL | Range. |
| trigger_type | ENUM | NOT NULL | `SCHEDULED`/`ON_DEMAND`/`RECOMPUTE_ENQUEUED`. |
| status | ENUM | NOT NULL | `QUEUED`/`RUNNING`/`COMPLETED`/`PARTIAL`/`FAILED` (runner per X.1). |
| employees_processed / employees_failed | INT | NOT NULL, DEFAULT 0 | Counts. |
| started_at / finished_at | TIMESTAMPTZ | NULL | Timing. |

#### E26 `rh_elections` (G03 new — R8)
| Field | Type | Constraints | Description |
|---|---|---|---|
| election_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Elector. |
| calendar_id | UUID | FK → holiday_calendars, NOT NULL | Calendar. |
| holiday_id | UUID | FK → holidays, NOT NULL | Elected RH (must be RESTRICTED). |
| leave_year | INT | NOT NULL | Year. |
| status | ENUM | NOT NULL | `ELECTED`/`CANCELLED`. |

Constraint: UNIQUE(`employee_id`,`holiday_id`); `ELECTED` count ≤ `rh_cap` (`VAL-G03-RHCAP`).

#### E27 `module_config` (G03 new — R8; effective-dated config cascade)
| Field | Type | Constraints | Description |
|---|---|---|---|
| config_id | UUID | PK | Identity. |
| config_key | VARCHAR(60) | NOT NULL | e.g. `REGULARISATION_WINDOW_DAYS`, `BACKDATE_WINDOW_DAYS`, `COMPOFF_VALIDITY_DAYS`, `RH_CAP`, `CONFLICT_THRESHOLD_PCT`, `CLOCK_SKEW_MIN`, `RESERVATION_TTL_MIN`, `BLACKOUT_PERIOD`, `MASS_LEAVE`. |
| config_value | JSONB | NOT NULL | Scalar/structured. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Scope (cascade: platform→tenant→entity→employee). |
| effective_from / effective_to | DATE | NOT NULL / NULL | Version window (`VAL-EFFECTIVE`). |
| status | ENUM | NOT NULL | `ACTIVE`/`SUPERSEDED`/`DRAFT`. |

Constraint: most-specific scope wins; no overlapping ACTIVE per (`config_key`,`scope`).

#### E28 `approval_delegations` (G03 new — R11; feeds P01 `delegate`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| delegation_id | UUID | PK | Identity. |
| delegator_user_id / delegate_user_id | UUID | FK → users, NOT NULL | Absent approver / stand-in. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Limited scope. |
| request_types | JSONB | NULL | e.g. `["LEAVE","REGULARISATION","OT"]`. |
| from_date / to_date | DATE | NOT NULL | Window. |
| auto_on_sla_breach | BOOLEAN | NOT NULL, DEFAULT true | Also fires on P01 SLA breach. |
| status | ENUM | NOT NULL | `ACTIVE`/`EXPIRED`/`REVOKED`. |

Constraint: `delegate_user_id` ≠ applicant; delegate holds approver role in scope (SoD enforced by P02).

#### E29 `employee_dependents` — **G01/M01-OWNED; referenced, NOT redefined** (R14)
> **Ownership:** `employee_dependents` is the **G01/M01-owned** canonical satellite of the employee master (G01 §5.4 E4). G03 **references it read-only** by `dependent_id`/`employee_id` and does **not** re-declare the table, its columns, or its `relationship` enum. CCL/Maternity eligibility (FR-22) consumes G01's canonical fields directly — `relationship` (enum `RELATIONSHIP`), `dob`/`is_minor`, `is_differently_abled`, `is_legal_heir`/`heir_succession_rank` — never a divergent local copy (no `relation`/`is_disabled` re-spelling). Any shared attribute G03 needs that G01 lacks is raised as a dependency-amendment to **G01** (Recon §D), not forked here.

#### E29a `dependent_leave_eligibility` (**G03 satellite** — R14; 1:1 FK → G01 `employee_dependents`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| dependent_id | UUID | PK, FK → employee_dependents (**G01/M01**) | One row per canonical G01 dependent; never restates G01 columns. |
| is_surviving | BOOLEAN | NOT NULL, DEFAULT true | Surviving-children predicate for the CCL ≤2-children rule — leave-specific; not exposed by the G01 canonical entity. |

> **Note:** This satellite carries **only** the leave-specific attribute G01 does not expose (`is_surviving`). All shared dependent attributes (`relationship`, `dob`, `is_differently_abled`, heir/succession) resolve from the G01 canonical entity; G03 never restates them. If G01 later adopts `is_surviving`, retire this satellite in favour of the canonical column (Recon §D).

#### E30 `biometric_consents` (G03 new — R9; links P05 `consent_records`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| consent_id | UUID | PK | Identity (mirrors a platform `consent_records` entry; immutable/superseded per P05). |
| employee_id | UUID | FK → employees, NOT NULL | Data principal. |
| lawful_basis | ENUM | NOT NULL | `STATUTORY_DUTY`/`CONSENT`/`EMPLOYMENT_CONTRACT` (`VAL-CONSENT`). |
| capture_types | JSONB | NOT NULL | e.g. `["BIOMETRIC","GEO","PHOTO"]`. |
| consent_status | ENUM | NOT NULL | `GRANTED`/`WITHDRAWN`/`NOT_REQUIRED`. |
| fallback_method | ENUM | NULL | `RFID`/`MANUAL`/`OTP`. |
| consent_document_id | UUID | FK → documents (G13), NULL | Signed artefact. |
| granted_at / withdrawn_at | TIMESTAMPTZ | NULL | Lifecycle. |
| retention_until | DATE | NULL | Purge anchor (App. E). |

#### E31 `punch_anomaly_reviews` (G03 new — R10; P01 review flow)
| Field | Type | Constraints | Description |
|---|---|---|---|
| review_id | UUID | PK | Identity. |
| punch_id | UUID | FK → attendance_punches, NOT NULL | Flagged punch. |
| employee_id | UUID | FK → employees, NOT NULL | Owner. |
| anomaly_type | ENUM | NOT NULL | `IMPOSSIBLE_TRAVEL`/`DUPLICATE_SECOND`/`GEO_MISMATCH`/`LOW_LIVENESS`/`DEVICE_BINDING_MISMATCH`. |
| detected_at | TIMESTAMPTZ | NOT NULL | When flagged. |
| reviewer_user_id | UUID | FK → users, NULL | Assigned reviewer (≠ owner; SoD via P02). |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**) | Review chain. |
| status | ENUM | NOT NULL | `OPEN`/`CONFIRMED_VALID`/`CONFIRMED_FRAUD`/`ESCALATED`. |
| resolution_notes | TEXT | NULL | Outcome. |

> **v3.2 field-reconciliation entities (E32–E40).** The following masters/transactionals were added by the CSV + prototype reconciliation passes (see `## Amendments (v3.1 → v3.2: field reconciliation)`). Every one carries the §5.1.1 tenancy + audit columns implicitly. Policy toggles remain in `*_config jsonb` / `module_config`, never as columns.

#### E32 `attendance_policies` (EXTEND M05 — v3.2 CSV; `Attendance_Policy_Export.csv`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| attendance_policy_id | UUID | PK | Identity. |
| policy_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key e.g. `ATPY_1`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| description | TEXT | NULL | Notes. |
| grace_in_minutes / grace_out_minutes | INT | NOT NULL, DEFAULT 0 | Grace for clock-in / last-punch. |
| include_grace_in_late / include_grace_in_early_out | BOOLEAN | NOT NULL, DEFAULT false | Grace treatment in late/early computation. |
| allow_wfh_checkin / allow_outduty_checkin | BOOLEAN | NOT NULL, DEFAULT false | Permit WFH / out-duty check-in. |
| mark_attendance_basis | VARCHAR(40) | NULL | "Mark attendance based on" (e.g. First-Last). |
| buffer_pre_minutes / buffer_post_minutes | INT | NOT NULL, DEFAULT 0 | Buffer before / after shift. |
| backdated_edit_limit_days | INT | NULL | Restrict editing back-dated attendance to (days). |
| roster_change_limit_days | INT | NULL | Restrict roster changes for past (days). |
| absconding_trigger_days | INT | NULL | Trigger absconding flow after (days). |
| optional_holiday_limit_days | INT | NULL | Limit availing optional holiday to (days). |
| auto_approve_optional_holiday | BOOLEAN | NOT NULL, DEFAULT false | Auto-approve optional-holiday requests. |
| night_shift_differential_enabled | BOOLEAN | NOT NULL, DEFAULT false | NSD enabled. |
| nsd_multiplier | NUMERIC(4,2) | NULL | NSD multiplier. |
| wfh_cap_per_month | INT | NULL | **`v3.2 proto`** (FR-M05-002) — WFH cap per month. |
| working_days_per_week | NUMERIC(3,1) | NULL | **`v3.2 proto`** — working days per week. |
| daily_required_minutes | INT | NULL | **`v3.2 proto`** — daily hours required (minutes). |
| policy_config | JSONB | NULL | ~230 request-window, leave-deduction, hide/display toggles (**config, not data**). |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

#### E33 `overtime_policies` (EXTEND M04/M05 — v3.2 CSV; `Tenant_Leaves_Compoff_Export.csv` + slabs/threshold/indexing)
| Field | Type | Constraints | Description |
|---|---|---|---|
| overtime_policy_id | UUID | PK | Identity. |
| policy_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key e.g. `OVPY_7`. |
| name | VARCHAR(120) | NOT NULL | Display name. |
| description | TEXT | NULL | Notes. |
| calculation_frequency | ENUM (`g03_ot_calc_frequency`) | NOT NULL, DEFAULT `DAILY` | `DAILY`/`WEEKLY`/`BIWEEKLY`/`SEMI_MONTHLY`/`MONTHLY`/`QUARTERLY`/`YEARLY`. |
| compensation | ENUM (`g03_ot_treatment`) | NOT NULL, DEFAULT `COMP_OFF` | Compensate via `PAID`/`COMP_OFF`. |
| min_ot_minutes | INT | NOT NULL, DEFAULT 0 | Minimum duration to consider for OT. |
| daily/weekly/monthly/yearly_cap_minutes | INT | NULL | Max OT per day/week/month/year. |
| weekday/weekly_off/holiday/nsd_multiplier | NUMERIC(4,2) | NULL | Rate multipliers by day type / NSD. |
| compoff_min_minutes_full / compoff_min_minutes_half | INT | NULL | Min duration to credit one / half day comp-off. |
| compoff_lapse_days | INT | NULL | Comp-off credit lapse (days). |
| compoff_max_per_month | NUMERIC(4,2) | NULL | Max comp-off leave allowed in a month. |
| slabs | JSONB | NULL | `[{slab_name, multiplication_factor}]` (Overtime_Slabs). |
| thresholds | JSONB | NULL | `{weekly_pct, monthly_pct, quarterly_pct, yearly_pct}` (Overtime_Threshold). |
| indexing_rules | JSONB | NULL | Standard/custom OT indexing (Overtime-Policy-Indexing-Rules). |
| policy_config | JSONB | NULL | Per-frequency approval routing, rounding, deduction rules (**config, not data**). |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

#### E34 `attendance_networks` (G03 new — v3.2 CSV; `Attendance_Ip_Export.csv`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| network_id | UUID | PK | Identity. |
| network_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key e.g. `IPRS_1`. |
| name | VARCHAR(120) | NOT NULL | Network name. |
| ip_from / ip_to | INET | NOT NULL | IP-restriction range bounds. |
| tag | VARCHAR(60) | NULL | Tag (e.g. "Hyderabad Office"). |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

#### E35 `geofences` (G03 new — v3.2 CSV+proto; `Geofencing-Export.csv`)
| Field | Type | Constraints | Description |
|---|---|---|---|
| fence_id | UUID | PK | Identity. |
| fence_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | Human key e.g. `GFRS_1`. |
| name | VARCHAR(120) | NOT NULL | Fencing name. |
| latitude / longitude | NUMERIC(9,6) | NOT NULL | Fence centre. |
| radius_meters | INT | NOT NULL, CHECK > 0 | Distance (radius). |
| tag | VARCHAR(60) | NULL | Tags. |
| location_org_unit_id | UUID | FK → org_units, NULL | Assigned location / work-area. |
| address | TEXT | NULL | **`v3.2 proto`** (FR-M05-004) — full street address. |
| max_employees | INT | NULL | **`v3.2 proto`** — office capacity / max employees. |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

> Distinct from `attendance_devices.geofence` (per-device inline point) — `geofences` is the **named, reusable, location-assignable** fence master.

#### E36 `leave_reasons` (EXTEND M04 — v3.2 proto; `leave-reasons`, FR-M04-003)
| Field | Type | Constraints | Description |
|---|---|---|---|
| leave_reason_id | UUID | PK | Identity (tenant-wide catalog → `entity_id` NULLABLE). |
| reason_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | e.g. `MED_SELF`, `BEREAVEMENT`. |
| name | VARCHAR(120) | NOT NULL | Reason name. |
| category | VARCHAR(40) | NULL | Medical/Compassionate/Family/Statutory (tenant-configurable). |
| description | TEXT | NULL | Shown in the leave dropdown. |
| applicable_leave_type_ids | JSONB | NULL | Applicable leave types e.g. `["SL","HPL"]`. |
| doc_required | BOOLEAN | NOT NULL, DEFAULT false | Documentation required. |
| hrbp_auto_route | BOOLEAN | NOT NULL, DEFAULT false | HRBP auto-route. |
| auto_approve_threshold_days | NUMERIC(5,2) | NULL | Auto-approve threshold (days). |
| effective_from | DATE | NULL | Effective from. |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

#### E37 `attendance_reasons` (EXTEND M05 — v3.2 proto; `attendance-reasons`, FR-M05-005)
| Field | Type | Constraints | Description |
|---|---|---|---|
| attendance_reason_id | UUID | PK | Identity (tenant-wide catalog → `entity_id` NULLABLE). |
| reason_code | VARCHAR(30) | UNIQUE per tenant, NOT NULL | e.g. `SWIPE_LOST_CARD`, `SYS`, `WFH`. |
| name | VARCHAR(120) | NOT NULL | Reason name. |
| category | VARCHAR(40) | NULL | MISS/MED/SYS/TRV/TRN/EMRG/WFH (tenant-configurable). |
| description | TEXT | NULL | Visible to employees. |
| applicable_scope | JSONB | NULL | Applicable to (regularisation kinds / leave types). |
| doc_required | BOOLEAN | NOT NULL, DEFAULT false | Documentation required. |
| auto_approve | BOOLEAN | NOT NULL, DEFAULT false | Always auto-approve (e.g. system downtime). |
| auto_approve_threshold_days | NUMERIC(5,2) | NULL | Auto-approve threshold. |
| frequency_cap | INT | NULL | Usage limit per period (null = unlimited). |
| frequency_period | VARCHAR(20) | NULL | `MONTH`/`QUARTER`/`YEAR`. |
| status | ENUM | NOT NULL, DEFAULT `ACTIVE` | `ACTIVE`/`INACTIVE`. |

#### E38 `leave_balance_adjustments` (G03 new — v3.2 proto; `leave-balance-adjust`, FR-M04-021)
| Field | Type | Constraints | Description |
|---|---|---|---|
| adjustment_id | UUID | PK | Identity. |
| employee_id | UUID | FK → employees, NOT NULL | Subject. |
| leave_type_id | UUID | FK → leave_types, NOT NULL | Adjusted type. |
| adjustment_type | ENUM (`g03_leave_adjustment_type`) | NOT NULL | `CREDIT`/`DEBIT`/`RESET`. |
| amount_days | NUMERIC(6,2) | NULL | For `CREDIT`/`DEBIT` (signed magnitude). |
| reset_to_value | NUMERIC(6,2) | NULL | For `RESET` (target balance). |
| reason_category | VARCHAR(60) | NULL | One-time award / prior-period correction / … |
| detailed_reason | TEXT | NOT NULL | Justification (audit-logged). |
| supporting_reference | VARCHAR(120) | NULL | Ticket ID, email, etc. |
| effective_date | DATE | NOT NULL | Effective date. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**), NULL | Approval chain. |
| resulting_ledger_entry_id | UUID | FK → leave_balance_ledger, NULL | Posted `ADJUSTMENT` entry once applied. |
| status | ENUM (`g03_adjustment_status`) | NOT NULL, DEFAULT `SUBMITTED` | `SUBMITTED`/`APPROVED`/`REJECTED`/`APPLIED`/`CANCELLED`. |

> Mirrors the `leave_encashment_requests` pattern (approvable request → posts to the append-only `leave_balance_ledger`).

#### E39 `leave_revocations` (G03 new — v3.2 proto; `leave-revocation`, FR-M04-005)
| Field | Type | Constraints | Description |
|---|---|---|---|
| revocation_id | UUID | PK | Identity. |
| application_id | UUID | FK → leave_applications, NOT NULL | Approved leave being revoked. |
| employee_id | UUID | FK → employees, NOT NULL | Subject. |
| revocation_type | ENUM (`g03_revocation_type`) | NOT NULL, DEFAULT `FULL` | `FULL` (Phase-1) / `PARTIAL`. |
| days_to_revoke | NUMERIC(5,2) | NULL | Days revoked. |
| reason_category | VARCHAR(60) | NULL | Admin correction / employee returned early / … |
| detailed_reason | TEXT | NOT NULL | Justification (audit-logged). |
| refund_to_balance | BOOLEAN | NOT NULL, DEFAULT true | Refund to balance (posts `AVAIL_REVERSAL`). |
| initiated_by | UUID | FK → users, NULL | Initiator. |
| workflow_instance_id | UUID | FK → workflow_instances (**P01**), NULL | Approval chain. |
| resulting_ledger_entry_id | UUID | FK → leave_balance_ledger, NULL | Posted `AVAIL_REVERSAL` refund entry. |
| status | ENUM (`g03_regularisation_status`) | NOT NULL, DEFAULT `SUBMITTED` | Reuses `DRAFT`/`SUBMITTED`/`APPROVED`/`REJECTED`/`CANCELLED`. |

> Post-approval revocation of an already-approved leave — distinct from pre-start withdrawal captured by `leave_applications.status = WITHDRAWN`.

#### E40 `attendance_lock_periods` (G03 new — v3.2 proto; `attendance-lock`, FR-M05-007)
| Field | Type | Constraints | Description |
|---|---|---|---|
| lock_period_id | UUID | PK | Identity. |
| lock_month | VARCHAR(7) | NOT NULL | `YYYY-MM`. |
| scope_org_unit_id | UUID | FK → org_units, NULL | Org scope (null = entity-wide). |
| lock_deadline | DATE | NULL | Cycle lock deadline. |
| total_employee_days | INT | NULL | Employee-days in the cycle. |
| pending_at_lock | INT | NULL | Pending regularisations at lock. |
| resolution_mode | ENUM (`g03_lock_resolution_mode`) | NOT NULL, DEFAULT `MANUAL` | `AUTO_APPROVE`/`AUTO_DENY`/`MANUAL`. |
| auto_trigger_payroll | BOOLEAN | NOT NULL, DEFAULT false | Auto-trigger M06 payroll on lock. |
| lock_note | TEXT | NULL | Visible in the audit log. |
| locked_by | UUID | FK → users, NULL | Locking actor. |
| locked_at | TIMESTAMPTZ | NULL | Lock timestamp. |
| payroll_status | VARCHAR(60) | NULL | e.g. "Payroll closed 12 Feb". |
| payroll_closed_at | TIMESTAMPTZ | NULL | Payroll close timestamp. |
| status | ENUM (`g03_lock_status`) | NOT NULL, DEFAULT `OPEN` | `OPEN`/`LOCKED`/`REOPENED`. |

Constraint: UNIQUE(`tenant_id`,`lock_month`,`scope_org_unit_id`). Distinct from the per-employee `payroll_attendance_feed.is_locked` flag.

### 5.3 Relationship map (re-grounded)
```
employees (G01/M01) 1───∞ rosters ∞───1 shifts                      [EXTEND M05]
employees 1───∞ attendance_punches ───∞ attendance_devices (reg. in P04)
attendance_punches 0..1───1 biometric_consents (↔ P05 consent_records) ; punch(flagged) 1───∞ punch_anomaly_reviews ──> P01
employees 1───∞ attendance_daily 1───∞ attendance_day_allocations    (Σ day_fraction ≤ 1.0)
attendance_daily ∞───1 attendance_processing_runs                    (X.1 job)
attendance_daily 1───∞ regularisation_requests ──> P01
overtime_records / holidays-worked ──> comp_off_ledger (sole comp-off balance) [EXTEND M04/M05]
leave_types 1───∞ leave_accrual_policies (scoped, versioned, config cascade)   [EXTEND M04]
leave_types (COMMUTED).debits_against ──> leave_types (HPL)          (2:1 debit, R4)
leave_types (sanction) 1───∞ leave_entitlements ∞───1 employees      (R7, gov-specific)
employees 1───∞ employee_dependents (CCL/Maternity eligibility)      [G01/M01-OWNED; G03 references]
employee_dependents (G01) 1───1 dependent_leave_eligibility          [G03 satellite: is_surviving]
leave_types 1───∞ leave_balances ∞───1 employees  [version = optimistic lock]
leave_balances 1:1-anchor leave_balance_ledger (append-only; +P05 trigger)
employees 1───∞ leave_reservations ∞───1 leave_applications          (soft-reserve, R1)
employees 1───∞ leave_applications 1───∞ leave_application_days  ──> P01 workflow_instances
leave_applications ──(approved)──> service_register_events (G12-SR, via G04)
leave_applications / encashment / OT / attendance_daily ──> payroll_attendance_feed ──> G10
payroll_attendance_feed (locked) 1───∞ payroll_feed_adjustments      (next-period, R6)
leave_year_close_runs ──writes──> leave_balance_ledger               (JOB-M04-CARRYFWD)
approval_delegations ──feeds──> P01 delegate (reroute workflow_actions)  (R11)
module_config ──governs──> all configurable thresholds/blackouts (VAL-HOLD)
ALL mutations ──> P05 audit_log/security_audit_log (DB-trigger) ; ALL events ──> X.2 notifications
```

### 5.4 Ownership / reuse matrix (re-grounded)
| Entity group | Platform basis | Read by | Written by |
|---|---|---|---|
| employees, org_units, designations, grades/cadres | **G01/M01** (golden) | G03 | G01 only |
| employee_dependents | **G01/M01** (canonical owner) | G03 (read-only) | G01 only |
| dependent_leave_eligibility (E29a satellite) | **G03** (FK → G01 `employee_dependents`) | G03 | G03 (`is_surviving` only) |
| service_register_events (SR ledger) | **G12-SR** | G03 (status) | **G04** (on behalf of G03) |
| documents | **G13/M11** | G03 | G03 (uploads cert/order/photo/consent) |
| notifications | **X.2** | G03 | G03 (triggers) |
| audit_log / security_audit_log | **P05** | Auditor/DPO | DB-trigger (all G03 mutations) |
| workflows / workflow_instances / workflow_actions | **P01** | G03 | G03 (configures W.1 flows) |
| consent_records, integration_credentials, migration_runs | **P05/P04/P06** | G03/DPO | platform |
| shifts, rosters, holiday_*, attendance_*, comp_off_ledger | **EXTEND M05** (G03) | G14, G10 | G03 |
| leave_* (types/policies/balances/ledger/applications/reservations/entitlements/encashment/close) | **EXTEND M04** (G03) | G14, G10, G11, G04 | G03 |
| rh_elections, module_config, approval_delegations, biometric_consents, punch_anomaly_reviews | **G03 new** | DPO, Auditor | G03 |
| payroll_attendance_feed, payroll_feed_adjustments | **G03** (X.3 outbound) | **G10** | G03 (export); G10 (ack) |
| attendance_policies (E32) | **EXTEND M05** (v3.2 CSV) | G03, G14 | G03 |
| overtime_policies (E33) | **EXTEND M04/M05** (v3.2 CSV) | G03, G10 | G03 |
| attendance_networks (E34), geofences (E35) | **G03 new** (v3.2 CSV) | G03 (punch-capture guard) | G03 |
| leave_reasons (E36) | **EXTEND M04** (v3.2 proto) | G03, G14 | G03 |
| attendance_reasons (E37) | **EXTEND M05** (v3.2 proto) | G03, G14 | G03 |
| leave_balance_adjustments (E38), leave_revocations (E39) | **G03 new** (v3.2 proto; P01 flow → `leave_balance_ledger`) | G14, G11, Auditor | G03 |
| attendance_lock_periods (E40) | **G03 new** (v3.2 proto; X.1/M06 handoff) | **G10/M06** | G03 (lock); G10 (ack) |

### 5.5 Enum catalog
All v2 enums are retained unchanged. Notable: `leave.year_basis` (CALENDAR/FINANCIAL/CAREER/EVENT), `leave.sandwich_rule` (EXCLUDE/INCLUDE_IF_SANDWICHED/ALWAYS_INCLUDE), `rounding_mode`, `ledger.entry_type` (incl. CLAWBACK), `reservation.status`, `entitlement.quota_basis`, `consent.lawful_basis`, `anomaly_type`, `feed_adjustment.type`, `attendance_daily.status` (derived rollup), `allocation.segment_status`, `processing_run.status`, `delegation.status`, `module_config.status`. (Full value lists per v2 §5.5; values are platform-`VAL-ENUM`-validated.)

**v3.2 field-reconciliation enums added** (module-unique closed `g03_*` enumerations; UPPER_SNAKE values, platform-`VAL-ENUM`-validated):

| Enum (`g03_*`) | Values | Used by | Source |
|---|---|---|---|
| `g03_ot_calc_frequency` | `DAILY`/`WEEKLY`/`BIWEEKLY`/`SEMI_MONTHLY`/`MONTHLY`/`QUARTERLY`/`YEARLY` | `overtime_policies.calculation_frequency` (E33) | v3.2 CSV |
| `g03_holiday_recurrence` | `STATIC_DATE`/`DAY_OF_MONTH` | `holidays.recurrence_type` (E4) | v3.2 CSV |
| `g03_shift_type` | `FIXED`/`FLEXIBLE`/`ROTATIONAL` | `shifts.shift_type` (E1) | v3.2 proto (FR-M05-003) |
| `g03_leave_adjustment_type` | `CREDIT`/`DEBIT`/`RESET` | `leave_balance_adjustments.adjustment_type` (E38) | v3.2 proto (FR-M04-021) |
| `g03_adjustment_status` | `SUBMITTED`/`APPROVED`/`REJECTED`/`APPLIED`/`CANCELLED` | `leave_balance_adjustments.status` (E38) | v3.2 proto |
| `g03_revocation_type` | `FULL`/`PARTIAL` | `leave_revocations.revocation_type` (E39) | v3.2 proto (FR-M04-005) |
| `g03_lock_resolution_mode` | `AUTO_APPROVE`/`AUTO_DENY`/`MANUAL` | `attendance_lock_periods.resolution_mode` (E40) | v3.2 proto (FR-M05-007) |
| `g03_lock_status` | `OPEN`/`LOCKED`/`REOPENED` | `attendance_lock_periods.status` (E40) | v3.2 proto |
| `g03_biometric_modality` | `FINGERPRINT`/`FACE`/`IRIS`/`CARD`/`NONE` | `attendance_devices.biometric_modality` (E5) | v3.2 proto (FR-M05-006) |
| `g03_holiday_category` | `NATIONAL`/`REGIONAL`/`RELIGIOUS`/`COMPANY_SPECIFIC` | `holidays.holiday_category` (E4) | v3.2 proto |

The reconciled `attendance_policies.status`, `overtime_policies.status`, `attendance_networks.status`, `geofences.status`, `leave_reasons.status`, `attendance_reasons.status` reuse the existing `g03_active_status` (`ACTIVE`/`INACTIVE`); `overtime_policies.compensation` reuses `g03_ot_treatment` (`PAID`/`COMP_OFF`); `leave_revocations.status` reuses `g03_regularisation_status`. Tenant-configurable value sets (`leave_reasons.category`, `attendance_reasons.category`/`frequency_period`) stay text business keys, not enums (CONVENTIONS §4).

### 5.6 Data integrity rules (retained, re-grounded)
1. **Ledger-balance reconciliation:** `leave_balances.current_balance` = `balance_after` of latest `leave_balance_ledger` entry for (employee, leave_type, leave_year). Enforced by DB trigger + nightly reconciliation job (`JOB-G03-LEDGER-RECON`).
2. **Non-negative balances:** debit cannot drive `balance_after` < 0 except where `advance_allowed=true`.
3. **Append-only ledgers:** `leave_balance_ledger`, `comp_off_ledger`, `attendance_punches` permit INSERT only; corrections via compensating entries; each additionally fires the P05 trigger.
4. **One day-row, many allocations:** UNIQUE(`employee_id`,`attendance_date`); Σ `day_fraction` ≤ 1.0 (`VAL-G03-ALLOC`).
5. **Idempotent ingestion:** UNIQUE(`device_id`,`source_ref`); replays mark `DUPLICATE`.
6. **Transactional writes:** leave approval = (consume reservation + insert ledger debit + balance update with version check + recompute-enqueue + status update + G04 SR enqueue + X.2 notification) in one DB transaction; the P01 `approve` action is idempotent (one `workflow_actions` row on retry).
7. **FK integrity:** all employee/org references resolve to active G01/M01 records; soft-deleted employees block new applications.
8. **Gender/eligibility guard:** Maternity/CCL `FEMALE`; Paternity `MALE`; cadre + dependent-based eligibility (`VAL-DEPENDENT`) enforced at apply-time.
9. **Date sanity:** `end_date ≥ start_date` (`VAL-DATE`); backdated leave only within window; future-dated punches rejected.
10. **No self-approval / no self-clear:** enforced by **P02** SoD — approver ≠ applicant; reviewer ≠ punch owner; delegate ≠ applicant (not re-coded in G03).
11. **Soft-reserve persistence (R1):** every `SUBMITTED` application holds a `leave_reservations` row; `leave_balances.reserved` = Σ active `RESERVED`; `available = current − reserved`; auto-`RELEASED` after `RESERVATION_TTL_MIN`.
12. **Concurrency control (R1):** balance debits acquire `SELECT … FOR UPDATE` + optimistic `version` assertion; stale version → `OPTIMISTIC_LOCK_CONFLICT` (409 `CONFLICT`).
13. **Present-units derivation (R2):** `present_units` = Σ `day_fraction` where `counts_as_present=true`; FR-17 figures derive from allocations.
14. **Commuted 2:1 (R4):** `debit_ratio>1` posts (units × ratio) against `debits_against_leave_type_id`; insufficient target → `COMMUTED_REQUIRES_HPL`.
15. **Sanction entitlement (R7,R14):** `is_sanction_based` validates `leave_entitlements.remaining_days` + `eligibility_predicate`; ledger records informational `AVAIL`.
16. **Sandwich rule (R13):** `is_non_working` days counted per `sandwich_rule`; binds `JOB-M04-SANDWICH`.
17. **Single attendance writer (R15):** only FR-04 writes `attendance_daily`/allocations; FR-05/07/08/12/13 enqueue recompute via `attendance_processing_runs`.
18. **Comp-off SSOT (R17):** comp-off balance only in `comp_off_ledger`.
19. **Day-units equality (R18):** `SUM(day_units)` = `total_days` (`VAL-G03-DAYUNITS`).
20. **Advance clawback (R19):** exit before advance-credited leave earned → `CLAWBACK` entry (or G10 feed-adjustment recovery); accrual suspended during LWP/SUSPENDED/dies-non.
21. **Locked-period immutability (R6):** `is_locked=true` feed never overwritten; corrections in `payroll_feed_adjustments` next open period (`JOB-M05-LOCK`).
22. **Consent gating (R9):** `BIOMETRIC`/`MOBILE_GEO` punch requires active governing `biometric_consents` (GRANTED or STATUTORY_DUTY); else `fallback_method` or `REJECTED` with `CONSENT_REQUIRED` (`VAL-CONSENT`).

### 5.7 Sample data
The v2 sample rows (2–3 per entity) are retained; every row additionally carries `tenant_id`/`entity_id`. Representative examples: `shifts` GEN 09:30–17:30 / NIGHT-A 22:00–06:00 (SHIFT_START_LOCAL_DATE); `leave_types` EL (1.0, CALENDAR, retire-encash), HPL (1.0, retire-make-up), COMMUTED (2.0→HPL), MAT (sanction, EVENT, ≤2 children), CCL (sanction, CAREER 730); `leave_balances` GOV-1001 EL 2026 current 130 / reserved 2.5 / available 127.5 / version 7; `leave_entitlements` GOV-3300 CCL CAREER 730 consumed 120; `biometric_consents` GOV-1001 STATUTORY_DUTY GRANTED fallback RFID; `payroll_feed_adjustments` 2026-07 LWP_DELTA −1 (late regularisation of locked 2026-06). (Full sample set per v2 §5.7.)

### 5.8 End-to-end worked example — "one leave day, end to end" (R23), re-grounded
> GOV-1001 (EL year basis CALENDAR, current 130.0, reserved 0; tenant T1/entity E1). Applies for 0.5-day EL on 2026-07-10 (FIRST_HALF), works the afternoon.

1. **Apply (FR-12):** `total_days = 0.5`; `ledger_debit_units = 0.5 × 1.0 = 0.5`. POST carries `Idempotency-Key`. `leave_reservations` (0.5, RESERVED) created; `reserved`→0.5, `available`→129.5. Preview: before 130.0, softReserved 0.5, available 129.5. `VAL-G03-DAYUNITS` passes. `Authorization.check` (P02) confirms self-apply.
2. **Concurrency (R1):** a concurrent application re-reads `available` net of the 0.5 reservation; balance row locked `FOR UPDATE` + version assertion at debit.
3. **Approve (P01 `approve`, single txn):** reservation `CONSUMED`; ledger `AVAIL −0.5` (balance_after 129.5); `current_balance` 129.5, `reserved` 0, `version`++; application `APPROVED`; G04 SR enqueue (`PENDING`); X.2 notification queued; recompute **enqueued** for 2026-07-10 (R15). P01 emits one `workflow_actions` row; P05 trigger writes the audit row.
4. **Attendance (FR-04, sole writer):** recompute writes two allocations for 2026-07-10 — `ON_LEAVE×0.5 (present, paid)` + `PRESENT×0.5` — `present_units = 1.0`; status rollup per precedence (R2).
5. **SR (G04):** approved EL event posts to Digital SR (**G12-SR** via **G04**); `sr_posting_status`→`POSTED` on ack.
6. **Payroll feed (FR-17):** July period aggregates `present_units` 1.0, `lwp_days 0`, `half_pay_days 0` (`JOB-M04-LOP`/`JOB-M05-LOP`). If 2026-07 later locks and a regularisation changes the day, a `payroll_feed_adjustments` row corrects the next open period (R6).
7. **Year-close (FR-15, `JOB-M04-CARRYFWD`):** at 2026 close, EL above CF cap 300 lapses; 2027 `OPENING` posted; reconciliation = 0 mismatch.

---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s) (RBAC v1.7), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References (`/api/v1/atl/*`), UI Behavior Notes, Edge Cases, and a Low-Level Design table. **Platform grounding:** all approvals run on **P01**; authz via **P02**; audit via **P05**; notifications via **X.2**; jobs via **X.1**; SR via **G04**; payroll via **G10**. v2 additions retained.

### FR-01 — Shift & Roster Management (EXTEND M05)
- **Primary Role(s):** `attendance_admin`/`hr_admin` (configure); employee/manager (view).
- **User Story:** As an Attendance Admin, I want to define shifts and assign rosters so attendance is evaluated against the correct pattern.
- **Description:** Create/maintain shift definitions (timings, grace, thresholds, night flag, breaks, date-anchor rule, display timezone) and assign employees to shifts over date ranges with weekly-off patterns; rotating rosters and bulk assignment. Reuses M05 shift/roster engine; `VAL-AT` applies.
- **Acceptance Criteria:**
  1. Create a shift with start/end/grace/thresholds, scope, `date_anchor_rule`.
  2. Assign employees to a shift for a date range with weekly-off pattern.
  3. Overlapping PUBLISHED rosters rejected (`VAL-G03-ROSTER-OVERLAP` → 409 `CONFLICT`).
  4. Publishing supersedes prior open-ended roster from new `effective_from` (`VAL-EFFECTIVE`).
  5. Employees/managers view applicable shift/weekly-off for any date.
  6. **(R6)** A roster edit in a locked payroll period does NOT overwrite the fed day; emits `payroll_feed_adjustments` for next open period.
- **Business Rules:** night shifts attribute to shift start date via `date_anchor_rule`; weekly-off supports `SAT2`/`SAT4` (App. B); only ACTIVE shifts assignable.
- **Data Model References:** shifts, rosters, attendance_processing_runs, payroll_feed_adjustments, org_units/employees (G01).
- **API References:** `POST /api/v1/atl/shifts`; `POST /api/v1/atl/rosters`; `GET /api/v1/atl/rosters?employeeId=` (cursor paginated).
- **UI Behavior Notes:** Shift form (Admin workspace); roster grid; conflict banner; locked-period warning. WCAG 2.1 AA; empty/loading/error/no-permission states.
- **Edge Cases:** mid-period change; transfer (G05) mid-roster; alt-Saturday month/year edge; locked-period edit → adjustment; multi-timezone attribution.
- **LLD:** `ShiftService`, `RosterService`, `RosterConflictValidator`, `RecomputeEnqueuer`. Flow: P02 check → validate scope/overlap → persist → supersede prior → enqueue recompute (locked-period guard → adjustment) → P05 audit. Failure: `VAL-G03-ROSTER-OVERLAP` 409; `VAL-G03-SHIFT-TIMES` 422; `LOCKED_PERIOD_ADJUSTMENT_EMITTED` 200. Deps: G01, FR-04, FR-17.

### FR-02 — Holiday Calendar Management by location (EXTEND M05)
- **Primary Role(s):** `leave_admin`/`attendance_admin`/`hr_admin` (configure); all (view).
- **User Story:** As an admin, I want location-specific holiday calendars so attendance/leave honour the right holidays.
- **Description:** Yearly calendars bound to org/location scope with gazetted/restricted/sectional/optional types; employees elect RH within cap (`rh_elections`). Reuses M05 holiday engine.
- **Acceptance Criteria:**
  1. Create a calendar for year/location and add holidays.
  2. Duplicate date rejected (`VAL-G03-HOLIDAY-DUP` 409).
  3. Publishing makes it the basis for attendance/leave computation in scope.
  4. **(R8)** Employees elect ≤ `rh_cap` RH (`rh_elections`); exceed → `VAL-G03-RHCAP` 409.
  5. Sandwiched holidays count per `sandwich_rule` (R13).
  6. **(R6)** Holiday edits in a locked period emit a feed adjustment.
- **Business Rules:** holiday on weekly-off no double-grant; employee inherits org-unit calendar; RH cap default 2 (module_config).
- **Data Model References:** holiday_calendars, holidays, rh_elections, org_units.
- **API References:** `POST /api/v1/atl/holiday-calendars`; `POST /api/v1/atl/holiday-calendars/{id}/holidays`; `POST /api/v1/atl/rh-elections`; `GET /api/v1/atl/holidays?date=&orgUnitId=`.
- **UI Behavior Notes:** calendar grid; CSV import; RH self-service with remaining-count badge.
- **Edge Cases:** mid-year relocation; national vs sectional overlap; RH availed when calendar edited; RH cap change mid-year.
- **LLD:** `HolidayCalendarService`, `HolidayResolver`, `RHElectionService`. Validation: unique date, RH cap, year match, locked-period guard. Deps: G01 org_units, FR-04.

### FR-03 — Attendance Punch Ingestion (biometric/RFID/mobile-geo) (EXTEND M05)
- **Primary Role(s):** System (devices, registered in **P04**), employee (mobile/web), SysAdmin (device config).
- **User Story:** As the system, I want to ingest punches reliably, idempotently, with consent governance and anti-fraud screening.
- **Description:** Accept punch events from P04-registered devices and the mobile app with geofence validation; deduplicate; classify direction; derive `attendance_date` via the shift's date-anchor rule; screen anomalies; gate on consent (`VAL-CONSENT`); store raw immutably (+P05 trigger). `VAL-AT` applies.
- **Acceptance Criteria:**
  1. Known `(device_id, source_ref)` → `DUPLICATE`, not re-stored.
  2. Outside geofence → `REJECTED` `GEOFENCE_VIOLATION` (422 `VALIDATION_FAILED`).
  3. Unknown/inactive device → `DEVICE_NOT_AUTHORIZED` (403).
  4. Future-dated punch → `INVALID_PUNCH_TIME` (422).
  5. Accepted punches immutable/append-only.
  6. **(R16)** `attendance_date` derived from shift `date_anchor_rule`.
  7. **(R9)** Biometric/geo punch lacking active consent uses `fallback_method`; else `REJECTED` `CONSENT_REQUIRED` (403).
  8. **(R10)** Anomaly-triggering punches → `FLAGGED_FOR_REVIEW` + open `punch_anomaly_reviews` (FR-20).
- **Business Rules:** device auth via P04 hashed key/cert; mobile requires authenticated user + GPS; direction inferred; clock skew ±`CLOCK_SKEW_MIN`; `EMPLOYEE_BOUND` devices reject other employees.
- **Data Model References:** attendance_punches, attendance_devices (P04), biometric_consents, punch_anomaly_reviews, employees.
- **API References:** `POST /api/v1/atl/punches/ingest` (device batch, `Idempotency-Key`); `POST /api/v1/atl/punches/mobile`.
- **UI Behavior Notes:** mobile Punch In/Out with GPS + map pin + optional liveness; offline queue/sync; consent banner with fallback.
- **Edge Cases:** clock drift; duplicate replays; GPS spoof → flagged; offline sync; consent withdrawn between punches.
- **LLD:** `PunchIngestController`, `DeviceAuthFilter`, `GeofenceValidator`, `DedupeService`, `ConsentGate`, `AnomalyScreener`, `AttendanceDateDeriver`. Append-only INSERT; UNIQUE → DUPLICATE; enqueue FR-04 recompute. Deps: attendance_devices (P04), biometric_consents, FR-04, FR-20, G01.

### FR-04 — Daily Attendance Processing, Sub-Day Allocation & Status (EXTEND M05; `JOB-M05-CLOSE`)
- **Primary Role(s):** System (scheduled via **X.1**), HR/Attendance Officer (rerun).
- **User Story:** As the system, I want to compute each employee's day as a sub-day allocation set so part-leave/part-present days and payroll are accurate.
- **Description:** Nightly (and on-demand) batch — extending `JOB-M05-CLOSE` — derives `attendance_daily` + `attendance_day_allocations` from punches, roster/shift, holidays, approved leave (incl. half-day), and WFH/OD; computes worked minutes, late/early, `present_units`, derived `status`. **Sole writer of `attendance_daily`/allocations (R15).**
- **Acceptance Criteria:**
  1. Approved leave → `ON_LEAVE`; holiday → `HOLIDAY`; weekly-off → `WEEKLY_OFF`.
  2. Worked ≥ full → `PRESENT`; half–full → `HALF_DAY`; below → `ABSENT`.
  3. In-only/out-only → `MISSING_PUNCH`.
  4. WFH/OD approved → `WFH`/`ON_DUTY` regardless of punches.
  5. Re-run idempotent (X.1 per-period run key); overwrites only non-regularised rows; recorded under `attendance_processing_runs`.
  6. **(R2)** Half-day leave + worked afternoon → two allocations summing ≤ 1.0; `present_units` reflects both.
  7. **(R15)** Consumes recompute requests enqueued by FR-05/07/08/12/13.
- **Business Rules:** precedence Leave > Holiday > Weekly-off > WFH/OD > punch-derived (App. B); night-shift per `date_anchor_rule`; regularised days not overwritten; Σ allocation ≤ 1.0 (`VAL-G03-ALLOC`).
- **Data Model References:** attendance_daily, attendance_day_allocations, attendance_processing_runs; inputs punches/rosters/holidays/leave_applications/exceptions.
- **API References:** `POST /api/v1/atl/attendance/process`; `GET /api/v1/atl/attendance/daily?employeeId=&from=&to=`.
- **UI Behavior Notes:** monthly grid with split-allocation cells; legend; drill to punches; HR reprocess with run-history.
- **Edge Cases:** late sync after run; no roster (default GEN/flag); leave approved post-processing; part-OD + part-leave; allocation overflow.
- **LLD:** `AttendanceProcessor`, `AllocationResolver`, `StatusRollupDeriver`, `ProcessingRunTracker`, X.1 job. Partial-batch isolation → run=PARTIAL; `PROCESSING_ERROR` 500; `VAL-G03-ALLOC` 422. Runner guarantees per X.1 (idempotent, retry ×3, per-tenant isolation).

### FR-05 — Missed-Punch Regularisation (EXTEND M05; P01; `VAL-AT`)
- **Primary Role(s):** employee (raise), manager/HR (approve via P01).
- **User Story:** As an employee, I want to regularise a missed/incorrect punch with justification so attendance reflects reality after approval.
- **Description:** Employee submits a correction for a `MISSING_PUNCH`/`ABSENT`/`HALF_DAY` day; routed to manager on **P01** (reporting-chain resolution); on approval an FR-04 recompute is enqueued and the day locked as regularised. Reuses M05 regularisation; `JOB-M05-ESCALATE` for SLA.
- **Acceptance Criteria:**
  1. Raise only for own past days within `REGULARISATION_WINDOW_DAYS` (default 15).
  2. **(R15)** Approval enqueues recompute setting `is_regularised=true`; no direct write.
  3. Rejected leaves attendance unchanged; reason logged (P05).
  4. Monthly cap enforced (`REGULARISATION_LIMIT`).
  5. P05 captures before/after status.
  6. **(R6)** Regularisation in a locked period emits `payroll_feed_adjustments` for next open period.
- **Business Rules:** manager approval (P01); HR on behalf; document optional (`VAL-FILE`); window/cap from `module_config`. SoD by P02 (no self-approve).
- **Data Model References:** regularisation_requests, attendance_processing_runs, payroll_feed_adjustments, workflow_instances (P01), documents.
- **API References:** `POST /api/v1/atl/regularisations` (`Idempotency-Key`); `POST /api/v1/atl/regularisations/{id}/decision`.
- **UI:** "Regularise" from grid; manager inbox (My Team); status timeline; locked-period notice.
- **Edge Cases:** locked → adjustment; cap exceeded; beyond window; concurrent regularisation + leave (allocation reconciliation).
- **LLD:** `RegularisationService`, `WorkflowEngineAdapter` (P01), `RecomputeEnqueuer`, `FeedAdjustmentService`. Failures: `PERIOD_LOCKED`→adjustment; `REGULARISATION_LIMIT` 409; `WINDOW_EXPIRED` 422.

### FR-06 — Overtime Capture & Approval (EXTEND M05; P01)
- **Primary Role(s):** employee/manager (claim/recommend), HR/authority (approve).
- **Description:** Capture OT beyond shift or on holidays/weekly-offs; submit with treatment (paid/comp-off); on **P01** approval, paid OT → payroll feed; comp-off → `comp_off_ledger` EARN (SSOT, R17).
- **Acceptance Criteria:** (1) OT only where worked-minutes exceed shift end + grace (validated vs punches); (2) PAID OT → `paid_ot_minutes` to feed; (3) COMP_OFF → `EARN` with expiry; (4) rate multiplier per policy; (5) duplicate-date prevented.
- **Business Rules:** comp-off expires after `COMPOFF_VALIDITY_DAYS` (90); holiday/weekly-off OT defaults to comp-off unless paid-OT policy; monthly cap.
- **Data Model References:** overtime_records, comp_off_ledger, payroll_attendance_feed, attendance_daily.
- **API References:** `POST /api/v1/atl/overtime`; `POST /api/v1/atl/overtime/{id}/decision`.
- **LLD:** `OvertimeService`, `CompOffLedgerService`, `WorkflowEngineAdapter` (P01). Failures: `OT_NOT_SUPPORTED_BY_PUNCHES` 422; `OT_CAP_EXCEEDED` 409.

### FR-07 — Work-From-Home (EXTEND M05; P01)
- **Primary Role(s):** employee (apply), manager (approve via P01).
- **Description:** Apply WFH for a date range (optional half-day); on approval, affected days compute as `WFH` allocation (present) by FR-04 (recompute enqueued, R15); optional monthly cap.
- **Acceptance Criteria:** (1) approved WFH → present-counting allocation; (2) cannot overlap leave/holiday; (3) monthly cap if configured; (4) manager approval (P01); HR on behalf; (5) **(R15)** enqueue recompute, no direct write.
- **Data Model References:** attendance_exceptions, attendance_processing_runs, workflow_instances (P01).
- **API References:** `POST /api/v1/atl/exceptions` (type=WFH); `POST /api/v1/atl/exceptions/{id}/decision`.
- **LLD:** `AttendanceExceptionService`, `ConflictChecker`, `RecomputeEnqueuer`. Failures: `EXCEPTION_OVERLAP` 409; `WFH_CAP_EXCEEDED` 409.

### FR-08 — On-Duty / Tour / Outdoor Duty (EXTEND M05; P01)
- **Primary Role(s):** employee (apply), manager/authority (approve via P01).
- **Description:** Capture OD/Tour with location, purpose, order doc (`VAL-FILE`); approved days compute as `ON_DUTY` allocation (present) via FR-04 (recompute enqueued); links tour-order document (G13).
- **Acceptance Criteria:** (1) approved OD/Tour → present `ON_DUTY`; (2) tour requires location and may require order doc; (3) cannot overlap leave; (4) tour over weekly-off/holiday optional per policy; (5) **(R15)** enqueue recompute.
- **Business Rules:** holiday-in-tour may generate comp-off (`comp_off_ledger`); half-day OD via `day_portion`.
- **API References:** `POST /api/v1/atl/exceptions` (type=ON_DUTY/TOUR); `POST .../{id}/decision`.
- **LLD:** `AttendanceExceptionService`, `DocumentRefValidator` (G13), `RecomputeEnqueuer`. Failures: `DOCUMENT_REQUIRED` 422; `EXCEPTION_OVERLAP` 409.

### FR-09 — Compensatory-Off Earning & Redemption (EXTEND M04/M05; SSOT R17)
- **Primary Role(s):** employee (redeem), system/manager (earn/approve).
- **Description:** Append-only `comp_off_ledger` as sole comp-off balance (R17; +P05 trigger); earn from FR-06/08; redeem via COMPOFF application (redemption vehicle only — no `leave_balances` row); expire unused via `JOB-G03-COMPOFF-EXPIRE` (X.1), with `JOB-M04-SMART`-style reminders.
- **Acceptance Criteria:** (1) earn credits ledger with `expires_on`; (2) redemption FIFO from non-expired; (3) over-balance → `COMP_OFF_INSUFFICIENT` 409; (4) daily expiry job + reminders; (5) ledger reconciles to latest `balance_after`; (6) **(R17)** COMPOFF debits comp_off_ledger only.
- **API References:** `GET /api/v1/atl/comp-off/balance?employeeId=`; `POST /api/v1/atl/comp-off/redeem`.
- **LLD:** `CompOffLedgerService`, `CompOffExpiryJob` (X.1), `FifoConsumer`. Failures: `COMP_OFF_INSUFFICIENT` 409; `COMP_OFF_EXPIRED` 422.

### FR-10 — Leave-Type & Accrual-Policy Configuration (EXTEND M04 + `G03 ext`; `VAL-LV`)
- **Primary Role(s):** `leave_admin`/`hr_admin`.
- **User Story:** As a Leave Admin, I want to configure leave types and accrual/CF/encashment policies — including commuted 2:1, year basis, rounding, sandwich — so the engine applies correct statutory rules per cadre/office.
- **Description:** Maintain the catalog and versioned policies (config cascade, `VAL-EFFECTIVE`) scoped by org unit/cadre with caps, CF, lapse, encashment, `debit_ratio`/`debits_against_leave_type_id`, `year_basis`, `sandwich_rule`, `rounding_mode`/`proration_method`, sanction flag, retirement-encash flag. Extends the M04 leave-type model.
- **Acceptance Criteria:**
  1. Create/deactivate types with category, eligibility, document, caps, year_basis, sandwich_rule, debit_ratio, sanction flag.
  2. Define versioned accrual policy per type/scope with frequency, quantity, basis, rounding_mode, proration_method, caps, CF, lapse, encashment caps.
  3. Overlapping ACTIVE policies rejected (`POLICY_OVERLAP` 409).
  4. Gender/cadre/dependent eligibility enforced downstream at apply-time.
  5. Policy changes versioned (effective_from/to), non-destructive.
  6. **(R4)** `debit_ratio>1` MUST specify `debits_against_leave_type_id` or → `COMMUTED_REQUIRES_HPL` (422) at config validation.
- **Business Rules:** statutory caps preset (Maternity 180, Paternity 15…) but editable; HPL = half-pay; Commuted debits 2× HPL; LWP affects pay/service; sanction types backed by `leave_entitlements` (FR-22). `VAL-LV` governs application-time checks.
- **API References:** `POST /api/v1/atl/leave-types`; `POST /api/v1/atl/leave-policies`; `GET /api/v1/atl/leave-policies?leaveTypeId=`.
- **LLD:** `LeaveTypeService`, `AccrualPolicyService`, `PolicyResolver`, `CommutedLinkValidator`. Failures: `POLICY_OVERLAP` 409; `TYPE_IN_USE` 409; `COMMUTED_REQUIRES_HPL` 422. Most-specific scope wins (config cascade).

### FR-11 — Accrual Engine, Rounding/Proration & Leave-Balance Ledger (EXTEND M04; `JOB-M04-ACCRUAL`)
- **Primary Role(s):** System (scheduled via X.1 / `JOB-M04-ACCRUAL`), HR Officer (adjust via P01 maker-checker).
- **User Story:** As the system, I want to accrue leave per policy with defined rounding/proration and record every change in an immutable, concurrency-safe ledger.
- **Description:** Scheduled accrual (extending `JOB-M04-ACCRUAL`) credits leave writing `ACCRUAL` ledger entries with explicit `rounding_mode`/`proration_method` per `year_basis`; every avail/encash/lapse/adjustment/clawback also writes the ledger; balances are the reconciled projection with optimistic `version`.
- **Acceptance Criteria:**
  1. Accrual credits correct quantity per active policy; updates balance.
  2. Every mutation writes exactly one ledger entry with `balance_after`.
  3. `current_balance` always equals latest ledger `balance_after` (`JOB-G03-LEDGER-RECON` passes).
  4. **(R3)** Pro-rated mid-year join/leave uses `proration_method`; rounded per `rounding_mode` (remainder carried; App. C example).
  5. Manual adjustments require **P01 maker-checker** + reason.
  6. **(R1)** Debits use `SELECT … FOR UPDATE` + `version`; stale → `OPTIMISTIC_LOCK_CONFLICT` 409.
  7. **(R19)** Accrual suspended during LWP/SUSPENDED/dies-non per `suspend_accrual_on_lwp`; exit before earned → `CLAWBACK`.
- **Business Rules:** respects `max_balance_cap`; HPL accrues separately; no change outside ledger; remainder carried, never dropped. X.1 per-cycle idempotency key.
- **API References:** `POST /api/v1/atl/accrual/run`; `GET /api/v1/atl/leave-ledger?employeeId=&leaveTypeId=`; `POST /api/v1/atl/leave-ledger/adjust` (maker).
- **LLD:** `AccrualEngine`, `RoundingProrator`, `LeaveLedgerService`, `BalanceProjector`, `ReconciliationJob` (X.1), `ClawbackService`. Failures: `ACCRUAL_ALREADY_RUN` 409; `LEDGER_RECON_MISMATCH` 500 (alert → `MSG-SYS-JOBFAIL`); `OPTIMISTIC_LOCK_CONFLICT` 409.

### FR-12 — Leave Application & Approval Workflow (EXTEND M04; **P01**; reservation/concurrency/sandwich)
- **Primary Role(s):** employee (apply, Me workspace), manager (recommend, My Team), HR/authority (approve via P01).
- **User Story:** As an employee, I want to apply for leave with half-day support and approval through the right chain, with a real reservation, deterministic sandwich counting, and atomic balance + Service Register updates.
- **Description:** Employee applies (type, dates, half-day portions, reason, document); system computes `total_days` per `sandwich_rule` (binds `JOB-M04-SANDWICH`) and `ledger_debit_units` per `debit_ratio`; validates `available_balance` (net of reservations) via `VAL-LV` or `leave_entitlements` for sanction types; creates a `leave_reservations` hold; routes through a configurable **P01** chain (approver resolution by reporting-chain; delegation FR-19); on approval, atomically consumes the reservation, debits the ledger (correct pot for commuted), enqueues an FR-04 recompute, and (for SR-relevant types) enqueues a Digital SR posting **via G04**. `VAL-HOLD` blocks blackout windows.
- **Acceptance Criteria:**
  1. **(R13)** `total_days` includes weekly-off/holidays per `sandwich_rule`, deterministically, shown in preview; `SUM(day_units)=total_days` (`VAL-G03-DAYUNITS`).
  2. **(R1)** On submit, `leave_reservations` holds `ledger_debit_units`; `available_balance` reflects the hold; insufficient → `INSUFFICIENT_BALANCE` 409 (except advance-allowed).
  3. **(R1)** On **P01** approval, a single txn: lock balance (FOR UPDATE + version) → consume reservation → ledger `AVAIL` debit (against `debits_against_leave_type_id` if set) → balance/version → APPROVED → enqueue FR-04 recompute → G04 SR enqueue → X.2 notification. P01 `approve` idempotent.
  4. Eligibility (gender/cadre/document/dependent, `VAL-DEPENDENT`) enforced; sanction types validate `leave_entitlements` (FR-22).
  5. Approval chain configurable (W.1): Manager → HR; special leaves → Sanctioning Authority; absent approver auto-routes to delegate (FR-19, P01 `delegate`).
  6. SR-relevant approved leave sets `sr_posting_status=PENDING` then `POSTED` on G04 ack.
  7. **(R4)** COMMUTED debits 2× against HPL; insufficient → `COMMUTED_REQUIRES_HPL` 422.
  8. **(Proponent)** Applications in a blackout/freeze window blocked (`BLACKOUT_PERIOD` 409, `VAL-HOLD`); long-medical types set `return_to_work_status=PENDING` (FR-23).
- **Business Rules:** no double-booking; Commuted/Medical require document; Maternity/CCL gender+dependent-restricted; advance leave only configured types; balance held via real reservation.
- **Data Model References:** leave_applications, leave_application_days, leave_reservations, leave_balance_ledger, leave_balances, leave_entitlements, attendance_processing_runs, workflow_instances/workflow_actions (P01), approval_delegations; SR via G04.
- **API References:** `POST /api/v1/atl/leave-applications` (`Idempotency-Key`); `POST /api/v1/atl/leave-applications/{id}/decision`; `GET /api/v1/atl/leave-applications?employeeId=&status=` (cursor).
- **UI Behavior Notes:** apply wizard (type→dates→live preview showing softReserved/available + sandwich days→document→submit); approver inbox (My Team) with conflict indicator + delegate badge; SR-posting badge.
- **Edge Cases:** balance change between submit/approve (reservation + version); concurrent approvals (lost-update prevented); holiday sandwiched; SR posting fails (G04 retry, FAILED, HR alert); applicant = approver/delegate (P02 SoD blocks); commuted low HPL; blackout window.
- **LLD:** `LeaveApplicationService`, `SandwichCalculator`, `ReservationService`, `LeaveValidator` (`VAL-LV`), `EntitlementValidator`, `WorkflowEngineAdapter` (P01), `LeaveLedgerService`, `RecomputeEnqueuer`, `SRPostingProducer` (→G04). Failures: `INSUFFICIENT_BALANCE` 409; `LEAVE_OVERLAP` 409; `ELIGIBILITY_FAILED` 422; `OPTIMISTIC_LOCK_CONFLICT` 409; `COMMUTED_REQUIRES_HPL` 422; `ENTITLEMENT_EXCEEDED` 409; `VAL-G03-DAYUNITS` 422; `BLACKOUT_PERIOD` 409; SR async-retry via G04. Deps: FR-10/11/19/22/23, G04, G01.

### FR-13 — Leave Cancellation & Modification (EXTEND M04; P01)
- **Primary Role(s):** employee (request), manager/HR (approve via P01).
- **Description:** Withdraw a SUBMITTED application (releases reservation) or cancel an APPROVED one (full/partial future days); approved cancellation reverses the ledger debit (`AVAIL_REVERSAL`, correct pot for commuted), enqueues FR-04 recompute, and reverses/cancels SR posting **via G04**; locked-period impacts emit a feed adjustment (R6).
- **Acceptance Criteria:** (1) SUBMITTED withdrawn by applicant → reservation `RELEASED`, available restored; (2) APPROVED future cancelled (full/partial) with P01 approval → `AVAIL_REVERSAL` for cancelled days only; (3) past/availed not cancellable (`CANNOT_CANCEL_PAST` 422); (4) **(R15)** recompute enqueued; G04 SR reversal enqueued; (5) P05 captures original vs revised; (6) **(R6)** locked period → `payroll_feed_adjustments`.
- **Business Rules:** partial cancel only future; encashed/closed-year not cancellable; reversal = exact debited units for cancelled days; commuted reversal credits HPL.
- **API References:** `POST /api/v1/atl/leave-applications/{id}/withdraw`; `POST /api/v1/atl/leave-applications/{id}/cancel`.
- **LLD:** `LeaveCancellationService`, `ReservationService`, `LeaveLedgerService`, `RecomputeEnqueuer`, `FeedAdjustmentService`, `SRPostingProducer` (→G04). Failures: `CANNOT_CANCEL_PAST` 422; `PERIOD_LOCKED`→adjustment.

### FR-14 — Backdated Leave & Team-Calendar Conflict Detection (EXTEND M04; My Team workspace)
- **Primary Role(s):** employee (apply), manager (view/approve, My Team).
- **Description:** Backdated leave within `BACKDATE_WINDOW_DAYS` with mandatory justification and elevated **P01** approval; manager team calendar (My Team workspace) visualising leave/WFH/OD/holidays and flagging concurrent-absence over `CONFLICT_THRESHOLD_PCT`.
- **Acceptance Criteria:** (1) backdated only within window, `is_backdated=true`, elevated approval; (2) calendar shows team leave/WFH/OD/holidays for a month; (3) concurrent absences over threshold → advisory warning to approver; (4) beyond window → `BACKDATE_WINDOW_EXCEEDED` 422; (5) filter by status/type; (6) **(R3)** validates correct leave-year balance per `year_basis`.
- **Business Rules:** backdated still validates balance/reservation; conflict threshold advisory (recorded on `workflow_actions`); calendar respects org-unit row-level scope (P02).
- **API References:** `GET /api/v1/atl/team-calendar?managerId=&month=`; `GET /api/v1/atl/leave-applications/conflicts?orgUnitId=&range=` (cursor).
- **LLD:** `TeamCalendarService`, `ConflictDetector`, `BackdateValidator`. Failure: `BACKDATE_WINDOW_EXCEEDED` 422.

### FR-15 — Leave-Year Close: Carry-Forward, Lapse & HPL Conversion (EXTEND M04; `JOB-M04-CARRYFWD`)
- **Primary Role(s):** `hr_admin`/`leave_admin`.
- **Description:** Year-close job (extending `JOB-M04-CARRYFWD`) processes balances per policy and per `year_basis`: compute CF (capped), lapse excess, convert (EL→HPL) where configured, post openings — via ledger entries; SIMULATED dry-run with report before COMMIT.
- **Acceptance Criteria:** (1) SIMULATED report without writing; (2) COMMITTED writes `CARRY_FORWARD`/`LAPSE`/`HPL_CONVERSION`/`OPENING` atomically per employee; (3) CF respects cap, excess lapses per `lapse_rule`; (4) new-year `leave_balances` with correct opening + reset `version`; (5) committed year not re-committable (`YEAR_ALREADY_CLOSED` 409); (6) ordering pinned (encashment-before-lapse → CF → opening).
- **Business Rules:** EL excess beyond CF cap lapses; CL lapses fully; HPL no-lapse; irreversible except P01 maker-checker adjustment; X.1 idempotent per (year, scope).
- **API References:** `POST /api/v1/atl/year-close/simulate`; `POST /api/v1/atl/year-close/commit`; `GET /api/v1/atl/year-close/{runId}`.
- **LLD:** `YearCloseService`, `CarryForwardCalculator`, `LeaveLedgerService`. Failures: `YEAR_ALREADY_CLOSED` 409; `PENDING_LEAVE_BLOCKS_CLOSE` 409.

### FR-16 — Leave Encashment (In-Service, LTC & On Retirement) (EXTEND M04 + `G03 ext`)
- **Primary Role(s):** employee (request), HR/authority (approve via P01; **encashment authorisation is HR-Admin-only**, BRD §3.1.1), Payroll (settle via G10).
- **Description:** Submit encashment for encashable types within caps; on approval debit ledger (`ENCASHMENT`) and post amount to payroll feed (G10); retirement encashment encashes EL to cap then HPL cash-equivalent to make up the statutory ceiling (R5); LTC follows 10-EL-days/block, 60-career-day rule (R12); retirement integrates with **G11**.
- **Acceptance Criteria:** (1) in-service only for `is_encashable` within `encashment_cap_days`/`min_balance_for_encash`; (2) approval → `ENCASHMENT` ledger + payroll-feed amount; (3) **(R5)** RETIREMENT computes `el_days_component` then `hpl_days_component` to reach `retirement_encash_cap_days` (300); HPL encashable at retirement only; (4) **(R12)** LTC caps 10/block, 60/career via `ltc_block_ref`; exceed → `LTC_BLOCK_EXHAUSTED` 409; (5) estimated amount shown (G10 computes final); over-cap rejected.
- **API References:** `POST /api/v1/atl/encashments`; `POST /api/v1/atl/encashments/{id}/decision`.
- **LLD:** `EncashmentService`, `RetirementShortfallCalculator`, `LtcCapValidator`, `LeaveLedgerService`, `PayrollFeedProducer` (→G10/G11). Failures: `ENCASHMENT_CAP_EXCEEDED` 409; `NOT_ENCASHABLE` 422; `LTC_BLOCK_EXHAUSTED` 409. Deps: FR-11, G10, G11.

### FR-17 — Attendance & Leave → Payroll (LWP) Feed + Locked-Period Adjustments (EXTEND M04/M05; `JOB-*-LOP`; X.3)
- **Primary Role(s):** System (generate via X.1), `payroll_admin` (reconcile).
- **Description:** Per pay period, aggregate per-employee LWP days, half-pay (HPL), paid-OT minutes, `present_units` (allocations, R2), encashment into `payroll_attendance_feed` (extending `JOB-M04-LOP`/`JOB-M05-LOP`); expose to **G10** via X.3 with ack handshake; lock after export (`JOB-M05-LOCK`) and route later corrections to `payroll_feed_adjustments` in the next open period (R6).
- **Acceptance Criteria:** (1) feed aggregates LWP/half-pay/paid-OT/present_units/encashment per employee; (2) LWP from `ABSENT`/LWP allocations, half-pay from HPL, present from present-counting allocations; (3) **(R6)** after EXPORTED `is_locked=true`; later corrections → adjustment in next period; (4) G10 ack → `ACKED`, failures → `FAILED` (X.3 retry); (5) reconciles to allocations + ledger.
- **Business Rules:** present-counting statuses PRESENT/WFH/ON_DUTY/ON_LEAVE(paid)/HALF_DAY(0.5); LWP/absent reduce pay; period lock aligns with FR-01/02/05/13.
- **API References:** `POST /api/v1/atl/payroll-feed/generate`; `GET /api/v1/atl/payroll-feed?payPeriod=`; `GET /api/v1/atl/payroll-feed/adjustments?payPeriod=`; `POST /api/v1/atl/payroll-feed/{id}/ack`.
- **LLD:** `PayrollFeedService`, `PeriodLockManager`, `FeedAdjustmentService`, `FeedReconciler`. Outbound via X.3 (circuit-breaking, idempotent, payload versioning). Failures: `PERIOD_ALREADY_LOCKED` 409; `LOCKED_PERIOD_ADJUSTMENT_EMITTED` 200; `G10_ACK_TIMEOUT` retry.

### FR-18 — Mobile/Web Self-Service Surface & Notification Triggers (Me/My Team; X.2)
- **Primary Role(s):** employee (Me), manager (My Team).
- **Description:** Unified self-service surface exposing punch (consent/fallback), leave apply/cancel, balance/ledger/forecast (FR-23), comp-off wallet, team calendar (managers), approvals inbox (with P01 delegation), consent management; every lifecycle event triggers an **X.2** `notifications` entry (`IN_APP` + `EMAIL` in parallel; statutory notices mandatory/non-suppressible per X.2/BRD §9.9).
- **Acceptance Criteria:** (1) punch, apply/cancel, view balance/ledger/forecast, request status on mobile + web; (2) manager approve/reject from inbox; delegated items labelled; (3) each transition (submitted/recommended/approved/rejected/cancelled/low-balance/accrual-credited/comp-off-expiring/regularisation-decided/anomaly-flagged/delegation-active/return-to-work-due) emits an X.2 notification (`MSG-G03-*`); (4) notifications respect channel prefs (except mandatory statutory) and recorded; (5) WCAG 2.1 AA + responsive (375/768/1280, touch ≥44px).
- **Business Rules:** async, non-blocking, retried (X.2 backoff ×5 + DLQ); minimised push payloads (deep-link, no PII); P01 SLA reminder + auto-delegation (FR-19).
- **API References:** `GET /api/v1/atl/self-service/summary`; `GET /api/v1/atl/approvals/inbox`; `GET /api/v1/atl/notifications?status=`.
- **LLD:** `SelfServiceController`, `ApprovalInboxService`, `NotificationProducer` (→X.2). Workspace switcher derives Me/My Team/Admin from RBAC holdings (Foundation §workspace).

### FR-19 — Approval Delegation & Out-of-Office Routing (feeds **P01** `delegate`) *(R11)*
- **Primary Role(s):** manager/approver (set), HR (administer).
- **Description:** Approvers (or HR) define a delegation to another qualified approver for a date range and/or on SLA breach; **P01** auto-routes pending and incoming approval `workflow_actions` to the delegate within scope (P01 `delegate` operation).
- **Acceptance Criteria:** (1) create delegation with delegate, scope, request types, window; (2) during active delegation, new + pending tasks route to delegate; (3) on SLA breach (if `auto_on_sla_breach`), P01 auto-routes even without a window; (4) delegate = applicant → `DELEGATE_IS_APPLICANT` 422 (P02 SoD); no delegate → `NO_DELEGATE_AVAILABLE` 409 + escalate to HR; (5) revocable + auto-expire at `to_date`.
- **Business Rules:** delegate holds approver role in scope; SoD preserved (P02); delegation recorded in P05.
- **API References:** `POST /api/v1/atl/delegations`; `POST /api/v1/atl/delegations/{id}/revoke`; `GET /api/v1/atl/delegations?delegatorId=`.
- **LLD:** `DelegationService`, `WorkflowRouter` (→P01 `delegate`), `SlaEscalationJob` (P01 SLA runtime). Failures: `DELEGATE_IS_APPLICANT` 422; `NO_DELEGATE_AVAILABLE` 409.

### FR-20 — Time-Fraud & Punch Anomaly Detection & Review (EXTEND M05; P01 review) *(R10)*
- **Primary Role(s):** System (detect), Anomaly Reviewer/HR (review via P01; capability flag).
- **Description:** Screen each accepted punch (FR-03) for anomalies — impossible travel, duplicate same-second, geo mismatch, low liveness, device-binding mismatch — and open a `punch_anomaly_reviews` case (P01 flow) for reviewer disposition before the punch contributes to a locked feed.
- **Acceptance Criteria:** (1) matching punches stored `FLAGGED_FOR_REVIEW` + review case; (2) reviewer (≠ owner, P02 SoD) confirms valid/fraud/escalates; (3) `CONFIRMED_FRAUD` excludes punch + notifies HR/Security (X.2); (4) `CONFIRMED_VALID` releases for FR-04; (5) unresolved cases before lock surfaced in payroll reconciliation.
- **Business Rules:** thresholds (`IMPOSSIBLE_TRAVEL_KMH`, `LIVENESS_MIN_SCORE`) via `module_config`; liveness/photo per device capability; binding checked for `EMPLOYEE_BOUND`.
- **API References:** `GET /api/v1/atl/anomalies?status=`; `POST /api/v1/atl/anomalies/{id}/decision`.
- **LLD:** `AnomalyScreener`, `AnomalyReviewService`, `WorkflowEngineAdapter` (P01). Failures: `ANOMALY_REVIEW_REQUIRED` 202; self-review blocked 403 (P02).

### FR-21 — DPDP Biometric/Geo Consent, Lawful Basis & Non-Biometric Fallback (links **P05 `consent_records`**) *(R9)*
- **Primary Role(s):** employee (consent), HR/DPO (govern; DPO capability flag), SysAdmin (config).
- **Description:** Record per-employee lawful basis (statutory duty/consent/contract) in `biometric_consents` linked to platform `consent_records` (immutable/superseded, P05), capture consent for biometric/geo/photo (`VAL-CONSENT`), provide a `fallback_method` (RFID/manual/OTP), declare biometric-template storage per device, and enforce a retention/purge schedule (App. E) via `JOB-G03-RETENTION-PURGE` honouring legal holds.
- **Acceptance Criteria:** (1) each employee has a `biometric_consents` record + lawful basis before biometric/geo capture; (2) consent grant/withdraw; withdrawal engages fallback; (3) capture without valid basis → `CONSENT_REQUIRED` 403 + fallback offered; (4) template storage declared per device, surfaced to DPO; (5) retention/purge job removes biometric/geo/punch past `retention_until`; leave records retained per statutory schedule (never below statutory floor); (6) DPO audits basis/consent/purge (P05 read).
- **Business Rules:** mandatory biometric requires `STATUTORY_DUTY` or explicit `CONSENT`; non-enrolled always have a working fallback; geo minimised/purpose-bound; no PII in push.
- **API References:** `POST /api/v1/atl/consents`; `POST /api/v1/atl/consents/{id}/withdraw`; `GET /api/v1/atl/consents?employeeId=`; `POST /api/v1/atl/retention/purge-run`.
- **LLD:** `ConsentService` (↔P05 `consent_records`), `LawfulBasisResolver`, `FallbackEnroller`, `RetentionPurgeJob` (X.1). Failures: `CONSENT_REQUIRED` 403; `FALLBACK_UNAVAILABLE` 409; `PURGE_BLOCKED_LEGAL_HOLD` 409.

### FR-22 — Leave Entitlement Counters for Sanction-Based Leave (G03 new; gov-specific) *(R7,R14)*
- **Primary Role(s):** System/HR (maintain via P01 maker-checker), employee (consume via FR-12).
- **Description:** Maintain `leave_entitlements` counters (career/event/annual quota, consumed, remaining) and eligibility predicates (surviving children, child age, gender) for sanction types (Maternity, Paternity, CCL, Study, Sabbatical, LWP); FR-12 validates against these instead of a positive balance, while the ledger records informational `AVAIL`. This is a **gov-specific extension** absent from PrimeSoft M04.
- **Acceptance Criteria:** (1) each sanction type has a counter per employee (career e.g. CCL 730, event e.g. Maternity 180); (2) applying consumes `remaining_days`; exceed → `ENTITLEMENT_EXCEEDED` 409; (3) **(R14)** predicates (≤2 surviving children, child age ≤18/22-if-disabled) checked vs `employee_dependents` (`VAL-DEPENDENT`); fail → `INELIGIBLE_DEPENDENT` 422; (4) ledger informational `AVAIL`; (5) counters auditable + P01 maker-checker adjustable.
- **API References:** `GET /api/v1/atl/entitlements?employeeId=`; `POST /api/v1/atl/entitlements/adjust`.
- **LLD:** `EntitlementService`, `EligibilityEvaluator`, `LeaveLedgerService`. Failures: `ENTITLEMENT_EXCEEDED` 409; `INELIGIBLE_DEPENDENT` 422. Deps: FR-10/12, E29 (G01).

### FR-23 — Best-in-Class Absence Features (Forecast, Mass-Leave, Blackout, Return-to-Work) *(Proponent)*
- **Primary Role(s):** employee (forecast), HR (mass-leave/blackout/RTW).
- **Description:** (a) **What-if forecast** — project balance to a future date factoring scheduled accruals, approved future leave, lapse (read-only, same FR-11 engine). (b) **Mass-leave/shutdown** — HR applies leave/holiday to an org-unit cohort atomically with summary. (c) **Blackout/freeze** — windows via `module_config` (`VAL-HOLD`) where specified types are blocked. (d) **Return-to-work** — after long medical leave, require fitness clearance (P01) before attendance resumes.
- **Acceptance Criteria:** (1) forecast for a future date shows accruals/committed/lapse risk; (2) mass-leave creates per-employee applications/holidays atomically + summary (skips ineligible); (3) blocked types in active blackout → `BLACKOUT_PERIOD` 409 (`VAL-HOLD`); (4) long-medical sets `return_to_work_status=PENDING`; post-leave attendance gated until `CLEARED` with fitness cert (G13); (5) all respect P02 RBAC/scope + P05 audit.
- **API References:** `GET /api/v1/atl/leave-balances/forecast?employeeId=&asOf=`; `POST /api/v1/atl/mass-leave`; `POST /api/v1/atl/leave-applications/{id}/return-to-work`.
- **LLD:** `BalanceForecastService`, `MassLeaveService`, `BlackoutValidator` (`VAL-HOLD`), `ReturnToWorkService` (P01). Failures: `BLACKOUT_PERIOD` 409; `RETURN_TO_WORK_PENDING` 409.

---

## 7. UI Requirements

### 7.1 Key screens (W.2 form definitions; Me / My Team / Admin workspaces)
| Screen | Workspace / Role | Purpose | Key states |
|---|---|---|---|
| Self-Service Dashboard | Me / Employee | Balances, forecast, quick-punch, apply CTA, status | empty/loading/error/no-permission |
| Apply-Leave Wizard | Me / Employee | Type→dates(half/full)→sandwich/reserve preview→document→submit | validation/insufficient-balance/conflict/blackout |
| Leave Ledger Statement | Me / Admin | Immutable balance history, downloadable | empty/loaded |
| Balance Forecast | Me / Employee | What-if projection | loading/projected |
| Attendance Grid (monthly) | Me / My Team | Color-coded status + sub-day allocations, drill to punches | loading/empty |
| Regularisation Form | Me / Employee | Correct missed punch | window-expired/cap/locked-period |
| Approvals Inbox | My Team / Manager | Approve/reject/recommend (incl. delegated, P01) | empty/pending/overdue/delegated |
| Team Leave Calendar | My Team / Manager | Team absences + conflict heat | empty/loading |
| Comp-Off Wallet | Me / Employee | Credits + expiry countdown, redeem | empty/expiring |
| Consent & Fallback | Me / DPO | Manage biometric/geo consent & fallback | granted/withdrawn |
| Anomaly Review Queue | Admin / Reviewer | Disposition flagged punches (P01) | empty/open/resolved |
| Delegation Panel | My Team / Admin | Out-of-office delegate setup | active/expired |
| Shift & Roster Planner | Admin / Attendance Admin | Define shifts, assign rosters | overlap-warning/locked-period |
| Holiday Calendar Admin | Admin / Leave Admin | Manage calendars/holidays, RH | duplicate-warning |
| Leave-Type & Policy Builder | Admin / Leave Admin | Configure types/policies | overlap-warning |
| Mass-Leave Console | Admin / HR | Shutdown/mass-leave cohort apply | dry-run/applied |
| Year-Close Console | Admin / HR Admin | Simulate→report→commit | simulated/committed |
| Payroll Reconciliation | Admin / Payroll | Period feed, adjustments, export, lock, ack | locked/exported/failed |

### 7.2 Cross-cutting UI rules (canonical UI-state standard, Foundation §3)
- Mobile-first, responsive (375/768/1280; touch ≥ 44×44 px); collapsible sidebar + hamburger; dark-mode.
- Every screen implements **empty / loading / error / no-permission / partial-data** states (no skeleton-only UI); masked PII per RBAC (P02 field mask on serialization); `E·AR` request-change fields route through P01.
- Dates `DD-MMM-YYYY`; one-decimal balances; INR locale formatting.
- WCAG 2.1 AA: keyboard, focus order, contrast, ARIA on calendars/grids.
- Toasts for results; modals for destructive actions (cancel, year-close commit, mass-leave, purge) with explicit confirmation + reason (`ERR-REASON-REQ` if missing).
- **Cursor pagination** on all lists (limit 25/100, `next_cursor`) with filters + CSV export where applicable.
- i18n-ready (English + regional); no hardcoded strings; copy referenced by `MSG-G03-*`/`ERR-*` id (Foundation §5), never inlined.

---

## 8. API & Integration (platform conventions adopted verbatim)

### 8.1 Conventions (Foundation §1; Recon §C)
Base path **`/api/v1`** (module routes under `/api/v1/atl/*`). Bearer JWT carrying resolved roles/entity scope; endpoints never re-implement permission logic — they call **`Authorization.check`** (P02). **`Idempotency-Key`** on all workflow-initiating POSTs (24h replay → original result). **Cursor pagination only**: `?limit=` (default 25, max 100) + `cursor=`; response carries `next_cursor`. `?sort=field:asc|desc` + field filters. Every request carries/assigned **`X-Correlation-Id`**, echoed and written to every P05 audit/log line. Effective-dated mutations accept `effective_from` (staged, not live — `VAL-EFFECTIVE`).

### 8.2 Canonical error envelope (Recon §C — replaces the v2 `{…, requestId}` shape)
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "End date must be on or after start date.", "field": "end_date", "details": {} } }
```
2xx returns the resource payload; 4xx/5xx return the envelope above. **The correlation id is the `X-Correlation-Id` response header, not a body `requestId`.**

### 8.3 Standard error code table (Foundation §1 — the 8-code platform table governs)
| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | **422** | input failed a `VAL-*` rule |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted; never leaks out-of-scope existence |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state/version conflict |
| `PRECONDITION_FAILED` | 412 | required precondition not met |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error |

> **Migration of v2 codes (Recon §C):** v2 `VALIDATION_ERROR (400)` → `VALIDATION_FAILED (422)`; `AUTH_REQUIRED (401)` → `UNAUTHENTICATED`; `INTERNAL_ERROR (500)` → `INTERNAL`; `UPSTREAM_UNAVAILABLE (503)` dropped (upstream failures handled via **X.3** mapping + 500/`ERR-LOADFAIL`); `PRECONDITION_FAILED (412)` added.

### 8.4 Module-specific failure conditions → platform code mapping
Module business failures keep their **domain reason** (carried in `error.code`/`details`) and map to a platform HTTP code; user-facing copy is an `ERR-G03-*` message (Foundation §5). Representative mapping:

| Domain reason (v2 code) | Platform HTTP | Notes |
|---|---|---|
| `ROSTER_OVERLAP`, `HOLIDAY_DUPLICATE`, `RH_CAP_EXCEEDED`, `EXCEPTION_OVERLAP`, `WFH_CAP_EXCEEDED`, `OT_CAP_EXCEEDED`, `COMP_OFF_INSUFFICIENT`, `POLICY_OVERLAP`, `TYPE_IN_USE`, `ACCRUAL_ALREADY_RUN`, `OPTIMISTIC_LOCK_CONFLICT`, `INSUFFICIENT_BALANCE`, `ENTITLEMENT_EXCEEDED`, `LEAVE_OVERLAP`, `BLACKOUT_PERIOD`, `ENCASHMENT_CAP_EXCEEDED`, `LTC_BLOCK_EXHAUSTED`, `YEAR_ALREADY_CLOSED`, `PENDING_LEAVE_BLOCKS_CLOSE`, `PERIOD_LOCKED`/`PERIOD_ALREADY_LOCKED`, `REGULARISATION_LIMIT`, `NO_DELEGATE_AVAILABLE`, `FALLBACK_UNAVAILABLE`, `PURGE_BLOCKED_LEGAL_HOLD`, `RETURN_TO_WORK_PENDING` | **409 `CONFLICT`** | state/precondition conflicts; `ERR-DUP-INSTANCE` for duplicate workflow start |
| `GEOFENCE_VIOLATION`, `INVALID_PUNCH_TIME`, `ALLOCATION_EXCEEDS_DAY` (`VAL-G03-ALLOC`), `COMMUTED_REQUIRES_HPL`, `DAY_UNITS_MISMATCH` (`VAL-G03-DAYUNITS`), `OT_NOT_SUPPORTED_BY_PUNCHES`, `DOCUMENT_REQUIRED`, `COMP_OFF_EXPIRED`, `ELIGIBILITY_FAILED`, `INELIGIBLE_DEPENDENT`, `CANNOT_CANCEL_PAST`, `BACKDATE_WINDOW_EXCEEDED`, `WINDOW_EXPIRED`, `NOT_ENCASHABLE`, `DELEGATE_IS_APPLICANT` | **422 `VALIDATION_FAILED`** | failed a `VAL-*`/`VAL-G03-*` rule |
| `DEVICE_NOT_AUTHORIZED`, `CONSENT_REQUIRED` | **403 `FORBIDDEN`** | `ERR-FORBIDDEN` copy |
| `LEDGER_RECON_MISMATCH`, `PROCESSING_ERROR` | **500 `INTERNAL`** | ops alert; `ERR-LOADFAIL` |
| `SR_POSTING_FAILED`, `G10_ACK_TIMEOUT` | async retry (X.3) | not a synchronous HTTP error; tracked as `FAILED` + HR alert |
| `LOCKED_PERIOD_ADJUSTMENT_EMITTED`, `ANOMALY_REVIEW_REQUIRED` | **200 / 202** | informational outcomes |

### 8.5 Shared ERR-* reused; module ERR-G03-* authored
Reused (Foundation §5): `ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-PAST-DATED`, `ERR-REASON-REQ`, `ERR-REVOKE-FORBIDDEN`, `MSG-SYS-JOBFAIL`. Module-unique copy authored as `ERR-G03-*` (e.g. `ERR-G03-INSUFF-BAL`, `ERR-G03-COMMUTED-HPL`, `ERR-G03-CONSENT`, `ERR-G03-BLACKOUT`, `ERR-G03-LTC-EXHAUSTED`) and registered in the Foundation §5 index.

### 8.6 Module-unique validation rules (`VAL-G03-*`, registered in Foundation §2)
| Id | Rule |
|---|---|
| `VAL-G03-ROSTER-OVERLAP` | no overlapping PUBLISHED roster per employee/date |
| `VAL-G03-HOLIDAY-DUP` | unique (`calendar_id`,`holiday_date`) |
| `VAL-G03-RHCAP` | RH elections ≤ `rh_cap` |
| `VAL-G03-ALLOC` | Σ `day_fraction` ≤ 1.0 per employee/day |
| `VAL-G03-DAYUNITS` | `SUM(day_units)` = `total_days` |
| `VAL-G03-COMMUTED` | `debit_ratio>1` requires `debits_against_leave_type_id` + sufficient target |
| `VAL-G03-SANDWICH` | non-working-day counting per `sandwich_rule` |
| `VAL-G03-RETIRE-ENCASH` | combined EL+HPL ≤ `retirement_encash_cap_days` |
| `VAL-G03-LTC` | LTC ≤ 10/block, 60/career |
| `VAL-G03-SHIFT-TIMES` | shift time-order + threshold sanity |

Directly reused: `VAL-LV` (leave application), `VAL-AT` (attendance request), `VAL-HOLD` (blackout/hold), `VAL-CONSENT`, `VAL-DEPENDENT`, `VAL-DATE`, `VAL-DOB`, `VAL-EFFECTIVE`, `VAL-FILE`, `VAL-COMMENT`, `VAL-ENUM`, `VAL-MASTER-UNIQUE`.

### 8.7 Scheduled jobs (registered in Foundation §4 index; runner per X.1)
| Reused PrimeSoft job | Use in G03 |
|---|---|
| `JOB-M04-ACCRUAL` | leave accrual (extended with rounding/proration/year-basis) — FR-11 |
| `JOB-M04-CARRYFWD` | year-end carry-forward + lapse — FR-15 |
| `JOB-M04-AUTOREJECT` | date-specific auto-reject of pending leave — FR-12 lifecycle |
| `JOB-M04-SANDWICH` | sandwich-leave computation — FR-12 (bound to `sandwich_rule`) |
| `JOB-M04-ESCALATE` / `JOB-M05-ESCALATE` | leave/attendance SLA escalation — FR-18/19 (P01 SLA) |
| `JOB-M04-LOP` / `JOB-M05-LOP` | LOP computation/report — FR-17 |
| `JOB-M04-SMART` | comp-off/CF expiry reminders — FR-09 |
| `JOB-M05-CLOSE` | daily attendance close — FR-04 |
| `JOB-M05-LOCK` | period lock / freeze — FR-17 |
| `JOB-M05-ABSCOND` | absconding detection — feeds FR-04 alerting |

| New module job (`JOB-G03-*`, registered in Foundation §4) | Use |
|---|---|
| `JOB-G03-RECOMPUTE` | consumes recompute queue (`attendance_processing_runs`) — FR-04/05/07/08/12/13 |
| `JOB-G03-LEDGER-RECON` | nightly balance↔ledger reconciliation — FR-11 |
| `JOB-G03-COMPOFF-EXPIRE` | expire comp-off credits — FR-09 |
| `JOB-G03-RESERVATION-TTL` | auto-release undecided reservations — FR-12 |
| `JOB-G03-RETENTION-PURGE` | DPDP biometric/geo purge — FR-21 |

### 8.8 Endpoint examples (re-grounded headers/envelope)
**Apply leave** — `POST /api/v1/atl/leave-applications` with `Idempotency-Key: <uuid>`; response `201` includes `applicationNo`, `status`, `totalDays`, `ledgerDebitUnits`, `reservationId`, `balancePreview {before, reserved, available, sandwichCountedDays}`; correlation id in `X-Correlation-Id` header (no body `requestId`).
**Insufficient balance** — `409 CONFLICT` `{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Available EL balance 1.5 (after reservations) is less than requested 2.5.", "field": "days", "details": {} } }`.
**Approve (atomic, version-checked, P01)** — `POST /api/v1/atl/leave-applications/{id}/decision` `{ "decision":"APPROVE", "expectedVersion":7 }` → `200`; concurrent stale → `409` `OPTIMISTIC_LOCK_CONFLICT`.
**Mobile geo punch** — `POST /api/v1/atl/punches/mobile`; `201` ACCEPTED, `202` FLAGGED_FOR_REVIEW, or `403` `CONSENT_REQUIRED`.

### 8.9 Integration contracts (re-grounded)
| Integration | Direction | Mechanism | Notes |
|---|---|---|---|
| Digital SR (**G03 → G04 → G12-SR**) | Outbound to **G04** (G03 is **not** an SR writer) | Signed (HMAC) transactional-outbox event on leave approval/amendment/cancellation (X.3), consumed by **G04** which posts to **G12-SR** | Emits `LEAVE_APPROVED`/`LEAVE_AMENDED`/`LEAVE_CANCELLED` carrying the stable **`leave_spell_lineage_id`** (G04 FR-01 correlation key) + signed-capture fields; G04 dedupes by `leave_spell_lineage_id + event_sequence`. G03 tracks `sr_posting_status` (PENDING/POSTED/FAILED) only; **G03 never calls `POST /api/v1/sr/ingest` and never writes the SR ledger** — G04 posts leave events to G12. Retry/backoff on the G03→G04 hop. |
| Payroll (**G10**) | Outbound | Period feed + adjustments + ack (X.3) | Period lock after export; corrections via `payroll_feed_adjustments` (R6). |
| Pension/Terminal benefits (**G11**) | Bidirectional | Retirement encashment-eligible balance (EL+HPL make-up) | G11 requests eligible balance; G03 supplies + debits on settlement (R5). |
| Document store (**G13/M11**) | Outbound | `documents` reference ids | Medical certs, tour orders, punch photos, fitness certs, consent artefacts. |
| Notifications (**X.2**) | Outbound | Per-event triggers (`MSG-G03-*`) | IN_APP + EMAIL parallel; statutory mandatory. |
| Employee master (**G01/M01**) | Inbound | Read API/replica | Golden source; dependents (E29); soft-deleted blocks new applications. |
| Workflow (**P01**) | Internal | `startInstance/advance/approve/reject/sendBack/delegate/cancel` | All approvals; SoD; in-flight version pinning. |
| Audit (**P05**) | Internal | DB-trigger | All mutations; dual log; immutable. |
| Migration (**P06**) | One-off | ETL+V, 3 dry runs, waves | Legacy register migration (§13). |

---

## 9. Non-Functional Requirements (platform NFR baseline adopted — Recon §C)
| Category | Requirement |
|---|---|
| Performance | Standard API **p95 < 500 ms @ 300 concurrent**; read-heavy (directory/reports) p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; web LCP (4G) < 2.5 s; punch ingest ≥ 500 events/s (incl. anomaly screen); nightly attendance close of 50k employees < 30 min; balance-debit lock contention < 1% retries. |
| Scalability | Horizontal scaling of API + X.1 batch workers; ledgers partitioned by `leave_year`; device ingest queue-buffered. |
| Availability | **99.5%/month uptime** (platform baseline, not the invented 99.9%); degraded-mode read of balances if batch workers down. |
| Reliability | **RTO < 4 h · RPO < 1 h** (platform baseline, not the invented 15 min); idempotent ingestion/accrual/feed; at-least-once SR posting (G04) with dedupe; lost-update prevented by optimistic lock (R1); X.1 retry ×3; X.2 retry ×5 + DLQ. |
| Security | Bearer JWT + MFA for HR Admin/Org Admin (and high-privilege gov roles); **P02** RBAC + 5-dimension row-level scoping; device keys hashed (P04); device-to-employee binding; OWASP; TLS 1.2+; AES-256-GCM at rest, per-tenant KMS; no PII in push; full **P05** audit. |
| Privacy (DPDPA) | DPDP-Act-2023 alignment via platform `consent_records` (P05); recorded lawful basis + consent for biometric/geo (R9); templates per declared `template_storage`, encrypted if server-side; geo minimised/purpose-bound; statutory retention floors honoured; non-biometric fallback for all (App. E). |
| Anti-fraud | Liveness/photo option; impossible-travel/duplicate-second/geo-mismatch/binding detection; mandatory P01 review before locked-period contribution (R10). |
| Auditability | **P05** dual-log DB-trigger (100% mutation capture, zero gaps) + append-only domain ledgers; before/after on regularisation/adjustment/cancellation; reservation/consent/anomaly/delegation actions audited; reading audit is itself audited; ≥ 7-yr retention; tamper-evidence tracks OPEN-PLAT-03. |
| Accessibility | WCAG 2.1 AA across web/mobile. |
| Observability | Structured logs with `X-Correlation-Id`; metrics on ingest lag, processing duration, reconciliation status, SR-posting backlog (G04), feed ack latency, reservation leak, lock-conflict rate, anomaly backlog, consent coverage; alerts on `LEDGER_RECON_MISMATCH`, SR/feed failures, unresolved anomalies before lock (→ `MSG-SYS-JOBFAIL`). |
| Localisation | UTC storage; per-shift `display_timezone` bucketing (IST default; multi-TZ ready — DST revisitable, App. B); i18n; INR formatting. |
| Maintainability | Configurable policies/enums/thresholds via `module_config` (effective-dated cascade) + versioned policies; no hardcoded statutory constants. |
| Deletions | Soft-delete only (no hard delete). |

---

## 10. Workflow & State Diagrams (run on **P01**; `workflow_actions` replace v2 `workflow_tasks`)

> All approval flows are **configured W.1 process-flow definitions** executed by P01; each transition emits one `workflow_actions` row + a P05 audit row. SoD (no self-approve; reviewer ≠ owner; delegate ≠ applicant) is enforced by P01/P02. In-flight instances pin their definition version.

### 10.1 Leave application state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | save draft | DRAFT | — |
| DRAFT | submit (P01 `startInstance`) | SUBMITTED | create `leave_reservations` hold; reserved netted; X.2 notify approver |
| SUBMITTED | recommend (P01 `advance`) | RECOMMENDED | multi-step; delegate-aware |
| SUBMITTED/RECOMMENDED | approve (P01 `approve`) | APPROVED | txn: lock balance (FOR UPDATE+version) → consume reservation → ledger debit → recompute enqueue → G04 SR enqueue → X.2 notify |
| SUBMITTED/RECOMMENDED | reject (P01 `reject`) | REJECTED | release reservation; notify |
| SUBMITTED | withdraw | WITHDRAWN | release reservation |
| SUBMITTED | reservation TTL expiry (`JOB-G03-RESERVATION-TTL`) | DRAFT/expired | auto-release (R1) |
| APPROVED | cancel (future) | CANCELLED | AVAIL_REVERSAL; G04 SR reversal; recompute enqueue; feed adjustment if locked |

### 10.2 Regularisation state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | X.2 notify manager/delegate |
| SUBMITTED | approve (P01) | APPROVED | enqueue FR-04 recompute (`is_regularised=true`); feed adjustment if locked |
| SUBMITTED | reject (P01) | REJECTED | no change; reason logged (P05) |
| SUBMITTED | cancel | CANCELLED | by requester |

### 10.3 Overtime state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| SUBMITTED | approve(PAID) | APPROVED→PAID | feed `paid_ot_minutes` |
| SUBMITTED | approve(COMP_OFF) | APPROVED→CONVERTED_TO_COMPOFF | `comp_off_ledger` EARN |
| SUBMITTED | reject | REJECTED | — |

### 10.4 Year-close run state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| DRAFT | simulate | SIMULATED | report, no writes |
| SIMULATED | commit | COMMITTED | ledger CF/LAPSE/CONVERSION/OPENING + new balances (ordered) |
| DRAFT/SIMULATED | error | FAILED | rollback; alert |

### 10.5 Payroll feed state table
| Current | Event | Next | Side effect |
|---|---|---|---|
| PENDING | export (X.3) | EXPORTED | set `is_locked=true` (`JOB-M05-LOCK`) |
| EXPORTED | G10 ack | ACKED | finalise |
| EXPORTED | ack-timeout | FAILED | X.3 retry |
| (locked) | late correction | adjustment PENDING | INSERT `payroll_feed_adjustments` next period (R6) |

### 10.6 Approval routing matrix (P01 approver resolution by reporting-chain; delegation-aware, R11)
| Leave/request type | Step 1 | Step 2 | Step 3 | Delegation/Escalation |
|---|---|---|---|---|
| CL / Comp-off | Reporting Manager (L1) | — | — | P01 active delegate or SLA-escalate |
| EL / HPL | Reporting Manager | HR Officer | — | delegate or SLA-escalate |
| Maternity / Paternity / CCL / Medical | Reporting Manager | HR Officer | Sanctioning Authority (gov role) | Entitlement + dependent check (FR-22); delegate-aware |
| Commuted / Study / Sabbatical / LWP | Reporting Manager | HR Officer | Sanctioning Authority | Commuted→HPL debit; delegate-aware |
| Regularisation / OT / WFH / OD | Reporting Manager | (HR optional) | — | delegate or SLA-escalate |
| Encashment (in-service / LTC) | HR Officer | Sanctioning Authority (HR-Admin authorises) | — | LTC cap check (FR-16) |
| Encashment (retirement) | HR Officer | Sanctioning Authority | G11 settlement | EL+HPL make-up (R5) |
| Punch anomaly | Anomaly Reviewer (flag) | (escalate) HR/Security | — | Reviewer ≠ owner (P02 SoD) |
| Return-to-work | HR Officer | — | — | Fitness certificate required (G13) |

### 10.7 Punch anomaly review state table (R10)
| Current | Event | Next | Side effect |
|---|---|---|---|
| (flagged) | open | OPEN | case created; punch excluded pending review |
| OPEN | confirm valid | CONFIRMED_VALID | release punch to FR-04 |
| OPEN | confirm fraud | CONFIRMED_FRAUD | exclude punch; X.2 notify HR/Security |
| OPEN | escalate | ESCALATED | route to HR/Security |

### 10.8 Consent state table (R9; ↔ P05 `consent_records`)
| Current | Event | Next | Side effect |
|---|---|---|---|
| (none) | record basis/consent | GRANTED / NOT_REQUIRED | enable biometric/geo capture |
| GRANTED | withdraw | WITHDRAWN | engage `fallback_method` for future punches |
| any | retention expiry | (purged) | biometric/geo anonymised/deleted (`JOB-G03-RETENTION-PURGE`) |

---

## 11. Notifications (run on **X.2**; templates by `MSG-G03-*` id)
Channels `IN_APP` + `EMAIL` fire in parallel for approvals; **EMAIL for approval-workflow and statutory notifications is mandatory and not user-suppressible** (X.2; BRD §9.9). Retry backoff ×5 + DLQ; digest for non-urgent IN_APP; every dispatch audit-logged (P05). Copy referenced by id, never inlined.

| Event | Trigger FR | Recipients | Channels | Content (PII-minimised) |
|---|---|---|---|---|
| Leave submitted | FR-12 | Approver/delegate | IN_APP + EMAIL | name, type, dates, deep-link |
| Leave approved/rejected | FR-12 | Applicant | IN_APP + EMAIL | decision, dates, balance after |
| Leave cancelled | FR-13 | Applicant, approver | IN_APP + EMAIL | cancelled days, credited-back |
| Approval pending > SLA | FR-18/19 | Approver → delegate/escalation | EMAIL (push) | reminder + deep-link |
| Delegation active | FR-19 | Delegate | IN_APP + EMAIL | scope, dates |
| Low balance warning | FR-11/12 | Employee | IN_APP | type, remaining/available |
| Accrual credited | FR-11 | Employee | IN_APP | type, units, new balance |
| Comp-off expiring (T-7) | FR-09 | Employee | IN_APP (push) | days expiring, date |
| Regularisation decided | FR-05 | Employee | IN_APP + EMAIL | day, decision |
| OT approved | FR-06 | Employee | IN_APP | minutes, treatment |
| Absent today | FR-04 | Employee, manager | IN_APP | date flagged |
| Punch anomaly flagged | FR-20 | Reviewer, HR/Security | IN_APP + EMAIL | anomaly type, deep-link (no biometric data) |
| Consent withdrawn / fallback engaged | FR-21 | Employee, DPO | IN_APP | capture type, fallback method |
| Return-to-work due | FR-23 | Employee, HR | IN_APP + EMAIL | clearance required |
| SR posting failed (G04) | FR-12 | HR Officer | IN_APP + EMAIL | application no, retry status |
| Payroll feed exported / adjustment | FR-17 | Payroll Officer | IN_APP | period, totals, adjustment ref |
| Year-close committed | FR-15 | HR Admin | IN_APP + EMAIL | scope, carried/lapsed totals |

All recorded in platform `notifications`; respect channel prefs except mandatory statutory; async with retry; IN_APP fallback.

---

## 12. Reporting & Analytics (aggregates surfaced to **G14/M16**)
| Report | Audience | Contents |
|---|---|---|
| Monthly Attendance Register | HR/Manager | Per-employee daily status grid (sub-day allocations), present/absent/leave totals |
| Leave Balance Statement | Employee/HR | Per-type opening/accrued/availed/reserved/encashed/lapsed/current |
| Leave Ledger Export | Auditor/HR | Immutable entry-level history |
| Leave Utilisation Analytics | HR/Mgmt | Leave by type/department/period; trends |
| Absenteeism & LWP Report | HR/Payroll | LWP days, chronic absenteeism flags |
| Overtime & Comp-Off Report | HR/Payroll | OT minutes, paid vs comp-off, expiry exposure |
| Team Leave Calendar Export | Manager | Absences and conflicts |
| Year-Close Reconciliation | HR Admin/Auditor | Carried/lapsed/converted per employee |
| Statutory Leave Posting Status | SR Custodian/HR | SR posting success/failure per application (via G04) |
| Encashment Liability Report | HR/Finance | Outstanding encashable balance valuation (EL+HPL retirement) |
| Anomaly & Fraud Review Report | HR/Security/Auditor | Flagged punches, dispositions, fraud confirmations |
| Consent & Retention Compliance Report | DPO/Auditor | Consent coverage, lawful-basis map, purge execution log |
| Entitlement Utilisation Report | HR | Sanction-leave quota/consumed/remaining per employee |

All reports: data scoped to each user's entitlement (P02 `scope_filter` + field mask); cursor-paginated; CSV/PDF export; scheduled-email; aggregates feed **G14**. No PII beyond role entitlement; biometric/geo never exported.

---

## 13. Migration & Launch (run on **P06** ETL+V)
Legacy leave/attendance data migrates through **P06** (Extract → Validate → Transform → Load → Verify; **three mandatory staging dry runs**; waves; `migration_runs` ledger; failed records logged with source row + violated rule). A `gov_source_id` traceability/dedup column follows the `darwinbox_source_id` pattern against the actual legacy register (`GAP (gov-specific)` — source system differs; Recon §C/§D).

### 13.1 Data migration
| Step | Source | Target | Validation |
|---|---|---|---|
| Leave types & policies | Legacy registers / rules | leave_types, leave_accrual_policies (EXTEND M04) | Statutory caps, commuted-link, sandwich/year-basis (`VAL-LV`) |
| Sanction entitlements | Service records | leave_entitlements | Career/event quotas + dependents reconciled (`VAL-DEPENDENT`) |
| Opening leave balances | Legacy ledgers | leave_balance_ledger (OPENING) + leave_balances (version 0) | Reconciliation = 0 mismatch |
| Holiday calendars | Office circulars | holiday_calendars/holidays | Per-location completeness |
| Roster/shift assignments | HR records | shifts/rosters (EXTEND M05) | No overlaps; date-anchor set |
| Devices & consent | IT inventory / HR | attendance_devices (P04), biometric_consents (↔P05) | Geofence/binding/template-storage + lawful basis |
| Module config | Legacy parameters | module_config | Appendix-C tunables migrated |
| Historical attendance (optional) | Biometric exports | attendance_punches/daily/allocations | Spot reconciliation |

### 13.2 Cutover & rollout
Phased: configuration → entitlement + balance migration with reconciliation sign-off → device integration (P04) + consent capture → pilot org unit → org-wide. Parallel run for one leave cycle + one payroll cycle. Go/No-Go: 0 reconciliation mismatches; SR (G04) and payroll (G10) feeds incl. adjustments validated end-to-end; consent coverage ≥ 100% or fallback enrolled; **P06 three dry runs passed**.

### 13.3 Rollback
P06 reversible batches; ledger OPENING entries tagged with `migration_runs` id for clean reversal; feature flags per FR.

### 13.4 Launch readiness checklist
Balances + entitlements reconciled; policies signed off by HR/legal; commuted/sandwich/rounding configured; G04 SR + G10 payroll handshakes + adjustments tested; consent/lawful-basis + retention schedule signed off by DPO; anomaly review queue staffed; X.2 notifications verified; RBAC v1.7 scopes validated (P02); accessibility audit passed; runbooks + on-call in place; new gov roles/flags registered in RBAC §2.2/§4.3; `VAL-G03-*`/`JOB-G03-*`/`MSG-G03-*`/`ERR-G03-*` registered in Foundation indexes.

---

## Alignment with PrimeSoft Platform

Per `PLATFORM_FOUNDATION.md` §9.6, this section maps each FR to the platform service(s) it runs on (P01/P02/P05/P06/X/W) and the PrimeSoft module it extends, and names any `GAP (gov-specific)` logic G03 authors. G03 authors **no platform engine**; it authors public-sector leave logic on top of M04/M05 and the platform substrates.

| FR | Extends (PrimeSoft) | Workflow P01 | Authz/Mask P02 | Audit P05 | Jobs (X.1) | Notif X.2 | Integration X.3 | Forms/Flows W.1/W.2/W.3 | Reused VAL / new VAL-G03 | `GAP (gov-specific)` authored |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-01 Shifts/Rosters | M05 | — | ✓ | ✓ | `JOB-G03-RECOMPUTE` | — | — | W.2 form | `VAL-AT` / `VAL-G03-ROSTER-OVERLAP`,`-SHIFT-TIMES` | gov shift/weekly-off policy |
| FR-02 Holidays/RH | M05 | — | ✓ | ✓ | `JOB-G03-RECOMPUTE` | — | — | W.2 | `VAL-AT` / `VAL-G03-HOLIDAY-DUP`,`-RHCAP` | RH election + gov calendars |
| FR-03 Punch ingestion | M05 (+P04 devices) | — | ✓ | ✓ | — | — | — | — | `VAL-AT`,`VAL-CONSENT` | anomaly + consent gating |
| FR-04 Daily processing | M05 | — | ✓ | ✓ | `JOB-M05-CLOSE`,`JOB-G03-RECOMPUTE` | abs alert | — | — | — / `VAL-G03-ALLOC` | sub-day allocation engine |
| FR-05 Regularisation | M05 | ✓ | ✓ | ✓ | `JOB-M05-ESCALATE` | ✓ | — | W.1 flow | `VAL-AT` | locked-period adjustment |
| FR-06 Overtime | M05/M04 | ✓ | ✓ | ✓ | — | ✓ | — | W.1/W.2 | `VAL-AT` | comp-off treatment |
| FR-07 WFH | M05 | ✓ | ✓ | ✓ | `JOB-G03-RECOMPUTE` | ✓ | — | W.1 | `VAL-AT` | — |
| FR-08 OD/Tour | M05 | ✓ | ✓ | ✓ | `JOB-G03-RECOMPUTE` | ✓ | — | W.1/W.2 | `VAL-AT`,`VAL-FILE` | tour-order linkage |
| FR-09 Comp-off | M04/M05 | — | ✓ | ✓ | `JOB-G03-COMPOFF-EXPIRE`,`JOB-M04-SMART` | ✓ | — | — | — | comp-off SSOT ledger |
| FR-10 Leave-type config | M04 | — | ✓ | ✓ | — | — | — | W.2 (config cascade) | `VAL-LV`,`VAL-EFFECTIVE` / `VAL-G03-COMMUTED` | EL/HPL/commuted/sandwich/year-basis |
| FR-11 Accrual/Ledger | M04 | maker-checker | ✓ | ✓ | `JOB-M04-ACCRUAL`,`JOB-G03-LEDGER-RECON` | accrual/low-bal | — | — | — | rounding/proration + clawback + version |
| FR-12 Leave apply/approve | M04 | ✓ (all 5 patterns) | ✓ | ✓ | `JOB-M04-SANDWICH`,`JOB-M04-AUTOREJECT`,`JOB-G03-RESERVATION-TTL` | ✓ | →G04 | W.1 chain + W.2 form | `VAL-LV`,`VAL-HOLD`,`VAL-DEPENDENT` / `VAL-G03-DAYUNITS`,`-SANDWICH` | reservation/concurrency/commuted/sandwich/entitlement |
| FR-13 Cancel/Modify | M04 | ✓ | ✓ | ✓ | — | ✓ | →G04 | W.1 | `VAL-LV` | partial reversal + locked-period |
| FR-14 Backdate/Calendar | M04 | ✓ (elevated) | ✓ (My Team scope) | ✓ | — | — | — | W.1 | `VAL-DATE` | conflict detection |
| FR-15 Year-close | M04 | maker-checker | ✓ | ✓ | `JOB-M04-CARRYFWD` | ✓ | — | — | — | CF/lapse/conversion ordering |
| FR-16 Encashment | M04 | ✓ (HR-Admin auth) | ✓ | ✓ | — | — | →G10/G11 | W.1/W.2 | — / `VAL-G03-RETIRE-ENCASH`,`-LTC` | retirement EL+HPL make-up; LTC |
| FR-17 Payroll feed | M04/M05 | — | ✓ | ✓ | `JOB-M04-LOP`,`JOB-M05-LOP`,`JOB-M05-LOCK` | ✓ | →G10 | — | — | locked-period adjustments |
| FR-18 Self-service/Notify | — (Me/My Team) | — | ✓ (workspace) | ✓ | `JOB-*-ESCALATE` | ✓ (`MSG-G03-*`) | — | W.3 | — | — |
| FR-19 Delegation | — | ✓ `delegate` | ✓ (SoD) | ✓ | P01 SLA | ✓ | — | W.3 | — | OOO routing config |
| FR-20 Anomaly review | M05 | ✓ review flow | ✓ (SoD reviewer≠owner) | ✓ | — | ✓ | — | W.1 | — | fraud detection rules |
| FR-21 DPDP consent | — (↔P05 `consent_records`) | — | ✓ (PII ceiling) | ✓ | `JOB-G03-RETENTION-PURGE` | ✓ | — | W.2 | `VAL-CONSENT` | lawful basis + fallback + retention |
| FR-22 Entitlement counters | M04 ext | maker-checker | ✓ | ✓ | — | — | — | — | `VAL-DEPENDENT` | **sanction quota engine (gov-specific)** |
| FR-23 Forecast/Mass/Blackout/RTW | M04 ext | ✓ (RTW) | ✓ | ✓ | — | ✓ | — | W.1/W.2 | `VAL-HOLD` | forecast + mass-leave + blackout + RTW |

**Net-new vs platform:** G03 authors **no** platform engine and **no** net-new statutory ledger (those are G04/G12). Its only genuinely gov-specific business logic is the **sanction-leave entitlement engine (FR-22)** and the **public-sector leave catalog + statutory accrual/encashment/sandwich rules** (FR-10/11/15/16) — all expressed as **extensions to PrimeSoft M04**, running on P01/P02/P05. SR posting and the SR ledger are explicitly **out of scope** here and owned by **G04 → G12-SR**.

---

## Amendments (v2 → v3: platform re-grounding)

Every change from v2.0 (`M03-ATL`) to v3.0 (`G03`, platform-grounded). No v2 functional behaviour was removed; the changes re-anchor the spec onto PrimeSoft.

| # | Area | v2 (invented `SHARED_FOUNDATION`) | v3 (platform-grounded) | Authority |
|---|---|---|---|---|
| A1 | Module code | `M03-ATL` | **`G03`** (alias GOV-M03); ids `VAL-G03-*`/`JOB-G03-*`/`MSG-G03-*`/`ERR-G03-*` | Recon §B |
| A2 | Relationship | Greenfield "M03 (new)" entities | **EXTEND/REUSE of PrimeSoft M04 Leave + M05 Attendance**; reuse leave/accrual/holiday/shift/comp-off/regularisation engines; add only public-sector types/rules | Recon §A |
| A3 | Multi-tenancy | Omitted | **`tenant_id` (NOT NULL) + `entity_id`** on every entity; data-layer scoping; unscoped queries rejected | Platform §0.1; Recon §C |
| A4 | Approvals engine | Invented `workflow_instances`/`workflow_tasks` | **P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`); `workflow_instances`/`workflow_actions`; 5 patterns; in-flight version pinning; idempotent actions | Platform §P01; Recon §C |
| A5 | Authorization/masking | Ad-hoc RBAC + row scoping | **P02 `Authorization.check`** only; 5 scoping dimensions; field mask on serialization; PII Protection Ceiling for biometric/identity | Platform §P02; RBAC §3.9 |
| A6 | Roles | Invented role list (Sanctioning Authority, DPO, Auditor, SysAdmin…) | **RBAC v1.7 taxonomy** reused; `employee`/`l1–l5`/`hod`/`leave_admin`/`attendance_admin`/`hr_admin`/`payroll_admin`; gov actors as **new roles + capability flags** (Sanctioning Authority, DPO, Anomaly Reviewer); Auditor→Org-Admin read; SysAdmin→Org/Platform Admin; SoD by P01/P02 | RBAC §2/§4.3; Recon §C |
| A7 | Approver resolution | Generic chain | **P01 reporting-chain resolution** surfaced in **My Team** workspace; Me/My Team/Admin workspace model | Platform §P01; Foundation workspace |
| A8 | Audit | Invented single `audit_log` | **P05 dual log** (`audit_log` + `security_audit_log`), DB-trigger, immutable, ≥7-yr; G03 defines no `audit_log`; tamper-evidence tracks OPEN-PLAT-03 | Platform §P05; Recon §C |
| A9 | API conventions | `/api/v1` + page/limit, `requestId` body | `/api/v1`; **cursor-only** pagination (limit 25/100, `next_cursor`); `Idempotency-Key` (24h); **`X-Correlation-Id` header** (no body `requestId`); effective-dating staged | Foundation §1; Recon §C |
| A10 | Error envelope/codes | `{error,requestId}`, `VALIDATION_ERROR 400`, `AUTH_REQUIRED 401`, `INTERNAL_ERROR 500`, `UPSTREAM_UNAVAILABLE 503` | **`{error:{code,message,field,details}}`** + 8-code table (`VALIDATION_FAILED 422`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `RATE_LIMITED`, `INTERNAL`); 503 dropped; module reasons map to platform codes + `ERR-G03-*` copy | Foundation §1; Recon §C; §8.3/§8.4 |
| A11 | Validation | Inline rules | Cite `VAL-LV`/`VAL-AT`/`VAL-HOLD`/`VAL-CONSENT`/`VAL-DEPENDENT`/`VAL-EFFECTIVE` etc.; author only `VAL-G03-*` (§8.6) registered in Foundation §2 | Foundation §2; §8.6 |
| A12 | Jobs | Bespoke schedulers | Reuse `JOB-M04-ACCRUAL/CARRYFWD/AUTOREJECT/SANDWICH/LOP/SMART`, `JOB-M05-CLOSE/LOCK/LOP/ESCALATE`; register `JOB-G03-*` on the **X.1** runner (idempotent, retry ×3, per-tenant) | Foundation §4; Platform §X.1; §8.7 |
| A13 | Notifications | Generic `notifications` | **X.2** (IN_APP + EMAIL parallel; statutory mandatory/non-suppressible; ×5 retry + DLQ); `MSG-G03-*` templates; W.3 config | Platform §X.2; §11 |
| A14 | Migration | Undefined | **P06** ETL+V, 3 dry runs, waves, `migration_runs`, `gov_source_id` traceability | Platform §P06; §13 |
| A15 | SR posting | "M04-LSR → M12-SR" inside this module | Owned by separate **G04** (Leave→SR) writing **G12-SR**; G03 references via `sr_posting_status`, never writes the SR ledger | Recon §A/§D; §2.3 |
| A16 | Downstream module codes | M01/M04-LSR/M10/M11/M12/M13/M14 | **G01** (master), **G04** (SR integration), **G10** (payroll), **G11** (pension), **G12** (SR ledger), **G13** (documents/M11), **G14** (analytics/M16) | Recon §B |
| A17 | NFR baseline | 99.9% uptime, RPO ≤ 15 min | **99.5%/month, RPO < 1 h, RTO < 4 h**; p95 < 500 ms + WCAG 2.1 AA retained | Vision §2.9; Recon §C |
| A18 | DPDP consent | Local `biometric_consents` only | Linked to platform **`consent_records`** (immutable/superseded, P05); `VAL-CONSENT`; statutory retention floors | Platform §P05; §8.1; FR-21 |
| A19 | Devices | Local registration | Devices + IP-attendance restrictions registered in **P04** before use; credentials in `integration_credentials` | Platform §P04; FR-03 |
| A20 | Config | `module_config` flat | `module_config` on the platform **configuration cascade** (platform→tenant→entity→employee), effective-dated, no silent overwrite of lower overrides | Platform §0.3; FR-10/23 |
| A21 | New sections | — | Added **`## Alignment with PrimeSoft Platform`** + this **`## Amendments`** table | Recon §E; Platform §9.6 |

---

## Amendments (v3 → v3.1: cross-module remediation)

Surgical fixes from the R1–R5 integration reviews (authoritative decisions in `docs/review/REMEDIATION.md`). No v3 functional behaviour was removed; these align G03 to the G01-owned shared entities and the G03→G04 leave handoff so the modules converge.

| # | Area | v3.0 | v3.1 (remediated) | Authority |
|---|---|---|---|---|
| B1 | `employee_dependents` ownership | E29 re-declared the table with divergent fields/enum (`relation` `CHILD/SPOUSE/PARENT/OTHER`, `is_disabled`, `is_surviving`) marked "EXTEND/read-mirror; G03 owns interim" | E29 is **G01/M01-owned and referenced read-only — not redefined**; G03 consumes G01's canonical `relationship`/`dob`/`is_minor`/`is_differently_abled`/heir fields. No forked copy. | REMEDIATION D5; R2 F1 |
| B2 | Leave-specific dependent attribute | `is_surviving` carried on the forked E29 copy | Modelled as **G03 satellite E29a `dependent_leave_eligibility`** (1:1 FK → G01 `employee_dependents`), carrying only `is_surviving`; retired if G01 adopts it. | REMEDIATION D5; R2 F1 |
| B3 | G03→G04 leave handoff key | SR enqueue "idempotent by `application_id`"; no lineage key; no signed capture | G03 exposes the stable **`leave_spell_lineage_id`** (E16) on the signed (HMAC) approved-leave event consumed by **G04**; event shape `LEAVE_APPROVED/LEAVE_AMENDED/LEAVE_CANCELLED` + `event_sequence` dedupe matches G04 FR-01. | REMEDIATION D5/D2; R3 F3 |
| B4 | SR writer role | Integration row read "Digital SR (G04 → G12-SR)" with `application_id` idempotency | Stated explicitly: **G03 is NOT an SR writer** — it feeds **G04**, which posts leave events to the **G12** ledger; **G03 never calls `POST /api/v1/sr/ingest`**. | REMEDIATION D2 (writer matrix); R3 F3 |
| B5 | Shared-entity naming | Scoping dimension labelled bare `org_unit` (§3.4) | Normalised to **`org_units`** (plural) for consistency with the canonical entity; all G03 FK targets were already `org_units`. | REMEDIATION D5 |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Requirement → Entity → API → Platform traceability
| FR | Entities (extend/new) | Key APIs (`/api/v1/atl`) | Platform services | Depends on |
|---|---|---|---|---|
| FR-01 | shifts, rosters, processing_runs, feed_adjustments | /shifts, /rosters | P02, P05, X.1 | G01 |
| FR-02 | holiday_calendars, holidays, rh_elections | /holiday-calendars, /rh-elections | P02, P05 | G01 |
| FR-03 | attendance_punches, attendance_devices, biometric_consents, anomaly_reviews | /punches/* | P04, P05, `VAL-AT/CONSENT` | FR-01/02/20/21 |
| FR-04 | attendance_daily, day_allocations, processing_runs | /attendance/process | X.1 (`JOB-M05-CLOSE`), P05 | FR-01/02/03/07/08/12 |
| FR-05 | regularisation_requests, processing_runs, feed_adjustments | /regularisations | P01, X.1, P05 | FR-04, FR-17 |
| FR-06 | overtime_records, comp_off_ledger | /overtime | P01, P05 | FR-03/04, FR-09 |
| FR-07 | attendance_exceptions, processing_runs | /exceptions | P01, X.1 | FR-04 |
| FR-08 | attendance_exceptions, documents, processing_runs | /exceptions | P01, G13 | FR-04, FR-09 |
| FR-09 | comp_off_ledger | /comp-off/* | X.1, P05 | FR-06/08, FR-12 |
| FR-10 | leave_types, accrual_policies, entitlements | /leave-types, /leave-policies | P02, config cascade | G01 |
| FR-11 | leave_balance_ledger, leave_balances | /accrual/run, /leave-ledger | X.1 (`JOB-M04-ACCRUAL`), P01, P05 | FR-10 |
| FR-12 | leave_applications, application_days, reservations, ledger, entitlements, processing_runs | /leave-applications | **P01**, P02, X.1, G04 | FR-10/11/19/22/23, G04, G01 |
| FR-13 | leave_applications, reservations, ledger, feed_adjustments | /withdraw, /cancel | P01, G04 | FR-12, FR-04 |
| FR-14 | leave_applications, attendance_exceptions, module_config | /team-calendar | P01, P02 | FR-12, FR-07/08 |
| FR-15 | year_close_runs, ledger, balances | /year-close/* | X.1 (`JOB-M04-CARRYFWD`), P01 | FR-10/11 |
| FR-16 | encashment_requests, ledger, feed | /encashments | P01, X.3 → G10/G11 | FR-11, G10, G11 |
| FR-17 | payroll_attendance_feed, feed_adjustments, day_allocations | /payroll-feed/* | X.1 (`JOB-*-LOP/LOCK`), X.3 → G10 | FR-04/05/06/12/16 |
| FR-18 | notifications | /self-service/*, /approvals/inbox | X.2, P02 (workspace) | all FRs, FR-19 |
| FR-19 | approval_delegations, workflow_actions | /delegations | **P01 `delegate`** | FR-12; P01 |
| FR-20 | anomaly_reviews, attendance_punches | /anomalies | P01, P02 (SoD) | FR-03/04 |
| FR-21 | biometric_consents, attendance_devices, attendance_punches | /consents, /retention/purge-run | P05 `consent_records`, X.1 | FR-03, G13 |
| FR-22 | leave_entitlements, employee_dependents, ledger | /entitlements | P01, P02 | FR-10/12, G01 |
| FR-23 | module_config, leave_applications, balances, documents | /forecast, /mass-leave, /return-to-work | P01, P02, `VAL-HOLD` | FR-11/12/15, G13 |

### 14.2 Cross-module dependency register
| Dependency | Type | Direction | Risk / mitigation |
|---|---|---|---|
| **G01/M01** employee master + dependents | Hard | Inbound read | Golden source; cache + soft-delete guard; E29 dependents (interim G03-owned) |
| **G04** Leave→SR → **G12-SR** posting | Hard | Outbound async (X.3) | Retry/backoff; FAILED tracking + HR alert; G03 never writes SR |
| **G10** payroll feed | Hard | Outbound (X.3) | Period lock + next-period adjustments + ack handshake |
| **G11** retirement encashment | Medium | Bidirectional | EL+HPL make-up cap + settlement-on-ack |
| **G13/M11** documents | Medium | Outbound ref | Reference-only; access-controlled (certs, photos, consent) |
| **P01** workflow / **P02** authz / **P05** audit / **X.2** notifications | Hard | Internal | Consumed by id; SoD/version pinning by engine; degrade to IN_APP |
| **P04** device/credential registration | Hard | Internal | Devices/IP registered before M05 attendance activation |
| **P06** migration | One-off | Internal | 3 dry runs; reversible waves |

### 14.3 Parallel-agent build plan
| Track | FRs | Parallel with | Sequencing note |
|---|---|---|---|
| A: Config foundations (on M04/M05) | FR-01, FR-02, FR-10, module_config | B, D | Precede C, E |
| B: Attendance capture & governance | FR-03, FR-04, FR-20, FR-21 | A, D | FR-04 needs FR-01/02; FR-03 needs FR-21 consent + P04 devices |
| C: Leave core | FR-11, FR-12, FR-22 | D | Needs FR-10; R1/R2 resolved before parcelling |
| D: Exceptions & OT | FR-06, FR-07, FR-08, FR-09 | A, B | FR-09 needs FR-12 |
| E: Corrections | FR-05, FR-13 | — | Need FR-04 / FR-12 |
| F: Periodic & integration | FR-14, FR-15, FR-16, FR-17, FR-19 | — | Need core + capture; FR-17 needs G10; FR-19 needs P01 `delegate` |
| G: Self-service & best-in-class | FR-18, FR-23 | last | Integrates all (Me/My Team/Admin) |

### 14.4 Final Reconciliation Table (0 gaps — includes platform-grounding rows)
| Check | Status | Evidence |
|---|---|---|
| All 23 FRs have entities, APIs, LLD, platform-service map | RESOLVED | §6 (FR-01…FR-23); Alignment table |
| All 31 entities have field tables + tenancy + sample rows | RESOLVED | §5.2, §5.1.1, §5.7 |
| Soft-reserve real persistence (R1) | RESOLVED | E21, §5.6 r11, FR-12 |
| Concurrency control on balance debit (R1) | RESOLVED | E14 version, §5.6 r12, FR-11/12 |
| Sub-day allocation; status rollup (R2) | RESOLVED | E22, FR-04, FR-17 |
| Accrual rounding/proration + year-basis (R3) | RESOLVED | E12/E13, FR-11, App. C |
| Commuted 2:1 (R4) | RESOLVED | E12, FR-10/12, `VAL-G03-COMMUTED` |
| Retirement EL+HPL make-up (R5) | RESOLVED | FR-16, `VAL-G03-RETIRE-ENCASH` |
| Locked-period adjustment, not overwrite (R6) | RESOLVED | E23, FR-01/02/05/13/17, `JOB-M05-LOCK` |
| Sanction entitlement counters (R7,R14) | RESOLVED | E24, E29, FR-22 |
| Dangling entities added (R8) | RESOLVED | E25/E26/E27 |
| Approver delegation (R11) | RESOLVED | E28, FR-19, P01 `delegate` |
| DPDP consent + retention (R9) | RESOLVED | E30, FR-21, P05 `consent_records`, App. E |
| Anti-fraud anomaly detection (R10) | RESOLVED | E31, FR-20 |
| LTC fully specified (R12) | RESOLVED | FR-16, `VAL-G03-LTC` |
| Sandwich rule per type (R13) | RESOLVED | E12, FR-12, `JOB-M04-SANDWICH` |
| FR-04 sole writer (R15) | RESOLVED | FR-04/05/07/08/12 LLD |
| Punch→date derivation (R16) | RESOLVED | E1, FR-03/04, App. B |
| Comp-off SSOT (R17) | RESOLVED | FR-09, E11 |
| SUM(day_units)=total_days (R18) | RESOLVED | §5.6 r19, `VAL-G03-DAYUNITS` |
| Advance clawback + LWP suspend (R19) | RESOLVED | FR-11/16, §5.6 r20 |
| End-to-end worked example (re-grounded) | RESOLVED | §5.8 |
| Best-in-class features (R25) | RESOLVED | FR-23, E27 |
| **— Platform-grounding rows —** | | |
| Module re-keyed to G03; ids `*-G03-*` | RESOLVED | §0, A1; §8.6/§8.7 |
| EXTEND/REUSE of PrimeSoft M04/M05 (no parallel fork) | RESOLVED | §5.0, §5.1 (EXTEND markers), A2 |
| `tenant_id`/`entity_id` on every entity; data-layer scoping | RESOLVED | §5.1.1, A3 |
| Approvals on P01 (`workflow_actions`, not workflow_tasks) | RESOLVED | §10, FR-05/12/19, A4 |
| Authz/masking via P02; SoD by engine | RESOLVED | §3, §5.6 r10, A5 |
| Roles mapped to RBAC v1.7 + gov additions | RESOLVED | §3.1, A6 |
| Audit via P05 dual log (DB-trigger); no local audit_log | RESOLVED | §2.2, §9, A8 |
| Platform API conventions + envelope + 8-code table | RESOLVED | §8.1–8.4, A9/A10 |
| `VAL-*` reused; `VAL-G03-*` registered | RESOLVED | §8.6, A11 |
| Jobs reuse `JOB-M04/M05-*`; `JOB-G03-*` registered (X.1) | RESOLVED | §8.7, A12 |
| Notifications via X.2; statutory mandatory; `MSG-G03-*` | RESOLVED | §11, A13 |
| Migration via P06 (3 dry runs, `gov_source_id`) | RESOLVED | §13, A14 |
| SR posting delegated to G04 → G12-SR (referenced, not duplicated) | RESOLVED | §2.3, §8.9, A15 |
| Downstream re-keyed (G01/G04/G10/G11/G12/G13/G14) | RESOLVED | §2.3, A16 |
| Platform NFR baseline (99.5%, RPO<1h) | RESOLVED | §9, A17 |
| DPDP consent linked to P05 `consent_records`; devices in P04 | RESOLVED | FR-21, FR-03, A18/A19 |
| Config on platform cascade (effective-dated) | RESOLVED | E27, FR-10, A20 |
| Alignment + Amendments sections present | RESOLVED | `## Alignment`, `## Amendments`, A21 |
| **Unresolved gaps** | **0** | All v2 R1–R19 + improvements 1–25 preserved; all platform re-grounding A1–A21 applied |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Accrual | Periodic crediting of leave per policy, with defined rounding/proration (`JOB-M04-ACCRUAL`). |
| Allocation (sub-day) | A fractional portion of a day assigned a status; allocations for a day sum ≤ 1.0. |
| Carry-forward | Balance carried into the next leave year, subject to cap (`JOB-M04-CARRYFWD`). |
| Comp-off | Compensatory leave for OT/holiday work; balance held solely in `comp_off_ledger`. |
| Commuted Leave | HPL converted to full-pay (medical) leave; 1 day debits 2 HPL (`debit_ratio` 2.0 → HPL). |
| Consent (DPDP) | Recorded lawful basis/consent for biometric/geo capture (P05 `consent_records`); withdrawable, with fallback. |
| Delegation | Temporary reassignment of approval authority (P01 `delegate`). |
| Earned Leave (EL) | Accruable, encashable privilege leave. |
| Entitlement counter | Career/event quota + eligibility predicate governing sanction-based leave (gov-specific). |
| Half-Pay Leave (HPL) | Leave paid at half salary; encashable only at retirement (make-up). |
| Encashment | Conversion of unused leave to money (in-service, LTC, retirement). |
| EXTEND/REUSE | G03 builds on existing PrimeSoft M04 Leave + M05 Attendance rather than forking new tables. |
| Leave Ledger | Append-only immutable record of all balance changes (single source of truth; +P05 trigger). |
| Leave-year basis | Year axis for a type: CALENDAR/FINANCIAL/CAREER/EVENT. |
| Locked period | A payroll feed period closed after export (`JOB-M05-LOCK`); corrected only via next-period adjustments. |
| LTC | Leave Travel Concession: EL encashment 10 days/4-yr block, ≤ 60 over career. |
| LWP | Leave Without Pay — unpaid absence affecting pay and service. |
| P01–P06 | Platform engines: Workflow, RBAC/Authz, Chat, Tenant/Org Admin, Audit, Migration. |
| Reservation (soft-reserve) | A persisted balance hold (`leave_reservations`) on submit; netted into available. |
| Sandwich rule | Per-type treatment of holidays/weekly-offs within leave (`JOB-M04-SANDWICH`). |
| SR / Digital SR | Statutory Digital Service Register (**G12-SR**, posted via **G04**); G03 references only. |
| Workspace | Me / My Team / Admin surface derived from RBAC holdings (P02). |
| X.1–X.3 / W.1–W.3 | Platform infra: Jobs runner, Notifications, Integration; Process-flow, Form, Notification-config models. |

## 16. Appendices

### Appendix A — Public-sector leave catalog defaults (extensions to M04 `leave_types`; editable per policy)
| Code | Name | Category | Accrual | Sanction | Debit (→pot) | Year basis | In-svc encash | Retire encash | Notes |
|---|---|---|---|---|---|---|---|---|---|
| CL | Casual Leave | PAID | 12/yr | No | 1.0 | CALENDAR | No | No | No CF; ≤ continuous cap |
| EL | Earned Leave | PAID | 15/half-yr | No | 1.0 | CALENDAR | Yes (incl. LTC) | Yes (≤300) | CF cap 300 |
| HPL | Half-Pay Leave | HALF_PAY | 10/half-yr | No | 1.0 | CALENDAR | No | Yes (make-up to 300) | Affects pay (half) |
| COMMUTED | Commuted Leave | PAID | from HPL | No | 2.0 (→HPL) | CALENDAR | No | No | 2 HPL : 1 commuted; medical doc |
| MAT | Maternity | SPECIAL | event | Yes | 1.0 | EVENT | No | No | ≤180 days; FEMALE; ≤2 surviving children |
| PAT | Paternity | SPECIAL | event | Yes | 1.0 | EVENT | No | No | ≤15 days; MALE |
| CCL | Child-Care Leave | SPECIAL | career quota | Yes | 1.0 | CAREER | No | No | FEMALE; 730-day career; child ≤18 (22 if disabled) |
| STUDY | Study Leave | SPECIAL | sanction | Yes | 1.0 | CAREER | No | No | Authority sanction |
| MED | Medical Leave | PAID/HPL | per rule | No | 1.0 | CALENDAR | No | per rule | Certificate + return-to-work |
| SAB | Sabbatical | SPECIAL | sanction | Yes | 1.0 | CAREER | No | No | Authority sanction |
| LWP | Leave Without Pay | UNPAID | n/a | Yes | 1.0 | EVENT | No | No | Affects pay & service; suspends accrual |
| COMPOFF | Compensatory Off | PAID | earned | No | n/a (comp_off_ledger) | n/a | No | No | 90-day expiry, FIFO; no leave_balances row |

### Appendix B — Attendance status precedence, weekly-off legend & date derivation
- **Rollup precedence:** `ON_LEAVE` > `HOLIDAY` > `WEEKLY_OFF` > `WFH`/`ON_DUTY` > punch-derived. `attendance_daily.status` = highest-precedence allocation; `present_units` = Σ present-counting fractions (R2).
- **Weekly-off legend:** `SUN`=Sunday; `SAT2`=2nd Saturday; `SAT4`=4th Saturday (nth Saturday, not date-of-month).
- **Punch→attendance_date (R16):** shift `date_anchor_rule` governs. `PUNCH_LOCAL_DATE` = local date in `display_timezone`; `SHIFT_START_LOCAL_DATE` = the local date the night shift started. **DST assumption:** IST has no DST; multi-TZ deployments revisit bucketing (explicit, revisitable).

### Appendix C — Key configurable parameters (in `module_config`, scoped & effective-dated via platform cascade)
| Parameter (config_key) | Default | Notes |
|---|---|---|
| REGULARISATION_WINDOW_DAYS | 15 | |
| REGULARISATION_LIMIT | 3 / month | |
| BACKDATE_WINDOW_DAYS | 30 | |
| COMPOFF_VALIDITY_DAYS | 90 | |
| RH_CAP | 2 | overrides calendar default |
| CONFLICT_THRESHOLD_PCT | 30% | team concurrent-absence advisory |
| EL_CF_CAP_DAYS | 300 | |
| EL_RETIREMENT_ENCASH_CAP_DAYS | 300 | combined EL+HPL make-up (R5) |
| LTC_BLOCK_DAYS / LTC_CAREER_CAP_DAYS | 10 / 60 | LTC (R12) |
| CLOCK_SKEW_MIN | ±5 | |
| RESERVATION_TTL_MIN | 4320 (72h) | auto-release (R1) |
| IMPOSSIBLE_TRAVEL_KMH | 900 | anomaly (R10) |
| LIVENESS_MIN_SCORE | 0.80 | anomaly (R10) |
| ACCRUAL_ROUNDING_MODE | NEAREST_HALF_CARRY | per-policy override (R3) |
| BLACKOUT_PERIOD | (none) | structured `{from,to,leaveTypes,scope}` (`VAL-HOLD`) |

**Worked proration + rounding example (R3):** Employee joins 2026-04-16 under EL `HALF_YEARLY` 15-day Jan–Jun cycle, `proration_method=DAYS_IN_SERVICE_OVER_CYCLE`, `rounding_mode=NEAREST_HALF_CARRY`. Days in service Apr-16→Jun-30 = 76/181. Raw = 15 × 76/181 = 6.30; rounded to nearest 0.5 = 6.5; remainder (−0.20) carried to next cycle. Ledger posts `ACCRUAL +6.5`.

### Appendix D — Referenced modules (government codes)
**G01** Employee master (PrimeSoft M01), **G04** Leave→Digital SR, **G10** Payroll (extends M06/M07), **G11** Pension, **G12** Digital Service Register ledger, **G13** Documents (PrimeSoft M11), **G14** Analytics (PrimeSoft M16); platform engines **P01–P06**, **X.1–X.3**, **W.1–W.3**.

### Appendix E — DPDP Data Retention & Purge Schedule (R9; honoured by `JOB-G03-RETENTION-PURGE`)
| Data class | Retention | Purge mechanism | Lawful basis |
|---|---|---|---|
| Biometric templates | Active employment + 0 days post-exit | Device/server template wipe on exit | Statutory duty / consent |
| Geo-location of punches | 180 days rolling | Anonymise lat/long after 180 days; keep punch fact | Purpose-bound (attendance) |
| Punch photos (liveness) | 90 days (or until anomaly case closed) | Delete from G13 after window | Anti-fraud |
| Raw punches | 3 years (statutory audit) | Archive then purge | Statutory audit |
| Attendance daily/allocations | 8 years | Archive | Service record support |
| Leave applications & ledger | Permanent / per SR statutory schedule | Retained (immutable) | Statutory service record |
| Consent records | Employment + 8 years | Archive (P05) | Accountability |
| Anomaly review records | 8 years | Archive | Audit/fraud |

Purge runs honour legal holds (`PURGE_BLOCKED_LEGAL_HOLD`), are logged to **P05**, and never delete below the statutory floor; the DPO signs off the schedule at launch and annually. Retention floors override any erasure request for statutory data (Platform §P05; Vision §2.7).

---

*End of G03 v3.0 (platform-grounded). Preserves all v2.0 functional content (FR-01…FR-23, E1…E31, 22 integrity rules, state tables, worked example, appendices) re-anchored onto PrimeSoft M04 Leave + M05 Attendance and platform engines P01–P06 / X.1–X.3 / W.1–W.3 per `PLATFORM_FOUNDATION.md` and `MODULE_RECONCILIATION.md`.*












