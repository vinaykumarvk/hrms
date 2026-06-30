# Employee Profile Management — HRMS Module BRD

**Module code:** `M01-EPM`
**Module name:** Employee Profile Management — the Canonical Employee Master
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector, CGG Data Centre
**Document version:** v1.0
**Status:** Issued for build (parallel-agent ready)
**Authoring standard:** World-class HCM (Workday / SAP SuccessFactors / Oracle HCM class) layered on a public-sector statutory context
**Upstream contract:** `docs/brd/SHARED_FOUNDATION.md` (single source of truth — reused, not redefined)

---

## 1. Executive Summary

### 1.1 Purpose

Module 01 — Employee Profile Management (M01-EPM) — is the **canonical employee master** and the
**golden source of truth** for every person-, identity-, job-, and organisational-placement attribute
in the HRMS. All 13 other modules (M02–M14) **read** employee data from M01; none keep a competing
copy. When a payroll run needs a bank account, when the Digital Service Register (M12) needs a service
number, when the disciplinary module (M09) needs a reporting line, or when analytics (M14) needs
headcount by cadre — the authoritative answer comes from M01.

M01 owns the **full lifecycle of the employee profile**: created on hire, maintained through service,
effective-dated for every job/organisational change, deactivated on separation, and retained per the
statutory schedule. It provides a **360° profile view**, **org-chart placement** with formal
**position management**, **configurable profile sections** and **custom fields**, **effective-dated
attributes** with point-in-time ("time-travel") views, **field-level PII access control** aligned to
the **India DPDP Act 2023** (and GDPR-equivalent principles), **profile-completeness scoring**, **data
quality validation**, **deduplication**, an **employee self-service read view**, and **bulk import**
for data migration.

> **Scope boundary with M02:** M01 owns the *data and the read/maintain surfaces*. **Edits to
> employee-initiated personal details are governed by Module 02 (M02-EPDM) via maker-checker
> workflow.** M01 *references* that workflow (it exposes the fields, the validation, and the
> commit-on-approval write path); it does **not** duplicate the approval engine. Direct HR/Admin
> corrections that are not employee-initiated follow M01's own authorisation and audit rules described
> here.

### 1.2 Business Context & Problem Statement

Public-sector HR data today is fragmented across paper service books, spreadsheets, and siloed
departmental systems. The same employee appears with inconsistent spellings, duplicate records, stale
designations, and missing statutory IDs. There is no single, access-controlled, effective-dated record
of "who this person is, what post they hold today, and what they held on any past date." This blocks
accurate payroll, lawful pension calculation, defensible disciplinary process, and trustworthy
analytics. M01 eliminates this by establishing **one authoritative, versioned, auditable employee
record** consumed by the whole suite.

### 1.3 Goals & Success Metrics

| # | Goal | Success metric (target) |
|---|---|---|
| G1 | Single source of truth | 100% of M02–M14 reads resolve via M01 consumption API; **0** competing master copies |
| G2 | Data completeness | ≥ 98% of ACTIVE employees at profile-completeness score ≥ 90% within 90 days of go-live |
| G3 | Data quality | < 0.1% duplicate person rate; 100% of statutory IDs format-validated |
| G4 | Privacy compliance | 100% of PII fields governed by a field-access policy; 0 unauthorised PII reads in audit sampling |
| G5 | Effective-dated integrity | 100% of job/org changes stored as effective-dated rows with no overlapping active assignments |
| G6 | Performance | P95 profile read < 500 ms; 360° view assembled < 800 ms P95 |
| G7 | Migration | ≥ 99.5% of legacy records imported with validation pass on first or second pass |

### 1.4 In-Scope Capabilities (headline)

Create-on-hire; 360° view; multiple addresses & contacts; dependents/family/nominees; emergency
contacts; education/qualifications/prior experience; identity & statutory documents; bank/financial;
photo & biometric reference; position management & org-chart; effective-dated attributes & point-in-time
view; configurable sections & custom fields; field-level PII access control; completeness scoring &
data-quality validation; deduplication; self-service read view; bulk import; lifecycle
deactivation/reactivation; and the master-data consumption API.

### 1.5 Out-of-Scope (delegated to other modules)

- Approval workflow for employee-initiated edits → **M02-EPDM**.
- Leave/attendance balances and applications → **M03/M04**.
- Transfers, relieving, joining mechanics → **M05** (M01 *records* the resulting placement).
- Promotions/seniority computation → **M06** (M01 *records* the resulting designation/position).
- Payroll computation, payslips → **M10**; pension → **M11**.
- Statutory service-event ledger semantics → **M12** (M01 *emits* events to M12).
- Binary document storage/encryption/versioning → **M13** (M01 stores only `document_id` references).
- Cross-module dashboards → **M14**.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Owned by M01? | Notes / hand-off |
|---|---|---|
| Person & demographic master | **Yes** | `employees` (extends canonical) |
| Contact & multiple addresses | **Yes** | `employee_contacts`, `employee_addresses` |
| Dependents, family, nominees | **Yes** | `employee_dependents`, `employee_nominees` |
| Emergency contacts | **Yes** | `employee_emergency_contacts` |
| Education, qualifications, prior experience | **Yes** | `employee_education`, `employee_experience` |
| Identity & statutory documents | **Yes** | `employee_identity_documents` (refs M13 for scans) |
| Bank & financial | **Yes** | `employee_bank_accounts` (consumed by M10/M11) |
| Photo & biometric reference | **Yes** | `employee_photos` (binary in M13) |
| Position management & org placement | **Yes** | `positions`, `employee_job_assignments` |
| Effective-dated attributes & point-in-time | **Yes** | versioned assignment + attribute history |
| Configurable sections & custom fields | **Yes** | `profile_sections`, `custom_field_definitions`, `employee_custom_field_values` |
| Field-level PII access control | **Yes** | `field_access_policies` |
| Completeness scoring & data quality | **Yes** | `employee_profile_completeness` |
| Deduplication | **Yes** | `dedup_candidates` |
| Self-service read view | **Yes** | read projection of the above |
| Bulk import / migration | **Yes** | `employee_import_batches`, `import_staging_rows` |
| Lifecycle deactivation/reactivation | **Yes** | `employees.employment_status` transitions |
| Master consumption API (SSOT) | **Yes** | `/api/v1/employees/...` read contract |
| Edit-request approval workflow | No → **M02** | M01 exposes fields + commit path only |
| Document binary storage | No → **M13** | M01 holds `document_id` references |
| Service-event ledger | No → **M12** | M01 writes events via shared producer |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied module-wide)

- **RBAC + row-level org scoping:** every read/write is authorised by role and bounded to the caller's
  `org_unit` subtree unless a wider scope is explicitly granted.
- **Audit-everything:** every create/update/delete/state-change/PII-read writes to `audit_log`.
- **Soft delete:** `is_deleted` on all mutable tables; physical deletion only via DB-change approval.
- **Effective dating:** job/org/attribute changes are *versioned*, never overwritten.
- **Pagination:** all list endpoints paginated, hard max page size = 100.
- **Canonical error envelope** and **UTC storage / locale display** per Shared Foundation §3, §5.
- **i18n / WCAG 2.1 AA** on every screen; dates display `DD-MMM-YYYY`; currency INR default.

### 2.3 Boundary Diagram (textual)

```
                    +---------------------------+
   Hire feed  --->  |        M01-EPM            |  ---> M12-SR (service events: create/deactivate)
   (M05 joining)    |  Employee Master (SSOT)   |  ---> M10-PAY / M11-PEN (bank, pay-relevant attrs)
                    |                           |  ---> M03/M04 (identity, org, manager)
   M02 edit-commit  |  - profile data           |  ---> M06 (designation/position placement)
   (approved) --->  |  - effective-dated jobs    |  ---> M09 (reporting line, identity)
                    |  - positions/org           |  ---> M14 (analytics reads)
   Bulk import ---> |  - PII access policy       |  <--- M13 (document_id for scans/photos)
   (migration)      +---------------------------+
```

---

## 3. User Roles & Permissions

Roles extend the Shared Foundation §4 baseline. **C**=Create, **R**=Read, **U**=Update, **D**=Soft-
delete/deactivate, **A**=Approve/Commit, **X**=Export, **—**=No access. PII-restricted fields obey the
**field-level access policy** (FR-EPM-012) on top of this matrix (a role may have row access yet still
be masked on specific fields).

| Capability / Surface | Employee (Self) | Reporting Manager | HR Officer | HR Admin | Dept Head / Appointing Auth. | SR Custodian | Auditor (RO) | System Admin |
|---|---|---|---|---|---|---|---|---|
| Create profile on hire | — | — | C | C | A (sanction) | — | — | — |
| View own 360° profile | R | — | R | R | R | R | R | R |
| View direct-reports profile | — | R (scoped, masked PII) | R | R | R | R | R | — |
| View any profile (org scope) | — | — | R | R | R | R | R | R(config only) |
| Maintain contact/address | request→M02 | — | U | U | — | — | — | — |
| Maintain dependents/nominees | request→M02 | — | U | U | — | — | — | — |
| Maintain education/experience | request→M02 | — | U | U | — | — | — | — |
| Maintain identity/statutory IDs | request→M02 | — | U (masked) | U | — | — | R(masked) | — |
| Maintain bank/financial | request→M02 | — | U (4-eyes) | U (4-eyes) | A | — | R(masked) | — |
| Upload/replace photo | request→M02 | — | U | U | — | — | — | — |
| Manage positions & org placement | — | recommend | U | U | A | — | R | — |
| Configure sections/custom fields | — | — | — | proposed→Admin | — | — | R | C/U/D |
| Configure field-access policy | — | — | — | — | — | — | R | C/U/D |
| Run/resolve deduplication | — | — | C/U | C/U/A | — | — | R | — |
| Bulk import / migration | — | — | C (staging) | C/A (commit) | — | — | R | C/A |
| Deactivate on separation | — | — | C (request) | A | A | A (SR effect) | R | — |
| Reactivate profile | — | — | C (request) | A | A | — | R | — |
| Consume master via API | — (own only) | scoped | scoped | full(scoped) | scoped | scoped | RO | — |
| View audit log (M01) | own actions | — | scoped | scoped | scoped | scoped | full RO | full RO |
| Export profile data | own (self) | — | X (scoped, logged) | X (logged) | X (scoped) | X | X (logged) | — |

**Segregation of duties:** maker ≠ checker on every approved action; **bank/financial changes require
4-eyes** (a second HR Admin / Dept Head approval) even outside M02; System Admin configures but cannot
self-approve transactional data.

---

## 4. Shared Application Foundation & Cross-Agent Build Instructions

This module **inherits** the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`) wholesale. The
following is the M01-specific binding of those shared defaults.

### 4.1 Technical stack (inherited)

- **Frontend:** React + TypeScript, Tailwind + shadcn/ui, WCAG 2.1 AA, i18n, dark-mode capable.
- **Backend:** REST API at `/api/v1`, Node/TypeScript **or** Java Spring; PostgreSQL primary store;
  object storage (M13) for binaries (photos/scans), encrypted at rest.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; **RBAC + row-level org-unit scoping**.
- **Error envelope (canonical):**
  `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." }, "requestId": "..." }`
- **Security/compliance:** OWASP ASVS; TLS 1.2+; full audit trail; PII minimisation; **DPDP Act 2023**
  alignment; statutory retention.
- **NFR baseline:** P95 < 500 ms; 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4 h.

### 4.2 Canonical entities reused (NOT redefined here)

`users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `permissions`,
`service_register_events` (M12), `documents` (M13), `notifications`, `audit_log`,
`workflow_instances` / `workflow_tasks` (M02 / shared engine). M01 **extends** the canonical
`employees` row with additional master columns and **owns** all `employee_*` satellite tables.

### 4.3 Cross-agent build instructions

1. **M01 is foundational** — build before M02–M14 transactional logic; expose the consumption API
   (FR-EPM-018) first so dependent agents can integrate against a stable contract.
2. **Do not write a second employee master.** Any module needing person/job data calls the M01 API or
   reads the M01-owned tables under M01's access policy. No local caching of PII beyond TTL-bounded,
   non-persistent caches.
3. **Edit approvals route to M02.** When a self-service user requests a personal-detail change, M01
   surfaces the field set + validators; M02 runs maker-checker; on approval M02 calls M01's
   **commit endpoint** (`PATCH /employees/{id}:commit`) which performs the effective-dated write +
   audit + SR event emission. M01 never invents an approval flow.
4. **Documents/photos** are stored in M13; M01 persists only `document_id`. Producers must obtain a
   `document_id` from M13 before saving a reference.
5. **Service events** (profile creation, separation, key job changes) are emitted to M12 through the
   shared `service_register_events` producer; M01 never writes the M12 ledger schema directly beyond
   the sanctioned producer interface.
6. **Field-access policy is enforced server-side** (FR-EPM-012). Frontends must not rely on client-side
   masking alone; the API returns already-masked projections per caller.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

**M01-owned entities (18):**

| # | Entity | Purpose | Cardinality vs employee |
|---|---|---|---|
| E1 | `employees` (extended) | Core master / golden record | 1 (the anchor) |
| E2 | `employee_contacts` | Phones, emails, online handles | 1:N |
| E3 | `employee_addresses` | Permanent / present / mailing / overseas | 1:N |
| E4 | `employee_dependents` | Family members & dependents | 1:N |
| E5 | `employee_nominees` | Nominees for benefits/pension/gratuity | 1:N |
| E6 | `employee_emergency_contacts` | Whom to call in emergencies | 1:N |
| E7 | `employee_education` | Academic & professional qualifications | 1:N |
| E8 | `employee_experience` | Prior employment / service history | 1:N |
| E9 | `employee_identity_documents` | Statutory & identity IDs (PAN/Aadhaar/passport) | 1:N |
| E10 | `employee_bank_accounts` | Bank & financial details | 1:N |
| E11 | `employee_photos` | Photo & biometric reference metadata | 1:N (1 primary) |
| E12 | `positions` | Authorised posts/sanctioned positions (org design) | reference |
| E13 | `employee_job_assignments` | Effective-dated job/position/org placement | 1:N (1 current) |
| E14 | `profile_sections` | Configurable profile section catalog | config |
| E15 | `custom_field_definitions` | Tenant-configurable custom fields | config |
| E16 | `employee_custom_field_values` | Values for custom fields | 1:N |
| E17 | `field_access_policies` | Field-level PII access rules | config |
| E18 | `employee_profile_completeness` | Completeness/quality score snapshot | 1:1 |
| E19 | `dedup_candidates` | Potential duplicate person matches | review queue |
| E20 | `employee_import_batches` + `import_staging_rows` | Bulk import control & staging | batch |

> Inventory lists 20 physical tables across 18 conceptual entity groups (E20 is a batch+staging pair).
> For traceability the build treats **20 tables** owned by M01.

**Referenced (owned elsewhere):** `users`, `org_units`, `designations`, `cadres`, `pay_scales`,
`roles`, `audit_log`, `documents`, `notifications`, `service_register_events`,
`workflow_instances`/`workflow_tasks`.

### 5.2 Ownership & Reuse Matrix

| Entity | Owner module | M01 action | Consumers |
|---|---|---|---|
| `employees` | **M01** | extend + own | M02–M14 (read), M02 (commit writes) |
| `employee_*` satellites (E2–E11, E13, E16, E18) | **M01** | own | M10/M11 (bank), M12 (events), M14 (read) |
| `positions` (E12) | **M01** | own (with M06 input) | M05/M06, M14 |
| `profile_sections`/`custom_field_definitions`/`field_access_policies` (E14,E15,E17) | **M01** | own (config) | all UIs |
| `dedup_candidates`, import tables (E19,E20) | **M01** | own | migration tooling, M14 |
| `users` | Platform | reference | all |
| `org_units`, `designations`, `cadres`, `pay_scales` | Master data | reference | all |
| `documents` | **M13** | reference (`document_id`) | all |
| `service_register_events` | **M12** | write via producer | M12, M14 |
| `audit_log`, `notifications`, `workflow_*` | Platform / M02 | write/reference | all |

### 5.3 Relationship Map (textual ERD)

```
org_units 1───∞ employees ∞───1 designations
   │                │ │ │
   │                │ │ └────1:N employee_job_assignments ∞───1 positions ∞───1 org_units
   │                │ │                                   ∞───1 designations
employees 1───1 users (login principal)                  ∞───1 cadres / pay_scales
employees 1───∞ employee_contacts
employees 1───∞ employee_addresses
employees 1───∞ employee_dependents 1───∞ employee_nominees (nominee may = dependent)
employees 1───∞ employee_emergency_contacts
employees 1───∞ employee_education
employees 1───∞ employee_experience
employees 1───∞ employee_identity_documents ─── document_id ──▶ documents (M13)
employees 1───∞ employee_bank_accounts
employees 1───∞ employee_photos ─── document_id ──▶ documents (M13)
employees 1───∞ employee_custom_field_values ∞───1 custom_field_definitions ∞───1 profile_sections
employees 1───1 employee_profile_completeness
employees ∞───∞ dedup_candidates (employee_a, employee_b)
employee_import_batches 1───∞ import_staging_rows ──(on commit)──▶ employees + satellites
field_access_policies (field_path) ── governs ──▶ any employee_* column
employees ──(self ref)──▶ reporting_manager_id ──▶ employees
employees ──(events)──▶ service_register_events (M12)
every table ──(writes)──▶ audit_log
```

### 5.4 Full Field Tables

Conventions: every mutable table also carries `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`,
`created_by UUID`, `updated_by UUID`, `is_deleted BOOLEAN DEFAULT false` (omitted from rows below for
brevity unless semantically relevant). PKs are `UUID` unless noted.

#### E1 — `employees` (extends canonical; M01-owned columns)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `employee_id` | UUID | **PK** | canonical |
| `service_no` | VARCHAR(20) | UNIQUE, NOT NULL | human business key |
| `salutation` | VARCHAR(10) | enum (`SALUTATION`) | Mr/Ms/Dr/… |
| `first_name` | VARCHAR(80) | NOT NULL | |
| `middle_name` | VARCHAR(80) | NULL | |
| `last_name` | VARCHAR(80) | NOT NULL | |
| `preferred_name` | VARCHAR(80) | NULL | display name |
| `name_local` | VARCHAR(160) | NULL | name in official local script |
| `dob` | DATE | NOT NULL, ≤ today−18y | PII |
| `gender` | VARCHAR(16) | enum (`GENDER`) | PII |
| `marital_status` | VARCHAR(16) | enum (`MARITAL_STATUS`) | PII |
| `blood_group` | VARCHAR(4) | enum (`BLOOD_GROUP`) | sensitive PII |
| `nationality` | VARCHAR(40) | NOT NULL, default `INDIAN` | |
| `religion` | VARCHAR(40) | NULL | sensitive PII (DPDP) |
| `category` | VARCHAR(16) | enum (`SOCIAL_CATEGORY`) | GEN/OBC/SC/ST/EWS (statutory) |
| `is_differently_abled` | BOOLEAN | default false | statutory (PwD) |
| `disability_type` | VARCHAR(40) | NULL | conditional on above |
| `national_id` | VARCHAR(20) | masked | Aadhaar ref (tokenised) |
| `pan` | VARCHAR(10) | format `[A-Z]{5}[0-9]{4}[A-Z]` | PII |
| `date_of_joining` | DATE | NOT NULL | |
| `confirmation_date` | DATE | NULL | end of probation |
| `cadre` | VARCHAR(40) | FK→`cadres` | |
| `designation_id` | UUID | FK→`designations` | current (denormalised from current assignment) |
| `org_unit_id` | UUID | FK→`org_units` | current placement (denormalised) |
| `employment_type` | VARCHAR(20) | enum (`EMPLOYMENT_TYPE`) | PERMANENT/CONTRACT/DEPUTATION… |
| `employment_status` | VARCHAR(20) | enum (`EMPLOYMENT_STATUS`) | ACTIVE/ON_LEAVE/SUSPENDED/TRANSFERRED/RETIRED/RESIGNED/DECEASED/TERMINATED |
| `reporting_manager_id` | UUID | FK→`employees` (self) | row-level scoping anchor |
| `primary_photo_id` | UUID | FK→`employee_photos` | current photo |
| `profile_completeness_pct` | NUMERIC(5,2) | 0–100, cached | from E18 |
| `data_quality_flag` | VARCHAR(16) | enum (`DQ_FLAG`) | CLEAN/REVIEW/BLOCKED |
| `separation_date` | DATE | NULL | set on separation |
| `separation_reason` | VARCHAR(40) | enum (`SEPARATION_REASON`) | |
| `source_system` | VARCHAR(40) | NULL | for migrated records |
| `legacy_id` | VARCHAR(40) | NULL, indexed | migration cross-ref |
| `created_at/updated_at/created_by/updated_by/is_deleted` | — | standard | |

#### E2 — `employee_contacts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `contact_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `contact_type` | VARCHAR(20) | enum (`CONTACT_TYPE`) | MOBILE/ALT_MOBILE/PERSONAL_EMAIL/OFFICIAL_EMAIL/LANDLINE |
| `contact_value` | VARCHAR(120) | NOT NULL | validated per type |
| `country_code` | VARCHAR(5) | default `+91` | phone only |
| `is_primary` | BOOLEAN | default false | one primary per type |
| `is_verified` | BOOLEAN | default false | OTP/email verification |
| `verified_at` | TIMESTAMPTZ | NULL | |
| `visibility` | VARCHAR(16) | enum (`FIELD_VISIBILITY`) | drives directory exposure |

#### E3 — `employee_addresses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `address_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `address_type` | VARCHAR(20) | enum (`ADDRESS_TYPE`) | PERMANENT/PRESENT/MAILING/OVERSEAS |
| `line1` | VARCHAR(160) | NOT NULL | |
| `line2` | VARCHAR(160) | NULL | |
| `landmark` | VARCHAR(120) | NULL | |
| `city` | VARCHAR(80) | NOT NULL | |
| `district` | VARCHAR(80) | NULL | |
| `state` | VARCHAR(80) | NOT NULL | |
| `country` | VARCHAR(80) | NOT NULL, default `India` | |
| `pincode` | VARCHAR(12) | NOT NULL, regex per country | |
| `is_current` | BOOLEAN | default true | |
| `same_as_permanent` | BOOLEAN | default false | copy flag |
| `valid_from` | DATE | NOT NULL | effective dating |
| `valid_to` | DATE | NULL | open-ended if current |

#### E4 — `employee_dependents`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `dependent_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `full_name` | VARCHAR(160) | NOT NULL | |
| `relationship` | VARCHAR(24) | enum (`RELATIONSHIP`) | SPOUSE/SON/DAUGHTER/FATHER/MOTHER… |
| `dob` | DATE | NULL | |
| `gender` | VARCHAR(16) | enum (`GENDER`) | |
| `is_dependent` | BOOLEAN | default true | financial dependency flag |
| `is_minor` | BOOLEAN | computed | derived from dob |
| `is_differently_abled` | BOOLEAN | default false | |
| `national_id` | VARCHAR(20) | masked, NULL | |
| `proof_document_id` | UUID | FK→documents(M13), NULL | birth/marriage cert |

#### E5 — `employee_nominees`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `nominee_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `dependent_id` | UUID | FK→dependents, NULL | nominee may be a dependent |
| `nominee_name` | VARCHAR(160) | NOT NULL | |
| `relationship` | VARCHAR(24) | enum (`RELATIONSHIP`) | |
| `benefit_type` | VARCHAR(24) | enum (`BENEFIT_TYPE`) | PF/GRATUITY/PENSION/INSURANCE/NPS |
| `share_pct` | NUMERIC(5,2) | 0–100 | sum per benefit_type = 100 |
| `is_minor` | BOOLEAN | computed | requires guardian if true |
| `guardian_name` | VARCHAR(160) | conditional | required if minor |
| `effective_date` | DATE | NOT NULL | |
| `proof_document_id` | UUID | FK→documents(M13), NULL | nomination form |

#### E6 — `employee_emergency_contacts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `emergency_contact_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `contact_name` | VARCHAR(160) | NOT NULL | |
| `relationship` | VARCHAR(24) | enum (`RELATIONSHIP`) | |
| `phone_primary` | VARCHAR(20) | NOT NULL | |
| `phone_alternate` | VARCHAR(20) | NULL | |
| `address` | VARCHAR(320) | NULL | |
| `priority` | SMALLINT | 1..n | call order |

#### E7 — `employee_education`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `education_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `qualification_level` | VARCHAR(24) | enum (`QUALIFICATION_LEVEL`) | SECONDARY/DIPLOMA/UG/PG/DOCTORATE/CERT |
| `degree_name` | VARCHAR(120) | NOT NULL | |
| `specialization` | VARCHAR(120) | NULL | |
| `institution` | VARCHAR(200) | NOT NULL | |
| `board_university` | VARCHAR(200) | NULL | |
| `year_of_passing` | SMALLINT | 1950..current | |
| `grade_or_percentage` | VARCHAR(20) | NULL | |
| `is_highest` | BOOLEAN | default false | one highest |
| `is_verified` | BOOLEAN | default false | credential verification |
| `certificate_document_id` | UUID | FK→documents(M13), NULL | |

#### E8 — `employee_experience`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `experience_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `employer_name` | VARCHAR(200) | NOT NULL | |
| `designation` | VARCHAR(120) | NOT NULL | |
| `employment_type` | VARCHAR(20) | enum (`EMPLOYMENT_TYPE`) | |
| `from_date` | DATE | NOT NULL | |
| `to_date` | DATE | NULL | null = current external |
| `is_government_service` | BOOLEAN | default false | counts toward pensionable service |
| `reason_for_leaving` | VARCHAR(200) | NULL | |
| `last_drawn_pay` | NUMERIC(12,2) | NULL | PII |
| `proof_document_id` | UUID | FK→documents(M13), NULL | relieving/experience letter |

#### E9 — `employee_identity_documents`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `identity_doc_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `doc_type` | VARCHAR(24) | enum (`IDENTITY_DOC_TYPE`) | AADHAAR/PAN/PASSPORT/VOTER_ID/DRIVING_LICENSE/PRAN |
| `doc_number_masked` | VARCHAR(40) | NOT NULL | display masked (e.g. `XXXX-XXXX-1234`) |
| `doc_number_token` | VARCHAR(128) | NOT NULL, encrypted/tokenised | actual value never returned raw |
| `issuing_authority` | VARCHAR(120) | NULL | |
| `issue_date` | DATE | NULL | |
| `expiry_date` | DATE | NULL | drives expiry alerts |
| `is_verified` | BOOLEAN | default false | e-KYC/manual |
| `verification_source` | VARCHAR(40) | NULL | |
| `scan_document_id` | UUID | FK→documents(M13), NULL | |

#### E10 — `employee_bank_accounts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `bank_account_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `account_holder_name` | VARCHAR(160) | NOT NULL | must match name (fuzzy check) |
| `bank_name` | VARCHAR(120) | NOT NULL | |
| `branch_name` | VARCHAR(120) | NULL | |
| `ifsc_code` | VARCHAR(11) | regex `[A-Z]{4}0[A-Z0-9]{6}` | |
| `account_number_masked` | VARCHAR(34) | NOT NULL | last 4 visible |
| `account_number_token` | VARCHAR(128) | encrypted | never returned raw |
| `account_type` | VARCHAR(16) | enum (`BANK_ACCOUNT_TYPE`) | SAVINGS/CURRENT/SALARY |
| `is_primary_salary` | BOOLEAN | default false | exactly one active primary |
| `is_verified` | BOOLEAN | default false | penny-drop/manual |
| `effective_from` | DATE | NOT NULL | |
| `cancelled_cheque_document_id` | UUID | FK→documents(M13), NULL | |

#### E11 — `employee_photos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `photo_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `photo_type` | VARCHAR(16) | enum (`PHOTO_TYPE`) | PROFILE/ID_CARD/BIOMETRIC_REF |
| `document_id` | UUID | FK→documents(M13), NOT NULL | binary lives in M13 |
| `biometric_template_ref` | VARCHAR(128) | NULL | opaque ref to biometric vault (no raw template) |
| `is_primary` | BOOLEAN | default false | one primary PROFILE |
| `captured_at` | TIMESTAMPTZ | NULL | |
| `width_px`/`height_px` | INT | NULL | for validation |
| `status` | VARCHAR(16) | enum (`PHOTO_STATUS`) | PENDING/APPROVED/REJECTED |

#### E12 — `positions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `position_id` | UUID | PK | |
| `position_code` | VARCHAR(30) | UNIQUE | sanctioned post code |
| `title` | VARCHAR(120) | NOT NULL | |
| `designation_id` | UUID | FK→designations | |
| `cadre` | VARCHAR(40) | FK→cadres | |
| `pay_scale_id` | UUID | FK→pay_scales | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | post belongs to office |
| `reports_to_position_id` | UUID | FK→positions (self), NULL | org-chart edge |
| `sanctioned_count` | INT | ≥ 0 | authorised strength |
| `is_vacant` | BOOLEAN | computed | sanctioned − filled |
| `status` | VARCHAR(16) | enum (`POSITION_STATUS`) | ACTIVE/FROZEN/ABOLISHED |

#### E13 — `employee_job_assignments` (effective-dated)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `assignment_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `position_id` | UUID | FK→positions, NULL | null for unposted |
| `designation_id` | UUID | FK→designations, NOT NULL | |
| `cadre` | VARCHAR(40) | FK→cadres | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `pay_scale_id` | UUID | FK→pay_scales, NULL | |
| `reporting_manager_id` | UUID | FK→employees, NULL | |
| `assignment_type` | VARCHAR(20) | enum (`ASSIGNMENT_TYPE`) | SUBSTANTIVE/OFFICIATING/ADDITIONAL_CHARGE/DEPUTATION |
| `effective_from` | DATE | NOT NULL | |
| `effective_to` | DATE | NULL | null = current |
| `change_reason` | VARCHAR(40) | enum (`ASSIGNMENT_REASON`) | HIRE/PROMOTION/TRANSFER/REVERSION/CORRECTION |
| `source_module` | VARCHAR(10) | NULL | M05/M06 origin |
| `source_ref_id` | UUID | NULL | order id in source module |

#### E14 — `profile_sections`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `section_id` | UUID | PK | |
| `section_key` | VARCHAR(40) | UNIQUE | e.g. `PERSONAL`, `BANK` |
| `label` | VARCHAR(120) | NOT NULL | i18n key |
| `display_order` | SMALLINT | NOT NULL | |
| `is_system` | BOOLEAN | default false | system sections not deletable |
| `is_enabled` | BOOLEAN | default true | |
| `applicable_employment_types` | TEXT[] | NULL | conditional sections |

#### E15 — `custom_field_definitions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `field_def_id` | UUID | PK | |
| `section_id` | UUID | FK→profile_sections | |
| `field_key` | VARCHAR(60) | UNIQUE within section | |
| `label` | VARCHAR(120) | NOT NULL | |
| `data_type` | VARCHAR(16) | enum (`CUSTOM_FIELD_TYPE`) | TEXT/NUMBER/DATE/BOOLEAN/ENUM/DOCUMENT |
| `enum_options` | TEXT[] | conditional | for ENUM |
| `is_required` | BOOLEAN | default false | |
| `is_pii` | BOOLEAN | default false | governs access policy |
| `validation_regex` | VARCHAR(200) | NULL | |
| `display_order` | SMALLINT | NOT NULL | |
| `is_active` | BOOLEAN | default true | |

#### E16 — `employee_custom_field_values`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `value_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `field_def_id` | UUID | FK→custom_field_definitions, NOT NULL | |
| `value_text` | TEXT | NULL | typed value serialised |
| `value_number` | NUMERIC | NULL | |
| `value_date` | DATE | NULL | |
| `value_bool` | BOOLEAN | NULL | |
| `value_document_id` | UUID | FK→documents(M13), NULL | |
| | | UNIQUE(employee_id, field_def_id) | one value per field |

#### E17 — `field_access_policies`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `policy_id` | UUID | PK | |
| `field_path` | VARCHAR(120) | NOT NULL | e.g. `employees.pan`, `employee_bank_accounts.account_number` |
| `role_key` | VARCHAR(40) | NOT NULL | role this rule applies to |
| `access_level` | VARCHAR(16) | enum (`FIELD_ACCESS_LEVEL`) | FULL/MASKED/HIDDEN |
| `requires_reason` | BOOLEAN | default false | break-glass reason required to read |
| `is_self_visible` | BOOLEAN | default true | can the data subject see own value |
| | | UNIQUE(field_path, role_key) | one rule per field/role |

#### E18 — `employee_profile_completeness`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `employee_id` | UUID | **PK**, FK→employees | 1:1 |
| `overall_pct` | NUMERIC(5,2) | 0–100 | |
| `section_scores` | JSONB | NOT NULL | `{ "PERSONAL": 100, "BANK": 50, ... }` |
| `missing_required_fields` | TEXT[] | NULL | drives nudges |
| `dq_issues` | JSONB | NULL | rule-id → message |
| `data_quality_flag` | VARCHAR(16) | enum (`DQ_FLAG`) | CLEAN/REVIEW/BLOCKED |
| `last_computed_at` | TIMESTAMPTZ | NOT NULL | |

#### E19 — `dedup_candidates`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `candidate_id` | UUID | PK | |
| `employee_a_id` | UUID | FK→employees | |
| `employee_b_id` | UUID | FK→employees | a≠b |
| `match_score` | NUMERIC(5,2) | 0–100 | weighted similarity |
| `matched_attributes` | JSONB | NOT NULL | which fields matched |
| `status` | VARCHAR(16) | enum (`DEDUP_STATUS`) | OPEN/MERGED/DISMISSED |
| `resolution` | VARCHAR(24) | NULL | MERGE_KEEP_A/MERGE_KEEP_B/NOT_DUP |
| `resolved_by` | UUID | NULL | |
| `resolved_at` | TIMESTAMPTZ | NULL | |
| | | UNIQUE(employee_a_id, employee_b_id) | dedupe the dedupe |

#### E20a — `employee_import_batches`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `batch_id` | UUID | PK | |
| `file_document_id` | UUID | FK→documents(M13) | source file |
| `template_version` | VARCHAR(16) | NOT NULL | |
| `total_rows` | INT | ≥ 0 | |
| `valid_rows` | INT | ≥ 0 | |
| `error_rows` | INT | ≥ 0 | |
| `status` | VARCHAR(20) | enum (`IMPORT_STATUS`) | UPLOADED/VALIDATING/VALIDATED/COMMITTING/COMMITTED/FAILED/ROLLED_BACK |
| `committed_at` | TIMESTAMPTZ | NULL | |
| `committed_by` | UUID | NULL | |

#### E20b — `import_staging_rows`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `staging_row_id` | UUID | PK | |
| `batch_id` | UUID | FK→employee_import_batches | |
| `row_number` | INT | NOT NULL | source line |
| `raw_payload` | JSONB | NOT NULL | parsed row |
| `validation_status` | VARCHAR(16) | enum (`ROW_STATUS`) | VALID/ERROR/COMMITTED/SKIPPED |
| `validation_errors` | JSONB | NULL | field → message |
| `resolved_employee_id` | UUID | NULL | set on commit |
| `dedup_match_id` | UUID | NULL | if matched existing |

### 5.5 Enum & Reference Catalog

| Enum | Allowed values |
|---|---|
| `EMPLOYMENT_STATUS` | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| `EMPLOYMENT_TYPE` | PERMANENT, PROBATIONER, CONTRACT, DEPUTATION, AD_HOC, TEMPORARY, CONSULTANT |
| `SALUTATION` | MR, MS, MRS, DR, PROF, SHRI, SMT, KUM |
| `GENDER` | MALE, FEMALE, TRANSGENDER, OTHER, UNDISCLOSED |
| `MARITAL_STATUS` | SINGLE, MARRIED, WIDOWED, DIVORCED, SEPARATED |
| `BLOOD_GROUP` | A+, A-, B+, B-, O+, O-, AB+, AB-, UNKNOWN |
| `SOCIAL_CATEGORY` | GEN, OBC, SC, ST, EWS |
| `CONTACT_TYPE` | MOBILE, ALT_MOBILE, PERSONAL_EMAIL, OFFICIAL_EMAIL, LANDLINE |
| `ADDRESS_TYPE` | PERMANENT, PRESENT, MAILING, OVERSEAS |
| `RELATIONSHIP` | SPOUSE, SON, DAUGHTER, FATHER, MOTHER, BROTHER, SISTER, GUARDIAN, OTHER |
| `BENEFIT_TYPE` | PF, GRATUITY, PENSION, INSURANCE, NPS, LEAVE_ENCASHMENT |
| `QUALIFICATION_LEVEL` | SECONDARY, HIGHER_SECONDARY, DIPLOMA, UG, PG, DOCTORATE, CERTIFICATION |
| `IDENTITY_DOC_TYPE` | AADHAAR, PAN, PASSPORT, VOTER_ID, DRIVING_LICENSE, PRAN, RATION_CARD |
| `BANK_ACCOUNT_TYPE` | SAVINGS, CURRENT, SALARY |
| `PHOTO_TYPE` | PROFILE, ID_CARD, BIOMETRIC_REF |
| `PHOTO_STATUS` | PENDING, APPROVED, REJECTED |
| `POSITION_STATUS` | ACTIVE, FROZEN, ABOLISHED |
| `ASSIGNMENT_TYPE` | SUBSTANTIVE, OFFICIATING, ADDITIONAL_CHARGE, DEPUTATION |
| `ASSIGNMENT_REASON` | HIRE, PROMOTION, TRANSFER, REVERSION, RE_DESIGNATION, CORRECTION |
| `CUSTOM_FIELD_TYPE` | TEXT, NUMBER, DATE, BOOLEAN, ENUM, DOCUMENT |
| `FIELD_ACCESS_LEVEL` | FULL, MASKED, HIDDEN |
| `FIELD_VISIBILITY` | PUBLIC, INTERNAL, RESTRICTED, PRIVATE |
| `DQ_FLAG` | CLEAN, REVIEW, BLOCKED |
| `DEDUP_STATUS` | OPEN, MERGED, DISMISSED |
| `IMPORT_STATUS` | UPLOADED, VALIDATING, VALIDATED, COMMITTING, COMMITTED, FAILED, ROLLED_BACK |
| `ROW_STATUS` | VALID, ERROR, COMMITTED, SKIPPED |
| `SEPARATION_REASON` | RETIREMENT, RESIGNATION, TERMINATION, DEATH, ABSORPTION, CONTRACT_END |

### 5.6 Data Integrity Rules

1. **One current job assignment:** at most one `employee_job_assignments` row per employee with
   `effective_to IS NULL`; no two assignments may have overlapping `[effective_from, effective_to]`
   ranges (enforced by exclusion constraint).
2. **Denormalisation consistency:** `employees.designation_id`, `org_unit_id`, `reporting_manager_id`
   must equal the values of the current assignment; a DB trigger / service keeps them in sync.
3. **Unique business keys:** `service_no` unique across non-deleted rows; `position_code` unique.
4. **Single primary:** at most one `is_primary=true` per `(employee_id, contact_type)`; one
   `is_primary_salary=true` active bank account; one `is_primary=true` PROFILE photo; one
   `is_highest=true` education row.
5. **Nominee shares:** for each `(employee_id, benefit_type)`, sum of active `share_pct` = 100 (±0.00).
6. **Statutory ID secrecy:** `*_token` columns never returned by any read API; only `*_masked`.
7. **Effective dating monotonicity:** `effective_from ≤ effective_to`; address `valid_from ≤ valid_to`.
8. **FK integrity:** all FKs enforced; soft-deleted parents cannot accept new children.
9. **Status gating:** identity/bank writes blocked when `employment_status IN (RETIRED, DECEASED,
   TERMINATED)` except by HR Admin correction with reason.
10. **Photo binary externalised:** `employee_photos.document_id` must resolve to an existing M13 doc.
11. **Dedup symmetry:** `dedup_candidates` stores ordered pair (a<b lexicographically) to avoid mirror
    duplicates.
12. **Audit completeness:** every write and every restricted-PII read inserts an `audit_log` row.
13. **DPDP minimisation:** `religion`, `category`, `disability_type`, biometric refs are SENSITIVE; only
    roles with explicit `FULL` field policy may read them.

### 5.7 Sample Data (2–3 rows per entity)

#### `employees`

| employee_id | service_no | first_name | last_name | dob | gender | pan | date_of_joining | cadre | designation_id | org_unit_id | employment_type | employment_status | reporting_manager_id | profile_completeness_pct | data_quality_flag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11111111-...-0001 | GOV-0001 | Anita | Sharma | 1985-03-12 | FEMALE | ABCPS1234K | 2010-06-01 | CADRE_A | desig-201 | org-10 | PERMANENT | ACTIVE | 11111111-...-0009 | 96.00 | CLEAN |
| 11111111-...-0002 | GOV-0002 | Rajesh | Kumar | 1978-11-25 | MALE | XYZPK9876L | 2003-02-15 | CADRE_B | desig-150 | org-12 | PERMANENT | ON_LEAVE | 11111111-...-0009 | 88.50 | REVIEW |
| 11111111-...-0009 | GOV-0009 | Meera | Iyer | 1972-07-08 | FEMALE | LMNPI4567M | 1996-09-01 | CADRE_A | desig-301 | org-10 | PERMANENT | ACTIVE | NULL | 99.00 | CLEAN |

#### `employee_contacts`

| contact_id | employee_id | contact_type | contact_value | is_primary | is_verified | visibility |
|---|---|---|---|---|---|---|
| c-0001 | 11111111-...-0001 | MOBILE | +91 98xxxxxx21 | true | true | INTERNAL |
| c-0002 | 11111111-...-0001 | OFFICIAL_EMAIL | anita.sharma@gov.in | true | true | PUBLIC |
| c-0003 | 11111111-...-0002 | MOBILE | +91 99xxxxxx34 | true | false | RESTRICTED |

#### `employee_addresses`

| address_id | employee_id | address_type | line1 | city | state | pincode | is_current | valid_from |
|---|---|---|---|---|---|---|---|---|
| a-0001 | 11111111-...-0001 | PERMANENT | 12 MG Road | Hyderabad | Telangana | 500001 | true | 2010-06-01 |
| a-0002 | 11111111-...-0001 | PRESENT | Flat 4B, Sun Apt | Hyderabad | Telangana | 500032 | true | 2019-04-10 |
| a-0003 | 11111111-...-0002 | PERMANENT | 7 Lake View | Vijayawada | Andhra Pradesh | 520010 | true | 2003-02-15 |

#### `employee_dependents`

| dependent_id | employee_id | full_name | relationship | dob | is_dependent | is_minor |
|---|---|---|---|---|---|---|
| d-0001 | 11111111-...-0001 | Vikram Sharma | SPOUSE | 1983-01-20 | false | false |
| d-0002 | 11111111-...-0001 | Aarav Sharma | SON | 2015-08-05 | true | true |
| d-0003 | 11111111-...-0002 | Sunita Kumar | SPOUSE | 1981-05-14 | true | false |

#### `employee_nominees`

| nominee_id | employee_id | nominee_name | relationship | benefit_type | share_pct | is_minor | guardian_name |
|---|---|---|---|---|---|---|---|
| n-0001 | 11111111-...-0001 | Vikram Sharma | SPOUSE | PENSION | 100.00 | false | NULL |
| n-0002 | 11111111-...-0001 | Aarav Sharma | SON | GRATUITY | 50.00 | true | Vikram Sharma |
| n-0003 | 11111111-...-0001 | Vikram Sharma | SPOUSE | GRATUITY | 50.00 | false | NULL |

#### `employee_emergency_contacts`

| emergency_contact_id | employee_id | contact_name | relationship | phone_primary | priority |
|---|---|---|---|---|---|
| ec-0001 | 11111111-...-0001 | Vikram Sharma | SPOUSE | +91 98xxxxxx77 | 1 |
| ec-0002 | 11111111-...-0001 | Meena Sharma | MOTHER | +91 94xxxxxx10 | 2 |
| ec-0003 | 11111111-...-0002 | Sunita Kumar | SPOUSE | +91 99xxxxxx02 | 1 |

#### `employee_education`

| education_id | employee_id | qualification_level | degree_name | institution | year_of_passing | is_highest | is_verified |
|---|---|---|---|---|---|---|---|
| ed-0001 | 11111111-...-0001 | PG | M.A. Economics | Delhi University | 2008 | true | true |
| ed-0002 | 11111111-...-0001 | UG | B.A. Economics | Delhi University | 2006 | false | true |
| ed-0003 | 11111111-...-0002 | UG | B.Tech Civil | JNTU | 2000 | true | false |

#### `employee_experience`

| experience_id | employee_id | employer_name | designation | from_date | to_date | is_government_service |
|---|---|---|---|---|---|---|
| ex-0001 | 11111111-...-0001 | State Planning Board | Research Assoc. | 2008-07-01 | 2010-05-31 | true |
| ex-0002 | 11111111-...-0002 | ABC Infra Pvt Ltd | Site Engineer | 2000-08-01 | 2003-01-31 | false |
| ex-0003 | 11111111-...-0009 | Revenue Dept | Officer | 1994-01-01 | 1996-08-31 | true |

#### `employee_identity_documents`

| identity_doc_id | employee_id | doc_type | doc_number_masked | issuing_authority | expiry_date | is_verified |
|---|---|---|---|---|---|---|
| id-0001 | 11111111-...-0001 | AADHAAR | XXXX-XXXX-4321 | UIDAI | NULL | true |
| id-0002 | 11111111-...-0001 | PASSPORT | XXXXXX78 | Passport Seva | 2029-03-01 | true |
| id-0003 | 11111111-...-0002 | PAN | XXXPK9876L | Income Tax Dept | NULL | true |

#### `employee_bank_accounts`

| bank_account_id | employee_id | bank_name | ifsc_code | account_number_masked | account_type | is_primary_salary | is_verified |
|---|---|---|---|---|---|---|---|
| bk-0001 | 11111111-...-0001 | SBI | SBIN0001234 | XXXXXX4567 | SALARY | true | true |
| bk-0002 | 11111111-...-0002 | HDFC | HDFC0000456 | XXXXXX8899 | SAVINGS | true | false |
| bk-0003 | 11111111-...-0009 | Canara Bank | CNRB0002001 | XXXXXX1100 | SALARY | true | true |

#### `employee_photos`

| photo_id | employee_id | photo_type | document_id | is_primary | status |
|---|---|---|---|---|---|
| ph-0001 | 11111111-...-0001 | PROFILE | m13-doc-0001 | true | APPROVED |
| ph-0002 | 11111111-...-0001 | BIOMETRIC_REF | m13-doc-0002 | false | APPROVED |
| ph-0003 | 11111111-...-0002 | PROFILE | m13-doc-0010 | true | PENDING |

#### `positions`

| position_id | position_code | title | designation_id | org_unit_id | reports_to_position_id | sanctioned_count | is_vacant | status |
|---|---|---|---|---|---|---|---|---|
| pos-201 | POS-FIN-DO-01 | Deputy Officer (Finance) | desig-201 | org-10 | pos-301 | 2 | false | ACTIVE |
| pos-150 | POS-ENG-AE-05 | Assistant Engineer | desig-150 | org-12 | pos-201 | 5 | true | ACTIVE |
| pos-301 | POS-FIN-JD-01 | Joint Director (Finance) | desig-301 | org-10 | NULL | 1 | false | ACTIVE |

#### `employee_job_assignments`

| assignment_id | employee_id | position_id | designation_id | org_unit_id | assignment_type | effective_from | effective_to | change_reason |
|---|---|---|---|---|---|---|---|---|
| ja-0001 | 11111111-...-0001 | pos-201 | desig-201 | org-10 | SUBSTANTIVE | 2018-04-01 | NULL | PROMOTION |
| ja-0002 | 11111111-...-0001 | pos-150 | desig-150 | org-10 | SUBSTANTIVE | 2010-06-01 | 2018-03-31 | HIRE |
| ja-0003 | 11111111-...-0002 | pos-150 | desig-150 | org-12 | SUBSTANTIVE | 2003-02-15 | NULL | HIRE |

#### `profile_sections`

| section_id | section_key | label | display_order | is_system | is_enabled |
|---|---|---|---|---|---|
| sec-01 | PERSONAL | Personal Details | 1 | true | true |
| sec-05 | BANK | Bank & Financial | 5 | true | true |
| sec-09 | CUSTOM_DEPT | Department Specific | 9 | false | true |

#### `custom_field_definitions`

| field_def_id | section_id | field_key | label | data_type | is_required | is_pii |
|---|---|---|---|---|---|---|
| cf-0001 | sec-09 | uniform_size | Uniform Size | ENUM | false | false |
| cf-0002 | sec-09 | govt_quarters_no | Govt Quarters No. | TEXT | false | false |
| cf-0003 | sec-09 | sports_quota | Sports Quota Entrant | BOOLEAN | false | false |

#### `employee_custom_field_values`

| value_id | employee_id | field_def_id | value_text | value_bool |
|---|---|---|---|---|
| cv-0001 | 11111111-...-0001 | cf-0001 | M | NULL |
| cv-0002 | 11111111-...-0001 | cf-0002 | Q-204 | NULL |
| cv-0003 | 11111111-...-0002 | cf-0003 | NULL | true |

#### `field_access_policies`

| policy_id | field_path | role_key | access_level | requires_reason | is_self_visible |
|---|---|---|---|---|---|
| fap-0001 | employees.pan | HR_OFFICER | MASKED | false | true |
| fap-0002 | employee_bank_accounts.account_number | HR_ADMIN | FULL | true | true |
| fap-0003 | employees.religion | REPORTING_MANAGER | HIDDEN | false | true |

#### `employee_profile_completeness`

| employee_id | overall_pct | section_scores | missing_required_fields | data_quality_flag | last_computed_at |
|---|---|---|---|---|---|
| 11111111-...-0001 | 96.00 | {"PERSONAL":100,"BANK":100,"EDUCATION":80} | ["education.is_verified"] | CLEAN | 2026-06-30T06:00:00Z |
| 11111111-...-0002 | 88.50 | {"PERSONAL":100,"BANK":60} | ["bank.is_verified","photo"] | REVIEW | 2026-06-30T06:00:00Z |
| 11111111-...-0009 | 99.00 | {"PERSONAL":100,"BANK":100} | [] | CLEAN | 2026-06-30T06:00:00Z |

#### `dedup_candidates`

| candidate_id | employee_a_id | employee_b_id | match_score | matched_attributes | status |
|---|---|---|---|---|---|
| dc-0001 | 11111111-...-0002 | 11111111-...-0055 | 92.50 | {"pan":true,"dob":true,"name":0.88} | OPEN |
| dc-0002 | 11111111-...-0003 | 11111111-...-0061 | 78.00 | {"name":0.95,"dob":true} | DISMISSED |
| dc-0003 | 11111111-...-0007 | 11111111-...-0070 | 99.00 | {"aadhaar":true} | MERGED |

#### `employee_import_batches`

| batch_id | file_document_id | template_version | total_rows | valid_rows | error_rows | status |
|---|---|---|---|---|---|---|
| ib-0001 | m13-doc-5001 | v1.2 | 1200 | 1185 | 15 | VALIDATED |
| ib-0002 | m13-doc-5002 | v1.2 | 350 | 350 | 0 | COMMITTED |
| ib-0003 | m13-doc-5003 | v1.1 | 90 | 70 | 20 | FAILED |

#### `import_staging_rows`

| staging_row_id | batch_id | row_number | validation_status | validation_errors | resolved_employee_id |
|---|---|---|---|---|---|
| sr-0001 | ib-0001 | 1 | VALID | NULL | NULL |
| sr-0002 | ib-0001 | 2 | ERROR | {"pan":"INVALID_FORMAT"} | NULL |
| sr-0003 | ib-0002 | 1 | COMMITTED | NULL | 11111111-...-0301 |

---

## 6. Functional Requirements

Each FR follows the mandated structure. Roles use Section 3 keys. "→M02" denotes the edit-approval
hand-off.

---

### FR-EPM-001 — Create Employee Profile on Hire

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Dept Head / Appointing Authority sanction)
- **User Story:** *As an HR Officer, I want to create a complete, validated employee master record when
  a person is hired, so that every downstream module has an authoritative golden record from day one.*

**Description:** Creates the anchor `employees` row plus the initial job assignment, generates the
`service_no`, runs duplicate pre-check, optionally provisions a `users` login, computes initial
completeness, and emits a `PROFILE_CREATED` service event to M12. Supports a multi-step wizard
(Personal → Contact/Address → Job/Position → Statutory → Bank → Review) and a "save draft" mode.

**Acceptance Criteria:**
1. Mandatory fields (`first_name`, `last_name`, `dob`, `gender`, `date_of_joining`, `designation_id`,
   `org_unit_id`, `employment_type`) must be present before submit; draft allows partial save.
2. `service_no` is auto-generated per configured pattern and is unique; collision retries server-side.
3. On submit the system runs deduplication (FR-EPM-015); a HIGH match (≥ 90) blocks auto-create and
   routes to dedup review.
4. Creating the row also creates exactly one current `employee_job_assignments` (reason `HIRE`).
5. `employment_status` is set to `ACTIVE` (or `PROBATIONER` employment_type with ACTIVE status).
6. A `PROFILE_CREATED` event is written to `service_register_events` (M12) within the same transaction
   boundary (outbox pattern).
7. Initial `employee_profile_completeness` row is computed and stored.
8. An `audit_log` entry records creator, timestamp, and payload hash.

**Business Rules:**
- `dob` must make the employee ≥ 18 years on `date_of_joining`.
- `date_of_joining` cannot be a future date beyond the configured pre-hire window (default 90 days).
- Appointing-Authority sanction reference is required for PERMANENT employment_type.
- Position selected (if any) must have `is_vacant=true` or available sanctioned strength.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` | INSERT | all core master fields |
| `employee_job_assignments` | INSERT | reason=HIRE, effective_from=DOJ |
| `employee_profile_completeness` | INSERT | initial score |
| `service_register_events` (M12) | INSERT (via producer) | PROFILE_CREATED |
| `audit_log` | INSERT | CREATE |
| `users` | INSERT (optional) | login provisioning |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees` | create profile (or draft with `?draft=true`) |
| POST | `/api/v1/employees/dedup-precheck` | pre-submit duplicate check |
| GET | `/api/v1/employees/service-no/preview` | preview next service_no |

**UI Behavior Notes:** Stepper wizard with per-step validation; inline dedup warning banner; "Save
draft" persists state; review step shows a read-only summary with edit-jump links; success toast +
redirect to the new 360° profile.

**Edge Cases:** duplicate `service_no` race; dedup HIGH match; future DOJ; position over-strength;
partial save then abandon (draft TTL cleanup); creating profile for a rehire (prior RESIGNED record).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `CreateEmployeeWizard` (stepper), per-step forms with zod/Yup schemas, dedup warning banner, review summary, success redirect. |
| Backend-Service Flow | `EmployeeService.create()` → validate → dedup-precheck → generate service_no → tx{ insert employee + assignment + completeness + outbox event } → optional user provisioning → return 201. |
| Data Operations | INSERT employees, employee_job_assignments, employee_profile_completeness, audit_log, outbox(service_register_events). |
| Validation Logic | Field schema validation; age/DOJ rules; PAN format; position strength check; sanction ref required for PERMANENT. |
| Authorization Logic | Requires `employee.create` permission (HR Officer/Admin); org-scope must include target `org_unit_id`; PERMANENT needs Appointing-Authority sanction reference. |
| State Changes & Side Effects | New ACTIVE employee; PROFILE_CREATED SR event; completeness computed; optional login created; notification to HR + manager. |
| Failure Handling | Validation→400 VALIDATION_ERROR(field); dedup block→409 DUPLICATE_CANDIDATE; service_no collision→retry then 409; partial failure→full tx rollback, outbox not emitted. |
| Dependencies & Reuse | Reuses dedup engine (FR-015), completeness engine (FR-013/014 naming → FR-014), M12 producer, M13 (photo later), shared workflow (none here; create is direct HR action). |
| Test Guidance | Unit: validators, service_no generator, dedup gating. Integration: tx atomicity incl. outbox; rollback on event failure. E2E: full wizard happy path + dedup-block path + draft resume. |

---

### FR-EPM-002 — 360° Consolidated Profile View

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Reporting Manager (scoped), Auditor (RO), Employee (own)
- **User Story:** *As an HR Officer, I want one consolidated 360° view of an employee assembling all
  sections, so that I can understand the whole person without hopping between systems.*

**Description:** A read-optimised, tabbed/section-based composite that aggregates the master row, all
satellites, current + historical job assignments, completeness score, data-quality flags, and linked
documents — each section rendered through the **field-access policy** so the viewer sees only permitted
fields (FULL/MASKED/HIDDEN).

**Acceptance Criteria:**
1. The view assembles person, contact, address, dependents, nominees, emergency contacts, education,
   experience, identity (masked), bank (masked), photo, current position/org placement, custom fields,
   and completeness in ≤ 800 ms P95.
2. Every field is rendered per the caller's `field_access_policies` resolution (server-masked).
3. A header shows photo, name, service_no, designation, org unit, status badge, completeness ring.
4. Restricted-PII reads requiring a reason prompt for a break-glass reason and log it.
5. Sections the viewer cannot see at all are hidden, not shown empty.
6. The view is read-only; edit affordances appear only for roles permitted (and route via M02 for
   self-service users).

**Business Rules:**
- Reporting Managers see direct/indirect reports within their org subtree only.
- Auditors see all fields in read-only with full audit logging; sensitive fields still masked unless
  policy grants FULL.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` + all `employee_*` | SELECT | full projection (policy-masked) |
| `employee_job_assignments` | SELECT | current + history |
| `employee_profile_completeness` | SELECT | score, dq |
| `field_access_policies` | SELECT | masking resolution |
| `audit_log` | INSERT | PII_READ when restricted |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/profile-360` | assembled view |
| GET | `/api/v1/employees/{id}/sections/{sectionKey}` | lazy-load a section |
| POST | `/api/v1/employees/{id}/break-glass` | record reason for restricted read |

**UI Behavior Notes:** Left rail section nav + sticky header; lazy-load heavy sections; masked fields
show a lock icon with "reveal (reason required)" when policy permits; completeness ring links to
FR-EPM-014.

**Edge Cases:** employee with no photo (initials avatar); separated employee (read-only, watermark);
viewer with partial section access; very large dependents/history lists (paginated within section).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `Profile360` shell, `ProfileHeader`, section panels, masked-field component, break-glass modal, completeness ring. |
| Backend-Service Flow | `ProfileAggregator.assemble(id, viewerCtx)` → parallel section fetch → apply field-access policy → strip tokens → return composite; lazy section endpoint for on-demand panels. |
| Data Operations | SELECT across employees + satellites + assignments + completeness; policy join; audit INSERT for restricted reads. |
| Validation Logic | Viewer org-scope check; section visibility resolution; reason required for break-glass fields. |
| Authorization Logic | Row access (own/scope/global per role) AND field access policy per field; deny → omit field/section. |
| State Changes & Side Effects | No data mutation; PII_READ audit rows for restricted fields; break-glass reason persisted. |
| Failure Handling | Not found→404; forbidden row→403; section fetch failure→partial render with section-level error chip; policy resolution failure→fail closed (hide). |
| Dependencies & Reuse | Reuses field-access engine (FR-012), completeness (FR-014), M13 photo URL resolution, audit. |
| Test Guidance | Unit: masking resolution matrix. Integration: composite latency, partial-failure rendering. E2E: role-based visibility (employee vs manager vs HR vs auditor); break-glass logging. |

---

### FR-EPM-003 — Contact Information & Multiple Address Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to maintain an employee's multiple contacts and addresses
  with verification, so that communications and statutory correspondence reach the right place.*

**Description:** CRUD for `employee_contacts` and `employee_addresses` with type rules, primary
designation, OTP/email verification, "same as permanent" copy, and effective-dated address history.
Employee-initiated changes are submitted as M02 requests; HR direct edits apply immediately with audit.

**Acceptance Criteria:**
1. Each contact type validated (phone E.164-ish; email RFC 5322); exactly one primary per type.
2. Marking a new primary auto-demotes the previous primary atomically.
3. Address requires full mandatory set; pincode validated per country; "same as permanent" copies fields.
4. Verification flow: sending OTP/email sets `is_verified=false→true` on confirmation; verified_at set.
5. Address changes are effective-dated (old row `valid_to` closed, new row opened).
6. Employee self-service edits create an M02 request, not a direct write.

**Business Rules:**
- At least one MOBILE and one email (official or personal) required for ACTIVE employees (completeness).
- Overseas address requires country ≠ India and a valid international format.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_contacts` | INSERT/UPDATE/SOFT-DELETE | type, value, is_primary, verification |
| `employee_addresses` | INSERT/UPDATE | type, valid_from/to, is_current |
| `workflow_instances` (M02) | INSERT | for self-service requests |
| `audit_log` | INSERT | CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/employees/{id}/contacts` | list/add |
| PATCH/DELETE | `/api/v1/employees/{id}/contacts/{contactId}` | update/soft-delete |
| POST | `/api/v1/contacts/{contactId}/verify` | OTP/email verify |
| GET/POST/PATCH | `/api/v1/employees/{id}/addresses` | manage addresses |

**UI Behavior Notes:** Cards per contact/address with primary star; verify badge; add-address modal
with "same as permanent" toggle; map-pin geocode optional; self-service shows "submit for approval".

**Edge Cases:** removing the only primary; unverified primary; duplicate identical contact; address
with future `valid_from`; switching present/permanent same flag.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `ContactList`, `AddressList`, add/edit modals, verify badge, primary toggle, self-service approval banner. |
| Backend-Service Flow | `ContactService` / `AddressService` CRUD; primary-demotion in tx; verification issues OTP via notification service; address change closes prior row + opens new. |
| Data Operations | INSERT/UPDATE/soft-delete contacts/addresses; effective-date transition for addresses; audit. |
| Validation Logic | Type-specific format; one-primary invariant; pincode/country rules; min-contact rule for ACTIVE. |
| Authorization Logic | HR write within org scope; self-service routes to M02 (no direct write); auditor read-only. |
| State Changes & Side Effects | Primary reassignment; verification status; notification on verify; M02 request created for self edits. |
| Failure Handling | Invalid format→400; removing sole primary→409 PRIMARY_REQUIRED; OTP expiry→retry; concurrent primary set→last-writer with version check. |
| Dependencies & Reuse | Notification service (OTP), M02 workflow, audit, completeness recompute trigger. |
| Test Guidance | Unit: format validators, primary invariant. Integration: address effective-date transition. E2E: verify flow, self-service→M02 request. |

---

### FR-EPM-004 — Dependents, Family Members & Nominee Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to record dependents and benefit nominees with shares and
  guardian handling, so that pension, gratuity and insurance pay out correctly and lawfully.*

**Description:** CRUD for `employee_dependents` and `employee_nominees`, with minor detection, guardian
requirement, per-benefit nominee-share validation (sum = 100), and proof-document linkage to M13.

**Acceptance Criteria:**
1. Dependent `is_minor` is computed from `dob`; flagged dependents drive medical/benefit eligibility.
2. A nominee may reference an existing dependent or be entered standalone.
3. For each `(employee, benefit_type)` the sum of active nominee `share_pct` must equal 100 before save
   of the set; partial save allowed only as draft.
4. Minor nominees require a `guardian_name`.
5. Proof documents are linked via `document_id` (uploaded to M13 first).
6. Self-service edits route to M02.

**Business Rules:**
- Spouse relationship limited to one active per employee (configurable).
- Nominee changes for PENSION/GRATUITY are statutory — require proof document and emit an SR event.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_dependents` | CRUD | relationship, dob, is_minor |
| `employee_nominees` | CRUD | benefit_type, share_pct, guardian |
| `documents` (M13) | reference | proof docs |
| `service_register_events` (M12) | INSERT | NOMINEE_UPDATED (statutory benefits) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/dependents` | dependents |
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/nominees` | nominees |
| POST | `/api/v1/employees/{id}/nominees:validate-shares` | share-sum check |

**UI Behavior Notes:** Dependents table + nominee allocation grid grouped by benefit_type with a live
share-sum indicator (must hit 100%); guardian field appears when nominee is minor; "promote dependent
to nominee" shortcut.

**Edge Cases:** share sum ≠ 100; minor without guardian; nominee deletion leaving < 100%; duplicate
spouse; dependent deletion referenced by a nominee.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `DependentTable`, `NomineeAllocationGrid` with per-benefit share meter, guardian conditional field, promote-to-nominee action. |
| Backend-Service Flow | `DependentService`/`NomineeService`; share-sum validated per benefit set in tx; minor → guardian required; statutory benefit change emits SR event. |
| Data Operations | CRUD dependents/nominees; FK to M13 docs; outbox SR event for statutory benefits; audit. |
| Validation Logic | Minor computation; guardian conditional; per-benefit share sum = 100; spouse uniqueness; referenced-dependent delete guard. |
| Authorization Logic | HR write in scope; self-service→M02; statutory nominee change needs proof doc. |
| State Changes & Side Effects | Nominee set updated; NOMINEE_UPDATED SR event for PENSION/GRATUITY; completeness recompute. |
| Failure Handling | Share≠100→409 SHARE_SUM_INVALID; minor no guardian→400; delete referenced dependent→409 IN_USE. |
| Dependencies & Reuse | M13 upload, M12 producer, M02 workflow, audit. |
| Test Guidance | Unit: share-sum + minor logic. Integration: SR event on statutory nominee change. E2E: allocation grid to 100%, guardian flow. |

---

### FR-EPM-005 — Emergency Contact Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Employee (own, → M02 for self edits)
- **User Story:** *As an employee, I want my emergency contacts on file with a call priority, so that
  the organisation can reach the right person quickly in a crisis.*

**Description:** CRUD for `employee_emergency_contacts` with priority ordering and at least one required
for ACTIVE employees. Lightweight (not statutory), so self-service edits may be configured to apply
immediately or route to M02 per policy.

**Acceptance Criteria:**
1. Each contact requires name, relationship, and a valid primary phone.
2. Priority is unique per employee and re-sequenced on add/remove/reorder.
3. ACTIVE employees must have ≥ 1 emergency contact (completeness rule, warning not hard block).
4. Drag-reorder updates priority atomically.

**Business Rules:**
- Emergency contacts are not PII-restricted to managers (operationally needed) but are still audited.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_emergency_contacts` | CRUD | name, phone, priority |
| `audit_log` | INSERT | CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/emergency-contacts` | manage |
| PATCH | `/api/v1/employees/{id}/emergency-contacts:reorder` | reorder priorities |

**UI Behavior Notes:** Simple ordered list with drag handles; primary contact pinned at top; quick-add
inline row.

**Edge Cases:** duplicate priority; deleting last contact (warn); invalid phone; reorder race.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `EmergencyContactList` with drag-reorder, inline add row, validation hints. |
| Backend-Service Flow | `EmergencyContactService` CRUD + reorder; priority normalisation in tx. |
| Data Operations | CRUD + bulk priority update; audit. |
| Validation Logic | Phone format; priority uniqueness; min-one warning. |
| Authorization Logic | HR write in scope; self-service per config (immediate or M02). |
| State Changes & Side Effects | Priority resequence; completeness recompute (warning weight). |
| Failure Handling | Invalid phone→400; reorder conflict→version retry. |
| Dependencies & Reuse | Audit, completeness. |
| Test Guidance | Unit: priority normalisation. E2E: drag-reorder persists, min-one warning. |

---

### FR-EPM-006 — Education, Qualifications & Prior Experience Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to maintain verified education and prior service history,
  so that eligibility, seniority, and pensionable-service computations are accurate.*

**Description:** CRUD for `employee_education` and `employee_experience` with highest-qualification
designation, credential verification, government-service flagging (feeds pension), and certificate
linkage to M13.

**Acceptance Criteria:**
1. Exactly one education row may be `is_highest=true`; setting a new one demotes the prior.
2. `year_of_passing` bounded (1950..current); experience `from_date ≤ to_date`.
3. `is_government_service=true` experience contributes to pensionable-service summary (read by M11).
4. Verification toggles `is_verified` with source captured; verified rows are immutable except by Admin.
5. Certificates/relieving letters linked via `document_id`.

**Business Rules:**
- Overlapping prior-experience date ranges produce a warning (not always invalid — concurrent roles).
- Education below the post's minimum qualification raises a data-quality REVIEW flag.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_education` | CRUD | level, is_highest, is_verified |
| `employee_experience` | CRUD | from/to, is_government_service |
| `documents` (M13) | reference | certificates |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/education` | education |
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/experience` | experience |
| POST | `/api/v1/education/{id}:verify` | mark verified |

**UI Behavior Notes:** Timeline view for experience; highest-qualification badge; verify action with
source dropdown; gov-service toggle highlighted; pensionable-service summary footer.

**Edge Cases:** two rows claiming highest; overlapping experience; verified row edit attempt; future
passing year.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `EducationList`, `ExperienceTimeline`, highest badge, verify modal, gov-service toggle, pensionable summary. |
| Backend-Service Flow | Services CRUD; highest-demotion in tx; verification locks row; gov-service aggregates into pensionable summary projection. |
| Data Operations | CRUD; M13 doc refs; audit; completeness recompute. |
| Validation Logic | One-highest invariant; date bounds; overlap warning; min-qualification DQ check. |
| Authorization Logic | HR write in scope; verified-row edit only Admin; self-service→M02. |
| State Changes & Side Effects | Highest reassignment; DQ flag on under-qualification; pensionable summary changes. |
| Failure Handling | Two-highest→409; verified edit→403 IMMUTABLE_VERIFIED; bad dates→400. |
| Dependencies & Reuse | M13, M11 (pension read), DQ engine (FR-014), audit. |
| Test Guidance | Unit: highest invariant, gov-service aggregation. Integration: pensionable summary. E2E: verify-then-lock. |

---

### FR-EPM-007 — Identity & Statutory Document Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer (masked), HR Admin (Employee requests → M02)
- **User Story:** *As an HR Admin, I want to capture and verify statutory IDs securely, with the raw
  numbers tokenised and never exposed, so that we meet KYC and DPDP obligations.*

**Description:** CRUD for `employee_identity_documents` storing only masked display values plus a
tokenised/encrypted true value; verification workflow; expiry tracking with alerts; scan linkage to
M13. Raw numbers are never returned by any read API.

**Acceptance Criteria:**
1. On save, the raw number is validated by type (Aadhaar Verhoeff/format, PAN regex, passport pattern),
   tokenised/encrypted at rest, and a masked display value derived.
2. No read API ever returns the raw number or token — only `doc_number_masked`.
3. Each `doc_type` at most one active record per employee (configurable for PASSPORT renewals).
4. Documents with `expiry_date` generate alerts at 90/30/7 days before expiry.
5. Verification sets `is_verified` and `verification_source`.
6. Aadhaar/PAN reads are logged as restricted PII reads with reason where policy requires.

**Business Rules:**
- Aadhaar storage follows minimisation: store only when statutorily required; mask to last 4.
- PAN must be unique across employees (duplicate PAN triggers a dedup candidate).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_identity_documents` | CRUD | masked, token, expiry, verified |
| `documents` (M13) | reference | scans |
| `dedup_candidates` | INSERT | duplicate PAN/Aadhaar |
| `audit_log` | INSERT | PII_READ / CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/identity-docs` | manage (masked only) |
| POST | `/api/v1/identity-docs/{id}:verify` | verify |
| GET | `/api/v1/identity-docs/expiring` | expiry report |

**UI Behavior Notes:** Inputs accept raw number, immediately masked on blur; field locked after save
(replace requires new entry + reason); verify badge; expiry chips colour-coded; reveal action only for
FULL-policy roles with reason capture.

**Edge Cases:** invalid Aadhaar checksum; duplicate PAN across employees; expired document; attempt to
read raw via API (must 403/omit); replacing a passport (history retained).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `IdentityDocList`, masked input, reveal-with-reason modal, verify badge, expiry chips. |
| Backend-Service Flow | `IdentityDocService` → validate raw → tokenise/encrypt (KMS) → store masked+token → dedup check on PAN/Aadhaar → verify flow; reads project masked only. |
| Data Operations | CRUD with encrypted token column; dedup_candidate INSERT on collision; audit PII_READ. |
| Validation Logic | Type-specific checksum/format; uniqueness (PAN); expiry presence for time-bound docs. |
| Authorization Logic | Write HR Admin; HR Officer masked; raw never returned; FULL reveal needs policy + reason; self-service→M02. |
| State Changes & Side Effects | Dedup candidate on collision; expiry alerts scheduled; verification status. |
| Failure Handling | Checksum fail→400 INVALID_ID; duplicate PAN→409 + dedup; raw-read attempt→403 FORBIDDEN. |
| Dependencies & Reuse | KMS/crypto util, dedup engine, M13, notification (expiry), audit. |
| Test Guidance | Unit: Verhoeff/PAN validators, masking. Security: token never serialised. Integration: dedup on duplicate PAN. E2E: reveal-with-reason logged. |

---

### FR-EPM-008 — Bank & Financial Detail Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer/HR Admin (4-eyes), Dept Head (approve)
- **User Story:** *As an HR Admin, I want bank details captured, verified, and changed under 4-eyes
  control, so that salary and pension are paid to the correct, fraud-resistant account.*

**Description:** CRUD for `employee_bank_accounts` with IFSC validation, account-number tokenisation,
penny-drop/manual verification, exactly one active primary salary account, and **mandatory 4-eyes**
(second approver) on create/change even outside M02. Consumed by M10/M11.

**Acceptance Criteria:**
1. IFSC validated against format and (optionally) a bank reference list; account number tokenised,
   masked to last 4.
2. Exactly one `is_primary_salary=true` active account; switching demotes the prior in the same tx.
3. Every create/update requires a second approver (4-eyes) before becoming effective.
4. Account holder name fuzzy-matched against employee name; mismatch raises a warning + reason.
5. Verification (penny-drop or manual) sets `is_verified`; payroll consumes only verified primary.
6. Changes emit a `BANK_DETAIL_CHANGED` notification to the employee.

**Business Rules:**
- A bank change within N days of a payroll cut-off is flagged for extra scrutiny.
- Separated employees' bank edits restricted to pension disbursement context (HR Admin + reason).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_bank_accounts` | CRUD | ifsc, masked, token, primary, verified |
| `workflow_tasks` | INSERT | 4-eyes approval |
| `notifications` | INSERT | change alert |
| `audit_log` | INSERT | CRUD + approval |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/employees/{id}/bank-accounts` | manage (pending until approved) |
| POST | `/api/v1/bank-accounts/{id}:approve` | second-approver action |
| POST | `/api/v1/bank-accounts/{id}:verify` | penny-drop/manual verify |

**UI Behavior Notes:** Pending-approval state badge; approve action visible only to a different
authorised user; masked account number with reveal-with-reason; name-match warning banner; verify
status.

**Edge Cases:** maker = checker attempt (block); name mismatch; duplicate account across employees;
change near payroll cut-off; unverified primary used by payroll (payroll rejects).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `BankAccountList`, add/edit form, pending badge, approve panel (different user), verify action, name-match warning. |
| Backend-Service Flow | `BankAccountService` create→PENDING; second-approver via shared workflow_tasks; on approve→effective + demote prior primary; verify flow; notify. |
| Data Operations | CRUD with token column; workflow_task INSERT; primary demotion in tx; notification; audit. |
| Validation Logic | IFSC format/list; name fuzzy match; one-primary invariant; maker≠checker; cut-off scrutiny flag. |
| Authorization Logic | Maker = HR Officer/Admin; checker = different authorised user/Dept Head; raw token never returned. |
| State Changes & Side Effects | PENDING→ACTIVE on approval; primary reassignment; BANK_DETAIL_CHANGED notification; payroll-relevant flag. |
| Failure Handling | maker=checker→403 SOD_VIOLATION; invalid IFSC→400; duplicate account→409; unapproved→payroll read excludes. |
| Dependencies & Reuse | Shared workflow engine (4-eyes), KMS, notification, M10/M11 consumers, audit. |
| Test Guidance | Unit: IFSC validator, one-primary invariant. Security: SOD enforcement, token secrecy. Integration: approval→effective; payroll reads only verified primary. E2E: 4-eyes flow. |

---

### FR-EPM-009 — Profile Photo & Biometric Reference Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee upload → M02/approval)
- **User Story:** *As an HR Officer, I want to manage an employee's profile photo and biometric
  reference, so that ID cards, directory, and attendance recognition work reliably.*

**Description:** Upload/replace/approve profile photos (binary stored in M13, metadata in
`employee_photos`), enforce one primary, support an opaque biometric-reference link (no raw templates),
and an approval state for self-uploaded photos.

**Acceptance Criteria:**
1. Photo binary is uploaded to M13 first; M01 stores `document_id`, dimensions, type.
2. Allowed formats JPEG/PNG; max 5 MB; min 300×300; face-detected (advisory) on upload.
3. Exactly one `is_primary=true` PROFILE photo; setting new primary demotes prior.
4. Self-uploaded photos enter `PENDING` and require HR approval before becoming primary.
5. Biometric reference stored only as an opaque `biometric_template_ref`; no raw biometric data in M01.
6. Replacing a photo retains prior versions (history via M13 versioning).

**Business Rules:**
- ID-card photo must meet stricter dimension/background rules (configurable).
- Biometric reference changes are audited and restricted to HR Admin.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_photos` | CRUD | document_id, is_primary, status |
| `documents` (M13) | reference | binary + versions |
| `employees.primary_photo_id` | UPDATE | denormalised pointer |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}/photos` | upload (returns pending) |
| POST | `/api/v1/photos/{photoId}:approve` | approve → primary |
| GET | `/api/v1/employees/{id}/photo` | resolve current primary URL |

**UI Behavior Notes:** Drag-drop upload with crop tool; pending overlay; approve/reject actions; avatar
fallback to initials; biometric section visible only to HR Admin.

**Edge Cases:** oversized/wrong format; no face detected (warn); replacing primary while pending exists;
M13 upload failure (rollback metadata).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `PhotoUploader` (crop), pending overlay, approve/reject, biometric panel (Admin), avatar fallback. |
| Backend-Service Flow | Upload→M13→get document_id→insert employee_photos PENDING→on approve set primary + update employees.primary_photo_id (demote prior). |
| Data Operations | INSERT/UPDATE employee_photos; UPDATE employees.primary_photo_id; M13 reference; audit. |
| Validation Logic | Format/size/dimension; one-primary invariant; approval gate for self-uploads. |
| Authorization Logic | HR write; self-upload→PENDING approval; biometric ref HR Admin only. |
| State Changes & Side Effects | PENDING→APPROVED→primary; prior primary demoted; completeness recompute (photo present). |
| Failure Handling | Bad file→400; M13 failure→rollback metadata; approve nonexistent→404; concurrent primary→version check. |
| Dependencies & Reuse | M13 storage/versioning, image-validation util, audit, completeness. |
| Test Guidance | Unit: validation rules. Integration: M13 upload+rollback. E2E: upload→approve→primary; biometric restricted. |

---

### FR-EPM-010 — Position Management & Org-Chart Placement

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (Dept Head approve; Reporting Manager recommend)
- **User Story:** *As an HR Admin, I want formal sanctioned positions and effective-dated placement of
  employees into them, so that the org chart, vacancies, and reporting lines are always accurate.*

**Description:** Manages `positions` (sanctioned posts with strength, reporting edges, status) and
places employees via effective-dated `employee_job_assignments`. Renders an interactive org chart;
computes vacancies; keeps the denormalised current placement on `employees` in sync. Placement changes
originating in M05 (transfer) / M06 (promotion) are recorded here as new assignments.

**Acceptance Criteria:**
1. A position has a sanctioned count; `is_vacant`/filled is computed from active assignments.
2. Placing an employee creates a new assignment row; any prior current assignment is closed
   (`effective_to` = new `effective_from` − 1 day) — no overlaps.
3. The denormalised `employees.designation_id/org_unit_id/reporting_manager_id` always equal the
   current assignment.
4. Org chart renders reporting hierarchy from `positions.reports_to_position_id` + current assignments.
5. Placement beyond sanctioned strength is blocked unless an over-strength override (with reason) is
   approved.
6. Assignment changes emit a `PLACEMENT_CHANGED` service event to M12.

**Business Rules:**
- ABOLISHED/FROZEN positions cannot receive new placements.
- Additional-charge/officiating assignments may overlap a substantive one (typed differently) but only
  one SUBSTANTIVE current assignment is allowed.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `positions` | CRUD | code, strength, reports_to, status |
| `employee_job_assignments` | INSERT/UPDATE | effective dating, type |
| `employees` | UPDATE | denormalised current placement |
| `service_register_events` (M12) | INSERT | PLACEMENT_CHANGED |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/positions` | manage positions |
| POST | `/api/v1/employees/{id}/assignments` | place / change assignment |
| GET | `/api/v1/org-chart?rootOrgUnit={id}` | org-chart tree |
| GET | `/api/v1/positions/vacancies` | vacancy report |

**UI Behavior Notes:** Interactive org chart (zoom/pan/collapse), drag-to-reassign with confirmation,
vacancy heatmap, position detail drawer, effective-date picker on placement.

**Edge Cases:** over-strength placement; overlapping substantive assignments; placing into
ABOLISHED position; back-dated assignment crossing prior rows; circular reports_to.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `OrgChart` (tree), `PositionDrawer`, `AssignmentForm` with effective date, vacancy heatmap, over-strength override modal. |
| Backend-Service Flow | `PositionService`/`AssignmentService`: place→validate strength/status→close prior current→insert new→sync denormalised fields→emit PLACEMENT_CHANGED, all in tx. |
| Data Operations | CRUD positions; INSERT assignment + close prior; UPDATE employees denorm; outbox SR event; audit. |
| Validation Logic | Strength check; one-substantive-current invariant; no overlap (exclusion constraint); status gate; cycle detection on reports_to. |
| Authorization Logic | HR Admin write; Dept Head approves over-strength; Reporting Manager recommend-only. |
| State Changes & Side Effects | New current assignment; denorm sync; vacancy recompute; PLACEMENT_CHANGED SR event; notify. |
| Failure Handling | Over-strength→409 OVER_STRENGTH (or override path); overlap→409; abolished→409 POSITION_INACTIVE; cycle→400. |
| Dependencies & Reuse | M05/M06 callers, M12 producer, org_units/designations masters, audit. |
| Test Guidance | Unit: overlap/one-substantive invariants, cycle detection. Integration: denorm sync + SR event. E2E: drag-reassign, vacancy update, over-strength override. |

---

### FR-EPM-011 — Effective-Dated Attributes & Point-in-Time View

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Auditor (RO)
- **User Story:** *As an auditor, I want to see exactly what an employee's job, org, and key attributes
  were on any past date, so that pension, seniority, and disputes can be resolved against the record as
  it stood.*

**Description:** Provides a point-in-time ("as-of") reconstruction of effective-dated data (primarily
`employee_job_assignments`, addresses, and configured effective-dated attributes), and a chronological
change-history timeline. Reads only; it does not bypass M02 for edits.

**Acceptance Criteria:**
1. Given an `asOf` date, the API returns the assignment/address/attributes active on that date.
2. A change-history timeline lists every effective-dated change with reason, source module, and actor.
3. Future-dated assignments are visible but clearly marked as scheduled.
4. Corrections (retroactive edits via M02 commit) are recorded as new versions; nothing is overwritten.
5. The view reconciles to audit_log entries for the same period.

**Business Rules:**
- "As-of" defaults to today; auditors may query any date within retention.
- Only effective-dated tables participate; non-dated satellites show current value with last-changed.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_job_assignments` | SELECT (as-of) | effective_from/to |
| `employee_addresses` | SELECT (as-of) | valid_from/to |
| `audit_log` | SELECT | change reconciliation |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/as-of?date=YYYY-MM-DD` | point-in-time snapshot |
| GET | `/api/v1/employees/{id}/history?attribute=assignment` | change timeline |

**UI Behavior Notes:** Date slider/picker re-renders the profile "as it was"; timeline with reason
chips and source-module tags; scheduled future changes shown with a clock icon.

**Edge Cases:** as-of before DOJ (empty/illegal); as-of within a gap (no active assignment); future
date; overlapping correction versions.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `AsOfDatePicker`, point-in-time profile render, `ChangeTimeline` with reason/source chips, scheduled markers. |
| Backend-Service Flow | `PointInTimeService.snapshot(id, asOf)` selects rows where asOf ∈ [from,to]; timeline aggregates versions ordered by effective_from. |
| Data Operations | Range SELECTs on effective-dated tables; audit_log correlation. |
| Validation Logic | asOf bounds (≥ DOJ, ≤ retention horizon); gap detection. |
| Authorization Logic | Read per role/scope; auditor full read; field-access masking applies. |
| State Changes & Side Effects | None (read-only). |
| Failure Handling | asOf < DOJ→400 OUT_OF_RANGE; no active row→explicit "no assignment" state. |
| Dependencies & Reuse | Field-access engine, assignment data (FR-010), audit. |
| Test Guidance | Unit: as-of selection across boundaries. Integration: timeline ordering with corrections. E2E: date slider reconstructs history. |

---

### FR-EPM-012 — Configurable Profile Sections & Custom Fields

- **Module:** M01-EPM
- **Primary Role(s):** System Administrator (HR Admin proposes)
- **User Story:** *As a System Administrator, I want to configure profile sections and custom fields
  without code, so that departments can capture organisation-specific attributes safely.*

**Description:** Manages `profile_sections`, `custom_field_definitions`, and the storage of values in
`employee_custom_field_values`. Supports typed fields, required flags, validation regex, conditional
applicability by employment type, PII flagging (which auto-creates a field-access policy default), and
ordering. The 360° view and forms render dynamically from this config.

**Acceptance Criteria:**
1. Admin can create/enable/disable sections and fields; system sections cannot be deleted.
2. Each field has a data type and validations enforced both on UI and server.
3. Marking a field `is_pii=true` requires/creates a default `field_access_policies` entry.
4. Disabling a field hides it from forms but retains stored values (no data loss).
5. Required custom fields participate in completeness scoring.
6. Field definition changes are versioned/audited; existing values are not silently dropped.

**Business Rules:**
- A field's data type cannot be changed once values exist (must create a new field).
- Conditional sections only render for matching `applicable_employment_types`.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `profile_sections` | CRUD | key, order, enabled |
| `custom_field_definitions` | CRUD | type, required, is_pii, regex |
| `employee_custom_field_values` | CRUD | typed value columns |
| `field_access_policies` | INSERT | default for PII fields |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/config/profile-sections` | sections |
| GET/POST/PATCH | `/api/v1/config/custom-fields` | field defs |
| PUT | `/api/v1/employees/{id}/custom-fields` | set values |

**UI Behavior Notes:** Admin config screen with drag-order sections/fields, type picker, validation
builder, PII toggle; employee forms render dynamically; disabled fields greyed in admin, hidden in
employee view.

**Edge Cases:** type change with existing data (blocked); duplicate field_key; required field added
retroactively (existing profiles flagged incomplete); deleting a system section (blocked).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `SectionConfig`, `CustomFieldBuilder`, dynamic `DynamicFieldRenderer` consumed by all profile forms. |
| Backend-Service Flow | `ConfigService` CRUD with versioning; PII flag triggers default policy; `CustomValueService` validates against def and stores typed column. |
| Data Operations | CRUD config tables; UPSERT values; INSERT default field_access_policy; audit. |
| Validation Logic | Type integrity (no change with values); regex/required enforcement; unique field_key; type-correct value storage. |
| Authorization Logic | System Admin config; HR Admin proposes; value writes follow normal employee edit auth (self→M02). |
| State Changes & Side Effects | New fields appear in forms; completeness recompute when required fields change; default policy created. |
| Failure Handling | Type change with data→409 TYPE_LOCKED; dup key→409; system delete→403. |
| Dependencies & Reuse | Field-access engine, completeness engine, audit, dynamic form renderer. |
| Test Guidance | Unit: type/validation enforcement. Integration: PII→policy creation; disable retains data. E2E: add field→renders→value captured→completeness updates. |

---

### FR-EPM-013 — Field-Level PII Access Control & Data Privacy

- **Module:** M01-EPM
- **Primary Role(s):** System Administrator (config); enforced for all readers
- **User Story:** *As a privacy officer, I want every PII field governed by a role-based access policy
  with masking and break-glass logging, so that we comply with the DPDP Act and minimise exposure.*

**Description:** Implements `field_access_policies` resolution applied server-side to every profile read
(FULL/MASKED/HIDDEN per field per role), break-glass "reason required" reads, self-visibility control,
and full audit of restricted reads. This is the enforcement layer the 360° view and consumption API
both call.

**Acceptance Criteria:**
1. Every PII field has at least one policy; absence defaults to HIDDEN (fail-closed).
2. Reads return values masked/hidden per the caller's resolved policy; tokens are never returned.
3. `requires_reason=true` fields prompt for and persist a break-glass reason on each reveal.
4. `is_self_visible` controls whether the data subject can see their own value.
5. All restricted-PII reads (and reveals) are written to `audit_log` with field, viewer, reason.
6. Policy changes take effect immediately (no stale caching beyond short TTL).

**Business Rules:**
- Sensitive special-category data (religion, social category, disability, biometric) defaults to HIDDEN
  for all but explicitly granted roles.
- Auditor reads are always logged; masking still applies unless FULL granted.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `field_access_policies` | CRUD | field_path, role, level, reason |
| `audit_log` | INSERT | PII_READ with reason |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/config/field-access-policies` | manage policies |
| POST | `/api/v1/employees/{id}/reveal-field` | break-glass reveal (reason) |
| GET | `/api/v1/config/field-access-policies/resolve?role=` | preview resolution |

**UI Behavior Notes:** Policy matrix editor (field × role → level); locked-field UI with reveal
prompt; "viewed by" indicator; admin preview of effective policy per role.

**Edge Cases:** field with no policy (defaults HIDDEN); conflicting policies (most-restrictive wins);
reveal without reason (blocked); self viewing a self-hidden field.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `PolicyMatrixEditor`, masked-field component, reveal-with-reason modal, effective-policy preview. |
| Backend-Service Flow | `FieldAccessResolver.resolve(field, role, isSelf)` → level; applied as a projection filter in every read service; reveal endpoint logs reason then returns single field. |
| Data Operations | CRUD policies; SELECT for resolution (cached short TTL); audit INSERT on restricted read/reveal. |
| Validation Logic | Unique (field_path, role); valid level enum; reason required when configured. |
| Authorization Logic | Config = System Admin; enforcement on every reader; default fail-closed (HIDDEN). |
| State Changes & Side Effects | Policy change invalidates cache; reveal logs reason. |
| Failure Handling | No policy→HIDDEN; reveal w/o reason→400 REASON_REQUIRED; unknown field_path→400. |
| Dependencies & Reuse | Consumed by FR-002, FR-018; audit; cache layer. |
| Test Guidance | Unit: resolution matrix incl. most-restrictive + fail-closed. Security: token never leaks; reveal logged. Integration: policy change immediacy. E2E: masked vs revealed per role. |

---

### FR-EPM-014 — Profile Completeness Scoring & Data Quality Validation

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Employee (own nudges)
- **User Story:** *As an HR Officer, I want each profile scored for completeness and validated for data
  quality, so that I can target gaps and trust the master data.*

**Description:** Computes a weighted completeness score per section and overall, detects data-quality
issues (missing required, format anomalies, cross-field inconsistencies, under-qualification, unverified
statutory IDs), stores results in `employee_profile_completeness`, sets `data_quality_flag`, and drives
nudges. Recomputed on relevant writes and via a scheduled batch.

**Acceptance Criteria:**
1. Overall and per-section scores (0–100) are computed using a configurable weighting.
2. Missing required fields and DQ issues are enumerated with codes/messages.
3. `data_quality_flag` set to CLEAN/REVIEW/BLOCKED per thresholds; BLOCKED gates certain downstream ops.
4. Score recomputes on each relevant write (event-driven) and nightly batch reconciliation.
5. Employees see their own completeness ring and a prioritised "complete your profile" checklist.
6. HR sees an org-level completeness/DQ dashboard feed (consumed by M14).

**Business Rules:**
- BLOCKED (e.g., missing verified bank for an ACTIVE permanent employee) prevents payroll inclusion
  until resolved (M10 honours the flag).
- Weighting and required-field set are configuration-driven (per employment type).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_profile_completeness` | UPSERT | scores, issues, flag |
| `employees` | UPDATE | cached pct + dq flag |
| `custom_field_definitions` | SELECT | required custom fields |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/completeness` | score + checklist |
| POST | `/api/v1/employees/{id}/completeness:recompute` | force recompute |
| GET | `/api/v1/completeness/summary?orgUnit=` | org rollup |

**UI Behavior Notes:** Completeness ring + checklist with deep links to the relevant section; DQ issue
badges; org dashboard tiles; "fix now" CTAs.

**Edge Cases:** config weighting change (recompute all); custom required field added (flags many);
conflicting cross-field rule; separated employees excluded from active rollups.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `CompletenessRing`, `ChecklistPanel` with deep links, DQ badges, org dashboard feed. |
| Backend-Service Flow | `CompletenessEngine.compute(employee)` applies weighting + DQ rule set → UPSERT snapshot + update cached fields; triggered by domain events and nightly batch. |
| Data Operations | UPSERT completeness; UPDATE employees cache; read config + custom defs; emit M14 feed. |
| Validation Logic | Required-set per employment type; format/cross-field DQ rules; threshold→flag mapping. |
| Authorization Logic | Self sees own; HR sees scope; recompute = HR/Admin or system. |
| State Changes & Side Effects | DQ flag changes (may BLOCK payroll); nudge notifications; M14 metrics. |
| Failure Handling | Engine error→retain prior snapshot + alert; config invalid→reject. |
| Dependencies & Reuse | Triggered by all write FRs; consumed by M10 (block), M14 (metrics); notification. |
| Test Guidance | Unit: scoring + DQ rules + thresholds. Integration: event-driven recompute; BLOCKED→payroll exclusion. E2E: checklist deep links, ring updates after edit. |

---

### FR-EPM-015 — Duplicate Detection & Deduplication

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (resolve/merge)
- **User Story:** *As an HR Admin, I want the system to detect and let me merge duplicate employee
  records, so that there is exactly one golden record per person.*

**Description:** Runs deterministic + probabilistic matching (exact PAN/Aadhaar; fuzzy name+DOB+contact)
at create time, on identity writes, and as a batch sweep; queues `dedup_candidates`; provides a guided
merge that consolidates satellites, repoints references, and retires the losing record (soft-deleted,
audited, reversible within a window).

**Acceptance Criteria:**
1. Exact statutory-ID match → HIGH score (≥ 90); fuzzy composite → scored 0–100 with matched attributes.
2. HIGH match at create blocks auto-create and routes to review (FR-001 AC3).
3. Merge consolidates all satellites under the surviving `employee_id`, repoints FKs, and soft-deletes
   the loser; the operation is transactional and audited.
4. Merge is reversible within a configurable window (default 7 days) via stored merge snapshot.
5. Dismissed candidates are not re-raised for the same pair unless attributes change.
6. Service events for merge are emitted to M12.

**Business Rules:**
- Only HR Admin may execute a merge; maker ≠ checker if four-eyes configured.
- Merging may not combine records with conflicting ACTIVE statutory states without explicit override.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `dedup_candidates` | CRUD | score, attributes, status |
| `employees` + satellites | UPDATE/MOVE | repoint to survivor; soft-delete loser |
| `service_register_events` (M12) | INSERT | RECORDS_MERGED |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/dedup/scan` | run batch detection |
| GET | `/api/v1/dedup/candidates` | review queue |
| POST | `/api/v1/dedup/candidates/{id}:merge` | merge (keep A or B) |
| POST | `/api/v1/dedup/candidates/{id}:dismiss` | not a duplicate |
| POST | `/api/v1/dedup/merges/{mergeId}:undo` | reverse within window |

**UI Behavior Notes:** Side-by-side comparison of the two records with field-level "keep" selectors;
match-score and matched-attributes display; merge preview; undo banner during the reversal window.

**Edge Cases:** three-way duplicates (resolve pairwise); merge with conflicting bank/nominee data
(field-level choose); undo after dependent module already consumed survivor; dismissed pair re-matching.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `DedupQueue`, `MergeCompareView` (side-by-side field selectors), merge preview, undo banner. |
| Backend-Service Flow | `DedupEngine.match()` (deterministic+fuzzy) → upsert candidates; `MergeService.merge(survivor, loser, picks)` in tx: move satellites, repoint FKs, soft-delete loser, snapshot for undo, emit RECORDS_MERGED. |
| Data Operations | CRUD candidates; bulk UPDATE FKs across satellites + dependent modules' references; soft-delete; snapshot store; audit. |
| Validation Logic | Score thresholds; conflicting-state guard; field-pick completeness; dismissed-pair suppression. |
| Authorization Logic | HR Admin merge; optional 4-eyes; auditor read. |
| State Changes & Side Effects | Loser retired; survivor enriched; RECORDS_MERGED SR event; downstream references updated; undo snapshot. |
| Failure Handling | Partial merge→full rollback; conflicting active states→409 MERGE_CONFLICT (override path); undo after window→409 UNDO_EXPIRED. |
| Dependencies & Reuse | Used by FR-001, FR-007; M12 producer; reference-repoint across modules; audit. |
| Test Guidance | Unit: scoring, threshold gating. Integration: transactional merge + FK repoint + undo restore. E2E: review→merge→undo. |

---

### FR-EPM-016 — Employee Self-Service Profile Read View

- **Module:** M01-EPM
- **Primary Role(s):** Employee (Self-Service)
- **User Story:** *As an employee, I want to view my own complete profile and request corrections, so
  that I can confirm my data is accurate and initiate fixes.*

**Description:** A self-service, read-only projection of the employee's own 360° profile honouring
`is_self_visible` policies, with "request change" actions that create M02 edit requests (no direct
writes), download-my-data (DPDP), and completeness checklist.

**Acceptance Criteria:**
1. The employee sees their own data per self-visibility policies (some fields self-hidden by config).
2. All edit affordances create an M02 request; the self-service view never writes master data directly.
3. The employee can download a machine-readable copy of their own profile (DPDP data-portability).
4. Completeness checklist with deep links is shown.
5. Pending M02 requests are visible with status.

**Business Rules:**
- Self-service is restricted to the authenticated employee's own `employee_id` (strict row scope).
- Sensitive fields may be self-hidden per policy (e.g., internal DQ flags).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` + satellites | SELECT (self) | self-visible projection |
| `workflow_instances` (M02) | SELECT/INSERT | pending requests / new requests |
| `audit_log` | INSERT | self read + export |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me/profile` | own 360° (self-visible) |
| POST | `/api/v1/me/change-requests` | create M02 edit request |
| GET | `/api/v1/me/profile/export` | DPDP data export |
| GET | `/api/v1/me/change-requests` | track requests |

**UI Behavior Notes:** Clean read-only profile with "request change" buttons per editable field; pending
request chips; export button; completeness ring; mobile-first responsive layout.

**Edge Cases:** employee with no login (cannot access); self-hidden field; export of a large profile;
attempting to view another employee (hard 403).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `MyProfile` (read-only), request-change buttons, pending chips, export action, completeness ring. |
| Backend-Service Flow | `SelfServiceController` binds to token's employee_id; reads via FieldAccessResolver with isSelf=true; change-request delegates to M02; export builds portable JSON. |
| Data Operations | SELECT self projection; INSERT M02 request; audit self read/export. |
| Validation Logic | Strict self-scope; self-visibility resolution; export rate-limit. |
| Authorization Logic | Token employee_id must equal target; any mismatch→403; no write paths. |
| State Changes & Side Effects | M02 requests created; export logged; no master mutation. |
| Failure Handling | No login→403; cross-employee→403; export throttle→429. |
| Dependencies & Reuse | FR-013 (field access), M02 workflow, FR-014 (completeness), audit. |
| Test Guidance | Unit: self-scope binding. Security: cannot read others. Integration: change-request→M02. E2E: view→request→track; export. |

---

### FR-EPM-017 — Bulk Import & Data Migration

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (commit), HR Officer (staging), System Admin
- **User Story:** *As an HR Admin, I want to import thousands of legacy employee records with validation,
  dedup, and a controlled commit, so that migration is accurate, auditable, and reversible.*

**Description:** A two-phase (validate → commit) bulk importer: upload a templated file (stored in M13),
parse to `import_staging_rows`, run full field validation + dedup matching, present an error/preview
report, then commit valid rows transactionally creating employees + satellites + initial assignments,
with rollback and a `PROFILE_CREATED` SR event per record.

**Acceptance Criteria:**
1. Upload accepts the versioned template (CSV/XLSX); file stored in M13; batch record created.
2. Validation runs all field rules + dedup; each row marked VALID/ERROR with field-level messages.
3. A downloadable error report lists every failed row with reasons; valid rows can be committed
   independently of errored rows.
4. Commit is idempotent per batch and transactional per chunk; partial failures roll back the chunk.
5. Dedup matches during import route to candidate review, not silent duplicate creation.
6. Each committed record emits a `PROFILE_CREATED` SR event and computes completeness.
7. The whole batch is reversible (ROLLED_BACK) within a configurable window if not yet consumed.

**Business Rules:**
- Migrated records carry `source_system`/`legacy_id` for cross-reference.
- Template version mismatch blocks the import with a clear message.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_import_batches` | CRUD | status, counts |
| `import_staging_rows` | CRUD | raw_payload, validation |
| `employees` + satellites | INSERT (commit) | created records |
| `service_register_events` (M12) | INSERT | PROFILE_CREATED per row |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/imports` | upload file → create batch |
| POST | `/api/v1/imports/{batchId}:validate` | run validation |
| GET | `/api/v1/imports/{batchId}/errors` | error report |
| POST | `/api/v1/imports/{batchId}:commit` | commit valid rows |
| POST | `/api/v1/imports/{batchId}:rollback` | reverse within window |

**UI Behavior Notes:** Upload screen with template download; validation progress; results grid
(valid/error filters) with inline error reasons; commit confirmation with counts; rollback action.

**Edge Cases:** template mismatch; huge file (chunked async processing); mixed valid/error rows;
dedup hits during import; re-upload of same file (idempotency); rollback after downstream consumption.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `ImportWizard`, template download, validation progress, results grid (filterable), commit + rollback actions. |
| Backend-Service Flow | Upload→M13→create batch; async `ImportValidator` parses→staging→validate+dedup; `ImportCommitter` chunks valid rows in tx creating employee graph + outbox SR events; rollback reverses uncommitted-downstream batch. |
| Data Operations | INSERT batch/staging; bulk INSERT employees + satellites + assignments; outbox events; audit; rollback soft-deletes. |
| Validation Logic | Template version; all field rules; dedup; chunk idempotency keys. |
| Authorization Logic | HR Officer stages; HR Admin/System Admin commits; org-scope on created records. |
| State Changes & Side Effects | Batch lifecycle states; employees created; SR events; completeness computed; reversible window. |
| Failure Handling | Template mismatch→400; chunk failure→chunk rollback + report; commit replay→idempotent skip; rollback expired→409. |
| Dependencies & Reuse | M13 (file), dedup engine (FR-015), completeness (FR-014), M12 producer, async job runner, audit. |
| Test Guidance | Unit: validators, idempotency keys. Integration: chunk tx + rollback; dedup routing. E2E: upload→validate→fix→commit→rollback. |

---

### FR-EPM-018 — Profile Lifecycle: Deactivation & Reactivation on Separation

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (approve), HR Officer (initiate), Dept Head / SR Custodian
- **User Story:** *As an HR Admin, I want to deactivate a profile on separation and, where lawful,
  reactivate on rehire, so that access, payroll, and the service register reflect the true state.*

**Description:** Manages `employment_status` transitions on separation (RETIRED/RESIGNED/TERMINATED/
DECEASED), closing the current job assignment, setting `separation_date`/`reason`, triggering
de-provisioning of the linked `users` login, emitting a `SEPARATION` SR event to M12, and supporting
controlled reactivation (rehire) that creates a new assignment while preserving history.

**Acceptance Criteria:**
1. Separation sets `employment_status` + `separation_date` + `separation_reason`, closes the current
   assignment (`effective_to` = separation_date), and is approved (maker ≠ checker).
2. The linked login is disabled (de-provisioned) on separation; self-service access ends.
3. A `SEPARATION` (and for DECEASED a `DEATH`) service event is emitted to M12.
4. Post-separation, profile becomes read-only except HR-Admin corrections (with reason).
5. Reactivation (rehire) creates a new current assignment (reason `HIRE`), restores controlled access,
   and emits a `REACTIVATION`/`PROFILE_REACTIVATED` SR event; prior history is retained.
6. Bank edits post-separation are restricted to pension-disbursement context (per FR-008).

**Business Rules:**
- DECEASED separations trigger nominee/pension workflows downstream (M11) and lock self-service.
- Separation requires no open blocking obligations unless override (configurable).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` | UPDATE | status, separation_date/reason |
| `employee_job_assignments` | UPDATE | close current |
| `users` | UPDATE | disable login |
| `service_register_events` (M12) | INSERT | SEPARATION/REACTIVATION |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}:separate` | initiate separation |
| POST | `/api/v1/employees/{id}/separation:approve` | approve (maker≠checker) |
| POST | `/api/v1/employees/{id}:reactivate` | rehire / reactivate |

**UI Behavior Notes:** Separation form with reason, date, checklist of obligations; approval step;
status badge changes to RETIRED/etc.; reactivation form gated by role; post-separation read-only
watermark.

**Edge Cases:** separation with open dues; back-dated separation; deceased with pending self requests;
reactivation of a TERMINATED record (policy-gated); double separation attempt.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `SeparationForm`, obligation checklist, approval panel, status badge, reactivation form, read-only watermark. |
| Backend-Service Flow | `LifecycleService.separate()` → validate → maker step (PENDING) → checker approves → tx{ update status, close assignment, disable user, outbox SEPARATION } ; `reactivate()` creates new assignment + restores access + event. |
| Data Operations | UPDATE employees + assignment; UPDATE users; outbox SR events; audit; downstream triggers (M11 for pension/death). |
| Validation Logic | Valid status transition (state machine §10); maker≠checker; obligation/override checks; reactivation policy. |
| Authorization Logic | HR Officer initiate; HR Admin/Dept Head approve; SR Custodian for SR effect; SoD enforced. |
| State Changes & Side Effects | Status transition; login disabled; SR event; self-service ends; pension/death downstream; read-only mode. |
| Failure Handling | Invalid transition→409 INVALID_STATE; maker=checker→403 SOD; open dues w/o override→409 BLOCKING_OBLIGATIONS. |
| Dependencies & Reuse | State machine (§10), M12 producer, user provisioning, M11 (pension/death), audit. |
| Test Guidance | Unit: transition guards. Integration: separation tx (status+assignment+login+event) atomic; reactivation history retention. E2E: separate→approve→read-only; rehire. |

---

### FR-EPM-019 — Employee Master Consumption API (Single Source of Truth)

- **Module:** M01-EPM
- **Primary Role(s):** Service principals of M02–M14 (machine), Auditor (RO)
- **User Story:** *As a developer of another module, I want a stable, access-controlled API to read
  employee master data, so that every module consumes one golden source and never copies it.*

**Description:** The canonical read contract other modules use: single-employee fetch, batch fetch,
search/list (paginated, filtered), org-scoped projections, field-access-masked responses, point-in-time
reads, and a change-feed/webhook so consumers can react to master changes (e.g., M10 to a bank change).
This is the contract dependent agents build against first.

**Acceptance Criteria:**
1. Single, batch, and search endpoints return policy-masked projections scoped to the caller's
   permissions; tokens never returned.
2. All list/search endpoints are paginated (max page size 100) and filterable (org_unit, status, cadre,
   designation, updated-since).
3. A change feed (`/employees/changes?since=`) and/or webhook publishes master-change events
   (CREATED/UPDATED/PLACEMENT_CHANGED/SEPARATED) for downstream sync.
4. Point-in-time read (`as-of`) is exposed for pension/audit consumers.
5. Responses include `etag`/`updated_at` for consumer caching with conditional GET.
6. The contract is versioned under `/api/v1` and changes are backward-compatible within the major.

**Business Rules:**
- Machine principals are RBAC-scoped exactly like users; no super-read bypass.
- Consumers must not persist PII beyond TTL-bounded caches (build-instruction §4.3).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` + satellites | SELECT | masked projection |
| `field_access_policies` | SELECT | masking |
| `audit_log` | INSERT | consumer reads (sampled/restricted) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}` | single (masked) |
| POST | `/api/v1/employees:batch` | batch by ids |
| GET | `/api/v1/employees?org_unit=&status=&updated_since=&page=&limit=` | search/list |
| GET | `/api/v1/employees/changes?since=` | change feed |
| GET | `/api/v1/employees/{id}/as-of?date=` | point-in-time |

**UI Behavior Notes:** API-only (no UI); a developer portal / OpenAPI doc page describes the contract,
masking behaviour, pagination, and the change feed.

**Edge Cases:** large batch (cap size); consumer over-broad scope (filtered down); stale etag
(conditional 304); change feed gap (cursor resume); deleted/merged employee (tombstone in feed).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | No UI; OpenAPI spec + developer docs; SDK client optional. |
| Backend-Service Flow | `EmployeeReadApi` applies caller scope + FieldAccessResolver to every projection; search uses indexed filters + cursor pagination; change feed reads outbox/event log since cursor. |
| Data Operations | Indexed SELECTs; masked projection; outbox/event read for feed; conditional GET via etag. |
| Validation Logic | Filter param validation; batch size cap (≤100); cursor validity; as-of bounds. |
| Authorization Logic | Machine principal RBAC + org scope identical to users; field masking always applied; no bypass. |
| State Changes & Side Effects | None (reads); sampled restricted-read audit. |
| Failure Handling | Bad filter→400; oversize batch→400 BATCH_TOO_LARGE; forbidden scope→filtered/403; stale etag→304; feed cursor invalid→400. |
| Dependencies & Reuse | FR-013 (masking), FR-011 (as-of), outbox/event infra; consumed by M02–M14. |
| Test Guidance | Contract tests per consumer; pagination + filter correctness; masking per principal; change-feed resume; conditional GET. |

---

## 7. UI Requirements

| UI area | Requirement |
|---|---|
| Global shell | Responsive (mobile-first), collapsible sidebar, breadcrumb, global search (by name/service_no, scoped), dark-mode, WCAG 2.1 AA, i18n (English + local language), keyboard navigation, focus management. |
| Employee directory | Paginated, filterable list (org_unit, cadre, designation, status); columns: photo, name, service_no, designation, org unit, status; row → 360° view; export (logged). Empty/loading/error states. |
| 360° profile | Sticky header (photo, name, service_no, designation, org, status badge, completeness ring); left-rail section nav; lazy-loaded section panels; masked-field component with reveal-with-reason; read-only for unauthorised edits. |
| Create wizard | Multi-step stepper with per-step validation, save-draft, inline dedup warning, review summary. |
| Section editors | Cards/tables with add/edit modals; primary toggles; verification badges; effective-date pickers; self-service "request change" routing to M02. |
| Org chart | Interactive zoom/pan/collapsible tree; vacancy heatmap; drag-to-reassign with confirmation; position detail drawer. |
| Point-in-time | As-of date picker/slider re-rendering the profile; change timeline with reason/source chips. |
| Config screens | Section/custom-field builder (drag-order, type picker, validation builder, PII toggle); field-access policy matrix editor with effective-policy preview. |
| Dedup | Side-by-side compare with field-level keep selectors; match-score display; merge preview; undo banner. |
| Import | Upload with template download; validation progress; results grid with error filters; commit/rollback. |
| Self-service | Read-only "My Profile", request-change buttons, pending-request chips, data export, completeness checklist. |
| States | Every screen defines empty, loading (skeleton), error, success, permission-denied, and offline-degraded states with real content (no placeholder skeleton-only UI). |
| Feedback | Toasts for success/error; confirmation modals for destructive/sensitive actions; inline field validation. |

---

## 8. API & Integration

### 8.1 Canonical Error Envelope (inherited)

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "PAN format is invalid", "field": "pan" },
  "requestId": "req-7f3a2c9e-..."
}
```

### 8.2 HTTP / Error-Code Catalog

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | field/schema validation failure |
| `AUTH_REQUIRED` | 401 | missing/invalid token |
| `FORBIDDEN` | 403 | role/scope/field access denied; SoD violation |
| `NOT_FOUND` | 404 | employee/entity not found or out of scope |
| `CONFLICT` | 409 | invariant/state conflict (generic) |
| `RATE_LIMITED` | 429 | throttle (e.g., export) |
| `INTERNAL_ERROR` | 500 | unexpected server error |
| `UPSTREAM_UNAVAILABLE` | 503 | M13/M12/notification dependency down |
| `DUPLICATE_CANDIDATE` | 409 | dedup HIGH match blocks create |
| `PRIMARY_REQUIRED` | 409 | removing the only primary contact/account |
| `SHARE_SUM_INVALID` | 409 | nominee shares per benefit ≠ 100 |
| `INVALID_ID` | 400 | statutory ID checksum/format failure |
| `SOD_VIOLATION` | 403 | maker = checker on 4-eyes action |
| `OVER_STRENGTH` | 409 | placement exceeds sanctioned strength |
| `POSITION_INACTIVE` | 409 | placement into FROZEN/ABOLISHED position |
| `INVALID_STATE` | 409 | illegal employment-status transition |
| `BLOCKING_OBLIGATIONS` | 409 | separation blocked by open dues |
| `TYPE_LOCKED` | 409 | custom-field type change with existing data |
| `REASON_REQUIRED` | 400 | break-glass reveal without reason |
| `MERGE_CONFLICT` | 409 | merge of conflicting active states |
| `UNDO_EXPIRED` | 409 | merge/import rollback past window |
| `BATCH_TOO_LARGE` | 400 | batch read/import chunk exceeds cap |
| `IMMUTABLE_VERIFIED` | 403 | editing a verified record without Admin |
| `OUT_OF_RANGE` | 400 | as-of date before DOJ / beyond retention |

### 8.3 JSON Examples (complex endpoints)

**(a) Create employee — `POST /api/v1/employees`**

Request:
```json
{
  "salutation": "MS",
  "first_name": "Anita",
  "last_name": "Sharma",
  "dob": "1985-03-12",
  "gender": "FEMALE",
  "date_of_joining": "2010-06-01",
  "employment_type": "PERMANENT",
  "designation_id": "desig-201",
  "org_unit_id": "org-10",
  "position_id": "pos-201",
  "cadre": "CADRE_A",
  "appointing_authority_ref": "GO-2010-4456",
  "pan": "ABCPS1234K"
}
```
Response `201`:
```json
{
  "employee_id": "11111111-1111-1111-1111-111111110001",
  "service_no": "GOV-0001",
  "employment_status": "ACTIVE",
  "current_assignment_id": "ja-0001",
  "profile_completeness_pct": 62.00,
  "data_quality_flag": "REVIEW",
  "sr_event_id": "sre-90001",
  "requestId": "req-7f3a..."
}
```
Dedup-block `409`:
```json
{ "error": { "code": "DUPLICATE_CANDIDATE", "message": "A likely duplicate exists (score 92.5)", "field": "pan" },
  "candidate": { "candidate_id": "dc-0001", "employee_b_id": "11111111-...-0055", "match_score": 92.5 },
  "requestId": "req-7f3b..." }
```

**(b) 360° profile (masked) — `GET /api/v1/employees/{id}/profile-360`**

Response `200` (caller = Reporting Manager; PAN masked, religion hidden):
```json
{
  "employee": {
    "employee_id": "11111111-...-0001", "service_no": "GOV-0001",
    "first_name": "Anita", "last_name": "Sharma",
    "pan": "ABCPSXXXXK", "religion": null,
    "designation": "Deputy Officer (Finance)", "org_unit": "Finance Wing",
    "employment_status": "ACTIVE", "profile_completeness_pct": 96.0
  },
  "sections": {
    "contacts": [ { "type": "OFFICIAL_EMAIL", "value": "anita.sharma@gov.in", "is_primary": true } ],
    "bank_accounts": [ { "bank_name": "SBI", "account_number_masked": "XXXXXX4567", "is_primary_salary": true } ]
  },
  "_meta": { "masked_fields": ["pan"], "hidden_fields": ["religion"], "etag": "W/\"c-0001-96\"" },
  "requestId": "req-7f3c..."
}
```

**(c) Place / change assignment — `POST /api/v1/employees/{id}/assignments`**

Request:
```json
{ "position_id": "pos-201", "designation_id": "desig-201", "org_unit_id": "org-10",
  "assignment_type": "SUBSTANTIVE", "effective_from": "2018-04-01",
  "change_reason": "PROMOTION", "source_module": "M06", "source_ref_id": "po-2018-77" }
```
Over-strength `409`:
```json
{ "error": { "code": "OVER_STRENGTH", "message": "Position pos-201 sanctioned strength (2) is full",
  "field": "position_id" }, "requestId": "req-7f3d..." }
```

**(d) Break-glass field reveal — `POST /api/v1/employees/{id}/reveal-field`**

Request:
```json
{ "field_path": "employee_bank_accounts.account_number", "bank_account_id": "bk-0001",
  "reason": "Payroll exception investigation, ticket INC-4571" }
```
Response `200`:
```json
{ "field_path": "employee_bank_accounts.account_number", "value": "0001234567",
  "audit_id": "aud-55012", "requestId": "req-7f3e..." }
```
Missing reason `400`:
```json
{ "error": { "code": "REASON_REQUIRED", "message": "A reason is required to reveal this field",
  "field": "reason" }, "requestId": "req-7f3f..." }
```

**(e) Change feed — `GET /api/v1/employees/changes?since=2026-06-30T00:00:00Z`**

Response `200`:
```json
{ "changes": [
    { "employee_id": "11111111-...-0001", "type": "PLACEMENT_CHANGED", "at": "2026-06-30T05:12:00Z", "version": 14 },
    { "employee_id": "11111111-...-0070", "type": "RECORDS_MERGED", "at": "2026-06-30T05:40:00Z", "tombstone": true }
  ],
  "next_cursor": "2026-06-30T05:40:00Z#dc-0003",
  "requestId": "req-7f40..." }
```

### 8.4 Integration Points

| Integration | Direction | Mechanism |
|---|---|---|
| M13 Document Mgmt | M01 → M13 | upload binary, store `document_id`; resolve URLs |
| M12 Digital SR | M01 → M12 | service events via shared producer (outbox) |
| M02 Edit Workflow | M02 → M01 | approved edits commit via `PATCH /employees/{id}:commit` |
| M10/M11 Payroll/Pension | M01 → them | consumption API (bank, attrs); honours DQ BLOCKED flag |
| M05/M06 Transfer/Promotion | them → M01 | create assignments via assignment API |
| M14 Analytics | M01 → M14 | consumption API + completeness summary feed |
| Notification platform | M01 → users | OTP, expiry alerts, change notices |
| OIDC/SSO + MFA | platform | authentication for all surfaces |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 single-profile read < 500 ms; 360° assembly < 800 ms P95; search list < 700 ms P95; import validation ≥ 5,000 rows/min. |
| Scalability | Horizontal stateless API; supports ≥ 500k employee records; change feed handles ≥ 14 consumer modules. |
| Availability | 99.9% uptime; graceful degradation when M13/M12 down (queue events, defer doc ops). |
| DR | RPO ≤ 15 min; RTO ≤ 4 h; PITR-capable PostgreSQL; outbox ensures no lost SR events. |
| Security | OWASP ASVS L2; TLS 1.2+; field-level PII masking server-side; statutory IDs/bank numbers tokenised via KMS; no raw tokens in logs/responses; least-privilege RBAC + org row-scoping. |
| Privacy / DPDP | Purpose limitation, data minimisation, consent/notice where applicable, data-subject export (FR-016), break-glass logging, configurable retention & erasure (post-retention) workflows. |
| Auditability | Every write + restricted read in immutable `audit_log`; tamper-evident (hash chaining recommended). |
| Accessibility | WCAG 2.1 AA; keyboard operable; screen-reader labels; colour-contrast compliant. |
| i18n / locale | UTC storage, locale display; dates `DD-MMM-YYYY`; INR default; English + local language. |
| Observability | Structured logs (no PII), metrics, traces with `requestId`; alerting on error-rate/latency SLO breach. |
| Compliance | Retention per statutory schedule; segregation of duties enforced; access reviews supported. |
| Data integrity | All multi-step writes transactional; effective-dating exclusion constraints; FK enforcement; soft delete. |

---

## 10. Workflow & State Diagrams

### 10.1 `employment_status` state machine

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create on hire | ACTIVE | FR-001 validations pass |
| ACTIVE | leave sanctioned (M03) | ON_LEAVE | approved long leave |
| ON_LEAVE | rejoin | ACTIVE | leave ended |
| ACTIVE | suspension (M09) | SUSPENDED | disciplinary order |
| SUSPENDED | revoke / reinstate | ACTIVE | order revoked |
| ACTIVE/ON_LEAVE | transfer out (M05) | TRANSFERRED | relieving complete |
| TRANSFERRED | join at destination | ACTIVE | joining recorded |
| ACTIVE/SUSPENDED | separate (retire) | RETIRED | FR-018 approved |
| ACTIVE | separate (resign) | RESIGNED | FR-018 approved |
| ACTIVE/SUSPENDED | terminate | TERMINATED | FR-018 + disciplinary |
| any | death recorded | DECEASED | FR-018, locks self-service |
| RETIRED/RESIGNED | rehire | ACTIVE | reactivation policy permits |
| TERMINATED/DECEASED | — | (terminal) | no reactivation (policy-gated) |

### 10.2 Bank-account 4-eyes state machine

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create | PENDING_APPROVAL | maker submits |
| PENDING_APPROVAL | approve | ACTIVE | checker ≠ maker |
| PENDING_APPROVAL | reject | REJECTED | checker decision |
| ACTIVE | verify | ACTIVE+verified | penny-drop/manual |
| ACTIVE | replace (new primary) | demoted | new primary approved |

### 10.3 Dedup candidate state machine

| From | Event | To |
|---|---|---|
| (detected) | queue | OPEN |
| OPEN | merge | MERGED |
| OPEN | dismiss | DISMISSED |
| MERGED | undo (in window) | OPEN |

### 10.4 Import batch state machine

| From | Event | To |
|---|---|---|
| (upload) | create | UPLOADED |
| UPLOADED | validate | VALIDATING → VALIDATED |
| VALIDATED | commit | COMMITTING → COMMITTED |
| any | error | FAILED |
| COMMITTED | rollback (in window) | ROLLED_BACK |

### 10.5 Photo approval state machine

| From | Event | To |
|---|---|---|
| (upload) | self/HR upload | PENDING |
| PENDING | approve | APPROVED (→ primary) |
| PENDING | reject | REJECTED |

---

## 11. Notification & Communication Requirements

| Event | Recipient(s) | Channel | Template key |
|---|---|---|---|
| Profile created on hire | New employee, HR, manager | Email + in-app | `EPM_PROFILE_CREATED` |
| Contact/email OTP verification | Employee | SMS/Email | `EPM_CONTACT_OTP` |
| Identity document expiring (90/30/7d) | Employee, HR | Email + in-app | `EPM_ID_EXPIRY` |
| Bank detail changed | Employee | Email + SMS | `EPM_BANK_CHANGED` |
| Bank change pending approval | Approver | In-app | `EPM_BANK_APPROVAL` |
| Profile completeness nudge | Employee | In-app + Email | `EPM_COMPLETENESS_NUDGE` |
| Data-quality BLOCKED flag set | HR Officer | In-app | `EPM_DQ_BLOCKED` |
| Dedup candidate raised | HR Admin | In-app | `EPM_DEDUP_CANDIDATE` |
| Separation approved | Employee, HR, payroll | Email + in-app | `EPM_SEPARATION` |
| Import completed/failed | Initiator, HR Admin | In-app + Email | `EPM_IMPORT_RESULT` |
| Break-glass field reveal | Privacy officer (digest) | Email digest | `EPM_BREAK_GLASS` |

All notifications written to the shared `notifications` ledger; no PII values in notification bodies
(reference, not content); respect user locale and channel preferences.

---

## 12. Reporting & Analytics

| Report / metric | Description | Consumer |
|---|---|---|
| Headcount by org/cadre/designation/status | Live counts with drill-down | M14, HR |
| Profile completeness distribution | % at score bands per org unit | M14, HR |
| Data-quality issue register | Open DQ issues by type/severity | HR Admin |
| Vacancy report | Sanctioned vs filled per position/org | HR Admin, Dept Head |
| Statutory ID expiry pipeline | Documents expiring in 90 days | HR |
| Duplicate-record register | Open/merged/dismissed candidates | HR Admin |
| Demographic & diversity (aggregated) | Gender/category/PwD aggregates (no row-level PII) | Leadership, compliance |
| Migration reconciliation | Imported vs validated vs committed per batch | HR Admin |
| Audit & access report | Restricted-read/break-glass activity | Auditor, privacy officer |
| Tenure & age profile | Service length, retirement-due pipeline | M11, HR |

Analytics are served via the consumption API and a completeness summary feed; all aggregate reports
honour PII minimisation (no special-category row-level export to non-authorised roles).

---

## 13. Migration & Launch Plan

| Phase | Activities | Exit criteria |
|---|---|---|
| 0 — Prep | Confirm template (FR-017), master data (org_units, designations, cadres, pay_scales, positions) loaded; field-access policies seeded; completeness weighting configured. | Reference data verified; policies in place. |
| 1 — Extract & cleanse | Pull legacy records; standardise names; resolve obvious duplicates pre-import. | Cleansed dataset; mapping doc signed off. |
| 2 — Dry-run import | Validate-only passes; review error report; tune validators. | ≥ 99.5% rows VALID after fixes. |
| 3 — Dedup sweep | Run detection; resolve candidates; confirm no silent duplicates. | Duplicate rate < 0.1%. |
| 4 — Commit | Chunked transactional commit; SR events emitted; completeness computed. | Committed counts reconcile; SR events present. |
| 5 — Consumer integration | M02–M14 integrate against consumption API; contract tests pass. | All consumers green on contract tests. |
| 6 — Parallel run | Run alongside legacy; reconcile deltas. | Zero unexplained deltas for 2 cycles. |
| 7 — Cutover & launch | Disable legacy writes; enable self-service; monitor SLOs. | SLOs met; go-live sign-off. |
| 8 — Hypercare | Monitor DQ, completeness, audit; rollback window available. | Stable for hypercare period. |

**Rollback strategy:** import batches reversible within window; outbox guarantees SR-event delivery;
PITR for catastrophic recovery. **Training:** HR/Admin on create/maintain/dedup/import; employees on
self-service and change requests.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 FR → Entities → APIs → Roles Traceability Matrix

| FR | Primary entities | Key APIs | Roles | Consumes/Emits |
|---|---|---|---|---|
| FR-EPM-001 | employees, job_assignments, completeness | POST /employees | HR Off/Admin | dedup, M12 event |
| FR-EPM-002 | all employee_* | GET /profile-360 | HR, Mgr, Auditor, Self | field-access |
| FR-EPM-003 | contacts, addresses | /contacts, /addresses | HR (Self→M02) | notification, M02 |
| FR-EPM-004 | dependents, nominees | /dependents, /nominees | HR (Self→M02) | M13, M12 event |
| FR-EPM-005 | emergency_contacts | /emergency-contacts | HR, Self | audit |
| FR-EPM-006 | education, experience | /education, /experience | HR (Self→M02) | M13, M11 |
| FR-EPM-007 | identity_documents | /identity-docs | HR Admin (Off masked) | KMS, dedup, M13 |
| FR-EPM-008 | bank_accounts | /bank-accounts | HR (4-eyes), Dept Head | workflow, M10/M11 |
| FR-EPM-009 | photos | /photos | HR (Self→approval) | M13 |
| FR-EPM-010 | positions, job_assignments | /positions, /assignments, /org-chart | HR Admin, Dept Head | M05/M06, M12 |
| FR-EPM-011 | job_assignments, addresses | /as-of, /history | HR, Auditor | field-access |
| FR-EPM-012 | profile_sections, custom_field_* | /config/* | System Admin | field-access, completeness |
| FR-EPM-013 | field_access_policies | /config/field-access-policies, /reveal-field | System Admin (all readers) | audit |
| FR-EPM-014 | profile_completeness | /completeness | HR, Self | M10 (block), M14 |
| FR-EPM-015 | dedup_candidates | /dedup/* | HR Admin | M12, all satellites |
| FR-EPM-016 | (read) all + M02 | /me/* | Employee | field-access, M02 |
| FR-EPM-017 | import_batches, staging | /imports/* | HR Admin/Off | dedup, completeness, M12 |
| FR-EPM-018 | employees, job_assignments, users | /:separate, /:reactivate | HR Admin, Dept Head, SR Cust. | M12, M11, users |
| FR-EPM-019 | employees + satellites | /employees, /changes, /batch, /as-of | machine principals, Auditor | field-access, all modules |

### 14.2 Dependency Map

- **Build-first:** FR-019 (consumption API) + FR-013 (field access) + FR-001 (create) — these unblock
  every downstream module and the rest of M01.
- **Internal deps:** FR-002 depends on FR-013; FR-014 depends on all write FRs; FR-015 used by FR-001,
  FR-007, FR-017; FR-011 depends on FR-010; FR-016 depends on FR-013 + M02; FR-018 depends on §10
  state machine + M12.
- **External deps:** M13 (documents/photos), M12 (SR events), M02 (edit approvals), KMS (tokenisation),
  notification platform, OIDC/SSO.

### 14.3 Parallel-Agent Plan

| Agent track | FRs | Can start when |
|---|---|---|
| A — Master core & API | FR-001, FR-019, FR-013 | data model + masters ready |
| B — Satellites I | FR-003, FR-004, FR-005, FR-006 | A's employees table exists |
| C — Sensitive data | FR-007, FR-008, FR-009 | A + KMS + M13 ready |
| D — Position & time | FR-010, FR-011 | A ready |
| E — Quality & dedup | FR-014, FR-015 | B/C partially ready |
| F — Config | FR-012 | A ready |
| G — Self-service & view | FR-002, FR-016 | A + FR-013 ready (M02 stub ok) |
| H — Migration & lifecycle | FR-017, FR-018 | A + dedup (E) ready |

Shared contracts (consumption API shape, error catalog, field-access semantics) are frozen before
parallel tracks begin to avoid drift.

### 14.4 Final Contract Reconciliation Table (0 unresolved gaps)

| Contract item | Defined where | Consumed where | Status |
|---|---|---|---|
| `employees` extended fields | §5.4 E1 | all FRs, M02–M14 | ✅ Resolved |
| 20 M01-owned tables | §5.1 | FRs 001–019 | ✅ Resolved |
| Enum catalog | §5.5 | all FRs / UI | ✅ Resolved |
| Error-code catalog | §8.2 | all FRs | ✅ Resolved |
| Error envelope | §8.1 (Shared §5) | all APIs | ✅ Resolved |
| Field-access semantics | FR-013, §5.4 E17 | FR-002, FR-019, FR-016 | ✅ Resolved |
| Effective-dating rules | §5.6, FR-010/011 | FR-010, FR-011, FR-019 | ✅ Resolved |
| 4-eyes / SoD | §3, FR-008, §10.2 | FR-008, FR-015, FR-018 | ✅ Resolved |
| M02 edit-commit path | §4.3, FR-003/004/006/016 | M02 | ✅ Resolved (referenced, not duplicated) |
| M13 document refs | §4.3, E9/E11 | FR-004/006/007/009/017 | ✅ Resolved |
| M12 SR events | §4.3, §10.1 | FR-001/004/010/015/017/018 | ✅ Resolved |
| Consumption API contract | FR-019, §8.3 | M02–M14 | ✅ Resolved |
| State machines | §10 | FR-008/015/017/018 | ✅ Resolved |
| Completeness/DQ flag | FR-014 | M10 (block), M14 | ✅ Resolved |
| Sample data (every entity) | §5.7 | build/test seed | ✅ Resolved |
| **Unresolved gaps** | — | — | **0** |

---

## 15. Glossary

| Term | Definition |
|---|---|
| Golden record / SSOT | The single authoritative employee record all modules read from (this module). |
| 360° profile | Consolidated view aggregating every profile section for one employee. |
| Effective dating | Storing changes as time-bounded versions so any past/future state is reconstructable. |
| Point-in-time ("as-of") | A reconstruction of data as it was on a specified date. |
| Position | A sanctioned post (org design unit) with strength and reporting edges, distinct from a person. |
| Job assignment | The placement of an employee into a position/designation/org for an effective period. |
| Substantive assignment | The employee's primary/permanent placement (one current at a time). |
| Field-access policy | Per-field, per-role rule (FULL/MASKED/HIDDEN) enforced server-side. |
| Break-glass | A logged, reason-required reveal of a normally masked field. |
| 4-eyes / SoD | Two-person control; maker ≠ checker on sensitive changes. |
| Completeness score | Weighted measure of how fully a profile is populated. |
| Data-quality flag | CLEAN/REVIEW/BLOCKED indicator gating downstream operations. |
| Deduplication | Detecting and merging duplicate person records into one golden record. |
| Outbox pattern | Transactional event emission ensuring SR events are never lost. |
| DPDP Act 2023 | India's Digital Personal Data Protection Act governing PII handling. |
| Digital SR | The statutory Digital Service Register (Module 12). |
| Tokenisation | Replacing a sensitive value (PAN/Aadhaar/account no.) with an encrypted token. |

## 16. Appendices

### Appendix A — `service_no` generation pattern
Configurable pattern, default `GOV-{seq:04}` (zero-padded sequence), with optional org/cadre prefix;
uniqueness enforced; collisions retried server-side.

### Appendix B — Default field-access policy seed (illustrative)

| Field path | Employee(self) | Reporting Mgr | HR Officer | HR Admin | Auditor |
|---|---|---|---|---|---|
| `employees.pan` | FULL | HIDDEN | MASKED | FULL(reason) | MASKED |
| `employees.national_id` (Aadhaar) | MASKED | HIDDEN | MASKED | FULL(reason) | MASKED |
| `employees.religion` | FULL | HIDDEN | HIDDEN | FULL | MASKED |
| `employees.category` | FULL | HIDDEN | MASKED | FULL | MASKED |
| `employee_bank_accounts.account_number` | MASKED | HIDDEN | MASKED | FULL(reason) | MASKED |
| `employee_identity_documents.doc_number` | MASKED | HIDDEN | MASKED | FULL(reason) | MASKED |

### Appendix C — Completeness weighting (default, per employment type configurable)

| Section | Weight |
|---|---|
| Personal (mandatory core) | 25 |
| Contact & address | 15 |
| Job/position placement | 15 |
| Statutory IDs (verified) | 15 |
| Bank (verified primary) | 15 |
| Education/experience | 10 |
| Dependents/nominees/emergency | 5 |

### Appendix D — Import template columns (v1.2, abridged)
`legacy_id, service_no, salutation, first_name, middle_name, last_name, dob, gender, marital_status,
nationality, category, pan, aadhaar(masked-on-load), date_of_joining, employment_type, cadre,
designation_code, org_unit_code, position_code, mobile, official_email, permanent_address_*,
present_address_*, bank_name, ifsc, account_number, account_type, highest_qualification, ...`

### Appendix E — Assumptions & open items
1. Master reference data (org_units, designations, cadres, pay_scales) is loaded/owned outside M01 and
   available at build time. 2. M13/M12/M02/notification/KMS service contracts are available as
   referenced. 3. Biometric capture/matching engine integration details (vault API) are finalised
   during track C build — M01 stores only opaque references. 4. Exact statutory retention periods are
   confirmed with the program's compliance owner before go-live.

---

*End of M01-EPM BRD v1.0 — Final Reconciliation: 0 unresolved gaps.*
