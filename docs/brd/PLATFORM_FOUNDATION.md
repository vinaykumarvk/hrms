# PrimeSoft Platform Foundation — Build Contract for all Government-HRMS Module BRDs

**Status:** Authoritative grounding artefact. Supersedes the invented conventions in `SHARED_FOUNDATION.md`.
**Audience:** Every government-HRMS module BRD author (G01..G14 / GOV-Mxx) and the implementing engineering team.
**Grounded in:** Master BRD v2.1 · Product Vision v2.6 · Platform Specification v1.6 · RBAC Design Document v1.7 · Foundation Functional Specification v1.6.

> Reading rule. Every claim in this document is traced to a source section using the form `(Platform §P02)`, `(Foundation §1)`, `(RBAC §3.6)`, `(BRD §4.14)`, `(Vision §2.x)`. Where the PrimeSoft platform genuinely does not cover a government requirement, it is marked **`GAP (gov-specific)`** — the government module BRD authors that part from scratch, but still runs it on the platform engines named here.

---

## 1. Purpose & Precedence

PrimeSoft HRMS is an existing, commercial-grade, multi-tenant HRMS platform (Vision §1.1). The government-HRMS programme is **not a greenfield build** — it is a public-sector configuration and extension of PrimeSoft. Government module BRDs therefore **consume** the platform's contracts by id and **never re-author** them.

### 1.1 Authority order (single source of truth)

The platform already runs a strict non-repetition contract (Foundation §0; Platform §0). Government BRDs inherit it:

| Concern | Authoritative owner | Government BRDs may… |
|---|---|---|
| Requirements, data model, RBAC matrix, NFR thresholds, notification triggers, state machines | **Master BRD v2.1** (BRD §3, §4, §7, §9) | reference by FR/entity id; add gov-unique FRs |
| Access-control MODEL — roles, scoping, field access, PII tiers, capability flags, entitlements | **RBAC Design v1.7** | add new gov roles + capability flags as ADDITIONS (§6) |
| API conventions, VAL-* validation library, UI-state standard, JOB-* index, MSG-*/ERR-* catalogue, menu entitlement | **Foundation FS v1.6** | cite ids; author only module-unique `VAL-<gov>` / `JOB-<gov>` / `MSG-<gov>` |
| Engine internals (P01–P06), X.1–X.3 infrastructure, W.1–W.3 configured-content models | **Platform Spec v1.6** | reference services; configure flows/forms; never re-implement engines |

When a government BRD and a platform artefact conflict on intent, the platform artefact governs and the conflict is logged as a convention override (see `MODULE_RECONCILIATION.md` §C).

### 1.2 What a government BRD authors from scratch

Only the **net-new statutory engines** that PrimeSoft genuinely lacks: the Digital Service Register (SR) ledger, the pension/terminal-benefits calculation engine, the disciplinary due-process machine, the qualifying-service ledger, transfer/relieving/joining orders, and the seniority/promotion case. Even these **run on P01 (workflow), P05 (audit), and P06 (migration)** — they author business logic, not platform plumbing.

---

## 2. Multi-Tenancy & Data Scoping

PrimeSoft is multi-tenant from Day 1 (Vision §2.1). The government deployment is one tenant (single department/government) — typically the **Standalone** or **Group Company** model where each department/directorate is an `entity` (Vision §1.4). The invented `SHARED_FOUNDATION` omitted tenancy entirely; every government table **must** adopt it.

- **Every business table carries `tenant_id`** (non-nullable) and, where entity-scoped, **`entity_id`** (Platform §0.1; Vision §2.1; BRD §4.1).
- **Scoping is enforced at the data/persistence layer**, not the application layer — an application bug cannot leak across tenants (Platform §0.1; Vision §2.3). A query without a resolvable tenant scope is **rejected, not defaulted to "all"** (Platform §0.1).
- **Cross-entity reach** exists only for Organisation Admin, applied as a widened scope filter, never a bypass (Platform §0.1; RBAC §2.1; BRD §3.2). For government this is the directorate/secretariat consolidated view.
- **Cross-tenant reach** exists only for Platform Super Admin (Platform §0.1; RBAC §2.1).
- Row-level security operates across five scoping dimensions (reporting chain, department/`org_unit`, UAG, contribution level, entity) — see §6 and RBAC §3.1.

---

## 3. Authentication, Configuration Cascade & Effective-Dating

### 3.1 Authentication & session (Platform §0.2; Vision §2.2; BRD §6.1)
- Bearer-token (JWT) session carries the user's **resolved roles and tenant/entity scope** (Platform §0.2). The session never carries raw permissions — they are resolved **per request** by P02.
- Mechanisms: Google SSO (OAuth 2.0), username/password (one-way hashed), **MFA (TOTP / SMS OTP) enforced by default for HR Admin and Org Admin** (Vision §2.2). Government BRDs that add high-privilege statutory roles (e.g. Disciplinary Authority, Pension Officer) should require MFA equivalently.
- Short-lived access tokens + server-side refresh with blacklist; logout invalidates both (Vision §2.2). Account lockout and IP restriction are Org-Admin configurable (Vision §2.2).

### 3.2 Configuration cascade (Platform §0.3, FR-P04; RBAC §13; Vision §3.3)
Config entities (workflows, approval/skip/SLA settings, forms, policies) are **versioned** and validated on save. Cascade order:

`platform default → tenant → entity → employee` (Platform §0.3; BRD §5.1.4).

A higher-level change **does not silently overwrite** a lower-level override (Platform §0.3). Activation is immediate for new instances; **in-flight instances continue on the version they started with** (Platform §0.3, P01, W.1).

### 3.3 Effective-dating (Foundation §1; VAL-EFFECTIVE; JOB-M01-EFFDATE)
Endpoints that mutate effective-dated fields accept `effective_from`; the change is **staged and applied by the effective-date job, not written live** (Foundation §1, §4). Rule: `effective_from` not before the record's current effective date; future-dating allowed per field (`VAL-EFFECTIVE`, Foundation §2). Government modules with statutory effective dates (transfer relieving/joining dates, promotion w.e.f. dates, pension commencement) **reuse this mechanism** and register a `JOB-<gov>-EFFDATE`-style job in the Foundation index.

---

## 4. API Conventions

Government BRDs **adopt the platform API conventions verbatim** (Foundation §1; BRD §6.2/§6.3). The invented `SHARED_FOUNDATION` §5 conventions are overridden (see `MODULE_RECONCILIATION.md` §C).

| Convention | Rule (Foundation §1 / BRD §6) |
|---|---|
| Versioning | All endpoints under **`/api/v1`**. Breaking changes ship under a new major prefix; additive fields are non-breaking. |
| Idempotency | All unsafe POSTs that create a transaction accept an **`Idempotency-Key`** header; a repeat within **24h** returns the original result, not a duplicate. Required for workflow-initiating POSTs. |
| Pagination | **Cursor pagination only**: `?limit=` (default **25**, max **100**) + `cursor=`; response carries **`next_cursor`**. Offset paging is not used. |
| Sorting / filtering | `?sort=field:asc|desc`, field filters per endpoint. |
| Correlation id | Every request carries / is assigned **`X-Correlation-Id`**, echoed in the response and written to every audit and log line for the request (Foundation §1; ties to audit). |
| Auth context | Bearer token carrying the session's roles/entity scope; endpoints never re-implement permission logic — they call **`Authorization.check`** (P02). |
| Effective-dating | Mutations to effective-dated fields accept `effective_from`; staged, not live (§3.3). |

### 4.1 Canonical error envelope

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "field": "...", "details": { } } }
```

2xx returns the resource payload; 4xx/5xx return the envelope above (BRD §6.2; Foundation §1). Note: the correlation id is carried in the **`X-Correlation-Id` response header**, not a body `requestId` field.

### 4.2 Standard error code table (Foundation §1)

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | **422** | input failed a VAL-* rule |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks existence of out-of-scope records) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state conflict |
| `PRECONDITION_FAILED` | 412 | a required precondition is not met |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error |

### 4.3 Shared ERR-* messages (Foundation §5 — reproduced)

| Id | Where shown | Severity | Message text | Recovery |
|---|---|---|---|---|
| `ERR-FORBIDDEN` | 403 / no-permission state | error | You don't have permission to perform this action. | Contact your admin if you believe this is wrong. |
| `ERR-LOADFAIL` | error state on any list/detail | error | We couldn't load this right now. | Retry; if it persists, the correlation id is shown for support. |
| `ERR-PRECOND` | 412 precondition | error | This can't be done because a required condition isn't met: {reason}. | Resolve {reason} and try again. |
| `ERR-DUP-INSTANCE` | 409 duplicate workflow start | warning | A request for this already exists and is in progress. | Open the existing request instead of creating a new one. |
| `ERR-PAST-DATED` | 422 disallowed back-date | warning | The selected date is outside the allowed window. | Choose a date within the permitted range. |
| `ERR-REASON-REQ` | 422 reason mandatory | warning | A reason is required to continue. | Enter a reason. |
| `ERR-REVOKE-FORBIDDEN` | 403 on revoke | error | This item can't be revoked. | Per policy; contact your approver/admin. |
| `MSG-SYS-JOBFAIL` | ops alert (JOB-FAIL) | error | Scheduled job {job_id} failed for tenant {tenant} at {time}. | Auto-retried {n}×; manual re-run from the jobs console. |

---

## 5. Platform Services to Consume (P01–P06, X.1–X.3, W.1–W.3)

Each contract below is **already built**. Government BRDs reference the service and configure it; they do not re-author it. Every internal call inherits the service-contract convention: auth context + idempotency key + correlation id + standard error envelope (Platform §0.4).

### P01 — Workflow Engine (Platform §P01; BRD §5.1.1, §4.14.1–.3; Appendix D)
**One engine drives all approval and notification processes across modules.** Government due-process, transfer-order, promotion, pension-sanction and maker-checker flows run on it.
- **Operations:** `startInstance · advance · approve · reject · sendBack · delegate · cancel · query` — each **idempotent** (a double-clicked/retried approve produces one `workflow_actions` row, not two) and each emits one action row + audit (Platform §P01).
- **Patterns (Appendix D):** `SEQUENTIAL` · `PARALLEL_ALL_OF` (joins only when every branch completes) · `PARALLEL_ANY_OF` (completes on first approval, cancels losing branches) · `CONDITIONAL` (predicate evaluated at stage entry) · `DYNAMIC_APPROVER` (approver set resolved at runtime).
- **Approver resolution (4 mechanisms):** named role · reporting-chain position · named individual · cost-centre head (Platform §P01). "Manager" resolves to L1 with BRD fallback.
- **In-flight version pinning:** each `workflow_instance` pins the definition version it began on; deprecating/replacing a definition affects only new instances (Platform §P01, §0.3). Deprecation, not deletion.
- **SLA & escalation runtime:** per-stage SLA timers; on breach emit escalation event → notification (X.2) + audit, applying the configured breach output (Platform §P01).
- **Service:** `WorkflowEngine.startInstance({ workflow_code, subject_ref, context, initiator })` → `{ instance_id, first_stage, assignees[] }`; errors 400/403/409 (`ERR-DUP-INSTANCE`)/422 (Platform §P01, §Y).

### P02 — RBAC & Authorization.check (Platform §P02; RBAC; BRD §5.1.2)
**Enforcement is model-driven** — roles/matrix/scoping/field-access/flags are owned by RBAC v1.7; P02 only enforces. Permission-check resolution order (Platform §P02):

`deny-by-default → role grant → multi-role INTERSECTION (more restrictive wins) → individual entitlement (time-bound) → capability flag → PII Protection Ceiling (overrides everything upward) → data scope filter → field mask on serialization`

- **Field-level enforcement (FR-P02-002):** masking is applied **on serialization**, so an over-broad query still cannot leak a masked field (Platform §P02).
- **Service:** `Authorization.check({ subject(roles,scope), action, resource_ref, fields[] })` → `{ allowed, scope_filter, field_mask[] }`; 403 with audit, **never reveals existence of out-of-scope records** (Platform §P02).

### P03 — Chat Agent (Platform §P03; RBAC §10; BRD §5.1.3)
- **Grounded** answers only from (a) org-uploaded HR policy/statutory documents and (b) the user's own permissible data; otherwise the explicit "I don't have information…" response (Platform §P03).
- **PII stripped server-side** before any model call; governed by the same PII ceilings as P02; **informational-only** — never triggers workflows (Platform §P03).
- **Logging metadata-only** — `ai_chat_queries` stores metadata; query/response content is not logged (Platform §P03). Government statutory documents are grounded here for policy Q&A.

### P04 — Tenant & Org Admin (Platform §P04; BRD §5.1.4, §4.14.6)
- **Provisioning** within one business day: creates `tenants` row, cascades segment+geography defaults, creates initial Org Admin with forced password change, audit-logs all choices (Platform §P04).
- **Device/IP registration (FR-P04-002):** biometric devices and IP-based attendance restrictions are registered here before use by attendance (Platform §P04) — relevant to gov attendance.
- **`integration_credentials`** stored encrypted; rotation and per-integration scoping owned here, used by X.3 (Platform §P04). Government portal integrations (treasury, pension, SR exports) register credentials here.

### P05 — Audit & Compliance Log (Platform §P05; Vision §2.8; BRD §4.14.4/.5, Appendix C)
- **Dual logs:** `audit_log` (data mutations) + `security_audit_log` (auth/permission/admin events) (Platform §0.5, §P05).
- **DB-trigger capture:** every INSERT/UPDATE/soft-DELETE on any business table fires a **database trigger** writing one immutable row — not application code, so no API bypass or bug can suppress it (Platform §P05; Vision §2.8). 100% mutation capture, zero gaps.
- **Immutable:** `audit_log` grants no UPDATE/DELETE; the sole permitted mutation is a **DPDPA right-to-erasure redaction marker** on `old_value` (Platform §P05; Vision §2.7). PII stored masked in audit rows. Reading an audit log is itself audited.
- **Retention ≥ 7 years**, archivable to cold storage after 2 years but queryable within 24h, exportable for regulators (Platform §P05).
- **Tamper-evidence:** append-only today; periodic **hash-chaining is PROPOSED — OPEN-PLAT-03** (chain head exported to WORM storage) — confirm before build (Platform §P05, §Z). Government statutory-grade tamper-evidence requirements should track OPEN-PLAT-03 rather than invent a parallel mechanism.

### P06 — Migration Toolkit, ETL+V (Platform §P06; BRD §5.1.6, Appendix E, §4.14.9)
- **Extract → Validate → Transform → Load → Verify**, scripted idempotently (Platform §P06). Every migrated table carries a permanent **source-id** traceability + dedup column (`darwinbox_source_id` in the commercial product; **`GAP (gov-specific)`** — the government source system is not Darwinbox, so a `<gov>_source_id` traceability column follows the same pattern against the actual legacy register).
- **Three mandatory staging dry runs** gate production cutover; **waves**; failed records logged with source row + violated rule; `migration_runs` ledger (Platform §P06). Government legacy service-register and pension data migrate through this framework.

### X.1 — Background Jobs runner (Platform §X.1; Foundation §4)
Platform owns the scheduler/runner; each job's cadence/logic lives in the module FS; the **index** lives in Foundation §4. Runner guarantees: idempotent (per-period run key), retry exponential backoff ×3, terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL`, per-tenant isolation, period lock for balance/period-closing jobs, run audit row (Platform §X.1; Foundation §4). Government jobs register `{ job_id, schedule, tenant_scope }` against the runner.

### X.2 — Notification Infrastructure (Platform §X.2; BRD §9)
- Channels **`IN_APP` + `EMAIL` fire in parallel** for approvals (BRD §9.1).
- **EMAIL for approval-workflow and statutory notifications is mandatory — not user-suppressible** (Platform §X.2, BRD §9.9). Government statutory notices (transfer order, charge memo, pension sanction) bind this rule.
- Retry exponential backoff up to **5 attempts + dead-letter queue**; digest mode for non-urgent IN_APP; every dispatch audit-logged (Platform §X.2). Templates referenced by `MSG-*` id (Foundation §5), never duplicated.

### X.3 — Integration Framework (Platform §X.3; Appendix F)
Authors the call/credential/retry pattern, circuit-breaking, idempotency of outbound calls, payload versioning, per-integration error mapping; credentials from `integration_credentials` (P04). Government portal/treasury integrations run on X.3.

### W.1 / W.2 / W.3 — Configured content (Platform §W)
- **W.1 Process Flow Definitions** — the flow model (stages, action types Data-Collection-Form / Notification / Document-Generation, assignee, SLA, skip, send-back, pattern) executed by P01. Government workflows are **configured flow definitions**, not coded (Platform §W.1).
- **W.2 Form Definitions** — fields/types, validation (reference `VAL-*`), conditional show/required-if, entity data-binding, per-role visibility (RBAC §3.9), i18n, versioning (Platform §W.2). Government forms (APAR, charge memo, pension forms, exit/joining reports) are W.2 forms.
- **W.3 Notification Configuration** — per-event recipient resolution, channel selection, reminder vs escalation, suppression/dedup, per-tenant overrides; templates by `MSG-*` id (Platform §W.3).

---

## 6. RBAC Model to Reuse

The access-control MODEL is owned by **RBAC Design v1.7**; government roles are expressed as **ADDITIONS** (new roles + capability flags), never a parallel scheme. The invented `SHARED_FOUNDATION` §4 role list is overridden (see `MODULE_RECONCILIATION.md` §C).

### 6.1 Existing role taxonomy (RBAC §2)
- **Platform roles:** Platform Super Admin (`platform_super_admin`, all tenants), Organisation Admin (`org_admin`, single tenant — cross-entity).
- **Entity-scoped operational roles:** HR Administrator (`hr_admin`, superset operational role per BRD §3.1.1), Finance Admin, HRBP, Office Admin, CEO; module admins — Onboarding Admin, Offboarding Admin, Leave Admin, Attendance Admin, Performance Admin, Recruitment Admin/Recruiter, Document Admin, Analytics Admin, IT Admin / IT Asset Manager / Service Desk Admin / Service Desk Agent, Payroll Admin, Compliance Admin, Compensation Admin (RBAC §2.2).
- **Manager hierarchy:** Manager L1–L5, HOD, UAG Head, Skip-level Manager, Dotted Line Manager (RBAC §2.3).
- **Individual access:** Employee, Candidate/Pre-joining, Contractor/Consultant (TBD) (RBAC §2.4).

### 6.2 Four-layer model & scoping dimensions
- **Four layers** applied per session: Module-level (inactive modules fully invisible) · Field & Section level · Data-level / row-level security · Action-level (View · Edit · Approve/Reject · Download · Admin) (RBAC §1, §5).
- **Five scoping dimensions** (RBAC §3.1, §3.6): reporting chain · department (`org_unit`) · User Assignment Group (UAG) · contribution level · entity — combinable per role or per individual entitlement.

### 6.3 PII tiers & field masking (RBAC §3.9, §6, §7; Vision §2.5; BRD Appendix B)
- **PII Protection Ceiling overrides everything upward** — no Org Admin / Module Admin / any role lifts it; the only platform-level exceptions are the fixed Office-Admin national-ID/DOB grants (RBAC §1, §6; Platform §P02).
- Field-access legend `V / M / H / E / AR` (RBAC §7). Government identity and pension/financial fields inherit Tier-1/Tier-2 masking. `E·AR` (Approval-Required) fields route through P01, never a direct write (RBAC §7; Foundation §3).

### 6.4 Capability flags & individual entitlements
- **Capability flags** are grantable extensions to existing roles (NOT roles), Org-Admin-granted, audit-logged to P05 (RBAC §4.3). Phase-1 flags: BGV review, Letter Admin, Asset Custodian, Department Head — Asset Audit Certify, plus two HOD configurable grants.
- **Individual entitlements** are time-bound, mandatory-expiry, auto-revoked, Org-Admin-approved, PII-ceiling-bound, audit-logged (RBAC §3.2; BRD §3.6).
- New flags must be **registered in RBAC §4.3** via the working-group process (RBAC §14).

### 6.5 Workspace model (Foundation Manager-review; Platform §P02/§P03)
The platform exposes a **Workspace switcher** derived from RBAC role holdings + a derived `has-reportees` flag: **Me** (always) · **My Team** (if reportees/HOD) · **Admin** (if admin roles; exclusive). Each task routes to exactly one workspace; switches are audit-logged.

### 6.6 Government roles as ADDITIONS
Government statutory actors map to the existing taxonomy + new entries:

| Government actor | Express as | Notes |
|---|---|---|
| SR Custodian / Registrar | **new entity-scoped role** + capability flag on the SR ledger (M12) | mirrors Document Admin pattern; runs on P05 substrate |
| Disciplinary Authority | **new role** (sanctioning authority) | approver in P01 due-process flow; SoD enforced (cannot self-approve, RBAC §5) |
| Inquiry Officer | **new role / capability flag** | scoped read of case file; case-scoped data access (RBAC §3.2 entitlement pattern) |
| Appointing Authority | **new role** | sanctions transfers/promotions; P01 approver |
| Pension / Payroll Officer | **new entity-scoped module-admin role** | analogous to Payroll Admin (RBAC §2.2) — financial operations on pension/payroll |
| Auditor (read-only) | **map to existing** Org-Admin audit access + read-only entitlement (RBAC §3.2, P05 query access) | do not invent a parallel "Auditor" role with write capability |
| System Administrator | **map to** Org Admin / Platform Super Admin (RBAC §2.1) | configuration, master data, RBAC — no transactional self-approval |

All new roles/flags are registered in RBAC §4.3/§2.2 with grant authority and audit logging; **segregation of duties (maker ≠ checker, no self-approval) is enforced by P01/P02**, not re-implemented.

---

## 7. Validation Library

The 36-entry `VAL-*` catalogue is the single definition (Foundation §2). Government modules **cite the id and never restate the rule**; they author only module-unique `VAL-<gov>` rules.

Catalogue (Foundation §2): `VAL-REQUIRED · VAL-LEN · VAL-TEXT · VAL-NAME · VAL-INT · VAL-NO · VAL-PCT/VAL-PERCENT · VAL-WEIGHTAGE/VAL-WSUM · VAL-SUBWSUM · VAL-DISTRIB · VAL-ACHV · VAL-DATE · VAL-DOB · VAL-EFFECTIVE · VAL-EMAIL · VAL-MOBILE · VAL-PINCODE · VAL-PAN · VAL-AADHAAR · VAL-IFSC · VAL-CURRENCY · VAL-ENUM · VAL-DEPENDENT · VAL-FILE · VAL-COMMENT · VAL-NOMINEE · VAL-CONSENT · VAL-HOLD · VAL-LV · VAL-AT · VAL-SEP · VAL-FNF · VAL-GOALNAME · …` plus module families (`VAL-M08/M11/M17/ORG-*`).

Directly reusable by government modules: `VAL-PAN`, `VAL-AADHAAR`, `VAL-IFSC`, `VAL-DOB`, `VAL-NOMINEE`, `VAL-CONSENT`, `VAL-EFFECTIVE`, `VAL-DATE`, `VAL-FILE`, `VAL-COMMENT`, `VAL-ENUM`, `VAL-MASTER-UNIQUE`, `VAL-FLOW-NOCYCLE`.

**`GAP (gov-specific)`** examples to author as new ids: `VAL-SR-EVENT` (SR ledger append integrity), `VAL-QUALSVC` (qualifying-service computation bounds), `VAL-PENSION` (pension/commutation formula bounds), `VAL-SENIORITY` (seniority-list tie-break rules), `VAL-DISC-DUEPROCESS` (charge → reply → inquiry sequencing), `VAL-TRANSFER-ORDER` (relieving/joining date consistency).

---

## 8. Audit · Consent · DPDPA · NFR · ID Conventions

### 8.1 Audit, consent & DPDPA
- **Audit:** dual-log, DB-trigger, immutable, 7-yr — see §5/P05. Government BRDs do **not** define their own `audit_log`; they consume P05 (override in `MODULE_RECONCILIATION.md` §C).
- **Consent (`consent_records`, DPDPA):** captured at onboarding; immutable (superseded, never deleted); withdrawal triggers erasure workflow for non-statutory data (Platform §P05; Vision §2.6; BRD §2.1.3). `VAL-CONSENT` applies.
- **Right to erasure:** non-statutory data only; statutory data has legally mandated retention; audit PII overwritten with a redaction marker, itself logged (Vision §2.7). Government **statutory retention schedules** are stricter — set per data category but never below the statutory floor.

### 8.2 NFR baseline (Vision §2.9; BRD §7 — overrides invented NFR)
| Metric | Platform target |
|---|---|
| Standard API p95 | < 500 ms @ 300 concurrent (Phase 1) |
| Read-heavy (directory/reports) | p95 < 300 ms cached · < 1000 ms uncached |
| Write operations | p95 < 1500 ms |
| Web page load (LCP, 4G) | < 2.5 s |
| Production uptime | **99.5%/month** (not the invented 99.9%) |
| RTO / RPO | RTO < 4 h · **RPO < 1 h** (not the invented 15 min) |
| Audit completeness | 100% mutations captured, zero gaps |
| Accessibility | WCAG 2.1 AA — all web screens |
| Responsive breakpoints | 375 / 768 / 1280 px; touch targets ≥ 44×44 px |
| Deletions | no hard delete — soft delete only |

### 8.3 Jobs & message-id conventions (Foundation §4, §5)
- Jobs: `JOB-<module>-*` registered in the Foundation §4 index; runner per X.1; cadence/logic in the module FS.
- Notifications: `MSG-<module>-<n>`; system messages `MSG-SYS-*`; user-facing errors `ERR-<area>`. Templates carry typed merge fields `{like_this}`; a screen state or API error references an id, never inlines copy (Foundation §5).
- Government modules use `JOB-<gov>-*` / `MSG-<gov>-*` / `ERR-<gov>-*` and register them in the Foundation indexes.

---

## 9. Authoring Rules for Government Module BRDs

Every government module BRD MUST:

1. **Carry `tenant_id` / `entity_id`** on every table and rely on data-layer scoping (§2).
2. **Consume P01–P06 and X.1–X.3 / W.1–W.3 by id** — never re-implement workflow, RBAC, audit, notifications, jobs, migration, or configured-content engines (§5).
3. **Cite `VAL-*`, `MSG-*`, `ERR-*` ids** from the Foundation catalogue; author only module-unique `VAL-<gov>` / `MSG-<gov>` / `ERR-<gov>` and register them in the Foundation indexes (§7, §8.3).
4. **Reuse the RBAC model** (RBAC v1.7) — express government statutory actors as new roles + capability flags ADDED to the taxonomy, with SoD enforced by P01/P02 (§6).
5. **Adopt the platform API conventions and error table** (§4), the NFR baseline (§8.2), and the canonical UI-state standard (empty / loading / error / no-permission / partial-data; masked fields per RBAC; `E·AR` request-change pattern) (Foundation §3).
6. **Include an "Alignment with PrimeSoft platform" section** mapping each FR to the platform service(s) it runs on (P01/P02/P05/P06/X/W) and naming any `GAP (gov-specific)` engine it authors.
7. **Adopt the `G01..G14` module-code scheme** to avoid collision with PrimeSoft `Mxx` (see `MODULE_RECONCILIATION.md` §B).

**The only things a government BRD authors from scratch** are the net-new statutory engines — the **SR ledger, pension/terminal-benefits calculation, disciplinary due-process, qualifying-service ledger, transfer/relieving/joining orders, seniority/promotion case**. Each of these still **runs on P01 (workflow), P05 (audit) and P06 (migration)** and consumes the validation library, RBAC model, and notification infrastructure above. Net-new entities are catalogued in `MODULE_RECONCILIATION.md` §D.
</content>
</invoke>
