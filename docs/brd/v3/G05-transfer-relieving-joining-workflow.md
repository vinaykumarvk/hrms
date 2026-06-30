# Employee Transfer, Relieving and Joining Workflow — Government HRMS Module BRD (G05, v3.0 · platform-grounded)

**Module code:** G05 (alias GOV-M05; supersedes the `M05-TRJ` code from `SHARED_FOUNDATION.md` — see `MODULE_RECONCILIATION.md` §B)
**Program:** Government HRMS — public-sector configuration & extension of the **PrimeSoft HRMS platform**
**Document version:** v3.0 (platform-re-grounded — re-anchors v2.0 onto the existing PrimeSoft platform engines P01–P06 / X.1–X.3 / W.1–W.3 and RBAC v1.7)
**Supersedes:** v2.0 (`docs/brd/v2/M05-transfer-relieving-joining-workflow.md`), which itself superseded v1.0
**Relationship (per `MODULE_RECONCILIATION.md` §A row G05):** **NET-NEW (gov-specific)** — PrimeSoft has no transfer/posting module; the closest commercial concept (internal mobility) is an Org-Admin report, not a transfer engine. G05 authors transfer-order, relieving-at-source and joining-at-destination as **configured P01 flows + net-new statutory entities** (`MODULE_RECONCILIATION.md` §D), runs on **P01 (workflow), P05 (audit), P06 (migration)**, and **emits SR events to the G12 SR ledger**.
**Grounded in:** Master BRD v2.1 · Product Vision v2.6 · Platform Specification v1.6 · RBAC Design v1.7 · Foundation FS v1.6 · `PLATFORM_FOUNDATION.md` · `MODULE_RECONCILIATION.md`.
**Status:** Baseline for build (parallel-agent ready; platform-grounded contracts frozen).
**Owns (net-new gov entities, §D):** Transfer lifecycle entities (requests, orders, clearances, charge handovers, joining reports, deputations, drives, preferences, transfer policy rules) **plus** SR outbox, representations/stay-orders, counselling sessions, quarter/estate retention, gapless order-number sequences, order acknowledgements, and drive-scoped vacancy reservations. Each carries `tenant_id`/`entity_id` and runs on the named platform services.
**Consumes (platform services & gov platform-modules — references by id, never re-authors):** **P01** WorkflowEngine (`workflows`/`workflow_instances`/`workflow_actions`), **P02** Authorization.check + RBAC v1.7, **P04** tenant/org-admin + `org_units` model, **P05** dual audit log (`audit_log`/`security_audit_log`), **P06** migration toolkit, **X.1** background-jobs runner, **X.2** notification infrastructure, **X.3** integration framework, **W.1/W.2/W.3** configured flows/forms/notification config; **G01** Employee Profile/Master (employee + org placement), **G06** Promotion/Seniority (strength & seniority read-through, joining-sequence consumer), **G09** Disciplinary (abandonment trigger), **G10** Payroll & Benefits (pay-continuity/entitlement/LPC/licence-fee signals), **G12** Digital SR ledger (SR event writer on the P05 substrate), **G13** Document Management (order/clearance PDFs + statutory document classes), **G14** Dashboard & Analytics; and the platform **Holiday & Region master** (Org Admin Master Data) for the regional working-day calendar.

---

## Alignment with PrimeSoft Platform

> Required by `PLATFORM_FOUNDATION.md` §9 rule 6. Maps every G05 FR to the platform service(s) it runs on and flags the `GAP (gov-specific)` logic G05 authors. **No FR re-implements a platform engine** — transfer/relieving/joining business logic is authored; workflow, RBAC, audit, notification, jobs, migration and configured-content plumbing is consumed.

| FR | Runs on platform service(s) | G05-authored (`GAP (gov-specific)`) | SR / external signal target |
|---|---|---|---|
| **FR-G05-001** Request initiation | **W.2** intake form (`VAL-*` + `VAL-G05-*`) · **P02** authz + sensitive-field masking · **G13** documents (sensitive class) · **P05** audit · **P01** `startInstance` on submit | transfer-request entity, canonical taxonomy, eligibility trigger | — |
| **FR-G05-002** Policy & eligibility | **P02** override authz · **P05** audit · reads **G06/G01** strength/seniority read-through | gov rules engine (`VAL-G05-ELIG`, ban/tenure/protected-category logic) | — |
| **FR-G05-003** Counselling/preference (batch) | **W.2** preference form · reads **G06** seniority · **P02** scope | vacancy publication, batch allotment, reservation write | — |
| **FR-G05-004** Order gen, gapless numbering, approval, publication | **P01** approval flow (**W.1**, `SEQUENTIAL`/`CONDITIONAL`/`DYNAMIC_APPROVER`) · **G13** doc-generation (PDF) · **X.1** outbox publisher · **P05** audit | order entity, `order_class`, **gapless reserve-then-commit numbering** (`VAL-G05-TRANSFER-ORDER`) | G12 `TRANSFER` (`MUTUAL_TRANSFER` for mutual) via `/sr/ingest` |
| **FR-G05-005** Bulk drive | **X.1** `JOB-G05-DRIVE` batch · **P01** per-order approval | drive lifecycle, partial-failure quarantine | per order |
| **FR-G05-006** Relieving — clearance | **P01 `PARALLEL_ALL_OF`** (one branch per configured clearance department; joins only when all clear) · **P01 SLA runtime** (per-branch SLA + escalation → X.2 + audit) · **X.2** notify · **P05** | checklist/item entities, deemed-clearance forced action | — |
| **FR-G05-007** Charge handover | **P01** data-collection + dispute SLA (P01 SLA runtime) · **G13** note doc · **P05** | handover entity, under-protest forced action | — |
| **FR-G05-008** Relieving order & LWD | **P01** approval · **G13** doc · **X.1** outbox · **VAL-EFFECTIVE** + `JOB-G05-EFFDATE` (statutory LWD) · **P05** | relieving entity, gapless numbering, pay-continuity signal | G12 `RELIEVING` via `/sr/ingest`; G10 `PAY_CONTINUITY`+`LPC_REQUEST` via outbox |
| **FR-G05-009** Transit & joining-time | platform **Holiday & Region master** (Org Admin Master Data, `VAL-HOL-RECUR`/`VAL-REGION-STATE`) · **X.1** `JOB-G05-TRANSIT` overdue detection · **X.2** | distance-band joining-time logic (`VAL-G05-JTIME`) | — |
| **FR-G05-010** Joining & charge assumption | **P01** verify/confirm · **G01** master org-placement update via outbox · **X.1** · **P05** | joining entity, reservation re-check | G12 `JOINING` via `/sr/ingest`; G01 `POSTING_UPDATE`; G10 `PAY_CONTINUITY` resume |
| **FR-G05-011** Deputation & repatriation | **P01** approval · **X.1** `JOB-G05-REPAT-REMIND` | deputation entity, tenure caps | — |
| **FR-G05-012** SR event posting (outbox) | **X.1** outbox publisher (`JOB-G05-OUTBOX`) + **X.3** integration to **G12** (which runs on the **P05** audit/immutability substrate) | `sr_outbox` (G04-style transactional outbox), idempotency-key formula, dead-letter | G12 SR ledger; G10/G01/G09 |
| **FR-G05-013** Amend / cancel / revoke | **P01** approval · **X.1** reversal outbox · **G01** posting reversal · **P05** | corrective state logic, supersede-not-delete reversal | G12 `TRANSFER_CANCELLED`/`RELIEVING_CANCELLED`/`JOINING_CANCELLED` (`is_reversal=true`) via `/sr/ingest/reversal`; G10/G01 reversal |
| **FR-G05-014** Mapping & analytics | **G14** analytics (`analytics.*`, role-scoped) · **P02** scope | G05 KPIs/metrics; map = Phase-2 | — |
| **FR-G05-015** Service continuity & custody | **X.1** outbox (G10) · **P05** | custody invariant, entitlement keying, continuity assertion | G10 `PAY_CONTINUITY`+`ENTITLEMENT` |
| **FR-G05-016** Authority forced-actions | **P01** (Authority = P01 approver; SoD by P01/P02) · **P05** dedicated reason+actor audit | one forced-action mechanism | — |
| **FR-G05-017** Representation / holds | **P01** decision flow · **G13** stay-order doc · **P05** | representation entity, `STAY_HOLD` supremacy | — |
| **FR-G05-018** Non-joining / abandonment | **P01** Authority decision · **X.1** outbox (G09 trigger, G10) · **P05** | limbo-pay logic, revert-vs-abandon | G09 disciplinary trigger; G10 pay status |
| **FR-G05-019** Interactive counselling | gov-authored turn engine on the **P05** audit substrate (immutable choice log); **does NOT re-implement P01** — it is a live allotment surface feeding P01 order flow | turn order, vacancy lock, immutable `counselling_choices` | — |
| **FR-G05-020** Proof-of-service & acknowledgement | **X.2** delivery channels · **W.2** ack form · **X.1** `JOB-G05-SERVE-DEEM` · **P05** | served-date precedence, deemed-served | — |
| **FR-G05-021** Joining-sequence & inter-se seniority | gov sequencing logic · feeds **G06** via outbox · **P05** | deterministic tie-break, sequence integrity | G06 seniority feed |
| **FR-G05-022** Quarters / estate retention | **X.1** outbox (G10 licence-fee) · `JOB-G05-QTR-OVERSTAY` · **P05** | quarter entity, penal-rate flip | G10 `LICENCE_FEE_RECOVERY` |

**Net-new statutory surface G05 authors (per `PLATFORM_FOUNDATION.md` §1.2 / §9):** the transfer/relieving/joining orders engine. It still **runs on P01 (workflow), P05 (audit) and P06 (migration)** and consumes the validation library, RBAC model and notification infrastructure. The **G12 SR ledger is the statutory system-of-record** — G05 is a **writer** to it, never an owner of a shared platform SR table (`MODULE_RECONCILIATION.md` §C/§D).

---

## Amendments (v2 → v3: platform re-grounding)

> This table records every change made to re-anchor v2.0 onto the real PrimeSoft platform. **All v2 functional content, entities, invariants, state machines, acceptance tests and the domain primer are preserved**; only the platform plumbing, ids, codes, roles and NFR baselines are re-grounded. Each row cites the governing override in `MODULE_RECONCILIATION.md` §C or `PLATFORM_FOUNDATION.md`.

| # | v2 (invented `SHARED_FOUNDATION`) | v3 (platform-grounded) | Governing source |
|---|---|---|---|
| 1 | Module code `M05-TRJ` | **`G05`** (alias GOV-M05); cross-refs re-keyed M01→G01, M06→G06, M09→G09, M10→G10, M12→G12, M13→G13, M14→G14 | Reconciliation §B |
| 2 | Multi-department clearance modelled as a generic checklist with bespoke SLA timers | Modelled as a **P01 `PARALLEL_ALL_OF`** flow (one branch per configured clearance department; joins only when all branches complete); **per-branch SLA + escalation via the P01 SLA runtime**; out-of-workflow timers via **X.1 `JOB-G05-*`** | Platform §P01 (Appendix D); Foundation §4 |
| 3 | "shared workflow engine", `workflow_instances`/`workflow_tasks` | **P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel/query`), `workflow_actions` (not `workflow_tasks`); in-flight version pinning; 5 patterns (Appendix D) | Reconciliation §C; Platform §P01 |
| 4 | Local `org_units`/`designations` treated as a forked "platform" table | **Platform org model (P04 / G01 employee-master `org_units`)** referenced, not forked; office = an `org_units` of a transferable type | Platform §P04; Reconciliation §A (G01) |
| 5 | `service_register_events` as a "shared platform entity" written directly | **G12 SR ledger** (net-new gov ledger on the **P05** substrate) targeted **via the G04-style transactional outbox** (`sr_outbox`) dispatched on **X.1 + X.3**; G05 references G12, invents no shared SR table | Reconciliation §C/§D; `PLATFORM_FOUNDATION.md` §5 |
| 6 | Error codes `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `INTERNAL_ERROR(500)`, `UPSTREAM_UNAVAILABLE(503)`; envelope `{error:{code,message,field}, requestId}`; `TRJ_*` codes | Platform **8-code table** (`VALIDATION_FAILED 422`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409`, `PRECONDITION_FAILED 412`, `RATE_LIMITED 429`, `INTERNAL 500`); envelope `{error:{code,message,field,details}}` + **`X-Correlation-Id` header** (no body `requestId`); `TRJ_*` re-expressed as **`ERR-G05-*` message ids over the platform codes**; **503 dropped** (upstream failures degrade via X.3 + outbox) | Reconciliation §C; Foundation §1 |
| 7 | Pagination "cursor or page/limit, max 100" | **Cursor only** (`?limit=` default **25** / max **100** + `cursor=`, response `next_cursor`); offset paging removed | Reconciliation §C; Foundation §1 |
| 8 | Idempotency unspecified at API layer | **`Idempotency-Key` header** on all workflow-initiating / external-signal POSTs; repeat within **24h** returns the original result | Foundation §1; Platform §0.4 |
| 9 | Multi-tenancy omitted | **`tenant_id` (non-null) + `entity_id` (where entity-scoped) on every G05 table**; data-layer scoping; unscoped query rejected, not defaulted | Reconciliation §C; Platform §0.1 |
| 10 | Local `audit_log` defined as "shared platform" table | **P05 dual log** consumed (`audit_log` data mutations + `security_audit_log` auth/RBAC events), **DB-trigger capture**, immutable, 7-yr; forced-action/override/sensitive-access reasons written as audited fields; tamper-evidence tracks **OPEN-PLAT-03** | Reconciliation §C; Platform §P05 |
| 11 | Invented role list (Transfer Authority, Clearance Officer, SR Custodian, Auditor, System Administrator …) | **RBAC v1.7 model reused**; gov actors expressed as **new roles + capability flags ADDED** (§3); Auditor → Org-Admin read + entitlement; System Administrator → Org/Platform Admin; Payroll Officer → G10 Payroll Admin; **SoD enforced by P01/P02**, not re-coded | Reconciliation §C; `PLATFORM_FOUNDATION.md` §6.6 |
| 12 | Auth "OIDC/SSO + MFA; JWT; RBAC + row-level" generic | **P02** `Authorization.check` per request; bearer JWT carries resolved roles + tenant/entity scope; **field masking on serialization**; PII Protection Ceiling; **MFA enforced for high-privilege gov roles** (Transfer/Appointing/Disciplinary Authority) | Platform §P02, §0.2; `PLATFORM_FOUNDATION.md` §3.1 |
| 13 | "Platform Calendar Service" (invented) | Platform **Holiday & Region master** (Org Admin Master Data; `VAL-HOL-RECUR`, `VAL-REGION-STATE`) read for regional working days; no silent Sat/Sun fallback; unavailability defers compute | Foundation §2 (Org Admin Master) |
| 14 | Module-unique `VAL-*` / messages inlined | Cite Foundation `VAL-*` by id; author only **`VAL-G05-*`**, **`MSG-G05-*`**, **`ERR-G05-*`**, **`JOB-G05-*`** and register them in the Foundation indexes (§2/§4/§5) | Reconciliation §B/§E; Foundation §2/§4/§5 |
| 15 | Bespoke job timers (SLA/escalation/overdue/overstay) | **X.1 background-jobs runner** with `JOB-G05-*` registered against it (idempotent, backoff ×3, `JOB-FAIL`→`MSG-SYS-JOBFAIL`, per-tenant isolation, run-audit); cadence/logic here, index in Foundation §4 | Platform §X.1; Foundation §4 |
| 16 | Notifications ad-hoc template keys (`TRJ_*`) | **X.2 infrastructure** + **W.3 config**; templates referenced by **`MSG-G05-*`** id; statutory notices **mandatory / non-suppressible (EMAIL)** | Platform §X.2; BRD §9.9; `PLATFORM_FOUNDATION.md` §5 (X.2) |
| 17 | Migration left informal (`legacy_ref` tag) | **P06 ETL+V**, three mandatory staging dry runs, waves, `migration_runs` ledger, **`g05_source_id` traceability** (the `darwinbox_source_id` pattern against the actual legacy register) | Reconciliation §C/§D; Platform §P06 |
| 18 | NFR `99.9% uptime`, `RPO ≤ 15min` | Platform NFR baseline: **99.5%/month uptime**, **RPO < 1h**, RTO < 4h, read p95<500ms, write p95<1500ms, WCAG 2.1 AA | Reconciliation §C; `PLATFORM_FOUNDATION.md` §8.2 |
| 19 | `TransferOrderStateService` as a free-standing "single writer" | Retained as the **sole writer of `transfer_orders.status`**, but every guarded transition **calls P01** for approval gating and **P05** for audit; it is an orchestration service over P01, not a parallel workflow engine | Platform §P01; v2 §16.6 preserved |
| 20 | Effective-dated statutory dates written live | Statutory effective dates (transfer w.e.f., LWD, joining date) **staged via `effective_from` + `JOB-G05-EFFDATE`** following the platform effective-dating mechanism (`VAL-EFFECTIVE`) | `PLATFORM_FOUNDATION.md` §3.3; Foundation §1 |
| 21 | UI states described ad-hoc | Adopt the **canonical UI-state standard** (empty/loading/error/no-permission/partial-data), the **My Team workspace** + **approval action bar** component, masked-field + `E·AR` request-change pattern | Foundation §3; Platform §6.5 (Workspace) |
| 22 | Configured approval/forms/notification implied as code | Expressed as **W.1 flow definitions / W.2 forms / W.3 notification config** consumed by P01 — not bespoke code | Platform §W.1/§W.2/§W.3 |

All **24 v1→v2 council improvements** (pay-continuity, in-transit custody, forced-action power, deemed/escalation clearance, representation/stay-hold, abandonment, fully-specified outbox, single state-service, vacancy lifecycle, strength read-through, `order_class`, calendar contract + distance bands, joining-sequence seniority, proof-of-service, gapless numbering, mutual coupling, interactive counselling, sensitive-doc ring-fence, quarters/estate sub-process, enum taxonomy, acceptance tests, domain primer, re-prioritised map) remain **fully preserved** and are now expressed on the platform substrate. See the v2 §1A table — carried forward unchanged in intent.

---

## Amendments (v3 → v3.1: cross-module remediation)

> Records the surgical cross-module convergence fixes applied per `docs/review/REMEDIATION.md` (D1, D5; R1 findings F-01..F-04, F-10, F-11). **G12 froze the SR ingestion contract**; G05 is a writer and now conforms to the canonical write-port, event taxonomy, ingest payload contract, reversal envelope, and shared-entity naming. No functional content changed; only the SR boundary and naming were re-grounded.

| # | Decision | v3.0 (pre-remediation) | v3.1 (remediated) | Source |
|---|---|---|---|---|
| R1 | **SR write-port** (D1) | Posted to `POST /api/v1/sr/events` | Canonical **`POST /api/v1/sr/ingest`** (+ **`/api/v1/sr/ingest/reversal`**); module-local `sr_outbox`/reconciliation paths are façades that **relay to `/sr/ingest`** — no direct SR-table INSERT, no `/sr/events` | REMEDIATION D1; G12 FR-01/02 |
| R2 | **Event-type codes** (D1, F-01/F-02) | Free-form `TRANSFER_ORDERED`, `RELIEVED`, `JOINED`, `COMPENSATING` | Exact G12-published codes: **`TRANSFER`, `RELIEVING`, `JOINING`, `MUTUAL_TRANSFER`, `TRANSFER_CANCELLED`, `RELIEVING_CANCELLED`, `JOINING_CANCELLED`** (cited verbatim) | REMEDIATION D1; G12 catalog |
| R3 | **Ingest payload contract** (D1, F-03) | Only `idempotency_key` formula + outbox row scoping | Dedup tuple **`(source_module="G05", source_reference_id, source_event_version)`** + required **`fact_key`** (qualifying-service) + explicit **`tenant_id`/`entity_id`** on the SR payload (not just the outbox row) | REMEDIATION D1; G12 FR-01 |
| R4 | **Reversal/correction** (D1, F-04) | Invented `COMPENSATING` event type | Removed. G12 envelope **`is_reversal=true`+`reverses_source_reference_id`** with the published `*_CANCELLED` partner types; **supersede-not-delete** (G12 auto-spawns the corrigendum) | REMEDIATION D1 |
| R5 | **Shared-entity naming** (D5, F-10/F-11) | Singular `org_unit` (entity/model/FK references) | Standardised to **`org_units`** (plural) throughout entity/model/FK references; FK column names (`source_org_unit_id` etc.) unchanged | REMEDIATION D5 |

Affected sections: §Alignment map (FR-004/008/010/013 SR targets), §5.2.15 `sr_outbox` (`event_type` ENUM + payload + idempotency contract), §5.2 FK references, FR-G05-012 (SR posting), FR-G05-013 (amend/cancel/revoke), §8.4 JSON example, §10 state machine, §13 migration, §14.1 traceability, §16.2 narrative.

---

## 1. Executive Summary

### 1.1 Purpose
The Employee Transfer, Relieving and Joining Workflow module (**G05**) digitises the **end-to-end employee mobility lifecycle** of a government/public-sector organisation: from the **initiation of a transfer** (by request, administrative decision, mutual exchange, deputation, or promotion-linkage), through **transfer-order generation, statutory approval, and proof-of-service to the employee**, **relieving at the source office** (departmental no-dues/clearance, handover of charge, last-working-day, relieving order), the **transfer-in-transit / joining-time period treated as continuous paid service**, and finally **joining at the destination office** (joining report, charge assumption, confirmation of joining date, inter-se seniority sequencing). Every materially significant event is posted as a statutory **Service Register (SR) event** to the **G12 Digital SR ledger** (on the P05 audit substrate), and the relieving/joining events explicitly **assert no break in qualifying service**.

The module replaces a paper-driven, multi-office, hand-carried "Last Pay Certificate + relieving letter + joining report" process that today causes pay gaps, disputed seniority dates, lost no-dues forms, and unauditable transit periods. It establishes a **single auditable system of record** for who is posted where, from when, under what order, in whose custody during transit, and with what dues outstanding — **running on the PrimeSoft platform engines** rather than a parallel stack.

### 1.2 Business context (public-sector statutory)
Transfers in government are **regulated administrative actions**. They are constrained by transfer policy (minimum tenure at a post, transfer ban/freeze periods such as election model-code-of-conduct windows, protected categories such as spouse-posting, medical grounds, single-parent, differently-abled, near-retirement protection), by **vacancy and sanctioned-strength** discipline (the authoritative source of which is **G06/G01**, **read-through** by G05, not duplicated), and by **due process** (competent/appointing authority sanction enforced by **P01** with SoD by **P02**, proof of service on the employee, transfer counselling for cadre drives). Relieving and joining have **pay and seniority consequences**: the date of relieving and date of joining define the **transit period**, which is **paid joining time / duty** (not dead time), and which fixes joining-time admissibility, pay continuity, and the **seniority/service continuity** recorded in the **G12 Digital SR**. Transfers are routinely contested through representations and court/tribunal **stay orders**, and may end in **non-joining/abandonment**; all of these are first-class, modelled states. Errors are statutorily and financially material.

### 1.3 Scope summary
In scope: transfer request/initiation across all transfer types; eligibility & policy enforcement; counselling/preference capture **including interactive counselling sessions**; vacancy-driven and bulk transfer drives with an explicit vacancy lifecycle; transfer-order generation with **gapless statutory numbering**, approval (P01), **proof-of-service & acknowledgement**, amendment, cancellation and revocation; **representation / stay-order / retention holds**; relieving (no-dues clearance **as a P01 `PARALLEL_ALL_OF` flow with SLA-bounded escalation and deemed clearance**, charge handover **with handover-under-protest**, relieving order **with deemed-relief Authority power**, last working day); **service-continuity and in-transit custody management**; joining (joining report, charge assumption, **inter-se seniority sequencing**, **non-joining/abandonment resolution**); deputation & repatriation; **government quarters/estate retention & licence-fee recovery**; SR-event posting to G12 via a fully-specified transactional outbox on X.1; module notifications (X.2/W.3), reporting and analytics (G14).

Out of scope (owned elsewhere, integrated): the canonical employee master & org placement (**G01**), promotion decisioning and seniority computation (**G06** — G05 consumes promotion-linked transfer triggers, reads sanctioned strength/seniority, and writes posting changes + joining-sequence facts), payroll Last Pay Certificate generation, **joining-time pay / transfer entitlement computation**, pay disbursement and licence-fee recovery (**G10** — G05 raises the LPC trigger, the **pay-continuity + entitlement** signal, and the licence-fee-recovery signal), pension/retirement (G11), the **G12 Digital SR ledger** itself (G05 is a writer), disciplinary proceedings for abandonment (**G09** — G05 raises the trigger), and the document object store (**G13** — G05 stores order/clearance PDFs there, with a statutory sensitive-category class for medical/spouse/compassionate evidence). Workflow, RBAC, audit, notifications, jobs, migration and configured content are **platform services (P01–P06 / X.1–X.3 / W.1–W.3)** consumed by id.

### 1.4 Primary outcomes & KPIs
| Outcome | KPI | Target |
|---|---|---|
| Faster relieving | Median time order-served → relieved | ≤ 5 working days |
| **No pay gaps** | % transfers with continuous pay (no break) via service-continuity model | ≥ 99% |
| Auditable transit | % transfers with recorded relieving + joining dates **and a defined in-transit custodian** | 100% |
| Policy compliance | % orders violating ban/tenure rules at issue **without a recorded Authority override** | 0% (hard-blocked) |
| Clearance discipline | % relievings with all mandatory no-dues closed (cleared, with-dues, waived, or **deemed-cleared with audit**) | 100% |
| SR integrity | % transfer/relieving/joining events posted to **G12** | 100% |
| Custody integrity | % in-transit employees with exactly one custodian office (no dual/zero posting) | 100% |
| Service-of-order integrity | % orders with recorded served-on date before relieve-by enforcement | 100% |
| Self-service adoption | % transfer requests raised via self-service (Me workspace) | ≥ 70% |

### 1.5 Key stakeholders
Employees (transferees), Reporting Managers, HR Officers/Admins at source and destination offices, Department Heads / Appointing & Transfer Authorities, Clearance Officers (IT, Library, Accounts, Stores, Advances, Quarters/Estate), Estate/Quarters Officer, SR Custodian/Registrar (G12), Payroll Officer (G10 Payroll Admin), Disciplinary Authority (G09), Auditors (Org-Admin read), and System Administrators (Org/Platform Admin).

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Sub-area | Description | Representative FRs |
|---|---|---|
| **Transfer Initiation** | Request capture across all types (request/admin/mutual/deputation/promotion-linked), draft validation, sensitive-ground document ring-fencing (G13) | FR-G05-001 |
| **Policy & Eligibility** | Minimum tenure, ban/freeze windows, protected grounds, sanctioned-strength (G06/G01 read-through) checks | FR-G05-002 |
| **Counselling & Preferences** | Vacancy publication, preference/option capture, batch allotment | FR-G05-003 |
| **Interactive Counselling** | Live, observed counselling session with turn order, vacancy lock, immutable choice log (on P05 substrate) | FR-G05-019 |
| **Approval, Numbering & Order** | P01 approval chain, gapless statutory order numbering, generation (G13 doc-gen), publication | FR-G05-004 |
| **Proof-of-Service** | Service of order on employee (X.2), acknowledgement, basis for relieve-by enforcement | FR-G05-020 |
| **Bulk Drives** | Annual/seasonal transfer drives (X.1 batch), batch initiation, allotment, bulk orders | FR-G05-005 |
| **Relieving — Clearance** | Departmental no-dues as a **P01 `PARALLEL_ALL_OF`** flow with SLA escalation & deemed clearance | FR-G05-006 |
| **Relieving — Charge Handover** | Handover of charge, records, assets, cash/imprest, handover-under-protest | FR-G05-007 |
| **Relieving — Order & LWD** | Relieving order issue, last-working-day, pay-continuity signal (G10) | FR-G05-008 |
| **Service Continuity & Custody** | Paid transit, joining-time pay, in-transit custodian, G10 entitlement signal | FR-G05-015 |
| **Transit Management** | In-transit status, joining-time by distance band (Holiday/Region master), overdue handling | FR-G05-009 |
| **Joining** | Joining report, charge assumption, joining-date confirmation, pay-continuity resumption | FR-G05-010 |
| **Joining-Sequence & Seniority** | Inter-se joining order, deterministic tie-break, G06 feed | FR-G05-021 |
| **Non-Joining / Abandonment** | Late-joining review, revert-to-source, disciplinary linkage (G09) | FR-G05-018 |
| **Authority Forced-Action** | Deemed-clearance, handover-under-protest, deemed-relief as one power (P01 Authority) | FR-G05-016 |
| **Representation & Holds** | Representation / court-stay / retention-request holds | FR-G05-017 |
| **Deputation & Repatriation** | Deputation terms, tenure, extension, repatriation | FR-G05-011 |
| **Quarters / Estate** | Official-accommodation retention, vacation-by date, licence-fee recovery (G10) | FR-G05-022 |
| **SR Posting** | Posting transfer/relieving/joining as SR events to **G12** via the X.1 outbox | FR-G05-012 |
| **Amendment / Cancellation** | Order modification, cancellation, post-relieving revocation | FR-G05-013 |
| **Mapping & Analytics** | Geographic mapping (Phase-2), pendency, transit/clearance dashboards (G14) | FR-G05-014 |

### 2.2 Common Capabilities (platform behaviours consumed, applied in this module)
- **Maker-checker workflow** via **P01 WorkflowEngine** for every order, relieving, and joining action — configured as **W.1 flow definitions**, not coded; double-clicked/retried approves produce one `workflow_actions` row (engine idempotency).
- **Segregation of duties** enforced by **P01/P02** (deny-by-default, multi-role intersection, no self-approval): initiator ≠ approver; transferee may never approve own transfer or self-clear a no-dues item; clearance officer ≠ transferee; relinquisher ≠ acceptor; the Authority granting a forced action is recorded and may not be the transferee.
- **Single state authority:** all `transfer_orders.status` transitions are mediated by one **`TransferOrderStateService`** (§16.6) which **calls P01 for gating and P05 for audit**; no other component writes the column.
- **Row-level scoping** by `org_units` (P02 data-scope filter, one of the five RBAC scoping dimensions): source-office HR sees relieving; destination-office HR sees joining; a transferee in transit is visible to both and owned by the **in-transit custodian** (FR-G05-015).
- **Immutable audit** via **P05** (DB-trigger capture on every INSERT/UPDATE/soft-DELETE; `audit_log` for data, `security_audit_log` for auth/RBAC); **forced actions, overrides, deemed-clearances, and sensitive-document access carry a dedicated audit reason + actor** in the mutated row, captured by the trigger.
- **Soft delete** (`is_deleted`) on transactional entities except append-only ledgers/outbox/choice logs (no hard delete — Platform §8.2).
- **Document binding:** every generated order and signed clearance/handover/joining artefact is stored in **G13** and referenced by ID; medical/spouse/compassionate evidence uses a **statutory sensitive document class** with restricted access + access logging (P05).
- **i18n / locale:** dates `DD-MMM-YYYY` display; UTC storage; INR money; bilingual order templates (W.2 i18n).
- **Pagination:** all list endpoints **cursor only** (`limit` default 25, max 100, `next_cursor`).
- **Idempotency:** workflow-initiating / external-signal POSTs accept an `Idempotency-Key` (24h replay window).

### 2.3 In-scope / Out-of-scope boundary table
| Concern | In G05 | Owned by |
|---|---|---|
| Transfer order data & lifecycle (incl. gapless numbering, proof-of-service) | ✅ | G05 |
| No-dues / clearance (P01 `PARALLEL_ALL_OF`, SLA escalation, deemed clearance) | ✅ | G05 (flow on P01) |
| Charge handover/assumption (incl. under-protest) | ✅ | G05 |
| Joining report + inter-se joining sequence | ✅ | G05 |
| In-transit custody assignment | ✅ | G05 |
| Representation / stay-order / retention holds | ✅ | G05 |
| Quarters/estate retention record + vacation timeline | ✅ | G05 |
| Deputation/repatriation records | ✅ | G05 |
| SR outbox & idempotency | ✅ | G05 (runs on X.1/X.3) |
| Employee master fields, **org placement / `org_units`** | Updated by G05 on join (via G01 service) | **G01** (owner) |
| Promotion decision, seniority math, **sanctioned strength** | Consumes/reads | **G06** |
| LPC, **joining-time pay & transfer entitlement computation**, pay-continuity execution, dues/licence-fee recovery | Raises signals | **G10** |
| Disciplinary proceedings for abandonment | Raises trigger | **G09** |
| **SR ledger entries** | Writes events | **G12** (on P05 substrate) |
| Order/clearance PDFs storage + sensitive document class | References | **G13** |
| Working-day / regional holiday calendar | Reads | **Platform Holiday & Region master** (Org Admin Master Data) |
| Workflow / RBAC / audit / notifications / jobs / migration / configured content | Consumes by id | **P01–P06 / X.1–X.3 / W.1–W.3** |

### 2.4 Assumptions & constraints
- **Sanctioned strength / vacancy data is owned by G06/G01 and read-through by G05**; G05 stores only **drive-scoped reservation** state (`vacancy_reservations`). If the strength read is unavailable, vacancy-driven flows degrade to manual destination entry with a warning (no hard block) and a reconciliation flag — surfaced via X.3 error mapping, not a 503.
- Transfer policy parameters (tenure thresholds, ban calendars, protected categories, clearance SLAs, joining-time distance bands) are **configurable master data** (versioned config cascade platform→tenant→entity→employee per Platform §0.3) maintained by System Administrators (Org Admin) and Transfer Authorities; the module ships seeded defaults.
- A transfer always has exactly one source `org_units` and one destination `org_units` (deputation destination may be an external organisation modelled as an `org_units` of type `EXTERNAL` in the platform org model).
- "Office" = an `org_units` of a transferable type; clearance departments are configured per office, and an office may legitimately have **fewer than the seven default departments** (only configured departments generate clearance branches in the `PARALLEL_ALL_OF` flow).
- A **successor may not exist**; charge may be handed to a link officer, the office (custody-of-office), or held under protest (FR-G05-007/016).
- The **transit period is paid duty/leave**, not unpaid; pay is continuous with a custody handoff (FR-G05-015).
- A regional **working-day/holiday calendar** exists in the platform **Holiday & Region master**; G05 does not silently assume Sat/Sun + national holidays (§8.3, FR-G05-009).
- Every G05 table carries **`tenant_id`/`entity_id`** and relies on **data-layer scoping** (Platform §0.1); a query without a resolvable tenant scope is rejected.

---

## 3. Roles & Permissions

> Per `PLATFORM_FOUNDATION.md` §6: the access-control **model** is owned by **RBAC v1.7**. Government statutory actors are expressed as **new roles + capability flags ADDED** to the taxonomy (registered in RBAC §2.2/§4.3 via the working-group process), never a parallel scheme. **SoD (maker ≠ checker, no self-approval) is enforced by P01/P02**, not re-implemented here.

### 3.1 Module roles (RBAC v1.7 additions / mappings)
| G05 actor | Express in RBAC v1.7 as | Module responsibility |
|---|---|---|
| **Employee (Transferee)** | existing **Employee** (RBAC §2.4), own-record scope | Raise transfer-on-request / mutual request; submit preferences; **acknowledge order service**; submit joining report; view own transfer status & orders (Me workspace). |
| **Reporting Manager** | existing **Manager L1** (RBAC §2.3), manager scope + has-reportees | Recommend/endorse request; confirm charge handover acceptance where receiving charge (My Team workspace). |
| **HR Officer (Source / Destination)** | existing **HRBP / Office Admin** (RBAC §2.2), entity + `org_units` scope | Source: drive clearance, issue relieving order, record LWD, raise LPC/pay-continuity, record **served-on date**. Destination: receive transferee, validate joining report, confirm joining date, assign **joining sequence**, resume pay-continuity. |
| **HR Admin** | existing **HR Administrator** (RBAC §2.2, superset operational role) | Initiate admin/bulk transfers, configure office clearance departments, manage drives & counselling sessions. |
| **Transfer Authority / Appointing Authority** | **NEW role `transfer_authority`** (sanctioning authority; P01 approver; **MFA enforced**) | Approve/sanction transfer orders; approve amendments, cancellations, revocations; approve deputation & repatriation; **exercise forced-action powers** (deemed-clearance, handover-under-protest, deemed-relief); decide representations/stay-holds; override policy. |
| **Clearance Officer (per department: IT, Library, Accounts, Stores, Advances, Estate/Quarters)** | **NEW capability flag `g05_clearance_officer`** on an entity-scoped role, scoped per department `org_units` | Grant/deny no-dues for their department branch; record outstanding dues. |
| **Estate / Quarters Officer** | **NEW capability flag `g05_estate_officer`** | Record official-accommodation retention, vacation-by dates, raise licence-fee-recovery signal. |
| **Charge Receiving Officer** | **runtime-resolved approver** (P01 named-individual / successor mechanism) | Accept handover of charge/assets at source; certify assumption at destination. |
| **SR Custodian / Registrar** | **NEW entity-scoped role + capability flag on the G12 SR ledger** (mirrors the Document Admin pattern; runs on P05 substrate, per `PLATFORM_FOUNDATION.md` §6.6) | Confirm SR event postings; reconcile SR/outbox discrepancies. |
| **Payroll Officer** | **map to existing Payroll Admin** (RBAC §2.2; G10) | Acknowledge pay-continuity, entitlement, LPC & licence-fee-recovery signals. |
| **Disciplinary Authority** | **NEW role** (RBAC §6.6; G09) | Receive abandonment trigger. |
| **Auditor** | **map to Org-Admin read + read-only individual entitlement** (RBAC §3.2; P05 query access) — **no parallel write role** | Read-only access to all transfer records, holds, forced-action audit, and the P05 audit log. |
| **System Administrator** | **map to Org Admin / Platform Super Admin** (RBAC §2.1) | Configure policy rules, ban calendars, order templates (W.2), clearance department catalog, SLA & distance bands, number-sequence policy; no transactional self-approval. |
| **Presiding Officer (counselling)** | `transfer_authority` role or `g05_presiding_officer` capability flag | Run interactive counselling session; record observed choices. |

All new roles/flags are **registered in RBAC §2.2/§4.3** with grant authority and audit logging to **P05** (`security_audit_log`, `event_type=RBAC_CHANGE`).

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=Execute action, — =none)
> Enforced by **P02 `Authorization.check`** (deny-by-default → role grant → multi-role intersection → entitlement → capability flag → PII ceiling → data-scope filter → field mask on serialization). Endpoints never re-implement this logic.

| Capability | Employee | Rep. Mgr | HR Src | HR Dest | HR Admin | Transfer Auth | Clearance Off | Estate Off | Charge Recv | SR Custodian | Payroll Off | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Raise transfer request | C (own) | C (team) | C | C | C | — | — | — | — | — | — | R | — |
| Submit preferences / counselling choice | C (own) | — | C | — | C | — | — | — | — | — | — | R | — |
| Approve transfer order | — | A (recommend) | — | — | — | A | — | — | — | — | — | R | — |
| Generate/publish order (gapless no.) | — | — | X | — | X | A | — | — | — | — | — | R | — |
| Record served-on / acknowledge | X (ack own) | — | X | X | X | — | — | — | — | — | — | R | — |
| Run bulk drive / counselling session | — | — | — | — | C/X | A | — | — | — | — | — | R | — |
| Grant/deny no-dues | — | — | R | R | R | — | X (own dept) | X (estate) | — | — | — | R | — |
| Forced-action (deemed clr/protest/relief) | — | — | C | — | C | A/X | — | — | — | — | — | R | — |
| Record charge handover | R (own) | A (recv) | X | — | X | — | — | — | A | — | — | R | — |
| Issue relieving order | — | — | X | — | X | A | — | — | — | — | — | R | — |
| Submit joining report | C (own) | — | — | R | C | — | — | — | — | — | — | R | — |
| Confirm joining / assign sequence | R (own) | — | — | X | X | — | — | — | A | — | — | R | — |
| Raise/decide representation / stay-hold | C (own) | — | C | C | C | A/X | — | — | — | — | — | R | — |
| Quarter retention / vacation / licence-fee | R (own) | — | R | R | R | A | — | X | — | — | — | R | — |
| Post SR event / reconcile outbox | — | — | (auto) | (auto) | — | — | — | — | — | A/R | — | R | — |
| Pay-continuity / entitlement signal | — | — | X | X | — | — | — | — | — | — | A | R | — |
| Abandonment → revert/G09 | — | — | — | X | C | A | — | — | — | — | — | R | — |
| Amend / cancel / revoke order | — | — | C | C | C | A | — | — | — | — | — | R | — |
| Approve deputation / repatriation | — | — | C | C | C | A | — | — | — | — | — | R | — |
| Configure policy / templates / SLA / sequences | — | — | — | — | R | R | — | — | — | — | — | R | X |
| View analytics dashboard | R (own) | R (team) | R | R | R | R | R (own dept) | R (estate) | — | R | R | R | R |

All approvals enforce **maker ≠ checker** and **transferee-exclusion** via **P01/P02**. Forced actions, overrides, and sensitive-document access additionally require a recorded justification, captured in the mutated row and surfaced by the **P05** trigger in the audit trail and in G14 analytics. PII (government identifiers, financial fields) is masked on serialization per the **PII Protection Ceiling**.

### 3.3 Workspace & UI-state model
Per Platform §6.5, surfaces are organised by the **Workspace switcher** (Me / My Team / Admin, derived from RBAC role holdings + has-reportees). Employee transfer self-service lives in **Me**; manager endorsement and team relieving/joining in **My Team**; HR Admin / Authority configuration and drive management in **Admin** (exclusive). Approval, clearance and forced-action surfaces use the shared **approval action bar** (approve / reject / send-back / delegate, labels per W.1 stage aliases) and the five canonical UI states (Foundation §3).

---

## 4. Platform Foundation (consumed, not restated)

This module **consumes** the PrimeSoft platform contracts by id and does not restate them (`PLATFORM_FOUNDATION.md`):

- **P01 WorkflowEngine** — all approval/maker-checker flows; **clearance = `PARALLEL_ALL_OF`**; SLA runtime for per-stage SLA + escalation; in-flight version pinning; `workflow_actions`.
- **P02 Authorization.check + RBAC v1.7** — per-request authz, scoping, field masking, PII ceiling, capability flags; SoD.
- **P04 Tenant & Org Admin** — tenant/entity model, **`org_units`** org placement, `integration_credentials` for G12/G10 portal integrations.
- **P05 Audit & Compliance** — dual log, DB-trigger capture, immutable, 7-yr; the **substrate the G12 SR ledger runs on**; tamper-evidence tracks OPEN-PLAT-03.
- **P06 Migration Toolkit** — ETL+V, 3 dry runs, waves, `migration_runs`, `g05_source_id` traceability.
- **X.1 Background Jobs runner** — hosts `JOB-G05-*` (index in Foundation §4).
- **X.2 Notification Infrastructure** + **W.3** config — `IN_APP`+`EMAIL` parallel; statutory notices mandatory/non-suppressible; templates by `MSG-G05-*` id.
- **X.3 Integration Framework** — outbound calls to G12/G10/G01/G09 (circuit-breaking, idempotency, payload versioning, per-integration error mapping).
- **W.1/W.2/W.3** — configured flow definitions / forms / notification config executed by P01.
- **NFR baseline** (Platform §8.2): read p95<500ms, write p95<1500ms, **99.5% uptime**, **RPO<1h**, RTO<4h, WCAG 2.1 AA, soft-delete only.

Gov platform-module integration touchpoints: **G01** (employee master + org placement read/update), **G06** (promotion-linked trigger, sanctioned-strength & seniority read-through, joining-sequence consumer), **G10** (LPC, pay-continuity + entitlement, licence-fee recovery), **G09** (abandonment disciplinary trigger), **G12** (SR events on the P05 substrate), **G13** (documents + sensitive class), **G14** (analytics), **Holiday & Region master** (regional working-day calendar).

---

## 5. Holistic Data Model

> **Every G05-owned table carries `tenant_id` (non-null) and `entity_id` (where entity-scoped)** and relies on **data-layer scoping** (Platform §0.1) — these are implied on every field table below and not repeated per row. **Audit is captured by the P05 DB-trigger** — G05 does **not** define an `audit_log`; the "audit fields" notation below means the standard created/updated actor/timestamp + `is_deleted` columns the trigger reads, not a private log. **Shared/platform entities are referenced, never redefined.**

### 5.1 Entity inventory
| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| 1 | `transfer_requests` | Net-new gov (G05) | G05 | Initiated transfer intent of any type, pre-order. |
| 2 | `transfer_orders` | Net-new gov (G05) | G05 | The sanctioned, numbered transfer order; master of the mobility instance (+ order_class, custody, service). |
| 3 | `transfer_policy_rules` | Net-new gov (G05) | G05 | Configurable eligibility/policy constraints (config-cascade, versioned). |
| 4 | `transfer_ban_periods` | Net-new gov (G05) | G05 | Freeze/ban calendar windows. |
| 5 | `transfer_drives` | Net-new gov (G05) | G05 | Bulk transfer drive header (annual/seasonal). |
| 6 | `transfer_preferences` | Net-new gov (G05) | G05 | Counselling preference/option list per transferee. |
| 7 | `vacancy_positions` | Net-new gov (G05) | G05 | Publishable vacant posts (**strength read-through** from G06/G01; drive reservation only). |
| 8 | `clearance_checklists` | Net-new gov (G05) | G05 | No-dues checklist header per relieving instance (subject of a P01 `PARALLEL_ALL_OF` instance). |
| 9 | `clearance_items` | Net-new gov (G05) | G05 | Per-department clearance line item = one P01 parallel branch (+ SLA, escalation, deemed). |
| 10 | `charge_handovers` | Net-new gov (G05) | G05 | Handover (source) and assumption (destination) of charge (+ under-protest). |
| 11 | `relieving_orders` | Net-new gov (G05) | G05 | Issued relieving order + last working day (+ deemed-relief, pay-continuity). |
| 12 | `joining_reports` | Net-new gov (G05) | G05 | Joining report + charge-assumption + **inter-se joining sequence**. |
| 13 | `deputation_records` | Net-new gov (G05) | G05 | Deputation terms, tenure, repatriation. |
| 14 | `transfer_representations` | Net-new gov (G05) | G05 | Representations, court stays, retention requests — holds. |
| 15 | `sr_outbox` | Net-new gov (G05) | G05 | Transactional outbox (G04-style) for SR/G10/G01/G09 signals; dispatched on X.1/X.3. |
| 16 | `vacancy_reservations` | Net-new gov (G05) | G05 | Drive-scoped reservation state over read-through vacancies; vacancy lifecycle. |
| 17 | `order_acknowledgements` | Net-new gov (G05) | G05 | Proof-of-service & acknowledgement of a transfer order. |
| 18 | `order_number_sequences` | Net-new gov (G05) | G05 | Gapless per-office/per-year statutory number reservation. |
| 19 | `counselling_sessions` | Net-new gov (G05) | G05 | Interactive counselling session header + turn order. |
| 20 | `counselling_choices` | Net-new gov (G05) | G05 | Immutable per-candidate live choice log (append-only, on P05 substrate). |
| 21 | `quarter_allotments` | Net-new gov (G05) | G05 | Official-accommodation retention, vacation, licence-fee recovery. |
| 22 | `employees` (+ `org_units` placement, `designations`) | Platform / gov | **G01 / P04** | Person/job master + org placement — read; updated on join via G01 service. |
| 23 | `users` / RBAC roles / capability flags | Platform | **RBAC v1.7 / P02** | Principals & access model. |
| 24 | `service_register_events` | Net-new gov ledger | **G12** (on P05 substrate) | SR ledger (written by G05 via outbox). |
| 25 | `documents` | Platform | **G13** | Order/clearance/handover/joining PDFs (+ sensitive class). |
| 26 | `notifications` | Platform | **X.2 / W.3** | Outbound notifications (templates `MSG-G05-*`). |
| 27 | `audit_log` / `security_audit_log` | Platform | **P05** | Immutable dual audit (DB-trigger). |
| 28 | `workflows` / `workflow_instances` / `workflow_actions` | Platform | **P01** | Approval engine. |
| 29 | Holiday & Region master | Platform | **Org Admin Master Data** | Regional working-day calendar (read). |

**Module-owned (net-new gov) entities: 21.** All run on P01/P05 and consume RBAC/validation/notification infrastructure; none re-implements a platform engine.

### 5.2 Field tables (module-owned entities)

> `tenant_id`/`entity_id` + standard actor/timestamp + `is_deleted` columns are present on every table (P05-captured) and omitted below for brevity. `[v2]` flags fields introduced in v2 and preserved here.

#### 5.2.1 `transfer_requests`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_request_id` | UUID PK | N | |
| `request_no` | VARCHAR(30) UNIQUE | N | Human key, e.g. `TRQ-2026-000123` (`VAL-MASTER-UNIQUE`). |
| `employee_id` | UUID FK→employees (G01) | N | Transferee. |
| `transfer_type` | ENUM | N | Mechanism axis (§5.5). |
| `request_origin` | ENUM | N | `SELF`, `MANAGER`, `ADMIN`, `SYSTEM`. |
| `source_org_unit_id` | UUID FK→org_units (P04/G01) | N | Current office. |
| `requested_dest_org_unit_id` | UUID FK→org_units | Y | Preferred/destination. |
| `mutual_counterpart_employee_id` | UUID FK→employees | Y | For `MUTUAL`. |
| `ground` | ENUM | Y | Justification axis (§5.5). |
| `ground_details` | TEXT | Y | `VAL-LEN(4000)`. |
| `supporting_document_ids` | UUID[] | Y | G13 references (non-sensitive). |
| `sensitive_document_ids` | UUID[] | Y | G13 **sensitive-class** refs (medical/spouse/compassionate). |
| `sensitive_ground` | BOOLEAN | N | Derived true when `ground ∈ {MEDICAL,SPOUSE,COMPASSIONATE}`; gates restricted access + P05 access logging. |
| `linked_promotion_id` | UUID | Y | G06 reference when promotion-linked. |
| `linked_drive_id` | UUID FK→transfer_drives | Y | If part of a drive. |
| `priority_category` | ENUM | Y | Protection axis (§5.5). |
| `status` | ENUM | N | See state table §10. |
| `eligibility_result` | JSONB | Y | Cached policy-check outcome. |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | P01 engine. |
| `requested_effective_date` | DATE | Y | `VAL-EFFECTIVE` (staged via `JOB-G05-EFFDATE`). |

#### 5.2.2 `transfer_orders`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_order_id` | UUID PK | N | |
| `order_no` | VARCHAR(30) UNIQUE | N | Gapless statutory number (§5.2.18, FR-G05-004; `VAL-G05-TRANSFER-ORDER`). |
| `order_class` | ENUM | N | `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION` (§5.5). |
| `transfer_request_id` | UUID FK→transfer_requests | Y | Null for direct admin orders. |
| `employee_id` | UUID FK→employees (G01) | N | |
| `transfer_type` | ENUM | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `source_designation_id` | UUID FK→designations (G01) | N | |
| `dest_designation_id` | UUID FK→designations | N | Same unless promotion-linked. |
| `order_date` | DATE | N | |
| `served_on_date` | DATE | Y | Date order served on employee (FR-G05-020); basis for relieve-by. |
| `acknowledged_at` | TIMESTAMPTZ | Y | Employee acknowledgement timestamp. |
| `relieve_by_date` | DATE | N | Statutory deadline (computed from `served_on_date` + window). |
| `expected_joining_date` | DATE | Y | |
| `joining_distance_band` | ENUM | Y | `LOCAL`,`SHORT`,`MEDIUM`,`LONG`,`OUTSTATION` — drives joining-time (§16.4). |
| `joining_time_days` | INT | Y | Derived from distance band + Holiday/Region master. |
| `joining_time_pay_admissible` | BOOLEAN | N | Whether transit is paid joining time (FR-G05-015). Default true for admin; rule-driven for own-request. |
| `entitlement_ref` | VARCHAR(60) | Y | G10 entitlement signal reference (TTA/transfer grant/joining-time pay). |
| `in_transit_custody_org_unit_id` | UUID FK→org_units | Y | Owning office during `IN_TRANSIT`. |
| `is_deputation` | BOOLEAN | N | Convenience flag (true when `order_class=DEPUTATION`). |
| `mutual_pair_order_id` | UUID FK→transfer_orders | Y | Reciprocal order for `MUTUAL`; paired-progress guard (§5.6-5). |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `status` | ENUM | N | §5.5/§10. Written **only** by `TransferOrderStateService` (which calls P01 + P05). |
| `hold_active` | BOOLEAN | N | True when a `STAY_HOLD` representation is in force (FR-G05-017). |
| `order_document_id` | UUID FK→documents (G13) | Y | Generated PDF (G13 doc-gen). |
| `approved_by` | UUID FK→users | Y | Transfer Authority (P01 approver). |
| `approved_at` | TIMESTAMPTZ | Y | |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | |
| `revision_no` | INT | N | Default 0; increments on amendment. |
| `superseded_by_order_id` | UUID | Y | On amendment. |
| `g05_source_id` | VARCHAR(80) | Y | P06 legacy-register traceability/dedup (migration only). |

#### 5.2.3 `transfer_policy_rules`
| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_rule_id` | UUID PK | N | |
| `rule_code` | VARCHAR(40) UNIQUE | N | e.g. `MIN_TENURE_MONTHS` (`VAL-MASTER-UNIQUE`). |
| `rule_type` | ENUM | N | `MIN_TENURE`, `MAX_TENURE`, `BAN_WINDOW`, `PROTECTED_CATEGORY`, `SANCTIONED_STRENGTH`, `COOLING_PERIOD`, `STATION_RETENTION`, `JOINING_TIME_PAY`. |
| `scope_cadre` | VARCHAR(40) | Y | Null = all cadres. |
| `scope_org_unit_id` | UUID | Y | Null = global (config cascade). |
| `param_value` | JSONB | N | e.g. `{ "months": 36 }` or `{ "admin": true, "own_request": false }`. |
| `enforcement` | ENUM | N | `HARD_BLOCK`, `SOFT_WARN`, `REQUIRE_OVERRIDE`. |
| `effective_from`/`effective_to` | DATE | Y | Versioned config (Platform §0.3). |
| `is_active` | BOOLEAN | N | |

#### 5.2.4 `transfer_ban_periods`
| Field | Type | Null | Notes |
|---|---|---|---|
| `ban_period_id` | UUID PK | N | |
| `title` | VARCHAR(120) | N | e.g. "Model Code of Conduct — General Election 2026". |
| `ban_type` | ENUM | N | `ELECTION_MCC`, `BUDGET`, `EXAM`, `DISASTER`, `OTHER`. |
| `start_date`/`end_date` | DATE | N | |
| `scope_org_unit_id` | UUID | Y | Null = org-wide. |
| `exception_grounds` | ENUM[] | Y | Grounds allowed despite ban. |
| `is_active` | BOOLEAN | N | |

#### 5.2.5 `transfer_drives`
| Field | Type | Null | Notes |
|---|---|---|---|
| `drive_id` | UUID PK | N | |
| `drive_code` | VARCHAR(30) UNIQUE | N | e.g. `DRIVE-2026-ANNUAL`. |
| `title` | VARCHAR(160) | N | |
| `cadre` | VARCHAR(40) | Y | |
| `drive_type` | ENUM | N | `ANNUAL`, `SEASONAL`, `AD_HOC`, `COUNSELLING`. |
| `preference_window_start`/`_end` | DATE | Y | |
| `allotment_method` | ENUM | N | `SENIORITY`, `MERIT`, `PREFERENCE`, `MANUAL`, `COUNSELLING`. |
| `status` | ENUM | N | `DRAFT`,`OPEN`,`COUNSELLING`,`ALLOTTED`,`ORDERS_ISSUED`,`CLOSED`,`CANCELLED`. |
| `total_positions` | INT | Y | |

#### 5.2.6 `transfer_preferences`
| Field | Type | Null | Notes |
|---|---|---|---|
| `preference_id` | UUID PK | N | |
| `drive_id` | UUID FK→transfer_drives | N | |
| `employee_id` | UUID FK→employees | N | |
| `preference_rank` | INT | N | 1 = highest (`VAL-INT`). |
| `preferred_org_unit_id` | UUID FK→org_units | N | |
| `vacancy_position_id` | UUID FK→vacancy_positions | Y | |
| `allotted` | BOOLEAN | N | Default false. |
| `seniority_score` | NUMERIC(10,3) | Y | From G06. |
| **Unique** | (`drive_id`,`employee_id`,`preference_rank`) | | |

#### 5.2.7 `vacancy_positions` (strength read-through)
| Field | Type | Null | Notes |
|---|---|---|---|
| `vacancy_position_id` | UUID PK | N | |
| `org_unit_id` | UUID FK→org_units | N | |
| `designation_id` | UUID FK→designations | N | |
| `cadre` | VARCHAR(40) | Y | |
| `sanctioned_strength_cached` | INT | Y | **Read-through cache** of G06/G01 value; `strength_source='G06'`, `strength_as_of` timestamp; never authoritative. |
| `filled_count_cached` | INT | Y | Read-through cache; reconciled by job. |
| `reserved_count` | INT | N | Drive-scoped reservations held by G05 (authoritative locally). |
| `strength_as_of` | TIMESTAMPTZ | Y | Freshness of cached strength. |
| `strength_source` | ENUM | N | `G06`,`G01`,`MANUAL_FALLBACK`. |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `is_published` | BOOLEAN | N | |
| `geo_lat`/`geo_lng` | NUMERIC(9,6) | Y | For Phase-2 mapping. |
| **Derived (not stored authoritatively)** | `vacant_count = sanctioned_strength_cached − filled_count_cached − reserved_count` | | Recomputed at read; never the source of truth for strength. |

#### 5.2.8 `clearance_checklists`
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_checklist_id` | UUID PK | N | Subject of a P01 `PARALLEL_ALL_OF` instance. |
| `checklist_no` | VARCHAR(30) UNIQUE | N | e.g. `NOD-2026-000789`. |
| `transfer_order_id` | UUID FK→transfer_orders | N | |
| `employee_id` | UUID FK→employees | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | The `PARALLEL_ALL_OF` instance. |
| `status` | ENUM | N | `OPEN`,`IN_PROGRESS`,`BLOCKED`,`CLEARED`,`CLEARED_WITH_DUES`,`CLEARED_WITH_DEEMED`,`CANCELLED`. |
| `total_items`/`cleared_items` | INT | N | |
| `deemed_items` | INT | N | Count of `DEEMED_CLEARED`/`WAIVED` items. |
| `has_outstanding_dues` | BOOLEAN | N | |
| `dues_recovery_ref` | VARCHAR(60) | Y | G10 recovery linkage. |

#### 5.2.9 `clearance_items` (one per P01 parallel branch; SLA/escalation/deemed)
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_item_id` | UUID PK | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `department_code` | ENUM | N | `IT`,`LIBRARY`,`ACCOUNTS`,`STORES`,`ADVANCES`,`ESTATE_QUARTERS`,`HR`,`OTHER`. |
| `workflow_branch_ref` | VARCHAR(60) | Y | The P01 `PARALLEL_ALL_OF` branch this item maps to. |
| `assigned_officer_id` | UUID FK→users | Y | Clearance Officer (P01 assignee). |
| `status` | ENUM | N | `PENDING`,`CLEARED`,`DUES_OUTSTANDING`,`WAIVED`,`DEEMED_CLEARED`. |
| `sla_due_at` | TIMESTAMPTZ | Y | Per-branch SLA (P01 SLA runtime). |
| `escalation_tier` | ENUM | N | `NONE`,`OFFICER`,`DEPT_HEAD`,`AUTHORITY` (P01 escalation output). |
| `escalated_at` | TIMESTAMPTZ | Y | Last escalation time. |
| `forced_action_type` | ENUM | Y | `DEEMED_CLEARED` when Authority-granted (§5.5). |
| `forced_action_reason` | TEXT | Y | Mandatory when deemed (`VAL-COMMENT`, `ERR-G05-REASON-REQ`→`ERR-REASON-REQ`). |
| `forced_action_by` | UUID FK→users | Y | Granting Authority. |
| `dues_amount` | NUMERIC(14,2) | Y | INR (`VAL-CURRENCY`). |
| `dues_description` | TEXT | Y | |
| `remarks` | TEXT | Y | |
| `evidence_document_id` | UUID FK→documents (G13) | Y | |
| `cleared_at` | TIMESTAMPTZ | Y | |
| **Unique** | (`clearance_checklist_id`,`department_code`) | | |

#### 5.2.10 `charge_handovers` (under-protest)
| Field | Type | Null | Notes |
|---|---|---|---|
| `charge_handover_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK | N | |
| `phase` | ENUM | N | `HANDOVER_SOURCE`,`ASSUMPTION_DEST`. |
| `relinquishing_employee_id` | UUID FK→employees | Y | |
| `receiving_employee_id` | UUID FK→employees | Y | Successor / link officer / custody-of-office. |
| `charge_type` | ENUM | N | `FULL`,`ADDITIONAL`,`CURRENT_DUTIES`. |
| `handover_date` | DATE | N | |
| `assets_handed` | JSONB | Y | Inventory list w/ asset IDs. |
| `cash_imprest_amount` | NUMERIC(14,2) | Y | `VAL-CURRENCY`. |
| `pending_files_count` | INT | Y | |
| `handover_note_document_id` | UUID FK→documents (G13) | Y | |
| `status` | ENUM | N | `DRAFT`,`SUBMITTED`,`ACCEPTED`,`DISPUTED`,`UNDER_PROTEST`. |
| `under_protest` | BOOLEAN | N | Handover certified under protest (FR-G05-016). |
| `dispute_sla_due_at` | TIMESTAMPTZ | Y | Time-bound dispute deadline (P01 SLA / `JOB-G05-DISPUTE-SLA`). |
| `forced_action_type` | ENUM | Y | `HANDOVER_UNDER_PROTEST` when Authority-forced. |
| `forced_action_reason` | TEXT | Y | |
| `forced_action_by` | UUID FK→users | Y | |
| `accepted_by` | UUID FK→users | Y | |
| `accepted_at` | TIMESTAMPTZ | Y | |

#### 5.2.11 `relieving_orders` (deemed-relief, pay-continuity)
| Field | Type | Null | Notes |
|---|---|---|---|
| `relieving_order_id` | UUID PK | N | |
| `relieving_order_no` | VARCHAR(30) UNIQUE | N | Gapless (§5.2.18), e.g. `RO/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `employee_id` | UUID FK→employees | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `last_working_day` | DATE | N | `VAL-EFFECTIVE` (staged via `JOB-G05-EFFDATE`). |
| `relieving_time` | ENUM | N | `FORENOON`,`AFTERNOON` (load-bearing — §16.9). |
| `relieved` | BOOLEAN | N | |
| `deemed_relief` | BOOLEAN | N | True when Authority stand-relieved the employee (FR-G05-016). |
| `forced_action_reason` | TEXT | Y | Mandatory when `deemed_relief`. |
| `forced_action_by` | UUID FK→users | Y | |
| `pay_continuity_signalled` | BOOLEAN | N | G10 told to **continue** pay across handoff (not stop). |
| `lpc_requested` | BOOLEAN | N | Last Pay Certificate trigger to G10. |
| `relieving_order_document_id` | UUID FK→documents (G13) | Y | |
| `status` | ENUM | N | §5.5/§10. |
| `issued_by` | UUID FK→users | Y | |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | |

#### 5.2.12 `joining_reports` (joining sequence, continuity)
| Field | Type | Null | Notes |
|---|---|---|---|
| `joining_report_id` | UUID PK | N | |
| `joining_report_no` | VARCHAR(30) UNIQUE | N | Gapless, e.g. `JR/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `relieving_order_id` | UUID FK | Y | |
| `employee_id` | UUID FK→employees | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `reported_date` | DATE | N | Date employee physically reported. |
| `joining_date` | DATE | N | Confirmed date of joining (statutory; `VAL-EFFECTIVE`). |
| `joining_time` | ENUM | N | `FORENOON`,`AFTERNOON`. |
| `joining_sequence_no` | INT | Y | Inter-se order among same-cadre/post joiners on the date (FR-G05-021). |
| `inter_se_tiebreak_key` | VARCHAR(60) | Y | Deterministic tie-break (e.g. `service_no`); exposed to G06. |
| `transit_days` | INT | Y | Derived: joining_date − LWD − holidays (Holiday/Region master). |
| `transit_within_admissible` | BOOLEAN | Y | vs `joining_time_days`. |
| `service_continuity_asserted` | BOOLEAN | N | SR `JOINING` event asserts no break in qualifying service. |
| `charge_assumption_id` | UUID FK→charge_handovers | Y | |
| `pay_continuity_resumed` | BOOLEAN | N | G10 confirmed continuity at destination. |
| `joining_document_id` | UUID FK→documents (G13) | Y | |
| `status` | ENUM | N | §5.5/§10. |
| `verified_by` | UUID FK→users | Y | HR Destination. |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | |

#### 5.2.13 `deputation_records`
| Field | Type | Null | Notes |
|---|---|---|---|
| `deputation_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK | N | |
| `employee_id` | UUID FK→employees | N | |
| `borrowing_org_unit_id` | UUID FK→org_units | N | May be `EXTERNAL` type. |
| `lending_org_unit_id` | UUID FK→org_units | N | |
| `deputation_terms` | JSONB | Y | Pay protection, deputation allowance %, terms ref. |
| `start_date` | DATE | N | |
| `initial_tenure_months` | INT | N | |
| `current_end_date` | DATE | N | |
| `max_tenure_months` | INT | Y | Policy cap. |
| `extension_count` | INT | N | |
| `repatriation_due_date` | DATE | Y | |
| `repatriation_status` | ENUM | N | `ACTIVE`,`EXTENSION_REQUESTED`,`EXTENDED`,`REPATRIATION_DUE`,`REPATRIATED`. |

#### 5.2.14 `transfer_representations`
| Field | Type | Null | Notes |
|---|---|---|---|
| `representation_id` | UUID PK | N | |
| `representation_no` | VARCHAR(30) UNIQUE | N | e.g. `REP-2026-000045`. |
| `transfer_order_id` | UUID FK→transfer_orders | N | Order being contested/held. |
| `employee_id` | UUID FK→employees | N | |
| `representation_type` | ENUM | N | `REPRESENTATION`,`COURT_STAY`,`RETENTION_REQUEST`. |
| `filed_by` | ENUM | N | `EMPLOYEE`,`AUTHORITY`,`COURT`,`UNION`. |
| `authority_ref` | VARCHAR(120) | Y | Court/CAT case no. or representation reference. |
| `document_id` | UUID FK→documents (G13) | Y | Stay order / representation PDF. |
| `hold_from_stage` | ENUM | N | `PRE_RELIEF`,`PRE_JOIN`,`ANY`. |
| `status` | ENUM | N | `FILED`,`UNDER_REVIEW`,`HOLD_ACTIVE`,`UPHELD`,`REJECTED`,`VACATED`,`WITHDRAWN`. |
| `decision` | ENUM | Y | `ALLOW`,`DENY`,`MODIFY`,`VACATE`. |
| `decided_by` | UUID FK→users | Y | Transfer Authority (P01 approver). |
| `decided_at` | TIMESTAMPTZ | Y | |
| `valid_until` | DATE | Y | Stay validity. |
| `workflow_instance_id` | UUID FK→workflow_instances (P01) | Y | Decision flow. |

#### 5.2.15 `sr_outbox` (G04-style transactional outbox; frozen contract; dispatched on X.1/X.3)
| Field | Type | Null | Notes |
|---|---|---|---|
| `outbox_id` | UUID PK | N | |
| `aggregate_type` | ENUM | N | `TRANSFER_ORDER`,`RELIEVING_ORDER`,`JOINING_REPORT`. |
| `aggregate_id` | UUID | N | FK-by-convention to source row. |
| `target_system` | ENUM | N | `G12_SR`,`G10_PAYROLL`,`G01_MASTER`,`G09_DISCIPLINARY`. |
| `event_type` | ENUM | N | **G12 SR codes (verbatim from the G12 catalog):** `TRANSFER`,`RELIEVING`,`JOINING`,`MUTUAL_TRANSFER`,`TRANSFER_CANCELLED`,`RELIEVING_CANCELLED`,`JOINING_CANCELLED`. **Non-SR signal codes (G10/G01/G06/G09 targets):** `PAY_CONTINUITY`,`ENTITLEMENT`,`LPC_REQUEST`,`POSTING_UPDATE`,`LICENCE_FEE_RECOVERY`,`SENIORITY_FEED`,`DISCIPLINARY_TRIGGER`. (The invented `COMPENSATING` type is removed — corrections post a `*_CANCELLED` partner type with `is_reversal=true`.) |
| `payload` | JSONB | N | Event body (immutable once written). For `G12_SR` rows the payload is the **G12 ingest envelope**: dedup tuple `(source_module="G05", source_reference_id, source_event_version)`, **`fact_key`** (qualifying-service correlation, required), explicit `tenant_id`+`entity_id`, and for reversals `is_reversal=true`+`reverses_source_reference_id`. |
| `idempotency_key` | VARCHAR(120) UNIQUE | N | **Formula:** `{target_system}:{event_type}:{aggregate_type}:{aggregate_id}:{revision_no}` (e.g. `G12_SR:RELIEVING:TRANSFER_ORDER:<uuid>:0`). The HTTP `Idempotency-Key` header may carry this writer-local hash, but the **persisted dedup contract is the `(source_module, source_reference_id, source_event_version)` tuple** on the ingest payload. |
| `status` | ENUM | N | `PENDING`,`IN_FLIGHT`,`DELIVERED`,`FAILED`,`DEAD_LETTERED`. |
| `attempt_count` | INT | N | Default 0. |
| `max_attempts` | INT | N | Default 8 (exponential backoff; X.1 runner adds its own ×3 within each dispatch). |
| `next_attempt_at` | TIMESTAMPTZ | Y | Backoff schedule. |
| `last_error` | TEXT | Y | X.3 per-integration error mapping. |
| `delivered_at` | TIMESTAMPTZ | Y | |
| `dead_lettered_at` | TIMESTAMPTZ | Y | After `max_attempts`; surfaced in reconciliation. |
| `created_at` | TIMESTAMPTZ | N | Append-only (no soft delete). |
| **Retention** | dead-lettered rows retained ≥ **180 days** after resolution; delivered rows ≥ **90 days** then archived. | | |

> Dispatched by **`JOB-G05-OUTBOX`** on the **X.1 runner**; outbound delivery to G12/G10/G01/G09 uses **X.3** (circuit-breaking, idempotency, payload versioning). The outbox row is written in the **same DB transaction** as the local state change. **`G12_SR` rows relay to the canonical ledger write-port `POST /api/v1/sr/ingest`** (reversals to `POST /api/v1/sr/ingest/reversal`) — never a direct SR-table INSERT and never `/api/v1/sr/events`.

#### 5.2.16 `vacancy_reservations` (vacancy lifecycle)
| Field | Type | Null | Notes |
|---|---|---|---|
| `reservation_id` | UUID PK | N | |
| `vacancy_position_id` | UUID FK→vacancy_positions | N | |
| `transfer_order_id` | UUID FK→transfer_orders | Y | Set when allotment becomes an order. |
| `employee_id` | UUID FK→employees | N | Reserved for. |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `lifecycle_state` | ENUM | N | `RESERVED`,`VACATED_ON_RELIEF`,`FILLED_ON_JOIN`,`RELEASED`,`EXPIRED`. |
| `reserved_at` | TIMESTAMPTZ | N | |
| `vacated_at` | TIMESTAMPTZ | Y | Set when source employee relieved. |
| `filled_at` | TIMESTAMPTZ | Y | Set when destination employee joins. |
| **Unique** | (`vacancy_position_id`,`employee_id`,`drive_id`) | | |

#### 5.2.17 `order_acknowledgements` (proof-of-service)
| Field | Type | Null | Notes |
|---|---|---|---|
| `acknowledgement_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK→transfer_orders | N | |
| `employee_id` | UUID FK→employees | N | |
| `served_on_date` | DATE | N | Date order served. |
| `delivery_channel` | ENUM | N | `IN_APP`,`EMAIL`,`SMS`,`REGISTERED_POST`,`HAND_DELIVERY`,`PUBLISHED_NOTICE` (X.2 channels for IN_APP/EMAIL/SMS). |
| `served_by` | UUID FK→users | Y | HR officer serving (null for system channels). |
| `acknowledgement_status` | ENUM | N | `SERVED`,`ACKNOWLEDGED`,`DEEMED_SERVED`,`REFUSED`. |
| `acknowledged_at` | TIMESTAMPTZ | Y | Employee acknowledgement. |
| `deemed_served_reason` | TEXT | Y | When `DEEMED_SERVED` (registered-post returned, published notice); `JOB-G05-SERVE-DEEM`. |
| `proof_document_id` | UUID FK→documents (G13) | Y | Postal receipt / acknowledgement scan. |

#### 5.2.18 `order_number_sequences` (gapless numbering)
| Field | Type | Null | Notes |
|---|---|---|---|
| `sequence_id` | UUID PK | N | |
| `sequence_scope` | ENUM | N | `TRANSFER_ORDER`,`RELIEVING_ORDER`,`JOINING_REPORT`,`CLEARANCE`,`REPRESENTATION`. |
| `office_org_unit_id` | UUID FK→org_units | N | Per-office. |
| `fiscal_year` | INT | N | Per-year (e.g. 2026). |
| `next_value` | BIGINT | N | Reserve-then-commit counter (row-locked). |
| `reserved_high_water` | BIGINT | N | Highest reserved (may exceed committed). |
| `prefix_template` | VARCHAR(40) | N | e.g. `TO/{yyyy}/{mm}/{seq:04d}`. |
| `gap_audit_last_run` | TIMESTAMPTZ | Y | Last `JOB-G05-GAPAUDIT` run. |
| **Unique** | (`sequence_scope`,`office_org_unit_id`,`fiscal_year`) | | |

#### 5.2.19 `counselling_sessions` (interactive allotment)
| Field | Type | Null | Notes |
|---|---|---|---|
| `session_id` | UUID PK | N | |
| `session_code` | VARCHAR(30) UNIQUE | N | e.g. `CNS-2026-ANNUAL-01`. |
| `drive_id` | UUID FK→transfer_drives | N | `drive_type=COUNSELLING`. |
| `scheduled_at` | TIMESTAMPTZ | N | |
| `turn_order_method` | ENUM | N | `SENIORITY`,`MERIT`. |
| `current_turn_employee_id` | UUID FK→employees | Y | Whose turn is live (holds vacancy lock). |
| `current_turn_started_at` | TIMESTAMPTZ | Y | |
| `turn_timeout_seconds` | INT | N | Auto-pass on timeout (`JOB-G05-COUNSEL-TIMEOUT`). |
| `status` | ENUM | N | `SCHEDULED`,`IN_PROGRESS`,`PAUSED`,`COMPLETED`,`CANCELLED`. |
| `presiding_officer_id` | UUID FK→users | N | Transfer Authority/HR Admin. |
| `total_candidates`/`completed_candidates` | INT | N | |

#### 5.2.20 `counselling_choices` (immutable choice log; append-only on P05 substrate)
| Field | Type | Null | Notes |
|---|---|---|---|
| `choice_id` | UUID PK | N | Append-only (no update/delete). |
| `session_id` | UUID FK→counselling_sessions | N | |
| `employee_id` | UUID FK→employees | N | |
| `turn_position` | INT | N | Order called. |
| `vacancy_position_id` | UUID FK→vacancy_positions | Y | Chosen vacancy (null if passed/declined). |
| `choice_action` | ENUM | N | `CHOSEN`,`PASSED`,`DECLINED`,`AUTO_PASS_TIMEOUT`,`ABSENT`. |
| `choice_made_at` | TIMESTAMPTZ | N | |
| `recorded_by` | UUID FK→users | N | Presiding officer (observed record). |
| `remarks` | TEXT | Y | |
| `created_at` | TIMESTAMPTZ | N | Immutable (P05-captured; never soft-deleted). |
| **Unique** | (`session_id`,`employee_id`,`turn_position`) | | |

#### 5.2.21 `quarter_allotments` (estate retention)
| Field | Type | Null | Notes |
|---|---|---|---|
| `quarter_allotment_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `transfer_order_id` | UUID FK→transfer_orders | Y | The transfer occasioning retention. |
| `quarter_ref` | VARCHAR(60) | N | Accommodation identifier. |
| `org_unit_id` | UUID FK→org_units | N | Estate-owning office. |
| `retention_allowed` | BOOLEAN | N | Authority-approved retention. |
| `retention_status` | ENUM | N | `OCCUPIED`,`RETENTION_REQUESTED`,`RETENTION_APPROVED`,`VACATION_DUE`,`VACATED`,`OVERSTAY`. |
| `vacate_by_date` | DATE | Y | Statutory vacation deadline. |
| `vacated_on` | DATE | Y | |
| `licence_fee_rate` | NUMERIC(14,2) | Y | INR per month (normal/penal; `VAL-CURRENCY`). |
| `penal_rate_applies` | BOOLEAN | N | After permissible retention (`JOB-G05-QTR-OVERSTAY`). |
| `licence_fee_recovery_ref` | VARCHAR(60) | Y | G10 recovery signal reference. |

### 5.3 Relationship map
```
employees (G01) 1───* transfer_requests *───1 transfer_orders 1───1 relieving_orders
                                   │                  │                   │
                                   │                  ├──1 order_acknowledgements (proof-of-service)
                                   │                  ├──* transfer_representations (holds)
                                   │                  ├──1 clearance_checklists 1───* clearance_items (P01 PARALLEL_ALL_OF branches; SLA/deemed)
                                   │                  ├──* charge_handovers (source + dest, under-protest)
                                   │                  ├──1 joining_reports (joining_sequence_no)
                                   │                  ├──0..1 deputation_records
                                   │                  ├──0..1 quarter_allotments (estate retention)
                                   │                  └──1 in_transit_custody_org_unit (custody during transit)
transfer_orders 1───* sr_outbox (G12/G10/G01/G09 signals, idempotent; dispatched X.1/X.3)
transfer_drives 1───* transfer_preferences *───1 employees
transfer_drives 1───0..1 counselling_sessions 1───* counselling_choices (immutable, P05)
transfer_drives 1───* vacancy_positions 1───* vacancy_reservations (lifecycle: reserved→vacated→filled)
order_number_sequences ──(reserve-then-commit)──> transfer_orders / relieving_orders / joining_reports
transfer_orders.mutual_pair_order_id ──(paired-progress guard)── transfer_orders
ALL approvals ──> P01 workflow_instances/workflow_actions ; ALL mutations ──> P05 audit_log (DB-trigger)
ALL documents ──> G13 ; ALL notifications ──> X.2/W.3 ; ALL SR events ──> G12 (via sr_outbox)
```

### 5.4 Ownership / reuse matrix
| Entity | Owner | G05 access | Notes |
|---|---|---|---|
| `employees`, **`org_units` placement**, `designations` | **G01 / P04** | Read; Update (`org_units`, designation, employment_status) on join | Update only via G01 API/service; org model not forked. |
| **Sanctioned strength / seniority** | **G06/G01** | **Read-through (cached)** | G05 never authoritative; reconciliation job refreshes `vacancy_positions` caches. |
| `service_register_events` | **G12** (on P05 substrate) | Append (write) via `sr_outbox` | SR ledger; G05 is a writer, not owner. |
| `documents` | **G13** | Create/Read references; **sensitive document class** for medical/spouse/compassionate | |
| Holiday & Region master (working-day calendar) | **Org Admin Master Data** | Read | Regional-aware; no silent fallback. |
| `notifications` / templates | **X.2 / W.3** | Write (by `MSG-G05-*` id) | |
| `audit_log` / `security_audit_log` | **P05** | DB-trigger capture (no private log) | |
| `workflows` / `workflow_instances` / `workflow_actions` | **P01** | Start/advance/approve via service contract | |
| All `transfer_*`,`clearance_*`,`charge_*`,`relieving_*`,`joining_*`,`deputation_*`,`vacancy_*`,`sr_outbox`,`counselling_*`,`quarter_allotments`,`order_*` | **G05** | Full CRUD | System of record (net-new gov). |

### 5.5 Enum & reference catalog

**Canonical taxonomy note** — three **orthogonal axes** (resolves enum redundancy):
- **`transfer_type` = the mechanism** by which mobility occurs.
- **`ground` = the justification** for it.
- **`priority_category` = the statutory protection** the employee holds.
A request carries one value on each axis. `TRANSFER_ON_REQUEST` is **collapsed** into `transfer_type=REQUEST` (the "on request" sense is conveyed by `request_origin=SELF`). All enums validated via `VAL-ENUM`.

| Enum | Values |
|---|---|
| `transfer_type` (mechanism) | `REQUEST`, `ADMINISTRATIVE`, `MUTUAL`, `DEPUTATION`, `PROMOTION_LINKED`, `COMPASSIONATE` |
| `ground` (justification) | `SPOUSE`, `MEDICAL`, `ADMINISTRATIVE`, `OWN_REQUEST`, `PROMOTION`, `DEPUTATION`, `COMPASSIONATE`, `OTHER` |
| `priority_category` (protection) | `PROTECTED_SPOUSE`, `MEDICAL`, `DIFFERENTLY_ABLED`, `NEAR_RETIREMENT`, `SINGLE_PARENT`, `NONE` |
| `order_class` | `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION` |
| `transfer_request.status` | `DRAFT`,`SUBMITTED`,`ELIGIBILITY_CHECK`,`RECOMMENDED`,`APPROVED`,`REJECTED`,`WITHDRAWN`,`ORDER_ISSUED`,`CANCELLED` |
| `transfer_order.status` | `DRAFT`,`PENDING_APPROVAL`,`APPROVED`,`PUBLISHED`,`SERVED`,`STAY_HOLD`,`RELIEVING_IN_PROGRESS`,`RELIEVED`,`IN_TRANSIT`,`JOINED`,`REVERTED_TO_SOURCE`,`ABANDONED`,`AMENDED`,`CANCELLED`,`REVOKED` |
| `relieving_order.status` | `DRAFT`,`PENDING_CLEARANCE`,`PENDING_APPROVAL`,`ISSUED`,`RELIEVED`,`DEEMED_RELIEVED`,`CANCELLED` |
| `joining_report.status` | `DRAFT`,`SUBMITTED`,`UNDER_VERIFICATION`,`JOINED_CONFIRMED`,`REJECTED`,`LATE_JOINING_REVIEW`,`ABANDONED` |
| `clearance_item.status` | `PENDING`,`CLEARED`,`DUES_OUTSTANDING`,`WAIVED`,`DEEMED_CLEARED` |
| `escalation_tier` | `NONE`,`OFFICER`,`DEPT_HEAD`,`AUTHORITY` |
| `forced_action_type` | `DEEMED_CLEARED`,`HANDOVER_UNDER_PROTEST`,`DEEMED_RELIEF` |
| `representation_type` | `REPRESENTATION`,`COURT_STAY`,`RETENTION_REQUEST` |
| `representation.status` | `FILED`,`UNDER_REVIEW`,`HOLD_ACTIVE`,`UPHELD`,`REJECTED`,`VACATED`,`WITHDRAWN` |
| `sr_outbox.status` | `PENDING`,`IN_FLIGHT`,`DELIVERED`,`FAILED`,`DEAD_LETTERED` |
| `sr_outbox.target_system` | `G12_SR`,`G10_PAYROLL`,`G01_MASTER`,`G09_DISCIPLINARY` |
| `vacancy_reservation.lifecycle_state` | `RESERVED`,`VACATED_ON_RELIEF`,`FILLED_ON_JOIN`,`RELEASED`,`EXPIRED` |
| `counselling_session.status` | `SCHEDULED`,`IN_PROGRESS`,`PAUSED`,`COMPLETED`,`CANCELLED` |
| `counselling_choice.choice_action` | `CHOSEN`,`PASSED`,`DECLINED`,`AUTO_PASS_TIMEOUT`,`ABSENT` |
| `quarter.retention_status` | `OCCUPIED`,`RETENTION_REQUESTED`,`RETENTION_APPROVED`,`VACATION_DUE`,`VACATED`,`OVERSTAY` |
| `order_acknowledgement.status` | `SERVED`,`ACKNOWLEDGED`,`DEEMED_SERVED`,`REFUSED` |
| `joining_distance_band` | `LOCAL`,`SHORT`,`MEDIUM`,`LONG`,`OUTSTATION` |
| `enforcement` | `HARD_BLOCK`,`SOFT_WARN`,`REQUIRE_OVERRIDE` |
| `repatriation_status` | `ACTIVE`,`EXTENSION_REQUESTED`,`EXTENDED`,`REPATRIATION_DUE`,`REPATRIATED` |
| `employment_status` (G01) | `ACTIVE`,`ON_LEAVE`,`SUSPENDED`,`TRANSFERRED`,`RETIRED`,`RESIGNED`,`DECEASED`,`TERMINATED` |

### 5.6 Data integrity rules
1. **One active SUBSTANTIVE transition per employee:** an employee may have only one `transfer_order` with `order_class=SUBSTANTIVE` in a non-terminal status (`PUBLISHED`→`JOINED`) at a time. `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION` may co-exist; a second **substantive** issuance is **`409 CONFLICT` / `ERR-G05-ACTIVE-TRANSFER`**.
2. **Relieving precondition:** a `relieving_order` may reach `ISSUED` only if its `clearance_checklist.status ∈ {CLEARED, CLEARED_WITH_DUES, CLEARED_WITH_DEEMED}` and `has_outstanding_dues` either false or `dues_recovery_ref` present — **or** a `deemed_relief` forced action is recorded (FR-G05-016). Violation **`412 PRECONDITION_FAILED` / `ERR-G05-CLEARANCE-INCOMPLETE`**.
3. **Joining precondition:** a `joining_report` may reach `JOINED_CONFIRMED` only if linked `transfer_order.status = IN_TRANSIT` — except `JOINING_WITHOUT_RELIEF` exceptions explicitly flagged. Violation **`409 CONFLICT` / `ERR-G05-NOT-IN-TRANSIT`**.
4. **Date monotonicity:** `order_date ≤ served_on_date ≤ relieve_by_date`; `last_working_day ≥ served_on_date`; `joining_date ≥ last_working_day`; `repatriation_due_date ≥ start_date`; `vacate_by_date ≥ last_working_day` (`VAL-DATE`/`VAL-EFFECTIVE`).
5. **Mutual symmetry & coupling:** a `MUTUAL` request requires a reciprocal request linking `mutual_counterpart_employee_id`; both orders are approved/published **atomically as a pair**, and **relieving and joining are paired-progress guarded**; asymmetric completion is **`409 CONFLICT` / `ERR-G05-MUTUAL-PAIR`**.
6. **Vacancy lifecycle:** `RESERVED → VACATED_ON_RELIEF → FILLED_ON_JOIN`. Allotment requires `vacant_count > 0` **and a transactional re-check at join time**; double-fill is **`409 CONFLICT` / `ERR-G05-VACANCY-FULL`**.
7. **Maker ≠ checker & transferee exclusion:** enforced by **P01/P02** on every approval/clearance/forced-action write; the Authority exercising a forced action is recorded and may not be the transferee.
8. **SR posting completeness via outbox:** on each of order-publish, relieve, and join, exactly one corresponding `sr_outbox` row (idempotency-key unique) must reach `DELIVERED` to **G12**; failures retried by `JOB-G05-OUTBOX`, dead-lettered after `max_attempts`, surfaced (FR-G05-012).
9. **No orphan clearance:** `clearance_items` exist only with a parent `clearance_checklist`; only **configured** departments generate items/branches.
10. **SR/append-only immutability:** soft delete is never applied to records posted to G12, to `sr_outbox`, or to `counselling_choices`; such records are cancelled/revoked/compensated with reason, not deleted (consistent with P05 immutability + Platform §8.2 no-hard-delete).
11. **Service continuity:** between `last_working_day` and `joining_date` pay is **continuous** (a single `PAY_CONTINUITY` signal to G10, not stop+start); SR `RELIEVED`/`JOINED` carry `service_continuity_asserted=true` unless an explicit break (abandonment) is recorded.
12. **In-transit custody (no dual/zero posting):** while `IN_TRANSIT`, exactly one `in_transit_custody_org_unit_id` is set; G01 `org_units` remains source until join; headcount counts the employee **once** against the custodian; null/two custodians is **`409 CONFLICT` / `ERR-G05-DUAL-POSTING`**.
13. **Strength read-through:** `vacancy_positions` caches carry `strength_as_of`; never written by transactional flows, only by the reconciliation job; allotment reads live where possible, falls back to cache with a staleness flag.
14. **Joining-sequence integrity:** concurrent same-cadre/same-post joinings on a date receive distinct `joining_sequence_no` ordered by `reported_date`/`joining_time` then deterministic `inter_se_tiebreak_key` (`service_no`); unique per (`dest_org_unit_id`,`dest_designation_id`,`joining_date`); exposed to G06.
15. **Proof-of-service precedence:** `relieve_by_date` enforcement references `served_on_date` (or `DEEMED_SERVED`), never `order_date`; an order may not enter `RELIEVING_IN_PROGRESS` without a `SERVED`/`DEEMED_SERVED`/`ACKNOWLEDGED` row — else **`409 CONFLICT` / `ERR-G05-NOT-SERVED`**.
16. **Hold supremacy:** an active `STAY_HOLD` (`representation.status=HOLD_ACTIVE`) blocks all forward transitions until vacated (**`409 CONFLICT` / `ERR-G05-STAY-HOLD`**); `hold_active=true` mirrors this on `transfer_orders`.
17. **Gapless numbering:** statutory numbers issued via reserve-then-commit on `order_number_sequences` per (`scope`,`office`,`fiscal_year`); a reserved-but-uncommitted number is committed or explicitly voided with an audit row; `JOB-G05-GAPAUDIT` shows zero unexplained gaps. Contention returns **`409 CONFLICT` / `ERR-G05-NUMBER-LOCKED`** (retry).

### 5.7 Sample data (2–3 rows per module entity)

**transfer_requests**
| request_no | employee_id | transfer_type | request_origin | source→dest | ground | priority_category | sensitive_ground | status |
|---|---|---|---|---|---|---|---|---|
| TRQ-2026-000123 | …a1 | REQUEST | SELF | OU-DIST-A → OU-DIST-B | SPOUSE | PROTECTED_SPOUSE | true | RECOMMENDED |
| TRQ-2026-000124 | …b2 | MUTUAL | SELF | OU-DIST-B → OU-DIST-A | OWN_REQUEST | NONE | false | RECOMMENDED |
| TRQ-2026-000130 | …c3 | ADMINISTRATIVE | ADMIN | OU-HQ → OU-DIST-C | ADMINISTRATIVE | NONE | false | APPROVED |

**transfer_orders**
| order_no | order_class | employee_id | transfer_type | source→dest | served_on_date | relieve_by_date | in_transit_custody | status | rev |
|---|---|---|---|---|---|---|---|---|---|
| TO/2026/04/0456 | SUBSTANTIVE | …c3 | ADMINISTRATIVE | OU-HQ → OU-DIST-C | 2026-04-03 | 2026-04-13 | OU-DIST-C | JOINED | 0 |
| TO/2026/04/0457 | SUBSTANTIVE | …a1 | REQUEST | OU-DIST-A → OU-DIST-B | 2026-04-06 | 2026-04-21 | OU-DIST-B | IN_TRANSIT | 0 |
| TO/2026/05/0501 | DEPUTATION | …d4 | DEPUTATION | OU-HQ → OU-EXT-PSU1 | 2026-05-02 | 2026-05-16 | OU-EXT-PSU1 | STAY_HOLD | 0 |

**transfer_policy_rules**
| rule_code | rule_type | scope_cadre | param_value | enforcement | is_active |
|---|---|---|---|---|---|
| MIN_TENURE_MONTHS | MIN_TENURE | NULL | {"months":36} | HARD_BLOCK | true |
| NEAR_RETIREMENT_PROTECT | PROTECTED_CATEGORY | NULL | {"months_to_retire":24} | REQUIRE_OVERRIDE | true |
| JOINING_TIME_PAY_OWNREQ | JOINING_TIME_PAY | NULL | {"admin":true,"own_request":false} | SOFT_WARN | true |

**transfer_ban_periods**
| title | ban_type | start_date | end_date | exception_grounds | is_active |
|---|---|---|---|---|---|
| MCC General Election 2026 | ELECTION_MCC | 2026-03-15 | 2026-05-30 | {MEDICAL,COMPASSIONATE} | true |
| Annual Budget Session | BUDGET | 2026-02-01 | 2026-02-28 | {} | false |

**transfer_drives**
| drive_code | title | cadre | drive_type | allotment_method | status | total_positions |
|---|---|---|---|---|---|---|
| DRIVE-2026-ANNUAL | Annual Teacher Transfer 2026 | TEACHING | COUNSELLING | COUNSELLING | COUNSELLING | 1200 |
| DRIVE-2026-CLERK | Ministerial Cadre Drive | MINISTERIAL | SENIORITY | ALLOTTED | 340 | 340 |

**transfer_preferences**
| drive_id | employee_id | preference_rank | preferred_org_unit_id | allotted | seniority_score |
|---|---|---|---|---|---|
| DRIVE-2026-ANNUAL | …a1 | 1 | OU-DIST-B | true | 845.250 |
| DRIVE-2026-ANNUAL | …a1 | 2 | OU-DIST-D | false | 845.250 |
| DRIVE-2026-ANNUAL | …e5 | 1 | OU-DIST-B | false | 712.000 |

**vacancy_positions** (read-through caches)
| org_unit_id | designation_id | cadre | sanctioned_strength_cached | filled_count_cached | reserved_count | strength_source | strength_as_of | is_published |
|---|---|---|---|---|---|---|---|---|
| OU-DIST-B | DSG-TEACHER | TEACHING | 50 | 47 | 2 | G06 | 2026-04-01T06:00Z | true |
| OU-DIST-C | DSG-CLERK | MINISTERIAL | 20 | 20 | 0 | G06 | 2026-04-01T06:00Z | true |

**clearance_checklists**
| checklist_no | transfer_order_id | source_org_unit_id | status | total_items | cleared_items | deemed_items | has_outstanding_dues |
|---|---|---|---|---|---|---|---|
| NOD-2026-000789 | TO/2026/04/0456 | OU-HQ | CLEARED | 6 | 6 | 0 | false |
| NOD-2026-000790 | TO/2026/04/0457 | OU-DIST-A | CLEARED_WITH_DEEMED | 6 | 5 | 1 | true |

**clearance_items** (P01 parallel branches; SLA/deemed)
| checklist_no | department_code | status | sla_due_at | escalation_tier | forced_action_type | dues_amount | dues_description |
|---|---|---|---|---|---|---|---|
| NOD-2026-000790 | IT | DEEMED_CLEARED | 2026-04-09T10:00Z | AUTHORITY | DEEMED_CLEARED | 0.00 | Officer non-responsive; Authority deemed |
| NOD-2026-000790 | ADVANCES | DUES_OUTSTANDING | 2026-04-09T10:00Z | DEPT_HEAD | NULL | 18500.00 | Festival advance balance |
| NOD-2026-000789 | LIBRARY | CLEARED | 2026-04-08T10:00Z | NONE | NULL | NULL | NULL |

**charge_handovers** (under-protest)
| transfer_order_id | phase | charge_type | handover_date | cash_imprest_amount | under_protest | status |
|---|---|---|---|---|---|---|
| TO/2026/04/0456 | HANDOVER_SOURCE | FULL | 2026-04-10 | 5000.00 | false | ACCEPTED |
| TO/2026/04/0457 | HANDOVER_SOURCE | FULL | 2026-04-13 | 0.00 | true | UNDER_PROTEST |
| TO/2026/04/0456 | ASSUMPTION_DEST | FULL | 2026-04-15 | 0.00 | false | ACCEPTED |

**relieving_orders** (pay-continuity/deemed)
| relieving_order_no | transfer_order_id | last_working_day | relieving_time | relieved | deemed_relief | pay_continuity_signalled | status |
|---|---|---|---|---|---|---|---|
| RO/2026/04/0456 | TO/2026/04/0456 | 2026-04-10 | AFTERNOON | true | false | true | RELIEVED |
| RO/2026/04/0457 | TO/2026/04/0457 | 2026-04-14 | AFTERNOON | true | true | true | DEEMED_RELIEVED |

**joining_reports** (joining sequence)
| joining_report_no | transfer_order_id | reported_date | joining_date | joining_sequence_no | inter_se_tiebreak_key | transit_days | service_continuity_asserted | status |
|---|---|---|---|---|---|---|---|---|
| JR/2026/04/0456 | TO/2026/04/0456 | 2026-04-15 | 2026-04-15 | 1 | EMP-000456 | 4 | true | JOINED_CONFIRMED |
| JR/2026/04/0457 | TO/2026/04/0457 | 2026-04-22 | 2026-04-22 | 2 | EMP-000457 | 7 | true | UNDER_VERIFICATION |

**deputation_records**
| transfer_order_id | borrowing_org_unit_id | start_date | initial_tenure_months | current_end_date | repatriation_status |
|---|---|---|---|---|---|
| TO/2026/05/0501 | OU-EXT-PSU1 | 2026-05-16 | 36 | 2029-05-15 | ACTIVE |

**transfer_representations**
| representation_no | transfer_order_id | representation_type | filed_by | authority_ref | status | decision |
|---|---|---|---|---|---|---|
| REP-2026-000045 | TO/2026/05/0501 | COURT_STAY | COURT | CAT/HYD/445/2026 | HOLD_ACTIVE | NULL |
| REP-2026-000046 | TO/2026/04/0457 | RETENTION_REQUEST | EMPLOYEE | — | REJECTED | DENY |

**sr_outbox**
| aggregate_type | target_system | event_type | idempotency_key | status | attempt_count |
|---|---|---|---|---|---|
| TRANSFER_ORDER | G12_SR | TRANSFER | G12_SR:TRANSFER:TRANSFER_ORDER:…0456:0 | DELIVERED | 1 |
| RELIEVING_ORDER | G10_PAYROLL | PAY_CONTINUITY | G10_PAYROLL:PAY_CONTINUITY:RELIEVING_ORDER:…0457:0 | PENDING | 0 |
| JOINING_REPORT | G01_MASTER | POSTING_UPDATE | G01_MASTER:POSTING_UPDATE:JOINING_REPORT:…0456:0 | DELIVERED | 2 |

**vacancy_reservations**
| vacancy_position_id | transfer_order_id | employee_id | lifecycle_state | vacated_at | filled_at |
|---|---|---|---|---|---|
| VP-DIST-B-01 | TO/2026/04/0457 | …a1 | VACATED_ON_RELIEF | 2026-04-14 | NULL |
| VP-DIST-C-01 | TO/2026/04/0456 | …c3 | FILLED_ON_JOIN | 2026-04-10 | 2026-04-15 |

**order_acknowledgements**
| transfer_order_id | served_on_date | delivery_channel | acknowledgement_status | acknowledged_at |
|---|---|---|---|---|
| TO/2026/04/0456 | 2026-04-03 | IN_APP | ACKNOWLEDGED | 2026-04-03T11:20Z |
| TO/2026/04/0457 | 2026-04-06 | REGISTERED_POST | DEEMED_SERVED | NULL |

**order_number_sequences**
| sequence_scope | office_org_unit_id | fiscal_year | next_value | prefix_template |
|---|---|---|---|---|
| TRANSFER_ORDER | OU-HQ | 2026 | 0502 | TO/{yyyy}/{mm}/{seq:04d} |
| RELIEVING_ORDER | OU-DIST-A | 2026 | 0458 | RO/{yyyy}/{mm}/{seq:04d} |

**counselling_sessions**
| session_code | drive_id | turn_order_method | status | total_candidates | completed_candidates |
|---|---|---|---|---|---|
| CNS-2026-ANNUAL-01 | DRIVE-2026-ANNUAL | SENIORITY | IN_PROGRESS | 120 | 47 |
| CNS-2026-ANNUAL-02 | DRIVE-2026-ANNUAL | SENIORITY | SCHEDULED | 118 | 0 |

**counselling_choices** (immutable)
| session_id | employee_id | turn_position | vacancy_position_id | choice_action | choice_made_at |
|---|---|---|---|---|---|
| CNS-…01 | …a1 | 12 | VP-DIST-B-01 | CHOSEN | 2026-03-20T10:14Z |
| CNS-…01 | …e5 | 13 | NULL | PASSED | 2026-03-20T10:17Z |

**quarter_allotments**
| employee_id | transfer_order_id | quarter_ref | retention_status | vacate_by_date | penal_rate_applies | licence_fee_recovery_ref |
|---|---|---|---|---|---|---|
| …a1 | TO/2026/04/0457 | QTR-A-204 | RETENTION_APPROVED | 2026-07-14 | false | NULL |
| …c3 | TO/2026/04/0456 | QTR-HQ-12 | OVERSTAY | 2026-05-15 | true | LFR-2026-0012 |

---

## 6. Functional Requirements

> Each FR uses: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design. **22 FRs.** All approvals run on **P01**, all authz on **P02**, all audit on **P05**, all external signals via the **`sr_outbox` on X.1/X.3**, all documents in **G13**, all notifications via **X.2/W.3**.

### FR-G05-001 — Transfer Request Initiation (all types)
- **Module:** G05 · Initiation
- **Primary Role(s):** Employee (Transferee), Reporting Manager, HR Officer, HR Admin
- **User Story:** *As an employee or HR officer, I want to initiate a transfer request of any type so that mobility is captured in a structured, auditable way before an order is issued.*
- **Description:** Unified intake (a **W.2 form** referencing `VAL-*`/`VAL-G05-*`) for all `transfer_type` values. Self-service employees raise `REQUEST`/`MUTUAL`/`COMPASSIONATE` (Me workspace); managers endorse for reports (My Team); HR Admin raises `ADMINISTRATIVE`; the system raises `PROMOTION_LINKED` from a G06 trigger. Captures source, requested destination, ground, supporting documents (G13), **sensitive-ground documents into the G13 sensitive document class**, priority category, and requested effective date (`VAL-EFFECTIVE`). On submission it runs the eligibility/policy engine (FR-G05-002) and routes via **P01 `startInstance`**. Uses the **canonical orthogonal taxonomy** (§5.5).
- **Acceptance Criteria:**
  1. A request can be created in `DRAFT` and edited until `SUBMITTED`.
  2. `transfer_type` and `request_origin` mandatory (`VAL-REQUIRED`); combinations validated (`MUTUAL` requires `mutual_counterpart_employee_id`).
  3. On submit, an eligibility check runs, result stored in `eligibility_result`; a `HARD_BLOCK` prevents submission with a clear reason (`ERR-G05-ELIGIBILITY-BLOCKED`).
  4. A unique `request_no` is generated on first submission (`VAL-MASTER-UNIQUE`).
  5. Documents for `MEDICAL`/`SPOUSE`/`COMPASSIONATE` grounds are mandatory and stored in G13 **with the sensitive class; `sensitive_ground=true` set and access is logged (P05)**.
  6. Every create/submit is captured by the **P05 trigger**; on submit a **P01 `workflow_instance`** is created (idempotent via `Idempotency-Key`; duplicate → `409`/`ERR-DUP-INSTANCE`).
- **Business Rules:** Employee origin → self only; manager → direct reports; HR Admin → org scope (P02). Promotion-linked requests are system-originated, read-only to employees. A transferee with an active **substantive** order is blocked (5.6-1).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | `transfer_requests` | Create/update primary record |
  | `employees`/`org_units` (G01) | Validate transferee, source office |
  | `documents` (G13) | Supporting + **sensitive-class** evidence |
  | `workflow_instances` (P01) / `audit_log` (P05) | Routing + trail |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/requests` *(Idempotency-Key)* |
  | PATCH | `/api/v1/transfers/requests/{id}` |
  | POST | `/api/v1/transfers/requests/{id}/submit` *(Idempotency-Key)* |
  | GET | `/api/v1/transfers/requests?status=&type=&cursor=` |
- **UI Behavior Notes:** W.2 multi-step wizard type selector → details → grounds & documents (sensitive uploads visibly marked restricted) → review. Inline eligibility banner (green/amber/red). Mutual flow shows counterpart search & reciprocal-link confirmation. Five canonical UI states.
- **Edge Cases:** Counterpart not found/ineligible; duplicate active substantive request; sensitive-document upload failure (request stays DRAFT); promotion trigger for an employee already in transit.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferRequestWizard` (W.2), `TransferRequestController`, `TransferRequestService`, `EligibilityClient`, `SensitiveDocClient(G13)` |
  | Backend Flow | Validate role-scope (P02) → persist DRAFT → on submit call EligibilityService → if not HARD_BLOCK, generate `request_no`, set `SUBMITTED`, `WorkflowEngine.startInstance` |
  | Data Operations | INSERT/UPDATE `transfer_requests`; INSERT P01 `workflow_instances` (single txn); sensitive docs tagged restricted; P05 trigger captures all |
  | Validation | Type/origin matrix; mandatory sensitive-ground docs (`VAL-FILE`); date ≥ today (`VAL-EFFECTIVE`); mutual symmetry |
  | Authorization | P02 self/team/org scope; sensitive-ground read gated + access-logged |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ELIGIBILITY_CHECK`; notify recommender (X.2) |
  | Failure Handling | Eligibility upstream down → save DRAFT, block submit (X.3 error map → `500`/`ERR-LOADFAIL`); sensitive doc fail rolls back submit |
  | Dependencies | FR-G05-002, G01, G13, P01, G06 |
  | Test Guidance | Type/origin matrix; submit→P01 instance; active-substantive block; missing sensitive doc; sensitive access-log assertion |

### FR-G05-002 — Transfer Policy & Eligibility Validation
- **Module:** G05 · Policy & Eligibility
- **Primary Role(s):** System (engine), HR Admin, Transfer Authority
- **User Story:** *As the organisation, I want every transfer evaluated against tenure, ban-window, protected-category and sanctioned-strength policy so that no order violates statutory transfer rules.*
- **Description:** Gov rules engine (`VAL-G05-ELIG`) evaluating a candidate request/order against `transfer_policy_rules` and `transfer_ban_periods` (versioned config, cascade platform→tenant→entity). Produces per-rule verdicts (`PASS`/`WARN`/`BLOCK`/`OVERRIDE_REQUIRED`) and an aggregate (most-restrictive wins). **Sanctioned-strength is read-through from G06/G01**, not a local store. Overrides gated to Transfer Authority (P02) with mandatory justification, captured by the P05 trigger so compliance metrics measure **un-overridden** violations.
- **Acceptance Criteria:**
  1. Engine returns itemised `rule_code`, verdict, message per evaluated rule.
  2. Minimum-tenure computed from current-post DOJ (last `JOINED` order or G01 posting date).
  3. Ban-window check is date-range and org-scope aware, honouring `exception_grounds` (`ERR-G05-BAN-WINDOW`).
  4. Sanctioned-strength check blocks allotment when **read-through** `vacant_count = 0`.
  5. Overrides require Transfer Authority (P02) + justification, captured by P05 and in `eligibility_result`; queryable for the "0% un-overridden violation" KPI.
  6. Engine idempotent and re-runnable; latest result cached.
- **Business Rules:** Protected `MEDICAL`/`SPOUSE`/`COMPASSIONATE` bypass bans only when listed in `exception_grounds`. Near-retirement requires override even for admin transfers. Cooling period triggers `SOFT_WARN`/`BLOCK` per config.
- **Data Model References:** `transfer_policy_rules`, `transfer_ban_periods`, `transfer_requests.eligibility_result`, `employees` (G01), `vacancy_positions` (read-through), G06 strength service.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/eligibility/evaluate` |
  | POST | `/api/v1/transfers/requests/{id}/override` |
  | GET | `/api/v1/transfers/policy-rules?cursor=` |
- **UI Behavior Notes:** Eligibility panel per-rule icon + message; override modal (Authority only, P02) demands justification ≥ 20 chars (`VAL-COMMENT`/`ERR-REASON-REQ`); strength shown with freshness/`strength_as_of` badge.
- **Edge Cases:** Conflicting rules (most restrictive wins); no current-post date (fallback G01 DOJ); overlapping bans; rule effective-date boundaries; **strength service stale/unavailable → SOFT_WARN with staleness flag**.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `EligibilityService`, `PolicyRuleRepository`, `BanPeriodRepository`, `StrengthReadClient(G06)`, `OverrideController` |
  | Backend Flow | Load active rules in scope → evaluate each → aggregate → persist; strength via read-through |
  | Data Operations | SELECT rules/bans; read-through strength; UPDATE `eligibility_result`; override captured by P05 trigger |
  | Validation | Date math; scope precedence; override role check (P02) |
  | Authorization | Evaluate: any initiator; Override: Transfer Authority only (P02) |
  | State Changes & Side Effects | Sets `ELIGIBILITY_CHECK`; no SR event |
  | Failure Handling | Strength service down → degrade to `SOFT_WARN` + staleness notice (no silent block) |
  | Dependencies | FR-001/003/004, G01, G06 |
  | Test Guidance | Rule-matrix; date boundaries; override authz negatives; **un-overridden-violation metric**; strength-staleness path |

### FR-G05-003 — Counselling, Vacancy Publication & Preference Capture (batch)
- **Module:** G05 · Counselling & Preferences
- **Primary Role(s):** HR Admin, Employee, Transfer Authority
- **User Story:** *As HR, I want to publish vacancies and let eligible employees record ranked preferences so that batch allotment in a drive is transparent and seniority/merit-based.*
- **Description:** Publishes `vacancy_positions` (strength read-through; geo for Phase-2), opens a preference window (W.2 form), captures ranked preferences, and supports **batch** allotment by `SENIORITY`/`MERIT`/`PREFERENCE`/`MANUAL`. Allotment writes `vacancy_reservations` (`RESERVED`) rather than mutating a local strength counter. For cadres requiring live allotment, use the interactive session model (FR-G05-019). Feeds FR-G05-005/004.
- **Acceptance Criteria:**
  1. Only published, in-scope vacancies are selectable.
  2. Employees add/reorder/delete preferences only within the open window.
  3. Preference ranks unique and contiguous per employee per drive.
  4. Allotment respects `allotment_method`; results create a `vacancy_reservation` (`RESERVED`) and mark `allotted=true`.
  5. Seniority score pulled from G06 at allotment time.
- **Business Rules:** Employee must pass FR-G05-002; reservations may not exceed read-through `vacant_count`; manual override by Authority captured by P05. **`COUNSELLING` drives use FR-G05-019, not batch allotment.**
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `vacancy_reservations`, `employees` (G01).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives/{id}/vacancies` |
  | GET | `/api/v1/transfers/drives/{id}/vacancies?published=true&cursor=` |
  | PUT | `/api/v1/transfers/drives/{id}/preferences` |
  | POST | `/api/v1/transfers/drives/{id}/allot` *(Idempotency-Key)* |
- **UI Behavior Notes:** Vacancy list (+ Phase-2 map); drag-to-rank builder with live eligibility; window countdown; allotment results grid.
- **Edge Cases:** Window closed mid-edit; vacancy reserved concurrently; seniority tie (deterministic tiebreak by `service_no`); duplicate preference.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `VacancyService`, `PreferenceService`, `BatchAllotmentEngine`, `ReservationService` |
  | Backend Flow | Publish → open window → capture prefs → batch allot with row-lock on `vacancy_reservations` |
  | Data Operations | INSERT/UPDATE `vacancy_positions`,`transfer_preferences`,`vacancy_reservations`; `SELECT … FOR UPDATE` on reservations |
  | Validation | Window dates; rank contiguity; published-only; reservation capacity |
  | Authorization | Vacancies/allot: HR Admin/Authority; prefs: employee (own) (P02) |
  | State Changes & Side Effects | Drive `OPEN`→`ALLOTTED`; reservations `RESERVED` |
  | Failure Handling | Concurrent allot → row lock + retry; over-capacity → `409`/`ERR-G05-VACANCY-FULL` |
  | Dependencies | FR-002/004/005/019, G06 |
  | Test Guidance | Reservation concurrency; rank integrity; window boundary |

### FR-G05-004 — Transfer Order Generation, Gapless Numbering, Approval & Publication
- **Module:** G05 · Approval, Numbering & Order
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want approved requests/allotments converted into a numbered, statutory transfer order and published so that source and destination offices act on a single authoritative document with a gapless statutory number.*
- **Description:** Generates a `transfer_order` (with `order_class`) from an approved request/allotment or direct admin action, routes the **P01 approval chain** (a **W.1 approval flow definition**), assigns a **gapless statutory `order_no` via reserve-then-commit on `order_number_sequences`** (per-office/per-year), renders a bilingual PDF via **G13 document-generation**, publishes to both offices, sets `joining_distance_band`/`joining_time_days` (§16.4) and `in_transit_custody_org_unit_id` pre-set for transit, enqueues the **transfer SR event in `sr_outbox`** (FR-G05-012), and triggers proof-of-service (FR-G05-020). All `status` writes go through `TransferOrderStateService` (which calls P01 + P05).
- **Acceptance Criteria:**
  1. Order created only from an `APPROVED` request, an allotment reservation, or a direct admin action with prior eligibility pass.
  2. Approval enforces maker ≠ checker and transferee exclusion (**P01/P02**).
  3. On approval, a **gapless** sequential `order_no` is committed (reserve-then-commit; voided reservations audited); an immutable PDF is stored in G13.
  4. Publication sets `PUBLISHED`, notifies transferee + both offices (X.2), enqueues SR posting (outbox) and clearance-checklist creation (FR-G05-006 `PARALLEL_ALL_OF` instance), and initiates service-of-order (FR-G05-020).
  5. Mutual orders approved/published atomically as a pair, recording `mutual_pair_order_id`.
  6. `order_class` mandatory; `SUBSTANTIVE` re-checks 5.6-1.
- **Business Rules:** Re-validate FR-G05-002 at approval; deputation/repatriation orders create `deputation_records` (FR-G05-011). Numbering is never "retry-on-collision" — it is reserve-then-commit.
- **Data Model References:** `transfer_orders`, `transfer_requests`, `order_number_sequences`, `documents` (G13), `sr_outbox`, `workflow_instances` (P01), `clearance_checklists`, `deputation_records`, `vacancy_reservations`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders` *(Idempotency-Key)* |
  | POST | `/api/v1/transfers/orders/{id}/approve` |
  | POST | `/api/v1/transfers/orders/{id}/publish` *(Idempotency-Key)* |
  | GET | `/api/v1/transfers/orders/{id}` |
- **UI Behavior Notes:** Order composer with template preview + `order_class` selector + distance band; **approval action bar** + P01 approval timeline; publish confirmation showing downstream effects (service, clearance, SR); PDF viewer.
- **Edge Cases:** Sequence row contention (row-lock → `409`/`ERR-G05-NUMBER-LOCKED`, retry); PDF render failure (order stays `APPROVED`, publish blocked, reserved number voided + audited); ban window now active; reservation expired meanwhile.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferOrderService`, `GaplessNumberGenerator`, `DocGenClient(G13)`, `SrOutboxWriter`, `TransferOrderStateService`, `P01 ApprovalFlow (W.1)` |
  | Backend Flow | Create draft → `WorkflowEngine.startInstance` (approval flow) → on final approve: re-eligibility, **reserve number → render PDF (G13) → commit number**, set APPROVED → publish: PUBLISHED, create clearance (`PARALLEL_ALL_OF`), enqueue SR outbox, start service |
  | Data Operations | INSERT/UPDATE `transfer_orders`; row-locked UPDATE `order_number_sequences`; INSERT `clearance_checklists`(+items),`sr_outbox`,G13 doc ref (single txn); P05 trigger |
  | Validation | Source status; eligibility re-check; maker≠checker (P01); `order_class`; date rules |
  | Authorization | Generate: HR; Approve/Publish: Transfer Authority (P02) |
  | State Changes & Side Effects | Via `TransferOrderStateService`: `DRAFT`→`PENDING_APPROVAL`→`APPROVED`→`PUBLISHED`; SR outbox row; service initiated |
  | Failure Handling | SR enqueue is in-txn (always succeeds locally); PDF fail → void reserved number (audit) + block publish |
  | Dependencies | FR-002/003/006/011/012/020, G12, G13, P01 |
  | Test Guidance | **Gapless sequence under concurrency (no gap/dup)**; atomic mutual pair; publish side-effects |

### FR-G05-005 — Bulk Transfer Drive Management
- **Module:** G05 · Bulk Drives
- **Primary Role(s):** HR Admin, Transfer Authority
- **User Story:** *As HR Admin, I want to run an annual/seasonal transfer drive that batch-processes hundreds of transfers so that large cadre movements are efficient and consistent.*
- **Description:** Manages a `transfer_drive` lifecycle: scope/cadre, publish vacancies, open preference window (FR-G05-003) **or run a counselling session (FR-G05-019)**, allot, and **batch-generate orders** (FR-G05-004) via the **`JOB-G05-DRIVE` background job (X.1 runner)** with progress tracking, partial-failure isolation, and a dashboard. CSV import + bulk eligibility pre-screen. Vacancy reservations carry the lifecycle that prevents **cascading double-fill** at join time.
- **Acceptance Criteria:**
  1. Drive progresses `DRAFT`→`OPEN`→`COUNSELLING`→`ALLOTTED`→`ORDERS_ISSUED`→`CLOSED`.
  2. Bulk eligibility pre-screen flags blocked candidates before allotment.
  3. Batch order generation is resumable (X.1 idempotent per-period run key); a failed candidate quarantines, not aborts.
  4. Dashboard shows counts by stage and pendency.
  5. Closing requires all allotted candidates to have orders issued or be explicitly excluded.
  6. Reservation-to-order transition re-checks `vacant_count > 0` transactionally.
- **Business Rules:** Per-candidate eligibility (FR-002) and substantive-uniqueness (5.6-1); ban-window applies drive-wide unless exempted.
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `vacancy_reservations`, `transfer_requests`, `transfer_orders`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives` |
  | POST | `/api/v1/transfers/drives/{id}/screen` |
  | POST | `/api/v1/transfers/drives/{id}/generate-orders` *(Idempotency-Key)* |
  | GET | `/api/v1/transfers/drives/{id}/dashboard` |
- **UI Behavior Notes:** Drive console stage stepper; candidate grid with eligibility chips; batch progress bar; quarantine tab (Admin workspace).
- **Edge Cases:** Partial allotment; CSV invalid service numbers; mid-drive ban activation; candidate withdrawal after allotment (reservation `RELEASED`).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `DriveService`, `BulkEligibilityScreener`, `BatchOrderGenerator(JOB-G05-DRIVE)`, `ReservationService`, `DriveDashboard` |
  | Backend Flow | Create drive → import/screen → allot (FR-003/019) → enqueue `JOB-G05-DRIVE` batch (each re-checks reservation) → aggregate |
  | Data Operations | Bulk INSERT/UPDATE; idempotent job run records (X.1); reservation transitions; P05 trigger per candidate |
  | Validation | Cadre/scope; CSV schema; per-candidate eligibility; reservation re-check |
  | Authorization | HR Admin / Transfer Authority (P02) |
  | State Changes & Side Effects | Drive + per-candidate order states (via `TransferOrderStateService`); SR outbox per order |
  | Failure Handling | Per-candidate try/catch → quarantine; resumable checkpoint; terminal job failure → `JOB-FAIL`/`MSG-SYS-JOBFAIL` |
  | Dependencies | FR-002/003/004/019 |
  | Test Guidance | Large-batch perf (<30min/1000); partial-failure isolation; resume; **cascading-vacancy re-check** |

### FR-G05-006 — Relieving: No-Dues / Clearance as a P01 PARALLEL_ALL_OF Flow (SLA escalation & deemed clearance)
- **Module:** G05 · Relieving — Clearance
- **Primary Role(s):** HR Officer (Source), Clearance Officers, Estate Officer, Employee
- **User Story:** *As a source HR officer, I want a departmental no-dues checklist auto-created on order publication, with SLAs and an escalation path, so that one non-responsive officer cannot block relieving indefinitely.*
- **Description:** On publication a `clearance_checklist` is created as the subject of a **P01 `PARALLEL_ALL_OF` workflow instance** with **one branch per configured clearance department** of the source office (offices with fewer departments open fewer branches; the instance joins only when **every** branch completes). Each branch carries a **P01 SLA** (`sla_due_at`); on breach the **P01 SLA runtime** emits an escalation event → X.2 notification + P05 audit, advancing `OFFICER → DEPT_HEAD → AUTHORITY`. The Authority may grant `DEEMED_CLEARED` with reason (FR-G05-016). Checklist reaches `CLEARED`, `CLEARED_WITH_DUES`, or `CLEARED_WITH_DEEMED`. Gates relieving (FR-G05-008).
- **Acceptance Criteria:**
  1. Checklist auto-created as a `PARALLEL_ALL_OF` instance with one branch/item per **configured** department.
  2. Only the assigned Clearance Officer (P01 branch assignee) or HR override with reason updates a branch.
  3. Outstanding dues require `dues_amount`/description; checklist cannot reach `CLEARED` with open dues unless `CLEARED_WITH_DUES` (`dues_recovery_ref`).
  4. Each branch has a P01 SLA; breaches escalate through tiers via the P01 SLA runtime with X.2 notifications.
  5. Authority `DEEMED_CLEARED` requires `forced_action_reason` + `forced_action_by`; counts toward `deemed_items`.
  6. Every change captured by the P05 trigger.
- **Business Rules:** Clearance Officer ≠ transferee (P02); dues link to G10 recovery; `WAIVED`/`DEEMED_CLEARED` require Authority approval (audited).
- **Data Model References:** `clearance_checklists`, `clearance_items`, `transfer_orders`, `documents` (G13), `workflow_instances` (P01), `notifications` (X.2).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/orders/{id}/clearance` |
  | PATCH | `/api/v1/clearance/items/{id}` |
  | POST | `/api/v1/clearance/items/{id}/escalate` |
  | POST | `/api/v1/clearance/items/{id}/deem-cleared` |
  | POST | `/api/v1/clearance/{checklistId}/finalize` |
- **UI Behavior Notes:** Clearance board per-department cards with **SLA countdown + escalation badge**; officer action drawer (approval action bar); Authority "deem cleared" action with mandatory reason; employee tracker.
- **Edge Cases:** Department has no officer (auto-escalate to dept-head queue per P01 assignee fallback); dues disputed; officer on leave (delegate via P01 or auto-escalate); office with zero configured departments (no branches → checklist auto-`CLEARED`).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ClearanceService`, `ClearanceItemController`, `P01 PARALLEL_ALL_OF instance + SLA runtime`, `DeemedClearanceController`, `DuesRecoveryClient(G10)`, `ClearanceBoard` |
  | Backend Flow | On publish create P01 instance with branches from **configured** dept set → P01 SLA timers → P01 escalates on breach → officers/Authority update branch → ALL_OF join → finalize computes status |
  | Data Operations | INSERT checklist+items; UPDATE items (status/escalation/forced-action); UPDATE counters; P05 trigger |
  | Validation | Officer authz (P02); dues required when outstanding; Authority for deemed/waive |
  | Authorization | Per-branch officer; HR override logged; deemed → Authority (P02) |
  | State Changes & Side Effects | Checklist `OPEN`→`IN_PROGRESS`→`CLEARED`/`CLEARED_WITH_DUES`/`CLEARED_WITH_DEEMED`; gate FR-008; G10 recovery signal (outbox) |
  | Failure Handling | G10 down → `CLEARED_WITH_DUES` with pending ref, retry via outbox |
  | Dependencies | FR-004/008/016, G10, G13, P01 |
  | Test Guidance | Per-dept authz; P01 SLA escalation timing; **deemed-clearance audit**; zero-department office; ALL_OF join; counter integrity |

### FR-G05-007 — Charge Handover at Source (with handover-under-protest)
- **Module:** G05 · Relieving — Charge Handover
- **Primary Role(s):** Employee (relinquishing), Charge Receiving Officer, HR Officer (Source), Transfer Authority
- **User Story:** *As a relieving employee, I want to formally hand over charge — and where a dispute would trap me, hand over under protest within a time-bound resolution — so accountability transfers without indefinite blocking.*
- **Description:** Records a `charge_handover` (phase `HANDOVER_SOURCE`) of assets, pending files, cash/imprest, and a note (G13). Receiving officer/successor (or **link officer / custody-of-office where no successor exists**) accepts or disputes. A dispute starts a **time-bound resolution clock (`dispute_sla_due_at`, P01 SLA / `JOB-G05-DISPUTE-SLA`)**; on breach, the Authority may certify **handover-under-protest** (FR-G05-016), unblocking relieving while preserving the dispute for separate resolution.
- **Acceptance Criteria:**
  1. Handover captures asset inventory, cash/imprest, pending files, note document (G13).
  2. Receiving officer can `ACCEPT` or `DISPUTE` with remarks.
  3. A dispute does **not** block relieving indefinitely: after `dispute_sla_due_at`, Authority `HANDOVER_UNDER_PROTEST` is available with reason.
  4. Charge type (`FULL`/`ADDITIONAL`/`CURRENT_DUTIES`) recorded; `ADDITIONAL_CHARGE` orders never block a substantive relieving.
- **Business Rules:** Relinquisher ≠ acceptor (P02); cash/imprest mismatch flags an accounts clearance dependency (FR-006); under-protest preserves the dispute record and notifies Accounts/Authority (X.2).
- **Data Model References:** `charge_handovers`, `transfer_orders`, `employees` (G01), `documents` (G13).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/charge-handover` |
  | POST | `/api/v1/charge-handovers/{id}/accept` |
  | POST | `/api/v1/charge-handovers/{id}/dispute` |
  | POST | `/api/v1/charge-handovers/{id}/under-protest` |
- **UI Behavior Notes:** Handover form (asset table + cash + note); acceptor review (accept/dispute); dispute shows resolution countdown; Authority under-protest action with reason.
- **Edge Cases:** No successor (link officer / custody-of-office); partial asset return; additional-charge relinquishment; dispute unresolved past SLA.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ChargeHandoverService`, `ChargeController`, `DisputeSlaJob(JOB-G05-DISPUTE-SLA)`, `UnderProtestController`, `ChargeForm` (W.2) |
  | Backend Flow | Create handover → notify acceptor → accept/dispute → dispute SLA clock → Authority under-protest if breached → gate relieving |
  | Data Operations | INSERT/UPDATE `charge_handovers` (status/under_protest/forced-action); P05 trigger; G13 doc ref |
  | Validation | Relinquisher≠acceptor (P02); required fields; phase=HANDOVER_SOURCE |
  | Authorization | Employee create; acceptor accept/dispute; Authority under-protest (P02) |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ACCEPTED`/`DISPUTED`→`UNDER_PROTEST`; precondition for FR-008 (satisfiable by under-protest) |
  | Failure Handling | Dispute loop bounded by SLA; document upload retry |
  | Dependencies | FR-006/008/010/016 |
  | Test Guidance | Accept/dispute/under-protest paths; relinquisher-exclusion; no-successor handover; SLA breach |

### FR-G05-008 — Relieving Order, Last Working Day & Pay-Continuity Signal
- **Module:** G05 · Relieving — Order & LWD
- **Primary Role(s):** HR Officer (Source), Transfer Authority, Payroll Officer
- **User Story:** *As source HR, I want to issue a relieving order setting the last working day once clearance and handover are complete (or deemed) so that the employee is formally relieved and pay is continued — not stopped — across the handoff.*
- **Description:** Issues a `relieving_order` once clearance (FR-006) and handover (FR-007) preconditions are met **or a `deemed_relief` Authority action is recorded** (FR-016). Sets `last_working_day` (`VAL-EFFECTIVE`, staged via `JOB-G05-EFFDATE`), relieving time (FN/AN — load-bearing, §16.9), generates the relieving order PDF (G13), enqueues a **`PAY_CONTINUITY` + `LPC_REQUEST` signal to G10 via `sr_outbox`** (not a pay-stop), sets `in_transit_custody_org_unit_id` and transitions the order `RELIEVED`→`IN_TRANSIT` (via `TransferOrderStateService`), marks the `vacancy_reservation` `VACATED_ON_RELIEF`, enforces **mutual paired-progress**, and enqueues the **relieving SR event to G12 asserting no break in service** (FR-012/015).
- **Acceptance Criteria:**
  1. Relieving order issued only when clearance ∈ {CLEARED, CLEARED_WITH_DUES, CLEARED_WITH_DEEMED} and (if required) handover ACCEPTED/UNDER_PROTEST — **or** `deemed_relief` recorded.
  2. `last_working_day ≥ served_on_date` and ≤ `relieve_by_date` (late relief flagged, not hard-blocked); enforcement uses **served date**.
  3. On issue: PDF stored (G13), **pay-continuity + LPC** enqueued to G10, SR `RELIEVING` event enqueued to G12 via `/sr/ingest` (`service_continuity_asserted=true`), order → `IN_TRANSIT`, custody set, reservation vacated.
  4. Unique gapless `relieving_order_no` generated.
  5. For `MUTUAL`, the counterpart's progress is checked; asymmetric completion blocked (5.6-5).
- **Business Rules:** Pay is continued (continuity signal), LPC requested exactly once; relieving beyond `relieve_by_date` requires remark; deemed-relief requires Authority + reason (P02).
- **Data Model References:** `relieving_orders`, `clearance_checklists`, `charge_handovers`, `transfer_orders`, `vacancy_reservations`, `documents` (G13), `sr_outbox`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/relieving-order` |
  | POST | `/api/v1/relieving-orders/{id}/issue` *(Idempotency-Key)* |
  | POST | `/api/v1/relieving-orders/{id}/deemed-relieve` |
  | GET | `/api/v1/relieving-orders/{id}` |
- **UI Behavior Notes:** Relieving panel with clearance/handover readiness gauges; LWD picker; issue disabled until preconditions met or deemed-relief invoked; confirmation lists downstream signals (continuity, LPC, SR, custody).
- **Edge Cases:** Relieving after deadline; pay-continuity signal failure (outbox retry); employee absent on planned LWD; clearance reopened after issue (revoke FR-013); mutual counterpart stalled.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `RelievingService`, `TransferOrderStateService`, `SrOutboxWriter`, `CustodyAssigner`, `MutualPairGuard`, `RelievingPanel` |
  | Backend Flow | Verify preconditions (or deemed) → create relieving_order (P01 approval) → on issue: number, PDF (G13), enqueue G10 PAY_CONTINUITY+LPC, enqueue SR `RELIEVING`, set custody, vacate reservation, transition IN_TRANSIT |
  | Data Operations | INSERT/UPDATE `relieving_orders`,`transfer_orders`,`vacancy_reservations`; INSERT `sr_outbox`, G13 ref (txn); P05 trigger |
  | Validation | Precondition/deemed gate (5.6-2 → `412`/`ERR-G05-CLEARANCE-INCOMPLETE`); date rules (served-date based, `ERR-G05-RELIEVE-DATE`); single LPC; mutual guard |
  | Authorization | HR Source issue; Authority co-sign/deemed-relief (P02) |
  | State Changes & Side Effects | Relieving `PENDING_CLEARANCE`→`ISSUED`/`DEEMED_RELIEVED`; order `RELIEVING_IN_PROGRESS`→`RELIEVED`→`IN_TRANSIT`; custody set; G10 continuity + SR via outbox |
  | Failure Handling | G10/SR via outbox retry; PDF fail blocks issue (number voided + audited) |
  | Dependencies | FR-006/007/009/012/015/016, G10, G12, G13 |
  | Test Guidance | Precondition + deemed-relief gating; **pay-continuity (not stop) signal**; custody set; reservation vacated; mutual coupling; deadline flag on served date |

### FR-G05-009 — Transfer-in-Transit & Joining-Time Management (regional working-day calendar)
- **Module:** G05 · Transit Management
- **Primary Role(s):** HR Officer (Source/Destination), Employee, Auditor
- **User Story:** *As HR, I want the period between relieving and joining tracked with admissible joining time computed against a proper regional working-day calendar so transit is visible, paid, controlled, and not abused.*
- **Description:** Maintains `IN_TRANSIT` between LWD and joining. Computes admissible **joining time by distance band** (§16.4) using the platform **Holiday & Region master** (Org Admin Master Data; `VAL-HOL-RECUR`/`VAL-REGION-STATE`) — the v1 silent "Sat/Sun + national holidays" fallback is removed; an unavailable calendar defers the computation (X.3 error map → `ERR-LOADFAIL`), never silently wrong. Monitors elapsed transit via **`JOB-G05-TRANSIT`** (X.1), flags overdue, exposes an in-transit register, and shows the **in-transit custodian** for each employee.
- **Acceptance Criteria:**
  1. Orders display `IN_TRANSIT` with day counter, admissible-by date, and **custodian office**.
  2. Joining-time computation uses the Holiday & Region master and `joining_distance_band`; no silent default.
  3. Transit exceeding admissible time raises overdue flag + X.2 notification to both offices.
  4. In-transit register lists employees with source/destination, custodian, and elapsed days.
- **Business Rules:** Transit is bounded by policy and **paid** (FR-015); extension of joining time requires Authority approval (P02, recorded); unjoined beyond grace triggers `LATE_JOINING_REVIEW` (FR-018).
- **Data Model References:** `transfer_orders` (transit/custody), `relieving_orders`, `joining_reports`, Holiday & Region master (read).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/in-transit?org_unit=&cursor=` |
  | POST | `/api/v1/transfers/orders/{id}/extend-joining-time` |
- **UI Behavior Notes:** In-transit register with elapsed/limit bars; custodian column; overdue rows highlighted; extension modal (Authority); calendar-unavailable banner if computation deferred.
- **Edge Cases:** Cross-region calendar differences (resolved by region master); employee joins early; never joins (→ FR-018); **calendar master unavailable (deferred compute, explicit error, not silent default)**.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransitService`, `JoiningTimeCalculator(HolidayMasterClient)`, `OverdueJob(JOB-G05-TRANSIT)`, `InTransitRegister` |
  | Backend Flow | Derive admissible-by from LWD + distance band + Holiday/Region master → `JOB-G05-TRANSIT` flags overdue → register query |
  | Data Operations | READ orders/relieving; UPDATE flags; P05 trigger on extension |
  | Validation | Calendar correctness (master); extension authz (P02) |
  | Authorization | Register: HR/Auditor; extension: Transfer Authority (P02) |
  | State Changes & Side Effects | Order remains `IN_TRANSIT`; overdue X.2 notification; possible `LATE_JOINING_REVIEW` |
  | Failure Handling | Calendar master missing → defer compute + `ERR-LOADFAIL` (no silent Sat/Sun fallback) |
  | Dependencies | FR-008/010/015/018, Holiday & Region master |
  | Test Guidance | Distance-band joining math; regional calendar; overdue scheduling; calendar-down deferral |

### FR-G05-010 — Joining Report & Charge Assumption at Destination
- **Module:** G05 · Joining
- **Primary Role(s):** Employee (Transferee), HR Officer (Destination), Charge Receiving Officer, Payroll Officer
- **User Story:** *As a transferred employee, I want to submit a joining report and assume charge so my joining date is confirmed, pay continuity resumes at destination, and my posting is updated.*
- **Description:** Transferee submits a `joining_report`; destination HR verifies (P01), records charge assumption (`ASSUMPTION_DEST`), confirms the statutory `joining_date` (`VAL-EFFECTIVE`), computes transit vs admissible, **assigns the inter-se joining sequence (FR-021)**, **re-checks the vacancy reservation transactionally and marks it `FILLED_ON_JOIN`**, enqueues a **`PAY_CONTINUITY` resume + `POSTING_UPDATE` to G01 via `sr_outbox`** (G01 owns the org-placement update), clears `in_transit_custody` (G01 becomes authoritative), enforces **mutual paired-progress**, and enqueues the **joining SR event to G12 asserting no break in service** (FR-012/015). Late joining routes to FR-018.
- **Acceptance Criteria:**
  1. Joining report submitted only against an `IN_TRANSIT` order (exception: `JOINING_WITHOUT_RELIEF` flagged).
  2. Destination HR verification confirms `joining_date`; transit + admissibility computed.
  3. On confirmation: charge assumption recorded, **reservation re-check + FILLED_ON_JOIN**, pay-continuity resumed (G10), G01 posting updated, **joining sequence assigned**, SR `JOINING` enqueued via `/sr/ingest` (continuity asserted), order → `JOINED`.
  4. Late joining (beyond admissible + grace) routes to `LATE_JOINING_REVIEW` (FR-018) before confirmation.
  5. Unique gapless `joining_report_no` generated; **mutual counterpart coupling enforced**.
- **Business Rules:** `joining_date ≥ LWD`; **G01 owns the posting change** (single authoritative org-placement update, via G01 service/outbox); deputation joining updates `deputation_records` start (FR-011); reservation double-fill blocked (`ERR-G05-VACANCY-FULL`).
- **Data Model References:** `joining_reports`, `charge_handovers`, `transfer_orders`, `vacancy_reservations`, `employees`/`org_units` (G01), `sr_outbox`, `deputation_records`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/joining-report` |
  | POST | `/api/v1/joining-reports/{id}/verify` |
  | POST | `/api/v1/joining-reports/{id}/confirm` *(Idempotency-Key)* |
- **UI Behavior Notes:** Joining wizard (report → charge assumption → confirm); HR verification with transit summary + **joining-sequence assignment**; late-joining banner with review action.
- **Edge Cases:** Reported but charge not available; joining before relieving processed; date disputes; promotion-linked designation change; **reservation filled by another joiner (concurrency)**; mutual counterpart not yet relieved.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `JoiningService`, `TransferOrderStateService`, `EmployeeMasterClient(G01)`, `SrOutboxWriter`, `JoiningSequencer`, `ReservationService`, `MutualPairGuard`, `JoiningWizard` |
  | Backend Flow | Submit → HR verify (P01) → confirm: record assumption, re-check+fill reservation, set joining_date, assign sequence, enqueue G01 posting + G10 continuity-resume, enqueue SR `JOINING`, clear custody, order JOINED |
  | Data Operations | INSERT/UPDATE `joining_reports`,`charge_handovers`,`transfer_orders`,`vacancy_reservations`; INSERT `sr_outbox`; G01 update via outbox; P05 trigger |
  | Validation | Order IN_TRANSIT (`ERR-G05-NOT-IN-TRANSIT`); date ≥ LWD; late-joining gate; reservation re-check; mutual guard |
  | Authorization | Employee submit; HR Dest verify/confirm (P02) |
  | State Changes & Side Effects | Report `SUBMITTED`→`UNDER_VERIFICATION`→`JOINED_CONFIRMED`; order `IN_TRANSIT`→`JOINED`; G01 + G10 + SR via outbox |
  | Failure Handling | G01/G10/SR via outbox retry; reservation conflict → `409`/`ERR-G05-VACANCY-FULL` |
  | Dependencies | FR-008/009/011/012/015/018/021, G01, G10, G12 |
  | Test Guidance | Confirm side-effects; **reservation re-check at join**; joining-sequence integrity; pay-continuity resume; mutual coupling |

### FR-G05-011 — Deputation Terms & Repatriation Management
- **Module:** G05 · Deputation & Repatriation
- **Primary Role(s):** HR Admin, Transfer Authority, Employee
- **User Story:** *As HR, I want to manage deputation tenure, terms, extensions and repatriation so lent employees return on time and terms are tracked.*
- **Description:** For `DEPUTATION` orders, maintains a `deputation_record` (borrowing/lending units, terms, tenure, extensions with caps, repatriation due/status). Generates repatriation alerts via **`JOB-G05-REPAT-REMIND`** (X.1) and processes repatriation as a reverse transfer with `order_class=REPATRIATION` (reusing FR-004/006/008/010) — which **legitimately co-exists** with the original deputation during overlap (5.6-1).
- **Acceptance Criteria:**
  1. Deputation record auto-created when a deputation order is published.
  2. Extension requests validated against `max_tenure_months`; over-cap blocked (`422`/`ERR-G05-DEPUTATION-CAP`).
  3. Repatriation-due alerts raised ahead of `current_end_date`.
  4. Repatriation initiates a reverse `REPATRIATION`-class order to the lending unit.
- **Business Rules:** Terms in `deputation_terms`; external borrowing units are `org_units` type `EXTERNAL`; max tenure enforced by policy (FR-002).
- **Data Model References:** `deputation_records`, `transfer_orders` (order_class), `org_units` (P04), `employees` (G01).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/deputations?status=&cursor=` |
  | POST | `/api/v1/deputations/{id}/extend` |
  | POST | `/api/v1/deputations/{id}/repatriate` |
- **UI Behavior Notes:** Deputation register with tenure timeline; extension modal with cap validation; repatriation action launching reverse-transfer wizard.
- **Edge Cases:** Extension beyond cap; early recall; deputee resigns on deputation; external unit not in org tree.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `DeputationService`, `RepatriationOrchestrator`, `RepatReminderJob(JOB-G05-REPAT-REMIND)`, `DeputationRegister` |
  | Backend Flow | On deputation publish create record → manage extensions (cap check) → on repatriate create `REPATRIATION`-class reverse order (FR-004) |
  | Data Operations | INSERT/UPDATE `deputation_records`; create reverse `transfer_orders`; P05 trigger |
  | Validation | Tenure cap; date monotonicity; role authz (P02) |
  | Authorization | HR Admin/Authority manage; employee view |
  | State Changes & Side Effects | `ACTIVE`→`EXTENSION_REQUESTED`→`EXTENDED`/`REPATRIATION_DUE`→`REPATRIATED`; reverse order |
  | Failure Handling | Reverse-order failure isolated; alerts retried (X.1) |
  | Dependencies | FR-002/004/008/010 |
  | Test Guidance | Cap enforcement; repatriation reverse-flow; order_class co-existence; alert timing |

### FR-G05-012 — Service Register (SR) Event Posting to G12 via Transactional Outbox
- **Module:** G05 · SR Posting
- **Primary Role(s):** System, SR Custodian/Registrar
- **User Story:** *As the SR custodian, I want every transfer, relieving and joining event reliably posted to the G12 Digital SR so the statutory service record is complete, accurate, and asserts continuous service.*
- **Description:** Posts append-only SR events to the **G12 SR ledger** (which runs on the **P05 audit/immutability substrate**) at the checkpoints `TRANSFER` (and `MUTUAL_TRANSFER` for mutual exchanges), `RELIEVING` and `JOINING` — the **exact `event_type` codes published by G12 for G05** — using the **G04-style fully field-specified `sr_outbox`** (§5.2.15). G12 froze the SR ingestion contract; G05 is a writer. Every `G12_SR` outbox row **relays to the canonical write-port `POST /api/v1/sr/ingest`** (reversals to `POST /api/v1/sr/ingest/reversal`) via **X.3**, dispatched by **`JOB-G05-OUTBOX` (X.1)** — no direct SR-table INSERT, no `/api/v1/sr/events`. Each ingest call carries the dedup tuple `(source_module="G05", source_reference_id, source_event_version)`, the qualifying-service **`fact_key`** (required), and explicit `tenant_id`+`entity_id` on the payload. Idempotency keys follow the documented formula; retry uses exponential backoff with `max_attempts`; exhausted rows are `DEAD_LETTERED` and surfaced for the Custodian. The same outbox separately carries G10 (`PAY_CONTINUITY`,`ENTITLEMENT`,`LPC_REQUEST`,`LICENCE_FEE_RECOVERY`), G01 (`POSTING_UPDATE`), G06 (`SENIORITY_FEED`) and G09 (`DISCIPLINARY_TRIGGER`) signals. `RELIEVING`/`JOINING` payloads carry `service_continuity_asserted`.
- **SR ingest payload contract (G12-frozen envelope):** every `POST /api/v1/sr/ingest` body MUST populate: `source_module="G05"` (explicit, not inferred), `source_reference_id` (the originating G05 aggregate/checkpoint reference), `source_event_version`, `event_type` (one of the published G05 codes above), **`fact_key`** (derived per the event type's `fact_correlation_rule`; missing → `SR_FACT_KEY_REQUIRED`), `tenant_id`, `entity_id`, plus the event body (`order_no`, source/destination `org_units`, dates, `service_continuity_asserted` for RELIEVING/JOINING). Reversals use `is_reversal=true`+`reverses_source_reference_id` (see FR-013), never a `COMPENSATING` type.
- **Acceptance Criteria:**
  1. Exactly one SR event per checkpoint per order (idempotent via key formula).
  2. Failed postings retried; exhausted → `DEAD_LETTERED` + surfaced to Custodian (X.2 `MSG-G05-SR-FAILED`).
  3. SR payload includes order_no, source/destination, dates, event type, **continuity assertion**, references.
  4. A reconciliation report lists orders with missing/failed SR events and outbox dead-letters.
- **Business Rules:** SR events immutable (G12 on P05 substrate); corrections **supersede, never delete** — a correction posts the published `*_CANCELLED` partner type via the G12 envelope (`is_reversal=true`+`reverses_source_reference_id`), and G12 auto-spawns the corrigendum (no invented `COMPENSATING` type); outbox writes share the local DB transaction; failures never block local state.
- **Data Model References:** `sr_outbox`, `service_register_events` (G12), `transfer_orders`, `relieving_orders`, `joining_reports`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/sr/ingest` (canonical G12 ledger write-port, via X.3) |
  | POST | `/api/v1/sr/ingest/reversal` (G12 reversal write-port, via X.3) |
  | GET | `/api/v1/transfers/sr-reconciliation?status=pending&cursor=` |
  | POST | `/api/v1/transfers/sr-outbox/{id}/retry` |

  > The `/api/v1/transfers/sr-outbox/{id}/retry` and `sr-reconciliation` paths are G05-local façades over the `sr_outbox`; **they relay to `POST /api/v1/sr/ingest` (and `/api/v1/sr/ingest/reversal`)** — they do not write the SR ledger directly.
- **UI Behavior Notes:** SR reconciliation console (SR Custodian) listing `PENDING`/`FAILED`/`DEAD_LETTERED` outbox rows with retry; per-order SR timeline.
- **Edge Cases:** G12 down at checkpoint; duplicate retry (idempotency key dedupes); partial payload; clock skew; dead-letter after `max_attempts`.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `SrOutboxWriter`, `OutboxPublisherJob(JOB-G05-OUTBOX)`, `SrReconciliationService`, `X.3 clients (G12/G10/G01/G09/G06)` |
  | Backend Flow | On checkpoint INSERT outbox row (same txn) → `JOB-G05-OUTBOX` dispatches by `target_system` via X.3 with idempotency key → mark `DELIVERED`/`FAILED` → backoff → `DEAD_LETTERED` |
  | Data Operations | INSERT `sr_outbox`; UPDATE status/attempt/next_attempt; READ for reconciliation; P05 trigger |
  | Validation | Idempotency-key uniqueness (formula, `VAL-G05-SREVENT`); payload schema |
  | Authorization | System publish; Custodian retry/reconcile (P02) |
  | State Changes & Side Effects | Outbox status lifecycle; G12/G10/G01/G09/G06 effects |
  | Failure Handling | Exponential backoff; dead-letter + alert; 180-day retention; `JOB-FAIL`/`MSG-SYS-JOBFAIL` on terminal job failure |
  | Dependencies | FR-004/008/010/015, G12, G10, G01, G06, G09, X.1, X.3 |
  | Test Guidance | **Idempotency under retry**; outbox delivery guarantee; dead-letter + reconciliation; continuity assertion in payload |

### FR-G05-013 — Order Amendment, Cancellation & Post-Relief Revocation
- **Module:** G05 · Amendment / Cancellation
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want to amend, cancel or revoke a transfer order at the correct lifecycle stage so corrections and recalls are handled with full audit and statutory compensation.*
- **Description:** Three stage-aware corrective actions (each a **P01 approval flow**): **amend** (pre-relief — supersede with `revision_no`++, new gapless PDF, reversal SR), **cancel** (pre-relief — close order, reverse clearance/handover/reservation, notify), **revoke** (post-relief/join — recall requiring reversal SR, **G01 posting reversal**, **pay-continuity reversal/reconciliation** to G10). Reversal SR is posted to `POST /api/v1/sr/ingest/reversal` using the G12 envelope (`is_reversal=true`+`reverses_source_reference_id`) with the published `*_CANCELLED` partner type (`TRANSFER_CANCELLED`/`RELIEVING_CANCELLED`/`JOINING_CANCELLED`) — **supersede, never delete**. All require Authority approval + justification (P02); all `status` writes via `TransferOrderStateService`.
- **Acceptance Criteria:**
  1. Amendment only pre-relief; new revision via `superseded_by_order_id`; reserved number committed/voided gaplessly.
  2. Cancellation pre-relief; reverses clearance/handover and **releases vacancy reservation**; notifies stakeholders (X.2).
  3. Revocation (post-relief/join) enqueues a reversal SR (`*_CANCELLED`, `is_reversal=true`+`reverses_source_reference_id`) + **pay-continuity reconciliation** signal to G10 and G01 reversal.
  4. Every action requires justification + Authority approval (P01/P02); captured by P05 trigger.
- **Business Rules:** SR-posted records never hard-deleted (5.6-10); revocation after joining reverses G01 posting via G01 API with reason; active `STAY_HOLD` must be vacated or the action recorded as hold-driven.
- **Data Model References:** `transfer_orders`, `clearance_checklists`, `charge_handovers`, `joining_reports`, `vacancy_reservations`, `sr_outbox`, `employees` (G01).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/amend` |
  | POST | `/api/v1/transfers/orders/{id}/cancel` |
  | POST | `/api/v1/transfers/orders/{id}/revoke` |
- **UI Behavior Notes:** Stage-aware action menu (only valid actions enabled); justification-required modal (`ERR-REASON-REQ`); impact preview listing reversals (clearance, reservation, SR, G01, pay).
- **Edge Cases:** Amend after clearance started; cancel after partial clearance; revoke after pay paid (reconciliation); concurrent amend + relieving; active hold.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `OrderCorrectionService`, `ReversalOrchestrator`, `TransferOrderStateService`, `CorrectionModal` |
  | Backend Flow | Determine allowed action by status → P01 approve → execute (supersede/reverse) → reversal SR (`*_CANCELLED`, `is_reversal=true`) + signals via outbox → `/sr/ingest/reversal` |
  | Data Operations | UPDATE orders (revision/status); reverse dependents incl. reservations; INSERT reversal `sr_outbox` row (`*_CANCELLED`, `reverses_source_reference_id`); P05 trigger |
  | Validation | Stage rules; justification mandatory; authz (P02); hold check |
  | Authorization | Transfer Authority approves (P01/P02) |
  | State Changes & Side Effects | `AMENDED`/`CANCELLED`/`REVOKED`; SR reversal (`*_CANCELLED`, supersede-not-delete); G10/G01 reversal |
  | Failure Handling | Reversal partial-failure → quarantine + alert; idempotent reversal (dedup tuple) |
  | Dependencies | FR-004/006/008/010/012/015, G01, G10, G12 |
  | Test Guidance | Stage-gating matrix; reversal completeness; reservation release; SR compensation; pay reconciliation |

### FR-G05-014 — Geographic Mapping & Transfer Analytics Dashboard (Phase-2 map)
- **Module:** G05 · Mapping & Analytics
- **Primary Role(s):** HR Admin, Transfer Authority, Auditor, Reporting Manager
- **User Story:** *As a Transfer Authority, I want analytics on transfers, pendency, clearance, transit, custody and SR health so I can monitor mobility health and act on bottlenecks.*
- **Description:** Dashboard (feeding/surfaced via **G14**, role-scoped `analytics.*`) with analytics: transfers by type/class/stage, relieving pendency, clearance bottlenecks (incl. P01 SLA breaches/deemed-clearances), in-transit/overdue counts **with custody integrity checks**, SR/outbox health, drive progress, deputation tenure, **representation/stay-hold load, abandonment counts, quarter overstays**. The **geographic map is re-prioritised to Phase-2**; analytics ship in baseline.
- **Acceptance Criteria:**
  1. KPI cards show counts for each lifecycle stage, overdue/pending, **custody-integrity exceptions, un-overridden violations, dead-letters**.
  2. Clearance bottleneck view ranks departments by average clearance time and SLA-breach rate.
  3. All figures respect row-level org scope (P02); Auditor sees all read-only.
  4. Data exportable (CSV/PDF) with cursor pagination.
  5. **Map view delivered as a Phase-2 enhancement** behind a feature flag.
- **Business Rules:** Aggregations read-only; no PII beyond role scope (PII ceiling); numbers reconcile with operational records.
- **Data Model References:** all G05 entities (read), incl. `transfer_representations`, `quarter_allotments`, `sr_outbox`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/analytics/summary` |
  | GET | `/api/v1/transfers/analytics/clearance-bottlenecks` |
  | GET | `/api/v1/transfers/map/vacancies?cadre=&office=` *(Phase-2)* |
- **UI Behavior Notes:** KPI grid + trend charts + bottleneck table (baseline, G14 surface); map panel (Phase-2 flag); drill-down to filtered lists; export.
- **Edge Cases:** Missing geo-coordinates (list-only); large result sets (server aggregation + cursor pagination); timezone in trend buckets.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `AnalyticsService`, `MapDataService` *(Phase-2)*, `TransferDashboard (G14)` |
  | Backend Flow | Pre-aggregated org-scoped queries → short-TTL cache → serve KPI/bottleneck (map Phase-2) |
  | Data Operations | Read-only aggregate SELECTs (indexed); optional materialized views |
  | Validation | Filter params; scope enforcement (P02) |
  | Authorization | Scoped read; Auditor global read (Org-Admin read + entitlement) |
  | State Changes & Side Effects | None |
  | Failure Handling | Cache miss/timeout → degrade to live query with limit |
  | Dependencies | All G05 entities; G14 |
  | Test Guidance | Aggregation correctness; scope isolation; export integrity; Phase-2 flag gating |

### FR-G05-015 — Service Continuity, Joining-Time Pay & In-Transit Custody (Critical)
- **Module:** G05 · Service Continuity & Custody
- **Primary Role(s):** HR Officer (Source/Destination), Transfer Authority, Payroll Officer, SR Custodian
- **User Story:** *As the organisation, I want the transit/joining-time period treated as continuous paid service owned by a defined custodian office, so employees are never underpaid and headcount is never dual- or zero-counted.*
- **Description:** Replaces the v1 pay-stop/pay-start model. On relieving, G10 receives a single **`PAY_CONTINUITY`** signal (continue pay across the handoff) plus an **`ENTITLEMENT`** signal keyed on `transfer_type`+`ground` (own-request vs administrative differ in TTA, transfer grant, joining-time-pay admissibility), both via the `sr_outbox`. The transit period is **paid duty/leave** (`joining_time_pay_admissible`). An explicit **in-transit custodian** owns pay/attendance/leave/headcount/discipline during `IN_TRANSIT`, with an integrity rule preventing dual/zero posting (5.6-12). SR `RELIEVING`/`JOINING` events assert **no break in qualifying service** (5.6-11).
- **Acceptance Criteria:**
  1. Relieving enqueues a `PAY_CONTINUITY` (not pay-stop) signal and an `ENTITLEMENT` signal keyed on `transfer_type`+`ground`.
  2. `joining_time_pay_admissible` computed by policy (`JOINING_TIME_PAY` rule) and stored on the order.
  3. While `IN_TRANSIT`, exactly one custodian office is set; dual/null custody is blocked (`409`/`ERR-G05-DUAL-POSTING`).
  4. SR `RELIEVING` and `JOINING` events carry `service_continuity_asserted=true` unless an explicit break (abandonment) is recorded.
  5. Headcount/budget reports count the in-transit employee exactly once (against custodian).
- **Business Rules:** Custodian defaults to destination for substantive transfers (configurable per policy); own-request transfers may have reduced joining-time-pay per rule; abandonment (FR-018) breaks continuity explicitly.
- **Data Model References:** `transfer_orders` (`in_transit_custody_org_unit_id`,`joining_time_pay_admissible`,`entitlement_ref`), `relieving_orders` (`pay_continuity_signalled`), `joining_reports` (`service_continuity_asserted`,`pay_continuity_resumed`), `sr_outbox`, `transfer_policy_rules`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/orders/{id}/custody` |
  | POST | `/api/v1/transfers/orders/{id}/custody` (set/override custodian) |
  | GET | `/api/v1/transfers/orders/{id}/entitlement` |
- **UI Behavior Notes:** Order detail shows custodian office, continuity status, entitlement reference; relieving/joining confirmation explicitly states "pay continued" (never "pay stopped"); headcount reports flag custody.
- **Edge Cases:** Custodian office dissolved mid-transit (re-assign + audit); own-request with no joining-time pay; abandonment breaking continuity; entitlement service (G10) unavailable (outbox retry).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ServiceContinuityService`, `CustodyAssigner`, `EntitlementSignalClient(G10)`, `SrOutboxWriter` |
  | Backend Flow | On relieve: compute `joining_time_pay_admissible`, set custodian, enqueue `PAY_CONTINUITY`+`ENTITLEMENT`; on join: resume continuity, clear custody (G01 authoritative) |
  | Data Operations | UPDATE `transfer_orders`,`relieving_orders`,`joining_reports`; INSERT `sr_outbox`; P05 trigger |
  | Validation | Single-custodian invariant (5.6-12); continuity assertion (5.6-11); entitlement keying |
  | Authorization | HR set; Authority override custodian (P02) |
  | State Changes & Side Effects | Continuity + custody fields; G10 entitlement/continuity; SR continuity assertion |
  | Failure Handling | G10 via outbox retry; dual/null custody → `409`/`ERR-G05-DUAL-POSTING` |
  | Dependencies | FR-008/010/012/018, G10, G12 |
  | Test Guidance | **Pay-continuity (no gap) end-to-end**; **single-custodian (no dual/zero posting)**; entitlement-by-type; continuity assertion in SR |

### FR-G05-016 — Authority Forced-Action Powers (deemed-clearance, handover-under-protest, deemed-relief)
- **Module:** G05 · Authority Forced-Action
- **Primary Role(s):** Transfer Authority, HR Officer (initiator), Auditor
- **User Story:** *As a Transfer Authority, I want a single, audited forced-action power to break human-conflict deadlocks — non-responsive clearance, hostile handover, source refusing to relieve — so an employee is never trapped indefinitely.*
- **Description:** One mechanism (`forced_action_type`) covering: `DEEMED_CLEARED` (after P01 SLA + escalation `OFFICER→DEPT_HEAD→AUTHORITY`, FR-006), `HANDOVER_UNDER_PROTEST` (after dispute SLA, FR-007), and `DEEMED_RELIEF`/`stand_relieved` (FR-008). Each requires a Transfer Authority (P02), a mandatory `forced_action_reason`, and the mutated row carries reason + actor captured by the **P05 trigger**; the transferee may never be the granting Authority (SoD via P01/P02).
- **Acceptance Criteria:**
  1. Each forced action is gated to Transfer Authority + mandatory reason + recorded approver (P02 + P05).
  2. `DEEMED_CLEARED` only after the branch's P01 SLA breach and escalation chain exhausted (or Authority-justified emergency).
  3. `HANDOVER_UNDER_PROTEST` only after `dispute_sla_due_at`; preserves the underlying dispute.
  4. `DEEMED_RELIEF` issues/marks a relieving order with `deemed_relief=true`, satisfying the relieving precondition (5.6-2).
  5. Every forced action independently queryable for audit/analytics (P05 / G14).
- **Business Rules:** Forced actions do not erase dues/disputes — they unblock the lifecycle while the financial/charge dispute proceeds separately (and may signal G10 recovery). Transferee-exclusion enforced.
- **Data Model References:** `clearance_items`, `charge_handovers`, `relieving_orders` (forced-action fields), `audit_log` (P05).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/clearance/items/{id}/deem-cleared` |
  | POST | `/api/v1/charge-handovers/{id}/under-protest` |
  | POST | `/api/v1/relieving-orders/{id}/deemed-relieve` |
  | GET | `/api/v1/transfers/forced-actions?type=&cursor=` |
- **UI Behavior Notes:** Authority-only forced-action drawer with mandatory reason (≥ 20 chars, `VAL-COMMENT`), escalation/dispute context shown, confirmation listing downstream effects; forced-action audit log view (P05).
- **Edge Cases:** Forced action attempted before SLA/escalation exhausted (blocked `409`/`ERR-G05-FORCED-PRECOND` unless emergency-justified); transferee attempts self-forced-action (`403`/`ERR-FORBIDDEN`); concurrent forced action + officer clearance.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ForcedActionService`, `DeemedClearanceController`, `UnderProtestController`, `DeemedRelieveController` |
  | Backend Flow | Verify Authority + precondition (P01 SLA/escalation/dispute) → set `forced_action_*` → unblock downstream gate → P05 trigger |
  | Data Operations | UPDATE target entity forced-action fields (reason+actor); P05 captures |
  | Validation | Authority role (P02); reason mandatory; precondition exhausted; transferee-exclusion |
  | Authorization | Transfer Authority only (P02) |
  | State Changes & Side Effects | `DEEMED_CLEARED`/`UNDER_PROTEST`/`DEEMED_RELIEVED`; downstream lifecycle unblocked |
  | Failure Handling | Precondition not met → `409`/`ERR-G05-FORCED-PRECOND`; audit always written |
  | Dependencies | FR-006/007/008 |
  | Test Guidance | **Forced-action audit (reason+actor)**; SLA/escalation precondition; transferee-exclusion; dispute preserved |

### FR-G05-017 — Representation, Stay-Order & Retention Hold
- **Module:** G05 · Representation & Holds
- **Primary Role(s):** Employee, HR Officer, Transfer Authority, Auditor
- **User Story:** *As the organisation, I want representations, court/tribunal stays, and retention requests to pause a transfer order at any pre-join stage with full audit, so contested transfers are handled lawfully instead of forcing an irreversible move.*
- **Description:** `transfer_representations` entity and `STAY_HOLD` order status. A representation/stay/retention request can be filed against an order and decided through a **P01 decision flow**; when upheld or a court stay is in force, the order is set `STAY_HOLD` (`hold_active=true`), blocking all forward transitions (5.6-16) until vacated. Decisions (`ALLOW`/`DENY`/`MODIFY`/`VACATE`) are recorded with authority and validity. Stay-order documents are stored in G13.
- **Acceptance Criteria:**
  1. A representation/stay/retention can be filed against any order pre-join, referencing a G13 document and authority/case number.
  2. An upheld representation or active court stay transitions the order to `STAY_HOLD` and sets `hold_active=true`.
  3. While `hold_active`, no forward transition (relieve/join) is permitted (`409`/`ERR-G05-STAY-HOLD`).
  4. Vacating the hold (`VACATE`/expiry) restores the prior status via `TransferOrderStateService` with P05 audit.
  5. All filings/decisions are audited (P05) and visible to Auditor.
- **Business Rules:** Court stays (`COURT_STAY`) may only be vacated on recorded court order/expiry; retention requests follow Authority decision (P01/P02); holds do not delete the order.
- **Data Model References:** `transfer_representations`, `transfer_orders` (`status`,`hold_active`), `documents` (G13), `audit_log` (P05).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/representations` |
  | POST | `/api/v1/representations/{id}/decide` |
  | POST | `/api/v1/representations/{id}/vacate` |
  | GET | `/api/v1/transfers/holds?status=&cursor=` |
- **UI Behavior Notes:** Representation filing form (W.2: type, authority ref, document); hold banner on order detail; Authority decision modal (approval action bar); holds register.
- **Edge Cases:** Stay filed mid-relieving (hold blocks further steps, already-issued relieving preserved); overlapping representations; stay expiry auto-vacate (`JOB`/scheduled); retention request denied.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `RepresentationService`, `HoldController`, `TransferOrderStateService`, `HoldsRegister` |
  | Backend Flow | File representation → P01 review/decide → if upheld/stay set `STAY_HOLD`+`hold_active` → block transitions → vacate restores status |
  | Data Operations | INSERT/UPDATE `transfer_representations`; UPDATE `transfer_orders.status`/`hold_active`; P05 trigger |
  | Validation | Pre-join stage; type-specific vacate rules; authz (P02) |
  | Authorization | File: employee/HR; decide/vacate: Transfer Authority (P02) |
  | State Changes & Side Effects | Order → `STAY_HOLD` ↔ prior status; X.2 notifications to parties |
  | Failure Handling | Concurrent transition attempt during hold → `409`/`ERR-G05-STAY-HOLD` |
  | Dependencies | FR-004/008/010, G13 |
  | Test Guidance | Hold blocks all forward transitions; vacate restores; court-stay vacate rules; overlapping holds |

### FR-G05-018 — Non-Joining / Abandonment Resolution
- **Module:** G05 · Non-Joining / Abandonment
- **Primary Role(s):** HR Officer (Destination), Transfer Authority, Disciplinary Authority (G09)
- **User Story:** *As HR, I want a defined path for an employee who never joins beyond grace, so they do not sit in permanent IN_TRANSIT limbo with undefined pay and posting.*
- **Description:** When transit exceeds admissible + grace, the joining report enters `LATE_JOINING_REVIEW`. The Authority decides (P01) between **`REVERT_TO_SOURCE`** (re-join at source as a reverse joining, restoring source posting + custody) and **`ABANDONED`** (continuity break recorded, **G09 disciplinary trigger** raised via outbox). The limbo-period pay status is explicitly defined (continuity until grace; thereafter per Authority decision — paid pending inquiry or stopped on abandonment), signalled to G10.
- **Acceptance Criteria:**
  1. Transit beyond admissible + grace routes the joining report to `LATE_JOINING_REVIEW`.
  2. Authority decides `REVERT_TO_SOURCE` or `ABANDONED` with mandatory reason (P02).
  3. `REVERT_TO_SOURCE` restores source posting/custody (via G01) and records a reverse joining (order → `REVERTED_TO_SOURCE`).
  4. `ABANDONED` records a continuity break (`service_continuity_asserted=false`), raises a **G09 disciplinary trigger** (outbox), and sets pay status per decision (order → `ABANDONED`).
  5. The limbo-period pay treatment is recorded and signalled to G10.
- **Business Rules:** Abandonment is the only path that breaks service continuity (5.6-11 exception); revert-to-source re-uses joining mechanics in reverse; the G09 trigger is a signal, not a proceeding (owned by G09).
- **Data Model References:** `joining_reports` (`status`), `transfer_orders` (`status`,custody), `sr_outbox` (G09/G10 signals), `audit_log` (P05).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/late-joining?cursor=` |
  | POST | `/api/v1/joining-reports/{id}/revert-to-source` |
  | POST | `/api/v1/joining-reports/{id}/abandon` |
- **UI Behavior Notes:** Late-joining review queue; Authority decision modal (revert vs abandon) with reason and pay-status selector; outcome banner.
- **Edge Cases:** Employee joins during review (cancel review); revert when source post already filled (additional/supernumerary handling); abandonment then later representation.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `LateJoiningService`, `AbandonmentOrchestrator`, `TransferOrderStateService`, `DisciplinarySignalClient(G09)` |
  | Backend Flow | Detect overdue (FR-009) → `LATE_JOINING_REVIEW` → Authority decide (P01) → revert (restore source, G01) or abandon (break continuity, G09 trigger, pay status) |
  | Data Operations | UPDATE `joining_reports`,`transfer_orders` (custody/status); INSERT `sr_outbox` (G09/G10); P05 trigger |
  | Validation | Grace breach; decision authz + reason (P02); pay-status capture |
  | Authorization | HR queue; Transfer Authority decide (P02) |
  | State Changes & Side Effects | Order → `REVERTED_TO_SOURCE`/`ABANDONED`; G09 trigger; G10 pay status |
  | Failure Handling | G09/G10 via outbox retry; join-during-review cancels |
  | Dependencies | FR-009/010/012/015, G09, G10 |
  | Test Guidance | Limbo pay defined; revert restores source/custody; abandonment continuity break + G09 trigger |

### FR-G05-019 — Interactive Counselling Session
- **Module:** G05 · Interactive Counselling
- **Primary Role(s):** Transfer Authority / Presiding Officer, HR Admin, Employee
- **User Story:** *As a Transfer Authority running a cadre counselling, I want candidates called in seniority/merit order to choose live from remaining vacancies with an immutable choice log, so allotment is observed, contestable, and defensible in a tribunal.*
- **Description:** For `drive_type=COUNSELLING`, a `counselling_session` is created with a per-candidate turn order (`SENIORITY`/`MERIT`). This is a **gov-authored live allotment surface on the P05 audit substrate — it does not re-implement P01**; it feeds the P01 order flow (FR-004). When a candidate's turn is live, the system **locks the candidate's available vacancies** (one live turn at a time), the candidate chooses (or passes/declines), and an **immutable `counselling_choices` row** (append-only, P05-captured) is recorded by the presiding officer. The chosen vacancy converts to a `vacancy_reservation` and feeds order generation. The batch path (FR-003) remains for `SENIORITY`/`MERIT`/`MANUAL` drives — the two coexist, selected by `drive_type`.
- **Acceptance Criteria:**
  1. Candidates ordered by `turn_order_method`; only the current-turn candidate may choose (`409`/`ERR-G05-COUNSEL-TURN` otherwise).
  2. During a live turn the chosen-from vacancy set is locked; no concurrent allotment of the same vacancy.
  3. Each choice (`CHOSEN`/`PASSED`/`DECLINED`/`AUTO_PASS_TIMEOUT`/`ABSENT`) recorded immutably with timestamp and recording officer.
  4. A turn times out after `turn_timeout_seconds` → `AUTO_PASS_TIMEOUT` (`JOB-G05-COUNSEL-TIMEOUT`).
  5. A `CHOSEN` vacancy becomes a `RESERVED` `vacancy_reservation`; the choice log is append-only and exportable.
- **Business Rules:** Candidates must pass FR-002; choice log never edited/deleted (5.6-10); presiding officer records on behalf (observed); seniority ties broken deterministically by `service_no`.
- **Data Model References:** `counselling_sessions`, `counselling_choices`, `vacancy_positions`, `vacancy_reservations`, `transfer_drives`, `employees` (G01).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives/{id}/counselling-sessions` |
  | POST | `/api/v1/counselling-sessions/{id}/advance-turn` |
  | POST | `/api/v1/counselling-sessions/{id}/record-choice` *(Idempotency-Key)* |
  | GET | `/api/v1/counselling-sessions/{id}/choices?cursor=` |
- **UI Behavior Notes:** Presiding console showing turn queue, live candidate, remaining vacancies (locked during turn), record-choice action, countdown timer; public choice-log view for transparency.
- **Edge Cases:** Candidate absent (`ABSENT`, turn advances); two officers recording simultaneously (single live turn lock); vacancy exhausted before a turn; session paused/resumed.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `CounsellingSessionService`, `TurnOrchestrator`, `VacancyLockManager`, `ChoiceLogWriter` (append-only), `PresidingConsole` |
  | Backend Flow | Build turn order → advance turn (lock vacancies for current candidate) → record choice (immutable) → create reservation → next turn |
  | Data Operations | INSERT `counselling_sessions`; append `counselling_choices`; `SELECT … FOR UPDATE` vacancy lock; INSERT `vacancy_reservations`; P05 trigger |
  | Validation | Single live turn; current-turn-only choice; timeout; tie-break |
  | Authorization | Presiding Officer/HR Admin record; employee views own turn (P02) |
  | State Changes & Side Effects | Session `SCHEDULED`→`IN_PROGRESS`→`COMPLETED`; reservations created |
  | Failure Handling | Officer disconnect → turn lock TTL; timeout auto-pass |
  | Dependencies | FR-002/003/004 |
  | Test Guidance | Single-live-turn lock; immutable choice log; timeout auto-pass; tie-break; reservation creation |

### FR-G05-020 — Order Proof-of-Service & Acknowledgement
- **Module:** G05 · Proof-of-Service
- **Primary Role(s):** HR Officer, Employee, Transfer Authority, Auditor
- **User Story:** *As HR, I want recorded proof that the transfer order was served on the employee and (where possible) acknowledged, so relieve-by deadlines and non-compliance discipline rest on the served date, not the order date.*
- **Description:** On publication, the order is served through a `delivery_channel` (in-app/email/SMS via **X.2**; registered-post/hand-delivery/published-notice manual) and an `order_acknowledgements` row records `served_on_date`. The employee may acknowledge (`ACKNOWLEDGED`, W.2 ack control); non-acknowledgement after policy time, or returned registered post / published notice, yields `DEEMED_SERVED` (`JOB-G05-SERVE-DEEM`); refusal yields `REFUSED`. `transfer_orders.served_on_date`/`acknowledged_at` mirror the canonical record, and **`relieve_by_date` enforcement references the served date** (5.6-15).
- **Acceptance Criteria:**
  1. Publication creates an acknowledgement row with channel and `served_on_date`.
  2. Employee acknowledgement sets `ACKNOWLEDGED` + `acknowledged_at`.
  3. Non-ack within policy window / returned post / published notice → `DEEMED_SERVED` with reason; refusal → `REFUSED`.
  4. An order cannot enter `RELIEVING_IN_PROGRESS` without a `SERVED`/`DEEMED_SERVED`/`ACKNOWLEDGED` row (5.6-15 → `409`/`ERR-G05-NOT-SERVED`).
  5. `relieve_by_date` computed from `served_on_date`, not `order_date`.
- **Business Rules:** Registered-post/hand-delivery require a `proof_document_id` (G13); deemed-served requires recorded reason; served date is the statutory basis for non-compliance.
- **Data Model References:** `order_acknowledgements`, `transfer_orders` (`served_on_date`,`acknowledged_at`,`relieve_by_date`), `documents` (G13), `notifications` (X.2).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/serve` |
  | POST | `/api/v1/transfers/orders/{id}/acknowledge` |
  | POST | `/api/v1/transfers/orders/{id}/deem-served` |
  | GET | `/api/v1/transfers/orders/{id}/service-record` |
- **UI Behavior Notes:** Service panel (channel selector, proof upload, served date); employee acknowledgement prompt on My Transfers (Me workspace); deemed-served action with reason; service-record timeline.
- **Edge Cases:** Employee on leave/unreachable (registered post → deemed); refusal to acknowledge; multiple delivery attempts; served before publish (blocked).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `OrderServiceController`, `AcknowledgementService`, `DeemedServedController(JOB-G05-SERVE-DEEM)`, `ServicePanel` |
  | Backend Flow | On publish create service record → notify (X.2) → employee ack OR deemed/refused → set order served fields → compute relieve_by from served date |
  | Data Operations | INSERT/UPDATE `order_acknowledgements`,`transfer_orders` (served fields); P05 trigger; G13 doc ref |
  | Validation | Proof required for postal/hand (`VAL-FILE`); deemed reason; serve-after-publish only |
  | Authorization | Serve/deem: HR; acknowledge: employee (own) (P02) |
  | State Changes & Side Effects | `SERVED`→`ACKNOWLEDGED`/`DEEMED_SERVED`/`REFUSED`; relieve-by recomputed |
  | Failure Handling | X.2 notification failure retried; postal proof upload retry |
  | Dependencies | FR-004/008, G13 |
  | Test Guidance | Served-date precedence for relieve-by; deemed-served reasons; relieving blocked without service; refusal path |

### FR-G05-021 — Joining-Sequence & Inter-se Seniority Integrity
- **Module:** G05 · Joining-Sequence & Seniority
- **Primary Role(s):** HR Officer (Destination), System, Transfer Authority, Auditor
- **User Story:** *As HR, I want a defensible inter-se joining order when several transferees join the same cadre/post, because joining-date order sets seniority that G06 consumes and that transfer litigation hinges on.*
- **Description:** On joining confirmation, assigns `joining_sequence_no` ordered by `reported_date` then `joining_time` (FN before AN) then a deterministic `inter_se_tiebreak_key` (default `service_no`) for joiners sharing (`dest_org_unit_id`,`dest_designation_id`,`joining_date`). The tuple is unique (5.6-14) and **exposed to G06 via the `SENIORITY_FEED` outbox event** so seniority computation is reproducible and contestable.
- **Acceptance Criteria:**
  1. Concurrent same-cadre/post joinings on a date receive distinct, contiguous `joining_sequence_no`.
  2. Ordering is `reported_date` → `joining_time` (FN<AN) → `inter_se_tiebreak_key`.
  3. The sequence tuple is unique per (`dest_org_unit_id`,`dest_designation_id`,`joining_date`).
  4. The sequence + tie-break key exposed to G06 (outbox).
  5. Authority may adjust sequence only with recorded justification (P05 audited).
- **Business Rules:** Tie-break deterministic (`service_no` default; policy-configurable, `VAL-G05-SENIORITY`); manual re-sequencing is Authority-only and audited; the sequence feeds G06 but seniority math is owned by G06.
- **Data Model References:** `joining_reports` (`joining_sequence_no`,`inter_se_tiebreak_key`), G06 (consumer), `audit_log` (P05).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/joining-sequence?office=&designation=&date=` |
  | POST | `/api/v1/joining-reports/{id}/resequence` |
- **UI Behavior Notes:** Destination HR joining-sequence grid for the date showing computed order; Authority re-sequence action with justification; G06 export indicator.
- **Edge Cases:** Same reported_date + same FN/AN + tie-break collision (impossible by `service_no` uniqueness); back-dated joining; re-sequencing after G06 consumption (compensating notice).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `JoiningSequencer`, `SeniorityFeedClient(G06)`, `SequenceGrid` |
  | Backend Flow | On confirm: compute sequence within (office,designation,date) with deterministic ordering → persist → feed G06 (outbox) |
  | Data Operations | UPDATE `joining_reports` sequence fields (unique constraint); P05 trigger on resequence |
  | Validation | Uniqueness; deterministic ordering; resequence authz (P02) |
  | Authorization | System assign; Authority resequence (P02) |
  | State Changes & Side Effects | Sequence assigned; G06 fed (outbox) |
  | Failure Handling | G06 feed via outbox retry; uniqueness violation → recompute |
  | Dependencies | FR-010, G06 |
  | Test Guidance | **Inter-se ordering determinism**; uniqueness; FN/AN precedence; resequence audit |

### FR-G05-022 — Government Quarters / Estate Retention & Licence-Fee Recovery
- **Module:** G05 · Quarters / Estate
- **Primary Role(s):** Estate / Quarters Officer, HR Officer, Transfer Authority, Payroll Officer, Employee
- **User Story:** *As an estate officer, I want official-accommodation retention, vacation timelines, and licence-fee recovery modelled as a sub-process — not one checklist tick — so post-transfer accommodation is tracked and recovered statutorily.*
- **Description:** Models a `quarter_allotment` for transferees occupying official accommodation: retention-allowed flag (Authority-approved, P01/P02), `vacate_by_date`, vacation tracking, normal/penal `licence_fee_rate`, and a **licence-fee-recovery signal to G10** (outbox) when accommodation is retained beyond entitlement. Linked to the `ESTATE_QUARTERS` clearance branch (FR-006) but richer: clearance can be `CLEARED_WITH_DUES` with an active retention rather than blocking relieving. Overstay flips penal rate via **`JOB-G05-QTR-OVERSTAY`** (X.1).
- **Acceptance Criteria:**
  1. A quarter retention record can be created/approved with `vacate_by_date` and licence-fee rate.
  2. Retention beyond permissible period flips `penal_rate_applies=true` and status `OVERSTAY` (`JOB-G05-QTR-OVERSTAY`).
  3. An overstay/retention raises a **licence-fee-recovery signal to G10** with reference (outbox).
  4. Vacation recording sets `VACATED` + `vacated_on`; closes the estate clearance dependency.
  5. The estate clearance branch does not hard-block relieving when retention is approved (recovery tracked separately).
- **Business Rules:** Retention requires Authority approval; penal rate per policy after permissible months; licence-fee recovery is a G10 signal (recovery owned by G10); vacation reconciles the estate clearance branch.
- **Data Model References:** `quarter_allotments`, `clearance_items` (ESTATE_QUARTERS), `sr_outbox` (G10 licence-fee signal), `transfer_orders`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/quarter-retention` |
  | POST | `/api/v1/quarter-allotments/{id}/approve-retention` |
  | POST | `/api/v1/quarter-allotments/{id}/record-vacation` |
  | GET | `/api/v1/quarter-allotments?status=&cursor=` |
- **UI Behavior Notes:** Estate panel with retention request/approval, vacate-by countdown, penal-rate indicator, vacation recording; licence-fee recovery status; estate register.
- **Edge Cases:** Retention denied (must vacate by relieving); overstay beyond all limits (escalation); vacation before relieving; external/leased accommodation.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `QuarterRetentionService`, `LicenceFeeSignalClient(G10)`, `OverstayJob(JOB-G05-QTR-OVERSTAY)`, `EstateRegister` |
  | Backend Flow | Create/approve retention (P01) → vacate-by clock → overstay flips penal + G10 signal (outbox) → vacation closes estate clearance |
  | Data Operations | INSERT/UPDATE `quarter_allotments`; UPDATE estate `clearance_items`; INSERT `sr_outbox` (G10); P05 trigger |
  | Validation | Authority approval; vacate-by ≥ LWD; penal-rate policy (`ERR-G05-QUARTER-OVERSTAY`) |
  | Authorization | Estate Officer record; Authority approve retention (P02) |
  | State Changes & Side Effects | `OCCUPIED`→`RETENTION_APPROVED`→`VACATION_DUE`→`VACATED`/`OVERSTAY`; G10 licence-fee recovery |
  | Failure Handling | G10 signal via outbox retry; overstay escalation |
  | Dependencies | FR-006/008, G10 |
  | Test Guidance | Retention non-blocking relieving; penal-rate flip; licence-fee recovery signal; vacation closes clearance |

---
## 7. UI Requirements

> Built on the platform **canonical UI-state standard** (Foundation §3: empty / loading / error / no-permission / partial-data), the **Workspace switcher** (Me / My Team / Admin, Platform §6.5), the shared **approval action bar** and component vocabulary (inline-edit, masked field per RBAC §3.9, multi-step wizard, list+filter+bulk toolbar, attachment `VAL-FILE`, comment `VAL-COMMENT`, effective-date picker, audit-trail panel). Visual styling is the design system's job.

### 7.1 Screens & layouts
| Screen | Workspace | Primary users | Key elements | States covered |
|---|---|---|---|---|
| Transfer Request Wizard | Me / Admin | Employee, HR | Type selector (canonical taxonomy), details, grounds+docs (**sensitive uploads marked restricted**), eligibility banner, review | empty/loading/error/success/permission |
| My Transfers (self-service) | Me | Employee | Status timeline, current order, **service-acknowledgement prompt**, relieving/joining tasks, **hold banner** | empty/loading/error |
| Transfer Orders Console | Admin | HR, Authority | Order list (filter status/office/class), composer (+`order_class`, distance band), **P01 approval timeline + approval action bar**, **gapless number**, PDF viewer | all |
| Order Service Panel | Admin / Me | HR, Employee | Channel selector, proof upload, served/ack/deemed-served | all |
| Drive Console | Admin | HR Admin, Authority | Stage stepper, candidate grid, batch progress, quarantine | all |
| Counselling Session Console | Admin | Presiding Officer, Employee | Turn queue, live candidate, **locked remaining vacancies**, record-choice, countdown, choice log | all |
| Counselling/Preferences | Me | Employee | Drag-rank preferences, window countdown | empty/loading/error |
| Clearance Board | Admin / My Team | HR Source, Clearance/Estate Officers, Employee | Per-department cards (P01 branches), **SLA countdown + escalation badge**, dues entry, evidence upload, **deem-cleared (Authority)**, tracker | all incl. blocked |
| Charge Handover | Me / My Team | Employee, Receiving Officer, Authority | Asset table, cash fields, note upload, accept/dispute, **under-protest** | all |
| Relieving Panel | Admin | HR Source, Authority | Readiness gauges, LWD picker, **deemed-relieve**, downstream signal preview (**pay-continuity**, custody) | all |
| In-Transit Register | Admin | HR, Auditor | Elapsed/limit bars, **custodian column**, overdue highlight, extend action | empty/loading |
| Joining Wizard | Me / Admin | Employee, HR Dest | Report, charge assumption, confirm, transit summary, **joining-sequence**, late-joining banner | all |
| Late-Joining / Abandonment Queue | Admin | HR Dest, Authority | Review queue, revert-vs-abandon decision, pay-status selector | all |
| Representation & Holds Register | Me / Admin | Employee, HR, Authority, Auditor | Filing form, hold banner, decision modal, holds list | all |
| Deputation Register | Admin | HR Admin, Authority | Tenure timeline, extension, repatriation action | all |
| Estate / Quarters Register | Admin / Me | Estate Officer, Authority, Employee | Retention request/approval, vacate-by countdown, penal-rate, vacation recording | all |
| SR Reconciliation Console | Admin | SR Custodian | **Outbox PENDING/FAILED/DEAD_LETTERED**, retry, per-order SR timeline | all |
| Transfer Dashboard | Admin | Authority, Admin, Auditor | KPI cards, bottleneck chart, custody/violation/dead-letter exceptions, export; **map (Phase-2 flag)** (G14) | loading/empty/error |

### 7.2 Cross-cutting UI rules
- Responsive breakpoints **375 / 768 / 1280 px**, touch targets ≥ 44×44 px; collapsible sidebar with menu icons + hamburger on small screens (per platform NFR §8.2).
- WCAG 2.1 AA: keyboard navigation, focus order, ARIA labels, contrast ≥ 4.5:1.
- Dark mode via design tokens; no hardcoded colors.
- Every list **cursor-paginated** (default 25 / max 100) with empty/loading/error states; destructive/forced actions confirmed with typed reason (`ERR-REASON-REQ`).
- Real fields and live data only — no skeleton placeholders.
- Toasts for async results; inline validation with field-level error from the platform error envelope; copy referenced by `ERR-*`/`ERR-G05-*` id, never inlined.
- Bilingual labels (English + regional) on statutory documents/orders (W.2 i18n).
- **Masked fields** (government identifiers, financial) per RBAC §3.9 / P02 field-mask-on-serialization; `E·AR` fields use the **Request-change** control routing to a P01 flow, never a direct write.
- **Sensitive-ground documents render behind a restricted-access gate with a P05 access-logged "reveal" action**.
- **Pay language is always "continued", never "stopped"** in transfer flows.

---

## 8. API & Integration

### 8.1 Conventions (platform-adopted verbatim)
REST under **`/api/v1`**; **Bearer JWT** carrying the session's resolved roles + tenant/entity scope; **P02 `Authorization.check`** per request (endpoints never re-implement permission logic); **cursor pagination only** (`?limit=` default **25** / max **100** + `cursor=`, response `next_cursor`); **`Idempotency-Key`** header on workflow-initiating / external-signal POSTs (24h replay → original result); **`X-Correlation-Id`** on every request, echoed and written to every audit/log line; `?sort=field:asc|desc` + per-endpoint filters; effective-dated mutations accept `effective_from` (staged via `JOB-G05-EFFDATE`, not live); ISO-8601 UTC storage, `DD-MMM-YYYY` display. All `transfer_orders.status` mutations route through `TransferOrderStateService` (§16.6) which calls P01 + P05.

### 8.2 Error envelope & codes (platform 8-code table + `ERR-G05-*` ids)
**Canonical envelope:** `{ "error": { "code", "message", "field", "details": {} } }` with the correlation id carried in the **`X-Correlation-Id` response header** (no body `requestId`). 2xx returns the resource payload.

**Standard platform codes (Foundation §1):**
| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | 422 | input failed a `VAL-*` / `VAL-G05-*` rule |
| `UNAUTHENTICATED` | 401 | no/invalid session |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks existence of out-of-scope records) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state conflict |
| `PRECONDITION_FAILED` | 412 | a required precondition is not met |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error (incl. mapped upstream failure) |

**G05 module conditions mapped onto the platform codes (message id → HTTP code):**
| `ERR-G05-*` id | Platform code (HTTP) | Meaning |
|---|---|---|
| `ERR-G05-ACTIVE-TRANSFER` | `CONFLICT` (409) | Employee already has an active **substantive** order |
| `ERR-G05-ELIGIBILITY-BLOCKED` | `VALIDATION_FAILED` (422) | Hard-block policy failure |
| `ERR-G05-BAN-WINDOW` | `VALIDATION_FAILED` (422) | Transfer falls in a ban period |
| `ERR-G05-CLEARANCE-INCOMPLETE` | `PRECONDITION_FAILED` (412) | Relieving attempted before clearance/deemed |
| `ERR-G05-HANDOVER-DISPUTED` | `CONFLICT` (409) | Charge handover not accepted/under-protest |
| `ERR-G05-NOT-IN-TRANSIT` | `CONFLICT` (409) | Joining before relief |
| `ERR-G05-DEPUTATION-CAP` | `VALIDATION_FAILED` (422) | Extension beyond max tenure |
| `ERR-G05-VACANCY-FULL` | `CONFLICT` (409) | Allotment/join to filled vacancy (incl. join-time re-check) |
| `ERR-G05-DUAL-POSTING` | `CONFLICT` (409) | Dual/zero in-transit custody |
| `ERR-G05-STAY-HOLD` | `CONFLICT` (409) | Forward transition blocked by active hold |
| `ERR-G05-MUTUAL-PAIR` | `CONFLICT` (409) | Asymmetric mutual completion |
| `ERR-G05-NOT-SERVED` | `CONFLICT` (409) | Relieving before proof-of-service |
| `ERR-G05-NUMBER-LOCKED` | `CONFLICT` (409) | Gapless number reservation contention (retry) |
| `ERR-G05-COUNSEL-TURN` | `CONFLICT` (409) | Choice attempted out of turn |
| `ERR-G05-FORCED-PRECOND` | `CONFLICT` (409) | Forced action before SLA/escalation exhausted |
| `ERR-G05-RELIEVE-DATE` | `VALIDATION_FAILED` (422) | Relieving/joining date inconsistency (`VAL-G05-TRANSFER-ORDER`) |
| `ERR-G05-QUARTER-OVERSTAY` | `VALIDATION_FAILED` (422) | Accommodation retained beyond limit |

> **503 is dropped** (no 503 in the platform table). Upstream unavailability of G01/G06/G09/G10/G12/G13/Holiday-master is handled by **X.3 per-integration error mapping** → `INTERNAL (500)` / `ERR-LOADFAIL` for synchronous reads, and by **`sr_outbox` retry/dead-letter** for asynchronous signals — never a blocking 503. Shared `ERR-*` ids (`ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-REASON-REQ`) are reused from Foundation §5; `ERR-G05-*` ids register against the Foundation message catalogue.

### 8.3 Integration points
| System | Direction | Mechanism | Purpose |
|---|---|---|---|
| **G01** Employee Master + org placement | Read/Write | G01 service + outbox `POSTING_UPDATE` | Validate transferee; **G01 owns org-placement update on join**; reverse on revoke/abandon |
| **G06** Promotion/Seniority | Read/Trigger | read-through + outbox `SENIORITY_FEED` | Promotion-linked trigger; **sanctioned-strength & seniority read-through**; **joining-sequence consumer** |
| **G09** Disciplinary | Signal | outbox `DISCIPLINARY_TRIGGER` | Abandonment disciplinary trigger |
| **G10** Payroll | Signal | outbox (G10 events) | **Pay-continuity** (not stop/start), **entitlement by transfer_type+ground**, LPC, dues recovery, **licence-fee recovery** |
| **G12** Digital SR (on P05 substrate) | Write | `sr_outbox` → X.3 | SR events (order/relieve/join) with **continuity assertion** |
| **G13** Documents | Read/Write | G13 service + doc-generation | Order/clearance/handover/joining PDFs; **sensitive document class** for medical/spouse/compassionate |
| **Holiday & Region master** (Org Admin Master) | Read | master query | Regional working-day/holiday calendar for joining-time (no silent fallback) |
| **P01** WorkflowEngine | Read/Write | service contract | Approval routing, `PARALLEL_ALL_OF` clearance, SLA runtime |
| **P02** Authorization | Read | `Authorization.check` | Per-request authz + field masking |
| **P05** Audit | Write | DB-trigger | Immutable audit of every mutation |
| **X.1 / X.2 / X.3** | Read/Write | runner / notification / integration | Jobs, statutory notifications, outbound delivery |
| **G14** Analytics | Read | `analytics.*` | Dashboards & reports |

**Holiday/Region master contract:** working-day count between two dates excluding regional holidays/weekends is read from the platform **Holiday & Region master** (`VAL-HOL-RECUR`/`VAL-REGION-STATE`); unavailability defers joining-time computation (FR-G05-009), never silently defaulted.

**G10 signal contract:** `PAY_CONTINUITY{employeeId, fromDate, custodyOrgUnit, continue:true}`, `ENTITLEMENT{employeeId, transferType, ground, distanceBand, joiningTimePayAdmissible}`, `LPC_REQUEST{...}`, `LICENCE_FEE_RECOVERY{employeeId, quarterRef, rate, penal}` — all idempotent via the outbox key, delivered on X.3.

### 8.4 JSON examples
**Create transfer request — request**
```json
POST /api/v1/transfers/requests
Idempotency-Key: 3f1c…
X-Correlation-Id: req-9f2c…
{
  "employeeId": "a1111111-1111-1111-1111-111111111111",
  "transferType": "REQUEST",
  "requestOrigin": "SELF",
  "sourceOrgUnitId": "ou-dist-a",
  "requestedDestOrgUnitId": "ou-dist-b",
  "ground": "SPOUSE",
  "priorityCategory": "PROTECTED_SPOUSE",
  "sensitiveDocumentIds": ["doc-spouse-posting-001"],
  "requestedEffectiveDate": "2026-04-15"
}
```
**Relieving — pay-continuity signal (outbox payload)**
```json
{
  "outboxId": "ob-77a1",
  "targetSystem": "G10_PAYROLL",
  "eventType": "PAY_CONTINUITY",
  "idempotencyKey": "G10_PAYROLL:PAY_CONTINUITY:RELIEVING_ORDER:ro-0457:0",
  "payload": {
    "employeeId": "a1111111-...",
    "fromDate": "2026-04-15",
    "custodyOrgUnit": "ou-dist-b",
    "continue": true,
    "joiningTimePayAdmissible": true,
    "transferType": "REQUEST",
    "ground": "SPOUSE"
  }
}
```
**Issue relieving order — error (not served), platform envelope**
```json
HTTP/1.1 409 Conflict
X-Correlation-Id: req-9f2c…
{
  "error": {
    "code": "CONFLICT",
    "message": "Order TO/2026/04/0457 has no recorded proof-of-service; relieving cannot begin.",
    "field": "servedOnDate",
    "details": { "errorId": "ERR-G05-NOT-SERVED" }
  }
}
```
**Confirm joining — response (200)**
```json
{
  "joiningReportId": "jr-0456",
  "joiningReportNo": "JR/2026/04/0456",
  "status": "JOINED_CONFIRMED",
  "joiningDate": "2026-04-15",
  "joiningSequenceNo": 1,
  "interSeTiebreakKey": "EMP-000456",
  "transitDays": 4,
  "transitWithinAdmissible": true,
  "serviceContinuityAsserted": true,
  "srEvent": { "type": "JOINING", "status": "PENDING", "sourceModule": "G05", "sourceReferenceId": "jr-0456", "sourceEventVersion": 1, "factKey": "QSVC:EMP-000456:2026-04-15", "idempotencyKey": "G12_SR:JOINING:TRANSFER_ORDER:to-0456:0" },
  "payContinuityResumed": true,
  "vacancyReservation": "FILLED_ON_JOIN"
}
```
**Deemed-clearance — request (forced action)**
```json
POST /api/v1/clearance/items/ci-0790-it/deem-cleared
{
  "forcedActionReason": "IT officer non-responsive past SLA and escalation to dept-head and Authority; no assets traceable to employee.",
  "forcedActionBy": "user-authority-01"
}
```

---

## 9. Non-Functional Requirements (platform NFR baseline)
| Category | Requirement |
|---|---|
| Performance | Read p95 **< 500ms @ 300 concurrent**; write p95 **< 1500ms**; read-heavy/reports p95 < 300ms cached / < 1000ms uncached; dashboard aggregates < 2s; bulk drive of 1,000 orders < 30 min (async X.1); counselling turn record < 300ms; web LCP (4G) < 2.5s. |
| Availability | **99.5%/month uptime**; `sr_outbox` guarantees no data loss during G10/G12/G01/G09 downtime. |
| Scalability | Horizontal scaling; batch/counselling jobs queue-based (X.1); supports 100k active employees, 20k transfers/year. |
| Security | Bearer JWT + **MFA for high-privilege gov roles** (Transfer/Appointing/Disciplinary Authority); **P02** RBAC + row-level org scope; SoD by P01/P02; OWASP ASVS; parameterised queries only; secrets via `integration_credentials` (P04) / env, never hardcoded. |
| Data integrity | All multi-step writes transactional; external signals via `sr_outbox` (idempotency-key formula); no orphan records; gapless statutory numbering; single-custodian invariant; **`tenant_id`/`entity_id` data-layer scoping** (unscoped query rejected). |
| Auditability | **P05 DB-trigger** captures every mutation (100%, zero gaps) to `audit_log`; auth/RBAC events to `security_audit_log`; **forced actions, overrides, deemed-clearances, resequencing, and sensitive-document access carry dedicated reason+actor**; immutable G12 SR events and counselling choice log; tamper-evidence tracks **OPEN-PLAT-03**. |
| Privacy/Compliance | DPDP Act 2023 alignment; **medical/spouse/compassionate evidence classified as a DPDP sensitive document class in G13 with restricted access and P05 access logging**; PII minimisation (PII Protection Ceiling, masked on serialization); **statutory retention ≥ 7 yr** (never below the statutory floor); no PII in logs. |
| Accessibility | WCAG 2.1 AA across all screens; breakpoints 375/768/1280, touch ≥ 44×44. |
| Observability | Structured logs with `X-Correlation-Id`; metrics (clearance time, P01 SLA breaches, deemed-clearances, transit days, custody exceptions, outbox dead-letter rate, un-overridden violations); job-run audit rows (X.1). |
| Resilience | **RTO < 4h, RPO < 1h**; retries with backoff (X.1 ×3 within dispatch, outbox to `max_attempts`); dead-letter + reconciliation for outbox. |
| i18n/L10n | Bilingual order templates (W.2); regional working-day calendar (Holiday & Region master); locale dates/currency; timezone-aware display. |

### 9.x Privacy — sensitive-ground documents
Documents supporting `MEDICAL`/`SPOUSE`/`COMPASSIONATE` grounds (`sensitive_document_ids`, `sensitive_ground=true`) are stored in **G13 under a statutory sensitive document class**: access restricted to the transferee, the deciding Transfer Authority, and HR officers with an explicit need (P02 field/data scope); **every read is access-logged (P05) with actor + correlation id**; such documents are excluded from general analytics (G14) and never rendered in non-restricted UI contexts. Right-to-erasure applies only to non-statutory data; statutory transfer data has mandated retention with a redaction marker the only audit overwrite path.

---
## 10. Workflow & State Diagrams (state tables)

> All approval gating runs on **P01**; `transfer_orders.status` transitions are executed by `TransferOrderStateService` (which calls P01 + writes via the P05 trigger). The clearance checklist is a **P01 `PARALLEL_ALL_OF` instance**; its SLA/escalation is the P01 SLA runtime.

### 10.1 Transfer Order state table
| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| DRAFT | submit-for-approval | eligibility ≠ hard-block | PENDING_APPROVAL | P01 instance opened |
| PENDING_APPROVAL | approve | maker≠checker (P01/P02), re-eligibility pass | APPROVED | **gapless** order_no, PDF (G13) |
| PENDING_APPROVAL | reject | — | CANCELLED | notify (X.2) |
| APPROVED | publish | PDF present | PUBLISHED | SR `TRANSFER` (→`/sr/ingest`), clearance `PARALLEL_ALL_OF` created, **service initiated** |
| PUBLISHED | serve/acknowledge | — | SERVED | `served_on_date`; relieve_by from served date |
| SERVED | start-relieving | served/deemed-served present | RELIEVING_IN_PROGRESS | — |
| any pre-join | hold | representation upheld / court stay | STAY_HOLD | `hold_active=true`; blocks transitions |
| STAY_HOLD | vacate | stay vacated/expired | (prior status) | `hold_active=false` |
| RELIEVING_IN_PROGRESS | issue-relieving / deemed-relief | clearance cleared/deemed (ALL_OF join) + handover accepted/under-protest | RELIEVED | relieving order, **pay-continuity** (G10), LPC, SR `RELIEVING` (→`/sr/ingest`), **custody set**, reservation VACATED_ON_RELIEF |
| RELIEVED | enter-transit | — | IN_TRANSIT | transit counter; custodian owns headcount |
| IN_TRANSIT | confirm-joining | order in transit, reservation re-check, mutual pair ok | JOINED | joining report, **pay-continuity resume**, G01 posting update, joining-sequence, SR `JOINING` (→`/sr/ingest`), reservation FILLED_ON_JOIN |
| IN_TRANSIT | late-joining review | transit > admissible+grace | (LATE_JOINING_REVIEW on report) | review queue |
| LATE_JOINING_REVIEW | revert | authority decide (P01) | REVERTED_TO_SOURCE | restore source posting/custody (G01) |
| LATE_JOINING_REVIEW | abandon | authority decide (P01) | ABANDONED | continuity break, G09 trigger, pay status |
| PUBLISHED/SERVED/RELIEVING_IN_PROGRESS | amend | pre-relief | AMENDED | supersede, new revision, SR reversal (`*_CANCELLED`, `is_reversal=true` → `/sr/ingest/reversal`) |
| PUBLISHED/SERVED/RELIEVING_IN_PROGRESS | cancel | pre-relief | CANCELLED | reverse clearance/handover, release reservation |
| RELIEVED/IN_TRANSIT/JOINED | revoke | authority approve (P01) | REVOKED | SR reversal (`*_CANCELLED`, `is_reversal=true` → `/sr/ingest/reversal`), pay/G01 reversal |

### 10.2 Clearance checklist / item state table (P01 `PARALLEL_ALL_OF`; SLA/deemed)
| From | Event | Guard | To |
|---|---|---|---|
| OPEN | first branch updated | — | IN_PROGRESS |
| branch PENDING | P01 SLA breach | escalation tier advances (P01 SLA runtime) | (branch escalated) |
| branch PENDING/escalated | Authority deem | SLA+escalation exhausted | branch DEEMED_CLEARED |
| IN_PROGRESS | branch dues outstanding | — | BLOCKED |
| IN_PROGRESS | all branches cleared (ALL_OF join) | no dues | CLEARED |
| BLOCKED | dues recovery linked | recovery_ref set | CLEARED_WITH_DUES |
| IN_PROGRESS | all branches cleared/deemed (ALL_OF join) | ≥1 deemed | CLEARED_WITH_DEEMED |
| any | order cancelled | — | CANCELLED |

### 10.3 Joining report state table
| From | Event | Guard | To |
|---|---|---|---|
| DRAFT | submit | order IN_TRANSIT | SUBMITTED |
| SUBMITTED | HR verify | — | UNDER_VERIFICATION |
| UNDER_VERIFICATION | confirm | transit within admissible OR authority review done; reservation re-check ok | JOINED_CONFIRMED |
| UNDER_VERIFICATION | flag late | transit > admissible+grace | LATE_JOINING_REVIEW |
| LATE_JOINING_REVIEW | revert-to-source | authority decide | (report closed; order REVERTED_TO_SOURCE) |
| LATE_JOINING_REVIEW | abandon | authority decide | ABANDONED |
| LATE_JOINING_REVIEW | authority confirm | accepted | JOINED_CONFIRMED |

### 10.4 Representation / hold state table
| From | Event | Guard | To |
|---|---|---|---|
| FILED | review | — | UNDER_REVIEW |
| UNDER_REVIEW | uphold / court stay active | — | HOLD_ACTIVE |
| UNDER_REVIEW | reject | — | REJECTED |
| HOLD_ACTIVE | vacate/expire | stay order/expiry | VACATED |
| any | withdraw | filer withdraws | WITHDRAWN |

### 10.5 Vacancy reservation lifecycle
| From | Event | Guard | To |
|---|---|---|---|
| (none) | allot/choose | vacant_count > 0 | RESERVED |
| RESERVED | source relieved | relieving issued | VACATED_ON_RELIEF |
| VACATED_ON_RELIEF | destination joined | reservation re-check | FILLED_ON_JOIN |
| RESERVED | candidate withdraws/cancel | — | RELEASED |
| RESERVED | window/grace lapses | — | EXPIRED |

### 10.6 Deputation state table
| From | Event | Guard | To |
|---|---|---|---|
| ACTIVE | request extension | — | EXTENSION_REQUESTED |
| EXTENSION_REQUESTED | approve | within max tenure | EXTENDED |
| ACTIVE/EXTENDED | tenure nearing end | within alert window | REPATRIATION_DUE |
| REPATRIATION_DUE | repatriate | reverse REPATRIATION-class order joined | REPATRIATED |

### 10.7 `sr_outbox` delivery state table
| From | Event | Guard | To |
|---|---|---|---|
| PENDING | dispatch (JOB-G05-OUTBOX) | next_attempt_at ≤ now | IN_FLIGHT |
| IN_FLIGHT | success | target ack (X.3) | DELIVERED |
| IN_FLIGHT | failure | attempt_count < max_attempts | FAILED (re-PENDING w/ backoff) |
| FAILED | exhausted | attempt_count = max_attempts | DEAD_LETTERED |

---

## 11. Notifications

> Delivered by **X.2** (IN_APP + EMAIL in parallel), configured in **W.3**, templates referenced by **`MSG-G05-*`** id (copy authored in the G05 FS slice, registered in Foundation §5). **Statutory notices (order/serve/relieve/join/hold) are mandatory and non-suppressible** (EMAIL; Platform §X.2 / BRD §9.9).

| Event | Recipients | Channel | Template id |
|---|---|---|---|
| Request submitted | Recommender, HR | IN_APP, EMAIL | `MSG-G05-REQ-SUBMITTED` |
| Eligibility blocked | Initiator | IN_APP | `MSG-G05-ELIG-BLOCKED` |
| Order published | Transferee, source HR, dest HR | IN_APP, EMAIL, SMS | `MSG-G05-ORDER-PUBLISHED` |
| Order served / ack pending | Transferee | IN_APP, EMAIL, SMS | `MSG-G05-ORDER-SERVED` |
| Clearance branch SLA breach / escalation | Officer, Dept Head, Authority | IN_APP, EMAIL | `MSG-G05-CLEARANCE-ESC` |
| Deemed clearance granted | Transferee, source HR, officer | IN_APP, EMAIL | `MSG-G05-DEEMED-CLEARED` |
| Clearance with dues | Transferee, Accounts, source HR | IN_APP, EMAIL | `MSG-G05-DUES-OUTSTANDING` |
| Handover under protest | Transferee, acceptor, Authority, Accounts | IN_APP, EMAIL | `MSG-G05-HANDOVER-PROTEST` |
| Relieving order issued (**pay continued**) | Transferee, both offices, Payroll | IN_APP, EMAIL | `MSG-G05-RELIEVED` |
| In-transit overdue | Transferee, both offices, Authority | IN_APP, EMAIL | `MSG-G05-TRANSIT-OVERDUE` |
| Late-joining / abandonment review | Authority, HR Dest, (G09 on abandon) | IN_APP, EMAIL | `MSG-G05-LATE-JOINING` |
| Joining confirmed | Transferee, both offices, Payroll, SR | IN_APP, EMAIL | `MSG-G05-JOINED` |
| Stay-hold active / vacated | Transferee, both offices, Authority | IN_APP, EMAIL | `MSG-G05-STAY-HOLD` |
| Quarter overstay / licence-fee recovery | Transferee, Estate, Payroll | IN_APP, EMAIL | `MSG-G05-QUARTER-OVERSTAY` |
| SR/outbox dead-letter | SR Custodian | IN_APP, EMAIL | `MSG-G05-SR-FAILED` |
| Deputation repatriation due | HR Admin, Authority, deputee | IN_APP, EMAIL | `MSG-G05-REPATRIATION-DUE` |
| Counselling turn upcoming | Candidate | IN_APP, SMS | `MSG-G05-COUNSELLING-TURN` |
| Order amended/cancelled/revoked | Affected parties | IN_APP, EMAIL | `MSG-G05-ORDER-CORRECTED` |

Notification preferences are user-configurable (P02 Settings); statutory notifications cannot be opted out. Job terminal failures alert via `MSG-SYS-JOBFAIL`.

### 11.1 Scheduled jobs index (`JOB-G05-*`, registered on the X.1 runner; Foundation §4)
> Each job inherits the X.1 shared runner standard: idempotent (per-period run key), retry exponential backoff ×3, terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL`, per-tenant isolation, run-audit row. Cadence/logic here; index in Foundation §4. In-workflow SLAs (clearance/handover) are the **P01 SLA runtime**, not jobs.

| Job id | Purpose |
|---|---|
| `JOB-G05-EFFDATE` | Apply effective-dated statutory dates (transfer w.e.f., LWD, joining date) due today |
| `JOB-G05-OUTBOX` | Dispatch `sr_outbox` rows to G12/G10/G01/G09/G06 via X.3; backoff; dead-letter |
| `JOB-G05-TRANSIT` | Detect in-transit overdue / late-joining beyond admissible+grace |
| `JOB-G05-DISPUTE-SLA` | Charge-handover dispute resolution SLA breach handling |
| `JOB-G05-COUNSEL-TIMEOUT` | Counselling turn timeout → `AUTO_PASS_TIMEOUT` |
| `JOB-G05-QTR-OVERSTAY` | Quarter overstay detection → penal-rate flip + G10 signal |
| `JOB-G05-REPAT-REMIND` | Repatriation-due reminders ahead of `current_end_date` |
| `JOB-G05-GAPAUDIT` | Gapless number-sequence gap audit (zero unexplained gaps) |
| `JOB-G05-SERVE-DEEM` | Deemed-served processing (non-ack window / returned post) |
| `JOB-G05-DRIVE` | Bulk-drive batch order generation (resumable) |
| `JOB-G05-STRENGTH-RECON` | Refresh `vacancy_positions` strength read-through caches from G06/G01 |
| `JOB-G05-SR-RECON` | SR/outbox reconciliation report (missing/failed/dead-lettered) |

---

## 12. Reporting & Analytics
> Surfaced via **G14** (role-scoped `analytics.*`), respecting P02 row-level scope, cursor-paginated, exportable (CSV/PDF).

| Report | Description | Audience |
|---|---|---|
| Transfer Register | All orders by type/class/status/office with served & dates | HR, Authority, Auditor |
| Service-of-Order Compliance | Orders by served/deemed/refused; relieve-by vs served date | Authority, Auditor |
| Relieving Pendency | Orders served but not relieved beyond SLA | HR Source, Authority |
| Clearance Bottleneck | Avg clearance time, P01 SLA-breach & deemed-clearance rates by department | HR Admin, Accounts |
| In-Transit / Overdue + Custody | Employees in transit, elapsed vs admissible, custodian integrity exceptions | HR, Authority |
| Joining Compliance & Sequence | Joinings by transit-admissibility; late/abandoned; inter-se sequence | Authority, Auditor |
| Representation & Holds | Active/decided representations, stay-holds, abandonments | Authority, Auditor |
| Estate Retention | Quarter retentions, overstays, licence-fee recovery | Estate, Authority |
| SR/Outbox Health | Outbox PENDING/FAILED/DEAD_LETTERED; SR delivered to G12 | SR Custodian |
| Policy Override Audit | Un-overridden vs overridden violations (for 0% KPI) | Authority, Auditor |
| Drive / Counselling Progress | Per-drive funnel; counselling choice log export | HR Admin |
| Deputation Tenure | Active deputations, due/overdue repatriations | HR Admin, Authority |
| Vacancy & Strength (read-through) | Sanctioned vs filled vs reserved vs vacant by office/cadre, with freshness | Authority |

---

## 13. Migration & Launch (on P06)

### 13.1 Data migration (P06 ETL+V)
- Run on the **P06 Migration Toolkit** (Extract → Validate → Transform → Load → Verify, idempotent; **three mandatory staging dry runs**; waves; `migration_runs` ledger; failed records logged with source row + violated rule).
- Every migrated G05 row carries a permanent **`g05_source_id`** traceability/dedup column (the `darwinbox_source_id` pattern against the **actual government legacy register**, `GAP (gov-specific)` — source system differs).
- Import historical transfer/relieving/joining records into `transfer_orders`/`relieving_orders`/`joining_reports`; statuses normalised to terminal (`JOINED`/`CANCELLED`).
- Backfill in-flight transfers into the correct live state (relieved-but-not-joined → `IN_TRANSIT`) **and assign an in-transit custodian**.
- **Backfill `served_on_date` from the legacy register; where unknown, mark `DEEMED_SERVED` with a migration reason**.
- Seed `transfer_policy_rules` (incl. `JOINING_TIME_PAY`), `transfer_ban_periods`, office clearance-department configs (→ P01 `PARALLEL_ALL_OF` branch sets), **clearance SLAs (P01 SLA settings), joining-time distance bands**, order templates (W.2), and **`order_number_sequences` initialised to the legacy high-water mark per office/year (no gaps)**.
- Reconcile legacy SR entries with **G12** via `sr_outbox` reversal events (`*_CANCELLED`, `is_reversal=true` → `/sr/ingest/reversal`); no duplicates (dedup tuple `(source_module, source_reference_id, source_event_version)`).

### 13.2 Cutover & launch
- Dual-run period: legacy + HRMS for one transfer cycle; reconcile counts and **custody/continuity invariants**.
- Phased rollout: pilot offices → cadre-wise → org-wide; bulk-drive & counselling features enabled after pilot sign-off.
- Go/No-Go gates: SR/outbox health ≥ 99.5% in pilot; **zero custody-integrity and zero un-overridden-violation exceptions**; UAT sign-off by Transfer Authority + SR Custodian.
- Rollback: feature-flag disable of write paths; **outbox drains before cutover**; backups verified (**RPO < 1h**).

### 13.3 Training & support
- Role-based guides (employee self-service, clearance/estate officer, HR, authority, presiding officer).
- In-app contextual help (P03 chat grounded on uploaded transfer-policy documents); SR/outbox reconciliation runbook; **forced-action & hold runbook for Authorities**.

---
## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix
| FR | Entities (primary) | APIs | Platform services | Dependencies | SR/signal event |
|---|---|---|---|---|---|
| FR-G05-001 | transfer_requests | /requests* | W.2, P02, G13, P01, P05 | G01, G13, G06, FR-002 | — |
| FR-G05-002 | policy_rules, ban_periods | /eligibility, /override | P02, P05 | G01, G06 (strength read-through), FR-001 | — |
| FR-G05-003 | drives, preferences, vacancy_positions, vacancy_reservations | /drives*, /preferences, /allot | W.2, P02 | G06, FR-002/004/005/019 | — |
| FR-G05-004 | transfer_orders, order_number_sequences | /orders* | P01 (W.1), G13 doc-gen, X.1, P05 | G12, G13, P01, FR-002/003/006/011/012/020 | TRANSFER (MUTUAL_TRANSFER) |
| FR-G05-005 | drives, orders, vacancy_reservations | /drives/* | X.1 (JOB-G05-DRIVE), P01 | FR-002/003/004/019 | (per order) |
| FR-G05-006 | clearance_checklists/items | /clearance* | **P01 PARALLEL_ALL_OF + SLA runtime**, X.2, P05 | G10, G13, P01, FR-004/008/016 | — |
| FR-G05-007 | charge_handovers | /charge-handover* | P01 SLA, X.1, G13, P05 | FR-006/008/010/016 | — |
| FR-G05-008 | relieving_orders | /relieving-order* | P01, G13, X.1, JOB-G05-EFFDATE, P05 | G10, G12, G13, FR-006/007/009/012/015/016 | RELIEVING, PAY_CONTINUITY, LPC |
| FR-G05-009 | transfer_orders (transit) | /in-transit, /extend | Holiday/Region master, X.1 (JOB-G05-TRANSIT), X.2 | FR-008/010/015/018 | — |
| FR-G05-010 | joining_reports, charge_handovers, vacancy_reservations | /joining-report* | P01, G01 (POSTING_UPDATE), X.1, G12, P05 | G01, G10, G12, FR-008/009/011/012/015/018/021 | JOINING, POSTING_UPDATE, PAY_CONTINUITY |
| FR-G05-011 | deputation_records | /deputations* | P01, X.1 (JOB-G05-REPAT-REMIND) | FR-002/004/008/010 | — |
| FR-G05-012 | sr_outbox, service_register_events (G12) | /sr*, /sr-reconciliation, /sr-outbox/{id}/retry | **X.1 (JOB-G05-OUTBOX) + X.3 → G12 (P05 substrate)** | G12/G10/G01/G09/G06, FR-004/008/010/015 | all |
| FR-G05-013 | transfer_orders + dependents | /amend, /cancel, /revoke | P01, X.1, G01, P05 | G01, G10, G12, FR-004/006/008/010/012/015 | TRANSFER_CANCELLED / RELIEVING_CANCELLED / JOINING_CANCELLED (is_reversal) |
| FR-G05-014 | all G05 entities (read) | /analytics*, /map*(Phase-2) | **G14**, P02 | G14 | — |
| FR-G05-015 | transfer_orders(custody/continuity), relieving/joining | /custody, /entitlement | X.1, P05 | G10, G12, FR-008/010/012/018 | PAY_CONTINUITY, ENTITLEMENT |
| FR-G05-016 | clearance_items, charge_handovers, relieving_orders | /deem-cleared, /under-protest, /deemed-relieve | **P01 (Authority approver, SoD), P05** | FR-006/007/008 | — |
| FR-G05-017 | transfer_representations | /representations*, /holds | P01, G13, P05 | G13, FR-004/008/010 | — |
| FR-G05-018 | joining_reports, transfer_orders | /late-joining, /revert-to-source, /abandon | P01, X.1, P05 | G09, G10, FR-009/010/012/015 | DISCIPLINARY_TRIGGER, pay status |
| FR-G05-019 | counselling_sessions, counselling_choices | /counselling-sessions* | gov turn engine on **P05** substrate, X.1 (timeout) | FR-002/003/004 | — |
| FR-G05-020 | order_acknowledgements | /serve, /acknowledge, /deem-served | X.2, W.2, X.1 (JOB-G05-SERVE-DEEM), G13, P05 | FR-004/008, G13 | — |
| FR-G05-021 | joining_reports (sequence) | /joining-sequence, /resequence | gov logic, X.1, P05 | G06, FR-010 | SENIORITY_FEED |
| FR-G05-022 | quarter_allotments | /quarter-retention, /record-vacation | P01, X.1 (JOB-G05-QTR-OVERSTAY), P05 | G10, FR-006/008 | LICENCE_FEE_RECOVERY |

### 14.2 Dependency / build order
1. **Foundation:** entity migrations (P06) with `tenant_id`/`entity_id`/`g05_source_id`; policy/ban/SLA/distance-band seed; **`order_number_sequences` seed**; order templates (W.2); **Holiday/Region master** wired; **W.1 approval-flow definitions** (order approval; clearance `PARALLEL_ALL_OF`) configured.
2. **FR-G05-012** (`sr_outbox` on X.1/X.3 — frozen contract) — prerequisite for all side effects.
3. **FR-G05-002** (eligibility, strength read-through) — prerequisite for 001/003/004.
4. **FR-G05-001** (request intake W.2, sensitive docs G13).
5. **FR-G05-004** (orders, gapless numbering, P01 approval) + **FR-G05-020** (proof-of-service) → **FR-G05-006** (clearance `PARALLEL_ALL_OF` + P01 SLA), **FR-G05-007** (handover), **FR-G05-016** (forced actions on P01).
6. **FR-G05-008** (relieving + pay-continuity) + **FR-G05-015** (service continuity & custody) → **FR-G05-009** (transit, calendar) → **FR-G05-010** (joining, G01 posting) + **FR-G05-021** (joining-sequence → G06) + **FR-G05-018** (abandonment → G09).
7. **FR-G05-017** (representation/stay-hold) — **baseline**, layered across order lifecycle.
8. **FR-G05-003/005/019** (counselling/drives) on 002/004.
9. **FR-G05-011** (deputation), **FR-G05-022** (estate), **FR-G05-013** (corrections), **FR-G05-014 analytics** (G14 baseline) — **map view deferred to Phase-2**.

### 14.3 Parallel-agent plan (single state-service owner)
| Agent | Owns FRs | Shared contracts to honour |
|---|---|---|
| Agent A (Intake & Policy) | FR-G05-001, 002 | request/eligibility API + canonical enums; W.2 form; strength read-through client (G06) |
| Agent B (Orders, Numbering, Service, Drives, Counselling) | FR-G05-003, 004, 005, 019, 020 | order entity, **`order_number_sequences`**, `order_acknowledgements`, `vacancy_reservations`, `sr_outbox` writer; P01 W.1 approval flow |
| Agent C (Relieving, Clearance, Handover, Forced-Action) | FR-G05-006, 007, 008, 016, 022 | clearance **`PARALLEL_ALL_OF`** flow + P01 SLA, handover/relieving/quarter entities, G10 signal client (**consumes `TransferOrderStateService`, does not write status**) |
| Agent D (Transit, Joining, Continuity, Sequence, Abandonment) | FR-G05-009, 010, 015, 018, 021 | G01 client (posting update), G10 pay-continuity, Holiday/Region master client, G06 seniority feed (**consumes `TransferOrderStateService`**) |
| Agent E (SR/Outbox, Deputation, Corrections, Representation, Analytics) | FR-G05-011, 012, 013, 017, 014 | `sr_outbox` (X.1/X.3), reversal orchestrator, representation/hold (P01), G14 read models |
| **Shared service (owned by Agent B, consumed by C/D/E)** | **`TransferOrderStateService`** | **Sole writer of `transfer_orders.status`** — calls **P01** for gating + **P05** for audit; eliminates multi-writer conflict |

Shared interface contracts (entities §5, error codes §8.2, state tables §10, `sr_outbox` §5.2.15, `TransferOrderStateService` §16.6, platform service contracts P01/P02/P05) are frozen before parallel work.

### 14.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)
| Concern | Required | Provided | Status |
|---|---|---|---|
| All sections present | Yes | §1–§16 (+ Alignment + Amendments) | RESOLVED |
| 10–22 FRs each full structure + LLD | Yes | **22 FRs** §6 | RESOLVED |
| Module entities w/ fields + samples | Yes | **21 net-new gov entities** §5.2/§5.7 | RESOLVED |
| Shared/platform entities referenced not redefined | Yes | §5.4 references G01/G06/G09/G10/G12/G13/G14 + P01/P02/P04/P05 | RESOLVED |
| **Pay continuity** | Yes | FR-015; §5.6-11; pay-continuity signal (G10) | RESOLVED |
| **In-transit custody** | Yes | FR-015; §5.6-12; `in_transit_custody_org_unit_id` | RESOLVED |
| **G10 entitlement signal** | Yes | FR-015; §8.3; `entitlement_ref` | RESOLVED |
| **Forced-action power (on P01 Authority + P05)** | Yes | FR-016; FR-006/007/008 | RESOLVED |
| **Deemed/escalation clearance (P01 SLA runtime)** | Yes | FR-006; §10.2 | RESOLVED |
| **Representation/stay-hold** | Yes | FR-017; `STAY_HOLD`; `transfer_representations` | RESOLVED |
| **Abandonment path (G09 trigger)** | Yes | FR-018; `ABANDONED`/`REVERTED_TO_SOURCE` | RESOLVED |
| **Outbox field-spec (G04-style on X.1/X.3)** | Yes | §5.2.15; FR-012; idempotency formula | RESOLVED |
| **Single state-service (calls P01+P05)** | Yes | §14.3; §16.6 | RESOLVED |
| **Vacancy lifecycle** | Yes | `vacancy_reservations`; §5.6-6; §10.5 | RESOLVED |
| **Strength read-through (G06/G01)** | Yes | §5.2.7; §5.4; §5.6-13 | RESOLVED |
| **order_class / reframed §5.6-1** | Yes | §5.2.2; §5.5; §5.6-1 | RESOLVED |
| **Calendar (Holiday/Region master) + distance bands** | Yes | §8.3; FR-009; §16.4 | RESOLVED |
| **Joining-sequence seniority (→ G06)** | Yes | FR-021; §5.6-14 | RESOLVED |
| **Proof-of-service** | Yes | FR-020; §5.6-15 | RESOLVED |
| **Gapless numbering** | Yes | FR-004; `order_number_sequences`; §5.6-17 | RESOLVED |
| **Mutual coupling relieve/join** | Yes | §5.6-5; FR-008/010; `mutual_pair_order_id` | RESOLVED |
| **Interactive counselling (on P05 substrate)** | Yes | FR-019; `counselling_sessions`/`choices` | RESOLVED |
| **Sensitive docs ring-fence (G13 class + P05 log)** | Yes | §9.x; §5.2.1; G13 sensitive class | RESOLVED |
| **Quarters/estate sub-process** | Yes | FR-022; `quarter_allotments` | RESOLVED |
| **Enum taxonomy** | Yes | §5.5 canonical taxonomy | RESOLVED |
| **Acceptance tests new invariants** | Yes | §16.8 | RESOLVED |
| **Domain Primer (clarity)** | Yes | §16.9; §15 | RESOLVED |
| **Map re-prioritised** | Yes | FR-014 Phase-2; §14.2 | RESOLVED |
| Error catalog + JSON examples | Yes | §8.2/§8.4 | RESOLVED |
| State tables | Yes | §10.1–§10.7 | RESOLVED |
| Notifications, Jobs, Reporting, Migration | Yes | §11/§11.1/§12/§13 | RESOLVED |
| Glossary, Appendices | Yes | §15/§16 | RESOLVED |
| **PLATFORM: module code G05** | Yes | header; Amendments #1 | RESOLVED |
| **PLATFORM: tenant_id/entity_id on every table** | Yes | §5 preamble; §9 data integrity | RESOLVED |
| **PLATFORM: P01 workflow (PARALLEL_ALL_OF clearance, SLA runtime)** | Yes | Alignment; FR-004/006/008; §10 | RESOLVED |
| **PLATFORM: org via P04/G01 (not forked)** | Yes | §5.1/§5.4; Amendments #4 | RESOLVED |
| **PLATFORM: SR → G12 on P05 via G04-style outbox** | Yes | FR-012; §5.2.15; Amendments #5 | RESOLVED |
| **PLATFORM: P02 authz + field masking + PII ceiling** | Yes | §3.2; §9; Alignment | RESOLVED |
| **PLATFORM: P05 dual-log audit (no private audit_log)** | Yes | §5 preamble; §9; Amendments #10 | RESOLVED |
| **PLATFORM: P06 migration + g05_source_id** | Yes | §13.1; Amendments #17 | RESOLVED |
| **PLATFORM: X.2 notifications + W.3 + MSG-G05-*** | Yes | §11; Amendments #16 | RESOLVED |
| **PLATFORM: X.1 jobs JOB-G05-***| Yes | §11.1; Foundation §4 | RESOLVED |
| **PLATFORM: error 8-code table + envelope + X-Correlation-Id** | Yes | §8.2; Amendments #6 | RESOLVED |
| **PLATFORM: cursor pagination + Idempotency-Key** | Yes | §8.1; Amendments #7/#8 | RESOLVED |
| **PLATFORM: RBAC v1.7 roles as ADDITIONS + capability flags** | Yes | §3.1; Amendments #11 | RESOLVED |
| **PLATFORM: NFR baseline (99.5%/RPO<1h)** | Yes | §9; Amendments #18 | RESOLVED |
| **PLATFORM: VAL-*/MSG-*/ERR-*/JOB-* cited, only VAL-G05-* authored** | Yes | §8.2; §11; §11.1; §16.5 | RESOLVED |
| **PLATFORM: Alignment section (FR→service map)** | Yes | "Alignment with PrimeSoft Platform" | RESOLVED |
| **PLATFORM: Amendments (v2→v3) table** | Yes | "Amendments (v2 → v3: platform re-grounding)" | RESOLVED |
| Unresolved gaps | 0 | 0 | RESOLVED |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Transfer order | Sanctioned, numbered (gapless) statutory document moving an employee from source to destination office. |
| Order class | Classification of an order: `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION`; only one substantive transition may be active per employee. |
| Proof-of-service | Recorded service of the order on the employee (channel + date) on which relieve-by deadlines rest. |
| Relieving | Formal release of an employee from the source office after clearance and handover (or deemed action). |
| No-dues / clearance | Departmental certification (configured departments, run as a **P01 `PARALLEL_ALL_OF`** flow) that no dues/assets are outstanding; may be cleared, with-dues, waived, or deemed-cleared. |
| Deemed clearance | Authority-granted clearance after P01 SLA + escalation when an officer is non-responsive. |
| Charge handover/assumption | Transfer of duties, records, assets and cash from relinquishing to receiving officer; may be under protest. |
| Last Working Day (LWD) | Final day of duty at source; basis for transit computation (pay is continued, not stopped). |
| Forenoon / Afternoon (FN/AN) relieving | Whether the day counts as source duty or transit — load-bearing for pay and seniority (§16.9). |
| In-transit custody | The single office owning pay/attendance/headcount/discipline of an employee during `IN_TRANSIT`. |
| Service continuity | Treatment of the transit/joining-time period as continuous paid service with no break in qualifying service. |
| Joining time | Statutorily admissible working days (by distance band, Holiday/Region master) allowed to travel and join — paid. |
| Joining report | Document by which a transferee reports and assumes duty at destination, fixing the joining date. |
| Joining sequence | Inter-se order among same-cadre/post joiners on a date; sets seniority consumed by G06. |
| Representation / stay-order / retention hold | A filing that pauses an order (`STAY_HOLD`) pre-join. |
| Abandonment | Non-joining beyond grace; breaks continuity and triggers G09. |
| Transit period | Time between LWD and joining date; bounded by admissible joining time; paid. |
| Mutual transfer | Reciprocal exchange of two employees; coupled through approval, relieving and joining. |
| Deputation / Repatriation | Temporary posting to a borrowing org with defined tenure / return to lending org. |
| Ban/freeze period (MCC) | Window (e.g. election Model Code of Conduct) during which transfers are restricted. |
| Sanctioned strength | Authorised number of posts (owned by G06/G01; read-through by G05). |
| LPC | Last Pay Certificate issued by source payroll (G10) on relieving. |
| Imprest / DDO charge | Standing cash advance held by an officer / Drawing-and-Disbursing-Officer responsibilities handed over. |
| Licence fee | Rent for official accommodation; penal rate applies on overstay. |
| SR event | Append-only entry in the Digital Service Register (**G12**, on the P05 substrate), posted via `sr_outbox`. |
| Outbox | Transactional outbox (G04-style) guaranteeing idempotent external-signal delivery (SR/G10/G01/G09/G06), dispatched on X.1/X.3. |
| Counselling | Preference- or live-session-based allotment in a transfer drive. |
| Cadre / Officiating | Service group/stream / holding a higher post on an acting basis. |
| P01–P06 / X.1–X.3 / W.1–W.3 | PrimeSoft platform services (workflow, RBAC, chat, tenant/org admin, audit, migration; jobs, notifications, integration; configured flows/forms/notification config) consumed by id. |

## 16. Appendices

### 16.1 Sequence (happy path, narrative)
Request (W.2) → eligibility pass (strength read-through from G06) → recommend → Authority approve (P01) → **reserve-then-commit gapless order_no** + PDF (G13) → publish (SR `TRANSFER` via `/sr/ingest`→G12, clearance `PARALLEL_ALL_OF` instance created) → **serve order on employee + acknowledgement (X.2)** → departments clear in parallel (P01 SLA-bounded; deemed if needed) → handover accepted (or under-protest) → relieving order + LWD (**pay-continuity** + LPC to G10, SR `RELIEVING` asserting no break, **custodian set**, reservation vacated) → IN_TRANSIT (paid joining-time clock, Holiday/Region master) → report at destination → charge assumption → confirm joining (**reservation re-check + fill**, pay-continuity resumes, **G01 posting update**, **joining-sequence assigned → G06**, SR `JOINING`) — with representation/stay-holds and abandonment (→ G09) as first-class branches. Every mutation captured by the **P05 trigger**.

### 16.2 Office clearance-department default config
IT, LIBRARY, ACCOUNTS, STORES, ADVANCES, ESTATE_QUARTERS, HR — **configurable per office; an office may configure fewer** (only configured departments generate `PARALLEL_ALL_OF` branches; zero departments → checklist auto-CLEARED); an office may add `OTHER` named departments. Each configured department is one branch of the P01 clearance flow with its own SLA setting.

### 16.3 Outbox & idempotency note
External signals (G10 pay-continuity/entitlement/LPC/licence-fee, G12 SR, G01 posting, G09 trigger, G06 seniority feed) are written to `sr_outbox` (§5.2.15) in the same DB transaction as the local state change and dispatched asynchronously by **`JOB-G05-OUTBOX` (X.1)** via **X.3**. **Idempotency key formula:** `{target_system}:{event_type}:{aggregate_type}:{aggregate_id}:{revision_no}`. Backoff is exponential to `max_attempts` (default 8); exhausted rows are `DEAD_LETTERED` (retained ≥ 180 days) and surfaced in the SR Reconciliation Console (FR-G05-012).

### 16.4 Joining-time by distance band
Joining time is computed from `joining_distance_band` against the platform **Holiday & Region master** (regional working days), not a flat `joining_time_days`. Seeded defaults (System-Administrator/Org-Admin-configurable):
| Band | Indicative distance | Default joining time (working days) |
|---|---|---|
| LOCAL | same station | 0 |
| SHORT | < 200 km | 3 |
| MEDIUM | 200–500 km | 5 |
| LONG | 500–1000 km | 7 |
| OUTSTATION | > 1000 km / external | 10 + travel |

### 16.5 Open configuration parameters & module-unique ids
Minimum-tenure months, near-retirement window, cooling period, **joining-time distance bands**, **clearance SLA hours + escalation tiers per department (P01 SLA settings)**, **dispute-resolution SLA**, **deemed-action policy**, deputation max tenure, drive preference window, **counselling turn timeout**, **order-number prefix templates per office**, **licence-fee normal/penal rates & permissible retention months**, **late-joining grace** — all configurable via the versioned config cascade (Platform §0.3), seeded defaults.

**Module-unique ids authored by G05 and registered in the Foundation indexes:** `VAL-G05-ELIG`, `VAL-G05-TRANSFER-ORDER`, `VAL-G05-JTIME`, `VAL-G05-SREVENT`, `VAL-G05-SENIORITY` (Foundation §2); `JOB-G05-*` (Foundation §4, §11.1 above); `MSG-G05-*`, `ERR-G05-*` (Foundation §5, §8.2/§11 above). All other validations cite Foundation `VAL-*` ids; all standard errors use the platform 8-code table.

### 16.6 `TransferOrderStateService` contract
The **sole writer** of `transfer_orders.status`. Exposes guarded transition methods (`approve`, `publish`, `serve`, `hold`, `vacateHold`, `startRelieving`, `relieve`, `enterTransit`, `confirmJoining`, `revertToSource`, `abandon`, `amend`, `cancel`, `revoke`), each (a) validating the §10.1 guards (incl. hold supremacy 5.6-16, served precedence 5.6-15, custody 5.6-12, mutual coupling 5.6-5), (b) **invoking P01** for approval-gated transitions (`approve`/`publish`/`relieve`/`confirmJoining`/`revertToSource`/`abandon`/`amend`/`cancel`/`revoke`), and (c) writing the row so the **P05 DB-trigger** captures the change. Agents C/D/E consume it; none writes the column directly — eliminating the multi-writer conflict. It is an **orchestration service over P01/P05**, not a parallel workflow engine.

### 16.7 Gapless statutory numbering
Numbers are issued via **reserve-then-commit** on `order_number_sequences` (row-locked per `scope`/`office`/`fiscal_year`): (1) reserve `next_value` inside the order transaction; (2) on successful G13 PDF render + commit, advance `next_value`; (3) on failure, the reserved value is **voided with an explicit audit row** (P05) so `JOB-G05-GAPAUDIT` shows zero unexplained gaps. Never "retry sequence on collision"; contention surfaces as `409`/`ERR-G05-NUMBER-LOCKED` (retry).

### 16.8 Acceptance tests for invariants
| AT | Invariant | Oracle |
|---|---|---|
| AT-PAY-CONTINUITY | Relieve→join produces **no pay gap** | G10 receives one `PAY_CONTINUITY` (no `PAY_STOP`); no unpaid interval between LWD and joining_date |
| AT-CUSTODY | No dual/zero posting | While `IN_TRANSIT`, exactly one `in_transit_custody_org_unit_id`; headcount counts once; null/two → `ERR-G05-DUAL-POSTING` |
| AT-ENTITLEMENT | Entitlement keyed by type+ground | Own-request vs administrative produce different `ENTITLEMENT` payloads |
| AT-DEEMED-CLEAR | Forced-action audit | `DEEMED_CLEARED` requires P01 SLA+escalation exhausted, reason+actor captured by P05, queryable |
| AT-DEEMED-RELIEF | Deemed-relief unblocks | Relieving issuable with `deemed_relief=true` + reason; precondition 5.6-2 satisfied |
| AT-MUTUAL | Mutual coupling | Asymmetric completion blocked (`ERR-G05-MUTUAL-PAIR`) at relieve/join |
| AT-SERVED | Served-date precedence | Relieving blocked without service (`ERR-G05-NOT-SERVED`); relieve_by from served date |
| AT-GAPLESS | Gapless numbering under concurrency | 1000 concurrent orders → contiguous numbers, zero gaps/dups; voided reservations audited |
| AT-VACANCY | Join-time re-check | Cascading-vacancy double-fill blocked at join (`ERR-G05-VACANCY-FULL`) |
| AT-HOLD | Hold supremacy | Active `STAY_HOLD` blocks all forward transitions (`ERR-G05-STAY-HOLD`) |
| AT-ABANDON | Continuity break recorded | `ABANDONED` sets `service_continuity_asserted=false` + G09 trigger + defined pay status |
| AT-SEQUENCE | Inter-se determinism | Same-date same-post joiners get distinct contiguous sequence by reported_date→FN/AN→service_no; fed to G06 |
| AT-OVERRIDE | Un-overridden-violation KPI | Valid overrides NOT flagged as violations; un-overridden violations = 0 |
| AT-COUNSELLING | Single live turn | Out-of-turn choice → `ERR-G05-COUNSEL-TURN`; choice log immutable (P05) |
| AT-SENSITIVE | Sensitive-doc access logging | Every read of a G13 sensitive-class document writes a P05 access-log row |
| AT-OUTBOX | Idempotent delivery | Duplicate dispatch deduped by key; dead-letter after max_attempts; reconciliation surfaces it |
| AT-LICENCE-FEE | Estate recovery | Overstay flips penal rate + emits `LICENCE_FEE_RECOVERY` to G10 |
| AT-PLATFORM-TENANT | Tenant isolation | A query without a resolvable tenant scope is rejected, not defaulted to "all" (Platform §0.1) |
| AT-PLATFORM-AUDIT | P05 capture | Every G05 mutation produces exactly one immutable `audit_log` row via DB-trigger (no API bypass) |
| AT-PLATFORM-SR | SR on G12 | SR events land in the **G12** ledger (P05 substrate), not a local table; G05 holds no SR rows of its own |

### 16.9 Domain Primer
For implementers without Indian government HR background:
- **LPC (Last Pay Certificate):** statement from source payroll certifying pay drawn up to LWD; the destination needs it to start/continue salary correctly. G05 *requests* it; G10 *issues* it.
- **No-dues / clearance:** each department (IT, Library, Accounts, Stores, Advances, Estate) certifies the employee owes nothing (no unreturned laptop, books, advances, stores, accommodation). Required before relieving — modelled as a **P01 `PARALLEL_ALL_OF`** flow (all branches must clear).
- **Imprest / DDO charge:** an **imprest** is a standing petty-cash advance an officer holds; a **DDO (Drawing & Disbursing Officer)** is responsible for drawing and disbursing government money. On transfer these must be reconciled and handed over.
- **MCC (Model Code of Conduct):** during elections, a ban window freezes transfers (a `transfer_ban_period`).
- **Cadre:** a defined service group/stream (e.g. Teaching, Ministerial); transfer drives are run cadre-wise.
- **Officiating:** holding a higher post on an acting basis pending regular promotion.
- **Forenoon / Afternoon (FN/AN) relieving — *why it matters*:** an employee relieved in the **forenoon** is treated as **not on duty at source that day** (the day counts toward transit), whereas **afternoon** relieving counts the day as **source duty**. This one bit shifts the LWD/transit boundary, which affects **pay** (which office pays that day) and **seniority/joining-time** computation. It is load-bearing, not cosmetic — hence an explicit enum and acceptance coverage.
- **Deputation / Repatriation:** lending an employee to a borrowing organisation for a fixed tenure (deputation) and bringing them back (repatriation); modelled as co-existing `DEPUTATION`/`REPATRIATION` order classes.
- **Transit / joining time:** the paid period to travel and join; not unpaid dead time (a core correction preserved from v2).
- **Digital SR (G12):** the statutory Service Register — a net-new append-only government ledger running on the platform **P05** audit/immutability substrate. G05 is a **writer** to it (via the outbox), never its owner.

---
*End of G05 BRD v3.0 — platform-grounded (re-anchored from M05-TRJ v2.0 onto the PrimeSoft platform: P01–P06 / X.1–X.3 / W.1–W.3, RBAC v1.7, G-code scheme).*
