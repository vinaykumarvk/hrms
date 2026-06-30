# Dashboard and Analytics — HRMS Module BRD (v2.0)

**Module code:** M14-DAS
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM analytics (Workday Prism / SAP SuccessFactors People Analytics / Oracle HCM OTBI bar) honouring Indian public-sector statutory reporting (reservation roster, SR verification, cadre/seniority, retirement profiling)
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v2.0 (revised after Adversarial Council stress-test; supersedes v1.0)
**Status:** Draft for Gate A review (incorporates all mandatory council amendments R1–R16)
**Council reference:** `docs/evaluation/M14-dashboard-and-analytics-council.md` — Conditional GO with mandatory amendments; audit-fatal risks R1, R3, R4, R6, R9 resolved herein before LLD.

---

## 1. Executive Summary

### 1.1 Purpose

The Dashboard and Analytics module (**M14-DAS**) is the **cross-module intelligence layer** of the HRMS. It reads from every transactional module (M01–M13), transforms raw operational data into governed, version-controlled metrics, and presents them through **role-based dashboards**, **workforce and operational analytics**, **compliance & statutory dashboards**, and a **self-service report builder**. M14 is the single place where a leader, an HR officer, a department head, an auditor, or an employee sees "the numbers" — and every number is **defined once, computed consistently, permission-scoped, temporally honest, fairness-audited, rectifiable, and traceable back to the source record**.

M14 owns **no transactional master data**. It defines and owns only its **analytics artefacts**: dashboards, widgets, KPI definitions (with effective-dated targets), saved views, saved reports, report schedules, alert rules, embed tokens, source data contracts, an establishment/position reference, predictive models with model cards, and an **analytics data layer** (semantic model, data marts, materialised views, bitemporal snapshot store, and an ETL/refresh pipeline). It enforces **row-level security that mirrors the operational RBAC and org-unit scoping** *and* **metric-level privacy** (complementary small-cell suppression) so that the same dashboard shows a manager only their span, an HR officer only their delegated org units, and an executive the whole enterprise — without leaking a single record beyond permission **and without re-identifying individuals through aggregate arithmetic**.

### 1.2 Business Context and Problem Statement

Public-sector HR leadership today reconstructs the workforce picture from spreadsheets exported out of disconnected systems: headcount that disagrees between payroll and the establishment register, reservation-roster compliance computed by hand, retirement bulges discovered too late to plan succession, SLA breaches invisible until an audit, and "the same KPI" calculated three different ways by three departments. The cost is poor decisions, audit findings, statutory non-compliance (reservation rosters, mandatory training, SR verification), and an inability to answer basic questions — "how many Group-A posts are vacant in District X?" — without a week of manual effort. M14 eliminates this by providing **one governed metric layer, one set of role-scoped dashboards, and self-service analytics** with full lineage, freshness transparency, **bitemporal reproducibility (the "June report" reads the same in September)**, and drill-through to the authoritative record — and crucially provides a **reconciliation explainer** that answers "why does this number differ from what Payroll told me?" directly on screen.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | One governed definition per metric | 100% of dashboard tiles resolve to a registered `kpi_definition`; zero ad-hoc inline formulae in production |
| G2 | Permission-scoped truth | Every query is RLS-filtered; an automated test proves no role sees a record outside its scope |
| G3 | Consistency with sources | KPI recomputation against source modules reconciles **at the same watermark** within per-KPI tolerance; reconciliation report shows 0 unexplained variance |
| G4 | Freshness transparency | Every dashboard and report shows an explicit `data_as_of` timestamp and staleness state in **role-adaptive language**; no silent stale data |
| G5 | Self-service | HR/department users build, save, schedule, and export reports without IT tickets |
| G6 | Statutory compliance visibility | Reservation roster, mandatory training, SR verification, and SLA dashboards available to authorised roles with audit-grade exports, pinned to a **named establishment/position source of record** |
| G7 | Forward-looking insight, fairly governed | Retirement forecasting (deterministic) ships early; attrition/succession is advisory, **fairness-audited, friction-gated, and prohibited as a sole administrative basis** |
| G8 | Performance at scale | P95 dashboard load < 2.5s on pre-aggregated marts for an enterprise of 100k+ employees, with **async audit-on-read** sustaining 500 concurrent users |
| G9 | Temporal honesty | Every snapshot is bitemporal (valid-time + knowledge-time); an "as-of-knowledge" report reproduces exactly what was shown historically |
| G10 | Rectifiability | A DPDP correction/erasure in M01 propagates to marts, snapshots, predictions, and export artefacts within SLA, reconciled against statutory retention |

### 1.4 Scope Summary

In scope: role-based dashboard framework with KPI tiles/charts/drill-down; configurable, versioned, **effective-dated** KPI definition & calculation engine; the analytics data layer (semantic model, data marts, materialised views, **bitemporal snapshots**, ETL refresh, freshness tracking); row-level security mirroring RBAC **plus metric-level complementary suppression**; **maker-checker on RLS policy and embed-token changes**; workforce analytics; per-module operational analytics; compliance & statutory dashboards pinned to a named **establishment/position reference**; self-service report builder; scheduled report distribution & multi-format export (PDF/Excel/CSV); drill-through to source records (permission-gated); alerting/thresholds/KPI targets (effective-dated); data-freshness indicators & stale-data behaviour with **role-adaptive language**; **deterministic retirement forecasting**; **probabilistic attrition/succession with a fairness gate and friction-gated individual scores**; benchmarking; natural-language query (confidence-gated, provenance-logged, named LLM) & embedded BI (hardened transport, revocation); mobile/executive dashboards (with offline RESTRICTED-data policy); **DPDP rectification/erasure propagation**; **source data contracts**; and **access-anomaly detection**.

Out of scope (owned elsewhere): all transactional capture and writes (M01–M13 own their data; M14 reads only); the operational RBAC catalog and authentication (platform); document storage internals (M13 — M14 references generated export objects); the statutory SR ledger writes (M12). M14 **never mutates source records**; drill-through opens the owning module's record view, it does not edit it. The **adjudication** of reservation roster decisions and the **authoring** of sanctioned-strength values remain establishment/administration functions; M14 hosts the establishment reference and reports compliance but does not approve posts.

### 1.5 Key Stakeholders

Employee (self-service), Reporting Manager, HR Officer/Admin, Department Head / Appointing Authority, Executive / Leadership (Secretary, HoD, CEO-equivalent), Auditor (read-only + anomaly review), Analytics Administrator (KPI/dashboard steward), Data Engineer (ETL/mart operator), Establishment Officer (position/sanctioned-strength custodian — **new**), Data Protection Officer (DPO — rectification/erasure governance — **new**), System Administrator.

### 1.6 Success Criteria

M14 is "successful" when: every published dashboard tile maps to a governed KPI; all queries are RLS-enforced and pass scope-leak **and aggregate re-identification** tests; freshness is visible on every surface in role-appropriate words; snapshots are bitemporal and an audit "as-of-knowledge" reproduces history exactly; HR and department users self-serve reports and schedules; statutory dashboards are live, exportable, and pinned to a named establishment source; predictive views carry model cards, fairness assessments, and prohibited-use clauses with friction-gated individual access; NL query refuses below confidence and logs its interpretation; embed tokens are revocable and never travel in URLs; DPDP corrections/erasures propagate across the analytics estate; and the metric layer reconciles to the sources at watermark within published tolerance — all with a complete, **asynchronous, anomaly-monitored** audit trail of who viewed/exported what.

---

## 1A. Amendments (v1 → v2)

Every adopted council improvement is incorporated below. Risk IDs reference the council Risk Register.

| # | Adopted improvement (council) | Risk | Where/how incorporated in v2 |
|---|---|---|---|
| 1 | Metric-level privacy / complementary suppression on tiles, charts & exports | R1 (Critical) | New **FR-M14-17**; new entity **E24 `suppression_policy`**; DI rule 15; error `SMALL_CELL_SUPPRESSED` extended to aggregate reads + `COMPLEMENTARY_SUPPRESSION_APPLIED`; §16.4 rewritten; launch gate §13.4 |
| 2 | Bitemporal snapshots + as-of-knowledge reproducibility | R3 (Critical) | New **FR-M14-23**; **E04 `kpi_snapshot`** gains `valid_time`, `knowledge_time`, `is_superseded`; DI rule 6 & 12 reconciled; FR-02 backfill edge case resolved; API `asOfKnowledge` param |
| 3 | Stamp KPI version + definition hash on every snapshot | R2 (High) | **E04** gains `kpi_version`, `definition_hash`; FR-02 AC7/BR5; trend version-marker UI; error `CROSS_VERSION_AGGREGATION_BLOCKED` |
| 4 | Predictive fairness governance (exclusion list, adverse-impact test, model card, prohibited-use) | R4 (Critical) | New **FR-M14-18**; **E14 `prediction_model`** gains `protected_features_excluded`, `adverse_impact_result`, `intended_use`, `prohibited_use`, `model_card_ref`, `fairness_status`; state table §10.6; error `MODEL_FAIRNESS_ASSESSMENT_REQUIRED` |
| 5 | Friction-gate individual predictive scores | R4 (Critical) | FR-M14-18 AC4/AC5; `analytics_access_log.action` gains `VIEW_INDIVIDUAL_PREDICTION`; error `PREDICTION_INDIVIDUAL_GATED` |
| 6 | Split FR-13 deterministic vs probabilistic | E/Reviewer-3 | **FR-M14-13** = deterministic retirement (Phase 1); **FR-M14-18** = probabilistic attrition/succession (Phase 3, fairness-gated); §14.2 dependency graph re-phased |
| 7 | Maker-checker + SoD on RLS policy & embed tokens | R6 (Critical) | FR-04 AC7/AC8 + "preview-as-role" diff; FR-15 embed changes; **E11** gains approval workflow; new **E18 `embed_token`**; DI rule 10 extended; error `RLS_POLICY_REQUIRES_CHECKER` |
| 8 | Async, partitioned audit-on-read | R5 (High) | §8.1 rewritten; **E16** gains `log_fidelity`; NFR write-throughput; FR-22 consumes the partitioned store |
| 9 | Watermark-relative reconciliation | R7 (High) | DI rule 11 & FR-03 AC5 redefined (mart-at-watermark vs source-as-of-same-watermark, per-KPI tolerance, sustained-variance grace); §10.3 guard |
| 10 | Name establishment / position-management source | R8 (High) | New **FR-M14-19**; new entity **E21 `establishment_position`**; mart `MART_ESTABLISHMENT`; vacancy (FR-05) & reservation (FR-07) denominators pinned to it; error `ESTABLISHMENT_REFERENCE_MISSING` |
| 11 | DPDP rectification/erasure propagation | R9 (Critical) | New **FR-M14-20**; new entity **E22 `data_subject_change`**; DI rule 16; errors `ERASURE_PROPAGATION_PENDING`, `RETENTION_OVERRIDE_BLOCKS_ERASURE`; reconciles append-only rules with statutory retention |
| 12 | Harden embed transport (no URL token, CSP, revocation, rotation) | R10 (High) | FR-15 amended; **E18 `embed_token`** with `status` REVOKED/ROTATED; §8 security headers; error `EMBED_TOKEN_REVOKED` |
| 13 | Source data contracts + CDC named | R11 (High) | New **FR-M14-21**; new entity **E19 `source_data_contract`**; CDC = **Debezium**; CI contract tests; error `SOURCE_CONTRACT_VIOLATION` |
| 14 | NL-query confidence gating, provenance, named LLM | R12 (Med-High) | FR-15 amended; new entity **E20 `nl_query_log`**; LLM named & on-prem; errors `NLQ_CONFIDENCE_TOO_LOW`, `NLQ_CLARIFICATION_REQUIRED` |
| 15 | Effective-dated targets & thresholds | R13 (Medium) | New entity **E17 `kpi_target_history`**; FR-02/FR-11/FR-14 use the value in force for the period; benchmark RAG corrected |
| 16 | Mobile/offline RESTRICTED-data policy | R14 (Medium) | FR-16 amended (encrypted cache, exclude RESTRICTED offline, expiry, remote-wipe); NFR + security rule |
| 17 | Hybrid build-vs-buy architecture decision record | R15 | New **§4.1 ADR-01**: governed core built; charting/layout/export/scheduler/NL-orchestration adopted, never hold DB credentials |
| 18 | Phase the scope; trim consumption widget palette | R15 | §14.2/§14.3 re-sequenced into Phase 1/2/3; consumer palette defers MAP/FUNNEL; authoring catalog unchanged |
| 19 | Role-adaptive (dual-register) language | R16 (Low-Med) | FR-12 amended (plain-language for leaders, technical for operators); §16.3 dual-register table; plain-language `description` promised on every consumer tile |
| 20 | Access-anomaly detection (preventive) | World-class | New **FR-M14-22**; new entity **E23 `access_anomaly`**; notifications to Auditor/Analytics Admin |
| 21 | User-facing reconciliation explainer | D | FR-12 amended + new API `/reconciliation-explainer`; UI panel; resolves §1.2 "headcount disagrees with payroll" |

**FR count:** v1 = 16 FRs → v2 = **23 FRs** (FR-01…FR-16 retained/amended; FR-17…FR-23 new).
**Entity count:** v1 = 16 owned (E01–E16) → v2 = **24 owned** (E01–E16 retained/amended; E17–E24 new).

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Dashboard Framework & Layout | M14-F01 | Role-based dashboards, widget catalog, layout/personalisation, saved views |
| KPI Definition & Calculation | M14-F02 | Governed, versioned, **effective-dated-target** KPI registry; calculation/derivation engine |
| Analytics Data Layer | M14-F03 | Semantic model, data marts, materialised views, ETL refresh, **watermark-relative reconciliation**, freshness tracking |
| Row-Level Security & Governance | M14-F04 | RLS policies mirroring RBAC + org-unit scoping; **maker-checker + preview-as-role** on policy change; query-time scope filtering |
| Workforce Analytics | M14-F05 | Headcount, demographics, diversity, attrition, **establishment-pinned vacancy**, cadre, age/retirement, span of control |
| Operational Analytics (per module) | M14-F06 | Leave/absenteeism, attendance, payroll cost/overtime, training, appraisal, disciplinary, transfer/promotion, pension |
| Compliance & Statutory Dashboards | M14-F07 | Reservation roster (establishment-pinned), mandatory training, SR verification, pending approvals/SLA breaches |
| Self-Service Report Builder | M14-F08 | Ad-hoc query designer, saved reports, field/filter/aggregation selection |
| Scheduled Distribution & Export | M14-F09 | Report schedules, PDF/Excel/CSV export, bursting, delivery |
| Drill-Down & Drill-Through | M14-F10 | Hierarchy drill, permission-gated drill-through to source records |
| Alerting, Thresholds & Targets | M14-F11 | Effective-dated KPI targets/thresholds, alert rules, triggered alert events |
| Data Freshness & Stale-Data UX | M14-F12 | `data_as_of` surfacing, staleness states, **role-adaptive language**, **reconciliation explainer**, degraded-mode behaviour |
| Deterministic Retirement Forecasting | M14-F13 | DOB + canonical-rule retirement profiling (Phase 1, near-zero model risk) |
| Benchmarking & Comparative Analytics | M14-F14 | Period-over-period, peer org-unit, **effective-dated** target vs actual benchmarking |
| Natural-Language Query & Embedded BI | M14-F15 | Confidence-gated NL-to-query assistant; **hardened, revocable** embeddable widgets |
| Mobile & Executive Dashboards | M14-F16 | Responsive/mobile dashboards, executive briefing pack, **offline RESTRICTED-data policy** |
| Metric-Level Privacy & Complementary Suppression | M14-F17 | Small-cell + complementary suppression on tiles/charts/exports |
| Probabilistic Predictive Analytics & Fairness Governance | M14-F18 | Attrition/succession risk, model cards, adverse-impact testing, friction-gated individual scores |
| Establishment & Position Reference Integration | M14-F19 | Sanctioned strength, roster points, position master as the named denominator source |
| DPDP Rectification & Erasure Propagation | M14-F20 | Propagate corrections/erasures across marts, snapshots, predictions, exports |
| Source Data Contracts & Schema-Drift Protection | M14-F21 | Versioned source views, CI contract tests, breaking-change alerts (Debezium CDC) |
| Access-Anomaly Detection | M14-F22 | Proactive detection over the access ledger (bulk export, scope probing) |
| Bitemporal Snapshot & As-Of-Knowledge Reproducibility | M14-F23 | Valid-time + knowledge-time snapshots; audit reproduction of historical figures |

### 2.2 Common Capabilities (inherited from Shared Foundation)

All M14 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); RBAC + org-unit row-level scoping; immutable `audit_log` write on every config change **and every report export/drill-through view** (the read-path audit is **asynchronous/batched** — §8.1); `documents` (M13) for generated export artefacts; `notifications` for alerts and scheduled-report delivery. Maker-checker applies to **publishing** KPI definitions, enterprise/statutory dashboards, **RLS scope policies, embed-token issuance, and predictive-model activation**.

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
| **Sanctioned strength / posts / roster points** | **In (hosted reference, FR-19)** | **No M01–M13 module owns posts; M14 hosts the establishment reference; Establishment Officer authors values, M14 reports compliance** |
| **Source-to-mart data contracts** | **In (owned, FR-21)** | **M14 owns the versioned contract; each source module co-signs its schema promise** |
| **DPDP rectification/erasure across analytics estate** | **In (owned pipeline, FR-20)** | **M01/DPO trigger; M14 propagates to its derived copies** |
| Editing a source record | Out | Drill-through is read-only; edits happen in owning module |
| KPI / dashboard / report definitions | In (owned) | M14 owns analytics artefacts |
| ETL / data marts / materialised views / bitemporal snapshots | In (owned) | M14 owns the analytics layer |
| Adjudicating reservation/roster decisions or approving posts | Out | Establishment/administration function; M14 reports, never approves |

### 2.4 Assumptions and Constraints

- M14 reads from source modules through a **governed mart layer** fed by **versioned source data contracts (FR-21)** and **Debezium CDC**, refreshed on a schedule (default near-real-time for operational marts, daily for heavy demographic/financial marts); it does **not** issue ad-hoc cross-joins against live OLTP tables for dashboard rendering.
- The operational **RBAC + org-unit hierarchy is authoritative**; M14 derives RLS scope from it and re-derives on each session — it never invents its own access model. **RLS policy and embed-token mutations are themselves maker-checked (FR-04, FR-15).**
- All sensitive financial figures (payroll cost, salary) are sourced from **locked/finalised** snapshots only; in-progress payroll is excluded from cost analytics unless explicitly running a "what-if" view fed by M10 FR-18.
- Reservation-roster, cadre, and seniority logic uses the **same canonical reference data** as the owning modules; **sanctioned strength and roster points are sourced from the establishment/position reference (FR-19)**, which is the named denominator authority.
- Predictive models are **advisory**; outputs are labelled as estimates with methodology, **fairness assessment, and a prohibited-use clause**, never as administrative decisions, and **individual scores are friction-gated**.
- Money math in marts uses fixed-point decimal; aggregates round at presentation only.
- Single legal entity per deployment; the mart schema is entity-aware (`legal_entity_id`) for future multi-entity.
- **Snapshots are bitemporal**: corrections create new knowledge-versions rather than mutating history (FR-23).
- **Reconciliation is watermark-relative**: a mart is compared to the source *as of the same watermark*, not wall-clock now (FR-03).
- **The analytics estate is a controlled second copy of personal data** with a rectification/erasure pipeline (FR-20) reconciled against statutory retention overrides.

---

## 3. Roles & Permissions

### 3.1 Module Roles (extending the Shared RBAC baseline)

| Role | M14 responsibility |
|---|---|
| Employee (Self-Service) | View own personal dashboard; no aggregate/other-employee data |
| Reporting Manager | View team dashboard scoped to direct + indirect reports; drill-through to own team members |
| HR Officer / Admin | Operate dashboards/reports scoped to delegated org units; build/save/schedule reports; drill-through within scope |
| Department Head / Appointing Authority | Department-wide analytics for owned org subtree; approve department dashboard publication |
| Executive / Leadership | Enterprise-wide dashboards, predictive & benchmarking views, executive briefing pack; read-only |
| Auditor (read-only) | Read all dashboards/reports cross-module + the M14 access/export audit trail **and access-anomaly queue**; no write |
| Analytics Administrator | Steward KPI definitions, widget catalog, dashboard templates, alert rules, **suppression policy**; publish (checker) governed metrics; **review anomalies** |
| Data Engineer | Operate ETL/mart refresh, monitor freshness/reconciliation, re-run failed loads, **manage source data contracts**; no dashboard publication authority |
| **Establishment Officer** (new) | Author/maintain `establishment_position` (sanctioned strength, roster points); no dashboard publication; values feed vacancy/reservation denominators |
| **Data Protection Officer (DPO)** (new) | Govern `data_subject_change` (rectification/erasure), approve retention overrides, audit propagation completeness |
| System Administrator | Manage RLS policy mappings (**as maker; never self-approve**), embed-BI tokens (**maker**), retention; **no self-approval of metric/policy/token publication** |

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Publish, X=No access)

| Capability | Employee | Manager | HR Officer | Dept Head | Executive | Auditor | Analytics Admin | Data Engineer | Establ. Officer | DPO | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Own personal dashboard | R | R | R | R | R | R | R | R | R | R | R |
| Team/scoped aggregate dashboard | X | R(team) | R(scope) | R(dept) | R(all) | R(all) | R(all) | R | X | R(all) | R |
| Enterprise/leadership dashboard | X | X | X | R(dept) | R | R | R | X | X | R | R |
| Compliance/statutory dashboard | X | X | R(scope) | R(dept) | R | R | R | X | R(estab) | R | R |
| KPI definition | X | X | X | X | X | R | C/U/A | R | X | R | R |
| Widget/dashboard template | X | X | R | R | R | R | C/U/A | X | X | X | R |
| Saved view (personal) | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U |
| Saved report (shared) | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | X | R | R |
| Report schedule | X | C(team) | C/U | C/U | C/U | X | C/U | X | X | X | R |
| Export (PDF/Excel/CSV) | R(own) | R(team) | R(scope) | R(dept) | R(all) | R(all) | R(all) | X | R(estab) | R | R |
| Drill-through to source record | own | team | scope | dept | per-perm | R(all) | per-perm | X | X | R(all) | per-perm |
| **Individual predictive score (friction-gated)** | X | X | R(scope, gated) | R(dept, gated) | R(gated) | R(all, gated) | R(gated) | X | X | R | X |
| Aggregate/banded predictive distribution | X | X | R(scope) | R(dept) | R | R | R/U(config) | X | X | R | R |
| Alert rule / threshold | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | X | X | R |
| Predictive/benchmark views | X | X | R(scope) | R(dept) | R | R | R/U(config) | X | X | R | R |
| ETL / mart refresh control | X | X | X | X | X | R(status) | R | C/U | X | X | R |
| **Source data contract** | X | X | X | X | X | R | R | C/U/A | X | X | R |
| **Establishment / position reference** | X | X | R | R | R | R | R | X | C/U | R | R |
| **RLS policy mapping (maker-checker)** | X | X | X | X | X | R | A(checker) | X | X | R | C/U(maker) |
| **Embed-BI token (maker-checker)** | X | X | X | X | X | R | A(checker) | X | X | X | C/U(maker) |
| **DPDP rectification/erasure (data_subject_change)** | X | X | X | X | X | R | R | R(exec) | X | C/U/A | R |
| **Access-anomaly queue** | X | X | X | R(dept) | R | R | R/U | X | X | R | R |
| M14 access/export audit log | X | X | X | R(dept) | R | R | R | X | X | R | R |

All access is additionally **row-level scoped** by org_unit subtree and reporting line (FR-M14-04) **and metric-level suppressed** (FR-M14-17). A role grant never overrides RLS or suppression; the effective dataset is the intersection of capability grant, data scope, and privacy threshold.

---

## 4. Shared Application Foundation

M14 inherits the Shared Foundation (§5 of `SHARED_FOUNDATION.md`) verbatim:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) frontend with a charting/visualisation layer; REST API under `/api/v1`; PostgreSQL primary datastore with a dedicated **analytics schema** (marts + materialised views + **bitemporal snapshot store** + **partitioned append-only access ledger**); object storage (M13) for generated export files; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; **RBAC + row-level scoping by org_unit is enforced inside every analytics query** (FR-M14-04), with **metric-level complementary suppression** layered on top (FR-M14-17).
- **Canonical error envelope:** `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + M14-specific (§8.3).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail (including **view/export** events for sensitive analytics), PII minimisation, DPDP Act 2023 alignment (**incl. rectification/erasure propagation, FR-20**), statutory retention.
- **NFR baseline:** P95 API < 500ms (mart-backed reads), dashboard P95 < 2.5s; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h. Analytics-specific NFRs in §9.

**Shared entities referenced (not redefined):** `employees`, `users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances/tasks`. M14 reads facts owned by M01–M13 through the mart layer and references export objects in `documents`.

### 4.1 ADR-01 — Hybrid Build-vs-Buy Architecture Decision (council §4 focused pass, R15)

**Decision:** M14 is a **hybrid stack**. The governed data-access core is **built**; commodity presentation/distribution machinery is **adopted** and never touches the marts directly.

| Layer | Build or Buy | Rationale |
|---|---|---|
| **Governed KPI registry + DSL + versioning** (E03/E04, FR-02) | **Build** | Differentiated; no off-the-shelf equivalent meets the governance bar |
| **RLS query-rewriter + field masking + complementary suppression** (FR-04, FR-17) | **Build** | Security-critical; off-the-shelf BI is *weakest* exactly here and bolting RLS on widens the leak surface |
| **Freshness / `dataFreshness` contract + reconciliation** (FR-12, FR-03) | **Build** | Cross-cutting correctness contract |
| **Cross-module drill-through authz** (FR-10) and **access/audit ledger semantics** (E16) | **Build** | Governs exactly who may cross from aggregate to record |
| **Bitemporal snapshot store** (FR-23) | **Build** | Statutory reproducibility primitive |
| Chart rendering, grid/layout engine | **Buy/adopt** (e.g. ECharts/AG-Grid-class libraries) | Commodity; receive already-scoped, already-masked, already-freshness-stamped result sets |
| PDF/XLSX/CSV export rendering | **Buy/adopt** | Commodity rendering of governed result sets |
| Cron scheduler | **Buy/adopt** | Commodity orchestration |
| NL-to-query LLM orchestration | **Buy/adopt** (on-prem LLM, §FR-15) | Orchestration adopted; the **semantic mapping and RLS rewrite remain built** |

**Binding constraint:** only the built governed core holds database credentials. Every adopted library — charting, export, scheduler, NL orchestrator, embed renderer — consumes a result set that has **already** been scope-filtered, field-masked, suppression-applied, and freshness-stamped, and can never reach a mart or the OLTP sources. This collapses the build cost while preserving the security posture and shrinks the embed (R10) and NL (R12) attack surface to thin renderers over the governed core.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

M14 **owns** the following analytics entities (E01–E24). It **references** the shared/source entities listed at the end.

| # | Entity | Owner | Purpose |
|---|---|---|---|
| E01 | `dashboard` | M14 | A named, role-targeted dashboard (canvas of widgets) |
| E02 | `dashboard_widget` | M14 | A tile/chart/table on a dashboard, bound to a KPI or query |
| E03 | `kpi_definition` | M14 | Governed, versioned metric definition (formula, grain, filters) |
| E04 | `kpi_snapshot` | M14 | **Bitemporal** time-series of computed KPI values per scope/period, **version-stamped** |
| E05 | `saved_view` | M14 | A user's saved filter/layout state over a dashboard or report |
| E06 | `saved_report` | M14 | A reusable ad-hoc/report-builder definition |
| E07 | `report_schedule` | M14 | Schedule + recipients + format for automated distribution |
| E08 | `report_execution` | M14 | A single run of a report/export |
| E09 | `analytics_datamart` | M14 | Registry of marts/materialised views (grain, source, refresh, freshness) |
| E10 | `datamart_refresh_log` | M14 | ETL/refresh run log per mart |
| E11 | `rls_scope_policy` | M14 | Maps role + scope rule to row-level filter; **maker-checker governed** |
| E12 | `alert_rule` | M14 | KPI threshold/target rule that emits alerts |
| E13 | `alert_event` | M14 | A triggered alert occurrence |
| E14 | `prediction_model` | M14 | Registered predictive model with **model card + fairness assessment** |
| E15 | `prediction_result` | M14 | Per-entity predictive score |
| E16 | `analytics_access_log` | M14 | **Async, partitioned** view/drill/export access ledger |
| E17 | `kpi_target_history` | M14 | **Effective-dated** KPI targets & alert thresholds (new) |
| E18 | `embed_token` | M14 | Scoped, signed, **revocable/rotatable** embed credential (new) |
| E19 | `source_data_contract` | M14 | Versioned source-view contract per module mart (new) |
| E20 | `nl_query_log` | M14 | NL query, resolved interpretation, confidence, audit (new) |
| E21 | `establishment_position` | M14 | Sanctioned strength / roster points / position master (new) |
| E22 | `data_subject_change` | M14 | DPDP rectification/erasure propagation request & state (new) |
| E23 | `access_anomaly` | M14 | Detected anomalous access pattern (new) |
| E24 | `suppression_policy` | M14 | k-anonymity + complementary suppression configuration (new) |

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
| `widget_type` | ENUM | N | KPI_TILE, LINE, BAR, PIE, DONUT, TABLE, HEATMAP, GAUGE, FUNNEL, MAP, TEXT (consumer palette defers MAP/FUNNEL — §14) |
| `kpi_id` | UUID FK→kpi_definition | Y | bound KPI (null for free-table widgets) |
| `query_ref` | UUID FK→saved_report | Y | alternative bound query |
| `dimensions_json` | JSONB | Y | group-by dimensions |
| `filters_json` | JSONB | Y | widget-level filters |
| `drilldown_path_json` | JSONB | Y | ordered drill hierarchy |
| `drillthrough_target` | TEXT | Y | owning-module record route template |
| `position_json` | JSONB | N | x/y/w/h on grid |
| `refresh_hint` | ENUM | N | LIVE, MART, CACHED |
| `show_plain_definition` | BOOL | N | **v2** render plain-language KPI definition on the tile (default true for consumer dashboards) |
| `display_order` | INT | N | |
| audit fields | — | — | |

#### E03 `kpi_definition`

| Field | Type | Null | Notes |
|---|---|---|---|
| `kpi_id` | UUID PK | N | |
| `kpi_code` | TEXT | N | e.g. `HEADCOUNT_ACTIVE` (unique per active version) |
| `name` | TEXT | N | |
| `description` | TEXT | N | business definition (audience-readable; **rendered on consumer tiles**) |
| `plain_language_note` | TEXT | Y | **v2** "what counts / what doesn't" leader-friendly note |
| `domain` | ENUM | N | WORKFORCE, LEAVE, ATTENDANCE, PAYROLL, TRAINING, APPRAISAL, DISCIPLINARY, TRANSFER, PROMOTION, PENSION, COMPLIANCE, SR |
| `version` | INT | N | versioned definition |
| `definition_hash` | TEXT | N | **v2** SHA-256 of (expression+grain+dimensions+source); stamped onto every snapshot |
| `source_mart_id` | UUID FK→analytics_datamart | N | mart the KPI reads |
| `expression` | TEXT | N | safe aggregation DSL (whitelisted functions/columns) |
| `unit` | ENUM | N | COUNT, PERCENT, RATIO, CURRENCY, DAYS, SCORE |
| `grain` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE, PERIOD, ENTERPRISE |
| `default_period` | ENUM | Y | DAY, WEEK, MONTH, QUARTER, YEAR, ROLLING_12M |
| `dimensions_allowed` | TEXT[] | Y | dimensions this KPI may be sliced by |
| `reconciliation_target` | TEXT | Y | **v2** owning-module object the count reconciles against |
| `reconciliation_tolerance` | NUMERIC(10,4) | Y | **v2** per-KPI tolerance (counts default 0 *at watermark*) |
| `direction` | ENUM | Y | HIGHER_BETTER, LOWER_BETTER, ON_TARGET (target now via E17) |
| `min_cell_size` | INT | Y | **v2** per-KPI k override for suppression (FR-17) |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | checker (≠ created_by) |
| audit fields | — | — | |

> **v2 change:** `target_value` migrated out of `kpi_definition` to the effective-dated `kpi_target_history` (E17). A view exposes the target *in force for the period being shown*.

#### E04 `kpi_snapshot` (bitemporal, version-stamped)

| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `kpi_version` | INT | N | **v2** definition version that produced this value |
| `definition_hash` | TEXT | N | **v2** hash of the producing definition |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE, MANAGER |
| `scope_id` | TEXT | Y | org_unit_id / cadre / manager employee_id |
| `period_key` | TEXT | N | e.g. `2026-06`, `FY2026_27` |
| `valid_time` | DATE | N | **v2** the business period instant the value describes |
| `knowledge_time` | TIMESTAMPTZ | N | **v2** when this value became known (recorded_as_of) |
| `is_superseded` | BOOL | N | **v2** true when a later knowledge-version restates this row |
| `superseded_by` | UUID FK→kpi_snapshot | Y | **v2** the restating row |
| `value` | NUMERIC(18,4) | N | computed value |
| `numerator` | NUMERIC(18,4) | Y | for ratios/percentages |
| `denominator` | NUMERIC(18,4) | Y | |
| `cell_size` | INT | Y | **v2** group size behind the value (drives suppression) |
| `data_as_of` | TIMESTAMPTZ | N | freshness watermark of source mart |
| `computed_at` | TIMESTAMPTZ | N | when snapshot was computed |
| `is_partial` | BOOL | N | true if computed on stale/partial mart |
| audit fields | — | — | append-only; restatement adds rows, never mutates |

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
| `min_cell_size` | INT | Y | **v2** suppression k for this report's aggregates |
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
| `scope_mode` | ENUM | N | OWNER_SCOPE, PER_RECIPIENT_SCOPE |
| `burst_dimension` | TEXT | Y | e.g. per `org_unit` |
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
| `as_of_knowledge` | TIMESTAMPTZ | Y | **v2** knowledge-time the report reproduces (bitemporal) |
| `row_count` | INT | Y | |
| `document_id` | UUID FK→documents (M13) | Y | generated artefact |
| `status` | ENUM | N | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED, **REDACTED** |
| `error_detail` | TEXT | Y | |
| `data_as_of` | TIMESTAMPTZ | Y | freshness at execution |
| `started_at`/`completed_at` | TIMESTAMPTZ | Y | |
| audit fields | — | — | |

> **v2:** `REDACTED` status set when a DPDP erasure (FR-20) invalidates an artefact's lawful basis.

#### E09 `analytics_datamart`

| Field | Type | Null | Notes |
|---|---|---|---|
| `mart_id` | UUID PK | N | |
| `mart_code` | TEXT unique | N | e.g. `MART_HEADCOUNT` |
| `name` | TEXT | N | |
| `mart_type` | ENUM | N | FACT, DIMENSION, AGGREGATE, MATERIALIZED_VIEW, SEMANTIC |
| `grain` | TEXT | N | natural grain description |
| `source_modules` | TEXT[] | N | e.g. `{M01,M03,M12}` |
| `source_objects` | TEXT[] | N | source tables/views |
| `contract_id` | UUID FK→source_data_contract | Y | **v2** governing data contract |
| `refresh_strategy` | ENUM | N | FULL, INCREMENTAL, CDC, ON_DEMAND |
| `refresh_cron` | TEXT | Y | schedule |
| `freshness_sla_minutes` | INT | N | max acceptable staleness |
| `watermark_column` | TEXT | Y | incremental high-water mark |
| `last_refreshed_at` | TIMESTAMPTZ | Y | |
| `last_watermark_value` | TEXT | Y | |
| `reconcile_grace_minutes` | INT | Y | **v2** sustained-variance window before DEGRADED |
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
| `reconcile_variance` | NUMERIC(18,4) | Y | **v2** mart-at-watermark vs source-as-of-watermark delta |
| `status` | ENUM | N | RUNNING, SUCCESS, PARTIAL, FAILED |
| `error_detail` | TEXT | Y | |
| `triggered_by` | UUID FK→users | Y | null = scheduler |
| audit fields | — | — | append-only log |

#### E11 `rls_scope_policy` (maker-checker governed — v2)

| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_id` | UUID PK | N | |
| `role` | TEXT | N | RBAC role this policy applies to |
| `scope_type` | ENUM | N | SELF, REPORTING_LINE, ORG_SUBTREE, DELEGATED_UNITS, ENTERPRISE, NONE |
| `mart_id` | UUID FK→analytics_datamart | Y | null = applies to all marts |
| `filter_expression` | TEXT | N | parameterised predicate |
| `field_mask_json` | JSONB | Y | column-level masking for RESTRICTED fields |
| `priority` | INT | N | resolution order if multiple apply |
| `version` | INT | N | **v2** policy version |
| `status` | ENUM | N | **v2** DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, SUPERSEDED |
| `created_by` (maker) | UUID FK→users | N | **v2** |
| `approved_by` (checker) | UUID FK→users | Y | **v2** ≠ created_by |
| `preview_diff_json` | JSONB | Y | **v2** before/after data-exposure diff captured at approval |
| `is_active` | BOOL | N | only one ACTIVE per (role,mart) |
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
| `threshold_ref` | UUID FK→kpi_target_history | Y | **v2** effective-dated threshold (or static below) |
| `threshold` | NUMERIC(18,4) | Y | static fallback threshold |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `evaluation_freq` | ENUM | N | ON_REFRESH, HOURLY, DAILY |
| `recipients_json` | JSONB | N | RBAC-validated recipients |
| `suppression_window_min` | INT | Y | de-dupe window |
| `hysteresis_pct` | NUMERIC(6,3) | Y | **v2** anti-flap band |
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
| `threshold` | NUMERIC(18,4) | N | the value in force for the period |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `data_as_of` | TIMESTAMPTZ | N | |
| `is_partial` | BOOL | N | **v2** evaluated on stale/partial mart |
| `status` | ENUM | N | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| `acknowledged_by` | UUID FK→users | Y | |
| `acknowledged_at` | TIMESTAMPTZ | Y | |
| `notification_id` | UUID FK→notifications | Y | |
| audit fields | — | — | |

#### E14 `prediction_model` (model card + fairness — v2)

| Field | Type | Null | Notes |
|---|---|---|---|
| `model_id` | UUID PK | N | |
| `model_code` | TEXT unique | N | e.g. `ATTRITION_RISK`, `SUCCESSION_RISK` |
| `model_type` | ENUM | N | RULE_BASED, STATISTICAL, ML |
| `determinism` | ENUM | N | **v2** DETERMINISTIC, PROBABILISTIC |
| `version` | TEXT | N | |
| `features_json` | JSONB | N | input features |
| `protected_features_excluded` | TEXT[] | N | **v2** caste/reservation category, gender, disability, maternity-linked leave proxies |
| `methodology` | TEXT | N | explainable description |
| `model_card_ref` | UUID FK→documents | Y | **v2** published model card (M13) |
| `adverse_impact_result` | JSONB | Y | **v2** disparate-impact test results + thresholds |
| `fairness_status` | ENUM | N | **v2** NOT_ASSESSED, PASSED, FAILED, WAIVED_WITH_REASON |
| `intended_use` | TEXT | N | **v2** approved use |
| `prohibited_use` | TEXT | N | **v2** "must not be sole/primary basis for any administrative action" |
| `source_mart_ids` | UUID[] | N | |
| `confidence_basis` | TEXT | Y | |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | checker (≠ created_by) |
| audit fields | — | — | |

#### E15 `prediction_result`

| Field | Type | Null | Notes |
|---|---|---|---|
| `result_id` | UUID PK | N | |
| `model_id` | UUID FK→prediction_model | N | |
| `subject_type` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE |
| `subject_id` | TEXT | N | |
| `score` | NUMERIC(7,4) | N | 0..1 risk/probability |
| `risk_band` | ENUM | N | LOW, MEDIUM, HIGH, NO_PREDICTION |
| `top_factors_json` | JSONB | Y | explainability drivers |
| `confidence` | NUMERIC(5,4) | Y | |
| `is_individual_gated` | BOOL | N | **v2** true for EMPLOYEE-subject rows requiring friction-gate |
| `period_key` | TEXT | N | |
| `data_as_of` | TIMESTAMPTZ | N | |
| audit fields | — | — | |

#### E16 `analytics_access_log` (async, partitioned — v2)

| Field | Type | Null | Notes |
|---|---|---|---|
| `access_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `action` | ENUM | N | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY, **VIEW_INDIVIDUAL_PREDICTION** |
| `target_type` | ENUM | N | DASHBOARD, WIDGET, REPORT, KPI, RECORD, **PREDICTION** |
| `target_id` | TEXT | Y | |
| `scope_snapshot_json` | JSONB | N | effective RLS scope at access time |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `log_fidelity` | ENUM | N | **v2** FULL (RESTRICTED/EXPORT/DRILLTHROUGH/NL/individual-prediction), SAMPLED (low-sensitivity VIEW) |
| `purpose_text` | TEXT | Y | **v2** purpose prompt captured for friction-gated access |
| `row_count` | INT | Y | rows returned/exported |
| `data_as_of` | TIMESTAMPTZ | Y | |
| `request_id` | TEXT | N | correlation id |
| `occurred_at` | TIMESTAMPTZ | N | partition key |
| (append-only; partitioned by occurred_at; written async) | — | — | mirrors high-fidelity events into shared `audit_log` |

#### E17 `kpi_target_history` (effective-dated — v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `target_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE |
| `scope_id` | TEXT | Y | |
| `target_value` | NUMERIC(18,4) | N | |
| `target_kind` | ENUM | N | KPI_TARGET, ALERT_THRESHOLD |
| `effective_from` | DATE | N | start of validity |
| `effective_to` | DATE | Y | null = open-ended |
| `set_by` | UUID FK→users | N | |
| `status` | ENUM | N | ACTIVE, SUPERSEDED |
| audit fields | — | — | append; new value supersedes by date, never mutates history |

#### E18 `embed_token` (hardened — v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `token_id` | UUID PK | N | opaque id (never the bearer secret) |
| `token_hash` | TEXT | N | hash of signed secret; secret never stored plaintext |
| `widget_ids` | UUID[] | N | scoped widgets/dashboards |
| `subject_user_id` | UUID FK→users | Y | bound user (or role) |
| `subject_role` | TEXT | Y | |
| `allowed_frame_ancestors` | TEXT[] | N | CSP frame-ancestors allow-list |
| `issued_by` (maker) | UUID FK→users | N | |
| `approved_by` (checker) | UUID FK→users | Y | ≠ issued_by |
| `expires_at` | TIMESTAMPTZ | N | short-lived |
| `rotated_from` | UUID FK→embed_token | Y | rotation lineage |
| `status` | ENUM | N | PENDING_APPROVAL, ACTIVE, EXPIRED, REVOKED, ROTATED |
| `revoked_by` | UUID FK→users | Y | |
| `revoked_at` | TIMESTAMPTZ | Y | |
| audit fields | — | — | |

#### E19 `source_data_contract` (v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `contract_id` | UUID PK | N | |
| `source_module` | TEXT | N | e.g. `M10` |
| `source_view` | TEXT | N | versioned source view name (e.g. `m10.v_payroll_locked_v3`) |
| `version` | TEXT | N | semantic version |
| `schema_json` | JSONB | N | promised columns, types, nullability, semantics |
| `cdc_mechanism` | ENUM | N | DEBEZIUM_CDC, BATCH, ON_DEMAND |
| `breaking_change_policy` | TEXT | N | notice period + alert routing |
| `status` | ENUM | N | DRAFT, ACTIVE, DEPRECATED, BREACHED |
| `last_contract_test_at` | TIMESTAMPTZ | Y | CI verification timestamp |
| `co_signed_by` | UUID FK→users | Y | owning-module steward |
| audit fields | — | — | |

#### E20 `nl_query_log` (v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `nlq_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `question_text` | TEXT | N | raw NL question |
| `resolved_kpi_id` | UUID FK→kpi_definition | Y | mapped governed KPI |
| `resolved_filters_json` | JSONB | Y | resolved dimensions/filters |
| `confidence` | NUMERIC(5,4) | N | intent confidence |
| `outcome` | ENUM | N | ANSWERED, CLARIFICATION_REQUESTED, REFUSED_LOW_CONFIDENCE, REFUSED_OUT_OF_SCOPE, REFUSED_UNMODELLED |
| `llm_provider` | TEXT | N | named on-prem LLM (see FR-15) |
| `data_as_of` | TIMESTAMPTZ | Y | |
| `occurred_at` | TIMESTAMPTZ | N | |
| audit fields | — | — | append-only |

#### E21 `establishment_position` (v2, new — named denominator source)

| Field | Type | Null | Notes |
|---|---|---|---|
| `position_id` | UUID PK | N | |
| `position_code` | TEXT unique | N | sanctioned post identifier |
| `org_unit_id` | UUID FK→org_units | N | where the post sits |
| `cadre` | TEXT | N | |
| `designation_id` | UUID FK→designations | N | |
| `sanctioned_strength` | INT | N | authorised count for this post group |
| `reservation_category` | TEXT | Y | roster category |
| `roster_point` | INT | Y | roster point number |
| `filled_by_employee_id` | UUID FK→employees | Y | current occupant (read-link to M01) |
| `effective_from` | DATE | N | sanction effective date |
| `effective_to` | DATE | Y | abolition date |
| `status` | ENUM | N | SANCTIONED, FROZEN, ABOLISHED |
| `maintained_by` | UUID FK→users | N | Establishment Officer |
| audit fields | — | — | |

#### E22 `data_subject_change` (DPDP propagation — v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `change_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | subject |
| `change_type` | ENUM | N | RECTIFICATION, ERASURE, RESTRICTION |
| `source_event_ref` | TEXT | N | M01/DPO originating request id |
| `requested_by` | UUID FK→users | N | DPO/M01 |
| `legal_basis` | TEXT | Y | retention-override basis if erasure blocked |
| `affected_marts` | TEXT[] | Y | resolved by impact analysis |
| `affected_snapshots` | INT | Y | count restated/redacted |
| `affected_predictions` | INT | Y | count purged |
| `affected_exports` | INT | Y | M13 artefacts marked REDACTED |
| `status` | ENUM | N | RECEIVED, PROPAGATING, COMPLETED, BLOCKED_RETENTION, FAILED |
| `completed_at` | TIMESTAMPTZ | Y | |
| audit fields | — | — | append-only governance record |

#### E23 `access_anomaly` (v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `anomaly_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `anomaly_type` | ENUM | N | OFF_HOURS_BULK_EXPORT, SCOPE_EDGE_PROBING, UNUSUAL_DRILLTHROUGH_VOLUME, REPEATED_DENIED, MASS_NL_QUERY |
| `evidence_json` | JSONB | N | metrics that tripped detection |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `detected_at` | TIMESTAMPTZ | N | |
| `status` | ENUM | N | OPEN, INVESTIGATING, DISMISSED, CONFIRMED |
| `reviewed_by` | UUID FK→users | Y | Auditor/Analytics Admin |
| `notification_id` | UUID FK→notifications | Y | |
| audit fields | — | — | |

#### E24 `suppression_policy` (v2, new)

| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_id` | UUID PK | N | |
| `name` | TEXT | N | |
| `applies_to` | ENUM | N | TILE, CHART, DRILLTHROUGH, EXPORT, ALL |
| `min_cell_size_k` | INT | N | default 5 |
| `complementary` | BOOL | N | suppress complements so totals cannot recover a suppressed cell |
| `band_instead_of_hide` | BOOL | N | show banded range ("<5") vs full hide |
| `domains` | TEXT[] | Y | domains/sensitivities in scope |
| `is_active` | BOOL | N | |
| audit fields | — | — | |

### 5.3 Relationship Map

```
dashboard 1───n dashboard_widget ──n─1 kpi_definition 1───n kpi_snapshot (bitemporal, version-stamped)
kpi_definition 1───n kpi_target_history (effective-dated targets/thresholds)
dashboard_widget ──n─1 saved_report (alt binding)
kpi_definition ──n─1 analytics_datamart ──n─1 source_data_contract ; mart 1───n datamart_refresh_log
saved_report ──n─1 analytics_datamart ;  saved_report 1───n report_schedule 1───n report_execution
report_execution ──n─1 documents (M13)
saved_view ──n─1 dashboard | saved_report
rls_scope_policy ──n─1 analytics_datamart (or global)  [maker-checker via workflow_instances]
alert_rule ──n─1 kpi_definition ; alert_rule ──n─1 kpi_target_history ; alert_rule 1───n alert_event ──n─1 notifications
prediction_model 1───n prediction_result (subject = employee/org_unit/cadre) ; prediction_model ──n─1 documents (model card)
embed_token ──n─m dashboard_widget   [issued maker-checker; revocable]
nl_query_log ──n─1 kpi_definition (resolved intent)
establishment_position ──n─1 org_units ; feeds vacancy & reservation denominators (FR-05/07)
data_subject_change ──> marts / kpi_snapshot / prediction_result / report_execution (propagation targets)
suppression_policy ──> applied to every aggregate read (tiles/charts/exports/drill)
access_anomaly ──> derived from analytics_access_log (async partitioned)
every view/run/export/drillthrough/NL/individual-prediction ──> analytics_access_log (async) ──> audit_log (high-fidelity)
marts READ FROM (via source_data_contract): employees(M01), leave/attendance(M03/M04), transfers(M05),
   promotions(M06), training(M07), appraisal(M08), disciplinary(M09), payroll(M10 locked), pension(M11),
   service_register_events(M12), documents(M13)  [READ-ONLY via Debezium CDC / contracted views]
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `cadres`, `designations`, `pay_scales` | M01/Platform | M14 (via marts) | — (M14 reads only) |
| Leave/attendance/SR/payroll/training/appraisal/disciplinary/transfer/promotion/pension facts | M03–M12 | M14 (via marts) | — (M14 reads only) |
| E01–E24 (M14 analytics artefacts) | M14 | Auditors, all roles (scoped) | M14 |
| `establishment_position` (E21) | M14 (hosted) | HR/Dept Head/Exec/Auditor | Establishment Officer (M14) |
| `documents` | M13 | M14 (export/model-card refs) | M14 (creates refs only) |
| `notifications`, `audit_log` | Platform | M14 | M14 (appends) |
| `service_register_events` | M12 | M14 (verification-status reporting) | — (M14 never writes SR) |
| `workflow_instances/tasks` | Platform | M14 (maker-checker for KPI/dashboard/RLS/embed/model publication) | M14 (raises instances) |

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
| **rls_scope_policy.status** | **DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, SUPERSEDED** |
| report_schedule.format | PDF, XLSX, CSV |
| report_schedule.scope_mode | OWNER_SCOPE, PER_RECIPIENT_SCOPE |
| report_schedule.delivery_channel | EMAIL, IN_APP, BOTH, SFTP |
| report_schedule.status | ACTIVE, PAUSED, DISABLED |
| report_execution.run_type | ON_DEMAND, SCHEDULED, PREVIEW |
| report_execution.status | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED, **REDACTED** |
| alert_rule.operator | GT, GTE, LT, LTE, EQ, NEQ, DELTA_PCT |
| alert.severity | INFO, WARNING, CRITICAL |
| alert_event.status | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| prediction.model_type | RULE_BASED, STATISTICAL, ML |
| **prediction.determinism** | **DETERMINISTIC, PROBABILISTIC** |
| **prediction.fairness_status** | **NOT_ASSESSED, PASSED, FAILED, WAIVED_WITH_REASON** |
| prediction.risk_band | LOW, MEDIUM, HIGH, **NO_PREDICTION** |
| access_log.action | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY, **VIEW_INDIVIDUAL_PREDICTION** |
| **access_log.log_fidelity** | **FULL, SAMPLED** |
| view.visibility / report.visibility | PRIVATE, SHARED_SCOPE, PUBLISHED |
| **kpi_target_history.target_kind / .status** | **KPI_TARGET, ALERT_THRESHOLD / ACTIVE, SUPERSEDED** |
| **embed_token.status** | **PENDING_APPROVAL, ACTIVE, EXPIRED, REVOKED, ROTATED** |
| **source_data_contract.cdc_mechanism / .status** | **DEBEZIUM_CDC, BATCH, ON_DEMAND / DRAFT, ACTIVE, DEPRECATED, BREACHED** |
| **nl_query_log.outcome** | **ANSWERED, CLARIFICATION_REQUESTED, REFUSED_LOW_CONFIDENCE, REFUSED_OUT_OF_SCOPE, REFUSED_UNMODELLED** |
| **establishment_position.status** | **SANCTIONED, FROZEN, ABOLISHED** |
| **data_subject_change.change_type / .status** | **RECTIFICATION, ERASURE, RESTRICTION / RECEIVED, PROPAGATING, COMPLETED, BLOCKED_RETENTION, FAILED** |
| **access_anomaly.anomaly_type / .status** | **OFF_HOURS_BULK_EXPORT, SCOPE_EDGE_PROBING, UNUSUAL_DRILLTHROUGH_VOLUME, REPEATED_DENIED, MASS_NL_QUERY / OPEN, INVESTIGATING, DISMISSED, CONFIRMED** |
| **suppression_policy.applies_to** | **TILE, CHART, DRILLTHROUGH, EXPORT, ALL** |

### 5.6 Data Integrity Rules

1. **Governed metrics only:** every measure-bearing `dashboard_widget` must reference an `ACTIVE kpi_definition` or a `saved_report`; inline ad-hoc formulae are rejected at publish.
2. **Single active KPI version:** at most one `ACTIVE` `kpi_definition` per `kpi_code`; activating a new version RETIRES the prior.
3. **RLS is mandatory:** no analytics query executes without an applied `rls_scope_policy`; unresolved scope returns 403 `RLS_SCOPE_UNRESOLVED`, never an unfiltered result.
4. **Read-only source:** M14 holds **no foreign key write** into M01–M13 tables; marts are derived; drill-through is read-only navigation.
5. **Freshness honesty:** every `kpi_snapshot`, `report_execution`, and rendered widget carries a `data_as_of`; STALE/DEGRADED/FAILED marts flag results `is_partial=true` with a staleness badge.
6. **Snapshot reproducibility (bitemporal — v2):** `kpi_snapshot` is keyed by `(kpi_id, kpi_version, scope, period_key, knowledge_time)`. Recomputation on the same mart watermark and the same definition yields the same value. A restatement adds a new `knowledge_time` row and marks the prior `is_superseded=true`; it never mutates a past row. An "as-of-knowledge" read returns the row whose `knowledge_time` is the latest ≤ the requested instant (FR-23).
7. **Export lineage:** every `report_execution` with `status=COMPLETED` has a `document_id` (M13) and a matching `analytics_access_log` EXPORT row with `row_count`.
8. **Sensitivity gating:** a `RESTRICTED` field cannot be rendered/exported to a role masked by `field_mask_json`; masked fields are excluded (export header notes masking).
9. **Recipient validity:** `report_schedule`/`alert_rule` recipients are validated against current RBAC + scope at run time; out-of-scope recipients are dropped and logged.
10. **SoD on publication (extended — v2):** maker ≠ checker for: `kpi_definition` activation; `dashboard` publication of COMPLIANCE/EXECUTIVE; **`rls_scope_policy` create/update; `embed_token` issuance; `prediction_model` activation.** Each routes through `workflow_instances`.
11. **Watermark-relative reconciliation (redefined — v2):** for reconcilable KPIs, the mart value at watermark W is compared to the source *as of the same watermark W*, not to live "now". Variance beyond the per-KPI `reconciliation_tolerance`, **sustained beyond `reconcile_grace_minutes`**, flags the mart DEGRADED and alerts. Transient CDC lag does not flag DEGRADED.
12. **Append-only with bitemporal restatement (reconciled — v2):** `analytics_access_log`, `datamart_refresh_log`, and `kpi_snapshot` are append-only. Historical correctness is preserved by **adding knowledge-versions** (rule 6), not by mutating or deleting prior rows — resolving the v1 append-only-vs-backfill contradiction.
13. **Prediction labelling & governance (extended — v2):** every `prediction_result` in UI/exports is labelled advisory with `model_id`, `version`, `confidence`, `data_as_of`; **probabilistic models must have `fairness_status=PASSED` (or `WAIVED_WITH_REASON`) and a published model card before activation; individual scores are friction-gated; predictions are never written back to source modules and must not be the sole/primary basis for any administrative action.**
14. **Bounded outputs:** all list/report endpoints paginated (max page 100); reports respect `row_limit`; over-cap exports chunk or reject with `EXPORT_ROW_LIMIT_EXCEEDED`.
15. **Metric-level privacy (new — v2):** every aggregate read (tile/chart/export/drill) applies the active `suppression_policy`: any cell whose `cell_size`/denominator `< k` is suppressed or banded, **and its complements across overlapping scopes/periods are suppressed** so a hidden cell cannot be recovered by subtraction. Suppressed aggregate access returns/annotates `SMALL_CELL_SUPPRESSED` / `COMPLEMENTARY_SUPPRESSION_APPLIED`.
16. **DPDP rectifiability (new — v2):** a `data_subject_change` for an employee propagates to all derived copies — marts, `kpi_snapshot` (restated bitemporally or redacted), `prediction_result` (purged), `report_execution` artefacts (marked `REDACTED` in M13) — and reconciles against statutory retention; where retention legally overrides erasure, `status=BLOCKED_RETENTION` with a recorded `legal_basis`.
17. **Effective-dated targets (new — v2):** target-vs-actual and RAG use the `kpi_target_history` value whose `[effective_from, effective_to)` covers the period being shown, never today's value for a past period.
18. **Embed-token transport (new — v2):** an embed credential is never accepted in a URL path/query; it is presented in a header or exchanged from a short-lived code; tokens are revocable, rotatable, and re-validated per render; CSP `frame-ancestors` is enforced from `allowed_frame_ancestors`.

### 5.7 Sample Data (2-3 rows per key entity)

**dashboard**

| dashboard_code | name | target_role | category | status |
|---|---|---|---|---|
| EXEC_WORKFORCE | Executive Workforce Overview | EXECUTIVE | EXECUTIVE | PUBLISHED |
| MGR_TEAM | My Team Dashboard | MANAGER | OPERATIONAL | PUBLISHED |
| COMP_RESERVATION | Reservation Roster Compliance | DEPT_HEAD | COMPLIANCE | PUBLISHED |

**dashboard_widget** (for EXEC_WORKFORCE)

| title | widget_type | kpi_code (bound) | dimensions | refresh_hint | show_plain_definition |
|---|---|---|---|---|---|
| Active Headcount | KPI_TILE | HEADCOUNT_ACTIVE | org_unit | MART | true |
| Attrition Trend (12M) | LINE | ATTRITION_RATE | period | MART | true |
| Vacancy: Sanctioned vs Filled | BAR | VACANCY_PCT | cadre | MART | true |
| Retirement Profile (5Y) | HEATMAP | RETIREMENT_DUE_COUNT | age_band, cadre | CACHED | true |

**kpi_definition**

| kpi_code | name | domain | version | definition_hash | unit | grain | direction | sensitivity | status |
|---|---|---|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | Active Headcount | WORKFORCE | 3 | `a1f9…` | COUNT | ORG_UNIT | ON_TARGET | INTERNAL | ACTIVE |
| ATTRITION_RATE | Attrition Rate (rolling 12M) | WORKFORCE | 2 | `c7b2…` | PERCENT | ORG_UNIT | LOWER_BETTER | INTERNAL | ACTIVE |
| VACANCY_PCT | Vacancy % (sanctioned vs filled) | WORKFORCE | 1 | `e3d4…` | PERCENT | CADRE | LOWER_BETTER | INTERNAL | ACTIVE |

**kpi_snapshot** (bitemporal, version-stamped)

| kpi_code | kpi_version | scope_type | scope_id | period_key | valid_time | knowledge_time | value | is_superseded | cell_size | is_partial |
|---|---|---|---|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | 3 | ORG_UNIT | OU-DIST-12 | 2026-06 | 2026-06-30 | 2026-07-01T02:00Z | 1842 | false | 1842 | false |
| ATTRITION_RATE | 2 | ENTERPRISE | — | 2026-06 | 2026-06-30 | 2026-07-01T02:00Z | 4.7 | false | 98230 | false |
| HEADCOUNT_ACTIVE | 3 | ORG_UNIT | OU-DIST-12 | 2026-05 | 2026-05-31 | 2026-09-10T02:00Z | 1839 | false | 1839 | false |

*(The third row is a September restatement of May after a backdated correction; the original May row is retained with `is_superseded=true` and `superseded_by` pointing here.)*

**kpi_target_history**

| kpi_code | scope_type | scope_id | target_value | target_kind | effective_from | effective_to | status |
|---|---|---|---|---|---|---|---|
| ATTRITION_RATE | ENTERPRISE | — | 6.0 | KPI_TARGET | 2025-04-01 | 2026-03-31 | SUPERSEDED |
| ATTRITION_RATE | ENTERPRISE | — | 5.0 | KPI_TARGET | 2026-04-01 | (open) | ACTIVE |

**analytics_datamart**

| mart_code | mart_type | grain | source_modules | contract | refresh_strategy | freshness_sla_minutes | health_status |
|---|---|---|---|---|---|---|---|
| MART_HEADCOUNT | AGGREGATE | employee×org_unit×period | {M01} | m01.v_emp_v4 | INCREMENTAL | 60 | HEALTHY |
| MART_PAYROLL_COST | AGGREGATE | org_unit×component×period | {M10} | m10.v_payroll_locked_v3 | INCREMENTAL | 1440 | STALE |
| MART_ESTABLISHMENT | DIMENSION | position×org_unit | {M14-EST} | est.v_position_v1 | ON_DEMAND | 1440 | HEALTHY |

**rls_scope_policy**

| role | scope_type | filter_expression | version | status | created_by | approved_by |
|---|---|---|---|---|---|---|
| MANAGER | REPORTING_LINE | `employee_id IN :reporting_subtree` | 2 | ACTIVE | u-sys1 | u-aadmin |
| HR_OFFICER | DELEGATED_UNITS | `org_unit_id IN :delegated_units` | 1 | ACTIVE | u-sys1 | u-aadmin |
| EXECUTIVE | ENTERPRISE | `TRUE` | 3 | PENDING_APPROVAL | u-sys1 | (awaiting) |

**embed_token**

| token_id | widget_ids | subject_role | allowed_frame_ancestors | expires_at | status |
|---|---|---|---|---|---|
| tok-91a | {w-headcount} | DEPT_HEAD | {portal.gov.local} | 2026-07-01T12:00Z | ACTIVE |
| tok-5fe | {w-vacancy} | EXECUTIVE | {exec.gov.local} | 2026-06-30T09:00Z | REVOKED |

**establishment_position**

| position_code | org_unit_id | cadre | sanctioned_strength | reservation_category | roster_point | status |
|---|---|---|---|---|---|---|
| POS-DIST12-GA-01 | OU-DIST-12 | GROUP_A | 120 | UR | 1 | SANCTIONED |
| POS-DIST12-GA-07 | OU-DIST-12 | GROUP_A | 1 | SC | 7 | SANCTIONED |

**prediction_model**

| model_code | determinism | version | protected_features_excluded | fairness_status | status |
|---|---|---|---|---|---|
| RETIREMENT_FORECAST | DETERMINISTIC | v1 | {} | NOT_ASSESSED | ACTIVE |
| ATTRITION_RISK | PROBABILISTIC | v2 | {reservation_category, gender, disability, maternity_leave_proxy} | PASSED | ACTIVE |

**prediction_result**

| model_code | subject_type | subject_id | score | risk_band | confidence | is_individual_gated |
|---|---|---|---|---|---|---|
| ATTRITION_RISK | EMPLOYEE | e-1001 | 0.7820 | HIGH | 0.74 | true |
| RETIREMENT_FORECAST | ORG_UNIT | OU-DIST-12 | 0.1500 | LOW | 0.90 | false |

**data_subject_change**

| employee_id | change_type | status | affected_snapshots | legal_basis |
|---|---|---|---|---|
| e-2044 | RECTIFICATION | COMPLETED | 36 | — |
| e-3091 | ERASURE | BLOCKED_RETENTION | 0 | Pension statutory retention 7y |

**access_anomaly**

| user_id | anomaly_type | severity | status |
|---|---|---|---|
| u-hr-22 | OFF_HOURS_BULK_EXPORT | WARNING | OPEN |
| u-mgr-08 | SCOPE_EDGE_PROBING | CRITICAL | INVESTIGATING |

**suppression_policy**

| name | applies_to | min_cell_size_k | complementary | band_instead_of_hide |
|---|---|---|---|---|
| Default Demographics | ALL | 5 | true | true |
| Compliance Roster | TILE | 3 | true | false |

---

## 6. Functional Requirements

> FR-01…FR-16 are carried forward from v1 with v2 amendments integrated (marked **v2**). FR-17…FR-23 are new. Each FR retains ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a full Low-Level Design table.

### FR-M14-01 — Role-Based Dashboard Framework & Layout Engine

- **Module:** M14-F01
- **Primary Role(s):** Analytics Administrator (build/publish), All roles (consume, scoped)
- **User Story:** As an Analytics Administrator, I want to compose role-targeted dashboards from a widget catalog and publish them, so that each persona lands on a relevant, governed, permission-scoped home view.
- **Description:** A dashboard authoring and rendering engine. A `dashboard` is a responsive grid of `dashboard_widget`s, each bound to a governed KPI or saved report. Dashboards are role-targeted and category-tagged; users personalise via `saved_view` without altering the published template. Publication of COMPLIANCE/EXECUTIVE dashboards is maker-checker. Rendering always applies RLS (FR-04), **metric-level suppression (FR-17)**, and freshness in **role-adaptive language (FR-12)**. **v2:** every consumer KPI tile renders the plain-language `description`/`plain_language_note`.
- **Acceptance Criteria:**
  - AC1: An admin can create a dashboard, add widgets from the catalog, arrange them on a responsive grid, and save as DRAFT.
  - AC2: Publishing a COMPLIANCE/EXECUTIVE dashboard requires a checker (`published_by ≠ created_by`); other categories may self-publish within authority.
  - AC3: A consuming user sees only widgets they are permitted to view; unauthorised widgets are omitted (not shown empty).
  - AC4: A user can save a personal `saved_view` and set it default without modifying the template.
  - AC5: Each rendered dashboard shows a global `data_as_of` and per-widget freshness state in language matched to the viewer's role.
  - AC6: Every dashboard view writes an `analytics_access_log` (VIEW_DASHBOARD) entry **asynchronously** (§8.1).
  - **AC7 (v2):** Every consumer KPI tile displays the governed plain-language definition (what counts / what doesn't) inline or on a one-tap info affordance.
- **Business Rules:**
  - BR1: A measure-bound widget must reference an ACTIVE `kpi_definition` or `saved_report`; orphaned bindings block publication.
  - BR2: A dashboard cannot be published if any bound KPI is RETIRED/DRAFT.
  - BR3: Personalisation is per-user; a user cannot change another user's default view.
  - BR4: Archiving a dashboard preserves its `saved_view`s read-only for audit.
  - **BR5 (v2):** Consumer dashboards default to the trimmed widget palette (no MAP/FUNNEL); the authoring catalog retains them (§14).
- **Data Model References:**

| Entity | Use |
|---|---|
| `dashboard`, `dashboard_widget` | compose/render |
| `kpi_definition`, `saved_report` | widget bindings |
| `saved_view` | personalisation |
| `suppression_policy` | metric-level privacy on render |
| `analytics_access_log`, `audit_log` | view + config audit (async) |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/dashboards` | create dashboard |
| POST | `/api/v1/analytics/dashboards/{id}/widgets` | add widget |
| POST | `/api/v1/analytics/dashboards/{id}:publish` | publish (checker) |
| GET | `/api/v1/analytics/dashboards/{id}/render` | render scoped, suppressed data |
| POST | `/api/v1/analytics/saved-views` | save personal view |

- **UI Behavior Notes:** Drag-and-drop grid editor with widget palette; live preview against own scope; responsive breakpoints; per-widget freshness badge in role-adaptive copy; plain-language KPI note on tiles; "Save as my view"/"Set default". Publish disabled for makers on gated categories.
- **Edge Cases:** Bound KPI retired after publish (widget shows "metric retired" placeholder + alerts steward); user with no scope sees explanatory empty state; suppressed tile shows "below privacy threshold"; very wide dashboards lazy-load below the fold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DashboardController`, `WidgetCatalogService`, `DashboardRenderer`, `SavedViewService`, `LayoutValidator`, `SuppressionDecorator` |
| Backend Flow | Validate layout/bindings → persist DRAFT → on publish run SoD + binding-active checks in a transaction → on render resolve RLS scope, fan-out widget queries to marts, apply suppression, attach freshness, assemble payload; enqueue async access-log |
| Data Operations | INSERT/UPDATE dashboard/widget; INSERT saved_view; SELECT from marts (RLS-filtered, suppressed); async INSERT access_log |
| Validation | Binding existence/active; layout schema; category publish authority; unique dashboard_code |
| Authorization | Analytics Admin author; checker publish; consumer scoped render |
| State Changes & Side Effects | dashboard.status DRAFT→PUBLISHED→ARCHIVED; async access_log + audit_log; widget cache warm |
| Failure Handling | Orphan binding → 409 `WIDGET_BINDING_INVALID`; maker publish gated → 403 `PUBLISH_REQUIRES_CHECKER`; mart down → widget degraded per FR-12; small group → `SMALL_CELL_SUPPRESSED` |
| Dependencies | FR-02 (KPI), FR-04 (RLS), FR-12 (freshness), FR-17 (suppression) |
| Test Guidance | Publish SoD; scope-omits-widget; saved-view isolation; freshness badge; plain-language render; suppressed tile |

---

### FR-M14-02 — KPI Definition & Calculation Engine (Versioned, Effective-Dated Targets)

- **Module:** M14-F02
- **Primary Role(s):** Analytics Administrator (define), Analytics Administrator/steward (approve)
- **User Story:** As an Analytics Administrator, I want to define KPIs once — formula, grain, allowed dimensions, sensitivity, with versioning, effective-dated targets, and approval — so that every dashboard and report computes the same number the same way and never splices definition versions in a trend.
- **Description:** Maintains the `kpi_definition` registry and a deterministic calculation engine. A KPI declares `source_mart_id`, a safe aggregation `expression`, unit, grain, allowed dimensions, sensitivity, reconciliation target/tolerance, and a `definition_hash`. Targets are **effective-dated in `kpi_target_history` (E17)**. The engine computes values on demand and materialises **bitemporal, version-stamped** `kpi_snapshot` rows (FR-23). Definitions are versioned; activation retires the prior. Publication is maker-checker. **v2:** every snapshot stores `kpi_version` + `definition_hash`; a trend crossing a definition change renders a version-change marker and blocks silent cross-version aggregation.
- **Acceptance Criteria:**
  - AC1: A KPI can be created with expression, grain, unit, allowed dimensions, sensitivity, reconciliation target/tolerance in DRAFT.
  - AC2: An expression referencing an unknown mart column or disallowed function is rejected with precise location.
  - AC3: Activating a new version sets the prior ACTIVE to RETIRED; no two ACTIVE versions share a `kpi_code`.
  - AC4: Computing a KPI writes a reproducible bitemporal `kpi_snapshot` with `kpi_version`, `definition_hash`, `valid_time`, `knowledge_time`, `data_as_of`, `is_partial`.
  - AC5: A KPI cannot slice by a dimension not in `dimensions_allowed`.
  - AC6: Activation requires `approved_by ≠ created_by`.
  - **AC7 (v2):** A trend that spans rows of differing `kpi_version` renders a discontinuity marker; an aggregation across versions returns `CROSS_VERSION_AGGREGATION_BLOCKED` unless the user acknowledges.
  - **AC8 (v2):** Target-vs-actual uses the `kpi_target_history` value in force for the period shown, not today's value.
- **Business Rules:**
  - BR1: A KPI referenced by any published widget/report cannot be deleted; only RETIRED.
  - BR2: RESTRICTED KPIs inherit field masking; they cannot be embedded in PUBLIC dashboards.
  - BR3: Reconcilable KPIs declare a reconciliation target/object; **variance is evaluated watermark-relative (FR-03)**.
  - BR4: Snapshots are computed only on marts with `health_status ∈ {HEALTHY,STALE}`; FAILED marts yield no snapshot.
  - **BR5 (v2):** Every snapshot carries the producing `kpi_version` and `definition_hash`; the pair is immutable on the row.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_definition` | registry + versions + hash |
| `kpi_target_history` | effective-dated targets/thresholds |
| `kpi_snapshot` | bitemporal, version-stamped series |
| `analytics_datamart` | source + freshness |
| `audit_log` | config audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/kpis` | create KPI version |
| POST | `/api/v1/analytics/kpis/{id}:activate` | activate (checker) |
| POST | `/api/v1/analytics/kpis/{id}/targets` | set effective-dated target |
| GET | `/api/v1/analytics/kpis/{code}/value?scope=&period=&asOfKnowledge=` | compute/resolve value |
| GET | `/api/v1/analytics/kpis/{code}/trend?from=&to=` | snapshot trend (with version markers) |

- **UI Behavior Notes:** KPI editor with expression linting, "test against mart sample" trace, dimension picker, effective-dated target timeline, sensitivity selector, version timeline; trend charts show version-change flags; Activate disabled for makers.
- **Edge Cases:** Division by zero in ratio KPI (returns null with reason, not error); dimension absent in mart row (grouped "Unknown"); retroactive mart backfill creates a **new knowledge-version snapshot** (never mutates — FR-23); cross-version trend aggregation requires acknowledgement.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `KpiController`, `AggregationParser`, `KpiCalcEngine`, `SnapshotMaterializer`, `KpiVersionService`, `TargetHistoryService` |
| Backend Flow | Parse expression to whitelisted AST → static-check columns/dimensions → persist DRAFT → on activate close prior version transactionally → on value request compile to RLS-wrapped SQL, compute, write bitemporal version-stamped snapshot |
| Data Operations | INSERT kpi/version; UPDATE prior version RETIRED; INSERT kpi_snapshot (append, knowledge-versioned); INSERT kpi_target_history |
| Validation | Whitelist tokens; column/dimension existence; non-overlap of ACTIVE; SoD; target date-range non-overlap |
| Authorization | Analytics Admin define; checker activate; Auditor read |
| State Changes & Side Effects | kpi.status DRAFT→ACTIVE→RETIRED; snapshot rows; cache invalidation; watermark-relative reconciliation check |
| Failure Handling | Bad expression → 400 `KPI_EXPRESSION_INVALID`; overlap → 409 `KPI_VERSION_OVERLAP`; FAILED mart → 503 `MART_UNAVAILABLE`; cross-version agg → 409 `CROSS_VERSION_AGGREGATION_BLOCKED` |
| Dependencies | FR-03 (marts), FR-04 (RLS), FR-23 (bitemporal), FR-17 (suppression on cell_size) |
| Test Guidance | Parser whitelist; snapshot determinism; ACTIVE non-overlap; version stamping; effective-dated target selection; reconciliation tolerance |

---

### FR-M14-03 — Analytics Data Layer (Semantic Model, Data Marts & ETL Refresh)

- **Module:** M14-F03
- **Primary Role(s):** Data Engineer (operate), Analytics Administrator (model), System Administrator (config)
- **User Story:** As a Data Engineer, I want governed data marts refreshed on a schedule with watermarks, **watermark-relative reconciliation**, and health tracking, so that dashboards read fast, consistent, permission-scoped data without hammering OLTP.
- **Description:** Defines and operates the analytics layer: a `analytics_datamart` registry, each governed by a `source_data_contract` (FR-21) and fed by Debezium CDC/incremental/batch. The ETL refreshes marts on `refresh_cron`, logs to `datamart_refresh_log`, advances watermarks, recomputes affected `kpi_snapshot`s, and updates `health_status`. **v2:** reconciliation compares mart-at-watermark to source-as-of-the-same-watermark, with per-KPI tolerance and a sustained-variance grace window before DEGRADED.
- **Acceptance Criteria:**
  - AC1: A mart can be registered with grain, sources, **governing contract**, refresh strategy, cron, and freshness SLA.
  - AC2: A scheduled refresh runs incrementally from the last watermark and records rows read/written, duration, new watermark.
  - AC3: If `now − last_refreshed_at > freshness_sla_minutes`, the mart is STALE and dependent surfaces show staleness.
  - AC4: A failed refresh marks the mart FAILED, retains last good data, logs the error, raises an alert.
  - **AC5 (v2, redefined):** Reconciliation compares mart-at-watermark W to source-as-of-W; variance beyond the per-KPI tolerance **sustained beyond `reconcile_grace_minutes`** marks DEGRADED and alerts. Transient CDC lag does not flag DEGRADED.
  - AC6: A Data Engineer can trigger a manual/backfill refresh; it is logged with `run_type`; backfill creates new knowledge-version snapshots (FR-23).
- **Business Rules:**
  - BR1: Marts read source modules **read-only** through contracted views; M14 holds no write FK into M01–M13.
  - BR2: PII-bearing marts (`contains_pii=true`) are RESTRICTED and field-masked per RLS.
  - BR3: A FAILED mart cannot serve dashboards; consumers fall back to last good snapshot with a clear stale flag (FR-12).
  - BR4: Incremental refresh is idempotent; re-running with the same watermark produces no duplicates.
  - **BR5 (v2):** A mart whose `source_data_contract` is BREACHED is held from refresh and alerts (FR-21).
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` | registry/freshness |
| `source_data_contract` | governing schema promise |
| `datamart_refresh_log` | run history + reconcile variance |
| `kpi_snapshot` | recompute targets (bitemporal) |
| `audit_log` | config + manual-run audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/marts` | register mart |
| POST | `/api/v1/analytics/marts/{id}:refresh` | trigger refresh (manual/backfill) |
| GET | `/api/v1/analytics/marts/{id}/health` | freshness/health |
| GET | `/api/v1/analytics/marts/{id}/refresh-log` | run history (paginated) |

- **UI Behavior Notes:** Data Engineer console with health chips (HEALTHY/STALE/DEGRADED/FAILED), last refresh, watermark, next run, contract status; manual refresh/backfill; refresh-log timeline with error detail; **watermark-relative reconciliation variance panel** with grace-window state.
- **Edge Cases:** Source schema change breaks ETL (contract test fails in CI before prod; runtime → FAILED + last good); CDC stream gap (watermark stall → STALE); concurrent manual + scheduled refresh (second queued).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MartRegistryController`, `EtlOrchestrator`, `IncrementalLoader`, `MaterializedViewRefresher`, `FreshnessMonitor`, `WatermarkReconciliationChecker` |
| Backend Flow | On cron/manual → acquire mart lock → read from watermark via contracted view → upsert idempotently → advance watermark → recompute affected snapshots → run watermark-relative reconciliation with grace → update health → write refresh_log |
| Data Operations | UPSERT mart rows; INSERT refresh_log (with reconcile_variance); UPDATE mart watermark/health; recompute snapshots |
| Validation | Idempotency key on watermark; grain uniqueness; source read-only assertion; contract validity |
| Authorization | Data Engineer operate; Analytics Admin model; Sys Admin config; Auditor read status |
| State Changes & Side Effects | mart.health transitions; refresh_log append; snapshot recompute; alert on FAILED/sustained-DEGRADED |
| Failure Handling | ETL error → FAILED + 500 `MART_REFRESH_FAILED` + retain last good; lock contention → 409 `MART_REFRESH_IN_PROGRESS`; contract breach → `SOURCE_CONTRACT_VIOLATION` |
| Dependencies | FR-21 (contracts), FR-02 snapshots, FR-11 alerts, FR-23 bitemporal |
| Test Guidance | Idempotent load; SLA detection; **watermark-relative reconciliation (no false DEGRADED under CDC lag)**; grace window; last-good fallback |

---

### FR-M14-04 — Row-Level Security, Permission-Scoped Access & Maker-Checker Policy Governance

- **Module:** M14-F04
- **Primary Role(s):** System Administrator (maker), Analytics Administrator (checker), All roles (enforced)
- **User Story:** As a System Administrator, I want row-level security that mirrors RBAC and the org hierarchy, **with maker-checker on any policy change and a preview-as-role diff**, so that every query returns only entitled data and the single most dangerous mutation (opening scope to `TRUE`) cannot ship unchecked.
- **Description:** Defines `rls_scope_policy` rows mapping each role to a scope type and a parameterised filter, plus optional column masking. On each request the engine resolves the user's effective scope and injects the filter into every mart query; scope is re-derived per session. RLS is non-bypassable. **v2:** policy create/update is a maker-checker workflow — a maker drafts, the system computes a **preview-as-role data-exposure diff** (before/after row counts and sample), and a different checker approves before the version becomes ACTIVE; the change is immutably audited.
- **Acceptance Criteria:**
  - AC1: A manager's dashboard/report returns only direct+indirect reports.
  - AC2: An HR officer sees only delegated org units; out-of-scope rows are filtered out.
  - AC3: A RESTRICTED field is masked/excluded for roles without field access; export header notes masking.
  - AC4: A request with no applicable policy returns 403 `RLS_SCOPE_UNRESOLVED` and is logged.
  - AC5: Scope resolution reflects org-hierarchy changes within the configured TTL (default 15 min).
  - AC6: An automated scope-leak test proves no role returns a record outside its scope across all marts.
  - **AC7 (v2):** A policy create/update is saved as DRAFT→PENDING_APPROVAL; it cannot become ACTIVE without `approved_by ≠ created_by`; an attempt to self-approve returns 403 `RLS_POLICY_REQUIRES_CHECKER`.
  - **AC8 (v2):** The approval screen shows a preview-as-role diff (resolved filter, before/after row counts) captured into `preview_diff_json`; broadening to ENTERPRISE/`TRUE` is flagged prominently.
- **Business Rules:**
  - BR1: Effective dataset = intersection of capability grant (RBAC) and data scope (RLS); neither overrides the other; **suppression (FR-17) is applied after**.
  - BR2: ENTERPRISE scope is restricted to Executive/Auditor/Analytics Admin per policy.
  - BR3: Auditor has read-all scope but inherits field masking unless explicitly granted.
  - BR4: Embedded-BI and API queries (FR-15) carry the same RLS; tokens are scoped, not bypass keys.
  - **BR5 (v2):** Only one ACTIVE policy per (role, mart); activating a new version SUPERSEDES the prior; rollback re-activates a prior version through the same checker path.
- **Data Model References:**

| Entity | Use |
|---|---|
| `rls_scope_policy` | role→scope mapping + approval workflow |
| `org_units`, `employees` (M01 ref) | scope resolution |
| `roles`/`permissions` (ref) | capability grant |
| `workflow_instances` | maker-checker routing |
| `analytics_access_log` | scope snapshot per access |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/rls-policies` | create/update policy (DRAFT, maker) |
| POST | `/api/v1/analytics/rls-policies/{id}:preview-as-role` | compute exposure diff |
| POST | `/api/v1/analytics/rls-policies/{id}:approve` | approve (checker ≠ maker) |
| GET | `/api/v1/analytics/rls-policies/resolve` | resolve my effective scope (debug/self) |
| GET | `/api/v1/analytics/rls-policies` | list policies |

- **UI Behavior Notes:** Admin policy editor mapping roles to scope types; **mandatory "preview as role/user" diff** before submit; masking config per RESTRICTED field; checker approval queue with broadening warnings; immutable change history.
- **Edge Cases:** User with multiple roles (highest-priority scope wins by `priority`); manager with no reports (empty scope, explanatory state); delegated units changed mid-session (re-resolved at TTL); checker = maker attempt (blocked).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RlsPolicyController`, `ScopeResolver`, `QueryRewriter`, `FieldMaskService`, `PreviewAsRoleService`, `PolicyApprovalWorkflow` |
| Backend Flow | On request → load roles → resolve scope params → select highest-priority ACTIVE policy per mart → rewrite query with predicate + masks → execute → async snapshot scope to access_log. On policy change → DRAFT → compute exposure diff → route to checker → on approve activate version, supersede prior |
| Data Operations | SELECT policies; SELECT org subtree (TTL cached); INSERT policy version; no writes to source |
| Validation | Policy existence; parameter resolvability; mask config; SoD on approval |
| Authorization | Sys Admin maker; Analytics Admin/authorised checker; everyone enforced; Auditor read |
| State Changes & Side Effects | policy DRAFT→PENDING_APPROVAL→ACTIVE/REJECTED→SUPERSEDED; immutable audit; async access_log |
| Failure Handling | Unresolved scope → 403 `RLS_SCOPE_UNRESOLVED`; self-approval → 403 `RLS_POLICY_REQUIRES_CHECKER`; missing subtree → 503 `SCOPE_SOURCE_UNAVAILABLE` |
| Dependencies | M01 org hierarchy; workflow engine; FR-02/03/08/17 (all queries) |
| Test Guidance | Cross-role scope-leak matrix; multi-role priority; field masking on export; TTL re-resolution; **maker-checker enforcement + preview diff correctness** |

---

### FR-M14-05 — Workforce Analytics (Establishment-Pinned)

- **Module:** M14-F05
- **Primary Role(s):** HR Officer, Department Head, Executive
- **User Story:** As a Department Head, I want workforce analytics — headcount, demographics, diversity, attrition, **sanctioned-vs-filled vacancy pinned to the establishment reference**, cadre distribution, age/retirement profile, span of control — so that I can plan establishment, recruitment, and succession with accurate, scoped numbers.
- **Description:** Delivers the core workforce KPI suite over `MART_HEADCOUNT` and dimensions, with **vacancy = sanctioned strength (from `establishment_position`, FR-19) − filled**. All KPIs are governed (FR-02), scoped (FR-04), and suppressed (FR-17). Retirement profile is deterministic (FR-13).
- **Acceptance Criteria:**
  - AC1: Headcount tiles show active count by scope with drill-down org_unit→office→designation.
  - AC2: Attrition rate computes leavers/average headcount over the window, separating retirements/resignations/terminations, **excluding internal transfers**.
  - AC3: Vacancy view shows sanctioned (from establishment reference) vs filled vs vacant by cadre with vacancy %.
  - AC4: Retirement profile lists counts retiring within 1/3/5 years by cadre, drillable to permitted individuals.
  - AC5: Span-of-control highlights managers exceeding configurable thresholds.
  - AC6: Diversity composition shows reservation-category and gender mix vs roster targets; **small cells suppressed/banded (FR-17)**.
- **Business Rules:**
  - BR1: **Sanctioned strength comes from `establishment_position` (FR-19); filled = active employees mapped to sanctioned posts.** Missing establishment data raises `ESTABLISHMENT_REFERENCE_MISSING` (notice).
  - BR2: Retirement age/date uses canonical M01 DOB + cadre rules; M14 does not redefine retirement age.
  - BR3: Attrition excludes internal transfers (M05).
  - BR4: Demographic individual drill-through is RLS-gated, suppressed, and audited.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` (MART_HEADCOUNT, dimensions) | source |
| `establishment_position` (E21) | sanctioned-strength denominator |
| `kpi_definition`/`kpi_snapshot` | governed metrics/trends |
| `employees`,`org_units`,`cadres`,`designations` (ref) | grain/dimensions |
| `prediction_result` | succession/retirement risk overlay |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/workforce/headcount` | headcount by scope/dimension |
| GET | `/api/v1/analytics/workforce/attrition` | attrition metrics |
| GET | `/api/v1/analytics/workforce/vacancy` | sanctioned (establishment) vs filled |
| GET | `/api/v1/analytics/workforce/retirement-profile` | retirement horizon |
| GET | `/api/v1/analytics/workforce/span-of-control` | reports per manager |

- **UI Behavior Notes:** Workforce dashboard with KPI tiles, attrition trend, vacancy bar (sanctioned/filled/vacant), retirement heatmap, span-of-control table with threshold flags, diversity donut vs target; all drillable; freshness + suppression badges per tile.
- **Edge Cases:** Employee on long suspension (counted per policy flag); post with sanctioned strength but no occupant mapping (flagged data-quality); manager change mid-period (span as-of date); establishment reference absent for a unit (vacancy shows notice, not zero).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `WorkforceAnalyticsController`, `HeadcountService`, `AttritionService`, `VacancyService` (establishment-joined), `RetirementProfiler`, `SpanCalculator` |
| Backend Flow | Resolve RLS scope → query MART_HEADCOUNT + dimensions → join `establishment_position` for sanctioned strength → compute governed KPIs/snapshots → apply suppression → join prediction overlays → assemble with freshness |
| Data Operations | SELECT marts + establishment reference (RLS-filtered, suppressed); no writes |
| Validation | Dimension allowed; window validity; sanctioned-vs-filled integrity; establishment presence |
| Authorization | HR/Dept Head/Exec scoped; Employee excluded from aggregates |
| State Changes & Side Effects | snapshot writes; async access_log on drill-through |
| Failure Handling | Stale mart → partial; missing establishment → `ESTABLISHMENT_REFERENCE_MISSING` (200 notice); small cell → suppressed |
| Dependencies | FR-02, FR-03, FR-04, FR-10, FR-13, FR-17, FR-19 |
| Test Guidance | Attrition excludes transfers; **establishment-pinned vacancy math**; retirement boundaries; span thresholds; suppression on diversity |

---

### FR-M14-06 — Operational Analytics by Module

- **Module:** M14-F06
- **Primary Role(s):** HR Officer, Reporting Manager, Department Head
- **User Story:** As an HR Officer, I want per-module operational analytics — leave/absenteeism, attendance, payroll cost & overtime, training coverage, appraisal distribution, disciplinary aging, transfer/promotion pipeline, pension forecasting — so that I can monitor operations and act on outliers within my scope.
- **Description:** Domain dashboards reading domain marts (Leave/Attendance from M03/M04; Payroll from M10 **locked**; Training M07; Appraisal M08; Disciplinary M09; Transfer/Promotion M05/M06; Pension M11). Each is governed, scoped, suppressed.
- **Acceptance Criteria:**
  - AC1: Leave dashboard shows absenteeism rate and LWP days by office with trend, drillable to employee (scoped, suppressed).
  - AC2: Payroll cost analytics read only LOCKED snapshots; in-progress runs excluded.
  - AC3: Training dashboard shows mandatory-training completion % and skill-gap heatmap by competency×org_unit.
  - AC4: Appraisal dashboard shows rating distribution and flags calibration outliers; never exposes individual ratings to unauthorised roles.
  - AC5: Disciplinary dashboard shows case-aging buckets (0-30/31-90/90+) without exposing detail beyond permission.
  - AC6: Transfer/promotion pipeline shows funnel by stage with ageing and SLA.
- **Business Rules:**
  - BR1: Each operational KPI maps to a single owning-module mart; M14 aggregates published facts, never recomputes domain rules.
  - BR2: Sensitive domains (payroll, disciplinary, appraisal) are RESTRICTED; masking, suppression, and drill-gating apply.
  - BR3: Pension forecast figures sourced from M11; M14 visualises, does not compute terminal benefits.
  - BR4: Overtime analytics require attendance+payroll alignment; mismatched periods flagged, not silently merged.
- **Data Model References:**

| Entity | Use |
|---|---|
| Domain marts (LEAVE/ATTENDANCE/PAYROLL/TRAINING/APPRAISAL/DISCIPLINARY/TRANSFER/PROMOTION/PENSION) | sources |
| `kpi_definition`/`kpi_snapshot` | governed metrics |
| `suppression_policy` | small-cell privacy |
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

- **UI Behavior Notes:** Tabbed operational suite, one tab per domain; KPI tiles + primary chart + outlier table; RESTRICTED tabs visible only to authorised roles; freshness per domain mart; suppression badges.
- **Edge Cases:** Payroll mart stale (last locked period + stale badge); training competency added mid-period (skill-gap recomputed); disciplinary case sealed/confidential (excluded per M09 flag).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OperationalAnalyticsController`, domain services, `OutlierDetector`, `SuppressionDecorator` |
| Backend Flow | Resolve scope → select domain mart → compute governed KPIs → apply sensitivity masking + suppression → assemble tab payload with freshness |
| Data Operations | SELECT domain marts (RLS + locked-only for payroll, suppressed); no writes |
| Validation | Domain-period alignment; mart health; sensitivity gating |
| Authorization | Role+scope per domain; RESTRICTED gated |
| State Changes & Side Effects | snapshot writes; async access_log on RESTRICTED drill-through |
| Failure Handling | Mart stale → partial; locked snapshot missing → `PAYROLL_SNAPSHOT_UNAVAILABLE`; small cell → suppressed |
| Dependencies | M03–M11 marts; FR-02/03/04/10/17 |
| Test Guidance | Payroll locked-only; appraisal masking; case-aging buckets; pipeline funnel; suppression |

---

### FR-M14-07 — Compliance & Statutory Dashboards (Establishment-Pinned)

- **Module:** M14-F07
- **Primary Role(s):** HR Officer, Department Head, Executive, Auditor
- **User Story:** As a Department Head, I want compliance & statutory dashboards — reservation roster compliance (pinned to sanctioned strength/roster points), mandatory-training status, SR verification status, pending approvals & SLA breaches — so that I can demonstrate compliance and clear backlogs before they become audit findings.
- **Description:** Statutory-grade dashboards: **Reservation Roster Compliance** (sanctioned vs filled by category vs roster points from `establishment_position`, FR-19); **Mandatory Training**; **SR Verification Status** (read from M12); **Pending Approvals & SLA Breaches** (workflow tasks). Designed for audit export with as-of timestamps, methodology notes, and **bitemporal "as-of-knowledge" reproducibility (FR-23)**.
- **Acceptance Criteria:**
  - AC1: Reservation dashboard shows category-wise sanctioned/filled/backlog and a roster-point compliance indicator, pinned to the establishment reference.
  - AC2: Mandatory-training dashboard lists overdue employees by mandate with completion %.
  - AC3: SR verification dashboard shows verified/pending/overdue counts from M12 (read-only) with drill to permitted employee SR status.
  - AC4: SLA dashboard aggregates pending `workflow_tasks` across modules into aging buckets with breach flags.
  - AC5: Every compliance view exports to PDF/Excel with `data_as_of`, scope, methodology footnote, **and an as-of-knowledge stamp** (FR-09/FR-23).
  - AC6: Auditor can view all compliance dashboards, the access log, and the anomaly queue.
- **Business Rules:**
  - BR1: Reservation category rules/roster points use canonical reference + establishment data; M14 reports compliance, does not adjudicate.
  - BR2: SR verification status is read from M12; M14 never writes SR.
  - BR3: SLA thresholds per workflow type are configured centrally and effective-dated (E17); breaches are derived.
  - BR4: Compliance dashboards default to enterprise/department scope; employee role has no access.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` (compliance/SR/workflow marts) | sources |
| `establishment_position` | reservation denominator |
| `service_register_events` (M12 ref) | SR verification status |
| `workflow_tasks` (ref) | pending/SLA |
| `kpi_definition`/`kpi_snapshot` | compliance KPIs |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/compliance/reservation-roster` | roster compliance (establishment-pinned) |
| GET | `/api/v1/analytics/compliance/mandatory-training` | mandate status |
| GET | `/api/v1/analytics/compliance/sr-verification` | SR verification status |
| GET | `/api/v1/analytics/compliance/sla-breaches` | pending & SLA aging |

- **UI Behavior Notes:** Compliance suite with roster table (sanctioned/filled/backlog/compliance %), overdue training list, SR verification board, SLA breach heatmap by module×age bucket; prominent export-for-audit; methodology footnotes; as-of + as-of-knowledge stamps.
- **Edge Cases:** Reservation reference updated (recompute against new points, prior knowledge-version retained); SR mart lagging M12 (stale badge); workflow type without configured SLA (excluded with data-quality flag); establishment data missing (`ESTABLISHMENT_REFERENCE_MISSING`).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ComplianceController`, `ReservationRosterService` (establishment-joined), `MandatoryTrainingService`, `SrVerificationService`, `SlaBreachService` |
| Backend Flow | Resolve scope → query compliance/SR/workflow marts + establishment reference → compute compliance KPIs vs targets → assemble with as-of + as-of-knowledge + methodology |
| Data Operations | SELECT compliance/SR/workflow marts + establishment (RLS); no writes |
| Validation | Reference/establishment presence; SLA config presence; scope ≥ department |
| Authorization | HR/Dept Head/Exec/Auditor; Employee/Manager excluded |
| State Changes & Side Effects | snapshot writes; export → document + async access_log |
| Failure Handling | Missing reference → `RESERVATION_REFERENCE_MISSING`/`ESTABLISHMENT_REFERENCE_MISSING`; SR mart stale → partial |
| Dependencies | M12 (SR), workflow engine, FR-02/03/04/09/19/23 |
| Test Guidance | Roster compliance math; establishment pinning; SR read-only; SLA buckets; audit export completeness; as-of-knowledge reproduction |

---

### FR-M14-08 — Self-Service Report Builder (Ad-Hoc Query & Saved Reports)

- **Module:** M14-F08
- **Primary Role(s):** HR Officer, Department Head, Reporting Manager (team scope)
- **User Story:** As an HR Officer, I want to build ad-hoc reports from a governed semantic model and save them, so that I can answer new questions without IT tickets — within my data scope and the privacy threshold.
- **Description:** A no-code report designer over the semantic layer (FR-03). Users pick a base mart, select fields/measures, add filters, group/aggregate, sort, preview, and save as `saved_report`. All queries are RLS-scoped, suppression-applied, and bounded by `row_limit`. **v2:** a clear in-builder explanation of the aggregated-vs-detail RESTRICTED rule reduces `FIELD_NOT_PERMITTED` confusion (council D).
- **Acceptance Criteria:**
  - AC1: A user can select a mart, choose fields, add filters/grouping/aggregations, and preview the first page.
  - AC2: The builder only exposes fields/dimensions the user's role may see (masked fields hidden, with an inline explanation).
  - AC3: A report can be saved with visibility and reused; SHARED_SCOPE respects each viewer's RLS at run time.
  - AC4: A query exceeding `row_limit` is rejected or offered chunked export (FR-09).
  - AC5: Preview and saved reports always show `data_as_of`.
  - AC6: A non-aggregated report over a RESTRICTED mart requires elevated authority or is blocked, **with a plain-language reason**; aggregates over RESTRICTED marts are allowed but suppression-applied.
- **Business Rules:**
  - BR1: Report definitions reference the semantic model; raw SQL entry is not exposed.
  - BR2: SHARED_SCOPE/PUBLISHED visibility is applied at view-time as RLS intersection.
  - BR3: Aggregated reports over RESTRICTED marts are permitted (no row-level PII) but **subject to FR-17 suppression**; detail-level requires authority.
  - BR4: Saving/publishing is audited; PUBLISHED requires steward approval.
- **Data Model References:**

| Entity | Use |
|---|---|
| `saved_report` | definition |
| `analytics_datamart` (semantic) | base dataset |
| `rls_scope_policy` | scope/masking |
| `suppression_policy` | aggregate privacy |
| `report_execution` | preview/run instances |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/semantic/fields?mart=` | available fields (scoped) |
| POST | `/api/v1/analytics/reports:preview` | run preview (first page) |
| POST | `/api/v1/analytics/reports` | save report |
| GET | `/api/v1/analytics/reports/{id}/run?asOfKnowledge=` | run saved report (paginated, reproducible) |

- **UI Behavior Notes:** Three-pane builder (fields palette / canvas / live preview); field chips show sensitivity; **inline helper explaining aggregate-vs-detail RESTRICTED access**; aggregation pickers; Save/Schedule/Export; freshness + row-count + suppression indicators; masked-field tooltip.
- **Edge Cases:** Filter on a masked field (rejected with reason); grouping by high-cardinality dimension (warns + caps); preview against FAILED mart (blocked); shared report viewed by narrower scope (auto-filtered/suppressed, possibly empty).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReportBuilderController`, `SemanticFieldService`, `QueryCompiler`, `ReportService`, `PreviewRunner`, `SuppressionDecorator` |
| Backend Flow | Resolve scoped fields → validate selections → compile to RLS-wrapped SQL → run bounded, suppressed preview → on save persist → on run execute paginated with masking + suppression + optional as-of-knowledge |
| Data Operations | SELECT semantic metadata; SELECT marts (RLS, suppressed); INSERT saved_report/report_execution |
| Validation | Field permission; filter on permitted fields; row_limit; aggregation legality; min_cell_size |
| Authorization | HR/Dept Head/Manager scoped; PUBLISHED needs steward approval |
| State Changes & Side Effects | report saved; execution + async access_log on run/export |
| Failure Handling | Masked-field filter → 403 `FIELD_NOT_PERMITTED`; over limit → 400 `EXPORT_ROW_LIMIT_EXCEEDED`; FAILED mart → 503; small cell → `SMALL_CELL_SUPPRESSED` |
| Dependencies | FR-03 semantic, FR-04 RLS, FR-09 export, FR-17 suppression, FR-23 reproducibility |
| Test Guidance | Field-permission filtering; shared-report RLS intersection; row-limit; suppression on aggregates; reproducible run |

---

### FR-M14-09 — Scheduled Report Distribution & Multi-Format Export

- **Module:** M14-F09
- **Primary Role(s):** HR Officer, Department Head, Analytics Administrator
- **User Story:** As an HR Officer, I want to schedule saved reports for automatic generation and delivery in PDF/Excel/CSV — optionally bursted per org unit — so that stakeholders receive timely, scope-correct reports without manual effort.
- **Description:** Attaches a `report_schedule` (cron, format, recipients, `scope_mode`, optional `burst_dimension`, channel) to a `saved_report`. The scheduler runs the report, generating a `report_execution` and an M13 artefact, then delivers via EMAIL/IN_APP/SFTP under owner- or per-recipient-scope, with suppression applied. On-demand export shares the pipeline.
- **Acceptance Criteria:**
  - AC1: A schedule can be created with cron, format, recipients, channel; recipients are RBAC-validated.
  - AC2: A scheduled run produces a `report_execution` (COMPLETED/FAILED) and, on success, a stored M13 artefact.
  - AC3: Bursting by `org_unit` produces one file per unit, each filtered + suppressed to that unit and delivered to that unit's recipients.
  - AC4: Per-recipient-scope mode generates each recipient's copy under their own RLS scope (no over-disclosure).
  - AC5: PDF/XLSX/CSV supported; PDF header/footer carry scope, as-of, as-of-knowledge, page numbers.
  - AC6: A failed run retries per policy, alerts the owner on final failure, and is logged.
- **Business Rules:**
  - BR1: An out-of-scope recipient is dropped (logged), never sent data beyond entitlement.
  - BR2: RESTRICTED reports cannot be scheduled to EMAIL unless encryption/secure-channel policy is satisfied; otherwise IN_APP only.
  - BR3: Exports retained per statutory retention; `report_execution` artefacts expire and purge on schedule; **DPDP erasure may set status REDACTED early (FR-20)**.
  - BR4: Schedule cron is stored UTC; displayed in owner timezone.
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

- **UI Behavior Notes:** Schedule dialog (cron builder, format, recipients with scope warning, scope-mode toggle, burst toggle, channel); executions list with status, row count, download link, expiry; on-demand export menu with progress; failure surfaced with retry.
- **Edge Cases:** Recipient leaves org before run (dropped); burst over 500 values (throttled batch); CSV with embedded delimiters (RFC-4180 quoting); huge PDF (paginated/streamed, size cap warns); erased subject mid-retention (artefact REDACTED).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ScheduleController`, `ReportScheduler`, `ExportRenderer` (PDF/XLSX/CSV), `BurstingEngine`, `DeliveryService` |
| Backend Flow | Cron fires → resolve recipients + scope mode → for each scope unit run report (suppressed) → render format → store in M13 → deliver → log execution + async access_log → notify |
| Data Operations | INSERT report_execution; create document ref; INSERT notifications; SELECT marts (RLS, suppressed) |
| Validation | Cron validity; recipient RBAC/scope; format support; restricted-channel policy |
| Authorization | Owner/HR/Dept Head create; per-recipient scope enforced |
| State Changes & Side Effects | schedule next_run advance; execution status; document creation; notification; async access_log EXPORT |
| Failure Handling | Render error → FAILED + retry + alert; out-of-scope recipient dropped+logged; restricted email blocked → `RESTRICTED_CHANNEL_BLOCKED` |
| Dependencies | FR-08 reports, FR-04 RLS, FR-17 suppression, FR-20 erasure, M13 docs, notifications |
| Test Guidance | Burst scope-correctness; per-recipient RLS; format fidelity; recipient validation; retry/alert; REDACTED handling |

---

### FR-M14-10 — Drill-Down & Permission-Gated Drill-Through to Source Records

- **Module:** M14-F10
- **Primary Role(s):** Manager, HR Officer, Department Head, Auditor
- **User Story:** As an HR Officer, I want to drill down through aggregate charts and then drill through to the underlying source record when permitted, so that I can investigate an outlier — without leaving an audit gap.
- **Description:** **Drill-down** expands an aggregate along a `drilldown_path` within the analytics layer. **Drill-through** opens the authoritative record in the owning module via a route template, only if the user has both analytics scope and the owning module's permission. Every drill-through is logged (async, full fidelity). Drill-through is read-only. **v2:** small-cell suppression is enforced here *and* on the tiles/charts above it (FR-17), so the leaf is never reachable when the aggregate itself would re-identify.
- **Acceptance Criteria:**
  - AC1: A user can expand a chart along the configured drill path level by level, each RLS-scoped and suppressed.
  - AC2: Drill-through is offered only when authorised in both M14 (scope) and the owning module (permission); otherwise hidden/disabled.
  - AC3: Drill-through opens the owning module's read-only record view, not an M14 copy.
  - AC4: Every drill-through writes a full-fidelity `analytics_access_log` (DRILLTHROUGH) row with record id and sensitivity.
  - AC5: A drill-through to a record outside scope returns 403 `DRILLTHROUGH_FORBIDDEN`.
  - AC6: Aggregates below the privacy threshold suppress drill-through (k-anonymity + complementary suppression).
- **Business Rules:**
  - BR1: M14 never renders an editable source form.
  - BR2: Permission check is a live cross-module authorization call, not a cached flag.
  - BR3: Suppression threshold (default k=5) is configurable via `suppression_policy`.
  - BR4: Auditor drill-through is read-only and fully logged.
- **Data Model References:**

| Entity | Use |
|---|---|
| `dashboard_widget` (drilldown_path, drillthrough_target) | navigation config |
| `suppression_policy` | k-anonymity |
| `analytics_access_log` | drill-through audit |
| Owning-module records (ref) | deep-link target |
| `rls_scope_policy` | scope check |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/widgets/{id}/drilldown?level=&path=` | next drill level |
| GET | `/api/v1/analytics/widgets/{id}/drillthrough?rowKey=` | resolve deep link + authz |
| GET | `/api/v1/analytics/access-log` | view drill/export audit (authorised) |

- **UI Behavior Notes:** Click-to-expand with breadcrumb; "Open source record" visible only when permitted; opens owning module read-only; suppressed cells show "below privacy threshold"; access indicated as logged.
- **Edge Cases:** Record soft-deleted after aggregation ("record no longer available"); cross-module permission revoked mid-session (action disabled on next check); deep link to module under maintenance (graceful 503 passthrough).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DrillController`, `DrilldownService`, `DrillthroughResolver`, `CrossModuleAuthzClient`, `SmallCellSuppressor` |
| Backend Flow | Drill-down → query next mart level (RLS, suppressed) → return; Drill-through → resolve route → live authz (M14 scope ∩ owning-module perm) → return deep link or 403 → async log |
| Data Operations | SELECT marts (RLS, suppressed); call owning-module authz; async INSERT access_log |
| Validation | Path validity; small-cell threshold; live permission |
| Authorization | M14 scope + owning-module permission (both) |
| State Changes & Side Effects | async access_log DRILLTHROUGH; no source mutation |
| Failure Handling | Out-of-scope → 403 `DRILLTHROUGH_FORBIDDEN`; suppressed → 403 `SMALL_CELL_SUPPRESSED`; source gone → 404 passthrough |
| Dependencies | FR-04 RLS; FR-17 suppression; owning modules M01–M13 authz |
| Test Guidance | Both-permission gate; k-anonymity + complementary suppression; read-only deep link; audit completeness |

---

### FR-M14-11 — Alerting, Thresholds & Effective-Dated KPI Targets

- **Module:** M14-F11
- **Primary Role(s):** HR Officer, Department Head, Analytics Administrator
- **User Story:** As a Department Head, I want thresholds and targets on KPIs with alerts when they breach, evaluated against the threshold in force for the period, so that I am notified of attrition spikes, SLA backlogs, or vacancy surges proactively.
- **Description:** Attaches `alert_rule`s to governed KPIs (operator, threshold via `kpi_target_history` or static, scope, severity, frequency, recipients, suppression window, hysteresis). On each evaluation the engine compares the scoped value to the **effective-dated** threshold; a breach creates an `alert_event`, sends `notifications`, and badges dashboards. **v2:** thresholds are effective-dated; flapping is damped by `hysteresis_pct`.
- **Acceptance Criteria:**
  - AC1: A rule can be created on an ACTIVE KPI with operator, threshold, scope, severity, frequency, recipients.
  - AC2: When a scoped KPI value breaches the threshold in force for the period, an `alert_event` is created and recipients notified.
  - AC3: Repeat breaches within `suppression_window_min` (and within `hysteresis_pct`) do not generate duplicates.
  - AC4: A recipient can acknowledge an alert; status OPEN→ACKNOWLEDGED→RESOLVED.
  - AC5: Recipients are RBAC/scope validated; out-of-scope dropped.
  - AC6: Dashboards show active alert badges on affected KPI tiles.
- **Business Rules:**
  - BR1: Alerts evaluate against the same governed snapshot/value as dashboards; no separate calculation.
  - BR2: An alert on a stale/partial mart is flagged `data_as_of`/partial in the event and notification.
  - BR3: DELTA_PCT compares to the prior comparable period.
  - BR4: CRITICAL alerts cannot be globally muted by a non-admin; only acknowledged.
  - **BR5 (v2):** The threshold used is the `kpi_target_history` value covering the evaluated period.
- **Data Model References:**

| Entity | Use |
|---|---|
| `alert_rule` | rule config |
| `alert_event` | triggered events |
| `kpi_target_history` | effective-dated thresholds |
| `kpi_definition`/`kpi_snapshot` | evaluation source |
| `notifications` | delivery |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/alert-rules` | create rule |
| GET | `/api/v1/analytics/alert-events` | list events (scoped) |
| POST | `/api/v1/analytics/alert-events/{id}:acknowledge` | acknowledge |
| POST | `/api/v1/analytics/alert-rules/{id}:pause` | pause/resume |

- **UI Behavior Notes:** Rule builder (KPI picker, operator, effective-dated threshold, scope, severity, recipients, suppression, hysteresis); alert inbox with severity chips, value vs threshold, as-of, acknowledge/resolve; KPI tiles show alert badges + target-vs-actual gauges (period-correct target).
- **Edge Cases:** KPI retired with active rules (auto-paused + steward notified); flapping near threshold (hysteresis + suppression); evaluation while mart FAILED (skipped, logged, no false alert); threshold changed mid-period (period-correct value applied).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AlertRuleController`, `AlertEvaluator`, `SuppressionEngine`, `AlertNotifier`, `TargetHistoryService` |
| Backend Flow | On schedule/refresh → for each active rule resolve scoped KPI value → fetch effective-dated threshold → compare with hysteresis → if breach and not suppressed → create event → validate recipients → notify → badge dashboards |
| Data Operations | SELECT kpi_snapshot + kpi_target_history; INSERT alert_event; INSERT notifications; UPDATE event status |
| Validation | KPI active; operator/threshold validity; recipient scope; suppression/hysteresis |
| Authorization | HR/Dept Head/Admin create scoped; recipients validated |
| State Changes & Side Effects | event lifecycle; notifications; dashboard badges |
| Failure Handling | Stale mart → flagged partial; FAILED mart → skipped; bad recipient → dropped+logged |
| Dependencies | FR-02 KPI, FR-03 refresh hooks, E17 targets, notifications |
| Test Guidance | Breach detection; effective-dated threshold; suppression/hysteresis/no-dup; recipient scope; retired-KPI auto-pause |

---

### FR-M14-12 — Data Freshness, Role-Adaptive Language & Reconciliation Explainer

- **Module:** M14-F12
- **Primary Role(s):** All roles (consume), Data Engineer (operate)
- **User Story:** As any dashboard user, I want every number to tell me how fresh it is — in words I understand — and to explain why it might differ from the source system, so that I never decide on silently outdated or seemingly contradictory figures.
- **Description:** A cross-cutting capability: every surface carries `data_as_of` and a freshness state derived from mart `health_status` + SLA. **v2 (role-adaptive):** leaders/employees see plain language ("Numbers are a day behind — payroll still updating"); operators/auditors see technical states (STALE/DEGRADED/watermark). **v2 (reconciliation explainer):** a "why does this differ from the source?" panel shows `data_as_of`, the watermark, and any in-flight correction/knowledge-version — directly answering the §1.2 "headcount disagrees with payroll" pain.
- **Acceptance Criteria:**
  - AC1: Every widget/tile shows a `data_as_of` timestamp in the user's timezone.
  - AC2: A mart past its freshness SLA renders dependent surfaces with a STALE indicator and tooltip.
  - AC3: A DEGRADED/FAILED mart shows last good data with a prominent warning; new computations flagged `is_partial`.
  - AC4: Exports and scheduled reports embed freshness state and as-of in header/footer.
  - AC5: Alerts evaluated on stale data carry the staleness flag.
  - AC6: A global "data health" panel summarises mart freshness for operators.
  - **AC7 (v2):** Freshness copy renders in plain language for EMPLOYEE/MANAGER/DEPT_HEAD/EXECUTIVE and technical language for ANALYTICS_ADMIN/DATA_ENGINEER/AUDITOR.
  - **AC8 (v2):** A reconciliation explainer panel is available on every reconcilable KPI tile, showing as-of, watermark, last reconciliation variance, and any pending correction.
- **Business Rules:**
  - BR1: Freshness state is derived from mart health + SLA; not hand-set per widget.
  - BR2: No surface may display a value without an associated `data_as_of`.
  - BR3: FAILED-mart surfaces differentiate via colour + icon + text (WCAG, non-colour cue).
  - BR4: Degraded-mode behaviour is consistent across UI, exports, and API (`dataFreshness` block).
  - **BR5 (v2):** The same underlying state maps to two copy registers (plain/technical) keyed off role; the technical value remains available to leaders on demand.
- **Data Model References:**

| Entity | Use |
|---|---|
| `analytics_datamart` | health/SLA source |
| `datamart_refresh_log` | watermark + reconcile variance for explainer |
| `kpi_snapshot` (is_partial, data_as_of, knowledge_time) | freshness on values |
| `report_execution` (data_as_of) | freshness on exports |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/data-health` | mart freshness summary |
| GET | `/api/v1/analytics/kpis/{code}/reconciliation-explainer?scope=&period=` | as-of/watermark/variance/correction |
| (cross-cutting) | all analytics GETs return `dataFreshness` block | as-of + state (+ role-adaptive label) |

- **UI Behavior Notes:** Freshness chip on every tile (green/amber/red + icon + label); **role-adaptive tooltip copy**; reconciliation explainer panel; global data-health panel for operators; export header/footer freshness line; degraded banner.
- **Edge Cases:** Mixed-freshness dashboard (per-widget badges + worst-case global); clock skew (server-authoritative timestamps); mart never refreshed (NO_DATA, not "fresh"); leader requests technical detail (expandable).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FreshnessService`, `DataHealthController`, `ReconciliationExplainerService`, response `FreshnessDecorator`, `RoleAdaptiveCopyResolver` |
| Backend Flow | On each response look up mart health/SLA → compute state → attach `dataFreshness` block + per-value `is_partial` + role-adaptive label; explainer joins refresh-log watermark + variance + pending corrections |
| Data Operations | SELECT mart health, refresh-log, snapshot watermarks; no writes |
| Validation | Presence of data_as_of on every value; state derivation; copy-register selection |
| Authorization | All roles see freshness; operators see global panel |
| State Changes & Side Effects | none (read-only decoration); influences alert flagging |
| Failure Handling | Health lookup failure → conservative DEGRADED (fail-safe to "not fresh") |
| Dependencies | FR-03 marts; consumed by FR-01/05/06/07/08/09/11/16 |
| Test Guidance | SLA-boundary state; degraded parity across UI/export/API; NO_DATA vs FRESH; WCAG non-colour cue; **role-adaptive copy; reconciliation explainer accuracy** |

---

### FR-M14-13 — Deterministic Retirement Forecasting (Phase 1, split from v1 FR-13)

- **Module:** M14-F13
- **Primary Role(s):** HR Officer, Department Head, Executive
- **User Story:** As an HR Officer, I want a deterministic retirement forecast — counts and named individuals retiring within configurable horizons — so that I can plan recruitment and succession ahead of retirement bulges, with near-zero model risk.
- **Description:** A **deterministic** forecaster computing retirement dates from canonical M01 DOB + cadre retirement rules. No probabilistic model, no fairness exposure — it ships in the foundation phase (council split, R6/Reviewer-3). Outputs counts by scope/horizon and, for permitted roles, drillable individual lists. Registered as a `prediction_model` with `determinism=DETERMINISTIC` for governance symmetry.
- **Acceptance Criteria:**
  - AC1: Retirement forecast lists subjects retiring within configurable horizons (1/3/5Y) by scope, deterministic from canonical rules.
  - AC2: Counts reconcile exactly to M01 DOB + cadre rules (zero tolerance).
  - AC3: Individual lists are RLS-scoped, suppressed below k, and audited.
  - AC4: The forecast carries `data_as_of` and is labelled "deterministic — based on date of birth and retirement rules".
  - AC5: A registered deterministic model requires methodology text but **no fairness assessment** (it uses no protected-correlated features).
  - AC6: Backdated DOB correction (FR-20) re-derives the forecast as a new knowledge-version (FR-23).
- **Business Rules:**
  - BR1: Retirement age/date uses canonical M01/cadre rules; M14 does not invent retirement logic.
  - BR2: Deterministic outputs are not friction-gated at the aggregate level; individual lists follow standard RLS + suppression.
  - BR3: Deterministic models are exempt from the FR-18 adverse-impact gate but must still publish methodology.
- **Data Model References:**

| Entity | Use |
|---|---|
| `prediction_model` (determinism=DETERMINISTIC) | registry/methodology |
| `prediction_result` | retirement counts/dates per subject |
| Marts (workforce) + `employees` DOB (ref) | inputs |
| `analytics_access_log` | individual drill audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/models` | register deterministic model |
| GET | `/api/v1/analytics/predictions/retirement` | retirement forecast (scoped) |

- **UI Behavior Notes:** Retirement timeline + heatmap (age band × cadre); horizon selector; drillable to permitted individuals; "deterministic" label; freshness badge.
- **Edge Cases:** Missing/invalid DOB (excluded, flagged data-quality); cadre rule change (recompute, new knowledge-version); employee already separated (excluded).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ModelRegistryController`, `RetirementForecaster`, `SuppressionDecorator` |
| Backend Flow | Register (methodology) → on run compute retirement_date = DOB + cadre rule → bucket by horizon/scope → suppress small cells → persist results with data_as_of |
| Data Operations | INSERT prediction_model/result; SELECT DOB + cadre rules; no source writes |
| Validation | Methodology present; DOB validity; horizon validity |
| Authorization | HR/Dept Head/Exec scoped; individual lists RLS+suppressed |
| State Changes & Side Effects | model DRAFT→ACTIVE→RETIRED; result rows; async access_log on drill |
| Failure Handling | Missing DOB → excluded + data-quality flag; feature mart missing → 503 |
| Dependencies | FR-03 marts, FR-04 RLS, FR-17 suppression, FR-23 bitemporal, M01 retirement rules |
| Test Guidance | Deterministic retirement math; horizon boundaries; suppression; knowledge-version on DOB correction |

---

### FR-M14-14 — Benchmarking & Comparative Analytics (Effective-Dated Targets)

- **Module:** M14-F14
- **Primary Role(s):** Department Head, Executive, HR Officer
- **User Story:** As an Executive, I want to compare KPIs across periods, peer org units, and against the target in force for each period, so that I can see who is improving, who lags, and where to intervene — on a like-for-like basis.
- **Description:** Comparative views over governed KPIs: **period-over-period**, **peer comparison** (normalised), and **target-vs-actual** against the **effective-dated** `kpi_target_history` value for the period. RLS-scoped; suppression-applied. **v2:** RAG status uses the period-correct target, fixing wrong historical target-vs-actual (R13).
- **Acceptance Criteria:**
  - AC1: A KPI can be compared across selectable periods with variance and % change.
  - AC2: Peer comparison ranks sibling org units on a normalised (rate/per-capita) basis within scope.
  - AC3: Target-vs-actual shows attainment % and RAG status based on `direction` and the **target in force for that period**.
  - AC4: Comparisons exclude units outside RLS scope and suppress small denominators.
  - AC5: Outliers (top/bottom N or beyond N std dev) are highlighted with the basis explained.
  - AC6: External benchmark series, when configured, are shown as a clearly-labelled external reference line.
- **Business Rules:**
  - BR1: Comparisons use governed KPI snapshots only.
  - BR2: Size-sensitive metrics are normalised before ranking.
  - BR3: A user cannot benchmark against a peer unit outside scope.
  - BR4: External benchmarks are reference-only and visually distinguished.
  - **BR5 (v2):** RAG and attainment use the effective-dated target for the shown period, never today's target for a past period.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_snapshot` | comparison series (version-stamped) |
| `kpi_target_history` | period-correct target |
| `kpi_definition` (direction) | RAG basis |
| `analytics_datamart` | denominators for normalisation |
| `rls_scope_policy` | peer scope |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/benchmark/period?kpi=&periods=` | period-over-period |
| GET | `/api/v1/analytics/benchmark/peers?kpi=&scope=` | peer ranking |
| GET | `/api/v1/analytics/benchmark/target?kpi=&scope=&period=` | target-vs-actual (effective-dated) |

- **UI Behavior Notes:** Comparison panel with period selector, normalised peer ranking, variance arrows, RAG gauges (period-correct target), outlier highlights, optional external reference line with legend; tooltips explain normalisation and which target applies.
- **Edge Cases:** Peer with zero denominator (excluded + note); newly created unit lacking history ("insufficient history"); target unset for period (target view hidden, not zero); version change in series (marker shown, FR-02).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenchmarkController`, `PeriodComparator`, `PeerRanker`, `TargetAttainmentService` (effective-dated), `NormalizationService` |
| Backend Flow | Resolve scope + peers → pull governed snapshots → normalise → fetch period-correct target → compute variance/rank/attainment/RAG → flag outliers → suppress → assemble |
| Data Operations | SELECT kpi_snapshot + kpi_target_history + denominators (RLS); no writes |
| Validation | Peer scope membership; denominator presence; target presence for period |
| Authorization | Dept Head/Exec/HR scoped |
| State Changes & Side Effects | none (read-only); async access_log on view |
| Failure Handling | Missing denominator → excluded + note; no target → target view hidden; no history → insufficient-history state |
| Dependencies | FR-02 snapshots, E17 targets, FR-04 RLS, FR-17 suppression |
| Test Guidance | Normalisation; peer-scope exclusion; **effective-dated RAG**; outlier basis |

---

### FR-M14-15 — Natural-Language Query (Confidence-Gated) & Hardened Embedded BI

- **Module:** M14-F15
- **Primary Role(s):** HR Officer, Department Head, Executive; Analytics Administrator (embed config)
- **User Story:** As an HR Officer, I want to ask questions in plain language and embed governed widgets in other portals, so that analytics are accessible and reusable — always within my permissions, never producing confidently-wrong numbers, and never leaking a credential.
- **Description:** **NL query**: maps a question to the governed semantic model, generates a parameterised RLS-scoped query, and returns a result plus the resolved interpretation. **v2:** enforces a confidence threshold — below it, it clarifies or refuses rather than answering; logs every interpretation to `nl_query_log`; uses a **named on-prem LLM** (default **Llama-3.x-class model self-hosted at CGG Data Centre** — no HR prompt/data leaves the data centre; DPDP-assessed). **Embedded BI**: **v2 hardened** — tokens are issued maker-checker, never travel in a URL path (header or short-lived code-exchange), carry CSP `frame-ancestors`, are revocable/rotatable, and re-validate scope per render.
- **Acceptance Criteria:**
  - AC1: An NL question resolves to a governed KPI/dimension/filter set and returns a scoped result with the interpretation shown.
  - AC2: An ambiguous question prompts clarification; an out-of-scope question is refused with explanation; **a below-threshold-confidence question is refused (`NLQ_CONFIDENCE_TOO_LOW`) not answered**.
  - AC3: NL never generates raw free-form SQL; it only parameterises the governed semantic model.
  - AC4: An embed token is scoped to specific widgets, a user/role, and an expiry; it enforces the same RLS; **issuance is maker-checker (≠ issuer)**.
  - AC5: Every NL query (with confidence + outcome) and embedded render writes audit (`nl_query_log` / async access_log).
  - AC6: NL results carry the same freshness, suppression, and sensitivity handling as native widgets.
  - **AC7 (v2):** The embed credential is never accepted from the URL; a revoked token returns 401 `EMBED_TOKEN_REVOKED`; CSP `frame-ancestors` restricts embedding origins.
- **Business Rules:**
  - BR1: NL is constrained to the semantic layer + governed KPIs; it cannot fabricate metrics.
  - BR2: Embed tokens are scoped, signed, expiring, **revocable, rotatable**; not API bypass keys.
  - BR3: NL interpretation is always shown; **interpretation + confidence are logged for misinterpretation audit**.
  - BR4: RESTRICTED metrics require the same authority via NL/embed as in-app.
  - **BR5 (v2):** The LLM provider and hosting location are named and on-prem; prompts/data do not leave the CGG Data Centre.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_definition`/`analytics_datamart` (semantic) | NL target space |
| `nl_query_log` | NL interpretation/confidence/outcome audit |
| `embed_token` | hardened embed credential |
| `dashboard_widget` | embeddable units |
| `rls_scope_policy` | scope on NL/embed |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/nlq` | natural-language query (confidence-gated) |
| POST | `/api/v1/analytics/embed-tokens` | issue scoped embed token (maker) |
| POST | `/api/v1/analytics/embed-tokens/{id}:approve` | approve (checker ≠ issuer) |
| POST | `/api/v1/analytics/embed-tokens/{id}:revoke` | revoke token |
| POST | `/api/v1/analytics/embed/session` | exchange short-lived code → render session (token in header, not URL) |

- **UI Behavior Notes:** NL search bar with examples; result card showing interpreted KPI/filters + value/chart + freshness + confidence; clarification chips; refusal copy for low confidence/out-of-scope; embed manager (select widgets, role/user, expiry, frame-ancestors, copy snippet that uses header/code-exchange, **not** a URL token); revocation/rotation controls; embedded widgets show "powered by HRMS Analytics" + freshness.
- **Edge Cases:** NL maps to multiple plausible KPIs (asks user to choose); unmodelled metric (`METRIC_NOT_AVAILABLE`, suggests nearest); confidence below threshold (refuse + log); embed token expired/revoked (auth-expired state, no stale data); embed used by out-of-scope user (RLS empties result).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `NlqController`, `SemanticMapper`, `IntentResolver` (confidence), `NlQueryLogger`, `EmbedTokenService` (maker-checker), `EmbedSessionExchanger`, `EmbedRenderer` |
| Backend Flow | NL → map intent to governed KPI/dimensions/filters with confidence → if < threshold clarify/refuse → else compile RLS-scoped parameterised query → execute (suppressed) → return result + interpretation; log. Embed → issue (maker) → approve (checker) → render via header/code-exchange → validate signature/scope/expiry/revocation per render |
| Data Operations | SELECT marts (RLS, suppressed); no free SQL; INSERT nl_query_log; async INSERT access_log; INSERT/UPDATE embed_token |
| Validation | Intent within semantic model; confidence threshold; token signature/scope/expiry/revocation; sensitivity authority; frame-ancestors |
| Authorization | Same RBAC+RLS as native; embed scoped to token; issuance maker-checker |
| State Changes & Side Effects | nl_query_log + async access_log; embed_token lifecycle; no source mutation |
| Failure Handling | Ambiguous → `NLQ_CLARIFICATION_REQUIRED` (200 options); low confidence → 422 `NLQ_CONFIDENCE_TOO_LOW`; unmodelled → 404 `METRIC_NOT_AVAILABLE`; bad/expired token → 401 `EMBED_TOKEN_INVALID`; revoked → 401 `EMBED_TOKEN_REVOKED` |
| Dependencies | FR-02 semantic/KPI, FR-04 RLS, FR-12 freshness, FR-17 suppression |
| Test Guidance | Intent→governed only; **confidence gating (refuse below threshold)**; provenance logging; token scope/expiry/revocation; **no token in URL**; CSP frame-ancestors; embed RLS parity |

---

### FR-M14-16 — Mobile Dashboards, Executive Briefing Pack & Offline RESTRICTED-Data Policy

- **Module:** M14-F16
- **Primary Role(s):** Executive, Department Head, Manager
- **User Story:** As an Executive, I want responsive mobile dashboards and a periodic briefing pack, so that I can monitor the workforce from my phone — without RESTRICTED PII ever resting unprotected on the device.
- **Description:** Mobile-optimised renderings of role dashboards plus a scheduled executive briefing pack (PDF/in-app digest) generated under the recipient's RLS. **v2 (offline policy):** the on-device cache is encrypted, **excludes RESTRICTED fields/PII from offline caching**, enforces cache expiry, and supports remote-wipe; offline shows last-loaded non-restricted view with an explicit stale badge.
- **Acceptance Criteria:**
  - AC1: Role dashboards render legibly on mobile breakpoints with touch drill-down and an alert inbox.
  - AC2: An executive briefing pack can be scheduled and delivered as a scope-correct PDF + in-app digest.
  - AC3: The briefing includes top KPIs, key trends, open critical alerts, compliance highlights for the recipient's scope.
  - AC4: Briefing figures carry `data_as_of` and freshness state.
  - AC5: Mobile views enforce the same RLS, suppression, and sensitivity masking as desktop.
  - AC6: Briefing generation reuses the schedule/export pipeline (FR-09) and is audited.
  - **AC7 (v2):** The on-device cache is encrypted and **excludes RESTRICTED fields**; cache expires per policy; remote-wipe invalidates it; offline never reveals RESTRICTED PII.
- **Business Rules:**
  - BR1: Mobile is the same governed data and RLS — no relaxed scoping.
  - BR2: The briefing pack is generated per recipient under their scope.
  - BR3: Briefing content is configurable per role but limited to governed KPIs/compliance metrics.
  - BR4: Critical alerts always appear regardless of trimming.
  - **BR5 (v2):** RESTRICTED fields/PII are never written to the offline cache; only PUBLIC/INTERNAL aggregates may be cached, encrypted, with expiry.
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

- **UI Behavior Notes:** Mobile layout (stacked KPI cards, swipeable sparklines, collapsible sections, bottom-nav, alert badge); briefing digest with sections each carrying as-of + "open full dashboard"; PDF mirrors the digest; offline shows non-restricted cached view + stale badge; settings expose remote-wipe.
- **Edge Cases:** Offline/poor connectivity (last-loaded non-restricted cached view + explicit stale badge, no silent refresh); very small screen (progressive disclosure); recipient scope emptied (digest notes "no data in scope"); lost device (remote-wipe clears encrypted cache).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MobileRenderer`, `BriefingComposer`, reuse `ReportScheduler`/`ExportRenderer`, `FreshnessDecorator`, `OfflineCacheGuard` |
| Backend Flow | Mobile render → same pipeline with viewport hint, RESTRICTED stripped from cacheable payload; Briefing → scheduled per recipient → resolve scope → compose top KPIs/alerts/compliance → render PDF + in-app → deliver → log |
| Data Operations | SELECT marts/snapshots/alerts (RLS, suppressed); INSERT report_execution; create document ref |
| Validation | Viewport handling; recipient scope; governed-content only; **offline-cacheability (no RESTRICTED)** |
| Authorization | Same RBAC+RLS as desktop; per-recipient briefing scope |
| State Changes & Side Effects | execution + document + async access_log; notification delivery |
| Failure Handling | Offline → non-restricted cached + stale badge; empty scope → "no data" digest; render fail → retry+alert (FR-09) |
| Dependencies | FR-01 dashboards, FR-09 export, FR-11 alerts, FR-12 freshness, FR-17 suppression |
| Test Guidance | RLS parity mobile vs desktop; per-recipient briefing scope; critical-alert inclusion; **offline excludes RESTRICTED; encrypted cache; remote-wipe** |

---

### FR-M14-17 — Metric-Level Privacy & Complementary Suppression (NEW — R1, Critical)

- **Module:** M14-F17
- **Primary Role(s):** Analytics Administrator (configure), All roles (enforced)
- **User Story:** As an Analytics Administrator, I want suppression applied to KPI tiles, charts, and exports — not just drill-through — with complementary suppression across overlapping scopes/periods, so that no individual is re-identified by aggregate arithmetic even when row-level security is airtight.
- **Description:** A cross-cutting privacy layer governed by `suppression_policy` (E24). For every aggregate read, any cell whose group size/denominator `< k` is suppressed or banded; the engine additionally applies **complementary suppression** — when one cell in a row/column is suppressed, enough complementary cells are suppressed so the hidden value cannot be recovered by subtracting visible totals, including across this-period-vs-last-period and with-vs-without-one-unit differencing. This closes the council's most dangerous finding: RLS stops record leakage; FR-17 stops metric re-identification.
- **Acceptance Criteria:**
  - AC1: A tile/chart cell with denominator/group size `< k` (default 5, per-KPI override `min_cell_size`) is suppressed or banded ("<5").
  - AC2: When a cell is suppressed, complementary cells are suppressed so the value cannot be recovered from a visible total.
  - AC3: Differencing two overlapping scopes or periods cannot reconstruct a suppressed cell (verified by the suppression test harness).
  - AC4: Suppression applies uniformly to tiles, charts, exports, and drill-through.
  - AC5: A suppressed aggregate read returns/annotates `SMALL_CELL_SUPPRESSED`; partially suppressed results carry `COMPLEMENTARY_SUPPRESSION_APPLIED` notice.
  - AC6: The suppression scope-leak/aggregate-re-identification test matrix is a launch gate (§13.4).
- **Business Rules:**
  - BR1: Suppression is applied **after** RLS and masking, on the final aggregate, server-side; clients never receive the suppressed values.
  - BR2: `k` and banding are configurable per `suppression_policy` and per KPI; the stricter of the two applies.
  - BR3: Suppression is never disabled for RESTRICTED domains; an admin cannot lower `k` below the statutory minimum.
  - BR4: Suppression decisions are deterministic for a given `(query, k, data)` so trends remain stable.
- **Data Model References:**

| Entity | Use |
|---|---|
| `suppression_policy` | k + complementary config |
| `kpi_snapshot` (cell_size) | group-size source |
| `kpi_definition` (min_cell_size) | per-KPI override |
| `analytics_access_log` | suppressed-access audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/suppression-policies` | create/update policy |
| GET | `/api/v1/analytics/suppression-policies` | list policies |
| (cross-cutting) | applied within every aggregate read | tiles/charts/exports/drill |

- **UI Behavior Notes:** Suppressed cells render "<5" or "below privacy threshold" with a tooltip; admin policy editor with k, banding, complementary toggle, domain scope; a suppression-simulation preview shows which cells would hide for a sample query.
- **Edge Cases:** Single non-suppressed cell left in a row whose total is visible (complementary suppression hides a second cell); time-series where one period drops below k (that point banded + adjacent complement considered); export of a fully-small dataset (whole grid banded with a header note).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SuppressionPolicyController`, `SmallCellSuppressor`, `ComplementarySuppressionEngine`, `SuppressionDecorator` |
| Backend Flow | Compute aggregate (post-RLS) → evaluate each cell's group size → suppress/band below k → run complementary pass across row/column/period overlaps → annotate result → enqueue audit |
| Data Operations | Read cell_size from snapshot/aggregate; no writes to source |
| Validation | k ≥ statutory minimum; deterministic suppression; complementary completeness |
| Authorization | Admin configure; all enforced |
| State Changes & Side Effects | none (read-only decoration); audit annotation |
| Failure Handling | Below threshold → `SMALL_CELL_SUPPRESSED`; partial → `COMPLEMENTARY_SUPPRESSION_APPLIED` |
| Dependencies | FR-04 RLS (applied first); consumed by FR-01/05/06/07/08/09/10/14/16 |
| Test Guidance | **Aggregate re-identification harness (differencing attacks)**; complementary completeness; determinism/trend stability; export parity |

---

### FR-M14-18 — Probabilistic Predictive Analytics with Fairness Governance & Friction-Gated Scores (NEW — R4, Critical)

- **Module:** M14-F18
- **Primary Role(s):** HR Officer, Department Head, Executive; Analytics Administrator (model governance); DPO (fairness sign-off)
- **User Story:** As an HR Officer, I want explainable attrition and succession risk that is fairness-audited, excludes protected/correlated attributes, and gates individual scores behind a deliberate, purpose-stated action, so that I can target retention and succession without enabling discriminatory or constitutionally-impermissible decisions.
- **Description:** Registers **probabilistic** `prediction_model`s (attrition, succession) over governed marts. **Before activation** a model must publish a model card, declare a `protected_features_excluded` list (caste/reservation category, gender, disability, maternity-linked leave proxies), pass documented **adverse-impact/disparate-impact testing** (`fairness_status=PASSED` or `WAIVED_WITH_REASON` by the DPO), and carry an `intended_use` and a `prohibited_use` ("must not be the sole or primary basis for any administrative action"). Aggregate/banded risk distributions are freely viewable to authorised scope; **individual scores are friction-gated** — opening a named individual's score requires a deliberate action, a purpose prompt, RESTRICTED authority, and a full-fidelity audit entry.
- **Acceptance Criteria:**
  - AC1: A probabilistic model cannot be activated without a published model card, a `protected_features_excluded` list, and `fairness_status ∈ {PASSED, WAIVED_WITH_REASON}`; otherwise 422 `MODEL_FAIRNESS_ASSESSMENT_REQUIRED`.
  - AC2: Activation requires `approved_by ≠ created_by`; DPO co-signs the fairness assessment.
  - AC3: Aggregate/banded risk distributions are viewable to authorised scope (suppressed below k).
  - AC4: Opening an **individual** score requires a deliberate "view individual prediction" action with a purpose prompt; it is RESTRICTED, friction-gated, and audited (`VIEW_INDIVIDUAL_PREDICTION`).
  - AC5: An attempt to surface an individual score on hover/tile, or by an unauthorised role, returns 403 `PREDICTION_INDIVIDUAL_GATED`.
  - AC6: Every predictive figure is labelled advisory with model id, version, confidence, `data_as_of`, and the prohibited-use clause; new joiners with insufficient history return `NO_PREDICTION`, not a false HIGH.
- **Business Rules:**
  - BR1: Predictions are advisory; never written to M01–M13; never the sole/primary basis for any administrative action.
  - BR2: Protected/correlated attributes are excluded from features; the exclusion list is part of the model card and is audited.
  - BR3: Adverse-impact testing thresholds are documented; a FAILED model cannot activate; a WAIVED model records the DPO reason.
  - BR4: Individual scores are RESTRICTED and friction-gated; aggregate distributions follow standard RLS + suppression.
  - BR5: Data drift flags a model for re-review; a drifted model's results are frozen read-only until re-assessed.
- **Data Model References:**

| Entity | Use |
|---|---|
| `prediction_model` (fairness fields, model_card_ref) | governed registry |
| `prediction_result` (is_individual_gated) | scores per subject |
| `documents` (M13) | model card artefact |
| Marts (workforce/leave/appraisal/transfer) | features (protected excluded) |
| `analytics_access_log` (VIEW_INDIVIDUAL_PREDICTION) | friction-gated audit |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/models` | register probabilistic model (card + exclusions) |
| POST | `/api/v1/analytics/models/{id}:assess-fairness` | run/record adverse-impact test |
| POST | `/api/v1/analytics/models/{id}:activate` | activate (checker + DPO co-sign) |
| GET | `/api/v1/analytics/predictions/attrition?scope=` | aggregate/banded distribution |
| GET | `/api/v1/analytics/predictions/succession?scope=` | succession risk distribution |
| POST | `/api/v1/analytics/predictions/individual` | friction-gated individual score (purpose required) |

- **UI Behavior Notes:** Predictive dashboard with risk-band distribution and succession heatmap (role criticality × bench risk); prominent "Advisory — not an administrative decision; must not be the sole/primary basis for action" banner; model-card link; individual score behind an explicit "View individual prediction" action with a mandatory purpose field and a friction confirmation; never on hover.
- **Edge Cases:** Insufficient history (NO_PREDICTION); model retired/drifted (results frozen); fairness test FAILED (activation blocked); WAIVED (DPO reason recorded + shown to Auditor); attempt to slice by a protected attribute (rejected).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ModelRegistryController`, `FairnessAssessor`, `AttritionScorer`, `SuccessionAnalyzer`, `ExplainabilityService`, `IndividualScoreGate` |
| Backend Flow | Register (card + exclusions) → assess fairness (adverse-impact) → activate (checker + DPO) → on run assemble features (protected excluded) from marts (RLS) → score → derive band + top factors + confidence → persist; aggregate views suppressed; individual view friction-gated + audited |
| Data Operations | INSERT prediction_model/result; create model-card doc; SELECT feature marts; full-fidelity access_log on individual view |
| Validation | Model card present; exclusions present; fairness PASSED/WAIVED; methodology present; confidence; advisory labelling |
| Authorization | HR/Dept Head/Exec aggregate scoped; individual RESTRICTED + friction-gated; DPO fairness co-sign |
| State Changes & Side Effects | model DRAFT→ACTIVE→RETIRED; fairness_status; result rows; access_log VIEW_INDIVIDUAL_PREDICTION |
| Failure Handling | No fairness → 422 `MODEL_FAIRNESS_ASSESSMENT_REQUIRED`; individual ungated access → 403 `PREDICTION_INDIVIDUAL_GATED`; insufficient data → NO_PREDICTION; black-box → publish blocked `MODEL_METHODOLOGY_REQUIRED` |
| Dependencies | FR-03 marts, FR-04 RLS, FR-17 suppression, FR-13 (deterministic counterpart), DPO governance |
| Test Guidance | **Adverse-impact gate; protected-attribute exclusion; friction-gate on individual scores; prohibited-use labelling; NO_PREDICTION for new joiners; drift freeze** |

---

### FR-M14-19 — Establishment & Position-Management Reference Integration (NEW — R8, High)

- **Module:** M14-F19
- **Primary Role(s):** Establishment Officer (maintain), HR Officer/Dept Head/Executive/Auditor (consume)
- **User Story:** As an Establishment Officer, I want a position/establishment master — sanctioned strength, posts, reservation categories, and roster points — so that vacancy and reservation compliance have an authoritative denominator that no person-centric module (M01–M13) currently owns.
- **Description:** Names and hosts the establishment source of record as `establishment_position` (E21), exposed through `MART_ESTABLISHMENT`. It is the authoritative denominator for vacancy (FR-05) and reservation compliance (FR-07). The Establishment Officer authors sanctioned strength and roster points; M14 reports compliance and never approves posts. Filled = active employees mapped to sanctioned posts.
- **Acceptance Criteria:**
  - AC1: An Establishment Officer can create/maintain positions with sanctioned strength, cadre, designation, org unit, reservation category, and roster point, with effective dates.
  - AC2: `MART_ESTABLISHMENT` exposes positions for vacancy/reservation denominators.
  - AC3: Vacancy = sanctioned (establishment) − filled; reservation compliance = filled-by-category / sanctioned-for-category vs roster points.
  - AC4: Missing establishment data for a scope raises `ESTABLISHMENT_REFERENCE_MISSING` (notice), never a silent zero.
  - AC5: Position changes are effective-dated; historical vacancy reproduces against the establishment in force (FR-23).
  - AC6: Establishment edits are audited; M14 does not adjudicate roster decisions.
- **Business Rules:**
  - BR1: M14 hosts the establishment reference; the Establishment Officer is the data custodian.
  - BR2: Sanctioned strength and roster points are authored here, not invented by analytics.
  - BR3: Vacancy/reservation denominators are pinned to this reference and to the effective-dated position record.
  - BR4: A position with status ABOLISHED is excluded from current sanctioned strength but retained for history.
- **Data Model References:**

| Entity | Use |
|---|---|
| `establishment_position` (E21) | sanctioned strength/roster points |
| `analytics_datamart` (MART_ESTABLISHMENT) | denominator mart |
| `org_units`,`designations`,`cadres` (ref) | dimensions |
| `employees` (ref) | filled mapping |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/establishment/positions` | create/maintain position |
| GET | `/api/v1/analytics/establishment/positions?scope=` | list positions (scoped) |
| GET | `/api/v1/analytics/establishment/vacancy-base?scope=&period=` | sanctioned-strength denominator |

- **UI Behavior Notes:** Establishment console (position list with sanctioned strength, category, roster point, effective dates, status); create/edit form; data-quality flags for unmapped posts; read views for consumers.
- **Edge Cases:** Post sanctioned but not yet filled (counts as vacant); post abolished mid-year (excluded from current, retained historically); roster point conflict (flagged for Establishment Officer, not auto-resolved).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `EstablishmentController`, `PositionService`, `EstablishmentMartBuilder` |
| Backend Flow | Maintain positions (effective-dated) → build MART_ESTABLISHMENT → join to headcount for vacancy/reservation → expose denominator API |
| Data Operations | INSERT/UPDATE establishment_position; build mart; SELECT (RLS) |
| Validation | Sanctioned strength ≥ 0; effective-date integrity; roster-point uniqueness per category/unit |
| Authorization | Establishment Officer maintain; consumers read scoped |
| State Changes & Side Effects | position lifecycle SANCTIONED/FROZEN/ABOLISHED; mart refresh; audit |
| Failure Handling | Missing reference → `ESTABLISHMENT_REFERENCE_MISSING`; roster conflict → data-quality flag |
| Dependencies | FR-05 vacancy, FR-07 reservation, FR-03 mart, FR-23 effective-dated history |
| Test Guidance | Sanctioned-vs-filled math; effective-dated denominator; abolished exclusion; missing-reference notice |

---

### FR-M14-20 — DPDP Rectification & Erasure Propagation (NEW — R9, Critical)

- **Module:** M14-F20
- **Primary Role(s):** Data Protection Officer (govern/approve), Data Engineer (execute), Auditor (verify)
- **User Story:** As a Data Protection Officer, I want a correction or erasure of an employee's PII in M01 to propagate across the entire analytics estate — marts, snapshots, predictions, and export artefacts — reconciled against statutory retention, so that the analytics layer is not an uncontrolled second copy of unlawful or stale personal data.
- **Description:** A propagation pipeline driven by `data_subject_change` (E22). On a rectification/erasure/restriction event from M01 or a DPDP data-principal request, M14 runs impact analysis (which marts/snapshots/predictions/exports contain the subject), then **rectifies** (re-derives affected snapshots as new knowledge-versions, FR-23), **erases/purges** (`prediction_result` rows; marks `report_execution` artefacts `REDACTED` in M13), and **reconciles against statutory retention**: where retention legally overrides erasure (e.g., pension records), the change is `BLOCKED_RETENTION` with a recorded `legal_basis`, surfaced to the DPO and Auditor.
- **Acceptance Criteria:**
  - AC1: A `data_subject_change` (RECTIFICATION/ERASURE/RESTRICTION) triggers impact analysis identifying all affected derived rows/artefacts.
  - AC2: Rectification re-derives affected `kpi_snapshot`s as new knowledge-versions; prior rows are marked superseded, not mutated (FR-23).
  - AC3: Erasure purges `prediction_result` rows and marks affected `report_execution` artefacts `REDACTED` in M13.
  - AC4: Where statutory retention overrides erasure, the change is `BLOCKED_RETENTION` with a recorded `legal_basis`, and the data is restricted from analytics rendering rather than deleted.
  - AC5: Propagation completes within the configured SLA; incomplete propagation returns/notes `ERASURE_PROPAGATION_PENDING` on affected surfaces.
  - AC6: The DPO and Auditor can verify propagation completeness; every change is append-only audited.
- **Business Rules:**
  - BR1: Append-only ledgers are reconciled with erasure by **restriction/redaction + knowledge-versioning**, not by deleting historical audit rows (preserves audit integrity while honouring DPDP).
  - BR2: A retention override must record a legal basis and is reviewable by the Auditor.
  - BR3: Erased/restricted subjects are excluded from all new analytics computations and renders.
  - BR4: Propagation is idempotent and resumable; a failed step retries and alerts.
- **Data Model References:**

| Entity | Use |
|---|---|
| `data_subject_change` (E22) | request + propagation state |
| `kpi_snapshot` | bitemporal restatement target |
| `prediction_result` | purge target |
| `report_execution`/`documents` (M13) | REDACTED artefacts |
| `analytics_datamart` | rectified source rows |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/data-subject-changes` | register rectification/erasure (DPO/M01) |
| GET | `/api/v1/analytics/data-subject-changes/{id}` | propagation status |
| POST | `/api/v1/analytics/data-subject-changes/{id}:retention-override` | record legal basis (DPO) |

- **UI Behavior Notes:** DPO console listing changes with type, status, affected counts, SLA; impact-analysis preview; retention-override form with mandatory legal basis; Auditor verification view; affected surfaces show "data updated/erased per data-protection request".
- **Edge Cases:** Subject present in an exported PDF in M13 (artefact marked REDACTED, regenerated where lawful); erasure on a pension-retained record (BLOCKED_RETENTION + basis); concurrent rectification + report run (run waits or re-runs on the new knowledge-version).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DataSubjectChangeController`, `ImpactAnalyzer`, `RectificationPropagator`, `ErasurePurger`, `RetentionReconciler` |
| Backend Flow | Receive change → impact analysis → rectify (re-derive snapshots as knowledge-versions) / purge predictions / mark exports REDACTED → reconcile retention → update status → audit → notify DPO/Auditor |
| Data Operations | INSERT data_subject_change; INSERT new snapshot knowledge-versions; DELETE prediction_result; UPDATE report_execution REDACTED; UPDATE mart rows (rectification) |
| Validation | Subject existence; retention rule lookup; idempotency; completeness |
| Authorization | DPO govern/override; Data Engineer execute; Auditor verify |
| State Changes & Side Effects | change RECEIVED→PROPAGATING→COMPLETED/BLOCKED_RETENTION/FAILED; snapshots superseded; artefacts REDACTED |
| Failure Handling | Step failure → retry + alert; incomplete → `ERASURE_PROPAGATION_PENDING`; retention block → `RETENTION_OVERRIDE_BLOCKS_ERASURE` (200 notice + basis) |
| Dependencies | M01 PII events, M13 artefacts, FR-23 bitemporal, FR-13/18 predictions |
| Test Guidance | **Propagation completeness across marts/snapshots/predictions/exports; retention override; append-only reconciliation; idempotency/resumability** |

---

### FR-M14-21 — Source Data Contracts & Schema-Drift Protection (NEW — R11, High)

- **Module:** M14-F21
- **Primary Role(s):** Data Engineer (own/maintain), owning-module steward (co-sign)
- **User Story:** As a Data Engineer, I want a versioned data contract between each source module and its marts, with CI contract tests and breaking-change alerts, so that upstream schema drift fails loudly in CI rather than silently breaking mart ETL in production.
- **Description:** Introduces `source_data_contract` (E19): a versioned source-view contract per mart that pins the columns, types, nullability, and semantics each source module (M01–M13) promises, plus the CDC mechanism (**Debezium** by default). Contract tests run in CI against each source; a breaking change fails CI and alerts both teams. A mart whose contract is `BREACHED` is held from refresh (FR-03 BR5).
- **Acceptance Criteria:**
  - AC1: Each mart references a `source_data_contract` pinning the promised schema and CDC mechanism.
  - AC2: CI runs contract tests against each source view; a schema mismatch fails the build with the offending field.
  - AC3: A breaking upstream change marks the contract `BREACHED`, holds the mart from refresh, and alerts the Data Engineer + owning-module steward.
  - AC4: A contract is versioned; a new source-view version requires a co-signed contract update.
  - AC5: The CDC mechanism is named (Debezium) and recorded per contract.
  - AC6: Contract status and last test timestamp are visible in the Data Engineer console.
- **Business Rules:**
  - BR1: M14 reads sources only through contracted views, never raw tables.
  - BR2: A breaking change follows the contract's notice period before the old version is deprecated.
  - BR3: Contract tests are a CI gate; a BREACHED contract blocks production refresh of dependent marts.
  - BR4: The owning-module steward co-signs the schema promise.
- **Data Model References:**

| Entity | Use |
|---|---|
| `source_data_contract` (E19) | versioned schema promise |
| `analytics_datamart` | governed mart |
| `datamart_refresh_log` | refresh hold on breach |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/source-contracts` | register/version a contract |
| POST | `/api/v1/analytics/source-contracts/{id}:test` | run contract test |
| GET | `/api/v1/analytics/source-contracts?module=` | list contracts/status |

- **UI Behavior Notes:** Contract registry (module, source view, version, CDC, status, last test); failing-field detail on breach; co-sign workflow; alert links.
- **Edge Cases:** Additive non-breaking change (contract minor-versioned, no hold); breaking change without notice (contract BREACHED, mart held, alert); source view renamed (contract update required before refresh).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SourceContractController`, `ContractTestRunner`, `SchemaDiffer`, `BreachAlerter` |
| Backend Flow | Register contract → CI/manual test compares live source view to `schema_json` → on mismatch mark BREACHED + hold dependent marts + alert; on co-signed new version activate |
| Data Operations | INSERT/UPDATE source_data_contract; read source view metadata; update mart hold state |
| Validation | Schema diff; CDC mechanism; co-sign; version monotonicity |
| Authorization | Data Engineer own; owning-module steward co-sign |
| State Changes & Side Effects | contract DRAFT→ACTIVE→DEPRECATED/BREACHED; mart refresh hold; alerts |
| Failure Handling | Mismatch → `SOURCE_CONTRACT_VIOLATION` (CI fail / runtime hold) + alert |
| Dependencies | FR-03 marts; CI pipeline; source modules M01–M13 |
| Test Guidance | Breaking-change detection; additive-change tolerance; mart hold on breach; co-sign enforcement |

---

### FR-M14-22 — Access-Anomaly Detection (NEW — world-class addition)

- **Module:** M14-F22
- **Primary Role(s):** Auditor, Analytics Administrator (review)
- **User Story:** As an Auditor, I want proactive detection of anomalous analytics access — out-of-hours bulk exports, scope-edge probing, unusual drill-through volume — so that the audit ledger becomes preventive, not merely forensic.
- **Description:** A detection layer over the async-partitioned `analytics_access_log` (E16). It computes per-user/role baselines and flags deviations as `access_anomaly` (E23): off-hours bulk export, scope-edge probing (repeated near-boundary denied requests), unusual drill-through volume, repeated denials, mass NL queries. Anomalies raise notifications to Auditor/Analytics Admin and feed a review queue.
- **Acceptance Criteria:**
  - AC1: The engine evaluates the access ledger on a schedule and flags anomalies against per-user/role baselines.
  - AC2: Off-hours bulk export above a threshold raises an `access_anomaly` (WARNING/CRITICAL).
  - AC3: Repeated denied/edge-probing requests raise a `SCOPE_EDGE_PROBING` anomaly.
  - AC4: Anomalies notify Auditor/Analytics Admin and appear in a review queue with evidence.
  - AC5: A reviewer can mark an anomaly INVESTIGATING/DISMISSED/CONFIRMED; the decision is audited.
  - AC6: Detection reads the append-only ledger only; it never blocks legitimate access (advisory + review, not enforcement).
- **Business Rules:**
  - BR1: Detection operates on the partitioned async ledger off the read path (no added read latency).
  - BR2: Thresholds/baselines are configurable; CRITICAL anomalies always notify the Auditor.
  - BR3: Anomaly review decisions are append-only audited.
  - BR4: Detection is advisory; it informs investigation, it does not auto-revoke access.
- **Data Model References:**

| Entity | Use |
|---|---|
| `access_anomaly` (E23) | detected anomalies |
| `analytics_access_log` (E16) | source signal |
| `notifications` | alerting |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/anomalies?status=` | list anomalies (scoped) |
| POST | `/api/v1/analytics/anomalies/{id}:review` | mark INVESTIGATING/DISMISSED/CONFIRMED |
| POST | `/api/v1/analytics/anomaly-rules` | configure thresholds/baselines |

- **UI Behavior Notes:** Anomaly queue with type, severity, evidence (counts, times), user/role; review actions; trend of anomalies; configuration for thresholds.
- **Edge Cases:** Legitimate quarter-end bulk export (reviewer dismisses with note); new user with no baseline (cold-start uses role baseline); detection job lag (queue notes evaluation as-of).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AnomalyDetector`, `BaselineService`, `AnomalyController`, `AnomalyNotifier` |
| Backend Flow | Scheduled scan of partitioned ledger → compute baselines → flag deviations → INSERT access_anomaly → notify → expose review queue |
| Data Operations | SELECT access_log (partitioned); INSERT access_anomaly; INSERT notifications; UPDATE review status |
| Validation | Threshold config; baseline sufficiency; evidence completeness |
| Authorization | Auditor/Analytics Admin review; configure by Analytics Admin |
| State Changes & Side Effects | anomaly OPEN→INVESTIGATING→DISMISSED/CONFIRMED; notifications |
| Failure Handling | Detection job failure → retry + ops alert; cold-start → role baseline |
| Dependencies | FR-04/§8.1 async ledger; notifications |
| Test Guidance | Off-hours bulk-export detection; scope-edge probing; baseline cold-start; advisory (non-blocking) |

---

### FR-M14-23 — Bitemporal Snapshot & As-Of-Knowledge Reproducibility (NEW — R3, Critical)

- **Module:** M14-F23
- **Primary Role(s):** Auditor, Analytics Administrator, Data Engineer
- **User Story:** As an Auditor, I want every snapshot to record both the period it describes (valid-time) and when it became known (knowledge-time), and to pull "the June report as it was known in June", so that a backdated correction creates a reconciling lineage instead of two contradictory numbers.
- **Description:** Establishes the bitemporal contract for `kpi_snapshot` (E04): `valid_time` (business period described) + `knowledge_time` (when the value became known). A restatement (backdated leave approval, payroll correction, DPDP rectification) **adds a new knowledge-version** and marks the prior `is_superseded=true` with `superseded_by`; it never mutates history. Every report/KPI read accepts an **`asOfKnowledge`** parameter that returns the value whose `knowledge_time` is the latest ≤ the requested instant — reproducing exactly what was shown historically. This resolves the v1 append-only-vs-restatement contradiction (DI rule 6/12).
- **Acceptance Criteria:**
  - AC1: Every `kpi_snapshot` carries `valid_time` and `knowledge_time`.
  - AC2: A restatement adds a new knowledge-version; the prior row is retained, marked `is_superseded=true`, and linked via `superseded_by`.
  - AC3: A KPI/report read with `asOfKnowledge=T` returns the value known as of T (latest `knowledge_time ≤ T`).
  - AC4: The current (default) read returns the latest knowledge-version.
  - AC5: An auditor pulling the same period at two different knowledge instants gets the two reconciling values with lineage, never an unexplained discrepancy.
  - AC6: Append-only is preserved — no historical row is mutated or deleted (rectification adds rows; erasure restricts/redacts per FR-20).
- **Business Rules:**
  - BR1: Snapshots are append-only; correctness across time is achieved by knowledge-versioning, not mutation.
  - BR2: `asOfKnowledge` is honoured uniformly across KPI value, trend, report run, and compliance export.
  - BR3: A backfill/retroactive correction always produces a new knowledge-version, recompute job logged.
  - BR4: Reproducibility is deterministic for `(kpi_id, kpi_version, scope, period_key, knowledge_time)`.
- **Data Model References:**

| Entity | Use |
|---|---|
| `kpi_snapshot` (valid_time, knowledge_time, is_superseded, superseded_by) | bitemporal store |
| `datamart_refresh_log` | backfill/recompute provenance |
| `report_execution` (as_of_knowledge) | reproducible runs |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/kpis/{code}/value?...&asOfKnowledge=` | value as known at instant |
| GET | `/api/v1/analytics/kpis/{code}/history?scope=&period=` | knowledge-version lineage for a period |
| GET | `/api/v1/analytics/reports/{id}/run?asOfKnowledge=` | reproducible report run |

- **UI Behavior Notes:** Optional "as of knowledge date" control on reports/KPIs; a period's value shows a "restated" badge with a lineage popover (original vs current knowledge-versions and why); audit export stamps both valid-time and knowledge-time.
- **Edge Cases:** Multiple restatements of one period (full lineage chain); `asOfKnowledge` before the first knowledge-version (NO_DATA / `AS_OF_KNOWLEDGE_UNAVAILABLE`); restatement caused by DPDP rectification (FR-20) links to the change record.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BitemporalSnapshotStore`, `AsOfKnowledgeResolver`, `RestatementService`, `SnapshotMaterializer` |
| Backend Flow | Materialise snapshot with valid_time + knowledge_time → on restatement insert new knowledge-version, mark prior superseded → reads resolve latest knowledge_time ≤ requested (default = now) |
| Data Operations | INSERT snapshot knowledge-versions; UPDATE prior is_superseded/superseded_by (status flags only, value immutable); SELECT by knowledge_time |
| Validation | knowledge_time monotonicity per (kpi,version,scope,period); determinism |
| Authorization | All scoped reads honour asOfKnowledge; Auditor lineage view |
| State Changes & Side Effects | append knowledge-versions; supersede flags; recompute provenance |
| Failure Handling | asOfKnowledge before first version → `AS_OF_KNOWLEDGE_UNAVAILABLE`; recompute failure → retry + alert |
| Dependencies | FR-02 KPI engine, FR-03 backfill, FR-20 rectification |
| Test Guidance | **As-of-knowledge reproduction (June-in-June vs June-in-September); restatement lineage; append-only preservation; determinism** |

---

## 7. UI Requirements

| Area | Requirement |
|---|---|
| Information architecture | Left nav by persona/category: My Dashboard, Workforce, Operational, Compliance, Reports, Predictive, Establishment (officers), Data Health (operators), Anomalies (auditor/admin), Data-Protection (DPO). Role determines visible sections. |
| Dashboard canvas | Responsive grid; KPI tiles, charts, tables; per-widget freshness badge (**role-adaptive copy**); plain-language KPI definition on consumer tiles; drill breadcrumbs; "save as my view". |
| KPI tiles | Value + unit + trend sparkline + period-correct target/RAG + alert badge + as-of + **plain-language "what counts"** + **reconciliation-explainer link**; click → drill-down; suppressed cells show "<5". |
| Charts | Line/bar/pie/donut/heatmap/gauge/table for consumers; HEATMAP/FUNNEL/MAP retained in the **authoring** catalog only (consumer palette trims MAP/FUNNEL). Accessible (labels, patterns + colour, keyboard, data-table fallback). |
| Report builder | Three-pane; sensitivity chips; **inline aggregate-vs-detail RESTRICTED explainer**; masked-field tooltips; row-count + freshness + suppression indicators. |
| Filters | Period, org_unit (scoped tree), cadre, designation, gender, category, **as-of-knowledge date**; shareable as saved_view. |
| Freshness UX | Green/amber/red chip with icon + label (non-colour cue); **role-adaptive tooltip** (plain for leaders, technical for operators); reconciliation explainer; global data-health panel. |
| Predictive UX | Aggregate/banded distributions open; **individual scores behind an explicit action + purpose prompt + friction confirmation**; prominent advisory + prohibited-use banner; model-card link. |
| Establishment UX | Position console (sanctioned strength, roster point, effective dates); data-quality flags for unmapped posts. |
| Data-protection UX | DPO console for rectification/erasure with impact preview, retention-override (legal basis), propagation status; affected surfaces note "data updated/erased per data-protection request". |
| Anomaly UX | Auditor/Admin anomaly queue with evidence and review actions. |
| Empty/loading/error states | Every surface defines: loading skeleton-with-context, empty ("no data in your scope"), error (with retry), permission ("not authorised"), stale (degraded banner), offline (non-restricted cached + stale), **suppressed ("below privacy threshold")**, **gated ("open individual prediction — purpose required")**. |
| Drill-through | "Open source record" visible only when permitted; opens owning module read-only; suppression notice. |
| Alerts | Alert inbox with severity chips; acknowledge/resolve; tile badges; period-correct target. |
| Exports | PDF/Excel/CSV menu with progress; header/footer carry scope + as-of + **as-of-knowledge** + page numbers + masking/suppression notes. |
| Mobile | Stacked cards, swipeable trends, bottom-nav, alert badge; same RLS + suppression; **offline excludes RESTRICTED; encrypted cache; remote-wipe**. |
| Embedded BI | Snippet uses header/code-exchange (**no URL token**); CSP frame-ancestors; revocation surfaced. |
| Accessibility | WCAG 2.1 AA: keyboard-operable charts, focus order, contrast, data-table fallback, screen-reader summaries, no colour-only meaning. |
| i18n/locale | Dates `DD-MMM-YYYY`, INR money formatting, user timezone for as-of, translatable labels (incl. role-adaptive copy). |
| Theming | Light/dark mode; government-portal visual compliance. |

---

## 8. API & Integration

### 8.1 Conventions (async audit-on-read — v2)

- Base path `/api/v1/analytics`; OIDC/JWT auth; RBAC + RLS + suppression enforced server-side on every data-bearing endpoint.
- All list endpoints paginated (`page`/`limit`, max 100) or cursor-based; all data-bearing reads include a `dataFreshness` block (`{ asOf, state, isPartial, label }` where `label` is role-adaptive).
- **Audit-on-read is asynchronous and batched (R5):** every data-returning call **enqueues** an `analytics_access_log` write to an append-only **partitioned** store off the read path; it does not block the response. **Full-fidelity** logging (`log_fidelity=FULL`) is mandatory and synchronous-to-queue for `EXPORT`, `DRILLTHROUGH`, `NL_QUERY`, `VIEW_INDIVIDUAL_PREDICTION`, and all RESTRICTED reads; **`VIEW_DASHBOARD` of low-sensitivity data may be sampled** (`log_fidelity=SAMPLED`). High-fidelity events mirror into the shared `audit_log`.
- Reads accept an optional `asOfKnowledge` parameter (FR-23) for bitemporal reproducibility.
- Embed credentials are never accepted in a URL path/query (FR-15); they are presented in a header or exchanged from a short-lived code.

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
| RLS_POLICY_REQUIRES_CHECKER | 403 | Maker attempted to self-approve an RLS policy change (v2) |
| DRILLTHROUGH_FORBIDDEN | 403 | User lacks owning-module/scope permission for the record |
| SMALL_CELL_SUPPRESSED | 403 | Group below privacy threshold (k-anonymity) — now incl. tiles/charts/exports (v2) |
| COMPLEMENTARY_SUPPRESSION_APPLIED | 200(notice) | Some cells suppressed to prevent recovery by subtraction (v2) |
| FIELD_NOT_PERMITTED | 403 | RESTRICTED field used by unauthorised role |
| KPI_EXPRESSION_INVALID | 400 | KPI formula failed validation |
| KPI_VERSION_OVERLAP | 409 | Two ACTIVE versions for a kpi_code |
| CROSS_VERSION_AGGREGATION_BLOCKED | 409 | Trend aggregation crosses a definition version without acknowledgement (v2) |
| WIDGET_BINDING_INVALID | 409 | Widget bound to retired/missing KPI/report |
| PUBLISH_REQUIRES_CHECKER | 403 | Maker attempted gated publication |
| MART_UNAVAILABLE | 503 | Source mart FAILED/absent |
| MART_REFRESH_FAILED | 500 | ETL refresh error (last good retained) |
| MART_REFRESH_IN_PROGRESS | 409 | Concurrent refresh lock |
| SOURCE_CONTRACT_VIOLATION | 502 | Source schema breached the data contract (v2) |
| EXPORT_ROW_LIMIT_EXCEEDED | 400 | Report exceeds configured row cap |
| RESTRICTED_CHANNEL_BLOCKED | 403 | RESTRICTED report to insecure channel |
| METRIC_NOT_AVAILABLE | 404 | NL query references unmodelled metric |
| NLQ_CLARIFICATION_REQUIRED | 200(options) | Ambiguous NL question; clarification offered (v2) |
| NLQ_CONFIDENCE_TOO_LOW | 422 | NL intent confidence below threshold; refused not answered (v2) |
| EMBED_TOKEN_INVALID | 401 | Embed token missing/expired/out-of-scope |
| EMBED_TOKEN_REVOKED | 401 | Embed token revoked (v2) |
| MODEL_METHODOLOGY_REQUIRED | 422 | Predictive model lacks required methodology |
| MODEL_FAIRNESS_ASSESSMENT_REQUIRED | 422 | Probabilistic model lacks fairness assessment/model card (v2) |
| PREDICTION_INDIVIDUAL_GATED | 403 | Individual predictive score requires friction-gate + purpose (v2) |
| ESTABLISHMENT_REFERENCE_MISSING | 200(notice)/422 | Sanctioned-strength/position reference absent (v2) |
| RESERVATION_REFERENCE_MISSING | 200(notice)/422 | Roster reference absent |
| VACANCY_REFERENCE_MISSING | 200(notice) | Establishment denominator absent |
| ERASURE_PROPAGATION_PENDING | 200(notice) | DPDP erasure not yet fully propagated to derived data (v2) |
| RETENTION_OVERRIDE_BLOCKS_ERASURE | 200(notice)/409 | Statutory retention overrides erasure; legal basis recorded (v2) |
| AS_OF_KNOWLEDGE_UNAVAILABLE | 404 | Requested knowledge instant predates the first snapshot version (v2) |

### 8.4 JSON Examples

**KPI value (scoped, role-adaptive freshness, bitemporal) — request/response**

```
GET /api/v1/analytics/kpis/HEADCOUNT_ACTIVE/value?scope=ORG_UNIT:OU-DIST-12&period=2026-06&asOfKnowledge=2026-07-01T00:00:00Z
```

```json
{
  "kpiCode": "HEADCOUNT_ACTIVE",
  "kpiVersion": 3,
  "definitionHash": "a1f9...",
  "scope": { "type": "ORG_UNIT", "id": "OU-DIST-12" },
  "period": "2026-06",
  "value": 1842,
  "unit": "COUNT",
  "target": { "value": null, "effectiveFrom": null },
  "dataFreshness": { "asOf": "2026-07-01T02:00:00Z", "state": "FRESH", "isPartial": false, "label": "Up to date as of 01-Jul-2026 07:30" },
  "knowledgeTime": "2026-07-01T02:00:00Z",
  "requestId": "req-1a2b3c"
}
```

**Suppressed aggregate (small cell)**

```json
{
  "reportCode": "RPT_DIVERSITY_OFFICE",
  "columns": ["office", "category", "headcount"],
  "rows": [
    { "office": "OFC-12A", "category": "GEN", "headcount": 41 },
    { "office": "OFC-12A", "category": "SC", "headcount": "<5", "suppressed": true },
    { "office": "OFC-12A", "category": "ST", "headcount": "<5", "suppressed": true }
  ],
  "notice": { "code": "COMPLEMENTARY_SUPPRESSION_APPLIED", "message": "Some values are hidden to protect individuals and cannot be recovered from totals." },
  "dataFreshness": { "asOf": "2026-07-01T02:00:00Z", "state": "FRESH", "isPartial": false, "label": "Up to date" },
  "requestId": "req-9z8y7x"
}
```

**Friction-gated individual prediction denial**

```json
{
  "error": { "code": "PREDICTION_INDIVIDUAL_GATED", "message": "Opening an individual's attrition score requires a stated purpose and is recorded. This score must not be the sole or primary basis for any administrative action.", "field": "subject_id" },
  "requestId": "req-4d5e6f"
}
```

**NL low-confidence refusal**

```json
{
  "error": { "code": "NLQ_CONFIDENCE_TOO_LOW", "message": "I am not confident I understood that. Did you mean vacancy by cadre in District 12, or headcount by office?", "field": "question" },
  "options": ["VACANCY_PCT scope=ORG_UNIT:OU-DIST-12", "HEADCOUNT_ACTIVE scope=ORG_UNIT:OU-DIST-12 by office"],
  "requestId": "req-7g8h9i"
}
```

**Stale-data response (degraded mart, role-adaptive label)**

```json
{
  "kpiCode": "PAYROLL_COST_TOTAL",
  "scope": { "type": "ORG_UNIT", "id": "OU-DIST-12" },
  "period": "2026-05",
  "value": 184230000.00,
  "unit": "CURRENCY",
  "dataFreshness": { "asOf": "2026-06-28T01:00:00Z", "state": "STALE", "isPartial": true,
    "label": "Numbers are a few days behind — the payroll system is still updating",
    "technicalReason": "MART_PAYROLL_COST last refreshed beyond 1440-min SLA" },
  "requestId": "req-2k3l4m"
}
```

### 8.5 Integration Points

| Direction | Counterparty | Mechanism | Purpose |
|---|---|---|---|
| Inbound (read) | M01–M13 | **Contracted source views (FR-21) + Debezium CDC / incremental / batch** | Populate analytics marts read-only |
| Inbound (read) | M12 Digital SR | Read SR verification status | Compliance/SR dashboards |
| Inbound (read) | M10 Payroll | Read **locked** payroll snapshots | Cost/overtime analytics |
| Inbound (read) | Workflow engine | Read pending `workflow_tasks` | SLA/pending-approvals dashboards |
| Inbound (read) | RBAC/org hierarchy | Resolve roles + org subtree | RLS scope resolution |
| Inbound (event) | M01 / DPO | PII rectification/erasure events | DPDP propagation (FR-20) |
| Internal | Establishment reference (FR-19) | `MART_ESTABLISHMENT` | Vacancy/reservation denominators |
| Internal | On-prem LLM (CGG Data Centre) | NL intent resolution (no data egress) | NL query (FR-15) |
| Outbound | M13 Documents | Store generated exports/briefings/model cards | Artefact persistence |
| Outbound | Notifications platform | Alerts, scheduled reports, anomaly + DPDP notices | Distribution |
| Outbound | Audit platform | Append (async) access/export/config events | Audit trail |
| Outbound | External portals | **Header/code-exchange** scoped, revocable embed tokens (CSP frame-ancestors) | Embedded BI |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard P95 < 2.5s (mart-backed); KPI/report API P95 < 500ms; preview first page < 1.5s for 100k-employee enterprise. |
| Audit write throughput (v2) | Async/batched access-log must sustain ≥ 8 widget-queries × 500 concurrent users (≈ thousands of events/sec) **without adding read-path latency**; partitioned append-only store; back-pressure buffering with no event loss for FULL-fidelity events. |
| Scalability | Marts pre-aggregated; horizontal read scaling; partitioned fact marts + partitioned access ledger; 500+ simultaneous dashboard users. |
| Freshness/Latency | Operational marts ≤ 30–60 min; demographic/financial marts ≤ daily; freshness SLA per mart enforced and surfaced; **reconciliation watermark-relative** (no false DEGRADED under CDC lag). |
| Availability | 99.9% uptime; degraded-mode (last good + stale badge) when a source/mart is down — dashboards never hard-fail on one stale mart. |
| Security | OWASP ASVS; TLS 1.2+; encryption at rest; RLS non-bypassable; **RLS/embed changes maker-checked**; embed tokens signed/expiring/**revocable, never in URL, CSP frame-ancestors**; RESTRICTED field masking. |
| Privacy | DPDP Act 2023 alignment; PII minimisation in marts; **metric-level complementary suppression (FR-17)**; **rectification/erasure propagation (FR-20)**; view/export auditing; **on-device RESTRICTED exclusion (FR-16)**. |
| Predictive governance (v2) | Probabilistic models require model card, protected-attribute exclusion, adverse-impact testing, prohibited-use clause; individual scores friction-gated. |
| Temporal integrity (v2) | Bitemporal snapshots; as-of-knowledge reproducibility; append-only preserved. |
| Auditability | Every view/drill/export/config/individual-prediction/DPDP change logged (async access_log + audit_log); immutable, queryable by Auditor; **anomaly detection over the ledger**. |
| Accessibility | WCAG 2.1 AA; chart data-table fallback; keyboard/screen-reader; non-colour cues; **role-adaptive language**. |
| Reliability/DR | RPO ≤ 15 min, RTO ≤ 4h; marts rebuildable from sources; refresh idempotent; snapshot history rebuildable bitemporally. |
| Observability | ETL run metrics, freshness + watermark-relative reconciliation monitoring, query latency, alert evaluation health, async-log queue depth, data-health panel. |
| Data quality | Watermark-relative reconciliation within per-KPI tolerance; sustained-variance DEGRADED flagging; data-quality notices on missing reference/establishment data; **source-contract CI gate**. |
| Retention | Snapshots and access logs retained per statutory schedule; export artefacts expire/purge; **erasure reconciled with retention overrides (FR-20)**. |
| Build-vs-buy (v2) | Per ADR-01: only the governed core holds DB credentials; adopted libraries consume already-governed result sets. |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 KPI Definition Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | expression validated; definition_hash computed |
| DRAFT | submit+activate (checker) | ACTIVE | approved_by ≠ created_by; prior ACTIVE → RETIRED |
| ACTIVE | new version activated | RETIRED | superseded by new version; trends mark version change |
| ACTIVE/DRAFT | retire | RETIRED | not referenced by published surface (or auto-pauses dependents) |

### 10.2 Dashboard Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | bindings validated |
| DRAFT | publish | PUBLISHED | COMPLIANCE/EXEC require checker; all bindings ACTIVE |
| PUBLISHED | edit (new draft) | DRAFT | versioned edit |
| PUBLISHED | archive | ARCHIVED | saved_views preserved read-only |

### 10.3 Data Mart Refresh / Health (watermark-relative reconciliation — v2)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| HEALTHY | refresh success within SLA | HEALTHY | watermark advanced; snapshots recomputed (knowledge-versioned) |
| HEALTHY | SLA exceeded | STALE | staleness surfaced; last good served |
| HEALTHY/STALE | **variance vs source-as-of-watermark > tolerance, sustained beyond grace** | DEGRADED | alert; is_partial set (transient CDC lag does NOT flag) |
| any | refresh error | FAILED | last good retained; alert; surfaces flagged |
| any | source contract BREACHED | FAILED(held) | refresh held; alert (FR-21) |
| FAILED/STALE/DEGRADED | successful refresh within tolerance | HEALTHY | health restored |

### 10.4 Report Execution

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | trigger | QUEUED | recipients/scope validated |
| QUEUED | start | RUNNING | mart available |
| RUNNING | success | COMPLETED | document created; async access_log EXPORT |
| RUNNING | error | FAILED | retry per policy; alert on final fail |
| COMPLETED | retention reached | EXPIRED | artefact purged |
| COMPLETED | DPDP erasure (FR-20) | REDACTED | artefact lawful basis revoked |

### 10.5 Alert Event

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | breach detected (period-correct threshold) | OPEN | not within suppression/hysteresis; notify |
| (none) | breach within suppression/hysteresis | SUPPRESSED | de-duplicated; logged |
| OPEN | acknowledge | ACKNOWLEDGED | acknowledged_by recorded |
| ACKNOWLEDGED/OPEN | value returns within bound | RESOLVED | auto-resolve on next clean evaluation |

### 10.6 Prediction Model (deterministic & probabilistic — v2)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | register | DRAFT | methodology present; (probabilistic) model card + exclusions present |
| DRAFT | assess fairness (probabilistic only) | DRAFT | adverse-impact test recorded; fairness_status PASSED/FAILED/WAIVED |
| DRAFT | activate (checker; probabilistic also DPO co-sign) | ACTIVE | approved_by ≠ created_by; probabilistic requires fairness PASSED/WAIVED |
| ACTIVE | retire / drift detected | RETIRED | results frozen read-only; re-review required |

### 10.7 RLS Scope Policy (maker-checker — v2)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create/update (maker) | DRAFT | filter validated |
| DRAFT | submit (with preview-as-role diff) | PENDING_APPROVAL | exposure diff captured |
| PENDING_APPROVAL | approve (checker ≠ maker) | ACTIVE | prior version → SUPERSEDED; immutable audit |
| PENDING_APPROVAL | reject | REJECTED | reason recorded |

### 10.8 Embed Token (hardened — v2)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | issue (maker) | PENDING_APPROVAL | scope/widgets/frame-ancestors set |
| PENDING_APPROVAL | approve (checker ≠ issuer) | ACTIVE | usable via header/code-exchange |
| ACTIVE | expiry reached | EXPIRED | render denied |
| ACTIVE | revoke | REVOKED | render denied immediately |
| ACTIVE | rotate | ROTATED | new token issued (lineage), old denied |

### 10.9 Data Subject Change (DPDP — v2)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | receive change | RECEIVED | impact analysis queued |
| RECEIVED | propagate | PROPAGATING | rectify snapshots / purge predictions / redact exports |
| PROPAGATING | complete | COMPLETED | propagation verified; audited |
| PROPAGATING | retention overrides erasure | BLOCKED_RETENTION | legal basis recorded; data restricted not deleted |
| PROPAGATING | step failure | FAILED | retry + alert |

---

## 11. Notifications

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| Scheduled report delivered | report_execution COMPLETED | schedule recipients (scoped) | EMAIL/IN_APP/SFTP |
| Report run failed | execution FAILED (final) | report owner | IN_APP + EMAIL |
| KPI threshold breached | alert_event OPEN | alert_rule recipients (scoped) | IN_APP + EMAIL |
| Critical alert | severity=CRITICAL | recipients + Dept Head | IN_APP + EMAIL |
| Mart refresh failed/degraded | mart FAILED/DEGRADED | Data Engineer + Analytics Admin | IN_APP + EMAIL |
| Source contract breached (v2) | contract BREACHED | Data Engineer + owning-module steward | IN_APP + EMAIL |
| KPI retired with dependents | KPI RETIRED | dashboard/alert stewards | IN_APP |
| Executive briefing | scheduled briefing | executive (own scope) | IN_APP + EMAIL (PDF) |
| Embed token issued/expiring/revoked (v2) | token lifecycle | issuing admin + checker | IN_APP |
| Reconciliation variance (sustained) | mart DEGRADED | Analytics Admin + Auditor (config) | IN_APP |
| Out-of-scope recipient dropped | delivery filtering | schedule owner (summary) | IN_APP |
| RLS policy pending approval (v2) | policy PENDING_APPROVAL | checker (Analytics Admin) | IN_APP |
| Model fairness assessment due / failed (v2) | model fairness FAILED/needed | Analytics Admin + DPO | IN_APP + EMAIL |
| Access anomaly detected (v2) | access_anomaly OPEN/CRITICAL | Auditor + Analytics Admin | IN_APP + EMAIL |
| DPDP change status (v2) | data_subject_change COMPLETED/BLOCKED_RETENTION | DPO + Auditor | IN_APP + EMAIL |

All notifications reference governed data and carry `data_as_of`; none include RESTRICTED PII in the body (link to a scoped view instead).

---

## 12. Reporting & Analytics

M14 **is** the reporting and analytics module; this section summarises its self-reporting and the catalog it exposes.

- **Standard report catalog (seed):** Headcount by org/cadre; Attrition; **Establishment-pinned vacancy (sanctioned-vs-filled)**; Demographics & diversity (suppressed); Retirement profile (deterministic, 1/3/5Y); Span of control; Leave & absenteeism; Attendance exceptions; Payroll cost & overtime (locked); Training coverage & skill gaps; Appraisal rating distribution; Disciplinary case aging; Transfer/promotion pipeline; Pension forecast; **Reservation roster compliance (establishment-pinned)**; Mandatory training status; SR verification status; Pending approvals & SLA breaches.
- **Self-analytics (operations):** Most-viewed dashboards/reports, export volume, query latency, ETL health, **watermark-relative reconciliation status**, alert volume by severity, **async-log queue depth**, **access-anomaly trends**, **DPDP propagation completeness** — for the Analytics Administrator, Auditor, and DPO.
- **Export formats:** PDF, XLSX, CSV — all scope-correct, suppressed, freshness-stamped, **as-of-knowledge-stamped**, audited.
- **Governance:** Every report maps to governed KPIs/semantic fields; reconciliation reports prove mart-to-source consistency at watermark; access logs (+ anomaly detection) provide preventive who-saw-what for audit; model cards govern predictions.

---

## 13. Migration & Launch

### 13.1 Data Migration

- M14 holds no transactional master data to migrate; migration = **standing up the analytics layer**: build mart schemas + **bitemporal snapshot store** + **partitioned access ledger**, define the semantic model, **register source data contracts (FR-21)**, register marts, **seed the establishment/position reference (FR-19)**, and run initial **full historical backfill** from M01–M13.
- Seed governed `kpi_definition`s (+ `definition_hash`), **effective-dated targets (E17)**, dashboard templates per persona, `rls_scope_policy` mappings (**through the maker-checker workflow**), `suppression_policy`, and the standard report catalog.
- Backfill bitemporal `kpi_snapshot` history (configurable horizon, e.g. 24 months) with knowledge_time = backfill instant.

### 13.2 Validation & Parallel Run

- Reconcile each seeded KPI against its owning module **at a fixed watermark** within per-KPI tolerance; record/resolve variances before go-live.
- Run the **RLS scope-leak AND aggregate-re-identification (suppression) test matrix** across all roles/marts; zero leakage and zero re-identification required to launch.
- Validate freshness SLAs, watermark-relative reconciliation, and degraded-mode with simulated mart outages and CDC lag.
- Validate **as-of-knowledge reproduction** (June-in-June vs June-after-correction).
- Validate predictive **fairness gate, friction-gate, and prohibited-use labelling**; validate **DPDP propagation** end-to-end.
- Verify export fidelity, scheduled delivery scoping, embed **header/code-exchange + revocation**, and NL **confidence gating**.

### 13.3 Cutover & Launch (phased — v2)

- **Phase 1 (foundation):** source contracts + Debezium CDC; `MART_HEADCOUNT` + establishment reference; RLS rewriter + **scope-leak + suppression harness**; KPI engine + bitemporal snapshots; freshness + reconciliation explainer; persona dashboards; deterministic retirement.
- **Phase 2:** workforce/operational/compliance suites; report builder; export/schedule; drill; alerts (effective-dated); benchmarking.
- **Phase 3 (advanced):** probabilistic predictive (fairness-gated); NL query (confidence-gated) + hardened embed; mobile/briefing (offline policy); access-anomaly detection.
- Soft-launch to HR/operators, then department heads/executives, then employee self-service.

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| All seed KPIs reconcile to source **at watermark** within tolerance | Pass required |
| RLS scope-leak matrix: 0 leaks | Pass required |
| **Aggregate re-identification / complementary-suppression harness: 0 re-identifications** | Pass required (v2) |
| Freshness SLAs + **watermark-relative reconciliation** + degraded-mode verified | Pass required |
| **As-of-knowledge reproducibility verified** (bitemporal) | Pass required (v2) |
| Persona dashboards published (maker-checker for compliance/exec) | Pass required |
| **RLS policy & embed-token maker-checker enforced; embed never in URL; CSP set** | Pass required (v2) |
| Export formats + scheduled delivery scoping validated | Pass required |
| Async audit logging (view/drill/export) verified at 500 concurrent | Pass required (v2) |
| **Access-anomaly detection live** | Pass required (v2) |
| Deterministic retirement validated; **probabilistic models carry model card + fairness PASSED + friction-gate + prohibited-use** | Pass required (v2) |
| **Establishment/position reference seeded; vacancy/reservation pinned to it** | Pass required (v2) |
| **DPDP rectification/erasure propagation tested incl. retention override** | Pass required (v2) |
| **Source data contracts active; CI contract tests green** | Pass required (v2) |
| **NL confidence gating + named on-prem LLM (no data egress) verified** | Pass required (v2) |
| Accessibility (WCAG AA) + **role-adaptive language** + mobile **offline RESTRICTED exclusion** verified | Pass required |
| DR/backfill rebuild (incl. bitemporal history) from sources tested | Pass required |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | dashboard, dashboard_widget, saved_view, suppression_policy | /dashboards,/widgets,:publish | §10.2 | publish SoD, scope-omit, saved-view isolation, plain-language tile |
| FR-02 | kpi_definition, kpi_snapshot, kpi_target_history | /kpis,:activate,/value,/targets | §10.1 | parser, determinism, version stamping, effective-dated target |
| FR-03 | analytics_datamart, datamart_refresh_log, source_data_contract | /marts,:refresh,/health | §10.3 | idempotent load, SLA, watermark-relative reconciliation, last-good |
| FR-04 | rls_scope_policy, workflow_instances | /rls-policies,:preview-as-role,:approve | §10.7 | scope-leak matrix, multi-role priority, masking, **maker-checker** |
| FR-05 | MART_HEADCOUNT, establishment_position, kpi_snapshot, prediction_result | /workforce/* | — | attrition-excl-transfers, **establishment vacancy**, retirement, span |
| FR-06 | domain marts, kpi_snapshot, suppression_policy | /operational/* | — | payroll locked-only, masking, case-aging, funnel, suppression |
| FR-07 | compliance/SR/workflow marts, establishment_position | /compliance/* | — | roster math (pinned), SR read-only, SLA buckets, as-of-knowledge export |
| FR-08 | saved_report, report_execution, suppression_policy | /reports:preview,/reports | — | field-permission, shared RLS, row-limit, suppression |
| FR-09 | report_schedule, report_execution, documents | /schedules,:export | §10.4 | burst scope, per-recipient RLS, format fidelity, REDACTED |
| FR-10 | dashboard_widget, analytics_access_log, suppression_policy | /drilldown,/drillthrough | — | both-permission, k-anonymity+complementary, read-only link |
| FR-11 | alert_rule, alert_event, kpi_target_history | /alert-rules,/alert-events | §10.5 | breach, effective-dated threshold, suppression/hysteresis |
| FR-12 | analytics_datamart, kpi_snapshot, datamart_refresh_log | /data-health,/reconciliation-explainer | §10.3 | SLA-boundary, role-adaptive copy, reconciliation explainer |
| FR-13 | prediction_model (deterministic), prediction_result | /models,/predictions/retirement | §10.6 | retirement determinism, suppression, knowledge-version on DOB fix |
| FR-14 | kpi_snapshot, kpi_target_history, kpi_definition | /benchmark/* | — | normalisation, peer-scope, **effective-dated RAG**, outliers |
| FR-15 | nl_query_log, embed_token, semantic | /nlq,/embed-tokens,:revoke,/embed/session | §10.8 | confidence gating, provenance, token scope/revocation, no-URL-token |
| FR-16 | dashboard, report_schedule, alert_event | /render?mobile,/briefings | §10.4 | RLS parity, per-recipient briefing, **offline RESTRICTED exclusion** |
| FR-17 | suppression_policy, kpi_snapshot | /suppression-policies | — | **aggregate re-identification harness**, complementary completeness |
| FR-18 | prediction_model (probabilistic), prediction_result, documents | /models:assess-fairness,/predictions/individual | §10.6 | fairness gate, exclusions, **friction-gate**, prohibited-use, NO_PREDICTION |
| FR-19 | establishment_position, MART_ESTABLISHMENT | /establishment/* | — | sanctioned-vs-filled, effective-dated denominator, missing-ref notice |
| FR-20 | data_subject_change, kpi_snapshot, prediction_result, report_execution | /data-subject-changes,:retention-override | §10.9 | propagation completeness, retention override, append-only reconciliation |
| FR-21 | source_data_contract, analytics_datamart | /source-contracts,:test | §10.3 | breaking-change detection, mart hold, co-sign |
| FR-22 | access_anomaly, analytics_access_log | /anomalies,:review,/anomaly-rules | — | off-hours bulk export, scope probing, advisory (non-blocking) |
| FR-23 | kpi_snapshot (bitemporal), report_execution | /value?asOfKnowledge,/history | — | **as-of-knowledge reproduction**, restatement lineage, append-only |

### 14.2 Dependency Graph (phased build order — v2)

**Phase 1 — Foundation (must precede everything):**
1. **FR-21** (source contracts) + **FR-03** (marts/ETL) + **FR-19** (establishment reference) →
2. **FR-04** (RLS + maker-checker) + **FR-17** (metric suppression + scope-leak/re-identification harness) →
3. **FR-02** (KPI engine + effective-dated targets) + **FR-23** (bitemporal) + **FR-12** (freshness + reconciliation explainer) →
4. **FR-01** (dashboards) + **FR-13** (deterministic retirement).

**Phase 2 — Core analytics:**
5. **FR-05**, **FR-06**, **FR-07** (suites) → 6. **FR-08** (builder), **FR-10** (drill) → 7. **FR-09** (export/schedule), **FR-11** (alerts, effective-dated), **FR-14** (benchmark).

**Phase 3 — Advanced (deferred, highest-risk):**
8. **FR-18** (probabilistic predictive + fairness gate), **FR-20** (DPDP propagation) → 9. **FR-15** (NL confidence-gated + hardened embed), **FR-16** (mobile/briefing + offline policy), **FR-22** (anomaly detection).

> Rationale (council E/C/D): build the RLS rewriter + scope-leak/re-identification harness against one real mart (`MART_HEADCOUNT`) before any dashboard; ship deterministic retirement early; defer NL/embed and probabilistic ML to Phase 3.

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Contracts, data layer & establishment | FR-21, FR-03, FR-19 | start |
| B: Security & metric privacy | FR-04, FR-17 | A |
| C: Metric, freshness & temporal | FR-02, FR-12, FR-23 | B |
| D: Surfaces | FR-01, FR-08, FR-10, FR-13 | C |
| E: Analytics suites | FR-05, FR-06, FR-07 | C |
| F: Distribution & alerting | FR-09, FR-11, FR-14 | D, E |
| G: Advanced predictive & DPDP | FR-18, FR-20 | C, E |
| H: NL/embed, mobile & anomaly | FR-15, FR-16, FR-22 | D, F |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Role-based dashboards | FR-01,16 | yes | yes | yes | yes | none |
| KPI definitions (versioned, effective-dated targets) | FR-02,14 | yes | yes | yes | yes | none |
| Analytics data layer / mart / ETL | FR-03 | yes | yes | yes | yes | none |
| **Source data contracts / schema-drift** | FR-21 | yes | yes | yes | yes | none |
| Row-level security mirroring RBAC + **maker-checker** | FR-04 | yes | yes | yes | yes | none |
| **Metric-level privacy / complementary suppression** | FR-17 | yes | yes | n/a | yes | none |
| Workforce analytics (**establishment-pinned vacancy**) | FR-05,19 | yes | yes | n/a | yes | none |
| **Establishment / position reference** | FR-19 | yes | yes | n/a | yes | none |
| Operational analytics | FR-06 | yes | yes | n/a | yes | none |
| Compliance & statutory (establishment-pinned roster) | FR-07 | yes | yes | n/a | yes | none |
| Self-service report builder | FR-08 | yes | yes | n/a | yes | none |
| Scheduled distribution & export | FR-09 | yes | yes | yes | yes | none |
| Drill-down & drill-through (permissioned, suppressed) | FR-10 | yes | yes | n/a | yes | none |
| Alerting/thresholds (effective-dated) | FR-11 | yes | yes | yes | yes | none |
| Data-freshness + **role-adaptive + reconciliation explainer** | FR-12 | yes | yes | yes | yes | none |
| **Deterministic retirement forecasting** | FR-13 | yes | yes | yes | yes | none |
| Benchmarking & comparative (effective-dated RAG) | FR-14 | yes | yes | n/a | yes | none |
| NL query (confidence-gated) & **hardened embed** | FR-15 | yes | yes | yes | yes | none |
| Mobile & executive briefing (**offline policy**) | FR-16 | yes | yes | yes | yes | none |
| **Probabilistic predictive + fairness + friction-gate** | FR-18 | yes | yes | yes | yes | none |
| **DPDP rectification/erasure propagation** | FR-20 | yes | yes | yes | yes | none |
| **Access-anomaly detection** | FR-22 | yes | yes | n/a | yes | none |
| **Bitemporal / as-of-knowledge reproducibility** | FR-23 | yes | yes | n/a | yes | none |
| Reads across M01–M13 (read-only, contracted) | FR-03,05,06,07,21 + §8.5 | yes | yes | n/a | yes | none |
| Audit of view/drill/export (async, anomaly-monitored) | FR-01,09,10,22 + E16 | yes | yes | n/a | yes | none |

**Result: 0 unresolved gaps.** Every module capability — plus every council adopted improvement (R1–R16 + world-class additions) — maps to at least one FR with entities, APIs, states (where stateful), and tests.

---

## 15. Glossary

| Term | Definition |
|---|---|
| KPI | A governed, versioned metric definition computed consistently across surfaces; every snapshot stamps `kpi_version` + `definition_hash` |
| Data mart | A purpose-built, pre-aggregated analytical dataset derived read-only from source modules via a data contract |
| Source data contract | A versioned promise of a source module's schema/semantics consumed by a mart, CI-tested (Debezium CDC) |
| Semantic model | Business-friendly mapping of names/dimensions to physical mart columns used by the builder and NL query |
| RLS | Row-Level Security — query-time filtering of rows to a user's permitted scope (maker-checker governed) |
| Complementary suppression | Hiding additional cells so a suppressed small-cell value cannot be recovered by subtracting visible totals |
| Bitemporal snapshot | A snapshot carrying both valid-time (period described) and knowledge-time (when known) |
| As-of-knowledge | A read parameter returning the value as it was known at a given instant, for audit reproducibility |
| Watermark-relative reconciliation | Comparing a mart at watermark W to the source as of the same watermark W, not wall-clock now |
| Effective-dated target | A KPI target/threshold valid for a date range; target-vs-actual uses the value in force for the shown period |
| Establishment / position reference | The named source of record for sanctioned strength and roster points (FR-19); vacancy/reservation denominator |
| Friction-gate | A deliberate action + purpose prompt + RESTRICTED authority + audit required to open an individual predictive score |
| Model card | A published description of a predictive model's purpose, features, exclusions, fairness assessment, and prohibited use |
| Adverse-impact testing | Disparate-impact evaluation across protected groups, required before a probabilistic model activates |
| DPDP propagation | Pipeline that pushes a PII correction/erasure across marts, snapshots, predictions, and export artefacts |
| Role-adaptive language | Freshness/KPI copy rendered plainly for leaders and technically for operators/auditors |
| Reconciliation explainer | A user panel explaining why a number differs from the source (as-of, watermark, in-flight correction) |
| Embed token | A scoped, signed, expiring, revocable credential presented via header/code-exchange (never URL), CSP frame-ancestors-restricted |
| Access anomaly | A detected deviation in analytics access (bulk export, scope probing) raised for review |
| Advisory output | A predictive/estimated figure labelled non-authoritative, never written to source, never the sole basis for action |
| Drill-through | Navigating from an analytics leaf to the authoritative source record (read-only, permissioned) |

---

## 16. Appendices

### 16.1 Mart Catalog (illustrative)

| Mart | Type | Grain | Sources (contracted) | Refresh | Freshness SLA |
|---|---|---|---|---|---|
| MART_HEADCOUNT | AGGREGATE | employee×org_unit×period | M01 | INCREMENTAL | 60 min |
| MART_ESTABLISHMENT | DIMENSION | position×org_unit (sanctioned/roster) | M14-EST (FR-19) | ON_DEMAND | daily |
| MART_LEAVE_FACT | FACT | leave_application | M03,M04 | CDC (Debezium) | 30 min |
| MART_ATTENDANCE_FACT | FACT | attendance_day | M03 | CDC (Debezium) | 30 min |
| MART_PAYROLL_COST | AGGREGATE | org_unit×component×period | M10 (locked) | INCREMENTAL | daily |
| MART_TRAINING | AGGREGATE | employee×competency×period | M07 | INCREMENTAL | daily |
| MART_APPRAISAL | AGGREGATE | org_unit×rating×cycle | M08 | INCREMENTAL | daily |
| MART_DISCIPLINARY | FACT | case | M09 | INCREMENTAL | hourly |
| MART_PIPELINE | FACT | transfer/promotion case | M05,M06 | INCREMENTAL | hourly |
| MART_PENSION_FORECAST | AGGREGATE | employee×horizon | M11 | daily | daily |
| MART_SR_STATUS | FACT | employee SR verification | M12 | INCREMENTAL | hourly |
| MART_WORKFLOW_SLA | FACT | workflow_task | Workflow engine | CDC (Debezium) | 15 min |
| MART_RESERVATION | AGGREGATE | org_unit×category×roster_point | M01 + MART_ESTABLISHMENT | daily | daily |

### 16.2 KPI Calculation Reference (illustrative)

| KPI | Definition |
|---|---|
| HEADCOUNT_ACTIVE | `COUNT(employee_id) WHERE employment_status='ACTIVE'` at scope/period |
| ATTRITION_RATE | `leavers_in_window / avg_headcount_in_window × 100` (excludes internal transfers) |
| VACANCY_PCT | `(sanctioned − filled) / sanctioned × 100` by cadre/post; **sanctioned from establishment_position (FR-19)** |
| RETIREMENT_DUE_COUNT | `COUNT(employee_id) WHERE retirement_date BETWEEN now AND now+horizon` (deterministic) |
| MANDATORY_TRAINING_PCT | `completed_mandatory / required_mandatory × 100` |
| RESERVATION_COMPLIANCE_PCT | `filled_against_category / sanctioned_for_category × 100` vs roster points (establishment-pinned) |
| PENDING_SLA_BREACH | `COUNT(workflow_task) WHERE status='PENDING' AND age > sla_threshold` (effective-dated SLA) |
| ABSENTEEISM_RATE | `lwp_days / scheduled_days × 100` at scope/period |

### 16.3 Freshness State Semantics (dual-register — v2)

| State | Technical meaning (operators/auditors) | Plain-language label (leaders/employees) | UI |
|---|---|---|---|
| FRESH | Within freshness SLA | "Up to date" | Green chip |
| STALE | Past SLA, last good served | "Numbers are a bit behind — source still updating" | Amber chip + tooltip |
| DEGRADED | Sustained watermark-relative variance / partial load | "Some figures may be off while we reconcile" | Amber/red + warning |
| FAILED | Refresh failed; last good retained | "Latest update didn't complete — showing the last good figures" | Red banner + icon |
| NO_DATA | Never refreshed / empty | "No data yet" | Grey |

### 16.4 Privacy & Suppression Policy (extended to metrics — v2)

- Small-cell suppression default `k=5` (per-KPI/per-policy override) applied to **KPI tiles, charts, exports, AND drill-through** — not drill-through alone.
- **Complementary suppression**: when a cell is suppressed, complementary cells are suppressed so the value cannot be recovered by subtracting visible totals, including across overlapping scopes and across this-period-vs-last-period differencing.
- RESTRICTED fields (salary, individual ratings, disciplinary detail, **individual predictive scores**) masked unless explicit field grant; individual predictive scores additionally friction-gated (FR-18).
- View/drill/export of RESTRICTED data always audited (full fidelity) with row counts; suppression decisions are deterministic so trends remain stable.
- The aggregate re-identification (differencing-attack) test harness is a launch gate (§13.4).

### 16.5 Predictive Fairness & Governance Policy (v2)

- **Protected/correlated exclusions:** caste/reservation category, gender, disability status, and maternity-linked leave proxies are excluded from probabilistic model features.
- **Pre-activation gate:** model card published; adverse-impact/disparate-impact testing recorded; `fairness_status ∈ {PASSED, WAIVED_WITH_REASON}` (DPO co-sign); methodology + intended_use + prohibited_use present.
- **Prohibited use:** an individual score must not be the sole or primary basis for any administrative action; this clause is displayed wherever the score appears.
- **Friction-gate:** individual scores require a deliberate action, a stated purpose, RESTRICTED authority, and a full-fidelity audit entry; aggregate/banded distributions are open to authorised scope.
- **Drift:** detected drift freezes a model's results read-only pending re-assessment.

### 16.6 DPDP Rectification/Erasure Reconciliation (v2)

- Append-only ledgers are reconciled with erasure via **restriction/redaction + bitemporal knowledge-versioning**, never by deleting historical audit rows.
- Where statutory retention (e.g., pension) overrides erasure, the change is `BLOCKED_RETENTION` with a recorded `legal_basis`, and the data is restricted from rendering rather than deleted.
- Export artefacts in M13 are marked `REDACTED` and regenerated where lawful; predictions are purged; affected snapshots are restated as new knowledge-versions.

### 16.7 Embed & NL Security Policy (v2)

- Embed credentials are presented via header or short-lived code-exchange — **never** in a URL path/query; tokens are issued maker-checker, scoped, signed, expiring, revocable, and rotatable; `Content-Security-Policy: frame-ancestors` is enforced from the token's allow-list; scope is re-validated per render.
- NL query uses a **named on-prem LLM hosted at the CGG Data Centre** (no HR prompt/data egress); intent is mapped only to the governed semantic model; below the confidence threshold the assistant clarifies or refuses; every interpretation + confidence + outcome is logged to `nl_query_log` for misinterpretation audit.

### 16.8 Assumptions Log

- Marts refresh read-only from contracted source views / Debezium CDC; M14 never writes source tables.
- RBAC + org hierarchy is authoritative for scope; M14 mirrors, never redefines; RLS/embed mutations are maker-checked.
- Payroll/cost analytics use locked snapshots only.
- Predictive outputs are advisory, fairness-governed, friction-gated, and never recorded against source modules.
- Sanctioned strength/roster points come from the establishment/position reference (FR-19), the named denominator authority.
- Snapshots are bitemporal; corrections create knowledge-versions; DPDP changes propagate across the estate reconciled with retention.
- Single legal entity; mart schema is entity-aware for future multi-entity.
- Per ADR-01, only the governed core holds DB credentials; charting/export/scheduling/NL-orchestration are adopted libraries over governed result sets.

---

*BRD v2.0 — Dashboard and Analytics (M14-DAS). Incorporates all 21 adopted council improvements and mitigates Risk Register R1–R16; audit-fatal risks R1, R3, R4, R6, R9 resolved as concrete requirements/controls. 23 FRs, 24 owned entities, 0 unresolved gaps.*
