# CSV Field Reconciliation — Darwinbox exports → schema

The data model was originally derived from the v3 BRDs. This pass reconciles it against the **ground-truth
field exports** in `docs/HRMS Deliverables to Development Phase/DwnB Form Fields/` (116 CSVs, ~3,537 columns —
the Darwinbox migration-source configuration). Each area was audited PRESENT / PARTIAL / MISSING per CSV
column; genuinely-missing **data** fields were added to the schema; pure policy/UI **configuration** settings
were kept as configurable content (W.1–W.3 / `*_config` jsonb), not exploded into columns.

| Area | Report | Maps to | Present | Partial | Missing→added | Schema change |
|---|---|---|---|---|---|---|
| Organisation masters | `organisation-masters.md` | platform core | 16 | 13 | 39 | +8 tables, +10 cols |
| Employee profile / custom fields / National-ID | `g01-profile-fields.md` | G01 | 24 | 5 | 24 | +2 tables, +custom-field framework, +national_id_types |
| Leave + Attendance | `g03-leave-attendance.md` | G03 | 34 | 22 | 46 | +4 tables, +~30 cols |
| Performance Management | `g08-performance.md` | G08 | 14 | 11 | 47 | +9 tables, +12 goal cols |
| Document categories / templates | `g13-documents.md` | G13 | 12 | 0 | 28 | +5 tables |

**Net: +28 tables → 431 total** (from 403); schema still loads clean end-to-end (1,836 FKs, 427 RLS).

## What was added (data fields, not config)
- **Core:** `bands`, `regions`, `locations` (full office address + heads), `weekly_off_patterns`,
  `notice_period_policies`, `probation_policies`, `separation_reasons`, `contribution_levels`; band/grade
  codes, designation effective-dating, department-head refs (HOD / functional / HR heads).
- **G01:** `national_id_types` (configurable statutory-ID master — Aadhaar/PAN/Passport/DL/EPF/ESIC/UAN with
  alias/mandatory/temporary-ID/document flags), `employee_personal_details`, custom-field framework columns
  (external id, display target, for-object, editable, decimals, separator), identity-doc → type linkage.
- **G03:** `attendance_policies`, `overtime_policies` (thresholds/slabs/indexing), `attendance_networks`
  (IP restrictions), `geofences`; leave-type hourly/max-per-year fields, shift/holiday/comp-off attributes.
- **G08:** `scorecard_pillars`, `metrics`, `normalization_settings`, `custom_formula_settings`, `goal_plans`,
  `review_definitions`, `review_excluded_employees`, `calibration_settings`, `performance_translations`;
  goal fields (metric criteria, target prefix, scorecard pillar, achievement mapping, alignment).
- **G13:** `document_categories`, `document_category_profile_fields`, `document_template_name_formats`,
  `policy_letter_settings`, `self_generate_settings`.

## Prototype pass (`PrimeSoft_HRMS_Prototype_v2_6.html` — 296 screens)
A second reconciliation extracted the field inventory from the React prototype's **296 screens**
(per-screen field files in `prototype-extract/`) and reconciled the gov-relevant ones. Screen classification
in `prototype-screen-map.md`: **183 screens in gov scope** (G01 32, G02 2, G03 33, G08 31, G13 20,
platform-core 12, platform-config 53) · **113 out-of-scope commercial** (Recruitment 45, Separation/FnF 18,
IT assets & Service Desk 21, Platform-super-admin 13, Onboarding/BGV 12, Payroll/TDS 4).

Prototype gap reports: `prototype-g01-profile.md`, `prototype-g02.md`, `prototype-g03-leave-attendance.md`,
`prototype-g08-performance.md`, `prototype-g13-documents.md`, `prototype-g14-dashboards.md`. Added (data only):
- **G01:** `employee_profile_skills` (self-declared; distinct from G07's assessed `employee_skills`), `employee_visas`,
  `employee_professional_certifications`, `employee_dependent_details` + education/experience/bank columns.
- **G03:** `leave_reasons`, `attendance_reasons` masters, `leave_balance_adjustments`, `leave_revocations`,
  `attendance_lock_periods` + application/OT/shift/holiday/geofence columns.
- **G08:** `appraisal_cycle_exclusions`, `probation_confirmations` + goal/self-appraisal/calibration-ack/PIP columns.
- **G13:** `merge_field_catalog`, `letter_generation_requests`, `bulk_letter_jobs`, `acknowledgement_campaigns`,
  `document_acknowledgements`.
- **G14:** no new tables — dashboard tiles resolve to seeded `kpi_definitions` + `analytics_datamart` (+`HOURS` unit).
- **G02:** `field_sensitivity_catalog.pii_tier_id` (DPDPA PII-tier axis) + seeded `pii_tiers`.

One cross-module collision the full-load test caught and fixed: G01's prototype-added `employee_skills` clashed
with G07's authoritative skill inventory → renamed to `employee_profile_skills`.

**Net after both passes: 403 → 447 tables** (CSV +28, prototype +16), schema loads clean end-to-end (1,907 FKs, 443 RLS, 700 enums).

## Migration-source note
The CSV value lists (528 designations, 57 separation reasons, holiday calendars, etc.) are **not inlined** in
the schema — the CSVs are the P06 migration seed source. The schema carries 2–3 sample rows per new table;
bulk values load at migration time via the P06 ETL+V toolkit.

## Deliberately kept as configuration (not schema columns)
Attendance/Leave/Performance policies carry hundreds of enable/mandatory/editable/approval-routing toggles.
These are **form/policy configuration** (the Platform Spec's W.1–W.3 configurable content) and live in
`*_config` jsonb / settings structures, not fixed columns — consistent with how the platform models
configured content. Recruitment, Onboarding, and Separation CSVs belong to PrimeSoft commercial modules
outside the government 14-item scope and were not folded into the gov schema.
