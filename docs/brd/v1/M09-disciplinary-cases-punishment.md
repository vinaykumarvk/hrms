# Employee Disciplinary Cases and Punishment Management — HRMS Module BRD

**Module code:** M09-DCP
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite")
**Document version:** v1.0
**Status:** Baseline for build
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM) layered on public-sector statutory due-process (CCS (CCA)-style rules).
**Shared contract:** This BRD consumes and does **not** redefine the canonical entities, roles, conventions, and technical defaults in [`SHARED_FOUNDATION.md`](../SHARED_FOUNDATION.md).

---

## 1. Executive Summary

### 1.1 Purpose

The Employee Disciplinary Cases and Punishment Management module (**M09-DCP**) digitises the **end-to-end disciplinary lifecycle** of a public-sector / government employer, from the first receipt of a complaint or detection of misconduct through preliminary inquiry, optional suspension, framing of articles of charge, departmental inquiry, penalty imposition, and statutory appeal / revision / review — concluding with an immutable posting of the outcome (punishment **or** exoneration) into the Digital Service Register (M12).

The module exists to guarantee that **every** disciplinary proceeding satisfies the **principles of natural justice** (audi alteram partem — the right to be heard; nemo judex in causa sua — no one a judge in their own cause), respects **statutory timelines**, preserves a **tamper-evident audit trail**, and produces legally defensible orders that withstand departmental appeal and judicial review.

### 1.2 Business context

Disciplinary action against a government servant is a **quasi-judicial** process. A procedural defect — a denied opportunity to defend, an inquiry officer who is also a witness, a charge-sheet served after a barred period, a penalty exceeding what was proposed in the show-cause — routinely results in penalty orders being set aside on appeal or by tribunals/courts, with consequential financial liability (back-wages, restoration of seniority, pension re-computation). Today these cases are run on paper files that are slow, opaque, prone to loss, and impossible to audit at scale.

M09-DCP converts this risk-laden manual process into a **controlled, time-bound, fully audited workflow** with built-in natural-justice safeguards, a sealed evidence vault, and real-time SLA monitoring.

### 1.3 Module objectives

| # | Objective | Measure of success |
|---|-----------|--------------------|
| O1 | Enforce due process and natural justice at every transition | 100% of penalty orders carry a complete, sequential audit chain; 0 stage-skips |
| O2 | Track statutory and internal SLAs per stage | Real-time SLA dashboard; escalation on breach; ≥ 95% of stages closed within SLA |
| O3 | Guarantee confidentiality and integrity of case records | Field-level RBAC, sealed evidence vault, immutable audit_log on every action |
| O4 | Produce legally defensible orders | Each penalty order traces to a served charge, recorded defence, inquiry finding, and (for major penalties) a show-cause |
| O5 | Propagate outcomes to dependent modules accurately | Penalty/exoneration posted to M12 SR; effects flowed to M06 (seniority/promotion), M10 (payroll/subsistence), M11 (pension) |
| O6 | Provide case analytics & vigilance oversight | Caseload, ageing, penalty-mix, appeal-overturn, and vigilance-clearance dashboards |

### 1.4 Scope summary

In scope: complaint intake, preliminary inquiry, suspension & subsistence allowance, charge-sheet (articles of charge / statement of imputations), statement of defence, appointment of Inquiry Officer (IO) & Presenting Officer (PO), conduct of departmental inquiry (witnesses, exhibits, daily order sheets, ex-parte proceedings), inquiry report & findings, disagreement memo, minor/major penalty determination, show-cause on proposed penalty, penalty order & exoneration, appeal / revision / review, SR posting and downstream effects, evidence vault, integrity register, vigilance clearance, SLA tracking, and analytics.

Out of scope (owned elsewhere, integrated here): the SR ledger itself (M12), payroll execution of recoveries/subsistence (M10), pension re-computation engine (M11), seniority list recomputation (M06), the physical document store (M13), and identity/SSO (platform).

### 1.5 Key outcomes

A complete, confidential, time-bound, audit-grade disciplinary case system that an enterprise/government HR organisation can rely on for **defensible** penalty orders, **transparent** ageing, and **accurate** downstream propagation of consequences.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Area | Feature | FR(s) |
|------|---------|-------|
| Intake | Complaint / source-of-misconduct registration & triage | FR-M09-001 |
| Fact-finding | Preliminary (fact-finding) inquiry | FR-M09-002 |
| Interim action | Suspension, revocation, subsistence allowance, deemed suspension | FR-M09-003 |
| Charge | Charge-sheet / articles of charge / statement of imputations | FR-M09-004 |
| Defence | Employee's written statement of defence; admission/denial | FR-M09-005 |
| Inquiry setup | Appointment of Inquiry Officer & Presenting Officer | FR-M09-006 |
| Inquiry conduct | Hearings, witnesses, exhibits, daily order sheets, ex-parte | FR-M09-007 |
| Inquiry close | Inquiry report & findings (proved / not proved) | FR-M09-008 |
| DA consideration | Disagreement memo & disciplinary authority decision | FR-M09-009 |
| Natural justice | Show-cause on proposed penalty (major penalty / enhancement) | FR-M09-010 |
| Outcome | Penalty order (minor/major) & exoneration order | FR-M09-011 |
| Remedies | Appeal / revision / review | FR-M09-012 |
| Propagation | SR posting & downstream effects (M06/M10/M11/M12) | FR-M09-013 |
| Records | Document evidence vault (link to M13) | FR-M09-014 |
| Oversight | Integrity register & vigilance clearance status | FR-M09-015 |
| Governance | SLA / statutory-timeline tracking & case analytics | FR-M09-016 |

### 2.2 Common Capabilities (inherited, applied module-wide)

- **Maker-checker / workflow engine** (`workflow_instances` / `workflow_tasks`) for every stage transition that changes statutory state.
- **Segregation of duties:** maker ≠ checker; the Disciplinary Authority (DA), Inquiry Officer (IO), Presenting Officer (PO), and any witness must be **mutually distinct** persons; no self-approval.
- **Immutable audit** (`audit_log`) on every create/update/transition/view-of-sealed-record.
- **Document handling** via M13 (`documents`) — all artefacts are versioned, encrypted, access-controlled objects referenced by metadata.
- **Notifications** via shared `notifications` ledger (in-app + email + optional SMS).
- **Pagination** on all list endpoints (page/limit, hard max 100).
- **Localisation:** UTC storage, `DD-MMM-YYYY` display, INR money formatting.
- **RBAC + row-level org scoping**, extended in §3 with field-level confidentiality controls.

### 2.3 Boundaries & integration points

| Boundary | Direction | Contract |
|----------|-----------|----------|
| M01-EPM (employees) | read | Charged employee, complainant, IO/PO identity, designation, org_unit, employment_status |
| M12-SR (service_register_events) | write (append-only) | Suspension, penalty, exoneration, appeal outcome events |
| M10-PAY | write (event) | Suspension → subsistence allowance; recovery penalty; pay reduction; promotion/increment withholding |
| M11-PEN | write (event) | Pension cut/withholding flags; effect of removal/dismissal/compulsory retirement on terminal benefits |
| M06-PPP | write (event) | Reduction in rank, withholding of promotion, seniority re-fixation |
| M13-DMS | read/write | Evidence vault objects, charge-sheet PDFs, orders |
| M14-DAS | read | KPI feed for cross-module dashboards |
| Platform | read | Auth/SSO/MFA, roles, org tree |

### 2.4 Explicit non-goals

- M09 does **not** compute payroll, pension, or seniority figures; it emits **events** that the owning module executes.
- M09 does **not** store document binaries; it stores references to M13 objects.
- Criminal prosecution case management (police/court FIR tracking) is **linked** (reference fields) but not executed here.

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict)

| Role | Description | Source |
|------|-------------|--------|
| Employee (Charged Officer) | The government servant facing proceedings; restricted self-service view of own case | Shared |
| Complainant / Reporting Source | Raises a complaint; limited view of own complaint status | Shared (Employee/Manager) |
| Vigilance Officer | Screens complaints, maintains integrity register & vigilance clearance | M09 |
| Disciplinary Authority (DA) | Competent authority who initiates charges, considers inquiry report, imposes penalty | Shared (Appointing/Disciplinary Authority) |
| Inquiry Officer (IO) | Conducts the departmental inquiry impartially | Shared (M09-specific) |
| Presenting Officer (PO) | Presents the case on behalf of the department before the IO | M09 |
| Defence Assistant (DA-Asst) | Person assisting the charged officer (co-employee/retired official, not legal counsel unless permitted) | M09 |
| Disciplinary Case Manager / HR-DCP Admin | Operates the case workbench, drafts artefacts, manages SLAs | Shared (HR Admin) |
| Appellate Authority | Decides appeals | M09 |
| Reviewing / Revising Authority | Exercises suo-motu review/revision | M09 |
| Auditor (read-only) | Cross-module read + audit access, no write | Shared |
| System Administrator | Config, reference data, RBAC; no transactional self-approval | Shared |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve/Decide, X=No access)

| Capability | Employee (Charged) | Complainant | Vigilance Officer | DA | IO | PO | DCP Admin | Appellate Auth | Reviewing Auth | Auditor | SysAdmin |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Register complaint | X | C | C | C | X | X | C | X | X | X | X |
| Triage / screen complaint | X | X | C/A | A | X | X | U | X | X | R | X |
| Order preliminary inquiry | X | X | C | A | X | X | C | X | X | R | X |
| Order/revoke suspension | X | X | R | A | X | X | C | X | X | R | X |
| Issue charge-sheet | X | X | R | A | X | C(draft) | C(draft) | X | X | R | X |
| Submit statement of defence | C | X | X | R | R | R | R | X | X | R | X |
| Appoint IO/PO | X | X | R | A | X | X | C | X | X | R | X |
| Conduct inquiry / record hearings | R(own) | X | R | R | C/U | C(evidence) | U | X | X | R | X |
| Submit inquiry report | X | X | R | R | C/A | R | R | X | X | R | X |
| Record disagreement memo | X | X | X | C/A | R | X | U | X | X | R | X |
| Issue show-cause notice | R(own) | X | R | A | X | X | C(draft) | X | X | R | X |
| Pass penalty / exoneration order | R(own) | X | R | A | X | X | C(draft) | X | X | R | X |
| File appeal | C | X | X | R | X | X | R | R | X | R | X |
| Decide appeal | X | X | X | R | X | X | R | A | X | R | X |
| Suo-motu review/revision | X | X | X | R | X | X | R | X | A | R | X |
| Post to Service Register | X | X | X | A | X | X | C | X | X | R | X |
| Maintain integrity/vigilance register | X | X | C/U | R | X | X | R | X | X | R | X |
| Manage evidence vault | R(own, served only) | X | R | R | C/U | C/U | C/U | R | R | R | X |
| View case analytics | X | X | R | R | X | X | R | R | R | R | X |
| Configure reference data (penalties, SLAs) | X | X | X | X | X | X | X | X | X | X | C/U |

### 3.3 Field-level confidentiality rules

- The **charged officer** may read **only** artefacts that have been **formally served** on them (charge-sheet, inquiry report copy, show-cause, orders) and never the preliminary inquiry report, vigilance notes, or DA's internal deliberation.
- **Complainant identity** is masked from the charged officer unless the case type mandates disclosure; whistle-blower protection flag (`is_confidential_source`) hard-hides identity from all roles except Vigilance Officer and DA.
- IO/PO cannot view the **vigilance register** scoring or the DA's draft penalty reasoning.
- All reads of sealed/confidential records are logged with `view` audit events (read-audit).

---

## 4. Shared Application Foundation

This module **inherits** §5 of `SHARED_FOUNDATION.md` in full:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST `/api/v1`; PostgreSQL; encrypted object storage (M13) for binaries; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level org scoping; **plus** field-level confidentiality (§3.3) and **step-up MFA** for penalty/appeal decisions.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503); module-specific codes in §10.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500 ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min, RTO ≤ 4h.

**Reused canonical entities (referenced, not redefined):** `employees`, `users`, `org_units`, `designations`, `roles`/`permissions`, `service_register_events` (M12), `documents` (M13), `notifications`, `audit_log`, `workflow_instances` / `workflow_tasks`.

---

## 5. Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Owner | Purpose |
|---|--------|------|-------|---------|
| E1 | `disciplinary_cases` | Module | M09 | Master case record (the file) |
| E2 | `case_complaints` | Module | M09 | Source-of-misconduct / complaint intake records |
| E3 | `preliminary_inquiries` | Module | M09 | Fact-finding inquiry before formal charges |
| E4 | `suspensions` | Module | M09 | Suspension / revocation / subsistence allowance |
| E5 | `charge_sheets` | Module | M09 | Memorandum of charges (articles of charge container) |
| E6 | `charge_articles` | Module | M09 | Individual article of charge + statement of imputation |
| E7 | `defence_statements` | Module | M09 | Charged officer's written statement of defence |
| E8 | `inquiry_proceedings` | Module | M09 | The departmental inquiry instance |
| E9 | `inquiry_appointments` | Module | M09 | IO / PO / Defence Assistant appointments |
| E10 | `inquiry_hearings` | Module | M09 | Daily order sheets / hearing log |
| E11 | `inquiry_witnesses` | Module | M09 | Listed/examined witnesses (prosecution & defence) |
| E12 | `inquiry_exhibits` | Module | M09 | Documentary/material evidence (vault items) |
| E13 | `inquiry_reports` | Module | M09 | IO findings (article-wise proved/not proved) |
| E14 | `disagreement_memos` | Module | M09 | DA disagreement with IO findings |
| E15 | `show_cause_notices` | Module | M09 | Notice on proposed penalty |
| E16 | `penalty_orders` | Module | M09 | Final order (penalty/exoneration) |
| E17 | `penalty_items` | Module | M09 | Individual penalty(ies) imposed |
| E18 | `appeals` | Module | M09 | Appeal / revision / review applications & decisions |
| E19 | `case_timeline_events` | Module | M09 | SLA-tracked stage events (timeline ledger) |
| E20 | `vigilance_records` | Module | M09 | Integrity register & vigilance clearance status |
| E21 | `case_documents` | Module | M09 (link) | Join between case artefacts and M13 `documents` |
| — | `employees`, `org_units`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_*` | Shared | M01/M12/M13/platform | Referenced, not redefined |

### 5.2 Full field tables

#### E1 — `disciplinary_cases`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `case_id` | UUID PK | N | |
| `case_no` | VARCHAR(40) UNIQUE | N | Human key, e.g. `DCP/2026/000123` |
| `charged_employee_id` | UUID FK→employees | N | Subject of proceedings |
| `org_unit_id` | UUID FK→org_units | N | Owning office (row-level scope) |
| `case_type` | ENUM `case_type` | N | MAJOR_PENALTY_TRACK / MINOR_PENALTY_TRACK / VIGILANCE / ADMINISTRATIVE |
| `misconduct_category` | ENUM `misconduct_category` | N | See enum catalog |
| `case_status` | ENUM `case_status` | N | State machine (§12) |
| `current_stage` | ENUM `case_stage` | N | INTAKE…CLOSED |
| `disciplinary_authority_id` | UUID FK→employees | N | Competent DA |
| `is_confidential` | BOOLEAN | N | Default true |
| `is_confidential_source` | BOOLEAN | N | Whistle-blower protection |
| `vigilance_flag` | BOOLEAN | N | Routed through Vigilance |
| `criminal_case_ref` | VARCHAR(80) | Y | Linked FIR/court ref |
| `statutory_basis` | VARCHAR(120) | N | Rule cited (e.g. CCS(CCA) Rule 14) |
| `date_initiated` | DATE | N | |
| `expected_closure_date` | DATE | Y | SLA target |
| `actual_closure_date` | DATE | Y | |
| `outcome_summary` | TEXT | Y | Filled at closure |
| `created_at`/`updated_at` | TIMESTAMPTZ | N | |
| `created_by`/`updated_by` | UUID | N | |
| `is_deleted` | BOOLEAN | N | Soft delete |

#### E2 — `case_complaints`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `complaint_id` | UUID PK | N | |
| `complaint_no` | VARCHAR(40) UNIQUE | N | |
| `case_id` | UUID FK→disciplinary_cases | Y | Null until promoted to a case |
| `subject_employee_id` | UUID FK→employees | N | Alleged delinquent |
| `source_type` | ENUM `complaint_source` | N | INTERNAL / PUBLIC / ANONYMOUS / AUDIT / MEDIA / CVC / SUO_MOTU |
| `complainant_id` | UUID FK→employees | Y | Null if external/anonymous |
| `complainant_name_ext` | VARCHAR(160) | Y | External complainant |
| `is_anonymous` | BOOLEAN | N | |
| `received_date` | DATE | N | |
| `allegation_summary` | TEXT | N | |
| `triage_decision` | ENUM `triage_decision` | Y | FILE_CASE / PRELIMINARY_INQUIRY / CLOSE_NO_ACTION / TRANSFER_AGENCY |
| `triage_remarks` | TEXT | Y | |
| `triaged_by` | UUID FK→employees | Y | |
| `triaged_at` | TIMESTAMPTZ | Y | |
| audit fields | | | created/updated/by/is_deleted |

#### E3 — `preliminary_inquiries`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `pi_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `pi_officer_id` | UUID FK→employees | N | Fact-finding officer |
| `ordered_by` | UUID FK→employees | N | DA/Vigilance |
| `ordered_date` | DATE | N | |
| `due_date` | DATE | N | SLA |
| `status` | ENUM `pi_status` | N | ORDERED / IN_PROGRESS / SUBMITTED / CLOSED |
| `findings_summary` | TEXT | Y | |
| `recommendation` | ENUM `pi_recommendation` | Y | PROCEED_MAJOR / PROCEED_MINOR / DROP / ADMIN_ADVICE |
| `report_document_id` | UUID FK→documents | Y | Confidential — not served |
| `submitted_at` | TIMESTAMPTZ | Y | |
| audit fields | | | |

#### E4 — `suspensions`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `suspension_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `suspension_type` | ENUM `suspension_type` | N | ORDERED / DEEMED (detention>48h) / CONTINUED |
| `order_no` | VARCHAR(40) UNIQUE | N | |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | Null while active |
| `status` | ENUM `suspension_status` | N | ACTIVE / REVOKED / EXTENDED / DEEMED_REVOKED |
| `subsistence_rate_pct` | NUMERIC(5,2) | N | e.g. 50.00 first 3 months |
| `subsistence_revision_due` | DATE | Y | 90/180-day review |
| `review_committee_due` | DATE | Y | Statutory review board |
| `payroll_event_id` | UUID | Y | Correlation to M10 |
| `revoked_reason` | TEXT | Y | |
| `order_document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E5 — `charge_sheets`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `charge_sheet_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `charge_sheet_no` | VARCHAR(40) UNIQUE | N | |
| `penalty_track` | ENUM `penalty_track` | N | MINOR / MAJOR |
| `issued_by` | UUID FK→employees | N | DA |
| `issued_date` | DATE | Y | Set on serve |
| `served_date` | DATE | Y | Date of valid service |
| `service_mode` | ENUM `service_mode` | Y | IN_PERSON / REGD_POST / EMAIL / SUBSTITUTED / PUBLICATION |
| `defence_due_date` | DATE | Y | Statutory window |
| `status` | ENUM `charge_sheet_status` | N | DRAFT / ISSUED / SERVED / RESPONDED / WITHDRAWN |
| `document_id` | UUID FK→documents | Y | Signed PDF |
| `withdrawn_reason` | TEXT | Y | |
| audit fields | | | |

#### E6 — `charge_articles`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `article_id` | UUID PK | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `article_no` | INT | N | Ordinal within sheet |
| `article_text` | TEXT | N | The charge |
| `statement_of_imputation` | TEXT | N | Facts supporting the charge |
| `rule_violated` | VARCHAR(160) | N | Conduct rule reference |
| `finding` | ENUM `article_finding` | Y | PROVED / NOT_PROVED / PARTLY_PROVED (post-inquiry) |
| `finding_reason` | TEXT | Y | |
| audit fields | | | |

#### E7 — `defence_statements`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `defence_id` | UUID PK | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `submitted_by` | UUID FK→employees | N | Charged officer |
| `plea` | ENUM `defence_plea` | N | ADMITS_ALL / DENIES_ALL / PARTIAL / NO_RESPONSE |
| `statement_text` | TEXT | Y | |
| `requests_oral_inquiry` | BOOLEAN | N | |
| `requests_defence_assistant` | BOOLEAN | N | |
| `extension_requested_days` | INT | Y | |
| `submitted_at` | TIMESTAMPTZ | Y | |
| `is_ex_parte_assumed` | BOOLEAN | N | True if no response within window |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E8 — `inquiry_proceedings`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `inquiry_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `status` | ENUM `inquiry_status` | N | NOT_STARTED / IN_PROGRESS / EX_PARTE / CONCLUDED / DE_NOVO |
| `commenced_date` | DATE | Y | |
| `concluded_date` | DATE | Y | |
| `due_date` | DATE | Y | SLA (e.g. 6 months) |
| `is_ex_parte` | BOOLEAN | N | |
| `de_novo_of_inquiry_id` | UUID FK self | Y | Fresh inquiry link |
| audit fields | | | |

#### E9 — `inquiry_appointments`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `appointment_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `role_type` | ENUM `inquiry_role` | N | INQUIRY_OFFICER / PRESENTING_OFFICER / DEFENCE_ASSISTANT |
| `officer_id` | UUID FK→employees | Y | Internal person |
| `external_name` | VARCHAR(160) | Y | External IO/legal counsel if permitted |
| `appointed_by` | UUID FK→employees | N | DA |
| `appointed_date` | DATE | N | |
| `status` | ENUM `appointment_status` | N | ACTIVE / RECUSED / REPLACED / OBJECTED |
| `recusal_reason` | TEXT | Y | Bias/conflict objection handling |
| audit fields | | | |

#### E10 — `inquiry_hearings` (daily order sheet)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hearing_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `hearing_no` | INT | N | Sequential |
| `scheduled_date` | TIMESTAMPTZ | N | |
| `held_date` | TIMESTAMPTZ | Y | |
| `outcome` | ENUM `hearing_outcome` | N | HELD / ADJOURNED / NO_SHOW_CHARGED / NO_SHOW_PO / EX_PARTE_RECORDED |
| `daily_order_text` | TEXT | N | Minutes / order sheet content |
| `next_hearing_date` | TIMESTAMPTZ | Y | |
| `recorded_by` | UUID FK→employees | N | IO |
| `attendees_json` | JSONB | Y | Present parties |
| audit fields | | | |

#### E11 — `inquiry_witnesses`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `witness_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `side` | ENUM `witness_side` | N | PROSECUTION / DEFENCE |
| `witness_employee_id` | UUID FK→employees | Y | If internal |
| `witness_name_ext` | VARCHAR(160) | Y | External |
| `examination_status` | ENUM `witness_status` | N | LISTED / EXAMINED / CROSS_EXAMINED / DROPPED |
| `deposition_text` | TEXT | Y | |
| `examined_on_hearing_id` | UUID FK→inquiry_hearings | Y | |
| audit fields | | | |

#### E12 — `inquiry_exhibits`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `exhibit_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `exhibit_marker` | VARCHAR(20) | N | e.g. `P-1`, `D-3` |
| `side` | ENUM `witness_side` | N | PROSECUTION / DEFENCE |
| `description` | TEXT | N | |
| `document_id` | UUID FK→documents | N | Vault item (M13) |
| `admitted` | BOOLEAN | Y | Admitted into evidence |
| `objection_text` | TEXT | Y | |
| `sealed` | BOOLEAN | N | Sealed vault flag |
| `content_hash` | VARCHAR(64) | N | SHA-256 integrity seal |
| audit fields | | | |

#### E13 — `inquiry_reports`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `report_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `submitted_by` | UUID FK→employees | N | IO |
| `submitted_date` | DATE | N | |
| `overall_finding` | ENUM `overall_finding` | N | ALL_PROVED / NONE_PROVED / MIXED |
| `analysis_text` | TEXT | N | Reasoning & appreciation of evidence |
| `report_document_id` | UUID FK→documents | N | |
| `served_on_charged_date` | DATE | Y | Copy served for representation |
| `status` | ENUM `report_status` | N | SUBMITTED / SERVED / UNDER_DA_REVIEW / ACCEPTED / REMITTED |
| audit fields | | | |

#### E14 — `disagreement_memos`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `memo_id` | UUID PK | N | |
| `report_id` | UUID FK→inquiry_reports | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `issued_by` | UUID FK→employees | N | DA |
| `tentative_disagreement` | TEXT | N | DA's reasons differing from IO |
| `articles_affected_json` | JSONB | N | Which articles, revised view |
| `served_date` | DATE | Y | Served for representation |
| `representation_due_date` | DATE | Y | |
| `representation_text` | TEXT | Y | Charged officer's response |
| `status` | ENUM `memo_status` | N | ISSUED / SERVED / RESPONDED / FINALISED |
| audit fields | | | |

#### E15 — `show_cause_notices`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `notice_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `notice_no` | VARCHAR(40) UNIQUE | N | |
| `proposed_penalty_json` | JSONB | N | Penalty(ies) tentatively proposed |
| `issued_by` | UUID FK→employees | N | DA |
| `issued_date` | DATE | N | |
| `served_date` | DATE | Y | |
| `response_due_date` | DATE | N | |
| `representation_text` | TEXT | Y | |
| `responded_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM `notice_status` | N | ISSUED / SERVED / RESPONDED / NO_RESPONSE / CLOSED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E16 — `penalty_orders`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `order_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `order_no` | VARCHAR(40) UNIQUE | N | |
| `order_type` | ENUM `order_type` | N | PENALTY / EXONERATION / DROP_PROCEEDINGS |
| `passed_by` | UUID FK→employees | N | DA |
| `order_date` | DATE | N | |
| `effective_date` | DATE | Y | |
| `reasoning_text` | TEXT | N | Speaking order |
| `is_speaking_order` | BOOLEAN | N | Must be true to finalise |
| `served_date` | DATE | Y | |
| `sr_event_id` | UUID FK→service_register_events | Y | M12 correlation |
| `status` | ENUM `order_status` | N | DRAFT / FINALISED / SERVED / STAYED / SET_ASIDE / MODIFIED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E17 — `penalty_items`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `penalty_item_id` | UUID PK | N | |
| `order_id` | UUID FK→penalty_orders | N | |
| `penalty_type` | ENUM `penalty_type` | N | See enum catalog (minor/major) |
| `penalty_class` | ENUM `penalty_class` | N | MINOR / MAJOR |
| `duration_months` | INT | Y | e.g. withholding increment for N months |
| `is_cumulative` | BOOLEAN | Y | Increment withholding cumulative effect |
| `recovery_amount` | NUMERIC(14,2) | Y | For recovery penalties |
| `reduction_to_designation_id` | UUID FK→designations | Y | Reduction in rank target |
| `pension_effect` | ENUM `pension_effect` | Y | NONE / WITHHELD / REDUCED_PCT |
| `pension_effect_value` | NUMERIC(5,2) | Y | % if reduced |
| `downstream_event_id` | UUID | Y | Correlation to M06/M10/M11 |
| audit fields | | | |

#### E18 — `appeals`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `appeal_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `order_id` | UUID FK→penalty_orders | N | Order under challenge |
| `remedy_type` | ENUM `remedy_type` | N | APPEAL / REVISION / REVIEW |
| `filed_by` | UUID FK→employees | Y | Charged officer (null for suo-motu) |
| `filed_date` | DATE | N | |
| `limitation_due_date` | DATE | N | Statutory limitation (e.g. 45 days) |
| `is_time_barred` | BOOLEAN | N | |
| `condonation_granted` | BOOLEAN | Y | Delay condonation |
| `authority_id` | UUID FK→employees | N | Appellate/Reviewing authority |
| `grounds_text` | TEXT | Y | |
| `decision` | ENUM `appeal_decision` | Y | UPHELD / SET_ASIDE / MODIFIED / ENHANCED / REMITTED / REJECTED |
| `decision_reasoning` | TEXT | Y | |
| `decided_date` | DATE | Y | |
| `revised_order_id` | UUID FK→penalty_orders | Y | If modified |
| `status` | ENUM `appeal_status` | N | FILED / ADMITTED / UNDER_REVIEW / DECIDED / REJECTED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E19 — `case_timeline_events`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `event_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `stage` | ENUM `case_stage` | N | |
| `event_type` | ENUM `timeline_event_type` | N | STAGE_ENTERED / STAGE_COMPLETED / SLA_BREACH / ESCALATION / NOTE |
| `event_at` | TIMESTAMPTZ | N | |
| `sla_target_at` | TIMESTAMPTZ | Y | |
| `sla_status` | ENUM `sla_status` | N | ON_TRACK / AT_RISK / BREACHED / N_A |
| `actor_id` | UUID FK→employees | Y | |
| `notes` | TEXT | Y | |
| (append-only; no soft delete) | | | |

#### E20 — `vigilance_records`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `vigilance_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→disciplinary_cases | Y | Linked case if any |
| `clearance_status` | ENUM `vigilance_clearance` | N | CLEAR / WITHHELD / UNDER_PROCEEDINGS / NOT_CLEAR |
| `integrity_grade` | ENUM `integrity_grade` | Y | DOUBTFUL / SATISFACTORY |
| `valid_from` | DATE | N | |
| `valid_to` | DATE | Y | |
| `reason` | TEXT | Y | |
| `updated_by` | UUID FK→employees | N | Vigilance Officer |
| audit fields | | | |

#### E21 — `case_documents` (link to M13)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `case_document_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `artefact_type` | ENUM `artefact_type` | N | COMPLAINT / PI_REPORT / CHARGE_SHEET / DEFENCE / EXHIBIT / INQUIRY_REPORT / SHOW_CAUSE / ORDER / APPEAL |
| `entity_ref_id` | UUID | Y | The originating row (polymorphic) |
| `document_id` | UUID FK→documents | N | M13 object |
| `is_served` | BOOLEAN | N | Visible to charged officer if true |
| `is_sealed` | BOOLEAN | N | Sealed vault |
| `content_hash` | VARCHAR(64) | N | SHA-256 |
| audit fields | | | |

### 5.3 Relationship map

```
employees (M01) 1──* disciplinary_cases *──1 org_units (M01)
disciplinary_cases 1──* case_complaints
disciplinary_cases 1──* preliminary_inquiries
disciplinary_cases 1──* suspensions
disciplinary_cases 1──* charge_sheets 1──* charge_articles
charge_sheets 1──1 defence_statements
charge_sheets 1──1 inquiry_proceedings 1──* inquiry_appointments
inquiry_proceedings 1──* inquiry_hearings
inquiry_proceedings 1──* inquiry_witnesses
inquiry_proceedings 1──* inquiry_exhibits *──1 documents (M13)
inquiry_proceedings 1──1 inquiry_reports 1──0..1 disagreement_memos
disciplinary_cases 1──* show_cause_notices
disciplinary_cases 1──* penalty_orders 1──* penalty_items
penalty_orders 1──* appeals 0..1──1 penalty_orders (revised)
penalty_orders 1──0..1 service_register_events (M12)
disciplinary_cases 1──* case_timeline_events
disciplinary_cases 1──* case_documents *──1 documents (M13)
employees 1──* vigilance_records 0..1──1 disciplinary_cases
```

### 5.4 Ownership / reuse matrix

| Entity | Owned by | Read by | Written by |
|--------|----------|---------|-----------|
| E1–E21 (case entities) | M09 | M09, M14 (KPI), Auditor | M09 roles per §3 |
| `employees` | M01 | M09 | M01 only |
| `org_units` | M01 | M09 | M01 only |
| `service_register_events` | M12 | M09 | M09 (append SR event), M12 |
| `documents` | M13 | M09 | M09 (via M13 API), M13 |
| `notifications` | platform | M09 | M09 |
| `audit_log` | platform | Auditor, M09 | M09 (append on every action) |
| `workflow_*` | platform | M09 | M09 |
| Payroll/pension/seniority effects | M10/M11/M06 | M09 (status echo) | M09 emits event; owning module executes |

### 5.5 Enum & reference catalog

| Enum | Values |
|------|--------|
| `case_type` | MAJOR_PENALTY_TRACK, MINOR_PENALTY_TRACK, VIGILANCE, ADMINISTRATIVE |
| `misconduct_category` | FINANCIAL_IRREGULARITY, CORRUPTION, NEGLIGENCE, INSUBORDINATION, ABSENCE_UNAUTHORISED, MORAL_TURPITUDE, MISUSE_OF_OFFICE, DATA_BREACH, HARASSMENT, OTHER |
| `case_status` | OPEN, SUSPENDED_PENDING, INQUIRY, DECISION_PENDING, PENALTY_IMPOSED, EXONERATED, DROPPED, UNDER_APPEAL, CLOSED |
| `case_stage` | INTAKE, PRELIMINARY_INQUIRY, SUSPENSION, CHARGE, DEFENCE, INQUIRY_SETUP, INQUIRY, INQUIRY_REPORT, DA_CONSIDERATION, SHOW_CAUSE, ORDER, SR_POSTING, APPEAL, CLOSED |
| `complaint_source` | INTERNAL, PUBLIC, ANONYMOUS, AUDIT, MEDIA, CVC, SUO_MOTU |
| `triage_decision` | FILE_CASE, PRELIMINARY_INQUIRY, CLOSE_NO_ACTION, TRANSFER_AGENCY |
| `pi_status` | ORDERED, IN_PROGRESS, SUBMITTED, CLOSED |
| `pi_recommendation` | PROCEED_MAJOR, PROCEED_MINOR, DROP, ADMIN_ADVICE |
| `suspension_type` | ORDERED, DEEMED, CONTINUED |
| `suspension_status` | ACTIVE, REVOKED, EXTENDED, DEEMED_REVOKED |
| `penalty_track` | MINOR, MAJOR |
| `service_mode` | IN_PERSON, REGD_POST, EMAIL, SUBSTITUTED, PUBLICATION |
| `charge_sheet_status` | DRAFT, ISSUED, SERVED, RESPONDED, WITHDRAWN |
| `article_finding` | PROVED, NOT_PROVED, PARTLY_PROVED |
| `defence_plea` | ADMITS_ALL, DENIES_ALL, PARTIAL, NO_RESPONSE |
| `inquiry_status` | NOT_STARTED, IN_PROGRESS, EX_PARTE, CONCLUDED, DE_NOVO |
| `inquiry_role` | INQUIRY_OFFICER, PRESENTING_OFFICER, DEFENCE_ASSISTANT |
| `appointment_status` | ACTIVE, RECUSED, REPLACED, OBJECTED |
| `hearing_outcome` | HELD, ADJOURNED, NO_SHOW_CHARGED, NO_SHOW_PO, EX_PARTE_RECORDED |
| `witness_side` | PROSECUTION, DEFENCE |
| `witness_status` | LISTED, EXAMINED, CROSS_EXAMINED, DROPPED |
| `overall_finding` | ALL_PROVED, NONE_PROVED, MIXED |
| `report_status` | SUBMITTED, SERVED, UNDER_DA_REVIEW, ACCEPTED, REMITTED |
| `memo_status` | ISSUED, SERVED, RESPONDED, FINALISED |
| `notice_status` | ISSUED, SERVED, RESPONDED, NO_RESPONSE, CLOSED |
| `order_type` | PENALTY, EXONERATION, DROP_PROCEEDINGS |
| `order_status` | DRAFT, FINALISED, SERVED, STAYED, SET_ASIDE, MODIFIED |
| `penalty_type` | CENSURE, WITHHOLD_INCREMENT, WITHHOLD_PROMOTION, RECOVERY, REDUCTION_IN_RANK, COMPULSORY_RETIREMENT, REMOVAL, DISMISSAL, FINE, WARNING |
| `penalty_class` | MINOR, MAJOR |
| `pension_effect` | NONE, WITHHELD, REDUCED_PCT |
| `remedy_type` | APPEAL, REVISION, REVIEW |
| `appeal_decision` | UPHELD, SET_ASIDE, MODIFIED, ENHANCED, REMITTED, REJECTED |
| `appeal_status` | FILED, ADMITTED, UNDER_REVIEW, DECIDED, REJECTED |
| `timeline_event_type` | STAGE_ENTERED, STAGE_COMPLETED, SLA_BREACH, ESCALATION, NOTE |
| `sla_status` | ON_TRACK, AT_RISK, BREACHED, N_A |
| `vigilance_clearance` | CLEAR, WITHHELD, UNDER_PROCEEDINGS, NOT_CLEAR |
| `integrity_grade` | DOUBTFUL, SATISFACTORY |
| `artefact_type` | COMPLAINT, PI_REPORT, CHARGE_SHEET, DEFENCE, EXHIBIT, INQUIRY_REPORT, SHOW_CAUSE, ORDER, APPEAL |

**Penalty classification reference (statutory):**

| Penalty | Class | Typical downstream effect |
|---------|-------|---------------------------|
| Censure | MINOR | SR entry only |
| Warning / Fine | MINOR | SR entry; fine → M10 recovery |
| Withholding of increment(s) | MINOR (MAJOR if cumulative effect) | M10 pay, M06 progression |
| Withholding of promotion | MAJOR | M06 |
| Recovery from pay of loss caused | MINOR/MAJOR | M10 recovery |
| Reduction to lower stage/rank | MAJOR | M06 seniority, M10 pay |
| Compulsory retirement | MAJOR | M11 pension (reduced) |
| Removal from service | MAJOR | M11 (no future-employment bar context) |
| Dismissal from service | MAJOR | M11 (disqualifies future govt employment) |

### 5.6 Data integrity rules

1. **DI-1 Stage monotonicity:** `case_stage` may only advance along the state machine (§12); regression requires a `REMITTED`/`DE_NOVO`/appeal event with recorded authority.
2. **DI-2 Distinct actors:** for a given `case_id`, the persons holding DA, IO, PO, and each witness must be **mutually distinct** (DB-enforced via constraint + service check). The charged employee can never be IO/PO/DA on their own case.
3. **DI-3 No penalty without process:** a `penalty_orders` row of `order_type=PENALTY` requires a served `charge_sheet`, a `defence_statements` row (or `is_ex_parte_assumed=true`), and — for `penalty_class=MAJOR` — a concluded `inquiry_reports` and a responded/closed `show_cause_notices`.
4. **DI-4 Show-cause ⊇ order:** penalties in a finalised order must be a **subset** of the penalties proposed in the related show-cause (no enhancement beyond proposed without fresh show-cause).
5. **DI-5 Limitation guard:** `appeals.is_time_barred` is computed from `limitation_due_date`; a time-barred appeal can be `ADMITTED` only if `condonation_granted=true`.
6. **DI-6 Immutability after finalise:** once `penalty_orders.status` ∈ {FINALISED, SERVED}, the order and its `penalty_items` are read-only; changes only via appeal/revision producing a new `revised_order_id`.
7. **DI-7 Evidence seal:** every `inquiry_exhibits`/`case_documents` row stores `content_hash`; mismatch on read raises `EVIDENCE_TAMPERED`.
8. **DI-8 Subsistence floor/ceiling:** `subsistence_rate_pct` ∈ [25, 75]; must be reviewed before `subsistence_revision_due`.
9. **DI-9 Confidentiality:** rows with `is_confidential_source=true` never expose complainant identity outside Vigilance Officer/DA, including in API responses and exports.
10. **DI-10 SR posting once:** at most one non-superseded `service_register_events` per finalised order; supersession only via appeal outcome.
11. **DI-11 Referential integrity:** all FKs enforced; soft-deleted parents block new children.
12. **DI-12 Append-only ledgers:** `case_timeline_events` and `audit_log` are insert-only; no update/delete.

### 5.7 Sample data (2–3 rows per module entity)

**`disciplinary_cases`**

| case_id | case_no | charged_employee_id | case_type | misconduct_category | case_status | current_stage | disciplinary_authority_id | date_initiated |
|---|---|---|---|---|---|---|---|---|
| 8f1c…01 | DCP/2026/000101 | emp-3001 | MAJOR_PENALTY_TRACK | FINANCIAL_IRREGULARITY | INQUIRY | INQUIRY | emp-9001 | 2026-02-10 |
| 8f1c…02 | DCP/2026/000102 | emp-3002 | MINOR_PENALTY_TRACK | ABSENCE_UNAUTHORISED | PENALTY_IMPOSED | CLOSED | emp-9002 | 2026-01-05 |
| 8f1c…03 | DCP/2026/000103 | emp-3003 | VIGILANCE | CORRUPTION | SUSPENDED_PENDING | SUSPENSION | emp-9001 | 2026-03-01 |

**`case_complaints`**

| complaint_id | complaint_no | case_id | subject_employee_id | source_type | is_anonymous | received_date | triage_decision |
|---|---|---|---|---|---|---|---|
| c-001 | CMP/2026/501 | 8f1c…01 | emp-3001 | AUDIT | false | 2026-02-01 | FILE_CASE |
| c-002 | CMP/2026/502 | 8f1c…03 | emp-3003 | CVC | false | 2026-02-25 | PRELIMINARY_INQUIRY |
| c-003 | CMP/2026/503 | null | emp-3050 | ANONYMOUS | true | 2026-03-10 | CLOSE_NO_ACTION |

**`preliminary_inquiries`**

| pi_id | case_id | pi_officer_id | ordered_date | due_date | status | recommendation |
|---|---|---|---|---|---|---|
| pi-01 | 8f1c…03 | emp-7001 | 2026-02-26 | 2026-03-26 | SUBMITTED | PROCEED_MAJOR |
| pi-02 | 8f1c…01 | emp-7002 | 2026-02-02 | 2026-03-02 | CLOSED | PROCEED_MAJOR |

**`suspensions`**

| suspension_id | case_id | employee_id | suspension_type | order_no | effective_from | status | subsistence_rate_pct |
|---|---|---|---|---|---|---|---|
| sus-01 | 8f1c…03 | emp-3003 | ORDERED | SUS/2026/77 | 2026-03-01 | ACTIVE | 50.00 |
| sus-02 | 8f1c…01 | emp-3001 | DEEMED | SUS/2026/41 | 2026-02-11 | REVOKED | 50.00 |

**`charge_sheets`**

| charge_sheet_id | case_id | charge_sheet_no | penalty_track | issued_date | served_date | defence_due_date | status |
|---|---|---|---|---|---|---|---|
| cs-01 | 8f1c…01 | CS/2026/201 | MAJOR | 2026-03-05 | 2026-03-08 | 2026-03-23 | RESPONDED |
| cs-02 | 8f1c…02 | CS/2026/202 | MINOR | 2026-01-10 | 2026-01-12 | 2026-01-22 | RESPONDED |

**`charge_articles`**

| article_id | charge_sheet_id | article_no | article_text (abbrev) | rule_violated | finding |
|---|---|---|---|---|---|
| ar-01 | cs-01 | 1 | Sanctioned payment without verification | CCS(Conduct) Rule 3 | PROVED |
| ar-02 | cs-01 | 2 | Failed to maintain devolution records | CCS(Conduct) Rule 3(1)(ii) | PARTLY_PROVED |
| ar-03 | cs-02 | 1 | Unauthorised absence 12 days | CCS(Conduct) Rule 3 | PROVED |

**`defence_statements`**

| defence_id | charge_sheet_id | submitted_by | plea | requests_oral_inquiry | submitted_at | is_ex_parte_assumed |
|---|---|---|---|---|---|---|
| def-01 | cs-01 | emp-3001 | DENIES_ALL | true | 2026-03-20T10:00Z | false |
| def-02 | cs-02 | emp-3002 | ADMITS_ALL | false | 2026-01-18T09:00Z | false |

**`inquiry_proceedings`**

| inquiry_id | case_id | charge_sheet_id | status | commenced_date | due_date | is_ex_parte |
|---|---|---|---|---|---|---|
| inq-01 | 8f1c…01 | cs-01 | IN_PROGRESS | 2026-04-01 | 2026-10-01 | false |

**`inquiry_appointments`**

| appointment_id | inquiry_id | role_type | officer_id | appointed_date | status |
|---|---|---|---|---|---|
| ap-01 | inq-01 | INQUIRY_OFFICER | emp-6001 | 2026-03-25 | ACTIVE |
| ap-02 | inq-01 | PRESENTING_OFFICER | emp-6002 | 2026-03-25 | ACTIVE |
| ap-03 | inq-01 | DEFENCE_ASSISTANT | emp-6003 | 2026-03-28 | ACTIVE |

**`inquiry_hearings`**

| hearing_id | inquiry_id | hearing_no | scheduled_date | outcome | next_hearing_date |
|---|---|---|---|---|---|
| h-01 | inq-01 | 1 | 2026-04-05T10:00Z | HELD | 2026-04-19T10:00Z |
| h-02 | inq-01 | 2 | 2026-04-19T10:00Z | ADJOURNED | 2026-05-03T10:00Z |

**`inquiry_witnesses`**

| witness_id | inquiry_id | side | witness_employee_id | examination_status |
|---|---|---|---|---|
| w-01 | inq-01 | PROSECUTION | emp-7010 | CROSS_EXAMINED |
| w-02 | inq-01 | DEFENCE | emp-7011 | EXAMINED |

**`inquiry_exhibits`**

| exhibit_id | inquiry_id | exhibit_marker | side | description | admitted | sealed |
|---|---|---|---|---|---|---|
| ex-01 | inq-01 | P-1 | PROSECUTION | Audit paragraph extract | true | true |
| ex-02 | inq-01 | D-1 | DEFENCE | Sanction note copy | true | true |

**`inquiry_reports`**

| report_id | inquiry_id | submitted_by | submitted_date | overall_finding | status |
|---|---|---|---|---|---|
| rep-01 | inq-01 | emp-6001 | 2026-08-20 | MIXED | UNDER_DA_REVIEW |

**`disagreement_memos`**

| memo_id | report_id | issued_by | served_date | status |
|---|---|---|---|---|
| dm-01 | rep-01 | emp-9001 | 2026-09-01 | SERVED |

**`show_cause_notices`**

| notice_id | case_id | notice_no | issued_date | response_due_date | status |
|---|---|---|---|---|---|
| sc-01 | 8f1c…01 | SCN/2026/301 | 2026-09-20 | 2026-10-05 | RESPONDED |

**`penalty_orders`**

| order_id | case_id | order_no | order_type | order_date | is_speaking_order | status |
|---|---|---|---|---|---|---|
| po-01 | 8f1c…02 | ORD/2026/401 | PENALTY | 2026-02-01 | true | SERVED |
| po-02 | 8f1c…01 | ORD/2026/402 | PENALTY | 2026-10-12 | true | FINALISED |

**`penalty_items`**

| penalty_item_id | order_id | penalty_type | penalty_class | duration_months | recovery_amount |
|---|---|---|---|---|---|
| pi-it-01 | po-01 | CENSURE | MINOR | null | null |
| pi-it-02 | po-02 | WITHHOLD_INCREMENT | MAJOR | 24 | null |
| pi-it-03 | po-02 | RECOVERY | MAJOR | null | 150000.00 |

**`appeals`**

| appeal_id | case_id | order_id | remedy_type | filed_date | limitation_due_date | is_time_barred | decision | status |
|---|---|---|---|---|---|---|---|---|
| ap-app-01 | 8f1c…02 | po-01 | APPEAL | 2026-02-20 | 2026-03-18 | false | UPHELD | DECIDED |
| ap-app-02 | 8f1c…01 | po-02 | APPEAL | 2026-11-30 | 2026-11-26 | true | null | FILED |

**`case_timeline_events`**

| event_id | case_id | stage | event_type | event_at | sla_status |
|---|---|---|---|---|---|
| te-01 | 8f1c…01 | CHARGE | STAGE_COMPLETED | 2026-03-23T00:00Z | ON_TRACK |
| te-02 | 8f1c…01 | INQUIRY | SLA_BREACH | 2026-10-02T00:00Z | BREACHED |

**`vigilance_records`**

| vigilance_id | employee_id | case_id | clearance_status | integrity_grade | valid_from |
|---|---|---|---|---|---|
| vr-01 | emp-3003 | 8f1c…03 | UNDER_PROCEEDINGS | DOUBTFUL | 2026-03-01 |
| vr-02 | emp-3010 | null | CLEAR | SATISFACTORY | 2026-01-01 |

**`case_documents`**

| case_document_id | case_id | artefact_type | document_id | is_served | is_sealed |
|---|---|---|---|---|---|
| cd-01 | 8f1c…01 | CHARGE_SHEET | doc-5001 | true | false |
| cd-02 | 8f1c…01 | PI_REPORT | doc-5002 | false | true |
| cd-03 | 8f1c…01 | INQUIRY_REPORT | doc-5003 | true | false |

---

## 6. Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table.

---

### FR-M09-001 — Complaint / Source-of-Misconduct Registration & Triage

- **Module:** M09-DCP
- **Primary Role(s):** Complainant, Vigilance Officer, DCP Admin, Disciplinary Authority

**User Story:** As a Vigilance Officer, I want to register and triage every complaint or detected source of misconduct so that only substantiated matters proceed to a formal case while all sources remain auditable.

**Description:** Captures complaints from internal, public, anonymous, audit, media, CVC, or suo-motu sources, deduplicates against existing cases for the same subject, and supports a triage decision (file case / order preliminary inquiry / close with no action / transfer to another agency). Anonymous and whistle-blower sources are handled with identity protection.

**Acceptance Criteria:**
1. A complaint can be registered with a unique `complaint_no` and a mandatory `allegation_summary` and `subject_employee_id` (or external subject reference).
2. Anonymous complaints are accepted with `complainant_id` null and `is_anonymous=true`; whistle-blower flag hides identity per DI-9.
3. The system surfaces existing open cases/complaints for the same subject before allowing a new case (duplicate guard).
4. Triage records a `triage_decision`, `triaged_by`, `triaged_at`, and remarks; `FILE_CASE` creates a `disciplinary_cases` row in `OPEN`/`INTAKE`.
5. Every action writes to `audit_log` and a `case_timeline_events` entry once a case exists.

**Business Rules:**
- BR-1: Only Vigilance Officer or DA may set `triage_decision`.
- BR-2: `CLOSE_NO_ACTION` requires remarks and DA concurrence for vigilance-flagged complaints.
- BR-3: Promotion to a case requires a competent `disciplinary_authority_id` resolvable from org hierarchy.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_complaints` | create/triage |
| `disciplinary_cases` | created on FILE_CASE |
| `vigilance_records` | optional link |
| `case_timeline_events` | timeline |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/complaints` | Register complaint |
| GET | `/api/v1/dcp/complaints?subjectId=` | List/dedup |
| POST | `/api/v1/dcp/complaints/{id}/triage` | Triage decision |

**UI Behavior Notes:** Intake form with source-type selector; anonymous toggle hides complainant fields; a live "existing matters for this employee" panel; triage action drawer with decision radio + remarks.

**Edge Cases:** Subject is a non-employee/contractor (external subject ref); subject already retired (route to pension-withholding path, M11 advisory); same allegation re-submitted (merge into existing complaint).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ComplaintIntakeForm`, `DuplicateGuardPanel`, `TriageDrawer`; service `ComplaintService`, `TriageService` |
| Backend Flow | Validate → dedup query (subject + open status) → persist complaint → on FILE_CASE open case in txn → emit timeline + audit |
| Data Operations | INSERT `case_complaints`; conditional INSERT `disciplinary_cases`, `case_timeline_events`; INSERT `audit_log` |
| Validation | Required summary/subject; enum checks; anonymous ⇒ complainant null; CLOSE_NO_ACTION ⇒ remarks |
| Authorization | RBAC: register (Complainant/Vigilance/Admin); triage (Vigilance/DA) |
| State Changes & Side Effects | FILE_CASE ⇒ case `INTAKE`; notification to DA; vigilance flag sets `vigilance_records.clearance_status=UNDER_PROCEEDINGS` |
| Failure Handling | Dup detected ⇒ 409 `DUPLICATE_COMPLAINT`; missing DA ⇒ 422 `DA_NOT_RESOLVED` |
| Dependencies | M01 (employees), platform notifications, audit |
| Test Guidance | Unit: dedup, anonymity masking; Integration: triage→case creation txn; Negative: close without remarks |

---

### FR-M09-002 — Preliminary (Fact-Finding) Inquiry

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Vigilance Officer, PI Officer, DCP Admin

**User Story:** As a Disciplinary Authority, I want to order a preliminary inquiry so that I can decide, on facts, whether formal charges are warranted and on which track.

**Description:** Orders a confidential fact-finding inquiry, assigns a PI officer, tracks an SLA, and records findings with a recommendation (proceed major/minor, drop, administrative advice). The PI report is confidential and never served on the subject.

**Acceptance Criteria:**
1. DA/Vigilance can order a PI with `pi_officer_id`, `ordered_date`, and `due_date`.
2. PI status transitions ORDERED → IN_PROGRESS → SUBMITTED → CLOSED.
3. On submission a `recommendation` and confidential `report_document_id` are required.
4. PI report is stored with `is_served=false` and excluded from the charged officer's view (DI-9/§3.3).
5. SLA breach raises a timeline `SLA_BREACH` + escalation notification.

**Business Rules:**
- BR-1: PI officer ≠ subject; PI officer should not later be IO on the same case (warn + override-with-reason).
- BR-2: `DROP` recommendation requires DA approval and closes the case with `DROPPED` if no charges.
- BR-3: PI is optional for clear-cut minor matters (skippable to charge).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `preliminary_inquiries` | create/update |
| `disciplinary_cases` | stage update |
| `case_documents` | sealed PI report |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/preliminary-inquiries` | Order PI |
| PATCH | `/api/v1/dcp/preliminary-inquiries/{id}` | Update progress |
| POST | `/api/v1/dcp/preliminary-inquiries/{id}/submit` | Submit report |

**UI Behavior Notes:** PI order modal; officer picker excluding the subject; SLA countdown chip; confidential report uploader; recommendation selector gated to submission.

**Edge Cases:** PI officer recuses (reassign); evidence suggests criminal angle (set `criminal_case_ref`, route TRANSFER_AGENCY); PI exceeds SLA (auto-escalation to higher authority).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PIOrderModal`, `PIWorkbench`, `SLABadge`; `PreliminaryInquiryService` |
| Backend Flow | Validate authority → create PI → state machine guard on transitions → on submit attach sealed doc + recommendation → update case stage |
| Data Operations | INSERT/UPDATE `preliminary_inquiries`; INSERT sealed `case_documents`; UPDATE `disciplinary_cases.current_stage` |
| Validation | due_date > ordered_date; officer ≠ subject; submit requires recommendation + doc |
| Authorization | Order: DA/Vigilance; Submit: PI officer |
| State Changes & Side Effects | Case → `PRELIMINARY_INQUIRY`; DROP ⇒ case `DROPPED`; notifications to DA |
| Failure Handling | Invalid transition ⇒ 409 `INVALID_STATE_TRANSITION`; missing doc ⇒ 422 |
| Dependencies | M13 (sealed doc), notifications, SLA engine (FR-016) |
| Test Guidance | Confidentiality: charged officer cannot fetch PI report; SLA breach emits event |

---

### FR-M09-003 — Suspension, Subsistence Allowance & Review

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, Payroll Officer (downstream)

**User Story:** As a Disciplinary Authority, I want to place an employee under suspension (or record deemed suspension) and manage subsistence allowance so that interim action is lawful, payroll-correct, and periodically reviewed.

**Description:** Issues suspension orders (ordered/deemed/continued), sets subsistence rate within statutory bounds, schedules mandatory periodic review, emits a payroll event to M10, and supports revocation with effect on employment status and back-pay treatment.

**Acceptance Criteria:**
1. A suspension order sets `effective_from`, `subsistence_rate_pct` ∈ [25,75], and updates `employees.employment_status=SUSPENDED` (via M01 event).
2. Deemed suspension auto-creates a record when detention > 48h is recorded.
3. A subsistence review task is scheduled before `subsistence_revision_due` (default 90 days) and a review-board task before `review_committee_due` (default 180 days).
4. Revocation sets `status=REVOKED`, `effective_to`, and emits M10 + M01 events to restore status and settle pay.
5. An SR event is appended for suspension and revocation (FR-013).

**Business Rules:**
- BR-1: Subsistence rate may be revised after review but enhancement beyond 75% / reduction below 25% is blocked (DI-8).
- BR-2: Suspension during inquiry cannot exceed configured limit without documented extension.
- BR-3: Period of suspension's treatment (duty/non-duty) is decided at final order, not at revocation.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `suspensions` | create/update |
| `disciplinary_cases` | stage |
| `service_register_events` | SR posting |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/suspensions` | Order suspension |
| POST | `/api/v1/dcp/suspensions/{id}/revise-subsistence` | Revise rate |
| POST | `/api/v1/dcp/suspensions/{id}/revoke` | Revoke |

**UI Behavior Notes:** Suspension order form with rate slider bounded 25–75%; review-due reminders on case header; revocation drawer with reason + pay-treatment note.

**Edge Cases:** Employee retires during suspension (convert to charge-after-retirement/pension path); deemed suspension where detention later quashed; subsistence not revised in time (auto AT_RISK then escalation).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SuspensionOrderForm`, `SubsistenceReviewPanel`; `SuspensionService`, `PayrollEventEmitter` |
| Backend Flow | Validate bounds → persist suspension in txn → emit M01 status event + M10 subsistence event + M12 SR event → schedule review tasks |
| Data Operations | INSERT/UPDATE `suspensions`; INSERT `service_register_events`; INSERT `workflow_tasks` (reviews) |
| Validation | rate ∈ [25,75]; effective_to > effective_from; deemed needs detention proof |
| Authorization | DA only; step-up MFA |
| State Changes & Side Effects | Case → `SUSPENDED_PENDING`; employee → SUSPENDED; payroll subsistence begins; SR event |
| Failure Handling | M10/M01 unavailable ⇒ queue + retry (`UPSTREAM_UNAVAILABLE`); outbox pattern ensures eventual emit |
| Dependencies | M01, M10, M12, workflow engine |
| Test Guidance | Bound checks; outbox retry; review task scheduling; SR append idempotency |

---

### FR-M09-004 — Charge-Sheet / Articles of Charge (Statement of Imputations)

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, Presenting Officer (draft)

**User Story:** As a Disciplinary Authority, I want to frame and serve a charge-sheet with distinct articles of charge and statements of imputation so that the employee knows precisely what they must answer.

**Description:** Builds a memorandum of charges containing one or more articles, each with charge text, statement of imputation, and the conduct rule violated; selects penalty track (minor/major); generates a signed PDF (M13); records valid service with mode and computes the statutory defence-reply window.

**Acceptance Criteria:**
1. A charge-sheet requires at least one `charge_articles` row; each article requires text, imputation, and rule.
2. Penalty track (MINOR/MAJOR) determines downstream path (minor track may skip oral inquiry).
3. On issue, a signed PDF is produced and stored; `status=ISSUED`.
4. Service recording captures `service_mode`, `served_date`, and computes `defence_due_date` (config window, default 15 days; substituted service rules apply).
5. The served charge-sheet is visible to the charged officer (`is_served=true`).

**Business Rules:**
- BR-1: A charge-sheet cannot be served before any active suspension review obligations are satisfied (warn-only).
- BR-2: Withdrawal requires reason and DA approval; a withdrawn sheet cannot host an inquiry.
- BR-3: Articles must be uniquely numbered and immutable after service (amendment ⇒ supplementary charge-sheet).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `charge_sheets` | create/issue/serve |
| `charge_articles` | articles |
| `case_documents` | served PDF |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/charge-sheets` | Draft |
| POST | `/api/v1/dcp/charge-sheets/{id}/issue` | Issue + generate PDF |
| POST | `/api/v1/dcp/charge-sheets/{id}/serve` | Record service |

**UI Behavior Notes:** Article builder (repeatable rows), rule-violated lookup, track selector, PDF preview, service-recording panel with mode + date and auto-computed reply due-date.

**Edge Cases:** Substituted/published service when employee absconds; supplementary charges after inquiry begins (de novo or addendum); multilingual charge-sheet rendering.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ChargeSheetBuilder`, `ArticleEditor`, `ServiceRecorder`; `ChargeSheetService`, `PdfRenderer` |
| Backend Flow | Validate articles → persist draft → issue: render PDF via M13, lock articles → serve: set mode/date, compute due-date, mark served, notify employee |
| Data Operations | INSERT `charge_sheets`,`charge_articles`; INSERT `case_documents`(served); UPDATE case stage |
| Validation | ≥1 article; unique article_no; required fields; due-date computed from config |
| Authorization | Draft: PO/Admin; Issue/Serve: DA |
| State Changes & Side Effects | Case → `CHARGE` then `DEFENCE`; immutability lock on articles; notification + defence task created |
| Failure Handling | PDF render fail ⇒ 503 retain DRAFT; serve before issue ⇒ 409 |
| Dependencies | M13, notifications, config (reply window) |
| Test Guidance | Article immutability after serve; due-date computation; substituted-service path |

---

### FR-M09-005 — Employee's Written Statement of Defence

- **Module:** M09-DCP
- **Primary Role(s):** Employee (Charged Officer), DCP Admin

**User Story:** As a charged officer, I want to submit my written statement of defence (admitting or denying charges and requesting an oral inquiry/defence assistant) so that my side is on record before any inquiry.

**Description:** Self-service submission of the defence, recording plea (admits/denies/partial), free-text statement, requests for oral inquiry and a defence assistant, and optional extension request. If no response within the window, an ex-parte assumption is recorded.

**Acceptance Criteria:**
1. The charged officer can submit a defence against a served charge-sheet before `defence_due_date`.
2. Plea selection is mandatory; partial admissions can be article-wise.
3. Requesting an oral inquiry forces the major-track inquiry path even if minor track was initially chosen (escalation logged).
4. If `defence_due_date` passes with no submission, `is_ex_parte_assumed=true` is set automatically.
5. An extension request routes to DA for approval and, if granted, updates `defence_due_date`.

**Business Rules:**
- BR-1: Defence editable until submitted; immutable thereafter (corrigendum via new statement).
- BR-2: ADMITS_ALL on minor track allows DA to proceed directly to penalty without inquiry (still requires speaking order).
- BR-3: Only the charged officer (or authorised assistant) may submit.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `defence_statements` | create |
| `charge_sheets` | status → RESPONDED |
| `inquiry_proceedings` | path decision |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/charge-sheets/{id}/defence` | Submit defence |
| POST | `/api/v1/dcp/charge-sheets/{id}/extension-request` | Request extension |

**UI Behavior Notes:** Charged-officer portal showing only served documents; plea radio per article; statement editor; checkboxes for oral inquiry / defence assistant; due-date countdown; locked after submit.

**Edge Cases:** Employee on leave/hospitalised (extension); ex-parte then late submission (DA discretion to admit); employee disputes valid service (raises objection record).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DefencePortal`, `PleaSelector`, `ExtensionRequestDialog`; `DefenceService`, `ExParteScheduler` |
| Backend Flow | Verify served + window open → persist defence → set charge_sheet RESPONDED → decide path (oral inquiry?) ; scheduled job sets ex-parte on lapse |
| Data Operations | INSERT `defence_statements`; UPDATE `charge_sheets.status`; conditional create `inquiry_proceedings` |
| Validation | Window open; plea required; submitter = charged officer/assistant |
| Authorization | Charged officer self only; field-level served-doc visibility |
| State Changes & Side Effects | Case → `INQUIRY_SETUP` (if inquiry) or `ORDER` (minor admit); ex-parte flag on lapse |
| Failure Handling | Submit after due-date ⇒ 409 `DEFENCE_WINDOW_CLOSED` (unless extension); not served ⇒ 403 |
| Dependencies | scheduler, notifications |
| Test Guidance | Window enforcement; ex-parte auto-flag; oral-inquiry escalation |

---

### FR-M09-006 — Appointment of Inquiry Officer & Presenting Officer

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin

**User Story:** As a Disciplinary Authority, I want to appoint an impartial Inquiry Officer and a Presenting Officer (and permit a defence assistant) so that the departmental inquiry is conducted fairly and at arm's length.

**Description:** Appoints IO and PO for an inquiry, enforcing distinct-actor and conflict-of-interest rules, supports recusal/objection handling and replacement, and permits the charged officer to nominate a defence assistant.

**Acceptance Criteria:**
1. IO, PO, DA, and the charged officer must be mutually distinct (DI-2); violations are blocked.
2. The charged officer may raise a bias objection against the IO; the DA records a reasoned decision (uphold ⇒ replace).
3. Replacement preserves the appointment history (old row `REPLACED`, new row `ACTIVE`).
4. A defence assistant nomination is recorded subject to eligibility rules.
5. Appointment notifications are sent to all parties.

**Business Rules:**
- BR-1: IO should not have been the PI officer or a witness (hard block on witness; warn on PI officer).
- BR-2: External IO permitted only when configured for the case type.
- BR-3: At most one ACTIVE IO and one ACTIVE PO per inquiry.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_appointments` | create/replace |
| `inquiry_proceedings` | created/linked |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{inquiryId}/appointments` | Appoint IO/PO/DA-Asst |
| POST | `/api/v1/dcp/appointments/{id}/recuse` | Recuse/replace |
| POST | `/api/v1/dcp/appointments/{id}/object` | Raise objection |

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AppointmentPanel`, `ConflictChecker`, `ObjectionDialog`; `AppointmentService` |
| Backend Flow | Validate distinct-actor & conflicts → create inquiry (if absent) → persist appointments → notify; objection → DA decision → optional replace txn |
| Data Operations | INSERT/UPDATE `inquiry_appointments`; INSERT `inquiry_proceedings` |
| Validation | DI-2 distinctness; one ACTIVE IO/PO; witness-conflict block |
| Authorization | DA appoints; charged officer objects |
| State Changes & Side Effects | Case → `INQUIRY_SETUP`→`INQUIRY`; notifications |
| Failure Handling | Conflict ⇒ 409 `ACTOR_CONFLICT`; second active IO ⇒ 409 |
| Dependencies | M01, notifications |
| Test Guidance | Distinct-actor enforcement; objection→replacement audit chain |

**UI Behavior Notes:** Officer pickers with inline conflict warnings; objection workflow card; appointment history timeline.

**Edge Cases:** IO transferred/retires mid-inquiry (replace + de novo decision); charged officer demands legal counsel (allowed only if PO is legally trained — config rule).

---

### FR-M09-007 — Conduct of Departmental Inquiry (Hearings, Witnesses, Exhibits, Daily Order Sheets, Ex-Parte)

- **Module:** M09-DCP
- **Primary Role(s):** Inquiry Officer, Presenting Officer, Charged Officer / Defence Assistant

**User Story:** As an Inquiry Officer, I want to schedule and record hearings, examine witnesses, admit exhibits, and maintain daily order sheets so that the inquiry is complete, fair, and fully documented.

**Description:** Runs the oral inquiry: schedules hearings, logs daily order sheets, manages prosecution/defence witnesses (examination, cross-examination), admits exhibits into the sealed evidence vault, records adjournments, and handles ex-parte proceedings when the charged officer fails to participate after due notice.

**Acceptance Criteria:**
1. The IO can schedule a hearing with date, record outcome (held/adjourned/no-show/ex-parte), and a mandatory daily order text.
2. Witnesses (both sides) can be listed and their depositions recorded with examination status.
3. Exhibits are added with a marker, side, description, sealed document reference, and `content_hash` (DI-7).
4. Ex-parte: after a configured number of no-shows with proof of notice, the IO may set the inquiry `EX_PARTE` with a recorded order.
5. Every hearing, witness, and exhibit action writes to `audit_log` and updates the timeline.

**Business Rules:**
- BR-1: Charged officer must be given a fair opportunity to cross-examine; ex-parte requires documented notice (natural justice).
- BR-2: Exhibits cannot be deleted once admitted (only marked objected); seal is immutable.
- BR-3: Hearing scheduling respects reasonable-notice config (e.g. ≥ 7 days unless waived).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_hearings` | hearings |
| `inquiry_witnesses` | witnesses |
| `inquiry_exhibits` | exhibits/vault |
| `inquiry_proceedings` | status/ex-parte |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{id}/hearings` | Add hearing/order sheet |
| POST | `/api/v1/dcp/inquiries/{id}/witnesses` | Add/examine witness |
| POST | `/api/v1/dcp/inquiries/{id}/exhibits` | Admit exhibit |
| POST | `/api/v1/dcp/inquiries/{id}/declare-ex-parte` | Ex-parte order |

**UI Behavior Notes:** Inquiry workbench with hearing calendar, daily-order-sheet editor, witness register with examine/cross tabs, exhibit list with seal indicator, ex-parte action gated on no-show count.

**Edge Cases:** Witness turns hostile; exhibit authenticity challenged (objection recorded, IO rules); charged officer attends late after ex-parte set (IO may recall in interest of justice); document hash mismatch ⇒ `EVIDENCE_TAMPERED`.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `InquiryWorkbench`, `HearingScheduler`, `WitnessRegister`, `ExhibitVault`, `ExParteDialog`; `InquiryService`, `EvidenceSealService` |
| Backend Flow | Validate IO ownership → persist hearing/witness/exhibit → compute & store content_hash on exhibit → ex-parte requires no-show threshold + notice proof |
| Data Operations | INSERT `inquiry_hearings`/`inquiry_witnesses`/`inquiry_exhibits`; UPDATE `inquiry_proceedings.status` |
| Validation | Mandatory daily-order text; reasonable-notice; threshold for ex-parte; hash on exhibit |
| Authorization | IO records hearings/findings; PO adds prosecution evidence; charged officer/assistant adds defence evidence |
| State Changes & Side Effects | Inquiry IN_PROGRESS/EX_PARTE; timeline + audit per action; SLA tracked |
| Failure Handling | Hash mismatch ⇒ 409 `EVIDENCE_TAMPERED`; ex-parte without threshold ⇒ 422 |
| Dependencies | M13 (sealed vault), SLA engine, notifications |
| Test Guidance | Ex-parte threshold; exhibit immutability + hash verify; cross-examination recording |

---

### FR-M09-008 — Inquiry Report & Findings

- **Module:** M09-DCP
- **Primary Role(s):** Inquiry Officer, Disciplinary Authority

**User Story:** As an Inquiry Officer, I want to submit a reasoned inquiry report with article-wise findings so that the Disciplinary Authority can decide on the basis of evidence.

**Description:** The IO records article-wise findings (proved/not proved/partly proved) with reasoning, an overall finding, and a signed report (M13). A copy is served on the charged officer for representation before the DA considers it.

**Acceptance Criteria:**
1. The IO must record a finding for **every** article before submitting.
2. The report requires `analysis_text` and a signed `report_document_id`.
3. On submission the inquiry is `CONCLUDED` and the case moves to `DA_CONSIDERATION`.
4. A copy of the report is served on the charged officer (`served_on_charged_date`) with a representation window.
5. Findings write back to `charge_articles.finding`.

**Business Rules:**
- BR-1: A report cannot be submitted for an inquiry that is not IN_PROGRESS/EX_PARTE.
- BR-2: Findings must be supported by recorded evidence (advisory completeness check, not a hard block).
- BR-3: The DA may remit the report for further inquiry (`REMITTED`) with reasons (→ de novo or supplementary).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_reports` | create/serve |
| `charge_articles` | finding write-back |
| `inquiry_proceedings` | CONCLUDED |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{id}/report` | Submit report |
| POST | `/api/v1/dcp/inquiry-reports/{id}/serve` | Serve copy on charged officer |
| POST | `/api/v1/dcp/inquiry-reports/{id}/remit` | DA remits for further inquiry |

**UI Behavior Notes:** Report composer with per-article finding grid, reasoning editor, evidence-coverage hints, sign-and-submit; serve action; DA remit drawer.

**Edge Cases:** Mixed findings; IO unable to complete (replaced IO submits on existing record); report contradicts admitted plea (flagged).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `InquiryReportComposer`, `FindingGrid`; `InquiryReportService` |
| Backend Flow | Validate all articles have findings → persist report + write-back findings in txn → conclude inquiry → serve copy + create representation task |
| Data Operations | INSERT `inquiry_reports`; UPDATE `charge_articles.finding`, `inquiry_proceedings.status`, case stage |
| Validation | All articles findings present; analysis + doc required |
| Authorization | Submit: IO; serve/remit: DA |
| State Changes & Side Effects | Inquiry CONCLUDED; case `DA_CONSIDERATION`; notification + representation window |
| Failure Handling | Missing findings ⇒ 422 `INCOMPLETE_FINDINGS`; wrong inquiry state ⇒ 409 |
| Dependencies | M13, notifications |
| Test Guidance | All-articles guard; finding write-back; remit path |

---

### FR-M09-009 — Disagreement Memo & Disciplinary Authority Consideration

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Charged Officer

**User Story:** As a Disciplinary Authority, when I disagree with the IO's findings, I want to issue a disagreement memo and give the charged officer a chance to represent so that my differing view is procedurally valid.

**Description:** Records the DA's consideration of the inquiry report; where the DA disagrees with any finding (especially upgrading not-proved to proved), a disagreement memo with tentative reasons is served on the charged officer, who may respond before finalisation.

**Acceptance Criteria:**
1. The DA can accept the report (→ show-cause/penalty path) or record a disagreement memo.
2. A disagreement memo requires `tentative_disagreement` reasons and `articles_affected_json`.
3. The memo is served with a representation window; the charged officer's response is recorded.
4. Final consideration after representation moves the case forward (`FINALISED`).
5. Disagreement that upgrades a finding to "proved" must be served before any penalty (natural justice).

**Business Rules:**
- BR-1: The DA cannot impose a penalty on a not-proved article without first serving a disagreement memo and considering the representation.
- BR-2: Memo immutable after serve; further changes via new memo.
- BR-3: If the DA agrees fully with not-proved on all articles ⇒ exoneration path (FR-011).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `disagreement_memos` | create/serve/respond |
| `inquiry_reports` | status |
| `charge_articles` | affected |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiry-reports/{id}/disagreement-memo` | Issue memo |
| POST | `/api/v1/dcp/disagreement-memos/{id}/serve` | Serve |
| POST | `/api/v1/dcp/disagreement-memos/{id}/representation` | Record response |

**UI Behavior Notes:** Report-consideration screen with accept/disagree toggle; per-article revised-view editor; serve + representation tracking.

**Edge Cases:** Partial disagreement; representation raises new evidence (remit decision); no representation within window (proceed on record).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DAConsiderationScreen`, `DisagreementEditor`; `DisagreementService` |
| Backend Flow | DA reviews report → accept (advance) or create memo → serve + representation task → finalise after response/lapse |
| Data Operations | INSERT/UPDATE `disagreement_memos`; UPDATE `inquiry_reports.status`, case stage |
| Validation | Memo requires reasons + affected articles; serve before penalty on upgraded findings |
| Authorization | DA only |
| State Changes & Side Effects | Case → `SHOW_CAUSE`/`ORDER`; notifications |
| Failure Handling | Penalty on not-proved without memo ⇒ 409 `NATURAL_JUSTICE_VIOLATION` |
| Dependencies | notifications, M13 |
| Test Guidance | Upgrade-without-memo block; representation window |

---

### FR-M09-010 — Show-Cause Notice on Proposed Penalty

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Charged Officer

**User Story:** As a Disciplinary Authority, I want to issue a show-cause notice setting out the penalty I propose so that the employee can represent before I finalise it.

**Description:** Issues a show-cause notice with the tentatively proposed penalty(ies) on the major-penalty track (or where enhancement is contemplated), records service and the employee's representation, and constrains the final order to the proposed set (DI-4).

**Acceptance Criteria:**
1. A show-cause notice records `proposed_penalty_json`, issue/serve dates, and a `response_due_date`.
2. The charged officer's representation is recorded (or `NO_RESPONSE` on lapse).
3. The final penalty order's penalties must be a subset of the proposed penalties (DI-4); enhancement requires a fresh show-cause.
4. Major-track penalties cannot be finalised without a closed show-cause (DI-3).
5. Notice and representation are audited and timelined.

**Business Rules:**
- BR-1: Minor-penalty track does not require a separate show-cause (charge-sheet already invites cause), per config.
- BR-2: Proposed penalty must be a recognised `penalty_type` valid for the case (class compatibility).
- BR-3: Notice immutable after serve.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `show_cause_notices` | create/serve/respond |
| `penalty_items` | (validated subset) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/show-cause` | Issue notice |
| POST | `/api/v1/dcp/show-cause/{id}/serve` | Serve |
| POST | `/api/v1/dcp/show-cause/{id}/representation` | Record response |

**UI Behavior Notes:** Proposed-penalty selector (multi), reasoning, serve panel, representation capture, due-date countdown.

**Edge Cases:** Employee seeks personal hearing; representation persuades DA to drop/reduce; no response (proceed on record).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ShowCauseComposer`, `ProposedPenaltyPicker`; `ShowCauseService` |
| Backend Flow | Validate proposed penalties → persist notice → serve + response task → close on response/lapse → carry proposed set into order validation |
| Data Operations | INSERT/UPDATE `show_cause_notices`; UPDATE case stage |
| Validation | Valid penalty types; due-date; subset constraint enforced at order time |
| Authorization | DA only; step-up MFA |
| State Changes & Side Effects | Case → `SHOW_CAUSE`→`ORDER`; notifications |
| Failure Handling | Major order without closed show-cause ⇒ 409; enhancement beyond proposed ⇒ 409 `PENALTY_EXCEEDS_PROPOSED` |
| Dependencies | notifications |
| Test Guidance | Subset enforcement; lapse handling; minor-track skip |

---

### FR-M09-011 — Penalty Order & Exoneration

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority

**User Story:** As a Disciplinary Authority, I want to pass a reasoned final order — imposing penalties, exonerating, or dropping proceedings — so that the case concludes lawfully with clear downstream effects.

**Description:** Produces the final speaking order. For penalties, it records one or more `penalty_items` (minor/major) with their parameters (duration, recovery amount, reduction target, pension effect); for exoneration, it clears the employee. The order is finalised, served, and made immutable (DI-6), then posted to the SR (FR-013).

**Acceptance Criteria:**
1. An order requires `reasoning_text` and `is_speaking_order=true` to finalise.
2. Penalty order requires the full due-process chain (DI-3) and subset constraint (DI-4).
3. Each `penalty_items` row sets parameters appropriate to its `penalty_type` (e.g. recovery requires `recovery_amount`; reduction requires `reduction_to_designation_id`).
4. On finalise, the order and items become read-only (DI-6); an SR posting is triggered (FR-013).
5. Exoneration sets case `EXONERATED`, restores `employment_status` (if suspended), and clears vigilance status.

**Business Rules:**
- BR-1: Major penalties (reduction/CR/removal/dismissal) require step-up MFA and competent-authority verification.
- BR-2: Penalty effective date defaults to service date unless lawfully retrospective with reasons.
- BR-3: Period-of-suspension treatment (duty/non-duty/back-pay) is decided in this order.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `penalty_orders` | create/finalise |
| `penalty_items` | penalties |
| `disciplinary_cases` | status |
| `service_register_events` | (via FR-013) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/orders` | Draft order + items |
| POST | `/api/v1/dcp/orders/{id}/finalise` | Finalise (immutable) |
| POST | `/api/v1/dcp/orders/{id}/serve` | Record service |

**UI Behavior Notes:** Order composer with penalty-item builder (type-driven dynamic fields), reasoning editor, speaking-order checklist, finalise with MFA, serve panel.

**Edge Cases:** Multiple penalties of different classes; recovery exceeding recoverable limit (validation); exoneration after long suspension (back-pay settlement event to M10); employee deceased before order (abate proceedings).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `OrderComposer`, `PenaltyItemBuilder`, `FinaliseDialog`; `PenaltyOrderService`, `DownstreamEffectEmitter` |
| Backend Flow | Validate due-process chain + subset → persist draft order/items → finalise: lock, step-up MFA, generate PDF, set status → trigger SR posting + downstream events |
| Data Operations | INSERT `penalty_orders`,`penalty_items`; UPDATE case status; INSERT `service_register_events`; emit M06/M10/M11 events |
| Validation | DI-3, DI-4, DI-6; type-specific parameter checks; speaking order required |
| Authorization | DA only; step-up MFA for major |
| State Changes & Side Effects | Case → `PENALTY_IMPOSED`/`EXONERATED`/`DROPPED`; immutability; downstream effects; vigilance update |
| Failure Handling | Incomplete chain ⇒ 409 `DUE_PROCESS_INCOMPLETE`; edit after finalise ⇒ 409 `ORDER_IMMUTABLE` |
| Dependencies | M06, M10, M11, M12, M13, MFA |
| Test Guidance | Immutability; subset; type-specific validation; exoneration restore |

---

### FR-M09-012 — Appeal / Revision / Review

- **Module:** M09-DCP
- **Primary Role(s):** Charged Officer, Appellate Authority, Reviewing/Revising Authority

**User Story:** As a penalised employee, I want to appeal the order within the statutory limitation; and as an appellate/reviewing authority, I want to decide the appeal so that errors are corrected and outcomes propagate.

**Description:** Manages post-order remedies — appeal (by employee), revision, and suo-motu review — with limitation tracking, condonation of delay, decision recording (upheld/set-aside/modified/enhanced/remitted/rejected), and generation of a revised order where applicable. Enhancement on appeal requires a fresh show-cause.

**Acceptance Criteria:**
1. An appeal can be filed against a finalised/served order; `limitation_due_date` computed from config (default 45 days).
2. Late appeals are flagged `is_time_barred`; admission requires `condonation_granted=true`.
3. The authority records a decision with reasoning; `MODIFIED` creates a `revised_order_id`.
4. `ENHANCED` requires a fresh show-cause to the employee before finalisation (natural justice).
5. Decision propagates: SR supersession (FR-013) and downstream effect reversal/adjustment (M06/M10/M11).

**Business Rules:**
- BR-1: Appeal authority ≠ DA who passed the order (segregation).
- BR-2: One pending appeal per order at a time; revision/review may follow.
- BR-3: `SET_ASIDE` restores prior status and reverses downstream effects.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `appeals` | create/decide |
| `penalty_orders` | challenged/revised |
| `service_register_events` | supersession |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/orders/{orderId}/appeals` | File appeal/revision/review |
| POST | `/api/v1/dcp/appeals/{id}/admit` | Admit (with condonation) |
| POST | `/api/v1/dcp/appeals/{id}/decide` | Record decision |

**UI Behavior Notes:** Appeal-filing form with limitation indicator; authority decision screen with decision selector and revised-order link; enhancement triggers show-cause sub-flow.

**Edge Cases:** Time-barred without condonation (reject); enhancement without show-cause (block); multiple remedies in sequence; appeal pending while recovery already deducted (hold/refund coordination with M10).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AppealForm`, `AppealDecisionScreen`; `AppealService`, `OrderRevisionService` |
| Backend Flow | Compute limitation → file → admit (condonation guard) → decide → on MODIFIED create revised order, on ENHANCED require fresh show-cause → propagate SR + downstream |
| Data Operations | INSERT/UPDATE `appeals`; conditional INSERT revised `penalty_orders`; INSERT superseding `service_register_events` |
| Validation | DI-5 limitation; authority ≠ DA; enhancement ⇒ show-cause exists |
| Authorization | File: charged officer; decide: Appellate/Reviewing authority; step-up MFA |
| State Changes & Side Effects | Case → `UNDER_APPEAL` then resolved; downstream reversal/adjustment |
| Failure Handling | Time-barred admit ⇒ 409 `APPEAL_TIME_BARRED`; enhance without show-cause ⇒ 409 |
| Dependencies | M06, M10, M11, M12, MFA |
| Test Guidance | Limitation/condonation; set-aside reversal; enhancement guard |

---

### FR-M09-013 — Service Register Posting & Downstream Effects

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, SR Custodian (M12)

**User Story:** As a Disciplinary Authority, I want every concluded outcome posted to the Digital Service Register and propagated to payroll, seniority, and pension so that the employee's statutory record and entitlements reflect the decision accurately.

**Description:** Appends an immutable SR event (suspension, penalty, exoneration, appeal outcome) to M12 and emits idempotent effect events to M06 (seniority/promotion), M10 (payroll/recovery/subsistence), and M11 (pension). Uses an outbox/retry pattern for reliability and supports supersession when appeals modify outcomes.

**Acceptance Criteria:**
1. On order finalise (and appeal decision), an SR event is appended with order reference (DI-10 — at most one non-superseded per outcome).
2. Penalty-type-specific downstream events are emitted: WITHHOLD_INCREMENT/REDUCTION → M06+M10; RECOVERY → M10; CR/REMOVAL/DISMISSAL → M11; WITHHOLD_PROMOTION → M06.
3. Emission is idempotent and uses an outbox; failures retry without duplicating effects.
4. Appeal `SET_ASIDE`/`MODIFIED` posts a superseding SR event and reversal/adjustment events.
5. Downstream correlation IDs are stored (`downstream_event_id`, `sr_event_id`).

**Business Rules:**
- BR-1: SR events are append-only and never edited (supersession only).
- BR-2: Effects are emitted only after order finalisation/serve (not on draft).
- BR-3: Cross-module failures must not roll back the legally valid order (eventual consistency via outbox).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `service_register_events` | append (M12) |
| `penalty_orders` / `penalty_items` | source + correlation |
| `appeals` | supersession source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/orders/{id}/post-to-sr` | Trigger SR posting (idempotent) |
| GET | `/api/v1/dcp/orders/{id}/downstream-status` | View propagation status |

**UI Behavior Notes:** Propagation status panel on the order showing SR event id and per-module effect status (queued/done/failed-retry); manual re-trigger for stuck items.

**Edge Cases:** M12 unavailable (outbox retains, retries); duplicate trigger (idempotency key dedup); partial downstream success (per-effect status); reduction-in-rank target designation invalid (validation before emit).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PropagationStatusPanel`; `SrPostingService`, `OutboxDispatcher`, `EffectMapper` |
| Backend Flow | On finalise → write outbox entries (SR + per-effect) with idempotency keys → dispatcher posts to M12/M06/M10/M11 → record correlation ids → update statuses |
| Data Operations | INSERT `service_register_events`; INSERT outbox rows; UPDATE `penalty_orders.sr_event_id`, `penalty_items.downstream_event_id` |
| Validation | Effect mapping completeness; idempotency key uniqueness; target refs valid |
| Authorization | DA/Admin trigger; system dispatcher service-account |
| State Changes & Side Effects | Case → `SR_POSTING`→`CLOSED`; SR ledger appended; downstream effects executed by owners |
| Failure Handling | Upstream down ⇒ retain outbox, exponential backoff, alert; duplicate ⇒ ignore via key |
| Dependencies | M12, M06, M10, M11 |
| Test Guidance | Idempotency; outbox retry; supersession on appeal; per-effect status |

---

### FR-M09-014 — Document Evidence Vault (Link to M13)

- **Module:** M09-DCP
- **Primary Role(s):** IO, PO, DCP Admin, DA, Auditor (read)

**User Story:** As an Inquiry Officer, I want a sealed, tamper-evident evidence vault for all case artefacts so that the integrity and confidentiality of evidence are guaranteed and provable.

**Description:** Centralises all case artefacts (complaints, PI reports, charge-sheets, defences, exhibits, inquiry reports, notices, orders, appeals) as references to encrypted M13 objects, each with a SHA-256 `content_hash`, served/sealed flags, and full read-audit. Served items are visible to the charged officer; sealed items are restricted.

**Acceptance Criteria:**
1. Every artefact upload creates a `case_documents` link with `artefact_type`, `document_id`, `content_hash`, and served/sealed flags.
2. Reads of sealed documents are recorded as `view` audit events.
3. On retrieval, the stored `content_hash` is re-verified; mismatch raises `EVIDENCE_TAMPERED` and alerts.
4. The charged officer can list/download only `is_served=true` artefacts.
5. Vault listing is filterable by artefact type and paginated.

**Business Rules:**
- BR-1: Vault items are never hard-deleted; supersession/versioning via M13.
- BR-2: Sealing is irreversible without DA authorisation and audit.
- BR-3: Confidential-source artefacts inherit DI-9 masking.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_documents` | links |
| `inquiry_exhibits` | exhibit subset |
| `documents` (M13) | binaries |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/documents` | Add artefact link |
| GET | `/api/v1/dcp/cases/{caseId}/documents` | List vault (RBAC-filtered) |
| GET | `/api/v1/dcp/documents/{id}/download` | Download (hash-verified, audited) |

**UI Behavior Notes:** Vault explorer grouped by artefact type; seal/served badges; integrity-verified indicator; charged-officer view shows only served items.

**Edge Cases:** Large evidence files (chunked upload via M13); hash mismatch (block + alert); cross-case shared exhibit (separate links, no sharing of confidentiality scope).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `EvidenceVaultExplorer`, `IntegrityBadge`; `CaseDocumentService`, `HashVerifier` |
| Backend Flow | Upload via M13 → compute hash → persist link → on download verify hash + RBAC + write view-audit |
| Data Operations | INSERT `case_documents`; SELECT with RBAC filter; INSERT `audit_log`(view) |
| Validation | artefact_type enum; hash present; served/sealed rules |
| Authorization | RBAC + field-level served visibility; sealed restricted |
| State Changes & Side Effects | Read-audit on sealed access; alert on tamper |
| Failure Handling | M13 down ⇒ 503; hash mismatch ⇒ 409 `EVIDENCE_TAMPERED` |
| Dependencies | M13, audit |
| Test Guidance | Hash verify; served-only visibility; read-audit on sealed |

---

### FR-M09-015 — Integrity Register & Vigilance Clearance

- **Module:** M09-DCP
- **Primary Role(s):** Vigilance Officer, DA, HR (consumers across modules)

**User Story:** As a Vigilance Officer, I want to maintain each employee's integrity grade and vigilance clearance status so that promotions, deputations, retirements, and empanelment decisions can be gated on a reliable clearance signal.

**Description:** Maintains a per-employee vigilance record reflecting clearance status (clear / withheld / under-proceedings / not-clear) and integrity grade, automatically driven by case lifecycle (e.g. set UNDER_PROCEEDINGS on charge, CLEAR on exoneration), and exposes a clearance API consumed by M06/M11 and others.

**Acceptance Criteria:**
1. Filing/charging a case sets `clearance_status=UNDER_PROCEEDINGS`; exoneration sets `CLEAR`.
2. A penalty may set `integrity_grade=DOUBTFUL` for a configured period.
3. A clearance lookup API returns current status with validity window for any employee (RBAC-gated).
4. Manual override by Vigilance Officer is allowed with mandatory reason and audit.
5. All status changes write `audit_log` and an effective-dated history.

**Business Rules:**
- BR-1: Clearance status transitions are driven by case events but can be manually overridden by Vigilance Officer only.
- BR-2: `NOT_CLEAR`/`UNDER_PROCEEDINGS` blocks promotion in M06 (advisory gate enforced by M06).
- BR-3: Status has validity dates; expired DOUBTFUL grade auto-reverts to SATISFACTORY review.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `vigilance_records` | create/update |
| `disciplinary_cases` | event source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/vigilance/{employeeId}` | Clearance lookup |
| POST | `/api/v1/dcp/vigilance/{employeeId}` | Update/override status |

**UI Behavior Notes:** Vigilance register grid with status chips and validity; employee clearance card; override drawer with reason.

**Edge Cases:** Multiple concurrent cases (most-restrictive status wins); clearance requested during pending appeal (UNDER_PROCEEDINGS retained); retiring employee clearance for pension (M11 consumes).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `VigilanceRegister`, `ClearanceCard`, `OverrideDrawer`; `VigilanceService` |
| Backend Flow | Subscribe to case events → derive status (most-restrictive) → upsert effective-dated record → serve clearance API |
| Data Operations | INSERT/UPDATE `vigilance_records` (effective-dated); INSERT `audit_log` |
| Validation | Override requires reason + Vigilance role; validity window consistency |
| Authorization | Read: RBAC (M06/M11 service + Vigilance/DA); write: Vigilance Officer |
| State Changes & Side Effects | Status drives M06 promotion gate, M11 pension clearance |
| Failure Handling | Conflicting concurrent updates ⇒ most-restrictive resolver; 409 on stale write |
| Dependencies | M06, M11, audit |
| Test Guidance | Event-driven derivation; most-restrictive; override audit |

---

### FR-M09-016 — SLA / Statutory-Timeline Tracking & Case Analytics

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, DA, Vigilance Officer, Auditor

**User Story:** As a Disciplinary Case Manager, I want each stage tracked against statutory/internal SLAs with escalation, and a case-analytics dashboard, so that proceedings are timely and oversight is data-driven.

**Description:** Computes per-stage SLA targets from a configurable matrix, records timeline events, raises AT_RISK/BREACHED states with escalation notifications, and powers analytics: caseload, ageing buckets, stage bottlenecks, penalty mix, exoneration rate, appeal-overturn rate, and average cycle time — feeding M14.

**Acceptance Criteria:**
1. On entering each stage, an `sla_target_at` is computed from the SLA matrix and a `STAGE_ENTERED` timeline event written.
2. A scheduled evaluator marks `AT_RISK` (configurable threshold, e.g. 80% elapsed) and `BREACHED` on overrun, emitting escalation notifications.
3. The analytics endpoint returns aggregated KPIs with filters (org_unit, case_type, date range) and pagination on detail lists.
4. Ageing buckets (e.g. 0–30/31–90/91–180/180+ days) are computed per open case.
5. Timeline is append-only and immutable (DI-12).

**Business Rules:**
- BR-1: SLA matrix is admin-configurable per stage and case_type; statutory minimums cannot be shortened below config floor.
- BR-2: Breach escalations route up the authority hierarchy.
- BR-3: Analytics respect confidentiality (no PII leakage; aggregates only for non-privileged viewers).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_timeline_events` | SLA events |
| `disciplinary_cases` | stage/expected_closure |
| (config) SLA matrix | reference |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/cases/{id}/timeline` | Case timeline |
| GET | `/api/v1/dcp/analytics/summary` | KPI aggregates |
| GET | `/api/v1/dcp/analytics/ageing` | Ageing buckets |

**UI Behavior Notes:** Case header SLA ribbon (on-track/at-risk/breached); analytics dashboard with KPI tiles, ageing chart, bottleneck-by-stage chart, penalty-mix and overturn-rate visuals; export.

**Edge Cases:** Stage re-entry after remit/appeal (new SLA window, prior timeline preserved); paused clock during stays (SLA pause flag); time-zone-correct elapsed computation.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SLARibbon`, `AnalyticsDashboard`, `AgeingChart`; `SlaEngine`, `AnalyticsService` |
| Backend Flow | On stage transition compute target + write event → scheduled evaluator updates sla_status + escalates → analytics aggregates via read-model/materialised view |
| Data Operations | INSERT `case_timeline_events`; SELECT aggregates (materialised view); INSERT `notifications` on breach |
| Validation | Config floor respected; pause flag handling; bucket boundaries |
| Authorization | Detail: DA/Admin/Vigilance; aggregates: Auditor; M14 service-account |
| State Changes & Side Effects | sla_status updates; escalation notifications; M14 feed |
| Failure Handling | Evaluator job failure ⇒ retry + alert; stale read-model ⇒ refresh |
| Dependencies | scheduler, notifications, M14 |
| Test Guidance | Target computation; at-risk/breach thresholds; pause; ageing buckets; aggregate correctness |

---

## 7. UI Requirements

### 7.1 Screen inventory

| Screen | Primary roles | Key elements |
|--------|---------------|--------------|
| Disciplinary Case Workbench (list) | DCP Admin, DA, Vigilance | Filterable/paginated case list, status & SLA chips, quick-create |
| Case Detail (360°) | DA, IO, PO, Admin | Stage stepper, timeline, parties, artefacts, actions panel |
| Complaint Intake & Triage | Vigilance, Admin | Source form, dedup panel, triage drawer |
| Suspension Manager | DA, Admin | Order form, subsistence slider, review reminders |
| Charge-Sheet Builder | DA, PO, Admin | Article editor, track selector, PDF preview, service recorder |
| Charged-Officer Portal | Employee | Served documents only, defence submission, appeal filing, order copies |
| Inquiry Workbench | IO, PO | Hearing calendar, daily order sheet, witness register, exhibit vault, ex-parte |
| Inquiry Report Composer | IO, DA | Per-article finding grid, reasoning, serve/remit |
| Order Composer | DA | Penalty-item builder, speaking-order checklist, finalise (MFA) |
| Appeal/Review Console | Employee, Appellate/Reviewing Auth | Filing, limitation indicator, decision screen |
| Evidence Vault Explorer | IO, PO, DA, Auditor | Grouped artefacts, seal/served/integrity badges |
| Vigilance Register | Vigilance Officer | Status grid, clearance card, override |
| Analytics Dashboard | DA, Admin, Auditor | KPI tiles, ageing/bottleneck/penalty-mix charts |

### 7.2 Cross-cutting UI rules

- Real fields, real data, real states — no skeleton placeholders. Every screen defines **empty / loading / error / success / permission-denied / offline** states.
- WCAG 2.1 AA: keyboard navigation, focus order, contrast, ARIA labels on all interactive controls.
- Confidentiality: charged-officer views render **only** served artefacts; masked complainant identity where flagged.
- Destructive/finalising actions (finalise order, declare ex-parte, post to SR) use confirm dialogs and step-up MFA where specified.
- Dates display `DD-MMM-YYYY`; money in INR; all timestamps localised from UTC.
- All lists paginated (max 100/page) with server-side filter/sort.

---

## 8. (Reserved — merged into §6 LLDs)

*Low-Level Design is provided inline per FR in §6 as required by the authoring standard.*

---

## 9. (Reserved — see §6 and §10)

*Detailed backend flows are in each FR's LLD; API specifics follow in §10.*

---

## 10. API & Integration

### 10.1 Conventions

- Base path `/api/v1/dcp`; JSON; OIDC JWT bearer; RBAC + row-level + field-level enforcement.
- All list endpoints paginated: `?page=&limit=` (max 100), returning `{ data, page, limit, total }`.
- Idempotency: state-changing posts that propagate (suspension, finalise, post-to-sr) accept an `Idempotency-Key` header.

### 10.2 Canonical error envelope

```json
{
  "error": { "code": "PENALTY_EXCEEDS_PROPOSED", "message": "Final penalty must be within the show-cause proposed set.", "field": "penalty_items" },
  "requestId": "req-7f3a9c20"
}
```

### 10.3 Error-code catalog (module-specific, in addition to shared codes)

| Code | HTTP | Meaning |
|------|------|---------|
| `DUPLICATE_COMPLAINT` | 409 | Open complaint/case already exists for subject |
| `DA_NOT_RESOLVED` | 422 | Competent disciplinary authority not resolvable |
| `INVALID_STATE_TRANSITION` | 409 | Stage/status transition not allowed |
| `ACTOR_CONFLICT` | 409 | DA/IO/PO/witness not mutually distinct |
| `DEFENCE_WINDOW_CLOSED` | 409 | Defence submitted after due date without extension |
| `INCOMPLETE_FINDINGS` | 422 | Inquiry report missing an article finding |
| `NATURAL_JUSTICE_VIOLATION` | 409 | Penalty on not-proved article without disagreement memo |
| `PENALTY_EXCEEDS_PROPOSED` | 409 | Order penalty not subset of show-cause (DI-4) |
| `DUE_PROCESS_INCOMPLETE` | 409 | Required prior stage missing (DI-3) |
| `ORDER_IMMUTABLE` | 409 | Edit attempted on finalised order (DI-6) |
| `APPEAL_TIME_BARRED` | 409 | Appeal beyond limitation without condonation (DI-5) |
| `EVIDENCE_TAMPERED` | 409 | content_hash mismatch (DI-7) |
| `SUBSISTENCE_OUT_OF_BOUNDS` | 422 | Subsistence rate outside [25,75] (DI-8) |
| `CONFIDENTIALITY_DENIED` | 403 | Attempt to access sealed/confidential artefact |

### 10.4 Representative request/response examples

**Issue charge-sheet (POST `/charge-sheets/{id}/issue`)**

```json
// 200 OK
{
  "chargeSheetId": "cs-01",
  "status": "ISSUED",
  "documentId": "doc-5001",
  "articleCount": 2
}
```

**Submit defence (POST `/charge-sheets/{id}/defence`)**

```json
// request
{ "plea": "DENIES_ALL", "statementText": "...", "requestsOralInquiry": true }
// 201 Created
{ "defenceId": "def-01", "chargeSheetStatus": "RESPONDED", "path": "MAJOR_INQUIRY" }
```

**Finalise order (POST `/orders/{id}/finalise`, Idempotency-Key required)**

```json
// 200 OK
{
  "orderId": "po-02",
  "status": "FINALISED",
  "penalties": [
    { "type": "WITHHOLD_INCREMENT", "class": "MAJOR", "durationMonths": 24 },
    { "type": "RECOVERY", "class": "MAJOR", "recoveryAmount": 150000.00 }
  ],
  "srPosting": "QUEUED"
}
```

**Downstream status (GET `/orders/{id}/downstream-status`)**

```json
{
  "srEventId": "sr-9001",
  "effects": [
    { "module": "M06", "type": "WITHHOLD_INCREMENT", "status": "DONE" },
    { "module": "M10", "type": "RECOVERY", "status": "QUEUED" },
    { "module": "M11", "type": "PENSION_FLAG", "status": "N_A" }
  ]
}
```

### 10.5 Integration contracts

| Target | Trigger | Payload essence | Reliability |
|--------|---------|-----------------|-------------|
| M12 SR | order finalise, suspension, appeal | event_type, employee_id, order_ref, effective_date | append-only, idempotent |
| M10 PAY | suspension, recovery, reduction, withhold-increment | employee_id, effect_type, amount/%/effective_date | outbox + retry |
| M11 PEN | CR/removal/dismissal, pension cut | employee_id, effect_type, value | outbox + retry |
| M06 PPP | reduction in rank, withhold promotion | employee_id, designation/seniority effect | outbox + retry |
| M13 DMS | all artefacts | object upload, hash, metadata | synchronous + retry |
| M14 DAS | analytics | KPI read feed | read-only |

---

## 11. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | P95 API < 500 ms; analytics aggregates via materialised views refreshed ≤ 15 min |
| Availability | 99.9% uptime; RPO ≤ 15 min, RTO ≤ 4h |
| Scalability | Horizontal scaling; handle 100k+ active cases; paginated everywhere |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; step-up MFA for major penalties/appeals; field-level confidentiality |
| Privacy | DPDP Act 2023 alignment; PII minimisation; whistle-blower protection; masked exports |
| Auditability | Immutable `audit_log` + append-only `case_timeline_events`; read-audit on sealed records |
| Integrity | SHA-256 evidence sealing; immutable finalised orders; outbox-guaranteed propagation |
| Accessibility | WCAG 2.1 AA across all screens |
| Retention | Statutory retention of disciplinary records (lifelong + post-service per schedule); legal-hold support |
| Observability | Structured logs (no PII values), metrics on SLA breaches & propagation failures, traces with requestId |
| Localisation | UTC storage; `DD-MMM-YYYY`; INR; i18n-ready labels |

---

## 12. Workflow & State Diagrams (State Tables)

### 12.1 Case lifecycle (`case_status` × `case_stage`)

| Current stage | Event | Next stage | Guard |
|---------------|-------|-----------|-------|
| INTAKE | triage FILE_CASE / order PI | PRELIMINARY_INQUIRY or CHARGE | competent DA resolved |
| PRELIMINARY_INQUIRY | PI recommends proceed | CHARGE | recommendation ∈ {PROCEED_MAJOR, PROCEED_MINOR} |
| PRELIMINARY_INQUIRY | PI recommends drop | CLOSED (DROPPED) | DA approval |
| (any pre-order) | suspension ordered | SUSPENSION (parallel) | DA + bounds |
| CHARGE | charge-sheet served | DEFENCE | served_date set |
| DEFENCE | defence submitted / window lapse | INQUIRY_SETUP (major) or ORDER (minor admit) | path rule |
| INQUIRY_SETUP | IO/PO appointed | INQUIRY | distinct actors |
| INQUIRY | report submitted | INQUIRY_REPORT | all articles found |
| INQUIRY_REPORT | served + DA reviews | DA_CONSIDERATION | report served |
| DA_CONSIDERATION | disagreement / accept | SHOW_CAUSE or ORDER | natural-justice guard |
| SHOW_CAUSE | representation / lapse | ORDER | major track |
| ORDER | order finalised | SR_POSTING | DI-3, DI-4 satisfied |
| SR_POSTING | propagation done | CLOSED | SR appended |
| CLOSED | appeal filed | APPEAL | within limitation/condoned |
| APPEAL | decision | CLOSED (resolved) | authority ≠ DA |

### 12.2 Charge-sheet state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| DRAFT | issue | ISSUED | ≥1 article, PDF rendered |
| ISSUED | serve | SERVED | mode + date |
| SERVED | defence submitted | RESPONDED | within/after window |
| DRAFT/ISSUED | withdraw | WITHDRAWN | DA + reason |

### 12.3 Inquiry state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| NOT_STARTED | first hearing | IN_PROGRESS | IO appointed |
| IN_PROGRESS | no-show threshold + notice | EX_PARTE | proof of notice |
| IN_PROGRESS / EX_PARTE | report submitted | CONCLUDED | all findings |
| CONCLUDED | DA remit | DE_NOVO | DA reasons |

### 12.4 Order state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| DRAFT | finalise | FINALISED | DI-3/DI-4, speaking order, MFA |
| FINALISED | serve | SERVED | — |
| SERVED | appeal set-aside | SET_ASIDE | appeal decision |
| SERVED | appeal modify | MODIFIED | revised order created |
| FINALISED/SERVED | court/appellate stay | STAYED | stay order recorded |

### 12.5 Appeal state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| FILED | admit | ADMITTED | within limitation or condoned |
| FILED | reject (time-barred) | REJECTED | no condonation |
| ADMITTED | review | UNDER_REVIEW | authority ≠ DA |
| UNDER_REVIEW | decide | DECIDED | reasoning recorded; enhancement ⇒ show-cause |

### 12.6 Suspension state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| ACTIVE | extend | EXTENDED | documented extension |
| ACTIVE | revoke | REVOKED | reason + events emitted |
| ACTIVE | deemed revoke (detention quashed) | DEEMED_REVOKED | proof |

---

## 13. Notifications

| Event | Recipients | Channel | Template essence |
|-------|-----------|---------|------------------|
| Complaint filed against employee (post-triage FILE_CASE) | DA, Vigilance | in-app, email | Case {case_no} opened |
| PI ordered / due / breached | PI officer, DA | in-app, email | PI {pi_id} status |
| Suspension order / subsistence review due | Employee, Payroll, DA | in-app, email | Suspension effective {date} |
| Charge-sheet served | Charged officer | in-app, email | Reply by {defence_due_date} |
| Defence window closing (T-3/T-1) | Charged officer | in-app, email, SMS | Submit defence reminder |
| IO/PO appointed | IO, PO, charged officer | in-app, email | Appointment notice |
| Hearing scheduled / adjourned | IO, PO, charged officer, defence assistant | in-app, email | Hearing on {date} |
| Ex-parte declared | Charged officer, DA | in-app, email | Ex-parte order recorded |
| Inquiry report served | Charged officer | in-app, email | Represent by {date} |
| Disagreement memo served | Charged officer | in-app, email | Represent by {date} |
| Show-cause served | Charged officer | in-app, email | Respond by {date} |
| Penalty/exoneration order served | Charged officer, Payroll/Pension/Seniority owners | in-app, email | Order {order_no} |
| Appeal filed / decided | Charged officer, Appellate authority, DA | in-app, email | Appeal {status} |
| SLA at-risk / breach | DA, Admin, escalation authority | in-app, email | Stage {stage} {sla_status} |
| Propagation failure | DCP Admin | in-app, email | Effect to {module} failed, retrying |

All notifications recorded in the shared `notifications` ledger; confidentiality rules (§3.3) applied to content.

---

## 14. Reporting & Analytics

| Report / KPI | Description | Consumers |
|--------------|-------------|-----------|
| Caseload & status mix | Open/closed by status, case_type, org_unit | DA, Admin, M14 |
| Ageing buckets | 0–30/31–90/91–180/180+ days per open case | DA, Admin |
| Stage bottleneck analysis | Avg time per stage; SLA breach hotspots | Admin, Auditor |
| Penalty mix | Distribution by penalty_type/class | DA, M14 |
| Exoneration rate | Exonerated ÷ concluded | Auditor, M14 |
| Appeal overturn rate | Set-aside+modified ÷ appeals decided | Auditor, M14 |
| Average cycle time | Initiation → closure | DA, M14 |
| Suspension register | Active suspensions, subsistence reviews overdue | Payroll, DA |
| Vigilance clearance dashboard | Clearance status distribution; doubtful-integrity list | Vigilance, M06/M11 |
| SLA compliance | % stages within SLA | Admin, Auditor |

Reports respect confidentiality (aggregates only for non-privileged viewers; no complainant PII). All export endpoints paginated/streamed and audited.

---

## 15. Migration & Launch

### 15.1 Data migration

| Step | Action |
|------|--------|
| M-1 | Inventory legacy disciplinary files (paper/legacy DB); classify by stage |
| M-2 | Map legacy statuses → `case_status`/`case_stage`; reference-data load (penalties, SLA matrix, conduct rules) |
| M-3 | Migrate open cases with current stage + key artefacts (scanned to M13 with hashes); closed cases as historical records |
| M-4 | Reconstruct timeline events where dates known; mark unknowns `N_A` |
| M-5 | Link suspensions/penalties to existing M10/M11/M06 effects without re-triggering (migration flag suppresses re-emit) |
| M-6 | Reconciliation report: counts by status, orphan checks, hash verification |

### 15.2 Cutover & launch

- Dual-run period: new intake on M09; legacy frozen read-only.
- Idempotency/migration flag prevents duplicate downstream effects during backfill.
- Pilot with one department; validate due-process guards and SR posting before org-wide rollout.
- Rollback plan: migration is additive; legacy retained until sign-off.

### 15.3 Launch readiness checklist

- RBAC + field-level confidentiality verified; step-up MFA active.
- SLA matrix and reference data loaded and approved.
- Integration smoke tests with M06/M10/M11/M12/M13 green.
- Audit/append-only ledgers verified immutable.
- Accessibility (WCAG 2.1 AA) and confidentiality views validated.

---

## 16. Traceability / Dependency / Parallel-Agent Plan

### 16.1 Requirements ↔ entities ↔ APIs traceability matrix

| FR | Entities | Key APIs | Dependencies | State tables |
|----|----------|----------|--------------|--------------|
| FR-M09-001 | case_complaints, disciplinary_cases | /complaints, /triage | M01, audit | §12.1 |
| FR-M09-002 | preliminary_inquiries | /preliminary-inquiries | M13, SLA | §12.1 |
| FR-M09-003 | suspensions | /suspensions | M01, M10, M12 | §12.6 |
| FR-M09-004 | charge_sheets, charge_articles | /charge-sheets | M13 | §12.2 |
| FR-M09-005 | defence_statements | /defence | scheduler | §12.1 |
| FR-M09-006 | inquiry_appointments, inquiry_proceedings | /appointments | M01 | §12.3 |
| FR-M09-007 | inquiry_hearings, inquiry_witnesses, inquiry_exhibits | /hearings,/witnesses,/exhibits | M13, SLA | §12.3 |
| FR-M09-008 | inquiry_reports, charge_articles | /report | M13 | §12.3 |
| FR-M09-009 | disagreement_memos | /disagreement-memo | notifications | §12.1 |
| FR-M09-010 | show_cause_notices | /show-cause | notifications | §12.1 |
| FR-M09-011 | penalty_orders, penalty_items | /orders | M06/M10/M11/M12/M13, MFA | §12.4 |
| FR-M09-012 | appeals, penalty_orders | /appeals | M06/M10/M11/M12 | §12.5 |
| FR-M09-013 | service_register_events, penalty_orders | /post-to-sr | M12/M06/M10/M11 | §12.4 |
| FR-M09-014 | case_documents, inquiry_exhibits | /documents | M13 | — |
| FR-M09-015 | vigilance_records | /vigilance | M06/M11 | — |
| FR-M09-016 | case_timeline_events | /timeline,/analytics | scheduler, M14 | all |

### 16.2 Dependency / build order

1. **Foundation:** entities E1–E21; RBAC + field-level confidentiality; audit/timeline ledgers.
2. **Intake chain:** FR-001 → FR-002 → FR-003.
3. **Charge & defence:** FR-004 → FR-005.
4. **Inquiry:** FR-006 → FR-007 → FR-008 → FR-009.
5. **Decision:** FR-010 → FR-011.
6. **Propagation:** FR-013 (consumed by FR-011/FR-012).
7. **Remedies:** FR-012.
8. **Cross-cutting:** FR-014 (vault), FR-015 (vigilance), FR-016 (SLA/analytics) — parallelisable once foundation exists.

### 16.3 Parallel-agent plan

| Track | Agent scope | Can start after |
|-------|-------------|-----------------|
| A | Data model + migrations (E1–E21) | — |
| B | Intake + suspension (FR-001/002/003) | A |
| C | Charge/defence/inquiry (FR-004–009) | A |
| D | Decision/appeal (FR-010/011/012) | A, C |
| E | Propagation/outbox (FR-013) | A, integration stubs |
| F | Vault + vigilance (FR-014/015) | A |
| G | SLA + analytics (FR-016) | A |
| H | UI shell + screens (§7) | A, contracts |

### 16.4 Final reconciliation table (0 unresolved gaps)

| Area | Required | Provided | Gap |
|------|----------|----------|-----|
| FRs (12–18 target) | yes | 16 (FR-001…016) | 0 |
| Module entities with field tables | all | 21 | 0 |
| Sample data (2–3 rows/entity) | all module entities | 21 | 0 |
| Enum catalog | complete | yes | 0 |
| Integrity rules | defined | DI-1…DI-12 | 0 |
| LLD per FR | each FR | 16 | 0 |
| State tables | core lifecycles | 6 | 0 |
| Error-code catalog | module-specific | 14 codes | 0 |
| API JSON examples | representative | 4 | 0 |
| Notifications | lifecycle-wide | 15 events | 0 |
| Reporting/analytics | KPIs | 10 | 0 |
| Migration/launch | plan | yes | 0 |
| Roles & permission matrix | complete | yes | 0 |
| Downstream integration (M06/M10/M11/M12/M13/M14) | mapped | yes | 0 |
| Shared-foundation reuse (no redefinition) | required | honoured | 0 |

**Result: 0 unresolved gaps.**

---

## 17. Glossary

| Term | Definition |
|------|------------|
| Article of Charge | A specific, numbered allegation the employee must answer |
| Statement of Imputation | The facts and circumstances supporting an article of charge |
| Charge-sheet (Memorandum of Charges) | Formal document framing the articles of charge |
| Disciplinary Authority (DA) | Authority competent to initiate proceedings and impose penalties |
| Inquiry Officer (IO) | Impartial officer who conducts the departmental inquiry |
| Presenting Officer (PO) | Officer presenting the department's case before the IO |
| Defence Assistant | Person assisting the charged officer in the inquiry |
| Daily Order Sheet | Dated minutes/record of each hearing |
| Ex-parte | Proceeding conducted in the absence of the charged officer after due notice |
| Disagreement Memo | DA's recorded reasons for differing from the IO's findings |
| Show-cause Notice | Notice giving the employee an opportunity to represent against a proposed penalty |
| Minor Penalty | Lesser penalty (censure, warning, fine, withholding increment) |
| Major Penalty | Severe penalty (reduction, compulsory retirement, removal, dismissal) |
| Compulsory Retirement (CR) | Major penalty retiring the employee with (often reduced) pension |
| Removal | Major penalty ending service (no future-employment disqualification) |
| Dismissal | Major penalty ending service with future-employment disqualification |
| Subsistence Allowance | Reduced pay during suspension |
| Vigilance Clearance | Status indicating absence/presence of pending disciplinary/vigilance matters |
| Suo-motu | Action taken by an authority on its own motion |
| De novo Inquiry | A fresh inquiry ordered when the prior inquiry is defective |
| Limitation | Statutory time window within which an appeal must be filed |
| Condonation of Delay | Authority's acceptance of a late appeal for sufficient cause |
| Natural Justice | Principles of fair hearing (audi alteram partem) and unbiased adjudication (nemo judex in causa sua) |
| Speaking Order | A reasoned order stating the grounds for the decision |

---

## 18. Appendices

### Appendix A — SLA matrix (default, configurable)

| Stage | Default SLA | At-risk threshold |
|-------|-------------|-------------------|
| INTAKE/Triage | 15 days | 80% |
| Preliminary inquiry | 30 days | 80% |
| Charge-sheet framing | 30 days | 80% |
| Defence reply window | 15 days | — (statutory) |
| Inquiry conclusion | 180 days | 80% |
| Inquiry report → DA decision | 30 days | 80% |
| Show-cause response | 15 days | — |
| Order issuance | 30 days | 80% |
| SR posting & propagation | 7 days | 80% |
| Appeal limitation | 45 days | — (statutory) |

### Appendix B — Penalty → downstream effect map

| Penalty | M06 | M10 | M11 | M12 |
|---------|-----|-----|-----|-----|
| Censure / Warning | — | — | — | SR entry |
| Fine | — | recovery | — | SR entry |
| Withholding increment | progression | pay | — | SR entry |
| Withholding promotion | seniority/promotion | — | — | SR entry |
| Recovery | — | recovery | — | SR entry |
| Reduction in rank | seniority/designation | pay | — | SR entry |
| Compulsory retirement | — | final pay | pension (reduced) | SR entry |
| Removal | — | final settlement | pension rules | SR entry |
| Dismissal | — | final settlement | disqualification | SR entry |

### Appendix C — Confidentiality classification

| Artefact | Default visibility |
|----------|--------------------|
| Complaint (confidential source) | Vigilance, DA only |
| Preliminary inquiry report | DA, Vigilance, Admin (never charged officer) |
| Charge-sheet | Served → charged officer |
| Inquiry report copy | Served → charged officer |
| Show-cause / orders | Served → charged officer |
| Sealed exhibits | IO, PO, DA, Auditor; charged officer per admission |
| Vigilance scoring/DA deliberation | DA, Vigilance only |

### Appendix D — Assumptions & caveats

- Statutory windows (defence reply, limitation, subsistence review) are seeded as defaults and **configurable** to the deploying jurisdiction's rules; the engine enforces a non-shortenable statutory floor.
- Exact penalty taxonomy and authority hierarchy are reference data resolved from org configuration (M01/org_units) and the conduct-rules master.
- Criminal-proceeding linkage is reference-only; integration with external court/police systems is out of scope for v1.
