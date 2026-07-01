# Prototype ↔ G14 Dashboard & Analytics Reconciliation

Reconciles the PrimeSoft prototype dashboard/analytics screens against
`docs/data-model/14-G14-dashboard-analytics.sql` (G14, BRD v3 §5).

**Core finding:** G14 owns analytics *metadata*, not transactional data. Every concrete
dashboard/dept-view tile is **DATA-DERIVED** — it resolves to a `kpi_definition` (+ `analytics_datamart`)
rendered by a `dashboard_widget`, or to a `saved_report`. The model already represents them;
almost nothing is a schema gap. Screens whose data is owned elsewhere (audit log, notifications,
tasks, calendar, policy chat) map to core/other-module tables and are referenced, not seeded here.

Status legend: PRESENT = model represents it as-is · PARTIAL = representable but needed a seed/dimension · MISSING = structural gap.

| Prototype KPI/widget/column (screen) | maps to G14 table.column | Status | Decision |
|---|---|---|---|
| Org/Group/Team headcount, Net headcount gap, Bench (dashboard) | `kpi_definitions` (HEADCOUNT_ACTIVE) → `dashboard_widgets.kpi_id`; mart `MART_HEADCOUNT` | PRESENT | KPI-defined; existing seed covers headcount |
| Attrition (90d) / Attrition trending (dashboard); Attrition (LTM) (dept-view) | `kpi_definitions` (ATTRITION_LTM_PCT) over `MART_HEADCOUNT` | PARTIAL→PRESENT | Seeded `ATTRITION_LTM_PCT` KPI |
| Present today / On leave today / WFH today / Absent (dashboard, dept-attendance) | `kpi_definitions` (ATT_PRESENT_PCT, ATT_WFH_TODAY, LEAVE_ON_TODAY) over `MART_ATTENDANCE`/`MART_LEAVE` | PARTIAL→PRESENT | Seeded ATTENDANCE/LEAVE marts + KPIs |
| Avg work hrs (dept-attendance) | `kpi_definitions` (ATT_AVG_WORK_HRS), `unit = HOURS` | MISSING→PRESENT | Added `HOURS` to `g14_kpi_unit`; seeded KPI |
| Pending regularisations (dept-attendance) | `kpi_definitions` (ATTENDANCE domain, COUNT) — derivable | PRESENT | KPI-definable over `MART_ATTENDANCE`; not seeded (representative set) |
| Dept headcount by grade band B2/B3/B4/B5+ × Team, Total (dept-headcount) | `kpi_definitions` HEADCOUNT_ACTIVE + `dimensions_allowed` (`grade_band`,`team`); grain ORG_UNIT | PRESENT | Grade-band slice is a KPI **dimension** (config), not a column |
| Dept leave list: Employee, Team, Type, Dates, Status (dept-leave) | Record list → `saved_reports` over `MART_LEAVE`, or P02-gated drill-through; count tile `LEAVE_ON_TODAY` | PRESENT | Row-level list is a saved_report/drill; leave facts read from G03 by reference |
| Dept team table: Team, Manager, Headcount, Open, Avg rating, On notice, Open positions (dept-view) | Composite → `saved_reports` (multi-mart) / per-column KPIs; Open positions via `establishment_positions` | PRESENT | Aggregate table = saved_report; vacancy from establishment reference |
| Dept performance: Rating band × Count, Avg rating, Reviews complete, PIP active, Top performers (dept-performance) | `kpi_definitions` (PERF_AVG_RATING) over `MART_APPRAISAL`; band via `rating_band` dimension | PARTIAL→PRESENT | Seeded APPRAISAL mart + `PERF_AVG_RATING`; distribution = dimension slice |
| Goal completion, Reviews SLA-breached, Self-reviews submitted, L1 evaluations (dashboard) | `kpi_definitions` (APPRAISAL domain) + `alert_rules` (SLA) | PRESENT | KPI/alert-definable over appraisal mart; not seeded (representative set) |
| Leave usage trends / Attendance trends (dashboard) | `dashboard_widgets.widget_type = LINE` bound to time-series KPI | PRESENT | LINE widget over KPI snapshots |
| Offers, Time to hire, BGV, SLA breaches, Onboarding completion, etc. (dashboard) | `kpi_definitions` (per-domain) + `dashboard_widgets`; SLA → `alert_rules` | PRESENT | All are KPI tiles across domains; widget palette + KPI registry cover them |
| FY26 plan vs actuals, target vs actual, forecast (dashboard) | `kpi_target_history` (effective-dated targets) + `kpi_snapshots` | PRESENT | Effective-dated targets modeled (E17) |
| my-team roster: Employee, Role, DOJ, Status, Last review (my-team) | Record-level → P02-gated **drill-through** (`dashboard_widgets.drillthrough_target`) to G01/G08 | PRESENT | Not aggregate analytics; drill-through to owning module |
| Leadership AI: text-to-query over M16 aggregates, prose summary (leadership-ai-chat) | `nl_query_logs` (question_text, resolved_kpi_id, confidence, outcome, llm_provider) | PRESENT | NLQ surface (E20); prose output is informational, not a column |
| Leadership AI risk table: Engineer, Project·Client, Risk, LWD (leadership-ai-chat) | `prediction_results` (subject_type=EMPLOYEE, risk_band, is_individual_gated) + `prediction_models` (ATTRITION_RISK) | PRESENT | Friction-gated individual predictive scores (E14/E15) |
| Audit log: Timestamp, User, Action, Entity, Record ID, Fields changed, IP (audit-log, FR-P05-001) | core `audit_log` (created_at, actor_user_id, operation, table_name, record_id, changed_columns) + `security_audit_log` (login/PII/IP) | PRESENT | **Owned by P05 core**, not G14. G14 adds `analytics_access_log` (read-access ledger) that mirrors into it. IP lives in `security_audit_log`. |
| Notifications: Category, Notification, When (notifications, FR-P01) | core `notifications` (message_id/related_ref, subject, created_at) | PRESENT | Owned by X.2 core; G14 references via `alert_events.notification_id` |
| My open tasks: Task, Type, Source (M01/M05/M09/M11), Due, Action (tasks, FR-P01) | P01 `workflow_actions` / `workflow_instances` | PRESENT | Owned by P01 workflow engine; not G14 |
| Calendar: Holidays, Leaves, Birthdays, Anniversaries, Interviews (calendar, FR-CAL-001) | Cross-module: G03 (leave/holiday), recruitment (interviews), G01 (DOB/DOJ) | PRESENT | Cross-module aggregation; G14 may host a HEATMAP/TABLE widget but owns no calendar table |
| AI policy chat: ask policies/benefits, "Coming soon", draft self-review (ai-policy-chat, FR-P03) | P03 knowledge assistant (not analytics NLQ) | PRESENT | Out of G14 scope — policy Q&A assistant, distinct from `nl_query_logs` analytics NLQ |

## Counts
- PRESENT: 18
- PARTIAL (resolved via seed/dimension in this recon): 4 (attrition, present/leave/WFH, dept-performance, avg-work-hrs)
- MISSING (structural, resolved): 1 (`HOURS` unit)

## Schema changes applied to `14-G14-dashboard-analytics.sql` (additive only)
1. `g14_kpi_unit` enum += `'HOURS'` — for the dept-attendance "Avg work hrs" tile.
2. Seed marts (3): `MART_LEAVE`, `MART_ATTENDANCE`, `MART_APPRAISAL` (read-model definitions over G03/G08 contracted views).
3. Seed `kpi_definitions` (6): `LEAVE_ON_TODAY`, `ATT_PRESENT_PCT`, `ATT_WFH_TODAY`, `ATT_AVG_WORK_HRS`, `PERF_AVG_RATING`, `ATTRITION_LTM_PCT`.
4. Seed `dashboard_widgets` (3): dept KPIs bound onto the `MGR_TEAM` dashboard.

No new tables/columns were required — the dashboard surface is metadata-driven, and the existing
`kpi_definitions` / `dashboard_widgets` / `saved_reports` / `analytics_datamarts` model represents
every concrete prototype tile.
