# Performance Appraisal Management — Government HRMS Module BRD (G08, v3.0 · platform-grounded)

**Module code:** G08 (alias `GOV-M08`; supersedes `M08-PAM`) — see `MODULE_RECONCILIATION.md` §B.
**Program:** Government HRMS — a public-sector configuration and extension of the **PrimeSoft HRMS** platform (Vision §1.1), hosted at the CGG Data Centre / government cloud (Standalone / Group-Company deployment model, Vision §1.4).
**Document version:** v3.0 (platform re-grounded on PrimeSoft Master BRD v2.1 · Vision v2.6 · Platform Spec v1.6 · RBAC v1.7 · Foundation FS v1.6).
**Status:** Approved for build, conditional on v3 amendments (platform-native, parallel-agent ready) — Phase-1 statutory core + Phase-2 flagged differentiators.
**Supersedes:** v2.0 (`/Users/n15318/hrms/docs/brd/v2/M08-performance-appraisal-management.md`) and v1.0.
**Relationship to platform:** **EXTEND of PrimeSoft `M09` Performance Management** (`MODULE_RECONCILIATION.md` §A row G08; Master BRD §4.10/§5.8). PrimeSoft **already ships** the appraisal-period configuration, goal plans (OKR — one active plan per employee, auto-opened 30 days before the prior plan ends), 12 monthly goal cycles + 12 monthly review cycles, self & manager review, skip-level & HR calibration, rating & contribution-level assignment, probation confirmation, PIP tracking and Multi-Source Feedback — governed by **`VAL-WEIGHTAGE/WSUM/SUBWSUM/DISTRIB/ACHV/GOALNAME`**, the **`JOB-M09-*`** job family and the **`MSG-M09-*`** notification templates. G08 therefore **reuses the existing M09 goal/review/calibration/probation model** and **adds the public-sector statutory APAR layer on top**: the multi-tier **Reporting → Reviewing → Accepting** adjudication, **mandatory full disclosure**, **representation against adverse remarks**, the **Sealed Cover Procedure**, **multi-RO part-period reports + No-Report Certificate**, **digital-signature non-repudiation**, statutory **custody/retention**, and posting to the **G12 Service Register ledger**. Every one of those extensions runs on the platform engines — workflow on **P01**, authz/confidentiality on **P02**, audit on **P05**, notifications on **X.2**, jobs on **X.1**, migration on **P06**, configured forms/flows on **W.1/W.2/W.3**.
**Grounding contract:** This BRD **consumes** the PrimeSoft platform contracts by id and **never re-authors** them (`PLATFORM_FOUNDATION.md` §1, §9). Platform/M09 entities (`workflows`/`workflow_instances`/`workflow_actions`, `audit_log`/`security_audit_log`, `notifications`, `documents`, `consent_records`, `integration_credentials`, `migration_runs`, `employees`/`org_units`/`roles`/`designations`/`contribution_levels`, **M09 `goal_plans`/`goals`/`review_cycles`/`review_templates`/`goal_plan_templates`/`calibration_sessions`/`performance_reviews`/PIP/MSF**) are **referenced/extended, not redefined**. Where the platform genuinely lacks a government capability it is marked **`GAP (gov-specific)`** and authored here, still running on the named engines.

---

## Section 1 — Executive Summary

### 1.1 Purpose

Performance Appraisal Management (**G08**) is the system of engagement and adjudication for measuring, recording, moderating and certifying employee performance across an annual (and continuous) cycle, **built as a platform-native extension of PrimeSoft M09**. It unifies two worlds that government HR has historically kept apart:

1. **Modern continuous performance management (CPM)** — OKR/KRA goal-setting, cascading objectives, real-time feedback, check-ins, Multi-Source (360) feedback, competency assessment, and calibration — **already provided by PrimeSoft M09** and reused here (goal plans, review cycles, `VAL-WEIGHTAGE/WSUM`, `JOB-M09-PLAN-OPEN/REVIEW-OPEN/CALIB`, `MSG-M09-*`).
2. **The statutory APAR process** — a confidential, multi-tier adjudicated record authored by one or more **Reporting Officers** (over part-periods), scrutinised by a **Reviewing Officer**, certified by an **Accepting Authority**, with numeric grading, the integrity/attribute columns, the pen-picture, **mandatory full disclosure** to the officer reported upon, the right of **representation/appeal**, the **Sealed Cover Procedure**, **digitally-signed (DSC/eSign) non-repudiable** certification, and posting of the final grade to the **G12 Digital Service Register** — authored here as the **gov-specific extension** running on **P01/P02/P05**.

### 1.2 What changed in v3 (platform re-grounding) and v2 (architecture)

**v3** re-anchors the module onto PrimeSoft: appraisal cycles, goal plans, review cycles, calibration and probation are **reconciled to the existing M09 model** (not forked); the APAR multi-tier workflow runs on the **P01 WorkflowEngine** (`SEQUENTIAL` + `DYNAMIC_APPROVER` patterns with reporting-chain approver resolution); confidentiality/field masking is the **P02 PII Protection Ceiling + field-mask-on-serialization**, not a bespoke projection; the invented per-form hash-chain is replaced by the **P05 dual-log DB-trigger audit substrate** plus the platform's proposed **OPEN-PLAT-03** hash-chaining-to-WORM; the invented error codes/envelope are replaced by the **platform 8-code table + `{error:{code,message,field,details}}` + `X-Correlation-Id`**; every entity carries **`tenant_id`/`entity_id`**; notifications ride **X.2/W.3**; migration runs on **P06**. The full v2→v3 delta is catalogued in **Amendments (v2 → v3)** after §16, and the FR→service map in **Alignment with PrimeSoft Platform**.

**v2** (preserved) resolved the council's highest-severity finding: the continuous-performance subsystem and the statutory-APAR subsystem are **separated and bridged by an immutable snapshot-on-lock**, not fused on one row; **calibration is a ratified recommendation** (committee recommends, authority ratifies with step-up + signature); **forced ranking is removed** (absolute grading); and named statutory procedures (Sealed Cover, multi-RO part-period + No-Report Certificate, auto-escalation, digital signature, tamper-evidence, apex-chain handling, probation confirmation, representation escalation ladder) are first-class.

### 1.3 Business outcomes

| Outcome | Measure |
|---|---|
| Timely cycle completion | ≥ 95% of APARs certified within the statutory calendar window |
| Goal alignment | ≥ 90% of employees with approved, weighted, cascaded goals before cycle mid-point |
| Procedural fairness | 100% of adverse remarks disclosed and substantiated by disclosable evidence; 100% of representations adjudicated within SLA |
| Defensible moderation | Every calibration recommendation carries a recorded rationale and an authority's ratification signature |
| Statutory integrity | 100% of final grades posted to the **G12 SR ledger** as append-only events on the **P05** substrate |
| Non-repudiation | 100% of tier certifications, disclosure acknowledgements and expunctions carry a verifiable digital signature |
| Equity | DPDP-safe adverse-rate / below-benchmark disparity monitored by gender / cadre / region / RO across cycles (min-N suppressed) |
| Workforce insight | Real-time rating-distribution and skew analytics for every org unit, scoped by P02 |

### 1.4 Scope at a glance

In scope: appraisal-cycle configuration (**reusing M09 appraisal periods / review cycles / goal plans**); APAR templates as **W.2 form definitions**; goal/KRA/KPI/OKR management at employee×period with snapshot-on-lock (**reusing M09 `goals`/`goal_plans` + `VAL-WEIGHTAGE/WSUM/SUBWSUM/ACHV/GOALNAME`**); self-appraisal (**M09 self review**); **multi-RO part-period APAR** three-tier workflow on **P01**; rating scales and numeric grade computation with explicit weightage-policy semantics; **mandatory full disclosure** and representation/appeal with an escalation ladder; **calibration as ratified recommendation** (**extends M09 calibration**, `VAL-DISTRIB` diagnostic-only); continuous feedback and check-ins (**M09 continuous manager feedback + two-way thread**); Multi-Source/360 feedback (**M09 MSF**); competency assessment with skill-gap → **G07** training linkage; **Sealed Cover Procedure**; **SLA auto-escalation / authoring-right transfer** (**`JOB-M09-SLA`**); **digital signature / non-repudiation** (`GAP`, via X.3 eSign + P05); **probation confirmation appraisal** (**M09 probation + `JOB-M09-PROBATION`**); **cycle errata correction**; custody/confidentiality on **P05/OPEN-PLAT-03** with heir access; posting final ratings to **G12** and feeding promotion eligibility to **G06** by reference (suppressed under sealed cover); performance and bias-disparity analytics (feed **G14**).

Out of scope (owned elsewhere / by the platform): the employee master (**G01 / PrimeSoft M01**), training delivery (**G07**), promotion decisioning (**G06**), disciplinary proceedings (**G09**), payroll/increment posting (**G10**), the Service Register ledger itself (**G12**, on P05), the document object store (**G13 / PrimeSoft M11**), and **the workflow/RBAC/audit/notification/job/migration/configured-content engines themselves** (**P01/P02/P05/X.1/P06/W** — configured, never re-implemented).

### 1.5 Key design principles

- **Extend, don't fork.** Goal plans, review cycles, calibration, probation and PIP are the **existing PrimeSoft M09 entities**; G08 adds the statutory APAR adjudication layer over them.
- **Two subsystems, one identity.** Continuous performance (open, employee-owned, cross-cycle) and the statutory APAR (closed, adjudicated, append-only) share identity and analytics but are bridged only by a one-way **snapshot-on-lock**. The legal record never live-references mutable goals.
- **Authority owns the grade, not the committee.** Calibration produces recommendations; only a competent grading authority mutates a certified grade, always with P02 step-up + digital signature.
- **Absolute grading.** Statutory grading is merit-based and absolute; `VAL-DISTRIB` target distributions are diagnostic only. Forced distribution is not supported.
- **Confidentiality by construction.** The **P02 PII Protection Ceiling** + **field-mask-on-serialization** strip fields the caller's tier/role may not see (fields *absent*, not greyed), with plain-language "why hidden" reasons; the platform read NFR (p95 < 500 ms) holds at 200k scale.
- **Append-only, audit-grade certification.** Certification and custody events are captured by the **P05 dual-log DB trigger** (immutable, 7-yr); statutory-grade tamper-evidence tracks **OPEN-PLAT-03** (hash-chain head to WORM), not a parallel invented mechanism.
- **Separation of duties + declared COI.** Maker ≠ checker at every tier, enforced by **P01/P02**; structural self/chain exclusion is extended to declared conflict-of-interest recusal.
- **Configurable, not hard-coded.** Scales, weightages, benchmarks, workflows (W.1), forms (W.2), disclosure timing, chain-truncation rules and retention are configuration, versioned per cycle (config cascade `platform → tenant → entity → employee`), correctable through a controlled errata path; in-flight instances pin their definition version (P01).

---

## Section 1A — Amendments (v1 → v2) *(preserved from v2)*

| # | Adopted improvement (Risk) | Incorporated in | How |
|---|---|---|---|
| 1 | Calibration as ratified recommendation (R1) | E21 `calibration_recommendations`; FR-G08-09; §10.5; RBAC; E15 requires `recommendation_id`+ratification | Committee recommends; AA/competent authority ratifies with step-up + DSC, or calibration runs pre-certification. No autonomous committee grade mutation. |
| 2 | Remove `FORCED_DISTRIBUTION`; default-off `BELL_CURVE` (R2) | E14 enum; FR-G08-09; §5.5; Glossary | `calibration.method`=COMMITTEE_REVIEW/NORMALISATION/BELL_CURVE(off). `VAL-DISTRIB` target is diagnostic-only; grading absolute. |
| 3 | Sealed Cover Procedure (R3) | FR-G08-17; E4 `sealed_cover*`; state SEALED_COVER; G09 boundary; FR-G08-14 suppression | G09 charge/sub-judice seals the form; finalisation blocked and G06 feed suppressed until conclusion; release is signed. |
| 4 | Multi-RO part-period + "No Report Certificate" (R4) | FR-G08-18; E19 `appraisal_report_periods`; E4 `has_multi_ro`; FR-G08-04 aggregation; §5.6 | Per-period RO/grade/supervision-months; min-supervision triggers No-Report; supervision-weighted aggregation. |
| 5 | Natural-justice guard on adverse remarks (R5) | FR-G08-04/05/06/08 BRs; `VAL-G08-ADVEVID`; §5.6 rule 14 | An adverse/below-benchmark entry must cite disclosable evidence; anonymous MSF/restricted feedback cannot be the sole basis. |
| 6 | Decouple goals/OKRs from form; snapshot-on-lock (R6) | E5 (`form_id` nullable + cycle ownership); E20 `form_goal_snapshots`; FR-G08-02; FR-G08-07 roll-up | Goals live at employee×cycle on the M09 model; lock writes an immutable snapshot into the form; roll-up reads the snapshot. |
| 7 | Mandatory full-APAR disclosure (R7) | FR-G08-08 BR1; §5.5 cycle config; §10.1 | Entire report incl. every grading disclosed to every officer; only channel/timing configurable, never *whether*. |
| 8 | Disclosure / representation clock clarity (R8) | FR-G08-08; E4 `dispatched_at`,`representation_clock_start`,`representation_window_start_at` | Clock-start (dispatch vs ack) explicit per jurisdiction; both timestamps recorded; deemed-disclosure (`JOB-M09-AUTOACK`) still opens the window. |
| 9 | Auto-escalation on tier default (R9) | FR-G08-19; §10.1; §11; **`JOB-M09-SLA`** | On missed RO/RvO/AA window, authoring right transfers or a "No Report due to RO/RvO" is recorded — not just a reminder. |
| 10 | Digital signature / non-repudiation (R10) | FR-G08-20; E23 `digital_signatures` (`GAP`); E8/E18 refs; §9 | DSC/eSign (distinct from MFA) on certification, ack, ratification, expunction, No-Report, sealed-release, disposal — via X.3 provider + P05. |
| 11 | Engineer tamper-evidence (R11) | FR-G08-15; E18; **P05 + OPEN-PLAT-03**; verify endpoint | Append-only ledger on the P05 substrate + OPEN-PLAT-03 hash-chaining-to-WORM + `/verify`; replaces the invented bare hash-chain. |
| 12 | Apex-officer chain handling (R12) | FR-G08-01/05/06; E4 `chain_truncated`/`chain_config`; `VAL-G08-CHAIN` | Configurable truncated-chain rule (designated alternates / single-tier); never a silent "all four distinct" failure. |
| 13 | Bias-disparity analytics (R13) | FR-G08-16; §12 | DPDP-safe adverse/below-benchmark/grade-mean by gender/cadre/region/RO over time (min-N suppressed) + rater-leniency model. |
| 14 | Tier-projection performance gate (R14) | FR-G08-15; §9; §13 GA gate | P02 field-mask serving from cache/pre-computed columns; platform read p95 < 500 ms at 200k load is a hard GA gate. |
| 15 | Deceased/heir custody + retention-vs-erasure (R15) | FR-G08-15; event `HEIR_ACCESS`; §9 Retention | Legal-heir/nominee access path; statutory retention overrides DPDP erasure (P05 redaction-marker basis). |
| 16 | Phase the scope (R16) | §13.3; §14.3; §5.5 flags (RBAC §4.3) | Phase-1 GA = statutory core; continuous (FR-10), MSF/360 (FR-11), calibration (FR-09) capability-flagged Phase-2. |
| 17 | Plain-language role context + "why hidden" (R17) | §7.2/§7.3; FR-G08-04/05/06; leak-prevention control | Workbench states each user's tier in plain language and shows a reason banner where P02 masks fields. |
| 18 | Cycle errata workflow (R18) | FR-G08-22; §10.7; `ERR-G08-ERRATA` | Controlled cycle-correction/re-derivation for config errors mid-cycle, audited and re-notified. |
| 19 | Probation appraisal semantics | FR-G08-21; E1 probation fields; E4 `probation_outcome`; **`JOB-M09-PROBATION`** → G01/G12 | `PROBATION` cycle yields confirmation/extension outcome fed to G01 + G12, distinct from annual APAR. |
| 20 | Representation escalation ladder + external reference | FR-G08-08; E13 `condonation_*`,`disposal_deadline_at`,`external_reference`,`escalation_level`; §10.3 | Statutory disposal deadline, condonation authority, external tribunal (CAT) handoff close the appeal chain. |
| 21 | Clarify weightage-policy semantics | FR-G08-07; E2 `weightage_policy`; §5.6 rule 1; **`VAL-WEIGHTAGE/WSUM/SUBWSUM`** | DEVELOPMENT goals + competencies sit outside the 100% performance sum; goal-vs-competency split + roll-up formula defined. |
| 22 | Broaden COI / recusal | E22 `coi_recusals`; FR-G08-09; §3 hard rule (P02) | Self/chain exclusion extended to declared COI with recorded recusal for adjudicators and calibration members. |
| 23 | Dual-control on irreversible actions | FR-G08-15; `ERR-G08-DUALCTRL`; §9 | Retention disposal and confidentiality downgrade require a second-person approval (P01 maker-checker) in addition to step-up. |

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Description | Primary FRs | Platform basis | Phase |
|---|---|---|---|---|
| Cycle & template administration | Appraisal cycles (M09 periods/review cycles), eligibility, calendar, APAR forms (W.2), scales, chain-truncation | FR-G08-01, FR-G08-07 | M09 + W.2 + `JOB-M09-PLAN-OPEN/REVIEW-OPEN` | P1 |
| Goal / objective management | Employee×period KRA/KPI/OKR (M09 goals), cascading, weightages, snapshot-on-lock, mid-year revision | FR-G08-02 | M09 `goals`/`goal_plans` + `VAL-WEIGHTAGE/WSUM/SUBWSUM/ACHV/GOALNAME` | P1 |
| Self-appraisal | Officer's self-assessment (M09 self review) | FR-G08-03 | M09 review | P1 |
| APAR adjudication workflow | Multi-RO part-period → Reviewing → Accepting tier flow | FR-G08-04/05/06 | **P01** SEQUENTIAL/DYNAMIC_APPROVER | P1 |
| Grading & rating | Scales, weightage-policy roll-up, benchmark/adverse detection, M09 rating/contribution-level | FR-G08-07 | M09 rating + `VAL-WEIGHTAGE` | P1 |
| Disclosure & representation | Mandatory full disclosure; appeal with escalation ladder; expunction | FR-G08-08 | P01 + X.2 + P05 | P1 |
| Calibration & moderation | Committee recommendation + normalisation; AA ratification | FR-G08-09 | M09 calibration + `VAL-DISTRIB` (diagnostic) | P2 (flag) |
| Continuous feedback & check-ins | Real-time feedback, periodic check-ins, two-way thread | FR-G08-10 | M09 continuous feedback | P2 (flag) |
| Multi-Source / 360 feedback | Multi-rater nominations and aggregation | FR-G08-11 | M09 MSF | P2 (flag) |
| Competency assessment | Competency rating + skill-gap → G07 training | FR-G08-12 | M09 + G07 | P1 |
| Performance Improvement Plan | PIP creation, milestones, outcome | FR-G08-13 | M09 PIP | P1 |
| Downstream posting | Post final grade to **G12**; feed eligibility to **G06** (sealed-aware) | FR-G08-14 | G12 (P05) + G06 by reference | P1 |
| Custody & confidentiality | Disclosure/custody ledger (P05/OPEN-PLAT-03), P02 masking, heir access, retention, dual-control | FR-G08-15 | P02 + P05 + G13 | P1 |
| Analytics | Rating distribution, skew, completion, gap, bias-disparity | FR-G08-16 | feeds G14 | P1/P2 |
| Sealed Cover Procedure | G09-driven sealing; finalise/feed suppression; signed release | FR-G08-17 | G09 + P01 | P1 |
| Multi-RO part-period reports | Per-period RO/grade; No-Report Certificate; aggregation | FR-G08-18 | P01 + `VAL-G08-SUPV` | P1 |
| SLA auto-escalation | Authoring-right transfer on tier default | FR-G08-19 | **`JOB-M09-SLA`** + P01 SLA runtime | P1 |
| Digital signature / non-repudiation | DSC/eSign on certify/ack/ratify/expunge/dispose | FR-G08-20 | `GAP`: X.3 eSign + P04 creds + P05 + G13 | P1 |
| Probation confirmation appraisal | Confirmation/extension outcome to G01/G12 | FR-G08-21 | M09 probation + `JOB-M09-PROBATION` | P1 |
| Cycle errata / correction | Controlled mid-cycle re-derivation | FR-G08-22 | P01 maker-checker | P1 |

### 2.2 Common Capabilities (inherited from the platform, applied throughout)

- **Audit (P05):** every INSERT/UPDATE/soft-DELETE on a G08 business table fires the **P05 DB trigger** writing one immutable `audit_log` row; auth/permission/admin events go to `security_audit_log`. Reading an APAR audit row is itself audited (P05). G08 **does not define its own `audit_log`** (override per `MODULE_RECONCILIATION.md` §C).
- **Workflow (P01):** APAR tier transitions, representation flow, calibration ratification, sealed-cover, errata maker-checker and auto-escalation run as **configured P01 flows** (`startInstance/advance/approve/reject/sendBack/delegate/cancel`, each idempotent; `workflow_actions` not `workflow_tasks`; 5 patterns Appendix D; in-flight version pinning). G08 supplies the state machines (§10) as flow definitions.
- **Authz + confidentiality (P02):** every query calls `Authorization.check`; APAR field confidentiality is the **PII Protection Ceiling + field mask on serialization** (FR-P02-002), so an over-broad query cannot leak a masked field; scoping across the five dimensions (reporting chain, `org_unit`, UAG, contribution level, entity); an unscoped query is **rejected, not defaulted to all**.
- **Documents (G13):** supporting evidence, signed APAR PDFs, acknowledgements and signature artefacts reference platform `documents.document_id`.
- **Notifications (X.2 / W.3):** all task assignments, disclosures, escalations and deadlines resolve recipients via **W.3** and dispatch via **X.2** (IN_APP + EMAIL parallel; statutory notices mandatory/non-suppressible); templates by **`MSG-M09-*`** (reused) and module-unique **`MSG-G08-*`**.
- **Service Register (G12):** final grades, sealed-cover and adverse-remark events post to the **G12 `service_register_events`** ledger on the **P05** substrate.
- **Pagination/idempotency/correlation:** **cursor only** (`?limit=` default 25/max 100 + `cursor=` → `next_cursor`); **`Idempotency-Key`** on unsafe POSTs (24h replay); **`X-Correlation-Id`** echoed and audited.
- **i18n / soft-delete / UTC:** UTC storage, `DD-MMM-YYYY` display; soft-delete `is_deleted` (append-only ledgers exempt); no hard delete (Platform §8.2).

### 2.3 Boundaries & integration points

| Boundary | Direction | Contract |
|---|---|---|
| G01 / PrimeSoft M01 Employee Master | read / write(feed) | Identity, designation, cadre, reporting chain, `contribution_level`, status (read); probation confirmation outcome (write feed) |
| G06 Promotion/Progression | write (feed, by reference) | Final grade + benchmark eligibility flag per cycle; **suppressed while `sealed_cover=true`**; corrective on representation/expunction |
| G07 Training & Skill | read/write | Competency framework (read); skill-gap nominations (write); consumes G08 development-gap feed |
| G09 Disciplinary | read (event/subscribe) | Active charge / sub-judice / penalty status → **Sealed Cover** and APAR holds; conclusion event releases sealed cover |
| G12 Digital SR | write | Append-only `service_register_events` (final grade, sealed-cover, adverse remarks) on the P05 substrate |
| G13 / PrimeSoft M11 Documents | read/write | Evidence, generated APAR PDF, acknowledgements, DSC/eSign artefacts |
| G14 / PrimeSoft M16 Analytics | read | Rating-distribution and bias-disparity facts for cross-module dashboards |
| eSign/DSC provider | call (X.3) | DSC token / Aadhaar-eSign / HSM signing (FR-G08-20); credentials from **P04 `integration_credentials`** |

### 2.4 Explicit exclusions

The module does **not** compute increments/pay (G10), **not** decide promotions (only feeds eligibility to G06 by reference), **not** run disciplinary inquiries (G09 — it only consumes G09 charge status to seal a cover), and **not** define the competency catalog (consumes G07's). Forced-distribution / quota-driven grading is explicitly **out of scope**. It does **not** re-implement the workflow/RBAC/audit/notification/job/migration/configured-content engines (P01/P02/P05/X/P06/W).

---

## Section 3 — Roles & Permissions

### 3.1 Roles as RBAC v1.7 ADDITIONS (no parallel scheme)

The access-control **model** is owned by **RBAC v1.7**; G08 expresses its actors as **existing roles + new gov roles + capability flags ADDED to the taxonomy** (RBAC §2.2/§4.3), enforced by **P02**. SoD (maker ≠ checker, no self-approval) is enforced by **P01/P02**, never re-implemented (`PLATFORM_FOUNDATION.md` §6.6; `MODULE_RECONCILIATION.md` §C). The APAR tier authorities are resolved at runtime by **P01 approver resolution** (reporting-chain position / named role / cost-centre head). Auditor maps to **Org-Admin read + read-only entitlement**; System Administrator maps to **Org Admin / Platform Super Admin**.

| G08 actor | Expressed in RBAC v1.7 as | Notes |
|---|---|---|
| Officer Reported Upon (Appraisee) | existing **Employee** (RBAC §2.4) | Sets goals, self-appraises, views/represents APAR after disclosure. **Me** workspace. |
| Reporting Officer (RO) | existing **Manager L1** + P01 reporting-chain position; capability flag `g08.reporting-officer` | First-tier appraiser over a **part-period**; approves goals, writes assessment, integrity/pen-picture, part-period grade. **My Team** workspace. |
| Reviewing Officer (RvO) | **Skip-level Manager / HOD** + new flag `g08.reviewing-officer` | Second-tier; concurs/varies with recorded reasons. |
| Accepting Authority (AA) | **new role `g08_accepting_authority`** (Appointing-Authority analogue, RBAC §2.2) | Final certifying authority; settles grade, ratifies calibration, triggers disclosure; signs with DSC. |
| Competent / Adjudicating Authority | **new role `g08_competent_authority`** (senior to AA) | Adjudicates representations; may ratify calibration where designated; not in the appraisee's chain. |
| Condonation Authority | **capability flag `g08.condonation`** | Authorises acceptance of a late representation. |
| Calibration Committee Member | **new flag `g08.calibration-member`** on Performance Admin / HOD (extends M09 HR calibration) | Proposes/votes **recommendations**; never mutates a certified grade. |
| HR / APAR Cell Officer | existing **HR Admin** + **Performance Admin** (`performance_admin`, M09) | Administers cycles, custody, disclosure dispatch, representation routing, errata (non-adjudicating). **Admin** workspace. |
| APAR Custodian | **new role `g08_apar_custodian`** (aligns with G12 SR Custodian / Document Admin pattern) | Confidential custody, retention, expunction execution, heir-access grants. |
| Dual-Control Approver | **capability flag `g08.dual-control`** (second custodian/HR) | Second-person approval for disposal and confidentiality downgrade (P01 checker). |
| Legal Heir / Nominee | **time-bound individual entitlement** (RBAC §3.2; external, scoped) | Time-boxed read access to a deceased/retired officer's APAR per statute. |
| Auditor (read-only) | **Org-Admin read + read-only entitlement** (RBAC §3.2; P05 query access) | Read APAR + audit log + chain-verify; no write. No parallel "Auditor" write role. |
| System Administrator | **Org Admin / Platform Super Admin** (RBAC §2.1) | Configures scales, templates (W.2), workflows (W.1), RBAC, chain-truncation, feature flags; no self-adjudication. |

**Capability flags to register in RBAC §4.3 (working-group process, RBAC §14):** `g08.reporting-officer`, `g08.reviewing-officer`, `g08.condonation`, `g08.calibration-member`, `g08.dual-control`, `g08.feature-flags`.

### 3.2 Permission matrix (C=Create, R=Read, U=Update, D=Soft-Delete/Withdraw, A=Approve/Adjudicate, S=Sign, X=No access)

> Enforcement is by **P02 `Authorization.check`** (deny-by-default → role grant → multi-role INTERSECTION → individual entitlement → capability flag → **PII Protection Ceiling** → data-scope filter → **field mask on serialization**). The matrix is the **model input**, owned with RBAC; P02 enforces it.

| Capability | Appraisee | RO | RvO | AA | Competent Auth | Calib. Member | HR/APAR Cell | Custodian | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Configure cycle / template (W.2) / scale / chain rules | X | X | X | X | X | X | C R U | R | R | C R U |
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
| Condone late representation | X | X | X | R | A | X | R (flag) | X | R | X |
| Seal / release Sealed Cover | X | X | X | R | A | X | C A | A S | R | X |
| Create / manage PIP | R (own) | C R U A | A | R | R | X | R | X | R | X |
| Continuous feedback / check-in | C R (own+given) | C R U | C R | R | R | X | R | X | R | X |
| MSF/360 feedback respond | C R (assigned) | C R | C R | R | R | X | C R U | X | R | X |
| Competency assessment | R (own) | C R U | R | A | R | X | R | X | R | X |
| Post grade to SR (G12) / feed G06 | X | X | X | trigger | R | X | A | A | R | X |
| Dispose / downgrade confidentiality | X | X | X | X | R | X | A (maker) | A (maker) | R | X |
| Approve disposal/downgrade (2nd person) | X | X | X | X | A | X | A (checker) | A (checker) | R | X |
| Grant legal-heir access | X | X | X | R | A | X | A | A S | R | X |
| View analytics | R (own only) | R (team) | R (org) | R (org) | R (org) | R (calib scope) | R (org) | X | R | R |
| Verify chain integrity (OPEN-PLAT-03) | X | X | X | R | R | X | R | R | A | R |
| Access disclosure/custody log | R (own) | X | X | R | R | X | R | R A | R | R |

**Hard rule (SoD + COI, enforced by P01/P02).** A user holding multiple roles is blocked at `Authorization.check` from acting on an APAR where they are the appraisee, or any other tier in the same chain (self-adjudication and adjacent-tier conflict prevention; multi-role **intersection** = more restrictive wins). **In addition**, an adjudicating authority or calibration member with a declared conflict of interest (spouse / close relation / same direct prior posting / financial) must record a recusal (`E22 coi_recusals`) and is blocked from acting on that form. Multi-role callers receive the **lowest-privilege** field mask on serialization.

---

## Section 4 — Shared Platform Foundation (consumed, not redefined)

G08 inherits the PrimeSoft platform contracts (`PLATFORM_FOUNDATION.md` §4–§8) and the existing **M09 Performance** business model. It authors only the statutory APAR extension logic.

- **Frontend:** Behaviour/NFR specified here; physical stack (React/TS/Tailwind/shadcn) is an engineering choice within the platform's logical architecture (`MODULE_RECONCILIATION.md` §C). WCAG 2.1 AA across screens; canonical UI-state standard (empty/loading/error/no-permission/partial-data; masked fields per RBAC; `E·AR` request-change) per Foundation §3.
- **API:** REST under **`/api/v1`**; **cursor pagination**; **`Idempotency-Key`**; **`X-Correlation-Id`**; **canonical error envelope `{error:{code,message,field,details}}`** with the **8-code standard table** (Foundation §1; §8 below). Endpoints never re-implement permission logic — they call **`Authorization.check`** (P02). Effective-dated mutations accept `effective_from` (staged via `VAL-EFFECTIVE`).
- **Datastore:** PostgreSQL with **`tenant_id`/`entity_id`** on every table and data-layer scoping; object storage via **G13**.
- **Auth/session:** Bearer JWT carrying resolved roles + tenant/entity scope (P02); **MFA enforced for high-privilege statutory roles** (AA, Competent Authority, Custodian) per Vision §2.2; **MFA step-up** authenticates the session and the **digital signature** binds the record (distinct controls).
- **Workflow:** **P01 WorkflowEngine** for all tier/representation/calibration/sealed-cover/errata/escalation flows; APAR multi-tier expressed as `SEQUENTIAL` with `DYNAMIC_APPROVER` reporting-chain resolution.
- **Authz/confidentiality:** **P02** — APAR CONFIDENTIAL content protected by the **PII Protection Ceiling + field-mask-on-serialization**; tier-aware visibility is a P02 field-mask, not a bespoke projection.
- **Audit:** **P05** dual-log, DB-trigger, immutable, ≥ 7-yr retention; statutory-grade tamper-evidence tracks **OPEN-PLAT-03** (hash-chain head to WORM) — G08 invents no parallel mechanism.
- **Security/compliance:** OWASP ASVS L2; TLS 1.2+; encryption at rest; India DPDP Act 2023 alignment; APAR content classified **CONFIDENTIAL**; statutory retention overrides the DPDP erasure right (P05 redaction-marker basis recorded, FR-G08-15).
- **Integration:** **X.3** for the eSign/DSC provider and any external anchoring; credentials from **P04 `integration_credentials`**; circuit-breaking, outbound idempotency, payload versioning.
- **Jobs:** **X.1** runner; G08 **reuses `JOB-M09-PLAN-OPEN/REVIEW-OPEN/CALIB/CLOSE/NOTIFY/AUTOACK/PROBATION/SLA`** and registers module-unique **`JOB-G08-*`** (SR posting, sealed-cover monitor, representation-disposal SLA, chain anchor).
- **Migration:** **P06** ETL+V — three staging dry runs, waves, `migration_runs`, **`gov_source_id`** traceability against the legacy APAR register.

**Platform/M09 entities referenced/extended (not redefined):** `employees`/`org_units`/`users`/`roles`/`designations`/`cadres`/`contribution_levels` (G01/M01), `documents` (G13), `notifications`, `consent_records`, `integration_credentials` (P04), `workflows`/`workflow_instances`/`workflow_actions` (P01), `audit_log`/`security_audit_log` (P05), `migration_runs` (P06), `service_register_events` (**G12** on P05), and the **M09** `goal_plans`/`goals`/`goal_plan_templates`/`review_cycles`/`review_templates`/`performance_reviews`/`calibration_sessions`/PIP/MSF model.

---

## Section 5 — Holistic Data Model

### 5.0 Platform data-model conventions (apply to every G08 entity)
- **`tenant_id`** (NOT NULL) and **`entity_id`** (NOT NULL where entity-scoped) on every G08 business table; data-layer scoping per Platform §0.1 (unscoped query rejected, not defaulted to "all").
- Audit fields (`created_at`,`updated_at`,`created_by`,`updated_by`,`is_deleted`) on every non-ledger entity; append-only ledgers carry only `created_at`,`created_by`. **Mutations captured by the P05 DB trigger** — G08 does not write audit rows in application code.
- **No locally-defined `audit_log`, `workflow_instances`/`workflow_tasks`, or `service_register_events`-as-platform-entity.** Consumed from **P05**, **P01 (`workflow_actions`)**, and the **G12 ledger** respectively.
- Master/config records (templates as W.2 forms, scales) publish through a **P01 master-data approval flow**; `code` uniqueness uses **`VAL-MASTER-UNIQUE`**.

### 5.1 Entity inventory

**Reused/extended (PrimeSoft M09 — referenced, not redefined):** `goal_plans`, `goals`, `goal_plan_templates`, `review_cycles`, `review_templates`, `performance_reviews` (self & manager), `calibration_sessions` (base), PIP tracking, MSF, continuous feedback + two-way thread, probation confirmation, `contribution_levels`.
**Reused (platform):** `employees`, `users`, `org_units`, `designations`, `cadres`, `roles`, `audit_log`/`security_audit_log` (P05), `documents` (G13), `notifications` (X.2), `workflow_instances`/`workflow_actions` (P01), `service_register_events` (G12), `migration_runs` (P06), `integration_credentials` (P04).

**Module-owned entities (G08).** Each row is tagged with its relationship to M09: **[EXTEND]** = adds statutory fields/semantics over an existing M09 concept; **[NEW]** = `GAP (gov-specific)` statutory entity PrimeSoft lacks.

| # | Entity | Purpose | M09 relationship |
|---|---|---|---|
| E1 | `appraisal_cycles` | Configured appraisal period (annual/mid-year/probation/continuous) | **[EXTEND]** M09 appraisal period + review cycle + goal cycle, plus statutory calendar/clock/chain config |
| E2 | `appraisal_templates` | Versioned APAR form (W.2): sections, competencies, scale, weightage policy | **[EXTEND]** M09 `review_template`/`goal_plan_template` as a W.2 form |
| E3 | `rating_scales` | Configurable grade scales (numeric + descriptor + benchmark/adverse) | **[EXTEND]** M09 rating definition |
| E4 | `appraisal_forms` | The APAR instance per appraisee × cycle (header, integrity, pen-picture, final grade, sealed-cover, clock, chain) | **[NEW]** statutory adjudicated wrapper over the M09 review instance |
| E5 | `goals` | KRA/KPI/OKR at employee × cycle/period | **[EXTEND]** M09 `goals` within `goal_plans` (+ `form_id` snapshot link, cross-cycle) |
| E6 | `goal_checkins` | Periodic progress updates against a goal | **[EXTEND]** M09 continuous check-in |
| E7 | `self_appraisals` | Appraisee's self-assessment payload | **[EXTEND]** M09 self review |
| E8 | `appraisal_assessments` | Per-tier (RO/RvO/AA) assessment with grades, remarks, signature ref | **[NEW]** statutory multi-tier over M09 manager review |
| E9 | `competency_assessments` | Per-competency ratings + skill gaps | **[EXTEND]** M09 competency + G07 linkage |
| E10 | `continuous_feedback` | Real-time praise/constructive notes | **[EXTEND]** M09 continuous manager feedback |
| E11 | `feedback_360_requests` | A 360/MSF nomination | **[EXTEND]** M09 MSF request |
| E12 | `feedback_360_responses` | A rater's 360/MSF response | **[EXTEND]** M09 MSF response |
| E13 | `representations` | Appeal against adverse/below-benchmark remarks, with escalation ladder | **[NEW]** statutory |
| E14 | `calibration_sessions` | Moderation/normalisation committee session (absolute grading) | **[EXTEND]** M09 calibration (recommendation-only) |
| E15 | `calibration_adjustments` | Applied grade change — only after a ratified recommendation | **[NEW]** statutory ratification record |
| E16 | `performance_improvement_plans` | PIP header | **[EXTEND]** M09 PIP |
| E17 | `pip_milestones` | PIP milestones | **[EXTEND]** M09 PIP |
| E18 | `apar_disclosure_log` | Disclosure & custody ledger (append-only; tamper-evidence on P05 + OPEN-PLAT-03) | **[NEW]** statutory domain ledger |
| E19 | `appraisal_report_periods` | Multi-RO part-period reports + No-Report Certificate | **[NEW]** statutory |
| E20 | `form_goal_snapshots` | Immutable snapshot of goals into the form at lock | **[NEW]** statutory bridge |
| E21 | `calibration_recommendations` | Committee recommendation awaiting authority ratification | **[NEW]** statutory |
| E22 | `coi_recusals` | Declared conflict-of-interest recusals | **[NEW]** statutory |
| E23 | `digital_signatures` | DSC/eSign non-repudiation artefacts | **[NEW]** `GAP`: runs on X.3 + P05 + G13 |

### 5.2 Full field tables
> Every table also carries **`tenant_id`** (NOT NULL) and **`entity_id`** (NOT NULL where entity-scoped) plus audit fields, per §5.0. References to `workflow_instances`/`audit_log`/`service_register_events` are to the **platform/G12** entities. M09-reused columns are noted; only G08 additions are statutory.

#### E1 — `appraisal_cycles` [EXTEND M09 appraisal period/review cycle]
| Field | Type | Null | Notes |
|---|---|---|---|
| `cycle_id` | UUID PK | N | |
| `tenant_id`,`entity_id` | UUID | N | platform scoping |
| `cycle_code` | VARCHAR(40) UNIQUE | N | `VAL-MASTER-UNIQUE`, e.g. `APAR-2025-26` |
| `name` | VARCHAR(160) | N | |
| `cycle_type` | ENUM | N | ANNUAL_APAR, MID_YEAR, PROBATION, CONTINUOUS, AD_HOC |
| `fiscal_year` | VARCHAR(9) | N | `2025-2026` |
| `m09_review_cycle_id` | UUID FK→M09 `review_cycles` | Y | binds to the underlying M09 review cycle (opened by `JOB-M09-REVIEW-OPEN`) |
| `m09_goal_plan_window_id` | UUID FK→M09 goal cycle | Y | goal window (opened by `JOB-M09-PLAN-OPEN`) |
| `goal_window_start`/`_end` | DATE | N | `VAL-DATE` |
| `appraisal_period_start`/`_end` | DATE | N | performance period |
| `self_appraisal_due`,`ro_due`,`rvo_due`,`aa_due` | DATE | Y | tier SLAs (`JOB-M09-SLA`) |
| `template_id` | UUID FK→E2 | N | |
| `rating_scale_id` | UUID FK→E3 | N | |
| `eligibility_rule` | JSONB | Y | cadre/designation/min-service (assignment-rule dimensions) |
| `disclosure_channel` | ENUM | N | IN_APP, EMAIL, PHYSICAL, HYBRID — *channel only; disclosure mandatory (R7)* |
| `representation_clock_start` | ENUM | N | DISPATCH, ACKNOWLEDGEMENT (R8) |
| `representation_window_days` | INT | N | `VAL-G08-REPWINDOW` |
| `deemed_disclosure_days` | INT | N | non-ack auto-deemed (`JOB-M09-AUTOACK`) |
| `calibration_enabled` | BOOLEAN | N | default **false** (flag `g08.calibration`, R16) |
| `min_supervision_months` | NUMERIC(4,1) | N | default 3.0 — No-Report threshold (`VAL-G08-SUPV`) |
| `chain_truncation_policy` | JSONB | Y | apex-officer config (`VAL-G08-CHAIN`, R12) |
| `probation_period_months` | INT | Y | for PROBATION cycles |
| `probation_extension_max_months` | INT | Y | cap on extension |
| `status` | ENUM | N | DRAFT, OPEN, GOALS_LOCKED, IN_PROGRESS, CALIBRATION, DISCLOSURE, ERRATA, CLOSED, ARCHIVED |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E2 — `appraisal_templates` [EXTEND M09 review template, as W.2 form]
| Field | Type | Null | Notes |
|---|---|---|---|
| `template_id` | UUID PK | N | |
| `tenant_id`,`entity_id` | UUID | N | |
| `template_code` | VARCHAR(40) UNIQUE | N | `VAL-MASTER-UNIQUE` |
| `name` | VARCHAR(160) | N | |
| `version` | INT | N | immutable per published version (W.2 versioning) |
| `applies_to_cadre` | VARCHAR[] | Y | |
| `w2_form_def_id` | UUID FK→W.2 form definition | Y | the configured APAR form (fields/validation `VAL-*`/visibility) |
| `sections` | JSONB | N | ordered section/field definitions |
| `competency_set` | JSONB | N | references G07 competency IDs |
| `weightage_policy` | JSONB | N | **`{performance_sum:100, goal_split_pct, competency_split_pct, development_in_sum:false, competency_in_sum:bool, caps}`** — enforced via `VAL-WEIGHTAGE/WSUM/SUBWSUM` |
| `integrity_column_enabled` | BOOLEAN | N | statutory integrity attribute |
| `penpicture_min_words` | INT | Y | |
| `requires_dsc` | BOOLEAN | N | default true (R10) |
| `status` | ENUM | N | DRAFT, PUBLISHED, RETIRED |
| audit fields | — | — | |

#### E3 — `rating_scales` [EXTEND M09 rating]
| Field | Type | Null | Notes |
|---|---|---|---|
| `rating_scale_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `scale_code` | VARCHAR(40) UNIQUE | N | `VAL-MASTER-UNIQUE`, e.g. `APAR-10PT` |
| `name` | VARCHAR(120) | N | |
| `min_value`/`max_value` | NUMERIC(4,2) | N | |
| `grades` | JSONB | N | ordered `[{label,min,max,descriptor}]` |
| `benchmark_grade` | NUMERIC(4,2) | N | promotion benchmark |
| `adverse_threshold` | NUMERIC(4,2) | N | below = adverse |
| `decimal_places` | INT | N | default 2 |
| `contribution_level_map` | JSONB | Y | grade→M09 `contribution_level` mapping |
| `status` | ENUM | N | ACTIVE, RETIRED |
| audit fields | — | — | |

#### E4 — `appraisal_forms` (APAR instance) [NEW statutory wrapper]
| Field | Type | Null | Notes |
|---|---|---|---|
| `form_id` | UUID PK | N | |
| `tenant_id`,`entity_id` | UUID | N | |
| `apar_no` | VARCHAR(40) UNIQUE | N | e.g. `APAR-2025-26-000142` |
| `cycle_id` | UUID FK→E1 | N | |
| `m09_review_id` | UUID FK→M09 `performance_reviews` | Y | underlying M09 review instance |
| `appraisee_id` | UUID FK→employees | N | |
| `org_unit_id`,`designation_id` | UUID FK | N | snapshot at open |
| `reporting_officer_id` | UUID FK→employees | Y | resolved from latest report period (E19); nullable when multi-RO |
| `has_multi_ro` | BOOLEAN | N | default false (R4) |
| `reviewing_officer_id`,`accepting_authority_id` | UUID FK→employees | Y | resolved by P01 approver resolution |
| `chain_truncated` | BOOLEAN | N | default false (R12) |
| `chain_config` | ENUM | N | FULL, NO_RVO, NO_AA, SINGLE_TIER, DESIGNATED_ALTERNATE |
| `integrity_certified` | ENUM | Y | BEYOND_DOUBT, WATCH, NOT_CERTIFIED |
| `integrity_remark` | TEXT | Y | required if not BEYOND_DOUBT (`VAL-COMMENT`) |
| `pen_picture` | TEXT | Y | RO narrative |
| `provisional_grade` | NUMERIC(4,2) | Y | supervision-weighted aggregate (E19) |
| `reviewed_grade` | NUMERIC(4,2) | Y | RvO-stage |
| `final_grade` | NUMERIC(4,2) | Y | AA-certified |
| `final_grade_label` | VARCHAR(40) | Y | from scale |
| `is_adverse`,`below_benchmark` | BOOLEAN | N | derived on certify (server-side) |
| `adverse_evidence_refs` | UUID[] | Y | disclosable evidence (`VAL-G08-ADVEVID`, R5) |
| `calibrated` | BOOLEAN | N | default false |
| `pre_calibration_grade` | NUMERIC(4,2) | Y | preserved on adjustment |
| `sealed_cover` | BOOLEAN | N | default false (R3) |
| `sealed_cover_reason` | TEXT | Y | required when sealed |
| `sealed_cover_case_ref` | VARCHAR(60) | Y | G09 case reference |
| `sealed_at`,`sealed_released_at` | TIMESTAMP | Y | |
| `dispatched_at`,`disclosed_at`,`acknowledged_at` | TIMESTAMP | Y | disclosure clock (R8) |
| `representation_window_start_at`/`_end_at` | TIMESTAMP | Y | derived from cycle clock-start |
| `probation_outcome` | ENUM | Y | CONFIRMED, EXTENDED, DISCHARGE_RECOMMENDED |
| `certification_signature_id` | UUID FK→E23 | Y | AA DSC on certify (R10) |
| `status` | ENUM | N | see §10 |
| `workflow_instance_id` | UUID FK→**workflow_instances (P01)** | Y | |
| `generated_pdf_doc_id` | UUID FK→**documents (G13)** | Y | |
| `posted_to_sr` | BOOLEAN | N | default false |
| `confidentiality_class` | ENUM | N | default CONFIDENTIAL (P02 ceiling) |
| audit fields | — | — | |
| UNIQUE(`tenant_id`,`cycle_id`,`appraisee_id`) | — | | one form per appraisee per cycle |

#### E5 — `goals` [EXTEND M09 `goals` / `goal_plans`]
| Field | Type | Null | Notes |
|---|---|---|---|
| `goal_id` | UUID PK | N | M09 goal id |
| `tenant_id`,`entity_id` | UUID | N | |
| `goal_plan_id` | UUID FK→M09 `goal_plans` | Y | owning M09 active plan (one per employee per period) |
| `appraisee_id` | UUID FK→employees | N | objective owner |
| `cycle_id` | UUID FK→E1 | Y | nullable — cross-cycle / pre-form drafting (R6) |
| `form_id` | UUID FK→E4 | **Y** | nullable — populated only when snapshotted (R6) |
| `period_scope` | ENUM | N | SINGLE_CYCLE, CROSS_CYCLE |
| `goal_type` | ENUM | N | KRA, KPI, OKR_OBJECTIVE, OKR_KEYRESULT, DEVELOPMENT |
| `parent_goal_id` | UUID FK→E5 | Y | cascade parentage; `VAL-FLOW-NOCYCLE` |
| `cascaded_from_employee_id` | UUID FK→employees | Y | cascade source |
| `title` | VARCHAR(200) | N | `VAL-GOALNAME` (unique within plan) |
| `description`,`metric`,`target_value` | TEXT/VARCHAR | Y | |
| `weightage` | NUMERIC(5,2) | N | `VAL-WEIGHTAGE/WSUM` (perf siblings sum 100; DEVELOPMENT excluded); sub-goals `VAL-SUBWSUM` |
| `due_date` | DATE | Y | |
| `achievement_pct` | NUMERIC(5,2) | Y | `VAL-ACHV` (0–cap) |
| `self_rating`,`ro_rating` | NUMERIC(4,2) | Y | |
| `snapshotted` | BOOLEAN | N | default false; true once copied to E20 |
| `status` | ENUM | N | DRAFT, PROPOSED, APPROVED, REVISED, ACHIEVED, NOT_ACHIEVED, DROPPED |
| `approved_by`,`approved_at` | UUID/TS | Y | RO |
| audit fields | — | — | |

#### E6 — `goal_checkins` [EXTEND M09 check-in]
| Field | Type | Null | Notes |
|---|---|---|---|
| `checkin_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `goal_id` | UUID FK→E5 | N | |
| `checkin_date` | DATE | N | |
| `progress_pct` | NUMERIC(5,2) | Y | `VAL-ACHV` |
| `status_note`,`blockers` | TEXT | Y | |
| `raised_by` | UUID FK→employees | N | |
| audit fields | — | — | |

#### E7 — `self_appraisals` [EXTEND M09 self review]
| Field | Type | Null | Notes |
|---|---|---|---|
| `self_appraisal_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 UNIQUE | N | one per form |
| `achievements` | TEXT | N | `VAL-REQUIRED` |
| `goal_summary`,`competency_self_rating` | JSONB | Y | |
| `constraints_faced`,`training_needs` | TEXT | Y | feeds G07 |
| `submitted_at` | TIMESTAMP | Y | |
| `status` | ENUM | N | DRAFT, SUBMITTED, RETURNED |
| audit fields | — | — | |

#### E8 — `appraisal_assessments` [NEW multi-tier over M09 manager review]
| Field | Type | Null | Notes |
|---|---|---|---|
| `assessment_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `report_period_id` | UUID FK→E19 | Y | set for REPORTING tier when multi-RO |
| `tier` | ENUM | N | REPORTING, REVIEWING, ACCEPTING |
| `assessor_id` | UUID FK→employees | N | |
| `workflow_action_id` | UUID FK→**workflow_actions (P01)** | Y | the P01 action that recorded this tier act |
| `is_escalated_author` | BOOLEAN | N | true if written by escalation (R9) |
| `overall_grade` | NUMERIC(4,2) | Y | |
| `section_grades` | JSONB | Y | |
| `remarks` | TEXT | Y | |
| `adverse_evidence_refs` | UUID[] | Y | `VAL-G08-ADVEVID` if adverse |
| `concurs_with_lower_tier` | BOOLEAN | Y | RvO/AA |
| `variance_reason` | TEXT | Y | required if not concurring (`ERR-REASON-REQ`) |
| `signature_id` | UUID FK→E23 | Y | DSC of this tier act (R10) |
| `decision` | ENUM | Y | SUBMITTED, RETURNED, CONCURRED, VARIED, CERTIFIED |
| `acted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E9 — `competency_assessments` [EXTEND M09 competency + G07]
| Field | Type | Null | Notes |
|---|---|---|---|
| `comp_assessment_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `competency_id` | UUID | N | references G07 catalog |
| `competency_name` | VARCHAR(160) | N | snapshot |
| `required_level`,`self_level`,`assessed_level` | INT | N/Y | |
| `gap` | INT | Y | derived required − assessed |
| `gap_severity` | ENUM | Y | NONE, MINOR, MODERATE, CRITICAL |
| `training_nomination_id` | UUID | Y | G07 nomination from gap |
| audit fields | — | — | |

#### E10 — `continuous_feedback` [EXTEND M09 continuous feedback + two-way thread]
| Field | Type | Null | Notes |
|---|---|---|---|
| `feedback_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `subject_employee_id`,`author_id` | UUID FK→employees | N | |
| `cycle_id` | UUID FK→E1 | Y | |
| `feedback_type` | ENUM | N | PRAISE, CONSTRUCTIVE, COACHING, GENERAL |
| `visibility` | ENUM | N | PRIVATE_TO_SUBJECT, MANAGER_ONLY, MANAGER_AND_SUBJECT |
| `body` | TEXT | N | |
| `parent_feedback_id` | UUID FK→E10 | Y | two-way thread (M09) |
| `linked_goal_id` | UUID FK→E5 | Y | |
| `is_acknowledged` | BOOLEAN | N | default false |
| audit fields | — | — | |

#### E11 — `feedback_360_requests` [EXTEND M09 MSF]
| Field | Type | Null | Notes |
|---|---|---|---|
| `request_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `subject_employee_id`,`rater_id` | UUID FK→employees | N | |
| `rater_relationship` | ENUM | N | PEER, SUBORDINATE, MANAGER, INTERNAL_CUSTOMER, EXTERNAL |
| `anonymous` | BOOLEAN | N | default true |
| `due_date` | DATE | Y | |
| `status` | ENUM | N | INVITED, IN_PROGRESS, SUBMITTED, DECLINED, EXPIRED |
| audit fields | — | — | |

#### E12 — `feedback_360_responses` [EXTEND M09 MSF]
| Field | Type | Null | Notes |
|---|---|---|---|
| `response_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `request_id` | UUID FK→E11 UNIQUE | N | |
| `ratings` | JSONB | N | per-competency/behaviour |
| `strengths`,`improvements` | TEXT | Y | |
| `submitted_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E13 — `representations` [NEW statutory]
| Field | Type | Null | Notes |
|---|---|---|---|
| `representation_id` | UUID PK | N | |
| `tenant_id`,`entity_id` | UUID | N | |
| `rep_no` | VARCHAR(40) UNIQUE | N | |
| `form_id` | UUID FK→E4 | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `grounds` | TEXT | N | |
| `contested_items` | JSONB | N | |
| `supporting_doc_ids` | UUID[] | Y | G13 documents (`VAL-FILE`) |
| `filed_at` | TIMESTAMP | N | |
| `sla_due_at` | TIMESTAMP | N | window to file (`VAL-G08-REPWINDOW`) |
| `disposal_deadline_at` | TIMESTAMP | N | authority deadline (`JOB-G08-REP-SLA`, R20) |
| `is_late`,`condoned` | BOOLEAN | N | default false |
| `condonation_authority_id` | UUID FK→employees | Y | flag `g08.condonation` |
| `condonation_reason` | TEXT | Y | |
| `escalation_level` | INT | N | default 1 |
| `external_reference` | ENUM | N | NONE, CAT, HIGH_COURT, TRIBUNAL (R20) |
| `external_ref_no` | VARCHAR(60) | Y | |
| `decision` | ENUM | Y | UPHELD, PARTIALLY_UPHELD, REJECTED, EXPUNGED, MODIFIED, ESCALATED_EXTERNAL |
| `decision_authority_id` | UUID FK→employees | Y | competent authority |
| `decision_reason` | TEXT | Y | |
| `revised_grade` | NUMERIC(4,2) | Y | if modified |
| `workflow_instance_id` | UUID FK→**workflow_instances (P01)** | Y | representation flow |
| `status` | ENUM | N | FILED, UNDER_REVIEW, DECIDED, ESCALATED, CLOSED |
| audit fields | — | — | |

#### E14 — `calibration_sessions` [EXTEND M09 calibration]
| Field | Type | Null | Notes |
|---|---|---|---|
| `session_id` | UUID PK | N | M09 calibration session id |
| `tenant_id`,`entity_id` | UUID | N | |
| `cycle_id` | UUID FK→E1 | N | |
| `org_unit_scope` | UUID FK→org_units | N | population scoped (P02) |
| `method` | ENUM | N | COMMITTEE_REVIEW, NORMALISATION, BELL_CURVE — *FORCED_DISTRIBUTION removed (R2)* |
| `bell_curve_enabled` | BOOLEAN | N | default false (R2) |
| `target_distribution` | JSONB | Y | **diagnostic-only** (`VAL-DISTRIB` buckets sum 100), never a quota |
| `committee_member_ids` | UUID[] | N | flag `g08.calibration-member` |
| `runs_before_certification` | BOOLEAN | N | if true, output feeds AA certification (R1) |
| `scheduled_at` | TIMESTAMP | Y | `JOB-M09-CALIB` |
| `status` | ENUM | N | PLANNED, IN_SESSION, RECOMMENDED, RATIFIED, COMPLETED, CANCELLED |
| `outcome_summary` | TEXT | Y | |
| audit fields | — | — | |

#### E15 — `calibration_adjustments` [NEW ratification record]
| Field | Type | Null | Notes |
|---|---|---|---|
| `adjustment_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `recommendation_id` | UUID FK→E21 | N | **must reference a RATIFIED recommendation (R1)** |
| `session_id` | UUID FK→E14 | N | |
| `form_id` | UUID FK→E4 | N | |
| `old_grade`,`applied_grade` | NUMERIC(4,2) | N | applied = ratified `recommended_grade` |
| `ratified_by` | UUID FK→employees | N | AA / competent authority |
| `ratification_signature_id` | UUID FK→E23 | N | DSC on the mutation (R1, R10) |
| `applied_at` | TIMESTAMP | N | |
| `status` | ENUM | N | APPLIED, REVERSED |
| audit fields | — | — | |

#### E16 — `performance_improvement_plans` [EXTEND M09 PIP]
| Field | Type | Null | Notes |
|---|---|---|---|
| `pip_id` | UUID PK | N | |
| `tenant_id`,`entity_id` | UUID | N | |
| `pip_no` | VARCHAR(40) UNIQUE | N | |
| `appraisee_id` | UUID FK→employees | N | |
| `form_id` | UUID FK→E4 | Y | originating APAR |
| `initiated_by` | UUID FK→employees | N | RO |
| `reason`,`success_criteria` | TEXT | N | |
| `start_date`,`target_end_date` | DATE | N | |
| `outcome` | ENUM | Y | SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| `status` | ENUM | N | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED |
| audit fields | — | — | |

#### E17 — `pip_milestones` [EXTEND M09 PIP]
| Field | Type | Null | Notes |
|---|---|---|---|
| `milestone_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `pip_id` | UUID FK→E16 | N | |
| `title` | VARCHAR(200) | N | |
| `due_date` | DATE | N | |
| `metric`,`progress_note` | VARCHAR/TEXT | Y | |
| `status` | ENUM | N | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| audit fields | — | — | |

#### E18 — `apar_disclosure_log` [NEW domain ledger; tamper-evidence via P05 + OPEN-PLAT-03]
| Field | Type | Null | Notes |
|---|---|---|---|
| `disclosure_log_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `seq_no` | BIGINT | N | monotonic per form |
| `event_type` | ENUM | N | DISPATCHED, DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, SEALED, UNSEALED, HEIR_ACCESS, EXPUNGED, ANCHOR |
| `actor_id` | UUID FK→employees | N | |
| `actor_role` | VARCHAR(60) | N | |
| `ip_address` | INET | Y | |
| `detail` | JSONB | Y | |
| `chain_anchor_ref` | VARCHAR(80) | Y | **OPEN-PLAT-03** chain-head/WORM anchor batch id (replaces invented per-row hash) |
| `event_at` | TIMESTAMP | N | append-only; INSERT only; mutation audit is P05's DB-trigger row |

> **Re-grounding note (R11).** The authoritative mutation audit for every access/disclosure/custody event is the **P05 dual-log DB trigger** (immutable, 7-yr). `apar_disclosure_log` is the domain-readable ledger; its statutory tamper-evidence is provided by **OPEN-PLAT-03** (periodic hash-chaining of the audit head to WORM), **not** a bespoke `prev_hash/row_hash` chain authored in this module. `/verify` queries the OPEN-PLAT-03 chain over the form's P05 events.

#### E19 — `appraisal_report_periods` [NEW — multi-RO part-period, R4]
| Field | Type | Null | Notes |
|---|---|---|---|
| `period_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `sequence_no` | INT | N | order within the year |
| `period_start`,`period_end` | DATE | N | `VAL-G08-PERIODTILE` (non-overlap) |
| `reporting_officer_id` | UUID FK→employees | Y | null if No-Report |
| `supervision_months` | NUMERIC(4,1) | N | `VAL-G08-SUPV` |
| `part_period_grade` | NUMERIC(4,2) | Y | |
| `part_remarks` | TEXT | Y | |
| `weight_in_aggregate` | NUMERIC(5,2) | Y | supervision-weighted proportion |
| `no_report_certificate` | BOOLEAN | N | default false; true when supervision < threshold |
| `no_report_reason` | TEXT | Y | required when true |
| `no_report_signature_id` | UUID FK→E23 | Y | DSC on No-Report (R10) |
| `status` | ENUM | N | DRAFT, SUBMITTED, NO_REPORT, AGGREGATED |
| audit fields | — | — | |

#### E20 — `form_goal_snapshots` [NEW — immutable snapshot-on-lock, R6] (append-only)
| Field | Type | Null | Notes |
|---|---|---|---|
| `snapshot_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | N | |
| `source_goal_id` | UUID FK→E5 | N | provenance |
| `goal_payload` | JSONB | N | **immutable copy**: type/title/metric/target/weightage/parentage |
| `weightage` | NUMERIC(5,2) | N | frozen at lock |
| `snapshot_at` | TIMESTAMP | N | append-only |
| `locked` | BOOLEAN | N | default true |
| `created_at`,`created_by` | — | N | append-only (P05 captures) |

#### E21 — `calibration_recommendations` [NEW — ratified recommendation, R1]
| Field | Type | Null | Notes |
|---|---|---|---|
| `recommendation_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `session_id` | UUID FK→E14 | N | |
| `form_id` | UUID FK→E4 | N | |
| `current_grade`,`recommended_grade` | NUMERIC(4,2) | N | |
| `rationale` | TEXT | N | **mandatory** (`ERR-REASON-REQ`) |
| `committee_vote` | JSONB | Y | quorum record |
| `pre_certification` | BOOLEAN | N | true if before AA certification (R1) |
| `ratified_by` | UUID FK→employees | Y | AA / competent authority |
| `ratified_at` | TIMESTAMP | Y | |
| `ratification_signature_id` | UUID FK→E23 | Y | DSC (R1, R10) |
| `recommendation_status` | ENUM | N | PROPOSED, ENDORSED, REJECTED, RATIFIED, DECLINED |
| audit fields | — | — | |

#### E22 — `coi_recusals` [NEW — conflict-of-interest recusal, R22]
| Field | Type | Null | Notes |
|---|---|---|---|
| `recusal_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `form_id` | UUID FK→E4 | Y | |
| `session_id` | UUID FK→E14 | Y | calibration context |
| `actor_id` | UUID FK→employees | N | declarer |
| `role_context` | VARCHAR(60) | N | ADJUDICATOR, CALIB_MEMBER |
| `coi_type` | ENUM | N | SPOUSE, CLOSE_RELATION, PRIOR_POSTING, FINANCIAL, STRUCTURAL_CHAIN, OTHER |
| `declaration` | TEXT | N | |
| `recused` | BOOLEAN | N | default true |
| `declared_at` | TIMESTAMP | N | |
| audit fields | — | — | |

#### E23 — `digital_signatures` [NEW `GAP` — non-repudiation; X.3 + P05 + G13] (append-only)
| Field | Type | Null | Notes |
|---|---|---|---|
| `signature_id` | UUID PK | N | |
| `tenant_id` | UUID | N | |
| `entity_type` | ENUM | N | ASSESSMENT, DISCLOSURE_ACK, CALIBRATION_RATIFICATION, EXPUNCTION, NO_REPORT_CERT, SEALED_COVER_RELEASE, DISPOSAL, CONFIDENTIALITY_DOWNGRADE |
| `entity_id` | UUID | N | signed record id |
| `signer_id` | UUID FK→employees | N | |
| `signature_method` | ENUM | N | DSC, AADHAAR_ESIGN, HSM_TOKEN (via **X.3** provider; creds in **P04**) |
| `certificate_serial` | VARCHAR(120) | Y | |
| `signed_payload_hash` | CHAR(64) | N | SHA-256 of canonical payload |
| `signature_value` | TEXT | N | detached signature (artefact stored in **G13**) |
| `signed_at` | TIMESTAMP | N | |
| `verification_status` | ENUM | N | VALID, REVOKED, EXPIRED, INVALID |
| `created_at`,`created_by` | — | N | append-only (P05 captures) |

### 5.3 Relationship map

```
appraisal_cycles (E1)[EXTEND M09 review_cycle] ──1:N──> appraisal_forms (E4)[NEW] ──1:1──> self_appraisals (E7)[EXTEND M09]
   │  └─FK template (E2)[W.2], rating_scale (E3)            ├─1:N──> appraisal_report_periods (E19)[NEW multi-RO]
   │  └─binds M09 review_cycles / goal_plan window          ├─1:N──> form_goal_snapshots (E20)[NEW lock copy]
goals (E5)[EXTEND M09 goals] ──owned by──> goal_plans (M09) ──snapshot──> form_goal_snapshots (E20)
   └─1:N──> goal_checkins (E6)                              ├─1:N──> appraisal_assessments (E8)[NEW] ──0:1──> digital_signatures (E23)[GAP]
appraisal_templates (E2) ──refs G07 competency catalog      ├─1:N──> competency_assessments (E9) ──> G07 nomination
rating_scales (E3) ──grade/benchmark/adverse/contrib-level  ├─1:N──> feedback_360_requests (E11)[MSF] ──1:1──> responses (E12)
                                                            ├─1:N──> representations (E13)[NEW] [escalation → CAT] on P01
calibration_sessions (E14)[EXTEND M09] ──1:N──> calibration_recommendations (E21)[NEW] ──ratify──> calibration_adjustments (E15)[NEW] ──N:1──> forms (E4)
coi_recusals (E22) ──N:1──> forms/sessions               digital_signatures (E23) ──polymorphic──> E8/E15/E18/E19/E21
performance_improvement_plans (E16)[EXTEND M09 PIP] ──1:N──> pip_milestones (E17)
continuous_feedback (E10)[EXTEND M09] ──N:1──> employees, ──0:1──> goals (E5); two-way thread via parent_feedback_id
apar_disclosure_log (E18)[NEW] ──N:1──> forms (E4)   [append-only; tamper-evidence = P05 DB-trigger + OPEN-PLAT-03]
appraisal_forms (E4) ──posts──> service_register_events (G12 on P05); ──feeds by reference (sealed-aware)──> G06; ──PDF/artefacts──> documents (G13)
appraisal_forms (E4) ──sealed by──> G09 charge status; ──probation outcome──> G01 + G12; tier flow on workflow_instances (P01)
```

### 5.4 Ownership / reuse matrix

| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `designations`, `contribution_levels` | G01/M01 | G08 (read) | G01; G08 writes probation-confirmation feed |
| M09 `goal_plans`/`goals`/`review_cycles`/`calibration_sessions`/PIP/MSF | PrimeSoft M09 | G08 | M09 + G08 (statutory extension fields/rows) |
| competency catalog | G07 | G08 (read) | G07 |
| `service_register_events` | **G12** (on P05) | G08, G14 | G08 (append), others |
| `documents` | G13/M11 | G08 | G08 (evidence/PDF/signature artefacts) |
| `notifications`,`audit_log`/`security_audit_log`,`workflow_*` | Platform (X.2/P05/P01) | G08 | G08 (via engines) |
| E1–E23 (this module) | **G08** | G14 (analytics), G06 (eligibility) | G08 |
| promotion eligibility (by reference) | G06 | G06 | G08 (write; suppressed under sealed cover) |
| training nominations | G07 | G07 | G08 (write from skill gap) |
| charge / sub-judice status | G09 | G08 | G09 (G08 subscribes) |

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
| pip.status / pip.outcome | DRAFT, ACTIVE, UNDER_REVIEW, CLOSED / SUCCESSFUL, EXTENDED, UNSUCCESSFUL, ABANDONED |
| milestone.status | PENDING, ON_TRACK, AT_RISK, MET, MISSED |
| disclosure.event_type | DISPATCHED, DISCLOSED, VIEWED, ACKNOWLEDGED, DOWNLOADED, ACCESS_DENIED, CUSTODY_TRANSFER, SEALED, UNSEALED, HEIR_ACCESS, EXPUNGED, ANCHOR |

**Feature flags (R16), as RBAC §4.3 capability flags (Org-Admin-granted, audited to P05):** `g08.calibration` (default off), `g08.continuous-feedback` (default off), `g08.msf-360` (default off), `g08.bell-curve` (default off). Phase-1 GA runs with all four off; the statutory core path requires none.

### 5.6 Data integrity rules

1. **Weightage policy (R21).** Performance goals (KRA/KPI/OKR) at the same cascade level sum to 100 (±0.01) via **`VAL-WEIGHTAGE/WSUM`**; sub-goals via **`VAL-SUBWSUM`**; DEVELOPMENT goals excluded. The final grade roll-up applies `weightage_policy.goal_split_pct` to the goal score and `competency_split_pct` to the competency score (sum 100). Enforced on goal-lock and in `GradeRollupEngine`.
2. **Scale bounds.** Any grade within `[rating_scales.min_value, max_value]`.
3. **Achievement bounds.** `achievement_pct`/`progress_pct` validated by **`VAL-ACHV`** (0–cap per template).
4. **Adverse / benchmark derivation.** `is_adverse = final_grade < adverse_threshold`; `below_benchmark = final_grade < benchmark_grade`. Derived on certification, server-side; never client-supplied.
5. **Tier ordering (P01).** A REVIEWING assessment cannot exist before all REPORTING period assessments (E19) are SUBMITTED/NO_REPORT; ACCEPTING requires REVIEWING complete (or the configured truncated-chain path). Ordering is the P01 `SEQUENTIAL` flow.
6. **Self-adjudication + COI block (R22, P02).** `appraisee_id` ∉ {RO(s), RvO, AA, adjudicator, calibration member acting on the form}; all distinct. A declared COI (E22) blocks the actor even where the structural check passes (`Authorization.check` multi-role intersection).
7. **One self-appraisal.** Unique `(form_id)` on `self_appraisals`.
8. **One form per appraisee per cycle.** Unique `(tenant_id, cycle_id, appraisee_id)` on `appraisal_forms`.
9. **Disclosure precedence + mandatory disclosure (R7).** Every certified APAR **must** be disclosed in full; `representations` may be FILED only after `disclosed_at`/deemed-disclosure. No "non-disclosure for favourable" path.
10. **Representation clock (R8).** `representation_window_start_at` = `dispatched_at` or `acknowledged_at` per `cycle.representation_clock_start`; deemed-disclosure after `deemed_disclosure_days` (driven by **`JOB-M09-AUTOACK`**) sets the window start even without acknowledgement.
11. **Immutability after FINALISED.** No update to grade fields once status ≥ FINALISED except via representation or ratified expunction (new signature + P05 audit chain).
12. **Append-only ledgers + tamper-evidence (R11).** `apar_disclosure_log`, `form_goal_snapshots`, `digital_signatures` and G12 `service_register_events` accept INSERT only; mutation audit is the **P05 DB trigger**; statutory tamper-evidence tracks **OPEN-PLAT-03** (chain head to WORM); `/verify` queries that chain.
13. **Calibration authority (R1).** A certified `final_grade` may change only through `calibration_adjustments` referencing a **RATIFIED** `calibration_recommendations` signed by AA/competent authority — or a pre-certification recommendation the AA certifies. No committee mutates a certified grade. Applying preserves `pre_calibration_grade` and sets `calibrated=true`.
14. **Confidentiality (R14, R17, P02).** Reading APAR content passes **`Authorization.check`** with the **PII ceiling + field mask on serialization**; denied reads append `ACCESS_DENIED` (and a `security_audit_log` row). The platform read NFR (p95 < 500 ms) holds at 200k scale via cached/pre-computed mask columns.
15. **Adverse-evidence substantiation (R5).** An adverse / below-benchmark assessment requires non-empty `adverse_evidence_refs` to **disclosable** evidence (**`VAL-G08-ADVEVID`**); anonymous MSF (E12) and visibility-restricted continuous feedback (E10 PRIVATE/MANAGER_ONLY) cannot be the sole reference.
16. **Sealed cover (R3).** While `sealed_cover=true`, the form cannot transition to FINALISED/POSTED and the G06 feed is suppressed; release requires a signed `SEALED_COVER_RELEASE` and a G09 conclusion reference.
17. **Multi-RO aggregation (R4).** `provisional_grade` = supervision-weighted aggregate of report-period grades (E19) excluding NO_REPORT periods; a period with `supervision_months < cycle.min_supervision_months` (**`VAL-G08-SUPV`**) is a No-Report Certificate.
18. **Digital signature (R10).** Tier certification, disclosure ack, calibration ratification, expunction, No-Report Certificate, sealed-cover release and disposal each require a VALID `digital_signatures` row (via X.3 provider) before the act commits.
19. **Dual-control (R23).** Disposal and confidentiality downgrade require a distinct maker and checker (two principals) plus MFA step-up and DSC — modelled as a **P01 maker-checker flow**.
20. **Chain truncation (R12).** When the resolved chain cannot satisfy "all distinct" (apex officers), the form adopts a configured `chain_config` (DESIGNATED_ALTERNATE / SINGLE_TIER) via **`VAL-G08-CHAIN`**; otherwise materialisation flags `CHAIN_TRUNCATED_UNCONFIGURED` — never a silent failure.
21. **FK respect + soft delete.** All FKs enforced; soft delete via `is_deleted` (append-only ledgers exempt). No hard delete; cascade is logical for statutory records.

### 5.7 Sample data (2–3 rows per entity)
*(All rows additionally carry `tenant_id`/`entity_id`; omitted for brevity.)*

**E1 appraisal_cycles**
| cycle_id | cycle_code | cycle_type | representation_clock_start | calibration_enabled | status |
|---|---|---|---|---|---|
| 5c1…01 | APAR-2025-26 | ANNUAL_APAR | DISPATCH | false | IN_PROGRESS |
| 5c1…02 | MIDYR-2025-26 | MID_YEAR | ACKNOWLEDGEMENT | false | OPEN |
| 5c1…03 | PROB-2025-Q2 | PROBATION | DISPATCH | false | CLOSED |

**E2 appraisal_templates**
| template_id | template_code | version | weightage_policy | requires_dsc | status |
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
| goal_id | goal_plan_id | appraisee_id | form_id | goal_type | weightage | snapshotted | status |
|---|---|---|---|---|---|---|---|
| g…01 | gp…07 | emp…77 | f…01 | KRA | 40.00 | true | ACHIEVED |
| g…02 | gp…07 | emp…77 | f…01 | KPI | 30.00 | true | ACHIEVED |
| g…03 | gp…07 | emp…77 | NULL | DEVELOPMENT | 0.00 | false | APPROVED |

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
| feedback_id | subject_employee_id | author_id | feedback_type | visibility | parent_feedback_id |
|---|---|---|---|---|---|
| cf…01 | emp…77 | emp…12 | PRAISE | MANAGER_AND_SUBJECT | NULL |
| cf…02 | emp…88 | emp…12 | CONSTRUCTIVE | MANAGER_ONLY | NULL |
| cf…03 | emp…77 | emp…77 | GENERAL | MANAGER_AND_SUBJECT | cf…01 |

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

**E18 apar_disclosure_log** (append-only; tamper-evidence P05 + OPEN-PLAT-03)
| disclosure_log_id | form_id | seq_no | event_type | actor_id | chain_anchor_ref | event_at |
|---|---|---|---|---|---|---|
| dl…01 | f…01 | 1 | DISPATCHED | emp…99(HR) | ANCHOR-2026-05-01-0007 | 2026-05-01T06:00Z |
| dl…02 | f…01 | 2 | ACKNOWLEDGED | emp…77 | ANCHOR-2026-05-01-0007 | 2026-05-03T07:30Z |
| dl…03 | f…02 | 1 | SEALED | emp…45(AA) | ANCHOR-2026-04-20-0003 | 2026-04-20T05:10Z |

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

> Each FR carries: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. v3 re-grounds every FR onto P01/P02/P05, the `VAL-*`/`JOB-M09-*`/`MSG-*` ids, the platform error table, cursor pagination, `Idempotency-Key` and `tenant_id`/`entity_id`. FR-G08-17 … FR-G08-22 are the statutory extensions; FR-G08-02/04/05/06/07/08/09/14/15/16 amend the M09 base.

---

### FR-G08-01 — Appraisal Cycle & Template Configuration

- **Module:** G08
- **Primary Role(s):** System Administrator, HR/APAR Cell (HR Admin + Performance Admin)
- **User Story:** As an HR administrator, I want to configure an appraisal cycle with its calendar, eligible population, template (W.2 form), rating scale, disclosure-clock and chain-truncation rules so that the correct APAR/OKR process runs for the right employees with statutory deadlines.

**Description.** Create and manage `appraisal_cycles` bound to a published `appraisal_template` (a **W.2 form definition**) and `rating_scale`, **reusing the M09 review-cycle / goal-plan window** (opened by `JOB-M09-REVIEW-OPEN` / `JOB-M09-PLAN-OPEN`). Configure goal/self/RO/RvO/AA windows, eligibility (assignment-rule dimensions), disclosure channel and representation clock-start, minimum-supervision threshold, chain-truncation policy, and capability flags. Opening a cycle materialises one `appraisal_forms` per eligible employee with the RO/RvO/AA chain resolved via **P01 approver resolution** (reporting-chain position) and report periods seeded from supervision history.

**Acceptance Criteria.**
1. A cycle cannot move to OPEN unless `template_id` is PUBLISHED and `rating_scale_id` is ACTIVE.
2. Opening a cycle generates exactly one form per eligible employee (idempotent re-run via `Idempotency-Key` adds only newly eligible).
3. RO/RvO/AA are resolved from the M01 reporting chain at open (P01 resolution); unresolved chains are flagged, not silently dropped.
4. Eligibility filters by cadre/designation/min-service and excludes RETIRED/RESIGNED/DECEASED/TERMINATED `lifecycle_state`.
5. Calendar dates chronologically ordered and within the fiscal year (`VAL-DATE`, `VAL-EFFECTIVE`).
6. **(R12)** Where the resolved chain cannot satisfy "all distinct" (apex officers), the form adopts `chain_truncation_policy` (DESIGNATED_ALTERNATE / SINGLE_TIER) via `VAL-G08-CHAIN`; if unconfigured, the form is flagged `CHAIN_TRUNCATED_UNCONFIGURED` (HTTP 412 `PRECONDITION_FAILED`) and held — never silently dropped.
7. **(R3)** Employees with an active G09 charge/sub-judice status are materialised with `sealed_cover=true` (FR-G08-17).

**Business Rules.**
- BR1: `goal_window_end ≤ appraisal_period_end`; `self_appraisal_due ≤ ro_due ≤ rvo_due ≤ aa_due`.
- BR2: A published template version is immutable (W.2 versioning); changes require a new version; in-flight forms pin their version (P01/§0.3).
- BR3: A cycle in IN_PROGRESS may not change scale/template (correctable only via FR-G08-22 errata).
- BR4: `disclosure_channel` and `representation_clock_start` snapshot onto each form; disclosure itself is always mandatory (R7).
- BR5: Phase-1 cycles default `calibration_enabled=false`; enabling requires flag `g08.calibration` (R16).

**Data Model References.** E1 (create/manage), E2 (bind PUBLISHED W.2), E3 (bind ACTIVE), E4 (bulk materialise), E19 (seed), `employees`/`org_units` (read chain/eligibility), M09 `review_cycles`/`goal_plans` (bind).

**API References.** `POST /api/v1/g08/cycles` · `PUT /api/v1/g08/cycles/{cycleId}` · `POST /api/v1/g08/cycles/{cycleId}/open` (Idempotency-Key) · `GET /api/v1/g08/cycles?limit=&cursor=` · `POST /api/v1/g08/templates` · `POST /api/v1/g08/rating-scales`

**UI Behavior Notes.** Wizard: Basics → Calendar → Eligibility → Template/Scale → Disclosure & Clock → Chain Rules → Review. Eligibility preview shows live count, unresolved-chain/apex-truncation warnings, and sealed-cover count before open. Open is a guarded action with a generated-forms summary. Empty/loading/error/no-permission states per Foundation §3.

**Edge Cases.** Mid-cycle joiners (incremental materialise); no-RO (flag); circular reporting (`VAL-FLOW-NOCYCLE`); apex officer (truncation policy or hold); template retired after binding (block); duplicate open (idempotent); employee under charge (sealed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CycleService`, `TemplateService` (W.2), `RatingScaleService`, `FormMaterialiser`, `EligibilityResolver`, `ChainResolver` (P01), `SealedCoverSeeder` |
| Backend Flow | Validate → persist cycle → on open: resolve eligibility → resolve chains via P01 (+truncation) → seed periods → check G09 status → batch-insert forms in a transaction → enqueue X.2 notifications |
| Data Operations | INSERT E1/E2/E3; bulk INSERT E4/E19; SELECT employees/org_units + G09 status; P05 trigger captures audit |
| Validation | Date ordering, template PUBLISHED, scale ACTIVE, eligibility schema, fiscal bounds, `VAL-G08-CHAIN` |
| Authorization | P02: Sys Admin/HR only; org-scoped; no self in generated chain |
| State Changes | cycle DRAFT→OPEN; forms GOALS_PENDING or SEALED_COVER; notify appraisees+ROs |
| Failure Handling | Partial materialise rolled back atomically; unresolved chains → `PRECONDITION_FAILED`; apex unconfigured → held form |
| Dependencies | G01 (chain), G09 (charge), X.2, P01 |
| Test Guidance | Unit: date validation, eligibility, truncation. Integration: idempotent open, incremental joiners, atomic rollback, sealed-at-open |

---

### FR-G08-02 — Goal / Objective Setting (employee×period, cascading, weightages, snapshot-on-lock)

- **Module:** G08
- **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As an officer, I want to set weighted KRAs/KPIs aligned to my reporting officer's objectives — even before a form opens and across cycles — so my appraisal is measured against agreed, cascaded goals, while the statutory record stays immutable.

**Description.** Goals are the **M09 `goals` within the employee's active `goal_plan`** (E5); they may be drafted before a form exists (`form_id` null) and span cycles (`period_scope=CROSS_CYCLE`). ROs review/return/approve. On **goal-lock**, the system writes an **immutable snapshot** (E20) of approved goals into the statutory form; thereafter the roll-up reads the snapshot, not the live goal. Weightage is governed by **`VAL-WEIGHTAGE/WSUM`** (perf siblings sum 100, DEVELOPMENT excluded), sub-goals by **`VAL-SUBWSUM`**, names by **`VAL-GOALNAME`**.

**Acceptance Criteria.**
1. A goal can be owned by an appraisee with no form yet (`form_id` null) and optionally `cycle_id` null for cross-cycle objectives. **(R6)**
2. Sibling APPROVED performance goals sum to 100% before goal-lock via `VAL-WEIGHTAGE/WSUM`; DEVELOPMENT excluded. **(R21)**
3. A goal may cascade from an RO/skip-level goal (`parent_goal_id`/`cascaded_from_employee_id`); `VAL-FLOW-NOCYCLE` prevents cascade cycles.
4. RO can return a goal with comments (PROPOSED→DRAFT); appraisee resubmits.
5. **Goal-lock writes an immutable `form_goal_snapshots` row per approved goal** and transitions GOALS_PENDING→GOALS_APPROVED; the snapshot is append-only. **(R6)**
6. Post-lock changes to the live goal do not alter the snapshot; a re-snapshot occurs only through a controlled re-lock (audited via P05).

**Business Rules.**
- BR1: Weightage ∈ (0,100]; performance total = 100 ±0.01; DEVELOPMENT outside the sum.
- BR2: Only RO may APPROVE; appraisee cannot self-approve (P02 SoD).
- BR3: Revisions after lock require RO approval + reason (`ERR-REASON-REQ`); statutory roll-up uses the snapshot until a controlled re-lock.
- BR4: DROPPED goals excluded from weightage sum and roll-up.
- BR5: The statutory form never live-references E5; it references E20 only.

**Data Model References.** E5 (M09 goals create/approve/revise), E20 (immutable copy), E4 (status transition), `employees` (cascade source), M09 `goal_plans` (owning plan).

**API References.** `POST /api/v1/g08/goals` (form-less allowed) · `PUT /api/v1/g08/goals/{goalId}` · `POST /api/v1/g08/goals/{goalId}/approve` · `POST /api/v1/g08/goals/{goalId}/return` · `POST /api/v1/g08/forms/{formId}/goals/lock` (Idempotency-Key) · `GET /api/v1/g08/forms/{formId}/goal-snapshots?limit=&cursor=`

**UI Behavior Notes.** Goal board with weightage meter (running total of performance goals, red until 100; DEVELOPMENT shown separately as "outside sum"). Cascade picker shows RO/skip-level goals. "Carry forward / cross-cycle" toggle. Lock shows a snapshot-preview confirming the immutable statutory record.

**Edge Cases.** Weight ≠ 100 at lock (block with delta); DEVELOPMENT counted (excluded); cascade parent dropped (warn); cross-cycle objective in two forms (each its own snapshot); concurrent edits (optimistic lock `updated_at` / `If-Match`); appraisee edits snapshot (forbidden).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `GoalService` (M09), `WeightageValidator` (`VAL-WEIGHTAGE/WSUM/SUBWSUM`), `CascadeResolver`, `GoalLockService`, `SnapshotWriter` |
| Backend Flow | CRUD goals (form-less ok) → RO approve/return → lock validates perf sum + all-approved → write E20 in txn → transition form |
| Data Operations | INSERT/UPDATE E5; INSERT E20 (append-only); UPDATE E4.status; P05 captures |
| Validation | `VAL-WEIGHTAGE/WSUM/SUBWSUM/GOALNAME`, transition legality, role check, optimistic lock |
| Authorization | P02: appraisee own goals; RO on reports; org-scoped |
| State Changes | goal DRAFT↔PROPOSED→APPROVED→REVISED; form GOALS_PENDING→GOALS_APPROVED; notify |
| Failure Handling | Lock fails with `VALIDATION_FAILED` (weightage delta); snapshot atomic with transition |
| Dependencies | FR-G08-01, M09 goal model, G01 chain |
| Test Guidance | Unit: weightage sum (dev excluded), transition matrix. Integration: form-less drafting, cross-cycle, snapshot immutability, re-lock audit |

---

### FR-G08-03 — Self-Appraisal Submission

- **Module:** G08 · **Primary Role(s):** Appraisee
- **User Story:** As an officer, I want to record my achievements, self-ratings and constraints so the appraising officers have my account of the year.

**Description.** Appraisee completes the **M09 self review** (E7): achievement narrative, per-goal self-ratings/achievement % (`VAL-ACHV`), competency self-ratings, constraints, training needs. Submission locks self-edit and advances the form to RO_ASSESSMENT. RO may RETURN before assessing.

**Acceptance Criteria.**
1. Submittable only when form is SELF_APPRAISAL and goals are APPROVED (snapshot exists).
2. Achievements narrative mandatory (`VAL-REQUIRED`); per-goal self-ratings within scale bounds.
3. Submission timestamps `submitted_at`, sets SUBMITTED, advances form to RO_ASSESSMENT.
4. RO can RETURN (→SELF_APPRAISAL) with comments; appraisee resubmits.
5. After RO begins assessment, the self-appraisal is read-only to the appraisee.

**Business Rules.** BR1: Exactly one self-appraisal per form. BR2: Self-ratings advisory; do not auto-populate RO grades. BR3: Missing self-appraisal at RO due date allows RO to proceed with a recorded flag.

**Data Model References.** E7 (create/submit), E20 (per-goal self rating vs frozen goals), E4 (status transition).

**API References.** `GET/PUT /api/v1/g08/forms/{formId}/self-appraisal` · `POST .../self-appraisal/submit` · `POST .../self-appraisal/return`

**UI Behavior Notes.** Tabbed form (Summary / Goals / Competencies / Constraints & Needs). Autosave drafts. Submit confirmation summarising goals and self-grades. Read-only after RO start.

**Edge Cases.** Submit before goals approved (forbidden, 412); rating out of bounds (reject); resubmit after return; deadline passed (RO override → FR-G08-19 escalation).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SelfAppraisalService` (M09 review), `ScaleValidator`, `FormTransitionService` |
| Backend Flow | Upsert draft → validate on submit → transition form → notify RO (X.2) |
| Data Operations | UPSERT E7; read E20; UPDATE E4.status; P05 captures |
| Validation | Narrative present, scale bounds, single-per-form, status gate |
| Authorization | P02: appraisee on own form; RO return only |
| State Changes | self DRAFT→SUBMITTED/RETURNED; form SELF_APPRAISAL→RO_ASSESSMENT |
| Failure Handling | OOB → `VALIDATION_FAILED` field-level; return preserves draft |
| Dependencies | FR-G08-02 |
| Test Guidance | Unit: bounds, single-per-form. Integration: submit/return loop, no-submission override |

---

### FR-G08-04 — Reporting Officer Assessment (APAR Tier 1, multi-RO aware, digitally signed)

- **Module:** G08 · **Primary Role(s):** Reporting Officer
- **User Story:** As a reporting officer, I want to assess my subordinate's goals and competencies for the period I supervised, certify integrity, write the pen-picture and assign a part-period grade, signed with my DSC, so the APAR can proceed to review.

**Description.** Each RO records section/goal grades, competency assessed-levels, the statutory **integrity** certification, the **pen-picture**, and a part-period grade scoped to their `appraisal_report_periods` row (E19). Submission is a **P01 approve action** that creates a REPORTING `appraisal_assessments` row, **requires a DSC/eSign signature (E23)**, and — once all periods are SUBMITTED/NO_REPORT — aggregates (supervision-weighted) to `provisional_grade` and advances to RVO_REVIEW. An adverse part-period grade must cite disclosable evidence (`VAL-G08-ADVEVID`).

**Acceptance Criteria.**
1. Integrity certification mandatory; if not BEYOND_DOUBT, `integrity_remark` required.
2. Pen-picture meets `penpicture_min_words` if configured.
3. Part-period grade within scale bounds; section grades roll up per `weightage_policy`.
4. Submission writes a REPORTING assessment with a valid `signature_id` (R10); when all periods complete, supervision-weighted aggregate sets `provisional_grade` and advances to RVO_REVIEW. **(R4)**
5. RO may RETURN the self-appraisal before assessing.
6. **(R5)** An adverse/below-benchmark part-period grade requires non-empty `adverse_evidence_refs` to disclosable evidence; anonymous MSF / restricted feedback cannot be the sole basis.

**Business Rules.** BR1: An RO may assess only their assigned period(s); cannot be the appraisee (P02 SoD). BR2: Adverse provisional grade requires disclosable-evidence substantiation. BR3: CRITICAL/MODERATE competency gaps flag for FR-G08-12 nomination. BR4: RO assessment immutable after RvO begins (anchored by the DSC + P05). BR5: A period below `min_supervision_months` is a No-Report Certificate (FR-G08-18).

**Data Model References.** E8 (create REPORTING per period), E19 (period scope/aggregation), E23 (DSC), E4 (integrity/pen_picture/provisional/adverse_refs/status), E9 (competency), E20 (ro_rating vs frozen goals).

**API References.** `GET /api/v1/g08/forms/{formId}/assessment/reporting?periodId=` · `PUT .../assessment/reporting` · `POST .../assessment/reporting/submit` (Idempotency-Key; P01 approve)

**UI Behavior Notes.** Plain-language tier banner: "You are the Reporting Officer for period 1 (Apr–Oct). You may grade and comment." (R17) Split view: appraisee self-input vs RO input. Integrity selector with conditional remark. Word-count meter. Adverse grade reveals a mandatory "attach disclosable evidence" picker (`VAL-FILE`). DSC sign step on submit. Multi-RO progress strip per period.

**Edge Cases.** Self-appraisal not submitted (proceed with flag); integrity NOT_CERTIFIED without remark (block); adverse without evidence (block — `VALIDATION_FAILED`/`VAL-G08-ADVEVID`); grade roll-up mismatch (recompute server-side); RO transferred mid-period (split per FR-G08-18); RO unresponsive (FR-G08-19); DSC token failure (abort, no state change).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ROAssessmentService`, `IntegrityValidator`, `GradeRollupEngine`, `CompetencyGapDetector`, `ReportPeriodAggregator`, `SignatureService` (X.3), `AdverseEvidenceGuard` |
| Backend Flow | Upsert draft → validate integrity/penpicture/grades/evidence → sign (DSC via X.3) → P01 approve → persist assessment+period → when all periods done aggregate → detect gaps → transition |
| Data Operations | INSERT E8(REPORTING)+E23; UPDATE E19/E4; UPSERT E9; UPDATE E20-linked ratings; P05 captures |
| Validation | Integrity rule, min-words, scale bounds, roll-up consistency, role identity, `VAL-G08-ADVEVID`, signature validity |
| Authorization | P02: only the period's RO; org-scoped; self-block |
| State Changes | form RO_ASSESSMENT→RVO_REVIEW on full aggregation; gap flags; notify RvO |
| Failure Handling | Missing remark/evidence → `VALIDATION_FAILED`; DSC fail → `PRECONDITION_FAILED`(`ERR-G08-SIGN`); roll-up authoritative server-side |
| Dependencies | FR-G08-02/03/07/12/18/20 |
| Test Guidance | Unit: integrity conditional, roll-up & supervision-weighted aggregation, evidence guard. Integration: multi-RO submit, signed immutability, gap detection |

---

### FR-G08-05 — Reviewing Officer Review (APAR Tier 2)

- **Module:** G08 · **Primary Role(s):** Reviewing Officer
- **User Story:** As a reviewing officer, I want to concur with or vary the reporting officer's assessment with recorded reasons, signed with my DSC, so the APAR reflects a second, independent scrutiny.

**Description.** RvO views all RO part-period assessments, concurs (carries the aggregated grade forward) or varies (sets `reviewed_grade` with mandatory `variance_reason`), may add remarks, and signs. Completing (P01 approve) advances to AA_ACCEPTANCE. RvO may RETURN to RO (P01 sendBack).

**Acceptance Criteria.**
1. RvO records `concurs_with_lower_tier`; if false, `variance_reason` and `reviewed_grade` required (`ERR-REASON-REQ`).
2. `reviewed_grade` within scale bounds.
3. Completion writes REVIEWING assessment with a valid DSC and advances to AA_ACCEPTANCE.
4. RvO may RETURN to RO (→RO_ASSESSMENT) with comments.
5. RvO cannot be any RO or the appraisee; declared COI triggers recusal (R22) — enforced by P02 + E22.
6. **(R5)** A downward variance crossing the adverse threshold must include substantiating disclosable evidence.

**Business Rules.** BR1: Downward variance crossing adverse threshold needs remarks + evidence. BR2: RvO review immutable after AA begins (DSC + P05). BR3: **(R12)** If RO and RvO collapse by org structure, `chain_truncation_policy` designates an alternate or records SINGLE_TIER/NO_RVO — escalation, never silent collapse.

**Data Model References.** E8 (create REVIEWING), E23 (DSC), E22 (recusal), E4 (reviewed_grade/status).

**API References.** `GET/PUT /api/v1/g08/forms/{formId}/assessment/reviewing` · `POST .../assessment/reviewing/submit` · `POST .../assessment/reviewing/return` · `POST /api/v1/g08/forms/{formId}/recuse`

**UI Behavior Notes.** Plain-language banner: "You are the Reviewing Officer. You may agree or change the grade with a reason." (R17) RO part-period assessments shown read-only beside RvO input. Concur toggle reveals variance fields. Grade-delta indicator. COI "declare conflict / recuse" action. DSC sign on submit.

**Edge Cases.** RvO == any RO (block, require alternate/truncation config); variance without reason/evidence (block); RvO acts after AA started (forbidden); COI declared (recuse, route to alternate); RvO unresponsive (FR-G08-19).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RvOReviewService`, `VarianceValidator`, `FormTransitionService` (P01), `SignatureService`, `RecusalService`, `AdverseEvidenceGuard` |
| Backend Flow | Load RO assessments → validate concur/variance/evidence → sign → P01 approve REVIEWING → set reviewed_grade → transition |
| Data Operations | INSERT E8(REVIEWING)+E23; optional INSERT E22; UPDATE E4; P05 captures |
| Validation | Variance reason conditional, scale bounds, role identity, tier ordering, COI, signature, adverse evidence |
| Authorization | P02: only resolved RvO; not RO/appraisee; COI-blocked |
| State Changes | form RVO_REVIEW→AA_ACCEPTANCE or →RO_ASSESSMENT (return); notify AA/RO |
| Failure Handling | Same-person/COI → `FORBIDDEN`(`ERR-G08-TIERCONFLICT`/`ERR-G08-COI`); missing reason → `VALIDATION_FAILED`; DSC fail → `PRECONDITION_FAILED` |
| Dependencies | FR-G08-04, FR-G08-19/20/22 |
| Test Guidance | Unit: variance conditional, tier order. Integration: concur vs vary, return-to-RO, conflict/COI block, signed review |

---

### FR-G08-06 — Accepting Authority Acceptance (APAR Tier 3, digitally signed)

- **Module:** G08 · **Primary Role(s):** Accepting Authority
- **User Story:** As the accepting authority, I want to settle the final grade and certify the APAR with MFA step-up and my DSC so it can be disclosed and posted to the service register — and, where calibration ran, ratify or decline the committee's recommendation.

**Description.** AA reviews RO (per-period) and RvO assessments, settles `final_grade` (reason if differing from `reviewed_grade`), and certifies with **P02 MFA step-up + DSC**. Certification derives `final_grade_label`, `is_adverse`, `below_benchmark`, writes an ACCEPTING assessment (CERTIFIED) with `certification_signature_id`, maps the grade to the M09 `contribution_level`, and advances to DISCLOSURE (or certifies a pre-certification calibration recommendation; post-certification recommendations require explicit ratification — FR-G08-09).

**Acceptance Criteria.**
1. AA settles `final_grade` within scale bounds; deviation from `reviewed_grade` requires reason.
2. Certification derives label/adverse/benchmark flags server-side (never client).
3. Certification requires **MFA step-up AND a valid DSC** (`certification_signature_id` set) (R10).
4. AA cannot be any RO, RvO or appraisee; declared COI triggers recusal (R22).
5. Once certified, grade fields immutable except via **ratified** calibration (R1) or representation.
6. **(R1)** A certified grade is never mutated by a committee; only the AA/competent authority ratifying a recommendation (with DSC) may change it.
7. **(R7)** After certification the form proceeds to mandatory DISCLOSURE; there is no non-disclosure branch.

**Business Rules.** BR1: Adverse final grade mandates the disclosure path and substantiating disclosable evidence across tiers. BR2: AA certification is a guarded P01 action requiring step-up + DSC. BR3: AA may RETURN to RvO once with reasons. BR4: **(R3)** A form with `sealed_cover=true` cannot be certified to FINALISED/POSTED; it parks in SEALED_COVER (FR-G08-17).

**Data Model References.** E8 (ACCEPTING CERTIFIED), E23 (AA DSC), E21 (ratify pre/post-cert), E4 (final_grade/flags/signature/status), E3 (derive label/flags + contribution-level map).

**API References.** `GET/PUT /api/v1/g08/forms/{formId}/assessment/accepting` · `POST .../assessment/accepting/certify` (Idempotency-Key; step-up) · `POST .../assessment/accepting/return`

**UI Behavior Notes.** Plain-language banner stating AA authority. Multi-column compare (RO periods / RvO / AA). Final-grade input bounded by scale; deviation reason on change. If a calibration recommendation exists, a "ratify / decline with reason" panel. Certify requires MFA step-up then DSC signing ceremony. Post-certify badges (adverse/benchmark). Sealed-cover forms show a locked "Sealed — cannot certify" banner.

**Edge Cases.** AA deviates downward to adverse (force evidence + disclosure); pre-cert recommendation present (certify recommended value); sealed cover active (block certify); DSC/step-up fail (abort); COI declared (recuse).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AAAcceptanceService`, `GradeDerivationService`, `StepUpAuthGuard` (P02), `SignatureService`, `RecommendationRatifier`, `FormTransitionService`, `SealedCoverGuard` |
| Backend Flow | Load tiers → validate final grade/deviation/evidence → P02 step-up → DSC sign → (ratify if any) → derive flags + contribution-level → persist ACCEPTING + form → route to DISCLOSURE/SEALED_COVER |
| Data Operations | INSERT E8(ACCEPTING)+E23; UPDATE E4; UPDATE E21 if ratified; P05 captures |
| Validation | Scale bounds, deviation reason, role identity, COI, step-up token, DSC validity, sealed-cover guard |
| Authorization | P02: only resolved AA; not RO/RvO/appraisee; COI-blocked; MFA step-up + DSC |
| State Changes | form AA_ACCEPTANCE→DISCLOSURE / SEALED_COVER; notify HR/custodian |
| Failure Handling | Step-up/DSC fail → `UNAUTHENTICATED`/`PRECONDITION_FAILED`, no mutation; sealed → `CONFLICT`(`ERR-G08-SEALED`); deviation w/o reason → `VALIDATION_FAILED` |
| Dependencies | FR-G08-05/07/09/08/17/20 |
| Test Guidance | Unit: derivation, routing matrix, ratify path. Integration: certify with/without pre-cal recommendation, adverse routing, sealed-cover block, step-up+DSC abort |

---

### FR-G08-07 — Rating Scales & Numeric Grade Computation (explicit weightage policy)

- **Module:** G08 · **Primary Role(s):** System Administrator (config), all assessors (consume)
- **User Story:** As an administrator, I want configurable rating scales with benchmark/adverse thresholds and a deterministic, well-specified grade roll-up so every grade is computed consistently and defensibly.

**Description.** Defines `rating_scales` (numeric range, ordered bands, benchmark/adverse thresholds, precision, contribution-level map) and the deterministic roll-up. **The weightage policy is explicit (R21):** performance goals sum to 100 (`VAL-WEIGHTAGE/WSUM`); DEVELOPMENT goals sit outside; competencies score separately; final grade = `goal_split_pct × goal_score + competency_split_pct × competency_score` (splits sum 100). The roll-up reads the **frozen `form_goal_snapshots`** (E20), not live goals.

**Acceptance Criteria.**
1. Grade bands contiguous, non-overlapping, covering `[min,max]`.
2. **Goal score** = Σ(snapshot_goal_score × snapshot_weightage)/100 over performance goals; **competency score** per template; **final** = goal_split·goalScore + comp_split·compScore, rounded to `decimal_places`. **(R21)**
3. `label` resolved from bands; `benchmark_grade`/`adverse_threshold` produce `below_benchmark`/`is_adverse`.
4. Scales in use by an active cycle are RETIRE-locked, not edited.
5. The same roll-up function is the single source used by RO/RvO/AA stages and analytics.
6. DEVELOPMENT goals never contribute to the performance sum or the final numeric grade.

**Business Rules.** BR1: `min < max`; `adverse_threshold ≤ benchmark_grade ≤ max`; `goal_split_pct + competency_split_pct = 100`. BR2: Changing a scale/policy requires a new ACTIVE version; historical forms keep their original via snapshot. BR3: Rounding half-up at scale precision; documented.

**Data Model References.** E3 (define/retire), E2 (weightage_policy), E20 (frozen weights/scores), E4 (grade fields/labels/flags), E8 (section/overall grades).

**API References.** `POST/PUT /api/v1/g08/rating-scales` · `GET /api/v1/g08/rating-scales?limit=&cursor=` · `POST /api/v1/g08/forms/{formId}/grade/preview`

**UI Behavior Notes.** Scale builder with band editor validating contiguity. Weightage-policy editor showing the goal/competency split and an explicit "DEVELOPMENT goals are outside the 100% sum" note. Grade preview reused across all assessment stages.

**Edge Cases.** Overlapping bands (block); boundary grade (inclusive-lower); zero-weight goals (excluded); split ≠ 100 (block); precision mismatch (single function enforces); DEVELOPMENT weighted >0 (warn).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `RatingScaleService`, `GradeRollupEngine` (pure function over snapshots), `BandResolver`, `WeightagePolicyValidator` (`VAL-WEIGHTAGE/WSUM`) |
| Backend Flow | CRUD scales with contiguity validation; roll-up engine consumed by FR-04/05/06/09/16 reading E20 |
| Data Operations | INSERT/UPDATE E3; read E20; P05 captures |
| Validation | Band contiguity/coverage, threshold ordering, split=100, precision |
| Authorization | P02: Sys Admin config; assessors read/preview only |
| State Changes | scale ACTIVE↔RETIRED; no direct form mutation (preview only) |
| Failure Handling | Invalid bands → `VALIDATION_FAILED` with band index; retire-locked edit → `CONFLICT`; split≠100 → `VALIDATION_FAILED` |
| Dependencies | consumed by FR-04/05/06/09/14/16 |
| Test Guidance | Unit: contiguity, two-part roll-up math (dev excluded), boundary rounding. Property: monotonic label mapping |

---

### FR-G08-08 — Mandatory Disclosure & Representation / Appeal (with escalation ladder)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, Appraisee, Accepting/Competent/Condonation Authority
- **User Story:** As an officer, I want the **entire** APAR disclosed to me with a clear appeal clock, and a complete representation ladder up to an external tribunal, so the process is fair, transparent and statutorily compliant.

**Description.** After certification, HR discloses the **full** APAR — every grading and remark — to the appraisee (R7). The system records `dispatched_at` and (on eSign acknowledgement) `acknowledged_at`; the representation window starts per `representation_clock_start` and deemed-disclosure (`JOB-M09-AUTOACK`) still opens the window (R8). The appraisee may file a `representation` within the window; late filings require condonation. A competent authority (senior to AA, not in chain, no COI) adjudicates within `disposal_deadline_at` (`JOB-G08-REP-SLA`). Outcomes: UPHELD / PARTIALLY_UPHELD / REJECTED / EXPUNGED / MODIFIED / ESCALATED_EXTERNAL. A rejected representation may escalate to an external tribunal (CAT). Expunction/modification updates the final grade via a DSC-signed path and re-discloses. The whole flow runs on **P01**.

**Acceptance Criteria.**
1. **(R7)** The entire report is disclosed to every officer — no favourable-non-disclosure option. Disclosure transitions to DISCLOSED, sets `dispatched_at`/`disclosed_at`, appends DISPATCHED+DISCLOSED to `apar_disclosure_log`, notifies appraisee (X.2).
2. **(R8)** `representation_window_start_at` = dispatch or acknowledgement per cycle config; non-ack after `deemed_disclosure_days` sets deemed-disclosure and still starts the window. Both timestamps recorded.
3. Representation filed within the window; late filings set `is_late=true` and require condonation by the Condonation Authority. **(R20)**
4. Adjudication records decision/authority/reason within `disposal_deadline_at`; MODIFIED sets `revised_grade`; EXPUNGED nullifies the adverse remark and recomputes flags; both require a DSC.
5. **(R20)** A REJECTED representation can be ESCALATED (escalation_level++) and, for an external tribunal, `external_reference` (CAT/HIGH_COURT/TRIBUNAL) + `external_ref_no` recorded; status ESCALATED — the chain is closed, not dangling.
6. Every disclosure/view/download/denied access recorded in `apar_disclosure_log` (P05 + OPEN-PLAT-03).

**Business Rules.** BR1: Disclosure mandatory; only channel/timing configurable. BR2: A representation may contest only items present in the disclosed APAR. BR3: The adjudicating authority must be senior to AA, not in the chain, free of COI (P02). BR4: Post-adjudication the form returns to FINALISED with a new DSC-signed grade snapshot; prior grade preserved. BR5: An adverse remark resting on undisclosed/anonymous material is re-examined against the disclosable-evidence rule; unsubstantiated adverse remarks are expunged.

**Data Model References.** E13 (file/adjudicate/escalate/condone), E4 (clock/flags), E18 (append events), E23 (adjudication/expunction signature), `documents` (G13).

**API References.** `POST /api/v1/g08/forms/{formId}/disclose` · `POST .../acknowledge` · `POST .../representations` · `POST /api/v1/g08/representations/{repId}/condone` · `POST .../decide` · `POST .../escalate` · `GET /api/v1/g08/forms/{formId}/disclosure-log?limit=&cursor=`

**UI Behavior Notes.** Disclosure viewer with watermark + eSign acknowledge; a clear "your representation window: opens DD-MMM-YYYY (from dispatch), closes DD-MMM-YYYY" banner (R8). Representation form with item-pickers tied to disclosed remarks and document upload. Adjudication console for competent authority with DSC. Condonation panel. Escalation action capturing external tribunal reference. SLA + disposal-deadline countdown badges.

**Edge Cases.** Late representation (condonation); deemed-disclosure on non-ack (window opens, logged); EXPUNGED grade crossing back above benchmark (recompute eligibility feed FR-G08-14); multiple representations (sequence; second blocked until first decided); REJECTED → external CAT (status ESCALATED); adjudicator with COI (recuse).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `DisclosureService`, `RepresentationService` (P01), `AdjudicationService`, `CondonationService`, `EscalationService`, `DisclosureLogger`, `GradeDerivationService`, `SignatureService` |
| Backend Flow | Disclose (mandatory, full) → log+notify → ack/deemed (`JOB-M09-AUTOACK`) → start window → file rep (window/condonation) → adjudicate (DSC) → recompute grade/flags → re-disclose if changed → escalate/external if rejected |
| Data Operations | INSERT E13; UPDATE E4; INSERT E18; INSERT E23; link G13 documents; G12 event on expunction; P05 captures |
| Validation | Post-disclosure gate, window/clock config, contested-item membership, authority seniority + COI, condonation authority, disposal deadline |
| Authorization | P02: HR disclose; appraisee file own + eSign; competent authority adjudicate (not in chain, no COI); condonation authority |
| State Changes | form DISCLOSURE→DISCLOSED→REPRESENTATION→FINALISED; rep FILED→UNDER_REVIEW→DECIDED/ESCALATED→CLOSED; flags recomputed |
| Failure Handling | Out-of-window → `CONFLICT`(`ERR-G08-REPWINDOW`); denied access logged ACCESS_DENIED; missing DSC → `PRECONDITION_FAILED` |
| Dependencies | FR-G08-06/07, G13, FR-G08-14, FR-G08-20 |
| Test Guidance | Unit: clock-start matrix, window gate, escalation. Integration: full disclose→represent→expunge→recompute→re-disclose, condonation, external CAT handoff |

---

### FR-G08-09 — Calibration / Normalisation as a Ratified Recommendation (Phase-2, flagged)

- **Module:** G08 · **Primary Role(s):** Calibration Committee Member, Accepting/Competent Authority, HR/APAR Cell
- **User Story:** As a calibration committee, we want to surface comparability and outliers across a population and **recommend** grade changes that a competent authority ratifies — so ratings are fair and comparable without any committee unlawfully overriding a certified grade.

**Description.** (Flag `g08.calibration`, Phase-2.) HR convenes an **M09 `calibration_session`** (E14) over an org-scoped population (P02) using **COMMITTEE_REVIEW or NORMALISATION** (BELL_CURVE only if `g08.bell-curve`; **FORCED_DISTRIBUTION removed**, R2). Grading is **absolute**; `target_distribution` (`VAL-DISTRIB`) is **diagnostic-only**. The committee produces `calibration_recommendations` (proposed grade + mandatory rationale + vote). **A certified `final_grade` changes only when the AA/competent authority ratifies with MFA step-up + DSC** (creating a `calibration_adjustments` row), or — if `runs_before_certification` — the AA certifies the recommended value (R1). Members with self/chain/COI on a form cannot vote (R22).

**Acceptance Criteria.**
1. Only forms within scope and at/after RvO (pre-cert) or certified (post-cert ratification) enter a session.
2. Every recommendation requires a non-empty `rationale`; the committee never writes `final_grade`. **(R1)**
3. Distribution view shows current vs target as **diagnostic only** (`VAL-DISTRIB`); no action enforces a quota. **(R2)**
4. A certified grade changes only via a RATIFIED recommendation → `calibration_adjustments` signed by AA/competent authority, preserving `pre_calibration_grade` and recomputing flags. **(R1)**
5. A member who is RO/RvO/AA/appraisee for a form, or with declared COI, cannot vote (recusal recorded). **(R22)**
6. `FORCED_DISTRIBUTION` unavailable; `BELL_CURVE` disabled by default. **(R2)**

**Business Rules.** BR1: Calibration produces recommendations only; the legal grade mutation is always an authority's signed act. BR2: Magnitude beyond a configured threshold requires committee quorum. BR3: A downward recommendation crossing the adverse threshold must cite disclosable evidence and, on ratification, forces the disclosure path. BR4: Target distributions are diagnostic; the system must not auto-apply or pressure grades.

**Data Model References.** E14 (M09 session), E21 (propose/vote), E15 (applied after ratification), E22 (recusal), E23 (ratification DSC), E4 (grades/flags).

**API References.** `POST /api/v1/g08/calibration/sessions` · `GET /api/v1/g08/calibration/sessions/{id}/distribution` (diagnostic) · `POST .../recommendations` · `POST /api/v1/g08/calibration/recommendations/{id}/vote` · `POST .../ratify` (step-up) · `POST .../decline`

**UI Behavior Notes.** Distribution histogram (current vs target) labelled "diagnostic — not a quota". Recommendation cards with mandatory rationale and committee vote. A separate **Ratification** screen for the AA/competent authority ("Ratify (sign) / Decline (reason)"). COI "recuse" control. No drag-to-quota interaction.

**Edge Cases.** Borderline adverse/below-benchmark (recompute on ratification); member self/chain/COI (exclude vote, record recusal); session cancelled after partial ratifications (applied stay); empty population (block); AA declines (no grade change, logged); bell-curve flag off (method unavailable).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CalibrationSessionService` (M09), `DistributionEngine` (diagnostic), `RecommendationService`, `QuorumValidator`, `RecommendationRatifier`, `RecusalService`, `SignatureService`, `GradeDerivationService` |
| Backend Flow | Convene → load population → compute diagnostic distribution → propose/vote → AA/competent authority ratifies (step-up+DSC) → write E15 → recompute flags |
| Data Operations | INSERT E14/E21; on ratify INSERT E15+E23; UPDATE E4; optional INSERT E22; P05 captures |
| Validation | Rationale present (`ERR-REASON-REQ`), scope/status gate, conflict/COI exclusion, quorum, magnitude threshold, ratification signature |
| Authorization | P02: members propose/vote (no self/chain/COI); AA/competent authority ratify; HR convene |
| State Changes | session PLANNED→IN_SESSION→RECOMMENDED→RATIFIED→COMPLETED; form grade changes only on ratification |
| Failure Handling | Missing rationale → `VALIDATION_FAILED`; conflict/COI vote → `FORBIDDEN`; unratified apply → `CONFLICT`(`ERR-G08-RATIFY`); quorum unmet → `CONFLICT` |
| Dependencies | FR-G08-06/07; FR-G08-20; precedes FR-G08-08 |
| Test Guidance | Unit: diagnostic distribution math, quorum, no-forced-distribution. Integration: recommend→ratify→apply→recompute, AA-decline, COI exclusion, pre-cert path |

---

### FR-G08-10 — Continuous Feedback & Check-Ins (Phase-2, flagged)

- **Module:** G08 · **Primary Role(s):** Appraisee, Reporting Officer
- **User Story:** As a manager and employee, we want lightweight, year-round feedback and goal check-ins so the appraisal is grounded in continuous evidence rather than recency bias.

**Description.** (Flag `g08.continuous-feedback`, Phase-2.) Reuses **M09 continuous manager feedback + two-way thread**. Authenticated users record `continuous_feedback` on a subject with controlled visibility, optionally linked to a goal (employee×period). Appraisees and ROs log `goal_checkins` with progress %. These surface as evidence during RO assessment — but **visibility-restricted feedback cannot be the sole basis of an adverse remark** (R5).

**Acceptance Criteria.**
1. Feedback respects `visibility` (P02 field mask); PRIVATE_TO_SUBJECT hidden from the manager and vice-versa.
2. Check-ins update goal progress/timeline; do not change the final rating automatically.
3. Feedback/check-ins surfaced (read-only) in RO assessment, **labelled by disclosability** (R5).
4. Subject can acknowledge feedback (two-way thread reply via `parent_feedback_id`).
5. Feedback immutable after acknowledgement except by author within an edit window.

**Business Rules.** BR1: Continuous feedback authors are named (no anonymity); MSF anonymity is separate (FR-G08-11). BR2: No deletion of constructive feedback to manipulate the record (soft-delete only, P05 audited). BR3: Check-in progress is advisory evidence. BR4: MANAGER_ONLY / PRIVATE feedback is non-disclosable and cannot be the sole adverse reference.

**Data Model References.** E10 (create/acknowledge/thread), E6 (create), E5 (progress linkage).

**API References.** `POST /api/v1/g08/feedback` · `GET /api/v1/g08/feedback?subjectId=&limit=&cursor=` · `POST /api/v1/g08/feedback/{id}/acknowledge` · `POST /api/v1/g08/goals/{goalId}/checkins`

**UI Behavior Notes.** Feedback feed on employee profile; visibility selector with clear labels and a "disclosable?" indicator. Goal timeline with check-in markers. RO assessment evidence panel distinguishing disclosable items.

**Edge Cases.** Visibility downgrade after creation (P05 audited); feedback on inactive employee (block); check-in progress > 100 (`VAL-ACHV` clamp); cross-org feedback (P02 scope check); cite restricted feedback as sole adverse basis (block at FR-04).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FeedbackService` (M09), `CheckinService`, `VisibilityResolver` (P02), `EvidenceAggregator`, `DisclosabilityTagger` |
| Backend Flow | Create feedback/check-in → enforce visibility → tag disclosability → aggregate for assessment |
| Data Operations | INSERT E10/E6; UPDATE E5 progress; P05 captures |
| Validation | Visibility enum, `VAL-ACHV`, org scope, edit-window |
| Authorization | P02: authenticated org-scoped; subject acknowledge; author edit window |
| State Changes | feedback acknowledged; goal progress updated; no grade change |
| Failure Handling | Progress OOB → `VALIDATION_FAILED`; visibility breach → `FORBIDDEN` at serialization |
| Dependencies | FR-G08-02, FR-G08-04 |
| Test Guidance | Unit: visibility mask, clamp, disclosability tag. Integration: evidence aggregation, soft-delete audit, adverse-sole-basis block |

---

### FR-G08-11 — Multi-Source / 360-Degree Feedback (Phase-2, flagged)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, Reporting Officer, Raters
- **User Story:** As an organisation, we want multi-rater (peer/subordinate/customer) feedback so appraisals capture a rounded view — without anonymous input ever becoming the sole basis of an adverse statutory remark.

**Description.** (Flag `g08.msf-360`, Phase-2.) Reuses **M09 Multi-Source Feedback**. For eligible forms, HR/RO nominate raters across relationships. Raters submit `feedback_360_responses` (per-competency scores + qualitative). Responses aggregate respecting anonymity and minimum-N suppression and surface as input to RO assessment. **Anonymous MSF cannot be the sole basis of an adverse/below-benchmark remark** (R5).

**Acceptance Criteria.**
1. Raters nominated with a relationship type; the appraisee cannot rate themselves.
2. Anonymous responses aggregated only when ≥ minimum-N raters of that relationship responded.
3. A rater submits exactly one response per request; declines/expiries tracked.
4. Aggregated view read-only evidence in RO assessment; individual anonymous responses never attributable; **a MSF aggregate alone cannot substantiate an adverse entry** (R5).
5. MSF windows align to cycle dates.

**Business Rules.** BR1: Minimum-N (default 3) protects anonymity; below-N buckets show "insufficient responses". BR2: External raters use a scoped, time-boxed access token (no full system access). BR3: MSF informs but does not directly set the APAR grade and cannot be the sole adverse basis.

**Data Model References.** E11 (nominate/track), E12 (submit/aggregate), E9 (optional input).

**API References.** `POST /api/v1/g08/forms/{formId}/360/requests` · `GET /api/v1/g08/360/requests/assigned?limit=&cursor=` · `POST /api/v1/g08/360/requests/{id}/respond` · `GET /api/v1/g08/forms/{formId}/360/summary`

**UI Behavior Notes.** Nomination grid by relationship. Rater questionnaire (mobile-friendly). Summary radar/bar with anonymity-suppressed buckets clearly labelled. RO view marks MSF as "non-disclosable — supporting only, not sole adverse basis".

**Edge Cases.** Fewer than N respond (suppress); rater leaves org mid-window (expire); duplicate submission (block); external token expiry (deny clearly); base adverse remark solely on MSF (block at FR-04).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `Feedback360Service` (M09 MSF), `RaterTokenService`, `AggregationEngine`, `AnonymitySuppressor` |
| Backend Flow | Nominate → dispatch invites (X.2) → collect → aggregate with min-N suppression → expose summary |
| Data Operations | INSERT E11/E12; read for aggregation; P05 captures |
| Validation | Self-rating block, one-per-request, min-N, window dates, token validity |
| Authorization | P02: HR/RO nominate; assigned rater respond; appraisee sees aggregate only |
| State Changes | request INVITED→SUBMITTED/DECLINED/EXPIRED; summary computed |
| Failure Handling | Below-N → suppressed bucket; expired token → `UNAUTHENTICATED` |
| Dependencies | FR-G08-01, FR-G08-04 |
| Test Guidance | Unit: min-N suppression, one-per-request. Integration: external token flow, aggregate anonymity, adverse-sole-basis block |

---

### FR-G08-12 — Competency Assessment & Skill-Gap → Training Linkage (G07)

- **Module:** G08 · **Primary Role(s):** Reporting Officer, Appraisee, HR
- **User Story:** As a reporting officer, I want to assess competencies against role-required levels and turn gaps into training nominations so development is closed-loop with the training module.

**Description.** Using the **G07** competency catalog and role-required levels (snapshotted onto the form), the RO assesses each competency's `assessed_level`; the system derives `gap` and `gap_severity`. MODERATE/CRITICAL gaps generate training nominations to **G07** (linking `training_nomination_id`) via the platform service-contract convention. The competency score feeds the final grade per `weightage_policy` (FR-G08-07).

**Acceptance Criteria.**
1. Competencies and required levels are read from G07 (snapshotted onto the form for historical fidelity).
2. `gap = required_level − assessed_level`; severity per configurable bands.
3. MODERATE/CRITICAL gaps offer a one-click "nominate to training" creating a G07 nomination and storing its ID.
4. Self competency ratings display alongside RO assessed levels.
5. Closed nominations reflect status back on the competency assessment view.

**Business Rules.** BR1: A nomination is created only with an active G07 training mapped to the competency; otherwise a development-need is logged (and may feed the G07 Gap Contract). BR2: Competency assessment is part of the RO stage and locks with it (RO DSC). BR3: Required levels come from the role/designation profile in G07; ad-hoc overrides recorded with reason.

**Data Model References.** E9 (assess/derive gap), G07 competency catalog (read), G07 nominations (write by id), E7 (self levels).

**API References.** `GET/PUT /api/v1/g08/forms/{formId}/competencies` · `POST /api/v1/g08/forms/{formId}/competencies/{id}/nominate`

**UI Behavior Notes.** Competency grid: required vs self vs assessed, gap badge (colour by severity), nominate button on gaps. Nomination status chip after creation.

**Edge Cases.** No training mapped to a critical gap (log development-need); G07 unavailable (queue via X.3 outbound retry); negative gap (over-competent → no nomination); catalog changed after snapshot (use snapshot).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `CompetencyAssessmentService`, `GapEngine`, `G07NominationClient` (X.3), `SnapshotService` |
| Backend Flow | Load catalog snapshot → RO assesses → derive gaps → on nominate call G07 → store nomination id |
| Data Operations | UPSERT E9; read G07 catalog; POST G07 nomination; P05 captures |
| Validation | Level bounds, severity bands, training-mapping existence |
| Authorization | P02: RO assess; appraisee read own; HR read org |
| State Changes | gaps flagged; G07 nomination created; status reflected |
| Failure Handling | G07 down → X.3 circuit-break → queue+retry; unmapped gap → development-need logged |
| Dependencies | G07, FR-G08-03/04 |
| Test Guidance | Unit: gap derivation, severity bands. Integration: nomination round-trip, G07-down queueing, snapshot fidelity |

---

### FR-G08-13 — Performance Improvement Plan (PIP)

- **Module:** G08 · **Primary Role(s):** Reporting Officer, Reviewing Officer, HR
- **User Story:** As a reporting officer, I want to place an underperforming officer on a structured improvement plan with milestones and a fair outcome so improvement is supported and documented.

**Description.** Reuses **M09 PIP tracking**. For below-benchmark/adverse outcomes (or ad hoc), RO initiates a `performance_improvement_plan` with reason, period, success criteria and `pip_milestones`. Progress is tracked; the plan concludes with an outcome. PIP records are CONFIDENTIAL (P02) and P05-audited; an unsuccessful PIP can be referenced by G06/G09 per policy.

**Acceptance Criteria.**
1. A PIP requires reason, start/target dates, success criteria and ≥1 milestone.
2. Milestones track status with progress notes.
3. RvO concurrence required to activate a PIP (SoD via P01 maker-checker).
4. Closing a PIP requires an outcome and summary; outcome is P05-auditable.
5. An active PIP is visible to appraisee, RO, RvO and HR only (P02 mask).

**Business Rules.** BR1: A PIP linked to an APAR references the originating `form_id`. BR2: An EXTENDED outcome creates a successor PIP linked to the prior. BR3: PIP existence does not by itself change an APAR grade.

**Data Model References.** E16 (create/close), E17 (track), E4 (optional origin link).

**API References.** `POST /api/v1/g08/pips` · `POST /api/v1/g08/pips/{id}/activate` · `PUT /api/v1/g08/pips/{id}/milestones/{mid}` · `POST /api/v1/g08/pips/{id}/close` · `GET /api/v1/g08/pips?employeeId=&limit=&cursor=`

**UI Behavior Notes.** PIP wizard (reason → criteria → milestones → review). Milestone board with status chips. Activation gated on RvO concurrence. Outcome modal on close.

**Edge Cases.** Activation without RvO concurrence (block); employee transferred during PIP (custody handoff to new RO); overlapping active PIPs (block second); abandoned due to long leave (record reason).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `PIPService` (M09), `MilestoneService`, `ConcurrenceGuard` (P01) |
| Backend Flow | Create draft → RvO concur → activate → track milestones → close with outcome |
| Data Operations | INSERT E16/E17; UPDATE statuses; P05 captures |
| Validation | Required fields, ≥1 milestone, concurrence present, single-active-per-employee |
| Authorization | P02: RO create; RvO concur; HR oversight; appraisee read own |
| State Changes | pip DRAFT→ACTIVE→UNDER_REVIEW→CLOSED; successor link on EXTENDED |
| Failure Handling | Activate w/o concurrence → `FORBIDDEN`; overlap → `CONFLICT` |
| Dependencies | FR-G08-06, FR-G08-15 |
| Test Guidance | Unit: required-field/concurrence gates. Integration: extend→successor link, transfer handoff |

---

### FR-G08-14 — Posting Final Ratings to G12 SR Ledger & Promotion Eligibility Feed (G06)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, APAR Custodian (trigger); System (post)
- **User Story:** As HR, I want certified final grades posted to the statutory Service Register (G12) and promotion eligibility fed to G06 — except where a sealed cover suppresses the feed — so the appraisal becomes part of the permanent record and informs progression lawfully.

**Description.** On finalisation (post-disclosure, representation window closed/decided, **not sealed**), the system appends an event to the **G12 Service Register** ledger and feeds promotion eligibility to **G06 by reference**. G08 does **not** write the ledger directly: the module-local `…/post-to-sr` action is an **internal façade that relays to the canonical G12 write-port `POST /api/v1/sr/ingest`** (REMEDIATION D1; G12 FR-02). G08 never targets `/api/v1/sr/events` and never INSERTs `service_register_events` itself — the row is persisted by G12 on the **P05** substrate. **While `sealed_cover=true`, the G06 feed is suppressed** (R3). Posting is idempotent (`Idempotency-Key`), transactional with outbox semantics over X.3, and immutable once posted. A grade modified by representation post-posting creates a corrective event, never an edit. Driven by `JOB-G08-SR-POST`.

**Acceptance Criteria.**
1. A form posts only when status is FINALISED, representation resolved, and **`sealed_cover=false`** (R3).
2. The SR event is append-only and idempotent; **dedup is the G12 canonical syntactic tuple `(source_module, source_reference_id, source_event_version)`** with `source_module="G08"` and `source_reference_id=form_id` (replacing the prior per-`form_id`-only dedup); the HTTP `Idempotency-Key` header may carry a writer-local hash but the persisted tuple is the contract (REMEDIATION D1; G12 FR-01). The event cites the exact G12-published `event_type_code` **`APAR_FINAL_GRADE`** with `event_category=APPRAISAL`. Re-posts are no-ops (`CONFLICT`/`ERR-G08-ALREADYPOSTED` or 200 no-op); the event references the disclosure-log chain anchor for verifiability (OPEN-PLAT-03).
3. The G06 eligibility feed carries `below_benchmark`/`final_grade`/`cycle_id` **by reference**; **suppressed while sealed**; updated by corrective event if a representation later modifies the grade (never silent overwrite).
4. Posting sets `posted_to_sr=true` and appends to `apar_disclosure_log`.
5. If G12/G06 are unavailable, posting is queued (X.3 outbound + dead-letter) and retried; no data loss.

**Business Rules.** BR1: Posting is the only sanctioned write of appraisal outcome to G12 from G08. BR2: A grade modified by representation post-posting creates a corrective SR event referencing the original (`VAL-SR-EVENT` integrity), not an edit. BR3: Promotion decisioning remains with G06; G08 only feeds eligibility evidence. BR4: **(R3)** Sealed-cover forms never feed G06; on release (FR-G08-17) the feed is (re)evaluated per the disciplinary outcome.

**Data Model References.** E4 (finalise + posted flag + sealed gate), `service_register_events` (G12, append), G06 eligibility (write by reference), E18 (log posting).

**API References.** `POST /api/v1/g08/forms/{formId}/finalise` · `POST /api/v1/g08/forms/{formId}/post-to-sr` (Idempotency-Key; **internal façade — relays to canonical `POST /api/v1/sr/ingest`**, G12 FR-02) · `GET /api/v1/g08/forms/{formId}/posting-status`

**UI Behavior Notes.** Finalise action with checklist (disclosed, representation resolved, not sealed). Posting status panel showing SR event id, chain anchor, and G06 feed status (or "suppressed — sealed cover"); retry indicator if queued.

**Edge Cases.** Sealed cover active (block post + suppress G06); representation decided after posting (corrective event); G12 down (X.3 outbox retry); duplicate post (idempotent no-op); grade unchanged after representation (no corrective event).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FinalisationService`, `SRPostingService` (X.3 outbox), `G06EligibilityClient`, `IdempotencyGuard`, `SealedCoverGuard` |
| Backend Flow | Finalise → check sealed → write outbox → post G12 event + G06 feed (unless sealed) in transaction → mark posted → on rep-change emit corrective |
| Data Operations | UPDATE E4; **append SR event via canonical `POST /api/v1/sr/ingest`** (G12 persists `service_register_events`; G08 does not INSERT it); feed G06 by reference; INSERT E18; P05 captures; outbox table |
| Validation | Status gate, representation resolution, sealed-cover gate, `Idempotency-Key`, `VAL-SR-EVENT` |
| Authorization | P02: HR/Custodian trigger; system posts; no edits |
| State Changes | form FINALISED→POSTED; G12 + G06 records created (G06 suppressed if sealed) |
| Failure Handling | G12/G06 down → X.3 circuit-break + outbox retry; sealed → `CONFLICT`(`ERR-G08-SEALED`); never partial-commit |
| Dependencies | FR-G08-08, FR-G08-17, G12, G06 |
| Test Guidance | Unit: idempotency, status+sealed gate. Integration: outbox retry, corrective event, sealed-suppression, no-op re-post |

---

### FR-G08-15 — Custody, Confidentiality, Tamper-Evidence & Access Control of APAR

- **Module:** G08 · **Primary Role(s):** APAR Custodian, Dual-Control Approver, HR/APAR Cell, Legal Heir/Nominee, Auditor
- **User Story:** As the APAR custodian, I want every access to confidential APARs controlled and provably untampered, with custody transferable on officer movement, heir access on death, and dual-control on irreversible actions, so confidentiality and statutory custody obligations are met and auditable.

**Description.** Enforces field-level confidentiality through the **P02 PII Protection Ceiling + field-mask-on-serialization** (fields *absent*, not greyed, with plain-language "why hidden" reasons, R17) served from cache/pre-computed mask columns to hold the platform read NFR (p95 < 500 ms) at 200k scale (R14). Logs all access to `apar_disclosure_log`; the authoritative mutation audit is the **P05 DB trigger** (dual log), and statutory tamper-evidence tracks **OPEN-PLAT-03** (chain head to WORM) with a `/verify` endpoint (R11). Supports custody transfer on movement (G05), **legal-heir/nominee access on death/retirement** (R15), retention per statutory schedule (overriding the DPDP erasure right via the P05 redaction-marker basis, R15), and **dual-control** (P01 maker+checker) on disposal and confidentiality downgrade (R23). Generated APAR PDFs are watermarked and encrypted in G13.

**Acceptance Criteria.**
1. Reading any APAR content passes `Authorization.check` (P02); unauthorised reads return `FORBIDDEN`, append ACCESS_DENIED (+ `security_audit_log`); absent fields carry a reason code. **(R17)**
2. Every successful view/download appends VIEWED/DOWNLOADED with actor/role/IP/timestamp; the **P05** trigger records the immutable audit row. **(R11)**
3. **(R11)** A `/verify` endpoint queries the OPEN-PLAT-03 chain over the form's P05 events and confirms (or fails) integrity; chain heads are anchored to WORM on a schedule (ANCHOR events).
4. Custody transfer reassigns custodian and logs CUSTODY_TRANSFER without altering content; orphaned custody is escalated, never dropped.
5. **(R15)** On death/retirement, a legal-heir/nominee access path grants time-boxed read (HEIR_ACCESS logged) via a time-bound individual entitlement (RBAC §3.2); statutory retention overrides any DPDP erasure (legal basis recorded).
6. APAR PDFs are watermarked (recipient + timestamp) and encrypted at rest in G13.
7. **(R23)** Retention disposal and confidentiality downgrade require a distinct maker and checker (P01) plus MFA step-up and DSC; single-person attempts blocked.

**Business Rules.** BR1: Confidentiality class CONFIDENTIAL by default; downgrade requires dual-control + authority + reason + DSC. BR2: Auditor has read + log + verify but cannot mutate. BR3: **(R11)** Access ledger is append-only; tamper-evidence is P05 + OPEN-PLAT-03, verifiable not asserted. BR4: Custody follows the officer's service record; orphaned custody escalated. BR5: **(R14)** Field-mask serving must meet p95 < 500 ms at 200k via caching/pre-computation — a GA gate. BR6: **(R15)** Statutory retention overrides the DPDP erasure right; erasure requests against in-retention APARs are recorded and refused with the legal basis.

**Data Model References.** E18 (append access/custody events), E23 (disposal/downgrade signature), E4 (confidentiality_class, custodian), `documents` (G13 encrypted PDF), `audit_log`/`security_audit_log` (P05).

**API References.** `GET /api/v1/g08/forms/{formId}` (P02 masked) · `GET .../pdf` · `POST .../custody-transfer` · `GET .../access-log?limit=&cursor=` · `GET .../access-log/verify` · `POST .../heir-access` · `POST .../dispose` (maker) · `POST .../dispose/approve` (checker) · `POST .../downgrade` (maker+checker)

**UI Behavior Notes.** Content rendered through P02 mask — absent fields show a plain-language reason banner (R17). PDF viewer with watermark. Access-log table for custodian/auditor with a "Verify integrity" button (R11). Custody-transfer dialog. Heir-access grant workflow. Disposal/downgrade require a second approver (dual-control) plus step-up + DSC.

**Edge Cases.** Multi-role caller (lowest-privilege mask via intersection); transfer to office with no custodian (escalate); disposal before retention end (block); disposal single-person (block — `ERR-G08-DUALCTRL`); erasure request during retention (refuse with legal basis); heir access for unverified claimant (block); chain mismatch on verify (raise `ERR-G08-TAMPER`, alert auditor).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `FieldMaskService` (P02, cached), `AccessLogger`, `ChainVerifier` (OPEN-PLAT-03), `Anchorer` (`JOB-G08-ANCHOR`), `CustodyService`, `HeirAccessService`, `PDFRenderService`, `RetentionService`, `DualControlGuard` (P01), `SignatureService` |
| Backend Flow | Every read → `Authorization.check` (cache) → append access event → P05 trigger records audit → return masked payload + reason codes; verify queries OPEN-PLAT-03 chain; disposal/downgrade → P01 maker then checker + step-up + DSC |
| Data Operations | INSERT E18 (append-only); INSERT E23; UPDATE E4 custodian/class; G13 store; P05 dual-log captures |
| Validation | Role/PII-ceiling, retention schedule, downgrade authority, dual-control distinctness, chain integrity, heir verification |
| Authorization | P02: field mask on serialization; custodian/auditor scoped; auditor no mutation; dual-control on irreversible |
| State Changes | custody reassignment; access events logged; periodic anchoring; disposal/downgrade with two principals |
| Failure Handling | Unauthorised → `FORBIDDEN` + ACCESS_DENIED; single-person disposal → `ERR-G08-DUALCTRL`; chain mismatch → `ERR-G08-TAMPER`; orphan custody → escalation |
| Dependencies | G05 (transfer), G13, all read endpoints, FR-G08-20, P05/OPEN-PLAT-03 |
| Test Guidance | Unit: mask matrix + reason codes, dual-control distinctness. Integration: denied-read logging, verify pass/fail, heir access, disposal two-person, 200k mask load-test (GA gate) |

---

### FR-G08-16 — Performance & Bias-Disparity Analytics

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, Dept Head/AA, Auditor (read), feeds G14
- **User Story:** As HR leadership, I want analytics on rating distribution, skew, completion, skill gaps **and equity (bias-disparity)** so I can detect bias, monitor progress and meet the government's equity obligation.

**Description.** Provides aggregated, **P02-scoped** analytics: rating distribution vs target (pre/post calibration), grading skew by RO/org unit, cycle completion funnel, adverse/representation rates, competency-gap heatmaps, MSF participation, and **DPDP-safe bias-disparity analytics**: adverse-rate, below-benchmark-rate and grade-mean by **gender / cadre / region / RO over time**, plus a **rater-leniency / central-tendency model across cycles** (R13). All analytics are de-identified aggregates with minimum-N suppression; datamarts feed **G14**.

**Acceptance Criteria.**
1. Distribution charts show pre- vs post-calibration and current vs target (diagnostic).
2. Skew detection flags ROs/units deviating beyond a configurable threshold.
3. **(R13)** A bias-disparity view reports adverse-rate / below-benchmark-rate / grade-mean by gender/cadre/region/RO over time, with min-N suppression, and a cross-cycle rater-leniency/central-tendency model.
4. Aggregates honour minimum-N suppression; no drill-down to individual APAR content beyond P02 authorization.
5. Analytics endpoints are cursor-paginated/bounded and cached with freshness ≤ 15 min.

**Business Rules.** BR1: P02 scoping restricts each caller's analytics to their authorised population. BR2: Individual-level data exposed only to those already authorised to view that APAR. BR3: G14 consumes only the aggregated, suppressed facts. BR4: **(R13)** Protected-attribute disparity metrics computed only on aggregates ≥ min-N; never expose individual protected attributes (PII ceiling).

**Data Model References.** E4 (grades/flags/status), E15/E21 (pre/post comparison), E9 (gap heatmaps), E11/E12 (MSF participation), `employees` (protected-attribute aggregates).

**API References.** `GET /api/v1/g08/analytics/distribution` · `.../skew` · `.../completion` · `.../competency-gaps` · `.../bias-disparity` · `.../rater-leniency` (all cursor-paginated, P02-scoped)

**UI Behavior Notes.** Dashboard: distribution histogram, skew table with flags, completion funnel, gap heatmap, **bias-disparity panel** (adverse-rate by gender/cadre/region/RO over time, suppressed below min-N) and **rater-leniency model**. Filters by cycle/org/cadre. Export respects authorization and suppression.

**Edge Cases.** Small populations (suppress); mid-cycle (partial data labelled provisional); calibration not run (post = pre); unauthorised drill-down (denied); protected-attribute bucket below min-N (suppressed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `AnalyticsService`, `DistributionEngine` (reused), `SkewDetector`, `DisparityEngine`, `RaterLeniencyModel`, `SuppressionGuard`, `CacheLayer` |
| Backend Flow | Query P02-scoped aggregates → suppress < N → compute skew/funnel/disparity/leniency → cache → serve |
| Data Operations | SELECT aggregate over E4/E9/E15/E21/E11-12 + `employees` attributes; read-only |
| Validation | P02 scope, min-N suppression, threshold config, protected-attribute aggregation only |
| Authorization | P02: role/org-scoped; aggregate-only for non-authorised individual data |
| State Changes | none (read-only); cache populate |
| Failure Handling | Cache miss → recompute; oversized query → cursor-paginate; sub-min-N → suppressed |
| Dependencies | FR-G08-06/07/09/12/11; feeds G14 |
| Test Guidance | Unit: suppression, skew + disparity math, leniency model. Integration: scoped aggregation, cache freshness, protected-attribute suppression, G14 contract |

---

### FR-G08-17 — Sealed Cover Procedure (statutory)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, Accepting/Competent Authority, APAR Custodian; driven by G09
- **User Story:** As HR, when an officer is under charge or whose promotion is sub judice, I want the APAR finalisation and the promotion-eligibility feed kept in a sealed cover until the proceeding concludes.

**Description.** When **G09** signals an active charge / sub-judice status, the form is placed in **SEALED_COVER**: assessments may be recorded but the form cannot transition to FINALISED/POSTED and the G06 feed is suppressed (FR-G08-14). On G09 conclusion, the Competent Authority releases the sealed cover with a **DSC-signed** release referencing the G09 outcome; the form proceeds or is acted upon per the disciplinary result. Monitored by `JOB-G08-SEAL-MONITOR`.

**Acceptance Criteria.**
1. An active G09 charge/sub-judice sets `sealed_cover=true`, `sealed_cover_reason`, `sealed_cover_case_ref`, `sealed_at`, status SEALED_COVER; appends SEALED to `apar_disclosure_log`.
2. While sealed, transitions to FINALISED/POSTED are blocked and the G06 feed is suppressed.
3. Release requires a G09 conclusion reference and a signed `SEALED_COVER_RELEASE` (E23); appends UNSEALED; sets `sealed_released_at`.
4. On release, the form resumes its lifecycle; eligibility is (re)evaluated per the disciplinary outcome.
5. Sealing/unsealing is P05-auditable and notified (X.2) to HR, AA and custodian.

**Business Rules.** BR1: Only the Competent Authority (not the appraisee's RO/RvO) may release a sealed cover, signed. BR2: A sealed form's grade may still be assessed/certified into a held state but never posted while sealed. BR3: Sealed-cover status is CONFIDENTIAL and P02-masked like all APAR content.

**Data Model References.** E4 (sealed_cover*, status), E18 (SEALED/UNSEALED), E23 (release signature), G09 (read/subscribe).

**API References.** `POST /api/v1/g08/forms/{formId}/seal` · `POST .../seal/release` · `GET .../seal-status`

**UI Behavior Notes.** A prominent "Sealed Cover — finalisation and eligibility feed suppressed" banner with case reference. Release dialog requires G09 conclusion reference + DSC. Custodian/HR see a sealed-cover queue.

**Edge Cases.** Charge raised after certification but before posting (seal, block post); concluded favourably (release, resume feed); concluded adversely (release, act per G09); G09 status flapping (idempotent seal/keep-sealed).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SealedCoverService`, `G09StatusSubscriber` (X.3), `SignatureService`, `DisclosureLogger`, `FormTransitionService` (P01) |
| Backend Flow | On G09 charge → seal form + log + suppress feed; on conclusion → competent authority signs release → unseal → resume |
| Data Operations | UPDATE E4 sealed_cover*; INSERT E18; INSERT E23; P05 captures |
| Validation | Authority role, G09 reference presence, signature validity |
| Authorization | P02: Competent Authority release (signed); HR/custodian view; appraisee no seal control |
| State Changes | → SEALED_COVER; ← prior status on release; G06 feed suppressed/resumed |
| Failure Handling | Release w/o G09 ref → `VALIDATION_FAILED`; release w/o DSC → `PRECONDITION_FAILED`; post while sealed → `CONFLICT`(`ERR-G08-SEALED`) |
| Dependencies | G09, FR-G08-06, FR-G08-14, FR-G08-20 |
| Test Guidance | Unit: seal/release guards. Integration: seal-on-charge, feed suppression, signed release, resume lifecycle |

---

### FR-G08-18 — Multi-RO Part-Period Reports & "No Report Certificate" (statutory)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, Reporting Officer(s)
- **User Story:** As HR, I want to represent that an officer had 2–3 reporting officers across the year, each writing a part-period report, with a "No Report Certificate" where supervision was below the minimum, and a correct aggregation to the final grade.

**Description.** Each appraisal year is divided into `appraisal_report_periods` (E19), one per RO. Each RO grades only their period (FR-G08-04). A period with `supervision_months < cycle.min_supervision_months` (`VAL-G08-SUPV`) yields a **No-Report Certificate** (DSC-signed), not a grade. Part-period grades aggregate (supervision-weighted) into `provisional_grade`.

**Acceptance Criteria.**
1. HR (or the chain resolver) can define multiple report periods per form with non-overlapping ranges (`VAL-G08-PERIODTILE`) covering the appraisal period.
2. Each period resolves an RO and `supervision_months`; `has_multi_ro=true` when >1 period.
3. A period below the threshold is `no_report_certificate=true` with reason and DSC-signed No-Report Certificate; excluded from aggregation.
4. `provisional_grade` = supervision-weighted mean of valid period grades, computed deterministically; `weight_in_aggregate` recorded.
5. The form advances to RVO_REVIEW only when every period is SUBMITTED or NO_REPORT.

**Business Rules.** BR1: Periods must tile the appraisal period without gaps/overlaps (gaps explicitly flagged unsupervised). BR2: A No-Report period carries no grade/weight; the certificate is DSC-signed. BR3: An RO change mid-year (transfer per G05) closes the current period and opens the next. BR4: Aggregation is the single deterministic function reused by analytics.

**Data Model References.** E19 (define/grade/aggregate), E8 (REPORTING per period), E23 (No-Report signature), E4 (has_multi_ro, provisional_grade).

**API References.** `POST /api/v1/g08/forms/{formId}/report-periods` · `PUT .../report-periods/{periodId}` · `POST .../report-periods/{periodId}/no-report` · `POST .../report-periods/aggregate`

**UI Behavior Notes.** Timeline of report periods with RO, dates, supervision months, status. "Issue No-Report Certificate" action (DSC) on short periods. Aggregation preview showing supervision-weighted provisional grade.

**Edge Cases.** Gaps between periods (flag unsupervised); overlapping (block); all periods No-Report (form flagged "No Report for the year"); single RO whole year (one period, has_multi_ro=false); RO transferred mid-period (split).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ReportPeriodService`, `SupervisionResolver`, `NoReportCertifier`, `ReportPeriodAggregator`, `SignatureService` |
| Backend Flow | Seed/define periods → each RO grades → short periods → No-Report (signed) → aggregate supervision-weighted → set provisional_grade |
| Data Operations | INSERT/UPDATE E19; INSERT E23; UPDATE E4; P05 captures |
| Validation | `VAL-G08-PERIODTILE`, `VAL-G08-SUPV`, signature on No-Report, aggregation determinism |
| Authorization | P02: HR define; each period's RO grade; org-scoped |
| State Changes | period DRAFT→SUBMITTED/NO_REPORT→AGGREGATED; form provisional_grade set |
| Failure Handling | Overlap → `CONFLICT`; missing No-Report signature → `PRECONDITION_FAILED`; advance before all periods → `CONFLICT`(`ERR-G08-STATE`) |
| Dependencies | FR-G08-04, G05, FR-G08-20 |
| Test Guidance | Unit: tiling, supervision-weighted aggregation, threshold. Integration: multi-RO grade→aggregate, No-Report exclusion, transfer split |

---

### FR-G08-19 — SLA Auto-Escalation & Authoring-Right Transfer (statutory)

- **Module:** G08 · **Primary Role(s):** HR/APAR Cell, next-higher authority; System (SLA engine)
- **User Story:** As HR, when an RO/RvO/AA fails to act within the statutory window, I want authoring right to transfer automatically to the next higher authority (or a "No Report due to RO/RvO" recorded), so a single non-responsive officer cannot stall the cycle.

**Description.** The **P01 SLA runtime + `JOB-M09-SLA`** monitor tier due dates. On a missed window (beyond reminder grace), it **transfers the authoring right** to the next higher authority per service rule (P01 delegate/reassign), or records a "No Report due to RO/RvO" (a No-Report Certificate at the relevant tier), and notifies all parties (X.2). Escalated assessments are marked `is_escalated_author=true` and still require a DSC.

**Acceptance Criteria.**
1. The engine sends reminders before due; on overdue beyond grace it triggers escalation, not just another reminder.
2. Escalation transfers the authoring task to the next higher authority (RO→RvO, RvO→AA, AA→competent authority) per the cycle's escalation config; the act is logged and notified.
3. Alternatively, where service rule prescribes, a "No Report due to RO/RvO" is recorded (DSC-signed No-Report at that tier) and the flow continues.
4. An escalated assessment sets `is_escalated_author=true` and still requires a valid DSC.
5. Escalation events are P05-auditable and appear on the cycle SLA dashboard.

**Business Rules.** BR1: Escalation respects SoD and COI (P02) — the transferee cannot be the appraisee or conflicted. BR2: Only one active authoring right per tier at a time (transfer revokes the prior). BR3: Escalation thresholds (grace days) and the ladder are cycle configuration.

**Data Model References.** E8 (is_escalated_author, signature), E19 (No-Report-due-to-RO at RO tier), E4 (status/authoring right), `workflow_actions` (P01 reassignment).

**API References.** `POST /api/v1/g08/forms/{formId}/escalate` · `GET /api/v1/g08/cycles/{cycleId}/sla-status` · `POST /api/v1/g08/forms/{formId}/no-report-tier`

**UI Behavior Notes.** SLA dashboard with overdue heatmap and escalation actions. On escalation, the new author sees a banner: "Authoring right transferred to you due to RO non-response by DD-MMM-YYYY." No-Report-due-to-RO action with DSC.

**Edge Cases.** Transferee also overdue (cascade to next tier); apex officer with no higher authority (record No-Report / route to designated alternate per chain config, R12); officer acts just after escalation (escalation wins, prior task revoked); conflicted transferee (skip to next eligible).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | P01 SLA runtime + `JOB-M09-SLA`, `EscalationService` (P01 delegate), `AuthoringRightService`, `NoReportCertifier`, `NotificationService` (X.2) |
| Backend Flow | Monitor due dates → reminder → overdue+grace → transfer authoring right (P01) or record No-Report → reassign workflow action → notify |
| Data Operations | UPDATE `workflow_actions` (P01); UPDATE E8 is_escalated_author; INSERT E19/E23 (No-Report); P05 captures |
| Validation | Grace threshold, ladder config, COI/SoD on transferee |
| Authorization | P02: System-triggered; HR oversight; transferee acts with DSC |
| State Changes | authoring task reassigned; possible No-Report at tier; notifications |
| Failure Handling | No eligible transferee → escalate to HR/designated alternate; cascade overdue |
| Dependencies | FR-G08-04/05/06, FR-G08-18, FR-G08-20, R12 chain config |
| Test Guidance | Unit: grace/threshold, ladder traversal, COI skip. Integration: overdue→transfer, cascade, apex No-Report, late-act-loses |

---

### FR-G08-20 — Digital Signature & Non-Repudiation (statutory `GAP`)

- **Module:** G08 · **Primary Role(s):** RO, RvO, AA, Competent/Custodian authorities; eSign/DSC provider
- **User Story:** As a certifying officer, I want my statutory acts bound by a legally-recognised digital signature (DSC/eSign), distinct from session MFA, so the APAR record is non-repudiable.

**Description.** **`GAP (gov-specific)`** — the platform provides MFA/session auth (P02) but not a statutory DSC engine; G08 authors a signing service that runs on the **X.3 integration framework** (eSign/DSC provider; credentials from **P04 `integration_credentials`**), producing `digital_signatures` (E23) over a canonical payload hash using DSC, Aadhaar-eSign, or HSM token. Artefacts are stored encrypted in **G13**; signature events are captured by **P05**. Signatures are **required** on: tier certification (RO/RvO/AA), disclosure acknowledgement, calibration ratification, expunction, No-Report Certificate, sealed-cover release, disposal and confidentiality downgrade.

**Acceptance Criteria.**
1. A signing ceremony hashes the canonical payload (SHA-256), invokes the X.3 provider, and stores `signature_value`, `certificate_serial`, `signed_payload_hash`, method and `verification_status=VALID`.
2. The dependent act does not commit unless a VALID signature is attached. **(R10)**
3. **MFA step-up (P02)** authenticates the session; the **digital signature** binds the record — both required where specified (distinct controls).
4. Signatures are re-verifiable; a later REVOKED/EXPIRED/INVALID status is recorded without altering the original payload (append-only).
5. Signature artefacts stored encrypted in G13 and referenced by entity.

**Business Rules.** BR1: A signature binds exactly one entity (`entity_type`,`entity_id`); reuse rejected. BR2: Signature payload hash must match the record state at signing; tampering invalidates verification. BR3: Provider outages queue the act as pending-signature (X.3 dead-letter), never auto-bypass.

**Data Model References.** E23 (create/verify), E8/E15/E18/E19/E21 (reference signature_id), `documents` (G13), `integration_credentials` (P04).

**API References.** `POST /api/v1/g08/signatures` (sign ceremony, Idempotency-Key) · `GET /api/v1/g08/signatures/{id}/verify` · `GET /api/v1/g08/forms/{formId}/signatures`

**UI Behavior Notes.** Signing ceremony modal (select DSC token / Aadhaar-eSign), showing the canonical payload summary. Signature badges on certified records with a "Verify" action. Pending-signature state if the provider is down.

**Edge Cases.** Provider down (queue pending-signature); certificate expired at signing (block); revoked certificate discovered later (mark INVALID, alert, do not mutate record); payload changed after signing attempt (re-sign required).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `SignatureService`, `DSCProviderClient` (X.3), `PayloadCanonicaliser`, `VerificationService` |
| Backend Flow | Canonicalise → hash → X.3 provider sign → store E23 → attach to entity → commit act; verify recomputes/queries status |
| Data Operations | INSERT E23 (append-only); UPDATE referencing entity signature_id; G13 store; P05 captures |
| Validation | One-entity binding, payload-hash match, certificate validity |
| Authorization | P02: signer = the acting authority; org/tier scoped |
| State Changes | signature created; dependent act commits only with VALID signature |
| Failure Handling | Provider down → pending (X.3 dead-letter); expired/revoked → block/mark INVALID; mismatch → re-sign |
| Dependencies | eSign/DSC provider (X.3), P04, G13; consumed by FR-04/05/06/08/09/15/17/18 |
| Test Guidance | Unit: canonicalisation, one-entity binding, hash match. Integration: sign→commit, provider-down queue, later-revocation handling |

---

### FR-G08-21 — Probation Confirmation Appraisal (statutory)

- **Module:** G08 · **Primary Role(s):** Reporting Officer, Reviewing Officer, Accepting Authority, HR/APAR Cell
- **User Story:** As HR, I want the PROBATION cycle to drive a confirmation/extension/discharge recommendation fed to G01 and G12, distinct from the annual APAR, so probationers are confirmed lawfully and on time.

**Description.** Reuses **M09 probation confirmation + `JOB-M09-PROBATION`**. A `cycle_type=PROBATION` runs a lighter appraisal whose outcome is a **probation decision** — CONFIRMED, EXTENDED, or DISCHARGE_RECOMMENDED — rather than a numeric annual grade. The flow uses RO→RvO→AA (P01) and disclosure but concludes by writing `probation_outcome` and feeding G01 (employment status / confirmation date) and G12 (SR event). Extension respects `probation_extension_max_months`.

**Acceptance Criteria.**
1. A PROBATION cycle materialises probation forms with the probation template; the outcome field is `probation_outcome`.
2. The AA certifies a probation outcome with DSC; CONFIRMED records a confirmation date (mirrors M09 `confirmation_date`).
3. EXTENDED creates a successor probation cycle window within `probation_extension_max_months`; repeated extension beyond the cap is blocked.
4. The outcome is disclosed (mandatory) and, on finalisation, fed to G01 (status/confirmation) and G12 (SR event).
5. DISCHARGE_RECOMMENDED routes to the competent authority and is referenced to G09/G01 per policy.

**Business Rules.** BR1: Probation outcome is not a numeric APAR grade; it does not feed the G06 benchmark. BR2: Confirmation feeds G01 employment status and G12 as a statutory service event. BR3: Extension beyond the cap requires explicit higher authority and reason.

**Data Model References.** E1 (probation_period_months, extension cap), E4 (probation_outcome), `service_register_events` (G12), `employees` (G01 status/confirmation feed).

**API References.** `POST /api/v1/g08/forms/{formId}/probation/decide` · `POST .../probation/extend` · `GET /api/v1/g08/cycles?type=PROBATION&limit=&cursor=`

**UI Behavior Notes.** Probation workbench showing supervision summary and a decision selector (Confirm / Extend / Recommend Discharge) with DSC. Confirmation date picker. Extension capped with a remaining-months indicator.

**Edge Cases.** Extension cap reached (block, escalate); discharge recommendation (route to competent authority + G09/G01); probationer transferred (multi-RO periods apply); confirmation overdue (SLA escalation FR-G08-19).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ProbationService` (M09), `FormTransitionService` (P01), `G01ConfirmationClient`, `SRPostingService` (G12), `SignatureService` |
| Backend Flow | Run probation assessment → AA decides (DSC) → disclose → finalise → feed G01 + G12; extend creates successor window (`JOB-M09-PROBATION`) |
| Data Operations | UPDATE E4 probation_outcome; feed G01; INSERT `service_register_events` (G12); P05 captures |
| Validation | Outcome enum, extension cap, authority, signature |
| Authorization | P02: RO/RvO/AA tiers; competent authority for discharge |
| State Changes | form → FINALISED/POSTED with probation_outcome; G01/G12 feed |
| Failure Handling | Cap exceeded → `CONFLICT`; missing DSC → `PRECONDITION_FAILED` |
| Dependencies | FR-G08-04/05/06/08/14, G01, G12, FR-G08-20 |
| Test Guidance | Unit: outcome routing, extension cap. Integration: confirm→G01/G12 feed, extend successor, discharge routing |

---

### FR-G08-22 — Cycle Errata / Controlled Correction (statutory)

- **Module:** G08 · **Primary Role(s):** System Administrator, HR/APAR Cell, Accepting/Competent Authority
- **User Story:** As HR, when a configuration error (e.g., wrong adverse threshold or scale binding) is discovered mid-cycle, I want a controlled correction and re-derivation path so I don't have to force every affected case through representation.

**Description.** Provides a guarded **P01 maker-checker errata flow**: an authorised admin proposes a cycle/scale/threshold correction; the system computes the impact set (affected forms); the change is approved (dual-control); and affected derived values (`is_adverse`, `below_benchmark`, labels, eligibility) are **re-derived** in a transaction with full P05 audit and re-notification (X.2). Errata never silently edits certified grades without re-derivation provenance, and affected officers are re-notified.

**Acceptance Criteria.**
1. An errata proposal identifies the corrected parameter, the rationale, and the computed impact set (count + list).
2. Applying errata requires dual-control approval (P01 maker+checker) and, for certified forms, re-derivation provenance (old → new recorded).
3. Re-derivation recomputes flags and, where eligibility changes, emits corrective G06/G12 events (never silent overwrite).
4. Affected officers and authorities are re-notified; the cycle records an ERRATA status during application.
5. Errata is fully P05-audited and reversible only via a further errata (append-only provenance).

**Business Rules.** BR1: Errata cannot alter the substantive assessment (remarks/grades chosen by officers); it corrects configuration and re-derives system-computed flags. BR2: An errata that would worsen an officer's outcome (newly adverse) triggers a fresh disclosure + representation window for those cases. BR3: Errata on a posted form emits corrective SR/G06 events, never destructive edits.

**Data Model References.** E1 (corrected parameters; ERRATA status), E3 (corrected thresholds, new version), E4 (re-derived flags), `service_register_events`/G06 (corrective events).

**API References.** `POST /api/v1/g08/cycles/{cycleId}/errata/propose` · `GET .../errata/{errataId}/impact` · `POST .../errata/{errataId}/approve` · `POST .../errata/{errataId}/apply` (Idempotency-Key)

**UI Behavior Notes.** Errata wizard: select parameter → preview impact set (counts, affected officers, before/after flags) → dual-control approval → apply with re-notification summary. Clear "this will re-open disclosure for N newly-adverse cases" warning.

**Edge Cases.** Errata makes a favourable case adverse (fresh disclosure/representation); errata on posted forms (corrective events); concurrent errata (serialize — `ERR-G08-ERRATA`); zero-impact errata (no-op with audit).

**LLD.**
| Aspect | Detail |
|---|---|
| Components | `ErrataService` (P01), `ImpactAnalyzer`, `GradeDerivationService`, `DualControlGuard` (P01), `CorrectiveEventEmitter` (G12/G06), `NotificationService` (X.2) |
| Backend Flow | Propose → compute impact → P01 dual-control approve → apply in txn: re-derive flags → emit corrective events → re-notify → record provenance |
| Data Operations | UPDATE E1/E3 (new version)/E4 (flags); INSERT corrective `service_register_events`/G06; P05 captures |
| Validation | Authority + dual-control, impact computed, provenance recorded, serialization |
| Authorization | P02: Sys Admin/HR propose; second approver; competent authority for certified-impact |
| State Changes | cycle → ERRATA → prior; flags re-derived; corrective events; re-notification; possible re-disclosure |
| Failure Handling | Concurrent errata → `CONFLICT`(`ERR-G08-ERRATA`); certified-impact without approval → `FORBIDDEN` |
| Dependencies | FR-G08-07/08/14/15 |
| Test Guidance | Unit: impact computation, re-derivation. Integration: errata→re-derive→corrective events→re-disclose newly-adverse, dual-control, serialization |

---

## Section 7 — UI Requirements

### 7.1 Key screens

| Screen | Primary users | Purpose | Key states |
|---|---|---|---|
| Cycle Admin Console | HR, Sys Admin | Configure/open cycles, templates (W.2), scales, clock, chain rules, errata | empty, draft, validating, open, errata, error |
| My Appraisal (Appraisee) | Appraisee | Goals, self-appraisal, disclosure, eSign acknowledge, representation | empty, draft, submitted, returned, disclosed, sealed, locked |
| Goal Board | Appraisee, RO | Set/approve weighted cascaded goals (M09 plan); snapshot-on-lock preview | weightage-incomplete, balanced, dev-outside-sum, locked |
| RO/RvO/AA Assessment Workbench | RO, RvO, AA | Tiered (multi-RO part-period) assessment, compare, certify, DSC | pending, in-progress, returned, certified, escalated |
| Report Periods & No-Report | HR, RO | Define periods, part-period grades, No-Report Certificate | single-RO, multi-RO, no-report, aggregated |
| Sealed Cover Console | HR, AA, Custodian | Seal/release, suppressed-feed view | sealed, released, normal |
| Calibration Studio | Committee, AA | Diagnostic distribution, recommendations, ratification | planned, in-session, recommended, ratified, declined |
| Disclosure & Representation Centre | HR, Appraisee, Authority | Mandatory full disclosure, ack clock, appeal, condonation, escalation ladder | dispatched, disclosed, deemed, filed, decided, escalated, SLA-breach |
| Continuous Feedback / Check-ins | All | Year-round feedback & progress (disclosability tagged) | empty, feed, acknowledged |
| MSF / 360 Feedback | HR, raters | Nominate, respond, summary (anonymity-suppressed) | invited, in-progress, suppressed, summary |
| Competency & Gaps | RO, Appraisee | Assess competencies, nominate training (G07) | gap-flagged, nominated, no-mapping |
| PIP Workspace | RO, RvO, HR | Create/track/close PIPs | draft, active, at-risk, closed |
| Custody & Access Log | Custodian, Auditor | Access ledger, verify (OPEN-PLAT-03), custody transfer, heir access, dual-control disposal | normal, denied-events, transfer, heir, tamper-alert |
| Digital Signature Centre | All authorities | Signing ceremonies, verify badges | unsigned, pending-provider, signed, revoked |
| Performance & Equity Analytics | HR, leadership | Distribution/skew/completion/gaps/bias-disparity | provisional, suppressed, full |

### 7.2 Cross-cutting UI rules

- Mobile-first, responsive (breakpoints 375/768/1280 px, touch targets ≥ 44×44 px); collapsible sidebar with menu icons and hamburger toggle; **Workspace switcher** (Me / My Team / Admin) per Foundation Manager-review model.
- Every screen implements the canonical UI-state standard (empty, loading, error, success, no-permission, partial-data; offline where relevant) — no skeleton-only screens; real fields, data, API calls and states.
- WCAG 2.1 AA: keyboard navigation, visible focus, AA contrast, ARIA labels; dark mode via design tokens.
- Confidential content uses **P02 field-mask-on-serialization** (hidden, not greyed) and watermarked PDFs (G13).
- All lists **cursor-paginated** (limit default 25/max 100); destructive/guarded actions confirm with consequence summary; certification/ratification/disposal require MFA step-up **and** DSC; disposal/downgrade require a second approver (P01 dual-control).
- Dates display `DD-MMM-YYYY`; money INR; timestamps in user timezone; UTC storage.

### 7.3 Plain-language role context & "why hidden" (R17 — leak-prevention control)

- Every assessment/disclosure screen shows a **plain-language tier banner** stating who the user is on this APAR and what they may do.
- Where a field is **absent** due to the P02 mask, a **reason banner** explains why ("hidden until disclosure", "not visible to your tier", "sealed cover"), treated as a confidentiality leak-prevention control, not cosmetic.
- Multi-role users see the lowest-privilege mask (P02 intersection) with a note explaining which role is active.

---

## Section 8 — API & Integration

### 8.1 Conventions (platform-adopted)

- Base path **`/api/v1/g08`**; JSON; Bearer JWT carrying resolved roles + tenant/entity scope; endpoints call **`Authorization.check`** (P02) — never re-implement permission logic.
- **Cursor pagination only** (`?limit=` default 25 / max 100 + `cursor=` → `next_cursor`); `?sort=field:asc|desc`; field filters per endpoint. **No offset paging.**
- **`Idempotency-Key`** on all unsafe POSTs that start a transaction (24h replay) — required for workflow-initiating, certify, ratify, seal, post-to-sr, sign actions.
- **`X-Correlation-Id`** carried/assigned per request, echoed in the response header and written to every P05 audit/log line.
- Effective-dated mutations accept `effective_from` (staged, `VAL-EFFECTIVE`).
- Statutory acts (certify, acknowledge, ratify, expunge, No-Report, seal-release, dispose, downgrade) require an attached VALID `signature_id` (FR-G08-20).

### 8.2 Canonical error envelope (platform)

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Performance weightage must total 100% (DEVELOPMENT goals excluded)",
    "field": "goals.weightage",
    "details": { "delta": 5.0 }
  }
}
```

The correlation id is carried in the **`X-Correlation-Id` response header**, not a body `requestId`. 2xx returns the resource payload.

### 8.3 Standard error-code table + module errors

**Platform 8-code standard table (Foundation §1):**

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | **422** | input failed a `VAL-*` rule |
| `UNAUTHENTICATED` | 401 | no/invalid session or step-up needed |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks out-of-scope existence) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start, state conflict |
| `PRECONDITION_FAILED` | 412 | a required precondition not met (incl. missing DSC, unconfigured chain) |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error (upstream failures mapped here via X.3 + `ERR-LOADFAIL`) |

> The v2 invented codes are overridden: `VALIDATION_ERROR(400)`→`VALIDATION_FAILED(422)`; `AUTH_REQUIRED(401)`→`UNAUTHENTICATED(401)`; `INTERNAL_ERROR(500)`→`INTERNAL(500)`; `UPSTREAM_UNAVAILABLE(503)` dropped (handled via X.3 mapping + `INTERNAL`/`ERR-LOADFAIL`). No `503` in the standard table.

**Module-unique `ERR-G08-*` (registered in the Foundation §5 index), each mapped to a standard code:**

| `ERR-G08-*` id | Standard code/HTTP | Meaning |
|---|---|---|
| `ERR-G08-WEIGHTAGE` | `VALIDATION_FAILED` 422 | Performance goal weightages ≠ 100% at lock (`VAL-WEIGHTAGE/WSUM`) |
| `ERR-G08-TIERCONFLICT` | `CONFLICT` 409 | Same person across tiers / self-adjudication |
| `ERR-G08-SELFADJ` | `FORBIDDEN` 403 | Caller is appraisee on this form |
| `ERR-G08-COI` | `FORBIDDEN` 403 | Declared conflict of interest; recuse before acting (R22) |
| `ERR-G08-STATE` | `CONFLICT` 409 | Action not allowed in current form status |
| `ERR-G08-GRADERANGE` | `VALIDATION_FAILED` 422 | Grade outside scale bounds |
| `ERR-G08-ADVEVID` | `VALIDATION_FAILED` 422 | Adverse remark lacks disclosable evidence (`VAL-G08-ADVEVID`, R5) |
| `ERR-G08-REPWINDOW` | `CONFLICT` 409 | Representation window elapsed (condonation required) |
| `ERR-G08-DISCLOSE` | `CONFLICT` 409 | Action blocked until APAR disclosed |
| `ERR-G08-RATIFY` | `CONFLICT` 409 | Calibration not ratified by competent authority (R1) |
| `ERR-G08-FORCEDDIST` | `VALIDATION_FAILED` 422 | Forced distribution removed; method unavailable (R2) |
| `ERR-G08-SEALED` | `CONFLICT` 409 | Finalise/post/feed blocked while sealed (R3) |
| `ERR-G08-CHAIN` | `PRECONDITION_FAILED` 412 | Apex chain cannot satisfy "all distinct"; needs config (`VAL-G08-CHAIN`, R12) |
| `ERR-G08-SIGN` | `PRECONDITION_FAILED` 412 | Statutory act needs a valid DSC/eSign (R10) |
| `ERR-G08-SIGNINVALID` | `VALIDATION_FAILED` 422 | Signature verification failed/revoked/expired |
| `ERR-G08-DUALCTRL` | `FORBIDDEN` 403 | Second-person approval needed for disposal/downgrade (R23) |
| `ERR-G08-TAMPER` | `CONFLICT` 409 | OPEN-PLAT-03 chain verification failed (R11) |
| `ERR-G08-ERRATA` | `CONFLICT` 409 | Concurrent cycle errata; serialize (R18) |
| `ERR-G08-ALREADYPOSTED` | `CONFLICT` 409 | SR posting is an idempotent no-op |
| `ERR-G08-CUSTODYORPHAN` | `CONFLICT` 409 | No custodian resolvable on transfer |

Shared `ERR-*` reused: `ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-PAST-DATED`, `ERR-REASON-REQ`, `MSG-SYS-JOBFAIL`.

### 8.4 JSON examples

**Submit RO part-period assessment with adverse evidence (request):**
```json
POST /api/v1/g08/forms/{formId}/assessment/reporting/submit
Idempotency-Key: 8f1c…  ·  X-Correlation-Id: b7c2…
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
  "status": "DISCLOSURE"
}
```

**Calibration not ratified (error):**
```json
{ "error": { "code": "CONFLICT", "message": "Certified grade may change only after AA ratification of the recommendation", "field": "recommendation_id", "details": { "err_id": "ERR-G08-RATIFY" } } }
```

**Sealed cover blocks posting (error):**
```json
{ "error": { "code": "CONFLICT", "message": "Finalisation and G06 feed suppressed while sealed cover is active", "field": "form_id", "details": { "err_id": "ERR-G08-SEALED" } } }
```

**Disclosure-log verification (response):**
```json
{ "form_id": "f...01", "chain_valid": true, "rows_verified": 14, "last_anchor_ref": "ANCHOR-2026-05-01-0007", "basis": "P05 + OPEN-PLAT-03" }
```

### 8.5 Integration contracts (all via the platform service-contract convention: auth context + Idempotency-Key + correlation id + standard envelope)

| System | Mode | Payload |
|---|---|---|
| G12 SR | append via canonical `POST /api/v1/sr/ingest` (X.3 outbox, `VAL-SR-EVENT`) | `{event_type:"APAR_FINAL_GRADE", event_category:"APPRAISAL", source_module:"G08", source_reference_id:form_id, source_event_version, tenant_id, entity_id, employee_id, cycle_id, final_grade, label, is_adverse, form_ref, chain_anchor_ref}` — **no `fact_key`**: `APPRAISAL` final grade is not a qualifying-service-bearing type, so G12 FR-01's `fact_correlation_rule` does not apply (fact_key is mandatory only for G04/G05/G06/G10/G11; REMEDIATION D1) |
| G12 SR (probation) | append via `POST /api/v1/sr/ingest` | `{event_type:"PROBATION_CONFIRMED", event_category:"APPRAISAL", source_module:"G08", source_reference_id:form_id, source_event_version, tenant_id, entity_id, employee_id, confirmation_date, form_ref}` |
| G06 eligibility | feed by reference (upsert by cycle; **sealed-suppressed**) | `{employee_id, cycle_id, final_grade, below_benchmark, suppressed:false}` |
| G07 training | nomination POST | `{employee_id, competency_id, gap_severity, source:"APAR"}` |
| G09 disciplinary | subscribe/read | `{employee_id, charge_status, case_ref, conclusion_outcome}` → sealed cover |
| G01 employee | feed (probation) | `{employee_id, employment_status, confirmation_date, effective_from}` |
| G13 documents | store/fetch | encrypted PDF + acknowledgement + signature artefacts (`document_id`) |
| eSign/DSC provider (X.3) | sign/verify | `{payload_hash, method, certificate_serial}` → `{signature_value, status}`; creds from P04 |
| Notifications (X.2/W.3) | publish | task/deadline/escalation/disclosure/seal events; templates `MSG-M09-*`/`MSG-G08-*` |

---

## Section 9 — Non-Functional Requirements (platform baseline)

| Category | Requirement |
|---|---|
| Performance | Standard API p95 < 500 ms @ 300 concurrent; read-heavy (directory/analytics) p95 < 300 ms cached / < 1000 ms uncached; write p95 < 1500 ms; **P02 field-mask read p95 < 500 ms at 200k employees via caching/column pre-computation — a hard GA gate (R14)**; bulk form materialise (10k) async; web LCP < 2.5 s (4G) |
| Availability | **99.5%/month** (platform baseline, overrides invented 99.9%); degraded-read mode if G12/G06/eSign down (X.3 outbox + pending-signature) |
| Scalability | Horizontal; ≥ 200k employees; calibration over ≥ 5k forms; multi-RO periods per form |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; **P02 PII Protection Ceiling + field-mask-on-serialization**; MFA step-up **and DSC/eSign** for certify/ratify/dispose; P01 dual-control on disposal/downgrade (R23) |
| Non-repudiation | DSC/eSign on all statutory acts (X.3 provider); signatures re-verifiable; provider outage never bypasses the requirement (R10) |
| Privacy | DPDP Act 2023 alignment; PII minimisation; CONFIDENTIAL classification; min-N suppression incl. protected-attribute disparity (R13); `consent_records` + `VAL-CONSENT` where applicable |
| Auditability | **P05 dual-log, DB-trigger, immutable, ≥ 7-yr**; 100% mutation capture; APAR access in `apar_disclosure_log`; statutory tamper-evidence tracks **OPEN-PLAT-03** with a `/verify` endpoint (R11); reading an audit log is itself audited |
| Reliability | X.3 outbox + retry (exp backoff ×5 + dead-letter) for SR/G06/G07 posting; no partial commits; idempotent posting/sealing |
| Recoverability | **RTO < 4 h · RPO < 1 h** (platform baseline, overrides invented 15 min); point-in-time restore for statutory records |
| Accessibility | WCAG 2.1 AA; keyboard/focus; dark mode; plain-language role context (R17) |
| Observability | Structured logs (no PII values), metrics, traces with `X-Correlation-Id`; SLA dashboards for cycle progress and escalation (`JOB-M09-SLA`) |
| Retention | Statutory retention schedule; **statutory retention overrides DPDP erasure** (P05 redaction-marker basis recorded, R15); controlled, P01 dual-control, approved disposal only; no hard delete |
| i18n/l10n | `DD-MMM-YYYY`, INR money, multilingual labels |

---

## Section 10 — Workflow & State Diagrams (P01 flow definitions)

> All state machines below are **configured P01 W.1 flow definitions** executed by the WorkflowEngine; transitions are P01 actions (`advance/approve/reject/sendBack/delegate`), each idempotent and audited to P05; in-flight instances pin their definition version.

### 10.1 Appraisal form (APAR) state machine

| Current | Event | Guard | Next | Side effects |
|---|---|---|---|---|
| DRAFT | cycle open | eligible, not under charge | GOALS_PENDING | notify appraisee/RO |
| DRAFT | cycle open | under G09 charge | SEALED_COVER | seal + log |
| GOALS_PENDING | goals lock | `VAL-WEIGHTAGE/WSUM`=100, all approved | GOALS_APPROVED | write snapshots (E20); notify |
| GOALS_APPROVED | self window open | — | SELF_APPRAISAL | notify appraisee |
| SELF_APPRAISAL | self submit | narrative present | RO_ASSESSMENT | notify RO(s) |
| RO_ASSESSMENT | all periods submitted/No-Report | integrity+penpicture+grade+DSC valid; adverse evidence present | RVO_REVIEW | aggregate provisional; notify RvO |
| RO_ASSESSMENT | RO return self | — | SELF_APPRAISAL | notify appraisee |
| RO_ASSESSMENT | RO overdue | grace elapsed (`JOB-M09-SLA`) | RO_ASSESSMENT (escalated author) / No-Report | transfer authoring (R9) |
| RVO_REVIEW | RvO submit | concur/variance valid + DSC; no COI | AA_ACCEPTANCE | notify AA |
| RVO_REVIEW | RvO return | — | RO_ASSESSMENT | notify RO |
| AA_ACCEPTANCE | certify | step-up + DSC, grade valid, not sealed | DISCLOSURE | derive flags; sign |
| AA_ACCEPTANCE | certify | sealed_cover=true | SEALED_COVER | hold; log |
| (any pre-final) | G09 charge raised | — | SEALED_COVER | seal; suppress feed |
| SEALED_COVER | release | G09 concluded + signed release | (prior status) | unseal; log; resume |
| DISCLOSURE | disclose (mandatory, full) | — | DISCLOSED | dispatch+log; notify; start clock |
| DISCLOSED | acknowledge (eSign) | — | DISCLOSED (ack set) | log; window from ack if configured |
| DISCLOSED | deemed-disclosure | non-ack after configured days (`JOB-M09-AUTOACK`) | DISCLOSED (deemed) | window opens (R8) |
| DISCLOSED | file representation | within window | REPRESENTATION | notify authority |
| DISCLOSED | window expires | no rep | FINALISED | — |
| REPRESENTATION | decide | authority valid + DSC; no COI | FINALISED | recompute grade if modified/expunged |
| REPRESENTATION | reject + escalate | external reference recorded | (rep ESCALATED) | flag CAT/tribunal handoff (R20) |
| FINALISED | post to SR | rep resolved, **not sealed** | POSTED | G12 + G06 events (G06 suppressed if sealed) |
| (cycle) | errata apply | P01 dual-control + impact computed | ERRATA→prior | re-derive flags; corrective events (R18) |
| any (pre-POSTED) | withdraw (admin) | reason | WITHDRAWN | log |
| FINALISED/POSTED | expunge (statutory) | authority + DSC | EXPUNGED | corrective SR event |

### 10.2 Goal state machine (M09 employee×period)

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
| DRAFT | RvO concur + activate | concurrence (P01) | ACTIVE |
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
| (form) active | G09 charge | charge active | SEALED_COVER |
| SEALED_COVER | hold | sealed | SEALED_COVER (no finalise/post) |
| SEALED_COVER | release | G09 concluded + signed | prior status |

### 10.7 Cycle errata state machine (R18)

| Current | Event | Guard | Next |
|---|---|---|---|
| cycle IN_PROGRESS | errata propose | authority | (errata DRAFT) |
| errata DRAFT | impact computed + approve | P01 dual-control | (errata APPROVED) |
| errata APPROVED | apply | txn | cycle ERRATA → IN_PROGRESS (flags re-derived) |

### 10.8 Report-period state machine (R4)

| Current | Event | Guard | Next |
|---|---|---|---|
| DRAFT | RO submit | supervision ≥ min, DSC | SUBMITTED |
| DRAFT | No-Report | supervision < min (`VAL-G08-SUPV`), signed cert | NO_REPORT |
| SUBMITTED/NO_REPORT | aggregate | all periods resolved | AGGREGATED |

---

## Section 11 — Notifications (X.2 / W.3)

> Recipients resolved via **W.3**; dispatched via **X.2** (IN_APP + EMAIL parallel; statutory notices mandatory/non-suppressible per Platform §X.2 / BRD §9.9); templates referenced by id, never inlined. M09 templates reused; APAR-specific templates authored as `MSG-G08-*`.

| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Cycle opened / goals due | Appraisee, RO | in-app, email | `MSG-M09-*` (cycle/goal) |
| Goals returned / approved / locked (snapshot) | Appraisee | in-app, email | `MSG-M09-*` (goal) |
| Self-appraisal due / returned | Appraisee | in-app, email | `MSG-M09-*` (review) |
| RO/RvO/AA task assigned | Respective officer | in-app, email | `MSG-M09-*` (review task) |
| Deadline approaching | Owner | in-app, email | `MSG-M09-*` (SLA, `JOB-M09-SLA`) |
| **Authoring right escalated / transferred** | New author, prior officer, HR | in-app, email | `MSG-G08-ESCALATION` (R9) |
| **No-Report Certificate issued** | HR, RvO, appraisee | in-app | `MSG-G08-NOREPORT` (R4) |
| MSF/360 invitation | Rater | email (token link) | `MSG-M09-*` (MSF) |
| Calibration session scheduled | Committee | in-app, email | `MSG-M09-*` (calibration) |
| **Calibration recommendation awaiting ratification** | AA/competent authority | in-app, email | `MSG-G08-CALIB-RATIFY` (R1) |
| **APAR disclosed (mandatory, full) + window opens** | Appraisee | in-app, email | `MSG-G08-DISCLOSED` (R7,R8) |
| Representation filed / decided / escalated | Authority / Appraisee | in-app, email | `MSG-G08-REP-STATUS` |
| **Sealed cover applied / released** | HR, AA, Custodian | in-app, email | `MSG-G08-SEALED` (R3) |
| **Signature required / completed / revoked** | Acting authority | in-app | `MSG-G08-SIGN` (R10) |
| **Tamper-check failed** | Custodian, Auditor | in-app, email | `MSG-G08-TAMPER` (R11) |
| **Cycle errata applied (re-derivation/re-disclosure)** | Affected officers, authorities | in-app, email | `MSG-G08-ERRATA` (R18) |
| **Probation outcome (confirm/extend/discharge)** | Appraisee, HR | in-app, email | `MSG-M09-*` probation / `MSG-G08-PROBATION` (R19) |
| **Legal-heir access granted** | Heir/nominee, Custodian | in-app, email | `MSG-G08-HEIR` (R15) |
| Grade posted to SR | HR, Custodian | in-app | `MSG-G08-SR-POSTED` |
| Competency gap → training nominated | Appraisee, HR | in-app | `MSG-M09-*` (training nom) |
| PIP activated / milestone at-risk / closed | Appraisee, RO, RvO | in-app, email | `MSG-M09-*` (PIP) |
| Unauthorised access attempt | Custodian, Auditor | in-app | `MSG-G08-ACCESS-DENIED` |

All notifications write to platform `notifications`; no PII values beyond identifiers; every dispatch audit-logged (P05); retry exp backoff ×5 + dead-letter (X.2).

---

## Section 12 — Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| Cycle completion funnel | HR, leadership | Counts per form status (incl. SEALED_COVER, ESCALATED), overdue, by org/cadre |
| Rating distribution (pre/post calibration) | HR, AA | Histogram vs target (diagnostic, `VAL-DISTRIB`); skew per RO/unit |
| Grading-skew / bias flags | HR | ROs/units beyond deviation threshold |
| **Bias-disparity (equity)** | HR, leadership, Auditor | Adverse/below-benchmark/grade-mean by gender/cadre/region/RO over time, min-N suppressed (R13) |
| **Rater-leniency / central-tendency model** | HR | Cross-cycle RO leniency/severity tendency (R13) |
| Adverse & representation rate | HR, Auditor | Adverse counts, representation volume/outcomes, escalations, SLA breaches |
| **Sealed-cover & escalation report** | HR, Auditor | Sealed-cover population, releases, tier-default escalations (R3, R9) |
| Competency-gap heatmap | HR, L&D (G07) | Gaps by competency/org; nomination conversion |
| MSF/360 participation | HR | Response rates by relationship; suppression flags |
| PIP outcomes | HR | Active/closed PIPs, success rate |
| Probation outcomes | HR | Confirmed/extended/discharge-recommended counts (R19) |
| Benchmark eligibility feed | G06 | Employees meeting/below benchmark per cycle (sealed suppressed) |
| Custody & access audit + chain-verification | Custodian, Auditor | Access events, denied attempts, custody transfers, OPEN-PLAT-03 verify status (R11) |

All analytics respect P02 scope and min-N suppression; feed **G14** via the read API; freshness ≤ 15 min.

---

## Section 13 — Migration & Launch

### 13.1 Data migration (on P06 ETL+V)

| Source | Target | Approach |
|---|---|---|
| Legacy APAR records (paper/scanned) | E4 + `documents` (G13) | Digitise; capture final grade, label, adverse flag, cycle; link scanned PDF; `gov_source_id` traceability |
| Historical grades | `service_register_events` (G12) | Back-post as historical events (flagged), preserving original dates |
| Multi-RO history | E19 report periods | Reconstruct part-periods where supervision history exists; else single-period |
| Competency framework | G07 read | Map legacy competencies to G07 catalog |
| Reporting chains | G01/M01 | Reconcile RO/RvO/AA history per cycle |
| M09 in-flight goal plans/reviews | M09 entities | Reuse existing PrimeSoft M09 rows; G08 attaches statutory APAR wrappers |

### 13.2 Migration rules
- Run on **P06** — three mandatory staging dry runs gate cutover; waves; failed records logged with source row + violated rule in `migration_runs`.
- Historical records imported in `ARCHIVED` status; no re-adjudication; final grades validated against the historical scale (snapshot).
- All migrated APARs default to CONFIDENTIAL (P02); access logged from import onward (P05).
- Reconciliation report lists unmapped chains/competencies/periods for manual resolution (no silent drops).
- Migrated records without a digital signature are flagged `legacy-unsigned`; new acts require DSC.

### 13.3 Launch plan (phased — R16)
1. **Phase-1 GA (statutory core, no flags):** Pilot one entity for one cycle exercising the legally-required path: configure cycle → goals (M09, snapshot) → self → multi-RO RO/RvO/AA (DSC, P01) → mandatory disclosure → representation (+escalation) → post to G12, with sealed-cover, auto-escalation (`JOB-M09-SLA`), P05/OPEN-PLAT-03 custody and P01 dual-control disposal live.
2. **GA gates:** lock the **grade-derivation contract** and the **P02 field-mask contract** as standalone libraries with their own test suites; the **field-mask 200k load-test (p95 < 500 ms)** is a hard GA gate (R14).
3. **Phase-2 (flagged differentiators):** enable `g08.calibration` (ratified recommendation), `g08.continuous-feedback`, `g08.msf-360` after the statutory core is proven (capability flags registered in RBAC §4.3).
4. Verify G12/G06/G07/G09/eSign integration end-to-end (X.3 outbox retry, sealed-cover suppression, signature-provider outage).
5. Train ROs/RvOs/AAs and custodians; publish confidentiality + sealed-cover + signing SOPs; phased rollout by cadre; monitor SLA/escalation dashboards; cutover legacy capture.

### 13.4 Rollback / contingency
- X.3 outbox enables safe replay if downstream modules lag; pending-signature state holds acts during eSign outage.
- Capability flags per differentiator (calibration, continuous, MSF, bell-curve) for staged enablement; Phase-1 runs with all off.
- Statutory records are append-only with P05 + OPEN-PLAT-03 tamper-evidence; corrections via corrective events / controlled errata, never destructive edits.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → platform service)

| FR | Entities | Key APIs | Platform service |
|---|---|---|---|
| FR-G08-01 | E1,E2,E3,E4,E19 | /cycles,/open,/templates,/rating-scales | P01, W.2, `JOB-M09-PLAN/REVIEW-OPEN` |
| FR-G08-02 | E5,E20,E4 | /goals,/approve,/lock,/goal-snapshots | M09 goals, `VAL-WEIGHTAGE/WSUM` |
| FR-G08-03 | E7,E20,E4 | /self-appraisal* | M09 review |
| FR-G08-04 | E8,E19,E23,E4,E9,E20 | /assessment/reporting* | P01, X.3 (DSC) |
| FR-G08-05 | E8,E23,E22,E4 | /assessment/reviewing*,/recuse | P01, P02 (COI) |
| FR-G08-06 | E8,E23,E21,E4,E3 | /assessment/accepting* | P01, P02 step-up, X.3 |
| FR-G08-07 | E3,E2,E20,E4,E8 | /rating-scales,/grade/preview | `VAL-WEIGHTAGE/WSUM/SUBWSUM` |
| FR-G08-08 | E13,E4,E18,E23 | /disclose,/acknowledge,/representations,/decide,/escalate,/condone | P01, X.2, P05, `JOB-M09-AUTOACK`,`JOB-G08-REP-SLA` |
| FR-G08-09 | E14,E21,E15,E22,E23,E4 | /calibration/* | M09 calibration, `VAL-DISTRIB` |
| FR-G08-10 | E10,E6,E5 | /feedback,/checkins | M09 continuous feedback |
| FR-G08-11 | E11,E12,E9 | /360/* | M09 MSF |
| FR-G08-12 | E9,G07,E7 | /competencies*,/nominate | G07, X.3 |
| FR-G08-13 | E16,E17,E4 | /pips* | M09 PIP, P01 |
| FR-G08-14 | E4,G12,G06,E18 | /finalise,/post-to-sr | G12 (P05), G06, X.3 outbox, `JOB-G08-SR-POST` |
| FR-G08-15 | E18,E23,E4 | /pdf,/custody-transfer,/access-log,/verify,/heir-access,/dispose,/downgrade | P02, P05, OPEN-PLAT-03, G13, `JOB-G08-ANCHOR` |
| FR-G08-16 | E4,E15,E21,E9,E11/12,employees | /analytics/* | P02, feeds G14 |
| FR-G08-17 | E4,E18,E23,G09 | /seal,/seal/release | G09, P01, `JOB-G08-SEAL-MONITOR` |
| FR-G08-18 | E19,E8,E23,E4 | /report-periods*,/no-report,/aggregate | `VAL-G08-SUPV/PERIODTILE` |
| FR-G08-19 | E8,E19,E4,workflow_actions | /escalate,/sla-status,/no-report-tier | P01 SLA, `JOB-M09-SLA` |
| FR-G08-20 | E23,E8/E15/E18/E19/E21 | /signatures,/verify | X.3 eSign, P04, P05, G13 |
| FR-G08-21 | E1,E4,G12,employees | /probation/decide,/probation/extend | M09 probation, `JOB-M09-PROBATION`, G01, G12 |
| FR-G08-22 | E1,E3,E4,G12/G06 | /errata/propose,/impact,/approve,/apply | P01 dual-control |

### 14.2 Dependency graph

```
FR-07 (scale/roll-up) ─┐
FR-20 (DSC, X.3) ──────┼──> hard libraries built first (with FR-15 P02 field-mask)
FR-15 (mask, P02) ─────┘
FR-01 ──> FR-02(+snapshot) ──> FR-03 ──> FR-18(periods) ──> FR-04 ──> FR-05 ──> FR-06 ──> FR-08 ──> FR-14
   │                                                                      │            │
FR-17 (sealed, G09) ── gates FR-06/FR-14 (suppress feed)                  │            │
FR-19 (escalation, JOB-M09-SLA) ── cross-cuts FR-04/05/06                 │            │
FR-09 (calibration, P2 flag) ── feeds FR-06 ratify / pre-cert ───────────┘            │
FR-10/11 (continuous/MSF, P2) ── feed evidence into FR-04 (not sole adverse basis)    │
FR-12 (competency) ── part of FR-04, writes G07                                       │
FR-13 (PIP) ── follows FR-06 outcome                                                  │
FR-21 (probation, JOB-M09-PROBATION) ── variant of FR-04/05/06 → G01/G12              │
FR-22 (errata) ── corrects config, re-derives FR-07/08/14 outputs                     │
FR-16 (analytics) ── reads FR-06/07/09/12/11 + employees, feeds G14 ──────────────────┘
```

### 14.3 Parallel-agent build plan (phased — R16)

| Wave | FRs (parallelisable) | Phase | Rationale |
|---|---|---|---|
| W0 (hard libraries — gate) | FR-07 (grade engine), FR-20 (DSC/X.3), FR-15 (P02 field-mask) | P1 | Built first as standalone tested libraries; field-mask 200k load-test is a GA gate |
| W1 (foundation) | FR-01, FR-18 (report periods) | P1 | Cycle/forms (on M09) + multi-RO scaffolding |
| W2 | FR-02 (+snapshot), FR-17 (sealed cover) | P1 | Goals (M09) decoupled+snapshot; sealing scaffolding |
| W3 | FR-03, FR-12, FR-19 (escalation) | P1 | Self-appraisal, competency, SLA escalation |
| W4 | FR-04, FR-05, FR-06 | P1 | Tier assessments on P01 — consume DSC + periods + sealed guard |
| W5 | FR-08 (disclosure/representation), FR-13 (PIP), FR-21 (probation) | P1 | Mandatory disclosure + appeal ladder; PIP; probation |
| W6 | FR-14 (posting to G12/G06), FR-22 (errata) | P1 | Posting (sealed-aware) + errata correction |
| W7 (flagged differentiators) | FR-09 (calibration), FR-10, FR-11 | P2 | Behind capability flags after statutory core proven |
| W8 | FR-16 (analytics incl. bias-disparity) | P1/P2 | Reads all; feeds G14; last |

Shared contracts (platform error table, P01 state machines, grade engine, P02 field-mask, DSC, OPEN-PLAT-03 verify) are built first as libraries to avoid drift across parallel agents.

### 14.4 Final reconciliation table (0 unresolved gaps — incl. platform rows)

| Concern | Covered by | Status |
|---|---|---|
| Goal setting + cascading + weightage (employee×period) | FR-02 (M09 goals + `VAL-WEIGHTAGE/WSUM/SUBWSUM`) | Resolved |
| Goals decoupled from form + snapshot-on-lock (R6) | FR-02, E5/E20 | Resolved |
| Explicit weightage-policy semantics (R21) | FR-07, E2, `VAL-WEIGHTAGE` | Resolved |
| Self-appraisal | FR-03 (M09 review) | Resolved |
| APAR three-tier (RO/RvO/AA) on P01 | FR-04/05/06 (P01 SEQUENTIAL/DYNAMIC_APPROVER) | Resolved |
| Multi-RO part-period + No-Report Certificate (R4) | FR-18, E19, `VAL-G08-SUPV` | Resolved |
| Rating scales + numeric grading + contribution-level | FR-07 (M09 rating) | Resolved |
| Mandatory full disclosure (R7) | FR-08 | Resolved |
| Disclosure/representation clock clarity (R8) | FR-08, E4, `JOB-M09-AUTOACK` | Resolved |
| Representation/appeal + escalation ladder + external (R20) | FR-08, E13 | Resolved |
| Natural-justice adverse-evidence guard (R5) | FR-04/05/06/08, `VAL-G08-ADVEVID` | Resolved |
| Calibration as ratified recommendation (R1) | FR-09, E21/E15 (M09 calibration extended) | Resolved |
| Forced-distribution removed; absolute grading (R2) | FR-09, E14 enum, `VAL-DISTRIB` diagnostic | Resolved |
| COI recusal (R22) | FR-05/06/09, E22, P02 | Resolved |
| Continuous feedback & check-ins | FR-10 (M09) | Resolved |
| MSF / 360-degree feedback | FR-11 (M09 MSF) | Resolved |
| Competency assessment + G07 skill-gap→training | FR-12 | Resolved |
| Integrity/attribute columns + pen-picture | FR-04 (E4 fields) | Resolved |
| PIP | FR-13 (M09 PIP) | Resolved |
| Sealed Cover Procedure (R3) | FR-17, E4, FR-14 suppression, G09 | Resolved |
| SLA auto-escalation / authoring transfer (R9) | FR-19, `JOB-M09-SLA`, P01 | Resolved |
| Digital signature / non-repudiation (R10) | FR-20, E23 (`GAP` on X.3+P05+G13) | Resolved |
| Tamper-evidence + verify (R11) | FR-15, E18, **P05 + OPEN-PLAT-03** (invented hash-chain replaced) | Resolved |
| Custody & confidentiality + heir access + dual-control (R15, R23) | FR-15, P02, P01 | Resolved |
| Field-mask performance gate (R14) | FR-15 LLD, §9, §13.3 (P02) | Resolved |
| Apex-chain handling (R12) | FR-01/05/06, E4, `VAL-G08-CHAIN` | Resolved |
| Probation confirmation appraisal (R19) | FR-21 (M09 probation + `JOB-M09-PROBATION`) | Resolved |
| Cycle errata workflow (R18) | FR-22 (P01 dual-control) | Resolved |
| Post final ratings to SR ledger | FR-14 → **G12 (P05)** | Resolved |
| Feed promotion eligibility (G06), sealed-suppressed | FR-14 (by reference), FR-17 | Resolved |
| Analytics + bias-disparity equity (R13) | FR-16 → G14 | Resolved |
| Plain-language role context + why-hidden (R17) | §7.3, FR-04/05/06 (P02 mask) | Resolved |
| Phased scope / feature flags (R16) | §13.3, §14.3, §5.5 (RBAC §4.3 flags) | Resolved |
| **Multi-tenancy (`tenant_id`/`entity_id`)** | §5.0, every entity | Resolved (platform) |
| **Workflow on P01 (not invented engine)** | §10, all tier/rep/calib/errata flows | Resolved (platform) |
| **Authz/confidentiality on P02 (PII ceiling)** | §3, §4, FR-15 | Resolved (platform) |
| **Audit on P05 dual-log (DB-trigger)** | §2.2, §9, all FRs | Resolved (platform) |
| **Notifications on X.2/W.3** | §11 | Resolved (platform) |
| **Migration on P06** | §13.1/13.2 | Resolved (platform) |
| **Platform error envelope + 8-code table** | §8.2/8.3 | Resolved (platform) |
| **Cursor pagination + Idempotency-Key + X-Correlation-Id** | §8.1 | Resolved (platform) |
| **NFR baseline (99.5%, RPO<1h, p95<500ms)** | §9 | Resolved (platform) |
| **RBAC v1.7 roles + capability flags** | §3.1 | Resolved (platform) |
| **`VAL-*`/`JOB-M09-*`/`MSG-*` citation by id** | §5/§8/§11 | Resolved (platform) |
| **G-code re-key (G08)** | header, throughout | Resolved (platform) |
| Sample data per entity (E1–E23) | §5.7 | Resolved |
| **Unresolved gaps** | — | **0** |

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| APAR | Annual Performance Appraisal Report — statutory confidential appraisal record |
| Appraisee / Officer Reported Upon | Employee whose performance is appraised |
| Reporting / Reviewing / Accepting Officer (RO/RvO/AA) | First / second / final-tier appraisers (P01 reporting-chain approvers) |
| Competent / Adjudicating Authority | Authority (senior to AA) that adjudicates representations / ratifies calibration |
| Condonation Authority | Authority that may admit a late representation |
| Sealed Cover Procedure | Holding an APAR's finalisation and eligibility feed while the officer is under charge / sub judice (driven by G09) |
| No-Report Certificate | Record issued where an RO supervised below the minimum period (`VAL-G08-SUPV`) |
| Snapshot-on-lock | Immutable copy of approved M09 goals written into the statutory form at lock |
| Ratified recommendation | A calibration committee proposal a competent authority signs into effect |
| KRA / KPI / OKR | Key Result Area / Key Performance Indicator / Objectives & Key Results (M09 goal model) |
| Pen-picture / Integrity column | RO's qualitative narrative / statutory integrity certification |
| Benchmark / Adverse | Minimum promotion grade / below-threshold appealable remark requiring disclosable evidence |
| Representation / Expunction | Officer's formal appeal / removal of an adverse remark after a successful representation |
| Calibration / Normalisation | M09 committee moderation; output is a ratified recommendation; `VAL-DISTRIB` diagnostic only |
| DSC / eSign | Digital Signature Certificate / electronic signature — non-repudiable, via X.3 provider, distinct from MFA |
| OPEN-PLAT-03 | Platform's proposed hash-chaining of the P05 audit head to WORM — the statutory tamper-evidence basis |
| Dual-control | P01 maker+checker second-person approval for irreversible actions |
| MSF | Multi-Source Feedback (PrimeSoft M09); anonymous and not a sole adverse basis |
| PII Protection Ceiling | P02 control overriding all upward role grants; basis of APAR field masking |
| Min-N suppression | Withholding aggregates below a minimum count to protect privacy |
| COI | Conflict of interest requiring recusal (E22) |
| P01–P06 / X.1–X.3 / W.1–W.3 | PrimeSoft platform engines (workflow/RBAC/chat/admin/audit/migration; jobs/notify/integration; flows/forms/notify-config) |

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

### Appendix B — Tier-aware field visibility (illustrative; via P02 field-mask; absent fields carry a reason banner, R17)
| Field | Appraisee (pre-disclosure) | RO | RvO | AA | Auditor |
|---|---|---|---|---|---|
| Goals / self-appraisal | full | full | full | full | full |
| RO remarks/grade (per period) | masked | full (own period) | full | full | full |
| RvO remarks/grade | masked | masked | full | full | full |
| AA final grade | after disclosure | read | read | full | full |
| Integrity remark | after disclosure | author | read | read | full |
| Sealed-cover status | reason-banner only | masked | masked | full | full |

### Appendix C — Statutory calendar (illustrative APAR year)
| Milestone | Indicative window | Job |
|---|---|---|
| Goal setting (M09 plan) | Apr–May | `JOB-M09-PLAN-OPEN` |
| Self-appraisal | Apr (period end +) | `JOB-M09-REVIEW-OPEN` |
| RO assessment (per period) | within 30 days of self | `JOB-M09-SLA` |
| RvO review | within 15 days of RO | `JOB-M09-SLA` |
| AA acceptance (DSC) | within 15 days of RvO | `JOB-M09-SLA` |
| Calibration (Phase-2, if enabled) | pre-cert or post-cert ratification | `JOB-M09-CALIB` |
| Disclosure (mandatory, full) | within 15 days of acceptance | `JOB-M09-NOTIFY` |
| Representation window | within statutory days of dispatch/ack | `JOB-M09-AUTOACK`, `JOB-G08-REP-SLA` |
| Posting to SR (G12) | after representation resolution and not sealed | `JOB-G08-SR-POST` |

### Appendix D — Assumptions & open items
- Exact statutory representation window, disposal deadline and condonation authority are configuration, set per jurisdiction at deployment (config cascade `platform → tenant → entity`).
- `representation_clock_start` (dispatch vs acknowledgement) is a per-jurisdiction config choice (R8); deemed-disclosure (`JOB-M09-AUTOACK`) still opens the window.
- Competency catalog and role-required levels are owned by G07; G08 consumes snapshots.
- Adjudicating-authority seniority and apex chain-truncation rules are configurable to the deploying government's service rules (R12).
- Minimum supervision threshold defaults to 3 months and is configurable (R4, `VAL-G08-SUPV`).
- The eSign/DSC provider (X.3) and OPEN-PLAT-03 anchoring schedule are environment-specific — **confirm OPEN-PLAT-03 status before build** (Platform §P05/§Z).

### Appendix E — Reuse confirmation
This BRD reuses, without redefining: the **PrimeSoft M09 Performance** model (goal plans, goals, review cycles, review templates, calibration sessions, PIP, MSF, continuous feedback, probation confirmation, contribution levels) and its `VAL-WEIGHTAGE/WSUM/SUBWSUM/DISTRIB/ACHV/GOALNAME` validators, `JOB-M09-*` jobs and `MSG-M09-*` templates; the platform engines **P01–P06 / X.1–X.3 / W.1–W.3**; the platform entities `employees`/`org_units`/`designations`/`cadres`/`roles`/`contribution_levels`, `documents`, `notifications`, `consent_records`, `integration_credentials`, `workflows`/`workflow_instances`/`workflow_actions`, `audit_log`/`security_audit_log`, `migration_runs`, and the **G12 `service_register_events`** ledger; the RBAC v1.7 model; and the platform API conventions, error table and NFR baseline. Module-owned entities E1–E23 extend, and do not fork, the M09 model.

### Appendix F — Council adopted-improvement → risk mapping (quick index)
| Risk | Adopted improvement | Primary FR/Entity |
|---|---|---|
| R1 | Calibration as ratified recommendation | FR-09, E21, E15 |
| R2 | Remove forced distribution; bell-curve off | FR-09, E14 |
| R3 | Sealed Cover Procedure | FR-17, E4 |
| R4 | Multi-RO part-period + No-Report | FR-18, E19 |
| R5 | Adverse-evidence natural-justice guard | FR-04/05/06/08, `VAL-G08-ADVEVID` |
| R6 | Decouple goals; snapshot-on-lock | FR-02, E5, E20 |
| R7 | Mandatory full disclosure | FR-08 |
| R8 | Disclosure clock clarity | FR-08, E4 |
| R9 | Auto-escalation on tier default | FR-19, `JOB-M09-SLA` |
| R10 | Digital signature / non-repudiation | FR-20, E23 |
| R11 | Tamper-evidence (P05 + OPEN-PLAT-03) | FR-15, E18 |
| R12 | Apex-chain handling | FR-01/05/06, E4 |
| R13 | Bias-disparity analytics | FR-16 |
| R14 | P02 field-mask performance gate | FR-15, §9 |
| R15 | Heir custody + retention vs erasure | FR-15 |
| R16 | Phase the scope | §13.3, §14.3 |
| R17 | Plain-language role context | §7.3 |
| R18 | Cycle errata workflow | FR-22 |
| R19 | Probation appraisal semantics | FR-21 |
| R20 | Representation escalation ladder | FR-08, E13 |
| R21 | Weightage-policy semantics | FR-07, E2 |
| R22 | Broaden COI / recusal | E22, FR-09 |
| R23 | Dual-control on irreversible actions | FR-15 |

---

## Alignment with PrimeSoft Platform

This section maps every G08 FR to the platform service(s) it runs on (P01/P02/P05/P06/X/W and the M09 base), and names any `GAP (gov-specific)` engine authored. G08 is an **EXTEND of PrimeSoft M09 Performance**; it authors only the statutory APAR layer and runs everything else on the platform.

| FR | Runs on (platform / M09) | `GAP (gov-specific)` authored | Notes |
|---|---|---|---|
| FR-G08-01 Cycle/template config | **M09** appraisal period/review cycle; **W.2** form; **P01** chain resolution; `JOB-M09-PLAN-OPEN/REVIEW-OPEN` | APAR statutory calendar/clock/chain config | Cycle binds the M09 review cycle and goal-plan window |
| FR-G08-02 Goal setting | **M09** `goals`/`goal_plans`; **`VAL-WEIGHTAGE/WSUM/SUBWSUM/GOALNAME`** | snapshot-on-lock (E20) | Reuses the M09 OKR plan; adds immutable statutory snapshot |
| FR-G08-03 Self-appraisal | **M09** self review | — | — |
| FR-G08-04 RO assessment | **P01** (`SEQUENTIAL`/`DYNAMIC_APPROVER`); **X.3** DSC; **P05** | multi-tier APAR + adverse-evidence guard | Tier-1 of the statutory chain |
| FR-G08-05 RvO review | **P01**; **P02** COI; **X.3** DSC | multi-tier APAR | Tier-2 |
| FR-G08-06 AA acceptance | **P01**; **P02** MFA step-up; **X.3** DSC | certification + ratification | Tier-3; maps grade to M09 contribution level |
| FR-G08-07 Scales & grade roll-up | **`VAL-WEIGHTAGE/WSUM/SUBWSUM`**; M09 rating | explicit weightage-policy + deterministic roll-up | Single roll-up library |
| FR-G08-08 Disclosure & representation | **P01**; **X.2**; **P05**; `JOB-M09-AUTOACK`, `JOB-G08-REP-SLA` | mandatory disclosure + appeal ladder + CAT handoff | Statutory |
| FR-G08-09 Calibration | **M09 `calibration_sessions`**; **`VAL-DISTRIB`** (diagnostic) | ratified-recommendation control (E21/E15) | Extends M09 calibration |
| FR-G08-10 Continuous feedback | **M09** continuous feedback + two-way thread | disclosability tagging | Phase-2 flag |
| FR-G08-11 MSF / 360 | **M09 MSF** | adverse-sole-basis guard | Phase-2 flag |
| FR-G08-12 Competency & gap | M09 competency; **G07** (X.3) | — | Writes G07 nomination |
| FR-G08-13 PIP | **M09 PIP**; **P01** concurrence | — | — |
| FR-G08-14 SR posting & G06 feed | **G12** ledger (on **P05**); **X.3** outbox; `JOB-G08-SR-POST` | SR event contract + G06 reference feed | G12 owns the ledger; G08 appends |
| FR-G08-15 Custody & confidentiality | **P02** field-mask; **P05** + **OPEN-PLAT-03**; **P01** dual-control; **G13** | disclosure/custody domain ledger + heir access | Replaces invented hash-chain |
| FR-G08-16 Analytics | **P02** scope; feeds **G14** | bias-disparity + rater-leniency model | Min-N suppression |
| FR-G08-17 Sealed Cover | **G09** subscribe; **P01**; `JOB-G08-SEAL-MONITOR` | Sealed Cover Procedure | Statutory |
| FR-G08-18 Multi-RO part-period | **`VAL-G08-SUPV/PERIODTILE`**; **X.3** DSC | part-period reports + No-Report Certificate | Statutory |
| FR-G08-19 SLA auto-escalation | **P01 SLA runtime** + **`JOB-M09-SLA`** | authoring-right transfer rules | Reuses M09 SLA job |
| FR-G08-20 Digital signature | **X.3** eSign provider; **P04** creds; **P05**; **G13** | **`GAP`**: statutory DSC/eSign engine (E23) | Platform has MFA, not statutory DSC |
| FR-G08-21 Probation | **M09 probation** + **`JOB-M09-PROBATION`**; **G01**; **G12** | probation→SR/employment feed | Reuses M09 probation |
| FR-G08-22 Cycle errata | **P01** maker-checker; **P05**; **X.2** | controlled re-derivation | Statutory |

**Net-new (`GAP`) engines G08 authors (each still runs on platform plumbing):** the multi-tier APAR adjudication wrapper (E4/E8), representation/appeal (E13), Sealed Cover (E4 fields/E18), multi-RO part-period + No-Report (E19), snapshot-on-lock bridge (E20), ratified-calibration control (E21/E15), digital-signature/non-repudiation (E23 — on X.3+P05+G13), and the disclosure/custody domain ledger (E18 — on P05+OPEN-PLAT-03). Everything authored here consumes **P01 (workflow), P02 (authz/PII ceiling), P05 (audit), X.1–X.3 (jobs/notify/integration), W.1–W.3 (flows/forms/notify-config), P06 (migration)** and the **M09 Performance** business model — it never re-implements them.

---

## Amendments (v2 → v3: platform re-grounding)

| # | v2 (invented / standalone) | v3 (platform-grounded) | Driver |
|---|---|---|---|
| 1 | Module code `M08-PAM`; standalone HRMS | **`G08`** (EXTEND of PrimeSoft **M09** Performance); reuses M09 goal/review/calibration/probation/PIP/MSF | `MODULE_RECONCILIATION.md` §A/§B |
| 2 | Goal/review/calibration entities authored from scratch | **Reconciled to existing M09 entities** (`goal_plans`/`goals`/`review_cycles`/`calibration_sessions`/PIP/MSF); E5/E6/E7/E8/E10/E11/E12/E14/E16/E17 marked **[EXTEND]**; only the APAR layer is **[NEW]** | Don't fork the platform model |
| 3 | Bespoke `weightage` validation rules | Cite **`VAL-WEIGHTAGE/WSUM/SUBWSUM/ACHV/GOALNAME/DISTRIB`** from the Foundation catalogue; author only `VAL-G08-*` (`ADVEVID`/`SUPV`/`PERIODTILE`/`CHAIN`/`REPWINDOW`) | Foundation §2 / §7 |
| 4 | Invented `workflow_instances`/`workflow_tasks` engine | **P01 WorkflowEngine** (`workflow_actions`; `SEQUENTIAL`/`DYNAMIC_APPROVER`; in-flight version pinning) for all tier/rep/calibration/sealed/errata/escalation flows | `MODULE_RECONCILIATION.md` §C; Platform §P01 |
| 5 | Bespoke "tier-aware field projection" | **P02 PII Protection Ceiling + field-mask-on-serialization**; tier visibility is a P02 mask, not a parallel projection | Platform §P02 |
| 6 | Invented per-form **hash-chain** (`prev_hash`/`row_hash`) + external anchor | **P05 dual-log DB-trigger** audit substrate + **OPEN-PLAT-03** hash-chaining-to-WORM; `/verify` queries that chain; **confirm OPEN-PLAT-03 before build** | Prompt directive; Platform §P05/§Z |
| 7 | Local `audit_log`; "Shared Foundation" entities | **P05** dual log (`audit_log` + `security_audit_log`), DB-trigger; no module-defined audit table | `MODULE_RECONCILIATION.md` §C |
| 8 | `service_register_events` as a shared platform entity | **G12 SR ledger** (NET-NEW gov, on the **P05** substrate); G08 appends by reference | `MODULE_RECONCILIATION.md` §C/§D |
| 9 | M06/M07/M09/M12/M13 module references | **G06/G07/G09/G12/G13** (G-code scheme); promotion eligibility feed **by reference**; SR post to **G12** | `MODULE_RECONCILIATION.md` §B |
| 10 | Error codes `VALIDATION_ERROR(400)`/`AUTH_REQUIRED(401)`/`INTERNAL_ERROR(500)`/`UPSTREAM_UNAVAILABLE(503)`; `requestId` in body | **Platform 8-code table** (`VALIDATION_FAILED 422`/`UNAUTHENTICATED 401`/`INTERNAL 500`/`PRECONDITION_FAILED 412`…); `{error:{code,message,field,details}}`; **`X-Correlation-Id` header**; `ERR-G08-*` mapped to standard codes | Foundation §1; §C |
| 11 | Pagination "page/limit or cursor" | **Cursor only** (`limit` 25/100 + `cursor` → `next_cursor`); no offset paging | Foundation §1 |
| 12 | Multitenancy omitted | **`tenant_id`/`entity_id`** non-nullable on every entity; data-layer scoping; unscoped queries rejected | Platform §0.1 |
| 13 | DSC as a standalone "signature service" | **`GAP`** on **X.3** eSign provider + **P04** credentials + **P05** audit + **G13** artefacts; MFA step-up (P02) distinct from the binding signature | Platform §X.3/§P04 |
| 14 | Notifications to "shared `notifications`" | **X.2 / W.3**; `MSG-M09-*` reused + `MSG-G08-*` authored; statutory notices mandatory/non-suppressible | Platform §X.2; Foundation §5 |
| 15 | Jobs implied/bespoke | Reuse **`JOB-M09-PLAN-OPEN/REVIEW-OPEN/CALIB/CLOSE/NOTIFY/AUTOACK/PROBATION/SLA`**; author `JOB-G08-SR-POST/SEAL-MONITOR/REP-SLA/ANCHOR` on X.1 | Foundation §4 |
| 16 | Roles as a parallel module RBAC list | **RBAC v1.7 ADDITIONS** — existing Employee/Manager/Performance Admin/HR Admin + new `g08_*` roles + capability flags; SoD by **P01/P02**; Auditor→Org-Admin read; SysAdmin→Org/Platform Admin | `PLATFORM_FOUNDATION.md` §6 |
| 17 | NFR `99.9%` uptime, `RPO ≤ 15 min` | **Platform baseline** `99.5%/month`, `RPO < 1 h`, `RTO < 4 h`; p95 read < 500 ms, write < 1500 ms | Vision §2.9; §C |
| 18 | Feature flags as module config | **RBAC §4.3 capability flags** (`g08.calibration/continuous-feedback/msf-360/bell-curve`), Org-Admin-granted, audited to P05 | RBAC §4.3 |
| 19 | Migration undefined | **P06** ETL+V, 3 dry runs, waves, `migration_runs`, **`gov_source_id`** traceability | Platform §P06 |
| 20 | Architecture fixed (React/Tailwind, Node/Java) | Physical stack an engineering choice within the platform logical architecture; BRD specifies behaviour/NFR; CGG/gov-cloud is a deployment-model choice | `MODULE_RECONCILIATION.md` §C |
| 21 | Probation as bespoke cycle | **M09 probation confirmation** + **`JOB-M09-PROBATION`**, feeding **G01** employment status + **G12** SR | Master BRD §5.8 |
| 22 | Title / versioning | Re-titled **v3.0 · platform-grounded**; added this table + the **Alignment with PrimeSoft Platform** FR→service map; Final Reconciliation Table extended with platform rows (0 gaps) | Prompt directive |

---

## Amendments (v3 → v3.1: cross-module remediation)

Surgical alignment to the frozen G12 SR ingestion contract (REMEDIATION D1; R1 findings F-01/F-03/F-08/F-10/F-11). No new G08 capability; the appraisal-outcome write path is restated to consume the canonical contract.

| # | v3 (as written) | v3.1 (remediated) | Driver |
|---|---|---|---|
| 1 | `…/post-to-sr` named the SR write but left the actual G12 endpoint implicit; LLD said "INSERT `service_register_events`" | `…/post-to-sr` documented as an **internal façade that relays to the canonical write-port `POST /api/v1/sr/ingest`**; G08 no longer implies a direct ledger INSERT or a `/api/v1/sr/events` URL (G12 owns the row on P05) | F-01; D1 write-port |
| 2 | SR dedup was "one event per `(form_id)`" | Populates the **G12 canonical tuple `(source_module, source_reference_id, source_event_version)`** with `source_module="G08"`, `source_reference_id=form_id`; `Idempotency-Key` header may be a writer-local hash but the persisted tuple is the contract | F-03; D1 dedup tuple |
| 3 | Event payload `{type:"APAR_FINAL_GRADE", …}` with no category | Cites the exact G12-published code **`APAR_FINAL_GRADE`** verbatim with **`event_category=APPRAISAL`** (the category G12 added for G08) | F-08; D1 taxonomy |
| 4 | No `source_module` field on the SR payload (relied on auth context) | Explicit **`source_module="G08"`** stamped on the ingest payload (value in `G01..G14`), so G12's `allowed_source_modules` check is deterministic | F-10; D1 provenance |
| 5 | `tenant_id`/`entity_id` carried on G08 tables but omitted from the SR payload | Explicit **`tenant_id`+`entity_id`** required on the ingest payload (G12 hashes `tenant_id`+`employee_id` into `entry_hash`) | F-11; D1 scoping |
| 6 | `fact_key` ambiguous for appraisal | **No `fact_key`** sent — `APPRAISAL` final grade is not qualifying-service-bearing, so G12 FR-01's `fact_correlation_rule` does not apply (fact_key mandatory only for G04/G05/G06/G10/G11) | D1 fact_key rule |
| 7 | G06 eligibility feed | Unchanged — confirmed: G08 feeds **G06 promotion eligibility by reference** (`final_grade`/`below_benchmark`/`cycle_id`, sealed-suppressed); promotion decisioning stays in G06 (no G06 logic duplicated here) | D2; FR-G08-14 BR3 |

---

*End of G08 Performance Appraisal Management BRD v3.0 (platform-grounded; amended v3.1 cross-module remediation).*
