# Promotion, Posting & Progression Monitoring — HRMS Module BRD (v2.0)

**Module code:** M06-PPP
**Program:** Enterprise HRMS Suite ("PeopleGov / HRMS Suite") — government/public-sector HCM
**Document version:** v2.0 (revised; supersedes v1.0)
**Status:** Approved for build (parallel-agent ready) — incorporates Adversarial Council adopted improvements
**Authoring standard:** Conforms to the program Shared Foundation Brief (`/docs/brd/SHARED_FOUNDATION.md`). Canonical entities (`employees`, `users`, `org_units`, `designations`, `cadres`, `pay_scales`, `roles`, `audit_log`, `documents`, `notifications`, `service_register_events`, `workflow_instances`/`workflow_tasks`) are **referenced, not redefined**.
**Revision basis:** Council report `/Users/n15318/hrms/docs/evaluation/M06-promotion-posting-progression-council.md` — all 21 Adopted Improvements and every High/Critical Risk-Register mitigation are incorporated (see Amendments table in §1.7).

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Promotion, Posting & Progression Monitoring module (M06-PPP) is the statutory and managerial engine that governs how a public-sector employee **moves upward** through the organisation: how seniority is established (including **multi-stream inter-se seniority** across direct recruits, promotees and LDCE qualifiers), how promotions are adjudicated by Departmental Promotion Committees (DPCs) and promotion panels, how the resulting orders and probation are managed, how financial up-gradation schemes (ACP/MACP) are sanctioned even in the absence of a functional promotion, how the employee is **posted** into the new role, and how the organisation **monitors** every employee's progression — due-for-promotion alerts, stagnation, increment timeliness, and career-path modelling.

Promotion in a government context is a **quasi-judicial, rule-bound, reservation-aware, audit-heavy, and frequently litigated** process. A wrongly computed seniority position, an overlooked vigilance case, a mis-applied reservation roster point, an **own-merit reserved candidate wrongly counted against a reserved point**, reliance on an **uncommunicated adverse APAR**, or an **un-recorded court stay** can each trigger litigation, tribunal proceedings, and the unwinding of an entire promotion batch. M06-PPP therefore treats **a single versioned service-fact ledger, eligibility computation, panel adjudication, roster compliance with own-merit migration, court/tribunal linkage, correction-lineage cascades, and immutable service-register posting** as first-class, fully-audited capabilities.

### 1.2 Business context & statutory drivers

- **Seniority** is the spine of public-sector careers. It determines eligibility zones, panel inclusion, and order-of-promotion. The same feeder grade is commonly fed by **multiple recruitment streams** (direct recruitment, promotion, LDCE/departmental examination, deputation-absorption); their **combined inter-se seniority** under rota/quota rotation of vacancies (the `N.R. Parmar` line of disputes) must be constructible and defensible. Tentative seniority lists are published, objections invited, disposed, and a final list notified — all with statutory cut-off dates.
- **Departmental Promotion Committee (DPC)** is the constitutional body that evaluates the eligible field and prepares Select Lists. A select panel has a **validity period** (typically one panel year); promotions from an expired panel are illegal.
- **APAR usability** is statutory: per `Dev Dutt v. Union of India`, a below-benchmark/adverse APAR entry that was **not communicated** to the employee (with the representation disposed) **cannot be relied upon** by a DPC. A DPC that supersedes on an uncommunicated entry is voidable.
- **Reservation-in-promotion** (SC/ST/OBC/EWS/PwBD) is constitutionally gated: it requires the State to hold **quantifiable data of inadequacy of representation and effect on administrative efficiency** (`M. Nagaraj` / `Jarnail Singh`), correct **own-merit migration** (a reserved candidate selected on merit against an unreserved point must be adjusted against UR, not consume a reserved point), **consequential seniority vs catch-up** treatment, creamy-layer (OBC)/EWS **certificate currency as of the crucial date**, carry-forward, de-reservation limits, the 50% ceiling, and PwBD horizontal reservation.
- **Vigilance/disciplinary clearance** is a precondition; the **sealed cover** procedure must be supported where a charge is pending, with a mandatory periodic-review SLA and a partially-upheld minor-penalty branch.
- **Financial up-gradation** schemes (Time-Bound Promotion / Assured Career Progression / Modified Assured Career Progression — ACP/MACP) guarantee pay progression on completion of qualifying service (e.g., 10/20/30 years), capped at **three financial up-gradations in a career**, with intervening regular promotions reducing the remaining entitlement and **refusal of promotion** stopping/forfeiting the MACP clock per policy.
- **Litigation awareness:** promotion orders are routinely issued "subject to the outcome of OA/SLP No. …", stayed by interim orders, and reopened on contempt. Any case/order/seniority list may be **sub judice**; the system must represent litigation references, interim stays, and **correction-lineage cascades** (a court-ordered retrospective promotion re-ranks an entire list and may require **stepping-up/pay-anomaly** flagging to M10).
- Every promotion, posting, officiating arrangement, probation declaration, and financial up-gradation is a **statutory service event** that must post to the Digital Service Register (M12) as an append-only entry.

### 1.3 Scope summary

In scope: **sanctioned-post/establishment-strength register and vacancy computation**; a single versioned **qualifying-service ledger with pinned exclusion rules**; multi-stream seniority management; eligibility computation (with APAR-usability and certificate-currency gates); DPC/panel workflow with **panel currency**; select-list and promotion-order generation; **refusal-of-promotion consequence management**; probation lifecycle; ad-hoc/officiating/in-situ promotion; **LDCE/departmental-examination channel**; ACP/MACP financial up-gradation; reservation roster with **own-merit migration and consequential-seniority handling**; **legal-case linkage and sub-judice handling**; **correction-lineage and retrospective recompute cascades**; post-promotion posting; and progression monitoring (due-for-promotion, stagnation, increment monitoring as a *monitoring view* with M10 as system-of-record, and an explicitly-advisory career-path & succession layer).

Out of scope (owned elsewhere): APAR capture & ratings (M08, referenced), disciplinary/vigilance case management (M09, referenced), lateral transfer/relieving/joining mechanics (M05, reused for posting movement), payroll **fixation arithmetic and increment execution** (M10 — M06 sanctions/monitors and hands off the pay event; M10 is system-of-record for increments and stepping-up arithmetic), the SR ledger itself (M12, M06 writes events), competency master (M07), enterprise analytics (M14).

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
| Audit integrity | Promotion events posted to Digital SR | 100%, reconciled |
| Litigation reduction | Promotion orders set aside on procedural grounds | Year-on-year decline |

### 1.5 Module personas (summary)

HR Officer (case preparation), Establishment/Seniority Section, Reservation/Roster Officer, Vigilance Clearance Officer, DPC Member & DPC Secretary, Reviewing/Appointing Authority, Department Head, **Establishment-Strength Officer** (sanctioned posts), **Legal/Litigation Officer** (court-case linkage), Employee (self-service progression view & representations), SR Custodian (M12), Auditor (read-only), System Administrator. Full matrix in Section 3.

### 1.6 Reckoning-Dates reference (authoritative — see also §5.8)

Five distinct dates govern this module and must never be conflated. The crisp definitions and their worked relationship are pinned once in **§5.8 (Reckoning Dates reference box)** and the Glossary (§16.1).

### 1.7 Amendments (v1 → v2)

Every adopted improvement and every High/Critical Risk-Register mitigation from the council report is incorporated as a concrete requirement, entity, field, rule, state or control.

| # | Adopted improvement / risk mitigated | Where & how incorporated in v2 |
|---|---|---|
| 1 | `sanctioned_posts`/establishment entity; replace free-integer `vacancy_count`; FR-012 validates against it (Critical) | New entity §5.2.25 `sanctioned_posts`; new **FR-PPP-015**; `promotion_cases.vacancy_count` now derived/validated; FR-004 & FR-012 reference it; integrity rule §5.6-15 |
| 2 | APAR-usability gate (Dev Dutt) (Critical) | New fields `apar_communicated`, `apar_representation_status` on `eligibility_assessments` (§5.2.5); rule in **FR-003** (AC, BR, edge); rule-trace exposes it; integrity rule §5.6-16 |
| 3 | Own-merit reserved-candidate migration (Critical) | New field `adjusted_against_category` on `roster_points` (§5.2.17); **FR-006** rules + compliance report; integrity rule §5.6-6 restated |
| 4 | Multi-stream / inter-se seniority + rota-quota | New fields on `seniority_entries` (§5.2.2); new entity §5.2.28 `seniority_quota_rules`; new **FR-PPP-020**; FR-001 amended; worked example Appendix D.4 |
| 5 | `legal_case_links` entity; `subject_to_litigation`; INTERIM_STAYED (High) | New entity §5.2.29 `legal_case_links`; new **FR-PPP-017**; flags/states on cases/orders/lists; state tables §11 |
| 6 | Correction-lineage / recompute cascade (High) | New entity §5.2.30 `correction_events`; new **FR-PPP-018**; supersession extended; cascade job |
| 7 | Stepping-up / pay-anomaly flow to M10 (High) | FR-PPP-018 raises `PAY_ANOMALY_STEPPING_UP` signal to M10; integration §9.5; `correction_events.pay_anomaly_flag` |
| 8 | Consolidate into one versioned `QualifyingServiceLedger` (5th shared contract) | New entity §5.2.26 `qualifying_service_ledger`; new **FR-PPP-016**; FR-003/011/013/014 cite it; locked in §15.4 |
| 9 | Qualifying-service exclusion rules pinned | New entity §5.2.27 `service_exclusion_rules`; FR-PPP-016 rules; worked example Appendix D.3 |
| 10 | Pin four rule kernels to worked numeric examples + test vectors | New **Appendix D** (§16.5) — zone, roster, qualifying-service, multi-stream worked vectors |
| 11 | DPC select-panel currency; supplementary/review DPC | New fields `panel_valid_from`/`panel_valid_until` on `promotion_panels` (§5.2.7); FR-005 rules; integrity rule §5.6-17 |
| 12 | Refusal-of-promotion consequences (debarment + MACP clock) (High) | New entity §5.2.32 `promotion_refusals`; new **FR-PPP-019**; wired FR-007→FR-011; integrity rule §5.6-18 |
| 13 | Correct MACP-cap integrity rule | §5.6 rule 10 restated; FR-011 BR corrected |
| 14 | LDCE / departmental-exam channel + structured exam-result gate | New entity §5.2.31 `exam_results`; `eligibility_rules.channel` += LDCE; `promotion_mode` += LDCE; FR-003/016 gates; `requires_qualification` VARCHAR replaced by `qualification_exam_ref` |
| 15 | Reservation enabling justification (Nagaraj/Jarnail); consequential seniority vs catch-up; single-post exemption (High) | New fields on `reservation_rosters` (§5.2.16: `enabling_provision_ref`, `quantifiable_data_doc_id`, `consequential_seniority_mode`, `roster_applicable`); FR-006 rules |
| 16 | DPDP/privacy on eligibility snapshot; creamy-layer/EWS currency (High) | §10 DPIA note + field-level access; `eligibility_assessments` fields `obc_creamy_layer_status`, `ews_cert_valid_on_crucial_date`; retention rule for `apar_detail_json`; FR-003 |
| 17 | "Reckoning Dates" reference box | New §5.8 + §1.6 + Glossary |
| 18 | Increment-monitoring ownership vs M10 | FR-013 amended: `increment_monitor` is a **monitoring/alerting view**; M10 system-of-record; integration §9.5; integrity rule §5.6-19 |
| 19 | M09 sealed-cover dependency = event (with poll degradation) + max-age SLA | §16.3 confirmed; FR-008 periodic-review SLA rule + `sealed_cover_review_due` |
| 20 | Missing terminal/edge states | `promotion_postings.status` += `NOT_JOINED`; sealed-cover `PARTIALLY_UPHELD_MINOR_PENALTY` branch; officiating `TERMINATED` (superseded-by-regular) guard; state tables §11 |
| 21 | Talent layer (FR-014) marked advisory/optional, boundary vs M07/M14 | FR-014 re-scoped advisory; §2.3 boundary note |

---

## Section 2 — Scope & Boundaries

### 2.1 Feature Module Map

| Sub-module | Code | Description | Key entities |
|---|---|---|---|
| Establishment & Vacancy | PPP-EST | Sanctioned strength, filled/vacant, quota split, vacancy computation | `sanctioned_posts` |
| Qualifying-Service Ledger | PPP-QSL | Single versioned service-fact ledger + exclusion engine | `qualifying_service_ledger`, `service_exclusion_rules` |
| Seniority Management | PPP-SEN | Cadre-wise seniority lists, multi-stream rota-quota, eligibility zone, tentative/final, objections | `seniority_lists`, `seniority_entries`, `seniority_objections`, `seniority_quota_rules` |
| Eligibility Computation | PPP-ELG | Rule-driven eligibility (qualifying service, APAR-usability, vigilance, roster, exam, certificate currency) | `eligibility_rules`, `eligibility_assessments`, `exam_results` |
| Promotion Case & DPC | PPP-DPC | Promotion case, DPC/panel constitution with currency, proceedings, select list | `promotion_cases`, `promotion_panels`, `promotion_panel_members`, `promotion_candidates`, `dpc_proceedings` |
| Promotion Orders & Probation | PPP-ORD | Order generation, acceptance, refusal consequence, probation | `promotion_orders`, `probation_records`, `promotion_refusals` |
| Ad-hoc / Officiating / In-situ | PPP-OFF | Temporary upward arrangements pending regular promotion | `officiating_arrangements` |
| Financial Up-gradation (ACP/MACP) | PPP-FIN | Time-bound/assured career progression sanctions | `financial_upgradations`, `macp_assessments` |
| Posting after Promotion | PPP-POST | Place promoted employee into a post/station | `promotion_postings` (reuses M05 movement) |
| Reservation Roster | PPP-ROS | Roster registers, point allocation, own-merit migration, carry-forward, de-reservation, enabling justification | `reservation_rosters`, `roster_points` |
| Legal & Sub-judice | PPP-LEG | Court/tribunal linkage, interim stays, subject-to-outcome | `legal_case_links` |
| Correction & Recompute | PPP-COR | Correction-lineage, retrospective re-rank cascade, pay-anomaly flag | `correction_events` |
| Progression Monitoring | PPP-MON | Due-for-promotion, stagnation, increment monitoring (view) | `progression_alerts`, `increment_monitor` |
| Career-Path & Succession (advisory) | PPP-CAR | Career-path models, succession plans, eligibility dashboards | `career_paths`, `career_path_stages`, `succession_plans`, `succession_candidates` |

### 2.2 Common Capabilities (inherited from Shared Foundation, applied here)

- **Maker-checker** on every statutory artefact (seniority list publication, select list approval, order issue, MACP sanction, de-reservation, correction-event approval) via shared `workflow_instances`/`workflow_tasks`.
- **Immutable audit** (`audit_log`) on every state change; **append-only SR posting** (`service_register_events`) on every promotion/posting/financial event.
- **Document management** (M13 `documents`) for DPC minutes, orders, objection letters, roster registers, Nagaraj quantifiable-data records, court orders — versioned, access-controlled.
- **Notifications** (shared ledger) for alerts, panel invitations, order publication, representation acknowledgements, sealed-cover review reminders, stay notifications.
- **RBAC + org-unit row-level scoping**; **field-level access control** on the most sensitive PII concentration (APAR + disciplinary + reservation category in `eligibility_assessments`); **segregation of duties** (maker ≠ checker; no self-promotion adjudication).
- **Pagination** (max page size 100) on all list endpoints; **i18n** (DD-MMM-YYYY, INR).

### 2.3 In-scope / Out-of-scope boundary table

| Capability | In M06 | Owned/relied elsewhere |
|---|---|---|
| Sanctioned strength & vacancy computation | ✅ | Post sanction orders may originate from establishment authority (master data) |
| Qualifying-service ledger & exclusions | ✅ | Source leave/EOL/suspension facts from M03/M09; service dates from M01 |
| Multi-stream seniority computation & lists | ✅ | Source person/job data from M01 |
| Eligibility rule engine (APAR-usability, certificate currency) | ✅ | APAR ratings + communication status from M08; disciplinary/vigilance from M09 |
| DPC / panel proceedings, panel currency | ✅ | — |
| Promotion orders, refusal consequence & probation | ✅ | Document storage M13 |
| Officiating/ad-hoc/in-situ | ✅ | — |
| ACP/MACP sanction | ✅ (sanction) | Pay fixation arithmetic & disbursement M10 |
| Posting movement execution | ✅ (initiate) | Relieving/joining mechanics reuse M05 |
| Legal-case linkage & sub-judice flags | ✅ | Court case management itself is external; M06 stores references only |
| Correction-lineage & re-rank cascade | ✅ | Pay stepping-up arithmetic executed by M10 (M06 detects & flags) |
| Increment monitoring | ✅ (monitoring/alerting view only) | **M10 is system-of-record & executor** for increments and stepping-up |
| Service event ledger | Writes events | Ledger owned by M12 |
| Career-path/succession/9-box (advisory) | ✅ (advisory, optional, lighter than statutory kernels) | Competency master M07; enterprise analytics M14 — M06 must not duplicate |

**Talent-layer boundary note (improvement #21):** FR-PPP-014 (career-path, succession, 9-box) is explicitly **advisory and optional**. It consumes competencies from **M07** and feeds analytics to **M14**; it must **not** auto-promote, must not be a source of truth for competencies, and must be built lighter than the litigation-bearing kernels (FR-016 qualifying service, FR-006 roster, FR-004 zone, FR-020 multi-stream seniority).

### 2.4 Assumptions & dependencies

- M01 provides authoritative `employees`, `designations`, `cadres`, `pay_scales`, `org_units`.
- Establishment/sanction authority provides post-sanction master data feeding `sanctioned_posts`.
- M08 exposes a stable APAR read API returning per-year grading + benchmark band **and `communicated`/`representation_status`** (improvement #2).
- M09 exposes a disciplinary/vigilance status read API **and emits case-conclusion events** (sealed cover); degrades to scheduled reconciliation if only status read is available (improvement #19).
- M10 consumes the MACP/promotion pay event, **is system-of-record for increments**, and executes **stepping-up** on a pay-anomaly signal (improvements #7, #18).
- M12 accepts SR event writes idempotently (keyed by `source_module` + `source_event_id`).
- M05 provides the relieving/joining workflow that PPP-POST hands a promotion-posting movement to.
- Reservation policy parameters (percentages, roster cycle length, enabling-provision references) are configurable master data, not hard-coded.

---

## Section 3 — Roles & Permissions

### 3.1 Module roles (extend shared baseline)

| Role | Description | SoD note |
|---|---|---|
| Employee (Self-Service) | Views own seniority position, eligibility, progression timeline; files objections/representations | Cannot view others' comparative data |
| Establishment/Seniority Officer | Builds/maintains seniority lists (incl. multi-stream), disposes objections | Maker for seniority; cannot self-approve publication |
| Establishment-Strength Officer | Maintains `sanctioned_posts` (strength, filled/vacant, quota split) | Independent of case maker; vacancy figures audited |
| HR Officer (Promotion Desk) | Prepares promotion cases, assembles eligible field, drafts orders | Maker; cannot be a panel member on own case |
| Reservation/Roster Officer | Maintains rosters, validates roster-point compliance, records own-merit migration & enabling justification | Independent control on DPC select list |
| Vigilance Clearance Officer | Records vigilance/disciplinary clearance or sealed-cover flag | Read from M09; attests clearance |
| DPC Secretary | Convenes DPC, records proceedings, compiles select list, tracks panel currency | Cannot vote/grade |
| DPC Member / Panel Member | Evaluates candidates, assigns benchmark verdict | Cannot be in own promotion field |
| Appointing/Reviewing Authority | Approves select list, signs promotion/MACP orders, approves correction events & de-reservation | Checker; maker ≠ checker enforced |
| Department Head | Sanctions officiating arrangements, posting decisions | — |
| Legal/Litigation Officer | Maintains `legal_case_links`, records interim stays, subject-to-outcome flags | Write only to legal entities; cannot adjudicate promotion |
| SR Custodian (M12) | Confirms SR posting reconciliation | Read-only into M06 |
| Auditor | Read-only across module + audit log | No write |
| System Administrator | Configures eligibility/exclusion/quota rules, roster policy, career-path templates | No transactional self-approval |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=none)

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

---

## Section 4 — Shared Application Foundation (inherited)

This module **inherits** the program technical defaults (Shared Foundation §5) without restating them as new requirements:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST API under `/api/v1`; PostgreSQL; encrypted object storage for documents; CGG Data Centre deployment.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + org-unit row-level scoping (a DPC member sees only candidates within authorised cadre/org scope). **Field-level access control** additionally restricts the APAR/disciplinary/category concentration in `eligibility_assessments` (improvement #16).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module-specific (Section 9).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit, DPDP Act 2023 alignment **with a module DPIA for the eligibility snapshot** (§10.2), statutory retention.
- **NFR baseline:** P95 API < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h (module-specific NFRs in Section 10).
- **Shared engines reused:** `workflow_instances`/`workflow_tasks` (maker-checker), `audit_log`, `documents` (M13), `notifications`, `service_register_events` (M12).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose | v2 change |
|---|---|---|---|---|---|
| 1 | `seniority_lists` | Module | M06 | A cadre/grade-scoped seniority list (tentative or final) | UNDER_CORRECTION state |
| 2 | `seniority_entries` | Module | M06 | One employee's position within a seniority list | +recruitment_stream, +quota fields |
| 3 | `seniority_objections` | Module | M06 | Objection/representation against a tentative entry | — |
| 4 | `eligibility_rules` | Module | M06 | Configurable rule set per promotion channel | +LDCE channel, qualification_exam_ref |
| 5 | `eligibility_assessments` | Module | M06 | Computed eligibility result per employee per case | +APAR-usability, +cert-currency, cites QSL |
| 6 | `promotion_cases` | Module | M06 | A promotion exercise | vacancy from sanctioned_posts; +INTERIM_STAYED |
| 7 | `promotion_panels` | Module | M06 | DPC/panel constituted for a case | +panel currency |
| 8 | `promotion_panel_members` | Module | M06 | Membership of a panel | — |
| 9 | `promotion_candidates` | Module | M06 | A candidate considered in a case | +own-merit linkage |
| 10 | `dpc_proceedings` | Module | M06 | DPC meeting record, benchmark, minutes, select list | — |
| 11 | `promotion_orders` | Module | M06 | Issued promotion order | +subject_to_litigation, +INTERIM_STAYED |
| 12 | `probation_records` | Module | M06 | Probation period & declaration | — |
| 13 | `officiating_arrangements` | Module | M06 | Ad-hoc/officiating/in-situ arrangement | +SUPERSEDED_BY_REGULAR guard |
| 14 | `financial_upgradations` | Module | M06 | ACP/MACP sanction record | cap rule corrected, refusal effect |
| 15 | `macp_assessments` | Module | M06 | Screening committee assessment | — |
| 16 | `reservation_rosters` | Module | M06 | Roster register per cadre/grade | +enabling justification, +consequential seniority, +exemption |
| 17 | `roster_points` | Module | M06 | Individual roster point | +adjusted_against_category (own-merit) |
| 18 | `promotion_postings` | Module | M06 | Posting of promoted employee | +NOT_JOINED state |
| 19 | `career_paths` | Module | M06 | Career-path model template (advisory) | — |
| 20 | `career_path_stages` | Module | M06 | Ordered stage within a career path (advisory) | — |
| 21 | `succession_plans` | Module | M06 | Succession plan (advisory) | — |
| 22 | `succession_candidates` | Module | M06 | Identified successor (advisory) | — |
| 23 | `progression_alerts` | Module | M06 | Due-for-promotion/stagnation/increment alert | — |
| 24 | `increment_monitor` | Module | M06 | Increment monitoring **view** (M10 system-of-record) | ownership clarified |
| 25 | `sanctioned_posts` | Module (new) | M06 | Establishment strength, filled/vacant, quota split, vacancy computation | **NEW** (impr. #1) |
| 26 | `qualifying_service_ledger` | Module (new) | M06 | Single versioned, snapshotted, citable service-fact ledger | **NEW** (impr. #8) |
| 27 | `service_exclusion_rules` | Module (new) | M06 | Pinned qualifying-service exclusion logic | **NEW** (impr. #9) |
| 28 | `seniority_quota_rules` | Module (new) | M06 | Rota-quota rotation of vacancies across recruitment streams | **NEW** (impr. #4) |
| 29 | `legal_case_links` | Module (new) | M06 | Court/tribunal reference, interim stay, subject-to-outcome | **NEW** (impr. #5) |
| 30 | `correction_events` | Module (new) | M06 | Correction-lineage + recompute cascade trigger | **NEW** (impr. #6/7) |
| 31 | `exam_results` | Module (new) | M06 | LDCE/departmental-examination result reference | **NEW** (impr. #14) |
| 32 | `promotion_refusals` | Module (new) | M06 | Refusal-of-promotion record with debarment & MACP-clock effect | **NEW** (impr. #12) |
| — | `employees`, `designations`, `cadres`, `pay_scales` | Canonical | M01 | Referenced (not redefined) | — |
| — | `org_units` | Canonical | Platform | Referenced | — |
| — | `service_register_events` | Canonical | M12 | Written by M06 | — |
| — | `documents` | Canonical | M13 | Referenced | — |
| — | `notifications`, `audit_log`, `workflow_instances`/`workflow_tasks` | Canonical | Platform | Used/written by M06 | — |

### 5.2 Full field tables

#### 5.2.1 `seniority_lists`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `seniority_list_id` | UUID | PK | |
| `list_no` | VARCHAR(40) | UNIQUE, NOT NULL | e.g., `SEN/ASO/2026/01` |
| `cadre_id` | UUID | FK→cadres, NOT NULL | Scope cadre |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | Grade/feeder grade |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | NULL = state-wide |
| `as_on_date` | DATE | NOT NULL | Seniority reckoning date (§5.8) |
| `list_type` | ENUM | NOT NULL | TENTATIVE, FINAL |
| `status` | ENUM | NOT NULL | DRAFT, PUBLISHED_TENTATIVE, OBJECTIONS_OPEN, OBJECTIONS_CLOSED, FINALISED, UNDER_CORRECTION, SUPERSEDED |
| `is_multi_stream` | BOOLEAN | NOT NULL DEFAULT false | True when combined DR/promotee/LDCE list (impr. #4) |
| `quota_rule_id` | UUID | FK→seniority_quota_rules, NULL | Rota-quota applied when multi-stream |
| `objection_window_start` | DATE | NULL | |
| `objection_window_end` | DATE | NULL | |
| `supersedes_list_id` | UUID | FK→seniority_lists, NULL | Prior list replaced |
| `correction_event_id` | UUID | FK→correction_events, NULL | Set when UNDER_CORRECTION (impr. #6) |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | Any active legal_case_link (impr. #5) |
| `published_by` | UUID | FK→users, NULL | Checker who approved publication |
| `document_id` | UUID | FK→documents, NULL | Notified PDF |
| std audit fields | | | created_at/updated_at/created_by/updated_by/is_deleted |

#### 5.2.2 `seniority_entries`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `seniority_entry_id` | UUID | PK | |
| `seniority_list_id` | UUID | FK→seniority_lists, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
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
| `raised_by_employee_id` | UUID | FK→employees, NOT NULL | |
| `target_entry_id` | UUID | FK→seniority_entries, NULL | Entry contested |
| `objection_type` | ENUM | NOT NULL | WRONG_POSITION, WRONG_DATE, OMISSION, CATEGORY_ERROR, STREAM_QUOTA_ERROR, OTHER |
| `grounds` | TEXT | NOT NULL | |
| `supporting_document_id` | UUID | FK→documents, NULL | |
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
| `from_grade_id` | UUID | FK→designations, NOT NULL | Feeder grade |
| `to_grade_id` | UUID | FK→designations, NOT NULL | Promotion grade |
| `channel` | ENUM | NOT NULL | PROMOTION, MACP, OFFICIATING, **LDCE** (impr. #14) |
| `min_qualifying_service_years` | NUMERIC(4,1) | NOT NULL | In feeder grade (net of exclusions per QSL) |
| `min_qualifying_service_months` | INTEGER | NULL | Granular alt |
| `service_exclusion_rule_id` | UUID | FK→service_exclusion_rules, NULL | Which exclusion set applies (impr. #9) |
| `apar_lookback_years` | INTEGER | NOT NULL | e.g., 5 |
| `apar_benchmark` | ENUM | NOT NULL | GOOD, VERY_GOOD, OUTSTANDING |
| `apar_min_count_meeting_benchmark` | INTEGER | NOT NULL | e.g., 4 of 5 |
| `require_apar_communicated` | BOOLEAN | NOT NULL DEFAULT true | Dev Dutt gate (impr. #2) |
| `requires_vigilance_clearance` | BOOLEAN | NOT NULL DEFAULT true | |
| `disqualify_if_penalty_current` | BOOLEAN | NOT NULL DEFAULT true | |
| `qualification_exam_ref` | VARCHAR(60) | NULL | Structured exam/qualification code (replaces free VARCHAR) (impr. #14) |
| `requires_exam_pass` | BOOLEAN | NOT NULL DEFAULT false | LDCE/departmental exam gate |
| `requires_cert_currency` | BOOLEAN | NOT NULL DEFAULT true | OBC creamy-layer / EWS currency-on-crucial-date (impr. #16) |
| `roster_applicable` | BOOLEAN | NOT NULL DEFAULT true | |
| `effective_from`/`effective_to` | DATE | | Versioned rule |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.5 `eligibility_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `assessment_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK→promotion_cases, NULL | NULL for MACP-only |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `qsl_snapshot_id` | UUID | FK→qualifying_service_ledger, NOT NULL | Cited service fact (impr. #8) |
| `qualifying_service_years` | NUMERIC(5,2) | NOT NULL | Copied from QSL snapshot (net of exclusions) |
| `apar_pass` | BOOLEAN | NOT NULL | |
| `apar_detail_json` | JSONB | NULL | Per-year ratings snapshot from M08 — **field-level restricted PII** (§10.2) |
| `apar_communicated` | BOOLEAN | NOT NULL | Were relied-upon entries communicated? (impr. #2) |
| `apar_representation_status` | ENUM | NOT NULL | NONE, PENDING, DISPOSED, NOT_APPLICABLE (impr. #2) |
| `apar_usable` | BOOLEAN | NOT NULL | False ⇒ uncommunicated adverse entry **cannot be relied on** by DPC |
| `vigilance_status` | ENUM | NOT NULL | CLEAR, SEALED_COVER, NOT_CLEAR, PENDING |
| `disciplinary_status` | ENUM | NOT NULL | CLEAR, PENALTY_CURRENT, CHARGE_PENDING |
| `qualification_met` | BOOLEAN | NOT NULL | |
| `exam_result_id` | UUID | FK→exam_results, NULL | LDCE/exam gate (impr. #14) |
| `obc_creamy_layer_status` | ENUM | NULL | NON_CREAMY, CREAMY, NA — currency on crucial_date (impr. #16) |
| `ews_cert_valid_on_crucial_date` | BOOLEAN | NULL | EWS certificate currency (impr. #16) |
| `overall_result` | ENUM | NOT NULL | ELIGIBLE, NOT_ELIGIBLE, SEALED_COVER, PROVISIONALLY_ELIGIBLE |
| `failure_reasons` | JSONB | NULL | Array of reason codes (incl. APAR_NOT_COMMUNICATED, EXAM_NOT_PASSED, EWS_CERT_EXPIRED) |
| `rule_trace_json` | JSONB | NULL | Full explainable trace incl. APAR-usability decision |
| `apar_snapshot_retention_until` | DATE | NULL | Explicit retention for APAR snapshot (impr. #16) |
| `assessed_at` | TIMESTAMP | NOT NULL | |
| std audit fields | | | UNIQUE(`promotion_case_id`,`employee_id`) |

#### 5.2.6 `promotion_cases`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `promotion_case_id` | UUID | PK | |
| `case_no` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `from_grade_id` | UUID | FK→designations, NOT NULL | |
| `to_grade_id` | UUID | FK→designations, NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `org_unit_scope_id` | UUID | FK→org_units, NULL | |
| `sanctioned_post_id` | UUID | FK→sanctioned_posts, NOT NULL | Vacancy source (impr. #1) |
| `vacancy_count` | INTEGER | NOT NULL, CHECK ≥ 0 | **Derived/validated** from `sanctioned_posts` promotion-quota vacancies, not free-entered |
| `vacancy_year` | INTEGER | NOT NULL | DPC cycle/panel year (§5.8) |
| `promotion_mode` | ENUM | NOT NULL | SENIORITY_FIT, SELECTION_MERIT, SENIORITY_CUM_FITNESS, **LDCE** (impr. #14) |
| `eligibility_rule_id` | UUID | FK→eligibility_rules, NOT NULL | |
| `crucial_date` | DATE | NOT NULL | Eligibility reckoning date (§5.8) |
| `status` | ENUM | NOT NULL | DRAFT, FIELD_ASSEMBLED, ELIGIBILITY_DONE, PANEL_CONSTITUTED, DPC_HELD, SELECT_LIST_APPROVED, ORDERS_ISSUED, INTERIM_STAYED, CLOSED, CANCELLED |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | (impr. #5) |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| std audit fields | | | |

#### 5.2.7 `promotion_panels`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `panel_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `panel_type` | ENUM | NOT NULL | DPC, DEPARTMENTAL_SELECTION_COMMITTEE, REVIEW_DPC, SUPPLEMENTARY_DPC, SCREENING_COMMITTEE |
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
| `member_employee_id` | UUID | FK→employees, NULL | Internal member |
| `external_member_name` | VARCHAR(120) | NULL | e.g., UPSC/PSC nominee |
| `member_role` | ENUM | NOT NULL | CHAIRPERSON, MEMBER, SECRETARY, COMMISSION_NOMINEE, EXPERT |
| `attendance` | ENUM | NULL | PRESENT, ABSENT, RECUSED |
| `recusal_reason` | TEXT | NULL | Conflict of interest |
| std audit fields | | | CHECK(member_employee_id IS NOT NULL OR external_member_name IS NOT NULL) |

#### 5.2.9 `promotion_candidates`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `candidate_id` | UUID | PK | |
| `promotion_case_id` | UUID | FK, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
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
| `minutes_document_id` | UUID | FK→documents, NULL | |
| `select_list_count` | INTEGER | NOT NULL | |
| `reserve_list_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `sealed_cover_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `status` | ENUM | NOT NULL | DRAFT_MINUTES, APPROVED, RATIFIED |
| `approved_by` | UUID | FK→users, NULL | Appointing authority |
| std audit fields | | | |

#### 5.2.11 `promotion_orders`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `order_id` | UUID | PK | |
| `order_no` | VARCHAR(40) | UNIQUE, NOT NULL | Gap-free per series |
| `promotion_case_id` | UUID | FK, NULL | NULL for officiating-only |
| `candidate_id` | UUID | FK→promotion_candidates, NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `order_type` | ENUM | NOT NULL | REGULAR_PROMOTION, AD_HOC, OFFICIATING, IN_SITU, MACP, LDCE_PROMOTION |
| `from_designation_id` | UUID | FK→designations, NOT NULL | |
| `to_designation_id` | UUID | FK→designations, NOT NULL | |
| `from_pay_scale_id` | UUID | FK→pay_scales, NULL | |
| `to_pay_scale_id` | UUID | FK→pay_scales, NULL | |
| `effective_date` | DATE | NOT NULL | (§5.8) |
| `notional_date` | DATE | NULL | For notional promotion/seniority (§5.8) |
| `subject_to_litigation` | BOOLEAN | NOT NULL DEFAULT false | "Subject to outcome of OA/SLP" (impr. #5) |
| `acceptance_status` | ENUM | NOT NULL | PENDING, ACCEPTED, DECLINED, DEEMED_ACCEPTED |
| `status` | ENUM | NOT NULL | DRAFT, ISSUED, PUBLISHED, EFFECTED, INTERIM_STAYED, SUPERSEDED, CANCELLED |
| `order_document_id` | UUID | FK→documents, NULL | |
| `sr_event_id` | UUID | FK→service_register_events, NULL | Posting linkage |
| `correction_event_id` | UUID | FK→correction_events, NULL | If issued/superseded via correction (impr. #6) |
| `workflow_instance_id` | UUID | FK→workflow_instances, NULL | |
| std audit fields | | | |

#### 5.2.12 `probation_records`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `probation_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
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
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `arrangement_type` | ENUM | NOT NULL | AD_HOC, OFFICIATING, IN_SITU, CURRENT_DUTY_CHARGE |
| `against_post_id` | UUID | FK→designations, NOT NULL | Higher post held |
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
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `scheme` | ENUM | NOT NULL | TBP, ACP, MACP |
| `upgrade_level` | ENUM | NOT NULL | FIRST, SECOND, THIRD |
| `qsl_snapshot_id` | UUID | FK→qualifying_service_ledger, NOT NULL | Cited service fact (impr. #8) |
| `qualifying_years_completed` | NUMERIC(5,2) | NOT NULL | e.g., 10/20/30 |
| `regular_promotions_availed` | INTEGER | NOT NULL DEFAULT 0 | Reduces remaining MACP entitlement (impr. #13) |
| `clock_reset_date` | DATE | NULL | Reset on intervening regular promotion (impr. #13) |
| `refusal_effect_applied` | BOOLEAN | NOT NULL DEFAULT false | Set if a DECLINED promotion stops/forfeits clock (impr. #12) |
| `due_date` | DATE | NOT NULL | When entitlement falls due |
| `granted_pay_level_id` | UUID | FK→pay_scales, NULL | Next pay level granted |
| `effective_date` | DATE | NULL | |
| `macp_assessment_id` | UUID | FK→macp_assessments, NULL | |
| `status` | ENUM | NOT NULL | DUE, UNDER_SCREENING, SANCTIONED, DEFERRED, REJECTED, EFFECTED |
| `deferral_reason` | TEXT | NULL | e.g., penalty currency |
| `order_id` | UUID | FK→promotion_orders, NULL | MACP order linkage |
| `sr_event_id` | UUID | FK→service_register_events, NULL | |
| std audit fields | | | |

#### 5.2.15 `macp_assessments`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `macp_assessment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `screening_committee_panel_id` | UUID | FK→promotion_panels, NULL | |
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
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | |
| `roster_type` | ENUM | NOT NULL | PROMOTION_RESERVATION, DIRECT_RECRUITMENT, POST_BASED, VACANCY_BASED |
| `cycle_size` | INTEGER | NOT NULL | e.g., 100/200-point |
| `policy_version` | VARCHAR(20) | NOT NULL | Reservation policy applied |
| `roster_applicable` | BOOLEAN | NOT NULL DEFAULT true | False for single-post cadre / exempt grade (impr. #15) |
| `enabling_provision_ref` | VARCHAR(120) | NULL | Statutory enabling provision for reservation-in-promotion (Nagaraj) (impr. #15) |
| `quantifiable_data_doc_id` | UUID | FK→documents, NULL | Inadequacy-of-representation data record (Nagaraj/Jarnail) (impr. #15) |
| `consequential_seniority_mode` | ENUM | NOT NULL DEFAULT CATCH_UP | CONSEQUENTIAL, CATCH_UP — treatment for accelerated reserved promotions (impr. #15) |
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
| `filled_by_employee_id` | UUID | FK→employees, NULL | |
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
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `to_org_unit_id` | UUID | FK→org_units, NOT NULL | Posting office/station |
| `to_post_designation_id` | UUID | FK→designations, NOT NULL | |
| `to_sanctioned_post_id` | UUID | FK→sanctioned_posts, NOT NULL | Validated vacant post (impr. #1) |
| `posting_type` | ENUM | NOT NULL | LOCAL, OUT_STATION, DEPUTATION |
| `m05_movement_id` | UUID | NULL | Reference to M05 movement |
| `report_by_date` | DATE | NULL | Joining deadline |
| `status` | ENUM | NOT NULL | PENDING, RELIEVED, JOINED, NOT_JOINED, CANCELLED |
| `not_joined_consequence` | ENUM | NULL | ORDER_REVIEW, FORFEITED, EXTENSION_GRANTED (impr. #20) |
| `sr_event_id` | UUID | FK→service_register_events, NULL | |
| std audit fields | | | |

#### 5.2.19 `career_paths` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `career_path_id` | UUID | PK | |
| `path_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `path_name` | VARCHAR(120) | NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NULL | |
| `description` | TEXT | NULL | |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.20 `career_path_stages` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `stage_id` | UUID | PK | |
| `career_path_id` | UUID | FK, NOT NULL | |
| `stage_order` | INTEGER | NOT NULL | |
| `designation_id` | UUID | FK→designations, NOT NULL | |
| `typical_years_in_stage` | NUMERIC(4,1) | NULL | |
| `required_competencies` | JSONB | NULL | **Reference** to M07 competencies (read-only; not redefined) |
| std audit fields | | | UNIQUE(`career_path_id`,`stage_order`) |

#### 5.2.21 `succession_plans` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_plan_id` | UUID | PK | |
| `critical_position_designation_id` | UUID | FK→designations, NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `incumbent_employee_id` | UUID | FK→employees, NULL | |
| `risk_of_loss` | ENUM | NOT NULL | LOW, MEDIUM, HIGH |
| `status` | ENUM | NOT NULL | DRAFT, ACTIVE, REVIEWED, ARCHIVED |
| std audit fields | | | |

#### 5.2.22 `succession_candidates` (advisory)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `succession_candidate_id` | UUID | PK | |
| `succession_plan_id` | UUID | FK, NOT NULL | |
| `candidate_employee_id` | UUID | FK→employees, NOT NULL | |
| `readiness` | ENUM | NOT NULL | READY_NOW, READY_1_2Y, READY_3Y_PLUS, DEVELOPMENT_NEEDED |
| `bench_rank` | INTEGER | NULL | |
| std audit fields | | | UNIQUE(`succession_plan_id`,`candidate_employee_id`) |

#### 5.2.23 `progression_alerts`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `alert_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `alert_type` | ENUM | NOT NULL | DUE_FOR_PROMOTION, MACP_DUE, STAGNATION, INCREMENT_DUE, PROBATION_ENDING, APAR_GAP_BLOCKING, SEALED_COVER_REVIEW_DUE, REFUSAL_DEBARMENT_ENDING |
| `due_date` | DATE | NULL | |
| `severity` | ENUM | NOT NULL | INFO, WARNING, CRITICAL |
| `status` | ENUM | NOT NULL | OPEN, ACKNOWLEDGED, ACTIONED, DISMISSED, EXPIRED |
| `context_json` | JSONB | NULL | Rule trace |
| std audit fields | | | |

#### 5.2.24 `increment_monitor` (monitoring view; M10 system-of-record)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `increment_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `increment_type` | ENUM | NOT NULL | ANNUAL, STAGNATION_INCREMENT, EFFICIENCY_BAR |
| `due_date` | DATE | NOT NULL | |
| `m10_increment_ref` | VARCHAR(60) | NULL | Reference to M10 system-of-record record (impr. #18) |
| `status` | ENUM | NOT NULL | DUE, RELEASED, WITHHELD, DEFERRED — **mirrored from M10**, not authoritative |
| `withheld_reason` | TEXT | NULL | |
| `released_effective_date` | DATE | NULL | |
| std audit fields | | | UNIQUE(`employee_id`,`increment_type`,`due_date`) |

#### 5.2.25 `sanctioned_posts` (NEW — improvement #1)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `sanctioned_post_id` | UUID | PK | |
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | |
| `org_unit_id` | UUID | FK→org_units, NOT NULL | |
| `sanction_order_ref` | VARCHAR(80) | NOT NULL | Post-sanction order reference (master data) |
| `sanctioned_strength` | INTEGER | NOT NULL, CHECK ≥ 0 | Total sanctioned posts |
| `filled_count` | INTEGER | NOT NULL DEFAULT 0, CHECK ≥ 0 | Currently filled |
| `dr_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Direct-recruitment quota share |
| `promotion_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | Promotion-quota share |
| `ldce_quota_pct` | NUMERIC(5,2) | NOT NULL DEFAULT 0 | LDCE-quota share |
| `current_vacancies` | INTEGER | NOT NULL DEFAULT 0 | sanctioned − filled (computed, audited) |
| `anticipated_vacancies` | INTEGER | NOT NULL DEFAULT 0 | Retirements/etc. in cycle |
| `carried_forward_vacancies` | INTEGER | NOT NULL DEFAULT 0 | From prior cycle |
| `as_on_date` | DATE | NOT NULL | Snapshot date |
| `status` | ENUM | NOT NULL | ACTIVE, REVISED, ARCHIVED |
| std audit fields | | | CHECK(filled_count ≤ sanctioned_strength); CHECK(dr+promotion+ldce ≤ 100) |

#### 5.2.26 `qualifying_service_ledger` (NEW — improvement #8)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `qsl_snapshot_id` | UUID | PK | Immutable snapshot row |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | Feeder grade for which service is reckoned |
| `as_of_date` | DATE | NOT NULL | Reckoning date (usually crucial_date) (§5.8) |
| `gross_service_years` | NUMERIC(6,3) | NOT NULL | Before exclusions |
| `total_exclusion_days` | INTEGER | NOT NULL DEFAULT 0 | Sum of excluded periods |
| `net_qualifying_years` | NUMERIC(6,3) | NOT NULL | gross − exclusions |
| `exclusion_breakdown_json` | JSONB | NOT NULL | Itemised EOL/dies-non/suspension/ad-hoc/deputation periods + rule cited |
| `service_exclusion_rule_id` | UUID | FK→service_exclusion_rules, NOT NULL | Rule version applied |
| `computed_by_version` | VARCHAR(20) | NOT NULL | Ledger engine version (citable) |
| `is_current` | BOOLEAN | NOT NULL DEFAULT true | Superseded by recompute on correction |
| `superseding_snapshot_id` | UUID | FK→qualifying_service_ledger, NULL | Lineage |
| `computed_at` | TIMESTAMP | NOT NULL | |
| std audit fields | | | Append-only; never hard-deleted |

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
| `effective_from`/`effective_to` | DATE | | Versioned |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.28 `seniority_quota_rules` (NEW — improvement #4)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `quota_rule_id` | UUID | PK | |
| `rule_code` | VARCHAR(40) | UNIQUE, NOT NULL | |
| `cadre_id` | UUID | FK→cadres, NOT NULL | |
| `grade_designation_id` | UUID | FK→designations, NOT NULL | |
| `dr_quota_ratio` | INTEGER | NOT NULL | e.g., 1 (DR) |
| `promotee_quota_ratio` | INTEGER | NOT NULL | e.g., 1 (PR) |
| `ldce_quota_ratio` | INTEGER | NOT NULL DEFAULT 0 | |
| `rotation_method` | ENUM | NOT NULL | ROTA_QUOTA, RUNNING_ACCOUNT, SEPARATE_STREAM |
| `rotation_start_slot` | ENUM | NOT NULL | DR_FIRST, PROMOTEE_FIRST |
| `unfilled_quota_carry_forward` | BOOLEAN | NOT NULL DEFAULT true | |
| `policy_reference` | VARCHAR(120) | NULL | Governing rule (e.g., N.R. Parmar compliance) |
| `effective_from`/`effective_to` | DATE | | |
| `is_active` | BOOLEAN | NOT NULL | |
| std audit fields | | | |

#### 5.2.29 `legal_case_links` (NEW — improvement #5)

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
| `outcome_document_id` | UUID | FK→documents, NULL | Court order |
| `triggers_correction_event_id` | UUID | FK→correction_events, NULL | On adverse outcome (impr. #6) |
| std audit fields | | | |

#### 5.2.30 `correction_events` (NEW — improvement #6/7)

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
| `pay_anomaly_flag` | BOOLEAN | NOT NULL DEFAULT false | Junior-drawing-more detected → stepping-up signal to M10 (impr. #7) |
| `pay_anomaly_signal_ref` | VARCHAR(60) | NULL | M10 stepping-up signal id |
| `approved_by` | UUID | FK→users, NULL | Appointing authority checker |
| `sr_correction_event_id` | UUID | FK→service_register_events, NULL | SR correction posting |
| std audit fields | | | Append-only lineage |

#### 5.2.31 `exam_results` (NEW — improvement #14)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `exam_result_id` | UUID | PK | |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `exam_code` | VARCHAR(60) | NOT NULL | LDCE/departmental exam identifier |
| `exam_cycle_year` | INTEGER | NOT NULL | |
| `result` | ENUM | NOT NULL | PASS, FAIL, EXEMPTED, AWAITED |
| `marks_or_grade` | VARCHAR(30) | NULL | |
| `merit_rank` | INTEGER | NULL | For LDCE merit ordering |
| `valid_from`/`valid_to` | DATE | | Result currency |
| `result_document_id` | UUID | FK→documents, NULL | |
| std audit fields | | | UNIQUE(`employee_id`,`exam_code`,`exam_cycle_year`) |

#### 5.2.32 `promotion_refusals` (NEW — improvement #12)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `refusal_id` | UUID | PK | |
| `order_id` | UUID | FK→promotion_orders, NOT NULL | The declined order |
| `employee_id` | UUID | FK→employees, NOT NULL | |
| `refusal_date` | DATE | NOT NULL | |
| `refusal_reason` | TEXT | NULL | |
| `debarment_months` | INTEGER | NOT NULL | Configurable debarment window (e.g., 12) |
| `debarment_until` | DATE | NOT NULL | refusal_date + debarment_months |
| `macp_clock_effect` | ENUM | NOT NULL | NONE, STOP, FORFEIT_NEXT, RESET (impr. #12) |
| `next_consideration_after` | DATE | NULL | Earliest re-consideration |
| `status` | ENUM | NOT NULL | ACTIVE, EXPIRED, WAIVED |
| std audit fields | | | |

### 5.3 Relationship map

```
sanctioned_posts ──> promotion_cases (vacancy source) ; ──> promotion_postings (vacant-post validation)
employees (M01) ──< qualifying_service_ledger >── service_exclusion_rules
qualifying_service_ledger ──> eligibility_assessments ; ──> financial_upgradations (cited service fact)
employees ──< seniority_entries >── seniority_lists ──< seniority_objections
seniority_lists >── seniority_quota_rules (multi-stream rota-quota)
employees ──< eligibility_assessments >── eligibility_rules ; eligibility_assessments >── exam_results
promotion_cases ──< eligibility_assessments
promotion_cases ──< promotion_candidates >── seniority_entries ; promotion_candidates >── roster_points (own-merit via adjusted_against_category)
promotion_cases ──< promotion_panels (panel currency) ──< promotion_panel_members
promotion_panels ──< dpc_proceedings >── promotion_cases
promotion_candidates ──< promotion_orders ──< probation_records
promotion_orders ──< promotion_refusals (on DECLINED) ──> financial_upgradations (MACP-clock effect)
promotion_orders ──< promotion_postings ── org_units
promotion_orders >── service_register_events (M12)
employees ──< officiating_arrangements >── promotion_cases (linked) ; >── sanctioned_posts
employees ──< financial_upgradations >── macp_assessments
reservation_rosters ──< roster_points >── promotion_candidates
legal_case_links ──> {promotion_cases, promotion_orders, seniority_lists, roster_points, candidates}
legal_case_links ──> correction_events ──> {seniority_lists, promotion_cases, promotion_orders} (recompute cascade)
correction_events ──> service_register_events (correction posting) ; ──> M10 (pay-anomaly stepping-up signal)
career_paths ──< career_path_stages ── designations (advisory; competencies referenced from M07)
succession_plans ──< succession_candidates ── employees (advisory)
employees ──< progression_alerts ; employees ──< increment_monitor (mirror of M10)
documents (M13) referenced by: seniority_lists, seniority_objections, dpc_proceedings, promotion_orders, reservation_rosters (quantifiable data), legal_case_links, exam_results
audit_log (platform) written by: all state transitions
workflow_instances/tasks (platform) drive: list publication, select-list approval, order issue, MACP sanction, de-reservation, correction-event approval
```

### 5.4 Ownership / Reuse matrix

| Entity | Owner | Read by | Written by |
|---|---|---|---|
| `employees`, `designations`, `cadres`, `pay_scales` | M01 | M06 | M01 only |
| `org_units` | Platform | M06 | Platform |
| `service_register_events` | M12 | M06, M14 | M06 (events), M12 |
| `documents` | M13 | M06 | M06 (uploads via M13 API) |
| `notifications` | Platform | M06 | M06 |
| `audit_log` | Platform | Auditor, M14 | M06 (auto) |
| `workflow_instances/tasks` | Platform | M06 | M06 |
| `sanctioned_posts` | M06 | M06, M14 | Est.-Strength Officer (M06) |
| `qualifying_service_ledger`, `service_exclusion_rules` | M06 | M06 (FR-003/011/013/014), Auditor | M06 (QSL engine) |
| `increment_monitor` | M06 (view) | M06, employee | M06 (mirror); **M10 is system-of-record** |
| `legal_case_links` | M06 | M06, Auditor, M14 | Legal Officer (M06) |
| `correction_events` | M06 | M06, Auditor, M10 (anomaly), M12 | M06; approved by Appointing Authority |
| All other `seniority_*`, `promotion_*`, `eligibility_*`, `dpc_*`, `officiating_*`, `financial_*`, `macp_*`, `reservation_*`, `roster_*`, `career_*`, `succession_*`, `progression_*`, `probation_records`, `exam_results`, `promotion_refusals`, `seniority_quota_rules` | M06 | M14 (analytics), M10/M11 (consume orders & upgradations) | M06 |
| APAR ratings + **communication/representation status** | M08 | M06 (read) | M08 |
| Disciplinary/vigilance status + **conclusion events** | M09 | M06 (read+subscribe) | M09 |
| Increment system-of-record, stepping-up arithmetic | M10 | M06 (mirror/flag) | M10 |

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
5. **Vacancy cap from establishment:** count of `is_selected=true` candidates ≤ `promotion_cases.vacancy_count`, and `vacancy_count` MUST equal the promotion-quota vacancies computed from the linked `sanctioned_posts` (not free-entered) (impr. #1). Reserve list excluded from cap.
6. **Own-merit migration (impr. #3):** a `roster_points.status=FILLED` row links exactly one `filled_by_employee_id`; if the filling candidate `selected_on_own_merit=true`, the point's `adjusted_against_category` MUST be set to an **unreserved (GEN)** point and the candidate must occupy a UR point — a reserved point is **not** consumed. A reserved point cannot be filled by a non-matching category unless `DE_RESERVED`/`INTERCHANGED` with `dereservation_authority_ref`.
7. **Order references valid candidate:** a `REGULAR_PROMOTION`/`LDCE_PROMOTION` order requires `candidate_id` with `dpc_verdict=FIT` and `is_selected=true`.
8. **No self-adjudication:** an employee appearing in `promotion_candidates` for a case cannot be a `promotion_panel_members` member of that case's panel (must `RECUSED`).
9. **SR posting completeness:** every `promotion_orders.status=EFFECTED`, `promotion_postings.status=JOINED`, `financial_upgradations.status=EFFECTED`, and `correction_events.cascade_status=COMPLETED` (with SR impact) must have a non-null `sr_event_id`/`sr_correction_event_id`.
10. **MACP cap (CORRECTED — impr. #13):** at most **3 financial up-gradations** in a career across schemes. Regular promotions **reduce the remaining MACP entitlement** (and may reset the MACP clock per `clock_reset_date`); they do **not** form a combined `promotions + macp ≤ 3` cap. Formally: `count(financial_upgradations EFFECTED) ≤ 3`, and each regular promotion since the last up-gradation resets the qualifying clock.
11. **Probation arithmetic:** `scheduled_end = probation_start + probation_months`; declaration only when `status ∈ {ON_PROBATION, EXTENDED}` and the probation period has lapsed.
12. **Effective dates monotonic:** `promotion_orders.effective_date ≥ DPC approval date` unless `notional_date` recorded with authority reference; see §5.8 for the date hierarchy.
13. **Soft delete:** statutory entities (orders, SR-linked, finalised lists, QSL snapshots, correction events) cannot be hard-deleted; only `SUPERSEDED`/`CANCELLED`/lineage with audit.
14. **Transactional writes:** select-list approval (candidates + proceedings + roster points + workflow), order issue (order + SR event + notification), MACP sanction (upgradation + order + SR event), refusal processing (refusal + MACP-clock effect), and correction-event cascade (recompute + SR correction + pay-anomaly signal) each execute in a single DB transaction.
15. **Sanctioned-strength consistency (impr. #1):** `filled_count ≤ sanctioned_strength`; `current_vacancies = sanctioned_strength − filled_count`; quota percentages sum ≤ 100; FR-012 posting validates the destination `to_sanctioned_post_id` has `current_vacancies > 0`.
16. **APAR-usability gate (impr. #2):** if `eligibility_rules.require_apar_communicated=true`, any below-benchmark/adverse APAR year used against an employee MUST have `apar_communicated=true` with `apar_representation_status ∈ {DISPOSED, NOT_APPLICABLE}`; otherwise `apar_usable=false` and that entry cannot be relied upon — the DPC verdict cannot record supersession citing an unusable entry.
17. **Panel currency (impr. #11):** a promotion order can be generated only while `now ≤ promotion_panels.panel_valid_until`; an `EXPIRED` panel requires a `SUPPLEMENTARY_DPC`/`REVIEW_DPC` re-validation before further orders.
18. **Refusal consequence (impr. #12):** on `promotion_orders.acceptance_status=DECLINED`, a `promotion_refusals` row MUST be created with `debarment_until` and a `macp_clock_effect`; while `status=ACTIVE` the employee is barred from re-consideration before `next_consideration_after`, and the MACP engine applies the recorded clock effect.
19. **Increment ownership (impr. #18):** `increment_monitor` rows are **mirrors** keyed by `m10_increment_ref`; M06 never sets the authoritative release/withhold — it reflects M10. A row without `m10_increment_ref` is an alert-only projection.
20. **Sub-judice guard (impr. #5):** when a `legal_case_links` row with `interim_stay=true` is active on an entity, the entity transitions to `INTERIM_STAYED` and downstream effecting (order effect, finalisation, posting) is blocked until the stay is vacated or the case disposed.
21. **Correction lineage (impr. #6):** any re-rank/recompute of a `FINALISED` list or `EFFECTED` order occurs only via a `correction_events` row (never silent edit); affected QSL snapshots are superseded (new `qsl_snapshot_id`), and `pay_anomaly_flag` triggers the M10 stepping-up signal where a junior would draw more than a senior (impr. #7).

### 5.7 Sample data (2-3 rows per key entity)

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
| rp-08 | ros-01 | 8 | OBC | FILLED | emp-1110 | GEN |  (own-merit: counted against UR, OBC point preserved) |

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
| **effective date** | `promotion_orders.effective_date` | The date the promotion actually takes effect (pay + duties) | Pay fixation hand-off, duties, increment timing |
| **notional date** | `promotion_orders.notional_date` | A date assigned for seniority/pay-step purposes without immediate arrears (e.g., on sealed-cover exoneration or court order) | Notional seniority, stepping-up, correction cascades |

**Worked relationship example.** Case `PROM/2026/ASO-SO/01`: `vacancy_year = 2026`; `crucial_date = 2026-01-01` (eligibility judged here; QSL computed `as_of 2026-01-01`); seniority list `as_on_date = 2026-01-01`; DPC held 2026-03-20 with `panel_valid_until = 2027-03-19`; order `effective_date = 2026-04-01`. A sealed-cover candidate later exonerated (2026-11) is effected with `notional_date = 2026-04-01` (seniority preserved) but arrears only if separately sanctioned — and a `correction_event` re-ranks juniors promoted ahead, raising a stepping-up signal if any junior now draws more.

---

## Section 6 — Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. v2 adds FR-015 to FR-020 and amends FR-001/003/004/005/006/007/008/010/011/012/013/014.

---

### FR-PPP-001 — Cadre-wise Seniority List Generation (multi-stream aware)

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment/Seniority Officer (maker), Appointing Authority (checker)
- **User Story:** As an Establishment Officer, I want to generate a cadre/grade-scoped seniority list reckoned on a chosen date — correctly merging direct recruits, promotees and LDCE qualifiers under the applicable rota-quota — so that promotions and eligibility zones rest on a defensible combined seniority order.
- **Description:** System assembles all employees in a feeder grade within scope, tags each with `recruitment_stream`, computes a provisional rank using a configurable reckoning basis, applies tie-breakers, and where the grade is multi-stream applies the `seniority_quota_rules` rota-quota rotation (see FR-020) to interleave streams, tags reservation category, and produces a `DRAFT` list.

**Acceptance Criteria**
1. Given a cadre + grade + as-on date, the system lists every active employee in that feeder grade within org scope, each tagged with `recruitment_stream`.
2. Ranks are contiguous (1..N) with no duplicates or gaps.
3. When `is_multi_stream=true`, ranks follow the linked `quota_rule_id` rotation; each entry records its `quota_slot_label` and `rotation_cycle_no`.
4. Tie-breaks apply deterministically and the applied basis is recorded per entry.
5. The draft is editable until publication; every manual rank override is audited with a reason.
6. Reservation category is populated from M01 and shown per entry.

**Business Rules**
- Reckoning basis precedence and tie-break order are configuration, not code.
- Multi-stream rotation uses the rota-quota rule effective on `as_on_date`; unfilled quota slots carry forward per the rule.
- Officers on deputation/long leave are included with a status flag but retain seniority position.
- An employee may appear in exactly one active list per scope.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | Create draft header (`is_multi_stream`, `quota_rule_id`) |
| `seniority_entries` | Ranked rows (stream/quota fields) |
| `seniority_quota_rules` | Rota-quota rotation (FR-020) |
| `employees`, `designations`, `cadres` | Source population |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists` | Create + auto-generate entries |
| GET | `/api/v1/seniority-lists/{id}` | Fetch list + entries |
| PATCH | `/api/v1/seniority-lists/{id}/entries/{entryId}` | Manual rank override (audited) |

**UI Behavior Notes:** Wizard (scope → basis → stream/quota → preview ranked grid). Stream column with colour legend; rotation-slot badge; drag-to-reorder with mandatory reason modal; export to PDF preview.

**Edge Cases:** identical DOJ and DOB (fall to next tie-break); employee with grade entry date missing (flagged, excluded until resolved); retro-regularisation altering position; quota slot exhausted in a stream (carry-forward per rule); single-stream grade (rotation skipped).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityListController`, `SeniorityComputationService`, `RotaQuotaResolver`, `TieBreakResolver`, `SeniorityRepository` |
| Backend Flow | Validate scope → query feeder-grade population from M01 → tag streams → apply reckoning basis → if multi-stream apply rota-quota rotation → resolve ties → assign 1..N → persist header+entries in one tx |
| Data Operations | INSERT `seniority_lists` (DRAFT); bulk INSERT `seniority_entries`; audit each |
| Validation | Scope exists; as-on date not future beyond config; population non-empty; quota rule active if multi-stream |
| Authorization | `seniority.list.create` + org-unit scope |
| State Changes & Side Effects | List → DRAFT; audit_log entries; no SR posting |
| Failure Handling | Missing grade-entry date → partial result with `flagged_entries[]`; tx rollback on any constraint breach |
| Dependencies | M01 master data; FR-020 quota rules |
| Test Guidance | tie-break determinism; rota-quota rotation vector (Appendix D.4); contiguous-rank invariant; override audit |

---

### FR-PPP-002 — Tentative Seniority Publication, Objections & Finalisation

- **Module:** PPP-SEN
- **Primary Role(s):** Establishment Officer, Employee (objector), Appointing Authority (checker)
- **User Story:** As an employee, I want to view the tentative seniority list and file objections within the statutory window so that errors are corrected before the list is finalised.
- **Description:** Publishes a draft as `PUBLISHED_TENTATIVE`, opens a configurable objection window, lets in-scope employees file objections (including `STREAM_QUOTA_ERROR`), routes for disposal, applies upheld corrections via the correction-lineage path (FR-018) when post-finalisation, then finalises (`FINALISED`) and notifies.

**Acceptance Criteria**
1. Publication requires checker approval via workflow and freezes the entry set as the tentative baseline.
2. Objections accepted only within `[objection_window_start, objection_window_end]`; late ones marked `TIME_BARRED` unless condoned.
3. Each objection has a recorded disposal (UPHELD/REJECTED/PARTIALLY_UPHELD) with remarks; objector is notified.
4. Upheld objections trigger a re-rank that preserves contiguity and is fully audited; post-finalisation re-ranks route through a `correction_event` (FR-018).
5. Finalisation supersedes any prior final list for the scope and produces a notified PDF stored in M13.

**Business Rules**
- Objections after window close are auto-`TIME_BARRED` unless an authority grants condonation.
- Finalisation blocked while any objection is `SUBMITTED`/`UNDER_REVIEW`, or while the list is `INTERIM_STAYED` (sub-judice).
- A finalised list is corrected only via a fresh superseding list or a `correction_event`.

**Data Model References**

| Entity | Use |
|---|---|
| `seniority_lists` | status transitions (incl. UNDER_CORRECTION) |
| `seniority_objections` | objection lifecycle |
| `seniority_entries` | re-rank on upheld |
| `correction_events` | post-finalisation re-rank |
| `documents`, `notifications`, `workflow_instances` | publish/notify/approve |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/seniority-lists/{id}/publish` | Publish tentative (checker) |
| POST | `/api/v1/seniority-lists/{id}/objections` | File objection |
| POST | `/api/v1/objections/{id}/dispose` | Dispose objection |
| POST | `/api/v1/seniority-lists/{id}/finalise` | Finalise list |

**UI Behavior Notes:** Employee sees own position highlighted; "File Objection" CTA active only in window; officer Kanban of objections by status; finalise button gated with pre-flight checklist (open objections, sub-judice stay).

**Edge Cases:** mass objections on same entry; upheld objection cascading multiple rank shifts; condonation of late objection; concurrent finalise attempts (idempotent lock); list under interim stay (finalise blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SeniorityPublishService`, `ObjectionService`, `ReRankService`, `CorrectionGateway`, `WorkflowClient` |
| Backend Flow | publish→checker task→PUBLISHED_TENTATIVE; objection submit→validate window→workflow; dispose→if upheld call ReRank (or CorrectionEvent if finalised); finalise→guard open objections + stay→supersede prior→generate PDF→notify |
| Data Operations | UPDATE list status; INSERT/UPDATE objections; UPDATE entries on re-rank (tx); INSERT document, notifications |
| Validation | window dates; objector in scope; no open objections at finalise; not INTERIM_STAYED |
| Authorization | publish/finalise: checker; objection: self; dispose: establishment |
| State Changes & Side Effects | DRAFT→PUBLISHED_TENTATIVE→OBJECTIONS_OPEN/CLOSED→FINALISED→(prior SUPERSEDED); UNDER_CORRECTION via FR-018 |
| Failure Handling | late objection → `OBJECTION_WINDOW_CLOSED`; finalise with open objections → `OBJECTIONS_PENDING`; stayed → `ENTITY_SUB_JUDICE`; PDF gen failure → rollback |
| Dependencies | M13, notifications, workflow, FR-018 |
| Test Guidance | window boundary; re-rank contiguity; supersede single-active invariant; sub-judice block |

---

### FR-PPP-003 — Configurable Eligibility Rule Engine & Computation (APAR-usability + certificate currency)

- **Module:** PPP-ELG
- **Primary Role(s):** System Administrator (rule config), HR Promotion Officer (run), Vigilance Officer (attest)
- **User Story:** As an HR Officer, I want the system to compute each employee's promotion eligibility against configured rules — citing the single qualifying-service ledger, honouring the APAR-communication (Dev Dutt) gate, and validating certificate currency — so that the eligible field is objective, explainable, and audit-proof.
- **Description:** Evaluates qualifying service (cited from `qualifying_service_ledger`, FR-016), APAR benchmark **and usability** (read from M08 incl. communication/representation status), vigilance/disciplinary status (M09), mandatory qualification / LDCE exam result, OBC creamy-layer & EWS certificate currency on the crucial date, and roster applicability, producing an `eligibility_assessments` record with overall result, an explainable `rule_trace_json`, and itemised pass/fail reasons.

**Acceptance Criteria**
1. Qualifying service is **not recomputed here** — it is cited from the current `qualifying_service_ledger` snapshot for the employee/grade as of `crucial_date` (`qsl_snapshot_id`).
2. APAR pass = at least `apar_min_count_meeting_benchmark` of last `apar_lookback_years` meet `apar_benchmark`, counting only **usable** entries.
3. **APAR-usability gate (impr. #2):** an adverse/below-benchmark entry with `apar_communicated=false` or `apar_representation_status=PENDING` is marked `apar_usable=false` and **cannot be relied on**; the trace records this.
4. **Certificate currency (impr. #16):** for reserved candidates, `obc_creamy_layer_status` and `ews_cert_valid_on_crucial_date` are validated as of `crucial_date`; expired/creamy ⇒ category benefit not applied (reason code recorded).
5. **LDCE channel (impr. #14):** when `eligibility_rules.requires_exam_pass=true`, a linked `exam_results.result=PASS` (current) is required; else `EXAM_NOT_PASSED`.
6. Pending disciplinary charge ⇒ `SEALED_COVER`; current penalty ⇒ `NOT_ELIGIBLE` (per rule flags). Every assessment stores an explainable reason set. Re-running re-computes only `DRAFT`/`FIELD_ASSEMBLED` cases; frozen post `DPC_HELD`.

**Business Rules**
- Rules are version-effective-dated; the rule effective on `crucial_date` applies.
- Missing APAR years treated per policy (counted as below-benchmark or as gap-blocking alert).
- Vigilance "not cleared" overrides APAR pass.
- The APAR snapshot (`apar_detail_json`) is **field-level restricted PII** with an explicit `apar_snapshot_retention_until` (§10.2).

**Data Model References**

| Entity | Use |
|---|---|
| `eligibility_rules` | rule definition (channel, exam, cert-currency flags) |
| `eligibility_assessments` | computed result (usability, cert, exam fields) |
| `qualifying_service_ledger` | cited service fact (FR-016) |
| `exam_results` | LDCE gate |
| `employees` (M01), APAR (M08), disciplinary (M09) | inputs |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{caseId}/compute-eligibility` | Batch compute |
| GET | `/api/v1/employees/{id}/eligibility?caseId=` | Single assessment |
| GET/POST/PUT | `/api/v1/eligibility-rules` | Manage rules |

**UI Behavior Notes:** Eligibility grid with green/amber/red per criterion; hover tooltip shows rule trace incl. **APAR-usability** decision; sealed-cover candidates badged; certificate-currency chip; LDCE exam chip; bulk "explain" export. APAR detail panel visible only to field-authorised roles.

**Edge Cases:** APAR API timeout (assessment `PENDING`, retried); uncommunicated adverse APAR relied upon by mistake (blocked); EWS certificate expired one day before crucial date (benefit withdrawn); LDCE result `AWAITED` (PROVISIONALLY_ELIGIBLE pending result); rule changed mid-cycle (snapshot rule used).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `EligibilityEngine`, `QualifyingServiceLedgerGateway` (FR-016), `AparGateway(M08)`, `DisciplinaryGateway(M09)`, `CertificateCurrencyService`, `ExamResultGateway`, `RuleResolver` |
| Backend Flow | resolve effective rule → cite current QSL snapshot → fetch APAR (grade + communication status) → apply usability gate → fetch disciplinary → validate cert currency + exam → evaluate gates → derive overall_result + reasons + trace → upsert assessment |
| Data Operations | UPSERT `eligibility_assessments` (snapshot JSON, retention date); audit |
| Validation | case pre-DPC; rule active on crucial_date; QSL snapshot current |
| Authorization | `eligibility.compute`; APAR detail = field-level role; rule mgmt = Sys Admin |
| State Changes & Side Effects | case → ELIGIBILITY_DONE when all assessed; may raise `APAR_GAP_BLOCKING` alerts |
| Failure Handling | M08/M09 down → `UPSTREAM_UNAVAILABLE`, partial save PENDING, retry; uncommunicated adverse → `APAR_NOT_USABLE` reason |
| Dependencies | FR-016, M08, M09, eligibility rules, exam_results |
| Test Guidance | benchmark counting on usable-only; Dev Dutt gate; cert-currency boundary; LDCE gate; effective-dated rule selection |

---

### FR-PPP-004 — Promotion Case Creation & Eligible-Field Assembly (vacancy from establishment; zone formula pinned)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer
- **User Story:** As an HR Officer, I want to create a promotion case whose vacancy count is derived from the sanctioned-post register and assemble the zone of consideration using the pinned DoPT slab so that the DPC evaluates the correct field.
- **Description:** Creates a `promotion_cases` record with `vacancy_count` **derived and validated from the linked `sanctioned_posts`** (promotion-quota vacancies + anticipated + carried-forward), computes the zone of consideration using the pinned non-linear slab (Appendix D.1) with reserved-category extended zone, pulls candidates from the final seniority list, links eligibility assessments, and marks zone bands.

**Acceptance Criteria**
1. Case requires a finalised seniority list for the feeder grade/scope **and** a linked `sanctioned_posts` row.
2. `vacancy_count` equals the computed promotion-quota vacancies from `sanctioned_posts`; manual override requires authority and is audited.
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
| POST | `/api/v1/promotion-cases` | Create case (vacancy validated vs sanctioned_posts) |
| POST | `/api/v1/promotion-cases/{id}/assemble-field` | Build candidate field |
| GET | `/api/v1/promotion-cases/{id}/candidates` | List candidates |

**UI Behavior Notes:** Case header with vacancy card sourced from sanctioned-strength (sanctioned/filled/vacant); zone summary; candidate table with zone band colouring and eligibility chips; "Assemble Field" preview of in/out of zone.

**Edge Cases:** vacancy figure mismatched with establishment (blocked, `VACANCY_NOT_RECONCILED`); insufficient eligible candidates (under-fill warning); tied seniority at zone boundary (include both); reserved vacancies exceed eligible reserved candidates (carry-forward trigger).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PromotionCaseService`, `VacancyReconciler(sanctioned_posts)`, `ZoneCalculator`, `CandidateAssembler` |
| Backend Flow | create case → reconcile vacancy vs sanctioned_posts → fetch final seniority list → compute zone via pinned slab → select top-N (+ extended) → create candidates → link eligibility → set status |
| Data Operations | INSERT case; bulk INSERT candidates; audit |
| Validation | final list exists; sanctioned_posts linked; vacancy reconciles; rule present |
| Authorization | `promotion.case.create` + scope |
| State Changes & Side Effects | case status transitions; may flag under-fill |
| Failure Handling | no final list → `SENIORITY_LIST_NOT_FINAL`; vacancy mismatch → `VACANCY_NOT_RECONCILED`; empty field → `NO_ELIGIBLE_CANDIDATES` |
| Dependencies | FR-001/002, FR-003, FR-015 (sanctioned_posts) |
| Test Guidance | zone slab vectors (Appendix D.1); vacancy reconciliation; boundary tie inclusion; extended-zone reserved logic |

---

### FR-PPP-005 — DPC / Promotion Panel Constitution & Proceedings (with panel currency)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer (constitute), DPC Secretary, DPC Members, Appointing Authority (approve)
- **User Story:** As a DPC Secretary, I want to constitute the committee with a defined validity window, record attendance/quorum, capture each candidate's fitness verdict against the benchmark (using only usable APAR), and compile a select list so that the promotion decision is statutorily valid and not issued from a stale panel.
- **Description:** Constitutes a `promotion_panels` with members and a `panel_valid_from`/`panel_valid_until` window, records `dpc_proceedings`, captures per-candidate `dpc_verdict` (supersession cannot cite an unusable APAR entry), builds select/reserve/sealed-cover lists, and routes for appointing-authority approval. Supports `SUPPLEMENTARY_DPC`/`REVIEW_DPC` for missed/sealed candidates.

**Acceptance Criteria**
1. Panel constitution validates quorum config and conflict-of-interest recusal (candidate cannot be member).
2. Panel records `panel_valid_from`/`panel_valid_until`; orders cannot be generated after expiry without a supplementary/review DPC (impr. #11).
3. Each in-zone candidate receives a verdict; sealed-cover candidates flagged and excluded from effected select list; **supersession citing an unusable APAR entry is blocked** (impr. #2).
4. Select-list count ≤ vacancy count; reserve list ordered.
5. Approval by appointing authority is a checker step distinct from the secretary/maker.

**Business Rules**
- Quorum must be met for a valid sitting; otherwise meeting recorded as adjourned.
- Benchmark applied must match the rule's `apar_benchmark` unless an authority records a deviation.
- Supersession (placing a junior above a senior) requires recorded reasons **and** only usable APAR material.
- An expired panel (`status=EXPIRED`) blocks order generation (integrity rule §5.6-17).

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_panels`, `promotion_panel_members` | committee + currency |
| `dpc_proceedings` | meeting record |
| `promotion_candidates` | verdict + select rank |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/panels` | Constitute panel (with validity) |
| POST | `/api/v1/panels/{id}/proceedings` | Record proceedings |
| PATCH | `/api/v1/candidates/{id}/verdict` | Set candidate verdict |
| POST | `/api/v1/promotion-cases/{id}/select-list/approve` | Approve select list |
| POST | `/api/v1/promotion-cases/{id}/supplementary-dpc` | Constitute supplementary/review DPC |

**UI Behavior Notes:** Panel builder with recusal warnings and validity-window picker; live quorum indicator; panel-currency countdown; verdict grid with benchmark reference and APAR-usability lock on superseded entries; minutes upload; select-list approval with vacancy/roster reconciliation panel.

**Edge Cases:** member recuses mid-meeting dropping below quorum; benchmark deviation; supersession blocked by unusable APAR; panel expiring before orders issued (supplementary DPC); sealed-cover candidate later cleared (FR-008).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PanelService`, `PanelCurrencyService`, `ProceedingsService`, `VerdictService`, `SelectListBuilder`, `WorkflowClient` |
| Backend Flow | constitute (set validity) → validate recusal/quorum → record proceedings → capture verdicts (usability lock) → build lists → checker approval → set SELECT_LIST_APPROVED |
| Data Operations | INSERT panel + members + proceedings; UPDATE candidates verdict/rank/is_selected (tx); INSERT minutes document |
| Validation | quorum; no candidate-as-member; select count ≤ vacancies; panel not expired; APAR usable for supersession |
| Authorization | constitute: HR; verdict: members; approve: appointing authority |
| State Changes & Side Effects | case → DPC_HELD → SELECT_LIST_APPROVED; roster points provisionally tagged (FR-006); audit |
| Failure Handling | quorum fail → `QUORUM_NOT_MET`; conflict → `PANEL_CONFLICT_OF_INTEREST`; over-selection → `VACANCY_EXCEEDED`; expired → `PANEL_EXPIRED`; unusable APAR supersession → `APAR_NOT_USABLE` |
| Dependencies | FR-004 field, FR-006 roster, workflow, M13 |
| Test Guidance | quorum/recusal; select-cap; panel-currency expiry block; supersession requires usable APAR; maker≠checker |

---

### FR-PPP-006 — Reservation Roster Management & Compliance (own-merit migration; enabling justification)

- **Module:** PPP-ROS
- **Primary Role(s):** Reservation/Roster Officer (maker), Appointing Authority (checker)
- **User Story:** As a Roster Officer, I want to maintain the reservation roster, correctly migrate own-merit reserved candidates to unreserved points, hold the Nagaraj enabling justification, and validate compliance so that reservation policy is demonstrably and defensibly applied.
- **Description:** Maintains `reservation_rosters` (with `enabling_provision_ref`, `quantifiable_data_doc_id`, `consequential_seniority_mode`, `roster_applicable`) and `roster_points`, assigns selected candidates to points by category, **migrates own-merit reserved candidates to unreserved points** (`adjusted_against_category=GEN`, reserved point preserved), handles carry-forward and de-reservation/interchange with authority, and produces a compliance report itemising own-merit migrations and recomputed category tallies.

**Acceptance Criteria**
1. Each selected candidate maps to a roster point matching their category, or — if `selected_on_own_merit=true` — to an **unreserved** point with `adjusted_against_category=GEN`, leaving the reserved point un-consumed (impr. #3).
2. Unfilled reserved points are carried forward (linked) rather than silently dropped; de-reservation requires `dereservation_authority_ref`.
3. Compliance report shows points filled vs. due per category, **itemises own-merit migrations**, and flags deviations and 50%-ceiling/PwBD-horizontal breaches.
4. Roster carries the enabling-provision reference and quantifiable-data document for reservation-in-promotion (Nagaraj/Jarnail); `consequential_seniority_mode` recorded (impr. #15).
5. Roster point cannot be double-filled; grades with `roster_applicable=false` (single-post cadre) are exempt.

**Business Rules**
- Reservation percentages and cycle size are policy configuration; own-merit candidates **never** consume reserved points.
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
| POST | `/api/v1/rosters/{id}/points/{pointId}/de-reserve` | De-reserve/interchange |
| GET | `/api/v1/promotion-cases/{id}/roster-compliance` | Compliance report (with migrations) |

**UI Behavior Notes:** 100/200-point roster grid with category legend; filled/vacant/carried-forward/de-reserved states; **own-merit migration indicator** (reserved point shown preserved); compliance panel with category tallies, migration list and deviation flags; de-reserve modal with mandatory authority; enabling-justification upload.

**Edge Cases:** reserved candidate tops UR merit (migrated to UR, reserved point preserved — the canonical N.R. Parmar/own-merit case); no eligible reserved candidate (carry-forward then possible de-reservation); SC/ST interchange; EWS overlap; over-reservation breaching 50% ceiling (warning); single-post cadre (roster exempt).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `RosterService`, `OwnMeritMigrationEngine`, `RosterComplianceCalculator`, `CarryForwardEngine` |
| Backend Flow | on select-list approval → for each selected: if own-merit → assign UR point + set adjusted_against_category=GEN; else match category point → carry forward unfilled reserved → emit compliance report with migration tallies |
| Data Operations | UPDATE roster_points (FILLED/CARRIED_FORWARD/DE_RESERVED, adjusted_against_category) in tx; audit |
| Validation | category match or own-merit migration; no double-fill; ceiling checks; roster_applicable |
| Authorization | fill: roster officer; de-reserve: checker |
| State Changes & Side Effects | roster points status; compliance artefact; audit |
| Failure Handling | double-fill → `ROSTER_POINT_OCCUPIED`; category mismatch → `ROSTER_CATEGORY_MISMATCH`; own-merit on reserved point → `OWN_MERIT_MIGRATION_REQUIRED` |
| Dependencies | FR-005 select list |
| Test Guidance | own-merit migration vector (Appendix D.2); carry-forward linkage; ceiling warning; interchange authority; reserved-point preservation tally |

---

### FR-PPP-007 — Promotion Order Generation, Acceptance, Refusal & SR Posting

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer (maker), Appointing Authority (checker)
- **User Story:** As an HR Officer, I want to generate promotion orders for selected candidates, capture acceptance or refusal (triggering refusal consequences), optionally mark an order "subject to litigation outcome", and post to the Digital SR so that the promotion is legally effected and permanently recorded.
- **Description:** Generates `promotion_orders` from approved select-list candidates (only while the panel is current), produces the order document (M13), captures acceptance/decline (declined → FR-019 refusal consequence; non-response → `DEEMED_ACCEPTED`), supports `subject_to_litigation`, transitions to `EFFECTED`, and writes an idempotent SR event — transactionally.

**Acceptance Criteria**
1. Orders generate only for `is_selected=true, dpc_verdict=FIT` candidates **and** while `panel_valid_until` not passed (impr. #11).
2. Each order carries from/to designation + pay scale, effective (and optional notional) date; `subject_to_litigation` may be set with a linked `legal_case_links` row (impr. #5).
3. Acceptance window enforced; non-response ⇒ `DEEMED_ACCEPTED`; **decline ⇒ a `promotion_refusals` row is created (FR-019)** with debarment + MACP-clock effect (impr. #12).
4. On `EFFECTED`, an SR event is posted with `sr_event_id` stored; `employees.designation_id` update initiated for M01.
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
| `service_register_events` (M12), `documents` (M13), `notifications` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/promotion-cases/{id}/orders/generate` | Bulk-generate orders |
| POST | `/api/v1/orders/{id}/accept` | Record acceptance |
| POST | `/api/v1/orders/{id}/decline` | Record refusal (→ FR-019) |
| POST | `/api/v1/orders/{id}/effect` | Effect + SR post |
| GET | `/api/v1/orders/{id}` | Fetch order |

**UI Behavior Notes:** Batch generation with preview and panel-currency check; per-order status chips; acceptance/decline capture; "subject to litigation" toggle linking a court case; "Effect & Post to SR" shows SR confirmation; declined orders surface refusal-consequence summary and reserve-list suggestion.

**Edge Cases:** SR (M12) unavailable at effect (held in `ISSUED`, retried, not falsely EFFECTED); duplicate effect (idempotent on SR key); candidate retires/dies between selection and order (cancelled, no SR); panel expired before generation (blocked); interim stay arrives mid-process (order → INTERIM_STAYED).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OrderService`, `OrderNumberGenerator`, `PanelCurrencyGuard`, `RefusalService(FR-019)`, `SrPostingGateway(M12)`, `EmployeeUpdateGateway(M01)`, `DocumentService(M13)` |
| Backend Flow | generate (validate selected + panel current) → render document → checker issue → acceptance/decline (decline→RefusalService) → effect: tx{order EFFECTED, post SR idempotent key=order_id, notify, signal M01} |
| Data Operations | INSERT orders; UPDATE acceptance/status; INSERT document; INSERT service_register_events; INSERT promotion_refusals on decline; audit |
| Validation | candidate selected+FIT; panel current; effective ≥ approval date; series continuity; no active stay |
| Authorization | generate: HR; effect/issue: appointing authority |
| State Changes & Side Effects | DRAFT→ISSUED→(ACCEPTED/DEEMED/DECLINED)→EFFECTED / INTERIM_STAYED; SR posted; M01 update; probation auto-created (FR-009); refusal consequence (FR-019) |
| Failure Handling | SR down → keep ISSUED, `UPSTREAM_UNAVAILABLE`, retry; stay active → `ENTITY_SUB_JUDICE`; panel expired → `PANEL_EXPIRED`; rollback on any failure |
| Dependencies | FR-005/006/019, M12, M13, M01 |
| Test Guidance | idempotent SR posting; deemed-acceptance timer; decline→refusal wiring; rollback on SR failure; series gap-free; stay block |

---

### FR-PPP-008 — Sealed Cover Handling & Deferred/Review DPC (event-driven; periodic-review SLA)

- **Module:** PPP-DPC
- **Primary Role(s):** HR Promotion Officer, Vigilance Officer, Appointing Authority
- **User Story:** As an HR Officer, I want to keep promotion recommendations of employees with pending disciplinary/vigilance proceedings in a sealed cover, be reminded to review it on an SLA, and open it on M09 case conclusion so that due process is honoured.
- **Description:** When eligibility yields `SEALED_COVER`, the DPC assesses fitness but the recommendation is sealed; the post is filled provisionally/kept vacant; the system **subscribes to M09 conclusion events** (degrading to scheduled reconciliation if only status read is available — impr. #19) and enforces a **maximum-age / periodic-review SLA**; on conclusion a Review DPC effects (with notional date) or supersedes — including a **partially-upheld minor-penalty branch** (impr. #20).

**Acceptance Criteria**
1. Sealed-cover candidates flagged; verdict recorded but not effected; visible only to authorised roles (field-level).
2. The system tracks the linked M09 case via **event subscription**, with scheduled reconciliation fallback, and raises `SEALED_COVER_REVIEW_DUE` alerts on the periodic-review SLA (e.g., 2-yearly) (impr. #19).
3. On exoneration, a Review DPC effects the promotion with notional date preserving seniority (and triggers correction cascade if juniors were promoted ahead — FR-018).
4. On major penalty, supersession/deferral per policy; on **partially-upheld minor penalty**, a defined branch decides effect-with-conditions vs deferral, audited (impr. #20).
5. Sealed cover cannot remain open indefinitely; the SLA forces periodic review.

**Business Rules**
- Notional promotion on exoneration carries arrears only if separately sanctioned.
- Minor-penalty branch outcome is policy-configured (effect / defer / supersede).
- M09 dependency is an **event** by contract; if unavailable, a nightly reconcile polls status (§16.3).

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_candidates` (dpc_verdict=SEALED_COVER) | sealed record |
| `eligibility_assessments` (SEALED_COVER) | source |
| `promotion_orders` (notional_date) | on opening |
| `correction_events` | cascade on late exoneration |
| `progression_alerts` (SEALED_COVER_REVIEW_DUE) | SLA reminders |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/sealed-covers?status=open` | List sealed covers |
| POST | `/api/v1/sealed-covers/{candidateId}/review` | Open cover via Review DPC |
| POST | `/api/v1/sealed-covers/{candidateId}/minor-penalty-decision` | Partially-upheld branch |

**UI Behavior Notes:** Restricted "Sealed Covers" workspace; linked disciplinary case status badge; review-due SLA countdown; review action gated until M09 conclusion; notional-date input; minor-penalty decision modal.

**Edge Cases:** disciplinary case partially upheld → minor-penalty branch; employee retires while sealed (flagged to M11); multiple sealed covers across cycles; M09 event missing → reconcile + SLA alert; late exoneration → correction cascade (FR-018).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SealedCoverService`, `DisciplinaryEventSubscriber(M09)`, `ReconcileScheduler`, `ReviewDpcService`, `SealedCoverSlaMonitor` |
| Backend Flow | on SEALED_COVER → mark sealed → subscribe M09 conclusion (or schedule reconcile) → SLA monitor raises review-due → on signal → Review DPC → effect (notional) / supersede / minor-penalty branch → correction cascade if needed |
| Data Operations | UPDATE candidate/verdict; INSERT order on opening; INSERT alerts; audit; SR post if effected |
| Validation | M09 concluded before opening; authority for notional date |
| Authorization | restricted to vigilance/appointing roles (field-level) |
| State Changes & Side Effects | sealed→opened→(EFFECTED notional / SUPERSEDED / EFFECTED_WITH_CONDITION); reminders; cascade |
| Failure Handling | premature open → `SEALED_COVER_NOT_REVIEWABLE`; M09 event missing → reconcile + `SEALED_COVER_REVIEW_DUE` alert |
| Dependencies | M09 (event + status), FR-005, FR-007, FR-018 |
| Test Guidance | exoneration notional path; major vs minor penalty branch; SLA reminder; event→poll degradation; late-exoneration cascade |

---

### FR-PPP-009 — Probation Lifecycle on Promotion

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer, Reporting Manager (input), Appointing Authority (declare)
- **User Story:** As an HR Officer, I want promotion to optionally start a probation period that is tracked, extendable, and concluded by a satisfactory declaration so that confirmation in the promoted grade is properly governed.
- **Description:** On effecting a promotion that carries probation, creates `probation_records`, schedules the end date, raises a `PROBATION_ENDING` alert before due, supports extension or reversion, and records the satisfactory-completion declaration (posting a confirmation SR event).

**Acceptance Criteria**
1. Probation auto-created when the promotion grade has a configured probation period.
2. `scheduled_end = probation_start + probation_months`.
3. Alert raised configurable days before `scheduled_end`.
4. Extension records new `extended_to` and reason; reversion transitions employee back and audits.
5. Satisfactory declaration sets `DECLARED_SATISFACTORY` and posts a confirmation SR event.

**Business Rules**
- Multiple extensions allowed up to a policy cap.
- Reversion during probation reverses the promotion order (`SUPERSEDED`) with SR posting.

**Data Model References**

| Entity | Use |
|---|---|
| `probation_records` | lifecycle |
| `promotion_orders` | source/linkage |
| `service_register_events`, `progression_alerts` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/probations?status=on_probation` | List |
| POST | `/api/v1/probations/{id}/extend` | Extend |
| POST | `/api/v1/probations/{id}/declare` | Declare satisfactory |
| POST | `/api/v1/probations/{id}/revert` | Revert |

**UI Behavior Notes:** Probation tracker with countdown; extension modal (reason mandatory); declare action with checklist; reverted cases clearly badged.

**Edge Cases:** declaration after long delay (deemed-confirmation policy); reversion after partial service; extension beyond cap (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProbationService`, `ProbationScheduler`, `SrPostingGateway` |
| Backend Flow | on order EFFECTED with probation → create record → scheduler raises alert pre-end → extend/declare/revert handlers |
| Data Operations | INSERT/UPDATE probation_records; SR post on declare/revert; audit |
| Validation | period elapsed before declare; extension within cap |
| Authorization | declare/revert: appointing authority |
| State Changes & Side Effects | ON_PROBATION→EXTENDED→DECLARED_SATISFACTORY / REVERTED; SR events |
| Failure Handling | extension over cap → `PROBATION_EXTENSION_LIMIT`; declare before period → `PROBATION_NOT_COMPLETE` |
| Dependencies | FR-007, M12 |
| Test Guidance | end-date arithmetic; alert timing; revert reverses order + SR |

---

### FR-PPP-010 — Ad-hoc / Officiating / In-situ Promotion (superseded-by-regular guard)

- **Module:** PPP-OFF
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As a Department Head, I want to place an employee in a higher post on ad-hoc/officiating/in-situ basis pending a regular DPC so that operational continuity is maintained without bypassing due process — and so that when the regular DPC selects a different incumbent, the officiating arrangement is correctly terminated rather than regularised.
- **Description:** Creates `officiating_arrangements` (against a `sanctioned_posts` post) with dates and optional officiating pay, links to a pending regular case, supports extension/termination, regularises into a regular order on DPC selection of the same incumbent, and **transitions to `SUPERSEDED_BY_REGULAR` (terminated, not regularised) when the regular DPC selects someone else** (impr. #20).

**Acceptance Criteria**
1. Arrangement records type, post (`sanctioned_post_id`), org unit, dates, and pay eligibility.
2. Duration tracked; extensions audited; lapses auto-flagged.
3. Linking to a regular case enables one-click regularisation **only when the same incumbent is selected**.
4. If the regular DPC selects a different person, the arrangement moves to `SUPERSEDED_BY_REGULAR` and is terminated with SR end event (state guard, impr. #20).
5. Arrangement posts SR events (officiating start/end).

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
| `service_register_events` | postings |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/officiating` | Create arrangement |
| POST | `/api/v1/officiating/{id}/extend` | Extend |
| POST | `/api/v1/officiating/{id}/regularise` | Regularise to order (same incumbent) |
| POST | `/api/v1/officiating/{id}/terminate` | Terminate / superseded-by-regular |

**UI Behavior Notes:** Arrangement form with type and pay toggle; active-arrangements list with duration meter; regularise CTA appears when linked case is `SELECT_LIST_APPROVED` and incumbent selected; superseded badge when a different person is selected.

**Edge Cases:** officiating exceeds permissible duration (compliance flag); **regular DPC supersedes officiating incumbent → `SUPERSEDED_BY_REGULAR`, terminated not regularised** (now a state guard); overlapping arrangements (blocked).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `OfficiatingService`, `RegularisationService`, `SupersessionGuard`, `SrPostingGateway` |
| Backend Flow | create → SR post (start) → extend/terminate → on regular select-list: if incumbent selected → regularise; else → SUPERSEDED_BY_REGULAR + terminate + SR end |
| Data Operations | INSERT/UPDATE officiating_arrangements; INSERT order on regularise; SR events; audit |
| Validation | no overlapping arrangement; pay flag per policy; incumbent match for regularise |
| Authorization | create: dept head/HR; regularise: appointing authority |
| State Changes & Side Effects | ACTIVE→EXTENDED→REGULARISED/TERMINATED/SUPERSEDED_BY_REGULAR/LAPSED; SR |
| Failure Handling | overlap → `OFFICIATING_OVERLAP`; regularise without/with-different selection → `NO_REGULAR_SELECTION`/`SUPERSEDED_BY_REGULAR` |
| Dependencies | FR-005/007, FR-015, M12 |
| Test Guidance | duration tracking; regularisation same-incumbent; superseded-by-regular guard; overlap prevention |

---

### FR-PPP-011 — Financial Up-gradation (ACP/MACP) Sanction (cap corrected; refusal-aware)

- **Module:** PPP-FIN
- **Primary Role(s):** HR Promotion Officer (maker), Screening Committee, Appointing Authority (sanction)
- **User Story:** As an HR Officer, I want the system to detect financial up-gradation due-dates from the qualifying-service ledger, run screening and sanction, correctly cap at three financial up-gradations (with regular promotions reducing remaining entitlement and refusals affecting the clock), so that stagnating employees get assured pay progression on time and within policy.
- **Description:** Continuously evaluates qualifying service (cited from `qualifying_service_ledger`) to flag `financial_upgradations` as `DUE`, runs a screening-committee assessment, applies the **corrected cap (≤ 3 financial up-gradations in a career; regular promotions reduce remaining entitlement and reset the clock; refusal-of-promotion applies the recorded MACP-clock effect)**, sanctions the next pay level, generates a MACP order (FR-007), posts SR, and hands the pay event to M10.

**Acceptance Criteria**
1. Due detection on completing configured qualifying service (e.g., 10/20/30 years) **from the QSL net qualifying years**, with no qualifying promotion in the interim.
2. Screening assessment records benchmark-met; failing benchmark defers per policy.
3. **Cap (CORRECTED — impr. #13):** `count(EFFECTED financial up-gradations) ≤ 3`; a regular promotion reduces remaining entitlement and resets the qualifying clock (`clock_reset_date`); there is **no** combined `promotions + macp ≤ 3` rule.
4. **Refusal effect (impr. #12):** an active `promotion_refusals` row with `macp_clock_effect ∈ {STOP, FORFEIT_NEXT, RESET}` is applied (`refusal_effect_applied=true`).
5. Sanction grants the next pay level effective from due date; deferred if penalty current; creates a `MACP` order, posts SR, emits a pay-fixation event to M10.

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
| `service_register_events`, M10 pay event | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/financial-upgradations?status=due` | Due list |
| POST | `/api/v1/financial-upgradations/{id}/screen` | Screening assessment |
| POST | `/api/v1/financial-upgradations/{id}/sanction` | Sanction + order + SR |
| POST | `/api/v1/financial-upgradations/{id}/defer` | Defer |

**UI Behavior Notes:** MACP due dashboard with countdown and **cap tracker showing up-gradations availed (n/3)** and remaining-entitlement after regular promotions; refusal-effect badge; screening form with benchmark; sanction action shows pay-level change preview; deferred items with reason.

**Edge Cases:** employee took regular promotion shortly before MACP due (recompute clock via `clock_reset_date`); penalty between due and sanction (defer); refusal forfeits next up-gradation; cap of 3 reached (informational, no further).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `MacpEngine`, `QualifyingServiceLedgerGateway`, `MacpCapCalculator`, `RefusalEffectApplier`, `ScreeningService`, `OrderService`, `PayEventGateway(M10)`, `SrPostingGateway` |
| Backend Flow | scheduler reads QSL net years → compute due (cap-aware, clock-reset, refusal effect) → create DUE + alert → screen → sanction: tx{create MACP order, post SR, emit M10 pay event, set EFFECTED} |
| Data Operations | INSERT financial_upgradations + macp_assessments; INSERT order; SR event; audit |
| Validation | qualifying service met (QSL); count EFFECTED < 3; no current penalty; refusal effect applied |
| Authorization | sanction: appointing authority; screen: committee |
| State Changes & Side Effects | DUE→UNDER_SCREENING→SANCTIONED→EFFECTED / DEFERRED/REJECTED; SR; M10 event |
| Failure Handling | cap exceeded → `MACP_CAP_REACHED`; penalty current → auto-defer; M10 down → SR held, retry |
| Dependencies | FR-016 (QSL), FR-019 (refusal), M08, M09, M10, M12 |
| Test Guidance | due arithmetic from QSL; **corrected cap (3 up-gradations, promotions reduce entitlement not combined cap)**; clock reset; refusal effect; defer-on-penalty |

---

### FR-PPP-012 — Posting after Promotion (sanctioned-post validated; NOT_JOINED state)

- **Module:** PPP-POST
- **Primary Role(s):** HR Promotion Officer, Department Head, Appointing Authority
- **User Story:** As an HR Officer, I want to post a promoted employee to a specific sanctioned-and-vacant post/station and drive relieving/joining through M05 so that the promotion translates into an actual placement, with non-joining handled as a defined terminal state.
- **Description:** Creates `promotion_postings` for an effected promotion, selects the destination `to_sanctioned_post_id` (**validated as sanctioned and vacant against `sanctioned_posts`** — impr. #1), hands a movement to M05, tracks relieving/joining, supports a **`NOT_JOINED`** terminal state with consequence (impr. #20), and posts the posting/joining SR event on completion.

**Acceptance Criteria**
1. Posting can be created only for an `EFFECTED` promotion order.
2. Destination post validated against `sanctioned_posts` (`current_vacancies > 0`); no free-text vacancy assumption (impr. #1).
3. M05 movement reference stored; status reflects RELIEVED/JOINED.
4. Report-by date enforced; **failure to join by deadline ⇒ `NOT_JOINED`** with `not_joined_consequence ∈ {ORDER_REVIEW, FORFEITED, EXTENSION_GRANTED}` (impr. #20).
5. On JOINED, a posting SR event is posted and `employees.org_unit_id` update initiated for M01.

**Business Rules**
- A promotion may be local (no station change) or out-station (full relieving/joining).
- Failure to join by deadline triggers order review per policy; forfeiture frees the sanctioned post.

**Data Model References**

| Entity | Use |
|---|---|
| `promotion_postings` | posting record (+NOT_JOINED) |
| `sanctioned_posts` | vacant-post validation |
| `promotion_orders` | source |
| M05 movement, `service_register_events` | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/orders/{id}/postings` | Create posting (sanctioned-post validated) |
| GET | `/api/v1/postings/{id}` | Status |
| POST | `/api/v1/postings/{id}/sync-movement` | Sync with M05 |
| POST | `/api/v1/postings/{id}/mark-not-joined` | Record NOT_JOINED + consequence |

**UI Behavior Notes:** Posting form with destination picker showing sanctioned/vacant status; movement timeline (relieved → in-transit → joined); report-by countdown; NOT_JOINED action with consequence selector.

**Edge Cases:** no vacant sanctioned post (blocked, `POST_NOT_AVAILABLE`); employee declines posting (links to FR-007 acceptance); local promotion (skip relieving); not joined by deadline (NOT_JOINED + consequence).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `PostingService`, `SanctionedPostValidator`, `M05MovementGateway`, `SrPostingGateway`, `EmployeeUpdateGateway(M01)` |
| Backend Flow | validate order EFFECTED → validate destination sanctioned/vacant → create posting → if out-station create M05 movement → sync → on JOINED post SR + signal M01; on deadline miss → NOT_JOINED + consequence |
| Data Operations | INSERT/UPDATE promotion_postings; SR on joined; audit |
| Validation | order EFFECTED; destination sanctioned & vacant; report-by |
| Authorization | create: HR/dept head; approve: appointing authority |
| State Changes & Side Effects | PENDING→RELIEVED→JOINED / NOT_JOINED; SR; M01 org_unit update; sanctioned post free on forfeiture |
| Failure Handling | no vacancy → `POST_NOT_AVAILABLE`; not joined → NOT_JOINED + policy review |
| Dependencies | FR-007, FR-015, M05, M12, M01 |
| Test Guidance | local vs out-station; sanctioned-post validation; NOT_JOINED consequence; M05 sync; SR on joined |

---

### FR-PPP-013 — Progression Monitoring (Due-for-Promotion, Stagnation, Increment view)

- **Module:** PPP-MON
- **Primary Role(s):** HR Officer, Reporting Manager, Employee (self), System (scheduler)
- **User Story:** As an HR Officer, I want the system to proactively flag who is due for promotion, who is stagnating, whose increment is due (mirroring M10), and whose probation/APAR/refusal-debarment affects progression so that no entitlement is missed and no employee stagnates unseen.
- **Description:** A scheduled engine evaluates each employee against career rules (citing the QSL) and generates `progression_alerts` and maintains `increment_monitor` rows **as a monitoring/alerting view that mirrors M10 (system-of-record)** (impr. #18); surfaces dashboards and self-service timelines; supports acknowledgement/action.

**Acceptance Criteria**
1. Alerts generated on configurable lead time before due dates; deduplicated per employee/type/cycle.
2. Stagnation defined as net qualifying years (from QSL) in grade beyond a configurable threshold without promotion/up-gradation.
3. **Increment rows are a mirror keyed by `m10_increment_ref`; M06 never authoritatively sets release/withhold — M10 does** (impr. #18). Rows without an M10 ref are alert-only projections.
4. Employees see their own progression timeline and open alerts.
5. Alerts can be acknowledged, actioned (linking to a case/MACP), or dismissed with reason; new alert types `SEALED_COVER_REVIEW_DUE`, `REFUSAL_DEBARMENT_ENDING` supported.

**Business Rules**
- Alert thresholds are configuration per cadre/grade.
- APAR gaps blocking eligibility raise `APAR_GAP_BLOCKING` to prompt M08 follow-up.
- Increment withheld due to penalty (M09) is reflected from M10 and auto-released on expiry **by M10**, mirrored here.

**Data Model References**

| Entity | Use |
|---|---|
| `progression_alerts`, `increment_monitor` (mirror) | monitoring |
| `qualifying_service_ledger` | stagnation/due inputs |
| `eligibility_assessments`, `financial_upgradations`, `promotion_refusals` | inputs |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/progression/alerts?type=&status=` | List alerts |
| POST | `/api/v1/progression/alerts/{id}/acknowledge` | Acknowledge |
| GET | `/api/v1/employees/{id}/progression-timeline` | Self timeline |
| POST | `/api/v1/progression/run` | Trigger run (admin) |

**UI Behavior Notes:** HR monitoring dashboard with alert counts by type/severity; filters by cadre/org; employee self-service timeline; increment register grid **labelled "mirror of Payroll (M10)"** with M10 ref links.

**Edge Cases:** employee due in two cycles (dedupe by cycle); alert then promoted (auto-closed); increment status changes in M10 (mirror updated on sync, not edited locally).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `ProgressionEngine`, `AlertScheduler`, `IncrementMirrorService(M10 sync)`, `QualifyingServiceLedgerGateway` |
| Backend Flow | nightly job → evaluate each in-scope employee via QSL → compute due/stagnation → upsert alerts (dedupe) → sync increment mirror from M10 → notify; ack/action handlers |
| Data Operations | UPSERT progression_alerts; UPSERT increment_monitor from M10 sync; notifications; audit |
| Validation | dedupe key (employee+type+cycle); thresholds present; increment rows carry m10_increment_ref |
| Authorization | HR/manager read scope; employee self only |
| State Changes & Side Effects | alerts OPEN→ACKNOWLEDGED→ACTIONED/DISMISSED/EXPIRED; notifications |
| Failure Handling | job partial failure → resumable checkpoint; M10 sync down → mark mirror stale, do not fabricate |
| Dependencies | FR-016, FR-003/011/019, M08, M09, M10 |
| Test Guidance | dedupe; auto-close on promotion; stagnation from QSL; increment mirror never authoritative |

---

### FR-PPP-014 — Career-Path Modelling, Succession Planning & Eligibility Dashboard (ADVISORY / OPTIONAL)

- **Module:** PPP-CAR
- **Primary Role(s):** HR Officer, Department Head, System Administrator (templates), Employee (self view)
- **Scope marker (impr. #21):** This FR is **explicitly advisory and optional**, built **lighter** than the statutory kernels (FR-016/006/004/020). It **consumes** competencies from **M07** (never redefines them) and **feeds** analytics to **M14**. It **must not auto-promote** and is not a system of truth for competencies or analytics.
- **User Story:** As a Department Head, I want to model career paths, maintain succession plans, and view eligibility dashboards so that the organisation plans talent flow and an employee understands their growth route.
- **Description:** Defines `career_paths` with ordered `career_path_stages` (designation, typical tenure, **referenced** M07 competencies), builds `succession_plans` with ranked `succession_candidates` and readiness levels, and presents an eligibility dashboard projecting who becomes eligible when (reusing the eligibility engine).

**Acceptance Criteria**
1. A career path is an ordered sequence of designations with typical tenure and **competency references** (read-only from M07).
2. Employees can view their mapped career path and next stage with projected eligibility date.
3. Succession plans identify critical positions, incumbents, risk of loss, and ranked successors with readiness.
4. Eligibility dashboard projects upcoming eligible cohorts per grade/cycle.
5. Templates are configurable by admin; plans are versioned. **No path or readiness rating triggers any promotion action.**

**Business Rules**
- Career-path stages must reference valid designations; ordering unique and contiguous.
- Succession readiness derived from tenure, APAR, and competency coverage (advisory only).
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
| Components | `CareerPathService`, `SuccessionService`, `EligibilityProjectionService`, `CompetencyGateway(M07, read-only)` |
| Backend Flow | manage path templates → map employees → compute projected eligibility (reuse engine) → render dashboards; succession CRUD with readiness |
| Data Operations | CRUD career_paths/stages, succession_plans/candidates; audit |
| Validation | contiguous stage order; valid designations; readiness enum; no promotion side effect |
| Authorization | template: admin; plans: HR/dept head; self view: employee |
| State Changes & Side Effects | plan status DRAFT→ACTIVE→REVIEWED→ARCHIVED; **no promotion writes** |
| Failure Handling | invalid stage order → `CAREER_PATH_INVALID`; deprecated designation → version + warn |
| Dependencies | M07 competencies (read), FR-003 |
| Test Guidance | stage ordering; projection accuracy; readiness grid; self-view scoping; assert no promotion side effect |

---

### FR-PPP-015 — Sanctioned-Post & Establishment-Strength Register & Vacancy Computation (NEW — improvement #1)

- **Module:** PPP-EST
- **Primary Role(s):** Establishment-Strength Officer (maker), Appointing Authority (checker)
- **User Story:** As an Establishment-Strength Officer, I want to maintain the sanctioned strength per grade/office with the DR/promotion/LDCE quota split and have the system compute promotion-quota vacancies (current, anticipated, carried-forward) so that every promotion case and posting validates against a real establishment, not a free-typed number.
- **Description:** Maintains `sanctioned_posts` (sanctioned strength, filled/vacant, quota split, anticipated & carried-forward vacancies) and computes the **promotion-quota vacancy figure** consumed by FR-004 (case creation) and validated by FR-012 (posting) and FR-010 (officiating).

**Acceptance Criteria**
1. Each `sanctioned_posts` row records sanctioned strength, filled count, quota percentages, and a sanction-order reference.
2. `current_vacancies = sanctioned_strength − filled_count`; quota percentages sum ≤ 100 (integrity rule §5.6-15).
3. Promotion-quota vacancies (current + anticipated + carried-forward × promotion_quota_pct) are computed and exposed to FR-004.
4. FR-012 posting and FR-010 officiating validate the destination/against post has `current_vacancies > 0`.
5. Strength revisions are versioned (`status=REVISED`/`ARCHIVED`) and audited.

**Business Rules**
- Sanctioned strength originates from establishment-authority sanction orders (master data); edits require checker approval.
- Filled count reconciles with M01 active incumbents per grade/office on a scheduled sync.
- Anticipated vacancies (retirements within the cycle) are computed from M01/M11 superannuation data.

**Data Model References**

| Entity | Use |
|---|---|
| `sanctioned_posts` | register + vacancy computation |
| `employees` (M01), retirement (M11) | filled/anticipated reconciliation |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/sanctioned-posts` | Create/revise sanctioned strength |
| GET | `/api/v1/sanctioned-posts?grade=&orgUnit=` | List with vacancy computation |
| GET | `/api/v1/sanctioned-posts/{id}/vacancy-computation` | Promotion-quota vacancy figure |
| POST | `/api/v1/sanctioned-posts/{id}/reconcile` | Reconcile filled/anticipated with M01/M11 |

**UI Behavior Notes:** Establishment grid per grade/office (sanctioned/filled/vacant cards); quota-split editor; vacancy-computation panel showing current + anticipated + carried-forward; revision history.

**Edge Cases:** filled > sanctioned (data error, blocked); quota percentages exceeding 100 (blocked); mid-cycle strength revision affecting an open case (case re-reconciles, flag); single-post grade.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `SanctionedPostService`, `VacancyComputationEngine`, `EstablishmentReconciler(M01/M11)` |
| Backend Flow | create/revise (checker) → reconcile filled/anticipated → compute current/promotion-quota vacancies → expose to FR-004/010/012 |
| Data Operations | INSERT/UPDATE sanctioned_posts; version on revise; audit |
| Validation | filled ≤ sanctioned; quota sum ≤ 100; sanction-order ref present |
| Authorization | maker: Est.-Strength Officer; checker: appointing authority |
| State Changes & Side Effects | ACTIVE→REVISED→ARCHIVED; feeds vacancy figures |
| Failure Handling | filled>sanctioned → `STRENGTH_INCONSISTENT`; quota>100 → `QUOTA_SPLIT_INVALID` |
| Dependencies | M01, M11 |
| Test Guidance | vacancy computation (current+anticipated+carry-forward); reconciliation; quota validation |

---

### FR-PPP-016 — Qualifying-Service Ledger & Service-Exclusion Engine (NEW — improvements #8, #9)

- **Module:** PPP-QSL
- **Primary Role(s):** HR Officer, System Administrator (exclusion rules), Auditor
- **User Story:** As an HR Officer and auditor, I want one versioned, snapshotted, citable qualifying-service ledger — computed once with pinned exclusion rules (EOL, dies-non, suspension, ad-hoc, deputation) — so that every downstream decision (eligibility, MACP, stagnation, projection) cites the same defensible service fact instead of re-deriving it.
- **Description:** Computes net qualifying service for an `(employee, grade, as-of-date)` by taking gross service and applying the configured `service_exclusion_rules`, persists an **immutable snapshot** (`qualifying_service_ledger`) with an itemised exclusion breakdown, and exposes it as the single source for FR-003/011/013/014. Locked as the **fifth shared contract** (`QualifyingServiceLedger`) in §15.4.

**Acceptance Criteria**
1. For an `(employee, grade, as-of-date)`, the engine computes `gross_service_years`, applies the linked `service_exclusion_rules`, and persists `net_qualifying_years` with an itemised `exclusion_breakdown_json`.
2. Each snapshot is **immutable and citable** (`qsl_snapshot_id`, `computed_by_version`); recomputation creates a new snapshot and supersedes the prior (`superseding_snapshot_id`), never edits it.
3. Exclusion rules are pinned (Appendix D.3): EOL beyond condonable limit excluded; dies-non excluded; suspension per `suspension_treatment`; ad-hoc counts only if regularised; deputation counts per flag.
4. FR-003 and FR-011 **cite** the current snapshot (`qsl_snapshot_id`) rather than recomputing service.
5. A correction event (FR-018) that changes service facts triggers a fresh snapshot and downstream re-evaluation.

**Business Rules**
- The ledger is the single source of qualifying service for the module (no per-FR calculators) (impr. #8).
- Exclusion rules are version-effective-dated; the rule effective on `as_of_date` applies.
- Leave/suspension facts are sourced from M03 (leave/EOL) and M09 (suspension/penalty) and snapshotted.

**Data Model References**

| Entity | Use |
|---|---|
| `qualifying_service_ledger` | immutable snapshots |
| `service_exclusion_rules` | pinned exclusion logic |
| `employees` (M01), leave (M03), suspension (M09) | inputs |

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
| Components | `QualifyingServiceLedgerEngine`, `ServiceExclusionResolver`, `LeaveGateway(M03)`, `SuspensionGateway(M09)`, `LedgerRepository` |
| Backend Flow | gather service dates (M01) + leave/EOL (M03) + suspension (M09) → resolve effective exclusion rule → compute gross − exclusions → persist immutable snapshot with breakdown |
| Data Operations | INSERT qualifying_service_ledger (append-only); supersede prior on recompute; audit |
| Validation | exclusion rule active on as_of_date; no double-counted periods |
| Authorization | compute: HR; rule mgmt: Sys Admin; read: broad |
| State Changes & Side Effects | new snapshot; is_current flag flip on supersession |
| Failure Handling | M03/M09 down → `UPSTREAM_UNAVAILABLE`, no partial snapshot persisted |
| Dependencies | M01, M03, M09 |
| Test Guidance | exclusion vectors (Appendix D.3); immutability; supersession lineage; citation by FR-003/011 |

---

### FR-PPP-017 — Legal-Case Linkage & Sub-Judice Handling (NEW — improvement #5)

- **Module:** PPP-LEG
- **Primary Role(s):** Legal/Litigation Officer (maker), Appointing Authority (checker), HR Officer (read)
- **User Story:** As a Legal Officer, I want to attach court/tribunal references and interim stays to promotion cases, orders, seniority lists and roster points, and mark records "subject to outcome", so that the system truthfully represents that a decision is sub judice and blocks unsafe effecting.
- **Description:** Maintains `legal_case_links` attachable to cases/orders/lists/rosters/candidates with forum, case reference, interim-stay window, and `subject_to_outcome`; sets `subject_to_litigation` on the linked entity; drives the `INTERIM_STAYED` state (integrity rule §5.6-20); and, on an adverse disposal, triggers a correction event (FR-018).

**Acceptance Criteria**
1. A legal link can be attached to a `promotion_case`, `promotion_order`, `seniority_list`, `roster`, or `candidate`, capturing forum, reference, petitioner and status.
2. Setting `interim_stay=true` transitions the linked entity to `INTERIM_STAYED` and blocks effecting/finalisation/posting until vacated (impr. #5).
3. An order may be issued `subject_to_outcome=true` ("subject to the outcome of OA/SLP No. …") and is clearly flagged.
4. Disposal status is recorded; `DISPOSED_ADVERSE`/`CONTEMPT` can trigger a `correction_events` row (FR-018).
5. All legal links and stays are audited and surfaced in the litigation-risk register (§13).

**Business Rules**
- Only the Legal Officer writes legal links; promotion adjudication roles cannot.
- A vacated stay clears `INTERIM_STAYED`, restoring the prior state.
- Court case management itself is external; M06 stores references and outcomes only.

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
| GET | `/api/v1/legal-case-links?entityType=&entityId=` | List for entity |

**UI Behavior Notes:** Legal-link panel on case/order/list views; sub-judice banner with stay dates; "subject to outcome" badge; disposal capture with document upload; litigation-risk register dashboard.

**Edge Cases:** multiple overlapping cases on one entity; stay vacated then re-imposed; adverse outcome requiring batch re-rank (FR-018); contempt requiring expedited correction.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `LegalCaseService`, `SubJudiceGuard`, `CorrectionTrigger(FR-018)` |
| Backend Flow | attach link → set subject_to_litigation; on interim_stay → INTERIM_STAYED + block; on dispose → record outcome → if adverse trigger correction event |
| Data Operations | INSERT/UPDATE legal_case_links; UPDATE linked entity flags/status; audit |
| Validation | linked entity exists; stay dates valid; only Legal Officer writes |
| Authorization | write: Legal Officer; approve correction: appointing authority |
| State Changes & Side Effects | entity → INTERIM_STAYED → restored; correction event on adverse |
| Failure Handling | effecting while stayed → `ENTITY_SUB_JUDICE`; invalid entity → `NOT_FOUND` |
| Dependencies | FR-002/004/007, FR-018 |
| Test Guidance | stay blocks effecting; subject-to-outcome flag; adverse → correction trigger; vacate restores state |

---

### FR-PPP-018 — Correction Lineage & Retrospective Recompute Cascade (NEW — improvements #6, #7)

- **Module:** PPP-COR
- **Primary Role(s):** Establishment Officer / HR Officer (maker), Appointing Authority (checker), Legal Officer (court-trigger)
- **User Story:** As an Establishment Officer, when an objection is upheld or a court orders a retrospective promotion/re-rank, I want a single correction mechanism that records why a finalised list or effected order was reopened and cascades the re-rank and recompute truthfully — flagging any pay anomaly to M10 — so that corrections propagate without silent edits.
- **Description:** Creates a `correction_events` row (reason class OBJECTION_UPHELD / COURT_ORDER / ADMIN_ERROR) linked to its trigger, transitions affected lists to `UNDER_CORRECTION`, runs a recompute cascade (re-rank seniority entries, re-snapshot QSL, re-evaluate downstream candidates/cases), posts an SR correction event, and raises a `PAY_ANOMALY_STEPPING_UP` signal to M10 where a junior would draw more than a senior (impr. #7).

**Acceptance Criteria**
1. Any re-rank/recompute of a `FINALISED` list or `EFFECTED` order occurs only via a `correction_events` row (no silent edits) (impr. #6).
2. The correction records `reason_class`, its trigger (objection or legal case), affected entity, and a `recompute_scope_json`.
3. The cascade re-ranks affected `seniority_entries` (setting `superseded_by_correction`), supersedes affected QSL snapshots, and re-evaluates downstream candidates/cases; it runs in a transaction with `cascade_status` lifecycle.
4. Where the cascade causes a junior to draw more than a senior, `pay_anomaly_flag=true` and a stepping-up signal is sent to M10 (`pay_anomaly_signal_ref`) — M06 detects and flags; M10 computes the pay (impr. #7).
5. The correction is checker-approved and posts an SR correction event; full lineage is auditable and replayable.

**Business Rules**
- Corrections are append-only lineage; originals are never destroyed.
- A court-ordered correction takes precedence and may be expedited; an admin-error correction requires recorded justification.
- The cascade is idempotent and resumable; a failed cascade rolls back to `ROLLED_BACK` and alerts.

**Data Model References**

| Entity | Use |
|---|---|
| `correction_events` | lineage + cascade + pay-anomaly |
| `seniority_lists`/`seniority_entries` | re-rank (UNDER_CORRECTION) |
| `qualifying_service_ledger` | re-snapshot |
| `promotion_candidates`/`promotion_orders` | downstream re-evaluation |
| `service_register_events` (M12), M10 stepping-up signal | side effects |

**API References**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/correction-events` | Create correction (maker) |
| POST | `/api/v1/correction-events/{id}/approve` | Approve (checker) |
| POST | `/api/v1/correction-events/{id}/run-cascade` | Execute recompute cascade |
| GET | `/api/v1/correction-events/{id}` | Status + lineage |

**UI Behavior Notes:** Correction wizard (reason → trigger → scope preview → impact summary listing affected ranks/orders/pay anomalies); cascade progress tracker; pay-anomaly list with M10 signal status; lineage timeline.

**Edge Cases:** court orders retrospective promotion of one officer re-ranking a whole list and re-doing a downstream DPC; multiple corrections queued on one list (serialised); cascade failure mid-run (rollback + alert); stepping-up anomaly affecting many juniors.

**LLD**

| Aspect | Detail |
|---|---|
| Components | `CorrectionEventService`, `RecomputeCascadeEngine`, `ReRankService(reuse)`, `QualifyingServiceLedgerEngine(reuse)`, `PayAnomalyDetector`, `M10SteppingUpGateway`, `SrPostingGateway` |
| Backend Flow | create correction → checker approve → set UNDER_CORRECTION → tx{re-rank entries, re-snapshot QSL, re-evaluate downstream, detect pay anomaly → signal M10, post SR correction} → COMPLETED |
| Data Operations | INSERT correction_events (append-only); UPDATE entries (superseded_by_correction); INSERT new QSL snapshots; SR correction; audit |
| Validation | trigger present; scope valid; checker ≠ maker; idempotent cascade key |
| Authorization | maker: Est./HR; court-trigger: Legal Officer; approve: appointing authority |
| State Changes & Side Effects | list UNDER_CORRECTION→FINALISED; cascade PENDING→RUNNING→COMPLETED/FAILED/ROLLED_BACK; M10 signal; SR |
| Failure Handling | cascade failure → ROLLED_BACK + alert; M10 signal failure → retry queue; partial → resumable checkpoint |
| Dependencies | FR-002 (re-rank), FR-016 (QSL), FR-017 (legal trigger), M10, M12 |
| Test Guidance | retrospective re-rank cascade; pay-anomaly stepping-up signal; idempotent/resumable cascade; no silent edit; lineage replay |

---

### FR-PPP-019 — Refusal-of-Promotion Consequence Management (NEW — improvement #12)

- **Module:** PPP-ORD
- **Primary Role(s):** HR Promotion Officer (maker), Appointing Authority (checker)
- **User Story:** As an HR Officer, when an employee declines a promotion, I want the system to record the refusal and apply the policy consequences — a debarment window and a defined effect on the MACP clock — so that a refusal propagates a real consequence rather than just a reserve-list note.
- **Description:** On `promotion_orders.acceptance_status=DECLINED` (from FR-007), creates a `promotion_refusals` row with a configurable debarment window and an `macp_clock_effect`, bars re-consideration until `next_consideration_after`, and feeds the MACP engine (FR-011) so the clock effect is applied.

**Acceptance Criteria**
1. A declined order creates a `promotion_refusals` row with `debarment_months`, computed `debarment_until`, and an `macp_clock_effect ∈ {NONE, STOP, FORFEIT_NEXT, RESET}` (impr. #12).
2. While `status=ACTIVE`, the employee is barred from re-consideration before `next_consideration_after`; FR-004 field assembly excludes them within the window.
3. The MACP engine (FR-011) applies the recorded clock effect (`refusal_effect_applied=true`).
4. Debarment expiry transitions the refusal to `EXPIRED` and raises a `REFUSAL_DEBARMENT_ENDING` alert beforehand.
5. A refusal may be `WAIVED` by authority with recorded justification.

**Business Rules**
- Debarment window and MACP-clock effect are policy configuration per grade/cadre.
- Refusal does not by itself reduce seniority unless policy specifies.
- Waiver is a checker action, audited.

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
| GET | `/api/v1/refusals?status=active` | List active refusals |
| POST | `/api/v1/refusals/{id}/waive` | Waive debarment (checker) |

**UI Behavior Notes:** Refusal capture modal (reason, debarment preview, MACP-effect preview); active-refusals list with debarment countdown; waiver action with justification; refusal badge on employee progression timeline.

**Edge Cases:** employee declines then requests reconsideration within window (blocked unless waived); refusal forfeits next MACP up-gradation; multiple refusals across cycles (debarment compounding per policy).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `RefusalService`, `DebarmentCalculator`, `MacpClockEffectApplier(FR-011)`, `AlertScheduler` |
| Backend Flow | on decline → tx{create refusal, compute debarment_until + next_consideration_after, set macp_clock_effect} → feed MACP engine; scheduler raises debarment-ending alert; expiry → EXPIRED |
| Data Operations | INSERT promotion_refusals; UPDATE financial_upgradations.refusal_effect_applied; audit |
| Validation | order is DECLINED; debarment config present |
| Authorization | create: HR (auto on decline); waive: appointing authority |
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
- Rotation method and ratios are version-effective-dated configuration; the rule effective on `as_on_date` applies.
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

**Edge Cases:** quota slot exhausted in one stream (carry-forward); ratio change mid-cycle (rule snapshot); LDCE stream absent (degenerates to DR:Promotee); legacy data missing stream/quota history (flagged for manual stream tagging at migration).

**LLD**

| Aspect | Detail |
|---|---|
| Components | `QuotaRuleService`, `RotaQuotaConstructionEngine`, `RotationTracer` |
| Backend Flow | resolve effective quota rule → order each stream internally → rotate vacancies across streams per method/start-slot → assign slot labels + cycle no → carry forward unfilled → emit combined order to FR-001 |
| Data Operations | INSERT/UPDATE seniority_quota_rules; UPDATE seniority_entries (stream/slot) in tx; audit |
| Validation | ratios positive; method valid; rule active on as_on_date |
| Authorization | rules: Sys Admin; construct: Est. Officer; approve: appointing authority |
| State Changes & Side Effects | combined entries assigned; rotation trace stored |
| Failure Handling | missing stream tag → `STREAM_TAG_MISSING` (flag, partial); invalid ratio → `QUOTA_RULE_INVALID` |
| Dependencies | FR-001, M01 |
| Test Guidance | rota-quota rotation vector (Appendix D.4); carry-forward of unfilled slots; deterministic interleave; running-account vs rota-quota |

---

## Section 7 — UI Requirements

### 7.1 Screen inventory

| Screen | Primary roles | Key elements | States covered |
|---|---|---|---|
| Establishment-Strength Register | Est.-Strength Officer | Sanctioned/filled/vacant cards, quota-split editor, vacancy computation, revision history | empty, loading, error, inconsistent-strength |
| Qualifying-Service Ledger panel | HR Officer, Auditor | Gross→exclusions→net, snapshot id/version, exclusion-rule preview | loading, error, snapshot-superseded |
| Seniority Workbench (multi-stream) | Est. Officer | Scope wizard, stream/quota step, rotation trace, ranked grid, override modal, publish/finalise | empty, loading, error, success, permission, sub-judice |
| Tentative List (Employee) | Employee | Own position highlight, file-objection CTA (window-gated) | empty, window-closed, success |
| Objection Manager | Est. Officer | Kanban by status (incl. TIME_BARRED, STREAM_QUOTA_ERROR), disposal modal | empty, loading, error |
| Eligibility Grid | HR Officer | Criterion chips (R/A/G), rule-trace tooltip incl. APAR-usability, cert-currency & LDCE chips, sealed-cover badge | loading, partial (PENDING), error, field-restricted |
| Promotion Case Console | HR Officer | Case header (vacancy from establishment), candidate field, zone bands | empty, under-fill, vacancy-not-reconciled |
| DPC Workspace | DPC Sec/Members | Panel builder (recusal, validity window), quorum meter, panel-currency countdown, verdict grid, minutes upload | error (quorum/conflict/expired) |
| Select List Approval | Appointing Auth. | Vacancy/roster reconciliation (own-merit migrations), approve | error (vacancy exceeded) |
| Roster Grid | Roster Officer | 100/200-point grid, category legend, own-merit migration indicator, compliance panel, de-reserve modal, enabling-justification upload | error (double-fill), exempt |
| Orders Console | HR Officer | Batch generate (panel-currency check), acceptance/decline, subject-to-litigation toggle, effect & SR confirm | error (SR down/stayed/expired), success |
| Refusal Management | HR Officer | Refusal capture, debarment & MACP-effect preview, waiver | active, expired, waived |
| Sealed Cover Workspace | Vigilance/Auth. | Restricted list, M09 status badge, review-due SLA countdown, review/minor-penalty action | permission, empty |
| Probation Tracker | HR Officer | Countdown, extend/declare/revert | success, blocked (cap) |
| Officiating Console | Dept Head | Arrangement form, duration meter, regularise CTA, superseded-by-regular badge | overlap error |
| MACP Dashboard | HR Officer | Due countdown, cap tracker (n/3), refusal-effect badge, screen/sanction, pay preview | deferred state |
| Posting Console | HR Officer | Destination picker (sanctioned/vacant), movement timeline, report-by countdown, NOT_JOINED action | no-vacancy error |
| Legal-Case & Sub-judice | Legal Officer | Legal-link panel, sub-judice banner, stay dates, disposal capture, litigation-risk register | empty, stayed |
| Correction & Recompute | Est./HR Officer | Correction wizard (reason→trigger→scope→impact), cascade progress, pay-anomaly list, lineage timeline | running, failed, rolled-back |
| Progression Monitoring Dashboard | HR/Manager | Alert counts by type/severity, filters | empty, loading |
| Employee Progression Timeline | Employee | Career timeline, upcoming due dates, open alerts, refusal/sealed-cover markers | empty, success |
| Career-Path & Succession (advisory) | HR/Dept Head | Path stepper, readiness grid, eligibility projection, "advisory" badge | empty, bench-risk |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA: keyboard navigable grids, focus-visible, ARIA on status chips and countdowns; colour is never the sole signal (icon + label with category/severity colour).
- Dark mode supported via design tokens; no hardcoded colours.
- Every list paginated (max 100), with server-side sort/filter; empty/loading/error/success/permission states explicit (no skeleton-only screens).
- **Field-level masking:** APAR detail, disciplinary status and reservation category in the eligibility grid render only for field-authorised roles; others see a masked placeholder (impr. #16).
- Destructive/statutory actions (finalise, effect order, sanction MACP, revert probation, run correction cascade, de-reserve) require confirmation with a summary of side effects (SR posting, pay change, cascade impact).
- Sub-judice entities show a persistent banner and disable effecting actions.
- Dates display DD-MMM-YYYY; money INR formatted; all times shown in user timezone; UI labels spell out acronyms for end-users (improvement: outsider readability).
- Row-level scoping: users see only data within their org/cadre authorisation.

---

## Section 8 — (reserved — see Section 9 API & Integration)

> Section numbering follows the 16-section authoring standard; API & Integration is consolidated in Section 9.

---

## Section 9 — API & Integration

### 9.1 Conventions

- Base path `/api/v1`; JSON; JWT bearer; RBAC + org scoping + **field-level access** enforced server-side.
- All list endpoints support `?page=&limit=` (max 100), `?sort=`, and resource-specific filters; responses include `pagination` metadata.
- Idempotency: SR-posting, order-effecting and correction-cascade endpoints accept an `Idempotency-Key` header; SR writes keyed by `source_module=M06` + `source_event_id`.

### 9.2 Canonical error envelope

```json
{
  "error": { "code": "VACANCY_NOT_RECONCILED", "message": "Case vacancy (13) does not match sanctioned promotion-quota vacancies (12).", "field": "vacancy_count" },
  "requestId": "req-9f2c1a7e"
}
```

### 9.3 Module error-code catalog (v2 additions in **bold**)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Generic input validation |
| AUTH_REQUIRED | 401 | Missing/invalid token |
| FORBIDDEN | 403 | Role/scope/field-level not permitted |
| NOT_FOUND | 404 | Resource absent |
| CONFLICT | 409 | Generic state conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unexpected |
| UPSTREAM_UNAVAILABLE | 503 | M03/M08/M09/M10/M12 dependency down |
| SENIORITY_RANK_CONFLICT | 409 | Duplicate/gap rank on publish |
| OBJECTION_WINDOW_CLOSED | 409 | Objection filed outside window |
| OBJECTIONS_PENDING | 409 | Finalise blocked by open objections |
| SENIORITY_LIST_NOT_FINAL | 409 | Case needs a finalised list |
| NO_ELIGIBLE_CANDIDATES | 409 | Field empty |
| QUORUM_NOT_MET | 409 | DPC quorum failure |
| PANEL_CONFLICT_OF_INTEREST | 409 | Candidate cannot be panel member |
| VACANCY_EXCEEDED | 409 | Select count > vacancies |
| ROSTER_POINT_OCCUPIED | 409 | Double-fill attempt |
| ROSTER_CATEGORY_MISMATCH | 409 | Wrong category fill |
| SEALED_COVER_NOT_REVIEWABLE | 409 | M09 case not concluded |
| PROBATION_NOT_COMPLETE | 409 | Declare before period elapsed |
| PROBATION_EXTENSION_LIMIT | 409 | Extension over cap |
| OFFICIATING_OVERLAP | 409 | Conflicting arrangement |
| NO_REGULAR_SELECTION | 409 | Regularise without selection |
| MACP_CAP_REACHED | 409 | 3 financial up-gradations exhausted |
| POST_NOT_AVAILABLE | 409 | Destination post unavailable |
| SR_POSTING_FAILED | 503 | SR write to M12 failed (held for retry) |
| **VACANCY_NOT_RECONCILED** | 409 | Case vacancy ≠ sanctioned promotion-quota vacancies |
| **STRENGTH_INCONSISTENT** | 409 | filled_count > sanctioned_strength |
| **QUOTA_SPLIT_INVALID** | 409 | DR+promotion+LDCE quota > 100 |
| **APAR_NOT_USABLE** | 409 | Uncommunicated adverse APAR relied upon (Dev Dutt) |
| **EWS_CERT_EXPIRED** | 409 | EWS/creamy-layer certificate not current on crucial date |
| **EXAM_NOT_PASSED** | 409 | LDCE/departmental exam gate failed |
| **OWN_MERIT_MIGRATION_REQUIRED** | 409 | Own-merit reserved candidate placed on reserved point |
| **PANEL_EXPIRED** | 409 | Order generation from expired select panel |
| **ENTITY_SUB_JUDICE** | 409 | Effecting blocked by active interim stay |
| **EMPLOYEE_DEBARRED** | 409 | Re-consideration within refusal debarment window |
| **REFUSAL_POLICY_MISSING** | 409 | Debarment/MACP-clock config absent |
| **STREAM_TAG_MISSING** | 409 | Multi-stream construction missing stream tag |
| **QUOTA_RULE_INVALID** | 409 | Invalid rota-quota rule |
| **CASCADE_FAILED** | 409 | Correction recompute cascade rolled back |

### 9.4 Representative JSON examples

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

**Compute eligibility (response, excerpt — APAR-usability + certificate currency)**
```json
{
  "caseId": "pc-2026-ASO-SO",
  "assessed": 28,
  "results": [
    { "employee_id": "emp-1001", "overall_result": "ELIGIBLE", "qsl_snapshot_id": "qsl-1001", "qualifying_service_years": 13.55, "apar_pass": true, "apar_usable": true, "vigilance_status": "CLEAR" },
    { "employee_id": "emp-1110", "overall_result": "NOT_ELIGIBLE", "apar_usable": false, "failure_reasons": ["APAR_NOT_COMMUNICATED", "EXAM_NOT_PASSED"] }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 28 }
}
```

**Effect promotion order (response)**
```json
{
  "order_id": "ord-01",
  "order_no": "PROM-ORD/2026/001",
  "status": "EFFECTED",
  "subject_to_litigation": false,
  "sr_event_id": "sr-evt-55012",
  "effective_date": "2026-04-01"
}
```

**Run correction cascade (response — pay-anomaly stepping-up to M10)**
```json
{
  "correction_event_id": "ce-01",
  "reason_class": "COURT_ORDER",
  "cascade_status": "COMPLETED",
  "reranked_entries": 14,
  "resnapshotted_qsl": 9,
  "pay_anomaly_flag": true,
  "pay_anomaly_signal_ref": "m10-stepup-7781",
  "sr_correction_event_id": "sr-evt-55190"
}
```

### 9.5 Integration contracts

| Integration | Direction | Contract |
|---|---|---|
| M01 Employee master | read + write-signal | Read person/job/designation; signal designation/org_unit change on effect/join; filled-count reconciliation |
| M03 Leave | read | EOL/leave facts for the qualifying-service ledger (FR-016) |
| M08 APAR | read | `GET /m08/apar?employeeId=&years=`: grading + benchmark band **+ communicated flag + representation status** per year (impr. #2) |
| M09 Disciplinary/Vigilance | read + **event** | Status read; suspension facts for QSL; **subscribe to case-conclusion events** for sealed cover; degrade to scheduled reconcile if only status read (impr. #19) |
| M10 Payroll | event + signal | Emit pay-fixation event on MACP/promotion effect; **emit stepping-up/pay-anomaly signal** on correction cascade; **M10 is system-of-record for increments** (mirror only) (impr. #7, #18) |
| M11 Pension | read | Anticipated-vacancy (superannuation) data for sanctioned-post computation |
| M12 Digital SR | write (idempotent) | Append service event keyed by source_event_id; correction events post SR corrections |
| M13 Documents | read/write | Upload/version orders, minutes, lists, quantifiable-data records, court orders, exam results |
| M05 Transfer | create/sync | Create relieving/joining movement for out-station postings |
| M07 Training | read | Competency references for career-path stages (advisory; read-only) |
| Notifications | write | Alerts, invitations, acknowledgements, sealed-cover review reminders, stay notifications |

---

## Section 10 — Non-Functional Requirements

### 10.1 NFR table

| Category | Requirement |
|---|---|
| Performance | P95 < 500ms for reads; eligibility batch compute of 5,000 employees < 5 min (async with progress); seniority list (10k entries) generation < 60s; correction cascade on a 10k-entry list < 5 min (async, resumable) |
| Scalability | Horizontal stateless API; batch jobs partitioned by cadre/org for parallelism |
| Availability | 99.9% uptime; SR-posting retries with backoff; degraded read mode if M08/M09 down; sealed-cover reconcile fallback if M09 event bus down |
| Consistency | Statutory writes (order effect, MACP sanction, select-list approval, refusal processing, correction cascade) are ACID transactions; SR posting idempotent; QSL snapshots immutable |
| Security | OWASP ASVS; RBAC + row-level org scoping; **field-level access** on eligibility PII; sealed-cover data restricted; parameterised queries only; secrets via env |
| Privacy | DPDP Act 2023 alignment; PII minimisation in comparative views; reservation category masked from unauthorised roles; **module DPIA for the eligibility snapshot (§10.2)** |
| Auditability | Every state change in `audit_log`; statutory artefacts immutable & versioned; correction lineage append-only; full reconstruction of any promotion decision incl. the cited QSL snapshot and APAR-usability decision |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Structured logs with requestId; metrics on batch durations, SR-posting success rate, alert/cascade counts, pay-anomaly signals; alerting on SR-post failure backlog and failed cascades |
| Retention | Seniority lists, DPC minutes, orders, correction events retained per statutory schedule (typically permanent for service-record-linked artefacts); **APAR snapshot (`apar_detail_json`) retained only until `apar_snapshot_retention_until`** then purged/anonymised (impr. #16) |
| Recovery | RPO ≤ 15min; RTO ≤ 4h |
| Localisation | DD-MMM-YYYY, INR, timezone-aware; i18n-ready labels with acronyms spelled out |

### 10.2 DPIA note — eligibility snapshot (improvement #16)

The `eligibility_assessments` row (with `apar_detail_json`, `disciplinary_status`, `reservation_category`, `obc_creamy_layer_status`) is the **single most sensitive PII concentration** in the suite. Controls:

- **Purpose limitation:** the APAR/disciplinary/category fields may be read only for eligibility adjudication and audit; never for general HR browsing.
- **Field-level access control:** only DPC members, the adjudicating HR Officer, Vigilance Officer (disciplinary) and Auditor can decrypt the APAR snapshot; all other roles see masked values.
- **Explicit retention:** `apar_snapshot_retention_until` bounds the APAR snapshot lifetime; a scheduled job purges/anonymises expired snapshots while preserving the immutable decision outcome and trace (not the raw grades).
- **Minimisation:** comparative grids show pass/fail chips, not raw grades, unless field-authorised.
- **Auditability:** every read of the APAR snapshot is logged with requestId and role.

---

## Section 11 — Workflow & State Diagrams (State Tables)

### 11.1 Seniority list lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | DRAFT | scope valid | entries generated (multi-stream via FR-020) |
| DRAFT | publish (checker) | PUBLISHED_TENTATIVE | ranks contiguous; not sub-judice | baseline frozen |
| PUBLISHED_TENTATIVE | open window | OBJECTIONS_OPEN | window dates set | notify scope |
| OBJECTIONS_OPEN | window close | OBJECTIONS_CLOSED | date passed | — |
| OBJECTIONS_CLOSED | finalise | FINALISED | no open objections; not sub-judice | supersede prior, PDF, notify |
| FINALISED | correction (FR-018) | UNDER_CORRECTION | correction event approved | re-rank cascade |
| UNDER_CORRECTION | cascade complete | FINALISED | cascade COMPLETED | SR correction, pay-anomaly signal |
| any | interim stay (FR-017) | INTERIM_STAYED | stay active | effecting blocked |
| FINALISED | supersede | SUPERSEDED | new final issued | — |

### 11.2 Promotion case lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | assemble field | FIELD_ASSEMBLED | final list exists; vacancy reconciled (FR-015) | candidates created |
| FIELD_ASSEMBLED | compute eligibility | ELIGIBILITY_DONE | rule active; QSL cited | assessments |
| ELIGIBILITY_DONE | constitute panel | PANEL_CONSTITUTED | quorum config; validity set | panel created |
| PANEL_CONSTITUTED | hold DPC | DPC_HELD | quorum met; panel current | verdicts, eligibility frozen |
| DPC_HELD | approve select list | SELECT_LIST_APPROVED | count ≤ vacancies; roster ok (own-merit) | roster points tagged |
| SELECT_LIST_APPROVED | issue orders | ORDERS_ISSUED | candidates FIT; panel not expired | orders + SR |
| any (pre-orders) | interim stay | INTERIM_STAYED | stay active (FR-017) | effecting blocked |
| ORDERS_ISSUED | close | CLOSED | all effected/declined | — |
| any (pre-orders) | cancel | CANCELLED | authority | audit |

### 11.3 Promotion order lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| DRAFT | issue (checker) | ISSUED | candidate FIT; panel current | document |
| ISSUED | accept | ACCEPTED | within window | — |
| ISSUED | no response | DEEMED_ACCEPTED | window lapsed | — |
| ISSUED | decline | DECLINED | — | **refusal created (FR-019)**, reserve consideration |
| ACCEPTED/DEEMED | effect | EFFECTED | SR available; no active stay | SR post, M01 signal, probation create |
| ISSUED/EFFECTED | interim stay (FR-017) | INTERIM_STAYED | stay active | effecting blocked |
| EFFECTED | supersede/correct | SUPERSEDED | reversion/error/court (FR-018) | SR correction, possible pay-anomaly signal |

### 11.4 Financial up-gradation lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | due detected | DUE | QSL net service met; cap < 3; refusal effect applied | alert |
| DUE | screen | UNDER_SCREENING | committee | assessment |
| UNDER_SCREENING | sanction | SANCTIONED | benchmark met; cap ok; no penalty | order |
| SANCTIONED | effect | EFFECTED | — | SR + M10 pay event |
| DUE/UNDER_SCREENING | defer | DEFERRED | penalty current / refusal STOP | re-eval on expiry |
| UNDER_SCREENING | reject | REJECTED | benchmark fail | audit |

### 11.5 Officiating arrangement lifecycle

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | ACTIVE | no overlap; sanctioned post | SR start |
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
| ON_PROBATION/EXTENDED | declare | DECLARED_SATISFACTORY | period elapsed | confirmation SR |
| ON_PROBATION/EXTENDED | revert | REVERTED | authority | order superseded, SR |

### 11.7 Posting lifecycle (NEW state — improvement #20)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create | PENDING | order EFFECTED; sanctioned post vacant (FR-015) | — |
| PENDING | relieve | RELIEVED | out-station; M05 movement | — |
| RELIEVED/PENDING | join | JOINED | reported by date | SR post, M01 org_unit update |
| PENDING/RELIEVED | deadline missed | NOT_JOINED | report-by passed | consequence (ORDER_REVIEW/FORFEITED/EXTENSION_GRANTED) |
| any | cancel | CANCELLED | authority | audit |

### 11.8 Refusal lifecycle (NEW — improvement #12)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | order declined | ACTIVE | decline recorded (FR-007) | debarment_until set, MACP-clock effect applied |
| ACTIVE | debarment expiry | EXPIRED | date passed | re-consideration allowed |
| ACTIVE | waive | WAIVED | authority + justification | debarment lifted |

### 11.9 Correction-event / legal lifecycle (NEW — improvements #5, #6)

| Current | Event | Next | Guard | Side effect |
|---|---|---|---|---|
| — | create correction | PENDING | trigger present | — |
| PENDING | approve (checker) | RUNNING | maker ≠ checker | set UNDER_CORRECTION |
| RUNNING | cascade complete | COMPLETED | re-rank/recompute ok | SR correction, pay-anomaly signal to M10 |
| RUNNING | cascade error | FAILED→ROLLED_BACK | failure | rollback + alert |
| Legal: FILED | interim stay | INTERIM_STAYED | stay order | entity → INTERIM_STAYED |
| Legal: INTERIM_STAYED | vacate | PENDING | stay vacated | entity restored |
| Legal: PENDING | dispose adverse | DISPOSED_ADVERSE | court order | trigger correction event |

---

## Section 12 — Notifications

| Event | Trigger | Recipients | Channel | Template key |
|---|---|---|---|---|
| Tentative list published | publish | In-scope employees | email/in-app | SEN_TENTATIVE_PUBLISHED |
| Objection acknowledged | objection submit | Objector | in-app | OBJ_ACK |
| Objection disposed | dispose | Objector | email/in-app | OBJ_DISPOSED |
| Final list notified | finalise | In-scope employees | email/in-app | SEN_FINAL |
| List under correction | correction approved | In-scope affected employees | email/in-app | SEN_UNDER_CORRECTION |
| DPC convened | panel convened | Panel members | email | DPC_INVITE |
| Panel expiry approaching | panel-currency lead time | DPC Secretary, HR | in-app | PANEL_EXPIRY_WARNING |
| Select list approved | approval | HR, candidates (selected) | in-app | SELECT_LIST_APPROVED |
| Promotion order issued | issue | Promoted employee | email/in-app | PROM_ORDER_ISSUED |
| Acceptance reminder | window nearing | Promoted employee | email | PROM_ACCEPT_REMINDER |
| Refusal recorded / debarment ending | decline / lead time | Employee, HR | email/in-app | REFUSAL_RECORDED / REFUSAL_DEBARMENT_ENDING |
| Probation ending | lead-time before end | HR, manager | in-app | PROBATION_ENDING |
| MACP due | due detection | HR, employee | email/in-app | MACP_DUE |
| MACP sanctioned | sanction | Employee, payroll | email/in-app | MACP_SANCTIONED |
| Stagnation alert | threshold breach | HR, manager | in-app | STAGNATION_ALERT |
| Sealed cover review due | M09 conclusion / SLA | Vigilance, HR | email | SEALED_COVER_REVIEW |
| Posting issued / report-by / not joined | posting events | Promoted employee, HR | email/in-app | POSTING_REPORT_BY / POSTING_NOT_JOINED |
| Interim stay imposed/vacated | legal link update | HR, Appointing Authority, Legal | email/in-app | LEGAL_STAY_UPDATE |
| Pay-anomaly stepping-up raised | correction cascade | Payroll (M10), HR | email/in-app | PAY_ANOMALY_STEPUP |

All notifications recorded in shared `notifications` ledger; respect user preferences; statutory notices also generate a document of record where required.

---

## Section 13 — Reporting & Analytics

| Report | Description | Primary consumer |
|---|---|---|
| Establishment & vacancy report | Sanctioned/filled/vacant per grade/office, quota split, computed vacancies | Establishment, HR leadership |
| Seniority register (cadre-wise, multi-stream) | Current finalised seniority per cadre/grade with stream/quota | Establishment, Auditor |
| DPC proceedings & select-list report | Per-case minutes, verdicts, select/reserve/sealed lists, panel currency | Appointing authority, Auditor |
| Roster compliance report (with own-merit migrations) | Points filled vs. due by category, own-merit migrations, carry-forward, de-reservation, enabling justification | Roster officer, Auditor |
| Qualifying-service ledger extract | Net qualifying service + exclusion breakdown per employee/grade | HR, Auditor |
| Promotion throughput | Vacancies vs. filled vs. cycle time | HR leadership, M14 |
| Stagnation report | Employees beyond grade-tenure threshold (from QSL) without progression | HR, Dept head |
| MACP due & granted | Upcoming/granted up-gradations, cap usage (n/3), deferrals, refusal effects | HR, Payroll |
| Refusal & debarment register | Active/expired/waived refusals and MACP-clock effects | HR, Auditor |
| Due-for-promotion projection | Eligible cohorts by grade/cycle | HR, leadership |
| Succession readiness (advisory) | Critical positions, bench strength, risk | Leadership |
| Litigation-risk register | Sub-judice cases/orders/lists, interim stays, subject-to-outcome orders, supersessions, objections upheld, sealed covers pending | Legal/HR |
| Correction-lineage & pay-anomaly report | Correction events, re-ranks, stepping-up signals to M10 | Establishment, Payroll, Auditor |
| Audit trail extract | All state changes for a case/employee | Auditor |

Module reports expose data to M14 (enterprise analytics) via read APIs/materialised views; all reports respect org/cadre scoping and field-level access, and are exportable (PDF/CSV) with audit of export.

---

## Section 14 — Migration & Launch

### 14.1 Data migration

| Step | Source | Target | Validation |
|---|---|---|---|
| Sanctioned strength | Establishment sanction orders | `sanctioned_posts` | filled ≤ sanctioned; quota sum ≤ 100; reconcile filled with M01 |
| Service-fact baseline | Service books / M01/M03/M09 | `qualifying_service_ledger` (initial snapshots) | net = gross − exclusions; exclusion breakdown reproducible |
| Legacy seniority lists (multi-stream) | Existing registers/spreadsheets | `seniority_lists`/`seniority_entries` | rank contiguity; **stream tag present** (flag `STREAM_TAG_MISSING` for manual tagging); employee match by service_no |
| Quota/rotation history | Office orders | `seniority_quota_rules` + entry slot labels | ratios consistent; rotation reproducible |
| Past promotions | Service books / legacy HRMS | `promotion_orders` (EFFECTED, historical) | designation transitions valid; SR backfill |
| Existing MACP grants | Pay records | `financial_upgradations` (EFFECTED) | **count ≤ 3 financial up-gradations**; scheme/level mapping |
| Active officiating | Office orders | `officiating_arrangements` (ACTIVE) | no overlaps; sanctioned post linked |
| Reservation rosters | Roster registers | `reservation_rosters`/`roster_points` | cycle integrity; **own-merit migrations reconciled**; enabling justification attached |
| Pending litigation | Legal registers | `legal_case_links` | active stays flagged; sub-judice entities set INTERIM_STAYED |
| Ongoing probations | Service records | `probation_records` | end-date arithmetic |

- Migration runs in a staging environment; reconciliation report must show **0 unmatched mandatory records and 0 unresolved own-merit/stream-tag flags** before cutover.
- Historical SR backfill posts idempotently to M12 with `historical=true` flag.

### 14.2 Configuration before launch

- Sanctioned strength + quota split per grade/office; vacancy-computation parameters.
- Service-exclusion rules (EOL/dies-non/suspension/ad-hoc/deputation) with worked examples (Appendix D.3).
- Seniority quota/rotation rules per multi-stream grade (Appendix D.4).
- Eligibility rules per grade pair (incl. APAR-communication, cert-currency, LDCE exam flags); zone slabs (Appendix D.1); benchmark thresholds.
- Reservation policy parameters; roster cycle sizes; enabling-provision references; consequential-seniority mode (Appendix D.2).
- Panel currency duration; probation periods; MACP qualifying-year schedule and cap (3); refusal debarment + MACP-clock effects.
- Alert lead times and stagnation thresholds; career-path templates (advisory).

### 14.3 Launch strategy

- Phase 0 (NEW): Establishment-strength register (FR-015) + qualifying-service ledger (FR-016) seeded and reconciled — prerequisite to all kernels.
- Phase 1: Multi-stream seniority + eligibility (read-only verification with HR).
- Phase 2: Promotion case → DPC (panel currency) → orders (refusal, subject-to-litigation) + SR posting (pilot cadre).
- Phase 3: MACP (corrected cap), officiating, posting integration with M05/M10; legal-case linkage + correction cascade.
- Phase 4: Progression monitoring (increment mirror), career-path/succession (advisory), dashboards.
- Each phase gated by reconciliation against legacy and SR posting verification.

### 14.4 Rollback & cutover

- Feature-flagged module; legacy registers retained read-only during parallel run.
- Rollback plan: disable write endpoints, retain data, revert to legacy for in-flight cases; no SR events deleted (corrections only via FR-018).

---

## Section 15 — Traceability, Dependency & Parallel-Agent Plan

### 15.1 FR ↔ Entity ↔ API traceability matrix

| FR | Sub-module | Primary entities | Key endpoints | Upstream deps |
|---|---|---|---|---|
| FR-PPP-001 | PPP-SEN | seniority_lists, seniority_entries | POST /seniority-lists | M01, FR-020 |
| FR-PPP-002 | PPP-SEN | seniority_lists, seniority_objections | publish/finalise/objections | M13, notif, workflow, FR-018 |
| FR-PPP-003 | PPP-ELG | eligibility_rules, eligibility_assessments, exam_results | compute-eligibility | FR-016, M08, M09 |
| FR-PPP-004 | PPP-DPC | promotion_cases, promotion_candidates | assemble-field | FR-001/002/003, FR-015 |
| FR-PPP-005 | PPP-DPC | promotion_panels (currency), dpc_proceedings | panels/proceedings/verdict | FR-004/006, M13 |
| FR-PPP-006 | PPP-ROS | reservation_rosters, roster_points | rosters/points (own-merit) | FR-005 |
| FR-PPP-007 | PPP-ORD | promotion_orders | orders/effect/decline | FR-005/006/019, M12/M13/M01 |
| FR-PPP-008 | PPP-DPC | promotion_candidates (sealed) | sealed-covers/review | M09 (event), FR-005/007/018 |
| FR-PPP-009 | PPP-ORD | probation_records | probations | FR-007, M12 |
| FR-PPP-010 | PPP-OFF | officiating_arrangements | officiating | FR-005/007, FR-015, M12 |
| FR-PPP-011 | PPP-FIN | financial_upgradations, macp_assessments | financial-upgradations | FR-016/019, M08/M09/M10/M12 |
| FR-PPP-012 | PPP-POST | promotion_postings | orders/postings | FR-007, FR-015, M05/M12/M01 |
| FR-PPP-013 | PPP-MON | progression_alerts, increment_monitor | progression/alerts | FR-016/003/011/019, M08/M09/M10 |
| FR-PPP-014 | PPP-CAR | career_paths, succession_plans | career-paths/succession | M07, FR-003 (advisory) |
| FR-PPP-015 | PPP-EST | sanctioned_posts | sanctioned-posts | M01, M11 |
| FR-PPP-016 | PPP-QSL | qualifying_service_ledger, service_exclusion_rules | qualifying-service/compute | M01, M03, M09 |
| FR-PPP-017 | PPP-LEG | legal_case_links | legal-case-links | FR-002/004/007, FR-018 |
| FR-PPP-018 | PPP-COR | correction_events | correction-events | FR-002/016/017, M10/M12 |
| FR-PPP-019 | PPP-ORD | promotion_refusals | refusals | FR-007, FR-011 |
| FR-PPP-020 | PPP-SEN | seniority_quota_rules, seniority_entries | seniority-quota-rules | FR-001, M01 |

### 15.2 Dependency graph (build order)

```
M01, M03, M08, M09, M10, M11, M12, M13 (external, available)
  └─ FR-015 (sanctioned posts) ─┐
  └─ FR-016 (QSL) ──────────────┤  (foundational — build first)
  └─ FR-020 (quota) ─ FR-001 ─ FR-002 ─┐
  └─ FR-003 (eligibility, cites FR-016) ┤
                                         └─ FR-004 (vacancy←FR-015) ─ FR-005 (panel currency) ─ FR-006 (own-merit) ─ FR-007 ─┬─ FR-008
                                                                                                                              ├─ FR-009
                                                                                                                              ├─ FR-010
                                                                                                                              ├─ FR-011 (FR-016/019, M10)
                                                                                                                              ├─ FR-012 (FR-015, M05)
                                                                                                                              └─ FR-019 (refusal)
  FR-017 (legal) ─ FR-018 (correction cascade ← FR-002/016/017, M10)
  FR-016/003/011/019 ─ FR-013 (monitoring, increment mirror←M10)
  M07/FR-003 ─ FR-014 (advisory)
```

### 15.3 Parallel-agent work packages

| Package | FRs | Can run parallel with | Shared-entity contention |
|---|---|---|---|
| WP-0 Foundations | FR-015, FR-016 | — (build first) | sanctioned_posts, qualifying_service_ledger (own) |
| WP-A Seniority | FR-001, FR-002, FR-020 | WP-B (after WP-0) | seniority_* (own) |
| WP-B Eligibility | FR-003 | WP-A | eligibility_* (own); cites QSL; reads M08/M09 |
| WP-C Case+DPC+Roster | FR-004, FR-005, FR-006 | (after A,B,0) | promotion_*, roster_* (own); vacancy from sanctioned_posts |
| WP-D Orders+Probation+Refusal | FR-007, FR-009, FR-019 | WP-E,F (after C) | promotion_orders, probation_*, promotion_refusals; coordinate SR posting |
| WP-E Officiating | FR-010 | WP-D,F | officiating_* (own); shares OrderService |
| WP-F MACP | FR-011 | WP-D,E | financial_* (own); shares OrderService + SR; cites QSL; consumes refusal |
| WP-G Posting | FR-012 | after WP-D | promotion_postings; M05 contract; validates sanctioned_posts |
| WP-H Monitoring | FR-013 | after B,F | progression_*, increment_* (mirror) (own) |
| WP-I Career/Succession (advisory) | FR-014 | after B | career_*, succession_* (own) |
| WP-J Sealed cover | FR-008 | adjacent to WP-D | promotion_candidates (status fields) — coordinate with WP-C/D |
| WP-K Legal+Correction | FR-017, FR-018 | after A,C,D,0 | legal_case_links, correction_events (own); touches seniority/orders via cascade |

**Shared contracts to lock before parallel build (improvement #8 adds the fifth):**
1. `SrPostingGateway` (M12) interface.
2. `OrderService.create()` signature (reused by FR-007/010/011).
3. `EligibilityEngine` interface (reused by FR-004/013/014).
4. Error-code catalog (§9.3) and enum catalog (§5.5).
5. **`QualifyingServiceLedger` interface** (FR-016) — single source cited by FR-003/011/013/014 (**locked, improvement #8**).
6. **`EstablishmentVacancyContract`** (FR-015 `sanctioned_posts`) — vacancy figure consumed by FR-004/010/012 (**locked, improvement #1**).
7. **`M10 stepping-up / pay-anomaly signal`** contract (FR-018 → M10) and **`M09 case-conclusion event`** contract (FR-008) (**locked, improvements #7, #19**).

### 15.4 Final Reconciliation Table (0 unresolved gaps)

| Concern | Covered by | Status |
|---|---|---|
| Sanctioned-strength register & vacancy computation | FR-015 | ✅ Resolved (impr. #1) |
| Single versioned qualifying-service ledger + exclusions | FR-016 | ✅ Resolved (impr. #8/#9) |
| Multi-stream seniority lists, tentative/final, objections | FR-001, FR-002, FR-020 | ✅ Resolved (impr. #4) |
| Eligibility incl. APAR-usability (Dev Dutt) & certificate currency | FR-003 | ✅ Resolved (impr. #2/#16) |
| LDCE / departmental-exam channel + exam-result gate | FR-003, exam_results | ✅ Resolved (impr. #14) |
| Promotion case & zone (pinned slab) with sanctioned vacancy | FR-004 | ✅ Resolved (impr. #1/#10) |
| DPC/panel with currency & supplementary DPC | FR-005 | ✅ Resolved (impr. #11) |
| Reservation roster compliance with own-merit migration & enabling justification | FR-006 | ✅ Resolved (impr. #3/#15) |
| Promotion orders, acceptance, refusal, subject-to-litigation, SR posting | FR-007 | ✅ Resolved (impr. #5/#12) |
| Refusal-of-promotion consequence (debarment + MACP clock) | FR-019 | ✅ Resolved (impr. #12) |
| Sealed-cover / Review DPC, event-driven, SLA, minor-penalty branch | FR-008 | ✅ Resolved (impr. #19/#20) |
| Promotion & probation lifecycle | FR-009 | ✅ Resolved |
| Ad-hoc/officiating/in-situ incl. superseded-by-regular | FR-010 | ✅ Resolved (impr. #20) |
| Financial up-gradation ACP/MACP (corrected cap, refusal-aware) | FR-011 | ✅ Resolved (impr. #13) |
| Posting after promotion (sanctioned-post validated, NOT_JOINED) | FR-012 | ✅ Resolved (impr. #1/#20) |
| Progression monitoring; increment as mirror of M10 | FR-013 | ✅ Resolved (impr. #18) |
| Career-path/succession (advisory, M07/M14 boundary) | FR-014 | ✅ Resolved (impr. #21) |
| Legal-case linkage & sub-judice handling | FR-017 | ✅ Resolved (impr. #5) |
| Correction-lineage & retrospective recompute cascade + pay-anomaly to M10 | FR-018 | ✅ Resolved (impr. #6/#7) |
| Reckoning-dates clarity | §5.8 | ✅ Resolved (impr. #17) |
| Four kernel worked examples + test vectors | Appendix D (§16.5) | ✅ Resolved (impr. #10) |
| SR posting for all promotion/posting/financial/correction events | FR-007/009/010/011/012/018 | ✅ Resolved |
| DPDP/privacy: eligibility-snapshot DPIA, field-level access, retention | §10.2, FR-003 | ✅ Resolved (impr. #16) |
| Canonical entity reuse | Section 5 | ✅ Resolved |
| Roles & SoD (maker≠checker, no self-adjudication) | Section 3, integrity rules | ✅ Resolved |
| Error envelope + module error codes | Section 9 | ✅ Resolved |
| NFRs, security, privacy, audit | Section 10 | ✅ Resolved |
| Notifications, reporting, migration | Sections 12-14 | ✅ Resolved |
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
| DPC | Departmental Promotion Committee — statutory body adjudicating promotions |
| Panel currency | Validity period of a DPC select panel; promotions from an expired panel are illegal |
| Benchmark | Minimum APAR grading threshold (Good/Very Good/Outstanding) for fitness |
| APAR usability (Dev Dutt) | An adverse/below-benchmark APAR can be relied upon only if communicated to the employee with the representation disposed |
| Zone of consideration | Set of senior-most eligible candidates considered for available vacancies, sized by the DoPT slab |
| Sealed cover | Procedure withholding a promotion recommendation while a disciplinary/vigilance case is pending |
| Supersession | Promoting a junior over a senior with recorded reasons (only on usable APAR material) |
| Reservation roster | Register applying SC/ST/OBC/EWS/PwBD reservation to posts/vacancies |
| Own-merit migration | A reserved candidate selected on general merit is adjusted against an unreserved point; the reserved point is not consumed |
| Consequential seniority vs catch-up | Two treatments of seniority for accelerated reserved promotions (Art 16(4A)) |
| Carry-forward / De-reservation | Unfilled reserved point rolled forward / converted to unreserved with authority |
| Qualifying-service ledger | Single versioned, snapshotted, citable computation of net qualifying service after exclusions |
| Service exclusions | Periods not counting toward qualifying service: EOL beyond limit, dies-non, suspension (per outcome), un-regularised ad-hoc, etc. |
| ACP/MACP | Assured / Modified Assured Career Progression — time-bound financial up-gradation schemes (cap 3 in a career) |
| Refusal consequence | Debarment window and MACP-clock effect arising from declining a promotion |
| Officiating / Ad-hoc / In-situ | Temporary upward placements pending regular promotion |
| Superseded-by-regular | An officiating incumbent terminated (not regularised) because the regular DPC selected someone else |
| Probation | Trial period in the promoted grade before confirmation |
| Sanctioned post / establishment strength | Authorised number of posts per grade/office with DR/promotion/LDCE quota split, the source of vacancy counts |
| Legal case link / sub-judice | A court/tribunal reference attached to a record; an interim stay blocks effecting |
| Correction event / recompute cascade | The single mechanism by which a finalised list/effected order is reopened and downstream re-ranked/recomputed |
| Stepping-up / pay anomaly | When a junior draws more than a senior after a retrospective correction; M06 flags, M10 fixes |
| Notional date | A date assigned for seniority/pay-step purposes without immediate arrears |
| Reckoning dates | as-on (seniority), crucial (eligibility), panel/vacancy year, effective, notional — see §5.8 |
| Digital SR | Digital Service Register (M12) — statutory service-event ledger |
| Stagnation | Prolonged service in a grade (from QSL net years) without promotion/up-gradation |

### 16.2 Appendix A — Configuration parameters

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
| APAR read API shape | M08 provides per-year grading + benchmark band **+ communicated flag + representation status** (impr. #2) | M08 team |
| Disciplinary event stream | M09 emits case-conclusion **events**; degrade to nightly status reconcile if only status read is available (impr. #19) | M09 team |
| Sealed-cover dependency | Confirmed as **event-driven** with poll fallback; periodic-review SLA enforced regardless | M09 team |
| Pay fixation & increments | M10 consumes pay event; **M10 is system-of-record for increments and stepping-up arithmetic**; M06 monitors/flags (impr. #7/#18) | M10 team |
| Leave/EOL facts | M03 exposes EOL/leave periods for the QSL | M03 team |
| Anticipated vacancies | M11 superannuation data feeds sanctioned-post computation | M11 team |
| Reservation policy version | Provided as configurable master data incl. enabling-provision references (Nagaraj) | Roster authority |
| SR idempotency key | `source_module + source_event_id` accepted by M12; correction events post SR corrections | M12 team |
| Legacy stream/quota history | May be incomplete; migration flags `STREAM_TAG_MISSING` for manual tagging | Establishment authority |

### 16.4 Appendix C — Standards referenced

- Shared Foundation Brief (`/docs/brd/SHARED_FOUNDATION.md`)
- OWASP ASVS; WCAG 2.1 AA; India DPDP Act 2023 (with module DPIA §10.2)
- Public-sector DPC/seniority/reservation/MACP procedural conventions (parameterised, not hard-coded)
- Jurisprudence reflected as controls (not hard-coded): `Dev Dutt` (APAR communication), `M. Nagaraj`/`Jarnail Singh` (reservation-in-promotion enabling data), `N.R. Parmar` (inter-se seniority of DR/promotees)

### 16.5 Appendix D — Pinned Kernel Algorithms & Worked Test Vectors (improvement #10)

The four litigation-bearing kernels are pinned here with inputs, formula and worked numeric vectors. These are the **test vectors** to ship before kernel code (council §3.8).

#### D.1 Zone of consideration (non-linear DoPT slab)

- **Inputs:** `vacancy_count` (from sanctioned_posts promotion quota); `slab` config; reserved-category extended-zone factor.
- **Formula (configurable, default slab):** `zone = 5 if v=1; 8 if v=2; 3×v if v≥3`. Reserved-category extended zone adds the policy factor where roster requires; ties at the boundary are included.
- **Worked vector:** v=1 → 5; v=2 → 8; v=5 → 15; v=12 → 36 candidates considered. For v=12 with a reserved extended-zone factor of +50% on SC/ST sub-field, the SC/ST consideration field extends to 18 while the general field stays 36. Boundary tie at rank 36–37 (equal seniority) → both included (field = 37).

#### D.2 Reservation-roster mathematics (with own-merit migration)

- **Inputs:** `cycle_size` (e.g., 100); reservation %s (e.g., SC 15, ST 7.5, OBC 27, EWS 10, PwBD 4 horizontal); selected candidates with category + `selected_on_own_merit`; carry-forward; de-reservation limit; 50% ceiling.
- **Rules:** own-merit reserved candidate occupies a UR point (`adjusted_against_category=GEN`), reserved point preserved; reserved points unfilled → carry-forward; de-reservation only after carry-forward limit; vertical reservation ≤ 50% (EWS additional per policy); PwBD interpolated horizontally.
- **Worked vector (100-point cycle, 12 vacancies):** Roster points due in this cycle: SC at points {7,15,...}, OBC at {8,...}. Suppose selected = 8 GEN, 2 SC, 2 OBC; one OBC (emp-1110) tops the general merit list. **Without migration (WRONG):** OBC point consumed → reservation over-counted. **With migration (CORRECT):** emp-1110 placed on a UR point with `adjusted_against_category=GEN`; the OBC roster point at #8 remains `CARRIED_FORWARD`/preserved; category tally = GEN 9 (8+1 own-merit), SC 2, OBC 1 against-roster + 1 own-merit-migrated. Compliance report itemises 1 own-merit migration; reserved tally unchanged by the migrated candidate.

#### D.3 Qualifying-service exclusions

- **Inputs:** entry-into-grade date; `as_of_date` (crucial date); leave/EOL periods (M03); suspension periods + outcome (M09); ad-hoc vs regular segments; deputation periods; `service_exclusion_rules`.
- **Formula:** `net = gross − Σ(excluded periods)`; EOL beyond `eol_max_condonable_days` excluded; dies-non fully excluded; suspension per `suspension_treatment`; ad-hoc counts only if `adhoc_counts_if_regularised` and regularised; deputation counts per flag.
- **Worked vector:** entry 2015-09-01, as-of 2026-01-01 → gross = 10.337 yrs (3775 days). Deduct: EOL 120 days (condonable limit 90 → 30 excess days excluded), dies-non 10 days, suspension 60 days (treatment EXCLUDE; later exoneration would trigger a correction recompute adding them back). Total exclusion = 30 + 10 + 60 = 100 days. **net = 3775 − 100 = 3675 days = 10.062 yrs.** If the eligibility rule requires 10.0 net years → ELIGIBLE; the snapshot stores the itemised breakdown and is cited by FR-003/011.

#### D.4 Multi-stream inter-se seniority (rota-quota)

- **Inputs:** stream-internal seniority lists (DR, Promotee, LDCE); `seniority_quota_rules` (ratio, method, start slot, carry-forward).
- **Formula (ROTA_QUOTA, ratio DR:Promotee = 1:1, start DR_FIRST):** rotate vacancy slots DR, PR, DR, PR, …; each slot draws the next senior-most from that stream; unfilled stream slot carries forward.
- **Worked vector:** DR list = [D1, D2, D3]; PR list = [P1, P2, P3]; ratio 1:1, start DR_FIRST. Combined rank order = D1(rank1, slot DR-1), P1(rank2, slot PR-1), D2(rank3, slot DR-2), P2(rank4, slot PR-2), D3(rank5, slot DR-3), P3(rank6, slot PR-3). If PR has only [P1] available at cycle 2, slot PR-2 carries forward and D3 takes rank4 (slot DR-3); PR-2 is filled later when P2 joins, re-rank handled via a correction event if the list was already finalised. Running-account method differs: quota deficiencies are reconciled across cycles rather than slot-by-slot — selectable via `rotation_method`.

---

*End of M06-PPP BRD v2.0.*
