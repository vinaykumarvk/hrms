# Organisation Masters — CSV ↔ Schema Reconciliation

**Scope:** Organisation-structure masters only.
**Schema file reconciled:** `docs/data-model/00-platform-core.sql` (Section 2 — Tenancy & Organisation Masters).
**Source CSVs:** `docs/HRMS Deliverables to Development Phase/DwnB Form Fields/Organisation/` (Darwinbox exports).
**Excluded (owned elsewhere):** `National_ID-Export_1_.csv` → G01 agent (identity docs). `Profile_View_settings.csv` → pure UI field-visibility config (P02 masking / G01), not an org master.

**Status legend:** PRESENT = column already exists · PARTIAL = concept exists but needs a column/shape change · MISSING = no home in the schema.
**Decision legend:** add-column · already-present · note-as-config (pure UI/policy toggle, not a data column) · migration-value (value list; CSV is the seed source, not inlined).

Status/Active/Archived/Inactive text everywhere maps to the convention `is_active boolean` (Active→true, Archived/Inactive→false) — recorded once here, not repeated per row. `Created On/By`, `Updated On/By` everywhere map to the standard audit columns `created_at/created_by/updated_at/updated_by` (already-present).

---

## 1. Designation_Names-Export.csv → `designations`  (528 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Designation Name | designations.name | PRESENT | already-present |
| Designation Code | designations.designation_code | PRESENT | already-present |
| Status | designations.is_active | PARTIAL | already-present (Active/Archived→bool) |
| Created On / Created By / Updated On / Updated By | audit cols | PRESENT | already-present |
| Effective From | designations.effective_from | MISSING | **add-column** (effective-dating) |
| *(528 value rows: CEO, Director, Program Manager, …)* | designations rows | — | migration-value (CSV = seed source; 2-3 samples only) |

## 2. Grade-Export.csv → `grades`  (14 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Grade | grades.name | PRESENT | already-present |
| Grade Code | grades.grade_code | PRESENT | already-present |
| Band Name | bands.name (via grades.band_id) | MISSING | **add-column + new table `bands`** |
| Band Code | grades.band_code / bands.band_code | MISSING | **add-column** |
| Status | grades.is_active | PARTIAL | already-present |
| *(Airtel Payment Bank, Job Level, …)* | grades rows | — | migration-value |

Note: existing `grades.pay_band` (text, e.g. 'PB-3') is the government pay-band label and is retained; `band_id`/`band_code` model the tenant's configurable **Band** master, which is a distinct concept.

## 3. Band-Export.csv → `bands`  (header only, 0 data rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Band | bands.name | MISSING | **new table `bands`** |
| Band Code | bands.band_code | MISSING | **new table `bands`** |
| Status | bands.is_active | MISSING | **new table `bands`** |

Master is empty in this export but the header defines the tenant-configurable Band master; table added so grades can FK to it.

## 4. Department-Export.csv → `org_units`  (148 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Company | org_units.entity_id → entities | PRESENT | already-present |
| Department Name | org_units.name | PRESENT | already-present |
| Department Code | org_units.org_unit_code | PRESENT | already-present |
| Parent Department Code | org_units.parent_org_unit_id | PRESENT | already-present |
| Business Unit / Business Unit Name / Business Unit Code | org_units.business_unit_code | PARTIAL | **add-column** (single BU label) |
| Top Department | derived (parent_org_unit_id IS NULL / depth_level=0) | PARTIAL | note-as-config (derivable) |
| HOD | org_units.head_employee_id | PRESENT | already-present |
| Performance HOD | org_units.performance_hod_employee_id | MISSING | **add-column** |
| Functional Head | org_units.functional_head_employee_id | MISSING | **add-column** |
| Head HR | org_units.head_hr_employee_id | MISSING | **add-column** |
| Group HR Head | org_units.group_hr_head_employee_id | MISSING | **add-column** |
| Head Level Access | — | MISSING | note-as-config (UI access toggle) |
| Level 1 … Level 9 | org_units.path / depth_level (materialised hierarchy) | PRESENT | already-present (breadcrumb = path) |
| Project Allocated / Name / Code | — | MISSING | note-as-config (project tagging, not org master) |
| Capability | — | MISSING | note-as-config |
| Status | org_units.is_active | PARTIAL | already-present |

Note: HOD cells can hold multiple names (`"[REDACTED],[REDACTED]"`); the canonical head is `head_employee_id`. Multi-HOD, if required, is a G01/positions concern — not modelled here.

## 5. Location-Export.csv → new table `locations`  (14 rows)

`geo_master` (COUNTRY/STATE/DISTRICT/CITY hierarchy) exists but there is **no physical office/work-location master**. Added `locations`.

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Company | locations.entity_id → entities | MISSING | **new table** |
| Office Area / Location Area | locations.name | MISSING | **new table** |
| Office Address | locations.address | MISSING | **add-column** |
| Office Email | locations.office_email | MISSING | **add-column** |
| Mobile Number | locations.mobile_number | MISSING | **add-column** |
| Telephone Number | locations.telephone_number | MISSING | **add-column** |
| Pincode | locations.pincode | MISSING | **add-column** |
| Office City | locations.city + locations.city_geo_id | MISSING | **add-column** |
| Office State | locations.state | MISSING | **add-column** |
| Office Country | locations.country | MISSING | **add-column** |
| City Code / State Code / Country Code | locations.city_code / state_code / country_code | MISSING | **add-column** |
| Parent Location | locations.parent_location_id (self-FK) | MISSING | **add-column** |
| Location Type / City Type / Centre Type | locations.location_type / city_type / centre_type | MISSING | **add-column** |
| Location Head | locations.location_head_employee_id | MISSING | **add-column** |
| Work Area Code | locations.location_code (business key) | MISSING | **new table** |
| Registered Office | locations.is_registered_office | MISSING | **add-column** |
| Status | locations.is_active | PARTIAL | already-present pattern |
| SSO Phone Number / SSO Branch Name EN / …Thai / SSO Branch Number | — | MISSING | note-as-config (Thailand SSO payroll config, country-specific) |
| Project Allocated | — | MISSING | note-as-config |

## 6. Location-Region-Export.csv → new table `regions`  (5 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Region Name | regions.name | MISSING | **new table `regions`** |
| Region Code | regions.region_code | MISSING | **new table** |
| States | regions ↔ geo_master(STATE) grouping | PARTIAL | note-as-config (member states; mapping seeded from geo_master) |

## 7. Location_Country_Master_Data.csv → `geo_master`  (header only, 0 data rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| City / City ID | geo_master (geo_type=CITY) name/geo_code | PRESENT | already-present |
| State / State ID / New State ID | geo_master (geo_type=STATE) | PRESENT | already-present (migration-value) |
| Country / Country ID | geo_master (geo_type=COUNTRY) | PRESENT | already-present |

Fully served by the existing hierarchical `geo_master`; no change.

## 8. Weekly_Off-Export.csv → new table `weekly_off_patterns`  (19 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Weekly Off Name | weekly_off_patterns.name | MISSING | **new table** |
| Description | weekly_off_patterns.description | MISSING | **new table** |
| Non working days | weekly_off_patterns.non_working_days | MISSING | **add-column** |
| Status | weekly_off_patterns.is_active | PARTIAL | new table |

## 9. Notice-Export.csv → new table `notice_period_policies`  (5 rows)

Substantive duration data is columnised; the ~12 Yes/No behaviour toggles are captured in `rule_config jsonb` (policy config, not query dimensions).

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Notice Name | notice_period_policies.name | MISSING | **new table** |
| Notice Code | notice_period_policies.notice_code | MISSING | **new table** |
| Set Notice Period After Confirmation In (Days)/(Months) | confirmation_days / confirmation_months | MISSING | **add-column** |
| Set Notice Period Under Probation In (Days)/(Months) | probation_days / probation_months | MISSING | **add-column** |
| Set Notice Period Under Contract In (Days)/(Months) | contract_days / contract_months | MISSING | **add-column** |
| Duration Of Notice Period After Confirmation / Probation / Contract | confirmation_months / probation_months / contract_months | PARTIAL | add-column (numeric duration) |
| Enable Tenure Based Notice Period | tenure_based | MISSING | add-column |
| Nationality applicability | nationality_applicability | MISSING | add-column |
| Applicable For | applicable_for | MISSING | add-column |
| Manager…Edit Recovery Days / Calculate From Resignation / Dont Consider Weekly Offs / Holidays / Unpaid Leave / Consider As Per Contract… | rule_config (jsonb) | MISSING | note-as-config (behaviour toggles) |
| Status | is_active | PARTIAL | new table |

## 10. Probation-Export.csv → new table `probation_policies`  (12 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Probation Name | probation_policies.name | MISSING | **new table** |
| Set Probation Period In (Days)/(Months) | period_days / period_months | MISSING | **add-column** |
| Duration of Probation | duration_months | MISSING | **add-column** |
| Show In Probation Extension | show_in_extension | MISSING | add-column |
| Extend Confirmation(In Case Of Auto Confirmation) | extend_confirmation_auto | MISSING | add-column |
| Start Probation Period From Assigned Date | start_from_assigned_date | MISSING | add-column |
| Status | is_active | PARTIAL | new table |

## 11. Deactivation_Reasons-Export_1_.csv → new table `separation_reasons`  (57 rows)

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Separation Type (Voluntary/Involuntary) | separation_reasons.separation_type (enum) | MISSING | **new table + enum `separation_type`** |
| Reason | separation_reasons.reason | MISSING | **new table** |
| Status | separation_reasons.is_active | PARTIAL | new table |

Note: `employees.separation_reason varchar` (free text on the golden record) already exists; this master is the **configurable pick-list** it is populated from (migration-value source).

## 12. Neev-Level-Export_1_.csv → new table `contribution_levels`  (8 rows)

Darwinbox "Neev Level" = the platform's **Contribution Level** dimension (already an RBAC scope: `scope_dimension = 'CONTRIBUTION_LEVEL'`), but had no master table.

| CSV column | maps to schema | Status | Decision |
|---|---|---|---|
| Contribution Level | contribution_levels.name | MISSING | **new table** |
| Contribution Level Code | contribution_levels.level_code | MISSING | **new table** |
| Status | contribution_levels.is_active | PARTIAL | new table |

## 13. AssignmentOne / Two / Three-Export.csv → not org-structure masters

These are Darwinbox custom "assignment" grouping configs (Employee Group; Notice-Period-from-Employee grouping; Appraisal Period) with Group Head/Head/Lead role slots.

| CSV | maps to schema | Status | Decision |
|---|---|---|---|
| AssignmentOne (Employee Group + heads) | — | MISSING | note-as-config (custom grouping; not a core org master) |
| AssignmentTwo (Notice Period from Employee) | overlaps notice_period_policies conceptually | MISSING | note-as-config |
| AssignmentThree (Appraisal Period) | — | MISSING | note-as-config (belongs to appraisal module, not platform-core org) |

Excluded from platform-core by design: these are tenant custom fields / module-specific, not the canonical org masters this file owns.

---

## Summary counts

| Status | Count (rows across relevant CSVs) |
|---|---|
| PRESENT | 16 |
| PARTIAL | 13 |
| MISSING | 39 |

## Schema changes applied to `00-platform-core.sql`

- **New enum:** `separation_type`.
- **New tables (8):** `bands`, `regions`, `locations`, `weekly_off_patterns`, `notice_period_policies`, `probation_policies`, `separation_reasons`, `contribution_levels`.
- **Columns added to existing tables (10):**
  - `designations.effective_from`
  - `grades.band_id`, `grades.band_code`
  - `org_units.business_unit_code`, `org_units.performance_hod_employee_id`, `org_units.functional_head_employee_id`, `org_units.head_hr_employee_id`, `org_units.group_hr_head_employee_id`
- All new tenant-scoped tables added to the Section 11 RLS DO-block; new employee/self FKs resolved in Section 10; value lists seeded from the CSVs (not inlined).
