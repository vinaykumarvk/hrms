# Employee Personal Details Modification Workflow — Government HRMS Module BRD (G02, v3.0 · platform-grounded)

**Module code:** G02-EPDM (was `M02-EPDM`; re-keyed per `MODULE_RECONCILIATION.md` §B)
**Program:** Government HRMS — public-sector configuration & extension of the **PrimeSoft HRMS platform** (Master BRD v2.1 · Vision v2.6 · Platform Spec v1.6 · RBAC v1.7 · Foundation FS v1.6)
**Document version:** v3.0 (platform-re-grounded — re-anchors v2.0 onto the PrimeSoft engines P01–P06 / X.1–X.3 / W.1–W.3)
**Supersedes (content lineage):** v2.0 (`docs/brd/v2/M02-personal-details-modification-workflow.md`) — all v2 content, rigor, FR structure, entities and traceability are preserved; only the *substrate* is re-grounded.
**Relationship to PrimeSoft:** **EXTEND of PrimeSoft M01 sensitive-field-change.** The maker-checker self-service edit already exists as the platform **"Request change → approval"** UI state (Foundation §3) routing **`E·AR` (Approval-Required)** fields (PAN/Aadhaar/passport/DL/bank — RBAC §7) to the sensitive-changes workflow on **P01 WorkflowEngine** (`MODULE_RECONCILIATION.md` §A row G02; Foundation §3; Platform §P01 — "Callers: M01 sensitive-field change"). G02 **configures** that flow (W.1) and adds the public-sector statutory controls; it **authors no new workflow, RBAC, audit, notification, job or form engine.**
**Status:** Baseline for build (platform-consistent, parallel-agent ready).
**Authoring standard:** Consumes `PLATFORM_FOUNDATION.md` and `MODULE_RECONCILIATION.md` by id. The invented `SHARED_FOUNDATION.md` conventions used by v2 are overridden per `MODULE_RECONCILIATION.md` §C and re-grounded here.

---

## 1. Executive Summary

### 1.1 Purpose

The Employee Personal Details Modification Workflow (**G02-EPDM**) is the **governed change-control configuration** sitting in front of the employee master (**G01** — Employee Profile Management, which extends the PrimeSoft **M01** master). It runs the existing PrimeSoft **"Request change → approval"** pattern for `E·AR` sensitive fields on **P01 WorkflowEngine**, and layers the public-sector statutory controls onto it: auditable, **maker-checker-approved** (SoD enforced by **P01/P02**, not re-coded), document-backed change requests with full before/after diff, multi-level routing by field sensitivity, **P01 SLA-driven escalation**, commit of approved sensitive changes to the **G01 employee master** — on which **G01 (the master/identity owner) posts the identity/personal-data event into the G12 Digital Service Register** (`source_module=G01`); **G02 is not itself a Digital-SR source** — adversary-resistant fraud controls, data-subject rights, employment-status gating, **P05 tamper-evident audit (DB-trigger dual-log; OPEN-PLAT-03 hash-chaining)**, and a closed-loop downstream retro-impact reconciliation with payroll/pension/seniority.

G02 **does not own** the employee data fields themselves — **G01/M01** owns them. G02 owns the **request, review, approval, e-signature, effective-dating, commit-back, reversal and reconciliation lifecycle** that mutates those fields safely, expressed as **P01 instances whose subject/context is a G02 change request**. G02 is the only sanctioned write path for self-service and routine HR-officer edits to governed G01/M01 fields.

### 1.2 Business problem

In the current/legacy public-sector process: employees mail or hand paper forms to HR; clerks key changes directly into the master with no segregation of duties; sensitive changes (name, date of birth, bank account, caste/category, qualification) are altered without consistent documentary proof or senior sign-off; there is no field-level history of *who* changed *what*, *when*, on *whose authority*, and against *which document*; statutory changes are not reliably mirrored into the Service Register; pending requests stall with no SLA or escalation; **the data subject is never told when someone else changes their record; deceased/retired records can be silently re-banked for pension/terminal-benefit fraud; auth-bearing contact channels can be hijacked to divert OTP and salary; and the downstream pay/pension recomputation that the disputes actually turn on is fire-and-forget.** This creates audit findings, pension/seniority disputes, payroll mis-credits (wrong bank account), and fraud exposure (silent DOB/name/bank changes, mule accounts, collusion rings).

### 1.3 Solution overview

G02-EPDM delivers (each on a named PrimeSoft engine — see **§ Alignment with PrimeSoft Platform**):

- **Self-service change requests** — employees (and HR officers on behalf) propose field changes through guided **W.2 forms** scoped by **P02 `Authorization.check`** (ownership, scope, field access, PII ceiling), gated by employment status and a fresh **step-up re-authentication** (platform MFA, §3.1) for HIGH/STATUTORY.
- **Field-level diff** — structured before/after per field, with reason, effective date (**`effective_from`** staged via the G01 effective-date job, §3.3), and explicit *clear/remove* intent.
- **Configurable sensitivity & approval matrix** — each governed field is classified (LOW / MEDIUM / HIGH / STATUTORY) and mapped to `E·AR` where applicable; auth-bearing contact channels (phone/email) are MEDIUM-minimum; identity numbers (Aadhaar/PAN) are HR-only with authority re-verification; high-sensitivity fields demand documentary proof, strong (non-OTP) e-signature and senior/multi-level approval.
- **Maker-checker via P01** — built on **P01 WorkflowEngine** (`startInstance · advance · approve · reject · sendBack · delegate · cancel · query`, each idempotent), supporting the **Appendix-D patterns** (`SEQUENTIAL`, `PARALLEL_ALL_OF`, `PARALLEL_ANY_OF`, `CONDITIONAL`, `DYNAMIC_APPROVER`), **in-flight version pinning**, and SoD enforced by **P02** (deny-by-default, multi-role intersection, no self-approval).
- **Supporting-document & authority-portal evidence** — documents stored in **G13** (extends PrimeSoft M11 Document Management), linked to request items, verified by reviewers; caste/category changes require authority-portal certificate verification.
- **Correction vs. Update distinction & effective-dating** — reuses the platform effective-dating mechanism (`VAL-EFFECTIVE`; G01 `JOB-G01-EFFDATE`). DOB alteration near retirement is a configurable **hard-block** routed to a separate legal process.
- **Data-subject rights** — out-of-band notice + confirmation/objection window via **X.2/W.3**; a DPDPA-aligned grievance/objection path that can pause commit or trigger reversal.
- **Fraud, velocity & anomaly detection** — mule-account, pre-payroll/pre-separation spike, and device/velocity signals feed a fraud-review queue (a **CONDITIONAL/DYNAMIC_APPROVER** P01 stage injection).
- **Emergency reversal / break-glass** — fast, dual-authorised reversal of a committed erroneous change; the reversing change is committed to G01, on which G01 posts the reversing G12 SR event.
- **Closed-loop downstream reconciliation** — the `governed-field-changed`/retro-impact event to G10/G11/G06 is tracked, acknowledged, retried (**X.1 runner** guarantees) and reconciled with the same rigor as SR posting.
- **Tamper-evident audit** — **P05** dual logs (`audit_log` + `security_audit_log`, DB-trigger capture, immutable, ≥7-yr) with tamper-evidence tracking **OPEN-PLAT-03** (periodic hash-chaining to WORM) — not a parallel mechanism.
- **Bulk HR-initiated corrections, rejection/resubmission, SLA & escalation (P01 runtime), statutory SR posting**, delegation, change-request templates (W.2), strong e-signature, parallel/sequential topologies, effective-dated application.

### 1.4 Scope summary

In scope: the full change-request lifecycle for governed G01/M01 fields, plus data-subject rights, fraud signalling, reversal, and downstream retro reconciliation — all configured on platform engines. Out of scope: definition/storage of the master fields themselves (**G01/M01**), the SR ledger internals (**G12**), the document object store internals (**G13**), the *execution* of payroll/pension recomputation (**G10/G11/G06** perform it; G02 tracks the acknowledgement), promotion-eligibility business logic (**G06** owns it; G02 raises the freeze flag), and authentication/MFA/SSO/step-up challenge (**platform §3.1 / P02**; G02 *invokes* it).

### 1.5 Key business outcomes & KPIs

| Outcome | Metric | Target |
|---|---|---|
| Eliminate ungoverned direct edits | % of governed-field mutations flowing through G02 | 100% |
| Documentary integrity on sensitive changes | % HIGH/STATUTORY requests with verified supporting doc (or authority-portal verification for caste) | 100% |
| Faster turnaround | Median time from submission to final decision | ≤ 3 business days (LOW), ≤ 7 (HIGH) |
| Reduce stalled requests | % requests breaching SLA without escalation (P01 SLA runtime) | 0% |
| Audit completeness & tamper-evidence | % approved changes with full who/what/when/authority/document trail in P05 (DB-trigger; OPEN-PLAT-03 chain) | 100% |
| Statutory mirroring | % approved STATUTORY changes posted to G12 within SLA | 100% |
| Downstream closed loop | % retro-impacting corrections with an acknowledged G10/G11/G06 recompute event | 100% |
| Data-subject awareness | % HR/BULK-initiated changes with delivered out-of-band data-subject notice | 100% |
| Fraud interception | % flagged high-risk requests reviewed before commit | 100% |
| Self-service adoption | % requests initiated by employees vs. HR | ≥ 70% within 6 months |

### 1.6 Primary stakeholders

Employees (self-service requesters **and data subjects**), Reporting Managers (recommenders → P01 reporting-chain approver resolution), HR Officers / HR Admin (reviewers/checkers, bulk-correction makers, fraud-queue triage), Department Heads / **Appointing Authority** (senior approvers for STATUTORY, dual-authorisers for break-glass), **Grievance Officer** and **Fraud Reviewer** (RBAC **capability flags** added per RBAC §4.3), **SR Custodian / Registrar** (consumes statutory postings via G12 — new entity-scoped role + capability flag), Auditor (mapped to **Org-Admin read + read-only entitlement** + P05 query access), System Administrator (mapped to **Org Admin / Platform Super Admin**; approval-matrix & sensitivity configuration via W.1/W.2). Roles map to the **RBAC v1.7** taxonomy with government statutory actors expressed as **ADDITIONS** (new roles + capability flags), per `PLATFORM_FOUNDATION.md` §6.6.

### 1.7 (See §1.8) Amendments summary

v3 keeps **all** v2 architecture, requirements, FRs, entities and rigor (23 FRs; data-subject rights; statutory hard-rules; tamper-evidence; downstream closed loop) and **re-grounds** them onto the existing PrimeSoft platform: the invented approval/maker-checker/audit/role/error machinery is replaced by **P01/P02/P05**, the platform API conventions and error table, the RBAC v1.7 model, multi-tenancy, and the `VAL-*/MSG-*/ERR-*/JOB-*` catalogues. The v1→v2 hardening map is retained in §1.8; the **v2→v3 platform re-grounding** map is in the dedicated **§ Amendments (v2 → v3)** section near the end.

---

## 1.8 Amendments (v1 → v2) — retained for lineage

Every adopted council improvement and every High/Critical risk mitigation incorporated in v2 is carried forward unchanged in v3 (the *substrate* changes, not the requirement). "Where" cites the FR/entity/section that carries it.

| # | Adopted improvement (council) | Risk(s) mitigated | Where incorporated (v3 carries forward) |
|---|---|---|---|
| 1 | Reclassify auth-bearing contact fields (phone/email LOW→MEDIUM, disable auto-apply, notify OLD value) | R1 (Critical) | §5.5 seed (`is_auth_bearing`, `notify_old_value`); FR-G02-002 BR5/AC7; FR-G02-017; E5 |
| 2 | Mandatory data-subject notification + confirmation/objection window | R2 (Critical) | FR-G02-017; E15; §11 (X.2); FR-G02-010 BR4 |
| 3 | `employment_status` gating + elevated special paths | R3 (Critical) | FR-G02-018; FR-G02-001 BR5; §5.6 rule 12; §10.6 |
| 4 | Default `national_id`/`pan` HR-only + UIDAI/PAN re-verification | R5 (High) | §5.5 seed (`self_service_editable=false`); FR-G02-003 BR4; §5.8 |
| 5 | E-signature method policy by tier (drop PASSWORD_REAUTH; FINANCIAL/STATUTORY need PKI/DSC or Aadhaar) | R1 (Critical) | FR-G02-015 BR3/AC6; E10; FR-G02-012 |
| 6 | Requester step-up MFA to initiate HIGH/STATUTORY self-service | R16 (Medium) | FR-G02-023; E19; FR-G02-001 AC7 |
| 7 | Fraud / velocity / mule anomaly signals | R10 (High) | FR-G02-019; E13; §12; §11 |
| 8 | Tamper-evident audit | R6 (High) | **Re-grounded to P05 + OPEN-PLAT-03** (was invented E18); §5.6 rule 13; §9; FR-G02-016 BR4 |
| 9 | Close downstream retro loop (tracked/acknowledged/reconciled) | R7 (High) | FR-G02-022; E14; FR-G02-010 BR4; §12 |
| 10 | Reconcile field-keys to G01/M01 master | R9 (High) | §5.8; §5.5 seed (`m01_field_key`); FR-G02-001 |
| 11 | Honest dependency register (AGREED/IMPLEMENTED/VERIFIED) + hard gate | R8, R4 (High/Critical) | §14.4; §14.5; §2.4 |
| 12 | DOB statutory hard-block | R11 (High) | FR-G02-008 BR2/AC5; §5.6 rule 14 |
| 13 | Caste/category controls (authority-portal verification + G06 promotion freeze) | R12 (High) | FR-G02-008; FR-G02-003 BR5; §8.6; E2 |
| 14 | Dignity-aware gender path | R12 (High) | FR-G02-008; §5.5 seed |
| 15 | Emergency reversal / break-glass | R13 (High) | FR-G02-020; E17; §10.7; reversing G12 SR event §8.6 |
| 16 | Data-subject grievance/objection | R14 (High) | FR-G02-021; E16; §11 |
| 17 | Resolve commit/SR sequencing contradiction | R15 (Medium) | §5.6 rule 11; FR-G02-010 AC4; FR-G02-011 BR2; §10.2 |
| 18 | Harden `validation_regex` (ReDoS) + allow field clearing | R17, R19 (Medium/Low) | FR-G02-012 AC6/BR4; E2; §9 |
| 19 | DPDPA/Aadhaar data-handling statement | R18 (Medium) | §4.4; §9; §5.6 rule 15; E2 |
| 20 | Shared Change-Control seam | R21 (Medium) | §4.5 ADR-G02-01; §2.3 |
| 21 | Glossary & semantics hardening | (clarity) | §15; §5.2; §5.5 |
| 22 | Re-phase rollout | R20 (Low) | §13.3; §14.3 |
| 23 | Delegation privilege clarity + security report | R21/(SoD) | FR-G02-013 BR1/AC6 (now **P01 `delegate` + P02**); §12 |

**Net result (carried from v2):** **23 FRs**; module-owned entities reduced **19 → 18** by re-grounding the invented `cr_audit_chain` (E18) onto **P05 dual-log + OPEN-PLAT-03**; convenience features re-phased (not deleted); all 23 improvements + R1–R21 mitigations carried as concrete, testable, **platform-grounded** requirements.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Sub-area | What it covers | Primary FRs |
|---|---|---|
| Request authoring | Self-service & HR-on-behalf creation, draft, field selection, diff capture, composite-name sub-items, clear-intent (W.2 forms) | FR-G02-001, FR-G02-014 |
| Step-up & identity assurance | Fresh platform re-auth (MFA, §3.1) to initiate sensitive self-service changes | FR-G02-023 |
| Sensitivity & routing | Field sensitivity catalog, P01 route construction, `E·AR` mapping, auth-bearing reclassification | FR-G02-002, FR-G02-012 |
| Evidence | Supporting-document upload (G13), linkage, verification, authority-portal verification (caste) | FR-G02-003 |
| Approval | P01 maker-checker, multi-level sequential/parallel, recommend→sanction, decisions, delegate (P01 `delegate`) | FR-G02-004, FR-G02-013, FR-G02-015 |
| Diff & preview | Field-level before/after, masking (P02 serialization), preview, reviewer comparison | FR-G02-005 |
| Rejection lifecycle | Reasoned rejection, return-for-correction (P01 `sendBack`), resubmission, withdrawal (P01 `cancel`) | FR-G02-006 |
| Timeliness | P01 SLA computation, reminders, escalation, reassignment (`JOB-G02-SLA`) | FR-G02-007 |
| Semantics & timing | Correction vs update, effective-dating (`VAL-EFFECTIVE`), DOB hard-block, dignity-aware gender, retro flag | FR-G02-008 |
| Status gating | Employment-status gates & elevated paths (deceased/retired/suspended) | FR-G02-018 |
| Bulk operations | HR batch corrections, dry-run, per-row validation, aggregate approval | FR-G02-009 |
| Commit & downstream | Apply approved change to G01/M01 (effective-dated); on STATUTORY commit **G01 posts the SR event to G12** (G02 tracks status); emit + reconcile retro to G10/G11/G06 | FR-G02-010, FR-G02-011, FR-G02-022 |
| Data-subject rights | Out-of-band notice + objection window; grievance/dispute path (X.2/W.3) | FR-G02-017, FR-G02-021 |
| Fraud & anomaly | Mule/velocity/pre-payroll/pre-exit risk scoring + review queue | FR-G02-019 |
| Reversal | Emergency break-glass reversal with dual authority; reversing change committed to G01, on which **G01 posts the reversing G12 SR event** | FR-G02-020 |
| Governance config | Approval-matrix & sensitivity administration (W.1/W.2 builders), regex hardening, e-sign policy, delegation | FR-G02-012, FR-G02-013 |
| History & assurance | Change provenance, field history, P05 tamper-evident audit, audit & reporting (G14) | FR-G02-016 |

### 2.2 Common Capabilities (cross-cutting, inherited from the platform)

- **Maker-checker by default** for any governed-field mutation, run as **configured P01 flows (W.1)**; SoD enforced by **P01/P02** (no self-approval; multi-role intersection), never re-coded.
- **Field-level, tamper-evident audit** to **P05** (`audit_log` for data mutations, `security_audit_log` for auth/permission/admin events) via **DB-trigger capture** — 100% mutation capture, zero gaps; tamper-evidence per **OPEN-PLAT-03** (periodic hash-chaining to WORM).
- **Multi-tenant data-layer scoping** — every G02 table carries **`tenant_id`/`entity_id`**; scoping is enforced in the persistence layer; an unscoped query is **rejected, not defaulted to "all"** (Platform §0.1).
- **Row-level + field-level access** via **P02 `Authorization.check`** (deny-by-default → role grant → multi-role intersection → entitlement → capability flag → **PII ceiling** → scope filter → field mask on serialization).
- **Soft delete + immutable history** — requests never hard-deleted (platform "no hard delete"); ledgers append-only; P05 immutable.
- **Optimistic concurrency** — every commit to G01/M01 validates the master version token / `old_value_hash`.
- **Idempotent commit, posting, retro & reversal** — keyed per §16.3; re-runs are no-ops (aligns with P01 idempotent `advance` and the **`Idempotency-Key`** API header).
- **Data-subject first-class** — the employee whose record changes is always notified out-of-band (X.2) when someone else initiates the change, and can object.
- **Employment-status aware** — every request is gated by the target's G01/M01 `employment_status`.
- **Internationalisation** — UTC storage; `DD-MMM-YYYY` display; INR money formatting; WCAG 2.1 AA UI (platform NFR §8.2).
- **Cursor pagination** — all list endpoints use cursor paging (`?limit=` default 25 / max 100, `next_cursor`); offset paging is not used.

### 2.3 Explicit Boundaries (In / Out)

| Concern | In G02 | Out of G02 (owner) |
|---|---|---|
| Governed-field change lifecycle (as P01 subject/context) | ✅ | — |
| Definition/storage of employee master fields | — | G01 / PrimeSoft M01 |
| Field history *display* sourced from G02 commits | ✅ | Master record source = G01/M01 |
| Statutory SR event *posting* of approved changes | — (commits the change to G01, which posts) | SR event is posted by **G01** (master/identity owner, `source_module=G01`) on commit; SR ledger & validation = G12 (on P05 substrate). **G02 is not an SR source/writer** and never carries `source_module=G02` SR payloads |
| Document binary storage, versioning, encryption | — | G13 / PrimeSoft M11 (G02 stores references) |
| Authority-portal (UIDAI/PAN/caste-portal) verification *call* | ✅ (invokes via X.3 + records) | Portal/registry = external authority |
| Payroll/pension/seniority recomputation *execution* | — | G10 / G11 / G06 (consume + acknowledge event) |
| Retro-impact event tracking & reconciliation | ✅ | Recompute logic = G10/G11/G06 |
| Promotion-eligibility freeze *logic* | — (raises flag) | G06 (enforces freeze) |
| Authentication, MFA, SSO, step-up challenge | — (invokes) | Platform §3.1 / P02 |
| Workflow engine primitives (instances, actions, routing, SLA) | **Configure** (W.1) | **P01** WorkflowEngine |
| RBAC model, scoping, field access, PII ceiling | **Reference** | **RBAC v1.7 + P02** |
| Audit substrate (dual-log, DB-trigger, immutability) | **Consume** | **P05** |
| Notification engine, channels, retry, templates | **Configure** (W.3) | **X.2** |
| Org hierarchy / reporting lines used for routing | Read | G01 / org platform; P01 reporting-chain resolution |

**Boundary note (ADR-G02-01, see §4.5):** G02's approval/sensitivity/delegation/e-sign **configuration** is module-agnostic by construction (it is a set of P01 flow definitions + a sensitivity catalog), so **G05 (transfers), G06 (promotions), G09 (penalties)** can later consume the same configured Change-Control pattern. G02 is the *first government consumer* of the platform's existing sensitive-change pattern — **not** a re-platforming effort.

### 2.4 Assumptions & Constraints (with elevated hard dependency)

- **[HARD GATE — R4/R8/R11] G01/M01 commit capability.** G01 (extending PrimeSoft M01) exposes a governed-field metadata read and the **effective-dated** commit path. Per the platform effective-dating mechanism (§3.3; `VAL-EFFECTIVE`; **`JOB-G01-EFFDATE`** modelled on `JOB-M01-EFFDATE`), mutations to effective-dated fields accept **`effective_from`** and are **staged and applied by the effective-date job, not written live.** Workstream F/G (commit, statutory) **must not start** until this contract — including effective-dated/staged write, version token and idempotency semantics — is **VERIFIED in staging** (§14.5). This is the single most important precondition; it is *tracked*, not assumed-resolved.
- **G12** exposes an idempotent SR-ledger append (`VAL-G12-SREVENT`) including a **reversing** event type for break-glass; **the identity/personal-data SR event is posted by G01 (the master/identity owner, `source_module=G01`) on commit — G02 does not post to the ledger** but supplies the change context to G01 and tracks the resulting posting status; G12 runs on the **P05** audit/immutability substrate.
- **G13** (PrimeSoft M11) exposes upload + reference + virus-scan-status APIs (`VAL-FILE`) and an export-artefact store.
- **G10/G11/G06** expose an **acknowledgeable** retro-impact consumer endpoint (or subscribe + post an ACK) so the downstream loop reconciles (FR-G02-022).
- An **authority-verification provider** exists for UIDAI (Aadhaar), Income-Tax (PAN) and the caste/category certificate portal, integrated via **X.3** with credentials in **`integration_credentials` (P04)**; where a portal is unavailable, the field is HR-verified with recorded manual attestation and flagged.
- All actors are authenticated via the platform session (§3.1: Google SSO / username-password / **MFA TOTP/SMS OTP**); G02 enforces authorization via **P02** and **invokes step-up** for sensitive initiation. High-privilege statutory roles (Appointing Authority, SR Custodian) require MFA equivalently (§3.1).
- Statutory retention: change requests and their audit retained per **P05** (≥ 7 years; government schedule may be stricter, never below the statutory floor), reconciled against DPDPA erasure (§4.4, §8.1).

---

## 3. User Roles & Permissions

Roles map to the **RBAC v1.7** taxonomy (`PLATFORM_FOUNDATION.md` §6). G02 adds **no parallel scheme**: government statutory actors are expressed as **new roles + capability flags ADDED** to the taxonomy (registered in RBAC §2.2/§4.3), and the **Grievance Officer** and **Fraud Reviewer** are **capability flags** on existing roles. **Segregation of duties (maker ≠ checker, no self-approval, multi-role intersection) is enforced by P01/P02**, not re-implemented: `request.created_by ≠ approval.actor`, no actor approves/signs a request they created or that mutates their own master record, and a `delegate` must independently satisfy the stage's required role.

### 3.0 Role mapping to RBAC v1.7 (ADDITIONS)

| G02 actor (v2 name) | RBAC v1.7 expression | Basis |
|---|---|---|
| Employee (Self-Service) | **Employee** (individual access, own-record scope) | RBAC §2.4 |
| Reporting Manager | **Manager L1** (P01 reporting-chain approver resolution; HOD authority is the per-workflow capability toggle) | RBAC §2.3; Platform §P01 |
| HR Officer | **HRBP** (entity-scoped operational) | RBAC §2.2 |
| HR Admin | **HR Administrator (`hr_admin`)** — superset operational role | RBAC §2.2; BRD §3.1.1 |
| Dept Head / Appointing Authority | **HOD** + **new role `Appointing Authority`** (sanctioning authority; P01 approver; SoD by P02) | `PLATFORM_FOUNDATION.md` §6.6 |
| SR Custodian / Registrar | **new entity-scoped role + capability flag on the G12 ledger** (mirrors Document Admin pattern; on P05) | §6.6 |
| Grievance Officer | **capability flag** (RBAC §4.3) on HR Admin / Appointing Authority | §6.4/§6.6 |
| Fraud Reviewer | **capability flag** (RBAC §4.3) on HR Officer / HR Admin / Authority | §6.4/§6.6 |
| Auditor (read-only) | **map to Org-Admin audit read + time-bound read-only entitlement** + **P05 `Audit.query`** access — *not* a parallel write role | §6.6; Platform §P05 |
| System Administrator | **map to Org Admin / Platform Super Admin** — configuration via W.1/W.2; **no transactional self-approval** | §6.6 |

### 3.1 Role-to-capability matrix

| Capability | Employee (Self-Service) | Reporting Manager (Mgr L1) | HR Officer (HRBP) | HR Admin | Dept Head / Appointing Authority | SR Custodian | Auditor | System Admin (Org/Platform Admin) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create change request on **own** record | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create request **on behalf of** an employee | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Step-up re-auth to initiate HIGH/STATUTORY (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload supporting documents (G13) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Authority-portal verification (Aadhaar/PAN/caste) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Recommend (P01 intermediate node) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve LOW/MEDIUM sensitivity | ❌ | ✅ (config) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve HIGH sensitivity | ❌ | ❌ | ✅ (config) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sanction STATUTORY sensitivity | ❌ | ❌ | ❌ | ✅ (config) | ✅ | ❌ | ❌ | ❌ |
| Verify supporting documents | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reject / return for correction (P01 reject/sendBack) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Withdraw own request (P01 cancel/recall) | ✅ | ✅ | ✅ (own/initiated) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Triage fraud-review queue (Fraud Reviewer flag) | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Handle data-subject objection (Grievance Officer flag) | ❌ | ❌ | ✅ (flag) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Initiate emergency reversal (break-glass) | ❌ | ❌ | ✅ (raise) | ✅ (auth 1) | ✅ (auth 2) | ❌ | ❌ | ❌ |
| Initiate bulk corrections | ❌ | ❌ | ✅ (scope) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve bulk correction batch | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Apply e-signature (strong methods) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Object to a change on **own** record (data subject) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Configure approval flow / sensitivity / e-sign policy / regex (W.1/W.2) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage delegation (own outgoing; P01 delegate) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (any) |
| View statutory SR posting status (G12) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Verify audit integrity (P05 / OPEN-PLAT-03 chain) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ (config) |
| Read all requests + audit (no write; P05 `Audit.query`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (config only) |
| View own request status/history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Notes: "(config)" = governed by the configured P01 approval flow / capability config (FR-012). "(scope)" = limited to the actor's `org_unit`/`entity_id` data-layer scope. System Admin has **no transactional self-approval** by design (P02). Break-glass reversal requires **two distinct authorisers** (auth 1 ≠ auth 2 ≠ original maker), enforced by P02 SoD.

### 3.2 Authorization principles (all enforced by P02 `Authorization.check`)

1. **Ownership check** — a self-service requester may only target their own `employee_id` (own-record scope).
2. **Scope check** — HR/manager/authority actions are bounded to their `org_unit`/`entity_id` subtree via the **P02 data-scope filter** (data layer).
3. **Status gate** — the request is permitted, blocked, or routed to an elevated path based on the target's G01/M01 `employment_status` (FR-018).
4. **Sensitivity gate** — the minimum required approver role is derived from the field's sensitivity class via the configured P01 flow / approval matrix.
5. **Step-up gate** — initiating a HIGH/STATUTORY self-service request requires a fresh platform step-up re-authentication (FR-023; §3.1).
6. **SoD invariant** — `request.created_by ≠ approval.actor`, `approval.actor ≠ target.user_id`, and `reversal.auth1 ≠ auth2 ≠ original_maker` at every P01 stage — **enforced by P01/P02 multi-role intersection + deny-by-default**, not re-coded.
7. **Delegation non-elevation** — a **P01 `delegate`** must independently hold the stage's `required_role`; delegation transfers the *action*, never the *privilege* (FR-013).
8. **Least-privilege PII / ceiling** — unmasked sensitive values (bank account, Aadhaar/PAN) are governed by the **PII Protection Ceiling** which **overrides everything upward** and the **field mask applied on serialization** (P02 / RBAC §3.9, §6); every reveal is audited to P05. `E·AR` fields render read-only with a **"Request change"** control (Foundation §3), never a direct write.

---

## 4. Shared Application Foundation & Cross-Agent Build Instructions

This module **consumes** the PrimeSoft platform contracts by id (`PLATFORM_FOUNDATION.md`, `MODULE_RECONCILIATION.md`); it does not re-author them. The invented `SHARED_FOUNDATION.md` defaults used by v2 are overridden per `MODULE_RECONCILIATION.md` §C.

### 4.1 Inherited platform defaults (override the invented v2 defaults)

- **Frontend:** physical stack is an engineering choice within the platform's logical architecture (React/Tailwind/shadcn assumed by the prototype); G02 specifies behaviour/NFR + the **canonical UI-state standard** (Foundation §3), not the framework.
- **Backend / API:** REST under **`/api/v1`**; **`Idempotency-Key`** on unsafe workflow-initiating POSTs (24h replay); **cursor pagination** (`?limit=` default 25 / max 100, `next_cursor`); **`X-Correlation-Id`** request/response header echoed to every audit/log line; `?sort=field:asc|desc`. Endpoints **never re-implement permission logic — they call `Authorization.check` (P02)**.
- **Auth:** platform session (§3.1) — Google SSO / username-password (one-way hashed) / **MFA (TOTP/SMS OTP)**; bearer JWT carrying **resolved roles + tenant/entity scope** (raw permissions resolved per request by P02). G02 invokes **step-up** for sensitive initiation.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "...", "details": { } } }`; **2xx returns the resource payload**; the correlation id is the **`X-Correlation-Id` header**, *not* a body `requestId`.
- **Standard error codes (Foundation §1, 8-code table):** `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409, incl. idempotency replay / duplicate workflow start `ERR-DUP-INSTANCE` / state conflict), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500). **No 503** (upstream failures handled via **X.3** mapping + 500/`ERR-LOADFAIL` or 412 `ERR-PRECOND`). Plus G02-unique `ERR-G02-*` (§8.3).
- **Security/compliance:** OWASP/ASVS posture per platform NFR; TLS in transit; encryption at rest; **P05** tamper-evident audit (DB-trigger; OPEN-PLAT-03); **DPDPA** alignment (§4.4, §8.1); statutory retention ≥ 7 yr.
- **NFR baseline (platform §8.2 — overrides invented v2 NFR):** standard API **p95 < 500 ms @ 300 concurrent**; read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; **uptime 99.5%/month**; **RTO < 4 h · RPO < 1 h**; 100% audit capture; **WCAG 2.1 AA**; responsive 375/768/1280 px; no hard delete.

### 4.2 Platform services & shared entities consumed (NOT redefined here)

| Service / entity | Owner | How G02 uses it |
|---|---|---|
| **P01 WorkflowEngine** (`workflows` / `workflow_instances` / `workflow_actions`) | Platform | Every approval/maker-checker flow runs here as a **configured W.1 flow**; `startInstance({workflow_code, subject_ref=change_request_id, context, initiator})`; `advance/approve/reject/sendBack/delegate/cancel/query` (idempotent); patterns from Appendix D; **in-flight version pinning**; SLA & escalation runtime. |
| **P02 `Authorization.check`** | Platform / RBAC v1.7 | Every endpoint calls it for authz, scope filter, field mask; PII ceiling; `E·AR` routing. |
| **P05** (`audit_log` + `security_audit_log`) | Platform | DB-trigger capture of every INSERT/UPDATE/soft-DELETE; immutable; ≥7-yr; OPEN-PLAT-03 tamper-evidence; `Audit.query/export` for auditors. |
| **X.1** Background Jobs runner | Platform | Runs `JOB-G02-*` (idempotent, backoff ×3, JOB-FAIL → MSG-SYS-JOBFAIL, per-tenant isolation). |
| **X.2** Notification Infrastructure | Platform | `IN_APP + EMAIL` parallel for approvals; EMAIL mandatory/non-suppressible for approval & statutory notices; backoff ×5 + DLQ; templates by `MSG-G02-*`. |
| **X.3** Integration Framework | Platform | Outbound authority-portal/G12/G13 calls (circuit-breaking, idempotency, error mapping); credentials from `integration_credentials` (P04). |
| **W.1/W.2/W.3** Configured content | Platform | Approval/flow definitions (W.1), data-collection forms (W.2, `VAL-*` bound), notification config (W.3). |
| `employees` (G01 / PrimeSoft M01) | G01/M01 | Read current value + version + `employment_status`; commit approved changes via the effective-dated path (`effective_from`, `JOB-G01-EFFDATE`). |
| `users` / `roles` / `permissions` / `org_units` | Platform / RBAC | Identity, authorization, approver resolution, capability flags, data scope. |
| `documents` | G13 / PrimeSoft M11 | Store references to supporting documents; read scan/verify status; export artefacts. |
| `service_register_events` | **G12 (net-new gov ledger)** | **Read SR posting status for reconciliation.** On commit of a STATUTORY change, **G01 (master/identity owner) posts** the identity/personal-data event (`source_module=G01`, incl. reversing events; idempotent; `VAL-G12-SREVENT`); **G02 does not append.** On the **P05 substrate**, not a platform primitive. |
| `notifications` | Platform (X.2) | Outbound in-app/email/SMS, incl. out-of-band data-subject notice. |
| `consent_records` | Platform (P05) | DPDPA consent lifecycle; `VAL-CONSENT`. |
| `integration_credentials` | Platform (P04) | Encrypted credentials for portals/G12/G13 integrations. |

### 4.3 Cross-agent build instructions

1. **Do not duplicate G01/M01 field storage.** Treat the employee master as authoritative; capture only proposed values in `change_request_items` until commit.
2. **Use P01 for all routing.** Each request maps to **one `workflow_instance`** (`subject_ref = change_request_id`, `context` = sensitivity/scope/status). Each approval node is a **`workflow_action`** (not an invented `workflow_task`). G02-specific approval semantics (sensitivity tier, e-sign reference) are stored in `change_request_approvals` keyed to the `workflow_action`. Configure the flow in **W.1**; never code a bespoke engine.
3. **Idempotency keys:** apply-to-master = `change_request_item_id`; SR posting = `change_request_item_id + ':SR'`; retro event = `change_request_item_id + ':RETRO:' + module`; reversal = `change_request_item_id + ':REV:' + reversal_id`. All workflow-initiating POSTs also send the **`Idempotency-Key`** header (24h replay → original result, not duplicate; duplicate start → 409 `ERR-DUP-INSTANCE`).
4. **Transaction boundary & canonical sequence (R15):** committing an approved request applies all items atomically; canonical post-commit sequence is **G01/M01 effective-dated commit → item `COMMITTED` → (statutory) G01 posts the identity/personal-data SR event (`source_module=G01`); G02 tracks the observed SR status `PENDING`→`POSTED/FAILED` and (retro) retro-event `PENDING`→`ACKED/FAILED`**. SR-status tracking / retro posting is *separate* and never blocks `COMMITTED`. Cross-service commit uses the documented **saga/outbox** (§10.4) since G01/M01 effective-dating is **staged by `JOB-G01-EFFDATE`**.
5. **Configuration is data, not code:** sensitivity classes, approval routes, e-sign method policy, regex, hard-block rules live in `field_sensitivity_catalog` + the configured **W.1 approval flow**; never hard-code field→approver or method→tier. Builders are the **W.1 `cfg-approval-builder` / W.2 `cfg-form-builder`** Org-Admin screens.
6. **Every write path is captured by the P05 DB trigger** (no application-code audit; no API bypass) and emits an **X.2** notification where applicable. No silent state changes.
7. **PII discipline (R18 / PII ceiling):** never log raw old/new values for HIGH/STATUTORY fields; store proposed sensitive values encrypted in `change_request_items`; store Aadhaar only as a **vault token reference** (`vault_token_ref`); P05 stores PII masked; field mask applied **on serialization** by P02.
8. **Field keys bind to the G01/M01 registry (§5.8):** use `m01_field_key`; model `name` as a **composite** request (`first_name`/`middle_name`/`last_name` sub-items); never invent a single `name` field.
9. **Cite ids, don't restate:** field validation cites **`VAL-*`** (PAN/Aadhaar/IFSC/DOB/EFFECTIVE/DATE/FILE/COMMENT/ENUM/EMAIL/MOBILE/CONSENT/MASTER-UNIQUE); author only module-unique **`VAL-G02-*`**; notifications use **`MSG-G02-*`**; errors use shared `ERR-*` + module-unique **`ERR-G02-*`**; jobs use **`JOB-G02-*`** — all registered in the Foundation §2/§4/§5 indexes.

### 4.4 DPDPA & Aadhaar data-handling statement (R18 / Improvement 19)

- **Legal basis & retention override:** processing of governed personal data is on the legal basis of the employer–employee statutory relationship and public-sector records law; **statutory retention (≥ 7 yr, government schedule)** overrides DPDPA erasure for the *audit/provenance* record (P05; Platform §P05/§8.1). DPDPA erasure is honoured for non-statutory convenience data and for the unmasked sensitive *value* via **crypto-shred** while preserving the P05 provenance shell; the **right-to-erasure redaction marker on `old_value`** is the only permitted P05 mutation (Platform §P05).
- **Aadhaar tokenisation:** the full Aadhaar number is **never** stored in `change_request_items`; G02 stores a `vault_token_ref` issued by the platform data vault; last-4 masked form for display; `VAL-AADHAAR` (Verhoeff + masked storage) applies. PAN stored masked; `VAL-PAN`; uniqueness via `VAL-MASTER-UNIQUE` on G01/M01.
- **Key management & crypto-shred:** sensitive `change_request_items` columns encrypted with field-level keys via the platform KMS, rotated; per-record crypto-shred is the erasure mechanism, leaving an auditable tombstone in P05.
- **Consent:** `consent_records` (DPDPA) captured at onboarding, immutable; `VAL-CONSENT`.

### 4.5 ADR-G02-01 — First government consumer of the platform sensitive-change pattern (R21 / Improvement 20)

**Decision:** Do **not** build a new engine. G02 is the **first government consumer** of the existing PrimeSoft **"Request change → approval"** sensitive-field pattern (Foundation §3; Platform §P01 caller "M01 sensitive-field change"), expressed as a **configured P01 flow (W.1) + a sensitivity catalog**. The pattern is already module-agnostic; **G05 (transfers), G06 (promotions), G09 (penalties)** are designated future consumers of the same configured Change-Control flow family. This preserves the platform build (no rewrite) while preventing divergent re-implementations. Cost: a sensitivity catalog + the configured flow definitions + capability flags — no engine code.

---

*(Sections 5–16, the FR catalogue, Alignment, and the v2→v3 Amendments table follow.)*

---

## 5. Holistic Data Model

### 5.1 Entity inventory

**Module-owned entities (G02):** v2's E1–E19 are retained, with **E18 (`cr_audit_chain`) removed** — re-grounded onto **P05 dual-log + OPEN-PLAT-03** (no invented audit table). Every table additionally carries **`tenant_id` (NN)** and **`entity_id` (NN where entity-scoped)** per Platform §0.1. Net module-owned entities: **18** (E1–E17, E19).

| # | Entity | Purpose | Ledger? | Platform re-grounding (v2 → v3) |
|---|---|---|---|---|
| E1 | `change_requests` | Header for a change request — **subject of one P01 instance** | No (soft-delete) | `workflow_instance_id` = P01 `workflow_instances`; +`tenant_id`/`entity_id` |
| E2 | `change_request_items` | Per-field before/after diff lines | No (soft-delete) | Unchanged semantics; +tenancy; values validated by `VAL-*` |
| E3 | `change_request_documents` | Links items to G13 documents (evidence) | No | G13 references; `VAL-FILE`; +tenancy |
| E4 | `change_request_approvals` | Per-node approval decisions, keyed to **P01 `workflow_actions`** | Append-only | `workflow_task_id` → **`workflow_action_id`**; +tenancy |
| E5 | `field_sensitivity_catalog` | Classifies each governed field & rules; maps to `E·AR` | No (versioned) | `E·AR`/`post_to_sr` to G12; +tenancy |
| E6 | `approval_matrix_config` | Named, versioned approval-matrix definitions (bound to a **W.1 flow**) | No (versioned) | References configured P01 flow; +tenancy |
| E7 | `approval_matrix_rules` | Per (sensitivity × scope) approval routes | No (versioned) | Maps to P01 stage definition; +tenancy |
| E8 | `delegations` | Temporary delegation of authority (executed via **P01 `delegate`**) | No (soft-delete) | P01 delegate; P02 role-independence; +tenancy |
| E9 | `change_request_templates` | Reusable pre-filled request templates (**W.2 forms**) | No (soft-delete) | W.2 form binding; +tenancy |
| E10 | `esignatures` | Captured strong e-signatures on approvals | Append-only (tamper-evident per OPEN-PLAT-03) | Gov-specific ledger retained; +tenancy |
| E11 | `cr_sla_events` | SLA milestones/reminders/escalations | Append-only | Mirrors **P01 SLA runtime** + `JOB-G02-SLA`; +tenancy |
| E12 | `bulk_correction_batches` | Header for HR bulk correction jobs | No (soft-delete) | +tenancy |
| E13 | `cr_risk_signals` | Fraud/velocity/mule/anomaly signals & scores | Append-only | +tenancy |
| E14 | `retro_impact_events` | Tracked/acked downstream retro (G10/G11/G06) | Append-only | X.1 runner retry; +tenancy |
| E15 | `data_subject_notices` | Out-of-band notice + confirmation/objection window | Append-only | X.2/W.3 dispatch; +tenancy |
| E16 | `cr_objections` | Data-subject objections / grievances | No (soft-delete) | +tenancy |
| E17 | `cr_reversals` | Emergency break-glass reversals (dual auth, SoD by P02) | Append-only | +tenancy |
| ~~E18~~ | ~~`cr_audit_chain`~~ | **REMOVED** | — | **Re-grounded to P05 dual-log (DB-trigger, immutable) + OPEN-PLAT-03 hash-chaining**; G02 defines no audit table (`MODULE_RECONCILIATION.md` §C) |
| E19 | `cr_step_up_events` | Step-up re-auth events (platform MFA, §3.1) | Append-only | Invokes platform step-up; +tenancy |

**Platform-provided entities referenced (owned elsewhere — see §4.2):** `workflows`/`workflow_instances`/`workflow_actions` (P01), `audit_log`/`security_audit_log` (P05), `notifications` (X.2), `integration_credentials`/`tenants` (P04), `consent_records` (P05), `users`/`roles`/`org_units` (RBAC), `employees` (G01/M01), `documents` (G13/M11), `service_register_events` (G12 net-new ledger).

### 5.2 Full field tables (tenancy + P01/P05 re-grounding marked ◆; v2 deltas ★)

#### E1 — `change_requests`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_id` | UUID (PK) | N | gen | Used as P01 `subject_ref` ◆ |
| `tenant_id` | UUID | N | | ◆ Data-layer scope (Platform §0.1) |
| `entity_id` | UUID | N | | ◆ Department/directorate entity scope |
| `cr_number` | VARCHAR(24) UNIQUE | N | seq | e.g. `CR-2026-000123` (unique per tenant) |
| `target_employee_id` | UUID (FK→employees G01/M01) | N | | Whose record is changed |
| `requested_by` | UUID (FK→users) | N | | Maker (self or HR-on-behalf) |
| `request_origin` | ENUM | N | `SELF_SERVICE` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK`, `REVERSAL` |
| `change_type` | ENUM | N | `UPDATE` | `UPDATE`, `CORRECTION`, `REVERSAL` |
| `highest_sensitivity` | ENUM | N | computed | Max sensitivity across items |
| `status` | ENUM | N | `DRAFT` | See §5.5 / §10 |
| `employment_status_at_submit` | VARCHAR(20) | Y | | Snapshot of G01/M01 `employment_status` (FR-018) |
| `risk_score` | SMALLINT | Y | | 0–100 fraud score (FR-019) |
| `risk_band` | ENUM | Y | | `LOW`,`MEDIUM`,`HIGH`,`BLOCKED` (FR-019) |
| `parent_reversal_id` | UUID (FK→cr_reversals) | Y | | Set when this CR is a reversal child (FR-020) |
| `effective_date` | DATE | Y | | `effective_from` for the G01/M01 staged write (§3.3; `VAL-EFFECTIVE`) ◆ |
| `reason` | VARCHAR(1000) | Y | | Requester rationale (`VAL-COMMENT` where mandatory) |
| `workflow_instance_id` | UUID (FK→**workflow_instances P01**) | Y | | ◆ Bound on submit via `startInstance` |
| `template_id` | UUID (FK→change_request_templates) | Y | | If from template |
| `bulk_batch_id` | UUID (FK→bulk_correction_batches) | Y | | If part of a bulk job |
| `step_up_event_id` | UUID (FK→cr_step_up_events) | Y | | Step-up proof for sensitive self-service (FR-023) |
| `sla_due_at` | TIMESTAMP | Y | | Mirror of current P01 stage SLA deadline ◆ |
| `submitted_at` / `decided_at` / `committed_at` | TIMESTAMP | Y | | |
| `created_at` / `updated_at` | TIMESTAMP | N | now | UTC; P05 trigger captures all mutations ◆ |
| `created_by` / `updated_by` | UUID | N | | |
| `is_deleted` | BOOLEAN | N | false | Soft delete (no hard delete — platform §8.2) |

#### E2 — `change_request_items`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `change_request_item_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `field_key` | VARCHAR(80) | N | | Catalog key (FK→field_sensitivity_catalog) |
| `m01_field_key` | VARCHAR(120) | N | | Canonical G01/M01 path, e.g. `employees.first_name`, `employee_bank_accounts.account_number` (§5.8) |
| `parent_item_id` | UUID (FK self) | Y | | Composite name → first/middle/last sub-items |
| `old_value` | TEXT (encrypted) | Y | | Snapshot of master value at submit |
| `new_value` | TEXT (encrypted) | Y | | NULLABLE; null only with `clear_intent=true` (`VAL-G02-CLEARINTENT`) |
| `clear_intent` | BOOLEAN | N | false | Explicit "clear/remove this field" intent |
| `old_value_hash` | CHAR(64) | Y | | SHA-256 for stale-detection (`VAL-G02-STALEHASH`) |
| `vault_token_ref` | VARCHAR(120) | Y | | Data-vault token for Aadhaar/PAN; raw never stored (R18) |
| `value_datatype` | ENUM | N | | `STRING`,`DATE`,`NUMBER`,`ENUM`,`BOOLEAN`,`JSON` |
| `sensitivity` | ENUM | N | from catalog | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `requires_document` | BOOLEAN | N | from catalog | |
| `requires_authority_portal_verification` | BOOLEAN | N | from catalog | Caste/Aadhaar/PAN portal check (via X.3) |
| `item_status` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`COMMITTED`,`FAILED`,`REVERSED` |
| `commit_idempotency_key` | VARCHAR(80) UNIQUE | Y | | = item_id; single commit |
| `sr_posting_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`POSTED`,`FAILED` — observed status of the **G01-posted** SR event (G02 tracks/reconciles; does not post) |
| `retro_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`ACKED`,`FAILED` (FR-022) |
| `created_at` / `updated_at` | TIMESTAMP | N | now | |
| `is_deleted` | BOOLEAN | N | false | |

*Integrity:* `new_value IS NOT NULL OR clear_intent = true` (CHECK) — permits legitimate field clearing (R19); enforced as `VAL-G02-CLEARINTENT`.

#### E3 — `change_request_documents`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `cr_document_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `change_request_item_id` | UUID (FK) | Y | | Null = whole request |
| `document_id` | UUID (FK→documents G13/M11) | N | | G13 reference (`VAL-FILE`) |
| `doc_type` | VARCHAR(60) | N | | `PASSPORT`,`GAZETTE_NOTIFICATION`,`BANK_PROOF`,`CASTE_CERTIFICATE`,`COURT_ORDER`,`MEDICAL_GENDER_CERT`… |
| `verification_status` | ENUM | N | `UNVERIFIED` | `UNVERIFIED`,`VERIFIED`,`REJECTED` |
| `authority_portal_ref` | VARCHAR(200) | Y | | External portal verification reference (via X.3) |
| `authority_verification_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`VERIFIED`,`FAILED` |
| `verified_by` | UUID (FK→users) | Y | | |
| `verified_at` | TIMESTAMP | Y | | |
| `scan_status` | ENUM | N | `PENDING` | `PENDING`,`CLEAN`,`INFECTED` (G13 antivirus) |
| `created_at` | TIMESTAMP | N | now | |

#### E4 — `change_request_approvals` (keyed to P01 `workflow_actions`)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `approval_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `workflow_action_id` | UUID (FK→**workflow_actions P01**) | N | | ◆ Was `workflow_task_id`; one row per P01 action |
| `level_no` | SMALLINT | N | | 1..n sequence (P01 stage order) |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` (§15) |
| `topology` | ENUM | N | `SEQUENTIAL` | Maps to P01 pattern `SEQUENTIAL`/`PARALLEL_ALL_OF`/`PARALLEL_ANY_OF` ◆ |
| `required_role` | VARCHAR(60) | N | | RBAC role key / capability flag (P01 approver resolution) |
| `assigned_to` | UUID (FK→users) | Y | | Resolved assignee (or P01 delegate) |
| `delegated_from` | UUID (FK→users) | Y | | If acted via P01 `delegate` |
| `decision` | ENUM | N | `PENDING` | `PENDING`,`APPROVED`,`REJECTED`,`RETURNED`,`SKIPPED` |
| `decision_comment` | VARCHAR(1000) | Y | | Mandatory on REJECT/RETURN (`VAL-COMMENT`/`ERR-REASON-REQ`) |
| `esignature_id` | UUID (FK→esignatures) | Y | | Required for HIGH-financial/STATUTORY |
| `acted_at` | TIMESTAMP | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only (P05 captures) |

#### E5 — `field_sensitivity_catalog`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `field_key` | VARCHAR(80) (PK) | N | | G02 catalog key |
| `tenant_id` | UUID | N | | ◆ (catalog is tenant config; cascades platform→tenant→entity, §3.2) |
| `m01_field_key` | VARCHAR(120) | N | | Canonical G01/M01 path (§5.8) |
| `is_composite` | BOOLEAN | N | false | True for `name` |
| `display_label` | VARCHAR(120) | N | | |
| `field_group` | VARCHAR(60) | N | | Taxonomy ONLY: `DEMOGRAPHIC`,`CONTACT`,`FINANCIAL`,`IDENTITY`,`QUALIFICATION` |
| `sensitivity` | ENUM | N | | `LOW`,`MEDIUM`,`HIGH`,`STATUTORY` |
| `rbac_field_access` | ENUM | Y | | ◆ `V/M/H/E/AR` (RBAC §7); `E·AR` fields render "Request change" (Foundation §3) |
| `is_auth_bearing` | BOOLEAN | N | false | phone/email; forces ≥MEDIUM + notice, bars auto-apply (R1) |
| `notify_old_value` | BOOLEAN | N | false | Notify OLD contact value on change (anti-takeover, R1) |
| `requires_document` | BOOLEAN | N | false | |
| `required_doc_types` | JSONB | Y | | Allowed evidence doc types |
| `requires_authority_portal_verification` | BOOLEAN | N | false | Caste/Aadhaar/PAN portal check (R5/R12) |
| `requires_esignature` | BOOLEAN | N | false | |
| `allowed_esign_methods` | JSONB | Y | | Method policy per field/tier (`VAL-G02-ESIGN-METHOD`) |
| `tokenize_in_vault` | BOOLEAN | N | false | Aadhaar/PAN → vault token (R18) |
| `self_service_editable` | BOOLEAN | N | true | FALSE for `national_id`/`pan`/`category` (R5) |
| `hard_block_rule_ref` | VARCHAR(80) | Y | | e.g. `DOB_PRE_RETIREMENT_BAR` (`VAL-G02-HARDBLOCK`, R11) |
| `evidence_path` | VARCHAR(60) | Y | | `GAZETTE`,`AUTHORITY_PORTAL`,`COURT_ORDER`,`MEDICAL_DIGNITY` (gender, R12) |
| `post_to_sr` | BOOLEAN | N | false | STATUTORY fields → on commit **G01 posts the SR event** (`source_module=G01`); G02 is not an SR source |
| `sr_event_type` | VARCHAR(60) | Y | | G12 event_type (`VAL-G12-SREVENT`) |
| `retro_targets` | JSONB | Y | | e.g. `["G10","G11","G06"]` (FR-022) |
| `validation_ref` | VARCHAR(60) | Y | | ◆ Cited `VAL-*` id (e.g. `VAL-PAN`,`VAL-AADHAAR`,`VAL-IFSC`,`VAL-DOB`) |
| `validation_regex` | VARCHAR(300) | Y | | Module-unique format only; ReDoS-guarded (`VAL-G02-REGEXSAFE`) |
| `version` | INT | N | 1 | Config version (cascade & in-flight pinning, §3.2) |
| `effective_from` | DATE | N | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E6 — `approval_matrix_config`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `matrix_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `name` | VARCHAR(120) | N | | e.g. "Default Govt Matrix v3" |
| `workflow_code` | VARCHAR(60) | Y | | ◆ Bound P01 `workflow_code` (W.1 flow executed by engine) |
| `org_scope_id` | UUID (FK→org_units) | Y | | Null = entity default |
| `status` | ENUM | N | `DRAFT` | `DRAFT`,`ACTIVE`,`RETIRED` (config validated on save, §3.2) |
| `version` | INT | N | 1 | In-flight instances pin the version they began on (P01) ◆ |
| `effective_from` / `effective_to` | DATE | N/Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E7 — `approval_matrix_rules`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `rule_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `matrix_id` | UUID (FK) | N | | |
| `sensitivity` | ENUM | N | | `LOW`…`STATUTORY` |
| `field_group` / `field_key` / `change_type` | (optional overrides) | Y | | Precedence: field_key > field_group > sensitivity |
| `employment_status_scope` | VARCHAR(40) | Y | | Elevated route for non-ACTIVE (FR-018) |
| `level_no` | SMALLINT | N | | P01 stage sequence |
| `node_type` | ENUM | N | | `RECOMMEND`,`APPROVE`,`SANCTION`,`VERIFY` |
| `topology` | ENUM | N | `SEQUENTIAL` | P01 pattern (Appendix D) ◆ |
| `required_role` | VARCHAR(60) | N | | RBAC role key / capability flag |
| `sla_hours` | INT | N | 48 | P01 `sla_definition` per stage ◆ |
| `escalation_role` | VARCHAR(60) | Y | | P01 SLA breach target |
| `auto_apply_on_low` | BOOLEAN | N | false | FORCED false where `is_auth_bearing=true` (R1) |
| `created_at`/`updated_at` | — | N | | |

#### E8 — `delegations` (executed via P01 `delegate`)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `delegation_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `delegator_user_id` / `delegate_user_id` | UUID (FK→users) | N | | |
| `scope_org_unit_id` | UUID (FK→org_units) | Y | | Optional scope narrowing |
| `node_types` | JSONB | Y | | Which node types delegated |
| `delegate_holds_role_verified` | BOOLEAN | N | false | Delegate independently holds required role — verified by **P02** (no elevation, R21) ◆ |
| `valid_from` / `valid_to` | TIMESTAMP | N | | |
| `status` | ENUM | N | `ACTIVE` | `ACTIVE`,`REVOKED`,`EXPIRED` |
| `reason` | VARCHAR(500) | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E9 — `change_request_templates` (W.2 forms)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `template_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `name` | VARCHAR(120) | N | | e.g. "Change Bank Account" |
| `w2_form_ref` | VARCHAR(60) | Y | | ◆ Bound W.2 form id (fields/validation by `VAL-*`) |
| `description` | VARCHAR(500) | Y | | |
| `change_type` | ENUM | N | `UPDATE` | |
| `field_keys` | JSONB | N | | Pre-selected governed fields |
| `required_doc_types` | JSONB | Y | | Evidence guidance |
| `instructions` | TEXT | Y | | Help text |
| `org_scope_id` | UUID (FK→org_units) | Y | | |
| `is_active` | BOOLEAN | N | true | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E10 — `esignatures` (append-only; tamper-evidence per OPEN-PLAT-03)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `esignature_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `signer_user_id` | UUID (FK→users) | N | | |
| `sign_method` | ENUM | N | | `OTP`,`PKI_DSC`,`AADHAAR_ESIGN` (PASSWORD_REAUTH removed, R1) |
| `signed_payload_hash` | CHAR(64) | N | | SHA-256 of signed approval payload |
| `prev_chain_hash` / `chain_hash` | CHAR(64) | Y/N | | Hash-chain link; **tamper-evidence aligned to OPEN-PLAT-03** (chain head → WORM) ◆ |
| `signature_blob_ref` | VARCHAR(200) | Y | | PKI/DSC artefact ref (G13) |
| `signed_at` | TIMESTAMP | N | now | |
| `ip_address` / `user_agent` | VARCHAR | Y | | Audit (also captured by P05) |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E11 — `cr_sla_events` (mirror of P01 SLA runtime)

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `sla_event_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `workflow_action_id` | UUID (FK→workflow_actions P01) | Y | | ◆ |
| `event_type` | ENUM | N | | `SLA_SET`,`REMINDER_SENT`,`BREACHED`,`ESCALATED`,`REASSIGNED` (emitted by P01 SLA runtime / `JOB-G02-SLA`) |
| `due_at` | TIMESTAMP | Y | | |
| `triggered_at` | TIMESTAMP | N | now | |
| `escalated_to` | UUID (FK→users) | Y | | |
| `detail` | VARCHAR(500) | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E12 — `bulk_correction_batches`

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `bulk_batch_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `batch_number` | VARCHAR(24) UNIQUE | N | seq | `BLK-2026-0007` |
| `initiated_by` | UUID (FK→users) | N | | HR Officer/Admin |
| `source_file_ref` | VARCHAR(200) | Y | | Uploaded CSV/XLSX (G13) |
| `total_rows` / `valid_rows` / `invalid_rows` | INT | N | 0 | |
| `status` | ENUM | N | `UPLOADED` | `UPLOADED`,`VALIDATED`,`PENDING_APPROVAL`,`APPROVED`,`REJECTED`,`COMMITTED`,`PARTIAL_FAILED` |
| `dry_run_report_ref` | VARCHAR(200) | Y | | Validation report (G13) |
| `reason` | VARCHAR(1000) | Y | | |
| `approved_by` | UUID (FK→users) | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E13 — `cr_risk_signals` (append-only) — FR-G02-019

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `risk_signal_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `signal_type` | ENUM | N | | `DUPLICATE_BANK_ACCOUNT`,`PRE_PAYROLL_CUTOFF`,`PRE_SEPARATION_WINDOW`,`DEVICE_VELOCITY`,`MULTI_EMPLOYEE_SAME_DEVICE`,`AUTH_CHANNEL_THEN_FINANCIAL`,`OFF_HOURS_BURST` |
| `severity` | ENUM | N | | `INFO`,`WARN`,`HIGH`,`BLOCK` |
| `score_contribution` | SMALLINT | N | 0 | |
| `detail` | JSONB | Y | | Evidence (matching employee_ids for mule) |
| `detected_at` | TIMESTAMP | N | now | |
| `reviewed_by` | UUID (FK→users) | Y | | Fraud Reviewer (capability flag) |
| `review_outcome` | ENUM | Y | | `CLEARED`,`CONFIRMED_FRAUD`,`ESCALATED` |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E14 — `retro_impact_events` (append-only) — FR-G02-022

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `retro_event_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_item_id` | UUID (FK) | N | | |
| `target_module` | ENUM | N | | `G10`,`G11`,`G06` |
| `idempotency_key` | VARCHAR(100) UNIQUE | N | | = item_id + ':RETRO:' + target_module |
| `effective_date` | DATE | N | | Drives recomputation period |
| `payload` | JSONB | N | | field, old/new (masked), effective_date, change_type |
| `status` | ENUM | N | `PENDING` | `PENDING`,`SENT`,`ACKED`,`FAILED`,`DEAD_LETTER` (X.1 backoff ×3 → DLQ) |
| `ack_reference` | VARCHAR(120) | Y | | Downstream ack/recompute job id |
| `attempts` | SMALLINT | N | 0 | |
| `last_error` | VARCHAR(500) | Y | | |
| `acked_at` | TIMESTAMP | Y | | |
| `created_at` / `updated_at` | TIMESTAMP | N | now | |

#### E15 — `data_subject_notices` (append-only) — FR-G02-017

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `notice_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | N | | |
| `target_employee_id` | UUID (FK→employees) | N | | Data subject |
| `trigger_origin` | ENUM | N | | `HR_ON_BEHALF`,`BULK` |
| `channel` | ENUM | N | | `EMAIL`,`SMS`,`POSTAL`,`IN_APP` (out-of-band; dispatched via X.2/W.3) |
| `sent_at` | TIMESTAMP | Y | | |
| `delivery_status` | ENUM | N | `PENDING` | `PENDING`,`DELIVERED`,`FAILED` (X.2 backoff ×5 + DLQ) |
| `objection_window_ends_at` | TIMESTAMP | Y | | FINANCIAL: credit held until passes (`JOB-G02-NOTICE`) |
| `outcome` | ENUM | N | `AWAITING` | `AWAITING`,`CONFIRMED`,`OBJECTED`,`WINDOW_ELAPSED` |
| `objection_id` | UUID (FK→cr_objections) | Y | | If objected |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### E16 — `cr_objections` — FR-G02-021

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `objection_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `change_request_id` | UUID (FK) | Y | | Null if objecting to a committed change (→ reversal review) |
| `raised_by` | UUID (FK→users) | N | | Data subject |
| `objection_type` | ENUM | N | | `UNAUTHORISED_CHANGE`,`INCORRECT_VALUE`,`PRIVACY`,`OTHER` |
| `description` | VARCHAR(1000) | N | | `VAL-COMMENT` |
| `status` | ENUM | N | `OPEN` | `OPEN`,`UNDER_REVIEW`,`UPHELD`,`DISMISSED`,`RESOLVED` |
| `effect` | ENUM | N | `PAUSE` | `PAUSE` (pre-commit), `REVERSAL_REQUESTED` (post-commit) |
| `assigned_grievance_officer` | UUID (FK→users) | Y | | Grievance Officer capability flag |
| `resolution_comment` | VARCHAR(1000) | Y | | |
| `resolved_at` | TIMESTAMP | Y | | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | — | N | | |
| `is_deleted` | BOOLEAN | N | false | |

#### E17 — `cr_reversals` (append-only, dual-auth; SoD by P02) — FR-G02-020

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `reversal_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `original_change_request_id` | UUID (FK) | N | | The committed CR being reversed |
| `original_item_id` | UUID (FK→change_request_items) | N | | Specific item reversed |
| `reason` | VARCHAR(1000) | N | | Mandatory (`VAL-COMMENT`/`ERR-REASON-REQ`) |
| `auth1_user_id` / `auth2_user_id` | UUID (FK→users) | N | | Two distinct authorisers (≠ each other, ≠ maker — `VAL-G02-DUALAUTH`, P02 SoD) |
| `revert_to_value` | TEXT (encrypted) | Y | | Pre-change value restored |
| `reversing_sr_event_required` | BOOLEAN | N | false | True for statutory items (→ G12 reversing event) |
| `reversing_sr_status` | ENUM | Y | | `NOT_REQUIRED`,`PENDING`,`POSTED`,`FAILED` |
| `m01_revert_status` | ENUM | N | `PENDING` | `PENDING`,`APPLIED`,`FAILED` (effective-dated G01/M01 restore) |
| `idempotency_key` | VARCHAR(120) UNIQUE | N | | = item_id + ':REV:' + reversal_id |
| `executed_at` | TIMESTAMP | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only |

#### ~~E18 — `cr_audit_chain`~~ — REMOVED (re-grounded to P05 + OPEN-PLAT-03)

G02 defines **no** audit table. Every INSERT/UPDATE/soft-DELETE on every G02 table above is captured by the **P05 DB trigger** into `audit_log` (data) / `security_audit_log` (auth/permission/admin) — immutable, ≥7-yr, 100% capture, no API bypass (Platform §P05). Tamper-evidence (hash-chaining the audit partitions, chain head → WORM) tracks **OPEN-PLAT-03** — G02 consumes it rather than inventing a parallel chain (`MODULE_RECONCILIATION.md` §C). The `esignatures` ledger (E10) retains its own hash-chain (a gov-specific legal-signature artefact) aligned to the same OPEN-PLAT-03 mechanism.

#### E19 — `cr_step_up_events` (append-only; invokes platform MFA §3.1) — FR-G02-023

| Field | Type | Null | Default | Notes |
|---|---|:--:|---|---|
| `step_up_event_id` | UUID (PK) | N | gen | |
| `tenant_id` / `entity_id` | UUID | N | | ◆ |
| `user_id` | UUID (FK→users) | N | | The requester re-authenticated |
| `change_request_id` | UUID (FK) | Y | | Bound once the CR is created |
| `method` | ENUM | N | | `MFA_TOTP`,`MFA_PUSH`,`WEBAUTHN`,`OTP_SMS` (platform §3.1) |
| `challenge_ref` | VARCHAR(120) | N | | Platform auth challenge id |
| `result` | ENUM | N | | `SUCCESS`,`FAILED` |
| `auth_assurance_level` | VARCHAR(10) | N | | e.g. `AAL2` |
| `expires_at` | TIMESTAMP | N | | Step-up validity window (e.g. 10 min) |
| `ip_address` | VARCHAR(45) | Y | | |
| `created_at` | TIMESTAMP | N | now | Append-only (security_audit_log captures) |

### 5.3 Relationship map

```
employees (G01/M01) 1───* change_requests *───1 users (requested_by)
change_requests 1───1 workflow_instances (P01)  1───* workflow_actions (P01)
workflow_actions 1───1 change_request_approvals *───1 esignatures (optional, hash-chained per OPEN-PLAT-03)
change_requests 1───* change_request_items *───1 field_sensitivity_catalog (field_key→m01_field_key)
change_request_items 0/1───* change_request_items (parent_item_id; composite name)
change_requests 1───* change_request_documents *───1 documents (G13/M11)
change_requests 1───* cr_sla_events                  (mirrors P01 SLA runtime)
change_requests 1───* cr_risk_signals                (FR-019)
change_requests 1───1 data_subject_notices 0/1───1 cr_objections   (FR-017/021)
change_requests 1───1 cr_step_up_events              (FR-023; platform MFA)
change_request_items 1───* retro_impact_events *───1 (G10/G11/G06)  (FR-022)
change_request_items ··· service_register_events (G12; posted by G01 on STATUTORY commit / reversal — G02 reads status, does not write)
change_requests (REVERSAL) *───1 cr_reversals 1───1 change_request_items(original) (FR-020)
approval_matrix_config 1───* approval_matrix_rules  (bound to a W.1 P01 flow)
delegations *───1 users (delegator) / users (delegate, P02 role-verified)
* every state change ───> P05 audit_log / security_audit_log (DB-trigger; OPEN-PLAT-03 chain)
* every notify ───> notifications (X.2; IN_APP+EMAIL parallel)
* every entity carries tenant_id / entity_id (data-layer scoping)
```

### 5.4 Ownership / reuse matrix

| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `change_requests`/`_items`/`_documents`/`_approvals` | G02 | G14, Auditor (P05), G06 (freeze flag) | G02 |
| `field_sensitivity_catalog`, `approval_matrix_*`, `delegations`, `templates` | G02 | G02 | System Admin via W.1/W.2 |
| `esignatures`, `cr_sla_events`, `bulk_correction_batches` | G02 | Auditor, G14 | G02 |
| `cr_risk_signals`, `cr_step_up_events` | G02 | Auditor, Fraud Reviewer | G02 |
| `retro_impact_events` | G02 | G10, G11, G06, Auditor | G02 (status updated on ACK) |
| `data_subject_notices`, `cr_objections` | G02 | Grievance Officer, Auditor, data subject | G02 |
| `cr_reversals` | G02 | Auditor, SR Custodian, G10/G11 | G02 (dual-auth, P02 SoD) |
| `employees` | G01/M01 | G02 (read + effective-dated commit) | G01/M01 |
| `documents` | G13/M11 | G02 | G13 (G02 references) |
| `service_register_events` | **G12** | G02 (reads status) | G12 (**G01 posts** identity/personal-data events + reversing events on commit; G02 is not a writer) |
| `workflows`/`workflow_instances`/`workflow_actions` | **P01** | G02 | P01 (G02 configures + orchestrates) |
| `audit_log`/`security_audit_log` | **P05** | G02, Auditor | DB trigger (no app writes) |
| `notifications` | **X.2** | G02, Auditor | X.2 (G02 configures via W.3) |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| `request_origin` | `SELF_SERVICE`, `HR_ON_BEHALF`, `BULK`, `REVERSAL` |
| `change_type` | `UPDATE`, `CORRECTION`, `REVERSAL` |
| `sensitivity` | `LOW`, `MEDIUM`, `HIGH`, `STATUTORY` |
| `rbac_field_access` | `V`, `M`, `H`, `E`, `AR` (RBAC §7; `E·AR` → "Request change" Foundation §3) |
| `field_group` (taxonomy only) | `DEMOGRAPHIC`, `CONTACT`, `FINANCIAL`, `IDENTITY`, `QUALIFICATION` |
| `change_requests.status` | `DRAFT`, `SUBMITTED`, `PENDING_DOCS`, `IN_REVIEW`, `NOTICE_HOLD`, `OBJECTED`, `RETURNED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `COMMITTED`, `PARTIALLY_COMMITTED`, `COMMIT_FAILED`, `REVERSED`, `CANCELLED` |
| `item_status` | `PENDING`, `APPROVED`, `REJECTED`, `COMMITTED`, `FAILED`, `REVERSED` |
| `risk_band` | `LOW`, `MEDIUM`, `HIGH`, `BLOCKED` |
| `node_type` | `RECOMMEND`, `APPROVE`, `SANCTION`, `VERIFY` |
| `topology` (→ P01 pattern) | `SEQUENTIAL`, `PARALLEL` (`PARALLEL_ALL_OF`/`PARALLEL_ANY_OF`) |
| `decision` | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED`, `SKIPPED` |
| `verification_status` | `UNVERIFIED`, `VERIFIED`, `REJECTED` |
| `authority_verification_status` | `NOT_REQUIRED`, `PENDING`, `VERIFIED`, `FAILED` |
| `scan_status` | `PENDING`, `CLEAN`, `INFECTED` |
| `sr_posting_status` | `NOT_REQUIRED`, `PENDING`, `POSTED`, `FAILED` |
| `retro_impact_events.status` | `PENDING`, `SENT`, `ACKED`, `FAILED`, `DEAD_LETTER` |
| `sign_method` | `OTP`, `PKI_DSC`, `AADHAAR_ESIGN` (PASSWORD_REAUTH removed) |
| `step_up.method` | `MFA_TOTP`, `MFA_PUSH`, `WEBAUTHN`, `OTP_SMS` |
| `sla_event_type` | `SLA_SET`, `REMINDER_SENT`, `BREACHED`, `ESCALATED`, `REASSIGNED` |
| `delegation.status` | `ACTIVE`, `REVOKED`, `EXPIRED` |
| `bulk_batch.status` | `UPLOADED`, `VALIDATED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `COMMITTED`, `PARTIAL_FAILED` |
| `risk_signal.signal_type` | (see E13) |
| `objection.status` | `OPEN`, `UNDER_REVIEW`, `UPHELD`, `DISMISSED`, `RESOLVED` |
| `data_subject_notice.outcome` | `AWAITING`, `CONFIRMED`, `OBJECTED`, `WINDOW_ELAPSED` |
| `employment_status` (read from G01/M01) | `ACTIVE`, `ON_LEAVE`, `SUSPENDED`, `TRANSFERRED`, `RETIRED`, `RESIGNED`, `DECEASED`, `TERMINATED` |

**Reference: default field sensitivity seed (re-grounded — `VAL-*` cited, `E·AR` mapped; illustrative, configurable via W.1/W.2)**

| field_key | m01_field_key | group | sensitivity | E·AR | auth-bearing | VAL ref | authority-portal | e-sign | self-svc | post_to_sr (G12) | hard-block |
|---|---|---|---|:--:|:--:|---|:--:|---|:--:|:--:|---|
| `correspondence_address` | `employee_addresses(CORRESPONDENCE)` | CONTACT | LOW | No | No | VAL-PINCODE/VAL-TEXT | No | — | Yes | No | — |
| `alternate_phone` | `employee_contacts.alt_phone` | CONTACT | MEDIUM | No | Yes | VAL-MOBILE | No | — (notify old) | Yes | No | — |
| `primary_phone` | `employee_contacts.phone` | CONTACT | MEDIUM | No | Yes | VAL-MOBILE | No | — (notify old) | Yes | No | — |
| `email` | `employee_contacts.email` | CONTACT | MEDIUM | No | Yes | VAL-EMAIL | No | — (notify old) | Yes | No | — |
| `permanent_address` | `employee_addresses(PERMANENT)` | CONTACT | MEDIUM | No | No | VAL-PINCODE/VAL-TEXT | No | — | Yes | No | — |
| `marital_status` | `employees.marital_status` | DEMOGRAPHIC | MEDIUM | No | No | VAL-ENUM | No | — | Yes | No | — |
| `qualification` | `employee_qualifications` | QUALIFICATION | HIGH | No | No | VAL-ENUM/VAL-FILE | No | OTP+ | Yes | No | — |
| `bank_account_no` | `employee_bank_accounts.account_number` | FINANCIAL | HIGH | **AR** | No | VAL-IFSC (+acct) | No | **PKI_DSC / AADHAAR_ESIGN** | Yes | No | — |
| `first_name` | `employees.first_name` | DEMOGRAPHIC | STATUTORY | No | No | VAL-NAME | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `middle_name` | `employees.middle_name` | DEMOGRAPHIC | STATUTORY | No | No | VAL-NAME | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `last_name` | `employees.last_name` | DEMOGRAPHIC | STATUTORY | No | No | VAL-NAME | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `dob` | `employees.dob` | DEMOGRAPHIC | STATUTORY | No | No | VAL-DOB | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | **`DOB_PRE_RETIREMENT_BAR`** |
| `gender` | `employees.gender` | DEMOGRAPHIC | STATUTORY | No | No | VAL-ENUM (+evidence_path) | No | PKI_DSC / AADHAAR_ESIGN | Yes | Yes | — |
| `national_id` (Aadhaar) | `employees.national_id` / `employee_identity_documents(AADHAAR)` | IDENTITY | STATUTORY | **AR** | No | **VAL-AADHAAR** | **Yes (UIDAI)** | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** | Yes | — |
| `pan` | `employees.pan` / `employee_identity_documents(PAN)` | IDENTITY | STATUTORY | **AR** | No | **VAL-PAN** | **Yes (Income-Tax)** | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** | Yes | — |
| `category` (social category) | `employees.category` | IDENTITY | STATUTORY | **AR** | No | VAL-ENUM | **Yes (caste portal)** | PKI_DSC / AADHAAR_ESIGN | **No (HR-only)** | Yes | — (G06 freeze) |

*Re-grounding notes:* sensitive identity/financial fields are `E·AR` → render the platform **"Request change"** control (Foundation §3); statutory format validation cites the platform **`VAL-*`** ids (never restated); `bank_account_no` strong-method-only e-sign (R1); Aadhaar/PAN/category HR-only + authority-portal (via X.3); `name` decomposed (R9); `dob` hard-block (R11); `gender` `evidence_path` (R12); `field_group` excludes `STATUTORY` (it is a sensitivity, not a group).

### 5.6 Data integrity rules

1. **SoD constraint (P01/P02):** enforced by the platform — `change_request_approvals.assigned_to ≠ change_requests.requested_by` and ≠ target's `user_id`; multi-role intersection + deny-by-default (P02). DB CHECK additionally guards (`VAL-G02-SOD`); attempted breach → 403 `FORBIDDEN`/`ERR-G02-SOD`.
2. **Stale-value guard:** at commit, `old_value_hash` must equal SHA-256 of current G01/M01 value; mismatch → 409 `CONFLICT`/`ERR-G02-STALE`, request → `RETURNED` (`VAL-G02-STALEHASH`).
3. **Single-commit invariant:** `commit_idempotency_key` UNIQUE + `Idempotency-Key` header; commit is a no-op if `item_status = COMMITTED`.
4. **Document gate:** request cannot move past `PENDING_DOCS` while any item with `requires_document` lacks a `VERIFIED`+`CLEAN` (G13) document; `requires_authority_portal_verification` items additionally require `authority_verification_status = VERIFIED`. Unmet → 412 `PRECONDITION_FAILED`/`ERR-PRECOND`.
5. **E-sign gate & method policy:** STATUTORY/FINANCIAL-HIGH approvals require a non-null `esignature_id` whose `sign_method ∈ allowed_esign_methods`; `OTP` forbidden for FINANCIAL/STATUTORY (`VAL-G02-ESIGN-METHOD`); `PASSWORD_REAUTH` does not exist.
6. **Effective-date rule (`VAL-EFFECTIVE`):** for `CORRECTION`, `effective_from` ≤ original master value date and ≥ DOJ; for `UPDATE`, `effective_from` ≥ today (configurable grace); staged by `JOB-G01-EFFDATE` (§3.3). Disallowed back-date → 422/`ERR-PAST-DATED`.
7. **Sensitivity derivation:** `highest_sensitivity` = MAX of item sensitivities; P01 route derived from this; not user-overridable. **Mixed-request principle:** all-or-nothing at the highest tier present.
8. **FK integrity:** all FKs enforced; no orphans.
9. **Append-only / immutable ledgers:** `change_request_approvals`, `esignatures`, `cr_sla_events`, `cr_risk_signals`, `retro_impact_events`, `cr_reversals`, `data_subject_notices`, `cr_step_up_events`, and G12 `service_register_events` are append-only. **Audit immutability is P05's** (no UPDATE/DELETE grant; redaction-marker only).
10. **Pagination bound:** all list reads use **cursor paging**, `limit` default 25 / max 100, `next_cursor`.
11. **Commit/SR/retro sequencing (R15):** canonical order **G01/M01 effective-dated commit → item `COMMITTED` → G12 SR `PENDING`→`POSTED/FAILED` and retro `PENDING`→`ACKED/FAILED`**. SR/retro tracked separately and **never** gate `COMMITTED`.
12. **Employment-status gate (R3):** request rejected/elevated per `employment_status_at_submit`; self-service blocked for non-`ACTIVE` (`ERR-G02-STATUSGATE`); deceased bank/nominee → family-pension path (FR-018).
13. **Tamper-evidence (R6):** every audit-relevant write is captured by the **P05 DB trigger**; tamper-evidence via **OPEN-PLAT-03** hash-chaining (chain head → WORM); a periodic verifier (`JOB-G02-AUDITVERIFY`, consuming the P05/OPEN-PLAT-03 chain) alarms on break.
14. **Statutory hard-block (R11):** an item whose `hard_block_rule_ref` evaluates true (DOB pre-retirement) is blocked → 412 `PRECONDITION_FAILED`/`ERR-G02-HARDBLOCK`; divertible only to the legal-process path (`VAL-G02-HARDBLOCK`).
15. **Identity tokenisation (R18):** `tokenize_in_vault=true` items carry `vault_token_ref`; raw value never in `new_value`/`old_value`; P05 stores PII masked.
16. **Auth-bearing reclassification (R1):** `is_auth_bearing=true` ⇒ `sensitivity ≥ MEDIUM` and `auto_apply_on_low=false` (config-save validation, `VAL-G02-AUTHBEAR`).
17. **Reversal dual-auth (R13):** `auth1 ≠ auth2 ≠ original maker` (CHECK + P02 SoD; `VAL-G02-DUALAUTH`).
18. **Regex safety (R17):** admin module-unique `validation_regex` length/complexity-bounded + safe-regex compile + timeout (`VAL-G02-REGEXSAFE`); statutory formats use platform `VAL-*` (never re-authored).
19. **Config validation on save (§3.2):** W.1/W.2 configs are versioned and validated on save (no circular stage — `VAL-FLOW-NOCYCLE`; assignee resolvable; SLA defined); in-flight instances pin their version (P01).

### 5.7 Sample data (2–3 rows per module-owned entity; tenancy shown)

**change_requests**

| change_request_id | tenant_id | entity_id | cr_number | target_employee_id | requested_by | request_origin | change_type | highest_sensitivity | status | workflow_instance_id | risk_band |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 7a1…e01 | tn-gov | en-rev | CR-2026-000123 | emp-001 | usr-emp-001 | SELF_SERVICE | UPDATE | MEDIUM | COMMITTED | wfi-9001 | LOW |
| 7a1…e02 | tn-gov | en-rev | CR-2026-000124 | emp-045 | usr-emp-045 | SELF_SERVICE | CORRECTION | STATUTORY | IN_REVIEW | wfi-9002 | LOW |
| 7a1…e03 | tn-gov | en-fin | CR-2026-000125 | emp-077 | usr-hr-009 | HR_ON_BEHALF | UPDATE | HIGH | NOTICE_HOLD | wfi-9003 | HIGH |

**change_request_items**

| change_request_item_id | tenant_id | change_request_id | field_key | m01_field_key | old_value | new_value | clear_intent | sensitivity | item_status | retro_status |
|---|---|---|---|---|---|---|:--:|---|---|---|
| it-001 | tn-gov | 7a1…e01 | alternate_phone | employee_contacts.alt_phone | +91-90000-11111 | +91-98888-22222 | false | MEDIUM | COMMITTED | NOT_REQUIRED |
| it-002 | tn-gov | 7a1…e02 | dob | employees.dob | 1990-05-21 | 1990-05-12 | false | STATUTORY | PENDING | PENDING |
| it-003 | tn-gov | 7a1…e03 | bank_account_no | employee_bank_accounts.account_number | XXXX4321 | XXXX9876 | false | HIGH | PENDING | PENDING |
| it-004 | tn-gov | 7a1…e02 | middle_name | employees.middle_name | Kumar | (null) | true | STATUTORY | PENDING | NOT_REQUIRED |

**change_request_documents**

| cr_document_id | tenant_id | change_request_id | change_request_item_id | document_id | doc_type | verification_status | authority_verification_status | scan_status |
|---|---|---|---|---|---|---|---|---|
| crd-01 | tn-gov | 7a1…e02 | it-002 | doc-9001 | GAZETTE_NOTIFICATION | VERIFIED | NOT_REQUIRED | CLEAN |
| crd-02 | tn-gov | 7a1…e02 | it-002 | doc-9002 | BIRTH_CERTIFICATE | VERIFIED | NOT_REQUIRED | CLEAN |
| crd-03 | tn-gov | 7a1…e03 | it-003 | doc-9100 | BANK_PROOF | UNVERIFIED | NOT_REQUIRED | CLEAN |

**change_request_approvals** (keyed to P01 `workflow_actions`)

| approval_id | tenant_id | change_request_id | workflow_action_id | level_no | node_type | topology | required_role | assigned_to | decision | esignature_id |
|---|---|---|---|---|---|---|---|---|---|---|
| apr-01 | tn-gov | 7a1…e01 | wfa-1 | 1 | APPROVE | SEQUENTIAL | HRBP | usr-hr-002 | APPROVED | null |
| apr-02 | tn-gov | 7a1…e02 | wfa-2 | 1 | VERIFY | SEQUENTIAL | HRBP | usr-hr-002 | APPROVED | null |
| apr-03 | tn-gov | 7a1…e02 | wfa-3 | 2 | SANCTION | SEQUENTIAL | APPOINTING_AUTHORITY | usr-aa-001 | PENDING | null |

**field_sensitivity_catalog**

| field_key | tenant_id | m01_field_key | field_group | sensitivity | rbac_field_access | is_auth_bearing | requires_authority_portal_verification | self_service_editable | hard_block_rule_ref | post_to_sr | validation_ref |
|---|---|---|---|---|---|:--:|:--:|:--:|---|:--:|---|
| dob | tn-gov | employees.dob | DEMOGRAPHIC | STATUTORY | H | false | false | true | DOB_PRE_RETIREMENT_BAR | true | VAL-DOB |
| email | tn-gov | employee_contacts.email | CONTACT | MEDIUM | E | true | false | true | null | false | VAL-EMAIL |
| national_id | tn-gov | employees.national_id | IDENTITY | STATUTORY | AR | false | true | false | null | true | VAL-AADHAAR |

**approval_matrix_config**

| matrix_id | tenant_id | entity_id | name | workflow_code | status | version | effective_from |
|---|---|---|---|---|---|---|---|
| mx-001 | tn-gov | null | Default Govt Matrix | WF-G02-SENSITIVE-CHANGE | ACTIVE | 3 | 2026-06-01 |
| mx-002 | tn-gov | en-secr | Secretariat Override | WF-G02-SENSITIVE-CHANGE | DRAFT | 1 | 2026-08-01 |

**approval_matrix_rules**

| rule_id | tenant_id | matrix_id | sensitivity | employment_status_scope | level_no | node_type | topology | required_role | sla_hours | escalation_role | auto_apply_on_low |
|---|---|---|---|---|---|---|---|---|---|---|:--:|
| rl-01 | tn-gov | mx-001 | LOW | ACTIVE | 1 | APPROVE | SEQUENTIAL | HRBP | 24 | hr_admin | false |
| rl-02 | tn-gov | mx-001 | HIGH | ACTIVE | 1 | VERIFY | SEQUENTIAL | HRBP | 48 | hr_admin | false |
| rl-03 | tn-gov | mx-001 | STATUTORY | DECEASED | 2 | SANCTION | SEQUENTIAL | APPOINTING_AUTHORITY | 72 | APPOINTING_AUTHORITY | false |

**delegations**

| delegation_id | tenant_id | delegator_user_id | delegate_user_id | delegate_holds_role_verified | valid_from | valid_to | status |
|---|---|---|---|:--:|---|---|---|
| dl-01 | tn-gov | usr-aa-001 | usr-aa-002 | true (P02-verified) | 2026-06-25 | 2026-07-05 | ACTIVE |
| dl-02 | tn-gov | usr-hr-002 | usr-hr-003 | true | 2026-05-01 | 2026-05-10 | EXPIRED |

**change_request_templates**

| template_id | tenant_id | name | w2_form_ref | change_type | field_keys | is_active |
|---|---|---|---|---|---|---|
| tpl-01 | tn-gov | Update Contact Details | FORM-G02-CONTACT | UPDATE | ["correspondence_address","alternate_phone"] | true |
| tpl-02 | tn-gov | Bank Account Change | FORM-G02-BANK | UPDATE | ["bank_account_no"] | true |

**esignatures**

| esignature_id | tenant_id | change_request_id | signer_user_id | sign_method | chain_hash | signed_at |
|---|---|---|---|---|---|---|
| es-01 | tn-gov | 7a1…e02 | usr-aa-001 | PKI_DSC | 9f3a…c1 | 2026-06-28T10:14:00Z |
| es-02 | tn-gov | 7a1…e03 | usr-hr-002 | AADHAAR_ESIGN | 2b7d…e4 | 2026-06-27T09:00:00Z |

**cr_sla_events**

| sla_event_id | tenant_id | change_request_id | workflow_action_id | event_type | due_at | escalated_to |
|---|---|---|---|---|---|---|
| sl-01 | tn-gov | 7a1…e02 | wfa-2 | SLA_SET | 2026-07-01T00:00:00Z | null |
| sl-02 | tn-gov | 7a1…e03 | wfa-x | BREACHED | 2026-06-29T00:00:00Z | usr-hr-admin-1 |

**bulk_correction_batches**

| bulk_batch_id | tenant_id | batch_number | initiated_by | total_rows | valid_rows | invalid_rows | status |
|---|---|---|---|---|---|---|---|
| blk-01 | tn-gov | BLK-2026-0007 | usr-hr-009 | 250 | 248 | 2 | PENDING_APPROVAL |
| blk-02 | tn-gov | BLK-2026-0008 | usr-hr-010 | 30 | 30 | 0 | COMMITTED |

**cr_risk_signals**

| risk_signal_id | tenant_id | change_request_id | signal_type | severity | score_contribution | review_outcome |
|---|---|---|---|---|---|---|
| rs-01 | tn-gov | 7a1…e03 | DUPLICATE_BANK_ACCOUNT | HIGH | 60 | ESCALATED |
| rs-02 | tn-gov | 7a1…e03 | PRE_PAYROLL_CUTOFF | WARN | 20 | null |
| rs-03 | tn-gov | 7a1…e01 | DEVICE_VELOCITY | INFO | 5 | CLEARED |

**retro_impact_events**

| retro_event_id | tenant_id | change_request_item_id | target_module | idempotency_key | effective_date | status | acked_at |
|---|---|---|---|---|---|---|---|
| re-01 | tn-gov | it-002 | G11 | it-002:RETRO:G11 | 1990-05-12 | ACKED | 2026-06-29T11:00:00Z |
| re-02 | tn-gov | it-002 | G06 | it-002:RETRO:G06 | 1990-05-12 | PENDING | null |

**data_subject_notices**

| notice_id | tenant_id | change_request_id | target_employee_id | trigger_origin | channel | objection_window_ends_at | outcome |
|---|---|---|---|---|---|---|---|
| dsn-01 | tn-gov | 7a1…e03 | emp-077 | HR_ON_BEHALF | SMS | 2026-07-02T00:00:00Z | AWAITING |
| dsn-02 | tn-gov | 7a1…e05 | emp-088 | BULK | EMAIL | 2026-07-03T00:00:00Z | CONFIRMED |

**cr_objections**

| objection_id | tenant_id | change_request_id | raised_by | objection_type | status | effect |
|---|---|---|---|---|---|---|
| obj-01 | tn-gov | 7a1…e03 | usr-emp-077 | UNAUTHORISED_CHANGE | UNDER_REVIEW | PAUSE |
| obj-02 | tn-gov | null | usr-emp-090 | INCORRECT_VALUE | OPEN | REVERSAL_REQUESTED |

**cr_reversals**

| reversal_id | tenant_id | original_change_request_id | original_item_id | auth1_user_id | auth2_user_id | reversing_sr_required | m01_revert_status |
|---|---|---|---|---|---|:--:|---|
| rev-01 | tn-gov | 7a1…e09 | it-090 | usr-hr-admin-1 | usr-aa-001 | false | APPLIED |
| rev-02 | tn-gov | 7a1…e11 | it-110 | usr-hr-admin-2 | usr-aa-001 | true | PENDING |

**cr_step_up_events**

| step_up_event_id | tenant_id | user_id | change_request_id | method | result | auth_assurance_level | expires_at |
|---|---|---|---|---|---|---|---|
| su-01 | tn-gov | usr-emp-045 | 7a1…e02 | WEBAUTHN | SUCCESS | AAL2 | 2026-06-28T10:05:00Z |
| su-02 | tn-gov | usr-emp-077 | null | MFA_TOTP | FAILED | AAL2 | 2026-06-28T10:20:00Z |

*(Audit rows are not shown — they live in P05 `audit_log`/`security_audit_log`, written by DB trigger, not a G02 table.)*

### 5.8 Field-Key Registry (G02 catalog → G01/M01 master) — Improvement 10 / R9

Binds every G02 catalog `field_key` to the **actual** G01/M01 master key. Build agents MUST use `m01_field_key` for the effective-dated commit; the legacy v1 single `name`/`category_caste`/`national_id` keys are corrected here.

| G02 catalog `field_key` | v1 (wrong) key | G01/M01 canonical `m01_field_key` | Notes |
|---|---|---|---|
| `first_name` | part of `name` | `employees.first_name` | Composite parent `name` expands to first/middle/last |
| `middle_name` | part of `name` | `employees.middle_name` | Nullable; supports `clear_intent` |
| `last_name` | part of `name` | `employees.last_name` | |
| `dob` | `dob` | `employees.dob` | Effective-dated (`JOB-G01-EFFDATE`); hard-block applies; `VAL-DOB` |
| `gender` | `gender` | `employees.gender` | `evidence_path` distinguishes data-error vs dignity recognition |
| `category` (social category) | `category_caste` | `employees.category` (GEN/OBC/SC/ST/EWS) | NOT `cadre` (a service attribute owned by G06) |
| `national_id` (Aadhaar) | `national_id` | `employees.national_id` + `employee_identity_documents(AADHAAR)` | Vault-tokenised; HR-only; `VAL-AADHAAR` |
| `pan` | (absent) | `employees.pan` + `employee_identity_documents(PAN)` | `VAL-MASTER-UNIQUE` on G01; HR-only; `VAL-PAN` |
| `bank_account_no` | `bank_account_no` | `employee_bank_accounts.account_number` | Effective-dated; `VAL-IFSC` for branch |
| `correspondence_address`/`permanent_address` | same | `employee_addresses(<type>)` | Effective-dated address rows |
| `email`/`primary_phone`/`alternate_phone` | `alternate_phone` only | `employee_contacts.<field>` | Auth-bearing → MEDIUM + notify old; `VAL-EMAIL`/`VAL-MOBILE` |

**Note on `cadre`:** v1's `category_caste` conflated social/reservation category with service cadre. v3 maps personal-detail caste/category to `employees.category` and excludes `cadre` (service-cadre changes are G05/G06 events, out of G02 scope).


---

## 6. Functional Requirements

> Each FR carries: ID, Module, Primary Role(s) (RBAC v1.7), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References (`/api/v1`, platform conventions), UI Behavior Notes, Edge Cases, and a Low-Level Design (LLD) table. Platform re-grounding is marked ◆; v2 enhancements ★ (trace to §1.8). All approval routing is **P01**; all authz is **P02**; all audit is **P05**; all notification is **X.2**; all field validation cites **`VAL-*`**.

---

### FR-G02-001 — Create & Submit a Personal-Details Change Request

- **Module:** G02-EPDM
- **Primary Role(s):** Employee (Self-Service), HR Officer/HRBP (on behalf)
- **User Story:** *As an employee, I want to request a change to my personal details with a clear before/after preview and supporting documents, so that my record is updated accurately and with proper approval.*

**Description:** Provides the guided **W.2 form** to create a `change_requests` header and `change_request_items`. The form is scoped by **P02 `Authorization.check`** (ownership/scope/field access + `self_service_editable` + **employment-status gate, FR-018**). On selecting an `E·AR` field the platform renders the **"Request change"** control (Foundation §3) — never a direct write. Current master value is fetched read-only ("before"); the requester supplies the "new" value (or `clear_intent`), reason, change type and `effective_from`. **Composite `name` expands to sub-items.** On submit, the system computes `highest_sensitivity`, evaluates **fraud signals (FR-019)**, requires **step-up (FR-023) for HIGH/STATUTORY self-service**, and calls **`WorkflowEngine.startInstance({workflow_code, subject_ref=change_request_id, context, initiator})`** (◆) to bind the P01 instance, transitioning to `SUBMITTED`/`PENDING_DOCS` (or `NOTICE_HOLD` for HR_ON_BEHALF pending data-subject notice).

**Acceptance Criteria:**
1. Requester can only add fields P02 authorises on the target; `self_service_editable=false` fields (Aadhaar/PAN/category) are not selectable in self-service.
2. For each item the current master value is stored as `old_value` + `old_value_hash`; tokenised fields store only `vault_token_ref` + masked form.
3. Submission rejected with **422 `VALIDATION_FAILED`** if a cited `VAL-*` fails, the effective-date rule (`VAL-EFFECTIVE`) is violated, a required document type is missing, or `new_value` is null without `clear_intent` (`VAL-G02-CLEARINTENT`).
4. On valid submit, exactly **one P01 `workflow_instance`** is created (`startInstance`); a duplicate open change → **409 `CONFLICT`/`ERR-DUP-INSTANCE`**. Status becomes `SUBMITTED`/`PENDING_DOCS` (or `NOTICE_HOLD`).
5. **Employment-status gate:** self-service blocked (**403 `FORBIDDEN`/`ERR-G02-STATUSGATE`**) for non-`ACTIVE`; HR-on-behalf routes to the elevated path (FR-018).
6. A `cr_number` is generated; **P05** captures the mutation (DB trigger); an **X.2** requester confirmation (IN_APP+EMAIL) is dispatched (`MSG-G02-SUBMITTED`).
7. **Step-up gate:** initiating HIGH/STATUTORY self-service without a valid unexpired `cr_step_up_events.SUCCESS` → **412 `PRECONDITION_FAILED`/`ERR-G02-STEPUP`**.
8. Drafts can be saved without routing and resumed.

**Business Rules:**
- BR1: A self-service requester's `target_employee_id` must equal their own employee record (P02 own-record scope).
- BR2: HR-on-behalf requires the target within the requester's `entity_id`/`org_unit` scope **and triggers a data-subject notice (FR-017)**.
- BR3: `highest_sensitivity` is system-derived; the P01 route is not user-editable.
- BR4: One open change per field per employee across concurrent non-terminal requests → 409 `CONFLICT`.
- BR5: The request snapshots `employment_status_at_submit`; status gating (FR-018) and step-up (FR-023) precede `startInstance`.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | INSERT | header, status, change_type, effective_date, employment_status_at_submit, step_up_event_id, workflow_instance_id ◆ |
| `change_request_items` | INSERT | field_key, m01_field_key, old/new value, clear_intent, sensitivity, vault_token_ref |
| `field_sensitivity_catalog` | READ | sensitivity, VAL ref, doc/e-sign/portal rules, self_service_editable, rbac_field_access |
| `employees` (G01/M01) | READ | current value + version/hash + employment_status |
| `workflow_instances` (P01) | INSERT (via `startInstance`) ◆ | route binding |
| `notifications` (X.2) | INSERT | confirmation |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests` | Create draft (`Idempotency-Key`) |
| PATCH | `/api/v1/change-requests/{id}` | Edit draft items |
| POST | `/api/v1/change-requests/{id}/submit` | Validate + `startInstance` (P01) |
| GET | `/api/v1/employees/{id}/editable-fields` | P02-authorized editable fields + current values (status-gated) |

**UI Behavior Notes:** Two-column item editor (before | after) using the platform **"Request change" `E·AR`** pattern; per-field help; inline validation mapped to the error envelope `field`; reason textarea; effective-date picker; **"Clear this field"** control; document attach zone (G13); step-up prompt for sensitive fields; "How this will be reviewed" route panel. Aadhaar/PAN/category shown as **"HR-assisted only"**. Canonical UI states (empty/loading/error/no-permission/partial-data) per Foundation §3.

**Edge Cases:** Master value changed between draft and submit (re-snapshot + warn); duplicate open change (409 `ERR-DUP-INSTANCE`); requester loses scope mid-draft (block submit); non-governed field via API (403 `FORBIDDEN`); target becomes non-ACTIVE between draft and submit (re-gate); step-up expired at submit (re-challenge).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeRequestEditor`, `ClearFieldControl`, `StepUpModal`, `ReviewSubmitModal`; client validates before enabling Submit. |
| Backend-Service Flow | `ChangeRequestService.createDraft()→addItems()→submit()`: P02 check → status-gate (018) → step-up check (023) → snapshot master + hash → derive sensitivity → fraud-eval (019) → **`WorkflowEngine.startInstance()`** ◆ → set status → data-subject notice (017) if HR_ON_BEHALF. |
| Data Operations | INSERT header + items (txn); P01 `startInstance`; UPDATE status; P05 trigger captures; X.2 notification. |
| Validation Logic | P02 ownership/scope/field; status gate; step-up; cited `VAL-*`; `VAL-EFFECTIVE`; one-open-change; doc-presence; `VAL-G02-CLEARINTENT`. |
| Authorization Logic | `Authorization.check({subject, action:create, resource:change_request, fields[]})` → allowed + field_mask. |
| State Changes & Side Effects | `DRAFT`→`SUBMITTED`/`PENDING_DOCS`/`NOTICE_HOLD`; P01 SLA timer set; confirmation + data-subject notice. |
| Failure Handling | Partial insert rolled back; `startInstance` failure → remain DRAFT; master-read failure → 412/`ERR-PRECOND` (fail-closed). |
| Dependencies & Reuse | G01/M01 read; **P01** `startInstance`; **P02**; FR-002/003/017/018/019/023. |
| Test Guidance | LOW vs STATUTORY submit; clear-intent; composite name; status-gate block; step-up enforce; HR_ON_BEHALF notice; duplicate-open `ERR-DUP-INSTANCE`; unauthorized field. |

---

### FR-G02-002 — Field Sensitivity Classification & P01 Approval Routing

- **Module:** G02-EPDM
- **Primary Role(s):** System (configured P01 flow); configured by System Admin (FR-012)
- **User Story:** *As the HR governance owner, I want each request routed automatically based on the sensitivity of the fields it touches, so that sensitive changes get the right scrutiny without manual routing.*

**Description:** The **configured P01 flow (W.1)** + `field_sensitivity_catalog` deterministically map a request's items and the active `approval_matrix_config` (org-scope **and `employment_status` scope**) to an ordered set of P01 stages, persisted as `change_request_approvals` keyed to **`workflow_actions`** (◆). It resolves highest sensitivity, applies field/group/change-type/status overrides, attaches **P01 `sla_definition`** + escalation, and marks LOW items auto-apply **only where the field is not `is_auth_bearing`**. P01 patterns used: `SEQUENTIAL`, `PARALLEL_ALL_OF` (all-required), `PARALLEL_ANY_OF` (any-one), `CONDITIONAL` (fraud-node injection), `DYNAMIC_APPROVER` (runtime approver set) (◆).

**Acceptance Criteria:**
1. Given items {LOW, HIGH}, the route reflects HIGH (highest wins).
2. Active matrix selected by org-scope precedence (most specific first, else entity/global); `employment_status` scope overrides apply for non-ACTIVE.
3. Sequential stages execute in `level_no` order; `PARALLEL_ALL_OF` joins only when every branch completes; `PARALLEL_ANY_OF` completes on first approval and cancels losing branches (P01 mechanics) (◆).
4. Each stage persists `required_role`, `sla_hours`, `escalation_role` (P01 `sla_definition`).
5. LOW items with `auto_apply_on_low=true`, no documents, **and `is_auth_bearing=false`** skip approval and commit straight away (P05 still captures); **auth-bearing contact fields never auto-apply**.
6. The route is idempotent for a given request version; **in-flight instances pin the workflow definition version** (P01) (◆).
7. When `highest_sensitivity` is HIGH+ and `risk_band=HIGH/BLOCKED` (FR-019), a **`CONDITIONAL`** P01 stage injects a mandatory fraud-review node (◆).

**Business Rules:**
- BR1: Field-key override > field-group override > sensitivity default.
- BR2: STATUTORY always includes a SANCTION stage + strong e-signature.
- BR3: A request mixing CORRECTION + statutory field always routes to senior sanction (mixed-request principle, §5.6 rule 7).
- BR4: DECEASED/RETIRED routes always include the elevated authority stage (FR-018).
- BR5: Auth-bearing contact changes require at least one human APPROVE stage and a notify-old-value side-effect (FR-017); `auto_apply_on_low` is force-disabled at config (`VAL-G02-AUTHBEAR`).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `approval_matrix_config`/`_rules` | READ | route definition incl. employment_status_scope, workflow_code |
| `field_sensitivity_catalog` | READ | per-field sensitivity, is_auth_bearing |
| `change_request_approvals` | INSERT | resolved nodes keyed to workflow_actions ◆ |
| `workflow_instances`/`workflow_actions` (P01) | READ/orchestrate | stage execution ◆ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/route-preview` | Preview computed P01 route (no persist) |
| (internal) | `WorkflowEngine.startInstance` / stage resolution | Persisted on submit ◆ |

**UI Behavior Notes:** "How this will be reviewed" panel shows the computed P01 stage chain (roles, order, SLA), a fraud-review badge when risk is high, and an elevated-path badge for non-ACTIVE targets.

**Edge Cases:** No active matrix for scope (fallback to entity/global; if none → **500 `INTERNAL`** + config alert); circular stage (rejected at config save, `VAL-FLOW-NOCYCLE`); delegated approver unavailable (P01 escalation); auth-bearing field with mistakenly-enabled auto-apply (config rejects, `VAL-G02-AUTHBEAR`).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RoutePreviewPanel` renders P01 stage chain, fraud/elevated badges. |
| Backend-Service Flow | Routing resolved by the **configured P01 flow**: load active matrix (scope + status precedence) → collect rules with override precedence → inject fraud-review (`CONDITIONAL`) if high risk → dedupe + order → create approval rows keyed to `workflow_actions` ◆. |
| Data Operations | READ matrix/rules/catalog; INSERT approvals; P01 instance/action rows; UPDATE highest_sensitivity, sla_due_at. |
| Validation Logic | ≥1 stage for non-auto-apply; role keys exist (RBAC); no duplicate level; auth-bearing auto-apply forbidden. |
| Authorization Logic | Engine internal; route-preview limited to requester/reviewers (P02). |
| State Changes & Side Effects | Creates pending P01 actions; sets first SLA; emits `SLA_SET`. |
| Failure Handling | Missing matrix → fallback + alert; invalid rule → 500 `INTERNAL` + admin notify, request stays SUBMITTED unrouted. |
| Dependencies & Reuse | **P01**; FR-012 config; FR-018/019; consumed by FR-001/004. |
| Test Guidance | Highest-wins; scope + status precedence; `PARALLEL_ALL_OF`/`ANY_OF`; auto-apply LOW non-auth-bearing only; fraud-node injection; override precedence; in-flight version pinning. |

---

### FR-G02-003 — Supporting-Document & Authority-Portal Verification

- **Module:** G02-EPDM
- **Primary Role(s):** Employee/HR (upload); HR Officer (verify); HR/authority (authority-portal verification)
- **User Story:** *As a reviewer, I want every sensitive change backed by verified documentary proof — and, for caste/identity, by an authority-portal check — so that I can approve confidently and defensibly.*

**Description:** Lets requesters attach documents (stored in **G13/M11**) to a request/item (`VAL-FILE`), records `doc_type`, mirrors G13 antivirus `scan_status`, and lets reviewers mark each document `VERIFIED`/`REJECTED`. For `requires_authority_portal_verification=true` items (Aadhaar/PAN/category), the reviewer completes an **authority-portal verification** (UIDAI/Income-Tax/caste portal) **via X.3** (credentials from `integration_credentials`/P04), recording `authority_portal_ref` + `authority_verification_status`. A request with any document/portal-gated item cannot advance past `PENDING_DOCS`/`VERIFY` until all are `VERIFIED`+`CLEAN` (portal `VERIFIED`).

**Acceptance Criteria:**
1. Upload returns a `document_id` from G13 and creates a `change_request_documents` link (`scan_status=PENDING`).
2. Infected files (`INFECTED`) blocked, flagged, excluded.
3. Reviewer can set `VERIFIED`/`REJECTED` with a reason; both captured by **P05**.
4. The document gate (rule 4) and **authority-portal gate** enforced at approval time → unmet returns **412 `PRECONDITION_FAILED`/`ERR-PRECOND`** (and `ERR-G02-AUTHPORTAL` for portal).
5. Allowed `doc_type`s constrained to the field's `required_doc_types`.
6. Caste/category verification requires a successful authority-portal result + a structured evidence-to-value attestation; failure → `RETURNED`.

**Business Rules:**
- BR1: Only HR/authority roles may verify (P02); requesters cannot self-verify.
- BR2: A rejected document returns the request to the requester (`RETURNED`) with reason (`ERR-REASON-REQ`).
- BR3: Documents are referenced, never copied — G13 is the store of record.
- BR4: Aadhaar/PAN changes are HR-only (self-service blocked) and require authority-portal re-verification (R5).
- BR5: A successful caste/category verification raises a promotion-eligibility freeze flag to **G06** (FR-008/§8.6) until finalised.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_documents` | INSERT/UPDATE | doc_type, verification_status, authority_portal_ref, authority_verification_status, scan_status |
| `documents` (G13/M11) | READ | scan status, metadata |
| `integration_credentials` (P04) | READ | portal credentials (via X.3) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/documents` | Link uploaded doc |
| PATCH | `/api/v1/change-requests/{id}/documents/{docId}/verify` | Verify/reject |
| POST | `/api/v1/change-requests/{id}/documents/{docId}/authority-verify` | Trigger/record authority-portal verification (X.3) |
| GET | `/api/v1/change-requests/{id}/documents` | List with status (cursor) |

**UI Behavior Notes:** Drag-and-drop upload with doc-type selector restricted by field; status chips (Pending scan / Clean / Infected / Verified / Rejected / Portal-Verified); reviewer side-panel preview next to diff; authority-portal verification panel with attestation checkbox.

**Edge Cases:** G13 upload failure (X.3 retry → 412/`ERR-PRECOND`); scan stuck PENDING (verify blocked; SLA paused); document deleted in G13 (link broken, blocks approval); authority portal down (X.3 circuit-break; verification PENDING; SLA paused; manual fallback attestation recorded).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DocumentUploader`, `DocumentVerifyPanel`, `AuthorityPortalVerifyPanel`. |
| Backend-Service Flow | `DocumentService.link()` → G13 upload ref + scan poll; `verify()` updates status (P05 captures); `authorityVerify()` calls provider via **X.3**, records ref/status; gate checked by approval service. |
| Data Operations | INSERT/UPDATE change_request_documents; READ G13; X.3 call; P05 capture. |
| Validation Logic | doc_type ∈ required_doc_types; scan CLEAN to verify; verifier role (P02); non-self-verify; portal result for portal-required items. |
| Authorization Logic | Upload: requester/HR; Verify/authority-verify: HR/authority within scope (P02). |
| State Changes & Side Effects | All required docs+portal VERIFIED unblocks gate; caste verify raises G06 freeze; rejection → RETURNED. |
| Failure Handling | Upload/scan/portal failures via X.3 retry/circuit-break; broken reference blocks approval. |
| Dependencies & Reuse | G13 APIs; X.3 + authority providers; gate consumed by FR-004; rejection shares FR-006; freeze to G06. |
| Test Guidance | Infected block; reject→return; wrong doc_type; portal verify pass/fail; caste freeze raised; G13/portal timeout. |

---

### FR-G02-004 — Maker-Checker Multi-Level Approval (P01 Sequential & Parallel)

- **Module:** G02-EPDM
- **Primary Role(s):** Reporting Manager (Mgr L1), HR Officer (HRBP), HR Admin, Dept Head / Appointing Authority
- **User Story:** *As an approver, I want a clear task queue of requests awaiting my decision with the full diff and evidence, so that I can approve, reject, or return them with proper segregation of duties.*

**Description:** Drives requests through **P01** stages. Approvers act via **`WorkflowEngine.approve/reject/sendBack`** (each idempotent — a double-clicked approve produces one `workflow_actions` row, not two) (◆); G02 records the decision in `change_request_approvals`. Supports recommend→approve→sanction chains, sequential progression, `PARALLEL_ALL_OF`/`PARALLEL_ANY_OF` topologies, and **SoD enforced by P02** (including delegate role-independence). A request reaches `APPROVED` only when all required stages approve; any rejection → `REJECTED`; a sendBack → `RETURNED`. A high-risk request (FR-019) must clear the injected fraud-review stage before substantive approval.

**Acceptance Criteria:**
1. An approver sees only P01 actions assigned to their role/scope (or validly delegated) in their **Workspace** queue (Foundation §6.5; routed to exactly one workspace).
2. `approve` advances to the next stage or completes the route; the maker/target can never approve (**P02 SoD**).
3. `reject` requires a comment (`ERR-REASON-REQ`) and terminates the request (`REJECTED`).
4. `sendBack` requires a comment and sends the request to `RETURNED` (P01 re-routes to the prior stage).
5. `PARALLEL_ALL_OF` completes only when every branch approves; `PARALLEL_ANY_OF` completes on first approval and cancels losing branches (P01 mechanics) (◆).
6. STATUTORY and FINANCIAL-HIGH stages require a valid strong e-signature (FR-015) whose method ∈ policy before the decision is accepted (412 `ERR-G02-ESIGN` / 422 `ERR-G02-ESIGN-METHOD`).
7. A P01 `delegate` acting on a stage must independently hold the stage's `required_role` (`delegate_holds_role_verified=true`, P02-verified), else **403 `FORBIDDEN`/`ERR-G02-SOD`**.

**Business Rules:**
- BR1: `assigned_to ≠ requested_by` and `≠ target user` at every stage (P02 SoD).
- BR2: Comments mandatory on REJECT and RETURN.
- BR3: A stage may be acted on by the assignee or a role-qualified active delegate (P01 `delegate`); both recorded.
- BR4: Decisions are append-only; a terminal P01 action cannot be re-decided (idempotent advance).
- BR5: Every decision is captured by **P05** (DB trigger; OPEN-PLAT-03 chain).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_approvals` | INSERT/UPDATE | decision, comment, esignature_id, delegated_from, workflow_action_id ◆ |
| `workflow_actions` (P01) | INSERT | one row per action (idempotent) ◆ |
| `change_requests` | UPDATE | status transitions |
| `esignatures` | READ | strong-method gate |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/approvals/queue` | My pending P01 actions (cursor) |
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/decide` | approve/reject/sendBack (P01) |
| GET | `/api/v1/change-requests/{id}` | Full request + diff for review |

**UI Behavior Notes:** Approver Workspace (Me / My Team / Admin per Foundation §6.5): left = task queue with SLA countdown + sensitivity + risk badge; right = diff, evidence preview, prior decisions trail, fraud-signal panel; sticky action bar (**Approve / Send-back / Reject**, labels per P01 stage aliases) with mandatory comment on negative actions and strong-e-sign prompt. P01 bulk queue actions supported on high-volume queues (per-row partial failures reported).

**Edge Cases:** Concurrent decisions on a parallel stage (P01 idempotent, first wins); approver loses role mid-flow (P01 escalation/reassign); delegate and delegator both act (P01 idempotent, first persisted); items changed after partial approvals (re-route; prior approvals invalidated, P05 captured); delegate lacks role (403 `ERR-G02-SOD`).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ApprovalQueue`, `ApprovalDetail` (diff + evidence + history + risk), `DecisionBar`. |
| Backend-Service Flow | `ApprovalService.decide()`: **P02** SoD + delegate-role check → fraud-stage-clearance check → e-sign strong-method check → **`WorkflowEngine.approve/reject/sendBack`** ◆ → persist approval → recompute route → set status. |
| Data Operations | INSERT/UPDATE approvals; P01 `workflow_actions` (idempotent); UPDATE status; P05 capture; X.2 notify. |
| Validation Logic | P02 SoD, delegate role-independence, mandatory comments, e-sign presence/method/hash, action-not-terminal, delegate window. |
| Authorization Logic | `Authorization.check` — assignee or role-qualified active delegate; reject self/target. |
| State Changes & Side Effects | Advances stages; full approval → `APPROVED` (triggers FR-010); reject → `REJECTED`; sendBack → `RETURNED`. |
| Failure Handling | Concurrency via P01 idempotency → 409 `CONFLICT` for late actor; engine error keeps action PENDING. |
| Dependencies & Reuse | **P01** approve/reject/sendBack/delegate; **P02**; e-sign (015), delegation (013), commit (010), fraud (019). |
| Test Guidance | SoD block; delegate role-independence; sequential/parallel; strong-e-sign enforcement; fraud-stage gating; concurrent decide idempotency. |

---

### FR-G02-005 — Field-Level Change Diff, Preview & Reviewer Comparison

- **Module:** G02-EPDM
- **Primary Role(s):** All (requester preview; reviewer comparison; auditor read)
- **User Story:** *As a reviewer, I want to see exactly what is changing — old vs new, per field — so that I can judge the change accurately.*

**Description:** Computes and renders a structured before/after diff per item, **masking sensitive values via P02 field-mask-on-serialization** (bank/Aadhaar/PAN masked except to roles whose PII ceiling permits), highlighting changes, and surfacing reason, change type, `effective_from`, **clear-intent** and evidence. The diff is the canonical representation used in approval, audit and history.

**Acceptance Criteria:**
1. Each item shows `old_value` (read-only snapshot) and `new_value` with change highlighting; a cleared field renders "→ (cleared)".
2. HIGH/STATUTORY/IDENTITY values masked for roles below the PII ceiling (**P02 serialization mask** — an over-broad query still cannot leak); Aadhaar shown last-4 (vault-backed).
3. The diff is immutable after submission and recomputed only on return+edit.
4. Auditor can view the historical diff for any committed/decided request (P05-scoped).

**Business Rules:**
- BR1: Masking format consistent (`XXXX1234`) and never logs the unmasked value.
- BR2: Typed rendering (e.g., `21-May-1990 → 12-May-1990`).
- BR3: Reveal of an unmasked sensitive value is itself captured by **P05** (reading audit/PII is an audited action).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | READ | old/new value, datatype, sensitivity, clear_intent |
| `field_sensitivity_catalog` | READ | masking/datatype/tokenisation/rbac_field_access |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/diff` | P02-aware diff payload (field_mask applied) |

**UI Behavior Notes:** Diff cards per field with color-coded old (strike) vs new (accent); typed formatting; cleared-field indicator; mask toggle for permitted roles with P05-audited reveal; effective-date and change-type chips. Masked-own-view: the record owner sees Tier-1 IDs masked on screen (Foundation §3).

**Edge Cases:** Multi-line/JSON fields (structured diff); identical old==new with no clear-intent (blocked at submit as no-op); unauthorized reveal attempt (403 `FORBIDDEN`, P05-audited); tokenised field reveal (vault detokenise, P05-audited).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DiffCard`, `MaskToggle`, cleared-field badge. |
| Backend-Service Flow | `DiffService.render(request, actor)`: load items → **`Authorization.check` field_mask** → detokenise via vault only for permitted reveal → format by datatype. |
| Data Operations | READ items + catalog; P05 capture on sensitive reveal. |
| Validation Logic | old≠new or clear_intent at submit; datatype-aware formatting. |
| Authorization Logic | P02 field mask on serialization gates unmasking; vault detokenise scoped. |
| State Changes & Side Effects | Read-only + P05 access capture. |
| Failure Handling | Decrypt/detokenise failure → masked fallback + error flag. |
| Dependencies & Reuse | **P02**; consumed by FR-001/004/016. |
| Test Guidance | Masking by PII ceiling; typed diff; cleared-field; reveal audit; no-op block; vault detokenise. |

---

### FR-G02-006 — Rejection, Return-for-Correction, Resubmission & Withdrawal

- **Module:** G02-EPDM
- **Primary Role(s):** Approvers (reject/sendBack); Requester (resubmit/withdraw)
- **User Story:** *As a requester, when my request is sent back, I want to see why and fix it without re-keying everything, so that I can resubmit quickly.*

**Description:** Manages negative/terminal paths via P01. **Reject** terminates with a mandatory reason. **Return-for-correction** uses **P01 `sendBack`** to an editable `RETURNED` state preserving items/documents/decision-trail; resubmission re-runs validation/routing (P01 re-triggers only the affected stages). **Withdraw** uses **P01 `cancel`** (initiator recall) on a non-terminal request. A data-subject objection (FR-021) can drive a request to `OBJECTED`/paused.

**Acceptance Criteria:**
1. Reject and sendBack require a comment captured in `change_request_approvals.decision_comment` + P05 (`ERR-REASON-REQ`).
2. A `RETURNED` request is editable; prior approvals preserved as history; **P01 send-back re-routes** and re-triggers affected stages on resubmit.
3. Resubmission re-validates `VAL-*`, doc/portal gate, `VAL-EFFECTIVE`, **status gate, step-up**, and re-derives the route.
4. Requester can withdraw any request in `DRAFT`/`SUBMITTED`/`PENDING_DOCS`/`RETURNED`/`IN_REVIEW`/`NOTICE_HOLD` (→ `WITHDRAWN`, P01 `cancel`), not after `APPROVED`.
5. All transitions notify relevant parties via X.2 (incl. data subject for HR-initiated).

**Business Rules:**
- BR1: Once `APPROVED`/`COMMITTED`, only a new corrective request or a **reversal (FR-020)** can alter the field.
- BR2: Resubmit keeps the same `cr_number` and increments an internal revision counter.
- BR3: Withdrawal cancels outstanding P01 actions (`cancel`) and stops SLA timers.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | UPDATE | status, revision |
| `change_request_approvals` | INSERT | RETURNED/REJECTED decisions |
| `workflow_actions` (P01) | UPDATE/cancel | on withdraw ◆ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/withdraw` | Requester cancels (P01 `cancel`) |
| POST | `/api/v1/change-requests/{id}/resubmit` | After correction (P01 re-trigger) |
| (decide endpoint handles reject/sendBack) | — | FR-004 |

**UI Behavior Notes:** Returned requests appear in the requester's "Action needed" Tasks list with the reviewer's reason banner; edited fields highlighted; one-click resubmit after fixing.

**Edge Cases:** Resubmit after sensitivity changed by config (new route on a new pinned version); withdraw race with in-flight approval (409 `CONFLICT`, latest wins); return after parallel partial approval (P01 resets affected stages); resubmit when target now non-ACTIVE (re-gate).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ReturnedRequestBanner`, `ResubmitButton`, `WithdrawDialog`. |
| Backend-Service Flow | `LifecycleService.return()/reject()/withdraw()/resubmit()` → **P01 `sendBack`/`reject`/`cancel`** ◆; re-gate + re-route on resubmit. |
| Data Operations | UPDATE status/revision; INSERT approval rows; P01 cancel/re-trigger; P05 capture; X.2 notify. |
| Validation Logic | Transition legality (§10); mandatory comment; ownership (P02); re-gate on resubmit. |
| Authorization Logic | Reject/sendBack: current-stage approver; withdraw/resubmit: requester (P02). |
| State Changes & Side Effects | `RETURNED`→`SUBMITTED`; `*`→`WITHDRAWN`; `*`→`REJECTED`. |
| Failure Handling | Illegal transition → 409 `CONFLICT`; P01 cancel failure rolled back. |
| Dependencies & Reuse | **P01** sendBack/cancel; routing (002), approvals (004), SLA (007), notifications (011), objection (021). |
| Test Guidance | Reject terminal; return→edit→resubmit re-route; withdraw cancels P01 actions; post-approve edit blocked; re-gate on resubmit. |

---

### FR-G02-007 — SLA Tracking, Reminders & Escalation (P01 SLA Runtime)

- **Module:** G02-EPDM
- **Primary Role(s):** System (P01 SLA runtime); escalation targets (HR Admin, Appointing Authority)
- **User Story:** *As an HR governance owner, I want pending approvals tracked against SLAs and auto-escalated when overdue, so that requests never silently stall.*

**Description:** Uses the **P01 per-stage SLA runtime** (`sla_definition` from the configured W.1 flow / `approval_matrix_rules.sla_hours`): on breach the engine emits an escalation event → **X.2** notification + **P05** audit, applying the configured breach output (delegate/auto-act). G02 mirrors milestones in `cr_sla_events` and runs `JOB-G02-SLA` (X.1 runner) for reminder cadence. Business-calendar aware (calendar-day fallback for P1). Timers pause when `RETURNED`, awaiting document/portal scan, or `NOTICE_HOLD`/objection.

**Acceptance Criteria:**
1. On entering a P01 stage, `sla_due_at` is set from the stage `sla_definition` (business-calendar; excludes holidays/weekends per config).
2. A reminder fires at configurable thresholds (default 50%/90%) via `JOB-G02-SLA` (X.1).
3. On breach, P01 records a `BREACHED` event and sends an escalation notification (X.2; EMAIL mandatory).
4. If the breach output is auto-reassign, P01 updates the assignee and `REASSIGNED` is recorded.
5. SLA pauses in `RETURNED`/`PENDING_DOCS(scan/portal pending)`/`NOTICE_HOLD`/objection and resumes correctly.

**Business Rules:**
- BR1: SLA is per stage; request `sla_due_at` reflects the current active stage.
- BR2: Escalation does not skip required approvals; it changes who acts, not the route.
- BR3: Breach does not auto-approve — manual decision always required.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_sla_events` | INSERT | event_type, due_at, escalated_to (mirror of P01 SLA) |
| `change_requests` | UPDATE | sla_due_at |
| `workflow_actions` (P01) | UPDATE | reassignment ◆ |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/sla` | SLA timeline |
| (job) | `JOB-G02-SLA` (X.1) | Periodic reminder/escalation evaluation |

**UI Behavior Notes:** SLA countdown chips (green/amber/red) in queues; "Overdue" filter; escalation banner on detail; aging report tile in HR dashboard (G14).

**Edge Cases:** No escalation-role holders (notify HR Admin fallback); clock skew (server-authoritative time); withdrawn mid-SLA (P01 timers stopped); DST/holiday-calendar changes (recompute remaining only); calendar service down in P1 (calendar-day fallback).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SlaBadge`, `OverdueFilter`, `EscalationBanner`. |
| Backend-Service Flow | **P01 SLA runtime** on stage entry/breach/escalate; `JOB-G02-SLA` (X.1) reminder cadence; pause/resume on hold states. |
| Data Operations | INSERT cr_sla_events (mirror); UPDATE sla_due_at + P01 assignment; X.2 notify. |
| Validation Logic | Business-calendar (or calendar-day fallback); threshold checks; pause/resume. |
| Authorization Logic | Runtime internal; SLA view limited to participants + HR/Auditor (P02). |
| State Changes & Side Effects | Reassignment, escalation notifications; no auto-advance. |
| Failure Handling | X.1 runner retry (idempotent per-period run key); JOB-FAIL → MSG-SYS-JOBFAIL. |
| Dependencies & Reuse | **P01** SLA runtime; **X.1**; **X.2**; matrix SLAs (002/012); calendar service. |
| Test Guidance | Reminder thresholds; breach→escalate; auto-reassign; pause/resume incl. NOTICE_HOLD; calendar fallback. |

---

### FR-G02-008 — Correction vs. Update, Effective-Dating, DOB Hard-Block, Caste & Dignity-Aware Gender

- **Module:** G02-EPDM
- **Primary Role(s):** Requester, Approvers
- **User Story:** *As HR, I need to distinguish fixing an error from recording a genuine change — and to enforce public-sector statutory rules for DOB, caste and gender — so that downstream history, seniority and pension stay correct and lawful.*

**Description:** Enforces: a **CORRECTION** repairs an erroneous historical value (effective from the original date, raising tracked retro impact via FR-022); an **UPDATE** records a forward change. Effective-dating reuses the platform mechanism (**`VAL-EFFECTIVE`**; `effective_from` staged by **`JOB-G01-EFFDATE`**, §3.3). DOB alteration within a configurable pre-retirement window is a **hard-block** (`VAL-G02-HARDBLOCK` → 412 `ERR-G02-HARDBLOCK`) divertible only to a separate legal-process path. Caste/category corrections require authority-portal verification (FR-003) and raise a **G06** freeze. Gender changes follow an `evidence_path` distinguishing a *data-error correction* from *gender-identity recognition* (NALSA / Transgender Persons Act 2019 — privacy-protected, non-gazette).

**Acceptance Criteria:**
1. Requester must choose CORRECTION or UPDATE; the effective-date picker is constrained (`VAL-EFFECTIVE`: correction ≤ original date and ≥ DOJ; update ≥ today−grace; disallowed → 422 `ERR-PAST-DATED`).
2. A CORRECTION on a STATUTORY field forces evidence + strong e-sign + senior sanction route.
3. Corrections set a tracked retro event (FR-022) for fields affecting pay/seniority/pension.
4. The `effective_from` is staged to G01/M01 on commit and included in any G12 SR event.
5. **DOB hard-block:** if `DOB_PRE_RETIREMENT_BAR` evaluates true, the standard route is blocked (`ERR-G02-HARDBLOCK`); only the legal-process path (special elevated authority) may proceed.
6. **Caste/category:** changes require authority-portal verification (FR-003 BR5) and raise a **G06** promotion-eligibility freeze pending finalisation.
7. **Gender:** the request selects an `evidence_path`; the identity-recognition path uses dignity-aware, privacy-protected evidence (no gazette) with P02-restricted rationale visibility.

**Business Rules:**
- BR1: CORRECTION cannot have a future effective date; UPDATE cannot back-date beyond grace (`VAL-EFFECTIVE`).
- BR2: DOB alteration is **hard-blocked** (not flagged) when the rule triggers; override requires the documented legal process.
- BR3: Effective-dating never alters P05 audit timestamps (recorded vs effective).
- BR4: Caste/category freeze on G06 persists until verification `VERIFIED` and sanction completes.
- BR5: Gender identity-recognition evidence is SENSITIVE; access masked (P02) and audited (P05); never gazette-published by default.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests` | READ/UPDATE | change_type, effective_date |
| `change_request_items` | READ | sensitivity, hard_block, evidence_path |
| `field_sensitivity_catalog` | READ | hard_block_rule_ref, evidence_path, validation_ref |
| `retro_impact_events` (FR-022) | INSERT | effective_date, retro payload |
| `service_register_events` (G12) | posted by **G01** on commit (via FR-011) | effective_date |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/effective-date-rules?fieldKey=&changeType=` | Allowed date range (`VAL-EFFECTIVE`) |
| GET | `/api/v1/change-requests/hard-block-check?fieldKey=dob&employeeId=` | DOB hard-block evaluation |

**UI Behavior Notes:** "Correct an error" vs "Record a change" toggle with help; retro-impact warning banner; bounded effective-date picker; DOB hard-block notice with legal-process explainer; dignity-aware gender path selector with privacy notice.

**Edge Cases:** Correction predating DOJ (block); update on a non-working day (allowed); reclassification correction→update after return (re-route); DOB within bar window (hard-block); caste portal pending (freeze stays).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ChangeTypeToggle`, bounded `EffectiveDatePicker`, `RetroImpactBanner`, `DobHardBlockNotice`, `GenderPathSelector`. |
| Backend-Service Flow | `EffectiveDatingService.validate()` (`VAL-EFFECTIVE`) + `flagRetroImpact()` (→FR-022); `HardBlockService.evaluate(dob)` (`VAL-G02-HARDBLOCK`); caste freeze emit (→G06). |
| Data Operations | UPDATE change_type/effective_date; READ catalog; INSERT retro events; emit freeze. |
| Validation Logic | Date-range by change_type (`VAL-EFFECTIVE`); ≥DOJ; DOB hard-block; gender evidence_path. |
| Authorization Logic | P02; reclassification only while editable; legal-process path = special authority. |
| State Changes & Side Effects | Determines route (002); sets retro events (022); DOB block; caste freeze. |
| Failure Handling | Out-of-range date → 422 `ERR-PAST-DATED`; hard-block → 412 `ERR-G02-HARDBLOCK`. |
| Dependencies & Reuse | Routing (002), commit (010), G12 (011), retro (022), FR-003, G06. |
| Test Guidance | Correction bounds; DOB hard-block trigger + legal path; caste freeze; dignity gender path privacy; retro propagation. |


---

### FR-G02-009 — Bulk HR-Initiated Corrections

- **Module:** G02-EPDM
- **Primary Role(s):** HR Officer / HR Admin (initiate); HR Admin / Appointing Authority (approve)
- **User Story:** *As an HR admin doing a mass data cleanup, I want to upload many corrections at once with validation and a single approval, so that I can fix records efficiently without bypassing governance.*

**Description:** Controlled batch path: HR uploads a CSV/XLSX (`VAL-FILE`), the system performs a **dry-run validation** (existence, P02 scope, cited `VAL-*`, sensitivity, **employment-status gate**, one-open-change, stale checks, **identity/Aadhaar HR-only & portal rules**), produces a valid/invalid report, generates child `change_requests`, **triggers a data-subject notice per affected employee (FR-017)**, and routes for **aggregate approval as a P01 instance**. Approval commits valid rows individually & idempotently (P01 bulk queue actions; per-row partial failures reported — `PARTIAL_FAILED`). *(Re-phased to P4 — §13.3.)*

**Acceptance Criteria:**
1. Upload parses and reports `total/valid/invalid` with row-level reasons.
2. Only rows including required evidence (and portal-required ones flagged) pass validation.
3. The batch routes to an aggregate P01 approval stage honoring the highest sensitivity in the batch.
4. On approval, valid rows commit individually and idempotently; failures recorded per row; batch → `COMMITTED`/`PARTIAL_FAILED` (P01 per-row partial failure, not wholesale).
5. STATUTORY rows trigger a **G01-posted** SR event individually (`source_module=G01`; tracked via FR-011) and raise retro events (FR-022).
6. Full audit at batch and row level via **P05**.
7. Each affected employee receives an out-of-band data-subject notice (FR-017, X.2); FINANCIAL rows respect the objection window before downstream credit.

**Business Rules:**
- BR1: Bulk is HR-only; never self-service.
- BR2: A row failing scope/ownership/status is rejected, not silently skipped.
- BR3: Batch approval respects SoD (P02; approver ≠ initiator).
- BR4: Bulk corrections default `change_type=CORRECTION` unless the row specifies `UPDATE`.
- BR5: Rows changing Aadhaar/PAN/category require portal verification before commit; rows on non-ACTIVE employees route to the elevated path.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `bulk_correction_batches` | INSERT/UPDATE | status, counts, report ref |
| `change_requests`/`_items` | INSERT | child rows, employment_status_at_submit |
| `data_subject_notices` | INSERT | per-employee notice |
| `documents` (G13) | READ | evidence refs |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/bulk-corrections` | Upload + create batch (`Idempotency-Key`) |
| POST | `/api/v1/bulk-corrections/{id}/validate` | Dry-run |
| POST | `/api/v1/bulk-corrections/{id}/submit` | Route for approval (P01) |
| POST | `/api/v1/bulk-corrections/{id}/approve` | Aggregate approve + commit |
| GET | `/api/v1/bulk-corrections/{id}/report` | Validation/commit report |

**UI Behavior Notes:** Upload wizard with template download; validation grid (filter valid/invalid, inline reasons, portal-required & non-ACTIVE flags); sensitivity summary; approve screen with per-row preview; post-commit results with downloadable report.

**Edge Cases:** Mixed valid/invalid (only valid proceed); duplicate field per employee (409 `CONFLICT`); very large file (chunked async via X.1 worker, P4); evidence ref pointing to another employee's doc (rejected); non-ACTIVE employee row (elevated path).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `BulkUploadWizard`, `ValidationGrid`, `BatchApprovalScreen`, `ResultsReport`. |
| Backend-Service Flow | `BulkService.parse()→validateRows()→materializeRequests()→notifySubjects()→`**`startInstance()`**`→commitBatch()`; async worker (X.1) for large files (P4). |
| Data Operations | INSERT batch + child requests/items; per-employee notice; UPDATE counts/status; per-row commit (010); G12 (011); retro (022); P05 capture. |
| Validation Logic | Existence/scope (P02)/`VAL-*`/sensitivity/status-gate/one-open-change/stale; evidence + portal for HIGH/STATUTORY/identity. |
| Authorization Logic | Initiate: HR + scope; approve: HR Admin/authority, P02 SoD. |
| State Changes & Side Effects | `UPLOADED→VALIDATED→PENDING_APPROVAL→APPROVED→COMMITTED/PARTIAL_FAILED`. |
| Failure Handling | Per-row isolation (P01); failed rows logged; report generated. |
| Dependencies & Reuse | Commit (010), G12 (011), retro (022), notice (017), routing (002), G13, X.1. |
| Test Guidance | Mixed validity; SoD on approve; partial failure isolation; STATUTORY SR + retro; per-subject notice; non-ACTIVE elevation. |

---

### FR-G02-010 — Apply Approved Change to Employee Master (G01/M01 Effective-Dated Commit)

- **Module:** G02-EPDM
- **Primary Role(s):** System (post-approval)
- **User Story:** *As the system, once a change is fully approved, I want to apply it to the employee master with stale-value protection, so that the golden record is updated exactly once and correctly.*

**Description:** On `APPROVED`, the commit service applies each approved item to **G01/M01 via the effective-dated path** — the change carries **`effective_from`** and is **staged and applied by `JOB-G01-EFFDATE`, not written live** (§3.3; ◆) — guarded by `old_value_hash` stale-detection and an idempotency key. All items commit atomically (all-or-nothing). Per the corrected sequence (§5.6 rule 11): on success items become `COMMITTED` and the request `COMMITTED`; STATUTORY items then enqueue **G12** SR posting (FR-011) and retro-impacting items enqueue retro events (FR-022) — **neither blocks `COMMITTED`**. For HR-initiated FINANCIAL changes, the **first downstream credit is held until the data-subject objection window elapses (FR-017)**. Saga/outbox (§10.4) guarantees eventual consistency given the staged effective-date apply.

**Acceptance Criteria:**
1. Commit applies only `APPROVED` items, using `commit_idempotency_key` + `Idempotency-Key` so re-runs are no-ops.
2. If any item's `old_value_hash` ≠ current G01/M01 hash, commit aborts that request with **409 `CONFLICT`/`ERR-G02-STALE`** and sets `RETURNED`, no partial writes.
3. On success (or on the staged effective-date apply), `committed_at` set, items `COMMITTED`, request `COMMITTED`; **P05** captures old→new, authority chain, effective date.
4. STATUTORY items trigger the **G01-posted** SR event (G02 tracks status, FR-011) and retro-impacting items enqueue retro events **after** `COMMITTED`; `sr_posting_status`/`retro_status` track separately.
5. G01/M01 unavailability → request `COMMIT_FAILED` with retry (X.1); no data loss.

**Business Rules:**
- BR1: `effective_from` and `change_type` are passed to the G01/M01 effective-dated path (staged by `JOB-G01-EFFDATE`).
- BR2: Commit provenance is captured by **P05** (DB trigger; OPEN-PLAT-03 chain).
- BR3: No commit without a complete P01 approval set and (for sensitive) valid strong e-signature.
- BR4: For HR-initiated FINANCIAL changes, hold the first payroll credit until the objection window passes; emit retro event only after the hold clears.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | item_status, commit key, sr_posting_status, retro_status |
| `change_requests` | UPDATE | status, committed_at |
| `employees` (G01/M01) | UPDATE (effective-dated, staged) ◆ | field value, version, effective_from |
| (P05) | capture | full provenance (DB trigger) |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `CommitService.apply(request)` | Triggered on APPROVED |
| GET | `/api/v1/change-requests/{id}/commit-status` | Commit/SR/retro status |

**UI Behavior Notes:** Requester sees "Approved & applied (effective {date})"; HR-initiated FINANCIAL shows "Applied — credit held until {objection window}"; failed commit shows "Applied with errors — HR notified"; HR sees a commit-failures queue with retry.

**Edge Cases:** Master changed concurrently (stale → return); G01/M01 partial write (saga compensation); duplicate commit trigger (idempotent no-op); STATUTORY commit succeeds but G12 posting fails (commit retained, SR retried — FR-011); retro ack fails (commit retained, retro retried — FR-022); effective-date in the future (staged by `JOB-G01-EFFDATE`, applied on the date).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `CommitStatusPanel` (commit/SR/retro), HR `CommitFailureQueue`. |
| Backend-Service Flow | `CommitService.apply()`: re-check hashes → open txn/saga (outbox) → apply per item to G01/M01 effective-dated (`effective_from`, staged by `JOB-G01-EFFDATE`) ◆ → mark COMMITTED → **G01 posts the SR event** (`source_module=G01`); G02 tracks status (011) + enqueue retro (022) → P05 capture → set/clear FINANCIAL hold. |
| Data Operations | UPDATE items + request; G01/M01 effective-dated commit; P05 capture; enqueue SR + retro (X.1). |
| Validation Logic | Stale hash (`VAL-G02-STALEHASH`); approval-complete + strong e-sign; idempotency; objection-window hold. |
| Authorization Logic | System-triggered; manual retry: HR Admin (P02). |
| State Changes & Side Effects | `APPROVED→COMMITTED` (or `COMMIT_FAILED`/`RETURNED`); SR + retro enqueue. |
| Failure Handling | Atomic rollback/saga compensation; retry w/ backoff (X.1); alert HR on persistent failure (JOB-FAIL). |
| Dependencies & Reuse | G01/M01 effective-dated path; `JOB-G01-EFFDATE`; G12 (011); retro (022); notice/hold (017); P05. |
| Test Guidance | Idempotent re-run; stale conflict; multi-item atomicity; SR/retro-after-commit sequence; FINANCIAL hold; G01 down→retry; future effective-date staging; saga compensation. |

---

### FR-G02-011 — Statutory Change Reflection in the Digital Service Register (G01→G12) & Posting-Status Reconciliation

- **Module:** G02-EPDM
- **Primary Role(s):** System (post-commit)
- **User Story:** *As the SR Custodian, I want approved statutory personal-detail changes reliably recorded in the Service Register by the master/identity owner (G01), so that the statutory record stays authoritative and complete and there is a single SR source for identity events.*

**Description:** For committed items whose field has `post_to_sr=true`, the **G01 employee-master owner posts** the identity/personal-data event to the **G12** SR ledger (a **net-new gov append-only ledger on the P05 substrate**, `VAL-G12-SREVENT`, **`source_module=G01`**) as part of/after the effective-dated commit (FR-010). **G02 is not a Digital-SR source:** its responsibility ends at committing the approved change to the G01 master via the effective-dated staged write; at commit it supplies the SR context to G01 — `sr_event_type`, `employee_id`, `effective_from`, before/after (masked/tokenised), `cr_number`, approval authority and e-signature reference — and then **tracks and reconciles the observed SR posting status** per item. G02 never writes the G12 ledger schema and never carries `source_module=G02` SR payloads. Reversals (FR-020) commit a reversing change to G01, on which **G01 posts the reversing SR event**. Posting status observed per item; reconciliation gaps retried/escalated with a dead-letter queue and reconciliation report.

**Acceptance Criteria:**
1. Only committed STATUTORY items (`post_to_sr=true`) cause a **G01-posted** SR event (`source_module=G01`); G02 emits no SR write itself.
2. G02's posting-status tracking is idempotent on `change_request_item_id + ':SR'`; duplicate reconciliations no-op.
3. An observed successful G01 post sets `sr_posting_status=POSTED` with the returned reference; a missing/failed post sets `FAILED` and queues a reconciliation retry (X.1).
4. The SR context supplied to G01 includes `effective_from`, before/after, `cr_number`, approver chain and e-signature reference.
5. Persistent reconciliation failure raises an alert to HR Admin + SR Custodian (X.2) and appears in the reconciliation report.
6. A reversal yields a reversing SR event **posted by G01** (`source_ref = item_id + ':REV:' + reversal_id`); G02 records the observed status.

**Business Rules:**
- BR1: G12 is the SR system of record and **G01 is the posting `source_module`** for identity/personal-data events; G02 only supplies context and tracks/reconciles.
- BR2: Per corrected sequence (R15), the G01 SR posting follows `COMMITTED` and is tracked separately; it never gates `COMMITTED`.
- BR3: The SR event uses G12-published event types only (`VAL-G12-SREVENT`), posted under `source_module=G01`; unknown types fail config validation (FR-012).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_items` | UPDATE | sr_posting_status (observed) |
| `service_register_events` (G12) | **posted by G01** (G02 reads) | event_type, payload, source_ref |
| `cr_reversals` | READ/UPDATE | reversing_sr_status |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `SrReflectionTracker.reconcile(item)` | Tracks the **G01-posted** SR event post-commit |
| GET | `/api/v1/change-requests/{id}/sr-status` | SR posting status (observed) |
| POST | `/api/v1/change-requests/{id}/sr-retry` | Manual reconcile/re-request G01 post (HR Admin) |

**UI Behavior Notes:** SR status chip per statutory item (Posted / Pending / Failed); SR Custodian reconciliation dashboard (unposted/failed statutory changes with retry); reversing-event indicator.

**Edge Cases:** G01 SR post not yet observed (reconcile + retry, PENDING); G01 SR post rejected by G12 (FAILED + alert, no silent loss); duplicate reconcile after retry (idempotent); event_type retired in G12 (config alert); reversing event for a never-posted item (skip with note).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `SrStatusChip`, `SrReconciliationDashboard`, retry action. |
| Backend-Service Flow | `SrReflectionTracker`: on commit, pass the SR context to **G01's posting path** (`source_module=G01`); observe/reconcile the G01-posted event status; `trackReversing()` for FR-020. |
| Data Operations | UPDATE sr_posting_status (observed); P05 capture; **G01 writes the G12 event** (G02 reads). |
| Validation Logic | post_to_sr=true; event_type valid (`VAL-G12-SREVENT`); reconcile/idempotency key. |
| Authorization Logic | System-triggered; manual retry: HR Admin/SR Custodian (P02). |
| State Changes & Side Effects | `PENDING→POSTED/FAILED`; alerts on persistent reconciliation failure (X.2). |
| Failure Handling | Reconciliation retry + dead-letter; reconciliation report; never drops. |
| Dependencies & Reuse | G12 ledger; **G01 SR-posting path**; commit (010); reversal (020); X.2; P05. |
| Test Guidance | Single SR source (G01); reconcile on delayed post; payload reject; reconciliation listing; reversing event; manual retry. |

---

### FR-G02-012 — Approval-Flow, Field-Sensitivity, E-Sign-Policy & Regex Configuration (W.1/W.2)

- **Module:** G02-EPDM
- **Primary Role(s):** System Administrator (Org Admin)
- **User Story:** *As a system administrator, I want to configure which fields are sensitive, how each tier is approved, which e-sign methods are allowed, and safe validation rules, so that governance adapts without code changes.*

**Description:** Admin uses the **W.1 `cfg-approval-builder` / cfg-workflow-builder** and **W.2 `cfg-form-builder`** Org-Admin screens to manage the `field_sensitivity_catalog` (classify fields, evidence/portal/e-sign/SR rules, `is_auth_bearing`, `self_service_editable`, `hard_block_rule_ref`, `evidence_path`, **module-unique regex with ReDoS safety**, **per-field allowed e-sign methods**, cited `validation_ref`) and the versioned `approval_matrix_config`/`_rules` bound to a **P01 `workflow_code`**. Configs are **versioned and validated on save** (§3.2); activation retires the prior; **in-flight instances pin their version** (P01). Validation prevents invalid routes (no stages, unknown roles, duplicate levels, circular stage — `VAL-FLOW-NOCYCLE`, unknown G12 event type, **auth-bearing auto-apply, unsafe regex, OTP/weak method on FINANCIAL/STATUTORY**).

**Acceptance Criteria:**
1. Admin can create/edit/version a matrix scoped to entity or org unit, DRAFT→ACTIVE→RETIRED.
2. Activating sets `effective_from` and retires the previously active for that scope.
3. Saving is rejected (**422 `VALIDATION_FAILED`**) for zero stages (non-auto-apply), unknown roles, duplicate `level_no`, circular stage (`VAL-FLOW-NOCYCLE`), unknown G12 event type, an `is_auth_bearing` field with `auto_apply_on_low=true` (`VAL-G02-AUTHBEAR`), a FINANCIAL/STATUTORY field whose `allowed_esign_methods` is weak/missing-strong (`VAL-G02-ESIGN-METHOD`), or an unsafe `validation_regex` (`VAL-G02-REGEXSAFE`).
4. Catalog edits are versioned and apply to *new* requests only (in-flight pin their version, P01).
5. All config changes are captured by **P05 `security_audit_log`** (RBAC_CHANGE / config event) with before/after.
6. `validation_regex` is length/complexity-bounded, safe-regex compiled, execution-timeout (`VAL-G02-REGEXSAFE`).

**Business Rules:**
- BR1: Config changes never retroactively alter in-flight requests' routes (P01 pinning).
- BR2: Only System Admin (Org Admin) may configure; cannot self-approve transactions (P02 SoD).
- BR3: An entity/global default matrix must always exist (cannot retire the last active default).
- BR4: E-sign method policy and auth-bearing/regex/hard-block rules validated at save.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `field_sensitivity_catalog` | CRUD (versioned) | sensitivity, rules, validation_ref, regex, methods, flags |
| `approval_matrix_config`/`_rules` | CRUD (versioned) | stages, roles, SLA, status scope, workflow_code |
| (P05 `security_audit_log`) | capture | config before/after |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/v1/admin/field-sensitivity` | Manage catalog (W.2) |
| GET/POST/PATCH | `/api/v1/admin/approval-matrices` | Manage matrices (W.1) |
| POST | `/api/v1/admin/approval-matrices/{id}/activate` | Activate version |
| POST | `/api/v1/admin/validation-regex/test` | Safe-regex test (`VAL-G02-REGEXSAFE`) |

**UI Behavior Notes:** W.2 field catalog grid with inline sensitivity/rule editing (auth-bearing, e-sign-method, validation_ref, regex); W.1 approval builder with drag-order levels, parallel grouping, role pickers (RBAC), SLA inputs, status-scope; validation summary before activation; version history with diff.

**Edge Cases:** Retire last default matrix (blocked); overlapping effective dates same scope (blocked); role removed from RBAC still referenced (validation error); invalid/unsafe regex (rejected); auth-bearing auto-apply (rejected); weak e-sign on FINANCIAL/STATUTORY (rejected).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | W.2 `cfg-form-builder`, W.1 `cfg-approval-builder`/`cfg-workflow-builder`, `EsignPolicyEditor`, `RegexSafetyTester`, `ActivationDialog`, `ConfigVersionHistory`. |
| Backend-Service Flow | `ConfigService` validates (regex safety, method policy, auth-bearing, `VAL-FLOW-NOCYCLE`) + versions; activation transitions atomically; P01 in-flight pinning. |
| Data Operations | Versioned INSERT (new version), UPDATE status; P05 `security_audit_log` capture. |
| Validation Logic | Non-empty route; known roles/event types; no duplicate/circular levels; single active default; safe regex; method policy; auth-bearing auto-apply ban. |
| Authorization Logic | System Admin (Org Admin) only (P02). |
| State Changes & Side Effects | `DRAFT→ACTIVE→RETIRED`; new versions affect future requests only. |
| Failure Handling | Invalid config rejected pre-save; activation rollback on partial failure. |
| Dependencies & Reuse | Consumed by routing (002), e-sign (015); RBAC; G12 event registry; W.1/W.2. |
| Test Guidance | Versioning; activation retires prior; invalid-route rejection; in-flight immunity (pinning); last-default guard; ReDoS regex reject; weak-method reject; auth-bearing auto-apply reject. |

---

### FR-G02-013 — Delegation of Approval Authority (P01 Delegate, Role-Independent)

- **Module:** G02-EPDM
- **Primary Role(s):** Approvers (delegate own authority); System Admin (any)
- **User Story:** *As an approver going on leave, I want to delegate my approval authority for a period, so that requests keep moving while my decisions remain accountable — without elevating anyone's privilege.*

**Description:** Uses **P01 `delegate`** to delegate authority (optionally scoped by org unit and node types) to **another user who independently holds the required role** (verified by **P02**) for a validity window. The delegate appears as resolved assignee for matching P01 actions; decisions record both `assigned_to` and `delegated_from`. Delegations can be revoked; they auto-expire. SoD still applies (P02). Attempted delegation to an ineligible (role-lacking) user is blocked and logged to **P05 `security_audit_log`** + the privileged-action report (§12). *(Re-phased to P4 — §13.3.)*

**Acceptance Criteria:**
1. An approver can create a delegation to an eligible user with `valid_from/valid_to`, optional scope and node types.
2. While active, new and pending P01 actions within scope resolve to the delegate (P01 `delegate`); audit shows delegate + delegator.
3. Delegations can be revoked early (`REVOKED`) and auto-expire (`EXPIRED`).
4. A delegate subject to SoD on a request is excluded for that request (fall back to delegator/escalation).
5. Overlapping delegations resolve by most-specific scope then most-recent.
6. A delegate must independently satisfy the stage's `required_role` (`delegate_holds_role_verified=true`, **P02**); otherwise rejected at creation and any attempted action is **403 `FORBIDDEN`/`ERR-G02-SOD`**, recorded in the security report.

**Business Rules:**
- BR1: Delegate must hold a role capable of the delegated node type — **delegation transfers the action, never the privilege** (P02 no-elevation).
- BR2: Delegation does not transfer configuration rights, only approval actions.
- BR3: Circular delegation is blocked.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `delegations` | CRUD | delegator, delegate, scope, window, status, delegate_holds_role_verified |
| `change_request_approvals` | INSERT | delegated_from on decision |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/delegations` | List/create |
| POST | `/api/v1/delegations/{id}/revoke` | Revoke |

**UI Behavior Notes:** "Delegate my approvals" form with eligible-user search (RBAC role-filtered), date range, scope/node-type selectors; banner when acting as a delegate; admin view of all active delegations; blocked-attempt indicator feeding the security report.

**Edge Cases:** Delegate also unavailable (P01 escalation); window overlaps a holiday (honored); delegate to ineligible role (blocked + logged); delegator returns early and revokes (pending P01 actions revert).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DelegationForm` (role-filtered), `ActingAsDelegateBanner`, admin `DelegationRegistry`. |
| Backend-Service Flow | On `delegate`, P01 resolves the assignee to the delegate; `DelegationService` validates role-independence (**P02**) + SoD before P01 accepts. |
| Data Operations | CRUD delegations; record delegated_from on approval; P05 capture. |
| Validation Logic | Role capability (independent, P02), no elevation, no circular, window validity, SoD per request. |
| Authorization Logic | Create own: approver; create any/revoke any: System Admin (P02). |
| State Changes & Side Effects | Reassigns P01 action resolution; dual-attribution audit; security-report entry on blocked attempt. |
| Failure Handling | Ineligible delegate blocked + logged (security_audit_log); fallback to delegator/escalation. |
| Dependencies & Reuse | **P01 `delegate`**; **P02**; approvals (004), SLA escalation (007), security report (§12). |
| Test Guidance | Active-window routing; revoke reverts; SoD exclusion; overlap precedence; ineligible block + security-report entry. |

---

### FR-G02-014 — Change-Request Templates (W.2 Forms)

- **Module:** G02-EPDM
- **Primary Role(s):** System Admin / HR Admin (author); Requesters (use)
- **User Story:** *As an employee, I want guided templates for common changes (e.g., "Update bank account"), so that I provide the right fields and documents the first time.*

**Description:** Reusable templates (bound to **W.2 forms**, `w2_form_ref`) pre-select fields, prescribe required document types and show guidance. Requesters start "from template"; the editor pre-populates field rows and evidence requirements. Templates are scoped (entity/org unit) and can be activated/deactivated. Templates respect `self_service_editable` (Aadhaar/PAN/category never offered in a self-service template) and P02 field access. *(Re-phased to P4 — §13.3.)*

**Acceptance Criteria:**
1. Admin/HR Admin can create templates specifying `field_keys`, `required_doc_types`, instructions, change_type, and `w2_form_ref`.
2. Requesters can start a request from an active template scoped to them; the editor pre-fills field rows (W.2 form).
3. Templates only include fields P02 authorises; unauthorized and HR-only fields are filtered at use time.
4. Deactivated templates are not selectable but historical requests retain their `template_id`.

**Business Rules:**
- BR1: A template cannot bypass sensitivity/route/status/step-up rules; it only pre-fills the form.
- BR2: Required doc types in a template are guidance; the catalog's `requires_document`/portal remains authoritative for gating.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_request_templates` | CRUD | field_keys, doc types, instructions, w2_form_ref |
| `change_requests` | INSERT | template_id linkage |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-request-templates` | List available (cursor) |
| POST | `/api/v1/change-requests?fromTemplate={id}` | Start from template |
| POST/PATCH | `/api/v1/admin/change-request-templates` | Manage |

**UI Behavior Notes:** Template gallery on "New request" with descriptions and required-document hints; pre-filled W.2 editor with instructions panel.

**Edge Cases:** Template references a now-non-governed field (filtered with notice); requester unauthorized/HR-only fields (omitted, P02); template deactivated mid-draft (draft continues, new starts blocked).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `TemplateGallery`, pre-filled `ChangeRequestEditor` (W.2 form), `InstructionsPanel`. |
| Backend-Service Flow | `TemplateService.instantiate()` filters fields by **P02** + self_service_editable, seeds items + doc hints from the W.2 form. |
| Data Operations | READ template; INSERT request with template_id; CRUD templates (admin). |
| Validation Logic | Active+scope; field-authorization + HR-only filter (P02); governed-field check. |
| Authorization Logic | Use: any requester (scoped); manage: HR Admin/System Admin. |
| State Changes & Side Effects | Creates DRAFT seeded from template. |
| Failure Handling | Invalid/inactive template → 404 `NOT_FOUND`/409 `CONFLICT`; partial field filtering with notice. |
| Dependencies & Reuse | Authoring (001), catalog (012), W.2. |
| Test Guidance | Pre-fill; unauthorized/HR-only field filtering; inactive block; historical retention. |

---

### FR-G02-015 — Strong E-Signature on High-Sensitivity Approvals (Method Policy)

- **Module:** G02-EPDM
- **Primary Role(s):** Approvers on HIGH-financial / STATUTORY P01 stages
- **User Story:** *As a senior approver sanctioning a statutory or financial change, I want to apply a legally sufficient, verifiable e-signature, so that my authorization is attributable and tamper-evident.*

**Description:** Captures a cryptographically attributable e-signature when an approver decides on a P01 stage configured `requires_esignature`. Method policy by tier (R1): **PASSWORD_REAUTH removed**; FINANCIAL (bank) and STATUTORY require **PKI/DSC or Aadhaar e-Sign**; OTP only for non-financial HIGH where policy allows (`VAL-G02-ESIGN-METHOD`). The signed payload hash binds the exact P01 decision; the signature is stored append-only and **hash-chained (E10, aligned to OPEN-PLAT-03)** and referenced by the approval and any G12 SR event. External provider integrated via **X.3**.

**Acceptance Criteria:**
1. A decision on a `requires_esignature` stage cannot be persisted (P01 `approve`) without a successful e-signature capture (412 `ERR-G02-ESIGN`).
2. `signed_payload_hash` is the SHA-256 of the canonical decision payload; tampering invalidates verification; the e-sign ledger is hash-chained (OPEN-PLAT-03).
3. Signature metadata (method, signer, timestamp, IP, user-agent) recorded append-only (P05 also captures).
4. The e-signature reference is included in the G12 SR event payload (FR-011) for STATUTORY changes.
5. Failed signature attempts are recorded and do not advance the stage.
6. The captured `sign_method` must be in `allowed_esign_methods`; FINANCIAL/STATUTORY reject `OTP`/weak (**422 `VALIDATION_FAILED`/`ERR-G02-ESIGN-METHOD`**).

**Business Rules:**
- BR1: The signer must be the acting approver (or P01 role-qualified delegate) — signature identity = decision identity.
- BR2: E-signatures are immutable; a re-decision requires a new signature.
- BR3: At least one strong method (PKI/DSC or Aadhaar e-Sign) is required for FINANCIAL and STATUTORY; `PASSWORD_REAUTH` does not exist.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `esignatures` | INSERT | method, payload hash, chain_hash, signer, metadata |
| `change_request_approvals` | UPDATE | esignature_id |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/approvals/{nodeId}/esign` | Capture signature (X.3 provider) |
| GET | `/api/v1/change-requests/{id}/esignatures` | List (auditor, cursor) |

**UI Behavior Notes:** Signature modal triggered on Approve for sensitive P01 stages; method selector restricted to allowed strong methods; OTP/DSC/Aadhaar flows; signed payload summary; "You are legally signing this decision" notice.

**Edge Cases:** Provider down (decision blocked, X.3 retry; 412/`ERR-PRECOND`); payload changed after signing (hash mismatch → re-sign); delegate signs (identity recorded with delegator link); weak method on FINANCIAL/STATUTORY (rejected).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `EsignModal` with method-policy-restricted flows + payload preview. |
| Backend-Service Flow | `EsignService.capture()`: validate method ∈ policy (`VAL-G02-ESIGN-METHOD`) → canonical payload → hash → invoke provider (X.3) → persist signature + chain_hash → link → allow P01 `approve`. |
| Data Operations | INSERT esignatures (hash-chained); UPDATE approval esignature_id; P05 capture. |
| Validation Logic | Stage requires e-sign; signer = approver/delegate; hash binding; method policy for FINANCIAL/STATUTORY. |
| Authorization Logic | Acting approver/role-qualified delegate on the stage only (P02). |
| State Changes & Side Effects | Enables P01 decision persistence; reference flows to G12 SR event. |
| Failure Handling | Provider failure blocks decision (X.3); failed attempts logged; hash mismatch forces re-sign; weak method rejected. |
| Dependencies & Reuse | Approvals (004), G12 (011), config method policy (012), X.3 + external providers. |
| Test Guidance | Block decision w/o e-sign; hash binding + chain; provider down; delegate signing; weak-method rejection. |

---

### FR-G02-016 — Change Provenance, Field History, Tamper-Evident Audit (P05) & Reporting

- **Module:** G02-EPDM
- **Primary Role(s):** Auditor (Org-Admin read + entitlement), HR Admin, Employee (own history)
- **User Story:** *As an auditor, I want a complete, immutable, tamper-evident history of who changed what, when, on whose authority and against which document, so that I can verify compliance for any field at any time.*

**Description:** Surfaces full provenance of every governed-field change: chronological field history (per field, per employee) from committed requests, the complete P01 decision trail (recommenders, approvers, sanctioners, delegates, e-signatures), linked evidence, effective vs recorded dates, G12 SR posting + **retro reconciliation status**, sourced from **P05** (`audit_log` via `Audit.query`) with **OPEN-PLAT-03 tamper-evidence**. Provides exportable audit reports and an employee-facing "my change history" view. All reads are P02-scoped and **themselves audited** (reading an audit log is an audited action, P05). Nothing is editable.

**Acceptance Criteria:**
1. For any field on any employee (within P02 scope), the system shows an ordered history with old→new, dates (effective + recorded), authority chain, evidence, G12 SR reference and retro status.
2. Employees can view their own change history; auditors/HR (in scope) can view others' (P02; PII masked per ceiling).
3. Reports are filterable (date range, field group, sensitivity, status, org unit, risk band) and exportable (CSV/PDF) with **cursor pagination**.
4. Sensitive values are masked per role even in reports (**P02 serialization mask**).
5. History is read-only; any access to sensitive provenance is itself captured by **P05**.
6. An **audit-integrity verifier** consumes the **P05 / OPEN-PLAT-03** hash-chain and reports any break (`JOB-G02-AUDITVERIFY`).

**Business Rules:**
- BR1: History derives from immutable sources (`change_request_*`, **P05 `audit_log`**, `esignatures`); never independently editable.
- BR2: Exports honor row-level scope and masking (P02).
- BR3: Reconciliation reports list any committed STATUTORY item not yet `POSTED` to G12 and any retro event not yet `ACKED`.
- BR4: Tamper-evidence is P05 + OPEN-PLAT-03; integrity verification runs on a schedule and on-demand, alarming on any break.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `change_requests`/`_items`/`_approvals` | READ | full trail |
| `esignatures`, `cr_sla_events`, `retro_impact_events` | READ | signatures, SLA, retro |
| `audit_log` (P05, via `Audit.query`) | READ | source + access audit |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/field-history` | Per-field history |
| GET | `/api/v1/reports/change-requests` | Filterable report (cursor) |
| GET | `/api/v1/reports/sr-reconciliation` | Unposted statutory items |
| GET | `/api/v1/reports/retro-reconciliation` | Unacked retro events |
| POST | `/api/v1/audit/verify-chain` | Run P05/OPEN-PLAT-03 integrity verification |

**UI Behavior Notes:** Timeline view per field; report builder with filters and export; "my changes" tab for employees; masked values with P02 role-gated reveal (P05-audited); audit-integrity status tile (last verified, any breaks).

**Edge Cases:** Field changed many times (paginated timeline); large export (async via X.1 + download link); out-of-scope access (403 `FORBIDDEN`, P05-audited); chain break detected (alarm + auditor notification).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `FieldHistoryTimeline`, `ReportBuilder`, `SrReconciliationReport`, `RetroReconciliationReport`, `AuditIntegrityTile`, employee `MyChangesTab`. |
| Backend-Service Flow | `HistoryService.fieldHistory()` + `ReportService.query()` (P02 scope + mask); `ChainVerifier.verify()` consumes **P05/OPEN-PLAT-03**; async export worker (X.1). |
| Data Operations | READ change_request_* + **P05 `Audit.query`** + esignatures + retro; P05 access capture; export to G13. |
| Validation Logic | Filter validation; cursor pagination max 100; P02 scope; chain verification. |
| Authorization Logic | Own: employee; others: HR/Auditor in scope; mask per PII ceiling; chain-verify: Auditor/HR Admin/System Admin (P02). |
| State Changes & Side Effects | Read-only + P05 access capture; export artefact stored in G13; chain-break alarm. |
| Failure Handling | Large export async with retry; access denial audited; chain break escalated. |
| Dependencies & Reuse | Diff (005), all lifecycle data, retro (022), G13 exports, **P05**. |
| Test Guidance | Field timeline order; scope/masking; async export; SR + retro reconciliation accuracy; chain-break detection; access audit. |


---

### FR-G02-017 — Data-Subject Notification & Confirmation/Objection Window ★ (Imp 2 / R2)

- **Module:** G02-EPDM
- **Primary Role(s):** System (X.2/W.3); Employee (data subject)
- **User Story:** *As an employee, when someone else changes my record, I want to be told out-of-band and given a window to confirm or object before any money moves, so that I am protected from silent fraud.*

**Description:** On any change initiated by someone other than the data subject (`HR_ON_BEHALF`, `BULK`), G02 sends an **out-of-band notice via X.2/W.3** (a channel distinct from the requester's session — SMS/email/postal/in-app to the *employee's* recorded contact; EMAIL mandatory/non-suppressible) and, for FINANCIAL changes, opens a configurable **confirmation/objection window** (`JOB-G02-NOTICE`, X.1) during which the first downstream credit is held (FR-010 BR4). The employee can confirm, object (FR-021), or let the window elapse. Auth-bearing contact changes also notify the **old** contact value (anti-takeover, R1).

**Acceptance Criteria:**
1. Every `HR_ON_BEHALF`/`BULK` change creates a `data_subject_notices` row and dispatches an out-of-band notice (X.2, `MSG-G02-DSNOTICE`).
2. For FINANCIAL changes, `objection_window_ends_at` is set; the request enters `NOTICE_HOLD`; the first credit is held until the window elapses or the subject confirms.
3. The employee can confirm (`CONFIRMED`), object (`OBJECTED`→FR-021), or the window elapses (`WINDOW_ELAPSED`, `JOB-G02-NOTICE`).
4. Auth-bearing contact-field changes notify the OLD value (and the new) so a takeover is visible (`MSG-G02-OLDALERT`).
5. Notice delivery status is tracked (X.2 backoff ×5 + DLQ); delivery failure raises an HR alert and blocks auto-clearance of the hold.
6. Notices never contain raw sensitive values (masked per P02).

**Business Rules:**
- BR1: Notice channel must differ from the requester's interaction channel (true out-of-band).
- BR2: The objection window is configurable per sensitivity (default: FINANCIAL 48h; others notice-only) via W.3.
- BR3: A delivered objection pauses the request (`OBJECTED`) and routes to the Grievance Officer (FR-021).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `data_subject_notices` | INSERT/UPDATE | channel, sent_at, objection_window_ends_at, outcome |
| `change_requests` | UPDATE | status `NOTICE_HOLD`/`OBJECTED` |
| `notifications` (X.2) | INSERT | out-of-band dispatch |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/change-requests/{id}/notice` | Notice + window status |
| POST | `/api/v1/change-requests/{id}/notice/confirm` | Data subject confirms |
| POST | `/api/v1/change-requests/{id}/notice/object` | Data subject objects (→FR-021) |

**UI Behavior Notes:** Employee "Action needed: a change was made to your record" Tasks card with confirm/object actions and a countdown; HR sees "Held — awaiting data-subject window"; old-channel anti-takeover alert.

**Edge Cases:** Employee has no deliverable contact (escalate to HR; postal fallback; hold extended); employee confirms early (hold released early); objection after window elapsed but before credit posted (still pauses/triggers reversal review); bulk job → one notice per affected employee (X.2 fan-out).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `DataSubjectNoticeCard`, `ObjectionWindowCountdown`, HR `HeldRequests` view. |
| Backend-Service Flow | `NoticeService.dispatch()` on HR/BULK submit (X.2/W.3) → set window/hold → `confirm()/object()/elapse()` (`JOB-G02-NOTICE`); clears FR-010 credit hold. |
| Data Operations | INSERT/UPDATE data_subject_notices; UPDATE change_requests.status; X.2 dispatch; P05 capture. |
| Validation Logic | Out-of-band channel selection (W.3); window computation; delivery confirmation. |
| Authorization Logic | Confirm/object: the data subject only (P02). |
| State Changes & Side Effects | `→NOTICE_HOLD→(CONFIRMED|OBJECTED|WINDOW_ELAPSED)`; credit-hold release. |
| Failure Handling | Delivery failure → HR alert, hold not auto-cleared; X.2 retries + DLQ. |
| Dependencies & Reuse | **X.2/W.3**; commit/hold (010); objection (021); contact-change (002); `JOB-G02-NOTICE`. |
| Test Guidance | Out-of-band dispatch; FINANCIAL hold+window; old-channel alert; confirm/object/elapse; undeliverable fallback; bulk fan-out. |

---

### FR-G02-018 — Employment-Status Gating & Elevated Special Paths ★ (Imp 3 / R3)

- **Module:** G02-EPDM
- **Primary Role(s):** System; HR Admin; Appointing Authority (elevated)
- **User Story:** *As HR governance, I want changes on non-active employees (retired, deceased, suspended, terminated) blocked from ordinary self-service and routed to elevated, status-specific controls, so that family-pension and terminal-benefit fraud is prevented.*

**Description:** Reads the target's G01/M01 `employment_status` at submit (`employment_status_at_submit`) and applies a gate: `ACTIVE` follows the standard P01 route; **non-ACTIVE blocks self-service entirely** (P02) and routes HR-initiated changes to a status-specific elevated route (`employment_status_scope` matrix rule, FR-002). Bank/nominee changes on a `DECEASED` record route to a **family-pension controlled path** (Appointing Authority + enhanced evidence). `SUSPENDED`/`TERMINATED` require elevated authority + documented justification.

**Acceptance Criteria:**
1. Self-service on any non-`ACTIVE` target → **403 `FORBIDDEN`/`ERR-G02-STATUSGATE`**.
2. HR-on-behalf on non-`ACTIVE` is permitted only via the elevated route (`employment_status_scope`, FR-002).
3. Bank/nominee change on `DECEASED` routes to the family-pension controlled path with Appointing-Authority sanction and enhanced evidence; ordinary HR cannot self-approve (P02 SoD).
4. The status snapshot is recorded; if status changes between draft and submit, the gate is re-evaluated.
5. All status-gated decisions captured by **P05**.

**Business Rules:**
- BR1: Status gating precedes routing and step-up.
- BR2: `DECEASED` financial changes always require dual control and family-pension evidence; never auto-apply.
- BR3: Elevated paths cannot be bypassed by templates, bulk or delegation.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `employees` (G01/M01) | READ | employment_status |
| `change_requests` | UPDATE | employment_status_at_submit, status |
| `approval_matrix_rules` | READ | employment_status_scope routes |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees/{id}/status-gate?fieldKey=` | Gate decision + required path |

**UI Behavior Notes:** Self-service editor shows "This record is {status}; changes require HR with elevated approval"; HR editor shows an elevated-path badge and enhanced-evidence requirements for deceased/retired.

**Edge Cases:** Status changes mid-flow (re-gate; may block/elevate); `ON_LEAVE` treated as ACTIVE for routine fields (config can elevate); reactivation after retirement (rare — HR override with audit).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `StatusGateBanner`, elevated-path badge. |
| Backend-Service Flow | `StatusGateService.evaluate(target, field)` → ALLOW/BLOCK/ELEVATE → feeds routing (002). |
| Data Operations | READ G01/M01 status; snapshot on CR; P05 capture. |
| Validation Logic | Status→path mapping; self-service block (P02); deceased financial dual-control. |
| Authorization Logic | Elevated path requires Appointing Authority per matrix (P02). |
| State Changes & Side Effects | Determines route; blocks self-service; enforces enhanced evidence. |
| Failure Handling | G01/M01 status read failure → 412 `PRECONDITION_FAILED` (fail-closed: block). |
| Dependencies & Reuse | G01/M01 read; routing (002); evidence (003); commit (010). |
| Test Guidance | Self-service block on non-ACTIVE; deceased bank dual-control; re-gate on mid-flow status change; fail-closed on status read error. |

---

### FR-G02-019 — Fraud, Velocity & Anomaly Signal Detection ★ (Imp 7 / R10)

- **Module:** G02-EPDM
- **Primary Role(s):** System; Fraud Reviewer (RBAC capability flag)
- **User Story:** *As HR governance, I want sensitive changes risk-scored for fraud patterns — mule accounts, pre-payroll/pre-exit spikes, device/velocity anomalies — and high-risk ones held for review, so that collusion and theft are caught before commit.*

**Description:** A risk engine evaluates each submitted request and emits `cr_risk_signals`, aggregating `risk_score`/`risk_band`. Signals: same new bank account across multiple employees (mule), changes within N days of payroll cutoff, within N days of separation, device/velocity anomalies, multi-employee from one device, auth-channel-change-then-financial (R1), off-hours bursts. `HIGH` injects a mandatory fraud-review stage into the P01 route via a **`CONDITIONAL`** branch (FR-002 AC7); `BLOCKED` holds commit pending review (412 `ERR-G02-RISKBLOCK`). The Fraud Reviewer capability flag (RBAC §4.3) gates the review queue.

**Acceptance Criteria:**
1. Every HIGH/STATUTORY (and FINANCIAL) request is risk-evaluated at submit and on material edit (`JOB-G02-RISK` for batch/velocity windows).
2. Each fired signal creates a `cr_risk_signals` row with type, severity, score and evidence.
3. `risk_band=HIGH` forces a P01 fraud-review stage before substantive approval; `BLOCKED` prevents commit (`ERR-G02-RISKBLOCK`).
4. The same new bank account on ≥2 employees within a window fires `DUPLICATE_BANK_ACCOUNT` (mule) and surfaces the linked employees.
5. An auth-bearing contact change followed by a FINANCIAL change for the same employee within a window fires `AUTH_CHANNEL_THEN_FINANCIAL`.
6. A Fraud Reviewer can clear/confirm/escalate; outcomes captured by **P05**; a fraud report (G14) and queue are provided.

**Business Rules:**
- BR1: Risk thresholds/windows are configurable (System Admin).
- BR2: A `CONFIRMED_FRAUD` outcome rejects the request (P01 `reject`) and raises a security alert (X.2).
- BR3: Risk evaluation never silently auto-approves; it can only add scrutiny.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_risk_signals` | INSERT/UPDATE | signal_type, severity, score, review_outcome |
| `change_requests` | UPDATE | risk_score, risk_band |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/fraud/queue` | Fraud-review queue (cursor) |
| GET | `/api/v1/change-requests/{id}/risk` | Risk signals + score |
| POST | `/api/v1/change-requests/{id}/risk/{signalId}/review` | Clear/confirm/escalate |
| GET | `/api/v1/reports/fraud` | Fraud analytics report |

**UI Behavior Notes:** Risk badge on approver/HR queues; fraud-signal panel listing signals with evidence (linked employee_ids for shared bank account); fraud-review queue with clear/confirm/escalate; fraud report tile (G14).

**Edge Cases:** Legitimate shared account (reviewer clears with reason); high false-positive field (thresholds tunable); signal fires after approval but before commit (commit held, review forced); device signal unavailable (degrade gracefully).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RiskBadge`, `FraudSignalPanel`, `FraudReviewQueue`, `FraudReport`. |
| Backend-Service Flow | `RiskEngine.evaluate(request)` runs detectors → persist signals → aggregate band → influence routing (002, `CONDITIONAL` P01 branch) + commit gate (010); `JOB-G02-RISK` for windows. |
| Data Operations | INSERT cr_risk_signals; UPDATE risk_score/band; P05 capture on review. |
| Validation Logic | Window/threshold config; duplicate-bank detection across employees (tenant-scoped); velocity windows. |
| Authorization Logic | Review: Fraud Reviewer capability flag within scope (P02). |
| State Changes & Side Effects | Injects fraud-review P01 stage; BLOCKED holds commit; CONFIRMED_FRAUD → REJECTED. |
| Failure Handling | Detector failure logged; fail-safe = add scrutiny (never auto-clear). |
| Dependencies & Reuse | Routing (002), approval (004), commit (010), X.2, G14, X.1. |
| Test Guidance | Mule duplicate-bank; pre-payroll/pre-exit windows; device velocity; auth-then-financial chain; reviewer clear/confirm/escalate; BLOCKED commit hold. |

---

### FR-G02-020 — Emergency Reversal / Break-Glass ★ (Imp 15 / R13)

- **Module:** G02-EPDM
- **Primary Role(s):** HR Officer (raise); HR Admin (auth 1) + Appointing Authority (auth 2)
- **User Story:** *As HR, when a wrong bank account is caught hours before payroll, I want a fast, dual-authorised reversal that restores the prior value and triggers a reversing statutory event (posted by G01), so that the error is corrected before money moves — with full audit.*

**Description:** A fast, elevated-authority path to **reverse a committed erroneous change**. A reversal creates a `cr_reversals` row referencing the original committed item, requires **two distinct authorisers** (`auth1 ≠ auth2 ≠ original maker`, enforced by **P02 SoD** + `VAL-G02-DUALAUTH`), restores `revert_to_value` to G01/M01 via the effective-dated path, marks the item `REVERSED`, and — for statutory items — commits the reversing change to G01, on which **G01 posts the reversing G12 SR event** (`source_module=G01`; tracked via FR-011) and a reversing retro event (FR-022) is emitted. Idempotent on `item_id + ':REV:' + reversal_id`. Run as a short P01 dual-authorisation flow.

**Acceptance Criteria:**
1. A reversal can be initiated only against a `COMMITTED` item, with a mandatory reason (`ERR-REASON-REQ`).
2. Execution requires two distinct authorisers; `auth1 ≠ auth2 ≠ original committing maker` (**P02 SoD**; 412 `ERR-G02-DUALAUTH` if not satisfied).
3. On execution, G01/M01 is restored to `revert_to_value` (effective-dated), item → `REVERSED`, request → `REVERSED`, all captured by **P05**.
4. Statutory reversals cause **G01 to post** a reversing G12 SR event (`source_module=G01`; tracked via FR-011); retro-impacting reversals emit a reversing retro event (FR-022).
5. The reversal is idempotent; a re-run is a no-op.
6. If payroll has already consumed the change, the reversal still records and notifies G10 to recover/adjust (tracked via retro).

**Business Rules:**
- BR1: Break-glass is logged to **P05 `security_audit_log`** + the privileged-action report (§12).
- BR2: A reversal never deletes history; it appends a compensating change.
- BR3: Dual authorisation is mandatory and cannot be a single person (P02).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_reversals` | INSERT/UPDATE | original item, auth1/auth2, revert_to_value, statuses |
| `change_request_items` | UPDATE | item_status `REVERSED` |
| `change_requests` | INSERT (REVERSAL child) | parent_reversal_id |
| `service_register_events` (G12) | posted by **G01** (G02 tracks) | reversing event |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/items/{itemId}/reversal` | Initiate (raise) |
| POST | `/api/v1/reversals/{reversalId}/authorize` | Authorize (auth1/auth2) |
| GET | `/api/v1/reversals/{reversalId}` | Status |

**UI Behavior Notes:** "Emergency reversal" action on a committed item (elevated roles only), with a prominent dual-authorisation flow, mandatory reason, and a "break-glass action" warning; status panel showing G01/M01 revert + reversing G12 SR/retro status.

**Edge Cases:** Both authorisers same person (blocked, P02); original maker tries to authorise (blocked); reversal of an already-reversed item (idempotent no-op); payroll already paid (record + G10 recovery via retro); reversing SR for a never-posted item (skip with note).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ReversalInitiateDialog`, `DualAuthorizePanel`, `ReversalStatusPanel`. |
| Backend-Service Flow | `ReversalService.raise()→authorize(auth1)→authorize(auth2)→execute()`: restore G01/M01 (effective-dated, idempotent) → mark REVERSED → post reversing G12 SR (011) + retro (022) → P05 capture + security report. |
| Data Operations | INSERT cr_reversals + REVERSAL child CR; UPDATE item/request status; G01/M01 revert; G12 reversing event. |
| Validation Logic | Item is COMMITTED; dual-auth distinctness (`VAL-G02-DUALAUTH`, P02 SoD); idempotency key. |
| Authorization Logic | Raise: HR; authorize: two distinct elevated authorisers ≠ maker (P02). |
| State Changes & Side Effects | Item→REVERSED; request→REVERSED; reversing G12 SR/retro; security-report entry. |
| Failure Handling | G01/M01 revert failure → retry (X.1); partial → saga compensation; persistent → alert. |
| Dependencies & Reuse | Commit (010), G12 (011), retro (022), security report (§12), G01/M01 effective-dated path. |
| Test Guidance | Dual-auth distinctness; maker-exclusion; idempotent re-run; reversing SR/retro; payroll-already-paid recovery. |

---

### FR-G02-021 — Data-Subject Grievance & Objection ★ (Imp 16 / R14)

- **Module:** G02-EPDM
- **Primary Role(s):** Employee (data subject); Grievance Officer (RBAC capability flag)
- **User Story:** *As an employee, I want to contest or object to a change made to my record, so that an unauthorised or incorrect change is paused or reversed and reviewed fairly (DPDPA-aligned).*

**Description:** A DPDPA-aligned dispute path. The data subject can raise a `cr_objections` row against an **in-flight** request (effect `PAUSE` → `OBJECTED`) or a **committed** change (effect `REVERSAL_REQUESTED` → routes to FR-020 review). The objection is assigned to a Grievance Officer (capability flag) who reviews and resolves (`UPHELD`→pause/reverse, or `DISMISSED` with reason). Tied to the notice flow (FR-017) so an objection during the window pauses commit.

**Acceptance Criteria:**
1. A data subject can object to any change to *their own* record, in-flight or committed (P02 own-record).
2. An in-flight objection pauses the request (`OBJECTED`) and stops P01 SLA timers.
3. A committed-change objection creates a reversal-review item routed to FR-020 (dual-auth) if upheld.
4. Objections are assigned to a Grievance Officer; resolution requires a comment (`ERR-REASON-REQ`) and is captured by P05.
5. The data subject is notified of the outcome (X.2).

**Business Rules:**
- BR1: An objection during the FR-017 window holds any financial credit until resolved.
- BR2: Only the data subject (or authorised representative) may raise an objection on their record.
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
| GET | `/api/v1/objections/queue` | Grievance Officer queue (cursor) |
| POST | `/api/v1/objections/{id}/resolve` | Uphold/dismiss with comment |

**UI Behavior Notes:** "Object to this change" action on the data subject's notice/history; Grievance Officer queue with case detail, evidence, and uphold/dismiss; outcome notification (X.2).

**Edge Cases:** Objection after commit and after payroll (routes to reversal + G10 recovery); duplicate objections (merged); objection on a legitimately self-initiated change (dismissed with explanation); representative objection (authorisation verified).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `ObjectionForm`, `GrievanceQueue`, `ObjectionCaseDetail`. |
| Backend-Service Flow | `ObjectionService.raise()` → PAUSE (in-flight) or REVERSAL_REQUESTED (committed) → assign Grievance Officer → `resolve()` → pause/reverse/dismiss. |
| Data Operations | INSERT/UPDATE cr_objections; UPDATE change_requests.status; INSERT cr_reversals if upheld; P05 capture; X.2 notify. |
| Validation Logic | Ownership/representative (P02); in-flight vs committed effect; resolution comment mandatory. |
| Authorization Logic | Raise: data subject; resolve: Grievance Officer capability flag (P02). |
| State Changes & Side Effects | `→OBJECTED`; credit hold; reversal trigger; SLA pause. |
| Failure Handling | Illegal state (already terminal) → 409 `CONFLICT` with guidance. |
| Dependencies & Reuse | Notice (017), reversal (020), SLA (007), X.2. |
| Test Guidance | In-flight pause; committed→reversal; window-credit hold; dismiss with reason; representative auth; outcome notice. |

---

### FR-G02-022 — Downstream Retro-Impact Reconciliation (G10/G11/G06) ★ (Imp 9 / R7)

- **Module:** G02-EPDM
- **Primary Role(s):** System; HR Admin (reconciliation)
- **User Story:** *As HR governance, I want every retro-impacting correction to actually trigger and confirm pay/pension/seniority recomputation downstream — tracked, retried and reconciled — so that the disputes G02 exists to prevent are actually closed.*

**Description:** Replaces v1's fire-and-forget event with a **tracked, acknowledged, reconciled** loop. On commit of a retro-impacting item (catalog `retro_targets`), G02 emits one `retro_impact_events` row per target module (**G10** payroll, **G11** pension, **G06** seniority), each idempotent, dispatched via **X.3**, retried by the **X.1 runner** (backoff ×3) with dead-letter on persistent failure, and **reconciled** until the downstream module returns an acknowledgement (`ACKED`). Reversals emit reversing retro events.

**Acceptance Criteria:**
1. On commit of an item whose catalog has `retro_targets`, one `retro_impact_events` row per target is created (`PENDING`) **after** `COMMITTED` (R15).
2. Each event is dispatched idempotently (`item_id + ':RETRO:' + module`) and transitions `SENT`→`ACKED` on downstream acknowledgement.
3. Persistent failure → `DEAD_LETTER` + HR alert (X.2, JOB-FAIL) + appears in the retro-reconciliation report (FR-016).
4. A retro event is not closed until `ACKED`; the reconciliation report lists any non-ACKED event.
5. Reversals (FR-020) emit reversing retro events.

**Business Rules:**
- BR1: Retro tracking never blocks the `COMMITTED` state (R15); reported/reconciled separately.
- BR2: Idempotency guarantees no double recomputation.
- BR3: `effective_from` drives the recomputation period passed downstream.

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `retro_impact_events` | INSERT/UPDATE | target_module, status, ack_reference, attempts |
| `change_request_items` | UPDATE | retro_status |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| (internal) | `RetroService.emit(item)` (X.3) | Triggered post-commit |
| POST | `/api/v1/retro-events/{id}/ack` | Downstream module acknowledges (G10/G11/G06) |
| POST | `/api/v1/retro-events/{id}/retry` | Manual retry (HR Admin) |
| GET | `/api/v1/reports/retro-reconciliation` | Unacked/dead-letter events (cursor) |

**UI Behavior Notes:** Retro status chip per item (Pending / Sent / Acked / Failed); HR retro-reconciliation dashboard with retry and dead-letter triage; downstream ack reference shown.

**Edge Cases:** Downstream module down (X.3 queue + retry, PENDING); duplicate emit (idempotent); ack for an unknown event (rejected, logged); reversing retro after the original was already ACKED (compensating event).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `RetroStatusChip`, `RetroReconciliationDashboard`. |
| Backend-Service Flow | `RetroService.emit()`: build payload per target → dispatch idempotently (X.3) → await `ack()` → `ACKED`; X.1 retry/backoff/dead-letter; `emitReversing()` for FR-020. |
| Data Operations | INSERT retro_impact_events; UPDATE retro_status; P05 capture. |
| Validation Logic | retro_targets present; idempotency; ack matching. |
| Authorization Logic | System-triggered; ack: downstream module service identity (P02); retry: HR Admin. |
| State Changes & Side Effects | `PENDING→SENT→ACKED` or `FAILED→DEAD_LETTER`; reversing events. |
| Failure Handling | X.1 retry w/ backoff + dead-letter; reconciliation report; never drops. |
| Dependencies & Reuse | Commit (010), reversal (020), G10/G11/G06 consumers, G14, X.1/X.3. |
| Test Guidance | Per-target emit after commit; idempotent dispatch; ack→ACKED; dead-letter; reconciliation listing; reversing retro. |

---

### FR-G02-023 — Requester Step-Up Authentication for Sensitive Self-Service ★ (Imp 6 / R16)

- **Module:** G02-EPDM
- **Primary Role(s):** Employee (Self-Service)
- **User Story:** *As the platform, I want a fresh step-up re-authentication before an employee initiates a HIGH/STATUTORY self-service change, so that a hijacked session cannot silently start a sensitive change.*

**Description:** Before a self-service requester can submit a HIGH/STATUTORY change, G02 **invokes the platform step-up challenge** (MFA TOTP/push, WebAuthn, or OTP — platform §3.1) and records a `cr_step_up_events` row with method, assurance level and a short validity window. Submission of a sensitive self-service request requires a valid, unexpired `SUCCESS` step-up bound to the request. Independent of approver e-sign (a different control at a different stage). High-privilege statutory roles already require MFA by default (§3.1).

**Acceptance Criteria:**
1. Initiating a HIGH/STATUTORY self-service request triggers a platform step-up challenge.
2. A successful step-up creates a `cr_step_up_events.SUCCESS` row with `auth_assurance_level` (e.g. AAL2) and `expires_at`.
3. Submission without a valid, unexpired, request-bound step-up → **412 `PRECONDITION_FAILED`/`ERR-G02-STEPUP`**.
4. Failed step-ups are recorded (P05 `security_audit_log`) and do not permit submission.
5. Step-up is required at initiation regardless of, and in addition to, any approver e-signature.

**Business Rules:**
- BR1: Step-up validity window is short and configurable (default 10 minutes).
- BR2: Step-up applies to self-service only; HR-on-behalf uses HR controls + data-subject notice instead.
- BR3: Step-up events are append-only and auditable (P05).

**Data Model References:**

| Entity | Operation | Key fields |
|---|---|---|
| `cr_step_up_events` | INSERT | method, result, assurance, expires_at |
| `change_requests` | UPDATE | step_up_event_id |

**API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/change-requests/{id}/step-up/challenge` | Initiate platform challenge |
| POST | `/api/v1/change-requests/{id}/step-up/verify` | Verify challenge result |

**UI Behavior Notes:** Step-up modal (method per platform policy) shown when a sensitive field is added or at submit; "Confirm it's you to continue" prompt; expired step-up re-challenges automatically.

**Edge Cases:** Step-up provider down (block submission, retry; 412/`ERR-PRECOND`); step-up expires before submit (re-challenge); user abandons step-up (request stays DRAFT); HR-on-behalf path (no step-up; uses notice instead).

**LLD:**

| Aspect | Specification |
|---|---|
| Components & Screen Behavior | `StepUpModal`; auto re-challenge on expiry. |
| Backend-Service Flow | `StepUpService.challenge()/verify()` via **platform auth (§3.1)** → persist `cr_step_up_events` → bind to CR → gate submit (FR-001 AC7). |
| Data Operations | INSERT cr_step_up_events; UPDATE change_requests.step_up_event_id; P05 capture. |
| Validation Logic | Method per policy; assurance level; expiry; request binding. |
| Authorization Logic | Self requester only; sensitive tiers only (P02). |
| State Changes & Side Effects | Enables submit for sensitive self-service. |
| Failure Handling | Provider down → block + retry; failed/expired → re-challenge. |
| Dependencies & Reuse | Platform auth/step-up (§3.1); authoring (001). |
| Test Guidance | Challenge on sensitive; submit blocked without valid step-up; expiry re-challenge; provider down; HR-on-behalf skips step-up. |


---

## 7. UI Requirements

### 7.1 Key screens

| Screen | Primary role(s) | Purpose |
|---|---|---|
| My Requests (list) | Employee/HR | Track own/initiated requests with status, SLA, action-needed, risk flags |
| New Request / Template Gallery | Employee/HR | Start a request (blank or W.2 template); HR-only fields shown as HR-assisted |
| Change Request Editor | Employee/HR | `E·AR` "Request change" pattern; before/after diff rows, reason, effective date, clear-field, document attach, step-up |
| Review & Submit | Employee/HR | Final diff summary + computed P01 route + fraud/elevated badges |
| Approval Workspace | Approvers | P01 task queue + diff + evidence + risk panel + decision bar + strong e-sign (Me/My Team/Admin workspace) |
| Document & Authority-Portal Verify Panel | HR/authority | Verify/reject evidence (G13) + portal verification (X.3) beside the diff |
| Data-Subject Notice & Objection | Employee | Confirm/object to a change to own record; objection window countdown |
| Grievance Queue | Grievance Officer (flag) | Triage and resolve objections |
| Fraud-Review Queue | Fraud Reviewer (flag) | Clear/confirm/escalate risk signals |
| Emergency Reversal (Break-Glass) | HR + dual authority | Initiate + dual-authorise a reversal |
| Bulk Correction Wizard | HR | Upload, validate, review, approve batch (P4) |
| Configuration Console | System Admin (Org Admin) | W.1/W.2 builders: field sensitivity, approval flow, e-sign policy, regex safety |
| Delegation Manager | Approvers/Admin | Create/revoke P01 delegations (P4) |
| Field History & Reports | Auditor/HR/Employee | Provenance timelines (P05), audit-integrity tile, exportable reports |
| SR & Retro Reconciliation Dashboard | SR Custodian/HR | Unposted/failed statutory + unacked retro events |

### 7.2 UX standards (platform canonical states — Foundation §3)

- **Five canonical states for every data surface:** **empty** (purpose + primary action), **loading** (skeleton, no layout shift), **error** (inline from an `ERR-*` id + retry, never a raw stack/500), **no-permission** (gating menu item hidden; deep-linked forbidden resource shows `ERR-FORBIDDEN`, not a 404 leak), **partial-data** (render what is authorised, mask the rest per RBAC). No skeleton-only screens.
- **Accessibility:** WCAG 2.1 AA — keyboard navigable, focus-visible, ARIA labels, AA contrast, screen-reader-friendly diff ("old/new"/"cleared"); responsive 375/768/1280 px; touch targets ≥ 44×44 px.
- **Sensitive-value masking** by default with **P02 serialization mask**; audited reveal (vault detokenise) for permitted roles; Aadhaar last-4 only; masked-own-view (owner sees Tier-1 IDs masked, may export full record).
- **Inline validation** mapping to the platform error envelope `field` and `VAL-*` ids.
- **Status & risk semantics:** consistent color/iconography for statuses, SLA, risk band.
- **i18n & locale:** `DD-MMM-YYYY` dates, INR formatting, translatable labels; UTC stored; W.2 form i18n.
- **Confirmation & legal notices:** destructive/irreversible actions (reject, withdraw, activate matrix, break-glass reversal) require explicit confirmation; e-sign and break-glass show a legal/break-glass notice.
- **Out-of-band & step-up cues:** clear "confirm it's you" step-up and "a change was made to your record" data-subject prompts.
- **Workspace model:** approver tasks route to exactly one workspace (Me / My Team / Admin); switches audit-logged (Foundation §6.5).
- **Component vocabulary (Foundation §3):** `E·AR` request-change field, effective-dated field (current + staged value), masked field, multi-step wizard, list+filter+bulk toolbar, approval action bar (approve/reject/send-back/delegate), attachment control (`VAL-FILE`), comment box (`VAL-COMMENT`), date/effective-date picker, read-only audit trail panel.

### 7.3 Notable component behaviors

- Diff cards render typed values, highlights, and a cleared-field indicator; multi-line/JSON use structured diff.
- Approval queue shows SLA countdown, sensitivity, and risk badges; overdue + high-risk filters; P01 bulk queue actions on high-volume queues.
- Fraud-signal panel lists signals with evidence (linked employees for a shared bank account).
- Bulk validation grid filters valid/invalid with inline reasons, portal-required and non-ACTIVE flags, downloadable report.
- W.1 approval builder supports drag-ordered levels, parallel grouping, role pickers (RBAC), status-scope, e-sign-method policy, and a regex-safety tester with pre-activation validation.
- Audit-integrity tile shows last P05/OPEN-PLAT-03 chain-verification time and any detected break.

---

## 8. API & Integration

### 8.1 Conventions (platform — Foundation §1)

- Base path **`/api/v1`**; JSON; **JWT bearer** carrying resolved roles + tenant/entity scope; **P02 `Authorization.check`** enforced server-side (endpoints never re-implement permission logic); step-up tokens honored for sensitive initiation.
- All list endpoints use **cursor pagination** (`?limit=` default 25 / max 100, `next_cursor`); **offset paging is not used**.
- **`Idempotency-Key`** header on unsafe workflow-initiating POSTs (24h replay → original result); per-operation idempotency keys per §16.3.
- **`X-Correlation-Id`** request/response header, echoed to every P05 audit/log line; `?sort=field:asc|desc`.
- Timestamps ISO-8601 UTC; money INR; dates `YYYY-MM-DD` in payloads, `DD-MMM-YYYY` in UI; `effective_from` for effective-dated mutations.

### 8.2 Canonical error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Effective date must be on or before the original DOB date.",
    "field": "effective_from",
    "details": { "rule": "VAL-EFFECTIVE" }
  }
}
```

2xx returns the resource payload. **The correlation id is the `X-Correlation-Id` response header — there is no body `requestId`** (override of the invented v2 envelope, `MODULE_RECONCILIATION.md` §C).

### 8.3 HTTP / error-code catalog (platform 8-code table + G02-unique `ERR-G02-*`)

| Code | HTTP | When | Message id |
|---|---|---|---|
| `VALIDATION_FAILED` | **422** | A cited `VAL-*` fails (format/effective-date/required/null-without-clear); weak e-sign method | `ERR-G02-*` / `ERR-PAST-DATED` / `ERR-REASON-REQ` |
| `UNAUTHENTICATED` | 401 | Missing/expired session | — |
| `FORBIDDEN` | 403 | Ownership/scope/permission/SoD/status-gate violation (P02) | `ERR-FORBIDDEN` / `ERR-G02-SOD` / `ERR-G02-STATUSGATE` |
| `NOT_FOUND` | 404 | Unknown/out-of-scope request/template/field/batch/objection/reversal | — |
| `CONFLICT` | **409** | Idempotency replay, **duplicate workflow start**, stale value, illegal transition, double-decision | `ERR-DUP-INSTANCE` / `ERR-G02-STALE` |
| `PRECONDITION_FAILED` | **412** | Required precondition unmet: missing/unverified doc, portal verify, e-sign, step-up, DOB hard-block, risk-block | `ERR-PRECOND` / `ERR-G02-AUTHPORTAL` / `ERR-G02-ESIGN` / `ERR-G02-STEPUP` / `ERR-G02-HARDBLOCK` / `ERR-G02-RISKBLOCK` / `ERR-G02-DUALAUTH` |
| `RATE_LIMITED` | 429 | Throttle exceeded | — |
| `INTERNAL` | 500 | Unexpected server error / invalid config fallback (no 503 — upstream handled via X.3 + `ERR-LOADFAIL`) | `ERR-LOADFAIL` |

**Notes (override of invented v2 codes, `MODULE_RECONCILIATION.md` §C):** `VALIDATION_ERROR(400)`→`VALIDATION_FAILED(422)`; `AUTH_REQUIRED(401)`→`UNAUTHENTICATED`; `INTERNAL_ERROR(500)`→`INTERNAL`; `UPSTREAM_UNAVAILABLE(503)` **dropped** (X.3 maps upstream failure to 500/`ERR-LOADFAIL` or 412/`ERR-PRECOND`); invented `423 RISK_BLOCKED`/`502 SR_POSTING_FAILED`/`502 RETRO_ACK_FAILED` are **not HTTP codes** — they are *async statuses* surfaced via reconciliation reports and `JOB-FAIL`→`MSG-SYS-JOBFAIL`. New `ERR-G02-*` ids are registered in the Foundation §5 catalogue.

**G02-unique error ids registered (Foundation §5):** `ERR-G02-STALE`, `ERR-G02-STEPUP`, `ERR-G02-STATUSGATE`, `ERR-G02-HARDBLOCK`, `ERR-G02-ESIGN`, `ERR-G02-ESIGN-METHOD`, `ERR-G02-AUTHPORTAL`, `ERR-G02-RISKBLOCK`, `ERR-G02-DUALAUTH`, `ERR-G02-SOD`.

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

### 8.5 JSON examples (platform conventions)

**(1) Create change request (composite name + clear middle name) — `POST /api/v1/change-requests`** (header `Idempotency-Key: …`)

```json
// Request
{
  "targetEmployeeId": "emp-045",
  "changeType": "CORRECTION",
  "effectiveFrom": "1990-05-12",
  "reason": "Name recorded incorrectly at joining; gazette correction issued.",
  "stepUpEventId": "su-01",
  "items": [
    { "fieldKey": "first_name", "m01FieldKey": "employees.first_name", "newValue": "Anita" },
    { "fieldKey": "middle_name", "m01FieldKey": "employees.middle_name", "newValue": null, "clearIntent": true }
  ]
}
// Response 201 (X-Correlation-Id header carries the correlation id)
{
  "changeRequestId": "7a1e02",
  "crNumber": "CR-2026-000124",
  "status": "PENDING_DOCS",
  "highestSensitivity": "STATUTORY",
  "riskBand": "LOW",
  "workflowInstanceId": "wfi-9002",
  "routePreview": [
    { "levelNo": 1, "nodeType": "VERIFY", "requiredRole": "HRBP", "pattern": "SEQUENTIAL", "slaHours": 48 },
    { "levelNo": 2, "nodeType": "SANCTION", "requiredRole": "APPOINTING_AUTHORITY", "pattern": "SEQUENTIAL", "slaHours": 72, "requiresEsignature": true, "allowedEsignMethods": ["PKI_DSC","AADHAAR_ESIGN"] }
  ]
}
```

**(2) Approve a sensitive node — weak e-sign rejected (422)**

```json
// Request
{ "decision": "APPROVED", "comment": "Gazette + birth certificate verified.", "esignatureId": "es-otp-99" }
// Error 422
{ "error": { "code": "VALIDATION_FAILED", "message": "STATUTORY sanction requires PKI/DSC or Aadhaar e-Sign; OTP is not permitted.", "field": "esignatureId", "details": { "id": "ERR-G02-ESIGN-METHOD", "rule": "VAL-G02-ESIGN-METHOD" } } }
```

**(3) Step-up required on sensitive self-service — `POST /submit` (412)**

```json
{ "error": { "code": "PRECONDITION_FAILED", "message": "Confirm it's you (step-up authentication) to submit a STATUTORY change.", "field": "stepUpEventId", "details": { "id": "ERR-G02-STEPUP" } } }
```

**(4) Employment-status gate block — `POST /change-requests` self-service on RETIRED (403)**

```json
{ "error": { "code": "FORBIDDEN", "message": "This record is RETIRED; bank changes require HR with Appointing-Authority sanction.", "field": "employmentStatus", "details": { "id": "ERR-G02-STATUSGATE" } } }
```

**(5) Duplicate workflow start — `POST /submit` (409)**

```json
{ "error": { "code": "CONFLICT", "message": "A request for this already exists and is in progress.", "field": "fieldKey", "details": { "id": "ERR-DUP-INSTANCE" } } }
```

**(6) DOB statutory hard-block — `GET /hard-block-check?fieldKey=dob` (412)**

```json
{ "error": { "code": "PRECONDITION_FAILED", "message": "DOB alteration is barred within 5 years of superannuation; a separate legal process is required.", "field": "dob", "details": { "id": "ERR-G02-HARDBLOCK", "rule": "VAL-G02-HARDBLOCK" } } }
```

**(7) Fraud-blocked request — duplicate bank account / mule (412)**

```json
{ "error": { "code": "PRECONDITION_FAILED", "message": "This bank account is already used by 2 other employees; held for fraud review.", "field": "bank_account_no", "details": { "id": "ERR-G02-RISKBLOCK", "signals": [ { "signalType": "DUPLICATE_BANK_ACCOUNT", "severity": "HIGH", "linkedEmployees": ["emp-201","emp-318"] } ] } } }
```

**(8) Retro reconciliation — `GET /reports/retro-reconciliation` (cursor)**

```json
{ "data": [ { "retroEventId": "re-02", "itemId": "it-002", "targetModule": "G06", "status": "PENDING", "attempts": 3, "effectiveDate": "1990-05-12" } ],
  "limit": 25, "next_cursor": null }
```

**(9) Field history — `GET /employees/{id}/field-history?fieldKey=dob` (cursor)**

```json
{
  "data": [
    {
      "fieldKey": "dob", "m01FieldKey": "employees.dob", "oldValue": "1990-05-21", "newValue": "1990-05-12",
      "changeType": "CORRECTION", "effectiveFrom": "1990-05-12", "recordedAt": "2026-06-28T10:20:00Z",
      "crNumber": "CR-2026-000124",
      "authority": [ {"role":"HRBP","action":"VERIFY"}, {"role":"APPOINTING_AUTHORITY","action":"SANCTION","esign":"PKI_DSC"} ],
      "documents": ["GAZETTE_NOTIFICATION","BIRTH_CERTIFICATE"], "srStatus": "POSTED", "retroStatus": {"G11":"ACKED","G06":"PENDING"},
      "auditChainVerified": true, "auditSource": "P05"
    }
  ],
  "limit": 25, "next_cursor": null
}
```

### 8.6 External integrations (all internal calls inherit auth context + idempotency key + correlation id + standard error envelope — Platform §0.4)

| System | Direction | Contract |
|---|---|---|
| G01/M01 Employee Master | G02↔G01 | Read field/value/version + `employment_status`; **effective-dated** staged commit (`effective_from`, `JOB-G01-EFFDATE`, version token, idempotent) ◆ |
| **G12** Digital SR (net-new gov ledger on P05) | **G01→G12** (G02 reads status) | On commit, **G01 posts** the identity/personal-data SR event (`source_module=G01`, idempotent, `VAL-G12-SREVENT`, incl. **reversing events**); G02 supplies change context to G01 and tracks posting status — **G02 is not an SR writer** |
| G13/M11 Document Mgmt | G02↔G13 | Upload ref, scan-status (`VAL-FILE`), reference, export-artefact store |
| Authority-verification providers (UIDAI/PAN/caste) | G02→ via **X.3** | Verify + reference; credentials from `integration_credentials` (P04); circuit-break/retry |
| G10 Payroll / G11 Pension / G06 Seniority | G02↔ (event + ack) | Emits retro event (X.3); consumer **acknowledges** (`/retro-events/{id}/ack`); reversing events on FR-020 |
| G06 Promotion | G02→ | Promotion-eligibility freeze flag on caste/category verification |
| **P01** WorkflowEngine | G02↔ | `startInstance/advance/approve/reject/sendBack/delegate/cancel/query`; configured W.1 flow |
| **P02** Authorization | G02→ | `Authorization.check` for every endpoint |
| **P05** Audit | G02↔ | DB-trigger capture; `Audit.query/export`; OPEN-PLAT-03 |
| E-Sign provider(s) | G02→ via X.3 | PKI/DSC, Aadhaar e-Sign, OTP (no password re-auth); method policy enforced |
| Platform step-up / MFA (§3.1) | G02→ | Step-up challenge/verify for sensitive self-service initiation |
| Data vault / KMS | G02↔ | Aadhaar tokenisation, field-level keys, rotation, crypto-shred |
| **X.2** Notification | G02→ | IN_APP+EMAIL parallel; out-of-band data-subject notice; `MSG-G02-*` |
| Business-calendar service | G02→ | P01 SLA computation (calendar-day fallback for P1) |

---

## 9. Non-Functional Requirements (platform NFR baseline §8.2 — overrides invented v2 NFR)

| Category | Requirement |
|---|---|
| Performance | Standard API **p95 < 500 ms @ 300 concurrent**; read-heavy (history/reports) p95 < 300 ms cached / < 1000 ms uncached; **writes p95 < 1500 ms**; commit + SR + retro async ≤ 30 s p95; risk evaluation ≤ 2 s p95; bulk validate streams progress up to 50k rows (P4) |
| Scalability | Horizontal scaling; X.1 queue-based commit/SR/retro/reversal workers; **cursor pagination** max 100 |
| Availability | **99.5%/month** uptime; graceful degradation when G01/G12/G13/portal/step-up unavailable (X.3 circuit-break + queue + retry, never lose requests); status/step-up gates fail **closed** |
| Reliability | **RTO < 4 h · RPO < 1 h**; idempotent commit/posting/retro/reversal (`Idempotency-Key` + P01 idempotent advance); dead-letter queues (X.1/X.2) with reconciliation |
| Security | OWASP/ASVS posture; TLS in transit; encryption at rest for sensitive `change_request_items` (field-level KMS keys, rotation); Aadhaar tokenised in vault; **P02** RBAC + row+field scope + PII ceiling; **step-up for sensitive initiation (§3.1)**; **SoD enforced by P01/P02**; strong e-sign only for FINANCIAL/STATUTORY; ReDoS-guarded admin regex (`VAL-G02-REGEXSAFE`) |
| Privacy (DPDPA) | DPDPA alignment; legal-basis + statutory retention-override (§4.4); PII minimisation; sensitive values masked per P02 ceiling; crypto-shred erasure preserving the P05 provenance shell (redaction marker); never log raw sensitive old/new values |
| Auditability (tamper-evident) | **100% mutation capture via P05 DB-trigger dual-log** (`audit_log` + `security_audit_log`), immutable, ≥7-yr; tamper-evidence via **OPEN-PLAT-03** hash-chaining (chain head → WORM); `esignatures` hash-chained; scheduled + on-demand integrity verification (`JOB-G02-AUDITVERIFY`) with alarm on break |
| Fraud resilience | Risk scoring on sensitive requests; mule/velocity/pre-payroll/pre-exit/auth-then-financial detection; high-risk held for review (P01 `CONDITIONAL`); confirmed fraud rejected + alerted (X.2) |
| Data-subject rights | Out-of-band notice (X.2) on third-party-initiated changes; objection/grievance path; financial credit held during objection window |
| Accessibility | **WCAG 2.1 AA** across all screens; responsive 375/768/1280; touch ≥ 44×44 px |
| Observability | Structured logs (no PII) with `X-Correlation-Id`, metrics (SLA breaches, commit/SR/retro failures, risk hits, chain-break), per Platform §0.5 |
| Retention | Requests + audit retained per **P05** (≥ 7 years; government schedule, never below statutory floor) |
| Compatibility | REST `/api/v1`; additive non-breaking versioning; documented contracts for G01/G12/G13/G10/G11/G06 |
| Localization | UTC storage; locale display; INR; translatable W.2 form strings |


---

## 10. Workflow & State Diagrams

### 10.1 Change request lifecycle (state table — driven by P01)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | create draft | `DRAFT` | P02-authorized requester; status-gate ALLOW/ELEVATE |
| `DRAFT` | submit (sensitive self-service) | `SUBMITTED`/`PENDING_DOCS` | valid step-up (FR-023); **P01 `startInstance`** |
| `DRAFT` | submit (HR_ON_BEHALF/BULK) | `NOTICE_HOLD` | data-subject notice dispatched (FR-017, X.2) |
| `NOTICE_HOLD` | window elapsed / confirmed | `SUBMITTED`/`IN_REVIEW` | notice resolved, no objection |
| `NOTICE_HOLD` | data subject objects | `OBJECTED` | objection raised (FR-021) |
| `DRAFT` | submit (docs/portal needed) | `PENDING_DOCS` | required docs/portal not yet verified |
| `PENDING_DOCS` | all docs+portal verified | `IN_REVIEW` | VERIFIED+CLEAN (+portal VERIFIED) |
| `SUBMITTED` | first P01 stage opened | `IN_REVIEW` | route has stages |
| `SUBMITTED` | auto-apply (LOW, non-auth-bearing) | `APPROVED` | auto_apply_on_low, no docs, not auth-bearing |
| `IN_REVIEW` | P01 `approve` (more stages left) | `IN_REVIEW` | next stage pending |
| `IN_REVIEW` | all stages approved | `APPROVED` | route complete + strong e-sign where required + fraud cleared |
| `IN_REVIEW`/`PENDING_DOCS`/`NOTICE_HOLD` | P01 `sendBack` | `RETURNED` | approver/verifier, comment |
| `IN_REVIEW`/`PENDING_DOCS` | P01 `reject` | `REJECTED` | approver, comment |
| any non-terminal | fraud confirmed | `REJECTED` | CONFIRMED_FRAUD (FR-019) |
| `OBJECTED` | objection dismissed | `IN_REVIEW`/prior | Grievance Officer dismisses (FR-021) |
| `OBJECTED` | objection upheld (in-flight) | `REJECTED`/`RETURNED` | per resolution |
| `RETURNED` | resubmit | `SUBMITTED` | requester fixes, re-gate + re-route (P01 re-trigger) |
| non-terminal | withdraw | `WITHDRAWN` | requester owns (P01 `cancel`) |
| `APPROVED` | commit success (effective-dated) | `COMMITTED` | hashes valid, G01/M01 applied/staged |
| `APPROVED` | commit fail (G01 down) | `COMMIT_FAILED` | upstream error |
| `APPROVED` | stale at commit | `RETURNED` | hash mismatch (`ERR-G02-STALE`) |
| `COMMIT_FAILED` | retry success | `COMMITTED` | G01/M01 available |
| `COMMITTED` (multi-item, some failed) | partial | `PARTIALLY_COMMITTED` | some items FAILED |
| `COMMITTED` | break-glass reversal executed | `REVERSED` | dual-auth reversal (FR-020) |

### 10.2 Item-level states & corrected post-commit sequence (R15)

`PENDING → APPROVED → COMMITTED` (happy path); `PENDING → REJECTED`; commit failure → `FAILED`; `COMMITTED → REVERSED` (FR-020).
**Corrected canonical sequence:** **G01/M01 effective-dated commit → item `COMMITTED` → (statutory) G12 SR `PENDING`→`POSTED/FAILED` and (retro) retro `PENDING`→`ACKED/FAILED`.** SR posting and retro acknowledgement are tracked separately and **never** block `COMMITTED`.

### 10.3 P01 stage states

`PENDING → APPROVED | REJECTED | RETURNED | SKIPPED` (`PARALLEL_ANY_OF` loser / escalation). Each transition writes one **`workflow_actions`** row (idempotent advance). Terminal actions are immutable; P05 captures.

### 10.4 Distributed commit (saga/outbox) note

Because the G01/M01 effective-dated write is **staged by `JOB-G01-EFFDATE`** (§3.3), commit uses the **outbox pattern**: G02 records intent in an outbox within its own transaction; a worker invokes the G01/M01 effective-dated commit idempotently; on confirmation (or on the staged-apply date) marks items `COMMITTED`, after which **G01 posts the SR event** (`source_module=G01`; G02 tracks status) and retro events are enqueued. Failure triggers compensation (no partial visible commit) and X.1 retry; persistent failure → `COMMIT_FAILED` with alert.

### 10.5 SLA state overlay (P01 SLA runtime)

Each active P01 stage carries an SLA timer: `SLA_SET → (REMINDER_SENT)* → BREACHED → ESCALATED → (REASSIGNED)`. Timers pause in `RETURNED`/`PENDING_DOCS(scan/portal pending)`/`NOTICE_HOLD`/`OBJECTED`. Reminders via `JOB-G02-SLA` (X.1); breach/escalation via P01 SLA runtime + X.2.

### 10.6 Employment-status gate overlay (FR-018)

At submit, `employment_status_at_submit` drives: `ACTIVE`→standard; `ON_LEAVE`→standard (configurable elevate); `SUSPENDED`/`TERMINATED`→elevated authority + justification; `RETIRED`→elevated (terminal-benefit controls); `DECEASED`→family-pension controlled path (Appointing Authority + enhanced evidence, dual control on financial). Self-service blocked for all non-ACTIVE (`ERR-G02-STATUSGATE`).

### 10.7 Reversal (break-glass) overlay (FR-020)

`COMMITTED item → reversal raised → auth1 → auth2 (distinct, ≠ maker, P02 SoD) → execute (G01/M01 restore, effective-dated) → item REVERSED → reversing G12 SR (statutory) + reversing retro (G10/G11/G06)`. Idempotent; logged to P05 `security_audit_log`.

---

## 11. Notifications (X.2 / W.3 — IN_APP+EMAIL parallel; EMAIL mandatory for approvals & statutory)

All notifications are delivered by **X.2** (engine), configured via **W.3** (recipients/channels/timing), with copy in the Foundation Message Catalogue referenced by **`MSG-G02-*`** id. Approval-workflow and statutory notices fire **IN_APP + EMAIL in parallel**; **EMAIL is mandatory and non-suppressible** (Platform §X.2; BRD §9.9). Retry backoff up to 5 + dead-letter; every dispatch audit-logged (P05).

| Event | Recipients | Channel | Template id |
|---|---|---|---|
| Request submitted | Requester (confirm), first approver | IN_APP + EMAIL | `MSG-G02-SUBMITTED` |
| Docs / authority-portal required or rejected | Requester | IN_APP + EMAIL | `MSG-G02-DOCS-NEEDED` |
| **Out-of-band data-subject notice (HR/BULK)** ★ | Data subject (out-of-band channel) | SMS/EMAIL/POSTAL/IN_APP | `MSG-G02-DSNOTICE` |
| **Auth-bearing contact change — OLD value alert** ★ | OLD phone/email holder | SMS/EMAIL | `MSG-G02-OLDALERT` |
| Awaiting your approval | Current P01 stage approver / delegate | IN_APP + EMAIL | `MSG-G02-TASK-ASSIGNED` |
| SLA reminder (50%/90%) | Current approver | IN_APP + EMAIL | `MSG-G02-SLA-REMIND` |
| SLA breach / escalation | Escalation role + HR Admin | IN_APP + EMAIL | `MSG-G02-SLA-ESC` |
| **High-risk held for fraud review** ★ | Fraud Reviewer, HR Admin | IN_APP + EMAIL | `MSG-G02-FRAUD-REVIEW` |
| **Confirmed fraud** ★ | HR Admin, Security | IN_APP + EMAIL | `MSG-G02-FRAUD-CONFIRMED` |
| Approved & applied | Requester | IN_APP + EMAIL | `MSG-G02-COMMITTED` |
| **FINANCIAL credit held (objection window)** ★ | Requester, HR | IN_APP | `MSG-G02-CREDIT-HELD` |
| Returned for correction | Requester | IN_APP + EMAIL | `MSG-G02-RETURNED` |
| Rejected | Requester | IN_APP + EMAIL | `MSG-G02-REJECTED` |
| **Objection raised / resolved** ★ | Data subject, Grievance Officer | IN_APP + EMAIL | `MSG-G02-OBJECTION` |
| E-signature applied | Signer (receipt), Auditor (P05) | IN_APP | `MSG-G02-ESIGN-RECEIPT` |
| Statutory change posted to G12 | SR Custodian, HR Admin | IN_APP + EMAIL | `MSG-G02-SR-POSTED` |
| SR posting failed | SR Custodian, HR Admin | IN_APP + EMAIL | `MSG-G02-SR-FAILED` |
| **Retro event acked / failed / dead-letter** ★ | HR Admin | IN_APP + EMAIL | `MSG-G02-RETRO-STATUS` |
| **Emergency reversal executed** ★ | Data subject, HR Admin, SR Custodian, G10 | IN_APP + EMAIL | `MSG-G02-REVERSAL` |
| Commit failed | HR Admin | IN_APP + EMAIL | `MSG-G02-COMMIT-FAILED` |
| **Audit-chain integrity break** ★ | Auditor, HR Admin, System Admin | IN_APP + EMAIL | `MSG-G02-AUDIT-BREAK` |
| Bulk batch validated/committed | Initiator, approver | IN_APP + EMAIL | `MSG-G02-BULK-STATUS` |
| Delegation created/expiring | Delegate, delegator | IN_APP + EMAIL | `MSG-G02-DELEGATION` |
| Scheduled job failed | Owning HR admin + platform ops | IN_APP + EMAIL | `MSG-SYS-JOBFAIL` (shared) |

Data-subject and old-channel alerts use an **out-of-band** channel distinct from the requester's session. All `MSG-G02-*` ids are registered in the Foundation §5 master index.

---

## 12. Reporting & Analytics (feeds G14 Dashboard & Analytics; P02-scoped, P05-sourced)

| Report | Audience | Contents |
|---|---|---|
| Change request volume & cycle-time | HR Admin, G14 | Counts by status, sensitivity, field group; median/percentile turnaround |
| SLA compliance & escalations | HR Admin | % within SLA, breaches, escalations, aging buckets (P01 SLA data) |
| Approver workload & delegation | HR Admin | Pending per approver/role; P01 delegation usage |
| Rejection/return analysis | HR Admin | Top rejection reasons, fields, resubmission rates |
| Statutory SR reconciliation | SR Custodian | Committed STATUTORY items vs the **G01-posted** SR events in G12; reconciliation gaps/failures |
| **Retro-impact reconciliation** ★ | HR Admin, G10/G11/G06 | Retro events by status; unacked aging |
| **Fraud & anomaly report** ★ | Fraud Reviewer, HR Admin | Signals by type/severity; mule clusters; pre-payroll/pre-exit spikes; review outcomes |
| **Data-subject rights report** ★ | HR Admin, DPO/Grievance | Notices delivered, objections raised/upheld/dismissed, window-held credits |
| **Privileged-action & SoD security report** ★ | Auditor, System Admin, Security | Config changes (P05 `security_audit_log`), delegations (incl. blocked ineligible attempts), break-glass reversals, SoD-violation attempts |
| **Audit-integrity report** ★ | Auditor, System Admin | Last P05/OPEN-PLAT-03 verification, any chain breaks, e-sign chain status |
| Field-change provenance / audit | Auditor | Full who/what/when/authority/document per field (FR-016, P05) |
| Bulk correction outcomes | HR Admin | Batch success/partial/fail, per-row error patterns |
| Data-quality impact | HR Admin, G14 | Corrections vs updates trend; high-correction fields |

Reports are filterable, **cursor-paginated**, P02-scoped, masked (PII ceiling), and exportable (CSV/PDF via G13). Aggregates feed **G14** as **change-request / workflow operational analytics only** (volume, cycle-time, SLA, fraud, data-subject, reconciliation health). **SR-event analytics are sourced by G14 from G12 (fed by G01→G12), not from G02** — G02 is not an SR feed into the analytics mart.

---

## 13. Migration & Launch (on P06 framework)

### 13.1 Data migration (P06 ETL+V)

- Seed `field_sensitivity_catalog` from the **G01/M01 governed-field registry (§5.8)** with `m01_field_key` + `validation_ref` bound; classify per the re-grounded security-hardened seed (auth-bearing contacts MEDIUM; Aadhaar/PAN/category HR-only + portal; DOB hard-block; dignity-aware gender; `E·AR` mapping).
- Seed a default `approval_matrix_config` (ACTIVE) bound to a **W.1 `WF-G02-SENSITIVE-CHANGE`** flow + rules incl. `employment_status_scope` elevated routes.
- Seed e-sign method policy (strong-only for FINANCIAL/STATUTORY) and `VAL-G02-REGEXSAFE` regex limits.
- Import in-flight legacy change requests as historical/closed records (no re-approval), provenance preserved; migrate via **P06** (Extract→Validate→Transform→Load→Verify; 3 dry runs; `migration_runs` ledger; `<gov>_source_id` traceability column against the legacy register).
- Backfill `documents` references via G13.

### 13.2 Cutover

1. Deploy schema (E1–E17, E19) + config seed; **verify the G01/M01 effective-dated commit (`JOB-G01-EFFDATE`), G12 reversing-event, G13 scan, authority-portal (X.3), step-up (§3.1) and retro-ack contracts in staging (§14.5)**.
2. Freeze direct master edits; route all governed-field changes through G02 (the platform `E·AR` "Request change" pattern).
3. Pilot with one entity (self-service contact fields only — auth-bearing reclassification + old-channel alert), then expand sensitivity tiers.
4. Enable statutory, bulk, delegation, templates only after pilot sign-off and gate clearance.

### 13.3 Rollout phasing (re-phased — Improvement 22; security first)

| Phase | Scope |
|---|---|
| **P1** | LOW/MEDIUM contact & demographic fields (auth-bearing reclassification, old-channel alert), single-stage P01 approval, **employment-status gating (FR-018), data-subject notice (FR-017), P05 tamper-evident audit, step-up (FR-023)** |
| **P2** | HIGH fields (bank, qualification) + documents (G13) + **strong e-sign policy (FR-015)** + **fraud signals (FR-019)** + **emergency reversal (FR-020)** + **data-subject grievance (FR-021)** + FINANCIAL objection-window hold |
| **P3** | STATUTORY fields + G12 SR posting (FR-011) + **retro reconciliation (FR-022)** + senior sanction + DOB hard-block/caste/gender (FR-008) + authority-portal verification (FR-003, X.3) |
| **P4** | Convenience/scale: **templates (FR-014, W.2), delegation (FR-013, P01), bulk corrections incl. 50k async (FR-009, X.1), `PARALLEL_ANY_OF` topology** |

### 13.4 Launch readiness

Acceptance/E2E tests green; SoD + dual-auth + status-gate verified (P01/P02); **G01/M01 effective-dated commit + G12 + G13 + authority-portal + step-up + retro-ack contracts VERIFIED in staging (§14.5)**; SR + retro reconciliation reports empty; **P05/OPEN-PLAT-03 integrity verifier green**; rollback plan (disable G02 write path, revert to controlled HR edit with audit) documented; training for HR/approvers/grievance/fraud reviewers; runbooks for commit-failure, SR-posting-failure, retro-dead-letter, fraud-queue and break-glass.


---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 FR → Entities → APIs → Platform-service traceability matrix

| FR | Primary entities | Key APIs | Platform service | Depends on | Downstream |
|---|---|---|---|---|---|
| FR-G02-001 | change_requests, change_request_items | POST /change-requests, /submit | P01 startInstance, P02 | 002,003,017,018,019,023 | 004 |
| FR-G02-002 | approval_matrix_*, field_sensitivity_catalog, change_request_approvals | /route-preview | P01 (patterns), W.1 | 012,018,019 | 004,001 |
| FR-G02-003 | change_request_documents, documents(G13) | /documents, /verify, /authority-verify | G13, X.3 | G13, authority portals | 004,008 |
| FR-G02-004 | change_request_approvals, workflow_actions(P01) | /approvals/{node}/decide, /queue | P01 approve/reject/sendBack, P02 SoD | 002,013,015,019 | 006,010 |
| FR-G02-005 | change_request_items | /diff | P02 field mask | 001 | 004,016 |
| FR-G02-006 | change_requests, change_request_approvals | /withdraw, /resubmit | P01 sendBack/cancel | 004,021 | 002 |
| FR-G02-007 | cr_sla_events, workflow_actions(P01) | /sla, JOB-G02-SLA | P01 SLA runtime, X.1 | 002,012,017 | 011 |
| FR-G02-008 | change_requests, change_request_items, retro_impact_events | /effective-date-rules, /hard-block-check | VAL-EFFECTIVE, JOB-G01-EFFDATE | catalog,003 | 010,011,022,G06 |
| FR-G02-009 | bulk_correction_batches, change_requests, data_subject_notices | /bulk-corrections/* | P01, X.1, G13 | 002,010,011,017,018,022 | 010,011,022 |
| FR-G02-010 | change_request_items, employees(G01/M01) | CommitService, /commit-status | G01/M01 effective-dated, P05 | 004,017,G01 | 011,022 |
| FR-G02-011 | change_request_items, service_register_events(G12), cr_reversals | SrPosting, /sr-status, /sr-retry | G12 ledger, X.3 | 010,020,G12 | 016 |
| FR-G02-012 | field_sensitivity_catalog, approval_matrix_* | /admin/*, /validation-regex/test | W.1/W.2, P05 security_audit_log | RBAC,G12 types | 002,015 |
| FR-G02-013 | delegations, change_request_approvals | /delegations | P01 delegate, P02 | RBAC | 004,007 |
| FR-G02-014 | change_request_templates, change_requests | /change-request-templates | W.2 forms | 012 | 001 |
| FR-G02-015 | esignatures, change_request_approvals | /esign | X.3 e-sign, OPEN-PLAT-03 | 004,012,provider | 011 |
| FR-G02-016 | all change_request_*, esignatures, retro_impact_events | /field-history, /reports/*, /audit/verify-chain | P05 Audit.query, OPEN-PLAT-03 | all | G14 |
| FR-G02-017 | data_subject_notices, change_requests, notifications | /notice, /notice/confirm, /notice/object | X.2/W.3, JOB-G02-NOTICE | 001,009 | 010,021 |
| FR-G02-018 | change_requests, employees(G01/M01), approval_matrix_rules | /status-gate | G01/M01, P02 | G01 | 002,010 |
| FR-G02-019 | cr_risk_signals, change_requests | /fraud/queue, /risk, /risk/{id}/review | P01 CONDITIONAL, JOB-G02-RISK | 001 | 002,004,010 |
| FR-G02-020 | cr_reversals, change_request_items, service_register_events(G12) | /items/{id}/reversal, /reversals/{id}/authorize | P02 SoD, G12, G01/M01 | 010,011,022,G01,G12 | 011,022 |
| FR-G02-021 | cr_objections, change_requests, cr_reversals | /objections, /objections/{id}/resolve | X.2, P02 | 017 | 006,020 |
| FR-G02-022 | retro_impact_events, change_request_items | RetroService, /retro-events/{id}/ack, /retry | X.3/X.1 | 010,020,G10/G11/G06 | 016 |
| FR-G02-023 | cr_step_up_events, change_requests | /step-up/challenge, /step-up/verify | platform step-up (§3.1) | platform auth | 001 |

### 14.2 Dependency on other modules / platform

| Module / service | Nature | Direction |
|---|---|---|
| G01/M01 Employee Master | Read field values + status; **effective-dated** staged commit | G02↔G01 |
| G12 Digital SR | **G01 posts** statutory + reversing change events on commit; G02 supplies context + tracks status | **G01→G12** (G02 reads) |
| G13/M11 Document Mgmt | Store/reference/scan evidence + exports | G02↔G13 |
| Authority portals (UIDAI/PAN/caste) | Verify identity/caste evidence (via X.3) | G02→external |
| G10/G11/G06 | Consume + **acknowledge** retro-impact events; G06 promotion freeze | G02↔G10/G11/G06 |
| G14 Dashboard | Consume analytics | G02→G14 |
| **P01** WorkflowEngine | Routing/stages/SLA/delegation | G02↔P01 |
| **P02** Authorization | Authz, scope, field mask, PII ceiling, SoD | G02→P02 |
| **P05** Audit | DB-trigger capture, query/export, OPEN-PLAT-03 | G02↔P05 |
| **P04** Tenant/Org Admin | integration_credentials for portals/G12/G13 | G02→P04 |
| **X.1/X.2/X.3** | Jobs / notifications / integrations | G02↔X |
| Platform (auth, step-up, KMS/vault) | Identity, step-up, tokenisation | G02↔platform |

### 14.3 Parallel-agent build plan (re-ordered — security first; platform-grounded)

| Workstream | FRs | Can parallelize after |
|---|---|---|
| A — Data & config foundation | 012, schema (E1–E17, E19) + tenancy, seeds, **W.1 flow config** | first |
| B — Authoring, diff & step-up | 001, 005, 023 (P02, platform step-up) | A |
| C — Routing, approval & status gate | 002, 004, 018 (**P01** flow) | A |
| D — Evidence, authority-portal & e-sign | 003, 015 (G13, X.3) | A |
| E — Data-subject rights & fraud | 017, 019, 021 (X.2/W.3) | B, C |
| F — Lifecycle & SLA | 006, 007, 008 (P01 sendBack/cancel, SLA runtime) | C |
| G — Commit, SR, retro & reversal | 010, 011, 022, 020 | C, **G01/M01 effective-dated commit + G12 + retro-ack gates VERIFIED (§14.5)** |
| H — Convenience/scale (P4) | 009, 013, 014 (W.2, P01 delegate, X.1) | G |
| I — History, reporting & audit-integrity | 016 (**P05/OPEN-PLAT-03**) | B–G |

### 14.4 Dependency Register (honest — Improvement 11 / R8; platform-grounded)

States: **AGREED** · **IMPLEMENTED** (producer built) · **VERIFIED** (validated end-to-end in staging). **No BRD-specification gaps remain (§14.6); build-time contract verification is tracked as gates.** Platform engines (P01/P02/P05/X) are already-built platform contracts (IMPLEMENTED) consumed by id.

| Contract surface | Producer | Consumer | State | Hard gate? |
|---|---|---|---|:--:|
| **P01 WorkflowEngine** (startInstance/advance/…/delegate) | Platform | G02 (002/004/006/007/013) | **IMPLEMENTED** (platform) → configure W.1 flow | Yes (C) |
| **P02 Authorization.check** (authz, scope, field mask, PII ceiling, SoD) | Platform/RBAC | G02 (all) | **IMPLEMENTED** (platform) | Yes (A/B) |
| **P05 dual-log + DB-trigger** + OPEN-PLAT-03 tamper-evidence | Platform | G02 (016, all) | **IMPLEMENTED**; OPEN-PLAT-03 **PROPOSED — confirm before build** | Yes (A) |
| X.1/X.2/X.3 (jobs/notify/integration) | Platform | G02 (007/017/011/022) | **IMPLEMENTED** (platform) | No |
| Editable-fields + current value/version/status | G01/M01 | G02 (001/010/018) | AGREED → verify in staging | Yes (G) |
| **Effective-dated staged commit (`effective_from` + `JOB-G01-EFFDATE` + version token + idempotency)** | G01/M01 | G02 (010) | AGREED → **VERIFY before G** | **Yes (G) — R4** |
| G12 SR append (`VAL-G12-SREVENT`) idempotent + reversing — **posted by G01 on commit** (`source_module=G01`) | G12 (ledger) / G01 (poster) | G02 (011/020 — tracks status) | AGREED → verify | Yes (G) |
| Document upload/scan/reference/export | G13/M11 | G02 (003/009/016) | AGREED → verify | Yes (D) |
| Authority-portal verify (UIDAI/PAN/caste) via X.3 | External | G02 (003/008) | AGREED → verify | Yes (D) |
| Retro-impact consumer **ack** endpoint | G10/G11/G06 | G02 (022) | AGREED → verify | Yes (G) |
| Promotion-eligibility freeze | G02→G06 | G06 (008) | AGREED → verify | No (P3) |
| Platform step-up / MFA (§3.1) | Platform | G02 (023) | **IMPLEMENTED** → verify | Yes (B) |
| Data vault / KMS tokenisation + crypto-shred | Platform | G02 (§4.4) | AGREED → verify | Yes (A) |
| RBAC role keys + new gov roles/capability flags | RBAC v1.7 | G02 (012, §3) | AGREED → register §4.3/§2.2 | No |
| E-sign provider (strong methods) via X.3 | External | G02 (015) | AGREED → verify | Yes (D) |
| Business-calendar service (SLA) | Platform | G02 (007) | AGREED (calendar-day fallback P1) | No |
| `VAL-*` / `MSG-G02-*` / `ERR-G02-*` / `JOB-G02-*` registration | Foundation | G02 | IMPLEMENTED (register in §2/§4/§5) | — |

### 14.5 Build-Gate Register (hard preconditions — R4/R8/R11)

| Gate | Condition to clear | Blocks | Owner |
|---|---|---|---|
| **G-G01-COMMIT** | G01/M01 effective-dated staged commit proven in staging (`effective_from` + `JOB-G01-EFFDATE` + version token + idempotency) | Workstream G | G01 + G02 |
| **G-FIELDKEY** | §5.8 field-key registry signed off against the live G01/M01 schema | A, B, G | G01 + G02 |
| **G-G12-SR** | G12 idempotent SR append + reversing event verified; **G01 posts** identity/personal-data events (`source_module=G01`), G02 tracks status | 011, 020 | G12 + G01 + G02 |
| **G-RETRO-ACK** | G10/G11/G06 ack endpoint verified | 022 | G10/G11/G06 + G02 |
| **G-AUTH-PORTAL** | UIDAI/PAN/caste verify via X.3 verified (or manual-attestation fallback agreed) | 003, 008 | Platform + G02 |
| **G-STEPUP/ESIGN** | Platform step-up (§3.1) + strong e-sign providers verified | 015, 023 | Platform + G02 |
| **G-AUDIT-OPENPLAT03** | **OPEN-PLAT-03** hash-chaining confirmed/built; P05 DB-trigger capture operational | A, 016 | Platform (Security/Arch) + G02 |

### 14.6 Final Reconciliation Table (specification completeness — 0 unresolved gaps; platform-alignment rows)

This table asserts **specification** completeness (every contract surface is defined and consumed); it does **not** assert that producers are built — tracked honestly in §14.4 (states) and §14.5 (gates). **Platform-alignment rows** confirm each invented v2 mechanism is re-grounded on a named platform engine.

| Contract surface | Producer | Consumer | Spec status |
|---|---|---|---|
| **Workflow / maker-checker → P01** | Platform | G02 (002/004/006/007/013) | Specified (§4.2, FR-002/004) — **re-grounded from invented `workflow_*`** |
| **Authz / SoD / PII ceiling / field mask → P02** | Platform/RBAC | G02 (all) | Specified (§3, §4.2) — **re-grounded from invented authz** |
| **Audit / tamper-evidence → P05 + OPEN-PLAT-03** | Platform | G02 (016) | Specified (§5.1 E18-removed, §9) — gate G-AUDIT-OPENPLAT03 |
| **Notifications → X.2 / W.3** | Platform | G02 (011/017/021) | Specified (§11) — **re-grounded** |
| **API conventions + error table → Foundation §1** | Platform | G02 (§8) | Specified (§8) — **re-grounded (422/409/412; cursor; X-Correlation-Id)** |
| **RBAC roles + gov additions → RBAC v1.7** | RBAC | G02 (§3) | Specified (§3.0) — **re-grounded from invented role list** |
| **Multi-tenancy (`tenant_id`/`entity_id`)** | Platform | G02 (all entities) | Specified (§5.2) — **added** |
| G01/M01 read + effective-dated staged commit | G01/M01 | G02 (001/010/018) | Specified (§8.6, §5.8) — gate G-G01-COMMIT |
| G12 statutory + reversing posting (`VAL-G12-SREVENT`) | G12 | G02 (011/020) | Specified (§8.6) — gate G-G12-SR |
| G13 document/scan/export | G13/M11 | G02 (003/009/016) | Specified (§8.6) |
| Authority-portal verification (X.3) | External | G02 (003/008) | Specified (§8.6) — gate G-AUTH-PORTAL |
| Retro-impact + ack (X.3/X.1) | G10/G11/G06 | G02 (022) | Specified (§8.6) — gate G-RETRO-ACK |
| Step-up (§3.1) + strong e-sign (X.3) | Platform/External | G02 (015/023) | Specified (§8.6) — gate G-STEPUP/ESIGN |
| Vault/KMS tokenisation + crypto-shred | Platform | G02 (§4.4) | Specified (§4.4) |
| Data-subject rights (notice/objection/grievance) | G02 | Employee/Grievance (017/021) | Specified (FR-017/021) |
| Fraud signalling | G02 | Fraud Reviewer (019) | Specified (FR-019) |
| Emergency reversal (dual-auth, P02 SoD) | G02 | HR/authority (020) | Specified (FR-020) |
| `VAL-*`/`MSG-G02-*`/`ERR-G02-*`/`JOB-G02-*` ids | G02 + Foundation | G02 | Specified (§4.3, §8.3, §11, §16.6) — register in Foundation indexes |

**Unresolved specification gaps: 0.** **Open build-time hard gates: 7 (tracked in §14.5)** — honest preconditions, not specification gaps. **Platform-alignment: 7 re-grounding rows confirm every invented v2 mechanism now runs on a named PrimeSoft engine (P01/P02/P05/X/W) + RBAC v1.7 + multi-tenancy.**

---

## 15. Glossary

| Term | Definition |
|---|---|
| Maker-Checker | SoD control where the initiator (maker) cannot approve (checker) their own change — **enforced by P01/P02**, not re-coded |
| SoD | Segregation of Duties — maker ≠ checker; no self/target approval; dual-auth for reversal (P02 deny-by-default + multi-role intersection) |
| **P01 WorkflowEngine** | The platform engine running all approval/maker-checker flows (`startInstance/advance/approve/reject/sendBack/delegate/cancel/query`; patterns SEQUENTIAL/PARALLEL_ALL_OF/PARALLEL_ANY_OF/CONDITIONAL/DYNAMIC_APPROVER; in-flight version pinning) |
| **P02 Authorization.check** | The platform authz enforcement (deny-by-default → role → intersection → entitlement → flag → PII ceiling → scope filter → field mask on serialization) |
| **P05** | The platform dual-log audit (`audit_log` + `security_audit_log`, DB-trigger, immutable, ≥7-yr); tamper-evidence tracks OPEN-PLAT-03 |
| **`E·AR` field** | An Approval-Required PII field (RBAC §7) that renders read-only with a platform **"Request change"** control routing to P01 — never a direct write (Foundation §3) |
| VERIFY node | A P01 stage that *checks evidence/documents* (does not by itself authorise) |
| APPROVE node | A P01 stage that *authorises* at an intermediate tier |
| SANCTION node | The senior P01 stage that *grants final authority* — "sanction" = **grant**, not penalty |
| RECOMMEND node | An advisory P01 stage (e.g., reporting manager) feeding a later APPROVE/SANCTION |
| Correction | Repair of an erroneous historical value, effective from the original date (tracked retro impact) |
| Update | Genuine forward-dated change to a field |
| Reversal / Break-glass | Fast, dual-authorised undo of a committed erroneous change, with reversing G12 SR/retro events |
| Effective date (`effective_from`) | Date from which a change takes effect; staged by `JOB-G01-EFFDATE`, not written live (§3.3) |
| Sensitivity tier | LOW/MEDIUM/HIGH/STATUTORY classification driving route, evidence, e-sign |
| Approval matrix | Configurable rule set (bound to a W.1 P01 flow) mapping sensitivity/scope/field/status to ordered P01 stages |
| Topology / pattern | P01 execution pattern of stages at a level (SEQUENTIAL / PARALLEL_ALL_OF / PARALLEL_ANY_OF / CONDITIONAL / DYNAMIC_APPROVER) |
| Delegation | Temporary transfer of an approval **action** via **P01 `delegate`** to a user who **independently holds the role** (P02 verified; never elevation) |
| E-signature | Cryptographically attributable approval signature; strong = PKI/DSC or Aadhaar e-Sign (OTP weak; password re-auth removed) |
| Digital SR (G12) | Statutory Digital Service Register — a net-new gov append-only ledger on the **P05** substrate |
| Provenance | Full who/what/when/authority/document trail of a change (sourced from P05) |
| Tamper-evident audit | P05 DB-trigger dual-log + OPEN-PLAT-03 hash-chaining (chain head → WORM); + hash-chained `esignatures` |
| Stale-value guard | Hash check ensuring the master value did not change between submit and commit |
| Saga / Outbox | Reliability pattern for atomic, eventually-consistent commit across services (needed because the G01/M01 effective-dated write is staged) |
| Retro impact | A correction's downstream recomputation in payroll/pension/seniority — tracked, acknowledged and reconciled (X.1/X.3) |
| Data subject | The employee whose record is being changed; a first-class party with notice and objection rights |
| Gazette | An official government notification; traditional documentary proof for statutory name/DOB changes |
| Cadre | A service classification/grade (owned by G05/G06); distinct from social/reservation `category`; NOT editable via G02 |
| Social category | Statutory reservation category (GEN/OBC/SC/ST/EWS) = G01/M01 `employees.category`; verified via authority portal |
| Dignity-aware gender path | Path distinguishing a gender-marker *data-error correction* from *gender-identity recognition* (NALSA / Transgender Persons Act 2019), privacy-protected, non-gazette |
| Mule account | A bank account reused across multiple employees, a fraud signal (`DUPLICATE_BANK_ACCOUNT`) |
| Capability flag | An RBAC §4.3 grantable extension to an existing role (e.g., Grievance Officer, Fraud Reviewer) — not a new role |
| `tenant_id` / `entity_id` | Multi-tenancy scope columns on every table; data-layer scoped; unscoped query rejected (Platform §0.1) |

## 16. Appendices

### 16.1 Appendix A — Default field sensitivity seed

See §5.5 (re-grounded security-hardened seed with `VAL-*` + `E·AR`) and §5.8 field-key registry. Configurable via FR-G02-012 (W.1/W.2).

### 16.2 Appendix B — Sample P01 approval routes by sensitivity & status

| Sensitivity / status | Route (P01 stages) |
|---|---|
| LOW (non-auth-bearing) | [APPROVE: HRBP] (or auto-apply) — `SEQUENTIAL` |
| LOW/MEDIUM (auth-bearing contact) | [APPROVE: HRBP] + notify OLD value (no auto-apply) |
| MEDIUM | [VERIFY+APPROVE: HRBP] |
| HIGH (financial, `E·AR`) | [VERIFY: HRBP] → [APPROVE: HR Admin] (+ strong e-sign PKI/DSC or Aadhaar) (+ `CONDITIONAL` fraud-review stage if high risk) |
| STATUTORY | [VERIFY: HRBP] → [SANCTION: HOD/APPOINTING_AUTHORITY] (+ strong e-sign) → G12 SR post → retro reconcile |
| STATUTORY identity (Aadhaar/PAN/category, `E·AR`) | HR-only initiation → authority-portal VERIFY (X.3) → SANCTION (+ strong e-sign) → G12 SR post (+ G06 freeze for category) |
| DECEASED (bank/nominee) | Family-pension controlled path: HR initiate → enhanced evidence → [SANCTION: APPOINTING_AUTHORITY] dual control |
| DOB within bar window | `ERR-G02-HARDBLOCK` → separate legal-process path only |

### 16.3 Appendix C — Canonical idempotency keys (+ `Idempotency-Key` header)

- Commit: `commit_idempotency_key = change_request_item_id`.
- SR posting: `source_ref = change_request_item_id + ':SR'`.
- Retro event: `idempotency_key = change_request_item_id + ':RETRO:' + target_module`.
- Reversal: `idempotency_key = change_request_item_id + ':REV:' + reversal_id`.
- All workflow-initiating POSTs also carry the platform **`Idempotency-Key`** header (24h replay → original result; duplicate start → 409 `ERR-DUP-INSTANCE`).

### 16.4 Appendix D — Assumptions register

| # | Assumption | Owner | Resolution / Gate |
|---|---|---|---|
| A1 | G01/M01 exposes field metadata + **effective-dated staged** commit (`effective_from`, `JOB-G01-EFFDATE`) | G01 team | §8.6; **Gate G-G01-COMMIT** (R4) |
| A2 | G12 exposes idempotent SR append + reversing event; **G01 posts** identity/personal-data SR events (`source_module=G01`); G02 tracks status | G12 + G01 teams | §8.6; Gate G-G12-SR |
| A3 | G13/M11 provides scan-status + references | G13 team | §8.6; Gate (D) |
| A4 | Strong e-sign provider (PKI/DSC, Aadhaar) + platform step-up (§3.1) available | Platform | FR-015/023; Gate G-STEPUP/ESIGN |
| A5 | Business-calendar service available (else calendar-day fallback P1) | Platform | FR-007 |
| A6 | Authority portals (UIDAI/PAN/caste) available via X.3 (else manual attestation) | Platform/External | FR-003/008; Gate G-AUTH-PORTAL |
| A7 | G10/G11/G06 expose retro **ack** endpoints | Downstream teams | FR-022; Gate G-RETRO-ACK |
| A8 | Platform data vault + KMS for Aadhaar tokenisation + crypto-shred | Platform | §4.4 |
| A9 | **OPEN-PLAT-03** hash-chaining is confirmed/built before statutory-grade tamper-evidence relied on | Platform Security/Arch | §9; Gate G-AUDIT-OPENPLAT03 |
| A10 | P01/P02/P05/X.1–X.3/W.1–W.3 are live platform contracts consumed by id | Platform | §4.2 (IMPLEMENTED) |

### 16.5 Appendix E — Open items

No **specification** gaps remain (§14.6). **7 build-time hard gates** (§14.5) are tracked — chiefly **G-G01-COMMIT** (effective-dated staged write, R4), **G-FIELDKEY** (R9), and **G-AUDIT-OPENPLAT03** (the platform's own `OPEN-PLAT-03` hash-chaining, which government statutory-grade tamper-evidence must track rather than invent). These must be VERIFIED in staging before Workstream G / integrity reliance.

### 16.6 Appendix F — Foundation id registration (audit aid)

| Id family | Examples authored here (register in Foundation §2/§4/§5) |
|---|---|
| `VAL-G02-*` (module-unique) | `VAL-G02-CLEARINTENT`, `VAL-G02-STALEHASH`, `VAL-G02-AUTHBEAR`, `VAL-G02-ESIGN-METHOD`, `VAL-G02-REGEXSAFE`, `VAL-G02-SOD`, `VAL-G02-DUALAUTH`, `VAL-G02-HARDBLOCK` |
| `VAL-*` (cited, not restated) | `VAL-PAN`, `VAL-AADHAAR`, `VAL-IFSC`, `VAL-DOB`, `VAL-EFFECTIVE`, `VAL-DATE`, `VAL-FILE`, `VAL-COMMENT`, `VAL-ENUM`, `VAL-EMAIL`, `VAL-MOBILE`, `VAL-CONSENT`, `VAL-MASTER-UNIQUE`, `VAL-FLOW-NOCYCLE`; G12's `VAL-G12-SREVENT` |
| `JOB-G02-*` | `JOB-G02-SLA`, `JOB-G02-NOTICE`, `JOB-G02-RISK`, `JOB-G02-AUDITVERIFY`; consumes `JOB-G01-EFFDATE` |
| `MSG-G02-*` | per §11 table |
| `ERR-G02-*` | `ERR-G02-STALE/STEPUP/STATUSGATE/HARDBLOCK/ESIGN/ESIGN-METHOD/AUTHPORTAL/RISKBLOCK/DUALAUTH/SOD` |
| Shared (reused) | `ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-PAST-DATED`, `ERR-REASON-REQ`, `MSG-SYS-JOBFAIL` |

### 16.7 Appendix G — Council improvement → FR/section index (retained)

| Improvement | Primary carrier (v3) |
|---|---|
| 1 Auth-bearing contact reclassification | §5.5 seed, FR-002, FR-017 |
| 2 Data-subject notice + objection window | FR-017, E15, X.2/W.3 |
| 3 Employment-status gating | FR-018, §5.6 r12, §10.6 |
| 4 national_id/pan HR-only + re-verify | §5.5 seed, FR-003 (X.3) |
| 5 E-sign method policy | FR-015, FR-012, E10 |
| 6 Requester step-up MFA | FR-023, E19 (platform §3.1) |
| 7 Fraud/anomaly signals | FR-019, E13 (P01 CONDITIONAL) |
| 8 Tamper-evident audit | **P05 + OPEN-PLAT-03** (was E18), §9, FR-016 |
| 9 Downstream retro loop | FR-022, E14 (X.1/X.3) |
| 10 Field-key reconciliation | §5.8, §5.5 |
| 11 Honest dependency register | §14.4, §14.5, §14.6 |
| 12 DOB hard-block | FR-008, §5.6 r14 |
| 13 Caste controls + G06 freeze | FR-008, FR-003, §8.6 |
| 14 Dignity-aware gender path | FR-008, §5.5 |
| 15 Emergency reversal | FR-020, E17 (P02 SoD) |
| 16 Data-subject grievance | FR-021, E16 |
| 17 Commit/SR sequencing fix | §5.6 r11, FR-010/011, §10.2 |
| 18 Regex hardening + field clearing | FR-012, E2 (`VAL-G02-*`) |
| 19 DPDPA/Aadhaar handling | §4.4, §9, §5.6 r15 |
| 20 First-consumer Change-Control seam | §4.5 ADR-G02-01 |
| 21 Glossary/semantics hardening | §15, §5.5 |
| 22 Re-phased rollout | §13.3, §14.3 |
| 23 Delegation privilege clarity + security report | FR-013 (P01 delegate + P02), §12 |


---

## Alignment with PrimeSoft Platform

This section maps every FR to the platform service(s) it runs on (Authoring Rule 6, `PLATFORM_FOUNDATION.md` §9). G02 authors **no** platform engine — it **extends the existing PrimeSoft M01 sensitive-field-change pattern** (the "Request change → approval" UI state on P01) and configures it for the public sector. The only **`GAP (gov-specific)`** surface G02 *depends on* (does not own or write) is the **G12** Digital Service Register — a net-new gov ledger on the P05 substrate to which **G01 (not G02) posts** identity/personal-data events on commit (`source_module=G01`); G02 supplies the change context and tracks the posting status.

| FR | Runs on / consumes | Platform contract | `GAP (gov-specific)`? |
|---|---|---|---|
| FR-G02-001 Authoring | **P01** `startInstance`, **P02** `Authorization.check`, **W.2** form, **X.2** confirm | Foundation §3 `E·AR` "Request change"; Platform §P01/§P02 | No — extends M01 sensitive-change |
| FR-G02-002 Routing | **P01** patterns (Appendix D) + **W.1** flow definition | Platform §P01, §W.1 | No |
| FR-G02-003 Evidence | **G13/M11** documents (`VAL-FILE`) + **X.3** authority portals + **P04** credentials | Platform §X.3/§P04 | Portal verify = external; G13 reused |
| FR-G02-004 Approval | **P01** `approve/reject/sendBack`, **P02** SoD, **X.2** | Platform §P01/§P02 | No |
| FR-G02-005 Diff/masking | **P02** field mask on serialization (PII ceiling) | Platform §P02; RBAC §3.9/§7 | No |
| FR-G02-006 Lifecycle | **P01** `sendBack`/`cancel` | Platform §P01 | No |
| FR-G02-007 SLA | **P01** SLA runtime + **X.1** `JOB-G02-SLA` + **X.2** | Platform §P01/§X.1/§X.2 | No |
| FR-G02-008 Effective-dating/hard-block | **VAL-EFFECTIVE** + **`JOB-G01-EFFDATE`** (§3.3); `VAL-G02-HARDBLOCK` | Foundation §1/§2; Platform §3.3 | DOB/caste/gender rules = gov statutory |
| FR-G02-009 Bulk | **P01** + **X.1** worker + **G13** | Platform §P01/§X.1 | No |
| FR-G02-010 Commit | **G01/M01** effective-dated staged commit + **P05** capture | Platform §3.3; §P05 | No — extends M01 master write |
| FR-G02-011 SR reflection/reconcile | **G01 posts** the SR event (`source_module=G01`) to the **G12** ledger (on **P05** substrate) on commit; G02 supplies context + tracks status | `MODULE_RECONCILIATION.md` §D | **No SR write by G02** — G01 is the SR source; G12 is the gov net-new ledger |
| FR-G02-012 Config | **W.1/W.2** builders; **P05** `security_audit_log` | Platform §W.1/§W.2 | No |
| FR-G02-013 Delegation | **P01** `delegate` + **P02** role-independence | Platform §P01/§P02 | No |
| FR-G02-014 Templates | **W.2** form definitions | Platform §W.2 | No |
| FR-G02-015 E-signature | **X.3** PKI/DSC + Aadhaar e-Sign; tamper-evidence OPEN-PLAT-03 | Platform §X.3; §Z | Strong e-sign methods = gov statutory |
| FR-G02-016 Audit/history | **P05** `Audit.query` dual-log + **OPEN-PLAT-03** | Platform §P05; §Z | No |
| FR-G02-017 Data-subject notice | **X.2/W.3** (out-of-band; EMAIL mandatory) | Platform §X.2/§W.3 | Out-of-band notice rule = gov/DPDPA |
| FR-G02-018 Status gate | **G01/M01** `employment_status` read + **P02** | Platform §P02 | Gov family-pension elevation |
| FR-G02-019 Fraud signals | **P01** `CONDITIONAL` stage + **X.1** `JOB-G02-RISK` | Platform §P01/§X.1 | Detection logic = gov-specific |
| FR-G02-020 Reversal | **P02** SoD dual-auth + **G01/M01** restore; **G01 posts** the reversing G12 SR event on commit (`source_module=G01`) | Platform §P02; §D | Break-glass policy = gov-specific |
| FR-G02-021 Grievance | **P01** (review) + **P02** + **X.2** | Platform §P01/§P02/§X.2 | DPDPA grievance = gov-specific |
| FR-G02-022 Retro reconcile | **X.3** dispatch + **X.1** retry/DLQ; G10/G11/G06 ack | Platform §X.1/§X.3 | Downstream loop = gov-specific |
| FR-G02-023 Step-up | Platform **MFA / step-up** (§3.1) | Platform §3.1; §P02 | No |

**RBAC alignment:** all roles map to RBAC v1.7 (§3.0); **new gov roles** (`Appointing Authority`, `SR Custodian`) and **capability flags** (`Grievance Officer`, `Fraud Reviewer`) are ADDITIONS registered in RBAC §2.2/§4.3, with SoD enforced by P01/P02. **Net-new gov engine authored:** none in G02 — it *commits to* G01 (whose owner posts the identity/personal-data SR event to G12, the only gov ledger; **G02 is not an SR source**) and *invokes* external authority portals; all approval/audit/notification/jobs/forms/authz run on the existing platform engines.

---

## Amendments (v2 → v3: platform re-grounding)

Each row is a concrete change applied to re-anchor v2 onto PrimeSoft, with the cited override from `MODULE_RECONCILIATION.md` §C / `PLATFORM_FOUNDATION.md`. **Requirements, FRs, entities and rigor are unchanged** — only the substrate.

| # | v2 (invented) | v3 (platform-grounded) | Cited override |
|---|---|---|---|
| 1 | Module code `M02-EPDM`; downstream `M01/M06/M10/M11/M12/M13/M14` | **`G02-EPDM`**; `G01/G06/G10/G11/G12/G13/G14` | `MODULE_RECONCILIATION.md` §B (G-code scheme) |
| 2 | Invented `workflow_instances` / `workflow_tasks` "shared engine" | **P01 WorkflowEngine** (`workflows`/`workflow_instances`/`workflow_actions`; `startInstance/advance/approve/reject/sendBack/delegate/cancel`; 5 Appendix-D patterns; in-flight version pinning; idempotent advance). Change-request entities are the **subject/context** of P01 instances, not a parallel engine | §C row "workflow_instances/workflow_tasks"; Platform §P01 |
| 3 | Bespoke maker-checker + SoD logic | **P01 flows + P02 SoD** (deny-by-default, multi-role intersection, no self-approval) — not re-coded | §C row "maker-checker"; Platform §P01/§P02; RBAC §5 |
| 4 | Invented authz / "view_sensitive_value" / masking | **P02 `Authorization.check`** + **PII Protection Ceiling** + **field mask on serialization**; `E·AR` fields use the platform **"Request change"** state | Platform §P02; RBAC §3.9/§6/§7; Foundation §3 |
| 5 | Invented `audit_log` + `cr_audit_chain` (E18, parallel hash-chain) | **P05 dual-log** (`audit_log` + `security_audit_log`, DB-trigger, immutable, ≥7-yr); tamper-evidence tracks **OPEN-PLAT-03**. **E18 removed** (18 entities) | §C rows "audit_log" / single audit; Platform §P05/§Z |
| 6 | `service_register_events` as a "shared platform entity" | **G12** net-new gov SR **ledger on the P05 substrate**; **G01 (master/identity owner) posts** identity/personal-data events on commit (`source_module=G01`, `VAL-G12-SREVENT`); G02 supplies context + tracks status and does not own/write the schema *(corrected in v3.1 — see cross-module remediation table; G02 is not an SR source)* | §C row "service_register_events"; §D |
| 7 | Error codes `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `INTERNAL_ERROR(500)`, `UPSTREAM_UNAVAILABLE(503)`, `423/502` | **Platform 8-code table:** `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `CONFLICT(409)` incl. `ERR-DUP-INSTANCE`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)`; 503/423/502 dropped (X.3 mapping / async statuses) | §C row "error codes"; Foundation §1 |
| 8 | Envelope `{error:{code,message,field}, requestId}` | **`{error:{code,message,field,details}}`** + **`X-Correlation-Id` header** (no body `requestId`) | §C row "error envelope"; BRD §6.2; Foundation §1 |
| 9 | Pagination "`?page=&limit=` or cursor, max 100; `page/total`" | **Cursor only** (`?limit=` default 25 / max 100, `next_cursor`); offset paging removed | §C row "pagination"; Foundation §1 |
| 10 | Multi-tenancy omitted | **`tenant_id`/`entity_id` (NN)** added to **every** entity; data-layer scoping; unscoped query rejected | §C row "multi-tenancy"; Platform §0.1 |
| 11 | Invented role list (Appointing Authority, SR Custodian, Auditor, System Admin as bespoke principals; Grievance/Fraud as ad-hoc capabilities) | **RBAC v1.7** mapping (§3.0): new roles `Appointing Authority`/`SR Custodian` + capability flags `Grievance Officer`/`Fraud Reviewer` (RBAC §4.3); Auditor → Org-Admin read + entitlement; System Admin → Org/Platform Admin | §C row "role list"; `PLATFORM_FOUNDATION.md` §6.6 |
| 12 | Step-up via bespoke `cr_step_up_events` only | **Invokes platform MFA / step-up (§3.1)**; `cr_step_up_events` records the platform challenge result | Platform §3.1; Vision §2.2 |
| 13 | Hand-rolled SLA scheduler (`SlaScheduler.tick`) | **P01 per-stage SLA runtime** (breach → escalation event → X.2 + P05) + **X.1** `JOB-G02-SLA` reminder cadence | Platform §P01/§X.1 |
| 14 | Bespoke notification table + channels | **X.2** engine (IN_APP+EMAIL parallel; EMAIL mandatory/non-suppressible for approvals & statutory; backoff ×5 + DLQ) + **W.3** config; copy by `MSG-G02-*` | §C; Platform §X.2; BRD §9.1/§9.9 |
| 15 | Inline/bespoke field validation + invented regex catalogue | **Cite `VAL-*`** (PAN/Aadhaar/IFSC/DOB/EFFECTIVE/EMAIL/MOBILE/FILE/COMMENT/ENUM/CONSENT/MASTER-UNIQUE/FLOW-NOCYCLE); author only **`VAL-G02-*`** module-unique; register in Foundation §2 | Foundation §2; §7 of `PLATFORM_FOUNDATION.md` |
| 16 | `M01 PATCH /employees/{id}:commit` live effective-dated write | **G01/M01 effective-dated *staged* commit** (`effective_from`, applied by **`JOB-G01-EFFDATE`**, not live); outbox/saga adjusted accordingly (§10.4) | Platform §3.3; Foundation §1 (effective-dating) |
| 17 | NFR `99.9% uptime`, `RPO ≤ 15 min` | **Platform NFR baseline:** `99.5%/month`, `RPO < 1 h`, `RTO < 4 h`, p95 < 500 ms, WCAG 2.1 AA | §C row "NFR"; Vision §2.9; BRD §7 |
| 18 | Migration undefined / ad-hoc | **P06** ETL+V (3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability) | §C row "migration"; Platform §P06 |
| 19 | Jobs implied/unregistered | **`JOB-G02-*`** registered against the **X.1** runner + Foundation §4 index; reuses `JOB-G01-EFFDATE` | Platform §X.1; Foundation §4 |
| 20 | Forms/flows implied as code | **W.1** process-flow + **W.2** form definitions (Org-Admin builders `cfg-approval-builder`/`cfg-form-builder`); configured, not coded | Platform §W.1/§W.2 |
| 21 | ADR-M02-01 "shared Change-Control engine to extract later" | **ADR-G02-01:** G02 is the **first government consumer** of the existing platform sensitive-change pattern (P01 flow + catalog); G05/G06/G09 future consumers — no new engine | `PLATFORM_FOUNDATION.md` §6.6; Platform §P01 caller list |
| 22 | "0 gaps / all Resolved" + 19 entities | **0 specification gaps + 7 honest build-time gates** retained; **18 module entities** (E18 audit-chain removed → P05); 7 platform-alignment reconciliation rows added (§14.6) | §C; Platform §P05 |

**Net re-grounding result:** 23 FRs and all v2 rigor preserved; **0 invented platform mechanisms remain** — workflow→P01, authz/SoD/PII→P02, audit→P05+OPEN-PLAT-03, notify→X.2/W.3, jobs→X.1, integrations→X.3, forms/flows→W.1/W.2, roles→RBAC v1.7, API/errors→Foundation §1, validation→`VAL-*`, SR→G12, master→G01/M01 effective-dated; multi-tenancy added to every table; module entities 19→18.

---

## Amendments (v3 → v3.1: cross-module remediation)

Surgical corrections from the R1–R5 integration reviews, applied per `docs/review/REMEDIATION.md` (D2 SR writer matrix, D5 shared-entity naming) to resolve the R3 finding that **identity-change SR events were claimed by both G01 and G02** (R3 F2) and the `JOB-G01-EFFDATE` reference (R3 F11). **No FR is removed; all rigor, ACs, business rules, entities and traceability are preserved** — only the SR ownership model is corrected so a single module (G01) owns identity/personal-data SR postings.

| # | v3.0 (as written) | v3.1 (corrected) | Basis |
|---|---|---|---|
| C1 | G02 directly posts STATUTORY change events to the **G12** SR ledger (FR-G02-011 "posts an idempotent event … via X.3"; §1.1, §2.1) | **G02 is NOT a Digital-SR source.** On COMMIT of an approved sensitive change, **G01 (the employee-master/identity owner) posts** the identity/personal-data SR event to G12 (`source_module=G01`). G02's responsibility ends at committing the change to the G01 master via the effective-dated staged write; it supplies the SR context to G01 and **tracks/reconciles** the resulting posting status. | REMEDIATION D2; R3 F2 |
| C2 | Boundary table (§2.3) "Statutory SR event posting … ✅ (writes event)"; §4.2/§9/§14.2/ownership tables show `G02→G12` SR append | Reworded to **`G01→G12`** (G02 reads/tracks status); G02 **never carries `source_module=G02` SR payloads** and is removed as an SR writer in every boundary/integration/ownership table. | REMEDIATION D2; R3 F2 |
| C3 | FR-G02-020 break-glass "posts a reversing G12 SR event" | Reversal commits the reversing change to G01, on which **G01 posts the reversing SR event** (`source_module=G01`); G02 tracks status (FR-011). | REMEDIATION D2; R3 F2 |
| C4 | FR-G02-011 titled "Statutory Change Posting to Digital Service Register (G12)" with G02 as poster | Re-titled **"Statutory Change Reflection in the Digital Service Register (G01→G12) & Posting-Status Reconciliation"**; description/ACs/BRs/LLD reframed to G01-posts / G02-tracks; internal `SrPostingService` → `SrReflectionTracker`. | REMEDIATION D2; R3 F2 |
| C5 | Analytics (§12) "Aggregates feed G14" without SR-source scoping | Clarified: G02 feeds G14 **operational CR/workflow analytics only**; **SR-event analytics reach G14 via G12 (fed by G01→G12), not from G02**. | REMEDIATION step 3; R3 F9 |
| C6 | Effective-dated staged commit job cited as **`JOB-G01-EFFDATE`** (modelled on `JOB-M01-EFFDATE`) | **Retained/confirmed** — G02 cites the G01-owned/registered **`JOB-G01-EFFDATE`** for the effective-dated staged commit; no `JOB-M01-EFFDATE`/unregistered variant is introduced as the active job. | REMEDIATION D5; R3 F11 |

---

*End of G02-EPDM BRD v3.0 (platform-grounded). Architecture and rigor preserved from v2; re-anchored onto the existing PrimeSoft platform (P01–P06 / X.1–X.3 / W.1–W.3, RBAC v1.7, P05 audit, multi-tenancy, Foundation API/VAL/MSG/ERR/JOB catalogues). 23 FRs, 18 module entities, 0 specification gaps, 7 tracked build-time hard gates, 22 v2→v3 re-grounding amendments. EXTEND of PrimeSoft M01 sensitive-field-change.*
