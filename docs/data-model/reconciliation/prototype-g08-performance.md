# G08 Performance — PrimeSoft Prototype ↔ Schema Reconciliation

**Scope:** PrimeSoft prototype performance/appraisal/PIP/probation screens (field extracts in
`docs/data-model/reconciliation/prototype-extract/`) reconciled against
`docs/data-model/08-G08-performance-appraisal.sql`.
**Owned schema file:** `08-G08-performance-appraisal.sql` (ADD-only amendment — new **Section 4**).
**Prior pass:** the CSV recon (`g08-performance.md`) already added `scorecard_pillars`, `metrics`,
`goal_plans`, `normalization_settings`, `custom_formula_settings`, `calibration_settings`,
`review_definitions`, `review_excluded_employees`, `performance_translations` + 12 goal columns +
`g08_config_status`. This pass does **not** re-add those; it covers only prototype DATA fields not
yet materialised.

**Legend — Status:** PRESENT / PARTIAL / MISSING. **Decision:** already-present / add-column /
add-table / note-as-config.
**DATA vs config:** goal instances, self-review text, calibration outcomes, PIP cases, cycle
exclusions and probation decisions are **DATA**; pillars/metrics/goal-plan field matrices/
normalization curves/calibration templates/rating scales are tenant **CONFIG** (already handled).

---

## 1. Goal fields (DATA) — my-goals, add-goal, add-goal-for-reportee, admin-add-goal, copy-previous-goal

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Goal / Goal name (add-goal) | goals.title | PRESENT | already-present |
| Description (add-goal) | goals.description | PRESENT | already-present |
| Measurement criteria (add-goal) | goals.metric / goals.metric_criteria | PRESENT | already-present (CSV pass) |
| Weightage (my-goals) | goals.weightage | PRESENT | already-present |
| Target (admin-add-goal) | goals.target_value / target_prefix | PRESENT | already-present (CSV pass) |
| Scorecard pillar (add-goal) | goals.scorecard_pillar_id → scorecard_pillars | PRESENT | already-present (CSV pass) |
| Pillar (my-goals column) | goals.scorecard_pillar_id | PRESENT | already-present |
| Parent goal / sub-goals / KRs (add-goal) | goals.parent_goal_id | PRESENT | already-present |
| Category (my-goals + add-goal — distinct axis from Pillar; Behavioural/Customer/Stretch/…) | goals.**category** | MISSING | **add-column** goals.category |
| Source — Self-set / Manager-set (review-goal-plan); Authorship FR-M09-015 (pa-goal-plan-detail) | goals.**goal_source** (enum g08_goal_source) | MISSING | **add-column** goals.goal_source + enum |
| Reason for admin-set goal (admin-add-goal) / Edit reason (add-goal-for-reportee) | goals.**set_reason** | MISSING | **add-column** goals.set_reason |
| Visibility (admin-add-goal) | goals.**goal_visibility** | MISSING | **add-column** goals.goal_visibility |
| Scope — Org-wide/Dept/Band/Single (admin-add-goal) | resolved via assignment + goal_visibility | PARTIAL | note-as-config (assignment action, not per-goal fact) |
| Approval flow — Auto-approved / Route to L1 (admin-add-goal) | goals.status + P01 workflow | PARTIAL | note-as-config (workflow, P01) |
| Save draft / Submit for approval / Edit-and-Approve | goals.status (DRAFT/PROPOSED/APPROVED) | PRESENT | already-present |
| Copy from previous goal / ACHIEVED (copy-previous-goal) | goals.status='ACHIEVED' (source), new goals row | PRESENT | already-present (copy = new row) |
| Cascaded / My team (add-goal-for-reportee) | goals.cascaded_from_employee_id | PRESENT | already-present |
| Goal plan / cycle (add-goal, admin-add-goal) | goals.goal_plan_master_id / cycle_id | PRESENT | already-present (CSV pass) |

## 2. Review / appraisal fields — self-review, start-review, reviews, appraisal-review, review-goal-plan, manager-appraisal-tasks, pa-review-status

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Self rating per goal (self-review) | goals.self_rating | PRESENT | already-present |
| Evidence / examples (self-review) | self_appraisals.goal_summary (jsonb) | PARTIAL | note-as-config (per-goal evidence in jsonb) |
| Achievements (self-review) | self_appraisals.achievements | PRESENT | already-present |
| Overall comments (self-review) | self_appraisals.**overall_comments** | MISSING | **add-column** self_appraisals.overall_comments |
| Development areas (self-review) | self_appraisals.**development_areas** (≈ training_needs) | MISSING | **add-column** self_appraisals.development_areas |
| Constraints faced (self-review) | self_appraisals.constraints_faced | PRESENT | already-present |
| Submit to manager / status (self-review) | self_appraisals.status / submitted_at | PRESENT | already-present |
| Your rating / Your comments (start-review, L1) | appraisal_assessments.overall_grade / remarks; goals.ro_rating | PRESENT | already-present |
| Suggested overall rating (start-review) | derived (computed suggestion) | PARTIAL | note-as-config (computed) |
| Manager comments visible after publish (start-review) | appraisal_assessments.remarks + form disclosure gating | PRESENT | already-present |
| Send back to employee / Submit to skip (start-review) | appraisal_assessments.decision (RETURNED) + P01 | PRESENT | already-present |
| Stage 2 of 4 / stage progress (reviews, start-review) | appraisal_assessments.tier + form status | PRESENT | already-present |
| Self review / L1 review / Calibration / Final / Skip (reviews columns) | form status + assessment tiers + calibration_* | PRESENT | already-present |
| Computed goal score — FR-M09-019 formula (appraisal-review) | appraisal_assessments.section_grades (jsonb) / form grades | PARTIAL | note-as-config (computed; formula in custom_formula_settings) |
| L1 rating / L1 progress / Self overall rating (appraisal-review) | form.provisional_grade / goals ratings | PRESENT | already-present |
| SLA / Due (appraisal-review, pa-review-status) | cycle due dates + P01 SLA (sla_settings) | PRESENT | already-present |
| Escalate / bulk escalation / notification method (pa-review-status) | P01 workflow + notifications substrate | PRESENT | note-as-config (P01/X.1) |
| Team appraisal tasks — Goal plan approval / Manager rating / Self-review sign-off (manager-appraisal-tasks) | P01 workflow_actions + assessment tiers | PRESENT | note-as-config (P01 task queue) |
| Goal / Pillar / Source / Weight (review-goal-plan columns) | goals.title/scorecard_pillar_id/goal_source/weightage | PRESENT | already-present (goal_source added §1) |
| Approve plan / Return for redraft / comments (review-goal-plan) | goals.status + goal_checkins/assessment | PRESENT | already-present |

## 3. Calibration (DATA + config) — calibration, pa-calibration, pa-normalization

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Calibration session / scope / moderator / date (pa-calibration) | calibration_sessions.* | PRESENT | already-present |
| Final rating post-calibration (calibration) | calibration_recommendations.recommended_grade / calibration_adjustments.applied_grade | PRESENT | already-present |
| Distribution curve / ideal norm (pa-calibration) | calibration_sessions.target_distribution; normalization_settings (config) | PRESENT | already-present |
| High / Medium / Low potential (calibration) | calibration_recommendations.**potential_rating** | MISSING | **add-column** potential_rating |
| Employee acknowledgement — Awaiting/Acknowledged/Disagreed (calibration) | calibration_recommendations.**employee_ack_status** (enum g08_calib_ack_status) | MISSING | **add-column** + enum |
| Notes / employee comments (calibration) | calibration_recommendations.**employee_ack_comments** | MISSING | **add-column** employee_ack_comments |
| Acknowledged at / Release (calibration) | calibration_recommendations.**employee_ack_at**; form.acknowledged_at | PARTIAL | **add-column** employee_ack_at (calibration-specific ack) |
| Committee review / recommend / ratify (calibration) | calibration_recommendations.recommendation_status / ratified_* | PRESENT | already-present |
| Normalization curve register (pa-normalization) | normalization_settings.* | PRESENT | already-present (CSV pass) — CONFIG |
| Curve scope / applicable-to-cycle (pa-normalization) | normalization_settings + cycle.eligibility_rule | PARTIAL | note-as-config |

## 4. PIP (DATA) — pa-pip, pip-cases

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Employee (pa-pip) | performance_improvement_plans.appraisee_id | PRESENT | already-present |
| Initiating manager (pa-pip) | pip.initiated_by | PRESENT | already-present |
| PIP success criteria (pa-pip) | pip.success_criteria | PRESENT | already-present |
| Start date / End date (pa-pip) | pip.start_date / target_end_date | PRESENT | already-present |
| Milestone / check-in (pa-pip) | pip_milestones.* | PRESENT | already-present |
| Status / outcome / Decide outcome (pa-pip) | pip.status / pip.outcome | PRESENT | already-present |
| PIP type — Standard 90-day / Accelerated 60-day / Extended 120-day / Final 30-day (pa-pip) | pip.**pip_type** | MISSING | **add-column** pip_type |
| Trigger reason — Below-expectations rating / Customer escalation / Critical project failure / … (pa-pip) | pip.**trigger_reason** (categorised; free text stays in pip.reason) | MISSING | **add-column** trigger_reason |
| Check-in cadence — Weekly / Bi-weekly / Daily / Monthly (pa-pip) | pip.**checkin_cadence** | MISSING | **add-column** checkin_cadence |
| Support plan (employer commitment) (pa-pip) | pip.**support_plan** | MISSING | **add-column** support_plan |
| HRBP assigned (pa-pip, pip-cases) | pip.**hrbp_id** → employees | MISSING | **add-column** hrbp_id (FK) |
| Review date (pip-cases column) | pip.**next_review_date** | MISSING | **add-column** next_review_date |
| Performance gaps (specific) (pa-pip) | pip.reason (free text) | PRESENT | already-present |

## 5. Cycle exclusions (DATA) — pa-exclusions, pa-cycle-create auto-exclusions

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Cycle exclusion of an employee (pa-exclusions) | **appraisal_cycle_exclusions** (NEW) | MISSING | **add-table** appraisal_cycle_exclusions |
| Cycle (pa-exclusions) | appraisal_cycle_exclusions.cycle_id → appraisal_cycles | MISSING | add-table |
| Employee (pa-exclusions) | appraisal_cycle_exclusions.appraisee_id | MISSING | add-table |
| Auto-exclusions vs Manual exclusion (pa-cycle-create / pa-exclusions) | appraisal_cycle_exclusions.exclusion_source (enum g08_exclusion_source) | MISSING | add-table + enum |
| Exclusion reason — On probation/On notice/New joiner/Extended leave/Long-term medical/… | appraisal_cycle_exclusions.exclusion_reason | MISSING | add-table |
| Detail (pa-exclusions) | appraisal_cycle_exclusions.detail | MISSING | add-table |
| Justification (pa-exclusions) | appraisal_cycle_exclusions.justification | MISSING | add-table |
| Reversible vs Permanent (pa-exclusions) | appraisal_cycle_exclusions.reversibility (enum g08_exclusion_reversibility) | MISSING | add-table + enum |
| Re-include / status (pa-exclusions) | appraisal_cycle_exclusions.status/re_included_at/re_included_by (enum g08_exclusion_status) | MISSING | add-table + enum |
| Review-definition-scoped exclusion (Excluded-Employees CSV) | review_excluded_employees (CSV pass) | PRESENT | already-present (distinct: review-scoped, snapshot-only) |

## 6. Probation confirmation (DATA) — probation-confirmation, probation-decision, probation-approval, probation-management

| Prototype field (screen) | maps to G08 table.column | Status | Decision |
|---|---|---|---|
| Probation cycle type + period config (pa-cycle-create) | appraisal_cycles.cycle_type='PROBATION' / probation_period_months | PRESENT | already-present |
| Terminal outcome — Confirm/Extend/Terminate (probation-confirmation) | appraisal_forms.probation_outcome (enum g08_probation_outcome) | PARTIAL | already-present (terminal only; no decision lifecycle) |
| Probation confirmation decision record (all 4 screens) | **probation_confirmations** (NEW) | MISSING | **add-table** probation_confirmations |
| Joined / DOJ (probation-confirmation, probation-decision) | probation_confirmations.date_of_joining | MISSING | add-table |
| Probation ends / period (probation-confirmation) | probation_confirmations.probation_end_date / probation_period_months | MISSING | add-table |
| Mentor (probation-confirmation) | probation_confirmations.mentor_id → employees | MISSING | add-table |
| Manager recommendation — Recommend confirmation/extension/termination (probation-management) | probation_confirmations.manager_recommendation (enum g08_probation_recommendation) | MISSING | add-table + enum |
| Comments to HRBP / Your decision (probation-confirmation) | probation_confirmations.manager_comments | MISSING | add-table |
| HR approval — Approve/Send back/Pending HR approval (probation-approval) | probation_confirmations.hr_approver_id / hr_approved_at / status | MISSING | add-table |
| Extend (max 3 / 3 / 6 months) (probation-confirmation, probation-management) | probation_confirmations.extension_months | MISSING | add-table |
| Confirmation effective date (probation-management) | probation_confirmations.confirmation_effective_date | MISSING | add-table |
| New designation if changing (probation-management) | probation_confirmations.new_designation_id → designations | MISSING | add-table |
| Confirmation bonus / Compensation revision (probation-management) | probation_confirmations.confirmation_bonus / compensation_revision | MISSING | add-table |
| Letter template / Preview / Issue confirmation / Letter pending (probation-management) | probation_confirmations.letter_template_ref / letter_doc_id (→ documents) / status | MISSING | add-table |
| Status — In probation/Confirmed/Extended/Pending/Overdue (probation-management) | probation_confirmations.status (enum g08_probation_conf_status) | MISSING | add-table + enum |
| Nudge manager / Reminder sent (probation-management) | notifications substrate (X.1) | PRESENT | note-as-config |

---

## Summary of decisions (this prototype pass — additive to CSV pass)

**New DATA tables added (2):** `appraisal_cycle_exclusions`, `probation_confirmations`.

**New columns added (16):**
- `goals` (4): goal_source, category, set_reason, goal_visibility
- `self_appraisals` (2): overall_comments, development_areas
- `calibration_recommendations` (4): potential_rating, employee_ack_status, employee_ack_comments, employee_ack_at
- `performance_improvement_plans` (6): pip_type, trigger_reason, checkin_cadence, support_plan, hrbp_id, next_review_date

**New enums added (7):** g08_goal_source, g08_calib_ack_status, g08_exclusion_source,
g08_exclusion_reversibility, g08_exclusion_status, g08_probation_recommendation,
g08_probation_conf_status.

**Left as already-present / note-as-config:** scorecard pillars/metrics/goal-plan matrices/
normalization curves/calibration templates/rating scales (CONFIG — CSV pass); review-stage
progress, SLA/escalation, task queues and approval routing (P01 workflow engine + notifications
substrate); per-goal evidence and computed goal scores (jsonb / derived); goal Scope & admin
approval-flow (assignment action + P01, not per-goal facts). The APAR form's terminal
`probation_outcome` is retained; `probation_confirmations` adds the decision lifecycle around it.

### Status tally (row-level across the tables above)
- **PRESENT:** 34
- **PARTIAL:** 9
- **MISSING:** 25

**Validation:** `psql 14` (`-v ON_ERROR_STOP=1`) load of `00-platform-core.sql` then
`08-G08-performance-appraisal.sql` into a throwaway DB — **clean (exit 0 for both)**; new tables
seeded (2 exclusions, 2 probation confirmations) and all 16 new columns confirmed present.
