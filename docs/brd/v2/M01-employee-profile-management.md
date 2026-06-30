# Employee Profile Management — HRMS Module BRD (v2.0)

**Module code:** `M01-EPM`
**Module name:** Employee Profile Management — the Canonical Employee Master
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector, CGG Data Centre
**Document version:** v2.0 (revised after 5-advisor adversarial council; supersedes v1.0)
**Status:** Issued for build (parallel-agent ready) — Phase 1 (spine) and Phase 2 (configurability) explicitly demarcated
**Authoring standard:** World-class HCM (Workday / SAP SuccessFactors / Oracle HCM class) layered on a public-sector statutory context, with **engineered** (not asserted) DPDP Act 2023 + Aadhaar Act 2016 compliance
**Upstream contract:** `docs/brd/SHARED_FOUNDATION.md` (single source of truth — reused, not redefined)
**Council evidence:** `docs/evaluation/M01-employee-profile-management-council.md` (22 risks; 22 adopted improvements — all folded in; see §1.6)

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
effective-dated for every job/organisational change **and for the core person attributes that matter
statutorily (name, gender, marital status, social category, DOB, disability, religion)**, deactivated
on separation, retained per a **machine-enforced retention/legal-hold schedule**, and (where lawful)
erased. It provides a **360° profile view** served from a **CQRS read projection**, **effective-dated
org-chart placement** with **effective-dated position management**, **configurable profile sections**
(Phase 2), **effective-dated attributes** with point-in-time ("time-travel") views, **field-level PII
access control** with **hardened break-glass**, **engineered DPDP Act 2023 data-principal rights and
consent governance**, an **Aadhaar Data Vault** aligned to the **Aadhaar Act 2016 / UIDAI Data Vault**
circular, **advisory** profile-completeness scoring (never a payroll gate), **data-quality validation**,
**alias-based deduplication that never re-points other modules' rows**, an **employee self-service read
view**, and **bulk import with a PROVISIONAL/QUARANTINE state** for realistic legacy migration.

> **Scope boundary with M02:** M01 owns the *data and the read/maintain surfaces*. **Edits to
> employee-initiated personal details are governed by Module 02 (M02-EPDM) via maker-checker
> workflow.** M01 *references* that workflow (it exposes the fields, the validation, and the
> commit-on-approval write path); it does **not** duplicate the approval engine. Direct HR/Admin
> corrections that are not employee-initiated follow M01's own authorisation and audit rules described
> here.
>
> **Scope boundary with M10 (Payroll):** M01 **never** blocks payroll. Completeness/data-quality is
> **advisory only**. The single legitimate disbursement precondition — a *verified primary salary
> account* — is owned and enforced by **M10** as a typed `NO_VERIFIED_BANK` precondition with a
> non-electronic (cheque/manual) fallback, so wages are never withheld for data hygiene (see §1.6 #6).

### 1.2 Business Context & Problem Statement

Public-sector HR data today is fragmented across paper service books, spreadsheets, and siloed
departmental systems. The same employee appears with inconsistent spellings, duplicate records, stale
designations, and missing statutory IDs. There is no single, access-controlled, effective-dated record
of "who this person is, what post they hold today, and what they held on any past date." This blocks
accurate payroll, lawful pension calculation, defensible disciplinary process, and trustworthy
analytics. M01 eliminates this by establishing **one authoritative, versioned, auditable employee
record** consumed by the whole suite — and, in v2, one whose **compliance posture is engineered into
the schema and the read/write paths, not asserted in prose**.

### 1.3 Goals & Success Metrics

| # | Goal | Success metric (target) |
|---|---|---|
| G1 | Single source of truth | 100% of M02–M14 reads resolve via M01 consumption API; **0** competing master copies; identity always resolved through `employee_id_aliases` |
| G2 | Data completeness | ≥ 98% of ACTIVE employees at profile-completeness score ≥ 90% within 90 days of go-live **(advisory metric; never gates pay)** |
| G3 | Data quality | < 0.1% duplicate person rate; 100% of statutory IDs format-validated |
| G4 | Privacy compliance | 100% of PII fields governed by a field-access policy; 0 unauthorised PII reads in audit sampling; **100% of Aadhaar numbers stored only in the Aadhaar Data Vault**; 100% of consent/notice events ledgered; breach-notification within statutory timeline |
| G5 | Effective-dated integrity | 100% of job/org/**position**/**core-person-attribute** changes stored as effective-dated rows with no overlapping active assignments |
| G6 | Performance | P95 profile read < 500 ms; 360° view assembled < 800 ms P95 from the CQRS read projection at 500k records; **audit-on-read is async (off the hot path)** |
| G7 | Migration | Realistic staged glide path (§1.6 #11): ≥ 80% CLEAN at cutover, ≥ 95% CLEAN within 180 days; remaining rows committed as **PROVISIONAL** (login-disabled, remediation-queued) — **never rejected outright** |

### 1.4 In-Scope Capabilities (headline)

Create-on-hire; 360° view (CQRS); multiple addresses & contacts; dependents/family/nominees; emergency
contacts; education/qualifications/prior experience; identity & statutory documents **with Aadhaar Data
Vault**; bank/financial; photo & **isolated biometric** reference; **effective-dated** position
management & org-chart; effective-dated attributes (**including core person attributes**) & point-in-time
view; configurable sections & custom fields **(Phase 2)**; field-level PII access control with
**hardened break-glass**; **DPDP data-principal rights, consent ledger, DPO role, grievance & breach
workflows**; **retention, legal-hold & erasure engine**; **governed statutory-field (DOB/category/name)
change**; **category & PwD certificate management**; **deceased-employee succession & family-pension
handoff**; **phonetic/transliteration search**; advisory completeness scoring & data-quality validation;
**alias-based deduplication**; self-service read view; **bulk import with PROVISIONAL state**; lifecycle
deactivation/reactivation; and the master-data consumption API **with a specified change-feed backbone**.

### 1.5 Out-of-Scope (delegated to other modules)

- Approval workflow for employee-initiated edits → **M02-EPDM**.
- Leave/attendance balances and applications → **M03/M04**.
- Transfers, relieving, joining mechanics → **M05** (M01 *records* the resulting placement).
- Promotions/seniority computation → **M06** (M01 *records* the resulting designation/position).
- Payroll computation, payslips, **disbursement-readiness gating** → **M10**; pension & **family-pension
  award** → **M11** (M01 *hands off* the heir/nominee linkage).
- Statutory service-event ledger semantics → **M12** (M01 *emits* events to M12).
- Binary document storage/encryption/versioning → **M13** (M01 stores only `document_id` references).
- Cross-module dashboards → **M14**.

### 1.6 Amendments (v1 → v2) — Council Improvement Audit Trail

This subsection is the audit trail proving every adopted council improvement was folded in. Each row
maps a council item to its concrete landing point in this v2 BRD. (Risk IDs reference the council Risk
Register; all 3 Critical + 6 High + 6 Medium + 7 Low risks are mitigated by concrete requirements.)

| # | Adopted council improvement (risk) | Where / how incorporated in v2 |
|---|---|---|
| 1 | `employee_id_aliases`; merge only consolidates M01 satellites, soft-deletes loser, writes alias, emits `RECORDS_MERGED`; remove all cross-module FK re-pointing (R2, **Critical**) | New entity **E21 `employee_id_aliases`** (§5.4); **FR-EPM-015 rewritten**; §4.3 build-instruction 7; consumption API resolves identity via alias (FR-EPM-019 AC); §5.6 rule 11; error `UNDO_EXPIRED` retained, `MERGE_CONFLICT` retained |
| 2 | Aadhaar Data Vault keyed by Reference Key; remove duplicate `employees.national_id`; document lawful basis (AUA/KUA/statute) (R1, **Critical**) | New entity **E22 `aadhaar_vault`** (§5.4); `employees.national_id` **removed** (§5.4 E1 note); `employee_identity_documents` holds only masked + `aadhaar_ref_key`; **FR-EPM-007 rewritten**; §4.4 compliance binding |
| 3 | Isolate biometric/facial-photo processing — own purpose/consent/retention; no raw template in M01 (R1, **Critical**) | **FR-EPM-009 rewritten** (biometric split from profile photo, distinct consent + purpose); E11 `employee_photos` gains `processing_purpose`; consent recorded in **E27 `consent_records`**; §4.4 |
| 4 | New FR — Data Privacy, Consent & Data-Principal Rights: consent/notice ledger, 6 DPDP rights, DPO role, grievance & breach workflows (R4, High) | New **FR-EPM-020**; new entities **E26 `privacy_notices`**, **E27 `consent_records`**, **E28 `data_principal_requests`**, **E29 `breach_incidents`**; new role **Data Protection Officer** (§3) |
| 5 | New FR — Retention, Legal Hold & Erasure; erasure-vs-retention reconciliation (retention wins where lawful) (R4, High) | New **FR-EPM-021**; new entities **E30 `retention_policies`**, **E31 `legal_holds`**; new `ARCHIVED`/`PURGE_PENDING` lifecycle states (§10.1) |
| 6 | DQ `BLOCKED` → advisory-only; disbursement gating moved to M10 (`NO_VERIFIED_BANK`) with non-electronic fallback (R3, **Critical**) | **FR-EPM-014 rewritten** (advisory only); `DQ_FLAG` enum drops `BLOCKED` semantics for pay (renamed values §5.5); §1.1 boundary; §8.4 integration; error catalog note; M10 owns `NO_VERIFIED_BANK` |
| 7 | Unified `employee_attribute_history` spine effective-dating core person attributes (R5, High) | New entity **E23 `employee_attribute_history`**; new **FR-EPM-011 scope extended** to core person attributes; `employees` core-attribute columns become **current-cache** of the history spine (§5.4 E1) |
| 8 | Governed-change workflow for DOB/category (limited alteration, proof, approving authority, audit, SR event) (R6, High) | New **FR-EPM-022**; new entity **E32 `governed_field_change_requests`**; SR event `GOVERNED_FIELD_CHANGED` (§11/§10) |
| 9 | Effective-date the `positions` entity (R9, High) | New entity **E24 `position_history`**; **FR-EPM-010 extended**; §5.6 rule 14 |
| 10 | Harden break-glass: volume caps, anomaly detection, real-time alerts, optional 4-eyes for bulk/special-category (R7, High) | **FR-EPM-013 extended**; new entity **E34 `break_glass_reveals`**; thresholds in §4.4 & §9; real-time alert in §11 |
| 11 | PROVISIONAL/QUARANTINE record state + relaxed migration profile + remediation queue; nullable-during-migration; realistic glide path (R8, High) | **FR-EPM-017 rewritten**; new `employment_status` not needed — instead new `record_state` (PROVISIONAL/ACTIVE/ARCHIVED) on `employees` (§5.4 E1, §5.5); §13 glide path replaces 99.5% target |
| 12 | `row_version` optimistic lock on every mutable entity; `409 CONFLICT`; etag derived from it (R13, Medium) | §5.4 convention (every mutable table gains `row_version INT`); §5.6 rule 16; error `CONFLICT`/new `STALE_VERSION`; FR-003/008/009/010/022 AC |
| 13 | Specify change-feed event backbone (transport, ordering, retention/replay, cursor, tombstones, DLQ) (R14, Medium) | New entity **E33 `outbox_events`**; **FR-EPM-019 extended** (§ change-feed backbone spec); §8.5 backbone spec |
| 14 | Move audit-on-read off hot path (async sink; sampling/aggregation) (R10, Medium) | §4.4, §9 (async audit sink); FR-EPM-002/013/019 LLD updated; `outbox_events`/audit queue |
| 15 | CQRS/materialised read projection for 360° + resolved-policy cache; latency budget at 500k (R11, Medium) | **FR-EPM-002 rewritten** (read model `employee_profile_read_model`); §9 latency budget; §5.4 note on read projection |
| 16 | Replace denormalisation DB trigger with explicit service-layer sync (R12, Medium) | **FR-EPM-010 LLD** updated (service-layer sync inside tx; trigger removed); §5.6 rule 2 |
| 17 | Configurable name model; allow mononyms (`last_name` nullable + single-name flag) (R15, Medium) | §5.4 E1 (`last_name` nullable, `has_single_legal_name` flag, `display_name`); FR-EPM-001 AC/validation |
| 18 | DECEASED downstream: legal-heir/nominee linkage, family-pensioner hook to M11, data-rights succession (R16, Medium) | New **FR-EPM-024**; `employee_nominees`/`employee_dependents` gain heir linkage; SR event `DEATH`; M11 handoff (§8.4) |
| 19 | Certificate sub-entity for category (EWS/OBC) & PwD (validity, percentage, creamy-layer) with expiry alerts (R17, Medium) | New entity **E25 `employee_certificates`**; new **FR-EPM-023**; expiry alerts (§11); feeds advisory DQ |
| 20 | Extend maker-checker/4-eyes from bank-only to a configurable high-risk field set (PAN, Aadhaar, category, DOB, pension nominee) (R20, Low) | New config entity reuse: `high_risk_field_config` modeled via `field_access_policies.requires_four_eyes` (§5.4 E17); FR-EPM-007/022/004 enforce; §3 SoD note |
| 21 | Phonetic + transliteration search; feed dedup; conditional statutory-ID by nationality/employment_type; unique `official_email` (R19/R22, Low) | New **FR-EPM-025**; FR-EPM-015 matcher reuse; §5.6 rule 9 (conditional statutory IDs); §5.6 rule 17 (unique official_email) |
| 22 | Fix correctness/credibility defects: FR cross-ref (field access = **FR-EPM-013**), entity count stated once, honest open-issues register, explicit Phase 1/2 demarcation (R18/R21 + Clash 2) | §3/§4.3 now correctly cite **FR-EPM-013**; §5.1 states table count once; §14.4 is an **honest open-issues register** (not "0 gaps"); §2.4 Phasing table; Appendix E open items expanded |

> **Severity coverage:** 3 Critical (R1/R2/R3 → improvements #2,#3 / #1 / #6), 6 High (R4–R9 → #4,#5,#7,#8,#9,#10,#11), 6 Medium (R10–R15 → #14,#15,#13,#16,#12,#17), 7 Low (R16–R22 → #18,#19,#20,#21,#22) — **all mitigated as concrete requirements/controls below.**

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Owned by M01? | Notes / hand-off |
|---|---|---|
| Person & demographic master | **Yes** | `employees` (extends canonical); core attrs cached from `employee_attribute_history` |
| Core person-attribute history (name/gender/category/DOB/disability/religion/marital) | **Yes (v2 new)** | `employee_attribute_history` (E23) |
| Contact & multiple addresses | **Yes** | `employee_contacts`, `employee_addresses` |
| Dependents, family, nominees, **legal heirs** | **Yes** | `employee_dependents`, `employee_nominees` |
| Emergency contacts | **Yes** | `employee_emergency_contacts` |
| Education, qualifications, prior experience | **Yes** | `employee_education`, `employee_experience` |
| Identity & statutory documents | **Yes** | `employee_identity_documents` (refs M13 scans) |
| **Aadhaar number vault** | **Yes (v2 new)** | `aadhaar_vault` (E22) — Reference-Key architecture |
| Category (EWS/OBC) & PwD certificates | **Yes (v2 new)** | `employee_certificates` (E25) |
| Bank & financial | **Yes** | `employee_bank_accounts` (consumed by M10/M11) |
| Photo & **isolated biometric** reference | **Yes** | `employee_photos` (binary in M13; biometric purpose-isolated) |
| **Effective-dated** position management & org placement | **Yes** | `positions`, `position_history` (E24), `employee_job_assignments` |
| Effective-dated attributes & point-in-time | **Yes** | versioned assignment + `employee_attribute_history` |
| Configurable sections & custom fields **(Phase 2)** | **Yes** | `profile_sections`, `custom_field_definitions`, `employee_custom_field_values` |
| Field-level PII access control + **hardened break-glass** | **Yes** | `field_access_policies`, `break_glass_reveals` (E34) |
| **Consent & privacy notices** | **Yes (v2 new)** | `privacy_notices` (E26), `consent_records` (E27) |
| **Data-principal rights & grievance** | **Yes (v2 new)** | `data_principal_requests` (E28) |
| **Breach incident & notification** | **Yes (v2 new)** | `breach_incidents` (E29) |
| **Retention & legal hold & erasure** | **Yes (v2 new)** | `retention_policies` (E30), `legal_holds` (E31) |
| **Governed statutory-field change** | **Yes (v2 new)** | `governed_field_change_requests` (E32) |
| Completeness scoring & data quality **(advisory only)** | **Yes** | `employee_profile_completeness` |
| Deduplication **(alias-based)** | **Yes** | `dedup_candidates`, `employee_id_aliases` (E21) |
| **Phonetic/transliteration search** | **Yes (v2 new)** | matcher service over name/`name_local` |
| Self-service read view | **Yes** | read projection of the above |
| Bulk import / migration **(PROVISIONAL state)** | **Yes** | `employee_import_batches`, `import_staging_rows` |
| Lifecycle deactivation/reactivation/**archival** | **Yes** | `employees.employment_status` + `record_state` transitions |
| **Change-feed backbone** | **Yes (v2 new)** | `outbox_events` (E33) |
| Master consumption API (SSOT) | **Yes** | `/api/v1/employees/...` read contract |
| Edit-request approval workflow | No → **M02** | M01 exposes fields + commit path only |
| Document binary storage | No → **M13** | M01 holds `document_id` references |
| Service-event ledger | No → **M12** | M01 writes events via shared producer |
| **Disbursement-readiness gating** | No → **M10** | `NO_VERIFIED_BANK` precondition + cheque fallback |
| **Family-pension award** | No → **M11** | M01 hands off heir/nominee linkage on DECEASED |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied module-wide)

- **RBAC + row-level org scoping:** every read/write is authorised by role and bounded to the caller's
  `org_unit` subtree unless a wider scope is explicitly granted.
- **Audit-everything:** every create/update/delete/state-change writes to `audit_log`; **restricted-PII
  reads are audited via an async sink** (off the hot path) — see §4.4, §9.
- **Soft delete:** `is_deleted` on all mutable tables; physical deletion only via DB-change approval and
  only when no `legal_holds` row blocks it (FR-EPM-021).
- **Effective dating:** job/org/**position**/**core person-attribute** changes are *versioned*, never
  overwritten.
- **Optimistic concurrency:** every mutable table carries `row_version`; writes pass the expected
  `row_version`; mismatch → `STALE_VERSION` (409); API `etag` derives from `row_version`.
- **Pagination:** all list endpoints paginated, hard max page size = 100.
- **Canonical error envelope** and **UTC storage / locale display** per Shared Foundation §3, §5.
- **i18n / WCAG 2.1 AA** on every screen; dates display `DD-MMM-YYYY`; currency INR default.

### 2.3 Boundary Diagram (textual)

```
                    +---------------------------+
   Hire feed  --->  |        M01-EPM            |  ---> M12-SR (service events via outbox)
   (M05 joining)    |  Employee Master (SSOT)   |  ---> M10-PAY (bank attrs; M10 owns NO_VERIFIED_BANK gate)
                    |                           |  ---> M11-PEN (bank, pension, family-pension heir handoff)
   M02 edit-commit  |  - profile data           |  ---> M03/M04 (identity, org, manager)
   (approved) --->  |  - effective-dated jobs    |  ---> M06 (designation/position placement)
                    |  - effective-dated         |  ---> M09 (reporting line, identity)
   Bulk import ---> |    positions + attrs       |  ---> M14 (analytics reads)
   (PROVISIONAL)    |  - PII access + break-glass|  <--- M13 (document_id for scans/photos)
                    |  - consent/rights/retention|  <--> UIDAI vault basis (Aadhaar Data Vault, M01-internal)
   identity via --> |  - employee_id_aliases     |  ===> change-feed (outbox) consumed by M02-M14
   alias resolve    +---------------------------+
```

### 2.4 Phasing (Phase 1 spine vs Phase 2 configurability) — replaces "all FRs equally Resolved"

The council's Second-Pass Clash 2 resolution: **build the spine, defer the speculative surface**, with
the dividing line "does a downstream module or a statute consume it in v1?".

| Phase | FRs | Rationale |
|---|---|---|
| **Phase 1 (load-bearing spine — must ship v1)** | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 (Aadhaar vault), FR-008, FR-009, FR-010 (positions effective-dated), FR-011 (core-attribute history), FR-013 (field access + hardened break-glass), FR-014 (advisory), FR-015 (alias dedup), FR-016, FR-017 (PROVISIONAL), FR-018, FR-019 (+ backbone), FR-020 (privacy/rights), FR-021 (retention/legal-hold), FR-022 (governed change), FR-023 (certificates), FR-024 (deceased succession), FR-025 (phonetic search) | A downstream module **or a statute** depends on each. Compliance (DPDP/Aadhaar), identity resolution, pay-safety, and history are non-negotiable. |
| **Phase 2 (deferred configurability — no v1 consumer)** | FR-012 (custom-field + dynamic-form engine); **completeness *weighting* configurability** within FR-014 (ship one fixed weighting in v1); **merge-undo UI** beyond the alias mechanism within FR-015 | Statutory field set is fixed at launch; one tenant. These are speculative configurability that A/E wanted and C/D correctly challenged. |

> FR-012 (custom fields) remains fully specified below for completeness and forward-compatibility but is
> **flagged Phase 2**; the schema is created in v1 (empty), the dynamic-form engine ships in Phase 2.

---

## 3. User Roles & Permissions

Roles extend the Shared Foundation §4 baseline. **C**=Create, **R**=Read, **U**=Update, **D**=Soft-
delete/deactivate, **A**=Approve/Commit, **X**=Export, **—**=No access. PII-restricted fields obey the
**field-level access policy (FR-EPM-013)** on top of this matrix (a role may have row access yet still
be masked on specific fields). **v2 adds the Data Protection Officer (DPO) role.**

| Capability / Surface | Employee (Self) | Reporting Manager | HR Officer | HR Admin | Dept Head / Appointing Auth. | SR Custodian | **DPO** | Auditor (RO) | System Admin |
|---|---|---|---|---|---|---|---|---|---|
| Create profile on hire | — | — | C | C | A (sanction) | — | — | — | — |
| View own 360° profile | R | — | R | R | R | R | R | R | R |
| View direct-reports profile | — | R (scoped, masked PII) | R | R | R | R | R | R | — |
| View any profile (org scope) | — | — | R | R | R | R | R | R | R(config only) |
| Maintain contact/address | request→M02 | — | U | U | — | — | — | — | — |
| Maintain dependents/nominees/**heirs** | request→M02 | — | U | U | — | — | — | — | — |
| Maintain education/experience | request→M02 | — | U | U | — | — | — | — | — |
| Maintain identity/statutory IDs | request→M02 | — | U (masked, 4-eyes) | U (4-eyes) | — | — | R(masked) | R(masked) | — |
| **Read Aadhaar (vault reveal)** | own (masked) | — | — | A (4-eyes + reason) | — | — | R(audit) | R(masked) | — |
| Maintain bank/financial | request→M02 | — | U (4-eyes) | U (4-eyes) | A | — | — | R(masked) | — |
| Upload/replace photo | request→M02 | — | U | U | — | — | — | — | — |
| **Manage biometric reference** | consent only | — | — | U (Admin, consented) | — | — | R | R | — |
| Manage positions & **position history** | — | recommend | U | U | A | — | — | R | — |
| Configure sections/custom fields (Phase 2) | — | — | — | proposed→Admin | — | — | — | R | C/U/D |
| Configure field-access policy + **4-eyes flags** | — | — | — | proposed→Admin | — | — | A (privacy sign-off) | R | C/U/D |
| **Governed DOB/category/name change** | request→M02 | — | C (request) | A (approve) | A (appointing) | — | R | R | — |
| Run/resolve deduplication **(alias)** | — | — | C/U | C/U/A | — | — | — | R | — |
| Bulk import / migration **(PROVISIONAL)** | — | — | C (staging) | C/A (commit) | — | — | — | R | C/A |
| Deactivate on separation | — | — | C (request) | A | A | A (SR effect) | — | R | — |
| **Deceased succession / heir handoff** | — | — | C | A | A | A (SR) | R | R | — |
| Reactivate profile | — | — | C (request) | A | A | — | — | R | — |
| **Consent & data-principal rights** | C (own rights) | — | R | U (action) | — | — | A (oversee) | R | — |
| **Grievance / breach handling** | C (grievance) | — | R | U | — | — | A (own) | R | — |
| **Retention / legal hold** | — | — | — | U (propose) | A (hold) | A (SR) | A (erasure sign-off) | R | C/U |
| Consume master via API | — (own only) | scoped | scoped | full(scoped) | scoped | scoped | scoped(audit) | RO | — |
| View audit log (M01) | own actions | — | scoped | scoped | scoped | scoped | privacy scope | full RO | full RO |
| Export profile data | own (self) | — | X (scoped, logged) | X (logged) | X (scoped) | X | X (rights) | X (logged) | — |

**Segregation of duties:** maker ≠ checker on every approved action; **bank/financial changes require
4-eyes**; **v2 extends 4-eyes to a configurable high-risk field set** — PAN, Aadhaar, social category,
DOB, and pension/gratuity nominee (config via `field_access_policies.requires_four_eyes`, §5.4 E17,
improvement #20). System Admin configures but cannot self-approve transactional data. **The DPO signs
off erasure and privacy-policy changes but performs no transactional HR writes** (independence).

---

## 4. Shared Application Foundation & Cross-Agent Build Instructions

This module **inherits** the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`) wholesale. The
following is the M01-specific binding of those shared defaults.

### 4.1 Technical stack (inherited)

- **Frontend:** React + TypeScript, Tailwind + shadcn/ui, WCAG 2.1 AA, i18n, dark-mode capable.
- **Backend:** REST API at `/api/v1`, Node/TypeScript **or** Java Spring; PostgreSQL primary store;
  object storage (M13) for binaries (photos/scans), encrypted at rest; **a CQRS read projection for the
  360° view**; **a DB-polled transactional outbox (`outbox_events`) as the change-feed backbone**; **an
  async audit sink (queue) for restricted-read auditing**.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; **RBAC + row-level org-unit scoping**.
- **Error envelope (canonical):**
  `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." }, "requestId": "..." }`
- **Security/compliance:** OWASP ASVS; TLS 1.2+; full audit trail; PII minimisation; **DPDP Act 2023 and
  Aadhaar Act 2016 alignment engineered (not asserted)**; statutory retention via FR-EPM-021.
- **NFR baseline:** P95 < 500 ms; 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4 h.

### 4.2 Canonical entities reused (NOT redefined here)

`users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `permissions`,
`service_register_events` (M12), `documents` (M13), `notifications`, `audit_log`,
`workflow_instances` / `workflow_tasks` (M02 / shared engine). M01 **extends** the canonical
`employees` row with additional master columns and **owns** all `employee_*` satellite tables plus the
v2 governance/compliance tables (E21–E34).

### 4.3 Cross-agent build instructions

1. **M01 is foundational** — build before M02–M14 transactional logic; expose the consumption API
   (FR-EPM-019) first so dependent agents can integrate against a stable contract. **Freeze three
   contracts before any parallel track starts: the `employee_id_aliases` identity-resolution contract,
   the field-access (FR-EPM-013) contract, and the consumption-API/change-feed shape (FR-EPM-019).**
   (Council: "The One Thing To Do First.")
2. **Do not write a second employee master.** Any module needing person/job data calls the M01 API or
   reads the M01-owned tables under M01's access policy. No local caching of PII beyond TTL-bounded,
   non-persistent caches.
3. **Edit approvals route to M02.** When a self-service user requests a personal-detail change, M01
   surfaces the field set + validators; M02 runs maker-checker; on approval M02 calls M01's
   **commit endpoint** (`PATCH /employees/{id}:commit`) which performs the effective-dated write +
   audit + SR event emission via the outbox. M01 never invents an approval flow.
4. **Documents/photos** are stored in M13; M01 persists only `document_id`. Producers must obtain a
   `document_id` from M13 before saving a reference.
5. **Service events** (profile creation, separation, key job/position/attribute changes, merge,
   governed-field change, death) are emitted to M12 **through the transactional `outbox_events` table**
   and the shared `service_register_events` producer; M01 never writes the M12 ledger schema directly.
6. **Field-access policy is enforced server-side** (FR-EPM-013). Frontends must not rely on client-side
   masking alone; the API returns already-masked projections per caller.
7. **Identity is resolved through `employee_id_aliases`.** A merge **never** re-points another module's
   rows. The merge consolidates only M01 satellites, soft-deletes the loser, writes
   `employee_id_aliases(loser_id → survivor_id)`, and emits `RECORDS_MERGED{survivor_id, loser_id}` on
   the change feed. **Every consumer MUST resolve any `employee_id` it holds through the alias table
   (the consumption API does this transparently and returns the survivor).** (Improvement #1, R2.)
8. **Aadhaar numbers live only in `aadhaar_vault`** keyed by a Reference Key; no other table stores the
   raw or tokenised Aadhaar number; `employees.national_id` is **removed**. (Improvement #2, R1.)
9. **Audit-on-read is async.** Restricted-PII reads enqueue an audit event (sampled/aggregated for
   high-volume machine reads); never block the hot path. (Improvement #14, R10.)
10. **Optimistic concurrency everywhere.** Pass `row_version`; on mismatch return `STALE_VERSION` (409).
   (Improvement #12, R13.)

### 4.4 v2 Compliance & Security Binding (engineered, not asserted)

- **Aadhaar Act 2016 / UIDAI Aadhaar Data Vault:** the Aadhaar number is stored **only** in
  `aadhaar_vault`, encrypted via KMS, keyed by a `aadhaar_ref_key` (the Reference Key). Profile tables
  hold only the masked display (`XXXX-XXXX-1234`) and the `aadhaar_ref_key`. Reveal of the full number
  requires HR Admin + 4-eyes + reason and is rate-limited (see break-glass below). The **lawful basis**
  (registered AUA/KUA, or the specific statutory basis for storage as an employer) is recorded per
  `aadhaar_vault` row in `lawful_basis`. No facial/biometric authentication is performed against
  Aadhaar in M01.
- **Biometric isolation:** facial-recognition/biometric processing is a **distinct purpose** from the
  profile/ID photo, requires its **own consent** (`consent_records` with `purpose=BIOMETRIC_ATTENDANCE`),
  is restricted to HR Admin, stores only an **opaque `biometric_template_ref`** (never a raw template),
  and has its own retention. (Improvement #3.)
- **DPDP Act 2023:** consent & notice are ledgered (`privacy_notices`, `consent_records`); the six
  data-principal rights beyond export — access, correction, erasure, grievance, nomination, and consent
  withdrawal — are served by FR-EPM-020; a **DPO** role oversees; a **grievance/redress** workflow and a
  **personal-data-breach notification** workflow to the Data Protection Board (with statutory timelines)
  are built (FR-EPM-020). Right-to-erasure is reconciled against statutory retention by FR-EPM-021
  (**retention/legal-hold wins where lawful; precedence is documented and audited**).
- **Hardened break-glass (improvement #10, R7):** every reveal is written to `break_glass_reveals`;
  enforced controls: per-user/per-rolling-window **volume cap** (default 25 special-category reveals /
  24 h, configurable), **anomaly detection** (z-score on per-user reveal rate), **real-time alert** to
  the DPO when a threshold is crossed (not a daily digest), and **optional 4-eyes** for bulk or
  special-category reveals. Crossing a hard cap blocks further reveals (`RATE_LIMITED` 429) until DPO
  clearance.
- **Async audit sink (improvement #14):** restricted reads enqueue to a durable queue; a consumer
  writes `audit_log`. Machine consumer reads are **sampled/aggregated** (1-in-N + per-principal hourly
  rollups) so the <500 ms P95 and full-audit requirements coexist.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

**Entity count, stated once cleanly (improvement #22, R18):** M01 owns **34 conceptual entities (E1–E34)
mapping to 35 physical tables** — E20 is the import batch/staging **pair** (2 tables); all other
entities are 1 table each. v1 owned 20 entities (E1–E20); v2 adds **14** (E21–E34).

| # | Entity | Purpose | New in v2? | Cardinality vs employee |
|---|---|---|---|---|
| E1 | `employees` (extended) | Core master / golden record; core attrs cached from E23 | mod | 1 (the anchor) |
| E2 | `employee_contacts` | Phones, emails, online handles | — | 1:N |
| E3 | `employee_addresses` | Permanent / present / mailing / overseas | — | 1:N |
| E4 | `employee_dependents` | Family members & dependents | mod (heir flag) | 1:N |
| E5 | `employee_nominees` | Nominees for benefits/pension/gratuity | mod (heir link) | 1:N |
| E6 | `employee_emergency_contacts` | Whom to call in emergencies | — | 1:N |
| E7 | `employee_education` | Academic & professional qualifications | — | 1:N |
| E8 | `employee_experience` | Prior employment / service history | — | 1:N |
| E9 | `employee_identity_documents` | Statutory & identity IDs (PAN/passport); Aadhaar via ref key | mod | 1:N |
| E10 | `employee_bank_accounts` | Bank & financial details | — | 1:N |
| E11 | `employee_photos` | Photo & **isolated biometric** reference metadata | mod | 1:N (1 primary) |
| E12 | `positions` | Authorised posts/sanctioned positions (org design) | mod (eff-dated) | reference |
| E13 | `employee_job_assignments` | Effective-dated job/position/org placement | — | 1:N (1 current) |
| E14 | `profile_sections` | Configurable profile section catalog (**Phase 2**) | — | config |
| E15 | `custom_field_definitions` | Tenant-configurable custom fields (**Phase 2**) | — | config |
| E16 | `employee_custom_field_values` | Values for custom fields (**Phase 2**) | — | 1:N |
| E17 | `field_access_policies` | Field-level PII access rules + **4-eyes flags** | mod | config |
| E18 | `employee_profile_completeness` | Completeness/quality score snapshot (**advisory**) | mod | 1:1 |
| E19 | `dedup_candidates` | Potential duplicate person matches | — | review queue |
| E20 | `employee_import_batches` + `import_staging_rows` | Bulk import control & staging | mod (PROVISIONAL) | batch (2 tables) |
| **E21** | `employee_id_aliases` | loser_id → survivor_id identity resolution | **new** | merge map |
| **E22** | `aadhaar_vault` | Aadhaar number vault (Reference-Key architecture) | **new** | 1:0..1 |
| **E23** | `employee_attribute_history` | Effective-dated core person attributes | **new** | 1:N |
| **E24** | `position_history` | Effective-dated position attributes | **new** | 1:N per position |
| **E25** | `employee_certificates` | Category (EWS/OBC) & PwD/UDID certificates | **new** | 1:N |
| **E26** | `privacy_notices` | Notice catalog presented to data principals | **new** | config |
| **E27** | `consent_records` | Consent ledger (grant/withdraw, per purpose) | **new** | 1:N |
| **E28** | `data_principal_requests` | DPDP rights & grievance requests | **new** | 1:N |
| **E29** | `breach_incidents` | Personal-data-breach incidents & notifications | **new** | incident log |
| **E30** | `retention_policies` | Per record-class statutory retention schedule | **new** | config |
| **E31** | `legal_holds` | Holds blocking purge (litigation/disciplinary/pension) | **new** | 1:N |
| **E32** | `governed_field_change_requests` | Governed DOB/category/name change workflow | **new** | 1:N |
| **E33** | `outbox_events` | Transactional change-feed backbone | **new** | event log |
| **E34** | `break_glass_reveals` | Break-glass reveal ledger (rate-limit/anomaly) | **new** | 1:N |

**Referenced (owned elsewhere):** `users`, `org_units`, `designations`, `cadres`, `pay_scales`,
`roles`, `audit_log`, `documents`, `notifications`, `service_register_events`,
`workflow_instances`/`workflow_tasks`.

### 5.2 Ownership & Reuse Matrix

| Entity | Owner module | M01 action | Consumers |
|---|---|---|---|
| `employees` | **M01** | extend + own | M02–M14 (read, via alias), M02 (commit writes) |
| `employee_*` satellites (E2–E11, E13, E16, E18) | **M01** | own | M10/M11 (bank), M12 (events), M14 (read) |
| `positions` (E12), `position_history` (E24) | **M01** | own (with M06 input), eff-dated | M05/M06, M14 |
| `employee_id_aliases` (E21) | **M01** | own (identity resolution) | **all M02–M14** |
| `aadhaar_vault` (E22) | **M01** | own (vault) | none (reveal only, audited) |
| `employee_attribute_history` (E23) | **M01** | own | M11 (DOB/category as-of), M06 (seniority), M14 |
| `employee_certificates` (E25) | **M01** | own | M10/M11 (benefits), M14 |
| `privacy_notices`/`consent_records`/`data_principal_requests`/`breach_incidents` (E26–E29) | **M01** | own (DPDP governance) | DPO, Auditor, M14 |
| `retention_policies`/`legal_holds` (E30/E31) | **M01** | own | M09 (hold), M11 (pension hold), M13 (purge coordination) |
| `governed_field_change_requests` (E32) | **M01** | own | M02 (workflow), M11/M06 |
| `outbox_events` (E33) | **M01** | own (backbone) | M02–M14 consumers |
| `break_glass_reveals` (E34) | **M01** | own | DPO, Auditor |
| `profile_sections`/`custom_field_definitions`/`field_access_policies` (E14,E15,E17) | **M01** | own (config) | all UIs |
| `dedup_candidates`, import tables (E19,E20) | **M01** | own | migration tooling, M14 |
| `users` | Platform | reference | all |
| `org_units`, `designations`, `cadres`, `pay_scales` | Master data | reference | all |
| `documents` | **M13** | reference (`document_id`) | all |
| `service_register_events` | **M12** | write via outbox producer | M12, M14 |
| `audit_log`, `notifications`, `workflow_*` | Platform / M02 | write/reference | all |

### 5.3 Relationship Map (textual ERD)

```
org_units 1───∞ employees ∞───1 designations
   │                │ │ │
   │                │ │ └────1:N employee_job_assignments ∞───1 positions ∞───1 org_units
   │                │ │                                   ∞───1 designations
employees 1───1 users (login principal)                  positions 1───∞ position_history (eff-dated)
employees 1───∞ employee_attribute_history (name/gender/category/dob/disability/religion/marital, eff-dated)
employees 1───∞ employee_contacts
employees 1───∞ employee_addresses
employees 1───∞ employee_dependents 1───∞ employee_nominees (nominee/heir may = dependent)
employees 1───∞ employee_emergency_contacts
employees 1───∞ employee_education
employees 1───∞ employee_experience
employees 1───∞ employee_identity_documents ─── scan document_id ──▶ documents (M13)
employees 1───0..1 aadhaar_vault (aadhaar_ref_key; raw number ONLY here)
employees 1───∞ employee_certificates (category/PwD validity)
employees 1───∞ employee_bank_accounts
employees 1───∞ employee_photos ─── document_id ──▶ documents (M13); biometric_template_ref (opaque)
employees 1───∞ employee_custom_field_values ∞───1 custom_field_definitions ∞───1 profile_sections
employees 1───1 employee_profile_completeness (advisory)
employees 1───∞ consent_records ∞───1 privacy_notices
employees 1───∞ data_principal_requests          employees 1───∞ governed_field_change_requests
employees 1───∞ legal_holds                       employees 1───∞ break_glass_reveals
retention_policies (record_class) ── governs ──▶ employees lifecycle/purge
breach_incidents ∞───∞ employees (affected set)
employee_id_aliases (loser_id ──▶ survivor_id employees)   ← all consumers resolve here
employee_dependents/nominees ──(on DECEASED)──▶ legal-heir linkage ──▶ M11 family-pension
field_access_policies (field_path, requires_four_eyes) ── governs ──▶ any employee_* column
outbox_events ──(drains to)──▶ service_register_events (M12) + change feed (M02–M14)
employees ──(self ref)──▶ reporting_manager_id ──▶ employees
employee_import_batches 1───∞ import_staging_rows ──(on commit, may be PROVISIONAL)──▶ employees + satellites
every table ──(writes)──▶ audit_log ; every mutable table carries row_version
```

### 5.4 Full Field Tables

Conventions: every mutable table also carries `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`,
`created_by UUID`, `updated_by UUID`, `is_deleted BOOLEAN DEFAULT false`, and **`row_version INT NOT
NULL DEFAULT 1`** (optimistic lock; improvement #12) — omitted from rows below for brevity unless
semantically relevant. PKs are `UUID` unless noted. Append-only ledgers (`employee_attribute_history`,
`position_history`, `consent_records`, `outbox_events`, `break_glass_reveals`, `audit_log`) do not carry
`is_deleted`.

#### E1 — `employees` (extends canonical; M01-owned columns) — *v2 modified*

> **v2 changes:** `national_id` (Aadhaar) **removed** (now `aadhaar_vault`); `last_name` **nullable**
> with `has_single_legal_name` flag (mononym support, improvement #17); core person attributes
> (`first_name`/`middle_name`/`last_name`/`gender`/`marital_status`/`category`/`dob`/`religion`/
> `is_differently_abled`) are **current-value caches** of the `employee_attribute_history` spine
> (improvement #7) — service-layer keeps them in sync; new `record_state` for PROVISIONAL migration
> (improvement #11); `data_quality_flag` is **advisory** (improvement #6).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `employee_id` | UUID | **PK** | canonical |
| `service_no` | VARCHAR(20) | UNIQUE, NOT NULL | human business key |
| `salutation` | VARCHAR(10) | enum (`SALUTATION`) | Mr/Ms/Dr/… |
| `first_name` | VARCHAR(80) | NOT NULL | cache of E23 |
| `middle_name` | VARCHAR(80) | NULL | cache of E23 |
| `last_name` | VARCHAR(80) | **NULL** | nullable for mononyms; cache of E23 |
| `has_single_legal_name` | BOOLEAN | default false | true → mononym; `last_name` may be null |
| `display_name` | VARCHAR(160) | NOT NULL | rendered name (policy-driven) |
| `preferred_name` | VARCHAR(80) | NULL | display name |
| `name_local` | VARCHAR(160) | NULL | name in official local script (feeds phonetic/translit search) |
| `dob` | DATE | NOT NULL*, ≤ today−18y (relaxed in PROVISIONAL) | PII; cache of E23; governed-change only (FR-022) |
| `gender` | VARCHAR(16) | enum (`GENDER`) | PII; cache of E23 |
| `marital_status` | VARCHAR(16) | enum (`MARITAL_STATUS`) | PII; cache of E23 |
| `blood_group` | VARCHAR(4) | enum (`BLOOD_GROUP`) | sensitive PII |
| `nationality` | VARCHAR(40) | NOT NULL, default `INDIAN` | drives conditional statutory-ID rule |
| `religion` | VARCHAR(40) | NULL | sensitive PII (DPDP); cache of E23 |
| `category` | VARCHAR(16) | enum (`SOCIAL_CATEGORY`) | GEN/OBC/SC/ST/EWS; cache of E23; governed-change only (FR-022); certificate in E25 |
| `is_differently_abled` | BOOLEAN | default false | statutory (PwD); cache of E23; certificate in E25 |
| `disability_type` | VARCHAR(40) | NULL | conditional on above |
| `aadhaar_ref_key` | VARCHAR(64) | NULL, FK→`aadhaar_vault` | **Reference Key only; raw number never here** |
| `aadhaar_masked` | VARCHAR(20) | NULL | display `XXXX-XXXX-1234` |
| `pan` | VARCHAR(10) | format `[A-Z]{5}[0-9]{4}[A-Z]`, conditional NOT NULL | PII; conditional on nationality (§5.6 r9) |
| `date_of_joining` | DATE | NOT NULL* (relaxed in PROVISIONAL) | |
| `confirmation_date` | DATE | NULL | end of probation |
| `cadre` | VARCHAR(40) | FK→`cadres` | |
| `designation_id` | UUID | FK→`designations` | current (service-layer sync from current assignment) |
| `org_unit_id` | UUID | FK→`org_units` | current placement (service-layer sync) |
| `employment_type` | VARCHAR(20) | enum (`EMPLOYMENT_TYPE`) | PERMANENT/CONTRACT/DEPUTATION… |
| `employment_status` | VARCHAR(20) | enum (`EMPLOYMENT_STATUS`) | ACTIVE/ON_LEAVE/SUSPENDED/TRANSFERRED/RETIRED/RESIGNED/DECEASED/TERMINATED |
| `record_state` | VARCHAR(16) | enum (`RECORD_STATE`), default `ACTIVE` | **PROVISIONAL/ACTIVE/ARCHIVED/PURGE_PENDING** (migration + retention) |
| `reporting_manager_id` | UUID | FK→`employees` (self) | row-level scoping anchor; service-layer sync |
| `primary_photo_id` | UUID | FK→`employee_photos` | current photo |
| `profile_completeness_pct` | NUMERIC(5,2) | 0–100, cached | from E18 (**advisory**) |
| `data_quality_flag` | VARCHAR(16) | enum (`DQ_FLAG`) | CLEAN/REVIEW/NEEDS_ATTENTION (**advisory; no pay gate**) |
| `separation_date` | DATE | NULL | set on separation |
| `separation_reason` | VARCHAR(40) | enum (`SEPARATION_REASON`) | |
| `source_system` | VARCHAR(40) | NULL | for migrated records |
| `legacy_id` | VARCHAR(40) | NULL, indexed | migration cross-ref |
| `row_version` | INT | NOT NULL default 1 | optimistic lock; etag source |
| `created_at/updated_at/created_by/updated_by/is_deleted` | — | standard | |

\* NOT NULL columns are **deferred-nullable under the migration validation profile** (`record_state =
PROVISIONAL`); the CHECK and NOT NULL constraints are enforced as the row is remediated to `ACTIVE`
(improvement #11).

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

> **v2:** `official_email` carries a partial UNIQUE constraint across non-deleted rows (§5.6 r17,
> improvement #21/R22).

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

#### E4 — `employee_dependents` — *v2 modified (heir flag)*

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
| `is_legal_heir` | BOOLEAN | default false | **v2: succession (FR-024)** |
| `heir_succession_rank` | SMALLINT | NULL | **v2: order of family-pension entitlement** |
| `national_id_masked` | VARCHAR(20) | NULL | masked (no raw) |
| `proof_document_id` | UUID | FK→documents(M13), NULL | birth/marriage cert |

#### E5 — `employee_nominees` — *v2 modified (heir link)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `nominee_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `dependent_id` | UUID | FK→dependents, NULL | nominee may be a dependent/heir |
| `nominee_name` | VARCHAR(160) | NOT NULL | |
| `relationship` | VARCHAR(24) | enum (`RELATIONSHIP`) | |
| `benefit_type` | VARCHAR(24) | enum (`BENEFIT_TYPE`) | PF/GRATUITY/PENSION/INSURANCE/NPS |
| `share_pct` | NUMERIC(5,2) | 0–100 | sum per benefit_type = 100 |
| `is_minor` | BOOLEAN | computed | requires guardian if true |
| `guardian_name` | VARCHAR(160) | conditional | required if minor |
| `is_family_pension_recipient` | BOOLEAN | default false | **v2: hand-off to M11 on DECEASED (FR-024)** |
| `effective_date` | DATE | NOT NULL | |
| `requires_four_eyes` | BOOLEAN | default true (PENSION/GRATUITY) | **v2: high-risk 4-eyes (improvement #20)** |
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

#### E9 — `employee_identity_documents` — *v2 modified (Aadhaar via vault)*

> **v2:** an `AADHAAR`-type row stores **only** `aadhaar_ref_key` + `doc_number_masked`; the
> `doc_number_token` column is **forbidden/NULL for AADHAAR** (raw lives solely in `aadhaar_vault`).
> Non-Aadhaar docs continue to use `doc_number_token` (encrypted). `requires_four_eyes` for PAN/Aadhaar.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `identity_doc_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `doc_type` | VARCHAR(24) | enum (`IDENTITY_DOC_TYPE`) | AADHAAR/PAN/PASSPORT/VOTER_ID/DRIVING_LICENSE/PRAN |
| `doc_number_masked` | VARCHAR(40) | NOT NULL | display masked |
| `doc_number_token` | VARCHAR(128) | NULL (NULL for AADHAAR) | encrypted; non-Aadhaar only |
| `aadhaar_ref_key` | VARCHAR(64) | NULL, FK→`aadhaar_vault` | **set only for AADHAAR rows** |
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
| `is_verified` | BOOLEAN | default false | penny-drop/manual; **M10 disbursement precondition** |
| `effective_from` | DATE | NOT NULL | |
| `cancelled_cheque_document_id` | UUID | FK→documents(M13), NULL | |

#### E11 — `employee_photos` — *v2 modified (biometric isolation)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `photo_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `photo_type` | VARCHAR(16) | enum (`PHOTO_TYPE`) | PROFILE/ID_CARD/BIOMETRIC_REF |
| `processing_purpose` | VARCHAR(24) | enum (`PROCESSING_PURPOSE`) | **v2: IDENTITY_DISPLAY vs BIOMETRIC_ATTENDANCE** |
| `document_id` | UUID | FK→documents(M13), NULL | binary lives in M13 (NULL for pure biometric ref) |
| `biometric_template_ref` | VARCHAR(128) | NULL | opaque ref to biometric vault (no raw template) |
| `consent_id` | UUID | FK→`consent_records`, NULL | **required when purpose=BIOMETRIC_ATTENDANCE** |
| `is_primary` | BOOLEAN | default false | one primary PROFILE |
| `captured_at` | TIMESTAMPTZ | NULL | |
| `width_px`/`height_px` | INT | NULL | for validation |
| `retention_until` | DATE | NULL | biometric distinct retention |
| `status` | VARCHAR(16) | enum (`PHOTO_STATUS`) | PENDING/APPROVED/REJECTED |

#### E12 — `positions` — *v2 modified (effective-dated; see E24)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `position_id` | UUID | PK | |
| `position_code` | VARCHAR(30) | UNIQUE | sanctioned post code |
| `title` | VARCHAR(120) | NOT NULL | current cache (history in E24) |
| `designation_id` | UUID | FK→designations | |
| `cadre` | VARCHAR(40) | FK→cadres | |
| `pay_scale_id` | UUID | FK→pay_scales | current cache (history in E24) |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | post belongs to office |
| `reports_to_position_id` | UUID | FK→positions (self), NULL | org-chart edge (history in E24) |
| `sanctioned_count` | INT | ≥ 0 | current cache (history in E24) |
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

#### E14 — `profile_sections` *(Phase 2)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `section_id` | UUID | PK | |
| `section_key` | VARCHAR(40) | UNIQUE | e.g. `PERSONAL`, `BANK` |
| `label` | VARCHAR(120) | NOT NULL | i18n key |
| `display_order` | SMALLINT | NOT NULL | |
| `is_system` | BOOLEAN | default false | system sections not deletable |
| `is_enabled` | BOOLEAN | default true | |
| `applicable_employment_types` | TEXT[] | NULL | conditional sections |

#### E15 — `custom_field_definitions` *(Phase 2)*

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

#### E16 — `employee_custom_field_values` *(Phase 2)*

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

#### E17 — `field_access_policies` — *v2 modified (4-eyes flag)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `policy_id` | UUID | PK | |
| `field_path` | VARCHAR(120) | NOT NULL | e.g. `employees.pan`, `employee_bank_accounts.account_number` |
| `role_key` | VARCHAR(40) | NOT NULL | role this rule applies to |
| `access_level` | VARCHAR(16) | enum (`FIELD_ACCESS_LEVEL`) | FULL/MASKED/HIDDEN |
| `requires_reason` | BOOLEAN | default false | break-glass reason required to read |
| `requires_four_eyes` | BOOLEAN | default false | **v2: write needs second approver (improvement #20)** |
| `break_glass_window_cap` | INT | NULL | **v2: per-user reveals / 24h before block (improvement #10)** |
| `is_special_category` | BOOLEAN | default false | **v2: DPDP special category (religion/category/disability/biometric)** |
| `is_self_visible` | BOOLEAN | default true | can the data subject see own value |
| | | UNIQUE(field_path, role_key) | one rule per field/role |

#### E18 — `employee_profile_completeness` — *v2 modified (advisory)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `employee_id` | UUID | **PK**, FK→employees | 1:1 |
| `overall_pct` | NUMERIC(5,2) | 0–100 | |
| `section_scores` | JSONB | NOT NULL | `{ "PERSONAL": 100, "BANK": 50, ... }` |
| `missing_required_fields` | TEXT[] | NULL | drives nudges (not blocks) |
| `dq_issues` | JSONB | NULL | rule-id → message |
| `data_quality_flag` | VARCHAR(16) | enum (`DQ_FLAG`) | CLEAN/REVIEW/NEEDS_ATTENTION (**advisory only**) |
| `last_computed_at` | TIMESTAMPTZ | NOT NULL | |

#### E19 — `dedup_candidates`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `candidate_id` | UUID | PK | |
| `employee_a_id` | UUID | FK→employees | ordered a<b |
| `employee_b_id` | UUID | FK→employees | a≠b |
| `match_score` | NUMERIC(5,2) | 0–100 | weighted similarity (incl. phonetic) |
| `matched_attributes` | JSONB | NOT NULL | which fields matched |
| `status` | VARCHAR(16) | enum (`DEDUP_STATUS`) | OPEN/MERGED/DISMISSED |
| `resolution` | VARCHAR(24) | NULL | MERGE_KEEP_A/MERGE_KEEP_B/NOT_DUP |
| `resolved_by` | UUID | NULL | |
| `resolved_at` | TIMESTAMPTZ | NULL | |
| | | UNIQUE(employee_a_id, employee_b_id) | dedupe the dedupe |

#### E20a — `employee_import_batches` — *v2 modified (PROVISIONAL profile)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `batch_id` | UUID | PK | |
| `file_document_id` | UUID | FK→documents(M13) | source file |
| `template_version` | VARCHAR(16) | NOT NULL | |
| `validation_profile` | VARCHAR(16) | enum (`VALIDATION_PROFILE`), default `STRICT` | **v2: STRICT vs MIGRATION (relaxed)** |
| `total_rows` | INT | ≥ 0 | |
| `valid_rows` | INT | ≥ 0 | meets STRICT |
| `provisional_rows` | INT | ≥ 0 | **v2: committable under MIGRATION as PROVISIONAL** |
| `error_rows` | INT | ≥ 0 | unrecoverable |
| `status` | VARCHAR(20) | enum (`IMPORT_STATUS`) | UPLOADED/VALIDATING/VALIDATED/COMMITTING/COMMITTED/FAILED/ROLLED_BACK |
| `committed_at` | TIMESTAMPTZ | NULL | |
| `committed_by` | UUID | NULL | |

#### E20b — `import_staging_rows` — *v2 modified*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `staging_row_id` | UUID | PK | |
| `batch_id` | UUID | FK→employee_import_batches | |
| `row_number` | INT | NOT NULL | source line |
| `raw_payload` | JSONB | NOT NULL | parsed row |
| `validation_status` | VARCHAR(16) | enum (`ROW_STATUS`) | VALID/**PROVISIONAL**/ERROR/COMMITTED/SKIPPED |
| `validation_errors` | JSONB | NULL | field → message |
| `remediation_state` | VARCHAR(16) | NULL | **v2: QUEUED/IN_PROGRESS/RESOLVED for PROVISIONAL rows** |
| `resolved_employee_id` | UUID | NULL | set on commit |
| `dedup_match_id` | UUID | NULL | if matched existing |

#### E21 — `employee_id_aliases` *(v2 new — improvement #1, R2)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `alias_id` | UUID | PK | |
| `loser_id` | UUID | NOT NULL, UNIQUE | the retired record's employee_id |
| `survivor_id` | UUID | FK→employees, NOT NULL | the golden record |
| `dedup_candidate_id` | UUID | FK→dedup_candidates, NULL | origin |
| `merged_at` | TIMESTAMPTZ | NOT NULL | |
| `merged_by` | UUID | NOT NULL | maker |
| `approved_by` | UUID | NULL | checker (4-eyes) |
| `mergeable_back_until` | TIMESTAMPTZ | NOT NULL | undo window (default +7d) |
| `is_reversed` | BOOLEAN | default false | true after undo |
| `merge_snapshot` | JSONB | NOT NULL | pre-merge state of loser for undo |

#### E22 — `aadhaar_vault` *(v2 new — improvement #2, R1)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `aadhaar_ref_key` | VARCHAR(64) | **PK** | the Reference Key (random, opaque) |
| `aadhaar_number_encrypted` | BYTEA | NOT NULL | KMS-encrypted; **the only place the number exists** |
| `aadhaar_masked` | VARCHAR(20) | NOT NULL | `XXXX-XXXX-1234` |
| `hash_for_dedup` | VARCHAR(128) | UNIQUE | keyed HMAC for duplicate detection without decrypt |
| `lawful_basis` | VARCHAR(40) | NOT NULL | enum (`AADHAAR_LAWFUL_BASIS`): AUA_KUA/STATUTE/CONSENT |
| `lawful_basis_ref` | VARCHAR(120) | NULL | circular/notification/consent_id reference |
| `linked_employee_id` | UUID | FK→employees, UNIQUE | 1:0..1 |
| `kms_key_id` | VARCHAR(120) | NOT NULL | envelope key reference |
| `created_at/created_by` | — | append-context | vault rows are not soft-deleted; purge via FR-021 only |

#### E23 — `employee_attribute_history` *(v2 new — improvement #7, R5; append-only)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `attribute_history_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `attribute_path` | VARCHAR(60) | NOT NULL | `first_name`/`last_name`/`gender`/`marital_status`/`category`/`dob`/`disability`/`religion` |
| `value_text` | TEXT | NULL | serialised typed value |
| `value_date` | DATE | NULL | for dob etc. |
| `effective_from` | DATE | NOT NULL | |
| `effective_to` | DATE | NULL | null = current |
| `change_reason` | VARCHAR(40) | enum (`ATTRIBUTE_CHANGE_REASON`) | HIRE/MARRIAGE/GAZETTE/COURT_ORDER/CORRECTION/GENDER_AFFIRMATION/MIGRATION |
| `source` | VARCHAR(20) | NOT NULL | HR_DIRECT/M02_COMMIT/MIGRATION/GOVERNED_CHANGE |
| `gazette_ref` | VARCHAR(120) | NULL | gazette/notification number for name/gender/category change |
| `governed_change_id` | UUID | FK→`governed_field_change_requests`, NULL | when via FR-022 |
| `proof_document_id` | UUID | FK→documents(M13), NULL | |
| `recorded_by` | UUID | NOT NULL | |
| | | EXCLUDE overlapping (employee_id, attribute_path, [effective_from,effective_to]) | no overlaps per attribute |

#### E24 — `position_history` *(v2 new — improvement #9, R9; append-only)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `position_history_id` | UUID | PK | |
| `position_id` | UUID | FK→positions, NOT NULL | |
| `title` | VARCHAR(120) | NOT NULL | |
| `designation_id` | UUID | FK→designations | |
| `pay_scale_id` | UUID | FK→pay_scales | revised by Pay Commission |
| `reports_to_position_id` | UUID | FK→positions, NULL | |
| `sanctioned_count` | INT | ≥ 0 | |
| `status` | VARCHAR(16) | enum (`POSITION_STATUS`) | ACTIVE/FROZEN/ABOLISHED |
| `effective_from` | DATE | NOT NULL | |
| `effective_to` | DATE | NULL | null = current |
| `change_reason` | VARCHAR(40) | enum (`POSITION_CHANGE_REASON`) | CREATE/PAY_REVISION/RECLASSIFY/RESTRUCTURE/FREEZE/ABOLISH |
| `order_ref` | VARCHAR(120) | NULL | sanction/GO reference |
| | | EXCLUDE overlapping (position_id, [effective_from,effective_to]) | no overlaps |

#### E25 — `employee_certificates` *(v2 new — improvement #19, R17)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `certificate_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `certificate_type` | VARCHAR(24) | enum (`CERTIFICATE_TYPE`) | OBC_NON_CREAMY/EWS/SC/ST/PWD_UDID/DOMICILE |
| `certificate_number` | VARCHAR(60) | NOT NULL | |
| `issuing_authority` | VARCHAR(160) | NOT NULL | |
| `valid_from` | DATE | NOT NULL | |
| `valid_to` | DATE | NULL | EWS/OBC non-creamy expire (often annually) |
| `disability_percentage` | NUMERIC(5,2) | NULL | PwD; ≥40 for benefit eligibility |
| `udid_number` | VARCHAR(40) | NULL | PwD UDID card |
| `is_creamy_layer` | BOOLEAN | NULL | OBC creamy-layer status |
| `is_verified` | BOOLEAN | default false | |
| `certificate_document_id` | UUID | FK→documents(M13), NULL | |
| `status` | VARCHAR(16) | enum (`CERTIFICATE_STATUS`) | VALID/EXPIRED/REVOKED |

#### E26 — `privacy_notices` *(v2 new — improvement #4, R4)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `notice_id` | UUID | PK | |
| `notice_key` | VARCHAR(60) | UNIQUE | e.g. `PROFILE_PROCESSING_V1` |
| `version` | VARCHAR(16) | NOT NULL | |
| `purpose` | VARCHAR(40) | NOT NULL | enum (`PROCESSING_PURPOSE`) |
| `language` | VARCHAR(10) | NOT NULL | en / local |
| `body_text` | TEXT | NOT NULL | itemised purpose, rights, DPO contact |
| `effective_from` | DATE | NOT NULL | |
| `is_active` | BOOLEAN | default true | |

#### E27 — `consent_records` *(v2 new — improvement #4; append-only ledger)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `consent_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | data principal |
| `notice_id` | UUID | FK→privacy_notices, NOT NULL | what was shown |
| `purpose` | VARCHAR(40) | NOT NULL | enum (`PROCESSING_PURPOSE`) incl. BIOMETRIC_ATTENDANCE |
| `action` | VARCHAR(16) | enum (`CONSENT_ACTION`) | GRANTED/WITHDRAWN/RENEWED |
| `consent_artifact` | JSONB | NOT NULL | captured proof (timestamp, IP, channel, notice version) |
| `effective_at` | TIMESTAMPTZ | NOT NULL | |
| `expires_at` | TIMESTAMPTZ | NULL | |
| `recorded_by` | UUID | NOT NULL | self or operator-on-behalf |

#### E28 — `data_principal_requests` *(v2 new — improvement #4)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `request_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | requester (or heir via FR-024) |
| `request_type` | VARCHAR(24) | enum (`DP_REQUEST_TYPE`) | ACCESS/CORRECTION/ERASURE/EXPORT/NOMINATION/CONSENT_WITHDRAWAL/GRIEVANCE |
| `details` | TEXT | NULL | |
| `status` | VARCHAR(20) | enum (`DP_REQUEST_STATUS`) | RECEIVED/IN_REVIEW/ACTIONED/REJECTED/ESCALATED/CLOSED |
| `sla_due_at` | TIMESTAMPTZ | NOT NULL | statutory response clock |
| `resolution_note` | TEXT | NULL | incl. retention/legal-hold precedence when erasure refused |
| `linked_legal_hold_id` | UUID | FK→legal_holds, NULL | why erasure blocked |
| `assigned_dpo` | UUID | FK→users, NULL | |
| `resolved_at` | TIMESTAMPTZ | NULL | |

#### E29 — `breach_incidents` *(v2 new — improvement #4)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `incident_id` | UUID | PK | |
| `detected_at` | TIMESTAMPTZ | NOT NULL | |
| `severity` | VARCHAR(16) | enum (`BREACH_SEVERITY`) | LOW/MEDIUM/HIGH/CRITICAL |
| `nature` | VARCHAR(40) | NOT NULL | exfiltration/misconfig/break-glass-abuse… |
| `affected_employee_ids` | UUID[] | NOT NULL | affected data principals |
| `affected_field_paths` | TEXT[] | NULL | categories of PII involved |
| `dpb_notified_at` | TIMESTAMPTZ | NULL | Data Protection Board notification |
| `principals_notified_at` | TIMESTAMPTZ | NULL | affected-principal notification |
| `status` | VARCHAR(20) | enum (`BREACH_STATUS`) | OPEN/CONTAINED/NOTIFIED/CLOSED |
| `containment_note` | TEXT | NULL | |
| `owner_dpo` | UUID | FK→users | |

#### E30 — `retention_policies` *(v2 new — improvement #5, R5/R4)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `policy_id` | UUID | PK | |
| `record_class` | VARCHAR(40) | UNIQUE | e.g. `SERVED_EMPLOYEE`, `PENSIONER`, `APPLICANT`, `BIOMETRIC` |
| `retain_years` | INT | NOT NULL | statutory schedule |
| `basis_reference` | VARCHAR(160) | NOT NULL | statute/rule citation |
| `post_retention_action` | VARCHAR(16) | enum (`RETENTION_ACTION`) | ARCHIVE/ANONYMISE/PURGE |
| `erasure_overridable` | BOOLEAN | default false | if true, erasure may win over retention |
| `is_active` | BOOLEAN | default true | |

#### E31 — `legal_holds` *(v2 new — improvement #5)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `hold_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `hold_type` | VARCHAR(24) | enum (`HOLD_TYPE`) | DISCIPLINARY/LITIGATION/PENSION/AUDIT/RTI |
| `reason` | VARCHAR(200) | NOT NULL | |
| `placed_by` | UUID | NOT NULL | Dept Head/SR Custodian/DPO |
| `source_module` | VARCHAR(10) | NULL | M09/M11 origin |
| `placed_at` | TIMESTAMPTZ | NOT NULL | |
| `released_at` | TIMESTAMPTZ | NULL | null = active hold (blocks purge/erasure) |
| `status` | VARCHAR(16) | enum (`HOLD_STATUS`) | ACTIVE/RELEASED |

#### E32 — `governed_field_change_requests` *(v2 new — improvement #8, R6)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `change_request_id` | UUID | PK | |
| `employee_id` | UUID | FK, NOT NULL | |
| `field_path` | VARCHAR(60) | NOT NULL | `dob`/`category`/`name`/`gender` |
| `current_value` | TEXT | NOT NULL | snapshot |
| `requested_value` | TEXT | NOT NULL | |
| `new_effective_from` | DATE | NOT NULL | |
| `justification` | TEXT | NOT NULL | |
| `proof_document_id` | UUID | FK→documents(M13), NOT NULL | mandatory documentary proof |
| `gazette_ref` | VARCHAR(120) | NULL | required for name/gender/category |
| `alteration_count` | SMALLINT | NOT NULL default 1 | enforces single/limited alteration |
| `approving_authority_id` | UUID | FK→users, NULL | named authority |
| `status` | VARCHAR(20) | enum (`GOVERNED_CHANGE_STATUS`) | DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/APPLIED |
| `requires_four_eyes` | BOOLEAN | default true | |
| `applied_attribute_history_id` | UUID | FK→employee_attribute_history, NULL | link to the version it produced |

#### E33 — `outbox_events` *(v2 new — improvement #13, R14; append-only backbone)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `event_id` | BIGSERIAL | **PK** | monotonic ordering / cursor |
| `aggregate_id` | UUID | NOT NULL | employee_id / position_id |
| `event_type` | VARCHAR(40) | NOT NULL | CREATED/UPDATED/PLACEMENT_CHANGED/ATTRIBUTE_CHANGED/RECORDS_MERGED/SEPARATED/DEATH/GOVERNED_FIELD_CHANGED |
| `payload` | JSONB | NOT NULL | minimal, no raw PII |
| `is_tombstone` | BOOLEAN | default false | for merged/erased records |
| `occurred_at` | TIMESTAMPTZ | NOT NULL | |
| `published_at` | TIMESTAMPTZ | NULL | null until drained |
| `publish_attempts` | INT | default 0 | DLQ after max attempts |
| `dead_lettered` | BOOLEAN | default false | |
| `retention_until` | TIMESTAMPTZ | NOT NULL | replay window (default +30d) |

#### E34 — `break_glass_reveals` *(v2 new — improvement #10, R7)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `reveal_id` | UUID | PK | |
| `actor_id` | UUID | NOT NULL | who revealed |
| `employee_id` | UUID | FK, NOT NULL | whose field |
| `field_path` | VARCHAR(120) | NOT NULL | |
| `reason` | VARCHAR(300) | NOT NULL | mandatory |
| `is_special_category` | BOOLEAN | default false | |
| `four_eyes_approver_id` | UUID | NULL | when bulk/special-category |
| `revealed_at` | TIMESTAMPTZ | NOT NULL | |
| `window_count_at_reveal` | INT | NOT NULL | running per-user 24h count |
| `anomaly_score` | NUMERIC(6,3) | NULL | z-score at reveal |
| `alerted` | BOOLEAN | default false | real-time DPO alert fired |
| `audit_id` | UUID | NULL | link to async audit_log row |

### 5.5 Enum & Reference Catalog

| Enum | Allowed values |
|---|---|
| `EMPLOYMENT_STATUS` | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| `RECORD_STATE` *(v2)* | PROVISIONAL, ACTIVE, ARCHIVED, PURGE_PENDING |
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
| `PROCESSING_PURPOSE` *(v2)* | IDENTITY_DISPLAY, BIOMETRIC_ATTENDANCE, PAYROLL, PENSION, DIRECTORY, ANALYTICS_AGGREGATE |
| `PHOTO_STATUS` | PENDING, APPROVED, REJECTED |
| `POSITION_STATUS` | ACTIVE, FROZEN, ABOLISHED |
| `POSITION_CHANGE_REASON` *(v2)* | CREATE, PAY_REVISION, RECLASSIFY, RESTRUCTURE, FREEZE, ABOLISH |
| `ASSIGNMENT_TYPE` | SUBSTANTIVE, OFFICIATING, ADDITIONAL_CHARGE, DEPUTATION |
| `ASSIGNMENT_REASON` | HIRE, PROMOTION, TRANSFER, REVERSION, RE_DESIGNATION, CORRECTION |
| `ATTRIBUTE_CHANGE_REASON` *(v2)* | HIRE, MARRIAGE, GAZETTE, COURT_ORDER, CORRECTION, GENDER_AFFIRMATION, MIGRATION |
| `CUSTOM_FIELD_TYPE` | TEXT, NUMBER, DATE, BOOLEAN, ENUM, DOCUMENT |
| `FIELD_ACCESS_LEVEL` | FULL, MASKED, HIDDEN |
| `FIELD_VISIBILITY` | PUBLIC, INTERNAL, RESTRICTED, PRIVATE |
| `DQ_FLAG` *(v2 — advisory)* | CLEAN, REVIEW, NEEDS_ATTENTION |
| `DEDUP_STATUS` | OPEN, MERGED, DISMISSED |
| `VALIDATION_PROFILE` *(v2)* | STRICT, MIGRATION |
| `IMPORT_STATUS` | UPLOADED, VALIDATING, VALIDATED, COMMITTING, COMMITTED, FAILED, ROLLED_BACK |
| `ROW_STATUS` *(v2)* | VALID, PROVISIONAL, ERROR, COMMITTED, SKIPPED |
| `SEPARATION_REASON` | RETIREMENT, RESIGNATION, TERMINATION, DEATH, ABSORPTION, CONTRACT_END |
| `AADHAAR_LAWFUL_BASIS` *(v2)* | AUA_KUA, STATUTE, CONSENT |
| `CERTIFICATE_TYPE` *(v2)* | OBC_NON_CREAMY, EWS, SC, ST, PWD_UDID, DOMICILE |
| `CERTIFICATE_STATUS` *(v2)* | VALID, EXPIRED, REVOKED |
| `CONSENT_ACTION` *(v2)* | GRANTED, WITHDRAWN, RENEWED |
| `DP_REQUEST_TYPE` *(v2)* | ACCESS, CORRECTION, ERASURE, EXPORT, NOMINATION, CONSENT_WITHDRAWAL, GRIEVANCE |
| `DP_REQUEST_STATUS` *(v2)* | RECEIVED, IN_REVIEW, ACTIONED, REJECTED, ESCALATED, CLOSED |
| `BREACH_SEVERITY` *(v2)* | LOW, MEDIUM, HIGH, CRITICAL |
| `BREACH_STATUS` *(v2)* | OPEN, CONTAINED, NOTIFIED, CLOSED |
| `RETENTION_ACTION` *(v2)* | ARCHIVE, ANONYMISE, PURGE |
| `HOLD_TYPE` *(v2)* | DISCIPLINARY, LITIGATION, PENSION, AUDIT, RTI |
| `HOLD_STATUS` *(v2)* | ACTIVE, RELEASED |
| `GOVERNED_CHANGE_STATUS` *(v2)* | DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, APPLIED |

### 5.6 Data Integrity Rules

1. **One current job assignment:** at most one `employee_job_assignments` row per employee with
   `effective_to IS NULL`; no overlapping `[effective_from, effective_to]` (exclusion constraint).
2. **Denormalisation consistency (service-layer, not trigger):** `employees.designation_id`,
   `org_unit_id`, `reporting_manager_id` equal the current assignment; kept in sync **explicitly in the
   service layer inside the same transaction** (improvement #16, R12) — no DB trigger; back-dated
   corrections recompute the current row deterministically.
3. **Unique business keys:** `service_no` unique across non-deleted rows; `position_code` unique.
4. **Single primary:** at most one `is_primary=true` per `(employee_id, contact_type)`; one
   `is_primary_salary=true` active bank account; one `is_primary=true` PROFILE photo; one
   `is_highest=true` education row.
5. **Nominee shares:** for each `(employee_id, benefit_type)`, sum of active `share_pct` = 100 (±0.00).
6. **Statutory ID secrecy:** `*_token` columns never returned by any read API; **Aadhaar raw number
   exists only in `aadhaar_vault`** and is returned only via audited break-glass reveal.
7. **Effective dating monotonicity:** `effective_from ≤ effective_to` on all effective-dated tables
   (assignments, addresses, `employee_attribute_history`, `position_history`).
8. **FK integrity:** all FKs enforced; soft-deleted parents cannot accept new children.
9. **Conditional statutory IDs (v2, improvement #21/R22):** PAN/Aadhaar are **required only when**
   `nationality = INDIAN` **and** `employment_type ∈ {PERMANENT, PROBATIONER}`; foreign nationals and
   consultants are exempt (passport substitutes). Identity/bank writes blocked when `employment_status
   IN (RETIRED, DECEASED, TERMINATED)` except by HR Admin correction with reason / pension context.
10. **Photo binary externalised:** `employee_photos.document_id` must resolve to an existing M13 doc
    (NULL only for pure biometric refs).
11. **Merge via alias (v2, improvement #1/R2):** a merge writes exactly one `employee_id_aliases` row
    (`loser_id` UNIQUE), consolidates **only M01 satellites**, soft-deletes the loser, and emits
    `RECORDS_MERGED`. **No cross-module FK is ever re-pointed by M01.** All identity lookups resolve
    `loser_id → survivor_id`.
12. **Audit completeness:** every write inserts an `audit_log` row synchronously; **restricted-PII reads
    are audited asynchronously** via the audit sink (improvement #14/R10).
13. **DPDP special-category minimisation:** `religion`, `category`, `disability`, biometric refs are
    SENSITIVE (`is_special_category=true`); default HIDDEN; reveal requires policy + reason and is
    rate-limited.
14. **Position history (v2, improvement #9/R9):** every change to a position's pay_scale/title/
    reports_to/sanctioned_count/status writes a `position_history` row; no overlaps per position.
15. **Core-attribute history (v2, improvement #7/R5):** any change to a core person attribute writes an
    `employee_attribute_history` row and updates the cache on `employees`; the two never diverge.
16. **Optimistic concurrency (v2, improvement #12/R13):** every mutable write supplies the expected
    `row_version`; mismatch → `STALE_VERSION` (409); on success `row_version` increments.
17. **Unique official email (v2, improvement #21/R22):** partial UNIQUE on
    `employee_contacts(contact_value) WHERE contact_type='OFFICIAL_EMAIL' AND is_deleted=false`.
18. **Retention/legal-hold precedence (v2, improvement #5/R4):** a row with an ACTIVE `legal_holds`
    entry cannot be purged or erased regardless of an erasure request; **retention wins where lawful**
    and the precedence + reason are recorded on the `data_principal_requests` resolution.
19. **Aadhaar single home (v2, improvement #2/R1):** no table other than `aadhaar_vault` may store the
    raw/tokenised Aadhaar number; `employees`/`employee_identity_documents` hold only
    `aadhaar_ref_key` + masked value; `aadhaar_vault.hash_for_dedup` is UNIQUE (duplicate Aadhaar
    detection without decryption).
20. **Governed-change gating (v2, improvement #8/R6):** `employees.dob`, `employees.category`, and name
    may change **only** through an APPLIED `governed_field_change_requests` with proof + approving
    authority (FR-022); direct UPDATE of these columns is rejected at the service layer.

### 5.7 Sample Data (2–3 rows per entity)

#### `employees` (v2 — Aadhaar via ref key; mononym example; record_state)

| employee_id | service_no | first_name | last_name | has_single_legal_name | dob | gender | aadhaar_ref_key | pan | doj | cadre | designation_id | org_unit_id | employment_type | employment_status | record_state | reporting_manager_id | completeness | dq_flag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11111111-...-0001 | GOV-0001 | Anita | Sharma | false | 1985-03-12 | FEMALE | rk-7a1f… | ABCPS1234K | 2010-06-01 | CADRE_A | desig-201 | org-10 | PERMANENT | ACTIVE | ACTIVE | 11111111-...-0009 | 96.00 | CLEAN |
| 11111111-...-0002 | GOV-0002 | Rajesh | Kumar | false | 1978-11-25 | MALE | rk-9c22… | XYZPK9876L | 2003-02-15 | CADRE_B | desig-150 | org-12 | PERMANENT | ON_LEAVE | ACTIVE | 11111111-...-0009 | 88.50 | REVIEW |
| 11111111-...-0042 | GOV-0042 | Lalmuanpuia | (null) | true | 1990-01-01 | MALE | rk-3d10… | LMNPL3344K | 2014-07-01 | CADRE_C | desig-110 | org-22 | PERMANENT | ACTIVE | PROVISIONAL | 11111111-...-0009 | 71.00 | NEEDS_ATTENTION |

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

#### `employee_dependents` (v2 heir flag)

| dependent_id | employee_id | full_name | relationship | dob | is_dependent | is_minor | is_legal_heir | heir_succession_rank |
|---|---|---|---|---|---|---|---|---|
| d-0001 | 11111111-...-0001 | Vikram Sharma | SPOUSE | 1983-01-20 | false | false | true | 1 |
| d-0002 | 11111111-...-0001 | Aarav Sharma | SON | 2015-08-05 | true | true | true | 2 |
| d-0003 | 11111111-...-0002 | Sunita Kumar | SPOUSE | 1981-05-14 | true | false | true | 1 |

#### `employee_nominees` (v2 family-pension flag)

| nominee_id | employee_id | nominee_name | relationship | benefit_type | share_pct | is_minor | is_family_pension_recipient | requires_four_eyes |
|---|---|---|---|---|---|---|---|---|
| n-0001 | 11111111-...-0001 | Vikram Sharma | SPOUSE | PENSION | 100.00 | false | true | true |
| n-0002 | 11111111-...-0001 | Aarav Sharma | SON | GRATUITY | 50.00 | true | false | true |
| n-0003 | 11111111-...-0001 | Vikram Sharma | SPOUSE | GRATUITY | 50.00 | false | false | true |

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

#### `employee_identity_documents` (v2 — Aadhaar via ref key)

| identity_doc_id | employee_id | doc_type | doc_number_masked | aadhaar_ref_key | doc_number_token | issuing_authority | is_verified |
|---|---|---|---|---|---|---|---|
| id-0001 | 11111111-...-0001 | AADHAAR | XXXX-XXXX-4321 | rk-7a1f… | (null) | UIDAI | true |
| id-0002 | 11111111-...-0001 | PASSPORT | XXXXXX78 | (null) | tok-… | Passport Seva | true |
| id-0003 | 11111111-...-0002 | PAN | XXXPK9876L | (null) | tok-… | Income Tax Dept | true |

#### `employee_bank_accounts`

| bank_account_id | employee_id | bank_name | ifsc_code | account_number_masked | account_type | is_primary_salary | is_verified |
|---|---|---|---|---|---|---|---|
| bk-0001 | 11111111-...-0001 | SBI | SBIN0001234 | XXXXXX4567 | SALARY | true | true |
| bk-0002 | 11111111-...-0002 | HDFC | HDFC0000456 | XXXXXX8899 | SAVINGS | true | false |
| bk-0003 | 11111111-...-0009 | Canara Bank | CNRB0002001 | XXXXXX1100 | SALARY | true | true |

#### `employee_photos` (v2 — purpose isolation)

| photo_id | employee_id | photo_type | processing_purpose | document_id | biometric_template_ref | consent_id | is_primary | status |
|---|---|---|---|---|---|---|---|---|
| ph-0001 | 11111111-...-0001 | PROFILE | IDENTITY_DISPLAY | m13-doc-0001 | (null) | (null) | true | APPROVED |
| ph-0002 | 11111111-...-0001 | BIOMETRIC_REF | BIOMETRIC_ATTENDANCE | (null) | bvault-ref-77 | cons-0009 | false | APPROVED |
| ph-0003 | 11111111-...-0002 | PROFILE | IDENTITY_DISPLAY | m13-doc-0010 | (null) | (null) | true | PENDING |

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

#### `profile_sections` *(Phase 2)*

| section_id | section_key | label | display_order | is_system | is_enabled |
|---|---|---|---|---|---|
| sec-01 | PERSONAL | Personal Details | 1 | true | true |
| sec-05 | BANK | Bank & Financial | 5 | true | true |
| sec-09 | CUSTOM_DEPT | Department Specific | 9 | false | false (Phase 2) |

#### `custom_field_definitions` *(Phase 2)*

| field_def_id | section_id | field_key | label | data_type | is_required | is_pii |
|---|---|---|---|---|---|---|
| cf-0001 | sec-09 | uniform_size | Uniform Size | ENUM | false | false |
| cf-0002 | sec-09 | govt_quarters_no | Govt Quarters No. | TEXT | false | false |
| cf-0003 | sec-09 | sports_quota | Sports Quota Entrant | BOOLEAN | false | false |

#### `employee_custom_field_values` *(Phase 2)*

| value_id | employee_id | field_def_id | value_text | value_bool |
|---|---|---|---|---|
| cv-0001 | 11111111-...-0001 | cf-0001 | M | NULL |
| cv-0002 | 11111111-...-0001 | cf-0002 | Q-204 | NULL |
| cv-0003 | 11111111-...-0002 | cf-0003 | NULL | true |

#### `field_access_policies` (v2 — 4-eyes + special-category)

| policy_id | field_path | role_key | access_level | requires_reason | requires_four_eyes | is_special_category | is_self_visible |
|---|---|---|---|---|---|---|---|
| fap-0001 | employees.pan | HR_OFFICER | MASKED | false | true | false | true |
| fap-0002 | aadhaar_vault.aadhaar_number | HR_ADMIN | FULL | true | true | false | true |
| fap-0003 | employees.religion | REPORTING_MANAGER | HIDDEN | false | false | true | true |
| fap-0004 | employees.category | HR_ADMIN | FULL | false | true | true | true |

#### `employee_profile_completeness` (v2 — advisory)

| employee_id | overall_pct | section_scores | missing_required_fields | data_quality_flag | last_computed_at |
|---|---|---|---|---|---|
| 11111111-...-0001 | 96.00 | {"PERSONAL":100,"BANK":100,"EDUCATION":80} | ["education.is_verified"] | CLEAN | 2026-06-30T06:00:00Z |
| 11111111-...-0002 | 88.50 | {"PERSONAL":100,"BANK":60} | ["bank.is_verified","photo"] | REVIEW | 2026-06-30T06:00:00Z |
| 11111111-...-0042 | 71.00 | {"PERSONAL":80,"BANK":0} | ["bank","aadhaar","dob_proof"] | NEEDS_ATTENTION | 2026-06-30T06:00:00Z |

#### `dedup_candidates`

| candidate_id | employee_a_id | employee_b_id | match_score | matched_attributes | status |
|---|---|---|---|---|---|
| dc-0001 | 11111111-...-0002 | 11111111-...-0055 | 92.50 | {"aadhaar_hash":true,"dob":true,"name_phonetic":0.88} | OPEN |
| dc-0002 | 11111111-...-0003 | 11111111-...-0061 | 78.00 | {"name_phonetic":0.95,"dob":true} | DISMISSED |
| dc-0003 | 11111111-...-0007 | 11111111-...-0070 | 99.00 | {"aadhaar_hash":true} | MERGED |

#### `employee_import_batches` (v2 — PROVISIONAL profile)

| batch_id | file_document_id | template_version | validation_profile | total_rows | valid_rows | provisional_rows | error_rows | status |
|---|---|---|---|---|---|---|---|---|
| ib-0001 | m13-doc-5001 | v1.2 | MIGRATION | 1200 | 870 | 315 | 15 | VALIDATED |
| ib-0002 | m13-doc-5002 | v1.2 | STRICT | 350 | 350 | 0 | 0 | COMMITTED |
| ib-0003 | m13-doc-5003 | v1.1 | MIGRATION | 90 | 40 | 45 | 5 | COMMITTED |

#### `import_staging_rows` (v2)

| staging_row_id | batch_id | row_number | validation_status | validation_errors | remediation_state | resolved_employee_id |
|---|---|---|---|---|---|---|
| sr-0001 | ib-0001 | 1 | VALID | NULL | NULL | NULL |
| sr-0002 | ib-0001 | 2 | PROVISIONAL | {"dob":"MISSING"} | QUEUED | 11111111-...-0042 |
| sr-0003 | ib-0002 | 1 | COMMITTED | NULL | NULL | 11111111-...-0301 |

#### `employee_id_aliases` *(v2 new)*

| alias_id | loser_id | survivor_id | dedup_candidate_id | merged_at | mergeable_back_until | is_reversed |
|---|---|---|---|---|---|---|
| al-0001 | 11111111-...-0070 | 11111111-...-0007 | dc-0003 | 2026-06-20T10:00:00Z | 2026-06-27T10:00:00Z | false |
| al-0002 | 11111111-...-0081 | 11111111-...-0012 | dc-0011 | 2026-05-02T09:00:00Z | 2026-05-09T09:00:00Z | false |
| al-0003 | 11111111-...-0090 | 11111111-...-0033 | dc-0014 | 2026-04-01T08:00:00Z | 2026-04-08T08:00:00Z | true |

#### `aadhaar_vault` *(v2 new)*

| aadhaar_ref_key | aadhaar_masked | hash_for_dedup | lawful_basis | lawful_basis_ref | linked_employee_id |
|---|---|---|---|---|---|
| rk-7a1f… | XXXX-XXXX-4321 | h-9f… | STATUTE | GO-PolicyPay-2019 | 11111111-...-0001 |
| rk-9c22… | XXXX-XXXX-7788 | h-2b… | AUA_KUA | AUA-REG-0456 | 11111111-...-0002 |
| rk-3d10… | XXXX-XXXX-9001 | h-5c… | STATUTE | GO-PolicyPay-2019 | 11111111-...-0042 |

#### `employee_attribute_history` *(v2 new)*

| attribute_history_id | employee_id | attribute_path | value_text | value_date | effective_from | effective_to | change_reason | gazette_ref |
|---|---|---|---|---|---|---|---|---|
| ah-0001 | 11111111-...-0001 | last_name | Verma | NULL | 2010-06-01 | 2012-11-30 | HIRE | NULL |
| ah-0002 | 11111111-...-0001 | last_name | Sharma | NULL | 2012-12-01 | NULL | MARRIAGE | GAZ-2012-8841 |
| ah-0003 | 11111111-...-0002 | category | OBC | NULL | 2003-02-15 | NULL | HIRE | NULL |

#### `position_history` *(v2 new)*

| position_history_id | position_id | title | pay_scale_id | sanctioned_count | effective_from | effective_to | change_reason | order_ref |
|---|---|---|---|---|---|---|---|---|
| pos-h-0001 | pos-201 | Deputy Officer (Finance) | ps-2016 | 2 | 2016-01-01 | 2017-12-31 | CREATE | GO-2016-12 |
| pos-h-0002 | pos-201 | Deputy Officer (Finance) | ps-2018-7cpc | 2 | 2018-01-01 | NULL | PAY_REVISION | 7CPC-GO-2018-55 |
| pos-h-0003 | pos-150 | Assistant Engineer | ps-2018-7cpc | 5 | 2018-01-01 | NULL | PAY_REVISION | 7CPC-GO-2018-55 |

#### `employee_certificates` *(v2 new)*

| certificate_id | employee_id | certificate_type | certificate_number | valid_from | valid_to | disability_percentage | is_creamy_layer | status |
|---|---|---|---|---|---|---|---|---|
| cert-0001 | 11111111-...-0002 | OBC_NON_CREAMY | OBC/2025/4471 | 2025-04-01 | 2026-03-31 | NULL | false | VALID |
| cert-0002 | 11111111-...-0050 | PWD_UDID | UDID-TS-0099 | 2021-06-01 | NULL | 65.00 | NULL | VALID |
| cert-0003 | 11111111-...-0061 | EWS | EWS/2024/9912 | 2024-04-01 | 2025-03-31 | NULL | NULL | EXPIRED |

#### `privacy_notices` *(v2 new)*

| notice_id | notice_key | version | purpose | language | effective_from | is_active |
|---|---|---|---|---|---|---|
| pn-0001 | PROFILE_PROCESSING | v1 | IDENTITY_DISPLAY | en | 2026-01-01 | true |
| pn-0002 | BIOMETRIC_ATTENDANCE | v1 | BIOMETRIC_ATTENDANCE | en | 2026-01-01 | true |
| pn-0003 | PROFILE_PROCESSING | v1 | IDENTITY_DISPLAY | te | 2026-01-01 | true |

#### `consent_records` *(v2 new)*

| consent_id | employee_id | notice_id | purpose | action | effective_at | expires_at |
|---|---|---|---|---|---|---|
| cons-0009 | 11111111-...-0001 | pn-0002 | BIOMETRIC_ATTENDANCE | GRANTED | 2026-02-01T09:00:00Z | 2027-02-01T09:00:00Z |
| cons-0010 | 11111111-...-0002 | pn-0001 | IDENTITY_DISPLAY | GRANTED | 2026-01-15T10:00:00Z | NULL |
| cons-0011 | 11111111-...-0001 | pn-0002 | BIOMETRIC_ATTENDANCE | WITHDRAWN | 2026-06-01T11:00:00Z | NULL |

#### `data_principal_requests` *(v2 new)*

| request_id | employee_id | request_type | status | sla_due_at | linked_legal_hold_id |
|---|---|---|---|---|---|
| dpr-0001 | 11111111-...-0001 | ACCESS | ACTIONED | 2026-07-07T00:00:00Z | NULL |
| dpr-0002 | 11111111-...-0033 | ERASURE | REJECTED | 2026-07-10T00:00:00Z | lh-0002 |
| dpr-0003 | 11111111-...-0002 | GRIEVANCE | IN_REVIEW | 2026-07-05T00:00:00Z | NULL |

#### `breach_incidents` *(v2 new)*

| incident_id | detected_at | severity | nature | affected_employee_ids | dpb_notified_at | status |
|---|---|---|---|---|---|---|
| br-0001 | 2026-06-12T14:00:00Z | HIGH | break-glass-abuse | {…12 ids…} | 2026-06-13T09:00:00Z | NOTIFIED |
| br-0002 | 2026-03-04T02:00:00Z | LOW | misconfig | {…1 id…} | NULL | CLOSED |
| br-0003 | 2026-05-22T18:00:00Z | CRITICAL | exfiltration | {…340 ids…} | 2026-05-23T08:00:00Z | CONTAINED |

#### `retention_policies` *(v2 new)*

| policy_id | record_class | retain_years | basis_reference | post_retention_action | erasure_overridable |
|---|---|---|---|---|---|
| ret-0001 | SERVED_EMPLOYEE | 75 | Service-Record Rules | ARCHIVE | false |
| ret-0002 | PENSIONER | 99 | Pension Rules | ARCHIVE | false |
| ret-0003 | APPLICANT | 2 | DPDP minimisation | PURGE | true |

#### `legal_holds` *(v2 new)*

| hold_id | employee_id | hold_type | reason | source_module | placed_at | released_at | status |
|---|---|---|---|---|---|---|---|
| lh-0001 | 11111111-...-0002 | DISCIPLINARY | Pending inquiry CV-2026-12 | M09 | 2026-04-01T00:00:00Z | NULL | ACTIVE |
| lh-0002 | 11111111-...-0033 | PENSION | Pension dispute WP-441 | M11 | 2026-02-10T00:00:00Z | NULL | ACTIVE |
| lh-0003 | 11111111-...-0007 | LITIGATION | Service matter | M09 | 2025-11-01T00:00:00Z | 2026-05-01T00:00:00Z | RELEASED |

#### `governed_field_change_requests` *(v2 new)*

| change_request_id | employee_id | field_path | current_value | requested_value | new_effective_from | gazette_ref | alteration_count | status |
|---|---|---|---|---|---|---|---|---|
| gcr-0001 | 11111111-...-0002 | dob | 1978-11-25 | 1979-01-10 | 1979-01-10 | NULL | 1 | UNDER_REVIEW |
| gcr-0002 | 11111111-...-0001 | name | Verma | Sharma | 2012-12-01 | GAZ-2012-8841 | 1 | APPLIED |
| gcr-0003 | 11111111-...-0050 | category | GEN | OBC | 2026-01-01 | GAZ-2025-5510 | 1 | REJECTED |

#### `outbox_events` *(v2 new)*

| event_id | aggregate_id | event_type | is_tombstone | occurred_at | published_at | dead_lettered |
|---|---|---|---|---|---|---|
| 90001 | 11111111-...-0001 | PLACEMENT_CHANGED | false | 2026-06-30T05:12:00Z | 2026-06-30T05:12:01Z | false |
| 90002 | 11111111-...-0070 | RECORDS_MERGED | true | 2026-06-20T10:00:00Z | 2026-06-20T10:00:01Z | false |
| 90003 | 11111111-...-0002 | GOVERNED_FIELD_CHANGED | false | 2026-06-29T07:00:00Z | NULL | false |

#### `break_glass_reveals` *(v2 new)*

| reveal_id | actor_id | employee_id | field_path | reason | is_special_category | window_count_at_reveal | anomaly_score | alerted |
|---|---|---|---|---|---|---|---|---|
| bg-0001 | usr-hradmin-1 | 11111111-...-0001 | aadhaar_vault.aadhaar_number | Pension KYC INC-4571 | false | 3 | 0.40 | false |
| bg-0002 | usr-hradmin-2 | 11111111-...-0033 | employees.category | Roster audit AUD-22 | true | 18 | 2.10 | true |
| bg-0003 | usr-hradmin-1 | 11111111-...-0002 | employee_bank_accounts.account_number | Salary exception | false | 5 | 0.90 | false |

---

## 6. Functional Requirements

Each FR follows the mandated structure (ID, Module, Primary Role(s), User Story, Description, Acceptance
Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and the
full Low-Level Design table). Roles use Section 3 keys. "→M02" denotes the edit-approval hand-off.
**v2 FRs FR-EPM-020 … FR-EPM-025 are new; FR-EPM-002/007/009/010/011/013/014/015/017 are revised per the
council.**

---

### FR-EPM-001 — Create Employee Profile on Hire

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Dept Head / Appointing Authority sanction)
- **User Story:** *As an HR Officer, I want to create a complete, validated employee master record when
  a person is hired, so that every downstream module has an authoritative golden record from day one.*

**Description:** Creates the anchor `employees` row plus the initial job assignment and the initial
`employee_attribute_history` rows for core person attributes, generates `service_no`, runs alias-aware
duplicate pre-check (including phonetic match, FR-025), optionally provisions a `users` login, captures
the initial **privacy notice + processing consent** (FR-020), computes advisory completeness, and emits
a `PROFILE_CREATED` event to M12 via the outbox. Multi-step wizard (Personal → Contact/Address →
Job/Position → Statutory → Bank → Consent → Review) with "save draft".

**Acceptance Criteria:**
1. Mandatory fields (`first_name`, `dob`, `gender`, `date_of_joining`, `designation_id`, `org_unit_id`,
   `employment_type`) must be present before submit; **`last_name` is optional when
   `has_single_legal_name=true`** (mononym, improvement #17); draft allows partial save.
2. `service_no` is auto-generated per configured pattern and is unique; collision retries server-side.
3. On submit the system runs deduplication (FR-015) including phonetic/transliteration match (FR-025);
   a HIGH match (≥ 90) blocks auto-create and routes to dedup review.
4. Creating the row also creates exactly one current `employee_job_assignments` (reason `HIRE`) **and
   `employee_attribute_history` rows (effective_from = DOJ) for each core attribute**.
5. `employment_status = ACTIVE`; `record_state = ACTIVE` (or `PROVISIONAL` if created via migration).
6. A `PROFILE_CREATED` event is written to `outbox_events` within the same transaction (outbox pattern),
   later drained to M12.
7. Initial advisory `employee_profile_completeness` row is computed and stored.
8. The active `privacy_notice` is presented and a `consent_records` GRANTED row captured for
   `IDENTITY_DISPLAY` purpose (FR-020).
9. An `audit_log` entry records creator, timestamp, and payload hash.

**Business Rules:**
- `dob` must make the employee ≥ 18 years on `date_of_joining` (CHECK relaxed under MIGRATION profile).
- `date_of_joining` cannot be a future date beyond the configured pre-hire window (default 90 days).
- Appointing-Authority sanction reference required for PERMANENT employment_type.
- PAN/Aadhaar required only per the conditional statutory-ID rule (§5.6 r9): Indian nationals on
  PERMANENT/PROBATIONER; foreign nationals/consultants exempt.
- Aadhaar, if supplied, is written **only** to `aadhaar_vault`; `employees` holds the ref key + mask.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` | INSERT | core master fields + record_state |
| `employee_attribute_history` | INSERT | core attrs effective_from=DOJ |
| `employee_job_assignments` | INSERT | reason=HIRE |
| `aadhaar_vault` | INSERT (conditional) | ref key + encrypted number |
| `consent_records` | INSERT | IDENTITY_DISPLAY GRANTED |
| `employee_profile_completeness` | INSERT | advisory score |
| `outbox_events` | INSERT | PROFILE_CREATED |
| `audit_log` | INSERT | CREATE |
| `users` | INSERT (optional) | login provisioning |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees` | create profile (or draft with `?draft=true`) |
| POST | `/api/v1/employees/dedup-precheck` | pre-submit duplicate check (phonetic-aware) |
| GET | `/api/v1/employees/service-no/preview` | preview next service_no |

**UI Behavior Notes:** Stepper wizard with per-step validation; inline dedup warning banner; consent
step shows the notice text and records acceptance; "Save draft" persists state; review summary; success
toast + redirect to the new 360° profile.

**Edge Cases:** duplicate `service_no` race; dedup HIGH match; future DOJ; position over-strength;
mononym (no surname); migrated PROVISIONAL record with missing DOB; rehire of a prior RESIGNED record
(alias not needed; new assignment); foreign national without PAN/Aadhaar.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `CreateEmployeeWizard` (stepper), per-step zod/Yup schemas, dedup banner, consent panel, review summary, success redirect. |
| Backend-Service Flow | `EmployeeService.create()` → validate (conditional statutory IDs, mononym) → dedup-precheck (FR-025 matcher) → generate service_no → tx{ insert employees + attribute_history + assignment + optional aadhaar_vault + consent + completeness + outbox PROFILE_CREATED } → optional user provisioning → 201. |
| Data Operations | INSERT employees, employee_attribute_history, employee_job_assignments, aadhaar_vault?, consent_records, employee_profile_completeness, audit_log, outbox_events. |
| Validation Logic | Field schema; age/DOJ; PAN format; conditional statutory IDs; position strength; sanction ref for PERMANENT; row_version init. |
| Authorization Logic | `employee.create` permission (HR Officer/Admin); org-scope must include target `org_unit_id`; PERMANENT needs Appointing-Authority sanction reference. |
| State Changes & Side Effects | New ACTIVE/PROVISIONAL employee; attribute history seeded; PROFILE_CREATED outbox event; consent captured; advisory completeness; optional login; notification to HR + manager. |
| Failure Handling | Validation→400 VALIDATION_ERROR(field); dedup block→409 DUPLICATE_CANDIDATE; service_no collision→retry then 409; partial failure→full tx rollback (outbox not emitted). |
| Dependencies & Reuse | Dedup engine (FR-015), phonetic matcher (FR-025), attribute-history spine (FR-011), consent (FR-020), Aadhaar vault (FR-007), outbox producer, completeness (FR-014). |
| Test Guidance | Unit: validators, service_no generator, mononym handling, dedup gating. Integration: tx atomicity incl. attribute_history + outbox; rollback on event failure. E2E: full wizard happy path + dedup-block + consent capture + draft resume + mononym. |

---

### FR-EPM-002 — 360° Consolidated Profile View (CQRS read model) — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Reporting Manager (scoped), Auditor (RO), Employee (own)
- **User Story:** *As an HR Officer, I want one consolidated 360° view assembled in under 800 ms even at
  500k employees, so that I can understand the whole person without hopping between systems.*

**Description:** A read-optimised composite served from a **materialised CQRS read projection**
(`employee_profile_read_model`, rebuilt from domain events on the outbox) that aggregates the master
row, satellites, current + historical job assignments, advisory completeness, data-quality flags, and
linked documents — each section rendered through the **field-access policy (FR-EPM-013)** with a
**resolved-policy cache** per role. Restricted-PII reads are audited **asynchronously** (improvement
#14/#15, R10/R11).

**Acceptance Criteria:**
1. The view assembles person, contact, address, dependents/heirs, nominees, emergency contacts,
   education, experience, identity (masked), bank (masked), photo, current position/org placement,
   certificates, custom fields (Phase 2), and advisory completeness in **≤ 800 ms P95 at 500k records**,
   read from the CQRS projection (not 20 live joins on the hot path).
2. Every field is rendered per the caller's `field_access_policies` resolution (server-masked), using a
   per-role resolved-policy cache (short TTL).
3. A header shows photo, name (`display_name`), service_no, designation, org unit, status badge,
   advisory completeness ring.
4. Restricted-PII reads requiring a reason prompt for a break-glass reason and log it via FR-013
   (rate-limited, async-audited).
5. Sections the viewer cannot see at all are hidden, not shown empty.
6. The view is read-only; edit affordances appear only for permitted roles (self-service → M02).
7. The projection is **eventually consistent** with a stated staleness budget (≤ 5 s P99 behind the
   write); a "last synced" indicator is available to operators.

**Business Rules:**
- Reporting Managers see direct/indirect reports within their org subtree only.
- Auditors see all fields read-only with full (async) audit logging; sensitive fields still masked
  unless policy grants FULL.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_profile_read_model` (CQRS projection) | SELECT | assembled, policy-masked |
| `employees` + all `employee_*` | (source for projection rebuild) | full projection |
| `field_access_policies` | SELECT (cached) | masking resolution |
| `outbox_events` | consumed | projection rebuild trigger |
| `audit_log` (async sink) | INSERT | PII_READ when restricted |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/profile-360` | assembled view (from projection) |
| GET | `/api/v1/employees/{id}/sections/{sectionKey}` | lazy-load a section |
| POST | `/api/v1/employees/{id}/break-glass` | record reason for restricted read |

**UI Behavior Notes:** Left rail section nav + sticky header; lazy-load heavy sections; masked fields
show a lock icon with "reveal (reason required)" when policy permits; completeness ring links to FR-014;
optional "as of" jump to FR-011.

**Edge Cases:** employee with no photo (initials avatar); separated/archived employee (read-only,
watermark); viewer with partial section access; very large dependents/history lists (paginated within
section); merged loser id requested (resolve via alias → survivor 360°); projection lag (serve last good
+ staleness note).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `Profile360` shell, `ProfileHeader`, section panels, masked-field component, break-glass modal, completeness ring, staleness chip. |
| Backend-Service Flow | `Profile360Query.read(id, viewerCtx)` → resolve alias → read `employee_profile_read_model` → apply cached field-access policy → strip tokens → enqueue async PII_READ audit → return composite; projection updater consumes `outbox_events` to maintain the read model. |
| Data Operations | SELECT from CQRS projection; resolved-policy cache lookup; **async** audit enqueue for restricted reads; projection upserts on event consumption. |
| Validation Logic | Viewer org-scope; section visibility; reason required for break-glass; alias resolution. |
| Authorization Logic | Row access (own/scope/global per role) AND field access policy per field; deny → omit field/section; fail-closed. |
| State Changes & Side Effects | No master mutation; async PII_READ audit; break-glass reason persisted (FR-013); projection updated out-of-band. |
| Failure Handling | Not found→404; forbidden row→403; section fetch failure→section-level error chip; policy resolution failure→fail closed (hide); projection unavailable→fallback live read with degraded-latency header. |
| Dependencies & Reuse | Field-access engine (FR-013), completeness (FR-014), alias (FR-015), M13 photo URL, async audit sink, outbox consumer. |
| Test Guidance | Unit: masking resolution matrix; alias resolution. Performance: 800 ms P95 at 500k from projection. Integration: projection lag + fallback; async audit. E2E: role-based visibility; break-glass logging. |

---

### FR-EPM-003 — Contact Information & Multiple Address Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to maintain an employee's multiple contacts and addresses
  with verification, so that communications and statutory correspondence reach the right place.*

**Description:** CRUD for `employee_contacts` and `employee_addresses` with type rules, primary
designation, OTP/email verification, "same as permanent" copy, effective-dated address history, **unique
official email**, and **optimistic concurrency** on every write. Employee-initiated changes are M02
requests; HR direct edits apply immediately with audit.

**Acceptance Criteria:**
1. Each contact type validated (phone E.164-ish; email RFC 5322); exactly one primary per type.
2. Marking a new primary auto-demotes the previous primary atomically.
3. Address requires full mandatory set; pincode validated per country; "same as permanent" copies fields.
4. Verification flow: OTP/email sets `is_verified=false→true`; `verified_at` set.
5. Address changes are effective-dated (old row `valid_to` closed, new row opened).
6. Employee self-service edits create an M02 request, not a direct write.
7. **`official_email` is unique across non-deleted employees** (improvement #21/R22); duplicate → 409.
8. Every update supplies the expected `row_version`; mismatch → `STALE_VERSION` 409 (improvement #12).

**Business Rules:**
- At least one MOBILE and one email required for ACTIVE employees (advisory completeness only).
- Overseas address requires country ≠ India and a valid international format.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_contacts` | INSERT/UPDATE/SOFT-DELETE | type, value, is_primary, verification, row_version |
| `employee_addresses` | INSERT/UPDATE | type, valid_from/to, is_current |
| `workflow_instances` (M02) | INSERT | for self-service requests |
| `audit_log` | INSERT | CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/employees/{id}/contacts` | list/add |
| PATCH/DELETE | `/api/v1/employees/{id}/contacts/{contactId}` | update/soft-delete (etag/row_version) |
| POST | `/api/v1/contacts/{contactId}/verify` | OTP/email verify |
| GET/POST/PATCH | `/api/v1/employees/{id}/addresses` | manage addresses |

**UI Behavior Notes:** Cards per contact/address with primary star; verify badge; add-address modal with
"same as permanent" toggle; self-service shows "submit for approval"; concurrency conflict shows a
"reload — changed by another user" prompt.

**Edge Cases:** removing the only primary; unverified primary; duplicate identical contact; duplicate
official email; address with future `valid_from`; concurrent primary set (row_version conflict).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `ContactList`, `AddressList`, add/edit modals, verify badge, primary toggle, self-service banner, conflict prompt. |
| Backend-Service Flow | `ContactService`/`AddressService` CRUD; primary-demotion in tx; verification issues OTP via notification; address change closes prior row + opens new; row_version checked. |
| Data Operations | INSERT/UPDATE/soft-delete; effective-date transition; audit; unique official_email enforcement. |
| Validation Logic | Type-specific format; one-primary invariant; pincode/country; unique official_email; row_version match. |
| Authorization Logic | HR write within org scope; self-service routes to M02; auditor read-only. |
| State Changes & Side Effects | Primary reassignment; verification; notification on verify; M02 request for self edits. |
| Failure Handling | Invalid format→400; sole-primary removal→409 PRIMARY_REQUIRED; duplicate official email→409 CONFLICT; OTP expiry→retry; version mismatch→409 STALE_VERSION. |
| Dependencies & Reuse | Notification (OTP), M02 workflow, audit, advisory completeness recompute. |
| Test Guidance | Unit: format validators, primary invariant, unique email. Integration: address effective-date transition; row_version conflict. E2E: verify flow; self-service→M02. |

---

### FR-EPM-004 — Dependents, Family Members, Nominees & Legal Heirs — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to record dependents, benefit nominees, and legal heirs with
  shares and guardian handling, so that pension, gratuity, insurance and family-pension pay out
  correctly and lawfully.*

**Description:** CRUD for `employee_dependents` and `employee_nominees`, with minor detection, guardian
requirement, per-benefit nominee-share validation (sum = 100), **legal-heir flagging and succession
rank** (feeds FR-024 deceased handling), proof-document linkage to M13, and **4-eyes on
pension/gratuity nominees** (improvement #20).

**Acceptance Criteria:**
1. Dependent `is_minor` computed from `dob`; flagged dependents drive medical/benefit eligibility.
2. A nominee may reference an existing dependent or be standalone.
3. For each `(employee, benefit_type)` the sum of active nominee `share_pct` must equal 100 before save
   of the set; partial save only as draft.
4. Minor nominees require a `guardian_name`.
5. Proof documents linked via `document_id` (uploaded to M13 first).
6. **Legal heirs and `heir_succession_rank` can be recorded** and are surfaced to FR-024 on DECEASED.
7. **PENSION/GRATUITY nominee changes require 4-eyes** (`requires_four_eyes=true`) and emit
   `NOMINEE_UPDATED` to M12.
8. Self-service edits route to M02.

**Business Rules:**
- Spouse relationship limited to one active per employee (configurable).
- Nominee changes for PENSION/GRATUITY are statutory — require proof document, 4-eyes, and an SR event.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_dependents` | CRUD | relationship, is_minor, is_legal_heir, heir_succession_rank |
| `employee_nominees` | CRUD | benefit_type, share_pct, guardian, is_family_pension_recipient |
| `documents` (M13) | reference | proof docs |
| `workflow_tasks` | INSERT | 4-eyes on statutory nominees |
| `outbox_events` | INSERT | NOMINEE_UPDATED |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/dependents` | dependents/heirs |
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/nominees` | nominees |
| POST | `/api/v1/employees/{id}/nominees:validate-shares` | share-sum check |
| POST | `/api/v1/nominees/{id}:approve` | 4-eyes approve (statutory) |

**UI Behavior Notes:** Dependents table with heir/rank columns; nominee allocation grid grouped by
benefit_type with a live share-sum indicator (must hit 100%); guardian field appears when minor;
"promote dependent to nominee/heir" shortcut; pending-approval badge for statutory nominees.

**Edge Cases:** share sum ≠ 100; minor without guardian; nominee deletion leaving < 100%; duplicate
spouse; dependent deletion referenced by a nominee/heir; maker=checker on statutory nominee.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `DependentTable` (heir/rank), `NomineeAllocationGrid` with per-benefit share meter, guardian conditional, promote action, approval badge. |
| Backend-Service Flow | `DependentService`/`NomineeService`; share-sum validated per benefit set in tx; minor→guardian; statutory benefit change → 4-eyes workflow_task → on approve emits NOMINEE_UPDATED outbox. |
| Data Operations | CRUD dependents/nominees; FK to M13 docs; workflow_task for 4-eyes; outbox; audit. |
| Validation Logic | Minor computation; guardian conditional; per-benefit share sum = 100; spouse uniqueness; referenced-dependent delete guard; maker≠checker. |
| Authorization Logic | HR write in scope; self-service→M02; statutory nominee 4-eyes; proof doc required. |
| State Changes & Side Effects | Nominee set updated; heir linkage recorded; NOMINEE_UPDATED SR event for PENSION/GRATUITY; advisory completeness recompute. |
| Failure Handling | Share≠100→409 SHARE_SUM_INVALID; minor no guardian→400; delete referenced dependent→409 IN_USE; maker=checker→403 SOD_VIOLATION. |
| Dependencies & Reuse | M13 upload, outbox producer, M02 workflow, 4-eyes engine, FR-024 (succession), audit. |
| Test Guidance | Unit: share-sum + minor + heir logic. Integration: SR event + 4-eyes on statutory nominee. E2E: allocation to 100%; guardian flow; heir capture. |

---

### FR-EPM-005 — Emergency Contact Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Employee (own, → M02 for self edits)
- **User Story:** *As an employee, I want my emergency contacts on file with a call priority, so that the
  organisation can reach the right person quickly in a crisis.*

**Description:** CRUD for `employee_emergency_contacts` with priority ordering and at least one required
for ACTIVE employees (advisory). Self-service edits may apply immediately or route to M02 per policy.

**Acceptance Criteria:**
1. Each contact requires name, relationship, and a valid primary phone.
2. Priority unique per employee, re-sequenced on add/remove/reorder.
3. ACTIVE employees should have ≥ 1 emergency contact (advisory completeness, not a block).
4. Drag-reorder updates priority atomically.

**Business Rules:**
- Emergency contacts are not PII-restricted to managers (operationally needed) but are still audited.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_emergency_contacts` | CRUD | name, phone, priority, row_version |
| `audit_log` | INSERT | CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/emergency-contacts` | manage |
| PATCH | `/api/v1/employees/{id}/emergency-contacts:reorder` | reorder priorities |

**UI Behavior Notes:** Ordered list with drag handles; primary contact pinned at top; quick-add inline row.

**Edge Cases:** duplicate priority; deleting last contact (warn); invalid phone; reorder race.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `EmergencyContactList` with drag-reorder, inline add row, validation hints. |
| Backend-Service Flow | `EmergencyContactService` CRUD + reorder; priority normalisation in tx; row_version checked. |
| Data Operations | CRUD + bulk priority update; audit. |
| Validation Logic | Phone format; priority uniqueness; min-one advisory. |
| Authorization Logic | HR write in scope; self-service per config (immediate or M02). |
| State Changes & Side Effects | Priority resequence; advisory completeness recompute. |
| Failure Handling | Invalid phone→400; reorder conflict→409 STALE_VERSION retry. |
| Dependencies & Reuse | Audit, advisory completeness. |
| Test Guidance | Unit: priority normalisation. E2E: drag-reorder persists; min-one advisory. |

---

### FR-EPM-006 — Education, Qualifications & Prior Experience Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to maintain verified education and prior service history, so
  that eligibility, seniority, and pensionable-service computations are accurate.*

**Description:** CRUD for `employee_education` and `employee_experience` with highest-qualification
designation, credential verification, government-service flagging (feeds pension), and certificate
linkage to M13.

**Acceptance Criteria:**
1. Exactly one education row may be `is_highest=true`; setting a new one demotes the prior.
2. `year_of_passing` bounded (1950..current); experience `from_date ≤ to_date`.
3. `is_government_service=true` experience contributes to pensionable-service summary (read by M11).
4. Verification toggles `is_verified` with source captured; verified rows immutable except by Admin.
5. Certificates/relieving letters linked via `document_id`.

**Business Rules:**
- Overlapping prior-experience date ranges produce a warning (concurrent roles possible).
- Education below the post's minimum qualification raises an advisory data-quality REVIEW flag.

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
| Data Operations | CRUD; M13 doc refs; audit; advisory completeness recompute. |
| Validation Logic | One-highest invariant; date bounds; overlap warning; min-qualification advisory DQ. |
| Authorization Logic | HR write in scope; verified-row edit only Admin; self-service→M02. |
| State Changes & Side Effects | Highest reassignment; advisory DQ flag on under-qualification; pensionable summary changes. |
| Failure Handling | Two-highest→409; verified edit→403 IMMUTABLE_VERIFIED; bad dates→400. |
| Dependencies & Reuse | M13, M11 (pension read), advisory DQ engine (FR-014), audit. |
| Test Guidance | Unit: highest invariant, gov-service aggregation. Integration: pensionable summary. E2E: verify-then-lock. |

---

### FR-EPM-007 — Identity & Statutory Document Management + Aadhaar Data Vault — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer (masked), HR Admin (4-eyes for PAN/Aadhaar; Employee requests → M02)
- **User Story:** *As an HR Admin, I want to capture and verify statutory IDs securely — with Aadhaar
  held only in a hardened Reference-Key vault and never duplicated — so that we meet the Aadhaar Act
  2016, UIDAI Data Vault rules, and DPDP.*

**Description:** CRUD for `employee_identity_documents`. **Aadhaar numbers are stored only in
`aadhaar_vault`** (KMS-encrypted, keyed by a Reference Key), with profile tables holding only the masked
value + `aadhaar_ref_key`; **the duplicate `employees.national_id` Aadhaar copy is removed** (improvement
#2/R1). Non-Aadhaar IDs are tokenised in `doc_number_token`. Duplicate Aadhaar is detected via the
vault's keyed `hash_for_dedup` without decryption. Lawful basis (AUA/KUA or statute) is recorded per
vault row. Verification, expiry alerts, scan linkage to M13. **PAN and Aadhaar writes/reveals require
4-eyes** (improvement #20).

**Acceptance Criteria:**
1. On Aadhaar save: validate (Verhoeff/format) → compute keyed `hash_for_dedup` → if no collision, KMS-
   encrypt and insert into `aadhaar_vault` with `lawful_basis` → store only `aadhaar_ref_key` +
   `aadhaar_masked` on the profile. **No other table stores the number** (§5.6 r19).
2. Non-Aadhaar IDs validated by type, tokenised/encrypted in `doc_number_token`, masked display derived.
3. No read API returns the raw number/token — only the masked value; **Aadhaar reveal requires HR Admin
   + 4-eyes + reason and is rate-limited** (FR-013).
4. Each `doc_type` at most one active record per employee (configurable for PASSPORT renewals).
5. Documents with `expiry_date` generate alerts at 90/30/7 days before expiry.
6. Verification sets `is_verified` + `verification_source`.
7. Duplicate Aadhaar/PAN (vault hash / PAN unique) raises a dedup candidate (FR-015).

**Business Rules:**
- Aadhaar storage is conditional and minimised; the `lawful_basis` must be present or the write is
  rejected.
- PAN unique across employees (duplicate PAN → dedup candidate).
- No facial/biometric authentication against Aadhaar is performed in M01.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `aadhaar_vault` | INSERT/SELECT(reveal) | ref key, encrypted number, lawful_basis, hash |
| `employee_identity_documents` | CRUD | masked, ref key or token, expiry, verified |
| `documents` (M13) | reference | scans |
| `dedup_candidates` | INSERT | duplicate PAN/Aadhaar |
| `break_glass_reveals` | INSERT | on Aadhaar reveal |
| `audit_log` (async) | INSERT | PII_READ / CRUD |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/identity-docs` | manage (masked only) |
| POST | `/api/v1/identity-docs/{id}:verify` | verify |
| POST | `/api/v1/employees/{id}/aadhaar:reveal` | 4-eyes + reason vault reveal |
| GET | `/api/v1/identity-docs/expiring` | expiry report |

**UI Behavior Notes:** Inputs accept raw number, masked on blur; Aadhaar field locked after vault save
(replace requires new entry + reason + 4-eyes); reveal action shows a 4-eyes approval + reason modal;
verify badge; expiry chips colour-coded.

**Edge Cases:** invalid Aadhaar checksum; duplicate Aadhaar (vault hash collision → dedup); duplicate
PAN; expired document; attempt to read raw via API (403/omit); replacing a passport (history retained);
vault KMS unavailable (write fails closed, no plaintext persisted).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `IdentityDocList`, masked input, Aadhaar 4-eyes reveal modal, verify badge, expiry chips. |
| Backend-Service Flow | `IdentityDocService`: Aadhaar → validate → hash → vault upsert (KMS) → store ref key + mask; non-Aadhaar → tokenise; dedup check on hash/PAN; reveal endpoint enforces 4-eyes + reason → FR-013 rate-limit/anomaly → `break_glass_reveals` + async audit → return number once. |
| Data Operations | INSERT aadhaar_vault; CRUD identity docs (ref key or token); dedup_candidate INSERT on collision; break_glass_reveals INSERT; async audit. |
| Validation Logic | Type checksum/format; lawful_basis presence; PAN uniqueness; vault hash uniqueness; expiry presence; 4-eyes on PAN/Aadhaar. |
| Authorization Logic | Write HR Admin (4-eyes for PAN/Aadhaar); HR Officer masked; raw never returned except audited vault reveal; self-service→M02. |
| State Changes & Side Effects | Vault row created; dedup candidate on collision; expiry alerts scheduled; verification status; reveal ledgered + DPO alert if threshold crossed. |
| Failure Handling | Checksum fail→400 INVALID_ID; missing lawful_basis→400; duplicate Aadhaar/PAN→409 + dedup; raw-read attempt→403; reveal over cap→429 RATE_LIMITED; KMS down→503 UPSTREAM_UNAVAILABLE (fail closed). |
| Dependencies & Reuse | KMS/crypto, `aadhaar_vault`, dedup engine, M13, FR-013 break-glass, notification (expiry), async audit. |
| Test Guidance | Unit: Verhoeff/PAN validators, masking, hash. Security: number never outside vault; reveal needs 4-eyes; rate-limit. Integration: dedup on duplicate Aadhaar via hash. E2E: reveal-with-4-eyes logged. |

---

### FR-EPM-008 — Bank & Financial Detail Management

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer/HR Admin (4-eyes), Dept Head (approve)
- **User Story:** *As an HR Admin, I want bank details captured, verified, and changed under 4-eyes
  control, so that salary and pension are paid to the correct, fraud-resistant account.*

**Description:** CRUD for `employee_bank_accounts` with IFSC validation, account-number tokenisation,
penny-drop/manual verification, exactly one active primary salary account, **mandatory 4-eyes** on
create/change, and **optimistic concurrency**. Consumed by M10/M11. **Note:** M10 — not M01 — gates
disbursement; M01 simply exposes the verified primary (improvement #6).

**Acceptance Criteria:**
1. IFSC validated against format and (optionally) a bank reference list; account number tokenised,
   masked to last 4.
2. Exactly one `is_primary_salary=true` active account; switching demotes the prior in the same tx.
3. Every create/update requires a second approver (4-eyes) before becoming effective.
4. Account holder name fuzzy-matched against employee name; mismatch raises a warning + reason.
5. Verification (penny-drop or manual) sets `is_verified`; **M10 consumes only verified primary and owns
   the `NO_VERIFIED_BANK` disbursement precondition with a cheque fallback** (M01 never blocks pay).
6. Changes emit a `BANK_DETAIL_CHANGED` notification to the employee.
7. Writes use `row_version`; mismatch → 409 STALE_VERSION.

**Business Rules:**
- A bank change within N days of a payroll cut-off is flagged for extra scrutiny.
- Separated employees' bank edits restricted to pension disbursement context (HR Admin + reason).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_bank_accounts` | CRUD | ifsc, masked, token, primary, verified, row_version |
| `workflow_tasks` | INSERT | 4-eyes approval |
| `notifications` | INSERT | change alert |
| `audit_log` | INSERT | CRUD + approval |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/employees/{id}/bank-accounts` | manage (pending until approved) |
| POST | `/api/v1/bank-accounts/{id}:approve` | second-approver action |
| POST | `/api/v1/bank-accounts/{id}:verify` | penny-drop/manual verify |

**UI Behavior Notes:** Pending-approval badge; approve action visible only to a different authorised
user; masked account number with reveal-with-reason (FR-013); name-match warning banner; verify status.

**Edge Cases:** maker = checker attempt (block); name mismatch; duplicate account across employees;
change near payroll cut-off; unverified primary (M10 falls back to cheque, never withholds).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `BankAccountList`, add/edit form, pending badge, approve panel (different user), verify action, name-match warning. |
| Backend-Service Flow | `BankAccountService` create→PENDING; second-approver via workflow_tasks; on approve→effective + demote prior primary; verify flow; notify; row_version checked. |
| Data Operations | CRUD with token column; workflow_task INSERT; primary demotion in tx; notification; audit. |
| Validation Logic | IFSC format/list; name fuzzy match; one-primary invariant; maker≠checker; cut-off scrutiny; row_version. |
| Authorization Logic | Maker = HR Officer/Admin; checker = different authorised user/Dept Head; raw token never returned. |
| State Changes & Side Effects | PENDING→ACTIVE on approval; primary reassignment; BANK_DETAIL_CHANGED notification; M10 reads verified primary. |
| Failure Handling | maker=checker→403 SOD_VIOLATION; invalid IFSC→400; duplicate→409; version mismatch→409 STALE_VERSION. |
| Dependencies & Reuse | Workflow engine (4-eyes), KMS, notification, M10/M11 consumers (disbursement gate owned by M10), audit. |
| Test Guidance | Unit: IFSC validator, one-primary invariant. Security: SOD, token secrecy. Integration: approval→effective; M10 reads only verified primary; **assert M01 never sets a payroll block**. E2E: 4-eyes flow. |

---

### FR-EPM-009 — Profile Photo & Isolated Biometric Reference Management — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee upload → M02/approval); HR Admin (biometric)
- **User Story:** *As an HR Officer, I want to manage profile photos for identity/ID cards and, as a
  separately-consented purpose, an opaque biometric reference for attendance, so that each is handled
  lawfully and the two are never conflated.*

**Description:** Upload/replace/approve profile photos (binary in M13, metadata in `employee_photos`,
`processing_purpose=IDENTITY_DISPLAY`), enforce one primary; and — as a **distinct, separately-consented
purpose** (`BIOMETRIC_ATTENDANCE`) — store only an **opaque `biometric_template_ref`** with its own
consent (`consent_records`), restricted role (HR Admin), and retention (`retention_until`). **No raw
biometric template is ever stored in M01** (improvement #3/R1).

**Acceptance Criteria:**
1. Photo binary uploaded to M13 first; M01 stores `document_id`, dimensions, type,
   `processing_purpose=IDENTITY_DISPLAY`.
2. Allowed formats JPEG/PNG; max 5 MB; min 300×300; face-detected (advisory) on upload.
3. Exactly one `is_primary=true` PROFILE photo; setting new primary demotes prior.
4. Self-uploaded photos enter `PENDING`; require HR approval before becoming primary.
5. **Biometric reference requires a valid GRANTED `consent_records` row for `BIOMETRIC_ATTENDANCE`;**
   without it the write is rejected. Withdrawal of consent disables further biometric use and triggers
   retention-based deletion of the reference.
6. Biometric processing is HR-Admin-only, audited, and isolated from the identity photo lifecycle.
7. Replacing a photo retains prior versions (M13 versioning).

**Business Rules:**
- ID-card photo must meet stricter dimension/background rules (configurable).
- Biometric reference changes are audited and restricted to HR Admin; no facial auth against Aadhaar.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_photos` | CRUD | document_id, processing_purpose, biometric_template_ref, consent_id |
| `consent_records` | SELECT/INSERT | BIOMETRIC_ATTENDANCE consent |
| `documents` (M13) | reference | binary + versions |
| `employees.primary_photo_id` | UPDATE | denormalised pointer |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}/photos` | upload (returns pending) |
| POST | `/api/v1/photos/{photoId}:approve` | approve → primary |
| POST | `/api/v1/employees/{id}/biometric-ref` | set opaque biometric ref (consent-gated) |
| GET | `/api/v1/employees/{id}/photo` | resolve current primary URL |

**UI Behavior Notes:** Drag-drop upload with crop; pending overlay; approve/reject; avatar fallback to
initials; **separate biometric panel (HR Admin) that shows consent status and blocks if not consented.**

**Edge Cases:** oversized/wrong format; no face detected (warn); replacing primary while pending; M13
upload failure (rollback metadata); biometric set without consent (reject); consent withdrawn (disable +
schedule deletion).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `PhotoUploader` (crop), pending overlay, approve/reject, **`BiometricPanel`** (Admin, consent-gated), avatar fallback. |
| Backend-Service Flow | Photo: upload→M13→insert PENDING→approve sets primary + updates employees.primary_photo_id. Biometric: check GRANTED consent → store opaque ref + retention_until; on withdrawal disable + schedule deletion. |
| Data Operations | INSERT/UPDATE employee_photos; UPDATE employees.primary_photo_id; consent lookup; M13 reference; audit. |
| Validation Logic | Format/size/dimension; one-primary invariant; approval gate; **consent presence for biometric**. |
| Authorization Logic | HR write; self-upload→PENDING; biometric HR Admin only + consent. |
| State Changes & Side Effects | PENDING→APPROVED→primary; prior primary demoted; biometric ref lifecycle tied to consent; advisory completeness recompute. |
| Failure Handling | Bad file→400; M13 failure→rollback metadata; approve nonexistent→404; biometric w/o consent→403 CONSENT_REQUIRED; concurrent primary→409 STALE_VERSION. |
| Dependencies & Reuse | M13 storage/versioning, image-validation, consent (FR-020), retention (FR-021), audit. |
| Test Guidance | Unit: validation rules; consent gate. Integration: M13 upload+rollback; consent-withdrawal deletion. E2E: upload→approve→primary; biometric blocked without consent. |

---

### FR-EPM-010 — Position Management & Org-Chart Placement (effective-dated positions) — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (Dept Head approve; Reporting Manager recommend)
- **User Story:** *As an HR Admin, I want formal sanctioned positions whose own attributes are
  effective-dated, and effective-dated placement of employees into them, so that the org chart,
  vacancies, reporting lines, and Pay-Commission history are always reconstructable.*

**Description:** Manages `positions` and their **effective-dated history (`position_history`)** —
pay_scale, title, reports_to, sanctioned_count, status all versioned (improvement #9/R9) — and places
employees via effective-dated `employee_job_assignments`. Renders an interactive org chart; computes
vacancies; keeps the denormalised current placement on `employees` in sync **via explicit service-layer
logic inside the transaction (no DB trigger)** (improvement #16/R12). M05/M06 placements are recorded
here as new assignments.

**Acceptance Criteria:**
1. A position has a sanctioned count; `is_vacant`/filled computed from active assignments.
2. Placing an employee creates a new assignment row; any prior current assignment is closed
   (`effective_to` = new `effective_from` − 1 day) — no overlaps.
3. The denormalised `employees.designation_id/org_unit_id/reporting_manager_id` always equal the current
   assignment, kept in sync **in the service layer within the same tx** (no trigger); back-dated
   corrections deterministically recompute the current row.
4. **Every change to a position's pay_scale/title/reports_to/sanctioned_count/status writes a
   `position_history` row** with `effective_from/to` and `change_reason`; no overlaps.
5. Org chart renders hierarchy from `positions.reports_to_position_id` + current assignments; **as-of a
   date uses `position_history`** for historical reporting structure.
6. Placement beyond sanctioned strength blocked unless an approved over-strength override (with reason).
7. Assignment and position-history changes emit `PLACEMENT_CHANGED` / `POSITION_CHANGED` via the outbox.

**Business Rules:**
- ABOLISHED/FROZEN positions cannot receive new placements.
- Additional-charge/officiating assignments may overlap a substantive one (typed differently) but only
  one SUBSTANTIVE current assignment is allowed.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `positions` | CRUD | code, strength, reports_to, status (current cache) |
| `position_history` | INSERT | effective-dated position attributes |
| `employee_job_assignments` | INSERT/UPDATE | effective dating, type |
| `employees` | UPDATE | denormalised current placement (service-layer) |
| `outbox_events` | INSERT | PLACEMENT_CHANGED / POSITION_CHANGED |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/positions` | manage positions (writes also append position_history) |
| GET | `/api/v1/positions/{id}/history` | position attribute history |
| POST | `/api/v1/employees/{id}/assignments` | place / change assignment |
| GET | `/api/v1/org-chart?rootOrgUnit={id}&asOf=YYYY-MM-DD` | org-chart tree (as-of supported) |
| GET | `/api/v1/positions/vacancies` | vacancy report |

**UI Behavior Notes:** Interactive org chart (zoom/pan/collapse, as-of slider), drag-to-reassign with
confirmation, vacancy heatmap, position detail drawer with **history timeline**, effective-date picker.

**Edge Cases:** over-strength placement; overlapping substantive assignments; placing into ABOLISHED
position; back-dated assignment crossing prior rows; circular reports_to; Pay-Commission mass revision
(bulk position_history insert); concurrent edits (row_version).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `OrgChart` (tree, as-of), `PositionDrawer` (+history), `AssignmentForm`, vacancy heatmap, over-strength override modal. |
| Backend-Service Flow | `PositionService`: any attribute change → close prior position_history row + insert new + update positions cache, in tx. `AssignmentService`: place→validate strength/status→close prior current→insert new→**service-layer sync of employees denorm fields**→emit outbox, all in tx. |
| Data Operations | CRUD positions + INSERT position_history; INSERT assignment + close prior; UPDATE employees denorm (explicit); outbox; audit. |
| Validation Logic | Strength check; one-substantive-current invariant; no overlap (exclusion constraints on assignments and position_history); status gate; cycle detection; row_version. |
| Authorization Logic | HR Admin write; Dept Head approves over-strength; Reporting Manager recommend-only. |
| State Changes & Side Effects | New current assignment; position_history version; denorm sync (service-layer); vacancy recompute; PLACEMENT_CHANGED/POSITION_CHANGED outbox; notify. |
| Failure Handling | Over-strength→409 OVER_STRENGTH (or override); overlap→409; abolished→409 POSITION_INACTIVE; cycle→400; version mismatch→409 STALE_VERSION. |
| Dependencies & Reuse | M05/M06 callers, outbox producer, org_units/designations masters, audit; FR-011 as-of reads position_history. |
| Test Guidance | Unit: overlap/one-substantive invariants, cycle detection, position_history versioning. Integration: service-layer denorm sync under back-dated correction (no trigger); Pay-Commission bulk revision. E2E: drag-reassign; vacancy update; as-of org chart. |

---

### FR-EPM-011 — Effective-Dated Attributes (incl. core person attributes) & Point-in-Time View — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Auditor (RO)
- **User Story:** *As an auditor, I want to see exactly what an employee's job, org, position, and key
  person attributes (name, gender, category, DOB, disability, religion, marital status) were on any past
  date, so that pension, seniority, reservation-roster, and disputes can be resolved against the record
  as it stood.*

**Description:** Provides a point-in-time ("as-of") reconstruction across **all** effective-dated
data — `employee_job_assignments`, `employee_addresses`, **`employee_attribute_history` (the unified
core-person-attribute spine, improvement #7/R5)**, and **`position_history`** — plus a chronological
change-history timeline. The single attribute-history mechanism replaces the v1 asymmetry where person
attributes were overwritten. Reads only; it does not bypass M02 or the governed-change workflow (FR-022).

**Acceptance Criteria:**
1. Given an `asOf` date, the API returns the assignment/address/position **and the core person
   attributes** active on that date (e.g. the surname/category as it legally stood).
2. A change-history timeline lists every effective-dated change (job, attribute, position) with reason,
   source, gazette_ref, and actor.
3. Future-dated changes are visible but clearly marked as scheduled.
4. Corrections are recorded as new versions; nothing is overwritten.
5. The view reconciles to audit_log entries for the same period.

**Business Rules:**
- "As-of" defaults to today; auditors may query any date within retention.
- Core attribute changes are written **only** via FR-001 (hire seed), M02 commit, migration, or the
  governed-change workflow (FR-022) — never by a raw column update (§5.6 r20).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_job_assignments` | SELECT (as-of) | effective_from/to |
| `employee_attribute_history` | SELECT (as-of) | attribute_path, effective_from/to |
| `position_history` | SELECT (as-of) | position attributes |
| `employee_addresses` | SELECT (as-of) | valid_from/to |
| `audit_log` | SELECT | change reconciliation |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/as-of?date=YYYY-MM-DD` | point-in-time snapshot (incl. attributes) |
| GET | `/api/v1/employees/{id}/history?attribute=last_name\|category\|assignment` | change timeline |

**UI Behavior Notes:** Date slider/picker re-renders the profile "as it was" including name/category;
timeline with reason chips, gazette refs, and source-module tags; scheduled future changes with a clock
icon.

**Edge Cases:** as-of before DOJ (empty/illegal); as-of within a gap (no active assignment); future
date; overlapping correction versions; a name change effective mid-career (surname differs at as-of).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `AsOfDatePicker`, point-in-time profile render (attrs + job + position), `ChangeTimeline` with reason/gazette/source chips, scheduled markers. |
| Backend-Service Flow | `PointInTimeService.snapshot(id, asOf)` selects rows where asOf ∈ [from,to] across assignments, attribute_history, position_history, addresses; timeline aggregates versions ordered by effective_from. |
| Data Operations | Range SELECTs on effective-dated tables; audit_log correlation. |
| Validation Logic | asOf bounds (≥ DOJ, ≤ retention horizon); gap detection. |
| Authorization Logic | Read per role/scope; auditor full read; field-access masking applies to attribute values. |
| State Changes & Side Effects | None (read-only). |
| Failure Handling | asOf < DOJ→400 OUT_OF_RANGE; no active row→explicit "no assignment" state. |
| Dependencies & Reuse | Field-access engine (FR-013), attribute-history spine (this FR + FR-022), position_history (FR-010), audit. |
| Test Guidance | Unit: as-of selection across boundaries for attributes + position. Integration: timeline ordering with corrections + gazette refs. E2E: date slider reconstructs name/category history. |

---

### FR-EPM-012 — Configurable Profile Sections & Custom Fields *(Phase 2 — deferred)*

- **Module:** M01-EPM
- **Primary Role(s):** System Administrator (HR Admin proposes)
- **User Story:** *As a System Administrator, I want to configure profile sections and custom fields
  without code, so that departments can capture organisation-specific attributes safely.*

> **Phasing note (improvement #22 / Clash 2):** the statutory field set is fixed at launch and there is
> one tenant, so the **dynamic-form engine is deferred to Phase 2**. The schema (E14–E16) is created
> empty in v1; this FR ships its UI/engine in Phase 2. Specified here for completeness and forward
> compatibility.

**Description:** Manages `profile_sections`, `custom_field_definitions`, and value storage in
`employee_custom_field_values`. Typed fields, required flags, validation regex, conditional applicability
by employment type, PII flagging (auto-creates a default field-access policy), and ordering. The 360°
view and forms render dynamically from this config.

**Acceptance Criteria:**
1. Admin can create/enable/disable sections and fields; system sections cannot be deleted.
2. Each field has a data type and validations enforced on UI and server.
3. Marking a field `is_pii=true` requires/creates a default `field_access_policies` entry.
4. Disabling a field hides it from forms but retains stored values (no data loss).
5. Required custom fields participate in advisory completeness scoring.
6. Field definition changes are versioned/audited; existing values are not silently dropped.

**Business Rules:**
- A field's data type cannot change once values exist (must create a new field).
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
employee view. *(Phase 2 surface.)*

**Edge Cases:** type change with existing data (blocked); duplicate field_key; required field added
retroactively (existing profiles flagged advisory-incomplete); deleting a system section (blocked).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `SectionConfig`, `CustomFieldBuilder`, `DynamicFieldRenderer` (Phase 2). |
| Backend-Service Flow | `ConfigService` CRUD with versioning; PII flag triggers default policy; `CustomValueService` validates against def and stores typed column. |
| Data Operations | CRUD config tables; UPSERT values; INSERT default field_access_policy; audit. |
| Validation Logic | Type integrity (no change with values); regex/required; unique field_key; type-correct storage. |
| Authorization Logic | System Admin config; HR Admin proposes; value writes follow normal employee edit auth (self→M02). |
| State Changes & Side Effects | New fields appear in forms; advisory completeness recompute; default policy created. |
| Failure Handling | Type change with data→409 TYPE_LOCKED; dup key→409; system delete→403. |
| Dependencies & Reuse | Field-access engine (FR-013), advisory completeness (FR-014), audit, dynamic renderer. |
| Test Guidance | Unit: type/validation enforcement. Integration: PII→policy creation; disable retains data. E2E (Phase 2): add field→renders→value captured. |

---

### FR-EPM-013 — Field-Level PII Access Control, Hardened Break-Glass & Data Privacy — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** System Administrator (config, DPO sign-off); enforced for all readers
- **User Story:** *As a privacy officer (DPO), I want every PII field governed by a role-based access
  policy with masking and **hardened, rate-limited, anomaly-detected break-glass**, so that we comply
  with DPDP and a single operator cannot quietly exfiltrate thousands of Aadhaar/bank numbers.*

**Description:** Implements `field_access_policies` resolution applied server-side to every read
(FULL/MASKED/HIDDEN per field per role), and **hardened break-glass** (improvement #10/R7): each reveal
is recorded in `break_glass_reveals` with per-user/per-window **volume caps**, **anomaly detection**,
**real-time DPO alerting** on threshold crossing (not a daily digest), and **optional 4-eyes** for bulk
or special-category reveals. Restricted-read auditing is **async** (improvement #14/R10). Self-visibility
control and fail-closed default retained. This is the enforcement layer the 360° view (FR-002) and
consumption API (FR-019) both call. **(Correct cross-reference: field-level access is FR-EPM-013, fixing
the v1 §3/§4.3 mis-citation of FR-012 — improvement #22/R18.)**

**Acceptance Criteria:**
1. Every PII field has at least one policy; absence defaults to HIDDEN (fail-closed).
2. Reads return values masked/hidden per the caller's resolved policy; tokens/raw never returned.
3. `requires_reason=true` fields prompt for and persist a break-glass reason on each reveal into
   `break_glass_reveals`.
4. **Volume cap:** when a user exceeds `break_glass_window_cap` (default 25 special-category reveals /
   24 h) further reveals return `RATE_LIMITED` 429 until DPO clearance.
5. **Anomaly detection:** a per-user reveal-rate z-score above threshold raises a **real-time** alert to
   the DPO and may auto-open a `breach_incidents` record.
6. **Optional 4-eyes:** bulk reveals or `is_special_category` fields can require a second approver
   (`four_eyes_approver_id`).
7. `is_self_visible` controls whether the data subject sees their own value.
8. Restricted-PII reads and reveals are written to `audit_log` **via the async sink**; never block the
   hot path.
9. Policy changes take effect immediately (short-TTL resolved-policy cache invalidated).

**Business Rules:**
- Special-category data (religion, social category, disability, biometric) defaults HIDDEN except
  explicitly granted roles; reveals always 4-eyes-eligible and rate-limited.
- Auditor reads are always (async) logged; masking still applies unless FULL granted.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `field_access_policies` | CRUD | field_path, role, level, requires_reason, requires_four_eyes, cap |
| `break_glass_reveals` | INSERT | actor, field, reason, window_count, anomaly_score |
| `breach_incidents` | INSERT (auto) | on anomaly threshold |
| `audit_log` (async sink) | INSERT | PII_READ with reason |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/config/field-access-policies` | manage policies (DPO sign-off) |
| POST | `/api/v1/employees/{id}/reveal-field` | hardened break-glass reveal (reason, cap, anomaly) |
| GET | `/api/v1/config/field-access-policies/resolve?role=` | preview resolution |
| GET | `/api/v1/privacy/break-glass-activity` | DPO monitoring feed |

**UI Behavior Notes:** Policy matrix editor (field × role → level + reason + 4-eyes + cap); locked-field
UI with reveal prompt; **"reveals remaining in window" indicator**; 4-eyes approval modal for special-
category; DPO real-time alert console.

**Edge Cases:** field with no policy (HIDDEN); conflicting policies (most-restrictive wins); reveal
without reason (blocked); self viewing a self-hidden field; cap exhausted; anomalous burst (alert +
auto-incident); 4-eyes approver = revealer (blocked).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `PolicyMatrixEditor`, masked-field component, reveal-with-reason/4-eyes modal, reveals-remaining indicator, DPO alert console. |
| Backend-Service Flow | `FieldAccessResolver.resolve(field, role, isSelf)` → level (cached); reveal endpoint: check reason → check window cap (count `break_glass_reveals`) → compute anomaly z-score → optional 4-eyes → INSERT `break_glass_reveals` + enqueue async audit + (if threshold) real-time DPO alert + auto `breach_incidents` → return single field. |
| Data Operations | CRUD policies; resolution cache; INSERT break_glass_reveals; async audit; conditional breach_incidents INSERT. |
| Validation Logic | Unique (field_path, role); valid level enum; reason required; cap; 4-eyes maker≠approver. |
| Authorization Logic | Config = System Admin + DPO sign-off; enforcement on every reader; default fail-closed. |
| State Changes & Side Effects | Policy change invalidates cache; reveal ledgered; threshold → real-time alert + possible incident. |
| Failure Handling | No policy→HIDDEN; reveal w/o reason→400 REASON_REQUIRED; over cap→429 RATE_LIMITED; unknown field_path→400; 4-eyes self→403. |
| Dependencies & Reuse | Consumed by FR-002, FR-007, FR-019, FR-016; async audit sink; breach workflow (FR-020); cache layer. |
| Test Guidance | Unit: resolution matrix incl. most-restrictive + fail-closed. Security: token never leaks; reveal logged; **cap enforced; anomaly alert fires; bulk reveal needs 4-eyes**. Integration: policy change immediacy; async audit. E2E: masked vs revealed per role; cap exhaustion. |

---

### FR-EPM-014 — Profile Completeness Scoring & Data Quality Validation (advisory only) — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, Employee (own nudges)
- **User Story:** *As an HR Officer, I want each profile scored for completeness and validated for data
  quality so I can target gaps — **without that score ever withholding anyone's salary**.*

**Description:** Computes a weighted completeness score per section and overall, detects data-quality
issues (missing required, format anomalies, cross-field inconsistencies, under-qualification, unverified
statutory IDs, **expiring category/PwD certificates from FR-023**), stores results in
`employee_profile_completeness`, and drives **nudges only**. **Critical v2 change (improvement #6/R3):
completeness/DQ is advisory and NEVER gates payroll or any disbursement.** The `data_quality_flag` enum
no longer contains a payroll-blocking value (`CLEAN/REVIEW/NEEDS_ATTENTION`); disbursement-readiness is
owned by M10 as `NO_VERIFIED_BANK` with a cheque fallback. **Phasing note:** v1 ships a **single fixed
weighting**; configurable weighting is deferred to Phase 2 (improvement #22).

**Acceptance Criteria:**
1. Overall and per-section scores (0–100) computed using the **fixed default weighting** (Appendix C).
2. Missing required fields and DQ issues enumerated with codes/messages (drive nudges, not blocks).
3. `data_quality_flag` set to CLEAN/REVIEW/NEEDS_ATTENTION; **no value gates payroll or any downstream
   write**.
4. Score recomputes on each relevant write (event-driven) and nightly batch reconciliation.
5. Employees see their own completeness ring and a prioritised "complete your profile" checklist.
6. HR sees an org-level completeness/DQ dashboard feed (consumed by M14).
7. Expiring/expired category or PwD certificates (FR-023) surface as DQ items + nudges (not blocks).

**Business Rules:**
- **No completeness/DQ state may block payroll, pension, or any module operation.** (Hard rule; tested.)
- Required-field set is configuration-driven per employment type; **weighting is fixed in v1** (Phase 2
  makes it configurable).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_profile_completeness` | UPSERT | scores, issues, flag (advisory) |
| `employees` | UPDATE | cached pct + advisory dq flag |
| `employee_certificates` | SELECT | expiry feeds DQ |
| `custom_field_definitions` | SELECT | required custom fields (Phase 2) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/completeness` | score + checklist |
| POST | `/api/v1/employees/{id}/completeness:recompute` | force recompute |
| GET | `/api/v1/completeness/summary?orgUnit=` | org rollup |

**UI Behavior Notes:** Completeness ring + checklist with deep links to the relevant section; DQ issue
badges; org dashboard tiles; "fix now" CTAs. **No "blocked from payroll" messaging anywhere.**

**Edge Cases:** weighting (fixed) recompute-all on rule change; required field added (flags many as
advisory); conflicting cross-field rule; separated/archived employees excluded from active rollups;
expiring certificate.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `CompletenessRing`, `ChecklistPanel` with deep links, DQ badges, org dashboard feed. |
| Backend-Service Flow | `CompletenessEngine.compute(employee)` applies fixed weighting + DQ rule set (incl. certificate expiry) → UPSERT snapshot + update cached fields; triggered by domain events and nightly batch. **No code path emits a payroll block.** |
| Data Operations | UPSERT completeness; UPDATE employees cache; read config + certificates; emit M14 feed. |
| Validation Logic | Required-set per employment type; format/cross-field DQ; threshold→advisory flag mapping. |
| Authorization Logic | Self sees own; HR sees scope; recompute = HR/Admin or system. |
| State Changes & Side Effects | Advisory DQ flag changes; nudge notifications; M14 metrics. **No downstream block.** |
| Failure Handling | Engine error→retain prior snapshot + alert; config invalid→reject. |
| Dependencies & Reuse | Triggered by all write FRs; FR-023 certificates; consumed by M14; notification. **M10 does NOT read this flag for gating.** |
| Test Guidance | Unit: scoring + DQ rules + thresholds. **Regression: assert no completeness/DQ state can block payroll (negative test).** Integration: event-driven recompute; certificate expiry → DQ. E2E: checklist deep links; ring updates after edit. |

---

### FR-EPM-015 — Duplicate Detection & Alias-Based Deduplication — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (resolve/merge, 4-eyes)
- **User Story:** *As an HR Admin, I want the system to detect and merge duplicate employee records into
  one golden record **without ever reaching into other modules' tables**, so identity resolution stays
  inside the bounded context and is safely reversible.*

**Description:** Runs deterministic + probabilistic matching (exact PAN; Aadhaar via vault
`hash_for_dedup`; **phonetic/transliteration name+DOB+contact via FR-025**) at create time, on identity
writes, and as a batch sweep; queues `dedup_candidates`; provides a guided merge that **consolidates
only M01 satellites, soft-deletes the loser, writes an `employee_id_aliases(loser_id → survivor_id)`
row, and emits `RECORDS_MERGED{survivor_id, loser_id}` on the change feed.** **No foreign keys in
M10/M11/M12 or any other module are ever re-pointed by M01** (improvement #1/R2). Consumers resolve
identity through the alias table (the consumption API does this transparently). Reversible within a
window via the alias `merge_snapshot`.

**Acceptance Criteria:**
1. Exact statutory-ID match (PAN unique; Aadhaar vault hash) → HIGH score (≥ 90); fuzzy composite
   (phonetic name + DOB + contact, FR-025) scored 0–100 with matched attributes.
2. HIGH match at create blocks auto-create and routes to review (FR-001 AC3).
3. **Merge consolidates all M01 satellites under the surviving `employee_id`, soft-deletes the loser,
   and writes one `employee_id_aliases` row** (transactional, audited, 4-eyes). **It does NOT update any
   other module's references.**
4. The merge emits `RECORDS_MERGED` (tombstone for loser) on the change feed; **all consumers resolve
   `loser_id → survivor_id` via the alias** (and the consumption API returns the survivor automatically).
5. Merge is reversible within a configurable window (default 7 days) by restoring from `merge_snapshot`
   and setting `is_reversed=true`; the alias makes undo safe even after downstream consumption (the
   feed re-emits resolution).
6. Dismissed candidates are not re-raised for the same pair unless attributes change.
7. A `RECORDS_MERGED` SR event is emitted to M12 via the outbox.

**Business Rules:**
- Only HR Admin may execute a merge; **maker ≠ checker (4-eyes mandatory)**.
- Merging may not combine records with conflicting ACTIVE statutory states without explicit override.
- **Merge-undo UI beyond the alias mechanism is Phase 2** (improvement #22); the alias + snapshot undo
  ships in v1.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `dedup_candidates` | CRUD | score, attributes, status |
| `employee_id_aliases` | INSERT/UPDATE | loser→survivor, snapshot, window |
| `employees` + satellites | UPDATE/MOVE | consolidate to survivor; soft-delete loser **(M01-owned only)** |
| `outbox_events` | INSERT | RECORDS_MERGED (tombstone) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/dedup/scan` | run batch detection (phonetic-aware) |
| GET | `/api/v1/dedup/candidates` | review queue |
| POST | `/api/v1/dedup/candidates/{id}:merge` | merge (4-eyes; alias written) |
| POST | `/api/v1/dedup/candidates/{id}:dismiss` | not a duplicate |
| POST | `/api/v1/dedup/merges/{aliasId}:undo` | reverse within window |
| GET | `/api/v1/employees/{id}/resolve` | resolve alias → survivor id |

**UI Behavior Notes:** Side-by-side comparison with field-level "keep" selectors; match-score and
matched-attributes (incl. phonetic) display; merge preview; 4-eyes approval; undo banner during the
reversal window.

**Edge Cases:** three-way duplicates (resolve pairwise, chained aliases collapse to ultimate survivor);
merge with conflicting bank/nominee data (field-level choose); **undo after downstream consumption (safe
via alias re-emit)**; dismissed pair re-matching; request for a merged loser id (resolve to survivor).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `DedupQueue`, `MergeCompareView` (side-by-side field selectors), merge preview, 4-eyes panel, undo banner. |
| Backend-Service Flow | `DedupEngine.match()` (deterministic + FR-025 phonetic) → upsert candidates; `MergeService.merge(survivor, loser, picks)` in tx: move/keep **M01 satellites**, soft-delete loser, INSERT `employee_id_aliases` with snapshot, emit RECORDS_MERGED outbox. **No cross-module writes.** `undo` restores snapshot + flags alias reversed + re-emits. |
| Data Operations | CRUD candidates; UPDATE **M01-owned** satellites only; INSERT alias + snapshot; soft-delete; outbox; audit. |
| Validation Logic | Score thresholds; conflicting-state guard; field-pick completeness; dismissed-pair suppression; maker≠checker. |
| Authorization Logic | HR Admin merge; mandatory 4-eyes; auditor read. |
| State Changes & Side Effects | Loser retired + aliased; survivor enriched; RECORDS_MERGED feed event (tombstone); consumers re-resolve; undo snapshot. |
| Failure Handling | Partial merge→full rollback; conflicting active states→409 MERGE_CONFLICT (override path); undo after window→409 UNDO_EXPIRED; maker=checker→403 SOD_VIOLATION. |
| Dependencies & Reuse | FR-001/FR-007 (triggers), FR-025 (matcher), outbox/change-feed (FR-019), audit. **Explicitly NOT M10/M11/M12 schemas.** |
| Test Guidance | Unit: scoring, threshold gating, chained-alias collapse. Integration: transactional merge writes alias + tombstone; **assert zero writes to non-M01 tables**; undo restore + re-emit. E2E: review→4-eyes merge→consumer resolves survivor→undo. |

---

### FR-EPM-016 — Employee Self-Service Profile Read View

- **Module:** M01-EPM
- **Primary Role(s):** Employee (Self-Service)
- **User Story:** *As an employee, I want to view my own complete profile, exercise my data-principal
  rights, and request corrections, so that I can confirm my data is accurate and initiate fixes.*

**Description:** A self-service, read-only projection of the employee's own 360° profile honouring
`is_self_visible` policies, with "request change" actions that create M02 edit requests (no direct
writes), **data-principal rights entry points that create FR-020 requests** (access/correction/erasure/
export/consent-withdrawal/grievance), a download-my-data export, and the completeness checklist.

**Acceptance Criteria:**
1. The employee sees their own data per self-visibility policies.
2. All edit affordances create an M02 request; the self-service view never writes master data directly.
3. The employee can download a machine-readable copy of their own profile (DPDP data-portability).
4. **Data-principal rights buttons create `data_principal_requests` (FR-020) with SLA tracking.**
5. Completeness checklist with deep links is shown (advisory).
6. Pending M02 requests and pending rights requests are visible with status.

**Business Rules:**
- Self-service restricted to the authenticated employee's own `employee_id` (strict row scope).
- Sensitive fields may be self-hidden per policy.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_profile_read_model` | SELECT (self) | self-visible projection |
| `workflow_instances` (M02) | SELECT/INSERT | pending / new requests |
| `data_principal_requests` | INSERT/SELECT | rights requests |
| `audit_log` (async) | INSERT | self read + export |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me/profile` | own 360° (self-visible) |
| POST | `/api/v1/me/change-requests` | create M02 edit request |
| POST | `/api/v1/me/rights-requests` | create FR-020 data-principal request |
| GET | `/api/v1/me/profile/export` | DPDP data export |
| GET | `/api/v1/me/requests` | track edit + rights requests |

**UI Behavior Notes:** Clean read-only profile with "request change" buttons per editable field; **a
"My Privacy & Rights" panel** (access/correction/erasure/export/withdraw consent/grievance); pending
chips; completeness ring; mobile-first responsive.

**Edge Cases:** employee with no login (cannot access); self-hidden field; large profile export;
attempting to view another employee (hard 403); erasure request blocked by legal hold (shows reason).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `MyProfile` (read-only), request-change buttons, `MyRightsPanel`, pending chips, export, completeness ring. |
| Backend-Service Flow | `SelfServiceController` binds to token employee_id; reads via FieldAccessResolver isSelf=true; change-request→M02; rights-request→FR-020; export builds portable JSON. |
| Data Operations | SELECT self projection; INSERT M02 request; INSERT data_principal_request; async audit. |
| Validation Logic | Strict self-scope; self-visibility; export rate-limit. |
| Authorization Logic | Token employee_id must equal target; mismatch→403; no write paths to master. |
| State Changes & Side Effects | M02 + rights requests created; export logged; no master mutation. |
| Failure Handling | No login→403; cross-employee→403; export throttle→429. |
| Dependencies & Reuse | FR-013 (field access), FR-020 (rights), M02 workflow, FR-014 (advisory), async audit. |
| Test Guidance | Unit: self-scope binding. Security: cannot read others. Integration: change-request→M02; rights-request→FR-020. E2E: view→request→track; export; erasure-blocked-by-hold message. |

---

### FR-EPM-017 — Bulk Import & Data Migration (PROVISIONAL/QUARANTINE state) — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (commit), HR Officer (staging), System Admin
- **User Story:** *As an HR Admin, I want to import thousands of legacy paper-service-book records with a
  realistic validation profile, committing imperfect-but-usable rows as PROVISIONAL into a remediation
  queue, so that migration is accurate, auditable, and never stalls for months on hard rejects.*

**Description:** A two-phase (validate → commit) bulk importer with **two validation profiles**
(improvement #11/R8): `STRICT` (full rules) and **`MIGRATION` (relaxed: nullable-during-migration core
fields, age/CHECK relaxed)**. Rows that fail STRICT but pass MIGRATION are committed as
**`record_state=PROVISIONAL`** — login-disabled, advisory DQ-flagged, and placed in a **manual
remediation queue** — instead of being rejected. Only truly unrecoverable rows are ERROR. Replaces the
unrealistic "99.5% VALID on pass 1–2" target with a staged glide path (§13).

**Acceptance Criteria:**
1. Upload accepts the versioned template (CSV/XLSX); file stored in M13; batch created with a chosen
   `validation_profile`.
2. Validation runs field rules; each row marked **VALID / PROVISIONAL / ERROR** with field-level
   messages. PROVISIONAL = committable under MIGRATION with known gaps.
3. A downloadable report lists VALID, PROVISIONAL (with gaps), and ERROR rows; each subset can be
   committed independently.
4. Commit is idempotent per batch and transactional per chunk; partial failures roll back the chunk.
5. **PROVISIONAL rows are created with `record_state=PROVISIONAL`, login disabled, and a
   `remediation_state=QUEUED`;** they are excluded from active rollups and from self-service until
   remediated to `ACTIVE`.
6. Dedup matches during import route to candidate review (FR-015), not silent duplicate creation.
7. Each committed record emits `PROFILE_CREATED` via outbox and computes advisory completeness.
8. The whole batch is reversible (ROLLED_BACK) within a window if not yet consumed.

**Business Rules:**
- Migrated records carry `source_system`/`legacy_id`.
- Template version mismatch blocks the import with a clear message.
- A PROVISIONAL record is **promoted to ACTIVE** only when the remediation queue resolves its missing
  mandatory fields (DOB/DOJ/etc.), at which point STRICT constraints are enforced.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_import_batches` | CRUD | status, counts, validation_profile |
| `import_staging_rows` | CRUD | raw_payload, validation_status, remediation_state |
| `employees` + satellites | INSERT (commit, maybe PROVISIONAL) | created records |
| `outbox_events` | INSERT | PROFILE_CREATED per row |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/imports?profile=STRICT\|MIGRATION` | upload file → create batch |
| POST | `/api/v1/imports/{batchId}:validate` | run validation |
| GET | `/api/v1/imports/{batchId}/report` | valid/provisional/error report |
| POST | `/api/v1/imports/{batchId}:commit` | commit valid + provisional rows |
| GET | `/api/v1/remediation-queue?state=QUEUED` | PROVISIONAL remediation worklist |
| POST | `/api/v1/employees/{id}:promote-active` | promote PROVISIONAL→ACTIVE after fix |
| POST | `/api/v1/imports/{batchId}:rollback` | reverse within window |

**UI Behavior Notes:** Upload with template download and profile selector; validation progress; results
grid (valid/**provisional**/error filters) with inline reasons; commit confirmation with counts;
**remediation worklist** with "fix & promote" actions; rollback action.

**Edge Cases:** template mismatch; huge file (chunked async); mixed valid/provisional/error; dedup hits;
re-upload (idempotency); rollback after downstream consumption; promote-active before all gaps fixed
(blocked).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `ImportWizard` (profile selector), template download, validation progress, results grid (3 states), `RemediationQueue`, commit + rollback. |
| Backend-Service Flow | Upload→M13→create batch; async `ImportValidator` parses→staging→apply profile rules (STRICT/MIGRATION)→mark VALID/PROVISIONAL/ERROR + dedup; `ImportCommitter` chunks valid+provisional rows in tx creating employee graph (PROVISIONAL rows login-disabled) + outbox; `promote-active` re-validates under STRICT then flips record_state. |
| Data Operations | INSERT batch/staging; bulk INSERT employees + satellites + assignments + attribute_history; outbox; audit; rollback soft-deletes. |
| Validation Logic | Template version; profile-scoped rules; dedup; chunk idempotency keys; promote re-validation under STRICT. |
| Authorization Logic | HR Officer stages; HR Admin/System Admin commits; org-scope on created records. |
| State Changes & Side Effects | Batch lifecycle; employees created (some PROVISIONAL, login-disabled, queued); SR events; advisory completeness; reversible window. |
| Failure Handling | Template mismatch→400; chunk failure→chunk rollback + report; commit replay→idempotent skip; rollback expired→409 UNDO_EXPIRED; promote with gaps→409. |
| Dependencies & Reuse | M13 (file), dedup engine (FR-015), FR-025 (phonetic), advisory completeness (FR-014), outbox, async job runner, audit. |
| Test Guidance | Unit: profile rule sets, idempotency keys, promote re-validation. Integration: PROVISIONAL commit (login disabled, queued) + dedup routing. E2E: upload→validate(MIGRATION)→commit provisional→remediate→promote-active. |

---

### FR-EPM-018 — Profile Lifecycle: Deactivation, Reactivation & Archival — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (approve), HR Officer (initiate), Dept Head / SR Custodian
- **User Story:** *As an HR Admin, I want to deactivate a profile on separation, archive it per the
  retention schedule, and where lawful reactivate on rehire, so that access, payroll, the service
  register, and retention all reflect the true state.*

**Description:** Manages `employment_status` transitions on separation (RETIRED/RESIGNED/TERMINATED/
DECEASED), closing the current job assignment, setting `separation_date`/`reason`, de-provisioning the
linked login, emitting `SEPARATION`/`DEATH` SR events via the outbox, supporting controlled reactivation
(rehire), and — new in v2 — transitioning `record_state` to **ARCHIVED** per FR-021 retention and to
**PURGE_PENDING** only when no legal hold blocks it. **DECEASED additionally triggers FR-024 succession.**

**Acceptance Criteria:**
1. Separation sets `employment_status` + `separation_date` + `separation_reason`, closes the current
   assignment, and is approved (maker ≠ checker).
2. The linked login is disabled on separation; self-service access ends.
3. A `SEPARATION` (and for DECEASED a `DEATH`) event is emitted via the outbox.
4. Post-separation, profile becomes read-only except HR-Admin corrections (with reason).
5. Reactivation (rehire) creates a new current assignment (reason `HIRE`), restores controlled access,
   emits `REACTIVATION`; prior history retained.
6. **On reaching its retention horizon (FR-021) the record transitions to `ARCHIVED`; purge is only
   possible when no ACTIVE `legal_holds` row exists (then `PURGE_PENDING`).**
7. **DECEASED triggers FR-024** (heir linkage + family-pension handoff to M11).

**Business Rules:**
- DECEASED separations trigger nominee/pension workflows downstream (M11) and lock self-service.
- Separation requires no open blocking obligations unless override (configurable).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` | UPDATE | status, separation_date/reason, record_state |
| `employee_job_assignments` | UPDATE | close current |
| `users` | UPDATE | disable login |
| `legal_holds` | SELECT | block purge |
| `outbox_events` | INSERT | SEPARATION/DEATH/REACTIVATION |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}:separate` | initiate separation |
| POST | `/api/v1/employees/{id}/separation:approve` | approve (maker≠checker) |
| POST | `/api/v1/employees/{id}:reactivate` | rehire / reactivate |
| POST | `/api/v1/employees/{id}:archive` | transition to ARCHIVED (retention) |

**UI Behavior Notes:** Separation form with reason, date, obligation checklist; approval step; status
badge changes; reactivation form gated by role; post-separation read-only watermark; archived badge.

**Edge Cases:** separation with open dues; back-dated separation; deceased with pending self requests;
reactivation of a TERMINATED record (policy-gated); double separation attempt; archive while legal hold
active (blocked).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `SeparationForm`, obligation checklist, approval panel, status/archived badges, reactivation form, read-only watermark. |
| Backend-Service Flow | `LifecycleService.separate()` → validate → maker (PENDING) → checker approves → tx{ update status + record_state, close assignment, disable user, outbox SEPARATION/DEATH }; DECEASED → invoke FR-024; `archive()` checks FR-021 horizon + no active hold. |
| Data Operations | UPDATE employees + assignment; UPDATE users; SELECT legal_holds; outbox; audit; downstream triggers (M11 for pension/death). |
| Validation Logic | Valid status transition (§10.1); maker≠checker; obligation/override; reactivation policy; hold check for archive/purge. |
| Authorization Logic | HR Officer initiate; HR Admin/Dept Head approve; SR Custodian for SR effect; DPO/Dept Head for purge sign-off (FR-021). |
| State Changes & Side Effects | Status + record_state transition; login disabled; SR event; self-service ends; pension/death downstream (FR-024); read-only mode. |
| Failure Handling | Invalid transition→409 INVALID_STATE; maker=checker→403 SOD; open dues w/o override→409 BLOCKING_OBLIGATIONS; archive under hold→409 LEGAL_HOLD_ACTIVE. |
| Dependencies & Reuse | State machine (§10), outbox, user provisioning, FR-024 (deceased), FR-021 (retention/hold), audit. |
| Test Guidance | Unit: transition guards; hold-blocks-purge. Integration: separation tx atomic; DECEASED→FR-024; archive horizon. E2E: separate→approve→read-only; rehire; archive blocked under hold. |

---

### FR-EPM-019 — Employee Master Consumption API + Change-Feed Backbone (SSOT) — *v2 revised*

- **Module:** M01-EPM
- **Primary Role(s):** Service principals of M02–M14 (machine), Auditor (RO)
- **User Story:** *As a developer of another module, I want a stable, access-controlled API and a
  well-specified change-feed backbone to read employee master data and react to changes, so that every
  module consumes one golden source, resolves identity through aliases, and never copies it.*

**Description:** The canonical read contract: single-employee fetch, batch fetch, search/list
(paginated, filtered, **phonetic-aware**, FR-025), org-scoped projections, field-access-masked responses
(FR-013), point-in-time reads (FR-011), **alias-transparent identity resolution (FR-015)**, and a
**fully specified change-feed backbone** (improvement #13/R14). **Identity resolution:** any `employee_id`
supplied that is a merged `loser_id` is transparently resolved to its `survivor_id`.

**Change-feed backbone specification (§8.5 details):** transport is a **DB-polled transactional outbox**
(`outbox_events`); **ordering** is by monotonic `event_id` (per-aggregate ordering guaranteed);
**cursor** semantics use `since=<event_id>`; **tombstones** mark merged/erased records
(`is_tombstone=true`); **retention/replay window** default 30 days (`retention_until`); **dead-letter**
after max publish attempts (`dead_lettered=true`); at-least-once delivery (consumers idempotent).

**Acceptance Criteria:**
1. Single, batch, and search endpoints return policy-masked projections scoped to the caller's
   permissions; tokens/raw never returned.
2. All list/search endpoints are paginated (max page size 100) and filterable (org_unit, status, cadre,
   designation, updated-since) **and phonetic-name searchable** (FR-025).
3. A change feed (`/employees/changes?since=<event_id>`) publishes master-change events
   (CREATED/UPDATED/PLACEMENT_CHANGED/ATTRIBUTE_CHANGED/RECORDS_MERGED/SEPARATED/DEATH) with the backbone
   guarantees above; **`RECORDS_MERGED` carries `{survivor_id, loser_id}` and a tombstone**.
4. **Any merged `loser_id` is resolved to `survivor_id`** on every endpoint (alias-transparent).
5. Point-in-time read (`as-of`) is exposed for pension/audit consumers (FR-011).
6. Responses include `etag` (derived from `row_version`) / `updated_at` for conditional GET.
7. The contract is versioned under `/api/v1` and changes are backward-compatible within the major.

**Business Rules:**
- Machine principals are RBAC-scoped exactly like users; no super-read bypass.
- Consumers must not persist PII beyond TTL-bounded caches (build-instruction §4.3).
- **Consumers MUST resolve identity through the feed/alias; they must never re-point their own FKs from
  a M01 merge — they re-resolve to the survivor** (improvement #1).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` + satellites | SELECT | masked projection |
| `employee_id_aliases` | SELECT | loser→survivor resolution |
| `field_access_policies` | SELECT | masking |
| `outbox_events` | SELECT (feed) | change feed cursor/tombstone |
| `audit_log` (async, sampled) | INSERT | consumer reads |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}` | single (masked; alias-resolved) |
| POST | `/api/v1/employees:batch` | batch by ids (alias-resolved) |
| GET | `/api/v1/employees?org_unit=&status=&updated_since=&q_phonetic=&page=&limit=` | search/list |
| GET | `/api/v1/employees/changes?since=<event_id>` | change feed (backbone) |
| GET | `/api/v1/employees/{id}/as-of?date=` | point-in-time |

**UI Behavior Notes:** API-only; a developer portal / OpenAPI doc page describes the contract, masking,
pagination, alias resolution, and the change-feed backbone (ordering, cursor, tombstones, replay, DLQ).

**Edge Cases:** large batch (cap size); consumer over-broad scope (filtered down); stale etag
(conditional 304); change-feed gap (cursor resume by event_id); deleted/merged employee (tombstone +
survivor in feed); dead-lettered event (operator replay).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | No UI; OpenAPI spec + developer docs; SDK client optional. |
| Backend-Service Flow | `EmployeeReadApi` resolves alias → applies caller scope + FieldAccessResolver to every projection; search uses indexed filters + phonetic index (FR-025) + cursor pagination; change feed reads `outbox_events` since `event_id`; async sampled audit. |
| Data Operations | Indexed SELECTs; alias resolution; masked projection; outbox read for feed; conditional GET via etag(row_version). |
| Validation Logic | Filter validation; batch size cap (≤100); cursor validity (event_id); as-of bounds. |
| Authorization Logic | Machine principal RBAC + org scope identical to users; field masking always applied; no bypass. |
| State Changes & Side Effects | None (reads); async sampled restricted-read audit. |
| Failure Handling | Bad filter→400; oversize batch→400 BATCH_TOO_LARGE; forbidden scope→filtered/403; stale etag→304; invalid cursor→400; feed lag→serve up to last published. |
| Dependencies & Reuse | FR-013 (masking), FR-011 (as-of), FR-015 (alias), FR-025 (phonetic), outbox backbone (§8.5); consumed by M02–M14. |
| Test Guidance | Contract tests per consumer; pagination + filter + phonetic correctness; masking per principal; **alias resolution (loser→survivor)**; change-feed ordering/resume/tombstone/replay/DLQ; conditional GET. |

---

### FR-EPM-020 — Data Privacy, Consent & Data-Principal Rights *(v2 new — improvement #4, R4)*

- **Module:** M01-EPM
- **Primary Role(s):** Data Protection Officer (oversee), HR Admin (action), Employee/heir (raise)
- **User Story:** *As a Data Protection Officer, I want consent and notices ledgered and the full set of
  DPDP data-principal rights, grievance, and breach-notification workflows built into the master, so that
  the organisation demonstrably complies with the DPDP Act 2023 rather than merely asserting it.*

**Description:** Implements DPDP governance: a **privacy-notice catalog** (`privacy_notices`) and a
**consent ledger** (`consent_records`, grant/withdraw/renew per purpose); the **six data-principal
rights beyond export** — access, correction, erasure (reconciled against retention via FR-021),
grievance, nomination, and consent withdrawal — via `data_principal_requests` with **statutory SLA
tracking**; a **DPO role**; a **grievance/redress workflow**; and a **personal-data-breach notification
workflow** (`breach_incidents`) to the Data Protection Board with timelines and affected-principal
notification.

**Acceptance Criteria:**
1. Active `privacy_notices` (per purpose, per language) are presented at create (FR-001) and on biometric
   enrolment (FR-009); acceptance/withdrawal is ledgered in `consent_records` with a captured artifact.
2. A data principal (or, on DECEASED, a legal heir via FR-024) can raise any of: ACCESS, CORRECTION,
   ERASURE, EXPORT, NOMINATION, CONSENT_WITHDRAWAL, GRIEVANCE; each gets an `sla_due_at`.
3. **Erasure requests are reconciled against FR-021 retention/legal-hold** (R18 precedence): where
   retention/hold lawfully wins, the request is REJECTED with a recorded reason and `linked_legal_hold_id`;
   otherwise actioned.
4. Consent withdrawal for a purpose (e.g. BIOMETRIC_ATTENDANCE) disables that processing (FR-009) and is
   ledgered.
5. The **DPO** monitors break-glass activity (FR-013), rights-request SLAs, and breach incidents.
6. **Breach workflow:** an incident records detection, severity, affected principals/fields, **DPB
   notification timestamp**, and affected-principal notification; statutory timelines are tracked and
   alerted.
7. All rights actions and consent events are audited.

**Business Rules:**
- DPO is independent (no transactional HR writes); signs off erasure and privacy-policy changes (§3).
- Notices are versioned; the version shown is captured in the consent artifact.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `privacy_notices` | CRUD | notice_key, version, purpose, language |
| `consent_records` | INSERT (append) | purpose, action, artifact |
| `data_principal_requests` | CRUD | type, status, sla_due_at, linked_legal_hold_id |
| `breach_incidents` | CRUD | severity, affected, dpb_notified_at |
| `legal_holds` | SELECT | erasure reconciliation |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/config/privacy-notices` | manage notices (DPO) |
| POST | `/api/v1/employees/{id}/consent` | grant/withdraw/renew |
| GET/POST/PATCH | `/api/v1/privacy/requests` | data-principal rights & grievance |
| GET/POST/PATCH | `/api/v1/privacy/breaches` | breach incidents & notifications |
| GET | `/api/v1/privacy/dpo-dashboard` | DPO oversight feed |

**UI Behavior Notes:** Consent capture modals with notice text; a DPO console (rights SLA queue,
break-glass activity, breach incidents with notification timers); employee "My Privacy & Rights" panel
(FR-016); grievance form with tracking.

**Edge Cases:** erasure blocked by legal hold; consent withdrawal for a purpose still legally required
(record + explain); breach affecting many principals (bulk notification); SLA breach (escalate);
heir-raised request on a deceased principal (FR-024 authorisation).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `ConsentModal`, `DPOConsole` (rights/breach/break-glass), `GrievanceForm`, breach notification timers. |
| Backend-Service Flow | `ConsentService` ledgers grant/withdraw; `RightsService` creates requests with SLA, routes erasure through FR-021 reconciliation; `BreachService` records, computes statutory deadlines, fires DPB + principal notifications; DPO dashboard aggregates. |
| Data Operations | CRUD notices/requests/breaches; append consent_records; SELECT legal_holds for erasure; audit. |
| Validation Logic | Notice active/version; request type/SLA; erasure-vs-retention precedence; breach severity/timeline. |
| Authorization Logic | DPO oversight + sign-off; HR Admin actions; principal/heir raises; independence enforced. |
| State Changes & Side Effects | Consent state changes (may disable biometric, FR-009); rights actioned/rejected; breach notifications sent; audit. |
| Failure Handling | Erasure under hold→REJECTED with reason; missing notice→400; SLA breach→ESCALATED; notification failure→retry + alert. |
| Dependencies & Reuse | FR-021 (retention/hold), FR-009 (biometric consent), FR-013 (break-glass feed), FR-024 (heir), notification, audit. |
| Test Guidance | Unit: SLA calc; erasure precedence. Integration: consent withdrawal disables biometric; breach timelines. E2E: raise each right; erasure-blocked-by-hold; breach notify DPB. |

---

### FR-EPM-021 — Retention, Legal Hold & Erasure *(v2 new — improvement #5, R4/R5)*

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (propose), Dept Head/SR Custodian (hold), DPO (erasure sign-off), System Admin (policy)
- **User Story:** *As a compliance owner, I want a retention schedule, legal holds, and an erasure engine
  that correctly reconciles the right-to-erasure against statutory retention, so that we neither delete
  what we must keep nor keep what we must delete.*

**Description:** Defines per-record-class statutory **retention policies** (`retention_policies`),
**legal holds** (`legal_holds`, blocking purge/erasure for disciplinary/litigation/pension/audit/RTI),
lifecycle states **ARCHIVED** and **PURGE_PENDING**, and an erasure engine that **reconciles erasure
against retention and holds — retention/hold wins where lawful, with documented precedence**
(§5.6 r18). Coordinates with M13 for document purge.

**Acceptance Criteria:**
1. Each employee record maps to a `record_class` with a `retain_years` and `post_retention_action`
   (ARCHIVE/ANONYMISE/PURGE).
2. On reaching the retention horizon, a record transitions to `ARCHIVED` (FR-018); purge requires no
   ACTIVE `legal_holds` and DPO sign-off, then `PURGE_PENDING`.
3. **An erasure request (FR-020) is honoured only if no statutory retention or ACTIVE legal hold
   applies; otherwise it is refused with a recorded precedence reason** (§5.6 r18).
4. A legal hold can be placed by Dept Head/SR Custodian/DPO (often from M09/M11) and blocks
   purge/erasure until released.
5. Post-retention ANONYMISE replaces PII with irreversible tokens while preserving aggregate analytics.
6. All retention/hold/erasure actions are audited and emit SR events where statutory.

**Business Rules:**
- `erasure_overridable=false` policies always beat an erasure request.
- Aadhaar-vault purge follows the same precedence (vault row purged only when lawful).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `retention_policies` | CRUD | record_class, retain_years, action, overridable |
| `legal_holds` | CRUD | hold_type, status, source_module |
| `employees` | UPDATE | record_state ARCHIVED/PURGE_PENDING |
| `aadhaar_vault` | DELETE (lawful only) | on purge |
| `data_principal_requests` | UPDATE | erasure resolution + precedence |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/config/retention-policies` | manage policies |
| GET/POST/PATCH | `/api/v1/employees/{id}/legal-holds` | place/release holds |
| POST | `/api/v1/employees/{id}:evaluate-erasure` | reconcile erasure vs retention/hold |
| POST | `/api/v1/retention/run` | scheduled retention sweep |

**UI Behavior Notes:** Retention-policy admin; legal-hold panel on the profile (active holds visible);
erasure-evaluation result screen showing precedence; archived/purge-pending badges.

**Edge Cases:** erasure under multiple holds; hold released mid-evaluation; record spanning two
record-classes (most-retentive wins); purge attempt with active hold (blocked); vault purge.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `RetentionPolicyAdmin`, `LegalHoldPanel`, `ErasureEvaluationResult`, archived/purge badges. |
| Backend-Service Flow | `RetentionService` sweep flags records at horizon → ARCHIVE; `LegalHoldService` place/release; `ErasureEngine.evaluate(employee, request)` → check retention (overridable?) + active holds → decision + recorded precedence; purge path coordinates M13 + aadhaar_vault under sign-off. |
| Data Operations | CRUD policies/holds; UPDATE record_state; conditional vault/M13 purge; UPDATE data_principal_requests; audit; outbox SR event. |
| Validation Logic | Horizon computation; hold-active check; precedence (retention/hold > erasure unless overridable); DPO sign-off for purge. |
| Authorization Logic | Policy = System Admin; holds = Dept Head/SR Custodian/DPO; erasure sign-off = DPO. |
| State Changes & Side Effects | record_state transitions; holds block purge; erasure decided; PII anonymised/purged when lawful. |
| Failure Handling | Purge under hold→409 LEGAL_HOLD_ACTIVE; erasure refused→recorded reason; sign-off missing→403. |
| Dependencies & Reuse | FR-018 (lifecycle states), FR-020 (erasure requests), M09/M11 (holds), M13 (doc purge), Aadhaar vault (FR-007), audit. |
| Test Guidance | Unit: horizon + precedence logic. Integration: erasure refused under hold/retention; lawful purge cascades vault+M13. E2E: place hold→erasure refused→release→purge. |

---

### FR-EPM-022 — Governed Statutory-Field Change Workflow (DOB / Category / Name) *(v2 new — improvement #8, R6)*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer (request), HR Admin + Appointing Authority (approve), DPO (oversight)
- **User Story:** *As an HR Admin, I want changes to DOB, social category, and legal name to follow a
  governed, evidence-bound, limited-alteration process tied to an effective date and a gazette/court
  reference, so that the most-litigated fields in government service are defensible.*

**Description:** A governed-change workflow (`governed_field_change_requests`) for statutorily-controlled
fields — **DOB, social category, and name/gender** — enforcing: a **limited (typically single)
alteration**, **mandatory documentary proof** (`document_id`), a **named approving authority**, full
audit, an **SR event (`GOVERNED_FIELD_CHANGED`)**, and writing the result as an effective-dated row in
`employee_attribute_history` (FR-011). Direct column updates to these fields are rejected at the service
layer (§5.6 r20). **4-eyes mandatory** (improvement #20).

**Acceptance Criteria:**
1. A change to `dob`, `category`, or `name`/`gender` can only be applied through an APPLIED
   `governed_field_change_requests`; a raw UPDATE of these columns is rejected (`GOVERNED_FIELD_LOCKED`).
2. The request requires `justification`, a `proof_document_id`, and (for name/gender/category) a
   `gazette_ref`; DOB changes require the documentary proof and approving authority.
3. **`alteration_count` enforces the statutory single/limited-alteration rule** — a second DOB/category
   change beyond the permitted count requires elevated authority and is flagged.
4. Approval is 4-eyes (maker ≠ approving authority); on APPLIED, the engine writes an
   `employee_attribute_history` row (with `gazette_ref`, `change_reason`) and updates the `employees`
   cache.
5. A `GOVERNED_FIELD_CHANGED` SR event is emitted via the outbox.
6. The change is effective-dated (`new_effective_from`) and visible in the point-in-time view (FR-011).

**Business Rules:**
- DOB changes alter the retirement date (read by M11) — the new value propagates via the attribute
  history and feed; M11 reconciles superannuation.
- Category changes affect reservation-roster point — recorded with effective date and gazette ref.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `governed_field_change_requests` | CRUD | field_path, requested_value, proof, gazette, alteration_count |
| `employee_attribute_history` | INSERT (on APPLIED) | effective-dated new value |
| `employees` | UPDATE (cache) | new current value |
| `outbox_events` | INSERT | GOVERNED_FIELD_CHANGED |
| `documents` (M13) | reference | proof |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}/governed-changes` | raise request |
| POST | `/api/v1/governed-changes/{id}:approve` | approving-authority 4-eyes approve → apply |
| POST | `/api/v1/governed-changes/{id}:reject` | reject |
| GET | `/api/v1/employees/{id}/governed-changes` | history of governed changes |

**UI Behavior Notes:** Governed-change request form (field, current vs requested, effective date, proof
upload, gazette ref); approval panel for the named authority; alteration-count warning; applied-change
shows in the attribute timeline (FR-011).

**Edge Cases:** second DOB change (alteration cap); missing gazette ref for name change; proof document
not uploaded; maker = approver; back-dated effective date crossing prior versions; rejected request.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `GovernedChangeForm`, approval panel (named authority), alteration-count warning, timeline link. |
| Backend-Service Flow | `GovernedChangeService.submit()` validates proof/gazette/alteration_count → status UNDER_REVIEW; `approve()` (4-eyes) → tx{ INSERT employee_attribute_history (effective-dated), UPDATE employees cache, outbox GOVERNED_FIELD_CHANGED, link applied_attribute_history_id }. |
| Data Operations | CRUD requests; INSERT attribute_history; UPDATE employees cache; outbox; audit; M13 proof ref. |
| Validation Logic | Field in governed set; proof + gazette presence; alteration cap; effective-date monotonicity; maker≠approver. |
| Authorization Logic | HR Officer requests; HR Admin + Appointing Authority approve (4-eyes); raw column update blocked (§5.6 r20). |
| State Changes & Side Effects | New effective-dated attribute version; cache update; SR event; M11/M06 reconcile via feed. |
| Failure Handling | Raw update of governed field→403 GOVERNED_FIELD_LOCKED; missing proof/gazette→400; cap exceeded→409; maker=approver→403 SOD_VIOLATION. |
| Dependencies & Reuse | FR-011 (attribute history + as-of), M13 (proof), outbox, M11/M06 consumers, audit. |
| Test Guidance | Unit: alteration cap; governed-field lock. Integration: APPLIED writes effective-dated history + cache + SR event. E2E: request→4-eyes approve→timeline shows new value as-of date; raw update rejected. |

---

### FR-EPM-023 — Category & Disability (PwD) Certificate Management *(v2 new — improvement #19, R17)*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin (Employee requests → M02)
- **User Story:** *As an HR Officer, I want to record and track the validity of category (EWS/OBC
  non-creamy-layer) and disability (PwD/UDID) certificates, so that reservation and disability benefits
  rest on current, verified evidence — not just a static enum value.*

**Description:** CRUD for `employee_certificates` capturing certificate type, number, issuing authority,
**validity period** (EWS/OBC non-creamy-layer certificates typically expire annually), **disability
percentage and UDID** (PwD; ≥40% for benefit eligibility), and **creamy-layer status** (OBC). Expiry
feeds advisory completeness/DQ (FR-014) and drives renewal alerts. This complements the governed category
value (FR-022): the *value* is governed; the *certificate* proves and time-bounds it.

**Acceptance Criteria:**
1. A certificate records type, number, issuing authority, `valid_from`, and (where applicable)
   `valid_to`, `disability_percentage`, `udid_number`, `is_creamy_layer`.
2. EWS/OBC non-creamy-layer certificates are validity-bounded; on `valid_to` passing, status → EXPIRED
   and a renewal nudge is raised (advisory).
3. PwD benefit eligibility requires `disability_percentage ≥ 40` and a valid UDID.
4. Certificate status (VALID/EXPIRED/REVOKED) is computed and surfaced in the 360° view.
5. Expiring certificates (90/30/7 days) generate alerts to employee + HR.
6. Verification toggles `is_verified` with audit.

**Business Rules:**
- A claimed reservation/PwD benefit with no VALID certificate raises an advisory DQ flag (never a block).
- Category value changes still require the governed workflow (FR-022); the certificate is supporting
  evidence.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_certificates` | CRUD | type, number, valid_from/to, percentage, udid, creamy |
| `documents` (M13) | reference | certificate scan |
| `employee_profile_completeness` | feed | expiry → advisory DQ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/employees/{id}/certificates` | manage certificates |
| POST | `/api/v1/certificates/{id}:verify` | verify |
| GET | `/api/v1/certificates/expiring` | expiry pipeline |

**UI Behavior Notes:** Certificate cards with validity chips (valid/expiring/expired); PwD percentage +
UDID fields; OBC creamy-layer toggle; renewal reminder banner; verify badge.

**Edge Cases:** expired certificate still referenced by a benefit; PwD < 40% (ineligible advisory);
missing UDID; future-dated certificate; revoked certificate.

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `CertificateList` with validity chips, PwD/UDID fields, creamy-layer toggle, verify, renewal banner. |
| Backend-Service Flow | `CertificateService` CRUD; nightly job recomputes status from `valid_to`; expiry alerts scheduled; feeds advisory DQ (FR-014). |
| Data Operations | CRUD certificates; M13 scan ref; status recompute; advisory completeness feed; audit. |
| Validation Logic | Validity dates; percentage range; UDID presence for PwD; creamy-layer for OBC. |
| Authorization Logic | HR write in scope; self-service→M02; verification HR. |
| State Changes & Side Effects | Status transitions VALID→EXPIRED; advisory DQ flag; renewal nudges. |
| Failure Handling | Bad dates→400; missing UDID for PwD claim→advisory flag (not block). |
| Dependencies & Reuse | M13, FR-014 (advisory DQ), FR-022 (governed category value), notification (expiry), audit. |
| Test Guidance | Unit: status recompute; PwD eligibility threshold. Integration: expiry → advisory DQ + alerts. E2E: add certificate→expiry→nudge; PwD percentage gating (advisory). |

---

### FR-EPM-024 — Deceased-Employee Succession & Family-Pension Handoff *(v2 new — improvement #18, R16)*

- **Module:** M01-EPM
- **Primary Role(s):** HR Admin (approve), HR Officer (initiate), SR Custodian, DPO (rights succession)
- **User Story:** *As an HR Admin, when an employee dies in service, I want the system to capture/confirm
  legal heirs and nominees, hand the family-pension recipient off to M11, and transfer the data-principal
  rights to the heirs, so that benefits and privacy obligations continue lawfully after death.*

**Description:** Triggered by the DECEASED transition (FR-018), this FR confirms **legal heirs and
succession rank** (E4) and the **family-pension recipient** (E5 `is_family_pension_recipient`), emits a
**`DEATH`** SR event, **hands the heir/nominee linkage off to M11** to create the family-pensioner award
(M11 owns the award; M01 provides the linkage), and **transfers data-principal rights** (access/erasure
exercised by the heir) under DPDP via FR-020. M01 does not compute the pension; it provides the
authoritative succession linkage.

**Acceptance Criteria:**
1. On DECEASED, the system requires confirmation of at least one legal heir (E4 `is_legal_heir`,
   `heir_succession_rank`) and the family-pension recipient (E5).
2. A **`DEATH`** SR event is emitted via the outbox with the survivor/heir linkage payload (no raw PII).
3. **A family-pension handoff is published to M11** (via the feed / a typed integration event) carrying
   the recipient nominee/heir reference; **M11 creates the family-pensioner record** (M01 does not).
4. Self-service for the deceased is locked; **heir-raised data-principal requests (FR-020) are
   authorised** against the deceased's record under succession rules.
5. Where a new family-pensioner *person record* is needed, M01 exposes a creation hook but the pensioner
   master/award is owned by M11 (bounded context preserved).
6. All succession actions are audited and 4-eyes approved.

**Business Rules:**
- Heir authorisation for data-rights requires recorded proof (succession/legal-heir certificate via M13).
- Conflicting heir claims are flagged for HR Admin/legal resolution before handoff.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employee_dependents` | UPDATE | is_legal_heir, heir_succession_rank |
| `employee_nominees` | UPDATE | is_family_pension_recipient |
| `employees` | UPDATE | DECEASED, record_state |
| `data_principal_requests` | INSERT | heir-raised rights |
| `outbox_events` | INSERT | DEATH + family-pension handoff |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/employees/{id}/death:record` | record death + heir confirmation |
| POST | `/api/v1/employees/{id}/heirs:confirm` | confirm heirs + succession rank |
| POST | `/api/v1/employees/{id}/family-pension:handoff` | publish recipient to M11 |
| POST | `/api/v1/employees/{id}/heir-rights` | heir exercises data-principal rights |

**UI Behavior Notes:** Death-recording workflow with heir confirmation grid (rank, proof upload);
family-pension recipient selector; handoff status to M11; heir-rights panel; conflicting-claim warning.

**Edge Cases:** no heir on record (block handoff, require capture); conflicting heir claims; minor heir
(guardian); deceased with active legal hold (pension hold); heir requesting erasure (refused under
pension retention, FR-021).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | `DeathRecordingWorkflow`, `HeirConfirmationGrid`, family-pension selector, handoff status, heir-rights panel, conflict warning. |
| Backend-Service Flow | `SuccessionService` (invoked by FR-018 DECEASED): require heir + recipient → 4-eyes approve → tx{ UPDATE dependents/nominees, set DECEASED/record_state, outbox DEATH + family-pension handoff } → M11 consumes handoff to create family-pensioner award; heir-rights route to FR-020 with succession authorisation. |
| Data Operations | UPDATE dependents/nominees/employees; INSERT data_principal_requests (heir); outbox; audit; M13 proof refs. |
| Validation Logic | At least one heir + recipient; proof presence; conflict detection; 4-eyes; hold-aware erasure (FR-021). |
| Authorization Logic | HR Admin approve; SR Custodian SR effect; heir authorised via proof; DPO oversees rights succession. |
| State Changes & Side Effects | DECEASED; heir/recipient confirmed; DEATH SR event; M11 family-pension creation (downstream); self-service locked; heir rights enabled. |
| Failure Handling | No heir→409 HEIR_REQUIRED; conflicting claims→flag/hold; handoff w/o recipient→409; heir erasure under pension hold→refused (FR-021). |
| Dependencies & Reuse | FR-018 (DECEASED), FR-004 (heirs/nominees), FR-020 (rights succession), FR-021 (holds), M11 (family-pension award), outbox, M13, audit. |
| Test Guidance | Unit: heir/recipient required; conflict detection. Integration: DEATH event + M11 handoff; heir-rights authorisation; erasure refused under pension hold. E2E: record death→confirm heirs→handoff→M11 creates award. |

---

### FR-EPM-025 — Phonetic & Transliteration Search & Match *(v2 new — improvement #21, R19/R22)*

- **Module:** M01-EPM
- **Primary Role(s):** HR Officer, HR Admin, machine consumers (search); dedup engine (match)
- **User Story:** *As an HR Officer, I want to find employees by approximate name across spellings and
  scripts, and have the dedup engine use the same matcher, so that the directory and deduplication do not
  under-match Indian names spread across transliterations and `name_local` scripts.*

**Description:** A search/match service providing **phonetic** (e.g. Soundex/Metaphone/Indic-aware) and
**transliteration** matching over `first_name`, `last_name`, `name_local`, fed into (a) the employee
directory/global search and consumption API (FR-019 `q_phonetic`), and (b) the **dedup matcher (FR-015)**
so both use one algorithm. Handles cross-script equivalence (Latin ↔ Devanagari/Telugu/etc.).

**Acceptance Criteria:**
1. A phonetic index is maintained over `first_name`/`last_name`/`name_local` (updated on write).
2. Search by approximate name returns ranked candidates with a similarity score; supports
   transliterated input (Latin query matching local-script records and vice-versa).
3. The **dedup engine (FR-015) uses the same matcher** for fuzzy name scoring.
4. Search honours row-level org scope and field-access masking (FR-013).
5. Performance: phonetic search P95 < 700 ms at 500k records.

**Business Rules:**
- Phonetic match contributes to but does not alone trigger an auto-block; only composite HIGH scores do
  (FR-015).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` | SELECT + phonetic index | first/last_name, name_local |
| (search index) | maintain | phonetic codes / transliteration keys |
| `dedup_candidates` | feed | fuzzy name score |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/search?q=&phonetic=true&script=` | phonetic/transliteration search |
| GET | `/api/v1/employees?q_phonetic=` | consumption-API phonetic filter (FR-019) |

**UI Behavior Notes:** Global search box accepts approximate/transliterated names; results show match
score and matched-on (phonetic/transliteration); "did you mean" suggestions.

**Edge Cases:** mononym; mixed-script query; very common name (many candidates, ranked); empty
`name_local`; homophones across different real people (ranked, not auto-merged).

**Low-Level Design:**

| Aspect | Detail |
|---|---|
| Components & Screen Behavior | Global search box, ranked results with match-on chips, "did you mean". |
| Backend-Service Flow | `NameMatchService` builds phonetic + transliteration keys on write (index/materialised); `search()` ranks by similarity within scope + masking; `FR-015 DedupEngine` calls the same `score(nameA, nameB)`. |
| Data Operations | Maintain phonetic index; ranked SELECT; feed dedup scoring. |
| Validation Logic | Script detection; query normalisation; scope + masking applied to results. |
| Authorization Logic | Row-scope + field-access on results; machine principals scoped. |
| State Changes & Side Effects | Index maintenance on name writes; no master mutation on search. |
| Failure Handling | Index lag→fall back to trigram; invalid script param→400. |
| Dependencies & Reuse | FR-015 (shared matcher), FR-019 (search filter), FR-013 (masking). |
| Test Guidance | Unit: phonetic/transliteration equivalence (Latin↔Indic). Performance: 700 ms P95 at 500k. Integration: dedup uses same matcher. E2E: transliterated query finds local-script record. |

---

## 7. UI Requirements

| UI area | Requirement |
|---|---|
| Global shell | Responsive (mobile-first), collapsible sidebar, breadcrumb, **phonetic/transliteration global search** (by name/service_no, scoped, FR-025), dark-mode, WCAG 2.1 AA, i18n (English + local language), keyboard navigation, focus management. |
| Employee directory | Paginated, filterable list (org_unit, cadre, designation, status, **record_state**); columns: photo, name (`display_name`), service_no, designation, org unit, status; row → 360° view; export (logged). Empty/loading/error states. |
| 360° profile | Sticky header (photo, name, service_no, designation, org, status badge, advisory completeness ring, **staleness chip** from CQRS projection); left-rail section nav; lazy-loaded panels; masked-field component with reveal-with-reason; read-only for unauthorised edits; **as-of jump (FR-011)**. |
| Create wizard | Multi-step stepper with per-step validation, save-draft, inline dedup warning, **consent step**, mononym support, review summary. |
| Section editors | Cards/tables with add/edit modals; primary toggles; verification badges; effective-date pickers; **concurrency conflict prompt (row_version)**; self-service "request change" routing to M02. |
| Org chart | Interactive zoom/pan/collapsible tree with **as-of slider**; vacancy heatmap; drag-to-reassign with confirmation; position detail drawer with **history timeline**. |
| Point-in-time | As-of date picker/slider re-rendering the profile **including name/category history**; change timeline with reason/gazette/source chips. |
| Privacy & rights | Employee "My Privacy & Rights" panel (access/correction/erasure/export/withdraw consent/grievance); **DPO console** (rights SLA queue, break-glass activity with reveals-remaining, breach incidents with notification timers). |
| Governed change | Governed DOB/category/name change form (current vs requested, effective date, proof, gazette ref) + approval panel + alteration-count warning. |
| Certificates | Category/PwD certificate cards with validity chips, PwD percentage/UDID, OBC creamy-layer, renewal banner. |
| Config screens | Field-access policy matrix editor (field × role → level + reason + **4-eyes + cap**, DPO sign-off); retention-policy admin; legal-hold panel. Section/custom-field builder is **Phase 2**. |
| Dedup | Side-by-side compare with field-level keep selectors; match-score (incl. phonetic) display; merge preview; **4-eyes panel**; undo banner. |
| Import | Upload with template download + **profile selector (STRICT/MIGRATION)**; validation progress; results grid with valid/**provisional**/error filters; **remediation worklist**; commit/rollback. |
| Self-service | Read-only "My Profile", request-change buttons, pending chips, data export, advisory completeness checklist. |
| Deceased/succession | Death-recording workflow, heir confirmation grid (rank, proof), family-pension recipient selector, M11 handoff status. |
| States | Every screen defines empty, loading (skeleton), error, success, permission-denied, and offline-degraded states with real content (no placeholder skeleton-only UI). |
| Feedback | Toasts for success/error; confirmation modals for destructive/sensitive actions; inline field validation; **no "blocked from payroll" messaging anywhere** (FR-014). |

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
| `CONFLICT` | 409 | invariant/state conflict (generic; incl. duplicate official email) |
| `RATE_LIMITED` | 429 | throttle (export; **break-glass volume cap, FR-013**) |
| `INTERNAL_ERROR` | 500 | unexpected server error |
| `UPSTREAM_UNAVAILABLE` | 503 | M13/M12/notification/**KMS vault** dependency down |
| `DUPLICATE_CANDIDATE` | 409 | dedup HIGH match blocks create |
| `PRIMARY_REQUIRED` | 409 | removing the only primary contact/account |
| `SHARE_SUM_INVALID` | 409 | nominee shares per benefit ≠ 100 |
| `INVALID_ID` | 400 | statutory ID checksum/format failure |
| `SOD_VIOLATION` | 403 | maker = checker on 4-eyes action |
| `OVER_STRENGTH` | 409 | placement exceeds sanctioned strength |
| `POSITION_INACTIVE` | 409 | placement into FROZEN/ABOLISHED position |
| `INVALID_STATE` | 409 | illegal employment-status transition |
| `BLOCKING_OBLIGATIONS` | 409 | separation blocked by open dues |
| `TYPE_LOCKED` | 409 | custom-field type change with existing data (Phase 2) |
| `REASON_REQUIRED` | 400 | break-glass reveal without reason |
| `MERGE_CONFLICT` | 409 | merge of conflicting active states |
| `UNDO_EXPIRED` | 409 | merge/import rollback past window |
| `BATCH_TOO_LARGE` | 400 | batch read/import chunk exceeds cap |
| `IMMUTABLE_VERIFIED` | 403 | editing a verified record without Admin |
| `OUT_OF_RANGE` | 400 | as-of date before DOJ / beyond retention |
| `STALE_VERSION` | 409 | **v2: optimistic-lock row_version mismatch (improvement #12)** |
| `GOVERNED_FIELD_LOCKED` | 403 | **v2: raw update of DOB/category/name outside FR-022** |
| `CONSENT_REQUIRED` | 403 | **v2: biometric/processing without a valid consent (FR-009/020)** |
| `LEGAL_HOLD_ACTIVE` | 409 | **v2: purge/erasure blocked by an active legal hold (FR-021)** |
| `HEIR_REQUIRED` | 409 | **v2: DECEASED handoff without a confirmed heir (FR-024)** |

> **Removed semantics:** the v1 `DQ_BLOCKED`/payroll-block path is **deleted**. M10 owns the
> `NO_VERIFIED_BANK` disbursement precondition; M01 emits no payroll-blocking error (improvement #6/R3).

### 8.3 JSON Examples (complex endpoints)

**(a) Create employee — `POST /api/v1/employees`** (mononym + Aadhaar via vault)

Request:
```json
{
  "salutation": "MR",
  "first_name": "Lalmuanpuia",
  "has_single_legal_name": true,
  "dob": "1990-01-01",
  "gender": "MALE",
  "date_of_joining": "2014-07-01",
  "employment_type": "PERMANENT",
  "designation_id": "desig-110",
  "org_unit_id": "org-22",
  "cadre": "CADRE_C",
  "appointing_authority_ref": "GO-2014-7781",
  "pan": "LMNPL3344K",
  "aadhaar": "XXXX-XXXX-9001",
  "consent": { "notice_key": "PROFILE_PROCESSING", "version": "v1", "action": "GRANTED" }
}
```
Response `201`:
```json
{
  "employee_id": "11111111-1111-1111-1111-111111110042",
  "service_no": "GOV-0042",
  "employment_status": "ACTIVE",
  "record_state": "ACTIVE",
  "current_assignment_id": "ja-0042",
  "aadhaar_ref_key": "rk-3d10…",
  "aadhaar_masked": "XXXX-XXXX-9001",
  "profile_completeness_pct": 71.00,
  "data_quality_flag": "NEEDS_ATTENTION",
  "sr_event_id": "evt-90042",
  "row_version": 1,
  "requestId": "req-7f3a..."
}
```

**(b) 360° profile (masked, CQRS) — `GET /api/v1/employees/{id}/profile-360`**

Response `200` (caller = Reporting Manager; PAN masked, religion hidden; alias-resolved):
```json
{
  "employee": {
    "employee_id": "11111111-...-0001", "service_no": "GOV-0001",
    "display_name": "Anita Sharma",
    "pan": "ABCPSXXXXK", "aadhaar_masked": "XXXX-XXXX-4321", "religion": null,
    "category": "[HIDDEN]",
    "designation": "Deputy Officer (Finance)", "org_unit": "Finance Wing",
    "employment_status": "ACTIVE", "record_state": "ACTIVE", "profile_completeness_pct": 96.0
  },
  "sections": {
    "contacts": [ { "type": "OFFICIAL_EMAIL", "value": "anita.sharma@gov.in", "is_primary": true } ],
    "bank_accounts": [ { "bank_name": "SBI", "account_number_masked": "XXXXXX4567", "is_primary_salary": true } ],
    "certificates": [ { "type": "OBC_NON_CREAMY", "status": "VALID", "valid_to": "2026-03-31" } ]
  },
  "_meta": { "masked_fields": ["pan","aadhaar"], "hidden_fields": ["religion","category"],
             "etag": "W/\"row-14\"", "projection_synced_at": "2026-06-30T05:12:01Z" },
  "requestId": "req-7f3c..."
}
```

**(c) Merge (alias-based) — `POST /api/v1/dedup/candidates/{id}:merge`**

Request:
```json
{ "survivor_id": "11111111-...-0007", "loser_id": "11111111-...-0070",
  "field_picks": { "bank": "survivor", "education": "loser" },
  "four_eyes_approver_id": "usr-hradmin-2" }
```
Response `200`:
```json
{ "alias_id": "al-0001", "survivor_id": "11111111-...-0007", "loser_id": "11111111-...-0070",
  "mergeable_back_until": "2026-06-27T10:00:00Z", "sr_event_id": "evt-90002",
  "note": "No cross-module FKs repointed; consumers resolve via alias.", "requestId": "req-7f3d..." }
```

**(d) Hardened break-glass reveal — `POST /api/v1/employees/{id}/reveal-field`**

Request:
```json
{ "field_path": "aadhaar_vault.aadhaar_number", "reason": "Pension KYC, ticket INC-4571",
  "four_eyes_approver_id": "usr-hradmin-2" }
```
Response `200`:
```json
{ "field_path": "aadhaar_vault.aadhaar_number", "value": "9001",
  "reveal_id": "bg-0001", "window_remaining": 22, "audit_enqueued": true, "requestId": "req-7f3e..." }
```
Over the volume cap `429`:
```json
{ "error": { "code": "RATE_LIMITED", "message": "Break-glass window cap reached; DPO clearance required",
  "field": "field_path" }, "window_remaining": 0, "requestId": "req-7f3f..." }
```

**(e) Change feed (backbone) — `GET /api/v1/employees/changes?since=90000`**

Response `200`:
```json
{ "changes": [
    { "event_id": 90001, "employee_id": "11111111-...-0001", "type": "PLACEMENT_CHANGED", "at": "2026-06-30T05:12:00Z" },
    { "event_id": 90002, "survivor_id": "11111111-...-0007", "loser_id": "11111111-...-0070",
      "type": "RECORDS_MERGED", "tombstone": true, "at": "2026-06-20T10:00:00Z" },
    { "event_id": 90003, "employee_id": "11111111-...-0002", "type": "GOVERNED_FIELD_CHANGED", "at": "2026-06-29T07:00:00Z" }
  ],
  "next_cursor": 90003,
  "replay_window_days": 30,
  "requestId": "req-7f40..." }
```

**(f) Erasure evaluation — `POST /api/v1/employees/{id}:evaluate-erasure`**

Response `200` (refused under retention/hold):
```json
{ "decision": "REFUSED", "precedence": "RETENTION_WINS",
  "reasons": [ { "type": "RETENTION", "record_class": "PENSIONER", "retain_years": 99 },
               { "type": "LEGAL_HOLD", "hold_id": "lh-0002", "hold_type": "PENSION" } ],
  "request_id_ref": "dpr-0002", "requestId": "req-7f41..." }
```

### 8.4 Integration Points

| Integration | Direction | Mechanism |
|---|---|---|
| M13 Document Mgmt | M01 → M13 | upload binary, store `document_id`; resolve URLs; coordinated purge (FR-021) |
| M12 Digital SR | M01 → M12 | service events via **`outbox_events`** producer (transactional outbox) |
| M02 Edit Workflow | M02 → M01 | approved edits commit via `PATCH /employees/{id}:commit` |
| M10 Payroll | M01 → M10 | consumption API (verified primary bank); **M10 owns `NO_VERIFIED_BANK` gate + cheque fallback — M01 never blocks pay** |
| M11 Pension | M01 → M11 | consumption API; **family-pension heir/recipient handoff (FR-024); DOB/category via attribute history** |
| M05/M06 Transfer/Promotion | them → M01 | create assignments via assignment API |
| M09 Disciplinary | M09 → M01 | **legal holds (FR-021)**; reads reporting line/identity |
| M14 Analytics | M01 → M14 | consumption API + advisory completeness summary feed |
| Aadhaar Data Vault / KMS | M01-internal | Reference-Key vault; KMS envelope encryption (FR-007) |
| Notification platform | M01 → users/DPO | OTP, expiry alerts, change notices, **real-time break-glass/breach alerts** |
| OIDC/SSO + MFA | platform | authentication for all surfaces |
| Change-feed consumers | M01 → M02–M14 | **DB-polled outbox backbone (§8.5); alias-transparent identity** |

### 8.5 Change-Feed Event Backbone Specification *(v2 new — improvement #13, R14)*

| Aspect | Decision |
|---|---|
| Transport | **DB-polled transactional outbox** (`outbox_events`); events written in the same tx as the state change (no dual-write). A drainer publishes to the change-feed endpoint and to M12. |
| Ordering | Monotonic `event_id` (BIGSERIAL); **per-aggregate ordering guaranteed**; global order is best-effort by event_id. |
| Delivery | At-least-once; consumers must be idempotent (use `event_id` as dedupe key). |
| Cursor | `since=<event_id>`; response returns `next_cursor`. |
| Tombstones | Merged (`RECORDS_MERGED`) and erased records carry `is_tombstone=true` with survivor reference. |
| Retention / replay | Default **30-day** replay window (`retention_until`); older events archived. |
| Dead-letter | After `publish_attempts` ≥ max, `dead_lettered=true`; operator replay endpoint; alert to ops. |
| Backpressure | Drainer batches; consumers poll with limit ≤ 100. |
| Identity | Every event resolves to the **survivor** `employee_id` via `employee_id_aliases`. |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 single-profile read < 500 ms; **360° assembly < 800 ms P95 from the CQRS projection at 500k records**; phonetic search < 700 ms P95; import validation ≥ 5,000 rows/min. **Restricted-read auditing is async (off the hot path).** |
| Scalability | Horizontal stateless API; ≥ 500k employee records; **outbox change-feed handles ≥ 14 consumer modules with 30-day replay**. |
| Availability | 99.9% uptime; graceful degradation when M13/M12/KMS down (queue events, defer doc ops; Aadhaar writes fail closed). |
| DR | RPO ≤ 15 min; RTO ≤ 4 h; PITR-capable PostgreSQL; **outbox guarantees no lost SR/feed events**. |
| Security | OWASP ASVS L2; TLS 1.2+; field-level PII masking server-side; **Aadhaar only in the Reference-Key vault; bank numbers tokenised via KMS**; no raw tokens in logs/responses; least-privilege RBAC + org row-scoping; **hardened break-glass (caps, anomaly, real-time alert, optional 4-eyes)**. |
| Privacy / DPDP | Engineered: consent/notice ledger; six data-principal rights + grievance + breach workflows (FR-020); retention/legal-hold/erasure reconciliation (FR-021); biometric purpose isolation (FR-009); purpose limitation & data minimisation. |
| Concurrency | **Optimistic locking (`row_version`) on every mutable entity; `STALE_VERSION` 409 on mismatch; etag derived from row_version.** |
| Auditability | Every write in immutable `audit_log` (sync); restricted reads via async sink; tamper-evident (hash chaining recommended); break-glass ledger (`break_glass_reveals`). |
| Accessibility | WCAG 2.1 AA; keyboard operable; screen-reader labels; colour-contrast compliant. |
| i18n / locale | UTC storage, locale display; dates `DD-MMM-YYYY`; INR default; English + local language; **transliteration-aware search**. |
| Observability | Structured logs (no PII), metrics, traces with `requestId`; alerting on error-rate/latency SLO breach; **break-glass anomaly + breach alerts real-time**. |
| Compliance | Retention per statutory schedule (FR-021); SoD enforced (incl. configurable high-risk 4-eyes); access reviews; Aadhaar Act / UIDAI vault alignment. |
| Data integrity | All multi-step writes transactional; effective-dating exclusion constraints (assignments, attributes, positions); FK enforcement; soft delete; **identity resolution via alias only**. |

---

## 10. Workflow & State Diagrams

### 10.1 `employment_status` + `record_state` state machine — *v2 extended*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create on hire (STRICT) | ACTIVE / record_state=ACTIVE | FR-001 validations pass |
| (none) | create via migration | ACTIVE / **record_state=PROVISIONAL** | FR-017 MIGRATION profile; login disabled |
| PROVISIONAL | remediate & promote | record_state=ACTIVE | FR-017 STRICT re-validation passes |
| ACTIVE | leave sanctioned (M03) | ON_LEAVE | approved long leave |
| ON_LEAVE | rejoin | ACTIVE | leave ended |
| ACTIVE | suspension (M09) | SUSPENDED | disciplinary order |
| SUSPENDED | revoke / reinstate | ACTIVE | order revoked |
| ACTIVE/ON_LEAVE | transfer out (M05) | TRANSFERRED | relieving complete |
| TRANSFERRED | join at destination | ACTIVE | joining recorded |
| ACTIVE/SUSPENDED | separate (retire) | RETIRED | FR-018 approved |
| ACTIVE | separate (resign) | RESIGNED | FR-018 approved |
| ACTIVE/SUSPENDED | terminate | TERMINATED | FR-018 + disciplinary |
| any | death recorded | DECEASED | FR-018 + **FR-024 succession**; locks self-service |
| RETIRED/RESIGNED | rehire | ACTIVE | reactivation policy permits |
| RETIRED/RESIGNED/TERMINATED/DECEASED | retention horizon reached | **record_state=ARCHIVED** | FR-021; no active hold needed to archive |
| ARCHIVED | purge approved | **record_state=PURGE_PENDING** | FR-021: no ACTIVE legal_holds + DPO sign-off |
| TERMINATED/DECEASED | — | (terminal status) | no reactivation (policy-gated) |

### 10.2 Bank-account 4-eyes state machine

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create | PENDING_APPROVAL | maker submits |
| PENDING_APPROVAL | approve | ACTIVE | checker ≠ maker |
| PENDING_APPROVAL | reject | REJECTED | checker decision |
| ACTIVE | verify | ACTIVE+verified | penny-drop/manual |
| ACTIVE | replace (new primary) | demoted | new primary approved |

### 10.3 Dedup candidate / alias state machine — *v2 extended*

| From | Event | To |
|---|---|---|
| (detected) | queue | OPEN |
| OPEN | merge (4-eyes, writes alias) | MERGED + alias active |
| OPEN | dismiss | DISMISSED |
| MERGED | undo (in window, restore snapshot) | OPEN + alias `is_reversed=true` |

### 10.4 Import batch state machine — *v2 extended (PROVISIONAL)*

| From | Event | To |
|---|---|---|
| (upload) | create (STRICT/MIGRATION) | UPLOADED |
| UPLOADED | validate | VALIDATING → VALIDATED (rows: VALID/PROVISIONAL/ERROR) |
| VALIDATED | commit | COMMITTING → COMMITTED (PROVISIONAL rows login-disabled, queued) |
| any | error | FAILED |
| COMMITTED | rollback (in window) | ROLLED_BACK |

### 10.5 Governed-field change state machine *(v2 new — FR-022)*

| From | Event | To |
|---|---|---|
| (draft) | submit with proof | SUBMITTED → UNDER_REVIEW |
| UNDER_REVIEW | approve (4-eyes) | APPROVED → APPLIED (writes attribute_history) |
| UNDER_REVIEW | reject | REJECTED |

### 10.6 Data-principal request & legal-hold (v2 — FR-020/021)

| From | Event | To |
|---|---|---|
| (raised) | receive | RECEIVED → IN_REVIEW |
| IN_REVIEW | action (no hold/retention) | ACTIONED → CLOSED |
| IN_REVIEW | erasure blocked by hold/retention | REJECTED (precedence recorded) |
| IN_REVIEW | SLA breached | ESCALATED |
| legal hold | place | ACTIVE |
| legal hold | release | RELEASED |

### 10.7 Photo approval state machine

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
| Identity/certificate expiring (90/30/7d) | Employee, HR | Email + in-app | `EPM_ID_EXPIRY` / `EPM_CERT_EXPIRY` |
| Bank detail changed | Employee | Email + SMS | `EPM_BANK_CHANGED` |
| Bank/nominee change pending approval | Approver | In-app | `EPM_APPROVAL_PENDING` |
| Profile completeness nudge (advisory) | Employee | In-app + Email | `EPM_COMPLETENESS_NUDGE` |
| Dedup candidate raised | HR Admin | In-app | `EPM_DEDUP_CANDIDATE` |
| **Break-glass threshold/anomaly (real-time)** | **DPO** | In-app + Email (immediate) | `EPM_BREAK_GLASS_ALERT` |
| **Personal-data breach** | DPO; affected principals; (DPB notification logged) | Email + in-app | `EPM_BREACH_NOTIFY` |
| **Data-principal request status / SLA** | Employee/heir; DPO | Email + in-app | `EPM_DP_REQUEST` |
| **Governed field change applied** | Employee, HR, M11/M06 | Email + in-app | `EPM_GOVERNED_CHANGE` |
| **Consent granted/withdrawn** | Employee; DPO | In-app | `EPM_CONSENT` |
| Separation approved | Employee, HR, payroll | Email + in-app | `EPM_SEPARATION` |
| **Death recorded / family-pension handoff** | HR, M11, heirs | Email + in-app | `EPM_DEATH_SUCCESSION` |
| Import completed/failed; remediation queued | Initiator, HR Admin | In-app + Email | `EPM_IMPORT_RESULT` |
| **PROVISIONAL record needs remediation** | HR Officer | In-app | `EPM_REMEDIATION_DUE` |

All notifications written to the shared `notifications` ledger; **no PII values in bodies** (reference,
not content); respect user locale and channel preferences. **Break-glass/breach alerts are real-time,
not digests** (improvement #10).

---

## 12. Reporting & Analytics

| Report / metric | Description | Consumer |
|---|---|---|
| Headcount by org/cadre/designation/status/**record_state** | Live counts with drill-down | M14, HR |
| Profile completeness distribution (advisory) | % at score bands per org unit | M14, HR |
| Data-quality issue register | Open DQ issues by type/severity (advisory) | HR Admin |
| Vacancy report | Sanctioned vs filled per position/org | HR Admin, Dept Head |
| **Position history / Pay-Commission impact** | Effective-dated position changes | HR Admin, M14 |
| Statutory ID & certificate expiry pipeline | IDs/certificates expiring in 90 days | HR |
| **Duplicate/alias register** | Open/merged/dismissed candidates + active aliases | HR Admin |
| **Privacy & rights register** | Consent status, rights-request SLAs, grievances | DPO, Auditor |
| **Break-glass & breach activity** | Reveals by user/field, anomalies, incidents | DPO, Auditor |
| **Retention & legal-hold register** | Records at horizon; active holds; erasure decisions | Compliance, DPO |
| Demographic & diversity (aggregated) | Gender/category/PwD aggregates (no row-level PII) | Leadership, compliance |
| **Migration glide-path tracker** | VALID/PROVISIONAL/remediated over time | HR Admin |
| Tenure & age profile | Service length, retirement-due pipeline (uses governed DOB) | M11, HR |

Analytics served via the consumption API and the advisory completeness summary feed; all aggregate
reports honour PII minimisation (no special-category row-level export to non-authorised roles).

---

## 13. Migration & Launch Plan

> **v2 change (improvement #11/R8):** the unrealistic "≥ 99.5% VALID on first/second pass" target is
> replaced with a **staged data-quality glide path** built around the PROVISIONAL/QUARANTINE state and a
> remediation queue, so migration never stalls on paper-service-book gaps.

| Phase | Activities | Exit criteria |
|---|---|---|
| 0 — Prep | Confirm template (FR-017); load master data (org_units, designations, cadres, pay_scales, positions + `position_history`); seed field-access policies + **4-eyes flags**; seed retention policies; configure fixed completeness weighting; **stand up Aadhaar vault + KMS**. | Reference data verified; vault + policies in place. |
| 1 — Extract & cleanse | Pull legacy records; standardise names (phonetic/transliteration aids); resolve obvious duplicates pre-import. | Cleansed dataset; mapping doc signed off. |
| 2 — Dry-run import (MIGRATION profile) | Validate-only; review valid/**provisional**/error report; tune validators. | Glide-path baseline measured (not a 99.5% gate). |
| 3 — Dedup sweep (alias) | Run phonetic-aware detection; resolve candidates via alias merge (4-eyes); confirm no silent duplicates. | Duplicate rate < 0.1%; aliases recorded. |
| 4 — Commit (with PROVISIONAL) | Chunked transactional commit; VALID→ACTIVE, gaps→**PROVISIONAL (login-disabled, queued)**; SR events via outbox; advisory completeness computed. | Committed counts reconcile; remediation queue populated. |
| 5 — Consumer integration | M02–M14 integrate against consumption API + **change-feed backbone**; **alias resolution** contract tests pass. | All consumers green on contract tests incl. alias. |
| 6 — Remediation glide path | Work the remediation queue; promote PROVISIONAL→ACTIVE as gaps close. | **≥ 80% CLEAN at cutover; ≥ 95% within 180 days.** |
| 7 — Cutover & launch | Disable legacy writes; enable self-service (ACTIVE only); monitor SLOs + break-glass/breach. | SLOs met; go-live sign-off. |
| 8 — Hypercare | Monitor DQ, completeness, audit, rights SLAs; rollback window available. | Stable for hypercare period. |

**Rollback strategy:** import batches reversible within window; outbox guarantees SR/feed delivery; PITR
for catastrophic recovery; alias merges reversible via snapshot. **Training:** HR/Admin on
create/maintain/dedup(alias)/import(PROVISIONAL)/governed-change; DPO on rights/breach/retention;
employees on self-service, rights, and change requests.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 FR → Entities → APIs → Roles Traceability Matrix

| FR | Primary entities | Key APIs | Roles | Consumes/Emits |
|---|---|---|---|---|
| FR-EPM-001 | employees, attribute_history, job_assignments, aadhaar_vault, consent | POST /employees | HR Off/Admin | dedup, outbox PROFILE_CREATED |
| FR-EPM-002 | read_model, all employee_* | GET /profile-360 | HR, Mgr, Auditor, Self | field-access, alias, async audit |
| FR-EPM-003 | contacts, addresses | /contacts, /addresses | HR (Self→M02) | notification, M02, row_version |
| FR-EPM-004 | dependents, nominees | /dependents, /nominees | HR (Self→M02) | M13, outbox, 4-eyes, FR-024 |
| FR-EPM-005 | emergency_contacts | /emergency-contacts | HR, Self | audit |
| FR-EPM-006 | education, experience | /education, /experience | HR (Self→M02) | M13, M11 |
| FR-EPM-007 | aadhaar_vault, identity_documents | /identity-docs, /aadhaar:reveal | HR Admin (4-eyes) | KMS, dedup, M13, FR-013 |
| FR-EPM-008 | bank_accounts | /bank-accounts | HR (4-eyes), Dept Head | workflow, M10/M11 (M10 owns gate) |
| FR-EPM-009 | photos, consent_records | /photos, /biometric-ref | HR (Self→approval), Admin | M13, FR-020 consent, FR-021 |
| FR-EPM-010 | positions, position_history, job_assignments | /positions, /assignments, /org-chart | HR Admin, Dept Head | M05/M06, outbox (service-layer sync) |
| FR-EPM-011 | job_assignments, attribute_history, position_history, addresses | /as-of, /history | HR, Auditor | field-access |
| FR-EPM-012 | profile_sections, custom_field_* (Phase 2) | /config/* | System Admin | field-access, advisory completeness |
| FR-EPM-013 | field_access_policies, break_glass_reveals | /reveal-field, /config/field-access-policies | System Admin, DPO (all readers) | async audit, breach (FR-020) |
| FR-EPM-014 | profile_completeness, certificates | /completeness | HR, Self | M14 (**advisory; no M10 gate**) |
| FR-EPM-015 | dedup_candidates, employee_id_aliases | /dedup/*, /resolve | HR Admin (4-eyes) | outbox RECORDS_MERGED, FR-025 |
| FR-EPM-016 | read_model, data_principal_requests, M02 | /me/* | Employee | field-access, M02, FR-020 |
| FR-EPM-017 | import_batches, staging | /imports/*, /remediation-queue | HR Admin/Off | dedup, advisory completeness, outbox |
| FR-EPM-018 | employees, job_assignments, users, legal_holds | /:separate, /:reactivate, /:archive | HR Admin, Dept Head, SR Cust. | outbox, M11, FR-021, FR-024 |
| FR-EPM-019 | employees + satellites, aliases, outbox_events | /employees, /changes, /batch, /as-of | machine principals, Auditor | field-access, alias, backbone, all modules |
| FR-EPM-020 | privacy_notices, consent_records, data_principal_requests, breach_incidents | /privacy/*, /consent | DPO, HR Admin, Employee/heir | FR-021, FR-009, FR-013, audit |
| FR-EPM-021 | retention_policies, legal_holds | /retention/*, /legal-holds | Admin, Dept Head, DPO | FR-018, FR-020, M09/M11, M13, vault |
| FR-EPM-022 | governed_field_change_requests, attribute_history | /governed-changes | HR Off/Admin, Appointing Auth. | M13, outbox, M11/M06 |
| FR-EPM-023 | employee_certificates | /certificates | HR (Self→M02) | M13, FR-014 advisory, notification |
| FR-EPM-024 | dependents, nominees, data_principal_requests | /death:record, /family-pension:handoff | HR Admin, SR Cust., DPO | FR-018, FR-020, M11, outbox DEATH |
| FR-EPM-025 | employees (phonetic index), dedup_candidates | /employees/search?phonetic | HR, machine | FR-015, FR-019, FR-013 |

### 14.2 Dependency Map

- **Build-first / freeze before parallel work:** **`employee_id_aliases` identity contract (FR-015)** +
  **field access (FR-013)** + **consumption API + change-feed backbone (FR-019)** + **FR-001 (create)**.
  These three frozen contracts are "The One Thing To Do First" (council).
- **Internal deps:** FR-002 depends on FR-013 + CQRS projection; FR-011 depends on FR-010
  (position_history) + FR-022 (attribute_history); FR-014 depends on all write FRs + FR-023; FR-015 uses
  FR-025 + aliases; FR-016 depends on FR-013 + FR-020 + M02; FR-018 depends on §10 + FR-021 + FR-024;
  FR-020 depends on FR-021; FR-022 depends on FR-011; FR-024 depends on FR-004 + FR-018 + FR-020.
- **External deps:** M13 (documents/photos), M12 (SR events via outbox), M02 (edit approvals), KMS +
  Aadhaar vault, notification platform, OIDC/SSO, M10 (disbursement gate), M11 (family pension/DOB).

### 14.3 Parallel-Agent Plan

| Agent track | FRs | Can start when |
|---|---|---|
| A — Master core, API, aliases, backbone | FR-001, FR-019, FR-013, FR-015 | data model + masters + vault ready; **freeze alias/field-access/API contracts** |
| B — Satellites I | FR-003, FR-004, FR-005, FR-006 | A's employees table exists |
| C — Sensitive data + vault | FR-007, FR-008, FR-009 | A + KMS + vault + M13 ready |
| D — Position & time | FR-010, FR-011 (+ position_history, attribute_history) | A ready |
| E — Quality & dedup | FR-014 (advisory), FR-025 | B/C partially ready |
| F — Config (Phase 2) | FR-012 | A ready (deferred) |
| G — Self-service & view | FR-002 (CQRS), FR-016 | A + FR-013 + FR-020 ready (M02 stub ok) |
| H — Migration & lifecycle | FR-017 (PROVISIONAL), FR-018 | A + dedup (E) ready |
| I — Privacy/compliance | FR-020, FR-021, FR-022, FR-023, FR-024 | A + FR-013 + vault ready |

Shared contracts (alias/identity resolution, consumption API + backbone shape, field-access semantics)
are frozen before parallel tracks begin to avoid drift.

### 14.4 Open-Issues Register & Final Contract Reconciliation — *honest, not "0 gaps"*

> Per improvement #22/R21, v1's "0 unresolved gaps / all ✅ Resolved" is replaced with an **honest
> register**: contracts that are fully resolved are marked Resolved; genuinely open items (dependent on
> external owners or Phase 2) are listed openly with an owner and target.

**(a) Resolved contracts**

| Contract item | Defined where | Consumed where | Status |
|---|---|---|---|
| `employees` extended fields (v2: Aadhaar via vault, mononym, record_state) | §5.4 E1 | all FRs, M02–M14 | ✅ Resolved |
| 35 M01-owned tables (E1–E34, import pair = 2) | §5.1 | FRs 001–025 | ✅ Resolved |
| Enum catalog (incl. v2 enums) | §5.5 | all FRs / UI | ✅ Resolved |
| Error-code catalog (incl. v2 codes; DQ-block removed) | §8.2 | all FRs | ✅ Resolved |
| Field-access semantics (correct ref **FR-013**) + hardened break-glass | FR-013, §5.4 E17/E34 | FR-002/007/016/019 | ✅ Resolved |
| Alias identity resolution + RECORDS_MERGED | FR-015, §5.4 E21 | FR-019, M02–M14 | ✅ Resolved |
| Aadhaar Data Vault (Reference-Key) | FR-007, §5.4 E22 | FR-001/007/021 | ✅ Resolved |
| Effective-dated core attributes + positions | FR-011/010, §5.4 E23/E24 | FR-011/022, M06/M11 | ✅ Resolved |
| Optimistic concurrency (row_version) | §2.2, §5.4, §8.2 | all mutable FRs | ✅ Resolved |
| Change-feed backbone (outbox) | §8.5, §5.4 E33 | FR-019, all consumers | ✅ Resolved |
| Advisory completeness (no payroll block) | FR-014 | M14 | ✅ Resolved |
| DPDP consent/rights/breach + retention/legal-hold/erasure | FR-020/021, §5.4 E26–E31 | DPO, M09/M11/M13 | ✅ Resolved |
| Governed DOB/category/name change | FR-022, §5.4 E32 | FR-011, M11/M06 | ✅ Resolved |
| Category/PwD certificates | FR-023, §5.4 E25 | FR-014, M10/M11 | ✅ Resolved |
| Deceased succession + family-pension handoff | FR-024 | M11, FR-020 | ✅ Resolved (M11 owns award) |
| Phonetic/transliteration search | FR-025 | FR-015/019 | ✅ Resolved |
| State machines (incl. record_state, governed change, rights/hold) | §10 | FR-008/015/017/018/020/021/022 | ✅ Resolved |
| Sample data (every entity incl. E21–E34) | §5.7 | build/test seed | ✅ Resolved |

**(b) Open items (owner + target — honest register)**

| # | Open item | Owner | Target / resolution |
|---|---|---|---|
| O1 | Exact statutory retention years per record-class (`retention_policies` seed values) | Program compliance owner | Confirm before go-live (Phase 0). |
| O2 | Aadhaar lawful basis per cohort (AUA/KUA registration vs statute) | Legal/DPO | Confirm before vault enablement (Phase 0). |
| O3 | DPB breach-notification exact timelines/format under DPDP Rules | DPO | Bind when DPDP Rules notified; workflow built, timings configurable. |
| O4 | Custom-field/dynamic-form engine + configurable completeness weighting + merge-undo UI | Product | **Phase 2** (deferred per Clash 2); schema present, engine later. |
| O5 | Biometric vault API contract (opaque ref) | Track C + vendor | Finalised during track C build; M01 stores only opaque ref. |
| O6 | M11 family-pension award creation contract (handoff payload shape) | M11 team | Freeze handoff event with M11 before FR-024 GA. |
| O7 | Indic phonetic algorithm choice + transliteration tables | Track E | Select during FR-025 build; pluggable matcher. |

---

## 15. Glossary

| Term | Definition |
|---|---|
| Golden record / SSOT | The single authoritative employee record all modules read from (this module). |
| 360° profile | Consolidated view aggregating every profile section for one employee (v2: served from a CQRS read projection). |
| Effective dating | Storing changes as time-bounded versions so any past/future state is reconstructable. |
| Point-in-time ("as-of") | A reconstruction of data as it was on a specified date (v2: includes core person attributes + positions). |
| Position | A sanctioned post (org design unit) with strength and reporting edges, distinct from a person (v2: effective-dated). |
| Job assignment | The placement of an employee into a position/designation/org for an effective period. |
| Substantive assignment | The employee's primary/permanent placement (one current at a time). |
| Attribute history | The unified effective-dated spine for core person attributes (name/gender/category/DOB/etc.). |
| Field-access policy | Per-field, per-role rule (FULL/MASKED/HIDDEN) enforced server-side (FR-013). |
| Break-glass (hardened) | A logged, reason-required reveal of a masked field, with volume caps, anomaly detection, real-time alerting, and optional 4-eyes. |
| 4-eyes / SoD | Two-person control; maker ≠ checker on sensitive changes (v2: configurable high-risk field set). |
| Completeness score | Advisory weighted measure of how fully a profile is populated (**never gates pay**). |
| Data-quality flag | CLEAN/REVIEW/NEEDS_ATTENTION advisory indicator (no downstream block). |
| Deduplication (alias) | Detecting duplicate person records and merging into one golden record via an alias map, never re-pointing other modules' rows. |
| `employee_id_aliases` | M01-owned map (`loser_id → survivor_id`) every consumer resolves identity through. |
| Aadhaar Data Vault | A hardened, KMS-encrypted store holding the Aadhaar number only, keyed by an opaque Reference Key (Aadhaar Act / UIDAI alignment). |
| Reference Key | The opaque key linking a profile to its Aadhaar-vault row; the number is never stored elsewhere. |
| CQRS read projection | A materialised, event-maintained read model serving the 360° view within the latency budget. |
| Outbox / change-feed backbone | The transactional `outbox_events` table draining ordered, replayable, tombstoned events to M12 and consumers. |
| Optimistic locking | Concurrency control via `row_version`; mismatch → `STALE_VERSION` 409. |
| PROVISIONAL / QUARANTINE | A migration record state: committed with known gaps, login-disabled, remediation-queued. |
| Governed change | A statutorily-controlled, evidence-bound, limited-alteration change (DOB/category/name) via FR-022. |
| Legal hold | A flag blocking purge/erasure for disciplinary/litigation/pension/audit/RTI reasons. |
| Data Protection Officer (DPO) | Independent role overseeing consent, rights, break-glass, breach, and erasure sign-off. |
| Data-principal rights | DPDP rights: access, correction, erasure, export, nomination, consent withdrawal, grievance. |
| Outbox pattern | Transactional event emission ensuring SR/feed events are never lost. |
| DPDP Act 2023 | India's Digital Personal Data Protection Act governing PII handling. |
| Aadhaar Act 2016 | The Act (and UIDAI Data Vault circular) governing Aadhaar storage and use. |
| Digital SR | The statutory Digital Service Register (Module 12). |
| Tokenisation | Replacing a sensitive value (PAN/account no.) with an encrypted token. |
| Family pension | The pension payable to a deceased employee's eligible heir/recipient (award owned by M11). |
| Creamy layer | OBC reservation-exclusion status; tracked on the OBC certificate (FR-023). |
| UDID | Unique Disability ID card; basis for PwD benefit eligibility (≥40%). |

## 16. Appendices

### Appendix A — `service_no` generation pattern
Configurable pattern, default `GOV-{seq:04}` (zero-padded sequence), with optional org/cadre prefix;
uniqueness enforced; collisions retried server-side.

### Appendix B — Default field-access policy seed (illustrative, v2)

| Field path | Employee(self) | Reporting Mgr | HR Officer | HR Admin | DPO | Auditor |
|---|---|---|---|---|---|---|
| `employees.pan` | FULL | HIDDEN | MASKED (4-eyes write) | FULL(reason) | MASKED | MASKED |
| `aadhaar_vault.aadhaar_number` | MASKED | HIDDEN | HIDDEN | FULL(reason+4-eyes, capped) | MASKED(audit) | MASKED |
| `employees.religion` | FULL | HIDDEN | HIDDEN | FULL | MASKED | MASKED |
| `employees.category` | FULL | HIDDEN | MASKED | FULL (4-eyes write) | MASKED | MASKED |
| `employees.dob` | FULL | MASKED | FULL (governed write) | FULL (governed write) | MASKED | FULL |
| `employee_bank_accounts.account_number` | MASKED | HIDDEN | MASKED | FULL(reason+4-eyes) | HIDDEN | MASKED |
| `employee_photos.biometric_template_ref` | HIDDEN | HIDDEN | HIDDEN | FULL(consent) | MASKED | MASKED |

> Special-category fields (`religion`, `category`, `disability`, biometric) carry
> `is_special_category=true`; reveals are capped and real-time-alerted (FR-013).

### Appendix C — Completeness weighting (default, **fixed in v1**; configurable in Phase 2)

| Section | Weight |
|---|---|
| Personal (mandatory core) | 25 |
| Contact & address | 15 |
| Job/position placement | 15 |
| Statutory IDs (verified) | 15 |
| Bank (verified primary) | 15 |
| Education/experience | 10 |
| Dependents/nominees/emergency | 5 |

### Appendix D — Import template columns (v1.2, abridged; Aadhaar loaded to vault, not profile)
`legacy_id, service_no, salutation, first_name, middle_name, last_name, has_single_legal_name, dob,
gender, marital_status, nationality, category, pan, aadhaar(→vault), date_of_joining, employment_type,
cadre, designation_code, org_unit_code, position_code, mobile, official_email, permanent_address_*,
present_address_*, bank_name, ifsc, account_number, account_type, highest_qualification,
category_certificate_*, pwd_udid_*, validation_profile, ...`

### Appendix E — Assumptions & open items (expanded; see also §14.4 open register)
1. Master reference data (org_units, designations, cadres, pay_scales) is loaded/owned outside M01 and
   available at build time.
2. M13/M12/M02/notification/KMS service contracts are available as referenced; the **Aadhaar vault + KMS**
   are provisioned in Phase 0.
3. Biometric capture/matching engine integration details (vault API) are finalised during track C build —
   M01 stores only opaque references (O5).
4. Exact statutory retention periods (O1), Aadhaar lawful basis (O2), and DPB breach timelines (O3) are
   confirmed with the program's compliance owner/DPO before go-live.
5. **Phase 2 items** (custom-field engine, configurable completeness weighting, merge-undo UI beyond the
   alias mechanism) are deferred by design (O4, Clash 2).
6. **M11 owns the family-pension award**; M01 provides the heir/recipient handoff only (O6).

### Appendix F — Council Risk → Mitigation Cross-Reference (all 22)

| Risk | Severity | Mitigated by |
|---|---|---|
| R1 Aadhaar vault / biometric isolation | Critical | FR-007 (E22 vault), FR-009 (biometric isolation), §4.4 |
| R2 Cross-module merge | Critical | FR-015 + E21 aliases; §4.3 #7; §5.6 r11 |
| R3 DQ blocks payroll | Critical | FR-014 advisory; M10 owns `NO_VERIFIED_BANK`; §1.1 |
| R4 DPDP rights/governance unbuilt | High | FR-020, FR-021; E26–E31; DPO role |
| R5 Person attributes overwritten | High | FR-011 + E23 attribute history |
| R6 Governed DOB/category change | High | FR-022 + E32 |
| R7 Break-glass exfiltration | High | FR-013 hardened + E34; §4.4 |
| R8 Migration target infeasible | High | FR-017 PROVISIONAL + §13 glide path |
| R9 Positions not effective-dated | High | FR-010 + E24 position_history |
| R10 Audit-on-read synchronous | Medium | §4.4/§9 async audit sink |
| R11 360° read model undefined | Medium | FR-002 CQRS projection + §9 budget |
| R12 Denormalisation trigger | Medium | FR-010 service-layer sync; §5.6 r2 |
| R13 No optimistic lock | Medium | row_version everywhere; §5.6 r16; `STALE_VERSION` |
| R14 Change-feed undefined | Medium | §8.5 backbone + E33 outbox |
| R15 Mononym rejection | Medium | §5.4 E1 nullable last_name + flag |
| R16 Deceased succession | Medium | FR-024 |
| R17 Category/PwD certificates | Medium | FR-023 + E25 |
| R18 Wrong FR ref / entity count | Low | §3/§4.3 cite FR-013; §5.1 count stated once |
| R19 Phonetic/transliteration search | Low | FR-025 |
| R20 4-eyes only on bank | Low | E17 `requires_four_eyes`; FR-007/022/004 |
| R21 "0 gaps" overstated | Low | §14.4 honest open-issues register |
| R22 Foreign nationals / unique email | Low | §5.6 r9 conditional IDs; r17 unique official_email |

---

*End of M01-EPM BRD v2.0 — 25 functional requirements; 34 entities (E1–E34, 35 tables); 22 council
improvements incorporated; honest open-issues register (7 open items with owners/targets) replaces the
v1 "0 gaps" claim.*

