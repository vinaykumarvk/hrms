# G03 Reconciliation — PrimeSoft PROTOTYPE screens vs schema

**Owned schema:** `docs/data-model/03-G03-attendance-leave.sql`
**Ground truth:** `docs/data-model/reconciliation/prototype-extract/*.txt` (leave & attendance screens)
**Companion pass:** `docs/data-model/reconciliation/g03-leave-attendance.md` (CSV/vendor-config pass — already added
`attendance_policies`, `overtime_policies`, `attendance_networks`, `geofences` and many leave/shift/holiday columns).
**Date:** 2026-07-01

## Method & the data-vs-config rule

The prototype extracts are UI field/label dumps from the PrimeSoft M04/M05 screens. As in the CSV pass, a label was
promoted to a real schema column/table only when it is a **genuine, queryable DATA attribute** (a leave-application
field, an OT-request field, a revocation/adjustment request, a holiday attribute, a device modality, a physical fence
address). Screen-level **module behaviour toggles** (`leave-config`, `attendance-config`, request-window / display /
auto-route switches) are POLICY/UI CONFIG and route to the existing `module_config` table or per-policy `*_config jsonb`
columns — they are NOT first-class columns. Manager/team roll-up screens (`team-leave`, `team-attendance`,
`office-attendance`) are **derived reads** of existing tables and add no storage.

One judgement differs from the CSV pass: `leave-reasons` and `attendance-reasons` are shown in the prototype as
**dedicated admin CRUD masters** with structured attributes (code, category, doc-required, auto-route, auto-approve
threshold, frequency cap, applicable scope, effective-from, status). Per CONVENTIONS §4 a tenant-configurable value set
with those attributes is a **master table**, not a free-text + config allowed-list. The CSV pass deferred them ("no FK
consumers"); the prototype supplies the missing structure, so they are **promoted to tables this pass**.

Status: **PRESENT** already modelled · **PARTIAL** partly modelled / needed a column · **MISSING** no home before this pass.

---

## Gap table (field-group granularity by screen)

| Prototype field / column (screen) | maps to G03 table.column | Status | Decision |
|---|---|---|---|
| Leave type / From / To / Full day (apply-leave) | leave_applications.leave_type_id / start_date / end_date | PRESENT | already-present |
| Half day · first/second-half session (apply-leave) | leave_application_days.day_portion (FIRST_HALF/SECOND_HALF) | PRESENT | already-present |
| Reason / Days requested (apply-leave) | leave_applications.reason / total_days | PRESENT | already-present |
| Attachment (apply-leave) | leave_applications.supporting_document_id | PRESENT | already-present |
| Hourly leave · Hours (apply-leave, FR-M04-017) | leave_types.is_hourly_leave (present) BUT application had no hours field | PARTIAL | **add-col** leave_applications.hourly_minutes |
| Message to approver / "Optional context for your manager" (apply-leave) | leave_applications — no distinct note column (only reason) | MISSING | **add-col** leave_applications.approver_note |
| Balance debited from / Balance after / Application impact (apply-leave) | derived from leave_ledger_entries / leave_balances | PRESENT | already-present (derived) |
| Approval flow / HRBP-HR-Admin routing (apply-leave) | workflow_instances (P01) | PRESENT | already-present (engine) |
| Applied / Approver / Days / From–To / Status / Type (my-leave) | leave_applications.* | PRESENT | already-present |
| Cancelled / Cancelled by / Revoke (my-leave) | leave_applications.status + leave_revocations (new) | PARTIAL | see leave-revocation |
| Combined / Pooled balance · Contribution to pool · Usable now · Cap per cycle (my-leave) | leave_balances (no leave-pool feature modelled) | PARTIAL | note-as-config (thin evidence; leave-pool deferred) |
| Employee / Leave type / Current balance / Requested adjustment (leave-balance-adjust) | leave_ledger_entries posts the result; no request entity | PARTIAL | **add-table** leave_balance_adjustments |
| Adjustment type Credit/Debit/Reset · amount · reason category · detailed reason · supporting reference · effective date (leave-balance-adjust, FR-M04-021) | leave_balance_adjustments.* (new) | MISSING | **add-table** |
| Pending adjustment requests / Review / Apply adjustment (leave-balance-adjust) | leave_balance_adjustments.status + workflow_instance_id | MISSING | **add-table** (covered) |
| Leave code / Display name / Entitlement / Accrual freq & amount / Carry-fwd cap / Encashable on exit / gender (leave-policies) | leave_types.* + leave_accrual_policies.* | PRESENT | already-present |
| Min application unit (Full/Half/Hour) (leave-policies) | leave_types.allow_half_day + is_hourly_leave | PRESENT | already-present (derivable) |
| Youngest-child gating / tenure ("After 5 years") (leave-policies) | leave_entitlements.eligibility_predicate + leave_type_config | PARTIAL | note-as-config |
| Leave year basis / advance window / back-dated window / auto-credit / negative balance / auto-reject / Stage-2 route (leave-config) | module_config (config_key/value) | MISSING(as cols) | note-as-config |
| Reason code / name / category / description / applicable leave types / doc required / HRBP auto-route / auto-approve threshold / effective from / status (leave-reasons, FR-M04-003) | leave_reasons.* (new master) | MISSING | **add-table** leave_reasons |
| Revocation type / Days to revoke / reason category / detailed reason / Refund to balance / Initiated by (leave-revocation, FR-M04-005) | leave_revocations.* (new) | MISSING | **add-table** leave_revocations |
| Pending revocations / Approve / Deny (leave-revocation) | leave_revocations.status + workflow_instance_id | MISSING | **add-table** (covered) |
| Holiday calendar / Select holiday / Message to approver (apply-optional-holiday, FR-M04-006) | rh_elections (holiday_id + calendar_id + status) | PRESENT | already-present |
| Holiday name / Date / Day / Type / Locations (holiday-calendar) | holidays.name/holiday_date/day_name/holiday_type + calendar location scope | PRESENT | already-present (day_name added prior pass) |
| Category National/Regional/Religious/Company-specific (holiday-calendar-config) | holidays — no category dimension (type is GAZETTED/RESTRICTED/…) | MISSING | **add-col** holidays.holiday_category |
| Notes / description (holiday-calendar-config) | holidays — no description | MISSING | **add-col** holidays.description |
| Applies-to-locations (per holiday) (holiday-calendar-config) | holiday_calendars.location_scope_id (calendar-scoped) | PARTIAL | note-as-config (calendar scope; multi-loc via config) |
| Year / FY25-27 / Import from previous year / Publish (holiday-admin, holiday-calendar-config) | holiday_calendars.year/status + holidays.repeat_next_year | PRESENT | already-present |
| PL encashment / Approve / Reject / Awaiting HR Admin (pl-encashment) | leave_encashment_requests.* | PRESENT | already-present |
| Employee / Type / Worked on / Credit / Credit request / Approve (compoff-approvals) | overtime_records (COMP_OFF) + comp_off_ledger (EARN) + workflow | PRESENT | already-present |
| Worked date / Worked hours / Reason / Comments (request-ot, FR-M05-008) | overtime_records.attendance_date/ot_minutes — no reason/comments | PARTIAL | **add-col** overtime_records.reason |
| Worked on holiday / Worked on weekly off (request-ot) | overtime_records — no such flags | MISSING | **add-col** overtime_records.worked_on_holiday / worked_on_weekly_off |
| Request comp-off (treatment) (request-ot) | overtime_records.ot_treatment (PAID/COMP_OFF) | PRESENT | already-present |
| Date / Punch in / Punch out / Shift / Status / Work duration / Late (attendance) | attendance_daily.* / rosters.shift_id | PRESENT | already-present |
| Work location Office/Home/WFH (attendance) | attendance_daily.status (WFH) | PRESENT | already-present (status) |
| Shift code / name / start / end / break / timezone / thresholds / NSD (attendance-shifts) | shifts.* | PRESENT | already-present |
| Shift type Fixed/Flexible/Rotational (attendance-shifts, FR-M05-003) | shifts — no shift_type | MISSING | **add-col** shifts.shift_type |
| Rotation No/Weekly/auto-cycle · Roster size (attendance-shifts) | rosters.weekly_off_pattern + shift_config | PARTIAL | note-as-config |
| Applicable for (All / Contractors) · shift-change requests (attendance-shifts) | shifts.org_unit_scope_id + module_config | PARTIAL | note-as-config |
| Reason code / name / category / description / doc required / auto-approve threshold / frequency cap / applicable to / status (attendance-reasons, FR-M05-005) | attendance_reasons.* (new master) | MISSING | **add-table** attendance_reasons |
| Policy name / grace / back-dated edit / absconding / optional-holiday limit / WFH-checkin / NSD (attendance-policies) | attendance_policies.* (CSV pass) | PRESENT | already-present |
| WFH cap per month (attendance-policies, FR-M05-002) | attendance_policies — no wfh cap col | MISSING | **add-col** attendance_policies.wfh_cap_per_month |
| Working days/week · Daily hours required (attendance-policies) | attendance_policies — no such cols | MISSING | **add-col** working_days_per_week / daily_required_minutes |
| Leave deduction on absence (deduct-from / half / full / LOP) · request config · display suppression (attendance-policies) | attendance_policies.policy_config jsonb | PARTIAL | note-as-config |
| Month / Locked by / Locked on / Payroll status / Pending at lock / Employee-days / Lock note / Resolution mode / Lock deadline / Auto-trigger payroll (attendance-lock, FR-M05-007) | no lock-cycle entity (per-employee is_locked only on payroll feed) | MISSING | **add-table** attendance_lock_periods |
| Grace / half-day threshold / geofencing on / selfie / capture method / lock day / regularisation window (attendance-config) | module_config | MISSING(as cols) | note-as-config |
| Regularisation queue (Employee/Date/Type/Reason/Manager status) (attendance-config) | regularisation_requests.* / attendance_exceptions.* | PRESENT | already-present |
| Date / Type / Punch in-out / Reason / Comments (request-regularisation, FR-M05-007) | regularisation_requests.requested_status / proposed_first_in / proposed_last_out / reason | PRESENT | already-present |
| Out-duty / At Client Location (request-regularisation) | attendance_exceptions.location_text (ON_DUTY/TOUR) | PRESENT | already-present |
| Check-in / Date·time / Location / WFH / Approve (checkin-approvals) | attendance_exceptions (WFH) + workflow_instances | PRESENT | already-present |
| Site name / Radius / Lat / Long / Tag (geofencing) | geofences.* (CSV pass) | PRESENT | already-present |
| Address (full street) (geofencing, FR-M05-004) | geofences — no address | MISSING | **add-col** geofences.address |
| Office capacity / Max employees (geofencing) | geofences — no capacity | MISSING | **add-col** geofences.max_employees |
| Active employees (geofencing) | derived count | PRESENT | already-present (derived) |
| Off-site client-visit geofence request (Employee/Date/Type/Reason/Site) (geofencing) | attendance_exceptions (ON_DUTY/TOUR) | PRESENT | already-present |
| Device code / Location / Last sync / Status (biometric-mgmt) | attendance_devices.device_code/location_org_unit_id/last_seen_at/status | PRESENT | already-present |
| Type Finger / Face (biometric-mgmt, FR-M05-006) | attendance_devices.device_type is BIOMETRIC/RFID/… — no modality | MISSING | **add-col** attendance_devices.biometric_modality |
| Floor / Capacity / Occupancy / Present / Peak hour / Visitors (office-attendance) | derived from attendance_daily + facilities; not G03 storage | PARTIAL | note (derived / out-of-module) |
| Team leave overview / On leave this week / PL across team (team-leave) | derived read of leave_applications / leave_balances | PRESENT | already-present (derived) |
| Team attendance / Late MTD / Punch in-out / Today (team-attendance) | derived read of attendance_daily | PRESENT | already-present (derived) |

---

## Counts (field-group granularity)

| Status | Count |
|---|---|
| **PRESENT** (already modelled, incl. derived) | 29 |
| **PARTIAL** (partly modelled / needed a column or config split) | 9 |
| **MISSING** (no home before this prototype pass) | 15 |

The MISSING/PARTIAL items resolve to **5 new DATA tables**, **13 new DATA columns**, and the remaining
behaviour/display switches routed to `module_config` / `*_config jsonb` (note-as-config).

## Schema changes applied (03-G03-attendance-leave.sql, SECTION 13c, ADD-ONLY)

**5 new tables:** `leave_reasons`, `attendance_reasons` (tenant-configurable reason masters, CONVENTIONS §4),
`leave_balance_adjustments` (FR-M04-021 adjustment request → ledger), `leave_revocations` (FR-M04-005 post-approval
revocation), `attendance_lock_periods` (FR-M05-007 monthly lock cycle). Each: RLS + indexes + 2-3 sample rows.

**8 new enums:** `g03_shift_type`, `g03_leave_adjustment_type`, `g03_adjustment_status`, `g03_revocation_type`,
`g03_lock_resolution_mode`, `g03_lock_status`, `g03_biometric_modality`, `g03_holiday_category`.

**13 new DATA columns on existing tables:**
- `leave_applications`: approver_note, hourly_minutes (2)
- `overtime_records`: reason, worked_on_holiday, worked_on_weekly_off (3)
- `shifts`: shift_type (1)
- `holidays`: holiday_category, description (2)
- `geofences`: address, max_employees (2)
- `attendance_devices`: biometric_modality (1)
- `attendance_policies`: wfh_cap_per_month, working_days_per_week, daily_required_minutes (3)

**Validation:** `00-platform-core.sql` + amended `03-G03` load clean into a throwaway PostgreSQL 14 DB
(`psql -v ON_ERROR_STOP=1`). No existing content changed; every change is additive.
</content>
</invoke>
