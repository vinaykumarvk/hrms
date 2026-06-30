> ⚠️ **SUPERSEDED FOR CONVENTIONS (2026-07-01).** This brief was authored before the existing
> **PrimeSoft HRMS** platform deliverables were taken into account. Its *module list* (the 14 government
> line items, §1) and *persona/authoring standard* (§6) remain valid, but its invented technical
> conventions — canonical entities (§2), global conventions (§3), roles (§4), and technical defaults
> (§5) — are **overridden by** [`PLATFORM_FOUNDATION.md`](PLATFORM_FOUNDATION.md) (the real platform:
> P01–P06, VAL-*, RBAC v1.7, multi-tenancy, API conventions) and [`MODULE_RECONCILIATION.md`](MODULE_RECONCILIATION.md)
> (gov↔PrimeSoft map, `G01–G14` codes, convention-override table). **v3 BRDs must consume the platform,
> not the conventions below.** Treat §§2–5 here as historical.

# HRMS Program — Shared Foundation Brief (Build Contract for all Module BRDs)

**Program:** Enterprise Human Resource Management System (HRMS) — "PeopleGov / HRMS Suite"
**Context:** Originating Functional Scope of Work targets a government/public-sector HR system
(hosted at CGG Data Centre) covering 14 modules including a statutory **Digital Service Register
(Digital SR)**, **Pension**, and **Disciplinary & Punishment** management. Every module BRD must be
authored to **world-class, global-enterprise HR standards** (the bar set by leading global
organisations and best-in-class HCM suites such as Workday, SAP SuccessFactors, Oracle HCM) **while
honouring the public-sector statutory context** implied by the source (service register, seniority,
transfers/postings, pension, disciplinary proceedings).

This brief is the **single source of truth** every module BRD must reference. Do not redefine these
shared elements locally; reference them and extend only where your module legitimately requires it.

---

## 1. The 14 Modules (one BRD each)

| # | Module | BRD code | One-line responsibility |
|---|---|---|---|
| 01 | Employee Profile Management | M01-EPM | Canonical employee master record & golden source of person/job data |
| 02 | Employee Personal Details Modification Workflow | M02-EPDM | Self-service edit requests with maker-checker approval & audit |
| 03 | Attendance and Leave Management | M03-ATL | Time, attendance capture, leave balances, applications, approvals |
| 04 | Leave Management Integration with Digital Service Register | M04-LSR | Posting approved leave events into the statutory Digital SR |
| 05 | Employee Transfer, Relieving and Joining Workflow | M05-TRJ | Transfer orders, relieving at source, joining at destination |
| 06 | Promotion, Posting & Progression Monitoring | M06-PPP | Seniority, promotions, postings, career progression tracking |
| 07 | Training and Skill Development Management | M07-TSD | Competency framework, training calendar, nominations, certifications |
| 08 | Performance Appraisal Management | M08-PAM | Goal-setting, reviews/APAR, calibration, ratings |
| 09 | Employee Disciplinary Cases and Punishment Management | M09-DCP | Charges, inquiry, penalties, appeals — due-process workflow |
| 10 | Payroll and Benefits Management | M10-PAY | Salary structure, payroll run, statutory deductions, benefits |
| 11 | Retirement and Pension Management | M11-PEN | Superannuation, pension processing, terminal benefits |
| 12 | Digital Employee Service Register (Digital SR) | M12-SR | Statutory lifecycle service record — system of record for service events |
| 13 | Document Management and Secure Storage | M13-DMS | Versioned, access-controlled, encrypted document repository |
| 14 | Dashboard and Analytics | M14-DAS | Cross-module KPIs, workforce analytics, compliance dashboards |

**Module dependency note:** M01 (Employee master) and M12 (Digital SR) are foundational systems of
record. M03/M04 feed M12. M05/M06/M09 generate SR events. M10/M11 consume M01+M12. M13 underpins all
modules' documents. M14 reads from all.

---

## 2. Canonical Shared Entities (define once here; every module references these)

Every module BRD's data model **must reuse** these canonical entities and only add module-specific
entities. Do not redefine `employees`, `users`, `org_units`, `roles`, `audit_log`, `documents`,
`notifications`, or `service_register_events` with conflicting fields.

- **employees** — golden employee master. Key fields: `employee_id (PK, UUID)`, `service_no (unique,
  human-readable)`, `first_name`, `last_name`, `dob`, `gender`, `pan`/`national_id`, `date_of_joining`,
  `cadre`, `designation_id`, `org_unit_id`, `employment_status` (enum: ACTIVE, ON_LEAVE, SUSPENDED,
  TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED), `reporting_manager_id`, `created_at`,
  `updated_at`, `created_by`, `updated_by`, `is_deleted`. Owned by M01.
- **users** — authentication/identity principals (1:1 or 1:0 with employees), with `role_ids`, MFA,
  status. Shared platform.
- **org_units** — hierarchical organisation/office/department tree. Shared platform.
- **designations** / **cadres** / **pay_scales** — reference/master data.
- **roles** & **permissions** — RBAC catalog (see §4).
- **service_register_events** — append-only statutory SR ledger (owned by M12; written by many).
- **documents** — canonical document/object store metadata (owned by M13; referenced by all).
- **notifications** — outbound notification ledger (shared platform).
- **audit_log** — immutable audit trail (shared platform; every state change writes here).
- **workflow_instances** / **workflow_tasks** — shared maker-checker / multi-step approval engine.

Each module BRD must still present **full field tables + 2-3 sample rows** for every entity it
introduces, and reference (not redefine) the shared ones.

---

## 3. Global Conventions (apply to every module)

- **IDs:** UUIDv4 primary keys; human-facing business keys (e.g., `service_no`, case numbers) are
  separate unique columns.
- **Audit fields:** every table carries `created_at`, `updated_at` (UTC, ISO-8601), `created_by`,
  `updated_by`, and `is_deleted` (soft delete) unless it is an append-only ledger.
- **Statuses:** UPPER_SNAKE_CASE enums, cataloged in each BRD's Enum & Reference Catalog.
- **Time/locale:** store UTC; display in user locale/timezone; currency = INR default with i18n money
  formatting; dates display `DD-MMM-YYYY`.
- **Pagination:** cursor or page/limit with a hard max page size of 100; all list endpoints paginated.
- **Maker-checker:** any change to statutory/sensitive data routes through the shared workflow engine.

---

## 4. Shared Roles (RBAC baseline — extend per module, do not contradict)

- **Employee (Self-Service)** — view own record, raise requests, apply for leave, view payslips.
- **Reporting Manager** — approve/recommend for direct reports.
- **HR Officer / HR Admin** — operate module transactions on behalf of the org.
- **Department Head / Appointing Authority** — sanction transfers, promotions, penalties.
- **Disciplinary Authority / Inquiry Officer** — M09-specific roles.
- **Payroll Officer** — M10/M11 financial operations.
- **SR Custodian / Registrar** — M12 statutory custodian.
- **Auditor (read-only)** — cross-module read + audit log access, no write.
- **System Administrator** — configuration, master data, RBAC (no transactional self-approval).

Enforce **segregation of duties** (no self-approval; maker ≠ checker) everywhere.

---

## 5. Shared Technical Defaults (Section 4 of each BRD inherits these)

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) frontend; REST API (Node/TypeScript or
  Java Spring acceptable) with `/api/v1` versioning; PostgreSQL primary datastore; object storage for
  documents (encrypted at rest); deployed at CGG Data Centre (on-prem/government cloud).
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level scoping by org_unit.
- **API error envelope (canonical):**
  `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." }, "requestId": "..." }`
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404),
  CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module-specific.
- **Security/compliance:** OWASP ASVS, encryption in transit (TLS 1.2+) and at rest, full audit trail,
  PII minimisation & data-privacy (India DPDP Act 2023 alignment), retention per statutory schedule.
- **NFR baseline:** P95 API < 500ms; 99.9% uptime; WCAG 2.1 AA; horizontal scalability; RPO ≤ 15min,
  RTO ≤ 4h.

---

## 6. Authoring Standard for every Module BRD

Follow the full `brd-generator` 16-section structure (Executive Summary; Scope & Boundaries incl.
Feature Module Map & Common Capabilities; Roles & Permissions matrix; Shared Application Foundation;
Holistic Data Model with entity inventory, relationship map, ownership/reuse matrix, enum catalog, data
integrity rules, and **mandatory sample data**; Functional Requirements **each with full Low-Level
Design table**; UI Requirements; API & Integration incl. error catalog + JSON examples; NFRs; Workflow
& State diagrams; Notifications; Reporting & Analytics; Migration & Launch; Traceability/Dependency/
Parallel-Agent Plan with Final Reconciliation Table showing **0 unresolved gaps**; Glossary;
Appendices).

**Persona:** Author as an experienced global HR/HCM domain expert designing for leading global
organisations — anticipate features world-class enterprises expect (self-service, mobile, analytics,
compliance, audit, integrations) layered on the public-sector statutory requirements.

**Output:** Markdown file at the assigned path. No mockups — describe layouts precisely. Be specific;
no vague "handle appropriately" language. Every FR numbered for traceability.
