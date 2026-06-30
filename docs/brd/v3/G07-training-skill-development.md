# Training and Skill Development Management — Government HRMS Module BRD (G07, v3.0 · platform-grounded)

**Module code:** G07 (alias `GOV-M07`; supersedes `M07-TSD`) — see `MODULE_RECONCILIATION.md` §B.
**Program:** Government HRMS — a public-sector configuration and extension of the **PrimeSoft HRMS** platform (Vision §1.1), hosted at the CGG Data Centre / government cloud (Standalone / Group-Company deployment model, Vision §1.4).
**Document version:** v3.0 (platform re-grounded on PrimeSoft Master BRD v2.1 · Vision v2.6 · Platform Spec v1.6 · RBAC v1.7 · Foundation FS v1.6).
**Status:** Approved for build, conditional on v3 amendments (platform-native, parallel-agent ready).
**Supersedes:** v2.0 (`/Users/n15318/hrms/docs/brd/v2/M07-training-skill-development.md`) and v1.0.
**Relationship to platform:** **NET-NEW / EXTEND.** PrimeSoft Phase-1 has **no dedicated L&D/LMS module** — the Product Vision lists the "Employee Learning Center" as a future phase (RBAC Appendix B; `MODULE_RECONCILIATION.md` §A row G07). G07 is therefore authored as a **platform-native module** whose competency framework, training calendar, nominations, certifications and campaigns are **new business logic** that **runs on the existing platform engines** — nomination/approval on **P01**, jobs on **X.1**, LMS/LRS integration on **X.3**, forms on **W.2**, audit on **P05**, authz on **P02**, notifications on **X.2**, migration on **P06**. It consumes the real employee master (**G01**), feeds appraisal skill-gaps to **G08**, and posts significant certifications/trainings to the **G12 Service Register ledger** (which itself runs on the **P05** substrate).
**Grounding contract:** This BRD **consumes** the PrimeSoft platform contracts by id and **never re-authors** them (`PLATFORM_FOUNDATION.md` §1, §9). Platform entities (`workflows`/`workflow_instances`/`workflow_actions`, `audit_log`/`security_audit_log`, `notifications`, `documents`, `consent_records`, `integration_credentials`, `migration_runs`, `employees`/`org_units`/`roles`/`designations`) are **referenced, not redefined**. Where the platform genuinely lacks a government capability it is marked **`GAP (gov-specific)`** and authored here, still running on the named engines.

---

## 1. Executive Summary

### 1.1 Purpose
The Training and Skill Development Management module (**G07**) closes the loop between **what the workforce can do today** and **what each role demands**, built as a **platform-native extension of PrimeSoft**. It establishes a governed **competency and skill framework**, maintains a per-employee **skill inventory** with **freshness/decay controls**, computes **incremental skill-gap analysis**, converts gaps into a governed **annual training plan and calendar**, manages the full **training delivery lifecycle** (catalog, nomination, scheduling, attendance, assessment, Kirkpatrick evaluation, certification), runs **mandatory-compliance campaigns at workforce scale**, tracks induction training, governs the **training budget**, captures **externally-acquired professional credentials**, manages **vendor empanelment and sponsorship/service-bond obligations**, and **posts significant trainings and qualifications to the statutory Digital Service Register (G12, on the P05 substrate)**.

Every approval/maker-checker process in this module is a **configured P01 workflow (W.1 flow definition)**, every data-collection screen is a **W.2 form** referencing the shared `VAL-*` library, every scheduled process is a **JOB-G07-\*** registered on the **X.1** runner, and every external LMS/LRS exchange runs on the **X.3 integration framework** — not a bespoke engine.

### 1.2 Business context
For a public-sector employer, training is not only a capability lever but a **statutory and audit obligation**: mandatory compliance training (conduct rules, cyber-security, POSH, ethics), induction for new entrants, and the recording of significant qualifications/trainings in the service register are legally consequential. G07 combines **world-class HCM learning capabilities** (learning paths, skills marketplace, micro-learning, LMS/LRS/SCORM/xAPI integration via X.3, AI/rule recommendations, CPD credit tracking) with **public-sector rigour** (P01 maker-checker nominations, budget sanction, P02-enforced segregation of duties, P05 immutable audit, G12 SR posting).

The v2 revision **separated the statutory spine from the developmental layer** (council First-Principles finding). v3 **preserves that separation** and re-anchors both layers onto the platform: the statutory spine — mandatory-compliance campaigns, certification, induction, and G12 SR posting — is launch-required, high-volume, and proven end-to-end on a pilot entity first. The developmental layer — weighted competency scoring, recommendations, and the skills marketplace — remains feature-flagged Phase 2 (capability flags registered in **RBAC §4.3**), gated on **evidence of framework curation**.

### 1.3 Key outcomes
- A single competency taxonomy and role-based competency models, **with review cadence and ownership**, drive objective skill-gap measurement; framework masters publish through a **P01 master-data approval flow**.
- Skill inventory carries **freshness**: stale, never-revalidated skills are discounted from gap closure; freshness is recomputed by **JOB-G07-FRESHNESS** on X.1.
- Training needs originate from three reconciled sources: competency gaps, **G08 appraisal development gaps** imported via a versioned X.3-governed feed, and statutory mandates.
- Mandatory annual training for the entire workforce is orchestrated by a **campaign engine** (bulk nominate → auto-wave into capacity-bounded sessions → rolling renewal → escalation), driven by **JOB-G07-CAMPAIGN** and reachable even by **non-login field staff** via attributed kiosk/assisted/offline capture.
- Every nomination, attendance mark, assessment, certificate, credential, and cost entry is captured immutably by the **P05 DB-trigger audit** and traceable to a need.
- Significant trainings/qualifications post automatically to the **G12 SR ledger** as append-only events using a **pinned event contract**, through the **X.3** outbound pattern (idempotent, circuit-broken, payload-versioned).

### 1.4 Scope summary
G07 owns competency/skill master data, the skill inventory, training programs and sessions, content/assessment-item assets, nominations, campaigns, attendance, assessment, feedback, certification, external credentials, learning paths, CPD records, the training budget, vendor empanelment, sponsorship/service-bond records, and LMS/LRS-integration metadata. It **consumes** the PrimeSoft employee master (**G01**), G08 appraisal gaps, org structure, **platform `documents` (G13)** and **`notifications` (X.2)**; it **writes events to the G12 SR ledger** and **datamarts to G14**. Every entity it owns carries **`tenant_id`/`entity_id`** and is scoped at the data layer (Platform §0.1).

### 1.5 Success metrics (KPIs)
| KPI | Target | Source |
|---|---|---|
| Mandatory-compliance training completion | ≥ 98% of **in-scope** workforce within statutory window | G07 (campaign engine) |
| Annual training-plan execution rate | ≥ 90% of planned man-days delivered | G07 |
| Skill-gap closure rate (year-on-year) | ≥ 25% of critical gaps closed | G07 + G08 |
| Average post-training learning gain (post − pre score) | ≥ 20 percentage points | G07 |
| Certificate validity compliance (no lapsed mandatory certs) | 100% (enforced, auto-re-nominated) | G07 |
| Budget utilisation variance | within ±10% of sanctioned (entity/org-unit + FY canonical key) | G07 |
| Cost per compliant completion | tracked & trending down YoY | G07 + G14 |
| Competency-model freshness | ≥ 95% of published models within review-due date | G07 governance |

### 1.6 Amendments
- v1 → v2 adopted-improvement traceability is preserved verbatim in **§1.7** (25 council improvements).
- v2 → v3 **platform re-grounding** changes are catalogued in the dedicated **"Amendments (v2 → v3: platform re-grounding)"** table after §16, and the FR→service map is in **"Alignment with PrimeSoft Platform"**.

### 1.7 Amendments (v1 → v2) — adopted-improvement traceability *(preserved from v2)*
| # | Adopted improvement (council) | Risk(s) mitigated | Where incorporated |
|---|---|---|---|
| 1 | Replace SCORM "webhook" with real LRS/poll integration; content-hosting & single-vs-multi-LMS decision | R1 (Critical) | FR-G07-015 rewritten; `learning_record_stores`, `lms_content_packages`; §10.5 |
| 2 | Mandatory-Compliance Campaign engine (bulk nominate, auto-wave, rolling renewal, escalation) | R2 (Critical) | **FR-G07-017**; `training_campaigns`, `campaign_targets`; `:enroll-batch`; §11.6 |
| 3 | Fix `competency_models` ROLE scope | R7 (High) | §5.2.5 `role_id`; FR-G07-002 AC.1 |
| 4 | Normalise source enums across layers | R7 (High) | §5.5 enum mapping; `skill_gap_items.source` aligned |
| 5 | Eliminate polymorphic FKs (actor_type discriminator) | R7 (High) | §5.2.19/5.2.20 `*_actor_type` + `*_actor_id` |
| 6 | Restate performance NFR at 200k; incremental gap recompute | R8 (High) | §9 Performance; FR-G07-004 incremental engine |
| 7 | Non-compliance skill freshness/decay | R5 (High) | §5.2.2 `revalidation_interval_months`; §5.2.7 freshness; FR-G07-003/004 |
| 8 | Competency-model governance (review cadence, owner, staleness alarm) | R4 (High) | §5.2.5 `review_due_date`,`owner_id`; FR-G07-002 |
| 9 | Publish versioned Gap Contract for G06/G08 | R3 (High) | **FR-G07-024**; §10.6 Gap Contract v1 |
| 10 | Phase developmental layer behind curation evidence; binary gap default | R11 (Med) | §1.2, §2.5 flag matrix; FR-G07-004/014 |
| 11 | External/professional credential capture & verification | R6 (High) | **FR-G07-018**; `certifications` extended; `credential_verifications` |
| 12 | Enforce certification validity (auto re-nomination; lapsed flag) | R6 (High) | FR-G07-012 AC.6–8; `lapsed_mandatory`; campaign re-nomination |
| 13 | Reframe Kirkpatrick L3/L4; instrument ROI | R10 (Med) | FR-G07-011; §13 `cost_per_completion`; Appendix C |
| 14 | Pin G12 SR-event and G01 joiner-event contracts | R3 (High) | §10.6 contract schemas; §15.3 dependency register |
| 15 | Promote "significant training" definition into FR | R3-adjacent | FR-G07-016 + `is_significant` rule set |
| 16 | Proxy/kiosk/assisted mode + offline attendance sync; coverage denominator | R9 (High) | **FR-G07-022**; FR-G07-010 capture modes; §5.2.19 offline fields |
| 17 | Content & assessment-item model | R12 (Med) | **FR-G07-021**; `lms_content_packages`, `assessment_items` |
| 18 | Resolve budget-dimension mismatch (canonical key) | R14 (Med) | §5.6 rule 7; FR-G07-016 canonical reconciliation = entity/org_unit + FY |
| 19 | Vendor/external-trainer empanelment & procurement linkage | R15 (Med) | **FR-G07-019**; `vendor_empanelments` |
| 20 | Sponsorship / study-leave / deputation & service-obligation | R15 (Med) | **FR-G07-020**; `training_sponsorships` |
| 21 | DPDP retention/erasure for learning PII at exit | R13 (Med) | **FR-G07-023**; `learning_data_retention_actions`; §9 Privacy |
| 22 | Behavioural anchors to proficiency levels + self-assess guidance | — | §5.2.3 mandatory `descriptor`; FR-G07-001/003 |
| 23 | Extend accessibility NFR to content (tests, SCORM) | R16 (Low) | §9 Accessibility; FR-G07-021/011 |
| 24 | Explicit waitlist position + fairness audit | — | §5.2.18 `waitlist_position`; FR-G07-009; §11.1 |
| 25 | Resequence build plan around statutory spine | — | §15.2 wave plan; §14.2 cutover |

---

## 2. Scope & Boundaries

### 2.1 In scope
1. Skill taxonomy and competency framework (categories, skills, competencies, proficiency-level catalog **with behavioural anchors**).
2. Role-based competency models with required proficiency targets, **scope key for ROLE (`role_id`)**, **review cadence and ownership**.
3. Per-employee skill inventory with self/manager/validated assessment, **currency/expiry and freshness/decay**.
4. **Incremental** skill-gap analysis vs competency model and reconciled with **G08** appraisal development gaps; **binary critical/non-critical at launch**, weighted scoring feature-flagged.
5. Training needs identification, consolidation, and prioritisation.
6. Annual training calendar and plan with budget allocation (**canonical entity/org-unit + FY reconciliation key**).
7. Course catalog and program management: internal, external, e-learning/LMS, blended, micro-learning.
8. **Content & assessment-item management**: SCORM/xAPI content packages, versions, item banks, accessibility metadata.
9. Session/batch scheduling, trainer management, venue management, capacity and waitlist (**with persisted waitlist position**).
10. Nomination and multi-level approval workflow **on P01** (maker-checker, budget sanction).
11. **Mandatory-compliance campaign engine**: bulk/wave nomination, rolling renewal, escalation, coverage tracking.
12. Attendance capture (per session/day) including **proxy/kiosk/assisted and offline-sync** capture for non-login staff; pre/post assessment; Kirkpatrick L1–L4 (L3/L4 optional/sampled/programme-level).
13. Certification issuance, validity, **enforced** renewal/recertification with auto re-nomination; lapsed-mandatory flag (consumed by G06).
14. **External & professional credential capture with issuer verification.**
15. Induction/onboarding training (driven by the G01 joiner event).
16. Learning paths, skill-based recommendations, CPD/credit tracking, skills marketplace (Phase-2 feature-flagged).
17. **Vendor/external-trainer empanelment & procurement linkage.**
18. **Sponsorship / study-leave / deputation with service-bond obligation tracking.**
19. LMS/LRS integration (SCORM 1.2/2004 via reporting-API poll; xAPI via LRS) enrollment and completion sync, **on the X.3 framework**.
20. Training budget and cost tracking (planned vs committed vs actual; **cost-per-completion**).
21. Posting of significant trainings/qualifications to the **G12 SR ledger** using a **pinned event contract** and an explicit **`is_significant` rule set**.
22. **DPDP retention/erasure of learning PII** at employee exit (executing through the P05 redaction-marker path).
23. **Published Gap Contract** consumed by G06/G08.

### 2.2 Out of scope (owned elsewhere / by the platform)
- Employee master record and job data → **G01** (PrimeSoft `employees` master; G07 reads it).
- Appraisal goals, ratings, and the development-gap source data → **G08** (G07 consumes a read-only feed via the pinned contract; G08 = PrimeSoft M09 Performance extended).
- Promotion/seniority decisions that may consider training → **G06** (G07 supplies certification + Gap Contract data; decision is G06).
- Payroll disbursement of training reimbursements and sponsorship recoveries → **G10** (G07 supplies an approved-cost / bond-recovery payable feed only; G10 extends PrimeSoft M06/M07 in Phase 2).
- Statutory SR ledger itself → **G12-SR** (G07 writes events; G12 owns the ledger and event-contract authority, running on **P05**).
- Document binary storage and encryption → **G13 / PrimeSoft M11 Document Management** (G07 stores `document_id` references).
- Cross-module executive dashboards → **G14 / PrimeSoft M16 Analytics** (G07 exposes datamarts/queries).
- **Procurement/tendering workflow itself** → external procurement system via **X.3** (G07 stores empanelment + contract references only).
- **The workflow, RBAC, audit, notification, job-runner, migration and configured-content engines themselves** → **P01/P02/P05/X.1/P06/W** (G07 configures, never re-implements).

### 2.3 Feature Module Map
| Feature group | Capability | Primary FRs |
|---|---|---|
| Competency framework | Taxonomy, competencies, proficiency levels w/ anchors, governed competency models | FR-G07-001, FR-G07-002 |
| Skill inventory & gaps | Employee skills, freshness, assessments, incremental gap analysis | FR-G07-003, FR-G07-004 |
| Planning | Needs identification, annual plan/calendar, budget allocation | FR-G07-005, FR-G07-006 |
| Catalog & content | Programs, content/assessment-item assets | FR-G07-007, FR-G07-021 |
| Delivery logistics | Sessions, trainers, venues, vendor empanelment | FR-G07-008, FR-G07-019 |
| Enrolment | Nomination & approval workflow (P01) | FR-G07-009 |
| Statutory volume | Mandatory-compliance campaign engine | FR-G07-017 |
| Execution | Attendance (incl. proxy/kiosk/offline), assessment, feedback | FR-G07-010, FR-G07-011, FR-G07-022 |
| Compliance & credentials | Certification/renewal (enforced), induction, external credentials | FR-G07-012, FR-G07-013, FR-G07-018 |
| Modern learning | Learning paths, recommendations, CPD, marketplace (Phase 2) | FR-G07-014 |
| Integration | LMS/LRS SCORM/xAPI sync (X.3); Gap Contract publication | FR-G07-015, FR-G07-024 |
| Statutory & finance | G12 SR posting, budget/cost tracking, sponsorship/bond | FR-G07-016, FR-G07-020 |
| Data governance | DPDP retention/erasure of learning PII | FR-G07-023 |

### 2.4 Common Capabilities (inherited from the platform, applied throughout)
- **Audit (P05):** every INSERT/UPDATE/soft-DELETE on a G07 business table fires the **P05 database trigger** writing one immutable `audit_log` row — including **FIFO waitlist promotions** and **campaign wave assignments**. Auth/permission events go to `security_audit_log`. G07 **does not define its own audit table** (override per `MODULE_RECONCILIATION.md` §C).
- **Soft delete:** `is_deleted` on all non-ledger entities; ledgers (assessment results, SR events, credential verifications, retention actions) are append-only. No hard delete (Platform §8.2).
- **Maker-checker (P01):** nominations, budget changes, certificate revocation, credential verification override, vendor empanelment, sponsorship sanction, and master-data publication run as **configured P01 flows**; SoD (maker ≠ checker, no self-approval) is enforced by **P01/P02**, never re-coded.
- **RBAC + row-level scoping (P02):** every query calls `Authorization.check`; scoping is enforced at the data layer across the five dimensions (reporting chain, `org_unit`, UAG, contribution level, entity); an unscoped query is **rejected, not defaulted to all**.
- **Pagination:** **cursor only** — `?limit=` (default 25, max 100) + `cursor=`, response carries `next_cursor` (Foundation §1). No offset paging.
- **Idempotency:** unsafe POSTs that start a transaction accept an **`Idempotency-Key`** header; a repeat within 24h returns the original result.
- **Correlation:** every request carries/receives **`X-Correlation-Id`**, echoed and written to every audit/log line.
- **i18n / locale:** UTC storage, `DD-MMM-YYYY` display, INR default, banker's rounding to paise (§5.6 rule 16).
- **Notifications (X.2 / W.3):** state transitions resolve recipients via **W.3** and dispatch through **X.2** (IN_APP + EMAIL in parallel; statutory notices mandatory/non-suppressible); templates referenced by **MSG-G07-\*** id.
- **Documents (G13):** all uploads (certificates, materials, attendance sheets, invoices, verification evidence) reference the platform `documents.document_id`.

### 2.5 Capability phasing & feature flags (developmental layer gating)
The statutory spine ships **on by default**. The developmental layer is **feature-flagged via RBAC capability flags (RBAC §4.3)** and gated on **framework-curation evidence** (≥ 80% of in-scope competency models within review-due date for the entity/org-unit). Flags are **Org-Admin-granted and audit-logged to P05** (RBAC §4.3).

| Capability | Capability flag (RBAC §4.3) | Default at launch | Gate to enable |
|---|---|---|---|
| Binary critical/non-critical gap | (always on) | ON | — |
| Weighted decimal gap scoring | `ld.gap-weighted` | OFF | Curation evidence + L&D Manager sign-off |
| AI/rule recommendation engine | `ld.recommendations` | OFF | Curation evidence |
| Skills marketplace | `ld.marketplace` | OFF | Curation evidence + DPDP opt-in live |
| CPD targets (vs tracking) | `ld.cpd-targets` | OFF | Phase 2 |
| LRS/xAPI ingestion | `ld.lms-lrs` | OFF | LRS provisioned & X.3 round-trip validated |

---

## 3. Roles & Permissions

### 3.1 Roles as RBAC v1.7 ADDITIONS (no parallel scheme)
The access-control **model** is owned by **RBAC v1.7**; G07 expresses its actors as **new roles + capability flags ADDED to the taxonomy** (RBAC §2.2/§4.3), enforced by **P02**. SoD is enforced by **P01/P02**, never re-implemented (`PLATFORM_FOUNDATION.md` §6.6; `MODULE_RECONCILIATION.md` §C). Auditor maps to **Org-Admin read + read-only entitlement**; System Administrator maps to **Org Admin / Platform Super Admin**.

| G07 actor | Expressed in RBAC v1.7 as | Notes |
|---|---|---|
| **Employee (Self-Service)** | existing **Employee** role (RBAC §2.4) | View own skill inventory, gaps, learning path; self-assess; self-nominate; attend e-learning; view own certs/credentials/CPD. Surfaced in the **Me** workspace. |
| **Reporting Manager** | existing **Manager L1** (RBAC §2.3) + `has-reportees` | Validate reports' skills; recommend/approve L1 nominations; team gaps/plan; proxy assessor. **My Team** workspace. |
| **L&D Officer (HR)** | **new entity-scoped module-admin role `ld_officer`** (RBAC §2.2, analogous to Performance/Payroll Admin) | Manage catalog, content, sessions, trainers, venues; identify/consolidate needs; build plan; record attendance/assessment; issue certs; run campaigns; capture/verify external credentials. **Admin** workspace. |
| **L&D Manager / Training Head** | **new role `ld_manager`** (RBAC §2.2) | Approve annual plan & budget; final-approve nominations (L2 P01 approver); approve revocation; launch/approve campaigns. Holds `ld.gap-weighted` grant authority. |
| **Department Head / Appointing Authority** | existing **HOD** + **new `appointing_authority`** (shared with G06) | Sanction departmental nominations/budget and sponsorships per policy; P01 approver. |
| **Trainer / Facilitator** | **new role `ld_trainer`** (RBAC §2.2), session-scoped | View assigned sessions/rosters; mark attendance; enter scores; close session. Internal trainers are platform `users`; external trainers are empanelled vendor logins or proxied by L&D Officer. |
| **Finance / Budget Controller** | existing **Finance Admin** (RBAC §2.2) | Define/monitor training budgets; reconcile committed vs actual; approve bond recoveries to the G10 payable feed. |
| **Kiosk / Assisted-Capture Operator** | **new role `ld_kiosk_operator`** (RBAC §2.2) | Operate shared kiosk/assisted station for non-login staff with **attributed** audit; never anonymous. |
| **Vendor / Empanelment Manager** | **capability flag `ld.vendor-admin`** on `ld_officer` (RBAC §4.3) | Maintain empanelment records/contracts/procurement refs; cannot approve own empanelment (SoD via P02). |
| **SR Custodian / Registrar** | **G12 role** (`sr_custodian`) — receives postings; cannot edit G07 records | Defined in G12; G07 only posts events to it. |
| **Data Protection Officer (DPO)** | existing **DPO** (RBAC §3.9 / Platform §P05) | Approve/execute DPDP erasure & retention overrides for learning PII via the P05 redaction path. |
| **Auditor (read-only)** | **Org-Admin read + read-only entitlement** (RBAC §3.2; P05 query access) | Cross-module read + audit log; no write. No parallel "Auditor" write role. |
| **System Administrator** | **Org Admin / Platform Super Admin** (RBAC §2.1) | Configure taxonomy publication, enums, LMS/LRS X.3 integration, feature flags, RBAC; no transactional self-approval. |

**Capability flags to register in RBAC §4.3 (working-group process, RBAC §14):** `ld.gap-weighted`, `ld.campaign-launch`, `ld.credential-verify`, `ld.vendor-admin`, `ld.feature-flags`.

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-delete/Disable, A=Approve, X=Execute/Operate)
> Enforcement is by **P02 `Authorization.check`** (deny-by-default → role grant → multi-role intersection → entitlement → capability flag → PII ceiling → scope filter → field mask on serialization). The matrix below is the **model input**, owned with RBAC; P02 enforces it.

| Capability \ Role | Emp | Mgr | L&D Off | L&D Mgr | Dept Head | Trainer | Finance | Kiosk Op | Vendor (flag) | DPO | SR Cust. | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Skill taxonomy / competency master | R | R | C R U | A | R | R | – | – | – | – | R | R | C R U D |
| Competency models (+governance) | R | R | C R U | A | R | – | – | – | – | – | – | R | R |
| Own skill inventory / freshness | R U(self) | R | R U | R | R | – | – | X(assist) | – | – | – | R | – |
| Team skill validation | – | U A | R U | R | R | – | – | – | – | – | – | R | – |
| Skill-gap analysis | R(own) | R(team) | C R | R | R(dept) | – | – | – | – | – | – | R | – |
| Gap Contract publication | – | – | X | A | – | – | – | – | – | – | – | R | R |
| Training needs | R(own) | C R | C R U | A | A | – | – | – | – | – | – | R | – |
| Annual plan & calendar | R | R | C R U | A | A(dept) | R | R | – | – | – | – | R | – |
| Course catalog / programs | R | R | C R U D | A | R | R | – | – | – | – | – | R | – |
| Content & assessment items | R(learner) | – | C R U D | A | – | R | – | – | R(own) | – | – | R | C R U |
| Sessions / trainers / venues | R | R | C R U D | A | R | R(own) | – | – | – | – | – | R | – |
| Vendor empanelment | – | – | C R U(flag) | A | R | – | R | – | C R U | – | – | R | – |
| Nomination | C(self) R | C A(L1) | C R U | A(L2) | A | – | – | X(assist) | – | – | – | R | – |
| Campaign | – | R | C R U X | A | A(dept) | – | – | – | – | – | – | R | – |
| Budget definition | R | – | R | A | R | R | C R U | – | – | – | – | R | – |
| Attendance (incl. offline/kiosk) | R(own) | R(team) | C R U X | R | R | C R U X | – | X | – | – | – | R | – |
| Assessment scores | R(own) | R(team) | C R U | R | – | C R U | – | – | – | – | – | R | – |
| Feedback (Kirkpatrick) | C(own) R | R | R U(analysis) | R | R | R | – | – | – | – | – | R | – |
| Certification issue | R(own) | R | C R U | A | R | – | – | – | – | – | R(posted) | R | – |
| External credential capture/verify | C(own) R | R | C R U A(verify,flag) | A | – | – | – | – | – | – | R(posted) | R | – |
| Certificate revoke | – | – | C(request) | A | – | – | – | – | – | – | – | R | – |
| Sponsorship / service-bond | C(request) R | A(recommend) | C R U | A | A | – | A(recovery) | – | – | – | – | R | – |
| CPD / learning path | R U(self) | R | C R U | A | R | – | – | – | – | – | – | R | – |
| LMS/LRS integration config (X.3) | – | – | R | R | – | – | – | – | – | – | – | R | C R U |
| SR posting (to G12) | – | – | X(trigger) | A | – | – | – | – | – | – | R(receive) | R | – |
| Cost entry / reconciliation | R(own) | R | C R U | A | R | R | C R U A | – | – | – | – | R | – |
| DPDP erasure / retention override | R(own) | – | R | R | – | – | – | – | – | C A X | R(posted) | R | – |
| Feature flags (RBAC §4.3) | – | – | – | A(weighted) | – | – | – | – | – | – | – | R | C R U |

Segregation-of-duties is enforced by **P02** everywhere: **maker ≠ checker**, no self-approval of one's own nomination, budget sanctioner ≠ cost recorder, vendor empanelment requester ≠ approver, credential self-capture ≠ verifier, DPO erasure approver ≠ requester. PII Protection Ceiling and field masking on serialization apply per RBAC §3.9 / Platform §P02.

---

## 4. Shared Platform Foundation (consumed, not redefined)

G07 inherits the PrimeSoft platform contracts (`PLATFORM_FOUNDATION.md` §4–§8). It authors business logic only.

- **Frontend:** Behaviour/NFR specified here; physical stack (React/TypeScript/Tailwind/shadcn) is an engineering choice within the platform's logical architecture (`MODULE_RECONCILIATION.md` §C). WCAG 2.1 AA across screens **and assessment/e-learning content** (§9). Canonical UI-state standard (empty/loading/error/no-permission/partial-data; masked fields; `E·AR` request-change) per Foundation §3.
- **API:** REST under **`/api/v1`**; **cursor pagination**; **`Idempotency-Key`**; **`X-Correlation-Id`**; **canonical error envelope `{error:{code,message,field,details}}`** with the **8-code standard table** (Foundation §1; §10 below). Endpoints never re-implement permission logic — they call **`Authorization.check`** (P02).
- **Datastore:** PostgreSQL primary with **`tenant_id`/`entity_id`** on every table and data-layer scoping; object storage for documents via **G13**; xAPI statements proxied through the **LRS** via **X.3** (FR-G07-015).
- **Auth/session:** Bearer JWT carrying resolved roles + tenant/entity scope (P02); MFA enforced for high-privilege roles (`ld_manager`, DPO) per Vision §2.2; **kiosk/assisted sessions use an attributed operator principal**.
- **Workflow:** **P01 WorkflowEngine** (`startInstance/advance/approve/reject/sendBack/delegate/cancel/query`, each idempotent; 5 patterns from Appendix D; in-flight version pinning) for all maker-checker and multi-level approvals.
- **Audit:** **P05** dual-log, DB-trigger, immutable, ≥ 7-yr retention; tamper-evidence tracks **OPEN-PLAT-03** (hash-chain) — G07 does not invent a parallel mechanism.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, India DPDP Act 2023 alignment (incl. learning-PII erasure at exit via the P05 redaction-marker path), statutory retention.
- **Integration:** **X.3 integration framework** for all outbound/inbound external calls (LMS/LRS, procurement) — credentials from **P04 `integration_credentials`**, circuit-breaking, outbound idempotency, payload versioning, per-integration error mapping. Cross-module exchanges (G08 gap feed, G12 SR posting, G10 payable, G01 joiner) ride the platform service-contract convention (auth context + idempotency key + correlation id + standard envelope).
- **Jobs:** **X.1** runner; G07 registers **JOB-G07-\*** with `{job_id, schedule, tenant_scope}`; runner guarantees idempotency, exponential backoff ×3, terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL`, per-tenant isolation, run audit row.
- **Migration:** **P06** ETL+V — three staging dry runs, waves, `migration_runs`, **`gov_source_id`** traceability column against the legacy training register.

**Platform/government entities referenced (not redefined):** `employees`/`org_units`/`users`/`roles`/`designations`/`cadres` (G01/PrimeSoft M01), `documents` (G13), `notifications`, `consent_records`, `integration_credentials` (P04), `workflows`/`workflow_instances`/`workflow_actions` (P01), `audit_log`/`security_audit_log` (P05), `migration_runs` (P06), `service_register_events` (**G12 SR ledger** on P05).

---

## 5. Holistic Data Model

### 5.0 Platform data-model conventions (apply to every G07 entity)
- **`tenant_id`** (non-nullable) and, where entity-scoped, **`entity_id`** on **every** G07 business table; data-layer scoping per Platform §0.1 (an unscoped query is rejected, not defaulted to "all").
- Audit fields (`created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`) apply to every non-ledger entity; append-only ledgers carry only `created_at`, `created_by`. **Mutations are captured by the P05 DB trigger** — G07 does not write audit rows in application code.
- **No locally-defined `audit_log`, `workflow_instances`/`workflow_tasks`, or `service_register_events`-as-platform-entity.** Those are consumed from **P05**, **P01 (`workflow_actions`)**, and the **G12 ledger** respectively.
- Master records publish through a **P01 master-data approval flow**; `code` uniqueness uses **`VAL-MASTER-UNIQUE`** (code unique within type + tenant).

### 5.1 Entity inventory
G07 authors **37 module entities** (all carrying `tenant_id`/`entity_id`). Platform/G12 entities are referenced, not owned.

| # | Entity | Type | Owner | Description |
|---|---|---|---|---|
| 1 | `skill_categories` | Master | G07 | Top-level grouping of the skill taxonomy. |
| 2 | `skills` | Master | G07 | Atomic skill; `revalidation_interval_months`. |
| 3 | `proficiency_levels` | Master | G07 | Ordered proficiency scale; `descriptor` mandatory behavioural anchor. |
| 4 | `competencies` | Master | G07 | Higher-order competency definitions. |
| 5 | `competency_models` | Master | G07 | Role/designation-scoped model header; `role_id`, `review_due_date`, `owner_id`. |
| 6 | `competency_model_items` | Master | G07 | Required competency + target proficiency lines. |
| 7 | `employee_skills` | Transactional | G07 | Per-employee inventory; `last_validated_at`, `freshness_status`. |
| 8 | `skill_assessments` | Append-only | G07 | History of skill assessment events. |
| 9 | `skill_gap_analyses` | Transactional | G07 | Computed gap snapshot; `scoring_mode` (BINARY/WEIGHTED). |
| 10 | `skill_gap_items` | Transactional | G07 | Per-competency gap lines; normalised `source`. |
| 11 | `training_needs` | Transactional | G07 | Identified training need. |
| 12 | `annual_training_plans` | Transactional | G07 | Yearly plan header per entity/org-unit / FY. |
| 13 | `training_plan_items` | Transactional | G07 | Planned program lines. |
| 14 | `training_programs` | Master | G07 | Course catalog entry. |
| 15 | `training_sessions` | Transactional | G07 | Scheduled batch/session. |
| 16 | `trainers` | Master | G07 | Internal/external trainer profiles. |
| 17 | `venues` | Master | G07 | Physical/virtual venues. |
| 18 | `training_nominations` | Transactional | G07 | Enrollment; `waitlist_position`, `training_campaign_id`, `workflow_instance_id`→P01. |
| 19 | `training_attendance` | Transactional | G07 | Per-day attendance; de-polymorphised actor; `capture_mode`, offline-sync fields. |
| 20 | `training_assessments` | Append-only | G07 | Pre/post results; de-polymorphised assessor. |
| 21 | `training_feedback` | Append-only | G07 | Kirkpatrick L1–L4; L3/L4 programme-level. |
| 22 | `certifications` | Transactional | G07 | Issued certs; external-credential fields, `lapsed_mandatory`, `service_register_event_id`→G12. |
| 23 | `training_budgets` | Transactional | G07 | Budget per entity/org-unit / FY / category (category reporting-only). |
| 24 | `training_costs` | Transactional | G07 | Cost entries; `vendor_empanelment_id`, `training_sponsorship_id`. |
| 25 | `learning_paths` | Master | G07 | Curated/recommended program sequence. |
| 26 | `learning_path_items` | Master | G07 | Ordered steps in a path. |
| 27 | `cpd_records` | Append-only | G07 | CPD credits earned. |
| 28 | `lms_enrollments` | Transactional | G07 | LMS/LRS sync metadata; `learning_record_store_id`, `lms_content_package_id`, `sync_mode`. |
| 29 | `training_campaigns` | Transactional | G07 | Mandatory-compliance campaign header. |
| 30 | `campaign_targets` | Transactional | G07 | Per-employee target line with status + wave. |
| 31 | `learning_record_stores` | Master/Config | G07 | LRS/LMS **X.3 connector** config (endpoint, standard, **credential ref → P04**, sync mode). |
| 32 | `lms_content_packages` | Master | G07 | Versioned SCORM/xAPI/hosted asset with accessibility metadata. |
| 33 | `assessment_items` | Master | G07 | Item bank: questions, options, keys, accessibility, versions. |
| 34 | `vendor_empanelments` | Master | G07 | External provider/trainer empanelment, contract & procurement reference. |
| 35 | `training_sponsorships` | Transactional | G07 | Sponsored long-duration/study-leave/deputation with service-bond. |
| 36 | `credential_verifications` | Append-only | G07 | Verification trail for external/professional credentials. |
| 37 | `learning_data_retention_actions` | Append-only | G07 | DPDP retention/erasure actions on learning PII at exit. |

### 5.2 Field tables (re-grounded — only new/changed tables reproduced)
> Every table below also carries **`tenant_id`** (NOT NULL) and **`entity_id`** (NOT NULL where entity-scoped) plus audit fields, per §5.0. References to `workflow_instances`/`audit_log`/`service_register_events` are to the **platform/G12** entities.

#### 5.2.2 `skills`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | Platform scoping |
| `skill_category_id` | UUID | FK→skill_categories, NOT NULL | |
| `code` | VARCHAR(40) | `VAL-MASTER-UNIQUE` | Unique within type+tenant |
| `name` | VARCHAR(150) | NOT NULL, `VAL-REQUIRED` | |
| `description` | TEXT | | |
| `is_compliance_skill` | BOOLEAN | DEFAULT false | Maps to mandatory training |
| `default_validity_months` | INT | NULL, `VAL-INT` | For renewable compliance skills |
| `revalidation_interval_months` | INT | NULL, `VAL-INT`,`VAL-G07-REVAL`(≥1) | Freshness window; NULL = never decays |
| `status` | ENUM | `VAL-ENUM` | DRAFT, PUBLISHED, ARCHIVED |

#### 5.2.3 `proficiency_levels`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `proficiency_level_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `level_order` | INT | UNIQUE, NOT NULL | 1..N contiguous ascending |
| `code` | VARCHAR(20) | `VAL-MASTER-UNIQUE` | `L1`..`L5` |
| `name` | VARCHAR(60) | NOT NULL | Awareness/Working/Proficient/Advanced/Expert |
| `descriptor` | TEXT | **NOT NULL** `VAL-G07-ANCHOR` | Concrete behavioural anchor; required for publish |
| `status` | ENUM | `VAL-ENUM` | PUBLISHED, ARCHIVED |

#### 5.2.5 `competency_models`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `competency_model_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `code` | VARCHAR(40) | `VAL-MASTER-UNIQUE` | |
| `name` | VARCHAR(150) | NOT NULL | |
| `scope_type` | ENUM | `VAL-ENUM` | DESIGNATION, CADRE, ROLE, ORG_UNIT, GENERIC |
| `designation_id` | UUID | FK→designations, NULL | When scope=DESIGNATION |
| `role_id` | UUID | FK→roles, NULL | When scope=ROLE (closes unsatisfiable-scope defect) |
| `cadre` | VARCHAR(60) | NULL | When scope=CADRE |
| `org_unit_id` | UUID | FK→org_units, NULL | When scope=ORG_UNIT |
| `owner_id` | UUID | FK→employees, NOT NULL | Accountable steward |
| `review_due_date` | DATE | NOT NULL | Drives JOB-G07-MODELREVIEW staleness alarm |
| `effective_from` | DATE | NOT NULL, `VAL-EFFECTIVE` | |
| `effective_to` | DATE | NULL | |
| `version` | INT | NOT NULL DEFAULT 1 | |
| `status` | ENUM | `VAL-ENUM` | DRAFT, PUBLISHED, ARCHIVED |
| CHECK `VAL-G07-SCOPEKEY` | — | exactly one scope key per `scope_type`; all null only when GENERIC | |

#### 5.2.7 `employee_skills`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `employee_skill_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `skill_id` | UUID | FK→skills, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `source` | ENUM | `VAL-ENUM` | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `validated_by` | UUID | FK→employees, NULL | Manager/L&D validator |
| `validated_at` | TIMESTAMP | NULL | |
| `last_validated_at` | TIMESTAMP | NULL | Basis for freshness |
| `acquired_on` | DATE | NULL | |
| `expires_on` | DATE | NULL | Currency for renewable skills |
| `freshness_status` | ENUM | NOT NULL DEFAULT 'FRESH' | FRESH, STALE, EXPIRED — set by **JOB-G07-FRESHNESS** |
| `status` | ENUM | `VAL-ENUM` | DECLARED, VALIDATED, EXPIRED, REVOKED |
| UNIQUE(`tenant_id`,`employee_id`,`skill_id`) | — | | One current row per skill |

#### 5.2.9 `skill_gap_analyses` (header)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_analysis_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `competency_model_id` | UUID | FK→competency_models, NOT NULL | |
| `scoring_mode` | ENUM | NOT NULL DEFAULT 'BINARY' | BINARY (launch) / WEIGHTED (`ld.gap-weighted`) |
| `appraisal_cycle_ref` | VARCHAR(40) | NULL | G08 cycle id; `UNAVAILABLE` in degraded mode |
| `model_stale_flag` | BOOLEAN | DEFAULT false | true if model past `review_due_date` at compute |
| `stale_skill_count` | INT | DEFAULT 0 | inputs discounted for staleness |
| `overall_gap_score` | NUMERIC(6,2) | NULL | Only when WEIGHTED |
| `critical_gap_count` | INT | DEFAULT 0 | |
| `generated_on` | TIMESTAMP | NOT NULL | |
| `recompute_trigger` | ENUM | `VAL-ENUM` | FULL, INCREMENTAL_SKILL_EVENT, INCREMENTAL_MODEL_EVENT, ON_DEMAND |
| `status` | ENUM | `VAL-ENUM` | DRAFT, FINALIZED, SUPERSEDED |

#### 5.2.10 `skill_gap_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_item_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `skill_gap_analysis_id` | UUID | FK→skill_gap_analyses, NOT NULL | |
| `competency_id` | UUID | FK→competencies, NOT NULL | |
| `target_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NULL | NULL = no current skill |
| `gap_size` | INT | `VAL-G07-GAPSIZE` (≥0) | target_order − current_order |
| `is_critical` | BOOLEAN | DEFAULT false | |
| `weight_applied` | NUMERIC(5,2) | NULL | Only when WEIGHTED |
| `discounted_for_staleness` | BOOLEAN | DEFAULT false | current skill STALE and excluded |
| `source` | ENUM | `VAL-ENUM` | GAP_ANALYSIS, APPRAISAL, MANDATORY — 1:1 with `training_needs.source` |

#### 5.2.18 `training_nominations`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_nomination_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `training_session_id` | UUID | FK→training_sessions, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_need_id` | UUID | FK→training_needs, NULL | Traceability |
| `training_campaign_id` | UUID | FK→training_campaigns, NULL | set when created by a campaign wave |
| `nomination_type` | ENUM | `VAL-ENUM` | SELF, MANAGER, HR, MANDATORY, INDUCTION, CAMPAIGN |
| `nominated_by` | UUID | FK→employees, NOT NULL | |
| `workflow_instance_id` | UUID | FK→**workflow_instances (P01)**, NULL | P01 instance for the approval flow |
| `status` | ENUM | `VAL-ENUM` | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `waitlist_position` | INT | NULL | persisted FIFO rank when WAITLISTED; promotion logged via P05 |
| `estimated_cost` | NUMERIC(12,2) | DEFAULT 0, `VAL-CURRENCY` | |
| `completion_status` | ENUM | NULL | PASS, FAIL, INCOMPLETE |
| UNIQUE(`tenant_id`,`training_session_id`,`employee_id`) | — | | No duplicate enrolment |

#### 5.2.19 `training_attendance`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_attendance_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `session_date` | DATE | NOT NULL, `VAL-DATE` | One row per training day |
| `attendance_status` | ENUM | `VAL-ENUM` | PRESENT, ABSENT, LATE, EXCUSED |
| `check_in_at` | TIMESTAMP | NULL | |
| `check_out_at` | TIMESTAMP | NULL | |
| `marked_by_actor_type` | ENUM | NOT NULL | EMPLOYEE, TRAINER, KIOSK_OPERATOR — discriminator replaces polymorphic FK |
| `marked_by_actor_id` | UUID | NOT NULL | resolves to employees / trainers / users per actor_type |
| `capture_mode` | ENUM | NOT NULL DEFAULT 'ONLINE' | ONLINE, KIOSK, ASSISTED, OFFLINE_SYNC, LMS_DERIVED |
| `offline_captured_at` | TIMESTAMP | NULL | device timestamp when captured offline |
| `offline_sync_batch_id` | UUID | NULL | buffer/sync batch reference |
| `evidence_document_id` | UUID | FK→**documents (G13)**, NULL | Signed sheet |
| UNIQUE(`tenant_id`,`training_nomination_id`,`session_date`) | — | | |

#### 5.2.20 `training_assessments` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_assessment_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `assessment_phase` | ENUM | `VAL-ENUM` | PRE, POST, REASSESSMENT |
| `max_score` | NUMERIC(6,2) | NOT NULL | |
| `obtained_score` | NUMERIC(6,2) | `VAL-NO`, 0 ≤ obtained ≤ max | |
| `pass_threshold` | NUMERIC(6,2) | NOT NULL | |
| `result` | ENUM | NOT NULL | PASS, FAIL |
| `assessed_by_actor_type` | ENUM | NOT NULL | EMPLOYEE, TRAINER, SYSTEM (LMS-graded) |
| `assessed_by_actor_id` | UUID | NOT NULL | |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.22 `certifications`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `certification_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `credential_source` | ENUM | NOT NULL DEFAULT 'INTERNAL_PROGRAM' | INTERNAL_PROGRAM, EXTERNAL_PROFESSIONAL |
| `training_program_id` | UUID | FK→training_programs, NULL | NULL for external |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `certificate_no` | VARCHAR(50) | `VAL-MASTER-UNIQUE` | Human-readable |
| `title` | VARCHAR(200) | NOT NULL | |
| `issuing_authority` | VARCHAR(150) | NOT NULL | Internal authority |
| `issuing_body` | VARCHAR(150) | NULL | External body (PMI, ISACA) when EXTERNAL_PROFESSIONAL |
| `external_reference_no` | VARCHAR(80) | NULL, `VAL-G07-CREDREF` | External credential/licence number |
| `verification_status` | ENUM | NOT NULL DEFAULT 'NOT_REQUIRED' | NOT_REQUIRED, PENDING, VERIFIED, REJECTED |
| `verified_by` | UUID | FK→employees, NULL | L&D verifier (≠ self-capturer) |
| `verification_evidence_document_id` | UUID | FK→documents (G13), NULL | |
| `issue_date` | DATE | NOT NULL | |
| `valid_until` | DATE | NULL | NULL = lifetime |
| `is_mandatory` | BOOLEAN | DEFAULT false | |
| `lapsed_mandatory` | BOOLEAN | DEFAULT false | true when a mandatory cert expires un-renewed; **consumed by G06** |
| `renewal_need_id` | UUID | FK→training_needs, NULL | auto-created renewal need on expiry |
| `certificate_document_id` | UUID | FK→documents (G13), NULL | |
| `sr_posting_status` | ENUM | `VAL-ENUM` | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `service_register_event_id` | UUID | FK→**service_register_events (G12)**, NULL | G12 ref after posting |
| `status` | ENUM | `VAL-ENUM` | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |

#### 5.2.24 `training_costs`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_cost_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `training_budget_id` | UUID | FK→training_budgets, NOT NULL | |
| `training_session_id` | UUID | FK→training_sessions, NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `vendor_empanelment_id` | UUID | FK→vendor_empanelments, NULL | external costs tie to empanelled vendor |
| `training_sponsorship_id` | UUID | FK→training_sponsorships, NULL | sponsorship/bond cost linkage |
| `cost_type` | ENUM | `VAL-ENUM` | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, SPONSORSHIP, BOND_RECOVERY, OTHER |
| `amount` | NUMERIC(12,2) | `VAL-CURRENCY` | |
| `cost_stage` | ENUM | NOT NULL | COMMITTED, ACTUAL |
| `payable_to_payroll` | BOOLEAN | DEFAULT false | Reimbursement/bond-recovery → **G10** feed |
| `invoice_document_id` | UUID | FK→documents (G13), NULL | |
| `status` | ENUM | `VAL-ENUM` | DRAFT, APPROVED, PAID, CANCELLED |

#### 5.2.28 `lms_enrollments`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `lms_enrollment_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `learning_record_store_id` | UUID | FK→learning_record_stores, NOT NULL | which **X.3** LRS/LMS connector |
| `lms_content_package_id` | UUID | FK→lms_content_packages, NULL | hosted package version launched |
| `sync_mode` | ENUM | `VAL-ENUM` | XAPI_LRS, SCORM_POLL, MANUAL |
| `lms_course_ref` | VARCHAR(120) | NOT NULL | |
| `lms_user_ref` | VARCHAR(120) | NOT NULL | |
| `standard` | ENUM | `VAL-ENUM` | SCORM_12, SCORM_2004, XAPI, NONE |
| `progress_pct` | NUMERIC(5,2) | DEFAULT 0, `VAL-PCT` | 0–100 |
| `completion_status` | ENUM | NOT NULL | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |
| `score` | NUMERIC(6,2) | NULL | |
| `last_synced_at` | TIMESTAMP | NULL | |
| `last_poll_cursor` | VARCHAR(120) | NULL | SCORM reporting-API poll cursor (X.3 idempotency) |
| `lms_statement_id` | VARCHAR(120) | NULL | xAPI statement / **X.3 inbound idempotency key** |

#### 5.2.29 `training_campaigns`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_campaign_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `code` | VARCHAR(40) | `VAL-MASTER-UNIQUE` | e.g., `CAMP-CYBER-2026` |
| `name` | VARCHAR(200) | NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | The mandatory program |
| `scope_type` | ENUM | `VAL-ENUM` | ORG_UNIT, CADRE, DESIGNATION, ALL_STAFF |
| `scope_ref` | VARCHAR(64) | NULL | org_unit_id / cadre / designation_id; NULL for ALL_STAFF |
| `financial_year` | VARCHAR(9) | NOT NULL | |
| `window_start` | DATE | NOT NULL, `VAL-DATE` | |
| `window_end` | DATE | NOT NULL, `VAL-DATE` | Statutory deadline |
| `renewal_cadence_months` | INT | NULL | Rolling renewal interval; NULL = one-off |
| `auto_wave` | BOOLEAN | DEFAULT true | Auto-schedule via JOB-G07-CAMPAIGN |
| `wave_size` | INT | NULL | Max participants per wave/session |
| `escalation_policy_json` | JSONB | NULL | Lead times + escalation chain (drives W.3/X.2) |
| `coverage_denominator_rule` | ENUM | `VAL-G07-COVERAGE` | ELIGIBLE_ALL, EXCLUDE_LONG_LEAVE, EXCLUDE_NON_LOGIN_UNMAPPED, CUSTOM |
| `status` | ENUM | `VAL-ENUM` | DRAFT, APPROVED, RUNNING, PAUSED, COMPLETED, CANCELLED |
| `approved_by` | UUID | FK→employees, NULL | via P01 approval |

#### 5.2.30 `campaign_targets`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `campaign_target_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `training_campaign_id` | UUID | FK→training_campaigns, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `is_eligible` | BOOLEAN | DEFAULT true | Per coverage denominator rule |
| `exemption_reason` | VARCHAR(120) | NULL, `VAL-COMMENT` | When not eligible |
| `wave_no` | INT | NULL | Assigned wave |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | Created nomination |
| `target_status` | ENUM | `VAL-ENUM` | PENDING, NOMINATED, IN_PROGRESS, COMPLETED, OVERDUE, EXEMPT, FAILED |
| `due_date` | DATE | NOT NULL | |
| `escalation_level` | INT | DEFAULT 0 | 0..N |
| UNIQUE(`tenant_id`,`training_campaign_id`,`employee_id`) | — | | |

#### 5.2.31 `learning_record_stores` (X.3 connector config)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_record_store_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `code` | VARCHAR(40) | `VAL-MASTER-UNIQUE` | |
| `name` | VARCHAR(150) | NOT NULL | |
| `connector_type` | ENUM | `VAL-ENUM` | LRS_XAPI, LMS_REPORTING_API, SCORM_SELF_HOSTED |
| `is_primary` | BOOLEAN | DEFAULT false, `VAL-G07-PRIMARYLRS` | exactly one primary (system of record) |
| `endpoint_url` | VARCHAR(300) | NOT NULL | |
| `integration_credential_ref` | VARCHAR(120) | NOT NULL | **Reference into P04 `integration_credentials`** — never a plaintext secret in this table |
| `poll_interval_minutes` | INT | NULL | For LMS_REPORTING_API (drives JOB-G07-LMSSYNC) |
| `supported_standards` | TEXT | NOT NULL | CSV of SCORM_12/SCORM_2004/XAPI |
| `circuit_breaker_policy_json` | JSONB | NULL | X.3 circuit-break / retry policy override |
| `status` | ENUM | `VAL-ENUM` | ACTIVE, INACTIVE |

#### 5.2.32 `lms_content_packages`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `lms_content_package_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | |
| `package_version` | VARCHAR(20) | NOT NULL | Semantic version |
| `standard` | ENUM | `VAL-ENUM` | SCORM_12, SCORM_2004, XAPI |
| `hosting` | ENUM | `VAL-ENUM` | SELF_HOSTED, EXTERNAL_LMS |
| `package_document_id` | UUID | FK→documents (G13), NULL | Stored binary when self-hosted |
| `launch_url_template` | VARCHAR(300) | NULL | |
| `wcag_conformance` | ENUM | `VAL-ENUM`,`VAL-G07-WCAG` | AA, A, NON_CONFORMANT, UNKNOWN |
| `accessibility_notes` | TEXT | NULL | content-accessibility metadata |
| `status` | ENUM | `VAL-ENUM` | DRAFT, PUBLISHED, RETIRED |
| UNIQUE(`tenant_id`,`training_program_id`,`package_version`) | — | | |

#### 5.2.33 `assessment_items`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `assessment_item_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NULL | Program-scoped or shared |
| `item_bank_code` | VARCHAR(40) | NOT NULL | Logical grouping |
| `question_text` | TEXT | NOT NULL | |
| `item_type` | ENUM | `VAL-ENUM` | SINGLE_CHOICE, MULTI_CHOICE, TRUE_FALSE, NUMERIC, FREE_TEXT |
| `options_json` | JSONB | NULL | Options for choice items |
| `correct_key_json` | JSONB | NULL | RBAC-restricted (field mask on serialization, P02) |
| `max_score` | NUMERIC(6,2) | NOT NULL DEFAULT 1 | |
| `wcag_conformance` | ENUM | `VAL-G07-WCAG` | AA, A, NON_CONFORMANT, UNKNOWN |
| `version` | INT | NOT NULL DEFAULT 1 | |
| `status` | ENUM | `VAL-ENUM` | DRAFT, PUBLISHED, RETIRED |

#### 5.2.34 `vendor_empanelments`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `vendor_empanelment_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `vendor_name` | VARCHAR(200) | NOT NULL | |
| `trainer_id` | UUID | FK→trainers, NULL | When empanelment is a specific external trainer |
| `empanelment_ref` | VARCHAR(80) | `VAL-MASTER-UNIQUE` | Empanelment/registration number |
| `contract_ref` | VARCHAR(80) | NULL | |
| `contract_document_id` | UUID | FK→documents (G13), NULL | |
| `procurement_ref` | VARCHAR(80) | NULL | External procurement/tender reference (via X.3 if linked) |
| `valid_from` | DATE | NOT NULL, `VAL-DATE` | |
| `valid_until` | DATE | NULL | |
| `rate_card_json` | JSONB | NULL | Agreed rates |
| `status` | ENUM | `VAL-ENUM`,`VAL-G07-EMPANEL` | DRAFT, PENDING_APPROVAL, EMPANELLED, SUSPENDED, EXPIRED, BLACKLISTED |
| `approved_by` | UUID | FK→employees, NULL | ≠ requester (SoD via P02) |

#### 5.2.35 `training_sponsorships`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_sponsorship_id` | UUID | PK | |
| `tenant_id`,`entity_id` | UUID | NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NULL | Or free-text external course |
| `external_course_name` | VARCHAR(200) | NULL | When not catalog |
| `sponsorship_type` | ENUM | `VAL-ENUM` | STUDY_LEAVE, DEPUTATION, DEGREE, EXTERNAL_COURSE |
| `sponsored_amount` | NUMERIC(14,2) | `VAL-CURRENCY` | |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NULL | |
| `service_bond_months` | INT | NOT NULL DEFAULT 0 | Obligation duration |
| `bond_end_date` | DATE | NULL | Derived: completion + bond_months |
| `bond_recovery_amount` | NUMERIC(14,2) | NULL, `VAL-G07-BOND` | Liquidated on breach |
| `obligation_status` | ENUM | `VAL-ENUM` | PROPOSED, SANCTIONED, ACTIVE, FULFILLED, BREACHED, RECOVERED, WAIVED |
| `sanctioned_by` | UUID | FK→employees, NULL | Dept Head/Appointing Authority via P01 |

#### 5.2.36 `credential_verifications` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `credential_verification_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `certification_id` | UUID | FK→certifications, NOT NULL | |
| `verification_action` | ENUM | `VAL-ENUM` | SUBMITTED, EVIDENCE_REVIEWED, VERIFIED, REJECTED, RE_VERIFIED |
| `verification_method` | ENUM | `VAL-ENUM` | DOCUMENT, ISSUER_PORTAL, THIRD_PARTY, MANUAL_ATTEST |
| `evidence_document_id` | UUID | FK→documents (G13), NULL | |
| `actor_id` | UUID | FK→employees, NOT NULL | |
| `comments` | TEXT | NULL, `VAL-COMMENT` | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.37 `learning_data_retention_actions` (append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_data_retention_action_id` | UUID | PK | |
| `tenant_id` | UUID | NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `trigger_event` | ENUM | `VAL-ENUM` | RETIRED, RESIGNED, TERMINATED, DECEASED, DSR_ERASURE_REQUEST |
| `action_type` | ENUM | `VAL-ENUM` | ANONYMISE_SELF_ASSESSMENT, ERASE_MARKETPLACE_PRESENCE, DETACH_FEEDBACK_AUTHOR, RETAIN_STATUTORY, EXPORT |
| `scope_entity` | VARCHAR(60) | NOT NULL | e.g., employee_skills, training_feedback, certifications |
| `retention_override` | BOOLEAN | DEFAULT false | true = kept under statutory retention (SR-posted cert) |
| `approved_by` | UUID | FK→employees, NOT NULL | DPO (≠ requester) |
| `executed_at` | TIMESTAMP | NULL | erasure realised via **P05 redaction-marker** path for audit PII |
| `created_at`,`created_by` | — | append-only | |

### 5.3 Relationship map
```
skill_categories 1—* skills (revalidation_interval_months → freshness via JOB-G07-FRESHNESS)
skills *—* competencies (competencies.linked_skill_ids)
proficiency_levels 1—* (employee_skills, competency_model_items, skill_gap_items)  [descriptor anchor]
competency_models (role_id|designation_id|cadre|org_unit_id; owner_id; review_due_date) 1—* competency_model_items *—1 competencies
employees(G01) 1—* employee_skills (last_validated_at, freshness_status) *—1 skills
employees 1—* skill_gap_analyses (scoring_mode) 1—* skill_gap_items *—1 competencies
skill_gap_items.source ≡ training_needs.source  [GAP_ANALYSIS|APPRAISAL|MANDATORY]
annual_training_plans 1—* training_plan_items *—1 training_programs
training_programs 1—* training_sessions *—1 venues, *—1 trainers
training_programs 1—* lms_content_packages ; training_programs 1—* assessment_items
training_campaigns 1—* campaign_targets *—1 employees ; campaign_targets 1—0..1 training_nominations
training_sessions 1—* training_nominations (waitlist_position) —> workflow_instances(P01)
training_nominations 1—* training_attendance (actor_type; offline)
training_nominations 1—* training_assessments (actor_type)
training_nominations 1—1 certifications (credential_source) —> service_register_events(G12, on P05)
certifications 1—* credential_verifications
certifications.lapsed_mandatory —> consumed by G06 sensitive-duty checks
training_nominations 1—1 lms_enrollments *—1 learning_record_stores(X.3 connector → P04 cred) , *—0..1 lms_content_packages
training_budgets 1—* training_costs *—1 sessions/nominations/vendor_empanelments/training_sponsorships
training_sponsorships (service_bond) —> BOND_RECOVERY cost feed to G10
learning_paths 1—* learning_path_items *—1 training_programs
employees 1—* learning_data_retention_actions (DPDP exit → P05 redaction)
documents(G13) referenced by assessments, programs, packages, items, attendance, certs, verifications, costs, empanelments
notifications(X.2), audit_log(P05 trigger), workflow_instances/actions(P01) referenced throughout
Gap Contract v1 (read view) projected from skill_gap_analyses+items —> consumed by G06, G08
```

### 5.4 Ownership / reuse matrix
| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations`, `cadres`, `roles` | G01 / PrimeSoft M01 | G07 (read) | G01 |
| `documents` | G13 | G07 | G07 stores refs; binaries G13 |
| `service_register_events` | **G12** (on P05) | G07 (read posted ref) | G07 appends training/qualification events (pinned contract §10.6, via X.3) |
| `notifications` | Platform X.2 | G07 | G07 (via W.3 resolution) |
| `audit_log`/`security_audit_log` | Platform P05 | G07 (Auditor) | P05 DB trigger (not application code) |
| `workflows`/`workflow_instances`/`workflow_actions` | Platform P01 | G07 | P01 |
| `integration_credentials` | Platform P04 | G07 (via X.3) | Org Admin |
| Appraisal development gaps | G08 | G07 (read feed, pinned contract) | G08 |
| Gap Contract v1 | **G07** | G06, G08 | G07 |
| Payroll reimbursement / bond-recovery payable | G10 | G10 | G07 emits feed |
| All `skill_*`,`competency_*`,`training_*`,`certifications`,`credential_*`,`learning_*`,`cpd_*`,`lms_*`,`assessment_items`,`vendor_empanelments`,`training_sponsorships`,`learning_data_retention_actions` | **G07** | G14, G06, G08 | G07 |

### 5.5 Enum & reference catalog
| Enum | Values |
|---|---|
| `employment_status` (inherited G01) | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| master `status` | DRAFT, PUBLISHED, ARCHIVED / RETIRED |
| `competency_type` | TECHNICAL, BEHAVIOURAL, LEADERSHIP, FUNCTIONAL, COMPLIANCE |
| `scope_type` (competency_models) | DESIGNATION, ROLE (backed by `role_id`), CADRE, ORG_UNIT, GENERIC |
| `employee_skills.source` | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `employee_skills.status` | DECLARED, VALIDATED, EXPIRED, REVOKED |
| `employee_skills.freshness_status` | FRESH, STALE, EXPIRED |
| `skill_gap_analyses.scoring_mode` | BINARY, WEIGHTED |
| `skill_gap_analyses.recompute_trigger` | FULL, INCREMENTAL_SKILL_EVENT, INCREMENTAL_MODEL_EVENT, ON_DEMAND |
| `skill_gap_items.source` | GAP_ANALYSIS, APPRAISAL, MANDATORY |
| `training_needs.source` | GAP_ANALYSIS, APPRAISAL, MANDATORY, MANAGER, SELF, INDUCTION |
| `training_needs.priority` | LOW, MEDIUM, HIGH, CRITICAL |
| `training_needs.status` | IDENTIFIED, CONSOLIDATED, PLANNED, ADDRESSED, DEFERRED, REJECTED |
| `annual_training_plans.status` | DRAFT, SUBMITTED, APPROVED, ACTIVE, CLOSED |
| `delivery_mode` | CLASSROOM, ELEARNING, BLENDED, EXTERNAL, ON_THE_JOB, WEBINAR |
| `provider_type` | INTERNAL, EXTERNAL, VENDOR, GOVT_INSTITUTE |
| `training_sessions.status` | DRAFT, OPEN, FULL, RUNNING, COMPLETED, CANCELLED |
| `training_nominations.status` | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `nomination_type` | SELF, MANAGER, HR, MANDATORY, INDUCTION, CAMPAIGN |
| `attendance_status` | PRESENT, ABSENT, LATE, EXCUSED |
| `attendance capture_mode` | ONLINE, KIOSK, ASSISTED, OFFLINE_SYNC, LMS_DERIVED |
| `actor_type` (attendance/assessment) | EMPLOYEE, TRAINER, KIOSK_OPERATOR, SYSTEM |
| `assessment_phase` | PRE, POST, REASSESSMENT |
| `kirkpatrick_level` | L1_REACTION, L2_LEARNING, L3_BEHAVIOUR, L4_RESULTS |
| `certifications.credential_source` | INTERNAL_PROGRAM, EXTERNAL_PROFESSIONAL |
| `certifications.verification_status` | NOT_REQUIRED, PENDING, VERIFIED, REJECTED |
| `certifications.status` | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |
| `sr_posting_status` | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `cost_type` | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, SPONSORSHIP, BOND_RECOVERY, OTHER |
| `cost_stage` | COMMITTED, ACTUAL |
| `lms standard` | SCORM_12, SCORM_2004, XAPI, NONE |
| `lms sync_mode` | XAPI_LRS, SCORM_POLL, MANUAL |
| `lms completion_status` | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |
| `training_campaigns.status` | DRAFT, APPROVED, RUNNING, PAUSED, COMPLETED, CANCELLED |
| `campaign_targets.target_status` | PENDING, NOMINATED, IN_PROGRESS, COMPLETED, OVERDUE, EXEMPT, FAILED |
| `vendor_empanelments.status` | DRAFT, PENDING_APPROVAL, EMPANELLED, SUSPENDED, EXPIRED, BLACKLISTED |
| `training_sponsorships.obligation_status` | PROPOSED, SANCTIONED, ACTIVE, FULFILLED, BREACHED, RECOVERED, WAIVED |
| `connector_type` (LRS, X.3) | LRS_XAPI, LMS_REPORTING_API, SCORM_SELF_HOSTED |
| `retention action_type` | ANONYMISE_SELF_ASSESSMENT, ERASE_MARKETPLACE_PRESENCE, DETACH_FEEDBACK_AUTHOR, RETAIN_STATUTORY, EXPORT |

**Normalised source-enum mapping (gap-item → need is 1:1):** GAP_ANALYSIS→GAP_ANALYSIS, APPRAISAL→APPRAISAL, MANDATORY→MANDATORY.

### 5.6 Data integrity rules
1. **Proficiency ordering:** `skill_gap_items.gap_size = max(0, target.level_order − current.level_order)` (`VAL-G07-GAPSIZE`); never negative.
2. **One current skill row:** `UNIQUE(tenant_id, employee_id, skill_id)` on `employee_skills`; history in `skill_assessments`.
3. **No duplicate enrolment:** `UNIQUE(tenant_id, training_session_id, employee_id)` on `training_nominations`.
4. **Capacity invariant:** `enrolled_count ≤ capacity` (`VAL-G07-CAPACITY`); beyond capacity → WAITLISTED with persisted `waitlist_position`, not APPROVED.
5. **Score bounds:** `0 ≤ obtained_score ≤ max_score`; `result=PASS` iff `obtained ≥ pass_threshold`.
6. **Date sanity (`VAL-DATE`/`VAL-EFFECTIVE`):** `end_date ≥ start_date`; `nomination_deadline ≤ start_date`; `certifications.valid_until > issue_date`; `window_end ≥ window_start`; `vendor_empanelments.valid_until ≥ valid_from`.
7. **Budget reconciliation — canonical key (`VAL-G07-BUDGETKEY`):** the single canonical reconciliation key is **`(financial_year, entity_id/org_unit_id)`**. `skill_category_id`/`competency_id` are **reporting dimensions only**, never reconciliation keys. The invariant `committed + actual ≤ allocated` is evaluated only at the entity/org-unit + FY grain. Worked example: budget `tb-8001` (ou-12, FY2026-2027) allocated ₹50,00,000; plan items sum ₹48,00,000 (≤ allocated ✓); committed ₹12,00,000; actual ₹3,50,000; utilisation 24%. Category breakdowns are reporting-only.
8. **SR posting only when due:** `service_register_event_id` set only when `sr_posting_status=POSTED`; significant/mandatory certs require POSTED before SUPERSEDED. Significance resolved by the `is_significant` rule set (`VAL-G07-SIGNIF`, FR-G07-016), not ad-hoc.
9. **Append-only ledgers:** `skill_assessments`, `training_assessments`, `training_feedback`, `cpd_records`, `credential_verifications`, `learning_data_retention_actions` accept no UPDATE/DELETE; G12 SR events are append-only on the P05 substrate.
10. **Segregation of duties (enforced by P02):** `nominated_by ≠ approver`; budget `approved_by ≠ training_costs.created_by`; empanelment requester ≠ `approved_by`; credential self-capture ≠ `verified_by`; retention requester ≠ DPO `approved_by`.
11. **Mandatory completion:** a mandatory/campaign nomination cannot be CANCELLED/WITHDRAWN by the employee; only L&D with reason (`VAL-COMMENT`) → `ERR-REVOKE-FORBIDDEN`/`ERR-G07-MANDATORY`.
12. **Referential currency & freshness:** `employee_skill` with `expires_on < today` → EXPIRED; with `last_validated_at` older than `skill.revalidation_interval_months` → `freshness_status=STALE`. **JOB-G07-FRESHNESS** sets both nightly. STALE skills are discounted from gap closure per FR-G07-004 policy.
13. **No polymorphic FKs:** `training_attendance.marked_by_*` and `training_assessments.assessed_by_*` use an `actor_type` discriminator + `actor_id`; integrity enforced in the service layer / via partial FKs. External trainers are never coerced into `employees`.
14. **Incremental gap recompute:** gap analysis is recomputed **event-driven** on skill/validation/model/mandate events; the full **JOB-G07-GAPRECOMPUTE** batch is a fallback reconciliation, not the primary path.
15. **Campaign coverage denominator (`VAL-G07-COVERAGE`):** `eligible_count = targets where is_eligible=true`; completion % measured against `eligible_count`; exemptions explicitly recorded with reason — no silent denominator manipulation.
16. **Money rounding:** INR amounts rounded to paise using banker's rounding (`VAL-CURRENCY`); differences ≤ ₹0.01 absorbed by the budget line owner and logged.
17. **Service-bond integrity (`VAL-G07-BOND`):** a `training_sponsorships` with `obligation_status=BREACHED` must produce a `BOND_RECOVERY` cost feeding G10 before it can move to RECOVERED.
18. **One primary LRS (`VAL-G07-PRIMARYLRS`):** exactly one `learning_record_stores` row may have `is_primary=true`.

### 5.7 Sample data
**`competency_models`**
| competency_model_id | tenant_id | code | scope_type | role_id | designation_id | owner_id | review_due_date | status |
|---|---|---|---|---|---|---|---|---|
| cm-9001 | t-1 | CM-AAO | DESIGNATION | NULL | desg-AAO | emp-7001 | 2027-04-01 | PUBLISHED |
| cm-9003 | t-1 | CM-DBA-ROLE | ROLE | role-DBA | NULL | emp-7002 | 2026-12-31 | PUBLISHED |

**`learning_record_stores` (X.3 connector)**
| learning_record_store_id | code | connector_type | is_primary | endpoint_url | integration_credential_ref | status |
|---|---|---|---|---|---|---|
| lrs-01 | PRIMARY-LRS | LRS_XAPI | true | https://lrs.internal/xapi | intcred-lrs-01 (P04) | ACTIVE |
| lrs-02 | LEGACY-LMS | LMS_REPORTING_API | false | https://lms.gov/api | intcred-lms-02 (P04) | ACTIVE |

**`certifications` (external credential)**
| certification_id | employee_id | credential_source | issuing_body | external_reference_no | verification_status | is_mandatory | lapsed_mandatory | service_register_event_id | status |
|---|---|---|---|---|---|---|---|---|---|
| ct-6003 | emp-3001 | EXTERNAL_PROFESSIONAL | PMI | PMP-1234567 | VERIFIED | false | false | sre-771 (G12) | ACTIVE |
| ct-6002 | emp-3002 | INTERNAL_PROGRAM | CGG L&D | NULL | NOT_REQUIRED | true | true | sre-742 (G12) | EXPIRED |

---

## 6. Functional Requirements

> Each FR follows: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, Low-Level Design. **Platform re-grounding applies uniformly:** approvals run on **P01**; data-collection screens are **W.2 forms** citing `VAL-*`; scheduled processing is a **JOB-G07-\*** on **X.1**; external exchanges run on **X.3**; mutations are captured by the **P05** DB trigger; authz is **P02 `Authorization.check`**; SR posting targets **G12**; cross-module references use **G-codes**.

---

### FR-G07-001 — Skill Taxonomy & Competency Framework Management
- **Module:** G07
- **Primary Role(s):** L&D Officer (`ld_officer`, maker), L&D Manager/SysAdmin (publish/approve), Auditor (read)
- **User Story:** As an L&D Officer, I want to define and publish a governed skill taxonomy and competency catalog so that all downstream processes use a single controlled vocabulary.
- **Description:** CRUD for `skill_categories`, `skills`, `competencies`, `proficiency_levels` with a DRAFT→PUBLISHED→ARCHIVED lifecycle. **Publication runs as a configured P01 master-data approval flow (W.1).** Compliance skills carry a default validity. Non-compliance skills may carry `revalidation_interval_months`; proficiency levels require a concrete behavioural `descriptor` (`VAL-G07-ANCHOR`).
- **Acceptance Criteria:**
  1. An L&D Officer can create categories, skills, competencies, and proficiency levels in DRAFT (W.2 forms).
  2. Publication of any master record starts a **P01 instance** (`WorkflowEngine.startInstance`) routed to L&D Manager; PUBLISHED on approval.
  3. PUBLISHED records cannot have their `code` changed; only ARCHIVE or new version.
  4. A skill flagged `is_compliance_skill=true` must have `default_validity_months` set.
  5. Archiving a category is blocked if it has PUBLISHED child skills (`CONFLICT` 409, `ERR-PRECOND`).
  6. A proficiency level cannot be PUBLISHED without a non-empty `descriptor` (`VAL-G07-ANCHOR`, 422 `VALIDATION_FAILED`).
  7. A non-compliance skill may set `revalidation_interval_months`; if set it must be ≥ 1 (`VAL-G07-REVAL`).
- **Business Rules:** `code` is `VAL-MASTER-UNIQUE` per entity and immutable once PUBLISHED. Proficiency levels globally ordered, each with a behavioural anchor. A competency composes 0..N skills; deleting a skill referenced by a PUBLISHED competency is blocked.
- **Data Model References:** `skill_categories`/`skills`/`competencies`/`proficiency_levels` (C/R/U/Archive); **P05 audit (trigger)**, **P01 workflow_instances** (write via service).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/skills`, `/api/v1/competencies`, `/api/v1/skill-categories`, `/api/v1/proficiency-levels` |
  | PATCH | `/api/v1/skills/{id}` (incl. `:publish` → P01, `:archive`) |
  | GET | `/api/v1/skills?categoryId=&status=&cursor=&limit=` |
- **UI Behavior Notes:** Tree view; competency builder with skill multi-select; publish routes to the P01 checker queue; status badges; inline validation for compliance validity and mandatory descriptor (helper text). Implements the five canonical UI states (Foundation §3).
- **Edge Cases:** Duplicate `code` (409 `CONFLICT`/`ERR-DUP-INSTANCE` semantics); archiving in-use master (409 `ERR-PRECOND`); reordering referenced levels (allowed, warns, recomputes gaps lazily); publishing a level without descriptor (422 `VALIDATION_FAILED`).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `TaxonomyController`, `CompetencyService`, `MasterDataPublisher`, **`P01WorkflowClient`** |
  | Backend Flow | Validate (descriptor, revalidation) → persist DRAFT → on publish `startInstance(workflow_code=G07_MASTER_PUBLISH)` → on approve set PUBLISHED (P05 trigger audits) |
  | Validation | `VAL-MASTER-UNIQUE` code; compliance validity; `VAL-G07-ANCHOR`; contiguous level order |
  | Authorization | P02: `ld_officer` create/update; `ld_manager`/SysAdmin publish; global master scope |
  | State Changes | DRAFT→PUBLISHED→ARCHIVED; publish notifies subscribers (X.2); gap caches invalidated |
  | Failure Handling | 409 duplicate/in-use; 422 missing validity/descriptor; rollback on P01 failure |
  | Dependencies | P01, P05, X.2 |
  | Test Guidance | Code immutability; level ordering; descriptor enforcement; P01 publish flow |

---

### FR-G07-002 — Role-Based Competency Models, Proficiency Targets & Governance
- **Module:** G07
- **Primary Role(s):** L&D Officer (maker), L&D Manager (approve), model `owner_id` (steward)
- **User Story:** As an L&D Officer, I want versioned competency models mapped to designations/cadres/**roles**/org-units with target proficiencies, an owner, and a review cadence, so gaps are measured objectively and the framework does not silently rot.
- **Description:** Create `competency_models` + `competency_model_items` scoped by designation/**role (`role_id`)**/cadre/org-unit/generic, with effective-dating (`VAL-EFFECTIVE`), versioning, `owner_id`, `review_due_date`. Staleness alarm via **JOB-G07-MODELREVIEW**.
- **Acceptance Criteria:**
  1. A model scopes to designation, **role (`role_id`)**, cadre, org-unit, or generic; exactly one scope key matches `scope_type` (`VAL-G07-SCOPEKEY`).
  2. Each item references a PUBLISHED competency and a valid proficiency target.
  3. Publishing a new version supersedes the prior for the same scope on `effective_from` (P01 in-flight version pinning applies to any approval flow).
  4. An employee resolves to exactly one effective model (most specific scope wins).
  5. Every model has `owner_id` + `review_due_date`; a model past review-due is flagged STALE by **JOB-G07-MODELREVIEW** and notified via X.2 (`MSG-G07-MODEL-REVIEW`).
  6. Computing a FINALIZED gap against a model past `review_due_date` is allowed but warns and stamps `model_stale_flag=true`.
- **Business Rules:** Effective periods for the same scope+version cannot overlap. Scope precedence DESIGNATION > ROLE > CADRE > ORG_UNIT > GENERIC. Weights drive WEIGHTED scoring only when `ld.gap-weighted` is granted. `review_due_date` defaults to `effective_from + 12 months`.
- **Data Model References:** `competency_models` (`role_id`,`owner_id`,`review_due_date`) C/R/U/Version; `competency_model_items` C/R/U/D; `competencies`/`proficiency_levels`/`roles` R.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/competency-models`, `/api/v1/competency-models/{id}/items`, `/api/v1/competency-models/{id}:publish` |
  | GET | `/api/v1/employees/{empId}/effective-competency-model` |
  | GET | `/api/v1/competency-models/staleness-report?orgUnitId=&cursor=` |
- **UI Behavior Notes:** Model editor grid; scope selector with **role picker**; version timeline; "resolve for employee" preview; owner + review-due badge with overdue highlight.
- **Edge Cases:** Overlapping effective periods (409); no model resolves (GENERIC fallback or 404 with guidance); duplicate competency (409); ROLE scope without `role_id` (422 `VAL-G07-SCOPEKEY`); review-due in the past on publish (allowed, flagged STALE).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CompetencyModelService`, `ScopeResolver`, `ModelVersioner`, `StalenessReporter` (JOB-G07-MODELREVIEW) |
  | Backend Flow | Validate single scope key → persist DRAFT → publish creates version, closes prior `effective_to` → JOB-G07-MODELREVIEW schedules staleness alarm |
  | Authorization | P02: `ld_officer` maker; `ld_manager` approve |
  | State Changes | New PUBLISHED version supersedes prior; emits model-change event for incremental recompute (FR-004) |
  | Failure Handling | 409 overlap/duplicate; 422 invalid/missing scope key |
  | Dependencies | FR-001 masters; `roles` (G01/platform); X.1, X.2 |
  | Test Guidance | Scope precedence incl. ROLE; versioning; staleness propagation |

---

### FR-G07-003 — Employee Skill Inventory, Assessment & Freshness
- **Module:** G07
- **Primary Role(s):** Employee (self-assess), Reporting Manager (validate), L&D Officer, Kiosk Operator (assisted)
- **User Story:** As an employee, I want to declare/maintain skills with proficiency, have my manager validate them, and have stale skills flagged, so my profile stays trusted.
- **Description:** Maintain `employee_skills` (one current row per skill) with history in `skill_assessments`. Validation DECLARED→VALIDATED. `last_validated_at` + `freshness_status` track decay, recomputed by **JOB-G07-FRESHNESS**. Assisted capture for non-login staff via FR-G07-022. Employee references resolve against the **G01 `employees` master**.
- **Acceptance Criteria:**
  1. An employee (or Kiosk Operator on their behalf, attributed) can add/update a skill (status DECLARED).
  2. A manager can validate/adjust proficiency (VALIDATED, records validator + timestamp, sets `last_validated_at`).
  3. Every change appends an immutable `skill_assessments` row (P05 also captures the mutation).
  4. A skill acquired via a PUBLISHED certificate auto-populates source=CERTIFICATION with `expires_on` from cert validity.
  5. Skills past `expires_on` auto-transition to EXPIRED via **JOB-G07-FRESHNESS**.
  6. A VALIDATED non-compliance skill whose `last_validated_at` exceeds `revalidation_interval_months` is set STALE nightly and surfaced for re-validation (X.2 `MSG-G07-SKILL-STALE`).
  7. Self-assessment UI shows the proficiency-level behavioural anchor inline.
- **Business Rules:** `UNIQUE(tenant,employee,skill)`; updates overwrite the current row. Only the manager-of-record or L&D may VALIDATE (self-validation forbidden, 403 via P02). STALE does not change `status` but is discounted in gap closure (FR-004).
- **Data Model References:** `employee_skills` C/R/U; `skill_assessments` Append; `documents`(G13)/`employees`(G01)/`skills`/`proficiency_levels` R.
- **API References:**
  | Method | Path |
  |---|---|
  | GET/POST | `/api/v1/employees/{empId}/skills` |
  | PATCH | `/api/v1/employees/{empId}/skills/{skillId}` |
  | POST | `/api/v1/employees/{empId}/skills/{skillId}:validate` |
  | GET | `/api/v1/employees/{empId}/skills?freshness=STALE&cursor=` |
- **UI Behavior Notes:** Skill card grid with proficiency meter, source/validation/expiry/freshness chips; manager "validate" inline action; evidence upload (`VAL-FILE`→G13); inline behavioural-anchor helper.
- **Edge Cases:** Manager validates undeclared skill (creates VALIDATED source=MANAGER); concurrent edit (last write wins on current row, both appended); expiry on weekend handled by JOB-G07-FRESHNESS; bulk re-validation of stale skills.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SkillInventoryService`, `AssessmentLedger`, **`JOB-G07-FRESHNESS`** worker, `CertSkillSync` |
  | Backend Flow | Upsert current row → append assessment → set `last_validated_at` on validate → emit skill-change event for incremental gap recompute (FR-004) |
  | Authorization | P02: Self/Kiosk DECLARE; manager/L&D VALIDATE; row scope by org subtree |
  | State Changes | DECLARED→VALIDATED→EXPIRED/REVOKED; freshness FRESH↔STALE |
  | Failure Handling | 403 self-validate; 409 stale-version (optimistic lock) |
  | Dependencies | FR-001/002; FR-012 cert sync; FR-022 assisted; X.1 |
  | Test Guidance | History append; freshness/expiry job; cert→skill propagation; anchor display |

---

### FR-G07-004 — Incremental Skill-Gap Analysis (Model + Appraisal Reconciliation)
- **Module:** G07
- **Primary Role(s):** L&D Officer, Reporting Manager, Employee (own)
- **User Story:** As an L&D Officer, I want gaps computed incrementally against the effective model and reconciled with **G08** appraisal development gaps, so needs are evidence-based and the engine scales to 200k employees.
- **Description:** Generate `skill_gap_analyses` + `skill_gap_items` comparing model targets to **fresh, validated** skills, merging **G08** development gaps (source=APPRAISAL, via the pinned X.3 feed) and statutory mandates (source=MANDATORY). Default `scoring_mode=BINARY`; WEIGHTED only when `ld.gap-weighted`. Recompute is event-driven; full **JOB-G07-GAPRECOMPUTE** batch is a fallback. Emits the Gap Contract (FR-G07-024) for G06/G08.
- **Acceptance Criteria:**
  1. Resolves the effective model and computes `gap_size = max(0, target − current)` per competency.
  2. **G08** development gaps for the latest cycle are imported and merged (no duplicates by competency).
  3. Mandatory/compliance competencies the employee lacks appear as MANDATORY-source gaps regardless of model.
  4. Finalizing supersedes the prior FINALIZED analysis.
  5. Each gap item one-click converts to a `training_need` (1:1 source mapping).
  6. Only VALIDATED **and FRESH** skills close a gap; STALE skills discounted per configurable policy and counted in `stale_skill_count`; item flags `discounted_for_staleness`.
  7. Computing against a model past `review_due_date` stamps `model_stale_flag=true` and warns.
  8. At launch `scoring_mode=BINARY`; `overall_gap_score` null unless `ld.gap-weighted` granted.
  9. A skill-change event recomputes only the affected employee within the incremental SLA (§9), not a full batch.
- **Business Rules:** Critical gap = `is_critical` competency with `gap_size ≥ 1`. If the **G08** feed is unavailable, analysis proceeds with model+mandate sources, flags `appraisal_cycle_ref=UNAVAILABLE` (graceful degradation; X.3 circuit-break). Staleness discount policy configurable: EXCLUDE or DISCOUNT_ONE_LEVEL.
- **Data Model References:** `skill_gap_analyses`/`skill_gap_items` C/R; `competency_models`/`employee_skills`/`proficiency_levels` R; **G08 appraisal-gap feed (pinned contract §10.6, X.3)** R.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/employees/{empId}/skill-gap-analyses` |
  | GET | `/api/v1/employees/{empId}/skill-gap-analyses/latest` |
  | POST | `/api/v1/skill-gap-items/{id}:convert-to-need` |
  | GET | `/api/v1/gap-contract/v1?employeeId=&modelId=` (FR-G07-024) |
- **UI Behavior Notes:** Radar/heatmap; gap list sortable by criticality; convert-to-need buttons; source legend; stale-discount/model-stale banners; manager team-rollup.
- **Edge Cases:** No effective model (GENERIC, warns); G08 down (degraded mode, not surfaced as failure); employee above target (gap 0, surplus highlighted for marketplace FR-014); all current skills STALE → gaps reopen.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `GapEngine`, `IncrementalRecomputeWorker`, **`JOB-G07-GAPRECOMPUTE`** (fallback), `AppraisalFeedClient` (X.3), `MandateResolver`, `GapContractProjector` |
  | Backend Flow | Consume skill/model/mandate event → resolve model → diff fresh+validated skills → fetch G08 gaps (X.3) → merge/dedupe → persist snapshot → finalize supersedes → project Gap Contract |
  | Authorization | P02: L&D/manager team; employee own read |
  | State Changes | DRAFT→FINALIZED→SUPERSEDED; emits need-candidate + Gap Contract events |
  | Failure Handling | G08 timeout → degraded mode (logged, not a user failure); X.3 maps upstream failure |
  | Dependencies | FR-002/003; **G08** feed; FR-024; X.1, X.3 |
  | Test Guidance | Merge/dedupe; staleness discount; model-stale flag; incremental SLA; binary vs weighted |

---

### FR-G07-005 — Training Needs Identification & Consolidation
- **Module:** G07
- **Primary Role(s):** Reporting Manager, L&D Officer, L&D Manager (prioritise)
- **User Story:** As an L&D Officer, I want to capture, consolidate, and prioritise needs from gaps, appraisals, mandates, and manager input so the annual plan is demand-driven.
- **Description:** Manage `training_needs` from multiple sources (1:1 with gap-item sources), deduplicate, prioritise, and roll up by org-unit/competency. Capture screens are **W.2 forms**.
- **Acceptance Criteria:**
  1. Needs can be created from a gap item, appraisal gap, mandate, manager input, self request, or induction.
  2. Duplicate needs (same employee+competency, same FY) are surfaced and prevented.
  3. L&D can consolidate individual needs into a group need with a participant list.
  4. Needs carry priority and FY and flow IDENTIFIED→CONSOLIDATED→PLANNED.
  5. A gap item converts to a need with `source` mapped 1:1.
- **Business Rules:** Mandatory-source needs cannot be REJECTED, only DEFERRED with justification (`VAL-COMMENT`). Group needs reference an org_unit. Priority derived-suggested (CRITICAL from critical gap/mandate) but L&D may override with reason.
- **Data Model References:** `training_needs` C/R/U; `skill_gap_items` R; `org_units`/`competencies` R.
- **API References:** POST `/api/v1/training-needs`; GET `/api/v1/training-needs?fy=&orgUnitId=&priority=&status=&cursor=`; POST `/api/v1/training-needs:consolidate`.
- **UI Behavior Notes:** Needs inbox with source filters; consolidation wizard; priority editor; duplicate warning banner.
- **Edge Cases:** Same need from gap and mandate (merged, MANDATORY wins); consolidating across org-units (blocked, scope mismatch); deferring a critical mandatory need requires manager+L&D dual sign-off (P01).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NeedService`, `Consolidator`, `DuplicateGuard` |
  | Backend Flow | Validate source → dedupe check → persist → consolidate creates group need linking individuals |
  | Authorization | P02: Manager creates for team; L&D consolidates/prioritises |
  | State Changes | IDENTIFIED→CONSOLIDATED→PLANNED→ADDRESSED/DEFERRED/REJECTED |
  | Failure Handling | 409 duplicate; 403 reject-mandatory |
  | Dependencies | FR-004 |
  | Test Guidance | Dedupe; consolidation participant set; mandatory-defer dual sign-off; source mapping |

---

### FR-G07-006 — Annual Training Calendar, Plan & Budget Allocation
- **Module:** G07
- **Primary Role(s):** L&D Officer (build), L&D Manager (approve), Dept Head/Finance (sanction)
- **User Story:** As an L&D Manager, I want to build and approve an annual plan and calendar with budget allocation per entity/org-unit so delivery is governed and funded.
- **Description:** Compose `annual_training_plans` + `training_plan_items` from consolidated needs, allocate `training_budgets` on the **canonical (FY, entity/org_unit) key** (`VAL-G07-BUDGETKEY`), publish a quarter-bucketed calendar. **Plan submit/approve/sanction is a configured P01 multi-stage approval flow.**
- **Acceptance Criteria:**
  1. A plan pulls consolidated needs and proposes items with target audience, man-days, budget.
  2. Plan total budget reconciles to allocated `training_budgets` for the FY/entity/org-unit (category/competency reporting-only).
  3. Approval requires L&D Manager (P01); budget sanction requires Finance/Dept Head per policy (P01 stage).
  4. Once APPROVED→ACTIVE, sessions can be scheduled against plan items.
  5. A read-only annual calendar aggregates sessions by quarter and org-unit.
- **Business Rules:** `UNIQUE(tenant, financial_year, org_unit_id)` per plan. `Σ planned_budget ≤ allocated` at the canonical grain (overrun requires explicit approval flag → extra P01 stage). Closing a plan requires all items COMPLETED or DROPPED.
- **Data Model References:** `annual_training_plans`/`training_plan_items` C/R/U; `training_budgets` C/R/U; `training_needs` R/U (→PLANNED).
- **API References:** POST `/api/v1/annual-training-plans`, `/{id}/items`, `/{id}:submit`/`:approve`; GET `/api/v1/training-calendar?fy=&orgUnitId=`.
- **UI Behavior Notes:** Plan builder; budget reconciliation bar (allocated vs planned at canonical grain); quarter calendar; **P01 approval stepper**; category/competency as reporting-only chips.
- **Edge Cases:** Plan exceeds budget (block unless overrun flag + dual P01 approval); needs added after approval (amendment flow, version note); FY rollover copies recurring mandatory programs and seeds campaigns (FR-017).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PlanService`, `BudgetReconciler`, `CalendarProjector`, `P01WorkflowClient` |
  | Backend Flow | Build draft from needs → reconcile budget at canonical key → `startInstance(G07_PLAN_APPROVE)` → activate |
  | Authorization | P02: L&D build; `ld_manager` approve; Finance sanction |
  | State Changes | DRAFT→SUBMITTED→APPROVED→ACTIVE→CLOSED; commits budget |
  | Failure Handling | 409 duplicate plan; 422 budget overrun without flag |
  | Dependencies | FR-005, FR-016; P01 |
  | Test Guidance | Budget reconciliation at canonical key; P01 approval gating; calendar aggregation |

---

### FR-G07-007 — Course Catalog & Training Program Management
- **Module:** G07
- **Primary Role(s):** L&D Officer (maker), L&D Manager (publish via P01)
- **User Story:** As an L&D Officer, I want a catalog of programs (internal, external, e-learning, blended, micro-learning) with outcomes, certification rules, and cost so sessions, campaigns, and paths can be built from reusable programs.
- **Description:** CRUD `training_programs` with delivery mode, provider type, mandatory/induction flags, linked competencies, CPD credits, certification-on-completion + validity, default cost/capacity, materials, and LMS course reference. E-learning programs reference an `lms_content_packages` version and a `learning_record_stores` (X.3) connector.
- **Acceptance Criteria:**
  1. A program defines delivery mode, provider type, duration, outcome competencies.
  2. Mandatory programs must link ≥1 compliance competency.
  3. `certification_on_completion=true` requires `cert_validity_months` (NULL = lifetime only if explicit).
  4. E-learning programs require a PUBLISHED content package and a designated **X.3 LRS/LMS connector** + standard.
  5. Retiring a program is blocked if it has OPEN/RUNNING sessions or an active campaign.
- **Business Rules:** `code` `VAL-MASTER-UNIQUE`, immutable once PUBLISHED. CPD ≥ 0; default cost ≥ 0. Linked competencies must be PUBLISHED.
- **Data Model References:** `training_programs` C/R/U/Retire; `lms_content_packages` R; `competencies`/`documents`(G13) R.
- **API References:** POST `/api/v1/training-programs`; GET `/api/v1/training-programs?mode=&provider=&mandatory=&q=&cursor=`; PATCH `/api/v1/training-programs/{id}` (`:publish`,`:retire`).
- **UI Behavior Notes:** Catalog grid/cards; program editor with outcome competency picker, materials upload (G13), content-package + X.3 connector picker; mandatory/induction toggles.
- **Edge Cases:** E-learning without content package (422); retire with active sessions/campaign (409); duplicate code (409).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ProgramService`, `ContentLinkValidator`, `P01WorkflowClient` |
  | Backend Flow | Validate (incl. content package + connector) → DRAFT → publish via P01 → catalog index update |
  | Authorization | P02: `ld_officer` maker; `ld_manager` publish |
  | State Changes | DRAFT→PUBLISHED→RETIRED; feeds paths, sessions, campaigns |
  | Failure Handling | 409 in-use retire; 422 missing dependent fields |
  | Dependencies | FR-001; FR-021 content; FR-015 X.3 connector |
  | Test Guidance | Mandatory rule; content-package requirement; retire guard |

---

### FR-G07-008 — Session/Batch Scheduling, Trainer & Venue Management
- **Module:** G07
- **Primary Role(s):** L&D Officer, Trainer (view)
- **User Story:** As an L&D Officer, I want to schedule sessions/batches and manage trainers/venues with capacity so delivery is logistically sound and conflict-free.
- **Description:** CRUD `training_sessions`, `trainers`, `venues` with conflict detection. External trainers link to an EMPANELLED `vendor_empanelments` record (FR-G07-019, `VAL-G07-EMPANEL`).
- **Acceptance Criteria:**
  1. A session links a PUBLISHED program; sets capacity, dates, mode, nomination deadline.
  2. Prevents scheduling a trainer/venue with an overlapping confirmed session.
  3. `end_date ≥ start_date`, `nomination_deadline ≤ start_date` (`VAL-DATE`).
  4. Online sessions require a meeting URL; classroom require a venue with sufficient capacity.
  5. Cancelling cascades **X.2 notifications** and frees nominations to WITHDRAWN/re-nominate.
  6. Assigning an external trainer requires a valid EMPANELLED vendor for the session dates.
- **Business Rules:** `batch_code` unique. Venue capacity ≥ session capacity for PHYSICAL. Trainer expertise mismatch is a warning surfaced for L&D judgement, never auto-blocking.
- **Data Model References:** `training_sessions` C/R/U/Cancel; `trainers`/`venues` C/R/U; `vendor_empanelments` R; `training_programs` R.
- **API References:** POST `/api/v1/training-sessions`; GET `/api/v1/training-sessions?programId=&status=&from=&to=&cursor=`; POST `/api/v1/training-sessions/{id}:cancel`; POST `/api/v1/trainers`,`/api/v1/venues`.
- **UI Behavior Notes:** Scheduling calendar with drag-to-create; conflict warnings; capacity meter; trainer/venue pickers with availability + empanelment status; cancel dialog requiring reason (`VAL-COMMENT`).
- **Edge Cases:** Double-booking (409 `ERR-G07-SCHEDULE`); over-capacity venue (422); cancel a RUNNING session (allowed with reason, attendance preserved); external trainer not empanelled/expired (409 `ERR-G07-EMPANEL`).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SessionService`, `ConflictDetector`, `ResourceCalendar`, `EmpanelmentValidator` |
  | Backend Flow | Validate dates+resources+empanelment → conflict check → persist → emit calendar event |
  | Authorization | P02: L&D Officer; Trainer read-own |
  | State Changes | DRAFT→OPEN→FULL→RUNNING→COMPLETED/CANCELLED; X.2 on cancel |
  | Failure Handling | 409 conflict/empanelment; 422 capacity/date |
  | Dependencies | FR-007, FR-019; X.2 |
  | Test Guidance | Conflict matrix; capacity rules; cancel cascade; empanelment gate |

---

### FR-G07-009 — Nomination & Multi-Level Approval Workflow (on P01)
- **Module:** G07
- **Primary Role(s):** Employee (self), Reporting Manager (L1), L&D Manager (L2), L&D Officer
- **User Story:** As a manager, I want to nominate employees (or approve self-nominations) through a **P01 maker-checker workflow** with budget checks and auditable capacity/waitlist handling so enrolment is controlled, funded, and fair.
- **Description:** Create `training_nominations` linked to a session and (ideally) a `training_need`, routed through the **P01 WorkflowEngine** (`startInstance` → L1/L2 `approve`), with budget commitment, capacity enforcement, and **persisted FIFO `waitlist_position` with P05-audited promotion**. Campaign-created nominations carry `training_campaign_id`/`nomination_type=CAMPAIGN`. The nomination form is a **W.2 form**.
- **Acceptance Criteria:**
  1. An employee can self-nominate; a manager can nominate reports; L&D/HR can nominate anyone in scope.
  2. **P01 routes** PENDING_L1→PENDING_L2→APPROVED; mandatory/induction/campaign may auto-approve per the configured flow (CONDITIONAL pattern, Appendix D).
  3. On APPROVED, capacity is decremented (atomic transaction); if full, nomination becomes WAITLISTED with persisted `waitlist_position`.
  4. Approval commits estimated cost to the canonical budget (FR-016); insufficient budget blocks approval unless overrun-approved.
  5. Withdrawal before deadline frees a seat and promotes the next waitlisted nomination by FIFO.
  6. Every waitlist promotion is captured by the **P05 trigger** (who/when/from-position); `waitlist_position` recomputed and persisted.
- **Business Rules:** `nominated_by ≠ approver` at each level (SoD via P01/P02). `UNIQUE(session, employee)`. Mandatory/campaign nominations cannot be self-withdrawn; only L&D with reason → `ERR-G07-MANDATORY`. Waitlist promotion FIFO by `waitlist_position`. Idempotency: nomination/approve POSTs carry `Idempotency-Key`; a repeat returns the original (P01 `startInstance` is idempotent → 409 `ERR-DUP-INSTANCE` on duplicate start).
- **Data Model References:** `training_nominations` (`waitlist_position`,`training_campaign_id`,`workflow_instance_id`) C/R/U; `training_sessions` R/U (counts); **`workflow_instances`/`workflow_actions` (P01)** C/U; `training_budgets` R/U (commit).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sessions/{id}/nominations` (Idempotency-Key) |
  | POST | `/api/v1/nominations/{id}:approve` / `:reject` / `:withdraw` (→ P01 advance) |
  | GET | `/api/v1/nominations?employeeId=&status=&sessionId=&cursor=` |
  | GET | `/api/v1/training-sessions/{id}/waitlist` (ordered by position) |
- **UI Behavior Notes:** Nominate dialog with need linkage and cost preview; approver task inbox surfaced via the **P01 Tasks aggregation** in the correct workspace; capacity/waitlist indicator; budget-impact banner; SoD prevents self-approve (button hidden per P02).
- **Edge Cases:** Approve when full (auto-waitlist, position assigned); budget exhausted (409 `ERR-G07-BUDGET`); employee on leave/transferred mid-flow (flag, allow L&D decision); duplicate nomination (409 `CONFLICT`); concurrent withdrawals (atomic position recompute).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NominationService`, **`P01WorkflowClient`**, `CapacityManager`, `WaitlistManager`, `BudgetCommitter` |
  | Backend Flow | Create → `startInstance(G07_NOMINATION)` L1→L2 → on approve: capacity check (txn) → commit budget → APPROVED or WAITLISTED(position=max+1); on withdraw → promote head, compact positions (P05 trigger audits) |
  | Authorization | P02: Self/manager/L&D create; manager L1; `ld_manager` L2 |
  | State Changes | DRAFT→PENDING_L1→PENDING_L2→APPROVED/WAITLISTED/REJECTED→WITHDRAWN/COMPLETED/NO_SHOW |
  | Failure Handling | 409 budget/duplicate/capacity race (optimistic lock retry); rollback on partial |
  | Dependencies | FR-008, FR-016, FR-017; **P01**; X.2 |
  | Test Guidance | SoD; capacity race; waitlist FIFO + P05 audit; budget commit/rollback; P01 idempotency |

---

### FR-G07-010 — Attendance Capture (incl. Proxy/Kiosk/Offline)
- **Module:** G07
- **Primary Role(s):** Trainer, L&D Officer, Kiosk Operator
- **User Story:** As a trainer, I want to mark per-day attendance — including for non-login field staff via kiosk/offline capture — so completion and certification are accurate for the whole workforce.
- **Description:** Capture `training_attendance` per nomination per session-day with de-polymorphised `marked_by_actor_type`/`actor_id` and a `capture_mode`. Offline captures buffer on-device and sync via a batch (FR-G07-022).
- **Acceptance Criteria:**
  1. Trainer/L&D/Kiosk Operator can mark attendance for each APPROVED nomination per session day.
  2. One record per nomination per day (`UNIQUE`).
  3. Attendance below the program's minimum threshold marks the nomination ineligible for certification.
  4. A fully-absent nomination is auto-marked NO_SHOW at session completion (JOB-G07 close logic).
  5. For e-learning, attendance derives from LMS/LRS progress (FR-G07-015, `capture_mode=LMS_DERIVED`).
  6. Offline-captured attendance carries `offline_captured_at` + `offline_sync_batch_id`; on sync, server-side dedupe/reconcile applies; conflicts surfaced for L&D.
  7. Every record records the operator via `actor_type`/`actor_id` (no polymorphic ambiguity).
- **Business Rules:** Attendance markable only for RUNNING/COMPLETED sessions. Minimum % (default 80) configurable per program. EXCUSED excluded from denominator. Kiosk/assisted captures require an authenticated Kiosk Operator principal, fully attributed in **P05**.
- **Data Model References:** `training_attendance` (`marked_by_actor_*`,`capture_mode`,offline) C/R/U; `training_nominations` R/U; `documents`(G13) R.
- **API References:** POST `/api/v1/sessions/{id}/attendance` (bulk per day); GET `/api/v1/sessions/{id}/attendance?date=`; PATCH `/api/v1/attendance/{id}`; POST `/api/v1/sessions/{id}/attendance:offline-sync` (Idempotency-Key).
- **UI Behavior Notes:** Roster grid with day columns; bulk "mark all present"; signed-sheet upload (G13); attendance-% summary; **kiosk mode UI and functional offline state with pending-sync count** (Foundation §3 offline state); locked once COMPLETED (correction via L&D with audit).
- **Edge Cases:** Marking for non-approved nomination (403); duplicate day mark (409 upsert); session spanning weekends/holidays (only configured training days counted); offline batch with stale device clock (server reconciles, flags skew).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceService`, `CompletionEvaluator`, `OfflineSyncReconciler` |
  | Backend Flow | Validate session state → upsert per-day records (actor_type) → on offline-sync dedupe by (nomination,date) → recompute attendance% → set completion eligibility |
  | Authorization | P02: Trainer own session; L&D any; Kiosk Operator attributed; row scope |
  | State Changes | Drives nomination COMPLETED/NO_SHOW; cert eligibility flag |
  | Failure Handling | 403 non-roster; 409 duplicate; 422 wrong state; offline conflict queue |
  | Dependencies | FR-009; FR-015; FR-022 |
  | Test Guidance | Threshold math; EXCUSED; NO_SHOW; offline dedupe + clock skew; actor attribution |

---

### FR-G07-011 — Assessment (Pre/Post) & Kirkpatrick Evaluation
- **Module:** G07
- **Primary Role(s):** Trainer, L&D Officer, Employee (feedback)
- **User Story:** As a trainer, I want to record pre/post scores and collect Kirkpatrick feedback at the right level so learning effectiveness and impact are measurable without features that ship empty.
- **Description:** Append-only `training_assessments` (PRE/POST/REASSESSMENT, de-polymorphised assessor) and `training_feedback`. L1/L2 per-participant; **L3 (behaviour) and L4 (results) are optional, sampled, programme-level**; L4 links named **G14** business-KPI keys. Feedback forms are **W.2 forms**.
- **Acceptance Criteria:**
  1. Pre/post assessments recorded per nomination; POST result drives completion PASS/FAIL.
  2. Learning gain = POST − PRE computed and reportable.
  3. Participants submit L1/L2 feedback (anonymous-capable; PII stripped).
  4. Trainer `avg_feedback_rating` derived from L1 ratings (**JOB-G07-TRAINERRATE**).
  5. A nomination with POST=FAIL is ineligible for certification (re-assessment allowed).
  6. L3/L4 captured at programme level on a sample; UI never blocks completion on missing L3/L4.
  7. L4 `responses_json` references named **G14** business-KPI keys for cost-per-outcome.
  8. Assessment content (item banks, SCORM quizzes) meets WCAG 2.1 AA (FR-G07-021, `VAL-G07-WCAG`).
- **Business Rules:** `0 ≤ obtained ≤ max`; `result=PASS` iff `obtained ≥ pass_threshold`. Feedback ledger append-only and anonymisable. L4 can be session/org-level (nomination NULL).
- **Data Model References:** `training_assessments` (`assessed_by_actor_*`) Append; `training_feedback` Append; `assessment_items` R; `training_nominations` R/U; `trainers` U (rating).
- **API References:** POST `/api/v1/nominations/{id}/assessments`, `/api/v1/sessions/{id}/feedback`; GET `/api/v1/sessions/{id}/evaluation-summary`, `/api/v1/programs/{id}/l3l4-summary`.
- **UI Behavior Notes:** Score entry grid (auto pass/fail); learning-gain chart; feedback form (Likert + free text) with anonymity toggle; trainer scorecard; Kirkpatrick dashboard labelling L3/L4 optional/sampled with KPI linkage.
- **Edge Cases:** Post without pre (gain not computable, flagged); anonymous feedback (PII stripped per P02 PII ceiling); re-assessment after fail (new append row); L3/L4 absent (shown "not sampled", not an error).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AssessmentLedger`, `FeedbackService`, `KirkpatrickAggregator`, **`JOB-G07-TRAINERRATE`** |
  | Backend Flow | Append assessment (actor_type) → compute result → update completion → feedback append → nightly trainer rating; L3/L4 sampled aggregation programme-level |
  | Authorization | P02: Trainer/L&D scores; participant feedback own; anonymity protected (PII ceiling) |
  | State Changes | POST→completion PASS/FAIL; drives certification eligibility |
  | Failure Handling | 422 score bounds; append-only ledgers |
  | Dependencies | FR-010, FR-012, FR-021; **G14** KPI registry; X.1 |
  | Test Guidance | Pass/fail; learning gain; anonymity; trainer rating; L3/L4 optional/sampled; KPI linkage |

---

### FR-G07-012 — Certification, Enforced Validity & Renewal; Mandatory Compliance
- **Module:** G07
- **Primary Role(s):** L&D Officer (issue), L&D Manager (approve revoke via P01)
- **User Story:** As an L&D Officer, I want to issue certificates with validity **enforced** — not merely notified — with automatic renewal so statutory obligations are continuously met and lapses are actionable.
- **Description:** Issue `certifications` on completion, generate certificate numbers and PDFs (**G13**), track `valid_until` and renewal, auto-expire via **JOB-G07-CERTEXPIRY**, support revocation (**P01 flow**), and produce a mandatory-compliance currency view. On mandatory-cert expiry the system auto-creates a renewal need + campaign re-nomination and sets `lapsed_mandatory=true` (consumed by **G06**).
- **Acceptance Criteria:**
  1. A certificate issues only when the nomination is COMPLETED with attendance threshold met and POST=PASS (where applicable).
  2. `certificate_no` is unique and immutable; PDF generated and stored via **G13**.
  3. Certificates past `valid_until` auto-transition to EXPIRED via **JOB-G07-CERTEXPIRY** and notify (X.2 `MSG-G07-CERT-EXPIRY`).
  4. Renewal reminders fire at configurable lead times (60/30/7 days) via X.2.
  5. A mandatory-compliance dashboard shows required vs held vs lapsed certs.
  6. On EXPIRED of a mandatory cert, the system auto-creates a renewal `training_need` (`renewal_need_id`) and enrolls into the relevant rolling campaign (FR-G07-017).
  7. `lapsed_mandatory=true` set on expiry and exposed via API for **G06** to block sensitive duty/posting.
  8. Lapse cleared only when a fresh valid mandatory cert is issued (SUPERSEDED chain).
- **Business Rules:** Revocation runs a **P01 flow** (L&D Manager approval + reason); sets REVOKED and, if posted, flags a G12 SR correction. Issuing a renewable cert updates linked `employee_skill.expires_on`/`last_validated_at`. Significant/mandatory certs trigger **G12 SR posting** (FR-G07-016) with `sr_posting_status=PENDING`.
- **Data Model References:** `certifications` (`lapsed_mandatory`,`renewal_need_id`,`service_register_event_id`) C/R/U; `documents`(G13) C (PDF); `employee_skills` U; `training_needs` C; **`service_register_events`(G12)** via FR-016.
- **API References:** POST `/api/v1/nominations/{id}:issue-certificate`; GET `/api/v1/employees/{empId}/certifications`; POST `/api/v1/certifications/{id}:revoke` (→P01); GET `/api/v1/compliance/mandatory-status?orgUnitId=`, `/api/v1/employees/{empId}/lapsed-mandatory` (G06 consumer).
- **UI Behavior Notes:** Certificate issue action with eligibility check; viewer/download; expiry timeline; renewal banners; compliance heatmap; lapsed-mandatory badge and auto-renewal status.
- **Edge Cases:** Issue when ineligible (409 `ERR-G07-CERT-INELIGIBLE`); duplicate issue (409); revoke a posted cert (P01 + G12 SR correction); lifetime cert (`valid_until` NULL); expiry with no active renewal program/campaign (escalates to L&D).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CertificationService`, `CertPdfGenerator` (G13), **`JOB-G07-CERTEXPIRY`**, `RenewalOrchestrator`, `ComplianceTracker` |
  | Backend Flow | Verify eligibility → generate no+PDF (G13) → persist → update skill expiry → enqueue G12 SR posting (X.3) → schedule reminders (X.2); on expiry (JOB): set lapsed_mandatory, create renewal need, enroll campaign |
  | Authorization | P02: L&D issue; `ld_manager` revoke; employee read-own; G06 read lapsed flag |
  | State Changes | ACTIVE→EXPIRED/REVOKED/SUPERSEDED; X.2 notifications; G12 posting; auto re-nomination |
  | Failure Handling | 409 ineligible/duplicate; SR failure → FAILED + X.3 retry |
  | Dependencies | FR-010/011, FR-016, FR-017, **G13**, **G06** (consumer); X.1/X.2/X.3 |
  | Test Guidance | Eligibility gate; expiry job; lapsed flag + auto-renewal; reminder schedule; compliance rollup |

---

### FR-G07-013 — Induction / Onboarding Training Program
- **Module:** G07
- **Primary Role(s):** L&D Officer, HR Officer, Reporting Manager
- **User Story:** As an L&D Officer, I want new entrants auto-enrolled into a structured induction program with tracked completion so onboarding is consistent and compliant.
- **Description:** On a new-joiner event from **G01** (**pinned joiner contract §10.6**, consumed via the platform service/X.3 pattern), auto-create induction needs and nominations into the configured induction program/path, track completion within an onboarding window, and escalate non-completion via **JOB-G07-INDUCTION** + X.2.
- **Acceptance Criteria:**
  1. A new-joiner event (G01 `date_of_joining`) triggers auto-nomination into the active induction program(s).
  2. Completion tracked against an onboarding window (30/60/90 days).
  3. Non-completion escalates to manager and L&D (X.2 `MSG-G07-INDUCTION-OVERDUE`).
  4. Induction modules can be classroom, e-learning, or blended and reuse FR-G07-007 programs.
  5. Induction completion contributes to mandatory-compliance status (FR-G07-012).
  6. The joiner event conforms to the pinned G01 contract; missing/late events are reconciled idempotently (Idempotency-Key on the event).
- **Business Rules:** Induction nominations are type=INDUCTION, may auto-approve per the P01 flow. Program/path configurable per cadre/designation. Missing induction is a surfaced compliance exception.
- **Data Model References:** `training_needs`(source=INDUCTION) C; `training_nominations`(type=INDUCTION) C; `learning_paths` R; **G01 joiner event (pinned)** R.
- **API References:** POST `/api/v1/induction:enroll` (event-driven + manual); GET `/api/v1/induction/status?orgUnitId=&cursor=`.
- **UI Behavior Notes:** Onboarding tracker per joiner with module checklist; manager team view; overdue flags; configurable induction template editor.
- **Edge Cases:** Late joiner sync (back-dated window); transfer during induction (follows employee); re-induction on re-employment.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `InductionService`, `JoinerEventListener` (G01 pinned contract), `OnboardingTracker`, **`JOB-G07-INDUCTION`** |
  | Backend Flow | Consume joiner event (idempotent) → resolve template by cadre → auto-create needs+nominations (P01) → track window → escalate (X.2) |
  | Authorization | P02: L&D/HR; manager read team |
  | State Changes | Auto-enrol; completion feeds compliance; escalations |
  | Failure Handling | Idempotent on duplicate joiner events; retry on G01 lag (X.3) |
  | Dependencies | FR-007/009/012/014; **G01** (pinned contract); X.1/X.2 |
  | Test Guidance | Event idempotency; window escalation; transfer continuity |

---

### FR-G07-014 — Learning Paths, Recommendations, CPD & Skills Marketplace (Phase 2)
- **Module:** G07
- **Primary Role(s):** L&D Officer (curate), Employee (consume), Reporting Manager
- **User Story:** As an employee, I want learning paths, skill-based recommendations, CPD tracking, and a skills marketplace so I can grow toward my role and aspirations.
- **Description:** Curate `learning_paths` + items; generate gap-driven recommendations; track `cpd_records`; expose a skills marketplace. The **recommendation engine and marketplace are gated by capability flags `ld.recommendations`/`ld.marketplace` (RBAC §4.3)**; CPD tracking ships at launch; CPD targets and curated paths phased per §2.5.
- **Acceptance Criteria:**
  1. L&D can curate published paths; the recommendation engine (when `ld.recommendations` granted) generates suggested paths from gaps.
  2. An employee sees ranked recommendations mapped to critical gaps (when flag granted).
  3. Completing a program awards CPD credits, appended to `cpd_records`.
  4. CPD totals aggregated per credit year; CPD **targets** only when `ld.cpd-targets` granted.
  5. The skills marketplace (when `ld.marketplace` granted) lists surplus-proficiency employees as mentors/SMEs, **opt-in only** (`VAL-CONSENT`).
  6. With developmental flags OFF, screens show curated paths + CPD tracking and mark recommendation/marketplace "coming in Phase 2", never broken/empty controls.
- **Business Rules:** Recommendations prioritise CRITICAL > HIGH gaps and mandates. CPD append-only, credits ≥ 0. Marketplace opt-in (`consent_records`) and DPDP-respecting; opt-out hides the employee (FR-G07-023 erases presence on exit).
- **Data Model References:** `learning_paths`/`learning_path_items` C/R/U; `cpd_records` Append; `skill_gap_items`/`employee_skills` R; `consent_records`(platform) R.
- **API References:** GET `/api/v1/employees/{empId}/recommendations` (flagged); POST `/api/v1/learning-paths`; GET `/api/v1/employees/{empId}/cpd?year=`; GET `/api/v1/marketplace/skills?skillId=` (flagged).
- **UI Behavior Notes:** Path explorer with progress rings; recommendation cards (flagged); CPD dashboard; marketplace directory with opt-in toggle (flagged); Phase-2 capabilities badged when off.
- **Edge Cases:** No gaps (growth/aspiration paths); CPD double-count guarded by `source_ref`; marketplace opt-out hides employee.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LearningPathService`, `RecommendationEngine` (flagged), `CpdLedger`, `MarketplaceService` (flagged) |
  | Backend Flow | Resolve gaps → rank programs → render recommendations (if flag); on completion append CPD; marketplace queries surplus skills (if flag) |
  | Authorization | P02: L&D curate; employee own; manager team; capability flags resolved per request |
  | State Changes | CPD accrual; recommendation cache; marketplace visibility |
  | Failure Handling | Graceful empty/Phase-2 states; consent enforcement |
  | Dependencies | FR-004/007/011; RBAC §4.3 capability flags |
  | Test Guidance | Ranking; CPD dedupe; consent/visibility; flag on/off rendering |

---

### FR-G07-015 — LMS/LRS Integration (SCORM Poll / xAPI LRS) on the X.3 Framework
- **Module:** G07
- **Primary Role(s):** SysAdmin (config), L&D Officer, Employee (learner)
- **User Story:** As an L&D Officer, I want e-learning enrolments to sync progress/completion from the LMS via a technically correct mechanism (xAPI LRS or SCORM reporting-API poll) **running on the platform X.3 integration framework** so online learning is tracked without manual entry and without a non-existent SCORM webhook.
- **Description:** Integration runs on **X.3** (call/credential/retry pattern, circuit-breaking, outbound idempotency, payload versioning, per-integration error mapping); credentials come from **P04 `integration_credentials`** (referenced by `learning_record_stores.integration_credential_ref`, never stored in the G07 table). SCORM has no server-to-server push:
  - **xAPI:** content emits statements to an **LRS** (`connector_type=LRS_XAPI`); G07 ingests via X.3 (idempotent by `lms_statement_id`).
  - **SCORM:** **JOB-G07-LMSSYNC** polls the LMS reporting API (`LMS_REPORTING_API`, `SCORM_POLL`) on `poll_interval_minutes`, advancing `last_poll_cursor`. **No webhook push.**
  - **Self-hosted SCORM:** an in-platform content player consumes the client-side run-time and writes progress server-side.
  - **Single-vs-multi-LMS:** exactly one `is_primary` connector is the system of record (`VAL-G07-PRIMARYLRS`).
- **Acceptance Criteria:**
  1. Approving a nomination for an e-learning program provisions an `lms_enrollment` bound to a `learning_record_stores` (X.3) connector and (if self-hosted) a content-package version.
  2. Learners launch via SSO deep-link; no separate LMS login.
  3. For xAPI, completion/progress is ingested from the LRS via X.3; for SCORM, via **JOB-G07-LMSSYNC** poll — not a push webhook.
  4. xAPI statements idempotent (repeated `lms_statement_id` ignored; X.3 outbound/inbound idempotency); SCORM polls idempotent by cursor + enrolment.
  5. Completion auto-derives attendance (`LMS_DERIVED`) and triggers certification eligibility.
  6. Persistent sync failure flags the enrolment for manual reconciliation; the **X.3 circuit-breaker** trips and connector health (sync lag, last cursor) is exposed.
- **Business Rules:** Supported standards SCORM 1.2/2004, xAPI; NONE for non-tracked. `progress_pct ∈ [0,100]`; COMPLETED requires progress ≥ criterion. **No integration path assumes a SCORM server push.** Secrets only via P04; never logged.
- **Data Model References:** `lms_enrollments` C/R/U; `learning_record_stores` R (connector); `lms_content_packages` R; `training_nominations` R/U; `training_attendance` C (derived); **`integration_credentials`(P04)** R via X.3.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/lms/enrollments` (auto on approval) |
  | GET | `/api/v1/lms/enrollments/{id}/launch` (SSO deep-link) |
  | POST | `/api/v1/lms/xapi/ingest` (X.3 inbound, idempotent by statementId) |
  | POST | `/api/v1/lms/scorm/poll` (internal JOB-G07-LMSSYNC trigger) |
  | GET | `/api/v1/lms/connectors/health` (X.3 circuit-breaker + lag/cursor) |
- **UI Behavior Notes:** "Launch course" button; progress bar synced; completion badge; connector health panel (sync mode, lag, cursor, **circuit-breaker state**); reconciliation queue; admin connector config panel (endpoint, **credential ref → P04**, standard, primary toggle).
- **Edge Cases:** Duplicate xAPI statement (ignored); LMS down (X.3 circuit-break, poll retried/queued); partial progress then withdrawal (enrolment cancelled, progress retained for audit); clock skew; misconfigured "webhook" expectation rejected by design.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LmsConnectorService` (on X.3), `LrsXapiIngestor`, **`JOB-G07-LMSSYNC`** (`ScormPollWorker`), `SelfHostedScormPlayer` (optional), `SsoLauncher` |
  | Backend Flow | On approval provision enrolment bound to X.3 connector → SSO launch → ingest (xAPI via X.3, idempotent) OR poll LMS reporting API (advance cursor) → update progress → derive attendance/completion |
  | Validation | Standard enum; progress bounds; idempotency (statement id / cursor); single primary connector |
  | Authorization | P02: SysAdmin config; learner launch-own; ingest via X.3 signed service auth + P04 creds |
  | State Changes | NOT_STARTED→IN_PROGRESS→COMPLETED/FAILED; feeds FR-010/012 |
  | Failure Handling | X.3 retry+backoff + circuit-break; reconciliation queue; health metrics; upstream failure → 500/`ERR-LOADFAIL` (no 503 in standard table) |
  | Dependencies | FR-007/009/010/012/021; **X.3**, **P04**, SSO; LRS/LMS |
  | Test Guidance | xAPI idempotency; SCORM poll cursor idempotency; completion derivation; primary-connector invariant; circuit-breaker; no-webhook design |

---

### FR-G07-016 — Service Register Posting (G12, `is_significant` Rule Set) & Budget/Cost Tracking
- **Module:** G07
- **Primary Role(s):** L&D Officer/Manager, Finance/Budget Controller, SR Custodian (G12, receive)
- **User Story:** As an L&D Manager, I want significant trainings/qualifications posted to the **G12 Service Register ledger** using a pinned, auditable significance rule and full budget/cost tracking on a single canonical key so statutory records are complete and spend reconciles.
- **Description:** Post significant completions/certifications as append-only events to the **G12 SR ledger (which runs on the P05 substrate)** via the **X.3 outbound pattern** (idempotent, circuit-broken, payload-versioned, **pinned event contract §10.6**), and maintain `training_budgets`/`training_costs` (planned→committed→actual) on the **canonical (FY, entity/org_unit) key** (`VAL-G07-BUDGETKEY`), reimbursement/bond-recovery payable feed to **G10**, cost-per-completion, and variance reporting. Significance resolved by an explicit `is_significant` rule set (`VAL-G07-SIGNIF`).
- **Acceptance Criteria:**
  1. The `is_significant` rule set determines posting: significant if any of (a) mandatory certification, (b) externally accredited/professional credential (FR-G07-018), (c) program duration ≥ threshold, (d) promotion-relevant flag (G06), (e) sponsored degree/deputation (FR-G07-020). Resolved decision + matched rule(s) stored and auditable (P05).
  2. Significant items post to **G12** as append-only SR events conforming to the pinned contract (idempotent by source ref).
  3. Posting state tracked (NOT_REQUIRED/PENDING/POSTED/FAILED) with automatic **X.3 retry** on FAILED.
  4. Approved nominations commit cost to the relevant budget at the canonical key.
  5. Actual costs reduce remaining budget and reconcile to invoices (G13).
  6. Reimbursement/bond-recovery costs flagged `payable_to_payroll` emit an approved-payable feed to **G10**.
  7. Budget variance reportable per entity/org-unit/FY; category/competency reporting-only.
  8. `cost_per_completion` computed (actual ÷ completions) for ROI analytics (G14, FR-G07-011 L4).
- **Business Rules:** SR events append-only; corrections post a new corrective event (the G12 ledger itself is immutable on the P05 substrate). `committed + actual ≤ allocated` at the canonical key unless overrun allowed (FROZEN blocks new commitment). Cost approver ≠ creator (SoD via P02); payable feed only for APPROVED costs.
- **Data Model References:** **`service_register_events`(G12)** Append (via X.3); `certifications` U (`sr_posting_status`); `training_budgets` C/R/U; `training_costs` (`vendor_empanelment_id`,`training_sponsorship_id`) C/R/U.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/certifications/{id}:post-to-sr` (also auto; Idempotency-Key) |
  | POST | `/api/v1/training-budgets`, `/api/v1/training-costs` |
  | GET | `/api/v1/training-budgets/variance?fy=&orgUnitId=` |
  | GET | `/api/v1/analytics/cost-per-completion?programId=&fy=` |
  | GET | `/api/v1/significance/evaluate?nominationId=` (rule trace) |
- **UI Behavior Notes:** SR posting status chips with retry; budget dashboard (allocated/committed/actual at canonical key, variance %, cost-per-completion); significance rule-trace tooltip; cost entry with invoice upload (G13); payable-to-payroll toggle; reconciliation view.
- **Edge Cases:** SR posting timeout (PENDING→X.3 retry→FAILED with alert `MSG-G07-SR-FAILED`); double-post prevented by idempotency key; budget overrun (409 `ERR-G07-BUDGET` unless override); FROZEN blocks commitment; banker's rounding INR; significance rule conflict (most-inclusive wins, logged).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SignificanceResolver`, `SrPostingService` (on X.3 → G12), `BudgetService`, `CostService`, `PayrollPayableEmitter` (→G10), X.3 retry/circuit-breaker |
  | Backend Flow | On completion → resolve `is_significant` (rule trace, P05-audited) → build G12 SR event (pinned contract, idempotency key=cert/nomination id) → X.3 POST to G12 → POSTED/FAILED; budget commit on approval (canonical key); actual reconcile; payable feed; compute cost-per-completion |
  | Validation | `VAL-G07-SIGNIF`; idempotency; append-only; `VAL-G07-BUDGETKEY`; SoD |
  | Authorization | P02: L&D/Mgr post; Finance budget/cost; SR Custodian receive (G12) |
  | State Changes | `sr_posting_status` transitions; budget commit/actual; G10 payroll feed |
  | Failure Handling | X.3 retry+backoff; FAILED alert; 409 overrun/duplicate; transaction on cost+budget |
  | Dependencies | FR-009/012/018/020; **G12** (pinned contract, X.3), **G10**; G13 |
  | Test Guidance | Significance rule matrix; idempotent posting; X.3 retry; canonical-key invariant; SoD; cost-per-completion |

---

### FR-G07-017 — Mandatory-Compliance Campaign Engine *(Risk #2 Critical)*
- **Module:** G07
- **Primary Role(s):** L&D Officer (run), L&D Manager (approve), Dept Head (sanction scope)
- **User Story:** As an L&D Officer, I want to launch a mandatory-training campaign that bulk-nominates an entire scope, auto-waves participants into capacity-bounded sessions, drives rolling annual renewal, and escalates non-completion so ~200k annual mandatory completions are achievable.
- **Description:** Create `training_campaigns` (approved via **P01**) and resolve `campaign_targets` honouring the coverage denominator rule (`VAL-G07-COVERAGE`). Bulk-create nominations (`nomination_type=CAMPAIGN`) and auto-wave into sessions; run rolling-renewal and escalation via **JOB-G07-CAMPAIGN** on X.1 (notifications via X.2). Reaches non-login staff via FR-G07-022.
- **Acceptance Criteria:**
  1. A campaign resolves its target population from scope + denominator rule, marking ineligible targets EXEMPT with reason.
  2. `:enroll-batch` bulk-creates nominations for all eligible targets idempotently (Idempotency-Key; re-running does not duplicate; runs as a resumable X.1 job).
  3. `auto_wave=true` assigns targets to waves and capacity-bounded sessions, creating sessions when capacity is exceeded.
  4. A rolling-renewal scheduler (JOB-G07-CAMPAIGN) re-targets employees `renewal_cadence_months` before cert expiry (ties FR-G07-012).
  5. Escalation fires per `escalation_policy_json` to employee→manager→L&D via X.2; `escalation_level` increments.
  6. A campaign dashboard shows coverage % (vs eligible denominator), per-wave progress, overdue list, exemptions.
  7. Completion of a target updates `target_status` and feeds mandatory-compliance status (FR-G07-012).
- **Business Rules:** Bulk nomination respects per-session capacity and budget (FR-009/016); over-capacity spills to new waves, never breaks the capacity invariant. Campaign nominations cannot be self-withdrawn (`ERR-G07-MANDATORY`). Coverage % always uses the eligible denominator; exemptions explicit and audited. A campaign cannot RUN without an approved scope (P01) and a published mandatory program.
- **Data Model References:** `training_campaigns` C/R/U; `campaign_targets` C/R/U; `training_nominations`(CAMPAIGN) C; `training_sessions` C/R/U; `employees`/`org_units`(G01) R.
- **API References:** POST `/api/v1/training-campaigns`, `/{id}:approve` (P01), `/{id}:enroll-batch` (Idempotency-Key), `/{id}:auto-wave`; GET `/{id}/coverage?orgUnitId=`, `/{id}/overdue?cursor=`.
- **UI Behavior Notes:** Campaign wizard (program, scope, window, renewal cadence, denominator rule, wave size, escalation); coverage dashboard (eligible/exempt/overdue); wave board; bulk-action confirmations with impact preview (target count, sessions to create, budget impact).
- **Edge Cases:** Scope changes mid-campaign (re-resolve, additive only, audited); employee transfers (target follows employee/org per policy); insufficient capacity org-wide (auto-create sessions or surface a scheduling gap); re-running enroll-batch (idempotent); employees on long leave (EXEMPT per denominator).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CampaignService`, `TargetResolver`, `BatchEnroller`, `AutoWaveScheduler`, **`JOB-G07-CAMPAIGN`** (rolling renewal + escalation), `P01WorkflowClient` |
  | Backend Flow | Resolve targets (denominator) → approve (P01) → enroll-batch (idempotent X.1 job) → auto-wave into capacity-bounded sessions → track completion → escalate (X.2) → rolling renewal re-targets pre-expiry |
  | Validation | Capacity invariant on wave; idempotent batch; eligible denominator; mandatory program published |
  | Authorization | P02: L&D run (`ld.campaign-launch`); `ld_manager` approve; Dept Head sanction scope |
  | State Changes | Campaign DRAFT→APPROVED→RUNNING→PAUSED/COMPLETED/CANCELLED; targets PENDING→…→COMPLETED/OVERDUE/EXEMPT/FAILED |
  | Failure Handling | Partial batch failure → resumable (X.1 per-period run key); capacity exhaustion → scheduling-gap alert; idempotency keys per (campaign,employee) |
  | Dependencies | FR-007/008/009/012/016/022; **P01**, **X.1**, **X.2** |
  | Test Guidance | Idempotent batch; auto-wave capacity safety; rolling renewal timing; escalation ladder; coverage math |

---

### FR-G07-018 — External & Professional Credential Capture & Verification *(Risk #6)*
- **Module:** G07
- **Primary Role(s):** Employee (submit), L&D Officer (verify, `ld.credential-verify`), L&D Manager (approve)
- **User Story:** As an employee, I want to record externally-acquired professional credentials (PMP, CISA, a statutory licence) with evidence so my significant qualifications are recognised and posted to the G12 service register regardless of who delivered the training.
- **Description:** Capture `certifications` with `credential_source=EXTERNAL_PROFESSIONAL`, `issuing_body`, `external_reference_no`, and verification recorded in the append-only `credential_verifications` ledger. Verified significant credentials are eligible for **G12 SR posting** (FR-G07-016) and can populate the skill inventory. Submission/verification screens are **W.2 forms**.
- **Acceptance Criteria:**
  1. An employee/L&D can create an external credential with issuing body, reference, dates, evidence (`VAL-FILE`→G13).
  2. Verification routes through L&D: SUBMITTED→EVIDENCE_REVIEWED→VERIFIED/REJECTED, each appended to `credential_verifications`.
  3. A VERIFIED renewable credential sets `valid_until` and can update `employee_skills`.
  4. A VERIFIED credential meeting `is_significant` (FR-G07-016) becomes G12 SR-posting eligible.
  5. Self-capture creator ≠ verifier (SoD via P02).
  6. Rejected credentials retain the immutable verification trail; not deleted.
- **Business Rules:** External credentials need not link a `training_program_id`. Verification method recorded. Only VERIFIED credentials post to G12. `external_reference_no` unique per employee (`VAL-G07-CREDREF`).
- **Data Model References:** `certifications`(EXTERNAL_PROFESSIONAL) C/R/U; `credential_verifications` Append; `documents`(G13) R; `employee_skills` U (optional).
- **API References:** POST `/api/v1/employees/{empId}/external-credentials`, `/api/v1/external-credentials/{id}:verify`/`:reject`; GET `/api/v1/employees/{empId}/external-credentials`.
- **UI Behavior Notes:** Credential submission form; verification queue with evidence viewer; status badges; SR-eligibility indicator.
- **Edge Cases:** Duplicate external reference for same employee (409 `VAL-G07-CREDREF`); evidence missing on submit (422 if policy requires); verifier = submitter (403 SoD `ERR-FORBIDDEN`); credential expiry behaves like FR-G07-012.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ExternalCredentialService`, `VerificationLedger`, `SignificanceResolver` (shared) |
  | Backend Flow | Create credential → submit → L&D review (append ledger) → VERIFIED → optional skill update → significance eval → G12 SR-eligibility |
  | Authorization | P02: Employee submit-own; L&D verify (`ld.credential-verify`); `ld_manager` approve significant |
  | State Changes | `verification_status` NOT_REQUIRED→PENDING→VERIFIED/REJECTED; G12 posting if significant |
  | Failure Handling | 403 SoD; 409 duplicate; 422 missing evidence |
  | Dependencies | FR-012/016; G13 |
  | Test Guidance | Verification trail immutability; SoD; significance eligibility; skill propagation |

---

### FR-G07-019 — Vendor / External-Trainer Empanelment & Procurement Linkage *(Risk #15)*
- **Module:** G07
- **Primary Role(s):** Vendor/Empanelment Manager (`ld.vendor-admin`), L&D Manager (approve via P01), Finance
- **User Story:** As an L&D Manager, I want external trainers/providers empanelled with contract and procurement references so external costs tie to an approved vendor and public-sector procurement controls are honoured.
- **Description:** Maintain `vendor_empanelments` with status, contract/procurement references, validity, rate cards; link external `trainers` and `training_costs` to an empanelled vendor. **Empanelment approval is a configured P01 flow** (requester ≠ approver). Procurement-system linkage (if live) runs on **X.3**.
- **Acceptance Criteria:**
  1. A vendor empanelment captures name, empanelment ref, contract/procurement refs, validity, rate card.
  2. Empanelment requires approval (SoD via P01/P02); DRAFT→PENDING_APPROVAL→EMPANELLED.
  3. External trainers may link to an EMPANELLED vendor; sessions with external trainers require valid empanelment (FR-G07-008).
  4. External `training_costs` must reference an EMPANELLED vendor within validity (`VAL-G07-EMPANEL`).
  5. Suspended/blacklisted/expired vendors cannot be assigned to new sessions or costs.
- **Business Rules:** `empanelment_ref` `VAL-MASTER-UNIQUE`. Validity must cover session/cost dates. Blacklisting cascades a block on new assignments (history preserved). Expiry handled by **JOB-G07-EMPANELEXPIRE**.
- **Data Model References:** `vendor_empanelments` C/R/U; `trainers` R/U (link); `training_costs` R (linkage); `documents`(G13) R (contract).
- **API References:** POST `/api/v1/vendor-empanelments`, `/{id}:approve`/`:suspend`/`:blacklist`; GET `/api/v1/vendor-empanelments?status=&validOn=&cursor=`.
- **UI Behavior Notes:** Empanelment register with status/validity; contract/procurement reference fields + document upload; rate-card editor; **P01 approval stepper**; block warnings on assigning non-empanelled vendors.
- **Edge Cases:** Cost referencing expired empanelment (409 `ERR-G07-EMPANEL`); blacklisting a vendor with active sessions (block new, flag existing); duplicate ref (409); self-approval (403).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `EmpanelmentService`, `EmpanelmentValidator` (shared FR-008/016), `P01WorkflowClient`, **`JOB-G07-EMPANELEXPIRE`** |
  | Backend Flow | Create → approve (P01, SoD) → link trainers/costs → validity & status checks on assignment |
  | Authorization | P02: Vendor Mgr maintain (`ld.vendor-admin`); `ld_manager` approve; Finance read |
  | State Changes | DRAFT→PENDING_APPROVAL→EMPANELLED→SUSPENDED/EXPIRED/BLACKLISTED |
  | Failure Handling | 409 duplicate/assignment; 403 SoD |
  | Dependencies | FR-008/016; P01, X.1; X.3 (procurement) |
  | Test Guidance | Validity gating; blacklist cascade; SoD; cost linkage |

---

### FR-G07-020 — Sponsorship / Study-Leave / Deputation & Service-Obligation *(Risk #15)*
- **Module:** G07
- **Primary Role(s):** Employee (request), Reporting Manager (recommend), Dept Head/Appointing Authority (sanction via P01), Finance (recovery)
- **User Story:** As an appointing authority, I want to sanction long-duration sponsored training with a service bond and track the obligation so public funds are recoverable on breach.
- **Description:** Model `training_sponsorships` with sponsored amount, service-bond duration, derived bond-end date, obligation status, and breach→recovery handling that feeds a `BOND_RECOVERY` cost to **G10** (FR-G07-016). **Sanction is a configured P01 recommend→sanction flow.** Breach detection ties to the **G05** relieving event where applicable.
- **Acceptance Criteria:**
  1. A sponsorship captures type, sponsored amount, dates, bond months, links a program or external course.
  2. Sanction routes recommend→sanction (Dept Head, P01); PROPOSED→SANCTIONED→ACTIVE.
  3. On completion the bond is ACTIVE until `bond_end_date`; fulfilling sets FULFILLED.
  4. Early exit/breach sets BREACHED and computes `bond_recovery_amount` (pro-rata per policy).
  5. A BREACHED bond must emit a `BOND_RECOVERY` cost (`payable_to_payroll`) before moving to RECOVERED (`VAL-G07-BOND`).
  6. Waivers require authority approval (P01) and are audited (WAIVED, P05).
- **Business Rules:** `bond_end_date = completion_date + service_bond_months`. Recovery per configurable pro-rata formula. Bond recoveries route to G10 via the payable feed.
- **Data Model References:** `training_sponsorships` C/R/U; `training_costs`(SPONSORSHIP, BOND_RECOVERY) C; `training_programs` R.
- **API References:** POST `/api/v1/training-sponsorships`, `/{id}:sanction`/`:mark-breached`/`:waive`, `/{id}:compute-recovery`; GET `/api/v1/training-sponsorships?status=&employeeId=&cursor=`.
- **UI Behavior Notes:** Sponsorship request form; **P01 approval stepper**; bond timeline; breach action with computed recovery preview; recovery-to-payroll status; waiver dialog with reason.
- **Edge Cases:** Resignation during bond (auto-flag BREACHED via G05 relieving event, compute recovery); transfer within org (bond continues); waiver after partial recovery (audited); deceased/retired (policy-driven waiver).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SponsorshipService`, `BondCalculator`, `RecoveryEmitter` (→G10), `P01WorkflowClient` |
  | Backend Flow | Request → recommend → sanction (P01) → ACTIVE on completion → monitor bond → on breach compute recovery → emit BOND_RECOVERY cost → RECOVERED/WAIVED |
  | Authorization | P02: Employee request; Manager recommend; Dept Head sanction; Finance recovery |
  | State Changes | PROPOSED→SANCTIONED→ACTIVE→FULFILLED/BREACHED→RECOVERED/WAIVED; G10 feed |
  | Failure Handling | Block RECOVERED without recovery cost; audit waivers (P05) |
  | Dependencies | FR-016; **G10**, **G05** (relieving) for breach detection; P01 |
  | Test Guidance | Bond derivation; pro-rata recovery; breach→recovery→payroll; waiver audit |

---

### FR-G07-021 — Content & Assessment-Item Management *(Risk #12, #16)*
- **Module:** G07
- **Primary Role(s):** L&D Officer (author/curate), SysAdmin (host config), Auditor (read)
- **User Story:** As an L&D Officer, I want to author and version SCORM/xAPI content packages and assessment item banks with accessibility metadata so e-learning and tests are hosted, versioned, and WCAG-conformant.
- **Description:** Manage `lms_content_packages` (versioned SCORM/xAPI/self-hosted with `hosting` and `wcag_conformance`) and `assessment_items` (item bank with types, keys, versions, accessibility). Self-hosted binaries stored via **G13**; correct keys masked on serialization (P02).
- **Acceptance Criteria:**
  1. A content package is versioned per program with declared standard and hosting model.
  2. Packages/items carry `wcag_conformance`; NON_CONFORMANT content cannot be PUBLISHED for mandatory programs without an accessibility-exception approval (P01, `VAL-G07-WCAG`).
  3. Assessment items support single/multi-choice, true/false, numeric, free-text, with versioning; correct keys RBAC-restricted (P02 field mask).
  4. Publishing a new version supersedes the prior for new enrolments; in-flight enrolments retain their launched version (mirrors P01 in-flight pinning).
  5. Content accessibility is testable and reported; assessment content meets WCAG 2.1 AA (§9).
- **Business Rules:** `UNIQUE(tenant, training_program_id, package_version)`. Correct keys never returned to learners. Self-hosted packages store the binary via G13.
- **Data Model References:** `lms_content_packages` C/R/U/Retire; `assessment_items` C/R/U/Retire; `training_programs`/`documents`(G13) R.
- **API References:** POST `/api/v1/content-packages`, `/api/v1/assessment-items`; GET `/api/v1/programs/{id}/content-packages`; PATCH `/api/v1/content-packages/{id}` (`:publish`,`:retire`).
- **UI Behavior Notes:** Package manager with version history, standard, hosting, WCAG badge; item-bank editor with type-specific fields and accessibility checklist; key fields masked for non-authors (P02); accessibility-exception workflow (P01).
- **Edge Cases:** NON_CONFORMANT mandatory content (blocked without exception, 422 `ERR-G07-WCAG`); duplicate version (409); retiring a package with active enrolments (in-flight retain version); leaking correct keys (forbidden by P02).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ContentPackageService`, `ItemBankService`, `AccessibilityGate`, `P01WorkflowClient` (exception) |
  | Backend Flow | Author → validate (WCAG, standard) → publish (version) → bind to program/FR-015; items served without keys (P02 mask) |
  | Authorization | P02: L&D author; SysAdmin host config; learner read sans keys |
  | State Changes | DRAFT→PUBLISHED→RETIRED; supersession on new version |
  | Failure Handling | 409 duplicate; 422 WCAG gate; exception workflow |
  | Dependencies | FR-007/011/015; G13; P01 |
  | Test Guidance | Versioning/supersession; WCAG gating; key confidentiality |

---

### FR-G07-022 — Proxy / Kiosk / Assisted Mode & Offline Attendance Sync *(Risk #9)*
- **Module:** G07
- **Primary Role(s):** Kiosk Operator (`ld_kiosk_operator`), Reporting Manager (proxy), L&D Officer
- **User Story:** As a Kiosk Operator, I want to launch e-learning, capture self-assessment, and record attendance on behalf of non-login field/clerical staff — including offline with later sync — so the whole workforce is reachable and compliance KPIs are attainable.
- **Description:** Provide an **attributed** assisted/kiosk mode for skill self-assessment, e-learning launch, and attendance capture for employees without an individual login, plus offline buffering and reconciliation. Defines the compliance-coverage denominator (`VAL-G07-COVERAGE`) used by campaigns (FR-G07-017). Employee selection resolves against the **G01 master** by `service_no`.
- **Acceptance Criteria:**
  1. A Kiosk Operator authenticates (real platform principal) and selects an employee (by `service_no`); all actions attributed to both operator and employee in **P05**.
  2. Assisted self-assessment writes `employee_skills`/`skill_assessments` with source=SELF and operator attribution.
  3. Kiosk e-learning launch maps the employee to an `lms_user_ref` for X.3 sync (FR-G07-015).
  4. Offline attendance buffers locally with `offline_captured_at` and syncs via `:offline-sync` (FR-G07-010), deduped server-side.
  5. The coverage denominator classifies each employee eligible/exempt for campaign metrics; classification is auditable and policy-driven.
  6. Assisted/kiosk capture never bypasses SoD or validation rules of the underlying FR (P02 still enforces).
- **Business Rules:** Kiosk Operator is a real authenticated principal; **no anonymous capture**. Offline buffers encrypted and reconciled idempotently by (nomination, date). Denominator rules configurable per campaign.
- **Data Model References:** `training_attendance`(KIOSK/ASSISTED/OFFLINE_SYNC) C/R/U; `employee_skills`/`skill_assessments` C; `lms_enrollments` C; `campaign_targets` R/U (denominator).
- **API References:** POST `/api/v1/kiosk/sessions`, `/api/v1/kiosk/{empId}/self-assessment`, `/api/v1/sessions/{id}/attendance:offline-sync`; GET `/api/v1/coverage/eligibility?campaignId=&employeeId=`.
- **UI Behavior Notes:** Kiosk-optimised large-touch UI; employee selector by `service_no`; assisted forms with behavioural-anchor help; functional offline state with pending-sync count and conflict-resolution queue; operator attribution always visible.
- **Edge Cases:** Offline clock skew (server reconciles, flags); duplicate offline + online mark (dedupe, conflict surfaced); operator assisting outside org scope (403 via P02); unmapped employee with no `service_no` (denominator EXEMPT with reason).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `KioskService`, `AssistedCaptureService`, `OfflineSyncReconciler` (shared FR-010), `CoverageDenominatorService` |
  | Backend Flow | Operator auth (P02) → select employee (scope check) → assisted write (dual attribution, P05) → offline buffer → sync reconcile → denominator classification |
  | Authorization | P02: Kiosk Operator (attributed); manager proxy for reports; L&D |
  | State Changes | Feeds FR-003/010/015/017; coverage metrics |
  | Failure Handling | Conflict queue; 403 out-of-scope; clock-skew flagging |
  | Dependencies | FR-003/010/015/017 |
  | Test Guidance | Dual attribution; offline dedupe/skew; denominator classification; scope enforcement |

---

### FR-G07-023 — DPDP Retention & Erasure of Learning PII at Exit *(Risk #13)*
- **Module:** G07
- **Primary Role(s):** Data Protection Officer (approve/execute), L&D Officer, Auditor
- **User Story:** As the DPO, I want defined retention/erasure of learning PII when an employee exits so DPDP obligations are met while statutory SR-posted records are preserved.
- **Description:** On employee exit (from G01 lifecycle: RETIRED/RESIGNED/TERMINATED/DECEASED) or a data-subject erasure request, apply configured retention/erasure actions, recording each append-only in `learning_data_retention_actions`. Statutory-retention overrides preserve SR-posted certs. **Audit-PII erasure executes through the P05 redaction-marker path** (the sole permitted audit mutation); statutory retention never falls below the statutory floor (Platform §8.1).
- **Acceptance Criteria:**
  1. An exit/erasure event resolves a retention/erasure plan: anonymise self-assessments, detach feedback authorship, erase marketplace presence, retain statutory records.
  2. SR-posted certifications and statutory records flagged `retention_override=true` and preserved.
  3. Each action appended to `learning_data_retention_actions` with DPO approval; ledger immutable.
  4. Marketplace presence removed immediately on exit regardless of prior opt-in.
  5. An export action can produce a data-subject export before erasure where required.
  6. Erasure requester ≠ DPO approver (SoD via P02).
- **Business Rules:** Append-only ledger; no destructive action without DPO approval. Statutory retention always wins over erasure for SR-posted/legally-required records. PII minimisation in logs throughout (P05 stores masked PII).
- **Data Model References:** `learning_data_retention_actions` Append; `employee_skills`/`skill_assessments`/`training_feedback`/`certifications` U/anonymise; `consent_records`(platform) R.
- **API References:** POST `/api/v1/learning-data/retention-plan?employeeId=`, `/api/v1/learning-data/retention-actions:execute`, `/api/v1/learning-data/export?employeeId=`; GET `/api/v1/learning-data/retention-actions?employeeId=`.
- **UI Behavior Notes:** DPO console listing exit/erasure cases; per-action checklist with statutory-override flags; approval workflow (P01); immutable action history; export download.
- **Edge Cases:** SR-posted cert under erasure request (retained, documented to subject, 409 `ERR-G07-RETENTION`); re-employment after erasure (new profile, no resurrection); deceased employee (next-of-kin/policy handling); partial erasure with statutory holds.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `RetentionPlanner`, `ErasureExecutor` (P05 redaction marker), `RetentionLedger`, `DataExporter` |
  | Backend Flow | Exit/erasure event (G01) → build plan (policy + statutory overrides) → DPO approve (P01) → execute (anonymise/detach/erase/retain via P05 redaction) → append ledger |
  | Authorization | P02: DPO approve/execute; L&D read; Auditor read |
  | State Changes | PII anonymised/detached; marketplace presence removed; statutory retained |
  | Failure Handling | Block erasure of statutory records (`ERR-G07-RETENTION`); audited overrides |
  | Dependencies | FR-003/011/014/016; **G01** exit events; DPDP policy; P05 |
  | Test Guidance | Override precedence; SoD; ledger immutability; marketplace removal; export |

---

### FR-G07-024 — Published Gap Contract for G06 / G08 *(Risk #3, launch-required primitive)*
- **Module:** G07
- **Primary Role(s):** L&D Officer (publish), Integration/SysAdmin, Auditor
- **User Story:** As the owner of G06/G08 integration, I want a stable, versioned Gap Contract describing each employee's competency gaps so promotion (G06) and appraisal (G08) consume a guaranteed primitive even while the developmental layer is phased.
- **Description:** Project a versioned, read-only **Gap Contract v1** from `skill_gap_analyses` + `skill_gap_items`: per (employee, model) the list of competencies with a positive gap, each flagged critical/non-critical, with staleness/model-stale indicators. Served on the platform API conventions (cursor pagination for batch; `Authorization.check` row scoping). Payload versioning aligns with the **X.3 payload-versioning** discipline.
- **Acceptance Criteria:**
  1. The Gap Contract exposes: `employeeId`, `competencyModelId`, `generatedOn`, `scoringMode`, `modelStaleFlag`, and an array of `{competencyId, isCritical, gapSize, discountedForStaleness}`.
  2. Versioned (`v1`); changes backward-compatible or version-bumped, never silently altered.
  3. G06 and G08 read via a stable endpoint; the schema is registered in the dependency register (§10.6).
  4. Reflects the latest FINALIZED analysis; SUPERSEDED analyses not exposed.
  5. Binary critical/non-critical always present; weighted fields appear only when `ld.gap-weighted` granted; consumers not required to use them.
- **Business Rules:** Read-only, projection-only (no side effects). Versioning explicit. Row-level scoping applies to consumers (P02).
- **Data Model References:** `skill_gap_analyses`/`skill_gap_items` R (projection).
- **API References:** GET `/api/v1/gap-contract/v1?employeeId=&modelId=`; GET `/api/v1/gap-contract/v1/batch?orgUnitId=&fy=&cursor=&limit=`.
- **UI Behavior Notes:** No direct UI; an admin "contract schema & version" reference page and a consumer-access audit view (P05).
- **Edge Cases:** No FINALIZED analysis (empty contract with reason); consumer requests out-of-scope employee (403 via P02, never reveals existence); version negotiation via path.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `GapContractProjector`, `ContractVersionRegistry` |
  | Backend Flow | On FINALIZE (FR-004) → project contract → serve read-only to G06/G08 (service auth + P02 scope); version pinned |
  | Authorization | P02: Consumers (G06/G08) via service auth + row scope; Auditor read |
  | State Changes | None (read-only) |
  | Failure Handling | Empty contract on no analysis; 403 out-of-scope |
  | Dependencies | FR-004; **G06**, **G08** (consumers); §10.6 |
  | Test Guidance | Schema conformance; version stability; latest-finalized semantics; scoping |

---

## 7. UI Requirements

### 7.1 Global UI principles
- Behaviour/NFR specified here; the physical stack is an engineering choice within the platform's logical architecture. Responsive (breakpoints 375/768/1280px; touch ≥ 44×44px), WCAG 2.1 AA (keyboard nav, focus order, 4.5:1 contrast, ARIA), dark mode.
- Every screen implements the **five canonical UI states** (Foundation §3): **empty / loading / error (`ERR-*` id + retry, never a raw 500) / no-permission (gating item hidden; deep-linked forbidden shows `ERR-FORBIDDEN`, not a 404 leak) / partial-data (render authorised, mask the rest per RBAC)**. Offline state is **functional** for kiosk attendance (FR-G07-022), not decorative.
- `DD-MMM-YYYY` dates, INR currency, locale-aware. Masked-field and `E·AR` request-change patterns per RBAC §3.9 / Platform §P02.
- All lists **cursor-paginated** (limit ≤ 100), filterable, sortable, with column-level RBAC field masking on serialization.
- Proficiency self-assessment and assessment content surface **behavioural anchors** and meet content-accessibility (FR-G07-021/§9).
- Tasks/approvals surface through the **P01 Tasks aggregation** and the **Me / My Team / Admin** workspace model (Platform §6.5); each task routes to exactly one workspace.

### 7.2 Key screens
| Screen | Primary roles | Key elements | Workspace |
|---|---|---|---|
| My Skills & Growth | Employee | Skill cards (proficiency + freshness chip), gaps radar, recommendations (Phase-2 badge when off), CPD, certs + external credentials | Me |
| Team Skills (Manager) | Manager | Team heatmap, validation queue (stale re-validation), nomination actions, team plan | My Team |
| Competency Framework Admin | L&D Officer | Taxonomy tree, competency builder, proficiency catalog (descriptor editor), **P01 publish** | Admin |
| Competency Model Editor & Governance | L&D Officer | Model grid, scope (role picker), version timeline, owner + review-due/staleness | Admin |
| Skill-Gap Analysis | L&D/Manager | Target-vs-current, gap list (stale-discount/model-stale banners), convert-to-need | Admin/Team |
| Training Needs Inbox | L&D/Manager | Source-filtered needs (W.2), consolidation wizard, priority editor | Admin/Team |
| Annual Plan & Calendar | L&D Manager | Plan builder, canonical-key budget bar, quarter Gantt, **P01 approval stepper** | Admin |
| Course Catalog | L&D/All | Program cards/grid, filters, program editor (content-package + X.3 connector) | Admin/Me |
| Content & Item Bank Studio | L&D Officer | Package version manager, item-bank editor, WCAG badges, accessibility-exception (P01) | Admin |
| Session Scheduler | L&D | Calendar create, conflict warnings, capacity meter, trainer/venue (empanelment status) | Admin |
| Vendor Empanelment Register | Vendor Mgr/L&D Mgr | Empanelment list, contract/procurement refs, rate cards, **P01 approval** | Admin |
| Nomination & Approvals | Manager/L&D | Nominate dialog (W.2), **P01 approver inbox (Tasks)**, explicit waitlist position, budget banner | Team/Admin |
| Compliance Campaign Console | L&D/Mgr | Campaign wizard, coverage dashboard (eligible/exempt/overdue), wave board, escalation status | Admin |
| Attendance Console | Trainer/L&D/Kiosk | Roster grid, per-day marking, bulk actions, signed-sheet upload (G13), kiosk/offline + pending-sync | Admin |
| Assessment & Feedback | Trainer/Employee | Score grid, learning-gain chart, feedback (W.2), Kirkpatrick dashboard (L3/L4 optional/sampled + G14 KPI) | Admin/Me |
| Certifications & Compliance | L&D/Employee | Certificate viewer, expiry timeline, mandatory heatmap, lapsed-mandatory + auto-renewal | Admin/Me |
| External Credentials | Employee/L&D | Submission form (W.2), verification queue, evidence viewer, SR-eligibility | Me/Admin |
| Sponsorship & Service-Bond | Employee/Dept Head/Finance | Request, **P01 sanction stepper**, bond timeline, breach/recovery, waiver | Me/Admin |
| Onboarding Tracker | L&D/HR/Manager | Induction checklist, window progress, overdue flags | Admin/Team |
| Learning Paths & Marketplace | Employee/L&D | Path explorer, recommendation cards (flagged), CPD dashboard, marketplace (flagged, opt-in) | Me/Admin |
| Budget & Cost Dashboard | Finance/L&D | Allocated/committed/actual bars (canonical key), variance, cost-per-completion, cost entry, G10 feed | Admin |
| DPO Retention Console | DPO/Auditor | Exit/erasure cases, action checklist (statutory overrides), immutable history, export | Admin |
| LRS/LMS Connector Admin | SysAdmin | X.3 connector config, primary toggle, sync mode, **circuit-breaker health (lag/cursor)**, reconciliation queue | Admin |

---

## 8. Low-Level Design
> LLD is embedded per FR in Section 6. No separate section is duplicated.

---

## 9. NFRs (Non-Functional Requirements) — platform baseline adopted

| Category | Requirement (platform baseline · `PLATFORM_FOUNDATION.md` §8.2) |
|---|---|
| Performance | **Standard API p95 < 500 ms @ 300 concurrent**; read-heavy (catalog/list/reports) p95 < 300 ms cached / < 1000 ms uncached; write p95 < 1500 ms; web LCP (4G) < 2.5 s. **Gap analysis event-driven/incremental: single-employee recompute < 5 s p95.** Full **JOB-G07-GAPRECOMPUTE** reconciliation for **200k employees** runs partitioned within the nightly window (fallback, not primary). Campaign `:enroll-batch` processes ≥ 50k targets via chunked, resumable, idempotent X.1 jobs. |
| Scalability | Horizontal scaling; **200k employees**, 5k concurrent learners, ~200k+ annual mandatory completions (campaign-driven), 50k+ annual discretionary nominations. |
| Availability | **99.5%/month** (platform baseline — overrides the v2 99.9%); graceful degradation when G08/LMS/LRS/G12 unavailable (X.3 circuit-break). |
| Resilience | **RTO < 4 h · RPO < 1 h** (platform baseline — overrides the v2 RPO 15 min); idempotent SR/LMS/payroll integrations on X.3 with retry + dead-letter; resumable X.1 batch/campaign jobs. |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; **P02 RBAC + 5-dimension row-level scoping + field mask on serialization + PII Protection Ceiling**; no polymorphic-FK integrity gaps (actor_type); **X.3 signed service auth + P04 credentials** for LRS; secrets never in DB/logs; **kiosk operators attributed, never anonymous**; MFA for `ld_manager`/DPO. |
| Privacy | India DPDP Act 2023 alignment incl. retention/erasure of learning PII at exit (FR-G07-023, via the **P05 redaction-marker** path); `consent_records` for marketplace opt-in + exit removal; PII minimisation; no PII in logs; encrypted offline buffers. |
| Auditability | **100% mutation capture by the P05 DB trigger, zero gaps** (`audit_log`); auth/permission events to `security_audit_log`; append-only ledgers immutable; full traceability need→nomination→cert→G12 SR; waitlist promotions, campaign waves, significance decisions, erasure actions all captured by P05; tamper-evidence tracks **OPEN-PLAT-03** (hash-chain). |
| Accessibility | WCAG 2.1 AA across all screens **and assessment content (item banks, pre/post tests) and hosted/authored e-learning** (`lms_content_packages.wcag_conformance`); NON_CONFORMANT mandatory content blocked without exception. |
| Observability | Structured logs with **`X-Correlation-Id`** (Platform §0.5); metrics for nomination throughput, campaign coverage, G12 SR posting success, **X.3 LRS/LMS sync lag & poll-cursor health + circuit-breaker state**, incremental-gap recompute latency; alerting on FAILED postings, stuck campaigns, and `JOB-FAIL`/`MSG-SYS-JOBFAIL`. |
| Data retention | Statutory retention ≥ 7 yr for certifications/SR-posted training (P05 floor); operational data per schedule; erasure honours statutory overrides; no hard delete (soft delete only). |
| Localisation | UTC storage; locale display; INR default with banker's rounding; i18n-ready strings (W.2 i18n). |

---

## 10. API & Integration (platform conventions adopted)

### 10.1 Conventions (Foundation §1)
- Base path **`/api/v1`**; JWT bearer carrying resolved roles/entity scope; endpoints call **`Authorization.check`** (P02), never re-implement permission logic.
- **Cursor pagination only:** `?limit=` (default 25, max 100) + `cursor=`; response carries `next_cursor`. **No offset/page paging** (overrides v2).
- **`Idempotency-Key`** header on unsafe POSTs that start a transaction (SR posting, LMS provisioning, payroll feed, campaign enroll-batch, bond recovery, nomination); 24h replay returns the original.
- **`X-Correlation-Id`** carried/assigned on every request, echoed in the response header and written to every P05 audit/log line.
- Sorting/filtering `?sort=field:asc|desc`. Effective-dated mutations accept `effective_from` (staged, not live — Platform §3.3) where applicable.

### 10.2 Canonical error envelope (Foundation §1; overrides v2)
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "obtained_score exceeds max_score", "field": "obtained_score", "details": {} } }
```
2xx returns the resource payload; 4xx/5xx return the envelope. The correlation id is carried in the **`X-Correlation-Id` response header**, not a body `requestId`.

### 10.3 Standard error-code table (8 codes) + module error mapping
| Standard code | HTTP | Used by G07 for |
|---|---|---|
| `VALIDATION_FAILED` | **422** | any `VAL-*`/`VAL-G07-*` failure (missing descriptor, missing content package, score bounds, scope key, WCAG gate) |
| `UNAUTHENTICATED` | 401 | no/invalid session (incl. bad X.3 LRS-ingest service signature) |
| `FORBIDDEN` | 403 | RBAC/SoD/self-approval/self-validation/self-verify (`ERR-FORBIDDEN`); mandatory self-withdrawal (`ERR-G07-MANDATORY`/`ERR-REVOKE-FORBIDDEN`) |
| `NOT_FOUND` | 404 | entity absent / out of scope / no effective competency model (never reveals out-of-scope existence) |
| `CONFLICT` | 409 | duplicate code/nomination/empanelment ref/external-credential ref; schedule conflict (`ERR-G07-SCHEDULE`); capacity (`ERR-G07-CAPACITY`); budget (`ERR-G07-BUDGET`); cert ineligible (`ERR-G07-CERT-INELIGIBLE`); vendor not empanelled (`ERR-G07-EMPANEL`); bond recovery required (`ERR-G07-BOND`); statutory retention hold (`ERR-G07-RETENTION`); duplicate workflow start (`ERR-DUP-INSTANCE`) |
| `PRECONDITION_FAILED` | 412 | a required precondition not met (`ERR-PRECOND`) — e.g., accessibility exception missing |
| `RATE_LIMITED` | 429 | throttled |
| `INTERNAL` | 500 | unexpected server error; **upstream LMS/LRS/G08/G12/G10 unavailable is mapped here via X.3** + `ERR-LOADFAIL` (the v2 `503 UPSTREAM_UNAVAILABLE` and `502 SR_POSTING_FAILED` are **dropped** — X.3 handles upstream failure/retry; the SR posting state machine carries FAILED). |

**Module-unique `ERR-G07-*` messages (register in Foundation §5):** `ERR-G07-CAPACITY`, `ERR-G07-BUDGET`, `ERR-G07-EMPANEL`, `ERR-G07-SCHEDULE`, `ERR-G07-CERT-INELIGIBLE`, `ERR-G07-WCAG`, `ERR-G07-BOND`, `ERR-G07-RETENTION`, `ERR-G07-MANDATORY`. Shared `ERR-FORBIDDEN`/`ERR-LOADFAIL`/`ERR-PRECOND`/`ERR-DUP-INSTANCE`/`ERR-PAST-DATED`/`ERR-REASON-REQ`/`ERR-REVOKE-FORBIDDEN`/`MSG-SYS-JOBFAIL` are cited, never restated.

### 10.4 Module-unique validation rules (`VAL-G07-*`, register in Foundation §2)
| Id | Applies to | Rule |
|---|---|---|
| `VAL-G07-ANCHOR` | `proficiency_levels.descriptor` | Non-empty behavioural anchor required before PUBLISH. |
| `VAL-G07-REVAL` | `skills.revalidation_interval_months` | If set, ≥ 1. |
| `VAL-G07-SCOPEKEY` | `competency_models` | Exactly one scope key matches `scope_type`; all null only when GENERIC. |
| `VAL-G07-GAPSIZE` | `skill_gap_items.gap_size` | `= max(0, target_order − current_order)`; never negative. |
| `VAL-G07-CAPACITY` | `training_sessions`/nominations | `enrolled_count ≤ capacity`; overflow → WAITLISTED with position. |
| `VAL-G07-BUDGETKEY` | budgets/costs | `committed + actual ≤ allocated` at `(financial_year, entity/org_unit)` only. |
| `VAL-G07-SIGNIF` | SR posting | `is_significant` rule evaluation; matched rule(s) stored. |
| `VAL-G07-EMPANEL` | costs/sessions | External cost/trainer references an EMPANELLED vendor within validity. |
| `VAL-G07-BOND` | sponsorships | BREACHED must emit `BOND_RECOVERY` cost before RECOVERED. |
| `VAL-G07-WCAG` | content/items | NON_CONFORMANT mandatory content blocked without accessibility exception. |
| `VAL-G07-COVERAGE` | campaigns | Completion % measured against the eligible denominator; exemptions explicit. |
| `VAL-G07-PRIMARYLRS` | `learning_record_stores` | Exactly one `is_primary=true`. |
| `VAL-G07-CREDREF` | external credentials | `external_reference_no` unique per employee. |

Shared cited: `VAL-REQUIRED`, `VAL-ENUM`, `VAL-DATE`, `VAL-EFFECTIVE`, `VAL-FILE`, `VAL-COMMENT`, `VAL-CURRENCY`, `VAL-CONSENT`, `VAL-MASTER-UNIQUE`, `VAL-FLOW-NOCYCLE`, `VAL-PCT`, `VAL-INT`, `VAL-NO`, `VAL-DEPENDENT`.

### 10.5 Background jobs (`JOB-G07-*`, register on X.1 / Foundation §4)
| Job id | Purpose | Cadence | Owning FR |
|---|---|---|---|
| `JOB-G07-FRESHNESS` | Skill freshness/decay + expiry recompute | Nightly | FR-G07-003 |
| `JOB-G07-GAPRECOMPUTE` | Full gap reconciliation (fallback to incremental) | Nightly, partitioned | FR-G07-004 |
| `JOB-G07-MODELREVIEW` | Competency-model staleness alarm | Daily | FR-G07-002 |
| `JOB-G07-CERTEXPIRY` | Cert expiry → EXPIRED + lapsed_mandatory + renewal need + reminders | Daily | FR-G07-012 |
| `JOB-G07-CAMPAIGN` | Campaign auto-wave, rolling renewal, escalation ladder | Daily / event | FR-G07-017 |
| `JOB-G07-LMSSYNC` | SCORM reporting-API poll (cursor) via X.3 | Per `poll_interval_minutes` | FR-G07-015 |
| `JOB-G07-EMPANELEXPIRE` | Vendor empanelment expiry | Daily | FR-G07-019 |
| `JOB-G07-TRAINERRATE` | Trainer avg-rating recompute | Nightly | FR-G07-011 |
| `JOB-G07-INDUCTION` | Induction window tracking + escalation | Daily | FR-G07-013 |
| `JOB-G07-BUDGETALERT` | Budget threshold (≥90%) alerts | Daily | FR-G07-016 |
| `JOB-G07-RETENTION` | Execute approved DPDP retention/erasure (P05 redaction) | On demand / daily | FR-G07-023 |

All inherit the X.1 runner standard (idempotent per-period run key, exponential backoff ×3, terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL`, per-tenant isolation, run audit row).

### 10.6 Example requests/responses
**Create nomination (P01-initiated, idempotent)**
```json
POST /api/v1/training-sessions/ts-3001/nominations
Idempotency-Key: nom:ts-3001:emp-3001
{ "employeeId": "emp-3001", "trainingNeedId": "tn-7001", "nominationType": "MANAGER" }

201 Created
{ "trainingNominationId": "nm-4001", "status": "PENDING_L1", "workflowInstanceId": "wfi-88", "estimatedCost": 8000.00 }
```
**Approve nomination — full → waitlisted with position**
```json
POST /api/v1/nominations/nm-4100:approve
200 OK
{ "trainingNominationId": "nm-4100", "status": "WAITLISTED", "waitlistPosition": 3 }
```
**Campaign batch enrolment (idempotent, resumable X.1 job)**
```json
POST /api/v1/training-campaigns/camp-01:enroll-batch
Idempotency-Key: camp-01:enroll:2026-07-01
202 Accepted
{ "eligibleTargets": 198450, "exempt": 1550, "nominationsQueued": 198450, "jobId": "JOB-G07-CAMPAIGN:run-77c1", "resumable": true }
```
**LMS sync — xAPI ingested from LRS / SCORM via poll, on X.3 (no webhook)**
```json
POST /api/v1/lms/xapi/ingest
{ "learningRecordStoreId": "lrs-01", "lmsEnrollmentId": "le-9001", "statementId": "stmt-abc-123", "verb": "completed", "progressPct": 100, "score": 88 }

200 OK
{ "applied": true, "idempotent": false, "completionStatus": "COMPLETED" }
```
```json
POST /api/v1/lms/scorm/poll
{ "learningRecordStoreId": "lrs-02", "sincePollCursor": "2026-07-01T00:00:00Z" }
200 OK
{ "recordsIngested": 142, "nextPollCursor": "2026-07-01T00:15:00Z" }
```
> SCORM 1.2/2004 has no server-to-server push. Integration is **xAPI-via-LRS ingest or SCORM-via-reporting-API poll, both on X.3** with P04 credentials, circuit-breaking and payload versioning. See FR-G07-015.

**G12 SR posting (pinned contract, via X.3)**
```json
POST /api/v1/certifications/ct-6001:post-to-sr
Idempotency-Key: cert:ct-6001
202 Accepted
{ "srPostingStatus": "PENDING", "isSignificant": true, "matchedRules": ["MANDATORY_CERT"], "targetLedger": "G12-SR" }
```
**Gap Contract v1 (consumed by G06/G08)**
```json
GET /api/v1/gap-contract/v1?employeeId=emp-3001&modelId=cm-9001
200 OK
{ "employeeId":"emp-3001","competencyModelId":"cm-9001","generatedOn":"2026-06-30T02:00:00Z",
  "scoringMode":"BINARY","modelStaleFlag":false,
  "gaps":[ {"competencyId":"comp-SQL","isCritical":true,"gapSize":2,"discountedForStaleness":true} ] }
```

### 10.7 Integration points
| Direction | Counterparty | Mechanism | Idempotency |
|---|---|---|---|
| Consume employee master & joiner events | **G01** (PrimeSoft M01) | platform service/event (pinned joiner contract §10.8) | event id |
| Consume appraisal development gaps | **G08** | read API/event (pinned gap-feed, X.3) | cycle+emp |
| Publish Gap Contract v1 | **G06**, **G08** | read API (versioned) | n/a (read-only) |
| Append SR events | **G12-SR** (on P05) | **X.3** outbound (retry, circuit-break, pinned contract §10.8) | cert/nomination id |
| Emit reimbursement / bond-recovery payable | **G10** | event/feed | cost id |
| Store/retrieve documents | **G13** | platform API | document id |
| LMS/LRS course launch & sync | External LMS / LRS | **X.3** (SSO deep-link + xAPI ingest / SCORM poll; P04 creds) | xAPI statement id / poll cursor |
| Notifications | Platform **X.2 / W.3** | event (MSG-G07-* templates) | notification id |
| Analytics datamart | **G14** | read views/export (incl. cost-per-completion, L4 KPI keys) | n/a |

### 10.8 Pinned cross-module contracts
**G12 SR training-event (G07 → G12), append-only, via X.3:**
```json
{ "eventType":"TRAINING_QUALIFICATION", "sourceModule":"G07",
  "idempotencyKey":"cert:ct-6001", "tenantId":"t-1", "entityId":"e-1", "employeeId":"emp-3001",
  "title":"Cyber-Security Essentials", "issuingAuthority":"CGG L&D",
  "credentialSource":"INTERNAL_PROGRAM", "isMandatory":true,
  "issueDate":"2026-07-01", "validUntil":"2027-07-01",
  "significanceRules":["MANDATORY_CERT"], "documentId":"doc-555", "occurredAt":"2026-07-01T10:00:00Z" }
```
**G01 joiner-event (G01 → G07):**
```json
{ "eventType":"EMPLOYEE_JOINED", "tenantId":"t-1", "entityId":"e-1", "employeeId":"emp-9999", "serviceNo":"SVC-12345",
  "dateOfJoining":"2026-07-01", "cadre":"clerical", "designationId":"desg-CLK",
  "orgUnitId":"ou-12", "occurredAt":"2026-07-01T00:00:00Z", "eventId":"evt-abc" }
```
**G08 appraisal-gap feed (G08 → G07):**
```json
{ "appraisalCycleRef":"APAR-2025-26", "tenantId":"t-1", "employeeId":"emp-3001",
  "developmentGaps":[ {"competencyId":"comp-COMM","targetLevel":"L3","currentLevel":"L2"} ],
  "generatedAt":"2026-04-15T00:00:00Z" }
```
**Gap Contract v1 (G07 → G06/G08):** schema as §10.6; version path `/gap-contract/v1`.

---

## 11. Workflow & State Diagrams (state tables)
> All approval transitions execute on **P01** (`approve/reject/sendBack/delegate/cancel`, idempotent; in-flight version pinning). Side-effect audit is by the **P05** trigger.

### 11.1 Nomination state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| DRAFT | submit (P01 startInstance) | PENDING_L1 | maker≠approver; need linked |
| PENDING_L1 | manager approve (P01) | PENDING_L2 | SoD (P02) |
| PENDING_L1 | reject | REJECTED | reason required (`VAL-COMMENT`) |
| PENDING_L2 | L&D approve (P01) | APPROVED | capacity+budget check; commit budget; decrement capacity |
| PENDING_L2 | approve when full | WAITLISTED | assign `waitlist_position`=max+1 (FIFO); P05-audited |
| APPROVED | withdraw (before deadline) | WITHDRAWN | free seat → promote waitlist head; P05 audit; compact positions; release commitment |
| WAITLISTED | seat frees | APPROVED | FIFO by `waitlist_position`; P05-audited |
| APPROVED | session completes (attended+pass) | COMPLETED | issue cert eligibility |
| APPROVED | session completes (fully absent) | NO_SHOW | mark, notify (X.2) |
| any non-terminal | mandatory/campaign self-withdraw | (blocked) | `ERR-G07-MANDATORY` (403) |

### 11.2 Training session state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | open nominations | OPEN | program PUBLISHED |
| OPEN | capacity reached | FULL | enrolled = capacity |
| OPEN/FULL | start date reached | RUNNING | — |
| RUNNING | end + closeout | COMPLETED | attendance/assessment finalised |
| any pre-completion | cancel | CANCELLED | reason; cascade nominations + X.2 |

### 11.3 Certification state table
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| (none) | issue | ACTIVE | eligibility met; cert_no generated; PDF→G13 |
| ACTIVE | valid_until passed | EXPIRED | **JOB-G07-CERTEXPIRY**; notify; if mandatory: set `lapsed_mandatory`, create renewal need, enroll campaign |
| ACTIVE | renewal issued | SUPERSEDED | new cert ACTIVE; clear lapsed flag |
| ACTIVE/EXPIRED | revoke (P01) | REVOKED | `ld_manager` approval; G12 SR correction if posted |

### 11.4 SR posting state table (target G12, via X.3)
| Current | Event | Next | Guard |
|---|---|---|---|
| NOT_REQUIRED | `is_significant` rule matches | PENDING | `VAL-G07-SIGNIF` resolver |
| PENDING | post success | POSTED | G12 ack (pinned contract); store `service_register_event_id` |
| PENDING | post failure | FAILED | X.3 retry scheduled |
| FAILED | retry success | POSTED | within X.3 retry budget |
| FAILED | retries exhausted | FAILED | alert L&D + SR Custodian (X.2 `MSG-G07-SR-FAILED`) |

### 11.5 Annual plan state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | budget reconciled (canonical key) |
| SUBMITTED | approve (P01) | APPROVED | `ld_manager` + Finance |
| APPROVED | activate | ACTIVE | FY start |
| ACTIVE | close | CLOSED | all items terminal |

### 11.6 Campaign state table
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| DRAFT | approve (P01) | APPROVED | scope sanctioned; mandatory program PUBLISHED |
| APPROVED | enroll-batch + run | RUNNING | resolve targets (denominator); idempotent X.1 batch nominations |
| RUNNING | auto-wave | RUNNING | assign waves into capacity-bounded sessions; create sessions as needed |
| RUNNING | pause | PAUSED | reason; no new nominations |
| RUNNING | all eligible terminal | COMPLETED | coverage finalised |
| RUNNING/PAUSED | cancel | CANCELLED | reason; existing nominations per policy |
| RUNNING | renewal cadence reached | RUNNING | JOB-G07-CAMPAIGN re-targets pre-expiry (ties FR-012) |

### 11.7 Sponsorship / service-bond state table
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| PROPOSED | recommend+sanction (P01) | SANCTIONED | Dept Head approval |
| SANCTIONED | training starts | ACTIVE | — |
| ACTIVE | bond term fulfilled | FULFILLED | bond_end_date passed in service |
| ACTIVE | early exit/breach | BREACHED | compute recovery (G05 relieving may trigger) |
| BREACHED | recovery emitted | RECOVERED | `BOND_RECOVERY` cost to G10 required first (`VAL-G07-BOND`) |
| ACTIVE/BREACHED | authority waiver (P01) | WAIVED | approval + P05 audit |

### 11.8 Vendor empanelment state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | PENDING_APPROVAL | requester ≠ approver (P02) |
| PENDING_APPROVAL | approve (P01) | EMPANELLED | `ld_manager` |
| EMPANELLED | suspend | SUSPENDED | reason |
| EMPANELLED/SUSPENDED | blacklist | BLACKLISTED | block new assignments |
| EMPANELLED | validity passed | EXPIRED | JOB-G07-EMPANELEXPIRE |

### 11.9 Credential verification state table
| Current | Event | Next | Guard |
|---|---|---|---|
| NOT_REQUIRED/PENDING | submit | PENDING | evidence per policy |
| PENDING | review+verify | VERIFIED | verifier ≠ submitter (P02); significance eval → G12 SR eligibility |
| PENDING | reject | REJECTED | reason; immutable trail retained |

---

## 12. Notifications (via X.2 / W.3; templates by MSG-G07-* id)
> Recipients are resolved by **W.3** configuration; dispatch is by **X.2** (IN_APP + EMAIL in parallel for approvals; EMAIL for approval-workflow and statutory notices is **mandatory/non-suppressible**; retry backoff up to 5 + DLQ; every dispatch audit-logged). Copy lives in the Foundation Message Catalogue (§5) under the `MSG-G07-*` family; this table indexes events → recipients → channel → template id.

| Event | Recipients | Channel | Template id |
|---|---|---|---|
| Nomination pending approval | Manager / L&D Mgr (P01 task) | Email + in-app | `MSG-G07-NOM-PENDING` |
| Nomination approved/rejected/waitlisted | Employee, nominator | Email + in-app | `MSG-G07-NOM-DECISION` |
| Waitlist promotion (with position) | Employee | Email + SMS | `MSG-G07-NOM-PROMOTED` |
| Session reminder (T-3 days) | Enrolled + trainer | Email + SMS | `MSG-G07-SESSION-REMINDER` |
| Session cancelled | Enrolled + trainer | Email + SMS + in-app | `MSG-G07-SESSION-CANCELLED` |
| Campaign launched / wave assigned | Target employee + manager | Email + in-app | `MSG-G07-CAMPAIGN-WAVE` |
| Campaign overdue / escalation (ladder) | Employee→manager→L&D | Email + escalation | `MSG-G07-CAMPAIGN-ESCALATION` |
| Pre/post assessment due | Trainer | In-app | `MSG-G07-ASSESS-DUE` |
| Feedback request (post-session) | Participants | Email + in-app | `MSG-G07-FEEDBACK-REQUEST` |
| Certificate issued | Employee | Email + in-app | `MSG-G07-CERT-ISSUED` |
| Certificate expiry (60/30/7 days) | Employee + manager | Email + in-app | `MSG-G07-CERT-EXPIRY` |
| Mandatory cert lapsed → auto re-nominated | Employee + manager + L&D | Email + escalation | `MSG-G07-CERT-LAPSED-RENEWAL` |
| Mandatory training overdue | Employee + manager + L&D | Email + escalation | `MSG-G07-MANDATORY-OVERDUE` |
| Induction window overdue | New joiner + manager + L&D | Email + escalation | `MSG-G07-INDUCTION-OVERDUE` |
| External credential verified/rejected | Employee | Email + in-app | `MSG-G07-CREDENTIAL-DECISION` |
| Skill stale — re-validation needed | Employee + manager | In-app | `MSG-G07-SKILL-STALE` |
| Competency model review due | Model owner + L&D Mgr | Email + in-app | `MSG-G07-MODEL-REVIEW` |
| Sponsorship bond breach / recovery | Employee + Finance + Dept Head | Email + in-app | `MSG-G07-BOND-BREACH` |
| G12 SR posting failed | L&D + SR Custodian | Email + in-app | `MSG-G07-SR-FAILED` |
| Budget threshold breached (≥90%) | Finance + L&D Mgr | Email + in-app | `MSG-G07-BUDGET-THRESHOLD` |
| LMS/LRS sync reconciliation needed | L&D + SysAdmin | In-app | `MSG-G07-LMS-RECON` |
| DPDP erasure pending DPO action | DPO | Email + in-app | `MSG-G07-ERASURE-PENDING` |

Non-login staff escalations route to the reporting manager / kiosk-coordinator. Job terminal failures route to `MSG-SYS-JOBFAIL` (shared).

---

## 13. Reporting & Analytics (datamarts to G14)
| Report | Audience | Key metrics / dimensions |
|---|---|---|
| Skill inventory & coverage | L&D/Mgr | Skills by category, proficiency distribution, validated vs declared, fresh vs stale |
| Skill-gap heatmap | L&D/Mgr/Dept Head | Critical gaps by org-unit, competency, designation |
| Competency-model staleness | L&D Mgr | Models past review-due, by owner/org-unit; curation-evidence metric for flag gating |
| Training plan execution | L&D Mgr | Planned vs delivered man-days, by quarter/org-unit |
| Nomination funnel | L&D | Nominated→approved→attended→completed |
| Campaign coverage & compliance | L&D/Auditor/Dept Head | Coverage % vs eligible denominator, exemptions, overdue, wave progress, rolling-renewal pipeline |
| Learning effectiveness (Kirkpatrick) | L&D | L1 reaction, L2 learning gain; L3/L4 sampled, programme-level, G14 KPI-linked |
| Mandatory-compliance status | L&D/Auditor/Dept Head | Required vs held vs lapsed mandatory certs; % compliant |
| Certification & credential register | L&D/Auditor | Internal + external/professional; active/expired/revoked; renewals |
| Induction compliance | HR/L&D | On-time vs overdue induction |
| CPD credit summary | Employee/L&D | Credits by year vs target (target Phase 2) |
| Trainer & vendor performance | L&D | Avg feedback rating, sessions delivered, pass rates, empanelment status |
| Budget utilisation & variance | Finance/L&D Mgr | Allocated/committed/actual (canonical entity/org-unit + FY key), variance %, category breakdown (reporting) |
| Cost-per-completion / ROI | Finance/L&D Mgr/G14 | Actual ÷ completions; L4 KPI linkage |
| LMS/LRS engagement | L&D | Enrolments, completion rate, time-to-complete, X.3 sync health |
| Sponsorship & bond exposure | Finance/Dept Head | Active bonds, exposure, breaches, recoveries |
| DPDP retention/erasure log | DPO/Auditor | Erasure actions, statutory holds, exports |

Reports exposed as datamarts/views to **G14**; all support entity/org-unit scoping (P02), FY filters, CSV/PDF export, RBAC field masking.

---

## 14. Migration & Launch (on P06)

### 14.1 Data migration (P06 ETL+V)
Runs on **P06** (Extract→Validate→Transform→Load→Verify; three staging dry runs; waves; `migration_runs` ledger; **`gov_source_id`** traceability against the legacy training register; failed records logged with source row + violated rule).

| Source | Target | Approach |
|---|---|---|
| Legacy skill/competency lists | `skill_categories`/`skills`/`competencies` | Map → validate → load (source=IMPORT); descriptors required before PUBLISH; L&D review |
| Existing employee qualifications/certs | `certifications`, `employee_skills` | Import with `sr_posting_status=NOT_REQUIRED` for historical; flag significant for back-posting (gated); set `last_validated_at` from import date |
| Externally-acquired credentials | `certifications`(EXTERNAL_PROFESSIONAL) | Import with `verification_status=PENDING`; L&D verifies before G12 eligibility |
| Historical training records | programs/sessions/nominations (closed) | Load as COMPLETED for history/analytics |
| Legacy budgets | `training_budgets` | Load current+prior FY at canonical entity/org-unit+FY key |
| Vendor/empanelment master | `vendor_empanelments` | Import EMPANELLED vendors with contract/procurement refs |
| E-learning content | `lms_content_packages` | Register SCORM/xAPI packages with version + WCAG; declare hosting + primary X.3 connector |

### 14.2 Cutover & launch (statutory spine first)
1. **Pin cross-module contracts** (G12 SR-event, G01 joiner, G08 gap-feed, Gap Contract v1 — §10.8) with owning modules.
2. Load and publish taxonomy, proficiency levels (with descriptors), competencies, governed models (owner + review-due). Gate: L&D sign-off.
3. Stand up program catalog (FR-007) + content packages (FR-021) + **primary X.3 LRS/LMS connector** (FR-015) validated round-trip (P04 credentials).
4. **Prove the statutory spine end-to-end on ONE pilot entity:** campaign-based mandatory enrolment (FR-017) → attendance incl. kiosk/offline (FR-010/022) → completion → certification (FR-012) → idempotent **G12 SR posting via X.3** (FR-016). Reconcile in P05 audit.
5. Import employee skills/certs + external credentials; run reconciliation report (zero unmatched against G01 master).
6. Org-wide rollout of the statutory spine; publish Gap Contract v1 for G06/G08.
7. **Phase 2 (gated on curation evidence + RBAC capability flags):** weighted gap scoring, recommendations, marketplace, CPD targets.
8. Post-launch: monitor G12 posting success, campaign coverage, nomination throughput, X.3 sync health, incremental-gap latency.

### 14.3 Rollback & safety
- Idempotent P06 imports/X.1 batch jobs re-runnable; SR back-posting gated behind explicit approval.
- Capability flags per developmental capability (§2.5); default OFF.
- Append-only ledgers (credential verifications, retention actions) + P05 immutability ensure no destructive migration of historical evidence.
- Campaign jobs resumable; partial failures do not duplicate (X.1 idempotency keys).

---

## 15. Traceability / Dependency / Parallel-Agent Plan

### 15.1 Traceability matrix (FR → entities → APIs → platform services → depends on)
| FR | Primary entities | Key APIs | Platform services | Depends on |
|---|---|---|---|---|
| FR-G07-001 | skill_categories, skills, competencies, proficiency_levels | /skills,/competencies | P01, P05, X.2 | — |
| FR-G07-002 | competency_models(+role_id/owner/review), items | /competency-models | P01, X.1(JOB-MODELREVIEW), P05 | 001 |
| FR-G07-003 | employee_skills(+freshness), skill_assessments | /employees/{}/skills | X.1(JOB-FRESHNESS), P05 | 001,002 |
| FR-G07-004 | skill_gap_analyses, skill_gap_items | /skill-gap-analyses,/gap-contract | X.1(JOB-GAPRECOMPUTE), X.3(G08 feed) | 002,003, G08 |
| FR-G07-005 | training_needs | /training-needs | W.2, P05 | 004 |
| FR-G07-006 | annual_training_plans(+items), training_budgets | /annual-training-plans | P01, P05 | 005,016 |
| FR-G07-007 | training_programs | /training-programs | P01 | 001,021,015 |
| FR-G07-008 | training_sessions, trainers, venues | /training-sessions | X.2 | 007,019 |
| FR-G07-009 | training_nominations(+waitlist_position,wfi) | /nominations | **P01**, P05 | 008,016,017 |
| FR-G07-010 | training_attendance(+capture_mode/actor) | /sessions/{}/attendance | P05 | 009,015,022 |
| FR-G07-011 | training_assessments(+actor), training_feedback | /nominations/{}/assessments | W.2, X.1(JOB-TRAINERRATE) | 010,021 |
| FR-G07-012 | certifications(+lapsed/renewal/sre) | /certifications | P01, X.1(JOB-CERTEXPIRY), X.3(G12) | 010,011,016,017 |
| FR-G07-013 | training_needs/nominations (induction) | /induction | X.1(JOB-INDUCTION), G01 event | 007,009,012,014, G01 |
| FR-G07-014 | learning_paths(+items), cpd_records | /recommendations,/cpd | RBAC §4.3 flags, consent_records | 004,007,011 |
| FR-G07-015 | lms_enrollments, learning_record_stores | /lms/xapi/ingest,/lms/scorm/poll | **X.3**, P04, X.1(JOB-LMSSYNC) | 007,009,010,012,021 |
| FR-G07-016 | service_register_events(G12), training_budgets, training_costs | /post-to-sr,/training-budgets | **X.3→G12**, G10 feed, P05 | 009,012,018,020, G12, G10 |
| FR-G07-017 | training_campaigns, campaign_targets | /training-campaigns | P01, X.1(JOB-CAMPAIGN), X.2 | 007,008,009,012,016,022 |
| FR-G07-018 | certifications(EXTERNAL), credential_verifications | /external-credentials | P01, P05, G13 | 012,016 |
| FR-G07-019 | vendor_empanelments | /vendor-empanelments | P01, X.1(JOB-EMPANELEXPIRE), X.3 | 008,016 |
| FR-G07-020 | training_sponsorships | /training-sponsorships | P01, G10, G05 event | 016, G10, G05 |
| FR-G07-021 | lms_content_packages, assessment_items | /content-packages,/assessment-items | P01, G13, P02 mask | 007,011,015 |
| FR-G07-022 | training_attendance(offline), kiosk capture | /kiosk/*,/attendance:offline-sync | P02, P05 | 003,010,015,017 |
| FR-G07-023 | learning_data_retention_actions | /learning-data/* | P05 redaction, P01, G01 event | 003,011,014,016, G01 |
| FR-G07-024 | (projection of gap analyses/items) | /gap-contract/v1 | P02 scope, X.3 versioning | 004, G06, G08 |

### 15.2 Parallel-agent build plan (statutory spine first)
| Wave | FRs (parallelisable) | Rationale |
|---|---|---|
| **0 (contracts + platform wiring)** | §10.8 pinned contracts (G12 SR-event, G01 joiner, G08 gap-feed, Gap Contract v1); register `VAL-G07-*`/`JOB-G07-*`/`MSG-G07-*`/`ERR-G07-*` and the new RBAC roles/flags | Unblock waves; ensure platform indices updated |
| 1 (foundation) | 001, 007 (catalog skeleton), 021 (content), 016 budget tables, 019 (empanelment) | Masters + content + budget/vendor base |
| 2 | 002 (governed models), 008, 015 (X.3 LRS config + P04 creds) | Build on masters; connector config |
| **3 (statutory spine — pilot)** | 009, 017 (campaign), 010+022 (attendance incl. kiosk/offline), 012, 016 (G12 SR posting) | Prove mandatory-compliance → cert → G12 SR end-to-end on one entity first |
| 4 | 003 (inventory+freshness), 005, 006 | Inventory, needs, plan |
| 5 | 004 (incremental gap), 024 (Gap Contract), 011, 013, 018 | Gap engine + contract + assessment + induction + external creds |
| 6 (Phase 2, flagged) | 014 (recommendations/marketplace), 020 (sponsorship), 023 (DPDP erasure) | Developmental layer + sponsorship + retention, gated on curation evidence |

### 15.3 External dependencies & register
| Dependency | Module/Service | Type | Contract pinned? | Fallback |
|---|---|---|---|---|
| Employee master / joiner events | **G01** (PrimeSoft M01) | Hard | Yes (§10.8) | cache + X.3 retry |
| Appraisal development gaps | **G08** | Soft | Yes (§10.8) | degraded gap mode (X.3 circuit-break) |
| Gap Contract consumers | **G06**, **G08** | Hard (sibling) | Yes (§10.8, v1) | versioned, backward-compatible |
| Service Register | **G12** (on P05) | Hard (statutory) | Yes (§10.8) | X.3 queue + retry + alert |
| Documents | **G13** | Hard | n/a | block upload, allow metadata |
| Payroll payable / bond recovery | **G10** | Soft | feed schema | queue feed |
| LMS / LRS | External | Soft | X.3 connector + P04 cred | manual attendance fallback |
| Procurement system | External | Soft | reference / X.3 | manual empanelment entry |
| Workflow / Audit / Notify / Jobs / Migration / Authz | **P01/P05/X.2/X.1/P06/P02** | Hard (platform) | platform contracts | n/a — consumed, not built |

### 15.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)
| Mandated / council-required / platform element | Covered by | Status |
|---|---|---|
| Competency/skill framework | FR-G07-001/002 | ✅ |
| Proficiency levels + behavioural anchors | FR-G07-001 (`VAL-G07-ANCHOR`) | ✅ |
| Competency-model governance (review/owner/staleness) | FR-G07-002, JOB-G07-MODELREVIEW | ✅ |
| Skill inventory + freshness/decay | FR-G07-003, JOB-G07-FRESHNESS | ✅ |
| Incremental skill-gap analysis | FR-G07-004 | ✅ |
| Binary-default gap; weighted Phase-2 (capability flag) | FR-G07-004, §2.5 | ✅ |
| Published Gap Contract for G06/G08 | FR-G07-024, §10.8 | ✅ |
| Annual training calendar & plan | FR-G07-006 | ✅ |
| Budget canonical key (FY, entity/org-unit) | §5.6 rule 7, `VAL-G07-BUDGETKEY` | ✅ |
| Course catalog / content & item model | FR-G07-007/021 | ✅ |
| Training needs linked to appraisal gaps (G08) | FR-G07-004/005 | ✅ |
| Source-enum normalisation (1:1 gap→need) | §5.5 | ✅ |
| Nomination & approval workflow | FR-G07-009 | ✅ |
| Waitlist position + fairness audit | FR-G07-009, §11.1 | ✅ |
| Mandatory-compliance campaign engine (scale) | FR-G07-017 | ✅ |
| Batch/session scheduling, trainer & venue | FR-G07-008 | ✅ |
| Vendor/external-trainer empanelment + procurement | FR-G07-019 | ✅ |
| Attendance incl. proxy/kiosk/offline + coverage denominator | FR-G07-010/022 | ✅ |
| Pre/post assessment; Kirkpatrick L3/L4 reframed; ROI | FR-G07-011/016, §13 | ✅ |
| Certification & enforced validity/renewal + lapsed flag | FR-G07-012 | ✅ |
| External/professional credential capture + verification | FR-G07-018 | ✅ |
| Induction/onboarding training (G01 joiner) | FR-G07-013 | ✅ |
| Training budget & cost tracking | FR-G07-006/016 | ✅ |
| Sponsorship/study-leave/deputation + service bond | FR-G07-020 | ✅ |
| SR posting + `is_significant` rule set + pinned contract | FR-G07-016, §10.8 | ✅ |
| LMS integration corrected (LRS/xAPI ingest, SCORM poll — no webhook) | FR-G07-015 | ✅ |
| Learning paths / recommendations / micro-learning / CPD / marketplace | FR-G07-014/007 | ✅ |
| DPDP retention/erasure of learning PII at exit | FR-G07-023 | ✅ |
| Data-model defects fixed (role_id, polymorphic FKs) | §5.2.5/5.2.19/5.2.20 | ✅ |
| Content/assessment accessibility (WCAG) | §9, FR-G07-021/011 | ✅ |
| Build plan resequenced (statutory spine first) | §15.2 | ✅ |
| **Platform: nomination/approvals on P01 (workflow_actions, version pinning)** | FR-G07-009/006/012/017/019/020; §11 | ✅ |
| **Platform: authz via P02 `Authorization.check` + SoD + field mask** | §3, §6 all FRs | ✅ |
| **Platform: audit via P05 dual-log DB trigger; no local audit_log** | §2.4, §9 | ✅ |
| **Platform: jobs registered on X.1 as JOB-G07-\*** | §10.5 | ✅ |
| **Platform: LMS/LRS + cross-module integration on X.3 (P04 creds, circuit-break, idempotency, payload versioning)** | FR-G07-015/016, §10.7 | ✅ |
| **Platform: training forms/assessments as W.2 forms citing VAL-\*** | §6 (005/009/011/018), §10.4 | ✅ |
| **Platform: notifications via X.2/W.3 (MSG-G07-\*); statutory mandatory** | §12 | ✅ |
| **Platform: migration via P06 (gov_source_id, 3 dry runs, waves)** | §14 | ✅ |
| **Platform: tenant_id/entity_id on every entity; data-layer scoping** | §5.0, §5.2 | ✅ |
| **Platform: API conventions — cursor pagination, Idempotency-Key, X-Correlation-Id, 8-code envelope** | §10.1–§10.3 | ✅ |
| **Platform: NFR baseline (99.5%, RPO<1h, RTO<4h, p95<500ms, WCAG AA)** | §9 | ✅ |
| **Platform: RBAC v1.7 roles as ADDITIONS + capability flags (RBAC §2.2/§4.3)** | §3.1 | ✅ |
| **Platform: G-code scheme (G07); cross-module refs re-keyed (G01/G06/G08/G10/G12/G13/G14)** | throughout | ✅ |
| **Platform: SR ledger consumed from G12 (on P05), not a local entity** | FR-G07-016, §5.4 | ✅ |

**Unresolved gaps: 0.** Adopted council improvements: 25/25 preserved. Platform re-grounding rows: all ✅.

---

## 16. Glossary & Appendices

### 16.1 Glossary
| Term | Definition |
|---|---|
| Competency | A cluster of related skills/behaviours required for effective role performance. |
| Skill | An atomic, assessable capability within the taxonomy. |
| Proficiency level | An ordered measure of capability depth, each with a concrete behavioural anchor. |
| Competency model | The competencies + target proficiencies a role/cadre requires, with owner + review cadence. |
| Skill freshness / staleness | Whether a validated skill is within its `revalidation_interval_months`; stale skills discounted from gap closure. |
| Gap Contract | The versioned read-only projection of gaps consumed by G06/G08. |
| Campaign | A scoped, bulk, wave-orchestrated mandatory-training drive with rolling renewal and escalation (JOB-G07-CAMPAIGN). |
| Coverage denominator | The eligible population against which campaign completion % is measured. |
| Kirkpatrick model | Four-level evaluation: Reaction, Learning, Behaviour, Results (L3/L4 optional/sampled/programme-level). |
| CPD | Continuing Professional Development credits earned through learning. |
| SCORM / xAPI | E-learning standards; SCORM has no server push (poll the LMS reporting API via X.3); xAPI emits statements to an LRS. |
| LRS (Learning Record Store) | The endpoint receiving/serving xAPI statements; one X.3 connector is primary system of record. |
| Empanelment | Approved registration of an external vendor/trainer with contract/procurement reference. |
| Service bond | A post-sponsorship service-obligation period whose breach triggers cost recovery to G10. |
| `is_significant` rule set | The configurable rules deciding which trainings/credentials post to the G12 SR ledger. |
| P01–P06 / X.1–X.3 / W.1–W.3 | The PrimeSoft platform engines/infrastructure/configured-content models G07 runs on. |
| G-code | The government module code scheme (`G01..G14`) adopted to avoid collision with PrimeSoft `Mxx`. |
| Maker-checker | SoD control (creator ≠ approver) enforced by P01/P02. |
| Kiosk/assisted mode | Attributed capture of learning actions for non-login staff (never anonymous). |
| DPDP erasure | Retention/erasure of learning PII at exit via the P05 redaction-marker path, honouring statutory overrides. |

### 16.2 Appendices
- **A. Default proficiency scale (with anchors):** L1 Awareness … L5 Expert — each `proficiency_levels.descriptor` carries a mandatory concrete behavioural anchor (`VAL-G07-ANCHOR`, FR-G07-001).
- **B. Default thresholds (configurable):** min attendance 80%; assessment pass 50%; renewal reminders 60/30/7 days; induction windows 30/60/90 days; budget alert ≥90%; skill revalidation default 24 months; competency-model review cadence 12 months; campaign escalation T-14/T-3/T+1 days.
- **C. Kirkpatrick capture model (reframed):** L1/L2 per participant; **L3/L4 optional, sampled, programme-level** (not per-employee T+90); L4 `responses_json` links named G14 business-KPI keys. The fictional per-employee T+90 survey from v1 is removed.
- **D. `is_significant` rule set:** significant if ANY of: mandatory certification; externally accredited/professional credential (verified); programme duration ≥ threshold; promotion-relevant flag (G06); sponsored degree/deputation. Configurable; matched rule(s) stored for audit (`VAL-G07-SIGNIF`).
- **E. Single-LMS-of-record decision:** exactly one `learning_record_stores` is `is_primary` (`VAL-G07-PRIMARYLRS`); xAPI via LRS ingest, SCORM via reporting-API poll on X.3, optional self-hosted SCORM player. No SCORM webhook anywhere.
- **F. Platform grounding references:** `PLATFORM_FOUNDATION.md`, `MODULE_RECONCILIATION.md`, and the platform extracts (Platform Spec v1.6 §P01–P06/X.1–X.3/W.1–W.3; Foundation FS v1.6 §1–§6; RBAC v1.7). G07 references these by id and does not redefine them.

---

## Alignment with PrimeSoft Platform

This section maps every G07 FR to the platform service(s) it runs on and names the **NET-NEW / EXTEND** posture. Per `MODULE_RECONCILIATION.md` §A, G07 has **no PrimeSoft counterpart** (LMS is a future phase) — it is **net-new business logic** that **runs entirely on existing platform engines**; it authors **no new platform engine** (the only government engines authored from scratch are the statutory ones in other modules — SR ledger G12, pension G11, etc.).

| FR | Runs on (platform services) | Posture | Notes |
|---|---|---|---|
| FR-G07-001 Taxonomy/framework | **P01** (master publish), **P02**, **P05**, **X.2** | NET-NEW | `VAL-G07-ANCHOR`; W.2 editor forms |
| FR-G07-002 Competency models & governance | **P01**, **X.1** (JOB-MODELREVIEW), **P05** | NET-NEW | role_id via platform `roles` |
| FR-G07-003 Skill inventory & freshness | **X.1** (JOB-FRESHNESS), **P05**, **P02** | NET-NEW | employee refs → G01 master |
| FR-G07-004 Incremental gap analysis | **X.1** (JOB-GAPRECOMPUTE), **X.3** (G08 feed), **P02** | NET-NEW + consumes G08 | Gap Contract projection |
| FR-G07-005 Training needs | **W.2** forms, **P05** | NET-NEW | — |
| FR-G07-006 Annual plan & budget | **P01** (approval flow), **P05** | NET-NEW | canonical key |
| FR-G07-007 Course catalog | **P01** (publish), **P02** | NET-NEW | — |
| FR-G07-008 Sessions/trainers/venues | **P05**, **X.2** | NET-NEW | empanelment gate |
| FR-G07-009 Nomination & approval | **P01** (WorkflowEngine, idempotent, version-pinned), **P02** (SoD), **P05** | NET-NEW | W.2 nomination form; Tasks aggregation |
| FR-G07-010 Attendance | **P05**, **P02** | NET-NEW | offline/kiosk attributed |
| FR-G07-011 Assessment/Kirkpatrick | **W.2** forms, **X.1** (JOB-TRAINERRATE), **P02** (PII) | NET-NEW | L4→G14 KPIs |
| FR-G07-012 Certification & renewal | **P01** (revoke), **X.1** (JOB-CERTEXPIRY), **X.3→G12**, **G13**, **X.2** | NET-NEW + posts G12 | lapsed flag → G06 |
| FR-G07-013 Induction | **G01** joiner event, **X.1** (JOB-INDUCTION), **X.2**, **P01** | NET-NEW + consumes G01 | idempotent event |
| FR-G07-014 Paths/recommendations/CPD/marketplace | **RBAC §4.3** capability flags, **P02**, `consent_records` | NET-NEW (Phase-2 flagged) | DPDP-aware |
| FR-G07-015 LMS/LRS integration | **X.3** (framework), **P04** (credentials), **X.1** (JOB-LMSSYNC) | NET-NEW | no bespoke webhook |
| FR-G07-016 SR posting & budget/cost | **X.3 → G12** (on P05), **G10** feed, **P02** (SoD), **P05** | NET-NEW + posts G12 | `is_significant` |
| FR-G07-017 Campaign engine | **P01** (approve), **X.1** (JOB-CAMPAIGN), **X.2** | NET-NEW | idempotent resumable jobs |
| FR-G07-018 External credentials | **P01**, **P05**, **G13** | NET-NEW + posts G12 | append-only ledger |
| FR-G07-019 Vendor empanelment | **P01** (approval), **X.1** (JOB-EMPANELEXPIRE), **X.3** (procurement) | NET-NEW | SoD via P02 |
| FR-G07-020 Sponsorship/bond | **P01** (sanction), **G10** feed, **G05** relieving event | NET-NEW | breach→recovery |
| FR-G07-021 Content & item bank | **P01** (exception), **G13**, **P02** (key mask) | NET-NEW | WCAG gate |
| FR-G07-022 Kiosk/assisted/offline | **P02** (attributed principal), **P05** | NET-NEW | never anonymous |
| FR-G07-023 DPDP retention/erasure | **P05** (redaction marker), **P01**, **G01** exit event | NET-NEW | statutory override |
| FR-G07-024 Gap Contract | **P02** (scope), **X.3** (payload versioning) | NET-NEW | feeds G06/G08 |

**Engines G07 authors from scratch:** none (no `GAP (gov-specific)` platform engine). G07 authors **business logic and configured content only** (W.1 flow definitions, W.2 forms, W.3 notification config, JOB-G07-* logic/cadence, VAL-G07-*/MSG-G07-*/ERR-G07-* ids, RBAC role/flag additions) and **posts by reference** into the G12 SR ledger.

---

## Amendments (v2 → v3: platform re-grounding)

| # | v2 (invented `SHARED_FOUNDATION`) | v3 (PrimeSoft platform) | Where |
|---|---|---|---|
| 1 | Module code `M07-TSD`; FR-TSD-*; cross-refs to M01/M06/M08/M10/M12/M13/M14 | **G07**; **FR-G07-***; cross-refs re-keyed to **G01/G06/G08/G10/G12/G13/G14** | title, throughout |
| 2 | Bespoke `workflow_instances`/`workflow_tasks` "shared engine" | **P01 WorkflowEngine** (`workflows`/`workflow_instances`/`workflow_actions`; `startInstance/approve/…`; 5 patterns; in-flight version pinning) for all nominations/approvals/sanctions/revocations/publications | §2.4, FR-006/009/012/017/019/020, §11 |
| 3 | Local `audit_log` table; "every state change writes audit_log" | **P05 dual-log** (`audit_log` + `security_audit_log`) by **DB trigger**, immutable, ≥7-yr; tamper-evidence tracks OPEN-PLAT-03; no local audit table | §2.4, §9 |
| 4 | `service_register_events` treated as a shared platform entity, posted via "async bus" | **G12 SR ledger** (net-new gov entity on the **P05 substrate**), posted by reference via the **X.3** outbound pattern (pinned contract, idempotent, circuit-broken, payload-versioned) | FR-G07-016, §5.4, §10.8 |
| 5 | "Webhook"/bespoke LMS sync; secrets in `learning_record_stores.auth_secret_ref` | **X.3 integration framework**; credentials via **P04 `integration_credentials`** (referenced, never stored); circuit-breaking, outbound idempotency, payload versioning; JOB-G07-LMSSYNC poll | FR-G07-015, §5.2.31, §10.7 |
| 6 | Parallel form/assessment handling | **W.2 form model** (needs, nomination, feedback, credential forms) citing shared `VAL-*` + module `VAL-G07-*` | §6 (005/009/011/018), §10.4 |
| 7 | Error envelope `{error:{code,message,field},requestId}`; codes `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `RESOURCE_CONFLICT/SCHEDULE_CONFLICT/CAPACITY_EXCEEDED/BUDGET_EXCEEDED(409)`, `503`, `502` | Platform envelope `{error:{code,message,field,details}}` + **`X-Correlation-Id` header**; **8-code table** (`VALIDATION_FAILED 422`, `UNAUTHENTICATED 401`, `CONFLICT 409`, `PRECONDITION_FAILED 412`, `INTERNAL 500`, …); module specifics become `ERR-G07-*` under 409/422; 503/502 dropped (X.3 handles upstream) | §10.2–§10.3 |
| 8 | "cursor or page/limit, max 100" | **Cursor pagination only** (`limit` default 25/max 100, `next_cursor`); `Idempotency-Key` on transaction POSTs (24h) | §2.4, §10.1 |
| 9 | Multi-tenancy omitted | **`tenant_id`/`entity_id` on every entity**; data-layer scoping; unscoped queries rejected | §5.0, §5.2 |
| 10 | NFR 99.9% uptime, RPO ≤ 15 min | Platform baseline **99.5%/month, RPO < 1 h, RTO < 4 h, p95 < 500 ms**, WCAG 2.1 AA | §9 |
| 11 | Invented role list (L&D roles, Kiosk Op, Vendor Mgr, SR Custodian, DPO, Auditor, SysAdmin) | **RBAC v1.7 additions**: new roles `ld_officer`/`ld_manager`/`ld_trainer`/`ld_kiosk_operator` + capability flags `ld.gap-weighted`/`ld.campaign-launch`/`ld.credential-verify`/`ld.vendor-admin`/`ld.feature-flags`; Auditor→Org-Admin read, SysAdmin→Org/Platform Admin; SoD enforced by P01/P02 | §3.1 |
| 12 | Ad-hoc scheduled tasks ("nightly job") | **JOB-G07-*** registered on **X.1** with the shared runner standard (idempotent, backoff ×3, JOB-FAIL→MSG-SYS-JOBFAIL) | §10.5 |
| 13 | Feature flags `ff.gap.weighted` etc. as bespoke toggles | **RBAC §4.3 capability flags** (Org-Admin-granted, P05-audited) | §2.5, FR-G07-014 |
| 14 | Notifications to a local `notifications` ledger with module template keys | **X.2 dispatch + W.3 recipient resolution**; `MSG-G07-*` templates in Foundation §5; statutory mandatory/non-suppressible | §12 |
| 15 | Migration undefined / `darwinbox_source_id` | **P06** ETL+V, 3 dry runs, waves, `migration_runs`, **`gov_source_id`** traceability | §14 |
| 16 | DPDP erasure as bespoke destructive action | Executes through the **P05 redaction-marker** path (sole permitted audit mutation); statutory floor honoured | FR-G07-023 |
| 17 | Appraisal/employee references to M01/M08 generically | Reconciled to the **real PrimeSoft employee master (G01)** and **G08** appraisal feed via pinned contracts | FR-G07-003/004/013, §10.8 |
| 18 | Budget canonical key "(FY, org_unit)" | Restated as **(FY, entity/org_unit)** to respect platform entity scoping | §5.6 rule 7 |

---

*End of G07 Training and Skill Development Management BRD v3.0 (platform-grounded). This revision preserves all v2 content and rigor (25/25 council improvements, full 16-section structure, 0 unresolved gaps) and re-anchors the module onto the PrimeSoft platform: P01 workflow, P02 authz, P05 audit, P06 migration, X.1 jobs, X.2 notifications, X.3 integration, W.1/W.2/W.3 configured content, RBAC v1.7 roles, and the G12 SR ledger — authoring business logic only, never re-implementing a platform engine.*




