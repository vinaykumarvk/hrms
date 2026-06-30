# Promotion, Posting & Progression Monitoring — Government HRMS Module BRD (G06, v3.0 · platform-grounded)

**Module code:** G06 (alias GOV-M06; supersedes the `M06-PPP` code from `SHARED_FOUNDATION.md`; see `MODULE_RECONCILIATION.md` §B)
**Program:** Government HRMS — a public-sector configuration and extension of the **PrimeSoft HRMS** platform (Vision §1.1; not a greenfield build)
**Document version:** v3.0 (platform re-grounded; preserves all v2.0 content and rigor, re-anchored onto PrimeSoft platform services)
**Status:** Approved for build (parallel-agent ready) — incorporates all v2 Adversarial-Council improvements **and** the platform-grounding contract
**Grounding authority:** `PLATFORM_FOUNDATION.md` (Master BRD v2.1 · Product Vision v2.6 · Platform Spec v1.6 · RBAC Design v1.7 · Foundation FS v1.6) and `MODULE_RECONCILIATION.md` (G06 row §A; convention overrides §C; net-new register §D). Where this BRD and a platform artefact conflict on intent, **the platform artefact governs**.
**Relationship (reconciliation §A):** **NET-NEW (gov-specific)** — seniority lists, promotion cases, DPC, reservation roster, ACP/MACP, posting/progression are public-sector and have no PrimeSoft counterpart. PrimeSoft **G08** (ex-M09 Performance) covers appraisal/APAR **only**, not seniority/promotion-case. G06 authors the seniority/promotion-case statutory engine and **runs it on platform services**: approval/DPC flows on **P01**, audit on **P05**, migration on **P06**, jobs on **X.1**, notifications on **X.2/W.3**, RBAC enforcement on **P02**; it **consumes** G08 appraisal and G09 vigilance status by reference and **writes SR events to the G12 SR ledger on the P05 substrate**.

> **Reading rule.** This v3 preserves every v2 capability, entity, field, rule, state and worked example, and re-grounds the technical substrate. Platform claims trace to a source as `(Platform §P01)`, `(Foundation §1)`, `(RBAC §6.6)`. Net-new statutory logic G06 authors itself is marked **`GAP (gov-specific)`** but still runs on the named platform engine.

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Promotion, Posting & Progression Monitoring module (G06) is the statutory and managerial engine that governs how a public-sector employee **moves upward** through the organisation: how seniority is established (including **multi-stream inter-se seniority** across direct recruits, promotees and LDCE qualifiers), how promotions are adjudicated by Departmental Promotion Committees (DPCs) and promotion panels, how the resulting orders and probation are managed, how financial up-gradation schemes (ACP/MACP) are sanctioned even in the absence of a functional promotion, how the employee is **posted** into the new role, and how the organisation **monitors** every employee's progression — due-for-promotion alerts, stagnation, increment timeliness, and career-path modelling.

Promotion in a government context is a **quasi-judicial, rule-bound, reservation-aware, audit-heavy, and frequently litigated** process. A wrongly computed seniority position, an overlooked vigilance case, a mis-applied reservation roster point, an **own-merit reserved candidate wrongly counted against a reserved point**, reliance on an **uncommunicated adverse APAR**, or an **un-recorded court stay** can each trigger litigation, tribunal proceedings, and the unwinding of an entire promotion batch. G06 therefore treats **a single versioned service-fact ledger, eligibility computation, panel adjudication, roster compliance with own-merit migration, court/tribunal linkage, correction-lineage cascades, and immutable service-register posting** as first-class, fully-audited capabilities. The audit immutability is delivered by the **P05 DB-trigger substrate** (not application code), and the service-register posting is an append to the **G12 SR ledger** that itself runs on P05.

### 1.2 Business context & statutory drivers

- **Seniority** is the spine of public-sector careers. It determines eligibility zones, panel inclusion, and order-of-promotion. The same feeder grade is commonly fed by **multiple recruitment streams** (direct recruitment, promotion, LDCE/departmental examination, deputation-absorption); their **combined inter-se seniority** under rota/quota rotation of vacancies (the `N.R. Parmar` line of disputes) must be constructible and defensible. Tentative seniority lists are published, objections invited, disposed, and a final list notified — all with statutory cut-off dates.
- **Departmental Promotion Committee (DPC)** is the constitutional body that evaluates the eligible field and prepares Select Lists. A select panel has a **validity period** (typically one panel year); promotions from an expired panel are illegal. The DPC convening, member quorum, and select-list approval are modelled as a **P01 workflow** (committee-as-workflow; Platform §P01, §W.1), with member approvals captured as `PARALLEL_ALL_OF` branches and the appointing-authority sign-off as a `DYNAMIC_APPROVER` stage.
- **APAR usability** is statutory: per `Dev Dutt v. Union of India`, a below-benchmark/adverse APAR entry that was **not communicated** to the employee (with the representation disposed) **cannot be relied upon** by a DPC. A DPC that supersedes on an uncommunicated entry is voidable. APAR ratings and their communication/representation status are **consumed by reference from G08** (ex-M09 Performance/APAR), never forked.
- **Reservation-in-promotion** (SC/ST/OBC/EWS/PwBD) is constitutionally gated: it requires the State to hold **quantifiable data of inadequacy of representation and effect on administrative efficiency** (`M. Nagaraj` / `Jarnail Singh`), correct **own-merit migration** (a reserved candidate selected on merit against an unreserved point must be adjusted against UR, not consume a reserved point), **consequential seniority vs catch-up** treatment, creamy-layer (OBC)/EWS **certificate currency as of the crucial date**, carry-forward, de-reservation limits, the 50% ceiling, and PwBD horizontal reservation.
- **Vigilance/disciplinary clearance** is a precondition; the **sealed cover** procedure must be supported where a charge is pending, with a mandatory periodic-review SLA and a partially-upheld minor-penalty branch. Vigilance/disciplinary status and case-conclusion events are **consumed by reference from G09** (Disciplinary Cases & Punishment).
- **Financial up-gradation** schemes (Time-Bound Promotion / Assured Career Progression / Modified Assured Career Progression — ACP/MACP) guarantee pay progression on completion of qualifying service (e.g., 10/20/30 years), capped at **three financial up-gradations in a career**, with intervening regular promotions reducing the remaining entitlement and **refusal of promotion** stopping/forfeiting the MACP clock per policy.
- **Litigation awareness:** promotion orders are routinely issued "subject to the outcome of OA/SLP No. …", stayed by interim orders, and reopened on contempt. Any case/order/seniority list may be **sub judice**; the system must represent litigation references, interim stays, and **correction-lineage cascades** (a court-ordered retrospective promotion re-ranks an entire list and may require **stepping-up/pay-anomaly** flagging to G10).
- Every promotion, posting, officiating arrangement, probation declaration, and financial up-gradation is a **statutory service event** that must post to the Digital Service Register (**G12**) as an append-only entry on the P05 substrate.

### 1.3 Scope summary

In scope: **sanctioned-post/establishment-strength register and vacancy computation**; a single versioned **qualifying-service ledger with pinned exclusion rules**; multi-stream seniority management; eligibility computation (with APAR-usability and certificate-currency gates); DPC/panel workflow with **panel currency** on P01; select-list and promotion-order generation; **refusal-of-promotion consequence management**; probation lifecycle; ad-hoc/officiating/in-situ promotion; **LDCE/departmental-examination channel**; ACP/MACP financial up-gradation; reservation roster with **own-merit migration and consequential-seniority handling**; **legal-case linkage and sub-judice handling**; **correction-lineage and retrospective recompute cascades**; post-promotion posting; and progression monitoring (due-for-promotion, stagnation, increment monitoring as a *monitoring view* with G10 as system-of-record, and an explicitly-advisory career-path & succession layer).

Out of scope (owned elsewhere): APAR capture & ratings (**G08**, referenced), disciplinary/vigilance case management (**G09**, referenced), lateral transfer/relieving/joining mechanics (**G05**, reused for posting movement), payroll **fixation arithmetic and increment execution** (**G10** — G06 sanctions/monitors and hands off the pay event; G10 is system-of-record for increments and stepping-up arithmetic), the SR ledger itself (**G12**, G06 writes events), competency master (**G07**), enterprise analytics (**G14**). Platform engines — workflow (P01), RBAC enforcement (P02), audit (P05), migration (P06), jobs (X.1), notifications (X.2), integrations (X.3), configured content (W.1–W.3) — are **consumed, never re-authored** (Foundation §9; Reconciliation §C).

### 1.4 Primary outcomes & KPIs

| Outcome | KPI | Target |
|---|---|---|
| Accurate seniority | Seniority objections upheld vs. raised | < 3% |
| Timely promotions | Vacancies filled within statutory DPC cycle | ≥ 95% within cycle |
| Roster compliance | Roster points filled per reservation policy incl. own-merit migration | 100% audited, 0 unresolved deviations |
| APAR-usability integrity | DPC decisions relying on uncommunicated adverse APAR | 0 |
| Zero stagnation surprises | Eligible employees not flagged before due date | 0 |
| Financial up-gradation timeliness | MACP sanctioned within 30 days of due date | ≥ 98% |
| Litigation representability | Sub-judice orders/lists not flagged as such | 0 |
| Correction propagation | Court-ordered re-ranks not cascaded within SLA | 0 |
| Audit integrity | Promotion events posted to G12 Digital SR | 100%, reconciled (P05 100% mutation capture) |
| Litigation reduction | Promotion orders set aside on procedural grounds | Year-on-year decline |

### 1.5 Module personas (summary)

HR Officer (case preparation), Establishment/Seniority Section, Reservation/Roster Officer, Vigilance Clearance Officer, DPC Member & DPC Secretary, Reviewing/Appointing Authority, Department Head, **Establishment-Strength Officer** (sanctioned posts), **Legal/Litigation Officer** (court-case linkage), Employee (self-service progression view & representations), SR Custodian (G12), Auditor (read-only), System Administrator. All are mapped to **RBAC v1.7** roles or expressed as **ADDITIONS** (new gov roles + capability flags); see Section 3 and §6.6 of the platform foundation. Full matrix in Section 3.

### 1.6 Reckoning-Dates reference (authoritative — see also §5.8)

Five distinct dates govern this module and must never be conflated. The crisp definitions and their worked relationship are pinned once in **§5.8 (Reckoning Dates reference box)** and the Glossary (§16.1).

### 1.7 Amendments (v1 → v2)

Every adopted improvement and every High/Critical Risk-Register mitigation from the original council report is incorporated as a concrete requirement, entity, field, rule, state or control. (The platform re-grounding amendments v2 → v3 are catalogued separately in the **`## Amendments (v2 → v3: platform re-grounding)`** section near the end of this document.)

| # | Adopted improvement / risk mitigated | Where & how incorporated |
|---|---|---|
| 1 | `sanctioned_posts`/establishment entity; replace free-integer `vacancy_count`; FR-012 validates against it (Critical) | New entity §5.2.25 `sanctioned_posts`; new **FR-PPP-015**; `promotion_cases.vacancy_count` now derived/validated; FR-004 & FR-012 reference it; integrity rule §5.6-15 |
| 2 | APAR-usability gate (Dev Dutt) (Critical) | New fields `apar_communicated`, `apar_representation_status` on `eligibility_assessments` (§5.2.5); rule in **FR-003** (AC, BR, edge); rule-trace exposes it; integrity rule §5.6-16; APAR read consumed from **G08** |
| 3 | Own-merit reserved-candidate migration (Critical) | New field `adjusted_against_category` on `roster_points` (§5.2.17); **FR-006** rules + compliance report; integrity rule §5.6-6 restated |
| 4 | Multi-stream / inter-se seniority + rota-quota | New fields on `seniority_entries` (§5.2.2); new entity §5.2.28 `seniority_quota_rules`; new **FR-PPP-020**; FR-001 amended; worked example Appendix D.4 |
| 5 | `legal_case_links` entity; `subject_to_litigation`; INTERIM_STAYED (High) | New entity §5.2.29 `legal_case_links`; new **FR-PPP-017**; flags/states on cases/orders/lists; state tables §11 |
| 6 | Correction-lineage / recompute cascade (High) | New entity §5.2.30 `correction_events`; new **FR-PPP-018**; supersession extended; cascade job `JOB-G06-CORRECTION-CASCADE` on X.1 |
| 7 | Stepping-up / pay-anomaly flow to G10 (High) | FR-PPP-018 raises `PAY_ANOMALY_STEPPING_UP` signal to G10; integration §9.5; `correction_events.pay_anomaly_flag` |
| 8 | Consolidate into one versioned `QualifyingServiceLedger` (5th shared contract) | New entity §5.2.26 `qualifying_service_ledger`; new **FR-PPP-016**; FR-003/011/013/014 cite it; locked in §15.4 |
| 9 | Qualifying-service exclusion rules pinned | New entity §5.2.27 `service_exclusion_rules`; FR-PPP-016 rules; worked example Appendix D.3 |
| 10 | Pin four rule kernels to worked numeric examples + test vectors | New **Appendix D** (§16.5) — zone, roster, qualifying-service, multi-stream worked vectors |
| 11 | DPC select-panel currency; supplementary/review DPC | New fields `panel_valid_from`/`panel_valid_until` on `promotion_panels` (§5.2.7); FR-005 rules; integrity rule §5.6-17 |
| 12 | Refusal-of-promotion consequences (debarment + MACP clock) (High) | New entity §5.2.32 `promotion_refusals`; new **FR-PPP-019**; wired FR-007→FR-011; integrity rule §5.6-18 |
| 13 | Correct MACP-cap integrity rule | §5.6 rule 10 restated; FR-011 BR corrected |
| 14 | LDCE / departmental-exam channel + structured exam-result gate | New entity §5.2.31 `exam_results`; `eligibility_rules.channel` += LDCE; `promotion_mode` += LDCE; FR-003/016 gates; `requires_qualification` VARCHAR replaced by `qualification_exam_ref` |
| 15 | Reservation enabling justification (Nagaraj/Jarnail); consequential seniority vs catch-up; single-post exemption (High) | New fields on `reservation_rosters` (§5.2.16: `enabling_provision_ref`, `quantifiable_data_doc_id`, `consequential_seniority_mode`, `roster_applicable`); FR-006 rules |
| 16 | DPDP/privacy on eligibility snapshot; creamy-layer/EWS currency (High) | §10 DPIA note + field-level access via **P02 field mask**; `eligibility_assessments` fields `obc_creamy_layer_status`, `ews_cert_valid_on_crucial_date`; retention rule for `apar_detail_json`; FR-003 |
| 17 | "Reckoning Dates" reference box | New §5.8 + §1.6 + Glossary |
| 18 | Increment-monitoring ownership vs G10 | FR-013 amended: `increment_monitor` is a **monitoring/alerting view**; G10 system-of-record; integration §9.5; integrity rule §5.6-19 |
| 19 | G09 sealed-cover dependency = event (with poll degradation) + max-age SLA | §16.3 confirmed; FR-008 periodic-review SLA rule + `sealed_cover_review_due`; G09 case-conclusion event consumed via X.3/event subscription |
| 20 | Missing terminal/edge states | `promotion_postings.status` += `NOT_JOINED`; sealed-cover `PARTIALLY_UPHELD_MINOR_PENALTY` branch; officiating `TERMINATED` (superseded-by-regular) guard; state tables §11 |
| 21 | Talent layer (FR-014) marked advisory/optional, boundary vs G07/G14 | FR-014 re-scoped advisory; §2.3 boundary note |

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Sub-module | Code | Description | Key entities |
|---|---|---|---|
| Establishment & Vacancy | PPP-EST | Sanctioned strength, filled/vacant, quota split, vacancy computation | `sanctioned_posts` |
| Qualifying-Service Ledger | PPP-QSL | Single versioned service-fact ledger + exclusion engine | `qualifying_service_ledger`, `service_exclusion_rules` |
| Seniority Management | PPP-SEN | Cadre-wise seniority lists, multi-stream rota-quota, eligibility zone, tentative/final, objections | `seniority_lists`, `seniority_entries`, `seniority_objections`, `seniority_quota_rules` |
| Eligibility Computation | PPP-ELG | Rule-driven eligibility (qualifying service, APAR-usability, vigilance, roster, exam, certificate currency) | `eligibility_rules`, `eligibility_assessments`, `exam_results` |
| Promotion Case & DPC | PPP-DPC | Promotion case, DPC/panel constitution with currency, proceedings, select list — **DPC convening/approval as a P01 flow** | `promotion_cases`, `promotion_panels`, `promotion_panel_members`, `promotion_candidates`, `dpc_proceedings` |
| Promotion Orders & Probation | PPP-ORD | Order generation, acceptance, refusal consequence, probation | `promotion_orders`, `probation_records`, `promotion_refusals` |
| Ad-hoc / Officiating / In-situ | PPP-OFF | Temporary upward arrangements pending regular promotion | `officiating_arrangements` |
| Financial Up-gradation (ACP/MACP) | PPP-FIN | Time-bound/assured career progression sanctions | `financial_upgradations`, `macp_assessments` |
| Posting after Promotion | PPP-POST | Place promoted employee into a post/station | `promotion_postings` (reuses G05 movement) |
| Reservation Roster | PPP-ROS | Roster registers, point allocation, own-merit migration, carry-forward, de-reservation, enabling justification | `reservation_rosters`, `roster_points` |
| Legal & Sub-judice | PPP-LEG | Court/tribunal linkage, interim stays, subject-to-outcome | `legal_case_links` |
| Correction & Recompute | PPP-COR | Correction-lineage, retrospective re-rank cascade, pay-anomaly flag | `correction_events` |
| Progression Monitoring | PPP-MON | Due-for-promotion, stagnation, increment monitoring (view) | `progression_alerts`, `increment_monitor` |
| Career-Path & Succession (advisory) | PPP-CAR | Career-path models, succession plans, eligibility dashboards | `career_paths`, `career_path_stages`, `succession_plans`, `succession_candidates` |

> **FR numbering note.** The 20 functional requirements retain their stable `FR-PPP-NNN` identifiers (used pervasively in the traceability matrix §15 and the cross-FR dependency graph) to preserve v2 traceability intact. The owning **module is G06**; module-unique platform ids (`VAL-G06-*`, `JOB-G06-*`, `MSG-G06-*`, `ERR-G06-*`) adopt the gov G-code scheme per Reconciliation §B.

### 2.2 Common Capabilities (consumed from the PrimeSoft platform)

These are **platform services consumed by id**, not module-local re-implementations (Foundation §9; Reconciliation §C/§D):

- **Maker-checker** on every statutory artefact (seniority list publication, select list approval, order issue, MACP sanction, de-reservation, correction-event approval) is a **configured P01 flow** (`workflows`/`workflow_instances`/`workflow_actions`; Platform §P01, §W.1). **SoD (maker ≠ checker, no self-approval) is enforced by P01/P02**, not re-coded.
- **Immutable audit** via **P05** — every INSERT/UPDATE/soft-DELETE on a G06 table fires a **DB trigger** writing one immutable row to `audit_log` (data mutations) / `security_audit_log` (auth/permission/admin events). 100% mutation capture, zero gaps; no application-bypass possible (Platform §P05).
- **Append-only SR posting** to the **G12 SR ledger** (`service_register_events`, the net-new gov ledger running on the P05 substrate; Reconciliation §C/§D) on every promotion/posting/officiating/confirmation/financial/correction event. The **only** ledger write-path is the canonical **`POST /api/v1/sr/ingest`** (`POST /api/v1/sr/ingest/reversal` for corrections); any module-local `…/post-to-sr` endpoint is an internal façade that **relays to `POST /api/v1/sr/ingest`** (no direct table INSERT, never `/api/v1/sr/events`). Dedup is the G12 tuple **`(source_module="G06", source_reference_id, source_event_version)`**; every qualifying-service-bearing event also carries a **`fact_key`** (mandatory; per the event type's `fact_correlation_rule`, G12 FR-01) and explicit **`tenant_id`+`entity_id`**. The exact G12-published `event_type` codes G06 may emit are pinned in **§9.7.1**.
- **Document management** via **G13** (ex-M11 Documents) for DPC minutes, orders, objection letters, roster registers, Nagaraj quantifiable-data records, court orders, exam results — versioned, access-controlled, encrypted (`VAL-G13`/`VAL-M11-RETENTION` retention classes).
- **Notifications** via **X.2 + W.3** (channels `IN_APP` + `EMAIL` in parallel; statutory notices mandatory/non-suppressible per BRD §9.9). Templates referenced by `MSG-G06-*` id; never inlined.
- **RBAC + five-dimension row-level scoping + field masking** via **P02** (a DPC member sees only candidates within authorised cadre/org scope; the APAR/disciplinary/category PII concentration in `eligibility_assessments` is masked on serialization per the PII Protection Ceiling). Enforcement is model-driven; the model is owned by RBAC v1.7.
- **Cursor pagination** (`?limit=` default 25, max 100, `next_cursor`) on all list endpoints; **i18n** (DD-MMM-YYYY, INR) per the Foundation UI-state standard (Foundation §1, §3).
- **`tenant_id` / `entity_id`** on every G06 entity, with **data-layer scoping** (an unscoped query is rejected, not defaulted to "all"; Platform §0.1).

### 2.3 In-scope / Out-of-scope boundary table

| Capability | In G06 | Owned/relied elsewhere |
|---|---|---|
| Sanctioned strength & vacancy computation | ✅ | Post sanction orders may originate from establishment authority (master data, G01/org master) |
| Qualifying-service ledger & exclusions | ✅ | Source leave/EOL/suspension facts from G03/G09; service dates from G01 |
| Multi-stream seniority computation & lists | ✅ | Source person/job/grade data from G01 + org/grade masters (`VAL-GRADE-BAND`) |
| Eligibility rule engine (APAR-usability, certificate currency) | ✅ | APAR ratings + communication status from **G08**; disciplinary/vigilance from **G09** |
| DPC / panel proceedings, panel currency | ✅ (logic) | DPC convening/approval **runs on P01** (committee-as-workflow); SoD by P01/P02 |
| Promotion orders, refusal consequence & probation | ✅ | Document storage **G13**; order issue is a P01 maker-checker flow |
| Officiating/ad-hoc/in-situ | ✅ | — |
| ACP/MACP sanction | ✅ (sanction) | Pay fixation arithmetic & disbursement **G10** |
| Posting movement execution | ✅ (initiate) | Relieving/joining mechanics reuse **G05** |
| Legal-case linkage & sub-judice flags | ✅ | Court case management itself is external; G06 stores references only |
| Correction-lineage & re-rank cascade | ✅ | Pay stepping-up arithmetic executed by **G10** (G06 detects & flags) |
| Increment monitoring | ✅ (monitoring/alerting view only) | **G10 is system-of-record & executor** for increments and stepping-up |
| Service event ledger | Writes events | Ledger owned by **G12** (on P05 substrate) |
| Workflow / RBAC / audit / jobs / notifications / migration engines | Consumed by id | **P01 / P02 / P05 / X.1 / X.2 / P06** — never re-authored |
| Career-path/succession/9-box (advisory) | ✅ (advisory, optional) | Competency master **G07**; enterprise analytics **G14** — G06 must not duplicate |

**Talent-layer boundary note (improvement #21):** FR-PPP-014 (career-path, succession, 9-box) is explicitly **advisory and optional**. It consumes competencies from **G07** and feeds analytics to **G14**; it must **not** auto-promote, must not be a source of truth for competencies, and must be built lighter than the litigation-bearing kernels (FR-016 qualifying service, FR-006 roster, FR-004 zone, FR-020 multi-stream seniority).

### 2.4 Assumptions & dependencies

- **G01** provides authoritative `employees` (+ public-sector `service_no`, `cadre`, `pay_scale_id`, posting history per Reconciliation §D), with `designations`, `cadres`, `pay_scales` and `org_units` from the **employee + org/grade masters** (`VAL-GRADE-BAND`, `VAL-MASTER-UNIQUE`, `VAL-ORG-NOCYCLE`). G06 **references, never forks** these.
- Establishment/sanction authority provides post-sanction master data feeding `sanctioned_posts`.
- **G08** exposes a stable APAR read API returning per-year grading + benchmark band **and `communicated`/`representation_status`** (improvement #2); G06 consumes it by reference (does not fork APAR).
- **G09** exposes a disciplinary/vigilance status read API **and emits case-conclusion events** (sealed cover); degrades to scheduled reconciliation (a `JOB-G06-SEALED-RECONCILE` on X.1) if only status read is available (improvement #19).
- **G10** consumes the MACP/promotion pay event, **is system-of-record for increments**, and executes **stepping-up** on a pay-anomaly signal (improvements #7, #18).
- **G12** accepts SR event writes idempotently via the canonical **`POST /api/v1/sr/ingest`**, deduped on the tuple `(source_module="G06", source_reference_id, source_event_version)` with mandatory `fact_key` + explicit `tenant_id`/`entity_id`, on the P05 substrate (§9.7.1).
- **G05** provides the relieving/joining workflow (configured P01 flow) that PPP-POST hands a promotion-posting movement to.
- Reservation policy parameters (percentages, roster cycle length, enabling-provision references) are configurable master data following the **platform config cascade** (platform → tenant → entity → employee; Platform §0.3), not hard-coded.

---

## Section 3 — Roles & Permissions

### 3.1 Module roles — mapped to RBAC v1.7 (ADDITIONS, not a parallel scheme)

The access-control **model is owned by RBAC Design v1.7**; G06 statutory actors are expressed as **existing roles**, **new gov roles**, or **capability flags ADDED to the taxonomy** and registered in RBAC §4.3/§2.2 (Reconciliation §C; PLATFORM_FOUNDATION §6.6). SoD is enforced by P01/P02.

| G06 actor | RBAC v1.7 expression | SoD / scope note |
|---|---|---|
| Employee (Self-Service) | existing **Employee** role (RBAC §2.4) | own-record scope; cannot view others' comparative data |
| Establishment/Seniority Officer | **new entity-scoped role** `g06_establishment_officer` | Maker for seniority; cannot self-approve publication |
| Establishment-Strength Officer | **new role / capability flag** `g06_strength_officer` | Independent of case maker; vacancy figures audited (P05) |
| HR Officer (Promotion Desk) | **HR Administrator** (RBAC §2.2) + `g06_promotion_desk` flag | Maker; cannot be a panel member on own case (P02 SoD) |
| Reservation/Roster Officer | **new role** `g06_roster_officer` | Independent control on DPC select list |
| Vigilance Clearance Officer | **new role / capability flag** `g06_vigilance_clearance` | Reads from G09; attests clearance (case-scoped entitlement) |
| DPC Secretary | **new role** `g06_dpc_secretary` | Convenes DPC (P01 initiator); cannot vote/grade |
| **DPC Member / Panel Member** | **new role** `g06_dpc_member` (added role + capability flag) | P01 `PARALLEL_ALL_OF` approver; cannot be in own promotion field |
| **Appointing Authority** | **new role** `g06_appointing_authority` (mirrors Disciplinary/Appointing Authority pattern, §6.6) | P01 checker/`DYNAMIC_APPROVER`; maker ≠ checker enforced by P02 |
| **Reviewing Authority** | **new role** `g06_reviewing_authority` (added role + capability flag) | Review-DPC / supersession review approver on P01 |
| Department Head | **HOD** (RBAC §2.3) + per-workflow approval capability toggle | Sanctions officiating/posting decisions (P01 approver) |
| Legal/Litigation Officer | **new role** `g06_legal_officer` | Writes only to legal entities; cannot adjudicate promotion |
| SR Custodian (G12) | **new role + capability flag on the G12 SR ledger** (§6.6) | Read-only into G06; reconciliation on P05 query contract |
| Auditor | **map to** Org-Admin audit read + read-only entitlement (RBAC §3.2; P05 `Audit.query`) | No write; never a parallel "Auditor" role with write |
| System Administrator | **map to** Org Admin / Platform Super Admin (RBAC §2.1) | Config, master data, RBAC; no transactional self-approval |

**MFA:** the high-privilege statutory roles (Appointing Authority, Reviewing Authority, DPC Member, Legal Officer) require **MFA equivalently to HR Admin/Org Admin** (Platform §3.1; Vision §2.2).

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=none) — enforced by P02 `Authorization.check`

> Every endpoint calls **`Authorization.check({subject(roles,scope), action, resource_ref, fields[]})`**; it never re-implements permission logic (Platform §P02). Field masks (APAR/disciplinary/category) are applied **on serialization**, so an over-broad query cannot leak a masked field.

| Capability | Employee | Est./Sen. Officer | Est.-Strength | HR Promotion | Roster Officer | Vigilance | DPC Secretary | DPC Member | Appointing Auth. | Dept Head | Legal Officer | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| View own progression | R | R | R | R | R | R | R | R | R | R | R | R | R |
| Sanctioned posts / vacancy | X | R | C/U | R | R | X | R | R | A | R | X | R | X |
| Seniority list build (multi-stream) | X | C/U | X | R | R | X | R | R | R | R | X | R | X |
| Publish seniority list | X | C(maker) | X | R | R | X | R | R | A | R | X | R | X |
| File objection | C(self) | R/U(dispose) | X | R | X | X | R | X | A | R | X | R | X |
| Qualifying-service ledger | R(self) | R | X | C/R | R | R | R | R | R | R | R | R | U(rules) |
| Eligibility computation | R(self) | R | X | C/R | R | R(contrib) | R | R | R | R | R | R | U(rules) |
| Constitute panel/DPC (+currency) | X | X | X | C | R | X | C/U | R | A | R | X | R | X |
| Record DPC proceedings | X | X | X | R | R | R | C/U | C(verdict) | R | R | X | R | X |
| Approve select list | X | X | R | R | A(roster) | A(vigilance) | R | R | A | R | X | R | X |
| Issue promotion order | X | X | R | C(maker) | R | R | R | X | A | R | X | R | X |
| Refusal consequence | X | X | X | C | X | X | X | X | A | R | X | R | X |
| Probation declaration | R(self) | X | X | C | X | R | X | X | A | R | X | R | X |
| Officiating arrangement | R(self) | X | X | C | X | R | X | X | A | A | X | R | X |
| ACP/MACP sanction | R(self) | X | X | C(maker) | R | R | R(screen) | R(screen) | A | R | X | R | X |
| Initiate posting | R(self) | X | R | C | X | X | X | X | A | A | X | R | X |
| Roster maintenance (+own-merit) | X | X | X | R | C/U | X | X | X | A | R | X | R | X |
| Legal case linkage / stay | R(self own case) | R | X | R | R | X | R | X | A | R | C/U | R | X |
| Correction event / recompute | X | C(maker) | X | C | R | X | R | X | A | R | C(court-trigger) | R | X |
| Progression alerts config | X | R | X | R | X | X | X | X | R | R | X | R | C/U |
| Career-path/succession (advisory) | R(self) | X | X | C/U | X | X | X | X | A | C/U | X | R | U(template) |

**Workspace model (Platform §6.5):** G06 surfaces route to exactly one workspace — **Me** (employee progression timeline), **My Team** (HOD/manager monitoring views), **Admin** (HR/Establishment/DPC/Legal consoles, exclusive). Switches are audit-logged.

---

## Section 4 — Shared Application Foundation (consumed from PrimeSoft platform)

This module **consumes** the PrimeSoft platform contracts by id (Foundation §9; Reconciliation §C/§E). It does **not** restate them as new requirements and does **not** re-author any engine:

- **Multi-tenancy:** every G06 table carries non-nullable **`tenant_id`** and, where entity-scoped, **`entity_id`**; scoping is enforced at the **data/persistence layer**; an unscoped query is **rejected** (Platform §0.1).
- **Auth:** Google SSO (OAuth 2.0) / username-password / **MFA (TOTP/SMS OTP)** for high-privilege roles; JWT bearer carrying resolved roles + tenant/entity scope; permissions resolved **per request by P02**, never carried raw in the session (Platform §0.2, §3.1).
- **API conventions (Foundation §1):** `/api/v1`; **`Idempotency-Key`** on unsafe transaction-creating POSTs (24h replay returns the original); **cursor pagination** (`?limit=` default 25 / max 100 + `cursor=` → `next_cursor`); `?sort=field:asc|desc`; **`X-Correlation-Id`** on every request, echoed and written to every audit/log line; effective-dated mutations accept `effective_from` and are **staged** by an effective-date job, not written live.
- **Canonical error envelope (Foundation §1; Reconciliation §C):** `{ "error": { "code": "...", "message": "...", "field": "...", "details": { } } }`; the correlation id is the **`X-Correlation-Id` response header**, not a body `requestId`. 2xx returns the resource payload.
- **Standard error codes (Foundation §1, 8-code table):** `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `CONFLICT(409)`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)` + G06 module codes (Section 9). The invented `VALIDATION_ERROR(400)`/`AUTH_REQUIRED(401)`/`INTERNAL_ERROR(500)`/`UPSTREAM_UNAVAILABLE(503)` are **overridden** (Reconciliation §C).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, **P05 dual-log audit** (100% mutation capture, immutable, ≥7-yr; tamper-evidence tracks **OPEN-PLAT-03** hash-chaining), DPDP Act 2023 alignment **with a module DPIA for the eligibility snapshot** (§10.2), statutory retention floors.
- **NFR baseline (Platform §8.2; Reconciliation §C):** standard API **p95 < 500ms @ 300 concurrent**; read-heavy p95 < 300ms cached / < 1000ms uncached; writes p95 < 1500ms; **uptime 99.5%/month**; **RTO < 4h, RPO < 1h**; WCAG 2.1 AA; soft delete only.
- **Platform engines consumed:** **P01** WorkflowEngine (`workflows`/`workflow_instances`/`workflow_actions`, 5 patterns, in-flight version pinning, SLA/escalation), **P02** Authorization.check, **P05** Audit (`audit_log`/`security_audit_log`), **P06** Migration ETL+V, **X.1** Jobs runner, **X.2** Notification infra, **X.3** Integration framework, **W.1/W.2/W.3** configured flows/forms/notification-config. G06 **configures** flows and forms; it never codes bespoke workflow/forms/audit.
- **Validation library (Foundation §2):** G06 cites platform `VAL-*` ids (`VAL-EFFECTIVE`, `VAL-DATE`, `VAL-DOB`, `VAL-ENUM`, `VAL-FILE`, `VAL-COMMENT`, `VAL-GRADE-BAND`, `VAL-MASTER-UNIQUE`, `VAL-ORG-NOCYCLE`, `VAL-CONSENT`) and authors only module-unique **`VAL-G06-*`** rules (Section 9.6), registered in the Foundation index.

---

## Section 5 — Holistic Data Model

> **Platform grounding of the data model.** Every entity below carries **`tenant_id`** (non-null) and, where entity-scoped, **`entity_id`** (Platform §0.1). "std audit fields" means the platform soft-delete/lineage columns; **audit rows are written by the P05 DB trigger**, not by application code, so G06 does **not** define an `audit_log`. `service_register_events` is the **G12 net-new gov ledger on the P05 substrate** (not a platform primitive). Workflow linkage uses **P01** `workflow_instances`/`workflow_actions` (not `workflow_tasks`). `employees`/`designations`/`cadres`/`pay_scales` are the **G01 + org/grade masters** (referenced, never redefined); `org_units`, `documents` (G13), `notifications` (X.2) are platform/sibling-owned and referenced.

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose | Platform note |
|---|---|---|---|---|---|
| 1 | `seniority_lists` | Module | G06 | A cadre/grade-scoped seniority list (tentative or final) | +`tenant_id`/`entity_id`; publication = P01 flow |
| 2 | `seniority_entries` | Module | G06 | One employee's position within a seniority list | references G01 `employees` |
| 3 | `seniority_objections` | Module | G06 | Objection/representation against a tentative entry | objection intake = W.2 form |
| 4 | `eligibility_rules` | Module | G06 | Configurable rule set per promotion channel | config-cascaded (Platform §0.3) |
| 5 | `eligibility_assessments` | Module | G06 | Computed eligibility result per employee per case | APAR/disc/category = **P02 field-masked PII** |
| 6 | `promotion_cases` | Module | G06 | A promotion exercise | `workflow_instance_id` → P01 |
| 7 | `promotion_panels` | Module | G06 | DPC/panel constituted for a case | committee-as-workflow (P01) |
| 8 | `promotion_panel_members` | Module | G06 | Membership of a panel | members = P01 `PARALLEL_ALL_OF` approvers |
| 9 | `promotion_candidates` | Module | G06 | A candidate considered in a case | own-merit linkage |
| 10 | `dpc_proceedings` | Module | G06 | DPC meeting record, benchmark, minutes, select list | minutes in G13 |
| 11 | `promotion_orders` | Module | G06 | Issued promotion order | issue = P01 maker-checker; SR to G12 |
| 12 | `probation_records` | Module | G06 | Probation period & declaration | reuses confirmation-workflow pattern (W.1) |
| 13 | `officiating_arrangements` | Module | G06 | Ad-hoc/officiating/in-situ arrangement | SR start/end to G12 |
| 14 | `financial_upgradations` | Module | G06 | ACP/MACP sanction record | pay event → G10 |
| 15 | `macp_assessments` | Module | G06 | Screening committee assessment | screening = P01 flow |
| 16 | `reservation_rosters` | Module | G06 | Roster register per cadre/grade | enabling justification doc in G13 |
| 17 | `roster_points` | Module | G06 | Individual roster point | own-merit migration |
| 18 | `promotion_postings` | Module | G06 | Posting of promoted employee | movement → G05; SR to G12 |
| 19 | `career_paths` | Module | G06 | Career-path model template (advisory) | — |
| 20 | `career_path_stages` | Module | G06 | Ordered stage within a career path (advisory) | competencies referenced from G07 |
| 21 | `succession_plans` | Module | G06 | Succession plan (advisory) | — |
| 22 | `succession_candidates` | Module | G06 | Identified successor (advisory) | — |
| 23 | `progression_alerts` | Module | G06 | Due-for-promotion/stagnation/increment alert | dispatched via X.2 |
| 24 | `increment_monitor` | Module | G06 | Increment monitoring **view** (G10 system-of-record) | mirror only |
| 25 | `sanctioned_posts` | Module | G06 | Establishment strength, filled/vacant, quota split, vacancy computation | **GAP (gov-specific)** (impr. #1) |
| 26 | `qualifying_service_ledger` | Module | G06 | Single versioned, snapshotted, citable service-fact ledger | **GAP (gov-specific)**; net-new statutory engine on P05/P06 (Reconciliation §D) |
| 27 | `service_exclusion_rules` | Module | G06 | Pinned qualifying-service exclusion logic | config-cascaded |
| 28 | `seniority_quota_rules` | Module | G06 | Rota-quota rotation of vacancies across recruitment streams | **GAP (gov-specific)** (impr. #4) |
| 29 | `legal_case_links` | Module | G06 | Court/tribunal reference, interim stay, subject-to-outcome | **GAP (gov-specific)** (impr. #5) |
| 30 | `correction_events` | Module | G06 | Correction-lineage + recompute cascade trigger | cascade = `JOB-G06-CORRECTION-CASCADE` on X.1 |
| 31 | `exam_results` | Module | G06 | LDCE/departmental-examination result reference | result doc in G13 |
| 32 | `promotion_refusals` | Module | G06 | Refusal-of-promotion record with debarment & MACP-clock effect | (impr. #12) |
| — | `employees`, `designations`, `cadres`, `pay_scales` | Master | **G01 + org/grade masters** | Referenced (not redefined); `VAL-GRADE-BAND` | G06 reads only |
| — | `org_units` | Platform | Platform | Referenced | scoping dimension (RBAC §3.6) |
| — | `service_register_events` | Ledger | **G12** (net-new, on P05) | Written by G06 | not a platform primitive |
| — | `documents` | Sibling | **G13** | Referenced | versioned vault |
| — | `notifications`, `audit_log`/`security_audit_log`, `workflows`/`workflow_instances`/`workflow_actions` | Platform | **X.2 / P05 / P01** | Consumed/written by G06 | never redefined |

### 5.2 Full field tables

> Each table additionally carries **`tenant_id` UUID NOT NULL** and (where entity-scoped) **`entity_id` UUID** as the first two columns (Platform §0.1) — shown once here and implied throughout to avoid repetition. "std audit fields" = soft-delete + lineage columns; mutation audit is captured by the **P05 DB trigger**.

#### 5.2.1 `seniority_lists`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `tenant_id` / `entity_id` | UUID | `tenant_id` NOT NULL | Platform scoping (Platform §0.1) |
| `seniority_list_id` | UUID | PK | |
| `list_no` | VARCHAR(40) | UNIQUE, NOT NULL | e.g., `SEN/ASO/2026/01` (`VAL-MASTER-UNIQUE`) |
| `cadre_id` | UUID | FK→cadres (G01 master), NOT NULL | Scope cadre |
| `grade_designation_id` | UUID | FK→designations (G01 master), NOT NULL | Grade/feeder grade (`VAL-GRADE-BAND`) |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | NULL = state-wide |
| `as_on_date` | DATE | NOT NULL | Seniority reckoning date (§5.8; `VAL-DATE`) |
| `list_type` | ENUM | NOT NULL | TENTATIVE, FINAL |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED_TENTATIVE, OBJECTIONS_OPEN, OBJECTIONS_CLOSED, FINALISED, UNDER_CORRECTION, SUPERSEDED |
| `is_multi_stream` | BOOLEAN | NOT NULL DEFAULT false | True when combined DR/promotee/LDCE list (impr. #4) |
| `quota_rule_id` | UUID | FK→seniority_quota_rules, NULL | Rota-quota applied when multi-stream |
| `objection_window_start` | DATE | NULL | |
| `objection_window_end` | DATE | NULL | |
| `supersedes_list_id` | UUID | FK→seniority_lists, NULL | Prior list replaced |
| `correction_event_id` | UUID | FK→correction_events, NULL | Set when UNDER_CORRECTION (impr. #6) |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | Any active legal_case_link (impr. #5) |
| `published_by` | UUID | FK→users, NULL | Checker (P01 approver) who approved publication |
| `document_id` | UUID | FK→documents (G13), NULL | Notified PDF |
| `workflow_instance_id` | UUID | FK→workflow_instances (P01), NULL | Publication/finalisation flow |
| std audit fields | | | soft-delete/lineage; P05 trigger captures mutations |

#### 5.2.2 `seniority_entries`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `seniority_entry_id` | UUID | PK | |
| `seniority_list_id` | UUID | FK→seniority_lists, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `rank_position` | INTEGER | NOT NULL | 1 = senior-most |
| `recruitment_stream` | ENUM | NOT NULL | DIRECT, PROMOTEE, LDCE, DEPUTATION_ABSORPTION (impr. #4) |
| `quota_slot_label` | VARCHAR(20) | NULL | Rotation slot consumed (e.g., `DR-1`, `PR-1`) (impr. #4) |
| `rotation_cycle_no` | INTEGER | NULL | Which rota-quota cycle this entry rotated into |
| `reckoning_basis` | ENUM | NOT NULL | DOJ_GRADE, REGULARISATION_DATE, MERIT_BATCH, DOB_TIEBREAK, ROSTER_POINT, EXAM_RESULT |
| `entry_into_grade_date` | DATE | NOT NULL | Date of entry into feeder grade |
| `tiebreak_value` | VARCHAR(60) | NULL | Recorded tiebreaker |
| `reservation_category` | ENUM | NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `is_provisional` | BOOLEAN | NOT NULL DEFAULT true | Cleared on finalisation |
| `superseded_by_correction` | BOOLEAN | NOT NULL DEFAULT false | Set by recompute cascade |
| `remarks` | TEXT | NULL | |
| std audit fields | | | UNIQUE(`seniority_list_id`,`employee_id`); UNIQUE(`seniority_list_id`,`rank_position`) |

#### 5.2.3 `seniority_objections`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `objection_id` | UUID | PK | |
| `objection_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `seniority_list_id` | UUID | FK, NOT NULL | |
| `raised_by_employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `target_entry_id` | UUID | FK→seniority_entries, NULL | Entry contested |
| `objection_type` | ENUM | NOT NULL | WRONG_POSITION, WRONG_DATE, OMISSION, CATEGORY_ERROR, STREAM_QUOTA_ERROR, OTHER |
| `grounds` | TEXT | NOT NULL | `VAL-COMMENT` |
| `supporting_document_id` | UUID | FK→documents (G13), NULL | `VAL-FILE` |
| `status` | ENUM | NOT NULL | SUBMITTED, UNDER_REVIEW, UPHELD, REJECTED, PARTIALLY_UPHELD, TIME_BARRED, WITHDRAWN |
| `disposal_remarks` | TEXT | NULL | |
| `disposed_by` | UUID | FK→users, NULL | |
| `disposed_at` | TIMESTAMP | NULL | |
| std audit fields | | | |

#### 5.2.4 `eligibility_rules`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `eligibility_rule_id` | UUID | PK | |
| `rule_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `from_grade_id` | UUID | FK→designations (G01), NOT NULL | Feeder grade |
| `to_grade_id` | UUID | FK→designations (G01), NOT NULL | Promotion grade |
| `channel` | ENUM | NOT NULL | PROMOTION, MACP, OFFICIATING, **LDCE** (impr. #14) |
| `min_qualifying_service_years` | NUMERIC(4,1) | NOT NULL | In feeder grade (net of exclusions per QSL) |
| `min_qualifying_service_months` | INTEGER | NULL | Granular alt |
| `service_exclusion_rule_id` | UUID | FK→service_exclusion_rules, NULL | Which exclusion set applies (impr. #9) |
| `apar_lookback_years` | INTEGER | NOT NULL | e.g., 5 |
| `apar_benchmark` | ENUM | NOT NULL | GOOD, VERY_GOOD, OUTSTANDING |
| `apar_min_count_meeting_benchmark` | INTEGER | NOT NULL | e.g., 4 of 5 |
| `require_apar_communicated` | BOOLEAN | NOT NULL DEFAULT true | Dev Dutt gate (impr. #2) |
| `requires_vigilance_clearance` | BOOLEAN | NOT NULL DEFAULT true | from G09 |
| `disqualify_if_penalty_current` | BOOLEAN | NOT NULL DEFAULT true | |
| `qualification_exam_ref` | VARCHAR(60) | NULL | Structured exam/qualification code (impr. #14) |
| `requires_exam_pass` | BOOLEAN | NOT NULL DEFAULT false | LDCE/departmental exam gate |
| `requires_cert_currency` | BOOLEAN | NOT NULL DEFAULT true | OBC creamy-layer / EWS currency-on-crucial-date (impr. #16) |
| `roster_applicable` | BOOLEAN | NOT NULL DEFAULT true | |
| `effective_from`/`effective_to` | DATE | | Versioned rule (`VAL-EFFECTIVE`; config cascade Platform §0.3) |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.5 `eligibility_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `assessment_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK→promotion_cases, NULL | NULL for MACP-only |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `qsl_snapshot_id` | UUID | FK→qualifying_service_ledger, NOT NULL | Cited service fact (impr. #8) |
| `qualifying_service_years` | NUMERIC(5,2) | NOT NULL | Copied from QSL snapshot (net of exclusions) |
| `apar_pass` | BOOLEAN | NOT NULL | from G08 |
| `apar_detail_json` | JSONB | NULL | Per-year ratings snapshot from **G08** — **P02 field-masked PII** (§10.2) |
| `apar_communicated` | BOOLEAN | NOT NULL | Were relied-upon entries communicated? (impr. #2) |
| `apar_representation_status` | ENUM | NOT NULL | NONE, PENDING, DISPOSED, NOT_APPLICABLE (impr. #2) |
| `apar_usable` | BOOLEAN | NOT NULL | False ⇒ uncommunicated adverse entry **cannot be relied on** by DPC |
| `vigilance_status` | ENUM | NOT NULL | CLEAR, SEALED_COVER, NOT_CLEAR, PENDING — from **G09** |
| `disciplinary_status` | ENUM | NOT NULL | CLEAR, PENALTY_CURRENT, CHARGE_PENDING — from **G09** |
| `qualification_met` | BOOLEAN | NOT NULL | |
| `exam_result_id` | UUID | FK→exam_results, NULL | LDCE/exam gate (impr. #14) |
| `obc_creamy_layer_status` | ENUM | NULL | NON_CREAMY, CREAMY, NA — currency on crucial_date (impr. #16) |
| `ews_cert_valid_on_crucial_date` | BOOLEAN | NULL | EWS certificate currency (impr. #16) |
| `overall_result` | ENUM | NOT NULL | ELIGIBLE, NOT_ELIGIBLE, SEALED_COVER, PROVISIONALLY_ELIGIBLE |
| `failure_reasons` | JSONB | NULL | reason codes (APAR_NOT_COMMUNICATED, EXAM_NOT_PASSED, EWS_CERT_EXPIRED) |
| `rule_trace_json` | JSONB | NULL | Full explainable trace incl. APAR-usability decision |
| `apar_snapshot_retention_until` | DATE | NULL | Explicit retention for APAR snapshot (impr. #16); purge via `JOB-G06-APAR-PURGE` (X.1) |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| std audit fields | | | UNIQUE(`promotion_case_id`,`employee_id`) |

#### 5.2.6 `promotion_cases`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `promotion_case_id` | UUID | PK | |
| `case_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `from_grade_id` | UUID | FK→designations (G01), NOT NULL | |
| `to_grade_id` | UUID | FK→designations (G01), NOT NULL | |
| `cadre_id` | UUID | FK→cadres (G01), NOT NULL | |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | |
| `sanctioned_post_id` | UUID | FK→sanctioned_posts, NOT NULL | Vacancy source (impr. #1) |
| `vacancy_count` | INTEGER | NOT NULL, CHECK ≥ 0 | **Derived/validated** from `sanctioned_posts` promotion-quota vacancies (`VAL-G06-VACANCY-RECON`) |
| `vacancy_year` | INTEGER | NOT NULL | DPC cycle/panel year (§5.8) |
| `promotion_mode` | ENUM | NOT NULL | SENIORITY_FIT, SELECTION_MERIT, SENIORITY_CUM_FITNESS, **LDCE** (impr. #14) |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `crucial_date` | DATE | NOT NULL | Eligibility reckoning date (§5.8) |
| `status` | ENUM | NOT NULL | DRAFT, FIELD_ASSEMBLED, ELIGIBILITY_DONE, PANEL_CONSTITUTED, DPC_HELD, SELECT_LIST_APPROVED, ORDERS_ISSUED, INTERIM_STAYED, CLOSED, CANCELLED |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | (impr. #5) |
| `workflow_instance_id` | UUID | FK→workflow_instances (P01), NULL | DPC/approval flow |
| std audit fields | | | |

#### 5.2.7 `promotion_panels`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `panel_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `panel_type` | ENUM | NOT NULL | DPC, DEPARTMENTAL_SELECTION_COMMITTEE, REVIEW_DPC, SUPPLEMENTARY_DPC, SCREENING_COMMITTEE |
| `workflow_instance_id` | UUID | FK→workflow_instances (P01), NULL | Committee-as-workflow; members = `PARALLEL_ALL_OF` branches |
| `convened_date` | DATE | NULL | |
| `panel_valid_from` | DATE | NULL | Panel currency start (impr. #11) |
| `panel_valid_until` | DATE | NULL | Panel currency end — orders blocked after expiry (impr. #11) |
| `quorum_required` | INTEGER | NOT NULL | |
| `status` | ENUM | NOT NULL | CONSTITUTED, CONVENED, CONCLUDED, EXPIRED, DISSOLVED |
| std audit fields | | | |

#### 5.2.8 `promotion_panel_members`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `panel_member_id` | UUID | PK | |
| `panel_id` | UUID | FK, NOT NULL | |
| `member_employee_id` | UUID | FK→employees (G01), NULL | Internal member; P01 approver resolution = named individual |
| `external_member_name` | VARCHAR(120) | NULL | e.g., UPSC/PSC nominee |
| `member_role` | ENUM | NOT NULL | CHAIRPERSON, MEMBER, SECRETARY, COMMISSION_NOMINEE, EXPERT |
| `attendance` | ENUM | NULL | PRESENT, ABSENT, RECUSED |
| `recusal_reason` | TEXT | NULL | Conflict of interest (P02 SoD) |
| std audit fields | | | CHECK(member_employee_id IS NOT NULL OR external_member_name IS NOT NULL) |

#### 5.2.9 `promotion_candidates`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `candidate_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `seniority_entry_id` | UUID | FK→seniority_entries, NULL | Link to seniority |
| `zone_of_consideration` | ENUM | NOT NULL | IN_ZONE, EXTENDED_ZONE, OUT_OF_ZONE |
| `eligibility_assessment_id` | UUID | FK, NULL | |
| `reservation_category` | ENUM | NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `selected_on_own_merit` | BOOLEAN | NOT NULL DEFAULT false | Reserved candidate making it on UR merit (impr. #3) |
| `roster_point_id` | UUID | FK→roster_points, NULL | Reserved point filled |
| `dpc_verdict` | ENUM | NULL | FIT, NOT_FIT, UNFIT, SEALED_COVER, DEFERRED, SUPERSEDED |
| `select_list_rank` | INTEGER | NULL | Position in approved select list |
| `is_selected` | BOOLEAN | NOT NULL DEFAULT false | |
| `remarks` | TEXT | NULL | |
| std audit fields | | | UNIQUE(`promotion_case_id`,`employee_id`) |

#### 5.2.10 `dpc_proceedings`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `proceeding_id` | UUID | PK | |
| `panel_id` | UUID | FK, NOT NULL | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `meeting_date` | DATE | NOT NULL | |
| `benchmark_applied` | ENUM | NOT NULL | GOOD, VERY_GOOD, OUTSTANDING |
| `quorum_met` | BOOLEAN | NOT NULL | |
| `minutes_document_id` | UUID | FK→documents (G13), NULL | |
| `select_list_count` | INTEGER | NOT NULL | |
| `reserve_list_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `sealed_cover_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `status` | ENUM | NOT NULL | DRAFT_MINUTES, APPROVED, RATIFIED |
| `approved_by` | UUID | FK→users, NULL | Appointing authority (P01 checker) |
| std audit fields | | | |

#### 5.2.11 `promotion_orders`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `order_id` | UUID | PK | |
| `order_no` | VARCHAR(40) | UNIQUE, NOT NULL | Gap-free per series |
| `promotion_case_id` | UUID | FK, NULL | NULL for officiating-only |
| `candidate_id` | UUID | FK→promotion_candidates, NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `order_type` | ENUM | NOT NULL | REGULAR_PROMOTION, AD_HOC, OFFICIATING, IN_SITU, MACP, LDCE_PROMOTION |
| `from_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `to_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `from_pay_scale_id` | UUID | FK→pay_scales (G01), NULL | |
| `to_pay_scale_id` | UUID | FK→pay_scales (G01), NULL | |
| `effective_date` | DATE | NOT NULL | (§5.8; `effective_from` staged via effective-date job) |
| `notional_date` | DATE | NULL | For notional promotion/seniority (§5.8) |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | "Subject to outcome of OA/SLP" (impr. #5) |
| `acceptance_status` | ENUM | NOT NULL | PENDING, ACCEPTED, DECLINED, DEEMED_ACCEPTED |
| `status` | ENUM | NOT NULL | DRAFT, ISSUED, PUBLISHED, EFFECTED, INTERIM_STAYED, SUPERSEDED, CANCELLED |
| `order_document_id` | UUID | FK→documents (G13), NULL | Generated via W.1 Document-Generation stage |
| `sr_event_id` | UUID | FK→service_register_events (G12), NULL | SR posting linkage |
| `correction_event_id` | UUID | FK→correction_events, NULL | If issued/superseded via correction (impr. #6) |
| `workflow_instance_id` | UUID | FK→workflow_instances (P01), NULL | Order maker-checker |
| std audit fields | | | |

#### 5.2.12 `probation_records`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `probation_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `probation_start` | DATE | NOT NULL | |
| `probation_months` | INTEGER | NOT NULL | e.g., 24 |
| `scheduled_end` | DATE | NOT NULL | Computed |
| `extended_to` | DATE | NULL | If extended |
| `status` | ENUM | NOT NULL | ON_PROBATION, EXTENDED, DECLARED_SATISFACTORY, REVERTED, DISCHARGED |
| `declaration_date` | DATE | NULL | |
| `declared_by` | UUID | FK→users, NULL | |
| `remarks` | TEXT | NULL | |
| std audit fields | | | |

#### 5.2.13 `officiating_arrangements`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `arrangement_id` | UUID | PK | |
| `arrangement_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `arrangement_type` | ENUM | NOT NULL | AD_HOC, OFFICIATING, IN_SITU, CURRENT_DUTY_CHARGE |
| `against_post_id` | UUID | FK→designations (G01), NOT NULL | Higher post held |
| `sanctioned_post_id` | UUID | FK→sanctioned_posts, NULL | Post occupied against (impr. #1) |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NULL | Open-ended until regularised |
| `linked_case_id` | UUID | FK→promotion_cases, NULL | Regular case pending |
| `regularised_order_id` | UUID | FK→promotion_orders, NULL | On regularisation |
| `status` | ENUM | NOT NULL | ACTIVE, EXTENDED, REGULARISED, TERMINATED, SUPERSEDED_BY_REGULAR, LAPSED |
| `pay_allowed` | BOOLEAN | NOT NULL DEFAULT true | Officiating pay |
| std audit fields | | | |

#### 5.2.14 `financial_upgradations`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `upgradation_id` | UUID | PK | |
| `upgradation_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `scheme` | ENUM | NOT NULL | TBP, ACP, MACP |
| `upgrade_level` | ENUM | NOT NULL | FIRST, SECOND, THIRD |
| `qsl_snapshot_id` | UUID | FK→qualifying_service_ledger, NOT NULL | Cited service fact (impr. #8) |
| `qualifying_years_completed` | NUMERIC(5,2) | NOT NULL | e.g., 10/20/30 |
| `regular_promotions_availed` | INTEGER | NOT NULL DEFAULT 0 | Reduces remaining MACP entitlement (impr. #13) |
| `clock_reset_date` | DATE | NULL | Reset on intervening regular promotion (impr. #13) |
| `refusal_effect_applied` | BOOLEAN | NOT NULL DEFAULT false | Set if a DECLINED promotion stops/forfeits clock (impr. #12) |
| `due_date` | DATE | NOT NULL | When entitlement falls due |
| `granted_pay_level_id` | UUID | FK→pay_scales (G01), NULL | Next pay level granted |
| `effective_date` | DATE | NULL | |
| `macp_assessment_id` | UUID | FK→macp_assessments, NULL | |
| `status` | ENUM | NOT NULL | DUE, UNDER_SCREENING, SANCTIONED, DEFERRED, REJECTED, EFFECTED |
| `deferral_reason` | TEXT | NULL | e.g., penalty currency |
| `order_id` | UUID | FK→promotion_orders, NULL | MACP order linkage |
| `sr_event_id` | UUID | FK→service_register_events (G12), NULL | |
| std audit fields | | | due detection via `JOB-G06-MACP-DUE` (X.1) |

#### 5.2.15 `macp_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `macp_assessment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `screening_committee_panel_id` | UUID | FK→promotion_panels, NULL | screening = P01 flow |
| `benchmark_required` | ENUM | NOT NULL | GOOD, VERY_GOOD |
| `benchmark_met` | BOOLEAN | NOT NULL | |
| `financial_upgradations_availed` | INTEGER | NOT NULL | Prior up-gradations (caps at 3 total) (impr. #13) |
| `promotions_earned_count` | INTEGER | NOT NULL | Regular promotions already taken (reduce remaining entitlement) |
| `result` | ENUM | NOT NULL | RECOMMENDED, NOT_RECOMMENDED, DEFERRED |
| `assessment_date` | DATE | NOT NULL | |
| std audit fields | | | |

#### 5.2.16 `reservation_rosters`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `roster_id` | UUID | PK | |
| `roster_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `cadre_id` | UUID | FK→cadres (G01), NOT NULL | |
| `grade_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `roster_type` | ENUM | NOT NULL | PROMOTION_RESERVATION, DIRECT_RECRUITMENT, POST_BASED, VACANCY_BASED |
| `cycle_size` | INTEGER | NOT NULL | e.g., 100/200-point |
| `policy_version` | VARCHAR(20) | NOT NULL | Reservation policy applied (config-cascaded) |
| `roster_applicable` | BOOLEAN | NOT NULL DEFAULT true | False for single-post cadre / exempt grade (impr. #15) |
| `enabling_provision_ref` | VARCHAR(120) | NULL | Statutory enabling provision for reservation-in-promotion (Nagaraj) (impr. #15) |
| `quantifiable_data_doc_id` | UUID | FK→documents (G13), NULL | Inadequacy-of-representation data record (Nagaraj/Jarnail) (impr. #15) |
| `consequential_seniority_mode` | ENUM | NOT NULL DEFAULT CATCH_UP | CONSEQUENTIAL, CATCH_UP (impr. #15) |
| `status` | ENUM | NOT NULL | ACTIVE, REVISED, ARCHIVED |
| std audit fields | | | |

#### 5.2.17 `roster_points`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `roster_point_id` | UUID | PK | |
| `roster_id` | UUID | FK, NOT NULL | |
| `point_number` | INTEGER | NOT NULL | Sequence within cycle |
| `reserved_for` | ENUM | NOT NULL | GEN, SC, ST, OBC, EWS, PWBD |
| `is_horizontal_pwbd` | BOOLEAN | NOT NULL DEFAULT false | PwBD horizontal interpolation marker |
| `status` | ENUM | NOT NULL | VACANT, FILLED, CARRIED_FORWARD, DE_RESERVED, INTERCHANGED |
| `filled_by_employee_id` | UUID | FK→employees (G01), NULL | |
| `adjusted_against_category` | ENUM | NULL | Category the fill is **counted against** — own-merit migration sets this to GEN/UR (impr. #3) |
| `filled_in_case_id` | UUID | FK→promotion_cases, NULL | |
| `carry_forward_from_point_id` | UUID | FK→roster_points, NULL | |
| `dereservation_authority_ref` | VARCHAR(120) | NULL | Authority for DE_RESERVED/INTERCHANGED |
| std audit fields | | | UNIQUE(`roster_id`,`point_number`) |

#### 5.2.18 `promotion_postings`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `posting_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `to_org_unit_id` | UUID | FK→org_units, NOT NULL | Posting office/station |
| `to_post_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `to_sanctioned_post_id` | UUID | FK→sanctioned_posts, NOT NULL | Validated vacant post (impr. #1) |
| `posting_type` | ENUM | NOT NULL | LOCAL, OUT_STATION, DEPUTATION |
| `g05_movement_id` | UUID | NULL | Reference to **G05** relieving/joining movement |
| `report_by_date` | DATE | NULL | Joining deadline |
| `status` | ENUM | NOT NULL | PENDING, RELIEVED, JOINED, NOT_JOINED, CANCELLED |
| `not_joined_consequence` | ENUM | NULL | ORDER_REVIEW, FORFEITED, EXTENSION_GRANTED (impr. #20) |
| `sr_event_id` | UUID | FK→service_register_events (G12), NULL | |
| std audit fields | | | |

#### 5.2.19 `career_paths` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `career_path_id` | UUID | PK | |
| `path_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `path_name` | VARCHAR(120) | NOT NULL | |
| `cadre_id` | UUID | FK→cadres (G01), NULL | |
| `description` | TEXT | NULL | |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.20 `career_path_stages` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `stage_id` | UUID | PK | |
| `career_path_id` | UUID | FK, NOT NULL | |
| `stage_order` | INTEGER | NOT NULL | |
| `designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `typical_years_in_stage` | NUMERIC(4,1) | NULL | |
| `required_competencies` | JSONB | NULL | **Reference** to **G07** competencies (read-only; not redefined) |
| std audit fields | | | UNIQUE(`career_path_id`,`stage_order`) |

#### 5.2.21 `succession_plans` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_plan_id` | UUID | PK | |
| `critical_position_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `incumbent_employee_id` | UUID | FK→employees (G01), NULL | |
| `risk_of_loss` | ENUM | NOT NULL | LOW, MEDIUM, HIGH |
| `status` | ENUM | NOT NULL | DRAFT, ACTIVE, REVIEWED, ARCHIVED |
| std audit fields | | | |

#### 5.2.22 `succession_candidates` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_candidate_id` | UUID | PK | |
| `succession_plan_id` | UUID | FK, NOT NULL | |
| `candidate_employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `readiness` | ENUM | NOT NULL | READY_NOW, READY_1_2Y, READY_3Y_PLUS, DEVELOPMENT_NEEDED |
| `bench_rank` | INTEGER | NULL | |
| std audit fields | | | UNIQUE(`succession_plan_id`,`candidate_employee_id`) |

#### 5.2.23 `progression_alerts`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `alert_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `alert_type` | ENUM | NOT NULL | DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING, SEALED_COVER_REVIEW_DUE, REFUSAL_DEBARMENT_ENDING |
| `due_date` | DATE | NULL | |
| `severity` | ENUM | NOT NULL | INFO, WARNING, CRITICAL |
| `status` | ENUM | NOT NULL | OPEN, ACKNOWLEDGED, ACTIONED, DISMISSED, EXPIRED |
| `context_json` | JSONB | NULL | Rule trace |
| std audit fields | | | generated by `JOB-G06-PROGRESSION` (X.1); dispatched via X.2 (`MSG-G06-*`) |

#### 5.2.24 `increment_monitor` (monitoring view; G10 system-of-record)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `increment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `increment_type` | ENUM | NOT NULL | ANNUAL, STAGNATION_INCREMENT, EFFICIENCY_BAR |
| `due_date` | DATE | NOT NULL | |
| `g10_increment_ref` | VARCHAR(60) | NULL | Reference to **G10** system-of-record record (impr. #18) |
| `status` | ENUM | NOT NULL | DUE, RELEASED, WITHHELD, DEFERRED — **mirrored from G10**, not authoritative |
| `withheld_reason` | TEXT | NULL | |
| `released_effective_date` | DATE | NULL | |
| std audit fields | | | UNIQUE(`employee_id`,`increment_type`,`due_date`) |

#### 5.2.25 `sanctioned_posts` (NEW — improvement #1; **GAP (gov-specific)**)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `sanctioned_post_id` | UUID | PK | |
| `cadre_id` | UUID | FK→cadres (G01), NOT NULL | |
| `grade_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `sanction_order_ref` | VARCHAR(80) | NOT NULL | Post-sanction order reference (master data) |
| `sanctioned_strength` | INTEGER | NOT NULL, CHECK ≥ 0 | Total sanctioned posts |
| `filled_count` | INTEGER | NOT NULL DEFAULT 0, CHECK ≥ 0 | Currently filled |
| `dr_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Direct-recruitment quota share (`VAL-PCT`) |
| `promotion_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Promotion-quota share (`VAL-PCT`) |
| `ldce_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | LDCE-quota share (`VAL-PCT`) |
| `current_vacancies` | INTEGER | NOT NULL DEFAULT 0 | sanctioned − filled (computed, audited) |
| `anticipated_vacancies` | INTEGER | NOT NULL DEFAULT 0 | Retirements/etc. in cycle (from G11) |
| `carried_forward_vacancies` | INTEGER | NOT NULL DEFAULT 0 | From prior cycle |
| `as_on_date` | DATE | NOT NULL | Snapshot date |
| `status` | ENUM | NOT NULL | ACTIVE, REVISED, ARCHIVED |
| std audit fields | | | CHECK(filled_count ≤ sanctioned_strength); CHECK(dr+promotion+ldce ≤ 100) (`VAL-G06-QUOTA-SPLIT`) |

#### 5.2.26 `qualifying_service_ledger` (NEW — improvement #8; **GAP (gov-specific)** net-new statutory engine)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `qsl_snapshot_id` | UUID | PK | Immutable snapshot row |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `grade_designation_id` | UUID | FK→designations (G01), NOT NULL | Feeder grade for which service is reckoned |
| `as_of_date` | DATE | NOT NULL | Reckoning date (usually crucial_date) (§5.8) |
| `gross_service_years` | NUMERIC(6,3) | NOT NULL | Before exclusions |
| `total_exclusion_days` | INTEGER | NOT NULL DEFAULT 0 | Sum of excluded periods |
| `net_qualifying_years` | NUMERIC(6,3) | NOT NULL | gross − exclusions (`VAL-G06-QUALSVC`) |
| `exclusion_breakdown_json` | JSONB | NOT NULL | Itemised EOL/dies-non/suspension/ad-hoc/deputation periods + rule cited |
| `service_exclusion_rule_id` | UUID | FK→service_exclusion_rules, NOT NULL | Rule version applied |
| `computed_by_version` | VARCHAR(20) | NOT NULL | Ledger engine version (citable) |
| `is_current` | BOOLEAN | NOT NULL DEFAULT true | Superseded by recompute on correction |
| `superseding_snapshot_id` | UUID | FK→qualifying_service_ledger, NULL | Lineage |
| `computed_at` | TIMESTAMP | NOT NULL | |
| std audit fields | | | Append-only; never hard-deleted (soft delete only; Platform §8.2); P06 source-id on migrated rows |

#### 5.2.27 `service_exclusion_rules` (NEW — improvement #9)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `service_exclusion_rule_id` | UUID | PK | |
| `rule_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `eol_counts_as_qualifying` | BOOLEAN | NOT NULL DEFAULT false | Extraordinary leave treatment |
| `eol_max_condonable_days` | INTEGER | NULL | EOL condonable up to limit |
| `dies_non_excluded` | BOOLEAN | NOT NULL DEFAULT true | Dies-non always excluded |
| `suspension_treatment` | ENUM | NOT NULL | EXCLUDE, INCLUDE_IF_EXONERATED, PER_OUTCOME |
| `adhoc_service_counts` | BOOLEAN | NOT NULL DEFAULT false | Ad-hoc counts only if regularised |
| `adhoc_counts_if_regularised` | BOOLEAN | NOT NULL DEFAULT true | |
| `deputation_counts` | BOOLEAN | NOT NULL DEFAULT true | Deputation period counting |
| `break_in_service_resets_clock` | BOOLEAN | NOT NULL DEFAULT false | |
| `effective_from`/`effective_to` | DATE | | Versioned (`VAL-EFFECTIVE`; config cascade) |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.28 `seniority_quota_rules` (NEW — improvement #4; **GAP (gov-specific)**)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `quota_rule_id` | UUID | PK | |
| `rule_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `cadre_id` | UUID | FK→cadres (G01), NOT NULL | |
| `grade_designation_id` | UUID | FK→designations (G01), NOT NULL | |
| `dr_quota_ratio` | INTEGER | NOT NULL | e.g., 1 (DR) |
| `promotee_quota_ratio` | INTEGER | NOT NULL | e.g., 1 (PR) |
| `ldce_quota_ratio` | INTEGER | NOT NULL DEFAULT 0 | |
| `rotation_method` | ENUM | NOT NULL | ROTA_QUOTA, RUNNING_ACCOUNT, SEPARATE_STREAM |
| `rotation_start_slot` | ENUM | NOT NULL | DR_FIRST, PROMOTEE_FIRST |
| `unfilled_quota_carry_forward` | BOOLEAN | NOT NULL DEFAULT true | |
| `policy_reference` | VARCHAR(120) | NULL | Governing rule (e.g., N.R. Parmar compliance) |
| `effective_from`/`effective_to` | DATE | | (`VAL-EFFECTIVE`) |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.29 `legal_case_links` (NEW — improvement #5; **GAP (gov-specific)**)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `legal_case_link_id` | UUID | PK | |
| `link_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `linked_entity_type` | ENUM | NOT NULL | PROMOTION_CASE, PROMOTION_ORDER, SENIORITY_LIST, ROSTER, CANDIDATE |
| `linked_entity_id` | UUID | NOT NULL | Polymorphic FK (validated in service) |
| `forum` | ENUM | NOT NULL | CAT, HIGH_COURT, SUPREME_COURT, TRIBUNAL_OTHER |
| `case_reference` | VARCHAR(80) | NOT NULL | e.g., OA No. 123/2026, SLP(C) 456/2026 |
| `petitioner` | VARCHAR(160) | NULL | |
| `interim_stay` | BOOLEAN | NOT NULL DEFAULT false | Interim stay in force (impr. #5) |
| `stay_from_date` | DATE | NULL | |
| `stay_to_date` | DATE | NULL | |
| `subject_to_outcome` | BOOLEAN | NOT NULL DEFAULT false | Order/list issued subject to outcome |
| `status` | ENUM | NOT NULL | FILED, INTERIM_STAYED, PENDING, DISPOSED_FAVOURABLE, DISPOSED_ADVERSE, CONTEMPT, WITHDRAWN |
| `outcome_document_id` | UUID | FK→documents (G13), NULL | Court order |
| `triggers_correction_event_id` | UUID | FK→correction_events, NULL | On adverse outcome (impr. #6) |
| std audit fields | | | |

#### 5.2.30 `correction_events` (NEW — improvements #6/7; **GAP (gov-specific)**)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `correction_event_id` | UUID | PK | |
| `correction_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `reason_class` | ENUM | NOT NULL | OBJECTION_UPHELD, COURT_ORDER, ADMIN_ERROR (impr. #6) |
| `trigger_legal_case_link_id` | UUID | FK→legal_case_links, NULL | When COURT_ORDER |
| `trigger_objection_id` | UUID | FK→seniority_objections, NULL | When OBJECTION_UPHELD |
| `affected_entity_type` | ENUM | NOT NULL | SENIORITY_LIST, PROMOTION_CASE, PROMOTION_ORDER |
| `affected_entity_id` | UUID | NOT NULL | |
| `recompute_scope_json` | JSONB | NOT NULL | Lists/cases/candidates to re-rank/recompute |
| `cascade_status` | ENUM | NOT NULL | PENDING, RUNNING, COMPLETED, FAILED, ROLLED_BACK |
| `pay_anomaly_flag` | BOOLEAN | NOT NULL DEFAULT false | Junior-drawing-more detected → stepping-up signal to **G10** (impr. #7) |
| `pay_anomaly_signal_ref` | VARCHAR(60) | NULL | G10 stepping-up signal id |
| `approved_by` | UUID | FK→users, NULL | Appointing authority checker (P01) |
| `workflow_instance_id` | UUID | FK→workflow_instances (P01), NULL | Correction approval flow |
| `sr_correction_event_id` | UUID | FK→service_register_events (G12), NULL | SR correction posting |
| std audit fields | | | Append-only lineage; cascade run by `JOB-G06-CORRECTION-CASCADE` (X.1, idempotent/resumable) |

#### 5.2.31 `exam_results` (NEW — improvement #14)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `exam_result_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `exam_code` | VARCHAR(60) | NOT NULL | LDCE/departmental exam identifier |
| `exam_cycle_year` | INTEGER | NOT NULL | |
| `result` | ENUM | NOT NULL | PASS, FAIL, EXEMPTED, AWAITED |
| `marks_or_grade` | VARCHAR(30) | NULL | |
| `merit_rank` | INTEGER | NULL | For LDCE merit ordering |
| `valid_from`/`valid_to` | DATE | | Result currency |
| `result_document_id` | UUID | FK→documents (G13), NULL | |
| std audit fields | | | UNIQUE(`employee_id`,`exam_code`,`exam_cycle_year`) |

#### 5.2.32 `promotion_refusals` (NEW — improvement #12)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `refusal_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | The declined order |
| `employee_id` | UUID | FK→employees (G01), NOT NULL | |
| `refusal_date` | DATE | NOT NULL | |
| `refusal_reason` | TEXT | NULL | `VAL-COMMENT` |
| `debarment_months` | INTEGER | NOT NULL | Configurable debarment window (e.g., 12) |
| `debarment_until` | DATE | NOT NULL | refusal_date + debarment_months |
| `macp_clock_effect` | ENUM | NOT NULL | NONE, STOP, FORFEIT_NEXT, RESET (impr. #12) |
| `next_consideration_after` | DATE | NULL | Earliest re-consideration |
| `status` | ENUM | NOT NULL | ACTIVE, EXPIRED, WAIVED |
| std audit fields | | | debarment-ending alert via `JOB-G06-PROGRESSION` (X.1) |

### 5.3 Relationship map

```
sanctioned_posts ──> promotion_cases (vacancy source) ; ──> promotion_postings (vacant-post validation)
employees (G01) ──< qualifying_service_ledger >── service_exclusion_rules
qualifying_service_ledger ──> eligibility_assessments ; ──> financial_upgradations (cited service fact)
employees ──< seniority_entries >── seniority_lists ──< seniority_objections
seniority_lists >── seniority_quota_rules (multi-stream rota-quota)
employees ──< eligibility_assessments >── eligibility_rules ; eligibility_assessments >── exam_results
   eligibility_assessments reads APAR from G08, vigilance/disciplinary from G09 (by reference)
promotion_cases ──< eligibility_assessments
promotion_cases ──< promotion_candidates >── seniority_entries ; promotion_candidates >── roster_points (own-merit)
promotion_cases ──< promotion_panels (panel currency; P01 workflow_instance) ──< promotion_panel_members
promotion_panels ──< dpc_proceedings >── promotion_cases
promotion_candidates ──< promotion_orders ──< probation_records
promotion_orders ──< promotion_refusals (on DECLINED) ──> financial_upgradations (MACP-clock effect)
promotion_orders ──< promotion_postings ── org_units ; promotion_postings ──> G05 movement
promotion_orders >── service_register_events (G12, on P05 substrate)
employees ──< officiating_arrangements >── promotion_cases (linked) ; >── sanctioned_posts
employees ──< financial_upgradations >── macp_assessments ──> G10 (pay event)
reservation_rosters ──< roster_points >── promotion_candidates
legal_case_links ──> {promotion_cases, promotion_orders, seniority_lists, roster_points, candidates}
legal_case_links ──> correction_events ──> {seniority_lists, promotion_cases, promotion_orders} (recompute cascade)
correction_events ──> service_register_events (G12 correction posting) ; ──> G10 (pay-anomaly stepping-up signal)
career_paths ──< career_path_stages ── designations (advisory; competencies referenced from G07)
succession_plans ──< succession_candidates ── employees (advisory)
employees ──< progression_alerts ; employees ──< increment_monitor (mirror of G10)
documents (G13) referenced by: seniority_lists, seniority_objections, dpc_proceedings, promotion_orders,
   reservation_rosters (quantifiable data), legal_case_links, exam_results
P05 audit_log/security_audit_log (DB-trigger) auto-captures: ALL state transitions on G06 tables
P01 workflows/workflow_instances/workflow_actions drive: list publication, DPC convening + member verdicts
   (PARALLEL_ALL_OF), select-list approval, order issue, MACP sanction, de-reservation, correction-event approval
X.2/W.3 notifications dispatch: alerts, panel invitations, order publication, stay notifications (MSG-G06-*)
X.1 jobs: JOB-G06-EFFDATE, -MACP-DUE, -PROGRESSION, -CORRECTION-CASCADE, -SEALED-RECONCILE, -APAR-PURGE, -ESTAB-RECONCILE
```

### 5.4 Ownership / Reuse matrix

| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `employees`, `designations`, `cadres`, `pay_scales` | **G01 + org/grade masters** | G06 | G01 only |
| `org_units` | Platform | G06 | Platform |
| `service_register_events` | **G12** (net-new ledger on P05) | G06, G14 | G06 (events), G12 |
| `documents` | **G13** | G06 | G06 (uploads via G13 API) |
| `notifications` | **X.2** | G06 | G06 (via X.2/W.3) |
| `audit_log` / `security_audit_log` | **P05** | Auditor, G14 | G06 (auto via DB trigger) |
| `workflows`/`workflow_instances`/`workflow_actions` | **P01** | G06 | G06 (via WorkflowEngine ops) |
| `sanctioned_posts` | G06 | G06, G14 | Est.-Strength Officer (G06) |
| `qualifying_service_ledger`, `service_exclusion_rules` | G06 | G06 (FR-003/011/013/014), Auditor | G06 (QSL engine) |
| `increment_monitor` | G06 (view) | G06, employee | G06 (mirror); **G10 is system-of-record** |
| `legal_case_links` | G06 | G06, Auditor, G14 | Legal Officer (G06) |
| `correction_events` | G06 | G06, Auditor, G10 (anomaly), G12 | G06; approved by Appointing Authority (P01) |
| All other `seniority_*`, `promotion_*`, `eligibility_*`, `dpc_*`, `officiating_*`, `financial_*`, `macp_*`, `reservation_*`, `roster_*`, `career_*`, `succession_*`, `progression_*`, `probation_records`, `exam_results`, `promotion_refusals`, `seniority_quota_rules` | G06 | G14 (analytics), G10/G11 (consume orders & upgradations) | G06 |
| APAR ratings + **communication/representation status** | **G08** | G06 (read by reference) | G08 |
| Disciplinary/vigilance status + **conclusion events** | **G09** | G06 (read + subscribe) | G09 |
| Increment system-of-record, stepping-up arithmetic | **G10** | G06 (mirror/flag) | G10 |

### 5.5 Enum catalog (additions in **bold**)

| Enum group | Values |
|---|---|
| seniority_list.status | DRAFT, PUBLISHED_TENTATIVE, OBJECTIONS_OPEN, OBJECTIONS_CLOSED, FINALISED, **UNDER_CORRECTION**, SUPERSEDED |
| seniority_entry.recruitment_stream | **DIRECT, PROMOTEE, LDCE, DEPUTATION_ABSORPTION** |
| seniority_entry.reckoning_basis | DOJ_GRADE, REGULARISATION_DATE, MERIT_BATCH, DOB_TIEBREAK, ROSTER_POINT, **EXAM_RESULT** |
| objection.status | SUBMITTED, UNDER_REVIEW, UPHELD, REJECTED, PARTIALLY_UPHELD, **TIME_BARRED**, WITHDRAWN |
| objection.type | WRONG_POSITION, WRONG_DATE, OMISSION, CATEGORY_ERROR, **STREAM_QUOTA_ERROR**, OTHER |
| eligibility_rule.channel | PROMOTION, MACP, OFFICIATING, **LDCE** |
| eligibility.overall_result | ELIGIBLE, NOT_ELIGIBLE, SEALED_COVER, PROVISIONALLY_ELIGIBLE |
| eligibility.apar_representation_status | **NONE, PENDING, DISPOSED, NOT_APPLICABLE** |
| eligibility.obc_creamy_layer_status | **NON_CREAMY, CREAMY, NA** |
| eligibility.vigilance_status | CLEAR, SEALED_COVER, NOT_CLEAR, PENDING |
| eligibility.disciplinary_status | CLEAR, PENALTY_CURRENT, CHARGE_PENDING |
| promotion_case.status | DRAFT, FIELD_ASSEMBLED, ELIGIBILITY_DONE, PANEL_CONSTITUTED, DPC_HELD, SELECT_LIST_APPROVED, ORDERS_ISSUED, **INTERIM_STAYED**, CLOSED, CANCELLED |
| promotion_case.mode | SENIORITY_FIT, SELECTION_MERIT, SENIORITY_CUM_FITNESS, **LDCE** |
| panel.type | DPC, DEPARTMENTAL_SELECTION_COMMITTEE, REVIEW_DPC, **SUPPLEMENTARY_DPC**, SCREENING_COMMITTEE |
| panel.status | CONSTITUTED, CONVENED, CONCLUDED, **EXPIRED**, DISSOLVED |
| panel_member.role | CHAIRPERSON, MEMBER, SECRETARY, COMMISSION_NOMINEE, EXPERT |
| panel_member.attendance | PRESENT, ABSENT, RECUSED |
| candidate.zone | IN_ZONE, EXTENDED_ZONE, OUT_OF_ZONE |
| candidate.dpc_verdict | FIT, NOT_FIT, UNFIT, SEALED_COVER, DEFERRED, SUPERSEDED |
| proceeding.benchmark | GOOD, VERY_GOOD, OUTSTANDING |
| proceeding.status | DRAFT_MINUTES, APPROVED, RATIFIED |
| order.type | REGULAR_PROMOTION, AD_HOC, OFFICIATING, IN_SITU, MACP, **LDCE_PROMOTION** |
| order.status | DRAFT, ISSUED, PUBLISHED, EFFECTED, **INTERIM_STAYED**, SUPERSEDED, CANCELLED |
| order.acceptance_status | PENDING, ACCEPTED, DECLINED, DEEMED_ACCEPTED |
| probation.status | ON_PROBATION, EXTENDED, DECLARED_SATISFACTORY, REVERTED, DISCHARGED |
| officiating.type | AD_HOC, OFFICIATING, IN_SITU, CURRENT_DUTY_CHARGE |
| officiating.status | ACTIVE, EXTENDED, REGULARISED, TERMINATED, **SUPERSEDED_BY_REGULAR**, LAPSED |
| financial.scheme | TBP, ACP, MACP |
| financial.upgrade_level | FIRST, SECOND, THIRD |
| financial.status | DUE, UNDER_SCREENING, SANCTIONED, DEFERRED, REJECTED, EFFECTED |
| roster.type | PROMOTION_RESERVATION, DIRECT_RECRUITMENT, POST_BASED, VACANCY_BASED |
| roster.consequential_seniority_mode | **CONSEQUENTIAL, CATCH_UP** |
| roster_point.reserved_for | GEN, SC, ST, OBC, EWS, PWBD |
| roster_point.status | VACANT, FILLED, CARRIED_FORWARD, DE_RESERVED, INTERCHANGED |
| roster_point.adjusted_against_category | **GEN, SC, ST, OBC, EWS, PWBD** (own-merit migration) |
| posting.type | LOCAL, OUT_STATION, DEPUTATION |
| posting.status | PENDING, RELIEVED, JOINED, **NOT_JOINED**, CANCELLED |
| posting.not_joined_consequence | **ORDER_REVIEW, FORFEITED, EXTENSION_GRANTED** |
| sanctioned_post.status | **ACTIVE, REVISED, ARCHIVED** |
| service_exclusion.suspension_treatment | **EXCLUDE, INCLUDE_IF_EXONERATED, PER_OUTCOME** |
| quota_rule.rotation_method | **ROTA_QUOTA, RUNNING_ACCOUNT, SEPARATE_STREAM** |
| quota_rule.rotation_start_slot | **DR_FIRST, PROMOTEE_FIRST** |
| legal_case.forum | **CAT, HIGH_COURT, SUPREME_COURT, TRIBUNAL_OTHER** |
| legal_case.status | **FILED, INTERIM_STAYED, PENDING, DISPOSED_FAVOURABLE, DISPOSED_ADVERSE, CONTEMPT, WITHDRAWN** |
| correction.reason_class | **OBJECTION_UPHELD, COURT_ORDER, ADMIN_ERROR** |
| correction.cascade_status | **PENDING, RUNNING, COMPLETED, FAILED, ROLLED_BACK** |
| exam_result.result | **PASS, FAIL, EXEMPTED, AWAITED** |
| refusal.macp_clock_effect | **NONE, STOP, FORFEIT_NEXT, RESET** |
| refusal.status | **ACTIVE, EXPIRED, WAIVED** |
| succession.readiness | READY_NOW, READY_1_2Y, READY_3Y_PLUS, DEVELOPMENT_NEEDED |
| alert.type | DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING, **SEALED_COVER_REVIEW_DUE, REFUSAL_DEBARMENT_ENDING** |
| alert.severity / status | INFO/WARNING/CRITICAL ; OPEN/ACKNOWLEDGED/ACTIONED/DISMISSED/EXPIRED |
| increment.type / status | ANNUAL/STAGNATION_INCREMENT/EFFICIENCY_BAR ; DUE/RELEASED/WITHHELD/DEFERRED |

### 5.6 Data integrity rules

1. **Unique rank per list:** `(seniority_list_id, rank_position)` and `(seniority_list_id, employee_id)` both unique; ranks contiguous (1..N) on publish.
2. **Single active final list per scope:** at most one `seniority_lists` with `list_type=FINAL, status=FINALISED` per `(cadre_id, grade_designation_id, org_unit_scope_id)`; superseding one flips the prior to `SUPERSEDED`.
3. **Eligibility immutability after DPC:** `eligibility_assessments` for a case are frozen (copy-on-write snapshot) once the case reaches `DPC_HELD`; the cited `qsl_snapshot_id` is itself immutable.
4. **Selected ⇒ eligible:** `promotion_candidates.is_selected=true` requires linked `eligibility_assessment.overall_result ∈ {ELIGIBLE, SEALED_COVER}` (sealed cover kept sealed, not effected until cleared).
5. **Vacancy cap from establishment:** count of `is_selected=true` candidates ≤ `promotion_cases.vacancy_count`, and `vacancy_count` MUST equal the promotion-quota vacancies computed from the linked `sanctioned_posts` (not free-entered) (impr. #1; `VAL-G06-VACANCY-RECON`). Reserve list excluded from cap.
6. **Own-merit migration (impr. #3):** a `roster_points.status=FILLED` row links exactly one `filled_by_employee_id`; if the filling candidate `selected_on_own_merit=true`, the point's `adjusted_against_category` MUST be set to an **unreserved (GEN)** point and the candidate must occupy a UR point — a reserved point is **not** consumed. A reserved point cannot be filled by a non-matching category unless `DE_RESERVED`/`INTERCHANGED` with `dereservation_authority_ref`.
7. **Order references valid candidate:** a `REGULAR_PROMOTION`/`LDCE_PROMOTION` order requires `candidate_id` with `dpc_verdict=FIT` and `is_selected=true`.
8. **No self-adjudication:** an employee appearing in `promotion_candidates` for a case cannot be a `promotion_panel_members` member of that case's panel (must `RECUSED`). **Enforced by P02 SoD** (maker ≠ checker, multi-role intersection), not re-coded.
9. **SR posting completeness:** every `promotion_orders.status=EFFECTED`, `promotion_postings.status=JOINED`, `financial_upgradations.status=EFFECTED`, and `correction_events.cascade_status=COMPLETED` (with SR impact) must have a non-null `sr_event_id`/`sr_correction_event_id` (G12 append, idempotent on `source_reference_id`).
10. **MACP cap (CORRECTED — impr. #13):** at most **3 financial up-gradations** in a career across schemes. Regular promotions **reduce the remaining MACP entitlement** (and may reset the MACP clock per `clock_reset_date`); they do **not** form a combined `promotions + macp ≤ 3` cap. Formally: `count(financial_upgradations EFFECTED) ≤ 3`, and each regular promotion since the last up-gradation resets the qualifying clock.
11. **Probation arithmetic:** `scheduled_end = probation_start + probation_months`; declaration only when `status ∈ {ON_PROBATION, EXTENDED}` and the probation period has lapsed.
12. **Effective dates monotonic:** `promotion_orders.effective_date ≥ DPC approval date` unless `notional_date` recorded with authority reference (`VAL-EFFECTIVE`); see §5.8 for the date hierarchy.
13. **Soft delete:** statutory entities (orders, SR-linked, finalised lists, QSL snapshots, correction events) cannot be hard-deleted; only `SUPERSEDED`/`CANCELLED`/lineage with audit (Platform §8.2 — no hard delete platform-wide).
14. **Transactional writes:** select-list approval (candidates + proceedings + roster points + **P01 workflow advance**), order issue (order + **G12 SR event** + **X.2 notification**), MACP sanction (upgradation + order + SR event + **G10 pay event**), refusal processing (refusal + MACP-clock effect), and correction-event cascade (recompute + SR correction + **G10 pay-anomaly signal**) each execute in a single DB transaction; cross-service side effects (SR/notify/G10) use the **P01 idempotent-action + Idempotency-Key** contract so a retry produces one effect, not two.
15. **Sanctioned-strength consistency (impr. #1):** `filled_count ≤ sanctioned_strength`; `current_vacancies = sanctioned_strength − filled_count`; quota percentages sum ≤ 100 (`VAL-G06-QUOTA-SPLIT`); FR-012 posting validates the destination `to_sanctioned_post_id` has `current_vacancies > 0`.
16. **APAR-usability gate (impr. #2):** if `eligibility_rules.require_apar_communicated=true`, any below-benchmark/adverse APAR year used against an employee MUST have `apar_communicated=true` with `apar_representation_status ∈ {DISPOSED, NOT_APPLICABLE}`; otherwise `apar_usable=false` and that entry cannot be relied upon — the DPC verdict cannot record supersession citing an unusable entry. APAR facts are read from **G08** (not forked).
17. **Panel currency (impr. #11):** a promotion order can be generated only while `now ≤ promotion_panels.panel_valid_until`; an `EXPIRED` panel requires a `SUPPLEMENTARY_DPC`/`REVIEW_DPC` re-validation before further orders.
18. **Refusal consequence (impr. #12):** on `promotion_orders.acceptance_status=DECLINED`, a `promotion_refusals` row MUST be created with `debarment_until` and a `macp_clock_effect`; while `status=ACTIVE` the employee is barred from re-consideration before `next_consideration_after`, and the MACP engine applies the recorded clock effect.
19. **Increment ownership (impr. #18):** `increment_monitor` rows are **mirrors** keyed by `g10_increment_ref`; G06 never sets the authoritative release/withhold — it reflects **G10**. A row without `g10_increment_ref` is an alert-only projection.
20. **Sub-judice guard (impr. #5):** when a `legal_case_links` row with `interim_stay=true` is active on an entity, the entity transitions to `INTERIM_STAYED` and downstream effecting (order effect, finalisation, posting) is blocked until the stay is vacated or the case disposed (returns `PRECONDITION_FAILED`/`ENTITY_SUB_JUDICE`).
21. **Correction lineage (impr. #6):** any re-rank/recompute of a `FINALISED` list or `EFFECTED` order occurs only via a `correction_events` row (never silent edit); affected QSL snapshots are superseded (new `qsl_snapshot_id`), and `pay_anomaly_flag` triggers the **G10** stepping-up signal where a junior would draw more than a senior (impr. #7).

### 5.7 Sample data (2-3 rows per key entity)

> `tenant_id`/`entity_id` omitted from sample rows for brevity; present on every persisted row.

**sanctioned_posts**

| sanctioned_post_id | grade_designation_id | org_unit_id | sanctioned_strength | filled_count | promotion_quota_pct | current_vacancies | as_on_date | status |
|---|---|---|---|---|---|---|---|---|
| sp-SO-HO | desg-SO | org-HO | 60 | 48 | 67.00 | 12 | 2026-01-01 | ACTIVE |
| sp-US-HO | desg-US | org-HO | 20 | 15 | 50.00 | 5 | 2026-01-01 | ACTIVE |
| sp-ASO-R1 | desg-ASO | org-R1 | 100 | 100 | 0.00 | 0 | 2026-01-01 | ACTIVE |

**qualifying_service_ledger**

| qsl_snapshot_id | employee_id | grade_designation_id | as_of_date | gross_service_years | total_exclusion_days | net_qualifying_years | is_current |
|---|---|---|---|---|---|---|---|
| qsl-1001 | emp-1001 | desg-ASO | 2026-01-01 | 13.553 | 0 | 13.553 | true |
| qsl-2050 | emp-2050 | desg-ASO | 2026-03-01 | 10.211 | 75 | 10.006 | true |
| qsl-3300 | emp-3300 | desg-SO | 2026-01-01 | 9.118 | 182 | 8.620 | true |

**seniority_entries (multi-stream)**

| seniority_entry_id | seniority_list_id | employee_id | rank_position | recruitment_stream | quota_slot_label | reckoning_basis | reservation_category |
|---|---|---|---|---|---|---|---|
| se-001 | 5a1…01 | emp-1001 | 1 | DIRECT | DR-1 | DOJ_GRADE | GEN |
| se-002 | 5a1…01 | emp-1042 | 2 | PROMOTEE | PR-1 | REGULARISATION_DATE | SC |
| se-003 | 5a1…01 | emp-1110 | 3 | LDCE | LD-1 | EXAM_RESULT | OBC |

**eligibility_assessments (APAR-usability + certificate currency)**

| assessment_id | employee_id | qualifying_service_years | apar_pass | apar_communicated | apar_usable | obc_creamy_layer_status | overall_result |
|---|---|---|---|---|---|---|---|
| ea-1001 | emp-1001 | 13.55 | true | true | true | NA | ELIGIBLE |
| ea-1042 | emp-1042 | 13.55 | true | true | true | NA | SEALED_COVER |
| ea-1110 | emp-1110 | 12.20 | false | false | false | NON_CREAMY | NOT_ELIGIBLE |

**roster_points (own-merit migration)**

| roster_point_id | roster_id | point_number | reserved_for | status | filled_by_employee_id | adjusted_against_category |
|---|---|---|---|---|---|---|
| rp-01 | ros-01 | 1 | GEN | FILLED | emp-1001 | GEN |
| rp-07 | ros-01 | 7 | SC | CARRIED_FORWARD | null | null |
| rp-08 | ros-01 | 8 | OBC | FILLED | emp-1110 | GEN (own-merit: counted against UR, OBC point preserved) |

**legal_case_links**

| legal_case_link_id | linked_entity_type | case_reference | forum | interim_stay | subject_to_outcome | status |
|---|---|---|---|---|---|---|
| lcl-01 | PROMOTION_ORDER | OA 123/2026 | CAT | false | true | PENDING |
| lcl-02 | SENIORITY_LIST | WP(C) 4567/2026 | HIGH_COURT | true | false | INTERIM_STAYED |

**correction_events**

| correction_event_id | correction_no | reason_class | affected_entity_type | cascade_status | pay_anomaly_flag |
|---|---|---|---|---|---|
| ce-01 | COR/2026/001 | COURT_ORDER | SENIORITY_LIST | COMPLETED | true |
| ce-02 | COR/2026/002 | OBJECTION_UPHELD | SENIORITY_LIST | COMPLETED | false |

**promotion_refusals**

| refusal_id | order_id | employee_id | refusal_date | debarment_months | debarment_until | macp_clock_effect | status |
|---|---|---|---|---|---|---|---|
| rf-01 | ord-09 | emp-4100 | 2026-02-10 | 12 | 2027-02-09 | FORFEIT_NEXT | ACTIVE |

**financial_upgradations (cap corrected)**

| upgradation_id | employee_id | scheme | upgrade_level | regular_promotions_availed | qualifying_years_completed | due_date | status |
|---|---|---|---|---|---|---|---|
| fu-01 | emp-2050 | MACP | FIRST | 0 | 10.00 | 2026-03-01 | EFFECTED |
| fu-02 | emp-2090 | MACP | SECOND | 1 | 20.00 | 2026-06-15 | UNDER_SCREENING |

### 5.8 Reckoning Dates reference box (improvement #17)

Five dates govern this module. They are **distinct** and must never be conflated by an implementing agent.

| Date | Entity field | Definition | Governs |
|---|---|---|---|
| **as-on date** | `seniority_lists.as_on_date` | The date on which seniority position is reckoned for a list | Seniority ordering, eligibility-zone construction |
| **crucial date** | `promotion_cases.crucial_date` | The cut-off date on which eligibility (qualifying service, APAR window, certificate currency) is judged for a case | Eligibility computation, QSL `as_of_date`, creamy-layer/EWS currency |
| **panel / vacancy year** | `promotion_cases.vacancy_year`, `promotion_panels.panel_valid_*` | The DPC cycle the vacancies belong to and the panel's currency window | Vacancy attribution, panel validity, select-panel expiry |
| **effective date** | `promotion_orders.effective_date` | The date the promotion actually takes effect (pay + duties) | Pay fixation hand-off to G10, duties, increment timing |
| **notional date** | `promotion_orders.notional_date` | A date assigned for seniority/pay-step purposes without immediate arrears (e.g., on sealed-cover exoneration or court order) | Notional seniority, stepping-up, correction cascades |

**Worked relationship example.** Case `PROM/2026/ASO-SO/01`: `vacancy_year = 2026`; `crucial_date = 2026-01-01` (eligibility judged here; QSL computed `as_of 2026-01-01`); seniority list `as_on_date = 2026-01-01`; DPC held 2026-03-20 with `panel_valid_until = 2027-03-19`; order `effective_date = 2026-04-01` (staged via `JOB-G06-EFFDATE`). A sealed-cover candidate later exonerated (2026-11) is effected with `notional_date = 2026-04-01` (seniority preserved) but arrears only if separately sanctioned — and a `correction_event` re-ranks juniors promoted ahead, raising a G10 stepping-up signal if any junior now draws more.

---

## Section 6 — Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. FRs retain stable `FR-PPP-NNN` ids; the owning module is **G06**. **Platform grounding** is woven into each FR: maker-checker/DPC/approval flows run on **P01**, authz/field-mask via **P02**, audit via **P05**, SR writes to **G12**, notifications via **X.2**, jobs on **X.1**, migration via **P06**; cross-module reads are by reference (G08 APAR, G09 vigilance) and never forked.

---

### FR-PPP-001 — Cadre-wise Seniority List Generation (multi-stream aware)

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment/Seniority Officer (maker), Appointing Authority (checker, P01 approver)
- **User Story:** As an Establishment Officer, I want to generate a cadre/grade-scoped seniority list reckoned on a chosen date — correctly merging direct recruits, promotees and LDCE qualifiers under the applicable rota-quota — so that promotions and eligibility zones rest on a defensible combined seniority order.
- **Description:** System assembles all employees in a feeder grade within scope (from the **G01** employee + org/grade masters), tags each with `recruitment_stream`, computes a provisional rank using a configurable reckoning basis, applies tie-breakers, and where the grade is multi-stream applies the `seniority_quota_rules` rota-quota rotation (see FR-020) to interleave streams, tags reservation category, and produces a `DRAFT` list.

**Acceptance Criteria**
1. Given a cadre + grade + as-on date, the system lists every active employee in that feeder grade within org scope (P02 scope filter), each tagged with `recruitment_stream`.
2. Ranks are contiguous (1..N) with no duplicates or gaps.
3. When `is_multi_stream=true`, ranks follow the linked `quota_rule_id` rotation; each entry records its `quota_slot_label` and `rotation_cycle_no`.
4. Tie-breaks apply deterministically and the applied basis is recorded per entry.
5. The draft is editable until publication; every manual rank override is captured by the **P05** audit trigger with a reason.
6. Reservation category is populated from G01 and shown per entry.

**Business Rules**
- Reckoning basis precedence and tie-break order are configuration (config cascade Platform §0.3), not code.
- Multi-stream rotation uses the rota-quota rule effective on `as_on_date`; unfilled quota slots carry forward per the rule.
- Officers on deputation/long leave are included with a status flag but retain seniority position.
- An employee may appear in exactly one active list per scope.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | Create draft header (`is_multi_stream`, `quota_rule_id`) |
| `seniority_entries` | Ranked rows (stream/quota fields) |
| `seniority_quota_rules` | Rota-quota rotation (FR-020) |
| `employees`, `designations`, `cadres` (G01 masters) | Source population |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists` | Create + auto-generate entries (`Idempotency-Key`) |
| GET | `/api/v1/seniority-lists/{id}` | Fetch list + entries (cursor pagination) |
| PATCH | `/api/v1/seniority-lists/{id}/entries/{entryId}` | Manual rank override (audited by P05) |

**UI Behavior Notes:** Wizard (scope → basis → stream/quota → preview ranked grid) — a **W.2 form** with `VAL-*` bindings. Stream column with colour legend; rotation-slot badge; drag-to-reorder with mandatory reason modal (`VAL-COMMENT`); export to PDF preview. Canonical UI states (empty/loading/error/no-permission/partial) per Foundation §3.

**Edge Cases:** identical DOJ and DOB (fall to next tie-break); employee with grade entry date missing (flagged, excluded until resolved); retro-regularisation altering position; quota slot exhausted in a stream (carry-forward per rule); single-stream grade (rotation skipped).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityListController`, `SeniorityComputationService`, `RotaQuotaResolver`, `TieBreakResolver`, `SeniorityRepository` |
| Backend Flow | Validate scope → query feeder-grade population from G01 → tag streams → apply reckoning basis → if multi-stream apply rota-quota rotation → resolve ties → assign 1..N → persist header+entries in one tx |
| Data Operations | INSERT `seniority_lists` (DRAFT); bulk INSERT `seniority_entries`; **P05 trigger** auto-audits each |
| Validation | Scope exists; as-on date not future beyond config (`VAL-DATE`); population non-empty; quota rule active if multi-stream |
| Authorization | `Authorization.check` action `seniority.list.create` + org-unit scope (P02) |
| State Changes & Side Effects | List → DRAFT; P05 audit rows; no SR posting |
| Failure Handling | Missing grade-entry date → partial result with `flagged_entries[]`; tx rollback on any constraint breach |
| Dependencies | G01 master data; FR-020 quota rules |
| Test Guidance | tie-break determinism; rota-quota rotation vector (Appendix D.4); contiguous-rank invariant; override audit |

---

### FR-PPP-002 — Tentative Seniority Publication, Objections & Finalisation

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment Officer, Employee (objector), Appointing Authority (checker, P01)
- **User Story:** As an employee, I want to view the tentative seniority list and file objections within the statutory window so that errors are corrected before the list is finalised.
- **Description:** Publishes a draft as `PUBLISHED_TENTATIVE` via a **P01 maker-checker flow**, opens a configurable objection window, lets in-scope employees file objections (including `STREAM_QUOTA_ERROR`) through a **W.2 form**, routes for disposal, applies upheld corrections via the correction-lineage path (FR-018) when post-finalisation, then finalises (`FINALISED`) and notifies via **X.2** with a notified PDF stored in **G13**.

**Acceptance Criteria**
1. Publication requires checker approval via the **P01** workflow and freezes the entry set as the tentative baseline.
2. Objections accepted only within `[objection_window_start, objection_window_end]`; late ones marked `TIME_BARRED` unless condoned (`ERR-PAST-DATED`).
3. Each objection has a recorded disposal (UPHELD/REJECTED/PARTIALLY_UPHELD) with remarks; objector is notified (X.2).
4. Upheld objections trigger a re-rank that preserves contiguity and is fully audited (P05); post-finalisation re-ranks route through a `correction_event` (FR-018).
5. Finalisation supersedes any prior final list for the scope and produces a notified PDF stored in G13 (via W.1 Document-Generation stage).

**Business Rules**
- Objections after window close are auto-`TIME_BARRED` unless an authority grants condonation.
- Finalisation blocked while any objection is `SUBMITTED`/`UNDER_REVIEW`, or while the list is `INTERIM_STAYED` (sub-judice, §5.6-20).
- A finalised list is corrected only via a fresh superseding list or a `correction_event`.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | status transitions (incl. UNDER_CORRECTION) |
| `seniority_objections` | objection lifecycle |
| `seniority_entries` | re-rank on upheld |
| `correction_events` | post-finalisation re-rank |
| `documents` (G13), `notifications` (X.2), `workflow_instances` (P01) | publish/notify/approve |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists/{id}/publish` | Publish tentative (P01 checker) |
| POST | `/api/v1/seniority-lists/{id}/objections` | File objection |
| POST | `/api/v1/objections/{id}/dispose` | Dispose objection |
| POST | `/api/v1/seniority-lists/{id}/finalise` | Finalise list |

**UI Behavior Notes:** Employee sees own position highlighted; "File Objection" CTA active only in window; officer Kanban of objections by status; finalise button gated with pre-flight checklist (open objections, sub-judice stay).

**Edge Cases:** mass objections on same entry; upheld objection cascading multiple rank shifts; condonation of late objection; concurrent finalise attempts (P01 idempotent lock + `Idempotency-Key`); list under interim stay (finalise blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityPublishService`, `ObjectionService`, `ReRankService`, `CorrectionGateway`, `WorkflowClient(P01)` |
| Backend Flow | publish→P01 checker task→PUBLISHED_TENTATIVE; objection submit→validate window→W.2 form; dispose→if upheld call ReRank (or CorrectionEvent if finalised); finalise→guard open objections + stay→supersede prior→generate PDF→notify (X.2) |
| Data Operations | UPDATE list status; INSERT/UPDATE objections; UPDATE entries on re-rank (tx); INSERT document (G13), notifications (X.2) |
| Validation | window dates; objector in scope; no open objections at finalise; not INTERIM_STAYED |
| Authorization | publish/finalise: checker (P01 `DYNAMIC_APPROVER`); objection: self; dispose: establishment |
| State Changes & Side Effects | DRAFT→PUBLISHED_TENTATIVE→OBJECTIONS_OPEN/CLOSED→FINALISED→(prior SUPERSEDED); UNDER_CORRECTION via FR-018 |
| Failure Handling | late objection → `OBJECTION_WINDOW_CLOSED`; finalise with open objections → `OBJECTIONS_PENDING`; stayed → `ENTITY_SUB_JUDICE`; PDF gen failure → rollback |
| Dependencies | G13, X.2, P01, FR-018 |
| Test Guidance | window boundary; re-rank contiguity; supersede single-active invariant; sub-judice block |

---

### FR-PPP-003 — Configurable Eligibility Rule Engine & Computation (APAR-usability + certificate currency)

- **Module:** PPP-ELG
- **Primary Role(s):** System Administrator (rule config), HR Promotion Officer (run), Vigilance Officer (attest)
- **User Story:** As an HR Officer, I want the system to compute each employee's promotion eligibility against configured rules — citing the single qualifying-service ledger, honouring the APAR-communication (Dev Dutt) gate, and validating certificate currency — so that the eligible field is objective, explainable, and audit-proof.
- **Description:** Evaluates qualifying service (cited from `qualifying_service_ledger`, FR-016), APAR benchmark **and usability** (read by reference from **G08** incl. communication/representation status), vigilance/disciplinary status (**G09**), mandatory qualification / LDCE exam result, OBC creamy-layer & EWS certificate currency on the crucial date, and roster applicability, producing an `eligibility_assessments` record with overall result, an explainable `rule_trace_json`, and itemised pass/fail reasons. The APAR/disciplinary/category PII concentration is **P02 field-masked on serialization**.

**Acceptance Criteria**
1. Qualifying service is **not recomputed here** — it is cited from the current `qualifying_service_ledger` snapshot for the employee/grade as of `crucial_date` (`qsl_snapshot_id`).
2. APAR pass = at least `apar_min_count_meeting_benchmark` of last `apar_lookback_years` meet `apar_benchmark`, counting only **usable** entries (APAR read from G08).
3. **APAR-usability gate (impr. #2):** an adverse/below-benchmark entry with `apar_communicated=false` or `apar_representation_status=PENDING` is marked `apar_usable=false` and **cannot be relied on**; the trace records this.
4. **Certificate currency (impr. #16):** for reserved candidates, `obc_creamy_layer_status` and `ews_cert_valid_on_crucial_date` are validated as of `crucial_date`; expired/creamy ⇒ category benefit not applied (reason code recorded).
5. **LDCE channel (impr. #14):** when `eligibility_rules.requires_exam_pass=true`, a linked `exam_results.result=PASS` (current) is required; else `EXAM_NOT_PASSED`.
6. Pending disciplinary charge ⇒ `SEALED_COVER`; current penalty ⇒ `NOT_ELIGIBLE` (per rule flags). Every assessment stores an explainable reason set. Re-running re-computes only `DRAFT`/`FIELD_ASSEMBLED` cases; frozen post `DPC_HELD`.

**Business Rules**
- Rules are version-effective-dated (config cascade); the rule effective on `crucial_date` applies.
- Missing APAR years treated per policy (counted as below-benchmark or as gap-blocking alert).
- Vigilance "not cleared" overrides APAR pass.
- The APAR snapshot (`apar_detail_json`) is **P02 field-masked PII** with an explicit `apar_snapshot_retention_until` (§10.2); purge via `JOB-G06-APAR-PURGE`.

**Data Model References**

| Entity | Use |
|---|---|
| `eligibility_rules` | rule definition (channel, exam, cert-currency flags) |
| `eligibility_assessments` | computed result (usability, cert, exam fields) |
| `qualifying_service_ledger` | cited service fact (FR-016) |
| `exam_results` | LDCE gate |
| `employees` (G01), APAR (G08), disciplinary (G09) | inputs (by reference) |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{caseId}/compute-eligibility` | Batch compute (async; progress) |
| GET | `/api/v1/employees/{id}/eligibility?caseId=` | Single assessment (P02 field-masked) |
| GET/POST/PUT | `/api/v1/eligibility-rules` | Manage rules |

**UI Behavior Notes:** Eligibility grid with green/amber/red per criterion; hover tooltip shows rule trace incl. **APAR-usability** decision; sealed-cover candidates badged; certificate-currency chip; LDCE exam chip; bulk "explain" export. APAR detail panel visible only to **P02 field-authorised roles** (others see masked placeholder per Foundation §3 partial-data state).

**Edge Cases:** APAR API timeout (assessment `PENDING`, retried via X.3 circuit-breaker); uncommunicated adverse APAR relied upon by mistake (blocked); EWS certificate expired one day before crucial date (benefit withdrawn); LDCE result `AWAITED` (PROVISIONALLY_ELIGIBLE pending result); rule changed mid-cycle (snapshot rule used).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `EligibilityEngine`, `QualifyingServiceLedgerGateway` (FR-016), `AparGateway(G08)`, `DisciplinaryGateway(G09)`, `CertificateCurrencyService`, `ExamResultGateway`, `RuleResolver` |
| Backend Flow | resolve effective rule → cite current QSL snapshot → fetch APAR from G08 (grade + communication status) → apply usability gate → fetch disciplinary from G09 → validate cert currency + exam → evaluate gates → derive overall_result + reasons + trace → upsert assessment |
| Data Operations | UPSERT `eligibility_assessments` (snapshot JSON, retention date); P05 audit |
| Validation | case pre-DPC; rule active on crucial_date; QSL snapshot current |
| Authorization | `eligibility.compute`; APAR detail = P02 field-level role; rule mgmt = Sys Admin |
| State Changes & Side Effects | case → ELIGIBILITY_DONE when all assessed; may raise `APAR_GAP_BLOCKING` alerts (X.2) |
| Failure Handling | G08/G09 down → `PRECONDITION_FAILED`/`INTERNAL` via X.3 mapping (no 503), partial save PENDING, retry; uncommunicated adverse → `APAR_NOT_USABLE` reason |
| Dependencies | FR-016, G08, G09, eligibility rules, exam_results |
| Test Guidance | benchmark counting on usable-only; Dev Dutt gate; cert-currency boundary; LDCE gate; effective-dated rule selection |

---

### FR-PPP-004 — Promotion Case Creation & Eligible-Field Assembly (vacancy from establishment; zone formula pinned)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer
- **User Story:** As an HR Officer, I want to create a promotion case whose vacancy count is derived from the sanctioned-post register and assemble the zone of consideration using the pinned DoPT slab so that the DPC evaluates the correct field.
- **Description:** Creates a `promotion_cases` record with `vacancy_count` **derived and validated from the linked `sanctioned_posts`** (promotion-quota vacancies + anticipated + carried-forward), computes the zone of consideration using the pinned non-linear slab (Appendix D.1) with reserved-category extended zone, pulls candidates from the final seniority list, links eligibility assessments, and marks zone bands.

**Acceptance Criteria**
1. Case requires a finalised seniority list for the feeder grade/scope **and** a linked `sanctioned_posts` row.
2. `vacancy_count` equals the computed promotion-quota vacancies from `sanctioned_posts`; manual override requires authority and is audited (`VAL-G06-VACANCY-RECON`).
3. Zone of consideration computed from the pinned slab (Appendix D.1), not a flat multiplier; reserved-category extended zone applied where roster requires.
4. Candidates ordered by seniority; each links to its eligibility assessment.
5. Case status advances DRAFT → FIELD_ASSEMBLED → ELIGIBILITY_DONE.

**Business Rules**
- Vacancy count must reconcile to `sanctioned_posts.current_vacancies` (promotion quota) (impr. #1); a mismatch blocks assembly.
- Zone slab and extended-zone rules are configurable but **pinned to a worked example** (Appendix D.1).
- Out-of-zone candidates retained for audit but not placed before DPC unless zone extended with authority.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_cases`, `promotion_candidates` | case + field |
| `sanctioned_posts` | vacancy source |
| `seniority_lists`/`seniority_entries` | source ordering |
| `eligibility_assessments` | linkage |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases` | Create case (vacancy validated vs sanctioned_posts; `Idempotency-Key`) |
| POST | `/api/v1/promotion-cases/{id}/assemble-field` | Build candidate field |
| GET | `/api/v1/promotion-cases/{id}/candidates` | List candidates (cursor) |

**UI Behavior Notes:** Case header with vacancy card sourced from sanctioned-strength (sanctioned/filled/vacant); zone summary; candidate table with zone band colouring and eligibility chips; "Assemble Field" preview of in/out of zone.

**Edge Cases:** vacancy figure mismatched with establishment (blocked, `VACANCY_NOT_RECONCILED`); insufficient eligible candidates (under-fill warning); tied seniority at zone boundary (include both); reserved vacancies exceed eligible reserved candidates (carry-forward trigger).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PromotionCaseService`, `VacancyReconciler(sanctioned_posts)`, `ZoneCalculator`, `CandidateAssembler` |
| Backend Flow | create case → reconcile vacancy vs sanctioned_posts → fetch final seniority list → compute zone via pinned slab → select top-N (+ extended) → create candidates → link eligibility → set status |
| Data Operations | INSERT case; bulk INSERT candidates; P05 audit |
| Validation | final list exists; sanctioned_posts linked; vacancy reconciles; rule present |
| Authorization | `promotion.case.create` + scope (P02) |
| State Changes & Side Effects | case status transitions; may flag under-fill |
| Failure Handling | no final list → `SENIORITY_LIST_NOT_FINAL`; vacancy mismatch → `VACANCY_NOT_RECONCILED`; empty field → `NO_ELIGIBLE_CANDIDATES` |
| Dependencies | FR-001/002, FR-003, FR-015 (sanctioned_posts) |
| Test Guidance | zone slab vectors (Appendix D.1); vacancy reconciliation; boundary tie inclusion; extended-zone reserved logic |

---

### FR-PPP-005 — DPC / Promotion Panel Constitution & Proceedings (with panel currency; committee-as-P01-workflow)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer (constitute), DPC Secretary, DPC Members, Appointing Authority (approve)
- **User Story:** As a DPC Secretary, I want to constitute the committee with a defined validity window, record attendance/quorum, capture each candidate's fitness verdict against the benchmark (using only usable APAR), and compile a select list so that the promotion decision is statutorily valid and not issued from a stale panel.
- **Description:** Constitutes a `promotion_panels` as a **P01 workflow instance** (committee-as-workflow; Platform §P01, §W.1) with members resolved as **`PARALLEL_ALL_OF`** approver branches and a `panel_valid_from`/`panel_valid_until` window, records `dpc_proceedings`, captures per-candidate `dpc_verdict` (supersession cannot cite an unusable APAR entry), builds select/reserve/sealed-cover lists, and routes for **appointing-authority approval as a `DYNAMIC_APPROVER` stage**. Supports `SUPPLEMENTARY_DPC`/`REVIEW_DPC` for missed/sealed candidates. **SoD (candidate ≠ member, maker ≠ checker) enforced by P02.**

**Acceptance Criteria**
1. Panel constitution validates quorum config and conflict-of-interest recusal (candidate cannot be member — P02 SoD).
2. Panel records `panel_valid_from`/`panel_valid_until`; orders cannot be generated after expiry without a supplementary/review DPC (impr. #11).
3. Each in-zone candidate receives a verdict (member approvals joined via `PARALLEL_ALL_OF`); sealed-cover candidates flagged and excluded from effected select list; **supersession citing an unusable APAR entry is blocked** (impr. #2).
4. Select-list count ≤ vacancy count; reserve list ordered.
5. Approval by appointing authority is a **P01 checker step** distinct from the secretary/maker.

**Business Rules**
- Quorum must be met for a valid sitting; otherwise meeting recorded as adjourned.
- Benchmark applied must match the rule's `apar_benchmark` unless an authority records a deviation.
- Supersession (placing a junior above a senior) requires recorded reasons **and** only usable APAR material.
- An expired panel (`status=EXPIRED`) blocks order generation (integrity rule §5.6-17).
- The DPC flow is a **configured W.1 flow definition** executed by P01; in-flight panels run the pinned definition version (Platform §P01).

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_panels`, `promotion_panel_members` | committee + currency (+ `workflow_instance_id`) |
| `dpc_proceedings` | meeting record |
| `promotion_candidates` | verdict + select rank |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/panels` | Constitute panel (with validity; starts P01 instance) |
| POST | `/api/v1/panels/{id}/proceedings` | Record proceedings |
| PATCH | `/api/v1/candidates/{id}/verdict` | Set candidate verdict (P01 member action, idempotent) |
| POST | `/api/v1/promotion-cases/{id}/select-list/approve` | Approve select list (P01 checker) |
| POST | `/api/v1/promotion-cases/{id}/supplementary-dpc` | Constitute supplementary/review DPC |

**UI Behavior Notes:** Panel builder with recusal warnings and validity-window picker; live quorum indicator; panel-currency countdown; verdict grid with benchmark reference and APAR-usability lock on superseded entries; minutes upload (G13); select-list approval with vacancy/roster reconciliation panel. Uses the **P01 approval action bar** (approve/reject/send-back/delegate) per Foundation §3.

**Edge Cases:** member recuses mid-meeting dropping below quorum; benchmark deviation; supersession blocked by unusable APAR; panel expiring before orders issued (supplementary DPC); sealed-cover candidate later cleared (FR-008).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PanelService`, `PanelCurrencyService`, `ProceedingsService`, `VerdictService`, `SelectListBuilder`, `WorkflowClient(P01)` |
| Backend Flow | constitute → `WorkflowEngine.startInstance({workflow_code:'G06_DPC', ...})` (PARALLEL_ALL_OF members + DYNAMIC_APPROVER authority) → validate recusal/quorum → record proceedings → capture verdicts (usability lock) → build lists → checker approval → set SELECT_LIST_APPROVED |
| Data Operations | INSERT panel + members + proceedings; UPDATE candidates verdict/rank/is_selected (tx); INSERT minutes document (G13); P01 `workflow_actions` rows |
| Validation | quorum; no candidate-as-member (P02 SoD); select count ≤ vacancies; panel not expired; APAR usable for supersession |
| Authorization | constitute: HR; verdict: members (P01); approve: appointing authority (P01) |
| State Changes & Side Effects | case → DPC_HELD → SELECT_LIST_APPROVED; roster points provisionally tagged (FR-006); P05 audit |
| Failure Handling | quorum fail → `QUORUM_NOT_MET`; conflict → `PANEL_CONFLICT_OF_INTEREST`; over-selection → `VACANCY_EXCEEDED`; expired → `PANEL_EXPIRED`; unusable APAR supersession → `APAR_NOT_USABLE`; duplicate start → `ERR-DUP-INSTANCE` (409) |
| Dependencies | FR-004 field, FR-006 roster, P01, G13 |
| Test Guidance | quorum/recusal; select-cap; panel-currency expiry block; supersession requires usable APAR; maker≠checker (P02); PARALLEL_ALL_OF join |

---

### FR-PPP-006 — Reservation Roster Management & Compliance (own-merit migration; enabling justification)

- **Module:** PPP-ROS
- **Primary Role(s):** Reservation/Roster Officer (maker), Appointing Authority (checker, P01)
- **User Story:** As a Roster Officer, I want to maintain the reservation roster, correctly migrate own-merit reserved candidates to unreserved points, hold the Nagaraj enabling justification, and validate compliance so that reservation policy is demonstrably and defensibly applied.
- **Description:** Maintains `reservation_rosters` (with `enabling_provision_ref`, `quantifiable_data_doc_id` in G13, `consequential_seniority_mode`, `roster_applicable`) and `roster_points`, assigns selected candidates to points by category, **migrates own-merit reserved candidates to unreserved points** (`adjusted_against_category=GEN`, reserved point preserved), handles carry-forward and de-reservation/interchange with authority (P01 checker), and produces a compliance report itemising own-merit migrations and recomputed category tallies.

**Acceptance Criteria**
1. Each selected candidate maps to a roster point matching their category, or — if `selected_on_own_merit=true` — to an **unreserved** point with `adjusted_against_category=GEN`, leaving the reserved point un-consumed (impr. #3).
2. Unfilled reserved points are carried forward (linked) rather than silently dropped; de-reservation requires `dereservation_authority_ref`.
3. Compliance report shows points filled vs. due per category, **itemises own-merit migrations**, and flags deviations and 50%-ceiling/PwBD-horizontal breaches.
4. Roster carries the enabling-provision reference and quantifiable-data document for reservation-in-promotion (Nagaraj/Jarnail); `consequential_seniority_mode` recorded (impr. #15).
5. Roster point cannot be double-filled; grades with `roster_applicable=false` (single-post cadre) are exempt.

**Business Rules**
- Reservation percentages and cycle size are policy configuration (config cascade); own-merit candidates **never** consume reserved points.
- Backlog/carry-forward vacancies prioritised before fresh points; de-reservation only after the policy carry-forward limit.
- PwBD horizontal reservation interpolated across categories per policy.
- Consequential seniority vs catch-up applied per `consequential_seniority_mode` for accelerated reserved promotions.

**Data Model References**

| Entity | Use |
|---|---|
| `reservation_rosters` | register + enabling justification + consequential mode |
| `roster_points` | filling + own-merit `adjusted_against_category` |
| `promotion_candidates` | own-merit flag |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/rosters` | Create roster (with justification) |
| POST | `/api/v1/rosters/{id}/points/{pointId}/fill` | Fill point (own-merit aware) |
| POST | `/api/v1/rosters/{id}/points/{pointId}/de-reserve` | De-reserve/interchange (P01 checker) |
| GET | `/api/v1/promotion-cases/{id}/roster-compliance` | Compliance report (with migrations) |

**UI Behavior Notes:** 100/200-point roster grid with category legend; filled/vacant/carried-forward/de-reserved states; **own-merit migration indicator** (reserved point shown preserved); compliance panel with category tallies, migration list and deviation flags; de-reserve modal with mandatory authority; enabling-justification upload (G13).

**Edge Cases:** reserved candidate tops UR merit (migrated to UR, reserved point preserved — the canonical N.R. Parmar/own-merit case); no eligible reserved candidate (carry-forward then possible de-reservation); SC/ST interchange; EWS overlap; over-reservation breaching 50% ceiling (warning); single-post cadre (roster exempt).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `RosterService`, `OwnMeritMigrationEngine`, `RosterComplianceCalculator`, `CarryForwardEngine` |
| Backend Flow | on select-list approval → for each selected: if own-merit → assign UR point + set adjusted_against_category=GEN; else match category point → carry forward unfilled reserved → emit compliance report with migration tallies |
| Data Operations | UPDATE roster_points (FILLED/CARRIED_FORWARD/DE_RESERVED, adjusted_against_category) in tx; P05 audit |
| Validation | category match or own-merit migration; no double-fill; ceiling checks; roster_applicable |
| Authorization | fill: roster officer; de-reserve: checker (P01/P02) |
| State Changes & Side Effects | roster points status; compliance artefact; P05 audit |
| Failure Handling | double-fill → `ROSTER_POINT_OCCUPIED`; category mismatch → `ROSTER_CATEGORY_MISMATCH`; own-merit on reserved point → `OWN_MERIT_MIGRATION_REQUIRED` |
| Dependencies | FR-005 select list |
| Test Guidance | own-merit migration vector (Appendix D.2); carry-forward linkage; ceiling warning; interchange authority; reserved-point preservation tally |

---

### FR-PPP-007 — Promotion Order Generation, Acceptance, Refusal & SR Posting

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer (maker), Appointing Authority (checker, P01)
- **User Story:** As an HR Officer, I want to generate promotion orders for selected candidates, capture acceptance or refusal (triggering refusal consequences), optionally mark an order "subject to litigation outcome", and post to the Digital SR so that the promotion is legally effected and permanently recorded.
- **Description:** Generates `promotion_orders` from approved select-list candidates (only while the panel is current), produces the order document via the **W.1 Document-Generation stage** into **G13**, captures acceptance/decline (declined → FR-019 refusal consequence; non-response → `DEEMED_ACCEPTED`), supports `subject_to_litigation`, transitions to `EFFECTED`, and writes an idempotent **SR event to G12** — transactionally. Order issue is a **P01 maker-checker flow**.

**Acceptance Criteria**
1. Orders generate only for `is_selected=true, dpc_verdict=FIT` candidates **and** while `panel_valid_until` not passed (impr. #11).
2. Each order carries from/to designation + pay scale, effective (and optional notional) date; `subject_to_litigation` may be set with a linked `legal_case_links` row (impr. #5).
3. Acceptance window enforced; non-response ⇒ `DEEMED_ACCEPTED`; **decline ⇒ a `promotion_refusals` row is created (FR-019)** with debarment + MACP-clock effect (impr. #12).
4. On `EFFECTED`, an **SR `PROMOTION` event is posted** via the canonical **`POST /api/v1/sr/ingest`** with `sr_event_id` stored — dedup tuple `(source_module="G06", source_reference_id=order_id, source_event_version)`, mandatory `fact_key` + explicit `tenant_id`/`entity_id` (§9.7.1). This is the **establishment** event only; the **pay-fixation SR event (`PAY_FIXATION`) is G10's**, not G06's. `employees.designation_id` update signalled to **G01**.
5. Order issue + SR posting + notification occur in one transaction; partial failure rolls back. An order under interim stay goes `INTERIM_STAYED`, not `EFFECTED`.

**Business Rules**
- A declined promotion records consequences (FR-019); the next reserve-list candidate may be considered per policy.
- Notional dates require authority reference; affect seniority, not arrears unless sanctioned.
- Order numbering is gap-free per series.
- An order cannot be `EFFECTED` while a linked `legal_case_links.interim_stay=true` is active.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_orders` | order record |
| `promotion_candidates` | source |
| `promotion_refusals` | on decline (FR-019) |
| `legal_case_links` | subject-to-outcome / stay |
| `service_register_events` (G12), `documents` (G13), `notifications` (X.2) | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/orders/generate` | Bulk-generate orders (`Idempotency-Key`) |
| POST | `/api/v1/orders/{id}/accept` | Record acceptance |
| POST | `/api/v1/orders/{id}/decline` | Record refusal (→ FR-019) |
| POST | `/api/v1/orders/{id}/effect` | Effect + SR `PROMOTION` post (façade relays to `POST /api/v1/sr/ingest`) |
| GET | `/api/v1/orders/{id}` | Fetch order |

**UI Behavior Notes:** Batch generation with preview and panel-currency check; per-order status chips; acceptance/decline capture; "subject to litigation" toggle linking a court case; "Effect & Post to SR" shows SR confirmation; declined orders surface refusal-consequence summary and reserve-list suggestion.

**Edge Cases:** SR (G12) unavailable at effect (held in `ISSUED`, retried, not falsely EFFECTED); duplicate effect (idempotent on SR key + `Idempotency-Key`); candidate retires/dies between selection and order (cancelled, no SR); panel expired before generation (blocked); interim stay arrives mid-process (order → INTERIM_STAYED).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OrderService`, `OrderNumberGenerator`, `PanelCurrencyGuard`, `RefusalService(FR-019)`, `SrPostingGateway(G12)`, `EmployeeUpdateGateway(G01)`, `DocumentService(G13)`, `WorkflowClient(P01)` |
| Backend Flow | generate (validate selected + panel current) → render document (W.1) → P01 checker issue → acceptance/decline (decline→RefusalService) → effect: tx{order EFFECTED, post SR to G12 idempotent key=order_id, notify (X.2), signal G01} |
| Data Operations | INSERT orders; UPDATE acceptance/status; INSERT document (G13); INSERT service_register_events (G12); INSERT promotion_refusals on decline; P05 audit |
| Validation | candidate selected+FIT; panel current; effective ≥ approval date; series continuity; no active stay |
| Authorization | generate: HR; effect/issue: appointing authority (P01) |
| State Changes & Side Effects | DRAFT→ISSUED→(ACCEPTED/DEEMED/DECLINED)→EFFECTED / INTERIM_STAYED; SR posted (G12); G01 update; probation auto-created (FR-009); refusal consequence (FR-019) |
| Failure Handling | SR down → keep ISSUED, `PRECONDITION_FAILED`, retry; stay active → `ENTITY_SUB_JUDICE`; panel expired → `PANEL_EXPIRED`; rollback on any failure |
| Dependencies | FR-005/006/019, G12, G13, G01 |
| Test Guidance | idempotent SR posting; deemed-acceptance timer; decline→refusal wiring; rollback on SR failure; series gap-free; stay block |

---

### FR-PPP-008 — Sealed Cover Handling & Deferred/Review DPC (event-driven; periodic-review SLA)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer, Vigilance Officer, Appointing Authority
- **User Story:** As an HR Officer, I want to keep promotion recommendations of employees with pending disciplinary/vigilance proceedings in a sealed cover, be reminded to review it on an SLA, and open it on G09 case conclusion so that due process is honoured.
- **Description:** When eligibility yields `SEALED_COVER`, the DPC assesses fitness but the recommendation is sealed; the post is filled provisionally/kept vacant; the system **subscribes to G09 conclusion events** (via X.3/event subscription; degrading to scheduled reconciliation `JOB-G06-SEALED-RECONCILE` if only status read is available — impr. #19) and enforces a **maximum-age / periodic-review SLA**; on conclusion a Review DPC effects (with notional date) or supersedes — including a **partially-upheld minor-penalty branch** (impr. #20). Sealed-cover data is **P02 field-restricted**.

**Acceptance Criteria**
1. Sealed-cover candidates flagged; verdict recorded but not effected; visible only to authorised roles (P02 field-level).
2. The system tracks the linked G09 case via **event subscription**, with scheduled reconciliation fallback (X.1), and raises `SEALED_COVER_REVIEW_DUE` alerts on the periodic-review SLA (e.g., 2-yearly) (impr. #19).
3. On exoneration, a Review DPC effects the promotion with notional date preserving seniority (and triggers correction cascade if juniors were promoted ahead — FR-018).
4. On major penalty, supersession/deferral per policy; on **partially-upheld minor penalty**, a defined branch decides effect-with-conditions vs deferral, audited (impr. #20).
5. Sealed cover cannot remain open indefinitely; the SLA forces periodic review.

**Business Rules**
- Notional promotion on exoneration carries arrears only if separately sanctioned.
- Minor-penalty branch outcome is policy-configured (effect / defer / supersede).
- G09 dependency is an **event** by contract; if unavailable, a nightly reconcile job (X.1) polls status (§16.3).

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_candidates` (dpc_verdict=SEALED_COVER) | sealed record |
| `eligibility_assessments` (SEALED_COVER) | source |
| `promotion_orders` (notional_date) | on opening |
| `correction_events` | cascade on late exoneration |
| `progression_alerts` (SEALED_COVER_REVIEW_DUE) | SLA reminders (X.2) |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/sealed-covers?status=open` | List sealed covers (P02-restricted) |
| POST | `/api/v1/sealed-covers/{candidateId}/review` | Open cover via Review DPC |
| POST | `/api/v1/sealed-covers/{candidateId}/minor-penalty-decision` | Partially-upheld branch |

**UI Behavior Notes:** Restricted "Sealed Covers" workspace (Admin workspace, P02-gated); linked disciplinary case status badge; review-due SLA countdown; review action gated until G09 conclusion; notional-date input; minor-penalty decision modal.

**Edge Cases:** disciplinary case partially upheld → minor-penalty branch; employee retires while sealed (flagged to G11); multiple sealed covers across cycles; G09 event missing → reconcile + SLA alert; late exoneration → correction cascade (FR-018).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SealedCoverService`, `DisciplinaryEventSubscriber(G09 via X.3)`, `ReconcileScheduler(JOB-G06-SEALED-RECONCILE)`, `ReviewDpcService`, `SealedCoverSlaMonitor` |
| Backend Flow | on SEALED_COVER → mark sealed → subscribe G09 conclusion (or schedule reconcile) → SLA monitor raises review-due → on signal → Review DPC (P01) → effect (notional) / supersede / minor-penalty branch → correction cascade if needed |
| Data Operations | UPDATE candidate/verdict; INSERT order on opening; INSERT alerts; P05 audit; SR post (G12) if effected |
| Validation | G09 concluded before opening; authority for notional date |
| Authorization | restricted to vigilance/appointing roles (P02 field-level) |
| State Changes & Side Effects | sealed→opened→(EFFECTED notional / SUPERSEDED / EFFECTED_WITH_CONDITION); reminders (X.2); cascade |
| Failure Handling | premature open → `SEALED_COVER_NOT_REVIEWABLE`; G09 event missing → reconcile + `SEALED_COVER_REVIEW_DUE` alert |
| Dependencies | G09 (event + status), FR-005, FR-007, FR-018 |
| Test Guidance | exoneration notional path; major vs minor penalty branch; SLA reminder; event→poll degradation; late-exoneration cascade |

---

### FR-PPP-009 — Probation Lifecycle on Promotion

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer, Reporting Manager (input), Appointing Authority (declare)
- **User Story:** As an HR Officer, I want promotion to optionally start a probation period that is tracked, extendable, and concluded by a satisfactory declaration so that confirmation in the promoted grade is properly governed.
- **Description:** On effecting a promotion that carries probation, creates `probation_records`, schedules the end date, raises a `PROBATION_ENDING` alert before due (X.2), supports extension or reversion, and records the satisfactory-completion declaration (posting a confirmation **SR event to G12**). Reuses the platform **Confirmation Workflow** pattern (W.1; Platform §W.1 Confirmation Workflow model).

**Acceptance Criteria**
1. Probation auto-created when the promotion grade has a configured probation period.
2. `scheduled_end = probation_start + probation_months`.
3. Alert raised configurable days before `scheduled_end` (via `JOB-G06-PROGRESSION`).
4. Extension records new `extended_to` and reason; reversion transitions employee back and audits (P05).
5. Satisfactory declaration sets `DECLARED_SATISFACTORY` and posts a confirmation SR event (G12).

**Business Rules**
- Multiple extensions allowed up to a policy cap.
- Reversion during probation reverses the promotion order (`SUPERSEDED`) with SR posting.

**Data Model References**

| Entity | Use |
|---|---|
| `probation_records` | lifecycle |
| `promotion_orders` | source/linkage |
| `service_register_events` (G12), `progression_alerts` (X.2) | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/probations?status=on_probation` | List (cursor) |
| POST | `/api/v1/probations/{id}/extend` | Extend |
| POST | `/api/v1/probations/{id}/declare` | Declare satisfactory |
| POST | `/api/v1/probations/{id}/revert` | Revert |

**UI Behavior Notes:** Probation tracker with countdown; extension modal (reason mandatory, `VAL-COMMENT`); declare action with checklist; reverted cases clearly badged.

**Edge Cases:** declaration after long delay (deemed-confirmation policy); reversion after partial service; extension beyond cap (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProbationService`, `ProbationScheduler(X.1)`, `SrPostingGateway(G12)` |
| Backend Flow | on order EFFECTED with probation → create record → scheduler raises alert pre-end → extend/declare/revert handlers |
| Data Operations | INSERT/UPDATE probation_records; SR post on declare/revert; P05 audit |
| Validation | period elapsed before declare; extension within cap |
| Authorization | declare/revert: appointing authority (P01/P02) |
| State Changes & Side Effects | ON_PROBATION→EXTENDED→DECLARED_SATISFACTORY / REVERTED; SR events (G12) |
| Failure Handling | extension over cap → `PROBATION_EXTENSION_LIMIT`; declare before period → `PROBATION_NOT_COMPLETE` |
| Dependencies | FR-007, G12 |
| Test Guidance | end-date arithmetic; alert timing; revert reverses order + SR |

---

### FR-PPP-010 — Ad-hoc / Officiating / In-situ Promotion (superseded-by-regular guard)

- **Module:** PPP-OFF
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As a Department Head, I want to place an employee in a higher post on ad-hoc/officiating/in-situ basis pending a regular DPC so that operational continuity is maintained without bypassing due process — and so that when the regular DPC selects a different incumbent, the officiating arrangement is correctly terminated rather than regularised.
- **Description:** Creates `officiating_arrangements` (against a `sanctioned_posts` post) with dates and optional officiating pay, links to a pending regular case, supports extension/termination, regularises into a regular order on DPC selection of the same incumbent, and **transitions to `SUPERSEDED_BY_REGULAR` (terminated, not regularised) when the regular DPC selects someone else** (impr. #20). Sanction = P01 approver (Department Head / Appointing Authority); SR start/end posted to G12.

**Acceptance Criteria**
1. Arrangement records type, post (`sanctioned_post_id`), org unit, dates, and pay eligibility.
2. Duration tracked; extensions audited (P05); lapses auto-flagged (X.1).
3. Linking to a regular case enables one-click regularisation **only when the same incumbent is selected**.
4. If the regular DPC selects a different person, the arrangement moves to `SUPERSEDED_BY_REGULAR` and is terminated with SR end event (state guard, impr. #20).
5. Arrangement posts SR events (officiating start/end) to G12.

**Business Rules**
- Ad-hoc promotion confers no automatic seniority unless regularised.
- Officiating pay allowed only when type/policy permits.
- An employee cannot hold two conflicting upward arrangements for the same post simultaneously.

**Data Model References**

| Entity | Use |
|---|---|
| `officiating_arrangements` | record (+SUPERSEDED_BY_REGULAR) |
| `sanctioned_posts` | post occupied against |
| `promotion_cases`, `promotion_orders` | linkage/regularisation |
| `service_register_events` (G12) | postings |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/officiating` | Create arrangement |
| POST | `/api/v1/officiating/{id}/extend` | Extend |
| POST | `/api/v1/officiating/{id}/regularise` | Regularise to order (same incumbent) |
| POST | `/api/v1/officiating/{id}/terminate` | Terminate / superseded-by-regular |

**UI Behavior Notes:** Arrangement form (W.2) with type and pay toggle; active-arrangements list with duration meter; regularise CTA appears when linked case is `SELECT_LIST_APPROVED` and incumbent selected; superseded badge when a different person is selected.

**Edge Cases:** officiating exceeds permissible duration (compliance flag); **regular DPC supersedes officiating incumbent → `SUPERSEDED_BY_REGULAR`, terminated not regularised** (now a state guard); overlapping arrangements (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OfficiatingService`, `RegularisationService`, `SupersessionGuard`, `SrPostingGateway(G12)` |
| Backend Flow | create → SR post (start) → extend/terminate → on regular select-list: if incumbent selected → regularise; else → SUPERSEDED_BY_REGULAR + terminate + SR end |
| Data Operations | INSERT/UPDATE officiating_arrangements; INSERT order on regularise; SR events (G12); P05 audit |
| Validation | no overlapping arrangement; pay flag per policy; incumbent match for regularise |
| Authorization | create: dept head/HR; regularise: appointing authority (P01) |
| State Changes & Side Effects | ACTIVE→EXTENDED→REGULARISED/TERMINATED/SUPERSEDED_BY_REGULAR/LAPSED; SR |
| Failure Handling | overlap → `OFFICIATING_OVERLAP`; regularise without/with-different selection → `NO_REGULAR_SELECTION`/`SUPERSEDED_BY_REGULAR` |
| Dependencies | FR-005/007, FR-015, G12 |
| Test Guidance | duration tracking; regularisation same-incumbent; superseded-by-regular guard; overlap prevention |

---

### FR-PPP-011 — Financial Up-gradation (ACP/MACP) Sanction (cap corrected; refusal-aware)

- **Module:** PPP-FIN
- **Primary Role(s):** HR Promotion Officer (maker), Screening Committee, Appointing Authority (sanction)
- **User Story:** As an HR Officer, I want the system to detect financial up-gradation due-dates from the qualifying-service ledger, run screening and sanction, correctly cap at three financial up-gradations (with regular promotions reducing remaining entitlement and refusals affecting the clock), so that stagnating employees get assured pay progression on time and within policy.
- **Description:** Continuously evaluates qualifying service (cited from `qualifying_service_ledger`) via `JOB-G06-MACP-DUE` (X.1) to flag `financial_upgradations` as `DUE`, runs a screening-committee assessment (P01 flow), applies the **corrected cap (≤ 3 financial up-gradations in a career; regular promotions reduce remaining entitlement and reset the clock; refusal-of-promotion applies the recorded MACP-clock effect)**, sanctions the next pay level, generates a MACP order (FR-007), posts SR (G12), and hands the pay event to **G10**.

**Acceptance Criteria**
1. Due detection on completing configured qualifying service (e.g., 10/20/30 years) **from the QSL net qualifying years**, with no qualifying promotion in the interim.
2. Screening assessment records benchmark-met; failing benchmark defers per policy.
3. **Cap (CORRECTED — impr. #13):** `count(EFFECTED financial up-gradations) ≤ 3`; a regular promotion reduces remaining entitlement and resets the qualifying clock (`clock_reset_date`); there is **no** combined `promotions + macp ≤ 3` rule.
4. **Refusal effect (impr. #12):** an active `promotion_refusals` row with `macp_clock_effect ∈ {STOP, FORFEIT_NEXT, RESET}` is applied (`refusal_effect_applied=true`).
5. Sanction grants the next pay level effective from due date; deferred if penalty current; creates a `MACP` order, posts SR (G12), emits a pay-fixation event to **G10**.

**Business Rules**
- MACP counts financial up-gradations availed (cap 3); a regular promotion resets/adjusts the clock per policy.
- Refusal of regular promotion affects MACP entitlement per the recorded `macp_clock_effect` (FR-019).
- Deferral on disciplinary penalty currency; re-evaluated on penalty expiry.

**Data Model References**

| Entity | Use |
|---|---|
| `financial_upgradations`, `macp_assessments` | record + screening (cap fields) |
| `qualifying_service_ledger` | cited service fact |
| `promotion_refusals` | clock effect |
| `promotion_orders` (type=MACP) | order |
| `service_register_events` (G12), G10 pay event | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/financial-upgradations?status=due` | Due list (cursor) |
| POST | `/api/v1/financial-upgradations/{id}/screen` | Screening assessment |
| POST | `/api/v1/financial-upgradations/{id}/sanction` | Sanction + order + SR (`Idempotency-Key`) |
| POST | `/api/v1/financial-upgradations/{id}/defer` | Defer |

**UI Behavior Notes:** MACP due dashboard with countdown and **cap tracker showing up-gradations availed (n/3)** and remaining-entitlement after regular promotions; refusal-effect badge; screening form with benchmark; sanction action shows pay-level change preview; deferred items with reason.

**Edge Cases:** employee took regular promotion shortly before MACP due (recompute clock via `clock_reset_date`); penalty between due and sanction (defer); refusal forfeits next up-gradation; cap of 3 reached (informational, no further).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `MacpEngine`, `QualifyingServiceLedgerGateway`, `MacpCapCalculator`, `RefusalEffectApplier`, `ScreeningService`, `OrderService`, `PayEventGateway(G10)`, `SrPostingGateway(G12)` |
| Backend Flow | `JOB-G06-MACP-DUE` reads QSL net years → compute due (cap-aware, clock-reset, refusal effect) → create DUE + alert → screen (P01) → sanction: tx{create MACP order, post SR to G12, emit G10 pay event, set EFFECTED} |
| Data Operations | INSERT financial_upgradations + macp_assessments; INSERT order; SR event (G12); P05 audit |
| Validation | qualifying service met (QSL); count EFFECTED < 3; no current penalty; refusal effect applied |
| Authorization | sanction: appointing authority (P01); screen: committee |
| State Changes & Side Effects | DUE→UNDER_SCREENING→SANCTIONED→EFFECTED / DEFERRED/REJECTED; SR; G10 event |
| Failure Handling | cap exceeded → `MACP_CAP_REACHED`; penalty current → auto-defer; G10 down → SR held, retry |
| Dependencies | FR-016 (QSL), FR-019 (refusal), G08, G09, G10, G12 |
| Test Guidance | due arithmetic from QSL; **corrected cap (3 up-gradations, promotions reduce entitlement not combined cap)**; clock reset; refusal effect; defer-on-penalty |

---

### FR-PPP-012 — Posting after Promotion (sanctioned-post validated; NOT_JOINED state)

- **Module:** PPP-POST
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As an HR Officer, I want to post a promoted employee to a specific sanctioned-and-vacant post/station and drive relieving/joining through G05 so that the promotion translates into an actual placement, with non-joining handled as a defined terminal state.
- **Description:** Creates `promotion_postings` for an effected promotion, selects the destination `to_sanctioned_post_id` (**validated as sanctioned and vacant against `sanctioned_posts`** — impr. #1), hands a movement to **G05** (configured P01 relieving/joining flow), tracks relieving/joining, supports a **`NOT_JOINED`** terminal state with consequence (impr. #20), and posts the posting/joining **SR event to G12** on completion.

**Acceptance Criteria**
1. Posting can be created only for an `EFFECTED` promotion order.
2. Destination post validated against `sanctioned_posts` (`current_vacancies > 0`); no free-text vacancy assumption (impr. #1; `VAL-G06-VACANCY-RECON`).
3. **G05** movement reference stored; status reflects RELIEVED/JOINED.
4. Report-by date enforced; **failure to join by deadline ⇒ `NOT_JOINED`** with `not_joined_consequence ∈ {ORDER_REVIEW, FORFEITED, EXTENSION_GRANTED}` (impr. #20).
5. On JOINED, a posting SR event is posted (G12) and `employees.org_unit_id` update signalled to **G01**.

**Business Rules**
- A promotion may be local (no station change) or out-station (full relieving/joining via G05).
- Failure to join by deadline triggers order review per policy; forfeiture frees the sanctioned post.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_postings` | posting record (+NOT_JOINED) |
| `sanctioned_posts` | vacant-post validation |
| `promotion_orders` | source |
| G05 movement, `service_register_events` (G12) | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/orders/{id}/postings` | Create posting (sanctioned-post validated) |
| GET | `/api/v1/postings/{id}` | Status |
| POST | `/api/v1/postings/{id}/sync-movement` | Sync with G05 |
| POST | `/api/v1/postings/{id}/mark-not-joined` | Record NOT_JOINED + consequence |

**UI Behavior Notes:** Posting form with destination picker showing sanctioned/vacant status; movement timeline (relieved → in-transit → joined); report-by countdown; NOT_JOINED action with consequence selector.

**Edge Cases:** no vacant sanctioned post (blocked, `POST_NOT_AVAILABLE`); employee declines posting (links to FR-007 acceptance); local promotion (skip relieving); not joined by deadline (NOT_JOINED + consequence).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PostingService`, `SanctionedPostValidator`, `G05MovementGateway`, `SrPostingGateway(G12)`, `EmployeeUpdateGateway(G01)` |
| Backend Flow | validate order EFFECTED → validate destination sanctioned/vacant → create posting → if out-station create G05 movement → sync → on JOINED post SR (G12) + signal G01; on deadline miss → NOT_JOINED + consequence |
| Data Operations | INSERT/UPDATE promotion_postings; SR on joined (G12); P05 audit |
| Validation | order EFFECTED; destination sanctioned & vacant; report-by |
| Authorization | create: HR/dept head; approve: appointing authority (P01) |
| State Changes & Side Effects | PENDING→RELIEVED→JOINED / NOT_JOINED; SR; G01 org_unit update; sanctioned post free on forfeiture |
| Failure Handling | no vacancy → `POST_NOT_AVAILABLE`; not joined → NOT_JOINED + policy review |
| Dependencies | FR-007, FR-015, G05, G12, G01 |
| Test Guidance | local vs out-station; sanctioned-post validation; NOT_JOINED consequence; G05 sync; SR on joined |

---

### FR-PPP-013 — Progression Monitoring (Due-for-Promotion, Stagnation, Increment view)

- **Module:** PPP-MON
- **Primary Role(s):** HR Officer, Reporting Manager, Employee (self), System (scheduler X.1)
- **User Story:** As an HR Officer, I want the system to proactively flag who is due for promotion, who is stagnating, whose increment is due (mirroring G10), and whose probation/APAR/refusal-debarment affects progression so that no entitlement is missed and no employee stagnates unseen.
- **Description:** A scheduled engine (`JOB-G06-PROGRESSION` on X.1) evaluates each employee against career rules (citing the QSL) and generates `progression_alerts` and maintains `increment_monitor` rows **as a monitoring/alerting view that mirrors G10 (system-of-record)** (impr. #18); surfaces dashboards and self-service timelines (Me workspace); supports acknowledgement/action; dispatches via **X.2**.

**Acceptance Criteria**
1. Alerts generated on configurable lead time before due dates; deduplicated per employee/type/cycle (job idempotent per-period run key, X.1).
2. Stagnation defined as net qualifying years (from QSL) in grade beyond a configurable threshold without promotion/up-gradation.
3. **Increment rows are a mirror keyed by `g10_increment_ref`; G06 never authoritatively sets release/withhold — G10 does** (impr. #18). Rows without a G10 ref are alert-only projections.
4. Employees see their own progression timeline and open alerts (P02 own-record scope).
5. Alerts can be acknowledged, actioned (linking to a case/MACP), or dismissed with reason; new alert types `SEALED_COVER_REVIEW_DUE`, `REFUSAL_DEBARMENT_ENDING` supported.

**Business Rules**
- Alert thresholds are configuration per cadre/grade (config cascade).
- APAR gaps blocking eligibility raise `APAR_GAP_BLOCKING` to prompt G08 follow-up.
- Increment withheld due to penalty (G09) is reflected from G10 and auto-released on expiry **by G10**, mirrored here.

**Data Model References**

| Entity | Use |
|---|---|
| `progression_alerts`, `increment_monitor` (mirror) | monitoring |
| `qualifying_service_ledger` | stagnation/due inputs |
| `eligibility_assessments`, `financial_upgradations`, `promotion_refusals` | inputs |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/progression/alerts?type=&status=` | List alerts (cursor) |
| POST | `/api/v1/progression/alerts/{id}/acknowledge` | Acknowledge |
| GET | `/api/v1/employees/{id}/progression-timeline` | Self timeline |
| POST | `/api/v1/progression/run` | Trigger run (admin; X.1) |

**UI Behavior Notes:** HR monitoring dashboard with alert counts by type/severity; filters by cadre/org; employee self-service timeline; increment register grid **labelled "mirror of Payroll (G10)"** with G10 ref links.

**Edge Cases:** employee due in two cycles (dedupe by cycle); alert then promoted (auto-closed); increment status changes in G10 (mirror updated on sync, not edited locally).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProgressionEngine`, `AlertScheduler(X.1)`, `IncrementMirrorService(G10 sync)`, `QualifyingServiceLedgerGateway` |
| Backend Flow | nightly job → evaluate each in-scope employee via QSL → compute due/stagnation → upsert alerts (dedupe) → sync increment mirror from G10 → notify (X.2); ack/action handlers |
| Data Operations | UPSERT progression_alerts; UPSERT increment_monitor from G10 sync; notifications (X.2); P05 audit |
| Validation | dedupe key (employee+type+cycle); thresholds present; increment rows carry g10_increment_ref |
| Authorization | HR/manager read scope; employee self only (P02) |
| State Changes & Side Effects | alerts OPEN→ACKNOWLEDGED→ACTIONED/DISMISSED/EXPIRED; notifications |
| Failure Handling | job partial failure → resumable checkpoint (X.1 retry ×3 → JOB-FAIL/MSG-SYS-JOBFAIL); G10 sync down → mark mirror stale, do not fabricate |
| Dependencies | FR-016, FR-003/011/019, G08, G09, G10 |
| Test Guidance | dedupe; auto-close on promotion; stagnation from QSL; increment mirror never authoritative |

---

### FR-PPP-014 — Career-Path Modelling, Succession Planning & Eligibility Dashboard (ADVISORY / OPTIONAL)

- **Module:** PPP-CAR
- **Primary Role(s):** HR Officer, Department Head, System Administrator (templates), Employee (self view)
- **Scope marker (impr. #21):** This FR is **explicitly advisory and optional**, built **lighter** than the statutory kernels (FR-016/006/004/020). It **consumes** competencies from **G07** (never redefines them) and **feeds** analytics to **G14**. It **must not auto-promote** and is not a system of truth for competencies or analytics.
- **User Story:** As a Department Head, I want to model career paths, maintain succession plans, and view eligibility dashboards so that the organisation plans talent flow and an employee understands their growth route.
- **Description:** Defines `career_paths` with ordered `career_path_stages` (designation, typical tenure, **referenced** G07 competencies), builds `succession_plans` with ranked `succession_candidates` and readiness levels, and presents an eligibility dashboard projecting who becomes eligible when (reusing the eligibility engine).

**Acceptance Criteria**
1. A career path is an ordered sequence of designations with typical tenure and **competency references** (read-only from G07).
2. Employees can view their mapped career path and next stage with projected eligibility date.
3. Succession plans identify critical positions, incumbents, risk of loss, and ranked successors with readiness.
4. Eligibility dashboard projects upcoming eligible cohorts per grade/cycle.
5. Templates are configurable by admin; plans are versioned. **No path or readiness rating triggers any promotion action.**

**Business Rules**
- Career-path stages must reference valid designations (G01 master); ordering unique and contiguous.
- Succession readiness derived from tenure, APAR (G08), and competency coverage (G07) — advisory only.
- Critical-position risk is set by HR/dept head, not auto-computed.

**Data Model References**

| Entity | Use |
|---|---|
| `career_paths`, `career_path_stages` | path model (advisory) |
| `succession_plans`, `succession_candidates` | succession (advisory) |
| `eligibility_assessments` | dashboard projection |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/PUT | `/api/v1/career-paths` | Manage paths |
| GET | `/api/v1/employees/{id}/career-path` | Self path |
| GET/POST | `/api/v1/succession-plans` | Manage plans |
| GET | `/api/v1/eligibility-dashboard?grade=&cycle=` | Projection |

**UI Behavior Notes:** Career-path visual stepper; succession "9-box"-style readiness grid; eligibility dashboard with cohort projection and drill-down; employee self-service growth view. Clearly badged "advisory — not a promotion decision".

**Edge Cases:** position with no ready successor (bench-risk highlight); employee mapped to multiple paths (primary flagged); designation deprecated mid-path (path versioned).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `CareerPathService`, `SuccessionService`, `EligibilityProjectionService`, `CompetencyGateway(G07, read-only)` |
| Backend Flow | manage path templates → map employees → compute projected eligibility (reuse engine) → render dashboards; succession CRUD with readiness |
| Data Operations | CRUD career_paths/stages, succession_plans/candidates; P05 audit |
| Validation | contiguous stage order; valid designations; readiness enum; no promotion side effect |
| Authorization | template: admin; plans: HR/dept head; self view: employee (P02) |
| State Changes & Side Effects | plan status DRAFT→ACTIVE→REVIEWED→ARCHIVED; **no promotion writes** |
| Failure Handling | invalid stage order → `CAREER_PATH_INVALID`; deprecated designation → version + warn |
| Dependencies | G07 competencies (read), FR-003 |
| Test Guidance | stage ordering; projection accuracy; readiness grid; self-view scoping; assert no promotion side effect |

---

### FR-PPP-015 — Sanctioned-Post & Establishment-Strength Register & Vacancy Computation (NEW — improvement #1)

- **Module:** PPP-EST
- **Primary Role(s):** Establishment-Strength Officer (maker), Appointing Authority (checker, P01)
- **User Story:** As an Establishment-Strength Officer, I want to maintain the sanctioned strength per grade/office with the DR/promotion/LDCE quota split and have the system compute promotion-quota vacancies (current, anticipated, carried-forward) so that every promotion case and posting validates against a real establishment, not a free-typed number.
- **Description:** Maintains `sanctioned_posts` (sanctioned strength, filled/vacant, quota split, anticipated & carried-forward vacancies) and computes the **promotion-quota vacancy figure** consumed by FR-004 (case creation) and validated by FR-012 (posting) and FR-010 (officiating). Reconciles filled/anticipated with **G01** active incumbents and **G11** superannuation via `JOB-G06-ESTAB-RECONCILE` (X.1).

**Acceptance Criteria**
1. Each `sanctioned_posts` row records sanctioned strength, filled count, quota percentages, and a sanction-order reference.
2. `current_vacancies = sanctioned_strength − filled_count`; quota percentages sum ≤ 100 (integrity rule §5.6-15; `VAL-G06-QUOTA-SPLIT`).
3. Promotion-quota vacancies (current + anticipated + carried-forward × promotion_quota_pct) are computed and exposed to FR-004.
4. FR-012 posting and FR-010 officiating validate the destination/against post has `current_vacancies > 0`.
5. Strength revisions are versioned (`status=REVISED`/`ARCHIVED`) and audited (P05); edits require **P01 checker** approval.

**Business Rules**
- Sanctioned strength originates from establishment-authority sanction orders (master data); edits require checker approval.
- Filled count reconciles with G01 active incumbents per grade/office on a scheduled sync.
- Anticipated vacancies (retirements within the cycle) are computed from G01/G11 superannuation data.

**Data Model References**

| Entity | Use |
|---|---|
| `sanctioned_posts` | register + vacancy computation |
| `employees` (G01), retirement (G11) | filled/anticipated reconciliation |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/sanctioned-posts` | Create/revise sanctioned strength (P01 maker-checker) |
| GET | `/api/v1/sanctioned-posts?grade=&orgUnit=` | List with vacancy computation (cursor) |
| GET | `/api/v1/sanctioned-posts/{id}/vacancy-computation` | Promotion-quota vacancy figure |
| POST | `/api/v1/sanctioned-posts/{id}/reconcile` | Reconcile filled/anticipated with G01/G11 |

**UI Behavior Notes:** Establishment grid per grade/office (sanctioned/filled/vacant cards); quota-split editor; vacancy-computation panel showing current + anticipated + carried-forward; revision history.

**Edge Cases:** filled > sanctioned (data error, blocked); quota percentages exceeding 100 (blocked); mid-cycle strength revision affecting an open case (case re-reconciles, flag); single-post grade.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SanctionedPostService`, `VacancyComputationEngine`, `EstablishmentReconciler(G01/G11)` |
| Backend Flow | create/revise (P01 checker) → reconcile filled/anticipated → compute current/promotion-quota vacancies → expose to FR-004/010/012 |
| Data Operations | INSERT/UPDATE sanctioned_posts; version on revise; P05 audit |
| Validation | filled ≤ sanctioned; quota sum ≤ 100; sanction-order ref present |
| Authorization | maker: Est.-Strength Officer; checker: appointing authority (P01) |
| State Changes & Side Effects | ACTIVE→REVISED→ARCHIVED; feeds vacancy figures |
| Failure Handling | filled>sanctioned → `STRENGTH_INCONSISTENT`; quota>100 → `QUOTA_SPLIT_INVALID` |
| Dependencies | G01, G11 |
| Test Guidance | vacancy computation (current+anticipated+carry-forward); reconciliation; quota validation |

---

### FR-PPP-016 — Qualifying-Service Ledger & Service-Exclusion Engine (NEW — improvements #8, #9; **GAP (gov-specific)** statutory engine)

- **Module:** PPP-QSL
- **Primary Role(s):** HR Officer, System Administrator (exclusion rules), Auditor
- **User Story:** As an HR Officer and auditor, I want one versioned, snapshotted, citable qualifying-service ledger — computed once with pinned exclusion rules (EOL, dies-non, suspension, ad-hoc, deputation) — so that every downstream decision (eligibility, MACP, stagnation, projection) cites the same defensible service fact instead of re-deriving it.
- **Description:** Computes net qualifying service for an `(employee, grade, as-of-date)` by taking gross service and applying the configured `service_exclusion_rules`, persists an **immutable snapshot** (`qualifying_service_ledger`) with an itemised exclusion breakdown, and exposes it as the single source for FR-003/011/013/014. This is a **net-new statutory engine** (Reconciliation §D) that **runs on P05 (audit), P06 (legacy service-book migration)** and consumes G01/G03/G09 facts. Locked as the **fifth shared contract** (`QualifyingServiceLedger`) in §15.4.

**Acceptance Criteria**
1. For an `(employee, grade, as-of-date)`, the engine computes `gross_service_years`, applies the linked `service_exclusion_rules`, and persists `net_qualifying_years` with an itemised `exclusion_breakdown_json` (`VAL-G06-QUALSVC`).
2. Each snapshot is **immutable and citable** (`qsl_snapshot_id`, `computed_by_version`); recomputation creates a new snapshot and supersedes the prior (`superseding_snapshot_id`), never edits it (soft-delete only; P05 trigger captures lineage).
3. Exclusion rules are pinned (Appendix D.3): EOL beyond condonable limit excluded; dies-non excluded; suspension per `suspension_treatment`; ad-hoc counts only if regularised; deputation counts per flag.
4. FR-003 and FR-011 **cite** the current snapshot (`qsl_snapshot_id`) rather than recomputing service.
5. A correction event (FR-018) that changes service facts triggers a fresh snapshot and downstream re-evaluation.

**Business Rules**
- The ledger is the single source of qualifying service for the module (no per-FR calculators) (impr. #8).
- Exclusion rules are version-effective-dated (config cascade); the rule effective on `as_of_date` applies.
- Leave/suspension facts are sourced from **G03** (leave/EOL) and **G09** (suspension/penalty) and snapshotted.

**Data Model References**

| Entity | Use |
|---|---|
| `qualifying_service_ledger` | immutable snapshots |
| `service_exclusion_rules` | pinned exclusion logic |
| `employees` (G01), leave (G03), suspension (G09) | inputs (by reference) |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/qualifying-service/compute` | Compute + snapshot (employee, grade, as-of) |
| GET | `/api/v1/employees/{id}/qualifying-service?grade=&asOf=` | Current snapshot |
| GET | `/api/v1/qualifying-service/{snapshotId}` | Fetch immutable snapshot (citable) |
| GET/POST/PUT | `/api/v1/service-exclusion-rules` | Manage exclusion rules |

**UI Behavior Notes:** Service-fact panel showing gross → exclusions (itemised EOL/dies-non/suspension/ad-hoc/deputation) → net; snapshot id + version stamp for citation; exclusion-rule editor with worked-example preview.

**Edge Cases:** suspension later exonerated (recompute via correction); ad-hoc service later regularised (recompute); overlapping EOL and dies-non (no double count); deputation straddling grade change.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `QualifyingServiceLedgerEngine`, `ServiceExclusionResolver`, `LeaveGateway(G03)`, `SuspensionGateway(G09)`, `LedgerRepository` |
| Backend Flow | gather service dates (G01) + leave/EOL (G03) + suspension (G09) → resolve effective exclusion rule → compute gross − exclusions → persist immutable snapshot with breakdown |
| Data Operations | INSERT qualifying_service_ledger (append-only); supersede prior on recompute; P05 audit; P06 source-id on migrated rows |
| Validation | exclusion rule active on as_of_date; no double-counted periods |
| Authorization | compute: HR; rule mgmt: Sys Admin; read: broad (P02) |
| State Changes & Side Effects | new snapshot; is_current flag flip on supersession |
| Failure Handling | G03/G09 down → `PRECONDITION_FAILED`/`INTERNAL` (X.3 mapping), no partial snapshot persisted |
| Dependencies | G01, G03, G09 |
| Test Guidance | exclusion vectors (Appendix D.3); immutability; supersession lineage; citation by FR-003/011 |

---

### FR-PPP-017 — Legal-Case Linkage & Sub-Judice Handling (NEW — improvement #5)

- **Module:** PPP-LEG
- **Primary Role(s):** Legal/Litigation Officer (maker), Appointing Authority (checker), HR Officer (read)
- **User Story:** As a Legal Officer, I want to attach court/tribunal references and interim stays to promotion cases, orders, seniority lists and roster points, and mark records "subject to outcome", so that the system truthfully represents that a decision is sub judice and blocks unsafe effecting.
- **Description:** Maintains `legal_case_links` attachable to cases/orders/lists/rosters/candidates with forum, case reference, interim-stay window, and `subject_to_outcome`; sets `subject_to_litigation` on the linked entity; drives the `INTERIM_STAYED` state (integrity rule §5.6-20); and, on an adverse disposal, triggers a correction event (FR-018). Only the **`g06_legal_officer` role** writes legal links (P02 SoD).

**Acceptance Criteria**
1. A legal link can be attached to a `promotion_case`, `promotion_order`, `seniority_list`, `roster`, or `candidate`, capturing forum, reference, petitioner and status.
2. Setting `interim_stay=true` transitions the linked entity to `INTERIM_STAYED` and blocks effecting/finalisation/posting until vacated (impr. #5; `ENTITY_SUB_JUDICE`).
3. An order may be issued `subject_to_outcome=true` ("subject to the outcome of OA/SLP No. …") and is clearly flagged.
4. Disposal status is recorded; `DISPOSED_ADVERSE`/`CONTEMPT` can trigger a `correction_events` row (FR-018).
5. All legal links and stays are audited (P05) and surfaced in the litigation-risk register (§13).

**Business Rules**
- Only the Legal Officer writes legal links; promotion adjudication roles cannot (P02).
- A vacated stay clears `INTERIM_STAYED`, restoring the prior state.
- Court case management itself is external; G06 stores references and outcomes only.

**Data Model References**

| Entity | Use |
|---|---|
| `legal_case_links` | references, stays, outcomes |
| `promotion_cases`, `promotion_orders`, `seniority_lists`, `roster_points`, `promotion_candidates` | linked entities (subject_to_litigation, INTERIM_STAYED) |
| `correction_events` | adverse-outcome trigger |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/legal-case-links` | Attach legal reference |
| POST | `/api/v1/legal-case-links/{id}/interim-stay` | Record/vacate interim stay |
| POST | `/api/v1/legal-case-links/{id}/dispose` | Record outcome |
| GET | `/api/v1/legal-case-links?entityType=&entityId=` | List for entity (cursor) |

**UI Behavior Notes:** Legal-link panel on case/order/list views; sub-judice banner with stay dates; "subject to outcome" badge; disposal capture with document upload (G13); litigation-risk register dashboard.

**Edge Cases:** multiple overlapping cases on one entity; stay vacated then re-imposed; adverse outcome requiring batch re-rank (FR-018); contempt requiring expedited correction.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `LegalCaseService`, `SubJudiceGuard`, `CorrectionTrigger(FR-018)` |
| Backend Flow | attach link → set subject_to_litigation; on interim_stay → INTERIM_STAYED + block; on dispose → record outcome → if adverse trigger correction event |
| Data Operations | INSERT/UPDATE legal_case_links; UPDATE linked entity flags/status; P05 audit |
| Validation | linked entity exists; stay dates valid; only Legal Officer writes (P02) |
| Authorization | write: Legal Officer; approve correction: appointing authority (P01) |
| State Changes & Side Effects | entity → INTERIM_STAYED → restored; correction event on adverse |
| Failure Handling | effecting while stayed → `ENTITY_SUB_JUDICE`; invalid entity → `NOT_FOUND` |
| Dependencies | FR-002/004/007, FR-018 |
| Test Guidance | stay blocks effecting; subject-to-outcome flag; adverse → correction trigger; vacate restores state |

---

### FR-PPP-018 — Correction Lineage & Retrospective Recompute Cascade (NEW — improvements #6, #7)

- **Module:** PPP-COR
- **Primary Role(s):** Establishment Officer / HR Officer (maker), Appointing Authority (checker), Legal Officer (court-trigger)
- **User Story:** As an Establishment Officer, when an objection is upheld or a court orders a retrospective promotion/re-rank, I want a single correction mechanism that records why a finalised list or effected order was reopened and cascades the re-rank and recompute truthfully — flagging any pay anomaly to G10 — so that corrections propagate without silent edits.
- **Description:** Creates a `correction_events` row (reason class OBJECTION_UPHELD / COURT_ORDER / ADMIN_ERROR) linked to its trigger, transitions affected lists to `UNDER_CORRECTION`, runs a recompute cascade (`JOB-G06-CORRECTION-CASCADE` on X.1 — idempotent, resumable) that re-ranks seniority entries, re-snapshots QSL, re-evaluates downstream candidates/cases, posts an **SR correction event to G12**, and raises a `PAY_ANOMALY_STEPPING_UP` signal to **G10** where a junior would draw more than a senior (impr. #7). Correction approval is a **P01 maker-checker flow**.

**Acceptance Criteria**
1. Any re-rank/recompute of a `FINALISED` list or `EFFECTED` order occurs only via a `correction_events` row (no silent edits) (impr. #6).
2. The correction records `reason_class`, its trigger (objection or legal case), affected entity, and a `recompute_scope_json`.
3. The cascade re-ranks affected `seniority_entries` (setting `superseded_by_correction`), supersedes affected QSL snapshots, and re-evaluates downstream candidates/cases; it runs in a transaction with `cascade_status` lifecycle (X.1 per-period run key).
4. Where the cascade causes a junior to draw more than a senior, `pay_anomaly_flag=true` and a stepping-up signal is sent to **G10** (`pay_anomaly_signal_ref`) — G06 detects and flags; G10 computes the pay (impr. #7).
5. The correction is **P01 checker-approved** and posts an SR correction event (G12); full lineage is auditable (P05) and replayable.

**Business Rules**
- Corrections are append-only lineage; originals are never destroyed.
- A court-ordered correction takes precedence and may be expedited; an admin-error correction requires recorded justification.
- The cascade is idempotent and resumable; a failed cascade rolls back to `ROLLED_BACK` and alerts (JOB-FAIL/MSG-SYS-JOBFAIL).

**Data Model References**

| Entity | Use |
|---|---|
| `correction_events` | lineage + cascade + pay-anomaly |
| `seniority_lists`/`seniority_entries` | re-rank (UNDER_CORRECTION) |
| `qualifying_service_ledger` | re-snapshot |
| `promotion_candidates`/`promotion_orders` | downstream re-evaluation |
| `service_register_events` (G12), G10 stepping-up signal | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/correction-events` | Create correction (maker; P01) |
| POST | `/api/v1/correction-events/{id}/approve` | Approve (P01 checker) |
| POST | `/api/v1/correction-events/{id}/run-cascade` | Execute recompute cascade (X.1) |
| GET | `/api/v1/correction-events/{id}` | Status + lineage |

**UI Behavior Notes:** Correction wizard (reason → trigger → scope preview → impact summary listing affected ranks/orders/pay anomalies); cascade progress tracker; pay-anomaly list with G10 signal status; lineage timeline.

**Edge Cases:** court orders retrospective promotion of one officer re-ranking a whole list and re-doing a downstream DPC; multiple corrections queued on one list (serialised); cascade failure mid-run (rollback + alert); stepping-up anomaly affecting many juniors.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `CorrectionEventService`, `RecomputeCascadeEngine(JOB-G06-CORRECTION-CASCADE)`, `ReRankService(reuse)`, `QualifyingServiceLedgerEngine(reuse)`, `PayAnomalyDetector`, `G10SteppingUpGateway`, `SrPostingGateway(G12)` |
| Backend Flow | create correction → P01 checker approve → set UNDER_CORRECTION → tx{re-rank entries, re-snapshot QSL, re-evaluate downstream, detect pay anomaly → signal G10, post SR correction to G12} → COMPLETED |
| Data Operations | INSERT correction_events (append-only); UPDATE entries (superseded_by_correction); INSERT new QSL snapshots; SR correction (G12); P05 audit |
| Validation | trigger present; scope valid; checker ≠ maker (P02); idempotent cascade key (X.1) |
| Authorization | maker: Est./HR; court-trigger: Legal Officer; approve: appointing authority (P01) |
| State Changes & Side Effects | list UNDER_CORRECTION→FINALISED; cascade PENDING→RUNNING→COMPLETED/FAILED/ROLLED_BACK; G10 signal; SR |
| Failure Handling | cascade failure → ROLLED_BACK + alert; G10 signal failure → retry queue (X.3); partial → resumable checkpoint |
| Dependencies | FR-002 (re-rank), FR-016 (QSL), FR-017 (legal trigger), G10, G12 |
| Test Guidance | retrospective re-rank cascade; pay-anomaly stepping-up signal; idempotent/resumable cascade; no silent edit; lineage replay |

---

### FR-PPP-019 — Refusal-of-Promotion Consequence Management (NEW — improvement #12)

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer (maker), Appointing Authority (checker, P01)
- **User Story:** As an HR Officer, when an employee declines a promotion, I want the system to record the refusal and apply the policy consequences — a debarment window and a defined effect on the MACP clock — so that a refusal propagates a real consequence rather than just a reserve-list note.
- **Description:** On `promotion_orders.acceptance_status=DECLINED` (from FR-007), creates a `promotion_refusals` row with a configurable debarment window and an `macp_clock_effect`, bars re-consideration until `next_consideration_after`, and feeds the MACP engine (FR-011) so the clock effect is applied. Debarment-ending alert via `JOB-G06-PROGRESSION` (X.1).

**Acceptance Criteria**
1. A declined order creates a `promotion_refusals` row with `debarment_months`, computed `debarment_until`, and an `macp_clock_effect ∈ {NONE, STOP, FORFEIT_NEXT, RESET}` (impr. #12).
2. While `status=ACTIVE`, the employee is barred from re-consideration before `next_consideration_after`; FR-004 field assembly excludes them within the window.
3. The MACP engine (FR-011) applies the recorded clock effect (`refusal_effect_applied=true`).
4. Debarment expiry transitions the refusal to `EXPIRED` and raises a `REFUSAL_DEBARMENT_ENDING` alert beforehand (X.2).
5. A refusal may be `WAIVED` by authority with recorded justification (P01 checker action, audited).

**Business Rules**
- Debarment window and MACP-clock effect are policy configuration per grade/cadre (config cascade).
- Refusal does not by itself reduce seniority unless policy specifies.
- Waiver is a checker action, audited (P05).

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_refusals` | refusal + consequences |
| `promotion_orders` | source (DECLINED) |
| `financial_upgradations` | MACP-clock effect (FR-011) |
| `progression_alerts` | debarment-ending alert |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/orders/{id}/decline` | (FR-007) records decline → creates refusal |
| GET | `/api/v1/refusals?status=active` | List active refusals (cursor) |
| POST | `/api/v1/refusals/{id}/waive` | Waive debarment (P01 checker) |

**UI Behavior Notes:** Refusal capture modal (reason, debarment preview, MACP-effect preview); active-refusals list with debarment countdown; waiver action with justification; refusal badge on employee progression timeline.

**Edge Cases:** employee declines then requests reconsideration within window (blocked unless waived); refusal forfeits next MACP up-gradation; multiple refusals across cycles (debarment compounding per policy).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `RefusalService`, `DebarmentCalculator`, `MacpClockEffectApplier(FR-011)`, `AlertScheduler(X.1)` |
| Backend Flow | on decline → tx{create refusal, compute debarment_until + next_consideration_after, set macp_clock_effect} → feed MACP engine; scheduler raises debarment-ending alert; expiry → EXPIRED |
| Data Operations | INSERT promotion_refusals; UPDATE financial_upgradations.refusal_effect_applied; P05 audit |
| Validation | order is DECLINED; debarment config present |
| Authorization | create: HR (auto on decline); waive: appointing authority (P01) |
| State Changes & Side Effects | refusal ACTIVE→EXPIRED/WAIVED; FR-004 exclusion; FR-011 clock effect |
| Failure Handling | reconsideration within window → `EMPLOYEE_DEBARRED`; missing config → `REFUSAL_POLICY_MISSING` |
| Dependencies | FR-007, FR-011 |
| Test Guidance | debarment window; MACP-clock effect variants; field-assembly exclusion; waiver; debarment-ending alert |

---

### FR-PPP-020 — Multi-Stream Inter-se Seniority Construction (rota-quota) (NEW — improvement #4)

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment/Seniority Officer (maker), System Administrator (quota rules), Appointing Authority (checker)
- **User Story:** As an Establishment Officer, I want to construct the combined inter-se seniority of direct recruits, promotees and LDCE qualifiers in a feeder grade using the applicable rota-quota / rotation-of-vacancies rule so that the most-litigated seniority dispute (N.R. Parmar line) is computed correctly and defensibly.
- **Description:** Defines `seniority_quota_rules` (DR:Promotee:LDCE ratios, rotation method, start slot, carry-forward of unfilled quota) and constructs the combined seniority by rotating vacancies across streams, assigning each entry a `quota_slot_label` and `rotation_cycle_no`; feeds FR-001 list generation when `is_multi_stream=true`. Pinned to a worked example (Appendix D.4).

**Acceptance Criteria**
1. A quota rule records DR/promotee/LDCE ratios, `rotation_method`, `rotation_start_slot`, and `unfilled_quota_carry_forward`.
2. Combined construction interleaves streams per the rotation; each entry records its `quota_slot_label` and `rotation_cycle_no`.
3. Unfilled quota slots in a stream carry forward per the rule (no silent loss).
4. The construction is deterministic and matches the worked vector (Appendix D.4).
5. Stream/quota errors are objectionable as `STREAM_QUOTA_ERROR` (FR-002).

**Business Rules**
- Rotation method and ratios are version-effective-dated configuration (config cascade); the rule effective on `as_on_date` applies.
- `RUNNING_ACCOUNT` vs `ROTA_QUOTA` vs `SEPARATE_STREAM` methods are supported per policy (e.g., N.R. Parmar compliance).
- The data model must not preclude multi-stream even where the organisation currently runs single-stream feeder grades.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_quota_rules` | rotation configuration |
| `seniority_entries` | stream/quota slot assignment |
| `seniority_lists` | `is_multi_stream`, `quota_rule_id` |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/PUT | `/api/v1/seniority-quota-rules` | Manage quota rules |
| POST | `/api/v1/seniority-lists/{id}/construct-combined` | Build combined multi-stream order |
| GET | `/api/v1/seniority-lists/{id}/rotation-trace` | Rotation slot trace |

**UI Behavior Notes:** Quota-rule editor (ratios, method, start slot) with worked-example preview; rotation-trace view showing which slot each entry consumed; stream colour legend on the combined list.

**Edge Cases:** quota slot exhausted in one stream (carry-forward); ratio change mid-cycle (rule snapshot); LDCE stream absent (degenerates to DR:Promotee); legacy data missing stream/quota history (flagged for manual stream tagging at P06 migration).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `QuotaRuleService`, `RotaQuotaConstructionEngine`, `RotationTracer` |
| Backend Flow | resolve effective quota rule → order each stream internally → rotate vacancies across streams per method/start-slot → assign slot labels + cycle no → carry forward unfilled → emit combined order to FR-001 |
| Data Operations | INSERT/UPDATE seniority_quota_rules; UPDATE seniority_entries (stream/slot) in tx; P05 audit |
| Validation | ratios positive; method valid; rule active on as_on_date |
| Authorization | rules: Sys Admin; construct: Est. Officer; approve: appointing authority |
| State Changes & Side Effects | combined entries assigned; rotation trace stored |
| Failure Handling | missing stream tag → `STREAM_TAG_MISSING` (flag, partial); invalid ratio → `QUOTA_RULE_INVALID` |
| Dependencies | FR-001, G01 |
| Test Guidance | rota-quota rotation vector (Appendix D.4); carry-forward of unfilled slots; deterministic interleave; running-account vs rota-quota |

---

## Section 7 — UI Requirements

> Screens are **W.2 form definitions** and configured surfaces consuming `VAL-*` ids; approval surfaces use the **P01 approval action bar** (approve/reject/send-back/delegate). Every screen implements the **five canonical Foundation UI states** (empty / loading / error / no-permission / partial-data) per Foundation §3; masked fields render per **P02** field access. Surfaces route to the **Me / My Team / Admin** workspaces (Platform §6.5).

### 7.1 Screen inventory

| Screen | Primary roles | Key elements | States covered |
|---|---|---|---|
| Establishment-Strength Register | Est.-Strength Officer | Sanctioned/filled/vacant cards, quota-split editor, vacancy computation, revision history | empty, loading, error, inconsistent-strength |
| Qualifying-Service Ledger panel | HR Officer, Auditor | Gross→exclusions→net, snapshot id/version, exclusion-rule preview | loading, error, snapshot-superseded |
| Seniority Workbench (multi-stream) | Est. Officer | Scope wizard, stream/quota step, rotation trace, ranked grid, override modal, publish/finalise | empty, loading, error, success, permission, sub-judice |
| Tentative List (Employee) | Employee | Own position highlight, file-objection CTA (window-gated) | empty, window-closed, success |
| Objection Manager | Est. Officer | Kanban by status (incl. TIME_BARRED, STREAM_QUOTA_ERROR), disposal modal | empty, loading, error |
| Eligibility Grid | HR Officer | Criterion chips (R/A/G), rule-trace tooltip incl. APAR-usability, cert-currency & LDCE chips, sealed-cover badge | loading, partial (PENDING), error, field-restricted (P02 mask) |
| Promotion Case Console | HR Officer | Case header (vacancy from establishment), candidate field, zone bands | empty, under-fill, vacancy-not-reconciled |
| DPC Workspace | DPC Sec/Members | Panel builder (recusal, validity window), quorum meter, panel-currency countdown, verdict grid, minutes upload, **P01 approval bar** | error (quorum/conflict/expired) |
| Select List Approval | Appointing Auth. | Vacancy/roster reconciliation (own-merit migrations), approve (P01) | error (vacancy exceeded) |
| Roster Grid | Roster Officer | 100/200-point grid, category legend, own-merit migration indicator, compliance panel, de-reserve modal, enabling-justification upload | error (double-fill), exempt |
| Orders Console | HR Officer | Batch generate (panel-currency check), acceptance/decline, subject-to-litigation toggle, effect & SR confirm | error (SR down/stayed/expired), success |
| Refusal Management | HR Officer | Refusal capture, debarment & MACP-effect preview, waiver | active, expired, waived |
| Sealed Cover Workspace | Vigilance/Auth. | Restricted list (P02), G09 status badge, review-due SLA countdown, review/minor-penalty action | permission, empty |
| Probation Tracker | HR Officer | Countdown, extend/declare/revert | success, blocked (cap) |
| Officiating Console | Dept Head | Arrangement form, duration meter, regularise CTA, superseded-by-regular badge | overlap error |
| MACP Dashboard | HR Officer | Due countdown, cap tracker (n/3), refusal-effect badge, screen/sanction, pay preview | deferred state |
| Posting Console | HR Officer | Destination picker (sanctioned/vacant), movement timeline (G05), report-by countdown, NOT_JOINED action | no-vacancy error |
| Legal-Case & Sub-judice | Legal Officer | Legal-link panel, sub-judice banner, stay dates, disposal capture, litigation-risk register | empty, stayed |
| Correction & Recompute | Est./HR Officer | Correction wizard (reason→trigger→scope→impact), cascade progress, pay-anomaly list, lineage timeline | running, failed, rolled-back |
| Progression Monitoring Dashboard | HR/Manager | Alert counts by type/severity, filters | empty, loading |
| Employee Progression Timeline | Employee | Career timeline, upcoming due dates, open alerts, refusal/sealed-cover markers | empty, success |
| Career-Path & Succession (advisory) | HR/Dept Head | Path stepper, readiness grid, eligibility projection, "advisory" badge | empty, bench-risk |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA (Platform §8.2): keyboard navigable grids, focus-visible, ARIA on status chips and countdowns; colour never the sole signal; responsive breakpoints 375/768/1280 px; touch targets ≥ 44×44 px.
- Dark mode supported via design tokens; no hardcoded colours.
- Every list uses **cursor pagination** (`limit` default 25, max 100, `next_cursor`), server-side sort/filter; empty/loading/error/no-permission/partial states explicit (no skeleton-only screens — real fields, data, API calls, states).
- **Field-level masking (P02):** APAR detail, disciplinary status and reservation category in the eligibility grid render only for field-authorised roles; others see a masked placeholder applied **on serialization** (impr. #16).
- Destructive/statutory actions (finalise, effect order, sanction MACP, revert probation, run correction cascade, de-reserve) require confirmation with a summary of side effects (SR posting, pay change, cascade impact) and route through **P01** where an approval is required.
- Sub-judice entities show a persistent banner and disable effecting actions.
- Dates display DD-MMM-YYYY; money INR formatted; times in user timezone; labels spell out acronyms; i18n per W.2.
- Row-level scoping (P02 five dimensions): users see only data within their org/cadre authorisation.

---

## Section 8 — (reserved — see Section 9 API & Integration)

> Section numbering follows the 16-section authoring standard; API & Integration is consolidated in Section 9.

---

## Section 9 — API & Integration

### 9.1 Conventions (adopted verbatim from the platform — Foundation §1)

- Base path **`/api/v1`**; JSON; **JWT bearer** carrying resolved roles + tenant/entity scope; **P02 `Authorization.check`** enforced server-side (endpoints never re-implement permission logic), incl. field-level masking on serialization.
- All list endpoints use **cursor pagination** (`?limit=` default **25**, max **100** + `cursor=` → **`next_cursor`**); `?sort=field:asc|desc`; resource-specific filters. **Offset/page paging is not used** (overrides the v2 `?page=&limit=`).
- **Idempotency:** workflow-initiating and SR-posting/order-effecting/correction-cascade/MACP-sanction POSTs accept an **`Idempotency-Key`** header (24h replay returns the original, not a duplicate); SR writes go to the canonical **`POST /api/v1/sr/ingest`** and dedup on the G12 tuple `(source_module="G06", source_reference_id, source_event_version)` (§9.7.1).
- **`X-Correlation-Id`** on every request, echoed in the response header and written to every P05 audit/log line.
- Effective-dated mutations (`effective_from`) are **staged by `JOB-G06-EFFDATE`** (X.1), not written live (Platform §3.3; `VAL-EFFECTIVE`).

### 9.2 Canonical error envelope (platform — Foundation §1; Reconciliation §C)

```json
{
  "error": {
    "code": "VACANCY_NOT_RECONCILED",
    "message": "Case vacancy (13) does not match sanctioned promotion-quota vacancies (12).",
    "field": "vacancy_count",
    "details": { "case_vacancy": 13, "sanctioned_promotion_quota": 12 }
  }
}
```

> The correlation id is carried in the **`X-Correlation-Id` response header**, **not** a body `requestId` field (override of the v2 envelope; Reconciliation §C).

### 9.3 Standard error-code table (platform 8-code — Foundation §1)

| Code | HTTP | Use |
|---|---|---|
| `VALIDATION_FAILED` | **422** | input failed a `VAL-*` / `VAL-G06-*` rule (replaces v2 `VALIDATION_ERROR(400)`) |
| `UNAUTHENTICATED` | 401 | no/invalid session (replaces v2 `AUTH_REQUIRED`) |
| `FORBIDDEN` | 403 | authenticated but not permitted (never leaks existence of out-of-scope records) |
| `NOT_FOUND` | 404 | resource absent or out of scope |
| `CONFLICT` | 409 | idempotency replay, duplicate workflow start (`ERR-DUP-INSTANCE`), state conflict |
| `PRECONDITION_FAILED` | **412** | a required precondition not met (e.g., upstream G08/G09/G10/G12 unavailable, sub-judice block) — replaces the v2 `UPSTREAM_UNAVAILABLE(503)`; upstream failures are mapped via X.3 to 412/500 + `ERR-LOADFAIL`, **no 503** |
| `RATE_LIMITED` | 429 | rate limit exceeded |
| `INTERNAL` | 500 | unexpected server error (replaces v2 `INTERNAL_ERROR`) |

Shared user-facing copy uses platform `ERR-*` ids (`ERR-FORBIDDEN`, `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-PAST-DATED`, `ERR-REASON-REQ`; Foundation §5).

### 9.4 G06 module error-code catalog (domain 409/412 specialisations; v2 additions in **bold**)

> These are **domain specialisations carried in the `code` field** of the platform envelope; the HTTP status is the platform status (mostly **409 CONFLICT** or **412 PRECONDITION_FAILED**). The v2 standalone codes `VALIDATION_ERROR/AUTH_REQUIRED/INTERNAL_ERROR/UPSTREAM_UNAVAILABLE` are removed in favour of the §9.3 table.

| G06 code | HTTP | Meaning |
|---|---|---|
| SENIORITY_RANK_CONFLICT | 409 | Duplicate/gap rank on publish |
| OBJECTION_WINDOW_CLOSED | 409 | Objection filed outside window |
| OBJECTIONS_PENDING | 409 | Finalise blocked by open objections |
| SENIORITY_LIST_NOT_FINAL | 409 | Case needs a finalised list |
| NO_ELIGIBLE_CANDIDATES | 409 | Field empty |
| QUORUM_NOT_MET | 409 | DPC quorum failure |
| PANEL_CONFLICT_OF_INTEREST | 409 | Candidate cannot be panel member (P02 SoD) |
| VACANCY_EXCEEDED | 409 | Select count > vacancies |
| ROSTER_POINT_OCCUPIED | 409 | Double-fill attempt |
| ROSTER_CATEGORY_MISMATCH | 409 | Wrong category fill |
| SEALED_COVER_NOT_REVIEWABLE | 409 | G09 case not concluded |
| PROBATION_NOT_COMPLETE | 409 | Declare before period elapsed |
| PROBATION_EXTENSION_LIMIT | 409 | Extension over cap |
| OFFICIATING_OVERLAP | 409 | Conflicting arrangement |
| NO_REGULAR_SELECTION | 409 | Regularise without selection |
| MACP_CAP_REACHED | 409 | 3 financial up-gradations exhausted |
| POST_NOT_AVAILABLE | 409 | Destination post unavailable |
| SR_POSTING_FAILED | **412** | SR write to G12 failed (held for retry) — was 503 |
| **VACANCY_NOT_RECONCILED** | 409 | Case vacancy ≠ sanctioned promotion-quota vacancies |
| **STRENGTH_INCONSISTENT** | 409 | filled_count > sanctioned_strength |
| **QUOTA_SPLIT_INVALID** | 409 | DR+promotion+LDCE quota > 100 |
| **APAR_NOT_USABLE** | 409 | Uncommunicated adverse APAR relied upon (Dev Dutt) |
| **EWS_CERT_EXPIRED** | 409 | EWS/creamy-layer certificate not current on crucial date |
| **EXAM_NOT_PASSED** | 409 | LDCE/departmental exam gate failed |
| **OWN_MERIT_MIGRATION_REQUIRED** | 409 | Own-merit reserved candidate placed on reserved point |
| **PANEL_EXPIRED** | 409 | Order generation from expired select panel |
| **ENTITY_SUB_JUDICE** | **412** | Effecting blocked by active interim stay (precondition) |
| **EMPLOYEE_DEBARRED** | 409 | Re-consideration within refusal debarment window |
| **REFUSAL_POLICY_MISSING** | 409 | Debarment/MACP-clock config absent |
| **STREAM_TAG_MISSING** | 409 | Multi-stream construction missing stream tag |
| **QUOTA_RULE_INVALID** | 409 | Invalid rota-quota rule |
| **CASCADE_FAILED** | 409 | Correction recompute cascade rolled back |

### 9.5 G06 module-unique validation ids (`VAL-G06-*`) — registered in Foundation §2 index

> G06 cites platform `VAL-*` ids and authors only these module-unique rules (Foundation §7; `GAP (gov-specific)` per PLATFORM_FOUNDATION §7).

| Id | Applies to | Rule |
|---|---|---|
| `VAL-G06-QUALSVC` | qualifying_service_ledger | `net_qualifying_years = gross − Σ(excluded periods)`; non-negative; bounds per Appendix D.3 |
| `VAL-G06-VACANCY-RECON` | promotion_cases.vacancy_count | Must equal the promotion-quota vacancies computed from the linked `sanctioned_posts` |
| `VAL-G06-QUOTA-SPLIT` | sanctioned_posts | `dr_quota_pct + promotion_quota_pct + ldce_quota_pct ≤ 100`; `filled_count ≤ sanctioned_strength` |
| `VAL-G06-SENIORITY` | seniority_entries | Contiguous 1..N ranks; deterministic tie-break order (Appendix D.4) |
| `VAL-G06-ROSTER-OWNMERIT` | roster_points | Own-merit reserved candidate ⇒ UR point + `adjusted_against_category=GEN`; reserved point preserved |
| `VAL-G06-APAR-USABLE` | eligibility_assessments | Adverse APAR usable only if `apar_communicated=true` and representation `DISPOSED`/`NA` (Dev Dutt) |
| `VAL-G06-PANEL-CURRENCY` | promotion_panels | Orders blocked when `now > panel_valid_until` |
| `VAL-G06-MACP-CAP` | financial_upgradations | `count(EFFECTED) ≤ 3`; promotions reduce remaining entitlement, not a combined cap |
| `VAL-G06-SR-EVENT` | `POST /api/v1/sr/ingest` write | SR append integrity; dedup on tuple `(source_module="G06", source_reference_id, source_event_version)`; mandatory `fact_key` + `tenant_id`/`entity_id` (mirrors `VAL-G12-SREVENT`; §9.7.1) |
| `VAL-G06-SUBJUDICE` | order/list/posting effecting | Block effecting while an active `interim_stay` exists |

### 9.6 Representative JSON examples

**Create promotion case (request — vacancy validated against sanctioned_posts)**
```json
{
  "from_grade_id": "desg-ASO",
  "to_grade_id": "desg-SO",
  "cadre_id": "cad-ASO",
  "sanctioned_post_id": "sp-SO-HO",
  "vacancy_year": 2026,
  "promotion_mode": "SENIORITY_CUM_FITNESS",
  "eligibility_rule_id": "rule-ASO-SO",
  "crucial_date": "2026-01-01"
}
```
Headers: `Idempotency-Key: <uuid>`, `X-Correlation-Id: <uuid>`.

**Compute eligibility (response, excerpt — APAR-usability + certificate currency; cursor pagination)**
```json
{
  "caseId": "pc-2026-ASO-SO",
  "assessed": 28,
  "results": [
    { "employee_id": "emp-1001", "overall_result": "ELIGIBLE", "qsl_snapshot_id": "qsl-1001", "qualifying_service_years": 13.55, "apar_pass": true, "apar_usable": true, "vigilance_status": "CLEAR" },
    { "employee_id": "emp-1110", "overall_result": "NOT_ELIGIBLE", "apar_usable": false, "failure_reasons": ["APAR_NOT_COMMUNICATED", "EXAM_NOT_PASSED"] }
  ],
  "next_cursor": "eyJvZmZzZXQiOjI1fQ=="
}
```

**Effect promotion order (response — SR `PROMOTION` posted via `POST /api/v1/sr/ingest`)**
```json
{
  "order_id": "ord-01",
  "order_no": "PROM-ORD/2026/001",
  "status": "EFFECTED",
  "subject_to_litigation": false,
  "sr_event_id": "g12-sr-evt-55012",
  "sr_ingest": {
    "event_type": "PROMOTION",
    "source_module": "G06",
    "source_reference_id": "ord-01",
    "source_event_version": 1,
    "fact_key": "qs:emp-1001:cad-ASO:2026-04-01",
    "tenant_id": "ten-01",
    "entity_id": "ent-07"
  },
  "effective_date": "2026-04-01"
}
```
(The pay-fixation SR event `PAY_FIXATION` is posted by **G10**, not echoed here — no double-claim.)

**Error (sub-judice block — platform envelope, 412)**
```json
{ "error": { "code": "ENTITY_SUB_JUDICE", "message": "This can't be done because a required condition isn't met: active interim stay.", "field": "order_id", "details": { "legal_case_link_id": "lcl-02" } } }
```
(`X-Correlation-Id` in response header.)

**Run correction cascade (response — pay-anomaly stepping-up to G10)**
```json
{
  "correction_event_id": "ce-01",
  "reason_class": "COURT_ORDER",
  "cascade_status": "COMPLETED",
  "reranked_entries": 14,
  "resnapshotted_qsl": 9,
  "pay_anomaly_flag": true,
  "pay_anomaly_signal_ref": "g10-stepup-7781",
  "sr_correction_event_id": "g12-sr-evt-55190",
  "sr_reversal": {
    "endpoint": "POST /api/v1/sr/ingest/reversal",
    "is_reversal": true,
    "reverses_source_reference_id": "ord-01",
    "event_type": "PROMOTION_CANCELLED",
    "source_module": "G06",
    "source_reference_id": "ce-01",
    "source_event_version": 1
  }
}
```

### 9.7 Integration contracts (re-grounded to G-codes and platform mechanisms)

| Integration | Direction | Contract |
|---|---|---|
| **G01** Employee + org/grade master | read + write-signal | Read person/job/designation/cadre/pay-scale (`VAL-GRADE-BAND`); signal designation/org_unit change on effect/join; filled-count reconciliation. **Reference, never fork.** |
| **G03** Leave | read | EOL/leave facts for the qualifying-service ledger (FR-016) |
| **G08** APAR (ex-M09 Performance) | read (by reference) | `GET /api/v1/g08/apar?employeeId=&years=`: grading + benchmark band **+ communicated flag + representation status** per year (impr. #2). **Do not fork APAR.** |
| **G09** Disciplinary/Vigilance | read + **event** | Status read; suspension facts for QSL; **subscribe to case-conclusion events** (via X.3) for sealed cover; degrade to scheduled reconcile `JOB-G06-SEALED-RECONCILE` if only status read (impr. #19) |
| **G10** Payroll | event + signal | Hand the pay event to G10 on MACP/promotion effect; **emit stepping-up/pay-anomaly signal** on correction cascade; **G10 is system-of-record for increments** (mirror only) (impr. #7, #18). **G10 posts the pay SR event (`PAY_FIXATION`/`ANNUAL_INCREMENT`); G06 does NOT** — G06 references G10 for it (no double-claim; §9.7.1) |
| **G11** Pension | read | Anticipated-vacancy (superannuation) data for sanctioned-post computation |
| **G12** Digital SR (on P05 substrate) | write (idempotent) | Append via canonical **`POST /api/v1/sr/ingest`** (reversals via `…/ingest/reversal`); dedup tuple `(source_module="G06", source_reference_id, source_event_version)` + mandatory `fact_key` + explicit `tenant_id`/`entity_id`; G06 event_type codes per §9.7.1; correction/reversal events use `is_reversal=true`+`reverses_source_reference_id` (`VAL-G06-SR-EVENT`) |
| **G13** Documents (ex-M11) | read/write | Upload/version orders, minutes, lists, quantifiable-data records, court orders, exam results (retention classes; `VAL-M11-RETENTION`) |
| **G05** Transfer | create/sync | Create relieving/joining movement (configured P01 flow) for out-station postings |
| **G07** Training | read | Competency references for career-path stages (advisory; read-only) |
| **P01** WorkflowEngine | invoke | `startInstance/advance/approve/reject/sendBack/delegate/cancel` for publication, DPC (PARALLEL_ALL_OF + DYNAMIC_APPROVER), order issue, MACP sanction, de-reservation, correction approval |
| **P02** Authorization | invoke | `Authorization.check` on every endpoint; field masks on serialization |
| **P05** Audit | auto | DB-trigger capture on every G06 table mutation; `Audit.query/export` for Auditor |
| **X.1** Jobs | register | `JOB-G06-*` registered against the runner (Foundation §4 index) |
| **X.2** Notifications | write | Alerts, invitations, acknowledgements, sealed-cover review reminders, stay notifications (`MSG-G06-*`); statutory notices mandatory/non-suppressible (BRD §9.9) |
| **P06** Migration | invoke | Legacy seniority/service-book/roster/MACP/officiating migration via ETL+V (3 dry runs, waves, `<gov>_source_id`) |

#### 9.7.1 Canonical SR ingestion contract (G12 is the single source of truth)

G12 froze the SR ingestion contract; G06 conforms to it (no module-local divergence).

- **Write-port.** The single ledger write-path is **`POST /api/v1/sr/ingest`** (and **`POST /api/v1/sr/ingest/reversal`** for corrections/cancellations). A G06-local `SrPostingGateway` / `…/post-to-sr` is permitted only as an internal façade that **relays to `POST /api/v1/sr/ingest`**. G06 never calls `/api/v1/sr/events` and never INSERTs into `service_register_events` directly.
- **G06 event_type codes (verbatim, as published by G12).** G06 emits **only** these codes — replace any free-form event name with the exact code:

  | Domain action | G12 `event_type` code | Reversal/partner code |
  |---|---|---|
  | Regular/ad-hoc/in-situ/LDCE promotion effected | `PROMOTION` | `PROMOTION_CANCELLED` |
  | Officiating / ad-hoc upward arrangement (start/end) | `OFFICIATING` | `OFFICIATING_CANCELLED` |
  | Reversion (probation reversion / supersession) | `REVERSION` | — |
  | MACP / ACP financial up-gradation sanctioned | `MACP` | (reverse via `is_reversal=true`) |
  | Probation satisfactory declaration / confirmation | `CONFIRMATION` | (reverse via `is_reversal=true`) |
  | Posting after promotion (joining) | `POSTING` | (reverse via `is_reversal=true`) |

  `POSTING` is a G06-owned event. G06 does **not** emit any `TRANSFER`/`RELIEVING`/`JOINING` family code (those are G05's), nor any pay/increment code.
- **Ingest payload contract (every call).** Populate the dedup tuple **`(source_module="G06", source_reference_id, source_event_version)`** with `source_module` set **explicitly** to `"G06"` (never inferred); `source_reference_id` is the G06 business key of the originating row (e.g., `promotion_orders.order_id`, `officiating_arrangements.id`, `financial_upgradations.id`, `promotion_postings.id`, `correction_events.id`). Every call also carries an explicit **`fact_key`** (qualifying-service-bearing — **required**; derived per the event type's `fact_correlation_rule`, G12 FR-01; missing → `SR_FACT_KEY_REQUIRED`) and explicit **`tenant_id`** + **`entity_id`** (G12 hashes `tenant_id`+`employee_id` into `entry_hash`). The HTTP `Idempotency-Key` header may be a writer-local hash, but the **persisted dedup tuple above is the contract**.
- **Pay-fixation boundary (no double-claim).** G06 posts the **establishment** event only (`PROMOTION`/`OFFICIATING`/`MACP`/`CONFIRMATION`/`POSTING`/`REVERSION`). The **pay** SR event is **G10's** — `PAY_FIXATION` on MACP/promotion effect and `ANNUAL_INCREMENT` for increments. G06 hands the pay event to G10 and **references G10 for the pay SR posting; it does NOT itself post `PAY_FIXATION`/`ANNUAL_INCREMENT`.**
- **Reversal/correction envelope.** Corrections, reversions and cancellations use the G12 envelope **`is_reversal=true`** + **`reverses_source_reference_id`** (pointing at the original `source_reference_id`) and, where a published partner type exists, the `*_CANCELLED` code (`PROMOTION_CANCELLED`, `OFFICIATING_CANCELLED`). G12 auto-spawns the corrigendum; entries are supersede-only (never deleted/edited; P05 immutability).

---

## Section 10 — Non-Functional Requirements

### 10.1 NFR table (adopts the platform NFR baseline — Platform §8.2; Reconciliation §C)

| Category | Requirement |
|---|---|
| Performance | **Platform baseline: standard API p95 < 500ms @ 300 concurrent; read-heavy p95 < 300ms cached / < 1000ms uncached; writes p95 < 1500ms.** Module batch: eligibility batch compute of 5,000 employees < 5 min (async with progress); seniority list (10k entries) generation < 60s; correction cascade on a 10k-entry list < 5 min (async, resumable, X.1) |
| Scalability | Horizontal stateless API; batch jobs partitioned by cadre/org for parallelism; per-tenant job isolation (X.1) |
| Availability | **99.5%/month uptime** (platform baseline, overrides v2 99.9%); SR-posting retries with backoff (X.2/X.3); degraded read mode if G08/G09 down; sealed-cover reconcile fallback (`JOB-G06-SEALED-RECONCILE`) if G09 event bus down |
| Consistency | Statutory writes (order effect, MACP sanction, select-list approval, refusal processing, correction cascade) are ACID transactions; SR posting idempotent (G12); QSL snapshots immutable; P01 idempotent stage-advance |
| Security | OWASP ASVS; TLS 1.2+; **P02** RBAC + five-dimension row-level scoping; **field-level masking** on eligibility PII (on serialization); sealed-cover data restricted; parameterised queries only; secrets via env / `integration_credentials` (P04); MFA for high-privilege roles |
| Privacy | DPDP Act 2023 alignment; PII minimisation in comparative views; reservation category masked from unauthorised roles (P02); **module DPIA for the eligibility snapshot (§10.2)**; `consent_records` + right-to-erasure for non-statutory data only (statutory retention floors apply) |
| Auditability | **P05 dual-log, DB-trigger, 100% mutation capture, immutable, ≥7-yr**; statutory artefacts immutable & versioned; correction lineage append-only; full reconstruction of any promotion decision incl. the cited QSL snapshot and APAR-usability decision; reading an audit log is itself audited; tamper-evidence tracks **OPEN-PLAT-03** (hash-chaining) |
| Accessibility | WCAG 2.1 AA across all screens; 375/768/1280 breakpoints; touch ≥ 44×44 px |
| Observability | Structured logs with **`X-Correlation-Id`**; metrics on batch durations, SR-posting success rate, alert/cascade counts, pay-anomaly signals (Platform §0.5); job run audit rows (X.1); alerting on SR-post failure backlog and failed cascades (JOB-FAIL → MSG-SYS-JOBFAIL) |
| Retention | Seniority lists, DPC minutes, orders, correction events retained per statutory schedule (typically permanent for service-record-linked artefacts) — never below the statutory floor; **APAR snapshot (`apar_detail_json`) retained only until `apar_snapshot_retention_until`** then purged/anonymised by `JOB-G06-APAR-PURGE` (impr. #16) |
| Recovery | **RTO < 4h, RPO < 1h** (platform baseline; overrides v2 RPO ≤ 15min) |
| Localisation | DD-MMM-YYYY, INR, timezone-aware; i18n-ready labels (W.2) with acronyms spelled out |
| Deletions | **Soft delete only** — no hard delete platform-wide (Platform §8.2) |

### 10.2 DPIA note — eligibility snapshot (improvement #16)

The `eligibility_assessments` row (with `apar_detail_json`, `disciplinary_status`, `reservation_category`, `obc_creamy_layer_status`) is the **single most sensitive PII concentration** in the suite. Controls, grounded on the platform:

- **Purpose limitation:** the APAR/disciplinary/category fields may be read only for eligibility adjudication and audit; never for general HR browsing.
- **Field-level access control via P02:** only DPC members, the adjudicating HR Officer, Vigilance Officer (disciplinary) and Auditor can decrypt the APAR snapshot; all other roles see masked values **applied on serialization** (an over-broad query cannot leak the field). Bound by the **PII Protection Ceiling** which overrides every role upward (Platform §P02; RBAC §6.3).
- **Explicit retention:** `apar_snapshot_retention_until` bounds the APAR snapshot lifetime; `JOB-G06-APAR-PURGE` (X.1) purges/anonymises expired snapshots while preserving the immutable decision outcome and trace (not the raw grades).
- **Minimisation:** comparative grids show pass/fail chips, not raw grades, unless field-authorised.
- **Auditability:** every read of the APAR snapshot is logged by **P05** with correlation id and role (reading an audit/PII field is itself audited).

---

## Section 11 — Workflow & State Diagrams (State Tables)

> Statutory approval transitions (publish, select-list approve, order issue, MACP sanction, de-reserve, correction approve) are **P01 workflow stage transitions**; "checker" = a P01 approver stage (`DYNAMIC_APPROVER`/named role). Each transition writes one `workflow_actions` row + a P05 audit row. Side-effect "SR" = append to the **G12** ledger; "pay-anomaly signal" = to **G10**.

### 11.1 Seniority list lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | DRAFT | scope valid | entries generated (multi-stream via FR-020) |
| DRAFT | publish (P01 checker) | PUBLISHED_TENTATIVE | ranks contiguous; not sub-judice | baseline frozen |
| PUBLISHED_TENTATIVE | open window | OBJECTIONS_OPEN | window dates set | notify scope (X.2) |
| OBJECTIONS_OPEN | window close | OBJECTIONS_CLOSED | date passed | — |
| OBJECTIONS_CLOSED | finalise | FINALISED | no open objections; not sub-judice | supersede prior, PDF (G13), notify |
| FINALISED | correction (FR-018) | UNDER_CORRECTION | correction event approved (P01) | re-rank cascade (X.1) |
| UNDER_CORRECTION | cascade complete | FINALISED | cascade COMPLETED | SR correction (G12), pay-anomaly signal (G10) |
| any | interim stay (FR-017) | INTERIM_STAYED | stay active | effecting blocked |
| FINALISED | supersede | SUPERSEDED | new final issued | — |

### 11.2 Promotion case lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | assemble field | FIELD_ASSEMBLED | final list exists; vacancy reconciled (FR-015) | candidates created |
| FIELD_ASSEMBLED | compute eligibility | ELIGIBILITY_DONE | rule active; QSL cited | assessments |
| ELIGIBILITY_DONE | constitute panel | PANEL_CONSTITUTED | quorum config; validity set | P01 instance started |
| PANEL_CONSTITUTED | hold DPC | DPC_HELD | quorum met; panel current | verdicts (PARALLEL_ALL_OF), eligibility frozen |
| DPC_HELD | approve select list | SELECT_LIST_APPROVED | count ≤ vacancies; roster ok (own-merit) | roster points tagged |
| SELECT_LIST_APPROVED | issue orders | ORDERS_ISSUED | candidates FIT; panel not expired | orders + SR (G12) |
| any (pre-orders) | interim stay | INTERIM_STAYED | stay active (FR-017) | effecting blocked |
| ORDERS_ISSUED | close | CLOSED | all effected/declined | — |
| any (pre-orders) | cancel | CANCELLED | authority | audit |

### 11.3 Promotion order lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | issue (P01 checker) | ISSUED | candidate FIT; panel current | document (G13) |
| ISSUED | accept | ACCEPTED | within window | — |
| ISSUED | no response | DEEMED_ACCEPTED | window lapsed | — |
| ISSUED | decline | DECLINED | — | **refusal created (FR-019)**, reserve consideration |
| ACCEPTED/DEEMED | effect | EFFECTED | SR available; no active stay | SR post (G12), G01 signal, probation create |
| ISSUED/EFFECTED | interim stay (FR-017) | INTERIM_STAYED | stay active | effecting blocked |
| EFFECTED | supersede/correct | SUPERSEDED | reversion/error/court (FR-018) | SR correction (G12), possible pay-anomaly signal (G10) |

### 11.4 Financial up-gradation lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | due detected (`JOB-G06-MACP-DUE`) | DUE | QSL net service met; cap < 3; refusal effect applied | alert (X.2) |
| DUE | screen | UNDER_SCREENING | committee (P01) | assessment |
| UNDER_SCREENING | sanction | SANCTIONED | benchmark met; cap ok; no penalty | order |
| SANCTIONED | effect | EFFECTED | — | SR (G12) + G10 pay event |
| DUE/UNDER_SCREENING | defer | DEFERRED | penalty current / refusal STOP | re-eval on expiry |
| UNDER_SCREENING | reject | REJECTED | benchmark fail | audit |

### 11.5 Officiating arrangement lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | ACTIVE | no overlap; sanctioned post | SR start (G12) |
| ACTIVE | extend | EXTENDED | within policy | audit |
| ACTIVE/EXTENDED | regularise | REGULARISED | linked selection, **same incumbent** | regular order, SR |
| ACTIVE/EXTENDED | regular DPC selects another | SUPERSEDED_BY_REGULAR | different incumbent selected | terminate, SR end |
| ACTIVE/EXTENDED | terminate | TERMINATED | authority | SR end |
| ACTIVE/EXTENDED | lapse | LAPSED | end date passed | flag |

### 11.6 Probation lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | order effected (probation) | ON_PROBATION | period configured | scheduled_end set |
| ON_PROBATION | extend | EXTENDED | within cap | reason |
| ON_PROBATION/EXTENDED | declare | DECLARED_SATISFACTORY | period elapsed | confirmation SR (G12) |
| ON_PROBATION/EXTENDED | revert | REVERTED | authority | order superseded, SR |

### 11.7 Posting lifecycle (NEW state — improvement #20)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | PENDING | order EFFECTED; sanctioned post vacant (FR-015) | — |
| PENDING | relieve | RELIEVED | out-station; G05 movement | — |
| RELIEVED/PENDING | join | JOINED | reported by date | SR post (G12), G01 org_unit update |
| PENDING/RELIEVED | deadline missed | NOT_JOINED | report-by passed | consequence (ORDER_REVIEW/FORFEITED/EXTENSION_GRANTED) |
| any | cancel | CANCELLED | authority | audit |

### 11.8 Refusal lifecycle (NEW — improvement #12)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | order declined | ACTIVE | decline recorded (FR-007) | debarment_until set, MACP-clock effect applied |
| ACTIVE | debarment expiry | EXPIRED | date passed | re-consideration allowed |
| ACTIVE | waive | WAIVED | authority + justification (P01) | debarment lifted |

### 11.9 Correction-event / legal lifecycle (NEW — improvements #5, #6)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create correction | PENDING | trigger present | — |
| PENDING | approve (P01 checker) | RUNNING | maker ≠ checker (P02) | set UNDER_CORRECTION |
| RUNNING | cascade complete | COMPLETED | re-rank/recompute ok | SR correction (G12), pay-anomaly signal to G10 |
| RUNNING | cascade error | FAILED→ROLLED_BACK | failure | rollback + alert (JOB-FAIL) |
| Legal: FILED | interim stay | INTERIM_STAYED | stay order | entity → INTERIM_STAYED |
| Legal: INTERIM_STAYED | vacate | PENDING | stay vacated | entity restored |
| Legal: PENDING | dispose adverse | DISPOSED_ADVERSE | court order | trigger correction event |

---

## Section 12 — Notifications (via X.2 + W.3; templates by `MSG-G06-*` id)

> Recipient resolution/channel/timing is **W.3 configuration**; delivery is **X.2** (IN_APP + EMAIL in parallel; retry backoff ×5 + dead-letter; every dispatch audit-logged). **Statutory notices (order publication, stay notice, MACP sanction) are mandatory/non-suppressible** (BRD §9.9). Template **copy** lives in the G06 FS slice, referenced by id — never inlined.

| Event | Trigger | Recipients | Channel | Template id |
|---|---|---|---|---|
| Tentative list published | publish | In-scope employees | email/in-app | `MSG-G06-SEN-TENTATIVE` |
| Objection acknowledged | objection submit | Objector | in-app | `MSG-G06-OBJ-ACK` |
| Objection disposed | dispose | Objector | email/in-app | `MSG-G06-OBJ-DISPOSED` |
| Final list notified | finalise | In-scope employees | email/in-app | `MSG-G06-SEN-FINAL` |
| List under correction | correction approved | In-scope affected employees | email/in-app | `MSG-G06-SEN-CORRECTION` |
| DPC convened | panel convened (P01) | Panel members | email | `MSG-G06-DPC-INVITE` |
| Panel expiry approaching | panel-currency lead time | DPC Secretary, HR | in-app | `MSG-G06-PANEL-EXPIRY` |
| Select list approved | approval (P01) | HR, candidates (selected) | in-app | `MSG-G06-SELECT-APPROVED` |
| Promotion order issued | issue | Promoted employee | email/in-app (**mandatory**) | `MSG-G06-ORDER-ISSUED` |
| Acceptance reminder | window nearing | Promoted employee | email | `MSG-G06-ACCEPT-REMINDER` |
| Refusal recorded / debarment ending | decline / lead time | Employee, HR | email/in-app | `MSG-G06-REFUSAL` / `MSG-G06-DEBARMENT-ENDING` |
| Probation ending | lead-time before end | HR, manager | in-app | `MSG-G06-PROBATION-ENDING` |
| MACP due | due detection (job) | HR, employee | email/in-app | `MSG-G06-MACP-DUE` |
| MACP sanctioned | sanction | Employee, payroll (G10) | email/in-app (**mandatory**) | `MSG-G06-MACP-SANCTIONED` |
| Stagnation alert | threshold breach | HR, manager | in-app | `MSG-G06-STAGNATION` |
| Sealed cover review due | G09 conclusion / SLA | Vigilance, HR | email | `MSG-G06-SEALED-REVIEW` |
| Posting issued / report-by / not joined | posting events | Promoted employee, HR | email/in-app | `MSG-G06-POSTING-REPORTBY` / `MSG-G06-POSTING-NOTJOINED` |
| Interim stay imposed/vacated | legal link update | HR, Appointing Authority, Legal | email/in-app (**mandatory**) | `MSG-G06-LEGAL-STAY` |
| Pay-anomaly stepping-up raised | correction cascade | Payroll (G10), HR | email/in-app | `MSG-G06-PAY-ANOMALY` |

All notifications are recorded in the platform `notifications` ledger (X.2); statutory notices also generate a document of record in G13 where required.

---

## Section 13 — Reporting & Analytics

| Report | Description | Primary consumer |
|---|---|---|
| Establishment & vacancy report | Sanctioned/filled/vacant per grade/office, quota split, computed vacancies | Establishment, HR leadership |
| Seniority register (cadre-wise, multi-stream) | Current finalised seniority per cadre/grade with stream/quota | Establishment, Auditor |
| DPC proceedings & select-list report | Per-case minutes, verdicts, select/reserve/sealed lists, panel currency | Appointing authority, Auditor |
| Roster compliance report (with own-merit migrations) | Points filled vs. due by category, own-merit migrations, carry-forward, de-reservation, enabling justification | Roster officer, Auditor |
| Qualifying-service ledger extract | Net qualifying service + exclusion breakdown per employee/grade | HR, Auditor |
| Promotion throughput | Vacancies vs. filled vs. cycle time | HR leadership, G14 |
| Stagnation report | Employees beyond grade-tenure threshold (from QSL) without progression | HR, Dept head |
| MACP due & granted | Upcoming/granted up-gradations, cap usage (n/3), deferrals, refusal effects | HR, Payroll (G10) |
| Refusal & debarment register | Active/expired/waived refusals and MACP-clock effects | HR, Auditor |
| Due-for-promotion projection | Eligible cohorts by grade/cycle | HR, leadership |
| Succession readiness (advisory) | Critical positions, bench strength, risk | Leadership |
| Litigation-risk register | Sub-judice cases/orders/lists, interim stays, subject-to-outcome orders, supersessions, objections upheld, sealed covers pending | Legal/HR |
| Correction-lineage & pay-anomaly report | Correction events, re-ranks, stepping-up signals to G10 | Establishment, Payroll, Auditor |
| Audit trail extract | All state changes for a case/employee (via **P05 `Audit.query/export`**) | Auditor |

Module reports expose data to **G14** (enterprise analytics, ex-M16) via read APIs/materialised views; all reports respect **P02** org/cadre scoping and field-level access, and are exportable (PDF/CSV) with **P05** audit of export (`analytics.*` entitlement; Org Admin = cross-entity).

---

## Section 14 — Migration & Launch (on P06 ETL+V — Platform §P06)

> All legacy migration runs on the **P06 Migration Toolkit**: **Extract → Validate → Transform → Load → Verify**, scripted idempotently, **three mandatory staging dry runs**, waves, `migration_runs` ledger, and a permanent **`<gov>_source_id`** traceability/dedup column on every migrated table (the government source register replaces `darwinbox_source_id`; `GAP (gov-specific)`). Failed records logged with source row + violated rule.

### 14.1 Data migration

| Step | Source | Target | Validation |
|---|---|---|---|
| Sanctioned strength | Establishment sanction orders | `sanctioned_posts` | filled ≤ sanctioned; quota sum ≤ 100; reconcile filled with G01 |
| Service-fact baseline | Service books / G01/G03/G09 | `qualifying_service_ledger` (initial snapshots) | net = gross − exclusions; exclusion breakdown reproducible (`VAL-G06-QUALSVC`) |
| Legacy seniority lists (multi-stream) | Existing registers/spreadsheets | `seniority_lists`/`seniority_entries` | rank contiguity; **stream tag present** (flag `STREAM_TAG_MISSING` for manual tagging); employee match by `service_no` |
| Quota/rotation history | Office orders | `seniority_quota_rules` + entry slot labels | ratios consistent; rotation reproducible |
| Past promotions | Service books / legacy HRMS | `promotion_orders` (EFFECTED, historical) | designation transitions valid; SR backfill to G12 (`historical=true`) |
| Existing MACP grants | Pay records | `financial_upgradations` (EFFECTED) | **count ≤ 3 financial up-gradations**; scheme/level mapping |
| Active officiating | Office orders | `officiating_arrangements` (ACTIVE) | no overlaps; sanctioned post linked |
| Reservation rosters | Roster registers | `reservation_rosters`/`roster_points` | cycle integrity; **own-merit migrations reconciled**; enabling justification attached (G13) |
| Pending litigation | Legal registers | `legal_case_links` | active stays flagged; sub-judice entities set INTERIM_STAYED |
| Ongoing probations | Service records | `probation_records` | end-date arithmetic |

- Migration runs through the P06 staging environment; reconciliation report must show **0 unmatched mandatory records and 0 unresolved own-merit/stream-tag flags** before cutover (P06 three dry runs gate).
- Historical SR backfill posts idempotently to **G12** with a `historical=true` flag (on the P05 substrate).

### 14.2 Configuration before launch (via P04/W.1/W.2/W.3 config cascade)

- Sanctioned strength + quota split per grade/office; vacancy-computation parameters.
- Service-exclusion rules (EOL/dies-non/suspension/ad-hoc/deputation) with worked examples (Appendix D.3).
- Seniority quota/rotation rules per multi-stream grade (Appendix D.4).
- Eligibility rules per grade pair (incl. APAR-communication, cert-currency, LDCE exam flags); zone slabs (Appendix D.1); benchmark thresholds.
- Reservation policy parameters; roster cycle sizes; enabling-provision references; consequential-seniority mode (Appendix D.2).
- Panel currency duration; probation periods; MACP qualifying-year schedule and cap (3); refusal debarment + MACP-clock effects.
- **P01 flow definitions (W.1)** for DPC, order issue, MACP sanction, correction approval, de-reservation; **W.2 forms** for objection intake, roster fill, refusal capture; **W.3** notification config; **X.1** `JOB-G06-*` registration.
- Alert lead times and stagnation thresholds; career-path templates (advisory).
- **RBAC v1.7** registration of new G06 roles + capability flags (RBAC §4.3/§2.2); MFA for high-privilege roles.

### 14.3 Launch strategy

- **Phase 0:** Establishment-strength register (FR-015) + qualifying-service ledger (FR-016) seeded and reconciled (P06) — prerequisite to all kernels; `JOB-G06-*` registered on X.1.
- **Phase 1:** Multi-stream seniority + eligibility (read-only verification with HR); P01 publication flow live.
- **Phase 2:** Promotion case → DPC (P01 committee-as-workflow, panel currency) → orders (refusal, subject-to-litigation) + SR posting to G12 (pilot cadre).
- **Phase 3:** MACP (corrected cap), officiating, posting integration with G05/G10; legal-case linkage + correction cascade (X.1).
- **Phase 4:** Progression monitoring (increment mirror from G10), career-path/succession (advisory), G14 dashboards.
- Each phase gated by reconciliation against legacy and SR posting verification.

### 14.4 Rollback & cutover

- Feature-flagged module (per-tenant); legacy registers retained read-only ≥ 4 weeks during parallel run (P06).
- Rollback plan: disable write endpoints, retain data, revert to legacy for in-flight cases; **no SR events deleted** (corrections only via FR-018; P05 immutability).

---

## Section 15 — Traceability, Dependency & Parallel-Agent Plan

### 15.1 FR ↔ Entity ↔ API ↔ Platform-service traceability matrix

| FR | Sub-module | Primary entities | Key endpoints | Upstream deps | Platform services |
|---|---|---|---|---|---|
| FR-PPP-001 | PPP-SEN | seniority_lists, seniority_entries | POST /seniority-lists | G01, FR-020 | P02, P05 |
| FR-PPP-002 | PPP-SEN | seniority_lists, seniority_objections | publish/finalise/objections | G13, X.2, P01, FR-018 | **P01**, P05, X.2, W.2 |
| FR-PPP-003 | PPP-ELG | eligibility_rules, eligibility_assessments, exam_results | compute-eligibility | FR-016, G08, G09 | P02 (field mask), P05, X.3 |
| FR-PPP-004 | PPP-DPC | promotion_cases, promotion_candidates | assemble-field | FR-001/002/003, FR-015 | P02, P05 |
| FR-PPP-005 | PPP-DPC | promotion_panels (currency), dpc_proceedings | panels/proceedings/verdict | FR-004/006, G13 | **P01 (PARALLEL_ALL_OF, DYNAMIC_APPROVER)**, P02 SoD, P05 |
| FR-PPP-006 | PPP-ROS | reservation_rosters, roster_points | rosters/points (own-merit) | FR-005 | P01 (de-reserve), P05 |
| FR-PPP-007 | PPP-ORD | promotion_orders | orders/effect/decline | FR-005/006/019, G12/G13/G01 | **P01**, **G12 SR**, P05, X.2, W.1 |
| FR-PPP-008 | PPP-DPC | promotion_candidates (sealed) | sealed-covers/review | G09 (event), FR-005/007/018 | X.3 (event), X.1 (reconcile), P02 |
| FR-PPP-009 | PPP-ORD | probation_records | probations | FR-007, G12 | P01 (confirmation flow), G12, X.1 |
| FR-PPP-010 | PPP-OFF | officiating_arrangements | officiating | FR-005/007, FR-015, G12 | P01, G12, P05 |
| FR-PPP-011 | PPP-FIN | financial_upgradations, macp_assessments | financial-upgradations | FR-016/019, G08/G09/G10/G12 | P01, X.1 (MACP-DUE), G12, G10 |
| FR-PPP-012 | PPP-POST | promotion_postings | orders/postings | FR-007, FR-015, G05/G12/G01 | G05, G12, P05 |
| FR-PPP-013 | PPP-MON | progression_alerts, increment_monitor | progression/alerts | FR-016/003/011/019, G08/G09/G10 | **X.1 (PROGRESSION)**, X.2, P02 |
| FR-PPP-014 | PPP-CAR | career_paths, succession_plans | career-paths/succession | G07, FR-003 (advisory) | P02, P05 |
| FR-PPP-015 | PPP-EST | sanctioned_posts | sanctioned-posts | G01, G11 | P01 (maker-checker), X.1 (reconcile), P05 |
| FR-PPP-016 | PPP-QSL | qualifying_service_ledger, service_exclusion_rules | qualifying-service/compute | G01, G03, G09 | **P05, P06** (net-new engine) |
| FR-PPP-017 | PPP-LEG | legal_case_links | legal-case-links | FR-002/004/007, FR-018 | P02 SoD, P05 |
| FR-PPP-018 | PPP-COR | correction_events | correction-events | FR-002/016/017, G10/G12 | **P01**, **X.1 (cascade)**, G12, G10, P05 |
| FR-PPP-019 | PPP-ORD | promotion_refusals | refusals | FR-007, FR-011 | P01 (waive), X.1 (alert), P05 |
| FR-PPP-020 | PPP-SEN | seniority_quota_rules, seniority_entries | seniority-quota-rules | FR-001, G01 | P05 |

### 15.2 Dependency graph (build order)

```
G01, G03, G08, G09, G10, G11, G12, G13 (sibling gov modules) +
P01/P02/P05/P06/X.1/X.2/X.3/W.1-3 (platform — already built)
  └─ FR-015 (sanctioned posts) ─┐
  └─ FR-016 (QSL) ──────────────┤  (foundational — build first; net-new engine on P05/P06)
  └─ FR-020 (quota) ─ FR-001 ─ FR-002 ─┐
  └─ FR-003 (eligibility, cites FR-016; reads G08/G09) ┤
                                         └─ FR-004 (vacancy←FR-015) ─ FR-005 (DPC on P01) ─ FR-006 (own-merit) ─ FR-007 (SR→G12) ─┬─ FR-008
                                                                                                                                    ├─ FR-009
                                                                                                                                    ├─ FR-010
                                                                                                                                    ├─ FR-011 (FR-016/019, G10)
                                                                                                                                    ├─ FR-012 (FR-015, G05)
                                                                                                                                    └─ FR-019 (refusal)
  FR-017 (legal) ─ FR-018 (correction cascade ← FR-002/016/017, G10, X.1)
  FR-016/003/011/019 ─ FR-013 (monitoring, increment mirror←G10, X.1)
  G07/FR-003 ─ FR-014 (advisory)
```

### 15.3 Parallel-agent work packages

| Package | FRs | Can run parallel with | Shared-entity / service contention |
|---|---|---|---|
| WP-0 Foundations | FR-015, FR-016 | — (build first) | sanctioned_posts, qualifying_service_ledger (own); P05/P06 |
| WP-A Seniority | FR-001, FR-002, FR-020 | WP-B (after WP-0) | seniority_* (own); P01 publication flow |
| WP-B Eligibility | FR-003 | WP-A | eligibility_* (own); cites QSL; reads G08/G09; P02 field mask |
| WP-C Case+DPC+Roster | FR-004, FR-005, FR-006 | (after A,B,0) | promotion_*, roster_* (own); vacancy from sanctioned_posts; **P01 DPC flow** |
| WP-D Orders+Probation+Refusal | FR-007, FR-009, FR-019 | WP-E,F (after C) | promotion_orders, probation_*, promotion_refusals; coordinate **G12 SR posting** |
| WP-E Officiating | FR-010 | WP-D,F | officiating_* (own); shares OrderService |
| WP-F MACP | FR-011 | WP-D,E | financial_* (own); shares OrderService + SR; cites QSL; consumes refusal; G10 event |
| WP-G Posting | FR-012 | after WP-D | promotion_postings; **G05 contract**; validates sanctioned_posts |
| WP-H Monitoring | FR-013 | after B,F | progression_*, increment_* (mirror) (own); X.1 |
| WP-I Career/Succession (advisory) | FR-014 | after B | career_*, succession_* (own); G07 read |
| WP-J Sealed cover | FR-008 | adjacent to WP-D | promotion_candidates (status fields); **G09 event/X.3** |
| WP-K Legal+Correction | FR-017, FR-018 | after A,C,D,0 | legal_case_links, correction_events (own); **P01 approval + X.1 cascade**; G10/G12 |

**Shared contracts to lock before parallel build (improvement #8 adds the fifth; platform contracts added):**
1. `SrPostingGateway` (**G12**) interface — append on P05 substrate, idempotent on `source_module=G06`+`source_reference_id`.
2. `OrderService.create()` signature (reused by FR-007/010/011).
3. `EligibilityEngine` interface (reused by FR-004/013/014).
4. Error-envelope (§9.2, platform) + G06 code catalog (§9.4) + enum catalog (§5.5) + `VAL-G06-*` (§9.5).
5. **`QualifyingServiceLedger` interface** (FR-016) — single source cited by FR-003/011/013/014 (**locked, improvement #8**).
6. **`EstablishmentVacancyContract`** (FR-015 `sanctioned_posts`) — vacancy figure consumed by FR-004/010/012 (**locked, improvement #1**).
7. **`G10 stepping-up / pay-anomaly signal`** contract (FR-018 → G10) and **`G09 case-conclusion event`** contract (FR-008) (**locked, improvements #7, #19**).
8. **`P01 G06_DPC` flow definition** (PARALLEL_ALL_OF members + DYNAMIC_APPROVER authority) and **`Authorization.check` action set** (§3.2) — locked platform contracts consumed by WP-C/D/K.

### 15.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)

| Concern | Covered by | Status |
|---|---|---|
| Sanctioned-strength register & vacancy computation | FR-015 | ✅ Resolved (impr. #1) |
| Single versioned qualifying-service ledger + exclusions | FR-016 | ✅ Resolved (impr. #8/#9; net-new engine on P05/P06) |
| Multi-stream seniority lists, tentative/final, objections | FR-001, FR-002, FR-020 | ✅ Resolved (impr. #4) |
| Eligibility incl. APAR-usability (Dev Dutt) & certificate currency | FR-003 | ✅ Resolved (impr. #2/#16; APAR consumed from G08) |
| LDCE / departmental-exam channel + exam-result gate | FR-003, exam_results | ✅ Resolved (impr. #14) |
| Promotion case & zone (pinned slab) with sanctioned vacancy | FR-004 | ✅ Resolved (impr. #1/#10) |
| DPC/panel with currency & supplementary DPC | FR-005 | ✅ Resolved (impr. #11; **committee-as-P01-workflow**) |
| Reservation roster compliance with own-merit migration & enabling justification | FR-006 | ✅ Resolved (impr. #3/#15) |
| Promotion orders, acceptance, refusal, subject-to-litigation, SR posting | FR-007 | ✅ Resolved (impr. #5/#12; SR→G12) |
| Refusal-of-promotion consequence (debarment + MACP clock) | FR-019 | ✅ Resolved (impr. #12) |
| Sealed-cover / Review DPC, event-driven, SLA, minor-penalty branch | FR-008 | ✅ Resolved (impr. #19/#20; G09 event via X.3) |
| Promotion & probation lifecycle | FR-009 | ✅ Resolved (confirmation-workflow pattern W.1) |
| Ad-hoc/officiating/in-situ incl. superseded-by-regular | FR-010 | ✅ Resolved (impr. #20) |
| Financial up-gradation ACP/MACP (corrected cap, refusal-aware) | FR-011 | ✅ Resolved (impr. #13; pay event→G10) |
| Posting after promotion (sanctioned-post validated, NOT_JOINED) | FR-012 | ✅ Resolved (impr. #1/#20; movement→G05) |
| Progression monitoring; increment as mirror of G10 | FR-013 | ✅ Resolved (impr. #18) |
| Career-path/succession (advisory, G07/G14 boundary) | FR-014 | ✅ Resolved (impr. #21) |
| Legal-case linkage & sub-judice handling | FR-017 | ✅ Resolved (impr. #5) |
| Correction-lineage & retrospective recompute cascade + pay-anomaly to G10 | FR-018 | ✅ Resolved (impr. #6/#7; cascade on X.1) |
| Reckoning-dates clarity | §5.8 | ✅ Resolved (impr. #17) |
| Four kernel worked examples + test vectors | Appendix D (§16.5) | ✅ Resolved (impr. #10) |
| SR posting for all promotion/posting/financial/correction events | FR-007/009/010/011/012/018 | ✅ Resolved (G12 on P05) |
| DPDP/privacy: eligibility-snapshot DPIA, field-level access, retention | §10.2, FR-003 | ✅ Resolved (impr. #16; P02 field mask) |
| Canonical entity reuse | Section 5 | ✅ Resolved (G01 masters; never forked) |
| Roles & SoD (maker≠checker, no self-adjudication) | Section 3, integrity rules | ✅ Resolved (RBAC v1.7 + new roles; SoD by P01/P02) |
| Error envelope + module error codes | Section 9 | ✅ Resolved (platform 8-code + envelope; v2 codes overridden) |
| NFRs, security, privacy, audit | Section 10 | ✅ Resolved (platform baseline; P05 audit) |
| Notifications, reporting, migration | Sections 12-14 | ✅ Resolved (X.2/W.3, G14, P06) |
| **PLATFORM — Multi-tenancy (`tenant_id`/`entity_id`, data-layer scoping)** | §4, §5 (all entities) | ✅ Resolved (Platform §0.1) |
| **PLATFORM — Workflow on P01 (DPC/approvals; PARALLEL_ALL_OF/DYNAMIC_APPROVER; in-flight version pinning)** | §2.2, FR-002/005/007/011/015/018, §11 | ✅ Resolved (Platform §P01) |
| **PLATFORM — RBAC/authz + field masking on P02; roles as RBAC v1.7 additions** | §3, §10.2 | ✅ Resolved (Platform §P02; RBAC §6.6) |
| **PLATFORM — Audit on P05 dual-log DB-trigger (no module audit_log)** | §4, §5, §10.1 | ✅ Resolved (Platform §P05) |
| **PLATFORM — SR ledger = G12 net-new gov ledger on P05 (not a platform primitive)** | §2.2, §5.1, §9.7 | ✅ Resolved (Reconciliation §C/§D) |
| **PLATFORM — Jobs on X.1 (`JOB-G06-*`); notifications on X.2/W.3 (`MSG-G06-*`); migration on P06** | §9.7, §12, §14 | ✅ Resolved (Platform §X.1/§X.2/§P06) |
| **PLATFORM — API conventions (Idempotency-Key, cursor pagination, X-Correlation-Id, error envelope/codes)** | §4, §9 | ✅ Resolved (Foundation §1; Reconciliation §C) |
| **PLATFORM — Consume G08 APAR + G09 vigilance by reference (not forked); pay/increment to G10** | §2.4, §5.4, §9.7 | ✅ Resolved |
| **PLATFORM — Validation library reuse + `VAL-G06-*` authored** | §4, §9.5 | ✅ Resolved (Foundation §2/§7) |
| **Unresolved gaps** | — | **0** |

---

## Section 16 — Glossary & Appendices

### 16.1 Glossary

| Term | Definition |
|---|---|
| Seniority list | Ranked register of employees in a feeder grade used to determine promotion order |
| Multi-stream / inter-se seniority | Combined ranking of direct recruits, promotees and LDCE qualifiers under rota-quota rotation of vacancies (N.R. Parmar) |
| Rota-quota | Rotation of vacancies across recruitment streams in a fixed ratio to construct combined seniority |
| Tentative / Final list | Draft list open to objections vs. notified, binding list |
| DPC | Departmental Promotion Committee — statutory body adjudicating promotions; **runs as a P01 committee-as-workflow** |
| Panel currency | Validity period of a DPC select panel; promotions from an expired panel are illegal |
| Benchmark | Minimum APAR grading threshold (Good/Very Good/Outstanding) for fitness |
| APAR usability (Dev Dutt) | An adverse/below-benchmark APAR can be relied upon only if communicated to the employee with the representation disposed; APAR is read from **G08** |
| Zone of consideration | Set of senior-most eligible candidates considered for available vacancies, sized by the DoPT slab |
| Sealed cover | Procedure withholding a promotion recommendation while a disciplinary/vigilance case (G09) is pending |
| Supersession | Promoting a junior over a senior with recorded reasons (only on usable APAR material) |
| Reservation roster | Register applying SC/ST/OBC/EWS/PwBD reservation to posts/vacancies |
| Own-merit migration | A reserved candidate selected on general merit is adjusted against an unreserved point; the reserved point is not consumed |
| Consequential seniority vs catch-up | Two treatments of seniority for accelerated reserved promotions (Art 16(4A)) |
| Carry-forward / De-reservation | Unfilled reserved point rolled forward / converted to unreserved with authority |
| Qualifying-service ledger | Single versioned, snapshotted, citable computation of net qualifying service after exclusions (net-new statutory engine on P05/P06) |
| Service exclusions | Periods not counting toward qualifying service: EOL beyond limit, dies-non, suspension (per outcome), un-regularised ad-hoc, etc. |
| ACP/MACP | Assured / Modified Assured Career Progression — time-bound financial up-gradation schemes (cap 3 in a career) |
| Refusal consequence | Debarment window and MACP-clock effect arising from declining a promotion |
| Officiating / Ad-hoc / In-situ | Temporary upward placements pending regular promotion |
| Superseded-by-regular | An officiating incumbent terminated (not regularised) because the regular DPC selected someone else |
| Probation | Trial period in the promoted grade before confirmation |
| Sanctioned post / establishment strength | Authorised number of posts per grade/office with DR/promotion/LDCE quota split, the source of vacancy counts |
| Legal case link / sub-judice | A court/tribunal reference attached to a record; an interim stay blocks effecting |
| Correction event / recompute cascade | The single mechanism by which a finalised list/effected order is reopened and downstream re-ranked/recomputed (cascade on X.1) |
| Stepping-up / pay anomaly | When a junior draws more than a senior after a retrospective correction; G06 flags, **G10** fixes |
| Notional date | A date assigned for seniority/pay-step purposes without immediate arrears |
| Reckoning dates | as-on (seniority), crucial (eligibility), panel/vacancy year, effective, notional — see §5.8 |
| Digital SR | Digital Service Register (**G12**) — statutory service-event ledger on the **P05** audit substrate |
| Stagnation | Prolonged service in a grade (from QSL net years) without promotion/up-gradation |
| PrimeSoft platform | The existing commercial multi-tenant HRMS platform (P01–P06, X.1–X.3, W.1–W.3) the government build configures and extends |

### 16.2 Appendix A — Configuration parameters (config cascade platform → tenant → entity → employee)

| Parameter | Example default | Scope |
|---|---|---|
| Zone slab | 1→5, 2→8, ≥3→3×vacancies (see Appendix D.1) | per grade |
| Objection window | 30 days | per list |
| Acceptance window | 15 days | per order |
| Refusal debarment window | 12 months | per grade/cadre |
| Refusal MACP-clock effect | FORFEIT_NEXT | per policy |
| Panel currency | 12 months | per panel |
| Probation period | 24 months | per grade |
| MACP schedule | 10/20/30 years | program |
| MACP cap | 3 financial up-gradations (promotions reduce remaining entitlement) | program |
| Sealed-cover review SLA | 24 months | program |
| Stagnation threshold | grade-specific (e.g., 8 yrs net) | per grade |
| Alert lead time | 90 days | per alert type |
| Reservation % / cycle | policy-defined | program |
| Rota-quota ratio | DR:Promotee:LDCE per grade | per grade |
| EOL condonable limit | e.g., 36 months | per exclusion rule |

### 16.3 Appendix B — Assumptions & open items

| Item | Assumption | Owner/Date to confirm |
|---|---|---|
| APAR read API shape | **G08** provides per-year grading + benchmark band **+ communicated flag + representation status** (impr. #2); consumed by reference | G08 team |
| Disciplinary event stream | **G09** emits case-conclusion **events** (via X.3); degrade to nightly status reconcile (`JOB-G06-SEALED-RECONCILE`) if only status read (impr. #19) | G09 team |
| Sealed-cover dependency | Confirmed as **event-driven** with poll fallback; periodic-review SLA enforced regardless | G09 team |
| Pay fixation & increments | **G10** consumes pay event; **G10 is system-of-record for increments and stepping-up arithmetic**; G06 monitors/flags (impr. #7/#18) | G10 team |
| Leave/EOL facts | **G03** exposes EOL/leave periods for the QSL | G03 team |
| Anticipated vacancies | **G11** superannuation data feeds sanctioned-post computation | G11 team |
| Reservation policy version | Provided as configurable master data incl. enabling-provision references (Nagaraj) via config cascade | Roster authority |
| SR idempotency key | `source_module=G06 + source_reference_id` accepted by **G12** on the P05 substrate; correction events post SR corrections | G12 team |
| Legacy stream/quota history | May be incomplete; P06 migration flags `STREAM_TAG_MISSING` for manual tagging | Establishment authority |
| Audit tamper-evidence | Tracks platform **OPEN-PLAT-03** (hash-chaining of audit_log partitions to WORM) rather than a parallel mechanism | Security / Architecture |
| New RBAC roles/flags | New G06 roles (`g06_dpc_member`, `g06_appointing_authority`, `g06_reviewing_authority`, etc.) registered in RBAC §4.3/§2.2 via the working-group process | RBAC working group |

### 16.4 Appendix C — Standards referenced

- **`PLATFORM_FOUNDATION.md`** (Master BRD v2.1 · Product Vision v2.6 · Platform Spec v1.6 · RBAC Design v1.7 · Foundation FS v1.6) and **`MODULE_RECONCILIATION.md`** — the authoritative grounding artefacts (supersede the invented `SHARED_FOUNDATION.md`).
- OWASP ASVS; WCAG 2.1 AA; India DPDP Act 2023 (with module DPIA §10.2).
- Public-sector DPC/seniority/reservation/MACP procedural conventions (parameterised, not hard-coded; config cascade).
- Jurisprudence reflected as controls (not hard-coded): `Dev Dutt` (APAR communication), `M. Nagaraj`/`Jarnail Singh` (reservation-in-promotion enabling data), `N.R. Parmar` (inter-se seniority of DR/promotees).

### 16.5 Appendix D — Pinned Kernel Algorithms & Worked Test Vectors (improvement #10)

The four litigation-bearing kernels are pinned here with inputs, formula and worked numeric vectors. These are the **test vectors** to ship before kernel code.

#### D.1 Zone of consideration (non-linear DoPT slab)

- **Inputs:** `vacancy_count` (from sanctioned_posts promotion quota); `slab` config; reserved-category extended-zone factor.
- **Formula (configurable, default slab):** `zone = 5 if v=1; 8 if v=2; 3×v if v≥3`. Reserved-category extended zone adds the policy factor where roster requires; ties at the boundary are included.
- **Worked vector:** v=1 → 5; v=2 → 8; v=5 → 15; v=12 → 36 candidates considered. For v=12 with a reserved extended-zone factor of +50% on SC/ST sub-field, the SC/ST consideration field extends to 18 while the general field stays 36. Boundary tie at rank 36–37 (equal seniority) → both included (field = 37).

#### D.2 Reservation-roster mathematics (with own-merit migration)

- **Inputs:** `cycle_size` (e.g., 100); reservation %s (e.g., SC 15, ST 7.5, OBC 27, EWS 10, PwBD 4 horizontal); selected candidates with category + `selected_on_own_merit`; carry-forward; de-reservation limit; 50% ceiling.
- **Rules:** own-merit reserved candidate occupies a UR point (`adjusted_against_category=GEN`), reserved point preserved; reserved points unfilled → carry-forward; de-reservation only after carry-forward limit; vertical reservation ≤ 50% (EWS additional per policy); PwBD interpolated horizontally.
- **Worked vector (100-point cycle, 12 vacancies):** Roster points due in this cycle: SC at points {7,15,...}, OBC at {8,...}. Suppose selected = 8 GEN, 2 SC, 2 OBC; one OBC (emp-1110) tops the general merit list. **Without migration (WRONG):** OBC point consumed → reservation over-counted. **With migration (CORRECT):** emp-1110 placed on a UR point with `adjusted_against_category=GEN`; the OBC roster point at #8 remains `CARRIED_FORWARD`/preserved; category tally = GEN 9 (8+1 own-merit), SC 2, OBC 1 against-roster + 1 own-merit-migrated. Compliance report itemises 1 own-merit migration; reserved tally unchanged by the migrated candidate.

#### D.3 Qualifying-service exclusions

- **Inputs:** entry-into-grade date; `as_of_date` (crucial date); leave/EOL periods (**G03**); suspension periods + outcome (**G09**); ad-hoc vs regular segments; deputation periods; `service_exclusion_rules`.
- **Formula:** `net = gross − Σ(excluded periods)`; EOL beyond `eol_max_condonable_days` excluded; dies-non fully excluded; suspension per `suspension_treatment`; ad-hoc counts only if `adhoc_counts_if_regularised` and regularised; deputation counts per flag.
- **Worked vector:** entry 2015-09-01, as-of 2026-01-01 → gross = 10.337 yrs (3775 days). Deduct: EOL 120 days (condonable limit 90 → 30 excess days excluded), dies-non 10 days, suspension 60 days (treatment EXCLUDE; later exoneration would trigger a correction recompute adding them back). Total exclusion = 30 + 10 + 60 = 100 days. **net = 3775 − 100 = 3675 days = 10.062 yrs.** If the eligibility rule requires 10.0 net years → ELIGIBLE; the snapshot stores the itemised breakdown and is cited by FR-003/011.

#### D.4 Multi-stream inter-se seniority (rota-quota)

- **Inputs:** stream-internal seniority lists (DR, Promotee, LDCE); `seniority_quota_rules` (ratio, method, start slot, carry-forward).
- **Formula (ROTA_QUOTA, ratio DR:Promotee = 1:1, start DR_FIRST):** rotate vacancy slots DR, PR, DR, PR, …; each slot draws the next senior-most from that stream; unfilled stream slot carries forward.
- **Worked vector:** DR list = [D1, D2, D3]; PR list = [P1, P2, P3]; ratio 1:1, start DR_FIRST. Combined rank order = D1(rank1, slot DR-1), P1(rank2, slot PR-1), D2(rank3, slot DR-2), P2(rank4, slot PR-2), D3(rank5, slot DR-3), P3(rank6, slot PR-3). If PR has only [P1] available at cycle 2, slot PR-2 carries forward and D3 takes rank4 (slot DR-3); PR-2 is filled later when P2 joins, re-rank handled via a correction event (FR-018) if the list was already finalised. Running-account method differs: quota deficiencies are reconciled across cycles rather than slot-by-slot — selectable via `rotation_method`.

---

## Alignment with PrimeSoft Platform

This section maps each FR (and cross-cutting concern) to the **platform service(s)** it runs on, and names any **`GAP (gov-specific)`** statutory engine G06 authors (which still runs on the named platform engines). Authority: `PLATFORM_FOUNDATION.md` §5–§9; `MODULE_RECONCILIATION.md` §A/§C/§D.

### FR → platform-service map

| FR / concern | P01 Workflow | P02 RBAC/mask | P05 Audit | P06 Migration | X.1 Jobs | X.2 Notif | X.3 Integ | W.1/W.2/W.3 | Sibling gov module | `GAP (gov-specific)` engine |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-001 Seniority gen | — | scope | ✅ | seed | — | — | — | W.2 wizard | G01 master | seniority engine |
| FR-002 Publish/objection/finalise | **publish/finalise flow** | scope | ✅ | — | — | ✅ | — | W.1+W.2 | G13, — | — |
| FR-003 Eligibility | — | **field mask (APAR PII)** | ✅ | — | APAR-purge | gap alert | G08/G09 read | — | **G08**, **G09** | eligibility engine |
| FR-004 Case/field | — | scope | ✅ | — | — | — | — | — | — | zone calc |
| FR-005 DPC/panel | **committee-as-workflow (PARALLEL_ALL_OF + DYNAMIC_APPROVER)** | **SoD (candidate≠member)** | ✅ | — | — | invite | — | W.1 flow | G13 | DPC engine |
| FR-006 Roster | de-reserve approval | scope | ✅ | reconcile | — | — | — | W.2 | G13 | roster + own-merit migration |
| FR-007 Orders/SR | **order issue maker-checker** | scope | ✅ | backfill | — | ✅ (mandatory) | — | W.1 doc-gen | **G12 SR**, G13, G01 | order engine |
| FR-008 Sealed cover | Review-DPC flow | **field-restricted** | ✅ | — | **SEALED-RECONCILE** | review reminder | **G09 event** | — | **G09** | sealed-cover SLA |
| FR-009 Probation | confirmation-workflow (W.1) | scope | ✅ | seed | alert | ✅ | — | W.1 | G12 | — |
| FR-010 Officiating | sanction approval | scope | ✅ | seed | lapse | — | — | W.2 | G12 | officiating guard |
| FR-011 MACP | screening + sanction flow | scope | ✅ | seed | **MACP-DUE** | ✅ (mandatory) | — | — | **G10**, G12 | MACP cap/clock engine |
| FR-012 Posting | (G05 flow) | scope | ✅ | seed | — | ✅ | — | W.2 | **G05**, G12, G01 | sanctioned-post validation |
| FR-013 Monitoring | — | scope | ✅ | — | **PROGRESSION** | ✅ | G10 sync | — | G08/G09/**G10** | progression engine |
| FR-014 Career/succession (advisory) | — | scope | ✅ | — | — | — | — | — | **G07**, G14 | — |
| FR-015 Sanctioned posts | maker-checker | scope | ✅ | seed | **ESTAB-RECONCILE** | — | — | — | G01, G11 | establishment register |
| FR-016 QSL | — | broad read | ✅ | **legacy service-book** | — | — | G03/G09 read | — | G03, G09 | **QSL + exclusion engine** |
| FR-017 Legal/sub-judice | correction approval | **SoD (legal-only write)** | ✅ | seed | — | ✅ (mandatory) | — | — | G13 | sub-judice guard |
| FR-018 Correction cascade | **correction maker-checker** | SoD | ✅ | — | **CORRECTION-CASCADE** | ✅ | G10 retry | — | **G10**, **G12** | recompute cascade + pay-anomaly |
| FR-019 Refusal | waive approval | scope | ✅ | seed | alert | ✅ | — | W.2 | — | refusal consequence |
| FR-020 Multi-stream | — | scope | ✅ | tag-flag | — | — | — | — | G01 | rota-quota engine |
| **Tenancy** (`tenant_id`/`entity_id`, data-layer scope) | — | enforced | — | — | — | — | — | — | — | — (Platform §0.1) |
| **Auth/MFA/session** | — | **P02 per-request** | sec-log | — | — | — | — | — | — | — (Platform §0.2) |
| **API conventions** (Idempotency-Key, cursor, X-Correlation-Id, error envelope) | idempotent ops | — | log | — | — | — | error map | — | — | — (Foundation §1) |
| **Jobs index** | — | — | run audit | — | **all `JOB-G06-*`** | — | — | — | — | — (X.1) |
| **Validation** | — | — | — | — | — | — | — | `VAL-*` + **`VAL-G06-*`** | — | — (Foundation §2/§7) |

### `GAP (gov-specific)` statutory engines G06 authors (each runs on platform engines)

1. **Qualifying-Service Ledger + exclusion engine** (FR-016) — net-new; runs on P05 (audit), P06 (legacy migration); consumes G01/G03/G09.
2. **Seniority/promotion case engine** (FR-001/002/004/005/020) — net-new; DPC adjudication runs on **P01** (committee-as-workflow); audit on P05.
3. **Reservation roster + own-merit migration** (FR-006) — net-new; approvals on P01; audit on P05.
4. **Sanctioned-post / establishment register** (FR-015) — net-new; maker-checker on P01.
5. **Legal-case linkage / sub-judice guard + correction-lineage cascade** (FR-017/018) — net-new; approval on P01, cascade on X.1, pay-anomaly to G10, SR correction to G12.
6. **MACP cap/clock + refusal consequence** (FR-011/019) — net-new; screening/sanction on P01, due-detection on X.1, pay event to G10.

These are exactly the **G06 net-new entities** registered in `MODULE_RECONCILIATION.md` §D (`seniority_list`, `promotion_case`, `dpc_proceedings`, `posting_history`, plus the v2-expanded set), all **running on P01 (sanction) + P05 (audit)** and **emitting SR events to G12**.

---

## Amendments (v2 → v3: platform re-grounding)

Every change from v2.0 (`M06-PPP`) to v3.0 (`G06`) is a **platform re-grounding** — no statutory capability, entity, field, rule, state, or worked example was removed; the technical substrate was re-anchored onto PrimeSoft. (The v1→v2 statutory improvements remain in §1.7.)

| # | v2 (invented `SHARED_FOUNDATION`) | v3 (platform-grounded) | Authority |
|---|---|---|---|
| A1 | Module code `M06-PPP`; cross-refs `M01/M03/M05/M07/M08/M09/M10/M11/M12/M13/M14` | **G06**; cross-refs re-keyed to **G01/G03/G05/G07/G08/G09/G10/G11/G12/G13/G14** | Reconciliation §B |
| A2 | Maker-checker "via shared `workflow_instances`/`workflow_tasks`" | **P01 WorkflowEngine** (`workflows`/`workflow_instances`/`workflow_actions`); DPC = committee-as-workflow with **PARALLEL_ALL_OF** members + **DYNAMIC_APPROVER** authority; in-flight version pinning; idempotent stage-advance | Platform §P01; Reconciliation §C |
| A3 | Local `audit_log` "shared platform" table | **P05 dual-log** (`audit_log` + `security_audit_log`) via **DB trigger**, immutable, ≥7-yr, 100% capture; no module-defined audit_log; tamper-evidence tracks OPEN-PLAT-03 | Platform §P05; Reconciliation §C |
| A4 | `service_register_events` treated as a shared platform entity | **G12 net-new gov SR ledger on the P05 substrate** (not a platform primitive); G06 writes idempotently, keyed `source_module=G06`+`source_reference_id` | Reconciliation §C/§D |
| A5 | RBAC: invented flat role list (DPC, Appointing Authority, Legal Officer, Auditor, Sys Admin…) | **RBAC v1.7** model; gov actors expressed as existing roles or **new roles + capability flags ADDED** (`g06_dpc_member`, `g06_appointing_authority`, `g06_reviewing_authority`, …); Auditor→Org-Admin read; SoD enforced by P01/P02; MFA for high-privilege roles | RBAC §6.6; Reconciliation §C |
| A6 | Field-level access described in prose | **P02 field masking on serialization** + PII Protection Ceiling for APAR/disciplinary/category | Platform §P02 |
| A7 | Error codes `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `INTERNAL_ERROR(500)`, `UPSTREAM_UNAVAILABLE(503)` | Platform 8-code table: `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `CONFLICT(409)`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)`; **no 503** (upstream → 412/500 via X.3) | Foundation §1; Reconciliation §C |
| A8 | Error envelope `{error:{code,message,field}, requestId}` | Platform envelope `{error:{code,message,field,details}}`; correlation id is the **`X-Correlation-Id` response header**, not body `requestId` | Foundation §1; Reconciliation §C |
| A9 | Pagination "max page size 100", `?page=&limit=` | **Cursor pagination only**: `?limit=` default 25 / max 100 + `cursor=` → `next_cursor`; offset paging removed | Foundation §1; Reconciliation §C |
| A10 | Idempotency unspecified | **`Idempotency-Key`** header on workflow-initiating / SR / order-effect / MACP-sanction / cascade POSTs (24h replay) | Foundation §1 |
| A11 | Multi-tenancy omitted | **`tenant_id`/`entity_id`** non-nullable on every entity; **data-layer scoping**; unscoped query rejected | Platform §0.1; Reconciliation §C |
| A12 | NFR 99.9% uptime, RPO ≤ 15min | Platform baseline **99.5%/month**, **RPO < 1h**, **RTO < 4h**, p95 < 500ms; soft-delete only | Platform §8.2; Reconciliation §C |
| A13 | Notifications "shared ledger" | **X.2** infra + **W.3** config; templates by **`MSG-G06-*`** id; statutory notices mandatory/non-suppressible (BRD §9.9) | Platform §X.2; BRD §9.9 |
| A14 | Background jobs implicit (schedulers/cron in prose) | **X.1** runner; jobs registered as **`JOB-G06-EFFDATE/-MACP-DUE/-PROGRESSION/-CORRECTION-CASCADE/-SEALED-RECONCILE/-APAR-PURGE/-ESTAB-RECONCILE`** in the Foundation §4 index; retry ×3 → JOB-FAIL/MSG-SYS-JOBFAIL | Platform §X.1; Foundation §4 |
| A15 | Migration undefined | **P06 ETL+V**: 3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability column (replaces `darwinbox_source_id`) | Platform §P06; Reconciliation §C/§D |
| A16 | Canonical `employees`/`designations`/`cadres`/`pay_scales` "referenced" generically | Bound to the real **G01 employee master + org/grade masters**; cite `VAL-GRADE-BAND`, `VAL-MASTER-UNIQUE`, `VAL-ORG-NOCYCLE`; **never forked** | Reconciliation §A/§D; Foundation §2 |
| A17 | APAR (M08) / vigilance (M09) read generically | **Consumed by reference from G08 (APAR) and G09 (vigilance), not forked**; G09 case-conclusion via X.3 event subscription | Reconciliation §A; §2.4 |
| A18 | Validation rules partly inline | Cite platform `VAL-*`; author module-unique **`VAL-G06-*`** (§9.5) registered in Foundation §2 index | Foundation §2/§7 |
| A19 | Forms/flows described as bespoke screens | **W.1 flow definitions** (DPC, order issue, MACP, correction, de-reserve) + **W.2 form definitions** (objection, roster fill, refusal) — configured, not coded | Platform §W.1/§W.2 |
| A20 | `increment_monitor.m10_increment_ref` | renamed **`g10_increment_ref`**; G10 remains system-of-record (mirror only) | impr. #18; Reconciliation §A |
| A21 | Two new required sections absent | Added **`## Alignment with PrimeSoft Platform`** (FR→service map) and this **`## Amendments (v2 → v3)`** table; Final Reconciliation Table (§15.4) extended with **platform rows**, 0 gaps | Task brief; Foundation §9.6 |

---

## Amendments (v3 → v3.1: cross-module remediation)

Surgical convergence onto the **G12-frozen SR ingestion contract** per the authoritative remediation spec (`docs/review/REMEDIATION.md` D1/D2; R1 findings F-02/F-03/F-07). No statutory capability, entity, field, rule, state, or worked example was removed.

| # | v3.0 | v3.1 (remediated) | Authority |
|---|---|---|---|
| R1 | SR posting described generically ("post to G12"); write-path implied via `SrPostingGateway` | **Canonical write-port `POST /api/v1/sr/ingest`** (reversals `…/ingest/reversal`) is the only ledger write-path; any `…/post-to-sr` façade **relays to it**; never `/api/v1/sr/events` or direct INSERT (§2.2, §9.7.1, FR-007 API) | REMEDIATION D1 |
| R2 | Free-form event descriptions (promotion/officiating/confirmation/posting) | **Exact G12-published `event_type` codes pinned** in §9.7.1: `PROMOTION`, `OFFICIATING`, `MACP`, `CONFIRMATION`, `POSTING`, `REVERSION` (+ partners `PROMOTION_CANCELLED`, `OFFICIATING_CANCELLED`); `POSTING` is a G06 event | REMEDIATION D1; F-03 |
| R3 | Dedup key `source_module=G06`+`source_event_id`; no `fact_key`; tenant/entity implicit | **Renamed `source_event_id` → `source_reference_id`**; dedup is the tuple `(source_module="G06", source_reference_id, source_event_version)` with explicit `source_module`; **mandatory `fact_key`** (qualifying-service-bearing; missing → `SR_FACT_KEY_REQUIRED`); explicit `tenant_id`+`entity_id` (§2.2, §2.4, §9.5 `VAL-G06-SR-EVENT`, §9.6, §9.7/§9.7.1, §13.x idempotency) | REMEDIATION D1; F-02 |
| R4 | Pay-fixation hand-off to G10 stated, but SR ownership of the pay event ambiguous | **No double-claim:** G06 posts the **establishment** event only; the **pay SR event is G10's** (`PAY_FIXATION` / `ANNUAL_INCREMENT`). G06 references G10 for the pay event and does NOT post it (§9.7.1, §9.7 G10 row, FR-007 AC#4, §9.6 example) | REMEDIATION D2; F-07 |
| R5 | Corrections posted "SR correction" without a named envelope | **Reversal envelope** `is_reversal=true` + `reverses_source_reference_id` (+ `*_CANCELLED` partner types); supersede-only; G12 auto-spawns corrigendum (§9.7.1, §9.6 cascade example) | REMEDIATION D1 |

---

*End of G06 Promotion, Posting & Progression Monitoring BRD v3.0 — platform-grounded. Preserves all v2.0 statutory content and rigor; re-anchored onto the PrimeSoft platform (P01–P06, X.1–X.3, W.1–W.3) with 0 unresolved reconciliation gaps.*









