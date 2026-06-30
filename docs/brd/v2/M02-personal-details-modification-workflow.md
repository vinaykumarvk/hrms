# Employee Personal Details Modification Workflow — HRMS Module BRD (v2.0)

**Module code:** M02-EPDM
**Program:** Enterprise HRMS — "PeopleGov / HRMS Suite" (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v2.0 (revised — incorporates Adversarial Council adopted improvements 1–23)
**Supersedes:** v1.0 (`docs/brd/v1/M02-personal-details-modification-workflow.md`)
**Status:** Baseline for build (parallel-agent ready) — security-hardened, statutory-hardened, dependency-honest
**Owning systems of record referenced:** M01 (Employee Profile Management — employee master), M12 (Digital Employee Service Register), M13 (Document Management); consumed by M06 (Promotion/Seniority), M10 (Payroll), M11 (Pension)
**Authoring standard:** Reuses `docs/brd/SHARED_FOUNDATION.md` canonical entities, roles, conventions and technical defaults. Shared elements are referenced, not redefined.
**Council provenance:** `docs/evaluation/M02-personal-details-modification-workflow-council.md` — verdict *PROCEED to v2 — conditional*. Every adopted improvement and every High/Critical risk mitigation in the Risk Register (R1–R21) is incorporated as concrete requirements/controls (see §1.7 Amendments).

---

## 1. Executive Summary

### 1.1 Purpose

The Employee Personal Details Modification Workflow (M02-EPDM) is the **governed change-control layer** sitting in front of the employee master (M01). It converts ad-hoc, error-prone, paper-and-email driven edits to an employee's personal, demographic, contact, statutory and financial-instruction fields into **auditable, maker-checker-approved, document-backed change requests** with full before/after diff, multi-level routing by field sensitivity, SLA-driven escalation, statutory posting of approved sensitive changes into the Digital Service Register (M12), **adversary-resistant fraud controls, data-subject rights, employment-status gating, tamper-evident audit, and a closed-loop downstream retro-impact reconciliation** with payroll/pension/seniority.

M02 **does not own** the employee data fields themselves — M01 owns them. M02 owns the **request, review, approval, e-signature, effective-dating, commit-back, reversal and reconciliation lifecycle** that mutates those fields safely. M02 is the only sanctioned write path for self-service and routine HR-officer edits to governed M01 fields.

### 1.2 Business problem

In the current/legacy public-sector process: employees mail or hand paper forms to HR; clerks key changes directly into the master with no segregation of duties; sensitive changes (name, date of birth, bank account, caste/category, qualification) are altered without consistent documentary proof or senior sign-off; there is no field-level history of *who* changed *what*, *when*, on *whose authority*, and against *which document*; statutory changes are not reliably mirrored into the Service Register; pending requests stall with no SLA or escalation; **the data subject is never told when someone else changes their record; deceased/retired records can be silently re-banked for pension/terminal-benefit fraud; auth-bearing contact channels can be hijacked to divert OTP and salary; and the downstream pay/pension recomputation that the disputes actually turn on is fire-and-forget.** This creates audit findings, pension/seniority disputes, payroll mis-credits (wrong bank account), and fraud exposure (silent DOB/name/bank changes, mule accounts, collusion rings).

### 1.3 Solution overview

M02-EPDM delivers:

- **Self-service change requests** — employees (and HR officers on behalf of employees) propose field changes through guided forms scoped to the fields they are allowed to touch, gated by employment status and (for HIGH/STATUTORY) a fresh step-up re-authentication.
- **Field-level diff** — every request captures a structured before/after for each field, with reason, effective date, and explicit *clear/remove* intent for legitimate field emptying.
- **Configurable sensitivity & approval matrix** — each governed field is classified (LOW / MEDIUM / HIGH / STATUTORY); auth-bearing contact channels (phone/email) are MEDIUM-minimum (never silent auto-apply); identity numbers (Aadhaar/PAN) are HR-only with authority re-verification; high-sensitivity fields demand documentary proof, strong (non-OTP/non-password) e-signature and senior/multi-level approval.
- **Maker-checker engine** — built on the shared `workflow_instances` / `workflow_tasks` engine, supporting sequential and parallel approvers, recommend-then-sanction chains, and segregation of duties (maker ≠ checker, no self-approval, delegate must independently hold the role).
- **Supporting-document & authority-portal evidence** — documents stored in M13, linked to request items, verified by reviewers; caste/category changes require authority-portal certificate verification, not just an upload.
- **Correction vs. Update distinction & effective-dating** — a *correction* repairs an erroneous historical value (effective from the original date, with tracked retro impact); an *update* records a genuine forward change. DOB alteration near retirement is a configurable **hard-block** routed to a separate legal process.
- **Data-subject rights** — out-of-band notice + confirmation/objection window on any change initiated by someone else; a DPDP-aligned grievance/objection path that can pause commit or trigger reversal.
- **Fraud, velocity & anomaly detection** — mule-account, pre-payroll/pre-separation spike, and device/velocity signals feed a fraud-review queue.
- **Emergency reversal / break-glass** — fast, dual-authorised reversal of a committed erroneous change (e.g., wrong bank account before payroll) with a reversing SR event.
- **Closed-loop downstream reconciliation** — the `governed-field-changed`/retro-impact event to M10/M11/M06 is tracked, acknowledged, retried and reconciled with the same rigor as SR posting.
- **Tamper-evident audit** — hash-chained, append-only/WORM audit and e-signature ledgers with periodic integrity verification.
- **Bulk HR-initiated corrections, rejection/resubmission, SLA & escalation, statutory SR posting**, and **world-class extensions** — delegation, change-request templates, strong e-signature, parallel/sequential topologies, effective-dated application.

### 1.4 Scope summary

In scope: the full change-request lifecycle for governed M01 fields, plus data-subject rights, fraud signalling, reversal, and downstream retro reconciliation. Out of scope: definition/storage of the master fields themselves (M01), the SR ledger internals (M12), the document object store internals (M13), the *execution* of payroll/pension recomputation (M10/M11 perform it; M02 tracks the acknowledgement), promotion-eligibility business logic (M06 owns it; M02 raises the freeze flag), and authentication/MFA/SSO (shared platform; M02 *invokes* step-up).

### 1.5 Key business outcomes & KPIs

| Outcome | Metric | Target |
|---|---|---|
| Eliminate ungoverned direct edits | % of governed-field mutations flowing through M02 | 100% |
| Documentary integrity on sensitive changes | % HIGH/STATUTORY requests with verified supporting doc (or authority-portal verification for caste) | 100% |
| Faster turnaround | Median time from submission to final decision | ≤ 3 business days (LOW), ≤ 7 (HIGH) |
| Reduce stalled requests | % requests breaching SLA without escalation | 0% |
| Audit completeness & tamper-evidence | % approved changes with full who/what/when/authority/document trail in a hash-verified chain | 100% |
| Statutory mirroring | % approved STATUTORY changes posted to M12 within SLA | 100% |
| Downstream closed loop | % retro-impacting corrections with an acknowledged M10/M11/M06 recompute event | 100% |
| Data-subject awareness | % HR/BULK-initiated changes with delivered out-of-band data-subject notice | 100% |
| Fraud interception | % flagged high-risk requests reviewed before commit | 100% |
| Self-service adoption | % requests initiated by employees vs. HR | ≥ 70% within 6 months |

### 1.6 Primary stakeholders

Employees (self-service requesters **and data subjects with notice/objection rights**), Reporting Managers (recommenders), HR Officers / HR Admin (reviewers/checkers, bulk-correction makers, fraud-queue triage), Department Heads / Appointing Authority (senior approvers for STATUTORY, dual-authorisers for break-glass), **Grievance Officer** (handles data-subject objections — maps to HR Admin/Appointing Authority per config), SR Custodian / Registrar (consumes statutory postings via M12), Auditor (read-only oversight + audit-chain verification), System Administrator (approval-matrix & sensitivity configuration). Personas align with the shared RBAC roles in §4 of the Shared Foundation; the Grievance Officer is a *capability* assigned to an existing role, not a new principal.

### 1.7 (See §1.8) Amendments summary

v2 keeps the v1 architecture (a change-control layer, not a data owner) and all best-in-class plumbing (idempotency, append-only ledgers, saga/outbox, snapshot-immune routing), and **hardens** it with an adversary model, data-subject rights, public-sector statutory hard-rules, tamper-evidence and a downstream closed loop. The detailed mapping is in §1.8.

---

## 1.8 Amendments (v1 → v2)

Every adopted council improvement and every High/Critical risk mitigation is incorporated. "Where" cites the FR/entity/section that carries it.

| # | Adopted improvement (council) | Risk(s) mitigated | Where incorporated in v2 |
|---|---|---|---|
| 1 | Reclassify auth-bearing contact fields (phone/email LOW→MEDIUM, disable auto-apply, notify OLD value) | R1 (Critical) | §5.5 seed (`is_auth_bearing`, `notify_old_value`); FR-M02-002 BR5/AC7; FR-M02-017; E5 new columns |
| 2 | Mandatory data-subject notification + confirmation/objection window | R2 (Critical) | **New FR-M02-017**; E15 `data_subject_notices`; §11 notifications; FR-M02-010 BR4 (hold credit) |
| 3 | `employment_status` gating + elevated special paths | R3 (Critical) | **New FR-M02-018**; FR-M02-001 BR5; §5.6 rule 12; §10.6 |
| 4 | Default `national_id`/`pan` HR-only + UIDAI/PAN re-verification | R5 (High) | §5.5 seed (`self_service_editable=false`); FR-M02-003 BR4; §5.8 field-key registry |
| 5 | E-signature method policy by tier (drop PASSWORD_REAUTH; FINANCIAL/STATUTORY need PKI/DSC or Aadhaar) | R1 (Critical) | FR-M02-015 BR3/AC6; E10 (`PASSWORD_REAUTH` removed); FR-M02-012 (policy config) |
| 6 | Requester step-up MFA to initiate HIGH/STATUTORY self-service | R16 (Medium) | **New FR-M02-023**; E19 `cr_step_up_events`; FR-M02-001 AC7 |
| 7 | New FR — fraud / velocity / mule anomaly signals | R10 (High) | **New FR-M02-019**; E13 `cr_risk_signals`; §12 reports; §11 |
| 8 | Tamper-evident (hash-chained, WORM) audit + e-sign ledger | R6 (High) | **New** E18 `cr_audit_chain`; §5.6 rule 13; §9 (Auditability); FR-M02-016 BR4 |
| 9 | Close downstream retro loop (tracked/acknowledged/reconciled) | R7 (High) | **New FR-M02-022**; E14 `retro_impact_events`; FR-M02-010 BR4; §12 |
| 10 | Reconcile field-keys to M01 master (name→first/middle/last; category; national_id/pan; bank path) | R9 (High) | **New §5.8 Field-Key Registry**; §5.5 seed rewritten with `m01_field_key`; FR-M02-001 (composite name) |
| 11 | Recast §14.4 as honest dependency register (AGREED/IMPLEMENTED/VERIFIED) + hard gate | R8, R4 (High/Critical) | §14.4 rewritten; §14.5 Build-Gate Register; §2.4 elevated dependency |
| 12 | DOB statutory hard-block (not "extra scrutiny") | R11 (High) | FR-M02-008 BR2/AC5; §5.6 rule 14; `field_sensitivity_catalog.hard_block_rule_ref` |
| 13 | Caste/category controls (authority-portal verification + M06 promotion freeze) | R12 (High) | FR-M02-008 AC6/BR4; FR-M02-003 BR5; §8.6 (M06 freeze event); E2 `requires_authority_portal_verification` |
| 14 | Dignity-aware gender path (data-error vs identity recognition) | R12 (High) | FR-M02-008 AC7/BR5; §5.5 seed (`gender` evidence path) |
| 15 | New FR — Emergency reversal / break-glass | R13 (High) | **New FR-M02-020**; E17 `cr_reversals`; §10.7; reversing SR event in §8.6 |
| 16 | New FR — Data-subject grievance/objection | R14 (High) | **New FR-M02-021**; E16 `cr_objections`; §11 |
| 17 | Resolve commit/SR sequencing contradiction (fix integrity rule 11) | R15 (Medium) | §5.6 rule 11 rewritten; FR-M02-010 AC4; FR-M02-011 BR2; §10.2 |
| 18 | Harden `validation_regex` (ReDoS) + allow field clearing (nullable `new_value` + CLEAR flag) | R17, R19 (Medium/Low) | FR-M02-012 AC6/BR4; E2 (`new_value` nullable, `clear_intent`); §9 (Security) |
| 19 | DPDP/Aadhaar data-handling statement (tokenize Aadhaar vault, KMS rotation, crypto-shred) | R18 (Medium) | §4.4; §9 (Privacy); §5.6 rule 15; E2 (`vault_token_ref`) |
| 20 | Architecture decision — shared Change-Control seam (M05/M06/M09 future consumers) | R21 (Medium) | §4.5 ADR-M02-01; §2.3 boundary note |
| 21 | Glossary & semantics hardening (VERIFY/APPROVE/SANCTION; saga/outbox; field_group ≠ sensitivity) | (clarity) | §15 glossary expanded; §5.2 E5 note; §5.5 separates `field_group` from `sensitivity` |
| 22 | Re-phase rollout (security hardening into P1/P2; templates/delegation/bulk/any-one to P3/P4) | R20 (Low) | §13.3 re-phased; §14.3 workstream plan re-ordered |
| 23 | Delegation privilege clarity (delegate independently holds role) + security report | R21/(SoD) | FR-M02-013 BR1/AC6; §12 (privileged-action security report) |

**Net result:** v1 had **16 FRs / 12 module entities**; v2 has **23 FRs / 19 module entities**, **0 over-engineering removed wholesale** (convenience features are *re-phased*, not deleted), and **all 23 improvements + R1–R21 mitigations** carried as concrete, testable requirements.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Sub-area | What it covers | Primary FRs |
|---|---|---|
| Request authoring | Self-service & HR-on-behalf creation, draft, field selection, diff capture, composite-name sub-items, clear-intent | FR-M02-001, FR-M02-014 |
| Step-up & identity assurance | Fresh re-auth to initiate sensitive self-service changes | FR-M02-023 |
| Sensitivity & routing | Field sensitivity catalog, approval-matrix evaluation, route construction, auth-bearing reclassification | FR-M02-002, FR-M02-012 |
| Evidence | Supporting-document upload, linkage, verification, authority-portal verification (caste) | FR-M02-003 |
| Approval | Maker-checker, multi-level sequential/parallel, recommend→sanction, decisions, delegate role-independence | FR-M02-004, FR-M02-013, FR-M02-015 |
| Diff & preview | Field-level before/after, masking, preview, reviewer comparison | FR-M02-005 |
| Rejection lifecycle | Reasoned rejection, return-for-correction, resubmission, withdrawal | FR-M02-006 |
| Timeliness | SLA computation, reminders, escalation, reassignment | FR-M02-007 |
| Semantics & timing | Correction vs update, effective-dating, DOB hard-block, dignity-aware gender, retro flag | FR-M02-008 |
| Status gating | Employment-status gates & elevated paths (deceased/retired/suspended) | FR-M02-018 |
| Bulk operations | HR batch corrections, dry-run, per-row validation, aggregate approval | FR-M02-009 |
| Commit & downstream | Apply approved change to M01; post STATUTORY to M12; emit + reconcile retro to M10/M11/M06 | FR-M02-010, FR-M02-011, FR-M02-022 |
| Data-subject rights | Out-of-band notice + objection window; grievance/dispute path | FR-M02-017, FR-M02-021 |
| Fraud & anomaly | Mule/velocity/pre-payroll/pre-exit risk scoring + review queue | FR-M02-019 |
| Reversal | Emergency break-glass reversal with dual authority + reversing SR event | FR-M02-020 |
| Governance config | Approval-matrix & sensitivity administration, regex hardening, e-sign policy, delegation | FR-M02-012, FR-M02-013 |
| History & assurance | Change provenance, field history, tamper-evident audit, audit & reporting | FR-M02-016 |

### 2.2 Common Capabilities (cross-cutting, inherited or module-wide)

- **Maker-checker by default** for any governed-field mutation (per Shared Foundation §3).
- **Field-level, tamper-evident audit** to shared `audit_log` plus a module-owned hash-chain anchor (E18) on every state transition and every committed field change.
- **Row-level scoping** by `org_unit` — reviewers see only requests within their authority scope.
- **Soft delete + immutable history** — requests are never hard-deleted; superseded items retained; ledgers append-only.
- **Optimistic concurrency** — every commit to M01 validates the master version token / `old_value_hash` to prevent stale overwrites.
- **Idempotent commit, posting, retro & reversal** — apply-to-master, SR-posting, retro-event and reversal operations are idempotent on documented keys (§16.3).
- **Data-subject first-class** — the employee whose record changes is always notified out-of-band when someone else initiates the change, and can object.
- **Employment-status aware** — every request is gated by the target's M01 `employment_status`.
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
| Authority-portal (UIDAI/PAN/caste-portal) verification *call* | ✅ (invokes + records) | Portal/registry = external authority |
| Payroll/pension/seniority recomputation *execution* | — | M10 / M11 / M06 (consume + acknowledge event) |
| Retro-impact event tracking & reconciliation | ✅ | Recompute logic = M10/M11/M06 |
| Promotion-eligibility freeze *logic* | — (raises flag) | M06 (enforces freeze) |
| Authentication, MFA, SSO, step-up challenge | — (invokes) | Shared platform |
| Approval-engine primitives (tasks, routing) | Reuse | Shared `workflow_*` engine |
| Org hierarchy / reporting lines used for routing | Read | M01 / org platform |

**Boundary note (ADR-M02-01, see §4.5):** M02's approval/sensitivity/delegation/e-sign machinery is *module-agnostic by construction* and is exposed behind an interface + contract-test suite so M05/M06/M09 can later consume the same engine. M02 is the *first consumer*, not a re-platforming effort.

### 2.4 Assumptions & Constraints (with elevated hard dependency)

- **[HARD GATE — R4/R8/R11] M01 commit capability.** M01 exposes a governed-field metadata API (field key, datatype, current value, version) and the transactional **effective-dated** commit endpoint `PATCH /employees/{id}:commit` (confirmed in M01 BRD §… — performs an effective-dated write + version token). Workstream F (commit) and the statutory path **must not start** until this contract — including effective-dated/temporal write, version token and idempotency semantics — is **VERIFIED in staging** (§14.5 Build-Gate Register). This is the single most important precondition; it is *tracked*, not assumed-resolved.
- M12 exposes an idempotent `postServiceRegisterEvent(eventType, employeeId, payload, sourceRef)` contract, including a **reversing** event type for break-glass.
- M13 exposes upload + reference + virus-scan-status APIs and an export-artefact store.
- M10/M11/M06 expose an **acknowledgeable** retro-impact consumer endpoint (or subscribe to the event and post an ACK) so the downstream loop can be reconciled (FR-M02-022).
- An **authority-verification provider** exists for UIDAI (Aadhaar), Income-Tax (PAN) and the caste/category certificate portal; where a portal is unavailable, the field is HR-verified with recorded manual attestation and flagged.
- All actors are authenticated via shared OIDC/SSO + MFA; M02 enforces authorization and **invokes step-up** re-authentication for sensitive initiation.
- Statutory retention: change requests and their audit retained per government records schedule (default 7 years post-separation, configurable), reconciled against DPDP erasure rights via the legal-basis/retention-override statement (§4.4).

---

## 3. User Roles & Permissions

Roles reuse the Shared Foundation §4 RBAC baseline. M02 adds no new principals; it maps shared roles to module operations and introduces the **Grievance Officer** and **Fraud Reviewer** as *capabilities* assigned to existing roles (HR Admin / Appointing Authority / HR Officer per config). Segregation of duties is enforced: **the maker of a request can never be a checker on the same request, no actor can approve/sign a request they created or that mutates their own master record, and a delegate must independently satisfy the node's required role (no privilege elevation).**

### 3.1 Role-to-capability matrix

| Capability | Employee (Self-Service) | Reporting Manager | HR Officer | HR Admin | Dept Head / Appointing Authority | SR Custodian | Auditor | System Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create change request on **own** record | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create request **on behalf of** an employee | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Step-up re-auth to initiate HIGH/STATUTORY (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload supporting documents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Authority-portal verification (Aadhaar/PAN/caste) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Recommend (intermediate approval) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve LOW/MEDIUM sensitivity | ❌ | ✅ (config) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve HIGH sensitivity | ❌ | ❌ | ✅ (config) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sanction STATUTORY sensitivity | ❌ | ❌ | ❌ | ✅ (config) | ✅ | ❌ | ❌ | ❌ |
| Verify supporting documents | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reject / return for correction | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Withdraw own request | ✅ | ✅ | ✅ (own/initiated) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Triage fraud-review queue | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Handle data-subject objection (Grievance Officer) | ❌ | ❌ | ✅ (config) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Initiate emergency reversal (break-glass) | ❌ | ❌ | ✅ (raise) | ✅ (auth 1) | ✅ (auth 2) | ❌ | ❌ | ❌ |
| Initiate bulk corrections | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve bulk correction batch | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Apply e-signature | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Object to a change on **own** record (data subject) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Configure approval matrix / sensitivity / e-sign policy / regex | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage delegation (own outgoing) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (any) |
| View statutory SR posting status | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Verify audit hash-chain integrity | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ (config) |
| Read all requests + audit (no write) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (config only) |
| View own request status/history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Notes: "(config)" = governed by the configurable approval matrix / capability config (FR-012). "(scope)" = limited to the actor's `org_unit` row-level scope. System Admin has **no transactional self-approval** by design. Break-glass reversal requires **two distinct authorisers** (auth 1 ≠ auth 2 ≠ original maker).

### 3.2 Authorization principles

1. **Ownership check** — a self-service requester may only target their own `employee_id`.
2. **Scope check** — HR/manager/authority actions are bounded to their `org_unit` subtree.
3. **Status gate** — the request is permitted, blocked, or routed to an elevated path based on the target's M01 `employment_status` (FR-018).
4. **Sensitivity gate** — the minimum required approver role is derived from the field's sensitivity class via the approval matrix.
5. **Step-up gate** — initiating a HIGH/STATUTORY self-service request requires a fresh step-up re-authentication (FR-023).
6. **SoD invariant** — `request.created_by != approval.actor_id`, `approval.actor_id != target_employee.user_id`, and `reversal.auth1 != reversal.auth2 != original_maker` at every node.
7. **Delegation non-elevation** — a delegate must independently hold the node's `required_role`; delegation transfers the *action*, never the *privilege* (FR-013).
8. **Least-privilege PII** — unmasked sensitive values (bank account, Aadhaar/PAN) visible only to `view_sensitive_value` holders; every reveal is audited.

---

## 4. Shared Application Foundation & Cross-Agent Build Instructions

This module inherits, without redefinition, the Shared Foundation (`docs/brd/SHARED_FOUNDATION.md`). Build agents MUST consume the shared contracts rather than re-create them.

### 4.1 Inherited technical defaults

- **Frontend:** React + TypeScript, Tailwind + shadcn/ui; no skeleton UI — real fields, data, states.
- **Backend:** REST under `/api/v1`; Node/TypeScript or Java Spring; PostgreSQL primary store; object storage (M13) for documents.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level org scoping. M02 enforces authZ and invokes step-up re-auth.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503), plus M02-specific (§8).
- **Security/compliance:** OWASP ASVS L2, TLS 1.2+ in transit, encryption at rest, tamper-evident audit, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500 ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min; RTO ≤ 4 h.

### 4.2 Shared entities consumed (NOT redefined here)

| Shared entity | Owner | How M02 uses it |
|---|---|---|
| `employees` | M01 | Read current field values + version + `employment_status`; commit approved changes via M01 `PATCH /employees/{id}:commit`. |
| `users` | Platform | Identity of requesters/approvers/delegates; step-up challenge. |
| `roles` / `permissions` | Platform | Authorization checks, approval-matrix role keys, capability assignment (Grievance Officer, Fraud Reviewer). |
| `org_units` | Platform/M01 | Row-level scope, route construction by hierarchy. |
| `documents` | M13 | Store references to supporting documents; read scan/verify status; store export artefacts. |
| `workflow_instances` / `workflow_tasks` | Shared engine | Underlying maker-checker routing, task assignment, SLA timers. |
| `service_register_events` | M12 | Append statutory change events and reversing events on approval (idempotent). |
| `notifications` | Platform | Outbound email/SMS/in-app, incl. out-of-band data-subject notice. |
| `audit_log` | Platform | Immutable record of every transition; M02 anchors a hash-chain over it (E18). |

### 4.3 Cross-agent build instructions

1. **Do not duplicate M01 field storage.** Treat the employee master as authoritative; capture only proposed values in `change_request_items` until commit.
2. **Use the shared workflow engine** for routing. M02 maps each request to one `workflow_instance`; each approval node is a `workflow_task`. M02-specific approval semantics (sensitivity, e-sign) are stored in `change_request_approvals` keyed to the workflow task **behind the module-agnostic Change-Control interface (§4.5)**.
3. **Idempotency keys:** apply-to-master = `change_request_item_id`; SR posting = `change_request_item_id + ':SR'`; retro event = `change_request_item_id + ':RETRO'`; reversal = `change_request_item_id + ':REV:' + reversal_id`. Re-runs must be no-ops.
4. **Transaction boundary & canonical sequence (R15):** committing an approved request applies all items atomically (all-or-nothing) in a single DB transaction spanning M02 and the M01 commit; the canonical post-commit sequence is **M01 commit → item `COMMITTED` → (statutory) SR `PENDING`→`POSTED/FAILED` and (retro) retro-event `PENDING`→`ACKED/FAILED`**. SR/retro posting is tracked *separately* and never blocks reaching `COMMITTED`. If M01 is a separate service, use the documented saga/outbox pattern (§10.4).
5. **Configuration is data, not code:** sensitivity classes, approval routes, e-sign method policy, regex, and hard-block rules live in `field_sensitivity_catalog` and `approval_matrix_*`; never hard-code field→approver or method→tier mappings.
6. **Every write path emits a hash-chained audit row and (where applicable) a notification.** No silent state changes; the audit chain (E18) is verifiable.
7. **PII discipline (R18):** never log raw old/new values for HIGH/STATUTORY fields; store proposed sensitive values encrypted in `change_request_items`; store Aadhaar only as a **vault token reference** (`vault_token_ref`), never the full number; mask in UI per role.
8. **Field keys bind to the M01 registry (§5.8):** use `m01_field_key` from the catalog; model `name` as a **composite** request with `first_name`/`middle_name`/`last_name` sub-items; never invent a single `name` field.

### 4.4 DPDP & Aadhaar data-handling statement (R18 / Improvement 19)

- **Legal basis & retention override:** processing of governed personal data is on the legal basis of the employer–employee statutory relationship and public-sector records law; the **7-year post-separation retention** overrides DPDP erasure for the *audit/provenance* record, recorded as an explicit retention-override with statutory citation. Erasure requests are honoured for non-statutory convenience data and for the unmasked sensitive *value* via crypto-shred while preserving the hash-chained provenance shell (who/what/when/authority — without the raw value).
- **Aadhaar tokenisation:** the full Aadhaar number is **never** stored in `change_request_items`. M02 stores a `vault_token_ref` issued by the platform data vault; the last-4 masked form is used for display. PAN is stored masked (last-pattern) and is unique-checked via M01.
- **Key management & crypto-shred:** sensitive `change_request_items` columns are encrypted with field-level keys via the platform KMS, with rotation; per-record crypto-shred (destroy the field key) is the erasure mechanism, leaving an auditable tombstone.

### 4.5 ADR-M02-01 — Shared Change-Control seam (R21 / Improvement 20)

**Decision:** Do **not** re-platform now. Keep M02 as the *first consumer* of a **module-agnostic Change-Control interface** (`IChangeControlEngine` — propose, classify-sensitivity, build-route, decide, delegate, e-sign) backed by the already-generic `field_sensitivity_catalog` / `approval_matrix_*` tables and a **shared contract-test suite**. **M05 (transfers), M06 (promotions), M09 (penalties) are designated future consumers.** This preserves the v1 build schedule (no rewrite) while preventing four divergent re-implementations; later extraction to a standalone Change-Control Service is possible without surgery. Cost: a thin interface seam + shared contract tests now.

---

## 5. Holistic Data Model

### 5.1 Entity inventory

**Module-owned entities (M02):** v1's 12 entities (E1–E12) are retained and enhanced; v2 adds **E13–E19** for fraud signalling, downstream retro reconciliation, data-subject notice, grievance/objection, reversal, tamper-evident audit chaining, and step-up assurance.

| # | Entity | Purpose | Ledger? | New/Changed in v2 |
|---|---|---|---|---|
| E1 | `change_requests` | Header for a personal-details change request | No (soft-delete) | Changed (+`status` values, `parent_reversal_id`) |
| E2 | `change_request_items` | Per-field before/after diff lines | No (soft-delete) | Changed (`new_value` nullable, `clear_intent`, `vault_token_ref`, `requires_authority_portal_verification`, `m01_field_key`) |
| E3 | `change_request_documents` | Links items to M13 documents (evidence) | No | Changed (+`authority_portal_ref`, `authority_verification_status`) |
| E4 | `change_request_approvals` | Per-node approval decisions | Append-only | Unchanged (semantics clarified) |
| E5 | `field_sensitivity_catalog` | Classifies each governed M01 field & rules | No (versioned) | Changed (+`m01_field_key`, `is_auth_bearing`, `notify_old_value`, `requires_authority_portal_verification`, `tokenize_in_vault`, `hard_block_rule_ref`, `evidence_path`) |
| E6 | `approval_matrix_config` | Named, versioned approval-matrix definitions | No (versioned) | Unchanged |
| E7 | `approval_matrix_rules` | Per (sensitivity × scope) approval routes | No (versioned) | Unchanged |
| E8 | `delegations` | Temporary delegation of approval authority | No (soft-delete) | Changed (role-independence enforced) |
| E9 | `change_request_templates` | Reusable pre-filled request templates | No (soft-delete) | Unchanged |
| E10 | `esignatures` | Captured e-signatures on approvals | Append-only (hash-chained) | Changed (`PASSWORD_REAUTH` removed; method-policy) |
| E11 | `cr_sla_events` | SLA milestones/reminders/escalations | Append-only | Unchanged |
| E12 | `bulk_correction_batches` | Header for HR bulk correction jobs | No (soft-delete) | Unchanged |
| **E13** | `cr_risk_signals` | Fraud/velocity/mule/anomaly signals & scores | Append-only | **New (FR-019)** |
| **E14** | `retro_impact_events` | Tracked/acked downstream retro (M10/M11/M06) | Append-only | **New (FR-022)** |
| **E15** | `data_subject_notices` | Out-of-band notice + confirmation/objection window | Append-only | **New (FR-017)** |
| **E16** | `cr_objections` | Data-subject objections / grievances | No (soft-delete) | **New (FR-021)** |
| **E17** | `cr_reversals` | Emergency break-glass reversals (dual auth) | Append-only | **New (FR-020)** |
| **E18** | `cr_audit_chain` | Hash-chained tamper-evident audit anchors | Append-only (WORM) | **New (Imp 8)** |
| **E19** | `cr_step_up_events` | Step-up re-auth events at sensitive initiation | Append-only | **New (FR-023)** |

**Shared entities referenced (owned elsewhere — see §4.2):** `employees`, `users`, `roles`, `org_units`, `documents`, `workflow_instances`, `workflow_tasks`, `service_register_events`, `notifications`, `audit_log`.

### 5.2 Full field tables (E1–E12 retained from v1, with v2 deltas marked ★)

#### E1 — `change_requests`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_id` | UUID (PK) | N | gen | |
| `cr_number` | VARCHAR(24) UNIQUE | N | seq | e.g. `CR-2026-000123` |
| `target_employee_id` | UUID (FK→employees) | N | | Whose record is changed |
| `requested_by` | UUID (FK→users) | N | | Maker (self or HR-on-behalf) |
| `request_origin` | ENUM | N | `SELF_SERVICE` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK`, `REVERSAL` ★ |
| `change_type` | ENUM | N | `UPDATE` | `UPDATE`, `CORRECTION`, `REVERSAL` ★ |
| `highest_sensitivity` | ENUM | N | computed | Max sensitivity across items |
| `status` | ENUM | N | `DRAFT` | See §5.5 / §10 (adds `NOTICE_HOLD`, `OBJECTED`, `REVERSED` ★) |
| `employment_status_at_submit` | VARCHAR(20) | Y | | ★ Snapshot of M01 `employment_status` for gating (FR-018) |
| `risk_score` | SMALLINT | Y | | ★ 0–100 fraud score (FR-019); null until evaluated |
| `risk_band` | ENUM | Y | | ★ `LOW`,`MEDIUM`,`HIGH`,`BLOCKED` (FR-019) |
| `parent_reversal_id` | UUID (FK→cr_reversals) | Y | | ★ Set when this CR is a reversal child (FR-020) |
| `effective_date` | DATE | Y | | Forward (UPDATE) or original (CORRECTION) |
| `reason` | VARCHAR(1000) | Y | | Requester rationale |
| `workflow_instance_id` | UUID (FK→workflow_instances) | Y | | Bound on submit |
| `template_id` | UUID (FK→change_request_templates) | Y | | If from template |
| `bulk_batch_id` | UUID (FK→bulk_correction_batches) | Y | | If part of a bulk job |
| `step_up_event_id` | UUID (FK→cr_step_up_events) | Y | | ★ Step-up proof for sensitive self-service (FR-023) |
| `sla_due_at` | TIMESTAMP | Y | | Current node SLA deadline |
| `submitted_at` | TIMESTAMP | Y | | |
| `decided_at` | TIMESTAMP | Y | | Final decision time |
| `committed_at` | TIMESTAMP | Y | | Applied to M01 |
| `created_at` / `updated_at` | TIMESTAMP | N | now | UTC |
| `created_by` / `updated_by` | UUID | N | | |
| `is_deleted` | BOOLEAN | N | false | Soft delete |

#### E2 — `change_request_items`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_item_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK→change_requests) | N | | |
| `field_key` | VARCHAR(80) | N | | Catalog key (FK→field_sensitivity_catalog.field_key) |
| `m01_field_key` | VARCHAR(120) | N | | ★ Canonical M01 path, e.g. `employees.first_name`, `employee_bank_accounts.account_number` (§5.8) |
| `parent_item_id` | UUID (FK self) | Y | | ★ For composite fields (name → first/middle/last sub-items) |
| `old_value` | TEXT (encrypted) | Y | | Snapshot of master value at submit |
| `new_value` | TEXT (encrypted) | Y | | ★ NULLABLE now — null permitted only with `clear_intent=true` (R19) |
| `clear_intent` | BOOLEAN | N | false | ★ Explicit "clear/remove this field" intent (R19) |
| `old_value_hash` | CHAR(64) | Y | | SHA-256 for stale-detection |
| `vault_token_ref` | VARCHAR(120) | Y | | ★ Data-vault token for Aadhaar/PAN; raw never stored (R18) |
| `value_datatype` | ENUM | N | | `STRING`,`DATE`,`NUMBER`,`ENUM`,`BOOLEAN`,`JSON` |
| `sensitivity` | ENUM | N | from catalog | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `requires_document` | BOOLEAN | N | from catalog | |
| `requires_authority_portal_verification` | BOOLEAN | N | from catalog | ★ Caste/Aadhaar/PAN portal check (FR-003/008) |
| `item_status` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`COMMITTED`,`FAILED`,`REVERSED` ★ |
| `commit_idempotency_key` | VARCHAR(80) UNIQUE | Y | | = item_id; single commit |
| `sr_posting_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`POSTED`,`FAILED` |
| `retro_status` | ENUM | Y | | ★ `NOT_REQUIRED`,`PENDING`,`ACKED`,`FAILED` (FR-022) |
| `created_at` / `updated_at` | TIMESTAMP | N | now | |
| `is_deleted` | BOOLEAN | N | false | |

*Integrity:* `new_value IS NOT NULL OR clear_intent = true` (CHECK) — replaces v1's `NOT NULL` to permit legitimate field clearing (R19).

#### E3 — `change_request_documents`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `cr_document_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `change_request_item_id` | UUID (FK) | Y | | Null = whole request |
| `document_id` | UUID (FK→documents) | N | | M13 reference |
| `doc_type` | VARCHAR(60) | N | | `PASSPORT`,`GAZETTE_NOTIFICATION`,`BANK_PROOF`,`CASTE_CERTIFICATE`,`COURT_ORDER`,`MEDICAL_GENDER_CERT`… |
| `verification_status` | ENUM | N | `UNVERIFIED` | `UNVERIFIED`,`VERIFIED`,`REJECTED` |
| `authority_portal_ref` | VARCHAR(200) | Y | | ★ External portal verification reference (caste/UIDAI/PAN) |
| `authority_verification_status` | ENUM | Y | | ★ `NOT_REQUIRED`,`PENDING`,`VERIFIED`,`FAILED` |
| `verified_by` | UUID (FK→users) | Y | | |
| `verified_at` | TIMESTAMP | Y | | |
| `scan_status` | ENUM | N | `PENDING` | `PENDING`,`CLEAN`,`INFECTED` |
| `created_at` | TIMESTAMP | N | now | |

#### E4 — `change_request_approvals`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `approval_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `workflow_task_id` | UUID (FK→workflow_tasks) | N | | Shared engine task |
| `level_no` | SMALLINT | N | | 1..n sequence |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` (§15 defines each) |
| `topology` | ENUM | N | `SEQUENTIAL` | `SEQUENTIAL`,`PARALLEL` |
| `required_role` | VARCHAR(60) | N | | Role key from matrix |
| `assigned_to` | UUID (FK→users) | Y | | Resolved assignee (or delegate) |
| `delegated_from` | UUID (FK→users) | Y | | If acted via delegation |
| `decision` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`RETURNED`,`SKIPPED` |
| `decision_comment` | VARCHAR(1000) | Y | | Mandatory on REJECT/RETURN |
| `esignature_id` | UUID (FK→esignatures) | Y | | Required for HIGH-financial/STATUTORY |
| `acted_at` | TIMESTAMP | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E5 — `field_sensitivity_catalog`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `field_key` | VARCHAR(80) (PK) | N | | M02 catalog key |
| `m01_field_key` | VARCHAR(120) | N | | ★ Canonical M01 path it maps to (§5.8) |
| `is_composite` | BOOLEAN | N | false | ★ True for `name` (expands to sub-items) |
| `display_label` | VARCHAR(120) | N | | |
| `field_group` | VARCHAR(60) | N | | ★ Taxonomy ONLY: `DEMOGRAPHIC`,`CONTACT`,`FINANCIAL`,`IDENTITY`,`QUALIFICATION` (STATUTORY removed from groups — it is a *sensitivity*, not a group; Imp 21) |
| `sensitivity` | ENUM | N | | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `is_auth_bearing` | BOOLEAN | N | false | ★ True for phone/email (MFA/OTP channel); forces ≥MEDIUM + notice, bars auto-apply (R1) |
| `notify_old_value` | BOOLEAN | N | false | ★ Notify the OLD contact value on change (anti-takeover, R1) |
| `requires_document` | BOOLEAN | N | false | |
| `required_doc_types` | JSONB | Y | | Allowed evidence doc types |
| `requires_authority_portal_verification` | BOOLEAN | N | false | ★ Caste/Aadhaar/PAN portal check (R5/R12) |
| `requires_esignature` | BOOLEAN | N | false | |
| `allowed_esign_methods` | JSONB | Y | | ★ Method policy per field/tier (R1/Imp 5) |
| `tokenize_in_vault` | BOOLEAN | N | false | ★ Aadhaar/PAN → vault token, not raw (R18) |
| `self_service_editable` | BOOLEAN | N | true | ★ FALSE for `national_id`/`pan` (R5) |
| `hard_block_rule_ref` | VARCHAR(80) | Y | | ★ Named statutory hard-block rule (e.g. `DOB_PRE_RETIREMENT_BAR`, R11) |
| `evidence_path` | VARCHAR(60) | Y | | ★ `GAZETTE`,`AUTHORITY_PORTAL`,`COURT_ORDER`,`MEDICAL_DIGNITY` (gender, R12/Imp14) |
| `post_to_sr` | BOOLEAN | N | false | STATUTORY fields true |
| `sr_event_type` | VARCHAR(60) | Y | | M12 event_type |
| `retro_targets` | JSONB | Y | | ★ Downstream consumers, e.g. `["M10","M11","M06"]` (FR-022) |
| `validation_regex` | VARCHAR(300) | Y | | Field-format validation (ReDoS-guarded, FR-012) |
| `version` | INT | N | 1 | Config version |
| `effective_from` | DATE | N | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | Audit |
| `is_deleted` | BOOLEAN | N | false | |

#### E6 — `approval_matrix_config`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `matrix_id` | UUID (PK) | N | gen | |
| `name` | VARCHAR(120) | N | | e.g. "Default Govt Matrix v3" |
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
| `change_type` | ENUM | Y | | `UPDATE`/`CORRECTION`/`REVERSAL` override |
| `employment_status_scope` | VARCHAR(40) | Y | | ★ Elevated route for non-ACTIVE (FR-018) |
| `level_no` | SMALLINT | N | | Sequence |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` |
| `topology` | ENUM | N | `SEQUENTIAL` | |
| `required_role` | VARCHAR(60) | N | | Role key |
| `sla_hours` | INT | N | 48 | SLA for this node |
| `escalation_role` | VARCHAR(60) | Y | | Escalation target |
| `auto_apply_on_low` | BOOLEAN | N | false | ★ FORCED false where `is_auth_bearing=true` (R1) |
| `created_at`/`updated_at` | — | N | | |

#### E8 — `delegations`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `delegation_id` | UUID (PK) | N | gen | |
| `delegator_user_id` | UUID (FK→users) | N | | |
| `delegate_user_id` | UUID (FK→users) | N | | |
| `scope_org_unit_id` | UUID (FK→org_units) | Y | | Optional scope narrowing |
| `node_types` | JSONB | Y | | Which node types delegated |
| `delegate_holds_role_verified` | BOOLEAN | N | false | ★ Delegate independently holds required role (R21/Imp23) |
| `valid_from` / `valid_to` | TIMESTAMP | N | | |
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
| `required_doc_types` | JSONB | Y | | Evidence guidance |
| `instructions` | TEXT | Y | | Help text |
| `org_scope_id` | UUID (FK→org_units) | Y | | |
| `is_active` | BOOLEAN | N | true | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E10 — `esignatures` (hash-chained, append-only)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `esignature_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `signer_user_id` | UUID (FK→users) | N | | |
| `sign_method` | ENUM | N | | ★ `OTP`,`PKI_DSC`,`AADHAAR_ESIGN` (PASSWORD_REAUTH REMOVED — not a legal signature, R1/Imp5) |
| `signed_payload_hash` | CHAR(64) | N | | SHA-256 of signed approval payload |
| `prev_chain_hash` | CHAR(64) | Y | | ★ Hash-chain link (tamper-evidence, Imp8) |
| `chain_hash` | CHAR(64) | N | | ★ = SHA-256(prev_chain_hash ‖ signed_payload_hash ‖ signer ‖ signed_at) |
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
| `total_rows` / `valid_rows` / `invalid_rows` | INT | N | 0 | |
| `status` | ENUM | N | `UPLOADED` | `UPLOADED`,`VALIDATED`,`PENDING_APPROVAL`,`APPROVED`,`REJECTED`,`COMMITTED`,`PARTIAL_FAILED` |
| `dry_run_report_ref` | VARCHAR(200) | Y | | Validation report (M13) |
| `reason` | VARCHAR(1000) | Y | | Justification |
| `approved_by` | UUID (FK→users) | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E13 — `cr_risk_signals` (append-only) — FR-M02-019

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `risk_signal_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `signal_type` | ENUM | N | | `DUPLICATE_BANK_ACCOUNT`,`PRE_PAYROLL_CUTOFF`,`PRE_SEPARATION_WINDOW`,`DEVICE_VELOCITY`,`MULTI_EMPLOYEE_SAME_DEVICE`,`AUTH_CHANNEL_THEN_FINANCIAL`,`OFF_HOURS_BURST` |
| `severity` | ENUM | N | | `INFO`,`WARN`,`HIGH`,`BLOCK` |
| `score_contribution` | SMALLINT | N | 0 | Points added to CR `risk_score` |
| `detail` | JSONB | Y | | Evidence (e.g. matching employee_ids for mule) |
| `detected_at` | TIMESTAMP | N | now | |
| `reviewed_by` | UUID (FK→users) | Y | | Fraud reviewer |
| `review_outcome` | ENUM | Y | | `CLEARED`,`CONFIRMED_FRAUD`,`ESCALATED` |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E14 — `retro_impact_events` (append-only) — FR-M02-022

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `retro_event_id` | UUID (PK) | N | gen | |
| `change_request_item_id` | UUID (FK) | N | | |
| `target_module` | ENUM | N | | `M10`,`M11`,`M06` |
| `idempotency_key` | VARCHAR(100) UNIQUE | N | | = item_id + ':RETRO:' + target_module |
| `effective_date` | DATE | N | | Drives recomputation period |
| `payload` | JSONB | N | | field, old/new (masked), effective_date, change_type |
| `status` | ENUM | N | `PENDING` | `PENDING`,`SENT`,`ACKED`,`FAILED`,`DEAD_LETTER` |
| `ack_reference` | VARCHAR(120) | Y | | Downstream ack/recompute job id |
| `attempts` | SMALLINT | N | 0 | |
| `last_error` | VARCHAR(500) | Y | | |
| `acked_at` | TIMESTAMP | Y | | |
| `created_at` / `updated_at` | TIMESTAMP | N | now | Append-only (status updates via new attempt rows where WORM) |

#### E15 — `data_subject_notices` (append-only) — FR-M02-017

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `notice_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | N | | |
| `target_employee_id` | UUID (FK→employees) | N | | Data subject |
| `trigger_origin` | ENUM | N | | `HR_ON_BEHALF`,`BULK` |
| `channel` | ENUM | N | | `EMAIL`,`SMS`,`POSTAL`,`IN_APP` (out-of-band ≠ requester channel) |
| `sent_at` | TIMESTAMP | Y | | |
| `delivery_status` | ENUM | N | `PENDING` | `PENDING`,`DELIVERED`,`FAILED` |
| `objection_window_ends_at` | TIMESTAMP | Y | | For FINANCIAL: credit held until this passes |
| `outcome` | ENUM | N | `AWAITING` | `AWAITING`,`CONFIRMED`,`OBJECTED`,`WINDOW_ELAPSED` |
| `objection_id` | UUID (FK→cr_objections) | Y | | If objected |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E16 — `cr_objections` — FR-M02-021

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `objection_id` | UUID (PK) | N | gen | |
| `change_request_id` | UUID (FK) | Y | | Null if objecting to a committed change (triggers reversal review) |
| `raised_by` | UUID (FK→users) | N | | Data subject |
| `objection_type` | ENUM | N | | `UNAUTHORISED_CHANGE`,`INCORRECT_VALUE`,`PRIVACY`,`OTHER` |
| `description` | VARCHAR(1000) | N | | |
| `status` | ENUM | N | `OPEN` | `OPEN`,`UNDER_REVIEW`,`UPHELD`,`DISMISSED`,`RESOLVED` |
| `effect` | ENUM | N | `PAUSE` | `PAUSE` (pre-commit), `REVERSAL_REQUESTED` (post-commit) |
| `assigned_grievance_officer` | UUID (FK→users) | Y | | |
| `resolution_comment` | VARCHAR(1000) | Y | | |
| `resolved_at` | TIMESTAMP | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E17 — `cr_reversals` (append-only, dual-auth) — FR-M02-020

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `reversal_id` | UUID (PK) | N | gen | |
| `original_change_request_id` | UUID (FK) | N | | The committed CR being reversed |
| `original_item_id` | UUID (FK→change_request_items) | N | | Specific item reversed |
| `reason` | VARCHAR(1000) | N | | Mandatory justification |
| `auth1_user_id` | UUID (FK→users) | N | | First authoriser |
| `auth2_user_id` | UUID (FK→users) | N | | Second authoriser (≠ auth1, ≠ original maker) |
| `revert_to_value` | TEXT (encrypted) | Y | | The pre-change value being restored |
| `reversing_sr_event_required` | BOOLEAN | N | false | True for statutory items |
| `reversing_sr_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`POSTED`,`FAILED` |
| `m01_revert_status` | ENUM | N | `PENDING` | `PENDING`,`APPLIED`,`FAILED` |
| `idempotency_key` | VARCHAR(120) UNIQUE | N | | = item_id + ':REV:' + reversal_id |
| `executed_at` | TIMESTAMP | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E18 — `cr_audit_chain` (append-only, WORM) — Improvement 8

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `chain_id` | UUID (PK) | N | gen | |
| `seq_no` | BIGSERIAL UNIQUE | N | | Monotonic ordering |
| `audit_log_id` | UUID (FK→audit_log) | N | | The platform audit row anchored |
| `entity_type` | VARCHAR(60) | N | | e.g. `change_request`, `approval`, `commit`, `reversal` |
| `entity_id` | UUID | N | | |
| `event_digest` | CHAR(64) | N | | SHA-256 of the canonical event payload |
| `prev_chain_hash` | CHAR(64) | Y | | Previous row's `chain_hash` (null for genesis) |
| `chain_hash` | CHAR(64) | N | | SHA-256(prev_chain_hash ‖ event_digest ‖ seq_no ‖ ts) |
| `anchored_at` | TIMESTAMP | N | now | |
| `created_at` | TIMESTAMP | N | now | Append-only; UPDATE/DELETE blocked by DB grant + trigger |

#### E19 — `cr_step_up_events` (append-only) — FR-M02-023

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `step_up_event_id` | UUID (PK) | N | gen | |
| `user_id` | UUID (FK→users) | N | | The requester re-authenticated |
| `change_request_id` | UUID (FK) | Y | | Bound once the CR is created |
| `method` | ENUM | N | | `MFA_TOTP`,`MFA_PUSH`,`WEBAUTHN`,`OTP_SMS` |
| `challenge_ref` | VARCHAR(120) | N | | Platform auth challenge id |
| `result` | ENUM | N | | `SUCCESS`,`FAILED` |
| `auth_assurance_level` | VARCHAR(10) | N | | e.g. `AAL2` |
| `expires_at` | TIMESTAMP | N | | Step-up validity window (e.g. 10 min) |
| `ip_address` | VARCHAR(45) | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

### 5.3 Relationship map

```
employees (M01) 1───* change_requests *───1 users (requested_by)
change_requests 1───* change_request_items *───1 field_sensitivity_catalog (field_key→m01_field_key)
change_request_items 0/1───* change_request_items (parent_item_id; composite name)
change_requests 1───* change_request_documents *───1 documents (M13)
change_requests 1───1 workflow_instances (shared) 1───* workflow_tasks
workflow_tasks  1───1 change_request_approvals *───1 esignatures (optional, hash-chained)
change_requests 1───* cr_sla_events
change_requests 1───* cr_risk_signals            (FR-019)
change_requests 1───1 data_subject_notices 0/1───1 cr_objections   (FR-017/021)
change_requests 1───1 cr_step_up_events          (FR-023, sensitive self-service)
change_request_items 1───* retro_impact_events *───1 (M10/M11/M06)  (FR-022)
change_request_items 1───* service_register_events (M12, on STATUTORY commit / reversal)
change_requests (REVERSAL) *───1 cr_reversals 1───1 change_request_items(original) (FR-020)
approval_matrix_config 1───* approval_matrix_rules
delegations *───1 users (delegator) / users (delegate, role-verified)
* every state change ───> audit_log (shared) ───> cr_audit_chain (hash anchor, E18)
* every notify ───> notifications (shared)
```

### 5.4 Ownership / reuse matrix

| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `change_requests`/`_items`/`_documents`/`_approvals` | M02 | M14, Auditor, M06 (freeze flag) | M02 |
| `field_sensitivity_catalog`, `approval_matrix_*`, `delegations`, `templates` | M02 | M02 | System Admin via M02 |
| `esignatures`, `cr_sla_events`, `bulk_correction_batches` | M02 | Auditor, M14 | M02 |
| `cr_risk_signals`, `cr_audit_chain`, `cr_step_up_events` | M02 | Auditor, Fraud Reviewer | M02 |
| `retro_impact_events` | M02 | M10, M11, M06, Auditor | M02 (status updated on ACK) |
| `data_subject_notices`, `cr_objections` | M02 | Grievance Officer, Auditor, data subject | M02 |
| `cr_reversals` | M02 | Auditor, SR Custodian, M10/M11 | M02 (dual-auth) |
| `employees` | M01 | M02 (read + commit) | M01 (M02 invokes `:commit`) |
| `documents` | M13 | M02 | M13 (M02 references) |
| `service_register_events` | M12 | M02 (status) | M12 (M02 posts events + reversing events) |
| `workflow_instances`/`workflow_tasks` | Shared engine | M02 | Shared engine (M02 orchestrates) |
| `notifications`, `audit_log` | Platform | M02, Auditor | M02 emits |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| `request_origin` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK`, `REVERSAL` |
| `change_type` | `UPDATE`, `CORRECTION`, `REVERSAL` |
| `sensitivity` | `LOW`, `MEDIUM`, `HIGH`, `STATUTORY` |
| `field_group` (taxonomy only) | `DEMOGRAPHIC`, `CONTACT`, `FINANCIAL`, `IDENTITY`, `QUALIFICATION` *(STATUTORY removed — it is a sensitivity, not a group; Imp 21)* |
| `change_requests.status` | `DRAFT`, `SUBMITTED`, `PENDING_DOCS`, `IN_REVIEW`, `NOTICE_HOLD`, `OBJECTED`, `RETURNED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `COMMITTED`, `PARTIALLY_COMMITTED`, `COMMIT_FAILED`, `REVERSED`, `CANCELLED` |
| `item_status` | `PENDING`, `APPROVED`, `REJECTED`, `COMMITTED`, `FAILED`, `REVERSED` |
| `risk_band` | `LOW`, `MEDIUM`, `HIGH`, `BLOCKED` |
| `node_type` | `RECOMMEND`, `APPROVE`, `SANCTION`, `VERIFY` |
| `topology` | `SEQUENTIAL`, `PARALLEL` |
| `decision` | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED`, `SKIPPED` |
| `verification_status` | `UNVERIFIED`, `VERIFIED`, `REJECTED` |
| `authority_verification_status` | `NOT_REQUIRED`, `PENDING`, `VERIFIED`, `FAILED` |
| `scan_status` | `PENDING`, `CLEAN`, `INFECTED` |
| `sr_posting_status` | `NOT_REQUIRED`, `PENDING`, `POSTED`, `FAILED` |
| `retro_status` / `retro_impact_events.status` | `NOT_REQUIRED`/`PENDING`, `SENT`, `ACKED`, `FAILED`, `DEAD_LETTER` |
| `sign_method` | `OTP`, `PKI_DSC`, `AADHAAR_ESIGN` *(PASSWORD_REAUTH removed)* |
| `step_up.method` | `MFA_TOTP`, `MFA_PUSH`, `WEBAUTHN`, `OTP_SMS` |
| `sla_event_type` | `SLA_SET`, `REMINDER_SENT`, `BREACHED`, `ESCALATED`, `REASSIGNED` |
| `delegation.status` | `ACTIVE`, `REVOKED`, `EXPIRED` |
| `bulk_batch.status` | `UPLOADED`, `VALIDATED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `COMMITTED`, `PARTIAL_FAILED` |
| `risk_signal.signal_type` | `DUPLICATE_BANK_ACCOUNT`, `PRE_PAYROLL_CUTOFF`, `PRE_SEPARATION_WINDOW`, `DEVICE_VELOCITY`, `MULTI_EMPLOYEE_SAME_DEVICE`, `AUTH_CHANNEL_THEN_FINANCIAL`, `OFF_HOURS_BURST` |
| `objection.status` | `OPEN`, `UNDER_REVIEW`, `UPHELD`, `DISMISSED`, `RESOLVED` |
| `data_subject_notice.outcome` | `AWAITING`, `CONFIRMED`, `OBJECTED`, `WINDOW_ELAPSED` |
| `employment_status` (read from M01) | `ACTIVE`, `ON_LEAVE`, `SUSPENDED`, `TRANSFERRED`, `RETIRED`, `RESIGNED`, `DECEASED`, `TERMINATED` |

**Reference: default field sensitivity seed (v2 — reconciled to M01 keys, security-hardened; illustrative, configurable)**

| field_key | m01_field_key | group | sensitivity | auth-bearing | doc | authority-portal | e-sign (methods) | self-svc | post_to_sr | hard-block |
|---|---|---|---|:--:|:--:|:--:|---|:--:|:--:|---|
| `correspondence_address` | `employee_addresses(CORRESPONDENCE)` | CONTACT | LOW | No | No | No | — | Yes | No | — |
| `alternate_phone` | `employee_contacts.alt_phone` | CONTACT | **MEDIUM** ★ | **Yes** ★ | No | No | — (human approval, notify old) | Yes | No | — |
| `primary_phone` | `employee_contacts.phone` | CONTACT | **MEDIUM** ★ | **Yes** ★ | No | No | — (notify old) | Yes | No | — |
| `email` | `employee_contacts.email` | CONTACT | **MEDIUM** ★ | **Yes** ★ | No | No | — (notify old) | Yes | No | — |
| `emergency_contact` | `employee_contacts.emergency` | CONTACT | LOW | No | No | No | — | Yes | No | — |
| `permanent_address` | `employee_addresses(PERMANENT)` | CONTACT | MEDIUM | No | Yes | No | — | Yes | No | — |
| `marital_status` | `employees.marital_status` | DEMOGRAPHIC | MEDIUM | No | Yes | No | — | Yes | No | — |
| `qualification` | `employee_qualifications` | QUALIFICATION | HIGH | No | Yes | No | OTP+ | Yes | No | — |
| `bank_account_no` | `employee_bank_accounts.account_number` ★ | FINANCIAL | HIGH | No | Yes | No | **PKI_DSC / AADHAAR_ESIGN** ★ | Yes | No | — |
| `first_name` | `employees.first_name` ★ | DEMOGRAPHIC | STATUTORY | No | Yes (gazette/court) | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `middle_name` | `employees.middle_name` ★ | DEMOGRAPHIC | STATUTORY | No | Yes | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `last_name` | `employees.last_name` ★ | DEMOGRAPHIC | STATUTORY | No | Yes (gazette/court) | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `dob` | `employees.dob` | DEMOGRAPHIC | STATUTORY | No | Yes | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | **`DOB_PRE_RETIREMENT_BAR`** ★ |
| `gender` | `employees.gender` | DEMOGRAPHIC | STATUTORY | No | Yes (`evidence_path`-driven ★) | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `national_id` (Aadhaar) | `employees.national_id` / `employee_identity_documents(AADHAAR)` ★ | IDENTITY | STATUTORY | No | Yes | **Yes (UIDAI)** ★ | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** ★ | Yes | — |
| `pan` | `employees.pan` / `employee_identity_documents(PAN)` ★ | IDENTITY | STATUTORY | No | Yes | **Yes (Income-Tax)** ★ | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** ★ | Yes | — |
| `category` (social category) | `employees.category` ★ | IDENTITY | STATUTORY | No | Yes | **Yes (caste portal)** ★ | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** ★ | Yes | — (M06 freeze) |

*Key v2 seed changes:* phone/email reclassified MEDIUM + auth-bearing + notify-old (R1); `bank_account_no` e-sign restricted to strong methods (R1/Imp5); `national_id`/`pan`/`category` set HR-only with authority-portal verification (R5/R12); `name` decomposed into `first_name`/`middle_name`/`last_name` composite (R9); `dob` carries the `DOB_PRE_RETIREMENT_BAR` hard-block (R11); `gender` uses an `evidence_path` to distinguish data-error vs dignity recognition (R12/Imp14); `field_group` no longer contains `STATUTORY` (Imp 21).

### 5.6 Data integrity rules

1. **SoD constraint:** DB-level CHECK/trigger ensures `change_request_approvals.assigned_to ≠ change_requests.requested_by` and ≠ target employee's `user_id`.
2. **Stale-value guard:** at commit, `old_value_hash` must equal SHA-256 of current M01 value; mismatch → `STALE_MASTER_VALUE`/CONFLICT, request → `RETURNED`.
3. **Single-commit invariant:** `commit_idempotency_key` UNIQUE prevents double application; commit is a no-op if `item_status = COMMITTED`.
4. **Document gate:** request cannot move past `PENDING_DOCS` while any item with `requires_document = true` lacks a `VERIFIED` + `CLEAN` document; items with `requires_authority_portal_verification = true` additionally require `authority_verification_status = VERIFIED`.
5. **E-sign gate & method policy:** STATUTORY and FINANCIAL-HIGH approvals require a non-null `esignature_id` whose `sign_method ∈ allowed_esign_methods`; `OTP` is forbidden for FINANCIAL/STATUTORY (R1/Imp5); `PASSWORD_REAUTH` does not exist as a method.
6. **Effective-date rule:** for `CORRECTION`, `effective_date` ≤ original master value date and ≥ date-of-joining; for `UPDATE`, `effective_date` ≥ today (configurable grace).
7. **Sensitivity derivation:** `change_requests.highest_sensitivity` = MAX of item sensitivities; route derived from this; cannot be manually overridden. **Mixed-request principle (stated, not emergent — Advisor C):** a request is treated all-or-nothing at the highest sensitivity tier present.
8. **FK integrity:** all FKs enforced; no orphan items/documents/approvals/signals/notices/reversals.
9. **Append-only / WORM ledgers:** `change_request_approvals`, `esignatures`, `cr_sla_events`, `cr_risk_signals`, `cr_audit_chain`, `cr_step_up_events`, `cr_reversals`, `retro_impact_events`, `service_register_events` are never updated/deleted destructively; corrections append new rows. `cr_audit_chain` UPDATE/DELETE is blocked by DB grant + trigger (WORM).
10. **Pagination bound:** all list reads enforce max page size 100.
11. **Commit/SR/retro sequencing (R15 — corrected from v1 rule 11):** the canonical order is **M01 commit → item `COMMITTED` → SR `PENDING`→`POSTED/FAILED` and retro `PENDING`→`ACKED/FAILED`**. SR posting and retro acknowledgement are tracked *separately* and are **NOT** preconditions for `COMMITTED`. Statutory/downstream completeness is reported and reconciled (FR-016/011/022), never blocks the commit state. *(This removes the v1 contradiction where rule 11 demanded SR `POSTED` before `COMMITTED`.)*
12. **Employment-status gate (R3):** a request is rejected at submit (or routed to an elevated path) per the target's `employment_status_at_submit`; self-service is blocked for any non-`ACTIVE` status; bank/nominee changes on `DECEASED` route to the family-pension controlled path (FR-018).
13. **Tamper-evidence (R6):** every audit-relevant write anchors a `cr_audit_chain` row whose `chain_hash` links the prior hash; a periodic verifier recomputes the chain and alarms on break.
14. **Statutory hard-block (R11):** an item whose catalog `hard_block_rule_ref` evaluates true (e.g. DOB altered within the pre-retirement window) is blocked from the standard route with `STATUTORY_HARD_BLOCK` and is divertible only to the separate legal-process path.
15. **Identity tokenisation (R18):** items where catalog `tokenize_in_vault = true` (Aadhaar/PAN) must carry a `vault_token_ref` and must NOT persist the raw value in `new_value`/`old_value`.
16. **Auth-bearing reclassification (R1):** any catalog field with `is_auth_bearing = true` must have `sensitivity ≥ MEDIUM` and `auto_apply_on_low = false` (enforced at config save).
17. **Reversal dual-auth (R13):** a `cr_reversals` row requires `auth1_user_id ≠ auth2_user_id` and both ≠ the original committing maker (CHECK).
18. **Regex safety (R17):** admin-entered `validation_regex` is length/complexity-bounded and compiled with a safe-regex library + execution timeout (FR-012).

### 5.7 Sample data (2–3 rows per module-owned entity)

**change_requests**

| change_request_id | cr_number | target_employee_id | requested_by | request_origin | change_type | highest_sensitivity | status | employment_status_at_submit | risk_band |
|---|---|---|---|---|---|---|---|---|---|
| 7a1…e01 | CR-2026-000123 | emp-001 | usr-emp-001 | SELF_SERVICE | UPDATE | MEDIUM | COMMITTED | ACTIVE | LOW |
| 7a1…e02 | CR-2026-000124 | emp-045 | usr-emp-045 | SELF_SERVICE | CORRECTION | STATUTORY | IN_REVIEW | ACTIVE | LOW |
| 7a1…e03 | CR-2026-000125 | emp-077 | usr-hr-009 | HR_ON_BEHALF | UPDATE | HIGH | NOTICE_HOLD | ACTIVE | HIGH |

**change_request_items**

| change_request_item_id | change_request_id | field_key | m01_field_key | old_value | new_value | clear_intent | sensitivity | requires_authority_portal_verification | item_status | retro_status |
|---|---|---|---|---|---|:--:|---|:--:|---|---|
| it-001 | 7a1…e01 | alternate_phone | employee_contacts.alt_phone | +91-90000-11111 | +91-98888-22222 | false | MEDIUM | false | COMMITTED | NOT_REQUIRED |
| it-002 | 7a1…e02 | dob | employees.dob | 1990-05-21 | 1990-05-12 | false | STATUTORY | false | PENDING | PENDING |
| it-003 | 7a1…e03 | bank_account_no | employee_bank_accounts.account_number | XXXX4321 | XXXX9876 | false | HIGH | false | PENDING | PENDING |
| it-004 | 7a1…e02 | middle_name | employees.middle_name | Kumar | (null) | true | STATUTORY | false | PENDING | NOT_REQUIRED |

**change_request_documents**

| cr_document_id | change_request_id | change_request_item_id | document_id | doc_type | verification_status | authority_verification_status | scan_status |
|---|---|---|---|---|---|---|---|
| crd-01 | 7a1…e02 | it-002 | doc-9001 | GAZETTE_NOTIFICATION | VERIFIED | NOT_REQUIRED | CLEAN |
| crd-02 | 7a1…e02 | it-002 | doc-9002 | BIRTH_CERTIFICATE | VERIFIED | NOT_REQUIRED | CLEAN |
| crd-03 | 7a1…e03 | it-003 | doc-9100 | BANK_PROOF | UNVERIFIED | NOT_REQUIRED | CLEAN |

**change_request_approvals**

| approval_id | change_request_id | level_no | node_type | topology | required_role | assigned_to | decision | esignature_id |
|---|---|---|---|---|---|---|---|---|
| apr-01 | 7a1…e01 | 1 | APPROVE | SEQUENTIAL | HR_OFFICER | usr-hr-002 | APPROVED | null |
| apr-02 | 7a1…e02 | 1 | VERIFY | SEQUENTIAL | HR_OFFICER | usr-hr-002 | APPROVED | null |
| apr-03 | 7a1…e02 | 2 | SANCTION | SEQUENTIAL | DEPT_HEAD | usr-dh-001 | PENDING | null |

**field_sensitivity_catalog**

| field_key | m01_field_key | field_group | sensitivity | is_auth_bearing | requires_authority_portal_verification | self_service_editable | hard_block_rule_ref | post_to_sr |
|---|---|---|---|:--:|:--:|:--:|---|:--:|
| dob | employees.dob | DEMOGRAPHIC | STATUTORY | false | false | true | DOB_PRE_RETIREMENT_BAR | true |
| email | employee_contacts.email | CONTACT | MEDIUM | true | false | true | null | false |
| national_id | employees.national_id | IDENTITY | STATUTORY | false | true | false | null | true |

**approval_matrix_config**

| matrix_id | name | org_scope_id | status | version | effective_from |
|---|---|---|---|---|---|
| mx-001 | Default Govt Matrix | null | ACTIVE | 3 | 2026-06-01 |
| mx-002 | Secretariat Override | ou-secr | DRAFT | 1 | 2026-08-01 |

**approval_matrix_rules**

| rule_id | matrix_id | sensitivity | employment_status_scope | level_no | node_type | required_role | sla_hours | escalation_role | auto_apply_on_low |
|---|---|---|---|---|---|---|---|---|:--:|
| rl-01 | mx-001 | LOW | ACTIVE | 1 | APPROVE | HR_OFFICER | 24 | HR_ADMIN | false |
| rl-02 | mx-001 | HIGH | ACTIVE | 1 | VERIFY | HR_OFFICER | 48 | HR_ADMIN | false |
| rl-03 | mx-001 | STATUTORY | DECEASED | 2 | SANCTION | APPOINTING_AUTHORITY | 72 | APPOINTING_AUTHORITY | false |

**delegations**

| delegation_id | delegator_user_id | delegate_user_id | delegate_holds_role_verified | valid_from | valid_to | status |
|---|---|---|:--:|---|---|---|
| dl-01 | usr-dh-001 | usr-dh-002 | true | 2026-06-25 | 2026-07-05 | ACTIVE |
| dl-02 | usr-hr-002 | usr-hr-003 | true | 2026-05-01 | 2026-05-10 | EXPIRED |

**change_request_templates**

| template_id | name | change_type | field_keys | is_active |
|---|---|---|---|---|
| tpl-01 | Update Contact Details | UPDATE | ["correspondence_address","alternate_phone"] | true |
| tpl-02 | Bank Account Change | UPDATE | ["bank_account_no"] | true |

**esignatures**

| esignature_id | change_request_id | signer_user_id | sign_method | chain_hash | signed_at |
|---|---|---|---|---|---|
| es-01 | 7a1…e02 | usr-dh-001 | PKI_DSC | 9f3a…c1 | 2026-06-28T10:14:00Z |
| es-02 | 7a1…e03 | usr-hr-002 | AADHAAR_ESIGN | 2b7d…e4 | 2026-06-27T09:00:00Z |

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

**cr_risk_signals**

| risk_signal_id | change_request_id | signal_type | severity | score_contribution | review_outcome |
|---|---|---|---|---|---|
| rs-01 | 7a1…e03 | DUPLICATE_BANK_ACCOUNT | HIGH | 60 | ESCALATED |
| rs-02 | 7a1…e03 | PRE_PAYROLL_CUTOFF | WARN | 20 | null |
| rs-03 | 7a1…e01 | DEVICE_VELOCITY | INFO | 5 | CLEARED |

**retro_impact_events**

| retro_event_id | change_request_item_id | target_module | idempotency_key | effective_date | status | acked_at |
|---|---|---|---|---|---|---|
| re-01 | it-002 | M11 | it-002:RETRO:M11 | 1990-05-12 | ACKED | 2026-06-29T11:00:00Z |
| re-02 | it-002 | M06 | it-002:RETRO:M06 | 1990-05-12 | PENDING | null |

**data_subject_notices**

| notice_id | change_request_id | target_employee_id | trigger_origin | channel | objection_window_ends_at | outcome |
|---|---|---|---|---|---|---|
| dsn-01 | 7a1…e03 | emp-077 | HR_ON_BEHALF | SMS | 2026-07-02T00:00:00Z | AWAITING |
| dsn-02 | 7a1…e05 | emp-088 | BULK | EMAIL | 2026-07-03T00:00:00Z | CONFIRMED |

**cr_objections**

| objection_id | change_request_id | raised_by | objection_type | status | effect |
|---|---|---|---|---|---|
| obj-01 | 7a1…e03 | usr-emp-077 | UNAUTHORISED_CHANGE | UNDER_REVIEW | PAUSE |
| obj-02 | null | usr-emp-090 | INCORRECT_VALUE | OPEN | REVERSAL_REQUESTED |

**cr_reversals**

| reversal_id | original_change_request_id | original_item_id | auth1_user_id | auth2_user_id | reversing_sr_required | m01_revert_status |
|---|---|---|---|---|:--:|---|
| rev-01 | 7a1…e09 | it-090 | usr-hr-admin-1 | usr-dh-001 | false | APPLIED |
| rev-02 | 7a1…e11 | it-110 | usr-hr-admin-2 | usr-aa-001 | true | PENDING |

**cr_audit_chain**

| chain_id | seq_no | entity_type | entity_id | event_digest | prev_chain_hash | chain_hash |
|---|---|---|---|---|---|---|
| ac-01 | 1001 | change_request | 7a1…e02 | a1b2…ff | (genesis) | 0011…aa |
| ac-02 | 1002 | approval | apr-02 | c3d4…01 | 0011…aa | 7788…bb |
| ac-03 | 1003 | commit | it-001 | e5f6…22 | 7788…bb | 99aa…cc |

**cr_step_up_events**

| step_up_event_id | user_id | change_request_id | method | result | auth_assurance_level | expires_at |
|---|---|---|---|---|---|---|
| su-01 | usr-emp-045 | 7a1…e02 | WEBAUTHN | SUCCESS | AAL2 | 2026-06-28T10:05:00Z |
| su-02 | usr-emp-077 | null | MFA_TOTP | FAILED | AAL2 | 2026-06-28T10:20:00Z |

### 5.8 Field-Key Registry (M02 catalog → M01 master) — Improvement 10 / R9

Binds every M02 catalog `field_key` to the **actual** M01 master key (verified against the M01 BRD employee master). Build agents MUST use `m01_field_key` for commit; the legacy v1 single `name`/`category_caste`/`national_id` keys are corrected here.

| M02 catalog `field_key` | v1 (wrong) key | M01 canonical `m01_field_key` | Notes |
|---|---|---|---|
| `first_name` | part of `name` | `employees.first_name` | Composite parent `name` expands to first/middle/last sub-items |
| `middle_name` | part of `name` | `employees.middle_name` | Nullable in M01; supports `clear_intent` |
| `last_name` | part of `name` | `employees.last_name` | |
| `dob` | `dob` | `employees.dob` | M01 effective-dated; hard-block rule applies |
| `gender` | `gender` | `employees.gender` | `evidence_path` distinguishes data-error vs dignity recognition |
| `category` (social category) | `category_caste` | `employees.category` (enum SOCIAL_CATEGORY: GEN/OBC/SC/ST/EWS) | NOT `cadre`; `cadre` is a service attribute owned by M06, not editable here |
| `national_id` (Aadhaar) | `national_id` | `employees.national_id` + `employee_identity_documents(AADHAAR)` | Tokenised via vault; HR-only |
| `pan` | (absent) | `employees.pan` + `employee_identity_documents(PAN)` | Unique-checked by M01; HR-only |
| `bank_account_no` | `bank_account_no` | `employee_bank_accounts.account_number` | Effective-dated bank record |
| `correspondence_address` / `permanent_address` | same | `employee_addresses(<type>)` | M01 effective-dated address rows |
| `email` / `primary_phone` / `alternate_phone` | `alternate_phone` only | `employee_contacts.<field>` | All auth-bearing → MEDIUM + notify old |

**Note on `cadre`:** v1's `category_caste` conflated social/reservation category with service cadre. v2 maps personal-detail caste/category to `employees.category` (statutory reservation category) and explicitly excludes `cadre` (service-cadre changes are promotion/transfer events owned by M05/M06, out of M02 scope).

---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design (LLD) table. v2 enhancements are marked ★ and trace to the Amendments table (§1.8).

---

### FR-M02-001 — Create & Submit a Personal-Details Change Request

- **Module:** M02-EPDM
- **Primary Role(s):** Employee (Self-Service), HR Officer (on behalf)
- **User Story:** *As an employee, I want to request a change to my personal details with a clear before/after preview and supporting documents, so that my record is updated accurately and with proper approval.*

**Description:** Provides the guided form to create a `change_requests` header and one or more `change_request_items`. The form is scoped to fields the requester is allowed to edit (`self_service_editable` + ownership/scope + **employment-status gate, FR-018** ★). On selecting a field, the current master value is fetched (read-only "before"); the requester supplies the "new" value (or sets **`clear_intent`** ★ to empty a nullable field), reason, change type (update/correction) and effective date. **Composite `name` expands to `first_name`/`middle_name`/`last_name` sub-items** ★. On submit, the system computes `highest_sensitivity`, evaluates **fraud signals (FR-019)** ★, requires a **step-up re-auth (FR-023) for HIGH/STATUTORY self-service** ★, builds the route via the active matrix, binds a `workflow_instance`, and transitions to `SUBMITTED`/`PENDING_DOCS` (or `NOTICE_HOLD` when an out-of-band data-subject notice is pending for HR_ON_BEHALF ★).

**Acceptance Criteria:**
1. Requester can only add fields they are authorized to modify on the target record; unauthorized and `self_service_editable=false` fields (Aadhaar/PAN/category) are not selectable in self-service ★.
2. For each item, the current master value is displayed as immutable "before" and stored as `old_value` + `old_value_hash` at submit; for tokenised fields, only `vault_token_ref` + masked form are stored ★.
3. Submission is rejected with VALIDATION_ERROR if any `validation_regex` fails, effective-date rule is violated, a required document type is missing, or `new_value` is null without `clear_intent=true` ★.
4. On valid submit, exactly one `workflow_instance` is created and status becomes `SUBMITTED`/`PENDING_DOCS`; `NOTICE_HOLD` if an HR_ON_BEHALF change requires data-subject notice first ★.
5. **Employment-status gate** ★: self-service is blocked (`FORBIDDEN`) for any non-`ACTIVE` target; HR-on-behalf on non-`ACTIVE` routes to the elevated path (FR-018).
6. A `cr_number` is generated; a hash-chained audit row (E18) and requester confirmation notification are written ★.
7. **Step-up gate** ★: initiating a HIGH/STATUTORY self-service request without a valid, unexpired `cr_step_up_events.SUCCESS` is rejected with `STEP_UP_REQUIRED`.
8. Drafts can be saved without routing and resumed later.

**Business Rules:**
- BR1: A self-service requester's `target_employee_id` must equal their own employee record.
- BR2: HR-on-behalf requires the target within the requester's org scope **and triggers a data-subject notice (FR-017)** ★.
- BR3: `highest_sensitivity` is system-derived; the route is not user-editable.
- BR4: One open change per field per employee across concurrent non-terminal requests → CONFLICT.
- BR5: ★ The request snapshots `employment_status_at_submit`; status gating (FR-018) and step-up (FR-023) are evaluated before routing.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | INSERT | header, status, change_type, effective_date, employment_status_at_submit, step_up_event_id ★ |
| `change_request_items` | INSERT | field_key, m01_field_key ★, old/new value, clear_intent ★, sensitivity, vault_token_ref ★ |
| `field_sensitivity_catalog` | READ | sensitivity, regex, doc/e-sign/portal rules, self_service_editable ★ |
| `employees` (M01) | READ | current value + version/hash + employment_status ★ |
| `cr_step_up_events` | READ | valid step-up proof ★ |
| `workflow_instances` | INSERT | route binding |
| `audit_log` / `cr_audit_chain` / `notifications` | INSERT | trail + confirmation ★ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests` | Create draft |
| PATCH | `/api/v1/change-requests/{id}` | Edit draft items |
| POST | `/api/v1/change-requests/{id}/submit` | Validate + route |
| GET | `/api/v1/employees/{id}/editable-fields` | Authorized editable fields + current values (status-gated ★) |

**UI Behavior Notes:** Two-column item editor (before | after), per-field help from catalog, inline validation, reason textarea, effective-date picker constrained by change type, **explicit "Clear this field" control** ★, document attach zone, step-up prompt for sensitive fields ★, "How this will be reviewed" route panel, and a "Review & Submit" diff summary. Aadhaar/PAN/category are shown as **"HR-assisted only"** with a CTA to raise an HR request ★.

**Edge Cases:** Master value changed between draft and submit (re-snapshot + warn); duplicate open change (block); requester loses scope mid-draft (block submit); non-governed field via API (FORBIDDEN); target becomes non-ACTIVE between draft and submit (re-gate, block/elevate ★); step-up expired at submit (re-challenge ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeRequestEditor`, `ClearFieldControl` ★, `StepUpModal` ★, `ReviewSubmitModal`; client validates regex + required docs + step-up before enabling Submit. |
| Backend-Service Flow | `ChangeRequestService.createDraft()→addItems()→submit()`: status-gate (FR-018) → step-up check (FR-023) → snapshot master + hash → derive sensitivity → fraud-eval (FR-019) → `RoutingService.buildRoute()` → create `workflow_instance` → set status → data-subject notice (FR-017) if HR_ON_BEHALF. |
| Data Operations | INSERT header + items (txn); INSERT workflow instance/tasks; UPDATE status; INSERT audit + chain + notification. |
| Validation Logic | Ownership/scope, status gate, step-up, regex, effective-date, one-open-change, doc-presence, `new_value`/`clear_intent` invariant ★. |
| Authorization Logic | `canEditField(actor, target, fieldKey)` = ownership OR (HR + scope) AND `self_service_editable` AND status-permitted ★. |
| State Changes & Side Effects | `DRAFT`→`SUBMITTED`/`PENDING_DOCS`/`NOTICE_HOLD` ★; SLA timer set; confirmation + data-subject notice. |
| Failure Handling | Partial item insert rolled back; routing failure → remain DRAFT; master-read timeout → `UPSTREAM_UNAVAILABLE`. |
| Dependencies & Reuse | M01 read; workflow engine; FR-002/003/017/018/019/023. |
| Test Guidance | LOW vs STATUTORY submit; clear-intent; composite name; status-gate block; step-up enforce; HR_ON_BEHALF notice; duplicate-open; unauthorized field. |

---

### FR-M02-002 — Field Sensitivity Classification & Approval Routing Engine

- **Module:** M02-EPDM
- **Primary Role(s):** System (engine); configured by System Admin (FR-012)
- **User Story:** *As the HR governance owner, I want each request routed automatically based on the sensitivity of the fields it touches, so that sensitive changes get the right level of scrutiny without manual routing.*

**Description:** Deterministic engine that, given a request's items and the active `approval_matrix_config` for the target's org scope **and `employment_status` scope** ★, produces an ordered (sequential/parallel) set of approval nodes persisted as `change_request_approvals` bound to `workflow_tasks`. It resolves highest sensitivity, applies field/group/change-type/status overrides, attaches SLAs and escalation roles, and marks LOW items as auto-apply **only where the field is not `is_auth_bearing`** ★.

**Acceptance Criteria:**
1. Given items {LOW, HIGH}, the route reflects HIGH (highest wins).
2. Active matrix selected by org-scope precedence (most specific first, else global); **`employment_status` scope overrides apply for non-ACTIVE targets** ★.
3. Sequential nodes execute in `level_no` order; parallel nodes at a level are all-required unless configured any-one (any-one is **P3** ★).
4. Each node persists `required_role`, `sla_hours`, `escalation_role`.
5. LOW items with `auto_apply_on_low=true`, no documents, **and `is_auth_bearing=false`** ★ skip approval and commit straight away, still writing audit; **auth-bearing contact fields never auto-apply** ★.
6. The engine is idempotent for a given request version.
7. ★ When `highest_sensitivity` is HIGH+ and `risk_band=HIGH/BLOCKED` (FR-019), the route prepends a mandatory fraud-review node.

**Business Rules:**
- BR1: Field-key override > field-group override > sensitivity default.
- BR2: STATUTORY always includes a SANCTION node + strong e-signature.
- BR3: A request mixing CORRECTION + statutory field always routes to senior sanction regardless of LOW co-items (mixed-request principle, §5.6 rule 7).
- BR4: ★ DECEASED/RETIRED-status routes always include the elevated authority node (FR-018).
- BR5: ★ Auth-bearing contact-field changes require at least one human APPROVE node and a notify-old-value side-effect (FR-017); `auto_apply_on_low` is force-disabled at config for these fields (§5.6 rule 16).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `approval_matrix_config`/`_rules` | READ | route definition incl. employment_status_scope ★ |
| `field_sensitivity_catalog` | READ | per-field sensitivity, is_auth_bearing ★ |
| `change_request_approvals` | INSERT | resolved nodes |
| `workflow_tasks` | INSERT | engine tasks |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/route-preview` | Preview computed route (no persist) |
| (internal) | `RoutingService.buildRoute()` | Persisted on submit |

**UI Behavior Notes:** A "How this will be reviewed" panel shows the computed approver chain (roles, order, SLA), plus a fraud-review badge when risk is high ★ and an elevated-path badge for non-ACTIVE targets ★.

**Edge Cases:** No active matrix for scope (fallback to global; if none → INTERNAL_ERROR + config alert); circular/duplicate levels (rejected at config save); delegated approver unavailable (resolve to escalation); auth-bearing field with mistakenly-enabled auto-apply (config rejects ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RoutePreviewPanel` renders node chain, fraud/elevated badges ★. |
| Backend-Service Flow | `RoutingService.buildRoute(request)`: load active matrix (scope + status precedence ★) → collect rules with override precedence → inject fraud-review node if high risk ★ → dedupe + order → create approval + task rows. |
| Data Operations | READ matrix/rules/catalog; INSERT approvals + tasks; UPDATE highest_sensitivity, sla_due_at. |
| Validation Logic | ≥1 node for non-auto-apply; role keys exist; no duplicate level conflicts; auth-bearing auto-apply forbidden ★. |
| Authorization Logic | Engine internal; route-preview limited to requester/reviewers. |
| State Changes & Side Effects | Creates pending tasks; sets first SLA; emits SLA_SET. |
| Failure Handling | Missing matrix → fallback + alert; invalid rule → INTERNAL_ERROR + admin notify, request stays SUBMITTED unrouted. |
| Dependencies & Reuse | Workflow engine; FR-012 config; FR-018/019; consumed by FR-001/004. |
| Test Guidance | Highest-wins; scope + status precedence; parallel all-required; auto-apply LOW non-auth-bearing only ★; fraud-node injection; override precedence. |

---

### FR-M02-003 — Supporting-Document & Authority-Portal Verification

- **Module:** M02-EPDM
- **Primary Role(s):** Employee/HR (upload); HR Officer (verify); HR/authority (authority-portal verification)
- **User Story:** *As a reviewer, I want every sensitive change backed by verified documentary proof — and, for caste/identity, by an authority-portal check — so that I can approve confidently and defensibly.*

**Description:** Lets requesters attach documents (stored in M13) to a request/item, records `doc_type`, mirrors M13 antivirus scan status, and lets reviewers mark each document `VERIFIED`/`REJECTED`. ★ For items where `requires_authority_portal_verification=true` (Aadhaar/PAN/category), the reviewer must additionally complete an **authority-portal verification** (UIDAI/Income-Tax/caste portal) recording `authority_portal_ref` + `authority_verification_status`. A request with any item requiring a document/portal check cannot advance past `PENDING_DOCS`/`VERIFY` until all are `VERIFIED`+`CLEAN` (and portal `VERIFIED`).

**Acceptance Criteria:**
1. Upload returns a `document_id` from M13 and creates a `change_request_documents` link with `scan_status=PENDING`.
2. Infected files (`scan_status=INFECTED`) are blocked, flagged, excluded from verification.
3. Reviewer can set `VERIFIED`/`REJECTED` with a reason; both write hash-chained audit ★.
4. The document gate (integrity rule 4) and **authority-portal gate** ★ are enforced at approval time.
5. Allowed `doc_type`s are constrained to the field's `required_doc_types`.
6. ★ Caste/category verification requires a successful authority-portal result plus a structured evidence-to-value attestation by the verifier; failure routes the request to RETURNED.

**Business Rules:**
- BR1: Only HR/authority roles may verify; requesters cannot self-verify.
- BR2: A rejected document returns the request to the requester (`RETURNED`) with reason.
- BR3: Documents are referenced, never copied — M13 is the store of record.
- BR4: ★ Aadhaar/PAN changes are HR-only (self-service blocked) and require authority-portal re-verification (R5).
- BR5: ★ A successful caste/category verification additionally raises a promotion-eligibility freeze flag to M06 (FR-008/§8.6) until verification is finalised.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_documents` | INSERT/UPDATE | doc_type, verification_status, authority_portal_ref ★, authority_verification_status ★, scan_status |
| `documents` (M13) | READ | scan status, metadata |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/documents` | Link uploaded doc |
| PATCH | `/api/v1/change-requests/{id}/documents/{docId}/verify` | Verify/reject |
| POST | `/api/v1/change-requests/{id}/documents/{docId}/authority-verify` | ★ Trigger/record authority-portal verification |
| GET | `/api/v1/change-requests/{id}/documents` | List with status |

**UI Behavior Notes:** Drag-and-drop upload with doc-type selector restricted by field; status chips (Pending scan / Clean / Infected / Verified / Rejected / **Portal-Verified** ★); reviewer side-panel to preview document next to the diff; **authority-portal verification panel** ★ with attestation checkbox.

**Edge Cases:** M13 upload timeout (retry → UPSTREAM_UNAVAILABLE); scan stuck PENDING (verify blocked; SLA paused); document deleted in M13 (link broken, blocks approval); authority portal down (verification PENDING; SLA paused; manual fallback attestation recorded ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DocumentUploader`, `DocumentVerifyPanel`, `AuthorityPortalVerifyPanel` ★. |
| Backend-Service Flow | `DocumentService.link()` → M13 upload ref + scan poll; `verify()` updates status + audit; `authorityVerify()` calls provider, records ref/status ★; gate checked by approval service. |
| Data Operations | INSERT/UPDATE change_request_documents; READ M13; call authority provider; INSERT audit + chain. |
| Validation Logic | doc_type ∈ required_doc_types; scan CLEAN to verify; verifier role; non-self-verify; portal result for portal-required items ★. |
| Authorization Logic | Upload: requester/HR; Verify/authority-verify: HR/authority within scope. |
| State Changes & Side Effects | All required docs+portal VERIFIED unblocks gate; caste verify raises M06 freeze ★; rejection → RETURNED. |
| Failure Handling | Upload/scan/portal upstream failures retried; broken reference blocks approval. |
| Dependencies & Reuse | M13 APIs; authority providers; gate consumed by FR-004; rejection shares FR-006; freeze to M06. |
| Test Guidance | Infected block; reject→return; wrong doc_type; portal verify pass/fail; caste freeze raised; M13/portal timeout. |

---

### FR-M02-004 — Maker-Checker Multi-Level Approval (Sequential & Parallel)

- **Module:** M02-EPDM
- **Primary Role(s):** Reporting Manager, HR Officer, HR Admin, Dept Head / Appointing Authority
- **User Story:** *As an approver, I want a clear task queue of requests awaiting my decision with the full diff and evidence, so that I can approve, reject, or return them with proper segregation of duties.*

**Description:** Drives requests through routed approval nodes. Approvers act on `workflow_tasks`; M02 records the decision in `change_request_approvals`. Supports recommend→approve→sanction chains, sequential progression, parallel "all required"/"any-one" nodes, and enforces SoD **including delegate role-independence** ★. A request reaches `APPROVED` only when all required nodes approve; any rejection → `REJECTED`; a "return" → `RETURNED`. ★ A high-risk request (FR-019) must clear the fraud-review node before substantive approval.

**Acceptance Criteria:**
1. An approver sees only tasks assigned to their role/scope (or validly delegated) in their queue.
2. Approve advances to the next level or completes the route; the maker/target can never approve (SoD).
3. Reject requires a comment and terminates the request (`REJECTED`).
4. Return requires a comment and sends the request to `RETURNED`.
5. Parallel "all required" completes only when every node approves; "any-one" completes on first approval and auto-`SKIPPED`s the rest (any-one is P3 ★).
6. STATUTORY and FINANCIAL-HIGH nodes require a valid strong e-signature (FR-015) whose method ∈ policy ★ before the decision is accepted.
7. ★ A delegate acting on a node must independently hold the node's `required_role` (`delegate_holds_role_verified=true`), else `FORBIDDEN`/`SOD_VIOLATION`.

**Business Rules:**
- BR1: `assigned_to ≠ requested_by` and `≠ target user` at every node (SoD).
- BR2: Comments mandatory on REJECT and RETURN.
- BR3: A node may be acted on by the assignee or a role-qualified active delegate; both recorded.
- BR4: Decisions are append-only; a terminal node cannot be re-decided.
- BR5: ★ Every decision anchors a `cr_audit_chain` row (tamper-evidence).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_approvals` | INSERT/UPDATE | decision, comment, esignature_id, delegated_from |
| `workflow_tasks` | UPDATE | task completion |
| `change_requests` | UPDATE | status transitions |
| `esignatures` | READ | strong-method gate ★ |
| `cr_audit_chain` | INSERT | tamper-evident anchor ★ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/approvals/queue` | My pending tasks |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/decide` | Approve/Reject/Return |
| GET | `/api/v1/change-requests/{id}` | Full request + diff for review |

**UI Behavior Notes:** Approver workspace: left = task queue with SLA countdown + sensitivity + **risk badge** ★; right = diff, evidence preview, prior decisions trail, **fraud-signal panel** ★; sticky action bar (Approve / Return / Reject) with mandatory comment on negative actions and strong-e-sign prompt for sensitive nodes.

**Edge Cases:** Concurrent decisions on a parallel node (idempotent, first wins); approver loses role mid-flow (reassign via escalation); delegate and delegator both act (first persisted, second rejected); items changed after partial approvals (re-route, prior approvals invalidated with audit); delegate lacks role (blocked ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ApprovalQueue`, `ApprovalDetail` (diff + evidence + history + risk), `DecisionBar`. |
| Backend-Service Flow | `ApprovalService.decide()`: SoD + delegate-role check ★ → fraud-node-clearance check ★ → e-sign strong-method check (sensitive) → persist approval + chain → complete task → recompute route → set status. |
| Data Operations | INSERT/UPDATE approvals; UPDATE tasks + status; INSERT audit + chain + notification. |
| Validation Logic | SoD, delegate role-independence ★, mandatory comments, e-sign presence/method/hash, node-not-terminal, delegate window. |
| Authorization Logic | Assignee or role-qualified active delegate; reject self/target. |
| State Changes & Side Effects | Advances levels; full approval → `APPROVED` (triggers FR-010); reject → `REJECTED`; return → `RETURNED`. |
| Failure Handling | Concurrency via optimistic lock → CONFLICT for late actor; engine error keeps node PENDING. |
| Dependencies & Reuse | Routing (002), e-sign (015), delegation (013), commit (010), fraud (019). |
| Test Guidance | SoD block; delegate role-independence ★; sequential/parallel; strong-e-sign enforcement; fraud-node gating; concurrent decide. |

---

### FR-M02-005 — Field-Level Change Diff, Preview & Reviewer Comparison

- **Module:** M02-EPDM
- **Primary Role(s):** All (requester preview; reviewer comparison; auditor read)
- **User Story:** *As a reviewer, I want to see exactly what is changing — old vs new, per field — so that I can judge the change accurately.*

**Description:** Computes and renders a structured before/after diff for every item, masking sensitive values per role (bank account/Aadhaar/PAN masked except to authorized verifiers), highlighting changes, and surfacing reason, change type, effective date, **clear-intent** ★ and evidence. The diff is the canonical representation used in approval, audit and history.

**Acceptance Criteria:**
1. Each item shows `old_value` (read-only snapshot) and `new_value` with change highlighting; a cleared field renders "→ (cleared)" ★.
2. HIGH/STATUTORY/IDENTITY values masked for roles lacking `view_sensitive_value`; full value visible to authorized verifiers; Aadhaar shown only as last-4 (vault-backed) ★.
3. The diff is immutable after submission and recomputed only on return+edit.
4. Auditor can view the historical diff for any committed/decided request.

**Business Rules:**
- BR1: Masking format consistent (`XXXX1234` last-4) and never logs the unmasked value.
- BR2: Date/number/enum fields render typed (e.g., `21-May-1990 → 12-May-1990`).
- BR3: ★ Reveal of an unmasked sensitive value is itself a hash-chained audit event.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | READ | old/new value, datatype, sensitivity, clear_intent ★ |
| `field_sensitivity_catalog` | READ | masking/datatype/tokenisation rules ★ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/diff` | Role-aware diff payload |

**UI Behavior Notes:** Diff cards per field with color-coded old (strike, muted) vs new (accent); typed formatting; cleared-field indicator ★; mask toggle for authorized roles with audit on reveal; effective-date and change-type chips.

**Edge Cases:** Multi-line/JSON fields (structured diff); identical old==new with no clear-intent (blocked at submit as no-op); unauthorized reveal attempt (FORBIDDEN, audited); tokenised field reveal (vault detokenise, audited ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DiffCard`, `MaskToggle`, cleared-field badge ★. |
| Backend-Service Flow | `DiffService.render(request, actor)`: load items, apply role masking, detokenise via vault only for authorized reveal ★, format by datatype. |
| Data Operations | READ items + catalog; INSERT audit + chain on sensitive reveal ★. |
| Validation Logic | old≠new or clear_intent at submit; datatype-aware formatting. |
| Authorization Logic | `view_sensitive_value` gates unmasking; vault detokenise scoped. |
| State Changes & Side Effects | Read-only except audit on reveal. |
| Failure Handling | Decrypt/detokenise failure → masked fallback + error flag. |
| Dependencies & Reuse | Consumed by FR-001/004/016. |
| Test Guidance | Masking by role; typed diff; cleared-field; reveal audit; no-op block; vault detokenise. |

---

### FR-M02-006 — Rejection, Return-for-Correction, Resubmission & Withdrawal

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers (reject/return); Requester (resubmit/withdraw)
- **User Story:** *As a requester, when my request is sent back, I want to see why and fix it without re-keying everything, so that I can resubmit quickly.*

**Description:** Manages negative/terminal paths. **Reject** terminates with a mandatory reason. **Return-for-correction** sends it to editable `RETURNED` preserving items/documents/decision-trail; resubmission re-runs validation/routing (resetting subsequent approvals). **Withdraw** cancels a non-terminal request the requester owns. ★ A data-subject objection (FR-021) can also drive a request to `OBJECTED`/paused.

**Acceptance Criteria:**
1. Reject and Return require a comment captured in `change_request_approvals.decision_comment` and audit.
2. A `RETURNED` request is editable; prior approvals preserved as history but route restarts on resubmit.
3. Resubmission re-validates regex, doc/portal gate, effective date, **status gate, step-up** ★, and re-derives the route.
4. Requester can withdraw any request in `DRAFT`/`SUBMITTED`/`PENDING_DOCS`/`RETURNED`/`IN_REVIEW`/`NOTICE_HOLD` (→ `WITHDRAWN`), not after `APPROVED`.
5. All transitions notify relevant parties (incl. data subject for HR-initiated ★).

**Business Rules:**
- BR1: Once `APPROVED`/`COMMITTED`, only a new corrective request or a **reversal (FR-020)** ★ can alter the field.
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

**Edge Cases:** Resubmit after sensitivity changed by config (new route); withdraw race with in-flight approval (CONFLICT, latest wins); return after parallel partial approval (all parallel nodes reset); resubmit when target now non-ACTIVE (re-gate ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ReturnedRequestBanner`, `ResubmitButton`, `WithdrawDialog`. |
| Backend-Service Flow | `LifecycleService.return()/reject()/withdraw()/resubmit()`: validate transition, cancel/reset tasks, re-gate + re-route on resubmit ★. |
| Data Operations | UPDATE status/revision; INSERT approval rows; UPDATE/cancel tasks; audit + chain + notify. |
| Validation Logic | Transition legality (§10); mandatory comment; ownership; re-gate on resubmit ★. |
| Authorization Logic | Reject/return: current-node approver; withdraw/resubmit: requester. |
| State Changes & Side Effects | `RETURNED`→`SUBMITTED`; `*`→`WITHDRAWN`; `*`→`REJECTED`. |
| Failure Handling | Illegal transition → CONFLICT; task-cancel failure rolled back. |
| Dependencies & Reuse | Routing (002), approvals (004), SLA (007), notifications (011), objection (021). |
| Test Guidance | Reject terminal; return→edit→resubmit re-route; withdraw cancels tasks; post-approve edit blocked; re-gate on resubmit. |

---

### FR-M02-007 — SLA Tracking, Reminders & Escalation

- **Module:** M02-EPDM
- **Primary Role(s):** System; escalation targets (HR Admin, Appointing Authority)
- **User Story:** *As an HR governance owner, I want pending approvals tracked against SLAs and auto-escalated when overdue, so that requests never silently stall.*

**Description:** Computes a per-node SLA deadline from `approval_matrix_rules.sla_hours` (business-calendar aware; **descopes to calendar-days for P1 if the calendar service is unavailable** ★, per Build-Gate Register), sends reminders before breach, marks breaches, and escalates overdue tasks to `escalation_role` (optionally auto-reassign). Milestones recorded in `cr_sla_events`. Timers pause when `RETURNED`, awaiting document/portal scan, or **`NOTICE_HOLD`/objection pause** ★.

**Acceptance Criteria:**
1. On entering a node, `sla_due_at` is set using a business-calendar (excludes holidays/weekends per config).
2. A reminder fires at configurable thresholds (default 50%/90%).
3. On breach, a `BREACHED` event is recorded and escalation notification sent.
4. If auto-reassign is enabled, task `assigned_to` updates to an escalation-role holder and `REASSIGNED` recorded.
5. SLA pauses in `RETURNED`/`PENDING_DOCS(scan/portal pending)`/`NOTICE_HOLD`/objection ★ and resumes correctly.

**Business Rules:**
- BR1: SLA is per node; request `sla_due_at` reflects the current active node.
- BR2: Escalation does not skip required approvals; it changes who acts, not the route.
- BR3: Breach does not auto-approve — manual decision always required.

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

**Edge Cases:** No escalation-role holders (notify HR Admin fallback); clock skew (server-authoritative time); withdrawn mid-SLA (timers stopped); DST/holiday-calendar changes (recompute remaining only); calendar service down in P1 (calendar-day fallback ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SlaBadge`, `OverdueFilter`, `EscalationBanner`. |
| Backend-Service Flow | `SlaScheduler` periodic; `SlaService.onNodeEnter()/onBreach()/escalate()`; pause/resume on hold states ★. |
| Data Operations | INSERT cr_sla_events; UPDATE sla_due_at + assignment; notify. |
| Validation Logic | Business-calendar (or calendar-day fallback ★); threshold checks; pause/resume. |
| Authorization Logic | Scheduler internal; SLA view limited to participants + HR/Auditor. |
| State Changes & Side Effects | Reassignment, escalation notifications; no auto-advance. |
| Failure Handling | Scheduler retry with idempotent event keys. |
| Dependencies & Reuse | Matrix SLAs (002/012), notifications (011), workflow engine, calendar service. |
| Test Guidance | Reminder thresholds; breach→escalate; auto-reassign; pause/resume incl. NOTICE_HOLD ★; calendar fallback. |

---

### FR-M02-008 — Correction vs. Update, Effective-Dating, DOB Hard-Block, Caste & Dignity-Aware Gender

- **Module:** M02-EPDM
- **Primary Role(s):** Requester, Approvers
- **User Story:** *As HR, I need to distinguish fixing an error from recording a genuine change — and to enforce public-sector statutory rules for DOB, caste and gender — so that downstream history, seniority and pension stay correct and lawful.*

**Description:** Enforces the semantic distinction: a **CORRECTION** repairs an erroneous historical value (effective from the original date, raising tracked retro impact via FR-022); an **UPDATE** records a forward change. ★ DOB alteration within a configurable pre-retirement/service window is a **hard-block** (`STATUTORY_HARD_BLOCK`) divertible only to a separate legal-process path. ★ Caste/category corrections require authority-portal verification (FR-003) and raise an M06 promotion-eligibility freeze. ★ Gender changes follow an `evidence_path` that distinguishes a *data-error correction* (gazette/record proof) from *gender-identity recognition* (dignity-aware, NALSA / Transgender Persons Act 2019 — non-gazette medical/self-declaration path, privacy-protected).

**Acceptance Criteria:**
1. Requester must choose CORRECTION or UPDATE; the effective-date picker is constrained accordingly (correction ≤ original date and ≥ DOJ; update ≥ today−grace).
2. A CORRECTION on a STATUTORY field forces evidence + strong e-sign + senior sanction route.
3. Corrections set a tracked retro event (FR-022) for fields affecting pay/seniority/pension.
4. The effective date is stored on commit and included in the M01 change and any SR event.
5. ★ **DOB hard-block:** if `hard_block_rule_ref=DOB_PRE_RETIREMENT_BAR` evaluates true (e.g., within N months of superannuation or after a configurable service window), the standard route is blocked; only the separate legal-process path (special elevated authority) may proceed.
6. ★ **Caste/category:** changes require authority-portal verification (FR-003 BR5) and automatically raise a promotion-eligibility freeze flag to M06 pending finalisation.
7. ★ **Gender:** the request selects an `evidence_path`; the identity-recognition path uses dignity-aware, privacy-protected evidence (no gazette requirement) and restricts who can view the rationale.

**Business Rules:**
- BR1: CORRECTION cannot have a future effective date; UPDATE cannot back-date beyond grace.
- BR2: ★ DOB alteration is **hard-blocked** (not merely flagged) when the statutory rule triggers; overriding requires the documented separate legal process.
- BR3: Effective-dating never alters audit timestamps (recorded vs effective).
- BR4: ★ Caste/category freeze on M06 persists until verification is `VERIFIED` and sanction completes.
- BR5: ★ Gender identity-recognition evidence is SENSITIVE; access is masked and audited; it is never published to gazette by default.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | READ/UPDATE | change_type, effective_date |
| `change_request_items` | READ | sensitivity, hard_block, evidence_path ★ |
| `field_sensitivity_catalog` | READ | hard_block_rule_ref, evidence_path ★ |
| `retro_impact_events` (FR-022) | INSERT | effective_date, retro payload ★ |
| `service_register_events` (M12) | INSERT | effective_date (via FR-011) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/effective-date-rules?fieldKey=&changeType=` | Allowed date range |
| GET | `/api/v1/change-requests/hard-block-check?fieldKey=dob&employeeId=` | ★ DOB hard-block evaluation |

**UI Behavior Notes:** A clear toggle "Correct an error" vs "Record a change" with contextual help; retro-impact warning banner; bounded date picker; ★ a DOB hard-block notice with the legal-process explainer; ★ a dignity-aware gender path selector with privacy notice.

**Edge Cases:** Correction predating DOJ (block); update on a non-working day (allowed); reclassification correction→update after return (re-route); DOB within bar window (hard-block ★); caste portal pending (freeze stays ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeTypeToggle`, bounded `EffectiveDatePicker`, `RetroImpactBanner`, `DobHardBlockNotice` ★, `GenderPathSelector` ★. |
| Backend-Service Flow | `EffectiveDatingService.validate()` + `flagRetroImpact()` (→FR-022); `HardBlockService.evaluate(dob)` ★; caste freeze emit (→M06) ★. |
| Data Operations | UPDATE change_type/effective_date; READ catalog; INSERT retro events; emit freeze. |
| Validation Logic | Date-range by change_type; ≥DOJ; DOB hard-block rule ★; gender evidence_path selection ★. |
| Authorization Logic | Same as authoring; reclassification only while editable; legal-process path = special authority ★. |
| State Changes & Side Effects | Determines route (002); sets retro events (022); DOB block; caste freeze. |
| Failure Handling | Out-of-range date → VALIDATION_ERROR; hard-block → `STATUTORY_HARD_BLOCK`. |
| Dependencies & Reuse | Routing (002), commit (010), SR (011), retro (022), FR-003, M06. |
| Test Guidance | Correction bounds; DOB hard-block trigger + legal path; caste freeze; dignity gender path privacy; retro propagation. |

---

### FR-M02-009 — Bulk HR-Initiated Corrections

- **Module:** M02-EPDM
- **Primary Role(s):** HR Officer / HR Admin (initiate); HR Admin / Appointing Authority (approve)
- **User Story:** *As an HR admin doing a mass data cleanup, I want to upload many corrections at once with validation and a single approval, so that I can fix records efficiently without bypassing governance.*

**Description:** Controlled batch path: HR uploads a CSV/XLSX of (service_no, field_key, new_value, reason, doc_ref), the system performs a **dry-run validation** (existence, scope, regex, sensitivity, **employment-status gate** ★, one-open-change conflicts, stale checks, **identity/Aadhaar HR-only & portal rules** ★), produces a report of valid/invalid rows, generates child `change_requests` under a `bulk_correction_batches` header, **triggers a data-subject notice per affected employee (FR-017)** ★, and routes for **aggregate approval**. Approval commits valid rows individually & idempotently; per-row failures isolated (`PARTIAL_FAILED`). *(Re-phased to P3 — §13.3.)*

**Acceptance Criteria:**
1. Upload parses and reports `total/valid/invalid` with row-level reasons.
2. Only HIGH/STATUTORY rows including required evidence (and portal-required ones flagged for verification) pass validation ★.
3. The batch routes to an aggregate approval node honoring the highest sensitivity in the batch.
4. On approval, valid rows commit individually and idempotently; failures recorded per row; batch → `COMMITTED`/`PARTIAL_FAILED`.
5. STATUTORY rows post to M12 individually (FR-011) and raise retro events (FR-022) ★.
6. Full hash-chained audit at batch and row level ★.
7. ★ Each affected employee receives an out-of-band data-subject notice (FR-017); FINANCIAL rows respect the objection window before downstream credit.

**Business Rules:**
- BR1: Bulk is HR-only; never self-service.
- BR2: A row failing scope/ownership/status is rejected, not silently skipped ★.
- BR3: Batch approval respects SoD (approver ≠ initiator).
- BR4: Bulk corrections default `change_type=CORRECTION` unless the row specifies `UPDATE`.
- BR5: ★ Rows changing Aadhaar/PAN/category require portal verification before commit; rows on non-ACTIVE employees route to the elevated path.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `bulk_correction_batches` | INSERT/UPDATE | status, counts, report ref |
| `change_requests`/`_items` | INSERT | child rows, employment_status_at_submit ★ |
| `data_subject_notices` | INSERT | per-employee notice ★ |
| `documents` (M13) | READ | evidence refs |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/bulk-corrections` | Upload + create batch |
| POST | `/api/v1/bulk-corrections/{id}/validate` | Dry-run |
| POST | `/api/v1/bulk-corrections/{id}/submit` | Route for approval |
| POST | `/api/v1/bulk-corrections/{id}/approve` | Aggregate approve + commit |
| GET | `/api/v1/bulk-corrections/{id}/report` | Validation/commit report |

**UI Behavior Notes:** Upload wizard with template download; validation grid (filter valid/invalid, inline reasons); sensitivity summary; approve screen with per-row preview; post-commit results with downloadable report; ★ a column flagging portal-required and non-ACTIVE rows.

**Edge Cases:** Mixed valid/invalid (only valid proceed); duplicate field per employee (conflict); very large file (chunked async, **P3** ★); evidence ref pointing to another employee's doc (rejected); non-ACTIVE employee row (elevated path ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `BulkUploadWizard`, `ValidationGrid`, `BatchApprovalScreen`, `ResultsReport`. |
| Backend-Service Flow | `BulkService.parse()→validateRows()→materializeRequests()→notifySubjects()★→route()→commitBatch()`; async worker for large files (P3). |
| Data Operations | INSERT batch + child requests/items; per-employee notice ★; UPDATE counts/status; per-row commit (010); SR (011); retro (022). |
| Validation Logic | Existence/scope/regex/sensitivity/status-gate ★/one-open-change/stale; evidence + portal for HIGH/STATUTORY/identity ★. |
| Authorization Logic | Initiate: HR + scope; approve: HR Admin/authority, SoD enforced. |
| State Changes & Side Effects | `UPLOADED→VALIDATED→PENDING_APPROVAL→APPROVED→COMMITTED/PARTIAL_FAILED`. |
| Failure Handling | Per-row isolation; failed rows logged; report generated. |
| Dependencies & Reuse | Commit (010), SR (011), retro (022), notice (017), routing (002), M13. |
| Test Guidance | Mixed validity; SoD on approve; partial failure isolation; STATUTORY SR + retro; per-subject notice; non-ACTIVE elevation. |

---

### FR-M02-010 — Apply Approved Change to Employee Master (M01 Commit)

- **Module:** M02-EPDM
- **Primary Role(s):** System (post-approval)
- **User Story:** *As the system, once a change is fully approved, I want to atomically write it to the employee master with stale-value protection, so that the golden record is updated exactly once and correctly.*

**Description:** On `APPROVED`, the commit service applies each approved item to M01 via **`PATCH /employees/{id}:commit` (effective-dated write + version token)** ★, guarded by `old_value_hash` stale-detection and an idempotency key. All items commit atomically (all-or-nothing). ★ Per the corrected canonical sequence (§5.6 rule 11): on success items become `COMMITTED` and the request `COMMITTED`; STATUTORY items then enqueue SR posting (FR-011) and retro-impacting items enqueue retro events (FR-022) — **neither blocks `COMMITTED`**. For FINANCIAL changes initiated by HR, the **first downstream credit is held until the data-subject objection window elapses (FR-017)** ★. Saga/outbox (§10.4) guarantees eventual consistency.

**Acceptance Criteria:**
1. Commit applies only `APPROVED` items, using `commit_idempotency_key` so re-runs are no-ops.
2. If any item's `old_value_hash` ≠ current M01 hash, commit aborts that request with `STALE_MASTER_VALUE`/CONFLICT and sets `RETURNED`, no partial writes.
3. On success, `committed_at` set, items `COMMITTED`, request `COMMITTED`; hash-chained audit captures old→new, authority chain, effective date ★.
4. ★ STATUTORY items enqueue SR posting and retro-impacting items enqueue retro events **after** `COMMITTED` (corrected sequence); item `sr_posting_status`/`retro_status` track separately.
5. M01 unavailability → request `COMMIT_FAILED` with retry; no data loss.

**Business Rules:**
- BR1: Effective date and change_type are passed to M01's effective-dated commit ★.
- BR2: Commit writes complete provenance to `audit_log` + `cr_audit_chain` ★.
- BR3: No commit without a complete approval set and (for sensitive) valid strong e-signature.
- BR4: ★ For HR-initiated FINANCIAL changes, hold the first payroll credit until the objection window passes; emit retro event only after the hold clears.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | item_status, commit key, sr_posting_status, retro_status ★ |
| `change_requests` | UPDATE | status, committed_at |
| `employees` (M01) | UPDATE (via `:commit`) ★ | field value, version, effective_date |
| `audit_log` / `cr_audit_chain` | INSERT | full provenance ★ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `CommitService.apply(request)` | Triggered on APPROVED |
| GET | `/api/v1/change-requests/{id}/commit-status` | Commit/SR/retro status ★ |

**UI Behavior Notes:** Requester sees "Approved & applied" with effective date; HR-initiated FINANCIAL shows "Applied — credit held until {objection window}" ★; failed commit shows "Applied with errors — HR notified"; HR sees a commit-failures queue with retry.

**Edge Cases:** Master changed concurrently (stale → return); M01 partial write (saga compensation); duplicate commit trigger (idempotent no-op); STATUTORY commit succeeds but SR posting fails (commit retained, SR retried — FR-011); retro ack fails (commit retained, retro retried — FR-022 ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `CommitStatusPanel` (commit/SR/retro), HR `CommitFailureQueue`. |
| Backend-Service Flow | `CommitService.apply()`: re-check hashes → open txn/saga → `PATCH :commit` per item (effective-dated) ★ → mark COMMITTED → enqueue SR (011) + retro (022) → audit + chain → set/clear FINANCIAL hold ★. |
| Data Operations | UPDATE items + request; M01 effective-dated commit; INSERT audit + chain; enqueue SR + retro jobs. |
| Validation Logic | Stale hash; approval-complete + strong e-sign; idempotency; objection-window hold ★. |
| Authorization Logic | System-triggered; manual retry: HR Admin. |
| State Changes & Side Effects | `APPROVED→COMMITTED` (or `COMMIT_FAILED`/`RETURNED`); SR + retro enqueue. |
| Failure Handling | Atomic rollback/saga compensation; retry w/ backoff; alert HR on persistent failure. |
| Dependencies & Reuse | M01 `:commit`; SR (011); retro (022); notice/hold (017); audit + chain. |
| Test Guidance | Idempotent re-run; stale conflict; multi-item atomicity; corrected SR/retro-after-commit sequence ★; FINANCIAL hold; M01 down→retry; saga compensation. |

---

### FR-M02-011 — Statutory Change Posting to Digital Service Register (M12)

- **Module:** M02-EPDM
- **Primary Role(s):** System (post-commit)
- **User Story:** *As the SR Custodian, I want approved statutory personal-detail changes automatically and reliably recorded in the Service Register, so that the statutory record stays authoritative and complete.*

**Description:** For committed items whose field has `post_to_sr=true`, M02 posts an idempotent event to M12 via `postServiceRegisterEvent`, carrying `sr_event_type`, `employee_id`, effective date, before/after (masked/tokenised as needed), `cr_number`, approval authority and e-signature reference. ★ Reversals (FR-020) post a **reversing SR event**. Posting status tracked per item; failures retried with a dead-letter queue and reconciliation report. M02 never writes the SR ledger schema directly.

**Acceptance Criteria:**
1. Only committed STATUTORY items (`post_to_sr=true`) post to M12.
2. Posting is idempotent on `change_request_item_id + ':SR'`; duplicates no-op.
3. Success sets `sr_posting_status=POSTED` with the returned reference; failure sets `FAILED` and queues retry.
4. The SR payload includes effective date, before/after, `cr_number`, approver chain and e-signature reference.
5. Persistent failure raises an alert to HR Admin + SR Custodian and appears in the reconciliation report.
6. ★ A reversal posts a reversing SR event (`source_ref = item_id + ':REV:' + reversal_id`).

**Business Rules:**
- BR1: M12 is the SR system of record; M02 only mirrors.
- BR2: ★ Per corrected sequence (R15), SR posting follows `COMMITTED` and is tracked separately; it never gates the COMMITTED state. Statutory completeness is *reported and reconciled*, not a commit precondition.
- BR3: SR posting uses M12-published event types only; unknown types fail config validation (FR-012).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | sr_posting_status |
| `service_register_events` (M12) | INSERT (via contract) | event_type, payload, source_ref |
| `cr_reversals` | READ/UPDATE | reversing_sr_status ★ |
| `cr_audit_chain`/`audit_log` | INSERT | posting attempts |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `SrPostingService.post(item)` | Triggered post-commit |
| GET | `/api/v1/change-requests/{id}/sr-status` | SR posting status |
| POST | `/api/v1/change-requests/{id}/sr-retry` | Manual retry (HR Admin) |

**UI Behavior Notes:** SR status chip per statutory item (Posted / Pending / Failed); SR Custodian reconciliation dashboard listing unposted/failed statutory changes with retry; reversing-event indicator ★.

**Edge Cases:** M12 down (queue + retry, item PENDING); M12 rejects payload (FAILED + alert, no silent loss); duplicate post after retry (idempotent); event_type retired in M12 (config alert); reversing event for a never-posted item (skip with note ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SrStatusChip`, `SrReconciliationDashboard`, retry action. |
| Backend-Service Flow | `SrPostingService.post()`: build payload → call M12 idempotently → record status; `postReversing()` for FR-020 ★. |
| Data Operations | UPDATE sr_posting_status; INSERT audit + chain; M12 event insert via contract. |
| Validation Logic | post_to_sr=true; event_type valid; idempotency key. |
| Authorization Logic | System-triggered; manual retry: HR Admin/SR Custodian. |
| State Changes & Side Effects | `PENDING→POSTED/FAILED`; alerts on persistent failure. |
| Failure Handling | Retry w/ backoff + dead-letter; reconciliation report; never drops. |
| Dependencies & Reuse | M12 contract; commit (010); reversal (020); notifications; audit + chain. |
| Test Guidance | Idempotent post; M12 down retry; payload reject; reconciliation listing; reversing event; manual retry. |

---

### FR-M02-012 — Approval-Matrix, Field-Sensitivity, E-Sign-Policy & Regex Configuration

- **Module:** M02-EPDM
- **Primary Role(s):** System Administrator
- **User Story:** *As a system administrator, I want to configure which fields are sensitive, how each tier is approved, which e-sign methods are allowed, and safe validation rules, so that governance adapts without code changes.*

**Description:** Admin UI/API to manage `field_sensitivity_catalog` (classify fields, evidence/portal/e-sign/SR rules, `is_auth_bearing`, `self_service_editable`, `hard_block_rule_ref`, `evidence_path`, **regex with ReDoS safety** ★, **per-field allowed e-sign methods** ★) and versioned `approval_matrix_config` + `approval_matrix_rules`. Configurations are versioned with effective dates; activation retires the prior. Validation prevents invalid routes (no nodes, unknown roles, duplicate levels, unknown SR types, **auth-bearing auto-apply, unsafe regex, OTP/weak method on FINANCIAL/STATUTORY** ★).

**Acceptance Criteria:**
1. Admin can create/edit/version a matrix scoped globally or to an org unit, DRAFT→ACTIVE→RETIRED.
2. Activating sets `effective_from` and retires the previously active for that scope.
3. Saving is rejected for zero nodes (non-auto-apply), unknown roles, duplicate `level_no`, unknown M12 event type, ★ an `is_auth_bearing` field with `auto_apply_on_low=true`, ★ a FINANCIAL/STATUTORY field whose `allowed_esign_methods` includes a weak method (OTP)/excludes a strong one, or ★ an unsafe `validation_regex`.
4. Catalog edits are versioned and apply to *new* requests only (in-flight keep their snapshot route).
5. All config changes are hash-chained audited with before/after ★.
6. ★ `validation_regex` is length/complexity-bounded, compiled via a safe-regex library and run with an execution timeout (ReDoS, R17).

**Business Rules:**
- BR1: Config changes never retroactively alter in-flight requests' routes.
- BR2: Only System Admin may configure; cannot self-approve transactions (SoD).
- BR3: A global default matrix must always exist (cannot retire the last active global).
- BR4: ★ E-sign method policy and auth-bearing/regex/hard-block rules are validated at save; invalid combinations are rejected.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `field_sensitivity_catalog` | CRUD (versioned) | sensitivity, rules, regex, methods, flags ★ |
| `approval_matrix_config`/`_rules` | CRUD (versioned) | nodes, roles, SLA, status scope ★ |
| `audit_log`/`cr_audit_chain` | INSERT | config before/after ★ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/admin/field-sensitivity` | Manage catalog |
| GET/POST/PATCH | `/api/v1/admin/approval-matrices` | Manage matrices |
| POST | `/api/v1/admin/approval-matrices/{id}/activate` | Activate version |
| POST | `/api/v1/admin/validation-regex/test` | ★ Safe-regex test (length/complexity/timeout) |

**UI Behavior Notes:** Field catalog grid with inline sensitivity/rule editing incl. auth-bearing, e-sign-method and regex fields ★; matrix builder with drag-order levels, parallel grouping, role pickers, SLA inputs, status-scope; validation summary before activation; version history with diff.

**Edge Cases:** Retire last global matrix (blocked); overlapping effective dates same scope (blocked); role removed from RBAC still referenced (validation error); invalid/unsafe regex (rejected ★); auth-bearing auto-apply (rejected ★); weak e-sign on FINANCIAL/STATUTORY (rejected ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `FieldCatalogGrid`, `MatrixBuilder`, `EsignPolicyEditor` ★, `RegexSafetyTester` ★, `ActivationDialog`, `ConfigVersionHistory`. |
| Backend-Service Flow | `ConfigService` validates (incl. regex safety, method policy, auth-bearing) + versions; activation transitions atomically. |
| Data Operations | Versioned INSERT (new version), UPDATE status; audit + chain before/after. |
| Validation Logic | Non-empty route; known roles/event types; no duplicate levels; single active global; safe regex ★; method policy ★; auth-bearing auto-apply ban ★. |
| Authorization Logic | System Admin only. |
| State Changes & Side Effects | `DRAFT→ACTIVE→RETIRED`; new versions affect future requests only. |
| Failure Handling | Invalid config rejected pre-save; activation rollback on partial failure. |
| Dependencies & Reuse | Consumed by routing (002), e-sign (015); RBAC; M12 event registry. |
| Test Guidance | Versioning; activation retires prior; invalid-route rejection; in-flight immunity; last-global guard; ReDoS regex reject; weak-method reject; auth-bearing auto-apply reject. |

---

### FR-M02-013 — Delegation of Approval Authority (Role-Independent)

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers (delegate own authority); System Admin (any)
- **User Story:** *As an approver going on leave, I want to delegate my approval authority for a period, so that requests keep moving while my decisions remain accountable — without elevating anyone's privilege.*

**Description:** Lets an approver delegate authority (optionally scoped by org unit and node types) to **another user who independently holds the required role** ★ for a validity window. The delegate appears as resolved assignee for matching tasks; decisions record both `assigned_to` and `delegated_from`. Delegations can be revoked; they auto-expire. SoD still applies. ★ Attempted delegation to an ineligible (role-lacking) user is blocked and logged to the privileged-action security report (§12). *(Re-phased to P3 — §13.3.)*

**Acceptance Criteria:**
1. An approver can create a delegation to an eligible user with `valid_from/valid_to`, optional scope and node types.
2. While active, new and pending tasks within scope resolve to the delegate; audit shows delegate + delegator.
3. Delegations can be revoked early (`REVOKED`) and auto-expire (`EXPIRED`).
4. A delegate subject to SoD on a request is excluded for that request (fall back to delegator/escalation).
5. Overlapping delegations resolve by most-specific scope then most-recent.
6. ★ A delegate must independently satisfy the node's `required_role` (`delegate_holds_role_verified=true`); otherwise the delegation is rejected at creation and any attempted action is `FORBIDDEN` and recorded in the security report.

**Business Rules:**
- BR1: ★ Delegate must hold a role capable of the delegated node type — **delegation transfers the action, never the privilege** (no elevation).
- BR2: Delegation does not transfer configuration rights, only approval actions.
- BR3: Circular delegation (A→B while B→A overlapping same scope) is blocked.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `delegations` | CRUD | delegator, delegate, scope, window, status, delegate_holds_role_verified ★ |
| `change_request_approvals` | INSERT | delegated_from on decision |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/delegations` | List/create |
| POST | `/api/v1/delegations/{id}/revoke` | Revoke |

**UI Behavior Notes:** "Delegate my approvals" form with eligible-user search (role-filtered ★), date range, scope/node-type selectors; banner when acting as a delegate; admin view of all active delegations; ★ a blocked-attempt indicator feeding the security report.

**Edge Cases:** Delegate also unavailable (escalation applies); window overlaps a holiday (still honored); delegate to ineligible role (blocked + logged ★); delegator returns early and revokes (pending tasks revert).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DelegationForm` (role-filtered), `ActingAsDelegateBanner`, admin `DelegationRegistry`. |
| Backend-Service Flow | `DelegationService.resolveAssignee(task)`: find active delegation by scope/node/time, validate role-independence ★ + SoD. |
| Data Operations | CRUD delegations; record delegated_from on approval; audit + chain. |
| Validation Logic | Role capability (independent) ★, no elevation, no circular, window validity, SoD per request. |
| Authorization Logic | Create own: approver; create any/revoke any: System Admin. |
| State Changes & Side Effects | Reassigns task resolution; dual-attribution audit; security-report entry on blocked attempt ★. |
| Failure Handling | Ineligible delegate blocked + logged; fallback to delegator/escalation. |
| Dependencies & Reuse | Approvals (004), SLA escalation (007), RBAC, security report (§12). |
| Test Guidance | Active-window routing; revoke reverts; SoD exclusion; overlap precedence; ineligible block + security-report entry ★. |

---

### FR-M02-014 — Change-Request Templates

- **Module:** M02-EPDM
- **Primary Role(s):** System Admin / HR Admin (author); Requesters (use)
- **User Story:** *As an employee, I want guided templates for common changes (e.g., "Update bank account"), so that I provide the right fields and documents the first time.*

**Description:** Reusable templates pre-select fields, prescribe required document types and show guidance, reducing errors/rejections. Requesters start "from template"; the editor pre-populates field rows and evidence requirements. Templates are scoped (global/org unit) and can be activated/deactivated. ★ Templates respect `self_service_editable` (Aadhaar/PAN/category never offered in a self-service template). *(Re-phased to P3 — §13.3.)*

**Acceptance Criteria:**
1. Admin/HR Admin can create templates specifying `field_keys`, `required_doc_types`, instructions, change_type.
2. Requesters can start a request from an active template scoped to them; the editor pre-fills field rows.
3. Templates only include fields the requester is authorized to edit; unauthorized and HR-only fields are filtered at use time ★.
4. Deactivated templates are not selectable but historical requests retain their `template_id`.

**Business Rules:**
- BR1: A template cannot bypass sensitivity/route/status/step-up rules; it only pre-fills the form.
- BR2: Required doc types in a template are guidance; the catalog's `requires_document`/portal remains authoritative for gating.

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

**UI Behavior Notes:** Template gallery on "New request" with descriptions and required-document hints; pre-filled editor with instructions panel.

**Edge Cases:** Template references a now-non-governed field (filtered with notice); requester unauthorized/HR-only fields (those rows omitted ★); template deactivated mid-draft (draft continues, new starts blocked).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `TemplateGallery`, pre-filled `ChangeRequestEditor`, `InstructionsPanel`. |
| Backend-Service Flow | `TemplateService.instantiate()` filters fields by authorization + self_service_editable ★, seeds items + doc hints. |
| Data Operations | READ template; INSERT request with template_id; CRUD templates (admin). |
| Validation Logic | Active+scope check; field-authorization + HR-only filter ★; governed-field check. |
| Authorization Logic | Use: any requester (scoped); manage: HR Admin/System Admin. |
| State Changes & Side Effects | Creates DRAFT seeded from template. |
| Failure Handling | Invalid/inactive template → NOT_FOUND/CONFLICT; partial field filtering with notice. |
| Dependencies & Reuse | Authoring (001), catalog (012). |
| Test Guidance | Pre-fill; unauthorized/HR-only field filtering ★; inactive block; historical retention. |

---

### FR-M02-015 — Strong E-Signature on High-Sensitivity Approvals (Method Policy)

- **Module:** M02-EPDM
- **Primary Role(s):** Approvers on HIGH-financial / STATUTORY nodes
- **User Story:** *As a senior approver sanctioning a statutory or financial change, I want to apply a legally sufficient, verifiable e-signature, so that my authorization is attributable and tamper-evident.*

**Description:** Captures a cryptographically attributable e-signature when an approver decides on a node configured `requires_esignature`. ★ Method policy by tier (R1/Imp5): **PASSWORD_REAUTH is removed entirely** (it provides no non-repudiation); FINANCIAL (bank) and STATUTORY require **PKI/DSC or Aadhaar e-Sign** (strong, non-OTP-to-changed-number); OTP is permitted only for non-financial HIGH where policy allows. The signed payload hash binds the exact decision; the signature is stored append-only and **hash-chained (E10)** ★ and referenced by the approval and any SR event.

**Acceptance Criteria:**
1. A decision on a `requires_esignature` node cannot be persisted without a successful e-signature capture.
2. `signed_payload_hash` is the SHA-256 of the canonical decision payload; tampering invalidates verification; the e-sign ledger is hash-chained ★.
3. Signature metadata (method, signer, timestamp, IP, user-agent) recorded append-only.
4. The e-signature reference is included in the SR event payload (FR-011) for STATUTORY changes.
5. Failed signature attempts are recorded and do not advance the node.
6. ★ The captured `sign_method` must be in the field's `allowed_esign_methods`; FINANCIAL/STATUTORY reject `OTP` and any non-strong method (`ESIGN_METHOD_NOT_ALLOWED`).

**Business Rules:**
- BR1: The signer must be the acting approver (or role-qualified delegate) — signature identity = decision identity.
- BR2: E-signatures are immutable; a re-decision requires a new signature.
- BR3: ★ At least one strong method (PKI/DSC or Aadhaar e-Sign) is **required** for FINANCIAL and STATUTORY; weak methods are policy-rejected; `PASSWORD_REAUTH` does not exist.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `esignatures` | INSERT | method, payload hash, chain_hash ★, signer, metadata |
| `change_request_approvals` | UPDATE | esignature_id |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/esign` | Capture signature |
| GET | `/api/v1/change-requests/{id}/esignatures` | List (auditor) |

**UI Behavior Notes:** Signature modal triggered on Approve for sensitive nodes; **method selector restricted to allowed strong methods** ★; OTP/DSC/Aadhaar flows; confirmation of signed payload summary; clear "You are legally signing this decision" notice.

**Edge Cases:** Provider down (decision blocked, retry; UPSTREAM_UNAVAILABLE); payload changed after signing (hash mismatch → re-sign); delegate signs (identity recorded with delegator link); weak method attempted on FINANCIAL/STATUTORY (rejected ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `EsignModal` with method-policy-restricted flows + payload preview. |
| Backend-Service Flow | `EsignService.capture()`: validate method ∈ policy ★ → build canonical payload → hash → invoke provider → persist signature + chain_hash ★ → link → allow decide. |
| Data Operations | INSERT esignatures (hash-chained); UPDATE approval esignature_id; audit. |
| Validation Logic | Node requires e-sign; signer = approver/delegate; hash binding; **method policy for FINANCIAL/STATUTORY** ★. |
| Authorization Logic | Acting approver/role-qualified delegate on the node only. |
| State Changes & Side Effects | Enables decision persistence; reference flows to SR event. |
| Failure Handling | Provider failure blocks decision; failed attempts logged; hash mismatch forces re-sign; weak method rejected ★. |
| Dependencies & Reuse | Approvals (004), SR (011), config method policy (012), external providers. |
| Test Guidance | Block decision w/o e-sign; hash binding + chain; provider down; delegate signing; **weak-method rejection** ★. |

---

### FR-M02-016 — Change Provenance, Field History, Tamper-Evident Audit & Reporting

- **Module:** M02-EPDM
- **Primary Role(s):** Auditor, HR Admin, Employee (own history)
- **User Story:** *As an auditor, I want a complete, immutable, tamper-evident history of who changed what, when, on whose authority and against which document, so that I can verify compliance for any field at any time.*

**Description:** Surfaces full provenance of every governed-field change: chronological field history (per field, per employee) from committed requests, the complete decision trail (recommenders, approvers, sanctioners, delegates, e-signatures), linked evidence, effective vs recorded dates, SR posting + **retro reconciliation status** ★, and **a verifiable audit hash-chain (E18)** ★. Provides exportable audit reports and an employee-facing "my change history" view. All reads are scoped and audited; nothing is editable.

**Acceptance Criteria:**
1. For any field on any employee (within scope), the system shows an ordered history with old→new, dates (effective + recorded), authority chain, evidence, SR reference and **retro status** ★.
2. Employees can view their own change history; auditors/HR (in scope) can view others'.
3. Reports are filterable (date range, field group, sensitivity, status, org unit, **risk band** ★) and exportable (CSV/PDF) with pagination.
4. Sensitive values are masked per role even in reports.
5. History is read-only; any access to sensitive provenance is itself hash-chained audited ★.
6. ★ An **audit-chain integrity verifier** recomputes `cr_audit_chain`/`esignatures` hashes and reports any break (tamper-evidence).

**Business Rules:**
- BR1: History derives from immutable sources (`change_request_*`, `audit_log`, `cr_audit_chain`, `esignatures`); never independently editable.
- BR2: Exports honor row-level scope and masking.
- BR3: Reconciliation reports list any committed STATUTORY item not yet `POSTED` to M12 **and any retro event not yet `ACKED`** ★.
- BR4: ★ The audit chain is WORM; integrity verification runs on a schedule and on-demand, alarming on any break.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests`/`_items`/`_approvals` | READ | full trail |
| `esignatures`, `cr_sla_events`, `cr_audit_chain`, `retro_impact_events` | READ | signatures, SLA, chain, retro ★ |
| `audit_log` | READ/INSERT | source + access audit |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/field-history` | Per-field history |
| GET | `/api/v1/reports/change-requests` | Filterable report |
| GET | `/api/v1/reports/sr-reconciliation` | Unposted statutory items |
| GET | `/api/v1/reports/retro-reconciliation` | ★ Unacked retro events |
| POST | `/api/v1/audit/verify-chain` | ★ Run audit-chain integrity verification |

**UI Behavior Notes:** Timeline view per field; report builder with filters and export; "my changes" tab for employees; masked values with role-gated reveal (audited); ★ an **audit-integrity status tile** (last verified, any breaks).

**Edge Cases:** Field changed many times (paginated timeline); large export (async + download link); out-of-scope access (FORBIDDEN, audited); chain break detected (alarm + auditor notification ★).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `FieldHistoryTimeline`, `ReportBuilder`, `SrReconciliationReport`, `RetroReconciliationReport` ★, `AuditIntegrityTile` ★, employee `MyChangesTab`. |
| Backend-Service Flow | `HistoryService.fieldHistory()` + `ReportService.query()` (scope + masking); `ChainVerifier.verify()` recomputes hashes ★; async export worker. |
| Data Operations | READ change_request_* + audit + chain + esignatures + retro; INSERT access-audit; generate export (M13). |
| Validation Logic | Filter validation; pagination bound 100; scope enforcement; chain recomputation ★. |
| Authorization Logic | Own: employee; others: HR/Auditor in scope; masking by `view_sensitive_value`; chain-verify: Auditor/HR Admin/System Admin. |
| State Changes & Side Effects | Read-only + access audit; export artefact stored in M13; chain-break alarm ★. |
| Failure Handling | Large export async with retry; access denial audited; chain break escalated ★. |
| Dependencies & Reuse | Diff (005), all lifecycle data, retro (022), M13 for exports. |
| Test Guidance | Field timeline order; scope/masking; async export; SR + retro reconciliation accuracy; **chain-break detection** ★; access audit. |

---

### FR-M02-017 — Data-Subject Notification & Confirmation/Objection Window ★ NEW (Imp 2 / R2)

- **Module:** M02-EPDM
- **Primary Role(s):** System; Employee (data subject)
- **User Story:** *As an employee, when someone else changes my record, I want to be told out-of-band and given a window to confirm or object before any money moves, so that I am protected from silent fraud.*

**Description:** On any change initiated by someone other than the data subject (`HR_ON_BEHALF`, `BULK`), M02 sends an **out-of-band notice** (a channel distinct from the requester's session — SMS/email/postal/in-app to the *employee's* recorded contact) and, for FINANCIAL changes, opens a configurable **confirmation/objection window** during which the first downstream credit is held (FR-010 BR4). The employee can confirm, object (FR-021), or let the window elapse. ★ Auth-bearing contact changes also notify the **old** contact value (anti-takeover, R1).

**Acceptance Criteria:**
1. Every `HR_ON_BEHALF`/`BULK` change creates a `data_subject_notices` row and dispatches an out-of-band notice to the employee's recorded contact.
2. For FINANCIAL changes, an `objection_window_ends_at` is set; the request enters `NOTICE_HOLD`; the first credit is held until the window elapses or the subject confirms.
3. The employee can confirm (`CONFIRMED`), object (`OBJECTED`→FR-021), or the window elapses (`WINDOW_ELAPSED`).
4. ★ Auth-bearing contact-field changes notify the OLD value (and the new) so a takeover is visible to the legitimate holder.
5. Notice delivery status is tracked; delivery failure raises an HR alert and blocks auto-clearance of the hold.
6. Notices never contain raw sensitive values (masked).

**Business Rules:**
- BR1: Notice channel must differ from the requester's interaction channel (true out-of-band).
- BR2: The objection window is configurable per sensitivity (default: FINANCIAL 48h; others notice-only).
- BR3: A delivered objection pauses the request (`OBJECTED`) and routes to the Grievance Officer (FR-021).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `data_subject_notices` | INSERT/UPDATE | channel, sent_at, objection_window_ends_at, outcome |
| `change_requests` | UPDATE | status `NOTICE_HOLD`/`OBJECTED` |
| `notifications` | INSERT | out-of-band dispatch |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/notice` | Notice + window status |
| POST | `/api/v1/change-requests/{id}/notice/confirm` | Data subject confirms |
| POST | `/api/v1/change-requests/{id}/notice/object` | Data subject objects (→FR-021) |

**UI Behavior Notes:** Employee "Action needed: a change was made to your record" card with confirm/object actions and a countdown; HR sees a "Held — awaiting data-subject window" status; old-channel anti-takeover alert for contact changes.

**Edge Cases:** Employee has no deliverable contact (escalate to HR; postal fallback; hold extended); employee confirms early (hold released early); objection arrives after window elapsed but before credit posted (still pauses/triggers reversal review); bulk job → one notice per affected employee.

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DataSubjectNoticeCard`, `ObjectionWindowCountdown`, HR `HeldRequests` view. |
| Backend-Service Flow | `NoticeService.dispatch()` on HR/BULK submit → set window/hold → `confirm()/object()/elapse()` transitions; clears FR-010 credit hold. |
| Data Operations | INSERT/UPDATE data_subject_notices; UPDATE change_requests.status; INSERT notifications + audit + chain. |
| Validation Logic | Out-of-band channel selection; window computation; delivery confirmation. |
| Authorization Logic | Confirm/object: the data subject only. |
| State Changes & Side Effects | `→NOTICE_HOLD→(CONFIRMED|OBJECTED|WINDOW_ELAPSED)`; credit-hold release. |
| Failure Handling | Delivery failure → HR alert, hold not auto-cleared; retries. |
| Dependencies & Reuse | Notifications; commit/hold (010); objection (021); contact-change (002). |
| Test Guidance | Out-of-band dispatch; FINANCIAL hold+window; old-channel alert; confirm/object/elapse; undeliverable fallback; bulk fan-out. |

---

### FR-M02-018 — Employment-Status Gating & Elevated Special Paths ★ NEW (Imp 3 / R3)

- **Module:** M02-EPDM
- **Primary Role(s):** System; HR Admin; Appointing Authority (elevated)
- **User Story:** *As HR governance, I want changes on non-active employees (retired, deceased, suspended, terminated) blocked from ordinary self-service and routed to elevated, status-specific controls, so that family-pension and terminal-benefit fraud is prevented.*

**Description:** Reads the target's M01 `employment_status` at submit (`employment_status_at_submit`) and applies a gate: `ACTIVE` follows the standard route; **non-ACTIVE blocks self-service entirely** and routes HR-initiated changes to a status-specific elevated path. ★ Bank/nominee changes on a `DECEASED` record route to a **family-pension controlled path** (Appointing Authority + enhanced evidence). `SUSPENDED`/`TERMINATED` records require elevated authority and a documented justification.

**Acceptance Criteria:**
1. Self-service on any non-`ACTIVE` target is rejected (`FORBIDDEN`/`STATUS_GATE_BLOCKED`).
2. HR-on-behalf on non-`ACTIVE` is permitted only via the elevated route defined by `employment_status_scope` matrix rules (FR-002).
3. ★ Bank/nominee change on `DECEASED` routes to the family-pension controlled path with Appointing-Authority sanction and enhanced evidence; ordinary HR cannot self-approve it.
4. The status snapshot is recorded; if status changes between draft and submit, the gate is re-evaluated.
5. All status-gated decisions are hash-chained audited.

**Business Rules:**
- BR1: Status gating precedes routing and step-up.
- BR2: ★ `DECEASED` financial changes always require dual control and family-pension evidence; never auto-apply.
- BR3: Elevated paths cannot be bypassed by templates, bulk or delegation.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` (M01) | READ | employment_status |
| `change_requests` | UPDATE | employment_status_at_submit, status |
| `approval_matrix_rules` | READ | employment_status_scope routes |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/status-gate?fieldKey=` | Gate decision + required path |

**UI Behavior Notes:** Self-service editor shows "This record is {status}; changes require HR with elevated approval"; HR editor shows an elevated-path badge and enhanced-evidence requirements for deceased/retired.

**Edge Cases:** Status changes mid-flow (re-gate; may block/elevate); `ON_LEAVE` treated as ACTIVE for routine fields but config can elevate; reactivation after retirement (rare — HR override with audit).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `StatusGateBanner`, elevated-path badge. |
| Backend-Service Flow | `StatusGateService.evaluate(target, field)` → ALLOW/BLOCK/ELEVATE → feeds routing (002). |
| Data Operations | READ M01 status; snapshot on CR; audit + chain. |
| Validation Logic | Status→path mapping; self-service block; deceased financial dual-control. |
| Authorization Logic | Elevated path requires Appointing Authority per matrix. |
| State Changes & Side Effects | Determines route; blocks self-service; enforces enhanced evidence. |
| Failure Handling | M01 status read failure → UPSTREAM_UNAVAILABLE (fail closed: block). |
| Dependencies & Reuse | M01 read; routing (002); evidence (003); commit (010). |
| Test Guidance | Self-service block on non-ACTIVE; deceased bank dual-control; re-gate on mid-flow status change; fail-closed on status read error. |

---

### FR-M02-019 — Fraud, Velocity & Anomaly Signal Detection ★ NEW (Imp 7 / R10)

- **Module:** M02-EPDM
- **Primary Role(s):** System; Fraud Reviewer (HR Officer/Admin/Authority capability)
- **User Story:** *As HR governance, I want sensitive changes risk-scored for fraud patterns — mule accounts, pre-payroll/pre-exit spikes, device/velocity anomalies — and high-risk ones held for review, so that collusion and theft are caught before commit.*

**Description:** A risk engine evaluates each submitted request and emits `cr_risk_signals`, aggregating a `risk_score`/`risk_band` on the CR. Signals include: **same new bank account across multiple employees** (mule), **changes within N days before a payroll cutoff**, **within N days before separation**, **device/velocity** anomalies, **multi-employee changes from one device**, **auth-channel-change-then-financial** chains (R1), and **off-hours bursts**. `HIGH` injects a mandatory fraud-review node (FR-002 AC7); `BLOCKED` halts commit pending review.

**Acceptance Criteria:**
1. Every HIGH/STATUTORY (and FINANCIAL) request is risk-evaluated at submit and on material edit.
2. Each fired signal creates a `cr_risk_signals` row with type, severity, score contribution and evidence.
3. `risk_band=HIGH` forces a fraud-review node before substantive approval; `BLOCKED` prevents commit until cleared.
4. The same new bank account appearing on ≥2 employees within a window fires `DUPLICATE_BANK_ACCOUNT` (mule) and surfaces the linked employees.
5. ★ An auth-bearing contact change followed by a FINANCIAL change by/for the same employee within a window fires `AUTH_CHANNEL_THEN_FINANCIAL`.
6. A Fraud Reviewer can clear/confirm/escalate; outcomes are hash-chained audited; a fraud report and queue are provided.

**Business Rules:**
- BR1: Risk thresholds/windows are configurable (System Admin).
- BR2: A `CONFIRMED_FRAUD` outcome rejects the request and raises a security alert.
- BR3: Risk evaluation never silently auto-approves; it can only add scrutiny.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_risk_signals` | INSERT/UPDATE | signal_type, severity, score, review_outcome |
| `change_requests` | UPDATE | risk_score, risk_band |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/fraud/queue` | Fraud-review queue |
| GET | `/api/v1/change-requests/{id}/risk` | Risk signals + score |
| POST | `/api/v1/change-requests/{id}/risk/{signalId}/review` | Clear/confirm/escalate |
| GET | `/api/v1/reports/fraud` | Fraud analytics report |

**UI Behavior Notes:** Risk badge on approver/HR queues; fraud-signal panel listing signals with evidence (e.g., linked employee_ids for a shared bank account); fraud-review queue with clear/confirm/escalate; fraud report tile.

**Edge Cases:** Legitimate shared account (joint family) — reviewer can clear with reason; high false-positive field — thresholds tunable; signal fires after approval but before commit (commit held, review forced); device signal unavailable (degrade gracefully, other signals still apply).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RiskBadge`, `FraudSignalPanel`, `FraudReviewQueue`, `FraudReport`. |
| Backend-Service Flow | `RiskEngine.evaluate(request)` runs signal detectors → persist signals → aggregate band → influence routing (002) + commit gate (010). |
| Data Operations | INSERT cr_risk_signals; UPDATE risk_score/band; audit + chain on review. |
| Validation Logic | Window/threshold config; duplicate-bank detection across employees; velocity windows. |
| Authorization Logic | Review: Fraud Reviewer capability within scope. |
| State Changes & Side Effects | Injects fraud-review node; BLOCKED holds commit; CONFIRMED_FRAUD → REJECTED. |
| Failure Handling | Detector failure logged; fail-safe = add scrutiny (never auto-clear). |
| Dependencies & Reuse | Routing (002), approval (004), commit (010), notifications, M14. |
| Test Guidance | Mule duplicate-bank; pre-payroll/pre-exit windows; device velocity; auth-then-financial chain; reviewer clear/confirm/escalate; BLOCKED commit hold. |

---

### FR-M02-020 — Emergency Reversal / Break-Glass ★ NEW (Imp 15 / R13)

- **Module:** M02-EPDM
- **Primary Role(s):** HR Officer (raise); HR Admin (auth 1) + Appointing Authority (auth 2)
- **User Story:** *As HR, when a wrong bank account is caught hours before payroll, I want a fast, dual-authorised reversal that restores the prior value and posts a reversing statutory event, so that the error is corrected before money moves — with full audit.*

**Description:** A fast, elevated-authority path to **reverse a committed erroneous change**. A reversal creates a `cr_reversals` row referencing the original committed item, requires **two distinct authorisers** (auth1 ≠ auth2 ≠ original maker), restores `revert_to_value` to M01 via the effective-dated commit, marks the item `REVERSED`, and — for statutory items — posts a **reversing SR event** (FR-011) and a reversing retro event (FR-022). It is idempotent on `item_id + ':REV:' + reversal_id`.

**Acceptance Criteria:**
1. A reversal can be initiated only against a `COMMITTED` item, with a mandatory reason.
2. Execution requires two distinct authorisers; `auth1 ≠ auth2 ≠ original committing maker` (SoD).
3. On execution, M01 is restored to `revert_to_value` (effective-dated), the item → `REVERSED`, request → `REVERSED`, all hash-chained audited.
4. ★ Statutory reversals post a reversing SR event; retro-impacting reversals emit a reversing retro event (FR-022).
5. The reversal is idempotent; a re-run is a no-op.
6. If payroll has already consumed the change, the reversal still records and notifies M10 to recover/adjust (tracked via retro).

**Business Rules:**
- BR1: Break-glass is logged to the privileged-action security report (§12).
- BR2: A reversal never deletes history; it appends a compensating change.
- BR3: Dual authorisation is mandatory and cannot be delegated to a single person.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_reversals` | INSERT/UPDATE | original item, auth1/auth2, revert_to_value, statuses |
| `change_request_items` | UPDATE | item_status `REVERSED` |
| `change_requests` | INSERT (REVERSAL child) | parent_reversal_id |
| `service_register_events` (M12) | INSERT | reversing event |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/items/{itemId}/reversal` | Initiate (raise) |
| POST | `/api/v1/reversals/{reversalId}/authorize` | Authorize (auth1/auth2) |
| GET | `/api/v1/reversals/{reversalId}` | Status |

**UI Behavior Notes:** "Emergency reversal" action on a committed item (elevated roles only), with a prominent dual-authorisation flow, mandatory reason, and a "this is a break-glass action" warning; status panel showing M01 revert + reversing SR/retro status.

**Edge Cases:** Both authorisers same person (blocked); original maker tries to authorise (blocked); reversal of an already-reversed item (idempotent no-op); payroll already paid (record + M10 recovery via retro); reversing SR for a never-posted item (skip with note).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ReversalInitiateDialog`, `DualAuthorizePanel`, `ReversalStatusPanel`. |
| Backend-Service Flow | `ReversalService.raise()→authorize(auth1)→authorize(auth2)→execute()`: restore M01 (effective-dated, idempotent) → mark REVERSED → post reversing SR (011) + retro (022) → audit + chain + security report. |
| Data Operations | INSERT cr_reversals + REVERSAL child CR; UPDATE item/request status; M01 revert; M12 reversing event. |
| Validation Logic | Item is COMMITTED; dual-auth distinctness; idempotency key. |
| Authorization Logic | Raise: HR; authorize: two distinct elevated authorisers ≠ maker. |
| State Changes & Side Effects | Item→REVERSED; request→REVERSED; reversing SR/retro; security-report entry. |
| Failure Handling | M01 revert failure → retry; partial → saga compensation; persistent → alert. |
| Dependencies & Reuse | Commit (010), SR (011), retro (022), security report (§12), M01 `:commit`. |
| Test Guidance | Dual-auth distinctness; maker-exclusion; idempotent re-run; reversing SR/retro; payroll-already-paid recovery. |

---

### FR-M02-021 — Data-Subject Grievance & Objection ★ NEW (Imp 16 / R14)

- **Module:** M02-EPDM
- **Primary Role(s):** Employee (data subject); Grievance Officer (HR Admin/Authority capability)
- **User Story:** *As an employee, I want to contest or object to a change made to my record, so that an unauthorised or incorrect change is paused or reversed and reviewed fairly (DPDP-aligned).*

**Description:** A DPDP-aligned dispute path. The data subject can raise a `cr_objections` row against an **in-flight** request (effect `PAUSE` → `OBJECTED`) or a **committed** change (effect `REVERSAL_REQUESTED` → routes to FR-020 review). The objection is assigned to a Grievance Officer who reviews and resolves (`UPHELD`→pause/reverse, or `DISMISSED` with reason). Tied to the notice flow (FR-017) so an objection during the window pauses commit.

**Acceptance Criteria:**
1. A data subject can object to any change to *their own* record, in-flight or committed.
2. An in-flight objection pauses the request (`OBJECTED`) and stops SLA timers.
3. A committed-change objection creates a reversal-review item routed to FR-020 (dual-auth) if upheld.
4. Objections are assigned to a Grievance Officer; resolution requires a comment and is hash-chained audited.
5. The data subject is notified of the outcome.

**Business Rules:**
- BR1: An objection during the FR-017 window holds any financial credit until resolved.
- BR2: Only the data subject (or their authorised representative) may raise an objection on their record.
- BR3: An upheld objection on a committed change does not auto-edit; it triggers the governed reversal (FR-020).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_objections` | INSERT/UPDATE | objection_type, status, effect, grievance officer |
| `change_requests` | UPDATE | status `OBJECTED` |
| `cr_reversals` | INSERT (if upheld, committed) | reversal review |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/objections` | Raise objection (in-flight or committed) |
| GET | `/api/v1/objections/queue` | Grievance Officer queue |
| POST | `/api/v1/objections/{id}/resolve` | Uphold/dismiss with comment |

**UI Behavior Notes:** "Object to this change" action on the data subject's notice/history; Grievance Officer queue with case detail, evidence, and uphold/dismiss; outcome notification to the subject.

**Edge Cases:** Objection after commit and after payroll (routes to reversal + M10 recovery); duplicate objections (merged); objection on a legitimately self-initiated change (dismissed with explanation); representative objection (authorisation verified).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ObjectionForm`, `GrievanceQueue`, `ObjectionCaseDetail`. |
| Backend-Service Flow | `ObjectionService.raise()` → PAUSE (in-flight) or REVERSAL_REQUESTED (committed) → assign Grievance Officer → `resolve()` → pause/reverse/dismiss. |
| Data Operations | INSERT/UPDATE cr_objections; UPDATE change_requests.status; INSERT cr_reversals if upheld; audit + chain + notify. |
| Validation Logic | Ownership/representative; in-flight vs committed effect; resolution comment mandatory. |
| Authorization Logic | Raise: data subject; resolve: Grievance Officer capability. |
| State Changes & Side Effects | `→OBJECTED`; credit hold; reversal trigger; SLA pause. |
| Failure Handling | Illegal state (already terminal) → CONFLICT with guidance. |
| Dependencies & Reuse | Notice (017), reversal (020), SLA (007), notifications. |
| Test Guidance | In-flight pause; committed→reversal; window-credit hold; dismiss with reason; representative auth; outcome notice. |

---

### FR-M02-022 — Downstream Retro-Impact Reconciliation (M10/M11/M06) ★ NEW (Imp 9 / R7)

- **Module:** M02-EPDM
- **Primary Role(s):** System; HR Admin (reconciliation)
- **User Story:** *As HR governance, I want every retro-impacting correction to actually trigger and confirm pay/pension/seniority recomputation downstream — tracked, retried and reconciled — so that the disputes M02 exists to prevent are actually closed.*

**Description:** Replaces v1's fire-and-forget `governed-field-changed` event with a **tracked, acknowledged, reconciled** loop with the same rigor as SR posting. On commit of a retro-impacting item (catalog `retro_targets`), M02 emits one `retro_impact_events` row per target module (M10 payroll, M11 pension, M06 seniority), each idempotent, retried with backoff, dead-lettered on persistent failure, and **reconciled** until the downstream module returns an acknowledgement (`ACKED`). Reversals emit reversing retro events.

**Acceptance Criteria:**
1. On commit of an item whose catalog has `retro_targets`, one `retro_impact_events` row per target is created (`PENDING`) after `COMMITTED` (corrected sequence, R15).
2. Each event is dispatched idempotently (`item_id + ':RETRO:' + module`) and transitions `SENT`→`ACKED` on downstream acknowledgement.
3. Persistent failure → `DEAD_LETTER` + HR alert + appears in the retro-reconciliation report (FR-016).
4. A retro event is not considered closed until `ACKED`; the reconciliation report lists any non-ACKED event.
5. Reversals (FR-020) emit reversing retro events to undo the recomputation.

**Business Rules:**
- BR1: Retro tracking never blocks the `COMMITTED` state (R15); it is reported and reconciled separately.
- BR2: Idempotency guarantees no double recomputation.
- BR3: Effective date drives the recomputation period passed downstream.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `retro_impact_events` | INSERT/UPDATE | target_module, status, ack_reference, attempts |
| `change_request_items` | UPDATE | retro_status |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `RetroService.emit(item)` | Triggered post-commit |
| POST | `/api/v1/retro-events/{id}/ack` | ★ Downstream module acknowledges (M10/M11/M06) |
| POST | `/api/v1/retro-events/{id}/retry` | Manual retry (HR Admin) |
| GET | `/api/v1/reports/retro-reconciliation` | Unacked/dead-letter events |

**UI Behavior Notes:** Retro status chip per item (Pending / Sent / Acked / Failed); HR retro-reconciliation dashboard with retry and dead-letter triage; downstream module ack reference shown.

**Edge Cases:** Downstream module down (queue + retry, PENDING); duplicate emit (idempotent); ack for an unknown event (rejected, logged); reversing retro after the original was already ACKED (compensating event).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RetroStatusChip`, `RetroReconciliationDashboard`. |
| Backend-Service Flow | `RetroService.emit()`: build payload per target → dispatch idempotently → await `ack()` → `ACKED`; retry/backoff/dead-letter; `emitReversing()` for FR-020. |
| Data Operations | INSERT retro_impact_events; UPDATE retro_status; audit + chain. |
| Validation Logic | retro_targets present; idempotency; ack matching. |
| Authorization Logic | System-triggered; ack: downstream module service identity; retry: HR Admin. |
| State Changes & Side Effects | `PENDING→SENT→ACKED` or `FAILED→DEAD_LETTER`; reversing events. |
| Failure Handling | Retry w/ backoff + dead-letter; reconciliation report; never drops. |
| Dependencies & Reuse | Commit (010), reversal (020), M10/M11/M06 consumers, M14. |
| Test Guidance | Per-target emit after commit; idempotent dispatch; ack→ACKED; dead-letter; reconciliation listing; reversing retro. |

---

### FR-M02-023 — Requester Step-Up Authentication for Sensitive Self-Service ★ NEW (Imp 6 / R16)

- **Module:** M02-EPDM
- **Primary Role(s):** Employee (Self-Service)
- **User Story:** *As the platform, I want a fresh step-up re-authentication before an employee initiates a HIGH/STATUTORY self-service change, so that a hijacked session cannot silently start a sensitive change.*

**Description:** Before a self-service requester can submit a HIGH/STATUTORY change, M02 **invokes the platform step-up challenge** (MFA TOTP/push, WebAuthn, or OTP) and records a `cr_step_up_events` row with method, assurance level and a short validity window. Submission of a sensitive self-service request requires a valid, unexpired `SUCCESS` step-up bound to the request. Independent of approver e-sign (a different control at a different stage).

**Acceptance Criteria:**
1. Initiating a HIGH/STATUTORY self-service request triggers a step-up challenge.
2. A successful step-up creates a `cr_step_up_events.SUCCESS` row with `auth_assurance_level` (e.g. AAL2) and `expires_at`.
3. Submission without a valid, unexpired, request-bound step-up is rejected (`STEP_UP_REQUIRED`).
4. Failed step-ups are recorded and do not permit submission.
5. Step-up is required at initiation regardless of, and in addition to, any approver e-signature.

**Business Rules:**
- BR1: Step-up validity window is short and configurable (default 10 minutes).
- BR2: Step-up applies to self-service only; HR-on-behalf uses HR controls + data-subject notice instead.
- BR3: Step-up events are append-only and auditable.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_step_up_events` | INSERT | method, result, assurance, expires_at |
| `change_requests` | UPDATE | step_up_event_id |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/step-up/challenge` | Initiate challenge |
| POST | `/api/v1/change-requests/{id}/step-up/verify` | Verify challenge result |

**UI Behavior Notes:** Step-up modal (method per platform policy) shown when a sensitive field is added or at submit; clear "Confirm it's you to continue" prompt; expired step-up re-challenges automatically.

**Edge Cases:** Step-up provider down (block submission, retry; UPSTREAM_UNAVAILABLE); step-up expires before submit (re-challenge); user abandons step-up (request stays DRAFT); HR-on-behalf path (no step-up; uses notice instead).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `StepUpModal`; auto re-challenge on expiry. |
| Backend-Service Flow | `StepUpService.challenge()/verify()` via platform auth → persist `cr_step_up_events` → bind to CR → gate submit (FR-001 AC7). |
| Data Operations | INSERT cr_step_up_events; UPDATE change_requests.step_up_event_id; audit. |
| Validation Logic | Method per policy; assurance level; expiry; request binding. |
| Authorization Logic | Self requester only; sensitive tiers only. |
| State Changes & Side Effects | Enables submit for sensitive self-service. |
| Failure Handling | Provider down → block + retry; failed/expired → re-challenge. |
| Dependencies & Reuse | Platform auth/step-up; authoring (001). |
| Test Guidance | Challenge on sensitive; submit blocked without valid step-up; expiry re-challenge; provider down; HR-on-behalf skips step-up. |

---

## 7. UI Requirements

### 7.1 Key screens

| Screen | Primary role(s) | Purpose |
|---|---|---|
| My Requests (list) | Employee/HR | Track own/initiated requests with status, SLA, action-needed, risk flags |
| New Request / Template Gallery | Employee/HR | Start a request (blank or from template); HR-only fields shown as HR-assisted |
| Change Request Editor | Employee/HR | Field picker, before/after diff rows, reason, effective date, clear-field, document attach, step-up |
| Review & Submit | Employee/HR | Final diff summary + computed route + fraud/elevated badges |
| Approval Workspace | Approvers | Task queue + diff + evidence + risk panel + decision bar + strong e-sign |
| Document & Authority-Portal Verify Panel | HR/authority | Verify/reject evidence + portal verification beside the diff |
| Data-Subject Notice & Objection | Employee | Confirm/object to a change to own record; objection window countdown |
| Grievance Queue | Grievance Officer | Triage and resolve objections |
| Fraud-Review Queue | Fraud Reviewer | Clear/confirm/escalate risk signals |
| Emergency Reversal (Break-Glass) | HR + dual authority | Initiate + dual-authorise a reversal |
| Bulk Correction Wizard | HR | Upload, validate, review, approve batch (P3) |
| Configuration Console | System Admin | Field sensitivity, approval matrix, e-sign policy, regex safety |
| Delegation Manager | Approvers/Admin | Create/revoke role-independent delegations (P3) |
| Field History & Reports | Auditor/HR/Employee | Provenance timelines, audit-integrity tile, exportable reports |
| SR & Retro Reconciliation Dashboard | SR Custodian/HR | Unposted/failed statutory + unacked retro events |

### 7.2 UX standards

- **Mandatory states for every data surface:** empty, loading, error, success, permission-denied, offline. No skeleton-only screens.
- **Accessibility:** WCAG 2.1 AA — keyboard navigable, focus-visible, ARIA labels, AA contrast, screen-reader-friendly diff (announces "old/new" and "cleared").
- **Responsive & mobile-first:** collapsible sidebar with hamburger toggle; approval, confirm/object, and step-up usable on mobile.
- **Sensitive-value masking** by default with audited reveal (vault detokenise) for authorized roles; Aadhaar shown last-4 only.
- **Inline validation** mapping to the API error envelope `field`.
- **Status & risk semantics:** consistent color/iconography for statuses, SLA, and risk band (green/amber/red).
- **i18n & locale:** `DD-MMM-YYYY` dates, INR formatting, translatable labels; UTC stored.
- **Confirmation & legal notices:** destructive/irreversible actions (reject, withdraw, activate matrix, break-glass reversal) require explicit confirmation; e-sign and break-glass actions show a legal/break-glass notice.
- **Out-of-band & step-up cues:** clear "confirm it's you" step-up and "a change was made to your record" data-subject prompts.
- **Toasts & notifications** for async outcomes (submit, decision, commit, SR posting, retro ack, reversal).

### 7.3 Notable component behaviors

- Diff cards render typed values, character/segment highlights, and a cleared-field indicator; multi-line/JSON use structured diff.
- Approval queue shows SLA countdown, sensitivity, and risk badges; overdue + high-risk filters.
- Fraud-signal panel lists signals with evidence (e.g., linked employees for a shared bank account).
- Bulk validation grid filters valid/invalid with inline reasons, portal-required and non-ACTIVE flags, downloadable report.
- Matrix builder supports drag-ordered levels, parallel grouping, role pickers, status-scope, e-sign-method policy, and a regex-safety tester with pre-activation validation.
- Audit-integrity tile shows last chain-verification time and any detected break.

---

## 8. API & Integration

### 8.1 Conventions

- Base path `/api/v1`; JSON; JWT bearer auth; RBAC + row-level scope enforced server-side; step-up tokens honored for sensitive initiation.
- All list endpoints paginated (`?page=&limit=` or cursor), hard max `limit = 100`.
- Idempotency: commit/post/retro/reversal operations accept/honor idempotency keys (§16.3).
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
| `VALIDATION_ERROR` | 400 | Bad field format, effective-date/range violation, missing required field, null new_value without clear_intent |
| `AUTH_REQUIRED` | 401 | Missing/expired token |
| `FORBIDDEN` | 403 | Ownership/scope/permission violation |
| `NOT_FOUND` | 404 | Unknown request/template/field/batch/objection/reversal |
| `CONFLICT` | 409 | Stale value, duplicate open change, illegal transition, double-decision |
| `RATE_LIMITED` | 429 | Throttle exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error / invalid config fallback |
| `UPSTREAM_UNAVAILABLE` | 503 | M01/M12/M13/e-sign/step-up/authority-portal/calendar provider unavailable |
| `DOCUMENT_REQUIRED` | 422 | Required evidence missing/unverified at approval |
| `AUTHORITY_VERIFICATION_REQUIRED` | 422 | ★ Portal verification (caste/Aadhaar/PAN) missing/failed |
| `ESIGN_REQUIRED` | 422 | Decision on sensitive node without e-signature |
| `ESIGN_METHOD_NOT_ALLOWED` | 422 | ★ Weak/OTP e-sign attempted on FINANCIAL/STATUTORY |
| `STEP_UP_REQUIRED` | 401 | ★ Sensitive self-service initiation without valid step-up |
| `STATUS_GATE_BLOCKED` | 403 | ★ Change blocked/elevated by employment_status gate |
| `STATUTORY_HARD_BLOCK` | 422 | ★ DOB (or rule-bound) alteration barred; use legal process |
| `RISK_BLOCKED` | 423 | ★ Request held by fraud engine pending review |
| `STALE_MASTER_VALUE` | 409 | `old_value_hash` ≠ current M01 value at commit |
| `SR_POSTING_FAILED` | 502 | M12 rejected/failed statutory posting |
| `RETRO_ACK_FAILED` | 502 | ★ Downstream (M10/M11/M06) retro acknowledgement failed |
| `REVERSAL_DUAL_AUTH_REQUIRED` | 422 | ★ Break-glass reversal lacks two distinct authorisers |
| `SOD_VIOLATION` | 403 | Maker/target/single-authoriser attempting to approve/authorise |

### 8.4 Endpoint catalog (selected)

| Method | Path | FR |
|---|---|---|
| POST | `/api/v1/change-requests` | 001/014 |
| POST | `/api/v1/change-requests/{id}/step-up/challenge` | 023 |
| POST | `/api/v1/change-requests/{id}/submit` | 001/002 |
| GET | `/api/v1/change-requests/{id}/diff` | 005 |
| POST | `/api/v1/change-requests/{id}/documents/{docId}/authority-verify` | 003 |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/decide` | 004 |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/esign` | 015 |
| GET | `/api/v1/change-requests/{id}/notice` | 017 |
| POST | `/api/v1/objections` | 021 |
| GET | `/api/v1/fraud/queue` | 019 |
| POST | `/api/v1/change-requests/{id}/items/{itemId}/reversal` | 020 |
| POST | `/api/v1/retro-events/{id}/ack` | 022 |
| POST | `/api/v1/audit/verify-chain` | 016 |
| GET | `/api/v1/employees/{id}/field-history` | 016 |

### 8.5 JSON examples

**(1) Create change request (composite name + clear middle name) — `POST /api/v1/change-requests`**

```json
// Request
{
  "targetEmployeeId": "emp-045",
  "changeType": "CORRECTION",
  "effectiveDate": "1990-05-12",
  "reason": "Name recorded incorrectly at joining; gazette correction issued.",
  "stepUpEventId": "su-01",
  "items": [
    { "fieldKey": "first_name", "m01FieldKey": "employees.first_name", "newValue": "Anita" },
    { "fieldKey": "middle_name", "m01FieldKey": "employees.middle_name", "newValue": null, "clearIntent": true }
  ]
}
// Response 201
{
  "changeRequestId": "7a1e02",
  "crNumber": "CR-2026-000124",
  "status": "PENDING_DOCS",
  "highestSensitivity": "STATUTORY",
  "riskBand": "LOW",
  "routePreview": [
    { "levelNo": 1, "nodeType": "VERIFY", "requiredRole": "HR_OFFICER", "slaHours": 48 },
    { "levelNo": 2, "nodeType": "SANCTION", "requiredRole": "DEPT_HEAD", "slaHours": 72, "requiresEsignature": true, "allowedEsignMethods": ["PKI_DSC","AADHAAR_ESIGN"] }
  ],
  "requestId": "req_001"
}
```

**(2) Approve a sensitive node — weak e-sign rejected**

```json
// Request
{ "decision": "APPROVED", "comment": "Gazette + birth certificate verified.", "esignatureId": "es-otp-99" }
// Error 422 (weak method on STATUTORY)
{ "error": { "code": "ESIGN_METHOD_NOT_ALLOWED", "message": "STATUTORY sanction requires PKI/DSC or Aadhaar e-Sign; OTP is not permitted.", "field": "esignatureId" }, "requestId": "req_015" }
```

**(3) Step-up required on sensitive self-service — `POST /submit`**

```json
{ "error": { "code": "STEP_UP_REQUIRED", "message": "Confirm it's you (step-up authentication) to submit a STATUTORY change.", "field": "stepUpEventId" }, "requestId": "req_023" }
```

**(4) Employment-status gate block — `POST /change-requests` (self-service on RETIRED)**

```json
{ "error": { "code": "STATUS_GATE_BLOCKED", "message": "This record is RETIRED; bank changes require HR with Appointing-Authority sanction.", "field": "employmentStatus" }, "requestId": "req_018" }
```

**(5) Data-subject notice — `GET /change-requests/{id}/notice`**

```json
{
  "noticeId": "dsn-01", "targetEmployeeId": "emp-077", "triggerOrigin": "HR_ON_BEHALF",
  "channel": "SMS", "deliveryStatus": "DELIVERED",
  "objectionWindowEndsAt": "2026-07-02T00:00:00Z", "outcome": "AWAITING",
  "creditHeld": true, "requestId": "req_017"
}
```

**(6) DOB statutory hard-block — `GET /hard-block-check?fieldKey=dob`**

```json
{ "error": { "code": "STATUTORY_HARD_BLOCK", "message": "DOB alteration is barred within 5 years of superannuation; a separate legal process is required.", "field": "dob" }, "requestId": "req_008b" }
```

**(7) Fraud-blocked request — duplicate bank account (mule)**

```json
{ "error": { "code": "RISK_BLOCKED", "message": "This bank account is already used by 2 other employees; held for fraud review.", "field": "bank_account_no" },
  "signals": [ { "signalType": "DUPLICATE_BANK_ACCOUNT", "severity": "HIGH", "linkedEmployees": ["emp-201","emp-318"] } ],
  "requestId": "req_019" }
```

**(8) Retro reconciliation — `GET /reports/retro-reconciliation`**

```json
{ "data": [ { "retroEventId": "re-02", "itemId": "it-002", "targetModule": "M06", "status": "PENDING", "attempts": 3, "effectiveDate": "1990-05-12" } ],
  "page": 1, "limit": 50, "total": 1, "requestId": "req_022" }
```

**(9) Field history — `GET /employees/{id}/field-history?fieldKey=dob`**

```json
{
  "data": [
    {
      "fieldKey": "dob", "m01FieldKey": "employees.dob", "oldValue": "1990-05-21", "newValue": "1990-05-12",
      "changeType": "CORRECTION", "effectiveDate": "1990-05-12", "recordedAt": "2026-06-28T10:20:00Z",
      "crNumber": "CR-2026-000124",
      "authority": [ {"role":"HR_OFFICER","action":"VERIFY"}, {"role":"DEPT_HEAD","action":"SANCTION","esign":"PKI_DSC"} ],
      "documents": ["GAZETTE_NOTIFICATION","BIRTH_CERTIFICATE"], "srStatus": "POSTED", "retroStatus": {"M11":"ACKED","M06":"PENDING"},
      "auditChainVerified": true
    }
  ],
  "page": 1, "limit": 50, "total": 1, "requestId": "req_030"
}
```

### 8.6 External integrations

| System | Direction | Contract |
|---|---|---|
| M01 Employee Master | M02↔M01 | Read field/value/version + `employment_status`; **effective-dated** transactional commit `PATCH /employees/{id}:commit` (idempotent, version token) ★ |
| M12 Digital SR | M02→M12 | Idempotent `postServiceRegisterEvent(eventType, employeeId, payload, sourceRef)` incl. **reversing events** ★ |
| M13 Document Mgmt | M02↔M13 | Upload ref, scan-status, reference, export-artefact store |
| Authority-verification providers | M02→ | ★ UIDAI (Aadhaar), Income-Tax (PAN), caste-certificate portal verify + reference |
| M10 Payroll / M11 Pension / M06 Seniority | M02↔ (event + ack) | ★ Emits `governed-field-changed`/retro event; consumer **acknowledges** (`/retro-events/{id}/ack`); reversing events on FR-020 |
| M06 Promotion | M02→ | ★ Promotion-eligibility freeze flag on caste/category verification |
| Shared workflow engine | M02↔ | Create instance/tasks, complete tasks, reassign |
| E-Sign provider(s) | M02→ | ★ PKI/DSC, Aadhaar e-Sign, OTP (no password re-auth); method policy enforced |
| Platform step-up / MFA | M02→ | ★ Step-up challenge/verify for sensitive self-service initiation |
| Data vault / KMS | M02↔ | ★ Aadhaar tokenisation, field-level keys, rotation, crypto-shred |
| Notification platform | M02→ | Email/SMS/postal/in-app via `notifications`, incl. out-of-band data-subject notice |
| Business-calendar service | M02→ | SLA computation (calendar-day fallback for P1) |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 < 500 ms for CRUD/list/diff endpoints; commit + SR + retro posting async ≤ 30 s P95; risk evaluation ≤ 2 s P95; bulk validate streams progress for files up to 50k rows (P3) |
| Scalability | Horizontal scaling; queue-based commit/SR/retro/reversal workers; pagination max 100 |
| Availability | 99.9% uptime; graceful degradation when M01/M12/M13/portal/step-up unavailable (queue + retry, never lose requests); status/step-up gates fail **closed** |
| Reliability | RPO ≤ 15 min, RTO ≤ 4 h; idempotent commit/posting/retro/reversal; dead-letter queues with reconciliation |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest for sensitive `change_request_items` columns (field-level KMS keys, rotation); Aadhaar tokenised in vault, never raw; JWT + RBAC + row-level scope; **step-up for sensitive initiation**; SoD enforced in DB + service; strong e-sign methods only for FINANCIAL/STATUTORY; ReDoS-guarded admin regex |
| Privacy (DPDP) | DPDP Act 2023 alignment; legal-basis + 7-year retention-override statement (§4.4); PII minimisation; sensitive values masked by role; crypto-shred erasure preserving provenance shell; never log raw sensitive old/new values |
| Auditability (tamper-evident) | Every transition + committed change + sensitive reveal + config change + reversal anchored in the **hash-chained, WORM `cr_audit_chain`** (E18) and hash-chained `esignatures`; scheduled + on-demand integrity verification with alarm on break |
| Fraud resilience | Risk scoring on sensitive requests; mule/velocity/pre-payroll/pre-exit/auth-then-financial detection; high-risk held for review; confirmed fraud rejected + alerted |
| Data-subject rights | Out-of-band notice on third-party-initiated changes; objection/grievance path; financial credit held during objection window |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Structured logs (no PII), metrics (SLA breaches, commit/SR/retro failures, risk hits, chain-break), traceId per request |
| Retention | Requests + audit retained per statutory schedule (default 7 years post-separation, configurable) |
| Compatibility | REST `/api/v1`; backward-compatible versioning; documented contracts for M01/M12/M13/M10/M11/M06 |
| Localization | UTC storage; locale display; INR; translatable UI strings |

---

## 10. Workflow & State Diagrams

### 10.1 Change request lifecycle (state table)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create draft | `DRAFT` | authorized requester; status-gate ALLOW/ELEVATE |
| `DRAFT` | submit (sensitive self-service) | `SUBMITTED`/`PENDING_DOCS` | valid step-up (FR-023), route built |
| `DRAFT` | submit (HR_ON_BEHALF/BULK) | `NOTICE_HOLD` | data-subject notice dispatched (FR-017) |
| `NOTICE_HOLD` | window elapsed / confirmed | `SUBMITTED`/`IN_REVIEW` | notice resolved, no objection |
| `NOTICE_HOLD` | data subject objects | `OBJECTED` | objection raised (FR-021) |
| `DRAFT` | submit (docs/portal needed) | `PENDING_DOCS` | required docs/portal not yet verified |
| `PENDING_DOCS` | all docs+portal verified | `IN_REVIEW` | VERIFIED+CLEAN (+portal VERIFIED) |
| `SUBMITTED` | first node opened | `IN_REVIEW` | route has nodes |
| `SUBMITTED` | auto-apply (LOW, non-auth-bearing) | `APPROVED` | auto_apply_on_low, no docs, not auth-bearing |
| `IN_REVIEW` | node approved (more left) | `IN_REVIEW` | next node pending |
| `IN_REVIEW` | all nodes approved | `APPROVED` | route complete + strong e-sign where required + fraud cleared |
| `IN_REVIEW`/`PENDING_DOCS`/`NOTICE_HOLD` | return | `RETURNED` | approver/verifier, comment |
| `IN_REVIEW`/`PENDING_DOCS` | reject | `REJECTED` | approver, comment |
| any non-terminal | fraud confirmed | `REJECTED` | CONFIRMED_FRAUD (FR-019) |
| `OBJECTED` | objection dismissed | `IN_REVIEW`/prior | Grievance Officer dismisses (FR-021) |
| `OBJECTED` | objection upheld (in-flight) | `REJECTED`/`RETURNED` | per resolution |
| `RETURNED` | resubmit | `SUBMITTED` | requester fixes, re-gate + re-route |
| non-terminal | withdraw | `WITHDRAWN` | requester owns |
| `APPROVED` | commit success | `COMMITTED` | hashes valid, M01 applied (effective-dated) |
| `APPROVED` | commit fail (M01 down) | `COMMIT_FAILED` | upstream error |
| `APPROVED` | stale at commit | `RETURNED` | hash mismatch |
| `COMMIT_FAILED` | retry success | `COMMITTED` | M01 available |
| `COMMITTED` (multi-item, some failed) | partial | `PARTIALLY_COMMITTED` | some items FAILED |
| `COMMITTED` | break-glass reversal executed | `REVERSED` | dual-auth reversal (FR-020) |

### 10.2 Item-level states & corrected post-commit sequence (R15)

`PENDING → APPROVED → COMMITTED` (happy path); `PENDING → REJECTED`; commit failure → `FAILED`; `COMMITTED → REVERSED` (FR-020).
**Corrected canonical sequence:** **M01 commit → item `COMMITTED` → (statutory) SR `PENDING`→`POSTED/FAILED` and (retro) retro `PENDING`→`ACKED/FAILED`.** SR posting and retro acknowledgement are tracked separately and **never** block `COMMITTED`. *(This resolves the v1 rule-11-vs-FR-010 contradiction.)*

### 10.3 Approval node states

`PENDING → APPROVED | REJECTED | RETURNED | SKIPPED(any-one parallel / escalation)`. Terminal nodes are immutable (append-only, hash-chained).

### 10.4 Distributed commit (saga/outbox) note

When M01 is a separate service, commit uses the **outbox pattern**: M02 records intent in an outbox within its own transaction, a worker invokes M01 `PATCH /employees/{id}:commit` idempotently (effective-dated), and on confirmation marks items `COMMITTED` and enqueues SR posting and retro events. Failure triggers compensation (no partial visible commit) and retry; persistent failure → `COMMIT_FAILED` with alert.

### 10.5 SLA state overlay

Each active node carries an SLA timer: `SLA_SET → (REMINDER_SENT)* → BREACHED → ESCALATED → (REASSIGNED)`. Timers pause in `RETURNED`/`PENDING_DOCS(scan/portal pending)`/`NOTICE_HOLD`/`OBJECTED`.

### 10.6 Employment-status gate overlay (FR-018)

At submit, `employment_status_at_submit` drives: `ACTIVE`→standard; `ON_LEAVE`→standard (configurable elevate); `SUSPENDED`/`TERMINATED`→elevated authority + justification; `RETIRED`→elevated (terminal-benefit controls); `DECEASED`→family-pension controlled path (Appointing Authority + enhanced evidence, dual control on financial). Self-service is blocked for all non-ACTIVE.

### 10.7 Reversal (break-glass) overlay (FR-020)

`COMMITTED item → reversal raised → auth1 → auth2 (distinct, ≠ maker) → execute (M01 restore, effective-dated) → item REVERSED → reversing SR (statutory) + reversing retro (M10/M11/M06)`. Idempotent; security-report logged.

---

## 11. Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Request submitted | Requester (confirm), first approver | In-app + Email | `cr.submitted` |
| Docs / authority-portal required or rejected | Requester | In-app + Email | `cr.docs.needed` |
| **Out-of-band data-subject notice (HR/BULK)** ★ | Data subject (out-of-band channel) | SMS/Email/Postal/In-app | `cr.datasubject.notice` |
| **Auth-bearing contact change — OLD value alert** ★ | OLD phone/email holder | SMS/Email | `cr.contact.oldalert` |
| Awaiting your approval | Current node approver / delegate | In-app + Email | `cr.task.assigned` |
| SLA reminder (50%/90%) | Current approver | In-app + Email | `cr.sla.reminder` |
| SLA breach / escalation | Escalation role + HR Admin | In-app + Email | `cr.sla.escalated` |
| **High-risk held for fraud review** ★ | Fraud Reviewer, HR Admin | In-app + Email | `cr.fraud.review` |
| **Confirmed fraud** ★ | HR Admin, Security | In-app + Email | `cr.fraud.confirmed` |
| Approved & applied | Requester | In-app + Email | `cr.committed` |
| **FINANCIAL credit held (objection window)** ★ | Requester, HR | In-app | `cr.credit.held` |
| Returned for correction | Requester | In-app + Email | `cr.returned` |
| Rejected | Requester | In-app + Email | `cr.rejected` |
| **Objection raised / resolved** ★ | Data subject, Grievance Officer | In-app + Email | `cr.objection` |
| E-signature applied | Signer (receipt), Auditor log | In-app | `cr.esign.receipt` |
| Statutory change posted to SR | SR Custodian, HR Admin | In-app + Email | `cr.sr.posted` |
| SR posting failed | SR Custodian, HR Admin | In-app + Email | `cr.sr.failed` |
| **Retro event acked / failed / dead-letter** ★ | HR Admin | In-app + Email | `cr.retro.status` |
| **Emergency reversal executed** ★ | Data subject, HR Admin, SR Custodian, M10 | In-app + Email | `cr.reversal` |
| Commit failed | HR Admin | In-app + Email | `cr.commit.failed` |
| **Audit-chain integrity break** ★ | Auditor, HR Admin, System Admin | In-app + Email | `cr.audit.break` |
| Bulk batch validated/committed | Initiator, approver | In-app + Email | `cr.bulk.status` |
| Delegation created/expiring | Delegate, delegator | In-app + Email | `cr.delegation` |

All notifications write to the shared `notifications` ledger; preferences respected; never include raw sensitive values. Data-subject and old-channel alerts use an **out-of-band** channel distinct from the requester's session.

---

## 12. Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| Change request volume & cycle-time | HR Admin, M14 | Counts by status, sensitivity, field group; median/percentile turnaround |
| SLA compliance & escalations | HR Admin | % within SLA, breaches, escalations, aging buckets |
| Approver workload & delegation | HR Admin | Pending per approver/role; delegation usage |
| Rejection/return analysis | HR Admin | Top rejection reasons, fields, resubmission rates |
| Statutory SR reconciliation | SR Custodian | Committed STATUTORY items vs posted to M12; failures |
| **Retro-impact reconciliation** ★ | HR Admin, M10/M11/M06 | Retro events by status (PENDING/SENT/ACKED/FAILED/DEAD_LETTER); unacked aging |
| **Fraud & anomaly report** ★ | Fraud Reviewer, HR Admin | Signals by type/severity; mule clusters; pre-payroll/pre-exit spikes; review outcomes |
| **Data-subject rights report** ★ | HR Admin, DPO/Grievance | Notices delivered, objections raised/upheld/dismissed, window-held credits |
| **Privileged-action & SoD security report** ★ | Auditor, System Admin, Security | Config changes, delegations (incl. blocked ineligible attempts), break-glass reversals, SoD-violation attempts |
| **Audit-chain integrity report** ★ | Auditor, System Admin | Last verification, any chain breaks, e-sign chain status |
| Field-change provenance / audit | Auditor | Full who/what/when/authority/document per field (FR-016) |
| Bulk correction outcomes | HR Admin | Batch success/partial/fail, per-row error patterns |
| Data-quality impact | HR Admin, M14 | Corrections vs updates trend; high-correction fields |

Reports are filterable, paginated, role-scoped, masked, and exportable (CSV/PDF). Aggregates feed the M14 Dashboard module.

---

## 13. Migration & Launch

### 13.1 Data migration

- Seed `field_sensitivity_catalog` from the **M01 governed-field registry (§5.8)** with `m01_field_key` bound; classify per the v2 security-hardened seed (auth-bearing contacts MEDIUM; Aadhaar/PAN/category HR-only + portal; DOB hard-block; dignity-aware gender path).
- Seed a default global `approval_matrix_config` (ACTIVE) + rules incl. `employment_status_scope` elevated routes.
- Seed e-sign method policy (strong-only for FINANCIAL/STATUTORY) and ReDoS-safe regex limits.
- Initialise the `cr_audit_chain` genesis anchor.
- Import in-flight legacy change requests as historical/closed records (no re-approval) with provenance preserved.
- Backfill `documents` references via M13.

### 13.2 Cutover

1. Deploy schema (E1–E19) + config seed; **verify M01 `:commit` effective-dated contract, M12 reversing-event, M13 scan, authority-portal, step-up and retro-ack contracts in staging (Build-Gate Register §14.5)**.
2. Freeze direct master edits; route all governed-field changes through M02.
3. Pilot with one org unit (self-service contact fields only — with auth-bearing reclassification + old-channel alert), then expand sensitivity tiers.
4. Enable statutory, bulk, delegation, templates only after pilot sign-off and gate clearance.

### 13.3 Rollout phasing (re-phased — Improvement 22)

| Phase | Scope |
|---|---|
| **P1** | LOW/MEDIUM contact & demographic fields (auth-bearing reclassification, old-channel alert), single-level approval, **employment-status gating (FR-018), data-subject notice (FR-017), tamper-evident audit (E18), step-up (FR-023)** — security hardening first |
| **P2** | HIGH fields (bank, qualification) + documents + **strong e-sign policy (FR-015)** + **fraud signals (FR-019)** + **emergency reversal (FR-020)** + **data-subject grievance (FR-021)** + FINANCIAL objection-window hold |
| **P3** | STATUTORY fields + SR posting (FR-011) + **retro reconciliation (FR-022)** + senior sanction + DOB hard-block/caste/gender (FR-008) + authority-portal verification (FR-003) |
| **P4** | Convenience/scale: **templates (FR-014), delegation (FR-013), bulk corrections incl. 50k async (FR-009), "any-one" parallel topology** |

*Rationale:* security and data-subject controls land before convenience/scale features (R20); statutory and downstream-loop features land with their hard-gated dependencies (R4/R8).

### 13.4 Launch readiness

Acceptance/E2E tests green; SoD + dual-auth + status-gate constraints verified in DB; **M01 `:commit` (effective-dated) + M12 + M13 + authority-portal + step-up + retro-ack contracts VERIFIED in staging (§14.5)**; SR + retro reconciliation reports empty; audit-chain integrity verifier green; rollback plan (disable M02 write path, revert to controlled HR edit with audit) documented; training for HR/approvers/grievance/fraud reviewers; runbooks for commit-failure, SR-posting-failure, retro-dead-letter, fraud-queue and break-glass.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 FR → Entities → APIs traceability matrix

| FR | Primary entities | Key APIs | Depends on | Downstream |
|---|---|---|---|---|
| FR-M02-001 | change_requests, change_request_items | POST /change-requests, /submit | 002,003,017,018,019,023 | 004 |
| FR-M02-002 | approval_matrix_*, field_sensitivity_catalog, change_request_approvals | /route-preview | 012,018,019 | 004,001 |
| FR-M02-003 | change_request_documents, documents(M13) | /documents, /verify, /authority-verify | M13, authority portals | 004,008 |
| FR-M02-004 | change_request_approvals, workflow_tasks, cr_audit_chain | /approvals/{node}/decide, /queue | 002,013,015,019 | 006,010 |
| FR-M02-005 | change_request_items | /diff | 001 | 004,016 |
| FR-M02-006 | change_requests, change_request_approvals | /withdraw, /resubmit | 004,021 | 002 |
| FR-M02-007 | cr_sla_events, workflow_tasks | /sla, scheduler | 002,012,017 | 011 |
| FR-M02-008 | change_requests, change_request_items, retro_impact_events | /effective-date-rules, /hard-block-check | catalog,003 | 010,011,022,M06 |
| FR-M02-009 | bulk_correction_batches, change_requests, data_subject_notices | /bulk-corrections/* | 002,010,011,017,018,022,M13 | 010,011,022 |
| FR-M02-010 | change_request_items, employees(M01) | CommitService, /commit-status | 004,017,M01 | 011,022 |
| FR-M02-011 | change_request_items, service_register_events(M12), cr_reversals | SrPosting, /sr-status, /sr-retry | 010,020,M12 | 016 |
| FR-M02-012 | field_sensitivity_catalog, approval_matrix_* | /admin/*, /validation-regex/test | RBAC,M12 types | 002,015 |
| FR-M02-013 | delegations, change_request_approvals | /delegations | RBAC | 004,007 |
| FR-M02-014 | change_request_templates, change_requests | /change-request-templates | 012 | 001 |
| FR-M02-015 | esignatures, change_request_approvals | /esign | 004,012,provider | 011 |
| FR-M02-016 | all change_request_*, esignatures, cr_audit_chain, retro_impact_events, audit_log | /field-history, /reports/*, /audit/verify-chain | all | M14 |
| FR-M02-017 | data_subject_notices, change_requests, notifications | /notice, /notice/confirm, /notice/object | 001,009 | 010,021 |
| FR-M02-018 | change_requests, employees(M01), approval_matrix_rules | /status-gate | M01 | 002,010 |
| FR-M02-019 | cr_risk_signals, change_requests | /fraud/queue, /risk, /risk/{id}/review | 001 | 002,004,010 |
| FR-M02-020 | cr_reversals, change_request_items, service_register_events(M12) | /items/{id}/reversal, /reversals/{id}/authorize | 010,011,022,M01,M12 | 011,022 |
| FR-M02-021 | cr_objections, change_requests, cr_reversals | /objections, /objections/{id}/resolve | 017 | 006,020 |
| FR-M02-022 | retro_impact_events, change_request_items | RetroService, /retro-events/{id}/ack, /retry | 010,020,M10/M11/M06 | 016 |
| FR-M02-023 | cr_step_up_events, change_requests | /step-up/challenge, /step-up/verify | platform step-up | 001 |

### 14.2 Dependency on other modules

| Module | Nature | Direction |
|---|---|---|
| M01 Employee Master | Read field values + status; effective-dated commit `:commit` | M02↔M01 |
| M12 Digital SR | Post statutory + reversing change events | M02→M12 |
| M13 Document Mgmt | Store/reference/scan evidence + exports | M02↔M13 |
| Authority portals (UIDAI/PAN/caste) | Verify identity/caste evidence | M02→external |
| M10/M11/M06 | Consume + **acknowledge** retro-impact events; M06 promotion freeze | M02↔M10/M11/M06 |
| M14 Dashboard | Consume analytics | M02→M14 |
| Shared workflow engine | Routing/tasks/SLA | M02↔shared |
| Platform (auth, step-up, notifications, audit, KMS/vault) | Identity, step-up, notify, audit, tokenisation | M02↔platform |

### 14.3 Parallel-agent build plan (re-ordered — security first)

| Workstream | FRs | Can parallelize after |
|---|---|---|
| A — Data & config foundation | 012, schema (E1–E19), seeds, audit-chain genesis | first |
| B — Authoring, diff & step-up | 001, 005, 023 | A |
| C — Routing, approval & status gate | 002, 004, 018 | A |
| D — Evidence, authority-portal & e-sign | 003, 015 | A |
| E — Data-subject rights & fraud | 017, 019, 021 | B, C |
| F — Lifecycle & SLA | 006, 007, 008 | C |
| G — Commit, SR, retro & reversal | 010, 011, 022, 020 | C, **M01 `:commit` + M12 + retro-ack gates VERIFIED (§14.5)** |
| H — Convenience/scale (P4) | 009, 013, 014 | G |
| I — History, reporting & audit-integrity | 016 | B–G |

### 14.4 Dependency Register (recast from v1 "0 gaps" — Improvement 11 / R8)

States: **AGREED** (contract agreed in prose) · **IMPLEMENTED** (producer built) · **VERIFIED** (validated end-to-end in staging). v1's "Resolved/0 gaps" claim is replaced by this honest register. **No BRD-specification gaps remain (§14.6); build-time contract verification is tracked as gates, not asserted as done.**

| Contract surface | Producer | Consumer | State | Hard gate? |
|---|---|---|---|:--:|
| Editable-fields + current value/version/status | M01 | M02 (001/010/018) | AGREED → verify in staging | Yes (G) |
| **Effective-dated commit `PATCH /employees/{id}:commit` + version token + idempotency** | M01 | M02 (010) | AGREED (capability confirmed in M01 BRD) → **VERIFY before G** | **Yes (G) — R4** |
| `postServiceRegisterEvent` idempotent + reversing event | M12 | M02 (011/020) | AGREED → verify | Yes (G) |
| Document upload/scan/reference/export | M13 | M02 (003/009/016) | AGREED → verify | Yes (D) |
| Authority-portal verify (UIDAI/PAN/caste) | External | M02 (003/008) | AGREED → verify | Yes (D) |
| Retro-impact consumer **ack** endpoint | M10/M11/M06 | M02 (022) | AGREED → verify | Yes (G) |
| Promotion-eligibility freeze | M02→M06 | M06 (008) | AGREED → verify | No (P3) |
| Workflow instance/task/reassign | Shared engine | M02 (002/004/007) | AGREED → verify | Yes (C) |
| Platform step-up / MFA challenge | Platform | M02 (023) | AGREED → verify | Yes (B) |
| Data vault / KMS tokenisation + crypto-shred | Platform | M02 (§4.4) | AGREED → verify | Yes (A) |
| RBAC role keys for matrix + capabilities | Platform | M02 (012) | AGREED | No |
| Notification ledger (out-of-band) + templates | Platform | M02 (011/017) | AGREED → verify | No |
| Audit log + WORM/hash-chain anchoring | Platform/M02 | M02 (016) | AGREED → IMPLEMENTED in A | Yes (A) |
| E-sign provider capture/verify (strong methods) | External | M02 (015) | AGREED → verify | Yes (D) |
| Business-calendar service (SLA) | Platform | M02 (007) | AGREED (calendar-day fallback for P1) | No |
| Error envelope + codes | M02 | All clients | IMPLEMENTED | — |
| Sensitivity/route config immutability for in-flight | M02 | M02 (012) | IMPLEMENTED | — |
| SoD + dual-auth + status-gate DB constraints | M02 | M02 (§5.6) | IMPLEMENTED in A | Yes (A) |

### 14.5 Build-Gate Register (hard preconditions — R4/R8/R11)

| Gate | Condition to clear | Blocks | Owner |
|---|---|---|---|
| **G-M01-COMMIT** | M01 `PATCH /employees/{id}:commit` proven in staging with **effective-dated write + version token + idempotency** | Workstream G (commit, statutory, retro, reversal) | M01 + M02 |
| **G-FIELDKEY** | §5.8 field-key registry signed off against the live M01 schema | A, B, G | M01 + M02 |
| **G-M12-SR** | M12 idempotent posting + reversing event verified | 011, 020 | M12 + M02 |
| **G-RETRO-ACK** | M10/M11/M06 ack endpoint verified | 022 | M10/M11/M06 + M02 |
| **G-AUTH-PORTAL** | UIDAI/PAN/caste verify verified (or manual-attestation fallback agreed) | 003, 008 | Platform + M02 |
| **G-STEPUP/ESIGN** | Step-up + strong e-sign providers verified | 015, 023 | Platform + M02 |
| **G-AUDIT-WORM** | `cr_audit_chain` WORM + integrity verifier operational | A, 016 | M02 |

### 14.6 Final Contract Reconciliation Table (specification completeness — 0 unresolved gaps)

This table asserts **specification** completeness (every contract surface is defined and consumed). It does **not** assert that producers are built — that is tracked honestly in §14.4 (states) and §14.5 (hard gates). This is the v2 correction of v1's conflation.

| Contract surface | Producer | Consumer | Spec status |
|---|---|---|---|
| M01 read + effective-dated commit | M01 | M02 (001/010/018) | Specified (§8.6, §5.8) — gate G-M01-COMMIT |
| M12 statutory + reversing posting | M12 | M02 (011/020) | Specified (§8.6) — gate G-M12-SR |
| M13 document/scan/export | M13 | M02 (003/009/016) | Specified (§8.6) |
| Authority-portal verification | External | M02 (003/008) | Specified (§8.6) — gate G-AUTH-PORTAL |
| Retro-impact + ack | M10/M11/M06 | M02 (022) | Specified (§8.6) — gate G-RETRO-ACK |
| Step-up + strong e-sign | Platform/External | M02 (015/023) | Specified (§8.6) — gate G-STEPUP/ESIGN |
| Vault/KMS tokenisation + crypto-shred | Platform | M02 (§4.4) | Specified (§4.4) |
| Workflow engine | Shared | M02 (002/004/007) | Specified (§4.2) |
| Out-of-band notice + templates | Platform | M02 (017) | Specified (§11) |
| Tamper-evident audit (WORM + chain) | M02 | M02/Auditor (016) | Specified (§5.2 E18, §9) — gate G-AUDIT-WORM |
| Data-subject rights (notice/objection/grievance) | M02 | Employee/Grievance (017/021) | Specified (FR-017/021) |
| Fraud signalling | M02 | Fraud Reviewer (019) | Specified (FR-019) |
| Emergency reversal (dual-auth) | M02 | HR/authority (020) | Specified (FR-020) |
| SoD + dual-auth + status-gate constraints | M02 | M02 (§5.6) | Specified (§5.6) |
| Error envelope + codes | M02 | All clients | Specified (§8.2/8.3) |

**Unresolved specification gaps: 0.** **Open build-time hard gates: 7 (tracked in §14.5)** — these are *honest preconditions*, not specification gaps. This replaces v1's misleading "0 gaps / all Resolved" with a register that distinguishes *specified* from *verified-in-staging*.

---

## 15. Glossary

| Term | Definition |
|---|---|
| Maker-Checker | SoD control where the initiator (maker) cannot approve (checker) their own change |
| SoD | Segregation of Duties — maker ≠ checker; no self/target approval; dual-auth for reversal |
| **VERIFY node** ★ | An approval node that *checks evidence/documents* (does not by itself authorise the change) |
| **APPROVE node** ★ | A node that *authorises* the change at an intermediate tier |
| **SANCTION node** ★ | The senior node that *grants final authority* — "sanction" here means **grant**, NOT penalty |
| RECOMMEND node | An advisory node (e.g., reporting manager) feeding a later APPROVE/SANCTION |
| Correction | Repair of an erroneous historical value, effective from the original date (tracked retro impact) |
| Update | Genuine forward-dated change to a field |
| **Reversal / Break-glass** ★ | Fast, dual-authorised undo of a committed erroneous change, with reversing SR/retro events |
| Effective date | Date from which a change takes effect (distinct from when it was recorded) |
| Sensitivity tier | LOW/MEDIUM/HIGH/STATUTORY classification driving route, evidence, e-sign |
| **field_group vs sensitivity** ★ | `field_group` is a *taxonomy* (DEMOGRAPHIC/CONTACT/FINANCIAL/IDENTITY/QUALIFICATION); `sensitivity` is the *risk axis* (LOW…STATUTORY). They are orthogonal — STATUTORY is only a sensitivity, never a group |
| **Auth-bearing field** ★ | A field usable in authentication/OTP recovery (phone/email); always ≥MEDIUM, never auto-applied, OLD value notified on change |
| **Step-up authentication** ★ | A fresh re-authentication challenge required to *initiate* a sensitive self-service change |
| Approval matrix | Configurable rule set mapping sensitivity/scope/field/status to ordered approval nodes |
| Node / level | A single approval step in a route |
| Topology | Sequential vs parallel execution of nodes at a level |
| Delegation | Temporary transfer of an approval **action** to a user who **independently holds the role** (never a privilege elevation) |
| E-signature | Cryptographically attributable approval signature; strong = PKI/DSC or Aadhaar e-Sign (OTP weak; password re-auth removed) |
| Digital SR (M12) | Statutory Digital Service Register; system of record for service events |
| Provenance | Full who/what/when/authority/document trail of a change |
| **Tamper-evident audit** ★ | Hash-chained, WORM audit (`cr_audit_chain`) + hash-chained e-sign ledger, with integrity verification |
| Stale-value guard | Hash check ensuring the master value did not change between submit and commit |
| **Saga / Outbox** ★ | A reliability pattern for atomic, eventually-consistent commit across services: M02 records the intent in an *outbox* table inside its own DB transaction, then a worker reliably applies it to M01 and compensates on failure — no partial visible commit |
| Retro impact | A correction's downstream recomputation in payroll/pension/seniority — in v2 **tracked, acknowledged and reconciled** (not fire-and-forget) |
| **Data subject** ★ | The employee whose record is being changed; in v2 a first-class party with notice and objection rights |
| **Gazette** ★ | An official government notification; the traditional documentary proof for statutory name/DOB changes |
| **Cadre** ★ | A service classification/grade of a government employee (owned by M05/M06); distinct from social/reservation `category`; NOT editable via M02 |
| **Social category** ★ | Statutory reservation category (GEN/OBC/SC/ST/EWS) = M01 `employees.category`; verified via authority portal |
| **Dignity-aware gender path** ★ | A path distinguishing a gender-marker *data-error correction* from *gender-identity recognition* (NALSA / Transgender Persons Act 2019), with privacy-protected, non-gazette evidence |
| **Mule account** ★ | A bank account reused across multiple employees, a fraud signal (`DUPLICATE_BANK_ACCOUNT`) |

## 16. Appendices

### 16.1 Appendix A — Default field sensitivity seed

See §5.5 (v2 security-hardened seed) and §5.8 field-key registry. Configurable via FR-M02-012.

### 16.2 Appendix B — Sample approval routes by sensitivity & status

| Sensitivity / status | Route |
|---|---|
| LOW (non-auth-bearing) | [APPROVE: HR_OFFICER] (or auto-apply) |
| LOW/MEDIUM (auth-bearing contact) | [APPROVE: HR_OFFICER] + notify OLD value (no auto-apply) |
| MEDIUM | [VERIFY+APPROVE: HR_OFFICER] |
| HIGH (financial) | [VERIFY: HR_OFFICER] → [APPROVE: HR_ADMIN] (+ strong e-sign PKI/DSC or Aadhaar) (+ fraud-review node if high risk) |
| STATUTORY | [VERIFY: HR_OFFICER] → [SANCTION: DEPT_HEAD/APPOINTING_AUTHORITY] (+ strong e-sign) → SR post → retro reconcile |
| STATUTORY identity (Aadhaar/PAN/category) | HR-only initiation → authority-portal VERIFY → SANCTION (+ strong e-sign) → SR post (+ M06 freeze for category) |
| DECEASED (bank/nominee) | Family-pension controlled path: HR initiate → enhanced evidence → [SANCTION: APPOINTING_AUTHORITY] dual control |
| DOB within bar window | STATUTORY_HARD_BLOCK → separate legal-process path only |

### 16.3 Appendix C — Canonical idempotency keys

- Commit: `commit_idempotency_key = change_request_item_id`.
- SR posting: `source_ref = change_request_item_id + ':SR'`.
- Retro event: `idempotency_key = change_request_item_id + ':RETRO:' + target_module`.
- Reversal: `idempotency_key = change_request_item_id + ':REV:' + reversal_id`.

### 16.4 Appendix D — Assumptions register

| # | Assumption | Owner | Resolution / Gate |
|---|---|---|---|
| A1 | M01 exposes field metadata + **effective-dated** idempotent commit `:commit` | M01 team | §8.6; **Gate G-M01-COMMIT** (R4) |
| A2 | M12 exposes idempotent SR posting + reversing event | M12 team | §8.6; Gate G-M12-SR |
| A3 | M13 provides scan-status + references | M13 team | §8.6; Gate (D) |
| A4 | Strong e-sign provider (PKI/DSC, Aadhaar) + platform step-up available | Platform | FR-015/023; Gate G-STEPUP/ESIGN |
| A5 | Business-calendar service available (else calendar-day fallback P1) | Platform | FR-007 |
| A6 | Authority-verification portals (UIDAI/PAN/caste) available (else manual attestation) | Platform/External | FR-003/008; Gate G-AUTH-PORTAL |
| A7 | M10/M11/M06 expose retro **ack** endpoints | Downstream teams | FR-022; Gate G-RETRO-ACK |
| A8 | Platform data vault + KMS for Aadhaar tokenisation + crypto-shred | Platform | §4.4; Gate G-AUDIT-WORM-adjacent |

### 16.5 Appendix E — Open items

No **specification** gaps remain (§14.6). **7 build-time hard gates** (§14.5) are tracked as preconditions — chiefly **G-M01-COMMIT** (effective-dated write capability, R4) and **G-FIELDKEY** (R9) — which must be VERIFIED in staging before Workstream G. This is the honest replacement for v1's "None blocking / 0 gaps" claim (R8).

### 16.6 Appendix F — Council improvement → FR/section index (audit aid)

| Improvement | Primary carrier |
|---|---|
| 1 Auth-bearing contact reclassification | §5.5 seed, FR-002, FR-017 |
| 2 Data-subject notice + objection window | FR-017, E15 |
| 3 Employment-status gating | FR-018, §5.6 r12, §10.6 |
| 4 national_id/pan HR-only + re-verify | §5.5 seed, FR-003 |
| 5 E-sign method policy | FR-015, FR-012, E10 |
| 6 Requester step-up MFA | FR-023, E19 |
| 7 Fraud/anomaly signals | FR-019, E13 |
| 8 Tamper-evident audit | E18, §9, FR-016 |
| 9 Downstream retro loop | FR-022, E14 |
| 10 Field-key reconciliation | §5.8, §5.5 |
| 11 Honest dependency register | §14.4, §14.5, §14.6 |
| 12 DOB hard-block | FR-008, §5.6 r14 |
| 13 Caste controls + M06 freeze | FR-008, FR-003, §8.6 |
| 14 Dignity-aware gender path | FR-008, §5.5 |
| 15 Emergency reversal | FR-020, E17 |
| 16 Data-subject grievance | FR-021, E16 |
| 17 Commit/SR sequencing fix | §5.6 r11, FR-010/011, §10.2 |
| 18 Regex hardening + field clearing | FR-012, E2 |
| 19 DPDP/Aadhaar handling | §4.4, §9, §5.6 r15 |
| 20 Shared Change-Control seam | §4.5 ADR-M02-01 |
| 21 Glossary/semantics hardening | §15, §5.5 |
| 22 Re-phased rollout | §13.3, §14.3 |
| 23 Delegation privilege clarity + security report | FR-013, §12 |

---

*End of M02-EPDM BRD v2.0. Architecture preserved from v1; hardened with an adversary model, data-subject rights, public-sector statutory hard-rules, tamper-evident audit, and a closed downstream loop. 23 FRs, 19 module entities, 0 specification gaps, 7 tracked build-time hard gates.*
