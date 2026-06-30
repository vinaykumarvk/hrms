# Performance Appraisal Management — HRMS Module BRD (v2.0)

**Module code:** M08-PAM
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite")
**Document version:** v2.0 (revised — incorporates Adversarial Council adopted improvements)
**Supersedes:** v1.0 (`docs/brd/v1/M08-performance-appraisal-management.md`)
**Status:** Baseline for build (parallel-agent ready) — Phase-1 statutory core + Phase-2 flagged differentiators
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM) layered on the public-sector statutory **APAR** (Annual Performance Appraisal Report) context.
**Upstream contract:** `docs/brd/SHARED_FOUNDATION.md` (canonical entities, conventions, RBAC, technical defaults). This BRD **references** shared elements and only **extends** them.
**Review provenance:** `docs/evaluation/M08-performance-appraisal-management-council.md` — 23 adopted improvements + 18-item risk register (R1–R18) are incorporated; see the **Amendments (v1 → v2)** table.

---

## Section 1 — Executive Summary

### 1.1 Purpose

Performance Appraisal Management (M08-PAM) is the system of engagement and adjudication for measuring, recording, moderating and certifying employee performance across an annual (and continuous) cycle. It unifies two worlds that government HR has historically kept apart:

1. **Modern continuous performance management (CPM)** — OKR/KRA-based goal-setting, cascading objectives, real-time feedback, check-ins, 360-degree feedback, competency assessment, and calibration — the practices best-in-class enterprises expect.
2. **The statutory APAR process** — a confidential, multi-tier adjudicated record authored by one or more **Reporting Officers** (over part-periods), scrutinised by a **Reviewing Officer**, and certified by an **Accepting Authority**, including numeric grading, the integrity/attribute columns, the pen-picture, **mandatory full disclosure** of the entire APAR to the officer reported upon, the right of **representation/appeal** against adverse or below-benchmark remarks, the **Sealed Cover Procedure** for officers under charge, **digitally-signed (DSC/eSign) non-repudiable** certification, and the eventual **custody and posting** of the final grade to the Digital Service Register.

### 1.2 What changed in v2 (the architecture decision)

v2 resolves the council's single highest-severity finding: **the continuous-performance subsystem and the statutory-APAR subsystem are now clearly separated and bridged by an immutable snapshot-on-lock**, not fused on one row. Goals/OKRs are owned at **employee × cycle/period** (they may pre-date a form and span cycles); at goal-lock an immutable copy is snapshotted into the statutory form. **Calibration is repositioned as a ratified recommendation**: a committee may only *recommend*; a certified `final_grade` changes only when the Accepting Authority (or designated competent authority) **ratifies** with MFA step-up **and** digital signature. **Forced ranking is removed**; statutory grading is absolute. Several named statutory procedures absent in v1 are added as first-class capabilities: **Sealed Cover, multi-RO part-period reports + "No Report Certificate", auto-escalation on tier default, digital signature, hash-chained tamper-evidence, apex-chain handling, probation confirmation, and a representation escalation ladder.**

### 1.3 Business outcomes

| Outcome | Measure |
|---|---|
| Timely cycle completion | ≥ 95% of APARs certified within the statutory calendar window |
| Goal alignment | ≥ 90% of employees with approved, weighted, cascaded goals before cycle mid-point |
| Procedural fairness | 100% of adverse remarks disclosed and substantiated by disclosable evidence; 100% of representations adjudicated within SLA |
| Defensible moderation | Every calibration recommendation carries a recorded rationale and an authority's ratification signature |
| Statutory integrity | 100% of final grades posted to M12 Service Register as append-only, hash-verifiable events |
| Non-repudiation | 100% of tier certifications, disclosure acknowledgements and expunctions carry a verifiable digital signature |
| Equity | DPDP-safe adverse-rate / below-benchmark disparity monitored by gender / cadre / region / RO across cycles |
| Workforce insight | Real-time rating-distribution and skew analytics for every org unit |

### 1.4 Scope at a glance

In scope: cycle configuration; templates; goal/KRA/KPI management at employee×period with snapshot-on-lock; self-appraisal; **multi-RO part-period APAR** three-tier workflow; rating scales and numeric grade computation with explicit weightage-policy semantics; **mandatory full disclosure** and representation/appeal with an escalation ladder; **calibration as ratified recommendation (committee review + normalisation only)**; continuous feedback and check-ins; 360-degree feedback; competency assessment with skill-gap → training linkage to M07; **Sealed Cover Procedure**; **SLA auto-escalation / authoring-right transfer**; **digital signature / non-repudiation**; **probation confirmation appraisal**; **cycle errata correction**; Performance Improvement Plans (PIP); custody/confidentiality with hash-chained tamper-evidence and heir-access; posting final ratings to M12 and feeding promotion eligibility to M06 (suppressed under sealed cover); performance and bias-disparity analytics.

Out of scope (owned elsewhere): the employee master (M01), training delivery (M07), promotion decisioning (M06), disciplinary proceedings (M09), payroll/increment posting (M10), the Service Register ledger itself (M12), and the document object store (M13).

### 1.5 Key design principles

- **Two subsystems, one identity.** Continuous performance (open, employee-owned, cross-cycle) and the statutory APAR (closed, adjudicated, append-only) share identity and analytics but are bridged only by a one-way **snapshot-on-lock**. The legal record never live-references mutable goals.
- **Authority owns the grade, not the committee.** Calibration produces recommendations; only a competent grading authority mutates a certified grade, always with step-up + digital signature.
- **Absolute grading.** Statutory grading is merit-based and absolute; target distributions are diagnostic only. Forced distribution is not supported.
- **Confidentiality by construction.** Tier-aware, server-side field projection (fields *absent*, not greyed), with plain-language "why hidden" reasons; performance-gated to hold P95 < 500ms at 200k scale.
- **Append-only, hash-verifiable certification.** Certification and custody ledgers are hash-chained and externally anchored; tamper-evidence is engineered, not asserted.
- **Separation of duties + declared COI.** Maker ≠ checker at every tier; structural self/chain exclusion is extended to declared conflict-of-interest recusal for adjudicators and calibration members.
- **Configurable, not hard-coded.** Scales, weightages, benchmarks, workflows, disclosure timing, chain-truncation rules and retention are configuration, versioned per cycle, correctable through a controlled errata path.

---

## Section 1A — Amendments (v1 → v2)

Each adopted council improvement (and its risk-register ID) is mapped to where and how it is incorporated.

| # | Adopted improvement (Risk) | Incorporated in | How |
|---|---|---|---|
| 1 | Calibration as ratified recommendation (R1) | New entity **E21 `calibration_recommendations`**; FR-M08-09 rewritten; Section 10.5/10.6 state machines; Section 3 RBAC; E15 now requires `recommendation_id` + ratification | Committee recommends; AA/competent authority ratifies with step-up + DSC, or calibration runs pre-certification. No autonomous committee grade mutation. |
| 2 | Remove `FORCED_DISTRIBUTION`; default-off `BELL_CURVE` (R2) | E14 enum reduced; FR-M08-09 AC/BR; §5.5 enum catalog; Glossary | `calibration.method` = COMMITTEE_REVIEW, NORMALISATION, BELL_CURVE(off by default). `target_distribution` is diagnostic-only; statutory grading declared absolute. |
| 3 | Sealed Cover Procedure (R3) | New **FR-M08-17**; E4 fields `sealed_cover*`; new form state `SEALED_COVER`; M09 boundary; FR-M08-14 feed suppression | M09 charge/sub-judice status seals the form; finalisation blocked and M06 feed suppressed until proceeding concludes; release is signed. |
| 4 | Multi-RO part-period reports + "No Report Certificate" (R4) | New **FR-M08-18**; new entity **E19 `appraisal_report_periods`**; E4 `has_multi_ro`; FR-M08-04 aggregation; §5.6 rules | Per-period RO/grade/supervision-months; min-supervision rule triggers No-Report Certificate; part-period grades aggregate (supervision-weighted) into provisional grade. |
| 5 | Natural-justice guard on adverse remarks (R5) | FR-M08-04/05/06/08 BRs; new error `ADVERSE_EVIDENCE_REQUIRED`; §5.6 rule 14 | An adverse / below-benchmark entry must cite disclosable evidence; anonymous 360 or visibility-restricted feedback cannot be the sole basis. |
| 6 | Decouple goals/OKRs from form; snapshot-on-lock (R6) | E5 `form_id` nullable + `cycle_id`/ownership; new entity **E20 `form_goal_snapshots`**; FR-M08-02 rewritten; FR-M08-07 roll-up reads snapshot | Goals live at employee×cycle (cross-cycle allowed, parentless drafting); lock writes an immutable snapshot into the form; statutory roll-up reads the snapshot. |
| 7 | Mandatory full-APAR disclosure (R7) | FR-M08-08 BR1 rewritten; §5.5 cycle config; Section 10.1 | Entire report incl. every grading disclosed to every officer; only channel/timing configurable, never *whether*. `disclosure_required` removed as an opt-out. |
| 8 | Disclosure / representation clock clarity (R8) | FR-M08-08 AC/BR; E4 `dispatched_at`, `representation_clock_start`, `representation_window_start_at` | Clock-start (dispatch vs acknowledgement) is explicit per-jurisdiction config; both timestamps recorded; deemed-disclosure still opens the window. |
| 9 | Auto-escalation on tier default (R9) | New **FR-M08-19**; Section 10.1 transitions; Section 11 notifications | On missed RO/RvO/AA window, authoring right transfers to the next higher authority or a "No Report due to RO/RvO" is recorded — not just a reminder. |
| 10 | Digital signature / non-repudiation (R10) | New **FR-M08-20**; new entity **E23 `digital_signatures`**; E8/E18 signature refs; NFR; §9 | DSC/eSign (distinct from MFA) required on tier certification, disclosure ack, calibration ratification, expunction, No-Report cert, sealed-cover release, disposal. |
| 11 | Engineer tamper-evidence (R11) | FR-M08-15 rewritten; E18 `prev_hash`/`row_hash`/`anchor_ref`; new event types ANCHOR; verification endpoint | Hash-chained append-only log + periodic external anchoring + `/verify` endpoint replace the bare "tamper-evident" assertion. |
| 12 | Apex-officer chain handling (R12) | FR-M08-01/05/06 BRs; E4 `chain_truncated`/`chain_config`; new error `CHAIN_TRUNCATED_UNCONFIGURED` | Configurable truncated-chain rule (designated alternate tiers or recorded single-tier); never a silent "all four distinct" failure. |
| 13 | Bias-disparity analytics (R13) | FR-M08-16 extended; Section 12 reports | DPDP-safe adverse-rate / below-benchmark-rate / grade-mean by gender/cadre/region/RO over time (min-N suppressed) + rater-leniency model across cycles. |
| 14 | Tier-projection performance gate (R14) | FR-M08-15 LLD; Section 9 NFR; Section 13 GA gate | Projection caching / column pre-computation; P95 < 500ms at 200k load-test is a hard GA gate. |
| 15 | Deceased/heir custody + retention-vs-erasure (R15) | FR-M08-15 AC/BR; new event `HEIR_ACCESS`; Section 9 Retention | Legal-heir/nominee access path; stated legal basis that statutory retention overrides DPDP erasure. |
| 16 | Phase the scope (R16) | Section 13.3 pilot; Section 14.3 waves; §5.5 feature flags | Phase-1 GA = statutory core; continuous (FR-10), 360 (FR-11), calibration (FR-09, scoped) feature-flagged Phase-2. |
| 17 | Plain-language role context + "why hidden" (R17) | Section 7.2/7.3; FR-M08-04/05/06 UI notes; treated as leak-prevention control | Workbench states each user's tier in plain language and shows a reason banner where fields are absent. |
| 18 | Cycle errata workflow (R18) | New **FR-M08-22**; Section 10.7; new error `ERRATA_IN_PROGRESS` | Controlled cycle-correction/re-derivation for config errors mid-cycle, audited and re-notified — instead of routing every case through representation. |
| 19 | Probation appraisal semantics | New **FR-M08-21**; E1 probation fields; E4 `probation_outcome`; M01/M12 feed | `PROBATION` cycle yields confirmation-recommendation / extension outcome fed to M01 + M12, distinct from annual APAR. |
| 20 | Representation escalation ladder + external reference | FR-M08-08 extended; E13 `condonation_*`, `disposal_deadline_at`, `external_reference`, `escalation_level`; Section 10.3 | Statutory disposal deadline, condonation authority for late filing, external tribunal (e.g., CAT) handoff flag close the appeal chain. |
| 21 | Clarify weightage-policy semantics | FR-M08-07 rewritten; E2 `weightage_policy` schema; §5.6 rule 1 | Explicit: DEVELOPMENT goals and competencies sit **outside** the 100% performance sum; goal-vs-competency split and final roll-up formula defined. |
| 22 | Broaden COI / recusal | New entity **E22 `coi_recusals`**; FR-M08-09 BR; Section 3 RBAC hard rule | Self/chain exclusion extended to declared COI (spouse, close relation, same prior posting) with recorded recusal for adjudicators and calibration members. |
| 23 | Dual-control on irreversible actions | FR-M08-15 BR; new error `DUAL_CONTROL_REQUIRED`; Section 9 | Retention **disposal** and **confidentiality downgrade** require a second-person approval in addition to MFA step-up. |

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Description | Primary FRs | Phase |
|---|---|---|---|
| Cycle & template administration | Define appraisal cycles, eligibility, calendar, forms, scales, chain-truncation config | FR-M08-01, FR-M08-07 | P1 |
| Goal / objective management | Employee×period KRA/KPI/OKR, cascading, weightages, snapshot-on-lock, mid-year revision | FR-M08-02 | P1 |
| Self-appraisal | Officer's self-assessment and achievement narrative | FR-M08-03 | P1 |
| APAR adjudication workflow | Multi-RO part-period → Reviewing → Accepting tier flow | FR-M08-04, FR-M08-05, FR-M08-06 | P1 |
| Grading & rating | Scales, weightage-policy roll-up, benchmark/adverse detection | FR-M08-07 | P1 |
| Disclosure & representation | Mandatory full disclosure; appeal with escalation ladder; expunction | FR-M08-08 | P1 |
| Calibration & moderation | Committee recommendation + normalisation; AA ratification | FR-M08-09 | P2 (flag) |
| Continuous feedback & check-ins | Real-time feedback, periodic check-ins | FR-M08-10 | P2 (flag) |
| 360-degree feedback | Multi-rater nominations and aggregation | FR-M08-11 | P2 (flag) |
| Competency assessment | Competency rating + skill-gap → M07 training | FR-M08-12 | P1 |
| Performance Improvement Plan | PIP creation, milestones, outcome | FR-M08-13 | P1 |
| Downstream posting | Post final grade to M12; feed eligibility to M06 (sealed-cover aware) | FR-M08-14 | P1 |
| Custody & confidentiality | Hash-chained disclosure log, tier projection, heir access, retention, dual-control | FR-M08-15 | P1 |
| Analytics | Rating distribution, skew, completion, gap, bias-disparity analytics | FR-M08-16 | P1/P2 |
| Sealed Cover Procedure | M09-driven sealing; finalise/feed suppression; signed release | FR-M08-17 | P1 |
| Multi-RO part-period reports | Per-period RO/grade; No-Report Certificate; aggregation | FR-M08-18 | P1 |
| SLA auto-escalation | Authoring-right transfer on tier default | FR-M08-19 | P1 |
| Digital signature / non-repudiation | DSC/eSign on certify/ack/ratify/expunge/dispose | FR-M08-20 | P1 |
| Probation confirmation appraisal | Confirmation/extension outcome to M01/M12 | FR-M08-21 | P1 |
| Cycle errata / correction | Controlled mid-cycle re-derivation | FR-M08-22 | P1 |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit:** every state change writes to `audit_log` (immutable).
- **Workflow engine:** `workflow_instances` / `workflow_tasks` drive the APAR tier flow, representation flow, calibration ratification, sealed-cover and escalation.
- **Documents:** supporting evidence, signed APAR PDFs, disclosure acknowledgements and digital-signature artefacts stored via M13 `documents`.
- **Notifications:** all task assignments, disclosures, escalations and deadlines via shared `notifications`.
- **Service Register:** final grades, sealed-cover and adverse-remark events posted to M12 `service_register_events`.
- **RBAC + row-level org scoping:** standard across all endpoints; APAR adds tier-aware field-level scoping, COI recusal, and dual-control on irreversible actions.
- **Pagination, soft-delete, UTC storage, `DD-MMM-YYYY` display:** per global conventions.

### 2.3 Boundaries & integration points

| Boundary | Direction | Contract |
|---|---|---|
| M01 Employee Master | read / write(feed) | Identity, designation, cadre, reporting chain, status (read); probation confirmation outcome (write feed) |
| M06 Promotion/Progression | write (feed) | Final grade + benchmark eligibility flag per cycle; **suppressed while `sealed_cover=true`**; corrective on representation/expunction |
| M07 Training & Skill | read/write | Competency framework (read); skill-gap nominations (write) |
| M09 Disciplinary | read (event/subscribe) | Active charge / sub-judice / penalty status → drives **Sealed Cover** and APAR holds; conclusion event releases sealed cover |
| M12 Digital SR | write | Append-only, hash-verifiable `service_register_events` for final grade, sealed-cover and adverse remarks |
| M13 Documents | read/write | Evidence, generated APAR PDF, disclosure acknowledgements, DSC/eSign artefacts |
| M14 Analytics | read | Exposes rating-distribution and bias-disparity facts for cross-module dashboards |
| eSign/DSC provider | call | DSC token / Aadhaar-eSign / HSM signing service for non-repudiable signatures (FR-M08-20) |

### 2.4 Explicit exclusions

The module does **not** compute increments/pay (M10), does **not** decide promotions (only feeds eligibility to M06), does **not** run disciplinary inquiries (M09) — it only consumes M09 charge status to seal a cover — and does **not** define the competency catalog (consumes M07's). Forced-distribution / quota-driven grading is explicitly **out of scope** by design.

---

## Section 3 — Roles & Permissions

### 3.1 Module roles (extend Shared RBAC; do not contradict)

| Role | Origin | Description |
|---|---|---|
| Officer Reported Upon (Appraisee) | Shared: Employee | The employee whose performance is appraised; sets goals, self-appraises, views/represents APAR after disclosure |
| Reporting Officer (RO) | Shared: Reporting Manager (specialised) | First-tier appraiser over a **part-period**; approves goals, writes assessment, integrity/pen-picture, part-period grade |
| Reviewing Officer (RvO) | Shared: Dept Head (specialised) | Second-tier; concurs/varies RO assessment with recorded reasons |
| Accepting Authority (AA) | Shared: Appointing Authority (specialised) | Final certifying authority; settles grade, ratifies calibration, triggers disclosure; signs with DSC |
| Competent / Adjudicating Authority | Module-specific (senior to AA) | Adjudicates representations; may ratify calibration where designated; not in the appraisee's chain |
| Condonation Authority | Module-specific | Authorises acceptance of a late representation (statutory condonation) |
| Calibration Committee Member | Module-specific | Participates in moderation sessions; proposes/votes **recommendations** (never mutates a certified grade) |
| HR / APAR Cell Officer | Shared: HR Officer | Administers cycles, custody, disclosure dispatch, representation routing, errata (non-adjudicating) |
| APAR Custodian | Module-specific (aligns with M12 Custodian) | Confidential custody, retention, expunction execution, heir-access grants |
| Dual-Control Approver | Module-specific (second custodian/HR) | Second-person approval for disposal and confidentiality downgrade |
| Legal Heir / Nominee | Module-specific (external, scoped) | Time-boxed read access to a deceased/retired officer's APAR per statute |
| Auditor (read-only) | Shared | Read APAR + audit log + hash-verification; no write |
| System Administrator | Shared | Configures scales, templates, workflows, RBAC, chain-truncation, feature flags; no self-adjudication |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-Delete/Withdraw, A=Approve/Adjudicate, S=Sign, X=No access)

| Capability | Appraisee | RO | RvO | AA | Competent Auth | Calib. Member | HR/APAR Cell | Custodian | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Configure cycle / template / scale / chain rules | X | X | X | X | X | X | C R U | R | R | C R U |
| Set / approve goals | C R U (own) | A R U (reports) | R | R | R | X | R | X | R | X |
| Submit self-appraisal | C R U (own) | R | R | R | R | X | R | X | R | X |
| Write RO part-period assessment | R (after disclosure) | C R U A S | R | R | R | X | R | X | R | X |
| Write RvO review | X | R | C R U A S | R | R | X | R | X | R | X |
| Accept / certify grade (DSC) | X | X | R | C R U A S | R | R | R | X | R | X |
| Propose calibration recommendation | X | R | R | R | R | C R A | R | X | R | X |
| Ratify calibration (DSC) | X | X | X | A S | A S | X | R | X | R | X |
| Disclose APAR (mandatory) | R (recipient) | X | X | A | R | X | C A | R | R | X |
| Acknowledge disclosure (eSign) | A S (own) | X | X | R | R | X | R | R | R | X |
| File representation | C R (own) | R | R | A | A | X | R | R | R | X |
| Adjudicate representation | X | R | R | A | C R U A S | X | R | X | R | X |
| Condone late representation | X | X | X | R | A | X | R | X | R | X |
| Seal / release Sealed Cover | X | X | X | R | A | X | C A | A S | R | X |
| Create / manage PIP | R (own) | C R U A | A | R | R | X | R | X | R | X |
| Continuous feedback / check-in | C R (own+given) | C R U | C R | R | R | X | R | X | R | X |
| 360 feedback respond | C R (assigned) | C R | C R | R | R | X | C R U | X | R | X |
| Competency assessment | R (own) | C R U | R | A | R | X | R | X | R | X |
| Post grade to SR / feed M06 | X | X | X | trigger | R | X | A | A | R | X |
| Dispose / downgrade confidentiality | X | X | X | X | R | X | A (maker) | A (maker) | R | X |
| Approve disposal/downgrade (2nd person) | X | X | X | X | A | X | A (checker) | A (checker) | R | X |
| Grant legal-heir access | X | X | X | R | A | X | A | A S | R | X |
| View analytics | R (own only) | R (team) | R (org) | R (org) | R (org) | R (calib scope) | R (org) | X | R | R |
| Verify hash-chain integrity | X | X | X | R | R | X | R | R | A | R |
| Access disclosure/custody log | R (own) | X | X | R | R | X | R | R A | R | R |

**Hard rule (separation of duties + COI).** A user holding multiple roles is blocked at the API layer from acting on an APAR where they are the appraisee, or where they are any other tier in the same chain (self-adjudication and adjacent-tier conflict prevention). **In addition**, an adjudicating authority or calibration committee member who has a declared conflict of interest (spouse / close relation / same direct prior posting / financial) with the appraisee must record a recusal (`E22 coi_recusals`) and is blocked from acting on that form. Multi-role callers receive the **lowest-privilege** tier projection.

---

## Section 4 — Shared Application Foundation

This module **inherits** Shared Foundation §5 verbatim and applies the following module specialisations.

- **Architecture:** React + TS (Tailwind + shadcn/ui) SPA; REST `/api/v1`; PostgreSQL; M13 object storage for evidence/PDF/signature artefacts; CGG Data Centre deployment.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org scoping; **plus** APAR tier-aware field-level authorization (a server-side projection that strips fields the caller's tier/role may not see) and **plus** non-repudiable **DSC/eSign** digital signatures on statutory acts (distinct from MFA step-up — MFA authenticates the session; the signature binds the record).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Inherited error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503).
- **Workflow:** APAR tier transitions, representation flow, calibration ratification, sealed-cover and auto-escalation run on shared `workflow_instances`/`workflow_tasks`; M08 supplies the state machines (Section 10).
- **Security/compliance:** OWASP ASVS; TLS 1.2+; encryption at rest; DPDP Act 2023 alignment; APAR content classified **CONFIDENTIAL**; statutory retention overrides the DPDP erasure right (legal basis recorded, FR-M08-15); hash-chained, externally-anchored tamper-evidence.
- **NFR baseline:** P95 < 500ms (incl. tier projection at 200k scale — a GA gate); 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min; RTO ≤ 4h (Section 9 extends).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

**Reused (defined in Shared Foundation — referenced, not redefined):** `employees`, `users`, `org_units`, `designations`, `cadres`, `roles`, `permissions`, `audit_log`, `documents`, `notifications`, `workflow_instances`, `workflow_tasks`, `service_register_events`.

**Module-owned entities (M08):**

| # | Entity | Purpose | New in v2 |
|---|---|---|---|
| E1 | `appraisal_cycles` | A configured appraisal period (statutory year / mid-year / probation / continuous window) | extended |
| E2 | `appraisal_templates` | Versioned form definition: sections, competencies, scale, weightage policy | extended |
| E3 | `rating_scales` | Configurable grade scales (numeric + descriptor + benchmark thresholds) | — |
| E4 | `appraisal_forms` | The APAR instance for one appraisee × cycle (header, integrity, pen-picture, final grade, sealed-cover, clock, chain config) | extended |
| E5 | `goals` | KRA/KPI/OKR owned at **employee × cycle/period** with weightage, target, cascade parentage | **decoupled** |
| E6 | `goal_checkins` | Periodic progress updates against a goal | — |
| E7 | `self_appraisals` | Appraisee's self-assessment payload for a form | — |
| E8 | `appraisal_assessments` | Per-tier (RO/RvO/AA) assessment record with grades, remarks, signature ref | extended |
| E9 | `competency_assessments` | Per-competency ratings and identified skill gaps | — |
| E10 | `continuous_feedback` | Real-time praise/constructive feedback notes | — |
| E11 | `feedback_360_requests` | A 360 nomination/request to a rater | — |
| E12 | `feedback_360_responses` | A rater's 360 response | — |
| E13 | `representations` | Appeal/representation against adverse or below-benchmark remarks, with escalation ladder | extended |
| E14 | `calibration_sessions` | A moderation/normalisation committee session (absolute-grading; no forced distribution) | extended |
| E15 | `calibration_adjustments` | An **applied** grade change — only after a ratified recommendation | extended |
| E16 | `performance_improvement_plans` | PIP header tied to an appraisee | — |
| E17 | `pip_milestones` | Milestones/checkpoints within a PIP | — |
| E18 | `apar_disclosure_log` | Hash-chained custody & disclosure/acknowledgement ledger (append-only) | extended |
| **E19** | `appraisal_report_periods` | **Multi-RO part-period reports + No-Report Certificate** | **NEW** |
| **E20** | `form_goal_snapshots` | **Immutable snapshot of goals into the statutory form at lock** | **NEW** |
| **E21** | `calibration_recommendations` | **Committee recommendation awaiting authority ratification** | **NEW** |
| **E22** | `coi_recusals` | **Declared conflict-of-interest recusals for adjudicators/calibrators** | **NEW** |
| **E23** | `digital_signatures` | **DSC/eSign non-repudiation artefacts for statutory acts** | **NEW** |

### 5.2 Full field tables

#### E1 — `appraisal_cycles` (extended)
| Field | Type | Null | Notes |
|---|---|---|---|
| `cycle_id` | UUID PK | N | |
| `cycle_code` | VARCHAR(40) UNIQUE | N | e.g. `APAR-2025-26` |
| `name` | VARCHAR(160) | N | |
| `cycle_type` | ENUM | N | ANNUAL_APAR, MID_YEAR, PROBATION, CONTINUOUS, AD_HOC |
| `fiscal_year` | VARCHAR(9) | N | `2025-2026` |
| `goal_window_start` | DATE | N | |
| `goal_window_end` | DATE | N | |
| `appraisal_period_start` | DATE | N | Performance period start |
| `appraisal_period_end` | DATE | N | |
| `self_appraisal_due` | DATE | Y | |
| `ro_due` | DATE | Y | |
| `rvo_due` | DATE | Y | |
| `aa_due` | DATE | Y | |
| `template_id` | UUID FK→E2 | N | |
| `rating_scale_id` | UUID FK→E3 | N | |
| `eligibility_rule` | JSONB | Y | cadre/designation/min-service filters |
| `disclosure_channel` | ENUM | N | IN_APP, EMAIL, PHYSICAL, HYBRID — *channel only; disclosure itself is mandatory (R7)* |
| `representation_clock_start` | ENUM | N | DISPATCH, ACKNOWLEDGEMENT — per-jurisdiction (R8) |
| `representation_window_days` | INT | N | statutory days |
| `deemed_disclosure_days` | INT | N | non-ack auto-deemed period (still opens window) |
| `calibration_enabled` | BOOLEAN | N | default **false** (Phase-2 flag, R16) |
| `min_supervision_months` | NUMERIC(4,1) | N | default 3.0 — No-Report threshold (R4) |
| `chain_truncation_policy` | JSONB | Y | apex-officer config: designated alternates / single-tier (R12) |
| `probation_period_months` | INT | Y | for PROBATION cycles (R19) |
| `probation_extension_max_months` | INT | Y | cap on extension |
| `status` | ENUM | N | DRAFT, OPEN, GOALS_LOCKED, IN_PROGRESS, CALIBRATION, DISCLOSURE, ERRATA, CLOSED, ARCHIVED |
| audit fields | — | — | created_at, updated_at, created_by, updated_by, is_deleted |

#### E2 — `appraisal_templates` (extended)
| Field | Type | Null | Notes |
|---|---|---|---|
| `template_id` | UUID PK | N | |
| `template_code` | VARCHAR(40) UNIQUE | N | |
| `name` | VARCHAR(160) | N | |
| `version` | INT | N | immutable per published version |
| `applies_to_cadre` | VARCHAR[] | Y | |
| `sections` | JSONB | N | ordered section/field definitions |
| `competency_set` | JSONB | N | references M07 competency IDs |
| `weightage_policy` | JSONB | N | **explicit schema (R21):** `{ performance_sum:100, goal_split_pct, competency_split_pct, development_in_sum:false, competency_in_sum:bool, caps:{...} }` |
| `integrity_column_enabled` | BOOLEAN | N | statutory integrity attribute |
| `penpicture_min_words` | INT | Y | |
| `requires_dsc` | BOOLEAN | N | default true — tier certification needs digital signature (R10) |
| `status` | ENUM | N | DRAFT, PUBLISHED, RETIRED |
| audit fields | — | — | |

#### E3 — `rating_scales` (unchanged from v1)
| Field | Type | Null | Notes |
|---|---|---|---|
| `rating_scale_id` | UUID PK | N | |
| `scale_code` | VARCHAR(40) UNIQUE | N | e.g. `APAR-10PT` |
| `name` | VARCHAR(120) | N | |
| `min_value` | NUMERIC(4,2) | N | e.g. 1.00 |
| `max_value` | NUMERIC(4,2) | N | e.g. 10.00 |
| `grades` | JSONB | N | ordered [{label:"Outstanding",min:9,max:10,descriptor}] |
| `benchmark_grade` | NUMERIC(4,2) | N | promotion benchmark threshold |
| `adverse_threshold` | NUMERIC(4,2) | N | below = adverse remark |
| `decimal_places` | INT | N | default 2 |
| `status` | ENUM | N | ACTIVE, RETIRED |
| audit fields | — | — | |

#### E4 — `appraisal_forms` (APAR instance — extended)
| Field | Type | Null | Notes |
|---|---|---|---|
| `form_id` | UUID PK | N | |
| `apar_no` | VARCHAR(40) UNIQUE | N | human key e.g. `APAR-2025-26-000142` |
| `cycle_id` | UUID FK→E1 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `org_unit_id` | UUID FK→org_units | N | snapshot at open |
| `designation_id` | UUID FK→designations | N | snapshot |
| `reporting_officer_id` | UUID FK→employees | Y | **resolved from latest/primary report period (E19)**; nullable when multi-RO |
| `has_multi_ro` | BOOLEAN | N | default false; true when >1 report period (R4) |
| `reviewing_officer_id` | UUID FK→employees | Y | |
| `accepting_authority_id` | UUID FK→employees | Y | |
| `chain_truncated` | BOOLEAN | N | default false (R12) |
| `chain_config` | ENUM | N | FULL, NO_RVO, NO_AA, SINGLE_TIER, DESIGNATED_ALTERNATE |
| `integrity_certified` | ENUM | Y | BEYOND_DOUBT, WATCH, NOT_CERTIFIED |
| `integrity_remark` | TEXT | Y | required if not BEYOND_DOUBT |
| `pen_picture` | TEXT | Y | RO narrative |
| `provisional_grade` | NUMERIC(4,2) | Y | aggregated from report periods (E19) |
| `reviewed_grade` | NUMERIC(4,2) | Y | RvO-stage grade |
| `final_grade` | NUMERIC(4,2) | Y | AA-certified grade |
| `final_grade_label` | VARCHAR(40) | Y | derived from scale |
| `is_adverse` | BOOLEAN | N | default false; set when below adverse_threshold |
| `adverse_evidence_refs` | UUID[] | Y | disclosable evidence backing an adverse entry (R5) |
| `below_benchmark` | BOOLEAN | N | default false |
| `calibrated` | BOOLEAN | N | default false |
| `pre_calibration_grade` | NUMERIC(4,2) | Y | preserved on adjustment |
| `sealed_cover` | BOOLEAN | N | default false (R3) |
| `sealed_cover_reason` | TEXT | Y | required when sealed |
| `sealed_cover_case_ref` | VARCHAR(60) | Y | M09 case reference |
| `sealed_at` | TIMESTAMP | Y | |
| `sealed_released_at` | TIMESTAMP | Y | |
| `dispatched_at` | TIMESTAMP | Y | disclosure dispatch time (R8) |
| `disclosed_at` | TIMESTAMP | Y | |
| `acknowledged_at` | TIMESTAMP | Y | appraisee acknowledgement (eSign) |
| `representation_window_start_at` | TIMESTAMP | Y | derived from cycle clock-start config (R8) |
| `representation_window_end_at` | TIMESTAMP | Y | |
| `probation_outcome` | ENUM | Y | CONFIRMED, EXTENDED, DISCHARGE_RECOMMENDED (R19) |
| `certification_signature_id` | UUID FK→E23 | Y | AA DSC on certify (R10) |
| `status` | ENUM | N | see Section 10 state machine |
| `workflow_instance_id` | UUID FK | Y | |
| `generated_pdf_doc_id` | UUID FK→documents | Y | |
| `posted_to_sr` | BOOLEAN | N | default false |
| `confidentiality_class` | ENUM | N | default CONFIDENTIAL |
| audit fields | — | — | |

#### E5 — `goals` (decoupled — owned at employee × cycle/period)
| Field | Type | Null | Notes |
|---|---|---|---|
| `goal_id` | UUID PK | N | |
| `appraisee_id` | UUID FK→employees | N | **owner** of the objective |
| `cycle_id` | UUID FK→E1 | Y | nullable — allows cross-cycle / pre-form drafting (R6) |
| `form_id` | UUID FK→E4 | **Y** | **now nullable** — populated only when snapshotted into a form (R6) |
| `period_scope` | ENUM | N | SINGLE_CYCLE, CROSS_CYCLE |
| `goal_type` | ENUM | N | KRA, KPI, OKR_OBJECTIVE, OKR_KEYRESULT, DEVELOPMENT |
| `parent_goal_id` | UUID FK→E5 | Y | cascade parentage |
| `cascaded_from_employee_id` | UUID FK→employees | Y | source of cascade |
| `title` | VARCHAR(200) | N | |
| `description` | TEXT | Y | |
| `metric` | VARCHAR(200) | Y | measure of success |
| `target_value` | VARCHAR(80) | Y | |
| `weightage` | NUMERIC(5,2) | N | percent; performance siblings sum to 100; DEVELOPMENT excluded (R21) |
| `due_date` | DATE | Y | |
| `achievement_pct` | NUMERIC(5,2) | Y | self/RO assessed |
| `self_rating` | NUMERIC(4,2) | Y | |
| `ro_rating` | NUMERIC(4,2) | Y | |
| `snapshotted` | BOOLEAN | N | default false; true once copied to E20 |
| `status` | ENUM | N | DRAFT, PROPOSED, APPROVED, REVISED, ACHIEVED, NOT_ACHIEVED, DROPPED |
| `approved_by` | UUID FK→employees | Y | RO |
| `approved_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E6 — `goal_checkins` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `checkin_id` | UUID PK | N | |
| `goal_id` | UUID FK→E5 | N | |
| `checkin_date` | DATE | N | |
| `progress_pct` | NUMERIC(5,2) | Y | |
| `status_note` | TEXT | Y | |
| `raised_by` | UUID FK→employees | N | appraisee or RO |
| `blockers` | TEXT | Y | |
| audit fields | — | — | |

#### E7 — `self_appraisals` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `self_appraisal_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 UNIQUE | N | one per form |
| `achievements` | TEXT | N | narrative |
| `goal_summary` | JSONB | Y | per-goal self rating snapshot |
| `competency_self_rating` | JSONB | Y | |
| `constraints_faced` | TEXT | Y | |
| `training_needs` | TEXT | Y | feeds competency/M07 |
| `submitted_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | DRAFT, SUBMITTED, RETURNED |
| audit fields | — | — | |

#### E8 — `appraisal_assessments` (extended — signature ref)
| Field | Type | Null | Notes |
|---|---|---|---|
| `assessment_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `report_period_id` | UUID FK→E19 | Y | set for REPORTING tier when multi-RO (R4) |
| `tier` | ENUM | N | REPORTING, REVIEWING, ACCEPTING |
| `assessor_id` | UUID FK→employees | N | |
| `is_escalated_author` | BOOLEAN | N | default false; true if written by escalation (R9) |
| `overall_grade` | NUMERIC(4,2) | Y | |
| `section_grades` | JSONB | Y | per-section scoring |
| `remarks` | TEXT | Y | |
| `adverse_evidence_refs` | UUID[] | Y | required if remark is adverse (R5) |
| `concurs_with_lower_tier` | BOOLEAN | Y | RvO/AA: agree with RO? |
| `variance_reason` | TEXT | Y | required if not concurring |
| `signature_id` | UUID FK→E23 | Y | DSC/eSign of this tier act (R10) |
| `decision` | ENUM | Y | SUBMITTED, RETURNED, CONCURRED, VARIED, CERTIFIED |
| `acted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E9 — `competency_assessments` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `comp_assessment_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `competency_id` | UUID | N | references M07 competency catalog |
| `competency_name` | VARCHAR(160) | N | snapshot |
| `required_level` | INT | N | from role profile (M07) |
| `self_level` | INT | Y | |
| `assessed_level` | INT | Y | RO assessed |
| `gap` | INT | Y | derived required − assessed |
| `gap_severity` | ENUM | Y | NONE, MINOR, MODERATE, CRITICAL |
| `training_nomination_id` | UUID | Y | M07 nomination created from gap |
| audit fields | — | — | |

#### E10 — `continuous_feedback` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `feedback_id` | UUID PK | N | |
| `subject_employee_id` | UUID FK→employees | N | |
| `author_id` | UUID FK→employees | N | |
| `cycle_id` | UUID FK→E1 | Y | |
| `feedback_type` | ENUM | N | PRAISE, CONSTRUCTIVE, COACHING, GENERAL |
| `visibility` | ENUM | N | PRIVATE_TO_SUBJECT, MANAGER_ONLY, MANAGER_AND_SUBJECT |
| `body` | TEXT | N | |
| `linked_goal_id` | UUID FK→E5 | Y | |
| `is_acknowledged` | BOOLEAN | N | default false |
| audit fields | — | — | |

#### E11 — `feedback_360_requests` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `request_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `subject_employee_id` | UUID FK→employees | N | |
| `rater_id` | UUID FK→employees | N | |
| `rater_relationship` | ENUM | N | PEER, SUBORDINATE, MANAGER, INTERNAL_CUSTOMER, EXTERNAL |
| `anonymous` | BOOLEAN | N | default true |
| `due_date` | DATE | Y | |
| `status` | ENUM | N | INVITED, IN_PROGRESS, SUBMITTED, DECLINED, EXPIRED |
| audit fields | — | — | |

#### E12 — `feedback_360_responses` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `response_id` | UUID PK | N | |
| `request_id` | UUID FK→E11 UNIQUE | N | |
| `ratings` | JSONB | N | per-competency/behaviour scores |
| `strengths` | TEXT | Y | |
| `improvements` | TEXT | Y | |
| `submitted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E13 — `representations` (extended — escalation ladder)
| Field | Type | Null | Notes |
|---|---|---|---|
| `representation_id` | UUID PK | N | |
| `rep_no` | VARCHAR(40) UNIQUE | N | |
| `form_id` | UUID FK→E4 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `grounds` | TEXT | N | basis of appeal |
| `contested_items` | JSONB | N | which remarks/grades contested |
| `supporting_doc_ids` | UUID[] | Y | M13 documents |
| `filed_at` | TIMESTAMP | N | |
| `sla_due_at` | TIMESTAMP | N | statutory window to file |
| `disposal_deadline_at` | TIMESTAMP | N | authority's statutory deadline to decide (R20) |
| `is_late` | BOOLEAN | N | default false |
| `condoned` | BOOLEAN | N | default false (R20) |
| `condonation_authority_id` | UUID FK→employees | Y | |
| `condonation_reason` | TEXT | Y | |
| `escalation_level` | INT | N | default 1 |
| `external_reference` | ENUM | N | NONE, CAT, HIGH_COURT, TRIBUNAL (R20) |
| `external_ref_no` | VARCHAR(60) | Y | |
| `decision` | ENUM | Y | UPHELD, PARTIALLY_UPHELD, REJECTED, EXPUNGED, MODIFIED, ESCALATED_EXTERNAL |
| `decision_authority_id` | UUID FK→employees | Y | competent authority |
| `decision_reason` | TEXT | Y | |
| `revised_grade` | NUMERIC(4,2) | Y | if modified |
| `status` | ENUM | N | FILED, UNDER_REVIEW, DECIDED, ESCALATED, CLOSED |
| audit fields | — | — | |

#### E14 — `calibration_sessions` (extended — absolute grading)
| Field | Type | Null | Notes |
|---|---|---|---|
| `session_id` | UUID PK | N | |
| `cycle_id` | UUID FK→E1 | N | |
| `org_unit_scope` | UUID FK→org_units | N | population scoped |
| `method` | ENUM | N | COMMITTEE_REVIEW, NORMALISATION, BELL_CURVE — *`FORCED_DISTRIBUTION` removed (R2)* |
| `bell_curve_enabled` | BOOLEAN | N | default **false** (R2) |
| `target_distribution` | JSONB | Y | **diagnostic-only**, never an enforced quota (R2) |
| `committee_member_ids` | UUID[] | N | |
| `runs_before_certification` | BOOLEAN | N | if true, output feeds AA certification directly (R1) |
| `scheduled_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | PLANNED, IN_SESSION, RECOMMENDED, RATIFIED, COMPLETED, CANCELLED |
| `outcome_summary` | TEXT | Y | |
| audit fields | — | — | |

#### E15 — `calibration_adjustments` (extended — applied only after ratification)
| Field | Type | Null | Notes |
|---|---|---|---|
| `adjustment_id` | UUID PK | N | |
| `recommendation_id` | UUID FK→E21 | N | **must reference a RATIFIED recommendation (R1)** |
| `session_id` | UUID FK→E14 | N | |
| `form_id` | UUID FK→E4 | N | |
| `old_grade` | NUMERIC(4,2) | N | |
| `applied_grade` | NUMERIC(4,2) | N | equals ratified `recommended_grade` |
| `ratified_by` | UUID FK→employees | N | AA / competent authority |
| `ratification_signature_id` | UUID FK→E23 | N | DSC on the grade mutation (R1, R10) |
| `applied_at` | TIMESTAMP | N | |
| `status` | ENUM | N | APPLIED, REVERSED |
| audit fields | — | — | |

#### E16 — `performance_improvement_plans` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `pip_id` | UUID PK | N | |
| `pip_no` | VARCHAR(40) UNIQUE | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `form_id` | UUID FK→E4 | Y | originating APAR (if any) |
| `initiated_by` | UUID FK→employees | N | RO |
| `reason` | TEXT | N | |
| `start_date` | DATE | N | |
| `target_end_date` | DATE | N | |
| `success_criteria` | TEXT | N | |
| `outcome` | ENUM | Y | SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| `status` | ENUM | N | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED |
| audit fields | — | — | |

#### E17 — `pip_milestones` (unchanged)
| Field | Type | Null | Notes |
|---|---|---|---|
| `milestone_id` | UUID PK | N | |
| `pip_id` | UUID FK→E16 | N | |
| `title` | VARCHAR(200) | N | |
| `due_date` | DATE | N | |
| `metric` | VARCHAR(200) | Y | |
| `progress_note` | TEXT | Y | |
| `status` | ENUM | N | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| audit fields | — | — | |

#### E18 — `apar_disclosure_log` (extended — hash-chained, append-only)
| Field | Type | Null | Notes |
|---|---|---|---|
| `disclosure_log_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `seq_no` | BIGINT | N | monotonic per form (chain order) |
| `event_type` | ENUM | N | DISPATCHED, DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, SEALED, UNSEALED, HEIR_ACCESS, EXPUNGED, ANCHOR |
| `actor_id` | UUID FK→employees | N | |
| `actor_role` | VARCHAR(60) | N | |
| `ip_address` | INET | Y | |
| `detail` | JSONB | Y | |
| `prev_hash` | CHAR(64) | Y | SHA-256 of previous row (R11) |
| `row_hash` | CHAR(64) | N | SHA-256 over (payload + prev_hash) (R11) |
| `anchor_ref` | VARCHAR(80) | Y | external anchor batch id (R11) |
| `event_at` | TIMESTAMP | N | append-only; no update/delete |

#### E19 — `appraisal_report_periods` (NEW — multi-RO part-period, R4)
| Field | Type | Null | Notes |
|---|---|---|---|
| `period_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `sequence_no` | INT | N | order within the appraisal year |
| `period_start` | DATE | N | |
| `period_end` | DATE | N | |
| `reporting_officer_id` | UUID FK→employees | Y | null if No-Report |
| `supervision_months` | NUMERIC(4,1) | N | months RO supervised in this period |
| `part_period_grade` | NUMERIC(4,2) | Y | |
| `part_remarks` | TEXT | Y | |
| `weight_in_aggregate` | NUMERIC(5,2) | Y | supervision-weighted proportion |
| `no_report_certificate` | BOOLEAN | N | default false; true when supervision < `min_supervision_months` |
| `no_report_reason` | TEXT | Y | required when no_report_certificate=true |
| `no_report_signature_id` | UUID FK→E23 | Y | DSC on No-Report Certificate (R10) |
| `status` | ENUM | N | DRAFT, SUBMITTED, NO_REPORT, AGGREGATED |
| audit fields | — | — | |

#### E20 — `form_goal_snapshots` (NEW — immutable snapshot-on-lock, R6)
| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | N | |
| `source_goal_id` | UUID FK→E5 | N | provenance to the live goal |
| `goal_payload` | JSONB | N | **immutable copy**: type, title, metric, target, weightage, parentage |
| `weightage` | NUMERIC(5,2) | N | frozen at lock |
| `snapshot_at` | TIMESTAMP | N | append-only; never updated |
| `locked` | BOOLEAN | N | default true |
| `created_by` | UUID | N | (append-only; no updated_by / is_deleted) |

#### E21 — `calibration_recommendations` (NEW — ratified recommendation, R1)
| Field | Type | Null | Notes |
|---|---|---|---|
| `recommendation_id` | UUID PK | N | |
| `session_id` | UUID FK→E14 | N | |
| `form_id` | UUID FK→E4 | N | |
| `current_grade` | NUMERIC(4,2) | N | grade at time of recommendation |
| `recommended_grade` | NUMERIC(4,2) | N | committee proposal |
| `rationale` | TEXT | N | **mandatory** |
| `committee_vote` | JSONB | Y | member decisions / quorum record |
| `pre_certification` | BOOLEAN | N | true if produced before AA certification (R1) |
| `ratified_by` | UUID FK→employees | Y | AA / competent authority |
| `ratified_at` | TIMESTAMP | Y | |
| `ratification_signature_id` | UUID FK→E23 | Y | DSC on ratification (R1, R10) |
| `recommendation_status` | ENUM | N | PROPOSED, ENDORSED, REJECTED, RATIFIED, DECLINED |
| audit fields | — | — | |

#### E22 — `coi_recusals` (NEW — conflict-of-interest recusal, R22)
| Field | Type | Null | Notes |
|---|---|---|---|
| `recusal_id` | UUID PK | N | |
| `form_id` | UUID FK→E4 | Y | |
| `session_id` | UUID FK→E14 | Y | calibration context, if any |
| `actor_id` | UUID FK→employees | N | declarer |
| `role_context` | VARCHAR(60) | N | e.g. ADJUDICATOR, CALIB_MEMBER |
| `coi_type` | ENUM | N | SPOUSE, CLOSE_RELATION, PRIOR_POSTING, FINANCIAL, STRUCTURAL_CHAIN, OTHER |
| `declaration` | TEXT | N | |
| `recused` | BOOLEAN | N | default true |
| `declared_at` | TIMESTAMP | N | |
| audit fields | — | — | |

#### E23 — `digital_signatures` (NEW — non-repudiation, R10) — append-only
| Field | Type | Null | Notes |
|---|---|---|---|
| `signature_id` | UUID PK | N | |
| `entity_type` | ENUM | N | ASSESSMENT, DISCLOSURE_ACK, CALIBRATION_RATIFICATION, EXPUNCTION, NO_REPORT_CERT, SEALED_COVER_RELEASE, DISPOSAL, CONFIDENTIALITY_DOWNGRADE |
| `entity_id` | UUID | N | id of the signed record |
| `signer_id` | UUID FK→employees | N | |
| `signature_method` | ENUM | N | DSC, AADHAAR_ESIGN, HSM_TOKEN |
| `certificate_serial` | VARCHAR(120) | Y | issuer cert serial |
| `signed_payload_hash` | CHAR(64) | N | SHA-256 of the signed canonical payload |
| `signature_value` | TEXT | N | detached signature (base64) |
| `signed_at` | TIMESTAMP | N | |
| `verification_status` | ENUM | N | VALID, REVOKED, EXPIRED, INVALID |
| `created_by` | UUID | N | (append-only) |

### 5.3 Relationship map

```
appraisal_cycles (E1) ──1:N──> appraisal_forms (E4) ──1:1──> self_appraisals (E7)
   │  └─FK template (E2), rating_scale (E3)               ├─1:N──> appraisal_report_periods (E19) [multi-RO]
   │                                                       ├─1:N──> form_goal_snapshots (E20)  [immutable lock copy]
goals (E5) ──owned by──> employees × cycle (E1, nullable form) ──snapshot──> form_goal_snapshots (E20)
   └─1:N──> goal_checkins (E6)                            ├─1:N──> appraisal_assessments (E8) ──0:1──> digital_signatures (E23)
appraisal_templates (E2) ──refs M07 competency catalog    ├─1:N──> competency_assessments (E9) ──> M07 nomination
rating_scales (E3) ──defines──> grade/benchmark/adverse   ├─1:N──> feedback_360_requests (E11) ──1:1──> responses (E12)
                                                           ├─1:N──> representations (E13) [escalation ladder → CAT]
calibration_sessions (E14) ──1:N──> calibration_recommendations (E21) ──ratify──> calibration_adjustments (E15) ──N:1──> appraisal_forms (E4)
coi_recusals (E22) ──N:1──> forms (E4) / sessions (E14)   digital_signatures (E23) ──polymorphic──> E8/E15/E18/E19/E21
performance_improvement_plans (E16) ──1:N──> pip_milestones (E17); E16 ──N:1──> employees, ──0:1──> form (E4)
continuous_feedback (E10) ──N:1──> employees (subject/author), ──0:1──> goals (E5)
apar_disclosure_log (E18) ──N:1──> appraisal_forms (E4)   [hash-chained append-only custody ledger]
appraisal_forms (E4) ──posts──> service_register_events (M12); ──feeds (sealed-cover aware)──> M06; ──generates──> documents (M13)
appraisal_forms (E4) ──sealed by──> M09 charge status; ──probation outcome──> M01 + M12
```

### 5.4 Ownership / reuse matrix

| Entity | Owner module | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations` | M01 | M08 (read) | M01; M08 writes probation-confirmation feed |
| competency catalog | M07 | M08 (read) | M07 |
| `service_register_events` | M12 | M08, M14 | M08 (append), others |
| `documents` | M13 | M08 | M08 (evidence/PDF/signature artefacts) |
| `notifications`, `audit_log`, `workflow_*` | Platform | M08 | M08 |
| E1–E23 (this module) | **M08** | M14 (analytics), M06 (eligibility feed) | M08 |
| promotion eligibility feed | M06 | M06 | M08 (write; suppressed under sealed cover) |
| training nominations | M07 | M07 | M08 (write from skill gap) |
| charge / sub-judice status | M09 | M08 | M09 (M08 subscribes) |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| cycle_type | ANNUAL_APAR, MID_YEAR, PROBATION, CONTINUOUS, AD_HOC |
| cycle.status | DRAFT, OPEN, GOALS_LOCKED, IN_PROGRESS, CALIBRATION, DISCLOSURE, ERRATA, CLOSED, ARCHIVED |
| cycle.disclosure_channel | IN_APP, EMAIL, PHYSICAL, HYBRID |
| cycle.representation_clock_start | DISPATCH, ACKNOWLEDGEMENT |
| template.status | DRAFT, PUBLISHED, RETIRED |
| rating_scale.status | ACTIVE, RETIRED |
| form.status | DRAFT, GOALS_PENDING, GOALS_APPROVED, SELF_APPRAISAL, RO_ASSESSMENT, RVO_REVIEW, AA_ACCEPTANCE, CALIBRATION, SEALED_COVER, DISCLOSURE, DISCLOSED, REPRESENTATION, ERRATA, FINALISED, POSTED, EXPUNGED, WITHDRAWN |
| form.chain_config | FULL, NO_RVO, NO_AA, SINGLE_TIER, DESIGNATED_ALTERNATE |
| form.probation_outcome | CONFIRMED, EXTENDED, DISCHARGE_RECOMMENDED |
| integrity_certified | BEYOND_DOUBT, WATCH, NOT_CERTIFIED |
| goal.period_scope | SINGLE_CYCLE, CROSS_CYCLE |
| goal_type | KRA, KPI, OKR_OBJECTIVE, OKR_KEYRESULT, DEVELOPMENT |
| goal.status | DRAFT, PROPOSED, APPROVED, REVISED, ACHIEVED, NOT_ACHIEVED, DROPPED |
| self_appraisal.status | DRAFT, SUBMITTED, RETURNED |
| report_period.status | DRAFT, SUBMITTED, NO_REPORT, AGGREGATED |
| assessment.tier | REPORTING, REVIEWING, ACCEPTING |
| assessment.decision | SUBMITTED, RETURNED, CONCURRED, VARIED, CERTIFIED |
| gap_severity | NONE, MINOR, MODERATE, CRITICAL |
| feedback_type | PRAISE, CONSTRUCTIVE, COACHING, GENERAL |
| feedback.visibility | PRIVATE_TO_SUBJECT, MANAGER_ONLY, MANAGER_AND_SUBJECT |
| rater_relationship | PEER, SUBORDINATE, MANAGER, INTERNAL_CUSTOMER, EXTERNAL |
| 360.status | INVITED, IN_PROGRESS, SUBMITTED, DECLINED, EXPIRED |
| representation.decision | UPHELD, PARTIALLY_UPHELD, REJECTED, EXPUNGED, MODIFIED, ESCALATED_EXTERNAL |
| representation.status | FILED, UNDER_REVIEW, DECIDED, ESCALATED, CLOSED |
| representation.external_reference | NONE, CAT, HIGH_COURT, TRIBUNAL |
| calibration.method | COMMITTEE_REVIEW, NORMALISATION, BELL_CURVE *(FORCED_DISTRIBUTION removed, R2)* |
| calibration.status | PLANNED, IN_SESSION, RECOMMENDED, RATIFIED, COMPLETED, CANCELLED |
| recommendation.status | PROPOSED, ENDORSED, REJECTED, RATIFIED, DECLINED |
| adjustment.status | APPLIED, REVERSED |
| coi_type | SPOUSE, CLOSE_RELATION, PRIOR_POSTING, FINANCIAL, STRUCTURAL_CHAIN, OTHER |
| signature.entity_type | ASSESSMENT, DISCLOSURE_ACK, CALIBRATION_RATIFICATION, EXPUNCTION, NO_REPORT_CERT, SEALED_COVER_RELEASE, DISPOSAL, CONFIDENTIALITY_DOWNGRADE |
| signature.method | DSC, AADHAAR_ESIGN, HSM_TOKEN |
| signature.verification_status | VALID, REVOKED, EXPIRED, INVALID |
| pip.status | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED |
| pip.outcome | SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| milestone.status | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| disclosure.event_type | DISPATCHED, DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, SEALED, UNSEALED, HEIR_ACCESS, EXPUNGED, ANCHOR |

**Feature flags (R16):** `ff_calibration` (default off), `ff_continuous_feedback` (default off), `ff_360` (default off), `ff_bell_curve` (default off). Phase-1 GA runs with all four off; the statutory core path requires none of them.

### 5.6 Data integrity rules

1. **Weightage policy (R21).** Performance goals (KRA/KPI/OKR) at the same cascade level sum to 100 (±0.01). **DEVELOPMENT goals are excluded** from the 100% performance sum. Competencies are scored separately; the final grade roll-up applies `weightage_policy.goal_split_pct` to the goal score and `competency_split_pct` to the competency score (the two splits sum to 100). Enforced on goal-lock and in `GradeRollupEngine`.
2. **Scale bounds.** Any grade must lie within `[rating_scales.min_value, max_value]`.
3. **Adverse / benchmark derivation.** `is_adverse = final_grade < adverse_threshold`; `below_benchmark = final_grade < benchmark_grade`. Derived on certification; never client-supplied.
4. **Tier ordering.** A REVIEWING assessment cannot exist before all REPORTING period assessments (E19) are SUBMITTED/NO_REPORT; ACCEPTING requires REVIEWING complete (or the configured truncated-chain path).
5. **Self-adjudication + COI block (R22).** `appraisee_id` ∉ {RO(s), RvO, AA, adjudicator, calibration member acting on the form}; all distinct. A declared COI (E22) blocks the actor even where the structural check passes.
6. **One self-appraisal.** Unique `(form_id)` on `self_appraisals`.
7. **One form per appraisee per cycle.** Unique `(cycle_id, appraisee_id)` on `appraisal_forms`.
8. **Disclosure precedence + mandatory disclosure (R7).** Every certified APAR **must** be disclosed in full; `representations` may only be FILED after `disclosed_at`/deemed-disclosure. There is no "non-disclosure for favourable" path.
9. **Representation clock (R8).** `representation_window_start_at` = `dispatched_at` or `acknowledged_at` per `cycle.representation_clock_start`; deemed-disclosure after `deemed_disclosure_days` sets the window start even without acknowledgement.
10. **Immutability after FINALISED.** No update to grade fields once status ≥ FINALISED except via representation or ratified expunction (new audit chain + signature).
11. **Append-only + hash-chained ledgers (R11).** `apar_disclosure_log` accepts INSERT only; each row's `row_hash = SHA256(payload || prev_hash)`; broken chains fail `/verify`. `service_register_events`, `form_goal_snapshots`, `digital_signatures` are append-only.
12. **Calibration authority (R1).** A certified `final_grade` may change only through `calibration_adjustments` referencing a **RATIFIED** `calibration_recommendations` row signed by AA/competent authority — or via a pre-certification recommendation the AA certifies. No committee acts on a certified grade autonomously. Applying preserves `pre_calibration_grade` and sets `calibrated=true`.
13. **Confidentiality + tier projection (R14, R17).** Reading APAR content passes tier-aware authorization; denied reads append `ACCESS_DENIED`. Projection must be served from cache/pre-computed columns to hold P95 < 500ms at 200k scale.
14. **Adverse-evidence substantiation (R5).** An adverse / below-benchmark assessment requires non-empty `adverse_evidence_refs` pointing to **disclosable** evidence; anonymous 360 (E12) and visibility-restricted continuous feedback (E10 PRIVATE/MANAGER_ONLY) cannot be the sole reference.
15. **Sealed cover (R3).** While `sealed_cover=true`, the form cannot transition to FINALISED/POSTED and the M06 eligibility feed is suppressed; release requires a signed `SEALED_COVER_RELEASE` and an M09 conclusion reference.
16. **Multi-RO aggregation (R4).** `provisional_grade` is the supervision-weighted aggregate of report-period grades (E19) excluding NO_REPORT periods; a period with `supervision_months < cycle.min_supervision_months` is recorded as a No-Report Certificate.
17. **Digital signature (R10).** Tier certification, disclosure acknowledgement, calibration ratification, expunction, No-Report Certificate, sealed-cover release and disposal each require a VALID `digital_signatures` row before the act commits.
18. **Dual-control (R23).** Disposal and confidentiality downgrade require a distinct maker and checker (two different principals) plus MFA step-up and DSC.
19. **Chain truncation (R12).** When the resolved chain cannot satisfy "all distinct" (apex officers), the form must adopt a configured `chain_config` (DESIGNATED_ALTERNATE / SINGLE_TIER); otherwise materialisation flags `CHAIN_TRUNCATED_UNCONFIGURED` — never a silent failure.
20. **FK respect + soft delete.** All FKs enforced; soft delete via `is_deleted` (append-only ledgers exempt). Cascade is logical, never physical for statutory records.

### 5.7 Sample data (2–3 rows per entity)

**E1 appraisal_cycles**
| cycle_id | cycle_code | cycle_type | representation_clock_start | calibration_enabled | status |
|---|---|---|---|---|---|
| 5c1…01 | APAR-2025-26 | ANNUAL_APAR | DISPATCH | false | IN_PROGRESS |
| 5c1…02 | MIDYR-2025-26 | MID_YEAR | ACKNOWLEDGEMENT | false | OPEN |
| 5c1…03 | PROB-2025-Q2 | PROBATION | DISPATCH | false | CLOSED |

**E2 appraisal_templates**
| template_id | template_code | version | weightage_policy (goal/comp split) | requires_dsc | status |
|---|---|---|---|---|---|
| t…01 | APAR-GAZ-A | 3 | 70/30, dev outside sum | true | PUBLISHED |
| t…02 | APAR-NONGAZ | 2 | 80/20, dev outside sum | true | PUBLISHED |
| t…03 | OKR-EXEC | 1 | 100/0 | false | DRAFT |

**E3 rating_scales**
| rating_scale_id | scale_code | min | max | benchmark_grade | adverse_threshold |
|---|---|---|---|---|---|
| r…01 | APAR-10PT | 1.00 | 10.00 | 6.00 | 4.00 |
| r…02 | APAR-5PT | 1.00 | 5.00 | 3.00 | 2.00 |
| r…03 | OKR-PCT | 0.00 | 100.00 | 70.00 | 40.00 |

**E4 appraisal_forms**
| form_id | apar_no | appraisee_id | has_multi_ro | sealed_cover | final_grade | is_adverse | status |
|---|---|---|---|---|---|---|---|
| f…01 | APAR-2025-26-000142 | emp…77 | true | false | 8.40 | false | DISCLOSED |
| f…02 | APAR-2025-26-000143 | emp…88 | false | true | NULL | false | SEALED_COVER |
| f…03 | APAR-2025-26-000144 | emp…99 | false | false | NULL | false | RO_ASSESSMENT |

**E5 goals**
| goal_id | appraisee_id | cycle_id | form_id | goal_type | weightage | snapshotted | status |
|---|---|---|---|---|---|---|---|
| g…01 | emp…77 | 5c1…01 | f…01 | KRA | 40.00 | true | ACHIEVED |
| g…02 | emp…77 | 5c1…01 | f…01 | KPI | 30.00 | true | ACHIEVED |
| g…03 | emp…77 | NULL | NULL | DEVELOPMENT | 0.00 | false | APPROVED |

**E6 goal_checkins**
| checkin_id | goal_id | checkin_date | progress_pct | raised_by |
|---|---|---|---|---|
| c…01 | g…01 | 2025-09-30 | 60.00 | emp…77 |
| c…02 | g…01 | 2025-12-31 | 85.00 | emp…77 |
| c…03 | g…02 | 2025-12-31 | 92.00 | emp…12 |

**E7 self_appraisals**
| self_appraisal_id | form_id | submitted_at | status |
|---|---|---|---|
| s…01 | f…01 | 2026-04-10T09:00Z | SUBMITTED |
| s…02 | f…02 | 2026-04-11T10:00Z | SUBMITTED |
| s…03 | f…03 | NULL | DRAFT |

**E8 appraisal_assessments**
| assessment_id | form_id | report_period_id | tier | assessor_id | overall_grade | signature_id | decision |
|---|---|---|---|---|---|---|---|
| a…01 | f…01 | rp…A | REPORTING | emp…12 | 8.10 | sig…01 | SUBMITTED |
| a…02 | f…01 | NULL | REVIEWING | emp…30 | 8.40 | sig…02 | VARIED |
| a…03 | f…01 | NULL | ACCEPTING | emp…45 | 8.40 | sig…03 | CERTIFIED |

**E9 competency_assessments**
| comp_assessment_id | form_id | competency_name | required_level | assessed_level | gap_severity |
|---|---|---|---|---|---|
| ca…01 | f…01 | Public Service Ethics | 4 | 4 | NONE |
| ca…02 | f…01 | Data-Driven Decisions | 4 | 2 | MODERATE |
| ca…03 | f…03 | Stakeholder Mgmt | 3 | 1 | CRITICAL |

**E10 continuous_feedback**
| feedback_id | subject_employee_id | author_id | feedback_type | visibility |
|---|---|---|---|---|
| cf…01 | emp…77 | emp…12 | PRAISE | MANAGER_AND_SUBJECT |
| cf…02 | emp…88 | emp…12 | CONSTRUCTIVE | MANAGER_ONLY |
| cf…03 | emp…99 | emp…30 | COACHING | MANAGER_AND_SUBJECT |

**E11 feedback_360_requests**
| request_id | form_id | rater_id | rater_relationship | status |
|---|---|---|---|---|
| q…01 | f…01 | emp…21 | PEER | SUBMITTED |
| q…02 | f…01 | emp…34 | SUBORDINATE | IN_PROGRESS |
| q…03 | f…01 | emp…55 | INTERNAL_CUSTOMER | INVITED |

**E12 feedback_360_responses**
| response_id | request_id | submitted_at |
|---|---|---|
| rs…01 | q…01 | 2026-03-20T12:00Z |
| rs…02 | q…02 | NULL |
| rs…03 | q…04 | 2026-03-22T08:00Z |

**E13 representations**
| representation_id | rep_no | form_id | is_late | external_reference | decision | status |
|---|---|---|---|---|---|---|
| rp…01 | REP-2025-26-0007 | f…01 | false | NONE | NULL | UNDER_REVIEW |
| rp…02 | REP-2025-26-0008 | f…01 | true | NONE | NULL | FILED |
| rp…03 | REP-2024-25-0099 | f…77 | false | CAT | REJECTED | ESCALATED |

**E14 calibration_sessions**
| session_id | cycle_id | method | bell_curve_enabled | runs_before_certification | status |
|---|---|---|---|---|---|
| cs…01 | 5c1…01 | COMMITTEE_REVIEW | false | false | RECOMMENDED |
| cs…02 | 5c1…01 | NORMALISATION | false | true | RATIFIED |
| cs…03 | 5c1…01 | COMMITTEE_REVIEW | false | false | PLANNED |

**E15 calibration_adjustments**
| adjustment_id | recommendation_id | form_id | old_grade | applied_grade | ratified_by | status |
|---|---|---|---|---|---|---|
| adj…01 | rec…01 | f…01 | 8.60 | 8.40 | emp…45(AA) | APPLIED |
| adj…02 | rec…05 | f…05 | 9.20 | 8.80 | emp…45(AA) | APPLIED |
| adj…03 | rec…06 | f…06 | 5.00 | 5.00 | emp…45(AA) | REVERSED |

**E16 performance_improvement_plans**
| pip_id | pip_no | appraisee_id | outcome | status |
|---|---|---|---|---|
| pip…01 | PIP-2025-0003 | emp…88 | NULL | ACTIVE |
| pip…02 | PIP-2025-0004 | emp…91 | EXTENDED | UNDER_REVIEW |
| pip…03 | PIP-2024-0011 | emp…14 | SUCCESSFUL | CLOSED |

**E17 pip_milestones**
| milestone_id | pip_id | title | due_date | status |
|---|---|---|---|---|
| pm…01 | pip…01 | Clear 50 pending files | 2026-07-31 | ON_TRACK |
| pm…02 | pip…01 | Complete remedial training | 2026-08-15 | PENDING |
| pm…03 | pip…02 | Reduce error rate < 2% | 2026-06-30 | AT_RISK |

**E18 apar_disclosure_log** (hash-chained)
| disclosure_log_id | form_id | seq_no | event_type | actor_id | prev_hash | row_hash | event_at |
|---|---|---|---|---|---|---|---|
| dl…01 | f…01 | 1 | DISPATCHED | emp…99(HR) | (genesis) | 9f2a… | 2026-05-01T06:00Z |
| dl…02 | f…01 | 2 | ACKNOWLEDGED | emp…77 | 9f2a… | c41b… | 2026-05-03T07:30Z |
| dl…03 | f…02 | 1 | SEALED | emp…45(AA) | (genesis) | 71de… | 2026-04-20T05:10Z |

**E19 appraisal_report_periods**
| period_id | form_id | sequence_no | reporting_officer_id | supervision_months | part_period_grade | no_report_certificate | status |
|---|---|---|---|---|---|---|---|
| rp…A | f…01 | 1 | emp…12 | 7.0 | 8.10 | false | SUBMITTED |
| rp…B | f…01 | 2 | emp…20 | 5.0 | 8.70 | false | SUBMITTED |
| rp…C | f…01 | 3 | emp…25 | 2.0 | NULL | true | NO_REPORT |

**E20 form_goal_snapshots**
| snapshot_id | form_id | source_goal_id | weightage | locked | snapshot_at |
|---|---|---|---|---|---|
| sn…01 | f…01 | g…01 | 40.00 | true | 2026-04-01T00:00Z |
| sn…02 | f…01 | g…02 | 30.00 | true | 2026-04-01T00:00Z |
| sn…03 | f…01 | g…04 | 30.00 | true | 2026-04-01T00:00Z |

**E21 calibration_recommendations**
| recommendation_id | session_id | form_id | current_grade | recommended_grade | recommendation_status | ratified_by |
|---|---|---|---|---|---|---|
| rec…01 | cs…01 | f…01 | 8.60 | 8.40 | RATIFIED | emp…45(AA) |
| rec…05 | cs…02 | f…05 | 9.20 | 8.80 | RATIFIED | emp…45(AA) |
| rec…06 | cs…01 | f…06 | 5.00 | 6.00 | DECLINED | emp…45(AA) |

**E22 coi_recusals**
| recusal_id | form_id | session_id | actor_id | coi_type | recused | declared_at |
|---|---|---|---|---|---|---|
| cr…01 | f…05 | cs…01 | emp…40 | CLOSE_RELATION | true | 2026-05-10T04:00Z |
| cr…02 | f…09 | NULL | emp…45 | PRIOR_POSTING | true | 2026-05-11T06:00Z |
| cr…03 | f…12 | cs…02 | emp…33 | SPOUSE | true | 2026-05-12T07:00Z |

**E23 digital_signatures**
| signature_id | entity_type | entity_id | signer_id | signature_method | verification_status | signed_at |
|---|---|---|---|---|---|---|
| sig…01 | ASSESSMENT | a…01 | emp…12 | DSC | VALID | 2026-04-15T05:00Z |
| sig…03 | ASSESSMENT | a…03 | emp…45 | DSC | VALID | 2026-04-22T05:00Z |
| sig…07 | DISCLOSURE_ACK | f…01 | emp…77 | AADHAAR_ESIGN | VALID | 2026-05-03T07:30Z |

---

## Section 6 — Functional Requirements

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. v2 adds FR-M08-17 … FR-M08-22 and amends FR-M08-02/04/05/06/07/08/09/14/15/16 per the council.

---

### FR-M08-01 — Appraisal Cycle & Template Configuration

- **Module:** M08-PAM
- **Primary Role(s):** System Administrator, HR/APAR Cell Officer
- **User Story:** As an HR administrator, I want to configure an appraisal cycle with its calendar, eligible population, template, rating scale, disclosure-clock and chain-truncation rules so that the correct APAR/OKR process runs for the right employees with statutory deadlines.

**Description.** Create and manage `appraisal_cycles` bound to a published `appraisal_template` and `rating_scale`, with goal/self/RO/RvO/AA windows, eligibility rules, disclosure channel and representation clock-start, minimum-supervision threshold, chain-truncation policy, and feature flags. Opening a cycle materialises one `appraisal_forms` per eligible employee with the RO/RvO/AA chain resolved from M01 and report periods seeded from supervision history.

**Acceptance Criteria.**
1. A cycle cannot move to OPEN unless `template_id` is PUBLISHED and `rating_scale_id` is ACTIVE.
2. Opening a cycle generates exactly one form per eligible employee (idempotent re-run adds only newly eligible).
3. RO/RvO/AA are resolved from M01 reporting chain at open; unresolved chains are flagged, not silently dropped.
4. Eligibility rule filters by cadre/designation/min-service and excludes employees with status RETIRED/RESIGNED/DECEASED/TERMINATED.
5. Calendar dates must be chronologically ordered and within the fiscal year.
6. **(R12)** Where the resolved chain cannot satisfy "all distinct" (apex officers), the form adopts the cycle's `chain_truncation_policy` (DESIGNATED_ALTERNATE / SINGLE_TIER); if unconfigured, the form is flagged `CHAIN_TRUNCATED_UNCONFIGURED` and held — never silently dropped or auto-collapsed.
7. **(R3)** Employees with an active M09 charge/sub-judice status are materialised with `sealed_cover=true` (see FR-M08-17).

**Business Rules.**
- BR1: `goal_window_end ≤ appraisal_period_end`; `self_appraisal_due ≤ ro_due ≤ rvo_due ≤ aa_due`.
- BR2: A published template version is immutable; changes require a new version.
- BR3: A cycle in IN_PROGRESS may not change its scale/template (correctable only via FR-M08-22 errata).
- BR4: `disclosure_channel` and `representation_clock_start` are set at config and snapshotted onto each form; disclosure itself is always mandatory (R7).
- BR5: Phase-1 cycles default `calibration_enabled=false`; enabling requires `ff_calibration` (R16).

**Data Model References.**
| Entity | Use |
|---|---|
| E1 appraisal_cycles | create/manage |
| E2 appraisal_templates | bind (read PUBLISHED) |
| E3 rating_scales | bind (read ACTIVE) |
| E4 appraisal_forms | bulk materialise on open |
| E19 appraisal_report_periods | seed from supervision history |
| employees, org_units (M01) | resolve chain & eligibility |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/cycles |
| PUT | /api/v1/pam/cycles/{cycleId} |
| POST | /api/v1/pam/cycles/{cycleId}/open |
| GET | /api/v1/pam/cycles |
| POST | /api/v1/pam/templates |
| POST | /api/v1/pam/rating-scales |

**UI Behavior Notes.** Wizard: Basics → Calendar → Eligibility → Template/Scale → Disclosure & Clock → Chain Rules → Review. Eligibility preview shows live count, unresolved-chain and apex-truncation warnings, and sealed-cover count before open. Open is a guarded action with confirmation and a generated-forms summary.

**Edge Cases.** Mid-cycle joiners (incremental materialise); employees with no RO (flag); circular reporting; apex officer with no RvO/AA (truncation policy or hold); template retired after binding (block); duplicate open click (idempotent); employee under charge at open (sealed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CycleService`, `TemplateService`, `RatingScaleService`, `FormMaterialiser`, `EligibilityResolver`, `ChainResolver`, `SealedCoverSeeder` |
| Backend Flow | Validate → persist cycle → on open: resolve eligibility → resolve chains (+truncation policy) → seed report periods → check M09 status → batch-insert forms in a transaction → enqueue notifications |
| Data Operations | INSERT E1/E2/E3; bulk INSERT E4/E19; SELECT employees/org_units + M09 status; write audit_log |
| Validation | Date ordering, template PUBLISHED, scale ACTIVE, eligibility schema, fiscal-year bounds, chain-truncation config presence |
| Authorization | Sys Admin/HR only; org-scoped; no self in generated chain |
| State Changes & Side Effects | cycle DRAFT→OPEN; forms in GOALS_PENDING or SEALED_COVER; notifications to appraisees+ROs |
| Failure Handling | Partial materialise rolled back atomically; unresolved chains returned as `CHAIN_UNRESOLVED`; apex unconfigured → `CHAIN_TRUNCATED_UNCONFIGURED` held form |
| Dependencies | M01 (chain), M09 (charge status), platform notifications, workflow engine |
| Test Guidance | Unit: date validation, eligibility filter, truncation resolution. Integration: idempotent open, incremental joiners, atomic rollback, sealed-at-open |

---

### FR-M08-02 — Goal / Objective Setting (employee×period, cascading, weightages, snapshot-on-lock)

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As an officer, I want to set weighted KRAs/KPIs aligned to my reporting officer's objectives — even before a form opens and across cycles — so that my appraisal is measured against agreed, cascaded goals, while the statutory record stays immutable.

**Description.** Goals are owned at **employee × cycle/period** (E5); they may be drafted before a form exists (`form_id` null) and may span cycles (`period_scope=CROSS_CYCLE`). ROs review, request changes, and approve. On **goal-lock**, the system writes an **immutable snapshot** (E20) of the approved goals into the statutory form; thereafter the form's roll-up reads the snapshot, not the live goal. Mid-cycle revision of the live goal is supported with audit trail and a re-snapshot only through the controlled lock path.

**Acceptance Criteria.**
1. A goal can be created/owned by an appraisee with no form yet (`form_id` null) and optionally `cycle_id` null for cross-cycle objectives. **(R6)**
2. Sibling APPROVED **performance** goals must sum to 100% weightage before goal-lock; DEVELOPMENT goals are excluded from the sum. **(R21)**
3. A goal may cascade from an RO/skip-level goal, recording `parent_goal_id`/`cascaded_from_employee_id`.
4. RO can return a goal with comments (status PROPOSED→DRAFT); appraisee resubmits.
5. **Goal-lock writes an immutable `form_goal_snapshots` row per approved goal** and transitions form GOALS_PENDING→GOALS_APPROVED; the snapshot is append-only and never edited. **(R6)**
6. Post-lock changes to the live goal do not alter the existing snapshot; a re-snapshot occurs only through a controlled re-lock (audited).

**Business Rules.**
- BR1: Weightage ∈ (0,100]; performance total = 100 ±0.01; DEVELOPMENT outside the sum (R21).
- BR2: Only RO may APPROVE; appraisee cannot self-approve.
- BR3: Revisions after lock require RO approval and reason; mid-year cycle window must be open; statutory roll-up uses the snapshot until a controlled re-lock.
- BR4: DROPPED goals are excluded from weightage sum and grade roll-up.
- BR5: The statutory form **never** live-references E5; it references E20 only (R6).

**Data Model References.**
| Entity | Use |
|---|---|
| E5 goals | create/approve/revise (employee×period ownership) |
| E20 form_goal_snapshots | immutable copy at lock |
| E4 appraisal_forms | status transition on lock |
| employees | cascade source resolution |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/goals (form-less allowed) |
| PUT | /api/v1/pam/goals/{goalId} |
| POST | /api/v1/pam/goals/{goalId}/approve |
| POST | /api/v1/pam/goals/{goalId}/return |
| POST | /api/v1/pam/forms/{formId}/goals/lock |
| GET | /api/v1/pam/forms/{formId}/goal-snapshots |

**UI Behavior Notes.** Goal board with weightage meter (running total of performance goals, red until 100; DEVELOPMENT shown separately as "outside sum"). Cascade picker shows RO/skip-level goals. A "carry forward / cross-cycle" toggle. Lock shows a snapshot-preview confirming what becomes the immutable statutory record.

**Edge Cases.** Weight ≠ 100 at lock (block with delta); DEVELOPMENT goal mistakenly counted (excluded); cascade parent dropped after child created (warn); cross-cycle objective referenced by two forms (each gets its own snapshot); concurrent edits (optimistic lock `updated_at`); appraisee edits snapshot (forbidden — snapshots are immutable).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `GoalService`, `WeightageValidator`, `CascadeResolver`, `GoalLockService`, `SnapshotWriter` |
| Backend Flow | CRUD goals (form-less ok) → RO approve/return → lock validates performance sum + all-approved → write E20 snapshots in txn → transition form |
| Data Operations | INSERT/UPDATE E5; INSERT E20 (append-only); UPDATE E4.status; audit_log |
| Validation | Weightage range/sum (dev excluded), status transition legality, role check, optimistic lock |
| Authorization | Appraisee own goals; RO on reports; both org-scoped |
| State Changes & Side Effects | goal DRAFT↔PROPOSED→APPROVED→REVISED; form GOALS_PENDING→GOALS_APPROVED; snapshots written; notify RO/appraisee |
| Failure Handling | Lock fails with `WEIGHTAGE_IMBALANCE` listing delta; snapshot write atomic with transition |
| Dependencies | FR-M08-01 (form exists for lock), M01 chain |
| Test Guidance | Unit: weightage sum (dev excluded), transition matrix. Integration: form-less drafting, cross-cycle, snapshot immutability, re-lock audit |

---

### FR-M08-03 — Self-Appraisal Submission

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee
- **User Story:** As an officer, I want to record my achievements, self-ratings and constraints so the appraising officers have my account of the year.

**Description.** Appraisee completes the self-appraisal: achievement narrative, per-goal self-ratings/achievement %, competency self-ratings, constraints, and training needs. Submission locks self-edit and advances the form to RO_ASSESSMENT. RO may RETURN for revision before assessing.

**Acceptance Criteria.**
1. Self-appraisal can be submitted only when form status is SELF_APPRAISAL and goals are APPROVED (snapshot exists).
2. Achievements narrative is mandatory; per-goal self-ratings must be within scale bounds.
3. Submission timestamps `submitted_at`, sets status SUBMITTED, advances form to RO_ASSESSMENT.
4. RO can RETURN (status→RETURNED, form→SELF_APPRAISAL) with comments; appraisee resubmits.
5. After RO begins assessment, the self-appraisal becomes read-only to the appraisee.

**Business Rules.**
- BR1: Exactly one self-appraisal per form.
- BR2: Self-ratings are advisory; they do not auto-populate RO grades.
- BR3: Missing self-appraisal at RO due date allows RO to proceed with a recorded "self-appraisal not submitted" flag.

**Data Model References.**
| Entity | Use |
|---|---|
| E7 self_appraisals | create/submit |
| E20 form_goal_snapshots | per-goal self rating against frozen goals |
| E4 appraisal_forms | status transition |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/self-appraisal |
| PUT | /api/v1/pam/forms/{formId}/self-appraisal |
| POST | /api/v1/pam/forms/{formId}/self-appraisal/submit |
| POST | /api/v1/pam/forms/{formId}/self-appraisal/return |

**UI Behavior Notes.** Tabbed form (Summary / Goals / Competencies / Constraints & Needs). Autosave drafts. Submit shows a confirmation summarising goals and self-grades. Read-only after RO start.

**Edge Cases.** Submit before goals approved (forbidden); rating out of bounds (reject); resubmit after return; deadline passed with no submission (RO override path → links FR-M08-19 escalation).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SelfAppraisalService`, `ScaleValidator`, `FormTransitionService` |
| Backend Flow | Upsert draft → validate on submit → transition form → notify RO |
| Data Operations | UPSERT E7; read E20; UPDATE E4.status; audit_log |
| Validation | Narrative present, scale bounds, single-per-form, status gate |
| Authorization | Appraisee only on own form; RO return only |
| State Changes & Side Effects | self DRAFT→SUBMITTED/RETURNED; form SELF_APPRAISAL→RO_ASSESSMENT; notify RO |
| Failure Handling | Out-of-bounds → VALIDATION_ERROR field-level; return preserves draft |
| Dependencies | FR-M08-02 (goals approved + snapshot) |
| Test Guidance | Unit: bounds, single-per-form. Integration: submit/return loop, RO-no-submission override |

---

### FR-M08-04 — Reporting Officer Assessment (APAR Tier 1, multi-RO aware, digitally signed)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer
- **User Story:** As a reporting officer, I want to assess my subordinate's goals and competencies for the period I supervised, certify integrity, write the pen-picture and assign a part-period grade, signed with my DSC, so the APAR can proceed to review.

**Description.** Each RO records section/goal grades, competency assessed-levels, the statutory **integrity** certification, the **pen-picture** narrative, and a part-period grade scoped to their `appraisal_report_periods` row (E19). Submission creates a REPORTING `appraisal_assessments` row linked to the period, **requires a DSC/eSign signature (E23)**, and — once all report periods are SUBMITTED/NO_REPORT — aggregates to `provisional_grade` and advances the form to RVO_REVIEW. An adverse part-period grade must cite disclosable evidence.

**Acceptance Criteria.**
1. Integrity certification is mandatory; if not BEYOND_DOUBT, `integrity_remark` is required.
2. Pen-picture must meet template `penpicture_min_words` if configured.
3. Part-period grade within scale bounds; section grades roll up consistently per `weightage_policy`.
4. Submission writes a REPORTING assessment **with a valid `signature_id` (R10)**; when all periods are complete, the supervision-weighted aggregate sets `provisional_grade` and advances to RVO_REVIEW. **(R4)**
5. RO may RETURN the self-appraisal before assessing (links FR-M08-03).
6. **(R5)** An adverse / below-benchmark part-period grade requires non-empty `adverse_evidence_refs` to **disclosable** evidence; anonymous 360 / restricted feedback cannot be the sole basis.

**Business Rules.**
- BR1: An RO may assess only the report period(s) assigned to them; cannot be the appraisee.
- BR2: Adverse provisional grade requires explicit remark substantiation with disclosable evidence (R5).
- BR3: Competency gaps with CRITICAL/MODERATE severity flag for FR-M08-12 nomination.
- BR4: RO assessment is immutable after RvO begins; immutability is anchored by the DSC (R10).
- BR5: A period with `supervision_months < cycle.min_supervision_months` is recorded as a No-Report Certificate (FR-M08-18), not a grade.

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create REPORTING (per period) |
| E19 appraisal_report_periods | period scope, part grade, aggregation |
| E23 digital_signatures | DSC on submit |
| E4 appraisal_forms | integrity, pen_picture, provisional_grade, adverse_evidence_refs, status |
| E9 competency_assessments | assessed levels, gaps |
| E20 form_goal_snapshots | ro_rating/achievement against frozen goals |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/reporting?periodId= |
| PUT | /api/v1/pam/forms/{formId}/assessment/reporting |
| POST | /api/v1/pam/forms/{formId}/assessment/reporting/submit |

**UI Behavior Notes.** Plain-language tier banner: "You are the Reporting Officer for period 1 (Apr–Oct). You may grade and comment." (R17) Split view: appraisee self-input vs RO input. Integrity selector with conditional remark. Word-count meter on pen-picture. Adverse grade reveals a mandatory "attach disclosable evidence" picker. DSC sign step on submit. Multi-RO progress strip shows each period's status.

**Edge Cases.** Self-appraisal not submitted (proceed with flag); integrity NOT_CERTIFIED without remark (block); adverse grade without evidence (block — `ADVERSE_EVIDENCE_REQUIRED`); grade roll-up mismatch (recompute server-side authoritative); RO transferred mid-period (period closed, new period opened per FR-M08-18); RO unresponsive (escalation per FR-M08-19); DSC token failure (abort, no state change).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ROAssessmentService`, `IntegrityValidator`, `GradeRollupEngine`, `CompetencyGapDetector`, `ReportPeriodAggregator`, `SignatureService`, `AdverseEvidenceGuard` |
| Backend Flow | Upsert draft → validate integrity/penpicture/grades/evidence → sign (DSC) → persist assessment + period → when all periods done aggregate → detect gaps → transition |
| Data Operations | INSERT E8(REPORTING)+E23; UPDATE E19/E4; UPSERT E9; UPDATE E20-linked ratings; audit_log |
| Validation | Integrity rule, min-words, scale bounds, roll-up consistency, role identity, adverse evidence, signature validity |
| Authorization | Only the period's RO; org-scoped; self-block |
| State Changes & Side Effects | form RO_ASSESSMENT→RVO_REVIEW on full aggregation; gap flags; notify RvO |
| Failure Handling | Missing remark/evidence → VALIDATION_ERROR/`ADVERSE_EVIDENCE_REQUIRED`; DSC fail → `SIGNATURE_REQUIRED`; roll-up authoritative server-side |
| Dependencies | FR-M08-02/03, FR-M08-07 (scale), FR-M08-12 (gaps), FR-M08-18 (periods), FR-M08-20 (DSC) |
| Test Guidance | Unit: integrity conditional, roll-up & supervision-weighted aggregation, evidence guard. Integration: multi-RO submit, signed immutability, gap detection |

---

### FR-M08-05 — Reviewing Officer Review (APAR Tier 2)

- **Module:** M08-PAM
- **Primary Role(s):** Reviewing Officer
- **User Story:** As a reviewing officer, I want to concur with or vary the reporting officer's assessment with recorded reasons, signed with my DSC, so the APAR reflects a second, independent scrutiny.

**Description.** RvO views all RO part-period assessments, either concurs (carries the aggregated grade forward) or varies (sets `reviewed_grade` with mandatory `variance_reason`), may add review remarks, and signs. Completing advances the form to AA_ACCEPTANCE. RvO may RETURN to RO with comments.

**Acceptance Criteria.**
1. RvO must record `concurs_with_lower_tier`; if false, `variance_reason` and `reviewed_grade` are required.
2. `reviewed_grade` within scale bounds.
3. Completion writes REVIEWING assessment **with a valid DSC signature** and advances to AA_ACCEPTANCE.
4. RvO may RETURN to RO (form→RO_ASSESSMENT) with comments.
5. RvO cannot be any RO or the appraisee; declared COI triggers recusal (R22).
6. **(R5)** A downward variance crossing the adverse threshold must include substantiating disclosable evidence.

**Business Rules.**
- BR1: A downward variance crossing the adverse threshold must include substantiating remarks + evidence (R5).
- BR2: RvO review is immutable after AA begins (anchored by DSC).
- BR3: **(R12)** If RO and RvO collapse by org structure (apex/short chain), the cycle's `chain_truncation_policy` designates an alternate RvO or records a SINGLE_TIER/NO_RVO config — escalation, never silent collapse.

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create REVIEWING |
| E23 digital_signatures | DSC on submit |
| E22 coi_recusals | recusal record if COI |
| E4 appraisal_forms | reviewed_grade, status |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/reviewing |
| PUT | /api/v1/pam/forms/{formId}/assessment/reviewing |
| POST | /api/v1/pam/forms/{formId}/assessment/reviewing/submit |
| POST | /api/v1/pam/forms/{formId}/assessment/reviewing/return |
| POST | /api/v1/pam/forms/{formId}/recuse |

**UI Behavior Notes.** Plain-language banner: "You are the Reviewing Officer. You may agree or change the grade with a reason." (R17) RO part-period assessments shown read-only beside RvO input. Concur toggle reveals variance fields. Grade-delta indicator vs aggregated RO grade. COI "declare conflict / recuse" action. DSC sign on submit.

**Edge Cases.** RvO == any RO (block, require alternate/truncation config); variance without reason/evidence (block); RvO acts after AA started (forbidden); COI declared (recuse, route to alternate); RvO unresponsive (escalation FR-M08-19).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RvOReviewService`, `VarianceValidator`, `FormTransitionService`, `SignatureService`, `RecusalService`, `AdverseEvidenceGuard` |
| Backend Flow | Load RO assessments → validate concur/variance/evidence → sign → persist REVIEWING → set reviewed_grade → transition |
| Data Operations | INSERT E8(REVIEWING)+E23; optional INSERT E22; UPDATE E4; audit_log |
| Validation | Variance reason conditional, scale bounds, role identity, tier ordering, COI, signature, adverse evidence |
| Authorization | Only resolved RvO; not RO/appraisee; COI-blocked |
| State Changes & Side Effects | form RVO_REVIEW→AA_ACCEPTANCE or →RO_ASSESSMENT (return); notify AA/RO |
| Failure Handling | Same-person/COI → FORBIDDEN `TIER_CONFLICT`/`COI_RECUSAL_REQUIRED`; missing reason → VALIDATION_ERROR; DSC fail → `SIGNATURE_REQUIRED` |
| Dependencies | FR-M08-04, FR-M08-19/20/22 |
| Test Guidance | Unit: variance conditional, tier order. Integration: concur vs vary, return-to-RO, conflict/COI block, signed review |

---

### FR-M08-06 — Accepting Authority Acceptance (APAR Tier 3, digitally signed)

- **Module:** M08-PAM
- **Primary Role(s):** Accepting Authority
- **User Story:** As the accepting authority, I want to settle the final grade and certify the APAR with MFA step-up and my DSC so it can be disclosed and posted to the service register — and, where calibration ran, ratify or decline the committee's recommendation.

**Description.** AA reviews RO (per-period) and RvO assessments, settles `final_grade` (must record reason if differing from `reviewed_grade`), and certifies with **MFA step-up + DSC**. Certification derives `final_grade_label`, `is_adverse`, `below_benchmark`, writes an ACCEPTING assessment (decision CERTIFIED) with `certification_signature_id`, and advances to DISCLOSURE (or, if a pre-certification calibration recommendation exists, the AA certifies the recommended value; post-certification recommendations require explicit ratification — FR-M08-09).

**Acceptance Criteria.**
1. AA must settle `final_grade` within scale bounds; deviation from `reviewed_grade` requires reason.
2. Certification derives label/adverse/benchmark flags server-side (never client).
3. Certification requires **MFA step-up AND a valid DSC** (`certification_signature_id` set) (R10).
4. AA cannot be any RO, RvO or appraisee; declared COI triggers recusal (R22).
5. Once certified, grade fields are immutable except via **ratified** calibration (R1) or representation.
6. **(R1)** A certified grade is never mutated by a committee; only the AA/competent authority ratifying a recommendation (with DSC) may change it.
7. **(R7)** After certification the form proceeds to mandatory DISCLOSURE; there is no non-disclosure branch.

**Business Rules.**
- BR1: Adverse final grade mandates the disclosure path and substantiating disclosable evidence across tiers (R5, R7).
- BR2: AA certification is a guarded, logged action requiring step-up + DSC (R10).
- BR3: AA may RETURN to RvO once with reasons before certifying.
- BR4: **(R3)** A form with `sealed_cover=true` cannot be certified to FINALISED/POSTED; it parks in SEALED_COVER (FR-M08-17).

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | create ACCEPTING (CERTIFIED) |
| E23 digital_signatures | AA DSC |
| E21 calibration_recommendations | ratify pre/post-certification |
| E4 appraisal_forms | final_grade, flags, certification_signature_id, status |
| E3 rating_scales | derive label/flags |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/assessment/accepting |
| PUT | /api/v1/pam/forms/{formId}/assessment/accepting |
| POST | /api/v1/pam/forms/{formId}/assessment/accepting/certify |
| POST | /api/v1/pam/forms/{formId}/assessment/accepting/return |

**UI Behavior Notes.** Plain-language banner stating AA authority. Multi-column compare (RO periods / RvO / AA). Final-grade input bounded by scale; deviation reason appears on change. If a calibration recommendation exists, a "ratify / decline with reason" panel. Certify requires MFA step-up then DSC signing ceremony. Post-certify badges (adverse/benchmark). Sealed-cover forms show a locked "Sealed — cannot certify" banner.

**Edge Cases.** AA deviates downward to adverse (force evidence + disclosure); pre-certification recommendation present (certify recommended value); sealed cover active (block certify); DSC/step-up fail (abort, no state change); COI declared (recuse).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AAAcceptanceService`, `GradeDerivationService`, `StepUpAuthGuard`, `SignatureService`, `RecommendationRatifier`, `FormTransitionService`, `SealedCoverGuard` |
| Backend Flow | Load tiers → validate final grade/deviation/evidence → step-up → DSC sign → (ratify recommendation if any) → derive flags → persist ACCEPTING + form → route to DISCLOSURE/SEALED_COVER |
| Data Operations | INSERT E8(ACCEPTING)+E23; UPDATE E4 (final_grade, label, flags, signature, status); UPDATE E21 if ratified; audit_log |
| Validation | Scale bounds, deviation reason, role identity, COI, step-up token, DSC validity, sealed-cover guard |
| Authorization | Only resolved AA; not RO/RvO/appraisee; COI-blocked; MFA step-up + DSC |
| State Changes & Side Effects | form AA_ACCEPTANCE→DISCLOSURE / SEALED_COVER; notify HR/custodian |
| Failure Handling | Step-up/DSC fail → AUTH_REQUIRED/`SIGNATURE_REQUIRED`, no mutation; sealed → `SEALED_COVER_ACTIVE`; deviation w/o reason → VALIDATION_ERROR |
| Dependencies | FR-M08-05, FR-M08-07, FR-M08-09, FR-M08-08, FR-M08-17, FR-M08-20 |
| Test Guidance | Unit: derivation, routing matrix, ratify path. Integration: certify with/without pre-cal recommendation, adverse routing, sealed-cover block, step-up+DSC abort |

---

### FR-M08-07 — Rating Scales & Numeric Grade Computation (explicit weightage policy)

- **Module:** M08-PAM
- **Primary Role(s):** System Administrator (config), all assessors (consume)
- **User Story:** As an administrator, I want configurable rating scales with benchmark/adverse thresholds and a deterministic, well-specified grade roll-up so every grade is computed consistently and defensibly.

**Description.** Defines `rating_scales` (numeric range, ordered grade bands, benchmark/adverse thresholds, precision) and the deterministic roll-up. **The weightage policy is now explicit (R21):** performance goals (KRA/KPI/OKR) sum to 100; DEVELOPMENT goals sit **outside** that sum; competencies are scored separately; the final grade = `goal_split_pct × goal_score + competency_split_pct × competency_score`, with `goal_split_pct + competency_split_pct = 100`. The roll-up reads the **frozen `form_goal_snapshots`** (E20), not live goals.

**Acceptance Criteria.**
1. Grade bands are contiguous, non-overlapping, and cover `[min,max]`.
2. **Goal score** = Σ(snapshot_goal_score × snapshot_weightage)/100 over performance goals; **competency score** computed per template; **final** = goal_split·goalScore + comp_split·compScore, rounded to scale `decimal_places`. **(R21)**
3. `label` is resolved from bands; `benchmark_grade`/`adverse_threshold` produce `below_benchmark`/`is_adverse`.
4. Scales in use by an active cycle are RETIRE-locked, not edited.
5. The same roll-up function is the single source used by RO/RvO/AA stages and analytics.
6. DEVELOPMENT goals never contribute to the performance sum or the final numeric grade (R21).

**Business Rules.**
- BR1: `min < max`; `adverse_threshold ≤ benchmark_grade ≤ max`; `goal_split_pct + competency_split_pct = 100`.
- BR2: Changing a scale/policy requires a new ACTIVE scale/template version; historical forms keep their original via snapshot.
- BR3: Rounding is half-up at scale precision; documented and consistent.

**Data Model References.**
| Entity | Use |
|---|---|
| E3 rating_scales | define/retire |
| E2 appraisal_templates | weightage_policy schema |
| E20 form_goal_snapshots | frozen weights/scores for roll-up |
| E4 appraisal_forms | grade fields, labels, flags |
| E8 appraisal_assessments | section/overall grades |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/rating-scales |
| PUT | /api/v1/pam/rating-scales/{id} |
| GET | /api/v1/pam/rating-scales |
| POST | /api/v1/pam/forms/{formId}/grade/preview |

**UI Behavior Notes.** Scale builder with band editor validating contiguity. Weightage-policy editor showing the goal/competency split and an explicit "DEVELOPMENT goals are outside the 100% sum" note. Grade preview component reused across all assessment stages showing goal score, competency score and final value + band label live.

**Edge Cases.** Overlapping bands (block); grade on band boundary (inclusive-lower rule); zero-weight goals (excluded); split ≠ 100 (block); precision mismatch across stages (single function enforces); DEVELOPMENT goal weighted >0 (warn — excluded from sum).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RatingScaleService`, `GradeRollupEngine` (pure function over snapshots), `BandResolver`, `WeightagePolicyValidator` |
| Backend Flow | CRUD scales with contiguity validation; roll-up engine consumed by FR-04/05/06/09/16 reading E20 |
| Data Operations | INSERT/UPDATE E3; read E20 in grade computations; audit_log |
| Validation | Band contiguity/coverage, threshold ordering, split=100, precision |
| Authorization | Sys Admin config; assessors read/preview only |
| State Changes & Side Effects | scale ACTIVE↔RETIRED; no direct form mutation (preview only) |
| Failure Handling | Invalid bands → VALIDATION_ERROR with band index; retire-locked edit → CONFLICT; split≠100 → VALIDATION_ERROR |
| Dependencies | none upstream; consumed by FR-04/05/06/09/14/16 |
| Test Guidance | Unit: contiguity, two-part roll-up math (dev excluded), boundary rounding. Property test: monotonic label mapping |

---

### FR-M08-08 — Mandatory Disclosure & Representation / Appeal (with escalation ladder)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Appraisee, Accepting/Competent/Condonation Authority
- **User Story:** As an officer, I want the **entire** APAR disclosed to me with a clear appeal clock, and a complete representation ladder up to an external tribunal, so the process is fair, transparent and statutorily compliant.

**Description.** After certification, HR discloses the **full** APAR — every grading and remark — to the appraisee (R7). The system records `dispatched_at` and (on eSign acknowledgement) `acknowledged_at`; the representation window starts per the cycle's `representation_clock_start` (dispatch or acknowledgement) and deemed-disclosure still opens the window (R8). The appraisee may file a `representation` within the window; late filings require condonation. A competent authority (senior to AA, not in chain, no COI) adjudicates within `disposal_deadline_at`. Outcomes: UPHELD / PARTIALLY_UPHELD / REJECTED / EXPUNGED / MODIFIED / ESCALATED_EXTERNAL. A rejected representation may be escalated and flagged for an external tribunal (e.g., CAT) reference (R20). Expunction/modification updates the final grade via a controlled, **DSC-signed** path and re-discloses.

**Acceptance Criteria.**
1. **(R7)** The entire report (all gradings, integrity, pen-picture) is disclosed to every officer — there is no favourable-non-disclosure option. Disclosure transitions form to DISCLOSED, sets `dispatched_at`/`disclosed_at`, appends DISPATCHED+DISCLOSED to the hash-chained log, notifies appraisee.
2. **(R8)** `representation_window_start_at` = dispatch or acknowledgement per cycle config; non-acknowledgement after `deemed_disclosure_days` sets deemed-disclosure and still starts the window. Both timestamps are recorded.
3. Representation must be filed within the window; late filings set `is_late=true` and require condonation by the Condonation Authority (`condoned`, `condonation_reason`). **(R20)**
4. Adjudication records decision, authority, reason within `disposal_deadline_at`; MODIFIED sets `revised_grade`; EXPUNGED nullifies the adverse remark and recomputes flags; both require a DSC signature (R10).
5. **(R20)** A REJECTED representation can be ESCALATED (escalation_level++) and, where the officer seeks an external tribunal, `external_reference` (CAT/HIGH_COURT/TRIBUNAL) + `external_ref_no` are recorded and the status set ESCALATED — the appeal chain is closed, not left dangling at REJECTED.
6. Every disclosure/view/download/denied access is recorded in the hash-chained `apar_disclosure_log` (R11).

**Business Rules.**
- BR1: **(R7)** Disclosure is mandatory for all APARs; only channel/timing is configurable, never whether.
- BR2: A representation may contest only items present in the disclosed APAR (which is now the entire report).
- BR3: The adjudicating authority must be senior to the AA, not in the appraisee's reporting chain, and free of declared COI (R22).
- BR4: Post-adjudication the form returns to FINALISED with a new, DSC-signed grade snapshot; the prior grade is preserved (append-only).
- BR5: An adverse remark contested on the basis that it rested on undisclosed/anonymous material must be re-examined against the disclosable-evidence rule (R5); unsubstantiated adverse remarks are expunged.

**Data Model References.**
| Entity | Use |
|---|---|
| E13 representations | file/adjudicate/escalate/condone |
| E4 appraisal_forms | dispatched_at, disclosed_at, acknowledged_at, window, grade flags |
| E18 apar_disclosure_log | append hash-chained events |
| E23 digital_signatures | adjudication/expunction signature |
| documents (M13) | acknowledgement, supporting docs |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/disclose |
| POST | /api/v1/pam/forms/{formId}/acknowledge |
| POST | /api/v1/pam/forms/{formId}/representations |
| POST | /api/v1/pam/representations/{repId}/condone |
| POST | /api/v1/pam/representations/{repId}/decide |
| POST | /api/v1/pam/representations/{repId}/escalate |
| GET | /api/v1/pam/forms/{formId}/disclosure-log |

**UI Behavior Notes.** Disclosure viewer with watermark + eSign acknowledge button; a clear "your representation window: opens DD-MMM-YYYY (from dispatch), closes DD-MMM-YYYY" banner (R8). Representation form with item-pickers tied to disclosed remarks and document upload. Adjudication console for competent authority with DSC signing. Condonation panel for late filings. Escalation action capturing external tribunal reference. SLA + disposal-deadline countdown badges.

**Edge Cases.** Late representation (condonation flow); deemed-disclosure on non-acknowledgement (window still opens, logged); EXPUNGED grade crossing back above benchmark (recompute eligibility feed FR-M08-14); multiple representations (sequence; second blocked until first decided); REJECTED → external CAT reference (status ESCALATED, handoff flagged); adjudicator with COI (recuse).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `DisclosureService`, `RepresentationService`, `AdjudicationService`, `CondonationService`, `EscalationService`, `DisclosureLogger` (hash-chain), `GradeDerivationService`, `SignatureService` |
| Backend Flow | Disclose (mandatory, full) → log+notify → ack/deemed → start window per config → file rep (window/condonation) → adjudicate (DSC) → recompute grade/flags → re-disclose if changed → escalate/external if rejected |
| Data Operations | INSERT E13; UPDATE E4; INSERT E18 (hash-chained); INSERT E23; link documents; write SR event on expunction (FR-14); audit_log |
| Validation | Post-disclosure gate, window/clock config, contested-item membership, authority seniority + COI, condonation authority, disposal deadline |
| Authorization | HR disclose; appraisee file own + eSign; competent authority adjudicate (not in chain, no COI); condonation authority |
| State Changes & Side Effects | form DISCLOSURE→DISCLOSED→REPRESENTATION→FINALISED; rep FILED→UNDER_REVIEW→DECIDED/ESCALATED→CLOSED; flags recomputed; notifications |
| Failure Handling | Out-of-window → CONFLICT `REPRESENTATION_WINDOW_CLOSED` (condonation override); denied access logged ACCESS_DENIED; missing DSC → `SIGNATURE_REQUIRED` |
| Dependencies | FR-M08-06/07, M13, FR-M08-14 (SR), FR-M08-20 (DSC) |
| Test Guidance | Unit: clock-start matrix (dispatch/ack/deemed), window gate, escalation. Integration: full disclose→represent→expunge→recompute→re-disclose, condonation, external CAT handoff |

---

### FR-M08-09 — Calibration / Normalisation as a Ratified Recommendation (Phase-2, flagged)

- **Module:** M08-PAM
- **Primary Role(s):** Calibration Committee Member, Accepting/Competent Authority, HR/APAR Cell
- **User Story:** As a calibration committee, we want to surface comparability and outliers across a population and **recommend** grade changes that a competent authority ratifies — so ratings are fair and comparable without any committee unlawfully overriding a certified grade.

**Description.** (Feature-flagged `ff_calibration`, Phase-2.) HR convenes a `calibration_session` over an org-scoped population using **COMMITTEE_REVIEW or NORMALISATION** (BELL_CURVE only if `ff_bell_curve` and `bell_curve_enabled`; **FORCED_DISTRIBUTION removed**, R2). Statutory grading is **absolute**; `target_distribution` is **diagnostic-only**, never an enforced quota. The committee produces `calibration_recommendations` (proposed grade + mandatory rationale + vote). **A certified `final_grade` changes only when the AA/competent authority ratifies the recommendation with MFA step-up + DSC** (creating a `calibration_adjustments` row), or — if the session `runs_before_certification` — the AA simply certifies the recommended value (R1). No committee mutates a certified grade autonomously. Committee members with self/chain/COI on a form cannot vote on it (R22).

**Acceptance Criteria.**
1. Only forms within scope and at/after RvO (for pre-certification) or certified (for post-certification ratification) enter a session.
2. Every recommendation requires a non-empty `rationale`; the committee never writes `final_grade` directly. **(R1)**
3. Distribution view shows current vs target as **diagnostic only**; no action enforces a quota. **(R2)**
4. A certified grade changes only via a RATIFIED recommendation → `calibration_adjustments` signed by the AA/competent authority, preserving `pre_calibration_grade` and recomputing flags. **(R1)**
5. A committee member who is RO/RvO/AA/appraisee for a form, or who has a declared COI, cannot vote on that form (recusal recorded). **(R22)**
6. `FORCED_DISTRIBUTION` is not an available method; `BELL_CURVE` is disabled by default. **(R2)**

**Business Rules.**
- BR1: **(R1)** Calibration produces recommendations only; the legal grade mutation is always an authority's signed act (ratification) — pre-certification or post-certification, never a committee write.
- BR2: Recommendation magnitude beyond a configured threshold requires committee quorum before it can be put forward for ratification.
- BR3: A downward recommendation crossing the adverse threshold must cite disclosable evidence and, on ratification, forces the disclosure path (R5, R7).
- BR4: **(R2)** Target distributions are diagnostic; the system must not auto-apply or pressure grades toward a quota.

**Data Model References.**
| Entity | Use |
|---|---|
| E14 calibration_sessions | convene/run (no forced distribution) |
| E21 calibration_recommendations | propose/vote |
| E15 calibration_adjustments | applied only after ratification |
| E22 coi_recusals | member recusal |
| E23 digital_signatures | ratification DSC |
| E4 appraisal_forms | final_grade, pre_calibration_grade, calibrated, flags |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/calibration/sessions |
| GET | /api/v1/pam/calibration/sessions/{id}/distribution (diagnostic) |
| POST | /api/v1/pam/calibration/sessions/{id}/recommendations |
| POST | /api/v1/pam/calibration/recommendations/{id}/vote |
| POST | /api/v1/pam/calibration/recommendations/{id}/ratify |
| POST | /api/v1/pam/calibration/recommendations/{id}/decline |

**UI Behavior Notes.** Distribution histogram (current vs target) labelled "diagnostic — not a quota". Recommendation cards with mandatory rationale modal and committee vote. A separate **Ratification** screen for the AA/competent authority showing each recommendation with "Ratify (sign) / Decline (reason)". COI "recuse" control on member view. Audit trail sidebar. No drag-to-quota interaction.

**Edge Cases.** Recommendation on adverse/below-benchmark borderline (recompute on ratification); member self/chain/COI on a form (exclude vote, record recusal); session cancelled after partial ratifications (applied stay, preserve provenance); empty population (block); AA declines recommendation (no grade change, logged); bell-curve flag off (method unavailable).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CalibrationSessionService`, `DistributionEngine` (diagnostic), `RecommendationService`, `QuorumValidator`, `RecommendationRatifier`, `RecusalService`, `SignatureService`, `GradeDerivationService` |
| Backend Flow | Convene → load population → compute diagnostic distribution → propose/vote recommendations → AA/competent authority ratifies (step-up+DSC) → write E15 applied adjustment → recompute flags |
| Data Operations | INSERT E14/E21; on ratify INSERT E15+E23; UPDATE E4 (grade, pre_cal, calibrated, flags); optional INSERT E22; audit_log |
| Validation | Rationale present, scope/status gate, conflict/COI exclusion, quorum, magnitude threshold, ratification signature |
| Authorization | Committee members propose/vote (no self/chain/COI form); AA/competent authority ratify; HR convene |
| State Changes & Side Effects | session PLANNED→IN_SESSION→RECOMMENDED→RATIFIED→COMPLETED; form grade changes only on ratification |
| Failure Handling | Missing rationale → VALIDATION_ERROR; conflict/COI vote → FORBIDDEN; unratified apply attempt → `RATIFICATION_REQUIRED`; quorum unmet → CONFLICT |
| Dependencies | FR-M08-06/07; FR-M08-20 (DSC); precedes FR-M08-08 |
| Test Guidance | Unit: diagnostic distribution math, quorum, no-forced-distribution. Integration: recommend→ratify→apply→recompute, AA-decline, COI exclusion, pre-certification path |

---

### FR-M08-10 — Continuous Feedback & Check-Ins (Phase-2, flagged)

- **Module:** M08-PAM
- **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As a manager and employee, we want lightweight, year-round feedback and goal check-ins so the appraisal is grounded in continuous evidence rather than recency bias.

**Description.** (Feature-flagged `ff_continuous_feedback`, Phase-2.) Authenticated users record `continuous_feedback` (praise/constructive/coaching) on a subject with controlled visibility, optionally linked to a goal (which now lives at employee×period, FR-M08-02). Appraisees and ROs log `goal_checkins` with progress %. These artefacts surface as evidence during RO assessment — but **visibility-restricted feedback cannot be the sole basis of an adverse remark** (R5).

**Acceptance Criteria.**
1. Feedback respects `visibility`; PRIVATE_TO_SUBJECT is hidden from the manager and vice-versa per setting.
2. Check-ins update goal progress and timeline; do not change the goal's final rating automatically.
3. Feedback and check-ins for the cycle are surfaced (read-only) in the RO assessment view, **labelled by disclosability** so an RO knows what can back an adverse remark (R5).
4. Subject can acknowledge feedback.
5. Feedback is immutable after acknowledgement except by author within an edit window.

**Business Rules.**
- BR1: Feedback authors cannot be anonymous in continuous feedback (named accountability); 360 anonymity is separate (FR-M08-11).
- BR2: A manager cannot delete constructive feedback to manipulate the record (soft-delete only, audited).
- BR3: Check-in progress is advisory evidence, not an authoritative grade.
- BR4: **(R5)** MANAGER_ONLY / PRIVATE feedback is non-disclosable and cannot be the sole reference for an adverse APAR entry.

**Data Model References.**
| Entity | Use |
|---|---|
| E10 continuous_feedback | create/acknowledge |
| E6 goal_checkins | create |
| E5 goals | progress linkage (employee×period) |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/feedback |
| GET | /api/v1/pam/feedback?subjectId= |
| POST | /api/v1/pam/feedback/{id}/acknowledge |
| POST | /api/v1/pam/goals/{goalId}/checkins |

**UI Behavior Notes.** Feedback feed on employee profile; visibility selector with clear labels and a "disclosable?" indicator. Goal timeline with check-in markers. RO assessment shows an evidence panel aggregating both, with disclosable items distinguished.

**Edge Cases.** Visibility downgrade after creation (audited); feedback on inactive employee (block); check-in progress > 100 (clamp/validate); cross-org feedback (org-scope check); attempt to cite restricted feedback as sole adverse basis (block at FR-04).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FeedbackService`, `CheckinService`, `VisibilityResolver`, `EvidenceAggregator`, `DisclosabilityTagger` |
| Backend Flow | Create feedback/check-in → enforce visibility → tag disclosability → aggregate for assessment view |
| Data Operations | INSERT E10/E6; UPDATE E5 progress; audit_log |
| Validation | Visibility enum, progress range, org scope, edit-window |
| Authorization | Authenticated org-scoped; subject acknowledge; author edit window |
| State Changes & Side Effects | feedback acknowledged; goal progress updated; no grade change |
| Failure Handling | Progress OOB → VALIDATION_ERROR; visibility breach → FORBIDDEN at projection |
| Dependencies | FR-M08-02 (goals), FR-M08-04 (evidence surfacing + adverse-evidence guard) |
| Test Guidance | Unit: visibility projection, clamp, disclosability tag. Integration: evidence aggregation, soft-delete audit, adverse-sole-basis block |

---

### FR-M08-11 — 360-Degree Feedback (Phase-2, flagged)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Reporting Officer, Raters
- **User Story:** As an organisation, we want multi-rater (peer/subordinate/customer) feedback so appraisals capture a rounded view of behaviour and impact — without anonymous input ever becoming the sole basis of an adverse statutory remark.

**Description.** (Feature-flagged `ff_360`, Phase-2.) For eligible forms, HR/RO nominate raters across relationships. Raters submit `feedback_360_responses` (per-competency scores + qualitative). Responses are aggregated respecting anonymity and minimum-N suppression and surfaced as input to RO assessment. **Anonymous 360 cannot be the sole basis of an adverse/below-benchmark remark** (R5).

**Acceptance Criteria.**
1. Raters are nominated with a relationship type; the appraisee cannot rate themselves.
2. Anonymous responses are aggregated only when ≥ minimum-N raters of that relationship responded (suppression below threshold).
3. A rater can submit exactly one response per request; declines/expiries are tracked.
4. Aggregated 360 view is read-only evidence in RO assessment; individual anonymous responses are never attributable in the UI; **a 360 aggregate alone cannot substantiate an adverse APAR entry** (R5).
5. 360 windows align to cycle dates.

**Business Rules.**
- BR1: Minimum-N (default 3) protects rater anonymity; below-N relationship buckets show "insufficient responses".
- BR2: External raters use a scoped, time-boxed access token (no full system access).
- BR3: 360 results inform but do not directly set the APAR grade and cannot be the sole adverse basis (R5).

**Data Model References.**
| Entity | Use |
|---|---|
| E11 feedback_360_requests | nominate/track |
| E12 feedback_360_responses | submit/aggregate |
| E9 competency_assessments | optional input |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/360/requests |
| GET | /api/v1/pam/360/requests/assigned |
| POST | /api/v1/pam/360/requests/{id}/respond |
| GET | /api/v1/pam/forms/{formId}/360/summary |

**UI Behavior Notes.** Nomination grid by relationship. Rater questionnaire (mobile-friendly). Summary radar/bar charts with anonymity-suppressed buckets clearly labelled. RO view marks 360 as "non-disclosable — supporting only, not sole adverse basis".

**Edge Cases.** Fewer than N respond (suppress); rater leaves org mid-window (expire request); duplicate submission (block); external token expiry (deny clearly); attempt to base adverse remark solely on 360 (block at FR-04).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `Feedback360Service`, `RaterTokenService`, `AggregationEngine`, `AnonymitySuppressor` |
| Backend Flow | Nominate → dispatch invites → collect responses → aggregate with min-N suppression → expose summary |
| Data Operations | INSERT E11/E12; read for aggregation; audit_log |
| Validation | Self-rating block, one-per-request, min-N, window dates, token validity |
| Authorization | HR/RO nominate; assigned rater respond; appraisee sees aggregate only |
| State Changes & Side Effects | request INVITED→SUBMITTED/DECLINED/EXPIRED; summary computed |
| Failure Handling | Below-N → suppressed bucket; expired token → AUTH_REQUIRED |
| Dependencies | FR-M08-01 (forms), FR-M08-04 (surfacing + adverse guard) |
| Test Guidance | Unit: min-N suppression, one-per-request. Integration: external token flow, aggregate anonymity, adverse-sole-basis block |

---

### FR-M08-12 — Competency Assessment & Skill-Gap → Training Linkage (M07)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer, Appraisee, HR
- **User Story:** As a reporting officer, I want to assess competencies against role-required levels and turn gaps into training nominations so development is closed-loop with the training module.

**Description.** Using the M07 competency catalog and role-required levels (snapshotted onto the form), the RO assesses each competency's `assessed_level`; the system derives `gap` and `gap_severity`. MODERATE/CRITICAL gaps generate training nominations to M07 (linking `training_nomination_id`). The competency score feeds the final grade per the explicit `weightage_policy` (FR-M08-07).

**Acceptance Criteria.**
1. Competencies and required levels are read from M07 (snapshotted onto the form for historical fidelity).
2. `gap = required_level − assessed_level`; severity derived per configurable bands.
3. MODERATE/CRITICAL gaps offer a one-click "nominate to training" creating an M07 nomination and storing its ID.
4. Self competency ratings (from self-appraisal) display alongside RO assessed levels.
5. Closed nominations reflect status back on the competency assessment view.

**Business Rules.**
- BR1: A nomination is created only with an active M07 training mapped to the competency; otherwise a development-need is logged.
- BR2: Competency assessment is part of the RO stage and locks with it (and the RO DSC).
- BR3: Required levels come from the role/designation profile in M07; ad-hoc overrides are recorded with reason.

**Data Model References.**
| Entity | Use |
|---|---|
| E9 competency_assessments | assess/derive gap |
| M07 competency catalog | read required levels |
| M07 nominations | write nomination (FK by id) |
| E7 self_appraisals | self levels |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId}/competencies |
| PUT | /api/v1/pam/forms/{formId}/competencies |
| POST | /api/v1/pam/forms/{formId}/competencies/{id}/nominate |

**UI Behavior Notes.** Competency grid: required vs self vs assessed, gap badge (colour by severity), nominate button on gaps. Nomination status chip after creation.

**Edge Cases.** No training mapped to a critical gap (log development-need); M07 unavailable (queue nomination, retry); negative gap (over-competent → no nomination); catalog changed after snapshot (use snapshot).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CompetencyAssessmentService`, `GapEngine`, `M07NominationClient`, `SnapshotService` |
| Backend Flow | Load catalog snapshot → RO assesses → derive gaps → on nominate call M07 → store nomination id |
| Data Operations | UPSERT E9; read M07 catalog; POST M07 nomination; audit_log |
| Validation | Level bounds, severity bands, training-mapping existence |
| Authorization | RO assess; appraisee read own; HR read org |
| State Changes & Side Effects | gaps flagged; M07 nomination created; status reflected |
| Failure Handling | M07 down → UPSTREAM_UNAVAILABLE, queue+retry; unmapped gap → development-need logged |
| Dependencies | M07, FR-M08-03/04 |
| Test Guidance | Unit: gap derivation, severity bands. Integration: nomination round-trip, M07-down queueing, snapshot fidelity |

---

### FR-M08-13 — Performance Improvement Plan (PIP)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer, Reviewing Officer, HR
- **User Story:** As a reporting officer, I want to place an underperforming officer on a structured improvement plan with milestones and a fair outcome so improvement is supported and documented.

**Description.** For below-benchmark/adverse outcomes (or ad hoc), RO initiates a `performance_improvement_plan` with reason, period, success criteria and `pip_milestones`. Progress is tracked; the plan concludes with an outcome. PIP records are confidential and auditable; an unsuccessful PIP can be referenced by M06/M09 per policy.

**Acceptance Criteria.**
1. A PIP requires reason, start/target dates, success criteria and ≥1 milestone.
2. Milestones track status (pending/on-track/at-risk/met/missed) with progress notes.
3. RvO concurrence is required to activate a PIP (segregation of duties).
4. Closing a PIP requires an outcome and summary; outcome is auditable.
5. An active PIP is visible to appraisee, RO, RvO and HR only.

**Business Rules.**
- BR1: A PIP linked to an APAR references the originating `form_id`.
- BR2: An EXTENDED outcome creates a successor PIP linked to the prior.
- BR3: PIP existence does not by itself change an APAR grade; it is supportive documentation.

**Data Model References.**
| Entity | Use |
|---|---|
| E16 performance_improvement_plans | create/close |
| E17 pip_milestones | track |
| E4 appraisal_forms | optional origin link |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/pips |
| POST | /api/v1/pam/pips/{id}/activate |
| PUT | /api/v1/pam/pips/{id}/milestones/{mid} |
| POST | /api/v1/pam/pips/{id}/close |
| GET | /api/v1/pam/pips?employeeId= |

**UI Behavior Notes.** PIP wizard (reason → criteria → milestones → review). Milestone board with status chips. Activation gated on RvO concurrence. Outcome modal on close.

**Edge Cases.** Activation without RvO concurrence (block); employee transferred during PIP (custody handoff to new RO); overlapping active PIPs (block second); abandoned due to long leave (record reason).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `PIPService`, `MilestoneService`, `ConcurrenceGuard` |
| Backend Flow | Create draft → RvO concur → activate → track milestones → close with outcome |
| Data Operations | INSERT E16/E17; UPDATE statuses; audit_log |
| Validation | Required fields, ≥1 milestone, concurrence present, single-active-per-employee |
| Authorization | RO create; RvO concur; HR oversight; appraisee read own |
| State Changes & Side Effects | pip DRAFT→ACTIVE→UNDER_REVIEW→CLOSED; successor link on EXTENDED |
| Failure Handling | Activate w/o concurrence → FORBIDDEN; overlap → CONFLICT |
| Dependencies | FR-M08-06 (outcome), FR-M08-15 (custody) |
| Test Guidance | Unit: required-field/concurrence gates. Integration: extend→successor link, transfer handoff |

---

### FR-M08-14 — Posting Final Ratings to Service Register (M12) & Promotion Eligibility Feed (M06)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, APAR Custodian (trigger); System (post)
- **User Story:** As HR, I want certified final grades posted to the statutory Service Register and promotion eligibility fed to the promotion module — except where a sealed cover suppresses the feed — so the appraisal becomes part of the permanent record and informs progression lawfully.

**Description.** On finalisation (post-disclosure, representation window closed/decided, **not sealed**), the system posts an append-only, hash-verifiable `service_register_events` entry to M12 and writes a promotion-eligibility record to M06. **While `sealed_cover=true`, the M06 feed is suppressed** (R3). Posting is idempotent, transactional with outbox semantics, and immutable once posted. A grade modified by representation post-posting creates a corrective event, never an edit.

**Acceptance Criteria.**
1. A form posts only when status is FINALISED, representation resolved, and **`sealed_cover=false`** (R3).
2. The SR event is append-only and idempotent (one event per `(form_id)`); re-posts are no-ops; the event references its disclosure-log hash for verifiability (R11).
3. The M06 eligibility feed carries `below_benchmark`/`final_grade`/`cycle_id`; **suppressed while sealed**; updated by corrective event if a representation later modifies the grade (never silent overwrite).
4. Posting sets `posted_to_sr=true` and logs to the hash-chained disclosure log.
5. If M12/M06 are unavailable, posting is queued via outbox and retried; no data loss.

**Business Rules.**
- BR1: Posting is the only sanctioned write of appraisal outcome to M12 from M08.
- BR2: A grade modified by representation post-posting creates a corrective SR event referencing the original (statutory traceability), not an edit.
- BR3: Promotion decisioning remains with M06; M08 only feeds eligibility evidence.
- BR4: **(R3)** Sealed-cover forms never feed M06; on sealed-cover release (FR-M08-17) the feed is (re)evaluated per the disciplinary outcome.

**Data Model References.**
| Entity | Use |
|---|---|
| E4 appraisal_forms | finalise + posted flag + sealed_cover gate |
| service_register_events (M12) | append final grade/adverse (hash-referenced) |
| M06 eligibility feed | write benchmark/grade (sealed-suppressed) |
| E18 apar_disclosure_log | log posting |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/finalise |
| POST | /api/v1/pam/forms/{formId}/post-to-sr |
| GET | /api/v1/pam/forms/{formId}/posting-status |

**UI Behavior Notes.** Finalise action with checklist (disclosed, representation resolved, not sealed). Posting status panel showing SR event id, hash reference, and M06 feed status (or "suppressed — sealed cover"); retry indicator if queued.

**Edge Cases.** Sealed cover active (block post + suppress M06); representation decided after posting (corrective event); M12 down (outbox retry); duplicate post (idempotent no-op); grade unchanged after representation (no corrective event).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FinalisationService`, `SRPostingService` (outbox), `M06EligibilityClient`, `IdempotencyGuard`, `SealedCoverGuard` |
| Backend Flow | Finalise → check sealed → write outbox → post SR event + M06 feed (unless sealed) in transaction → mark posted → on rep-change emit corrective |
| Data Operations | UPDATE E4; INSERT service_register_events (append, hash-ref); POST M06; INSERT E18; audit_log; outbox table |
| Validation | Status gate, representation resolution, sealed-cover gate, idempotency key |
| Authorization | HR/Custodian trigger; system posts; no edits |
| State Changes & Side Effects | form FINALISED→POSTED; SR + M06 records created (M06 suppressed if sealed) |
| Failure Handling | M12/M06 down → UPSTREAM_UNAVAILABLE; outbox retry with backoff; sealed → `SEALED_COVER_ACTIVE`; never partial-commit |
| Dependencies | FR-M08-08, FR-M08-17 (sealed), M12, M06 |
| Test Guidance | Unit: idempotency, status+sealed gate. Integration: outbox retry, corrective event, sealed-suppression, no-op re-post |

---

### FR-M08-15 — Custody, Confidentiality, Tamper-Evidence & Access Control of APAR

- **Module:** M08-PAM
- **Primary Role(s):** APAR Custodian, Dual-Control Approver, HR/APAR Cell, Legal Heir/Nominee, Auditor
- **User Story:** As the APAR custodian, I want every access to confidential APARs controlled and provably untampered, with custody transferable on officer movement, heir access on death, and dual-control on irreversible actions, so confidentiality and statutory custody obligations are met and auditable.

**Description.** Enforces field-level, tier-aware authorization (fields *absent*, not greyed, with plain-language "why hidden" reasons, R17) served from cache/pre-computed columns to hold P95 < 500ms at 200k scale (R14). Logs all access to the **hash-chained** `apar_disclosure_log` with periodic external anchoring and a `/verify` endpoint (R11). Supports custody transfer on movement (M05), **legal-heir/nominee access on death/retirement** (R15), retention per statutory schedule (which **overrides the DPDP erasure right**, R15), and **dual-control** (maker+checker) on disposal and confidentiality downgrade (R23). Generated APAR PDFs are watermarked and encrypted in M13.

**Acceptance Criteria.**
1. Reading any APAR content passes server-side tier-aware authorization; unauthorised reads return FORBIDDEN and append ACCESS_DENIED; absent fields carry a reason code ("hidden until disclosure" / "not visible to your tier"). **(R17)**
2. Every successful view/download appends VIEWED/DOWNLOADED with actor, role, IP, timestamp into the hash-chained log; `row_hash` chains to `prev_hash`. **(R11)**
3. **(R11)** A `/verify` endpoint recomputes the chain and confirms (or fails) integrity; logs are anchored externally on a schedule (ANCHOR events).
4. Custody transfer reassigns custodian and logs CUSTODY_TRANSFER without altering content; orphaned custody is escalated, never dropped.
5. **(R15)** On death/retirement, a legal-heir/nominee access path grants time-boxed read (HEIR_ACCESS logged), governed by statute; statutory retention overrides any DPDP erasure request (legal basis recorded).
6. APAR PDFs are watermarked (recipient + timestamp) and encrypted at rest in M13.
7. **(R23)** Retention disposal and confidentiality downgrade require a distinct maker and checker plus MFA step-up and DSC; single-person attempts are blocked.

**Business Rules.**
- BR1: Confidentiality class CONFIDENTIAL by default; downgrade requires dual-control + authority + reason + DSC (R23).
- BR2: Auditor has read + log + verify access but cannot mutate.
- BR3: **(R11)** Disclosure log is append-only **and hash-chained with external anchoring**; integrity is verifiable, not merely asserted.
- BR4: Custody follows the officer's service record; orphaned custody is escalated.
- BR5: **(R14)** Tier projection must meet P95 < 500ms at 200k employees via caching / column pre-computation — a GA gate.
- BR6: **(R15)** Statutory retention schedule overrides the DPDP erasure right; erasure requests against in-retention APARs are recorded and refused with the legal basis.

**Data Model References.**
| Entity | Use |
|---|---|
| E18 apar_disclosure_log | append hash-chained access/custody events |
| E23 digital_signatures | disposal/downgrade signature |
| E4 appraisal_forms | confidentiality_class, custodian linkage |
| documents (M13) | encrypted PDF storage |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/forms/{formId} (tier-projected) |
| GET | /api/v1/pam/forms/{formId}/pdf |
| POST | /api/v1/pam/forms/{formId}/custody-transfer |
| GET | /api/v1/pam/forms/{formId}/access-log |
| GET | /api/v1/pam/forms/{formId}/access-log/verify |
| POST | /api/v1/pam/forms/{formId}/heir-access |
| POST | /api/v1/pam/forms/{formId}/dispose (maker) |
| POST | /api/v1/pam/forms/{formId}/dispose/approve (checker) |
| POST | /api/v1/pam/forms/{formId}/downgrade (maker+checker) |

**UI Behavior Notes.** Content rendered through permission-aware projection — absent fields show a plain-language reason banner (R17). PDF viewer with watermark. Access-log table for custodian/auditor with a "Verify integrity" button (R11). Custody-transfer dialog. Heir-access grant workflow. Disposal/downgrade require a second approver (dual-control) plus step-up + DSC.

**Edge Cases.** Multi-role caller (lowest-privilege projection wins); transfer to office with no custodian (escalate); disposal before retention end (block); disposal single-person (block — `DUAL_CONTROL_REQUIRED`); erasure request during retention (refuse with legal basis); heir access for unverified claimant (block); hash-chain mismatch on verify (raise `TAMPER_CHECK_FAILED`, alert auditor).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `TierProjectionService` (cached), `AccessLogger` (hash-chain), `ChainVerifier`, `Anchorer`, `CustodyService`, `HeirAccessService`, `PDFRenderService`, `RetentionService`, `DualControlGuard`, `SignatureService` |
| Backend Flow | Every read → projection guard (cache) → append hash-chained log → return projected payload + reason codes; verify recomputes chain; disposal/downgrade → maker then checker + step-up + DSC |
| Data Operations | INSERT E18 (append-only, hashed); INSERT E23; UPDATE E4 custodian/class; M13 store; audit_log |
| Validation | Role/tier matrix, retention schedule, downgrade authority, dual-control distinctness, chain integrity, heir verification |
| Authorization | Tier-aware field-level; custodian/auditor scoped; auditor no mutation; dual-control on irreversible |
| State Changes & Side Effects | custody reassignment; access events logged+chained; periodic anchoring; disposal/downgrade with two principals |
| Failure Handling | Unauthorised → FORBIDDEN + ACCESS_DENIED; single-person disposal → `DUAL_CONTROL_REQUIRED`; chain mismatch → `TAMPER_CHECK_FAILED`; orphan custody → escalation |
| Dependencies | M05 (transfer), M13, all read endpoints, FR-M08-20 (DSC) |
| Test Guidance | Unit: projection matrix + reason codes, hash-chain compute, dual-control distinctness. Integration: denied-read logging, verify pass/fail, heir access, disposal two-person, 200k projection load-test (GA gate) |

---

### FR-M08-16 — Performance & Bias-Disparity Analytics

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Dept Head/AA, Auditor (read), feeds M14
- **User Story:** As HR leadership, I want analytics on rating distribution, skew, completion, skill gaps **and equity (bias-disparity)** so I can detect bias, monitor progress and meet the government's equity obligation.

**Description.** Provides aggregated, role-scoped analytics: rating distribution vs target (pre/post calibration), grading skew by RO/org unit, cycle completion funnel, adverse/representation rates, competency-gap heatmaps, 360 participation, and — new in v2 — **DPDP-safe bias-disparity analytics**: adverse-rate, below-benchmark-rate and grade-mean by **gender / cadre / region / RO over time**, plus a **rater-leniency / central-tendency model across cycles** (R13). All analytics are de-identified aggregates with minimum-N suppression.

**Acceptance Criteria.**
1. Distribution charts show pre- vs post-calibration and current vs target (diagnostic).
2. Skew detection flags ROs/units whose distribution deviates beyond a configurable threshold.
3. **(R13)** A bias-disparity view reports adverse-rate / below-benchmark-rate / grade-mean by gender/cadre/region/RO over time, with min-N suppression, and a cross-cycle rater-leniency/central-tendency model.
4. Aggregates honour minimum-N suppression; no drill-down to individual APAR content beyond the caller's authorization.
5. Analytics endpoints are paginated/bounded and cached with freshness ≤ 15 min.

**Business Rules.**
- BR1: Org scoping restricts each caller's analytics to their authorised population.
- BR2: Individual-level data is exposed only to those already authorised to view that APAR.
- BR3: M14 consumes only the aggregated, suppressed facts.
- BR4: **(R13)** Protected-attribute disparity metrics are computed only on aggregates ≥ min-N and never expose individual protected attributes.

**Data Model References.**
| Entity | Use |
|---|---|
| E4 appraisal_forms | grades, flags, status |
| E15 calibration_adjustments / E21 recommendations | pre/post comparison |
| E9 competency_assessments | gap heatmaps |
| E11/E12 360 | participation |
| employees (M01) | protected-attribute aggregates (gender/cadre/region) |

**API References.**
| Method | Path |
|---|---|
| GET | /api/v1/pam/analytics/distribution |
| GET | /api/v1/pam/analytics/skew |
| GET | /api/v1/pam/analytics/completion |
| GET | /api/v1/pam/analytics/competency-gaps |
| GET | /api/v1/pam/analytics/bias-disparity |
| GET | /api/v1/pam/analytics/rater-leniency |

**UI Behavior Notes.** Dashboard: distribution histogram, skew table with flags, completion funnel, gap heatmap, **bias-disparity panel** (adverse-rate by gender/cadre/region/RO over time, suppressed below min-N) and **rater-leniency model**. Filters by cycle/org/cadre. Export respects authorization and suppression.

**Edge Cases.** Small populations (suppress); mid-cycle (partial data labelled provisional); calibration not run (post = pre); unauthorised drill-down (denied); protected-attribute bucket below min-N (suppressed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AnalyticsService`, `DistributionEngine` (reused), `SkewDetector`, `DisparityEngine`, `RaterLeniencyModel`, `SuppressionGuard`, `CacheLayer` |
| Backend Flow | Query scoped aggregates → suppress < N → compute skew/funnel/disparity/leniency → cache → serve |
| Data Operations | SELECT aggregate over E4/E9/E15/E21/E11-12 + M01 attributes; read-only; no writes |
| Validation | Org scope, min-N suppression, threshold config, protected-attribute aggregation only |
| Authorization | Role/org-scoped; aggregate-only for non-authorised individual data |
| State Changes & Side Effects | none (read-only); cache populate |
| Failure Handling | Cache miss → recompute; oversized query → paginate/limit; sub-min-N → suppressed |
| Dependencies | FR-M08-06/07/09/12/11; feeds M14 |
| Test Guidance | Unit: suppression, skew + disparity math, leniency model. Integration: scoped aggregation, cache freshness, protected-attribute suppression, M14 contract |

---

### FR-M08-17 — Sealed Cover Procedure (NEW, R3)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Accepting/Competent Authority, APAR Custodian; driven by M09
- **User Story:** As HR, when an officer is under charge or whose promotion is sub judice, I want the APAR finalisation and the promotion-eligibility feed kept in a sealed cover until the proceeding concludes, so no premature or wrong career outcome occurs.

**Description.** When M09 signals an active charge / sub-judice status for an appraisee, the form is placed in **SEALED_COVER**: assessments may be recorded but the form cannot transition to FINALISED/POSTED and the M06 eligibility feed is suppressed (FR-M08-14). On M09 conclusion, the Competent Authority releases the sealed cover with a **DSC-signed** release referencing the M09 outcome; the form then proceeds (finalise/feed) or is acted upon per the disciplinary result.

**Acceptance Criteria.**
1. An active M09 charge/sub-judice status sets `sealed_cover=true`, `sealed_cover_reason`, `sealed_cover_case_ref`, `sealed_at`, status SEALED_COVER; appends SEALED to the hash-chained log.
2. While sealed, transitions to FINALISED/POSTED are blocked and the M06 feed is suppressed (FR-M08-14).
3. Release requires an M09 conclusion reference and a signed `SEALED_COVER_RELEASE` (E23); appends UNSEALED; sets `sealed_released_at`.
4. On release, the form resumes its normal lifecycle; eligibility is (re)evaluated per the disciplinary outcome.
5. Sealing/unsealing is auditable and notified to HR, AA and custodian.

**Business Rules.**
- BR1: Only the Competent Authority (not the appraisee's RO/RvO) may release a sealed cover, signed.
- BR2: A sealed form's grade may still be assessed/certified into a held state but never posted while sealed.
- BR3: Sealed-cover status is confidential and tier-projected like all APAR content.

**Data Model References.**
| Entity | Use |
|---|---|
| E4 appraisal_forms | sealed_cover*, status |
| E18 apar_disclosure_log | SEALED/UNSEALED events |
| E23 digital_signatures | release signature |
| M09 (read/subscribe) | charge/sub-judice/conclusion |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/seal |
| POST | /api/v1/pam/forms/{formId}/seal/release |
| GET | /api/v1/pam/forms/{formId}/seal-status |

**UI Behavior Notes.** A prominent "Sealed Cover — finalisation and eligibility feed suppressed" banner with case reference. Release dialog requires M09 conclusion reference + DSC. Custodian/HR see sealed-cover queue.

**Edge Cases.** Charge raised after certification but before posting (seal, block post); charge concluded favourably (release, resume feed); charge concluded adversely (release, act per M09, feed reflects outcome); M09 status flapping (idempotent seal/keep-sealed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SealedCoverService`, `M09StatusSubscriber`, `SignatureService`, `DisclosureLogger`, `FormTransitionService` |
| Backend Flow | On M09 charge → seal form + log + suppress feed; on conclusion → competent authority signs release → unseal → resume |
| Data Operations | UPDATE E4 sealed_cover*; INSERT E18 (SEALED/UNSEALED); INSERT E23; audit_log |
| Validation | Authority role, M09 reference presence, signature validity |
| Authorization | Competent Authority release (signed); HR/custodian view; appraisee no seal control |
| State Changes & Side Effects | → SEALED_COVER; ← prior status on release; M06 feed suppressed/resumed |
| Failure Handling | Release w/o M09 ref → VALIDATION_ERROR; release w/o DSC → `SIGNATURE_REQUIRED`; post attempt while sealed → `SEALED_COVER_ACTIVE` |
| Dependencies | M09, FR-M08-06, FR-M08-14, FR-M08-20 |
| Test Guidance | Unit: seal/release guards. Integration: seal-on-charge, feed suppression, signed release, resume lifecycle |

---

### FR-M08-18 — Multi-RO Part-Period Reports & "No Report Certificate" (NEW, R4)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, Reporting Officer(s)
- **User Story:** As HR, I want to represent the reality that an officer had 2–3 reporting officers across the year, each writing a part-period report, with a "No Report Certificate" where supervision was below the minimum period, and a correct aggregation to the final grade.

**Description.** Each appraisal year is divided into `appraisal_report_periods` (E19), one per RO who supervised the appraisee. Each RO grades only their period (FR-M08-04). A period with `supervision_months < cycle.min_supervision_months` yields a **No-Report Certificate** (DSC-signed), not a grade. Part-period grades aggregate (supervision-weighted) into the form's `provisional_grade`.

**Acceptance Criteria.**
1. HR (or the chain resolver) can define multiple report periods per form with non-overlapping date ranges covering the appraisal period.
2. Each period resolves an RO and `supervision_months`; `has_multi_ro=true` when >1 period.
3. A period below `min_supervision_months` is recorded as `no_report_certificate=true` with a reason and a DSC-signed No-Report Certificate; it is excluded from aggregation.
4. `provisional_grade` = supervision-weighted mean of valid (non-NoReport) period grades, computed deterministically; `weight_in_aggregate` recorded per period.
5. The form advances to RVO_REVIEW only when every period is SUBMITTED or NO_REPORT.

**Business Rules.**
- BR1: Report periods must tile the appraisal period without gaps/overlaps (or gaps explicitly flagged as unsupervised).
- BR2: A No-Report period carries no grade and no weight; the No-Report Certificate is DSC-signed (R10).
- BR3: An RO change mid-year (transfer per M05) closes the current period and opens the next.
- BR4: Aggregation is the single deterministic function reused by analytics.

**Data Model References.**
| Entity | Use |
|---|---|
| E19 appraisal_report_periods | define/grade/aggregate |
| E8 appraisal_assessments | REPORTING per period |
| E23 digital_signatures | No-Report Certificate signature |
| E4 appraisal_forms | has_multi_ro, provisional_grade |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/report-periods |
| PUT | /api/v1/pam/forms/{formId}/report-periods/{periodId} |
| POST | /api/v1/pam/forms/{formId}/report-periods/{periodId}/no-report |
| POST | /api/v1/pam/forms/{formId}/report-periods/aggregate |

**UI Behavior Notes.** Timeline of report periods with RO, dates, supervision months and status. "Issue No-Report Certificate" action (DSC) on short periods. Aggregation preview showing supervision-weighted final provisional grade.

**Edge Cases.** Gaps between periods (flag unsupervised); overlapping periods (block); all periods No-Report (form flagged "No Report for the year"); single RO whole year (has_multi_ro=false, one period); RO transferred mid-period (split period).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ReportPeriodService`, `SupervisionResolver`, `NoReportCertifier`, `ReportPeriodAggregator`, `SignatureService` |
| Backend Flow | Seed/define periods → each RO grades → short periods → No-Report (signed) → aggregate supervision-weighted → set provisional_grade |
| Data Operations | INSERT/UPDATE E19; INSERT E23 (No-Report); UPDATE E4; audit_log |
| Validation | Date tiling, supervision threshold, signature on No-Report, aggregation determinism |
| Authorization | HR define; each period's RO grade; org-scoped |
| State Changes & Side Effects | period DRAFT→SUBMITTED/NO_REPORT→AGGREGATED; form provisional_grade set |
| Failure Handling | Overlap → CONFLICT; missing No-Report signature → `SIGNATURE_REQUIRED`; advance before all periods done → `INVALID_STATE_TRANSITION` |
| Dependencies | FR-M08-04, M05 (transfer), FR-M08-20 |
| Test Guidance | Unit: tiling, supervision-weighted aggregation, threshold. Integration: multi-RO grade→aggregate, No-Report exclusion, transfer split |

---

### FR-M08-19 — SLA Auto-Escalation & Authoring-Right Transfer (NEW, R9)

- **Module:** M08-PAM
- **Primary Role(s):** HR/APAR Cell, next-higher authority; System (SLA engine)
- **User Story:** As HR, when an RO/RvO/AA fails to act within the statutory window, I want authoring right to transfer automatically to the next higher authority (or a "No Report due to RO/RvO" recorded), so a single non-responsive officer cannot stall the cycle.

**Description.** The SLA engine monitors tier due dates. On a missed window (beyond reminder grace), it **transfers the authoring right** to the next higher authority per service rule, or records a "No Report due to RO/RvO" (a No-Report Certificate at the relevant tier), and notifies all parties. Escalated assessments are marked `is_escalated_author=true` and still require a DSC.

**Acceptance Criteria.**
1. The engine sends reminders before due; on overdue beyond grace it triggers escalation, not just another reminder.
2. Escalation transfers the authoring task to the next higher authority (RO→RvO, RvO→AA, AA→competent authority) per the cycle's escalation config; the act is logged and notified.
3. Alternatively, where service rule prescribes, a "No Report due to RO/RvO" is recorded (DSC-signed No-Report Certificate at that tier) and the flow continues.
4. An escalated assessment sets `is_escalated_author=true` and still requires a valid DSC.
5. Escalation events are auditable and appear on the cycle SLA dashboard.

**Business Rules.**
- BR1: Escalation respects separation of duties and COI — the transferee cannot be the appraisee or conflicted.
- BR2: Only one active authoring right per tier at a time (transfer revokes the prior).
- BR3: Escalation thresholds (grace days) and the ladder are cycle configuration.

**Data Model References.**
| Entity | Use |
|---|---|
| E8 appraisal_assessments | is_escalated_author, signature |
| E19 appraisal_report_periods | No-Report-due-to-RO at RO tier |
| E4 appraisal_forms | status/authoring right |
| workflow_tasks (shared) | task reassignment |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/escalate |
| GET | /api/v1/pam/cycles/{cycleId}/sla-status |
| POST | /api/v1/pam/forms/{formId}/no-report-tier |

**UI Behavior Notes.** SLA dashboard with overdue heatmap and escalation actions. On escalation, the new author sees a banner: "Authoring right transferred to you due to RO non-response by DD-MMM-YYYY." No-Report-due-to-RO action with DSC.

**Edge Cases.** Transferee also overdue (cascade to next tier); apex officer with no higher authority (record No-Report / route to designated alternate per chain config, R12); officer acts just after escalation (escalation wins, prior task revoked); conflicted transferee (skip to next eligible).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SLAEngine`, `EscalationService`, `AuthoringRightService`, `NoReportCertifier`, `NotificationService` |
| Backend Flow | Monitor due dates → reminder → overdue+grace → transfer authoring right or record No-Report → reassign workflow task → notify |
| Data Operations | UPDATE workflow_tasks; UPDATE E8 is_escalated_author; INSERT E19/E23 (No-Report); audit_log |
| Validation | Grace threshold, ladder config, COI/SoD on transferee |
| Authorization | System-triggered; HR oversight; transferee acts with DSC |
| State Changes & Side Effects | authoring task reassigned; possible No-Report at tier; notifications |
| Failure Handling | No eligible transferee → escalate to HR/designated alternate; cascade overdue |
| Dependencies | FR-M08-04/05/06, FR-M08-18 (No-Report), FR-M08-20, R12 chain config |
| Test Guidance | Unit: grace/threshold, ladder traversal, COI skip. Integration: overdue→transfer, cascade, apex No-Report, late-act-loses |

---

### FR-M08-20 — Digital Signature & Non-Repudiation (NEW, R10)

- **Module:** M08-PAM
- **Primary Role(s):** RO, RvO, AA, Competent/Custodian authorities; eSign/DSC provider
- **User Story:** As a certifying officer, I want my statutory acts bound by a legally-recognised digital signature (DSC/eSign), distinct from session MFA, so the APAR record is non-repudiable.

**Description.** Provides a signing service that produces `digital_signatures` (E23) over a canonical payload hash using DSC, Aadhaar-eSign, or HSM token. Signatures are **required** on: tier certification (RO/RvO/AA), disclosure acknowledgement, calibration ratification, expunction, No-Report Certificate, sealed-cover release, disposal and confidentiality downgrade. Signature verification status is checked before the signed act commits and re-verifiable later.

**Acceptance Criteria.**
1. A signing ceremony hashes the canonical payload (SHA-256), invokes the provider, and stores `signature_value`, `certificate_serial`, `signed_payload_hash`, method and `verification_status=VALID`.
2. The dependent act (certify/ack/ratify/expunge/dispose/release/No-Report) does not commit unless a VALID signature is attached. **(R10)**
3. MFA step-up authenticates the session; the **digital signature** binds the record — both are required where specified (distinct controls).
4. Signatures are re-verifiable; a later REVOKED/EXPIRED/INVALID status is recorded without altering the original signed payload (append-only).
5. Signature artefacts are stored encrypted in M13 and referenced by entity.

**Business Rules.**
- BR1: A signature binds exactly one entity (`entity_type`,`entity_id`); reuse across records is rejected.
- BR2: Signature payload hash must match the record state at signing; tampering invalidates verification.
- BR3: Provider outages queue the act as pending-signature, never auto-bypass the requirement.

**Data Model References.**
| Entity | Use |
|---|---|
| E23 digital_signatures | create/verify |
| E8/E15/E18/E19/E21 | reference signature_id |
| documents (M13) | encrypted signature artefact |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/signatures (sign ceremony) |
| GET | /api/v1/pam/signatures/{id}/verify |
| GET | /api/v1/pam/forms/{formId}/signatures |

**UI Behavior Notes.** Signing ceremony modal (select DSC token / Aadhaar-eSign), showing the canonical payload summary being signed. Signature badges on certified records with a "Verify" action. Pending-signature state if provider is down.

**Edge Cases.** Provider down (queue pending-signature); certificate expired at signing (block); revoked certificate discovered later (mark INVALID, alert, do not mutate record); payload changed after signing attempt (re-sign required).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SignatureService`, `DSCProviderClient`, `PayloadCanonicaliser`, `VerificationService` |
| Backend Flow | Canonicalise → hash → provider sign → store E23 → attach to entity → commit act; verify recomputes/queries status |
| Data Operations | INSERT E23 (append-only); UPDATE referencing entity signature_id; M13 store; audit_log |
| Validation | One-entity binding, payload-hash match, certificate validity |
| Authorization | Signer = the acting authority; org/tier scoped |
| State Changes & Side Effects | signature created; dependent act commits only with VALID signature |
| Failure Handling | Provider down → pending; expired/revoked → block/mark INVALID; mismatch → re-sign |
| Dependencies | eSign/DSC provider, M13; consumed by FR-04/05/06/08/09/15/17/18 |
| Test Guidance | Unit: canonicalisation, one-entity binding, hash match. Integration: sign→commit, provider-down queue, later-revocation handling |

---

### FR-M08-21 — Probation Confirmation Appraisal (NEW, R19)

- **Module:** M08-PAM
- **Primary Role(s):** Reporting Officer, Reviewing Officer, Accepting Authority, HR/APAR Cell
- **User Story:** As HR, I want the PROBATION cycle to drive a confirmation/extension/discharge recommendation fed to M01 and M12, distinct from the annual APAR, so probationers are confirmed lawfully and on time.

**Description.** A `cycle_type=PROBATION` runs a lighter appraisal whose outcome is a **probation decision** — CONFIRMED, EXTENDED, or DISCHARGE_RECOMMENDED — rather than a numeric annual grade. The flow still uses RO→RvO→AA assessment and disclosure but concludes by writing `probation_outcome` to the form and feeding M01 (employment status / confirmation date) and M12 (service-register event). Extension respects `probation_extension_max_months`.

**Acceptance Criteria.**
1. A PROBATION cycle materialises probation forms with the probation template; the outcome field set is `probation_outcome`.
2. The AA certifies a probation outcome (CONFIRMED/EXTENDED/DISCHARGE_RECOMMENDED) with DSC; CONFIRMED records a confirmation date.
3. EXTENDED creates a successor probation cycle window within `probation_extension_max_months`; repeated extension beyond the cap is blocked.
4. The outcome is disclosed to the officer (mandatory) and, on finalisation, fed to M01 (status/confirmation) and M12 (SR event).
5. DISCHARGE_RECOMMENDED routes to the competent authority and is referenced to M09/M01 per policy.

**Business Rules.**
- BR1: Probation outcome is not a numeric APAR grade; it does not feed the M06 promotion benchmark.
- BR2: Confirmation feeds M01 employment status and M12 as a statutory service event.
- BR3: Extension beyond the configured cap requires explicit higher authority and reason.

**Data Model References.**
| Entity | Use |
|---|---|
| E1 appraisal_cycles | probation_period_months, extension cap |
| E4 appraisal_forms | probation_outcome |
| service_register_events (M12) | confirmation event |
| employees (M01) | status/confirmation feed |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/forms/{formId}/probation/decide |
| POST | /api/v1/pam/forms/{formId}/probation/extend |
| GET | /api/v1/pam/cycles?type=PROBATION |

**UI Behavior Notes.** Probation workbench showing supervision summary and a decision selector (Confirm / Extend / Recommend Discharge) with DSC. Confirmation date picker. Extension capped with a remaining-months indicator.

**Edge Cases.** Extension cap reached (block, escalate); discharge recommendation (route to competent authority + M09/M01); probationer transferred (multi-RO periods apply); confirmation overdue (SLA escalation FR-M08-19).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ProbationService`, `FormTransitionService`, `M01ConfirmationClient`, `SRPostingService`, `SignatureService` |
| Backend Flow | Run probation assessment → AA decides (DSC) → disclose → finalise → feed M01 + M12; extend creates successor window |
| Data Operations | UPDATE E4 probation_outcome; POST M01; INSERT service_register_events; audit_log |
| Validation | Outcome enum, extension cap, authority, signature |
| Authorization | RO/RvO/AA tiers; competent authority for discharge |
| State Changes & Side Effects | form → FINALISED/POSTED with probation_outcome; M01/M12 feed |
| Failure Handling | Cap exceeded → CONFLICT; missing DSC → `SIGNATURE_REQUIRED` |
| Dependencies | FR-M08-04/05/06/08/14, M01, M12, FR-M08-20 |
| Test Guidance | Unit: outcome routing, extension cap. Integration: confirm→M01/M12 feed, extend successor, discharge routing |

---

### FR-M08-22 — Cycle Errata / Controlled Correction (NEW, R18)

- **Module:** M08-PAM
- **Primary Role(s):** System Administrator, HR/APAR Cell, Accepting/Competent Authority
- **User Story:** As HR, when a configuration error (e.g., wrong adverse threshold or scale binding) is discovered mid-cycle, I want a controlled correction and re-derivation path so I don't have to force every affected case through representation.

**Description.** Provides a guarded errata workflow: an authorised admin proposes a cycle/scale/threshold correction; the system computes the impact set (affected forms), the change is approved (dual-control), and affected derived values (`is_adverse`, `below_benchmark`, labels, eligibility) are **re-derived** in a transaction with full audit and re-notification. Errata never silently edits certified grades without re-derivation provenance, and affected officers are re-notified.

**Acceptance Criteria.**
1. An errata proposal identifies the corrected parameter, the rationale, and the computed impact set (count + list of affected forms).
2. Applying errata requires dual-control approval (maker+checker) and, for certified forms, re-derivation provenance (old → new values recorded). **(R23-style control)**
3. Re-derivation recomputes `is_adverse`/`below_benchmark`/labels and, where eligibility changes, emits corrective M06/M12 events (never silent overwrite).
4. Affected officers and authorities are re-notified; the cycle records an ERRATA status during application.
5. Errata is fully audited and reversible only via a further errata (append-only provenance).

**Business Rules.**
- BR1: Errata cannot alter the substantive assessment (remarks/grades chosen by officers); it only corrects configuration and re-derives system-computed flags.
- BR2: An errata that would worsen an officer's outcome (e.g., newly adverse) triggers a fresh disclosure + representation window for those cases.
- BR3: Errata on a posted form emits corrective SR/M06 events, never destructive edits.

**Data Model References.**
| Entity | Use |
|---|---|
| E1 appraisal_cycles | corrected parameters; ERRATA status |
| E3 rating_scales | corrected thresholds (new version) |
| E4 appraisal_forms | re-derived flags |
| service_register_events / M06 | corrective events |

**API References.**
| Method | Path |
|---|---|
| POST | /api/v1/pam/cycles/{cycleId}/errata/propose |
| GET | /api/v1/pam/cycles/{cycleId}/errata/{errataId}/impact |
| POST | /api/v1/pam/cycles/{cycleId}/errata/{errataId}/approve |
| POST | /api/v1/pam/cycles/{cycleId}/errata/{errataId}/apply |

**UI Behavior Notes.** Errata wizard: select parameter → preview impact set (counts, affected officers, before/after flags) → dual-control approval → apply with re-notification summary. Clear "this will re-open disclosure for N newly-adverse cases" warning.

**Edge Cases.** Errata makes a favourable case adverse (fresh disclosure/representation for those); errata on already-posted forms (corrective events); concurrent errata (serialize — `ERRATA_IN_PROGRESS`); zero-impact errata (no-op with audit).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ErrataService`, `ImpactAnalyzer`, `GradeDerivationService`, `DualControlGuard`, `CorrectiveEventEmitter`, `NotificationService` |
| Backend Flow | Propose → compute impact → dual-control approve → apply in txn: re-derive flags → emit corrective events → re-notify → record provenance |
| Data Operations | UPDATE E1/E3 (new version)/E4 (flags); INSERT corrective service_register_events/M06; audit_log |
| Validation | Authority + dual-control, impact computed, provenance recorded, serialization |
| Authorization | Sys Admin/HR propose; second approver; competent authority for certified-impact |
| State Changes & Side Effects | cycle → ERRATA → prior; flags re-derived; corrective events; re-notification; possible re-disclosure |
| Failure Handling | Concurrent errata → `ERRATA_IN_PROGRESS`; certified-impact without approval → FORBIDDEN |
| Dependencies | FR-M08-07/08/14/15 |
| Test Guidance | Unit: impact computation, re-derivation. Integration: errata→re-derive→corrective events→re-disclose newly-adverse, dual-control, serialization |

---

## Section 7 — UI Requirements

### 7.1 Key screens

| Screen | Primary users | Purpose | Key states |
|---|---|---|---|
| Cycle Admin Console | HR, Sys Admin | Configure/open cycles, templates, scales, clock, chain rules, errata | empty, draft, validating, open, errata, error |
| My Appraisal (Appraisee) | Appraisee | Goals, self-appraisal, disclosure, eSign acknowledge, representation | empty, draft, submitted, returned, disclosed, sealed, locked |
| Goal Board | Appraisee, RO | Set/approve weighted cascaded goals (employee×period); snapshot-on-lock preview | weightage-incomplete, balanced, dev-outside-sum, locked |
| RO/RvO/AA Assessment Workbench | RO, RvO, AA | Tiered (multi-RO part-period) assessment, compare, certify, DSC | pending, in-progress, returned, certified, escalated |
| Report Periods & No-Report | HR, RO | Define periods, part-period grades, No-Report Certificate | single-RO, multi-RO, no-report, aggregated |
| Sealed Cover Console | HR, AA, Custodian | Seal/release, suppressed-feed view | sealed, released, normal |
| Calibration Studio | Committee, AA | Diagnostic distribution, recommendations, ratification | planned, in-session, recommended, ratified, declined |
| Disclosure & Representation Centre | HR, Appraisee, Authority | Mandatory full disclosure, ack clock, appeal, condonation, escalation ladder | dispatched, disclosed, deemed, filed, decided, escalated, SLA-breach |
| Continuous Feedback / Check-ins | All | Year-round feedback & progress (disclosability tagged) | empty, feed, acknowledged |
| 360 Feedback | HR, raters | Nominate, respond, summary (anonymity-suppressed) | invited, in-progress, suppressed, summary |
| Competency & Gaps | RO, Appraisee | Assess competencies, nominate training | gap-flagged, nominated, no-mapping |
| PIP Workspace | RO, RvO, HR | Create/track/close PIPs | draft, active, at-risk, closed |
| Custody & Access Log | Custodian, Auditor | Hash-chained access ledger, verify, custody transfer, heir access, dual-control disposal | normal, denied-events, transfer, heir, tamper-alert |
| Digital Signature Centre | All authorities | Signing ceremonies, verify badges | unsigned, pending-provider, signed, revoked |
| Performance & Equity Analytics | HR, leadership | Distribution/skew/completion/gaps/bias-disparity | provisional, suppressed, full |

### 7.2 Cross-cutting UI rules

- Mobile-first, responsive; collapsible sidebar with menu icons and hamburger toggle.
- Every screen implements empty, loading, error, success, permission-denied, and (where relevant) offline states — no skeleton-only screens; real fields, data, API calls and states.
- WCAG 2.1 AA: keyboard navigation, visible focus, AA contrast, ARIA labels; dark mode via design tokens.
- Confidential content uses permission-aware projection (hidden, not greyed) and watermarked PDFs.
- All lists paginated (max 100/page); destructive/guarded actions confirm with consequence summary; certification/ratification/disposal require MFA step-up **and** DSC; disposal/downgrade require a second approver (dual-control).
- Dates display `DD-MMM-YYYY`; money INR with i18n; timestamps in user timezone.

### 7.3 Plain-language role context & "why hidden" (R17 — leak-prevention control)

- Every assessment/disclosure screen shows a **plain-language tier banner** stating exactly who the user is on this APAR and what they may do (e.g., "You are the Reviewing Officer. You may agree or change the grade with a reason.").
- Where a field is **absent** due to tier projection, a **reason banner** explains why ("hidden until disclosure", "not visible to your tier", "sealed cover"), so users do not misinterpret absence and do not mis-share content through legitimate channels. This is treated as a confidentiality leak-prevention control, not cosmetic.
- Multi-role users see the lowest-privilege projection with a note explaining which role is active on the current screen.

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/pam`; JSON; JWT bearer; RBAC + org scope + tier projection.
- All list endpoints paginated (`?page=&limit=` max 100, or cursor); sortable; filterable.
- Idempotency keys on posting/certify/ratify/seal actions; optimistic concurrency via `If-Match`/`updated_at`.
- Statutory acts (certify, acknowledge, ratify, expunge, No-Report, seal-release, dispose, downgrade) require an attached VALID `signature_id` (FR-M08-20).

### 8.2 Canonical error envelope

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Performance weightage must total 100% (DEVELOPMENT goals excluded)", "field": "goals.weightage" },
  "requestId": "b7c2a1e4-7f3d-4a90-9d2f-1c2b3a4d5e6f"
}
```

### 8.3 Error-code catalog (inherited + module-specific)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/business validation failed |
| AUTH_REQUIRED | 401 | Missing/invalid token or step-up needed |
| FORBIDDEN | 403 | Role/tier/org/self-adjudication denied |
| NOT_FOUND | 404 | Resource not found / not in scope |
| CONFLICT | 409 | State or uniqueness conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled server error |
| UPSTREAM_UNAVAILABLE | 503 | M07/M12/M06/M13/eSign provider unavailable |
| WEIGHTAGE_IMBALANCE | 422 | Performance goal weightages ≠ 100% at lock (dev excluded) |
| TIER_CONFLICT | 409 | Same person across tiers / self-adjudication |
| SELF_ADJUDICATION_BLOCKED | 403 | Caller is appraisee on this form |
| COI_RECUSAL_REQUIRED | 403 | Declared conflict of interest; recuse before acting (R22) |
| INVALID_STATE_TRANSITION | 409 | Action not allowed in current form status |
| GRADE_OUT_OF_RANGE | 422 | Grade outside scale bounds |
| ADVERSE_EVIDENCE_REQUIRED | 422 | Adverse remark lacks disclosable evidence (R5) |
| REPRESENTATION_WINDOW_CLOSED | 409 | SLA window elapsed (condonation required) |
| DISCLOSURE_REQUIRED | 409 | Action blocked until APAR disclosed |
| CALIBRATION_RATIONALE_REQUIRED | 422 | Recommendation without rationale |
| RATIFICATION_REQUIRED | 409 | Calibration not ratified by competent authority (R1) |
| FORCED_DISTRIBUTION_UNSUPPORTED | 422 | Forced distribution removed; method unavailable (R2) |
| SEALED_COVER_ACTIVE | 409 | Finalise/post/feed blocked while sealed (R3) |
| CHAIN_TRUNCATED_UNCONFIGURED | 409 | Apex chain cannot satisfy "all distinct"; needs config (R12) |
| SIGNATURE_REQUIRED | 403 | Statutory act needs a valid DSC/eSign (R10) |
| SIGNATURE_INVALID | 422 | Signature verification failed/revoked/expired (R10) |
| DUAL_CONTROL_REQUIRED | 403 | Second-person approval needed for disposal/downgrade (R23) |
| TAMPER_CHECK_FAILED | 409 | Disclosure-log hash-chain verification failed (R11) |
| ERRATA_IN_PROGRESS | 409 | Concurrent cycle errata; serialize (R18) |
| MIN_N_SUPPRESSED | 200 | Aggregate suppressed (informational) |
| CUSTODY_ORPHANED | 409 | No custodian resolvable on transfer |
| ALREADY_POSTED | 409 | SR posting is idempotent no-op |

### 8.4 JSON examples

**Submit RO part-period assessment with adverse evidence (request):**
```json
POST /api/v1/pam/forms/{formId}/assessment/reporting/submit
{
  "report_period_id": "rp...A",
  "integrity_certified": "BEYOND_DOUBT",
  "pen_picture": "A diligent officer who cleared the case backlog...",
  "section_grades": [{ "section": "GOALS", "grade": 8.5, "weightage": 70 },
                     { "section": "COMPETENCY", "grade": 7.5, "weightage": 30 }],
  "part_period_grade": 8.10,
  "adverse_evidence_refs": [],
  "signature_id": "sig...01"
}
```

**Certify (response, mandatory disclosure next):**
```json
{
  "form_id": "f...01",
  "apar_no": "APAR-2025-26-000142",
  "final_grade": 8.40,
  "final_grade_label": "Very Good",
  "is_adverse": false,
  "below_benchmark": false,
  "certification_signature_id": "sig...03",
  "status": "DISCLOSURE",
  "requestId": "..."
}
```

**Calibration not ratified (error):**
```json
{ "error": { "code": "RATIFICATION_REQUIRED", "message": "Certified grade may change only after AA ratification of the recommendation", "field": "recommendation_id" }, "requestId": "..." }
```

**Sealed cover blocks posting (error):**
```json
{ "error": { "code": "SEALED_COVER_ACTIVE", "message": "Finalisation and M06 feed suppressed while sealed cover is active", "field": "form_id" }, "requestId": "..." }
```

**Disclosure-log verification (response):**
```json
{ "form_id": "f...01", "chain_valid": true, "rows_verified": 14, "last_anchor_ref": "ANCHOR-2026-05-01-0007", "requestId": "..." }
```

### 8.5 Integration contracts

| System | Mode | Payload |
|---|---|---|
| M12 SR | append event (outbox, hash-ref) | `{type:"APAR_FINAL_GRADE", employee_id, cycle_id, final_grade, label, is_adverse, form_ref, disclosure_log_hash}` |
| M12 SR (probation) | append event | `{type:"PROBATION_CONFIRMED", employee_id, confirmation_date, form_ref}` |
| M06 eligibility | feed (upsert by cycle; **sealed-suppressed**) | `{employee_id, cycle_id, final_grade, below_benchmark, suppressed:false}` |
| M07 training | nomination POST | `{employee_id, competency_id, gap_severity, source:"APAR"}` |
| M09 disciplinary | subscribe/read | `{employee_id, charge_status, case_ref, conclusion_outcome}` → sealed cover |
| M01 employee | feed (probation) | `{employee_id, employment_status, confirmation_date}` |
| M13 documents | store/fetch | encrypted PDF + acknowledgement + signature artefacts |
| eSign/DSC provider | sign/verify | `{payload_hash, method, certificate_serial}` → `{signature_value, status}` |
| Notifications | publish | task/deadline/escalation/disclosure/seal events |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; **tier-projection P95 < 500ms at 200k employees via caching/column pre-computation — a hard GA gate (R14)**; bulk form materialise (10k forms) < 2 min async; analytics queries < 2s cached |
| Availability | 99.9% uptime; degraded-read mode if M12/M06/eSign down (queue writes via outbox; pending-signature state) |
| Scalability | Horizontal scaling; ≥ 200k employees; calibration over ≥ 5k forms; multi-RO periods per form |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; tier-aware field-level authz; MFA step-up **and DSC/eSign** for certify/ratify/dispose; dual-control on disposal/downgrade (R23) |
| Non-repudiation | DSC/eSign on all statutory acts; signatures re-verifiable; provider outage never bypasses the requirement (R10) |
| Privacy | DPDP Act 2023 alignment; PII minimisation; confidential classification; min-N suppression in analytics incl. protected-attribute disparity (R13) |
| Auditability | Every state change in `audit_log`; APAR access in **hash-chained, externally-anchored** `apar_disclosure_log` with a verification endpoint (R11) |
| Reliability | Outbox + retry with backoff for SR/M06/M07 posting; no partial commits; idempotent posting/sealing |
| Recoverability | RPO ≤ 15 min; RTO ≤ 4h; point-in-time restore for statutory records |
| Accessibility | WCAG 2.1 AA; keyboard/focus; dark mode; plain-language role context (R17) |
| Observability | Structured logs (no PII values), metrics, traces with `requestId`; SLA dashboards for cycle progress and escalation |
| Retention | Statutory retention schedule; **statutory retention overrides DPDP erasure (legal basis recorded, R15)**; controlled, dual-control, approved disposal only |
| i18n/l10n | Locale dates `DD-MMM-YYYY`, INR money, multilingual labels |

---

## Section 10 — Workflow & State Diagrams (State Tables)

### 10.1 Appraisal form (APAR) state machine

| Current | Event | Guard | Next | Side effects |
|---|---|---|---|---|
| DRAFT | cycle open | eligible, not under charge | GOALS_PENDING | notify appraisee/RO |
| DRAFT | cycle open | under M09 charge | SEALED_COVER | seal + log |
| GOALS_PENDING | goals lock | performance weightage=100, all approved | GOALS_APPROVED | write snapshots (E20); notify |
| GOALS_APPROVED | self window open | — | SELF_APPRAISAL | notify appraisee |
| SELF_APPRAISAL | self submit | narrative present | RO_ASSESSMENT | notify RO(s) |
| RO_ASSESSMENT | all periods submitted/No-Report | integrity+penpicture+grade+DSC valid; adverse evidence present | RVO_REVIEW | aggregate provisional; notify RvO |
| RO_ASSESSMENT | RO return self | — | SELF_APPRAISAL | notify appraisee |
| RO_ASSESSMENT | RO overdue | grace elapsed | RO_ASSESSMENT (escalated author) / No-Report | transfer authoring (R9) |
| RVO_REVIEW | RvO submit | concur/variance valid + DSC; no COI | AA_ACCEPTANCE | notify AA |
| RVO_REVIEW | RvO return | — | RO_ASSESSMENT | notify RO |
| AA_ACCEPTANCE | certify | step-up + DSC, grade valid, not sealed | DISCLOSURE | derive flags; sign |
| AA_ACCEPTANCE | certify | sealed_cover=true | SEALED_COVER | hold; log |
| (any pre-final) | M09 charge raised | — | SEALED_COVER | seal; suppress feed |
| SEALED_COVER | release | M09 concluded + signed release | (prior status) | unseal; log; resume |
| DISCLOSURE | disclose (mandatory, full) | — | DISCLOSED | dispatch+log; notify; start clock |
| DISCLOSED | acknowledge (eSign) | — | DISCLOSED (ack set) | log; window from ack if configured |
| DISCLOSED | deemed-disclosure | non-ack after configured days | DISCLOSED (deemed) | window opens (R8) |
| DISCLOSED | file representation | within window | REPRESENTATION | notify authority |
| DISCLOSED | window expires | no rep | FINALISED | — |
| REPRESENTATION | decide | authority valid + DSC; no COI | FINALISED | recompute grade if modified/expunged |
| REPRESENTATION | reject + escalate | external reference recorded | (rep ESCALATED) | flag CAT/tribunal handoff (R20) |
| FINALISED | post to SR | rep resolved, **not sealed** | POSTED | SR + M06 events (M06 suppressed if sealed) |
| (cycle) | errata apply | dual-control + impact computed | ERRATA→prior | re-derive flags; corrective events (R18) |
| any (pre-POSTED) | withdraw (admin) | reason | WITHDRAWN | log |
| FINALISED/POSTED | expunge (statutory) | authority + DSC | EXPUNGED | corrective SR event |

### 10.2 Goal state machine (employee×period)

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | propose | weightage set | PROPOSED |
| PROPOSED | RO approve | RO role | APPROVED |
| PROPOSED | RO return | — | DRAFT |
| APPROVED | lock (snapshot) | form lock | APPROVED (snapshotted=true, E20 written) |
| APPROVED | revise | window open + RO approve | REVISED |
| APPROVED/REVISED | mark achieved | cycle end | ACHIEVED / NOT_ACHIEVED |
| any | drop | reason | DROPPED |

### 10.3 Representation state machine (with escalation ladder)

| Current | Event | Guard | Next |
|---|---|---|---|
| FILED | take up | authority assigned, no COI | UNDER_REVIEW |
| FILED | condone | late + condonation authority | UNDER_REVIEW |
| UNDER_REVIEW | decide | reason recorded + DSC | DECIDED |
| DECIDED | escalate | rejected + external ref | ESCALATED |
| DECIDED | close | grade applied | CLOSED |
| ESCALATED | external disposal | tribunal outcome recorded | CLOSED |

### 10.4 PIP state machine

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | RvO concur + activate | concurrence | ACTIVE |
| ACTIVE | review | period checkpoint | UNDER_REVIEW |
| UNDER_REVIEW | close | outcome set | CLOSED |
| UNDER_REVIEW | extend | approval | (successor) ACTIVE |

### 10.5 Calibration recommendation & adjustment state machine (R1)

| Current | Event | Guard | Next |
|---|---|---|---|
| (session) PLANNED | convene | scope/flag on | IN_SESSION |
| recommendation PROPOSED | vote | quorum | ENDORSED / REJECTED |
| recommendation ENDORSED | ratify | AA/competent authority + step-up + DSC | RATIFIED (→ E15 APPLIED) |
| recommendation ENDORSED | decline | authority + reason | DECLINED (no grade change) |
| adjustment APPLIED | reverse | authority + DSC | REVERSED |
| session | all ratified/declined | — | COMPLETED |

### 10.6 Sealed cover state machine (R3)

| Current | Event | Guard | Next |
|---|---|---|---|
| (form) active | M09 charge | charge active | SEALED_COVER |
| SEALED_COVER | hold | sealed | SEALED_COVER (no finalise/post) |
| SEALED_COVER | release | M09 concluded + signed | prior status |

### 10.7 Cycle errata state machine (R18)

| Current | Event | Guard | Next |
|---|---|---|---|
| cycle IN_PROGRESS | errata propose | authority | (errata DRAFT) |
| errata DRAFT | impact computed + approve | dual-control | (errata APPROVED) |
| errata APPROVED | apply | txn | cycle ERRATA → IN_PROGRESS (flags re-derived) |

### 10.8 Report-period state machine (R4)

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | RO submit | supervision ≥ min, DSC | SUBMITTED |
| DRAFT | No-Report | supervision < min, signed cert | NO_REPORT |
| SUBMITTED/NO_REPORT | aggregate | all periods resolved | AGGREGATED |

---

## Section 11 — Notifications

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Cycle opened / goals due | Appraisee, RO | in-app, email | PAM_CYCLE_OPEN |
| Goals returned / approved / locked (snapshot) | Appraisee | in-app, email | PAM_GOAL_STATUS |
| Self-appraisal due / returned | Appraisee | in-app, email | PAM_SELF_DUE |
| RO/RvO/AA task assigned | Respective officer | in-app, email | PAM_TIER_TASK |
| Deadline approaching | Owner | in-app, email | PAM_SLA_REMINDER |
| **Authoring right escalated / transferred** | New author, prior officer, HR | in-app, email | PAM_ESCALATION (R9) |
| **No-Report Certificate issued** | HR, RvO, appraisee | in-app | PAM_NO_REPORT (R4) |
| 360 invitation | Rater | email (token link) | PAM_360_INVITE |
| Calibration session scheduled | Committee | in-app, email | PAM_CALIB_SCHED |
| **Calibration recommendation awaiting ratification** | AA/competent authority | in-app, email | PAM_CALIB_RATIFY (R1) |
| **APAR disclosed (mandatory, full) + window opens** | Appraisee | in-app, email | PAM_DISCLOSED (R7,R8) |
| Representation filed / decided / escalated | Authority / Appraisee | in-app, email | PAM_REP_STATUS |
| **Sealed cover applied / released** | HR, AA, Custodian | in-app, email | PAM_SEALED_COVER (R3) |
| **Signature required / completed / revoked** | Acting authority | in-app | PAM_SIGNATURE (R10) |
| **Tamper-check failed** | Custodian, Auditor | in-app, email | PAM_TAMPER_ALERT (R11) |
| **Cycle errata applied (re-derivation/re-disclosure)** | Affected officers, authorities | in-app, email | PAM_ERRATA (R18) |
| **Probation outcome (confirm/extend/discharge)** | Appraisee, HR | in-app, email | PAM_PROBATION (R19) |
| **Legal-heir access granted** | Heir/nominee, Custodian | in-app, email | PAM_HEIR_ACCESS (R15) |
| Grade posted to SR | HR, Custodian | in-app | PAM_SR_POSTED |
| Competency gap → training nominated | Appraisee, HR | in-app | PAM_TRAINING_NOM |
| PIP activated / milestone at-risk / closed | Appraisee, RO, RvO | in-app, email | PAM_PIP_STATUS |
| Unauthorised access attempt | Custodian, Auditor | in-app | PAM_ACCESS_DENIED |

All notifications write to shared `notifications`; no PII values in payloads beyond identifiers; respect quiet hours and user preferences.

---

## Section 12 — Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| Cycle completion funnel | HR, leadership | Counts per form status (incl. SEALED_COVER, ESCALATED), overdue, by org/cadre |
| Rating distribution (pre/post calibration) | HR, AA | Histogram vs target (diagnostic); skew per RO/unit |
| Grading-skew / bias flags | HR | ROs/units beyond deviation threshold |
| **Bias-disparity (equity)** | HR, leadership, Auditor | Adverse-rate / below-benchmark-rate / grade-mean by gender/cadre/region/RO over time, min-N suppressed (R13) |
| **Rater-leniency / central-tendency model** | HR | Cross-cycle RO leniency/severity tendency (R13) |
| Adverse & representation rate | HR, Auditor | Adverse counts, representation volume/outcomes, escalations, SLA breaches |
| **Sealed-cover & escalation report** | HR, Auditor | Sealed-cover population, releases, tier-default escalations (R3, R9) |
| Competency-gap heatmap | HR, L&D (M07) | Gaps by competency/org; nomination conversion |
| 360 participation | HR | Response rates by relationship; suppression flags |
| PIP outcomes | HR | Active/closed PIPs, success rate |
| Probation outcomes | HR | Confirmed/extended/discharge-recommended counts (R19) |
| Benchmark eligibility feed | M06 | Employees meeting/below benchmark per cycle (sealed suppressed) |
| Custody & access audit + hash-verification | Custodian, Auditor | Access events, denied attempts, custody transfers, chain-verify status (R11) |

All analytics respect org scope and min-N suppression; feed M14 via the read API; freshness ≤ 15 min.

---

## Section 13 — Migration & Launch

### 13.1 Data migration

| Source | Target | Approach |
|---|---|---|
| Legacy APAR records (paper/scanned) | E4 + M13 documents | Digitise; capture final grade, label, adverse flag, cycle; link scanned PDF |
| Historical grades | service_register_events (M12) | Back-post as historical events (flagged), preserving original dates |
| Multi-RO history | E19 report periods | Reconstruct part-periods where supervision history exists; else single-period |
| Competency framework | M07 read | Map legacy competencies to M07 catalog |
| Reporting chains | M01 | Reconcile RO/RvO/AA history per cycle |

### 13.2 Migration rules

- Historical records imported in `ARCHIVED` cycle/form status; no re-adjudication.
- Final grades validated against the historical scale (snapshot), not the current scale.
- All migrated APARs default to CONFIDENTIAL; access logged (hash-chained) from import onward.
- Reconciliation report lists unmapped chains/competencies/periods for manual resolution (no silent drops).
- Migrated records without a digital signature are flagged `legacy-unsigned`; new acts require DSC.

### 13.3 Launch plan (phased — R16)

1. **Phase-1 GA (statutory core, no flags):** Pilot one department for one cycle exercising the legally-required path: configure cycle → goals (snapshot) → self → multi-RO RO/RvO/AA (DSC) → mandatory disclosure → representation (+escalation) → post to SR, with sealed-cover, auto-escalation, hash-chained custody and dual-control disposal live.
2. **GA gates:** lock the **grade-derivation contract** and **tier-projection contract** as standalone libraries with their own test suites before any FR agent starts; the **tier-projection 200k load-test (P95 < 500ms)** is a hard GA gate (R14).
3. **Phase-2 (flagged differentiators):** enable `ff_calibration` (as ratified recommendation), `ff_continuous_feedback`, `ff_360` after the statutory core is proven; validate calibration ratification with real authorities.
4. Verify M12/M06/M07/M09/eSign integration end-to-end (including outbox retry, sealed-cover suppression, signature provider outage).
5. Train ROs/RvOs/AAs and custodians; publish confidentiality + sealed-cover + signing SOPs; phased rollout by cadre; monitor SLA/escalation dashboards; cutover legacy capture.

### 13.4 Rollback / contingency

- Outbox enables safe replay if downstream modules lag; pending-signature state holds acts during eSign outage.
- Feature flags per capability (calibration, continuous, 360, bell-curve) for staged enablement; Phase-1 runs with all off.
- Statutory records are append-only and hash-chained; corrections via corrective events / controlled errata, never destructive edits.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state machine)

| FR | Entities | Key APIs | State machine |
|---|---|---|---|
| FR-M08-01 | E1,E2,E3,E4,E19 | /cycles, /open, /templates, /rating-scales | cycle, form(create) |
| FR-M08-02 | E5,E20,E4 | /goals, /approve, /lock, /goal-snapshots | goal, form(goals) |
| FR-M08-03 | E7,E20,E4 | /self-appraisal* | form(self) |
| FR-M08-04 | E8,E19,E23,E4,E9,E20 | /assessment/reporting* | form(RO), report-period |
| FR-M08-05 | E8,E23,E22,E4 | /assessment/reviewing*, /recuse | form(RvO) |
| FR-M08-06 | E8,E23,E21,E4,E3 | /assessment/accepting* | form(AA) |
| FR-M08-07 | E3,E2,E20,E4,E8 | /rating-scales, /grade/preview | (grade engine) |
| FR-M08-08 | E13,E4,E18,E23,docs | /disclose, /acknowledge, /representations, /decide, /escalate, /condone | form(disclosure/rep), representation |
| FR-M08-09 | E14,E21,E15,E22,E23,E4 | /calibration/* (recommend, ratify) | calibration |
| FR-M08-10 | E10,E6,E5 | /feedback, /checkins | (no form transition) |
| FR-M08-11 | E11,E12,E9 | /360/* | 360 request |
| FR-M08-12 | E9,M07,E7 | /competencies*, /nominate | (RO stage) |
| FR-M08-13 | E16,E17,E4 | /pips* | PIP |
| FR-M08-14 | E4,SR(M12),M06,E18 | /finalise, /post-to-sr | form(finalise/post) |
| FR-M08-15 | E18,E23,E4,docs | /pdf, /custody-transfer, /access-log, /verify, /heir-access, /dispose, /downgrade | (custody events) |
| FR-M08-16 | E4,E15,E21,E9,E11/12,M01 | /analytics/* (+ bias-disparity, rater-leniency) | (read-only) |
| FR-M08-17 | E4,E18,E23,M09 | /seal, /seal/release | sealed cover |
| FR-M08-18 | E19,E8,E23,E4 | /report-periods*, /no-report, /aggregate | report-period |
| FR-M08-19 | E8,E19,E4,workflow_tasks | /escalate, /sla-status, /no-report-tier | form(escalation) |
| FR-M08-20 | E23,E8/E15/E18/E19/E21,docs | /signatures, /verify | (signature) |
| FR-M08-21 | E1,E4,SR(M12),M01 | /probation/decide, /probation/extend | form(probation) |
| FR-M08-22 | E1,E3,E4,SR/M06 | /errata/propose, /impact, /approve, /apply | cycle errata |

### 14.2 Dependency graph

```
FR-07 (scale/roll-up) ─┐
FR-20 (DSC) ───────────┼──> hard libraries built first (with FR-15 tier-projection)
FR-15 (projection) ────┘
FR-01 ──> FR-02(+snapshot) ──> FR-03 ──> FR-18(periods) ──> FR-04 ──> FR-05 ──> FR-06 ──> FR-08 ──> FR-14
   │                                                                      │            │
FR-17 (sealed) ── gates FR-06/FR-14 (suppress feed)                       │            │
FR-19 (escalation) ── cross-cuts FR-04/05/06                              │            │
FR-09 (calibration, P2 flag) ── feeds FR-06 ratify / pre-cert ───────────┘            │
FR-10/11 (continuous/360, P2) ── feed evidence into FR-04 (not sole adverse basis)    │
FR-12 (competency) ── part of FR-04, writes M07                                       │
FR-13 (PIP) ── follows FR-06 outcome                                                  │
FR-21 (probation) ── variant of FR-04/05/06 → M01/M12                                 │
FR-22 (errata) ── corrects config, re-derives FR-07/08/14 outputs                     │
FR-16 (analytics) ── reads FR-06/07/09/12/11 + M01 attrs, feeds M14 ──────────────────┘
```

### 14.3 Parallel-agent build plan (phased — R16)

| Wave | FRs (parallelisable) | Phase | Rationale |
|---|---|---|---|
| W0 (hard libraries — gate) | FR-07 (grade engine), FR-20 (DSC), FR-15 (tier projection) | P1 | Built first as standalone, tested libraries; tier-projection 200k load-test is a GA gate before dependents start |
| W1 (foundation) | FR-01, FR-18 (report periods) | P1 | Cycle/forms + multi-RO scaffolding |
| W2 | FR-02 (+snapshot), FR-17 (sealed cover) | P1 | Goals decoupled+snapshot; sealing scaffolding |
| W3 | FR-03, FR-12, FR-19 (escalation) | P1 | Self-appraisal, competency, SLA escalation |
| W4 | FR-04, FR-05, FR-06 | P1 | Tier assessments (sequential within, parallel tooling) — consume DSC + periods + sealed guard |
| W5 | FR-08 (disclosure/representation), FR-13 (PIP), FR-21 (probation) | P1 | Mandatory disclosure + appeal ladder; PIP; probation |
| W6 | FR-14 (posting), FR-22 (errata) | P1 | Posting (sealed-aware) + errata correction |
| W7 (flagged differentiators) | FR-09 (calibration), FR-10, FR-11 | P2 | Behind feature flags after statutory core proven |
| W8 | FR-16 (analytics incl. bias-disparity) | P1/P2 | Reads all; last |

Shared contracts (error catalog, state machines, grade engine, tier-projection, DSC, hash-chain) are built first as libraries to avoid drift across parallel agents.

### 14.4 Final reconciliation table (0 unresolved gaps)

| Concern | Covered by | Status |
|---|---|---|
| Goal setting + cascading + weightage (employee×period) | FR-02 | Resolved |
| Goals decoupled from form + snapshot-on-lock (R6) | FR-02, E5/E20 | Resolved |
| Explicit weightage-policy semantics (R21) | FR-07, E2 | Resolved |
| Self-appraisal | FR-03 | Resolved |
| APAR three-tier (RO/RvO/AA) | FR-04/05/06 | Resolved |
| Multi-RO part-period + No-Report Certificate (R4) | FR-18, E19 | Resolved |
| Rating scales + numeric grading | FR-07 | Resolved |
| Mandatory full disclosure (R7) | FR-08 | Resolved |
| Disclosure/representation clock clarity (R8) | FR-08, E4 | Resolved |
| Representation/appeal + escalation ladder + external (R20) | FR-08, E13 | Resolved |
| Natural-justice adverse-evidence guard (R5) | FR-04/05/06/08, §5.6.14 | Resolved |
| Calibration as ratified recommendation (R1) | FR-09, E21/E15 | Resolved |
| Forced-distribution removed; absolute grading (R2) | FR-09, E14 enum | Resolved |
| COI recusal (R22) | FR-05/06/09, E22 | Resolved |
| Continuous feedback & check-ins | FR-10 | Resolved |
| 360-degree feedback | FR-11 | Resolved |
| Competency assessment + M07 skill-gap→training | FR-12 | Resolved |
| Integrity/attribute columns + pen-picture | FR-04 (E4 fields) | Resolved |
| PIP | FR-13 | Resolved |
| Sealed Cover Procedure (R3) | FR-17, E4, FR-14 suppression | Resolved |
| SLA auto-escalation / authoring transfer (R9) | FR-19 | Resolved |
| Digital signature / non-repudiation (R10) | FR-20, E23 | Resolved |
| Hash-chained tamper-evidence + verify (R11) | FR-15, E18 | Resolved |
| Custody & confidentiality + heir access + dual-control (R15, R23) | FR-15 | Resolved |
| Tier-projection performance gate (R14) | FR-15 LLD, §9, §13.3 | Resolved |
| Apex-chain handling (R12) | FR-01/05/06, E4 | Resolved |
| Probation confirmation appraisal (R19) | FR-21 | Resolved |
| Cycle errata workflow (R18) | FR-22 | Resolved |
| Post final ratings to SR (M12) | FR-14 | Resolved |
| Feed promotion eligibility (M06), sealed-suppressed | FR-14, FR-17 | Resolved |
| Analytics + bias-disparity equity (R13) | FR-16 | Resolved |
| Plain-language role context + why-hidden (R17) | §7.3, FR-04/05/06 | Resolved |
| Phased scope / feature flags (R16) | §13.3, §14.3, §5.5 | Resolved |
| Audit/notifications/workflow reuse | Shared Foundation + all FRs | Resolved |
| Sample data per entity (E1–E23) | Section 5.7 | Resolved |
| Error catalog + envelope | Section 8 | Resolved |
| State machines | Section 10 | Resolved |
| **Unresolved gaps** | — | **0** |

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| APAR | Annual Performance Appraisal Report — statutory confidential appraisal record |
| Appraisee / Officer Reported Upon | Employee whose performance is appraised |
| Reporting Officer (RO) | First-tier appraiser over a part-period |
| Reviewing Officer (RvO) | Second-tier reviewer of the RO's assessment |
| Accepting Authority (AA) | Final certifying authority for the APAR |
| Competent / Adjudicating Authority | Authority (senior to AA) that adjudicates representations / ratifies calibration |
| Condonation Authority | Authority that may admit a late representation |
| Sealed Cover Procedure | Holding an APAR's finalisation and eligibility feed while the officer is under charge / sub judice |
| No-Report Certificate | Record issued where an RO supervised below the minimum period |
| Part-period report | A report covering one RO's supervision span within the year |
| Snapshot-on-lock | The immutable copy of approved goals written into the statutory form at lock |
| Ratified recommendation | A calibration committee proposal a competent authority signs into effect |
| KRA / KPI / OKR | Key Result Area / Key Performance Indicator / Objectives & Key Results |
| Pen-picture | RO's qualitative narrative summary of the officer |
| Integrity column | Statutory certification of the officer's integrity |
| Benchmark grade | Minimum grade qualifying for promotion eligibility |
| Adverse remark | Below-threshold remark/grade requiring disclosure and appealable; must cite disclosable evidence |
| Representation | Officer's formal appeal against adverse/below-benchmark remarks |
| Expunction | Removal of an adverse remark following a successful representation |
| Calibration / Normalisation | Committee moderation surfacing comparability; output is a ratified recommendation |
| Bell curve / Forced distribution | Distribution-based methods; forced distribution is **not supported**; bell curve default-off; distributions are diagnostic only |
| DSC / eSign | Digital Signature Certificate / electronic signature — non-repudiable, distinct from MFA |
| Hash-chain / external anchor | Tamper-evidence mechanism for the disclosure log |
| Dual-control | Maker+checker second-person approval for irreversible actions |
| Legal heir / nominee | Person granted time-boxed APAR access on the officer's death/retirement |
| PIP | Performance Improvement Plan |
| 360-degree feedback | Multi-rater feedback; anonymous and not a sole adverse basis |
| Custody | Statutory confidential safekeeping of APAR records |
| Min-N suppression | Withholding aggregates below a minimum count to protect privacy |
| Outbox | Reliable async write pattern for cross-module posting |
| COI | Conflict of interest requiring recusal |

---

## Section 16 — Appendices

### Appendix A — Sample 10-point APAR scale bands
| Band | Range | Descriptor |
|---|---|---|
| Outstanding | 9.00–10.00 | Exceptional, role-model performance |
| Very Good | 7.00–8.99 | Consistently exceeds expectations |
| Good | 6.00–6.99 | Meets expectations (benchmark) |
| Average | 4.00–5.99 | Partially meets expectations |
| Below Average | 1.00–3.99 | Adverse — improvement required |

### Appendix B — Tier-aware field visibility (illustrative; absent fields carry a reason banner, R17)
| Field | Appraisee (pre-disclosure) | RO | RvO | AA | Auditor |
|---|---|---|---|---|---|
| Goals / self-appraisal | full | full | full | full | full |
| RO remarks/grade (per period) | hidden | full (own period) | full | full | full |
| RvO remarks/grade | hidden | hidden | full | full | full |
| AA final grade | after disclosure | read | read | full | full |
| Integrity remark | after disclosure | author | read | read | full |
| Sealed-cover status | reason-banner only | hidden | hidden | full | full |

### Appendix C — Statutory calendar (illustrative APAR year)
| Milestone | Indicative window |
|---|---|
| Goal setting (employee×period) | Apr–May (period start) |
| Self-appraisal | Apr (period end +) |
| RO assessment (per period) | within 30 days of self |
| RvO review | within 15 days of RO |
| AA acceptance (DSC) | within 15 days of RvO |
| Calibration (Phase-2, if enabled) | pre-certification or post-cert ratification |
| Disclosure (mandatory, full) | within 15 days of acceptance |
| Representation window | within statutory days of dispatch/acknowledgement (per config) |
| Disposal deadline (authority) | within statutory days of filing |
| Posting to SR | after representation resolution and not sealed |

### Appendix D — Assumptions & open items
- Exact statutory representation window, disposal deadline and condonation authority are configuration, set per jurisdiction at deployment (`representation_window_days`, `disposal_deadline_at`, Condonation Authority role).
- `representation_clock_start` (dispatch vs acknowledgement) is a per-jurisdiction config choice (R8); deemed-disclosure still opens the window.
- Competency catalog and role-required levels are owned by M07; M08 consumes snapshots.
- Adjudicating-authority seniority and apex chain-truncation rules are configurable to the deploying government's service rules (R12).
- Minimum supervision threshold for a No-Report Certificate defaults to 3 months and is configurable (R4).
- The eSign/DSC provider (DSC token / Aadhaar-eSign / HSM) and external anchoring service are environment-specific (R10, R11).

### Appendix E — Reuse confirmation
This BRD reuses, without redefining, the Shared Foundation canonical entities (`employees`, `users`, `org_units`, `designations`, `cadres`, `roles`, `permissions`, `audit_log`, `documents`, `notifications`, `workflow_instances`, `workflow_tasks`, `service_register_events`) and conventions (IDs, audit fields, statuses, time/locale, pagination, maker-checker, RBAC baseline, technical defaults, error envelope). Module-specific entities E1–E23 extend, and do not conflict with, the shared model.

### Appendix F — Council adopted-improvement → risk mapping (quick index)
| Risk | Adopted improvement | Primary FR/Entity |
|---|---|---|
| R1 | Calibration as ratified recommendation | FR-09, E21, E15 |
| R2 | Remove forced distribution; bell-curve off | FR-09, E14 |
| R3 | Sealed Cover Procedure | FR-17, E4 |
| R4 | Multi-RO part-period + No-Report | FR-18, E19 |
| R5 | Adverse-evidence natural-justice guard | FR-04/05/06/08 |
| R6 | Decouple goals; snapshot-on-lock | FR-02, E5, E20 |
| R7 | Mandatory full disclosure | FR-08 |
| R8 | Disclosure clock clarity | FR-08, E4 |
| R9 | Auto-escalation on tier default | FR-19 |
| R10 | Digital signature / non-repudiation | FR-20, E23 |
| R11 | Hash-chained tamper-evidence | FR-15, E18 |
| R12 | Apex-chain handling | FR-01/05/06, E4 |
| R13 | Bias-disparity analytics | FR-16 |
| R14 | Tier-projection performance gate | FR-15, §9 |
| R15 | Heir custody + retention vs erasure | FR-15 |
| R16 | Phase the scope | §13.3, §14.3 |
| R17 | Plain-language role context | §7.3 |
| R18 | Cycle errata workflow | FR-22 |
| R19 | Probation appraisal semantics | FR-21 |
| R20 | Representation escalation ladder | FR-08, E13 |
| R21 | Weightage-policy semantics | FR-07, E2 |
| R22 | Broaden COI / recusal | E22, FR-09 |
| R23 | Dual-control on irreversible actions | FR-15 |








