# G08 Performance Management — CSV ↔ Schema Reconciliation

**Scope:** Performance Management area (DarwinBox "DwnB" form-field exports) reconciled against
`docs/data-model/08-G08-performance-appraisal.sql` (BRD v3 §5, 23 module entities E1..E23).
**Owned schema file:** `08-G08-performance-appraisal.sql` (ADD-only amendment).
**Ground-truth CSVs:** `docs/HRMS Deliverables to Development Phase/DwnB Form Fields/Performance Management/`.

Legend — **Status**: PRESENT / PARTIAL / MISSING. **Decision**: add-column / add-table /
already-present / note-as-config.
**DATA vs config:** goal instances + excluded-employee links are *DATA*; pillars/metrics/goal-plan
field-matrices/normalization/calibration-templates/custom-formula/translations are *tenant CONFIG*.

---

## 1. Goals-Export.csv  (DATA — one goal/KRA instance per row)  → `goals` (E5)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Unique ID | goals.id (business/unique id) | PRESENT | already-present |
| Goal Type | goals.goal_type (enum g08_goal_type) | PRESENT | already-present |
| Company Name | tenants.name (tenant scope) | PRESENT | already-present |
| Business Unit | org_units (snapshot) | PARTIAL | note-as-config (org scope via appraisee) |
| Department | org_units (snapshot) | PARTIAL | note-as-config |
| Goal / KRA | goals.title | PRESENT | already-present |
| Goal Description | goals.description | PRESENT | already-present |
| Metric / Measurement Criteria | goals.metric (text) + **goals.metric_id** → metrics | PARTIAL | add-column (metric_id FK) + add-column (metric_criteria) |
| Target Prefix | — | MISSING | add-column goals.target_prefix |
| Target | goals.target_value | PRESENT | already-present |
| Weightage(%) | goals.weightage | PRESENT | already-present |
| Timelines Start date | — (only due_date existed) | MISSING | add-column goals.timeline_start_date |
| Timelines End date | goals.due_date ≈ end | PARTIAL | add-column goals.timeline_end_date |
| Scorecard pillar/perspective | — | MISSING | add-column goals.scorecard_pillar_id → **scorecard_pillars** |
| Is aligned to | goals.parent_goal_id (cascade only) | PARTIAL | add-column goals.aligned_to_goal_id + goals.aligned_to_ref |
| Achievement mapping | — | MISSING | add-column goals.achievement_mapping (jsonb) |
| Block edit achievement | — | MISSING | add-column goals.block_edit_achievement |
| Goal Plan | goals.goal_plan_id (M09 logical uuid) | PARTIAL | add-column goals.goal_plan_master_id → **goal_plans** |
| Assigned to Roles | — | MISSING | add-column goals.assigned_to_roles (jsonb) |

## 2. Scorecard Pillar.csv + Scorecard Pillar Translation.csv  (CONFIG master)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Scorecard Pillar Code | scorecard_pillars.pillar_code | MISSING | add-table scorecard_pillars |
| Scorecard Pillar Name | scorecard_pillars.name | MISSING | add-table |
| Description | scorecard_pillars.description | MISSING | add-table |
| Created On / Updated On | scorecard_pillars.source_created_on/source_updated_on | MISSING | add-column (source-timestamp carriers) |
| (Translation) Type/Object Type/Default/Language/Translation/Status | performance_translations.* | MISSING | add-table performance_translations |

## 3. Metric.csv  (CONFIG master)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Metric Name | metrics.name | MISSING | add-table metrics |
| Metric Code | metrics.metric_code | MISSING | add-table |
| Description | metrics.description | MISSING | add-table |
| Created On / Updated On | metrics.source_created_on/source_updated_on | MISSING | add-column |

## 4. GoalPlanKraSettings-Export.csv  (CONFIG — goal-plan definition + ~210-col field matrix)

| CSV column (group) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Goal Plan ID | goal_plans.goal_plan_code | MISSING | add-table goal_plans |
| Methodology / Enable Sub Goals | goal_plans.methodology / enable_sub_goals | MISSING | add-table |
| Goal Plan Name / Description | goal_plans.name / description | MISSING | add-table |
| Start Date / End Date | goal_plans.start_date / end_date | MISSING | add-table |
| User Assignment / Exclusion Setting | goal_plans.user_assignment / exclusion_setting | MISSING | add-table |
| Goal/Sub-Goal *field* — Enable/Mandatory/Editable/Need Approval (≈150 cols) | goal_plans.field_settings (jsonb) | MISSING | add-table (jsonb matrix; config, not per-column DDL) |
| Enable Goal count/weightage limits, Min/Max goals & weightage | goal_plans.min_goals/max_goals/min_weightage/max_weightage | MISSING | add-table |
| Achievement Mapping Scale / Default Achievement Mapping | goal_plans.achievement_mapping_scale / default_achievement_mapping | MISSING | add-table |
| Goal Plan Approver / Reviewer | goal_plans.goal_plan_approver / goal_plan_reviewer | MISSING | add-table |
| Enable Cascade / Scope | goal_plans.enable_cascade (+ field_settings) | MISSING | add-table |
| Scorecard Pillar Options / Select Metric Options | goal_plans.scorecard_pillar_options / metric_options | MISSING | add-table |
| Check-in / Notes / AI params / all remaining flags | goal_plans.field_settings (jsonb) | MISSING | add-table (config) |
| Created/Updated/Started/Archived On | goal_plans.source_* / status | MISSING | add-table |

## 5. ReviewKraSettings-Export.csv  (CONFIG — review definition inside a cycle, ~160 cols)

| CSV column (group) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Review ID / Name / Description | review_definitions.review_code / name / description | MISSING | add-table review_definitions |
| Align to Review Cycle | review_definitions.cycle_id → appraisal_cycles + align_to_review_cycle | PARTIAL | add-table (cycle already-present as appraisal_cycles) |
| Enable Exclude Employees / Exclusion Setting | review_definitions.enable_exclude_employees / exclusion_setting | MISSING | add-table |
| Is Final Review | review_definitions.is_final_review | MISSING | add-table |
| Goal/Overall/Competency — Rating Scale | review_definitions.goal_rating_scale / overall_rating_scale (+ rating_scales exists) | PARTIAL | add-table (scale master already-present) |
| Goal/Overall/Competency — Normalization setting | review_definitions.*_normalization_setting → **normalization_settings** | MISSING | add-table + add-table normalization_settings |
| Auto-calculation method / Suggest ratings | review_definitions.field_settings (jsonb) | MISSING | add-table (config) |
| Calibration — Enable / Process | review_definitions.calibration_enabled / calibration_process | PARTIAL | add-table (per-cycle calibration_sessions already-present) |
| Self / Evaluator1 / Evaluator2 / Reviewer stage config | review_definitions.stage_settings (jsonb) | MISSING | add-table (maps to E8 tiers at runtime) |
| Appraisee/Evaluator field visibility matrix (≈100 cols) | review_definitions.field_settings (jsonb) | MISSING | add-table (config) |
| Status / Updated / Started / Archived On | review_definitions.status / source_* | MISSING | add-table |

## 6. Review CycleKra Settings-Export.csv  (CONFIG — review cycle master)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Review Cycle Name / ID | appraisal_cycles.name / cycle_code | PRESENT | already-present |
| Review Cycle Description | appraisal_cycles.name (no desc col) | PARTIAL | note-as-config (E1 covers cycle; description optional) |
| Start / End Date | appraisal_cycles.appraisal_period_start/end | PRESENT | already-present |
| User Assignment | appraisal_cycles.eligibility_rule (jsonb) | PARTIAL | already-present (note-as-config) |
| Status / Created / Updated / Archived | appraisal_cycles.status + audit | PRESENT | already-present |

## 7. Normalization.csv  (CONFIG)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Name | normalization_settings.name | MISSING | add-table normalization_settings |
| Scale / Scale Marker / Scale Marks | normalization_settings.scale / scale_marker / scale_marks | MISSING | add-table |
| Min Marks / Max Marks | normalization_settings.min_marks / max_marks | MISSING | add-table |
| Ideal % / Delta % | normalization_settings.ideal_pct / delta_pct | MISSING | add-table |
| Created On / Updated On | normalization_settings.source_* | MISSING | add-table |

## 8. Calibration(1).csv / Calibration(2).csv + TenantCalibration_translation.csv  (CONFIG template)

| CSV column (group) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Calibration Name | calibration_settings.name | PARTIAL | add-table calibration_settings (E14 calibration_sessions is per-cycle run, not the template) |
| Overall/Goal/Competency Rating (params + scale) | calibration_settings.*_rating_enabled / *_rating_scale | MISSING | add-table |
| Promotion / Potential (params + framework) | calibration_settings.promotion_* / potential_* | MISSING | add-table |
| Choose method to publish rating (Overall/Goal/Competency) | calibration_settings.publish_method_* | MISSING | add-table |
| Define Ideal Distribution Norm (+ per-scale) | calibration_settings.ideal_distribution (jsonb) ~ calibration_sessions.target_distribution | PARTIAL | add-table (template-level) |
| Enable N Grid / lobby-group / freeze-by-hierarchy | calibration_settings.n_grid_enabled / lobby_group_enabled / parameters | MISSING | add-table |
| ~80 "Standard/Custom Field — Show in Moderation / Use in Calculation / Weightage" cols | calibration_settings.moderation_fields (jsonb) | MISSING | add-table (config matrix) |
| (Translation CSV) | performance_translations.* | MISSING | add-table performance_translations |

## 9. CustomFormulaSettings-Export.csv  (CONFIG)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Name | custom_formula_settings.name | MISSING | add-table custom_formula_settings |
| Information | custom_formula_settings.information | MISSING | add-table |
| Methodology | custom_formula_settings.methodology | MISSING | add-table |
| Formula For | custom_formula_settings.formula_for | MISSING | add-table |
| Formula | custom_formula_settings.formula | MISSING | add-table |
| Created On / Updated On | custom_formula_settings.source_* | MISSING | add-table |

## 10. Excluded-Employees-Export.csv  (DATA — review ↔ employee exclusion links)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Review ID | review_excluded_employees.review_code (+ review_definition_id FK) | MISSING | add-table review_excluded_employees |
| Employee ID | review_excluded_employees.employee_external_id (+ employee_id FK) | MISSING | add-table |
| Employee Name | review_excluded_employees.employee_name (snapshot) | MISSING | add-table |
| Review Name | review_excluded_employees.review_name (snapshot) | MISSING | add-table |

## 11. Framework Translation CSVs (New Goal Plan / Review / Review Cycle / Scorecard Pillar / Calibration)  (CONFIG i18n)

| CSV column | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Type | performance_translations.translation_type | MISSING | add-table performance_translations (single table covers all 5 translation exports) |
| Object Type | performance_translations.object_type | MISSING | add-table |
| Default Value | performance_translations.default_value | MISSING | add-table |
| Language | performance_translations.language | MISSING | add-table |
| Translation | performance_translations.translation | MISSING | add-table |
| Status | performance_translations.status | MISSING | add-table |

---

## Summary of decisions

**New tables added (9):** `scorecard_pillars`, `metrics`, `goal_plans`, `normalization_settings`,
`custom_formula_settings`, `calibration_settings`, `review_definitions`, `review_excluded_employees`,
`performance_translations`.

**New columns on `goals` (12):** metric_id, metric_criteria, target_prefix, timeline_start_date,
timeline_end_date, scorecard_pillar_id, aligned_to_goal_id, aligned_to_ref, achievement_mapping,
block_edit_achievement, assigned_to_roles, goal_plan_master_id.

**Enum added (1):** `g08_config_status` (DRAFT/ACTIVE/ARCHIVED) for the config/master tables.

**Left as already-present / note-as-config:** appraisal_cycles covers Review-Cycle master; rating_scales
covers rating-scale refs; calibration_sessions covers the per-cycle calibration *run* (calibration_settings
is the reusable *template*); org scope (Business Unit/Department) resolved via appraisee/org_units; the giant
per-field enable/mandatory/editable/need-approval matrices are stored as `jsonb` (`field_settings` /
`stage_settings` / `moderation_fields`) rather than exploded into hundreds of columns — they are tenant
CONFIG consumed by the form engine, not queryable business facts.

### Status tally (row-level across the tables above)
- **PRESENT:** 14
- **PARTIAL:** 11
- **MISSING:** 47
</content>
