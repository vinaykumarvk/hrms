# G02 — Personal Details Modification Workflow — Acceptance & E2E Test Suite

## 1. Header

| Item | Value |
|---|---|
| Module | G02-EPDM — Personal Details Modification Workflow (v3.0, platform-grounded) |
| Scope | Full change-request lifecycle for governed G01/M01 fields: authoring, sensitivity routing, step-up, evidence & authority-portal, maker-checker approval, e-signature, diff, SLA/escalation, effective-dated commit, G01→G12 SR posting-status tracking, bulk corrections, data-subject notice/objection, employment-status gating, fraud signals, break-glass reversal, retro-impact reconciliation, config/delegation/templates, tamper-evident audit. |
| Grounding | BRD `docs/brd/v3/G02-personal-details-modification-workflow.md` (FR-G02-001…023, §5.5 sensitivity seed, §5.6 data-integrity rules); `docs/contracts/openapi/G02.yaml`; `docs/contracts/error-taxonomy.yaml` (ERR-G02-*); `docs/contracts/state-machines.yaml` (G02 `change_request`); `docs/contracts/auth-matrix.yaml` (G02 actions/roles/SoD). |
| Critical model under test | **G02 is NOT a Digital-SR writer.** On commit of a STATUTORY change, **G01** (master/identity owner, `source_module=G01`) posts the SR event to G12; G02 only supplies context and tracks `sr_posting_status`. SR/retro tracking is separate and never gates `COMMITTED` (§5.6 rule 11). |
| Traceability | Every TC carries `Traces-to` (FR + AC/BR). Matrix in §3; every FR has ≥1 TC (0 gaps). |
| Out of scope (asserted, not exercised) | G01/M01 field storage & SR-event write (G01); G12 ledger internals; G13 binary storage; G10/G11/G06 recompute execution; platform MFA/step-up challenge internals (invoked only). |

### Test-environment & data assumptions

- **Multi-tenant.** All rows carry `tenant_id`/`entity_id`. Baseline tenant `tn-gov`, entities `en-fin` and `en-edu`. An unscoped query is **rejected, not defaulted to all** (Platform §0.1). Cross-tenant read returns `404 NOT_FOUND` (never leaks existence).
- **API conventions.** Base `/api/v1`; bearer JWT carries resolved roles + tenant/entity scope; `Idempotency-Key` header required on state-changing POSTs (24h replay); `X-Correlation-Id` echoed in every response header; cursor pagination (`limit` default 25 / max 100, `next_cursor`). Canonical error envelope `{ "error": { "code", "message", "field", "details" } }`; correlation id is a **header**, never a body field.
- **Personas.**
  - `emp-alice` (role `employee`, own-record scope, entity `en-fin`) — self-service requester/data-subject.
  - `emp-bob` (role `employee`, entity `en-fin`) — second data subject (mule detection).
  - `mgr-mohan` (role `l1_manager`, Alice's reporting chain) — recommender / LOW-MEDIUM approver.
  - `hr-hema` (role `hrbp`, entity `en-fin`) — reviewer/checker, bulk-correction maker.
  - `hradm-raj` (role `hr_admin`, entity `en-fin`) — HIGH approver, bulk approver, break-glass auth1, SR retry.
  - `aa-anand` (role `appointing_authority`, entity `en-fin`, MFA) — STATUTORY sanction, break-glass auth2.
  - `fraud-fiona` (`hrbp` + `fraud_reviewer` flag) — fraud queue.
  - `griev-gita` (`hr_admin` + `grievance_officer` flag) — objection handling.
  - `srcust-sam` (role `sr_custodian`, entity `en-fin`) — SR reconciliation view/retry.
  - `aud-amit` (Auditor = Org-Admin read + read-only entitlement + P05 `Audit.query`).
  - `sysadm-sara` (role `org_admin`) — W.1/W.2 config; **no transactional self-approval**.
- **Sensitivity seed (§5.5, illustrative/configurable).** `correspondence_address`=LOW; `email`/`primary_phone`/`alternate_phone`=MEDIUM + `is_auth_bearing=true`; `permanent_address`/`marital_status`=MEDIUM; `qualification`=HIGH (OTP+); `bank_account_no`=HIGH, `E·AR`, e-sign PKI_DSC/AADHAAR_ESIGN; `first_name`/`middle_name`/`last_name`/`dob`/`gender`=STATUTORY; `national_id`(Aadhaar)/`pan`/`category`=STATUTORY, `E·AR`, HR-only, authority-portal, `post_to_sr=true`. `dob` carries `hard_block_rule_ref=DOB_PRE_RETIREMENT_BAR` (barred within 5 yrs of superannuation).
- **Fixtures.** `emp-alice` ACTIVE, DOJ 2015-06-01, DOB 1968-01-01 (>5 yrs to superannuation), primary bank `ACC-1111`. `emp-carol` RETIRED. `emp-dan` DECEASED. `emp-eric` ACTIVE, DOB 1966-05-01 (within 5-yr pre-retirement bar). Config: FINANCIAL objection window 48h; step-up validity 10 min; matrix active for `en-fin`.
- **Priority scale.** P1 = statutory/security/data-integrity critical; P2 = core functional; P3 = secondary/UX/report.

---

## 2. Test Cases

### FR-G02-001 — Create & Submit a change request

| TC | TC-G02-001 |
|---|---|
| Traces-to | FR-G02-001 AC1–AC4; auth `g02.change_request.create` |
| Type | Functional / E2E-Flow |
| Title | Employee creates a DRAFT self-service change request for a LOW field and submits |
| Preconditions | `emp-alice` authenticated, ACTIVE |
| Test data | `POST /change-requests` body `{ target_employee_id: emp-alice, request_origin: SELF_SERVICE, change_type: UPDATE, items:[{field_key: correspondence_address, new_value: "12 MG Road", reason:"moved"}] }` + `Idempotency-Key: k-001` |
| Steps | 1. POST create. 2. `POST /change-requests/{id}/submit` with Idempotency-Key. |
| Expected | 1. `201` ChangeRequest `status=DRAFT`, `X-Correlation-Id` header present. 2. `200` `status=SUBMITTED` (LOW non-auth-bearing, single stage) and one P01 `workflow_instance` bound. |
| Priority | P2 |

| TC | TC-G02-002 |
|---|---|
| Traces-to | FR-G02-001 AC1; §4.3 (composite name); §5.8 |
| Type | Functional |
| Title | Composite `name` change expands to first/middle/last sub-items |
| Preconditions | `emp-alice` authenticated |
| Test data | items requesting `first_name="Alicia"`, `last_name="Menon"` |
| Steps | 1. Create draft with composite name intent. 2. `GET /change-requests/{id}`. |
| Expected | `200` returns parent + child items keyed `employees.first_name` / `employees.last_name`; no single `name` field persisted. |
| Priority | P2 |

| TC | TC-G02-003 |
|---|---|
| Traces-to | FR-G02-001 AC2; boundary — governed-field-only |
| Type | Negative / Authorization |
| Title | Request on a non-governed field is rejected |
| Preconditions | `emp-alice` authenticated |
| Test data | items `{ field_key: "favourite_colour", new_value:"blue" }` |
| Steps | `POST /change-requests`. |
| Expected | `403 FORBIDDEN` (`ERR-FORBIDDEN`); non-governed field not accepted. |
| Priority | P2 |

| TC | TC-G02-004 |
|---|---|
| Traces-to | FR-G02-001 AC4; error-taxonomy `ERR-DUP-INSTANCE` |
| Type | Negative / State-Transition |
| Title | Second open change request for the same field/employee is a duplicate |
| Preconditions | `emp-alice` has an open (SUBMITTED) request on `email` |
| Test data | second `submit` for another draft on `email` |
| Steps | Submit second request touching the same open field. |
| Expected | `409 CONFLICT` code `ERR-DUP-INSTANCE`; message points to existing request; no second workflow instance. |
| Priority | P2 |

| TC | TC-G02-005 |
|---|---|
| Traces-to | FR-G02-001 AC1; auth ownership check |
| Type | Authorization |
| Title | Employee cannot create a self-service request targeting another employee |
| Preconditions | `emp-alice` authenticated |
| Test data | `target_employee_id = emp-bob` |
| Steps | `POST /change-requests` targeting `emp-bob`. |
| Expected | `403 FORBIDDEN` (own-record scope; `request.created_by` may only target own `employee_id`). |
| Priority | P1 |

| TC | TC-G02-006 |
|---|---|
| Traces-to | FR-G02-001; API-contract `GET /employees/{id}/editable-fields` |
| Type | API-Contract |
| Title | Editable-fields endpoint returns P02-authorized governed fields with masked current values |
| Preconditions | `emp-alice` authenticated |
| Steps | `GET /employees/emp-alice/editable-fields`. |
| Expected | `200` `{ employeeId, employmentStatus:"ACTIVE", fields:[...] }`; `E·AR` fields flagged read-only "Request change"; TIER-1 values masked (e.g. bank last-4). |
| Priority | P3 |

### FR-G02-002 — Sensitivity classification & P01 routing

| TC | TC-G02-007 |
|---|---|
| Traces-to | FR-G02-002 AC1/BR1; §5.6 rule 7 |
| Type | Functional |
| Title | Highest-sensitivity wins on a mixed-tier request; route not user-editable |
| Preconditions | `emp-alice` authenticated |
| Test data | items: `marital_status` (MEDIUM) + `bank_account_no` (HIGH) |
| Steps | 1. Create draft. 2. `POST /change-requests/{id}/route-preview`. |
| Expected | `200` `highestSensitivity=HIGH`; route reflects HIGH (all-or-nothing at highest tier); `highest_sensitivity` system-derived, not overridable. |
| Priority | P2 |

| TC | TC-G02-008 |
|---|---|
| Traces-to | FR-G02-002 AC5/BR5; §5.6 rule 16 (auth-bearing) |
| Type | Functional / Boundary |
| Title | LOW auto-apply only for non-auth-bearing; MEDIUM auth-bearing never auto-applies |
| Preconditions | `auto_apply_on_low=true` on `correspondence_address`; `email` is auth-bearing |
| Steps | 1. Submit `correspondence_address` (LOW). 2. Submit `email` change. |
| Expected | 1. Auto-applies → `APPROVED`/committed, P05 still captures. 2. `email` requires ≥1 human APPROVE stage + notify-old-value side-effect; no auto-apply. |
| Priority | P1 |

| TC | TC-G02-009 |
|---|---|
| Traces-to | FR-G02-002 AC7/BR (CONDITIONAL); FR-G02-019 |
| Type | State-Transition |
| Title | HIGH + risk_band HIGH injects a CONDITIONAL fraud-review stage |
| Preconditions | risk engine returns `HIGH` for a `bank_account_no` change |
| Steps | Submit HIGH request that scores HIGH; `route-preview`. |
| Expected | Route contains an injected mandatory fraud-review node before substantive approval (P01 `CONDITIONAL`). |
| Priority | P1 |

| TC | TC-G02-010 |
|---|---|
| Traces-to | FR-G02-002 Edge (no active matrix) |
| Type | Negative / API-Contract |
| Title | No active approval matrix with no fallback returns 500 + config alert |
| Preconditions | matrix disabled for scope; no entity/global fallback |
| Steps | `POST /change-requests/{id}/route-preview`. |
| Expected | `500 INTERNAL` (`ERR-LOADFAIL`); config alert raised; no partial route persisted. |
| Priority | P2 |

### FR-G02-003 — Document & authority-portal verification

| TC | TC-G02-011 |
|---|---|
| Traces-to | FR-G02-003; §5.6 rule 4 (document gate) |
| Type | State-Transition |
| Title | HIGH request stays PENDING_DOCS until required document is VERIFIED+CLEAN |
| Preconditions | `qualification` (HIGH, requires_document) draft submitted → `PENDING_DOCS` |
| Steps | 1. `POST /change-requests/{id}/documents` (scan PENDING). 2. Attempt advance. 3. `PATCH .../documents/{docId}/verify` VERIFIED. |
| Expected | 2. blocked `412 PRECONDITION_FAILED` (`ERR-PRECOND`); 3. after VERIFIED+CLEAN → moves to `IN_REVIEW`. |
| Priority | P1 |

| TC | TC-G02-012 |
|---|---|
| Traces-to | FR-G02-003; error `ERR-G02-AUTHPORTAL` |
| Type | Negative |
| Title | Caste/category approval blocked when authority-portal not VERIFIED |
| Preconditions | `category` change; `authority_verification_status != VERIFIED` |
| Steps | Approver attempts to advance/approve. |
| Expected | `412 PRECONDITION_FAILED` code `ERR-G02-AUTHPORTAL`; approval not persisted. |
| Priority | P1 |

| TC | TC-G02-013 |
|---|---|
| Traces-to | FR-G02-003 (X.3); auth `authority-portal verification` HR-only |
| Type | Authorization |
| Title | Only HR/authority roles can trigger authority-portal verification |
| Preconditions | `emp-alice` (employee) authenticated |
| Steps | `POST /change-requests/{id}/documents/{docId}/authority-verify`. |
| Expected | `403 FORBIDDEN`; portal verification restricted to HR Officer/HR Admin/Authority. |
| Priority | P2 |

| TC | TC-G02-014 |
|---|---|
| Traces-to | FR-G02-003 Edge (portal unavailable) |
| Type | Negative / API-Contract |
| Title | Authority-portal unavailable maps to 412 (no public 503) |
| Preconditions | UIDAI portal down (X.3) |
| Steps | `POST .../authority-verify` for Aadhaar. |
| Expected | `412 PRECONDITION_FAILED` (retryable, `ERR-PRECOND`); never `503`. |
| Priority | P2 |

### FR-G02-004 — Maker-checker multi-level approval (SoD)

| TC | TC-G02-015 |
|---|---|
| Traces-to | FR-G02-004; §5.6 rule 1; error `ERR-G02-SOD`; auth SoD `checker != requester` |
| Type | Authorization / Negative |
| Title | Maker cannot approve own request (self-approval blocked) |
| Preconditions | `hr-hema` created an HR_ON_BEHALF request; it reaches a stage `hr-hema` could otherwise action |
| Steps | `hr-hema` calls `POST /change-requests/{id}/approvals/{nodeId}/decide` `{decision:APPROVE}`. |
| Expected | `403 FORBIDDEN` code `ERR-G02-SOD`; `request.created_by != approval.actor` enforced by P02. |
| Priority | P1 |

| TC | TC-G02-016 |
|---|---|
| Traces-to | FR-G02-004; §3.2 SoD invariant (`approval.actor != target.user_id`) |
| Type | Authorization / Negative |
| Title | Approver cannot approve a change to their own master record |
| Preconditions | `hradm-raj`'s own record has a pending request created by another HR |
| Steps | `hradm-raj` approves the stage on his own record. |
| Expected | `403 FORBIDDEN` `ERR-G02-SOD` (`approval.actor != target.user_id`). |
| Priority | P1 |

| TC | TC-G02-017 |
|---|---|
| Traces-to | FR-G02-004; auth matrix approver tiers |
| Type | Authorization |
| Title | Sensitivity gate — Manager L1 cannot approve a HIGH stage |
| Preconditions | `bank_account_no` (HIGH) request at approval |
| Steps | `mgr-mohan` (l1_manager) decides APPROVE on the HIGH stage. |
| Expected | `403 FORBIDDEN`; HIGH requires HR Officer/HR Admin/Appointing Authority per configured route. |
| Priority | P1 |

| TC | TC-G02-018 |
|---|---|
| Traces-to | FR-G02-004; state-machine `IN_REVIEW→APPROVED` (SEQUENTIAL) |
| Type | E2E-Flow |
| Title | Full two-level sequential approval drives IN_REVIEW → APPROVED |
| Preconditions | HIGH request in `IN_REVIEW`, route = recommend (mgr) → approve (HR Admin) |
| Steps | 1. `mgr-mohan` recommend/approve stage 1. 2. `hradm-raj` approve stage 2. |
| Expected | Each decide → `200` ChangeRequestApproval; after final stage `status=APPROVED`; each transition writes a `workflow_actions` row + P05 audit. |
| Priority | P2 |

| TC | TC-G02-019 |
|---|---|
| Traces-to | FR-G02-004; API-contract idempotent decide |
| Type | Data-Integrity |
| Title | Duplicate approve decision with same Idempotency-Key is a no-op |
| Preconditions | Stage already APPROVED with `Idempotency-Key: dk-1` |
| Steps | Re-POST identical decide with `dk-1`. |
| Expected | `200` returns the original decision result (idempotent advance); no duplicate `workflow_actions` row. |
| Priority | P1 |

| TC | TC-G02-020 |
|---|---|
| Traces-to | FR-G02-004; API-contract `GET /approvals/queue` |
| Type | API-Contract / Authorization |
| Title | Approval queue returns only actions assigned to caller role/scope or valid delegation |
| Preconditions | Pending actions in `en-fin` and `en-edu` |
| Steps | `hradm-raj` (scope `en-fin`) calls `GET /approvals/queue?sort=sla_due_at:asc`. |
| Expected | `200` cursor list; only `en-fin` in-scope actions; `en-edu` items absent (scope filter, not leaked). |
| Priority | P2 |

### FR-G02-005 — Diff, preview & reviewer comparison

| TC | TC-G02-021 |
|---|---|
| Traces-to | FR-G02-005; API-contract `GET /change-requests/{id}/diff` |
| Type | API-Contract |
| Title | Diff returns per-item before/after with P02 field-mask on serialization |
| Preconditions | Request with `bank_account_no` change; caller = `mgr-mohan` (below PII ceiling) |
| Steps | `GET /change-requests/{id}/diff`. |
| Expected | `200` items array; TIER-1 old/new values masked to last-4 for below-ceiling roles; unmasked reveal only for authorized roles and audited to P05. |
| Priority | P2 |

| TC | TC-G02-022 |
|---|---|
| Traces-to | FR-G02-005; clear-intent semantics |
| Type | Functional |
| Title | Diff renders explicit clear/remove intent distinctly from null |
| Preconditions | item with `clear_intent=true`, `new_value=null` |
| Steps | `GET /change-requests/{id}/diff`. |
| Expected | Diff item shows "remove" intent (`VAL-G02-CLEARINTENT`), not an accidental blank. |
| Priority | P3 |

### FR-G02-006 — Rejection, return, resubmission, withdrawal

| TC | TC-G02-023 |
|---|---|
| Traces-to | FR-G02-006; state `IN_REVIEW→RETURNED`; `ERR-REASON-REQ` |
| Type | Negative / State-Transition |
| Title | sendBack (return-for-correction) requires a comment |
| Preconditions | request in `IN_REVIEW` |
| Steps | `POST .../decide` `{decision:SEND_BACK}` with empty comment. |
| Expected | `422 VALIDATION_FAILED` `ERR-REASON-REQ`; with comment → `200`, `status=RETURNED`. |
| Priority | P2 |

| TC | TC-G02-024 |
|---|---|
| Traces-to | FR-G02-006; state `RETURNED→SUBMITTED` (resubmit, re-gate + re-route) |
| Type | E2E-Flow / State-Transition |
| Title | Resubmit after correction re-gates and re-triggers affected P01 stages |
| Preconditions | request `RETURNED`, requester edits items |
| Steps | 1. `PATCH /change-requests/{id}` edit items. 2. `POST /change-requests/{id}/resubmit`. |
| Expected | `200` `status=SUBMITTED`; status gate + route re-derived; affected stages re-triggered. |
| Priority | P2 |

| TC | TC-G02-025 |
|---|---|
| Traces-to | FR-G02-006; state `any→WITHDRAWN` (P01 cancel) |
| Type | State-Transition |
| Title | Requester withdraws a non-terminal request; SLA timers stop |
| Preconditions | request `IN_REVIEW`, owner `emp-alice` |
| Steps | `POST /change-requests/{id}/withdraw`. |
| Expected | `200` `status=WITHDRAWN` (terminal); P01 cancel; SLA timers halted. |
| Priority | P2 |

| TC | TC-G02-026 |
|---|---|
| Traces-to | FR-G02-006; invalid transition |
| Type | State-Transition / Negative |
| Title | Withdraw on a terminal (COMMITTED) request is rejected |
| Preconditions | request `COMMITTED` |
| Steps | `POST /change-requests/{id}/withdraw`. |
| Expected | `409 CONFLICT`; withdraw only valid on non-terminal states. |
| Priority | P2 |

| TC | TC-G02-027 |
|---|---|
| Traces-to | FR-G02-006; reject terminal state |
| Type | State-Transition |
| Title | Reject with comment drives IN_REVIEW → REJECTED (terminal) |
| Preconditions | request `IN_REVIEW` |
| Steps | `POST .../decide` `{decision:REJECT, comment:"insufficient proof"}`. |
| Expected | `200` `status=REJECTED`; terminal; no further decisions accepted (subsequent decide → `409`). |
| Priority | P2 |

### FR-G02-007 — SLA tracking, reminders & escalation

| TC | TC-G02-028 |
|---|---|
| Traces-to | FR-G02-007; API-contract `GET /change-requests/{id}/sla` |
| Type | API-Contract |
| Title | SLA timeline returns due date, reminders and breach/escalation events |
| Preconditions | request submitted with stage `sla_hours` set |
| Steps | `GET /change-requests/{id}/sla`. |
| Expected | `200` `{ slaDueAt, events:[...] }` mirroring P01 SLA runtime. |
| Priority | P3 |

| TC | TC-G02-029 |
|---|---|
| Traces-to | FR-G02-007; `JOB-G02-SLA`; escalation_role |
| Type | Functional / E2E-Flow |
| Title | SLA breach escalates to escalation_role and records a cr_sla_event |
| Preconditions | pending stage past `sla_due_at`; `JOB-G02-SLA` runs |
| Steps | Advance clock past due; run SLA job; `GET .../sla`. |
| Expected | Escalation event appended; action reassigned/notified to `escalation_role`; X.2 reminder sent. |
| Priority | P2 |

### FR-G02-008 — Correction/Update, DOB hard-block, caste, gender

| TC | TC-G02-030 |
|---|---|
| Traces-to | FR-G02-008 AC5/BR2; §5.6 rule 14; `ERR-G02-HARDBLOCK` |
| Type | Negative / Boundary |
| Title | DOB change within 5-yr pre-retirement bar is hard-blocked |
| Preconditions | `emp-eric` DOB 1966-05-01 (within 5 yrs of superannuation) |
| Steps | `GET /change-requests/hard-block-check?fieldKey=dob&employeeId=emp-eric`; then submit a `dob` change. |
| Expected | `412 PRECONDITION_FAILED` code `ERR-G02-HARDBLOCK`; only the legal-process (special authority) path may proceed; standard route blocked (not merely flagged). |
| Priority | P1 |

| TC | TC-G02-031 |
|---|---|
| Traces-to | FR-G02-008 AC5; boundary (outside bar) |
| Type | Boundary |
| Title | DOB change outside the pre-retirement window passes the hard-block check |
| Preconditions | `emp-alice` DOB 1968-01-01 (>5 yrs to superannuation) |
| Steps | `GET /change-requests/hard-block-check?fieldKey=dob&employeeId=emp-alice`. |
| Expected | `200` HardBlockResult not-triggered; standard STATUTORY route allowed. |
| Priority | P2 |

| TC | TC-G02-032 |
|---|---|
| Traces-to | FR-G02-008 AC1/BR1; §5.6 rule 6; `ERR-PAST-DATED` |
| Type | Boundary / Negative |
| Title | Effective-date bounds: CORRECTION cannot be future-dated; UPDATE cannot back-date beyond grace |
| Preconditions | `emp-alice` |
| Steps | 1. `GET /change-requests/effective-date-rules?fieldKey=dob&changeType=CORRECTION`. 2. Submit CORRECTION with future `effective_from`. 3. Submit UPDATE with `effective_from` before grace. |
| Expected | 1. `200` bounds (≤ original date, ≥ DOJ). 2 & 3. `422 VALIDATION_FAILED` `ERR-PAST-DATED`. |
| Priority | P2 |

| TC | TC-G02-033 |
|---|---|
| Traces-to | FR-G02-008 AC6/BR4; FR-G02-003 |
| Type | Functional |
| Title | Caste/category change raises a G06 promotion-eligibility freeze until VERIFIED+sanction |
| Preconditions | `category` change for `emp-alice` |
| Steps | Submit category change; observe G06 freeze flag. |
| Expected | G06 promotion-eligibility freeze raised and persists until authority-portal `VERIFIED` and sanction completes (G02 raises the flag; G06 enforces). |
| Priority | P2 |

| TC | TC-G02-034 |
|---|---|
| Traces-to | FR-G02-008 AC7/BR5 (dignity-aware gender) |
| Type | Functional / Authorization |
| Title | Gender identity-recognition path uses privacy-protected evidence with masked rationale |
| Preconditions | `gender` change, `evidence_path=IDENTITY_RECOGNITION` |
| Steps | Submit gender change; a below-chain role reads the request. |
| Expected | Evidence/rationale masked (P02), audited (P05), non-gazette by default; correction path distinct from identity-recognition path. |
| Priority | P3 |

### FR-G02-009 — Bulk HR-initiated corrections

| TC | TC-G02-035 |
|---|---|
| Traces-to | FR-G02-009 AC1/AC4; state `bulk` UPLOADED→VALIDATED→COMMITTED/PARTIAL_FAILED |
| Type | E2E-Flow |
| Title | Bulk batch: upload → dry-run validate → aggregate approve → per-row idempotent commit |
| Preconditions | `hr-hema` uploads CSV with 3 valid + 1 invalid (bad IFSC) rows |
| Steps | 1. `POST /bulk-corrections`. 2. `POST /{id}/validate`. 3. `POST /{id}/submit`. 4. `hradm-raj` `POST /{id}/approve`. 5. `GET /{id}/report`. |
| Expected | 2. report `total=4, valid=3, invalid=1` with row reasons. 4. valid rows commit individually & idempotently; batch → `PARTIAL_FAILED`; invalid row not silently skipped. |
| Priority | P1 |

| TC | TC-G02-036 |
|---|---|
| Traces-to | FR-G02-009 BR1; auth (HR-only) |
| Type | Authorization / Negative |
| Title | Bulk corrections are HR-only; employee/self-service blocked |
| Preconditions | `emp-alice` authenticated |
| Steps | `POST /bulk-corrections`. |
| Expected | `403 FORBIDDEN`; bulk is never self-service. |
| Priority | P2 |

| TC | TC-G02-037 |
|---|---|
| Traces-to | FR-G02-009 BR3; SoD on aggregate approve |
| Type | Authorization / Negative |
| Title | Bulk batch approver must differ from initiator |
| Preconditions | `hr-hema` created & submitted the batch |
| Steps | `hr-hema` calls `POST /bulk-corrections/{id}/approve`. |
| Expected | `403 FORBIDDEN` (`ERR-G02-SOD`); approver ≠ initiator (P02). |
| Priority | P1 |

| TC | TC-G02-038 |
|---|---|
| Traces-to | FR-G02-009 AC7; FR-G02-017 (fan-out) |
| Type | Functional |
| Title | Bulk submit fans out one out-of-band data-subject notice per affected employee |
| Preconditions | batch touching 3 distinct employees, FINANCIAL rows |
| Steps | `POST /bulk-corrections/{id}/submit`. |
| Expected | 3 `data_subject_notices` rows + X.2 dispatches; FINANCIAL rows respect objection window before downstream credit. |
| Priority | P2 |

### FR-G02-010 — Effective-dated commit to G01/M01

| TC | TC-G02-039 |
|---|---|
| Traces-to | FR-G02-010 AC1; §5.6 rule 3 (single-commit) |
| Type | Data-Integrity |
| Title | Commit is idempotent on commit_idempotency_key — re-run is a no-op |
| Preconditions | approved request committed once (item `COMMITTED`) |
| Steps | Re-trigger commit with same `change_request_item_id` key / `Idempotency-Key`. |
| Expected | No-op; item stays `COMMITTED`; no duplicate G01/M01 write; `GET /change-requests/{id}/commit-status` unchanged. |
| Priority | P1 |

| TC | TC-G02-040 |
|---|---|
| Traces-to | FR-G02-010 AC2; §5.6 rule 2; `ERR-G02-STALE`; state `APPROVED→RETURNED` |
| Type | Data-Integrity / Negative |
| Title | Stale old_value_hash at commit aborts with no partial writes |
| Preconditions | master `bank_account_no` changed after approval; `old_value_hash` mismatch |
| Steps | Trigger commit on APPROVED request. |
| Expected | `409 CONFLICT` code `ERR-G02-STALE`; request → `RETURNED`; zero partial writes (atomic). |
| Priority | P1 |

| TC | TC-G02-041 |
|---|---|
| Traces-to | FR-G02-010 AC5; state `APPROVED→COMMIT_FAILED→COMMITTED` |
| Type | State-Transition / Data-Integrity |
| Title | G01/M01 unavailable → COMMIT_FAILED with X.1 retry, no data loss |
| Preconditions | G01 effective-dated path down at commit |
| Steps | 1. Trigger commit (G01 down). 2. Restore G01; retry job runs. |
| Expected | 1. `status=COMMIT_FAILED`, alert raised. 2. retry → `COMMITTED`; no data loss. |
| Priority | P1 |

| TC | TC-G02-042 |
|---|---|
| Traces-to | FR-G02-010 AC3/AC4; §5.6 rule 11 (sequence) |
| Type | Data-Integrity |
| Title | On commit, SR + retro enqueue AFTER COMMITTED and never gate it |
| Preconditions | STATUTORY item approved |
| Steps | Commit; `GET /change-requests/{id}/commit-status`. |
| Expected | Item `COMMITTED` set first; `sr_posting_status` and `retro_status` shown as separate `PENDING`/tracking fields; commit not blocked by SR/retro outcome. |
| Priority | P1 |

| TC | TC-G02-043 |
|---|---|
| Traces-to | FR-G02-010 BR3/AC (effective-dated staging) |
| Type | Data-Integrity |
| Title | Future effective_from is staged by JOB-G01-EFFDATE, not written live |
| Preconditions | UPDATE with `effective_from = today+30d` |
| Steps | Approve + commit; inspect G01 apply. |
| Expected | Change staged (not live) and applied on the effective date by `JOB-G01-EFFDATE`; `effective_from` passed through. |
| Priority | P2 |

| TC | TC-G02-044 |
|---|---|
| Traces-to | FR-G02-010 BR4; FR-G02-017 |
| Type | Functional |
| Title | HR-initiated FINANCIAL change holds first payroll credit until objection window elapses |
| Preconditions | HR_ON_BEHALF `bank_account_no` change committed |
| Steps | Commit; check credit-hold; elapse objection window. |
| Expected | First credit held during window; retro event emitted only after hold clears; commit-status shows "credit held until {window}". |
| Priority | P1 |

### FR-G02-011 — G01→G12 SR posting-status tracking (G02 is NOT an SR writer)

| TC | TC-G02-045 |
|---|---|
| Traces-to | FR-G02-011 AC1/BR1; boundary §2.3 |
| Type | Data-Integrity / Boundary |
| Title | Only G01 posts the SR event; G02 emits no SR write and carries no source_module=G02 |
| Preconditions | STATUTORY `pan` item COMMITTED |
| Steps | Commit; inspect G12 `service_register_events`; `GET /change-requests/{id}/sr-status`. |
| Expected | SR event exists with `source_module=G01`; no G02-authored ledger row; G02 only reads/tracks `sr_posting_status`. |
| Priority | P1 |

| TC | TC-G02-046 |
|---|---|
| Traces-to | FR-G02-011 AC3; API-contract `GET /change-requests/{id}/sr-status` |
| Type | API-Contract / State-Transition |
| Title | Observed successful G01 post sets sr_posting_status=POSTED with reference |
| Preconditions | G01 posted the SR event |
| Steps | `GET /change-requests/{id}/sr-status`. |
| Expected | `200` per-item `sr_posting_status=POSTED` with returned SR reference. |
| Priority | P2 |

| TC | TC-G02-047 |
|---|---|
| Traces-to | FR-G02-011 AC2; idempotency `item_id + ':SR'` |
| Type | Data-Integrity |
| Title | SR posting-status reconciliation is idempotent |
| Preconditions | reconciliation already ran |
| Steps | Re-run reconcile for same item. |
| Expected | No-op on `change_request_item_id + ':SR'`; no duplicate tracking rows. |
| Priority | P2 |

| TC | TC-G02-048 |
|---|---|
| Traces-to | FR-G02-011 AC3/AC5; API-contract `POST /change-requests/{id}/sr-retry` |
| Type | Negative / API-Contract |
| Title | Failed G01 SR post sets FAILED, alerts, and supports manual reconcile retry |
| Preconditions | G01 post rejected by G12 |
| Steps | 1. `GET .../sr-status`. 2. `srcust-sam` `POST /change-requests/{id}/sr-retry`. |
| Expected | 1. `sr_posting_status=FAILED`; alert to HR Admin + SR Custodian (X.2). 2. `202` reconciliation re-queued; commit retained (never silently lost). |
| Priority | P1 |

| TC | TC-G02-049 |
|---|---|
| Traces-to | FR-G02-011; API-contract `GET /reports/sr-reconciliation` |
| Type | API-Contract |
| Title | Unposted statutory items appear in the SR reconciliation report |
| Preconditions | ≥1 item with `sr_posting_status != POSTED` |
| Steps | `srcust-sam` `GET /reports/sr-reconciliation?limit=25`. |
| Expected | `200` cursor list including the unposted item. |
| Priority | P3 |

### FR-G02-012 — Config (approval flow, sensitivity, e-sign, regex)

| TC | TC-G02-050 |
|---|---|
| Traces-to | FR-G02-012; auth (Org-Admin only) |
| Type | Authorization |
| Title | Only Org-Admin may create sensitivity/approval config |
| Preconditions | `hradm-raj` (hr_admin) authenticated |
| Steps | `POST /admin/field-sensitivity`. |
| Expected | `403 FORBIDDEN`; config restricted to Org/Platform Admin. |
| Priority | P2 |

| TC | TC-G02-051 |
|---|---|
| Traces-to | FR-G02-012; §5.6 rule 16; `VAL-G02-AUTHBEAR` |
| Type | Negative / Data-Integrity |
| Title | Config rejects auth-bearing field with auto_apply_on_low=true |
| Preconditions | `sysadm-sara` |
| Steps | `POST /admin/field-sensitivity` `{ is_auth_bearing:true, auto_apply_on_low:true }`. |
| Expected | `422 VALIDATION_FAILED` (`VAL-G02-AUTHBEAR`); auth-bearing forces `sensitivity ≥ MEDIUM` and `auto_apply_on_low=false`. |
| Priority | P1 |

| TC | TC-G02-052 |
|---|---|
| Traces-to | FR-G02-012; `VAL-FLOW-NOCYCLE` |
| Type | Negative |
| Title | Approval matrix with a circular stage is rejected at config save |
| Preconditions | `sysadm-sara` |
| Steps | `POST /admin/approval-matrices` with a cyclic route. |
| Expected | `422 VALIDATION_FAILED` (`VAL-FLOW-NOCYCLE`); unknown roles / weak methods also 422. |
| Priority | P2 |

| TC | TC-G02-053 |
|---|---|
| Traces-to | FR-G02-012; §5.6 rule 18; `VAL-G02-REGEXSAFE` |
| Type | Negative / API-Contract |
| Title | ReDoS-unsafe validation regex is rejected by the safe-regex test |
| Preconditions | `sysadm-sara` |
| Steps | `POST /admin/validation-regex/test` with catastrophic-backtracking pattern. |
| Expected | `200` result flags unsafe (or `422`); pattern not accepted; timeout-bounded compile. |
| Priority | P2 |

| TC | TC-G02-054 |
|---|---|
| Traces-to | FR-G02-012; §5.6 rule 19 (version pinning) |
| Type | Data-Integrity / State-Transition |
| Title | Activating a new matrix version does not affect in-flight instances |
| Preconditions | instance started on matrix v1; then `POST /admin/approval-matrices/{id}/activate` v2 |
| Steps | Advance the in-flight instance after v2 activation. |
| Expected | In-flight instance continues on v1 (pinned); only new instances use v2; cannot retire the last default (`409`). |
| Priority | P2 |

### FR-G02-013 — Delegation (role-independent)

| TC | TC-G02-055 |
|---|---|
| Traces-to | FR-G02-013; §3.2 (delegation non-elevation); `ERR-G02-SOD` |
| Type | Authorization / Negative |
| Title | Delegate must independently hold the stage's required role |
| Preconditions | `hradm-raj` delegates a HIGH-approval stage to `emp-alice` (lacks required role) |
| Steps | `POST /delegations` `{ delegate: emp-alice, ... }`. |
| Expected | `403 FORBIDDEN` code `ERR-G02-SOD`; delegation transfers the action, never the privilege. |
| Priority | P1 |

| TC | TC-G02-056 |
|---|---|
| Traces-to | FR-G02-013; API-contract create/revoke |
| Type | Functional |
| Title | Valid delegation lets a role-qualified delegate act, then revoke stops it |
| Preconditions | `hradm-raj` delegates to `hr-hema` (holds required role) |
| Steps | 1. `POST /delegations`. 2. `hr-hema` acts on a queued stage. 3. `POST /delegations/{id}/revoke`. 4. `hr-hema` acts again. |
| Expected | 1. `201`. 2. action allowed (SoD still holds: delegate ≠ maker/target). 3. `200` revoked. 4. `403`. |
| Priority | P2 |

### FR-G02-014 — Templates

| TC | TC-G02-057 |
|---|---|
| Traces-to | FR-G02-014; API-contract `fromTemplate` |
| Type | Functional |
| Title | Create a draft seeded from a W.2 template |
| Preconditions | template `tpl-addr` exists |
| Steps | `POST /change-requests?fromTemplate=tpl-addr`. |
| Expected | `201` draft pre-filled from template (P02-filtered); non-authorized template fields excluded. |
| Priority | P3 |

| TC | TC-G02-058 |
|---|---|
| Traces-to | FR-G02-014; auth (admin create) |
| Type | Authorization |
| Title | Only admin can create/update change-request templates |
| Preconditions | `emp-alice` |
| Steps | `POST /admin/change-request-templates`. |
| Expected | `403 FORBIDDEN`. |
| Priority | P3 |

### FR-G02-015 — Strong e-signature (method policy)

| TC | TC-G02-059 |
|---|---|
| Traces-to | FR-G02-015 AC1; §5.6 rule 5; `ERR-G02-ESIGN` |
| Type | Negative / State-Transition |
| Title | Decision on a requires_esignature stage blocked without captured e-signature |
| Preconditions | STATUTORY `first_name` stage; no e-sign captured |
| Steps | `POST .../decide` `{decision:APPROVE}` without prior esign. |
| Expected | `412 PRECONDITION_FAILED` code `ERR-G02-ESIGN`; stage not advanced. |
| Priority | P1 |

| TC | TC-G02-060 |
|---|---|
| Traces-to | FR-G02-015 AC6/BR3; `ERR-G02-ESIGN-METHOD` |
| Type | Negative / Boundary |
| Title | FINANCIAL/STATUTORY reject weak (OTP) e-sign method |
| Preconditions | `bank_account_no` (FINANCIAL-HIGH) stage; `allowed_esign_methods=[PKI_DSC, AADHAAR_ESIGN]` |
| Steps | `POST .../esign` `{ sign_method: OTP }`. |
| Expected | `422 VALIDATION_FAILED` code `ERR-G02-ESIGN-METHOD`; PASSWORD_REAUTH does not exist. |
| Priority | P1 |

| TC | TC-G02-061 |
|---|---|
| Traces-to | FR-G02-015 AC2; hash-chain (OPEN-PLAT-03) |
| Type | Data-Integrity |
| Title | E-signature binds SHA-256 of canonical decision payload; tampering invalidates verification |
| Preconditions | e-sign captured with PKI_DSC |
| Steps | 1. `POST .../esign`. 2. mutate decision payload; verify. |
| Expected | 1. `201` `signed_payload_hash` set, hash-chained append-only. 2. payload change → verification fails, forces re-sign. |
| Priority | P1 |

| TC | TC-G02-062 |
|---|---|
| Traces-to | FR-G02-015 Edge; provider down |
| Type | Negative |
| Title | E-sign provider down blocks the decision (412, retryable) |
| Preconditions | X.3 e-sign provider unavailable |
| Steps | `POST .../esign` with strong method. |
| Expected | `412 PRECONDITION_FAILED` (`ERR-PRECOND`); decision not persisted; no public 503. |
| Priority | P2 |

### FR-G02-016 — Provenance, field history, tamper-evident audit

| TC | TC-G02-063 |
|---|---|
| Traces-to | FR-G02-016; API-contract `GET /employees/{id}/field-history` |
| Type | API-Contract |
| Title | Field history returns ordered who/what/when/authority/document trail (P02-masked) |
| Preconditions | committed changes exist for `emp-alice.email` |
| Steps | `aud-amit` `GET /employees/emp-alice/field-history?fieldKey=email`. |
| Expected | `200` cursor list ordered, sourced from committed requests + P05; sensitive values masked. |
| Priority | P2 |

| TC | TC-G02-064 |
|---|---|
| Traces-to | FR-G02-016; §5.6 rule 13; API-contract `POST /audit/verify-chain` |
| Type | Data-Integrity |
| Title | Audit hash-chain verification reports integrity / flags a break |
| Preconditions | `aud-amit`/`hradm-raj` authorized for chain verify |
| Steps | `POST /audit/verify-chain`. |
| Expected | `200` ChainVerifyResult intact; a tampered chain reports the break (OPEN-PLAT-03; `JOB-G02-AUDITVERIFY`). |
| Priority | P1 |

| TC | TC-G02-065 |
|---|---|
| Traces-to | FR-G02-016; auth (auditor read-only) |
| Type | Authorization |
| Title | Auditor has read-only access and cannot mutate requests |
| Preconditions | `aud-amit` (read-only entitlement) |
| Steps | 1. `GET /reports/change-requests`. 2. attempt `POST /change-requests`. |
| Expected | 1. `200`. 2. `403 FORBIDDEN`; auditor is read + P05 query only, no write role. |
| Priority | P2 |

### FR-G02-017 — Data-subject notice & confirmation/objection window

| TC | TC-G02-066 |
|---|---|
| Traces-to | FR-G02-017 AC1/AC2; state `DRAFT→NOTICE_HOLD` |
| Type | E2E-Flow / State-Transition |
| Title | HR_ON_BEHALF FINANCIAL change enters NOTICE_HOLD with an out-of-band notice + 48h window |
| Preconditions | `hr-hema` submits HR_ON_BEHALF `bank_account_no` change for `emp-alice` |
| Steps | 1. submit. 2. `GET /change-requests/{id}/notice`. |
| Expected | 1. `status=NOTICE_HOLD`; `data_subject_notices` row; out-of-band X.2 dispatch to Alice's recorded contact (EMAIL non-suppressible). 2. `objection_window_ends_at` = +48h; credit held. |
| Priority | P1 |

| TC | TC-G02-067 |
|---|---|
| Traces-to | FR-G02-017 AC4/BR (anti-takeover, R1) |
| Type | Functional / Security |
| Title | Auth-bearing contact change notifies the OLD value (anti-takeover) |
| Preconditions | `email` change for `emp-alice` |
| Steps | Submit email change; inspect notices. |
| Expected | Notice sent to OLD email (and new) — `MSG-G02-OLDALERT`; takeover made visible. |
| Priority | P1 |

| TC | TC-G02-068 |
|---|---|
| Traces-to | FR-G02-017 AC3; state `NOTICE_HOLD→SUBMITTED` (elapse) and `→OBJECTED` (object) |
| Type | State-Transition |
| Title | Confirm / object / elapse outcomes drive the correct transition |
| Preconditions | request in `NOTICE_HOLD` |
| Steps | (a) `POST /change-requests/{id}/notice/confirm`. (b) separate case: `POST .../notice/object`. (c) separate case: let window elapse. |
| Expected | (a) hold released early → `SUBMITTED`. (b) → `OBJECTED` (routes to Grievance Officer). (c) `WINDOW_ELAPSED` → `SUBMITTED`. |
| Priority | P1 |

| TC | TC-G02-069 |
|---|---|
| Traces-to | FR-G02-017 AC5; delivery failure |
| Type | Negative |
| Title | Notice delivery failure alerts HR and blocks auto-clearance of the hold |
| Preconditions | undeliverable contact (X.2 backoff ×5 + DLQ exhausted) |
| Steps | Submit; observe hold. |
| Expected | HR alert raised; hold NOT auto-cleared; postal fallback / hold extended. |
| Priority | P2 |

| TC | TC-G02-070 |
|---|---|
| Traces-to | FR-G02-017 AC (confirm/object authorization) |
| Type | Authorization |
| Title | Only the data subject can confirm/object on their own record |
| Preconditions | request on `emp-alice`; caller `hr-hema` |
| Steps | `POST /change-requests/{id}/notice/object` as `hr-hema`. |
| Expected | `403 FORBIDDEN`; confirm/object restricted to the data subject. |
| Priority | P2 |

### FR-G02-018 — Employment-status gating & elevated paths

| TC | TC-G02-071 |
|---|---|
| Traces-to | FR-G02-018 AC1; §5.6 rule 12; `ERR-G02-STATUSGATE` |
| Type | Negative / Authorization |
| Title | Self-service on a non-ACTIVE (RETIRED) target is blocked |
| Preconditions | `emp-carol` RETIRED attempts self-service change |
| Steps | Submit self-service request on `emp-carol`. |
| Expected | `403 FORBIDDEN` code `ERR-G02-STATUSGATE`; self-service blocked for non-ACTIVE. |
| Priority | P1 |

| TC | TC-G02-072 |
|---|---|
| Traces-to | FR-G02-018 AC3/BR2; deceased family-pension dual-control |
| Type | Authorization / State-Transition |
| Title | Bank/nominee change on DECEASED routes to family-pension path with Appointing-Authority sanction |
| Preconditions | `emp-dan` DECEASED; `hr-hema` initiates bank change |
| Steps | Submit HR_ON_BEHALF bank change on `emp-dan`; ordinary HR attempts self-approve. |
| Expected | Routes to family-pension elevated path (enhanced evidence + `aa-anand` sanction); ordinary HR self-approve blocked (`ERR-G02-SOD`); never auto-applies. |
| Priority | P1 |

| TC | TC-G02-073 |
|---|---|
| Traces-to | FR-G02-018 AC4; re-gate on mid-flow status change |
| Type | State-Transition |
| Title | Status change between draft and submit re-evaluates the gate |
| Preconditions | draft created while ACTIVE; target becomes SUSPENDED before submit |
| Steps | Submit. |
| Expected | Gate re-evaluated on `employment_status_at_submit`; blocked/elevated accordingly; snapshot recorded. |
| Priority | P2 |

| TC | TC-G02-074 |
|---|---|
| Traces-to | FR-G02-018 Failure Handling; fail-closed |
| Type | Negative |
| Title | G01/M01 status read failure fails closed (412, blocks) |
| Preconditions | G01 status read errors |
| Steps | `GET /employees/{id}/status-gate?fieldKey=bank_account_no`. |
| Expected | `412 PRECONDITION_FAILED`; fail-closed (block), never fail-open. |
| Priority | P1 |

### FR-G02-019 — Fraud, velocity & anomaly signals

| TC | TC-G02-075 |
|---|---|
| Traces-to | FR-G02-019 AC4 (mule); duplicate-bank across employees |
| Type | Functional / Security |
| Title | Same new bank account on ≥2 employees fires DUPLICATE_BANK_ACCOUNT |
| Preconditions | `emp-alice` and `emp-bob` submit `bank_account_no=ACC-9999` within window (same tenant) |
| Steps | Submit both; `GET /change-requests/{id}/risk`. |
| Expected | `DUPLICATE_BANK_ACCOUNT` signal fired; `cr_risk_signals` rows; linked employee_ids surfaced. |
| Priority | P1 |

| TC | TC-G02-076 |
|---|---|
| Traces-to | FR-G02-019 AC3; `ERR-G02-RISKBLOCK` |
| Type | Negative / State-Transition |
| Title | risk_band=BLOCKED prevents commit/submission |
| Preconditions | request scores `BLOCKED` |
| Steps | Attempt submit/commit. |
| Expected | `412 PRECONDITION_FAILED` code `ERR-G02-RISKBLOCK`; held pending review; `HIGH` instead injects the fraud-review stage (not blocked). |
| Priority | P1 |

| TC | TC-G02-077 |
|---|---|
| Traces-to | FR-G02-019 AC5 (auth-then-financial chain, R1) |
| Type | Functional / Security |
| Title | Auth-bearing contact change then FINANCIAL change fires AUTH_CHANNEL_THEN_FINANCIAL |
| Preconditions | `emp-alice` changes `email`, then `bank_account_no` within window |
| Steps | Submit both in sequence. |
| Expected | `AUTH_CHANNEL_THEN_FINANCIAL` signal fired; scrutiny added. |
| Priority | P1 |

| TC | TC-G02-078 |
|---|---|
| Traces-to | FR-G02-019 AC6/BR2; auth `fraud_reviewer` flag |
| Type | Authorization / State-Transition |
| Title | Fraud Reviewer can clear/confirm/escalate; CONFIRMED_FRAUD rejects the request |
| Preconditions | HIGH-risk request in fraud queue; `fraud-fiona` has `fraud_reviewer` flag |
| Steps | 1. non-flag user `GET /fraud/queue`. 2. `fraud-fiona` `POST /change-requests/{id}/risk/{signalId}/review` `{outcome:CONFIRMED_FRAUD}`. |
| Expected | 1. `403 FORBIDDEN`. 2. request → `REJECTED` (P01 reject); security alert (X.2); P05 captured; reviewer ≠ request creator. |
| Priority | P1 |

### FR-G02-020 — Emergency reversal / break-glass

| TC | TC-G02-079 |
|---|---|
| Traces-to | FR-G02-020 AC1; `ERR-REASON-REQ`; boundary (COMMITTED only) |
| Type | Negative / State-Transition |
| Title | Reversal only against a COMMITTED item and requires a reason |
| Preconditions | committed `bank_account_no` item |
| Steps | 1. Initiate reversal without reason. 2. Initiate against a non-COMMITTED item. |
| Expected | 1. `422 VALIDATION_FAILED` `ERR-REASON-REQ`. 2. rejected (only COMMITTED items reversible). |
| Priority | P1 |

| TC | TC-G02-080 |
|---|---|
| Traces-to | FR-G02-020 AC2; §5.6 rule 17; `ERR-G02-DUALAUTH`; state `COMMITTED→REVERSED` |
| Type | Authorization / Negative |
| Title | Reversal requires two distinct authorisers; auth1 ≠ auth2 ≠ original maker |
| Preconditions | reversal raised by `hr-hema`; committing maker was `hradm-raj` |
| Steps | 1. `hradm-raj` supplies both auth1 and auth2. 2. `hradm-raj` (auth1) + `aa-anand` (auth2) authorise. |
| Expected | 1. `412 PRECONDITION_FAILED` code `ERR-G02-DUALAUTH` (auth1=auth2 and =maker). 2. valid dual-auth → item + request `REVERSED`, G01/M01 restored to `revert_to_value` (effective-dated); P05 `security_audit_log`. |
| Priority | P1 |

| TC | TC-G02-081 |
|---|---|
| Traces-to | FR-G02-020; FR-G02-011 AC6 (reversing SR posted by G01) |
| Type | Data-Integrity |
| Title | Statutory reversal yields a reversing SR event posted by G01 (not G02) |
| Preconditions | reversal of a STATUTORY committed item |
| Steps | Execute reversal; inspect SR + retro. |
| Expected | Reversing SR event `source_module=G01`, `source_ref = item_id + ':REV:' + reversal_id`; reversing retro emitted; G02 records observed status; idempotent on the REV key. |
| Priority | P1 |

### FR-G02-021 — Data-subject grievance & objection

| TC | TC-G02-082 |
|---|---|
| Traces-to | FR-G02-021; state `OBJECTED→IN_REVIEW` (dismissed) / `→REJECTED` (upheld); auth `grievance_officer` |
| Type | Authorization / State-Transition |
| Title | Grievance Officer resolves an objection: dismiss resumes, uphold rejects in-flight |
| Preconditions | request `OBJECTED`; `griev-gita` has `grievance_officer` flag |
| Steps | 1. non-flag user attempts resolve. 2. `griev-gita` dismiss (case A) / uphold (case B). |
| Expected | 1. `403 FORBIDDEN`. 2A. `OBJECTED→IN_REVIEW`. 2B. `OBJECTED→REJECTED` (in-flight uphold); committed-change uphold triggers reversal review (FR-020). |
| Priority | P1 |

| TC | TC-G02-083 |
|---|---|
| Traces-to | FR-G02-021; objection can pause commit / trigger reversal |
| Type | Functional |
| Title | Objection raised during NOTICE_HOLD pauses the request before any money moves |
| Preconditions | FINANCIAL change in `NOTICE_HOLD` |
| Steps | Data subject objects within the window. |
| Expected | Request → `OBJECTED`; credit hold maintained; routed to Grievance Officer; no downstream credit. |
| Priority | P1 |

### FR-G02-022 — Downstream retro-impact reconciliation

| TC | TC-G02-084 |
|---|---|
| Traces-to | FR-G02-022; FR-G02-010 AC4; retro after COMMITTED |
| Type | Data-Integrity |
| Title | Retro-impacting correction enqueues a retro event and reconciles on ACK |
| Preconditions | CORRECTION on a pay-affecting field committed |
| Steps | Commit; observe retro; downstream (G10/G11/G06) ACKs. |
| Expected | `retro_impact_events` row `PENDING` after `COMMITTED` (never gates commit); idempotent on `item_id + ':RETRO:' + module`; on ACK → `ACKED`. |
| Priority | P1 |

| TC | TC-G02-085 |
|---|---|
| Traces-to | FR-G02-022; API-contract `GET /reports/retro-reconciliation` |
| Type | API-Contract / Negative |
| Title | Unacked / dead-letter retro events surface in the reconciliation report and retry |
| Preconditions | retro event unacked past threshold |
| Steps | `GET /reports/retro-reconciliation`. |
| Expected | `200` cursor list including the unacked event; X.1 retry/backoff; never dropped. |
| Priority | P2 |

### FR-G02-023 — Requester step-up authentication

| TC | TC-G02-086 |
|---|---|
| Traces-to | FR-G02-023 AC1/AC3; `ERR-G02-STEPUP`; state `DRAFT→SUBMITTED` guard |
| Type | Negative / State-Transition |
| Title | Submitting a HIGH/STATUTORY self-service request without valid step-up is blocked |
| Preconditions | `emp-alice` draft on `bank_account_no` (HIGH); no step-up captured |
| Steps | `POST /change-requests/{id}/submit`. |
| Expected | `412 PRECONDITION_FAILED` code `ERR-G02-STEPUP`; request stays `DRAFT`. |
| Priority | P1 |

| TC | TC-G02-087 |
|---|---|
| Traces-to | FR-G02-023 AC2/BR1; API-contract challenge/verify |
| Type | E2E-Flow |
| Title | Successful step-up (AAL2) binds to the request and permits submit within validity |
| Preconditions | `emp-alice` HIGH draft |
| Steps | 1. `POST /change-requests/{id}/step-up/challenge`. 2. `POST .../step-up/verify` success. 3. `POST .../submit`. |
| Expected | 2. `cr_step_up_events.SUCCESS` with `auth_assurance_level=AAL2`, `expires_at`=+10 min. 3. `200` `SUBMITTED`. |
| Priority | P1 |

| TC | TC-G02-088 |
|---|---|
| Traces-to | FR-G02-023 AC3 Edge (expiry); AC4 (failed recorded) |
| Type | Boundary / Negative |
| Title | Expired step-up forces re-challenge; failed step-ups recorded and block submit |
| Preconditions | step-up SUCCESS older than 10-min window; and a separate FAILED attempt |
| Steps | 1. submit with expired step-up. 2. submit after a FAILED step-up. |
| Expected | 1. `412 ERR-G02-STEPUP` (re-challenge). 2. `412`; failed attempt recorded to P05 `security_audit_log`. |
| Priority | P2 |

| TC | TC-G02-089 |
|---|---|
| Traces-to | FR-G02-023 BR2 (HR-on-behalf skips step-up) |
| Type | Functional |
| Title | HR-on-behalf path does not require step-up (uses data-subject notice instead) |
| Preconditions | `hr-hema` HR_ON_BEHALF HIGH change |
| Steps | Submit without step-up. |
| Expected | No `ERR-G02-STEPUP`; routes via NOTICE_HOLD + data-subject notice (FR-017). |
| Priority | P2 |

### Cross-cutting — multi-tenancy, contract envelope

| TC | TC-G02-090 |
|---|---|
| Traces-to | §2.2 multi-tenant scoping (Platform §0.1); error-taxonomy scope-safety |
| Type | Authorization / Data-Integrity |
| Title | Cross-tenant read returns 404 without leaking existence |
| Preconditions | request `CR-x` belongs to tenant `tn-other` |
| Steps | `hradm-raj` (`tn-gov`) `GET /change-requests/CR-x`. |
| Expected | `404 NOT_FOUND` (indistinguishable from absent); no cross-tenant leak; unscoped query rejected, not defaulted to all. |
| Priority | P1 |

| TC | TC-G02-091 |
|---|---|
| Traces-to | §4.1 API conventions; error-taxonomy envelope |
| Type | API-Contract |
| Title | Unauthenticated request returns 401 and canonical envelope with X-Correlation-Id header |
| Preconditions | no/expired bearer token |
| Steps | `POST /change-requests` without token. |
| Expected | `401 UNAUTHENTICATED`; body `{error:{code,message,field,details}}`; correlation id in **header**, not body. |
| Priority | P2 |

| TC | TC-G02-092 |
|---|---|
| Traces-to | §4.1 Idempotency-Key on unsafe POSTs |
| Type | Data-Integrity |
| Title | Replayed submit with same Idempotency-Key returns original result, not a duplicate |
| Preconditions | submit already succeeded with `Idempotency-Key: sk-9` |
| Steps | Re-POST submit with `sk-9` within 24h. |
| Expected | Original `200` result returned; no duplicate workflow instance (`ERR-DUP-INSTANCE` only for a genuine second open change). |
| Priority | P1 |

### FR-G02-012 (v3.2) — PII-tier classification on the field-sensitivity catalog

| TC | TC-G02-093 |
|---|---|
| Traces-to | FR-G02-012; v3.2 recon R3.2-1; §5.2 E5 `field_sensitivity_catalog.pii_tier_id` |
| Type | Functional / API-Contract |
| Title | Org-Admin sets a field's DPDPA PII tier on the sensitivity-catalog entry |
| Preconditions | `sysadm-sara` (Org-Admin); platform `pii_tiers` seeded (TIER_1/TIER_2/TIER_3/NON_PII) |
| Steps | `POST /admin/field-sensitivity` `{ fieldKey:"bank_account_no", sensitivity:"FINANCIAL", piiTierId:"<TIER_1 uuid>" }`; then `GET /admin/field-sensitivity`. |
| Expected | `201`/`200`; entry persists `piiTierId` and round-trips it on read; FK to platform `pii_tiers` honoured (unknown id → `422 VALIDATION_FAILED`; `ON DELETE RESTRICT` blocks tier deletion while referenced). |
| Priority | P2 |

| TC | TC-G02-094 |
|---|---|
| Traces-to | FR-G02-012; FR-G02-002; v3.2 recon note (PII tier vs routing sensitivity — orthogonality) |
| Type | Data-Integrity / Negative |
| Title | PII tier is orthogonal to approval routing — changing `piiTierId` does not alter the P01 route |
| Preconditions | Catalog entry for `bank_account_no` (`sensitivity=FINANCIAL`); route resolved via `approval_matrix_rules` |
| Steps | Capture `POST /change-requests/{id}/route-preview`; `PATCH /admin/field-sensitivity` to change only `piiTierId` (FINANCIAL sensitivity unchanged); re-run route-preview on an equivalent request. |
| Expected | `routePreview` / `highestSensitivity` are identical before and after; P01 route stays derived from `sensitivity`/`fieldGroup`/`fieldKey` only; `piiTierId` never appears in route resolution. |
| Priority | P1 |

| TC | TC-G02-095 |
|---|---|
| Traces-to | FR-G02-012; FR-M01-003 prototype `sensitive-changes` screen; v3.2 recon R3.2-1 |
| Type | Functional / API-Contract |
| Title | A Tier-1 field surfaces correctly under the sensitive-changes PII-tier grouping |
| Preconditions | `bank_account_no` classified `piiTierId=TIER_1`; a committed/in-review change request touches it |
| Steps | Read the field-sensitivity catalog (and the request diff) that the `sensitive-changes` review screen consumes. |
| Expected | The field resolves to PII Tier 1 and groups under "PII Tier 1" (distinct from Tier 2); grouping is driven by `piiTierId`, independent of the `sensitivity` value the routing uses. |
| Priority | P2 |

| TC | TC-G02-096 |
|---|---|
| Traces-to | FR-G02-012; v3.2 recon (add-only, nullable FK) |
| Type | Boundary |
| Title | `piiTierId` is optional — a NON_PII / unclassified field is accepted and not grouped as sensitive |
| Preconditions | `sysadm-sara`; a low-sensitivity field (e.g. `preferred_name`) |
| Steps | `POST /admin/field-sensitivity` with `piiTierId` omitted (null), then optionally set to the `NON_PII` tier. |
| Expected | Entry accepted with `piiTierId=null` (add-only nullable column, no forced default); such fields do not surface under any "PII Tier N" sensitive-changes group. |
| Priority | P3 |

---

## 3. Traceability Matrix (FR → TC, 0 gaps)

| FR | Title | Test cases |
|---|---|---|
| FR-G02-001 | Create & submit change request | TC-G02-001, 002, 003, 004, 005, 006 |
| FR-G02-002 | Sensitivity classification & P01 routing | TC-G02-007, 008, 009, 010 |
| FR-G02-003 | Document & authority-portal verification | TC-G02-011, 012, 013, 014 |
| FR-G02-004 | Maker-checker multi-level approval (SoD) | TC-G02-015, 016, 017, 018, 019, 020 |
| FR-G02-005 | Field-level diff & preview | TC-G02-021, 022 |
| FR-G02-006 | Rejection / return / resubmit / withdraw | TC-G02-023, 024, 025, 026, 027 |
| FR-G02-007 | SLA tracking & escalation | TC-G02-028, 029 |
| FR-G02-008 | Correction/Update, DOB hard-block, caste, gender | TC-G02-030, 031, 032, 033, 034 |
| FR-G02-009 | Bulk HR-initiated corrections | TC-G02-035, 036, 037, 038 |
| FR-G02-010 | Effective-dated commit to G01/M01 | TC-G02-039, 040, 041, 042, 043, 044 |
| FR-G02-011 | G01→G12 SR posting-status tracking (G02 not writer) | TC-G02-045, 046, 047, 048, 049 |
| FR-G02-012 | Approval-flow / sensitivity / e-sign / regex config | TC-G02-050, 051, 052, 053, 054, 093 (PII tier), 094 (PII tier), 095 (PII tier), 096 (PII tier) |
| FR-G02-013 | Delegation (role-independent) | TC-G02-055, 056 |
| FR-G02-014 | Change-request templates | TC-G02-057, 058 |
| FR-G02-015 | Strong e-signature (method policy) | TC-G02-059, 060, 061, 062 |
| FR-G02-016 | Provenance, field history, tamper-evident audit | TC-G02-063, 064, 065 |
| FR-G02-017 | Data-subject notice & objection window | TC-G02-066, 067, 068, 069, 070 |
| FR-G02-018 | Employment-status gating & elevated paths | TC-G02-071, 072, 073, 074 |
| FR-G02-019 | Fraud, velocity & anomaly signals | TC-G02-075, 076, 077, 078 |
| FR-G02-020 | Emergency reversal / break-glass | TC-G02-079, 080, 081 |
| FR-G02-021 | Data-subject grievance & objection | TC-G02-082, 083 |
| FR-G02-022 | Downstream retro-impact reconciliation | TC-G02-084, 085 |
| FR-G02-023 | Requester step-up authentication | TC-G02-086, 087, 088, 089 |
| Cross-cutting | Multi-tenancy & API-contract envelope | TC-G02-090, 091, 092 |

**Coverage:** 23 of 23 FRs mapped. 0 gaps. Plus 3 cross-cutting platform-contract cases.

### Error-code coverage (ERR-G02-* + shared)

| Code | HTTP | Test case(s) |
|---|---|---|
| ERR-G02-SOD | 403 | TC-G02-015, 016, 037, 055, 072 |
| ERR-G02-STATUSGATE | 403 | TC-G02-071 |
| ERR-G02-STEPUP | 412 | TC-G02-086, 088 |
| ERR-G02-HARDBLOCK | 412 | TC-G02-030 |
| ERR-G02-ESIGN | 412 | TC-G02-059 |
| ERR-G02-ESIGN-METHOD | 422 | TC-G02-060 |
| ERR-G02-AUTHPORTAL | 412 | TC-G02-012 |
| ERR-G02-RISKBLOCK | 412 | TC-G02-076 |
| ERR-G02-DUALAUTH | 412 | TC-G02-080 |
| ERR-G02-STALE | 409 | TC-G02-040 |
| ERR-DUP-INSTANCE | 409 | TC-G02-004, 092 |
| ERR-PAST-DATED | 422 | TC-G02-032 |
| ERR-REASON-REQ | 422 | TC-G02-023, 079 |
| ERR-PRECOND | 412 | TC-G02-011, 014, 062 |

---

## 4. Coverage Summary

### By type (a TC may carry a primary + secondary type; counted by primary)

| Type | Count |
|---|---|
| Functional | 16 |
| E2E-Flow | 8 |
| State-Transition | 14 |
| Negative | 18 |
| Authorization | 16 |
| Data-Integrity | 15 |
| API-Contract | 12 |
| Boundary | 7 |
| **Total TCs** | **96** |

### By priority

| Priority | Count |
|---|---|
| P1 (statutory / security / data-integrity critical) | 46 |
| P2 (core functional) | 39 |
| P3 (secondary / UX / report) | 11 |
| **Total** | **96** |

### Emphasis coverage (mandated areas)

| Mandated area | Test case(s) |
|---|---|
| Maker-checker SoD — reject self-approval | TC-G02-015, 016, 037, 055 |
| Field-sensitivity routing (high vs light) | TC-G02-007, 008, 017 |
| Step-up auth | TC-G02-086, 087, 088, 089 |
| E-signature | TC-G02-059, 060, 061, 062 |
| Document-proof for high-sensitivity | TC-G02-011, 012, 014 |
| Rejection + resubmission | TC-G02-023, 024, 027 |
| SLA / escalation | TC-G02-028, 029 |
| Bulk corrections | TC-G02-035, 036, 037, 038 |
| DOB hard-block | TC-G02-030, 031 |
| Critical model — G01 posts SR on commit; G02 only tracks sr_posting_status | TC-G02-042, 045, 046, 047, 048, 081 |
| Authorization | TC-G02-005, 013, 016, 017, 020, 036, 037, 050, 055, 058, 065, 070, 071, 078, 082, 090 |
| State-transition (valid + invalid) | TC-G02-018, 024, 025, 026, 027, 041, 054, 068, 073, 080, 086 |
| Data-integrity (idempotency, effective-dated commit) | TC-G02-019, 039, 040, 042, 043, 047, 061, 084, 092 |
