# G14 — Dashboard and Analytics — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | **G14 — Dashboard and Analytics** (alias GOV-M14; extends PrimeSoft M16 Reports & Analytics on the `analytics.*` entitlement) |
| Version tested | BRD v3.0 (platform re-grounded, 23 FRs) · OpenAPI `G14.yaml` v3.0.0 |
| Scope | Role-based dashboards & widgets; governed versioned KPIs with bitemporal snapshots & effective-dated targets; analytics data-mart layer (ETL on X.1); permission-scoped access declared by `analytics_scope_policy` and **enforced by platform P02**; metric-level complementary suppression (FR-17); self-service report builder; scheduled distribution & multi-format export (PDF/XLSX/CSV); drill-down & P02-gated drill-through; alerting & thresholds; data-freshness & reconciliation; deterministic retirement forecasting; fairness-governed probabilistic prediction; governed NL query & hardened embedded BI; establishment/position reference; DPDP rectification/erasure propagation; source data contracts; access-anomaly detection. |
| Out of scope | Transactional writes to G01–G13 (read-only via marts); RBAC/auth authoring (P02/RBAC v1.7 consumed); workflow engine internals (P01); audit substrate internals (P05); SR ledger writes (G12); adjudication of roster decisions / post approval. |
| Traceability sources | BRD `docs/brd/v3/G14-dashboard-and-analytics.md` (FR AC / BR / edge cases / §10 state tables); `docs/contracts/openapi/G14.yaml`; `docs/contracts/error-taxonomy.yaml` (`ERR-G14-*` + 8 standard codes + shared `ERR-*`); `docs/contracts/state-machines.yaml` (G14 machines); `docs/contracts/auth-matrix.yaml` (G14 actions). |

### 1.1 Test-Environment & Data Assumptions

- **Multi-tenant:** every analytics entity carries non-nullable `tenant_id` (+ `entity_id` where entity-scoped); a request without a resolvable tenant scope is **rejected, not defaulted to "all"**. Cross-entity reach = `org_admin`; cross-tenant = `platform_super_admin`.
- **Personas (JWT carries resolved roles + tenant/entity scope):** `EMP` employee (self only); `MGR` reporting manager (L1–L5/HOD, P02 reporting-chain scope over reports R1..Rn); `HR` hr_admin (delegated org-units OU-A, OU-B); `DEPT` department head (subtree OU-DEPT); `EXEC` executive/CEO (entity-wide, read-only); `AUD` auditor (org-admin read + read-only entitlement, P05 query); `AADM` analytics_admin (`analytics.*`, KPI/dashboard/suppression steward + checker); `DENG` data engineer (`analytics_data_engineer` flag, no publication); `ESTO` establishment officer; `DPO` data protection officer; `ORG` org_admin (scope-policy maker).
- **Reference data:** two org subtrees OU-A (manager MGR-A over 40 staff), OU-B (out of MGR-A scope); `establishment_position` seeded for OU-A cadres with sanctioned strength; sensitive source marts present for G09 (disciplinary), G10 (payroll, LOCKED snapshots), G11 (pension). A "small cell" fixture (group size 3, `k`=5) exists in OU-A diversity.
- **Platform conventions asserted on every call:** `X-Correlation-Id` echoed on every response; `Idempotency-Key` required on unsafe/workflow POSTs (24h replay); cursor pagination `?limit=` (default 25, max 100) + `cursor`/`next_cursor`; canonical error envelope `{ error: { code, message, field, details } }`; **403/404 never reveal existence of out-of-scope records**; no `400/423/502/503` on the wire (upstream/mart failure → `412` retryable or `500` + `ERR-LOADFAIL`).
- **Enforcement note:** G14 never re-implements permission logic; it calls `Authorization.check({subject,action,resource_ref,fields[]}) → {allowed, scope_filter, field_mask[]}` (P02). Suppression (FR-17) is applied **after** P02, server-side.

### 1.2 Error-code quick reference (asserted below)

`ERR-G14-SCOPE-CHECKER`(403), `ERR-G14-PUBLISH-CHECKER`(403), `ERR-G14-WIDGET-BINDING`(409), `ERR-G14-SMALL-CELL`(403), `ERR-G14-COMP-SUPPRESS`(403/notice), `ERR-G14-KPI-EXPR`(422), `ERR-G14-KPI-VER-OVERLAP`(409), `ERR-G14-XVER-AGG`(409), `ERR-G14-MART-UNAVAIL`(412), `ERR-G14-MART-REFRESH`(500/`ERR-LOADFAIL`), `ERR-G14-MART-BUSY`(409), `ERR-G14-CONTRACT`(409), `ERR-G14-EXPORT-LIMIT`(422), `ERR-G14-CHANNEL`(403), `ERR-G14-PAYROLL-LOCK`(412), `ERR-G14-METRIC-NA`(404), `ERR-G14-NLQ-CLARIFY`(422), `ERR-G14-NLQ-CONF`(422), `ERR-G14-EMBED-INVALID`(401), `ERR-G14-EMBED-REVOKED`(401), `ERR-G14-METHODOLOGY`(422), `ERR-G14-FAIRNESS`(422), `ERR-G14-PRED-GATED`(403), `ERR-G14-ESTAB-MISSING`(422/notice), `ERR-G14-ERASURE-PENDING`(409/notice), `ERR-G14-RETENTION-BLOCK`(409/notice), `ERR-G14-ASOF-NA`(404); shared: `ERR-FORBIDDEN`(403), `ERR-LOADFAIL`(500), `ERR-PRECOND`(412), `ERR-PAST-DATED`(422), `MSG-SYS-JOBFAIL`(500); standard: `UNAUTHENTICATED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `CONFLICT`(409), `PRECONDITION_FAILED`(412), `VALIDATION_FAILED`(422), `RATE_LIMITED`(429), `INTERNAL`(500).

---

## 2. Test Cases

### FR-G14-01 — Role-Based Dashboard Framework & Layout

#### TC-G14-001
- **Traces-to:** FR-G14-01 / AC1
- **Type:** Functional
- **Title:** Create dashboard, add catalog widgets, save DRAFT
- **Priority:** P2
- **Preconditions:** AADM authenticated; an ACTIVE KPI `HEADCOUNT_ACTIVE` exists.
- **Test data:** `POST /analytics/dashboards` `{dashboard_code:"MGR_TEAM", target_role:"MANAGER", category:"WORKFORCE", layout_json:{...}}`; then `POST /analytics/dashboards/{id}/widgets` `{widget_type:"KPI_TILE", kpi_id:<HEADCOUNT_ACTIVE>}`.
- **Steps:** 1) Create dashboard. 2) Add a KPI_TILE widget on the grid. 3) GET the dashboard.
- **Expected:** `201` dashboard `status=DRAFT`; `201` widget bound to KPI; GET returns definition + widget; `X-Correlation-Id` present. `Idempotency-Key` accepted.

#### TC-G14-002
- **Traces-to:** FR-G14-01 / AC2; state-machines `dashboard`
- **Type:** State-Transition
- **Title:** Publishing a COMPLIANCE dashboard requires a checker (P01, checker ≠ maker)
- **Priority:** P1
- **Preconditions:** AADM (maker) created a COMPLIANCE dashboard DRAFT with all bindings ACTIVE; second AADM/checker available.
- **Test data:** `POST /analytics/dashboards/{id}:publish` as maker, then as distinct checker.
- **Steps:** 1) Maker publishes → routed to P01. 2) Distinct checker approves.
- **Expected:** Maker call routes to P01 checker (not immediately PUBLISHED); checker approval transitions `DRAFT→PUBLISHED`, `published_by ≠ created_by`; non-gated (PERSONAL/WORKFORCE) categories may self-publish within authority.

#### TC-G14-003
- **Traces-to:** FR-G14-01 / AC2 (failure); ERR-G14-PUBLISH-CHECKER
- **Type:** Negative
- **Title:** Maker self-publishes a gated dashboard → blocked
- **Priority:** P1
- **Preconditions:** COMPLIANCE dashboard DRAFT created by AADM-1.
- **Test data:** `POST /analytics/dashboards/{id}:publish` where publisher == creator on the gated category.
- **Steps:** Maker attempts to self-approve the gated publication.
- **Expected:** `403` `{error.code:"ERR-G14-PUBLISH-CHECKER"}`; dashboard remains DRAFT; SoD enforced by P01/P02.

#### TC-G14-004
- **Traces-to:** FR-G14-01 / AC3; FR-G14-04
- **Type:** Authorization-RLS
- **Title:** Consumer sees only P02-permitted widgets; unauthorised widgets omitted (not shown empty)
- **Priority:** P1
- **Preconditions:** Published dashboard has a workforce widget (MGR-permitted) and a payroll-cost widget (RESTRICTED, MGR not permitted).
- **Test data:** `GET /analytics/dashboards/{id}/render` as MGR-A.
- **Steps:** Render the dashboard as MGR-A.
- **Expected:** `200`; payroll widget is **omitted** from the render (not present as an empty/loading tile); P02 does not reveal existence of the out-of-scope tile; workforce widget returns MGR-A scoped data.

#### TC-G14-005
- **Traces-to:** FR-G14-01 / AC4, BR3
- **Type:** Functional
- **Title:** Personal saved_view set as default does not mutate the template
- **Priority:** P3
- **Preconditions:** MGR-A can render MGR_TEAM.
- **Test data:** `POST /analytics/saved-views` `{target_type:"DASHBOARD", target_id:<id>, is_default:true, visibility:"PRIVATE"}`.
- **Steps:** 1) MGR-A saves a filtered view as default. 2) HR renders same dashboard.
- **Expected:** `201`; MGR-A default view isolated to MGR-A; HR's render unaffected (per-user personalisation).

#### TC-G14-006
- **Traces-to:** FR-G14-01 / AC6; FR-G14-10 access-log
- **Type:** Data-Integrity
- **Title:** Dashboard view writes async VIEW_DASHBOARD access-log mirrored to P05
- **Priority:** P2
- **Preconditions:** AUD can query the access log.
- **Test data:** MGR-A renders dashboard; `GET /analytics/access-log?action=VIEW_DASHBOARD&user_id=<MGR-A>`.
- **Steps:** 1) Render. 2) Query access-log as AUD.
- **Expected:** `200`; an access-log row exists for the render (async), carrying `X-Correlation-Id`, mirrored to P05; **reading the access-log is itself audited**.

#### TC-G14-007
- **Traces-to:** FR-G14-01 / BR1, BR2; ERR-G14-WIDGET-BINDING
- **Type:** API-Contract
- **Title:** Widget bound to a RETIRED/missing KPI blocks add/publish
- **Priority:** P2
- **Preconditions:** KPI `X` is RETIRED.
- **Test data:** `POST /analytics/dashboards/{id}/widgets` `{kpi_id:<RETIRED X>}`.
- **Steps:** Attempt to add a widget bound to a retired KPI.
- **Expected:** `409` `{error.code:"ERR-G14-WIDGET-BINDING"}`; a dashboard with a RETIRED/DRAFT binding cannot be published.

#### TC-G14-008
- **Traces-to:** FR-G14-01 / AC7, BR5
- **Type:** Functional
- **Title:** Consumer KPI tile renders governed plain-language definition; consumer palette trimmed
- **Priority:** P3
- **Preconditions:** KPI has `plain_language_note`; `show_plain_definition=true`.
- **Test data:** `GET /analytics/dashboards/{id}/render` as EXEC.
- **Steps:** Render an executive consumer dashboard.
- **Expected:** `200`; each KPI tile carries the plain-language definition inline/one-tap; MAP/FUNNEL widget types are not offered on the consumer palette (authoring catalog retains them).

### FR-G14-02 — KPI Definition & Calculation Engine

#### TC-G14-009
- **Traces-to:** FR-G14-02 / AC1
- **Type:** Functional
- **Title:** Create a KPI version in DRAFT with expression, grain, sensitivity, tolerance
- **Priority:** P2
- **Preconditions:** AADM; `MART_HEADCOUNT` registered.
- **Test data:** `POST /analytics/kpis` `{kpi_code:"VACANCY_PCT", expression:"...", grain:"ORG_UNIT", unit:"PERCENT", sensitivity:"INTERNAL", reconciliation_tolerance:0}`.
- **Steps:** Create the KPI definition.
- **Expected:** `201` `status=DRAFT`, `definition_hash` (SHA-256) computed and returned.

#### TC-G14-010
- **Traces-to:** FR-G14-02 / AC2; ERR-G14-KPI-EXPR
- **Type:** Negative
- **Title:** Expression referencing unknown column / disallowed function is rejected with location
- **Priority:** P2
- **Preconditions:** AADM.
- **Test data:** `POST /analytics/kpis` `{expression:"SUM(nonexistent_col) / EVAL(os.system)"}`.
- **Steps:** Submit an invalid DSL expression.
- **Expected:** `422` `{error.code:"ERR-G14-KPI-EXPR", field:"expression", details.location:...}`; only whitelisted functions/columns permitted.

#### TC-G14-011
- **Traces-to:** FR-G14-02 / AC3, AC6; state-machines `kpi_definition`; ERR-G14-KPI-VER-OVERLAP, ERR-G14-PUBLISH-CHECKER
- **Type:** State-Transition
- **Title:** Activating a new KPI version retires the prior; no two ACTIVE per kpi_code; SoD
- **Priority:** P1
- **Preconditions:** `VACANCY_PCT` v1 ACTIVE; v2 DRAFT by maker AADM-1.
- **Test data:** `POST /analytics/kpis/{v2}:activate` as maker, then as checker AADM-2.
- **Steps:** 1) Maker self-activates. 2) Checker activates.
- **Expected:** Maker self-activate → `403 ERR-G14-PUBLISH-CHECKER`; checker activation → `200`, v1 auto-`RETIRED`, v2 `ACTIVE`; a forced second ACTIVE for the same `kpi_code` → `409 ERR-G14-KPI-VER-OVERLAP`.

#### TC-G14-012
- **Traces-to:** FR-G14-02 / AC5
- **Type:** Boundary
- **Title:** Slicing a KPI by a dimension not in `dimensions_allowed` is rejected
- **Priority:** P2
- **Preconditions:** `VACANCY_PCT.dimensions_allowed=[cadre, org_unit]`.
- **Test data:** `GET /analytics/kpis/VACANCY_PCT/value?scope=...&dimension=religion`.
- **Steps:** Request a value sliced by a disallowed dimension.
- **Expected:** `422 VALIDATION_FAILED` naming the disallowed dimension; no computation performed.

#### TC-G14-013
- **Traces-to:** FR-G14-02 / AC4, BR4, BR5; FR-G14-23
- **Type:** Data-Integrity
- **Title:** Computing a KPI writes a reproducible bitemporal snapshot stamped with version + definition_hash
- **Priority:** P1
- **Preconditions:** `VACANCY_PCT` v2 ACTIVE; `MART_HEADCOUNT` HEALTHY.
- **Test data:** `GET /analytics/kpis/VACANCY_PCT/value?scope=OU-A&period=2026-06`.
- **Steps:** Compute the value twice with identical inputs.
- **Expected:** `200`; snapshot persisted with `kpi_version`, `definition_hash`, `valid_time`, `knowledge_time`, `data_as_of`, `is_partial=false`; recomputation is deterministic (same value/hash). Snapshots computed only when mart health ∈ {HEALTHY, STALE}.

#### TC-G14-014
- **Traces-to:** FR-G14-02 / AC7; ERR-G14-XVER-AGG
- **Type:** Negative
- **Title:** Cross-version trend aggregation blocked without acknowledgement
- **Priority:** P2
- **Preconditions:** Trend window spans `VACANCY_PCT` v1 and v2 (different `definition_hash`).
- **Test data:** `GET /analytics/kpis/VACANCY_PCT/trend?from=2026-01&to=2026-06`.
- **Steps:** Request a trend crossing a definition version boundary.
- **Expected:** Series renders a discontinuity/version marker; an aggregation across versions returns `409 ERR-G14-XVER-AGG` unless explicitly acknowledged.

#### TC-G14-015
- **Traces-to:** FR-G14-02 / AC8, BR5; FR-G14-11 BR5
- **Type:** Functional
- **Title:** Target-vs-actual uses the effective-dated `kpi_target_history` value in force for the shown period
- **Priority:** P2
- **Preconditions:** Target T1 effective 2026-01, T2 effective 2026-06 for `VACANCY_PCT`.
- **Test data:** `GET /analytics/benchmark/target?kpi=VACANCY_PCT&scope=OU-A&period=2026-03` and `...&period=2026-06`.
- **Steps:** Request attainment for a March period and a June period.
- **Expected:** March uses T1, June uses T2 (period-correct effective-dated target); RAG derived from `direction`.

#### TC-G14-016
- **Traces-to:** FR-G14-02 targets; VAL-EFFECTIVE; ERR-PAST-DATED
- **Type:** Boundary
- **Title:** Setting an effective-dated target before the current effective date is rejected
- **Priority:** P3
- **Preconditions:** Current target effective_from 2026-06.
- **Test data:** `POST /analytics/kpis/{id}/targets` `{effective_from:"2026-01-01"}`.
- **Steps:** Attempt a past-dated target.
- **Expected:** `422` `{error.code:"ERR-PAST-DATED", field:"effective_from", details.reason:"PAST_DATED"}`.

### FR-G14-03 — Analytics Data Layer (marts + ETL on X.1)

#### TC-G14-017
- **Traces-to:** FR-G14-03 / AC1, AC2
- **Type:** Functional
- **Title:** Register a mart with X.1 job; scheduled incremental refresh advances watermark idempotently
- **Priority:** P2
- **Preconditions:** DENG (`analytics_data_engineer`); governing contract exists.
- **Test data:** `POST /analytics/marts` `{mart_code:"MART_HEADCOUNT", refresh_strategy:"INCREMENTAL", refresh_job_id:"JOB-G14-MART-HC", freshness_sla_minutes:60}`; then `POST /analytics/marts/{id}:refresh`.
- **Steps:** 1) Register mart. 2) Trigger refresh; replay with same per-period run key.
- **Expected:** `201` mart; `202` refresh enqueued on X.1; refresh log records rows read/written + new watermark; replay of the same run key is idempotent (no double-apply).

#### TC-G14-018
- **Traces-to:** FR-G14-03 / AC3; FR-G14-12
- **Type:** Data-Freshness
- **Title:** Mart past freshness SLA is marked STALE
- **Priority:** P2
- **Preconditions:** `MART_HEADCOUNT.freshness_sla_minutes=60`; last refresh 90 min ago.
- **Test data:** `GET /analytics/marts/{id}/health`.
- **Steps:** Query mart health after SLA elapses without refresh.
- **Expected:** `200` `health_status=STALE`; dependent surfaces render a STALE indicator (FR-12).

#### TC-G14-019
- **Traces-to:** FR-G14-03 / AC4, BR3; state-machines mart health; ERR-G14-MART-REFRESH, MSG-SYS-JOBFAIL
- **Type:** State-Transition
- **Title:** Failed refresh marks mart FAILED, retains last-good, raises JOB-FAIL + alert
- **Priority:** P1
- **Preconditions:** ETL source injected to error mid-run.
- **Test data:** `POST /analytics/marts/{id}:refresh` against the failing source.
- **Steps:** Trigger a refresh that errors terminally.
- **Expected:** Mart `health_status=FAILED`; **last-good data retained**; `datamart_refresh_log.status=FAILED`; `JOB-FAIL → MSG-SYS-JOBFAIL` (X.1) + X.2 alert; API surface returns `500 ERR-G14-MART-REFRESH` (`ERR-LOADFAIL`); consumers fall back to last-good snapshot with stale flag.

#### TC-G14-020
- **Traces-to:** FR-G14-03 / AC5, edge (CDC lag)
- **Type:** Data-Integrity
- **Title:** Watermark-relative reconciliation: transient CDC lag does not raise a false DEGRADED
- **Priority:** P1
- **Preconditions:** `reconcile_grace_minutes` configured; CDC stream lags within grace, then variance sustains beyond grace.
- **Test data:** Compare mart-at-W to source-as-of-W across two windows.
- **Steps:** 1) Introduce transient lag inside grace. 2) Sustain variance beyond per-KPI tolerance past the grace window.
- **Expected:** Step 1 → mart stays HEALTHY/STALE, **no DEGRADED** (reconciliation is watermark-relative); Step 2 → `health_status=DEGRADED` + alert. Reconciliation compares at the same watermark, not wall-clock.

#### TC-G14-021
- **Traces-to:** FR-G14-03 / edge (concurrent refresh); ERR-G14-MART-BUSY
- **Type:** Negative
- **Title:** Concurrent manual + scheduled refresh contends on mart lock
- **Priority:** P3
- **Preconditions:** A refresh is running (lock held).
- **Test data:** `POST /analytics/marts/{id}:refresh` while a run is in flight.
- **Steps:** Trigger a second refresh concurrently.
- **Expected:** `409 ERR-G14-MART-BUSY`; the second run is queued (X.1 isolation), not run in parallel.

#### TC-G14-022
- **Traces-to:** FR-G14-02 BR4 / FR-G14-03 BR3; ERR-G14-MART-UNAVAIL
- **Type:** API-Contract
- **Title:** KPI compute against a FAILED/absent mart returns a precondition failure
- **Priority:** P2
- **Preconditions:** `MART_HEADCOUNT` FAILED.
- **Test data:** `GET /analytics/kpis/HEADCOUNT_ACTIVE/value?scope=OU-A&period=2026-06`.
- **Steps:** Compute a KPI whose source mart is FAILED.
- **Expected:** `412 ERR-G14-MART-UNAVAIL` (precondition unmet). No `503` on the wire.

### FR-G14-04 — Permission-Scoped Access via Platform P02 (CRITICAL — RLS)

#### TC-G14-023
- **Traces-to:** FR-G14-04 / AC1
- **Type:** Authorization-RLS
- **Title:** Manager dashboard returns only direct + indirect reports (P02 reporting-chain dimension)
- **Priority:** P1
- **Preconditions:** MGR-A over reports R1..R40 (OU-A); OU-B staff outside MGR-A chain.
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-A` as MGR-A.
- **Steps:** Render/query headcount as MGR-A.
- **Expected:** `200`; result set restricted to MGR-A's reporting chain; no OU-B rows; `scope_filter` from P02 applied at the data layer.

#### TC-G14-024
- **Traces-to:** FR-G14-04 / AC2
- **Type:** Authorization-RLS
- **Title:** HR Admin sees only delegated org units / UAG (P02 dimensions)
- **Priority:** P1
- **Preconditions:** HR delegated OU-A, OU-B; OU-C not delegated.
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-C` as HR.
- **Steps:** Query a non-delegated org unit.
- **Expected:** OU-C rows filtered out by P02; requesting OU-C directly yields empty/`403`-per-policy without revealing OU-C existence.

#### TC-G14-025
- **Traces-to:** FR-G14-04 / AC4; FR-G14-10 AC5; ERR-FORBIDDEN — KEY CROSS-SCOPE LEAK RISK
- **Type:** Authorization-RLS
- **Title:** Cross-scope leak attempt (manager queries another manager's team) is denied without existence reveal
- **Priority:** P1
- **Preconditions:** MGR-A and MGR-B disjoint teams; R-B99 belongs to MGR-B.
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-B` and `GET /analytics/widgets/{id}/drillthrough?rowKey=R-B99` as MGR-A.
- **Steps:** MGR-A attempts to read MGR-B's aggregate and drill to R-B99.
- **Expected:** `403 ERR-FORBIDDEN` (or empty scoped set for the aggregate); the response is **indistinguishable from "record absent"** — no `404` that confirms R-B99 exists; event written to `security_audit_log`.

#### TC-G14-026
- **Traces-to:** FR-G14-04 / AC6; FR-G14-06 BR2 — KEY: sensitive G09/G10/G11 no cross-scope leak
- **Type:** Authorization-RLS
- **Title:** Scope-leak matrix — no role returns G09-disciplinary / G10-payroll / G11-pension data outside its P02 scope
- **Priority:** P1
- **Preconditions:** Seeded disciplinary cases, payroll cost, pension records across OU-A and OU-B.
- **Test data:** Iterate personas {EMP, MGR-A, HR(OU-A,B), DEPT(OU-DEPT), EXEC} × sensitive endpoints {`/operational/disciplinary`, `/operational/payroll-cost`, `/operational/pension-forecast`}.
- **Steps:** For each (persona, endpoint), request in-scope and out-of-scope; diff against an oracle of entitled rows.
- **Expected:** Every response ⊆ persona's P02 entitled set; **zero rows** from any out-of-scope OU; EMP excluded from all aggregates; automated matrix passes with 0 leaks (launch gate).

#### TC-G14-027
- **Traces-to:** FR-G14-04 / AC3, BR3; FR-G14-06 AC4
- **Type:** Authorization-RLS
- **Title:** RESTRICTED field masked by P02 on serialization; PII ceiling cannot be lifted
- **Priority:** P1
- **Preconditions:** Appraisal mart has RESTRICTED `individual_rating`; MGR-A lacks field grant; AUD has read-all but not the PII-ceiling override.
- **Test data:** `GET /analytics/operational/appraisal?scope=OU-A` as MGR-A and as AUD.
- **Steps:** Request appraisal distribution as each role; attempt to request the raw RESTRICTED field.
- **Expected:** Individual ratings masked/excluded by P02 for MGR-A; AUD sees aggregates but the **PII ceiling still masks** the field unless explicitly granted; export header notes masking; no role can lift the ceiling.

#### TC-G14-028
- **Traces-to:** FR-G14-04 / edge (multi-role INTERSECTION)
- **Type:** Authorization-RLS
- **Title:** Multi-role user gets the most-restrictive intersection (P02 INTERSECTION)
- **Priority:** P2
- **Preconditions:** User U holds MGR (OU-A chain) and a narrower delegated-unit role (subset of OU-A).
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-A` as U.
- **Steps:** Query with the union-looking scope.
- **Expected:** Result equals the **intersection** (narrower), not the union; more restrictive dimension wins.

#### TC-G14-029
- **Traces-to:** FR-G14-04 / AC7; state-machines `analytics_scope_policy`; ERR-G14-SCOPE-CHECKER
- **Type:** State-Transition
- **Title:** Scope-policy change is maker-checked; self-approval blocked
- **Priority:** P1
- **Preconditions:** ORG (maker) drafts a scope policy; a distinct checker (AADM) available.
- **Test data:** `POST /analytics/scope-policies` (maker) → `:approve` by the same maker, then by the distinct checker.
- **Steps:** 1) Create DRAFT. 2) Submit → PENDING_APPROVAL. 3) Maker self-approves. 4) Distinct checker approves.
- **Expected:** `DRAFT→PENDING_APPROVAL`; maker self-approve → `403 ERR-G14-SCOPE-CHECKER`; checker approve → `ACTIVE`, prior version `SUPERSEDED`, written to `security_audit_log`.

#### TC-G14-030
- **Traces-to:** FR-G14-04 / AC8, BR5
- **Type:** Functional
- **Title:** Preview-as-role exposure diff captures before/after row counts; broadening flagged
- **Priority:** P2
- **Preconditions:** A DRAFT scope policy that broadens a role from org_unit to entity scope.
- **Test data:** `POST /analytics/scope-policies/{id}:preview-as-role` `{role:"HR_ADMIN"}`.
- **Steps:** Compute the exposure diff before approval.
- **Expected:** `200` `ScopeExposureDiff` with before/after resolved P02 scope + row counts persisted to `preview_diff_json`; broadening to entity/enterprise is flagged for the checker.

#### TC-G14-031
- **Traces-to:** FR-G14-04 / edge (empty scope)
- **Type:** Authorization-RLS
- **Title:** Manager with no reports gets an explanatory empty scope, not an error
- **Priority:** P3
- **Preconditions:** MGR-NONE has zero reports.
- **Test data:** `GET /analytics/dashboards/{id}/render` as MGR-NONE.
- **Steps:** Render a team dashboard.
- **Expected:** `200` with an empty-state (no data in scope); not a `403`/`500`.

### FR-G14-05 — Workforce Analytics

#### TC-G14-032
- **Traces-to:** FR-G14-05 / AC1
- **Type:** Functional
- **Title:** Headcount by scope with drill org_unit → office → designation
- **Priority:** P2
- **Preconditions:** DEPT over OU-DEPT.
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-DEPT&dimension=designation`.
- **Steps:** Render headcount and drill down one level.
- **Expected:** `200` active counts by scope; drilldown returns the next level P02-scoped + suppressed; `dataFreshness` block present.

#### TC-G14-033
- **Traces-to:** FR-G14-05 / AC2, BR3
- **Type:** Data-Integrity
- **Title:** Attrition rate = leavers / avg headcount, excludes internal transfers (G05)
- **Priority:** P1
- **Preconditions:** Fixture: 5 resignations, 2 retirements, 3 internal transfers in window.
- **Test data:** `GET /analytics/workforce/attrition?scope=OU-A&period=2026-Q2`.
- **Steps:** Compute attrition for the window.
- **Expected:** Numerator counts 7 (resignations+retirements+terminations) and **excludes the 3 transfers**; categories separated; matches the deterministic oracle.

#### TC-G14-034
- **Traces-to:** FR-G14-05 / AC3, BR1; FR-G14-19
- **Type:** Data-Integrity
- **Title:** Vacancy = sanctioned (establishment) − filled, pinned to `establishment_position`
- **Priority:** P1
- **Preconditions:** OU-A cadre sanctioned=50, filled=42.
- **Test data:** `GET /analytics/workforce/vacancy?scope=OU-A`.
- **Steps:** Request vacancy by cadre.
- **Expected:** vacant=8, vacancy%=16%, denominator sourced from `establishment_position` (not headcount-derived).

#### TC-G14-035
- **Traces-to:** FR-G14-05 / BR1; FR-G14-19 AC4; ERR-G14-ESTAB-MISSING
- **Type:** Negative
- **Title:** Vacancy with absent establishment reference surfaces a notice, never a silent zero
- **Priority:** P2
- **Preconditions:** OU-X has no `establishment_position` rows.
- **Test data:** `GET /analytics/workforce/vacancy?scope=OU-X`.
- **Steps:** Request vacancy where establishment data is missing.
- **Expected:** `200` with a notice-surface `ERR-G14-ESTAB-MISSING` (denominator unknown), **not** vacancy=0.

#### TC-G14-036
- **Traces-to:** FR-G14-05 / AC4; FR-G14-13
- **Type:** Boundary
- **Title:** Retirement profile buckets at exact 1/3/5-year horizon boundaries
- **Priority:** P2
- **Preconditions:** Employees with retirement dates at exactly +1Y, +1Y+1day, +3Y, +5Y, +5Y+1day.
- **Test data:** `GET /analytics/workforce/retirement-profile?scope=OU-A`.
- **Steps:** Request horizon counts.
- **Expected:** Boundary inclusion consistent with canonical rule; +5Y+1day excluded from the 5Y bucket; already-separated excluded; invalid DOB excluded with data-quality flag.

#### TC-G14-037
- **Traces-to:** FR-G14-05 / AC6; FR-G14-17
- **Type:** Privacy-Suppression
- **Title:** Diversity composition suppresses/bands small reservation-category cells
- **Priority:** P1
- **Preconditions:** A reservation-category cell with group size 3 (< k=5) in OU-A.
- **Test data:** `GET /analytics/workforce/headcount?scope=OU-A&dimension=reservation_category`.
- **Steps:** Request the diversity donut data.
- **Expected:** Small cell rendered "<5"/banded; `ERR-G14-SMALL-CELL` annotation; complementary cell also suppressed so the small cell is not recoverable from the visible total.

### FR-G14-06 — Operational Analytics

#### TC-G14-038
- **Traces-to:** FR-G14-06 / AC2, BR... ; ERR-G14-PAYROLL-LOCK
- **Type:** Data-Integrity
- **Title:** Payroll-cost analytics read only LOCKED snapshots; missing lock → precondition failure
- **Priority:** P1
- **Preconditions:** June payroll LOCKED; July in-progress (unlocked).
- **Test data:** `GET /analytics/operational/payroll-cost?scope=OU-A&period=2026-06` and `...&period=2026-07`.
- **Steps:** Request cost for a locked and an unlocked period.
- **Expected:** June returns locked figures (in-progress excluded); July → `412 ERR-G14-PAYROLL-LOCK` (locked snapshot unavailable).

#### TC-G14-039
- **Traces-to:** FR-G14-06 / AC5
- **Type:** Functional
- **Title:** Disciplinary case-aging buckets (0-30/31-90/90+) without leaking case detail
- **Priority:** P2
- **Preconditions:** HR over OU-A; disciplinary cases across buckets.
- **Test data:** `GET /analytics/operational/disciplinary?scope=OU-A`.
- **Steps:** Request case-aging.
- **Expected:** `200` counts per bucket; no case narrative/subject beyond P02 permission; RESTRICTED masked.

#### TC-G14-040
- **Traces-to:** FR-G14-06 / AC6
- **Type:** Functional
- **Title:** Transfer/promotion pipeline funnel by stage with ageing + SLA
- **Priority:** P3
- **Preconditions:** Pipeline records across G05/G06 stages.
- **Test data:** `GET /analytics/operational/pipeline?scope=OU-A`.
- **Steps:** Request the funnel.
- **Expected:** `200` stage counts + ageing + SLA flags; P02-scoped + suppressed.

### FR-G14-07 — Compliance & Statutory Dashboards

#### TC-G14-041
- **Traces-to:** FR-G14-07 / AC1, BR1; FR-G14-19
- **Type:** Data-Integrity
- **Title:** Reservation-roster compliance pinned to establishment sanctioned/roster points
- **Priority:** P1
- **Preconditions:** OU-A establishment with roster points per category.
- **Test data:** `GET /analytics/compliance/reservation-roster?scope=OU-A`.
- **Steps:** Request roster compliance.
- **Expected:** Category-wise sanctioned/filled/backlog + roster-point compliance = filled-by-category / sanctioned-for-category vs roster points; G14 reports, does not adjudicate.

#### TC-G14-042
- **Traces-to:** FR-G14-07 / AC3, BR2
- **Type:** Data-Integrity
- **Title:** SR verification dashboard reads G12 read-only and never writes SR
- **Priority:** P1
- **Preconditions:** G12 SR ledger seeded verified/pending/overdue.
- **Test data:** `GET /analytics/compliance/sr-verification?scope=OU-A`; monitor G12 write API.
- **Steps:** Render SR verification and drill to an employee's SR status.
- **Expected:** Counts sourced from G12; drill P02-permitted; **no write to G12** occurs.

#### TC-G14-043
- **Traces-to:** FR-G14-07 / AC3 edge; error-taxonomy 412 retryable
- **Type:** API-Contract
- **Title:** G12 source temporarily unavailable maps to a retryable precondition, not 503
- **Priority:** P2
- **Preconditions:** G12 SR port unreachable.
- **Test data:** `GET /analytics/compliance/sr-verification?scope=OU-A`.
- **Steps:** Request while G12 is down.
- **Expected:** `412 PRECONDITION_FAILED` (`ERR-PRECOND`, retryable); never a `503` on the wire.

#### TC-G14-044
- **Traces-to:** FR-G14-07 / AC4, BR4
- **Type:** Authorization-RLS
- **Title:** SLA-breach dashboard aggregates P01 workflow tasks; employee/manager have no access
- **Priority:** P2
- **Preconditions:** Pending P01 tasks across modules; EMP and MGR-A.
- **Test data:** `GET /analytics/compliance/sla-breaches?scope=OU-A` as DEPT, then as EMP/MGR-A.
- **Steps:** Request as authorised and unauthorised roles.
- **Expected:** DEPT sees aging buckets + breach flags derived from P01 state; EMP/MGR-A denied (compliance defaults to entity/department scope).

#### TC-G14-045
- **Traces-to:** FR-G14-07 / AC5; FR-G14-09, FR-G14-23
- **Type:** E2E-Flow
- **Title:** Compliance export carries `data_as_of`, scope, methodology footnote, and as-of-knowledge stamp
- **Priority:** P2
- **Preconditions:** DEPT authorised; reservation-roster dashboard live.
- **Test data:** `POST /analytics/reports/{roster}:export` `{format:"PDF"}` then `POST ...:export {format:"XLSX"}`.
- **Steps:** Export the compliance dashboard for audit in PDF and Excel.
- **Expected:** `202` enqueued → execution COMPLETED → G13 artefact; header/footer include scope, `data_as_of`, methodology note, and an as-of-knowledge stamp; reproducible.

### FR-G14-08 — Self-Service Report Builder

#### TC-G14-046
- **Traces-to:** FR-G14-08 / AC1, AC5
- **Type:** Functional
- **Title:** Build a report over a mart, preview first page with `data_as_of`
- **Priority:** P2
- **Preconditions:** HR; `MART_HEADCOUNT` semantic fields available.
- **Test data:** `GET /analytics/semantic/fields?mart=MART_HEADCOUNT`; `POST /analytics/reports:preview` `{select_fields, group_by, aggregations}`.
- **Steps:** Choose fields, group/aggregate, preview.
- **Expected:** `200` cursor-paginated preview; `dataFreshness.data_as_of` present.

#### TC-G14-047
- **Traces-to:** FR-G14-08 / AC2, AC6, BR3; ERR-FORBIDDEN
- **Type:** Authorization-RLS
- **Title:** Builder exposes only P02-permitted fields; filter on a masked field is blocked
- **Priority:** P1
- **Preconditions:** HR lacks the RESTRICTED `salary` field grant.
- **Test data:** `GET /analytics/semantic/fields?mart=MART_PAYROLL`; then a preview filtering on `salary`.
- **Steps:** 1) List fields. 2) Attempt a filter on the masked field.
- **Expected:** `salary` hidden from the field list (with inline explanation); a preview filtering on it → `403 ERR-FORBIDDEN`; **aggregate** over the RESTRICTED mart is allowed but suppression-applied, detail-level requires elevated P02 authority.

#### TC-G14-048
- **Traces-to:** FR-G14-08 / AC4; ERR-G14-EXPORT-LIMIT
- **Type:** Boundary
- **Title:** Report definition exceeding `row_limit` is rejected
- **Priority:** P2
- **Preconditions:** Configured max rows = 100000.
- **Test data:** `POST /analytics/reports:preview` for a definition resolving to > cap.
- **Steps:** Preview an over-cap report.
- **Expected:** `422 ERR-G14-EXPORT-LIMIT` (or offered chunked export via FR-09).

#### TC-G14-049
- **Traces-to:** FR-G14-08 / AC3, BR2
- **Type:** Authorization-RLS
- **Title:** SHARED_SCOPE report respects each viewer's P02 scope at run time
- **Priority:** P1
- **Preconditions:** HR (OU-A,B) saves a SHARED_SCOPE report; MGR-A (narrower) opens it.
- **Test data:** `GET /analytics/reports/{id}/run` as HR then as MGR-A.
- **Steps:** Run the shared report as both.
- **Expected:** Same definition, different result sets — MGR-A's rows auto-filtered/suppressed to MGR-A's scope (intersection at view-time); no over-disclosure.

### FR-G14-09 — Scheduled Distribution & Export

#### TC-G14-050
- **Traces-to:** FR-G14-09 / AC1, AC2; state-machines `report_execution`
- **Type:** Functional
- **Title:** Create a schedule (X.1 job); scheduled run produces execution + G13 artefact
- **Priority:** P2
- **Preconditions:** HR owns a saved report.
- **Test data:** `POST /analytics/reports/{id}/schedules` `{cron_expr, format:"PDF", recipients_json, delivery_channel:"IN_APP"}`.
- **Steps:** 1) Create schedule. 2) Let X.1 fire (or simulate). 3) `GET /analytics/executions/{id}`.
- **Expected:** `201` schedule registered on X.1; run produces `report_execution` `QUEUED→RUNNING→COMPLETED` with a `document_id` (G13); PDF header carries scope/as-of/page numbers.

#### TC-G14-051
- **Traces-to:** FR-G14-09 / AC3, AC4, BR1
- **Type:** Authorization-RLS
- **Title:** Bursting per org_unit and per-recipient scope each P02-filtered — no over-disclosure
- **Priority:** P1
- **Preconditions:** Burst by `org_unit`; recipients across OU-A and OU-B; scope_mode PER_RECIPIENT_SCOPE.
- **Test data:** `POST /analytics/reports/{id}/schedules` `{scope_mode:"PER_RECIPIENT_SCOPE", burst_dimension:"org_unit"}`.
- **Steps:** Run the bursted schedule.
- **Expected:** One file per unit, each filtered + suppressed to that unit; each recipient's copy generated under their own P02 scope; an out-of-scope recipient is **dropped and logged (P05)**, never sent beyond entitlement.

#### TC-G14-052
- **Traces-to:** FR-G14-09 / BR2; ERR-G14-CHANNEL
- **Type:** Negative
- **Title:** RESTRICTED report scheduled to an insecure EMAIL channel is blocked
- **Priority:** P1
- **Preconditions:** RESTRICTED report; EMAIL channel without secure-channel policy.
- **Test data:** `POST /analytics/reports/{restricted}/schedules` `{delivery_channel:"EMAIL"}`.
- **Steps:** Attempt to schedule RESTRICTED-to-EMAIL.
- **Expected:** `403 ERR-G14-CHANNEL`; RESTRICTED PII never in an email body (link/IN_APP only).

#### TC-G14-053
- **Traces-to:** FR-G14-09 / AC6
- **Type:** State-Transition
- **Title:** Failed scheduled run retries (X.1 ×3 backoff) and alerts owner on final failure
- **Priority:** P2
- **Preconditions:** Render step forced to fail terminally.
- **Test data:** Scheduled run over the failing report.
- **Expected:** `report_execution` FAILED after ×3 retries; owner alerted via `JOB-FAIL`/X.2; logged.

### FR-G14-10 — Drill-Down & Drill-Through

#### TC-G14-054
- **Traces-to:** FR-G14-10 / AC2, AC3, BR2
- **Type:** Authorization-RLS
- **Title:** Drill-through offered only when a live P02 check passes in both G14 scope and owning module
- **Priority:** P1
- **Preconditions:** HR permitted in G14 scope AND in the owning module for R-in; permitted in G14 but not owning module for R-mod.
- **Test data:** `GET /analytics/widgets/{id}/drillthrough?rowKey=R-in` and `?rowKey=R-mod`.
- **Steps:** Attempt both drill-throughs.
- **Expected:** R-in → `200` read-only owning-module route (a live `Authorization.check`, not a cached flag); R-mod → drill-through hidden/`403`; opens the owning module read-only view, never a G14 editable copy.

#### TC-G14-055
- **Traces-to:** FR-G14-10 / AC4; FR-G14-18 audit
- **Type:** Data-Integrity
- **Title:** Every drill-through writes a FULL-fidelity DRILLTHROUGH access-log row mirrored to P05
- **Priority:** P1
- **Preconditions:** AUD can query the access log.
- **Test data:** HR drills through to R-in; `GET /analytics/access-log?action=DRILLTHROUGH`.
- **Steps:** Perform a drill-through then query the audit.
- **Expected:** A FULL-fidelity row with record id + sensitivity + user + correlation id, mirrored to P05.

#### TC-G14-056
- **Traces-to:** FR-G14-10 / AC6, BR3; ERR-G14-SMALL-CELL
- **Type:** Privacy-Suppression
- **Title:** Aggregate below the privacy threshold suppresses drill-through
- **Priority:** P1
- **Preconditions:** A cell with group size < k=5.
- **Test data:** `GET /analytics/widgets/{id}/drilldown?path=<small-cell>` then attempt drill-through.
- **Expected:** Cell shown "below privacy threshold"; drill-through suppressed → `403 ERR-G14-SMALL-CELL` (k-anonymity + complementary).

### FR-G14-11 — Alerting, Thresholds & Targets

#### TC-G14-057
- **Traces-to:** FR-G14-11 / AC1, AC2, AC4; state-machines `alert_event`
- **Type:** State-Transition
- **Title:** Threshold breach creates alert_event, notifies, and cycles OPEN→ACKNOWLEDGED→RESOLVED
- **Priority:** P2
- **Preconditions:** Rule on ACTIVE KPI `ATTRITION_RATE` operator GT threshold; scoped recipients.
- **Test data:** `POST /analytics/alert-rules {...}`; drive KPI above threshold; `POST /analytics/alert-events/{id}:acknowledge`; return value within bound.
- **Steps:** 1) Create rule. 2) Breach. 3) Acknowledge. 4) Value recovers.
- **Expected:** `alert_event` OPEN + X.2 notification; acknowledge → ACKNOWLEDGED; clean re-evaluation → auto RESOLVED; dashboard KPI tile badged.

#### TC-G14-058
- **Traces-to:** FR-G14-11 / AC3; state-machines SUPPRESSED
- **Type:** Data-Integrity
- **Title:** Repeat breaches within suppression window / hysteresis do not duplicate
- **Priority:** P2
- **Preconditions:** Rule with `suppression_window_min` + `hysteresis_pct`; value flaps around threshold.
- **Test data:** Two evaluations inside the window.
- **Steps:** Trigger repeated breaches.
- **Expected:** Second breach → SUPPRESSED (de-duplicated, logged); no duplicate notification.

#### TC-G14-059
- **Traces-to:** FR-G14-11 / BR5, AC2
- **Type:** Data-Integrity
- **Title:** Alert evaluated against the effective-dated threshold in force for the evaluated period
- **Priority:** P2
- **Preconditions:** Threshold changed mid-period (E17 effective-dated).
- **Test data:** Evaluate the rule across the change boundary.
- **Expected:** The `kpi_target_history` value covering the evaluated period is used; not the latest static value.

#### TC-G14-060
- **Traces-to:** FR-G14-11 / edge (retired KPI); AC5
- **Type:** State-Transition
- **Title:** Retiring a KPI auto-pauses its active alert rules; out-of-scope recipients dropped
- **Priority:** P3
- **Preconditions:** KPI with active rule; a recipient outside scope.
- **Test data:** Retire the KPI; create a rule with an out-of-scope recipient.
- **Expected:** Rule auto-paused + steward notified; out-of-scope recipient validated-out via P02 and dropped/logged.

### FR-G14-12 — Data Freshness & Reconciliation Explainer

#### TC-G14-061
- **Traces-to:** FR-G14-12 / AC1, AC2, BR2
- **Type:** Data-Freshness
- **Title:** Every tile shows `data_as_of`; a mart past SLA renders a STALE indicator
- **Priority:** P2
- **Preconditions:** One HEALTHY mart, one STALE mart on a mixed dashboard.
- **Test data:** `GET /analytics/dashboards/{id}/render`.
- **Steps:** Render a mixed-freshness dashboard.
- **Expected:** Every widget carries `dataFreshness.data_as_of` (viewer TZ); STALE mart tile shows STALE indicator + tooltip; global worst-case surfaced; no value without a `data_as_of`.

#### TC-G14-062
- **Traces-to:** FR-G14-12 / AC3
- **Type:** Data-Freshness
- **Title:** DEGRADED/FAILED mart shows last-good data with prominent warning; new computations flagged is_partial
- **Priority:** P2
- **Preconditions:** Mart FAILED.
- **Test data:** Render dependent dashboard.
- **Expected:** Last-good data shown with a prominent non-colour-only warning (WCAG); newly computed values carry `is_partial=true`.

#### TC-G14-063
- **Traces-to:** FR-G14-12 / AC7, BR5
- **Type:** Data-Freshness
- **Title:** Role-adaptive freshness language — plain for leaders, technical for operators
- **Priority:** P3
- **Preconditions:** Same STALE mart.
- **Test data:** Render as EXEC and as DENG/AUD.
- **Expected:** EXEC/EMP/MGR/DEPT get plain-language copy; ANALYTICS_ADMIN/DATA_ENGINEER/AUDITOR get technical states (STALE/DEGRADED/watermark); leaders can expand to technical on demand.

#### TC-G14-064
- **Traces-to:** FR-G14-12 / AC8; §1.2 pain
- **Type:** Functional
- **Title:** Reconciliation explainer shows as-of, watermark, last variance, pending correction
- **Priority:** P2
- **Preconditions:** Reconcilable KPI with a known variance vs source.
- **Test data:** `GET /analytics/kpis/HEADCOUNT_ACTIVE/reconciliation-explainer?scope=OU-A&period=2026-06`.
- **Steps:** Open the "why does this differ from source?" panel.
- **Expected:** `200` narrative + figures: `data_as_of`, watermark, last variance, any in-flight correction/knowledge-version.

### FR-G14-13 — Deterministic Retirement Forecasting

#### TC-G14-065
- **Traces-to:** FR-G14-13 / AC2, AC4, BR1
- **Type:** Data-Integrity
- **Title:** Retirement counts reconcile exactly (zero tolerance) to G01 DOB + cadre rules
- **Priority:** P1
- **Preconditions:** DETERMINISTIC retirement model ACTIVE.
- **Test data:** `GET /analytics/predictions/retirement?scope=OU-A&period=1Y`.
- **Steps:** Compute forecast; compare to an independent DOB+cadre oracle.
- **Expected:** Exact match (zero tolerance); labelled "deterministic — based on date of birth and retirement rules"; carries `data_as_of`.

#### TC-G14-066
- **Traces-to:** FR-G14-13 / AC5; state-machines `prediction_model`; ERR-G14-METHODOLOGY
- **Type:** State-Transition
- **Title:** Deterministic model requires methodology but no fairness assessment
- **Priority:** P2
- **Preconditions:** Register a DETERMINISTIC model without methodology, then with methodology.
- **Test data:** `POST /analytics/models {determinism:"DETERMINISTIC", methodology:null}` then with text; `:activate`.
- **Steps:** 1) Register without methodology. 2) Register with methodology and activate (checker ≠ maker).
- **Expected:** Missing methodology → `422 ERR-G14-METHODOLOGY`; with methodology, activation succeeds via P01 checker without a fairness gate.

#### TC-G14-067
- **Traces-to:** FR-G14-13 / AC6; FR-G14-23
- **Type:** Data-Integrity
- **Title:** Backdated DOB correction re-derives the forecast as a new knowledge-version
- **Priority:** P2
- **Preconditions:** A DOB correction arrives via FR-20 for an OU-A employee.
- **Test data:** Trigger the correction; `GET /analytics/predictions/retirement?...&asOfKnowledge=<before>` and default.
- **Steps:** Correct DOB; read forecast at old and new knowledge instants.
- **Expected:** New knowledge-version created; default read reflects the correction; `asOfKnowledge=<before>` reproduces the pre-correction forecast.

### FR-G14-14 — Benchmarking & Comparative Analytics

#### TC-G14-068
- **Traces-to:** FR-G14-14 / AC1, AC3, BR5
- **Type:** Functional
- **Title:** Period-over-period variance and target-vs-actual RAG use the period-correct effective-dated target
- **Priority:** P2
- **Preconditions:** KPI snapshots across periods; effective-dated targets.
- **Test data:** `GET /analytics/benchmark/period?kpi=VACANCY_PCT&periods=2026-03,2026-06`; `GET /analytics/benchmark/target?...`.
- **Steps:** Compare periods and target attainment.
- **Expected:** Variance + %change computed from governed snapshots; RAG uses `direction` + the target in force for each shown period.

#### TC-G14-069
- **Traces-to:** FR-G14-14 / AC2, AC4, BR3
- **Type:** Authorization-RLS
- **Title:** Peer benchmarking cannot compare against an org unit outside P02 scope
- **Priority:** P1
- **Preconditions:** DEPT over OU-DEPT; a sibling unit OU-OTHER outside scope.
- **Test data:** `GET /analytics/benchmark/peers?kpi=VACANCY_PCT&scope=OU-DEPT` requesting OU-OTHER as a peer.
- **Steps:** Attempt to rank against an out-of-scope peer.
- **Expected:** OU-OTHER excluded from the peer set (P02); small denominators suppressed; ranking normalised.

### FR-G14-15 — NL Query & Hardened Embedded BI

#### TC-G14-070
- **Traces-to:** FR-G14-15 / AC1, AC3, AC6, BR5
- **Type:** Functional
- **Title:** NL query resolves to a governed KPI, shows interpretation, P02-scoped, PII stripped, no raw SQL
- **Priority:** P2
- **Preconditions:** On-prem LLM configured; HR authenticated.
- **Test data:** `POST /analytics/nlq {question:"What is the vacancy percentage in OU-A this quarter?"}`.
- **Steps:** Submit a well-formed NL question.
- **Expected:** `200` result + resolved interpretation (KPI/dims/filters); P02-scoped + suppressed + freshness; never emits raw SQL; PII stripped server-side; logged to `nl_query_log`.

#### TC-G14-071
- **Traces-to:** FR-G14-15 / AC2; ERR-G14-NLQ-CONF, ERR-G14-NLQ-CLARIFY, ERR-G14-METRIC-NA
- **Type:** Negative
- **Title:** NL refuses below confidence, clarifies when ambiguous, 404 on unmodelled metric
- **Priority:** P1
- **Preconditions:** Low-confidence, ambiguous, and unmodelled-metric questions.
- **Test data:** Three `POST /analytics/nlq` calls: gibberish; "show me the numbers"; "average shoe size".
- **Steps:** Submit each.
- **Expected:** Low confidence → `422 ERR-G14-NLQ-CONF` (refused, not answered); ambiguous → `422 ERR-G14-NLQ-CLARIFY` with clarification options (notice); unmodelled metric → `404 ERR-G14-METRIC-NA`. Never fabricates a metric.

#### TC-G14-072
- **Traces-to:** FR-G14-15 / AC4; state-machines `embed_token` (via P01)
- **Type:** State-Transition
- **Title:** Embed token issuance is maker-checker (checker ≠ issuer)
- **Priority:** P1
- **Preconditions:** AADM-1 issues; AADM-2 approves.
- **Test data:** `POST /analytics/embed-tokens {widgets, role, expiry, frame_ancestors}` → `:approve` by issuer then by distinct checker.
- **Steps:** Issue, self-approve, then checker-approve.
- **Expected:** Issuer self-approval blocked (P01 SoD); distinct checker approval activates the token; token scoped to widgets/role/expiry.

#### TC-G14-073
- **Traces-to:** FR-G14-15 / AC7; ERR-G14-EMBED-INVALID, ERR-G14-EMBED-REVOKED
- **Type:** Negative
- **Title:** Embed credential never accepted from URL; revoked/expired token rejected
- **Priority:** P1
- **Preconditions:** A valid embed token, then revoked; a token supplied via URL query.
- **Test data:** `POST /analytics/embed/session` with token in header (valid), token in URL, and a revoked token.
- **Steps:** 1) Header exchange. 2) URL token. 3) Revoked token.
- **Expected:** Header exchange → session; URL token → `401 ERR-G14-EMBED-INVALID` (never accepted from URL); revoked → `401 ERR-G14-EMBED-REVOKED`; CSP `frame-ancestors` restricts embedding origins (X.3).

#### TC-G14-074
- **Traces-to:** FR-G14-15 / BR4, AC4
- **Type:** Authorization-RLS
- **Title:** Embedded render re-validates P02 scope per render — out-of-scope user gets empty result, not a bypass
- **Priority:** P1
- **Preconditions:** Embed token scoped to a widget; an out-of-scope user renders it.
- **Test data:** Render the embedded widget as an out-of-scope user.
- **Expected:** Same P02 check as native; result empties for the out-of-scope user; the token is not an API bypass key.

### FR-G14-16 — Mobile, Executive Briefing & Offline Policy

#### TC-G14-075
- **Traces-to:** FR-G14-16 / AC5, BR1
- **Type:** Authorization-RLS
- **Title:** Mobile render enforces identical P02 scope, suppression, and masking as desktop
- **Priority:** P1
- **Preconditions:** MGR-A.
- **Test data:** `GET /analytics/dashboards/{id}/render?viewport=mobile` vs `?viewport=desktop`.
- **Steps:** Render mobile and desktop for the same user/scope.
- **Expected:** Identical scoped, suppressed, masked data; no relaxed scoping on mobile.

#### TC-G14-076
- **Traces-to:** FR-G14-16 / AC7, BR5
- **Type:** Privacy-Suppression
- **Title:** Offline cache excludes RESTRICTED PII, is encrypted, expires, and honours remote-wipe
- **Priority:** P1
- **Preconditions:** Dashboard with PUBLIC/INTERNAL aggregates + RESTRICTED fields.
- **Test data:** Inspect the on-device cache payload; trigger remote-wipe.
- **Steps:** 1) Cache a dashboard. 2) Inspect cached payload. 3) Go offline. 4) Remote-wipe.
- **Expected:** Cache contains only PUBLIC/INTERNAL aggregates (no RESTRICTED per PII ceiling), encrypted, with expiry; offline shows last non-restricted view + stale badge; remote-wipe invalidates it.

#### TC-G14-077
- **Traces-to:** FR-G14-16 / AC2, AC3, BR2
- **Type:** Functional
- **Title:** Executive briefing pack generated per recipient under their P02 scope via FR-09 pipeline
- **Priority:** P2
- **Preconditions:** EXEC and DEPT briefing subscriptions.
- **Test data:** `POST /analytics/briefings/schedules {...}`; `GET /analytics/briefings/{executionId}`.
- **Steps:** Schedule and generate briefings for two recipients.
- **Expected:** Each briefing scoped to its recipient; includes top KPIs, trends, open CRITICAL alerts, compliance highlights, `data_as_of`; audited (P05).

### FR-G14-17 — Metric-Level Privacy & Complementary Suppression (CRITICAL)

#### TC-G14-078
- **Traces-to:** FR-G14-17 / AC1, BR2; ERR-G14-SMALL-CELL
- **Type:** Privacy-Suppression
- **Title:** Cell with denominator/group size < k is suppressed/banded ("<5")
- **Priority:** P1
- **Preconditions:** Default k=5; `min_cell_size` override on one KPI = 10.
- **Test data:** Aggregate reads over a cell of size 3 (default) and size 7 (override KPI).
- **Steps:** Request both aggregates.
- **Expected:** Size 3 → "<5"/banded (`ERR-G14-SMALL-CELL`); size 7 on the override-10 KPI → suppressed (stricter of policy/per-KPI applies).

#### TC-G14-079
- **Traces-to:** FR-G14-17 / AC2, AC3; ERR-G14-COMP-SUPPRESS
- **Type:** Privacy-Suppression
- **Title:** Complementary suppression prevents recovery of a suppressed cell by subtraction
- **Priority:** P1
- **Preconditions:** A row with one small cell and a visible total; overlapping this-period/last-period and with/without-one-unit views.
- **Test data:** Request the row aggregate, then attempt differencing across the overlapping scopes/periods.
- **Steps:** 1) Read the row. 2) Attempt subtraction (total − visible cells) and period/scope differencing.
- **Expected:** A second complementary cell is suppressed so the hidden value is not recoverable; differencing cannot reconstruct it (verified by the suppression harness); partial suppression annotated `ERR-G14-COMP-SUPPRESS`.

#### TC-G14-080
- **Traces-to:** FR-G14-17 / AC4
- **Type:** Privacy-Suppression
- **Title:** Suppression applies uniformly across tiles, charts, exports, and drill-through
- **Priority:** P1
- **Preconditions:** Small-cell fixture reachable via all four surfaces.
- **Test data:** Render tile, chart, `:export`, and drilldown of the same small cell.
- **Steps:** Access the small cell through each surface.
- **Expected:** Suppressed consistently on all four; clients never receive the underlying suppressed value (server-side, after P02).

#### TC-G14-081
- **Traces-to:** FR-G14-17 / BR3, BR4
- **Type:** Boundary
- **Title:** Admin cannot lower k below the statutory minimum; suppression deterministic for (query, k, data)
- **Priority:** P1
- **Preconditions:** Statutory minimum k configured.
- **Test data:** `POST /analytics/suppression-policies {min_cell_size:2}`; then two identical queries.
- **Steps:** 1) Attempt to set k below the minimum. 2) Run the same query twice.
- **Expected:** k below minimum rejected (`422`); suppression never disabled for RESTRICTED domains; identical (query,k,data) yields identical suppression (trend-stable).

### FR-G14-18 — Probabilistic Prediction & Fairness Governance (CRITICAL)

#### TC-G14-082
- **Traces-to:** FR-G14-18 / AC1, AC2, BR3; state-machines `prediction_model`; ERR-G14-FAIRNESS, ERR-G14-METHODOLOGY
- **Type:** State-Transition
- **Title:** Probabilistic model cannot activate without model card, excluded protected features, and fairness PASSED/WAIVED; DPO co-signs
- **Priority:** P1
- **Preconditions:** Attrition model DRAFT; maker AADM-1, checker AADM-2, DPO.
- **Test data:** `POST /analytics/models {determinism:"PROBABILISTIC"}` (no card) → `:assess-fairness` → `:activate`.
- **Steps:** 1) Register without model card/exclusions. 2) Add card + exclusions. 3) Activate before fairness. 4) Assess fairness PASSED. 5) Activate (checker + DPO).
- **Expected:** Missing methodology/card → `422 ERR-G14-METHODOLOGY`/`ERR-G14-FAIRNESS`; activate with `fairness_status=NOT_ASSESSED` → `422 ERR-G14-FAIRNESS`; after PASSED, activation requires `approved_by ≠ created_by` (P01) with DPO co-sign (PARALLEL_ALL_OF).

#### TC-G14-083
- **Traces-to:** FR-G14-18 / AC4, AC5, BR4; ERR-G14-PRED-GATED — KEY friction gate
- **Type:** Authorization-RLS
- **Title:** Individual predictive score is friction-gated (purpose required); hover/unauthorised surfacing blocked
- **Priority:** P1
- **Preconditions:** Attrition model ACTIVE; HR with RESTRICTED authority; MGR without.
- **Test data:** `POST /analytics/predictions/individual {subject_id, purpose:"..."}` as HR (with/without purpose) and as MGR; attempt to surface a score on an aggregate tile hover.
- **Steps:** 1) HR with purpose. 2) HR without purpose. 3) MGR. 4) Hover surfacing.
- **Expected:** HR-with-purpose → `200` score + explainability + prohibited-use notice + FULL audit (`VIEW_INDIVIDUAL_PREDICTION` → P05); HR-without-purpose → `403 ERR-G14-PRED-GATED`; MGR/hover surfacing → `403 ERR-G14-PRED-GATED`.

#### TC-G14-084
- **Traces-to:** FR-G14-18 / AC3, AC6, BR1, BR2
- **Type:** Privacy-Suppression
- **Title:** Aggregate/banded distribution suppressed below k; protected-attribute slice rejected; advisory labelled; new joiner NO_PREDICTION
- **Priority:** P1
- **Preconditions:** Attrition model ACTIVE; a new joiner with insufficient history; a request slicing by caste/gender.
- **Test data:** `GET /analytics/predictions/attrition?scope=OU-A` and `...&dimension=caste`.
- **Steps:** 1) Request banded distribution. 2) Slice by a protected attribute. 3) Inspect the new joiner.
- **Expected:** Distribution suppressed below k; slice by protected attribute rejected; every figure labelled advisory with model id/version/confidence/`data_as_of`/prohibited-use; new joiner → `NO_PREDICTION`, never a false HIGH; predictions never written to G01–G13.

#### TC-G14-085
- **Traces-to:** FR-G14-18 / BR5; state-machines drift
- **Type:** State-Transition
- **Title:** Data drift freezes a model's results read-only pending re-review
- **Priority:** P3
- **Preconditions:** ACTIVE model flagged for drift.
- **Test data:** Simulate drift detection.
- **Expected:** Model → RETIRED (or drift-frozen); existing results frozen read-only; re-review required before reactivation.

### FR-G14-19 — Establishment & Position Reference

#### TC-G14-086
- **Traces-to:** FR-G14-19 / AC1, BR2; auth-matrix `g14.establishment.author`
- **Type:** Functional
- **Title:** Establishment Officer maintains positions (sanctioned strength/roster point) with effective dates
- **Priority:** P2
- **Preconditions:** ESTO authenticated.
- **Test data:** `POST /analytics/establishment/positions {cadre, designation, org_unit, sanctioned_strength, reservation_category, roster_point, effective_from}`.
- **Steps:** Create/maintain a position.
- **Expected:** `201`; sanctioned strength ≥ 0; effective-date integrity (VAL-EFFECTIVE); roster-point uniqueness per category/unit; edits audited (P05).

#### TC-G14-087
- **Traces-to:** FR-G14-19 / §2.4; auth-matrix sod "authoring != reporting; no post approval"
- **Type:** Authorization-RLS
- **Title:** Establishment Officer cannot publish dashboards or approve/adjudicate posts (SoD)
- **Priority:** P2
- **Preconditions:** ESTO.
- **Test data:** ESTO attempts `POST /analytics/dashboards/{id}:publish` and any roster-adjudication action.
- **Steps:** Attempt out-of-role actions.
- **Expected:** `403 FORBIDDEN` — authoring is separate from reporting/adjudication; ESTO has no publication authority.

#### TC-G14-088
- **Traces-to:** FR-G14-19 / AC5, BR4; FR-G14-23
- **Type:** Data-Integrity
- **Title:** Historical vacancy reproduces against the establishment in force; abolished positions excluded from current
- **Priority:** P2
- **Preconditions:** A position abolished mid-year; sanctioned strength changed via new effective-dated record.
- **Test data:** `GET /analytics/workforce/vacancy?scope=OU-A&period=<past>` vs current; check abolished-post handling.
- **Steps:** Compute past vs current vacancy.
- **Expected:** Past vacancy uses the establishment effective for that period (bitemporal); ABOLISHED positions excluded from current sanctioned strength but retained for history.

### FR-G14-20 — DPDP Rectification & Erasure Propagation (CRITICAL)

#### TC-G14-089
- **Traces-to:** FR-G14-20 / AC1, AC2, AC3; state-machines `data_subject_change`
- **Type:** State-Transition
- **Title:** Erasure propagates RECEIVED→PROPAGATING→COMPLETED across snapshots, predictions, exports
- **Priority:** P1
- **Preconditions:** DPO; subject S present in marts, snapshots, `prediction_result`, and a G13 export artefact.
- **Test data:** `POST /analytics/data-subject-changes {type:"ERASURE", subject_id:S}`; `GET .../{id}`.
- **Steps:** Register the erasure and poll status.
- **Expected:** Impact analysis identifies all affected derived rows/artefacts; snapshots re-derived as new knowledge-versions (prior superseded, not mutated); `prediction_result` rows purged; `report_execution` artefacts marked REDACTED in G13; status COMPLETED; append-only audited.

#### TC-G14-090
- **Traces-to:** FR-G14-20 / AC4, BR2; state-machines BLOCKED_RETENTION; ERR-G14-RETENTION-BLOCK
- **Type:** Negative
- **Title:** Statutory retention overrides erasure → BLOCKED_RETENTION with recorded legal basis
- **Priority:** P1
- **Preconditions:** Subject on a pension-retained record; DPO.
- **Test data:** `POST /analytics/data-subject-changes {type:"ERASURE", subject_id:<retained>}`; `POST .../{id}:retention-override {legal_basis:"..."}`.
- **Steps:** Attempt erasure; record retention override.
- **Expected:** `BLOCKED_RETENTION`; data restricted from rendering, not deleted; `ERR-G14-RETENTION-BLOCK` (notice); `legal_basis` recorded and Auditor-reviewable.

#### TC-G14-091
- **Traces-to:** FR-G14-20 / AC5, BR4; ERR-G14-ERASURE-PENDING
- **Type:** Data-Integrity
- **Title:** Incomplete propagation surfaces ERR-G14-ERASURE-PENDING; pipeline idempotent/resumable
- **Priority:** P2
- **Preconditions:** A propagation step forced to fail then retried.
- **Test data:** Register erasure; interrupt a step; re-run.
- **Expected:** Affected surfaces show `ERR-G14-ERASURE-PENDING` (notice) until complete; failed step retries (X.1) + alert (X.2); re-run is idempotent and resumes without double-applying.

#### TC-G14-092
- **Traces-to:** FR-G14-20 / AC6, BR1; auth-matrix `g14.dpr.propagate`
- **Type:** Authorization-RLS
- **Title:** Only DPO may govern/override; audit erasure uses the P05 redaction marker (no historical row deletion)
- **Priority:** P1
- **Preconditions:** DPO and a non-DPO (HR).
- **Test data:** `POST /analytics/data-subject-changes` and `:retention-override` as HR then DPO; inspect audit rows.
- **Steps:** Attempt governance as HR; perform as DPO; verify audit immutability.
- **Expected:** HR → `403 FORBIDDEN`; DPO permitted; audit PII handled via **P05 redaction marker only** — historical audit rows never deleted; DPO/Auditor verify completeness via P05 query.

### FR-G14-21 — Source Data Contracts & Schema-Drift

#### TC-G14-093
- **Traces-to:** FR-G14-21 / AC1, AC5, AC6
- **Type:** Functional
- **Title:** Register a versioned source contract naming the CDC mechanism (Debezium)
- **Priority:** P2
- **Preconditions:** DENG; owning-module steller co-sign available.
- **Test data:** `POST /analytics/source-contracts {module:"G01", source_view, schema_json, cdc:"Debezium", version:1}`.
- **Steps:** Register the contract.
- **Expected:** `201` ACTIVE; CDC mechanism recorded; status + last-test timestamp visible in the DENG console.

#### TC-G14-094
- **Traces-to:** FR-G14-21 / AC2, AC3, BR3; FR-G14-03 BR5; ERR-G14-CONTRACT
- **Type:** Data-Integrity
- **Title:** Breaking upstream schema change → contract BREACHED, mart held from refresh, both teams alerted
- **Priority:** P1
- **Preconditions:** A source view drops a pinned column.
- **Test data:** `POST /analytics/source-contracts/{id}:test` against the drifted view; then attempt a mart refresh.
- **Steps:** 1) Run the contract test. 2) Attempt refresh of the dependent mart.
- **Expected:** Test fails naming the offending field; contract → BREACHED; dependent mart **held from refresh**; `409 ERR-G14-CONTRACT` (CI fail / runtime hold) + X.2 alert to DENG + owning-module steward.

#### TC-G14-095
- **Traces-to:** FR-G14-21 / edge (additive change), AC4
- **Type:** Boundary
- **Title:** Additive non-breaking change is minor-versioned without holding the mart
- **Priority:** P3
- **Preconditions:** Source view adds a new nullable column.
- **Test data:** Run contract test against the additive change.
- **Expected:** No BREACH; contract minor-versioned; mart continues refreshing; a new source-view version still requires a co-signed update.

### FR-G14-22 — Access-Anomaly Detection

#### TC-G14-096
- **Traces-to:** FR-G14-22 / AC1, AC2, AC4
- **Type:** Functional
- **Title:** Off-hours bulk export above threshold raises an access_anomaly and notifies Auditor/AADM
- **Priority:** P2
- **Preconditions:** Baseline established; a user performs off-hours bulk exports above threshold.
- **Test data:** Generate off-hours bulk exports; run the X.1 `AnomalyDetector`; `GET /analytics/anomalies`.
- **Steps:** 1) Trigger the pattern. 2) Run detection. 3) List anomalies.
- **Expected:** `access_anomaly` (WARNING/CRITICAL) with evidence (counts, times, user/role); X.2 notification to Auditor/Analytics Admin; appears in the review queue.

#### TC-G14-097
- **Traces-to:** FR-G14-22 / AC3, AC6, BR4
- **Type:** Data-Integrity
- **Title:** Repeated P02-denied edge-probing raises SCOPE_EDGE_PROBING; detection is advisory (never auto-revokes)
- **Priority:** P2
- **Preconditions:** A user issues repeated near-boundary denied requests (ties to TC-G14-025/026 denials).
- **Test data:** Generate repeated denied/edge requests; run detection.
- **Expected:** `SCOPE_EDGE_PROBING` anomaly raised from the append-only ledger; access is **not** auto-revoked (P02 remains the gate); detection adds no read-path latency.

#### TC-G14-098
- **Traces-to:** FR-G14-22 / AC5, BR3
- **Type:** State-Transition
- **Title:** Reviewer marks INVESTIGATING/DISMISSED/CONFIRMED; decision append-only audited
- **Priority:** P3
- **Preconditions:** An OPEN anomaly; AUD reviewer.
- **Test data:** `POST /analytics/anomalies/{id}:review {decision:"DISMISSED", note:"quarter-end"}`.
- **Steps:** Review and dismiss a legitimate quarter-end anomaly.
- **Expected:** Status OPEN→DISMISSED with note; decision audited to P05 (append-only).

### FR-G14-23 — Bitemporal Snapshot & As-Of-Knowledge Reproducibility (CRITICAL)

#### TC-G14-099
- **Traces-to:** FR-G14-23 / AC1, AC2, AC6
- **Type:** Data-Integrity
- **Title:** Restatement adds a new knowledge-version; prior row retained, is_superseded, linked — append-only
- **Priority:** P1
- **Preconditions:** A snapshot for (KPI, OU-A, 2026-06); a backdated correction arrives.
- **Test data:** `GET /analytics/kpis/HEADCOUNT_ACTIVE/history?scope=OU-A&period=2026-06`.
- **Steps:** 1) Read history pre-correction. 2) Apply correction. 3) Read history post-correction.
- **Expected:** Every snapshot carries `valid_time` + `knowledge_time`; restatement inserts a new knowledge-version, marks the prior `is_superseded=true` + `superseded_by`; **no historical row mutated/deleted**.

#### TC-G14-100
- **Traces-to:** FR-G14-23 / AC3, AC4, AC5, BR4; ERR-G14-ASOF-NA
- **Type:** E2E-Flow
- **Title:** "June-in-June vs June-in-September" — asOfKnowledge reproduces exactly what was known
- **Priority:** P1
- **Preconditions:** A June figure known in June, restated in July.
- **Test data:** `GET /analytics/kpis/HEADCOUNT_ACTIVE/value?scope=OU-A&period=2026-06&asOfKnowledge=2026-06-30T23:59:59Z` and `...&asOfKnowledge=2026-09-30T23:59:59Z`, and default; plus `asOfKnowledge=2020-01-01`.
- **Steps:** Read the same valid-time period at two knowledge instants, the default, and a pre-first-version instant.
- **Expected:** June-knowledge returns the pre-restatement value; September-knowledge returns the restated value; default returns the latest knowledge-version; the two reconcile with lineage; `asOfKnowledge` before the first version → `404 ERR-G14-ASOF-NA`. Reproduction deterministic for (kpi_id, kpi_version, scope, period_key, knowledge_time).

### Cross-Module E2E Flows & Platform-Contract

#### TC-G14-101
- **Traces-to:** FR-G14-01/04/06/12/17 (E2E); §1.6 success criteria
- **Type:** E2E-Flow
- **Title:** Role-based dashboard load with correct P02 scope + masking + suppression (manager persona)
- **Priority:** P1
- **Preconditions:** MGR-A with a published MGR_TEAM dashboard containing workforce + a RESTRICTED payroll tile + a small-cell diversity tile.
- **Test data:** Login as MGR-A → `GET /analytics/dashboards/{MGR_TEAM}/render`.
- **Steps:** 1) Authenticate. 2) Render. 3) Inspect scope, masked fields, suppressed cells, freshness, audit.
- **Expected:** Only MGR-A's reporting chain shown; the RESTRICTED payroll tile omitted (P02); the small diversity cell banded (FR-17); every tile has `data_as_of`; a VIEW_DASHBOARD access-log row mirrors to P05; `X-Correlation-Id` echoed.

#### TC-G14-102
- **Traces-to:** FR-G14-05/06/07 (E2E); §1.1 cross-module intelligence
- **Type:** E2E-Flow
- **Title:** Cross-module executive KPI board — headcount + establishment vacancy + pension forecast consistent
- **Priority:** P1
- **Preconditions:** EXEC; marts for G01 headcount, establishment (FR-19), G11 pension forecast HEALTHY.
- **Test data:** `GET /analytics/workforce/headcount`, `/workforce/vacancy`, `/operational/pension-forecast` at entity scope; compare to the reconciliation explainer.
- **Steps:** Render an executive board composing all three cross-module KPIs.
- **Expected:** Headcount, vacancy (establishment-pinned), and pension-forecast all resolve to governed KPIs, entity-scoped, freshness-stamped; figures reconcile at watermark within tolerance; no cross-tenant/entity bleed.

#### TC-G14-103
- **Traces-to:** FR-G14-02/01 (E2E); state-machines kpi + dashboard
- **Type:** E2E-Flow
- **Title:** KPI publish maker-checker → snapshot materialised → dashboard tile shows the governed value consistently
- **Priority:** P2
- **Preconditions:** AADM maker + checker; a dashboard bound to the KPI.
- **Test data:** Create KPI → checker activate → compute value → render bound tile.
- **Expected:** The activated version's `definition_hash` on the snapshot equals the value rendered on the tile; a single governed definition drives both the API value and the tile (G1 objective).

#### TC-G14-104
- **Traces-to:** FR-G14-08/09 (E2E)
- **Type:** E2E-Flow
- **Title:** Self-service report build → save → schedule → multi-format export lands in G13
- **Priority:** P2
- **Preconditions:** HR.
- **Test data:** Build via `/reports:preview` → `POST /reports` → `POST /reports/{id}/schedules` → `POST /reports/{id}:export` for PDF, XLSX, CSV.
- **Steps:** Build, save, schedule, and export in all three formats.
- **Expected:** Each export produces a `report_execution` COMPLETED + a G13 `document_id`; CSV RFC-4180 quoted; all P02-scoped + suppressed; EXPORT access-log rows to P05.

#### TC-G14-105
- **Traces-to:** Platform conventions (Foundation §4); OpenAPI global
- **Type:** API-Contract
- **Title:** Platform conventions — correlation id, cursor pagination bounds, idempotency replay, error envelope, auth
- **Priority:** P1
- **Preconditions:** Any authenticated persona; one unauthenticated caller.
- **Test data:** `GET /analytics/dashboards?limit=250`; `GET /analytics/dashboards?limit=25&cursor=<c>`; a POST replayed with the same `Idempotency-Key`; a call with no bearer token; any 4xx.
- **Steps:** Exercise each convention.
- **Expected:** `limit>100` clamped to max 100; `next_cursor` returned and honoured; replayed `Idempotency-Key` → same result / `409 ERR-DUP-INSTANCE` within 24h (no double effect); missing token → `401 UNAUTHENTICATED`; every 4xx/5xx uses `{error:{code,message,field,details}}` with `X-Correlation-Id` in the response header (never a body `requestId`).

#### TC-G14-106
- **Traces-to:** FR-G14-02, FR-G14-05, FR-G14-06; BRD §5.5a Reference KPI Catalog (v3.2 field reconciliation)
- **Type:** Data-Integrity
- **Title:** Seeded dept-view KPI tiles resolve via `kpi_definition` + mart with the catalogued P02 scope, grain and unit
- **Priority:** P2
- **Preconditions:** The v3.2 seed set is loaded: the 6 `kpi_definitions` (`ATT_PRESENT_PCT`, `ATT_WFH_TODAY`, `ATT_AVG_WORK_HRS`, `LEAVE_ON_TODAY`, `PERF_AVG_RATING`, `ATTRITION_LTM_PCT`) are ACTIVE and bound to the seed marts (`MART_ATTENDANCE`, `MART_LEAVE`, `MART_APPRAISAL`, `MART_HEADCOUNT`). MGR-A authenticated with P02 scope over OU-A only.
- **Test data:** `GET /analytics/kpis/{code}/value?scope=OU-A&period=2026-06` for each of the 6 seeded `kpi_code`s; `GET /analytics/kpis?domain=ATTENDANCE` to read their definitions.
- **Steps:** 1) List the seeded KPI definitions. 2) Resolve each tile value under MGR-A's P02 scope.
- **Expected:** Each tile resolves to exactly one ACTIVE `kpi_definition` reading its catalogued `source_mart_id` (no inline formula), with `grain=ORG_UNIT` and the catalogued `unit` — `ATT_PRESENT_PCT`→`PERCENT`, `ATT_WFH_TODAY`→`COUNT`, `ATT_AVG_WORK_HRS`→`HOURS`, `LEAVE_ON_TODAY`→`COUNT`, `PERF_AVG_RATING`→`SCORE`, `ATTRITION_LTM_PCT`→`PERCENT`. Every value carries `data_as_of`; each is P02-scoped to OU-A and passes FR-17 suppression; no new table/entity is introduced (seed rows over E03/E09 only).

#### TC-G14-107
- **Traces-to:** FR-G14-02; OpenAPI `KpiUnit` enum; BRD §5.5 / §5.5a (`HOURS` added v3.2)
- **Type:** API-Contract
- **Title:** `HOURS` KPI unit is accepted by the contract and renders as hours for `ATT_AVG_WORK_HRS`
- **Priority:** P2
- **Preconditions:** `ATT_AVG_WORK_HRS` seeded ACTIVE (`unit=HOURS`, `grain=ORG_UNIT`, expression `avg(worked_minutes)/60.0`, `source_mart_id=MART_ATTENDANCE`). AADM may create a KPI version.
- **Test data:** `POST /analytics/kpis` `{kpi_code:"ATT_AVG_WORK_HRS", ..., unit:"HOURS", grain:"ORG_UNIT"}`; then `GET /analytics/kpis/ATT_AVG_WORK_HRS/value?scope=OU-A&period=2026-06`; render the dept-attendance "Avg work hrs" tile.
- **Steps:** 1) POST a KPI definition with `unit:"HOURS"`. 2) Resolve its value. 3) Render the bound tile.
- **Expected:** `unit:"HOURS"` passes schema validation (no `422 ERR-VALIDATION` on the enum) — the `KpiUnit` enum accepts `HOURS`; the resolved `KpiValue` and rendered tile report `unit=HOURS` and format the number as hours (minutes/60), distinct from `DAYS`/`SCORE`; value carries `data_as_of` and is P02-scoped + suppressed.

#### TC-G14-108
- **Traces-to:** FR-G14-01, FR-G14-02; BRD §5.5a seed widgets (`MGR_TEAM` dashboard)
- **Type:** Functional
- **Title:** Seed `dashboard_widgets` bind the dept KPIs onto `MGR_TEAM` and render P02-scoped with catalogued units
- **Priority:** P2
- **Preconditions:** `MGR_TEAM` dashboard PUBLISHED with the three seed widgets binding `ATT_PRESENT_PCT`, `LEAVE_ON_TODAY`, and `PERF_AVG_RATING`. MGR-A authenticated with P02 scope over OU-A.
- **Test data:** `GET /analytics/dashboards/{MGR_TEAM}/render?scope=OU-A&period=2026-06` as MGR-A.
- **Steps:** Render the `MGR_TEAM` dashboard as MGR-A.
- **Expected:** Three governed KPI tiles render — Present Today % (`PERCENT`), On Leave Today (`COUNT`), Team Avg Rating (`SCORE`) — each bound to its ACTIVE `kpi_definition` (not an inline formula), P02-scoped to OU-A, FR-17-suppressed, and carrying `data_as_of`; no new dashboard/widget entity beyond the seeded rows.

---

## 3. Traceability Matrix (FR → TC ids)

| FR | Title | Test cases | Gaps |
|---|---|---|---|
| FR-G14-01 | Role-Based Dashboard Framework & Layout | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-101, TC-108 | none |
| FR-G14-02 | KPI Definition & Calculation Engine | TC-009, TC-010, TC-011, TC-012, TC-013, TC-014, TC-015, TC-016, TC-103, TC-106, TC-107, TC-108 | none |
| FR-G14-03 | Analytics Data Layer (marts + ETL X.1) | TC-017, TC-018, TC-019, TC-020, TC-021, TC-022 | none |
| FR-G14-04 | Permission-Scoped Access via P02 (RLS) | TC-023, TC-024, TC-025, TC-026, TC-027, TC-028, TC-029, TC-030, TC-031, TC-101 | none |
| FR-G14-05 | Workforce Analytics | TC-032, TC-033, TC-034, TC-035, TC-036, TC-037, TC-102, TC-106 | none |
| FR-G14-06 | Operational Analytics | TC-038, TC-039, TC-040, TC-026, TC-027, TC-102, TC-106 | none |
| FR-G14-07 | Compliance & Statutory Dashboards | TC-041, TC-042, TC-043, TC-044, TC-045, TC-102 | none |
| FR-G14-08 | Self-Service Report Builder | TC-046, TC-047, TC-048, TC-049, TC-104 | none |
| FR-G14-09 | Scheduled Distribution & Export | TC-050, TC-051, TC-052, TC-053, TC-045, TC-104 | none |
| FR-G14-10 | Drill-Down & Drill-Through (P02) | TC-054, TC-055, TC-056, TC-025 | none |
| FR-G14-11 | Alerting, Thresholds & Targets | TC-057, TC-058, TC-059, TC-060 | none |
| FR-G14-12 | Data Freshness & Reconciliation | TC-061, TC-062, TC-063, TC-064, TC-101 | none |
| FR-G14-13 | Deterministic Retirement Forecasting | TC-065, TC-066, TC-067 | none |
| FR-G14-14 | Benchmarking & Comparative Analytics | TC-068, TC-069 | none |
| FR-G14-15 | NL Query & Hardened Embedded BI | TC-070, TC-071, TC-072, TC-073, TC-074 | none |
| FR-G14-16 | Mobile, Briefing & Offline Policy | TC-075, TC-076, TC-077 | none |
| FR-G14-17 | Metric-Level Privacy & Suppression | TC-078, TC-079, TC-080, TC-081, TC-037, TC-056 | none |
| FR-G14-18 | Probabilistic Prediction & Fairness | TC-082, TC-083, TC-084, TC-085 | none |
| FR-G14-19 | Establishment & Position Reference | TC-086, TC-087, TC-088, TC-034, TC-035, TC-041 | none |
| FR-G14-20 | DPDP Rectification & Erasure Propagation | TC-089, TC-090, TC-091, TC-092 | none |
| FR-G14-21 | Source Data Contracts & Schema-Drift | TC-093, TC-094, TC-095 | none |
| FR-G14-22 | Access-Anomaly Detection | TC-096, TC-097, TC-098 | none |
| FR-G14-23 | Bitemporal Snapshot & As-Of-Knowledge | TC-099, TC-100, TC-013, TC-067, TC-088 | none |
| Platform conventions | Correlation/pagination/idempotency/envelope/auth | TC-105 | none |

**FR coverage: 23 of 23 (100%), 0 gaps.** All 23 FRs plus the cross-cutting platform-contract layer are covered; every critical data-governance guarantee (P02 RLS, cross-scope leak, small-cell/complementary suppression, KPI versioning, bitemporal reproducibility, freshness, drill-through gating, predictive fairness/friction gate, NL governance, embed-token lifecycle, DPDP propagation, maker-checker state transitions) has at least one P1 case.

---

## 4. Coverage Summary

### 4.1 By Type

| Type | Count | Test cases |
|---|---|---|
| Functional | 20 | TC-001, TC-005, TC-008, TC-009, TC-015, TC-017, TC-030, TC-032, TC-039, TC-040, TC-046, TC-050, TC-064, TC-068, TC-070, TC-077, TC-086, TC-093, TC-096, TC-108 |
| Boundary | 6 | TC-012, TC-016, TC-036, TC-048, TC-081, TC-095 |
| Negative | 9 | TC-003, TC-010, TC-014, TC-021, TC-035, TC-052, TC-071, TC-073, TC-090 |
| Authorization-RLS | 19 | TC-004, TC-023, TC-024, TC-025, TC-026, TC-027, TC-028, TC-031, TC-044, TC-047, TC-049, TC-051, TC-054, TC-069, TC-074, TC-075, TC-083, TC-087, TC-092 |
| Privacy-Suppression | 7 | TC-037, TC-056, TC-076, TC-078, TC-079, TC-080, TC-084 |
| Data-Freshness | 4 | TC-018, TC-061, TC-062, TC-063 |
| State-Transition | 13 | TC-002, TC-011, TC-019, TC-029, TC-053, TC-057, TC-060, TC-066, TC-072, TC-082, TC-085, TC-089, TC-098 |
| Data-Integrity | 19 | TC-006, TC-013, TC-020, TC-033, TC-034, TC-038, TC-041, TC-042, TC-055, TC-058, TC-059, TC-065, TC-067, TC-088, TC-091, TC-094, TC-097, TC-099, TC-106 |
| API-Contract | 5 | TC-007, TC-022, TC-043, TC-105, TC-107 |
| E2E-Flow | 6 | TC-045, TC-100, TC-101, TC-102, TC-103, TC-104 |

> Some cases exercise more than one concern (e.g. TC-011 also asserts a version-overlap negative, TC-090 a BLOCKED_RETENTION state); each is counted under its **primary** declared type. Total distinct test cases: **108** (TC-G14-001 … TC-G14-108). Type counts sum to 108. *(v3.2 field reconciliation added TC-106–TC-108: seeded dept-view KPI catalog resolution, the `HOURS` unit, and seed-widget render.)*

### 4.2 By Priority

| Priority | Count | Focus |
|---|---|---|
| P1 (critical) | 50 | Data-governance guarantees: P02 RLS + cross-scope leak (incl. sensitive G09/G10/G11), small-cell + complementary suppression, KPI versioning/overlap, bitemporal reproducibility, drill-through gating, predictive fairness + friction gate, NL/embed governance, DPDP propagation + retention block, maker-checker SoD, mart FAILED handling, platform contract. |
| P2 (high) | 47 | Core functional flows, benchmarking, freshness states, scheduling/export, establishment math, anomaly detection, compliance exports, seeded dept-view KPI catalog + `HOURS` unit + seed widgets. |
| P3 (medium) | 11 | Edge/UX cases: empty scope, role-adaptive language, additive schema change, drift freeze, anomaly review, retired-KPI auto-pause, concurrent-refresh contention. |

### 4.3 Governance-Guarantee Coverage Map (critical)

| Guarantee | Primary cases |
|---|---|
| Row-level security via P02 (manager sees only scope) | TC-023, TC-024, TC-028, TC-031, TC-101 |
| No cross-scope leak of G09/G10/G11 sensitive data (key risk) | TC-025, TC-026, TC-027, TC-039, TC-055 |
| Small-cell + complementary suppression (no re-identification) | TC-037, TC-056, TC-078, TC-079, TC-080, TC-081, TC-084 |
| KPI definition consistency + versioning | TC-011, TC-013, TC-014, TC-103 |
| Bitemporal reproducibility (as-of-knowledge) | TC-067, TC-088, TC-099, TC-100 |
| Data-freshness + stale-data behaviour | TC-018, TC-061, TC-062, TC-063 |
| Self-service report builder + scheduled export | TC-046, TC-047, TC-050, TC-051, TC-104 |
| Drill-through permission-checked (live P02) | TC-054, TC-055, TC-056 |
| Predictive analytics fairness + friction gate | TC-082, TC-083, TC-084, TC-085 |
| NL query governance | TC-070, TC-071 |
| Embed token expiry/revocation | TC-072, TC-073, TC-074 |
| DPDP rectification/erasure propagation | TC-089, TC-090, TC-091, TC-092 |
| Maker-checker publish (KPI/scope-policy/model/dashboard) | TC-002, TC-011, TC-029, TC-072, TC-082 |
| Access audited (P05 mirror) | TC-006, TC-055, TC-083, TC-096, TC-098 |
| Mart consistency / contract drift | TC-020, TC-021, TC-094 |
| E2E role dashboard + cross-module KPI | TC-101, TC-102 |
