# G03 Reconciliation — Leaves + Attendance CSV exports vs schema

**Owned schema:** `docs/data-model/03-G03-attendance-leave.sql`
**Ground truth:** `docs/HRMS Deliverables to Development Phase/DwnB Form Fields/{Leaves,Attendance}/*.csv`
**Date:** 2026-07-01

## Method & the config-vs-data rule

The CSVs are **PrimeSoft vendor config exports** (the M04/M05 origin product). A single
`Leaves_Policy_Export.csv` row carries **~230 columns**; `Attendance_Policy_Export.csv` carries
**~260**; `Tenant_Leaves_Compoff_Export.csv` (the OT/comp-off policy) carries **~280**. The vast
majority are **policy CONFIGURATION toggles** (hide/display flags, request-window rules, pro-rata /
clubbing / prefix-suffix / block-leave / future-cycle sub-rules, per-frequency OT approval routing).
These are **not DATA attributes** the schema should carry as first-class columns — they are
tenant-tunable behaviour that already has a home:

- **`module_config`** (E27, effective-dated `config_key`/`config_value` jsonb) — tenant/scope-wide switches.
- New per-policy **`*_config jsonb`** columns (`policy_config`, `leave_type_config`, `accrual_config`,
  `shift_config`, `recurrence_config`) — the long tail bound to one policy row.

A column was **promoted to a real schema column** only when it is a genuine, queryable DATA attribute
(hourly-leave mechanics, max-per-year/month caps, grace/buffer/absconding windows, OT thresholds/slabs,
geofence coordinates, IP ranges, holiday recurrence). Everything else is explicitly **noted as W-config**.

Status legend: **PRESENT** already in schema · **PARTIAL** partly modelled / needs a column ·
**MISSING** no home before this recon. Decision: **already-present** · **add-column** ·
**add-table** · **note-as-W-config**.

---

## LEAVES

### Leaves_Policy_Export.csv (leave master; ~230 cols) → `leave_types` (+ `leave_accrual_policies`)

| CSV column (representative) | maps to G03 | Status | Decision |
|---|---|---|---|
| Leave Type / Leave Code / Status | leave_types.name / leave_code / status | PRESENT | already-present |
| Description | (leave_types.name only) | PARTIAL | note-as-W-config (leave_type_config) |
| Is Hourly Leave? | leave_types.is_hourly_leave | MISSING | **add-column** |
| No of Hours in a Day | leave_types.hours_per_day | MISSING | **add-column** |
| Min Leave Duration in One Application in Minutes | leave_types.hourly_min_minutes | MISSING | **add-column** |
| Allow Hourly Leave Only In Multiples Of (Minutes) | leave_types.hourly_multiple_minutes | MISSING | **add-column** |
| Allow Hourly Leave Across Midnight | leave_types.allow_hourly_across_midnight | MISSING | **add-column** |
| Maximum Leave Allowed Per Year | leave_types.max_days_per_year | MISSING | **add-column** |
| Maximum Leave that can be availed per year | leave_types.max_availed_per_year | MISSING | **add-column** |
| Maximum Leave Allowed Per Month | leave_types.max_days_per_month | MISSING | **add-column** |
| Minimum Advance Notice for Leave Application in Days | leave_types.min_advance_notice_days | MISSING | **add-column** |
| Maximum Number Of Future Days Leave Is Allowed For | leave_types.max_future_apply_days | MISSING | **add-column** |
| Allow half-day | leave_types.allow_half_day | MISSING | **add-column** |
| Attachment Mandatory if Leave is for more than (X) days | leave_types.attachment_mandatory_beyond_days | MISSING | **add-column** |
| Is this a Special Leave | leave_types.is_special_leave | MISSING | **add-column** |
| Leave With Unlimited Balance | leave_types.has_unlimited_balance | MISSING | **add-column** |
| Gender Applicability | leave_types.gender_eligibility | PRESENT | already-present |
| Attachment Mandatory | leave_types.requires_document | PRESENT | already-present |
| Leave Cycle / Cycle Start Month / Custom Month | leave_types.year_basis | PARTIAL | note-as-W-config (leave_type_config) |
| Rounding Type | leave_accrual_policies.rounding_mode | PRESENT | already-present |
| Carry forward unused Leave (+ CF Amount/Type/Remaining) | leave_accrual_policies.carry_forward_* | PRESENT | already-present |
| Credit on accrual basis — Accrual time frame / point / day | leave_accrual_policies.accrual_frequency + accrual_config | PARTIAL | **add-column** (accrual_config jsonb) |
| Leave Accrual Based On Working Days / Hours (+ sub-rules) | leave_accrual_policies.accrual_config | MISSING | note-as-W-config (accrual_config) |
| Define Custom Accrual (+ pattern/months) | leave_accrual_policies.accrual_config | MISSING | note-as-W-config (accrual_config) |
| Credit on Pro-Rata basis (+ ~15 sub-rules) | leave_type_config | MISSING | note-as-W-config |
| Count intervening Holidays/Weekly Offs as Leave | leave_types.sandwich_rule | PARTIAL | already-present (+ config detail) |
| Prefix/Suffix Holiday & Weekly-Off policy (4 flags) | leave_type_config | MISSING | note-as-W-config |
| Clubbing (Can club / Clubbing Type / Leave List) | leave_type_config | MISSING | note-as-W-config |
| Overutilization / negative-balance rules (~8 cols) | leave_type_config | MISSING | note-as-W-config |
| Encash Leave while F&F / intermittent encashment (~15) | leave_accrual_policies.encashment_cap_days + config | PARTIAL | already-present (caps) + note-as-W-config |
| Probation-period visibility/apply (~8 flags) | leave_type_config | MISSING | note-as-W-config |
| Block Leave / Future Cycle / Decision Matrix (~25) | leave_type_config | MISSING | note-as-W-config |
| Approval Flow / Exceptional Flow / trigger days | workflow_instances (P01) + leave_type_config | PRESENT | already-present (engine) |
| Show ... / Hide ... / Display ... (display toggles) | leave_type_config | MISSING | note-as-W-config |

### Unpaid_Leave_Export.csv (~45 cols) → `leave_types` (category=UNPAID)

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Name / Code / Status / Is Default | leave_types.name/leave_code/status | PRESENT | already-present |
| Is Hourly Leave (+ hours/multiples/min) | leave_types.is_hourly_leave / hours_per_day / … | MISSING | **add-column** (shared with above) |
| Maximum Leave Allowed Per Period / Reset Frequency | leave_types.max_days_per_month + leave_type_config | PARTIAL | already-present + note-as-W-config |
| Allow past dated Leave (+ max days) | leave_type_config | MISSING | note-as-W-config |
| Allow Application Only After Paid Leave Exhausted / Paid Leave List | leave_type_config | MISSING | note-as-W-config |
| Attachment Mandatory (+ beyond X days) | leave_types.requires_document / attachment_mandatory_beyond_days | PRESENT | already-present |
| Restriction Condition / Applicable For | leave_types.applicable_cadre_ids + config | PARTIAL | already-present |

### Leaves_Settings_Export.csv (~150 tenant switches) → `module_config`

All columns (Allow Leave For Previous Year, Sandwich cron, escalation SLA, display toggles,
combined-balance, blackout policy, etc.) are **tenant-wide behaviour**, not per-employee data.
**Status: MISSING as columns / PRESENT as config. Decision: note-as-W-config** → `module_config`
`config_key`/`config_value` rows. No schema column added.

### Leave_Reasons_1_.csv → `attendance_reasons`-equivalent

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Reason / Reason Code / Description / Status / Reason Type | (no dedicated leave_reasons table) | PARTIAL | note-as-W-config |

Leave reasons are a small tenant-configurable value set. Per CONVENTIONS §4 they are a
**master value set**; modelled today as free-text `leave_applications.reason` + `module_config`
allowed-reasons list. Not promoted to a table this pass (low volume, no FK consumers). **Noted.**

### all-Holiday-Export.csv → `holidays` (+ `holiday_calendars`)

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Holiday Name / Holiday Date | holidays.name / holiday_date | PRESENT | already-present |
| Holiday Code | (uses uuid id + calendar scope) | PRESENT | already-present |
| Day Name | holidays.day_name | MISSING | **add-column** |
| Repeat Next Year | holidays.repeat_next_year | MISSING | **add-column** |
| Holiday Type Mandatory(0)/Optional(1)/National(2) | holidays.holiday_type + is_national | PARTIAL | **add-column** (is_national) |
| Recurring Static date(0)/Day of Month(1) | holidays.recurrence_type | MISSING | **add-column** |
| Occurrence / Static Month / Static Date / Month / Day | holidays.recurrence_config | MISSING | **add-column** (recurrence_config jsonb) |
| Assigned location / Work Area Code | holidays via calendar.location_scope_id | PRESENT | already-present |
| Assignments / Additional Configurations | recurrence_config / module_config | PARTIAL | note-as-W-config |

### Leave-Policy-* variants (Block-Leave, Custom-QA, Date-Specific, Multiple-Allotment, Tenure)

All are **sub-configuration blocks of a leave policy** keyed by Leave Code (date-specific event
dates, tenure brackets, per-year allotment caps, custom QA questions, block-leave frequency).
**Status: MISSING as columns. Decision: note-as-W-config** → `leave_types.leave_type_config` jsonb
(and `leave_accrual_policies.accrual_config` for tenure/allotment). Date-Specific holiday dates that
represent real gazetted dates already flow through `holidays`. No new columns.

### Approvalflows-Export.csv → P01 workflow engine

Approval levels / exception levels / revoke permissions / skip-if-no-approver map to the
**P01 `workflows`/`workflow_instances`** engine (CONVENTIONS §8). **PRESENT. already-present.**

---

## ATTENDANCE

### Attendance_Policy_Export.csv (~260 cols) → NEW `attendance_policies`

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Policy Name / Policy Code / Description | attendance_policies.name/policy_code/description | MISSING | **add-table** |
| Grace time for Clockin (mins) | attendance_policies.grace_in_minutes | MISSING | **add-table col** |
| Grace time for Last Punch (mins) | attendance_policies.grace_out_minutes | MISSING | **add-table col** |
| Include Grace Time In Late By / Early Out | include_grace_in_late / include_grace_in_early_out | MISSING | **add-table col** |
| Allow Check In from WFH / Out Duty | allow_wfh_checkin / allow_outduty_checkin | MISSING | **add-table col** |
| Mark attendance based on | mark_attendance_basis | MISSING | **add-table col** |
| Allow buffer time before/after Shift (hr/min) | buffer_pre_minutes / buffer_post_minutes | MISSING | **add-table col** |
| Restrict editing back dated attendance to (days) | backdated_edit_limit_days | MISSING | **add-table col** |
| Restrict roster changes for past (days) | roster_change_limit_days | MISSING | **add-table col** |
| Trigger Absconding Flow After (days) | absconding_trigger_days | MISSING | **add-table col** |
| Limit availing Optional Holiday to (days) / Auto Approve | optional_holiday_limit_days / auto_approve_optional_holiday | MISSING | **add-table col** |
| Night Shift Differential (+ multiplier, NSD windows) | night_shift_differential_enabled / nsd_multiplier / policy_config | PARTIAL | **add-table col** + note-as-W-config |
| ~230 Configure-Requests / Hide-* / Leave-deduction sub-rules | attendance_policies.policy_config | MISSING | note-as-W-config |

### Attendance_Settings_Export_1_.csv (~150 switches) → `module_config`

Tenant-wide attendance behaviour (regularization windows, escalation, geofencing enablement,
LOP report config, widget hide flags, payroll-cycle mode). **MISSING as columns / PRESENT as config.
Decision: note-as-W-config** → `module_config`. (Geofencing-at-location enablement is a switch; the
fence coordinates themselves are DATA — see geofences below.)

### Attendance_Shift_Export.csv → `shifts`

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Shift Name / Code / Description / Start / End | shifts.name/shift_code/start_time/end_time | PRESENT | already-present |
| Next Day? (Over-Night Shift) | shifts.is_night_shift | PRESENT | already-present |
| Is WFH Shift? | shifts.is_wfh_shift | MISSING | **add-column** |
| Policy | shifts.attendance_policy_id | MISSING | **add-column** (FK) |
| Enable Overtime Policy in Shift | shifts.overtime_policy_id | MISSING | **add-column** (FK) |
| Leave Deduction Factor | shifts.leave_deduction_factor | MISSING | **add-column** |
| Standard Working Hours | shifts.standard_working_minutes | MISSING | **add-column** |
| Timezone | shifts.display_timezone | PRESENT | already-present |
| Do Not Generate OT on Weekday/Off/Holiday, Null Shift, Alt Schedule | shifts.shift_config | MISSING | note-as-W-config |
| Grace / thresholds (per shift) | shifts.grace_minutes / *_threshold_minutes | PRESENT | already-present |
| Attendance_Shift_Block (weekly pattern) | rosters.weekly_off_pattern | PRESENT | already-present |

### Overtime exports (Tenant_Leaves_Compoff, Overtime_Slabs/Threshold/Indexing/Settings) → NEW `overtime_policies`

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Name / Code / Description | overtime_policies.name/policy_code/description | MISSING | **add-table** |
| Calculation Frequency (Daily/Weekly/Monthly…) | overtime_policies.calculation_frequency | MISSING | **add-table col** |
| Overtime to be compensated via (Paid/Comp Off) | overtime_policies.compensation | MISSING | **add-table col** |
| Minimum duration to consider for Overtime | overtime_policies.min_ot_minutes | MISSING | **add-table col** |
| Max OT per day/week/month/year | daily/weekly/monthly/yearly_cap_minutes | MISSING | **add-table col** |
| Weekday / Weekly-Off / Holiday / NSD Multiplier | *_multiplier | MISSING | **add-table col** |
| Min duration to credit one/half day Comp off | compoff_min_minutes_full / _half | MISSING | **add-table col** |
| Comp off credited will lapse in (days) | compoff_lapse_days | MISSING | **add-table col** |
| Maximum Comp off Leave allowed in a month | compoff_max_per_month | MISSING | **add-table col** |
| Overtime_Slabs (Slab Name, Multiplication Factor) | overtime_policies.slabs jsonb | MISSING | **add-table col** |
| Overtime_Threshold (Weekly/Monthly/Quarterly/Yearly %) | overtime_policies.thresholds jsonb | MISSING | **add-table col** |
| Overtime-Policy-Indexing-Rules (standard/custom) | overtime_policies.indexing_rules jsonb | MISSING | **add-table col** |
| ~230 per-frequency approval routing / rounding / deduction | overtime_policies.policy_config | MISSING | note-as-W-config |
| Overtime_Settings (freeze-date override, auto-approve) | module_config | MISSING | note-as-W-config |
| overtime_records (transactional OT) | overtime_records.overtime_policy_id | PARTIAL | **add-column** (FK link) |
| comp_off ledger governing policy | comp_off_ledger.overtime_policy_id | PARTIAL | **add-column** (FK link) |

### Attendance_Ip_Export.csv → NEW `attendance_networks`

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Network Name / Network Code | attendance_networks.name / network_code | MISSING | **add-table** |
| IP Address From / IP Address To | ip_from / ip_to (inet) | MISSING | **add-table col** |
| Tag | attendance_networks.tag | MISSING | **add-table col** |
| Group Company | tenant_id / entity_id scope | PRESENT | already-present (scope) |

### Geofencing-Export.csv + CheckIn_Settings_Export → NEW `geofences`

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Fencing Name / Fencing Code | geofences.name / fence_code | MISSING | **add-table** |
| Distance (radius m) | geofences.radius_meters | MISSING | **add-table col** |
| Lattitude / Longitude | geofences.latitude / longitude | MISSING | **add-table col** |
| Tags | geofences.tag | MISSING | **add-table col** |
| Status / Company | geofences.status / tenant scope | PRESENT | already-present |
| CheckIn 'Fencing' radius / Check-out-before-checkin / approval | geofences.radius_meters + module_config | PARTIAL | already-present + note-as-W-config |

Note: `attendance_devices.geofence jsonb` already existed for a per-device inline point;
`geofences` is the **named, reusable, location-assignable** fence master the CSV represents.

### Attendance_Reasons_Export.csv / Attendance_Tags_Export.csv

| CSV column | maps to G03 | Status | Decision |
|---|---|---|---|
| Reason / Reason Code / Reason Type / Limit / Frequency | regularisation_requests.reason (free-text) + module_config allowed-list | PARTIAL | note-as-W-config |
| Tag Name / Tag Code / Tag Type (IP Restriction) | attendance_networks.tag / geofences.tag | PARTIAL | already-present (tag columns) |

Attendance reasons are a small tenant value set (like leave reasons) — kept as free-text +
`module_config` allowed-list; not promoted to a table this pass. **Noted.**

---

## Counts (field-group granularity across key CSVs)

| Status | Count |
|---|---|
| **PRESENT** (already modelled) | 34 |
| **PARTIAL** (partly modelled / needed a column or config split) | 22 |
| **MISSING** (no home before this recon) | 46 |

Of the MISSING/PARTIAL, **~700 raw CSV columns** are policy-configuration toggles routed to
`module_config` / `*_config jsonb` (**note-as-W-config**), not schema columns — this is the dominant
outcome and the core of the config-vs-data judgement.

## Schema changes applied (03-G03-attendance-leave.sql, SECTION 13b, ADD-ONLY)

**4 new tables:** `attendance_policies`, `overtime_policies`, `attendance_networks`, `geofences`
(+ 2 new enums `g03_ot_calc_frequency`, `g03_holiday_recurrence`; RLS + indexes + 2 sample rows each).

**New DATA columns on existing masters:**
- `leave_types`: is_hourly_leave, hours_per_day, hourly_min_minutes, hourly_multiple_minutes,
  allow_hourly_across_midnight, max_days_per_year, max_availed_per_year, max_days_per_month,
  min_advance_notice_days, max_future_apply_days, allow_half_day, attachment_mandatory_beyond_days,
  is_special_leave, has_unlimited_balance, **leave_type_config jsonb** (15).
- `leave_accrual_policies`: **accrual_config jsonb** (1).
- `shifts`: is_wfh_shift, leave_deduction_factor, standard_working_minutes, attendance_policy_id (FK),
  overtime_policy_id (FK), **shift_config jsonb** (6).
- `holidays`: day_name, repeat_next_year, is_national, recurrence_type, **recurrence_config jsonb** (5).
- `overtime_records`: overtime_policy_id (FK) · `comp_off_ledger`: overtime_policy_id (FK) (2).

**Validation:** `00-platform-core.sql` + amended `03-G03` load clean into a throwaway PostgreSQL 14
DB (`psql -v ON_ERROR_STOP=1`, both files rc=0, all 8 sample rows inserted). No existing content changed.
