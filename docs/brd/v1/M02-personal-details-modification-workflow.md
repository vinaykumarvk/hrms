# Employee Personal Details Modification Workflow — HRMS Module BRD

**Module code:** M02-EPDM
**Program:** Enterprise HRMS — "PeopleGov / HRMS Suite" (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v1.0
**Status:** Baseline for build (parallel-agent ready)
**Owning systems of record referenced:** M01 (Employee Profile Management — employee master), M12 (Digital Employee Service Register), M13 (Document Management)
**Authoring standard:** Reuses `docs/brd/SHARED_FOUNDATION.md` canonical entities, roles, conventions and technical defaults. Shared elements are referenced, not redefined.

---

## 1. Executive Summary

### 1.1 Purpose

The Employee Personal Details Modification Workflow (M02-EPDM) is the **governed change-control layer** sitting in front of the employee master (M01). It converts ad-hoc, error-prone, paper-and-email driven edits to an employee's personal, demographic, contact, statutory and financial-instruction fields into **auditable, maker-checker-approved, document-backed change requests** with full before/after diff, multi-level routing by field sensitivity, SLA-driven escalation, and statutory posting of approved sensitive changes into the Digital Service Register (M12).

M02 **does not own** the employee data fields themselves — M01 owns them. M02 owns the **request, review, approval, e-signature, effective-dating and commit-back lifecycle** that mutates those fields safely. M02 is the only sanctioned write path for self-service and routine HR-officer edits to governed M01 fields.

### 1.2 Business problem

In the current/legacy public-sector process: employees mail or hand paper forms to HR; clerks key changes directly into the master with no segregation of duties; sensitive changes (name, date of birth, bank account, caste/category, qualification) are altered without consistent documentary proof or senior sign-off; there is no field-level history of *who* changed *what*, *when*, on *whose authority*, and against *which document*; statutory changes are not reliably mirrored into the Service Register; and pending requests stall with no SLA or escalation. This creates audit findings, pension/seniority disputes, payroll mis-credits (wrong bank account), and fraud exposure (silent DOB/name changes).

### 1.3 Solution overview

M02-EPDM delivers:

- **Self-service change requests** — employees (and HR officers on behalf of employees) propose field changes through guided forms scoped to the fields they are allowed to touch.
- **Field-level diff** — every request captures a structured before/after for each field, with reason and effective date.
- **Configurable sensitivity & approval matrix** — each governed field is classified (LOW / MEDIUM / HIGH / STATUTORY); high-sensitivity fields (name, DOB, gender, national ID, bank account, category/caste, marital status affecting benefits) demand documentary proof, optional e-signature and senior/multi-level approval; low-sensitivity fields (alternate phone, correspondence address, emergency contact) take a single light approval or auto-apply per policy.
- **Maker-checker engine** — built on the shared `workflow_instances` / `workflow_tasks` engine, supporting sequential and parallel approvers, recommend-then-sanction chains, and segregation of duties (maker ≠ checker, no self-approval).
- **Supporting-document upload** — documents stored in M13, linked to request items, verified by reviewers.
- **Correction vs. Update distinction & effective-dating** — a *correction* repairs an erroneous historical value (effective from the original date, with retro impact flags); an *update* records a genuine change from a forward effective date.
- **Bulk HR-initiated corrections** — controlled batch correction with per-row validation, dry-run preview and aggregate approval.
- **Rejection + resubmission** — reasoned rejection returns an editable draft preserving history.
- **SLA & escalation** — pending tasks are tracked against configurable SLAs and auto-escalated.
- **Statutory SR posting** — approved STATUTORY-class changes post an append-only event into M12.
- **World-class extensions** — delegation of approval authority, change-request templates, e-signature, parallel/sequential approver topologies, and effective-dated change application.

### 1.4 Scope summary

In scope: the full change-request lifecycle for governed M01 fields. Out of scope: definition/storage of the master fields themselves (M01), the SR ledger internals (M12), the document object store internals (M13), payroll recomputation triggered by an approved bank/salary change (M10 consumes the event), and authentication (shared platform).

### 1.5 Key business outcomes & KPIs

| Outcome | Metric | Target |
|---|---|---|
| Eliminate ungoverned direct edits | % of governed-field mutations flowing through M02 | 100% |
| Documentary integrity on sensitive changes | % HIGH/STATUTORY requests with verified supporting doc | 100% |
| Faster turnaround | Median time from submission to final decision | ≤ 3 business days (LOW), ≤ 7 (HIGH) |
| Reduce stalled requests | % requests breaching SLA without escalation | 0% |
| Audit completeness | % approved changes with full who/what/when/authority/document trail | 100% |
| Statutory mirroring | % approved STATUTORY changes posted to M12 within SLA | 100% |
| Self-service adoption | % requests initiated by employees vs. HR | ≥ 70% within 6 months |

### 1.6 Primary stakeholders

Employees (self-service requesters), Reporting Managers (recommenders for some fields), HR Officers / HR Admin (reviewers/checkers and bulk-correction makers), Department Heads / Appointing Authority (senior approvers for STATUTORY changes), SR Custodian / Registrar (consumes statutory postings via M12), Auditor (read-only oversight), System Administrator (approval-matrix & sensitivity configuration). Personas align 1:1 with the shared RBAC roles in §4 of the Shared Foundation.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Sub-area | What it covers | Primary FRs |
|---|---|---|
| Request authoring | Self-service & HR-on-behalf change request creation, draft, field selection, diff capture | FR-M02-001, FR-M02-014 |
| Sensitivity & routing | Field sensitivity catalog, approval-matrix evaluation, route construction | FR-M02-002, FR-M02-012 |
| Evidence | Supporting-document upload, linkage, verification | FR-M02-003 |
| Approval | Maker-checker, multi-level sequential/parallel, recommend→sanction, decisions | FR-M02-004, FR-M02-013, FR-M02-015 |
| Diff & preview | Field-level before/after, request preview, reviewer comparison view | FR-M02-005 |
| Rejection lifecycle | Reasoned rejection, return-for-correction, resubmission, withdrawal | FR-M02-006 |
| Timeliness | SLA computation, reminders, escalation, reassignment | FR-M02-007 |
| Semantics & timing | Correction vs. update, effective-dating, retro-impact flagging | FR-M02-008 |
| Bulk operations | HR batch corrections, dry-run, per-row validation, aggregate approval | FR-M02-009 |
| Commit & downstream | Apply approved change to M01; post STATUTORY change to M12; notify M10 | FR-M02-010, FR-M02-011 |
| Governance config | Approval-matrix & sensitivity administration, delegation | FR-M02-012, FR-M02-013 |
| History & assurance | Change provenance, field history, audit & reporting | FR-M02-016 |

### 2.2 Common Capabilities (cross-cutting, inherited or module-wide)

- **Maker-checker by default** for any governed-field mutation (per Shared Foundation §3).
- **Field-level audit** to shared `audit_log` on every state transition and every committed field change.
- **Row-level scoping** by `org_unit` — reviewers see only requests within their authority scope.
- **Soft delete + immutable history** — requests are never hard-deleted; superseded items retained.
- **Optimistic concurrency** — every commit to M01 validates the master `updated_at`/version token to prevent stale overwrites.
- **Idempotent commit & posting** — apply-to-master and SR-posting operations are idempotent on `change_request_item_id`.
- **Internationalisation** — UTC storage; `DD-MMM-YYYY` display; INR money formatting; WCAG 2.1 AA UI.
- **Pagination** — all list endpoints paginated, hard max page size 100.

### 2.3 Explicit Boundaries (In / Out)

| Concern | In M02 | Out of M02 (owner) |
|---|---|---|
| Governed-field change lifecycle | ✅ | — |
| Definition/storage of employee master fields | — | M01 |
| Field history *display* sourced from M02 commits | ✅ | Master record source = M01 |
| Statutory SR event *posting* of approved changes | ✅ (writes event) | SR ledger & validation = M12 |
| Document binary storage, versioning, encryption | — | M13 (M02 stores references) |
| Payroll/pension recomputation after bank/category change | — | M10 / M11 (consume event) |
| Authentication, MFA, SSO | — | Shared platform |
| Approval-engine primitives (tasks, routing) | Reuse | Shared `workflow_*` engine |
| Org hierarchy / reporting lines used for routing | Read | M01 / org platform |

### 2.4 Assumptions & Constraints

- M01 exposes a governed-field metadata API (field key, datatype, current value, version) and a transactional `applyFieldChange` endpoint or shared DB transaction boundary. Where M01's commit API is unavailable at build time, M02 writes through a shared service contract documented in §8.
- M12 exposes an idempotent `postServiceRegisterEvent` contract (event_type, employee_id, payload, source_ref).
- M13 exposes upload + reference + virus-scan-status APIs.
- All actors are authenticated via shared OIDC/SSO + MFA; M02 enforces authorization only.
- Statutory retention: change requests and their audit retained per government records schedule (default 7 years post-separation, configurable).

---

## 3. User Roles & Permissions

Roles reuse the Shared Foundation §4 RBAC baseline. M02 adds no new principals; it maps shared roles to module operations. Segregation of duties is enforced: **the maker of a request can never be a checker on the same request, and no actor can approve a request they created or that mutates their own master record.**

### 3.1 Role-to-capability matrix

| Capability | Employee (Self-Service) | Reporting Manager | HR Officer | HR Admin | Dept Head / Appointing Authority | SR Custodian | Auditor | System Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create change request on **own** record | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create request **on behalf of** an employee | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Upload supporting documents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Recommend (intermediate approval) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve LOW/MEDIUM sensitivity | ❌ | ✅ (config) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve HIGH sensitivity | ❌ | ❌ | ✅ (config) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sanction STATUTORY sensitivity | ❌ | ❌ | ❌ | ✅ (config) | ✅ | ❌ | ❌ | ❌ |
| Verify supporting documents | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reject / return for correction | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Withdraw own request | ✅ | ✅ | ✅ (own/initiated) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Initiate bulk corrections | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve bulk correction batch | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Apply e-signature | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configure approval matrix / sensitivity | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage delegation (own outgoing) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (any) |
| View statutory SR posting status | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read all requests + audit (no write) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (config only) |
| View own request status/history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Notes: "(config)" = governed by the configurable approval matrix (FR-M02-012), so the effective approver per sensitivity tier is data-driven, not hard-coded. "(scope)" = limited to the actor's `org_unit` row-level scope. System Admin has **no transactional self-approval** capability by design (Shared Foundation §4).

### 3.2 Authorization principles

1. **Ownership check** — a self-service requester may only target their own `employee_id`.
2. **Scope check** — HR/manager/authority actions are bounded to their `org_unit` subtree.
3. **Sensitivity gate** — the minimum required approver role is derived from the field's sensitivity class via the approval matrix.
4. **SoD invariant** — `request.created_by != approval.actor_id` and `approval.actor_id != request.target_employee.user_id` at every approval node.
5. **Delegation** — an approver's authority may be temporarily delegated (FR-M02-013); delegate inherits scope but the audit records both delegate and delegator.

---

## 4. Shared Application Foundation & Cross-Agent Build Instructions

This module inherits, without redefinition, the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`). Build agents MUST consume the shared contracts rather than re-create them.

### 4.1 Inherited technical defaults

- **Frontend:** React + TypeScript, Tailwind + shadcn/ui; no skeleton UI — real fields, data, states.
- **Backend:** REST under `/api/v1`; Node/TypeScript or Java Spring; PostgreSQL primary store; object storage (M13) for documents.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level org scoping. M02 enforces authZ only.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503), plus M02-specific (§8).
- **Security/compliance:** OWASP ASVS, TLS 1.2+ in transit, encryption at rest, full audit trail, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500 ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min; RTO ≤ 4 h.

### 4.2 Shared entities consumed (NOT redefined here)

| Shared entity | Owner | How M02 uses it |
|---|---|---|
| `employees` | M01 | Read current field values + version; commit approved changes via M01 contract. |
| `users` | Platform | Identity of requesters/approvers/delegates. |
| `roles` / `permissions` | Platform | Authorization checks, approval-matrix role keys. |
| `org_units` | Platform/M01 | Row-level scope, route construction by hierarchy. |
| `documents` | M13 | Store references to supporting documents; read scan/verify status. |
| `workflow_instances` / `workflow_tasks` | Shared engine | Underlying maker-checker routing, task assignment, SLA timers. |
| `service_register_events` | M12 | Append statutory change events on approval (idempotent). |
| `notifications` | Platform | Outbound emails/SMS/in-app for each lifecycle event. |
| `audit_log` | Platform | Immutable record of every transition and committed field change. |

### 4.3 Cross-agent build instructions

1. **Do not duplicate M01 field storage.** Treat the employee master as authoritative; capture only proposed values in `change_request_items` until commit.
2. **Use the shared workflow engine** for routing. M02 maps each request to one `workflow_instance`; each approval node is a `workflow_task`. M02-specific approval semantics (sensitivity, e-sign) are stored in `change_request_approvals` keyed to the workflow task.
3. **Idempotency keys:** apply-to-master uses `change_request_item_id`; SR posting uses `change_request_item_id + 'SR'`. Re-runs must be no-ops.
4. **Transaction boundary:** committing an approved request that touches multiple fields must apply all items atomically (all-or-nothing) within a single DB transaction spanning M02 and M01 writes; if M01 is a separate service, use the documented saga/outbox pattern (§10.4).
5. **Configuration is data, not code:** sensitivity classes and approval routes live in `field_sensitivity_catalog` and `approval_matrix_*` tables; never hard-code field→approver mappings.
6. **Every write path emits an audit row and (where applicable) a notification.** No silent state changes.
7. **PII discipline:** never log raw old/new values for HIGH/STATUTORY fields (e.g., bank account, national ID) in application logs; store them only in the encrypted `change_request_items` columns. Mask in UI per role.

---

## 5. Holistic Data Model

### 5.1 Entity inventory

**Module-owned entities (M02):**

| # | Entity | Purpose | Ledger? |
|---|---|---|---|
| E1 | `change_requests` | Header for a personal-details change request | No (soft-delete) |
| E2 | `change_request_items` | Per-field before/after diff lines within a request | No (soft-delete) |
| E3 | `change_request_documents` | Links request items to M13 documents (evidence) | No |
| E4 | `change_request_approvals` | Per-node approval decisions (maker-checker results) | Append-only |
| E5 | `field_sensitivity_catalog` | Classifies each governed M01 field & evidence/e-sign rules | No (versioned) |
| E6 | `approval_matrix_config` | Named, versioned approval-matrix definitions | No (versioned) |
| E7 | `approval_matrix_rules` | Per (sensitivity × scope) approval route definitions | No (versioned) |
| E8 | `delegations` | Temporary delegation of approval authority | No (soft-delete) |
| E9 | `change_request_templates` | Reusable pre-filled request templates | No (soft-delete) |
| E10 | `esignatures` | Captured e-signatures on approval actions | Append-only |
| E11 | `cr_sla_events` | SLA milestones, reminders, escalations per request/task | Append-only |
| E12 | `bulk_correction_batches` | Header for HR-initiated bulk correction jobs | No (soft-delete) |

**Shared entities referenced (owned elsewhere — see §4.2):** `employees`, `users`, `roles`, `org_units`, `documents`, `workflow_instances`, `workflow_tasks`, `service_register_events`, `notifications`, `audit_log`.

### 5.2 Full field tables

#### E1 — `change_requests`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_id` | UUID (PK) | N | gen | |
| `cr_number` | VARCHAR(24) UNIQUE | N | seq | Human key, e.g. `CR-2026-000123` |
| `target_employee_id` | UUID (FK→employees) | N | | Whose record is changed |
| `requested_by` | UUID (FK→users) | N | | Maker (self or HR-on-behalf) |
| `request_origin` | ENUM | N | `SELF_SERVICE` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK` |
| `change_type` | ENUM | N | `UPDATE` | `UPDATE`, `CORRECTION` |
| `highest_sensitivity` | ENUM | N | computed | Max sensitivity across items (LOW…STATUTORY) |
| `status` | ENUM | N | `DRAFT` | See §10 state table |
| `effective_date` | DATE | Y | | Forward date (UPDATE) or original date (CORRECTION) |
| `reason` | VARCHAR(1000) | Y | | Requester rationale |
| `workflow_instance_id` | UUID (FK→workflow_instances) | Y | | Bound on submit |
| `template_id` | UUID (FK→change_request_templates) | Y | | If created from template |
| `bulk_batch_id` | UUID (FK→bulk_correction_batches) | Y | | If part of a bulk job |
| `sla_due_at` | TIMESTAMP | Y | | Current node SLA deadline |
| `submitted_at` | TIMESTAMP | Y | | |
| `decided_at` | TIMESTAMP | Y | | Final decision time |
| `committed_at` | TIMESTAMP | Y | | Applied to M01 |
| `created_at` | TIMESTAMP | N | now | UTC |
| `updated_at` | TIMESTAMP | N | now | UTC |
| `created_by` | UUID | N | | |
| `updated_by` | UUID | N | | |
| `is_deleted` | BOOLEAN | N | false | Soft delete |

#### E2 — `change_request_items`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_item_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK→change_requests) | N | | |
| `field_key` | VARCHAR(80) | N | | Governed M01 field key (FK→field_sensitivity_catalog.field_key) |
| `old_value` | TEXT (encrypted) | Y | | Snapshot of master value at submit |
| `new_value` | TEXT (encrypted) | N | | Proposed value |
| `old_value_hash` | CHAR(64) | Y | | SHA-256 for stale-detection |
| `value_datatype` | ENUM | N | | `STRING`,`DATE`,`NUMBER`,`ENUM`,`BOOLEAN`,`JSON` |
| `sensitivity` | ENUM | N | from catalog | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `requires_document` | BOOLEAN | N | from catalog | |
| `item_status` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`COMMITTED`,`FAILED` |
| `commit_idempotency_key` | VARCHAR(80) UNIQUE | Y | | = item_id; ensures single commit |
| `sr_posting_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`POSTED`,`FAILED` |
| `created_at` / `updated_at` | TIMESTAMP | N | now | |
| `is_deleted` | BOOLEAN | N | false | |

#### E3 — `change_request_documents`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `cr_document_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `change_request_item_id` | UUID (FK) | Y | | Null = applies to whole request |
| `document_id` | UUID (FK→documents) | N | | M13 reference |
| `doc_type` | VARCHAR(60) | N | | e.g. `PASSPORT`,`GAZETTE_NOTIFICATION`,`BANK_PROOF` |
| `verification_status` | ENUM | N | `UNVERIFIED` | `UNVERIFIED`,`VERIFIED`,`REJECTED` |
| `verified_by` | UUID (FK→users) | Y | | |
| `verified_at` | TIMESTAMP | Y | | |
| `scan_status` | ENUM | N | `PENDING` | Mirror of M13 AV scan: `PENDING`,`CLEAN`,`INFECTED` |
| `created_at` | TIMESTAMP | N | now | |

#### E4 — `change_request_approvals`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `approval_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `workflow_task_id` | UUID (FK→workflow_tasks) | N | | Shared engine task |
| `level_no` | SMALLINT | N | | 1..n sequence |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` |
| `topology` | ENUM | N | `SEQUENTIAL` | `SEQUENTIAL`,`PARALLEL` |
| `required_role` | VARCHAR(60) | N | | Role key from matrix |
| `assigned_to` | UUID (FK→users) | Y | | Resolved assignee (or delegate) |
| `delegated_from` | UUID (FK→users) | Y | | If acted via delegation |
| `decision` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`RETURNED`,`SKIPPED` |
| `decision_comment` | VARCHAR(1000) | Y | | Mandatory on REJECT/RETURN |
| `esignature_id` | UUID (FK→esignatures) | Y | | Required for STATUTORY |
| `acted_at` | TIMESTAMP | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E5 — `field_sensitivity_catalog`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `field_key` | VARCHAR(80) (PK) | N | | Matches M01 governed field key |
| `display_label` | VARCHAR(120) | N | | |
| `field_group` | VARCHAR(60) | N | | `DEMOGRAPHIC`,`CONTACT`,`FINANCIAL`,`STATUTORY`,`QUALIFICATION` |
| `sensitivity` | ENUM | N | | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `requires_document` | BOOLEAN | N | false | |
| `required_doc_types` | JSONB | Y | | Allowed evidence doc types |
| `requires_esignature` | BOOLEAN | N | false | |
| `post_to_sr` | BOOLEAN | N | false | STATUTORY fields true |
| `sr_event_type` | VARCHAR(60) | Y | | M12 event_type when posting |
| `self_service_editable` | BOOLEAN | N | true | If false, HR-only |
| `validation_regex` | VARCHAR(300) | Y | | Field-format validation |
| `version` | INT | N | 1 | Config version |
| `effective_from` | DATE | N | | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | — | N | | Audit fields |
| `is_deleted` | BOOLEAN | N | false | |

#### E6 — `approval_matrix_config`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `matrix_id` | UUID (PK) | N | gen | |
| `name` | VARCHAR(120) | N | | e.g. "Default Govt Matrix v2" |
| `org_scope_id` | UUID (FK→org_units) | Y | | Null = global default |
| `status` | ENUM | N | `DRAFT` | `DRAFT`,`ACTIVE`,`RETIRED` |
| `version` | INT | N | 1 | |
| `effective_from` | DATE | N | | |
| `effective_to` | DATE | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | Audit |
| `is_deleted` | BOOLEAN | N | false | |

#### E7 — `approval_matrix_rules`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `rule_id` | UUID (PK) | N | gen | |
| `matrix_id` | UUID (FK→approval_matrix_config) | N | | |
| `sensitivity` | ENUM | N | | `LOW`…`STATUTORY` |
| `field_group` | VARCHAR(60) | Y | | Optional override per group |
| `field_key` | VARCHAR(80) | Y | | Optional override per field |
| `change_type` | ENUM | Y | | `UPDATE`/`CORRECTION` override |
| `level_no` | SMALLINT | N | | Sequence |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` |
| `topology` | ENUM | N | `SEQUENTIAL` | |
| `required_role` | VARCHAR(60) | N | | Role key |
| `sla_hours` | INT | N | 48 | SLA for this node |
| `escalation_role` | VARCHAR(60) | Y | | Role to escalate to |
| `auto_apply_on_low` | BOOLEAN | N | false | LOW fields may auto-apply |
| `created_at`/`updated_at` | — | N | | |

#### E8 — `delegations`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `delegation_id` | UUID (PK) | N | gen | |
| `delegator_user_id` | UUID (FK→users) | N | | |
| `delegate_user_id` | UUID (FK→users) | N | | |
| `scope_org_unit_id` | UUID (FK→org_units) | Y | | Optional scope narrowing |
| `node_types` | JSONB | Y | | Which node types delegated |
| `valid_from` | TIMESTAMP | N | | |
| `valid_to` | TIMESTAMP | N | | |
| `status` | ENUM | N | `ACTIVE` | `ACTIVE`,`REVOKED`,`EXPIRED` |
| `reason` | VARCHAR(500) | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E9 — `change_request_templates`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `template_id` | UUID (PK) | N | gen | |
| `name` | VARCHAR(120) | N | | e.g. "Change Bank Account" |
| `description` | VARCHAR(500) | Y | | |
| `change_type` | ENUM | N | `UPDATE` | |
| `field_keys` | JSONB | N | | Pre-selected governed fields |
| `required_doc_types` | JSONB | Y | | Guidance for evidence |
| `instructions` | TEXT | Y | | Help text shown to requester |
| `org_scope_id` | UUID (FK→org_units) | Y | | |
| `is_active` | BOOLEAN | N | true | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E10 — `esignatures`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `esignature_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `signer_user_id` | UUID (FK→users) | N | | |
| `sign_method` | ENUM | N | | `OTP`,`PKI_DSC`,`AADHAAR_ESIGN`,`PASSWORD_REAUTH` |
| `signed_payload_hash` | CHAR(64) | N | | SHA-256 of approval payload signed |
| `signature_blob_ref` | VARCHAR(200) | Y | | PKI/DSC artefact ref (M13) |
| `signed_at` | TIMESTAMP | N | now | |
| `ip_address` | VARCHAR(45) | Y | | Audit |
| `user_agent` | VARCHAR(300) | Y | | Audit |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E11 — `cr_sla_events`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `sla_event_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `workflow_task_id` | UUID (FK) | Y | | |
| `event_type` | ENUM | N | | `SLA_SET`,`REMINDER_SENT`,`BREACHED`,`ESCALATED`,`REASSIGNED` |
| `due_at` | TIMESTAMP | Y | | |
| `triggered_at` | TIMESTAMP | N | now | |
| `escalated_to` | UUID (FK→users) | Y | | |
| `detail` | VARCHAR(500) | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E12 — `bulk_correction_batches`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `bulk_batch_id` | UUID (PK) | N | gen | |
| `batch_number` | VARCHAR(24) UNIQUE | N | seq | `BLK-2026-0007` |
| `initiated_by` | UUID (FK→users) | N | | HR Officer/Admin |
| `source_file_ref` | VARCHAR(200) | Y | | Uploaded CSV/XLSX (M13) |
| `total_rows` | INT | N | 0 | |
| `valid_rows` | INT | N | 0 | After dry-run |
| `invalid_rows` | INT | N | 0 | |
| `status` | ENUM | N | `UPLOADED` | `UPLOADED`,`VALIDATED`,`PENDING_APPROVAL`,`APPROVED`,`REJECTED`,`COMMITTED`,`PARTIAL_FAILED` |
| `dry_run_report_ref` | VARCHAR(200) | Y | | Validation report (M13) |
| `reason` | VARCHAR(1000) | Y | | Justification |
| `approved_by` | UUID (FK→users) | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

### 5.3 Relationship map

```
employees (M01) 1───* change_requests *───1 users (requested_by)
change_requests 1───* change_request_items *───1 field_sensitivity_catalog (field_key)
change_requests 1───* change_request_documents *───1 documents (M13)
change_requests 1───1 workflow_instances (shared) 1───* workflow_tasks
workflow_tasks  1───1 change_request_approvals
change_request_approvals *───1 esignatures (optional)
change_requests 1───* cr_sla_events
change_requests *───1 change_request_templates (optional)
change_requests *───1 bulk_correction_batches (optional)
bulk_correction_batches 1───* change_requests
approval_matrix_config 1───* approval_matrix_rules
delegations *───1 users (delegator) / users (delegate)
change_request_items 1───* service_register_events (M12, on STATUTORY commit)
* every state change ───> audit_log (shared) ; every notify ───> notifications (shared)
```

### 5.4 Ownership / reuse matrix

| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `change_requests` / `_items` / `_documents` / `_approvals` | M02 | M14 (analytics), Auditor | M02 |
| `field_sensitivity_catalog`, `approval_matrix_*`, `delegations`, `templates` | M02 | M02 | System Admin via M02 |
| `esignatures`, `cr_sla_events`, `bulk_correction_batches` | M02 | Auditor, M14 | M02 |
| `employees` | M01 | M02 (read + commit) | M01 (M02 invokes commit) |
| `documents` | M13 | M02 | M13 (M02 references) |
| `service_register_events` | M12 | M02 (status) | M12 (M02 posts events) |
| `workflow_instances`/`workflow_tasks` | Shared engine | M02 | Shared engine (M02 orchestrates) |
| `notifications`, `audit_log` | Platform | M02, Auditor | M02 emits |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| `request_origin` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK` |
| `change_type` | `UPDATE`, `CORRECTION` |
| `sensitivity` | `LOW`, `MEDIUM`, `HIGH`, `STATUTORY` |
| `change_requests.status` | `DRAFT`, `SUBMITTED`, `PENDING_DOCS`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `COMMITTED`, `PARTIALLY_COMMITTED`, `COMMIT_FAILED`, `CANCELLED` |
| `item_status` | `PENDING`, `APPROVED`, `REJECTED`, `COMMITTED`, `FAILED` |
| `node_type` | `RECOMMEND`, `APPROVE`, `SANCTION`, `VERIFY` |
| `topology` | `SEQUENTIAL`, `PARALLEL` |
| `decision` | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED`, `SKIPPED` |
| `verification_status` | `UNVERIFIED`, `VERIFIED`, `REJECTED` |
| `scan_status` | `PENDING`, `CLEAN`, `INFECTED` |
| `sr_posting_status` | `NOT_REQUIRED`, `PENDING`, `POSTED`, `FAILED` |
| `sign_method` | `OTP`, `PKI_DSC`, `AADHAAR_ESIGN`, `PASSWORD_REAUTH` |
| `sla_event_type` | `SLA_SET`, `REMINDER_SENT`, `BREACHED`, `ESCALATED`, `REASSIGNED` |
| `delegation.status` | `ACTIVE`, `REVOKED`, `EXPIRED` |
| `bulk_batch.status` | `UPLOADED`, `VALIDATED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `COMMITTED`, `PARTIAL_FAILED` |
| `field_group` | `DEMOGRAPHIC`, `CONTACT`, `FINANCIAL`, `STATUTORY`, `QUALIFICATION` |

**Reference: default field sensitivity seed (illustrative, configurable)**

| field_key | group | sensitivity | doc | e-sign | post_to_sr |
|---|---|---|---|---|---|
| `correspondence_address` | CONTACT | LOW | No | No | No |
| `alternate_phone` | CONTACT | LOW | No | No | No |
| `emergency_contact` | CONTACT | LOW | No | No | No |
| `permanent_address` | CONTACT | MEDIUM | Yes | No | No |
| `marital_status` | DEMOGRAPHIC | MEDIUM | Yes | No | No |
| `qualification` | QUALIFICATION | HIGH | Yes | No | No |
| `bank_account_no` | FINANCIAL | HIGH | Yes | Yes | No |
| `name` | DEMOGRAPHIC | STATUTORY | Yes | Yes | Yes |
| `dob` | STATUTORY | STATUTORY | Yes | Yes | Yes |
| `gender` | STATUTORY | STATUTORY | Yes | Yes | Yes |
| `national_id` | STATUTORY | STATUTORY | Yes | Yes | Yes |
| `category_caste` | STATUTORY | STATUTORY | Yes | Yes | Yes |

### 5.6 Data integrity rules

1. **SoD constraint:** DB-level CHECK/trigger ensures no `change_request_approvals.assigned_to = change_requests.requested_by` and not equal to target employee's `user_id`.
2. **Stale-value guard:** at commit, `old_value_hash` must equal SHA-256 of current M01 value; mismatch → CONFLICT, request returns to `RETURNED`.
3. **Single-commit invariant:** `commit_idempotency_key` UNIQUE prevents double application; commit is no-op if `item_status = COMMITTED`.
4. **Document gate:** request cannot move past `PENDING_DOCS` while any item with `requires_document = true` lacks a `VERIFIED` + `CLEAN` document.
5. **E-sign gate:** STATUTORY-class approvals require a non-null `esignature_id` with matching `signed_payload_hash`.
6. **Effective-date rule:** for `CORRECTION`, `effective_date` ≤ original master value date; for `UPDATE`, `effective_date` ≥ today (configurable grace).
7. **Sensitivity derivation:** `change_requests.highest_sensitivity` = MAX of item sensitivities; route is derived from this; cannot be manually overridden.
8. **FK integrity:** all FKs enforced; no orphan items/documents/approvals.
9. **Append-only ledgers:** `change_request_approvals`, `esignatures`, `cr_sla_events`, `service_register_events` never updated/deleted; corrections create new rows.
10. **Pagination bound:** all list reads enforce max page size 100.
11. **SR-posting consistency:** an item with `field_sensitivity_catalog.post_to_sr = true` cannot reach `COMMITTED` without `sr_posting_status ∈ {POSTED}` (or recorded `FAILED` with retry queued).

### 5.7 Sample data (2–3 rows per module-owned entity)

**change_requests**

| change_request_id | cr_number | target_employee_id | requested_by | request_origin | change_type | highest_sensitivity | status | effective_date |
|---|---|---|---|---|---|---|---|---|
| 7a1…e01 | CR-2026-000123 | emp-001 | usr-emp-001 | SELF_SERVICE | UPDATE | LOW | COMMITTED | 2026-07-01 |
| 7a1…e02 | CR-2026-000124 | emp-045 | usr-emp-045 | SELF_SERVICE | CORRECTION | STATUTORY | IN_REVIEW | 1990-05-12 |
| 7a1…e03 | CR-2026-000125 | emp-077 | usr-hr-009 | HR_ON_BEHALF | UPDATE | HIGH | RETURNED | 2026-07-05 |

**change_request_items**

| change_request_item_id | change_request_id | field_key | old_value | new_value | sensitivity | requires_document | item_status | sr_posting_status |
|---|---|---|---|---|---|---|---|---|
| it-001 | 7a1…e01 | alternate_phone | +91-90000-11111 | +91-98888-22222 | LOW | false | COMMITTED | NOT_REQUIRED |
| it-002 | 7a1…e02 | dob | 1990-05-21 | 1990-05-12 | STATUTORY | true | PENDING | PENDING |
| it-003 | 7a1…e03 | bank_account_no | XXXX4321 | XXXX9876 | HIGH | true | REJECTED | NOT_REQUIRED |

**change_request_documents**

| cr_document_id | change_request_id | change_request_item_id | document_id | doc_type | verification_status | scan_status |
|---|---|---|---|---|---|---|
| crd-01 | 7a1…e02 | it-002 | doc-9001 | GAZETTE_NOTIFICATION | VERIFIED | CLEAN |
| crd-02 | 7a1…e02 | it-002 | doc-9002 | BIRTH_CERTIFICATE | VERIFIED | CLEAN |
| crd-03 | 7a1…e03 | it-003 | doc-9100 | BANK_PROOF | REJECTED | CLEAN |

**change_request_approvals**

| approval_id | change_request_id | level_no | node_type | topology | required_role | assigned_to | decision | esignature_id |
|---|---|---|---|---|---|---|---|---|
| apr-01 | 7a1…e01 | 1 | APPROVE | SEQUENTIAL | HR_OFFICER | usr-hr-002 | APPROVED | null |
| apr-02 | 7a1…e02 | 1 | VERIFY | SEQUENTIAL | HR_OFFICER | usr-hr-002 | APPROVED | null |
| apr-03 | 7a1…e02 | 2 | SANCTION | SEQUENTIAL | DEPT_HEAD | usr-dh-001 | PENDING | null |

**field_sensitivity_catalog**

| field_key | display_label | field_group | sensitivity | requires_document | requires_esignature | post_to_sr | sr_event_type |
|---|---|---|---|---|---|---|---|
| dob | Date of Birth | STATUTORY | STATUTORY | true | true | true | DOB_CORRECTION |
| bank_account_no | Bank Account No. | FINANCIAL | HIGH | true | true | false | null |
| alternate_phone | Alternate Phone | CONTACT | LOW | false | false | false | null |

**approval_matrix_config**

| matrix_id | name | org_scope_id | status | version | effective_from |
|---|---|---|---|---|---|
| mx-001 | Default Govt Matrix | null | ACTIVE | 2 | 2026-04-01 |
| mx-002 | Secretariat Override | ou-secr | DRAFT | 1 | 2026-08-01 |

**approval_matrix_rules**

| rule_id | matrix_id | sensitivity | level_no | node_type | required_role | sla_hours | escalation_role |
|---|---|---|---|---|---|---|---|
| rl-01 | mx-001 | LOW | 1 | APPROVE | HR_OFFICER | 24 | HR_ADMIN |
| rl-02 | mx-001 | HIGH | 1 | VERIFY | HR_OFFICER | 48 | HR_ADMIN |
| rl-03 | mx-001 | STATUTORY | 2 | SANCTION | DEPT_HEAD | 72 | APPOINTING_AUTHORITY |

**delegations**

| delegation_id | delegator_user_id | delegate_user_id | valid_from | valid_to | status |
|---|---|---|---|---|---|
| dl-01 | usr-dh-001 | usr-dh-002 | 2026-06-25 | 2026-07-05 | ACTIVE |
| dl-02 | usr-hr-002 | usr-hr-003 | 2026-05-01 | 2026-05-10 | EXPIRED |

**change_request_templates**

| template_id | name | change_type | field_keys | is_active |
|---|---|---|---|---|
| tpl-01 | Update Contact Details | UPDATE | ["correspondence_address","alternate_phone"] | true |
| tpl-02 | Bank Account Change | UPDATE | ["bank_account_no"] | true |

**esignatures**

| esignature_id | change_request_id | signer_user_id | sign_method | signed_at |
|---|---|---|---|---|
| es-01 | 7a1…e02 | usr-dh-001 | PKI_DSC | 2026-06-28T10:14:00Z |
| es-02 | 7a1…e03 | usr-hr-002 | OTP | 2026-06-27T09:00:00Z |

**cr_sla_events**

| sla_event_id | change_request_id | event_type | due_at | escalated_to |
|---|---|---|---|---|
| sl-01 | 7a1…e02 | SLA_SET | 2026-07-01T00:00:00Z | null |
| sl-02 | 7a1…e03 | BREACHED | 2026-06-29T00:00:00Z | usr-hr-admin-1 |

**bulk_correction_batches**

| bulk_batch_id | batch_number | initiated_by | total_rows | valid_rows | invalid_rows | status |
|---|---|---|---|---|---|---|
| blk-01 | BLK-2026-0007 | usr-hr-009 | 250 | 248 | 2 | PENDING_APPROVAL |
| blk-02 | BLK-2026-0008 | usr-hr-010 | 30 | 30 | 0 | COMMITTED |

---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design (LLD) table.

---

### FR-M02-001 — Create & Submit a Personal-Details Change Request

- **Module:** M02-EPDM
- **Primary Role(s):** Employee (Self-Service), HR Officer (on behalf)
- **User Story:** *As an employee, I want to request a change to my personal details with a clear before/after preview and supporting documents, so that my record is updated accurately and with proper approval.*

**Description:** Provides the guided form to create a `change_requests` header and one or more `change_request_items`. The form is scoped to fields the requester is allowed to edit (`self_service_editable` + ownership/scope). On selecting a field, the current master value is fetched (read-only "before") and the requester supplies the "new" value, reason, change type (update/correction) and effective date. On submit, the system computes `highest_sensitivity`, builds the approval route via the active matrix, binds a `workflow_instance`, and transitions to `SUBMITTED` (or `PENDING_DOCS`).

**Acceptance Criteria:**
1. Requester can only add fields they are authorized to modify on the target record; unauthorized fields are not selectable.
2. For each item, the current master value is displayed as immutable "before" and stored as `old_value` + `old_value_hash` at submit time.
3. Submission is rejected with VALIDATION_ERROR if any required field-format (`validation_regex`) fails, effective-date rule is violated, or a required document type is missing.
4. On valid submit, exactly one `workflow_instance` is created and `change_requests.status` becomes `SUBMITTED`, or `PENDING_DOCS` if documents are required but not yet verified.
5. A `cr_number` is generated and returned; an audit row and requester confirmation notification are written.
6. Drafts can be saved without routing and resumed later.

**Business Rules:**
- BR1: A self-service requester's `target_employee_id` must equal their own employee record.
- BR2: HR-on-behalf requires the target to be within the requester's org scope.
- BR3: `highest_sensitivity` is system-derived; the route is not user-editable.
- BR4: A field cannot appear twice as an open item across concurrent non-terminal requests (one open change per field per employee) → CONFLICT.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | INSERT | header, status, change_type, effective_date |
| `change_request_items` | INSERT | field_key, old/new value, sensitivity, requires_document |
| `field_sensitivity_catalog` | READ | sensitivity, regex, doc/e-sign rules |
| `employees` (M01) | READ | current value + version/hash |
| `workflow_instances` | INSERT | route binding |
| `audit_log` / `notifications` | INSERT | trail + confirmation |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests` | Create draft |
| PATCH | `/api/v1/change-requests/{id}` | Edit draft items |
| POST | `/api/v1/change-requests/{id}/submit` | Validate + route |
| GET | `/api/v1/employees/{id}/editable-fields` | Authorized editable fields + current values |

**UI Behavior Notes:** Two-column item editor (before | after), per-field help from catalog, inline validation, reason textarea, effective-date picker constrained by change type, document attach zone for items requiring evidence, and a "Review & Submit" summary screen with full diff.

**Edge Cases:** Master value changed between draft and submit (re-snapshot + warn); duplicate open change for same field (block); requester loses scope mid-draft (block submit); attempt to edit non-governed field via API (FORBIDDEN).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeRequestEditor` (field picker, diff rows, doc attach, effective-date), `ReviewSubmitModal`; client validates regex + required docs before enabling Submit. |
| Backend-Service Flow | `ChangeRequestService.createDraft()` → `addItems()` → `submit()`: snapshot master values, derive sensitivity, call `RoutingService.buildRoute()`, create `workflow_instance`, set status. |
| Data Operations | INSERT header + items (transaction); INSERT workflow instance/tasks; UPDATE status; INSERT audit + notification. |
| Validation Logic | Ownership/scope, field-format regex, effective-date rule, one-open-change-per-field, doc-presence pre-check. |
| Authorization Logic | `canEditField(actor, targetEmployee, fieldKey)` = ownership OR (HR + scope) AND `self_service_editable` rule. |
| State Changes & Side Effects | `DRAFT`→`SUBMITTED`/`PENDING_DOCS`; SLA timer set on first task; confirmation notification. |
| Failure Handling | Partial item insert rolled back; routing failure → remain DRAFT with explicit error; master-read timeout → UPSTREAM_UNAVAILABLE(503). |
| Dependencies & Reuse | M01 read API; shared workflow engine; M13 for attachments (FR-003); RoutingService (FR-002). |
| Test Guidance | Submit with LOW vs STATUTORY field; missing doc; stale snapshot; duplicate-open-field; unauthorized field via API. |

---

### FR-M02-002 — Field Sensitivity Classification & Approval Routing Engine

- **Module:** M02-EPDM
- **Primary Role(s):** System (engine); configured by System Admin (FR-012)
- **User Story:** *As the HR governance owner, I want each request routed automatically based on the sensitivity of the fields it touches, so that sensitive changes get the right level of scrutiny without manual routing.*

**Description:** Deterministic engine that, given a request's items and the active `approval_matrix_config` for the target's org scope, produces an ordered (sequential and/or parallel) set of approval nodes persisted as `change_request_approvals` bound to `workflow_tasks`. It resolves the highest sensitivity, applies field/group/change-type overrides, attaches SLAs and escalation roles, and marks LOW items as auto-apply where policy allows.

**Acceptance Criteria:**
1. Given items with sensitivities {LOW, HIGH}, the route reflects the HIGH path (highest sensitivity wins).
2. The active matrix is selected by org scope precedence (most specific scope first, else global).
3. Sequential nodes execute in `level_no` order; parallel nodes at the same level are all required (all must approve) unless configured as any-one.
4. Each node persists `required_role`, `sla_hours`, `escalation_role`.
5. LOW items with `auto_apply_on_low = true` and no documents required skip approval and go straight to commit, still writing audit.
6. The engine is idempotent for a given request version (re-evaluation yields identical route until items change).

**Business Rules:**
- BR1: Field-key override > field-group override > sensitivity default.
- BR2: STATUTORY always includes a SANCTION node + e-signature requirement.
- BR3: A request mixing CORRECTION + statutory field always routes to senior sanction regardless of LOW co-items.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `approval_matrix_config` / `_rules` | READ | route definition |
| `field_sensitivity_catalog` | READ | per-field sensitivity |
| `change_request_approvals` | INSERT | resolved nodes |
| `workflow_tasks` | INSERT | engine tasks |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/route-preview` | Preview computed route (no persist) |
| (internal) | `RoutingService.buildRoute()` | Persisted on submit |

**UI Behavior Notes:** A "How this will be reviewed" panel shows the computed approver chain (roles, order, SLA) before submission so requesters know what to expect.

**Edge Cases:** No active matrix for scope (fallback to global; if none → INTERNAL_ERROR with config alert); circular/duplicate levels in config (rejected at config save, FR-012); delegated approver unavailable (resolve to escalation role).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RoutePreviewPanel` renders node chain with role, order, parallel grouping, SLA badges. |
| Backend-Service Flow | `RoutingService.buildRoute(request)`: load active matrix (scope precedence) → collect rules per item sensitivity with override precedence → dedupe + order levels → create approval + task rows. |
| Data Operations | READ matrix/rules/catalog; INSERT approvals + workflow_tasks; UPDATE `highest_sensitivity`, `sla_due_at`. |
| Validation Logic | Ensure ≥1 node for non-auto-apply; verify role keys exist; verify no duplicate level/role conflicts. |
| Authorization Logic | Engine internal; route-preview limited to requester/reviewers of the request. |
| State Changes & Side Effects | Creates pending tasks; sets first node SLA; emits SLA_SET event. |
| Failure Handling | Missing matrix → fallback then config alert; invalid rule → INTERNAL_ERROR + admin notification, request stays SUBMITTED unrouted. |
| Dependencies & Reuse | Shared workflow engine; FR-012 config; consumed by FR-001/004. |
| Test Guidance | Mixed-sensitivity highest-wins; scope precedence; parallel all-required vs any-one; auto-apply LOW; override precedence. |

---

### FR-M02-003 — Supporting-Document Upload & Verification

- **Module:** M02-EPDM
- **Primary Role(s):** Employee/HR (upload); HR Officer (verify)
- **User Story:** *As a reviewer, I want every sensitive change backed by verified documentary proof, so that I can approve confidently and defensibly.*

**Description:** Lets requesters attach documents (stored in M13) to a request or specific item, records `doc_type`, mirrors M13 antivirus scan status, and lets reviewers mark each document `VERIFIED`/`REJECTED`. A request with any item where `requires_document = true` cannot advance past `PENDING_DOCS`/`VERIFY` until all required documents are `VERIFIED` + `CLEAN`.

**Acceptance Criteria:**
1. Upload returns a `document_id` from M13 and creates a `change_request_documents` link with `scan_status = PENDING`.
2. Infected files (`scan_status = INFECTED`) are blocked, flagged, and excluded from verification.
3. Reviewer can set `VERIFIED` or `REJECTED` with a reason; both write audit.
4. The document gate (integrity rule 4) is enforced at approval time.
5. Allowed `doc_type`s are constrained to the field's `required_doc_types`.

**Business Rules:**
- BR1: Only HR/authority roles may verify; requesters cannot self-verify.
- BR2: A rejected document returns the request to the requester (`RETURNED`) with reason.
- BR3: Documents are referenced, never copied — M13 is the store of record.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_documents` | INSERT/UPDATE | doc_type, verification_status, scan_status |
| `documents` (M13) | READ | scan status, metadata |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/documents` | Link uploaded doc |
| PATCH | `/api/v1/change-requests/{id}/documents/{docId}/verify` | Verify/reject |
| GET | `/api/v1/change-requests/{id}/documents` | List with status |

**UI Behavior Notes:** Drag-and-drop upload with doc-type selector restricted by field; status chips (Pending scan / Clean / Infected / Verified / Rejected); reviewer side-panel to preview document next to the diff.

**Edge Cases:** M13 upload timeout (retry, surfaced as UPSTREAM_UNAVAILABLE); scan stuck PENDING beyond threshold (reviewer cannot verify; SLA paused); document deleted in M13 (link marked broken, blocks approval).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DocumentUploader`, `DocumentVerifyPanel`; chips reflect live scan/verify state. |
| Backend-Service Flow | `DocumentService.link()` calls M13 upload ref + scan-status poll; `verify()` updates status + audit; gate checked by approval service. |
| Data Operations | INSERT/UPDATE change_request_documents; READ M13 status; INSERT audit. |
| Validation Logic | doc_type ∈ required_doc_types; scan must be CLEAN to verify; verifier role check; non-self-verify. |
| Authorization Logic | Upload: requester/HR; Verify: HR/authority within scope. |
| State Changes & Side Effects | All required docs VERIFIED+CLEAN unblocks gate; rejection → `RETURNED`. |
| Failure Handling | Upload/scan upstream failures retried; broken reference blocks approval with explicit error. |
| Dependencies & Reuse | M13 APIs; gate consumed by FR-004; rejection path shares FR-006. |
| Test Guidance | Infected file block; reject→return; wrong doc_type; gate enforcement; M13 timeout. |

---

### FR-M02-004 — Maker-Checker Multi-Level Approval (Sequential & Parallel)

- **Module:** M02-EPDM
- **Primary Role(s):** Reporting Manager, HR Officer, HR Admin, Dept Head / Appointing Authority
- **User Story:** *As an approver, I want a clear task queue of requests awaiting my decision with the full diff and evidence, so that I can approve, reject, or return them with proper segregation of duties.*

**Description:** Drives requests through the routed approval nodes. Approvers act on `workflow_tasks`; M02 records the decision in `change_request_approvals`. Supports recommend→approve→sanction chains, sequential progression, parallel "all required" or "any-one" nodes, and enforces SoD. A request reaches `APPROVED` only when all required nodes approve; any rejection → `REJECTED`; a "return" → `RETURNED` for correction.

**Acceptance Criteria:**
1. An approver sees only tasks assigned to their role/scope (or delegated to them) in their queue.
2. Approve advances to the next sequential level or completes the route; the system never lets the maker or target approve (SoD).
3. Reject requires a comment and terminates the request (`REJECTED`), marking outstanding items `REJECTED`.
4. Return requires a comment and sends the request back to `RETURNED` (editable draft preserving history).
5. Parallel "all required" completes only when every parallel node approves; "any-one" completes on first approval and auto-`SKIPPED`s the rest.
6. STATUTORY sanction nodes require a valid e-signature (FR-015) before the decision is accepted.

**Business Rules:**
- BR1: `assigned_to ≠ requested_by` and `≠ target user` at every node (SoD).
- BR2: Comments mandatory on REJECT and RETURN.
- BR3: A node may be acted on by the assignee or an active delegate; both recorded.
- BR4: Decisions are append-only; a node cannot be re-decided once terminal.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_approvals` | INSERT/UPDATE | decision, comment, esignature_id |
| `workflow_tasks` | UPDATE | task completion |
| `change_requests` | UPDATE | status transitions |
| `esignatures` | READ | STATUTORY gate |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/approvals/queue` | My pending tasks |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/decide` | Approve/Reject/Return |
| GET | `/api/v1/change-requests/{id}` | Full request + diff for review |

**UI Behavior Notes:** Approver workspace: left = task queue with SLA countdown + sensitivity badge; right = diff (before/after), evidence preview, prior decisions trail; sticky action bar (Approve / Return / Reject) with mandatory comment on negative actions and e-sign prompt for STATUTORY.

**Edge Cases:** Concurrent decisions on the same parallel node (idempotent, first wins); approver loses role mid-flow (task reassigned via escalation); delegate and delegator both act (first persisted, second rejected as already decided); request items changed after partial approvals (re-route, prior approvals invalidated with audit).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ApprovalQueue`, `ApprovalDetail` (diff + evidence + history), `DecisionBar`. |
| Backend-Service Flow | `ApprovalService.decide()`: SoD check → e-sign check (if STATUTORY) → persist approval → complete task → recompute route progress → set status. |
| Data Operations | INSERT/UPDATE approvals; UPDATE workflow_tasks + change_requests.status; INSERT audit + notification. |
| Validation Logic | SoD invariant, mandatory comments, e-sign presence/hash, node-not-terminal, delegate validity window. |
| Authorization Logic | Assignee or active delegate with matching role/scope; reject self/target. |
| State Changes & Side Effects | Advances levels; on full approval → `APPROVED` (triggers FR-010 commit); reject → `REJECTED`; return → `RETURNED`. |
| Failure Handling | Concurrency via optimistic lock on task version → CONFLICT for late actor; engine error keeps node PENDING. |
| Dependencies & Reuse | RoutingService (002), e-sign (015), delegation (013), commit (010), notifications (011). |
| Test Guidance | SoD violation blocked; sequential chain; parallel all/any-one; STATUTORY without e-sign blocked; concurrent decide. |

---

### FR-M02-005 — Field-Level Change Diff, Preview & Reviewer Comparison

- **Module:** M02-EPDM
- **Primary Role(s):** All (requester preview; reviewer comparison; auditor read)
- **User Story:** *As a reviewer, I want to see exactly what is changing — old value vs new value, per field — so that I can judge the change accurately.*

**Description:** Computes and renders a structured before/after diff for every item, masking sensitive values per role (e.g., bank account/national ID shown masked except to authorized verifiers), highlighting changed characters/segments, and surfacing the reason, change type, effective date and evidence per item. The diff is the canonical representation used in approval, audit and history views.

**Acceptance Criteria:**
1. Each item shows `old_value` (read-only master snapshot) and `new_value` with visual change highlighting.
2. HIGH/STATUTORY values are masked for roles lacking the `view_sensitive_value` permission; full value visible to authorized verifiers.
3. The diff is immutable after submission (reflects the snapshot, not live master) and recomputed only if the request is returned and edited.
4. Auditor can view the historical diff for any committed/decided request.

**Business Rules:**
- BR1: Masking format is consistent (`XXXX1234` last-4) and never logs the unmasked value.
- BR2: Diff for date/number/enum fields renders typed (e.g., `21-May-1990 → 12-May-1990`).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | READ | old/new value, datatype, sensitivity |
| `field_sensitivity_catalog` | READ | masking/datatype rules |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/diff` | Role-aware diff payload |

**UI Behavior Notes:** Diff cards per field with color-coded old (strike, muted) vs new (accent); typed formatting; mask toggle for authorized roles with audit on reveal; effective-date and change-type chips.

**Edge Cases:** Multi-line/JSON fields (structured diff); identical old==new (blocked at submit as no-op); unauthorized reveal attempt (FORBIDDEN, audited).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DiffCard`, `MaskToggle`; renders typed values; reveal action audited. |
| Backend-Service Flow | `DiffService.render(request, actor)`: load items, apply role-based masking, format by datatype. |
| Data Operations | READ items + catalog; INSERT audit on sensitive reveal. |
| Validation Logic | old≠new at submit; datatype-aware formatting. |
| Authorization Logic | `view_sensitive_value` permission gates unmasking. |
| State Changes & Side Effects | Read-only except audit on reveal. |
| Failure Handling | Decrypt failure → masked fallback + error flag. |
| Dependencies & Reuse | Consumed by FR-001/004/016. |
| Test Guidance | Masking by role; typed diff; reveal audit; no-op block. |

---

### FR-M02-006 — Rejection, Return-for-Correction, Resubmission & Withdrawal

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers (reject/return); Requester (resubmit/withdraw)
- **User Story:** *As a requester, when my request is sent back, I want to see why and fix it without re-keying everything, so that I can resubmit quickly.*

**Description:** Manages the negative and terminal paths. **Reject** terminates a request with a mandatory reason. **Return-for-correction** sends it back to an editable `RETURNED` state preserving items, documents and the decision trail; the requester edits and resubmits, which re-runs validation/routing (resetting subsequent approvals). **Withdraw** lets the requester cancel a non-terminal request they own.

**Acceptance Criteria:**
1. Reject and Return both require a comment captured in `change_request_approvals.decision_comment` and audit.
2. A `RETURNED` request is editable by the requester; prior approvals are preserved as history but the route restarts on resubmit.
3. Resubmission re-validates regex, doc gate, effective date and re-derives the route.
4. Requester can withdraw any request in `DRAFT`/`SUBMITTED`/`PENDING_DOCS`/`RETURNED`/`IN_REVIEW` (→ `WITHDRAWN`), but not after `APPROVED`.
5. All transitions notify the relevant parties.

**Business Rules:**
- BR1: Once `APPROVED`/`COMMITTED`, only a new corrective request can alter the field (no edit of a committed request).
- BR2: Resubmit keeps the same `cr_number` and increments an internal revision counter.
- BR3: Withdrawal cancels outstanding workflow tasks and stops SLA timers.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | UPDATE | status, revision |
| `change_request_approvals` | INSERT | RETURNED/REJECTED decisions |
| `workflow_tasks` | UPDATE | cancel on withdraw |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/withdraw` | Requester cancels |
| POST | `/api/v1/change-requests/{id}/resubmit` | After correction |
| (decide endpoint handles reject/return) | — | FR-004 |

**UI Behavior Notes:** Returned requests appear in the requester's "Action needed" list with the reviewer's reason banner; edited fields highlighted; one-click resubmit after fixing.

**Edge Cases:** Resubmit after sensitivity changed by config (new route applies); withdraw race with an in-flight approval (CONFLICT, latest wins); return after a parallel partial approval (all parallel nodes reset).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ReturnedRequestBanner`, `ResubmitButton`, `WithdrawDialog`. |
| Backend-Service Flow | `LifecycleService.return()/reject()/withdraw()/resubmit()`: validate transition, cancel/reset tasks, re-route on resubmit. |
| Data Operations | UPDATE status/revision; INSERT approval rows; UPDATE/cancel tasks; audit + notify. |
| Validation Logic | Transition legality from state table; mandatory comment; ownership for withdraw/resubmit. |
| Authorization Logic | Reject/return: approver of current node; withdraw/resubmit: requester. |
| State Changes & Side Effects | `RETURNED`→`SUBMITTED` on resubmit; `*`→`WITHDRAWN`; `*`→`REJECTED`. |
| Failure Handling | Illegal transition → CONFLICT; task-cancel failure rolled back. |
| Dependencies & Reuse | Routing (002), approvals (004), SLA (007), notifications (011). |
| Test Guidance | Reject terminal; return→edit→resubmit re-route; withdraw cancels tasks; post-approve edit blocked. |

---

### FR-M02-007 — SLA Tracking, Reminders & Escalation

- **Module:** M02-EPDM
- **Primary Role(s):** System; escalation targets (HR Admin, Appointing Authority)
- **User Story:** *As an HR governance owner, I want pending approvals to be tracked against SLAs and auto-escalated when overdue, so that requests never silently stall.*

**Description:** Computes a per-node SLA deadline from `approval_matrix_rules.sla_hours` (business-calendar aware), sends reminders before breach, marks breaches, and escalates overdue tasks to the configured `escalation_role` (and optionally auto-reassigns). All SLA milestones are recorded in `cr_sla_events`. SLA timers pause when a request is `RETURNED` or waiting on document scan, and resume on the requester's action.

**Acceptance Criteria:**
1. On entering a node, `sla_due_at` is set using a business-calendar (excludes holidays/weekends per config).
2. A reminder notification fires at a configurable threshold (default 50% and 90% of SLA) before breach.
3. On breach, a `BREACHED` event is recorded and an escalation notification sent to `escalation_role`.
4. If auto-reassign is enabled, the task `assigned_to` is updated to an escalation-role holder and `REASSIGNED` recorded.
5. SLA pauses in `RETURNED`/`PENDING_DOCS(scan pending)` and resumes correctly.

**Business Rules:**
- BR1: SLA is per node; the request `sla_due_at` always reflects the current active node.
- BR2: Escalation does not skip required approvals; it changes who acts, not the route.
- BR3: Breach does not auto-approve — manual decision is always required.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_sla_events` | INSERT | event_type, due_at, escalated_to |
| `change_requests` | UPDATE | sla_due_at |
| `workflow_tasks` | UPDATE | reassignment |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/sla` | SLA timeline |
| (scheduler) | `SlaScheduler.tick()` | Periodic evaluation |

**UI Behavior Notes:** SLA countdown chips (green/amber/red) in queues; "Overdue" filter; escalation banner on detail; aging report tile in HR dashboard.

**Edge Cases:** No holders for escalation role (notify HR Admin fallback); clock skew (server-authoritative time); request withdrawn mid-SLA (timers stopped); DST/holiday-calendar changes (recompute remaining only).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SlaBadge`, `OverdueFilter`, `EscalationBanner`. |
| Backend-Service Flow | `SlaScheduler` periodic job evaluates active tasks; `SlaService.onNodeEnter()/onBreach()/escalate()`. |
| Data Operations | INSERT cr_sla_events; UPDATE change_requests.sla_due_at + task assignment; notify. |
| Validation Logic | Business-calendar computation; threshold checks; pause/resume conditions. |
| Authorization Logic | Scheduler internal; SLA view limited to request participants + HR/Auditor. |
| State Changes & Side Effects | Reassignment, escalation notifications; no status auto-advance. |
| Failure Handling | Scheduler retry with idempotent event keys to avoid duplicate reminders. |
| Dependencies & Reuse | Matrix SLAs (002/012), notifications (011), workflow engine. |
| Test Guidance | Reminder thresholds; breach→escalate; auto-reassign; pause/resume; no escalation holder fallback. |

---

### FR-M02-008 — Correction vs. Update Distinction & Effective-Dating

- **Module:** M02-EPDM
- **Primary Role(s):** Requester, Approvers
- **User Story:** *As HR, I need to distinguish fixing an error from recording a genuine change, so that downstream history, seniority and pension calculations stay correct.*

**Description:** Enforces the semantic distinction: a **CORRECTION** repairs an erroneous historical value and is effective from the original/erroneous date (flagging potential retroactive impact to payroll/pension/seniority); an **UPDATE** records a legitimate forward-dated change. The effective date drives how M01 stores the value and whether retro-impact flags are raised for downstream modules. STATUTORY corrections (e.g., DOB) always demand documentary proof and senior sanction.

**Acceptance Criteria:**
1. Requester must choose CORRECTION or UPDATE; the form constrains the effective-date picker accordingly (correction ≤ original date; update ≥ today−grace).
2. A CORRECTION on a STATUTORY field forces evidence + e-sign + senior sanction route.
3. Corrections set a `retro_impact = true` flag passed to downstream consumers (M10/M11) when the field affects pay/seniority/pension.
4. The effective date is stored on commit and included in the M01 change and any SR event.

**Business Rules:**
- BR1: CORRECTION cannot have a future effective date; UPDATE cannot back-date beyond the grace window.
- BR2: DOB corrections beyond statutory limits (e.g., post a configurable service threshold) are auto-flagged for additional scrutiny.
- BR3: Effective-dating never alters audit timestamps (when the change was *recorded* vs *effective*).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | READ/UPDATE | change_type, effective_date |
| `change_request_items` | READ | field sensitivity |
| `service_register_events` (M12) | INSERT | effective_date, retro flag (via FR-011) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/effective-date-rules?fieldKey=&changeType=` | Allowed date range |

**UI Behavior Notes:** A clear toggle "Correct an error" vs "Record a change" with contextual help; retro-impact warning banner when a correction may affect pay/pension; date picker bounded dynamically.

**Edge Cases:** Correction predating date-of-joining (block); update effective date on a non-working day (allowed, recorded as-is); change reclassified correction→update after return (route may change).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeTypeToggle`, bounded `EffectiveDatePicker`, `RetroImpactBanner`. |
| Backend-Service Flow | `EffectiveDatingService.validate()` + `flagRetroImpact()`; feeds routing and commit. |
| Data Operations | UPDATE change_type/effective_date; READ catalog; pass flags to FR-010/011. |
| Validation Logic | Date-range rules by change_type; DOB statutory thresholds; ≥ DOJ. |
| Authorization Logic | Same as request authoring; reclassification only while editable. |
| State Changes & Side Effects | Determines route (via 002); sets retro flag for downstream. |
| Failure Handling | Out-of-range date → VALIDATION_ERROR with allowed window. |
| Dependencies & Reuse | Routing (002), commit (010), SR posting (011). |
| Test Guidance | Correction past/future bounds; DOB threshold; retro flag propagation; reclassification re-route. |

---

### FR-M02-009 — Bulk HR-Initiated Corrections

- **Module:** M02-EPDM
- **Primary Role(s):** HR Officer / HR Admin (initiate); HR Admin / Appointing Authority (approve)
- **User Story:** *As an HR admin doing a mass data cleanup, I want to upload many corrections at once with validation and a single approval, so that I can fix records efficiently without bypassing governance.*

**Description:** Supports a controlled batch path: HR uploads a CSV/XLSX of (service_no, field_key, new_value, reason, doc_ref), the system performs a **dry-run validation** (existence, scope, regex, sensitivity, one-open-change conflicts, stale checks), produces a downloadable report of valid/invalid rows, generates child `change_requests` for valid rows under a `bulk_correction_batches` header, and routes the batch for **aggregate approval**. Approval commits all valid rows; per-row failures are isolated (`PARTIAL_FAILED`) without rolling back successes.

**Acceptance Criteria:**
1. Upload parses the file and reports `total/valid/invalid` with row-level error reasons.
2. Only HIGH/STATUTORY rows that include required evidence references pass validation.
3. The batch routes to an aggregate approval node (HR Admin / authority) honoring the highest sensitivity in the batch.
4. On approval, valid rows commit individually and idempotently; failures recorded per row, batch → `COMMITTED` or `PARTIAL_FAILED`.
5. STATUTORY rows still post to M12 individually (FR-011).
6. Full audit at batch and row level.

**Business Rules:**
- BR1: Bulk is HR-only; never self-service.
- BR2: A row failing scope/ownership is rejected, not silently skipped.
- BR3: Batch approval respects SoD (approver ≠ initiator).
- BR4: Bulk corrections default `change_type = CORRECTION` unless the row specifies `UPDATE`.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `bulk_correction_batches` | INSERT/UPDATE | status, counts, report ref |
| `change_requests` / `_items` | INSERT | child rows |
| `documents` (M13) | READ | evidence refs |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/bulk-corrections` | Upload + create batch |
| POST | `/api/v1/bulk-corrections/{id}/validate` | Dry-run |
| POST | `/api/v1/bulk-corrections/{id}/submit` | Route for approval |
| POST | `/api/v1/bulk-corrections/{id}/approve` | Aggregate approve + commit |
| GET | `/api/v1/bulk-corrections/{id}/report` | Validation/commit report |

**UI Behavior Notes:** Upload wizard with template download; validation results grid (filter valid/invalid, inline error reasons); summary of sensitivities; approve screen with per-row preview; post-commit results with downloadable report.

**Edge Cases:** Mixed valid/invalid rows (only valid proceed); duplicate field across rows for same employee (conflict flagged); very large file (chunked async processing with progress); evidence ref pointing to another employee's doc (rejected).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `BulkUploadWizard`, `ValidationGrid`, `BatchApprovalScreen`, `ResultsReport`. |
| Backend-Service Flow | `BulkService.parse()→validateRows()→materializeRequests()→route()→commitBatch()`; async worker for large files. |
| Data Operations | INSERT batch + child requests/items; UPDATE counts/status; per-row commit via FR-010; SR posting via FR-011. |
| Validation Logic | Existence/scope/regex/sensitivity/one-open-change/stale; evidence presence for HIGH/STATUTORY. |
| Authorization Logic | Initiate: HR + scope; approve: HR Admin/authority, SoD enforced. |
| State Changes & Side Effects | `UPLOADED→VALIDATED→PENDING_APPROVAL→APPROVED→COMMITTED/PARTIAL_FAILED`. |
| Failure Handling | Per-row isolation; failed rows logged, successes retained; report generated. |
| Dependencies & Reuse | Commit (010), SR posting (011), routing (002), M13. |
| Test Guidance | Mixed validity; SoD on approve; partial failure isolation; STATUTORY SR posting; large async file. |

---

### FR-M02-010 — Apply Approved Change to Employee Master (M01 Commit)

- **Module:** M02-EPDM
- **Primary Role(s):** System (post-approval)
- **User Story:** *As the system, once a change is fully approved, I want to atomically write it to the employee master with stale-value protection, so that the golden record is updated exactly once and correctly.*

**Description:** On a request reaching `APPROVED`, the commit service applies each approved item to M01 via the M01 commit contract (or shared transaction), guarded by `old_value_hash` stale-detection and an idempotency key. All items in a request commit atomically (all-or-nothing); on success items become `COMMITTED` and the request `COMMITTED`; STATUTORY items trigger SR posting (FR-011). If M01 is a separate service, the saga/outbox pattern (§10.4) guarantees eventual consistency with compensation on failure.

**Acceptance Criteria:**
1. Commit applies only `APPROVED` items, using `commit_idempotency_key` so re-runs are no-ops.
2. If any item's `old_value_hash` ≠ current M01 value hash, commit aborts that request with CONFLICT and sets `RETURNED` (stale) without partial writes.
3. On success, `committed_at` set, items `COMMITTED`, request `COMMITTED`; audit captures old→new, authority chain, effective date.
4. STATUTORY items enqueue SR posting; request stays `COMMITTED` but item `sr_posting_status` tracks separately.
5. M01 unavailability → request `COMMIT_FAILED` with retry; no data loss.

**Business Rules:**
- BR1: Effective date and change_type are passed to M01 so it can store the value with correct temporality.
- BR2: Commit writes to `audit_log` the complete provenance (who approved, on what authority, against which documents).
- BR3: No commit without a complete approval set and (for STATUTORY) valid e-signature.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | item_status, commit key, sr_posting_status |
| `change_requests` | UPDATE | status, committed_at |
| `employees` (M01) | UPDATE (via contract) | field value, version |
| `audit_log` | INSERT | full provenance |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `CommitService.apply(request)` | Triggered on APPROVED |
| GET | `/api/v1/change-requests/{id}/commit-status` | Commit/SR status |

**UI Behavior Notes:** Requester sees "Approved & applied" with effective date; failed commit shows "Applied with errors — HR notified"; HR sees a commit-failures queue with retry.

**Edge Cases:** Master changed concurrently (stale → return); M01 partial write (saga compensation reverts); duplicate commit trigger (idempotent no-op); STATUTORY commit succeeds but SR posting fails (commit retained, SR retried — FR-011).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `CommitStatusPanel`, HR `CommitFailureQueue` with retry. |
| Backend-Service Flow | `CommitService.apply()`: re-check hashes → open transaction/saga → write each item to M01 → mark COMMITTED → enqueue SR for statutory → audit. |
| Data Operations | UPDATE items + request; M01 field update via contract; INSERT audit; enqueue SR job. |
| Validation Logic | Stale hash check; approval-complete + e-sign check; idempotency. |
| Authorization Logic | System-triggered; manual retry restricted to HR Admin. |
| State Changes & Side Effects | `APPROVED→COMMITTED` (or `COMMIT_FAILED`/`RETURNED`); SR enqueue. |
| Failure Handling | Atomic rollback/saga compensation; retry with backoff; alert HR on persistent failure. |
| Dependencies & Reuse | M01 commit contract; SR posting (011); audit; outbox. |
| Test Guidance | Idempotent re-run; stale conflict; multi-item atomicity; M01 down→retry; saga compensation. |

---

### FR-M02-011 — Statutory Change Posting to Digital Service Register (M12)

- **Module:** M02-EPDM
- **Primary Role(s):** System (post-commit)
- **User Story:** *As the SR Custodian, I want approved statutory personal-detail changes automatically and reliably recorded in the Service Register, so that the statutory record stays authoritative and complete.*

**Description:** For committed items whose field has `post_to_sr = true`, M02 posts an idempotent event to M12's `service_register_events` ledger via the M12 contract, carrying `sr_event_type`, `employee_id`, effective date, before/after, change-request reference, approval authority and e-signature reference. Posting status is tracked per item; failures are retried with a dead-letter queue and surfaced to HR/SR Custodian. M02 never writes the SR ledger schema directly — it calls M12's API.

**Acceptance Criteria:**
1. Only committed STATUTORY items (`post_to_sr = true`) post to M12.
2. Posting is idempotent on `change_request_item_id + 'SR'`; duplicates are no-ops.
3. Successful posting sets item `sr_posting_status = POSTED` with the returned SR event reference; failure sets `FAILED` and queues retry.
4. The SR event payload includes effective date, before/after, `cr_number`, approver chain and e-signature reference.
5. Persistent posting failure raises an alert to HR Admin + SR Custodian and appears in a reconciliation report.

**Business Rules:**
- BR1: M12 is the system of record for the SR event; M02 only mirrors the approved change.
- BR2: A commit is not considered statutorily complete until SR posting succeeds (tracked, reported, retried).
- BR3: SR posting uses the M12-published event types only; unknown types fail validation at config (FR-012).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | sr_posting_status |
| `service_register_events` (M12) | INSERT (via contract) | event_type, payload, source_ref |
| `cr_sla_events` / `audit_log` | INSERT | posting attempts |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `SrPostingService.post(item)` | Triggered post-commit |
| GET | `/api/v1/change-requests/{id}/sr-status` | SR posting status |
| POST | `/api/v1/change-requests/{id}/sr-retry` | Manual retry (HR Admin) |

**UI Behavior Notes:** SR status chip per statutory item (Posted / Pending / Failed); SR Custodian reconciliation dashboard listing unposted/failed statutory changes with retry.

**Edge Cases:** M12 down (queue + retry, item stays PENDING); M12 rejects payload (validation → FAILED + alert, no silent loss); duplicate post after retry (idempotent); event_type retired in M12 (config alert).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SrStatusChip`, `SrReconciliationDashboard`, retry action. |
| Backend-Service Flow | `SrPostingService.post()`: build payload from committed item + approvals + e-sign → call M12 idempotently → record status. |
| Data Operations | UPDATE item sr_posting_status; INSERT audit; M12 event insert via contract. |
| Validation Logic | post_to_sr=true, event_type valid, idempotency key. |
| Authorization Logic | System-triggered; manual retry: HR Admin/SR Custodian. |
| State Changes & Side Effects | `PENDING→POSTED/FAILED`; alerts on persistent failure. |
| Failure Handling | Retry w/ backoff + dead-letter; reconciliation report; never drops. |
| Dependencies & Reuse | M12 contract; commit (010); notifications (011 list); audit. |
| Test Guidance | Idempotent post; M12 down retry; payload reject; reconciliation listing; manual retry. |

---

### FR-M02-012 — Approval-Matrix & Field-Sensitivity Configuration

- **Module:** M02-EPDM
- **Primary Role(s):** System Administrator
- **User Story:** *As a system administrator, I want to configure which fields are sensitive and how each sensitivity tier is approved, so that governance can adapt without code changes.*

**Description:** Admin UI/API to manage `field_sensitivity_catalog` (classify fields, evidence/e-sign/SR rules, regex) and versioned `approval_matrix_config` + `approval_matrix_rules` (per sensitivity/group/field/change-type: ordered nodes, roles, topology, SLA, escalation, auto-apply). Configurations are versioned with effective dates; activating a new version retires the prior one. Validation prevents invalid routes (no nodes, unknown roles, duplicate levels, unknown SR event types).

**Acceptance Criteria:**
1. Admin can create/edit/version a matrix scoped globally or to an org unit, with DRAFT→ACTIVE→RETIRED lifecycle.
2. Activating a matrix sets `effective_from` and retires the previously active one for the same scope.
3. Saving a rule set is rejected if it has zero nodes for a non-auto-apply sensitivity, references unknown roles, has duplicate `level_no` conflicts, or maps to an unknown M12 event type.
4. Sensitivity-catalog edits are versioned and apply to *new* requests only (in-flight requests keep their snapshot route).
5. All configuration changes are audited with before/after.

**Business Rules:**
- BR1: Config changes never retroactively alter in-flight requests' routes.
- BR2: Only System Admin may configure; this role cannot self-approve transactions (SoD).
- BR3: A global default matrix must always exist (cannot retire the last active global matrix).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `field_sensitivity_catalog` | CRUD (versioned) | sensitivity, rules, regex |
| `approval_matrix_config` / `_rules` | CRUD (versioned) | nodes, roles, SLA |
| `audit_log` | INSERT | config before/after |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/admin/field-sensitivity` | Manage catalog |
| GET/POST/PATCH | `/api/v1/admin/approval-matrices` | Manage matrices |
| POST | `/api/v1/admin/approval-matrices/{id}/activate` | Activate version |

**UI Behavior Notes:** Field catalog grid with inline sensitivity/rule editing; matrix builder with drag-order levels, parallel grouping, role pickers, SLA inputs; validation summary before activation; version history with diff.

**Edge Cases:** Attempt to retire last global matrix (blocked); overlapping effective dates for same scope (blocked); role removed from RBAC still referenced (validation error); regex invalid (rejected).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `FieldCatalogGrid`, `MatrixBuilder`, `ActivationDialog`, `ConfigVersionHistory`. |
| Backend-Service Flow | `ConfigService` validates + versions; activation transitions states atomically. |
| Data Operations | Versioned INSERT (new version), UPDATE status; audit before/after. |
| Validation Logic | Non-empty route, known roles/event types, no duplicate levels, valid regex, single active global. |
| Authorization Logic | System Admin only. |
| State Changes & Side Effects | `DRAFT→ACTIVE→RETIRED`; new versions affect future requests only. |
| Failure Handling | Invalid config rejected pre-save; activation rollback on partial failure. |
| Dependencies & Reuse | Consumed by routing (002); RBAC roles; M12 event-type registry. |
| Test Guidance | Versioning; activation retires prior; invalid-route rejection; in-flight snapshot immunity; last-global guard. |

---

### FR-M02-013 — Delegation of Approval Authority

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers (delegate own authority); System Admin (any)
- **User Story:** *As an approver going on leave, I want to delegate my approval authority for a period, so that requests keep moving while my decisions remain accountable.*

**Description:** Lets an approver delegate their approval authority (optionally scoped by org unit and node types) to another eligible user for a validity window. During that window, the delegate appears as the resolved assignee for matching tasks; decisions record both `assigned_to` (delegate) and `delegated_from`. Delegations can be revoked; they auto-expire. SoD still applies to the delegate (a delegate cannot approve a request they made or that targets them).

**Acceptance Criteria:**
1. An approver can create a delegation to an eligible user with `valid_from/valid_to`, optional scope and node types.
2. While active, new and pending tasks within scope resolve to the delegate; the audit shows delegate + delegator.
3. Delegations can be revoked early (`REVOKED`) and auto-expire (`EXPIRED`) past `valid_to`.
4. A delegate subject to SoD on a specific request is excluded for that request (falls back to delegator/escalation).
5. Overlapping delegations resolve by most-specific scope then most-recent.

**Business Rules:**
- BR1: Delegate must hold a role capable of the delegated node type (cannot elevate privilege).
- BR2: Delegation does not transfer configuration rights, only approval actions.
- BR3: Circular delegation (A→B while B→A overlapping for same scope) is blocked.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `delegations` | CRUD | delegator, delegate, scope, window, status |
| `change_request_approvals` | INSERT | delegated_from on decision |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/delegations` | List/create |
| POST | `/api/v1/delegations/{id}/revoke` | Revoke |

**UI Behavior Notes:** "Delegate my approvals" form with eligible-user search, date range, scope/node-type selectors; banner on approver dashboard when acting as a delegate; admin view of all active delegations.

**Edge Cases:** Delegate also unavailable (escalation applies); delegation window overlaps a holiday (still honored); attempt to delegate to ineligible role (blocked); delegator returns early and revokes (pending tasks revert).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DelegationForm`, `ActingAsDelegateBanner`, admin `DelegationRegistry`. |
| Backend-Service Flow | `DelegationService.resolveAssignee(task)`: find active delegation by scope/node/time, validate eligibility + SoD. |
| Data Operations | CRUD delegations; record delegated_from on approval; audit. |
| Validation Logic | Eligibility (role capability), no privilege elevation, no circular, window validity, SoD per request. |
| Authorization Logic | Create own: approver; create any/revoke any: System Admin. |
| State Changes & Side Effects | Reassigns task resolution; audit dual-attribution. |
| Failure Handling | Ineligible delegate blocked; resolution fallback to delegator/escalation. |
| Dependencies & Reuse | Approvals (004), SLA escalation (007), RBAC. |
| Test Guidance | Active-window routing; revoke reverts; SoD exclusion; overlap precedence; ineligible block. |

---

### FR-M02-014 — Change-Request Templates

- **Module:** M02-EPDM
- **Primary Role(s):** System Admin / HR Admin (author); Requesters (use)
- **User Story:** *As an employee, I want guided templates for common changes (e.g., "Update bank account"), so that I provide the right fields and documents the first time.*

**Description:** Reusable templates pre-select a set of fields, prescribe required document types and show guidance text, reducing errors and rejections. Requesters start a request "from template"; the editor pre-populates field rows and evidence requirements. Templates are scoped (global or org unit) and can be activated/deactivated.

**Acceptance Criteria:**
1. Admin/HR Admin can create templates specifying `field_keys`, `required_doc_types`, instructions, change_type.
2. Requesters can start a request from an active template scoped to them; the editor pre-fills the field rows.
3. Templates only include fields the requester is authorized to edit; unauthorized fields are filtered at use time.
4. Deactivated templates are not selectable but historical requests retain their `template_id`.

**Business Rules:**
- BR1: A template cannot bypass sensitivity/route rules; it only pre-fills the form.
- BR2: Required doc types in a template are guidance; the catalog's `requires_document` remains authoritative for gating.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_templates` | CRUD | field_keys, doc types, instructions |
| `change_requests` | INSERT | template_id linkage |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-request-templates` | List available |
| POST | `/api/v1/change-requests?fromTemplate={id}` | Start from template |
| POST/PATCH | `/api/v1/admin/change-request-templates` | Manage |

**UI Behavior Notes:** Template gallery on the "New request" screen with descriptions and required-document hints; pre-filled editor with instructions panel.

**Edge Cases:** Template references a now-non-governed field (filtered with notice); requester unauthorized for some template fields (those rows omitted); template deactivated mid-draft (draft continues, new starts blocked).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `TemplateGallery`, pre-filled `ChangeRequestEditor`, `InstructionsPanel`. |
| Backend-Service Flow | `TemplateService.instantiate()` filters fields by authorization, seeds items + doc hints. |
| Data Operations | READ template; INSERT request with template_id; CRUD templates (admin). |
| Validation Logic | Active+scope check; field-authorization filter; governed-field check. |
| Authorization Logic | Use: any requester (scoped); manage: HR Admin/System Admin. |
| State Changes & Side Effects | Creates DRAFT seeded from template. |
| Failure Handling | Invalid/inactive template → NOT_FOUND/CONFLICT; partial field filtering with notice. |
| Dependencies & Reuse | Authoring (001), catalog (012). |
| Test Guidance | Pre-fill; unauthorized-field filtering; inactive block; historical retention. |

---

### FR-M02-015 — E-Signature on High-Sensitivity Approvals

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers on HIGH/STATUTORY nodes
- **User Story:** *As a senior approver sanctioning a statutory change, I want to apply a verifiable e-signature, so that my authorization is legally attributable and tamper-evident.*

**Description:** Captures a cryptographically attributable e-signature when an approver decides on a node configured `requires_esignature` (HIGH bank-account approvals, all STATUTORY sanctions). Supports OTP re-auth, PKI/DSC, Aadhaar e-Sign, or password re-authentication per policy. The signed payload hash binds the exact decision (request id, items, decision, timestamp); the signature is stored append-only in `esignatures` and referenced by the approval and any SR event.

**Acceptance Criteria:**
1. A decision on a `requires_esignature` node cannot be persisted without a successful e-signature capture.
2. The `signed_payload_hash` is the SHA-256 of the canonical decision payload; tampering invalidates verification.
3. Signature metadata (method, signer, timestamp, IP, user-agent) is recorded append-only.
4. The e-signature reference is included in the SR event payload (FR-011) for STATUTORY changes.
5. Failed signature attempts are recorded and do not advance the node.

**Business Rules:**
- BR1: The signer must be the acting approver (or valid delegate) — signature identity = decision identity.
- BR2: E-signatures are immutable; a re-decision requires a new signature.
- BR3: Supported methods are policy-configurable; at least one strong method (PKI/DSC or Aadhaar) is required for STATUTORY.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `esignatures` | INSERT | method, payload hash, signer, metadata |
| `change_request_approvals` | UPDATE | esignature_id |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/esign` | Capture signature |
| GET | `/api/v1/change-requests/{id}/esignatures` | List (auditor) |

**UI Behavior Notes:** Signature modal triggered on Approve for sensitive nodes; method selector; OTP/DSC/Aadhaar flows; confirmation of signed payload summary; clear "You are legally signing this decision" notice.

**Edge Cases:** Signature provider down (decision blocked, retry; UPSTREAM_UNAVAILABLE); payload changed after signing attempt (hash mismatch → re-sign); delegate signs (identity recorded as delegate with delegator link).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `EsignModal` with method-specific flows + payload preview. |
| Backend-Service Flow | `EsignService.capture()`: build canonical payload → hash → invoke provider → persist signature → link to approval → allow decide. |
| Data Operations | INSERT esignatures; UPDATE approval esignature_id; audit. |
| Validation Logic | Node requires e-sign; signer = approver/delegate; hash binding; method policy for STATUTORY. |
| Authorization Logic | Acting approver/delegate on the node only. |
| State Changes & Side Effects | Enables decision persistence; reference flows to SR event. |
| Failure Handling | Provider failure blocks decision; failed attempts logged; hash mismatch forces re-sign. |
| Dependencies & Reuse | Approvals (004), SR posting (011), external e-sign providers. |
| Test Guidance | Block decision w/o e-sign; hash binding; provider down; delegate signing; method policy enforcement. |

---

### FR-M02-016 — Change Provenance, Field History & Audit Reporting

- **Module:** M02-EPDM
- **Primary Role(s):** Auditor, HR Admin, Employee (own history)
- **User Story:** *As an auditor, I want a complete, immutable history of who changed what, when, on whose authority and against which document, so that I can verify compliance for any field at any time.*

**Description:** Surfaces the full provenance of every governed-field change: chronological field history (per field, per employee) reconstructed from committed requests, the complete decision trail (recommenders, approvers, sanctioners, delegates, e-signatures), linked evidence, effective vs recorded dates, and SR posting status. Provides exportable audit reports and an employee-facing "my change history" view. All reads are scoped and audited; nothing is editable.

**Acceptance Criteria:**
1. For any field on any employee (within scope), the system shows an ordered history of changes with old→new, dates (effective + recorded), authority chain, evidence and SR reference.
2. Employees can view their own change history; auditors/HR (in scope) can view others'.
3. Reports are filterable (date range, field group, sensitivity, status, org unit) and exportable (CSV/PDF) with pagination.
4. Sensitive values are masked per role even in reports.
5. The history is read-only and any access to sensitive provenance is itself audited.

**Business Rules:**
- BR1: History is derived from immutable sources (`change_request_*`, `audit_log`, `esignatures`); it is never independently editable.
- BR2: Exports honor row-level scope and masking.
- BR3: Reconciliation reports list any committed STATUTORY item not yet `POSTED` to M12.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` / `_items` / `_approvals` | READ | full trail |
| `esignatures`, `cr_sla_events` | READ | signatures, SLA history |
| `audit_log` | READ/INSERT | source + access audit |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/field-history` | Per-field history |
| GET | `/api/v1/reports/change-requests` | Filterable report |
| GET | `/api/v1/reports/sr-reconciliation` | Unposted statutory items |

**UI Behavior Notes:** Timeline view per field; report builder with filters and export; "my changes" tab for employees; masked values with role-gated reveal (audited).

**Edge Cases:** Field changed many times (paginated timeline); export of large dataset (async generation + download link); attempt to access out-of-scope history (FORBIDDEN, audited).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `FieldHistoryTimeline`, `ReportBuilder`, `SrReconciliationReport`, employee `MyChangesTab`. |
| Backend-Service Flow | `HistoryService.fieldHistory()` + `ReportService.query()` with scope + masking; async export worker. |
| Data Operations | READ change_request_* + audit + esignatures; INSERT access-audit; generate export artefact (M13). |
| Validation Logic | Filter validation; pagination bound 100; scope enforcement. |
| Authorization Logic | Own: employee; others: HR/Auditor in scope; masking by `view_sensitive_value`. |
| State Changes & Side Effects | Read-only + access audit; export artefact stored in M13. |
| Failure Handling | Large export async with retry; access denial audited. |
| Dependencies & Reuse | Diff (005), all lifecycle data, M13 for exports. |
| Test Guidance | Field timeline order; scope/masking in reports; async export; reconciliation accuracy; access audit. |

---

## 7. UI Requirements

### 7.1 Key screens

| Screen | Primary role(s) | Purpose |
|---|---|---|
| My Requests (list) | Employee/HR | Track own/initiated requests with status, SLA, action-needed flags |
| New Request / Template Gallery | Employee/HR | Start a request (blank or from template) |
| Change Request Editor | Employee/HR | Field picker, before/after diff rows, reason, effective date, document attach |
| Review & Submit | Employee/HR | Final diff summary + computed route preview |
| Approval Workspace | Approvers | Task queue + diff + evidence + decision bar + e-sign |
| Document Verify Panel | HR/authority | Verify/reject evidence beside the diff |
| Bulk Correction Wizard | HR | Upload, validate, review, approve batch |
| Configuration Console | System Admin | Field sensitivity catalog + approval matrix builder |
| Delegation Manager | Approvers/Admin | Create/revoke delegations |
| Field History & Reports | Auditor/HR/Employee | Provenance timelines + exportable reports |
| SR Reconciliation Dashboard | SR Custodian/HR | Unposted/failed statutory changes |

### 7.2 UX standards

- **Mandatory states for every data surface:** empty, loading, error, success, permission-denied, offline. No skeleton-only screens.
- **Accessibility:** WCAG 2.1 AA — keyboard navigable, focus-visible, ARIA labels, AA contrast, screen-reader-friendly diff (announces "old/new").
- **Responsive & mobile-first:** collapsible sidebar with hamburger toggle; approval actions usable on mobile.
- **Sensitive-value masking** by default with audited reveal for authorized roles.
- **Inline validation** with field-level messages mapping to the API error envelope `field`.
- **Status semantics:** consistent color/iconography for statuses and SLA (green/amber/red).
- **i18n & locale:** `DD-MMM-YYYY` dates, INR formatting, translatable labels; UTC stored.
- **Confirmation & undo:** destructive/irreversible actions (reject, withdraw, activate matrix) require explicit confirmation; e-sign actions show legal notice.
- **Toasts & notifications** for async outcomes (submit, decision, commit, SR posting).

### 7.3 Notable component behaviors

- Diff cards render typed values and character/segment highlights; multi-line/JSON fields use structured diff.
- Approval queue shows SLA countdown chips and sensitivity badges; overdue filter.
- Bulk validation grid filters valid/invalid with inline error reasons and downloadable report.
- Matrix builder supports drag-ordered levels, parallel grouping, role pickers, and pre-activation validation summary.

---

## 8. API & Integration

### 8.1 Conventions

- Base path `/api/v1`; JSON; JWT bearer auth; RBAC + row-level scope enforced server-side.
- All list endpoints paginated (`?page=&limit=` or cursor), hard max `limit = 100`.
- Idempotency: state-changing commit/post operations accept/honor idempotency keys.
- Timestamps ISO-8601 UTC; money INR; dates `YYYY-MM-DD` in payloads, `DD-MMM-YYYY` in UI.

### 8.2 Canonical error envelope

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Effective date must be on or before original DOB date.", "field": "effective_date" },
  "requestId": "req_8f2c1a9b"
}
```

### 8.3 HTTP / error-code catalog

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad field format, effective-date/range violation, missing required field |
| `AUTH_REQUIRED` | 401 | Missing/expired token |
| `FORBIDDEN` | 403 | Ownership/scope/SoD/permission violation |
| `NOT_FOUND` | 404 | Unknown request/template/field/batch |
| `CONFLICT` | 409 | Stale value, duplicate open change, illegal transition, double-decision |
| `RATE_LIMITED` | 429 | Throttle exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error / invalid config fallback |
| `UPSTREAM_UNAVAILABLE` | 503 | M01/M12/M13/e-sign provider unavailable |
| `DOCUMENT_REQUIRED` | 422 | Required evidence missing/unverified at approval |
| `ESIGN_REQUIRED` | 422 | Decision on sensitive node without e-signature |
| `STALE_MASTER_VALUE` | 409 | `old_value_hash` ≠ current M01 value at commit |
| `SR_POSTING_FAILED` | 502 | M12 rejected/failed statutory posting |
| `SOD_VIOLATION` | 403 | Maker/target attempting to approve |

### 8.4 Endpoint catalog (selected)

| Method | Path | FR |
|---|---|---|
| POST | `/api/v1/change-requests` | 001/014 |
| POST | `/api/v1/change-requests/{id}/submit` | 001/002 |
| GET | `/api/v1/change-requests/{id}/diff` | 005 |
| POST | `/api/v1/change-requests/{id}/documents` | 003 |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/decide` | 004 |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/esign` | 015 |
| POST | `/api/v1/change-requests/{id}/withdraw` | 006 |
| GET | `/api/v1/approvals/queue` | 004 |
| POST | `/api/v1/bulk-corrections/{id}/approve` | 009 |
| GET | `/api/v1/employees/{id}/field-history` | 016 |

### 8.5 JSON examples

**(1) Create change request — `POST /api/v1/change-requests`**

```json
// Request
{
  "targetEmployeeId": "emp-045",
  "changeType": "CORRECTION",
  "effectiveDate": "1990-05-12",
  "reason": "DOB recorded incorrectly at joining; gazette correction issued.",
  "items": [
    { "fieldKey": "dob", "newValue": "1990-05-12" }
  ]
}
// Response 201
{
  "changeRequestId": "7a1e02",
  "crNumber": "CR-2026-000124",
  "status": "PENDING_DOCS",
  "highestSensitivity": "STATUTORY",
  "routePreview": [
    { "levelNo": 1, "nodeType": "VERIFY", "requiredRole": "HR_OFFICER", "slaHours": 48 },
    { "levelNo": 2, "nodeType": "SANCTION", "requiredRole": "DEPT_HEAD", "slaHours": 72, "requiresEsignature": true }
  ],
  "requestId": "req_001"
}
```

**(2) Approve a node — `POST /api/v1/change-requests/{id}/approvals/{nodeId}/decide`**

```json
// Request
{ "decision": "APPROVED", "comment": "Gazette + birth certificate verified.", "esignatureId": "es-01" }
// Response 200
{ "nodeId": "apr-03", "decision": "APPROVED", "requestStatus": "APPROVED", "nextNode": null, "requestId": "req_014" }
// Error 422 (sensitive node without e-sign)
{ "error": { "code": "ESIGN_REQUIRED", "message": "STATUTORY sanction requires a valid e-signature.", "field": "esignatureId" }, "requestId": "req_015" }
```

**(3) Commit conflict — internal commit surfaced via `GET /commit-status`**

```json
{ "error": { "code": "STALE_MASTER_VALUE", "message": "Master DOB changed since submission; request returned for review.", "field": "dob" }, "requestId": "req_021" }
```

**(4) Field history — `GET /api/v1/employees/{id}/field-history?fieldKey=dob`**

```json
{
  "data": [
    {
      "fieldKey": "dob", "oldValue": "1990-05-21", "newValue": "1990-05-12",
      "changeType": "CORRECTION", "effectiveDate": "1990-05-12", "recordedAt": "2026-06-28T10:20:00Z",
      "crNumber": "CR-2026-000124",
      "authority": [ {"role":"HR_OFFICER","action":"VERIFY"}, {"role":"DEPT_HEAD","action":"SANCTION","esign":"PKI_DSC"} ],
      "documents": ["GAZETTE_NOTIFICATION","BIRTH_CERTIFICATE"], "srStatus": "POSTED"
    }
  ],
  "page": 1, "limit": 50, "total": 1, "requestId": "req_030"
}
```

**(5) Bulk validate — `POST /api/v1/bulk-corrections/{id}/validate`**

```json
{ "batchNumber": "BLK-2026-0007", "totalRows": 250, "validRows": 248, "invalidRows": 2,
  "errors": [ { "row": 17, "code": "VALIDATION_ERROR", "field": "new_value", "message": "Invalid phone format." } ],
  "reportRef": "doc-report-7007", "requestId": "req_040" }
```

### 8.6 External integrations

| System | Direction | Contract |
|---|---|---|
| M01 Employee Master | M02→M01 | Read field/value/version; transactional `applyFieldChange(item, effectiveDate, changeType)` (idempotent) |
| M12 Digital SR | M02→M12 | Idempotent `postServiceRegisterEvent(eventType, employeeId, payload, sourceRef)` |
| M13 Document Mgmt | M02↔M13 | Upload ref, scan-status, reference, export-artefact store |
| M10/M11 Payroll/Pension | M02→ (event) | Emits `governed-field-changed` event with `retro_impact` for recomputation |
| Shared workflow engine | M02↔ | Create instance/tasks, complete tasks, reassign |
| E-Sign provider(s) | M02→ | OTP/PKI-DSC/Aadhaar e-Sign capture + verify |
| Notification platform | M02→ | Email/SMS/in-app via `notifications` |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 < 500 ms for CRUD/list/diff endpoints; commit + SR posting async ≤ 30 s P95; bulk validate streams progress for files up to 50k rows |
| Scalability | Horizontal scaling; queue-based commit/SR posting workers; pagination max 100 |
| Availability | 99.9% uptime; graceful degradation when M01/M12/M13 unavailable (queue + retry, never lose requests) |
| Reliability | RPO ≤ 15 min, RTO ≤ 4 h; idempotent commit/posting; dead-letter queues with reconciliation |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest for `change_request_items` sensitive columns; JWT + RBAC + row-level scope; SoD enforced in DB + service |
| Privacy | DPDP Act 2023 alignment; PII minimisation; sensitive values masked by role; never log raw sensitive old/new values |
| Auditability | Every transition + committed change + sensitive reveal + config change written to immutable `audit_log` |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Structured logs (no PII), metrics (SLA breaches, commit failures, SR posting failures), traceId per request |
| Retention | Requests + audit retained per statutory schedule (default 7 years post-separation, configurable) |
| Compatibility | REST `/api/v1`; backward-compatible versioning; documented contracts for M01/M12/M13 |
| Localization | UTC storage; locale display; INR; translatable UI strings |

---

## 10. Workflow & State Diagrams

### 10.1 Change request lifecycle (state table)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create draft | `DRAFT` | authorized requester |
| `DRAFT` | submit | `SUBMITTED` | valid items, route built, no required-doc pending |
| `DRAFT` | submit (docs needed) | `PENDING_DOCS` | required docs not yet verified |
| `PENDING_DOCS` | all docs verified | `IN_REVIEW` | docs VERIFIED+CLEAN |
| `SUBMITTED` | first node opened | `IN_REVIEW` | route has nodes |
| `SUBMITTED` | auto-apply (LOW) | `APPROVED` | auto_apply_on_low, no docs |
| `IN_REVIEW` | node approved (more left) | `IN_REVIEW` | next node pending |
| `IN_REVIEW` | all nodes approved | `APPROVED` | route complete + e-sign where required |
| `IN_REVIEW`/`PENDING_DOCS` | return | `RETURNED` | approver/verifier, comment |
| `IN_REVIEW`/`PENDING_DOCS` | reject | `REJECTED` | approver, comment |
| `RETURNED` | resubmit | `SUBMITTED` | requester fixes, re-route |
| `DRAFT`/`SUBMITTED`/`PENDING_DOCS`/`RETURNED`/`IN_REVIEW` | withdraw | `WITHDRAWN` | requester owns |
| `APPROVED` | commit success | `COMMITTED` | hashes valid, M01 applied |
| `APPROVED` | commit fail (M01 down) | `COMMIT_FAILED` | upstream error |
| `APPROVED` | stale at commit | `RETURNED` | hash mismatch |
| `COMMIT_FAILED` | retry success | `COMMITTED` | M01 available |
| `COMMITTED` (multi-item, some failed) | partial | `PARTIALLY_COMMITTED` | some items FAILED |

### 10.2 Item-level states

`PENDING → APPROVED → COMMITTED` (happy path); `PENDING → REJECTED`; `COMMITTED → (sr) POSTED/FAILED`; commit failure → `FAILED`.

### 10.3 Approval node states

`PENDING → APPROVED | REJECTED | RETURNED | SKIPPED(any-one parallel / escalation)`. Terminal nodes are immutable (append-only).

### 10.4 Distributed commit (saga/outbox) note

When M01 is a separate service, commit uses the **outbox pattern**: M02 records intent in an outbox within its own transaction, a worker invokes M01 `applyFieldChange` idempotently, and on confirmation marks items `COMMITTED` and enqueues SR posting. Failure triggers compensation (no partial visible commit) and retry; persistent failure → `COMMIT_FAILED` with alert.

### 10.5 SLA state overlay

Each active node carries an SLA timer: `SLA_SET → (REMINDER_SENT)* → BREACHED → ESCALATED → (REASSIGNED)`. Timers pause in `RETURNED`/`PENDING_DOCS(scan pending)`.

---

## 11. Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Request submitted | Requester (confirm), first approver | In-app + Email | `cr.submitted` |
| Docs required / rejected | Requester | In-app + Email | `cr.docs.needed` |
| Awaiting your approval | Current node approver / delegate | In-app + Email | `cr.task.assigned` |
| SLA reminder (50%/90%) | Current approver | In-app + Email | `cr.sla.reminder` |
| SLA breach / escalation | Escalation role + HR Admin | In-app + Email | `cr.sla.escalated` |
| Approved & applied | Requester | In-app + Email | `cr.committed` |
| Returned for correction | Requester | In-app + Email | `cr.returned` |
| Rejected | Requester | In-app + Email | `cr.rejected` |
| E-signature applied | Signer (receipt), Auditor log | In-app | `cr.esign.receipt` |
| Statutory change posted to SR | SR Custodian, HR Admin | In-app + Email | `cr.sr.posted` |
| SR posting failed | SR Custodian, HR Admin | In-app + Email | `cr.sr.failed` |
| Commit failed | HR Admin | In-app + Email | `cr.commit.failed` |
| Bulk batch validated/committed | Initiator, approver | In-app + Email | `cr.bulk.status` |
| Delegation created/expiring | Delegate, delegator | In-app + Email | `cr.delegation` |

All notifications write to the shared `notifications` ledger; preferences (channel opt-in) respected; never include raw sensitive values.

---

## 12. Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| Change request volume & cycle-time | HR Admin, M14 | Counts by status, sensitivity, field group; median/percentile turnaround |
| SLA compliance & escalations | HR Admin | % within SLA, breaches, escalations, aging buckets |
| Approver workload & delegation | HR Admin | Pending per approver/role; delegation usage |
| Rejection/return analysis | HR Admin | Top rejection reasons, fields, resubmission rates |
| Statutory SR reconciliation | SR Custodian | Committed STATUTORY items vs posted to M12; failures |
| Field-change provenance / audit | Auditor | Full who/what/when/authority/document per field (FR-016) |
| Bulk correction outcomes | HR Admin | Batch success/partial/fail, per-row error patterns |
| Data-quality impact | HR Admin, M14 | Corrections vs updates trend; high-correction fields (data-entry quality signal) |

Reports are filterable, paginated, role-scoped, masked, and exportable (CSV/PDF). Aggregates feed the M14 Dashboard module.

---

## 13. Migration & Launch

### 13.1 Data migration

- Seed `field_sensitivity_catalog` from M01 governed-field inventory (map each field to a sensitivity tier; STATUTORY for name/DOB/gender/national_id/category).
- Seed a default global `approval_matrix_config` (ACTIVE) + rules per the §5.5 seed.
- Import any in-flight legacy change requests as historical/closed records (no re-approval) with provenance preserved where available.
- Backfill `documents` references for migrated evidence via M13.

### 13.2 Cutover

1. Deploy schema + config seed; verify against M01/M12/M13 contracts in staging.
2. Freeze direct master edits; route all governed-field changes through M02.
3. Pilot with one org unit (self-service contact fields only), then expand sensitivity tiers.
4. Enable bulk corrections only after pilot sign-off.

### 13.3 Rollout phasing

| Phase | Scope |
|---|---|
| P1 | LOW/MEDIUM contact & demographic fields, single-level approval |
| P2 | HIGH fields (bank, qualification) + documents + e-sign |
| P3 | STATUTORY fields + SR posting + senior sanction |
| P4 | Bulk corrections, delegation, advanced analytics |

### 13.4 Launch readiness

Acceptance/E2E tests green; SoD constraints verified in DB; M01/M12/M13 contracts validated; reconciliation report empty; rollback plan (disable M02 write path, revert to controlled HR edit with audit) documented; training for HR/approvers; runbooks for commit-failure and SR-posting-failure queues.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 FR → Entities → APIs traceability matrix

| FR | Primary entities | Key APIs | Depends on | Downstream |
|---|---|---|---|---|
| FR-M02-001 | change_requests, change_request_items | POST /change-requests, /submit | 002,003,008,014 | 004 |
| FR-M02-002 | approval_matrix_*, field_sensitivity_catalog, change_request_approvals | /route-preview | 012 | 004,001 |
| FR-M02-003 | change_request_documents, documents(M13) | /documents, /verify | M13 | 004 |
| FR-M02-004 | change_request_approvals, workflow_tasks | /approvals/{node}/decide, /queue | 002,013,015 | 006,010 |
| FR-M02-005 | change_request_items | /diff | 001 | 004,016 |
| FR-M02-006 | change_requests, change_request_approvals | /withdraw, /resubmit | 004 | 002 (re-route) |
| FR-M02-007 | cr_sla_events, workflow_tasks | /sla, scheduler | 002,012 | 011(notify) |
| FR-M02-008 | change_requests, change_request_items | /effective-date-rules | catalog | 010,011 |
| FR-M02-009 | bulk_correction_batches, change_requests | /bulk-corrections/* | 002,010,011,M13 | 010,011 |
| FR-M02-010 | change_request_items, employees(M01) | CommitService, /commit-status | 004,M01 | 011 |
| FR-M02-011 | change_request_items, service_register_events(M12) | SrPosting, /sr-status, /sr-retry | 010,M12 | 016 |
| FR-M02-012 | field_sensitivity_catalog, approval_matrix_* | /admin/* | RBAC,M12 types | 002 |
| FR-M02-013 | delegations, change_request_approvals | /delegations | RBAC | 004,007 |
| FR-M02-014 | change_request_templates, change_requests | /change-request-templates | 012 | 001 |
| FR-M02-015 | esignatures, change_request_approvals | /esign | 004,provider | 011 |
| FR-M02-016 | all change_request_*, esignatures, audit_log | /field-history, /reports/* | all | M14 |

### 14.2 Dependency on other modules

| Module | Nature | Direction |
|---|---|---|
| M01 Employee Master | Read field values; commit approved changes | M02↔M01 |
| M12 Digital SR | Post statutory change events | M02→M12 |
| M13 Document Mgmt | Store/reference/scan evidence + exports | M02↔M13 |
| M10/M11 Payroll/Pension | Consume governed-field-changed events (retro impact) | M02→M10/M11 |
| M14 Dashboard | Consume analytics | M02→M14 |
| Shared workflow engine | Routing/tasks/SLA | M02↔shared |
| Platform (auth, notifications, audit) | Identity, notify, audit | M02↔platform |

### 14.3 Parallel-agent build plan

| Workstream | FRs | Can parallelize after |
|---|---|---|
| A — Data & config foundation | 012, schema (E1–E12), seeds | first |
| B — Authoring & diff | 001, 005, 014 | A |
| C — Routing & approval | 002, 004, 013 | A |
| D — Evidence & e-sign | 003, 015 | A |
| E — Lifecycle & SLA | 006, 007, 008 | C |
| F — Commit & downstream | 010, 011 | C, M01/M12 contracts |
| G — Bulk | 009 | F |
| H — History & reporting | 016 | B–F |

### 14.4 Final Contract Reconciliation Table (0 unresolved gaps)

| Contract surface | Producer | Consumer | Status |
|---|---|---|---|
| Editable-fields + current value/version | M01 | M02 (FR-001/010) | Resolved — M01 read contract §8.6 |
| `applyFieldChange` idempotent commit | M01 | M02 (FR-010) | Resolved — saga/outbox §10.4 |
| `postServiceRegisterEvent` idempotent | M12 | M02 (FR-011) | Resolved — §8.6 contract |
| Document upload/scan/reference/export | M13 | M02 (FR-003/009/016) | Resolved — §8.6 |
| Workflow instance/task/reassign | Shared engine | M02 (FR-002/004/007) | Resolved — §4.2 |
| RBAC role keys for matrix | Platform | M02 (FR-012) | Resolved — Shared §4 |
| Notification ledger + templates | Platform | M02 (FR-011 notify) | Resolved — §11 |
| Audit log writes | Platform | M02 (all FRs) | Resolved — §4.2 |
| E-sign provider capture/verify | External | M02 (FR-015) | Resolved — §8.6 |
| governed-field-changed event | M02 | M10/M11 | Resolved — §8.6 |
| Analytics feed | M02 | M14 | Resolved — §12 |
| SoD DB constraint | M02 | M02 | Resolved — §5.6 rule 1 |
| Error envelope + codes | M02 | All clients | Resolved — §8.2/8.3 |
| Sensitivity/route config immutability for in-flight | M02 | M02 | Resolved — FR-012 BR1 |

**Unresolved gaps: 0.**

---

## 15. Glossary

| Term | Definition |
|---|---|
| Maker-Checker | Segregation-of-duties control where the initiator (maker) cannot approve (checker) their own change |
| SoD | Segregation of Duties — maker ≠ checker; no self/target approval |
| Correction | Repair of an erroneous historical value, effective from the original date (may have retro impact) |
| Update | Genuine forward-dated change to a field |
| Effective date | Date from which a change takes effect (distinct from when it was recorded) |
| Sensitivity tier | LOW/MEDIUM/HIGH/STATUTORY classification driving route, evidence and e-sign needs |
| Approval matrix | Configurable rule set mapping sensitivity/scope/field to ordered approval nodes |
| Node / level | A single approval step (recommend/approve/sanction/verify) in a route |
| Topology | Sequential vs parallel execution of nodes at a level |
| Delegation | Temporary transfer of approval authority to another eligible user |
| E-signature | Cryptographically attributable approval signature (OTP/PKI-DSC/Aadhaar/password) |
| Digital SR (M12) | Statutory Digital Service Register; system of record for service events |
| Provenance | Full who/what/when/authority/document trail of a change |
| Stale-value guard | Hash check ensuring the master value did not change between submit and commit |
| Outbox/saga | Pattern ensuring atomic, eventually-consistent commit across M02 and M01 |
| Retro impact | Flag that a correction may require recomputation in payroll/pension/seniority |

## 16. Appendices

### 16.1 Appendix A — Default field sensitivity seed

See §5.5 reference table. Configurable via FR-M02-012.

### 16.2 Appendix B — Sample approval routes by sensitivity

| Sensitivity | Route |
|---|---|
| LOW | [APPROVE: HR_OFFICER] (or auto-apply) |
| MEDIUM | [VERIFY+APPROVE: HR_OFFICER] |
| HIGH | [VERIFY: HR_OFFICER] → [APPROVE: HR_ADMIN] (+e-sign for financial) |
| STATUTORY | [VERIFY: HR_OFFICER] → [SANCTION: DEPT_HEAD/APPOINTING_AUTHORITY] (+e-sign) → SR post |

### 16.3 Appendix C — Canonical commit/SR idempotency keys

- Commit: `commit_idempotency_key = change_request_item_id`.
- SR posting: `source_ref = change_request_item_id + ':SR'`.

### 16.4 Appendix D — Assumptions register

| # | Assumption | Owner | Resolution |
|---|---|---|---|
| A1 | M01 exposes field metadata + idempotent commit | M01 team | Contract §8.6 |
| A2 | M12 exposes idempotent SR posting | M12 team | Contract §8.6 |
| A3 | M13 provides scan-status + references | M13 team | Contract §8.6 |
| A4 | E-sign provider available for STATUTORY | Platform | FR-015 |
| A5 | Business-calendar service available for SLA | Platform | FR-007 |

### 16.5 Appendix E — Open items

None blocking. All cross-module contracts reconciled (§14.4) with 0 unresolved gaps.
