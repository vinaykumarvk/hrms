# Government-HRMS ↔ PrimeSoft Platform — Module Reconciliation

**Status:** Authoritative grounding artefact. Companion to `PLATFORM_FOUNDATION.md`.
**Purpose:** Map the 14-item government-HRMS scope (`SHARED_FOUNDATION.md` §1) onto the existing PrimeSoft product (Product Vision §1.5; Master BRD v2.1 §2.1), resolve the numbering clash, and register what the government build must add net-new.
**Grounded in:** Master BRD v2.1 · Product Vision v2.6 · Platform Spec v1.6 · RBAC Design v1.7 · Foundation FS v1.6 · `SHARED_FOUNDATION.md`.

> Government module ids below use the `Mxx-XXX` codes from `SHARED_FOUNDATION.md` §1 (e.g. `M12-SR`). PrimeSoft product ids use `Mxx` from Vision §1.5 (e.g. PrimeSoft `M11` Documents). To remove the collision, §B introduces the canonical `G01..G14` scheme that government BRDs adopt going forward.

---

## A. Numbering Clash & Coverage Table

| Gov # & name (`SHARED_FOUNDATION` §1) | Closest PrimeSoft module(s) / platform service | Relationship | Notes |
|---|---|---|---|
| **M01-EPM** Employee Profile Management | PrimeSoft **M01** Employee Master (Vision §3.7; BRD §4.4) | **EXTEND** | Canonical employee master ≈ gov M01. Reuse `employees` master, lifecycle state machine, org position, document vault. Gov ADDS public-sector fields: `service_no`, `cadre`, `pay_scale`, posting history. Keep `tenant_id`/`entity_id`. |
| **M02-EPDM** Personal Details Modification Workflow | PrimeSoft **M01** sensitive-field change (`E·AR`) + **P01** Workflow Engine (BRD §3.7; RBAC §7; Foundation §3) | **REUSE-AS-IS / EXTEND** | Maker-checker self-service edit already exists as the platform "Request change → approval" UI state routing to the sensitive-changes workflow on P01. Gov configures the approval flow (W.1); authors no new engine. |
| **M03-ATL** Attendance & Leave Management | PrimeSoft **M04** Leave + **M05** Attendance (Vision §3.7; BRD §4.5/§4.6) | **SPANS-MULTIPLE / EXTEND** | Two PrimeSoft modules cover one gov module. Reuse leave types/accrual/holiday/`VAL-LV`, attendance shift/regularisation/`VAL-AT`, and the leave & attendance workflows. Gov ADDS public-sector leave types (EL/HPL/commuted/study leave) and govt holiday/shift policy. |
| **M04-LSR** Leave → Digital SR Integration | PrimeSoft **M04** Leave (source) + **P05** audit substrate + **P01** (Vision §3.7) | **NET-NEW (gov-specific)** | No PrimeSoft analogue — posting approved leave events into a statutory ledger is public-sector. Consumes M04 leave events; **writes to the SR ledger (M12-SR)**; runs on P01/P05. |
| **M05-TRJ** Transfer, Relieving & Joining Workflow | **P01** Workflow Engine + **M01** master + SR ledger (Platform §P01; BRD §3.6) | **NET-NEW (gov-specific)** | PrimeSoft has no transfer/posting module. Authors transfer-order, relieving-at-source, joining-at-destination as **configured P01 flows + new entities**; emits SR events. (Closest commercial concept — internal mobility — is an Org-Admin report, not a transfer engine.) |
| **M06-PPP** Promotion, Posting & Progression / Seniority | PrimeSoft **M09** Performance (adjacent only) + **P01** (Vision §3.7) | **NET-NEW (gov-specific)** | Seniority lists, promotion cases, DPC, posting progression are public-sector. PrimeSoft M09 covers appraisal, **not** seniority/promotion-case. Authors seniority/promotion-case entities + P01 sanction flow; emits SR events. |
| **M07-TSD** Training & Skill Development | — (no PrimeSoft module; Vision lists LMS as *future phase*) | **NET-NEW (gov-specific)** | PrimeSoft has no L&D/LMS (RBAC Appendix B: "Employee Learning Center → future phase"). Competency framework, training calendar, nominations, certifications authored new; runs on P01 (nomination approval) + W.2 forms. Not statutory but absent from the product. |
| **M08-PAM** Performance Appraisal (APAR) | PrimeSoft **M09** Performance Management (Vision §3.7; BRD §4.10) | **EXTEND** | Reuse appraisal cycle, goal-setting (`VAL-WEIGHTAGE/WSUM`), calibration, ratings, probation confirmation, the M09 workflows and `MSG-M09-*`. Gov ADDS the **APAR form** (W.2), reporting/reviewing/accepting-officer chain (P01), and govt grading. |
| **M09-DCP** Disciplinary Cases & Punishment | **P01** Workflow Engine + **P05** Audit (Platform §P01/§P05) | **NET-NEW (gov-specific)** | Due-process (charge → reply → inquiry → penalty → appeal) is public-sector. Authors case/charge/inquiry/penalty entities + P01 due-process flow with SoD (RBAC §5); every step on P05; new roles (Disciplinary Authority, Inquiry Officer). |
| **M10-PAY** Payroll & Benefits | PrimeSoft **M06** Payroll + **M07** Statutory Compliance + **M14** Benefits (Vision §1.5 — Phase 2/3) | **SPANS-MULTIPLE / EXTEND (roadmap)** | PrimeSoft defines these but as **Phase 2/3** (out of Phase-1 scope, BRD §2.2). Gov payroll EXTENDS the roadmap modules with public-sector pay scales/allowances; not authored from scratch as a platform engine. Sequence after Phase-1 platform is live. |
| **M11-PEN** Retirement & Pension | — (no PrimeSoft module) + **P01/P05/P06** | **NET-NEW (gov-specific)** | PrimeSoft has no pension/superannuation engine. Authors pension calculation, commutation, terminal benefits, qualifying-service consumption; runs on P01 (sanction), P05 (audit), P06 (legacy migration); consumes M01 + SR ledger. |
| **M12-SR** Digital Employee Service Register | **P05** Audit substrate + **M01** master (Platform §P05; BRD §4.14.4) | **NET-NEW (gov-specific)** | The statutory system-of-record ledger. **Not** a platform primitive — authored as a new append-only gov ledger that **other gov modules (M04-LSR, M05-TRJ, M06-PPP, M09-DCP) write to**, running **on the P05 audit/immutability substrate** (DB-trigger, immutable, 7-yr, hash-chain OPEN-PLAT-03). |
| **M13-DMS** Document Management & Secure Storage | PrimeSoft **M11** Document Management (Vision §3.7; BRD §4.11) | **REUSE-AS-IS / EXTEND** | Versioned, access-controlled, encrypted vault already exists: policy library, letter templates/merge fields (`VAL-M11-MERGE/SIGNER`), retention (`VAL-M11-RETENTION`), disposal jobs (`JOB-M11-*`), Document Admin role + Letter Admin flag. Gov ADDS statutory document classes/retention schedules. |
| **M14-DAS** Dashboard & Analytics | PrimeSoft **M16** Analytics & Reports (Vision §1.5; BRD §4.12) | **REUSE-AS-IS / EXTEND** | Role-scoped dashboards + pre-built reports ≈ gov M14, with data scoped to each user's own entitlement (`analytics.*`). Gov ADDS public-sector KPIs and compliance dashboards (SR completeness, pension pipeline, disciplinary aging). |

**Asymmetry note.** PrimeSoft ships **Onboarding (M02), Recruitment/ATS (M08), Exits & Offboarding (M03), Assets & IT + Service Desk (M17)** which the 14-item government scope does **not** request — these are available but out of the government scope. Conversely the government scope's **SR ledger, transfers, promotion/seniority, disciplinary, pension** have **no** PrimeSoft counterpart and are the net-new public-sector surface.

---

## B. Canonical Module-Code Scheme for the Government Build

**Decision:** government modules adopt the prefix **`G01..G14`** (alias `GOV-Mxx`) going forward, mapping 1:1 to the `SHARED_FOUNDATION` numbering, so that government ids never collide with PrimeSoft product `Mxx` or platform `Pxx` ids.

| Gov code | `SHARED_FOUNDATION` id | Module |
|---|---|---|
| **G01** | M01-EPM | Employee Profile Management |
| **G02** | M02-EPDM | Personal Details Modification Workflow |
| **G03** | M03-ATL | Attendance & Leave Management |
| **G04** | M04-LSR | Leave → Digital SR Integration |
| **G05** | M05-TRJ | Transfer, Relieving & Joining |
| **G06** | M06-PPP | Promotion, Posting & Progression |
| **G07** | M07-TSD | Training & Skill Development |
| **G08** | M08-PAM | Performance Appraisal (APAR) |
| **G09** | M09-DCP | Disciplinary Cases & Punishment |
| **G10** | M10-PAY | Payroll & Benefits |
| **G11** | M11-PEN | Retirement & Pension |
| **G12** | M12-SR | Digital Employee Service Register |
| **G13** | M13-DMS | Document Management & Secure Storage |
| **G14** | M14-DAS | Dashboard & Analytics |

Government `VAL-*`, `JOB-*`, `MSG-*`, `ERR-*` ids use the `G0x`/gov-mnemonic suffix (e.g. `VAL-G12-SREVENT`, `JOB-G11-PENSION-RUN`, `MSG-G09-CHARGE-ISSUED`, `ERR-G05-RELIEVE-DATE`) and register against the Foundation indexes (Foundation §2/§4/§5). PrimeSoft `Mxx` ids are never reused for government modules.

---

## C. Convention-Override Table

Each invented `SHARED_FOUNDATION` convention that conflicts with the real platform, and its resolution.

| Invented (`SHARED_FOUNDATION`) | Real platform (authoritative) | Resolution |
|---|---|---|
| Error code `VALIDATION_ERROR (400)` | `VALIDATION_FAILED (422)` (Foundation §1) | **Override** to 422 `VALIDATION_FAILED`. |
| `AUTH_REQUIRED (401)` | `UNAUTHENTICATED (401)` (Foundation §1) | Rename to `UNAUTHENTICATED`. |
| `INTERNAL_ERROR (500)`, `UPSTREAM_UNAVAILABLE (503)` | `INTERNAL (500)`; no 503 in the standard table; add `PRECONDITION_FAILED (412)` (Foundation §1) | Adopt the platform 8-code table; drop 503 (handle upstream failures via X.3 mapping + 500/`ERR-LOADFAIL`). |
| Error envelope `{error:{code,message,field}, requestId}` | `{error:{code,message,field,details}}` + `X-Correlation-Id` header (BRD §6.2; Foundation §1) | Use the platform envelope; correlation id is a **header**, not a body `requestId`. |
| Invented role list (Disciplinary Authority, Inquiry Officer, SR Custodian, Payroll Officer, Appointing Authority, Auditor, System Administrator) | RBAC v1.7 taxonomy (RBAC §2) | **No parallel scheme.** Express each as a new role + capability flag ADDED to the RBAC taxonomy (`PLATFORM_FOUNDATION.md` §6.6); map Auditor → Org-Admin read + entitlement, System Administrator → Org/Platform Admin. Register in RBAC §4.3/§2.2. |
| `service_register_events` listed as a **shared platform entity** | No such platform primitive | It is a **NET-NEW gov ledger** owned by **G12-SR**, written by G04/G05/G06/G09, running **on the P05 audit/immutability substrate** (DB-trigger, immutable, 7-yr). Not a platform-provided table. |
| Invented single `audit_log` "shared platform" table | **P05 dual log**: `audit_log` + `security_audit_log`, DB-trigger capture, immutable, 7-yr (Platform §P05; BRD §4.14.4/.5) | Consume P05; do not define a custom `audit_log`. Security/auth events go to `security_audit_log`. Tamper-evidence tracks OPEN-PLAT-03 (hash-chain). |
| Invented module-owned `workflow_instances` / `workflow_tasks` "shared engine" | **P01** WorkflowEngine: `workflows` / `workflow_instances` / `workflow_actions` plus P01-owned runtime work-item tables (`workflow_tasks`, waits, fork/join, references, resolver snapshots) | Consume P01 (`startInstance/advance/approve/reject/sendBack/delegate/cancel`). `workflow_actions` is the immutable decision/action log; `workflow_tasks` is the P01-owned actionable inbox/work-item state, never a module-owned local task engine. See `docs/spec/p01-schema-amendment.yaml`. |
| Pagination "cursor **or** page/limit, max 100" | **Cursor only**, `limit` default 25 / max 100, `next_cursor` (Foundation §1) | Cursor pagination only; no offset/page paging. |
| Multi-tenancy **omitted** | `tenant_id`/`entity_id` non-nullable on every table; data-layer scoping (Platform §0.1; Vision §2.1) | Add `tenant_id`/`entity_id` to every gov table; reject unscoped queries. |
| NFR `99.9% uptime`, `RPO ≤ 15min`, `99.9%` | `99.5%/month`, `RPO < 1h`, `RTO < 4h` (Vision §2.9; BRD §7) | Adopt platform NFR baseline; p95 < 500 ms and WCAG 2.1 AA already align. |
| Architecture left open (Node **or** Java; React/Tailwind/shadcn assumed) | Logical architecture + NFR owned by engineering within Vision Part 2 / Platform Spec (BRD §1) | Physical stack is an engineering choice within the platform's logical architecture — government BRDs specify behaviour/NFR, not framework. Deployment target (CGG Data Centre / gov cloud) is a deployment-model choice (Vision §1.4 Standalone/Group Company), not a re-architecture. |
| Migration left undefined | **P06** ETL+V, 3 dry runs, waves, `migration_runs`, source-id traceability (Platform §P06) | Run gov legacy migration on P06; source-id column follows the `darwinbox_source_id` pattern against the actual legacy register (`GAP (gov-specific)` — source system differs). |
| Generic "maker-checker via shared workflow engine" | P01 + SoD enforced by P02 (no self-approval, multi-role intersection) (Platform §P01/§P02; RBAC §5) | Configure maker-checker as P01 flows; SoD is enforced by the engine, not re-coded per module. |

---

## D. Net-New Entity Register (statutory entities PrimeSoft lacks)

Each runs on the named platform service; none re-implements a platform engine.

| Gov module | Net-new entity (illustrative) | Runs on platform service |
|---|---|---|
| **G12-SR** | `service_register_events` (append-only statutory SR ledger), `sr_event_types` master | **P05** audit/immutability substrate (DB-trigger, immutable, 7-yr, hash-chain OPEN-PLAT-03); read/export via P05 query contract |
| **G04-LSR** | `sr_leave_posting` (leave→SR mapping/posting log) | **P01** (posting approval) + **P05**; consumes PrimeSoft M04 leave events |
| **G05-TRJ** | `transfer_orders`, `relieving_records`, `joining_records`, `transfer_clearance` | **P01** configured flow (W.1) + **P05**; emits SR events to G12 |
| **G06-PPP** | `seniority_list`, `promotion_case`, `dpc_proceedings`, `posting_history` | **P01** (sanction) + **P05**; emits SR events to G12 |
| **G07-TSD** | `competency_framework`, `training_calendar`, `training_nomination`, `certifications` | **P01** (nomination approval) + **W.2** forms |
| **G09-DCP** | `disciplinary_case`, `charge_sheet`, `inquiry_proceedings`, `penalty_order`, `appeal` | **P01** due-process flow with SoD + **P05**; emits SR events to G12 |
| **G11-PEN** | `qualifying_service_ledger`, `pension_calculation`, `commutation`, `terminal_benefits`, `pension_sanction` | **P01** (sanction) + **P05** + **P06** (legacy pension migration); consumes M01 + G12 SR |
| **G10-PAY** (roadmap) | public-sector `pay_scale`, allowance/deduction masters extending PrimeSoft M06/M07 | extends PrimeSoft **M06 Payroll / M07 Statutory** (Phase 2) — not authored as a new engine |
| **G01-EPM** | `service_no`, `cadre`, `pay_scale_id` columns + posting history on the `employees` master | **M01** master + **P05** audit; effective-dated via `JOB-*-EFFDATE` |

`consent_records`, `notifications`, `documents`, `workflows`/`workflow_instances`/`workflow_actions`, `audit_log`/`security_audit_log`, `integration_credentials`, `migration_runs` are **platform-provided** (Platform §P04/§P05/§P06, §X.2; BRD §4.14) — government modules **reference**, never redefine, them.

---

## E. Build Implications — what each government BRD must change to be platform-consistent

- **Re-key to `G01..G14`** (§B); replace all `SHARED_FOUNDATION` `Mxx-XXX` ids and never reuse PrimeSoft `Mxx`.
- **Add `tenant_id`/`entity_id`** to every entity and rely on data-layer scoping; delete any assumption of a single flat schema (§C; Platform §0.1).
- **Delete locally-defined `audit_log`, module-owned workflow engines/task tables, and `service_register_events`-as-platform-entity** and replace with consumption of **P05 dual-log, P01 (`workflow_instances`, `workflow_actions`, P01-owned `workflow_tasks`), and the G12 gov ledger** respectively (§C/§D).
- **Replace the invented error codes/envelope** with the platform 8-code table + `{error:{…,details}}` + `X-Correlation-Id` (§C; Foundation §1).
- **Replace the invented role list** with RBAC v1.7 roles + new gov roles/flags registered as ADDITIONS, with SoD enforced by P01/P02 (`PLATFORM_FOUNDATION.md` §6).
- **Cite `VAL-*`/`MSG-*`/`ERR-*` by id**; author only `VAL-G0x-*` etc. and register them in the Foundation indexes (§B; Foundation §2/§4/§5).
- **Convert every approval/maker-checker flow to a configured P01/W.1 flow** and every data-collection screen to a W.2 form referencing `VAL-*` ids; do not code bespoke workflow/forms.
- **Route notifications through X.2/W.3** with statutory notices marked mandatory/non-suppressible (Platform §X.2; BRD §9.9).
- **Run legacy data migration on P06** (ETL+V, 3 dry runs, waves, `migration_runs`, source-id traceability) against the government source register (§C/§D).
- **Adopt the platform NFR baseline** (99.5% uptime, RPO < 1 h, p95 < 500 ms, WCAG 2.1 AA) and the canonical UI-state standard (§C; `PLATFORM_FOUNDATION.md` §8.2).
- **Add an "Alignment with PrimeSoft platform" section** to each BRD mapping FRs → P01/P02/P05/P06/X/W and flagging any `GAP (gov-specific)` engine authored (the net-new statutory engines in §D).
- **Sequence G10-PAY after the Phase-2 platform modules** (M06/M07) are live rather than authoring a parallel payroll engine.
</content>
