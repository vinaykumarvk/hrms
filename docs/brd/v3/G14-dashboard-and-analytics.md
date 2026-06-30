# Dashboard and Analytics — Government HRMS Module BRD (G14, v3.0 · platform-grounded)

**Module code:** G14 (alias GOV-M14; was `M14-DAS` in v2) — see `MODULE_RECONCILIATION.md` §B.
**Program:** Government / Public-Sector HRMS, delivered as a **configuration and extension of the existing PrimeSoft HRMS platform** (not a greenfield build — `PLATFORM_FOUNDATION.md` §1).
**Platform relationship:** **EXTEND / REUSE of PrimeSoft M16 Reports & Analytics** (`MODULE_RECONCILIATION.md` §A row G14). G14 reuses the existing role-scoped dashboards + pre-built reports surface and the `analytics.*` menu entitlement (Foundation §6; RBAC §2.1 Org-Admin cross-entity); it **adds** public-sector KPIs and statutory dashboards (reservation-roster compliance, SR verification status, pension forecasting, disciplinary aging) as extensions — it does **not** fork a parallel reporting module.
**Source of truth:** `PLATFORM_FOUNDATION.md` (platform build contract) + `MODULE_RECONCILIATION.md` (G14 row, §C overrides, §D net-new). These **supersede** the invented `SHARED_FOUNDATION.md` conventions referenced by v2.
**Document version:** v3.0 (platform re-grounded). Preserves all v2.0 content and rigor (23 FRs, 24 owned analytics artefacts, all council amendments R1–R16 + world-class additions), re-anchored onto PrimeSoft P01–P06 / X.1–X.3 / W.1–W.3 and RBAC v1.7.
**Status:** Draft for Gate A review.
**Authoritative platform artefacts consumed by id:** Master BRD v2.1 · Product Vision v2.6 · Platform Specification v1.6 (P01–P06, X.1–X.3, W.1–W.3) · RBAC Design v1.7 · Foundation FS v1.6 (API conventions, VAL-*, JOB-* index, MSG-*/ERR-* catalogue, menu entitlement).

> **Reading note.** v3 re-grounds v2 without losing rigor. The biggest re-anchors: (1) **row-level security is now the platform P02 mechanism** — `deny-by-default → role grant → multi-role INTERSECTION → individual entitlement → capability flag → PII Protection Ceiling → data scope filter (RBAC §3.6 dimensions) → field mask on serialization` — replacing the invented parallel RLS rewriter; (2) **analytics access audit is P05** (`audit_log` + `security_audit_log`, DB-trigger, immutable, 7-yr); (3) reads cross **G01–G13 by reference** through read-model marts; (4) refresh/detection jobs register on **X.1** as `JOB-G14-*`; (5) notifications/alerts route through **X.2 / W.3** as `MSG-G14-*`; (6) the surface **reuses PrimeSoft M16** + `analytics.*` rather than forking. Government-specific capabilities the platform genuinely lacks — metric-level complementary suppression, bitemporal snapshots, the establishment/position denominator, DPDP analytics-estate propagation, predictive fairness governance — are marked **`GAP (gov-specific)`** and authored here, but still run on the platform engines.

---

## 1. Executive Summary

### 1.1 Purpose

The Dashboard and Analytics module (**G14**) is the **cross-module intelligence layer** of the government HRMS. It **extends PrimeSoft M16 Reports & Analytics**: it reuses the platform's role-scoped dashboard/report surface and `analytics.*` entitlement, and reads from every government transactional module (**G01–G13**) plus the platform engines, transforming raw operational data into governed, version-controlled metrics presented through **role-based dashboards**, **workforce and operational analytics**, **compliance & statutory dashboards**, and a **self-service report builder**. G14 is the single place where a leader, an HR officer, a department head, an auditor, or an employee sees "the numbers" — and every number is **defined once, computed consistently, permission-scoped by P02, temporally honest, fairness-audited, rectifiable, and traceable back to the source record**.

G14 owns **no transactional master data**. It defines and owns only its **analytics artefacts**: dashboards, widgets, KPI definitions (with effective-dated targets), saved views, saved reports, report schedules, alert rules, embed tokens, source data contracts, an establishment/position reference, predictive models with model cards, and an **analytics data layer** (semantic model, data marts, materialised views, bitemporal snapshot store, and an ETL/refresh pipeline registered on X.1). It **does not enforce its own row-level security** — it **calls the platform `Authorization.check` (P02)** so every analytics read inherits the platform scope filter (RBAC §3.6 dimensions) and field mask on serialization, with the PII Protection Ceiling overriding everything upward. On top of P02 it layers a **gov-specific metric-level complementary suppression** so that the same dashboard shows a manager only their span, an HR officer only their delegated units, and an executive the whole entity — without leaking a single record beyond permission **and without re-identifying individuals through aggregate arithmetic**.

### 1.2 Business Context and Problem Statement

Public-sector HR leadership today reconstructs the workforce picture from spreadsheets exported out of disconnected systems: headcount that disagrees between payroll and the establishment register, reservation-roster compliance computed by hand, retirement bulges discovered too late, SLA breaches invisible until an audit, and "the same KPI" calculated three different ways. PrimeSoft already ships a role-scoped reporting surface (M16) with the `analytics.*` entitlement and Org-Admin cross-entity reach; what the government context additionally needs is **public-sector KPIs and statutory dashboards** (reservation roster, SR verification, cadre/seniority, retirement profiling, pension pipeline, disciplinary aging) and a **governed metric layer** with full lineage, freshness transparency, **bitemporal reproducibility** (the "June report" reads the same in September), drill-through to the authoritative record, and a **reconciliation explainer** that answers "why does this number differ from what Payroll told me?" on screen. G14 delivers these as **extensions of M16**, reusing the platform's reporting, RBAC-scoped analytics, audit, notification, and job infrastructure rather than rebuilding them.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | One governed definition per metric | 100% of dashboard tiles resolve to a registered `kpi_definition`; zero ad-hoc inline formulae in production |
| G2 | Permission-scoped truth **via P02** | Every analytics read calls `Authorization.check`; an automated test proves no role sees a record outside its P02 scope filter |
| G3 | Consistency with sources | KPI recomputation against source modules reconciles **at the same watermark** within per-KPI tolerance; reconciliation report shows 0 unexplained variance |
| G4 | Freshness transparency | Every dashboard and report shows an explicit `data_as_of` timestamp and staleness state in **role-adaptive language**; no silent stale data |
| G5 | Self-service on the M16 surface | HR/department users build, save, schedule, and export reports without IT tickets, within the `analytics.*` entitlement |
| G6 | Statutory compliance visibility | Reservation roster, mandatory training, SR verification (read from **G12**), and SLA dashboards available to authorised roles with audit-grade exports, pinned to a **named establishment/position source of record** |
| G7 | Forward-looking insight, fairly governed | Retirement forecasting (deterministic) ships early; attrition/succession is advisory, **fairness-audited, friction-gated, prohibited as a sole administrative basis**, and Phase-staged |
| G8 | Performance at scale | Dashboard LCP < 2.5s on pre-aggregated marts; read-heavy report APIs p95 < 1000ms uncached / < 300ms cached (platform NFR §8.2) for a 100k+ employee entity |
| G9 | Temporal honesty | Every snapshot is bitemporal (valid-time + knowledge-time); an "as-of-knowledge" report reproduces exactly what was shown historically |
| G10 | Rectifiability under DPDPA | A correction/erasure in G01 (or a DPDP data-principal request) propagates to marts, snapshots, predictions, and export artefacts within SLA, reconciled against statutory retention; audit erasure is the P05 redaction-marker path |

### 1.4 Scope Summary

In scope (as **extensions of M16**, on platform engines): role-based dashboard framework with KPI tiles/charts/drill-down; governed, versioned, **effective-dated-target** KPI definition & calculation engine; the analytics data layer (semantic model, data marts, materialised views, **bitemporal snapshots**, ETL refresh registered on **X.1**, **watermark-relative reconciliation**, freshness tracking); **permission-scoped access enforced by P02** plus **gov-specific metric-level complementary suppression**; workforce analytics; per-module operational analytics; compliance & statutory dashboards pinned to a named **establishment/position reference**; self-service report builder; scheduled report distribution & multi-format export (PDF/Excel/CSV) via the platform job runner; drill-through to source records (permission-gated through P02); alerting/thresholds/KPI targets (effective-dated) routed via **X.2/W.3**; data-freshness indicators with **role-adaptive language** and a **reconciliation explainer**; **deterministic retirement forecasting**; **probabilistic attrition/succession with a fairness gate and friction-gated individual scores** (Phase-staged); benchmarking; natural-language query (confidence-gated, provenance-logged, P03-aligned grounding) & embedded BI (hardened transport via **X.3** conventions, revocation); mobile/executive dashboards (offline RESTRICTED-data policy); **DPDP rectification/erasure propagation**; **source data contracts**; and **access-anomaly detection over the P05 ledger**.

Out of scope (owned elsewhere): all transactional capture and writes (G01–G13 own their data; G14 reads only); the **operational RBAC catalogue and authentication (platform — P02/RBAC v1.7; G14 consumes, never re-authors)**; the **workflow engine (P01)**; the **audit substrate (P05)**; document storage internals (G13 — G14 references generated export objects); the statutory **SR ledger writes (G12)**. G14 **never mutates source records**; drill-through opens the owning module's record view read-only. The **adjudication** of reservation-roster decisions and the **authoring** of sanctioned-strength values remain establishment/administration functions; G14 hosts the establishment reference and reports compliance but does not approve posts.

### 1.5 Key Stakeholders

Employee (self-service), Reporting Manager (Manager L1–L5/HOD per RBAC §2.3), HR Administrator (`hr_admin`), Department Head / Appointing Authority, Executive / Leadership (CEO-equivalent), **Auditor (mapped to Org-Admin read access + a read-only entitlement — RBAC §3.2, P05 query access; not a parallel write role)**, **Analytics Administrator (existing platform module-admin role, RBAC §2.2, holds `analytics.*`)**, Data Engineer (ETL/mart operator — expressed as an analytics capability flag), **Establishment Officer (new gov role — `MODULE_RECONCILIATION.md` §C / RBAC §4.3 addition)**, **Data Protection Officer (DPO — governs `consent_records`/erasure, RBAC §3.2 + P05)**, Organisation Admin (`org_admin`, cross-entity), Platform Super Admin (`platform_super_admin`, cross-tenant).

### 1.6 Success Criteria

G14 is "successful" when: it runs on the **existing M16 surface + `analytics.*` entitlement** (no parallel reporting module); every published dashboard tile maps to a governed KPI; **all analytics reads are P02-enforced** and pass scope-leak **and aggregate re-identification** tests; freshness is visible on every surface in role-appropriate words; snapshots are bitemporal and an audit "as-of-knowledge" reproduces history exactly; HR and department users self-serve reports and schedules; statutory dashboards are live, exportable, and pinned to a named establishment source; predictive views carry model cards, fairness assessments, and prohibited-use clauses with friction-gated individual access; NL query refuses below confidence and logs its interpretation; embed tokens are revocable and never travel in URLs; DPDP corrections/erasures propagate across the analytics estate reconciled with statutory retention; the metric layer reconciles to the sources at watermark within published tolerance; **every view/export/drill/config/individual-prediction/DPDP event is captured by P05** (with a partitioned read-access ledger feeding it) — and **`tenant_id`/`entity_id` scoping is enforced at the data layer on every analytics entity** (Org Admin cross-entity, Platform Super Admin cross-tenant).

---

## 1A. Amendments (v1 → v2)

*(Preserved from v2 for traceability — every adopted council improvement; risk IDs reference the council Risk Register. v3 re-grounds the **mechanism** of several of these onto the platform; see the new `## Amendments (v2 → v3: platform re-grounding)` table at the end.)*

| # | Adopted improvement (council) | Risk | Where/how incorporated in v2 |
|---|---|---|---|
| 1 | Metric-level privacy / complementary suppression on tiles, charts & exports | R1 (Critical) | **FR-G14-17**; entity **E24 `suppression_policy`**; DI rule 15; errors `SMALL_CELL_SUPPRESSED` (extended to aggregate reads) + `COMPLEMENTARY_SUPPRESSION_APPLIED`; §16.4; launch gate §13.4 |
| 2 | Bitemporal snapshots + as-of-knowledge reproducibility | R3 (Critical) | **FR-G14-23**; **E04 `kpi_snapshot`** gains `valid_time`/`knowledge_time`/`is_superseded`; DI rule 6 & 12; API `asOfKnowledge` param |
| 3 | Stamp KPI version + definition hash on every snapshot | R2 (High) | **E04** gains `kpi_version`, `definition_hash`; FR-02 AC7/BR5; error `CROSS_VERSION_AGGREGATION_BLOCKED` |
| 4 | Predictive fairness governance | R4 (Critical) | **FR-G14-18**; **E14 `prediction_model`** fairness fields; state table §10.6; error `MODEL_FAIRNESS_ASSESSMENT_REQUIRED` |
| 5 | Friction-gate individual predictive scores | R4 (Critical) | FR-G14-18 AC4/AC5; access action `VIEW_INDIVIDUAL_PREDICTION`; error `PREDICTION_INDIVIDUAL_GATED` |
| 6 | Split deterministic vs probabilistic | E/Reviewer-3 | **FR-G14-13** deterministic retirement (Phase 1); **FR-G14-18** probabilistic (Phase 3, fairness-gated) |
| 7 | Maker-checker + SoD on RLS policy & embed tokens | R6 (Critical) | FR-04/FR-15; **v3: SoD now enforced by P01/P02, not a bespoke engine**; **E18 `embed_token`**; error `RLS_POLICY_REQUIRES_CHECKER` |
| 8 | Async, partitioned audit-on-read | R5 (High) | §8.1; **E16** gains `log_fidelity`; **v3: mirrors into P05** `audit_log`/`security_audit_log` |
| 9 | Watermark-relative reconciliation | R7 (High) | DI rule 11 & FR-03 AC5; §10.3 guard |
| 10 | Name establishment / position-management source | R8 (High) | **FR-G14-19**; entity **E21 `establishment_position`**; mart `MART_ESTABLISHMENT`; error `ESTABLISHMENT_REFERENCE_MISSING` |
| 11 | DPDP rectification/erasure propagation | R9 (Critical) | **FR-G14-20**; entity **E22 `data_subject_change`**; DI rule 16; **v3: reconciled with P05 redaction-marker + `consent_records`**; errors `ERASURE_PROPAGATION_PENDING`, `RETENTION_OVERRIDE_BLOCKS_ERASURE` |
| 12 | Harden embed transport | R10 (High) | FR-15; **E18 `embed_token`**; **v3: runs on X.3 outbound conventions**; error `EMBED_TOKEN_REVOKED` |
| 13 | Source data contracts + CDC named | R11 (High) | **FR-G14-21**; entity **E19 `source_data_contract`**; CDC = **Debezium**; error `SOURCE_CONTRACT_VIOLATION` |
| 14 | NL-query confidence gating, provenance, named LLM | R12 (Med-High) | FR-15; entity **E20 `nl_query_log`**; **v3: grounded on P03 guardrails (PII stripped server-side, informational-only)**; errors `NLQ_CONFIDENCE_TOO_LOW`, `NLQ_CLARIFICATION_REQUIRED` |
| 15 | Effective-dated targets & thresholds | R13 (Medium) | entity **E17 `kpi_target_history`**; **v3: reuses platform effective-dating (VAL-EFFECTIVE pattern)** |
| 16 | Mobile/offline RESTRICTED-data policy | R14 (Medium) | FR-16 (encrypted cache, exclude RESTRICTED offline, expiry, remote-wipe) |
| 17 | Hybrid build-vs-buy ADR | R15 | **§4.1 ADR-01**: governed core built; charting/layout/export/scheduler/NL-orchestration adopted, never hold DB credentials |
| 18 | Phase the scope; trim consumption widget palette | R15 | §14.2/§14.3 Phase 1/2/3 |
| 19 | Role-adaptive (dual-register) language | R16 (Low-Med) | FR-12; §16.3 |
| 20 | Access-anomaly detection | World-class | **FR-G14-22**; entity **E23 `access_anomaly`**; **v3: detects over the P05-mirrored partitioned ledger** |
| 21 | User-facing reconciliation explainer | D | FR-12 + `/reconciliation-explainer` |

**FR count:** v1 = 16 → v2/v3 = **23 FRs** (FR-G14-01…16 retained/amended; 17…23 new).
**Owned analytics-artefact count:** v1 = 16 → v2/v3 = **24** (E01–E16 retained/amended; E17–E24 new). All now carry `tenant_id`/`entity_id`.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Dashboard Framework & Layout | G14-F01 | Role-based dashboards (on the M16 surface), widget catalog, layout/personalisation, saved views |
| KPI Definition & Calculation | G14-F02 | Governed, versioned, **effective-dated-target** KPI registry; calculation/derivation engine |
| Analytics Data Layer | G14-F03 | Semantic model, data marts, materialised views, ETL refresh (X.1 jobs), **watermark-relative reconciliation**, freshness tracking |
| Permission-Scoped Access & Governance | G14-F04 | **Analytics reads enforced by platform P02** (scope filter + field mask + PII ceiling); policy/scope changes administered via RBAC admin surface + P01; **gov metric-level suppression layered on top (F17)** |
| Workforce Analytics | G14-F05 | Headcount, demographics, diversity, attrition, **establishment-pinned vacancy**, cadre, age/retirement, span of control |
| Operational Analytics (per module) | G14-F06 | Leave/absenteeism, attendance, payroll cost/overtime, training, appraisal, disciplinary, transfer/promotion, pension |
| Compliance & Statutory Dashboards | G14-F07 | Reservation roster (establishment-pinned), mandatory training, SR verification (read G12), pending approvals/SLA breaches |
| Self-Service Report Builder | G14-F08 | Ad-hoc query designer, saved reports, field/filter/aggregation selection |
| Scheduled Distribution & Export | G14-F09 | Report schedules (X.1), PDF/Excel/CSV export, bursting, delivery via X.2 |
| Drill-Down & Drill-Through | G14-F10 | Hierarchy drill, P02-gated drill-through to source records |
| Alerting, Thresholds & Targets | G14-F11 | Effective-dated KPI targets/thresholds, alert rules, triggered alert events (X.2/W.3) |
| Data Freshness & Stale-Data UX | G14-F12 | `data_as_of` surfacing, staleness states, **role-adaptive language**, **reconciliation explainer**, degraded-mode |
| Deterministic Retirement Forecasting | G14-F13 | DOB + canonical-rule retirement profiling (Phase 1) |
| Benchmarking & Comparative Analytics | G14-F14 | Period-over-period, peer org-unit, **effective-dated** target vs actual |
| Natural-Language Query & Embedded BI | G14-F15 | Confidence-gated NL-to-query (P03-aligned grounding); **hardened, revocable** embeddable widgets (X.3) |
| Mobile & Executive Dashboards | G14-F16 | Responsive/mobile dashboards, executive briefing pack, **offline RESTRICTED-data policy** |
| Metric-Level Privacy & Complementary Suppression | G14-F17 | **`GAP (gov-specific)`** small-cell + complementary suppression on tiles/charts/exports |
| Probabilistic Predictive Analytics & Fairness Governance | G14-F18 | **`GAP (gov-specific)`** attrition/succession risk, model cards, adverse-impact testing, friction-gated scores |
| Establishment & Position Reference Integration | G14-F19 | **`GAP (gov-specific)`** sanctioned strength, roster points, position master as the named denominator source |
| DPDP Rectification & Erasure Propagation | G14-F20 | **`GAP (gov-specific)`** propagate corrections/erasures across the analytics estate (reconciled with P05 + retention) |
| Source Data Contracts & Schema-Drift Protection | G14-F21 | Versioned source views, CI contract tests, breaking-change alerts (Debezium CDC) |
| Access-Anomaly Detection | G14-F22 | Proactive detection over the P05-mirrored access ledger (bulk export, scope probing) |
| Bitemporal Snapshot & As-Of-Knowledge Reproducibility | G14-F23 | **`GAP (gov-specific)`** valid-time + knowledge-time snapshots; audit reproduction of historical figures |

### 2.2 Common Capabilities (inherited from the PrimeSoft platform)

All G14 features inherit, **by id, from the platform** (not from the invented `SHARED_FOUNDATION`): `tenant_id`/`entity_id` on every table with **data-layer scoping** (Platform §0.1); UUID PKs + human business keys; standard audit via **P05 DB-trigger capture** (no bespoke `audit_log`); UTC storage / locale display; `DD-MMM-YYYY` dates; INR default with i18n money formatting; **cursor pagination** (`limit` default 25, max 100, `next_cursor`; Foundation §1); **`Authorization.check` (P02)** on every data-bearing endpoint; the **canonical error envelope + 8-code table** (Foundation §1); **`documents` (G13)** for generated export artefacts; **`notifications` via X.2/W.3** for alerts and scheduled-report delivery; **`Idempotency-Key`** on unsafe POSTs; **`X-Correlation-Id`** on every request, echoed and written to every audit/log line. Maker-checker on **publishing** KPI definitions, enterprise/statutory dashboards, **analytics scope-policy changes, embed-token issuance, and predictive-model activation** is a **configured P01 flow with SoD enforced by P02** (no self-approval), not a bespoke engine.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In G14? | Owner / Note |
|---|---|---|
| Employee master data | Read only (via mart) | **G01** golden source (PrimeSoft M01 master extended) |
| Leave / attendance facts | Read only | **G03** (PrimeSoft M04/M05) — G14 aggregates |
| SR events & verification status | Read only | **G12** owns the statutory ledger (on P05 substrate); G14 reports status, never writes SR |
| Payroll cost / overtime facts | Read only | **G10** (post-lock snapshots only; roadmap, extends PrimeSoft M06/M07) |
| Appraisal ratings / disciplinary cases | Read only | **G08 / G09** |
| Transfer / promotion pipeline | Read only | **G05 / G06** |
| Pension forecasting inputs | Read only | **G11** (G14 visualises forecasts) |
| Document storage | Reference | **G13** stores export objects; G14 creates refs |
| **Operational RBAC catalogue & authentication** | **Consume (P02/RBAC v1.7)** | Platform; G14 calls `Authorization.check`, never mirrors into a parallel RLS engine |
| **Workflow / maker-checker** | **Consume (P01)** | Configured flows; SoD by P02 |
| **Audit substrate** | **Consume (P05)** | Dual log, DB-trigger, immutable, 7-yr; G14 adds a read-access ledger that mirrors into it |
| **Sanctioned strength / posts / roster points** | **In — `GAP (gov-specific)` hosted reference (FR-19)** | No G01–G13 module owns posts; Establishment Officer authors values, G14 reports compliance |
| **Source-to-mart data contracts** | **In (owned, FR-21)** | Each source module co-signs its schema promise |
| **DPDP rectification/erasure across analytics estate** | **In (owned pipeline, FR-20)** | G01/DPO trigger; G14 propagates to derived copies; audit erasure via P05 redaction marker |
| Editing a source record | Out | Drill-through is read-only |
| KPI / dashboard / report definitions | In (owned) | G14 owns analytics artefacts (extending M16) |
| ETL / marts / materialised views / bitemporal snapshots | In (owned) | G14 owns the analytics layer; jobs on X.1 |
| Adjudicating reservation/roster decisions or approving posts | Out | Establishment/administration function |

### 2.4 Assumptions and Constraints

- G14 reads sources through a **governed mart layer** fed by **versioned source data contracts (FR-21)** and **Debezium CDC**, refreshed on schedules **registered on X.1 as `JOB-G14-*`**; it does **not** issue ad-hoc cross-joins against live OLTP for dashboard rendering. Marts are **read models, not forks of owning-module tables**.
- The **platform RBAC v1.7 + org hierarchy is authoritative**; G14 derives scope **by calling P02 per request** and never invents its own access model. **Scope-policy and embed-token mutations are maker-checked as P01 flows with SoD enforced by P02.**
- All sensitive financial figures (payroll cost, salary) are sourced from **locked/finalised** snapshots only.
- Reservation-roster, cadre, and seniority logic uses the **same canonical reference data** as the owning modules; **sanctioned strength and roster points come from the establishment/position reference (FR-19)**.
- Predictive models are **advisory** (mirroring P03's informational-only posture); outputs are labelled estimates with methodology, **fairness assessment, and a prohibited-use clause**; **individual scores are friction-gated**.
- Money math in marts uses fixed-point decimal; aggregates round at presentation only.
- **Multi-tenant**: every analytics table carries `tenant_id` (non-nullable) and, where entity-scoped, `entity_id`; a query without a resolvable tenant scope is **rejected, not defaulted to "all"** (Platform §0.1). Cross-entity reach = Org Admin; cross-tenant = Platform Super Admin.
- **Snapshots are bitemporal**: corrections create new knowledge-versions rather than mutating history (FR-23). Audit erasure uses the **P05 redaction marker**, the only permitted audit mutation.
- **Reconciliation is watermark-relative** (FR-03).
- **The analytics estate is a controlled second copy of personal data** with a rectification/erasure pipeline (FR-20) reconciled against statutory retention and `consent_records` (Platform §P05).

---

## 3. Roles & Permissions

### 3.1 Module Roles (mapped to RBAC v1.7 — ADDITIONS, never a parallel scheme)

Per `PLATFORM_FOUNDATION.md` §6 and `MODULE_RECONCILIATION.md` §C, government actors map to the existing RBAC taxonomy + new roles/capability flags; the invented v2 role list is overridden. Role-based dashboards are delivered through the **existing role taxonomy + the `analytics.*` entitlement**; gov dashboard roles are **added capability flags**.

| Role | Maps to RBAC v1.7 | G14 responsibility |
|---|---|---|
| Employee (Self-Service) | Employee (RBAC §2.4) | View own personal dashboard; no aggregate/other-employee data |
| Reporting Manager | Manager L1–L5 / HOD (RBAC §2.3) | Team dashboard scoped to direct + indirect reports (P02 reporting-chain dimension); drill-through to own team |
| HR Administrator | `hr_admin` (RBAC §2.2 superset operational role) | Operate dashboards/reports scoped to delegated org units (P02 `org_unit`/UAG dimensions); build/save/schedule; drill-through within scope |
| Department Head / Appointing Authority | HOD + Appointing Authority (new gov role, §6.6) | Department-wide analytics for owned subtree; approve department dashboard publication (P01) |
| Executive / Leadership | CEO (RBAC §2.2) | Entity-wide dashboards, predictive & benchmarking, executive briefing pack; read-only |
| **Auditor (read-only)** | **Org-Admin audit access + read-only entitlement (RBAC §3.2, P05 query access)** — *not a parallel write role* | Read all dashboards/reports cross-module + the access/anomaly ledger; no write |
| **Analytics Administrator** | **`Analytics Admin` (existing module-admin, RBAC §2.2; holds `analytics.*`)** | Steward KPI definitions, widget catalog, dashboard templates, alert rules, **suppression policy**; publish (checker) governed metrics; review anomalies |
| Data Engineer | **Analytics capability flag** on an IT/Analytics admin role (RBAC §4.3) | Operate ETL/mart refresh (X.1), monitor freshness/reconciliation, manage source data contracts; no dashboard publication authority |
| **Establishment Officer** (new gov role) | **New entity-scoped role + capability flag, registered RBAC §4.3/§2.2** | Author/maintain `establishment_position`; values feed vacancy/reservation denominators; no dashboard publication |
| **Data Protection Officer (DPO)** | **DPO per Platform §P05 / RBAC §3.2 (audit + consent governance)** | Govern `data_subject_change` (rectification/erasure), approve retention overrides, audit propagation completeness |
| Organisation Admin | `org_admin` (RBAC §2.1) | Cross-entity consolidated analytics; administers analytics scope policy via cfg-rbac (written to `security_audit_log`) |
| Platform Super Admin | `platform_super_admin` (RBAC §2.1) | Cross-tenant reach (provisioning/migration only) |

> **SoD:** maker ≠ checker and no self-approval are **enforced by P01/P02**, not re-implemented. The "System Administrator" of v2 is **mapped to Org Admin / Platform Super Admin** (RBAC §2.1); it has no transactional self-approval.

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Publish, X=No access)

> Every cell is additionally **scoped by P02** (deny-by-default → role grant → multi-role INTERSECTION → individual entitlement → capability flag → **PII Protection Ceiling** → data scope filter (RBAC §3.6 dimensions) → field mask on serialization) **and** metric-level suppressed (FR-17). A role grant never overrides the P02 scope filter or the PII ceiling; the effective dataset is the intersection of capability grant, P02 data scope, and privacy threshold.

| Capability | Employee | Manager | HR Admin | Dept Head | Executive | Auditor | Analytics Admin | Data Engineer | Establ. Officer | DPO | Org/Platform Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Own personal dashboard | R | R | R | R | R | R | R | R | R | R | R |
| Team/scoped aggregate dashboard | X | R(team) | R(scope) | R(dept) | R(entity) | R(all) | R(all) | R | X | R(all) | R(cross-entity) |
| Enterprise/leadership dashboard | X | X | X | R(dept) | R | R | R | X | X | R | R |
| Compliance/statutory dashboard | X | X | R(scope) | R(dept) | R | R | R | X | R(estab) | R | R |
| KPI definition | X | X | X | X | X | R | C/U/A | R | X | R | R |
| Widget/dashboard template | X | X | R | R | R | R | C/U/A | X | X | X | R |
| Saved view (personal) | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U | C/U |
| Saved report (shared) | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | X | R | R |
| Report schedule | X | C(team) | C/U | C/U | C/U | X | C/U | X | X | X | R |
| Export (PDF/Excel/CSV) | R(own) | R(team) | R(scope) | R(dept) | R(entity) | R(all) | R(all) | X | R(estab) | R | R |
| Drill-through to source record | own | team | scope | dept | per-perm | R(all) | per-perm | X | X | R(all) | per-perm |
| **Individual predictive score (friction-gated)** | X | X | R(scope, gated) | R(dept, gated) | R(gated) | R(all, gated) | R(gated) | X | X | R | X |
| Aggregate/banded predictive distribution | X | X | R(scope) | R(dept) | R | R | R/U(config) | X | X | R | R |
| Alert rule / threshold | X | C(team) | C/U | C/U | C/U | R | C/U/A | X | X | X | R |
| Predictive/benchmark views | X | X | R(scope) | R(dept) | R | R | R/U(config) | X | X | R | R |
| ETL / mart refresh control (X.1) | X | X | X | X | X | R(status) | R | C/U | X | X | R |
| **Source data contract** | X | X | X | X | X | R | R | C/U/A | X | X | R |
| **Establishment / position reference** | X | X | R | R | R | R | R | X | C/U | R | R |
| **Analytics scope policy (maker-checker via P01; admin via cfg-rbac)** | X | X | X | X | X | R | A(checker) | X | X | R | C/U(maker, Org Admin) |
| **Embed-BI token (maker-checker via P01)** | X | X | X | X | X | R | A(checker) | X | X | X | C/U(maker) |
| **DPDP rectification/erasure (`data_subject_change`)** | X | X | X | X | X | R | R | R(exec) | X | C/U/A | R |
| **Access-anomaly queue** | X | X | X | R(dept) | R | R | R/U | X | X | R | R |
| Analytics access/export audit (P05 query) | X | X | X | R(dept) | R | R | R | X | X | R | R |

---

## 4. Shared Application Foundation (consumed from PrimeSoft, not redefined)

G14 inherits the platform foundation **by id**; the invented `SHARED_FOUNDATION` §5 conventions are overridden per `MODULE_RECONCILIATION.md` §C.

- **Architecture:** Physical stack is an engineering choice **within the platform's logical architecture** (BRD §1; `MODULE_RECONCILIATION.md` §C) — G14 specifies behaviour/NFR, not framework. A dedicated **analytics schema** (marts + materialised views + **bitemporal snapshot store** + **partitioned read-access ledger**) sits beside the OLTP schema; `documents` (G13) holds generated export files. Deployment target (CGG Data Centre / gov cloud) is a deployment-model choice (Vision §1.4 Standalone/Group Company), not a re-architecture. The dashboard/report surface is the **existing M16 menu entitlement** (`analytics.*`, Foundation §6).
- **Auth:** Bearer-token (JWT) session carrying resolved roles + tenant/entity scope (Platform §0.2); **MFA enforced by default for HR Admin/Org Admin** and high-privilege gov roles. **`Authorization.check` (P02) is the only access decision point** — analytics endpoints never re-implement permission logic.
- **Canonical error envelope (Foundation §1 / BRD §6.2):** `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "field": "...", "details": { } } }`; the correlation id is the **`X-Correlation-Id` response header**, not a body `requestId`.
- **Standard error codes (Foundation §1, 8-code table):** `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `CONFLICT(409)`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)` + module-unique `ERR-G14-*` (§8.3, registered in Foundation §5). **No 503 in the standard table** — upstream/mart failures map via X.3 to `INTERNAL(500)` + `ERR-LOADFAIL`, or `PRECONDITION_FAILED(412)` where a precondition (e.g. mart health) is unmet.
- **Security/compliance:** OWASP, TLS 1.2+, encryption at rest, **P05 audit (incl. view/export events for sensitive analytics)**, PII minimisation, DPDP Act 2023 alignment (incl. rectification/erasure propagation FR-20 reconciled with the P05 redaction marker + `consent_records`), statutory retention ≥ 7 years.
- **NFR baseline (platform §8.2, overrides invented NFR):** read-heavy/report APIs p95 < 300ms cached / < 1000ms uncached; write ops p95 < 1500ms; **web page load (LCP, 4G) < 2.5s**; **99.5%/month uptime** (not 99.9%); **RTO < 4h, RPO < 1h** (not 15 min); WCAG 2.1 AA; responsive 375/768/1280px, touch ≥ 44×44px; no hard delete (soft delete only). Analytics-specific NFRs in §9.

**Shared/platform entities referenced (not redefined):** `employees`, `users`, `org_units`, `designations`, `cadres`, `pay_scales` (G01/platform); `roles`, `permissions`, capability flags, entitlements (RBAC v1.7); `service_register_events` (**G12** gov ledger on the P05 substrate); `documents` (G13); `notifications` (X.2); `audit_log` + `security_audit_log` (**P05**); `workflows`/`workflow_instances`/`workflow_actions` (**P01**); `consent_records` (P05/DPDPA); `integration_credentials` (P04, used by X.3). G14 reads facts owned by G01–G13 through the mart layer and references export objects in `documents`.

### 4.1 ADR-01 — Hybrid Build-vs-Buy (council §4, R15) — re-grounded

**Decision:** G14 is a **hybrid stack on the PrimeSoft platform**. The governed data-access core is **built as M16 extensions**; commodity presentation/distribution machinery is **adopted** and never touches the marts directly; **all access enforcement is delegated to P02, all audit to P05, all workflow to P01, all jobs to X.1, all notifications to X.2/W.3, all outbound integration to X.3.**

| Layer | Build / Buy / Platform | Rationale |
|---|---|---|
| **Governed KPI registry + DSL + versioning** (E03/E04, FR-02) | **Build** (`GAP`) | Differentiated; no off-the-shelf equivalent meets the governance bar |
| **Permission-scoped access** (FR-04) | **Platform (P02)** | **v3 change:** reuse `Authorization.check` — no bespoke query-rewriter; field masking applied on serialization by P02 |
| **Metric-level complementary suppression** (FR-17) | **Build** (`GAP (gov-specific)`) | Platform P02 stops record leakage but does **not** stop aggregate re-identification; this is the genuine gov gap layered on top of P02 |
| **Freshness / reconciliation** (FR-12, FR-03) | **Build** | Cross-cutting correctness contract |
| **Cross-module drill-through authz** (FR-10) | **Platform (P02) + Build orchestration** | The cross-module permission decision is a live `Authorization.check`; G14 orchestrates |
| **Access/audit ledger** (E16) | **Platform (P05) + Build read-ledger** | Read events mirror into P05; the partitioned async ledger is a build optimisation feeding P05 |
| **Bitemporal snapshot store** (FR-23) | **Build** (`GAP (gov-specific)`) | Statutory reproducibility primitive |
| Chart rendering, grid/layout, PDF/XLSX/CSV export | **Buy/adopt** | Commodity; receive already-scoped (P02), already-masked, already-suppressed, already-freshness-stamped result sets |
| Scheduler / job runner | **Platform (X.1)** | Jobs register `{job_id, schedule, tenant_scope}` against the runner |
| Notification delivery | **Platform (X.2/W.3)** | Templates by `MSG-G14-*` id |
| NL-to-query LLM orchestration | **Buy/adopt + P03-aligned guardrails** | Orchestration adopted; **semantic mapping + P02 scope rewrite remain built**; PII stripped server-side; informational-only |
| Embed renderer / outbound | **Buy/adopt over X.3 conventions** | Thin renderer over governed result sets; credentials per P04 `integration_credentials` |

**Binding constraint (unchanged, re-grounded):** only the built governed core holds analytics-DB credentials, and **every result set it emits has already passed `Authorization.check` (P02 scope + field mask), suppression (FR-17), and freshness-stamping** before any adopted library (charting, export, scheduler, NL orchestrator, embed renderer) sees it. No adopted library can reach a mart or the OLTP sources.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

G14 **owns** the analytics artefacts E01–E24 (each carrying `tenant_id`/`entity_id`). It **references** the platform/source entities listed at the end and never redefines them.

| # | Entity | Owner | Purpose |
|---|---|---|---|
| E01 | `dashboard` | G14 | A named, role-targeted dashboard (canvas of widgets) on the M16 surface |
| E02 | `dashboard_widget` | G14 | A tile/chart/table bound to a KPI or query |
| E03 | `kpi_definition` | G14 | Governed, versioned metric definition |
| E04 | `kpi_snapshot` | G14 | **Bitemporal**, version-stamped KPI value time-series |
| E05 | `saved_view` | G14 | A user's saved filter/layout state |
| E06 | `saved_report` | G14 | A reusable report-builder definition |
| E07 | `report_schedule` | G14 | Schedule + recipients + format (run on X.1) |
| E08 | `report_execution` | G14 | A single run of a report/export |
| E09 | `analytics_datamart` | G14 | Registry of marts/materialised views (read models) |
| E10 | `datamart_refresh_log` | G14 | ETL/refresh run log per mart |
| E11 | `analytics_scope_policy` | G14 | **v3: binds a mart to the P02 scope dimensions** (was `rls_scope_policy`); enforcement is P02, change is maker-checked via P01 |
| E12 | `alert_rule` | G14 | KPI threshold/target rule that emits alerts (X.2) |
| E13 | `alert_event` | G14 | A triggered alert occurrence |
| E14 | `prediction_model` | G14 | Registered predictive model with model card + fairness assessment |
| E15 | `prediction_result` | G14 | Per-entity predictive score |
| E16 | `analytics_access_log` | G14 | **Async, partitioned read-access ledger that mirrors into P05** |
| E17 | `kpi_target_history` | G14 | **Effective-dated** KPI targets & alert thresholds |
| E18 | `embed_token` | G14 | Scoped, signed, **revocable/rotatable** embed credential (X.3) |
| E19 | `source_data_contract` | G14 | Versioned source-view contract per module mart |
| E20 | `nl_query_log` | G14 | NL query, resolved interpretation, confidence (P03-aligned) |
| E21 | `establishment_position` | G14 | **`GAP (gov-specific)`** sanctioned strength / roster points / position master |
| E22 | `data_subject_change` | G14 | DPDP rectification/erasure propagation request & state |
| E23 | `access_anomaly` | G14 | Detected anomalous access pattern (over the P05-mirrored ledger) |
| E24 | `suppression_policy` | G14 | **`GAP (gov-specific)`** k-anonymity + complementary suppression config |

> **v3 entity note.** Every entity below adds two non-nullable platform columns — **`tenant_id`** (and **`entity_id`** where entity-scoped) — with **data-layer scoping** (Platform §0.1); they are omitted from each field table for brevity but are mandatory and indexed. Audit fields are captured by **P05 DB triggers** (no per-entity `audit_log`).

### 5.2 Full Field Tables (G14-owned entities)

*(All tables additionally carry `tenant_id` non-nullable + `entity_id` where entity-scoped; audit via P05 triggers.)*

#### E01 `dashboard`

| Field | Type | Null | Notes |
|---|---|---|---|
| `dashboard_id` | UUID PK | N | |
| `dashboard_code` | TEXT unique (per tenant) | N | e.g. `EXEC_WORKFORCE`, `MGR_TEAM` |
| `name` | TEXT | N | display name |
| `description` | TEXT | Y | |
| `target_role` | ENUM | N | maps to RBAC roles: EMPLOYEE, MANAGER, HR_ADMIN, DEPT_HEAD, EXECUTIVE, AUDITOR, ANALYTICS_ADMIN |
| `category` | ENUM | N | PERSONAL, WORKFORCE, OPERATIONAL, COMPLIANCE, EXECUTIVE, CUSTOM |
| `layout_json` | JSONB | N | grid/responsive layout |
| `default_filters_json` | JSONB | Y | default period/org filters |
| `is_system` | BOOL | N | system template vs user-created |
| `status` | ENUM | N | DRAFT, PUBLISHED, ARCHIVED |
| `published_by` | UUID FK→users | Y | checker (P01 flow) |
| `published_at` | TIMESTAMPTZ | Y | |

#### E02 `dashboard_widget`

| Field | Type | Null | Notes |
|---|---|---|---|
| `widget_id` | UUID PK | N | |
| `dashboard_id` | UUID FK→dashboard | N | |
| `title` | TEXT | N | |
| `widget_type` | ENUM | N | KPI_TILE, LINE, BAR, PIE, DONUT, TABLE, HEATMAP, GAUGE, FUNNEL, MAP, TEXT (consumer palette defers MAP/FUNNEL — §14) |
| `kpi_id` | UUID FK→kpi_definition | Y | bound KPI |
| `query_ref` | UUID FK→saved_report | Y | alternative bound query |
| `dimensions_json` | JSONB | Y | group-by dimensions |
| `filters_json` | JSONB | Y | widget-level filters |
| `drilldown_path_json` | JSONB | Y | ordered drill hierarchy |
| `drillthrough_target` | TEXT | Y | owning-module record route template (read-only) |
| `position_json` | JSONB | N | x/y/w/h on grid |
| `refresh_hint` | ENUM | N | LIVE, MART, CACHED |
| `show_plain_definition` | BOOL | N | render plain-language KPI definition on the tile (default true for consumer dashboards) |
| `display_order` | INT | N | |

#### E03 `kpi_definition`

| Field | Type | Null | Notes |
|---|---|---|---|
| `kpi_id` | UUID PK | N | |
| `kpi_code` | TEXT | N | e.g. `HEADCOUNT_ACTIVE` (unique per active version/tenant) |
| `name` | TEXT | N | |
| `description` | TEXT | N | audience-readable; rendered on consumer tiles |
| `plain_language_note` | TEXT | Y | leader-friendly "what counts / what doesn't" |
| `domain` | ENUM | N | WORKFORCE, LEAVE, ATTENDANCE, PAYROLL, TRAINING, APPRAISAL, DISCIPLINARY, TRANSFER, PROMOTION, PENSION, COMPLIANCE, SR |
| `version` | INT | N | versioned definition |
| `definition_hash` | TEXT | N | SHA-256 of (expression+grain+dimensions+source); stamped onto every snapshot |
| `source_mart_id` | UUID FK→analytics_datamart | N | mart the KPI reads |
| `expression` | TEXT | N | safe aggregation DSL (whitelisted functions/columns) |
| `unit` | ENUM | N | COUNT, PERCENT, RATIO, CURRENCY, DAYS, SCORE |
| `grain` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE, PERIOD, ENTERPRISE |
| `default_period` | ENUM | Y | DAY, WEEK, MONTH, QUARTER, YEAR, ROLLING_12M |
| `dimensions_allowed` | TEXT[] | Y | dimensions this KPI may be sliced by |
| `reconciliation_target` | TEXT | Y | owning-module object the count reconciles against |
| `reconciliation_tolerance` | NUMERIC(10,4) | Y | per-KPI tolerance (counts default 0 at watermark) |
| `direction` | ENUM | Y | HIGHER_BETTER, LOWER_BETTER, ON_TARGET (target via E17) |
| `min_cell_size` | INT | Y | per-KPI k override for suppression (FR-17) |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED — drives the **P02 field-mask / PII ceiling** |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | checker (≠ created_by; P01) |

> Target migrated to the effective-dated `kpi_target_history` (E17), reusing the platform effective-dating pattern (VAL-EFFECTIVE, Foundation §1/§3).

#### E04 `kpi_snapshot` (bitemporal, version-stamped — `GAP (gov-specific)`)

| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `kpi_version` | INT | N | definition version that produced this value |
| `definition_hash` | TEXT | N | hash of the producing definition |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE, MANAGER |
| `scope_id` | TEXT | Y | org_unit_id / cadre / manager employee_id |
| `period_key` | TEXT | N | e.g. `2026-06`, `FY2026_27` |
| `valid_time` | DATE | N | business period instant the value describes |
| `knowledge_time` | TIMESTAMPTZ | N | when this value became known |
| `is_superseded` | BOOL | N | true when a later knowledge-version restates this row |
| `superseded_by` | UUID FK→kpi_snapshot | Y | the restating row |
| `value` | NUMERIC(18,4) | N | computed value |
| `numerator`/`denominator` | NUMERIC(18,4) | Y | for ratios/percentages |
| `cell_size` | INT | Y | group size behind the value (drives suppression) |
| `data_as_of` | TIMESTAMPTZ | N | freshness watermark of source mart |
| `computed_at` | TIMESTAMPTZ | N | |
| `is_partial` | BOOL | N | computed on stale/partial mart |
| — | — | — | append-only; restatement adds rows (P05-audited), never mutates |

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
| `is_default` | BOOL | N | |
| `visibility` | ENUM | N | PRIVATE, SHARED_SCOPE |

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
| `group_by_json`/`aggregations_json`/`sort_json` | JSONB | Y | grouping / agg / sort |
| `row_limit` | INT | N | hard cap (≤ configured max, default 100000) |
| `min_cell_size` | INT | Y | suppression k for this report's aggregates |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `owner_user_id` | UUID FK→users | N | |
| `visibility` | ENUM | N | PRIVATE, SHARED_SCOPE, PUBLISHED |
| `status` | ENUM | N | DRAFT, ACTIVE, ARCHIVED |

#### E07 `report_schedule` (runs on X.1)

| Field | Type | Null | Notes |
|---|---|---|---|
| `schedule_id` | UUID PK | N | |
| `report_id` | UUID FK→saved_report | N | |
| `job_id` | TEXT | N | **`JOB-G14-REPORT-*` registered on X.1** (Foundation §4) |
| `cron_expr` | TEXT | N | cron (UTC) |
| `timezone` | TEXT | N | delivery tz for display |
| `format` | ENUM | N | PDF, XLSX, CSV |
| `recipients_json` | JSONB | N | user_ids/role/email groups (validated against RBAC via P02) |
| `scope_mode` | ENUM | N | OWNER_SCOPE, PER_RECIPIENT_SCOPE |
| `burst_dimension` | TEXT | Y | e.g. per `org_unit` |
| `delivery_channel` | ENUM | N | EMAIL, IN_APP, BOTH, SFTP (via X.2) |
| `next_run_at`/`last_run_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM | N | ACTIVE, PAUSED, DISABLED |
| `owner_user_id` | UUID FK→users | N | |

#### E08 `report_execution`

| Field | Type | Null | Notes |
|---|---|---|---|
| `execution_id` | UUID PK | N | |
| `report_id` | UUID FK→saved_report | N | |
| `schedule_id` | UUID FK→report_schedule | Y | null = on-demand |
| `triggered_by` | UUID FK→users | Y | null = scheduler |
| `idempotency_key` | TEXT | Y | **per-period run key (X.1 idempotency)** |
| `run_type` | ENUM | N | ON_DEMAND, SCHEDULED, PREVIEW |
| `format` | ENUM | N | PDF, XLSX, CSV |
| `scope_snapshot_json` | JSONB | N | effective **P02** scope at run time |
| `as_of_knowledge` | TIMESTAMPTZ | Y | knowledge-time reproduced (bitemporal) |
| `row_count` | INT | Y | |
| `document_id` | UUID FK→documents (G13) | Y | generated artefact |
| `status` | ENUM | N | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED, REDACTED |
| `error_detail` | TEXT | Y | |
| `data_as_of` | TIMESTAMPTZ | Y | |
| `started_at`/`completed_at` | TIMESTAMPTZ | Y | |

> `REDACTED` set when a DPDP erasure (FR-20) revokes an artefact's lawful basis (reconciled with P05 redaction marker).

#### E09 `analytics_datamart` (read model — not a fork of owning tables)

| Field | Type | Null | Notes |
|---|---|---|---|
| `mart_id` | UUID PK | N | |
| `mart_code` | TEXT unique | N | e.g. `MART_HEADCOUNT` |
| `name` | TEXT | N | |
| `mart_type` | ENUM | N | FACT, DIMENSION, AGGREGATE, MATERIALIZED_VIEW, SEMANTIC |
| `grain` | TEXT | N | |
| `source_modules` | TEXT[] | N | e.g. `{G01,G03,G12}` |
| `source_objects` | TEXT[] | N | **contracted source views (read-only), not raw tables** |
| `contract_id` | UUID FK→source_data_contract | Y | governing data contract |
| `refresh_strategy` | ENUM | N | FULL, INCREMENTAL, CDC, ON_DEMAND |
| `refresh_job_id` | TEXT | Y | **`JOB-G14-MART-*` on X.1** |
| `refresh_cron` | TEXT | Y | |
| `freshness_sla_minutes` | INT | N | |
| `watermark_column` | TEXT | Y | |
| `last_refreshed_at`/`last_watermark_value` | TIMESTAMPTZ/TEXT | Y | |
| `reconcile_grace_minutes` | INT | Y | sustained-variance window before DEGRADED |
| `row_count` | BIGINT | Y | |
| `health_status` | ENUM | N | HEALTHY, STALE, DEGRADED, FAILED |
| `contains_pii` | BOOL | N | drives **P02 RESTRICTED field-mask** handling |

#### E10 `datamart_refresh_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `refresh_id` | UUID PK | N | |
| `mart_id` | UUID FK→analytics_datamart | N | |
| `run_type` | ENUM | N | SCHEDULED, MANUAL, BACKFILL |
| `started_at`/`finished_at` | TIMESTAMPTZ | N/Y | |
| `rows_read`/`rows_written` | BIGINT | Y | |
| `from_watermark`/`to_watermark` | TEXT | Y | |
| `reconcile_variance` | NUMERIC(18,4) | Y | mart-at-watermark vs source-as-of-watermark delta |
| `status` | ENUM | N | RUNNING, SUCCESS, PARTIAL, FAILED |
| `error_detail` | TEXT | Y | terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL` (X.1) |
| `triggered_by` | UUID FK→users | Y | null = scheduler |

#### E11 `analytics_scope_policy` (v3 — binds marts to P02 scope dimensions; was `rls_scope_policy`)

| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_id` | UUID PK | N | |
| `role` | TEXT | N | RBAC v1.7 role this binding applies to |
| `scope_dimensions` | TEXT[] | N | **subset of the five P02 dimensions (RBAC §3.6): reporting_chain, org_unit, UAG, contribution_level, entity** |
| `mart_id` | UUID FK→analytics_datamart | Y | null = all marts |
| `field_sensitivity_map_json` | JSONB | Y | declares which mart columns are RESTRICTED so **P02 applies the field mask on serialization** (G14 does not implement masking itself) |
| `priority` | INT | N | resolution order if multiple apply |
| `version` | INT | N | policy version |
| `status` | ENUM | N | DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, SUPERSEDED |
| `created_by` (maker) | UUID FK→users | N | |
| `approved_by` (checker) | UUID FK→users | Y | ≠ created_by (P01 SoD) |
| `preview_diff_json` | JSONB | Y | before/after exposure diff captured at approval |
| `workflow_instance_id` | UUID FK→workflow_instances | Y | **P01 maker-checker instance** |
| `is_active` | BOOL | N | one ACTIVE per (role,mart) |

> **v3 re-grounding:** this entity **does not enforce** anything. It declares, per mart/role, which P02 scope dimensions and field-sensitivity flags apply; **enforcement is entirely by `Authorization.check` (P02)** at the data layer. Changes are administered through the platform RBAC admin surface (cfg-rbac / cfg-rbac-role, written to `security_audit_log`) and routed through a **P01 maker-checker flow** — replacing the invented standalone RLS engine + bespoke approval workflow.

#### E12 `alert_rule`

| Field | Type | Null | Notes |
|---|---|---|---|
| `rule_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `name` | TEXT | N | |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE, MANAGER |
| `scope_id` | TEXT | Y | |
| `operator` | ENUM | N | GT, GTE, LT, LTE, EQ, NEQ, DELTA_PCT |
| `threshold_ref` | UUID FK→kpi_target_history | Y | effective-dated threshold |
| `threshold` | NUMERIC(18,4) | Y | static fallback |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `evaluation_freq` | ENUM | N | ON_REFRESH, HOURLY, DAILY (X.1 job) |
| `recipients_json` | JSONB | N | RBAC-validated via P02; resolved by W.3 |
| `suppression_window_min` | INT | Y | de-dupe window |
| `hysteresis_pct` | NUMERIC(6,3) | Y | anti-flap band |
| `status` | ENUM | N | ACTIVE, PAUSED, DISABLED |
| `owner_user_id` | UUID FK→users | N | |

#### E13 `alert_event`

| Field | Type | Null | Notes |
|---|---|---|---|
| `event_id` | UUID PK | N | |
| `rule_id` | UUID FK→alert_rule | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `scope_id` | TEXT | Y | |
| `observed_value`/`threshold` | NUMERIC(18,4) | N | threshold = value in force for the period |
| `severity` | ENUM | N | INFO, WARNING, CRITICAL |
| `data_as_of` | TIMESTAMPTZ | N | |
| `is_partial` | BOOL | N | evaluated on stale/partial mart |
| `status` | ENUM | N | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| `acknowledged_by`/`acknowledged_at` | UUID/TIMESTAMPTZ | Y | |
| `notification_id` | UUID FK→notifications (X.2) | Y | |

#### E14 `prediction_model` (model card + fairness — `GAP (gov-specific)`)

| Field | Type | Null | Notes |
|---|---|---|---|
| `model_id` | UUID PK | N | |
| `model_code` | TEXT unique | N | e.g. `ATTRITION_RISK`, `SUCCESSION_RISK` |
| `model_type` | ENUM | N | RULE_BASED, STATISTICAL, ML |
| `determinism` | ENUM | N | DETERMINISTIC, PROBABILISTIC |
| `version` | TEXT | N | |
| `features_json` | JSONB | N | input features |
| `protected_features_excluded` | TEXT[] | N | caste/reservation category, gender, disability, maternity-linked leave proxies |
| `methodology` | TEXT | N | explainable description |
| `model_card_ref` | UUID FK→documents (G13) | Y | published model card |
| `adverse_impact_result` | JSONB | Y | disparate-impact test results + thresholds |
| `fairness_status` | ENUM | N | NOT_ASSESSED, PASSED, FAILED, WAIVED_WITH_REASON |
| `intended_use`/`prohibited_use` | TEXT | N | approved use / "must not be sole/primary basis for any administrative action" |
| `source_mart_ids` | UUID[] | N | |
| `confidence_basis` | TEXT | Y | |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| `approved_by` | UUID FK→users | Y | checker (≠ created_by; P01 + DPO co-sign) |

#### E15 `prediction_result`

| Field | Type | Null | Notes |
|---|---|---|---|
| `result_id` | UUID PK | N | |
| `model_id` | UUID FK→prediction_model | N | |
| `subject_type` | ENUM | N | EMPLOYEE, ORG_UNIT, CADRE |
| `subject_id` | TEXT | N | |
| `score` | NUMERIC(7,4) | N | 0..1 |
| `risk_band` | ENUM | N | LOW, MEDIUM, HIGH, NO_PREDICTION |
| `top_factors_json` | JSONB | Y | explainability drivers |
| `confidence` | NUMERIC(5,4) | Y | |
| `is_individual_gated` | BOOL | N | true for EMPLOYEE-subject rows requiring friction-gate |
| `period_key` | TEXT | N | |
| `data_as_of` | TIMESTAMPTZ | N | |

#### E16 `analytics_access_log` (async, partitioned — mirrors into P05)

| Field | Type | Null | Notes |
|---|---|---|---|
| `access_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `action` | ENUM | N | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY, VIEW_INDIVIDUAL_PREDICTION |
| `target_type` | ENUM | N | DASHBOARD, WIDGET, REPORT, KPI, RECORD, PREDICTION |
| `target_id` | TEXT | Y | |
| `scope_snapshot_json` | JSONB | N | effective **P02** scope at access time |
| `sensitivity` | ENUM | N | PUBLIC, INTERNAL, RESTRICTED |
| `log_fidelity` | ENUM | N | FULL (RESTRICTED/EXPORT/DRILLTHROUGH/NL/individual-prediction), SAMPLED (low-sensitivity VIEW) |
| `purpose_text` | TEXT | Y | purpose prompt captured for friction-gated access |
| `row_count` | INT | Y | |
| `data_as_of` | TIMESTAMPTZ | Y | |
| `correlation_id` | TEXT | N | **`X-Correlation-Id`** |
| `occurred_at` | TIMESTAMPTZ | N | partition key |
| — | — | — | append-only; partitioned by occurred_at; written async; **FULL-fidelity events mirror into P05 `audit_log`/`security_audit_log`** (reading sensitive analytics is itself an audited action, Platform §P05) |

#### E17 `kpi_target_history` (effective-dated — reuses platform effective-dating)

| Field | Type | Null | Notes |
|---|---|---|---|
| `target_id` | UUID PK | N | |
| `kpi_id` | UUID FK→kpi_definition | N | |
| `scope_type` | ENUM | N | ENTERPRISE, ORG_UNIT, CADRE |
| `scope_id` | TEXT | Y | |
| `target_value` | NUMERIC(18,4) | N | |
| `target_kind` | ENUM | N | KPI_TARGET, ALERT_THRESHOLD |
| `effective_from` | DATE | N | **VAL-EFFECTIVE: not before current effective date; future-dating allowed** |
| `effective_to` | DATE | Y | null = open-ended |
| `set_by` | UUID FK→users | N | |
| `status` | ENUM | N | ACTIVE, SUPERSEDED |

#### E18 `embed_token` (hardened — outbound via X.3, credentials via P04)

| Field | Type | Null | Notes |
|---|---|---|---|
| `token_id` | UUID PK | N | opaque id (never the bearer secret) |
| `token_hash` | TEXT | N | hash of signed secret; secret never stored plaintext |
| `widget_ids` | UUID[] | N | scoped widgets/dashboards |
| `subject_user_id`/`subject_role` | UUID/TEXT | Y | bound user or role (P02-scoped) |
| `allowed_frame_ancestors` | TEXT[] | N | CSP frame-ancestors allow-list |
| `issued_by` (maker) | UUID FK→users | N | |
| `approved_by` (checker) | UUID FK→users | Y | ≠ issued_by (P01) |
| `expires_at` | TIMESTAMPTZ | N | short-lived |
| `rotated_from` | UUID FK→embed_token | Y | rotation lineage |
| `status` | ENUM | N | PENDING_APPROVAL, ACTIVE, EXPIRED, REVOKED, ROTATED |
| `revoked_by`/`revoked_at` | UUID/TIMESTAMPTZ | Y | |

#### E19 `source_data_contract`

| Field | Type | Null | Notes |
|---|---|---|---|
| `contract_id` | UUID PK | N | |
| `source_module` | TEXT | N | e.g. `G10` |
| `source_view` | TEXT | N | versioned source view (e.g. `g10.v_payroll_locked_v3`) |
| `version` | TEXT | N | semantic version |
| `schema_json` | JSONB | N | promised columns, types, nullability, semantics |
| `cdc_mechanism` | ENUM | N | DEBEZIUM_CDC, BATCH, ON_DEMAND |
| `breaking_change_policy` | TEXT | N | notice period + alert routing |
| `status` | ENUM | N | DRAFT, ACTIVE, DEPRECATED, BREACHED |
| `last_contract_test_at` | TIMESTAMPTZ | Y | CI verification timestamp |
| `co_signed_by` | UUID FK→users | Y | owning-module steward |

#### E20 `nl_query_log` (P03-aligned grounding & guardrails)

| Field | Type | Null | Notes |
|---|---|---|---|
| `nlq_id` | UUID PK | N | |
| `user_id` | UUID FK→users | N | |
| `question_text` | TEXT | N | raw NL question (**PII stripped server-side before any model call, per P03**) |
| `resolved_kpi_id` | UUID FK→kpi_definition | Y | mapped governed KPI |
| `resolved_filters_json` | JSONB | Y | resolved dimensions/filters |
| `confidence` | NUMERIC(5,4) | N | intent confidence |
| `outcome` | ENUM | N | ANSWERED, CLARIFICATION_REQUESTED, REFUSED_LOW_CONFIDENCE, REFUSED_OUT_OF_SCOPE, REFUSED_UNMODELLED |
| `llm_provider` | TEXT | N | named on-prem LLM (CGG Data Centre; no egress) |
| `data_as_of`/`occurred_at` | TIMESTAMPTZ | Y/N | |

#### E21 `establishment_position` (`GAP (gov-specific)` — named denominator source)

| Field | Type | Null | Notes |
|---|---|---|---|
| `position_id` | UUID PK | N | |
| `position_code` | TEXT unique | N | sanctioned post identifier |
| `org_unit_id` | UUID FK→org_units | N | |
| `cadre` | TEXT | N | |
| `designation_id` | UUID FK→designations | N | |
| `sanctioned_strength` | INT | N | authorised count |
| `reservation_category` | TEXT | Y | roster category |
| `roster_point` | INT | Y | roster point number |
| `filled_by_employee_id` | UUID FK→employees | Y | current occupant (read-link to G01) |
| `effective_from` | DATE | N | sanction effective date (VAL-EFFECTIVE) |
| `effective_to` | DATE | Y | abolition date |
| `status` | ENUM | N | SANCTIONED, FROZEN, ABOLISHED |
| `maintained_by` | UUID FK→users | N | Establishment Officer |

#### E22 `data_subject_change` (DPDP propagation — reconciled with P05 + consent_records)

| Field | Type | Null | Notes |
|---|---|---|---|
| `change_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | subject |
| `change_type` | ENUM | N | RECTIFICATION, ERASURE, RESTRICTION |
| `source_event_ref` | TEXT | N | G01/DPO originating request id (or `consent_records` withdrawal) |
| `requested_by` | UUID FK→users | N | DPO/G01 |
| `legal_basis` | TEXT | Y | retention-override basis if erasure blocked |
| `affected_marts` | TEXT[] | Y | resolved by impact analysis |
| `affected_snapshots`/`affected_predictions`/`affected_exports` | INT | Y | counts restated/purged/REDACTED |
| `status` | ENUM | N | RECEIVED, PROPAGATING, COMPLETED, BLOCKED_RETENTION, FAILED |
| `completed_at` | TIMESTAMPTZ | Y | |

#### E23 `access_anomaly`

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
| `notification_id` | UUID FK→notifications (X.2) | Y | |

#### E24 `suppression_policy` (`GAP (gov-specific)`)

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

### 5.3 Relationship Map

```
dashboard 1───n dashboard_widget ──n─1 kpi_definition 1───n kpi_snapshot (bitemporal, version-stamped)
kpi_definition 1───n kpi_target_history (effective-dated, platform effective-dating)
dashboard_widget ──n─1 saved_report (alt binding)
kpi_definition ──n─1 analytics_datamart ──n─1 source_data_contract ; mart 1───n datamart_refresh_log
saved_report ──n─1 analytics_datamart ;  saved_report 1───n report_schedule (X.1) 1───n report_execution
report_execution ──n─1 documents (G13)
saved_view ──n─1 dashboard | saved_report
analytics_scope_policy ──n─1 analytics_datamart  [declares P02 dimensions; maker-checker via P01; ENFORCED BY P02]
alert_rule ──n─1 kpi_definition ; alert_rule ──n─1 kpi_target_history ; alert_rule 1───n alert_event ──n─1 notifications (X.2)
prediction_model 1───n prediction_result ; prediction_model ──n─1 documents (model card)
embed_token ──n─m dashboard_widget   [issued maker-checker via P01; revocable; outbound via X.3]
nl_query_log ──n─1 kpi_definition (resolved intent; P03 guardrails)
establishment_position ──n─1 org_units ; feeds vacancy & reservation denominators (FR-05/07)
data_subject_change ──> marts / kpi_snapshot / prediction_result / report_execution (propagation; reconciled with P05 + retention)
suppression_policy ──> applied to every aggregate read AFTER P02
access_anomaly ──> derived from analytics_access_log (async, mirrored into P05)
every view/run/export/drillthrough/NL/individual-prediction ──> analytics_access_log (async) ──> P05 audit_log/security_audit_log (FULL fidelity)
marts READ FROM (via source_data_contract): employees(G01), leave/attendance(G03), transfers(G05),
   promotions(G06), training(G07), appraisal(G08), disciplinary(G09), payroll(G10 locked), pension(G11),
   service_register_events(G12), documents(G13)  [READ-ONLY via Debezium CDC / contracted views — read models, not forks]
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `cadres`, `designations`, `pay_scales` | G01/Platform | G14 (via marts) | — |
| Leave/attendance/SR/payroll/training/appraisal/disciplinary/transfer/promotion/pension facts | G03–G12 | G14 (via marts) | — |
| E01–E24 (G14 analytics artefacts) | G14 | Auditors, all roles (P02-scoped) | G14 |
| `establishment_position` (E21) | G14 (hosted, `GAP`) | HR/Dept Head/Exec/Auditor | Establishment Officer (G14) |
| `documents` | G13 | G14 (export/model-card refs) | G14 (creates refs only) |
| `notifications` | Platform (X.2) | G14 | G14 (appends via X.2/W.3) |
| `audit_log` / `security_audit_log` | **Platform (P05)** | G14 (Auditor query) | **P05 DB triggers** (G14 mirrors FULL-fidelity read events) |
| `service_register_events` | **G12** (P05 substrate) | G14 (verification-status reporting) | — (G14 never writes SR) |
| `workflows`/`workflow_instances`/`workflow_actions` | **Platform (P01)** | G14 (maker-checker for KPI/dashboard/scope/embed/model publication) | G14 (raises instances) |

### 5.5 Enum Catalog

| Enum | Values |
|---|---|
| dashboard.target_role | EMPLOYEE, MANAGER, HR_ADMIN, DEPT_HEAD, EXECUTIVE, AUDITOR, ANALYTICS_ADMIN |
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
| **analytics_scope_policy.scope_dimensions** | **reporting_chain, org_unit, UAG, contribution_level, entity (P02/RBAC §3.6)** |
| analytics_scope_policy.status | DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, SUPERSEDED |
| report_schedule.format | PDF, XLSX, CSV |
| report_schedule.scope_mode | OWNER_SCOPE, PER_RECIPIENT_SCOPE |
| report_schedule.delivery_channel | EMAIL, IN_APP, BOTH, SFTP |
| report_schedule.status | ACTIVE, PAUSED, DISABLED |
| report_execution.run_type | ON_DEMAND, SCHEDULED, PREVIEW |
| report_execution.status | QUEUED, RUNNING, COMPLETED, FAILED, EXPIRED, REDACTED |
| alert_rule.operator | GT, GTE, LT, LTE, EQ, NEQ, DELTA_PCT |
| alert.severity | INFO, WARNING, CRITICAL |
| alert_event.status | OPEN, ACKNOWLEDGED, RESOLVED, SUPPRESSED |
| prediction.model_type | RULE_BASED, STATISTICAL, ML |
| prediction.determinism | DETERMINISTIC, PROBABILISTIC |
| prediction.fairness_status | NOT_ASSESSED, PASSED, FAILED, WAIVED_WITH_REASON |
| prediction.risk_band | LOW, MEDIUM, HIGH, NO_PREDICTION |
| access_log.action | VIEW_DASHBOARD, RUN_REPORT, EXPORT, DRILLTHROUGH, NL_QUERY, API_QUERY, VIEW_INDIVIDUAL_PREDICTION |
| access_log.log_fidelity | FULL, SAMPLED |
| view.visibility / report.visibility | PRIVATE, SHARED_SCOPE, PUBLISHED |
| kpi_target_history.target_kind / .status | KPI_TARGET, ALERT_THRESHOLD / ACTIVE, SUPERSEDED |
| embed_token.status | PENDING_APPROVAL, ACTIVE, EXPIRED, REVOKED, ROTATED |
| source_data_contract.cdc_mechanism / .status | DEBEZIUM_CDC, BATCH, ON_DEMAND / DRAFT, ACTIVE, DEPRECATED, BREACHED |
| nl_query_log.outcome | ANSWERED, CLARIFICATION_REQUESTED, REFUSED_LOW_CONFIDENCE, REFUSED_OUT_OF_SCOPE, REFUSED_UNMODELLED |
| establishment_position.status | SANCTIONED, FROZEN, ABOLISHED |
| data_subject_change.change_type / .status | RECTIFICATION, ERASURE, RESTRICTION / RECEIVED, PROPAGATING, COMPLETED, BLOCKED_RETENTION, FAILED |
| access_anomaly.anomaly_type / .status | OFF_HOURS_BULK_EXPORT, SCOPE_EDGE_PROBING, UNUSUAL_DRILLTHROUGH_VOLUME, REPEATED_DENIED, MASS_NL_QUERY / OPEN, INVESTIGATING, DISMISSED, CONFIRMED |
| suppression_policy.applies_to | TILE, CHART, DRILLTHROUGH, EXPORT, ALL |

### 5.6 Data Integrity Rules

1. **Governed metrics only:** every measure-bearing `dashboard_widget` references an `ACTIVE kpi_definition` or `saved_report`; inline formulae rejected at publish.
2. **Single active KPI version:** at most one `ACTIVE kpi_definition` per `kpi_code`; activating a new version RETIRES the prior.
3. **P02 is mandatory (v3):** no analytics query executes without a successful `Authorization.check`; an unresolved scope returns `FORBIDDEN(403)` + `ERR-FORBIDDEN` (never reveals existence of out-of-scope records, never defaults to "all"). G14 never implements its own scope filter — it consumes P02's `scope_filter` + `field_mask`.
4. **Read-only source / read models:** G14 holds **no FK write** into G01–G13 tables; marts are derived read models via contracted views; drill-through is read-only navigation.
5. **Freshness honesty:** every `kpi_snapshot`, `report_execution`, and rendered widget carries `data_as_of`; STALE/DEGRADED/FAILED marts flag `is_partial=true`.
6. **Snapshot reproducibility (bitemporal):** `kpi_snapshot` keyed by `(kpi_id, kpi_version, scope, period_key, knowledge_time)`. Restatement adds a new `knowledge_time` row and marks the prior `is_superseded=true`; never mutates. `asOfKnowledge` read returns the latest `knowledge_time ≤ T` (FR-23).
7. **Export lineage:** every COMPLETED `report_execution` has a `document_id` (G13) and a matching `analytics_access_log` EXPORT row (mirrored to P05) with `row_count`.
8. **Sensitivity gating (v3):** a RESTRICTED field is masked **by P02 on serialization** (FR-P02-002) — an over-broad query cannot leak it; the **PII Protection Ceiling overrides everything upward**.
9. **Recipient validity:** `report_schedule`/`alert_rule` recipients validated against current RBAC + scope **via P02** at run time; out-of-scope recipients dropped and logged.
10. **SoD on publication (v3 — P01/P02):** maker ≠ checker for `kpi_definition` activation; `dashboard` publication of COMPLIANCE/EXECUTIVE; `analytics_scope_policy` create/update; `embed_token` issuance; `prediction_model` activation. Each routes through a **P01 `workflow_instance`** with SoD enforced by P02 — no bespoke approval engine.
11. **Watermark-relative reconciliation:** mart value at watermark W compared to source as-of-W; variance beyond per-KPI tolerance, sustained beyond `reconcile_grace_minutes`, flags DEGRADED and alerts (X.2). Transient CDC lag does not flag DEGRADED.
12. **Append-only with bitemporal restatement:** `analytics_access_log`, `datamart_refresh_log`, `kpi_snapshot` are append-only; correctness preserved by adding knowledge-versions (rule 6), not mutation — consistent with the **P05 immutability contract**.
13. **Prediction labelling & governance:** every `prediction_result` in UI/exports labelled advisory with `model_id`/`version`/`confidence`/`data_as_of`; probabilistic models require `fairness_status=PASSED` (or WAIVED_WITH_REASON) + published model card before activation; individual scores friction-gated; never written back; never the sole/primary basis for any administrative action.
14. **Bounded outputs:** all list/report endpoints **cursor-paginated (limit default 25, max 100, `next_cursor`)**; reports respect `row_limit`; over-cap exports chunk or reject with `ERR-G14-EXPORT-LIMIT`.
15. **Metric-level privacy (`GAP`):** every aggregate read applies `suppression_policy` **after P02**: cells with `cell_size`/denominator `< k` are suppressed/banded, and complements across overlapping scopes/periods suppressed so a hidden cell cannot be recovered by subtraction. Annotated `ERR-G14-SMALL-CELL` / `ERR-G14-COMP-SUPPRESS`.
16. **DPDP rectifiability (`GAP`):** a `data_subject_change` propagates to marts, `kpi_snapshot` (restated bitemporally or restricted), `prediction_result` (purged), `report_execution` artefacts (REDACTED in G13); reconciled with statutory retention; audit erasure uses the **P05 redaction marker** (the only permitted audit mutation). Where retention legally overrides erasure → `status=BLOCKED_RETENTION` with recorded `legal_basis`.
17. **Effective-dated targets:** target-vs-actual and RAG use the `kpi_target_history` value covering the shown period (VAL-EFFECTIVE), never today's value for a past period.
18. **Embed-token transport:** embed credential never accepted in a URL; presented in a header or exchanged from a short-lived code; revocable/rotatable; re-validated per render; CSP `frame-ancestors` enforced (outbound on X.3).

### 5.7 Sample Data (illustrative; tenant_id/entity_id omitted)

**dashboard**

| dashboard_code | name | target_role | category | status |
|---|---|---|---|---|
| EXEC_WORKFORCE | Executive Workforce Overview | EXECUTIVE | EXECUTIVE | PUBLISHED |
| MGR_TEAM | My Team Dashboard | MANAGER | OPERATIONAL | PUBLISHED |
| COMP_RESERVATION | Reservation Roster Compliance | DEPT_HEAD | COMPLIANCE | PUBLISHED |

**kpi_definition**

| kpi_code | name | domain | version | unit | grain | direction | sensitivity | status |
|---|---|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | Active Headcount | WORKFORCE | 3 | COUNT | ORG_UNIT | ON_TARGET | INTERNAL | ACTIVE |
| ATTRITION_RATE | Attrition Rate (rolling 12M) | WORKFORCE | 2 | PERCENT | ORG_UNIT | LOWER_BETTER | INTERNAL | ACTIVE |
| VACANCY_PCT | Vacancy % (sanctioned vs filled) | WORKFORCE | 1 | PERCENT | CADRE | LOWER_BETTER | INTERNAL | ACTIVE |

**kpi_snapshot** (bitemporal)

| kpi_code | kpi_version | scope_type | scope_id | period_key | valid_time | knowledge_time | value | is_superseded | cell_size |
|---|---|---|---|---|---|---|---|---|---|
| HEADCOUNT_ACTIVE | 3 | ORG_UNIT | OU-DIST-12 | 2026-06 | 2026-06-30 | 2026-07-01T02:00Z | 1842 | false | 1842 |
| HEADCOUNT_ACTIVE | 3 | ORG_UNIT | OU-DIST-12 | 2026-05 | 2026-05-31 | 2026-09-10T02:00Z | 1839 | false | 1839 |

*(The second row is a September restatement of May after a backdated correction; the original May row is retained with `is_superseded=true`.)*

**analytics_scope_policy** (v3 — declares P02 dimensions)

| role | scope_dimensions | mart_id | status | created_by | approved_by |
|---|---|---|---|---|---|
| MANAGER | {reporting_chain} | (all) | ACTIVE | org_admin | analytics_admin |
| HR_ADMIN | {org_unit, UAG} | (all) | ACTIVE | org_admin | analytics_admin |
| EXECUTIVE | {entity} | (all) | PENDING_APPROVAL | org_admin | (awaiting, P01) |

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

**data_subject_change**

| employee_id | change_type | status | affected_snapshots | legal_basis |
|---|---|---|---|---|
| e-2044 | RECTIFICATION | COMPLETED | 36 | — |
| e-3091 | ERASURE | BLOCKED_RETENTION | 0 | Pension statutory retention 7y |

---

## 6. Functional Requirements

> FR-G14-01…16 carried forward from v1/v2 with platform re-grounding; FR-G14-17…23 new. Each FR retains ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a full LLD table. All endpoints are under **`/api/v1/analytics`** (cursor pagination; `Authorization.check` via P02; `X-Correlation-Id`; canonical error envelope). The surface is the **existing M16 `analytics.*` entitlement**.

### FR-G14-01 — Role-Based Dashboard Framework & Layout Engine

- **Module:** G14-F01
- **Primary Role(s):** Analytics Administrator (build/publish), all roles (consume, P02-scoped)
- **User Story:** As an Analytics Administrator, I want to compose role-targeted dashboards on the M16 surface from a widget catalog and publish them, so each persona lands on a relevant, governed, permission-scoped home view.
- **Description:** A dashboard authoring/rendering engine extending M16. A `dashboard` is a responsive grid of `dashboard_widget`s bound to a governed KPI or saved report. Dashboards are role-targeted (RBAC roles) and category-tagged; users personalise via `saved_view`. Publication of COMPLIANCE/EXECUTIVE dashboards is a **P01 maker-checker flow**. Rendering always calls **P02** for scope + field mask, applies **metric-level suppression (FR-17)**, and freshness in role-adaptive language (FR-12). Every consumer KPI tile renders the plain-language definition.
- **Acceptance Criteria:**
  - AC1: An admin can create a dashboard, add catalog widgets, arrange on a responsive grid, save as DRAFT.
  - AC2: Publishing a COMPLIANCE/EXECUTIVE dashboard requires a checker (`published_by ≠ created_by`) via P01; others may self-publish within authority.
  - AC3: A consuming user sees only widgets P02 permits; unauthorised widgets are omitted (not shown empty); P02 never reveals existence of out-of-scope data.
  - AC4: A user can save a personal `saved_view` and set it default without modifying the template.
  - AC5: Each rendered dashboard shows a global `data_as_of` and per-widget freshness in role-adaptive language.
  - AC6: Every dashboard view writes an `analytics_access_log` (VIEW_DASHBOARD) entry asynchronously; FULL-fidelity events mirror into P05.
  - AC7: Every consumer KPI tile displays the governed plain-language definition inline or on a one-tap info affordance.
- **Business Rules:**
  - BR1: A measure-bound widget must reference an ACTIVE `kpi_definition`/`saved_report`; orphaned bindings block publication.
  - BR2: A dashboard cannot publish if any bound KPI is RETIRED/DRAFT.
  - BR3: Personalisation is per-user.
  - BR4: Archiving preserves `saved_view`s read-only for audit.
  - BR5: Consumer dashboards default to the trimmed palette (no MAP/FUNNEL); authoring catalog retains them.
- **Data Model References:** `dashboard`, `dashboard_widget`, `kpi_definition`/`saved_report` (bindings), `saved_view`, `suppression_policy`, `analytics_access_log` (→ P05).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/dashboards` | create dashboard |
| POST | `/api/v1/analytics/dashboards/{id}/widgets` | add widget |
| POST | `/api/v1/analytics/dashboards/{id}:publish` | publish (P01 checker) |
| GET | `/api/v1/analytics/dashboards/{id}/render` | render P02-scoped, suppressed data |
| POST | `/api/v1/analytics/saved-views` | save personal view |

- **UI Behavior Notes:** Drag-and-drop grid editor; live preview against own P02 scope; per-widget freshness badge (role-adaptive); plain-language KPI note on tiles; "Save as my view". Publish disabled for makers on gated categories.
- **Edge Cases:** Bound KPI retired after publish (placeholder + steward alert); user with no P02 scope sees explanatory empty state; suppressed tile shows "below privacy threshold".
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DashboardController`, `WidgetCatalogService`, `DashboardRenderer`, `SavedViewService`, `LayoutValidator`, `SuppressionDecorator` |
| Backend Flow | Validate layout/bindings → persist DRAFT → on publish raise **P01 instance** for gated categories + binding-active checks → on render call **`Authorization.check` (P02)** for scope_filter + field_mask, fan-out widget queries to marts, apply suppression, attach freshness, assemble; enqueue async access-log (→ P05) |
| Data Operations | INSERT/UPDATE dashboard/widget; INSERT saved_view; SELECT from marts (P02-filtered, suppressed); async INSERT access_log |
| Validation | Binding existence/active; layout schema; category publish authority (P02); unique dashboard_code per tenant |
| Authorization | **P02**: Analytics Admin author; checker publish (P01); consumer scoped render |
| State Changes | dashboard DRAFT→PUBLISHED→ARCHIVED; async access_log + P05 mirror |
| Failure Handling | Orphan binding → `CONFLICT(409)` `ERR-G14-WIDGET-BINDING`; maker publish gated → `FORBIDDEN(403)` `ERR-G14-PUBLISH-CHECKER`; mart down → degraded per FR-12; small group → `ERR-G14-SMALL-CELL` |
| Dependencies | FR-02 (KPI), FR-04 (P02 scope), FR-12 (freshness), FR-17 (suppression); P01, P05 |
| Test Guidance | Publish SoD (P01); P02 scope-omits-widget; saved-view isolation; freshness badge; plain-language render; suppressed tile |

---

### FR-G14-02 — KPI Definition & Calculation Engine (Versioned, Effective-Dated Targets)

- **Module:** G14-F02
- **Primary Role(s):** Analytics Administrator (define + approve via P01)
- **User Story:** As an Analytics Administrator, I want to define KPIs once — formula, grain, dimensions, sensitivity, with versioning, effective-dated targets, and approval — so every dashboard/report computes the same number the same way.
- **Description:** Maintains the `kpi_definition` registry + a deterministic calculation engine. Targets are effective-dated in `kpi_target_history` reusing the **platform effective-dating** mechanism (VAL-EFFECTIVE). The engine materialises bitemporal, version-stamped `kpi_snapshot` rows (FR-23). Publication is a **P01 maker-checker** flow. Every snapshot stores `kpi_version` + `definition_hash`; cross-version trends render a version marker.
- **Acceptance Criteria:**
  - AC1: A KPI can be created with expression, grain, unit, dimensions, sensitivity, reconciliation target/tolerance in DRAFT.
  - AC2: An expression referencing an unknown mart column/disallowed function is rejected (`VALIDATION_FAILED(422)`) with precise location.
  - AC3: Activating a new version RETIRES the prior ACTIVE; no two ACTIVE versions share `kpi_code`.
  - AC4: Computing a KPI writes a reproducible bitemporal snapshot with version, hash, valid/knowledge time, data_as_of, is_partial.
  - AC5: A KPI cannot slice by a dimension not in `dimensions_allowed`.
  - AC6: Activation requires `approved_by ≠ created_by` via **P01** (SoD by P02).
  - AC7: A trend spanning differing `kpi_version` renders a discontinuity marker; cross-version aggregation returns `ERR-G14-XVER-AGG` unless acknowledged.
  - AC8: Target-vs-actual uses the `kpi_target_history` value in force for the period shown.
- **Business Rules:**
  - BR1: A KPI referenced by any published widget/report cannot be deleted; only RETIRED.
  - BR2: RESTRICTED KPIs inherit **P02 field masking + PII ceiling**; cannot be embedded in PUBLIC dashboards.
  - BR3: Reconcilable KPIs declare a reconciliation target; variance watermark-relative (FR-03).
  - BR4: Snapshots computed only on marts with `health_status ∈ {HEALTHY,STALE}`.
  - BR5: Every snapshot carries the producing `kpi_version` + `definition_hash` (immutable).
- **Data Model References:** `kpi_definition`, `kpi_target_history`, `kpi_snapshot`, `analytics_datamart`; config audit via **P05**.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/kpis` | create KPI version |
| POST | `/api/v1/analytics/kpis/{id}:activate` | activate (P01 checker) |
| POST | `/api/v1/analytics/kpis/{id}/targets` | set effective-dated target (VAL-EFFECTIVE) |
| GET | `/api/v1/analytics/kpis/{code}/value?scope=&period=&asOfKnowledge=` | compute/resolve value |
| GET | `/api/v1/analytics/kpis/{code}/trend?from=&to=&cursor=` | snapshot trend (cursor-paginated, version markers) |

- **UI Behavior Notes:** KPI editor with expression linting, "test against mart sample" trace, effective-dated target timeline, sensitivity selector, version timeline; Activate disabled for makers.
- **Edge Cases:** Division by zero (null with reason); dimension absent (grouped "Unknown"); retroactive backfill → new knowledge-version (FR-23); cross-version trend aggregation needs acknowledgement.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `KpiController`, `AggregationParser`, `KpiCalcEngine`, `SnapshotMaterializer`, `KpiVersionService`, `TargetHistoryService` |
| Backend Flow | Parse expression to whitelisted AST → static-check → persist DRAFT → on activate raise **P01 instance**, close prior version transactionally → on value request call **P02** then compile to scoped SQL, compute, write bitemporal version-stamped snapshot |
| Data Operations | INSERT kpi/version; UPDATE prior RETIRED; INSERT kpi_snapshot (knowledge-versioned); INSERT kpi_target_history |
| Validation | Whitelist tokens; column/dimension existence; ACTIVE non-overlap; SoD (P01/P02); target date-range non-overlap (VAL-EFFECTIVE) |
| Authorization | **P02**: Analytics Admin define; checker activate (P01); Auditor read |
| State Changes | kpi DRAFT→ACTIVE→RETIRED; snapshot rows; cache invalidation; watermark-relative reconciliation |
| Failure Handling | Bad expression → `VALIDATION_FAILED(422)` `ERR-G14-KPI-EXPR`; overlap → `CONFLICT(409)` `ERR-G14-KPI-VER-OVERLAP`; FAILED mart → `PRECONDITION_FAILED(412)` `ERR-G14-MART-UNAVAIL`; cross-version → `CONFLICT(409)` `ERR-G14-XVER-AGG` |
| Dependencies | FR-03, FR-04 (P02), FR-23, FR-17; P01, P05 |
| Test Guidance | Parser whitelist; snapshot determinism; ACTIVE non-overlap; version stamping; effective-dated target; reconciliation tolerance |

---

### FR-G14-03 — Analytics Data Layer (Semantic Model, Data Marts & ETL Refresh on X.1)

- **Module:** G14-F03
- **Primary Role(s):** Data Engineer (operate), Analytics Administrator (model), Org Admin (config)
- **User Story:** As a Data Engineer, I want governed read-model data marts refreshed on **X.1-scheduled jobs** with watermarks, watermark-relative reconciliation, and health tracking, so dashboards read fast, consistent, P02-scopeable data without hammering OLTP.
- **Description:** Defines/operates the analytics layer: an `analytics_datamart` registry, each governed by a `source_data_contract` (FR-21) and fed by Debezium CDC/incremental/batch. Refresh jobs are **registered on X.1 as `JOB-G14-MART-*`** (Foundation §4 index), inheriting the runner's idempotency (per-period run key), retry (×3 backoff), per-tenant isolation, and `JOB-FAIL → MSG-SYS-JOBFAIL` on terminal failure. ETL logs to `datamart_refresh_log`, advances watermarks, recomputes affected snapshots, updates health. Reconciliation is watermark-relative with a grace window.
- **Acceptance Criteria:**
  - AC1: A mart can be registered with grain, sources, governing contract, refresh strategy, **X.1 job id**, cron, and freshness SLA.
  - AC2: A scheduled X.1 refresh runs incrementally from the last watermark, recording rows read/written, duration, new watermark; idempotent per run key.
  - AC3: If `now − last_refreshed_at > freshness_sla_minutes`, the mart is STALE.
  - AC4: A failed refresh marks the mart FAILED, retains last good data, logs the error, raises `JOB-FAIL → MSG-SYS-JOBFAIL` (X.1) + alert (X.2).
  - AC5: Reconciliation compares mart-at-W to source-as-of-W; variance beyond per-KPI tolerance sustained beyond grace → DEGRADED + alert; transient CDC lag does not flag.
  - AC6: A Data Engineer can trigger manual/backfill refresh (`run_type` logged); backfill creates new knowledge-version snapshots (FR-23).
- **Business Rules:**
  - BR1: Marts read sources **read-only through contracted views** (read models); G14 holds no write FK into G01–G13.
  - BR2: PII-bearing marts (`contains_pii=true`) drive **P02 RESTRICTED field-masking**.
  - BR3: A FAILED mart cannot serve dashboards; consumers fall back to last good snapshot with a stale flag.
  - BR4: Incremental refresh idempotent (X.1 per-period run key).
  - BR5: A mart whose contract is BREACHED is held from refresh and alerts (FR-21).
- **Data Model References:** `analytics_datamart`, `source_data_contract`, `datamart_refresh_log`, `kpi_snapshot`; config/run audit via **P05**.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/marts` | register mart (+ X.1 job) |
| POST | `/api/v1/analytics/marts/{id}:refresh` | trigger refresh (manual/backfill) |
| GET | `/api/v1/analytics/marts/{id}/health` | freshness/health |
| GET | `/api/v1/analytics/marts/{id}/refresh-log?cursor=` | run history (cursor-paginated) |

- **UI Behavior Notes:** Data Engineer console with health chips, last refresh, watermark, next X.1 run, contract status; manual refresh/backfill; reconciliation variance panel with grace-window state.
- **Edge Cases:** Source schema change breaks ETL (contract test fails in CI; runtime → FAILED + last good); CDC stream gap (watermark stall → STALE); concurrent manual+scheduled refresh (second queued; X.1 isolation).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MartRegistryController`, `EtlOrchestrator`, `IncrementalLoader`, `MaterializedViewRefresher`, `FreshnessMonitor`, `WatermarkReconciliationChecker`; **X.1 runner** |
| Backend Flow | X.1 fires `JOB-G14-MART-*` → acquire mart lock → read from watermark via contracted view → upsert idempotently → advance watermark → recompute snapshots → watermark-relative reconciliation with grace → update health → write refresh_log → on terminal fail JOB-FAIL |
| Data Operations | UPSERT mart rows; INSERT refresh_log; UPDATE mart watermark/health; recompute snapshots |
| Validation | X.1 per-period run key; grain uniqueness; source read-only assertion; contract validity |
| Authorization | **P02**: Data Engineer operate; Analytics Admin model; Org Admin config; Auditor read status |
| State Changes | mart health transitions; refresh_log append; snapshot recompute; alert on FAILED/sustained-DEGRADED |
| Failure Handling | ETL error → FAILED + `INTERNAL(500)` `ERR-G14-MART-REFRESH` + retain last good; lock contention → `CONFLICT(409)` `ERR-G14-MART-BUSY`; contract breach → `ERR-G14-CONTRACT` |
| Dependencies | FR-21 (contracts), FR-02 snapshots, FR-11 alerts, FR-23; **X.1, X.2, P05** |
| Test Guidance | Idempotent X.1 load; SLA detection; watermark-relative reconciliation (no false DEGRADED under CDC lag); grace window; last-good fallback |

---

### FR-G14-04 — Permission-Scoped Analytics Access via Platform P02 (replaces the invented RLS engine)

- **Module:** G14-F04
- **Primary Role(s):** Org Admin (maker, scope policy), Analytics Administrator (checker), all roles (enforced by P02)
- **User Story:** As an Org Admin, I want analytics reads to be scoped by the **platform authorization engine** exactly as the rest of the HRMS is, with any scope-policy change maker-checked and preview-as-role diffed, so every query returns only entitled data and the most dangerous mutation (broadening scope) cannot ship unchecked.
- **Description:** **v3 re-grounding.** G14 does **not** implement a row-level-security rewriter. Every analytics read calls **`Authorization.check({ subject(roles,scope), action, resource_ref, fields[] })` (P02)** and receives `{ allowed, scope_filter, field_mask[] }`. P02's resolution order applies in full: `deny-by-default → role grant → multi-role INTERSECTION (more restrictive wins) → individual entitlement (time-bound) → capability flag → PII Protection Ceiling (overrides everything upward) → data scope filter (RBAC §3.6 five dimensions) → field mask on serialization`. The `analytics_scope_policy` (E11) merely **declares**, per mart/role, which of the five scope dimensions and which field-sensitivity flags apply; enforcement is entirely P02 at the data layer. Policy create/update is a **P01 maker-checker flow** — a maker drafts, the system computes a **preview-as-role exposure diff**, a different checker approves, and the change is administered through the platform RBAC admin surface (cfg-rbac, written to `security_audit_log`).
- **Acceptance Criteria:**
  - AC1: A manager's dashboard/report returns only direct+indirect reports (P02 reporting-chain dimension).
  - AC2: An HR Admin sees only delegated org units / UAG (P02 dimensions); out-of-scope rows filtered by P02.
  - AC3: A RESTRICTED field is masked/excluded **by P02 on serialization** for roles without field access; export header notes masking; the **PII ceiling cannot be lifted** by any role.
  - AC4: A request P02 denies returns `FORBIDDEN(403)` `ERR-FORBIDDEN` and is written to `security_audit_log`; it never reveals existence of out-of-scope records (no 404 leak).
  - AC5: Scope reflects org-hierarchy changes within the platform session/TTL.
  - AC6: An automated scope-leak test proves no role returns a record outside its P02 scope across all marts.
  - AC7: A scope-policy create/update is DRAFT→PENDING_APPROVAL; cannot become ACTIVE without `approved_by ≠ created_by` via **P01**; self-approval returns `FORBIDDEN(403)` `ERR-G14-SCOPE-CHECKER`.
  - AC8: The approval screen shows a preview-as-role diff (resolved P02 scope, before/after row counts) captured into `preview_diff_json`; broadening to entity/enterprise scope is flagged.
- **Business Rules:**
  - BR1: Effective dataset = P02 result (capability ∩ scope ∩ field mask ∩ PII ceiling); **suppression (FR-17) applied after**.
  - BR2: Entity/enterprise scope is restricted to Executive/Auditor/Analytics Admin/Org Admin per policy + P02.
  - BR3: Auditor read-all scope still inherits field masking unless explicitly granted (PII ceiling).
  - BR4: Embedded-BI and API queries (FR-15) carry the **same P02 check**; tokens are scoped, not bypass keys.
  - BR5: One ACTIVE policy per (role, mart); activating a new version SUPERSEDES the prior; rollback re-activates through the same P01 checker path.
- **Data Model References:** `analytics_scope_policy` (declares P02 dimensions), `org_units`/`employees` (P02 scope resolution), `roles`/`permissions`/entitlements (RBAC), `workflow_instances` (P01), `analytics_access_log` (→ P05).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/scope-policies` | create/update policy (DRAFT, maker) |
| POST | `/api/v1/analytics/scope-policies/{id}:preview-as-role` | compute P02 exposure diff |
| POST | `/api/v1/analytics/scope-policies/{id}:approve` | approve (P01 checker ≠ maker) |
| GET | `/api/v1/analytics/scope-policies/resolve` | resolve my effective P02 scope (debug/self) |
| GET | `/api/v1/analytics/scope-policies?cursor=` | list policies |

- **UI Behavior Notes:** Admin policy editor mapping roles to P02 dimensions; **mandatory preview-as-role diff** before submit; checker approval queue (P01) with broadening warnings; immutable change history (security_audit_log).
- **Edge Cases:** Multi-role user (P02 INTERSECTION — most restrictive wins); manager with no reports (empty scope state); delegated units changed mid-session (re-resolved by P02); checker = maker attempt (blocked by P01/P02).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ScopePolicyController`, `PreviewAsRoleService`, **`Authorization.check` client (P02)**, `PolicyApprovalWorkflow (P01)` |
| Backend Flow | On request → **call P02** → receive scope_filter + field_mask → execute mart query with them → async snapshot scope to access_log (→ P05). On policy change → DRAFT → compute exposure diff via P02 preview → route to **P01 checker** → on approve activate version, supersede prior, write security_audit_log |
| Data Operations | SELECT policies; **no bespoke scope rewrite — P02 returns the filter**; INSERT policy version; no writes to source |
| Validation | Policy existence; dimension resolvability; SoD on approval (P01/P02) |
| Authorization | **P02 for everything**; Org Admin maker; Analytics Admin/authorised checker (P01); Auditor read |
| State Changes | policy DRAFT→PENDING_APPROVAL→ACTIVE/REJECTED→SUPERSEDED; security_audit_log; async access_log |
| Failure Handling | P02 deny → `FORBIDDEN(403)` `ERR-FORBIDDEN`; self-approval → `FORBIDDEN(403)` `ERR-G14-SCOPE-CHECKER`; scope source unavailable → `PRECONDITION_FAILED(412)` `ERR-LOADFAIL` |
| Dependencies | **P02 (core), P01 (maker-checker), RBAC v1.7, G01 org hierarchy**; consumed by FR-01/02/03/05/06/07/08/10/14/16/17 |
| Test Guidance | Cross-role scope-leak matrix (P02); multi-role INTERSECTION; field masking on export (P02 serialization); PII-ceiling non-lift; maker-checker (P01) + preview diff correctness |

---

### FR-G14-05 — Workforce Analytics (Establishment-Pinned)

- **Module:** G14-F05
- **Primary Role(s):** HR Admin, Department Head, Executive
- **User Story:** As a Department Head, I want workforce analytics — headcount, demographics, diversity, attrition, **sanctioned-vs-filled vacancy pinned to the establishment reference**, cadre distribution, age/retirement profile, span of control — so I can plan establishment, recruitment, and succession with accurate, P02-scoped numbers.
- **Description:** Core workforce KPI suite over `MART_HEADCOUNT`, with **vacancy = sanctioned strength (`establishment_position`, FR-19) − filled**. All KPIs governed (FR-02), **P02-scoped (FR-04)**, suppressed (FR-17). Retirement profile deterministic (FR-13).
- **Acceptance Criteria:**
  - AC1: Headcount tiles show active count by scope with drill-down org_unit→office→designation.
  - AC2: Attrition rate = leavers/avg headcount over the window, separating retirements/resignations/terminations, **excluding internal transfers (G05)**.
  - AC3: Vacancy view shows sanctioned (establishment) vs filled vs vacant by cadre with vacancy %.
  - AC4: Retirement profile lists counts retiring within 1/3/5 years by cadre, drillable to P02-permitted individuals.
  - AC5: Span-of-control highlights managers exceeding thresholds.
  - AC6: Diversity composition shows reservation-category and gender mix vs roster targets; small cells suppressed/banded (FR-17).
- **Business Rules:**
  - BR1: Sanctioned strength from `establishment_position` (FR-19); filled = active employees mapped to sanctioned posts. Missing data → `ERR-G14-ESTAB-MISSING` (notice).
  - BR2: Retirement age/date uses canonical G01 DOB + cadre rules; G14 does not redefine.
  - BR3: Attrition excludes internal transfers (G05).
  - BR4: Demographic drill-through is P02-gated, suppressed, audited (→ P05).
- **Data Model References:** `analytics_datamart` (MART_HEADCOUNT, dimensions), `establishment_position`, `kpi_definition`/`kpi_snapshot`, `employees`/`org_units`/`cadres`/`designations` (ref), `prediction_result`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/workforce/headcount` | headcount by scope/dimension |
| GET | `/api/v1/analytics/workforce/attrition` | attrition metrics |
| GET | `/api/v1/analytics/workforce/vacancy` | sanctioned (establishment) vs filled |
| GET | `/api/v1/analytics/workforce/retirement-profile` | retirement horizon |
| GET | `/api/v1/analytics/workforce/span-of-control` | reports per manager |

- **UI Behavior Notes:** Workforce dashboard with KPI tiles, attrition trend, vacancy bar, retirement heatmap, span table with threshold flags, diversity donut vs target; all drillable; freshness + suppression badges.
- **Edge Cases:** Long suspension (per policy flag); post with no occupant mapping (data-quality flag); manager change mid-period (span as-of date); establishment absent (notice, not zero).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `WorkforceAnalyticsController`, `HeadcountService`, `AttritionService`, `VacancyService` (establishment-joined), `RetirementProfiler`, `SpanCalculator` |
| Backend Flow | Call **P02** for scope/mask → query MART_HEADCOUNT + dimensions → join `establishment_position` → compute governed KPIs/snapshots → apply suppression → join prediction overlays → assemble with freshness |
| Data Operations | SELECT marts + establishment (P02-filtered, suppressed); no writes |
| Validation | Dimension allowed; window validity; sanctioned-vs-filled integrity; establishment presence |
| Authorization | **P02**: HR/Dept Head/Exec scoped; Employee excluded from aggregates |
| State Changes | snapshot writes; async access_log on drill-through (→ P05) |
| Failure Handling | Stale mart → partial; missing establishment → `ERR-G14-ESTAB-MISSING` (200 notice); small cell → suppressed |
| Dependencies | FR-02/03/04/10/13/17/19; P02, P05 |
| Test Guidance | Attrition excludes transfers; establishment-pinned vacancy math; retirement boundaries; span thresholds; suppression on diversity |

---

### FR-G14-06 — Operational Analytics by Module

- **Module:** G14-F06
- **Primary Role(s):** HR Admin, Reporting Manager, Department Head
- **User Story:** As an HR Admin, I want per-module operational analytics — leave/absenteeism, attendance, payroll cost & overtime, training, appraisal distribution, disciplinary aging, transfer/promotion pipeline, pension forecasting — so I can monitor operations and act on outliers within my P02 scope.
- **Description:** Domain dashboards reading domain marts (Leave/Attendance from G03; Payroll from G10 **locked**; Training G07; Appraisal G08; Disciplinary G09; Transfer/Promotion G05/G06; Pension G11). Each governed, **P02-scoped**, suppressed.
- **Acceptance Criteria:**
  - AC1: Leave dashboard shows absenteeism rate and LWP days by office with trend, drillable to employee (P02-scoped, suppressed).
  - AC2: Payroll cost analytics read only LOCKED snapshots; in-progress excluded.
  - AC3: Training dashboard shows mandatory-training completion % and skill-gap heatmap.
  - AC4: Appraisal dashboard shows rating distribution; never exposes individual ratings to unauthorised roles (P02 field mask).
  - AC5: Disciplinary dashboard shows case-aging buckets (0-30/31-90/90+) without exposing detail beyond P02 permission.
  - AC6: Transfer/promotion pipeline shows funnel by stage with ageing and SLA.
- **Business Rules:**
  - BR1: Each operational KPI maps to a single owning-module mart; G14 aggregates published facts, never recomputes domain rules.
  - BR2: Sensitive domains (payroll, disciplinary, appraisal) are RESTRICTED; **P02 masking**, suppression, drill-gating apply.
  - BR3: Pension forecast figures sourced from G11; G14 visualises, does not compute terminal benefits.
  - BR4: Overtime analytics require attendance+payroll alignment; mismatched periods flagged.
- **Data Model References:** Domain marts, `kpi_definition`/`kpi_snapshot`, `suppression_policy`, `analytics_access_log` (→ P05).
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

- **UI Behavior Notes:** Tabbed suite, one tab per domain; KPI tiles + chart + outlier table; RESTRICTED tabs visible only to P02-authorised roles; freshness per domain mart; suppression badges.
- **Edge Cases:** Payroll mart stale (last locked + badge); training competency added mid-period (recomputed); disciplinary case sealed (excluded per G09 flag).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OperationalAnalyticsController`, domain services, `OutlierDetector`, `SuppressionDecorator` |
| Backend Flow | Call **P02** → select domain mart → compute governed KPIs → P02 mask + suppression → assemble tab with freshness |
| Data Operations | SELECT domain marts (P02 + locked-only for payroll, suppressed); no writes |
| Validation | Domain-period alignment; mart health; sensitivity gating (P02) |
| Authorization | **P02** role+scope per domain; RESTRICTED gated |
| State Changes | snapshot writes; async access_log on RESTRICTED drill-through (→ P05) |
| Failure Handling | Mart stale → partial; locked snapshot missing → `PRECONDITION_FAILED(412)` `ERR-G14-PAYROLL-LOCK`; small cell → suppressed |
| Dependencies | G03–G11 marts; FR-02/03/04/10/17; P02, P05 |
| Test Guidance | Payroll locked-only; appraisal masking (P02); case-aging buckets; pipeline funnel; suppression |

---

### FR-G14-07 — Compliance & Statutory Dashboards (Establishment-Pinned)

- **Module:** G14-F07
- **Primary Role(s):** HR Admin, Department Head, Executive, Auditor
- **User Story:** As a Department Head, I want compliance & statutory dashboards — reservation roster compliance (pinned to sanctioned strength/roster points), mandatory-training status, SR verification status (read from G12), pending approvals & SLA breaches — so I can demonstrate compliance and clear backlogs before they become audit findings.
- **Description:** Statutory-grade dashboards: **Reservation Roster Compliance** (sanctioned vs filled by category vs roster points from `establishment_position`, FR-19); **Mandatory Training**; **SR Verification Status** (read from **G12** statutory ledger, never written); **Pending Approvals & SLA Breaches** (read **P01 `workflow_actions`/instances**). Designed for audit export with as-of timestamps, methodology notes, and bitemporal as-of-knowledge reproducibility (FR-23). These dashboards are the **gov extension of M16** — SR completeness, pension pipeline, disciplinary aging.
- **Acceptance Criteria:**
  - AC1: Reservation dashboard shows category-wise sanctioned/filled/backlog + roster-point compliance, pinned to the establishment reference.
  - AC2: Mandatory-training dashboard lists overdue employees by mandate with completion %.
  - AC3: SR verification dashboard shows verified/pending/overdue counts from **G12** (read-only) with drill to P02-permitted employee SR status.
  - AC4: SLA dashboard aggregates pending **P01 workflow tasks** across modules into aging buckets with breach flags.
  - AC5: Every compliance view exports to PDF/Excel with `data_as_of`, scope, methodology footnote, and an as-of-knowledge stamp (FR-09/FR-23).
  - AC6: Auditor can view all compliance dashboards, the P05 access log, and the anomaly queue.
- **Business Rules:**
  - BR1: Reservation category rules/roster points use canonical reference + establishment data; G14 reports, does not adjudicate.
  - BR2: SR verification status read from **G12**; G14 never writes SR.
  - BR3: SLA thresholds per workflow type effective-dated (E17); breaches derived from P01 state.
  - BR4: Compliance dashboards default to entity/department scope (P02); employee role has no access.
- **Data Model References:** compliance/SR/workflow marts, `establishment_position`, `service_register_events` (G12 ref), **P01 workflow instances/actions** (ref), `kpi_definition`/`kpi_snapshot`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/compliance/reservation-roster` | roster compliance (establishment-pinned) |
| GET | `/api/v1/analytics/compliance/mandatory-training` | mandate status |
| GET | `/api/v1/analytics/compliance/sr-verification` | SR verification status (read G12) |
| GET | `/api/v1/analytics/compliance/sla-breaches` | pending & SLA aging (read P01) |

- **UI Behavior Notes:** Compliance suite with roster table, overdue training list, SR verification board, SLA breach heatmap by module×age bucket; prominent export-for-audit; methodology footnotes; as-of + as-of-knowledge stamps.
- **Edge Cases:** Reservation reference updated (recompute, prior knowledge-version retained); SR mart lagging G12 (stale badge); workflow type without configured SLA (excluded with flag); establishment missing (`ERR-G14-ESTAB-MISSING`).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ComplianceController`, `ReservationRosterService` (establishment-joined), `MandatoryTrainingService`, `SrVerificationService`, `SlaBreachService` |
| Backend Flow | Call **P02** → query compliance/SR/workflow marts + establishment → compute compliance KPIs vs targets → assemble with as-of + as-of-knowledge + methodology |
| Data Operations | SELECT compliance/SR/workflow marts + establishment (P02); no writes |
| Validation | Reference/establishment presence; SLA config presence; scope ≥ department (P02) |
| Authorization | **P02**: HR/Dept Head/Exec/Auditor; Employee/Manager excluded |
| State Changes | snapshot writes; export → document (G13) + async access_log (→ P05) |
| Failure Handling | Missing reference → `ERR-G14-ESTAB-MISSING`; SR mart stale → partial |
| Dependencies | **G12 (SR), P01 (workflow), P02, P05**; FR-02/03/04/09/19/23 |
| Test Guidance | Roster compliance math; establishment pinning; SR read-only; SLA buckets; audit export completeness; as-of-knowledge reproduction |

---

### FR-G14-08 — Self-Service Report Builder (Ad-Hoc Query & Saved Reports)

- **Module:** G14-F08
- **Primary Role(s):** HR Admin, Department Head, Reporting Manager (team scope)
- **User Story:** As an HR Admin, I want to build ad-hoc reports from a governed semantic model and save them, so I can answer new questions without IT tickets — within my P02 scope and the privacy threshold.
- **Description:** A no-code report designer over the semantic layer (FR-03) on the M16 surface. Users pick a base mart, select fields/measures, filter, group/aggregate, sort, preview, save as `saved_report`. All queries are **P02-scoped**, suppression-applied, bounded by `row_limit`. A clear in-builder explanation of the aggregated-vs-detail RESTRICTED rule reduces masked-field confusion.
- **Acceptance Criteria:**
  - AC1: A user can select a mart, choose fields, add filters/grouping/aggregations, and preview the first page (cursor).
  - AC2: The builder only exposes fields/dimensions **P02** permits (masked fields hidden, with inline explanation).
  - AC3: A report can be saved with visibility; SHARED_SCOPE respects each viewer's P02 scope at run time.
  - AC4: A query exceeding `row_limit` is rejected or offered chunked export (FR-09).
  - AC5: Preview and saved reports always show `data_as_of`.
  - AC6: A non-aggregated report over a RESTRICTED mart requires elevated authority (P02) or is blocked with a plain-language reason; aggregates over RESTRICTED marts are allowed but suppression-applied.
- **Business Rules:**
  - BR1: Report definitions reference the semantic model; raw SQL entry is not exposed.
  - BR2: SHARED_SCOPE/PUBLISHED visibility applied at view-time as **P02 intersection**.
  - BR3: Aggregated reports over RESTRICTED marts permitted (no row-level PII) but subject to FR-17 suppression; detail-level requires P02 authority.
  - BR4: Saving/publishing audited (→ P05); PUBLISHED requires steward approval (P01).
- **Data Model References:** `saved_report`, `analytics_datamart` (semantic), `analytics_scope_policy` (P02 dims), `suppression_policy`, `report_execution`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/semantic/fields?mart=` | available fields (P02-scoped) |
| POST | `/api/v1/analytics/reports:preview` | run preview (first page) |
| POST | `/api/v1/analytics/reports` | save report |
| GET | `/api/v1/analytics/reports/{id}/run?asOfKnowledge=&cursor=` | run saved report (paginated, reproducible) |

- **UI Behavior Notes:** Three-pane builder; field chips show sensitivity; inline helper explaining aggregate-vs-detail RESTRICTED access; aggregation pickers; Save/Schedule/Export; freshness + row-count + suppression indicators; masked-field tooltip (P02).
- **Edge Cases:** Filter on a masked field (rejected with reason, P02); high-cardinality grouping (warns + caps); preview against FAILED mart (blocked); shared report viewed by narrower P02 scope (auto-filtered/suppressed).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReportBuilderController`, `SemanticFieldService`, `QueryCompiler`, `ReportService`, `PreviewRunner`, `SuppressionDecorator` |
| Backend Flow | Call **P02** for scoped fields → validate selections → compile to P02-filtered SQL → run bounded, suppressed preview → on save persist → on run execute cursor-paginated with P02 mask + suppression + optional as-of-knowledge |
| Data Operations | SELECT semantic metadata; SELECT marts (P02, suppressed); INSERT saved_report/report_execution |
| Validation | Field permission (P02); filter on permitted fields; row_limit; aggregation legality; min_cell_size |
| Authorization | **P02**: HR/Dept Head/Manager scoped; PUBLISHED needs steward approval (P01) |
| State Changes | report saved; execution + async access_log on run/export (→ P05) |
| Failure Handling | Masked-field filter → `FORBIDDEN(403)` `ERR-FORBIDDEN`; over limit → `VALIDATION_FAILED(422)` `ERR-G14-EXPORT-LIMIT`; FAILED mart → `PRECONDITION_FAILED(412)`; small cell → `ERR-G14-SMALL-CELL` |
| Dependencies | FR-03 semantic, FR-04 (P02), FR-09 export, FR-17 suppression, FR-23 |
| Test Guidance | Field-permission filtering (P02); shared-report intersection; row-limit; suppression on aggregates; reproducible run |

---

### FR-G14-09 — Scheduled Report Distribution & Multi-Format Export (on X.1/X.2)

- **Module:** G14-F09
- **Primary Role(s):** HR Admin, Department Head, Analytics Administrator
- **User Story:** As an HR Admin, I want to schedule saved reports for automatic generation and delivery in PDF/Excel/CSV — optionally bursted per org unit — so stakeholders receive timely, scope-correct reports without manual effort.
- **Description:** Attaches a `report_schedule` (cron, format, recipients, `scope_mode`, optional `burst_dimension`, channel) to a `saved_report`, **registered on X.1 as `JOB-G14-REPORT-*`**. The runner generates a `report_execution` + a G13 artefact, then delivers via **X.2 (EMAIL/IN_APP/SFTP)** under owner- or per-recipient-P02-scope, with suppression applied. On-demand export shares the pipeline.
- **Acceptance Criteria:**
  - AC1: A schedule can be created with cron, format, recipients, channel; recipients RBAC-validated **via P02**; registers an X.1 job.
  - AC2: A scheduled X.1 run produces a `report_execution` (COMPLETED/FAILED) and, on success, a stored G13 artefact.
  - AC3: Bursting by `org_unit` produces one file per unit, each P02-filtered + suppressed and delivered to that unit's recipients.
  - AC4: Per-recipient-scope mode generates each recipient's copy under their own P02 scope (no over-disclosure).
  - AC5: PDF/XLSX/CSV supported; PDF header/footer carry scope, as-of, as-of-knowledge, page numbers.
  - AC6: A failed run retries (X.1 ×3 backoff), alerts the owner on final failure (`JOB-FAIL`/X.2), and is logged.
- **Business Rules:**
  - BR1: An out-of-scope recipient is dropped (logged via P05), never sent data beyond entitlement.
  - BR2: RESTRICTED reports cannot be scheduled to EMAIL unless secure-channel policy satisfied; otherwise IN_APP only (**EMAIL for statutory notices is mandatory per X.2 — but RESTRICTED PII is never in the body, only a link**).
  - BR3: Exports retained per statutory retention; artefacts expire/purge on schedule; DPDP erasure may set REDACTED early (FR-20).
  - BR4: Schedule cron stored UTC; displayed in owner timezone.
- **Data Model References:** `report_schedule` (X.1 job), `report_execution`, `saved_report`, `documents` (G13), `notifications` (X.2).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/reports/{id}/schedules` | create schedule (+ X.1 job) |
| POST | `/api/v1/analytics/reports/{id}:export` | on-demand export (`Idempotency-Key`) |
| GET | `/api/v1/analytics/executions/{id}` | execution status/artefact |
| POST | `/api/v1/analytics/schedules/{id}:pause` | pause/resume |

- **UI Behavior Notes:** Schedule dialog (cron builder, format, recipients with P02 scope warning, scope-mode toggle, burst toggle, channel); executions list with status, row count, download link, expiry; on-demand export with progress; failure surfaced with retry.
- **Edge Cases:** Recipient leaves org before run (dropped via P02); burst over 500 values (throttled batch, X.1); CSV delimiters (RFC-4180 quoting); huge PDF (streamed); erased subject mid-retention (artefact REDACTED).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ScheduleController`, **X.1 `ReportScheduler`**, `ExportRenderer` (PDF/XLSX/CSV), `BurstingEngine`, **X.2 `DeliveryService`** |
| Backend Flow | X.1 cron fires → resolve recipients + scope mode via **P02** → for each scope unit run report (suppressed) → render format → store in G13 → deliver via X.2 → log execution + async access_log (→ P05) → notify |
| Data Operations | INSERT report_execution; create document ref (G13); INSERT notifications (X.2); SELECT marts (P02, suppressed) |
| Validation | Cron validity; recipient RBAC/scope (P02); format support; restricted-channel policy |
| Authorization | **P02**: Owner/HR/Dept Head create; per-recipient scope enforced |
| State Changes | schedule next_run advance (X.1); execution status; document creation; notification (X.2); async access_log EXPORT |
| Failure Handling | Render error → FAILED + retry (X.1) + alert; out-of-scope recipient dropped+logged; restricted email blocked → `FORBIDDEN(403)` `ERR-G14-CHANNEL` |
| Dependencies | FR-08 reports, FR-04 (P02), FR-17, FR-20; **X.1, X.2, G13** |
| Test Guidance | Burst scope-correctness (P02); per-recipient scope; format fidelity; recipient validation; X.1 retry/alert; REDACTED handling |

---

### FR-G14-10 — Drill-Down & Permission-Gated Drill-Through to Source Records (P02)

- **Module:** G14-F10
- **Primary Role(s):** Manager, HR Admin, Department Head, Auditor
- **User Story:** As an HR Admin, I want to drill down through aggregate charts and then drill through to the underlying source record when permitted, so I can investigate an outlier — without leaving an audit gap.
- **Description:** **Drill-down** expands an aggregate along a `drilldown_path` within the analytics layer. **Drill-through** opens the authoritative record in the owning module via a route template, only if **P02 allows both the analytics scope and the owning module's permission** (a live `Authorization.check`, not a cached flag). Every drill-through is logged FULL-fidelity (→ P05). Drill-through is read-only. Small-cell suppression (FR-17) is enforced here and on the tiles above it.
- **Acceptance Criteria:**
  - AC1: A user can expand a chart along the configured drill path level by level, each **P02-scoped** and suppressed.
  - AC2: Drill-through is offered only when **P02 authorises** in both G14 (scope) and the owning module (permission); otherwise hidden/disabled.
  - AC3: Drill-through opens the owning module's read-only record view, not a G14 copy.
  - AC4: Every drill-through writes a FULL-fidelity `analytics_access_log` (DRILLTHROUGH) row with record id + sensitivity, mirrored to **P05**.
  - AC5: A drill-through to a record outside scope returns `FORBIDDEN(403)` `ERR-FORBIDDEN` (P02 never reveals existence).
  - AC6: Aggregates below the privacy threshold suppress drill-through (k-anonymity + complementary).
- **Business Rules:**
  - BR1: G14 never renders an editable source form.
  - BR2: Permission check is a **live P02 `Authorization.check`**, not a cached flag.
  - BR3: Suppression threshold (default k=5) configurable via `suppression_policy`.
  - BR4: Auditor drill-through is read-only and fully logged (→ P05).
- **Data Model References:** `dashboard_widget` (drilldown_path, drillthrough_target), `suppression_policy`, `analytics_access_log` (→ P05), owning-module records (ref), `analytics_scope_policy` (P02 dims).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/widgets/{id}/drilldown?level=&path=` | next drill level |
| GET | `/api/v1/analytics/widgets/{id}/drillthrough?rowKey=` | resolve deep link + P02 authz |
| GET | `/api/v1/analytics/access-log?cursor=` | view drill/export audit (P05 query, authorised) |

- **UI Behavior Notes:** Click-to-expand with breadcrumb; "Open source record" visible only when P02 permits; opens owning module read-only; suppressed cells show "below privacy threshold"; access indicated as logged.
- **Edge Cases:** Record soft-deleted after aggregation ("no longer available"); cross-module permission revoked mid-session (disabled on next P02 check); deep link to module under maintenance (graceful passthrough).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DrillController`, `DrilldownService`, `DrillthroughResolver`, **`Authorization.check` client (P02)**, `SmallCellSuppressor` |
| Backend Flow | Drill-down → query next mart level (P02, suppressed) → return; Drill-through → resolve route → **live P02 check (G14 scope ∩ owning-module perm)** → return deep link or 403 → async FULL log (→ P05) |
| Data Operations | SELECT marts (P02, suppressed); **P02 owning-module check**; async INSERT access_log |
| Validation | Path validity; small-cell threshold; live permission (P02) |
| Authorization | **P02**: G14 scope + owning-module permission (both) |
| State Changes | async access_log DRILLTHROUGH (→ P05); no source mutation |
| Failure Handling | Out-of-scope → `FORBIDDEN(403)` `ERR-FORBIDDEN`; suppressed → `FORBIDDEN(403)` `ERR-G14-SMALL-CELL`; source gone → `NOT_FOUND(404)` |
| Dependencies | FR-04 (P02); FR-17 suppression; owning modules G01–G13; P05 |
| Test Guidance | Both-permission gate (P02); k-anonymity + complementary suppression; read-only deep link; audit completeness (P05) |

---

### FR-G14-11 — Alerting, Thresholds & Effective-Dated KPI Targets (X.2/W.3)

- **Module:** G14-F11
- **Primary Role(s):** HR Admin, Department Head, Analytics Administrator
- **User Story:** As a Department Head, I want thresholds and targets on KPIs with alerts when they breach, evaluated against the threshold in force for the period, so I am notified of attrition spikes, SLA backlogs, or vacancy surges proactively.
- **Description:** Attaches `alert_rule`s to governed KPIs (operator, threshold via `kpi_target_history` or static, scope, severity, frequency, recipients, suppression window, hysteresis). Evaluation runs on an **X.1 job**; a breach creates an `alert_event`, sends **notifications via X.2 (recipients resolved by W.3)**, and badges dashboards. Thresholds are effective-dated; flapping damped by `hysteresis_pct`.
- **Acceptance Criteria:**
  - AC1: A rule can be created on an ACTIVE KPI with operator, threshold, scope, severity, frequency, recipients.
  - AC2: When a scoped KPI value breaches the threshold in force for the period, an `alert_event` is created and recipients notified (X.2).
  - AC3: Repeat breaches within `suppression_window_min` (and within `hysteresis_pct`) do not generate duplicates.
  - AC4: A recipient can acknowledge; status OPEN→ACKNOWLEDGED→RESOLVED.
  - AC5: Recipients RBAC/scope validated **via P02**; out-of-scope dropped.
  - AC6: Dashboards show active alert badges on affected KPI tiles.
- **Business Rules:**
  - BR1: Alerts evaluate against the same governed snapshot as dashboards; no separate calculation.
  - BR2: An alert on a stale/partial mart is flagged in the event/notification.
  - BR3: DELTA_PCT compares to the prior comparable period.
  - BR4: CRITICAL alerts cannot be globally muted by a non-admin; only acknowledged.
  - BR5: The threshold used is the `kpi_target_history` value covering the evaluated period.
- **Data Model References:** `alert_rule`, `alert_event`, `kpi_target_history`, `kpi_definition`/`kpi_snapshot`, `notifications` (X.2).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/alert-rules` | create rule |
| GET | `/api/v1/analytics/alert-events?cursor=` | list events (P02-scoped) |
| POST | `/api/v1/analytics/alert-events/{id}:acknowledge` | acknowledge |
| POST | `/api/v1/analytics/alert-rules/{id}:pause` | pause/resume |

- **UI Behavior Notes:** Rule builder (KPI picker, operator, effective-dated threshold, scope, severity, recipients, suppression, hysteresis); alert inbox with severity chips, value vs threshold, as-of, acknowledge/resolve; KPI tiles show alert badges + period-correct target gauges.
- **Edge Cases:** KPI retired with active rules (auto-paused + steward notified); flapping (hysteresis + suppression); evaluation while mart FAILED (skipped, logged, no false alert); threshold changed mid-period (period-correct value applied).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AlertRuleController`, **X.1 `AlertEvaluator`**, `SuppressionEngine`, **X.2/W.3 `AlertNotifier`**, `TargetHistoryService` |
| Backend Flow | X.1 schedule/refresh → for each active rule resolve scoped KPI value (P02) → fetch effective-dated threshold → compare with hysteresis → if breach and not suppressed → create event → validate recipients (P02/W.3) → notify (X.2) → badge dashboards |
| Data Operations | SELECT kpi_snapshot + kpi_target_history; INSERT alert_event; INSERT notifications (X.2); UPDATE event status |
| Validation | KPI active; operator/threshold validity; recipient scope (P02); suppression/hysteresis |
| Authorization | **P02**: HR/Dept Head/Admin create scoped; recipients validated |
| State Changes | event lifecycle; notifications (X.2); dashboard badges |
| Failure Handling | Stale mart → flagged partial; FAILED mart → skipped; bad recipient → dropped+logged |
| Dependencies | FR-02 KPI, FR-03 refresh hooks, E17 targets; **X.1, X.2, W.3, P02** |
| Test Guidance | Breach detection; effective-dated threshold; suppression/hysteresis/no-dup; recipient scope (P02); retired-KPI auto-pause |

---

### FR-G14-12 — Data Freshness, Role-Adaptive Language & Reconciliation Explainer

- **Module:** G14-F12
- **Primary Role(s):** All roles (consume), Data Engineer (operate)
- **User Story:** As any dashboard user, I want every number to tell me how fresh it is — in words I understand — and to explain why it might differ from the source system, so I never decide on silently outdated or seemingly contradictory figures.
- **Description:** A cross-cutting capability: every surface carries `data_as_of` and a freshness state derived from mart `health_status` + SLA. **Role-adaptive (keyed off the RBAC role):** leaders/employees see plain language; operators/auditors see technical states (STALE/DEGRADED/watermark). **Reconciliation explainer:** a "why does this differ from the source?" panel shows `data_as_of`, the watermark, and any in-flight correction/knowledge-version — answering the §1.2 "headcount disagrees with payroll" pain.
- **Acceptance Criteria:**
  - AC1: Every widget/tile shows `data_as_of` in the user's timezone.
  - AC2: A mart past its freshness SLA renders dependent surfaces with a STALE indicator + tooltip.
  - AC3: A DEGRADED/FAILED mart shows last good data with a prominent warning; new computations flagged `is_partial`.
  - AC4: Exports and scheduled reports embed freshness state + as-of in header/footer.
  - AC5: Alerts evaluated on stale data carry the staleness flag.
  - AC6: A global "data health" panel summarises mart freshness for operators.
  - AC7: Freshness copy renders plain for EMPLOYEE/MANAGER/DEPT_HEAD/EXECUTIVE and technical for ANALYTICS_ADMIN/DATA_ENGINEER/AUDITOR.
  - AC8: A reconciliation explainer panel is available on every reconcilable KPI tile (as-of, watermark, last variance, pending correction).
- **Business Rules:**
  - BR1: Freshness state derived from mart health + SLA; not hand-set.
  - BR2: No surface may display a value without an associated `data_as_of`.
  - BR3: FAILED-mart surfaces differentiate via colour + icon + text (WCAG non-colour cue).
  - BR4: Degraded-mode behaviour consistent across UI, exports, API (`dataFreshness` block).
  - BR5: The same state maps to two copy registers (plain/technical) keyed off RBAC role; technical value available to leaders on demand.
- **Data Model References:** `analytics_datamart` (health/SLA), `datamart_refresh_log` (watermark + variance), `kpi_snapshot` (is_partial, data_as_of, knowledge_time), `report_execution`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/data-health` | mart freshness summary |
| GET | `/api/v1/analytics/kpis/{code}/reconciliation-explainer?scope=&period=` | as-of/watermark/variance/correction |
| (cross-cutting) | all analytics GETs return `dataFreshness` block | as-of + state (+ role-adaptive label) |

- **UI Behavior Notes:** Freshness chip on every tile (green/amber/red + icon + label); role-adaptive tooltip copy; reconciliation explainer panel; global data-health panel; export header/footer freshness line; degraded banner.
- **Edge Cases:** Mixed-freshness dashboard (per-widget + worst-case global); clock skew (server-authoritative); mart never refreshed (NO_DATA, not "fresh"); leader requests technical detail (expandable).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `FreshnessService`, `DataHealthController`, `ReconciliationExplainerService`, `FreshnessDecorator`, `RoleAdaptiveCopyResolver` |
| Backend Flow | On each response look up mart health/SLA → compute state → attach `dataFreshness` block + per-value `is_partial` + role-adaptive label; explainer joins refresh-log watermark + variance + pending corrections |
| Data Operations | SELECT mart health, refresh-log, snapshot watermarks; no writes |
| Validation | Presence of data_as_of on every value; state derivation; copy-register selection (RBAC role) |
| Authorization | **P02**: all roles see freshness; operators see global panel |
| State Changes | none (read-only decoration); influences alert flagging |
| Failure Handling | Health lookup failure → conservative DEGRADED (fail-safe) |
| Dependencies | FR-03 marts; consumed by FR-01/05/06/07/08/09/11/16 |
| Test Guidance | SLA-boundary state; degraded parity across UI/export/API; NO_DATA vs FRESH; WCAG non-colour cue; role-adaptive copy; reconciliation explainer accuracy |

---

### FR-G14-13 — Deterministic Retirement Forecasting (Phase 1)

- **Module:** G14-F13
- **Primary Role(s):** HR Admin, Department Head, Executive
- **User Story:** As an HR Admin, I want a deterministic retirement forecast — counts and named individuals retiring within configurable horizons — so I can plan recruitment and succession ahead of retirement bulges, with near-zero model risk.
- **Description:** A **deterministic** forecaster computing retirement dates from canonical G01 DOB + cadre retirement rules. No probabilistic model, no fairness exposure — ships in the foundation phase. Outputs counts by scope/horizon and, for P02-permitted roles, drillable individual lists. Registered as a `prediction_model` with `determinism=DETERMINISTIC` for governance symmetry. `GAP (gov-specific)` (PrimeSoft M16 has no retirement forecaster).
- **Acceptance Criteria:**
  - AC1: Retirement forecast lists subjects retiring within configurable horizons (1/3/5Y) by scope, deterministic.
  - AC2: Counts reconcile exactly to G01 DOB + cadre rules (zero tolerance).
  - AC3: Individual lists are **P02-scoped**, suppressed below k, audited (→ P05).
  - AC4: The forecast carries `data_as_of` and is labelled "deterministic — based on date of birth and retirement rules".
  - AC5: A registered deterministic model requires methodology text but no fairness assessment.
  - AC6: Backdated DOB correction (FR-20) re-derives the forecast as a new knowledge-version (FR-23).
- **Business Rules:**
  - BR1: Retirement age/date uses canonical G01/cadre rules; G14 does not invent.
  - BR2: Deterministic aggregate outputs not friction-gated; individual lists follow P02 + suppression.
  - BR3: Deterministic models are exempt from the FR-18 adverse-impact gate but must publish methodology.
- **Data Model References:** `prediction_model` (DETERMINISTIC), `prediction_result`, workforce marts + `employees` DOB (ref), `analytics_access_log` (→ P05).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/models` | register deterministic model |
| GET | `/api/v1/analytics/predictions/retirement` | retirement forecast (P02-scoped) |

- **UI Behavior Notes:** Retirement timeline + heatmap (age band × cadre); horizon selector; drillable to P02-permitted individuals; "deterministic" label; freshness badge.
- **Edge Cases:** Missing/invalid DOB (excluded, data-quality flag); cadre rule change (recompute, new knowledge-version); already separated (excluded).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ModelRegistryController`, `RetirementForecaster`, `SuppressionDecorator` |
| Backend Flow | Register (methodology) → on run compute retirement_date = DOB + cadre rule → bucket by horizon/scope (P02) → suppress small cells → persist with data_as_of |
| Data Operations | INSERT prediction_model/result; SELECT DOB + cadre rules; no source writes |
| Validation | Methodology present; DOB validity; horizon validity |
| Authorization | **P02**: HR/Dept Head/Exec scoped; individual lists P02 + suppressed |
| State Changes | model DRAFT→ACTIVE→RETIRED (P01); result rows; async access_log on drill (→ P05) |
| Failure Handling | Missing DOB → excluded + flag; feature mart missing → `PRECONDITION_FAILED(412)` |
| Dependencies | FR-03, FR-04 (P02), FR-17, FR-23; G01 retirement rules |
| Test Guidance | Deterministic retirement math; horizon boundaries; suppression; knowledge-version on DOB correction |

---

### FR-G14-14 — Benchmarking & Comparative Analytics (Effective-Dated Targets)

- **Module:** G14-F14
- **Primary Role(s):** Department Head, Executive, HR Admin
- **User Story:** As an Executive, I want to compare KPIs across periods, peer org units, and against the target in force for each period, so I can see who is improving, who lags, and where to intervene — on a like-for-like basis.
- **Description:** Comparative views over governed KPIs: period-over-period, peer comparison (normalised), and target-vs-actual against the effective-dated `kpi_target_history` value. **P02-scoped**; suppression-applied. RAG uses the period-correct target.
- **Acceptance Criteria:**
  - AC1: A KPI compared across selectable periods with variance and % change.
  - AC2: Peer comparison ranks sibling org units on a normalised basis within P02 scope.
  - AC3: Target-vs-actual shows attainment % and RAG based on `direction` and the target in force for that period.
  - AC4: Comparisons exclude units outside P02 scope and suppress small denominators.
  - AC5: Outliers highlighted with basis explained.
  - AC6: External benchmark series shown as a clearly-labelled external reference line.
- **Business Rules:**
  - BR1: Comparisons use governed KPI snapshots only.
  - BR2: Size-sensitive metrics normalised before ranking.
  - BR3: A user cannot benchmark against a peer unit outside P02 scope.
  - BR4: External benchmarks reference-only, visually distinguished.
  - BR5: RAG/attainment use the effective-dated target for the shown period.
- **Data Model References:** `kpi_snapshot`, `kpi_target_history`, `kpi_definition` (direction), `analytics_datamart` (denominators), `analytics_scope_policy` (P02 dims).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/benchmark/period?kpi=&periods=` | period-over-period |
| GET | `/api/v1/analytics/benchmark/peers?kpi=&scope=` | peer ranking (P02) |
| GET | `/api/v1/analytics/benchmark/target?kpi=&scope=&period=` | target-vs-actual (effective-dated) |

- **UI Behavior Notes:** Comparison panel with period selector, normalised peer ranking, variance arrows, RAG gauges (period-correct target), outlier highlights, optional external reference line.
- **Edge Cases:** Peer with zero denominator (excluded + note); new unit lacking history ("insufficient history"); target unset for period (target view hidden); version change in series (marker, FR-02).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenchmarkController`, `PeriodComparator`, `PeerRanker`, `TargetAttainmentService` (effective-dated), `NormalizationService` |
| Backend Flow | Call **P02** for scope + peers → pull governed snapshots → normalise → fetch period-correct target → compute variance/rank/attainment/RAG → flag outliers → suppress → assemble |
| Data Operations | SELECT kpi_snapshot + kpi_target_history + denominators (P02); no writes |
| Validation | Peer scope membership (P02); denominator presence; target presence |
| Authorization | **P02**: Dept Head/Exec/HR scoped |
| State Changes | none (read-only); async access_log on view (→ P05) |
| Failure Handling | Missing denominator → excluded + note; no target → hidden; no history → insufficient-history state |
| Dependencies | FR-02, E17 targets, FR-04 (P02), FR-17 |
| Test Guidance | Normalisation; peer-scope exclusion (P02); effective-dated RAG; outlier basis |

---

### FR-G14-15 — Natural-Language Query (Confidence-Gated, P03-Aligned) & Hardened Embedded BI (X.3)

- **Module:** G14-F15
- **Primary Role(s):** HR Admin, Department Head, Executive; Analytics Administrator (embed config)
- **User Story:** As an HR Admin, I want to ask questions in plain language and embed governed widgets in other portals, so analytics are accessible and reusable — always within my P02 permissions, never confidently wrong, never leaking a credential.
- **Description:** **NL query (Phase 3, P03-aligned):** maps a question to the governed semantic model, generates a **P02-scoped** parameterised query, and returns a result + resolved interpretation. It follows **P03 guardrails**: all model calls backend-only (API key never reaches the client); **PII stripped server-side before any model call**; **informational-only** (never triggers workflows); a confidence threshold below which it clarifies/refuses; logs every interpretation to `nl_query_log`; uses a **named on-prem LLM at the CGG Data Centre** (no egress). **Embedded BI (X.3):** tokens issued **maker-checker (P01)**, never travel in a URL, carry CSP `frame-ancestors`, are revocable/rotatable (outbound via **X.3** conventions; credentials per P04), and re-validate **P02 scope** per render.
- **Acceptance Criteria:**
  - AC1: An NL question resolves to a governed KPI/dimension/filter set and returns a **P02-scoped** result with the interpretation shown.
  - AC2: An ambiguous question prompts clarification; out-of-scope is refused with explanation; below-threshold confidence is refused (`ERR-G14-NLQ-CONF`), not answered.
  - AC3: NL never generates raw SQL; only parameterises the governed semantic model (PII stripped server-side per P03).
  - AC4: An embed token is scoped to specific widgets, a user/role, an expiry; it enforces the same **P02** scope; issuance is maker-checker (P01, ≠ issuer).
  - AC5: Every NL query (confidence + outcome) and embedded render writes audit (`nl_query_log` / async access_log → P05).
  - AC6: NL results carry the same freshness, suppression, and P02 sensitivity handling as native widgets.
  - AC7: The embed credential is never accepted from the URL; a revoked token returns `UNAUTHENTICATED(401)` `ERR-G14-EMBED-REVOKED`; CSP `frame-ancestors` restricts embedding origins (X.3).
- **Business Rules:**
  - BR1: NL constrained to the semantic layer + governed KPIs; cannot fabricate metrics.
  - BR2: Embed tokens are scoped, signed, expiring, revocable, rotatable; not API bypass keys; outbound on X.3.
  - BR3: NL interpretation always shown; interpretation + confidence logged (informational-only per P03).
  - BR4: RESTRICTED metrics require the same P02 authority via NL/embed as in-app.
  - BR5: LLM provider + hosting named on-prem (CGG Data Centre); prompts/data do not egress; PII stripped server-side.
- **Data Model References:** `kpi_definition`/`analytics_datamart` (semantic), `nl_query_log`, `embed_token`, `dashboard_widget`, `analytics_scope_policy` (P02 dims).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/nlq` | NL query (confidence-gated, P03 guardrails) |
| POST | `/api/v1/analytics/embed-tokens` | issue scoped embed token (maker) |
| POST | `/api/v1/analytics/embed-tokens/{id}:approve` | approve (P01 checker ≠ issuer) |
| POST | `/api/v1/analytics/embed-tokens/{id}:revoke` | revoke token |
| POST | `/api/v1/analytics/embed/session` | exchange short-lived code → render session (token in header, not URL) |

- **UI Behavior Notes:** NL search bar with examples; result card showing interpreted KPI/filters + value/chart + freshness + confidence; clarification chips; refusal copy for low confidence/out-of-scope; embed manager (select widgets, role/user, expiry, frame-ancestors, header/code-exchange snippet, **not** a URL token); revocation/rotation controls.
- **Edge Cases:** NL maps to multiple plausible KPIs (asks user to choose); unmodelled metric (`ERR-G14-METRIC-NA`); confidence below threshold (refuse + log); embed token expired/revoked (auth-expired state); embed used by out-of-scope user (P02 empties result).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `NlqController`, `SemanticMapper`, `IntentResolver` (confidence), `NlQueryLogger`, `EmbedTokenService` (P01 maker-checker), `EmbedSessionExchanger`, `EmbedRenderer` (X.3) |
| Backend Flow | NL → strip PII server-side (P03) → map intent to governed KPI/dims/filters with confidence → if < threshold clarify/refuse → else compile **P02-scoped** parameterised query → execute (suppressed) → return result + interpretation; log. Embed → issue (maker) → approve (P01 checker) → render via header/code-exchange (X.3) → validate signature/**P02 scope**/expiry/revocation per render |
| Data Operations | SELECT marts (P02, suppressed); no free SQL; INSERT nl_query_log; async INSERT access_log (→ P05); INSERT/UPDATE embed_token |
| Validation | Intent within semantic model; confidence threshold; token signature/scope/expiry/revocation; sensitivity authority (P02); frame-ancestors |
| Authorization | Same **P02** as native; embed scoped to token; issuance maker-checker (P01) |
| State Changes | nl_query_log + async access_log; embed_token lifecycle; no source mutation |
| Failure Handling | Ambiguous → `ERR-G14-NLQ-CLARIFY` (200 options); low confidence → `VALIDATION_FAILED(422)` `ERR-G14-NLQ-CONF`; unmodelled → `NOT_FOUND(404)` `ERR-G14-METRIC-NA`; bad/expired token → `UNAUTHENTICATED(401)` `ERR-G14-EMBED-INVALID`; revoked → `UNAUTHENTICATED(401)` `ERR-G14-EMBED-REVOKED` |
| Dependencies | FR-02, FR-04 (P02), FR-12, FR-17; **P03 (grounding/guardrails), X.3 (outbound), P04 (credentials), P01** |
| Test Guidance | Intent→governed only; confidence gating; PII-strip before model call; provenance logging; token scope/expiry/revocation; no token in URL; CSP frame-ancestors; embed P02 parity |

---

### FR-G14-16 — Mobile Dashboards, Executive Briefing Pack & Offline RESTRICTED-Data Policy

- **Module:** G14-F16
- **Primary Role(s):** Executive, Department Head, Manager
- **User Story:** As an Executive, I want responsive mobile dashboards and a periodic briefing pack, so I can monitor the workforce from my phone — without RESTRICTED PII ever resting unprotected on the device.
- **Description:** Mobile-optimised renderings of role dashboards plus a scheduled executive briefing pack (PDF/in-app digest) generated under the recipient's **P02 scope** via the FR-09 X.1 pipeline. **Offline policy:** the on-device cache is encrypted, **excludes RESTRICTED fields/PII** (per the P02 PII ceiling), enforces cache expiry, and supports remote-wipe; offline shows last-loaded non-restricted view with an explicit stale badge.
- **Acceptance Criteria:**
  - AC1: Role dashboards render legibly on mobile breakpoints (375/768/1280) with touch drill-down and an alert inbox.
  - AC2: An executive briefing pack can be scheduled (X.1) and delivered as a P02-scope-correct PDF + in-app digest (X.2).
  - AC3: The briefing includes top KPIs, key trends, open critical alerts, compliance highlights for the recipient's scope.
  - AC4: Briefing figures carry `data_as_of` and freshness state.
  - AC5: Mobile views enforce the same **P02** scope, suppression, and sensitivity masking as desktop.
  - AC6: Briefing generation reuses the FR-09 X.1 pipeline and is audited (→ P05).
  - AC7: The on-device cache is encrypted and excludes RESTRICTED fields; cache expires per policy; remote-wipe invalidates it; offline never reveals RESTRICTED PII.
- **Business Rules:**
  - BR1: Mobile is the same governed data and **P02 scope** — no relaxed scoping.
  - BR2: The briefing pack is generated per recipient under their P02 scope.
  - BR3: Briefing content configurable per role but limited to governed KPIs/compliance metrics.
  - BR4: Critical alerts always appear.
  - BR5: RESTRICTED fields/PII never written to the offline cache (P02 PII ceiling); only PUBLIC/INTERNAL aggregates cached, encrypted, with expiry.
- **Data Model References:** `dashboard`/`dashboard_widget`, `report_schedule`/`report_execution`, `kpi_snapshot`/`alert_event`, `documents` (G13).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/dashboards/{id}/render?viewport=mobile` | mobile render |
| POST | `/api/v1/analytics/briefings/schedules` | schedule briefing (X.1) |
| GET | `/api/v1/analytics/briefings/{executionId}` | briefing artefact |

- **UI Behavior Notes:** Mobile layout (stacked cards, swipeable sparklines, collapsible sections, bottom-nav, alert badge); briefing digest with as-of + "open full dashboard"; PDF mirrors digest; offline shows non-restricted cached view + stale badge; settings expose remote-wipe.
- **Edge Cases:** Offline/poor connectivity (last-loaded non-restricted cached + stale badge, no silent refresh); very small screen (progressive disclosure); recipient scope emptied (digest notes "no data in scope"); lost device (remote-wipe).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `MobileRenderer`, `BriefingComposer`, reuse FR-09 **X.1 scheduler/X.2 delivery**, `FreshnessDecorator`, `OfflineCacheGuard` |
| Backend Flow | Mobile render → same pipeline with viewport hint, **P02-masked**, RESTRICTED stripped from cacheable payload; Briefing → scheduled per recipient (X.1) → resolve P02 scope → compose top KPIs/alerts/compliance → render PDF + in-app → deliver (X.2) → log (→ P05) |
| Data Operations | SELECT marts/snapshots/alerts (P02, suppressed); INSERT report_execution; create document ref (G13) |
| Validation | Viewport handling; recipient scope (P02); governed-content only; offline-cacheability (no RESTRICTED per PII ceiling) |
| Authorization | Same **P02** as desktop; per-recipient briefing scope |
| State Changes | execution + document + async access_log; notification (X.2) |
| Failure Handling | Offline → non-restricted cached + stale badge; empty scope → "no data" digest; render fail → retry+alert (X.1) |
| Dependencies | FR-01, FR-09 (X.1/X.2), FR-11, FR-12, FR-17; P02 (PII ceiling) |
| Test Guidance | P02 parity mobile vs desktop; per-recipient briefing scope; critical-alert inclusion; offline excludes RESTRICTED; encrypted cache; remote-wipe |

---

### FR-G14-17 — Metric-Level Privacy & Complementary Suppression (`GAP (gov-specific)` — R1, Critical)

- **Module:** G14-F17
- **Primary Role(s):** Analytics Administrator (configure), all roles (enforced)
- **User Story:** As an Analytics Administrator, I want suppression applied to KPI tiles, charts, and exports — not just drill-through — with complementary suppression across overlapping scopes/periods, so no individual is re-identified by aggregate arithmetic even when P02 row-level access is airtight.
- **Description:** A cross-cutting privacy layer governed by `suppression_policy` (E24), **layered on top of P02**. P02 stops record leakage; FR-17 stops **metric re-identification** — a genuine `GAP (gov-specific)` the platform does not provide. For every aggregate read (after P02), any cell whose group size/denominator `< k` is suppressed/banded; the engine additionally applies **complementary suppression** so a hidden value cannot be recovered by subtracting visible totals, including across this-period-vs-last-period and with-vs-without-one-unit differencing.
- **Acceptance Criteria:**
  - AC1: A cell with denominator/group size `< k` (default 5, per-KPI override `min_cell_size`) is suppressed/banded ("<5").
  - AC2: When a cell is suppressed, complementary cells are suppressed so the value cannot be recovered from a visible total.
  - AC3: Differencing two overlapping scopes/periods cannot reconstruct a suppressed cell (verified by the suppression test harness).
  - AC4: Suppression applies uniformly to tiles, charts, exports, and drill-through.
  - AC5: A suppressed aggregate read returns/annotates `ERR-G14-SMALL-CELL`; partial → `ERR-G14-COMP-SUPPRESS` notice.
  - AC6: The aggregate-re-identification test matrix is a launch gate (§13.4).
- **Business Rules:**
  - BR1: Suppression applied **after P02 and field masking**, on the final aggregate, server-side; clients never receive suppressed values.
  - BR2: `k` and banding configurable per policy and per KPI; the stricter applies.
  - BR3: Suppression never disabled for RESTRICTED domains; an admin cannot lower `k` below the statutory minimum.
  - BR4: Suppression deterministic for a given `(query, k, data)` so trends remain stable.
- **Data Model References:** `suppression_policy`, `kpi_snapshot` (cell_size), `kpi_definition` (min_cell_size), `analytics_access_log` (→ P05).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/suppression-policies` | create/update policy |
| GET | `/api/v1/analytics/suppression-policies?cursor=` | list policies |
| (cross-cutting) | applied within every aggregate read | tiles/charts/exports/drill (after P02) |

- **UI Behavior Notes:** Suppressed cells render "<5" / "below privacy threshold" with tooltip; admin policy editor (k, banding, complementary toggle, domain scope); suppression-simulation preview.
- **Edge Cases:** Single non-suppressed cell in a row with visible total (complementary hides a second cell); time-series where one period drops below k (banded + adjacent complement); export of fully-small dataset (whole grid banded with header note).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SuppressionPolicyController`, `SmallCellSuppressor`, `ComplementarySuppressionEngine`, `SuppressionDecorator` |
| Backend Flow | Compute aggregate (**post-P02**) → evaluate each cell's group size → suppress/band below k → complementary pass across row/column/period overlaps → annotate → enqueue audit (→ P05) |
| Data Operations | Read cell_size from snapshot/aggregate; no writes to source |
| Validation | k ≥ statutory minimum; deterministic suppression; complementary completeness |
| Authorization | **P02**: Admin configure; all enforced |
| State Changes | none (read-only decoration); audit annotation |
| Failure Handling | Below threshold → `ERR-G14-SMALL-CELL`; partial → `ERR-G14-COMP-SUPPRESS` |
| Dependencies | FR-04 (P02, applied first); consumed by FR-01/05/06/07/08/09/10/14/16 |
| Test Guidance | Aggregate re-identification harness (differencing attacks); complementary completeness; determinism/trend stability; export parity |

---

### FR-G14-18 — Probabilistic Predictive Analytics with Fairness Governance & Friction-Gated Scores (`GAP (gov-specific)` — R4, Critical; Phase 3)

- **Module:** G14-F18
- **Primary Role(s):** HR Admin, Department Head, Executive; Analytics Administrator (model governance); DPO (fairness sign-off)
- **User Story:** As an HR Admin, I want explainable attrition and succession risk that is fairness-audited, excludes protected/correlated attributes, and gates individual scores behind a deliberate, purpose-stated action, so I can target retention and succession without enabling discriminatory or constitutionally-impermissible decisions.
- **Description:** Registers **probabilistic** `prediction_model`s (attrition, succession) over governed marts. Mirrors P03's informational-only posture. **Before activation** a model must publish a model card, declare `protected_features_excluded` (caste/reservation category, gender, disability, maternity-linked leave proxies), pass documented **adverse-impact testing** (`fairness_status=PASSED` or `WAIVED_WITH_REASON` by the DPO), and carry `intended_use` + `prohibited_use`. Activation is a **P01 maker-checker** flow with DPO co-sign (SoD by P02). Aggregate/banded distributions are P02-scope viewable; **individual scores are friction-gated** — opening a named individual's score requires a deliberate action, purpose prompt, RESTRICTED authority (P02), and a FULL-fidelity audit entry (→ P05).
- **Acceptance Criteria:**
  - AC1: A probabilistic model cannot activate without a model card, `protected_features_excluded`, and `fairness_status ∈ {PASSED, WAIVED_WITH_REASON}`; else `VALIDATION_FAILED(422)` `ERR-G14-FAIRNESS`.
  - AC2: Activation requires `approved_by ≠ created_by` (P01); DPO co-signs the fairness assessment.
  - AC3: Aggregate/banded distributions viewable to P02-authorised scope (suppressed below k).
  - AC4: Opening an individual score requires a deliberate "view individual prediction" action with a purpose prompt; RESTRICTED, friction-gated, audited (`VIEW_INDIVIDUAL_PREDICTION` → P05).
  - AC5: Surfacing an individual score on hover/tile, or by an unauthorised role, returns `FORBIDDEN(403)` `ERR-G14-PRED-GATED`.
  - AC6: Every predictive figure labelled advisory with model id, version, confidence, `data_as_of`, prohibited-use; new joiners → `NO_PREDICTION`, not a false HIGH.
- **Business Rules:**
  - BR1: Predictions advisory; never written to G01–G13; never the sole/primary basis for any administrative action.
  - BR2: Protected/correlated attributes excluded from features; the exclusion list is part of the model card and audited.
  - BR3: Adverse-impact thresholds documented; FAILED cannot activate; WAIVED records the DPO reason.
  - BR4: Individual scores RESTRICTED + friction-gated (P02); aggregate distributions follow P02 + suppression.
  - BR5: Data drift flags a model for re-review; a drifted model's results freeze read-only.
- **Data Model References:** `prediction_model` (fairness fields, model_card_ref → G13), `prediction_result` (is_individual_gated), marts (features, protected excluded), `analytics_access_log` (VIEW_INDIVIDUAL_PREDICTION → P05).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/models` | register probabilistic model (card + exclusions) |
| POST | `/api/v1/analytics/models/{id}:assess-fairness` | run/record adverse-impact test |
| POST | `/api/v1/analytics/models/{id}:activate` | activate (P01 checker + DPO co-sign) |
| GET | `/api/v1/analytics/predictions/attrition?scope=` | aggregate/banded distribution |
| GET | `/api/v1/analytics/predictions/succession?scope=` | succession risk distribution |
| POST | `/api/v1/analytics/predictions/individual` | friction-gated individual score (purpose required) |

- **UI Behavior Notes:** Predictive dashboard with risk-band distribution + succession heatmap; prominent "Advisory — must not be the sole/primary basis for action" banner; model-card link; individual score behind explicit action + mandatory purpose field + friction confirmation; never on hover.
- **Edge Cases:** Insufficient history (NO_PREDICTION); model retired/drifted (frozen); fairness FAILED (blocked); WAIVED (DPO reason recorded + shown to Auditor); slice by a protected attribute (rejected).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ModelRegistryController`, `FairnessAssessor`, `AttritionScorer`, `SuccessionAnalyzer`, `ExplainabilityService`, `IndividualScoreGate` |
| Backend Flow | Register (card + exclusions) → assess fairness → activate (**P01 checker + DPO**) → on run assemble features (protected excluded) from marts (**P02**) → score → derive band + factors + confidence → persist; aggregate views suppressed; individual view friction-gated + audited (→ P05) |
| Data Operations | INSERT prediction_model/result; create model-card doc (G13); SELECT feature marts; FULL-fidelity access_log on individual view |
| Validation | Model card present; exclusions present; fairness PASSED/WAIVED; methodology; confidence; advisory labelling |
| Authorization | **P02**: HR/Dept Head/Exec aggregate scoped; individual RESTRICTED + friction-gated; DPO co-sign (P01) |
| State Changes | model DRAFT→ACTIVE→RETIRED; fairness_status; result rows; access_log VIEW_INDIVIDUAL_PREDICTION (→ P05) |
| Failure Handling | No fairness → `VALIDATION_FAILED(422)` `ERR-G14-FAIRNESS`; individual ungated → `FORBIDDEN(403)` `ERR-G14-PRED-GATED`; insufficient data → NO_PREDICTION; black-box → `ERR-G14-METHODOLOGY` |
| Dependencies | FR-03, FR-04 (P02), FR-17, FR-13; **P01, P05, DPO governance** |
| Test Guidance | Adverse-impact gate; protected-attribute exclusion; friction-gate; prohibited-use labelling; NO_PREDICTION for new joiners; drift freeze |

---

### FR-G14-19 — Establishment & Position-Management Reference Integration (`GAP (gov-specific)` — R8, High)

- **Module:** G14-F19
- **Primary Role(s):** Establishment Officer (maintain), HR Admin/Dept Head/Executive/Auditor (consume)
- **User Story:** As an Establishment Officer, I want a position/establishment master — sanctioned strength, posts, reservation categories, roster points — so vacancy and reservation compliance have an authoritative denominator that no person-centric module (G01–G13) currently owns.
- **Description:** Names and hosts the establishment source of record as `establishment_position` (E21), exposed through `MART_ESTABLISHMENT`. **`GAP (gov-specific)`** — no PrimeSoft module owns posts. It is the authoritative denominator for vacancy (FR-05) and reservation compliance (FR-07). The Establishment Officer (new gov role) authors values; G14 reports compliance and never approves posts. Effective-dating reuses the platform VAL-EFFECTIVE mechanism.
- **Acceptance Criteria:**
  - AC1: An Establishment Officer can create/maintain positions with sanctioned strength, cadre, designation, org unit, reservation category, roster point, with effective dates (VAL-EFFECTIVE).
  - AC2: `MART_ESTABLISHMENT` exposes positions for vacancy/reservation denominators.
  - AC3: Vacancy = sanctioned − filled; reservation compliance = filled-by-category / sanctioned-for-category vs roster points.
  - AC4: Missing establishment data raises `ERR-G14-ESTAB-MISSING` (notice), never a silent zero.
  - AC5: Position changes effective-dated; historical vacancy reproduces against the establishment in force (FR-23).
  - AC6: Establishment edits audited (→ P05); G14 does not adjudicate roster decisions.
- **Business Rules:**
  - BR1: G14 hosts the establishment reference; the Establishment Officer is custodian.
  - BR2: Sanctioned strength + roster points authored here, not invented by analytics.
  - BR3: Vacancy/reservation denominators pinned to this reference + effective-dated record.
  - BR4: ABOLISHED positions excluded from current sanctioned strength but retained for history.
- **Data Model References:** `establishment_position`, `analytics_datamart` (MART_ESTABLISHMENT), `org_units`/`designations`/`cadres` (ref), `employees` (filled mapping).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/establishment/positions` | create/maintain position |
| GET | `/api/v1/analytics/establishment/positions?scope=&cursor=` | list positions (P02-scoped) |
| GET | `/api/v1/analytics/establishment/vacancy-base?scope=&period=` | sanctioned-strength denominator |

- **UI Behavior Notes:** Establishment console (position list with sanctioned strength, category, roster point, effective dates, status); create/edit form (W.2-style); data-quality flags for unmapped posts; read views for consumers.
- **Edge Cases:** Post sanctioned but unfilled (counts vacant); post abolished mid-year (excluded current, retained historically); roster point conflict (flagged, not auto-resolved).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `EstablishmentController`, `PositionService`, `EstablishmentMartBuilder` |
| Backend Flow | Maintain positions (effective-dated via VAL-EFFECTIVE) → build MART_ESTABLISHMENT → join to headcount for vacancy/reservation → expose denominator API |
| Data Operations | INSERT/UPDATE establishment_position; build mart; SELECT (P02) |
| Validation | Sanctioned strength ≥ 0; effective-date integrity (VAL-EFFECTIVE); roster-point uniqueness per category/unit |
| Authorization | **P02**: Establishment Officer maintain; consumers read scoped |
| State Changes | position SANCTIONED/FROZEN/ABOLISHED; mart refresh (X.1); audit (P05) |
| Failure Handling | Missing reference → `ERR-G14-ESTAB-MISSING`; roster conflict → data-quality flag |
| Dependencies | FR-05, FR-07, FR-03, FR-23; P02, P05 |
| Test Guidance | Sanctioned-vs-filled math; effective-dated denominator; abolished exclusion; missing-reference notice |

---

### FR-G14-20 — DPDP Rectification & Erasure Propagation (`GAP (gov-specific)` — R9, Critical)

- **Module:** G14-F20
- **Primary Role(s):** Data Protection Officer (govern/approve), Data Engineer (execute), Auditor (verify)
- **User Story:** As a Data Protection Officer, I want a correction or erasure of an employee's PII in G01 (or a DPDP data-principal request / consent withdrawal) to propagate across the entire analytics estate — marts, snapshots, predictions, export artefacts — reconciled against statutory retention, so the analytics layer is not an uncontrolled second copy of unlawful or stale personal data.
- **Description:** A propagation pipeline driven by `data_subject_change` (E22). On a rectification/erasure/restriction event from G01, a DPDP request, or a `consent_records` withdrawal (Platform §P05), G14 runs impact analysis, then **rectifies** (re-derives snapshots as new knowledge-versions, FR-23), **erases/purges** (`prediction_result` rows; marks `report_execution` artefacts REDACTED in G13), and **reconciles against statutory retention**: where retention legally overrides erasure, the change is `BLOCKED_RETENTION` with a recorded `legal_basis`. **Audit erasure uses the P05 redaction marker** (the only permitted `audit_log` mutation) — historical audit rows are never deleted.
- **Acceptance Criteria:**
  - AC1: A `data_subject_change` triggers impact analysis identifying all affected derived rows/artefacts.
  - AC2: Rectification re-derives affected snapshots as new knowledge-versions; prior rows superseded, not mutated (FR-23).
  - AC3: Erasure purges `prediction_result` rows and marks affected `report_execution` artefacts REDACTED in G13.
  - AC4: Where statutory retention overrides erasure → `BLOCKED_RETENTION` with `legal_basis`; data restricted from rendering rather than deleted.
  - AC5: Propagation completes within SLA; incomplete → `ERR-G14-ERASURE-PENDING` on affected surfaces.
  - AC6: The DPO and Auditor can verify completeness via **P05 query**; every change append-only audited.
- **Business Rules:**
  - BR1: Append-only ledgers reconciled with erasure by **restriction/redaction + knowledge-versioning** (consistent with P05 immutability), not by deleting historical audit rows.
  - BR2: A retention override records a legal basis and is reviewable by the Auditor.
  - BR3: Erased/restricted subjects excluded from all new analytics computations and renders.
  - BR4: Propagation idempotent and resumable; a failed step retries (X.1) and alerts (X.2).
- **Data Model References:** `data_subject_change`, `kpi_snapshot`, `prediction_result`, `report_execution`/`documents` (G13), `analytics_datamart`; reconciled with **P05 redaction marker + `consent_records`**.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/data-subject-changes` | register rectification/erasure (DPO/G01) |
| GET | `/api/v1/analytics/data-subject-changes/{id}` | propagation status |
| POST | `/api/v1/analytics/data-subject-changes/{id}:retention-override` | record legal basis (DPO) |

- **UI Behavior Notes:** DPO console listing changes with type, status, affected counts, SLA; impact-analysis preview; retention-override form with mandatory legal basis; Auditor verification view; affected surfaces note "data updated/erased per data-protection request".
- **Edge Cases:** Subject in an exported PDF in G13 (artefact REDACTED, regenerated where lawful); erasure on a pension-retained record (BLOCKED_RETENTION + basis); concurrent rectification + report run (run waits or re-runs on the new knowledge-version).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `DataSubjectChangeController`, `ImpactAnalyzer`, `RectificationPropagator`, `ErasurePurger`, `RetentionReconciler` |
| Backend Flow | Receive change (G01/DPO/consent withdrawal) → impact analysis → rectify (knowledge-versions) / purge predictions / mark exports REDACTED → reconcile retention → P05 redaction marker for audit PII → update status → audit → notify DPO/Auditor (X.2) |
| Data Operations | INSERT data_subject_change; INSERT new snapshot knowledge-versions; DELETE prediction_result; UPDATE report_execution REDACTED; UPDATE mart rows (rectification); **P05 redaction marker on audit PII** |
| Validation | Subject existence; retention rule lookup; idempotency; completeness |
| Authorization | **P02**: DPO govern/override; Data Engineer execute; Auditor verify (P05) |
| State Changes | change RECEIVED→PROPAGATING→COMPLETED/BLOCKED_RETENTION/FAILED; snapshots superseded; artefacts REDACTED |
| Failure Handling | Step failure → retry (X.1) + alert; incomplete → `ERR-G14-ERASURE-PENDING`; retention block → `ERR-G14-RETENTION-BLOCK` |
| Dependencies | G01 PII events, G13 artefacts, FR-23, FR-13/18; **P05 (redaction/consent), X.1, X.2** |
| Test Guidance | Propagation completeness; retention override; append-only reconciliation (P05); idempotency/resumability |

---

### FR-G14-21 — Source Data Contracts & Schema-Drift Protection (R11, High)

- **Module:** G14-F21
- **Primary Role(s):** Data Engineer (own/maintain), owning-module steward (co-sign)
- **User Story:** As a Data Engineer, I want a versioned data contract between each source module and its marts, with CI contract tests and breaking-change alerts, so upstream schema drift fails loudly in CI rather than silently breaking mart ETL in production.
- **Description:** Introduces `source_data_contract` (E19): a versioned source-view contract per mart pinning columns, types, nullability, semantics each source module (G01–G13) promises, plus the CDC mechanism (**Debezium** default). Contract tests run in CI; a breaking change fails CI and alerts both teams (X.2). A mart whose contract is BREACHED is held from refresh (FR-03 BR5). This keeps marts as **read models** decoupled from owning tables.
- **Acceptance Criteria:**
  - AC1: Each mart references a `source_data_contract` pinning schema + CDC mechanism.
  - AC2: CI runs contract tests against each source view; a mismatch fails the build with the offending field.
  - AC3: A breaking change marks the contract BREACHED, holds the mart, alerts the Data Engineer + owning-module steward (X.2).
  - AC4: A contract is versioned; a new source-view version requires a co-signed contract update.
  - AC5: The CDC mechanism is named (Debezium) and recorded per contract.
  - AC6: Contract status + last test timestamp visible in the Data Engineer console.
- **Business Rules:**
  - BR1: G14 reads sources only through contracted views, never raw tables.
  - BR2: A breaking change follows the contract's notice period before deprecation.
  - BR3: Contract tests are a CI gate; a BREACHED contract blocks production refresh.
  - BR4: The owning-module steward co-signs the schema promise.
- **Data Model References:** `source_data_contract`, `analytics_datamart`, `datamart_refresh_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/analytics/source-contracts` | register/version a contract |
| POST | `/api/v1/analytics/source-contracts/{id}:test` | run contract test |
| GET | `/api/v1/analytics/source-contracts?module=&cursor=` | list contracts/status |

- **UI Behavior Notes:** Contract registry (module, source view, version, CDC, status, last test); failing-field detail on breach; co-sign workflow; alert links.
- **Edge Cases:** Additive non-breaking change (minor-versioned, no hold); breaking change without notice (BREACHED, held, alert); source view renamed (contract update before refresh).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `SourceContractController`, `ContractTestRunner`, `SchemaDiffer`, `BreachAlerter` |
| Backend Flow | Register contract → CI/manual test compares live source view to `schema_json` → on mismatch mark BREACHED + hold dependent marts + alert (X.2); on co-signed new version activate |
| Data Operations | INSERT/UPDATE source_data_contract; read source view metadata; update mart hold state |
| Validation | Schema diff; CDC mechanism; co-sign; version monotonicity |
| Authorization | **P02**: Data Engineer own; owning-module steward co-sign |
| State Changes | contract DRAFT→ACTIVE→DEPRECATED/BREACHED; mart refresh hold; alerts (X.2) |
| Failure Handling | Mismatch → `ERR-G14-CONTRACT` (CI fail / runtime hold) + alert |
| Dependencies | FR-03 marts; CI pipeline; source modules G01–G13; X.2 |
| Test Guidance | Breaking-change detection; additive-change tolerance; mart hold on breach; co-sign enforcement |

---

### FR-G14-22 — Access-Anomaly Detection (world-class addition; over the P05-mirrored ledger)

- **Module:** G14-F22
- **Primary Role(s):** Auditor, Analytics Administrator (review)
- **User Story:** As an Auditor, I want proactive detection of anomalous analytics access — out-of-hours bulk exports, scope-edge probing, unusual drill-through volume — so the audit ledger becomes preventive, not merely forensic.
- **Description:** A detection layer over the async-partitioned `analytics_access_log` (E16) **that mirrors into P05**. An **X.1 job** computes per-user/role baselines and flags deviations as `access_anomaly` (E23): off-hours bulk export, scope-edge probing (repeated near-boundary denied requests against P02), unusual drill-through volume, repeated denials, mass NL queries. Anomalies raise notifications (X.2) to Auditor/Analytics Admin and feed a review queue.
- **Acceptance Criteria:**
  - AC1: The X.1 job evaluates the ledger on a schedule and flags anomalies against per-user/role baselines.
  - AC2: Off-hours bulk export above threshold raises an `access_anomaly` (WARNING/CRITICAL).
  - AC3: Repeated denied/edge-probing requests (P02 denials) raise `SCOPE_EDGE_PROBING`.
  - AC4: Anomalies notify Auditor/Analytics Admin (X.2) and appear in a review queue with evidence.
  - AC5: A reviewer can mark INVESTIGATING/DISMISSED/CONFIRMED; the decision is audited (→ P05).
  - AC6: Detection reads the append-only ledger only; never blocks legitimate access (advisory + review).
- **Business Rules:**
  - BR1: Detection operates on the partitioned async ledger off the read path (no added read latency).
  - BR2: Thresholds/baselines configurable; CRITICAL anomalies always notify the Auditor.
  - BR3: Anomaly review decisions append-only audited (P05).
  - BR4: Detection advisory; informs investigation, does not auto-revoke access (P02 remains the gate).
- **Data Model References:** `access_anomaly`, `analytics_access_log` (→ P05), `notifications` (X.2).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/anomalies?status=&cursor=` | list anomalies (P02-scoped) |
| POST | `/api/v1/analytics/anomalies/{id}:review` | mark INVESTIGATING/DISMISSED/CONFIRMED |
| POST | `/api/v1/analytics/anomaly-rules` | configure thresholds/baselines |

- **UI Behavior Notes:** Anomaly queue with type, severity, evidence (counts, times), user/role; review actions; anomaly trend; threshold configuration.
- **Edge Cases:** Legitimate quarter-end bulk export (reviewer dismisses with note); new user with no baseline (cold-start uses role baseline); detection job lag (queue notes evaluation as-of).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | **X.1 `AnomalyDetector`**, `BaselineService`, `AnomalyController`, `AnomalyNotifier` (X.2) |
| Backend Flow | X.1 scheduled scan of partitioned ledger → compute baselines → flag deviations → INSERT access_anomaly → notify (X.2) → expose review queue |
| Data Operations | SELECT access_log (partitioned); INSERT access_anomaly; INSERT notifications; UPDATE review status |
| Validation | Threshold config; baseline sufficiency; evidence completeness |
| Authorization | **P02**: Auditor/Analytics Admin review; configure by Analytics Admin |
| State Changes | anomaly OPEN→INVESTIGATING→DISMISSED/CONFIRMED; notifications (X.2) |
| Failure Handling | Detection job failure → retry (X.1) + ops alert; cold-start → role baseline |
| Dependencies | FR-04/§8.1 async ledger (→ P05); X.1, X.2 |
| Test Guidance | Off-hours bulk-export detection; scope-edge probing (P02 denials); baseline cold-start; advisory (non-blocking) |

---

### FR-G14-23 — Bitemporal Snapshot & As-Of-Knowledge Reproducibility (`GAP (gov-specific)` — R3, Critical)

- **Module:** G14-F23
- **Primary Role(s):** Auditor, Analytics Administrator, Data Engineer
- **User Story:** As an Auditor, I want every snapshot to record both the period it describes (valid-time) and when it became known (knowledge-time), and to pull "the June report as it was known in June", so a backdated correction creates a reconciling lineage instead of two contradictory numbers.
- **Description:** Establishes the bitemporal contract for `kpi_snapshot` (E04): `valid_time` + `knowledge_time`. A restatement (backdated leave approval, payroll correction, DPDP rectification) **adds a new knowledge-version** and marks the prior `is_superseded=true`; it never mutates history (consistent with **P05 append-only immutability**). Every read accepts an **`asOfKnowledge`** parameter returning the value whose `knowledge_time` is the latest ≤ the requested instant. `GAP (gov-specific)` — PrimeSoft M16 has no bitemporal reproducibility primitive.
- **Acceptance Criteria:**
  - AC1: Every `kpi_snapshot` carries `valid_time` and `knowledge_time`.
  - AC2: A restatement adds a new knowledge-version; the prior row retained, marked `is_superseded=true`, linked via `superseded_by`.
  - AC3: A read with `asOfKnowledge=T` returns the value known as of T (latest `knowledge_time ≤ T`).
  - AC4: The current (default) read returns the latest knowledge-version.
  - AC5: An auditor pulling the same period at two knowledge instants gets two reconciling values with lineage.
  - AC6: Append-only preserved — no historical row mutated/deleted (rectification adds rows; erasure restricts/redacts per FR-20 / P05 marker).
- **Business Rules:**
  - BR1: Snapshots append-only; correctness via knowledge-versioning, not mutation (P05-aligned).
  - BR2: `asOfKnowledge` honoured uniformly across KPI value, trend, report run, compliance export.
  - BR3: A backfill always produces a new knowledge-version; recompute job logged.
  - BR4: Reproducibility deterministic for `(kpi_id, kpi_version, scope, period_key, knowledge_time)`.
- **Data Model References:** `kpi_snapshot` (valid_time, knowledge_time, is_superseded, superseded_by), `datamart_refresh_log` (backfill provenance), `report_execution` (as_of_knowledge).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/analytics/kpis/{code}/value?...&asOfKnowledge=` | value as known at instant |
| GET | `/api/v1/analytics/kpis/{code}/history?scope=&period=&cursor=` | knowledge-version lineage |
| GET | `/api/v1/analytics/reports/{id}/run?asOfKnowledge=` | reproducible report run |

- **UI Behavior Notes:** Optional "as of knowledge date" control on reports/KPIs; "restated" badge with lineage popover (original vs current knowledge-versions and why); audit export stamps both valid-time and knowledge-time.
- **Edge Cases:** Multiple restatements (full lineage chain); `asOfKnowledge` before the first version (`ERR-G14-ASOF-NA`); restatement caused by DPDP rectification (FR-20) links to the change record.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BitemporalSnapshotStore`, `AsOfKnowledgeResolver`, `RestatementService`, `SnapshotMaterializer` |
| Backend Flow | Materialise snapshot with valid_time + knowledge_time → on restatement insert new knowledge-version, mark prior superseded → reads resolve latest knowledge_time ≤ requested (default = now) |
| Data Operations | INSERT snapshot knowledge-versions; UPDATE prior is_superseded/superseded_by (flags only, value immutable); SELECT by knowledge_time |
| Validation | knowledge_time monotonicity per (kpi,version,scope,period); determinism |
| Authorization | **P02**: all scoped reads honour asOfKnowledge; Auditor lineage view |
| State Changes | append knowledge-versions; supersede flags; recompute provenance |
| Failure Handling | asOfKnowledge before first version → `NOT_FOUND(404)` `ERR-G14-ASOF-NA`; recompute failure → retry (X.1) + alert |
| Dependencies | FR-02 KPI engine, FR-03 backfill, FR-20 rectification; P05 (immutability) |
| Test Guidance | As-of-knowledge reproduction (June-in-June vs June-in-September); restatement lineage; append-only preservation; determinism |

---

## 7. UI Requirements

| Area | Requirement |
|---|---|
| Information architecture | Delivered on the existing **M16 "Reports & Analytics" menu entitlement** (`analytics.*`, Foundation §6; Org Admin = cross-entity). Left nav by persona/category: My Dashboard, Workforce, Operational, Compliance, Reports, Predictive, Establishment (officers), Data Health (operators), Anomalies (auditor/admin), Data-Protection (DPO). **Menu visibility resolved by P02** (inactive modules invisible; gating permission `analytics.*`). |
| Dashboard canvas | Responsive grid; KPI tiles, charts, tables; per-widget freshness badge (role-adaptive copy); plain-language KPI definition on consumer tiles; drill breadcrumbs; "save as my view". |
| KPI tiles | Value + unit + trend sparkline + period-correct target/RAG + alert badge + as-of + plain-language "what counts" + reconciliation-explainer link; click → drill-down; suppressed cells show "<5". |
| Charts | Line/bar/pie/donut/heatmap/gauge/table for consumers; HEATMAP/FUNNEL/MAP retained in the authoring catalog only. Accessible (labels, patterns + colour, keyboard, data-table fallback). |
| Report builder | Three-pane; sensitivity chips; inline aggregate-vs-detail RESTRICTED explainer; **masked-field tooltips (P02 field mask)**; row-count + freshness + suppression indicators. |
| Filters | Period, org_unit (P02-scoped tree), cadre, designation, gender, category, as-of-knowledge date; shareable as saved_view. |
| Freshness UX | Green/amber/red chip with icon + label (non-colour cue); role-adaptive tooltip; reconciliation explainer; global data-health panel. |
| Predictive UX | Aggregate/banded distributions open (P02-scoped); individual scores behind an explicit action + purpose prompt + friction confirmation; prominent advisory + prohibited-use banner; model-card link. |
| Establishment UX | Position console (sanctioned strength, roster point, effective dates); data-quality flags for unmapped posts. |
| Data-protection UX | DPO console for rectification/erasure with impact preview, retention-override (legal basis), propagation status; affected surfaces note "data updated/erased per data-protection request". |
| Anomaly UX | Auditor/Admin anomaly queue with evidence and review actions. |
| Canonical UI states (Foundation §3) | Every surface implements the platform five states: **empty** ("no data in your scope"), **loading** (skeleton, no layout shift), **error** (inline `ERR-*` id + retry, never a raw 500), **no-permission** (gating menu hidden per §6; deep-linked forbidden shows `ERR-FORBIDDEN`, not a 404 leak), **partial-data** (render what is authorised, mask the rest per RBAC/P02) — plus G14-specific **stale**, **offline** (non-restricted cached), **suppressed** ("below privacy threshold"), **gated** ("open individual prediction — purpose required"). Masked fields use the platform **masked-field** component (RBAC §3.9 / P02). |
| Drill-through | "Open source record" visible only when P02 permits; opens owning module read-only; suppression notice. |
| Alerts | Alert inbox with severity chips; acknowledge/resolve; tile badges; period-correct target. |
| Exports | PDF/Excel/CSV menu with progress; header/footer carry scope + as-of + as-of-knowledge + page numbers + masking/suppression notes. |
| Mobile | Stacked cards, swipeable trends, bottom-nav, alert badge; same P02 scope + suppression; offline excludes RESTRICTED; encrypted cache; remote-wipe. Breakpoints 375/768/1280px; touch ≥ 44×44px. |
| Embedded BI | Snippet uses header/code-exchange (no URL token); CSP frame-ancestors (X.3); revocation surfaced. |
| Accessibility | WCAG 2.1 AA: keyboard-operable charts, focus order, contrast, data-table fallback, screen-reader summaries, no colour-only meaning. |
| i18n/locale | Dates `DD-MMM-YYYY`, INR money formatting, user timezone for as-of, translatable labels (incl. role-adaptive copy). |

---

## 8. API & Integration

### 8.1 Conventions (platform-grounded; async audit-on-read mirroring P05)

- Base path **`/api/v1/analytics`** (the M16 surface); JWT bearer auth carrying resolved roles + tenant/entity scope; **`Authorization.check` (P02)** + suppression (FR-17) enforced server-side on every data-bearing endpoint. Endpoints never re-implement permission logic.
- **Cursor pagination only** (`?limit=` default 25, max 100, `cursor=`, response `next_cursor`); offset paging not used. Every data-bearing read includes a `dataFreshness` block (`{ asOf, state, isPartial, label }`, role-adaptive).
- **Idempotency:** unsafe POSTs that create a transaction (e.g. export, schedule run) accept an **`Idempotency-Key`** header (24h replay returns the original).
- **Correlation id:** every request carries/echoes **`X-Correlation-Id`**, written to every audit/log line (P05).
- **Audit-on-read (R5, re-grounded):** every data-returning call **enqueues** an `analytics_access_log` write to an append-only **partitioned** store off the read path; **FULL-fidelity** events (`EXPORT`, `DRILLTHROUGH`, `NL_QUERY`, `VIEW_INDIVIDUAL_PREDICTION`, all RESTRICTED reads) are mandatory and **mirror into the platform P05 `audit_log`/`security_audit_log`** (reading sensitive analytics is itself an audited action, Platform §P05); low-sensitivity `VIEW_DASHBOARD` may be SAMPLED.
- Reads accept an optional `asOfKnowledge` parameter (FR-23).
- Embed credentials are never accepted in a URL path/query (FR-15); presented in a header or exchanged from a short-lived code (X.3 outbound).

### 8.2 Canonical Error Envelope (Foundation §1 / BRD §6.2 — overrides invented envelope)

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Human-readable message", "field": "optional.field.path", "details": { } } }
```

> 2xx returns the resource payload; 4xx/5xx return the envelope. The correlation id is the **`X-Correlation-Id` response header**, not a body `requestId`.

### 8.3 Error-Code Catalog (platform 8-code table + `ERR-G14-*`)

**Platform standard codes (Foundation §1) — used as-is:**

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | 422 | input failed a VAL-* rule / malformed parameters |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted (P02 deny; never leaks out-of-scope existence) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, state/version conflict |
| `PRECONDITION_FAILED` | 412 | required precondition not met (e.g. mart not HEALTHY, payroll snapshot absent) |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error (incl. mart refresh failure; surfaced as `ERR-LOADFAIL`) |

> **Override note (`MODULE_RECONCILIATION.md` §C):** v2's `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `INTERNAL_ERROR(500)`, `UPSTREAM_UNAVAILABLE(503)` are replaced by the table above. **No 503** — upstream/mart unavailability maps to `PRECONDITION_FAILED(412)` (precondition) or `INTERNAL(500)` + `ERR-LOADFAIL` (via X.3 error mapping).

**Module-unique `ERR-G14-*` (registered in the Foundation §5 catalogue; map onto the standard HTTP codes):**

| Id | HTTP | Meaning |
|---|---|---|
| `ERR-G14-SCOPE-CHECKER` | 403 | Maker attempted to self-approve an analytics scope-policy change (SoD via P01/P02) |
| `ERR-G14-WIDGET-BINDING` | 409 | Widget bound to retired/missing KPI/report |
| `ERR-G14-PUBLISH-CHECKER` | 403 | Maker attempted gated publication (P01) |
| `ERR-G14-SMALL-CELL` | 403 | Group below privacy threshold (k-anonymity) — tiles/charts/exports/drill |
| `ERR-G14-COMP-SUPPRESS` | 200 (notice) | Some cells suppressed to prevent recovery by subtraction |
| `ERR-G14-KPI-EXPR` | 422 | KPI formula failed validation |
| `ERR-G14-KPI-VER-OVERLAP` | 409 | Two ACTIVE versions for a kpi_code |
| `ERR-G14-XVER-AGG` | 409 | Trend aggregation crosses a definition version without acknowledgement |
| `ERR-G14-MART-UNAVAIL` | 412 | Source mart FAILED/absent (precondition) |
| `ERR-G14-MART-REFRESH` | 500 | ETL refresh error (last good retained) → `ERR-LOADFAIL` |
| `ERR-G14-MART-BUSY` | 409 | Concurrent refresh lock (X.1 isolation) |
| `ERR-G14-CONTRACT` | 409/CI | Source schema breached the data contract |
| `ERR-G14-EXPORT-LIMIT` | 422 | Report exceeds configured row cap |
| `ERR-G14-CHANNEL` | 403 | RESTRICTED report to insecure channel |
| `ERR-G14-PAYROLL-LOCK` | 412 | Locked payroll snapshot unavailable |
| `ERR-G14-METRIC-NA` | 404 | NL query references unmodelled metric |
| `ERR-G14-NLQ-CLARIFY` | 200 (options) | Ambiguous NL question; clarification offered |
| `ERR-G14-NLQ-CONF` | 422 | NL intent confidence below threshold; refused not answered |
| `ERR-G14-EMBED-INVALID` | 401 | Embed token missing/expired/out-of-scope |
| `ERR-G14-EMBED-REVOKED` | 401 | Embed token revoked |
| `ERR-G14-METHODOLOGY` | 422 | Predictive model lacks required methodology |
| `ERR-G14-FAIRNESS` | 422 | Probabilistic model lacks fairness assessment/model card |
| `ERR-G14-PRED-GATED` | 403 | Individual predictive score requires friction-gate + purpose |
| `ERR-G14-ESTAB-MISSING` | 200 (notice)/422 | Sanctioned-strength/position reference absent |
| `ERR-G14-ERASURE-PENDING` | 200 (notice) | DPDP erasure not yet fully propagated to derived data |
| `ERR-G14-RETENTION-BLOCK` | 200 (notice)/409 | Statutory retention overrides erasure; legal basis recorded |
| `ERR-G14-ASOF-NA` | 404 | Requested knowledge instant predates the first snapshot version |

Shared platform messages (`ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `MSG-SYS-JOBFAIL`, etc., Foundation §5) are referenced by id, never re-copied.

### 8.4 Integration Points

| Direction | Counterparty | Mechanism | Purpose |
|---|---|---|---|
| Inbound (read) | G01–G13 | **Contracted source views (FR-21) + Debezium CDC / incremental / batch** | Populate analytics marts read-only (read models) |
| Inbound (read) | G12 Digital SR | Read SR verification status (G12 ledger on P05 substrate) | Compliance/SR dashboards |
| Inbound (read) | G10 Payroll | Read locked payroll snapshots | Cost/overtime analytics |
| Inbound (read) | **P01 Workflow engine** | Read pending `workflow_actions`/instances | SLA/pending-approvals dashboards |
| Inbound (auth) | **P02 / RBAC v1.7** | `Authorization.check` per request | Scope filter + field mask + PII ceiling |
| Inbound (event) | G01 / DPO / `consent_records` | PII rectification/erasure/withdrawal events | DPDP propagation (FR-20) |
| Internal | Establishment reference (FR-19) | `MART_ESTABLISHMENT` | Vacancy/reservation denominators |
| Internal | On-prem LLM (CGG Data Centre) | NL intent resolution, **PII stripped server-side (P03 guardrails)**, no egress | NL query (FR-15) |
| Outbound | **G13 Documents** | Store generated exports/briefings/model cards | Artefact persistence |
| Outbound | **X.2 Notifications / W.3** | Alerts, scheduled reports, anomaly + DPDP notices (`MSG-G14-*`) | Distribution |
| Outbound | **P05 Audit** | Mirror FULL-fidelity access/export/config events (async) | Audit trail |
| Outbound | External portals (**X.3**) | Header/code-exchange scoped, revocable embed tokens (CSP frame-ancestors); credentials via P04 | Embedded BI |
| Jobs | **X.1 Background Jobs runner** | `JOB-G14-MART-*`, `JOB-G14-REPORT-*`, `JOB-G14-ALERT-*`, `JOB-G14-ANOMALY-*`, `JOB-G14-DPDP-*` | Refresh, scheduled reports, alert evaluation, anomaly scan, DPDP propagation |

---

## 9. Non-Functional Requirements (platform NFR baseline §8.2)

| Category | Requirement |
|---|---|
| Performance | Dashboard LCP < 2.5s (mart-backed); read-heavy/report APIs **p95 < 300ms cached / < 1000ms uncached**; write ops p95 < 1500ms; preview first page < 1.5s for a 100k-employee entity (platform §8.2). |
| Audit write throughput | Async/batched access-log sustains ≥ 8 widget-queries × concurrent users **without adding read-path latency**; partitioned append-only store; FULL-fidelity events mirror into P05 with no loss (back-pressure buffering). |
| Scalability | Marts pre-aggregated read models; horizontal read scaling; partitioned fact marts + partitioned access ledger; 300+ concurrent (Phase-1 platform target), scaling to 500+ dashboard users. |
| Freshness/Latency | Operational marts ≤ 30–60 min; demographic/financial marts ≤ daily; freshness SLA per mart enforced and surfaced; reconciliation watermark-relative (no false DEGRADED under CDC lag). |
| Availability | **99.5%/month uptime** (platform §8.2, not the invented 99.9%); degraded-mode (last good + stale badge) when a source/mart is down — dashboards never hard-fail on one stale mart. |
| Security | OWASP; TLS 1.2+; encryption at rest; **all access decided by P02 (non-bypassable)**; scope-policy/embed changes maker-checked via P01; embed tokens signed/expiring/revocable, never in URL, CSP frame-ancestors (X.3); RESTRICTED field masking on serialization (P02); **PII Protection Ceiling overrides everything upward**. |
| Privacy | DPDP Act 2023 alignment; PII minimisation in marts; metric-level complementary suppression (FR-17); rectification/erasure propagation (FR-20) reconciled with P05 redaction marker + `consent_records`; view/export auditing (P05); on-device RESTRICTED exclusion (FR-16). |
| Predictive governance | Probabilistic models require model card, protected-attribute exclusion, adverse-impact testing, prohibited-use clause; individual scores friction-gated; advisory/informational-only (P03-aligned). |
| Temporal integrity | Bitemporal snapshots; as-of-knowledge reproducibility; append-only preserved (P05-aligned). |
| Auditability | Every view/drill/export/config/individual-prediction/DPDP change captured by **P05** (async access ledger + DB-trigger mutation capture); immutable, 7-yr, queryable by Auditor; anomaly detection over the ledger. |
| Accessibility | WCAG 2.1 AA; chart data-table fallback; keyboard/screen-reader; non-colour cues; role-adaptive language; responsive 375/768/1280px, touch ≥ 44×44px. |
| Reliability/DR | **RPO < 1h, RTO < 4h** (platform §8.2, not the invented 15 min); marts rebuildable from sources; refresh idempotent (X.1); snapshot history rebuildable bitemporally; **no hard delete (soft delete only)**. |
| Observability | ETL run metrics, freshness + watermark-relative reconciliation monitoring, query latency, alert evaluation health, async-log queue depth, data-health panel (platform §0.5 observability standard). |
| Data quality | Watermark-relative reconciliation within per-KPI tolerance; sustained-variance DEGRADED flagging; data-quality notices on missing reference/establishment data; source-contract CI gate. |
| Retention | Snapshots and access logs per statutory schedule (≥ 7 yr for audit, P05); export artefacts expire/purge; erasure reconciled with retention overrides (FR-20). |
| Build-vs-buy (ADR-01) | Only the governed core holds analytics-DB credentials; adopted libraries consume already-P02-scoped, already-masked, already-suppressed, already-freshness-stamped result sets. |
| Multi-tenancy | `tenant_id`/`entity_id` on every entity; data-layer scoping; unscoped queries rejected (Platform §0.1). |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 KPI Definition Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | expression validated; definition_hash computed |
| DRAFT | submit+activate (P01 checker) | ACTIVE | approved_by ≠ created_by (SoD via P02); prior ACTIVE → RETIRED |
| ACTIVE | new version activated | RETIRED | superseded; trends mark version change |
| ACTIVE/DRAFT | retire | RETIRED | not referenced by published surface (or auto-pauses dependents) |

### 10.2 Dashboard Lifecycle

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create | DRAFT | bindings validated |
| DRAFT | publish | PUBLISHED | COMPLIANCE/EXEC require P01 checker; all bindings ACTIVE |
| PUBLISHED | edit (new draft) | DRAFT | versioned edit |
| PUBLISHED | archive | ARCHIVED | saved_views preserved read-only |

### 10.3 Data Mart Refresh / Health (X.1 + watermark-relative reconciliation)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| HEALTHY | X.1 refresh success within SLA | HEALTHY | watermark advanced; snapshots recomputed (knowledge-versioned) |
| HEALTHY | SLA exceeded | STALE | staleness surfaced; last good served |
| HEALTHY/STALE | variance vs source-as-of-watermark > tolerance, sustained beyond grace | DEGRADED | alert (X.2); is_partial set (transient CDC lag does NOT flag) |
| any | refresh error | FAILED | last good retained; `JOB-FAIL → MSG-SYS-JOBFAIL` (X.1) + alert |
| any | source contract BREACHED | FAILED(held) | refresh held; alert (FR-21) |
| FAILED/STALE/DEGRADED | successful refresh within tolerance | HEALTHY | health restored |

### 10.4 Report Execution

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | trigger (X.1/on-demand) | QUEUED | recipients/scope validated (P02) |
| QUEUED | start | RUNNING | mart available |
| RUNNING | success | COMPLETED | document created (G13); async access_log EXPORT (→ P05) |
| RUNNING | error | FAILED | retry per X.1 policy; alert on final fail |
| COMPLETED | retention reached | EXPIRED | artefact purged |
| COMPLETED | DPDP erasure (FR-20) | REDACTED | artefact lawful basis revoked |

### 10.5 Alert Event

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | breach detected (period-correct threshold) | OPEN | not within suppression/hysteresis; notify (X.2) |
| (none) | breach within suppression/hysteresis | SUPPRESSED | de-duplicated; logged |
| OPEN | acknowledge | ACKNOWLEDGED | acknowledged_by recorded |
| ACKNOWLEDGED/OPEN | value returns within bound | RESOLVED | auto-resolve on next clean evaluation |

### 10.6 Prediction Model (deterministic & probabilistic)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | register | DRAFT | methodology present; (probabilistic) model card + exclusions present |
| DRAFT | assess fairness (probabilistic only) | DRAFT | adverse-impact test recorded; fairness_status PASSED/FAILED/WAIVED |
| DRAFT | activate (P01 checker; probabilistic also DPO co-sign) | ACTIVE | approved_by ≠ created_by; probabilistic requires fairness PASSED/WAIVED |
| ACTIVE | retire / drift detected | RETIRED | results frozen read-only; re-review required |

### 10.7 Analytics Scope Policy (maker-checker via P01; enforced by P02)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | create/update (maker) | DRAFT | P02 dimensions validated |
| DRAFT | submit (with preview-as-role diff) | PENDING_APPROVAL | exposure diff captured |
| PENDING_APPROVAL | approve (P01 checker ≠ maker) | ACTIVE | prior version → SUPERSEDED; written to security_audit_log |
| PENDING_APPROVAL | reject | REJECTED | reason recorded |

### 10.8 Embed Token (hardened — X.3)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | issue (maker) | PENDING_APPROVAL | scope/widgets/frame-ancestors set |
| PENDING_APPROVAL | approve (P01 checker ≠ issuer) | ACTIVE | usable via header/code-exchange (X.3) |
| ACTIVE | expiry reached | EXPIRED | render denied |
| ACTIVE | revoke | REVOKED | render denied immediately |
| ACTIVE | rotate | ROTATED | new token issued (lineage), old denied |

### 10.9 Data Subject Change (DPDP)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | receive change (G01/DPO/consent withdrawal) | RECEIVED | impact analysis queued |
| RECEIVED | propagate | PROPAGATING | rectify snapshots / purge predictions / redact exports; P05 redaction marker for audit PII |
| PROPAGATING | complete | COMPLETED | propagation verified; audited (P05) |
| PROPAGATING | retention overrides erasure | BLOCKED_RETENTION | legal basis recorded; data restricted not deleted |
| PROPAGATING | step failure | FAILED | retry (X.1) + alert |

---

## 11. Notifications (via X.2 / W.3; templates by `MSG-G14-*` id)

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| Scheduled report delivered | report_execution COMPLETED | schedule recipients (P02-scoped) | EMAIL/IN_APP/SFTP |
| Report run failed | execution FAILED (final) | report owner | IN_APP + EMAIL |
| KPI threshold breached | alert_event OPEN | alert_rule recipients (P02-scoped) | IN_APP + EMAIL |
| Critical alert | severity=CRITICAL | recipients + Dept Head | IN_APP + EMAIL |
| Mart refresh failed/degraded | mart FAILED/DEGRADED | Data Engineer + Analytics Admin | IN_APP + EMAIL |
| Source contract breached | contract BREACHED | Data Engineer + owning-module steward | IN_APP + EMAIL |
| KPI retired with dependents | KPI RETIRED | dashboard/alert stewards | IN_APP |
| Executive briefing | scheduled briefing (X.1) | executive (own P02 scope) | IN_APP + EMAIL (PDF) |
| Embed token issued/expiring/revoked | token lifecycle | issuing admin + checker | IN_APP |
| Reconciliation variance (sustained) | mart DEGRADED | Analytics Admin + Auditor (config) | IN_APP |
| Out-of-scope recipient dropped | delivery filtering (P02) | schedule owner (summary) | IN_APP |
| Scope policy pending approval | policy PENDING_APPROVAL | checker (P01) | IN_APP |
| Model fairness assessment due / failed | model fairness FAILED/needed | Analytics Admin + DPO | IN_APP + EMAIL |
| Access anomaly detected | access_anomaly OPEN/CRITICAL | Auditor + Analytics Admin | IN_APP + EMAIL |
| DPDP change status | data_subject_change COMPLETED/BLOCKED_RETENTION | DPO + Auditor | IN_APP + EMAIL |
| Job failure | `JOB-G14-*` terminal failure | owning admin + platform ops | `MSG-SYS-JOBFAIL` (X.1) |

> Channels per BRD §9.1 (IN_APP + EMAIL fire in parallel for approvals); **EMAIL for statutory/approval notices is mandatory and non-suppressible** (Platform §X.2, BRD §9.9) — but no notification body carries RESTRICTED PII (link to a P02-scoped view instead). Recipient resolution + channel selection by **W.3**; delivery + retry (≤ 5 attempts + DLQ) + audit by **X.2**.

---

## 12. Reporting & Analytics

G14 **is** the reporting and analytics module (extending PrimeSoft M16); this section summarises its self-reporting and the catalog it exposes on the `analytics.*` entitlement.

- **Standard report catalog (seed, M16 extensions):** Headcount by org/cadre; Attrition; Establishment-pinned vacancy; Demographics & diversity (suppressed); Retirement profile (deterministic, 1/3/5Y); Span of control; Leave & absenteeism; Attendance exceptions; Payroll cost & overtime (locked); Training coverage & skill gaps; Appraisal rating distribution; Disciplinary case aging; Transfer/promotion pipeline; Pension forecast; Reservation roster compliance (establishment-pinned); Mandatory training status; SR verification status (read G12); Pending approvals & SLA breaches (read P01).
- **Self-analytics (operations):** Most-viewed dashboards/reports, export volume, query latency, ETL health, watermark-relative reconciliation status, alert volume by severity, async-log queue depth, access-anomaly trends, DPDP propagation completeness — for the Analytics Administrator, Auditor, and DPO.
- **Export formats:** PDF, XLSX, CSV — all P02-scope-correct, suppressed, freshness-stamped, as-of-knowledge-stamped, audited (P05).
- **Governance:** Every report maps to governed KPIs/semantic fields; reconciliation reports prove mart-to-source consistency at watermark; P05 access logs (+ anomaly detection) provide preventive who-saw-what; model cards govern predictions.

---

## 13. Migration & Launch

### 13.1 Data Migration (on P06 ETL+V)

- G14 holds no transactional master data to migrate; migration = **standing up the analytics layer on the platform**: build mart schemas + bitemporal snapshot store + partitioned access ledger; define the semantic model; register source data contracts (FR-21); register marts + their **X.1 jobs**; seed the establishment/position reference (FR-19); and run initial **full historical backfill** from G01–G13 through the **P06 Migration Toolkit (ETL+V, 3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability)**.
- Seed governed `kpi_definition`s (+ `definition_hash`), effective-dated targets (E17), dashboard templates per persona on the M16 surface, **analytics scope policies (P02 dimensions) through the P01 maker-checker flow**, `suppression_policy`, and the standard report catalog.
- Backfill bitemporal `kpi_snapshot` history (e.g. 24 months) with knowledge_time = backfill instant.

### 13.2 Validation & Parallel Run

- Reconcile each seeded KPI against its owning module at a fixed watermark within per-KPI tolerance; record/resolve variances before go-live.
- Run the **P02 scope-leak AND aggregate-re-identification (suppression) test matrix** across all roles/marts; zero leakage and zero re-identification required to launch.
- Validate freshness SLAs, watermark-relative reconciliation, and degraded-mode with simulated mart outages and CDC lag.
- Validate as-of-knowledge reproduction (June-in-June vs June-after-correction).
- Validate predictive fairness gate, friction-gate, prohibited-use labelling; validate DPDP propagation end-to-end (incl. P05 redaction marker).
- Verify export fidelity, scheduled delivery scoping (X.1/X.2), embed header/code-exchange + revocation (X.3), and NL confidence gating + PII-strip (P03).

### 13.3 Cutover & Launch (phased)

- **Phase 1 (foundation):** source contracts + Debezium CDC; `MART_HEADCOUNT` + establishment reference; **P02 integration + scope-leak + suppression harness**; KPI engine + bitemporal snapshots; freshness + reconciliation explainer; persona dashboards on the M16 surface; deterministic retirement. (X.1 mart/report jobs registered.)
- **Phase 2:** workforce/operational/compliance suites; report builder; export/schedule (X.1/X.2); drill; alerts (effective-dated); benchmarking.
- **Phase 3 (advanced, highest-risk):** probabilistic predictive (fairness-gated); NL query (confidence-gated, P03-aligned) + hardened embed (X.3); mobile/briefing (offline policy); access-anomaly detection.
- Soft-launch to HR/operators, then department heads/executives, then employee self-service.

### 13.4 Launch Readiness Checklist

| Item | Gate |
|---|---|
| All seed KPIs reconcile to source at watermark within tolerance | Pass required |
| **P02 scope-leak matrix: 0 leaks** | Pass required |
| Aggregate re-identification / complementary-suppression harness: 0 re-identifications | Pass required |
| Freshness SLAs + watermark-relative reconciliation + degraded-mode verified | Pass required |
| As-of-knowledge reproducibility verified (bitemporal) | Pass required |
| Persona dashboards published on the M16 surface (P01 maker-checker for compliance/exec) | Pass required |
| **Scope-policy & embed-token maker-checker enforced via P01/P02; embed never in URL; CSP set (X.3)** | Pass required |
| Export formats + scheduled delivery scoping validated (X.1/X.2) | Pass required |
| **Async audit logging verified; FULL-fidelity events mirror into P05** | Pass required |
| Access-anomaly detection live (over P05-mirrored ledger) | Pass required |
| Deterministic retirement validated; probabilistic models carry model card + fairness PASSED + friction-gate + prohibited-use | Pass required |
| Establishment/position reference seeded; vacancy/reservation pinned to it | Pass required |
| DPDP rectification/erasure propagation tested incl. retention override + P05 redaction marker | Pass required |
| Source data contracts active; CI contract tests green | Pass required |
| NL confidence gating + named on-prem LLM (no egress) + P03 PII-strip verified | Pass required |
| Accessibility (WCAG AA) + role-adaptive language + mobile offline RESTRICTED exclusion verified | Pass required |
| DR/backfill rebuild (incl. bitemporal history) from sources on P06 tested | Pass required |
| `tenant_id`/`entity_id` data-layer scoping verified; unscoped query rejected | Pass required |

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → Platform services → Tests)

| FR | Key Entities | Key APIs | Platform services | Test focus |
|---|---|---|---|---|
| FR-01 | dashboard, dashboard_widget, saved_view | /dashboards,:publish,/render | **P02, P01, P05**, M16 surface | publish SoD (P01), P02 scope-omit, saved-view isolation, plain-language tile |
| FR-02 | kpi_definition, kpi_snapshot, kpi_target_history | /kpis,:activate,/value,/targets | P01, P05, VAL-EFFECTIVE | parser, determinism, version stamping, effective-dated target |
| FR-03 | analytics_datamart, datamart_refresh_log, source_data_contract | /marts,:refresh,/health | **X.1**, P05 | idempotent X.1 load, SLA, watermark-relative reconciliation, last-good |
| FR-04 | analytics_scope_policy, workflow_instances | /scope-policies,:preview-as-role,:approve | **P02 (core), P01, RBAC v1.7** | P02 scope-leak matrix, multi-role INTERSECTION, field mask, maker-checker |
| FR-05 | MART_HEADCOUNT, establishment_position, kpi_snapshot | /workforce/* | P02, P05 | attrition-excl-transfers, establishment vacancy, retirement, span |
| FR-06 | domain marts, kpi_snapshot, suppression_policy | /operational/* | P02, P05 | payroll locked-only, P02 masking, case-aging, funnel, suppression |
| FR-07 | compliance/SR/workflow marts, establishment_position | /compliance/* | **G12, P01, P02** | roster math (pinned), SR read-only, SLA buckets, as-of-knowledge export |
| FR-08 | saved_report, report_execution, suppression_policy | /reports:preview,/reports | P02, P05 | field-permission (P02), shared scope, row-limit, suppression |
| FR-09 | report_schedule, report_execution, documents | /schedules,:export | **X.1, X.2, G13, P02** | burst scope, per-recipient scope, format fidelity, REDACTED |
| FR-10 | dashboard_widget, analytics_access_log, suppression_policy | /drilldown,/drillthrough | **P02 (live check), P05** | both-permission, k-anonymity+complementary, read-only link |
| FR-11 | alert_rule, alert_event, kpi_target_history | /alert-rules,/alert-events | **X.1, X.2, W.3, P02** | breach, effective-dated threshold, suppression/hysteresis |
| FR-12 | analytics_datamart, kpi_snapshot, datamart_refresh_log | /data-health,/reconciliation-explainer | P02 | SLA-boundary, role-adaptive copy, reconciliation explainer |
| FR-13 | prediction_model (deterministic), prediction_result | /models,/predictions/retirement | P01, P02, P05 | retirement determinism, suppression, knowledge-version on DOB fix |
| FR-14 | kpi_snapshot, kpi_target_history, kpi_definition | /benchmark/* | P02 | normalisation, peer-scope (P02), effective-dated RAG, outliers |
| FR-15 | nl_query_log, embed_token, semantic | /nlq,/embed-tokens,:revoke,/embed/session | **P03, X.3, P04, P01, P02** | confidence gating, PII-strip, token scope/revocation, no-URL-token |
| FR-16 | dashboard, report_schedule, alert_event | /render?mobile,/briefings | **X.1, X.2, P02 (PII ceiling)** | P02 parity, per-recipient briefing, offline RESTRICTED exclusion |
| FR-17 | suppression_policy, kpi_snapshot | /suppression-policies | P02 (after), P05 | aggregate re-identification harness, complementary completeness |
| FR-18 | prediction_model (probabilistic), prediction_result, documents | /models:assess-fairness,/predictions/individual | **P01, P05, P02, DPO** | fairness gate, exclusions, friction-gate, prohibited-use, NO_PREDICTION |
| FR-19 | establishment_position, MART_ESTABLISHMENT | /establishment/* | P02, P05, VAL-EFFECTIVE | sanctioned-vs-filled, effective-dated denominator, missing-ref notice |
| FR-20 | data_subject_change, kpi_snapshot, prediction_result, report_execution | /data-subject-changes,:retention-override | **P05 (redaction/consent), X.1, X.2** | propagation completeness, retention override, append-only reconciliation |
| FR-21 | source_data_contract, analytics_datamart | /source-contracts,:test | X.2, CI | breaking-change detection, mart hold, co-sign |
| FR-22 | access_anomaly, analytics_access_log | /anomalies,:review,/anomaly-rules | **X.1, X.2, P05** | off-hours bulk export, scope probing (P02 denials), advisory |
| FR-23 | kpi_snapshot (bitemporal), report_execution | /value?asOfKnowledge,/history | P05 (immutability), P02 | as-of-knowledge reproduction, restatement lineage, append-only |

### 14.2 Dependency Graph (phased build order)

**Phase 1 — Foundation:**
1. **FR-21** (contracts) + **FR-03** (marts/ETL on X.1) + **FR-19** (establishment) →
2. **FR-04** (P02 integration) + **FR-17** (metric suppression + scope-leak/re-identification harness) →
3. **FR-02** (KPI engine + effective-dated targets) + **FR-23** (bitemporal) + **FR-12** (freshness + reconciliation explainer) →
4. **FR-01** (dashboards on M16 surface) + **FR-13** (deterministic retirement).

**Phase 2 — Core analytics:**
5. **FR-05**, **FR-06**, **FR-07** → 6. **FR-08** (builder), **FR-10** (drill) → 7. **FR-09** (export/schedule X.1/X.2), **FR-11** (alerts), **FR-14** (benchmark).

**Phase 3 — Advanced:**
8. **FR-18** (probabilistic + fairness), **FR-20** (DPDP propagation) → 9. **FR-15** (NL P03-aligned + hardened embed X.3), **FR-16** (mobile/briefing + offline), **FR-22** (anomaly detection).

> Rationale: build the **P02 integration + scope-leak/re-identification harness** against one real mart (`MART_HEADCOUNT`) before any dashboard; ship deterministic retirement early; defer NL/embed and probabilistic ML to Phase 3 (per X.3 governance staging).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Contracts, data layer & establishment | FR-21, FR-03, FR-19 | start |
| B: Platform-access integration & metric privacy | FR-04 (P02), FR-17 | A |
| C: Metric, freshness & temporal | FR-02, FR-12, FR-23 | B |
| D: Surfaces (M16 extensions) | FR-01, FR-08, FR-10, FR-13 | C |
| E: Analytics suites | FR-05, FR-06, FR-07 | C |
| F: Distribution & alerting (X.1/X.2) | FR-09, FR-11, FR-14 | D, E |
| G: Advanced predictive & DPDP | FR-18, FR-20 | C, E |
| H: NL/embed (P03/X.3), mobile & anomaly | FR-15, FR-16, FR-22 | D, F |

### 14.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)

| Requirement area | Covered by | Entities | APIs | States | Tests | Platform grounding | Gap |
|---|---|---|---|---|---|---|---|
| Role-based dashboards (on M16) | FR-01,16 | yes | yes | yes | yes | M16 surface + `analytics.*`; P02; P01 | none |
| KPI definitions (versioned, effective-dated) | FR-02,14 | yes | yes | yes | yes | VAL-EFFECTIVE; P01; P05 | none |
| Analytics data layer / mart / ETL | FR-03 | yes | yes | yes | yes | **X.1 jobs; P06 backfill; read models** | none |
| Source data contracts / schema-drift | FR-21 | yes | yes | yes | yes | CI; X.2 | none |
| **Permission-scoped access** | FR-04 | yes | yes | yes | yes | **P02 (deny-by-default→scope filter→field mask→PII ceiling); P01 maker-checker; RBAC v1.7** | none |
| Metric-level privacy / complementary suppression | FR-17 | yes | yes | n/a | yes | `GAP (gov-specific)` layered on P02 | none |
| Workforce analytics (establishment-pinned vacancy) | FR-05,19 | yes | yes | n/a | yes | P02; P05 | none |
| Establishment / position reference | FR-19 | yes | yes | n/a | yes | `GAP (gov-specific)`; VAL-EFFECTIVE | none |
| Operational analytics | FR-06 | yes | yes | n/a | yes | reads G03–G11; P02 | none |
| Compliance & statutory (establishment-pinned roster) | FR-07 | yes | yes | n/a | yes | reads **G12 (SR), P01 (SLA)**; P02 | none |
| Self-service report builder | FR-08 | yes | yes | n/a | yes | P02; M16 surface | none |
| Scheduled distribution & export | FR-09 | yes | yes | yes | yes | **X.1, X.2, G13** | none |
| Drill-down & drill-through (permissioned, suppressed) | FR-10 | yes | yes | n/a | yes | **P02 live check; P05** | none |
| Alerting/thresholds (effective-dated) | FR-11 | yes | yes | yes | yes | **X.1, X.2, W.3** | none |
| Data-freshness + role-adaptive + reconciliation explainer | FR-12 | yes | yes | yes | yes | P02 | none |
| Deterministic retirement forecasting | FR-13 | yes | yes | yes | yes | `GAP`; P01; P02 | none |
| Benchmarking & comparative (effective-dated RAG) | FR-14 | yes | yes | n/a | yes | P02 | none |
| NL query (confidence-gated) & hardened embed | FR-15 | yes | yes | yes | yes | **P03 guardrails; X.3; P04; P01** | none |
| Mobile & executive briefing (offline policy) | FR-16 | yes | yes | yes | yes | X.1; X.2; P02 PII ceiling | none |
| Probabilistic predictive + fairness + friction-gate | FR-18 | yes | yes | yes | yes | `GAP`; **P01, P05, DPO** | none |
| DPDP rectification/erasure propagation | FR-20 | yes | yes | yes | yes | `GAP`; **P05 redaction marker + consent_records; X.1** | none |
| Access-anomaly detection | FR-22 | yes | yes | n/a | yes | **X.1; X.2; over P05-mirrored ledger** | none |
| Bitemporal / as-of-knowledge reproducibility | FR-23 | yes | yes | n/a | yes | `GAP`; P05 immutability-aligned | none |
| Reads across G01–G13 (read-only, contracted read models) | FR-03,05,06,07,21 + §8.4 | yes | yes | n/a | yes | Debezium CDC; contracted views | none |
| Audit of view/drill/export (async → P05) | FR-01,09,10,22 + E16 | yes | yes | n/a | yes | **P05 (audit_log + security_audit_log)** | none |
| **Multi-tenancy / data-layer scoping** | §2.4, §5.1, all entities | yes | n/a | n/a | yes | **`tenant_id`/`entity_id`; Platform §0.1; Org Admin cross-entity; Platform Super Admin cross-tenant** | none |
| **Workflow / maker-checker (SoD)** | FR-01/02/04/15/18 | n/a | yes | yes | yes | **P01 + P02 SoD (no bespoke engine)** | none |
| **Notifications / jobs** | FR-03/09/11/20/22, §11 | n/a | yes | n/a | yes | **X.1 (`JOB-G14-*`), X.2/W.3 (`MSG-G14-*`)** | none |
| **Error/API conventions** | §8 | n/a | yes | n/a | yes | **8-code table; envelope+`X-Correlation-Id`; cursor pagination; `ERR-G14-*`** | none |
| **RBAC role mapping** | §3.1 | n/a | n/a | n/a | yes | **RBAC v1.7 roles + gov ADDITIONS (Establishment Officer, DPO); Auditor→Org-Admin read** | none |

**Result: 0 unresolved gaps.** Every module capability — plus every council improvement (R1–R16 + world-class additions) **and every platform re-grounding row** — maps to at least one FR with entities, APIs, states (where stateful), tests, and a named platform service.

---

## Alignment with PrimeSoft Platform (FR → service map)

Per `PLATFORM_FOUNDATION.md` §9.6, each FR is mapped to the platform service(s) it runs on, with any `GAP (gov-specific)` engine flagged. G14 is an **EXTEND/REUSE of PrimeSoft M16 Reports & Analytics** on the `analytics.*` entitlement — it authors no platform plumbing.

| FR | Runs on platform service(s) | M16 reuse / `GAP (gov-specific)` authored |
|---|---|---|
| FR-01 Dashboard framework | **M16 surface + `analytics.*`** (Foundation §6); **P02** (render scope); **P01** (publish maker-checker); **P05** (view audit) | REUSE M16 dashboards |
| FR-02 KPI engine | **P01** (activation SoD); **P05** (config audit); platform effective-dating (VAL-EFFECTIVE) | `GAP`: governed KPI DSL + bitemporal stamping |
| FR-03 Data layer / ETL | **X.1** (refresh jobs `JOB-G14-MART-*`); **P06** (initial backfill); P05 | `GAP`: read-model marts + watermark reconciliation |
| FR-04 Permission-scoped access | **P02** (`Authorization.check`: deny-by-default → scope filter (RBAC §3.6) → field mask → PII ceiling); **P01** (scope-policy maker-checker); **RBAC v1.7** (admin via cfg-rbac) | **REUSE P02 wholesale — no parallel RLS engine** |
| FR-05 Workforce analytics | **P02**; P05 | extends M16 reports; `GAP`: establishment-pinned vacancy |
| FR-06 Operational analytics | **P02**; reads G03/G05/G06/G07/G08/G09/G10/G11 | extends M16 reports |
| FR-07 Compliance dashboards | **P02**; reads **G12** SR ledger + **P01** workflow SLA | `GAP`: reservation/SR/pension/disciplinary statutory dashboards |
| FR-08 Report builder | **P02**; **P01** (PUBLISHED approval); M16 surface | REUSE M16 self-service reporting |
| FR-09 Scheduled distribution | **X.1** (`JOB-G14-REPORT-*`); **X.2** (delivery); **G13** (artefacts); P02 | REUSE platform job/notification/document infra |
| FR-10 Drill-through | **P02** (live cross-module `Authorization.check`); **P05** (FULL-fidelity audit) | REUSE P02 |
| FR-11 Alerting | **X.1** (evaluation); **X.2/W.3** (notify); P02 | REUSE platform alert/notification infra |
| FR-12 Freshness/reconciliation | P02; platform observability (§0.5) | `GAP`: reconciliation explainer + role-adaptive copy |
| FR-13 Deterministic retirement | **P01** (model registration SoD); P02; P05 | `GAP (gov-specific)`: retirement forecaster |
| FR-14 Benchmarking | P02 | extends M16; effective-dated RAG |
| FR-15 NL query & embed | **P03** (grounding/guardrails: backend-only, PII-strip, informational-only); **X.3** (outbound embed); **P04** (`integration_credentials`); **P01** (token maker-checker); P02 | adopt NL orchestration over P03 posture; REUSE X.3 |
| FR-16 Mobile / briefing | **X.1** (briefing schedule); **X.2** (delivery); **P02** (PII ceiling → offline RESTRICTED exclusion) | REUSE platform; `GAP`: offline RESTRICTED policy |
| FR-17 Metric suppression | **P02** (applied first) | **`GAP (gov-specific)`**: complementary suppression (platform stops record leakage, not aggregate re-identification) |
| FR-18 Probabilistic predictive | **P01** (activation + DPO co-sign); **P05** (FULL-fidelity audit); P02 | **`GAP (gov-specific)`**: fairness governance + friction-gate |
| FR-19 Establishment reference | P02; P05; VAL-EFFECTIVE | **`GAP (gov-specific)`**: position/establishment master (no platform owner) |
| FR-20 DPDP propagation | **P05** (redaction marker + `consent_records`); **X.1** (propagation job); **X.2** (notices) | **`GAP (gov-specific)`**: analytics-estate propagation |
| FR-21 Source contracts | CI; **X.2** (breach alerts) | `GAP`: source-to-mart contract layer |
| FR-22 Anomaly detection | **X.1** (scan job); **X.2** (notify); over the **P05-mirrored** ledger | `GAP`: preventive detection layer |
| FR-23 Bitemporal reproducibility | **P05** (append-only immutability alignment); P02 | **`GAP (gov-specific)`**: bitemporal snapshot store |
| Cross-cutting | **Multi-tenancy (Platform §0.1)**; **API conventions + 8-code error table + `X-Correlation-Id` + cursor pagination (Foundation §1)**; **RBAC v1.7 role mapping (§3.1)**; **`VAL-*` citations + `VAL-G14-*` module-unique**; **`JOB-G14-*` / `MSG-G14-*` / `ERR-G14-*` registered in the Foundation indexes** | all REUSE/cite by id |

**Module-unique ids authored and registered in the Foundation indexes:** `VAL-G14-KPIEXPR` (KPI DSL whitelist), `VAL-G14-SUPPRESS-K` (k ≥ statutory minimum), `VAL-G14-ESTAB` (sanctioned-strength bounds), `VAL-G14-ASOF` (knowledge-time monotonicity); `JOB-G14-MART-*`, `JOB-G14-REPORT-*`, `JOB-G14-ALERT-*`, `JOB-G14-ANOMALY-*`, `JOB-G14-DPDP-*` (X.1); `MSG-G14-*` (notification templates, X.2/W.3); `ERR-G14-*` (§8.3). Directly reused platform validations: `VAL-EFFECTIVE`, `VAL-DATE`, `VAL-ENUM`, `VAL-FILE`, `VAL-COMMENT`, `VAL-CONSENT`, `VAL-MASTER-UNIQUE`.

---

## Amendments (v2 → v3: platform re-grounding)

Every change from v2 (`M14-DAS`, grounded on the invented `SHARED_FOUNDATION`) to v3 (`G14`, grounded on PrimeSoft). v2 capability/rigor is preserved; only the **mechanism/grounding** changes (per `MODULE_RECONCILIATION.md` §C overrides).

| # | v2 (invented) | v3 (platform-grounded) | Authority |
|---|---|---|---|
| 1 | Module code `M14-DAS`, features `M14-Fxx`, FRs `FR-M14-xx`, reads `M01–M13` | **`G14`, `G14-Fxx`, `FR-G14-xx`, reads `G01–G13`** | `MODULE_RECONCILIATION.md` §B |
| 2 | Standalone reporting module | **EXTEND/REUSE of PrimeSoft M16 Reports & Analytics on the `analytics.*` entitlement** (no parallel reporting fork) | `MODULE_RECONCILIATION.md` §A (G14 row); Foundation §6 |
| 3 | Invented RLS engine (`rls_scope_policy` + `QueryRewriter` + `FieldMaskService` + bespoke maker-checker) | **Replaced by platform P02** (`Authorization.check`: deny-by-default → role grant → multi-role INTERSECTION → individual entitlement → capability flag → **PII Protection Ceiling** → data scope filter (RBAC §3.6 dimensions) → **field mask on serialization**). E11 recast as `analytics_scope_policy` that **declares** P02 dimensions; **enforcement is P02 only** | Platform §P02; `MODULE_RECONCILIATION.md` §C |
| 4 | Bespoke maker-checker on RLS/embed/KPI/model | **Configured P01 flow with SoD enforced by P02** (no self-approval); admin via cfg-rbac → `security_audit_log` | Platform §P01/§P02; RBAC §5 |
| 5 | Custom `analytics_access_log` + invented `audit_log` | **Async partitioned read-ledger that mirrors FULL-fidelity events into P05** `audit_log` + `security_audit_log` (DB-trigger, immutable, 7-yr); reading sensitive analytics is itself P05-audited | Platform §P05; §C |
| 6 | Error code `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `INTERNAL_ERROR(500)`, `UPSTREAM_UNAVAILABLE(503)`; envelope `{error,requestId}` | **8-code table** `VALIDATION_FAILED(422)`/`UNAUTHENTICATED(401)`/`FORBIDDEN`/`NOT_FOUND`/`CONFLICT`/`PRECONDITION_FAILED(412)`/`RATE_LIMITED`/`INTERNAL`; **no 503**; envelope `{error:{code,message,field,details}}` + **`X-Correlation-Id` header**; `ERR-G14-*` registered in Foundation §5 | Foundation §1; §C |
| 7 | Pagination "page/limit or cursor, max 100" | **Cursor pagination only** (`limit` default 25, max 100, `next_cursor`) | Foundation §1; §C |
| 8 | Multi-tenancy omitted | **`tenant_id`/`entity_id` non-nullable on every entity; data-layer scoping; unscoped query rejected; Org Admin cross-entity, Platform Super Admin cross-tenant** | Platform §0.1; §C |
| 9 | Invented role list (incl. parallel "Auditor"/"System Administrator") | **RBAC v1.7 mapping**: Analytics Admin (existing); Auditor → Org-Admin read + entitlement; System Admin → Org/Platform Admin; **Establishment Officer & DPO as ADDITIONS (new role + capability flag, RBAC §4.3)** | `PLATFORM_FOUNDATION.md` §6; §C |
| 10 | Bespoke ETL scheduler | **Refresh/report/alert/anomaly/DPDP jobs register on X.1 as `JOB-G14-*`** (idempotent, retry ×3, JOB-FAIL → MSG-SYS-JOBFAIL) | Platform §X.1; Foundation §4 |
| 11 | Bespoke notification delivery | **X.2 delivery + W.3 recipient resolution; `MSG-G14-*` templates**; statutory EMAIL mandatory/non-suppressible (no RESTRICTED PII in body) | Platform §X.2/§W.3; BRD §9.9 |
| 12 | NL "named on-prem LLM" without platform posture | **P03-aligned guardrails**: backend-only, **PII stripped server-side before any model call**, informational-only, per-tenant isolation; named on-prem LLM, no egress | Platform §P03 |
| 13 | Embed transport invented | **Hardened on X.3 outbound conventions** (circuit-breaking, idempotency, payload versioning); credentials via **P04 `integration_credentials`**; CSP frame-ancestors; revocable/rotatable | Platform §X.3/§P04 |
| 14 | Effective-dated targets invented | **Reuse platform effective-dating** (`VAL-EFFECTIVE`; staged, not live) | Foundation §1/§3 |
| 15 | DPDP erasure invented audit mutation | **Reconciled with P05 redaction marker** (the only permitted `audit_log` mutation) + `consent_records` withdrawal trigger; bitemporal restatement preserves append-only | Platform §P05; Vision §2.7 |
| 16 | NFR `99.9%` uptime, `RPO ≤ 15min`, dashboard-only perf | **99.5%/month, RPO < 1h, RTO < 4h**; read-heavy p95 < 300ms cached / < 1000ms uncached; LCP < 2.5s; soft-delete only | Platform §8.2; §C |
| 17 | SR/workflow as invented shared tables | **Read G12 SR ledger (P05 substrate) + P01 `workflow_actions`** by reference; G14 never writes SR | `MODULE_RECONCILIATION.md` §C/§D |
| 18 | Initial backfill unspecified | **Run on P06 ETL+V** (3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability) | Platform §P06 |
| 19 | Marts implied as data copies | **Marts are read models / materialised views via contracted source views (FR-21) + Debezium CDC — not forks of owning-module tables** | Platform §0.1; FR-21 |
| 20 | New `## Alignment with PrimeSoft Platform` (FR→service map) and this `## Amendments (v2 → v3)` table | **Added** | `PLATFORM_FOUNDATION.md` §9.6 |

> **Unchanged from v2 (capability preserved):** all 23 FRs, all 24 owned analytics artefacts, every council amendment R1–R16 + world-class additions, the bitemporal/suppression/fairness/establishment/DPDP/anomaly governance, ADR-01's build-vs-buy posture, and the 0-gap reconciliation. The genuine **`GAP (gov-specific)`** engines the platform lacks (metric-level complementary suppression, bitemporal snapshots, establishment/position reference, predictive fairness governance, DPDP analytics-estate propagation, retirement forecaster, reconciliation explainer) remain authored here — but each now runs on P01/P02/P05/P06/X.1–X.3.

---

## 15. Glossary

| Term | Definition |
|---|---|
| KPI | A governed, versioned metric definition computed consistently across surfaces; every snapshot stamps `kpi_version` + `definition_hash` |
| Data mart (read model) | A purpose-built, pre-aggregated analytical dataset derived **read-only** from source modules via a data contract — not a fork of the owning table |
| Source data contract | A versioned promise of a source module's schema/semantics consumed by a mart, CI-tested (Debezium CDC) |
| Semantic model | Business-friendly mapping of names/dimensions to physical mart columns used by the builder and NL query |
| P02 / `Authorization.check` | The platform authorization engine; the **only** access decision point for G14 reads (scope filter + field mask + PII ceiling) |
| PII Protection Ceiling | The platform rule that masks PII tiers and overrides every role/grant upward (RBAC §6; P02) |
| Complementary suppression | `GAP (gov-specific)` — hiding additional cells so a suppressed small-cell value cannot be recovered by subtracting visible totals (layered on top of P02) |
| Bitemporal snapshot | `GAP (gov-specific)` — a snapshot carrying both valid-time (period described) and knowledge-time (when known) |
| As-of-knowledge | A read parameter returning the value as it was known at a given instant, for audit reproducibility |
| Watermark-relative reconciliation | Comparing a mart at watermark W to the source as of the same watermark W, not wall-clock now |
| Effective-dated target | A KPI target/threshold valid for a date range (reuses platform `VAL-EFFECTIVE`) |
| Establishment / position reference | `GAP (gov-specific)` — the named source of record for sanctioned strength and roster points (FR-19) |
| Friction-gate | A deliberate action + purpose prompt + RESTRICTED authority (P02) + P05 audit required to open an individual predictive score |
| Model card | A published description of a predictive model's purpose, features, exclusions, fairness assessment, and prohibited use |
| Adverse-impact testing | Disparate-impact evaluation across protected groups, required before a probabilistic model activates |
| DPDP propagation | `GAP (gov-specific)` — pipeline pushing a PII correction/erasure across marts, snapshots, predictions, and export artefacts; reconciled with the P05 redaction marker + `consent_records` |
| Role-adaptive language | Freshness/KPI copy rendered plainly for leaders and technically for operators/auditors (keyed off RBAC role) |
| Reconciliation explainer | A user panel explaining why a number differs from the source (as-of, watermark, in-flight correction) |
| Embed token | A scoped, signed, expiring, revocable credential presented via header/code-exchange (never URL), CSP frame-ancestors-restricted, outbound on X.3 |
| Access anomaly | A detected deviation in analytics access (bulk export, scope probing) raised for review, over the P05-mirrored ledger |
| Advisory output | A predictive/estimated figure labelled non-authoritative, never written to source, never the sole basis for action (mirrors P03 informational-only) |
| Drill-through | Navigating from an analytics leaf to the authoritative source record (read-only; live P02 cross-module check) |

---

## 16. Appendices

### 16.1 Mart Catalog (illustrative — read models)

| Mart | Type | Grain | Sources (contracted) | Refresh (X.1 job) | Freshness SLA |
|---|---|---|---|---|---|
| MART_HEADCOUNT | AGGREGATE | employee×org_unit×period | G01 | INCREMENTAL (`JOB-G14-MART-HC`) | 60 min |
| MART_ESTABLISHMENT | DIMENSION | position×org_unit (sanctioned/roster) | G14-EST (FR-19) | ON_DEMAND | daily |
| MART_LEAVE_FACT | FACT | leave_application | G03 | CDC (Debezium) | 30 min |
| MART_ATTENDANCE_FACT | FACT | attendance_day | G03 | CDC (Debezium) | 30 min |
| MART_PAYROLL_COST | AGGREGATE | org_unit×component×period | G10 (locked) | INCREMENTAL | daily |
| MART_TRAINING | AGGREGATE | employee×competency×period | G07 | INCREMENTAL | daily |
| MART_APPRAISAL | AGGREGATE | org_unit×rating×cycle | G08 | INCREMENTAL | daily |
| MART_DISCIPLINARY | FACT | case | G09 | INCREMENTAL | hourly |
| MART_PIPELINE | FACT | transfer/promotion case | G05,G06 | INCREMENTAL | hourly |
| MART_PENSION_FORECAST | AGGREGATE | employee×horizon | G11 | daily | daily |
| MART_SR_STATUS | FACT | employee SR verification | G12 | INCREMENTAL | hourly |
| MART_WORKFLOW_SLA | FACT | workflow_action | P01 workflow engine | CDC (Debezium) | 15 min |
| MART_RESERVATION | AGGREGATE | org_unit×category×roster_point | G01 + MART_ESTABLISHMENT | daily | daily |

### 16.2 KPI Calculation Reference (illustrative)

| KPI | Definition |
|---|---|
| HEADCOUNT_ACTIVE | `COUNT(employee_id) WHERE employment_status='ACTIVE'` at scope/period |
| ATTRITION_RATE | `leavers_in_window / avg_headcount_in_window × 100` (excludes internal transfers, G05) |
| VACANCY_PCT | `(sanctioned − filled) / sanctioned × 100`; sanctioned from `establishment_position` (FR-19) |
| RETIREMENT_DUE_COUNT | `COUNT(employee_id) WHERE retirement_date BETWEEN now AND now+horizon` (deterministic, G01 rules) |
| MANDATORY_TRAINING_PCT | `completed_mandatory / required_mandatory × 100` |
| RESERVATION_COMPLIANCE_PCT | `filled_against_category / sanctioned_for_category × 100` vs roster points (establishment-pinned) |
| PENDING_SLA_BREACH | `COUNT(workflow_action) WHERE status='PENDING' AND age > sla_threshold` (effective-dated SLA; read P01) |
| ABSENTEEISM_RATE | `lwp_days / scheduled_days × 100` at scope/period |

### 16.3 Freshness State Semantics (dual-register)

| State | Technical meaning (operators/auditors) | Plain-language label (leaders/employees) | UI |
|---|---|---|---|
| FRESH | Within freshness SLA | "Up to date" | Green chip |
| STALE | Past SLA, last good served | "Numbers are a bit behind — source still updating" | Amber chip + tooltip |
| DEGRADED | Sustained watermark-relative variance / partial load | "Some figures may be off while we reconcile" | Amber/red + warning |
| FAILED | Refresh failed; last good retained | "Latest update didn't complete — showing the last good figures" | Red banner + icon |
| NO_DATA | Never refreshed / empty | "No data yet" | Grey |

### 16.4 Privacy & Suppression Policy (`GAP (gov-specific)`, layered on P02)

- P02 stops record leakage (scope filter + field mask + PII ceiling); FR-17 adds small-cell suppression (default `k=5`, per-KPI/per-policy override) to **KPI tiles, charts, exports, AND drill-through**.
- **Complementary suppression**: when a cell is suppressed, complements are suppressed so the value cannot be recovered by subtracting visible totals, including across overlapping scopes and period-vs-period differencing.
- RESTRICTED fields (salary, individual ratings, disciplinary detail, individual predictive scores) masked **by P02 on serialization** unless explicit field grant; individual predictive scores additionally friction-gated (FR-18).
- View/drill/export of RESTRICTED data always audited FULL-fidelity (→ P05) with row counts; suppression decisions deterministic so trends remain stable.
- The aggregate re-identification (differencing-attack) test harness is a launch gate (§13.4).

### 16.5 Predictive Fairness & Governance Policy

- **Protected/correlated exclusions:** caste/reservation category, gender, disability status, maternity-linked leave proxies excluded from probabilistic model features.
- **Pre-activation gate:** model card published; adverse-impact testing recorded; `fairness_status ∈ {PASSED, WAIVED_WITH_REASON}` (DPO co-sign via P01); methodology + intended_use + prohibited_use present.
- **Prohibited use:** an individual score must not be the sole/primary basis for any administrative action; displayed wherever the score appears.
- **Friction-gate:** individual scores require a deliberate action, stated purpose, RESTRICTED authority (P02), and a FULL-fidelity audit entry (P05); aggregate/banded distributions open to authorised scope.
- **Drift:** detected drift freezes a model's results read-only pending re-assessment.

### 16.6 DPDP Rectification/Erasure Reconciliation

- Append-only ledgers reconciled with erasure via **restriction/redaction + bitemporal knowledge-versioning** (consistent with P05 immutability), never by deleting historical audit rows; audit PII overwritten with the **P05 redaction marker** (the only permitted audit mutation).
- Where statutory retention (e.g., pension) overrides erasure, the change is `BLOCKED_RETENTION` with a recorded `legal_basis`, and the data is restricted from rendering rather than deleted.
- Export artefacts in G13 marked `REDACTED` and regenerated where lawful; predictions purged; affected snapshots restated as new knowledge-versions.
- Triggered by G01 PII events, DPDP data-principal requests, or `consent_records` withdrawal (Platform §P05).

### 16.7 Embed & NL Security Policy

- Embed credentials presented via header or short-lived code-exchange — **never** in a URL; issued maker-checker (P01), scoped, signed, expiring, revocable, rotatable; CSP `frame-ancestors` enforced; scope re-validated per render via **P02**; outbound on **X.3**; credentials via **P04 `integration_credentials`**.
- NL query uses a **named on-prem LLM at the CGG Data Centre** (no egress); follows **P03 guardrails** (backend-only, PII stripped server-side before any model call, informational-only, per-tenant isolation); intent mapped only to the governed semantic model; below the confidence threshold it clarifies or refuses; every interpretation + confidence + outcome logged to `nl_query_log`.

### 16.8 Assumptions Log

- Marts refresh read-only from contracted source views / Debezium CDC (read models); G14 never writes source tables; backfill on P06.
- **RBAC v1.7 + org hierarchy is authoritative; access decided entirely by P02** — G14 mirrors nothing into a parallel engine; scope/embed mutations maker-checked on P01.
- Payroll/cost analytics use locked snapshots only.
- Predictive outputs advisory (P03-aligned), fairness-governed, friction-gated, never recorded against source modules.
- Sanctioned strength/roster points come from the establishment/position reference (FR-19), the named denominator authority (`GAP`).
- Snapshots are bitemporal; corrections create knowledge-versions; DPDP changes propagate across the estate reconciled with retention + P05 redaction marker.
- Multi-tenant (`tenant_id`/`entity_id`); mart schema entity-aware; Org Admin cross-entity, Platform Super Admin cross-tenant.
- Per ADR-01, only the governed core holds analytics-DB credentials; charting/export/scheduling/NL-orchestration are adopted libraries over already-P02-scoped, masked, suppressed result sets.
- Jobs on X.1 (`JOB-G14-*`); notifications on X.2/W.3 (`MSG-G14-*`); errors `ERR-G14-*`; all registered in the Foundation indexes.

---

*BRD v3.0 — Dashboard and Analytics (G14). Platform re-grounding of v2.0 (M14-DAS) onto the PrimeSoft HRMS platform as an EXTEND/REUSE of M16 Reports & Analytics. Preserves all 23 FRs, 24 owned analytics artefacts, and council amendments R1–R16 + world-class additions; re-anchors row-level security onto P02, audit onto P05, workflow onto P01, jobs onto X.1, notifications onto X.2/W.3, outbound onto X.3, migration onto P06, roles onto RBAC v1.7, and conventions onto Foundation FS v1.6. Adds `## Alignment with PrimeSoft Platform` and this `## Amendments (v2 → v3)` table. Final Reconciliation Table: 0 unresolved gaps including platform rows.*
