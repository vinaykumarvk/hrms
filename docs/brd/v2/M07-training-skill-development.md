# Training and Skill Development Management — HRMS Module BRD (v2.0)

**Module code:** M07-TSD
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — government/public-sector HCM, hosted at CGG Data Centre
**Document version:** v2.0 (revised after adversarial council review of v1.0)
**Status:** Approved for build, conditional on v2 amendments (parallel-agent ready)
**Supersedes:** v1.0 (`/Users/n15318/hrms/docs/brd/v1/M07-training-skill-development.md`)
**Foundation contract:** This BRD inherits and does not redefine the canonical entities, roles, conventions, and technical defaults in `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`. Shared entities (`employees`, `users`, `org_units`, `roles`, `audit_log`, `documents`, `notifications`, `service_register_events`, `workflow_instances`/`workflow_tasks`) are referenced, not redefined.

---

## 1. Executive Summary

### 1.1 Purpose
The Training and Skill Development Management module (M07-TSD) is the enterprise system that closes the loop between **what the workforce can do today** and **what each role demands**. It establishes a governed **competency and skill framework**, maintains a per-employee **skill inventory** with **freshness/decay controls**, computes **incremental skill-gap analysis**, converts gaps into a governed **annual training plan and calendar**, manages the full **training delivery lifecycle** (course catalog, nomination, scheduling, attendance, assessment, Kirkpatrick evaluation, certification), runs **mandatory-compliance campaigns at workforce scale**, tracks induction training, governs the **training budget**, captures **externally-acquired professional credentials**, manages **vendor empanelment and sponsorship/service-bond obligations**, and posts significant trainings and qualifications to the statutory **Digital Service Register (M12-SR)**.

### 1.2 Business context
For a public-sector employer, training is not only a capability lever but a **statutory and audit obligation**: mandatory compliance training (e.g., conduct rules, cyber-security, POSH, ethics), induction for new entrants, and the recording of significant qualifications/trainings in the service register are legally consequential. M07-TSD therefore combines **world-class HCM learning capabilities** (learning paths, skills marketplace, micro-learning, LMS/LRS/SCORM/xAPI integration, AI skill recommendations, CPD credit tracking) with **public-sector rigour** (maker-checker nominations, budget sanction, segregation of duties, immutable audit, statutory SR posting).

The v2 revision **separates the statutory spine from the developmental layer** (council First-Principles finding). The statutory spine — mandatory-compliance campaigns, certification, induction, and SR posting — is launch-required, high-volume, and proven end-to-end on a pilot department first. The developmental layer — weighted competency scoring, AI recommendations, and the skills marketplace — is feature-flagged Phase 2, gated on **evidence of framework curation**, so sophistication is built on the axis only after it is fed real data.

### 1.3 Key outcomes
- A single competency taxonomy and role-based competency models, **with review cadence and ownership**, drive objective skill-gap measurement.
- Skill inventory carries **freshness**: stale, never-revalidated skills are discounted from gap closure so the gap engine's inputs do not silently rot.
- Training needs originate from three reconciled sources: competency gaps, **appraisal development gaps imported from M08-PAM** via a versioned contract, and statutory mandates.
- Mandatory annual training for the entire workforce is orchestrated by a **campaign engine** (bulk nominate → auto-wave into capacity-bounded sessions → rolling renewal → escalation), reachable even by **non-login field staff** via proxy/kiosk/offline capture.
- Every nomination, attendance mark, assessment, certificate, credential, and cost entry is auditable and traceable to a need.
- Significant trainings/qualifications post automatically to the Digital SR (M12) as append-only events using a **pinned event contract**.

### 1.4 Scope summary
M07-TSD owns competency/skill master data, the skill inventory, training programs and sessions, content/assessment-item assets, nominations, campaigns, attendance, assessment, feedback, certification, external credentials, learning paths, CPD records, the training budget, vendor empanelment, sponsorship/service-bond records, and LMS/LRS-integration metadata. It consumes employee master data (M01), appraisal gaps (M08), org structure, documents (M13), and notifications, and it writes events to the Digital SR (M12) and analytics to M14.

### 1.5 Success metrics (KPIs)
| KPI | Target | Source |
|---|---|---|
| Mandatory-compliance training completion | ≥ 98% of **in-scope** workforce within statutory window | M07 (campaign engine) |
| Annual training-plan execution rate | ≥ 90% of planned man-days delivered | M07 |
| Skill-gap closure rate (year-on-year) | ≥ 25% of critical gaps closed | M07 + M08 |
| Average post-training learning gain (post − pre score) | ≥ 20 percentage points | M07 |
| Certificate validity compliance (no lapsed mandatory certs) | 100% (enforced, auto-re-nominated) | M07 |
| Budget utilisation variance | within ±10% of sanctioned (org-unit + FY canonical key) | M07 |
| Cost per compliant completion | tracked & trending down YoY | M07 + M14 |
| Competency-model freshness | ≥ 95% of published models within review-due date | M07 governance |

### 1.6 Amendments (v1 → v2)
See the dedicated **Amendments (v1 → v2)** table in §1.7. Every adopted improvement from the council report is mapped to the FR/entity/section that incorporates it.

### 1.7 Amendments (v1 → v2) — adopted-improvement traceability
| # | Adopted improvement (council) | Risk(s) mitigated | Where incorporated in v2 |
|---|---|---|---|
| 1 | Replace SCORM "webhook" with real LRS/poll integration; content-hosting & single-vs-multi-LMS decision | R1 (Critical) | FR-TSD-015 rewritten; new entities `learning_record_stores`, `lms_content_packages`; §10.4 example corrected; §10.5 |
| 2 | Mandatory-Compliance Campaign engine (bulk nominate, auto-wave, rolling renewal, escalation) | R2 (Critical) | New **FR-TSD-017**; new entities `training_campaigns`, `campaign_targets`; APIs `:enroll-batch`; §11.6 state table |
| 3 | Fix `competency_models` ROLE scope | R7 (High) | §5.2.5 adds `role_id`; FR-TSD-002 AC.1 updated; enum note §5.5 |
| 4 | Normalise source enums across layers | R7 (High) | §5.5 enum mapping table; `skill_gap_items.source` aligned to {GAP_ANALYSIS, APPRAISAL, MANDATORY}; FR-TSD-004/005 |
| 5 | Eliminate polymorphic FKs (actor_type discriminator) | R7 (High) | §5.2.19/5.2.20 add `*_actor_type` + `*_actor_id`; §5.6 rule 13 |
| 6 | Restate performance NFR at 200k; incremental gap recompute | R8 (High) | §9 Performance; FR-TSD-004 incremental engine; §5.6 rule 14 |
| 7 | Non-compliance skill freshness/decay | R5 (High) | §5.2.2 `revalidation_interval_months`; §5.2.7 `last_validated_at`, `freshness_status`; FR-TSD-003/004 |
| 8 | Competency-model governance (review cadence, owner, staleness alarm) | R4 (High) | §5.2.5 `review_due_date`, `owner_id`; FR-TSD-002 AC; §13 staleness report |
| 9 | Publish versioned Gap Contract for M06/M08 | R3 (High) | New **FR-TSD-024**; §10.6 Gap Contract v1 schema; §10.5 |
| 10 | Phase developmental layer behind curation evidence; binary gap default | R11 (Med) | §1.2, §2.5 feature-flag matrix; FR-TSD-004 binary default; FR-TSD-014 Phase-2 gating |
| 11 | External/professional credential capture & verification | R6 (High) | New **FR-TSD-018**; `certifications` extended (`credential_source`, `issuing_body`, `verification_status`); ledger `credential_verifications` |
| 12 | Enforce certification validity (auto re-nomination; lapsed flag) | R6 (High) | FR-TSD-012 AC.6–8; `certifications.lapsed_mandatory` flag; campaign re-nomination via FR-TSD-017 |
| 13 | Reframe Kirkpatrick L3/L4; instrument ROI | R10 (Med) | FR-TSD-011 (L3/L4 optional/sampled/programme-level); §13 `cost_per_completion`; Appendix C revised |
| 14 | Pin M12 SR-event and M01 joiner-event contracts | R3 (High) | §10.6 contract schemas; §10.5; §15.3 dependency register |
| 15 | Promote "significant training" definition into FR | R3-adjacent | FR-TSD-016 AC + `is_significant` resolution rule set; §16.2-D removed-into-FR |
| 16 | Proxy/kiosk/assisted mode + offline attendance sync; coverage denominator | R9 (High) | New **FR-TSD-022**; FR-TSD-010 capture modes; §5.2.19 offline fields |
| 17 | Content & assessment-item model | R12 (Med) | New **FR-TSD-021**; entities `lms_content_packages`, `assessment_items` |
| 18 | Resolve budget-dimension mismatch (canonical key) | R14 (Med) | §5.6 rule 7 rewritten with worked example; FR-TSD-016 canonical reconciliation = org_unit + FY |
| 19 | Vendor/external-trainer empanelment & procurement linkage | R15 (Med) | New **FR-TSD-019**; entity `vendor_empanelments`; `training_costs.vendor_empanelment_id` |
| 20 | Sponsorship / study-leave / deputation & service-obligation | R15 (Med) | New **FR-TSD-020**; entity `training_sponsorships` |
| 21 | DPDP retention/erasure for learning PII at exit | R13 (Med) | New **FR-TSD-023**; ledger `learning_data_retention_actions`; §9 Privacy |
| 22 | Behavioural anchors to proficiency levels + self-assess guidance | — (signal quality) | §5.2.3 mandatory `descriptor`; FR-TSD-001/003 UI inline help |
| 23 | Extend accessibility NFR to content (tests, SCORM) | R16 (Low) | §9 Accessibility; FR-TSD-021 AC; FR-TSD-011 |
| 24 | Explicit waitlist position + fairness audit | — (auditability) | §5.2.18 `waitlist_position`; FR-TSD-009 AC.6; §11.1 |
| 25 | Resequence build plan around statutory spine | — (delivery) | §15.2 wave plan reordered; §14.2 cutover; §3.8-equivalent in §15 |

---

## 2. Scope & Boundaries

### 2.1 In scope
1. Skill taxonomy and competency framework (categories, skills, competencies, proficiency-level catalog **with behavioural anchors**).
2. Role-based competency models with required proficiency targets, **scope key for ROLE**, **review cadence and ownership**.
3. Per-employee skill inventory with self/manager/validated assessment, **currency/expiry and freshness/decay**.
4. **Incremental** skill-gap analysis vs competency model and reconciled with M08 appraisal development gaps; **binary critical/non-critical at launch**, weighted scoring feature-flagged.
5. Training needs identification, consolidation, and prioritisation.
6. Annual training calendar and plan with budget allocation (**canonical org-unit + FY reconciliation key**).
7. Course catalog and program management: internal, external, e-learning/LMS, blended, micro-learning.
8. **Content & assessment-item management**: SCORM/xAPI content packages, versions, item banks, accessibility metadata.
9. Session/batch scheduling, trainer management, venue management, capacity and waitlist (**with persisted waitlist position**).
10. Nomination and multi-level approval workflow (maker-checker, budget sanction).
11. **Mandatory-compliance campaign engine**: bulk/wave nomination, rolling renewal, escalation, coverage tracking.
12. Attendance capture (per session/day) including **proxy/kiosk/assisted and offline-sync** capture for non-login staff; pre/post assessment; Kirkpatrick L1–L4 (L3/L4 optional/sampled/programme-level).
13. Certification issuance, validity, **enforced** renewal/recertification with auto re-nomination; lapsed-mandatory flag.
14. **External & professional credential capture with issuer verification.**
15. Induction/onboarding training.
16. Learning paths, skill-based recommendations, CPD/credit tracking, skills marketplace (Phase-2 feature-flagged).
17. **Vendor/external-trainer empanelment & procurement linkage.**
18. **Sponsorship / study-leave / deputation with service-bond obligation tracking.**
19. LMS/LRS integration (SCORM 1.2/2004 via reporting-API poll; xAPI via LRS) enrollment and completion sync.
20. Training budget and cost tracking (planned vs committed vs actual; **cost-per-completion**).
21. Posting of significant trainings/qualifications to the Digital Service Register (M12) using a **pinned event contract** and an explicit **`is_significant` rule set**.
22. **DPDP retention/erasure of learning PII** at employee exit.
23. **Published Gap Contract** consumed by M06/M08.

### 2.2 Out of scope (owned elsewhere)
- Employee master record and job data → **M01-EPM**.
- Appraisal goals, ratings, and the development-gap source data → **M08-PAM** (M07 consumes a read-only feed via the pinned contract).
- Promotion/seniority decisions that may consider training → **M06-PPP** (M07 supplies certification + Gap Contract data; decision is M06).
- Payroll disbursement of training reimbursements and sponsorship recoveries → **M10-PAY** (M07 supplies an approved-cost / bond-recovery payable feed only).
- Statutory SR ledger itself → **M12-SR** (M07 writes events; M12 owns the ledger and the event-contract authority).
- Document binary storage and encryption → **M13-DMS** (M07 stores `document_id` references).
- Cross-module executive dashboards → **M14-DAS** (M07 exposes datamarts/queries).
- **Procurement/tendering workflow itself** → external procurement system (M07 stores empanelment + contract references only).

### 2.3 Feature Module Map
| Feature group | Capability | Primary FRs |
|---|---|---|
| Competency framework | Taxonomy, competencies, proficiency levels w/ anchors, governed competency models | FR-TSD-001, FR-TSD-002 |
| Skill inventory & gaps | Employee skills, freshness, assessments, incremental gap analysis | FR-TSD-003, FR-TSD-004 |
| Planning | Needs identification, annual plan/calendar, budget allocation | FR-TSD-005, FR-TSD-006 |
| Catalog & content | Programs, content/assessment-item assets | FR-TSD-007, FR-TSD-021 |
| Delivery logistics | Sessions, trainers, venues, vendor empanelment | FR-TSD-008, FR-TSD-019 |
| Enrolment | Nomination & approval workflow | FR-TSD-009 |
| Statutory volume | Mandatory-compliance campaign engine | FR-TSD-017 |
| Execution | Attendance (incl. proxy/kiosk/offline), assessment, feedback | FR-TSD-010, FR-TSD-011, FR-TSD-022 |
| Compliance & credentials | Certification/renewal (enforced), induction, external credentials | FR-TSD-012, FR-TSD-013, FR-TSD-018 |
| Modern learning | Learning paths, recommendations, CPD, marketplace (Phase 2) | FR-TSD-014 |
| Integration | LMS/LRS SCORM/xAPI sync; Gap Contract publication | FR-TSD-015, FR-TSD-024 |
| Statutory & finance | SR posting, budget/cost tracking, sponsorship/bond | FR-TSD-016, FR-TSD-020 |
| Data governance | DPDP retention/erasure of learning PII | FR-TSD-023 |

### 2.4 Common Capabilities (inherited, applied throughout)
- **Audit:** every create/update/state-change writes to `audit_log` (FR-agnostic), including **FIFO waitlist promotions** and **campaign wave assignments**.
- **Soft delete:** `is_deleted` on all non-ledger entities; ledgers (assessment results, SR events, credential verifications, retention actions) are append-only.
- **Maker-checker:** nominations, budget changes, certificate revocation, credential verification override, vendor empanelment, sponsorship sanction, and master-data publication route through `workflow_instances`/`workflow_tasks`.
- **RBAC + row-level scoping:** all queries scoped by `org_unit_id` subtree of the actor.
- **Pagination:** all list endpoints paginated, hard max page size 100.
- **i18n / locale:** UTC storage, `DD-MMM-YYYY` display, INR currency default, banker's rounding to paise (see §5.6 rule 16).
- **Notifications:** state transitions raise `notifications` ledger entries (email/SMS/in-app).
- **Documents:** all uploads (certificates, materials, attendance sheets, invoices, verification evidence) reference `documents.document_id` (M13).

### 2.5 Capability phasing & feature flags (developmental layer gating)
The statutory spine ships **on by default**. The developmental layer is **feature-flagged** and gated on **framework-curation evidence** (≥ 80% of in-scope competency models within review-due date for the org-unit).

| Capability | Flag | Default at launch | Gate to enable |
|---|---|---|---|
| Binary critical/non-critical gap | (always on) | ON | — |
| Weighted decimal gap scoring | `ff.gap.weighted` | OFF | Curation evidence + L&D Manager sign-off |
| AI/rule recommendation engine | `ff.recommendations` | OFF | Curation evidence |
| Skills marketplace | `ff.marketplace` | OFF | Curation evidence + DPDP opt-in live |
| CPD targets (vs tracking) | `ff.cpd.targets` | OFF | Phase 2 |
| LRS/xAPI ingestion | `ff.lms.lrs` | OFF | LRS provisioned & round-trip validated |

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict §4 of Foundation)
| Role | Description |
|---|---|
| **Employee (Self-Service)** | View own skill inventory, gaps, learning path; self-assess skills; express interest/self-nominate; attend e-learning; view own certificates, external credentials, and CPD. |
| **Reporting Manager** | Validate direct reports' skills; recommend/approve nominations (L1); view team gaps and plan; act as proxy assessor for non-login reports. |
| **L&D Officer (HR)** | Manage catalog, content, sessions, trainers, venues; identify/consolidate needs; build plan; record attendance/assessment; issue certificates; run campaigns; capture/verify external credentials. |
| **L&D Manager / Training Head** | Approve annual plan and budget; final-approve nominations (L2); approve budget sanction; approve certificate revocation; launch/approve campaigns; enable weighted scoring flag. |
| **Department Head / Appointing Authority** | Sanction departmental nominations and budget where required by policy; sanction sponsorships. |
| **Trainer / Facilitator** | View assigned sessions and rosters; mark attendance; enter assessment scores; close session. (Internal trainers are `users`; external trainers are empanelled vendor logins or proxied by L&D Officer.) |
| **Finance / Budget Controller** | Define and monitor training budgets; reconcile committed vs actual; approve bond recoveries to payroll feed. |
| **Kiosk / Assisted-Capture Operator** | Operate shared kiosk or assisted-capture station for non-login staff: launch e-learning, capture attendance/self-assessment on behalf, with attributed audit. |
| **Vendor / Empanelment Manager** | Maintain vendor empanelment records, contracts, and procurement references; cannot approve own empanelment. |
| **SR Custodian / Registrar (M12)** | Receives/validates SR postings of significant trainings; cannot edit M07 records. |
| **Data Protection Officer (DPO)** | Approve/execute DPDP erasure and retention overrides for learning PII. |
| **Auditor (read-only)** | Cross-module read + audit log; no write. |
| **System Administrator** | Configure taxonomy publication, enums, LMS/LRS integration, feature flags, RBAC; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-delete/Disable, A=Approve, X=Execute/Operate)
| Capability \ Role | Emp | Mgr | L&D Off | L&D Mgr | Dept Head | Trainer | Finance | Kiosk Op | Vendor Mgr | DPO | SR Cust. | Auditor | SysAdmin |
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
| Vendor empanelment | – | – | C R U | A | R | – | R | – | C R U | – | – | R | – |
| Nomination | C(self) R | C A(L1) | C R U | A(L2) | A | – | – | X(assist) | – | – | – | R | – |
| Campaign | – | R | C R U X | A | A(dept) | – | – | – | – | – | – | R | – |
| Budget definition | R | – | R | A | R | R | C R U | – | – | – | – | R | – |
| Attendance (incl. offline/kiosk) | R(own) | R(team) | C R U X | R | R | C R U X | – | X | – | – | – | R | – |
| Assessment scores | R(own) | R(team) | C R U | R | – | C R U | – | – | – | – | – | R | – |
| Feedback (Kirkpatrick) | C(own) R | R | R U(analysis) | R | R | R | – | – | – | – | – | R | – |
| Certification issue | R(own) | R | C R U | A | R | – | – | – | – | – | R(posted) | R | – |
| External credential capture/verify | C(own) R | R | C R U A(verify) | A | – | – | – | – | – | – | R(posted) | R | – |
| Certificate revoke | – | – | C(request) | A | – | – | – | – | – | – | – | R | – |
| Sponsorship / service-bond | C(request) R | A(recommend) | C R U | A | A | – | A(recovery) | – | – | – | – | R | – |
| CPD / learning path | R U(self) | R | C R U | A | R | – | – | – | – | – | – | R | – |
| LMS/LRS integration config | – | – | R | R | – | – | – | – | – | – | – | R | C R U |
| SR posting | – | – | X(trigger) | A | – | – | – | – | – | – | R(receive) | R | – |
| Cost entry / reconciliation | R(own) | R | C R U | A | R | R | C R U A | – | – | – | – | R | – |
| DPDP erasure / retention override | R(own) | – | R | R | – | – | – | – | – | C A X | R(posted) | R | – |
| Feature flags | – | – | – | A(weighted) | – | – | – | – | – | – | – | R | C R U |

Segregation-of-duties is enforced everywhere: **maker ≠ checker**, no self-approval of one's own nomination, budget sanctioner ≠ cost recorder, vendor empanelment requester ≠ approver, credential self-capture ≠ verifier, DPO erasure approver ≠ requester.

---

## 4. Shared Application Foundation

M07-TSD inherits the §5 technical defaults of the Foundation:
- **Frontend:** React + TypeScript, Tailwind + shadcn/ui, WCAG 2.1 AA — **extended in v2 to assessment content and hosted/authored e-learning, not only screens** (§9).
- **API:** REST under `/api/v1`, canonical error envelope, standard error codes plus module-specific codes (see §10).
- **Datastore:** PostgreSQL primary; object storage for documents via M13; **xAPI statements persisted in / proxied through a Learning Record Store (LRS)** (see FR-TSD-015).
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org-unit scoping; **kiosk/assisted sessions use an attributed operator principal**.
- **Workflow:** shared `workflow_instances`/`workflow_tasks` engine for maker-checker and multi-level approvals.
- **Audit:** every state change writes immutable `audit_log`.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, India DPDP Act 2023 alignment (**incl. learning-PII erasure at exit**), statutory retention.
- **Integration bus:** asynchronous, idempotent event publication to M12-SR and M10-PAY; consumes M08-PAM development-gap feed and M01 employee master/joiner via internal APIs/events governed by **pinned contracts** (§10.6).

**Shared entities referenced (not redefined):** `employees` (M01), `org_units`, `users`, `roles`, `designations`, `cadres`, `audit_log`, `documents` (M13), `notifications`, `service_register_events` (M12), `workflow_instances`/`workflow_tasks`.

---

## 5. Holistic Data Model

### 5.1 Entity inventory
v1 had 28 module entities; v2 adds 9 (entities 29–37) and amends several existing ones. New/amended entities are flagged.

| # | Entity | Type | Owner | Description |
|---|---|---|---|---|
| 1 | `skill_categories` | Master | M07 | Top-level grouping of the skill taxonomy. |
| 2 | `skills` | Master | M07 | Atomic skill; **+`revalidation_interval_months` (v2)**. |
| 3 | `proficiency_levels` | Master | M07 | Ordered proficiency scale; **`descriptor` now mandatory behavioural anchor (v2)**. |
| 4 | `competencies` | Master | M07 | Higher-order competency definitions. |
| 5 | `competency_models` | Master | M07 | Role/designation-scoped model header; **+`role_id`, `review_due_date`, `owner_id` (v2)**. |
| 6 | `competency_model_items` | Master | M07 | Required competency + target proficiency lines. |
| 7 | `employee_skills` | Transactional | M07 | Per-employee inventory; **+`last_validated_at`, `freshness_status` (v2)**. |
| 8 | `skill_assessments` | Append-only | M07 | History of skill assessment events. |
| 9 | `skill_gap_analyses` | Transactional | M07 | Computed gap snapshot; **+`scoring_mode` (BINARY/WEIGHTED) (v2)**. |
| 10 | `skill_gap_items` | Transactional | M07 | Per-competency gap lines; **`source` enum normalised (v2)**. |
| 11 | `training_needs` | Transactional | M07 | Identified training need. |
| 12 | `annual_training_plans` | Transactional | M07 | Yearly plan header per org unit / FY. |
| 13 | `training_plan_items` | Transactional | M07 | Planned program lines. |
| 14 | `training_programs` | Master | M07 | Course catalog entry. |
| 15 | `training_sessions` | Transactional | M07 | Scheduled batch/session. |
| 16 | `trainers` | Master | M07 | Internal/external trainer profiles. |
| 17 | `venues` | Master | M07 | Physical/virtual venues. |
| 18 | `training_nominations` | Transactional | M07 | Enrollment + workflow; **+`waitlist_position`, `training_campaign_id` (v2)**. |
| 19 | `training_attendance` | Transactional | M07 | Per-day attendance; **`marked_by` de-polymorphised; +`capture_mode`, offline-sync fields (v2)**. |
| 20 | `training_assessments` | Append-only | M07 | Pre/post results; **`assessed_by` de-polymorphised (v2)**. |
| 21 | `training_feedback` | Append-only | M07 | Kirkpatrick L1–L4; **L3/L4 scope clarified (v2)**. |
| 22 | `certifications` | Transactional | M07 | Issued certs; **+external-credential fields, `lapsed_mandatory` (v2)**. |
| 23 | `training_budgets` | Transactional | M07 | Budget per org unit / FY / category (category now reporting-only). |
| 24 | `training_costs` | Transactional | M07 | Cost entries; **+`vendor_empanelment_id`, `training_sponsorship_id` (v2)**. |
| 25 | `learning_paths` | Master | M07 | Curated/recommended program sequence. |
| 26 | `learning_path_items` | Master | M07 | Ordered steps in a path. |
| 27 | `cpd_records` | Append-only | M07 | CPD credits earned. |
| 28 | `lms_enrollments` | Transactional | M07 | LMS/LRS sync metadata; **+`learning_record_store_id`, `lms_content_package_id`, `sync_mode` (v2)**. |
| 29 | `training_campaigns` *(new)* | Transactional | M07 | Mandatory-compliance campaign header: scope, program, window, renewal cadence. |
| 30 | `campaign_targets` *(new)* | Transactional | M07 | Per-employee target line within a campaign with status + wave assignment. |
| 31 | `learning_record_stores` *(new)* | Master/Config | M07 | LRS / LMS connector configuration (endpoint, standard, auth, sync mode). |
| 32 | `lms_content_packages` *(new)* | Master | M07 | Versioned SCORM/xAPI content package / hosted asset with accessibility metadata. |
| 33 | `assessment_items` *(new)* | Master | M07 | Item bank: questions, options, correct keys, accessibility metadata, versions. |
| 34 | `vendor_empanelments` *(new)* | Master | M07 | External provider/trainer empanelment, contract & procurement reference. |
| 35 | `training_sponsorships` *(new)* | Transactional | M07 | Sponsored long-duration/study-leave/deputation with service-bond obligation. |
| 36 | `credential_verifications` *(new, append-only)* | Append-only | M07 | Verification trail for external/professional credentials. |
| 37 | `learning_data_retention_actions` *(new, append-only)* | Append-only | M07 | DPDP retention/erasure actions on learning PII at exit. |

### 5.2 Field tables
> Audit fields (`created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`) apply to every non-ledger entity per Foundation §3 and are abbreviated as "audit fields". Append-only ledgers carry only `created_at`, `created_by`. Only **new or changed** field tables are reproduced in full below; unchanged v1 tables (`skill_categories`, `competencies`, `competency_model_items`, `skill_assessments`, `skill_gap_analyses` header, `training_needs`, `annual_training_plans`, `training_plan_items`, `training_programs`, `training_sessions`, `trainers`, `venues`, `training_budgets`, `learning_paths`, `learning_path_items`, `cpd_records`) are inherited verbatim from v1 §5.2 and are not redefined.

#### 5.2.2 `skills` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_id` | UUID | PK | |
| `skill_category_id` | UUID | FK→skill_categories, NOT NULL | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `description` | TEXT | | |
| `is_compliance_skill` | BOOLEAN | DEFAULT false | Maps to mandatory training |
| `default_validity_months` | INT | NULL | For renewable compliance skills |
| `revalidation_interval_months` | INT | NULL | **(v2)** Freshness window for non-compliance skills; NULL = never decays |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.3 `proficiency_levels` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `proficiency_level_id` | UUID | PK | |
| `level_order` | INT | UNIQUE, NOT NULL | 1..N contiguous ascending |
| `code` | VARCHAR(20) | UNIQUE, NOT NULL | `L1`..`L5` |
| `name` | VARCHAR(60) | NOT NULL | Awareness/Working/Proficient/Advanced/Expert |
| `descriptor` | TEXT | **NOT NULL (v2)** | Concrete behavioural anchor; required so self-assessment yields signal not noise |
| `status` | ENUM | NOT NULL | PUBLISHED, ARCHIVED |
| audit fields | — | | |

#### 5.2.5 `competency_models` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `competency_model_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `scope_type` | ENUM | NOT NULL | DESIGNATION, CADRE, ROLE, ORG_UNIT, GENERIC |
| `designation_id` | UUID | FK→designations, NULL | When scope=DESIGNATION |
| `role_id` | UUID | FK→roles, NULL | **(v2)** When scope=ROLE — closes the unsatisfiable-scope defect |
| `cadre` | VARCHAR(60) | NULL | When scope=CADRE |
| `org_unit_id` | UUID | FK→org_units, NULL | When scope=ORG_UNIT |
| `owner_id` | UUID | FK→employees, NOT NULL | **(v2)** Accountable steward for currency |
| `review_due_date` | DATE | NOT NULL | **(v2)** Next mandatory review; drives staleness alarm |
| `effective_from` | DATE | NOT NULL | |
| `effective_to` | DATE | NULL | |
| `version` | INT | NOT NULL DEFAULT 1 | |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, ARCHIVED |
| audit fields | — | | |
| CHECK | — | exactly one of (`designation_id`,`role_id`,`cadre`,`org_unit_id`) is non-null per `scope_type`; all null only when GENERIC | **(v2)** |

#### 5.2.7 `employee_skills` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `employee_skill_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `skill_id` | UUID | FK→skills, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `source` | ENUM | NOT NULL | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `validated_by` | UUID | FK→employees, NULL | Manager/L&D validator |
| `validated_at` | TIMESTAMP | NULL | |
| `last_validated_at` | TIMESTAMP | NULL | **(v2)** Last time proficiency was affirmed; basis for freshness |
| `acquired_on` | DATE | NULL | |
| `expires_on` | DATE | NULL | Currency for renewable skills |
| `freshness_status` | ENUM | NOT NULL DEFAULT 'FRESH' | **(v2)** FRESH, STALE, EXPIRED — derived nightly from `revalidation_interval_months`/`expires_on` |
| `status` | ENUM | NOT NULL | DECLARED, VALIDATED, EXPIRED, REVOKED |
| UNIQUE(`employee_id`,`skill_id`) | — | | One current row per skill |
| audit fields | — | | |

#### 5.2.9 `skill_gap_analyses` (amended header)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_analysis_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `competency_model_id` | UUID | FK→competency_models, NOT NULL | |
| `scoring_mode` | ENUM | NOT NULL DEFAULT 'BINARY' | **(v2)** BINARY (launch) or WEIGHTED (feature-flagged) |
| `appraisal_cycle_ref` | VARCHAR(40) | NULL | M08 cycle id reconciled; `UNAVAILABLE` in degraded mode |
| `model_stale_flag` | BOOLEAN | DEFAULT false | **(v2)** true if model past `review_due_date` at compute time |
| `stale_skill_count` | INT | DEFAULT 0 | **(v2)** count of inputs discounted for staleness |
| `overall_gap_score` | NUMERIC(6,2) | NULL | Only populated when `scoring_mode=WEIGHTED` |
| `critical_gap_count` | INT | DEFAULT 0 | |
| `generated_on` | TIMESTAMP | NOT NULL | |
| `recompute_trigger` | ENUM | NOT NULL | FULL, INCREMENTAL_SKILL_EVENT, INCREMENTAL_MODEL_EVENT, ON_DEMAND |
| `status` | ENUM | NOT NULL | DRAFT, FINALIZED, SUPERSEDED |
| audit fields | — | | |

#### 5.2.10 `skill_gap_items` (amended — enum normalised)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `skill_gap_item_id` | UUID | PK | |
| `skill_gap_analysis_id` | UUID | FK→skill_gap_analyses, NOT NULL | |
| `competency_id` | UUID | FK→competencies, NOT NULL | |
| `target_proficiency_level_id` | UUID | FK→proficiency_levels, NOT NULL | |
| `current_proficiency_level_id` | UUID | FK→proficiency_levels, NULL | NULL = no current skill |
| `gap_size` | INT | NOT NULL | target_order − current_order (≥0) |
| `is_critical` | BOOLEAN | DEFAULT false | |
| `weight_applied` | NUMERIC(5,2) | NULL | Only when WEIGHTED mode (Phase 2) |
| `discounted_for_staleness` | BOOLEAN | DEFAULT false | **(v2)** current skill was STALE and excluded from closure |
| `source` | ENUM | NOT NULL | **(v2 normalised)** GAP_ANALYSIS, APPRAISAL, MANDATORY — 1:1 with `training_needs.source` |
| audit fields | — | | |

#### 5.2.18 `training_nominations` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_nomination_id` | UUID | PK | |
| `training_session_id` | UUID | FK→training_sessions, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_need_id` | UUID | FK→training_needs, NULL | Traceability to need |
| `training_campaign_id` | UUID | FK→training_campaigns, NULL | **(v2)** set when created by a campaign wave |
| `nomination_type` | ENUM | NOT NULL | SELF, MANAGER, HR, MANDATORY, INDUCTION, CAMPAIGN |
| `nominated_by` | UUID | FK→employees, NOT NULL | |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| `status` | ENUM | NOT NULL | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `waitlist_position` | INT | NULL | **(v2)** persisted FIFO rank when WAITLISTED; NULL otherwise; promotion logged to audit |
| `estimated_cost` | NUMERIC(12,2) | DEFAULT 0 | |
| `completion_status` | ENUM | NULL | PASS, FAIL, INCOMPLETE |
| UNIQUE(`training_session_id`,`employee_id`) | — | | No duplicate enrolment |
| audit fields | — | | |

#### 5.2.19 `training_attendance` (amended — de-polymorphised + offline)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_attendance_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `session_date` | DATE | NOT NULL | One row per training day |
| `attendance_status` | ENUM | NOT NULL | PRESENT, ABSENT, LATE, EXCUSED |
| `check_in_at` | TIMESTAMP | NULL | |
| `check_out_at` | TIMESTAMP | NULL | |
| `marked_by_actor_type` | ENUM | NOT NULL | **(v2)** EMPLOYEE, TRAINER, KIOSK_OPERATOR — discriminator replaces polymorphic FK |
| `marked_by_actor_id` | UUID | NOT NULL | **(v2)** resolves to employees / trainers / users per actor_type |
| `capture_mode` | ENUM | NOT NULL DEFAULT 'ONLINE' | **(v2)** ONLINE, KIOSK, ASSISTED, OFFLINE_SYNC, LMS_DERIVED |
| `offline_captured_at` | TIMESTAMP | NULL | **(v2)** device timestamp when captured offline |
| `offline_sync_batch_id` | UUID | NULL | **(v2)** buffer/sync batch reference for reconciliation |
| `evidence_document_id` | UUID | FK→documents, NULL | Signed sheet |
| UNIQUE(`training_nomination_id`,`session_date`) | — | | |
| audit fields | — | | |

#### 5.2.20 `training_assessments` (amended — de-polymorphised, append-only)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_assessment_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `assessment_phase` | ENUM | NOT NULL | PRE, POST, REASSESSMENT |
| `max_score` | NUMERIC(6,2) | NOT NULL | |
| `obtained_score` | NUMERIC(6,2) | NOT NULL | 0 ≤ obtained ≤ max |
| `pass_threshold` | NUMERIC(6,2) | NOT NULL | |
| `result` | ENUM | NOT NULL | PASS, FAIL |
| `assessed_by_actor_type` | ENUM | NOT NULL | **(v2)** EMPLOYEE, TRAINER, SYSTEM (LMS-graded) |
| `assessed_by_actor_id` | UUID | NOT NULL | **(v2)** |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.22 `certifications` (amended — external credentials + enforced validity)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `certification_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `credential_source` | ENUM | NOT NULL DEFAULT 'INTERNAL_PROGRAM' | **(v2)** INTERNAL_PROGRAM, EXTERNAL_PROFESSIONAL |
| `training_program_id` | UUID | FK→training_programs, NULL | NULL allowed for external credentials |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `certificate_no` | VARCHAR(50) | UNIQUE, NOT NULL | Human-readable |
| `title` | VARCHAR(200) | NOT NULL | |
| `issuing_authority` | VARCHAR(150) | NOT NULL | Internal authority |
| `issuing_body` | VARCHAR(150) | NULL | **(v2)** External body (e.g., PMI, ISACA) when EXTERNAL_PROFESSIONAL |
| `external_reference_no` | VARCHAR(80) | NULL | **(v2)** External credential/licence number |
| `verification_status` | ENUM | NOT NULL DEFAULT 'NOT_REQUIRED' | **(v2)** NOT_REQUIRED, PENDING, VERIFIED, REJECTED |
| `verified_by` | UUID | FK→employees, NULL | **(v2)** L&D verifier |
| `verification_evidence_document_id` | UUID | FK→documents, NULL | **(v2)** |
| `issue_date` | DATE | NOT NULL | |
| `valid_until` | DATE | NULL | NULL = lifetime |
| `is_mandatory` | BOOLEAN | DEFAULT false | |
| `lapsed_mandatory` | BOOLEAN | DEFAULT false | **(v2)** true when a mandatory cert expires un-renewed; consumed by M06 sensitive-duty checks |
| `renewal_need_id` | UUID | FK→training_needs, NULL | **(v2)** auto-created renewal need on expiry |
| `certificate_document_id` | UUID | FK→documents, NULL | |
| `sr_posting_status` | ENUM | NOT NULL | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `service_register_event_id` | UUID | FK→service_register_events, NULL | M12 ref after posting |
| `status` | ENUM | NOT NULL | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |
| audit fields | — | | |

#### 5.2.24 `training_costs` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_cost_id` | UUID | PK | |
| `training_budget_id` | UUID | FK→training_budgets, NOT NULL | |
| `training_session_id` | UUID | FK→training_sessions, NULL | |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | |
| `vendor_empanelment_id` | UUID | FK→vendor_empanelments, NULL | **(v2)** external costs tie to an empanelled vendor |
| `training_sponsorship_id` | UUID | FK→training_sponsorships, NULL | **(v2)** sponsorship/bond cost linkage |
| `cost_type` | ENUM | NOT NULL | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, SPONSORSHIP, BOND_RECOVERY, OTHER |
| `amount` | NUMERIC(12,2) | NOT NULL | |
| `cost_stage` | ENUM | NOT NULL | COMMITTED, ACTUAL |
| `payable_to_payroll` | BOOLEAN | DEFAULT false | Reimbursement/bond-recovery → M10 feed |
| `invoice_document_id` | UUID | FK→documents, NULL | |
| `status` | ENUM | NOT NULL | DRAFT, APPROVED, PAID, CANCELLED |
| audit fields | — | | |

#### 5.2.28 `lms_enrollments` (amended)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `lms_enrollment_id` | UUID | PK | |
| `training_nomination_id` | UUID | FK→training_nominations, NOT NULL | |
| `learning_record_store_id` | UUID | FK→learning_record_stores, NOT NULL | **(v2)** which LRS/LMS connector |
| `lms_content_package_id` | UUID | FK→lms_content_packages, NULL | **(v2)** hosted package version launched |
| `sync_mode` | ENUM | NOT NULL | **(v2)** XAPI_LRS, SCORM_POLL, MANUAL — replaces implied webhook push |
| `lms_course_ref` | VARCHAR(120) | NOT NULL | |
| `lms_user_ref` | VARCHAR(120) | NOT NULL | |
| `standard` | ENUM | NOT NULL | SCORM_12, SCORM_2004, XAPI, NONE |
| `progress_pct` | NUMERIC(5,2) | DEFAULT 0 | 0–100 |
| `completion_status` | ENUM | NOT NULL | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |
| `score` | NUMERIC(6,2) | NULL | |
| `last_synced_at` | TIMESTAMP | NULL | |
| `last_poll_cursor` | VARCHAR(120) | NULL | **(v2)** SCORM reporting-API poll cursor |
| `lms_statement_id` | VARCHAR(120) | NULL | xAPI statement / idempotency key |
| audit fields | — | | |

#### 5.2.29 `training_campaigns` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_campaign_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | e.g., `CAMP-CYBER-2026` |
| `name` | VARCHAR(200) | NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | The mandatory program |
| `scope_type` | ENUM | NOT NULL | ORG_UNIT, CADRE, DESIGNATION, ALL_STAFF |
| `scope_ref` | VARCHAR(64) | NULL | org_unit_id / cadre / designation_id; NULL for ALL_STAFF |
| `financial_year` | VARCHAR(9) | NOT NULL | |
| `window_start` | DATE | NOT NULL | Completion window opens |
| `window_end` | DATE | NOT NULL | Statutory deadline |
| `renewal_cadence_months` | INT | NULL | Rolling renewal interval (e.g., 12); NULL = one-off |
| `auto_wave` | BOOLEAN | DEFAULT true | Auto-schedule targets into capacity-bounded sessions |
| `wave_size` | INT | NULL | Max participants per wave/session |
| `escalation_policy_json` | JSONB | NULL | Lead times + escalation chain |
| `coverage_denominator_rule` | ENUM | NOT NULL | ELIGIBLE_ALL, EXCLUDE_LONG_LEAVE, EXCLUDE_NON_LOGIN_UNMAPPED, CUSTOM |
| `status` | ENUM | NOT NULL | DRAFT, APPROVED, RUNNING, PAUSED, COMPLETED, CANCELLED |
| `approved_by` | UUID | FK→employees, NULL | |
| audit fields | — | | |

#### 5.2.30 `campaign_targets` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `campaign_target_id` | UUID | PK | |
| `training_campaign_id` | UUID | FK→training_campaigns, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `is_eligible` | BOOLEAN | DEFAULT true | Per coverage denominator rule |
| `exemption_reason` | VARCHAR(120) | NULL | When not eligible |
| `wave_no` | INT | NULL | Assigned wave |
| `training_nomination_id` | UUID | FK→training_nominations, NULL | Created nomination |
| `target_status` | ENUM | NOT NULL | PENDING, NOMINATED, IN_PROGRESS, COMPLETED, OVERDUE, EXEMPT, FAILED |
| `due_date` | DATE | NOT NULL | Derived from campaign/renewal |
| `escalation_level` | INT | DEFAULT 0 | 0..N |
| UNIQUE(`training_campaign_id`,`employee_id`) | — | | |
| audit fields | — | | |

#### 5.2.31 `learning_record_stores` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_record_store_id` | UUID | PK | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(150) | NOT NULL | |
| `connector_type` | ENUM | NOT NULL | LRS_XAPI, LMS_REPORTING_API, SCORM_SELF_HOSTED |
| `is_primary` | BOOLEAN | DEFAULT false | Single-LMS-of-record decision; exactly one primary |
| `endpoint_url` | VARCHAR(300) | NOT NULL | |
| `auth_secret_ref` | VARCHAR(120) | NOT NULL | Secret stored via env/secret manager, never in DB plaintext |
| `poll_interval_minutes` | INT | NULL | For LMS_REPORTING_API |
| `supported_standards` | TEXT | NOT NULL | CSV of SCORM_12/SCORM_2004/XAPI |
| `status` | ENUM | NOT NULL | ACTIVE, INACTIVE |
| audit fields | — | | |

#### 5.2.32 `lms_content_packages` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `lms_content_package_id` | UUID | PK | |
| `training_program_id` | UUID | FK→training_programs, NOT NULL | |
| `package_version` | VARCHAR(20) | NOT NULL | Semantic version |
| `standard` | ENUM | NOT NULL | SCORM_12, SCORM_2004, XAPI |
| `hosting` | ENUM | NOT NULL | SELF_HOSTED, EXTERNAL_LMS |
| `package_document_id` | UUID | FK→documents, NULL | Stored package binary (M13) when self-hosted |
| `launch_url_template` | VARCHAR(300) | NULL | |
| `wcag_conformance` | ENUM | NOT NULL | AA, A, NON_CONFORMANT, UNKNOWN |
| `accessibility_notes` | TEXT | NULL | **(v2)** content-accessibility metadata |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, RETIRED |
| UNIQUE(`training_program_id`,`package_version`) | — | | |
| audit fields | — | | |

#### 5.2.33 `assessment_items` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `assessment_item_id` | UUID | PK | |
| `training_program_id` | UUID | FK→training_programs, NULL | Bank may be program-scoped or shared |
| `item_bank_code` | VARCHAR(40) | NOT NULL | Logical grouping |
| `question_text` | TEXT | NOT NULL | |
| `item_type` | ENUM | NOT NULL | SINGLE_CHOICE, MULTI_CHOICE, TRUE_FALSE, NUMERIC, FREE_TEXT |
| `options_json` | JSONB | NULL | Options for choice items |
| `correct_key_json` | JSONB | NULL | Correct answer key (RBAC-restricted) |
| `max_score` | NUMERIC(6,2) | NOT NULL DEFAULT 1 | |
| `wcag_conformance` | ENUM | NOT NULL | AA, A, NON_CONFORMANT, UNKNOWN |
| `version` | INT | NOT NULL DEFAULT 1 | |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED, RETIRED |
| audit fields | — | | |

#### 5.2.34 `vendor_empanelments` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `vendor_empanelment_id` | UUID | PK | |
| `vendor_name` | VARCHAR(200) | NOT NULL | |
| `trainer_id` | UUID | FK→trainers, NULL | When empanelment is a specific external trainer |
| `empanelment_ref` | VARCHAR(80) | UNIQUE, NOT NULL | Empanelment/registration number |
| `contract_ref` | VARCHAR(80) | NULL | Contract document reference |
| `contract_document_id` | UUID | FK→documents, NULL | |
| `procurement_ref` | VARCHAR(80) | NULL | External procurement/tender reference |
| `valid_from` | DATE | NOT NULL | |
| `valid_until` | DATE | NULL | |
| `rate_card_json` | JSONB | NULL | Agreed rates |
| `status` | ENUM | NOT NULL | DRAFT, PENDING_APPROVAL, EMPANELLED, SUSPENDED, EXPIRED, BLACKLISTED |
| `approved_by` | UUID | FK→employees, NULL | ≠ requester |
| audit fields | — | | |

#### 5.2.35 `training_sponsorships` *(new)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `training_sponsorship_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `training_program_id` | UUID | FK→training_programs, NULL | Or free-text external course |
| `external_course_name` | VARCHAR(200) | NULL | When not catalog |
| `sponsorship_type` | ENUM | NOT NULL | STUDY_LEAVE, DEPUTATION, DEGREE, EXTERNAL_COURSE |
| `sponsored_amount` | NUMERIC(14,2) | NOT NULL DEFAULT 0 | |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NULL | |
| `service_bond_months` | INT | NOT NULL DEFAULT 0 | Obligation duration |
| `bond_end_date` | DATE | NULL | Derived: completion + bond_months |
| `bond_recovery_amount` | NUMERIC(14,2) | NULL | Liquidated on breach |
| `obligation_status` | ENUM | NOT NULL | PROPOSED, SANCTIONED, ACTIVE, FULFILLED, BREACHED, RECOVERED, WAIVED |
| `sanctioned_by` | UUID | FK→employees, NULL | Dept Head/Authority |
| audit fields | — | | |

#### 5.2.36 `credential_verifications` *(new, append-only)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `credential_verification_id` | UUID | PK | |
| `certification_id` | UUID | FK→certifications, NOT NULL | |
| `verification_action` | ENUM | NOT NULL | SUBMITTED, EVIDENCE_REVIEWED, VERIFIED, REJECTED, RE_VERIFIED |
| `verification_method` | ENUM | NOT NULL | DOCUMENT, ISSUER_PORTAL, THIRD_PARTY, MANUAL_ATTEST |
| `evidence_document_id` | UUID | FK→documents, NULL | |
| `actor_id` | UUID | FK→employees, NOT NULL | |
| `comments` | TEXT | NULL | |
| `created_at`,`created_by` | — | append-only | |

#### 5.2.37 `learning_data_retention_actions` *(new, append-only)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `learning_data_retention_action_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `trigger_event` | ENUM | NOT NULL | RETIRED, RESIGNED, TERMINATED, DECEASED, DSR_ERASURE_REQUEST |
| `action_type` | ENUM | NOT NULL | ANONYMISE_SELF_ASSESSMENT, ERASE_MARKETPLACE_PRESENCE, DETACH_FEEDBACK_AUTHOR, RETAIN_STATUTORY, EXPORT |
| `scope_entity` | VARCHAR(60) | NOT NULL | e.g., employee_skills, training_feedback, certifications |
| `retention_override` | BOOLEAN | DEFAULT false | true = kept under statutory retention (e.g., SR-posted cert) |
| `approved_by` | UUID | FK→employees, NOT NULL | DPO |
| `executed_at` | TIMESTAMP | NULL | |
| `created_at`,`created_by` | — | append-only | |

### 5.3 Relationship map
```
skill_categories 1—* skills (skills.revalidation_interval_months → freshness)
skills *—* competencies (competencies.linked_skill_ids)
proficiency_levels 1—* (employee_skills, competency_model_items, skill_gap_items)  [descriptor = behavioural anchor]
competency_models (role_id|designation_id|cadre|org_unit_id; owner_id; review_due_date) 1—* competency_model_items *—1 competencies
employees 1—* employee_skills (last_validated_at, freshness_status) *—1 skills
employees 1—* skill_assessments
employees 1—* skill_gap_analyses (scoring_mode, model_stale_flag) 1—* skill_gap_items *—1 competencies
skill_gap_items.source ≡ training_needs.source  [normalised: GAP_ANALYSIS|APPRAISAL|MANDATORY]
training_needs *—* training_plan_items (via annual_training_plans)
annual_training_plans 1—* training_plan_items *—1 training_programs
training_programs 1—* training_sessions *—1 venues, *—1 trainers
training_programs 1—* lms_content_packages ; training_programs 1—* assessment_items
training_campaigns 1—* campaign_targets *—1 employees ; campaign_targets 1—0..1 training_nominations
training_sessions 1—* training_nominations (waitlist_position, training_campaign_id) *—1 employees, *—1 training_needs
training_nominations 1—* training_attendance (marked_by_actor_type/id; capture_mode; offline)
training_nominations 1—* training_assessments (assessed_by_actor_type/id)
training_nominations 1—* training_feedback (also session-level; L3/L4 programme-level)
training_nominations 1—1 certifications (credential_source) —> service_register_events (M12)
certifications 1—* credential_verifications (external/professional)
certifications.lapsed_mandatory —> consumed by M06 sensitive-duty checks
training_nominations 1—1 lms_enrollments *—1 learning_record_stores, *—0..1 lms_content_packages
training_budgets 1—* training_costs *—1 training_sessions/nominations/vendor_empanelments/training_sponsorships
vendor_empanelments 1—* training_costs ; trainers 1—0..1 vendor_empanelments
employees 1—* training_sponsorships (service_bond) —> bond_recovery feed to M10
learning_paths 1—* learning_path_items *—1 training_programs
employees 1—* cpd_records
employees 1—* learning_data_retention_actions (DPDP exit)
documents (M13) referenced by: skill_assessments, training_programs, lms_content_packages, assessment_items,
   training_attendance, certifications, credential_verifications, training_costs, vendor_empanelments
notifications, audit_log, workflow_instances/tasks referenced throughout
Gap Contract v1 (read view) projected from skill_gap_analyses+items —> consumed by M06, M08
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations`, `cadres` | M01 | M07 (read) | M01 |
| `documents` | M13 | M07 | M07 stores refs; binaries M13 |
| `service_register_events` | M12 | M07 (read posted ref) | M07 appends training/qualification events (pinned contract §10.6) |
| `notifications`, `audit_log`, `workflow_*` | Platform | M07 | M07 |
| Appraisal development gaps | M08 | M07 (read feed, pinned contract) | M08 |
| Gap Contract v1 | **M07** | M06, M08 | M07 |
| Payroll reimbursement / bond-recovery payable | M10 | M10 | M07 emits feed |
| All `skill_*`, `competency_*`, `training_*`, `certifications`, `credential_*`, `learning_*`, `cpd_*`, `lms_*`, `assessment_items`, `vendor_empanelments`, `training_sponsorships`, `learning_data_retention_actions` | **M07** | M14, M06 (certs+Gap Contract), M08 | M07 |

### 5.5 Enum & reference catalog (additions/changes flagged **v2**)
| Enum | Values |
|---|---|
| `employment_status` (inherited M01) | ACTIVE, ON_LEAVE, SUSPENDED, TRANSFERRED, RETIRED, RESIGNED, DECEASED, TERMINATED |
| master `status` | DRAFT, PUBLISHED, ARCHIVED / RETIRED |
| `competency_type` | TECHNICAL, BEHAVIOURAL, LEADERSHIP, FUNCTIONAL, COMPLIANCE |
| `scope_type` (competency_models) | DESIGNATION, ROLE, CADRE, ORG_UNIT, GENERIC **(v2: ROLE now backed by `role_id`)** |
| `employee_skills.source` | SELF, MANAGER, ASSESSMENT, CERTIFICATION, IMPORT |
| `employee_skills.status` | DECLARED, VALIDATED, EXPIRED, REVOKED |
| `employee_skills.freshness_status` **(v2)** | FRESH, STALE, EXPIRED |
| `assessment_type` | SELF, MANAGER, TEST, EXTERNAL |
| `skill_gap_analyses.status` | DRAFT, FINALIZED, SUPERSEDED |
| `skill_gap_analyses.scoring_mode` **(v2)** | BINARY, WEIGHTED |
| `skill_gap_analyses.recompute_trigger` **(v2)** | FULL, INCREMENTAL_SKILL_EVENT, INCREMENTAL_MODEL_EVENT, ON_DEMAND |
| `skill_gap_items.source` **(v2 normalised)** | GAP_ANALYSIS, APPRAISAL, MANDATORY |
| `training_needs.source` | GAP_ANALYSIS, APPRAISAL, MANDATORY, MANAGER, SELF, INDUCTION |
| `training_needs.priority` | LOW, MEDIUM, HIGH, CRITICAL |
| `training_needs.status` | IDENTIFIED, CONSOLIDATED, PLANNED, ADDRESSED, DEFERRED, REJECTED |
| `annual_training_plans.status` | DRAFT, SUBMITTED, APPROVED, ACTIVE, CLOSED |
| `delivery_mode` | CLASSROOM, ELEARNING, BLENDED, EXTERNAL, ON_THE_JOB, WEBINAR |
| `provider_type` | INTERNAL, EXTERNAL, VENDOR, GOVT_INSTITUTE |
| `training_sessions.status` | DRAFT, OPEN, FULL, RUNNING, COMPLETED, CANCELLED |
| `training_nominations.status` | DRAFT, PENDING_L1, PENDING_L2, APPROVED, WAITLISTED, REJECTED, WITHDRAWN, CANCELLED, COMPLETED, NO_SHOW |
| `nomination_type` **(v2 +CAMPAIGN)** | SELF, MANAGER, HR, MANDATORY, INDUCTION, CAMPAIGN |
| `attendance_status` | PRESENT, ABSENT, LATE, EXCUSED |
| `attendance capture_mode` **(v2)** | ONLINE, KIOSK, ASSISTED, OFFLINE_SYNC, LMS_DERIVED |
| `actor_type` (attendance/assessment) **(v2)** | EMPLOYEE, TRAINER, KIOSK_OPERATOR, SYSTEM |
| `assessment_phase` | PRE, POST, REASSESSMENT |
| `kirkpatrick_level` | L1_REACTION, L2_LEARNING, L3_BEHAVIOUR, L4_RESULTS |
| `certifications.credential_source` **(v2)** | INTERNAL_PROGRAM, EXTERNAL_PROFESSIONAL |
| `certifications.verification_status` **(v2)** | NOT_REQUIRED, PENDING, VERIFIED, REJECTED |
| `certifications.status` | ACTIVE, EXPIRED, REVOKED, SUPERSEDED |
| `sr_posting_status` | NOT_REQUIRED, PENDING, POSTED, FAILED |
| `cost_type` **(v2 +SPONSORSHIP,BOND_RECOVERY)** | TRAINER_FEE, VENUE, MATERIAL, TRAVEL, REIMBURSEMENT, LMS_LICENSE, SPONSORSHIP, BOND_RECOVERY, OTHER |
| `cost_stage` | COMMITTED, ACTUAL |
| `lms standard` | SCORM_12, SCORM_2004, XAPI, NONE |
| `lms sync_mode` **(v2)** | XAPI_LRS, SCORM_POLL, MANUAL |
| `lms completion_status` | NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED |
| `training_campaigns.status` **(v2)** | DRAFT, APPROVED, RUNNING, PAUSED, COMPLETED, CANCELLED |
| `campaign_targets.target_status` **(v2)** | PENDING, NOMINATED, IN_PROGRESS, COMPLETED, OVERDUE, EXEMPT, FAILED |
| `vendor_empanelments.status` **(v2)** | DRAFT, PENDING_APPROVAL, EMPANELLED, SUSPENDED, EXPIRED, BLACKLISTED |
| `training_sponsorships.obligation_status` **(v2)** | PROPOSED, SANCTIONED, ACTIVE, FULFILLED, BREACHED, RECOVERED, WAIVED |
| `connector_type` (LRS) **(v2)** | LRS_XAPI, LMS_REPORTING_API, SCORM_SELF_HOSTED |
| `retention action_type` **(v2)** | ANONYMISE_SELF_ASSESSMENT, ERASE_MARKETPLACE_PRESENCE, DETACH_FEEDBACK_AUTHOR, RETAIN_STATUTORY, EXPORT |

**Normalised source-enum mapping (v2, Risk #7).** Gap-item→need conversion is now 1:1:
| `skill_gap_items.source` | → `training_needs.source` |
|---|---|
| GAP_ANALYSIS | GAP_ANALYSIS |
| APPRAISAL | APPRAISAL |
| MANDATORY | MANDATORY |

### 5.6 Data integrity rules
1. **Proficiency ordering:** `skill_gap_items.gap_size = max(0, target.level_order − current.level_order)`; never negative.
2. **One current skill row:** `UNIQUE(employee_id, skill_id)` on `employee_skills`; history lives in `skill_assessments`.
3. **No duplicate enrolment:** `UNIQUE(training_session_id, employee_id)` on `training_nominations`.
4. **Capacity invariant:** `training_sessions.enrolled_count ≤ capacity`; beyond capacity → status WAITLISTED with a **persisted `waitlist_position`** (v2), not APPROVED.
5. **Score bounds:** `0 ≤ obtained_score ≤ max_score`; `result = PASS` iff `obtained_score ≥ pass_threshold`.
6. **Date sanity:** `training_sessions.end_date ≥ start_date`; `nomination_deadline ≤ start_date`; `certifications.valid_until > issue_date`; `training_campaigns.window_end ≥ window_start`; `vendor_empanelments.valid_until ≥ valid_from`.
7. **Budget reconciliation — canonical key (v2, Risk #14).** The **single canonical reconciliation key is `(financial_year, org_unit_id)`**. `skill_category_id` and `competency_id` are **reporting dimensions only**, never reconciliation keys. Plan items, needs, nominations, and costs all roll up to the org-unit + FY budget. Worked example: budget `tb-8001` (ou-12, FY2026-2027) allocated ₹50,00,000. Plan items for ou-12 sum planned ₹48,00,000 (≤ allocated ✓). Approved nominations commit ₹12,00,000. Actual costs (trainer ₹2,00,000 + venue ₹1,00,000 + travel ₹50,000) = ₹3,50,000. Variance = allocated − (committed) = ₹38,00,000 remaining; utilisation = committed/allocated = 24%. Category/competency breakdowns are computed by tagging each cost with its program's category for **reporting**, but the invariant `committed + actual ≤ allocated` is evaluated only at the org-unit + FY grain.
8. **SR posting only when due:** `service_register_event_id` set only when `sr_posting_status = POSTED`; significant/mandatory certs require POSTED before status can become SUPERSEDED. **Significance is resolved by the `is_significant` rule set (FR-TSD-016), not ad-hoc.**
9. **Append-only ledgers:** `skill_assessments`, `training_assessments`, `training_feedback`, `cpd_records`, `credential_verifications`, `learning_data_retention_actions`, and SR events accept no UPDATE/DELETE.
10. **Segregation of duties:** `nominated_by ≠ approver`; budget `approved_by ≠ training_costs.created_by`; `vendor_empanelments` requester ≠ `approved_by`; credential `created_by` (self-capture) ≠ `verified_by`; retention requester ≠ DPO `approved_by`.
11. **Mandatory completion:** a mandatory/campaign program nomination cannot be CANCELLED/WITHDRAWN by the employee; only L&D with reason.
12. **Referential currency & freshness (v2):** an `employee_skill` with `expires_on < today` → `EXPIRED`; with `last_validated_at` older than `skill.revalidation_interval_months` (and not compliance-expired) → `freshness_status = STALE`. The nightly job sets both. STALE skills are **discounted from gap closure** per the configurable policy in FR-TSD-004.
13. **No polymorphic FKs (v2):** `training_attendance.marked_by_*` and `training_assessments.assessed_by_*` use an `actor_type` discriminator + `actor_id`; integrity enforced in the service layer / via partial FKs per actor_type. External trainers are never coerced into `employees`.
14. **Incremental gap recompute (v2):** gap analysis is recomputed **event-driven** on skill-change, validation, model-publish, and mandate-change events; a full batch is a fallback reconciliation, not the primary path (see §9 Performance).
15. **Campaign coverage denominator (v2):** for any campaign, `eligible_count = targets where is_eligible = true`; completion % is measured against `eligible_count`, and exemptions are explicitly recorded with reason — no silent denominator manipulation.
16. **Money rounding (v2):** all INR amounts rounded to paise using banker's rounding (round-half-to-even); reconciliation differences ≤ ₹0.01 are absorbed by the budget line owner and logged.
17. **Service-bond integrity (v2):** a `training_sponsorships` with `obligation_status = BREACHED` must produce a `BOND_RECOVERY` cost feeding M10 before it can move to RECOVERED.
18. **One primary LRS (v2):** exactly one `learning_record_stores` row may have `is_primary = true` (single-LMS-of-record decision).

### 5.7 Sample data (2–3 rows per representative new/changed entity)

**`competency_models` (v2 fields)**
| competency_model_id | code | scope_type | role_id | designation_id | owner_id | review_due_date | version | status |
|---|---|---|---|---|---|---|---|---|
| cm-9001 | CM-AAO | DESIGNATION | NULL | desg-AAO | emp-7001 | 2027-04-01 | 1 | PUBLISHED |
| cm-9003 | CM-DBA-ROLE | ROLE | role-DBA | NULL | emp-7002 | 2026-12-31 | 1 | PUBLISHED |

**`employee_skills` (v2 freshness)**
| employee_skill_id | employee_id | skill_id | current_proficiency_level_id | source | last_validated_at | freshness_status | status |
|---|---|---|---|---|---|---|---|
| es-5001 | emp-3001 | s-1001 | pl-3 | ASSESSMENT | 2025-02-10 | STALE | VALIDATED |
| es-5002 | emp-3001 | s-1002 | pl-1 | CERTIFICATION | 2026-01-15 | FRESH | VALIDATED |

**`training_campaigns`**
| training_campaign_id | code | training_program_id | scope_type | scope_ref | window_start | window_end | renewal_cadence_months | status |
|---|---|---|---|---|---|---|---|---|
| camp-01 | CAMP-CYBER-2026 | tp-2001 | ALL_STAFF | NULL | 2026-07-01 | 2026-09-30 | 12 | RUNNING |
| camp-02 | CAMP-POSH-2026 | tp-2010 | CADRE | clerical | 2026-08-01 | 2026-10-31 | 12 | APPROVED |

**`campaign_targets`**
| campaign_target_id | training_campaign_id | employee_id | is_eligible | wave_no | target_status | due_date |
|---|---|---|---|---|---|---|
| ct-9001 | camp-01 | emp-3001 | true | 1 | NOMINATED | 2026-09-30 |
| ct-9002 | camp-01 | emp-3050 | false | NULL | EXEMPT | 2026-09-30 |

**`certifications` (v2 external credential)**
| certification_id | employee_id | credential_source | issuing_body | external_reference_no | verification_status | is_mandatory | lapsed_mandatory | status |
|---|---|---|---|---|---|---|---|---|
| ct-6003 | emp-3001 | EXTERNAL_PROFESSIONAL | PMI | PMP-1234567 | VERIFIED | false | false | ACTIVE |
| ct-6002 | emp-3002 | INTERNAL_PROGRAM | CGG L&D | NULL | NOT_REQUIRED | true | true | EXPIRED |

**`vendor_empanelments`**
| vendor_empanelment_id | vendor_name | empanelment_ref | contract_ref | valid_from | valid_until | status |
|---|---|---|---|---|---|---|
| ve-01 | National Institute of Smart Governance | EMP-2026-014 | CTR-88 | 2026-04-01 | 2027-03-31 | EMPANELLED |
| ve-02 | CyberSafe Trainers Pvt Ltd | EMP-2026-022 | CTR-91 | 2026-05-01 | 2027-04-30 | EMPANELLED |

**`training_sponsorships`**
| training_sponsorship_id | employee_id | sponsorship_type | sponsored_amount | service_bond_months | bond_end_date | obligation_status |
|---|---|---|---|---|---|---|
| sp-01 | emp-3001 | DEGREE | 800000.00 | 36 | 2029-06-30 | ACTIVE |
| sp-02 | emp-3009 | DEPUTATION | 250000.00 | 12 | 2027-09-30 | SANCTIONED |

**`learning_record_stores`**
| learning_record_store_id | code | connector_type | is_primary | endpoint_url | supported_standards | status |
|---|---|---|---|---|---|---|
| lrs-01 | PRIMARY-LRS | LRS_XAPI | true | https://lrs.internal/xapi | XAPI | ACTIVE |
| lrs-02 | LEGACY-LMS | LMS_REPORTING_API | false | https://lms.gov/api | SCORM_12,SCORM_2004 | ACTIVE |

---

## 6. Functional Requirements

> Each FR follows: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, Low-Level Design table. v2 adds FR-TSD-017…024 and amends FR-002/003/004/009/010/011/012/015/016. Unchanged FRs are reproduced for completeness.

---

### FR-TSD-001 — Skill Taxonomy & Competency Framework Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager/SysAdmin (publish/approve), Auditor (read)
- **User Story:** As an L&D Officer, I want to define and publish a governed skill taxonomy and competency catalog so that all downstream skill and training processes use a single controlled vocabulary.
- **Description:** CRUD for `skill_categories`, `skills`, `competencies`, and `proficiency_levels` with a DRAFT→PUBLISHED→ARCHIVED lifecycle. Publication requires maker-checker. Compliance skills carry a default validity used to drive renewal. **(v2)** Non-compliance skills may carry a `revalidation_interval_months` for freshness; **proficiency levels require a concrete behavioural `descriptor`** so self-assessment produces signal.
- **Acceptance Criteria:**
  1. An L&D Officer can create categories, skills, competencies, and proficiency levels in DRAFT.
  2. Publication of any master record requires L&D Manager approval via the workflow engine.
  3. PUBLISHED records cannot have their `code` changed; only ARCHIVE or new version.
  4. A skill flagged `is_compliance_skill=true` must have `default_validity_months` set.
  5. Archiving a category is blocked if it has PUBLISHED child skills (CONFLICT).
  6. **(v2)** A proficiency level cannot be PUBLISHED without a non-empty `descriptor` (behavioural anchor).
  7. **(v2)** A non-compliance skill may set `revalidation_interval_months`; if set it must be ≥ 1.
- **Business Rules:**
  - `code` is globally unique per entity and immutable once PUBLISHED.
  - Proficiency levels are globally ordered (`level_order` unique, contiguous, ascending), each with a behavioural anchor.
  - A competency may compose 0..N skills; deleting a skill referenced by a PUBLISHED competency is blocked.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `skill_categories` | C/R/U/Archive |
  | `skills` (incl. `revalidation_interval_months`) | C/R/U/Archive |
  | `competencies` | C/R/U/Archive |
  | `proficiency_levels` (mandatory `descriptor`) | C/R/U/Archive |
  | `audit_log`, `workflow_instances` | Write |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/skills`, `/api/v1/competencies`, `/api/v1/skill-categories`, `/api/v1/proficiency-levels` |
  | PATCH | `/api/v1/skills/{id}` (incl. `:publish`, `:archive`) |
  | GET | `/api/v1/skills?categoryId=&status=` (paginated) |
- **UI Behavior Notes:** Tree view of categories→skills; competency builder with skill multi-select; publish action shows confirmation and routes to checker. Status badges. Inline validation for compliance validity and **mandatory descriptor with helper text** (v2).
- **Edge Cases:** Duplicate `code` (409 RESOURCE_CONFLICT); archiving in-use master (409 IN_USE); reordering proficiency levels already referenced (allowed but warns, recomputes gaps lazily); **publishing a level without descriptor (422 VALIDATION_ERROR)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `TaxonomyController`, `CompetencyService`, `MasterDataPublisher`, `WorkflowClient` |
  | Backend Flow | Validate (incl. descriptor, revalidation interval) → persist DRAFT → on publish create workflow_instance → on approval set PUBLISHED + audit |
  | Data Operations | Insert/update master tables; FK integrity checks before archive |
  | Validation | Unique/immutable `code`; compliance-validity required; descriptor required; contiguous level order |
  | Authorization | L&D Officer create/update; L&D Manager/SysAdmin publish; row scope = global master |
  | State Changes & Side Effects | DRAFT→PUBLISHED→ARCHIVED; publish notifies subscribers; gap caches invalidated |
  | Failure Handling | 409 duplicate/in-use; 422 missing validity/descriptor; rollback on workflow failure |
  | Dependencies | Workflow engine, audit_log, notifications |
  | Test Guidance | Code immutability; level ordering; descriptor enforcement; publish workflow |

---

### FR-TSD-002 — Role-Based Competency Models, Proficiency Targets & Governance
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager (approve), model `owner_id` (steward)
- **User Story:** As an L&D Officer, I want to build versioned competency models mapped to designations/cadres/**roles**/org-units with target proficiency levels, an accountable owner, and a review cadence so that skill gaps are measured objectively and the framework does not silently rot.
- **Description:** Create `competency_models` with `competency_model_items` (competency + target proficiency + critical flag + optional weight), scoped by designation/**role**/cadre/org-unit/generic, with effective dating, versioning, **`owner_id` and `review_due_date`**. **(v2)** Adds the `role_id` scope key (closing the unsatisfiable-ROLE defect) and a staleness alarm.
- **Acceptance Criteria:**
  1. A model can be scoped to a designation, **role (via `role_id`)**, cadre, org-unit, or generic; **exactly one scope key matches the `scope_type`** (GENERIC = all null). *(v2: now satisfiable for ROLE.)*
  2. Each item references a PUBLISHED competency and a valid proficiency target.
  3. Publishing a new version supersedes the prior version for the same scope on `effective_from`.
  4. A given employee resolves to exactly one effective model (most specific scope wins).
  5. **(v2)** Every model has an `owner_id` and a `review_due_date`; a model past its review-due date is flagged STALE in the governance report.
  6. **(v2)** Computing a FINALIZED gap analysis against a model past `review_due_date` is **allowed but warns** and stamps `model_stale_flag=true` on the analysis.
- **Business Rules:**
  - Effective periods for the same scope+version cannot overlap.
  - Scope resolution precedence: DESIGNATION > ROLE > CADRE > ORG_UNIT > GENERIC.
  - Weights (`weight`, default 1.0) drive **weighted** gap scoring only when `ff.gap.weighted` is ON; otherwise binary critical/non-critical applies (default at launch).
  - **(v2)** `review_due_date` defaults to `effective_from + 12 months` and is owner-editable within policy bounds.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `competency_models` (`role_id`,`owner_id`,`review_due_date`) | C/R/U/Version |
  | `competency_model_items` | C/R/U/D |
  | `competencies`, `proficiency_levels`, `roles` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/competency-models` |
  | POST | `/api/v1/competency-models/{id}/items` |
  | POST | `/api/v1/competency-models/{id}:publish` |
  | GET | `/api/v1/employees/{empId}/effective-competency-model` |
  | GET | `/api/v1/competency-models/staleness-report?orgUnitId=` *(v2)* |
- **UI Behavior Notes:** Model editor grid (competency, target level, critical toggle, weight when flag on); scope selector with dependent fields incl. **role picker**; version timeline; "resolve for employee" preview; **owner + review-due badge with overdue highlight** (v2).
- **Edge Cases:** Overlapping effective periods (409); no model resolves (GENERIC fallback or 404 with guidance); duplicate competency in a model (409); **ROLE scope without `role_id` (422)**; review-due in the past on publish (allowed, immediately flagged STALE).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CompetencyModelService`, `ScopeResolver`, `ModelVersioner`, `StalenessReporter` |
  | Backend Flow | Validate single scope key (incl. role_id) → persist header+items DRAFT → publish creates version, closes prior effective_to → schedule review-due alarm |
  | Data Operations | Insert model+items; CHECK single-scope; effective-date range check |
  | Validation | Single scope key; published competency refs; non-overlap; owner+review_due required |
  | Authorization | L&D Officer maker; L&D Manager approve |
  | State Changes & Side Effects | New PUBLISHED version supersedes prior; invalidates gap caches; emits model-change event for incremental recompute |
  | Failure Handling | 409 overlap/duplicate; 422 invalid/missing scope key |
  | Dependencies | FR-TSD-001 masters; roles (M01/platform) |
  | Test Guidance | Scope precedence incl. ROLE; versioning; staleness flag propagation to FR-004 |

---

### FR-TSD-003 — Employee Skill Inventory, Assessment & Freshness
- **Module:** M07-TSD
- **Primary Role(s):** Employee (self-assess), Reporting Manager (validate), L&D Officer, Kiosk Operator (assisted)
- **User Story:** As an employee, I want to declare and maintain my skills with proficiency levels, have my manager validate them, and have stale skills flagged so that my skill profile is accurate and trusted over time.
- **Description:** Maintain `employee_skills` (one current row per skill) with full history in `skill_assessments`. Sources: self, manager, test, certification, import. Validation transitions DECLARED→VALIDATED. Currency/expiry tracked for renewable skills; **(v2) `last_validated_at` + `freshness_status` track decay for non-compliance skills**; assisted capture supports non-login staff (FR-TSD-022).
- **Acceptance Criteria:**
  1. An employee (or Kiosk Operator on their behalf) can add/update a skill with a self-assessed proficiency level (status DECLARED).
  2. A manager can validate or adjust the proficiency (status VALIDATED, records validator + timestamp, **sets `last_validated_at`**).
  3. Every change appends an immutable `skill_assessments` row.
  4. A skill acquired via a PUBLISHED certificate auto-populates with source=CERTIFICATION and `expires_on` from cert validity.
  5. Skills past `expires_on` auto-transition to EXPIRED nightly.
  6. **(v2)** A VALIDATED non-compliance skill whose `last_validated_at` is older than `skill.revalidation_interval_months` is set `freshness_status=STALE` nightly and surfaced for re-validation.
  7. **(v2)** Self-assessment UI shows the proficiency-level **behavioural anchor** inline to reduce noise.
- **Business Rules:**
  - `UNIQUE(employee_id, skill_id)`; updates overwrite the current row, never duplicate.
  - Only the manager-of-record or L&D may VALIDATE; self-validation forbidden.
  - Evidence document optional for self, recommended for EXTERNAL.
  - **(v2)** STALE does not change `status` (still VALIDATED) but is discounted in gap closure (FR-TSD-004).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `employee_skills` (`last_validated_at`,`freshness_status`) | C/R/U |
  | `skill_assessments` | Append |
  | `documents`, `employees`, `skills`, `proficiency_levels` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/employees/{empId}/skills` |
  | POST | `/api/v1/employees/{empId}/skills` |
  | PATCH | `/api/v1/employees/{empId}/skills/{skillId}` |
  | POST | `/api/v1/employees/{empId}/skills/{skillId}:validate` |
  | GET | `/api/v1/employees/{empId}/skills?freshness=STALE` *(v2)* |
- **UI Behavior Notes:** Skill card grid with proficiency meter, source/validation badge, expiry chip, **freshness chip (Fresh/Stale)** (v2); manager "validate" inline action; evidence upload; expired skills flagged red, stale skills amber; **inline behavioural-anchor helper** (v2).
- **Edge Cases:** Manager validates a skill not declared (creates VALIDATED row source=MANAGER); concurrent self+manager edit (last write wins on current row, both appended to history); expiry on weekend handled by nightly job; **bulk re-validation of stale skills by manager** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SkillInventoryService`, `AssessmentLedger`, `ExpiryJob`, `FreshnessJob` *(v2)*, `CertSkillSync` |
  | Backend Flow | Upsert current row → append assessment → set last_validated_at on validate → emit skill-change event for incremental gap recompute |
  | Data Operations | Upsert employee_skills; insert skill_assessments; nightly expiry + freshness update |
  | Validation | One row per (emp,skill); validator ≠ employee; level valid |
  | Authorization | Self/Kiosk for DECLARE; manager/L&D for VALIDATE; row scope by org subtree |
  | State Changes & Side Effects | DECLARED→VALIDATED→EXPIRED/REVOKED; freshness FRESH↔STALE; triggers gap recompute |
  | Failure Handling | 403 self-validate; 409 stale-version (optimistic lock) |
  | Dependencies | FR-TSD-001/002; FR-TSD-012 cert sync; FR-TSD-022 assisted |
  | Test Guidance | History append count; expiry+freshness jobs; cert→skill propagation; anchor display |

---

### FR-TSD-004 — Incremental Skill-Gap Analysis (Model + Appraisal Reconciliation)
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, Reporting Manager, Employee (own)
- **User Story:** As an L&D Officer, I want each employee's skill gaps computed incrementally against their effective competency model and reconciled with appraisal development gaps from M08 so that training needs are evidence-based and the engine scales to 200k employees.
- **Description:** Generate `skill_gap_analyses` + `skill_gap_items` by comparing resolved model targets to the employee's **fresh, validated** skills, then merging M08 development gaps (source=APPRAISAL) and statutory mandates (source=MANDATORY). **(v2)** Default `scoring_mode=BINARY` (critical/non-critical); weighted decimal scoring only when `ff.gap.weighted` is ON. Recompute is **event-driven/incremental** (skill, validation, model, mandate events), with a full batch only as reconciliation fallback. Emits the **Gap Contract** (FR-TSD-024) for M06/M08.
- **Acceptance Criteria:**
  1. Gap analysis resolves the employee's effective model and computes `gap_size = max(0, target − current)` per competency.
  2. Appraisal development gaps for the latest cycle are imported and merged (no duplicates by competency).
  3. Mandatory/compliance competencies the employee lacks appear as **MANDATORY**-source gaps regardless of model.
  4. Finalizing a new analysis supersedes the prior FINALIZED one for the employee.
  5. Each gap item can be one-click converted into a `training_need` (1:1 source mapping — §5.5).
  6. **(v2)** Only VALIDATED **and FRESH** skills count toward closing a gap; STALE skills are discounted/excluded per configurable policy and counted in `stale_skill_count`; gap item flags `discounted_for_staleness`.
  7. **(v2)** Computing against a model past `review_due_date` stamps `model_stale_flag=true` and warns.
  8. **(v2)** At launch `scoring_mode=BINARY`; `overall_gap_score` is null unless weighted flag is ON.
  9. **(v2)** A skill-change event recomputes only the affected employee's analysis within the incremental SLA (§9), not a full-population batch.
- **Business Rules:**
  - Critical gap = `is_critical` competency with `gap_size ≥ 1`.
  - If M08 feed is unavailable, analysis proceeds with model+mandate sources and flags `appraisal_cycle_ref=UNAVAILABLE`.
  - **(v2)** Staleness discount policy is configurable: EXCLUDE (treat as no current skill) or DISCOUNT_ONE_LEVEL.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `skill_gap_analyses` (`scoring_mode`,`model_stale_flag`,`stale_skill_count`,`recompute_trigger`), `skill_gap_items` (`source` normalised, `discounted_for_staleness`) | C/R |
  | `competency_models`, `employee_skills`, `proficiency_levels` | R |
  | M08 appraisal-gap feed (pinned contract §10.6) | R (external) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/employees/{empId}/skill-gap-analyses` |
  | GET | `/api/v1/employees/{empId}/skill-gap-analyses/latest` |
  | POST | `/api/v1/skill-gap-items/{id}:convert-to-need` |
  | GET | `/api/v1/gap-contract/v1?employeeId=&modelId=` *(v2 — see FR-TSD-024)* |
- **UI Behavior Notes:** Radar/heatmap of target vs current; gap list sortable by criticality; "create training need" buttons; source legend (gap/appraisal/mandatory); **stale-discount and model-stale banners** (v2); manager team-rollup view.
- **Edge Cases:** No effective model (GENERIC, warns); M08 down (degraded mode); employee higher-than-target (gap 0, surplus highlighted for marketplace FR-TSD-014); **all current skills STALE → gaps reopen, surfaced for re-validation** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `GapEngine`, `IncrementalRecomputeWorker` *(v2)*, `AppraisalFeedClient`, `MandateResolver`, `GapContractProjector` *(v2)* |
  | Backend Flow | Consume skill/model/mandate event → resolve model → diff fresh+validated skills → fetch M08 gaps → merge/dedupe → persist snapshot → finalize supersedes → project Gap Contract |
  | Data Operations | Insert analysis+items; mark prior SUPERSEDED; per-employee incremental update |
  | Validation | gap_size ≥ 0; dedupe by competency; only VALIDATED+FRESH skills close gaps; binary default |
  | Authorization | L&D/manager for team; employee own read |
  | State Changes & Side Effects | DRAFT→FINALIZED→SUPERSEDED; emits need-candidate + Gap Contract events |
  | Failure Handling | M08 timeout → degraded mode (503 logged, not surfaced as failure) |
  | Dependencies | FR-TSD-002/003; M08-PAM feed; FR-TSD-024 |
  | Test Guidance | Merge/dedupe; staleness discount; model-stale flag; incremental recompute SLA; binary vs weighted |

---

### FR-TSD-005 — Training Needs Identification & Consolidation
- **Module:** M07-TSD
- **Primary Role(s):** Reporting Manager, L&D Officer, L&D Manager (prioritise)
- **User Story:** As an L&D Officer, I want to capture, consolidate, and prioritise individual and group training needs from gaps, appraisals, mandates, and manager input so that the annual plan is demand-driven.
- **Description:** Manage `training_needs` from multiple sources (normalised 1:1 with gap-item sources), deduplicate at individual/group level, prioritise, and roll up by org-unit/competency for plan input.
- **Acceptance Criteria:**
  1. Needs can be created from a gap item, an appraisal gap, a mandate, manager input, self request, or induction.
  2. The system surfaces duplicate needs (same employee+competency, same FY) and prevents duplicates.
  3. L&D can consolidate multiple individual needs into a group need with a participant list.
  4. Needs carry a priority and a financial year and flow to status CONSOLIDATED then PLANNED.
  5. **(v2)** A gap item converts to a need with `source` mapped 1:1 (GAP_ANALYSIS/APPRAISAL/MANDATORY) — no mis-mapping.
- **Business Rules:**
  - Mandatory-source needs cannot be REJECTED, only DEFERRED with justification.
  - Group needs reference an org_unit and an implicit participant set.
  - Priority is derived-suggested (CRITICAL if from a critical gap or mandate) but L&D may override with reason.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_needs` | C/R/U |
  | `skill_gap_items` | R (source) |
  | `org_units`, `competencies` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-needs` |
  | GET | `/api/v1/training-needs?fy=&orgUnitId=&priority=&status=` |
  | POST | `/api/v1/training-needs:consolidate` |
- **UI Behavior Notes:** Needs inbox with source filters; consolidation wizard grouping by competency; priority editor; FY selector; duplicate warning banner.
- **Edge Cases:** Same need from gap and mandate (merged, MANDATORY wins); consolidating across org-units (blocked, scope mismatch); deferring a critical mandatory need requires manager+L&D dual sign-off.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NeedService`, `Consolidator`, `DuplicateGuard` |
  | Backend Flow | Validate source → dedupe check → persist → consolidate creates group need linking individuals |
  | Data Operations | Insert/update training_needs; unique(emp,competency,fy) soft guard |
  | Validation | Mandatory cannot be rejected; same-FY dedupe; 1:1 source mapping |
  | Authorization | Manager creates for team; L&D consolidates/prioritises |
  | State Changes & Side Effects | IDENTIFIED→CONSOLIDATED→PLANNED→ADDRESSED/DEFERRED/REJECTED |
  | Failure Handling | 409 duplicate; 403 reject-mandatory |
  | Dependencies | FR-TSD-004 |
  | Test Guidance | Dedupe; consolidation participant set; mandatory-defer dual sign-off; source mapping |

---

### FR-TSD-006 — Annual Training Calendar, Plan & Budget Allocation
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (build), L&D Manager (approve), Dept Head/Finance (sanction)
- **User Story:** As an L&D Manager, I want to build and approve an annual training plan and calendar with budget allocation per org-unit so that delivery is governed and funded.
- **Description:** Compose `annual_training_plans` with `training_plan_items` from consolidated needs, allocate `training_budgets` on the **canonical (FY, org_unit) key**, and publish a quarter-bucketed calendar.
- **Acceptance Criteria:**
  1. A plan can pull consolidated needs and propose plan items with target audience, man-days, and budget.
  2. Plan total budget must reconcile to allocated `training_budgets` for the **FY/org-unit** (category/competency are reporting dimensions only — v2).
  3. Approval requires L&D Manager; budget sanction requires Finance/Dept Head per policy.
  4. Once APPROVED→ACTIVE, sessions can be scheduled against plan items.
  5. A read-only annual calendar view aggregates sessions by quarter and org-unit.
- **Business Rules:**
  - `UNIQUE(financial_year, org_unit_id)` per plan.
  - Sum of `training_plan_items.planned_budget` ≤ allocated budget at the org-unit + FY grain (overrun requires explicit approval flag).
  - Closing a plan requires all items COMPLETED or DROPPED.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `annual_training_plans`, `training_plan_items` | C/R/U |
  | `training_budgets` | C/R/U |
  | `training_needs` | R/U (→PLANNED) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/annual-training-plans` |
  | POST | `/api/v1/annual-training-plans/{id}/items` |
  | POST | `/api/v1/annual-training-plans/{id}:submit` / `:approve` |
  | GET | `/api/v1/training-calendar?fy=&orgUnitId=` |
- **UI Behavior Notes:** Plan builder with needs picker; budget reconciliation bar (allocated vs planned at org-unit grain); quarter calendar (Gantt-style); approval workflow stepper; **category/competency breakdown shown as reporting-only chips** (v2).
- **Edge Cases:** Plan exceeds budget (block unless overrun flag + dual approval); needs added after approval (amendment workflow, version note); FY rollover copies recurring mandatory programs (and seeds campaigns — FR-017).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `PlanService`, `BudgetReconciler`, `CalendarProjector` |
  | Backend Flow | Build draft from needs → reconcile budget at org-unit+FY → submit→approve workflow → activate |
  | Data Operations | Insert plan+items+budgets; update needs to PLANNED |
  | Validation | Unique fy+org; budget sum ≤ allocated (canonical key); close requires terminal items |
  | Authorization | L&D build; L&D Mgr approve; Finance sanction |
  | State Changes & Side Effects | DRAFT→SUBMITTED→APPROVED→ACTIVE→CLOSED; commits budget |
  | Failure Handling | 409 duplicate plan; 422 budget overrun without flag |
  | Dependencies | FR-TSD-005, FR-TSD-016 budget |
  | Test Guidance | Budget reconciliation at canonical key; approval gating; calendar aggregation |

---

### FR-TSD-007 — Course Catalog & Training Program Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (maker), L&D Manager (publish)
- **User Story:** As an L&D Officer, I want to maintain a catalog of training programs (internal, external, e-learning, blended, micro-learning) with outcomes, certification rules, and cost so that sessions, campaigns, and learning paths can be built from reusable programs.
- **Description:** CRUD for `training_programs` with delivery mode, provider type, mandatory/induction flags, linked competencies, CPD credits, certification-on-completion + validity, default cost and capacity, materials, and LMS course reference. **(v2)** E-learning programs reference an `lms_content_packages` version and an `learning_record_stores` connector rather than an implied webhook.
- **Acceptance Criteria:**
  1. A program defines delivery mode, provider type, duration, and outcome competencies.
  2. Mandatory/induction flags are settable; mandatory programs must link ≥1 compliance competency.
  3. `certification_on_completion=true` requires a `cert_validity_months` (NULL = lifetime only if explicitly chosen).
  4. **(v2)** E-learning programs require a PUBLISHED `lms_content_packages` version and a designated LRS/LMS connector + standard.
  5. Retiring a program is blocked if it has OPEN/RUNNING sessions or an active campaign.
- **Business Rules:**
  - `code` unique and immutable once PUBLISHED.
  - CPD credits ≥ 0; default cost ≥ 0.
  - Linked competencies must be PUBLISHED.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_programs` | C/R/U/Retire |
  | `lms_content_packages` *(v2)* | R |
  | `competencies`, `documents` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-programs` |
  | GET | `/api/v1/training-programs?mode=&provider=&mandatory=&q=` |
  | PATCH | `/api/v1/training-programs/{id}` (`:publish`,`:retire`) |
- **UI Behavior Notes:** Catalog grid + cards with filters; program editor with outcome competency picker, materials upload, **content-package picker + LRS connector** (v2), cost; mandatory/induction toggles surface dependent fields.
- **Edge Cases:** E-learning without content package (422); retire with active sessions/campaign (409); duplicate code (409).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ProgramService`, `ContentLinkValidator` *(v2)* |
  | Backend Flow | Validate (incl. content package for e-learning) → persist DRAFT → publish via workflow → catalog index update |
  | Data Operations | Insert/update training_programs; FK checks on retire |
  | Validation | Unique code; mandatory→compliance competency; e-learning→content package+LRS |
  | Authorization | L&D maker; L&D Mgr publish |
  | State Changes & Side Effects | DRAFT→PUBLISHED→RETIRED; feeds learning paths, sessions, campaigns |
  | Failure Handling | 409 in-use retire; 422 missing dependent fields |
  | Dependencies | FR-TSD-001; FR-TSD-021 content; FR-TSD-015 LMS |
  | Test Guidance | Mandatory rule; content-package requirement; retire guard |

---

### FR-TSD-008 — Session/Batch Scheduling, Trainer & Venue Management
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, Trainer (view)
- **User Story:** As an L&D Officer, I want to schedule sessions/batches and manage trainers and venues with capacity so that delivery is logistically sound and conflict-free.
- **Description:** CRUD `training_sessions` (batch, dates, mode, venue/online URL, trainer, capacity, nomination deadline), plus `trainers` and `venues` management with conflict detection. **(v2)** External trainers link to an `vendor_empanelments` record (FR-TSD-019).
- **Acceptance Criteria:**
  1. A session links to a PUBLISHED program and sets capacity, dates, mode, and nomination deadline.
  2. The system prevents scheduling a trainer or venue with an overlapping confirmed session (conflict).
  3. `end_date ≥ start_date` and `nomination_deadline ≤ start_date`.
  4. Online sessions require a meeting URL; classroom sessions require a venue with sufficient capacity.
  5. Cancelling a session cascades notifications and frees nominations to WITHDRAWN/re-nominate.
  6. **(v2)** Assigning an external trainer requires an EMPANELLED `vendor_empanelments` record valid for the session dates.
- **Business Rules:**
  - `batch_code` unique. Venue capacity ≥ session capacity for PHYSICAL. Trainer must have ≥1 matching expertise skill (warning, not hard block — **rationale now documented: surfaced for L&D judgement, never auto-blocking**).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_sessions` | C/R/U/Cancel |
  | `trainers`, `venues` | C/R/U |
  | `vendor_empanelments` *(v2)* | R |
  | `training_programs` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sessions` |
  | GET | `/api/v1/training-sessions?programId=&status=&from=&to=` |
  | POST | `/api/v1/training-sessions/{id}:cancel` |
  | POST | `/api/v1/trainers`, `/api/v1/venues` |
- **UI Behavior Notes:** Scheduling calendar with drag-to-create; conflict warnings inline; capacity meter; trainer/venue pickers with availability **and empanelment status** (v2); cancel dialog requiring reason.
- **Edge Cases:** Double-booking (409 SCHEDULE_CONFLICT); over-capacity venue (422); cancel a RUNNING session (allowed with reason, attendance preserved); **external trainer not empanelled/expired (409)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SessionService`, `ConflictDetector`, `ResourceCalendar`, `EmpanelmentValidator` *(v2)* |
  | Backend Flow | Validate dates+resources+empanelment → conflict check → persist → emit calendar event |
  | Data Operations | Insert session; lock trainer/venue slots; update on cancel |
  | Validation | Date order; deadline ≤ start; capacity ≤ venue; unique batch; empanelment valid |
  | Authorization | L&D Officer; Trainer read-own |
  | State Changes & Side Effects | DRAFT→OPEN→FULL→RUNNING→COMPLETED/CANCELLED; notifications on cancel |
  | Failure Handling | 409 conflict/empanelment; 422 capacity/date |
  | Dependencies | FR-TSD-007, FR-TSD-019; notifications |
  | Test Guidance | Conflict matrix; capacity rules; cancel cascade; empanelment gate |

---

### FR-TSD-009 — Nomination & Multi-Level Approval Workflow
- **Module:** M07-TSD
- **Primary Role(s):** Employee (self), Reporting Manager (L1), L&D Manager (L2), L&D Officer
- **User Story:** As a manager, I want to nominate employees (or approve self-nominations) for sessions through a maker-checker workflow with budget checks and **auditable** capacity/waitlist handling so that enrolment is controlled, funded, and fair.
- **Description:** Create `training_nominations` linked to a session and (ideally) a `training_need`, routed through the workflow engine, with L1/L2 approvals, budget commitment, capacity enforcement with **persisted FIFO waitlist position and audited promotion** (v2). Campaign-created nominations carry `training_campaign_id` and `nomination_type=CAMPAIGN`.
- **Acceptance Criteria:**
  1. An employee can self-nominate; a manager can nominate reports; L&D/HR can nominate anyone in scope.
  2. Nomination routes PENDING_L1→PENDING_L2→APPROVED; mandatory/induction/campaign may auto-approve per policy.
  3. On APPROVED, capacity is decremented; if full, nomination becomes WAITLISTED with a **persisted `waitlist_position`**.
  4. Approval commits estimated cost to the org-unit budget (FR-TSD-016); insufficient budget blocks approval unless overrun-approved.
  5. Withdrawal before the nomination deadline frees a seat and promotes the next waitlisted nomination by FIFO.
  6. **(v2)** Every waitlist promotion writes an `audit_log` entry (who/when/from-position) so seat allocation in over-subscribed mandatory sessions is auditable; `waitlist_position` is recomputed and persisted.
- **Business Rules:**
  - `nominated_by ≠ approver` at each level (SoD). `UNIQUE(session, employee)`. Mandatory/campaign nominations cannot be self-withdrawn; only L&D with reason. Waitlist promotion is FIFO by `waitlist_position` (assigned at WAITLIST time, immutable except on promotion/withdrawal compaction).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_nominations` (`waitlist_position`,`training_campaign_id`) | C/R/U |
  | `training_sessions` | R/U (counts) |
  | `workflow_instances`/`tasks` | C/U |
  | `training_budgets` | R/U (commit) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sessions/{id}/nominations` |
  | POST | `/api/v1/nominations/{id}:approve` / `:reject` / `:withdraw` |
  | GET | `/api/v1/nominations?employeeId=&status=&sessionId=` |
  | GET | `/api/v1/training-sessions/{id}/waitlist` *(v2 — ordered by position)* |
- **UI Behavior Notes:** Nominate dialog with need linkage and cost preview; approver task inbox; **capacity/waitlist indicator showing explicit position** (v2); budget-impact banner; SoD prevents self-approve (button hidden).
- **Edge Cases:** Approve when full (auto-waitlist, position assigned); budget exhausted (409 BUDGET_EXCEEDED unless override); employee on leave/transferred mid-flow (flag, allow L&D decision); duplicate nomination (409); **concurrent withdrawals causing position compaction (atomic recompute)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `NominationService`, `ApprovalWorkflow`, `CapacityManager`, `WaitlistManager` *(v2)*, `BudgetCommitter` |
  | Backend Flow | Create → workflow L1→L2 → on approve: capacity check (transaction) → commit budget → APPROVED or WAITLISTED(position=max+1); on withdraw → promote head, audit, compact positions |
  | Data Operations | Insert nomination; atomic update enrolled_count + waitlist_position; update committed_amount |
  | Validation | SoD; unique(session,emp); budget availability; deadline for withdraw |
  | Authorization | Self/manager/L&D create; manager L1; L&D Mgr L2 |
  | State Changes & Side Effects | DRAFT→PENDING_L1→PENDING_L2→APPROVED/WAITLISTED/REJECTED→WITHDRAWN/COMPLETED/NO_SHOW; FIFO promotion audited |
  | Failure Handling | 409 budget/duplicate/capacity race (optimistic lock retry); rollback on partial |
  | Dependencies | FR-TSD-008, FR-TSD-016, FR-TSD-017; workflow engine |
  | Test Guidance | SoD; capacity race; **waitlist FIFO position + audit**; budget commit/rollback |

---

### FR-TSD-010 — Attendance Capture (incl. Proxy/Kiosk/Offline)
- **Module:** M07-TSD
- **Primary Role(s):** Trainer, L&D Officer, Kiosk Operator
- **User Story:** As a trainer, I want to mark per-day attendance for a session's roster — including for non-login field staff via kiosk/offline capture — so that completion and certification are accurate for the whole workforce.
- **Description:** Capture `training_attendance` per nomination per session-day with a **de-polymorphised `marked_by_actor_type`/`actor_id`** and a **`capture_mode`** (ONLINE/KIOSK/ASSISTED/OFFLINE_SYNC/LMS_DERIVED). Offline captures buffer on-device and sync via a batch (FR-TSD-022).
- **Acceptance Criteria:**
  1. Trainer/L&D/Kiosk Operator can mark attendance for each enrolled (APPROVED) nomination per session day.
  2. One attendance record per nomination per day (`UNIQUE`).
  3. Attendance below the program's minimum threshold marks the nomination ineligible for certification.
  4. A fully-absent nomination is auto-marked NO_SHOW at session completion.
  5. For e-learning, attendance is derived from LMS/LRS progress (FR-TSD-015) with `capture_mode=LMS_DERIVED`.
  6. **(v2)** Offline-captured attendance carries `offline_captured_at` + `offline_sync_batch_id`; on sync, server-side dedupe/reconcile applies and conflicts are surfaced for L&D resolution.
  7. **(v2)** Every record records the operator via `actor_type`/`actor_id` (no polymorphic ambiguity).
- **Business Rules:**
  - Attendance markable only for sessions in RUNNING/COMPLETED. Minimum attendance % (default 80) configurable per program. EXCUSED days excluded from the denominator.
  - **(v2)** Kiosk/assisted captures require an authenticated Kiosk Operator principal and are fully attributed in audit.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_attendance` (`marked_by_actor_*`,`capture_mode`,offline fields) | C/R/U |
  | `training_nominations` | R/U (completion) |
  | `documents` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/sessions/{id}/attendance` (bulk per day) |
  | GET | `/api/v1/sessions/{id}/attendance?date=` |
  | PATCH | `/api/v1/attendance/{id}` |
  | POST | `/api/v1/sessions/{id}/attendance:offline-sync` *(v2)* |
- **UI Behavior Notes:** Roster grid with day columns; bulk "mark all present"; per-cell status; upload signed sheet; attendance-% summary; **kiosk mode UI and offline indicator with pending-sync count** (v2); locked once COMPLETED (correction via L&D with audit).
- **Edge Cases:** Marking for non-approved nomination (403); duplicate day mark (409 upsert); session spanning weekends/holidays (only configured training days counted); **offline batch with stale device clock (server reconciles, flags skew)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AttendanceService`, `CompletionEvaluator`, `OfflineSyncReconciler` *(v2)* |
  | Backend Flow | Validate session state → upsert per-day records (actor_type) → on offline-sync dedupe by (nomination,date) → recompute attendance% → set completion eligibility |
  | Data Operations | Upsert training_attendance; update nomination on completion |
  | Validation | Session RUNNING/COMPLETED; unique(nom,date); EXCUSED denominator; actor attribution |
  | Authorization | Trainer for own session; L&D any; Kiosk Operator attributed; row scope |
  | State Changes & Side Effects | Drives nomination COMPLETED/NO_SHOW; cert eligibility flag |
  | Failure Handling | 403 non-roster; 409 duplicate; 422 wrong state; offline conflict queue |
  | Dependencies | FR-TSD-009; FR-TSD-015; FR-TSD-022 |
  | Test Guidance | Threshold math; EXCUSED; NO_SHOW; offline dedupe + clock skew; actor attribution |

---

### FR-TSD-011 — Assessment (Pre/Post) & Kirkpatrick Evaluation
- **Module:** M07-TSD
- **Primary Role(s):** Trainer, L&D Officer, Employee (feedback)
- **User Story:** As a trainer, I want to record pre/post assessment scores and collect Kirkpatrick feedback at the right level so that learning effectiveness and impact are measurable without specifying features that ship empty.
- **Description:** Append-only `training_assessments` (PRE/POST/REASSESSMENT, **de-polymorphised assessor**) and `training_feedback` across Kirkpatrick levels. **(v2)** L1/L2 are per-participant; **L3 (behaviour) and L4 (results) are explicitly optional, sampled, and programme-level**, and L4 links to named M14 business KPIs — not fictional per-employee T+90 surveys.
- **Acceptance Criteria:**
  1. Pre and post assessments can be recorded per nomination; POST result drives completion PASS/FAIL.
  2. Learning gain = POST − PRE is computed and reportable.
  3. Participants can submit L1/L2 feedback (anonymous-capable).
  4. Trainer `avg_feedback_rating` is derived from L1 ratings.
  5. A nomination with POST result FAIL is ineligible for certification (re-assessment allowed).
  6. **(v2)** L3/L4 feedback is captured at programme level on a **sample** of participants/cohorts, marked optional; the UI never blocks completion on missing L3/L4.
  7. **(v2)** L4 `responses_json` references one or more named M14 business-KPI keys to enable cost-per-outcome analysis.
  8. **(v2)** Assessment content (item banks, SCORM quizzes) meets WCAG 2.1 AA (FR-TSD-021).
- **Business Rules:**
  - `0 ≤ obtained_score ≤ max_score`; `result=PASS` iff `obtained ≥ pass_threshold`. Feedback ledger append-only and anonymisable. L4 can be session/org-level (nomination NULL).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_assessments` (`assessed_by_actor_*`) | Append |
  | `training_feedback` | Append |
  | `assessment_items` *(v2)* | R |
  | `training_nominations` | R/U (completion) |
  | `trainers` | U (rating) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/nominations/{id}/assessments` |
  | POST | `/api/v1/sessions/{id}/feedback` |
  | GET | `/api/v1/sessions/{id}/evaluation-summary` |
  | GET | `/api/v1/programs/{id}/l3l4-summary` *(v2 — sampled, programme-level)* |
- **UI Behavior Notes:** Score entry grid (auto pass/fail); learning-gain chart; feedback form (Likert + free text) with anonymity toggle; trainer scorecard; **Kirkpatrick dashboard clearly labelling L3/L4 as optional/sampled with KPI linkage** (v2).
- **Edge Cases:** Post without pre (gain not computable, flagged); anonymous feedback (PII stripped); re-assessment after fail (new append row, completion recomputed); **L3/L4 absent (shown as "not sampled", not an error)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `AssessmentLedger`, `FeedbackService`, `KirkpatrickAggregator`, `TrainerRatingJob` |
  | Backend Flow | Append assessment (actor_type) → compute result → update completion → feedback append → nightly trainer rating; L3/L4 sampled aggregation programme-level |
  | Data Operations | Insert assessments/feedback (append-only); update derived fields |
  | Validation | Score bounds; threshold; anonymity enforcement; KPI key presence on L4 |
  | Authorization | Trainer/L&D scores; participant feedback own; anonymity protected |
  | State Changes & Side Effects | POST→completion PASS/FAIL; drives certification eligibility |
  | Failure Handling | 422 score bounds; append-only ledgers |
  | Dependencies | FR-TSD-010, FR-TSD-012, FR-TSD-021; M14 KPI registry |
  | Test Guidance | Pass/fail; learning gain; anonymity; trainer rating; L3/L4 optional/sampled; KPI linkage |

---

### FR-TSD-012 — Certification, Enforced Validity & Renewal; Mandatory Compliance
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (issue), L&D Manager (approve revoke)
- **User Story:** As an L&D Officer, I want to issue certificates, and have validity **enforced** — not merely notified — with automatic renewal so that statutory training obligations are continuously met and lapses are actionable.
- **Description:** Issue `certifications` on completion, generate certificate numbers and PDFs (M13), track `valid_until` and renewal, auto-expire, support revocation (workflow), and produce a mandatory-compliance currency view. **(v2)** On mandatory-cert expiry the system **auto-creates a renewal training need + campaign re-nomination** and sets `lapsed_mandatory=true`, a flag consumable by M06 sensitive-duty/posting checks.
- **Acceptance Criteria:**
  1. A certificate issues only when the nomination is COMPLETED with attendance threshold met and POST=PASS (where applicable).
  2. `certificate_no` is unique and immutable; a PDF is generated and stored via M13.
  3. Certificates past `valid_until` auto-transition to EXPIRED nightly and notify employee/manager.
  4. Renewal reminders fire at configurable lead times (60/30/7 days).
  5. A mandatory-compliance dashboard shows each employee's required vs held vs lapsed mandatory certs.
  6. **(v2)** On EXPIRED of a **mandatory** cert, the system auto-creates a renewal `training_need` (`renewal_need_id`) and enrolls the employee into the relevant rolling campaign (FR-TSD-017).
  7. **(v2)** `lapsed_mandatory=true` is set on expiry and exposed via API for M06 to block sensitive duty/posting.
  8. **(v2)** Lapse is cleared only when a fresh valid mandatory cert is issued (SUPERSEDED chain).
- **Business Rules:**
  - Revocation requires L&D Manager approval + reason; sets REVOKED and (if posted) flags an SR correction. Issuing a renewable cert updates linked `employee_skill.expires_on` and `last_validated_at`. Significant/mandatory certs trigger SR posting (FR-TSD-016) with `sr_posting_status=PENDING`.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `certifications` (`lapsed_mandatory`,`renewal_need_id`) | C/R/U |
  | `documents` | C (PDF) |
  | `employee_skills` | U (expiry) |
  | `training_needs` | C (renewal) |
  | `service_register_events` | (via FR-016) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/nominations/{id}:issue-certificate` |
  | GET | `/api/v1/employees/{empId}/certifications` |
  | POST | `/api/v1/certifications/{id}:revoke` |
  | GET | `/api/v1/compliance/mandatory-status?orgUnitId=` |
  | GET | `/api/v1/employees/{empId}/lapsed-mandatory` *(v2 — M06 consumer)* |
- **UI Behavior Notes:** Certificate issue action with eligibility check; certificate viewer/download; expiry timeline; renewal reminder banners; compliance heatmap with drill-down; **lapsed-mandatory badge and auto-renewal status** (v2).
- **Edge Cases:** Issue when ineligible (403 with reasons); duplicate issue (409); revoke a posted cert (workflow + SR correction); lifetime cert (`valid_until` NULL); **expiry with no active renewal program/campaign (escalates to L&D)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CertificationService`, `CertPdfGenerator`, `ExpiryReminderJob`, `RenewalOrchestrator` *(v2)*, `ComplianceTracker` |
  | Backend Flow | Verify eligibility → generate no+PDF → persist → update skill expiry → enqueue SR posting → schedule reminders; on expiry: set lapsed_mandatory, create renewal need, enroll campaign |
  | Data Operations | Insert certification; create document; update employee_skills; insert renewal need; SR enqueue |
  | Validation | Eligibility; unique cert_no; valid_until > issue |
  | Authorization | L&D issue; L&D Mgr revoke; employee read-own; M06 read lapsed flag |
  | State Changes & Side Effects | ACTIVE→EXPIRED/REVOKED/SUPERSEDED; notifications; SR posting; auto re-nomination |
  | Failure Handling | 403 ineligible; 409 duplicate; SR failure → FAILED + retry |
  | Dependencies | FR-TSD-010/011, FR-TSD-016, FR-TSD-017, M13, M06 (consumer) |
  | Test Guidance | Eligibility gate; expiry job; **lapsed flag + auto-renewal**; reminder schedule; compliance rollup |

---

### FR-TSD-013 — Induction / Onboarding Training Program
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer, HR Officer, Reporting Manager
- **User Story:** As an L&D Officer, I want new entrants auto-enrolled into a structured induction program with tracked completion so that onboarding is consistent and compliant.
- **Description:** On a new-joiner event from M01 (**pinned joiner contract §10.6**), auto-create induction needs and nominations into the configured induction program/learning path, track completion within an onboarding window, and escalate non-completion.
- **Acceptance Criteria:**
  1. A new-joiner event (M01 `date_of_joining`) triggers auto-nomination into the active induction program(s).
  2. Induction completion is tracked against an onboarding window (30/60/90 days).
  3. Non-completion within the window escalates to manager and L&D.
  4. Induction modules can be classroom, e-learning, or blended and reuse FR-TSD-007 programs.
  5. Induction completion contributes to mandatory-compliance status (FR-TSD-012).
  6. **(v2)** The joiner event conforms to the pinned M01 contract; missing/late events are reconciled idempotently.
- **Business Rules:**
  - Induction nominations are type=INDUCTION and may auto-approve per policy. The induction program/path is configurable per cadre/designation. Missing induction is a surfaced compliance exception.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_needs` (source=INDUCTION) | C |
  | `training_nominations` (type=INDUCTION) | C |
  | `learning_paths` | R |
  | M01 joiner event (pinned) | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/induction:enroll` (event-driven + manual) |
  | GET | `/api/v1/induction/status?orgUnitId=` |
- **UI Behavior Notes:** Onboarding tracker per joiner with module checklist; manager team view; overdue flags; configurable induction template editor.
- **Edge Cases:** Late joiner data sync (back-dated window); transfer during induction (follows employee); re-induction on re-employment.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `InductionService`, `JoinerEventListener`, `OnboardingTracker` |
  | Backend Flow | Consume joiner event (pinned contract) → resolve template by cadre → auto-create needs+nominations → track window → escalate |
  | Data Operations | Insert needs+nominations; track completion; notifications |
  | Validation | One active induction per joiner; window dates |
  | Authorization | L&D/HR; manager read team |
  | State Changes & Side Effects | Auto-enrol; completion feeds compliance; escalations |
  | Failure Handling | Idempotent on duplicate joiner events; retry on M01 lag |
  | Dependencies | FR-TSD-007/009/012/014; M01 (pinned contract) |
  | Test Guidance | Event idempotency; window escalation; transfer continuity |

---

### FR-TSD-014 — Learning Paths, Recommendations, CPD & Skills Marketplace (Phase 2)
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (curate), Employee (consume), Reporting Manager
- **User Story:** As an employee, I want personalised learning paths, skill-based recommendations, CPD tracking, and a skills marketplace so that I can grow toward my role and aspirations.
- **Description:** Curate `learning_paths` + `learning_path_items`; generate gap-driven recommendations; track `cpd_records`; expose a skills marketplace. **(v2)** The **recommendation engine and marketplace are feature-flagged Phase-2** capabilities gated on framework-curation evidence (§2.5); CPD tracking ships at launch, CPD targets are Phase 2. Learning paths (curated) ship at launch.
- **Acceptance Criteria:**
  1. L&D can curate published learning paths; the recommendation engine (when `ff.recommendations` ON) can generate suggested paths from gaps.
  2. An employee sees a ranked recommendation list mapped to their critical gaps (when flag ON).
  3. Completing a program awards CPD credits per `cpd_credits`, appended to `cpd_records`.
  4. CPD totals are aggregated per credit year; CPD **targets** shown only when `ff.cpd.targets` ON.
  5. The skills marketplace (when `ff.marketplace` ON) lists employees with surplus proficiency as mentors/SMEs, **opt-in only**.
  6. **(v2)** With developmental flags OFF, screens show curated paths + CPD tracking and clearly mark recommendation/marketplace as "coming in Phase 2", never broken/empty controls.
- **Business Rules:**
  - Recommendations prioritise CRITICAL > HIGH gaps and mandates. CPD append-only, credits ≥ 0, verified flagged. Marketplace opt-in (consent) and DPDP-respecting; opt-out hides the employee entirely (and FR-TSD-023 erases presence on exit).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `learning_paths`, `learning_path_items` | C/R/U |
  | `cpd_records` | Append |
  | `skill_gap_items`, `employee_skills` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/employees/{empId}/recommendations` *(flagged)* |
  | POST | `/api/v1/learning-paths` |
  | GET | `/api/v1/employees/{empId}/cpd?year=` |
  | GET | `/api/v1/marketplace/skills?skillId=` *(flagged)* |
- **UI Behavior Notes:** Path explorer with progress rings; recommendation cards tied to gaps (flagged); CPD dashboard; marketplace directory with opt-in toggle (flagged); **Phase-2 capabilities clearly badged when off**.
- **Edge Cases:** No gaps (growth/aspiration paths); CPD double-count guarded by `source_ref`; marketplace opt-out hides employee.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LearningPathService`, `RecommendationEngine` *(flagged)*, `CpdLedger`, `MarketplaceService` *(flagged)* |
  | Backend Flow | Resolve gaps → rank programs → render recommendations (if flag); on completion append CPD; marketplace queries surplus skills (if flag) |
  | Data Operations | Insert paths/items; append cpd_records; read gap/skill data |
  | Validation | CPD ≥ 0; dedupe by source_ref; opt-in consent; flag gating |
  | Authorization | L&D curate; employee own; manager team |
  | State Changes & Side Effects | CPD accrual; recommendation cache; marketplace visibility |
  | Failure Handling | Graceful empty/Phase-2 states; consent enforcement |
  | Dependencies | FR-TSD-004/007/011; feature-flag service |
  | Test Guidance | Ranking; CPD dedupe; consent/visibility; flag on/off rendering |

---

### FR-TSD-015 — LMS/LRS Integration (SCORM Poll / xAPI LRS) & E-Learning Sync
- **Module:** M07-TSD
- **Primary Role(s):** SysAdmin (config), L&D Officer, Employee (learner)
- **User Story:** As an L&D Officer, I want e-learning enrolments to sync progress and completion from the LMS via a **technically correct** mechanism (xAPI LRS or SCORM reporting-API poll) so that online learning is tracked without manual entry and without relying on a non-existent SCORM webhook.
- **Description:** **(v2, Risk #1 — full rewrite.)** SCORM 1.2/2004 has **no server-to-server completion push**; its run-time API is client-side inside the hosting LMS. v2 therefore models integration explicitly:
  - **xAPI:** content emits statements to a **Learning Record Store (LRS)** (`learning_record_stores.connector_type=LRS_XAPI`); M07 ingests statements from the LRS (idempotent by `lms_statement_id`).
  - **SCORM:** M07 **polls the hosting LMS reporting API** (`connector_type=LMS_REPORTING_API`, `sync_mode=SCORM_POLL`) on `poll_interval_minutes`, advancing `last_poll_cursor`. **No webhook push is assumed.**
  - **Self-hosted SCORM:** if content is hosted in-platform (`SCORM_SELF_HOSTED`), a content player + sequencing engine consumes the client-side run-time and writes progress server-side.
  - **Single-vs-multi-LMS:** exactly one `is_primary` LRS/LMS is the system of record (§5.6 rule 18); others are secondary read sources. Content hosting ownership is declared per `lms_content_packages.hosting`.
- **Acceptance Criteria:**
  1. Approving a nomination for an e-learning program provisions an `lms_enrollment` bound to a `learning_record_stores` connector and (if self-hosted) an `lms_content_packages` version.
  2. Learners launch the course via SSO deep-link; no separate LMS login.
  3. **(v2)** For xAPI, completion/progress is ingested from the **LRS**; for SCORM, via **scheduled poll of the LMS reporting API** — not a push webhook.
  4. xAPI statements are idempotent — a repeated `lms_statement_id` is ignored; SCORM polls are idempotent by cursor + enrolment.
  5. Completion auto-derives attendance (`capture_mode=LMS_DERIVED`) and triggers certification eligibility.
  6. **(v2)** Persistent sync failure flags the enrolment for manual reconciliation; the connector exposes health metrics (sync lag, last cursor).
- **Business Rules:**
  - Supported standards: SCORM 1.2, SCORM 2004, xAPI; NONE for non-tracked. `progress_pct` ∈ [0,100]; COMPLETED requires progress ≥ program criterion. Sync failures retry with backoff. **No integration path assumes a SCORM server push.**
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `lms_enrollments` (`learning_record_store_id`,`lms_content_package_id`,`sync_mode`,`last_poll_cursor`) | C/R/U |
  | `learning_record_stores` | R |
  | `lms_content_packages` | R |
  | `training_nominations` | R/U |
  | `training_attendance` | C (derived) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/lms/enrollments` (auto on approval) |
  | GET | `/api/v1/lms/enrollments/{id}/launch` (SSO deep-link) |
  | POST | `/api/v1/lms/xapi/ingest` *(v2 — pull/forward from LRS, idempotent by statementId)* |
  | POST | `/api/v1/lms/scorm/poll` *(v2 — internal scheduled poll trigger)* |
  | GET | `/api/v1/lms/connectors/health` *(v2)* |
- **UI Behavior Notes:** "Launch course" button; progress bar synced; completion badge; **connector health panel (sync mode, lag, cursor)**; reconciliation queue for failed syncs; admin LRS/LMS config panel (endpoint, keys via env/secret manager, standard, **primary toggle**).
- **Edge Cases:** Duplicate xAPI statement (ignored); LMS down (poll retried, queued); partial progress then withdrawal (enrolment cancelled, progress retained for audit); clock skew on statement timestamps; **misconfigured "webhook" expectation rejected by design** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `LmsConnectorService`, `LrsXapiIngestor` *(v2)*, `ScormPollWorker` *(v2)*, `SelfHostedScormPlayer` *(v2, optional)*, `SsoLauncher`, `SyncRetryWorker` |
  | Backend Flow | On approval provision enrolment bound to connector → SSO launch → ingest (xAPI from LRS, idempotent) OR poll LMS reporting API (advance cursor) → update progress → derive attendance/completion |
  | Data Operations | Upsert lms_enrollments keyed by statement id / poll cursor; insert derived attendance |
  | Validation | Standard enum; progress bounds; idempotency (statement id / cursor); single primary connector |
  | Authorization | SysAdmin config; learner launch-own; ingest via signed service auth |
  | State Changes & Side Effects | NOT_STARTED→IN_PROGRESS→COMPLETED/FAILED; feeds FR-010/012 |
  | Failure Handling | Retry+backoff; reconciliation queue; health metrics |
  | Dependencies | FR-TSD-007/009/010/012/021; SSO; secrets via env; LRS/LMS |
  | Test Guidance | xAPI idempotency; SCORM poll cursor idempotency; completion derivation; primary-connector invariant; no-webhook design |

---

### FR-TSD-016 — Service Register Posting (with `is_significant` Rule Set) & Budget/Cost Tracking
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer/Manager, Finance/Budget Controller, SR Custodian (receive)
- **User Story:** As an L&D Manager, I want significant trainings and qualifications posted to the Digital Service Register using a **pinned, auditable significance rule** and full budget/cost tracking on a **single canonical key** so that statutory records are complete and spend reconciles.
- **Description:** Post significant training completions and certifications as append-only `service_register_events` to M12 (idempotent, retry/failure handling, **pinned event contract §10.6**), and maintain `training_budgets`/`training_costs` with planned→committed→actual tracking on the **canonical (FY, org_unit) key**, reimbursement/bond-recovery payable feed to M10, cost-per-completion, and budget variance reporting. **(v2)** Significance is resolved by an explicit, configurable `is_significant` rule set (promoted from former Appendix D).
- **Acceptance Criteria:**
  1. The `is_significant` rule set determines posting: a completion/cert is significant if **any** of: (a) mandatory certification, (b) externally accredited/professional credential (FR-TSD-018), (c) program duration ≥ configured threshold, (d) flagged promotion-relevant (M06), (e) sponsored degree/deputation (FR-TSD-020). The resolved decision and matched rule(s) are stored and auditable.
  2. Significant items post to M12 as append-only SR events conforming to the pinned contract (idempotent by source ref).
  3. Posting state is tracked (NOT_REQUIRED/PENDING/POSTED/FAILED) with automatic retry on FAILED.
  4. Approved nominations commit cost to the relevant `training_budget` (`committed_amount`) at the canonical key.
  5. Actual costs reduce remaining budget and reconcile to invoices.
  6. Reimbursement/bond-recovery costs flagged `payable_to_payroll` emit an approved-payable feed to M10.
  7. Budget variance (allocated vs committed vs actual) is reportable per org-unit/FY; **category/competency are reporting dimensions only**.
  8. **(v2)** `cost_per_completion` is computed (actual cost ÷ completions) for ROI analytics (FR-TSD-011 L4 linkage).
- **Business Rules:**
  - SR events append-only; corrections post a new corrective event. `committed + actual ≤ allocated` at the canonical key unless overrun allowed (FROZEN blocks all new commitment). Cost approver ≠ creator (SoD); payable feed only for APPROVED costs.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `service_register_events` (M12, pinned contract) | Append |
  | `certifications` | U (sr_posting_status) |
  | `training_budgets` | C/R/U |
  | `training_costs` (`vendor_empanelment_id`,`training_sponsorship_id`) | C/R/U |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/certifications/{id}:post-to-sr` (also auto) |
  | POST | `/api/v1/training-budgets`, `/api/v1/training-costs` |
  | GET | `/api/v1/training-budgets/variance?fy=&orgUnitId=` |
  | GET | `/api/v1/analytics/cost-per-completion?programId=&fy=` *(v2)* |
  | GET | `/api/v1/significance/evaluate?nominationId=` *(v2 — rule trace)* |
- **UI Behavior Notes:** SR posting status chips with retry; budget dashboard (allocated/committed/actual bars at canonical key, variance %, **cost-per-completion**); **significance rule-trace tooltip** (v2); cost entry with invoice upload; payable-to-payroll toggle; reconciliation view.
- **Edge Cases:** SR posting timeout (PENDING→retry→FAILED with alert); double-post prevented by idempotency key; budget overrun (409 unless override+approval); FROZEN blocks commitment; banker's rounding INR (§5.6 rule 16); **significance rule conflict (most-inclusive wins, logged)** (v2).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SignificanceResolver` *(v2)*, `SrPostingService`, `BudgetService`, `CostService`, `PayrollPayableEmitter`, `RetryWorker` |
  | Backend Flow | On completion → resolve `is_significant` (rule trace) → build SR event (pinned contract, idempotency key=cert/nomination id) → POST M12 → POSTED/FAILED; budget commit on approval (canonical key); actual reconcile; payable feed; compute cost-per-completion |
  | Data Operations | Append SR event; update cert posting status; update budget committed/actual; insert costs |
  | Validation | Significance rule eval; idempotency; append-only; non-overcommit at canonical key; SoD |
  | Authorization | L&D/Mgr post; Finance budget/cost; SR Custodian receive |
  | State Changes & Side Effects | sr_posting_status transitions; budget commit/actual; payroll feed |
  | Failure Handling | Retry+backoff; FAILED alert; 409 overrun/duplicate; transaction on cost+budget |
  | Dependencies | FR-TSD-009/012/018/020; M12-SR (pinned contract); M10-PAY |
  | Test Guidance | Significance rule matrix; idempotent posting; retry; canonical-key invariant; SoD; cost-per-completion |

---

### FR-TSD-017 — Mandatory-Compliance Campaign Engine *(new, Risk #2 Critical)*
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (run), L&D Manager (approve), Dept Head (sanction scope)
- **User Story:** As an L&D Officer, I want to launch a mandatory-training campaign that bulk-nominates an entire scope (org-unit/cadre/designation/all-staff), auto-waves participants into capacity-bounded sessions, drives rolling annual renewal, and escalates non-completion so that ~200k annual mandatory completions are actually achievable.
- **Description:** Create `training_campaigns` and resolve `campaign_targets` for the scope (honouring the **coverage denominator rule**). Bulk-create nominations (`nomination_type=CAMPAIGN`) and auto-assign waves into sessions up to `wave_size`/capacity, creating sessions as needed. Run a **rolling-renewal scheduler** (`renewal_cadence_months`) that re-targets employees whose certs near expiry, and an **escalation engine** by lead times. Reaches non-login staff via FR-TSD-022.
- **Acceptance Criteria:**
  1. A campaign resolves its target population from scope and the coverage denominator rule, marking ineligible targets EXEMPT with reason.
  2. `:enroll-batch` bulk-creates nominations for all eligible targets idempotently (re-running does not duplicate).
  3. `auto_wave=true` assigns targets to waves and capacity-bounded sessions, creating additional sessions when capacity is exceeded.
  4. A rolling-renewal scheduler re-targets employees `renewal_cadence_months` before cert expiry (ties to FR-TSD-012 auto-renewal).
  5. Escalation fires per `escalation_policy_json` to employee→manager→L&D as due dates approach/pass; `escalation_level` increments.
  6. A campaign dashboard shows coverage % (against eligible denominator), per-wave progress, overdue list, and exemptions.
  7. **(v2)** Completion of a campaign target updates `campaign_targets.target_status` and feeds mandatory-compliance status (FR-TSD-012).
- **Business Rules:**
  - Bulk nomination respects per-session capacity and budget (FR-TSD-009/016); over-capacity spills to new waves/sessions, never breaks the capacity invariant.
  - Campaign nominations are mandatory and cannot be self-withdrawn (§5.6 rule 11).
  - Coverage % always uses the eligible denominator (§5.6 rule 15); exemptions are explicit and audited.
  - A campaign cannot move to RUNNING without an approved scope and a published mandatory program.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_campaigns` | C/R/U |
  | `campaign_targets` | C/R/U |
  | `training_nominations` (CAMPAIGN) | C |
  | `training_sessions` | C/R/U (auto-wave) |
  | `employees`, `org_units` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-campaigns` |
  | POST | `/api/v1/training-campaigns/{id}:approve` |
  | POST | `/api/v1/training-campaigns/{id}:enroll-batch` |
  | POST | `/api/v1/training-campaigns/{id}:auto-wave` |
  | GET | `/api/v1/training-campaigns/{id}/coverage?orgUnitId=` |
  | GET | `/api/v1/training-campaigns/{id}/overdue` |
- **UI Behavior Notes:** Campaign wizard (program, scope, window, renewal cadence, denominator rule, wave size, escalation); coverage dashboard with eligible/exempt/overdue breakdown; wave board; bulk-action confirmations with impact preview (target count, sessions to be created, budget impact).
- **Edge Cases:** Scope changes mid-campaign (re-resolve targets, additive only, audited); employee transfers (target follows employee/org per policy); insufficient capacity org-wide (auto-create sessions or surface a scheduling gap); re-running enroll-batch (idempotent); employees on long leave (EXEMPT per denominator rule).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `CampaignService`, `TargetResolver`, `BatchEnroller`, `AutoWaveScheduler`, `RollingRenewalScheduler`, `EscalationEngine` |
  | Backend Flow | Resolve targets (denominator) → approve → enroll-batch (idempotent) → auto-wave into capacity-bounded sessions (create as needed) → track completion → escalate → rolling renewal re-targets pre-expiry |
  | Data Operations | Insert campaign+targets; bulk insert nominations; create sessions; update target_status |
  | Validation | Capacity invariant on wave; idempotent batch; eligible denominator; mandatory program published |
  | Authorization | L&D run; L&D Mgr approve; Dept Head sanction scope |
  | State Changes & Side Effects | Campaign DRAFT→APPROVED→RUNNING→PAUSED/COMPLETED/CANCELLED; targets PENDING→NOMINATED→IN_PROGRESS→COMPLETED/OVERDUE/EXEMPT/FAILED |
  | Failure Handling | Partial batch failure → resumable; capacity exhaustion → scheduling-gap alert; idempotency keys per (campaign,employee) |
  | Dependencies | FR-TSD-007/008/009/012/016/022 |
  | Test Guidance | Idempotent batch; auto-wave capacity safety; rolling renewal timing; escalation ladder; coverage math |

---

### FR-TSD-018 — External & Professional Credential Capture & Verification *(new, Risk #6)*
- **Module:** M07-TSD
- **Primary Role(s):** Employee (submit), L&D Officer (verify), L&D Manager (approve)
- **User Story:** As an employee, I want to record externally-acquired professional credentials (e.g., PMP, CISA, a statutory licence) with evidence so that my significant qualifications are recognised and posted to the service register regardless of who delivered the training.
- **Description:** Capture `certifications` with `credential_source=EXTERNAL_PROFESSIONAL`, `issuing_body`, `external_reference_no`, and verification workflow recorded in the append-only `credential_verifications` ledger. Verified significant credentials are eligible for SR posting (FR-TSD-016) and can populate the skill inventory.
- **Acceptance Criteria:**
  1. An employee/L&D can create an external credential with issuing body, reference number, dates, and evidence document.
  2. Verification routes through L&D: SUBMITTED→EVIDENCE_REVIEWED→VERIFIED/REJECTED, each appended to `credential_verifications`.
  3. A VERIFIED credential with a renewable validity sets `valid_until` and can update `employee_skills`.
  4. A VERIFIED credential meeting the `is_significant` rule (FR-TSD-016) becomes SR-posting eligible.
  5. Self-capture creator ≠ verifier (SoD).
  6. **(v2)** Rejected credentials retain the immutable verification trail and are not deleted.
- **Business Rules:**
  - External credentials need not link a `training_program_id`. Verification method recorded (DOCUMENT/ISSUER_PORTAL/THIRD_PARTY/MANUAL_ATTEST). Only VERIFIED credentials post to SR.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `certifications` (EXTERNAL_PROFESSIONAL fields) | C/R/U |
  | `credential_verifications` | Append |
  | `documents` | R |
  | `employee_skills` | U (optional) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/employees/{empId}/external-credentials` |
  | POST | `/api/v1/external-credentials/{id}:verify` / `:reject` |
  | GET | `/api/v1/employees/{empId}/external-credentials` |
- **UI Behavior Notes:** Credential submission form (body, reference, dates, evidence upload); verification queue for L&D with evidence viewer; status badges (Pending/Verified/Rejected); SR-eligibility indicator.
- **Edge Cases:** Duplicate external reference for same employee (409); evidence missing on submit (422 if policy requires); verifier = submitter (403 SoD); credential expiry behaves like FR-TSD-012.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ExternalCredentialService`, `VerificationLedger`, `SignificanceResolver` (shared) |
  | Backend Flow | Create credential (EXTERNAL_PROFESSIONAL) → submit → L&D review (append ledger) → VERIFIED → optional skill update → significance eval → SR-eligibility |
  | Data Operations | Insert certification; append credential_verifications; optional employee_skills update |
  | Validation | SoD; evidence policy; unique external ref; verification status transitions |
  | Authorization | Employee submit-own; L&D verify; L&D Mgr approve significant |
  | State Changes & Side Effects | verification_status NOT_REQUIRED→PENDING→VERIFIED/REJECTED; SR posting if significant |
  | Failure Handling | 403 SoD; 409 duplicate; 422 missing evidence |
  | Dependencies | FR-TSD-012/016; M13 |
  | Test Guidance | Verification trail immutability; SoD; significance eligibility; skill propagation |

---

### FR-TSD-019 — Vendor / External-Trainer Empanelment & Procurement Linkage *(new, Risk #15)*
- **Module:** M07-TSD
- **Primary Role(s):** Vendor/Empanelment Manager, L&D Manager (approve), Finance
- **User Story:** As an L&D Manager, I want external trainers/providers empanelled with contract and procurement references so that external training costs tie to an approved vendor and public-sector procurement controls are honoured.
- **Description:** Maintain `vendor_empanelments` with empanelment status, contract/procurement references, validity, and rate cards; link external `trainers` and external `training_costs` to an empanelled vendor.
- **Acceptance Criteria:**
  1. A vendor empanelment captures name, empanelment ref, contract/procurement refs, validity, and rate card.
  2. Empanelment requires approval (requester ≠ approver, SoD); status flows DRAFT→PENDING_APPROVAL→EMPANELLED.
  3. External trainers may be linked to an EMPANELLED vendor; sessions with external trainers require valid empanelment (FR-TSD-008).
  4. External `training_costs` must reference an EMPANELLED vendor within validity.
  5. Suspended/blacklisted/expired vendors cannot be assigned to new sessions or costs.
- **Business Rules:**
  - `empanelment_ref` unique. Empanelment validity must cover session/cost dates. Blacklisting cascades a block on new assignments (existing history preserved).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `vendor_empanelments` | C/R/U |
  | `trainers` | R/U (link) |
  | `training_costs` | R (linkage) |
  | `documents` | R (contract) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/vendor-empanelments` |
  | POST | `/api/v1/vendor-empanelments/{id}:approve` / `:suspend` / `:blacklist` |
  | GET | `/api/v1/vendor-empanelments?status=&validOn=` |
- **UI Behavior Notes:** Empanelment register with status and validity; contract/procurement reference fields and document upload; rate-card editor; approval workflow stepper; block warnings on assigning non-empanelled vendors.
- **Edge Cases:** Cost referencing expired empanelment (409); blacklisting a vendor with active sessions (block new, flag existing); duplicate empanelment ref (409); self-approval (403).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `EmpanelmentService`, `EmpanelmentValidator` (shared with FR-008/016) |
  | Backend Flow | Create → approve (SoD) → link trainers/costs → validity & status checks on assignment |
  | Data Operations | Insert/update vendor_empanelments; FK linkage on costs/trainers |
  | Validation | Unique ref; validity coverage; SoD; status gates |
  | Authorization | Vendor Mgr maintain; L&D Mgr approve; Finance read |
  | State Changes & Side Effects | DRAFT→PENDING_APPROVAL→EMPANELLED→SUSPENDED/EXPIRED/BLACKLISTED |
  | Failure Handling | 409 duplicate/assignment; 403 SoD |
  | Dependencies | FR-TSD-008/016 |
  | Test Guidance | Validity gating; blacklist cascade; SoD; cost linkage |

---

### FR-TSD-020 — Sponsorship / Study-Leave / Deputation & Service-Obligation *(new, Risk #15)*
- **Module:** M07-TSD
- **Primary Role(s):** Employee (request), Reporting Manager (recommend), Dept Head (sanction), Finance (recovery)
- **User Story:** As an appointing authority, I want to sanction long-duration sponsored training (degrees, deputation, study-leave) with a service bond and track the obligation so that public funds are recoverable on breach.
- **Description:** Model `training_sponsorships` with sponsored amount, service-bond duration, derived bond-end date, obligation status, and breach→recovery handling that feeds a `BOND_RECOVERY` cost to M10 (FR-TSD-016).
- **Acceptance Criteria:**
  1. A sponsorship captures type, sponsored amount, dates, bond months, and links a program or external course.
  2. Sanction routes through recommend→sanction (Dept Head); status flows PROPOSED→SANCTIONED→ACTIVE.
  3. On completion the bond becomes ACTIVE until `bond_end_date`; fulfilling the term sets FULFILLED.
  4. Early exit/breach sets BREACHED and computes `bond_recovery_amount` (pro-rata per policy).
  5. **(v2)** A BREACHED bond must emit a `BOND_RECOVERY` cost (`payable_to_payroll`) before moving to RECOVERED (§5.6 rule 17).
  6. Waivers require authority approval and are audited (WAIVED).
- **Business Rules:**
  - `bond_end_date = completion_date + service_bond_months`. Recovery amount per configurable pro-rata formula. Bond recoveries route to M10 via the payable feed.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_sponsorships` | C/R/U |
  | `training_costs` (SPONSORSHIP, BOND_RECOVERY) | C |
  | `training_programs` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/training-sponsorships` |
  | POST | `/api/v1/training-sponsorships/{id}:sanction` / `:mark-breached` / `:waive` |
  | POST | `/api/v1/training-sponsorships/{id}:compute-recovery` |
  | GET | `/api/v1/training-sponsorships?status=&employeeId=` |
- **UI Behavior Notes:** Sponsorship request form; approval stepper; bond timeline with end date; breach action with computed recovery preview; recovery-to-payroll status; waiver dialog with reason.
- **Edge Cases:** Resignation during bond (auto-flag BREACHED, compute recovery); transfer within org (bond continues); waiver after partial recovery (audited); deceased/retired (policy-driven waiver).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `SponsorshipService`, `BondCalculator`, `RecoveryEmitter` (to M10) |
  | Backend Flow | Request → recommend → sanction → ACTIVE on completion → monitor bond → on breach compute recovery → emit BOND_RECOVERY cost → RECOVERED/WAIVED |
  | Data Operations | Insert/update training_sponsorships; insert cost on recovery |
  | Validation | Bond date derivation; recovery formula; recovery cost before RECOVERED |
  | Authorization | Employee request; Manager recommend; Dept Head sanction; Finance recovery |
  | State Changes & Side Effects | PROPOSED→SANCTIONED→ACTIVE→FULFILLED/BREACHED→RECOVERED/WAIVED; payroll feed |
  | Failure Handling | Block RECOVERED without recovery cost; audit waivers |
  | Dependencies | FR-TSD-016; M10-PAY; M05 (relieving) for breach detection |
  | Test Guidance | Bond derivation; pro-rata recovery; breach→recovery→payroll; waiver audit |

---

### FR-TSD-021 — Content & Assessment-Item Management *(new, Risk #12, #16)*
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (author/curate), SysAdmin (host config), Auditor (read)
- **User Story:** As an L&D Officer, I want to author and version SCORM/xAPI content packages and assessment item banks with accessibility metadata so that e-learning and tests are hosted, versioned, and WCAG-conformant — not just a loose document reference.
- **Description:** Manage `lms_content_packages` (versioned SCORM/xAPI/self-hosted packages with `hosting` and `wcag_conformance`) and `assessment_items` (item bank with question types, keys, versions, accessibility). Content may be self-hosted (player in FR-TSD-015) or delegated to an external LMS with a documented contract.
- **Acceptance Criteria:**
  1. A content package is versioned per program with a declared standard and hosting model.
  2. Packages and items carry `wcag_conformance` (AA/A/NON_CONFORMANT/UNKNOWN); NON_CONFORMANT content cannot be PUBLISHED for mandatory programs without an accessibility-exception approval.
  3. Assessment items support single/multi-choice, true/false, numeric, free-text, with versioning; correct keys are RBAC-restricted.
  4. Publishing a new package version supersedes the prior for new enrolments; in-flight enrolments retain their launched version.
  5. **(v2)** Content accessibility is testable and reported; assessment content meets WCAG 2.1 AA (extends §9).
- **Business Rules:**
  - `UNIQUE(training_program_id, package_version)`. Correct keys never returned to learners. Self-hosted packages store the binary via M13.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `lms_content_packages` | C/R/U/Retire |
  | `assessment_items` | C/R/U/Retire |
  | `training_programs`, `documents` | R |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/content-packages` |
  | POST | `/api/v1/assessment-items` |
  | GET | `/api/v1/programs/{id}/content-packages` |
  | PATCH | `/api/v1/content-packages/{id}` (`:publish`,`:retire`) |
- **UI Behavior Notes:** Package manager with version history, standard, hosting, WCAG badge; item-bank editor with type-specific fields and accessibility checklist; key fields masked for non-authors; accessibility-exception workflow.
- **Edge Cases:** NON_CONFORMANT mandatory content (blocked without exception); duplicate version (409); retiring a package with active enrolments (in-flight retain version); leaking correct keys (forbidden by RBAC).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `ContentPackageService`, `ItemBankService`, `AccessibilityGate` |
  | Backend Flow | Author → validate (WCAG, standard) → publish (version) → bind to program/FR-015; items served without keys to learners |
  | Data Operations | Insert/update content packages + items; store binaries via M13 |
  | Validation | Unique version; WCAG gate for mandatory; key RBAC |
  | Authorization | L&D author; SysAdmin host config; learner read sans keys |
  | State Changes & Side Effects | DRAFT→PUBLISHED→RETIRED; supersession on new version |
  | Failure Handling | 409 duplicate; 422 WCAG gate; exception workflow |
  | Dependencies | FR-TSD-007/011/015; M13 |
  | Test Guidance | Versioning/supersession; WCAG gating; key confidentiality |

---

### FR-TSD-022 — Proxy / Kiosk / Assisted Mode & Offline Attendance Sync *(new, Risk #9)*
- **Module:** M07-TSD
- **Primary Role(s):** Kiosk Operator, Reporting Manager (proxy), L&D Officer
- **User Story:** As a Kiosk Operator, I want to launch e-learning, capture self-assessment, and record attendance on behalf of non-login field/clerical staff — including offline with later sync — so that the whole workforce is reachable and compliance KPIs are attainable.
- **Description:** Provide an attributed assisted/kiosk mode for skill self-assessment, e-learning launch, and attendance capture for employees without an individual login, plus offline buffering and reconciliation. Defines the **compliance-coverage denominator** (who is in-scope vs exempt) used by campaigns (FR-TSD-017).
- **Acceptance Criteria:**
  1. A Kiosk Operator authenticates and selects an employee (by service_no) to assist; all actions are attributed to both operator and employee in audit.
  2. Assisted self-assessment writes `employee_skills`/`skill_assessments` with source=SELF and operator attribution.
  3. Kiosk e-learning launch maps the employee to an `lms_user_ref` for sync (FR-TSD-015).
  4. Offline attendance captures buffer locally with `offline_captured_at` and sync via `:offline-sync` (FR-TSD-010), deduped server-side.
  5. **(v2)** The coverage denominator classifies each employee as eligible/exempt (e.g., long-leave, unmapped non-login) for campaign metrics; classification is auditable and policy-driven.
  6. Assisted/kiosk capture never bypasses SoD or validation rules of the underlying FR.
- **Business Rules:**
  - Kiosk Operator is a real authenticated principal; no anonymous capture. Offline buffers are encrypted and reconciled idempotently by (nomination, date). Denominator rules are configurable per campaign (§5.6 rule 15).
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `training_attendance` (KIOSK/ASSISTED/OFFLINE_SYNC) | C/R/U |
  | `employee_skills`, `skill_assessments` | C (assisted) |
  | `lms_enrollments` | C (kiosk launch) |
  | `campaign_targets` | R/U (denominator) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/kiosk/sessions` (operator selects employee) |
  | POST | `/api/v1/kiosk/{empId}/self-assessment` |
  | POST | `/api/v1/sessions/{id}/attendance:offline-sync` |
  | GET | `/api/v1/coverage/eligibility?campaignId=&employeeId=` |
- **UI Behavior Notes:** Kiosk-optimised, large-touch UI; employee selector by service_no; assisted forms with behavioural-anchor help; offline indicator with pending-sync count and conflict resolution queue; operator attribution always visible.
- **Edge Cases:** Offline clock skew (server reconciles, flags); duplicate offline + online mark (dedupe, conflict surfaced); operator assisting outside org scope (403); unmapped employee with no service_no (denominator EXEMPT with reason).
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `KioskService`, `AssistedCaptureService`, `OfflineSyncReconciler` (shared FR-010), `CoverageDenominatorService` |
  | Backend Flow | Operator auth → select employee (scope check) → assisted write (dual attribution) → offline buffer → sync reconcile → denominator classification |
  | Data Operations | Insert attendance/skills/assessments with attribution; reconcile offline batch |
  | Validation | Operator scope; idempotent offline dedupe; denominator policy |
  | Authorization | Kiosk Operator (attributed); manager proxy for reports; L&D |
  | State Changes & Side Effects | Feeds FR-003/010/015/017; coverage metrics |
  | Failure Handling | Conflict queue; 403 out-of-scope; clock-skew flagging |
  | Dependencies | FR-TSD-003/010/015/017 |
  | Test Guidance | Dual attribution; offline dedupe/skew; denominator classification; scope enforcement |

---

### FR-TSD-023 — DPDP Retention & Erasure of Learning PII at Exit *(new, Risk #13)*
- **Module:** M07-TSD
- **Primary Role(s):** Data Protection Officer (approve/execute), L&D Officer, Auditor
- **User Story:** As the DPO, I want defined retention/erasure of learning PII when an employee exits so that DPDP obligations are met while statutory SR-posted records are preserved.
- **Description:** On employee exit (RETIRED/RESIGNED/TERMINATED/DECEASED) or a data-subject erasure request, apply configured retention/erasure actions to self-assessments, anonymous-feedback authorship, marketplace presence, and skill inventory, recording each action append-only in `learning_data_retention_actions`. Statutory-retention overrides preserve SR-posted certs and required records.
- **Acceptance Criteria:**
  1. An exit/erasure event resolves a retention/erasure plan per policy: anonymise self-assessments, detach feedback authorship, erase marketplace presence, retain statutory records.
  2. SR-posted certifications and statutory records are flagged `retention_override=true` and preserved.
  3. Each action is appended to `learning_data_retention_actions` with DPO approval; the ledger is immutable.
  4. Marketplace presence is removed immediately on exit regardless of prior opt-in.
  5. **(v2)** An export action can produce a data-subject export before erasure where required.
  6. Erasure requester ≠ DPO approver (SoD).
- **Business Rules:**
  - Append-only ledger; no destructive action without DPO approval. Statutory retention always wins over erasure for SR-posted/legally-required records. PII minimisation in logs throughout.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `learning_data_retention_actions` | Append |
  | `employee_skills`, `skill_assessments`, `training_feedback`, `certifications` | U/anonymise (per action) |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/learning-data/retention-plan?employeeId=` |
  | POST | `/api/v1/learning-data/retention-actions:execute` |
  | GET | `/api/v1/learning-data/retention-actions?employeeId=` |
  | POST | `/api/v1/learning-data/export?employeeId=` |
- **UI Behavior Notes:** DPO console listing exit/erasure cases; per-action checklist with statutory-override flags; approval workflow; immutable action history; export download.
- **Edge Cases:** SR-posted cert under erasure request (retained, documented to subject); re-employment after erasure (new profile, no resurrection of erased PII); deceased employee (next-of-kin/policy handling); partial erasure with statutory holds.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `RetentionPlanner`, `ErasureExecutor`, `RetentionLedger`, `DataExporter` |
  | Backend Flow | Exit/erasure event → build plan (policy + statutory overrides) → DPO approve → execute (anonymise/detach/erase/retain) → append ledger |
  | Data Operations | Update/anonymise PII columns; append retention actions |
  | Validation | Statutory override precedence; SoD; immutable ledger |
  | Authorization | DPO approve/execute; L&D read; Auditor read |
  | State Changes & Side Effects | PII anonymised/detached; marketplace presence removed; statutory retained |
  | Failure Handling | Block erasure of statutory records; audited overrides |
  | Dependencies | FR-TSD-003/011/014/016; M01 exit events; DPDP policy |
  | Test Guidance | Override precedence; SoD; ledger immutability; marketplace removal; export |

---

### FR-TSD-024 — Published Gap Contract for M06 / M08 *(new, Risk #3, launch-required primitive)*
- **Module:** M07-TSD
- **Primary Role(s):** L&D Officer (publish), Integration/SysAdmin, Auditor
- **User Story:** As the owner of M06/M08 integration, I want a stable, versioned Gap Contract describing each employee's competency gaps so that promotion (M06) and appraisal (M08) consume a guaranteed primitive even while the developmental layer is phased.
- **Description:** Project a versioned, read-only **Gap Contract v1** from `skill_gap_analyses` + `skill_gap_items`: per (employee, model) the list of competencies with a positive gap, each flagged critical/non-critical, with staleness/model-stale indicators. This is the launch-required sibling-compatible primitive that lets weighted scoring/marketplace/recommendations remain feature-flagged Phase 2 without breaking M06/M08.
- **Acceptance Criteria:**
  1. The Gap Contract exposes: `employeeId`, `competencyModelId`, `generatedOn`, `scoringMode`, `modelStaleFlag`, and an array of `{competencyId, isCritical, gapSize, discountedForStaleness}`.
  2. The contract is versioned (`v1`) and changes are backward-compatible or version-bumped (`v2`), never silently altered.
  3. M06 and M08 read the contract via a stable endpoint; the schema is registered in the dependency register (§10.6).
  4. The contract reflects the latest FINALIZED analysis; SUPERSEDED analyses are not exposed.
  5. **(v2)** Binary critical/non-critical is always present; weighted fields appear only when `ff.gap.weighted` is ON, and consumers are not required to use them.
- **Business Rules:**
  - The contract is read-only and projection-only (no side effects). Versioning is explicit; breaking changes require a new version path. Row-level scoping applies to consumers.
- **Data Model References:**
  | Entity | Operation |
  |---|---|
  | `skill_gap_analyses`, `skill_gap_items` | R (projection) |
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/gap-contract/v1?employeeId=&modelId=` |
  | GET | `/api/v1/gap-contract/v1/batch?orgUnitId=&fy=` (paginated) |
- **UI Behavior Notes:** No direct UI; an admin "contract schema & version" reference page and a consumer-access audit view.
- **Edge Cases:** No FINALIZED analysis (empty contract with reason); consumer requests out-of-scope employee (403); version negotiation via path.
- **LLD:**
  | Aspect | Detail |
  |---|---|
  | Components | `GapContractProjector`, `ContractVersionRegistry` |
  | Backend Flow | On FINALIZE (FR-004) → project contract → serve read-only to M06/M08; version pinned |
  | Data Operations | Read-only projection from analyses+items |
  | Validation | Latest FINALIZED only; schema conformance; version path |
  | Authorization | Consumers (M06/M08) via service auth + row scope; Auditor read |
  | State Changes & Side Effects | None (read-only) |
  | Failure Handling | Empty contract on no analysis; 403 out-of-scope |
  | Dependencies | FR-TSD-004; M06, M08 (consumers); §10.6 |
  | Test Guidance | Schema conformance; version stability; latest-finalized semantics; scoping |

---

## 7. UI Requirements

### 7.1 Global UI principles
- React + TypeScript, Tailwind + shadcn/ui; responsive and mobile-first; WCAG 2.1 AA (keyboard nav, focus order, 4.5:1 contrast, ARIA labels); dark mode supported.
- Every screen implements **empty / loading / error / success / permission-denied / offline** states (no skeleton-only screens). **(v2)** Offline state is functional for kiosk attendance (FR-TSD-022), not decorative.
- `DD-MMM-YYYY` dates, INR currency formatting, locale-aware.
- All lists paginated (≤100), filterable, sortable, with column-level RBAC.
- **(v2)** Proficiency self-assessment and assessment content surface **behavioural anchors** and meet content-accessibility (FR-TSD-021/§9).

### 7.2 Key screens
| Screen | Primary roles | Key elements |
|---|---|---|
| My Skills & Growth | Employee | Skill cards (proficiency + **freshness** chip), gaps radar, recommendations (Phase-2 badge when off), CPD totals, certificates + **external credentials** |
| Team Skills (Manager) | Manager | Team heatmap, validation queue (**stale re-validation**), nomination actions, team plan |
| Competency Framework Admin | L&D Officer | Taxonomy tree, competency builder, proficiency catalog (**descriptor editor**), publish workflow |
| Competency Model Editor & Governance | L&D Officer | Model grid, scope (**role picker**), version timeline, **owner + review-due/staleness** |
| Skill-Gap Analysis | L&D/Manager | Target-vs-current, gap list (**stale-discount/model-stale banners**), convert-to-need |
| Training Needs Inbox | L&D/Manager | Source-filtered needs, consolidation wizard, priority editor |
| Annual Plan & Calendar | L&D Manager | Plan builder, **canonical-key** budget bar, quarter Gantt, category/competency as reporting chips |
| Course Catalog | L&D/All | Program cards/grid, filters, program editor (**content-package picker**) |
| Content & Item Bank Studio *(v2)* | L&D Officer | Package version manager, item-bank editor, **WCAG badges**, accessibility-exception workflow |
| Session Scheduler | L&D | Calendar create, conflict warnings, capacity meter, trainer/venue pickers (**empanelment status**) |
| Vendor Empanelment Register *(v2)* | Vendor Mgr/L&D Mgr | Empanelment list, contract/procurement refs, rate cards, approval stepper |
| Nomination & Approvals | Manager/L&D | Nominate dialog, approver inbox, **explicit waitlist position**, budget-impact banner |
| Compliance Campaign Console *(v2)* | L&D/Mgr | Campaign wizard, coverage dashboard (eligible/exempt/overdue), wave board, escalation status |
| Attendance Console | Trainer/L&D/Kiosk | Roster grid, per-day marking, bulk actions, signed-sheet upload, **kiosk/offline mode + pending-sync** |
| Assessment & Feedback | Trainer/Employee | Score grid, learning-gain chart, feedback forms, **Kirkpatrick dashboard (L3/L4 optional/sampled + KPI linkage)** |
| Certifications & Compliance | L&D/Employee | Certificate viewer, expiry timeline, mandatory heatmap, **lapsed-mandatory + auto-renewal** |
| External Credentials *(v2)* | Employee/L&D | Submission form, verification queue, evidence viewer, SR-eligibility |
| Sponsorship & Service-Bond *(v2)* | Employee/Dept Head/Finance | Request, sanction stepper, bond timeline, breach/recovery, waiver |
| Onboarding Tracker | L&D/HR/Manager | Induction checklist, window progress, overdue flags |
| Learning Paths & Marketplace | Employee/L&D | Path explorer, recommendation cards (flagged), CPD dashboard, marketplace (flagged, opt-in) |
| Budget & Cost Dashboard | Finance/L&D | Allocated/committed/actual bars (canonical key), variance, **cost-per-completion**, cost entry, payable feed |
| DPO Retention Console *(v2)* | DPO/Auditor | Exit/erasure cases, action checklist (statutory overrides), immutable history, export |
| LRS/LMS Connector Admin *(v2)* | SysAdmin | Connector config, **primary toggle**, sync mode, health (lag/cursor), reconciliation queue |

---

## 8. (merged into Section 6 FR structure — see LLD tables per FR)
> Low-Level Design is embedded per FR in Section 6 as mandated. No separate section is duplicated.

---

## 9. NFRs (Non-Functional Requirements)

| Category | Requirement |
|---|---|
| Performance (v2) | P95 API < 500ms; catalog/list endpoints < 300ms. **Gap analysis is event-driven/incremental: a single-employee recompute completes < 5s P95 on a skill/validation/model event.** Full reconciliation batch for **200k employees** runs as a partitioned/streamed job within the nightly window (target < 4h, horizontally parallelised), and is a fallback, not the primary path. Campaign `:enroll-batch` processes ≥ 50k targets via chunked, resumable, idempotent jobs. |
| Scalability | Horizontal scaling; **200k employees**, 5k concurrent learners, ~200k+ annual mandatory completions (campaign-driven), 50k+ annual discretionary nominations. |
| Availability | 99.9% uptime; graceful degradation when M08/LMS/LRS/M12 unavailable. |
| Resilience | RPO ≤ 15min, RTO ≤ 4h; idempotent SR/LMS/payroll integrations with retry + DLQ; resumable batch/campaign jobs. |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; RBAC + row-level org scoping; **no polymorphic-FK integrity gaps (actor_type)**; signed service auth for LRS ingest; secrets via env/secret manager; **kiosk operators attributed, never anonymous**. |
| Privacy (v2) | India DPDP Act 2023 alignment incl. **retention/erasure of learning PII at exit (FR-TSD-023)**; anonymous feedback; marketplace opt-in + exit removal; PII minimisation; no PII in logs; encrypted offline buffers. |
| Auditability | Every state change in `audit_log`; append-only ledgers immutable; full traceability need→nomination→cert→SR; **waitlist promotions, campaign waves, significance decisions, and erasure actions audited**. |
| Accessibility (v2) | WCAG 2.1 AA across all screens **and across assessment content (item banks, pre/post tests) and hosted/authored e-learning (`lms_content_packages.wcag_conformance`)**; NON_CONFORMANT mandatory content blocked without exception. |
| Observability | Structured logs with `requestId`; metrics for nomination throughput, **campaign coverage**, SR posting success, **LRS/LMS sync lag & poll-cursor health**, incremental-gap recompute latency; alerting on FAILED postings and stuck campaigns. |
| Data retention | Statutory retention for certifications/SR-posted training (lifetime); operational data per schedule; erasure honours statutory overrides. |
| Localisation | UTC storage; locale display; INR default with banker's rounding; i18n-ready strings. |

---

## 10. API & Integration

### 10.1 Conventions
- Base path `/api/v1`; JWT bearer auth; RBAC enforced; all lists paginated (`page`,`limit≤100` or cursor).
- Idempotency-Key header for POST that triggers external effects (SR posting, LMS provisioning, payroll feed, **campaign enroll-batch**, **bond recovery**).

### 10.2 Canonical error envelope
```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "obtained_score exceeds max_score", "field": "obtained_score" },
  "requestId": "req-7f3a9c2e"
}
```

### 10.3 Error-code catalog
| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/payload validation failed (incl. missing descriptor, missing content package) |
| AUTH_REQUIRED | 401 | Missing/invalid token (incl. bad LRS-ingest service signature) |
| FORBIDDEN | 403 | RBAC/SoD/self-approval/self-validation/self-verify denied |
| NOT_FOUND | 404 | Entity not found / no effective competency model |
| RESOURCE_CONFLICT | 409 | Duplicate code/nomination/empanelment ref/external-credential ref / in-use archive |
| SCHEDULE_CONFLICT | 409 | Trainer/venue double-booking |
| CAPACITY_EXCEEDED | 409 | Session full (→ waitlist with position) |
| BUDGET_EXCEEDED | 409 | Cost commitment exceeds allocated (no override) |
| INELIGIBLE_FOR_CERTIFICATION | 409 | Attendance/assessment criteria not met |
| MANDATORY_CANNOT_BE_CANCELLED | 403 | Self-withdrawal of mandatory/campaign training |
| VENDOR_NOT_EMPANELLED | 409 | External trainer/cost without valid empanelment **(v2)** |
| CONTENT_NOT_ACCESSIBLE | 422 | NON_CONFORMANT mandatory content without exception **(v2)** |
| BOND_RECOVERY_REQUIRED | 409 | Sponsorship RECOVERED attempted before recovery cost emitted **(v2)** |
| STATUTORY_RETENTION_HOLD | 409 | Erasure blocked on SR-posted/statutory record **(v2)** |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled server error |
| UPSTREAM_UNAVAILABLE | 503 | M08/M12/LMS/LRS/M10 unavailable (degraded mode) |
| SR_POSTING_FAILED | 502 | Service Register posting failed (retryable) |

### 10.4 Example requests/responses

**Create nomination**
```json
POST /api/v1/training-sessions/ts-3001/nominations
{ "employeeId": "emp-3001", "trainingNeedId": "tn-7001", "nominationType": "MANAGER" }

201 Created
{ "trainingNominationId": "nm-4001", "status": "PENDING_L1", "estimatedCost": 8000.00 }
```

**Approve nomination — full → waitlisted with position (v2)**
```json
POST /api/v1/nominations/nm-4100:approve
200 OK
{ "trainingNominationId": "nm-4100", "status": "WAITLISTED", "waitlistPosition": 3 }
```

**Campaign batch enrolment (v2, idempotent)**
```json
POST /api/v1/training-campaigns/camp-01:enroll-batch
Idempotency-Key: camp-01:enroll:2026-07-01
202 Accepted
{ "eligibleTargets": 198450, "exempt": 1550, "nominationsQueued": 198450, "jobId": "job-77c1", "resumable": true }
```

**LMS sync — CORRECTED model (v2): xAPI ingested from LRS / SCORM via poll, NOT a webhook push**
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
> Note (v2): SCORM 1.2/2004 has no server-to-server completion push. The v1 `/lms/webhook` example is removed; integration is xAPI-via-LRS ingest or SCORM-via-reporting-API poll. See FR-TSD-015.

**SR posting result (pinned contract)**
```json
POST /api/v1/certifications/ct-6001:post-to-sr
202 Accepted
{ "srPostingStatus": "PENDING", "idempotencyKey": "cert:ct-6001", "isSignificant": true, "matchedRules": ["MANDATORY_CERT"] }
```

**Gap Contract v1 (v2, consumed by M06/M08)**
```json
GET /api/v1/gap-contract/v1?employeeId=emp-3001&modelId=cm-9001
200 OK
{ "employeeId":"emp-3001","competencyModelId":"cm-9001","generatedOn":"2026-06-30T02:00:00Z",
  "scoringMode":"BINARY","modelStaleFlag":false,
  "gaps":[ {"competencyId":"comp-SQL","isCritical":true,"gapSize":2,"discountedForStaleness":true} ] }
```

### 10.5 Integration points
| Direction | Counterparty | Mechanism | Idempotency |
|---|---|---|---|
| Consume employee master & joiner events | M01-EPM | API/event (**pinned joiner contract §10.6**) | event id |
| Consume appraisal development gaps | M08-PAM | API/event (read, **pinned gap-feed contract**) | cycle+emp |
| **Publish Gap Contract v1** | M06-PPP, M08-PAM | read API (versioned) | n/a (read-only) |
| Append SR events | M12-SR | API (async, retry, **pinned event contract §10.6**) | cert/nomination id |
| Emit reimbursement / **bond-recovery** payable | M10-PAY | event/feed | cost id |
| Store/retrieve documents | M13-DMS | API | document id |
| **LMS/LRS course launch & sync** | External LMS / LRS | SSO deep-link + **xAPI LRS ingest / SCORM reporting-API poll** | xAPI statement id / poll cursor |
| Notifications | Platform | event | notification id |
| Analytics datamart | M14-DAS | read views/export (**incl. cost-per-completion, L4 KPI keys**) | n/a |

### 10.6 Pinned cross-module contracts (v2, Risk #3/#14)
These schemas are **pinned in the dependency register** and must be agreed with the owning module before the relevant wave starts.

**M12 SR training-event (M07 → M12), append-only:**
```json
{ "eventType":"TRAINING_QUALIFICATION", "sourceModule":"M07-TSD",
  "idempotencyKey":"cert:ct-6001", "employeeId":"emp-3001",
  "title":"Cyber-Security Essentials", "issuingAuthority":"CGG L&D",
  "credentialSource":"INTERNAL_PROGRAM", "isMandatory":true,
  "issueDate":"2026-07-01", "validUntil":"2027-07-01",
  "significanceRules":["MANDATORY_CERT"], "documentId":"doc-555", "occurredAt":"2026-07-01T10:00:00Z" }
```
**M01 joiner-event (M01 → M07):**
```json
{ "eventType":"EMPLOYEE_JOINED", "employeeId":"emp-9999", "serviceNo":"SVC-12345",
  "dateOfJoining":"2026-07-01", "cadre":"clerical", "designationId":"desg-CLK",
  "orgUnitId":"ou-12", "occurredAt":"2026-07-01T00:00:00Z", "eventId":"evt-abc" }
```
**M08 appraisal-gap feed (M08 → M07):**
```json
{ "appraisalCycleRef":"APAR-2025-26", "employeeId":"emp-3001",
  "developmentGaps":[ {"competencyId":"comp-COMM","targetLevel":"L3","currentLevel":"L2"} ],
  "generatedAt":"2026-04-15T00:00:00Z" }
```
**Gap Contract v1 (M07 → M06/M08):** schema as in §10.4 example; version path `/gap-contract/v1`.

---

## 11. Workflow & State Diagrams (state tables)

### 11.1 Nomination state table
| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| DRAFT | submit | PENDING_L1 | maker≠approver; need linked |
| PENDING_L1 | manager approve | PENDING_L2 | SoD |
| PENDING_L1 | reject | REJECTED | reason required |
| PENDING_L2 | L&D approve | APPROVED | capacity+budget check; commit budget; decrement capacity |
| PENDING_L2 | approve when full | WAITLISTED | **assign `waitlist_position`=max+1 (FIFO), audited** |
| APPROVED | withdraw (before deadline) | WITHDRAWN | free seat → promote waitlist head; **audit promotion, compact positions**; release commitment |
| WAITLISTED | seat frees | APPROVED | **FIFO by `waitlist_position`; promotion logged to audit** |
| APPROVED | session completes (attended+pass) | COMPLETED | issue cert eligibility |
| APPROVED | session completes (fully absent) | NO_SHOW | mark, notify |
| any non-terminal | mandatory/campaign self-withdraw | (blocked) | MANDATORY_CANNOT_BE_CANCELLED |

### 11.2 Training session state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | open nominations | OPEN | program PUBLISHED |
| OPEN | capacity reached | FULL | enrolled = capacity |
| OPEN/FULL | start date reached | RUNNING | — |
| RUNNING | end + closeout | COMPLETED | attendance/assessment finalised |
| any pre-completion | cancel | CANCELLED | reason; cascade nominations + notifications |

### 11.3 Certification state table
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| (none) | issue | ACTIVE | eligibility met; cert_no generated |
| ACTIVE | valid_until passed | EXPIRED | nightly job; notify; **if mandatory: set `lapsed_mandatory`, create renewal need, enroll campaign (v2)** |
| ACTIVE | renewal issued | SUPERSEDED | new cert ACTIVE; **clear lapsed flag** |
| ACTIVE/EXPIRED | revoke | REVOKED | L&D Mgr approval; SR correction if posted |

### 11.4 SR posting state table
| Current | Event | Next | Guard |
|---|---|---|---|
| NOT_REQUIRED | **`is_significant` rule matches** | PENDING | significance resolver (v2) |
| PENDING | post success | POSTED | M12 ack (pinned contract); store event id |
| PENDING | post failure | FAILED | retry scheduled |
| FAILED | retry success | POSTED | within retry budget |
| FAILED | retries exhausted | FAILED | alert L&D + SR Custodian |

### 11.5 Annual plan state table
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | SUBMITTED | budget reconciled (canonical key) |
| SUBMITTED | approve | APPROVED | L&D Mgr + Finance |
| APPROVED | activate | ACTIVE | FY start |
| ACTIVE | close | CLOSED | all items terminal |

### 11.6 Campaign state table *(v2)*
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| DRAFT | approve | APPROVED | scope sanctioned; mandatory program PUBLISHED |
| APPROVED | enroll-batch + run | RUNNING | resolve targets (denominator); idempotent batch nominations |
| RUNNING | auto-wave | RUNNING | assign waves into capacity-bounded sessions; create sessions as needed |
| RUNNING | pause | PAUSED | reason; no new nominations |
| RUNNING | all eligible terminal | COMPLETED | coverage finalised |
| RUNNING/PAUSED | cancel | CANCELLED | reason; existing nominations handled per policy |
| RUNNING | renewal cadence reached | RUNNING | rolling-renewal re-targets pre-expiry (ties FR-012) |

### 11.7 Sponsorship / service-bond state table *(v2)*
| Current | Event | Next | Guard / side effect |
|---|---|---|---|
| PROPOSED | recommend+sanction | SANCTIONED | Dept Head approval |
| SANCTIONED | training starts | ACTIVE | — |
| ACTIVE | bond term fulfilled | FULFILLED | bond_end_date passed in service |
| ACTIVE | early exit/breach | BREACHED | compute recovery |
| BREACHED | recovery emitted | RECOVERED | **BOND_RECOVERY cost to M10 required first** |
| ACTIVE/BREACHED | authority waiver | WAIVED | approval + audit |

### 11.8 Vendor empanelment state table *(v2)*
| Current | Event | Next | Guard |
|---|---|---|---|
| DRAFT | submit | PENDING_APPROVAL | requester ≠ approver |
| PENDING_APPROVAL | approve | EMPANELLED | L&D Mgr |
| EMPANELLED | suspend | SUSPENDED | reason |
| EMPANELLED/SUSPENDED | blacklist | BLACKLISTED | block new assignments |
| EMPANELLED | validity passed | EXPIRED | nightly |

### 11.9 Credential verification state table *(v2)*
| Current | Event | Next | Guard |
|---|---|---|---|
| NOT_REQUIRED/PENDING | submit | PENDING | evidence per policy |
| PENDING | review+verify | VERIFIED | verifier ≠ submitter; significance eval → SR eligibility |
| PENDING | reject | REJECTED | reason; immutable trail retained |

---

## 12. Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Nomination pending approval | Manager / L&D Mgr | Email + in-app | NOM_PENDING |
| Nomination approved/rejected/waitlisted | Employee, nominator | Email + in-app | NOM_DECISION |
| Waitlist promotion (**with position**) | Employee | Email + SMS | NOM_PROMOTED |
| Session reminder (T-3 days) | Enrolled + trainer | Email + SMS | SESSION_REMINDER |
| Session cancelled | Enrolled + trainer | Email + SMS + in-app | SESSION_CANCELLED |
| **Campaign launched / wave assigned (v2)** | Target employee + manager | Email + in-app | CAMPAIGN_WAVE |
| **Campaign overdue / escalation (v2)** | Employee→manager→L&D (ladder) | Email + escalation | CAMPAIGN_ESCALATION |
| Pre/post assessment due | Trainer | In-app | ASSESS_DUE |
| Feedback request (post-session) | Participants | Email + in-app | FEEDBACK_REQUEST |
| Certificate issued | Employee | Email + in-app | CERT_ISSUED |
| Certificate expiry (60/30/7 days) | Employee + manager | Email + in-app | CERT_EXPIRY |
| **Mandatory cert lapsed → auto re-nominated (v2)** | Employee + manager + L&D | Email + escalation | CERT_LAPSED_RENEWAL |
| Mandatory training overdue | Employee + manager + L&D | Email + escalation | MANDATORY_OVERDUE |
| Induction window overdue | New joiner + manager + L&D | Email + escalation | INDUCTION_OVERDUE |
| **External credential verified/rejected (v2)** | Employee | Email + in-app | CREDENTIAL_DECISION |
| **Skill stale — re-validation needed (v2)** | Employee + manager | In-app | SKILL_STALE |
| **Competency model review due (v2)** | Model owner + L&D Mgr | Email + in-app | MODEL_REVIEW_DUE |
| **Sponsorship bond breach / recovery (v2)** | Employee + Finance + Dept Head | Email + in-app | BOND_BREACH |
| SR posting failed | L&D + SR Custodian | Email + in-app | SR_POST_FAILED |
| Budget threshold breached (≥90%) | Finance + L&D Mgr | Email + in-app | BUDGET_THRESHOLD |
| **LMS/LRS sync reconciliation needed (v2)** | L&D + SysAdmin | In-app | LMS_RECON |
| **DPDP erasure pending DPO action (v2)** | DPO | Email + in-app | ERASURE_PENDING |

All notifications write to the shared `notifications` ledger; respect user channel preferences and quiet hours; localisable templates. **(v2)** Non-login staff escalations route to the reporting manager / kiosk-coordinator.

---

## 13. Reporting & Analytics

| Report | Audience | Key metrics / dimensions |
|---|---|---|
| Skill inventory & coverage | L&D/Mgr | Skills by category, proficiency distribution, validated vs declared, **fresh vs stale (v2)** |
| Skill-gap heatmap | L&D/Mgr/Dept Head | Critical gaps by org-unit, competency, designation |
| **Competency-model staleness (v2)** | L&D Mgr | Models past review-due, by owner/org-unit; curation-evidence metric for flag gating |
| Training plan execution | L&D Mgr | Planned vs delivered man-days, by quarter/org-unit |
| Nomination funnel | L&D | Nominated→approved→attended→completed conversion |
| **Campaign coverage & compliance (v2)** | L&D/Auditor/Dept Head | Coverage % vs eligible denominator, exemptions, overdue, wave progress, rolling-renewal pipeline |
| Learning effectiveness (Kirkpatrick) | L&D | L1 reaction, L2 learning gain; **L3/L4 sampled, programme-level, KPI-linked (v2)** |
| Mandatory-compliance status | L&D/Auditor/Dept Head | Required vs held vs **lapsed (v2)** mandatory certs; % compliant |
| Certification & credential register | L&D/Auditor | Internal + **external/professional (v2)**; active/expired/revoked; upcoming renewals |
| Induction compliance | HR/L&D | On-time vs overdue induction completion |
| CPD credit summary | Employee/L&D | Credits by year vs target (target Phase 2) |
| Trainer & **vendor (v2)** performance | L&D | Avg feedback rating, sessions delivered, pass rates, empanelment status |
| Budget utilisation & variance | Finance/L&D Mgr | Allocated/committed/actual (**canonical org-unit+FY key**), variance %, category breakdown (reporting) |
| **Cost-per-completion / ROI (v2)** | Finance/L&D Mgr/M14 | Actual cost ÷ completions; L4 KPI linkage for cost-per-outcome |
| LMS/LRS engagement | L&D | Enrolments, completion rate, avg time-to-complete, **sync health (v2)** |
| **Sponsorship & bond exposure (v2)** | Finance/Dept Head | Active bonds, exposure, breaches, recoveries |
| **DPDP retention/erasure log (v2)** | DPO/Auditor | Erasure actions, statutory holds, exports |

Reports exposed as datamarts/views to M14-DAS; all support org-unit scoping, FY filters, CSV/PDF export, and respect RBAC.

---

## 14. Migration & Launch

### 14.1 Data migration
| Source | Target | Approach |
|---|---|---|
| Legacy skill/competency lists | `skill_categories`/`skills`/`competencies` | Map → validate → bulk import (source=IMPORT); **descriptors required before PUBLISH (v2)**; L&D review |
| Existing employee qualifications/certs | `certifications`, `employee_skills` | Import with `sr_posting_status=NOT_REQUIRED` for historical; flag significant for back-posting; **set `last_validated_at` from import date (v2)** |
| **Externally-acquired credentials (v2)** | `certifications` (EXTERNAL_PROFESSIONAL) | Import with `verification_status=PENDING`; L&D verifies before SR eligibility |
| Historical training records | `training_programs`/`sessions`/`nominations` (closed) | Load as COMPLETED for history/analytics |
| Legacy budgets | `training_budgets` | Load current+prior FY at canonical org-unit+FY key for variance baselines |
| **Vendor/empanelment master (v2)** | `vendor_empanelments` | Import EMPANELLED vendors with contract/procurement refs |
| **E-learning content (v2)** | `lms_content_packages` | Register existing SCORM/xAPI packages with version + WCAG metadata; declare hosting + primary LRS |

### 14.2 Cutover & launch (v2 — statutory spine first, Risk #25)
1. **Pin cross-module contracts first** (M12 SR-event, M01 joiner, M08 gap-feed, Gap Contract v1 — §10.6) with owning modules.
2. Load and publish taxonomy, proficiency levels (**with descriptors**), competencies, and **governed** models (owner + review-due). Gate: L&D sign-off.
3. Stand up program catalog (FR-007) + content packages (FR-021) + **primary LRS/LMS connector** (FR-015) validated round-trip.
4. **Prove the statutory spine end-to-end on ONE pilot department:** a **campaign-based** mandatory-compliance enrolment (FR-017) → attendance incl. kiosk/offline (FR-010/022) → completion → certification (FR-012) → idempotent **SR posting** (FR-016). Reconcile in audit.
5. Import employee skills/certs + external credentials; run reconciliation report (zero unmatched employees).
6. Org-wide rollout of the statutory spine; publish Gap Contract v1 for M06/M08.
7. **Phase 2 (gated on curation evidence + flags):** weighted gap scoring, recommendations, marketplace, CPD targets.
8. Post-launch: monitor SR posting success, campaign coverage, nomination throughput, sync health, incremental-gap latency.

### 14.3 Rollback & safety
- Idempotent imports/batch jobs re-runnable; SR back-posting gated behind explicit approval.
- Feature flags per developmental capability (§2.5); flags default OFF.
- Append-only ledgers (incl. credential verifications, retention actions) ensure no destructive migration of historical evidence.
- Campaign jobs resumable; partial failures do not duplicate (idempotency keys).

---

## 15. Traceability / Dependency / Parallel-Agent Plan

### 15.1 Traceability matrix (FR → entities → APIs → depends on)
| FR | Primary entities | Key APIs | Depends on |
|---|---|---|---|
| FR-TSD-001 | skill_categories, skills, competencies, proficiency_levels | /skills,/competencies | — |
| FR-TSD-002 | competency_models(+role_id/owner/review), items | /competency-models | 001 |
| FR-TSD-003 | employee_skills(+freshness), skill_assessments | /employees/{}/skills | 001,002 |
| FR-TSD-004 | skill_gap_analyses(+scoring_mode), skill_gap_items(norm.) | /skill-gap-analyses,/gap-contract | 002,003, M08 |
| FR-TSD-005 | training_needs | /training-needs | 004 |
| FR-TSD-006 | annual_training_plans(+items), training_budgets | /annual-training-plans | 005,016 |
| FR-TSD-007 | training_programs | /training-programs | 001,021,015 |
| FR-TSD-008 | training_sessions, trainers, venues | /training-sessions | 007,019 |
| FR-TSD-009 | training_nominations(+waitlist_position) | /nominations | 008,016,017 |
| FR-TSD-010 | training_attendance(+capture_mode/actor) | /sessions/{}/attendance | 009,015,022 |
| FR-TSD-011 | training_assessments(+actor), training_feedback | /nominations/{}/assessments | 010,021 |
| FR-TSD-012 | certifications(+lapsed/renewal) | /certifications | 010,011,016,017 |
| FR-TSD-013 | training_needs/nominations (induction) | /induction | 007,009,012,014, M01 |
| FR-TSD-014 | learning_paths(+items), cpd_records | /recommendations,/cpd | 004,007,011 |
| FR-TSD-015 | lms_enrollments, learning_record_stores | /lms/xapi/ingest,/lms/scorm/poll | 007,009,010,012,021 |
| FR-TSD-016 | service_register_events, training_budgets, training_costs | /post-to-sr,/training-budgets | 009,012,018,020, M12, M10 |
| FR-TSD-017 | training_campaigns, campaign_targets | /training-campaigns | 007,008,009,012,016,022 |
| FR-TSD-018 | certifications(EXTERNAL), credential_verifications | /external-credentials | 012,016 |
| FR-TSD-019 | vendor_empanelments | /vendor-empanelments | 008,016 |
| FR-TSD-020 | training_sponsorships | /training-sponsorships | 016, M10, M05 |
| FR-TSD-021 | lms_content_packages, assessment_items | /content-packages,/assessment-items | 007,011,015 |
| FR-TSD-022 | training_attendance(offline), kiosk capture | /kiosk/*,/attendance:offline-sync | 003,010,015,017 |
| FR-TSD-023 | learning_data_retention_actions | /learning-data/* | 003,011,014,016, M01 |
| FR-TSD-024 | (projection of gap analyses/items) | /gap-contract/v1 | 004, M06, M08 |

### 15.2 Parallel-agent build plan (v2 — resequenced around the statutory spine, Risk #25)
| Wave | FRs (parallelisable) | Rationale |
|---|---|---|
| **0 (contracts)** | §10.6 pinned contracts (M12 SR-event, M01 joiner, M08 gap-feed, Gap Contract v1) | Programme governance; unblock Waves 4/6/statutory spine |
| 1 (foundation) | 001, 007 (catalog skeleton), 021 (content), 016 budget tables, 019 (empanelment) | Masters + content + budget/vendor base |
| 2 | 002 (governed models), 008, 015 (LRS config) | Build on masters; LRS/connector config |
| **3 (statutory spine — pilot)** | 009, 017 (campaign), 010+022 (attendance incl. kiosk/offline), 012, 016 (SR posting) | **Prove mandatory-compliance → cert → SR end-to-end on one department first** |
| 4 | 003 (inventory+freshness), 005, 006 | Inventory, needs, plan |
| 5 | 004 (incremental gap), 024 (Gap Contract), 011, 013, 018 | Gap engine + contract + assessment + induction + external creds |
| 6 (Phase 2, flagged) | 014 (recommendations/marketplace), 020 (sponsorship), 023 (DPDP erasure) | Developmental layer + sponsorship + retention, gated on curation evidence |

### 15.3 External dependencies & register
| Dependency | Module | Type | Contract pinned? | Fallback |
|---|---|---|---|---|
| Employee master / joiner events | M01 | Hard | **Yes (§10.6)** | cache + retry |
| Appraisal development gaps | M08 | Soft | **Yes (§10.6)** | degraded gap mode |
| Gap Contract consumers | M06, M08 | Hard (sibling) | **Yes (§10.6, v1)** | versioned, backward-compatible |
| Service Register | M12 | Hard (statutory) | **Yes (§10.6)** | queue + retry + alert |
| Documents | M13 | Hard | n/a | block upload, allow metadata |
| Payroll payable / bond recovery | M10 | Soft | feed schema | queue feed |
| LMS / LRS | External | Soft | connector config | manual attendance fallback |
| Procurement system | External | Soft | reference only | manual empanelment entry |

### 15.4 Final Reconciliation Table (0 unresolved gaps)
| Mandated / council-required element | Covered by | Status |
|---|---|---|
| Competency/skill framework | FR-TSD-001/002 | ✅ |
| Proficiency levels **+ behavioural anchors** | FR-TSD-001 (descriptor mandatory) | ✅ |
| **Competency-model governance (review/owner/staleness)** | FR-TSD-002, §13 | ✅ |
| Skill inventory per employee **+ freshness/decay** | FR-TSD-003 | ✅ |
| **Incremental** skill-gap analysis | FR-TSD-004 | ✅ |
| **Binary-default gap; weighted Phase-2 flagged** | FR-TSD-004, §2.5 | ✅ |
| **Published Gap Contract for M06/M08** | FR-TSD-024, §10.6 | ✅ |
| Annual training calendar & plan | FR-TSD-006 | ✅ |
| **Budget dimension mismatch resolved (canonical key)** | §5.6 rule 7, FR-TSD-006/016 | ✅ |
| Course catalog | FR-TSD-007 | ✅ |
| **Content & assessment-item model** | FR-TSD-021 | ✅ |
| Internal/external/e-learning programmes | FR-TSD-007/015 | ✅ |
| Training needs linked to appraisal gaps (M08) | FR-TSD-004/005 | ✅ |
| **Source-enum normalisation (1:1 gap→need)** | §5.5, FR-TSD-004/005 | ✅ |
| Nomination & approval workflow | FR-TSD-009 | ✅ |
| **Waitlist position + fairness audit** | FR-TSD-009, §11.1 | ✅ |
| **Mandatory-compliance campaign engine (scale)** | FR-TSD-017 | ✅ |
| Batch/session scheduling | FR-TSD-008 | ✅ |
| Trainer & venue management | FR-TSD-008 | ✅ |
| **Vendor/external-trainer empanelment + procurement** | FR-TSD-019 | ✅ |
| Attendance | FR-TSD-010 | ✅ |
| **Proxy/kiosk/assisted + offline sync; coverage denominator** | FR-TSD-022, FR-TSD-010 | ✅ |
| Pre/post assessment | FR-TSD-011 | ✅ |
| **Feedback/Kirkpatrick L3/L4 reframed; ROI/cost-per-completion** | FR-TSD-011, FR-TSD-016, §13 | ✅ |
| Certification & validity/renewal **(enforced + lapsed flag)** | FR-TSD-012 | ✅ |
| **External/professional credential capture + verification** | FR-TSD-018 | ✅ |
| Mandatory compliance training | FR-TSD-012/017 | ✅ |
| Induction/onboarding training | FR-TSD-013 | ✅ |
| Training budget & cost tracking | FR-TSD-006/016 | ✅ |
| **Sponsorship/study-leave/deputation + service bond** | FR-TSD-020 | ✅ |
| Service Register posting (M12) **+ `is_significant` rule set + pinned contract** | FR-TSD-016, §10.6 | ✅ |
| **LMS integration corrected (LRS/xAPI ingest, SCORM poll — no webhook)** | FR-TSD-015 | ✅ |
| Learning paths | FR-TSD-014 | ✅ |
| Skill-based recommendations **(Phase-2 flagged)** | FR-TSD-014, §2.5 | ✅ |
| Micro-learning | FR-TSD-007 | ✅ |
| CPD/credit tracking | FR-TSD-014 | ✅ |
| Skills marketplace **(Phase-2 flagged, DPDP-aware)** | FR-TSD-014, FR-TSD-023 | ✅ |
| **DPDP retention/erasure of learning PII at exit** | FR-TSD-023 | ✅ |
| **Data-model defects fixed (role_id, polymorphic FKs)** | §5.2.5/5.2.19/5.2.20 | ✅ |
| **NFR scale corrected (200k, incremental recompute)** | §9 | ✅ |
| **Content/assessment accessibility (WCAG)** | §9, FR-TSD-021/011 | ✅ |
| **Build plan resequenced (statutory spine first)** | §15.2 | ✅ |
| Required entities (competency, skill, training-program, training-nomination, training-session, certification) | Section 5 | ✅ |

**Unresolved gaps: 0.** **Adopted council improvements incorporated: 25 of 25.**

---

## 16. Glossary & Appendices

### 16.1 Glossary
| Term | Definition |
|---|---|
| Competency | A cluster of related skills/behaviours required for effective role performance. |
| Skill | An atomic, assessable capability within the taxonomy. |
| Proficiency level | An ordered measure of capability depth, each with a concrete behavioural anchor. |
| Competency model | The set of competencies + target proficiencies a role/cadre requires, with owner + review cadence. |
| Skill gap | The positive difference between required and current proficiency. |
| Skill freshness / staleness | Whether a validated skill is within its `revalidation_interval_months`; stale skills are discounted from gap closure. |
| Gap Contract | The versioned read-only projection of gaps consumed by M06/M08. |
| Campaign | A scoped, bulk, wave-orchestrated mandatory-training drive with rolling renewal and escalation. |
| Coverage denominator | The eligible population against which campaign completion % is measured. |
| Kirkpatrick model | Four-level evaluation: Reaction, Learning, Behaviour, Results (L3/L4 optional/sampled/programme-level). |
| CPD | Continuing Professional Development credits earned through learning. |
| SCORM / xAPI | E-learning standards; SCORM has no server push (poll the LMS reporting API); xAPI emits statements to an LRS. |
| LRS (Learning Record Store) | The store/endpoint that receives and serves xAPI statements; one is the primary system of record. |
| Content package | A versioned SCORM/xAPI/self-hosted e-learning asset with accessibility metadata. |
| Empanelment | Approved registration of an external vendor/trainer with contract/procurement reference. |
| Service bond | A post-sponsorship service-obligation period whose breach triggers cost recovery. |
| Learning path | An ordered sequence of programs toward a competency/role goal. |
| Skills marketplace | Internal directory (Phase 2, opt-in) matching surplus skills to mentoring/project needs. |
| Service Register (SR) | Statutory append-only service record ledger (M12). |
| `is_significant` rule set | The configurable rules deciding which trainings/credentials post to the SR. |
| Mandatory/compliance training | Legally/policy-required training with currency, renewal, and campaign orchestration. |
| Induction | Structured onboarding training for new entrants. |
| Maker-checker | Segregation-of-duties control: creator ≠ approver. |
| Kiosk/assisted mode | Attributed capture of learning actions for non-login staff. |
| DPDP erasure | Retention/erasure of learning PII at employee exit, honouring statutory overrides. |

### 16.2 Appendices
- **A. Default proficiency scale (with anchors):** L1 Awareness, L2 Working, L3 Proficient, L4 Advanced, L5 Expert — each `proficiency_levels.descriptor` carries a concrete behavioural anchor (mandatory, FR-TSD-001).
- **B. Default thresholds (configurable):** min attendance 80%; assessment pass 50%; renewal reminders 60/30/7 days; induction windows 30/60/90 days; budget alert ≥90%; **skill revalidation interval default 24 months; competency-model review cadence 12 months; campaign escalation T-14/T-3/T+1 days (v2)**.
- **C. Kirkpatrick capture model (v2, reframed):** L1 (relevance, trainer, materials, logistics, overall) per participant; L2 (pre/post score) per participant; **L3 (behaviour) and L4 (results) are optional, sampled, programme-level — NOT per-employee T+90**; L4 `responses_json` links named M14 business-KPI keys to enable cost-per-outcome. The fictional per-employee T+90 survey from v1 is removed.
- **D. `is_significant` rule set (v2 — promoted into FR-TSD-016, no longer an appendix afterthought):** a completion/credential is significant if ANY of: mandatory certification; externally accredited/professional credential (verified); programme duration ≥ configured threshold; promotion-relevant flag (M06); sponsored degree/deputation. Rules are configurable and the matched rule(s) stored for audit.
- **E. Single-LMS-of-record decision (v2):** exactly one `learning_record_stores` is `is_primary`; xAPI via LRS ingest, SCORM via reporting-API poll, optional self-hosted SCORM player. No SCORM webhook is assumed anywhere.
- **F. Inherited shared definitions:** see `SHARED_FOUNDATION.md` §2–§5 (entities, conventions, roles, technical defaults). Not redefined here.

---

*End of M07-TSD BRD v2.0. This revision incorporates all 25 adopted improvements from the adversarial council review, mitigates both Critical and all High/Medium/Low risks in the Risk Register as concrete requirements/controls, fixes the falsifiable data-model defects, resequences the build around the statutory spine, and preserves the full 16-section brd-generator structure with 0 unresolved gaps.*







