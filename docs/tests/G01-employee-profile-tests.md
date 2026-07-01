# G01 — Employee Profile Management — Acceptance & E2E Test Suite

## 1. Header

- **Module:** G01 — Employee Profile Management (`docs/brd/v3/G01-employee-profile-management.md`, v3.1; v3.2 field-reconciliation additions covered by TC-G01-131 … 148)
- **Contract sources (every test grounded in):**
  - Requirements/FRs & business rules — BRD §6 (FR-EPM-001 … FR-EPM-025), §5.6 data-integrity rules, §8.2.1 semantic reasons, §8.5 change-feed backbone, §8.6 SR posting contract.
  - API endpoints, request/response, status codes — `docs/contracts/openapi/G01.yaml`.
  - Error codes / `details.reason` discriminators — `docs/contracts/error-taxonomy.yaml` (§2 the 8 wire codes, module `G01` `ERR-G01-*`) reconciled with BRD §8.2.1.
  - Lifecycle transitions — `docs/contracts/state-machines.yaml` module `G01` (machines: `employee_record`, `bank_account`, `governed_field_change`, `data_principal_request`, `import_batch`).
  - Roles / actions / PII tiers / masking — `docs/contracts/auth-matrix.yaml` (§1 roles, §3 PII tiers, §4 matrix `G01`, §5 resolution order).
- **Scope:** All 25 functional requirements plus the cross-cutting enforcement surfaces (field masking FR-013, alias resolution FR-015, change-feed/SR-post FR-019/§8.6) and the key cross-module E2E flows (identity change → SR ingest; G02 commit → SR; import → lifecycle; DECEASED → G11 handoff). FR-EPM-012 (custom fields) is **Phase 2 — deferred**; its schema-empty / config-surface behaviour is covered minimally and flagged.

### 1.1 Traceability approach

Every test carries a **Traces-to** field naming the FR id and the specific Acceptance Criterion (`AC-n`), Business Rule (`BR`), Edge Case, data-integrity rule (`§5.6 rN`), state transition, or auth-matrix action it exercises. §3 gives the full FR → TC matrix and asserts 0 gaps. Negative tests assert the exact `{HTTP status, wire code, details.reason, ERR-* message id}`. API-contract tests assert the exact `{method, path, status}` from `G01.yaml`.

### 1.2 Test-environment & data assumptions

- **Multi-tenancy:** every request carries a resolved `tenant_id` + `entity_id` in the bearer JWT scope (Platform §3.1); a query with no resolvable tenant scope is **rejected, not defaulted to all** (auth-matrix resolution_order step 7). Tenant isolation is asserted explicitly (TC-G01-096).
- **Base tenant:** `tenant_id = TEN-1`, primary entity `entity_id = ENT-1`; a second isolation tenant `TEN-2 / ENT-2` exists for cross-tenant negative tests.
- **Correlation:** every response returns `X-Correlation-Id` (header, never a body field); every 4xx/5xx returns the canonical `error` envelope only.
- **Idempotency:** state-changing / workflow POSTs send `Idempotency-Key`; a repeat within 24 h returns the original result.
- **Concurrency:** mutable entities carry `row_version`; writes send the expected version / `If-Match` etag.

### 1.3 Seed personas (per auth-matrix §1 roles)

| Persona | `role_code` / flags | Scope | Notes |
|---|---|---|---|
| `u_hradmin1` | `hr_admin` | entity ENT-1 | maker for sensitive commits; full TIER-1/2 (TIER-1 edits E·AR) |
| `u_hradmin2` | `hr_admin` | entity ENT-1 | independent checker (4-eyes / SoD counter-party) |
| `u_hrofficer` | `hr_admin` (HR Officer sub-grant, masked) | entity ENT-1 | maker; sees TIER-1 masked |
| `u_officeadmin` | `office_admin` | entity ENT-1 | fixed grant: national-ID + DOB view, bank entry masked-to-last-4 |
| `u_financeadmin` | `finance_admin` | entity ENT-1 | TIER-2 view (no edit); TIER-1 hidden |
| `u_mgrL1` | `l1_manager` | team | TIER-0 + employment only; TIER-1/2 hidden |
| `u_hod` | `hod` | entity ENT-1 | directory read; can place legal hold |
| `u_dpo` | `dpo` | tenant TEN-1 | DPDP rights, erasure sign-off, break-glass oversight; no HR writes |
| `u_srcustodian` | `sr_custodian` | entity ENT-1 | SR effect / legal hold placement |
| `u_appauth` | `appointing_authority` (MFA) | entity ENT-1 | governed-field / statutory approver |
| `u_emp_own` | `employee` | self (EMP-1001) | own profile; self-service |
| `u_emp_other` | `employee` | self (EMP-2002) | used for cross-employee 403 tests |
| `u_svc_g11` | machine principal (G11) | entity ENT-1 | consumption-API + change-feed consumer |
| `u_tenant2_hr` | `hr_admin` | entity ENT-2 (TEN-2) | tenant-isolation counter-party |

**Seed employees:** `EMP-1001` (ACTIVE, PERMANENT, Indian national, full profile, `GOV-0001`); `EMP-1002` (ACTIVE, mononym `Lalmuanpuia`); `EMP-1003` (PROVISIONAL via migration, missing DOB); `EMP-1070` merged loser → survivor `EMP-1007`; `EMP-1008` (SEPARATED/RETIRED); `EMP-1009` (ACTIVE, marked for DECEASED tests); `EMP-2002` (other-scope). Priorities: **P1** statutory/security/data-integrity/SoD; **P2** core functional/state; **P3** advisory/UX/secondary.

---

## 2. Test Cases

### FR-EPM-001 — Create Employee Profile on Hire

#### TC-G01-001
- **Traces-to:** FR-EPM-001 AC-1/2/4/5/6/7/8; auth `epm.employee.manage`
- **Type:** E2E-Flow · **Priority:** P1
- **Title:** Create a complete permanent employee via the hire wizard (golden path)
- **Preconditions:** `u_hradmin1` authenticated, scope includes `org-22`; active `privacy_notice` `PROFILE_PROCESSING v1`.
- **Test data:** first_name=Anita, last_name=Sharma, dob=1990-01-01, gender=FEMALE, date_of_joining=2014-07-01, employment_type=PERMANENT, designation_id=desig-110, org_unit_id=org-22, appointing_authority_ref=GO-2014-7781, pan=ABCPS1234K, consent GRANTED.
- **Steps:**
  1. `POST /api/v1/employees/service-no/preview` → note next `service_no`.
  2. `POST /api/v1/employees/dedup-precheck` with the name/dob → expect empty/low candidates.
  3. `POST /api/v1/employees` with `Idempotency-Key`, full body.
  4. Read the created record via `GET /api/v1/employees/{id}`.
- **Expected result:** `201`; body has `employment_status=ACTIVE`, `record_state=ACTIVE`, non-null `current_assignment_id`, `service_no` matching preview, `sr_event_id` set, `row_version=1`, advisory `profile_completeness_pct` present. Exactly one `employee_job_assignments` (reason HIRE), core `employee_attribute_history` rows (effective_from=DOJ), one `consent_records` GRANTED (IDENTITY_DISPLAY), one `outbox_events` `PROFILE_CREATED`, one `audit_log` CREATE — all in one transaction.

#### TC-G01-002
- **Traces-to:** FR-EPM-001 AC-1 (mononym, improvement #17); §5.6
- **Type:** Boundary · **Priority:** P2
- **Title:** Create mononym employee with `has_single_legal_name=true` and no last_name
- **Preconditions:** `u_hradmin1`.
- **Test data:** first_name=Lalmuanpuia, has_single_legal_name=true, last_name=null, dob=1990-01-01, gender=MALE, doj=2014-07-01, employment_type=PERMANENT, designation_id=desig-110, org_unit_id=org-22, appointing_authority_ref=GO-1.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `201`; record created; `display_name` = single legal name; no VALIDATION_FAILED for the absent `last_name`.

#### TC-G01-003
- **Traces-to:** FR-EPM-001 AC-1; Failure Handling
- **Type:** Negative · **Priority:** P1
- **Title:** Reject create missing a mandatory field
- **Test data:** body omits `date_of_joining`.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `422 VALIDATION_FAILED`; `error.field="date_of_joining"`; envelope only; `X-Correlation-Id` header present.

#### TC-G01-004
- **Traces-to:** FR-EPM-001 BR (age ≥ 18 on DOJ)
- **Type:** Boundary · **Priority:** P2
- **Title:** Reject STRICT create where employee is < 18 on date_of_joining
- **Test data:** dob=2000-06-01, date_of_joining=2016-01-01 (15y).
- **Steps:** 1. `POST /api/v1/employees` (STRICT).
- **Expected result:** `422 VALIDATION_FAILED`, `details.reason=OUT_OF_RANGE` (`ERR-G01-RANGE`), `field="dob"`. (Relaxed only under MIGRATION profile — see TC-G01-069.)

#### TC-G01-005
- **Traces-to:** FR-EPM-001 BR (future DOJ beyond pre-hire window, default 90d)
- **Type:** Boundary · **Priority:** P3
- **Title:** Reject date_of_joining beyond the pre-hire window
- **Test data:** date_of_joining = today + 120 days.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `422 VALIDATION_FAILED` (message id `ERR-PAST-DATED` / out-of-window), `field="date_of_joining"`.

#### TC-G01-006
- **Traces-to:** FR-EPM-001 AC-3; FR-EPM-015 AC-2; Failure Handling
- **Type:** Negative · **Priority:** P1
- **Title:** Dedup HIGH match (≥90) blocks auto-create and routes to review
- **Preconditions:** existing `EMP-1001` with same PAN.
- **Test data:** create body reuses PAN=ABCPS1234K.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `409 CONFLICT`, `details.reason=DUPLICATE_CANDIDATE`, message id `ERR-DUP-INSTANCE`; no employee row created; a `dedup_candidates` OPEN row exists.

#### TC-G01-007
- **Traces-to:** FR-EPM-001 AC-3; FR-EPM-025
- **Type:** API-Contract · **Priority:** P2
- **Title:** Pre-submit phonetic-aware dedup precheck returns scored candidates
- **Steps:** 1. `POST /api/v1/employees/dedup-precheck` `{first_name:"Anitha", dob:"1990-01-01"}`.
- **Expected result:** `200`; `candidates[]` each with `score`, `matched_attributes[]`, `status`; endpoint+status match `G01.yaml`.

#### TC-G01-008
- **Traces-to:** FR-EPM-001 AC-2; §5.6 r3 (service_no unique)
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** service_no collision retries server-side and stays unique
- **Steps:** 1. Fire two concurrent `POST /api/v1/employees` that would draw the same next number.
- **Expected result:** both `201` with **distinct** `service_no`; no duplicate across non-deleted rows.

#### TC-G01-009
- **Traces-to:** FR-EPM-001 AC-4/6; Failure Handling (tx rollback)
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Atomic hire — outbox failure rolls back the whole create
- **Preconditions:** fault-inject the `outbox_events` insert to fail.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `500 INTERNAL`; **no** `employees`, `employee_job_assignments`, `employee_attribute_history`, `consent_records`, or `outbox_events` rows persisted (full rollback).

#### TC-G01-010
- **Traces-to:** FR-EPM-001 BR (Appointing-Authority sanction for PERMANENT)
- **Type:** Negative · **Priority:** P2
- **Title:** PERMANENT hire without `appointing_authority_ref` is rejected
- **Test data:** employment_type=PERMANENT, appointing_authority_ref=null.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `422 VALIDATION_FAILED`, `field="appointing_authority_ref"`.

#### TC-G01-011
- **Traces-to:** FR-EPM-001 BR; §5.6 r9 (conditional statutory IDs)
- **Type:** Boundary · **Priority:** P2
- **Title:** Foreign-national consultant exempt from PAN/Aadhaar
- **Test data:** nationality=FOREIGN, employment_type=CONTRACT, pan=null, aadhaar=null, passport supplied.
- **Steps:** 1. `POST /api/v1/employees`.
- **Expected result:** `201`; no statutory-ID validation failure (exemption honoured).

---

### FR-EPM-002 — 360° Consolidated Profile View (CQRS)

#### TC-G01-012
- **Traces-to:** FR-EPM-002 AC-1/3; API `GET /employees/{id}/profile-360`
- **Type:** Functional · **Priority:** P1
- **Title:** Assemble the 360° view from the CQRS projection
- **Preconditions:** `u_hradmin1`; `EMP-1001` fully populated; projection synced.
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/profile-360`.
- **Expected result:** `200`; `employee` header (photo, display_name, service_no, designation, org_unit, status, completeness), `sections` object, `_meta.etag` and `_meta.projection_synced_at`. All sections assembled (person/contact/address/dependents/nominees/education/identity(masked)/bank(masked)/certificates/placement).

#### TC-G01-013
- **Traces-to:** FR-EPM-002 AC-2/5; FR-EPM-013; auth `epm.profile.view_team`; PII TIER-1/2
- **Type:** PII-Masking · **Priority:** P1
- **Title:** Reporting Manager sees TIER-0 + masked/hidden TIER-1/2
- **Preconditions:** `u_mgrL1` manages `EMP-1001`.
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/profile-360`.
- **Expected result:** `200`; `pan` masked (e.g. `ABCPS****K`), `aadhaar_masked` only, `category="[HIDDEN]"`, `religion=null`; `_meta.masked_fields` includes pan/aadhaar, `_meta.hidden_fields` includes religion/category; salary/DOB (TIER-2) hidden; sections the manager cannot see are **omitted, not empty** (AC-5).

#### TC-G01-014
- **Traces-to:** FR-EPM-002 AC-6, Edge (separated/archived)
- **Type:** State-Transition · **Priority:** P3
- **Title:** Separated employee 360° is read-only with watermark
- **Steps:** 1. `u_hradmin1` `GET /api/v1/employees/{EMP-1008}/profile-360`.
- **Expected result:** `200`; no edit affordances; read-only/watermark flag present; still masked per policy.

#### TC-G01-015
- **Traces-to:** FR-EPM-002 Edge (merged loser id); FR-EPM-015 AC-4
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Requesting a merged loser id resolves to survivor 360°
- **Steps:** 1. `GET /api/v1/employees/{EMP-1070}/profile-360` (loser).
- **Expected result:** `200`; returns survivor `EMP-1007`'s profile (alias-transparent); no leak of a separate loser record.

#### TC-G01-016
- **Traces-to:** FR-EPM-002 AC-2/4; FR-EPM-013 AC-3
- **Type:** API-Contract · **Priority:** P2
- **Title:** Lazy-load a single section; break-glass reason recorded for restricted read
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/sections/bank_accounts`. 2. `POST /api/v1/employees/{EMP-1001}/break-glass` `{reason:"Audit INC-9"}`.
- **Expected result:** section `200` masked; break-glass `200` Acknowledgement; reason persisted (async-audited to security_audit_log).

---

### FR-EPM-003 — Contacts & Addresses

#### TC-G01-017
- **Traces-to:** FR-EPM-003 AC-1/2; §5.6 r4 (single primary)
- **Type:** Functional · **Priority:** P2
- **Title:** Add a contact and atomically re-designate the primary
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/contacts` `{type:MOBILE,value:"+919812345678",is_primary:true}`. 2. Add a second MOBILE with `is_primary:true`.
- **Expected result:** both `201`; after step 2 the prior primary auto-demoted; exactly one `is_primary=true` per (employee, MOBILE).

#### TC-G01-018
- **Traces-to:** FR-EPM-003 AC-7; §5.6 r17 (unique official_email)
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Duplicate official_email across non-deleted employees is rejected
- **Preconditions:** `anita.sharma@gov.in` already used by `EMP-1001`.
- **Steps:** 1. `POST /api/v1/employees/{EMP-1002}/contacts` `{type:OFFICIAL_EMAIL,value:"anita.sharma@gov.in"}`.
- **Expected result:** `409 CONFLICT`; no row created.

#### TC-G01-019
- **Traces-to:** FR-EPM-003 Edge (removing only primary); §8.2.1 PRIMARY_REQUIRED
- **Type:** Negative · **Priority:** P2
- **Title:** Removing the sole primary contact is blocked
- **Steps:** 1. `DELETE /api/v1/employees/{EMP-1001}/contacts/{onlyPrimaryId}`.
- **Expected result:** `409 CONFLICT`, `details.reason=PRIMARY_REQUIRED`, message id `ERR-G01-INVARIANT`.

#### TC-G01-020
- **Traces-to:** FR-EPM-003 AC-8; §5.6 r16 (optimistic concurrency)
- **Type:** Negative · **Priority:** P1
- **Title:** Stale row_version on contact update → STALE_VERSION
- **Steps:** 1. Read contact (row_version=3). 2. `PATCH /api/v1/employees/{EMP-1001}/contacts/{id}` with row_version=2.
- **Expected result:** `409 CONFLICT`, `details.reason=STALE_VERSION`, message id `ERR-G01-STALE`.

#### TC-G01-021
- **Traces-to:** FR-EPM-003 AC-5 (address effective-dating)
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** New address closes the prior current row — no overlap
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/addresses` a new PRESENT address valid_from=2026-01-01.
- **Expected result:** `201`; prior current PRESENT address `valid_to` set to 2025-12-31 (or new_from−1); no overlapping `[valid_from,valid_to]`; new row `is_current=true`.

#### TC-G01-022
- **Traces-to:** FR-EPM-003 AC-6; auth `epm.profile.edit_own_limited` (E·AR → G02)
- **Type:** Authorization · **Priority:** P2
- **Title:** Employee self-edit of contact creates a G02 request, not a direct write
- **Steps:** 1. `u_emp_own` `POST /api/v1/me/change-requests` for a contact change.
- **Expected result:** G02 change request created; **no** direct mutation to `employee_contacts`; master unchanged until G02 commit.

#### TC-G01-023
- **Traces-to:** FR-EPM-003 AC-1/3 (format validation)
- **Type:** Negative · **Priority:** P3
- **Title:** Invalid email / pincode format rejected
- **Test data:** email="not-an-email"; address pincode="12".
- **Steps:** 1. `POST` contact then address.
- **Expected result:** `422 VALIDATION_FAILED` with offending `field` (VAL-PINCODE / RFC 5322).

---

### FR-EPM-004 — Dependents, Nominees & Legal Heirs

#### TC-G01-024
- **Traces-to:** FR-EPM-004 AC-3; §5.6 r5 (shares sum 100)
- **Type:** Functional · **Priority:** P2
- **Title:** Nominee allocation saves when shares sum to 100 per benefit_type
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/nominees` two PF nominees 60+40. 2. `POST /api/v1/employees/{EMP-1001}/nominees:validate-shares`.
- **Expected result:** validate `200` (sum=100); set persisted.

#### TC-G01-025
- **Traces-to:** FR-EPM-004 AC-3; §8.2.1 SHARE_SUM_INVALID
- **Type:** Negative · **Priority:** P1
- **Title:** Nominee shares ≠ 100 rejected on save of the set
- **Test data:** PF nominees 60+30 (=90).
- **Steps:** 1. Save the nominee set.
- **Expected result:** `409 CONFLICT`, `details.reason=SHARE_SUM_INVALID`, message id `ERR-G01-INVARIANT`.

#### TC-G01-026
- **Traces-to:** FR-EPM-004 AC-4 (minor guardian)
- **Type:** Negative · **Priority:** P2
- **Title:** Minor nominee without guardian_name rejected
- **Test data:** nominee dob makes is_minor=true, guardian=null.
- **Steps:** 1. `POST` nominee.
- **Expected result:** `422 VALIDATION_FAILED`, `field="guardian"`.

#### TC-G01-027
- **Traces-to:** FR-EPM-004 AC-7 / BR; auth SoD "maker != checker"; §8.2.1 SOD_VIOLATION
- **Type:** Authorization · **Priority:** P1
- **Title:** PENSION/GRATUITY nominee 4-eyes — maker cannot self-approve
- **Steps:** 1. `u_hradmin1` `POST` PENSION nominee (pending). 2. Same `u_hradmin1` `POST /api/v1/nominees/{id}:approve`.
- **Expected result:** approve `403 FORBIDDEN`, `details.reason=SOD_VIOLATION`, message id `ERR-FORBIDDEN`. 3. `u_hradmin2` approves → `200`; `NOMINEE_UPDATED` emitted to G12 via outbox.

#### TC-G01-028
- **Traces-to:** FR-EPM-004 AC-6 (legal heir + rank); FR-EPM-024 linkage
- **Type:** Functional · **Priority:** P2
- **Title:** Record legal heir with succession rank
- **Steps:** 1. `POST /api/v1/employees/{EMP-1009}/dependents` `{is_heir:true, ...}` then set `heir_succession_rank=1`.
- **Expected result:** `201`; `is_legal_heir=true`, rank stored; surfaced to FR-024 on DECEASED.

#### TC-G01-029
- **Traces-to:** FR-EPM-004 Edge (delete referenced dependent)
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** Deleting a dependent referenced by a nominee/heir is blocked
- **Steps:** 1. `DELETE` a dependent that a nominee references.
- **Expected result:** `409 CONFLICT` (IN_USE / FK guard); dependent retained.

---

### FR-EPM-005 — Emergency Contacts

#### TC-G01-030
- **Traces-to:** FR-EPM-005 AC-1/2/4
- **Type:** Functional · **Priority:** P3
- **Title:** Add and reorder emergency contacts; priorities re-sequenced atomically
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/emergency-contacts` two contacts. 2. `PATCH …/emergency-contacts:reorder` swap order.
- **Expected result:** `201`/`200`; priorities unique per employee, resequenced in one tx.

#### TC-G01-031
- **Traces-to:** FR-EPM-005 AC-2 (priority uniqueness); §5.6 r16
- **Type:** Data-Integrity · **Priority:** P3
- **Title:** Reorder race returns STALE_VERSION and retries cleanly
- **Steps:** 1. Two concurrent reorders on the same list.
- **Expected result:** one `200`, the other `409 STALE_VERSION` (`ERR-G01-STALE`); final priorities remain unique.

#### TC-G01-032
- **Traces-to:** FR-EPM-005 AC-1 (valid phone)
- **Type:** Negative · **Priority:** P3
- **Title:** Invalid emergency phone rejected
- **Steps:** 1. `POST` contact phone="123".
- **Expected result:** `422 VALIDATION_FAILED`, `field="phone"`.

---

### FR-EPM-006 — Education, Qualifications & Experience

#### TC-G01-033
- **Traces-to:** FR-EPM-006 AC-1; §5.6 r4 (one is_highest)
- **Type:** Functional · **Priority:** P2
- **Title:** Setting a new highest qualification demotes the prior
- **Steps:** 1. `POST` education is_highest=true (Masters) over an existing highest (Bachelors).
- **Expected result:** `201`; exactly one `is_highest=true`; prior demoted.

#### TC-G01-034
- **Traces-to:** FR-EPM-006 AC-4; §8.2.1 IMMUTABLE_VERIFIED
- **Type:** Negative · **Priority:** P2
- **Title:** Editing a verified education row without Admin is forbidden
- **Preconditions:** row `is_verified=true`; caller `u_hrofficer` (non-Admin).
- **Steps:** 1. `PATCH /api/v1/employees/{id}/education/{eduId}`.
- **Expected result:** `403 FORBIDDEN`, `details.reason=IMMUTABLE_VERIFIED`, message id `ERR-FORBIDDEN`.

#### TC-G01-035
- **Traces-to:** FR-EPM-006 AC-2 (bounds)
- **Type:** Boundary · **Priority:** P3
- **Title:** year_of_passing and experience date bounds enforced
- **Test data:** year_of_passing=1949; then experience from_date=2020-01-01, to_date=2019-01-01.
- **Steps:** 1. `POST` education; 2. `POST` experience.
- **Expected result:** both `422 VALIDATION_FAILED` (1950..current; from ≤ to).

#### TC-G01-036
- **Traces-to:** FR-EPM-006 AC-3 (gov service → pension); §8.6 QUALIFICATION_ADDED
- **Type:** Functional · **Priority:** P3
- **Title:** Government-service experience contributes to pensionable summary and can emit QUALIFICATION_ADDED
- **Steps:** 1. `POST` experience `is_government_service=true`. 2. Add a qualifying qualification.
- **Expected result:** `201`; pensionable-service summary reflects the gov service (read by G11); qualification advancing increment emits `QUALIFICATION_ADDED` to the SR outbox.

---

### FR-EPM-007 — Identity & Aadhaar Vault

#### TC-G01-037
- **Traces-to:** FR-EPM-007 AC-1/2; §5.6 r6/r19 (Aadhaar single home)
- **Type:** Functional · **Priority:** P1
- **Title:** Aadhaar save stores only ref-key + mask; number lives only in the vault
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/identity-docs` type=AADHAAR valid number + lawful_basis.
- **Expected result:** `201`; response returns `number_masked` only; `aadhaar_vault` holds the KMS-encrypted number + `aadhaar_ref_key`; **no** other table stores the raw/tokenised Aadhaar; `hash_for_dedup` computed.

#### TC-G01-038
- **Traces-to:** FR-EPM-007 AC-1; §8.2.1 INVALID_ID
- **Type:** Negative · **Priority:** P1
- **Title:** Invalid Aadhaar checksum rejected
- **Test data:** Aadhaar failing Verhoeff.
- **Steps:** 1. `POST` identity-doc AADHAAR.
- **Expected result:** `422 VALIDATION_FAILED`, `details.reason=INVALID_ID`, message id `ERR-G01-IDFMT`; nothing written to vault.

#### TC-G01-039
- **Traces-to:** FR-EPM-007 BR (lawful_basis mandatory)
- **Type:** Negative · **Priority:** P2
- **Title:** Aadhaar write without lawful_basis rejected
- **Steps:** 1. `POST` AADHAAR with `lawful_basis` absent.
- **Expected result:** `422 VALIDATION_FAILED`, `field="lawful_basis"`; no vault row.

#### TC-G01-040
- **Traces-to:** FR-EPM-007 AC-3; FR-EPM-013; auth PII TIER-1
- **Type:** PII-Masking · **Priority:** P1
- **Title:** No read API returns the raw Aadhaar/token
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/identity-docs` as `u_hradmin1`.
- **Expected result:** `200`; `number_masked` only; raw `*_token` / vault number never in body or logs (§5.6 r6).

#### TC-G01-041
- **Traces-to:** FR-EPM-007 AC-3; FR-EPM-013 AC-6; §8.3(d)
- **Type:** Authorization · **Priority:** P1
- **Title:** Aadhaar reveal requires HR Admin + 4-eyes + reason
- **Steps:** 1. `u_hradmin1` `POST /api/v1/employees/{EMP-1001}/aadhaar:reveal` `{field_path, reason:"Pension KYC INC-4571", four_eyes_approver_id:u_hradmin2}`.
- **Expected result:** `200` BreakGlassReveal with `value`, `reveal_id`, `window_remaining`, `audit_enqueued=true`; `break_glass_reveals` row written; async PII_READ audit.

#### TC-G01-042
- **Traces-to:** FR-EPM-007 AC-3; FR-EPM-013 AC-3; §8.2.1 REASON_REQUIRED
- **Type:** Negative · **Priority:** P1
- **Title:** Reveal without a reason is rejected
- **Steps:** 1. `POST …/aadhaar:reveal` with `reason` absent.
- **Expected result:** `422 VALIDATION_FAILED`, `details.reason=REASON_REQUIRED`, message id `ERR-REASON-REQ`.

#### TC-G01-043
- **Traces-to:** FR-EPM-007 AC-7; §5.6 r19 (unique hash)
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Duplicate Aadhaar detected via vault hash → dedup candidate, no second vault row
- **Preconditions:** Aadhaar already in vault for `EMP-1001`.
- **Steps:** 1. `POST` the same Aadhaar for `EMP-1002`.
- **Expected result:** `409 CONFLICT` + a `dedup_candidates` row raised (matched via `hash_for_dedup` without decryption); no duplicate vault row.

#### TC-G01-044
- **Traces-to:** FR-EPM-007 Edge (KMS down); §8.2.1 KMS_UNAVAILABLE
- **Type:** Negative · **Priority:** P1
- **Title:** Aadhaar write fails closed when KMS is unavailable
- **Preconditions:** KMS injected as down.
- **Steps:** 1. `POST` AADHAAR.
- **Expected result:** `500 INTERNAL`, `details.reason=KMS_UNAVAILABLE`, message id `ERR-LOADFAIL`; **no plaintext persisted anywhere** (fail-closed).

#### TC-G01-045
- **Traces-to:** FR-EPM-007 AC-5 (expiry alerts)
- **Type:** API-Contract · **Priority:** P3
- **Title:** Expiring-documents report lists docs within 90/30/7-day windows
- **Steps:** 1. `GET /api/v1/identity-docs/expiring`.
- **Expected result:** `200`; docs due to expire enumerated with window band.

---

### FR-EPM-008 — Bank & Financial Details (4-eyes)

#### TC-G01-046
- **Traces-to:** FR-EPM-008 AC-2/3; state-machine `bank_account` PENDING_APPROVAL→ACTIVE
- **Type:** State-Transition · **Priority:** P1
- **Title:** Bank account 4-eyes create → approve → ACTIVE, prior primary demoted
- **Steps:** 1. `u_hradmin1` `POST /api/v1/employees/{EMP-1001}/bank-accounts` (valid IFSC, primary). → PENDING. 2. `u_hradmin2` `POST /api/v1/bank-accounts/{id}:approve`.
- **Expected result:** create `201` status=PENDING; approve `200` status=APPROVED/ACTIVE; exactly one `is_primary_salary=true`; prior primary demoted in same tx; `BANK_DETAIL_CHANGED` notification sent.

#### TC-G01-047
- **Traces-to:** FR-EPM-008 AC-3; §8.2.1 SOD_VIOLATION
- **Type:** Authorization · **Priority:** P1
- **Title:** Maker cannot approve own bank change
- **Steps:** 1. `u_hradmin1` creates; 2. same `u_hradmin1` approves.
- **Expected result:** approve `403 FORBIDDEN`, `details.reason=SOD_VIOLATION`, message id `ERR-FORBIDDEN`.

#### TC-G01-048
- **Traces-to:** FR-EPM-008 AC-1; VAL-IFSC
- **Type:** Negative · **Priority:** P2
- **Title:** Invalid IFSC rejected
- **Test data:** ifsc="BADIFSC".
- **Steps:** 1. `POST` bank-account.
- **Expected result:** `422 VALIDATION_FAILED`, `field="ifsc"`.

#### TC-G01-049
- **Traces-to:** FR-EPM-008 AC-5; FR-EPM-014 BR (G01 never blocks pay)
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Unverified/absent primary bank does not set any payroll block in G01
- **Steps:** 1. Leave `EMP-1001` primary bank unverified. 2. Inspect consumption projection / any status flags.
- **Expected result:** G01 exposes the primary (masked) but sets **no** disbursement-blocking flag; the `NO_VERIFIED_BANK` gate is owned by G10 (assert G01 emits no payroll-blocking error/state).

#### TC-G01-050
- **Traces-to:** FR-EPM-008 AC-7; §5.6 r16
- **Type:** Negative · **Priority:** P2
- **Title:** Stale row_version on bank update → STALE_VERSION
- **Steps:** 1. `PATCH /api/v1/employees/{id}/bank-accounts` with stale row_version.
- **Expected result:** `409 CONFLICT`, `details.reason=STALE_VERSION`, message id `ERR-G01-STALE`.

#### TC-G01-051
- **Traces-to:** FR-EPM-008 state-machine `bank_account` PENDING_APPROVAL→REJECTED
- **Type:** State-Transition · **Priority:** P2
- **Title:** Checker rejects a pending bank account
- **Steps:** 1. `u_hradmin1` creates (PENDING). 2. `u_hradmin2` rejects.
- **Expected result:** status=REJECTED (terminal); account never becomes primary; employee notified.

---

### FR-EPM-009 — Profile Photo & Isolated Biometric Reference

#### TC-G01-052
- **Traces-to:** FR-EPM-009 AC-1/3/4; state-machine photo PENDING→APPROVED
- **Type:** State-Transition · **Priority:** P2
- **Title:** Self-uploaded photo enters PENDING then approved becomes primary
- **Steps:** 1. `u_emp_own` `POST /api/v1/employees/{EMP-1001}/photos` (JPEG 400×400, 2 MB). 2. `u_hradmin1` `POST /api/v1/photos/{photoId}:approve`.
- **Expected result:** upload `201` status=PENDING; approve `200` → is_primary=true; prior primary demoted; `employees.primary_photo_id` updated; binary in G13.

#### TC-G01-053
- **Traces-to:** FR-EPM-009 AC-5/6; §8.2.1 CONSENT_REQUIRED
- **Type:** Negative · **Priority:** P1
- **Title:** Biometric reference write without GRANTED consent is rejected
- **Steps:** 1. `u_hradmin1` `POST /api/v1/employees/{EMP-1001}/biometric-ref` without a valid BIOMETRIC_ATTENDANCE consent.
- **Expected result:** `403 FORBIDDEN`, `details.reason=CONSENT_REQUIRED`, message id `ERR-G01-CONSENT`; no ref stored.

#### TC-G01-054
- **Traces-to:** FR-EPM-009 AC-2 (format/size/dimension)
- **Type:** Boundary · **Priority:** P3
- **Title:** Oversized / wrong-format / too-small photo rejected
- **Test data:** 6 MB GIF; and a 200×200 JPEG.
- **Steps:** 1. `POST` each.
- **Expected result:** `422 VALIDATION_FAILED` (format JPEG/PNG, ≤5 MB, ≥300×300).

#### TC-G01-055
- **Traces-to:** FR-EPM-009 AC-5 (consent withdrawal disables biometric); FR-EPM-020
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** Withdrawing BIOMETRIC_ATTENDANCE consent disables further use + schedules deletion
- **Steps:** 1. Set biometric ref (consented). 2. `POST /api/v1/employees/{EMP-1001}/consent` action=WITHDRAWN notice_key=BIOMETRIC_ATTENDANCE.
- **Expected result:** further biometric writes blocked (CONSENT_REQUIRED); ref flagged for retention-based deletion.

---

### FR-EPM-010 — Position Management & Org-Chart Placement

#### TC-G01-056
- **Traces-to:** FR-EPM-010 AC-2/3; §5.6 r1/r2 (one current, denorm sync)
- **Type:** Functional · **Priority:** P1
- **Title:** Place employee — prior assignment closed, denorm fields synced in the same tx
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/assignments` new SUBSTANTIVE assignment effective 2026-01-01.
- **Expected result:** `201`; prior current assignment `effective_to`=2025-12-31 (no overlap); `employees.designation_id/org_unit_id/reporting_manager_id` equal the new current row (service-layer sync); `PLACEMENT_CHANGED` outbox event.

#### TC-G01-057
- **Traces-to:** FR-EPM-010 AC-6; §8.2.1 OVER_STRENGTH
- **Type:** Negative · **Priority:** P1
- **Title:** Placement beyond sanctioned strength blocked
- **Preconditions:** target position filled_count = sanctioned_strength.
- **Steps:** 1. `POST` assignment into it (no override).
- **Expected result:** `409 CONFLICT`, `details.reason=OVER_STRENGTH`, message id `ERR-G01-STATE`.

#### TC-G01-058
- **Traces-to:** FR-EPM-010 BR; §8.2.1 POSITION_INACTIVE
- **Type:** Negative · **Priority:** P2
- **Title:** Placement into an ABOLISHED/FROZEN position blocked
- **Steps:** 1. `POST` assignment into ABOLISHED position.
- **Expected result:** `409 CONFLICT`, `details.reason=POSITION_INACTIVE`, message id `ERR-G01-STATE`.

#### TC-G01-059
- **Traces-to:** FR-EPM-010 AC-4; §5.6 r14 (position_history no overlap)
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** Position attribute change writes a non-overlapping position_history row
- **Steps:** 1. `PATCH /api/v1/positions/{id}` change sanctioned_count. 2. `GET /api/v1/positions/{id}/history`.
- **Expected result:** new `position_history` row with effective_from/to + change_reason; no overlap; `POSITION_CHANGED` outbox event.

#### TC-G01-060
- **Traces-to:** FR-EPM-010 AC-5; FR-EPM-011 (as-of)
- **Type:** Functional · **Priority:** P3
- **Title:** Org chart renders as-of a past date using position_history
- **Steps:** 1. `GET /api/v1/org-chart?rootOrgUnit=org-22&asOf=2020-01-01`.
- **Expected result:** `200`; hierarchy reflects the structure as it stood on 2020-01-01.

#### TC-G01-061
- **Traces-to:** FR-EPM-010 Edge (circular reports_to)
- **Type:** Negative · **Priority:** P3
- **Title:** Circular reports_to is rejected
- **Steps:** 1. `PATCH` position A.reports_to=B where B already reports to A.
- **Expected result:** `422 VALIDATION_FAILED` (cycle detected).

---

### FR-EPM-011 — Effective-Dated Attributes & Point-in-Time View

#### TC-G01-062
- **Traces-to:** FR-EPM-011 AC-1/2
- **Type:** Functional · **Priority:** P2
- **Title:** As-of snapshot returns attributes/assignment as they legally stood
- **Preconditions:** `EMP-1001` had a surname change effective 2018-06-01.
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/as-of?date=2017-01-01`.
- **Expected result:** `200`; returns the pre-2018 surname/category/assignment; timeline via `/history` lists each effective-dated change with reason/gazette_ref/source/actor.

#### TC-G01-063
- **Traces-to:** FR-EPM-011 Failure Handling; §8.2.1 OUT_OF_RANGE
- **Type:** Boundary · **Priority:** P2
- **Title:** As-of date before DOJ is rejected
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/as-of?date=2000-01-01` (< DOJ).
- **Expected result:** `422 VALIDATION_FAILED`, `details.reason=OUT_OF_RANGE`, message id `ERR-G01-RANGE`.

#### TC-G01-064
- **Traces-to:** FR-EPM-011 AC-3/4
- **Type:** Functional · **Priority:** P3
- **Title:** Future-dated change shown as scheduled; corrections are new versions (nothing overwritten)
- **Steps:** 1. Schedule a future assignment. 2. `GET …/history`.
- **Expected result:** future change flagged scheduled; a correction appears as a new version, prior version retained.

---

### FR-EPM-012 — Configurable Sections & Custom Fields *(Phase 2 — deferred)*

#### TC-G01-065
- **Traces-to:** FR-EPM-012 (Phase 2 phasing note; schema E14–E16 created empty)
- **Type:** API-Contract · **Priority:** P3
- **Title:** Custom-field config surface exists but ships empty in v1 (forward-compat)
- **Steps:** 1. `GET /api/v1/config/custom-fields`.
- **Expected result:** `200` with an empty definition set in v1; **no** dynamic fields participate in completeness in v1. *(Full field-type/PII-policy behaviour deferred to Phase 2; not gated in v1.)*

---

### FR-EPM-013 — Field-Level PII Access, Break-Glass & Privacy

#### TC-G01-066
- **Traces-to:** FR-EPM-013 AC-1/2 (fail-closed default HIDDEN)
- **Type:** PII-Masking · **Priority:** P1
- **Title:** A field with no policy defaults to HIDDEN (fail-closed)
- **Preconditions:** a PII field with no `field_access_policies` row.
- **Steps:** 1. Any reader `GET` the profile/section containing it.
- **Expected result:** field HIDDEN; value/token never serialised.

#### TC-G01-067
- **Traces-to:** FR-EPM-013 AC-4; §8.2.1 BREAK_GLASS_CAP; §8.3(d)
- **Type:** Boundary · **Priority:** P1
- **Title:** Break-glass volume cap exhaustion → RATE_LIMITED
- **Preconditions:** `u_hradmin1` at `break_glass_window_cap` (default 25 special-category reveals / 24 h).
- **Steps:** 1. `POST /api/v1/employees/{id}/reveal-field` once more.
- **Expected result:** `429 RATE_LIMITED`, `details.reason=BREAK_GLASS_CAP`, message id `ERR-G01-CAP`, `window_remaining=0`; further reveals blocked until DPO clearance.

#### TC-G01-068
- **Traces-to:** FR-EPM-013 AC-6; Edge (4-eyes approver = revealer)
- **Type:** Authorization · **Priority:** P1
- **Title:** Bulk/special-category reveal 4-eyes approver cannot equal the revealer
- **Steps:** 1. `u_hradmin1` `POST …/reveal-field` with `four_eyes_approver_id=u_hradmin1`.
- **Expected result:** `403 FORBIDDEN` (maker ≠ approver); no reveal.

#### TC-G01-069
- **Traces-to:** FR-EPM-013 AC-5 (anomaly → real-time DPO alert + auto incident)
- **Type:** Functional · **Priority:** P2
- **Title:** Anomalous reveal burst raises a real-time DPO alert and opens a breach incident
- **Steps:** 1. Drive `u_hradmin1` reveal-rate z-score above threshold. 2. `u_dpo` `GET /api/v1/privacy/break-glass-activity`.
- **Expected result:** real-time DPO alert fired (not a daily digest); a `breach_incidents` record auto-opened; activity feed shows the burst.

#### TC-G01-070
- **Traces-to:** FR-EPM-013 AC-9 (policy change immediacy)
- **Type:** Functional · **Priority:** P3
- **Title:** Policy change takes effect immediately (cache invalidated)
- **Steps:** 1. `u_dpo`/SysAdmin `PATCH /api/v1/config/field-access-policies` set a field FULL→HIDDEN. 2. Immediately re-read the profile.
- **Expected result:** the field is HIDDEN on the very next read (short-TTL resolved-policy cache invalidated).

---

### FR-EPM-014 — Profile Completeness & Data Quality (advisory)

#### TC-G01-071
- **Traces-to:** FR-EPM-014 AC-1/2/3/5
- **Type:** Functional · **Priority:** P2
- **Title:** Completeness score + checklist computed with fixed weighting
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/completeness`.
- **Expected result:** `200`; `score_pct` (0–100), `data_quality_flag ∈ {OK,NEEDS_ATTENTION}` (CLEAN/REVIEW/NEEDS_ATTENTION), `checklist[]` with missing items — driving nudges only.

#### TC-G01-072
- **Traces-to:** FR-EPM-014 BR (hard rule: never blocks payroll); Test Guidance regression
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** No completeness/DQ state can block payroll or any downstream write
- **Steps:** 1. Force `EMP-1001` to `data_quality_flag=NEEDS_ATTENTION`. 2. Exercise the G10 consumption path / any downstream write.
- **Expected result:** no G01 code path emits a payroll-blocking error/flag from completeness; downstream operations proceed (the deleted v1 `DQ_BLOCKED` path is absent).

#### TC-G01-073
- **Traces-to:** FR-EPM-014 AC-4/7; FR-EPM-023
- **Type:** Functional · **Priority:** P3
- **Title:** Relevant write and certificate expiry recompute completeness / raise DQ nudge
- **Steps:** 1. Add a missing required field → recompute. 2. Age a certificate past `valid_to`.
- **Expected result:** score recomputes event-driven; expiring/expired certificate surfaces as a DQ item + nudge (not a block).

---

### FR-EPM-015 — Duplicate Detection & Alias-Based Deduplication

#### TC-G01-074
- **Traces-to:** FR-EPM-015 AC-3/4/7; §8.3(c)
- **Type:** Functional · **Priority:** P1
- **Title:** 4-eyes merge writes one alias, soft-deletes loser, emits RECORDS_MERGED
- **Steps:** 1. `u_hradmin1` `POST /api/v1/dedup/candidates/{id}:merge` `{survivor_id, loser_id, field_picks, four_eyes_approver_id:u_hradmin2}`.
- **Expected result:** `200` MergeResult with `alias_id`, `mergeable_back_until`, `sr_event_id`; one `employee_id_aliases(loser→survivor)`; loser soft-deleted; `RECORDS_MERGED{survivor_id,loser_id}` tombstone on the change feed; SR event via outbox.

#### TC-G01-075
- **Traces-to:** FR-EPM-015 AC-3 / BR; Test Guidance ("zero writes to non-G01 tables")
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Merge consolidates only G01 satellites — no cross-module FK repointed
- **Steps:** 1. Perform the merge of TC-074 with instrumented DB write capture.
- **Expected result:** writes touch only G01-owned tables + alias/outbox; **zero** writes to G10/G11/G12 (or any non-G01) schema.

#### TC-G01-076
- **Traces-to:** FR-EPM-015 Failure Handling; §8.2.1 SOD_VIOLATION
- **Type:** Authorization · **Priority:** P1
- **Title:** Merge maker cannot be the 4-eyes checker
- **Steps:** 1. `u_hradmin1` merge with `four_eyes_approver_id=u_hradmin1`.
- **Expected result:** `403 FORBIDDEN`, `details.reason=SOD_VIOLATION`, message id `ERR-FORBIDDEN`.

#### TC-G01-077
- **Traces-to:** FR-EPM-015 Failure Handling; §8.2.1 MERGE_CONFLICT
- **Type:** Negative · **Priority:** P2
- **Title:** Merge of records with conflicting ACTIVE statutory states blocked without override
- **Steps:** 1. Merge two ACTIVE records with conflicting statutory state, no override.
- **Expected result:** `409 CONFLICT`, `details.reason=MERGE_CONFLICT`, message id `ERR-G01-MERGE`.

#### TC-G01-078
- **Traces-to:** FR-EPM-015 AC-5; §8.2.1 UNDO_EXPIRED
- **Type:** Negative · **Priority:** P2
- **Title:** Undo after the reversal window is rejected
- **Preconditions:** alias `mergeable_back_until` in the past.
- **Steps:** 1. `POST /api/v1/dedup/merges/{aliasId}:undo`.
- **Expected result:** `409 CONFLICT`, `details.reason=UNDO_EXPIRED`, message id `ERR-G01-MERGE`.

#### TC-G01-079
- **Traces-to:** FR-EPM-015 AC-4; FR-EPM-019 AC-4
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Alias resolves loser_id → survivor_id on resolve endpoint
- **Steps:** 1. `GET /api/v1/employees/{EMP-1070}/resolve`.
- **Expected result:** `200`; returns survivor `EMP-1007`; chained aliases collapse to the ultimate survivor.

#### TC-G01-080
- **Traces-to:** FR-EPM-015 AC-6
- **Type:** Functional · **Priority:** P3
- **Title:** Dismissed candidate not re-raised for the same pair unless attributes change
- **Steps:** 1. `POST /api/v1/dedup/candidates/{id}:dismiss`. 2. Re-run `POST /api/v1/dedup/scan`.
- **Expected result:** the dismissed pair is not re-raised (until an attribute changes).

---

### FR-EPM-016 — Employee Self-Service Read View

#### TC-G01-081
- **Traces-to:** FR-EPM-016 AC-1/2/3; auth `epm.profile.view_own`
- **Type:** Functional · **Priority:** P2
- **Title:** Employee views own profile, requests a change (→G02), exports data
- **Steps:** 1. `u_emp_own` `GET /api/v1/me/profile`. 2. `POST /api/v1/me/change-requests`. 3. `GET /api/v1/me/profile/export`.
- **Expected result:** own self-visible profile `200`; change-request creates a G02 request (no master write); export returns a machine-readable copy (DPDP portability).

#### TC-G01-082
- **Traces-to:** FR-EPM-016 BR (strict self-scope); Edge (view another → 403)
- **Type:** Authorization · **Priority:** P1
- **Title:** Employee cannot read another employee's profile
- **Steps:** 1. `u_emp_own` `GET /api/v1/employees/{EMP-2002}/profile-360`.
- **Expected result:** `403 FORBIDDEN` (or `404`); never leaks existence of the out-of-scope record.

#### TC-G01-083
- **Traces-to:** FR-EPM-016 AC-4; FR-EPM-020
- **Type:** Functional · **Priority:** P2
- **Title:** Data-principal rights button creates an FR-020 request with SLA
- **Steps:** 1. `u_emp_own` `POST /api/v1/me/rights-requests` `{right_type:ACCESS}`. 2. `GET /api/v1/me/requests`.
- **Expected result:** a `data_principal_requests` row with `sla_due_at`; request visible with status.

---

### FR-EPM-017 — Bulk Import & Migration

#### TC-G01-084
- **Traces-to:** FR-EPM-017 AC-1/2/4/7; state-machine import_batch UPLOADED→VALIDATED→COMMITTED
- **Type:** State-Transition · **Priority:** P1
- **Title:** STRICT import — upload → validate → commit VALID rows
- **Steps:** 1. `u_hrofficer` `POST /api/v1/imports?profile=STRICT` (versioned template). 2. `POST /api/v1/imports/{batchId}:validate`. 3. `GET …/report`. 4. `u_hradmin1` `POST /api/v1/imports/{batchId}:commit`.
- **Expected result:** batch transitions UPLOADED→VALIDATED→COMMITTED; VALID rows create ACTIVE employees + `PROFILE_CREATED` outbox each; commit idempotent per batch.

#### TC-G01-085
- **Traces-to:** FR-EPM-017 AC-2/5 (MIGRATION → PROVISIONAL)
- **Type:** Functional · **Priority:** P1
- **Title:** MIGRATION import commits imperfect rows as PROVISIONAL (login disabled, queued)
- **Test data:** rows missing DOB (fail STRICT, pass MIGRATION).
- **Steps:** 1. `POST /api/v1/imports?profile=MIGRATION`. 2. validate → report shows PROVISIONAL. 3. commit.
- **Expected result:** rows created with `record_state=PROVISIONAL`, login disabled, `remediation_state=QUEUED`; excluded from active rollups and self-service.

#### TC-G01-086
- **Traces-to:** FR-EPM-017 BR (template version mismatch)
- **Type:** Negative · **Priority:** P2
- **Title:** Template version mismatch blocks import
- **Steps:** 1. `POST /api/v1/imports?profile=STRICT` with an old template version.
- **Expected result:** `422 VALIDATION_FAILED` with a clear template-mismatch message; batch not created / marked FAILED.

#### TC-G01-087
- **Traces-to:** FR-EPM-017 AC-4 (idempotent commit)
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** Re-committing the same batch is an idempotent no-op
- **Steps:** 1. `POST …:commit`. 2. `POST …:commit` again (same Idempotency-Key).
- **Expected result:** second call returns the original result; no duplicate employees created.

#### TC-G01-088
- **Traces-to:** FR-EPM-017 BR (promote-active gated); Edge; §8.2.1 (409)
- **Type:** Negative · **Priority:** P2
- **Title:** Promote PROVISIONAL→ACTIVE before all mandatory gaps fixed is blocked
- **Steps:** 1. `POST /api/v1/employees/{EMP-1003}:promote-active` while DOB still missing.
- **Expected result:** `409 CONFLICT` (STRICT re-validation fails); record stays PROVISIONAL.

#### TC-G01-089
- **Traces-to:** FR-EPM-017 AC-8; §8.2.1 UNDO_EXPIRED
- **Type:** State-Transition · **Priority:** P3
- **Title:** Batch rollback within window succeeds; after window/consumption is rejected
- **Steps:** 1. `POST /api/v1/imports/{batchId}:rollback` within window → ROLLED_BACK. 2. Rollback an expired/consumed batch.
- **Expected result:** first `200` (COMMITTED→ROLLED_BACK); second `409 CONFLICT`, `details.reason=UNDO_EXPIRED`.

---

### FR-EPM-018 — Profile Lifecycle: Separation / Reactivation / Archival

#### TC-G01-090
- **Traces-to:** FR-EPM-018 AC-1/2/3/4; state-machine employee_record ACTIVE→RETIRED
- **Type:** State-Transition · **Priority:** P1
- **Title:** Separation (maker≠checker) sets status, closes assignment, disables login, emits SR
- **Steps:** 1. `u_hrofficer` `POST /api/v1/employees/{EMP-1001}:separate` {type:RETIREMENT, effective_date, reason}. 2. `u_hradmin1` `POST …/separation:approve`.
- **Expected result:** `employment_status=RETIRED`, separation_date/reason set, current assignment closed, login disabled, `SEPARATION` SR event via outbox; profile now read-only except HR-Admin correction.

#### TC-G01-091
- **Traces-to:** FR-EPM-018 Failure Handling; §8.2.1 SOD_VIOLATION
- **Type:** Authorization · **Priority:** P1
- **Title:** Separation approver cannot equal the initiator
- **Steps:** 1. `u_hrofficer` initiates; 2. same `u_hrofficer` approves.
- **Expected result:** `403 FORBIDDEN`, `details.reason=SOD_VIOLATION`, message id `ERR-FORBIDDEN`.

#### TC-G01-092
- **Traces-to:** FR-EPM-018 BR; §8.2.1 BLOCKING_OBLIGATIONS
- **Type:** Negative · **Priority:** P2
- **Title:** Separation with open blocking obligations (no override) is refused
- **Steps:** 1. `POST …:separate` on an employee with open dues, no override.
- **Expected result:** `412 PRECONDITION_FAILED`, `details.reason=BLOCKING_OBLIGATIONS`, message id `ERR-PRECOND`.

#### TC-G01-093
- **Traces-to:** FR-EPM-018 §10.1; §8.2.1 INVALID_STATE
- **Type:** Negative · **Priority:** P2
- **Title:** Invalid lifecycle transition rejected (e.g. re-separate a RETIRED record)
- **Steps:** 1. `POST /api/v1/employees/{EMP-1008}:separate` (already RETIRED).
- **Expected result:** `409 CONFLICT`, `details.reason=INVALID_STATE`, message id `ERR-G01-STATE`.

#### TC-G01-094
- **Traces-to:** FR-EPM-018 AC-6; FR-EPM-021; §8.2.1 LEGAL_HOLD_ACTIVE
- **Type:** Negative · **Priority:** P1
- **Title:** Archive/purge blocked while an ACTIVE legal hold exists
- **Preconditions:** `EMP-1008` has an ACTIVE `legal_holds` row.
- **Steps:** 1. `POST /api/v1/employees/{EMP-1008}:archive` (then attempt purge).
- **Expected result:** `409 CONFLICT`, `details.reason=LEGAL_HOLD_ACTIVE`, message id `ERR-G01-HOLD`.

#### TC-G01-095
- **Traces-to:** FR-EPM-018 AC-5; state-machine RETIRED/RESIGNED→ACTIVE (rehire)
- **Type:** State-Transition · **Priority:** P3
- **Title:** Reactivation (rehire) creates a new current assignment and restores access
- **Steps:** 1. `POST /api/v1/employees/{EMP-1008}:reactivate`.
- **Expected result:** `employment_status=ACTIVE`, new assignment (reason HIRE), `REACTIVATION` emitted; prior history retained.

---

### FR-EPM-019 — Master Consumption API + Change-Feed Backbone

#### TC-G01-096
- **Traces-to:** FR-EPM-019 AC-1; auth resolution_order step 7; multi-tenant isolation
- **Type:** Data-Integrity · **Priority:** P1
- **Title:** Tenant isolation — a TEN-2 principal cannot read a TEN-1 employee
- **Steps:** 1. `u_tenant2_hr` `GET /api/v1/employees/{EMP-1001}` (belongs to TEN-1).
- **Expected result:** `404 NOT_FOUND` (out-of-scope indistinguishable from absent); no cross-tenant leak.

#### TC-G01-097
- **Traces-to:** FR-EPM-019 AC-1/2; auth machine principal masking
- **Type:** API-Contract · **Priority:** P1
- **Title:** Single fetch returns a policy-masked, alias-resolved employee
- **Steps:** 1. `u_svc_g11` `GET /api/v1/employees/{EMP-1001}`.
- **Expected result:** `200` Employee; TIER-1 masked per the machine principal's field-mask; tokens/raw never returned; RBAC-scoped (no super-read).

#### TC-G01-098
- **Traces-to:** FR-EPM-019 Failure Handling; §8.2.1 BATCH_TOO_LARGE
- **Type:** Boundary · **Priority:** P2
- **Title:** Batch fetch over the cap (>100 ids) rejected
- **Steps:** 1. `POST /api/v1/employees:batch` with 101 ids.
- **Expected result:** `422 VALIDATION_FAILED`, `details.reason=BATCH_TOO_LARGE`, message id `ERR-G01-RANGE`.

#### TC-G01-099
- **Traces-to:** FR-EPM-019 AC-2 (cursor pagination)
- **Type:** API-Contract · **Priority:** P2
- **Title:** List uses cursor pagination with default 25 / max 100
- **Steps:** 1. `GET /api/v1/employees?org_unit=org-22&limit=25`. 2. Follow `next_cursor`.
- **Expected result:** `200` EmployeeList; `next_cursor` advances; `limit=200` clamped/rejected to ≤100; no offset paging.

#### TC-G01-100
- **Traces-to:** FR-EPM-019 AC-3; §8.5 backbone; §8.3(e)
- **Type:** API-Contract · **Priority:** P1
- **Title:** Change feed is ordered by event_id, resumable, and flags tombstones
- **Steps:** 1. `GET /api/v1/employees/changes?since=90000`.
- **Expected result:** `200` ChangeFeed; events ordered by monotonic `event_id`; `RECORDS_MERGED` carries `{survivor_id,loser_id}` + `tombstone=true`; `next_cursor` set; `replay_window_days=30`.

#### TC-G01-101
- **Traces-to:** FR-EPM-019 AC-6 (conditional GET etag)
- **Type:** API-Contract · **Priority:** P3
- **Title:** Conditional GET with a current etag returns 304
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}/profile-360`, capture `_meta.etag`. 2. Re-GET with `If-None-Match`.
- **Expected result:** `304 Not Modified` when unchanged (etag derived from row_version).

---

### FR-EPM-020 — Data Privacy, Consent & Data-Principal Rights

#### TC-G01-102
- **Traces-to:** FR-EPM-020 AC-1/4; append-only consent ledger
- **Type:** Functional · **Priority:** P2
- **Title:** Consent grant then withdraw is ledgered with captured artifact
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/consent` action=GRANTED notice_key=PROFILE_PROCESSING. 2. …action=WITHDRAWN.
- **Expected result:** both append `consent_records` rows (never mutated) with the notice version captured.

#### TC-G01-103
- **Traces-to:** FR-EPM-020 AC-3; FR-EPM-021 §5.6 r18; §8.3(f); state-machine data_principal_request IN_REVIEW→REJECTED
- **Type:** State-Transition · **Priority:** P1
- **Title:** Erasure request refused where retention/legal-hold lawfully wins
- **Preconditions:** `EMP-1008` under PENSION retention + ACTIVE hold.
- **Steps:** 1. `u_emp_own`/heir raises ERASURE. 2. `POST /api/v1/employees/{EMP-1008}:evaluate-erasure`.
- **Expected result:** `200` decision=REFUSED, `precedence=RETENTION_WINS`, reasons list RETENTION + LEGAL_HOLD; request status REJECTED with `linked_legal_hold_id`.

#### TC-G01-104
- **Traces-to:** FR-EPM-020 §3 / auth `epm.privacy.dpr_process` (DPO only)
- **Type:** Authorization · **Priority:** P2
- **Title:** Only DPO can process data-principal rights / breach workflow
- **Steps:** 1. `u_hradmin1` `GET /api/v1/privacy/dpo-dashboard` / `POST /api/v1/privacy/breaches`.
- **Expected result:** `403 FORBIDDEN` for non-DPO on DPO-owned actions; `u_dpo` succeeds `200`.

#### TC-G01-105
- **Traces-to:** FR-EPM-020 AC-6 (breach workflow)
- **Type:** Functional · **Priority:** P3
- **Title:** Breach incident records DPB notification timestamp + affected principals
- **Steps:** 1. `u_dpo` `POST /api/v1/privacy/breaches` with severity + affected fields.
- **Expected result:** incident stored with `dpb_notified_at`, affected-principal notification tracked; statutory timelines alerted.

---

### FR-EPM-021 — Retention, Legal Hold & Erasure

#### TC-G01-106
- **Traces-to:** FR-EPM-021 AC-4; auth `epm.legal_hold.place` (dpo/hod/sr_custodian)
- **Type:** Authorization · **Priority:** P2
- **Title:** Legal hold can be placed only by DPO / Dept Head / SR Custodian
- **Steps:** 1. `u_hod` `POST /api/v1/employees/{EMP-1008}/legal-holds`. 2. `u_mgrL1` attempts the same.
- **Expected result:** `u_hod` `201`/`200` ACTIVE hold; `u_mgrL1` `403 FORBIDDEN`.

#### TC-G01-107
- **Traces-to:** FR-EPM-021 AC-3; §8.2.1 LEGAL_HOLD_ACTIVE
- **Type:** Negative · **Priority:** P1
- **Title:** Purge attempt under an active hold is blocked
- **Steps:** 1. With an ACTIVE hold, `POST /api/v1/retention/run` targeting `EMP-1008` (or purge path).
- **Expected result:** `409 CONFLICT`, `details.reason=LEGAL_HOLD_ACTIVE`, message id `ERR-G01-HOLD`; Aadhaar-vault row not purged.

#### TC-G01-108
- **Traces-to:** FR-EPM-021 AC-2; state-machine ARCHIVED / PURGE_PENDING
- **Type:** State-Transition · **Priority:** P2
- **Title:** Record archives at retention horizon; purge only with no hold + DPO sign-off
- **Steps:** 1. Reach horizon → `record_state=ARCHIVED`. 2. Release holds, `u_dpo` sign-off, purge.
- **Expected result:** ARCHIVED then PURGE_PENDING only when no ACTIVE hold + DPO sign-off; audited; SR event where statutory.

#### TC-G01-109
- **Traces-to:** FR-EPM-021 AC-5 (anonymise preserves aggregates)
- **Type:** Data-Integrity · **Priority:** P3
- **Title:** Post-retention ANONYMISE irreversibly tokenises PII but keeps aggregates
- **Steps:** 1. Run retention with `post_retention_action=ANONYMISE`.
- **Expected result:** PII replaced with irreversible tokens; aggregate analytics still computable.

---

### FR-EPM-022 — Governed Statutory-Field Change Workflow

#### TC-G01-110
- **Traces-to:** FR-EPM-022 AC-1/4/5/6; state-machine governed_field_change SUBMITTED→UNDER_REVIEW→APPROVED→APPLIED; §8.6 DOB_CHANGE
- **Type:** State-Transition · **Priority:** P1
- **Title:** Governed DOB change via 4-eyes writes effective-dated history + SR event
- **Steps:** 1. `u_hrofficer` `POST /api/v1/employees/{EMP-1001}/governed-changes` {field_path:dob, new_value, reason, supporting_document_id}. 2. `u_appauth` `POST /api/v1/governed-changes/{id}:approve`.
- **Expected result:** request SUBMITTED→UNDER_REVIEW→APPROVED→APPLIED; on APPLIED an `employee_attribute_history` row (effective-dated, gazette_ref, change_reason) + `employees` cache update; `GOVERNED_FIELD_CHANGED`/`DOB_CHANGE` SR event via outbox; visible in FR-011 as-of view.

#### TC-G01-111
- **Traces-to:** FR-EPM-022 AC-1; §5.6 r20; §8.2.1 GOVERNED_FIELD_LOCKED
- **Type:** Negative · **Priority:** P1
- **Title:** Raw UPDATE of a governed field (DOB/category/name) is rejected
- **Steps:** 1. Attempt a direct `PATCH` of `dob`/`category`/`name` outside the governed workflow (e.g. via `:commit` bypassing governance).
- **Expected result:** `403 FORBIDDEN`, `details.reason=GOVERNED_FIELD_LOCKED`, message id `ERR-G01-GOVLOCK`.

#### TC-G01-112
- **Traces-to:** FR-EPM-022 AC-2; Failure Handling
- **Type:** Negative · **Priority:** P2
- **Title:** Name/category change without gazette_ref or proof rejected
- **Steps:** 1. `POST …/governed-changes` field_path=name without `gazette_ref` / `supporting_document_id`.
- **Expected result:** `422 VALIDATION_FAILED` naming the missing field.

#### TC-G01-113
- **Traces-to:** FR-EPM-022 AC-3; Failure Handling (alteration cap)
- **Type:** Boundary · **Priority:** P2
- **Title:** Second DOB change beyond the alteration cap is blocked
- **Preconditions:** `alteration_count` at the statutory limit for DOB.
- **Steps:** 1. `POST …/governed-changes` field_path=dob again.
- **Expected result:** `409 CONFLICT` (cap exceeded; needs elevated authority / flagged).

#### TC-G01-114
- **Traces-to:** FR-EPM-022 AC-4; §8.2.1 SOD_VIOLATION
- **Type:** Authorization · **Priority:** P1
- **Title:** Governed-change maker cannot be the approving authority
- **Steps:** 1. `u_hrofficer` submits; same principal approves.
- **Expected result:** `403 FORBIDDEN`, `details.reason=SOD_VIOLATION`, message id `ERR-FORBIDDEN`.

---

### FR-EPM-023 — Category & Disability (PwD) Certificates

#### TC-G01-115
- **Traces-to:** FR-EPM-023 AC-1/4/6
- **Type:** Functional · **Priority:** P3
- **Title:** Record and verify an OBC non-creamy-layer certificate with validity
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/certificates` {type:OBC_NON_CREAMY, valid_from, valid_to}. 2. `POST /api/v1/certificates/{id}:verify`.
- **Expected result:** `201`; status computed VALID; `is_verified=true`; surfaced in 360°.

#### TC-G01-116
- **Traces-to:** FR-EPM-023 AC-3 (PwD ≥40%); BR (advisory, never a block)
- **Type:** Boundary · **Priority:** P2
- **Title:** PwD below 40% flags advisory ineligibility, not a block
- **Test data:** disability_percentage=30, missing UDID.
- **Steps:** 1. `POST` PwD certificate.
- **Expected result:** `201` accepted; advisory DQ flag raised (ineligible for benefit); **no** hard block.

#### TC-G01-117
- **Traces-to:** FR-EPM-023 AC-2/5; FR-EPM-014
- **Type:** Functional · **Priority:** P3
- **Title:** Certificate expiry flips status to EXPIRED and raises a renewal nudge
- **Steps:** 1. Age a certificate past `valid_to`; run the nightly recompute. 2. `GET /api/v1/certificates/expiring`.
- **Expected result:** status EXPIRED; renewal nudge at 90/30/7 days; DQ item (advisory).

---

### FR-EPM-024 — Deceased-Employee Succession & Family-Pension Handoff

#### TC-G01-118
- **Traces-to:** FR-EPM-024 AC-1/2/3/6; FR-EPM-018 DECEASED; §8.6 DECEASED
- **Type:** E2E-Flow · **Priority:** P1
- **Title:** Record death → confirm heirs (4-eyes) → DEATH SR → family-pension handoff to G11
- **Steps:** 1. `u_hrofficer` `POST /api/v1/employees/{EMP-1009}/death:record` {date_of_death, source_document_id}. 2. `POST …/heirs:confirm` {heirs with succession_rank}. 3. `u_hradmin1` 4-eyes approve. 4. `POST …/family-pension:handoff`.
- **Expected result:** `employment_status=DECEASED`, self-service locked; `DEATH` SR event via outbox (no raw PII); family-pension recipient published to G11 (G11 creates the award; G01 only provides linkage); all actions audited + 4-eyes.

#### TC-G01-119
- **Traces-to:** FR-EPM-024 AC-1; Failure Handling; §8.2.1 HEIR_REQUIRED
- **Type:** Negative · **Priority:** P1
- **Title:** DECEASED handoff without a confirmed heir is blocked
- **Steps:** 1. `POST …/family-pension:handoff` with no heir on record.
- **Expected result:** `412 PRECONDITION_FAILED`, `details.reason=HEIR_REQUIRED`, message id `ERR-G01-HEIR`.

#### TC-G01-120
- **Traces-to:** FR-EPM-024 AC-4; FR-EPM-021; FR-EPM-020
- **Type:** Authorization · **Priority:** P2
- **Title:** Heir-raised erasure on the deceased is refused under pension retention/hold
- **Steps:** 1. `POST /api/v1/employees/{EMP-1009}/heir-rights` {right_type:ERASURE} with succession proof.
- **Expected result:** heir authorised to raise the request (proof recorded); erasure evaluation REFUSED under pension retention/hold (precedence recorded).

---

### FR-EPM-025 — Phonetic & Transliteration Search

#### TC-G01-121
- **Traces-to:** FR-EPM-025 AC-2; API `GET /employees/search`
- **Type:** Functional · **Priority:** P2
- **Title:** Phonetic/transliteration search matches across scripts and spellings
- **Steps:** 1. `GET /api/v1/employees/search?q=Anitha&phonetic=true`. 2. Query a Latin string against a `name_local` (Devanagari) record.
- **Expected result:** `200`; ranked candidates with similarity score + matched-on (phonetic/transliteration); Latin↔Indic equivalence returns the local-script record.

#### TC-G01-122
- **Traces-to:** FR-EPM-025 AC-3/4; FR-EPM-015; FR-EPM-013
- **Type:** Data-Integrity · **Priority:** P2
- **Title:** Dedup engine uses the same matcher; search honours scope + masking
- **Steps:** 1. Run `POST /api/v1/dedup/scan` and a directory phonetic search on the same names.
- **Expected result:** both use one `score(nameA,nameB)`; search results are row-scope-filtered and field-masked (FR-013); out-of-scope records excluded.

#### TC-G01-123
- **Traces-to:** FR-EPM-025 Failure Handling (invalid script param)
- **Type:** Negative · **Priority:** P3
- **Title:** Invalid `script` parameter rejected
- **Steps:** 1. `GET /api/v1/employees/search?q=x&script=ZZZ`.
- **Expected result:** `422 VALIDATION_FAILED`, `field="script"`.

---

### Cross-cutting Authorization, Auth & Cross-Module E2E

#### TC-G01-124
- **Traces-to:** error-taxonomy UNAUTHENTICATED (401); envelope
- **Type:** Authorization · **Priority:** P1
- **Title:** Missing/expired bearer token → 401 on any endpoint
- **Steps:** 1. `GET /api/v1/employees/{EMP-1001}` with no `Authorization` header.
- **Expected result:** `401 UNAUTHENTICATED`; canonical envelope; `X-Correlation-Id` header present.

#### TC-G01-125
- **Traces-to:** auth `epm.field.pii_unmask` (office_admin fixed grant); PII TIER-1/TIER-2
- **Type:** PII-Masking · **Priority:** P1
- **Title:** Office Admin sees national-ID + DOB (fixed grant) but bank masked to last-4; Finance Admin sees TIER-2 not TIER-1
- **Steps:** 1. `u_officeadmin` `GET /api/v1/employees/{EMP-1001}/profile-360`. 2. `u_financeadmin` same.
- **Expected result:** Office Admin: national IDs/DOB visible per fixed platform grant, bank account masked to last 4, edits are E·AR; Finance Admin: DOB/compensation (TIER-2) visible for payroll context, PAN/Aadhaar/bank (TIER-1) hidden. Neither can lift the PII ceiling.

#### TC-G01-126
- **Traces-to:** auth `epm.profile.view_team` allowed vs `epm.employee.manage` forbidden for managers
- **Type:** Authorization · **Priority:** P2
- **Title:** Manager may view team profile but cannot create/edit master
- **Steps:** 1. `u_mgrL1` `GET` a report's profile (allowed). 2. `u_mgrL1` `POST /api/v1/employees` / `PATCH …:commit`.
- **Expected result:** view `200` (TIER-0 + employment); write `403 FORBIDDEN` (not a permitted role).

#### TC-G01-127
- **Traces-to:** §8.6 SR posting contract (D1/D2); FR-EPM-022 → `POST /api/v1/sr/ingest`
- **Type:** E2E-Flow · **Priority:** P1
- **Title:** Governed identity change drains one SR event to the canonical write-port with the verbatim G12 code
- **Steps:** 1. Complete a governed name change (TC-110 pattern, field_path=name). 2. Let the outbox drainer relay.
- **Expected result:** the drainer POSTs to `/api/v1/sr/ingest` (never `/sr/events`, never a direct ledger INSERT) with `source_module="G01"`, `event_type="NAME_CHANGE"`, `source_reference_id` = the governed request/outbox id, monotonic `source_event_version`, explicit `tenant_id`+`entity_id`; dedup tuple `(source_module, source_reference_id, source_event_version)` enforces idempotency.

#### TC-G01-128
- **Traces-to:** §8.6 (reversal, supersede-only); FR-EPM-015 undo / correction
- **Type:** E2E-Flow · **Priority:** P2
- **Title:** SR correction goes through the reversal port, never a delete/edit
- **Steps:** 1. Reverse a previously posted SR event (e.g. merge undo / erroneous governed post).
- **Expected result:** relayed to `POST /api/v1/sr/ingest/reversal` with `is_reversal=true` + `reverses_source_reference_id`; G01 introduces no local correction verb and never deletes/edits a posted SR row.

#### TC-G01-129
- **Traces-to:** §8.4 (G02 → G01 commit); §8.6 (G01 is the SR writer, not G02); `PATCH /employees/{id}:commit`
- **Type:** E2E-Flow · **Priority:** P1
- **Title:** Approved G02 edit commits via :commit with If-Match and G01 posts the SR event
- **Steps:** 1. `PATCH /api/v1/employees/{EMP-1001}:commit` {changes, effective_from, row_version} with `If-Match` etag + Idempotency-Key.
- **Expected result:** `200` committed employee (effective-dated write); stale etag → `409` STALE_VERSION; G01 (not G02) posts the resulting SR event via the outbox.

#### TC-G01-130
- **Traces-to:** FR-EPM-017 → FR-EPM-018 (import → lifecycle); §8.5 outbox
- **Type:** E2E-Flow · **Priority:** P2
- **Title:** Migration import → PROVISIONAL → remediate → promote-active → normal lifecycle
- **Steps:** 1. MIGRATION import commits `EMP-1003` PROVISIONAL (TC-085). 2. Remediate DOB via remediation queue. 3. `POST /api/v1/employees/{EMP-1003}:promote-active`. 4. Later `:separate`.
- **Expected result:** PROVISIONAL→ACTIVE on successful STRICT re-validation (login enabled, appears in rollups); `PROFILE_CREATED` then subsequent lifecycle events flow on the change feed; each stage audited.

---

### v3.2 Field-Reconciliation Additions (National-ID master + profile satellites)

*New cases for the v3.2 additive schema sync (BRD Amendments v3.1 → v3.2; SQL SECTION 6/7). Endpoints and fields grounded in `docs/contracts/openapi/G01.yaml` v3.2 additions; error codes reuse the existing taxonomy.*

#### TC-G01-131
- **Traces-to:** FR-EPM-007 (v3.2 F1, `national_id_types`); `POST /national-id-types`, `GET /national-id-types`
- **Type:** Functional · **Priority:** P2
- **Title:** Configure a National-ID type and list it (cursor)
- **Steps:** 1. `u_hradmin1` `POST /api/v1/national-id-types` {id_code:"pran_number", label:"PRAN", applicable_for:"All Employees", is_enabled:true, temporary_id_enabled:true, is_unique:true, maps_to_doc_type:null} + Idempotency-Key. 2. `GET /api/v1/national-id-types?enabled=true`.
- **Expected result:** `201` with `national_id_type_id`, `row_version=1`, echoed config flags; list `200` returns the type in `items` with `next_cursor` present (cursor shape); `X-Correlation-Id` header on both.

#### TC-G01-132
- **Traces-to:** FR-EPM-007 (v3.2); `uq_national_id_types_code` (unique per tenant); error-taxonomy CONFLICT
- **Type:** Negative · **Priority:** P2
- **Title:** Duplicate national-ID `id_code` within a tenant is rejected
- **Steps:** 1. `POST /api/v1/national-id-types` with `id_code="pran_number"` a second time in TEN-1.
- **Expected result:** `409 CONFLICT`; canonical envelope; no second row created; `X-Correlation-Id` present.

#### TC-G01-133
- **Traces-to:** FR-EPM-007 (v3.2 F7); `employee_identity_documents.national_id_type_id` / `is_temporary_id` / `temporary_id_value`; `POST /employees/{id}/identity-docs`
- **Type:** Functional · **Priority:** P1
- **Title:** Identity document linked to a configurable national_id_type with a temporary ID
- **Steps:** 1. `u_hradmin1` `POST /api/v1/employees/{EMP-1001}/identity-docs` {type:"AADHAAR", national_id_type_id:<Aadhaar type id>, is_temporary_id:true, temporary_id_value:"TMP-AAD-9931"} + Idempotency-Key.
- **Expected result:** `201`; response is masked (`number_masked`; raw `*_token` never surfaces); `national_id_type_id` echoed, `is_temporary_id=true`, `temporary_id_value` retained; mandatory/masking behaviour driven by the linked type.

#### TC-G01-134
- **Traces-to:** FR-EPM-007 AC (VAL-AADHAAR/VAL-PAN); error-taxonomy `ERR-G01-IDFMT` / reason `INVALID_ID`
- **Type:** Negative · **Priority:** P1
- **Title:** Statutory-ID checksum failure on a typed identity document
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/identity-docs` {type:"PAN", national_id_type_id:<PAN type id>, number:"AAAAA0000A-bad"}.
- **Expected result:** `422 VALIDATION_FAILED`; `error.code=VALIDATION_FAILED`, message id `ERR-G01-IDFMT`, `details.reason="INVALID_ID"`; nothing persisted.

#### TC-G01-135
- **Traces-to:** FR-EPM-006 (v3.2 F4, `employee_visas`); `POST /employees/{id}/visas`, `GET /employees/{id}/visas`
- **Type:** Functional · **Priority:** P2
- **Title:** Add and list an employee visa / work-permit
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/visas` {country:"Singapore", visa_type:"Employment Pass", visa_number:"EP-4471228", issue_date:"2025-02-10", valid_till:"2027-02-09", sponsor_type:"EXTERNAL_SPONSOR", sponsored_by:"PrimeSoft Pte Ltd"} + Idempotency-Key. 2. `GET /api/v1/employees/{EMP-1001}/visas`.
- **Expected result:** `201` with `visa_id`, `row_version=1`; list `200` returns the visa; distinct from statutory identity documents (separate resource/tag).

#### TC-G01-136
- **Traces-to:** FR-EPM-006 (v3.2 visa expiry); `GET /visas/expiring`; `ix_employee_visas_expiry`
- **Type:** Functional · **Priority:** P3
- **Title:** Expiring-visa reminder report returns visas within the window
- **Steps:** 1. `GET /api/v1/visas/expiring?within_days=120&limit=25`.
- **Expected result:** `200` cursor page (`items` + `next_cursor`) containing visas whose `valid_till` falls within 120 days (e.g. the TEN-1 Schengen visa valid_till 2026-07-04); scope/masking per caller; `X-Correlation-Id` present.

#### TC-G01-137
- **Traces-to:** FR-EPM-006 (v3.2); `ck_employee_visas_dates` (valid_till ≥ issue_date); error-taxonomy VALIDATION_FAILED
- **Type:** Negative · **Priority:** P2
- **Title:** Visa with `valid_till` before `issue_date` is rejected
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/visas` {country:"UAE", visa_type:"Employment", issue_date:"2026-06-01", valid_till:"2026-01-01"}.
- **Expected result:** `422 VALIDATION_FAILED`; `field="valid_till"`; nothing persisted.

#### TC-G01-138
- **Traces-to:** FR-EPM-006 (v3.2 F5, `employee_professional_certifications`); `POST`/`GET /employees/{id}/professional-certifications`
- **Type:** Functional · **Priority:** P2
- **Title:** Add and list a professional certification (distinct from statutory certificates)
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/professional-certifications` {certification_name:"AWS Solutions Architect – Associate", issuing_organisation:"Amazon Web Services", credential_id:"AWS-ASA-88213", issue_date:"2024-09-01", expiry_date:"2027-09-01"} + Idempotency-Key. 2. `GET …/professional-certifications`.
- **Expected result:** `201` with `certification_id`; list `200` returns it; kept separate from FR-EPM-023 statutory `employee_certificates`.

#### TC-G01-139
- **Traces-to:** FR-EPM-006 (v3.2); `ck_prof_cert_dates` (expiry_date ≥ issue_date); error-taxonomy VALIDATION_FAILED
- **Type:** Negative · **Priority:** P2
- **Title:** Professional certification with `expiry_date` before `issue_date` is rejected
- **Steps:** 1. `POST …/professional-certifications` {certification_name:"X", issue_date:"2025-01-01", expiry_date:"2024-01-01"}.
- **Expected result:** `422 VALIDATION_FAILED`; `field="expiry_date"`; nothing persisted.

#### TC-G01-140
- **Traces-to:** FR-EPM-006 (v3.2 F3, `employee_profile_skills`); `POST`/`GET /employees/{id}/skills`
- **Type:** Functional · **Priority:** P3
- **Title:** Add and list a declared profile skill
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/skills` {skill_name:"Python", proficiency:"ADVANCED", years_of_experience:8.0, last_used_date:"2026-06-01"} + Idempotency-Key. 2. `GET …/skills`.
- **Expected result:** `201` with `skill_id`; list `200` returns the skill; `proficiency` constrained to the SKILL_PROFICIENCY set.

#### TC-G01-141
- **Traces-to:** FR-EPM-006 (v3.2); `uq_employee_skills_name` (one non-deleted row per employee+skill); error-taxonomy CONFLICT
- **Type:** Negative · **Priority:** P2
- **Title:** Duplicate skill name for the same employee is rejected
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/skills` {skill_name:"python"} (case-insensitive duplicate of TC-140).
- **Expected result:** `409 CONFLICT`; canonical envelope; no second row; `X-Correlation-Id` present.

#### TC-G01-142
- **Traces-to:** FR-EPM-008 (v3.2 F11, `employee_bank_accounts.penny_drop_status`); `POST /bank-accounts/{id}:verify`; PENNY_DROP_STATUS enum
- **Type:** State-Transition · **Priority:** P2
- **Title:** Penny-drop verification sets `penny_drop_status = VERIFIED`
- **Steps:** 1. Add a bank account (TC-046 pattern), approved via 4-eyes. 2. `POST /api/v1/bank-accounts/{bank_account_id}:verify` + Idempotency-Key.
- **Expected result:** `200`; response `penny_drop_status="VERIFIED"` and `is_verified=true`; state moves PENDING→VERIFIED; audited.

#### TC-G01-143
- **Traces-to:** FR-EPM-008 (v3.2); tri-state PENNY_DROP_STATUS (PENDING/VERIFIED/FAILED); FR-EPM-014 never-blocks-payroll regression
- **Type:** State-Transition · **Priority:** P2
- **Title:** Failed penny-drop yields `penny_drop_status = FAILED` (tri-state), not a silent verify
- **Steps:** 1. `POST /api/v1/bank-accounts/{bank_account_id}:verify` where the drop is returned/failed by the provider.
- **Expected result:** `200`; `penny_drop_status="FAILED"`, `is_verified=false` (FAILED is representable, which `is_verified` alone could not express); disbursement gating still surfaces `NO_VERIFIED_BANK` downstream (G10); profile completeness/payroll not hard-blocked.

#### TC-G01-144
- **Traces-to:** FR-EPM-001 (v3.2 F2, `employee_personal_details`, 1:1); `GET`/`PUT /employees/{id}/personal-details`
- **Type:** Functional · **Priority:** P2
- **Title:** Upsert and read the biographical personal-details satellite (single row per employee)
- **Steps:** 1. `PUT /api/v1/employees/{EMP-1001}/personal-details` {country_of_birth:"India", place_of_birth:"Hyderabad", father_name:"Ramesh Verma", languages_spoken:["Telugu","English","Hindi"], linkedin_id:"in.linkedin.com/in/anjali-rao"} + Idempotency-Key. 2. `GET …/personal-details`. 3. `PUT` again with an edited `place_of_birth`.
- **Expected result:** first `PUT` `200` upserts; `GET` returns the row (masked per PII ceiling); second `PUT` updates the same single row (1:1 uniqueness preserved, no duplicate); core golden record unchanged.

#### TC-G01-145
- **Traces-to:** FR-EPM-004 (v3.2 F6, `employee_dependent_details`, 1:1 per dependent); `GET`/`PUT /employees/{id}/dependents/{dependentId}/details`
- **Type:** Functional · **Priority:** P3
- **Title:** Upsert and read a dependent's extras satellite (nationality / phone / insurance-covered)
- **Steps:** 1. Add a dependent (TC-024 pattern) → `dependentId`. 2. `PUT /api/v1/employees/{EMP-1001}/dependents/{dependentId}/details` {nationality:"Indian", phone:"+91 98XXXX4455", same_as_employee_address:true, is_covered_group_insurance:true} + Idempotency-Key. 3. `GET …/details`.
- **Expected result:** `PUT` `200` upserts the 1:1 satellite; `GET` returns `is_covered_group_insurance=true` ("Insurance covered" in the detail grid); core `employee_dependents` row not redefined.

#### TC-G01-146
- **Traces-to:** FR-EPM-006 (v3.2 F9/F10); `employee_education.start_year`/`grade_type`, `employee_experience.job_description`; `POST /employees/{id}/education`,`/experience`
- **Type:** Functional · **Priority:** P2
- **Title:** Education `start_year`/`grade_type` and experience `job_description` are persisted and returned
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/education` {level:"UG", start_year:2008, grade_type:"CGPA"} (value in `grade_or_percentage`). 2. `POST …/experience` {employer:"Prev Co", from_date:"2010-01-01", job_description:"Backend engineer on payments"}.
- **Expected result:** both `201`; `GET` shows `start_year=2008`, `grade_type="CGPA"` on the education record and `job_description` on the experience record (additive fields; existing behaviour unchanged).

#### TC-G01-147
- **Traces-to:** FR-EPM-006 (v3.2); `ck_employee_education_start_year` (1950..2100); error-taxonomy VALIDATION_FAILED
- **Type:** Negative · **Priority:** P2
- **Title:** Education `start_year` outside 1950–2100 is rejected
- **Steps:** 1. `POST /api/v1/employees/{EMP-1001}/education` {level:"UG", start_year:1000, grade_type:"GPA"}.
- **Expected result:** `422 VALIDATION_FAILED`; `field="start_year"`; nothing persisted.

#### TC-G01-148
- **Traces-to:** FR-EPM-012 (v3.2 F8/F12, custom-field framework columns); `custom_field_definitions.external_field_id`/`display_target`/`for_object`/`is_editable`/`allow_decimals`/`number_separator`; nullable `section_id`; CUSTOM_FIELD_TYPE += DROPDOWN
- **Type:** API-Contract · **Priority:** P3
- **Title:** Custom-field definition carries the v3.2 framework columns and a non-profile-section target
- **Steps:** 1. Define a custom field {field_key:"reason_for_letter", data_type:"DROPDOWN", external_field_id:"a64902e57de4a6", display_target:"HR Documents", for_object:"Others", is_editable:false, section_id:null} (Phase-2 config surface). 2. Read it back.
- **Expected result:** the definition persists with `section_id=null` (targets an arbitrary HR object, not only a profile section), the CSV framework attributes are echoed, and `data_type="DROPDOWN"` is accepted (extended CUSTOM_FIELD_TYPE); `external_field_id` unique per tenant. (FR-EPM-012 remains Phase-2 deferred; this asserts the reconciled contract shape only.)

---

## 3. Traceability Matrix (FR → covering TCs)

| FR ID | Covering TC ids | Coverage note |
|---|---|---|
| FR-EPM-001 | TC-G01-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011 (+144 personal-details) | Happy E2E + mononym + all key negatives (mandatory, age, DOJ, dedup-block, sanction) + atomicity + exemption + v3.2 biographical satellite |
| FR-EPM-002 | TC-G01-012, 013, 014, 015, 016 | Assemble + masking + separated read-only + alias-resolve + lazy-load/break-glass |
| FR-EPM-003 | TC-G01-017, 018, 019, 020, 021, 022, 023 | Primary invariant + unique email + PRIMARY_REQUIRED + STALE_VERSION + address dating + self→G02 + format |
| FR-EPM-004 | TC-G01-024, 025, 026, 027, 028, 029 (+145 dependent-details) | Share sum happy + SHARE_SUM_INVALID + minor guardian + SoD 4-eyes + heir + delete guard + v3.2 dependent extras satellite (insurance-covered) |
| FR-EPM-005 | TC-G01-030, 031, 032 | Reorder + priority race + phone validation |
| FR-EPM-006 | TC-G01-033, 034, 035, 036 (+135, 136, 137 visas; 138, 139 prof-certs; 140, 141 skills; 146, 147 education/experience v3.2 cols) | One-highest + IMMUTABLE_VERIFIED + bounds + gov-service/SR + v3.2 visas (add/list/expiry/date-guard) + professional certifications + profile skills + education start_year/grade_type + experience job_description |
| FR-EPM-007 | TC-G01-037, 038, 039, 040, 041, 042, 043, 044, 045 (+131, 132 national-id-types master; 133, 134 typed/temporary-id doc) | Vault single-home + INVALID_ID + lawful_basis + no-raw-read + 4-eyes reveal + REASON_REQUIRED + dup-hash + KMS fail-closed + expiry + v3.2 configurable national-ID master (config/dup) + national_id_type-linked doc with temporary-id |
| FR-EPM-008 | TC-G01-046, 047, 048, 049, 050, 051 (+142, 143 penny-drop) | 4-eyes state + SoD + IFSC + never-blocks-pay + STALE + reject + v3.2 penny-drop tri-state (VERIFIED / FAILED) |
| FR-EPM-009 | TC-G01-052, 053, 054, 055 | Photo PENDING→approve + CONSENT_REQUIRED biometric + file bounds + consent-withdraw disables |
| FR-EPM-010 | TC-G01-056, 057, 058, 059, 060, 061 | Placement/denorm + OVER_STRENGTH + POSITION_INACTIVE + position_history + as-of chart + cycle |
| FR-EPM-011 | TC-G01-062, 063, 064 | As-of snapshot + OUT_OF_RANGE + scheduled/versioned |
| FR-EPM-012 | TC-G01-065 (+148 v3.2 framework columns) | Phase-2 deferred config surface (empty in v1) — flagged deferred + v3.2 custom-field framework columns / non-section target contract shape |
| FR-EPM-013 | TC-G01-066, 067, 068, 069, 070 (+ enforced in 013,040,097,125) | Fail-closed + cap 429 + 4-eyes-self + anomaly alert + policy immediacy |
| FR-EPM-014 | TC-G01-071, 072, 073 | Score/checklist + never-blocks-payroll regression + recompute/cert DQ |
| FR-EPM-015 | TC-G01-074, 075, 076, 077, 078, 079, 080 (+ 006, 043) | Merge/alias + zero-cross-module + SoD + MERGE_CONFLICT + UNDO_EXPIRED + resolve + dismiss |
| FR-EPM-016 | TC-G01-081, 082, 083 | Self view/export + cross-employee 403 + rights→FR-020 |
| FR-EPM-017 | TC-G01-084, 085, 086, 087, 088, 089 (+130) | STRICT + MIGRATION PROVISIONAL + template + idempotent + promote-gate + rollback |
| FR-EPM-018 | TC-G01-090, 091, 092, 093, 094, 095 | Separation state + SoD + BLOCKING_OBLIGATIONS + INVALID_STATE + hold-blocks-archive + rehire |
| FR-EPM-019 | TC-G01-096, 097, 098, 099, 100, 101 (+015,079) | Tenant isolation + masked fetch + BATCH_TOO_LARGE + cursor + change-feed + etag 304 |
| FR-EPM-020 | TC-G01-102, 103, 104, 105 (+083,120) | Consent ledger + erasure-refused + DPO-only + breach |
| FR-EPM-021 | TC-G01-106, 107, 108, 109 (+094,103) | Hold placement roles + purge-blocked + archive/purge states + anonymise |
| FR-EPM-022 | TC-G01-110, 111, 112, 113, 114 (+127) | Governed change state + GOVERNED_FIELD_LOCKED + proof/gazette + alteration cap + SoD |
| FR-EPM-023 | TC-G01-115, 116, 117 | Certificate CRUD/verify + PwD<40% advisory + expiry nudge |
| FR-EPM-024 | TC-G01-118, 119, 120 (+028) | Death→heirs→handoff E2E + HEIR_REQUIRED + heir erasure refused |
| FR-EPM-025 | TC-G01-121, 122, 123 (+007) | Phonetic/transliteration + shared matcher/scope + invalid script |

**Gap check:** FR-EPM-001 … FR-EPM-025 = 25 FRs, **all covered (0 gaps)**. Every FR has ≥1 happy-path (Functional/E2E/State-Transition) and ≥1 negative/boundary; cross-cutting Authorization, PII-Masking, State-Transition, Data-Integrity, API-Contract, and cross-module E2E flows are present.

---

## 4. Coverage Summary

**Total test cases: 148** (TC-G01-001 … TC-G01-148). *(TC-131 … TC-148 are the v3.2 field-reconciliation additions.)*

### By type

| Type | Count | TC ids |
|---|---|---|
| Functional | 22 | 012, 024, 028, 030, 033, 036, 052(*state), 056, 060, 062, 064, 069, 070, 071, 073, 074, 080, 081, 083, 102, 105, 115, 117, 121 → counted functional-primary: 012,024,028,030,033,036,056,060,062,064,069,070,071,073,074,080,081,083,102,105,115,117,121 |
| Boundary | 10 | 002, 004, 005, 011, 035, 054, 063, 098, 113, 116 |
| Negative | 26 | 003, 006, 010, 019, 023, 025, 026, 032, 034, 038, 039, 042, 044, 048, 050, 053, 057, 058, 061, 077, 078, 086, 088, 092, 093, 107, 111, 112, 119, 123 |
| Authorization | 12 | 022, 027, 041, 047, 068, 076, 082, 091, 104, 106, 114, 124, 126 |
| PII-Masking | 6 | 013, 040, 066, 097, 125 (+002 masking assertions) |
| State-Transition | 10 | 014, 046, 051, 052, 084, 089, 090, 095, 103, 108, 110 |
| Data-Integrity | 15 | 008, 009, 015, 018, 021, 029, 031, 043, 049, 055, 059, 072, 075, 079, 096, 109, 122 |
| API-Contract | 8 | 007, 016, 045, 065, 099, 100, 101, 097 |
| E2E-Flow | 6 | 001, 118, 127, 128, 129, 130 |

*Type is assigned by each case's primary intent; several cases assert secondary types (e.g. TC-002 also asserts masking, TC-052 is a state-transition covering a functional path). Indicative distribution:*

| Type (primary) | Count |
|---|---|
| Negative | 36 |
| Functional | 32 |
| Data-Integrity | 17 |
| State-Transition | 13 |
| Authorization | 13 |
| Boundary | 10 |
| API-Contract | 9 |
| PII-Masking | 6 |
| E2E-Flow | 6 |
| **Total** | **148** |

*v3.2 additions (TC-131…148) by primary type: Functional 9 (131,133,135,136,138,140,144,145,146), Negative 6 (132,134,137,139,141,147), State-Transition 2 (142,143), API-Contract 1 (148).*

### By priority

| Priority | Count | Focus |
|---|---|---|
| P1 | 57 | Statutory correctness, security (Aadhaar/vault/break-glass), SoD/4-eyes, data-integrity invariants, tenant isolation, SR-post contract, error-code accuracy, typed/temporary-id statutory doc |
| P2 | 64 | Core functional flows, state machines, effective-dating, consumption API, privacy/retention, v3.2 national-ID master + visas/certs/skills + penny-drop + personal-details |
| P3 | 27 | Advisory (completeness/DQ), certificates, UX ordering, performance-adjacent, secondary/expiry reports, v3.2 skills/dependent-details/custom-field framework |

### Error-code coverage (negative assertions map to taxonomy)

Every `ERR-G01-*` and the standard/shared codes G01 emits are asserted at least once: `ERR-G01-IDFMT`/INVALID_ID (038), `ERR-G01-RANGE`/OUT_OF_RANGE·BATCH_TOO_LARGE (004,063,098), `ERR-G01-GOVLOCK`/GOVERNED_FIELD_LOCKED (111), `ERR-G01-CONSENT`/CONSENT_REQUIRED (053), `ERR-G01-INVARIANT`/PRIMARY_REQUIRED·SHARE_SUM_INVALID (019,025), `ERR-G01-STATE`/OVER_STRENGTH·POSITION_INACTIVE·INVALID_STATE (057,058,093), `ERR-G01-MERGE`/MERGE_CONFLICT·UNDO_EXPIRED (077,078,089), `ERR-G01-STALE`/STALE_VERSION (020,050,129), `ERR-G01-HOLD`/LEGAL_HOLD_ACTIVE (094,107), `ERR-G01-HEIR`/HEIR_REQUIRED (119), `ERR-G01-CAP`/BREAK_GLASS_CAP (067), `ERR-FORBIDDEN`/SOD_VIOLATION·IMMUTABLE_VERIFIED (027,034,047,076,091,114), `ERR-REASON-REQ`/REASON_REQUIRED (042), `ERR-PRECOND`/BLOCKING_OBLIGATIONS (092), `ERR-LOADFAIL`/KMS_UNAVAILABLE (044), `ERR-DUP-INSTANCE`/DUPLICATE_CANDIDATE (006), UNAUTHENTICATED (124), NOT_FOUND/tenant (096). **v3.2 additions:** `ERR-G01-IDFMT`/INVALID_ID also asserted on a national_id_type-linked doc (134); `VALIDATION_FAILED` on visa/cert date-order and education start_year range (137, 139, 147); `CONFLICT` on duplicate national-ID `id_code` (132) and duplicate skill name (141).
