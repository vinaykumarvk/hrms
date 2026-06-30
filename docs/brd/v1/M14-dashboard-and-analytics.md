# Dashboard and Analytics — HRMS Module BRD

**Module code:** M14-DAS
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM analytics (Workday Prism / SAP SuccessFactors People Analytics / Oracle HCM OTBI bar) honouring Indian public-sector statutory reporting (reservation roster, SR verification, cadre/seniority, retirement profiling)
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v1.0
**Status:** Draft for Gate A review

---

## 1. Executive Summary

### 1.1 Purpose

The Dashboard and Analytics module (**M14-DAS**) is the **cross-module intelligence layer** of the HRMS. It reads from every transactional module (M01–M13), transforms raw operational data into governed, version-controlled metrics, and presents them through **role-based dashboards**, **workforce and operational analytics**, **compliance & statutory dashboards**, and a **self-service report builder**. M14 is the single place where a leader, an HR officer, a department head, an auditor, or an employee sees "the numbers" — and every number is **defined once, computed consistently, permission-scoped, and traceable back to the source record**.

M14 owns **no transactional master data**. It defines and owns only its **analytics artefacts**: dashboards, widgets, KPI definitions, saved views, saved reports, report schedules, alert rules, and an **analytics data layer** (semantic model, data marts, materialised views, and an ETL/refresh pipeline). It enforces **row-level security that mirrors the operational RBAC and org-unit scoping** so that the same dashboard shows a manager only their span, an HR officer only their delegated org units, and an executive the whole enterprise — without leaking a single record beyond permission.

### 1.2 Business Context and Problem Statement

Public-sector HR leadership today reconstructs the workforce picture from spreadsheets exported out of disconnected systems: headcount that disagrees between payroll and the establishment register, reservation-roster compliance computed by hand, retirement bulges discovered too late to plan succession, SLA breaches invisible until an audit, and "the same KPI" calculated three different ways by three departments. The cost is poor decisions, audit findings, statutory non-compliance (reservation rosters, mandatory training, SR verification), and an inability to answer basic questions — "how many Group-A posts are vacant in District X?" — without a week of manual effort. M14 eliminates this by providing **one governed metric layer, one set of role-scoped dashboards, and self-service analytics** with full lineage, freshness transparency, and drill-through to the authoritative record.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | One governed definition per metric | 100% of dashboard tiles resolve to a registered `kpi_definition`; zero ad-hoc inline formulae in production |
| G2 | Permission-scoped truth | Every query is RLS-filtered; an automated test proves no role sees a record outside its scope |
| G3 | Consistency with sources | KPI recomputation against source modules reconciles within tolerance; reconciliation report shows 0 unexplained variance |
| G4 | Freshness transparency | Every dashboard and report shows an explicit `data_as_of` timestamp and staleness state; no silent stale data |
| G5 | Self-service | HR/department users build, save, schedule, and export reports without IT tickets |
| G6 | Statutory compliance visibility | Reservation roster, mandatory training, SR verification, and SLA dashboards available to authorised roles with audit-grade exports |
| G7 | Forward-looking insight | Retirement/attrition forecasting and succession-risk surfacing with documented, explainable methodology |
| G8 | Performance at scale | P95 dashboard load < 2.5s on pre-aggregated marts for an enterprise of 100k+ employees |

### 1.4 Scope Summary

In scope: role-based dashboard framework (employee, manager, HR, department head, executive, auditor) with KPI tiles/charts/drill-down; configurable KPI definition & calculation engine; the analytics data layer (semantic model, data marts, materialised views, ETL refresh, freshness tracking); row-level security mirroring RBAC; workforce analytics; per-module operational analytics; compliance & statutory dashboards; self-service report builder (ad-hoc query, saved reports); scheduled report distribution & multi-format export (PDF/Excel/CSV); drill-through to source records (permission-gated); alerting/thresholds/KPI targets; data-freshness indicators & stale-data behaviour; predictive analytics (attrition/retirement risk, succession); benchmarking; natural-language query & embedded BI; mobile/executive dashboards.

Out of scope (owned elsewhere): all transactional capture and writes (M01–M13 own their data; M14 reads only); the operational RBAC catalog and authentication (platform); document storage internals (M13 — M14 references generated export objects); the statutory SR ledger writes (M12). M14 **never mutates source records**; drill-through opens the owning module's record view, it does not edit it.

### 1.5 Key Stakeholders

Employee (self-service), Reporting Manager, HR Officer/Admin, Department Head / Appointing Authority, Executive / Leadership (Secretary, HoD, CEO-equivalent), Auditor (read-only), Analytics Administrator (KPI/dashboard steward), Data Engineer (ETL/mart operator), System Administrator.

### 1.6 Success Criteria

M14 is "successful" when: every published dashboard tile maps to a governed KPI; all queries are RLS-enforced and pass scope-leak tests; freshness is visible on every surface; HR and department users self-serve reports and schedules; statutory dashboards (reservation roster, mandatory training, SR verification, SLA) are live and exportable for audit; predictive and benchmarking views carry documented methodology; and the metric layer reconciles to the source modules within published tolerance — all with a complete audit trail of who viewed/exported what.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Dashboard Framework & Layout | M14-F01 | Role-based dashboards, widget catalog, layout/personalisation, saved views |
| KPI Definition & Calculation | M14-F02 | Governed, versioned KPI registry; calculation/derivation engine |
| Analytics Data Layer | M14-F03 | Semantic model, data marts, materialised views, ETL refresh, freshness tracking |
| Row-Level Security | M14-F04 | RLS policies mirroring RBAC + org-unit scoping; query-time scope filtering |
| Workforce Analytics | M14-F05 | Headcount, demographics, diversity, attrition, vacancy, cadre, age/retirement, span of control |
| Operational Analytics (per module) | M14-F06 | Leave/absenteeism, attendance, payroll cost/overtime, training, appraisal, disciplinary, transfer/promotion, pension |
| Compliance & Statutory Dashboards | M14-F07 | Reservation roster, mandatory training, SR verification, pending approvals/SLA breaches |
| Self-Service Report Builder | M14-F08 | Ad-hoc query designer, saved reports, field/filter/aggregation selection |
| Scheduled Distribution & Export | M14-F09 | Report schedules, PDF/Excel/CSV export, bursting, delivery |
| Drill-Down & Drill-Through | M14-F10 | Hierarchy drill, permission-gated drill-through to source records |
| Alerting, Thresholds & Targets | M14-F11 | KPI targets/thresholds, alert rules, triggered alert events |
| Data Freshness & Stale-Data UX | M14-F12 | `data_as_of` surfacing, staleness states, refresh status, degraded-mode behaviour |
| Predictive Analytics | M14-F13 | Attrition/retirement risk, succession-risk scoring with explainability |
| Benchmarking & Comparative Analytics | M14-F14 | Period-over-period, peer org-unit, target vs actual benchmarking |
| Natural-Language Query & Embedded BI | M14-F15 | NL-to-query assistant, embeddable widgets/iframes with scoped tokens |
| Mobile & Executive Dashboards | M14-F16 | Responsive/mobile dashboards, executive briefing pack |

### 2.2 Common Capabilities (inherited from Shared Foundation)

All M14 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); RBAC + org-unit row-level scoping; immutable `audit_log` write on every config change **and every report export/drill-through view**; `documents` (M13) for generated export artefacts; `notifications` for alerts and scheduled-report delivery. Maker-checker applies to **publishing** KPI definitions and enterprise/statutory dashboards.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In M14? | Owner / Note |
|---|---|---|
| Employee master data | Read only (via mart) | M01 golden source |
| Leave / attendance facts | Read only | M03 (M14 aggregates) |
| SR events & verification status | Read only | M12 owns ledger; M14 reports status |
| Payroll cost / overtime facts | Read only | M10 (post-lock snapshots only) |
| Appraisal ratings / disciplinary cases | Read only | M08 / M09 |
| Transfer / promotion pipeline | Read only | M05 / M06 |
| Pension forecasting inputs | Read only | M11 (M14 visualises forecasts) |
| Document storage | Reference | M13 stores export objects; M14 creates refs |
| Operational RBAC catalog & auth | Consume | Platform; M14 mirrors into RLS policies |
| Editing a source record | Out | Drill-through is read-only; edits happen in owning module |
| KPI / dashboard / report definitions | In (owned) | M14 owns analytics artefacts |
| ETL / data marts / materialised views | In (owned) | M14 owns the analytics layer |

### 2.4 Assumptions and Constraints

- M14 reads from source modules through a **governed mart layer** refreshed on a schedule (default near-real-time for operational marts, daily for heavy demographic/financial marts); it does **not** issue ad-hoc cross-joins against live OLTP tables for dashboard rendering.
- The operational **RBAC + org-unit hierarchy is authoritative**; M14 derives RLS scope from it and re-derives on each session — it never invents its own access model.
- All sensitive financial figures (payroll cost, salary) are sourced from **locked/finalised** snapshots only; in-progress payroll is excluded from cost analytics unless explicitly running a "what-if" view fed by M10 FR-18.
- Reservation-roster, cadre, and seniority logic uses the **same canonical reference data** (cadres, designations, reservation categories) as the owning modules; M14 does not redefine category rules.
- Predictive models are **advisory**; outputs are labelled as estimates with methodology and confidence, never as administrative decisions.
- Money math in marts uses fixed-point decimal; aggregates round at presentation only.
- Single legal entity per deployment; the mart schema is entity-aware (`legal_entity_id`) for future multi-entity.

---

## 3. Roles & Permissions

### 3.1 Module Roles (extending the Shared RBAC baseline)

| Role | M14 responsibility |
|---|---|
| Employee (Self-Service) | View own personal dashboard (own leave balance, attendance, payslip trend, training, appraisal status); no aggregate/other-employee data |
| Reporting Manager | View team dashboard scoped to direct + indirect reports; team leave/attendance/training/appraisal analytics; drill-through to own team members |
| HR Officer / Admin | Operate dashboards and reports scoped to delegated org units; build/save/schedule reports; manage saved views; drill-through within scope |
| Department Head / Appointing Authority | Department-wide analytics (headcount, vacancy, attrition, compliance) for owned org subtree; approve department dashboard publication |
| Executive / Leadership | Enterprise-wide dashboards, predictive & benchmarking views, executive briefing pack; read-only, no record edit |
| Auditor (read-only) | Read all dashboards/reports cross-module + the M14 access/export audit trail; no write; cannot alter KPI definitions |
| Analytics Administrator | Steward KPI definitions, widget catalog, dashboard templates, alert rules; publish (checker) governed metrics |
| Data Engineer | Operate ETL/mart refresh, monitor freshness, re-run failed loads; no dashboard publication authority |
| System Administrator | Manage RLS policy mappings, embedded-BI tokens, retention; **no self-approval of metric publication** |

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Publish, X=No access)

| Capability | Employee | Manager | HR Officer | Dept Head | Executive | Auditor | Analytics Admin | Data Engineer | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|
| Own personal dashboard | R | R | R | R | R | R | R | R | R |
| Team/scoped aggregate dashboard | X | R(team) | R(scope) | R(dept) | R(all) | R(all) | R(all) | R | R |
| Enterprise/leadership dashboard | X | X | X | R(dept) | R | R | R | X | R |
| Compliance/statutory dashboard | X | X | R(scope) | R(dept) | R | R | R | X | R |
| KPI definition | X | X | X | X | X | R | C/U/A | R | R |
| Widget/dashboard template | X | X | R | R | R | R | C/U/A | X | R |
| Saved view (personal) | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U |
| Saved report (shared) | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | R |
| Report schedule | X | C(team) | C/U | C/U | C/U | X | C/U | X | R |
| Export (PDF/Excel/CSV) | R(own) | R(team) | R(scope) | R(dept) | R(all) | R(all) | R(all) | X | R |
| Drill-through to source record | own | team | scope | dept | per-perm | R(all) | per-perm | X | per-perm |
| Alert rule / threshold | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | R |
| Predictive/benchmark views | X | X | R(scope) | R(dept) | R | R | R/U(config) | X | R |
| ETL / mart refresh control | X | X | X | X | X | R(status) | R | C/U | R |
| RLS policy mapping | X | X | X | X | X | R | R | X | C/U |
| Embedded-BI token | X | X | X | X | X | X | C | X | C/U |
| M14 access/export audit log | X | X | X | R(dept) | R | R | R | X | R |

All access is additionally **row-level scoped** by org_unit subtree and reporting line (FR-M14-04). A role grant never overrides RLS; the effective dataset is the intersection of capability grant and data scope.

---

## 4. Shared Application Foundation

M14 inherits the Shared Foundation (§5 of `SHARED_FOUNDATION.md`) verbatim:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) frontend with a charting/visualisation layer; REST API under `/api/v1`; PostgreSQL primary datastore with a dedicated **analytics schema** (marts + materialised views); object storage (M13) for generated export files; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; **RBAC + row-level scoping by org_unit is enforced inside every analytics query** (FR-M14-04).
- **Canonical error envelope:** `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + M14-specific (§8.3).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail (including **view/export** events for sensitive analytics), PII minimisation, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500ms (mart-backed reads), dashboard P95 < 2.5s; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h. Analytics-specific NFRs in §9.

**Shared entities referenced (not redefined):** `employees`, `users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances/tasks`. M14 reads facts owned by M01–M13 through the mart layer and references export objects in `documents`.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

M14 **owns** the following analytics entities (E01–E16). It **references** the shared/source entities listed at the end.

| # | Entity | Owner | Purpose |
|---|---|---|---|
| E01 | `dashboard` | M14 | A named, role-targeted dashboard (canvas of widgets) |
| E02 | `dashboard_widget` | M14 | A tile/chart/table on a dashboard, bound to a KPI or query |
| E03 | `kpi_definition` | M14 | Governed, versioned metric definition (formula, grain, filters, target) |
| E04 | `kpi_snapshot` | M14 | Time-series of computed KPI values per scope/period (for trends & freshness) |
| E05 | `saved_view` | M14 | A user's saved filter/layout state over a dashboard or report |
| E06 | `saved_report` | M14 | A reusable ad-hoc/report-builder definition (fields, filters, grouping) |
| E07 | `report_schedule` | M14 | Schedule + recipients + format for automated report distribution |
| E08 | `report_execution` | M14 | A single run of a report/export (status, artefact ref, row count) |
| E09 | `analytics_datamart` | M14 | Registry of marts/materialised views (grain, source, refresh policy, freshness) |
| E10 | `datamart_refresh_log` | M14 | ETL/refresh run log per mart (rows, duration, status, watermark) |
| E11 | `rls_scope_policy` | M14 | Maps role + scope rule to row-level filter applied to marts |
| E12 | `alert_rule` | M14 | KPI threshold/target rule that emits alerts |
| E13 | `alert_event` | M14 | A triggered alert occurrence (value, breach, acknowledgement) |
| E14 | `prediction_model` | M14 | Registered predictive model (type, version, features, methodology) |
| E15 | `prediction_result` | M14 | Per-entity predictive score (attrition/retirement/succession risk) |
| E16 | `analytics_access_log` | M14 | View/drill-through/export access ledger (audit of who saw what) |

### 5.2 Full Field Tables (M14-owned entities)

#### E01 `dashboard`

| Field | Type | Null | Notes |
|---|---|---|---|
| `dashboard_id` | UUID PK | N | |
| `dashboard_code` | TEXT unique | N | e.g. `EXEC_WORKFORCE`, `MGR_TEAM` |
| `name` | TEXT | N | display name |
| `description` | TEXT | Y | |
| `target_role` | ENUM | N | EMPLOYEE, MANAGER, HR, DEPT_HEAD, EXECUTIVE, AUDITOR, ANALYTICS_ADMIN |
| `category` | ENUM | N | PERSONAL, WORKFORCE, OPERATIONAL, COMPLIANCE, EXECUTIVE, CUSTOM |
| `layout_json` | JSONB | N | grid/responsive layout definition |
| `default_filters_json` | JSONB | Y | default period/org filters |
| `is_system` | BOOL | N | system template vs user-created |
| `status` | ENUM | N | DRAFT, PUBLISHED, ARCHIVED |
| `published_by` | UUID FK→users | Y | checker |
| `published_at` | TIMESTAMPTZ | Y | |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E02 `dashboard_widget`

| Field | Type | Null | Notes |
|---|---|---|---|
| `widget_id` | UUID PK | N | |
| `dashboard_id` | UUID FK→dashboard | N | |
| `title` | TEXT | N | |
| `widget_type` | ENUM | N | KPI_TILE, LINE, BAR, PIE, DONUT, TABLE, HEATMAP, GAUGE, FUNNEL, MAP, TEXT |
| `kpi_id` | UUID FK→kpi_definition | Y | bound KPI (null for free-table widgets) |
| `query_ref` | UUID FK→saved_report | Y | alternative bound query |
| `dimensions_json` | JSONB | Y | group-by dimensions (org_unit, cadre, gender, period…) |
| `filters_json` | JSONB | Y | widget-level filters |
| `drilldown_path_json` | JSONB | Y | ordered drill hierarchy (e.g. dept→office→employee) |
| `drillthrough_target` | TEXT | Y | owning-module record route template |
| `position_json` | JSONB | N | x/y/w/h on grid |
| `refresh_hint` | ENUM | N | LIVE, MART, CACHED |
| `display_order` | INT | N | |
| audit fields | — | — | |

#### E03 `kpi_definition`

| Field | Type | Null | Notes |
|---|---|---|---|
| `kpi_id` | UUID PK | N | |
| `kpi_code` | TEXT unique | N | e.g. `HEADCOUNT_ACTIVE`, `ATTRITION_RATE`, `VACANCY_PCT` |
| `name` | TEXT | N | |
| `description` | TEXT | N | business definition (audience-readable) |
| `domain` | ENUM | N | WORKFORCE, LEAVE, ATTENDANCE, PAYROLL, TRAINING, APPRAISAL, DISCIPLINARY, TRANSFER, PROMOTION, PENSION, COMPLIANCE, SR |
| `version` | INT | N | versioned definition |
| `source_mart_id` | UUID FK→analytics_datamart | N | mart the KPI reads |
| `expression` | TEXT | N | safe aggregation DSL (e.g. `COUNT(employee_id) WHERE status='ACTIVE'`) |
| `unit` | ENUM | N | COUNT, PERCENT, RATIO, CURRENCY, DAYS, SCORE |
| `grain` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE, PERIOD, ENTERPRISE |
| `default_period` | ENUM | Y | DAY, WEEK, MONTH, QUARTER, YEAR, ROLLING_12M |
| `dimensions_allowed` | TEXT[] | Y | dimensions this KPI may be sliced by |
| `target_value` | NUMERIC(18,4) | Y | governance target |
| `direction` | ENUM | Y | HIGHER_BETTER, LOWER_BETTER, ON_TARGET |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED (PII/financial) |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | checker |
| audit fields | — | — | |

#### E04 `kpi_snapshot`

| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE, MANAGER |
| `scope_id` | TEXT | Y | org_unit_id / cadre / manager employee_id |
| `period_key` | TEXT | N | e.g. `2026-06`, `FY2026_27`, `2026-W26` |
| `value` | NUMERIC(18,4) | N | computed value |
| `numerator` | NUMERIC(18,4) | Y | for ratios/percentages |
| `denominator` | NUMERIC(18,4) | Y | |
| `data_as_of` | TIMESTAMPTZ | N | freshness watermark of source mart |
| `computed_at` | TIMESTAMPTZ | N | when snapshot was computed |
| `is_partial` | BOOL | N | true if computed on stale/partial mart |
| audit fields | — | — | append-style; no soft delete on history |

#### E05 `saved_view`

| Field | Type | Null | Notes |
|---|---|---|---|
| `view_id` | UUID PK | N | |
| `owner_user_id` | UUID FK→users | N | |
| `target_type` | ENUM | N | DASHBOARD, REPORT |
| `target_id` | UUID | N | dashboard_id or saved_report_id |
| `name` | TEXT | N | |
| `filters_json` | JSONB | N | saved filter/slice state |
| `layout_json` | JSONB | Y | personalised layout |
| `is_default` | BOOL | N | user's default view for the target |
| `visibility` | ENUM | N | PRIVATE, SHARED_SCOPE |
| audit fields | — | — | |

#### E06 `saved_report`

| Field | Type | Null | Notes |
|---|---|---|---|
| `report_id` | UUID PK | N | |
| `report_code` | TEXT unique | N | |
| `name` | TEXT | N | |
| `domain` | ENUM | N | (same enum as kpi_definition.domain) |
| `source_mart_id` | UUID FK→analytics_datamart | N | base dataset |
| `select_fields_json` | JSONB | N | chosen columns/measures |
| `filters_json` | JSONB | Y | predicate tree |
| `group_by_json` | JSONB | Y | grouping dimensions |
| `aggregations_json` | JSONB | Y | sum/avg/count/min/max per measure |
| `sort_json` | JSONB | Y | |
| `row_limit` | INT | N | hard cap (≤ configured max, default 100000) |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `owner_user_id` | UUID FK→users | N | |
| `visibility` | ENUM | N | PRIVATE, SHARED_SCOPE, PUBLISHED |
| `status` | ENUM | N | DRAFT, ACTIVE, ARCHIVED |
| audit fields | — | — | |

#### E07 `report_schedule`

| Field | Type | Null | Notes |
|---|---|---|---|
| `schedule_id` | UUID PK | N | |
| `report_id` | UUID FK→saved_report | N | |
| `cron_expr` | TEXT | N | cron schedule (UTC) |
| `timezone` | TEXT | N | delivery tz for human display |
| `format` | ENUM | N | PDF, XLSX, CSV |
| `recipients_json` | JSONB | N | user_ids / role / email groups (validated against RBAC) |
| `burst_dimension` | TEXT | Y | e.g. per `org_unit` produces one file per unit |
| `delivery_channel` | ENUM | N | EMAIL, IN_APP, BOTH, SFTP |
| `next_run_at` | TIMESTAMPTZ | Y | |
| `last_run_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM | N | ACTIVE, PAUSED, DISABLED |
| `owner_user_id` | UUID FK→users | N | |
| audit fields | — | — | |

#### E08 `report_execution`

| Field | Type | Null | Notes |
|---|---|---|---|
| `execution_id` | UUID PK | N | |
| `report_id` | UUID FK→saved_report | N | |
| `schedule_id` | UUID FK→report_schedule | Y | null = on-demand |
| `triggered_by` | UUID FK→users | Y | null = scheduler |
| `run_type` | ENUM | N | ON_DEMAND, SCHEDULED, PREVIEW |
| `format` | ENUM | N | PDF, XLSX, CSV |
| `scope_snapshot_json` | JSONB | N | effective RLS scope at run time |
| `row_count` | INT | Y | |
| `document_id` | UUID FK→documents (M13) | Y | generated artefact |
| `status` | ENUM | N | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED |
| `error_detail` | TEXT | Y | |
| `data_as_of` | TIMESTAMPTZ | Y | freshness at execution |
| `started_at`/`completed_at` | TIMESTAMPTZ | Y | |
| audit fields | — | — | |

#### E09 `analytics_datamart`

| Field | Type | Null | Notes |
|---|---|---|---|
| `mart_id` | UUID PK | N | |
| `mart_code` | TEXT unique | N | e.g. `MART_HEADCOUNT`, `MART_LEAVE_FACT` |
| `name` | TEXT | N | |
| `mart_type` | ENUM | N | FACT, DIMENSION, AGGREGATE, MATERIALIZED_VIEW, SEMANTIC |
| `grain` | TEXT | N | natural grain description |
| `source_modules` | TEXT[] | N | e.g. `{M01,M03,M12}` |
| `source_objects` | TEXT[] | N | source tables/views |
| `refresh_strategy` | ENUM | N | FULL, INCREMENTAL, CDC, ON_DEMAND |
| `refresh_cron` | TEXT | Y | schedule |
| `freshness_sla_minutes` | INT | N | max acceptable staleness |
| `watermark_column` | TEXT | Y | incremental high-water mark |
| `last_refreshed_at` | TIMESTAMPTZ | Y | |
| `last_watermark_value` | TEXT | Y | |
| `row_count` | BIGINT | Y | |
| `health_status` | ENUM | N | HEALTHY, STALE, DEGRADED, FAILED |
| `contains_pii` | BOOL | N | drives RESTRICTED handling |
| audit fields | — | — | |

#### E10 `datamart_refresh_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `refresh_id` | UUID PK | N | |
| `mart_id` | UUID FK→analytics_datamart | N | |
| `run_type` | ENUM | N | SCHEDULED, MANUAL, BACKFILL |
| `started_at`/`finished_at` | TIMESTAMPTZ | N/Y | |
| `rows_read`/`rows_written` | BIGINT | Y | |
| `from_watermark`/`to_watermark` | TEXT | Y | |
| `status` | ENUM | N | RUNNING, SUCCESS, PARTIAL, FAILED |
| `error_detail` | TEXT | Y | |
| `triggered_by` | UUID FK→users | Y | null = scheduler |
| audit fields | — | — | append-only log |

#### E11 `rls_scope_policy`

| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_id` | UUID PK | N | |
| `role` | TEXT | N | RBAC role this policy applies to |
| `scope_type` | ENUM | N | SELF, REPORTING_LINE, ORG_SUBTREE, DELEGATED_UNITS, ENTERPRISE, NONE |
| `mart_id` | UUID FK→analytics_datamart | Y | null = applies to all marts |
| `filter_expression` | TEXT | N | parameterised predicate (e.g. `org_unit_id IN :scoped_units`) |
| `field_mask_json` | JSONB | Y | column-level masking for RESTRICTED fields |
| `priority` | INT | N | resolution order if multiple apply |
| `is_active` | BOOL | N | |
| audit fields | — | — | |

#### E12 `alert_rule`

| Field | Type | Null | Notes |
|---|---|---|---|
| `rule_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `name` | TEXT | N | |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE, MANAGER |
| `scope_id` | TEXT | Y | |
| `operator` | ENUM | N | GT, GTE, LT, LTE, EQ, NEQ, DELTA_PCT |
| `threshold` | NUMERIC(18,4) | N | |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `evaluation_freq` | ENUM | N | ON_REFRESH, HOURLY, DAILY |
| `recipients_json` | JSONB | N | RBAC-validated recipients |
| `suppression_window_min` | INT | Y | de-dupe window |
| `status` | ENUM | N | ACTIVE, PAUSED, DISABLED |
| `owner_user_id` | UUID FK→users | N | |
| audit fields | — | — | |

#### E13 `alert_event`

| Field | Type | Null | Notes |
|---|---|---|---|
| `event_id` | UUID PK | N | |
| `rule_id` | UUID FK→alert_rule | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `scope_id` | TEXT | Y | |
| `observed_value` | NUMERIC(18,4) | N | |
| `threshold` | NUMERIC(18,4) | N | |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `data_as_of` | TIMESTAMPTZ | N | |
| `status` | ENUM | N | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| `acknowledged_by` | UUID FK→users | Y | |
| `acknowledged_at` | TIMESTAMPTZ | Y | |
| `notification_id` | UUID FK→notifications | Y | |
| audit fields | — | — | |

#### E14 `prediction_model`

| Field | Type | Null | Notes |
|---|---|---|---|
| `model_id` | UUID PK | N | |
| `model_code` | TEXT unique | N | e.g. `ATTRITION_RISK`, `RETIREMENT_FORECAST`, `SUCCESSION_RISK` |
| `model_type` | ENUM | N | RULE_BASED, STATISTICAL, ML |
| `version` | TEXT | N | |
| `features_json` | JSONB | N | input features (tenure, age, leave pattern, rating trend…) |
| `methodology` | TEXT | N | explainable description for governance |
| `source_mart_ids` | UUID[] | N | |
| `confidence_basis` | TEXT | Y | how confidence is derived |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | |
| audit fields | — | — | |

#### E15 `prediction_result`

| Field | Type | Null | Notes |
|---|---|---|---|
| `result_id` | UUID PK | N | |
| `model_id` | UUID FK→prediction_model | N | |
| `subject_type` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE |
| `subject_id` | TEXT | N | |
| `score` | NUMERIC(7,4) | N | 0..1 risk/probability |
| `risk_band` | ENUM | N | LOW, MEDIUM, HIGH |
| `top_factors_json` | JSONB | Y | explainability drivers |
| `confidence` | NUMERIC(5,4) | Y | |
| `period_key` | TEXT | N | |
| `data_as_of` | TIMESTAMPTZ | N | |
| audit fields | — | — | |

#### E16 `analytics_access_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `access_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `action` | ENUM | N | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY |
| `target_type` | ENUM | N | DASHBOARD, WIDGET, REPORT, KPI, RECORD |
| `target_id` | TEXT | Y | |
| `scope_snapshot_json` | JSONB | N | effective RLS scope at access time |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `row_count` | INT | Y | rows returned/exported |
| `data_as_of` | TIMESTAMPTZ | Y | |
| `request_id` | TEXT | N | correlation id |
| `occurred_at` | TIMESTAMPTZ | N | |
| (append-only; no soft delete) | — | — | mirrors into shared `audit_log` |

### 5.3 Relationship Map

```
dashboard 1───n dashboard_widget ──n─1 kpi_definition 1───n kpi_snapshot
dashboard_widget ──n─1 saved_report (alt binding)
kpi_definition ──n─1 analytics_datamart 1───n datamart_refresh_log
saved_report ──n─1 analytics_datamart ;  saved_report 1───n report_schedule 1───n report_execution
report_execution ──n─1 documents (M13)
saved_view ──n─1 dashboard | saved_report   (polymorphic target)
rls_scope_policy ──n─1 analytics_datamart (or global)
alert_rule ──n─1 kpi_definition ; alert_rule 1───n alert_event ──n─1 notifications
prediction_model 1───n prediction_result (subject = employee/org_unit/cadre)
every view/run/export/drillthrough ──> analytics_access_log ──> audit_log
marts READ FROM: employees(M01), leave/attendance(M03/M04), transfers(M05), promotions(M06),
   training(M07), appraisal(M08), disciplinary(M09), payroll(M10 locked), pension(M11),
   service_register_events(M12), documents(M13)  [READ-ONLY via mart layer]
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `cadres`, `designations`, `pay_scales` | M01/Platform | M14 (via marts) | — (M14 reads only) |
| Leave/attendance/SR/payroll/training/appraisal/disciplinary/transfer/promotion/pension facts | M03–M12 | M14 (via marts) | — (M14 reads only) |
| `dashboard`, `dashboard_widget`, `kpi_definition`, `kpi_snapshot`, `saved_view`, `saved_report`, `report_schedule`, `report_execution`, `analytics_datamart`, `datamart_refresh_log`, `rls_scope_policy`, `alert_rule`, `alert_event`, `prediction_model`, `prediction_result`, `analytics_access_log` (E01–E16) | M14 | Auditors, all roles (scoped) | M14 |
| `documents` | M13 | M14 (export artefact refs) | M14 (creates refs only) |
| `notifications`, `audit_log` | Platform | M14 | M14 (appends) |
| `service_register_events` | M12 | M14 (verification-status reporting) | — (M14 never writes SR) |

### 5.5 Enum Catalog

| Enum | Values |
|---|---|
| dashboard.target_role | EMPLOYEE, MANAGER, HR, DEPT_HEAD, EXECUTIVE, AUDITOR, ANALYTICS_ADMIN |
| dashboard.category | PERSONAL, WORKFORCE, OPERATIONAL, COMPLIANCE, EXECUTIVE, CUSTOM |
| dashboard.status / saved_report.status | DRAFT, PUBLISHED/ACTIVE, ARCHIVED |
| widget.widget_type | KPI_TILE, LINE, BAR, PIE, DONUT, TABLE, HEATMAP, GAUGE, FUNNEL, MAP, TEXT |
| widget.refresh_hint | LIVE, MART, CACHED |
| kpi.domain / report.domain | WORKFORCE, LEAVE, ATTENDANCE, PAYROLL, TRAINING, APPRAISAL, DISCIPLINARY, TRANSFER, PROMOTION, PENSION, COMPLIANCE, SR |
| kpi.unit | COUNT, PERCENT, RATIO, CURRENCY, DAYS, SCORE |
| kpi.grain | EMPLOYEE, ORG_UNIT, CADRE, PERIOD, ENTERPRISE |
| kpi.direction | HIGHER_BETTER, LOWER_BETTER, ON_TARGET |
| sensitivity | PUBLIC, INTERNAL, RESTRICTED |
| kpi.status / model.status | DRAFT, ACTIVE, RETIRED |
| period | DAY, WEEK, MONTH, QUARTER, YEAR, ROLLING_12M |
| mart.mart_type | FACT, DIMENSION, AGGREGATE, MATERIALIZED_VIEW, SEMANTIC |
| mart.refresh_strategy | FULL, INCREMENTAL, CDC, ON_DEMAND |
| mart.health_status | HEALTHY, STALE, DEGRADED, FAILED |
| refresh.status | RUNNING, SUCCESS, PARTIAL, FAILED |
| rls.scope_type | SELF, REPORTING_LINE, ORG_SUBTREE, DELEGATED_UNITS, ENTERPRISE, NONE |
| report_schedule.format | PDF, XLSX, CSV |
| report_schedule.delivery_channel | EMAIL, IN_APP, BOTH, SFTP |
| report_schedule.status | ACTIVE, PAUSED, DISABLED |
| report_execution.run_type | ON_DEMAND, SCHEDULED, PREVIEW |
| report_execution.status | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED |
| alert_rule.operator | GT, GTE, LT, LTE, EQ, NEQ, DELTA_PCT |
| alert.severity | INFO, WARNING, CRITICAL |
| alert_event.status | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| prediction.model_type | RULE_BASED, STATISTICAL, ML |
| prediction.risk_band | LOW, MEDIUM, HIGH |
| access_log.action | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY |
| view.visibility / report.visibility | PRIVATE, SHARED_SCOPE, PUBLISHED |

### 5.6 Data Integrity Rules

1. **Governed metrics only:** every `dashboard_widget` of type `KPI_TILE/GAUGE` and every chart bound to a measure must reference an `ACTIVE kpi_definition` (`kpi_id NOT NULL`) or a `saved_report`; inline ad-hoc formulae are rejected at publish.
2. **Single active KPI version:** at most one `ACTIVE` `kpi_definition` per `kpi_code`; activating a new version RETIRES the prior (no overlapping ACTIVE).
3. **RLS is mandatory:** no analytics query executes without an applied `rls_scope_policy`; a query with unresolved scope returns 403 `RLS_SCOPE_UNRESOLVED`, never an unfiltered result.
4. **Read-only source:** M14 holds **no foreign key write** into M01–M13 tables; marts are read replicas/derived; drill-through is read-only navigation.
5. **Freshness honesty:** every `kpi_snapshot`, `report_execution`, and rendered widget carries a `data_as_of`; if the source mart `health_status ∈ {STALE,DEGRADED,FAILED}`, results are flagged `is_partial=true` and the UI shows a staleness badge.
6. **Snapshot reproducibility:** `kpi_snapshot.value` for a `(kpi_id, scope, period_key, data_as_of)` is deterministic — recomputation on the same mart watermark yields the same value.
7. **Export lineage:** every `report_execution` with `status=COMPLETED` has a `document_id` (M13) and a matching `analytics_access_log` EXPORT row with `row_count`.
8. **Sensitivity gating:** a `RESTRICTED` KPI/report/mart field cannot be rendered or exported to a role whose `rls_scope_policy.field_mask_json` masks it; masked fields are excluded, not nulled-in-place silently (export header notes masking).
9. **Recipient validity:** `report_schedule.recipients_json` and `alert_rule.recipients_json` are validated against current RBAC + scope at run time; an out-of-scope recipient is dropped and logged, never sent restricted data.
10. **SoD on publication:** `kpi_definition.approved_by ≠ created_by`; `dashboard.published_by ≠ created_by` for COMPLIANCE/EXECUTIVE categories.
11. **Reconciliation tolerance:** for reconcilable KPIs (e.g. `HEADCOUNT_ACTIVE`), the mart value must reconcile to the owning module's count within configured tolerance (default 0 for counts); variance beyond tolerance flags the mart DEGRADED and raises an alert.
12. **Append-only audit:** `analytics_access_log`, `datamart_refresh_log`, and `kpi_snapshot` history are append-only (no UPDATE/soft-delete of past rows).
13. **Prediction labelling:** every `prediction_result` exposed in UI/exports is labelled advisory with `model_id`, `version`, `confidence`, and `data_as_of`; predictions are never written back to source modules.
14. **Bounded outputs:** all list/report endpoints are paginated (max page 100) and reports respect `row_limit`; an export exceeding the cap is chunked or rejected with `EXPORT_ROW_LIMIT_EXCEEDED`.

### 5.7 Sample Data (2-3 rows per key entity)

**dashboard**

| dashboard_code | name | target_role | category | status |
|---|---|---|---|---|
| EXEC_WORKFORCE | Executive Workforce Overview | EXECUTIVE | EXECUTIVE | PUBLISHED |
| MGR_TEAM | My Team Dashboard | MANAGER | OPERATIONAL | PUBLISHED |
| COMP_RESERVATION | Reservation Roster Compliance | DEPT_HEAD | COMPLIANCE | PUBLISHED |

**dashboard_widget** (for EXEC_WORKFORCE)

| title | widget_type | kpi_code (bound) | dimensions | refresh_hint |
|---|---|---|---|---|
| Active Headcount | KPI_TILE | HEADCOUNT_ACTIVE | org_unit | MART |
| Attrition Trend (12M) | LINE | ATTRITION_RATE | period | MART |
| Vacancy: Sanctioned vs Filled | BAR | VACANCY_PCT | cadre | MART |
| Retirement Profile (5Y) | HEATMAP | RETIREMENT_DUE_COUNT | age_band, cadre | CACHED |

**kpi_definition**

| kpi_code | name | domain | unit | grain | direction | sensitivity | status |
|---|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | Active Headcount | WORKFORCE | COUNT | ORG_UNIT | ON_TARGET | INTERNAL | ACTIVE |
| ATTRITION_RATE | Attrition Rate (rolling 12M) | WORKFORCE | PERCENT | ORG_UNIT | LOWER_BETTER | INTERNAL | ACTIVE |
| VACANCY_PCT | Vacancy % (sanctioned vs filled) | WORKFORCE | PERCENT | CADRE | LOWER_BETTER | INTERNAL | ACTIVE |
| MANDATORY_TRAINING_PCT | Mandatory Training Completion | COMPLIANCE | PERCENT | ORG_UNIT | HIGHER_BETTER | INTERNAL | ACTIVE |

**kpi_snapshot**

| kpi_code | scope_type | scope_id | period_key | value | data_as_of | is_partial |
|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | ORG_UNIT | OU-DIST-12 | 2026-06 | 1842 | 2026-06-30T02:00Z | false |
| ATTRITION_RATE | ENTERPRISE | — | 2026-06 | 4.7 | 2026-06-30T02:00Z | false |
| VACANCY_PCT | CADRE | GROUP_A | 2026-06 | 12.3 | 2026-06-29T20:00Z | true |

**analytics_datamart**

| mart_code | mart_type | grain | source_modules | refresh_strategy | freshness_sla_minutes | health_status |
|---|---|---|---|---|---|---|
| MART_HEADCOUNT | AGGREGATE | employee×org_unit×period | {M01} | INCREMENTAL | 60 | HEALTHY |
| MART_LEAVE_FACT | FACT | leave_application | {M03,M04} | CDC | 30 | HEALTHY |
| MART_PAYROLL_COST | AGGREGATE | org_unit×component×period | {M10} | INCREMENTAL | 1440 | STALE |

**saved_report**

| report_code | name | domain | source_mart | visibility | status |
|---|---|---|---|---|---|
| RPT_VACANCY_DISTRICT | District Vacancy by Cadre | WORKFORCE | MART_HEADCOUNT | SHARED_SCOPE | ACTIVE |
| RPT_LWP_ABSENTEEISM | LWP & Absenteeism by Office | LEAVE | MART_LEAVE_FACT | PUBLISHED | ACTIVE |

**report_schedule**

| report_code | cron_expr | format | delivery_channel | burst_dimension | status |
|---|---|---|---|---|---|
| RPT_VACANCY_DISTRICT | 0 3 1 * * | XLSX | EMAIL | org_unit | ACTIVE |
| RPT_LWP_ABSENTEEISM | 0 4 * * 1 | PDF | BOTH | — | ACTIVE |

**alert_rule / alert_event**

| rule name | kpi_code | operator | threshold | severity | event status |
|---|---|---|---|---|---|
| Attrition spike (Dist-12) | ATTRITION_RATE | GT | 8.0 | WARNING | OPEN |
| SLA breach backlog | PENDING_SLA_BREACH | GTE | 25 | CRITICAL | ACKNOWLEDGED |

**prediction_result**

| model_code | subject_type | subject_id | score | risk_band | confidence | period_key |
|---|---|---|---|---|---|---|
| ATTRITION_RISK | EMPLOYEE | e-1001 | 0.7820 | HIGH | 0.74 | 2026-06 |
| RETIREMENT_FORECAST | ORG_UNIT | OU-DIST-12 | 0.1500 | LOW | 0.90 | FY2026_27 |

**rls_scope_policy**

| role | scope_type | mart_id | filter_expression | priority |
|---|---|---|---|---|
| MANAGER | REPORTING_LINE | (all) | `employee_id IN :reporting_subtree` | 10 |
| HR_OFFICER | DELEGATED_UNITS | (all) | `org_unit_id IN :delegated_units` | 20 |
| EXECUTIVE | ENTERPRISE | (all) | `TRUE` | 90 |
| EMPLOYEE | SELF | (all) | `employee_id = :self_id` | 5 |

---

## 6. Functional Requirements

### FR-M14-01 — Role-Based Dashboard Framework & Layout Engine

- **Module:** M14-F01
- **Primary Role(s):** Analytics Administrator (build/publish), All roles (consume, scoped)
- **User Story:** As an Analytics Administrator, I want to compose role-targeted dashboards from a widget catalog and publish them, so that each persona (employee, manager, HR, department head, executive, auditor) lands on a relevant, governed, permission-scoped home view.
- **Description:** Provides a dashboard authoring and rendering engine. A `dashboard` is a responsive grid of `dashboard_widget`s; each widget binds to a governed KPI or a saved report. Dashboards are role-targeted and category-tagged; users personalise via `saved_view` (filters/layout) without altering the published template. Publication of COMPLIANCE/EXECUTIVE dashboards is maker-checker. Rendering always applies RLS (FR-M14-04) and freshness (FR-M14-12).
- **Acceptance Criteria:**
  - AC1: An admin can create a dashboard, add widgets from the catalog, arrange them on a responsive grid, and save as DRAFT.
  - AC2: Publishing a COMPLIANCE or EXECUTIVE dashboard requires a checker (`published_by ≠ created_by`); other categories may self-publish within authority.
  - AC3: A consuming user sees only widgets they are permitted to view; unauthorised widgets are omitted (not shown empty).
  - AC4: A user can save a personal `saved_view` (filters + layout) and set it default without modifying the template.
  - AC5: Each rendered dashboard shows a global `data_as_of` and per-widget freshness state.
  - AC6: Every dashboard view writes an `analytics_access_log` (VIEW_DASHBOARD) entry.
- **Business Rules:**
  - BR1: A widget bound to a measure must reference an ACTIVE `kpi_definition` or `saved_report`; orphaned bindings block publication.
  - BR2: A dashboard cannot be published if any bound KPI is RETIRED/DRAFT.
  - BR3: Personalisation is per-user; a user cannot change another user's default view.
  - BR4: Archiving a dashboard preserves its `saved_view`s read-only for audit.
- **Data Model References:**

| Entity | Use |
|---|---|
| `dashboard`, `dashboard_widget` | compose/render |
| `kpi_definition`, `saved_report` | widget bindings |
| `saved_view` | personalisation |
| `analytics_access_log`, `audit_log` | view + config audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/dashboards` | create dashboard |
| POST | `/api/v1/analytics/dashboards/{id}/widgets` | add widget |
| POST | `/api/v1/analytics/dashboards/{id}:publish` | publish (checker) |
| GET | `/api/v1/analytics/dashboards/{id}/render` | render scoped data |
| POST | `/api/v1/analytics/saved-views` | save personal view |

- **UI Behavior Notes:** Drag-and-drop grid editor with widget palette; live preview against a sample/own scope; responsive breakpoints (desktop/tablet/mobile); per-widget freshness badge; "Save as my view" and "Set default". Publish button disabled for makers on gated categories.
- **Edge Cases:** Bound KPI retired after publish (widget shows "metric retired" placeholder + alerts steward); user with no scope for any widget sees an explanatory empty state; very wide dashboards lazy-load below the fold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DashboardController`, `WidgetCatalogService`, `DashboardRenderer`, `SavedViewService`, `LayoutValidator` |
| Backend Flow | Validate layout/bindings → persist DRAFT → on publish run SoD + binding-active checks in a transaction → on render, resolve RLS scope, fan-out widget queries to marts, attach freshness, assemble payload |
| Data Operations | INSERT/UPDATE dashboard/widget; INSERT saved_view; SELECT from marts (RLS-filtered); INSERT access_log |
| Validation | Binding existence/active; layout schema; category publish authority; unique dashboard_code |
| Authorization | Analytics Admin author; checker publish; consumer scoped render |
| State Changes & Side Effects | dashboard.status DRAFT→PUBLISHED→ARCHIVED; access_log + audit_log writes; widget cache warm |
| Failure Handling | Orphan binding → 409 `WIDGET_BINDING_INVALID`; maker publish gated → 403 `PUBLISH_REQUIRES_CHECKER`; mart down → widget degraded per FR-12 |
| Dependencies | FR-02 (KPI), FR-04 (RLS), FR-12 (freshness) |
| Test Guidance | Publish SoD; scope-omits-widget; saved-view isolation; freshness badge render |

---

### FR-M14-02 — KPI Definition & Calculation Engine

- **Module:** M14-F02
- **Primary Role(s):** Analytics Administrator (define), Analytics Administrator/steward (approve)
- **User Story:** As an Analytics Administrator, I want to define KPIs once — formula, grain, allowed dimensions, target, sensitivity — with versioning and approval, so that every dashboard and report computes the same number the same way.
- **Description:** Maintains the `kpi_definition` registry and a deterministic calculation engine. A KPI declares a `source_mart_id`, a safe aggregation `expression` (whitelisted functions/columns), unit, grain, allowed dimensions, and an optional governance target/direction/sensitivity. The engine computes values on demand and materialises `kpi_snapshot` rows per scope/period for trends and freshness. Definitions are versioned; activation retires the prior version. Publication is maker-checker.
- **Acceptance Criteria:**
  - AC1: A KPI can be created with expression, grain, unit, allowed dimensions, and sensitivity in DRAFT.
  - AC2: An expression referencing an unknown mart column or disallowed function is rejected with precise location.
  - AC3: Activating a new version sets the prior ACTIVE version to RETIRED; no two ACTIVE versions share a `kpi_code`.
  - AC4: Computing a KPI for a scope/period writes a reproducible `kpi_snapshot` with `data_as_of` and `is_partial`.
  - AC5: A KPI cannot slice by a dimension not in `dimensions_allowed`.
  - AC6: Activation requires `approved_by ≠ created_by`.
- **Business Rules:**
  - BR1: A KPI referenced by any published widget/report cannot be deleted; only RETIRED.
  - BR2: RESTRICTED KPIs inherit field masking from RLS; they cannot be embedded in PUBLIC dashboards.
  - BR3: Reconcilable KPIs declare a reconciliation target module/object; variance > tolerance flags the mart DEGRADED.
  - BR4: Snapshots are computed only on marts with `health_status ∈ {HEALTHY,STALE}`; FAILED marts yield no snapshot.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_definition` | registry + versions |
| `kpi_snapshot` | computed time-series |
| `analytics_datamart` | source + freshness |
| `audit_log` | config audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/kpis` | create KPI version |
| POST | `/api/v1/analytics/kpis/{id}:activate` | activate (checker) |
| GET | `/api/v1/analytics/kpis/{code}/value?scope=&period=` | compute/resolve value |
| GET | `/api/v1/analytics/kpis/{code}/trend?from=&to=` | snapshot trend |

- **UI Behavior Notes:** KPI editor with expression linting, "test against mart sample" trace, dimension picker, target/direction config, sensitivity selector, version timeline. Activate disabled for makers.
- **Edge Cases:** Division by zero in ratio KPI (returns null with reason, not error); dimension allowed but absent in mart row (grouped as "Unknown"); retroactive mart backfill triggers snapshot recompute job.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `KpiController`, `AggregationParser`, `KpiCalcEngine`, `SnapshotMaterializer`, `KpiVersionService` |
| Backend Flow | Parse expression to whitelisted AST → static-check mart columns/dimensions → persist DRAFT → on activate close prior version transactionally → on value request, compile to RLS-wrapped SQL against mart, compute, write snapshot |
| Data Operations | INSERT kpi/version; UPDATE prior version RETIRED; INSERT kpi_snapshot (append) |
| Validation | Whitelist tokens; column/dimension existence; non-overlap of ACTIVE; SoD |
| Authorization | Analytics Admin define; checker activate; Auditor read |
| State Changes & Side Effects | kpi.status DRAFT→ACTIVE→RETIRED; snapshot rows; cache invalidation; reconciliation check |
| Failure Handling | Bad expression → 400 `KPI_EXPRESSION_INVALID`; overlap → 409 `KPI_VERSION_OVERLAP`; FAILED mart → 503 `MART_UNAVAILABLE` |
| Dependencies | FR-03 (marts), FR-04 (RLS) |
| Test Guidance | Parser whitelist; determinism of snapshot; ACTIVE non-overlap; reconciliation tolerance |

---

### FR-M14-03 — Analytics Data Layer (Semantic Model, Data Marts & ETL Refresh)

- **Module:** M14-F03
- **Primary Role(s):** Data Engineer (operate), Analytics Administrator (model), System Administrator (config)
- **User Story:** As a Data Engineer, I want governed data marts and materialised views refreshed on a schedule with watermarks and health tracking, so that dashboards read fast, consistent, permission-scoped data without hammering the OLTP modules.
- **Description:** Defines and operates the analytics layer: a `analytics_datamart` registry (fact/dimension/aggregate/materialised-view/semantic), each with grain, source modules/objects, refresh strategy (FULL/INCREMENTAL/CDC/ON_DEMAND), freshness SLA, and watermark. The ETL pipeline refreshes marts on `refresh_cron`, logs each run to `datamart_refresh_log`, advances watermarks, recomputes affected `kpi_snapshot`s, and updates `health_status`. A semantic layer maps friendly names/dimensions to physical mart columns for the report builder and NL query.
- **Acceptance Criteria:**
  - AC1: A mart can be registered with grain, sources, refresh strategy, cron, and freshness SLA.
  - AC2: A scheduled refresh runs incrementally from the last watermark and records rows read/written, duration, and new watermark.
  - AC3: If `now − last_refreshed_at > freshness_sla_minutes`, the mart is marked STALE and dependent surfaces show staleness.
  - AC4: A failed refresh marks the mart FAILED, retains the last good data, logs the error, and raises an alert.
  - AC5: A successful refresh that changes a reconcilable count beyond tolerance marks the mart DEGRADED and alerts.
  - AC6: A Data Engineer can trigger a manual/backfill refresh; it is logged with `run_type`.
- **Business Rules:**
  - BR1: Marts read source modules **read-only**; M14 holds no write FK into M01–M13.
  - BR2: PII-bearing marts (`contains_pii=true`) are RESTRICTED and field-masked per RLS.
  - BR3: A mart cannot serve dashboards while `health_status=FAILED`; consumers fall back to the last good snapshot with a clear stale flag (FR-12).
  - BR4: Incremental refresh is idempotent; re-running with the same watermark produces no duplicates.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` | registry/freshness |
| `datamart_refresh_log` | run history |
| `kpi_snapshot` | recompute targets |
| `audit_log` | config + manual-run audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/marts` | register mart |
| POST | `/api/v1/analytics/marts/{id}:refresh` | trigger refresh (manual/backfill) |
| GET | `/api/v1/analytics/marts/{id}/health` | freshness/health |
| GET | `/api/v1/analytics/marts/{id}/refresh-log` | run history (paginated) |

- **UI Behavior Notes:** Data Engineer console listing marts with health chips (HEALTHY/STALE/DEGRADED/FAILED), last refresh, watermark, next run; manual refresh/backfill controls; refresh-log timeline with error detail; reconciliation variance panel.
- **Edge Cases:** Source module schema change breaks ETL (refresh FAILED, alert, last good retained); CDC stream gap (watermark stall detected, marked STALE); concurrent manual + scheduled refresh (second is queued, not duplicated).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MartRegistryController`, `EtlOrchestrator`, `IncrementalLoader`, `MaterializedViewRefresher`, `FreshnessMonitor`, `ReconciliationChecker` |
| Backend Flow | On cron/manual → acquire mart lock → read from watermark → upsert mart rows idempotently → advance watermark → recompute affected snapshots → run reconciliation → update health → write refresh_log |
| Data Operations | UPSERT mart rows; INSERT refresh_log; UPDATE mart watermark/health; recompute snapshots |
| Validation | Idempotency key on watermark; grain uniqueness; source read-only assertion |
| Authorization | Data Engineer operate; Analytics Admin model; Sys Admin config; Auditor read status |
| State Changes & Side Effects | mart.health_status transitions; refresh_log append; snapshot recompute; alert on FAILED/DEGRADED |
| Failure Handling | ETL error → mart FAILED + 500 `MART_REFRESH_FAILED` + retain last good; lock contention → 409 `MART_REFRESH_IN_PROGRESS` |
| Dependencies | Source modules M01–M13 (read); FR-02 snapshots; FR-11 alerts |
| Test Guidance | Idempotent incremental load; stale/SLA detection; reconciliation variance; last-good fallback |

---

### FR-M14-04 — Row-Level Security & Permission-Scoped Data Access

- **Module:** M14-F04
- **Primary Role(s):** System Administrator (policy), All roles (enforced)
- **User Story:** As a System Administrator, I want row-level security policies that mirror operational RBAC and the org-unit hierarchy, so that every dashboard, report, query, and export returns only the data the requesting user is entitled to — with no leakage.
- **Description:** Defines `rls_scope_policy` rows mapping each role to a scope type (SELF, REPORTING_LINE, ORG_SUBTREE, DELEGATED_UNITS, ENTERPRISE, NONE) and a parameterised filter expression, plus optional column-level masking for RESTRICTED fields. On each request, the engine resolves the user's effective scope (reporting subtree from M01, delegated units, role) and injects the filter into every mart query. Scope is re-derived per session; it is never cached beyond the org-hierarchy TTL. RLS is non-bypassable: a query without a resolved policy is denied.
- **Acceptance Criteria:**
  - AC1: A manager's dashboard/report returns only direct+indirect reports; an employee from outside the subtree never appears.
  - AC2: An HR officer sees only delegated org units; querying outside scope returns rows filtered out (not 403 on the dashboard, but empty/omitted).
  - AC3: A RESTRICTED field (e.g. salary) is masked/excluded for roles without field access; export header notes masking.
  - AC4: A request with no applicable policy returns 403 `RLS_SCOPE_UNRESOLVED` and is logged.
  - AC5: Scope resolution reflects org-hierarchy changes within the configured TTL (default 15 min).
  - AC6: An automated scope-leak test proves no role returns a record outside its scope across all marts.
- **Business Rules:**
  - BR1: Effective dataset = intersection of capability grant (RBAC) and data scope (RLS); neither overrides the other.
  - BR2: ENTERPRISE scope is restricted to Executive/Auditor/Analytics Admin per policy.
  - BR3: Auditor has read-all scope but inherits field masking unless explicitly granted (audit read of RESTRICTED requires explicit policy).
  - BR4: Embedded-BI and API queries (FR-15) carry the same RLS; tokens are scoped, not bypass keys.
- **Data Model References:**

| Entity | Use |
|---|---|
| `rls_scope_policy` | role→scope mapping |
| `org_units`, `employees` (M01 ref) | scope resolution |
| `roles`/`permissions` (ref) | capability grant |
| `analytics_access_log` | scope snapshot per access |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/rls-policies` | create/update policy |
| GET | `/api/v1/analytics/rls-policies/resolve` | resolve my effective scope (debug/self) |
| GET | `/api/v1/analytics/rls-policies` | list policies |

- **UI Behavior Notes:** Admin policy editor mapping roles to scope types with live "preview as role/user" showing the resolved filter and a sample row count; masking configuration per RESTRICTED field; warning when a policy would broaden enterprise access.
- **Edge Cases:** User with multiple roles (highest-priority scope wins by `priority`); manager with a vacant position/no reports (empty scope, explanatory state); delegated units changed mid-session (re-resolved at TTL).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RlsPolicyController`, `ScopeResolver`, `QueryRewriter`, `FieldMaskService` |
| Backend Flow | On request → load user roles → resolve scope params (subtree/delegated units) → select highest-priority policy per mart → rewrite query with injected predicate + masks → execute → snapshot scope to access_log |
| Data Operations | SELECT policies; SELECT org subtree (cached, TTL); no writes to source |
| Validation | Policy existence; parameter resolvability; mask config validity |
| Authorization | Sys Admin manage; everyone enforced; Auditor read policies |
| State Changes & Side Effects | No data mutation; access_log scope snapshot on every query |
| Failure Handling | Unresolved scope → 403 `RLS_SCOPE_UNRESOLVED`; missing subtree data → 503 `SCOPE_SOURCE_UNAVAILABLE` |
| Dependencies | M01 org hierarchy; FR-02/03/08 (all queries) |
| Test Guidance | Cross-role scope-leak matrix; multi-role priority; field masking on export; TTL re-resolution |

---

### FR-M14-05 — Workforce Analytics (Headcount, Demographics, Diversity, Attrition, Vacancy, Cadre, Retirement, Span of Control)

- **Module:** M14-F05
- **Primary Role(s):** HR Officer, Department Head, Executive
- **User Story:** As a Department Head, I want workforce analytics — headcount, demographics, diversity, attrition, sanctioned-vs-filled vacancy, cadre distribution, age/retirement profile and succession risk, span of control — so that I can plan establishment, recruitment, and succession with accurate, scoped numbers.
- **Description:** Delivers the core workforce KPI suite over `MART_HEADCOUNT` and related dimensions: active/total headcount by org_unit/cadre/designation; demographics (age, gender, tenure bands); diversity & reservation-category composition; attrition (rolling and period, joiners/leavers); **vacancy = sanctioned strength − filled** by cadre/post; cadre distribution; **age/retirement profile** (retirement-due counts over a horizon) feeding succession risk; **span of control** (reports per manager). All KPIs are governed (FR-02) and scoped (FR-04).
- **Acceptance Criteria:**
  - AC1: Headcount tiles show active count by scope with drill-down org_unit→office→designation.
  - AC2: Attrition rate computes leavers/average headcount over the selected window, separating retirements/resignations/terminations.
  - AC3: Vacancy view shows sanctioned vs filled vs vacant by cadre with vacancy %.
  - AC4: Retirement profile lists counts retiring within 1/3/5 years by cadre, drillable to (permitted) individuals.
  - AC5: Span-of-control highlights managers exceeding configurable thresholds (too wide/too narrow).
  - AC6: Diversity composition shows reservation-category and gender mix vs roster targets.
- **Business Rules:**
  - BR1: Sanctioned strength comes from establishment reference data; filled = active employees mapped to sanctioned posts.
  - BR2: Retirement age/date uses canonical M01 DOB + cadre retirement rules; M14 does not redefine retirement age.
  - BR3: Attrition excludes internal transfers (M05) — a transfer is not a leaver.
  - BR4: Demographic individual-level drill-through is RLS-gated and audited.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` (MART_HEADCOUNT, dimensions) | source |
| `kpi_definition`/`kpi_snapshot` | governed metrics/trends |
| `employees`,`org_units`,`cadres`,`designations` (ref) | grain/dimensions |
| `prediction_result` | succession/retirement risk overlay |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/workforce/headcount` | headcount by scope/dimension |
| GET | `/api/v1/analytics/workforce/attrition` | attrition metrics |
| GET | `/api/v1/analytics/workforce/vacancy` | sanctioned vs filled |
| GET | `/api/v1/analytics/workforce/retirement-profile` | retirement horizon |
| GET | `/api/v1/analytics/workforce/span-of-control` | reports per manager |

- **UI Behavior Notes:** Workforce dashboard with KPI tiles, attrition trend line, vacancy bar (sanctioned/filled/vacant), retirement heatmap by age band×cadre, span-of-control table with threshold flags, diversity donut vs target; all drillable; freshness badge per tile.
- **Edge Cases:** Employee on long suspension (counted per policy flag, configurable); post with sanctioned strength but no mapping (flagged data-quality); manager change mid-period (span computed as-of date).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `WorkforceAnalyticsController`, `HeadcountService`, `AttritionService`, `VacancyService`, `RetirementProfiler`, `SpanCalculator` |
| Backend Flow | Resolve RLS scope → query MART_HEADCOUNT + dimensions → compute governed KPIs/snapshots → join prediction overlays → assemble response with freshness |
| Data Operations | SELECT from marts (RLS-filtered); read sanctioned-strength reference; no writes |
| Validation | Dimension allowed; window validity; sanctioned-vs-filled integrity |
| Authorization | HR/Dept Head/Exec scoped; Employee excluded from aggregates |
| State Changes & Side Effects | snapshot writes; access_log on drill-through |
| Failure Handling | Stale mart → partial flag; missing sanctioned data → `VACANCY_REFERENCE_MISSING` warning (200 with notice) |
| Dependencies | FR-02, FR-03, FR-04, FR-10 (drill), FR-13 (predictive) |
| Test Guidance | Attrition excludes transfers; vacancy math; retirement horizon boundaries; span thresholds |

---

### FR-M14-06 — Operational Analytics by Module

- **Module:** M14-F06
- **Primary Role(s):** HR Officer, Reporting Manager, Department Head
- **User Story:** As an HR Officer, I want per-module operational analytics — leave/absenteeism, attendance, payroll cost & overtime, training coverage & skill gaps, appraisal rating distribution, disciplinary case aging, transfer/promotion pipeline, pension forecasting — so that I can monitor operations and act on outliers within my scope.
- **Description:** A family of domain dashboards reading domain marts: **Leave** (trends, absenteeism rate, LWP, balance liability — from M03/M04); **Attendance** (presence, late, biometric exceptions — M03); **Payroll** (cost by org/component, overtime, cost trend — from M10 **locked** snapshots); **Training** (coverage %, mandatory completion, skill-gap heatmap — M07); **Appraisal** (rating distribution, calibration spread, pending — M08); **Disciplinary** (open cases, aging buckets, penalty mix — M09); **Transfer/Promotion** (pipeline stages, ageing, throughput — M05/M06); **Pension** (upcoming retirements, forecast liability — M11). Each is governed and scoped.
- **Acceptance Criteria:**
  - AC1: Leave dashboard shows absenteeism rate and LWP days by office with trend, drillable to employee (scoped).
  - AC2: Payroll cost analytics read only LOCKED payroll snapshots; in-progress runs are excluded.
  - AC3: Training dashboard shows mandatory-training completion % and a skill-gap heatmap by competency×org_unit.
  - AC4: Appraisal dashboard shows rating distribution and flags calibration outliers; never exposes individual ratings to unauthorised roles.
  - AC5: Disciplinary dashboard shows case-aging buckets (0-30/31-90/90+ days) without exposing case detail beyond permission.
  - AC6: Transfer/promotion pipeline shows funnel by stage with ageing and SLA.
- **Business Rules:**
  - BR1: Each operational KPI maps to a single owning module mart; M14 never recomputes domain business rules, only aggregates published facts.
  - BR2: Sensitive domains (payroll, disciplinary, appraisal) are RESTRICTED; field masking and drill-through gating apply.
  - BR3: Pension forecast figures are sourced from M11 outputs; M14 visualises, it does not compute terminal benefits.
  - BR4: Overtime analytics require attendance + payroll alignment; mismatched periods are flagged, not silently merged.
- **Data Model References:**

| Entity | Use |
|---|---|
| Domain marts (LEAVE/ATTENDANCE/PAYROLL/TRAINING/APPRAISAL/DISCIPLINARY/TRANSFER/PROMOTION/PENSION) | sources |
| `kpi_definition`/`kpi_snapshot` | governed metrics |
| `analytics_access_log` | drill-through audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/operational/leave` | leave/absenteeism |
| GET | `/api/v1/analytics/operational/payroll-cost` | cost & overtime (locked) |
| GET | `/api/v1/analytics/operational/training` | coverage & skill gaps |
| GET | `/api/v1/analytics/operational/appraisal` | rating distribution |
| GET | `/api/v1/analytics/operational/disciplinary` | case aging |
| GET | `/api/v1/analytics/operational/pipeline` | transfer/promotion funnel |
| GET | `/api/v1/analytics/operational/pension-forecast` | retirement/forecast |

- **UI Behavior Notes:** Tabbed operational suite, one tab per domain; each with KPI tiles + a primary chart (trend/heatmap/funnel) + an outlier table; RESTRICTED tabs visible only to authorised roles; freshness per domain mart (payroll daily, leave near-real-time).
- **Edge Cases:** Payroll mart stale (cost tab shows last locked period with stale badge); training competency added mid-period (skill-gap recomputed); disciplinary case sealed/confidential (excluded from aggregates per M09 flag).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OperationalAnalyticsController`, domain services (`LeaveAnalytics`,`PayrollCostAnalytics`,`TrainingAnalytics`,…), `OutlierDetector` |
| Backend Flow | Resolve scope → select domain mart → compute governed KPIs → apply sensitivity masking → assemble tab payload with freshness |
| Data Operations | SELECT domain marts (RLS + locked-only for payroll); no writes |
| Validation | Domain-period alignment; mart health; sensitivity gating |
| Authorization | Role+scope per domain; RESTRICTED domains gated |
| State Changes & Side Effects | snapshot writes; access_log on RESTRICTED drill-through |
| Failure Handling | Mart stale → partial; locked snapshot missing → `PAYROLL_SNAPSHOT_UNAVAILABLE` notice |
| Dependencies | M03–M11 marts; FR-02/03/04/10 |
| Test Guidance | Payroll locked-only; appraisal masking; case-aging buckets; pipeline funnel math |

---

### FR-M14-07 — Compliance & Statutory Dashboards

- **Module:** M14-F07
- **Primary Role(s):** HR Officer, Department Head, Executive, Auditor
- **User Story:** As a Department Head, I want compliance & statutory dashboards — reservation roster compliance, mandatory-training status, SR verification status, pending approvals & SLA breaches — so that I can demonstrate statutory compliance and clear backlogs before they become audit findings.
- **Description:** Statutory-grade dashboards: **Reservation Roster Compliance** (sanctioned vs filled by reservation category vs roster points, backlog vacancies); **Mandatory Training** (completion % vs mandate, overdue list); **SR Verification Status** (employees with verified/pending/overdue Digital SR — read from M12); **Pending Approvals & SLA Breaches** (workflow tasks across modules aging past SLA). Designed for audit export with as-of timestamps and methodology notes.
- **Acceptance Criteria:**
  - AC1: Reservation dashboard shows category-wise sanctioned/filled/backlog and a roster-point compliance indicator.
  - AC2: Mandatory-training dashboard lists overdue employees by mandate with completion %.
  - AC3: SR verification dashboard shows verified/pending/overdue counts sourced from M12 (read-only) with drill to (permitted) employee SR status.
  - AC4: SLA dashboard aggregates pending `workflow_tasks` across modules into aging buckets with breach flags.
  - AC5: Every compliance view exports to PDF/Excel with `data_as_of`, scope, and methodology footnote (FR-09).
  - AC6: Auditor can view all compliance dashboards and the access log.
- **Business Rules:**
  - BR1: Reservation category rules and roster points use canonical reference data; M14 reports compliance, it does not adjudicate roster decisions.
  - BR2: SR verification status is read from M12; M14 never writes SR.
  - BR3: SLA thresholds per workflow type are configured centrally; breaches are derived, not hand-set.
  - BR4: Compliance dashboards default to enterprise/department scope for authorised roles; employee role has no access.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` (compliance/SR/workflow marts) | sources |
| `service_register_events` (M12 ref) | SR verification status |
| `workflow_tasks` (ref) | pending/SLA |
| `kpi_definition`/`kpi_snapshot` | compliance KPIs |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/compliance/reservation-roster` | roster compliance |
| GET | `/api/v1/analytics/compliance/mandatory-training` | mandate status |
| GET | `/api/v1/analytics/compliance/sr-verification` | SR verification status |
| GET | `/api/v1/analytics/compliance/sla-breaches` | pending & SLA aging |

- **UI Behavior Notes:** Compliance suite with a category-wise roster table (sanctioned/filled/backlog/compliance %), overdue training list, SR verification status board, and an SLA breach heatmap by module×age bucket; prominent export-for-audit button; methodology footnotes; as-of stamp.
- **Edge Cases:** Reservation reference updated (recompute against new points); SR mart lagging M12 (stale badge + note); workflow type without configured SLA (excluded with data-quality flag).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ComplianceController`, `ReservationRosterService`, `MandatoryTrainingService`, `SrVerificationService`, `SlaBreachService` |
| Backend Flow | Resolve scope → query compliance/SR/workflow marts → compute compliance KPIs vs reference targets → assemble with as-of + methodology |
| Data Operations | SELECT compliance/SR/workflow marts (RLS); read reservation reference; no writes |
| Validation | Reference-data presence; SLA config presence; scope ≥ department |
| Authorization | HR/Dept Head/Exec/Auditor; Employee/Manager excluded |
| State Changes & Side Effects | snapshot writes; export → document + access_log |
| Failure Handling | Missing reference → `RESERVATION_REFERENCE_MISSING`; SR mart stale → partial |
| Dependencies | M12 (SR), workflow engine, FR-02/03/04/09 |
| Test Guidance | Roster compliance math; SR read-only; SLA bucket derivation; audit export completeness |

---

### FR-M14-08 — Self-Service Report Builder (Ad-Hoc Query & Saved Reports)

- **Module:** M14-F08
- **Primary Role(s):** HR Officer, Department Head, Reporting Manager (team scope)
- **User Story:** As an HR Officer, I want to build ad-hoc reports by choosing fields, filters, grouping, and aggregations from a governed semantic model and save them, so that I can answer new questions without raising IT tickets — while staying within my data scope.
- **Description:** A no-code report designer over the semantic layer (FR-03). Users pick a base mart, select fields/measures, add filter predicates, group and aggregate, sort, and preview; they save as `saved_report` (PRIVATE/SHARED_SCOPE/PUBLISHED). All queries are RLS-scoped and bounded by `row_limit`. Sensitive fields are masked per role. Previews run against marts with freshness shown; large results are paginated/streamed.
- **Acceptance Criteria:**
  - AC1: A user can select a mart, choose fields, add filters/grouping/aggregations, and preview results (first page).
  - AC2: The builder only exposes fields/dimensions the user's role is permitted to see (masked fields hidden).
  - AC3: A report can be saved with visibility and reused; SHARED_SCOPE reports respect each viewer's RLS at run time.
  - AC4: A query exceeding `row_limit` is rejected or offered chunked export (FR-09).
  - AC5: Preview and saved reports always show `data_as_of`.
  - AC6: A non-aggregated report over a RESTRICTED mart requires elevated authority or is blocked.
- **Business Rules:**
  - BR1: Report definitions reference the semantic model; raw SQL entry is not exposed to users.
  - BR2: SHARED_SCOPE/PUBLISHED visibility is applied at view-time as RLS intersection — a shared report never leaks beyond a viewer's scope.
  - BR3: Aggregated reports over RESTRICTED marts are permitted (no row-level PII); detail-level requires authority.
  - BR4: Saving/publishing a report is audited; PUBLISHED requires steward approval.
- **Data Model References:**

| Entity | Use |
|---|---|
| `saved_report` | definition |
| `analytics_datamart` (semantic) | base dataset |
| `rls_scope_policy` | scope/masking |
| `report_execution` | preview/run instances |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/semantic/fields?mart=` | available fields (scoped) |
| POST | `/api/v1/analytics/reports:preview` | run preview (first page) |
| POST | `/api/v1/analytics/reports` | save report |
| GET | `/api/v1/analytics/reports/{id}/run` | run saved report (paginated) |

- **UI Behavior Notes:** Three-pane builder (fields palette / canvas with filters-grouping-aggregations / live preview grid); field chips show sensitivity; aggregation pickers per measure; "Save", "Schedule" (FR-09), "Export" buttons; freshness and row-count indicators; masked-field tooltip.
- **Edge Cases:** Filter on a masked field (rejected); grouping by high-cardinality dimension (warns + caps); preview against FAILED mart (blocked with stale notice); shared report viewed by a narrower-scope user (auto-filtered, possibly empty).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReportBuilderController`, `SemanticFieldService`, `QueryCompiler`, `ReportService`, `PreviewRunner` |
| Backend Flow | Resolve scoped fields → validate selections against semantic model → compile to RLS-wrapped SQL → run bounded preview → on save persist definition → on run, execute paginated with masking |
| Data Operations | SELECT semantic metadata; SELECT marts (RLS); INSERT saved_report/report_execution |
| Validation | Field permission; filter on permitted fields; row_limit; aggregation legality |
| Authorization | HR/Dept Head/Manager scoped; PUBLISHED needs steward approval |
| State Changes & Side Effects | report saved; execution + access_log on run/export |
| Failure Handling | Masked-field filter → 403 `FIELD_NOT_PERMITTED`; over limit → 400 `EXPORT_ROW_LIMIT_EXCEEDED`; FAILED mart → 503 |
| Dependencies | FR-03 semantic, FR-04 RLS, FR-09 export |
| Test Guidance | Field-permission filtering; shared-report RLS intersection; row-limit; preview freshness |

---

### FR-M14-09 — Scheduled Report Distribution & Multi-Format Export

- **Module:** M14-F09
- **Primary Role(s):** HR Officer, Department Head, Analytics Administrator
- **User Story:** As an HR Officer, I want to schedule saved reports for automatic generation and delivery in PDF/Excel/CSV — optionally bursted per org unit — so that stakeholders receive timely, scope-correct reports without manual effort.
- **Description:** Lets users attach a `report_schedule` (cron, format, recipients, optional `burst_dimension`, channel) to a `saved_report`. The scheduler runs the report, generating a `report_execution` and a `documents` (M13) artefact, then delivers via EMAIL/IN_APP/SFTP. Each delivered copy is generated **under the recipient's or owner's effective scope** (configurable: owner-scope or per-recipient-scope), with bursting producing one scope-correct file per dimension value. On-demand export shares the same pipeline.
- **Acceptance Criteria:**
  - AC1: A schedule can be created with cron, format, recipients, and channel; recipients are RBAC-validated.
  - AC2: A scheduled run produces a `report_execution` (COMPLETED/FAILED) and, on success, a stored `documents` artefact.
  - AC3: Bursting by `org_unit` produces one file per unit, each filtered to that unit and delivered to that unit's recipients.
  - AC4: Per-recipient-scope mode generates each recipient's copy under their own RLS scope (no over-disclosure).
  - AC5: Export formats PDF, XLSX, CSV are all supported; PDF includes header/footer with scope, as-of, and page numbers.
  - AC6: A failed run retries per policy, alerts the owner on final failure, and is logged.
- **Business Rules:**
  - BR1: An out-of-scope recipient is dropped (logged), never sent data beyond their entitlement.
  - BR2: RESTRICTED reports cannot be scheduled to EMAIL unless encryption/secure-channel policy is satisfied; otherwise IN_APP only.
  - BR3: Exports are retained per statutory retention; `report_execution` artefacts expire and are purged on schedule.
  - BR4: Schedule cron is stored UTC; display in owner timezone.
- **Data Model References:**

| Entity | Use |
|---|---|
| `report_schedule` | schedule definition |
| `report_execution` | run instances |
| `saved_report` | source definition |
| `documents` (M13) | generated artefact |
| `notifications` | delivery |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/reports/{id}/schedules` | create schedule |
| POST | `/api/v1/analytics/reports/{id}:export` | on-demand export |
| GET | `/api/v1/analytics/executions/{id}` | execution status/artefact |
| POST | `/api/v1/analytics/schedules/{id}:pause` | pause/resume |

- **UI Behavior Notes:** Schedule dialog (cron builder, format, recipients with scope warning, burst toggle, channel); executions list with status, row count, download link, expiry; on-demand export menu (PDF/Excel/CSV) with progress; failure surfaced with retry.
- **Edge Cases:** Recipient leaves the org before run (dropped); burst over a dimension with 500 values (throttled batch); CSV with embedded delimiters (RFC-4180 quoting); huge PDF (paginated/streamed, size cap warns).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ScheduleController`, `ReportScheduler`, `ExportRenderer` (PDF/XLSX/CSV), `BurstingEngine`, `DeliveryService` |
| Backend Flow | Cron fires → resolve recipients + scope mode → for each scope unit run report → render format → store in M13 → deliver → log execution + access_log → notify |
| Data Operations | INSERT report_execution; create document ref; INSERT notifications; SELECT marts (RLS) |
| Validation | Cron validity; recipient RBAC/scope; format support; restricted-channel policy |
| Authorization | Owner/HR/Dept Head create; per-recipient scope enforced |
| State Changes & Side Effects | schedule next_run advance; execution status; document creation; notification; access_log EXPORT |
| Failure Handling | Render error → execution FAILED + retry + alert; out-of-scope recipient dropped+logged; restricted email blocked → `RESTRICTED_CHANNEL_BLOCKED` |
| Dependencies | FR-08 reports, FR-04 RLS, M13 docs, notifications |
| Test Guidance | Burst scope-correctness; per-recipient RLS; format fidelity; recipient validation; retry/alert |

---

### FR-M14-10 — Drill-Down & Permission-Gated Drill-Through to Source Records

- **Module:** M14-F10
- **Primary Role(s):** Manager, HR Officer, Department Head, Auditor
- **User Story:** As an HR Officer, I want to drill down through aggregate charts and then drill through to the underlying source record (in its owning module) when permitted, so that I can investigate an outlier from a KPI to the actual employee/case — without leaving an audit gap.
- **Description:** Two navigation modes. **Drill-down**: expand an aggregate along a `drilldown_path` (e.g. enterprise→department→office→designation→employee count), staying within the analytics layer. **Drill-through**: from a leaf row, open the authoritative record in the owning module (e.g. a leave application in M03, a disciplinary case in M09) via a route template, **only if** the user has both analytics scope and the owning module's permission. Every drill-through is logged with the record id and sensitivity. Drill-through is **read-only**.
- **Acceptance Criteria:**
  - AC1: A user can expand a chart along the configured drill path level by level, each level RLS-scoped.
  - AC2: Drill-through is offered only when the user is authorised in both M14 (scope) and the owning module (permission); otherwise the action is hidden/disabled.
  - AC3: Drill-through opens the owning module's read-only record view (deep link), not an M14 copy.
  - AC4: Every drill-through writes an `analytics_access_log` (DRILLTHROUGH) row with target record id and sensitivity.
  - AC5: A drill-through to a record outside the user's scope returns 403 `DRILLTHROUGH_FORBIDDEN`.
  - AC6: Aggregates with a small group size below the privacy threshold suppress drill-through to protect individuals (k-anonymity).
- **Business Rules:**
  - BR1: M14 never renders an editable source form; it links to the owning module's view route.
  - BR2: Permission check is a live cross-module authorization call, not a cached flag.
  - BR3: Small-cell suppression threshold (default k=5) is configurable for sensitive demographics.
  - BR4: Auditor drill-through is read-only and fully logged like any other.
- **Data Model References:**

| Entity | Use |
|---|---|
| `dashboard_widget` (drilldown_path, drillthrough_target) | navigation config |
| `analytics_access_log` | drill-through audit |
| Owning-module records (ref) | deep-link target |
| `rls_scope_policy` | scope check |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/widgets/{id}/drilldown?level=&path=` | next drill level |
| GET | `/api/v1/analytics/widgets/{id}/drillthrough?rowKey=` | resolve deep link + authz |
| GET | `/api/v1/analytics/access-log` | view drill/export audit (authorised) |

- **UI Behavior Notes:** Click-to-expand on charts/tables with breadcrumb of drill levels; "Open source record" action visible only when permitted; opens owning module in new context (read-only); suppressed cells show "below privacy threshold"; access clearly indicates it is logged.
- **Edge Cases:** Record deleted/soft-deleted in source after aggregation (drill-through shows "record no longer available"); cross-module permission revoked mid-session (action disabled on next check); deep link to a module under maintenance (graceful 503 passthrough).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DrillController`, `DrilldownService`, `DrillthroughResolver`, `CrossModuleAuthzClient`, `SmallCellSuppressor` |
| Backend Flow | Drill-down → query next mart level (RLS) → return; Drill-through → resolve target route → live authz check (M14 scope ∩ owning-module perm) → return deep link or 403 → log |
| Data Operations | SELECT marts (RLS); call owning-module authz; INSERT access_log |
| Validation | Path validity; small-cell threshold; live permission |
| Authorization | M14 scope + owning-module permission (both) |
| State Changes & Side Effects | access_log DRILLTHROUGH; no source mutation |
| Failure Handling | Out-of-scope → 403 `DRILLTHROUGH_FORBIDDEN`; suppressed cell → 403 `SMALL_CELL_SUPPRESSED`; source gone → 404 passthrough |
| Dependencies | FR-04 RLS; owning modules M01–M13 authz |
| Test Guidance | Both-permission gate; k-anonymity suppression; read-only deep link; audit completeness |

---

### FR-M14-11 — Alerting, Thresholds & KPI Targets

- **Module:** M14-F11
- **Primary Role(s):** HR Officer, Department Head, Analytics Administrator
- **User Story:** As a Department Head, I want to set thresholds and targets on KPIs and receive alerts when they breach, so that I am notified of attrition spikes, SLA backlogs, or vacancy surges proactively instead of discovering them in a monthly review.
- **Description:** Lets users attach `alert_rule`s to governed KPIs (operator, threshold, scope, severity, evaluation frequency, recipients, suppression window). On each KPI evaluation (on-refresh/hourly/daily), the engine compares the scoped value to the threshold; a breach creates an `alert_event`, sends `notifications`, and surfaces on dashboards. Alerts are de-duplicated within a suppression window and can be acknowledged/resolved. KPI targets (from `kpi_definition.target_value`) drive target-vs-actual indicators.
- **Acceptance Criteria:**
  - AC1: A rule can be created on an ACTIVE KPI with operator, threshold, scope, severity, frequency, and recipients.
  - AC2: When a scoped KPI value breaches the threshold, an `alert_event` is created and recipients are notified.
  - AC3: Repeat breaches within `suppression_window_min` do not generate duplicate notifications.
  - AC4: A recipient can acknowledge an alert; status moves OPEN→ACKNOWLEDGED→RESOLVED.
  - AC5: Recipients are RBAC/scope validated; out-of-scope recipients are dropped.
  - AC6: Dashboards show active alert badges on affected KPI tiles.
- **Business Rules:**
  - BR1: Alerts evaluate against the same governed `kpi_snapshot`/value used on dashboards; no separate calculation.
  - BR2: An alert computed on a stale/partial mart is flagged `data_as_of`/partial in the event and notification.
  - BR3: DELTA_PCT operator compares to the prior comparable period.
  - BR4: CRITICAL alerts cannot be globally muted by a non-admin; only acknowledged.
- **Data Model References:**

| Entity | Use |
|---|---|
| `alert_rule` | rule config |
| `alert_event` | triggered events |
| `kpi_definition`/`kpi_snapshot` | evaluation source |
| `notifications` | delivery |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/alert-rules` | create rule |
| GET | `/api/v1/analytics/alert-events` | list events (scoped) |
| POST | `/api/v1/analytics/alert-events/{id}:acknowledge` | acknowledge |
| POST | `/api/v1/analytics/alert-rules/{id}:pause` | pause/resume |

- **UI Behavior Notes:** Rule builder (KPI picker, operator, threshold, scope, severity, recipients, suppression); alert inbox with severity chips, value vs threshold, as-of, acknowledge/resolve; KPI tiles show alert badges; target-vs-actual gauges on tiles.
- **Edge Cases:** KPI retired with active rules (rules auto-paused + steward notified); flapping value near threshold (suppression + hysteresis); evaluation while mart FAILED (skipped, logged, no false alert).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AlertRuleController`, `AlertEvaluator`, `SuppressionEngine`, `AlertNotifier` |
| Backend Flow | On schedule/refresh → for each active rule resolve scoped KPI value → compare → if breach and not suppressed → create event → validate recipients → notify → badge dashboards |
| Data Operations | SELECT kpi_snapshot; INSERT alert_event; INSERT notifications; UPDATE event status |
| Validation | KPI active; operator/threshold validity; recipient scope; suppression window |
| Authorization | HR/Dept Head/Admin create scoped; recipients validated |
| State Changes & Side Effects | event OPEN→ACKNOWLEDGED→RESOLVED/SUPPRESSED; notifications; dashboard badges |
| Failure Handling | Stale mart → flagged partial; FAILED mart → evaluation skipped; bad recipient → dropped+logged |
| Dependencies | FR-02 KPI, FR-03 refresh hooks, notifications |
| Test Guidance | Breach detection; suppression/no-dup; recipient scope; retired-KPI auto-pause |

---

### FR-M14-12 — Data Freshness Indicators & Stale-Data Behaviour

- **Module:** M14-F12
- **Primary Role(s):** All roles (consume), Data Engineer (operate)
- **User Story:** As any dashboard user, I want every number to tell me how fresh it is and to behave honestly when data is stale, so that I never make a decision on silently outdated figures.
- **Description:** A cross-cutting capability ensuring every analytics surface (widget, KPI tile, report, export, alert) carries an explicit `data_as_of` and a freshness state derived from the source mart's `health_status` and `freshness_sla_minutes`. When a mart is STALE/DEGRADED/FAILED, surfaces render the **last good** value with a clear staleness badge and tooltip (last refresh, expected refresh, reason); exports embed the same notice; `is_partial` is set on snapshots/executions. The system never shows a stale figure as if it were current.
- **Acceptance Criteria:**
  - AC1: Every widget/tile shows a `data_as_of` timestamp in the user's timezone.
  - AC2: A mart past its freshness SLA renders dependent surfaces with a STALE badge and tooltip detail.
  - AC3: A DEGRADED/FAILED mart shows last good data with a prominent warning; new computations are flagged `is_partial`.
  - AC4: Exports and scheduled reports embed the freshness state and as-of in header/footer.
  - AC5: Alerts evaluated on stale data carry the staleness flag.
  - AC6: A global "data health" panel summarises mart freshness for operators.
- **Business Rules:**
  - BR1: Freshness state is derived from `analytics_datamart` health + SLA; it is not hand-set per widget.
  - BR2: No surface may display a value without an associated `data_as_of`.
  - BR3: FAILED-mart surfaces must visually differentiate from HEALTHY (color + icon + text, not color alone — WCAG).
  - BR4: Degraded-mode behaviour is consistent across UI, exports, and API responses (API returns a `dataFreshness` block).
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` | health/SLA source |
| `kpi_snapshot` (is_partial, data_as_of) | freshness on values |
| `report_execution` (data_as_of) | freshness on exports |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/data-health` | mart freshness summary |
| (cross-cutting) | all analytics GETs return `dataFreshness` block | as-of + state |

- **UI Behavior Notes:** Freshness chip on every tile (green/amber/red with icon + label); tooltip with last refresh, next expected, SLA, reason; global data-health panel for operators; export header/footer freshness line; degraded banner on affected dashboards.
- **Edge Cases:** Mixed-freshness dashboard (per-widget badges, plus worst-case global indicator); clock skew (server-authoritative timestamps); mart never refreshed yet (NO_DATA state, not "fresh").
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FreshnessService`, `DataHealthController`, response `FreshnessDecorator` |
| Backend Flow | On each analytics response, look up source mart health/SLA → compute state (FRESH/STALE/DEGRADED/FAILED/NO_DATA) → attach `dataFreshness` block + per-value `is_partial` |
| Data Operations | SELECT mart health; read snapshot watermarks; no writes |
| Validation | Presence of data_as_of on every value; state derivation correctness |
| Authorization | All roles see freshness; operators see global panel |
| State Changes & Side Effects | none (read-only decoration); influences alert flagging |
| Failure Handling | Health lookup failure → conservative DEGRADED (fail-safe to "not fresh") |
| Dependencies | FR-03 marts; consumed by FR-01/05/06/07/08/09/11 |
| Test Guidance | SLA-boundary state; degraded-mode parity across UI/export/API; NO_DATA vs FRESH; WCAG non-color cue |

---

### FR-M14-13 — Predictive Analytics (Attrition / Retirement Risk & Succession)

- **Module:** M14-F13
- **Primary Role(s):** HR Officer, Department Head, Executive
- **User Story:** As an HR Officer, I want explainable predictive indicators — attrition risk, retirement forecasting, and succession risk — so that I can target retention, plan recruitment ahead of retirement bulges, and identify critical-role exposure.
- **Description:** Registers `prediction_model`s (rule-based/statistical/ML) over governed marts and produces `prediction_result`s per subject (employee/org_unit/cadre) with a score, risk band, top contributing factors (explainability), and confidence. **Retirement forecasting** is deterministic from DOB + retirement rules; **attrition risk** blends tenure, leave patterns, appraisal trend, promotion stagnation, transfer history; **succession risk** flags critical roles with thin or high-risk bench. All outputs are clearly labelled advisory, scoped (FR-04), and never written back to source modules.
- **Acceptance Criteria:**
  - AC1: A model can be registered with type, version, features, and a documented methodology, and activated by an approver.
  - AC2: Retirement forecast lists subjects retiring within configurable horizons by scope, deterministic from canonical rules.
  - AC3: Attrition-risk results show score, risk band (LOW/MEDIUM/HIGH), and top factors per (permitted) employee.
  - AC4: Succession-risk view flags critical roles where bench depth is below threshold or successors are high attrition/retirement risk.
  - AC5: Every predictive figure is labelled advisory with model id, version, confidence, and `data_as_of`.
  - AC6: Predictions are RLS-scoped and individual-level results are drill-gated and audited.
- **Business Rules:**
  - BR1: Predictions are advisory; they never trigger or record administrative actions and are never written to M01–M13.
  - BR2: Retirement age/date uses canonical M01/cadre rules; M14 does not invent retirement logic.
  - BR3: Models carry a documented, reviewable methodology; black-box outputs without explainability are not published.
  - BR4: Sensitive individual risk scores are RESTRICTED and masked from unauthorised roles.
- **Data Model References:**

| Entity | Use |
|---|---|
| `prediction_model` | registry/methodology |
| `prediction_result` | scores per subject |
| Marts (workforce/leave/appraisal/transfer) | features |
| `analytics_access_log` | individual drill audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/models` | register model |
| POST | `/api/v1/analytics/models/{id}:run` | compute results |
| GET | `/api/v1/analytics/predictions/attrition` | attrition risk (scoped) |
| GET | `/api/v1/analytics/predictions/retirement` | retirement forecast |
| GET | `/api/v1/analytics/predictions/succession` | succession risk |

- **UI Behavior Notes:** Predictive dashboard with risk-band distribution, retirement timeline, succession heatmap (role criticality × bench risk); per-subject panel with top factors and confidence; prominent "Advisory — not an administrative decision" label; methodology link.
- **Edge Cases:** Insufficient history for a new joiner (low confidence / NO_PREDICTION, not a false high); model retired (results frozen read-only); data drift detected (model flagged for review).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ModelRegistryController`, `RetirementForecaster`, `AttritionScorer`, `SuccessionAnalyzer`, `ExplainabilityService` |
| Backend Flow | Activate model (checker) → on run, assemble features from marts (RLS) → score subjects → derive band + top factors + confidence → persist results with data_as_of |
| Data Operations | INSERT prediction_model/result; SELECT feature marts; no source writes |
| Validation | Methodology present; feature availability; confidence computation; advisory labelling |
| Authorization | HR/Dept Head/Exec scoped; individual scores RESTRICTED |
| State Changes & Side Effects | model DRAFT→ACTIVE→RETIRED; result rows; access_log on individual drill |
| Failure Handling | Insufficient data → NO_PREDICTION; feature mart missing → 503; black-box → publish blocked `MODEL_METHODOLOGY_REQUIRED` |
| Dependencies | FR-03 marts, FR-04 RLS, M01 retirement rules |
| Test Guidance | Deterministic retirement math; explainability presence; advisory labelling; RLS on individual scores |

---

### FR-M14-14 — Benchmarking & Comparative Analytics

- **Module:** M14-F14
- **Primary Role(s):** Department Head, Executive, HR Officer
- **User Story:** As an Executive, I want to compare KPIs across periods, peer org units, and against targets, so that I can see who is improving, who lags, and where to intervene — on a like-for-like basis.
- **Description:** Provides comparative views over governed KPIs: **period-over-period** (MoM/YoY/rolling), **peer comparison** (org_unit vs sibling units, cadre vs cadre), and **target-vs-actual** (against `kpi_definition.target_value`). Comparisons normalise for size (per-capita/rate) to keep them fair, rank and highlight outliers, and respect RLS (a user benchmarks only within their scope). Optional external/standard benchmarks can be loaded as reference series.
- **Acceptance Criteria:**
  - AC1: A KPI can be compared across selectable periods with variance and % change.
  - AC2: Peer comparison ranks sibling org units on a normalised (rate/per-capita) basis within the user's scope.
  - AC3: Target-vs-actual shows attainment % and RAG status based on `direction`.
  - AC4: Comparisons exclude units outside the user's RLS scope.
  - AC5: Outliers (top/bottom N, or beyond N std dev) are highlighted with explanation of the basis.
  - AC6: External benchmark series, when configured, are shown as a labelled reference line (clearly external).
- **Business Rules:**
  - BR1: Comparisons use governed KPI snapshots only; ad-hoc recomputation is not allowed for benchmarking.
  - BR2: Size-sensitive metrics are normalised before ranking (no raw-count peer ranking).
  - BR3: A user cannot benchmark against a peer unit outside their scope (it is excluded, not partially shown).
  - BR4: External benchmarks are reference-only and visually distinguished from internal actuals.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_snapshot` | comparison series |
| `kpi_definition` (target/direction) | target-vs-actual |
| `analytics_datamart` | denominators for normalisation |
| `rls_scope_policy` | peer scope |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/benchmark/period?kpi=&periods=` | period-over-period |
| GET | `/api/v1/analytics/benchmark/peers?kpi=&scope=` | peer ranking |
| GET | `/api/v1/analytics/benchmark/target?kpi=&scope=` | target-vs-actual |

- **UI Behavior Notes:** Comparison panel with period selector, peer ranking table (normalised), variance arrows, RAG target gauges, outlier highlights, optional external reference line with legend; tooltips explain normalisation basis.
- **Edge Cases:** Peer unit with zero denominator (excluded from rate ranking with note); newly created unit lacking history (shown as "insufficient history"); target unset (target-vs-actual hidden, not zero).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenchmarkController`, `PeriodComparator`, `PeerRanker`, `TargetAttainmentService`, `NormalizationService` |
| Backend Flow | Resolve scope + peers → pull governed snapshots → normalise (per-capita/rate) → compute variance/rank/attainment → flag outliers → assemble |
| Data Operations | SELECT kpi_snapshot + denominators (RLS); no writes |
| Validation | Scope membership of peers; normalisation denominator presence; target presence |
| Authorization | Dept Head/Exec/HR scoped |
| State Changes & Side Effects | none (read-only); access_log on view |
| Failure Handling | Missing denominator → unit excluded + note; no target → target view hidden; no history → insufficient-history state |
| Dependencies | FR-02 snapshots, FR-04 RLS |
| Test Guidance | Normalisation correctness; peer-scope exclusion; RAG by direction; outlier basis |

---

### FR-M14-15 — Natural-Language Query & Embedded BI

- **Module:** M14-F15
- **Primary Role(s):** HR Officer, Department Head, Executive; Analytics Administrator (embed config)
- **User Story:** As an HR Officer, I want to ask questions in plain language ("how many Group-A posts are vacant in District 12?") and embed governed widgets in other portals, so that analytics are accessible without learning the builder and reusable across our digital estate — always within my permissions.
- **Description:** Two capabilities. **NL query**: a natural-language assistant maps a question to the **governed semantic model** (KPIs, dimensions, marts), generating a parameterised, RLS-scoped query; it returns a result plus the resolved interpretation (which KPI/filters) for transparency, and refuses/clarifies ambiguous or out-of-scope questions. **Embedded BI**: Analytics Admin issues scoped, signed, expiring embed tokens that render specific widgets/dashboards in an iframe in another authorised application — carrying the **same RLS** as in-app, never a bypass. All NL queries and embedded views are audited.
- **Acceptance Criteria:**
  - AC1: An NL question resolves to a governed KPI/dimension/filter set and returns a scoped result with the interpretation shown.
  - AC2: An ambiguous question prompts a clarification rather than guessing; an out-of-scope question is refused with explanation.
  - AC3: NL never generates raw free-form SQL against OLTP; it only parameterises the governed semantic model.
  - AC4: An embed token is scoped to specific widgets, a user/role, and an expiry; it enforces the same RLS.
  - AC5: Every NL query and embedded render writes an `analytics_access_log` (NL_QUERY / VIEW_DASHBOARD via embed).
  - AC6: NL results carry the same freshness and sensitivity handling as native widgets.
- **Business Rules:**
  - BR1: NL is constrained to the semantic layer + governed KPIs; it cannot fabricate metrics.
  - BR2: Embed tokens are scoped, signed, and expiring; they are not API bypass keys and carry RLS.
  - BR3: NL interpretation is always shown so users can verify the question was understood.
  - BR4: RESTRICTED metrics require the same authority via NL/embed as in-app.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_definition`/`analytics_datamart` (semantic) | NL target space |
| `dashboard_widget` | embeddable units |
| `analytics_access_log` | NL/embed audit |
| `rls_scope_policy` | scope on NL/embed |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/nlq` | natural-language query |
| POST | `/api/v1/analytics/embed-tokens` | issue scoped embed token |
| GET | `/api/v1/analytics/embed/{token}` | render embedded widget (RLS-enforced) |

- **UI Behavior Notes:** NL search bar with example prompts; result card showing the interpreted KPI/filters + the value/chart + freshness; clarification chips for ambiguity; embed manager for admins (select widgets, role/user, expiry, copy iframe snippet); embedded widgets show a subtle "powered by HRMS Analytics" + freshness.
- **Edge Cases:** NL maps to multiple plausible KPIs (asks user to choose); question references a metric not modelled (replies "not available", suggests nearest); embed token expired (renders auth-expired state, not stale data); embed used by an out-of-scope user (RLS empties result).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `NlqController`, `SemanticMapper`, `IntentResolver`, `EmbedTokenService`, `EmbedRenderer` |
| Backend Flow | NL → map intent to governed KPI/dimensions/filters → if ambiguous/out-of-scope, clarify/refuse → else compile RLS-scoped parameterised query → execute → return result + interpretation; Embed → validate signed token + scope + expiry → render widget with RLS |
| Data Operations | SELECT marts (RLS); no free SQL; INSERT access_log |
| Validation | Intent within semantic model; token signature/scope/expiry; sensitivity authority |
| Authorization | Same RBAC+RLS as native; embed scoped to token |
| State Changes & Side Effects | access_log NL_QUERY/embed view; no source mutation |
| Failure Handling | Ambiguous → clarification (200 with options); unmodelled → `METRIC_NOT_AVAILABLE`; bad/expired token → 401 `EMBED_TOKEN_INVALID` |
| Dependencies | FR-02 semantic/KPI, FR-04 RLS, FR-12 freshness |
| Test Guidance | Intent maps to governed metric only; ambiguity clarification; token scope/expiry; embed RLS parity |

---

### FR-M14-16 — Mobile Dashboards & Executive Briefing Pack

- **Module:** M14-F16
- **Primary Role(s):** Executive, Department Head, Manager
- **User Story:** As an Executive, I want responsive mobile dashboards and a periodic executive briefing pack, so that I can monitor the workforce and act on alerts from my phone and receive a concise, scope-correct summary on a schedule.
- **Description:** Delivers mobile-optimised, touch-friendly renderings of role dashboards (KPI tiles, sparklines, alert inbox, approvals/SLA summary) within the responsive web app, and a curated **executive briefing pack** — a scheduled PDF/in-app digest of the top KPIs, trends, alerts, and compliance status for the leader's scope. The briefing is generated under the recipient's RLS, carries freshness/as-of, and links back to the full dashboards.
- **Acceptance Criteria:**
  - AC1: Role dashboards render legibly on mobile breakpoints with touch drill-down and an alert inbox.
  - AC2: An executive briefing pack can be scheduled (e.g., weekly) and is delivered as a scope-correct PDF + in-app digest.
  - AC3: The briefing includes top KPIs, key trends, open critical alerts, and compliance highlights for the recipient's scope.
  - AC4: Briefing figures carry `data_as_of` and freshness state.
  - AC5: Mobile views enforce the same RLS and sensitivity masking as desktop.
  - AC6: Briefing generation reuses the schedule/export pipeline (FR-09) and is audited.
- **Business Rules:**
  - BR1: Mobile is the same governed data and RLS — no relaxed scoping for convenience.
  - BR2: The briefing pack is generated per recipient under their scope (no shared over-disclosure).
  - BR3: Briefing content is configurable per role but limited to governed KPIs and compliance metrics.
  - BR4: Critical alerts always appear in the briefing regardless of configuration trimming.
- **Data Model References:**

| Entity | Use |
|---|---|
| `dashboard`/`dashboard_widget` | mobile render source |
| `report_schedule`/`report_execution` | briefing delivery |
| `kpi_snapshot`/`alert_event` | briefing content |
| `documents` (M13) | briefing PDF artefact |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/dashboards/{id}/render?viewport=mobile` | mobile render |
| POST | `/api/v1/analytics/briefings/schedules` | schedule briefing |
| GET | `/api/v1/analytics/briefings/{executionId}` | briefing artefact |

- **UI Behavior Notes:** Mobile layout with stacked KPI cards, swipeable trend sparklines, collapsible sections, bottom-nav, alert inbox badge; briefing digest screen with sections (KPIs/trends/alerts/compliance), each with as-of and "open full dashboard" links; PDF mirrors the digest.
- **Edge Cases:** Offline/poor connectivity (last-loaded cached view with explicit stale badge, no silent refresh); very small screen (progressive disclosure); recipient scope emptied since last briefing (digest notes "no data in scope").
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MobileRenderer`, `BriefingComposer`, reuse `ReportScheduler`/`ExportRenderer`, `FreshnessDecorator` |
| Backend Flow | Mobile render → same render pipeline with viewport hint → responsive payload; Briefing → scheduled per recipient → resolve scope → compose top KPIs/alerts/compliance → render PDF + in-app → deliver → log |
| Data Operations | SELECT marts/snapshots/alerts (RLS); INSERT report_execution; create document ref |
| Validation | Viewport handling; recipient scope; governed-content only |
| Authorization | Same RBAC+RLS as desktop; per-recipient briefing scope |
| State Changes & Side Effects | execution + document + access_log; notification delivery |
| Failure Handling | Offline → cached + stale badge; empty scope → "no data" digest; render fail → retry+alert (FR-09) |
| Dependencies | FR-01 dashboards, FR-09 export, FR-11 alerts, FR-12 freshness |
| Test Guidance | RLS parity mobile vs desktop; per-recipient briefing scope; critical-alert inclusion; offline stale badge |

---

## 7. UI Requirements

| Area | Requirement |
|---|---|
| Information architecture | Left nav by persona/category: My Dashboard, Workforce, Operational, Compliance, Reports, Predictive, Data Health (operators). Role determines visible sections. |
| Dashboard canvas | Responsive grid; KPI tiles, charts, tables; per-widget freshness badge; drill breadcrumbs; "save as my view". |
| KPI tiles | Value + unit + trend sparkline + target/RAG + alert badge + as-of; click → drill-down. |
| Charts | Line/bar/pie/donut/heatmap/gauge/funnel/map; accessible (labels, patterns + colour, keyboard navigable, data-table fallback). |
| Report builder | Three-pane (fields/canvas/preview); sensitivity chips; masked-field tooltips; row-count + freshness. |
| Filters | Period, org_unit (scoped tree), cadre, designation, gender, category; shareable as saved_view. |
| Freshness UX | Green/amber/red chip with icon + label (non-colour cue); tooltip with last/next refresh + reason; global data-health panel. |
| Empty/loading/error states | Every surface defines: loading skeleton-with-context, empty ("no data in your scope"), error (with retry), permission ("not authorised"), stale (degraded banner), offline (cached + stale). |
| Drill-through | "Open source record" visible only when permitted; opens owning module read-only; small-cell suppression notice. |
| Alerts | Alert inbox with severity chips; acknowledge/resolve; tile badges. |
| Exports | PDF/Excel/CSV menu with progress; header/footer carry scope + as-of + page numbers. |
| Mobile | Stacked cards, swipeable trends, bottom-nav, alert badge; same RLS; offline stale badge. |
| Accessibility | WCAG 2.1 AA: keyboard operable charts, focus order, contrast, data-table fallback for every chart, screen-reader summaries, no colour-only meaning. |
| i18n/locale | Dates `DD-MMM-YYYY`, INR money formatting, user timezone for as-of, translatable labels. |
| Theming | Light/dark mode; government-portal visual compliance. |

---

## 8. API & Integration

### 8.1 Conventions

- Base path `/api/v1/analytics`; OIDC/JWT auth; RBAC + RLS enforced server-side on every endpoint.
- All list endpoints paginated (`page`/`limit`, max 100) or cursor-based; all responses include a `dataFreshness` block (`{ asOf, state, isPartial }`) for data-bearing reads.
- Every data-returning call writes `analytics_access_log`; exports/drill-throughs additionally write `audit_log`.

### 8.2 Canonical Error Envelope

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "field": "optional.field.path" },
  "requestId": "req-7f3c2a9e"
}
```

### 8.3 Error-Code Catalog (shared + M14-specific)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed request/parameters |
| AUTH_REQUIRED | 401 | Missing/invalid token |
| FORBIDDEN | 403 | Capability not granted |
| NOT_FOUND | 404 | Resource absent |
| CONFLICT | 409 | State/version conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unhandled server error |
| UPSTREAM_UNAVAILABLE | 503 | Source module/mart unavailable |
| RLS_SCOPE_UNRESOLVED | 403 | No applicable row-level policy; access denied |
| DRILLTHROUGH_FORBIDDEN | 403 | User lacks owning-module/scope permission for the record |
| SMALL_CELL_SUPPRESSED | 403 | Group below privacy threshold (k-anonymity) |
| FIELD_NOT_PERMITTED | 403 | RESTRICTED field used by unauthorised role |
| KPI_EXPRESSION_INVALID | 400 | KPI formula failed validation |
| KPI_VERSION_OVERLAP | 409 | Two ACTIVE versions for a kpi_code |
| WIDGET_BINDING_INVALID | 409 | Widget bound to retired/missing KPI/report |
| PUBLISH_REQUIRES_CHECKER | 403 | Maker attempted gated publication |
| MART_UNAVAILABLE | 503 | Source mart FAILED/absent |
| MART_REFRESH_FAILED | 500 | ETL refresh error (last good retained) |
| MART_REFRESH_IN_PROGRESS | 409 | Concurrent refresh lock |
| EXPORT_ROW_LIMIT_EXCEEDED | 400 | Report exceeds configured row cap |
| RESTRICTED_CHANNEL_BLOCKED | 403 | RESTRICTED report to insecure channel |
| METRIC_NOT_AVAILABLE | 404 | NL query references unmodelled metric |
| EMBED_TOKEN_INVALID | 401 | Embed token missing/expired/out-of-scope |
| MODEL_METHODOLOGY_REQUIRED | 422 | Predictive model lacks required methodology |
| VACANCY_REFERENCE_MISSING / RESERVATION_REFERENCE_MISSING | 200(notice)/422 | Establishment/roster reference absent |

### 8.4 JSON Examples

**KPI value (scoped) — request/response**

```
GET /api/v1/analytics/kpis/HEADCOUNT_ACTIVE/value?scope=ORG_UNIT:OU-DIST-12&period=2026-06
```

```json
{
  "kpiCode": "HEADCOUNT_ACTIVE",
  "scope": { "type": "ORG_UNIT", "id": "OU-DIST-12" },
  "period": "2026-06",
  "value": 1842,
  "unit": "COUNT",
  "target": null,
  "dataFreshness": { "asOf": "2026-06-30T02:00:00Z", "state": "FRESH", "isPartial": false },
  "requestId": "req-1a2b3c"
}
```

**Ad-hoc report preview (RLS-filtered)**

```json
{
  "reportCode": "RPT_VACANCY_DISTRICT",
  "columns": ["cadre", "sanctioned", "filled", "vacant", "vacancyPct"],
  "rows": [
    { "cadre": "GROUP_A", "sanctioned": 120, "filled": 105, "vacant": 15, "vacancyPct": 12.5 },
    { "cadre": "GROUP_B", "sanctioned": 340, "filled": 331, "vacant": 9, "vacancyPct": 2.6 }
  ],
  "page": { "page": 1, "limit": 100, "total": 4 },
  "dataFreshness": { "asOf": "2026-06-30T02:00:00Z", "state": "FRESH", "isPartial": false },
  "requestId": "req-9z8y7x"
}
```

**RLS denial**

```json
{
  "error": { "code": "DRILLTHROUGH_FORBIDDEN", "message": "You are not authorised to view this employee's leave record.", "field": "employee_id" },
  "requestId": "req-4d5e6f"
}
```

**Stale-data response (degraded mart)**

```json
{
  "kpiCode": "PAYROLL_COST_TOTAL",
  "scope": { "type": "ORG_UNIT", "id": "OU-DIST-12" },
  "period": "2026-05",
  "value": 184230000.00,
  "unit": "CURRENCY",
  "dataFreshness": { "asOf": "2026-06-28T01:00:00Z", "state": "STALE", "isPartial": true, "reason": "Payroll mart last refreshed beyond SLA" },
  "requestId": "req-7g8h9i"
}
```

### 8.5 Integration Points

| Direction | Counterparty | Mechanism | Purpose |
|---|---|---|---|
| Inbound (read) | M01–M13 | Mart ETL (CDC/incremental/batch) from source schemas/views | Populate analytics marts read-only |
| Inbound (read) | M12 Digital SR | Read SR verification status | Compliance/SR dashboards |
| Inbound (read) | M10 Payroll | Read **locked** payroll snapshots | Cost/overtime analytics |
| Inbound (read) | Workflow engine | Read pending `workflow_tasks` | SLA/pending-approvals dashboards |
| Inbound (read) | RBAC/org hierarchy | Resolve roles + org subtree | RLS scope resolution |
| Outbound | M13 Documents | Store generated exports/briefings | Export artefact persistence |
| Outbound | Notifications platform | Alert + scheduled-report delivery | Stakeholder distribution |
| Outbound | Audit platform | Append access/export/config events | Audit trail |
| Outbound | External portals | Scoped embed tokens (iframe) | Embedded BI |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard P95 < 2.5s (mart-backed); KPI/report API P95 < 500ms; preview first page < 1.5s for 100k-employee enterprise. |
| Scalability | Marts pre-aggregated; horizontal read scaling; partitioned fact marts; query concurrency for 500+ simultaneous dashboard users. |
| Freshness/Latency | Operational marts ≤ 30–60 min; demographic/financial marts ≤ daily; freshness SLA per mart enforced and surfaced. |
| Availability | 99.9% uptime; degraded-mode (last good data + stale badge) when a source/mart is down — dashboards never hard-fail on one stale mart. |
| Security | OWASP ASVS; TLS 1.2+; encryption at rest; RLS non-bypassable; embed tokens signed/expiring; RESTRICTED field masking. |
| Privacy | DPDP Act 2023 alignment; PII minimisation in marts; k-anonymity small-cell suppression; view/export auditing. |
| Auditability | Every view/drill/export/config change logged (access_log + audit_log); immutable, queryable by Auditor. |
| Accessibility | WCAG 2.1 AA; chart data-table fallback; keyboard/screen-reader support; non-colour cues. |
| Reliability/DR | RPO ≤ 15 min, RTO ≤ 4h; marts rebuildable from sources; refresh idempotent. |
| Observability | ETL run metrics, freshness monitoring, query latency, alert evaluation health; data-health panel. |
| Data quality | Reconciliation to source within tolerance; DEGRADED flagging; data-quality notices on missing reference data. |
| Retention | Snapshots and access logs retained per statutory schedule; export artefacts expire/purge per policy. |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 KPI Definition Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | expression validated |
| DRAFT | submit+activate (checker) | ACTIVE | approved_by ≠ created_by; prior ACTIVE → RETIRED |
| ACTIVE | new version activated | RETIRED | superseded by new version |
| ACTIVE/DRAFT | retire | RETIRED | not referenced by published surface (or auto-pauses dependents) |

### 10.2 Dashboard Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | bindings validated |
| DRAFT | publish | PUBLISHED | COMPLIANCE/EXEC require checker; all bindings ACTIVE |
| PUBLISHED | edit (new draft) | DRAFT | versioned edit |
| PUBLISHED | archive | ARCHIVED | saved_views preserved read-only |

### 10.3 Data Mart Refresh / Health

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| HEALTHY | refresh success within SLA | HEALTHY | watermark advanced; snapshots recomputed |
| HEALTHY | SLA exceeded | STALE | staleness surfaced; last good served |
| HEALTHY/STALE | reconciliation variance > tolerance | DEGRADED | alert raised; is_partial set |
| any | refresh error | FAILED | last good retained; alert; surfaces flagged |
| FAILED/STALE/DEGRADED | successful refresh | HEALTHY | health restored |

### 10.4 Report Execution

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | trigger (on-demand/scheduled) | QUEUED | recipients/scope validated |
| QUEUED | start | RUNNING | mart available |
| RUNNING | success | COMPLETED | document created; access_log EXPORT |
| RUNNING | error | FAILED | retry per policy; alert on final fail |
| COMPLETED | retention reached | EXPIRED | artefact purged |

### 10.5 Alert Event

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | breach detected | OPEN | not within suppression window; notify |
| (none) | breach within suppression | SUPPRESSED | de-duplicated; logged |
| OPEN | acknowledge | ACKNOWLEDGED | acknowledged_by recorded |
| ACKNOWLEDGED/OPEN | value returns within bound | RESOLVED | auto-resolve on next clean evaluation |

### 10.6 Prediction Model

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | register | DRAFT | methodology present |
| DRAFT | activate (checker) | ACTIVE | approved_by ≠ created_by |
| ACTIVE | retire / drift | RETIRED | results frozen read-only |

---

## 11. Notifications

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| Scheduled report delivered | report_execution COMPLETED | schedule recipients (scoped) | EMAIL/IN_APP/SFTP |
| Report run failed | execution FAILED (final) | report owner | IN_APP + EMAIL |
| KPI threshold breached | alert_event OPEN | alert_rule recipients (scoped) | IN_APP + EMAIL |
| Critical alert | severity=CRITICAL | recipients + Dept Head | IN_APP + EMAIL |
| Mart refresh failed/degraded | mart FAILED/DEGRADED | Data Engineer + Analytics Admin | IN_APP + EMAIL |
| KPI retired with dependents | KPI RETIRED | dashboard/alert stewards | IN_APP |
| Executive briefing | scheduled briefing | executive (own scope) | IN_APP + EMAIL (PDF) |
| Embed token expiring | token near expiry | issuing admin | IN_APP |
| Reconciliation variance | mart DEGRADED | Analytics Admin + Auditor (config) | IN_APP |
| Out-of-scope recipient dropped | delivery filtering | schedule owner (summary) | IN_APP |

All notifications reference governed data and carry `data_as_of`; none include RESTRICTED PII in the notification body (link to scoped view instead).

---

## 12. Reporting & Analytics

M14 **is** the reporting and analytics module; this section summarises its self-reporting and the catalog it exposes.

- **Standard report catalog (seed):** Headcount by org/cadre; Attrition (joiners/leavers/rate); Vacancy sanctioned-vs-filled; Demographics & diversity; Retirement profile (1/3/5Y); Span of control; Leave & absenteeism; Attendance exceptions; Payroll cost & overtime (locked); Training coverage & skill gaps; Appraisal rating distribution; Disciplinary case aging; Transfer/promotion pipeline; Pension forecast; Reservation roster compliance; Mandatory training status; SR verification status; Pending approvals & SLA breaches.
- **Self-analytics (operations):** Usage analytics (most-viewed dashboards/reports), export volume, query latency, ETL health, alert volume by severity — for the Analytics Administrator and Auditor.
- **Export formats:** PDF, XLSX, CSV — all scope-correct, freshness-stamped, audited.
- **Governance:** Every report maps to governed KPIs/semantic fields; reconciliation reports prove mart-to-source consistency; access logs provide who-saw-what for audit.

---

## 13. Migration & Launch

### 13.1 Data Migration

- M14 holds no transactional master data to migrate; migration = **standing up the analytics layer**: build mart schemas, define the semantic model, register marts, and run initial **full historical backfill** from M01–M13 sources.
- Seed governed `kpi_definition`s, dashboard templates per persona, `rls_scope_policy` mappings from the RBAC catalog, and the standard report catalog.
- Backfill `kpi_snapshot` history for trend baselines (configurable horizon, e.g., 24 months).

### 13.2 Validation & Parallel Run

- Reconcile each seeded KPI against its owning module (headcount, vacancy, leave counts) within tolerance; record variances and resolve before go-live.
- Run RLS scope-leak test matrix across all roles/marts; zero leakage required to launch.
- Validate freshness SLAs and degraded-mode behaviour with simulated mart outages.
- Verify export fidelity (PDF/Excel/CSV) and scheduled delivery scoping.

### 13.3 Cutover & Launch

- Enable read replicas/CDC from sources; switch ETL to incremental after backfill.
- Publish persona dashboards; enable schedules and alerts after validation.
- Soft-launch to HR/operators, then department heads/executives, then employee self-service.

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| All seed KPIs reconcile to source within tolerance | Pass required |
| RLS scope-leak matrix: 0 leaks | Pass required |
| Freshness SLAs configured + degraded-mode verified | Pass required |
| Persona dashboards published (maker-checker for compliance/exec) | Pass required |
| Export formats + scheduled delivery scoping validated | Pass required |
| Audit logging (view/drill/export) verified | Pass required |
| Predictive models carry methodology + advisory labelling | Pass required |
| Accessibility (WCAG AA) + mobile verified | Pass required |
| DR/backfill rebuild from sources tested | Pass required |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | dashboard, dashboard_widget, saved_view | /dashboards,/widgets,:publish | §10.2 | publish SoD, scope-omit, saved-view isolation |
| FR-02 | kpi_definition, kpi_snapshot | /kpis,:activate,/value | §10.1 | parser, determinism, version non-overlap |
| FR-03 | analytics_datamart, datamart_refresh_log | /marts,:refresh,/health | §10.3 | idempotent load, SLA, reconciliation, last-good |
| FR-04 | rls_scope_policy | /rls-policies | — | scope-leak matrix, multi-role priority, masking |
| FR-05 | MART_HEADCOUNT, kpi_snapshot, prediction_result | /workforce/* | — | attrition-excl-transfers, vacancy, retirement, span |
| FR-06 | domain marts, kpi_snapshot | /operational/* | — | payroll locked-only, masking, case-aging, funnel |
| FR-07 | compliance/SR/workflow marts | /compliance/* | — | roster math, SR read-only, SLA buckets, audit export |
| FR-08 | saved_report, report_execution | /reports:preview,/reports | — | field-permission, shared RLS, row-limit |
| FR-09 | report_schedule, report_execution, documents | /schedules,:export | §10.4 | burst scope, per-recipient RLS, format fidelity |
| FR-10 | dashboard_widget, analytics_access_log | /drilldown,/drillthrough | — | both-permission, k-anonymity, read-only link |
| FR-11 | alert_rule, alert_event | /alert-rules,/alert-events | §10.5 | breach, suppression, recipient scope |
| FR-12 | analytics_datamart, kpi_snapshot | /data-health, dataFreshness | §10.3 | SLA-boundary, degraded parity, NO_DATA |
| FR-13 | prediction_model, prediction_result | /models,/predictions/* | §10.6 | retirement determinism, explainability, RLS |
| FR-14 | kpi_snapshot, kpi_definition | /benchmark/* | — | normalisation, peer-scope, RAG, outliers |
| FR-15 | semantic, dashboard_widget, access_log | /nlq,/embed-tokens | — | intent→governed, ambiguity, token scope, embed RLS |
| FR-16 | dashboard, report_schedule, alert_event | /render?mobile,/briefings | §10.4 | RLS parity, per-recipient briefing, offline stale |

### 14.2 Dependency Graph (build order)

1. **FR-03** (data marts/ETL) + **FR-04** (RLS) — foundation → 2. **FR-02** (KPI engine) + **FR-12** (freshness) → 3. **FR-01** (dashboards), **FR-08** (report builder), **FR-10** (drill) → 4. **FR-05**, **FR-06**, **FR-07** (analytics suites) → 5. **FR-09** (export/schedule), **FR-11** (alerts) → 6. **FR-13** (predictive), **FR-14** (benchmark) → 7. **FR-15** (NL/embed), **FR-16** (mobile/briefing).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Data layer & security | FR-03, FR-04 | start |
| B: Metric & freshness | FR-02, FR-12 | A |
| C: Surfaces | FR-01, FR-08, FR-10 | B |
| D: Analytics suites | FR-05, FR-06, FR-07 | B |
| E: Distribution & alerting | FR-09, FR-11 | C, D |
| F: Advanced | FR-13, FR-14 | B, D |
| G: Access & mobile | FR-15, FR-16 | C, E |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Role-based dashboards | FR-01,16 | yes | yes | yes | yes | none |
| KPI definitions (configurable) | FR-02 | yes | yes | yes | yes | none |
| Analytics data layer / mart / ETL | FR-03 | yes | yes | yes | yes | none |
| Row-level security mirroring RBAC | FR-04 | yes | yes | n/a | yes | none |
| Workforce analytics (headcount/demographics/diversity/attrition/vacancy/cadre/retirement/span) | FR-05 | yes | yes | n/a | yes | none |
| Operational analytics (leave/attendance/payroll/training/appraisal/disciplinary/transfer/promotion/pension) | FR-06 | yes | yes | n/a | yes | none |
| Compliance & statutory (reservation/mandatory training/SR verification/SLA) | FR-07 | yes | yes | n/a | yes | none |
| Self-service report builder | FR-08 | yes | yes | n/a | yes | none |
| Scheduled distribution & export (PDF/Excel/CSV) | FR-09 | yes | yes | yes | yes | none |
| Drill-down & drill-through (permissioned) | FR-10 | yes | yes | n/a | yes | none |
| Alerting/thresholds/targets | FR-11 | yes | yes | yes | yes | none |
| Data-freshness & stale-data behaviour | FR-12 | yes | yes | yes | yes | none |
| Predictive analytics (attrition/retirement/succession) | FR-13 | yes | yes | yes | yes | none |
| Benchmarking & comparative | FR-14 | yes | yes | n/a | yes | none |
| NL query & embedded BI | FR-15 | yes | yes | n/a | yes | none |
| Mobile & executive briefing | FR-16 | yes | yes | yes | yes | none |
| Reads across M01–M13 (read-only) | FR-03,05,06,07 + §8.5 | yes | yes | n/a | yes | none |
| Audit of view/drill/export | FR-01,09,10 + E16 | yes | yes | n/a | yes | none |

**Result: 0 unresolved gaps.** Every module-focus capability (role-based dashboards, KPI tiles/charts/drill-down, workforce analytics, per-module operational analytics, compliance/statutory dashboards, self-service report builder, scheduled distribution, multi-format export, configurable KPI definitions, alerting/thresholds, data-freshness indicators, drill-through to source, analytics data layer with RLS, predictive analytics, benchmarking, NL query, embedded BI, mobile dashboards) maps to at least one FR with entities, APIs, states (where stateful), and tests.

---

## 15. Glossary

| Term | Definition |
|---|---|
| KPI | Key Performance Indicator — a governed, versioned metric definition computed consistently across surfaces |
| Data mart | A purpose-built, pre-aggregated analytical dataset derived read-only from source modules |
| Semantic model | Business-friendly mapping of names/dimensions to physical mart columns used by the builder and NL query |
| Materialised view | Precomputed query result refreshed on a schedule for fast reads |
| ETL | Extract-Transform-Load pipeline populating marts from sources |
| Watermark | High-water value marking the last incrementally loaded record for a mart |
| RLS | Row-Level Security — query-time filtering of rows to a user's permitted scope |
| Scope | The set of records (org subtree / reporting line / delegated units) a user may see |
| Drill-down | Navigating an aggregate to finer grain within analytics |
| Drill-through | Navigating from an analytics leaf to the authoritative source record (read-only, permissioned) |
| Freshness / data_as_of | The timestamp of the source data underlying a value, and its staleness state |
| Sanctioned vs filled | Establishment strength (authorised posts) versus posts currently occupied; difference = vacancy |
| Reservation roster | Statutory roster of posts by reservation category and roster points for compliance |
| SR verification | Digital Service Register verification status (sourced read-only from M12) |
| SLA breach | A pending workflow task aged past its configured service-level threshold |
| Succession risk | Exposure where a critical role has thin or high-risk bench strength |
| k-anonymity / small-cell suppression | Hiding aggregates/drill-through for groups below a privacy threshold |
| Burst | Generating one scope-correct report copy per dimension value (e.g., per org unit) |
| Embed token | A scoped, signed, expiring token rendering a widget in another app under the same RLS |
| Advisory output | A predictive/estimated figure labelled non-authoritative, never written to source modules |

---

## 16. Appendices

### 16.1 Mart Catalog (illustrative)

| Mart | Type | Grain | Sources | Refresh | Freshness SLA |
|---|---|---|---|---|---|
| MART_HEADCOUNT | AGGREGATE | employee×org_unit×period | M01 | INCREMENTAL | 60 min |
| MART_LEAVE_FACT | FACT | leave_application | M03,M04 | CDC | 30 min |
| MART_ATTENDANCE_FACT | FACT | attendance_day | M03 | CDC | 30 min |
| MART_PAYROLL_COST | AGGREGATE | org_unit×component×period | M10 (locked) | INCREMENTAL | daily |
| MART_TRAINING | AGGREGATE | employee×competency×period | M07 | INCREMENTAL | daily |
| MART_APPRAISAL | AGGREGATE | org_unit×rating×cycle | M08 | INCREMENTAL | daily |
| MART_DISCIPLINARY | FACT | case | M09 | INCREMENTAL | hourly |
| MART_PIPELINE | FACT | transfer/promotion case | M05,M06 | INCREMENTAL | hourly |
| MART_PENSION_FORECAST | AGGREGATE | employee×horizon | M11 | daily | daily |
| MART_SR_STATUS | FACT | employee SR verification | M12 | INCREMENTAL | hourly |
| MART_WORKFLOW_SLA | FACT | workflow_task | Workflow engine | CDC | 15 min |
| MART_RESERVATION | AGGREGATE | org_unit×category×roster_point | M01 + establishment ref | daily | daily |

### 16.2 KPI Calculation Reference (illustrative)

| KPI | Definition |
|---|---|
| HEADCOUNT_ACTIVE | `COUNT(employee_id) WHERE employment_status='ACTIVE'` at scope/period |
| ATTRITION_RATE | `leavers_in_window / avg_headcount_in_window × 100` (excludes internal transfers) |
| VACANCY_PCT | `(sanctioned − filled) / sanctioned × 100` by cadre/post |
| RETIREMENT_DUE_COUNT | `COUNT(employee_id) WHERE retirement_date BETWEEN now AND now+horizon` |
| MANDATORY_TRAINING_PCT | `completed_mandatory / required_mandatory × 100` |
| RESERVATION_COMPLIANCE_PCT | `filled_against_category / sanctioned_for_category × 100` vs roster points |
| PENDING_SLA_BREACH | `COUNT(workflow_task) WHERE status='PENDING' AND age > sla_threshold` |
| ABSENTEEISM_RATE | `lwp_days / scheduled_days × 100` at scope/period |

### 16.3 Freshness State Semantics

| State | Meaning | UI |
|---|---|---|
| FRESH | Within freshness SLA | Green chip |
| STALE | Past SLA, last good served | Amber chip + tooltip |
| DEGRADED | Reconciliation variance / partial load | Amber/red + warning |
| FAILED | Refresh failed; last good retained | Red banner + icon |
| NO_DATA | Never refreshed / empty | Grey "no data yet" |

### 16.4 Privacy & Suppression Policy

- Small-cell suppression default `k=5` for sensitive demographic/diversity breakdowns and drill-through.
- RESTRICTED fields (salary, individual ratings, disciplinary detail, individual risk scores) masked unless explicit field grant.
- View/drill/export of RESTRICTED data always audited with row counts.

### 16.5 Assumptions Log

- Marts refresh read-only from source schemas/CDC; M14 never writes source tables.
- RBAC + org hierarchy is authoritative for scope; M14 mirrors, never redefines.
- Payroll/cost analytics use locked snapshots only.
- Predictive outputs are advisory and never recorded against source modules.
- Single legal entity; mart schema is entity-aware for future multi-entity.
- Reservation/cadre/retirement rules use canonical reference data owned by the relevant modules.
