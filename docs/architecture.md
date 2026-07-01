# Government HRMS — Consolidated Architecture Document

**Status:** Authoritative technical reference (Stage 3). Single source of truth all downstream build stages (guidelines, contracts, LLDs, phase-executor, review) read to understand where code lives and how the system is structured.
**Scope:** The 14-module government/public-sector HRMS (`G01`–`G14`), hosted at the CGG Data Centre, built as a public-sector configuration and extension of the existing **PrimeSoft HRMS platform**.
**Grounded in (upstream contracts — referenced, never re-authored):**
- `docs/brd/PLATFORM_FOUNDATION.md` — platform build contract (P01–P06, X.1–X.3, W.1–W.3, RBAC v1.7, multi-tenancy, API/error conventions, NFR baseline).
- `docs/brd/MODULE_RECONCILIATION.md` — G01–G14 map, net-new vs extend, convention overrides (§C), net-new entity register (§D).
- `docs/data-model/README.md` + `docs/data-model/CONVENTIONS.md` — the validated 447-table PostgreSQL schema, build order, conventions.
- `docs/EXECUTIVE_OVERVIEW.md` — programme overview and rigor trail.
- `docs/brd/v3/G01…G14` — the 14 authoritative platform-grounded module BRDs.

> **Reading rule.** This document defines *structure and decisions*. It does not restate requirements (BRDs own those), the schema (data-model owns that), or platform engine internals (Platform Spec v1.6 owns those). Where it names a convention, that convention is inherited from `PLATFORM_FOUNDATION.md`; this document never invents a convention that contradicts the platform. Contradictions resolve in favour of the platform artefact (`PLATFORM_FOUNDATION.md` §1.1).

---

## 1. System Context & Goals

### 1.1 What the system is

A government HRMS covering the **14 functional areas** of the *Functional Scope of Work — HRMS*, authored to a world-class HCM standard (Workday / SAP SuccessFactors / Oracle HCM class) but built on the organisation's existing **commercial-grade, multi-tenant PrimeSoft HRMS platform**. It is explicitly **not greenfield**: the government programme is a public-sector configuration and statutory extension of PrimeSoft. Modules **consume** platform contracts by id (P01–P06, X.1–X.3, W.1–W.3, RBAC v1.7, VAL-*/JOB-*/MSG-*/ERR-*) and **never re-author** them (`PLATFORM_FOUNDATION.md` §1, §9).

### 1.2 Goals & principles

| Goal | How the architecture delivers it |
|---|---|
| Build on PrimeSoft, not greenfield | Modules extend or configure platform engines; only 6 net-new statutory engines are authored, and even those run on P01/P05/P06 (§1.4). |
| Statutory system-of-record integrity | Digital Service Register (G12) is an append-only ledger on the P05 audit/immutability substrate; other modules post to it, none mutate it directly. |
| Data isolation by construction | Multi-tenant `tenant_id`/`entity_id` on every table, enforced at the data layer via RLS (P02 substrate) — an application bug cannot leak across tenants. |
| Deny-by-default access + PII protection | P02 `Authorization.check` resolves permission per request; PII Protection Ceiling overrides everything upward; field masking on serialization. |
| Auditability | P05 dual-log, DB-trigger capture — 100% mutation capture, zero gaps, ≥ 7-year retention. |
| Government compliance | DPDP Act 2023 + Aadhaar Act 2016 engineered controls; statutory retention floors; WCAG 2.1 AA. |

### 1.3 Users (actor classes)

- **Platform roles:** Platform Super Admin (cross-tenant), Organisation Admin (single tenant, cross-entity).
- **Entity-scoped operational roles:** HR Administrator (superset operational role), Finance Admin, HRBP, Office Admin, module admins (Leave/Attendance/Performance/Document/Analytics/Payroll…).
- **Manager hierarchy:** Manager L1–L5, HOD, UAG Head, Skip-level / Dotted-line Manager.
- **Individual access:** Employee, Candidate/Pre-joining, Contractor.
- **Government statutory actors (ADDITIONS to the RBAC taxonomy, `PLATFORM_FOUNDATION.md` §6.6):** SR Custodian/Registrar, Disciplinary Authority, Inquiry Officer, Appointing Authority, Pension/Payroll Officer, Auditor (mapped to Org-Admin read + entitlement), System Administrator (mapped to Org/Platform Admin). Segregation of duties (maker ≠ checker, no self-approval) is enforced by P01/P02, not re-coded.

### 1.4 The "build on PrimeSoft" principle

- **EXTEND** (reuse the PrimeSoft module, add public-sector fields/forms/flows): G01, G02, G03, G08, G13, G14.
- **NET-NEW statutory engines** (no PrimeSoft counterpart, authored as new business logic on P01/P05/P06): G04 Leave→SR, G05 Transfer/Relieving/Joining, G06 Promotion/Seniority, G09 Disciplinary, G11 Pension, G12 SR ledger. G07 Training is net-new but non-statutory.
- **ROADMAP extension:** G10 Payroll & Benefits extends PrimeSoft M06/M07 (Phase-2 platform modules); sequenced after those are live.

### 1.5 Hosting context

Deployed at the **CGG (Centre for Good Governance) Data Centre / government cloud**, single-tenant government deployment in the PrimeSoft **Standalone / Group-Company** tenancy model where each department/directorate is an `entity` (`PLATFORM_FOUNDATION.md` §2). See §9.

---

## 2. Architecture Style

### 2.1 Chosen style: multi-tenant modular monolith on the PrimeSoft platform

**Decision (ADR-01, §10):** the government HRMS is delivered as a **modular monolith** — a single deployable application with strong internal module boundaries (G01–G14) sharing one PostgreSQL database — layered on the PrimeSoft platform services, **not** a fleet of independently deployed microservices.

**Rationale:**
- **Consistency with the platform.** PrimeSoft's platform engines (P01 workflow, P02 authz, P05 audit) are cross-cutting shared services with a single logical database and cross-module referential integrity (1,907 FK constraints across the 447-table schema). Splitting modules into separate databases/services would break the FK graph, the DB-trigger audit substrate, and the SR ledger's cross-module posting contract.
- **Transactional integrity.** Net-new statutory flows (transfer → relieving → joining → SR event; disciplinary due-process → penalty → SR event) require multi-table transactions and a single append-only SR ledger. A monolith gives ACID guarantees without distributed-transaction complexity.
- **Operational simplicity for a government data centre.** One deployment unit, one backup/DR posture, one RLS-enforced database — appropriate for a 99.5%/month availability target and a government ops team.
- **Module boundaries preserved logically,** not physically: each module owns its schema slice and service layer; shared systems of record (G01 employees, G12 SR, G13 documents) are read/written through owning-module contracts.

**Consequence:** modules are versioned and released together; horizontal scale is achieved by running multiple stateless app instances behind a load balancer (§8.3), with background work isolated by the X.1 jobs runner.

### 2.2 Tenancy model

Every business table carries `tenant_id` (NOT NULL) and, where entity-scoped, `entity_id`. Scoping is enforced at the **data/persistence layer** (RLS — §5.2), never only in application code. A query without a resolvable tenant scope is **rejected, not defaulted to "all"** (`CONVENTIONS.md` §2; Platform §0.1). Cross-entity reach (Org Admin) and cross-tenant reach (Platform Super Admin) are **widened scope filters, never bypasses**.

### 2.3 Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | **React + TypeScript + Tailwind CSS + shadcn/ui** | Single-page app; WCAG 2.1 AA; responsive breakpoints 375/768/1280 px; touch targets ≥ 44×44 px; canonical UI-state standard (empty/loading/error/no-permission/partial-data). W.2 form definitions and RBAC field visibility drive rendered fields. No skeleton UI — real fields, data, API calls, states. |
| Backend | Application service tier exposing `/api/v1` REST, hosting the module service layers and consuming the PrimeSoft platform engines | Physical framework is an engineering choice within the platform's logical architecture (`MODULE_RECONCILIATION.md` §C); the government spec fixes behaviour, API conventions and NFRs, not the framework. Connects to PostgreSQL as a **non-superuser** role and sets per-request RLS GUCs from the validated session. |
| Data store | **PostgreSQL** (validated on PG14; individual module files validated up to PG17) | Single logical database, 447 tables, 1,907 FKs, 443 RLS-enabled tables, 700 enum types. `pgcrypto` for `gen_random_uuid()`. |
| Object storage | Encrypted object store for documents & large binaries (G13 vault, migration payloads) | `documents`/`document_versions` hold metadata + storage-object references; binaries live in object storage, not the RDBMS. |
| Async / jobs | X.1 background-jobs runner | Effective-dating, SR posting/relay, retention/disposal, pension runs, analytics mart refresh. |

---

## 3. Platform Services Layer (P01–P06, X.1–X.3, W.1–W.3)

The platform services are **already built**. Modules reference the service and configure it; they do not re-author it. Every internal call inherits the service-contract convention: auth context + idempotency key + correlation id + standard error envelope (Platform §0.4).

### 3.1 Layering (platform → modules → UI)

```
+---------------------------------------------------------------------------+
|                       PRESENTATION (React + TS + Tailwind + shadcn)         |
|   Workspace switcher: Me | My Team | Admin   ·  W.2-driven forms & states   |
|   Field visibility & masking applied per RBAC on serialization             |
+---------------------------------------------------------------------------+
                                    |  /api/v1  (Bearer JWT, X-Correlation-Id,
                                    |            Idempotency-Key, cursor paging)
                                    v
+---------------------------------------------------------------------------+
|                    MODULE SERVICE LAYER  (modular monolith)                 |
|                                                                             |
|  G01 Employee   G02 PDM     G03 Att/Leave   G04 Leave->SR   G05 Transfer    |
|  G06 Promotion  G07 Train   G08 APAR        G09 Discipline  G10 Payroll     |
|  G11 Pension    G12 SR      G13 Documents   G14 Analytics                   |
|                                                                             |
|  Systems of record:  G01 employees  ·  G12 SR ledger  ·  G13 documents      |
+---------------------------------------------------------------------------+
    | every module call goes through the platform services below (by id)      |
    v                                                                         v
+---------------------------------------------------------------------------+
|                         PLATFORM SERVICES (PrimeSoft)                       |
|                                                                             |
|  P01 Workflow Engine        P02 RBAC / Authorization.check                  |
|  P03 Chat Agent (grounded)  P04 Tenant & Org Admin / integration_credentials|
|  P05 Audit & Compliance     P06 Migration Toolkit (ETL+V)                   |
|                                                                             |
|  X.1 Jobs runner   X.2 Notifications   X.3 Integration framework            |
|  W.1 Process-flow defs   W.2 Form defs   W.3 Notification config            |
+---------------------------------------------------------------------------+
    |                                                                         |
    v                                                                         v
+---------------------------------------------------------------------------+
|   PostgreSQL (RLS-enforced, DB-trigger audit)     Encrypted object storage  |
+---------------------------------------------------------------------------+
```

### 3.2 Service consumption matrix

| Service | What it provides | How modules consume it |
|---|---|---|
| **P01 Workflow Engine** | `startInstance · advance · approve · reject · sendBack · delegate · cancel · query`, all idempotent; 5 patterns (SEQUENTIAL, PARALLEL_ALL_OF, PARALLEL_ANY_OF, CONDITIONAL, DYNAMIC_APPROVER); 4 approver-resolution mechanisms; per-stage SLA/escalation; in-flight version pinning. | All maker-checker and statutory approval flows (G02 change requests, G05 transfer orders, G06 DPC sanction, G08 APAR chain, G09 due-process, G11 pension sanction) are **configured W.1 flow definitions** executed by P01. No module codes a workflow engine. |
| **P02 RBAC / Authorization.check** | `check({subject, action, resource_ref, fields[]}) → {allowed, scope_filter, field_mask[]}`; resolution order deny-by-default → role grant → multi-role INTERSECTION → individual entitlement → capability flag → **PII Ceiling** → data-scope filter → field mask on serialization. | Every endpoint calls `Authorization.check`; never re-implements permission logic. Row scoping is the RLS substrate (§5.2); field masking applied above the row filter on serialization. |
| **P03 Chat Agent** | Grounded Q&A from org policy/statutory docs + user's own permissible data; PII stripped server-side; informational-only; metadata-only logging. | Government statutory documents grounded for policy Q&A; never triggers workflows. |
| **P04 Tenant & Org Admin** | Provisioning; device/IP registration; encrypted `integration_credentials` (rotation, per-integration scope). | Gov attendance device/IP registration; treasury/pension/SR export integration credentials registered here for X.3. |
| **P05 Audit & Compliance Log** | Dual logs (`audit_log` + `security_audit_log`); DB-trigger capture on every INSERT/UPDATE/soft-DELETE; immutable; ≥ 7-yr retention; DPDPA redaction marker only. | No module defines its own audit table. **G12 SR ledger runs on this immutability substrate** (DB-trigger, immutable, append-only, hash-chain OPEN-PLAT-03). |
| **P06 Migration Toolkit (ETL+V)** | Extract→Validate→Transform→Load→Verify; 3 mandatory staging dry runs; waves; `migration_runs` ledger; source-id traceability. | Legacy service-register, pension, and employee data migrate through P06 with a `<gov>_source_id` traceability column against the actual legacy register. |
| **X.1 Jobs runner** | Idempotent (per-period run key), retry ×3 backoff, terminal failure → `JOB-FAIL`/`MSG-SYS-JOBFAIL`, per-tenant isolation, period lock, run audit row. | Modules register `{job_id, schedule, tenant_scope}` (`JOB-G0x-*`) in the Foundation §4 index: effective-dating, SR relay, retention/disposal, pension runs, mart refresh. |
| **X.2 Notification Infrastructure** | IN_APP + EMAIL in parallel; **EMAIL mandatory/non-suppressible for approval & statutory notices**; retry ×5 + dead-letter; digest; every dispatch audited; templates by `MSG-*` id. | Statutory notices (transfer order, charge memo, pension sanction) bind the mandatory-email rule; templates referenced by `MSG-G0x-*` id, never duplicated. |
| **X.3 Integration Framework** | Outbound call/credential/retry pattern, circuit-breaking, idempotency, payload versioning, per-integration error mapping. | Government portal/treasury/pension-disbursement integrations; upstream failures mapped to 500/`ERR-LOADFAIL`, no 503 in the standard table. |
| **W.1 Process-Flow Definitions** | Flow model (stages, action types, assignee, SLA, skip, send-back, pattern) executed by P01. | Government workflows are configured flow definitions, not code. |
| **W.2 Form Definitions** | Fields/types, validation by `VAL-*` id, conditional show/required-if, entity data-binding, per-role visibility, i18n, versioning. | APAR, charge memo, pension forms, exit/joining reports are W.2 forms consumed by the React front end. |
| **W.3 Notification Configuration** | Per-event recipient resolution, channel selection, reminder vs escalation, suppression/dedup, per-tenant overrides. | Government notification events configured here; templates by `MSG-*` id. |

---

## 4. Module Architecture

### 4.1 Module boundaries & platform consumption

Each module owns a schema slice (build order in `data-model/README.md`) and a service-layer boundary. Systems of record are owned by exactly one module; all other modules read/write through the owning module's contract (no entity forks).

| Module | Relationship | Owns (net-new / satellites) | Reads (systems of record) | Platform services used |
|---|---|---|---|---|
| **G01** Employee Profile Management | EXTEND M01 | `employees` master + governance satellites (aliases, Aadhaar vault, attribute/position history, certificates, consent/privacy, governed change, break-glass) — **system of record for the employee master** | — | P01, P02, P05, P06, W.2; effective-dating job |
| **G02** Personal Details Modification | EXTEND (P01) | Change-request maker-checker tables (not an SR writer) | G01 employees | **P01** (sensitive-field change flow), P02, P05, W.1/W.2 |
| **G03** Attendance & Leave | EXTEND M04+M05 | Leave types/policies/balances/ledger/applications; attendance punches/shifts/rosters | G01 employees; P04 device/IP registration | P01 (leave/attendance approval), P02, P05, X.1, W.2; `VAL-LV`/`VAL-AT` |
| **G04** Leave → SR Integration | NET-NEW | Leave→SR outbox/relay/reconciliation/DLQ (**SR writer**) | G03 leave events; **G12 SR ledger** | **P01, P05**, X.1 (relay job) |
| **G05** Transfer, Relieving & Joining | NET-NEW | `transfer_orders`, clearance, handover, `relieving_records`, `joining_records` (**SR writer**) | G01 employees; **G12 SR** | **P01** (configured flow), **P05**; emits SR events |
| **G06** Promotion, Posting & Progression | NET-NEW | `seniority_list`, `promotion_case`, `dpc_proceedings`, MACP, sanctioned posts, qualifying-service (**SR writer**) | G01 employees; **G12 SR** | **P01** (sanction), **P05**; emits SR events |
| **G07** Training & Skill Development | NET-NEW (non-statutory) | Competency framework, training calendar, nominations, certifications, LMS | G01 employees | P01 (nomination approval), P02, W.2; (SR writer for certifications) |
| **G08** Performance Appraisal (APAR) | EXTEND M09 | Appraisal/APAR/goals/calibration/representation/PIP; APAR form + reporting/reviewing/accepting-officer chain (**SR writer**) | G01 employees; **G12 SR** | **P01** (officer chain), P02, P05, W.2; `VAL-WEIGHTAGE/WSUM` |
| **G09** Disciplinary Cases & Punishment | NET-NEW | `disciplinary_case`, `charge_sheet`, `inquiry_proceedings`, `penalty_order`, `appeal` (**SR writer; reference impl of due-process**) | G01 employees; **G12 SR** | **P01** due-process flow with SoD, **P05**; new roles (Disciplinary Authority, Inquiry Officer) |
| **G10** Payroll & Benefits | EXTEND M06/M07 (Phase-2) | Salary/payroll-run/deductions/loans/benefits/FnF; public-sector pay scales/allowances (**SR writer**) | G01 employees; **G12 SR** | Extends PrimeSoft payroll/statutory engines; P01, P05, X.1 |
| **G11** Retirement & Pension | NET-NEW | Separation, pension calculation, gratuity, commutation, terminal benefits, PPO, pensioner, qualifying-service ledger (**SR writer**) | G01 employees; **G12 SR** | **P01** (sanction), **P05**, **P06** (legacy pension migration), X.1 (pension run) |
| **G12** Digital Service Register (SR) | NET-NEW (**system of record**) | `service_register_events` (append-only ledger, core) + supporting: event-type catalog, status sub-ledger, anchors, gap register, attestations, corrigenda, LTV | G01 employees | **P05** immutability substrate; ingestion contract for all SR writers |
| **G13** Document Management | EXTEND M11 (**system of record**) | Vault: types/folders/ACLs/retention/legal-hold/signatures/clearance/DLP; `documents`/`document_versions` core | — | P02 (ACL), P05, X.1 (retention/disposal); object storage |
| **G14** Dashboard & Analytics | EXTEND M16 | Dashboards/KPIs/reports/marts/scope-policy/prediction/embed (read-model) | Reads all modules via scoped marts | **P02** (RLS = data scope), read replicas/marts; X.1 (mart refresh) |

### 4.2 Systems of record & the read/write contract

| System of record | Owner | Writers | Readers | Rule |
|---|---|---|---|---|
| **Employee master** (`employees`, `employee_dependents`) | **G01** | G01 only (via governed-change; sensitive fields via G02 on P01) | all modules (read-only, no divergent field/enum redeclaration) | Other modules FK by `id`; never fork the master. |
| **SR ledger** (`service_register_events`) | **G12** | Canonical writer set **G01, G04, G05, G06, G08, G09, G10, G11** via G12's single ingestion contract | G12 read/export via P05 query contract; G14 marts | Append-only; hash-chained per `(tenant_id, employee_id)`; **no module mutates it directly** — all posting is through the G12 ingestion contract (resolved as a MATERIAL CONFLICT in integration review v3.1). |
| **Documents** (`documents`, `document_versions`) | **G13** | G13 vault operations | all modules attach via `document_id` (store the reference only) | Binaries in object storage; metadata + versions in G13. |

---

## 5. Data Architecture

### 5.1 The 447-table schema

The consolidated PostgreSQL schema is authored and **validated end-to-end** (load 00→14 in order into a clean cluster with `ON_ERROR_STOP=1`, all seed inserting): **447 tables · 1,907 FK constraints · 443 RLS-enabled tables · 700 enum types.** Build/load order and per-file ownership are defined in `docs/data-model/README.md`; conventions in `docs/data-model/CONVENTIONS.md`. Highlights:

- **Shared core** (`00-platform-core.sql`, 35 tables): tenancy, RBAC, employee master, P01 workflow, P05 audit, G12 SR core, G13 documents core, notifications/jobs/migration. Module schemas **reference, never redefine** these canonical tables (FK by `id`).
- **Keys:** `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; business keys (`service_no`, `case_no`, `order_no`, …) are separate `UNIQUE` columns, tenant-scoped where applicable.
- **Standard columns:** `created_at/updated_at/created_by/updated_by/is_deleted` (soft delete only — no hard delete). **Append-only ledgers carry only `created_at`/`created_by`** — no `updated_at`, no `is_deleted`, no UPDATE/DELETE.
- **Enums:** platform-wide closed sets as Postgres `CREATE TYPE … AS ENUM` (module-prefixed, e.g. `g09_*`); tenant-configurable value sets as master tables with `UNIQUE (tenant_id, *_code)` so a tenant extends without a DDL migration.

### 5.2 RLS as the P02 data-scope substrate

Row-level security is the mechanism that makes tenant/entity isolation a **data-layer** guarantee, not an application-layer hope. Every tenant-scoped table (399 of 403) enables and **forces** RLS with a `tenant_isolation` policy:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  )
  WITH CHECK ( … same … );
```

- The app connects as a **non-superuser** role and, per request from the validated session, sets `app.current_tenant_id` and `app.is_platform_admin`. An unscoped query returns **no rows** (reject, not default-to-all).
- Org-Admin cross-**entity** reach and **field masking** are applied **above** the row filter by P02 `Authorization.check` on serialization — not in the RLS policy. This composition is the full four-layer RBAC enforcement (module → field/section → row → action).
- Reference/catalog tables (`pii_tiers`, `permissions`) are platform-global: no `tenant_id`, no RLS.

### 5.3 The SR ledger (append-only, P05 substrate)

The Digital Service Register (`service_register_events`, owned by G12) is the statutory system-of-record and the highest-integrity data structure in the system:

- **Append-only, immutable:** no UPDATE/DELETE (enforced by DB grants + triggers), only `created_at`/`created_by`. Runs on the same P05 immutability substrate as `audit_log`.
- **Hash-chained** per `(tenant_id, employee_id)`; tamper-evidence tracks platform decision **OPEN-PLAT-03** rather than inventing a parallel mechanism. (Corrects the discarded v1 "blockchain SR" overstatement.)
- **Single ingestion contract:** the canonical writer set posts events through G12's ingestion contract (with `VAL-G12-SREVENT`-style append-integrity validation); corrections are **corrigenda** entries, never edits. Status changes are recorded in the `sr_status_events` sub-ledger.

### 5.4 Analytics read-model / marts (G14)

G14 is a **read model**, not a transactional writer. It builds role-scoped dashboards, KPIs, pre-built reports, and **materialised marts** refreshed by X.1 jobs, reading from the transactional modules. Data is scoped to each user's own entitlement via the same **P02/RLS** substrate (`analytics.*` scope policy) — a user's dashboard cannot show rows their row-level scope forbids. Government KPIs (SR completeness, pension pipeline, disciplinary aging, compliance) are additive to the PrimeSoft M16 report set. Analytics reads should target read replicas/marts (§8.3) to protect transactional p95.

---

## 6. Cross-Cutting Concerns

| Concern | Mechanism (platform service) | Notes |
|---|---|---|
| **Authentication** | Bearer-token (JWT) session carrying resolved roles + tenant/entity scope. OIDC/Google SSO (OAuth 2.0), username/password (one-way hashed). **MFA (TOTP / SMS OTP) enforced by default for HR Admin, Org Admin**, and high-privilege statutory roles (Disciplinary Authority, Pension Officer). Short-lived access tokens + server-side refresh with blacklist; logout invalidates both; Org-Admin-configurable lockout/IP restriction. | Session never carries raw permissions — resolved per request by P02. |
| **Authorization** | **P02 deny-by-default**, resolved per request: role grant → multi-role INTERSECTION (more restrictive wins) → time-bound entitlement → capability flag → **PII Protection Ceiling (overrides everything upward)** → data-scope filter → **field mask on serialization**. | RLS = row scope (§5.2); masking above the row filter. `E·AR` (Approval-Required) fields route through P01, never a direct write. |
| **Audit** | **P05 dual-log** (`audit_log` mutations + `security_audit_log` auth/permission/admin), **DB-trigger capture** on every INSERT/UPDATE/soft-DELETE — 100% capture, no API bypass. Immutable; ≥ 7-yr retention; archivable to cold storage after 2 yr but queryable within 24h; PII stored masked; reading an audit log is itself audited. | Sole permitted mutation is the DPDPA right-to-erasure redaction marker on `audit_log.old_value`. |
| **Workflow** | **P01** engine executes all approval/maker-checker/statutory flows as configured W.1 definitions; idempotent operations; SLA/escalation; in-flight version pinning; SoD (maker ≠ checker) enforced by the engine. | Government due-process, transfer, promotion, pension-sanction all run here. |
| **Notifications** | **X.2** IN_APP + EMAIL in parallel; statutory/approval EMAIL mandatory and non-suppressible; retry ×5 + dead-letter; templates by `MSG-*` id; configured via W.3. | Statutory notices bind the mandatory-email rule. |
| **Integration** | **X.3** framework for outbound calls (treasury/pension/portal), circuit-breaking, idempotency, payload versioning, error mapping; credentials from encrypted `integration_credentials` (P04). | Upstream failure → 500/`ERR-LOADFAIL` (no 503 in the standard table). |
| **Background jobs** | **X.1** runner: idempotent per-period run key, retry ×3, terminal failure → `JOB-FAIL`/`MSG-SYS-JOBFAIL`, per-tenant isolation, period lock, run audit row. | `JOB-G0x-*` registered in Foundation §4 (effective-dating, SR relay, retention, pension run, mart refresh). |
| **Migration** | **P06** ETL+V: Extract→Validate→Transform→Load→Verify; 3 mandatory staging dry runs; waves; `migration_runs` ledger; `<gov>_source_id` traceability. | Legacy SR / pension / employee data. |
| **Config cascade & effective-dating** | Versioned config validated on save; cascade **platform default → tenant → entity → employee**; higher level never silently overwrites a lower override; in-flight instances continue on their started version. Effective-dated mutations are **staged and applied by the effective-date job**, not written live. | Government statutory effective dates (relieving/joining, promotion w.e.f., pension commencement) reuse this mechanism. |

---

## 7. API Architecture

Government endpoints **adopt the platform API conventions verbatim** (`PLATFORM_FOUNDATION.md` §4; `MODULE_RECONCILIATION.md` §C overrides).

| Convention | Rule |
|---|---|
| Versioning | All endpoints under **`/api/v1`**; breaking changes ship under a new major prefix; additive fields are non-breaking. |
| Auth context | Bearer JWT carrying roles/entity scope; endpoints call `Authorization.check` (P02) — never re-implement permission logic. |
| Idempotency | Unsafe transaction-creating POSTs accept an **`Idempotency-Key`** header; a repeat within **24h** returns the original result (409/`ERR-DUP-INSTANCE` on duplicate workflow start). Required for workflow-initiating POSTs. |
| Pagination | **Cursor only:** `?limit=` (default **25**, max **100**) + `cursor=`; response carries **`next_cursor`**. No offset paging. |
| Sorting / filtering | `?sort=field:asc|desc`, field filters per endpoint. |
| Correlation id | Every request carries/assigned **`X-Correlation-Id`**, echoed in the response header and written to every audit and log line. |
| Effective-dating | Mutations to effective-dated fields accept `effective_from`; staged, not live. |

**Canonical error envelope** (2xx returns the resource; 4xx/5xx return the envelope; correlation id is the **`X-Correlation-Id` response header**, not a body field):

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "field": "...", "details": { } } }
```

**Error taxonomy (8-code table — reference, do not extend without amendment):**

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | 422 | input failed a `VAL-*` rule |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks existence of out-of-scope records) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state conflict |
| `PRECONDITION_FAILED` | 412 | required precondition not met |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error (upstream failures mapped here via X.3) |

User-facing messages reference shared `ERR-*` ids (`ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-PAST-DATED`, `ERR-REASON-REQ`, `ERR-REVOKE-FORBIDDEN`, `MSG-SYS-JOBFAIL`); modules author only `ERR-G0x-*` and register them in the Foundation index. Validation cites `VAL-*` by id; modules author only `VAL-G0x-*`.

---

## 8. Non-Functional Architecture

### 8.1 NFR baseline (Vision §2.9; BRD §7 — the platform baseline governs)

| Metric | Target |
|---|---|
| Standard API p95 | < 500 ms @ 300 concurrent (Phase 1) |
| Read-heavy (directory/reports) | p95 < 300 ms cached · < 1000 ms uncached |
| Write operations | p95 < 1500 ms |
| Web page load (LCP, 4G) | < 2.5 s |
| Production uptime | **99.5% / month** |
| RTO / RPO | RTO < 4 h · **RPO < 1 h** |
| Audit completeness | 100% mutations captured, zero gaps |
| Accessibility | WCAG 2.1 AA — all web screens |
| Responsive breakpoints | 375 / 768 / 1280 px; touch targets ≥ 44×44 px |
| Deletions | soft delete only — no hard delete |

### 8.2 Security

- **OWASP** application-security posture; parameterised queries only (no SQL string interpolation); secrets only via environment/`integration_credentials` (encrypted); no stack traces/internal paths/secret ids in API responses; no logged passwords/tokens/PII.
- **DPDP Act 2023 + Aadhaar Act 2016** engineered controls: `consent_records` (immutable, superseded never deleted), PII stored masked in audit, right-to-erasure via redaction marker (non-statutory data only; statutory data has legally mandated retention floors), Aadhaar vault (G01) with restricted access.
- **PII Protection Ceiling** overrides every role upward; field masking on serialization.

### 8.3 Scalability & performance

- Stateless app tier scales horizontally behind a load balancer; sessions are token-based (no server affinity).
- Read-heavy analytics (G14) served from marts / read replicas to protect transactional p95.
- Index discipline: every FK column and common query column (`tenant_id`, `entity_id`, `status`, `*_date`, business keys) indexed (`CONVENTIONS.md` §5).
- Cursor pagination bounds all list queries; X.1 isolates heavy async work (pension runs, mart refresh, SR relay) from request threads.

### 8.4 Availability, backup & DR

- **99.5%/month** availability; **RPO < 1 h** (continuous/near-continuous PostgreSQL WAL/backup), **RTO < 4 h** (documented restore + failover runbook).
- Immutable P05 audit + append-only SR ledger have the same backup/retention guarantees (≥ 7 yr, cold-storage archival after 2 yr, queryable within 24 h); audit chain head to WORM per OPEN-PLAT-03.

### 8.5 Observability

- `X-Correlation-Id` threads every request across API, logs, and both audit logs — end-to-end traceability.
- X.1 job runs and X.2 dispatches are audited; `JOB-FAIL`/`MSG-SYS-JOBFAIL` ops alerts on terminal failure.
- Structured application logging (project logger, no production `console.log`); metrics for p95 latency, error rates, queue depth (notification/SR relay DLQ).

---

## 9. Deployment & Environments

- **Hosting:** CGG Data Centre / government cloud. Single government tenant in the PrimeSoft **Standalone / Group-Company** tenancy model — each department/directorate is an `entity`; consolidated cross-entity view for the directorate/secretariat via Org-Admin widened scope.
- **Packaging:** containerised deployable units — stateless app tier + async workers (X.1) — plus managed **PostgreSQL** and **object storage**. The modular monolith deploys as one application image; workers run the same image in a jobs role.
- **Environments:** at minimum Development → Staging → Production, with **three mandatory P06 staging dry runs** gating any production data cutover (`PLATFORM_FOUNDATION.md` §P06). Config is environment-scoped; secrets via environment / encrypted `integration_credentials` — no `.env` with real values committed.
- **Connectivity to the DB:** app connects as a non-superuser role and sets RLS GUCs per request (§5.2). Superuser is reserved for migrations/DDL.
- **DR:** warm standby / restore-from-backup meeting RTO < 4 h, RPO < 1 h; audit + SR ledger integrity preserved across failover; DR restore validated on the same 00→14 load sequence.

---

## 10. Key Architecture Decisions (ADR-style)

| ID | Decision | Rationale | Alternatives considered | Consequences |
|---|---|---|---|---|
| **ADR-01** | **Build on the PrimeSoft platform** (extend/configure engines; author only net-new statutory logic) | Programme is explicitly not greenfield; PrimeSoft is a commercial-grade multi-tenant HRMS. Reuse of P01–P06/X/W collapses risk and cost. | Greenfield HRMS; buy a different COTS HCM | Modules consume contracts by id; cannot re-author engines; must track platform OPEN-* items (e.g. OPEN-PLAT-03). |
| **ADR-02** | **Modular monolith** (single deployable + single PostgreSQL DB with strong module boundaries), not microservices | Preserves the 1,907-FK cross-module graph, DB-trigger audit substrate, single SR ledger, and ACID multi-table statutory transactions; simpler gov-datacentre ops for 99.5% SLA. | Per-module microservices + DB-per-service; modular monolith with schema-per-module in one DB | Modules release together; scale horizontally via stateless instances; boundaries are logical, enforced by ownership + review. |
| **ADR-03** | **SR ledger built on the P05 audit/immutability substrate** (append-only, DB-trigger, hash-chained), owned by G12 with a single ingestion contract | Statutory system-of-record needs 100% tamper-evident capture; P05 already guarantees it — no parallel mechanism. | Bespoke SR audit table; external blockchain ("blockchain SR" — rejected as overstated) | No module mutates SR directly; corrections are corrigenda; tamper-evidence tracks OPEN-PLAT-03. |
| **ADR-04** | **RLS as the P02 data-scope substrate** — tenant/entity isolation enforced in the database, masking + cross-entity above it | An application bug must not leak across tenants; deny-by-default at the row layer. | App-layer tenant filtering; separate DB per tenant | App connects as non-superuser, sets per-request GUCs; unscoped query returns no rows; 399/447 tables RLS-forced. |
| **ADR-05** | **All approval/maker-checker flows are configured P01/W.1 definitions**, not per-module code | One engine, SoD enforced centrally, in-flight version pinning, SLA/escalation for free. | Bespoke workflow per statutory module | Government flows authored as W.1 definitions + W.2 forms; engine never re-implemented. |
| **ADR-06** | **Single logical PostgreSQL database + external object storage** for binaries | Cross-module referential integrity + transactions; keep large binaries out of the RDBMS. | Polyglot persistence; blobs in DB | 447 tables, one backup/DR posture; documents store references, binaries in object storage. |
| **ADR-07** | **Adopt platform API conventions & 8-code error taxonomy verbatim** (`/api/v1`, cursor paging, idempotency, `X-Correlation-Id`, canonical envelope) | Consistency across 14 modules + PrimeSoft; overrides the invented `SHARED_FOUNDATION` conventions. | Per-module API styles; invented error codes | Modules author only `VAL-G0x`/`MSG-G0x`/`ERR-G0x` ids, registered in Foundation indexes. |
| **ADR-08** | **G14 analytics as a read-model/mart layer** scoped by P02/RLS, off read replicas | Protect transactional p95; enforce that dashboards respect row scope. | Live queries against transactional tables | Marts refreshed by X.1; a user's dashboard cannot exceed their data scope. |
| **ADR-09** | **Government roles as ADDITIONS to RBAC v1.7**, SoD via P01/P02 | No parallel access scheme; auditable grants; maker ≠ checker enforced by the engine. | Invented parallel gov role list | New roles/flags registered in RBAC §4.3/§2.2; Auditor → Org-Admin read, System Admin → Org/Platform Admin. |
| **ADR-10** | **G10 Payroll sequenced after Phase-2 platform (M06/M07)**, extended not re-authored | PrimeSoft defines payroll/statutory as Phase 2/3; authoring a parallel engine would duplicate the roadmap. | Author gov payroll engine now | G10 is a roadmap extension; build sequence defers it. |

---

## 11. Risks & Assumptions

### 11.1 Assumptions

- The PrimeSoft platform engines (P01–P06, X.1–X.3, W.1–W.3), RBAC v1.7, VAL-* library, and multi-tenancy substrate are **available and stable** at build time; the government build consumes them by id.
- The physical backend framework is an engineering choice **within** the platform's logical architecture; this document fixes behaviour, API conventions, module boundaries, and NFRs, not the runtime language.
- The 447-table schema is the validated baseline; changes go through the data-model amendment workflow, not ad-hoc DDL.
- CGG Data Centre provides managed PostgreSQL, object storage, and container orchestration meeting the NFR baseline (§8).
- G10 Payroll depends on Phase-2 PrimeSoft M06/M07 being live.

### 11.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **OPEN-PLAT-03** (SR/audit hash-chaining) not yet confirmed by the platform | SR tamper-evidence depends on it | Track the platform decision; do not invent a parallel chain; append-only + immutable holds today. |
| Platform-engine behaviour drift (P01/P02/P05) vs government assumptions | Cross-module flows/audit could break | Consume by id; contract tests against the platform service surfaces; log conflicts as convention overrides (`MODULE_RECONCILIATION.md` §C). |
| SR ingestion contention across 8 writers | Ledger integrity / ordering | Single G12 ingestion contract, per-`(tenant,employee)` hash chain, idempotent posting, DLQ + reconciliation (G04 pattern). |
| Monolith scaling / release coupling | Throughput + change blast radius | Stateless horizontal scale, mart/read-replica offload for G14, disciplined module boundaries enforced by ownership + review. |
| Legacy data quality on P06 migration | Cutover risk to a statutory system-of-record | 3 mandatory staging dry runs, waves, `migration_runs` ledger, `<gov>_source_id` traceability, failed-record logging. |
| Statutory retention vs DPDP erasure conflict | Compliance exposure | Statutory retention floors override erasure; erasure is a redaction marker on non-statutory data, itself audited. |
| RLS misconfiguration / superuser bypass | Tenant data leak | App connects as non-superuser with FORCE RLS; unscoped query returns no rows; RLS coverage verified on 399/447 tables in the load test. |
| G10 dependency on Phase-2 platform slips | Payroll delivery slips | G10 explicitly sequenced last; not on the critical path for the statutory Phase-1 modules. |

---

*End of Architecture Document. Downstream stages (guidelines-generator, contracts-generator, lld-generator, phase-executor) read this file together with `PLATFORM_FOUNDATION.md`, `MODULE_RECONCILIATION.md`, and `docs/data-model/`.*
