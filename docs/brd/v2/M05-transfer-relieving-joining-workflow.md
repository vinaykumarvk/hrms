# Employee Transfer, Relieving and Joining Workflow — HRMS Module BRD (v2.0)

**Module code:** M05-TRJ
**Program:** Enterprise HRMS — "PeopleGov / HRMS Suite"
**Document version:** v2.0 (revised — incorporates Adversarial Council adopted improvements)
**Supersedes:** v1.0 (`docs/brd/v1/M05-transfer-relieving-joining-workflow.md`)
**Status:** Baseline for build (parallel-agent ready; contracts re-frozen post-council)
**Owns:** Transfer lifecycle entities (requests, orders, clearances, charge handovers, joining reports, deputations, drives, preferences, transfer policy rules) **plus** SR outbox, representations/stay-orders, counselling sessions, quarter/estate retention, gapless order-number sequences, order acknowledgements, and drive-scoped vacancy reservations.
**Reuses (does not redefine):** `employees`, `users`, `org_units`, `designations`, `roles`, `permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks` — all per `SHARED_FOUNDATION.md`.

---

## 1. Executive Summary

### 1.1 Purpose
The Employee Transfer, Relieving and Joining Workflow module (M05-TRJ) digitises the **end-to-end employee mobility lifecycle** of a government/public-sector organisation: from the **initiation of a transfer** (by request, administrative decision, mutual exchange, deputation, or promotion-linkage), through **transfer-order generation, statutory approval, and proof-of-service to the employee**, **relieving at the source office** (departmental no-dues/clearance, handover of charge, last-working-day, relieving order), the **transfer-in-transit / joining-time period treated as continuous paid service**, and finally **joining at the destination office** (joining report, charge assumption, confirmation of joining date, inter-se seniority sequencing). Every materially significant event is posted as a statutory **Service Register (SR) event** to the Digital SR (M12), and the relieving/joining events explicitly **assert no break in qualifying service**.

The module replaces a paper-driven, multi-office, hand-carried "Last Pay Certificate + relieving letter + joining report" process that today causes pay gaps, disputed seniority dates, lost no-dues forms, and unauditable transit periods. It establishes a **single auditable system of record** for who is posted where, from when, under what order, in whose custody during transit, and with what dues outstanding.

### 1.2 Business context (public-sector statutory)
Transfers in government are **regulated administrative actions**. They are constrained by transfer policy (minimum tenure at a post, transfer ban/freeze periods such as election model-code-of-conduct windows, protected categories such as spouse-posting, medical grounds, single-parent, differently-abled, near-retirement protection), by **vacancy and sanctioned-strength** discipline (the authoritative source of which is M01/M06, **read-through** by M05, not duplicated), and by **due process** (competent/appointing authority sanction, proof of service on the employee, transfer counselling for cadre drives). Relieving and joining have **pay and seniority consequences**: the date of relieving and date of joining define the **transit period**, which is **paid joining time / duty** (not dead time), and which fixes joining-time admissibility, pay continuity, and the **seniority/service continuity** recorded in the Digital SR. Transfers are routinely contested through representations and court/tribunal **stay orders**, and may end in **non-joining/abandonment**; all of these are first-class, modelled states. Errors are statutorily and financially material.

### 1.3 Scope summary
In scope: transfer request/initiation across all transfer types; eligibility & policy enforcement; counselling/preference capture **including interactive counselling sessions**; vacancy-driven and bulk transfer drives with an explicit vacancy lifecycle; transfer-order generation with **gapless statutory numbering**, approval, **proof-of-service & acknowledgement**, amendment, cancellation and revocation; **representation / stay-order / retention holds**; relieving (no-dues clearance **with SLA-bounded escalation and deemed clearance**, charge handover **with handover-under-protest**, relieving order **with deemed-relief Authority power**, last working day); **service-continuity and in-transit custody management**; joining (joining report, charge assumption, **inter-se seniority sequencing**, **non-joining/abandonment resolution**); deputation & repatriation; **government quarters/estate retention & licence-fee recovery**; SR-event posting via a fully-specified transactional outbox; module notifications, reporting and analytics.

Out of scope (owned elsewhere, integrated): the canonical employee master (M01), promotion decisioning and seniority computation (M06 — M05 consumes promotion-linked transfer triggers, reads sanctioned strength/seniority, and writes posting changes + joining-sequence facts), payroll Last Pay Certificate generation, **joining-time pay / transfer entitlement computation**, pay disbursement and licence-fee recovery (M10 — M05 raises the LPC trigger, the **pay-continuity + entitlement** signal, and the licence-fee-recovery signal), pension/retirement (M11), the Digital SR ledger itself (M12 — M05 is a writer), disciplinary proceedings for abandonment (M09 — M05 raises the trigger), and the document object store (M13 — M05 stores order/clearance PDFs there, with a sensitive-category access class for medical/spouse/compassionate evidence).

### 1.4 Primary outcomes & KPIs
| Outcome | KPI | Target |
|---|---|---|
| Faster relieving | Median time order-served → relieved | ≤ 5 working days |
| **No pay gaps (achievable post-v2)** | % transfers with continuous pay (no break) via service-continuity model | ≥ 99% |
| Auditable transit | % transfers with recorded relieving + joining dates **and a defined in-transit custodian** | 100% |
| Policy compliance | % orders violating ban/tenure rules at issue **without a recorded Authority override** | 0% (hard-blocked) |
| Clearance discipline | % relievings with all mandatory no-dues closed (cleared, with-dues, waived, or **deemed-cleared with audit**) | 100% |
| SR integrity | % transfer/relieving/joining events posted to M12 | 100% |
| Custody integrity | % in-transit employees with exactly one custodian office (no dual/zero posting) | 100% |
| Service-of-order integrity | % orders with recorded served-on date before relieve-by enforcement | 100% |
| Self-service adoption | % transfer requests raised via self-service portal | ≥ 70% |

### 1.5 Key stakeholders
Employees (transferees), Reporting Managers, HR Officers/Admins at source and destination offices, Department Heads / Appointing & Transfer Authorities, Clearance Officers (IT, Library, Accounts, Stores, Advances, Quarters/Estate), Estate/Quarters Officer, SR Custodian/Registrar (M12), Payroll Officer (M10), Disciplinary Authority (M09), Auditors, and System Administrators.

---

## 1A. Amendments (v1 → v2)

This table maps every council-adopted improvement to where and how it is incorporated. (Council report: `docs/evaluation/M05-transfer-relieving-joining-workflow-council.md`, §"Adopted Improvements for BRD v2", improvements 1–24; Risk Register risks 1–18.)

| # | Adopted improvement (risk) | Incorporated where | How |
|---|---|---|---|
| 1 | Service-continuity pay model (R1) | FR-TRJ-015 (new); §5.2.2 (`joining_time_pay_admissible`); §5.6-11; §8.3; §10.1; §16.1 | Pay-stop/start replaced by a single **pay-continuity** signal; transit modelled as paid duty/leave; SR RELIEVED/JOINED assert "no break in qualifying service". |
| 2 | In-transit custody rule + field (R2) | FR-TRJ-015 (new); §5.2.2 (`in_transit_custody_org_unit_id`); §5.6-12 | Explicit custodian office for pay/attendance/leave/headcount/discipline during `IN_TRANSIT`; integrity rule blocks dual/zero posting. |
| 3 | M10 joining-time-pay & entitlement signal (R1,R9) | FR-TRJ-015; §5.2.2 (`entitlement_ref`); §8.3; §8.4 | Entitlement signal keyed on `transfer_type`+`ground` (own-request vs administrative differ). |
| 4 | Authority forced-action power (R3) | FR-TRJ-016 (new); §5.5 (`forced_action_type`); §5.2.9/.10/.11 forced-action fields | `deemed_clearance`, `handover_under_protest`, `deemed_relief` as one mechanism with reason + approver audit. |
| 5 | Deemed/escalation clearance (R3) | FR-TRJ-006 (enhanced); FR-TRJ-016; §5.2.9 (SLA/escalation fields); §10.2 | Per-item SLA, escalation tiers, `DEEMED_CLEARED` state. |
| 6 | Representation/stay-order hold (R4) | FR-TRJ-017 (new); §5.2.14 `transfer_representations`; §5.5 status `STAY_HOLD`; §10.1 | New entity + `STAY_HOLD` order status pausing any pre-join stage. |
| 7 | Non-joining/abandonment path (R4) | FR-TRJ-018 (new); §5.5 (`ABANDONED`,`REVERTED_TO_SOURCE`); §10.3 | `LATE_JOINING_REVIEW → REVERT_TO_SOURCE` or M09 disciplinary; limbo-period pay defined. |
| 8 | Fully field-specify outbox (R5) | §5.2.15 `sr_outbox`; FR-TRJ-012 (enhanced); §16.3 | Full field table, idempotency-key formula, dead-letter retention. |
| 9 | Single `TransferOrderStateService` (R5) | §14.3; §16.6 | One owner/writer of `transfer_orders.status`; parallel-agent plan updated. |
| 10 | Explicit vacancy lifecycle (R6) | FR-TRJ-003/010 (enhanced); §5.2.16 `vacancy_reservations`; §5.6-6/-13 | Vacant-on-relief, filled-on-join; transactional re-check at join. |
| 11 | Strength read-through (R7) | §5.2.7 (modified); §5.4; §8.3 | Removed `sanctioned_strength`/`filled_count` as source of truth; read from M01/M06 with reconciliation. |
| 12 | `order_class` + reframed §5.6-1 (R8) | §5.2.2 (`order_class`); §5.5; §5.6-1 | "One active **substantive** transition"; additional-charge/deputation co-exist. |
| 13 | Calendar service contract + distance bands (R10) | §8.3; FR-TRJ-009 (enhanced); §16.4 | Named regional-calendar dependency; silent fallback removed; joining time by distance band. |
| 14 | Joining-sequence seniority integrity (R11) | FR-TRJ-021 (new); §5.2.12 (`joining_sequence_no`,`inter_se_tiebreak_key`); §5.6-14 | Deterministic tie-break by `service_no`; exposed to M06. |
| 15 | Order proof-of-service & acknowledgement (R12) | FR-TRJ-020 (new); §5.2.2 (`served_on_date`); §5.2.17 `order_acknowledgements` | Relieve-by enforcement references served date, not order date. |
| 16 | Gapless statutory numbering (R13) | FR-TRJ-004 (enhanced); §5.2.18 `order_number_sequences`; §16.7 | Reserve-then-commit; per-office/per-year; gap-audit report. |
| 17 | Mutual coupling through relieve/join (R14) | §5.6-5 (reframed); FR-TRJ-008/010; §5.2.2 (`mutual_pair_order_id`) | Paired-progress guard; no asymmetric completion. |
| 18 | Interactive counselling session (clash) | FR-TRJ-019 (new); §5.2.19 `counselling_sessions`; §5.2.20 `counselling_choices` | Per-candidate turn order, vacancy lock, immutable choice log; selected by `drive_type=COUNSELLING`. |
| 19 | Ring-fence sensitive docs (R15) | §9.x Privacy; §5.2.1 (`sensitive_ground`); §8.3 (M13 access class) | DPDP sensitive category, restricted access, explicit access logging. |
| 20 | Quarters/estate sub-process (R16) | FR-TRJ-022 (new); §5.2.21 `quarter_allotments`; §8.3 (licence-fee signal) | Retention flag, vacation-by date, licence-fee recovery to M10. |
| 21 | Rationalise enum taxonomy (R17) | §5.5 (canonical taxonomy note); §5.2.1 | Orthogonal axes: `transfer_type` (mechanism) / `ground` (justification) / `priority_category` (protection); `TRANSFER_ON_REQUEST` collapsed. |
| 22 | Acceptance tests for new invariants | §16.8 (new appendix) | Pay-continuity, custody, deemed-clearance/forced-relief audit, mutual coupling, un-overridden-violation tests. |
| 23 | Domain Primer appendix | §16.9 (new appendix); §15 glossary expanded | Defines LPC, no-dues, imprest/DDO charge, MCC, cadre, officiating, FN/AN relieving (and *why it matters*). |
| 24 | Re-prioritise FR-014 map; elevate representation | §14.2 (reordered build); FR-TRJ-014 marked Phase-2 | Map is enhancement; representation/stay-order is baseline. |

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Sub-area | Description | Representative FRs |
|---|---|---|
| **Transfer Initiation** | Request capture across all types (request/admin/mutual/deputation/promotion-linked), draft validation, sensitive-ground document ring-fencing | FR-TRJ-001 |
| **Policy & Eligibility** | Minimum tenure, ban/freeze windows, protected grounds, sanctioned-strength (read-through) checks | FR-TRJ-002 |
| **Counselling & Preferences** | Vacancy publication, preference/option capture, batch allotment | FR-TRJ-003 |
| **Interactive Counselling** | Live, observed counselling session with turn order, vacancy lock, immutable choice log | FR-TRJ-019 |
| **Approval, Numbering & Order** | Approval chain, gapless statutory order numbering, generation, publication | FR-TRJ-004 |
| **Proof-of-Service** | Service of order on employee, acknowledgement, basis for relieve-by enforcement | FR-TRJ-020 |
| **Bulk Drives** | Annual/seasonal transfer drives, batch initiation, allotment, bulk orders | FR-TRJ-005 |
| **Relieving — Clearance** | Departmental no-dues / clearance checklist lifecycle with SLA escalation & deemed clearance | FR-TRJ-006 |
| **Relieving — Charge Handover** | Handover of charge, records, assets, cash/imprest, handover-under-protest | FR-TRJ-007 |
| **Relieving — Order & LWD** | Relieving order issue, last-working-day, pay-continuity signal | FR-TRJ-008 |
| **Service Continuity & Custody** | Paid transit, joining-time pay, in-transit custodian, M10 entitlement signal | FR-TRJ-015 |
| **Transit Management** | In-transit status, joining-time by distance band, overdue handling | FR-TRJ-009 |
| **Joining** | Joining report, charge assumption, joining-date confirmation, pay-continuity resumption | FR-TRJ-010 |
| **Joining-Sequence & Seniority** | Inter-se joining order, deterministic tie-break, M06 feed | FR-TRJ-021 |
| **Non-Joining / Abandonment** | Late-joining review, revert-to-source, disciplinary linkage | FR-TRJ-018 |
| **Authority Forced-Action** | Deemed-clearance, handover-under-protest, deemed-relief as one power | FR-TRJ-016 |
| **Representation & Holds** | Representation / court-stay / retention-request holds | FR-TRJ-017 |
| **Deputation & Repatriation** | Deputation terms, tenure, extension, repatriation | FR-TRJ-011 |
| **Quarters / Estate** | Official-accommodation retention, vacation-by date, licence-fee recovery | FR-TRJ-022 |
| **SR Posting** | Posting transfer/relieving/joining as SR events (M12) via specified outbox | FR-TRJ-012 |
| **Amendment / Cancellation** | Order modification, cancellation, post-relieving revocation | FR-TRJ-013 |
| **Mapping & Analytics** | Geographic mapping (Phase-2), pendency, transit/clearance dashboards | FR-TRJ-014 |

### 2.2 Common Capabilities (inherited platform behaviours, applied in this module)
- **Maker-checker workflow** via the shared workflow engine for every order, relieving, and joining action.
- **Segregation of duties:** initiator ≠ approver; transferee may never approve own transfer or self-clear a no-dues item; clearance officer ≠ transferee; relinquisher ≠ acceptor; the Authority granting a forced action is recorded and may not be the transferee.
- **Single state authority:** all `transfer_orders.status` transitions are mediated by one **`TransferOrderStateService`** (§16.6); no other component writes the column.
- **Row-level scoping** by `org_unit_id`: source-office HR sees relieving; destination-office HR sees joining; a transferee in transit is visible to both and owned by the **in-transit custodian** (FR-TRJ-015).
- **Immutable audit** (`audit_log`) on every state transition, with before/after snapshots; **forced actions, overrides, deemed-clearances, and sensitive-document access additionally write a dedicated audit reason + actor**.
- **Soft delete** (`is_deleted`) on transactional entities except append-only ledgers/SR/outbox/choice logs.
- **Document binding:** every generated order and signed clearance/handover/joining artefact is stored in M13 `documents` and referenced by ID; medical/spouse/compassionate evidence uses the **sensitive access class**.
- **i18n / locale:** dates `DD-MMM-YYYY`; UTC storage; INR money; bilingual order templates.
- **Pagination:** all list endpoints cursor/page-limit, hard max page size 100.

### 2.3 In-scope / Out-of-scope boundary table
| Concern | In M05 | Owned by |
|---|---|---|
| Transfer order data & lifecycle (incl. gapless numbering, proof-of-service) | ✅ | M05 |
| No-dues / clearance (incl. SLA escalation, deemed clearance) | ✅ | M05 |
| Charge handover/assumption (incl. under-protest) | ✅ | M05 |
| Joining report + inter-se joining sequence | ✅ | M05 |
| In-transit custody assignment | ✅ | M05 |
| Representation / stay-order / retention holds | ✅ | M05 |
| Quarters/estate retention record + vacation timeline | ✅ | M05 |
| Deputation/repatriation records | ✅ | M05 |
| SR outbox & idempotency | ✅ | M05 |
| Employee master fields (designation, current org_unit, status) | Updated by M05 on join | M01 (owner) |
| Promotion decision, seniority math, **sanctioned strength** | Consumes/reads | M06 |
| LPC, **joining-time pay & transfer entitlement computation**, pay-continuity execution, dues/licence-fee recovery | Raises signals | M10 |
| Disciplinary proceedings for abandonment | Raises trigger | M09 |
| SR ledger entries | Writes events | M12 |
| Order/clearance PDFs storage + sensitive access class | References | M13 |
| Working-day / regional holiday calendar | Reads (contracted) | Platform Calendar Service |

### 2.4 Assumptions & constraints
- **Sanctioned strength / vacancy data is owned by M01/M06 and read-through by M05**; M05 stores only **drive-scoped reservation** state (`vacancy_reservations`). If the strength service is unavailable, vacancy-driven flows degrade to manual destination entry with a warning (no hard block) and a reconciliation flag.
- Transfer policy parameters (tenure thresholds, ban calendars, protected categories, clearance SLAs, joining-time distance bands) are configurable master data maintained by System Administrators and Transfer Authorities; the module ships seeded defaults.
- A transfer always has exactly one source `org_unit` and one destination `org_unit` (deputation destination may be an external organisation modelled as an `org_unit` of type `EXTERNAL`).
- "Office" = an `org_unit` of a transferable type; clearance departments are configured per office, and an office may legitimately have **fewer than the seven default departments** (only configured departments generate clearance items).
- A **successor may not exist**; charge may be handed to a link officer, the office (custody-of-office), or held under protest (FR-TRJ-007/016).
- The **transit period is paid duty/leave**, not unpaid; pay is continuous with a custody handoff (FR-TRJ-015).
- A working-day/holiday **calendar service exists and is regional-calendar aware**; M05 does not silently assume Sat/Sun + national holidays (§8.3, FR-TRJ-009).

---

## 3. Roles & Permissions

### 3.1 Module roles (extending shared RBAC baseline)
| Role | Module responsibility |
|---|---|
| **Employee (Transferee)** | Raise transfer-on-request / mutual request; submit preferences; **acknowledge order service**; submit joining report; view own transfer status & orders. |
| **Reporting Manager** | Recommend/endorse request; confirm charge handover acceptance where receiving charge. |
| **HR Officer (Source)** | Process relieving: drive clearance, issue relieving order, record LWD, raise LPC/pay-continuity; record **served-on date**. |
| **HR Officer (Destination)** | Receive transferee, validate joining report, confirm joining date, assign **joining sequence**, resume pay-continuity. |
| **HR Admin** | Initiate admin/bulk transfers, configure office clearance departments, manage drives & counselling sessions. |
| **Transfer Authority / Appointing Authority** | Approve/sanction transfer orders; approve amendments, cancellations, revocations; approve deputation & repatriation; **exercise forced-action powers** (deemed-clearance, handover-under-protest, deemed-relief); decide representations/stay-holds; override policy. |
| **Clearance Officer (per department: IT, Library, Accounts, Stores, Advances, Estate/Quarters)** | Grant/deny no-dues for their department; record outstanding dues. |
| **Estate / Quarters Officer** | Record official-accommodation retention, vacation-by dates, raise licence-fee-recovery signal. |
| **Charge Receiving Officer** | Accept handover of charge/assets at source; certify assumption at destination. |
| **SR Custodian / Registrar** | Confirm SR event postings; reconcile SR/outbox discrepancies (M12 role acting here). |
| **Payroll Officer** | Acknowledge pay-continuity, entitlement, LPC & licence-fee-recovery signals (M10 role acting here). |
| **Disciplinary Authority** | Receive abandonment trigger (M09 role acting here). |
| **Auditor** | Read-only access to all transfer records, holds, forced-action audit, and audit log. |
| **System Administrator** | Configure policy rules, ban calendars, order templates, clearance department catalog, SLA & distance bands, number-sequence policy; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=Execute action, — =none)
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
| Abandonment → revert/M09 | — | — | — | X | C | A | — | — | — | — | — | R | — |
| Amend / cancel / revoke order | — | — | C | C | C | A | — | — | — | — | — | R | — |
| Approve deputation / repatriation | — | — | C | C | C | A | — | — | — | — | — | R | — |
| Configure policy / templates / SLA / sequences | — | — | — | — | R | R | — | — | — | — | — | R | X |
| View analytics dashboard | R (own) | R (team) | R | R | R | R | R (own dept) | R (estate) | — | R | R | R | R |

All approvals enforce **maker ≠ checker** and **transferee-exclusion** invariants. Forced actions, overrides, and sensitive-document access additionally require a recorded justification and are surfaced in the audit trail and analytics.

---

## 4. Shared Application Foundation
This module inherits the entire `SHARED_FOUNDATION.md` technical and governance baseline and does not restate it. Concretely:
- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST API under `/api/v1`; PostgreSQL; object storage (M13) for PDFs; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org-unit scoping (§3).
- **Canonical error envelope:** `{ "error": { "code", "message", "field" }, "requestId" }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module-specific (§9.2 / §8.2).
- **Conventions:** UUIDv4 PKs + human business keys; audit fields on every table; UPPER_SNAKE_CASE enums; UTC storage / `DD-MMM-YYYY` display; cursor/page pagination max 100; maker-checker via shared workflow engine.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail, DPDP Act 2023 alignment (incl. **sensitive-category handling** for medical/spouse/compassionate evidence), statutory retention.
- **NFR baseline:** P95 API < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

Integration touchpoints owned elsewhere: **M01** (employee master read/update), **M06** (promotion-linked trigger, **sanctioned strength & seniority read-through**, joining-sequence consumer), **M10** (LPC, **pay-continuity + entitlement**, licence-fee recovery), **M09** (abandonment disciplinary trigger), **M12** (SR events), **M13** (documents + sensitive access class), **Platform Calendar Service** (regional working-day calendar), shared **workflow engine**, **notifications**, **audit_log**.

---

## 5. Holistic Data Model

### 5.1 Entity inventory
| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| 1 | `transfer_requests` | Module (new) | M05 | Initiated transfer intent of any type, pre-order. |
| 2 | `transfer_orders` | Module (new) | M05 | The sanctioned, numbered transfer order; master of the mobility instance (+ order_class, custody, service). |
| 3 | `transfer_policy_rules` | Module (new) | M05 | Configurable eligibility/policy constraints. |
| 4 | `transfer_ban_periods` | Module (new) | M05 | Freeze/ban calendar windows. |
| 5 | `transfer_drives` | Module (new) | M05 | Bulk transfer drive header (annual/seasonal). |
| 6 | `transfer_preferences` | Module (new) | M05 | Counselling preference/option list per transferee. |
| 7 | `vacancy_positions` | Module (new) | M05 | Publishable vacant posts (**strength read-through** from M01/M06; drive reservation only). |
| 8 | `clearance_checklists` | Module (new) | M05 | No-dues checklist header per relieving instance. |
| 9 | `clearance_items` | Module (new) | M05 | Per-department clearance line item (+ SLA, escalation, deemed). |
| 10 | `charge_handovers` | Module (new) | M05 | Handover (source) and assumption (destination) of charge (+ under-protest). |
| 11 | `relieving_orders` | Module (new) | M05 | Issued relieving order + last working day (+ deemed-relief, pay-continuity). |
| 12 | `joining_reports` | Module (new) | M05 | Joining report + charge-assumption + **inter-se joining sequence**. |
| 13 | `deputation_records` | Module (new) | M05 | Deputation terms, tenure, repatriation. |
| 14 | `transfer_representations` | **Module (new v2)** | M05 | Representations, court stays, retention requests — holds. |
| 15 | `sr_outbox` | **Module (new v2)** | M05 | Transactional outbox for SR/M10/M01 external signals. |
| 16 | `vacancy_reservations` | **Module (new v2)** | M05 | Drive-scoped reservation state over read-through vacancies; vacancy lifecycle. |
| 17 | `order_acknowledgements` | **Module (new v2)** | M05 | Proof-of-service & acknowledgement of a transfer order. |
| 18 | `order_number_sequences` | **Module (new v2)** | M05 | Gapless per-office/per-year statutory number reservation. |
| 19 | `counselling_sessions` | **Module (new v2)** | M05 | Interactive counselling session header + turn order. |
| 20 | `counselling_choices` | **Module (new v2)** | M05 | Immutable per-candidate live choice log. |
| 21 | `quarter_allotments` | **Module (new v2)** | M05 | Official-accommodation retention, vacation, licence-fee recovery. |
| 22 | `employees` | Shared | M01 | Person/job master — read; updated on join. |
| 23 | `org_units` / `designations` | Shared | platform | Offices, clearance departments, posts. |
| 24 | `users` / `roles` / `permissions` | Shared | platform | Principals & RBAC. |
| 25 | `service_register_events` | Shared | M12 | SR ledger (written by M05). |
| 26 | `documents` | Shared | M13 | Order/clearance/handover/joining PDFs (+ sensitive class). |
| 27 | `notifications` / `audit_log` | Shared | platform | Outbound notifications; immutable audit. |
| 28 | `workflow_instances` / `workflow_tasks` | Shared | platform | Approval engine. |

**Module-owned entities: 21** (v1: 13; +8 new in v2).

### 5.2 Field tables (module-owned entities)

> v1 entities are retained; **new/changed v2 fields are flagged** `[v2]`. Shared entities are referenced, not redefined.

#### 5.2.1 `transfer_requests`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_request_id` | UUID PK | N | |
| `request_no` | VARCHAR(30) UNIQUE | N | Human key, e.g. `TRQ-2026-000123`. |
| `employee_id` | UUID FK→employees | N | Transferee. |
| `transfer_type` | ENUM | N | Mechanism axis (§5.5). |
| `request_origin` | ENUM | N | `SELF`, `MANAGER`, `ADMIN`, `SYSTEM`. |
| `source_org_unit_id` | UUID FK→org_units | N | Current office. |
| `requested_dest_org_unit_id` | UUID FK→org_units | Y | Preferred/destination. |
| `mutual_counterpart_employee_id` | UUID FK→employees | Y | For `MUTUAL`. |
| `ground` | ENUM | Y | Justification axis (§5.5). |
| `ground_details` | TEXT | Y | |
| `supporting_document_ids` | UUID[] | Y | M13 references (non-sensitive). |
| `sensitive_document_ids` | UUID[] | Y | `[v2]` M13 **sensitive-class** refs (medical/spouse/compassionate). |
| `sensitive_ground` | BOOLEAN | N | `[v2]` Derived true when `ground ∈ {MEDICAL,SPOUSE,COMPASSIONATE}`; gates restricted access + access logging. |
| `linked_promotion_id` | UUID | Y | M06 reference when promotion-linked. |
| `linked_drive_id` | UUID FK→transfer_drives | Y | If part of a drive. |
| `priority_category` | ENUM | Y | Protection axis (§5.5). |
| `status` | ENUM | N | See state table §10. |
| `eligibility_result` | JSONB | Y | Cached policy-check outcome. |
| `workflow_instance_id` | UUID | Y | Shared engine. |
| `requested_effective_date` | DATE | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | audit | N | |

#### 5.2.2 `transfer_orders`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_order_id` | UUID PK | N | |
| `order_no` | VARCHAR(30) UNIQUE | N | Gapless statutory number (§5.2.18, FR-TRJ-004). |
| `order_class` | ENUM | N | `[v2]` `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION` (§5.5). |
| `transfer_request_id` | UUID FK→transfer_requests | Y | Null for direct admin orders. |
| `employee_id` | UUID FK→employees | N | |
| `transfer_type` | ENUM | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `source_designation_id` | UUID FK→designations | N | |
| `dest_designation_id` | UUID FK→designations | N | Same unless promotion-linked. |
| `order_date` | DATE | N | |
| `served_on_date` | DATE | Y | `[v2]` Date order served on employee (FR-TRJ-020); basis for relieve-by. |
| `acknowledged_at` | TIMESTAMPTZ | Y | `[v2]` Employee acknowledgement timestamp. |
| `relieve_by_date` | DATE | N | Statutory deadline to relieve (computed from `served_on_date` + window). |
| `expected_joining_date` | DATE | Y | |
| `joining_distance_band` | ENUM | Y | `[v2]` `LOCAL`,`SHORT`,`MEDIUM`,`LONG`,`OUTSTATION` — drives joining-time (§16.4). |
| `joining_time_days` | INT | Y | Derived from distance band + calendar. |
| `joining_time_pay_admissible` | BOOLEAN | N | `[v2]` Whether transit is paid joining time (FR-TRJ-015). Default true for admin; rule-driven for own-request. |
| `entitlement_ref` | VARCHAR(60) | Y | `[v2]` M10 entitlement signal reference (TTA/transfer grant/joining-time pay). |
| `in_transit_custody_org_unit_id` | UUID FK→org_units | Y | `[v2]` Owning office during `IN_TRANSIT` (pay/attendance/headcount/discipline). |
| `is_deputation` | BOOLEAN | N | Convenience flag (true when `order_class=DEPUTATION`). |
| `mutual_pair_order_id` | UUID FK→transfer_orders | Y | `[v2]` Reciprocal order for `MUTUAL`; paired-progress guard (§5.6-5). |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `status` | ENUM | N | §5.5/§10. Written **only** by `TransferOrderStateService`. |
| `hold_active` | BOOLEAN | N | `[v2]` True when a `STAY_HOLD` representation is in force (FR-TRJ-017). |
| `order_document_id` | UUID FK→documents | Y | Generated PDF. |
| `approved_by` | UUID FK→users | Y | Transfer Authority. |
| `approved_at` | TIMESTAMPTZ | Y | |
| `workflow_instance_id` | UUID | Y | |
| `revision_no` | INT | N | Default 0; increments on amendment. |
| `superseded_by_order_id` | UUID | Y | On amendment. |
| audit fields | | N | |

#### 5.2.3 `transfer_policy_rules`
| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_rule_id` | UUID PK | N | |
| `rule_code` | VARCHAR(40) UNIQUE | N | e.g. `MIN_TENURE_MONTHS`. |
| `rule_type` | ENUM | N | `MIN_TENURE`, `MAX_TENURE`, `BAN_WINDOW`, `PROTECTED_CATEGORY`, `SANCTIONED_STRENGTH`, `COOLING_PERIOD`, `STATION_RETENTION`, `JOINING_TIME_PAY` `[v2]`. |
| `scope_cadre` | VARCHAR(40) | Y | Null = all cadres. |
| `scope_org_unit_id` | UUID | Y | Null = global. |
| `param_value` | JSONB | N | e.g. `{ "months": 36 }` or `{ "admin": true, "own_request": false }`. |
| `enforcement` | ENUM | N | `HARD_BLOCK`, `SOFT_WARN`, `REQUIRE_OVERRIDE`. |
| `effective_from`/`effective_to` | DATE | Y | |
| `is_active` | BOOLEAN | N | |
| audit fields | | N | |

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
| audit fields | | N | |

#### 5.2.5 `transfer_drives`
| Field | Type | Null | Notes |
|---|---|---|---|
| `drive_id` | UUID PK | N | |
| `drive_code` | VARCHAR(30) UNIQUE | N | e.g. `DRIVE-2026-ANNUAL`. |
| `title` | VARCHAR(160) | N | |
| `cadre` | VARCHAR(40) | Y | |
| `drive_type` | ENUM | N | `ANNUAL`, `SEASONAL`, `AD_HOC`, `COUNSELLING`. |
| `preference_window_start`/`_end` | DATE | Y | |
| `allotment_method` | ENUM | N | `SENIORITY`, `MERIT`, `PREFERENCE`, `MANUAL`, `COUNSELLING` `[v2]`. |
| `status` | ENUM | N | `DRAFT`,`OPEN`,`COUNSELLING`,`ALLOTTED`,`ORDERS_ISSUED`,`CLOSED`,`CANCELLED`. |
| `total_positions` | INT | Y | |
| audit fields | | N | |

#### 5.2.6 `transfer_preferences`
| Field | Type | Null | Notes |
|---|---|---|---|
| `preference_id` | UUID PK | N | |
| `drive_id` | UUID FK→transfer_drives | N | |
| `employee_id` | UUID FK→employees | N | |
| `preference_rank` | INT | N | 1 = highest. |
| `preferred_org_unit_id` | UUID FK→org_units | N | |
| `vacancy_position_id` | UUID FK→vacancy_positions | Y | |
| `allotted` | BOOLEAN | N | Default false. |
| `seniority_score` | NUMERIC(10,3) | Y | From M06. |
| audit fields | | N | |
| **Unique** | (`drive_id`,`employee_id`,`preference_rank`) | | |

#### 5.2.7 `vacancy_positions` `[v2 — strength now read-through]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `vacancy_position_id` | UUID PK | N | |
| `org_unit_id` | UUID FK→org_units | N | |
| `designation_id` | UUID FK→designations | N | |
| `cadre` | VARCHAR(40) | Y | |
| `sanctioned_strength_cached` | INT | Y | `[v2]` **Read-through cache** of M01/M06 value; `source='M06'`, `as_of` timestamp; never authoritative. |
| `filled_count_cached` | INT | Y | `[v2]` Read-through cache; reconciled by job. |
| `reserved_count` | INT | N | `[v2]` Drive-scoped reservations held by M05 (authoritative locally). |
| `strength_as_of` | TIMESTAMPTZ | Y | `[v2]` Freshness of cached strength. |
| `strength_source` | ENUM | N | `[v2]` `M06`,`M01`,`MANUAL_FALLBACK`. |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `is_published` | BOOLEAN | N | |
| `geo_lat`/`geo_lng` | NUMERIC(9,6) | Y | For Phase-2 mapping. |
| audit fields | | N | |
| **Derived (not stored authoritatively)** | `vacant_count = sanctioned_strength_cached − filled_count_cached − reserved_count` | | Recomputed at read; never the source of truth for strength. |

#### 5.2.8 `clearance_checklists`
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_checklist_id` | UUID PK | N | |
| `checklist_no` | VARCHAR(30) UNIQUE | N | e.g. `NOD-2026-000789`. |
| `transfer_order_id` | UUID FK→transfer_orders | N | |
| `employee_id` | UUID FK→employees | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `status` | ENUM | N | `OPEN`,`IN_PROGRESS`,`BLOCKED`,`CLEARED`,`CLEARED_WITH_DUES`,`CLEARED_WITH_DEEMED` `[v2]`,`CANCELLED`. |
| `total_items`/`cleared_items` | INT | N | |
| `deemed_items` | INT | N | `[v2]` Count of `DEEMED_CLEARED`/`WAIVED` items. |
| `has_outstanding_dues` | BOOLEAN | N | |
| `dues_recovery_ref` | VARCHAR(60) | Y | M10 recovery linkage. |
| audit fields | | N | |

#### 5.2.9 `clearance_items` `[v2 — SLA/escalation/deemed added]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_item_id` | UUID PK | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `department_code` | ENUM | N | `IT`,`LIBRARY`,`ACCOUNTS`,`STORES`,`ADVANCES`,`ESTATE_QUARTERS`,`HR`,`OTHER`. |
| `assigned_officer_id` | UUID FK→users | Y | Clearance Officer. |
| `status` | ENUM | N | `PENDING`,`CLEARED`,`DUES_OUTSTANDING`,`WAIVED`,`DEEMED_CLEARED` `[v2]`. |
| `sla_due_at` | TIMESTAMPTZ | Y | `[v2]` Per-department SLA deadline. |
| `escalation_tier` | ENUM | N | `[v2]` `NONE`,`OFFICER`,`DEPT_HEAD`,`AUTHORITY`. |
| `escalated_at` | TIMESTAMPTZ | Y | `[v2]` Last escalation time. |
| `forced_action_type` | ENUM | Y | `[v2]` `DEEMED_CLEARED` when Authority-granted (§5.5). |
| `forced_action_reason` | TEXT | Y | `[v2]` Mandatory when deemed. |
| `forced_action_by` | UUID FK→users | Y | `[v2]` Granting Authority. |
| `dues_amount` | NUMERIC(14,2) | Y | INR. |
| `dues_description` | TEXT | Y | |
| `remarks` | TEXT | Y | |
| `evidence_document_id` | UUID FK→documents | Y | |
| `cleared_at` | TIMESTAMPTZ | Y | |
| audit fields | | N | |
| **Unique** | (`clearance_checklist_id`,`department_code`) | | |

#### 5.2.10 `charge_handovers` `[v2 — under-protest added]`
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
| `cash_imprest_amount` | NUMERIC(14,2) | Y | |
| `pending_files_count` | INT | Y | |
| `handover_note_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | `DRAFT`,`SUBMITTED`,`ACCEPTED`,`DISPUTED`,`UNDER_PROTEST` `[v2]`. |
| `under_protest` | BOOLEAN | N | `[v2]` Handover certified under protest (FR-TRJ-016). |
| `dispute_sla_due_at` | TIMESTAMPTZ | Y | `[v2]` Time-bound dispute resolution deadline. |
| `forced_action_type` | ENUM | Y | `[v2]` `HANDOVER_UNDER_PROTEST` when Authority-forced. |
| `forced_action_reason` | TEXT | Y | `[v2]` |
| `forced_action_by` | UUID FK→users | Y | `[v2]` |
| `accepted_by` | UUID FK→users | Y | |
| `accepted_at` | TIMESTAMPTZ | Y | |
| audit fields | | N | |

#### 5.2.11 `relieving_orders` `[v2 — deemed-relief, pay-continuity]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `relieving_order_id` | UUID PK | N | |
| `relieving_order_no` | VARCHAR(30) UNIQUE | N | Gapless (§5.2.18), e.g. `RO/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `employee_id` | UUID FK→employees | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `last_working_day` | DATE | N | |
| `relieving_time` | ENUM | N | `FORENOON`,`AFTERNOON` (load-bearing — see §16.9). |
| `relieved` | BOOLEAN | N | |
| `deemed_relief` | BOOLEAN | N | `[v2]` True when Authority stand-relieved the employee (FR-TRJ-016). |
| `forced_action_reason` | TEXT | Y | `[v2]` Mandatory when `deemed_relief`. |
| `forced_action_by` | UUID FK→users | Y | `[v2]` |
| `pay_continuity_signalled` | BOOLEAN | N | `[v2]` Replaces `pay_stop_signalled`; M10 told to **continue** pay across handoff. |
| `lpc_requested` | BOOLEAN | N | Last Pay Certificate trigger. |
| `relieving_order_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | §5.5/§10. |
| `issued_by` | UUID FK→users | Y | |
| audit fields | | N | |

#### 5.2.12 `joining_reports` `[v2 — joining sequence, continuity]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `joining_report_id` | UUID PK | N | |
| `joining_report_no` | VARCHAR(30) UNIQUE | N | Gapless, e.g. `JR/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `relieving_order_id` | UUID FK | Y | |
| `employee_id` | UUID FK→employees | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `reported_date` | DATE | N | Date employee physically reported. |
| `joining_date` | DATE | N | Confirmed date of joining (statutory). |
| `joining_time` | ENUM | N | `FORENOON`,`AFTERNOON`. |
| `joining_sequence_no` | INT | Y | `[v2]` Inter-se order among same-cadre/post joiners on the date (FR-TRJ-021). |
| `inter_se_tiebreak_key` | VARCHAR(60) | Y | `[v2]` Deterministic tie-break (e.g. `service_no`); exposed to M06. |
| `transit_days` | INT | Y | Derived: joining_date − LWD − holidays (calendar service). |
| `transit_within_admissible` | BOOLEAN | Y | vs `joining_time_days`. |
| `service_continuity_asserted` | BOOLEAN | N | `[v2]` SR JOINED event asserts no break in qualifying service. |
| `charge_assumption_id` | UUID FK→charge_handovers | Y | |
| `pay_continuity_resumed` | BOOLEAN | N | `[v2]` M10 confirmed continuity at destination. |
| `joining_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | §5.5/§10. |
| `verified_by` | UUID FK→users | Y | HR Destination. |
| audit fields | | N | |

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
| audit fields | | N | |

#### 5.2.14 `transfer_representations` `[v2 — new]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `representation_id` | UUID PK | N | |
| `representation_no` | VARCHAR(30) UNIQUE | N | e.g. `REP-2026-000045`. |
| `transfer_order_id` | UUID FK→transfer_orders | N | Order being contested/held. |
| `employee_id` | UUID FK→employees | N | |
| `representation_type` | ENUM | N | `REPRESENTATION`,`COURT_STAY`,`RETENTION_REQUEST`. |
| `filed_by` | ENUM | N | `EMPLOYEE`,`AUTHORITY`,`COURT`,`UNION`. |
| `authority_ref` | VARCHAR(120) | Y | Court/CAT case no. or representation reference. |
| `document_id` | UUID FK→documents | Y | Stay order / representation PDF. |
| `hold_from_stage` | ENUM | N | `PRE_RELIEF`,`PRE_JOIN`,`ANY`. |
| `status` | ENUM | N | `FILED`,`UNDER_REVIEW`,`HOLD_ACTIVE`,`UPHELD`,`REJECTED`,`VACATED`,`WITHDRAWN`. |
| `decision` | ENUM | Y | `ALLOW`,`DENY`,`MODIFY`,`VACATE`. |
| `decided_by` | UUID FK→users | Y | Transfer Authority. |
| `decided_at` | TIMESTAMPTZ | Y | |
| `valid_until` | DATE | Y | Stay validity. |
| audit fields | | N | |

#### 5.2.15 `sr_outbox` `[v2 — new; frozen contract]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `outbox_id` | UUID PK | N | |
| `aggregate_type` | ENUM | N | `TRANSFER_ORDER`,`RELIEVING_ORDER`,`JOINING_REPORT`. |
| `aggregate_id` | UUID | N | FK-by-convention to source row. |
| `target_system` | ENUM | N | `M12_SR`,`M10_PAYROLL`,`M01_MASTER`. |
| `event_type` | ENUM | N | `TRANSFER_ORDERED`,`RELIEVED`,`JOINED`,`PAY_CONTINUITY`,`ENTITLEMENT`,`LPC_REQUEST`,`POSTING_UPDATE`,`LICENCE_FEE_RECOVERY`,`COMPENSATING`. |
| `payload` | JSONB | N | Event body (immutable once written). |
| `idempotency_key` | VARCHAR(120) UNIQUE | N | **Formula:** `{target_system}:{event_type}:{aggregate_type}:{aggregate_id}:{revision_no}` (e.g. `M12_SR:RELIEVED:TRANSFER_ORDER:<uuid>:0`). |
| `status` | ENUM | N | `PENDING`,`IN_FLIGHT`,`DELIVERED`,`FAILED`,`DEAD_LETTERED`. |
| `attempt_count` | INT | N | Default 0. |
| `max_attempts` | INT | N | Default 8 (exponential backoff). |
| `next_attempt_at` | TIMESTAMPTZ | Y | Backoff schedule. |
| `last_error` | TEXT | Y | |
| `delivered_at` | TIMESTAMPTZ | Y | |
| `dead_lettered_at` | TIMESTAMPTZ | Y | After `max_attempts`; surfaced in reconciliation. |
| `created_at` | TIMESTAMPTZ | N | Append-only (no soft delete). |
| **Retention** | dead-lettered rows retained ≥ **180 days** after resolution; delivered rows ≥ **90 days** then archived. | | |

#### 5.2.16 `vacancy_reservations` `[v2 — new; vacancy lifecycle]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `reservation_id` | UUID PK | N | |
| `vacancy_position_id` | UUID FK→vacancy_positions | N | |
| `transfer_order_id` | UUID FK→transfer_orders | Y | Set when allotment becomes an order. |
| `employee_id` | UUID FK→employees | N | Reserved for. |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `lifecycle_state` | ENUM | N | `RESERVED`,`VACATED_ON_RELIEF`,`FILLED_ON_JOIN`,`RELEASED`,`EXPIRED`. |
| `reserved_at` | TIMESTAMPTZ | N | |
| `vacated_at` | TIMESTAMPTZ | Y | Set when source employee relieved (post becomes truly vacant). |
| `filled_at` | TIMESTAMPTZ | Y | Set when destination employee joins. |
| audit fields | | N | |
| **Unique** | (`vacancy_position_id`,`employee_id`,`drive_id`) | | |

#### 5.2.17 `order_acknowledgements` `[v2 — new; proof-of-service]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `acknowledgement_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK→transfer_orders | N | |
| `employee_id` | UUID FK→employees | N | |
| `served_on_date` | DATE | N | Date order served. |
| `delivery_channel` | ENUM | N | `IN_APP`,`EMAIL`,`SMS`,`REGISTERED_POST`,`HAND_DELIVERY`,`PUBLISHED_NOTICE`. |
| `served_by` | UUID FK→users | Y | HR officer serving (null for system channels). |
| `acknowledgement_status` | ENUM | N | `SERVED`,`ACKNOWLEDGED`,`DEEMED_SERVED`,`REFUSED`. |
| `acknowledged_at` | TIMESTAMPTZ | Y | Employee acknowledgement. |
| `deemed_served_reason` | TEXT | Y | When `DEEMED_SERVED` (e.g. registered-post returned, published notice). |
| `proof_document_id` | UUID FK→documents | Y | Postal receipt / acknowledgement scan. |
| audit fields | | N | |

#### 5.2.18 `order_number_sequences` `[v2 — new; gapless numbering]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `sequence_id` | UUID PK | N | |
| `sequence_scope` | ENUM | N | `TRANSFER_ORDER`,`RELIEVING_ORDER`,`JOINING_REPORT`,`CLEARANCE`,`REPRESENTATION`. |
| `office_org_unit_id` | UUID FK→org_units | N | Per-office. |
| `fiscal_year` | INT | N | Per-year (e.g. 2026). |
| `next_value` | BIGINT | N | Reserve-then-commit counter (row-locked). |
| `reserved_high_water` | BIGINT | N | Highest reserved (may exceed committed). |
| `prefix_template` | VARCHAR(40) | N | e.g. `TO/{yyyy}/{mm}/{seq:04d}`. |
| `gap_audit_last_run` | TIMESTAMPTZ | Y | Last gap-audit report time. |
| audit fields | | N | |
| **Unique** | (`sequence_scope`,`office_org_unit_id`,`fiscal_year`) | | |

#### 5.2.19 `counselling_sessions` `[v2 — new; interactive allotment]`
| Field | Type | Null | Notes |
|---|---|---|---|
| `session_id` | UUID PK | N | |
| `session_code` | VARCHAR(30) UNIQUE | N | e.g. `CNS-2026-ANNUAL-01`. |
| `drive_id` | UUID FK→transfer_drives | N | `drive_type=COUNSELLING`. |
| `scheduled_at` | TIMESTAMPTZ | N | |
| `turn_order_method` | ENUM | N | `SENIORITY`,`MERIT`. |
| `current_turn_employee_id` | UUID FK→employees | Y | Whose turn is live (holds vacancy lock). |
| `current_turn_started_at` | TIMESTAMPTZ | Y | |
| `turn_timeout_seconds` | INT | N | Auto-pass on timeout. |
| `status` | ENUM | N | `SCHEDULED`,`IN_PROGRESS`,`PAUSED`,`COMPLETED`,`CANCELLED`. |
| `presiding_officer_id` | UUID FK→users | N | Transfer Authority/HR Admin. |
| `total_candidates`/`completed_candidates` | INT | N | |
| audit fields | | N | |

#### 5.2.20 `counselling_choices` `[v2 — new; immutable choice log]`
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
| `created_at` | TIMESTAMPTZ | N | Immutable. |
| **Unique** | (`session_id`,`employee_id`,`turn_position`) | | |

#### 5.2.21 `quarter_allotments` `[v2 — new; estate retention]`
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
| `licence_fee_rate` | NUMERIC(14,2) | Y | INR per month (normal/penal). |
| `penal_rate_applies` | BOOLEAN | N | After permissible retention. |
| `licence_fee_recovery_ref` | VARCHAR(60) | Y | M10 recovery signal reference. |
| audit fields | | N | |

### 5.3 Relationship map
```
employees (M01) 1───* transfer_requests *───1 transfer_orders 1───1 relieving_orders
                                   │                  │                   │
                                   │                  ├──1 order_acknowledgements (proof-of-service)
                                   │                  ├──* transfer_representations (holds)
                                   │                  ├──1 clearance_checklists 1───* clearance_items (SLA/deemed)
                                   │                  ├──* charge_handovers (source + dest, under-protest)
                                   │                  ├──1 joining_reports (joining_sequence_no)
                                   │                  ├──0..1 deputation_records
                                   │                  ├──0..1 quarter_allotments (estate retention)
                                   │                  └──1 in_transit_custody_org_unit (custody during transit)
transfer_orders 1───* sr_outbox (M12/M10/M01 signals, idempotent)
transfer_drives 1───* transfer_preferences *───1 employees
transfer_drives 1───0..1 counselling_sessions 1───* counselling_choices (immutable)
transfer_drives 1───* vacancy_positions 1───* vacancy_reservations (lifecycle: reserved→vacated→filled)
order_number_sequences ──(reserve-then-commit)──> transfer_orders / relieving_orders / joining_reports
transfer_orders.mutual_pair_order_id ──(paired-progress guard)── transfer_orders
ALL state changes ──> audit_log ; documents (M13) ; notifications ; workflow_* ; service_register_events (M12 via sr_outbox)
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | M05 access | Notes |
|---|---|---|---|
| `employees` | M01 | Read; Update (org_unit_id, designation_id, employment_status) on join | Update only via M01 API/service. |
| `org_units`,`designations` | platform | Read | |
| **Sanctioned strength / seniority** | M06/M01 | **Read-through (cached)** | `[v2]` M05 never authoritative; reconciliation job refreshes `vacancy_positions` caches. |
| `service_register_events` | M12 | Append (write) via `sr_outbox` | |
| `documents` | M13 | Create/Read references; **sensitive access class** for medical/spouse/compassionate | `[v2]` |
| Working-day calendar | Platform Calendar Service | Read (contracted) | `[v2]` regional-aware. |
| `notifications`,`audit_log`,`workflow_*` | platform | Write/Read | |
| All `transfer_*`,`clearance_*`,`charge_*`,`relieving_*`,`joining_*`,`deputation_*`,`vacancy_*`,`sr_outbox`,`counselling_*`,`quarter_allotments`,`order_*` | **M05** | Full CRUD | System of record. |

### 5.5 Enum & reference catalog

**Canonical taxonomy note `[v2]`** — three **orthogonal axes** (resolves enum redundancy, Risk 17):
- **`transfer_type` = the mechanism** by which mobility occurs.
- **`ground` = the justification** for it.
- **`priority_category` = the statutory protection** the employee holds.
A request carries one value on each axis. `TRANSFER_ON_REQUEST` is **collapsed** into `transfer_type=REQUEST` (the "on request" sense is conveyed by `request_origin=SELF`).

| Enum | Values |
|---|---|
| `transfer_type` (mechanism) | `REQUEST`, `ADMINISTRATIVE`, `MUTUAL`, `DEPUTATION`, `PROMOTION_LINKED`, `COMPASSIONATE` |
| `ground` (justification) | `SPOUSE`, `MEDICAL`, `ADMINISTRATIVE`, `OWN_REQUEST`, `PROMOTION`, `DEPUTATION`, `COMPASSIONATE`, `OTHER` |
| `priority_category` (protection) | `PROTECTED_SPOUSE`, `MEDICAL`, `DIFFERENTLY_ABLED`, `NEAR_RETIREMENT`, `SINGLE_PARENT`, `NONE` |
| `order_class` `[v2]` | `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION` |
| `transfer_request.status` | `DRAFT`,`SUBMITTED`,`ELIGIBILITY_CHECK`,`RECOMMENDED`,`APPROVED`,`REJECTED`,`WITHDRAWN`,`ORDER_ISSUED`,`CANCELLED` |
| `transfer_order.status` | `DRAFT`,`PENDING_APPROVAL`,`APPROVED`,`PUBLISHED`,`SERVED` `[v2]`,`STAY_HOLD` `[v2]`,`RELIEVING_IN_PROGRESS`,`RELIEVED`,`IN_TRANSIT`,`JOINED`,`REVERTED_TO_SOURCE` `[v2]`,`ABANDONED` `[v2]`,`AMENDED`,`CANCELLED`,`REVOKED` |
| `relieving_order.status` | `DRAFT`,`PENDING_CLEARANCE`,`PENDING_APPROVAL`,`ISSUED`,`RELIEVED`,`DEEMED_RELIEVED` `[v2]`,`CANCELLED` |
| `joining_report.status` | `DRAFT`,`SUBMITTED`,`UNDER_VERIFICATION`,`JOINED_CONFIRMED`,`REJECTED`,`LATE_JOINING_REVIEW`,`ABANDONED` `[v2]` |
| `clearance_item.status` | `PENDING`,`CLEARED`,`DUES_OUTSTANDING`,`WAIVED`,`DEEMED_CLEARED` `[v2]` |
| `escalation_tier` `[v2]` | `NONE`,`OFFICER`,`DEPT_HEAD`,`AUTHORITY` |
| `forced_action_type` `[v2]` | `DEEMED_CLEARED`,`HANDOVER_UNDER_PROTEST`,`DEEMED_RELIEF` |
| `representation_type` `[v2]` | `REPRESENTATION`,`COURT_STAY`,`RETENTION_REQUEST` |
| `representation.status` `[v2]` | `FILED`,`UNDER_REVIEW`,`HOLD_ACTIVE`,`UPHELD`,`REJECTED`,`VACATED`,`WITHDRAWN` |
| `sr_outbox.status` `[v2]` | `PENDING`,`IN_FLIGHT`,`DELIVERED`,`FAILED`,`DEAD_LETTERED` |
| `vacancy_reservation.lifecycle_state` `[v2]` | `RESERVED`,`VACATED_ON_RELIEF`,`FILLED_ON_JOIN`,`RELEASED`,`EXPIRED` |
| `counselling_session.status` `[v2]` | `SCHEDULED`,`IN_PROGRESS`,`PAUSED`,`COMPLETED`,`CANCELLED` |
| `counselling_choice.choice_action` `[v2]` | `CHOSEN`,`PASSED`,`DECLINED`,`AUTO_PASS_TIMEOUT`,`ABSENT` |
| `quarter.retention_status` `[v2]` | `OCCUPIED`,`RETENTION_REQUESTED`,`RETENTION_APPROVED`,`VACATION_DUE`,`VACATED`,`OVERSTAY` |
| `order_acknowledgement.status` `[v2]` | `SERVED`,`ACKNOWLEDGED`,`DEEMED_SERVED`,`REFUSED` |
| `joining_distance_band` `[v2]` | `LOCAL`,`SHORT`,`MEDIUM`,`LONG`,`OUTSTATION` |
| `enforcement` | `HARD_BLOCK`,`SOFT_WARN`,`REQUIRE_OVERRIDE` |
| `repatriation_status` | `ACTIVE`,`EXTENSION_REQUESTED`,`EXTENDED`,`REPATRIATION_DUE`,`REPATRIATED` |
| `employment_status` (M01) | `ACTIVE`,`ON_LEAVE`,`SUSPENDED`,`TRANSFERRED`,`RETIRED`,`RESIGNED`,`DECEASED`,`TERMINATED` |

### 5.6 Data integrity rules
1. **One active SUBSTANTIVE transition per employee `[v2 reframed]`:** an employee may have only one `transfer_order` with `order_class=SUBSTANTIVE` in a non-terminal status (`PUBLISHED`→`JOINED`) at a time. `ADDITIONAL_CHARGE`, `DEPUTATION`, and `REPATRIATION` order classes may legitimately co-exist with a substantive posting and with each other; a second **substantive** issuance is `CONFLICT (409, TRJ_ACTIVE_TRANSFER_EXISTS)`.
2. **Relieving precondition:** a `relieving_order` may reach `ISSUED` only if its `clearance_checklist.status ∈ {CLEARED, CLEARED_WITH_DUES, CLEARED_WITH_DEEMED}` and `has_outstanding_dues` either false or `dues_recovery_ref` present — **or** a `deemed_relief` forced action is recorded (FR-TRJ-016).
3. **Joining precondition:** a `joining_report` may reach `JOINED_CONFIRMED` only if linked `transfer_order.status = IN_TRANSIT` — except `JOINING_WITHOUT_RELIEF` exceptions explicitly flagged.
4. **Date monotonicity:** `order_date ≤ served_on_date ≤ relieve_by_date`; `last_working_day ≥ served_on_date`; `joining_date ≥ last_working_day`; `repatriation_due_date ≥ start_date`; `vacate_by_date ≥ last_working_day`.
5. **Mutual symmetry & coupling `[v2 reframed]`:** a `MUTUAL` request requires a reciprocal request linking `mutual_counterpart_employee_id`; both orders are approved/published **atomically as a pair**, and additionally **relieving and joining are paired-progress guarded** — neither half may reach `JOINED` while the other is still pre-relief; asymmetric completion is `CONFLICT (409, TRJ_MUTUAL_PAIR_BLOCKED)`.
6. **Vacancy lifecycle `[v2]`:** a `vacancy_reservation` moves `RESERVED → VACATED_ON_RELIEF` (source relieved) `→ FILLED_ON_JOIN` (destination joined). Allotment requires a free reservation slot (`vacant_count > 0`) **and a transactional re-check at join time**; double-fill is `CONFLICT (409, TRJ_VACANCY_FULL)`.
7. **Maker ≠ checker & transferee exclusion:** enforced on every approval/clearance/forced-action write; the Authority exercising a forced action is recorded and may not be the transferee.
8. **SR posting completeness via outbox `[v2]`:** on each of order-publish, relieve, and join, exactly one corresponding `sr_outbox` row (idempotency-key unique) must reach `DELIVERED`; failures are retried, dead-lettered after `max_attempts`, and surfaced (FR-TRJ-012).
9. **No orphan clearance:** `clearance_items` exist only with a parent `clearance_checklist`; `total_items` = count of items; only **configured** departments generate items.
10. **SR/append-only immutability:** soft delete is never applied to records posted to SR, to `sr_outbox`, or to `counselling_choices`; such records are cancelled/revoked/compensated with reason, not deleted.
11. **Service continuity `[v2]`:** between `last_working_day` and `joining_date` the employee's pay is **continuous** (a single `PAY_CONTINUITY` signal, not stop+start); the SR `RELIEVED` and `JOINED` events carry `service_continuity_asserted=true` (no break in qualifying service) unless an explicit break (e.g. abandonment) is recorded.
12. **In-transit custody (no dual/zero posting) `[v2]`:** while `transfer_order.status=IN_TRANSIT`, exactly one `in_transit_custody_org_unit_id` is set; M01 `org_unit_id` remains source until join; headcount/budget counts the employee **once**, against the custodian; null or two custodians is `CONFLICT (409, TRJ_DUAL_POSTING_BLOCKED)`.
13. **Strength read-through `[v2]`:** `vacancy_positions.sanctioned_strength_cached`/`filled_count_cached` are caches with `strength_as_of`; they are never written by transactional flows, only by the reconciliation job; allotment decisions read live where possible and fall back to cache with a staleness flag.
14. **Joining-sequence integrity `[v2]`:** concurrent same-cadre/same-post joinings on a date receive distinct `joining_sequence_no` values ordered by `reported_date`/`joining_time` then deterministic `inter_se_tiebreak_key` (`service_no`); the tuple is unique per (`dest_org_unit_id`,`dest_designation_id`,`joining_date`) and exposed to M06.
15. **Proof-of-service precedence `[v2]`:** `relieve_by_date` enforcement and non-compliance escalation reference `served_on_date` (or `DEEMED_SERVED`), never `order_date`; an order may not enter `RELIEVING_IN_PROGRESS` without a `SERVED`/`DEEMED_SERVED`/`ACKNOWLEDGED` acknowledgement row.
16. **Hold supremacy `[v2]`:** an active `STAY_HOLD` (`representation.status=HOLD_ACTIVE`) blocks all forward transitions of the order until vacated; `hold_active=true` mirrors this on `transfer_orders`.
17. **Gapless numbering `[v2]`:** statutory numbers are issued via reserve-then-commit on `order_number_sequences` per (`scope`,`office`,`fiscal_year`); a reserved-but-uncommitted number is either committed or explicitly voided with an audit row; the gap-audit report must show zero unexplained gaps.

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

**vacancy_positions** `[v2 — read-through caches]`
| org_unit_id | designation_id | cadre | sanctioned_strength_cached | filled_count_cached | reserved_count | strength_source | strength_as_of | is_published |
|---|---|---|---|---|---|---|---|---|
| OU-DIST-B | DSG-TEACHER | TEACHING | 50 | 47 | 2 | M06 | 2026-04-01T06:00Z | true |
| OU-DIST-C | DSG-CLERK | MINISTERIAL | 20 | 20 | 0 | M06 | 2026-04-01T06:00Z | true |

**clearance_checklists**
| checklist_no | transfer_order_id | source_org_unit_id | status | total_items | cleared_items | deemed_items | has_outstanding_dues |
|---|---|---|---|---|---|---|---|
| NOD-2026-000789 | TO/2026/04/0456 | OU-HQ | CLEARED | 6 | 6 | 0 | false |
| NOD-2026-000790 | TO/2026/04/0457 | OU-DIST-A | CLEARED_WITH_DEEMED | 6 | 5 | 1 | true |

**clearance_items** `[v2 — SLA/deemed]`
| checklist_no | department_code | status | sla_due_at | escalation_tier | forced_action_type | dues_amount | dues_description |
|---|---|---|---|---|---|---|---|
| NOD-2026-000790 | IT | DEEMED_CLEARED | 2026-04-09T10:00Z | AUTHORITY | DEEMED_CLEARED | 0.00 | Officer non-responsive; Authority deemed |
| NOD-2026-000790 | ADVANCES | DUES_OUTSTANDING | 2026-04-09T10:00Z | DEPT_HEAD | NULL | 18500.00 | Festival advance balance |
| NOD-2026-000789 | LIBRARY | CLEARED | 2026-04-08T10:00Z | NONE | NULL | NULL | NULL |

**charge_handovers** `[v2 — under-protest]`
| transfer_order_id | phase | charge_type | handover_date | cash_imprest_amount | under_protest | status |
|---|---|---|---|---|---|---|
| TO/2026/04/0456 | HANDOVER_SOURCE | FULL | 2026-04-10 | 5000.00 | false | ACCEPTED |
| TO/2026/04/0457 | HANDOVER_SOURCE | FULL | 2026-04-13 | 0.00 | true | UNDER_PROTEST |
| TO/2026/04/0456 | ASSUMPTION_DEST | FULL | 2026-04-15 | 0.00 | false | ACCEPTED |

**relieving_orders** `[v2 — pay-continuity/deemed]`
| relieving_order_no | transfer_order_id | last_working_day | relieving_time | relieved | deemed_relief | pay_continuity_signalled | status |
|---|---|---|---|---|---|---|---|
| RO/2026/04/0456 | TO/2026/04/0456 | 2026-04-10 | AFTERNOON | true | false | true | RELIEVED |
| RO/2026/04/0457 | TO/2026/04/0457 | 2026-04-14 | AFTERNOON | true | true | true | DEEMED_RELIEVED |

**joining_reports** `[v2 — joining sequence]`
| joining_report_no | transfer_order_id | reported_date | joining_date | joining_sequence_no | inter_se_tiebreak_key | transit_days | service_continuity_asserted | status |
|---|---|---|---|---|---|---|---|---|
| JR/2026/04/0456 | TO/2026/04/0456 | 2026-04-15 | 2026-04-15 | 1 | EMP-000456 | 4 | true | JOINED_CONFIRMED |
| JR/2026/04/0457 | TO/2026/04/0457 | 2026-04-22 | 2026-04-22 | 2 | EMP-000457 | 7 | true | UNDER_VERIFICATION |

**deputation_records**
| transfer_order_id | borrowing_org_unit_id | start_date | initial_tenure_months | current_end_date | repatriation_status |
|---|---|---|---|---|---|
| TO/2026/05/0501 | OU-EXT-PSU1 | 2026-05-16 | 36 | 2029-05-15 | ACTIVE |

**transfer_representations** `[v2]`
| representation_no | transfer_order_id | representation_type | filed_by | authority_ref | status | decision |
|---|---|---|---|---|---|---|
| REP-2026-000045 | TO/2026/05/0501 | COURT_STAY | COURT | CAT/HYD/445/2026 | HOLD_ACTIVE | NULL |
| REP-2026-000046 | TO/2026/04/0457 | RETENTION_REQUEST | EMPLOYEE | — | REJECTED | DENY |

**sr_outbox** `[v2]`
| aggregate_type | target_system | event_type | idempotency_key | status | attempt_count |
|---|---|---|---|---|---|
| TRANSFER_ORDER | M12_SR | TRANSFER_ORDERED | M12_SR:TRANSFER_ORDERED:TRANSFER_ORDER:…0456:0 | DELIVERED | 1 |
| RELIEVING_ORDER | M10_PAYROLL | PAY_CONTINUITY | M10_PAYROLL:PAY_CONTINUITY:RELIEVING_ORDER:…0457:0 | PENDING | 0 |
| JOINING_REPORT | M01_MASTER | POSTING_UPDATE | M01_MASTER:POSTING_UPDATE:JOINING_REPORT:…0456:0 | DELIVERED | 2 |

**vacancy_reservations** `[v2]`
| vacancy_position_id | transfer_order_id | employee_id | lifecycle_state | vacated_at | filled_at |
|---|---|---|---|---|---|
| VP-DIST-B-01 | TO/2026/04/0457 | …a1 | VACATED_ON_RELIEF | 2026-04-14 | NULL |
| VP-DIST-C-01 | TO/2026/04/0456 | …c3 | FILLED_ON_JOIN | 2026-04-10 | 2026-04-15 |

**order_acknowledgements** `[v2]`
| transfer_order_id | served_on_date | delivery_channel | acknowledgement_status | acknowledged_at |
|---|---|---|---|---|
| TO/2026/04/0456 | 2026-04-03 | IN_APP | ACKNOWLEDGED | 2026-04-03T11:20Z |
| TO/2026/04/0457 | 2026-04-06 | REGISTERED_POST | DEEMED_SERVED | NULL |

**order_number_sequences** `[v2]`
| sequence_scope | office_org_unit_id | fiscal_year | next_value | prefix_template |
|---|---|---|---|---|
| TRANSFER_ORDER | OU-HQ | 2026 | 0502 | TO/{yyyy}/{mm}/{seq:04d} |
| RELIEVING_ORDER | OU-DIST-A | 2026 | 0458 | RO/{yyyy}/{mm}/{seq:04d} |

**counselling_sessions** `[v2]`
| session_code | drive_id | turn_order_method | status | total_candidates | completed_candidates |
|---|---|---|---|---|---|
| CNS-2026-ANNUAL-01 | DRIVE-2026-ANNUAL | SENIORITY | IN_PROGRESS | 120 | 47 |
| CNS-2026-ANNUAL-02 | DRIVE-2026-ANNUAL | SENIORITY | SCHEDULED | 118 | 0 |

**counselling_choices** `[v2 — immutable]`
| session_id | employee_id | turn_position | vacancy_position_id | choice_action | choice_made_at |
|---|---|---|---|---|---|
| CNS-…01 | …a1 | 12 | VP-DIST-B-01 | CHOSEN | 2026-03-20T10:14Z |
| CNS-…01 | …e5 | 13 | NULL | PASSED | 2026-03-20T10:17Z |

**quarter_allotments** `[v2]`
| employee_id | transfer_order_id | quarter_ref | retention_status | vacate_by_date | penal_rate_applies | licence_fee_recovery_ref |
|---|---|---|---|---|---|---|
| …a1 | TO/2026/04/0457 | QTR-A-204 | RETENTION_APPROVED | 2026-07-14 | false | NULL |
| …c3 | TO/2026/04/0456 | QTR-HQ-12 | OVERSTAY | 2026-05-15 | true | LFR-2026-0012 |

---

## 6. Functional Requirements

> Each FR uses: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table. **22 FRs** (v1: 14; +8 new in v2: FR-015–FR-022). `[v2]` flags additions.

---

### FR-TRJ-001 — Transfer Request Initiation (all types)
- **Module:** M05-TRJ · Initiation
- **Primary Role(s):** Employee (Transferee), Reporting Manager, HR Officer, HR Admin
- **User Story:** *As an employee or HR officer, I want to initiate a transfer request of any type so that mobility is captured in a structured, auditable way before an order is issued.*
- **Description:** Unified intake for all `transfer_type` values. Self-service employees raise `REQUEST`/`MUTUAL`/`COMPASSIONATE`; managers endorse for reports; HR Admin raises `ADMINISTRATIVE`; the system raises `PROMOTION_LINKED` from an M06 trigger. Captures source, requested destination, ground, supporting documents (M13), **sensitive-ground documents into the M13 sensitive access class** `[v2]`, priority category, and requested effective date. On submission it runs the eligibility/policy engine (FR-TRJ-002) and routes via the workflow engine. Uses the **canonical orthogonal taxonomy** (`transfer_type`/`ground`/`priority_category`, §5.5) `[v2]`.
- **Acceptance Criteria:**
  1. A request can be created in `DRAFT` and edited until `SUBMITTED`.
  2. `transfer_type` and `request_origin` are mandatory; field combinations validated (`MUTUAL` requires `mutual_counterpart_employee_id`).
  3. On submit, an eligibility check runs, result stored in `eligibility_result`; a `HARD_BLOCK` prevents submission with a clear reason.
  4. A unique `request_no` is generated on first submission.
  5. Documents for `MEDICAL`/`SPOUSE`/`COMPASSIONATE` grounds are mandatory and stored in M13 **with the sensitive access class; `sensitive_ground=true` set and access is logged** `[v2]`.
  6. Every create/submit writes `audit_log` and (on submit) creates a `workflow_instance`.
- **Business Rules:** Employee origin → self only; manager → direct reports; HR Admin → org scope. Promotion-linked requests are system-originated, read-only to employees. A transferee with an active **substantive** order is blocked (5.6-1, reframed) `[v2]`.
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | `transfer_requests` | Create/update primary record |
  | `employees` | Validate transferee, source org_unit |
  | `documents` | Supporting + **sensitive-class** evidence `[v2]` |
  | `workflow_instances` / `audit_log` | Routing + trail |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/requests` |
  | PATCH | `/api/v1/transfers/requests/{id}` |
  | POST | `/api/v1/transfers/requests/{id}/submit` |
  | GET | `/api/v1/transfers/requests?status=&type=&cursor=` |
- **UI Behavior Notes:** Wizard type selector → details → grounds & documents (sensitive uploads visibly marked restricted) → review. Inline eligibility banner (green/amber/red). Mutual flow shows counterpart search & reciprocal-link confirmation.
- **Edge Cases:** Counterpart not found/ineligible; duplicate active substantive request; sensitive-document upload failure (request stays DRAFT); promotion trigger for an employee already in transit.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferRequestWizard`, `TransferRequestController`, `TransferRequestService`, `EligibilityClient`, `SensitiveDocClient(M13)` `[v2]` |
  | Backend Flow | Validate role-scope → persist DRAFT → on submit call EligibilityService → if not HARD_BLOCK, generate `request_no`, set `SUBMITTED`, open workflow |
  | Data Operations | INSERT/UPDATE `transfer_requests`; INSERT `workflow_instances`,`audit_log` (txn); sensitive docs tagged restricted |
  | Validation | Type/origin matrix; mandatory sensitive-ground docs; date ≥ today; mutual symmetry |
  | Authorization | Self/team/org scope §3; sensitive-ground read gated + access-logged `[v2]` |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ELIGIBILITY_CHECK`; notify recommender |
  | Failure Handling | Eligibility upstream down → save DRAFT, block submit (`UPSTREAM_UNAVAILABLE`); sensitive doc fail rolls back submit |
  | Dependencies | FR-TRJ-002, M01, M13, workflow, M06 |
  | Test Guidance | Type/origin matrix; submit→workflow; active-substantive-order block; missing sensitive doc; sensitive access-log assertion `[v2]` |

---

### FR-TRJ-002 — Transfer Policy & Eligibility Validation
- **Module:** M05-TRJ · Policy & Eligibility
- **Primary Role(s):** System (engine), HR Admin, Transfer Authority
- **User Story:** *As the organisation, I want every transfer evaluated against tenure, ban-window, protected-category and sanctioned-strength policy so that no order violates statutory transfer rules.*
- **Description:** Rules engine evaluating a candidate request/order against `transfer_policy_rules` and `transfer_ban_periods`. Produces per-rule verdicts (`PASS`/`WARN`/`BLOCK`/`OVERRIDE_REQUIRED`) and an aggregate (most-restrictive wins). **Sanctioned-strength is read-through from M06/M01, not from a local store** `[v2]`. Overrides gated to Transfer Authority with mandatory justification, captured so that compliance metrics measure **un-overridden** violations `[v2]`.
- **Acceptance Criteria:**
  1. Engine returns itemised `rule_code`, verdict, message per evaluated rule.
  2. Minimum-tenure computed from current-post DOJ (last `JOINED` order or M01 posting date).
  3. Ban-window check is date-range and org-scope aware, honouring `exception_grounds`.
  4. Sanctioned-strength check blocks allotment when **read-through** `vacant_count = 0` `[v2]`.
  5. Overrides require Transfer Authority + justification, in `audit_log` and `eligibility_result`; the override audit is queryable for the "0% un-overridden violation" KPI `[v2]`.
  6. Engine idempotent and re-runnable; latest result cached.
- **Business Rules:** Protected `MEDICAL`/`SPOUSE`/`COMPASSIONATE` bypass bans only when listed in `exception_grounds`. Near-retirement requires override even for admin transfers. Cooling period triggers `SOFT_WARN`/`BLOCK` per config.
- **Data Model References:** `transfer_policy_rules`, `transfer_ban_periods`, `transfer_requests.eligibility_result`, `employees`, `vacancy_positions` (read-through), M06 strength service.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/eligibility/evaluate` |
  | POST | `/api/v1/transfers/requests/{id}/override` |
  | GET | `/api/v1/transfers/policy-rules` |
- **UI Behavior Notes:** Eligibility panel per-rule icon + message; override modal (Authority only) demands justification ≥ 20 chars; strength shown with freshness/`strength_as_of` badge `[v2]`.
- **Edge Cases:** Conflicting rules (most restrictive wins); no current-post date (fallback M01 DOJ); overlapping bans; rule effective-date boundaries; **strength service stale/unavailable → SOFT_WARN with staleness flag** `[v2]`.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `EligibilityService`, `PolicyRuleRepository`, `BanPeriodRepository`, `StrengthReadClient(M06)` `[v2]`, `OverrideController` |
  | Backend Flow | Load active rules in scope → evaluate each → aggregate → persist; strength via read-through |
  | Data Operations | SELECT rules/bans; read-through strength; UPDATE `eligibility_result`; INSERT `audit_log` on override |
  | Validation | Date math; scope precedence; override role check |
  | Authorization | Evaluate: any initiator; Override: Transfer Authority only |
  | State Changes & Side Effects | Sets `ELIGIBILITY_CHECK`; no SR event |
  | Failure Handling | Strength service down → degrade to `SOFT_WARN` + staleness notice (no silent block) `[v2]` |
  | Dependencies | FR-001/003/004, M01, M06 |
  | Test Guidance | Rule-matrix; date boundaries; override authz negatives; **un-overridden-violation metric** `[v2]`; strength-staleness path |

---

### FR-TRJ-003 — Counselling, Vacancy Publication & Preference Capture (batch)
- **Module:** M05-TRJ · Counselling & Preferences
- **Primary Role(s):** HR Admin, Employee, Transfer Authority
- **User Story:** *As HR, I want to publish vacancies and let eligible employees record ranked preferences so that batch allotment in a drive is transparent and seniority/merit-based.*
- **Description:** Publishes `vacancy_positions` (strength read-through; geo for Phase-2), opens a preference window, captures ranked preferences, and supports **batch** allotment by `SENIORITY`/`MERIT`/`PREFERENCE`/`MANUAL`. Allotment now writes `vacancy_reservations` (`RESERVED`) rather than mutating a local strength counter `[v2]`. For cadres requiring live allotment, use the interactive session model (FR-TRJ-019). Feeds FR-TRJ-005/004.
- **Acceptance Criteria:**
  1. Only published, in-scope vacancies are selectable.
  2. Employees add/reorder/delete preferences only within the open window.
  3. Preference ranks unique and contiguous per employee per drive.
  4. Allotment respects `allotment_method`; results create a `vacancy_reservation` (`RESERVED`) and mark `allotted=true` `[v2]`.
  5. Seniority score pulled from M06 at allotment time.
- **Business Rules:** Employee must pass FR-TRJ-002; reservations may not exceed read-through `vacant_count`; manual override by Authority logged. **`COUNSELLING` drives use FR-TRJ-019, not batch allotment** `[v2]`.
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `vacancy_reservations` `[v2]`, `employees`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives/{id}/vacancies` |
  | GET | `/api/v1/transfers/drives/{id}/vacancies?published=true` |
  | PUT | `/api/v1/transfers/drives/{id}/preferences` |
  | POST | `/api/v1/transfers/drives/{id}/allot` |
- **UI Behavior Notes:** Vacancy list (+ Phase-2 map); drag-to-rank builder with live eligibility; window countdown; allotment results grid.
- **Edge Cases:** Window closed mid-edit; vacancy reserved concurrently; seniority tie (deterministic tiebreak by `service_no`); duplicate preference.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `VacancyService`, `PreferenceService`, `BatchAllotmentEngine`, `ReservationService` `[v2]` |
  | Backend Flow | Publish → open window → capture prefs → batch allot with row-lock on `vacancy_reservations` |
  | Data Operations | INSERT/UPDATE `vacancy_positions`,`transfer_preferences`,`vacancy_reservations`; `SELECT … FOR UPDATE` on reservations |
  | Validation | Window dates; rank contiguity; published-only; reservation capacity |
  | Authorization | Vacancies/allot: HR Admin/Authority; prefs: employee (own) |
  | State Changes & Side Effects | Drive `OPEN`→`ALLOTTED`; reservations `RESERVED` |
  | Failure Handling | Concurrent allot → row lock + retry; over-capacity → `TRJ_VACANCY_FULL` |
  | Dependencies | FR-002/004/005/019, M06 |
  | Test Guidance | Reservation concurrency; rank integrity; window boundary |

---

### FR-TRJ-004 — Transfer Order Generation, Gapless Numbering, Approval & Publication
- **Module:** M05-TRJ · Approval, Numbering & Order
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want approved requests/allotments converted into a numbered, statutory transfer order and published so that source and destination offices act on a single authoritative document with a gapless statutory number.*
- **Description:** Generates a `transfer_order` (with `order_class` `[v2]`) from an approved request/allotment or direct admin action, routes the approval chain, assigns a **gapless statutory `order_no` via reserve-then-commit on `order_number_sequences`** (per-office/per-year) `[v2]`, renders a bilingual PDF (M13), publishes to both offices, sets `joining_distance_band`/`joining_time_days` (§16.4) and `in_transit_custody_org_unit_id` pre-set for transit `[v2]`, enqueues the **transfer SR event in `sr_outbox`** (FR-TRJ-012), and triggers proof-of-service (FR-TRJ-020). All `status` writes go through `TransferOrderStateService` `[v2]`.
- **Acceptance Criteria:**
  1. Order created only from an `APPROVED` request, an allotment reservation, or a direct admin action with prior eligibility pass.
  2. Approval enforces maker ≠ checker and transferee exclusion.
  3. On approval, a **gapless** sequential `order_no` is committed (reserve-then-commit; voided reservations audited); an immutable PDF is stored in M13 `[v2]`.
  4. Publication sets `PUBLISHED`, notifies transferee + both offices, enqueues SR posting (outbox) and clearance-checklist creation, and initiates service-of-order (FR-TRJ-020).
  5. Mutual orders approved/published atomically as a pair, recording `mutual_pair_order_id` `[v2]`.
  6. `order_class` is mandatory; `SUBSTANTIVE` re-checks 5.6-1 `[v2]`.
- **Business Rules:** Re-validate FR-TRJ-002 at approval; deputation/repatriation orders create `deputation_records` (FR-TRJ-011). Numbering is never "retry-on-collision" — it is reserve-then-commit (Risk 13) `[v2]`.
- **Data Model References:** `transfer_orders`, `transfer_requests`, `order_number_sequences` `[v2]`, `documents`, `sr_outbox` `[v2]`, `workflow_instances`, `clearance_checklists`, `deputation_records`, `vacancy_reservations`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders` |
  | POST | `/api/v1/transfers/orders/{id}/approve` |
  | POST | `/api/v1/transfers/orders/{id}/publish` |
  | GET | `/api/v1/transfers/orders/{id}` |
- **UI Behavior Notes:** Order composer with template preview + `order_class` selector + distance band; approval timeline; publish confirmation showing downstream effects (service, clearance, SR); PDF viewer.
- **Edge Cases:** Sequence row contention (row-lock, no gap); PDF render failure (order stays `APPROVED`, publish blocked, reserved number voided + audited); ban window now active; reservation expired meanwhile.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferOrderService`, `GaplessNumberGenerator` `[v2]`, `PdfRenderClient(M13)`, `SrOutboxWriter` `[v2]`, `TransferOrderStateService` `[v2]`, `ApprovalWorkflow` |
  | Backend Flow | Create draft → workflow approval → on final approve: re-eligibility, **reserve number → render PDF → commit number**, set APPROVED → publish: PUBLISHED, create clearance, enqueue SR outbox, start service |
  | Data Operations | INSERT/UPDATE `transfer_orders`; row-locked UPDATE `order_number_sequences`; INSERT `clearance_checklists`(+items),`sr_outbox`,`documents` ref,`audit_log` (single txn) |
  | Validation | Source status; eligibility re-check; maker≠checker; `order_class`; date rules |
  | Authorization | Generate: HR; Approve/Publish: Transfer Authority |
  | State Changes & Side Effects | Via `TransferOrderStateService`: `DRAFT`→`PENDING_APPROVAL`→`APPROVED`→`PUBLISHED`; SR outbox row; service initiated |
  | Failure Handling | SR enqueue is in-txn (always succeeds locally); PDF fail → void reserved number (audit) + block publish |
  | Dependencies | FR-002/003/006/011/012/020, M12, M13, workflow |
  | Test Guidance | **Gapless sequence under concurrency (no gap/dup)** `[v2]`; atomic mutual pair; publish side-effects |

---

### FR-TRJ-005 — Bulk Transfer Drive Management
- **Module:** M05-TRJ · Bulk Drives
- **Primary Role(s):** HR Admin, Transfer Authority
- **User Story:** *As HR Admin, I want to run an annual/seasonal transfer drive that batch-processes hundreds of transfers so that large cadre movements are efficient and consistent.*
- **Description:** Manages a `transfer_drive` lifecycle: scope/cadre, publish vacancies, open preference window (FR-TRJ-003) **or run a counselling session (FR-TRJ-019)** `[v2]`, allot, and **batch-generate orders** (FR-TRJ-004) with progress tracking, partial-failure isolation, and a dashboard. CSV import + bulk eligibility pre-screen. Vacancy reservations carry the lifecycle that prevents **cascading double-fill** at join time `[v2]`.
- **Acceptance Criteria:**
  1. Drive progresses `DRAFT`→`OPEN`→`COUNSELLING`→`ALLOTTED`→`ORDERS_ISSUED`→`CLOSED`.
  2. Bulk eligibility pre-screen flags blocked candidates before allotment.
  3. Batch order generation is resumable; a failed candidate quarantines, not aborts.
  4. Dashboard shows counts by stage and pendency.
  5. Closing requires all allotted candidates to have orders issued or be explicitly excluded.
  6. Reservation-to-order transition re-checks `vacant_count > 0` transactionally `[v2]`.
- **Business Rules:** Per-candidate eligibility (FR-002) and substantive-uniqueness (5.6-1); ban-window applies drive-wide unless exempted.
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `vacancy_reservations` `[v2]`, `transfer_requests`, `transfer_orders`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives` |
  | POST | `/api/v1/transfers/drives/{id}/screen` |
  | POST | `/api/v1/transfers/drives/{id}/generate-orders` |
  | GET | `/api/v1/transfers/drives/{id}/dashboard` |
- **UI Behavior Notes:** Drive console stage stepper; candidate grid with eligibility chips; batch progress bar; quarantine tab.
- **Edge Cases:** Partial allotment; CSV invalid service numbers; mid-drive ban activation; candidate withdrawal after allotment (reservation `RELEASED`).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `DriveService`, `BulkEligibilityScreener`, `BatchOrderGenerator(jobs)`, `ReservationService` `[v2]`, `DriveDashboard` |
  | Backend Flow | Create drive → import/screen → allot (FR-003/019) → enqueue batch order jobs (each re-checks reservation) → aggregate |
  | Data Operations | Bulk INSERT/UPDATE; idempotent job records; reservation transitions; `audit_log` per candidate |
  | Validation | Cadre/scope; CSV schema; per-candidate eligibility; reservation re-check |
  | Authorization | HR Admin / Transfer Authority |
  | State Changes & Side Effects | Drive + per-candidate order states (via `TransferOrderStateService`); SR outbox per order |
  | Failure Handling | Per-candidate try/catch → quarantine; resumable checkpoint |
  | Dependencies | FR-002/003/004/019 |
  | Test Guidance | Large-batch perf (<30min/1000); partial-failure isolation; resume; **cascading-vacancy re-check** `[v2]` |

---

### FR-TRJ-006 — Relieving: No-Dues / Clearance Checklist (with SLA escalation & deemed clearance)
- **Module:** M05-TRJ · Relieving — Clearance
- **Primary Role(s):** HR Officer (Source), Clearance Officers, Estate Officer, Employee
- **User Story:** *As a source HR officer, I want a departmental no-dues checklist auto-created on order publication, with SLAs and an escalation path, so that one non-responsive officer cannot block relieving indefinitely.*
- **Description:** On publication a `clearance_checklist` with `clearance_items` for each **configured** department of the source office is generated (offices with fewer departments generate fewer items) `[v2]`. Each item carries an `sla_due_at`; on breach it escalates `OFFICER → DEPT_HEAD → AUTHORITY` `[v2]`. The Authority may grant `DEEMED_CLEARED` with reason (FR-TRJ-016). Checklist reaches `CLEARED`, `CLEARED_WITH_DUES`, or `CLEARED_WITH_DEEMED` `[v2]`. Gates relieving (FR-TRJ-008).
- **Acceptance Criteria:**
  1. Checklist auto-created with one item per **configured** department.
  2. Only the assigned Clearance Officer (or HR override with reason) updates an item.
  3. Outstanding dues require `dues_amount`/description; checklist cannot reach `CLEARED` with open dues unless `CLEARED_WITH_DUES` (`dues_recovery_ref`).
  4. Each item has an SLA; breaches escalate through tiers with notifications `[v2]`.
  5. Authority `DEEMED_CLEARED` requires `forced_action_reason` + `forced_action_by`; counts toward `deemed_items` `[v2]`.
  6. Every change writes `audit_log`.
- **Business Rules:** Clearance Officer ≠ transferee; dues link to M10 recovery; `WAIVED`/`DEEMED_CLEARED` require Authority approval (audited).
- **Data Model References:** `clearance_checklists`, `clearance_items`, `transfer_orders`, `documents`, `notifications`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/orders/{id}/clearance` |
  | PATCH | `/api/v1/clearance/items/{id}` |
  | POST | `/api/v1/clearance/items/{id}/escalate` `[v2]` |
  | POST | `/api/v1/clearance/items/{id}/deem-cleared` `[v2]` |
  | POST | `/api/v1/clearance/{checklistId}/finalize` |
- **UI Behavior Notes:** Clearance board per-department cards with **SLA countdown + escalation badge**; officer action drawer; Authority "deem cleared" action with mandatory reason; employee tracker.
- **Edge Cases:** Department has no officer (auto-escalate to dept-head queue); dues disputed; officer on leave (delegate or auto-escalate); office with zero configured departments (checklist auto-`CLEARED`).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ClearanceService`, `ClearanceItemController`, `SlaEscalationJob` `[v2]`, `DeemedClearanceController` `[v2]`, `DuesRecoveryClient(M10)`, `ClearanceBoard` |
  | Backend Flow | On publish create items from **configured** dept set → SLA timers → escalate on breach → officers/Authority update → finalize computes status |
  | Data Operations | INSERT checklist+items; UPDATE items (status/escalation/forced-action); UPDATE counters; `audit_log` |
  | Validation | Officer authz; dues required when outstanding; Authority for deemed/waive |
  | Authorization | Per-item officer; HR override logged; deemed → Authority |
  | State Changes & Side Effects | Checklist `OPEN`→`IN_PROGRESS`→`CLEARED`/`CLEARED_WITH_DUES`/`CLEARED_WITH_DEEMED`; gate FR-008; M10 recovery signal |
  | Failure Handling | M10 down → `CLEARED_WITH_DUES` with pending ref, retry via outbox |
  | Dependencies | FR-004/008/016, M10, M13 |
  | Test Guidance | Per-dept authz; SLA escalation timing; **deemed-clearance audit**; zero-department office; counter integrity |

---

### FR-TRJ-007 — Charge Handover at Source (with handover-under-protest)
- **Module:** M05-TRJ · Relieving — Charge Handover
- **Primary Role(s):** Employee (relinquishing), Charge Receiving Officer, HR Officer (Source), Transfer Authority
- **User Story:** *As a relieving employee, I want to formally hand over charge — and where a dispute would trap me, hand over under protest within a time-bound resolution — so accountability transfers without indefinite blocking.*
- **Description:** Records a `charge_handover` (phase `HANDOVER_SOURCE`) of assets, pending files, cash/imprest, and a note (M13). Receiving officer/successor (or **link officer / custody-of-office where no successor exists** `[v2]`) accepts or disputes. A dispute starts a **time-bound resolution clock (`dispute_sla_due_at`)**; on breach, the Authority may certify **handover-under-protest** (FR-TRJ-016), unblocking relieving while preserving the dispute for separate resolution `[v2]`.
- **Acceptance Criteria:**
  1. Handover captures asset inventory, cash/imprest, pending files, note document.
  2. Receiving officer can `ACCEPT` or `DISPUTE` with remarks.
  3. A dispute does **not** block relieving indefinitely: after `dispute_sla_due_at`, Authority `HANDOVER_UNDER_PROTEST` is available with reason `[v2]`.
  4. Charge type (`FULL`/`ADDITIONAL`/`CURRENT_DUTIES`) recorded; `ADDITIONAL_CHARGE` orders never block a substantive relieving `[v2]`.
- **Business Rules:** Relinquisher ≠ acceptor; cash/imprest mismatch flags an accounts clearance dependency (FR-006); under-protest preserves the dispute record and notifies Accounts/Authority.
- **Data Model References:** `charge_handovers`, `transfer_orders`, `employees`, `documents`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/charge-handover` |
  | POST | `/api/v1/charge-handovers/{id}/accept` |
  | POST | `/api/v1/charge-handovers/{id}/dispute` |
  | POST | `/api/v1/charge-handovers/{id}/under-protest` `[v2]` |
- **UI Behavior Notes:** Handover form (asset table + cash + note); acceptor review (accept/dispute); dispute shows resolution countdown; Authority under-protest action with reason.
- **Edge Cases:** No successor (link officer / custody-of-office); partial asset return; additional-charge relinquishment; dispute unresolved past SLA.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ChargeHandoverService`, `ChargeController`, `DisputeSlaJob` `[v2]`, `UnderProtestController` `[v2]`, `ChargeForm` |
  | Backend Flow | Create handover → notify acceptor → accept/dispute → dispute SLA clock → Authority under-protest if breached → gate relieving |
  | Data Operations | INSERT/UPDATE `charge_handovers` (status/under_protest/forced-action); `audit_log`; document ref |
  | Validation | Relinquisher≠acceptor; required fields; phase=HANDOVER_SOURCE |
  | Authorization | Employee create; acceptor accept/dispute; Authority under-protest |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ACCEPTED`/`DISPUTED`→`UNDER_PROTEST`; precondition for FR-008 (satisfiable by under-protest) |
  | Failure Handling | Dispute loop bounded by SLA; document upload retry |
  | Dependencies | FR-006/008/010/016 |
  | Test Guidance | Accept/dispute/under-protest paths; relinquisher-exclusion; no-successor handover; SLA breach |

---

### FR-TRJ-008 — Relieving Order, Last Working Day & Pay-Continuity Signal
- **Module:** M05-TRJ · Relieving — Order & LWD
- **Primary Role(s):** HR Officer (Source), Transfer Authority, Payroll Officer
- **User Story:** *As source HR, I want to issue a relieving order setting the last working day once clearance and handover are complete (or deemed) so that the employee is formally relieved and pay is continued — not stopped — across the handoff.*
- **Description:** Issues a `relieving_order` once clearance (FR-006) and handover (FR-007) preconditions are met **or a `deemed_relief` Authority action is recorded** (FR-016) `[v2]`. Sets `last_working_day`, relieving time (FN/AN — load-bearing, §16.9), generates the relieving order PDF (M13), enqueues a **`PAY_CONTINUITY` + `LPC_REQUEST` signal to M10 via `sr_outbox`** (not a pay-stop) `[v2]`, sets `in_transit_custody_org_unit_id` and transitions the order `RELIEVED`→`IN_TRANSIT` (via `TransferOrderStateService`), marks the `vacancy_reservation` `VACATED_ON_RELIEF` `[v2]`, enforces **mutual paired-progress** `[v2]`, and enqueues the **relieving SR event asserting no break in service** (FR-012/015).
- **Acceptance Criteria:**
  1. Relieving order issued only when clearance ∈ {CLEARED, CLEARED_WITH_DUES, CLEARED_WITH_DEEMED} and (if required) handover ACCEPTED/UNDER_PROTEST — **or** `deemed_relief` recorded `[v2]`.
  2. `last_working_day ≥ served_on_date` and ≤ `relieve_by_date` (late relief flagged, not hard-blocked); enforcement uses **served date** `[v2]`.
  3. On issue: PDF stored, **pay-continuity + LPC** enqueued to M10, SR RELIEVED event enqueued (`service_continuity_asserted=true`), order → `IN_TRANSIT`, custody set, reservation vacated `[v2]`.
  4. Unique gapless `relieving_order_no` generated.
  5. For `MUTUAL`, the counterpart's progress is checked; asymmetric completion blocked (5.6-5) `[v2]`.
- **Business Rules:** Pay is continued (continuity signal), LPC requested exactly once; relieving beyond `relieve_by_date` requires remark; deemed-relief requires Authority + reason.
- **Data Model References:** `relieving_orders`, `clearance_checklists`, `charge_handovers`, `transfer_orders`, `vacancy_reservations`, `documents`, `sr_outbox`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/relieving-order` |
  | POST | `/api/v1/relieving-orders/{id}/issue` |
  | POST | `/api/v1/relieving-orders/{id}/deemed-relieve` `[v2]` |
  | GET | `/api/v1/relieving-orders/{id}` |
- **UI Behavior Notes:** Relieving panel with clearance/handover readiness gauges; LWD picker; issue disabled until preconditions met or deemed-relief invoked; confirmation lists downstream signals (continuity, LPC, SR, custody).
- **Edge Cases:** Relieving after deadline; pay-continuity signal failure (outbox retry); employee absent on planned LWD; clearance reopened after issue (revoke FR-013); mutual counterpart stalled.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `RelievingService`, `TransferOrderStateService`, `SrOutboxWriter`, `CustodyAssigner` `[v2]`, `MutualPairGuard` `[v2]`, `RelievingPanel` |
  | Backend Flow | Verify preconditions (or deemed) → create relieving_order → on issue: number, PDF, enqueue M10 PAY_CONTINUITY+LPC, enqueue SR RELIEVED, set custody, vacate reservation, transition IN_TRANSIT |
  | Data Operations | INSERT/UPDATE `relieving_orders`,`transfer_orders`,`vacancy_reservations`; INSERT `sr_outbox`,document ref,`audit_log` (txn) |
  | Validation | Precondition/deemed gate; date rules (served-date based); single LPC; mutual guard |
  | Authorization | HR Source issue; Authority co-sign/deemed-relief |
  | State Changes & Side Effects | Relieving `PENDING_CLEARANCE`→`ISSUED`/`DEEMED_RELIEVED`; order `RELIEVING_IN_PROGRESS`→`RELIEVED`→`IN_TRANSIT`; custody set; M10 continuity + SR via outbox |
  | Failure Handling | M10/SR via outbox retry; PDF fail blocks issue (number voided + audited) |
  | Dependencies | FR-006/007/009/012/015/016, M10, M12, M13 |
  | Test Guidance | Precondition + deemed-relief gating; **pay-continuity (not stop) signal**; custody set; reservation vacated; mutual coupling; deadline flag on served date |

---

### FR-TRJ-009 — Transfer-in-Transit & Joining-Time Management (contracted calendar)
- **Module:** M05-TRJ · Transit Management
- **Primary Role(s):** HR Officer (Source/Destination), Employee, Auditor
- **User Story:** *As HR, I want the period between relieving and joining tracked with admissible joining time computed against a proper regional working-day calendar so transit is visible, paid, controlled, and not abused.*
- **Description:** Maintains `IN_TRANSIT` between LWD and joining. Computes admissible **joining time by distance band** (§16.4) using the **contracted Platform Calendar Service (regional-calendar aware)** — the v1 silent "Sat/Sun + national holidays" fallback is removed; an unavailable calendar raises `UPSTREAM_UNAVAILABLE` and the computation is deferred, not silently wrong `[v2]`. Monitors elapsed transit, flags overdue, exposes an in-transit register, and shows the **in-transit custodian** for each employee `[v2]`.
- **Acceptance Criteria:**
  1. Orders display `IN_TRANSIT` with day counter, admissible-by date, and **custodian office** `[v2]`.
  2. Joining-time computation uses the contracted calendar service and `joining_distance_band`; no silent default `[v2]`.
  3. Transit exceeding admissible time raises overdue flag + notification to both offices.
  4. In-transit register lists employees with source/destination, custodian, and elapsed days.
- **Business Rules:** Transit is bounded by policy and **paid** (FR-015); extension of joining time requires Authority approval (recorded); unjoined beyond grace triggers `LATE_JOINING_REVIEW` (FR-018).
- **Data Model References:** `transfer_orders` (transit/custody), `relieving_orders`, `joining_reports`, Platform Calendar Service (contracted).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/in-transit?org_unit=&cursor=` |
  | POST | `/api/v1/transfers/orders/{id}/extend-joining-time` |
- **UI Behavior Notes:** In-transit register with elapsed/limit bars; custodian column; overdue rows highlighted; extension modal (Authority); calendar-unavailable banner if computation deferred.
- **Edge Cases:** Cross-region calendar differences (resolved by contracted service); employee joins early; never joins (→ FR-018); **calendar service down (deferred compute, explicit error, not silent default)** `[v2]`.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransitService`, `JoiningTimeCalculator(CalendarClient)` `[v2]`, `InTransitRegister` |
  | Backend Flow | Derive admissible-by from LWD + distance band + calendar service → scheduled job flags overdue → register query |
  | Data Operations | READ orders/relieving; UPDATE flags; `audit_log` on extension |
  | Validation | Calendar correctness (contracted); extension authz |
  | Authorization | Register: HR/Auditor; extension: Transfer Authority |
  | State Changes & Side Effects | Order remains `IN_TRANSIT`; overdue notification; possible `LATE_JOINING_REVIEW` |
  | Failure Handling | **Calendar service missing → defer compute + `UPSTREAM_UNAVAILABLE` (no silent Sat/Sun fallback)** `[v2]` |
  | Dependencies | FR-008/010/015/018, Platform Calendar Service |
  | Test Guidance | Distance-band joining math; regional calendar; overdue scheduling; calendar-down deferral |

---

### FR-TRJ-010 — Joining Report & Charge Assumption at Destination
- **Module:** M05-TRJ · Joining
- **Primary Role(s):** Employee (Transferee), HR Officer (Destination), Charge Receiving Officer, Payroll Officer
- **User Story:** *As a transferred employee, I want to submit a joining report and assume charge so my joining date is confirmed, pay continuity resumes at destination, and my posting is updated.*
- **Description:** Transferee submits a `joining_report`; destination HR verifies, records charge assumption (`ASSUMPTION_DEST`), confirms the statutory `joining_date`, computes transit vs admissible, **assigns the inter-se joining sequence (FR-021)** `[v2]`, **re-checks the vacancy reservation transactionally and marks it `FILLED_ON_JOIN`** `[v2]`, enqueues a **`PAY_CONTINUITY` resume + `POSTING_UPDATE` to M01 via `sr_outbox`** `[v2]`, clears `in_transit_custody` (M01 becomes authoritative), enforces **mutual paired-progress** `[v2]`, and enqueues the **joining SR event asserting no break in service** (FR-012/015). Late joining routes to FR-018.
- **Acceptance Criteria:**
  1. Joining report submitted only against an `IN_TRANSIT` order (exception: `JOINING_WITHOUT_RELIEF` flagged).
  2. Destination HR verification confirms `joining_date`; transit + admissibility computed.
  3. On confirmation: charge assumption recorded, **reservation re-check + FILLED_ON_JOIN**, pay-continuity resumed, M01 posting updated, **joining sequence assigned**, SR JOINED enqueued (continuity asserted), order → `JOINED` `[v2]`.
  4. Late joining (beyond admissible + grace) routes to `LATE_JOINING_REVIEW` (FR-018) before confirmation.
  5. Unique gapless `joining_report_no` generated; **mutual counterpart coupling enforced** `[v2]`.
- **Business Rules:** `joining_date ≥ LWD`; M01 update is the single authoritative posting change; deputation joining updates `deputation_records` start (FR-011); reservation double-fill blocked (`TRJ_VACANCY_FULL`).
- **Data Model References:** `joining_reports`, `charge_handovers`, `transfer_orders`, `vacancy_reservations`, `employees`(M01), `sr_outbox`, `deputation_records`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/joining-report` |
  | POST | `/api/v1/joining-reports/{id}/verify` |
  | POST | `/api/v1/joining-reports/{id}/confirm` |
- **UI Behavior Notes:** Joining wizard (report → charge assumption → confirm); HR verification with transit summary + **joining-sequence assignment**; late-joining banner with review action.
- **Edge Cases:** Reported but charge not available; joining before relieving processed; date disputes; promotion-linked designation change; **reservation filled by another joiner (concurrency)** `[v2]`; mutual counterpart not yet relieved.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `JoiningService`, `TransferOrderStateService`, `EmployeeMasterClient(M01)`, `SrOutboxWriter`, `JoiningSequencer` `[v2]`, `ReservationService` `[v2]`, `MutualPairGuard`, `JoiningWizard` |
  | Backend Flow | Submit → HR verify → confirm: record assumption, re-check+fill reservation, set joining_date, assign sequence, enqueue M01 posting + M10 continuity-resume, enqueue SR JOINED, clear custody, order JOINED |
  | Data Operations | INSERT/UPDATE `joining_reports`,`charge_handovers`,`transfer_orders`,`vacancy_reservations`; INSERT `sr_outbox`,`audit_log`; M01 update via outbox |
  | Validation | Order IN_TRANSIT; date ≥ LWD; late-joining gate; reservation re-check; mutual guard |
  | Authorization | Employee submit; HR Dest verify/confirm |
  | State Changes & Side Effects | Report `SUBMITTED`→`UNDER_VERIFICATION`→`JOINED_CONFIRMED`; order `IN_TRANSIT`→`JOINED`; M01 + M10 + SR via outbox |
  | Failure Handling | M01/M10/SR via outbox retry; reservation conflict → `TRJ_VACANCY_FULL` |
  | Dependencies | FR-008/009/011/012/015/018/021, M01, M10, M12 |
  | Test Guidance | Confirm side-effects; **reservation re-check at join**; joining-sequence integrity; pay-continuity resume; mutual coupling |

---

### FR-TRJ-011 — Deputation Terms & Repatriation Management
- **Module:** M05-TRJ · Deputation & Repatriation
- **Primary Role(s):** HR Admin, Transfer Authority, Employee
- **User Story:** *As HR, I want to manage deputation tenure, terms, extensions and repatriation so lent employees return on time and terms are tracked.*
- **Description:** For `DEPUTATION` orders (`order_class=DEPUTATION`), maintains a `deputation_record` (borrowing/lending units, terms, tenure, extensions with caps, repatriation due/status). Generates repatriation alerts and processes repatriation as a reverse transfer with `order_class=REPATRIATION` (reusing FR-004/006/008/010) — which **legitimately co-exists** with the original deputation during overlap (5.6-1 reframed) `[v2]`.
- **Acceptance Criteria:**
  1. Deputation record auto-created when a deputation order is published.
  2. Extension requests validated against `max_tenure_months`; over-cap blocked (`TRJ_DEPUTATION_CAP_EXCEEDED`).
  3. Repatriation-due alerts raised ahead of `current_end_date`.
  4. Repatriation initiates a reverse `REPATRIATION`-class order to the lending unit `[v2]`.
- **Business Rules:** Terms in `deputation_terms`; external borrowing units are `org_units` type `EXTERNAL`; max tenure enforced by policy (FR-002).
- **Data Model References:** `deputation_records`, `transfer_orders` (order_class), `org_units`, `employees`.
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
  | Components | `DeputationService`, `RepatriationOrchestrator`, `DeputationRegister` |
  | Backend Flow | On deputation publish create record → manage extensions (cap check) → on repatriate create `REPATRIATION`-class reverse order |
  | Data Operations | INSERT/UPDATE `deputation_records`; create reverse `transfer_orders`; `audit_log` |
  | Validation | Tenure cap; date monotonicity; role authz |
  | Authorization | HR Admin/Authority manage; employee view |
  | State Changes & Side Effects | `ACTIVE`→`EXTENSION_REQUESTED`→`EXTENDED`/`REPATRIATION_DUE`→`REPATRIATED`; reverse order |
  | Failure Handling | Reverse-order failure isolated; alerts retried |
  | Dependencies | FR-002/004/008/010 |
  | Test Guidance | Cap enforcement; repatriation reverse-flow; order_class co-existence; alert timing |

---

### FR-TRJ-012 — Service Register (SR) Event Posting via Transactional Outbox
- **Module:** M05-TRJ · SR Posting
- **Primary Role(s):** System, SR Custodian/Registrar
- **User Story:** *As the SR custodian, I want every transfer, relieving and joining event reliably posted to the Digital SR so the statutory service record is complete, accurate, and asserts continuous service.*
- **Description:** Posts append-only `service_register_events` to M12 at three checkpoints (TRANSFER_ORDERED, RELIEVED, JOINED) using the **fully field-specified `sr_outbox`** (§5.2.15) `[v2]`. Idempotency keys follow the documented formula; retry uses exponential backoff with `max_attempts`; exhausted rows are `DEAD_LETTERED` and surfaced for the Custodian. The same outbox carries M10 (`PAY_CONTINUITY`,`ENTITLEMENT`,`LPC_REQUEST`,`LICENCE_FEE_RECOVERY`) and M01 (`POSTING_UPDATE`) signals `[v2]`. RELIEVED/JOINED payloads carry `service_continuity_asserted` `[v2]`.
- **Acceptance Criteria:**
  1. Exactly one SR event per checkpoint per order (idempotent via key formula).
  2. Failed postings retried; exhausted → `DEAD_LETTERED` + surfaced to Custodian.
  3. SR payload includes order_no, source/destination, dates, event type, **continuity assertion**, references.
  4. A reconciliation report lists orders with missing/failed SR events and outbox dead-letters.
- **Business Rules:** SR events immutable; corrections are new `COMPENSATING` events; outbox writes share the local DB transaction; failures never block local state.
- **Data Model References:** `sr_outbox` `[v2]`, `service_register_events`(M12), `transfer_orders`, `relieving_orders`, `joining_reports`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/sr/events` (M12 write) |
  | GET | `/api/v1/transfers/sr-reconciliation?status=pending` |
  | POST | `/api/v1/transfers/sr-outbox/{id}/retry` `[v2]` |
- **UI Behavior Notes:** SR reconciliation console listing `PENDING`/`FAILED`/`DEAD_LETTERED` outbox rows with retry; per-order SR timeline.
- **Edge Cases:** M12 down at checkpoint; duplicate retry (idempotency key dedupes); partial payload; clock skew; dead-letter after `max_attempts`.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `SrOutboxWriter`, `OutboxPublisherJob` `[v2]`, `SrReconciliationService`, `M12Client`, `M10Client`, `M01Client` |
  | Backend Flow | On checkpoint INSERT outbox row (same txn) → publisher dispatches by `target_system` with idempotency key → mark `DELIVERED`/`FAILED` → backoff → `DEAD_LETTERED` |
  | Data Operations | INSERT `sr_outbox`; UPDATE status/attempt/next_attempt; READ for reconciliation; `audit_log` |
  | Validation | Idempotency-key uniqueness (formula); payload schema |
  | Authorization | System publish; Custodian retry/reconcile |
  | State Changes & Side Effects | Outbox status lifecycle; M12/M10/M01 effects |
  | Failure Handling | Exponential backoff; dead-letter + alert; 180-day retention |
  | Dependencies | FR-004/008/010/015, M12, M10, M01 |
  | Test Guidance | **Idempotency under retry**; outbox delivery guarantee; dead-letter + reconciliation; continuity assertion in payload |

---

### FR-TRJ-013 — Order Amendment, Cancellation & Post-Relief Revocation
- **Module:** M05-TRJ · Amendment / Cancellation
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want to amend, cancel or revoke a transfer order at the correct lifecycle stage so corrections and recalls are handled with full audit and statutory compensation.*
- **Description:** Three stage-aware corrective actions: **amend** (pre-relief — supersede with `revision_no`++, new gapless PDF, compensating SR), **cancel** (pre-relief — close order, reverse clearance/handover/reservation, notify), **revoke** (post-relief/join — recall requiring compensating SR, M01 posting reversal, **pay-continuity reversal/reconciliation** to M10) `[v2]`. All require Authority approval + justification; all `status` writes via `TransferOrderStateService` `[v2]`.
- **Acceptance Criteria:**
  1. Amendment only pre-relief; new revision via `superseded_by_order_id`; reserved number committed/voided gaplessly `[v2]`.
  2. Cancellation pre-relief; reverses clearance/handover and **releases vacancy reservation** `[v2]`; notifies stakeholders.
  3. Revocation (post-relief/join) enqueues compensating SR + **pay-continuity reconciliation** signal to M10 and M01 reversal `[v2]`.
  4. Every action requires justification + Authority approval; written to `audit_log`.
- **Business Rules:** SR-posted records never hard-deleted (5.6-10); revocation after joining reverses M01 posting via M01 API with reason; active `STAY_HOLD` must be vacated or the action recorded as hold-driven `[v2]`.
- **Data Model References:** `transfer_orders`, `clearance_checklists`, `charge_handovers`, `joining_reports`, `vacancy_reservations`, `sr_outbox`, `employees`(M01).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/amend` |
  | POST | `/api/v1/transfers/orders/{id}/cancel` |
  | POST | `/api/v1/transfers/orders/{id}/revoke` |
- **UI Behavior Notes:** Stage-aware action menu (only valid actions enabled); justification-required modal; impact preview listing reversals (clearance, reservation, SR, M01, pay).
- **Edge Cases:** Amend after clearance started; cancel after partial clearance; revoke after pay paid (reconciliation); concurrent amend + relieving; active hold.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `OrderCorrectionService`, `ReversalOrchestrator`, `TransferOrderStateService`, `CorrectionModal` |
  | Backend Flow | Determine allowed action by status → workflow approve → execute (supersede/reverse) → compensating SR + signals via outbox |
  | Data Operations | UPDATE orders (revision/status); reverse dependents incl. reservations; INSERT compensating `sr_outbox`; `audit_log` |
  | Validation | Stage rules; justification mandatory; authz; hold check |
  | Authorization | Transfer Authority approves |
  | State Changes & Side Effects | `AMENDED`/`CANCELLED`/`REVOKED`; SR compensation; M10/M01 reversal |
  | Failure Handling | Reversal partial-failure → quarantine + alert; idempotent compensation |
  | Dependencies | FR-004/006/008/010/012/015, M01, M10, M12 |
  | Test Guidance | Stage-gating matrix; reversal completeness; reservation release; SR compensation; pay reconciliation |

---

### FR-TRJ-014 — Geographic Mapping & Transfer Analytics Dashboard (Phase-2 map)
- **Module:** M05-TRJ · Mapping & Analytics
- **Primary Role(s):** HR Admin, Transfer Authority, Auditor, Reporting Manager
- **User Story:** *As a Transfer Authority, I want analytics on transfers, pendency, clearance, transit, custody and SR health so I can monitor mobility health and act on bottlenecks.*
- **Description:** Dashboard with analytics: transfers by type/class/stage, relieving pendency, clearance bottlenecks (incl. SLA breaches/deemed-clearances), in-transit/overdue counts **with custody integrity checks**, SR/outbox health, drive progress, deputation tenure, **representation/stay-hold load, abandonment counts, quarter overstays** `[v2]`. The **geographic map is re-prioritised to Phase-2** (Risk 18); analytics ship in baseline `[v2]`. Feeds M14.
- **Acceptance Criteria:**
  1. KPI cards show counts for each lifecycle stage, overdue/pending, **custody-integrity exceptions, un-overridden violations, dead-letters** `[v2]`.
  2. Clearance bottleneck view ranks departments by average clearance time and SLA-breach rate.
  3. All figures respect row-level org scope; Auditor sees all read-only.
  4. Data exportable (CSV/PDF) with pagination.
  5. **Map view delivered as a Phase-2 enhancement** behind a feature flag `[v2]`.
- **Business Rules:** Aggregations read-only; no PII beyond role scope; numbers reconcile with operational records.
- **Data Model References:** all M05 entities (read), incl. `transfer_representations`, `quarter_allotments`, `sr_outbox`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/analytics/summary` |
  | GET | `/api/v1/transfers/analytics/clearance-bottlenecks` |
  | GET | `/api/v1/transfers/map/vacancies?cadre=&office=` *(Phase-2)* |
- **UI Behavior Notes:** KPI grid + trend charts + bottleneck table (baseline); map panel (Phase-2 flag); drill-down to filtered lists; export.
- **Edge Cases:** Missing geo-coordinates (list-only); large result sets (server aggregation + pagination); timezone in trend buckets.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `AnalyticsService`, `MapDataService` *(Phase-2)*, `TransferDashboard` |
  | Backend Flow | Pre-aggregated org-scoped queries → short-TTL cache → serve KPI/bottleneck (map Phase-2) |
  | Data Operations | Read-only aggregate SELECTs (indexed); optional materialized views |
  | Validation | Filter params; scope enforcement |
  | Authorization | Scoped read; Auditor global read |
  | State Changes & Side Effects | None |
  | Failure Handling | Cache miss/timeout → degrade to live query with limit |
  | Dependencies | All M05 entities; M14 |
  | Test Guidance | Aggregation correctness; scope isolation; export integrity; Phase-2 flag gating |

---

### FR-TRJ-015 — Service Continuity, Joining-Time Pay & In-Transit Custody `[v2 — new; Critical]`
- **Module:** M05-TRJ · Service Continuity & Custody
- **Primary Role(s):** HR Officer (Source/Destination), Transfer Authority, Payroll Officer, SR Custodian
- **User Story:** *As the organisation, I want the transit/joining-time period treated as continuous paid service owned by a defined custodian office, so employees are never underpaid and headcount is never dual- or zero-counted.*
- **Description:** Replaces the v1 pay-stop/pay-start model. On relieving, M10 receives a single **`PAY_CONTINUITY`** signal (continue pay across the handoff) plus an **`ENTITLEMENT`** signal keyed on `transfer_type`+`ground` (own-request vs administrative differ in TTA, transfer grant, joining-time-pay admissibility) `[v2]`. The transit period is **paid duty/leave** (`joining_time_pay_admissible`). An explicit **in-transit custodian** (`in_transit_custody_org_unit_id`) owns pay/attendance/leave/headcount/discipline during `IN_TRANSIT`, with an integrity rule preventing dual/zero posting (5.6-12). SR RELIEVED/JOINED events assert **no break in qualifying service** (5.6-11).
- **Acceptance Criteria:**
  1. Relieving enqueues a `PAY_CONTINUITY` (not pay-stop) signal and an `ENTITLEMENT` signal keyed on `transfer_type`+`ground`.
  2. `joining_time_pay_admissible` is computed by policy (`JOINING_TIME_PAY` rule) and stored on the order.
  3. While `IN_TRANSIT`, exactly one custodian office is set; dual/null custody is blocked (`TRJ_DUAL_POSTING_BLOCKED`).
  4. SR RELIEVED and JOINED events carry `service_continuity_asserted=true` unless an explicit break (abandonment) is recorded.
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
- **Edge Cases:** Custodian office dissolved mid-transit (re-assign + audit); own-request with no joining-time pay; abandonment breaking continuity; entitlement service (M10) unavailable (outbox retry).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ServiceContinuityService`, `CustodyAssigner`, `EntitlementSignalClient(M10)`, `SrOutboxWriter` |
  | Backend Flow | On relieve: compute `joining_time_pay_admissible`, set custodian, enqueue `PAY_CONTINUITY`+`ENTITLEMENT`; on join: resume continuity, clear custody (M01 authoritative) |
  | Data Operations | UPDATE `transfer_orders`,`relieving_orders`,`joining_reports`; INSERT `sr_outbox`,`audit_log` |
  | Validation | Single-custodian invariant (5.6-12); continuity assertion (5.6-11); entitlement keying |
  | Authorization | HR set; Authority override custodian |
  | State Changes & Side Effects | Continuity + custody fields; M10 entitlement/continuity; SR continuity assertion |
  | Failure Handling | M10 via outbox retry; dual/null custody → `TRJ_DUAL_POSTING_BLOCKED` |
  | Dependencies | FR-008/010/012/018, M10, M12 |
  | Test Guidance | **Pay-continuity (no gap) end-to-end**; **single-custodian (no dual/zero posting)**; entitlement-by-type; continuity assertion in SR |

---

### FR-TRJ-016 — Authority Forced-Action Powers (deemed-clearance, handover-under-protest, deemed-relief) `[v2 — new]`
- **Module:** M05-TRJ · Authority Forced-Action
- **Primary Role(s):** Transfer Authority, HR Officer (initiator), Auditor
- **User Story:** *As a Transfer Authority, I want a single, audited forced-action power to break human-conflict deadlocks — non-responsive clearance, hostile handover, source refusing to relieve — so an employee is never trapped indefinitely.*
- **Description:** One mechanism (`forced_action_type`) covering: `DEEMED_CLEARED` (after SLA + escalation `OFFICER→DEPT_HEAD→AUTHORITY`, FR-006), `HANDOVER_UNDER_PROTEST` (after dispute SLA, FR-007), and `DEEMED_RELIEF`/`stand_relieved` (FR-008). Each requires a Transfer Authority, a mandatory `forced_action_reason`, and writes a dedicated audit row with actor; the transferee may never be the granting Authority `[v2]`.
- **Acceptance Criteria:**
  1. Each forced action is gated to Transfer Authority + mandatory reason + recorded approver.
  2. `DEEMED_CLEARED` only after the item's SLA breach and escalation chain exhausted (or Authority-justified emergency).
  3. `HANDOVER_UNDER_PROTEST` only after `dispute_sla_due_at`; preserves the underlying dispute.
  4. `DEEMED_RELIEF` issues/marks a relieving order with `deemed_relief=true`, satisfying the relieving precondition (5.6-2).
  5. Every forced action is independently queryable for audit/analytics.
- **Business Rules:** Forced actions do not erase dues/disputes — they unblock the lifecycle while the financial/charge dispute proceeds separately (and may signal M10 recovery). Transferee-exclusion enforced.
- **Data Model References:** `clearance_items`, `charge_handovers`, `relieving_orders` (forced-action fields), `audit_log`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/clearance/items/{id}/deem-cleared` |
  | POST | `/api/v1/charge-handovers/{id}/under-protest` |
  | POST | `/api/v1/relieving-orders/{id}/deemed-relieve` |
  | GET | `/api/v1/transfers/forced-actions?type=&cursor=` |
- **UI Behavior Notes:** Authority-only forced-action drawer with mandatory reason (≥ 20 chars), escalation/dispute context shown, confirmation listing downstream effects; forced-action audit log view.
- **Edge Cases:** Forced action attempted before SLA/escalation exhausted (blocked unless emergency-justified); transferee attempts self-forced-action (FORBIDDEN); concurrent forced action + officer clearance.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ForcedActionService`, `DeemedClearanceController`, `UnderProtestController`, `DeemedRelieveController` |
  | Backend Flow | Verify Authority + precondition (SLA/escalation/dispute) → set `forced_action_*` → unblock downstream gate → audit |
  | Data Operations | UPDATE target entity forced-action fields; INSERT dedicated `audit_log` reason+actor |
  | Validation | Authority role; reason mandatory; precondition exhausted; transferee-exclusion |
  | Authorization | Transfer Authority only |
  | State Changes & Side Effects | `DEEMED_CLEARED`/`UNDER_PROTEST`/`DEEMED_RELIEVED`; downstream lifecycle unblocked |
  | Failure Handling | Precondition not met → 409; audit always written |
  | Dependencies | FR-006/007/008 |
  | Test Guidance | **Forced-action audit (reason+actor)**; SLA/escalation precondition; transferee-exclusion; dispute preserved |

---

### FR-TRJ-017 — Representation, Stay-Order & Retention Hold `[v2 — new]`
- **Module:** M05-TRJ · Representation & Holds
- **Primary Role(s):** Employee, HR Officer, Transfer Authority, Auditor
- **User Story:** *As the organisation, I want representations, court/tribunal stays, and retention requests to pause a transfer order at any pre-join stage with full audit, so contested transfers are handled lawfully instead of forcing an irreversible move.*
- **Description:** New `transfer_representations` entity and `STAY_HOLD` order status. A representation/stay/retention request can be filed against an order and, when upheld or a court stay is in force, set the order `STAY_HOLD` (`hold_active=true`), blocking all forward transitions (5.6-16) until vacated. Decisions (`ALLOW`/`DENY`/`MODIFY`/`VACATE`) are recorded with authority and validity `[v2]`.
- **Acceptance Criteria:**
  1. A representation/stay/retention can be filed against any order pre-join, referencing a document and authority/case number.
  2. An upheld representation or active court stay transitions the order to `STAY_HOLD` and sets `hold_active=true`.
  3. While `hold_active`, no forward transition (relieve/join) is permitted (`TRJ_STAY_HOLD_ACTIVE`).
  4. Vacating the hold (`VACATE`/expiry) restores the prior status via `TransferOrderStateService` with audit.
  5. All filings/decisions are audited and visible to Auditor.
- **Business Rules:** Court stays (`COURT_STAY`) may only be vacated on recorded court order/expiry; retention requests follow Authority decision; holds do not delete the order.
- **Data Model References:** `transfer_representations` `[v2]`, `transfer_orders` (`status`,`hold_active`), `documents`, `audit_log`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/representations` |
  | POST | `/api/v1/representations/{id}/decide` |
  | POST | `/api/v1/representations/{id}/vacate` |
  | GET | `/api/v1/transfers/holds?status=&cursor=` |
- **UI Behavior Notes:** Representation filing form (type, authority ref, document); hold banner on order detail; Authority decision modal; holds register.
- **Edge Cases:** Stay filed mid-relieving (hold blocks further steps, already-issued relieving preserved); overlapping representations; stay expiry auto-vacate; retention request denied.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `RepresentationService`, `HoldController`, `TransferOrderStateService`, `HoldsRegister` |
  | Backend Flow | File representation → review/decide → if upheld/stay set `STAY_HOLD`+`hold_active` → block transitions → vacate restores status |
  | Data Operations | INSERT/UPDATE `transfer_representations`; UPDATE `transfer_orders.status`/`hold_active`; `audit_log` |
  | Validation | Pre-join stage; type-specific vacate rules; authz |
  | Authorization | File: employee/HR; decide/vacate: Transfer Authority |
  | State Changes & Side Effects | Order → `STAY_HOLD` ↔ prior status; notifications to parties |
  | Failure Handling | Concurrent transition attempt during hold → `TRJ_STAY_HOLD_ACTIVE` |
  | Dependencies | FR-004/008/010, M13 |
  | Test Guidance | Hold blocks all forward transitions; vacate restores; court-stay vacate rules; overlapping holds |

---

### FR-TRJ-018 — Non-Joining / Abandonment Resolution `[v2 — new]`
- **Module:** M05-TRJ · Non-Joining / Abandonment
- **Primary Role(s):** HR Officer (Destination), Transfer Authority, Disciplinary Authority (M09)
- **User Story:** *As HR, I want a defined path for an employee who never joins beyond grace, so they do not sit in permanent IN_TRANSIT limbo with undefined pay and posting.*
- **Description:** When transit exceeds admissible + grace, the joining report enters `LATE_JOINING_REVIEW`. The Authority decides between **`REVERT_TO_SOURCE`** (re-join at source as a reverse joining, restoring source posting + custody) and **`ABANDONED`** (continuity break recorded, M09 disciplinary trigger raised) `[v2]`. The limbo-period pay status is explicitly defined (continuity until grace; thereafter per Authority decision — paid pending inquiry or stopped on abandonment) `[v2]`.
- **Acceptance Criteria:**
  1. Transit beyond admissible + grace routes the joining report to `LATE_JOINING_REVIEW`.
  2. Authority decides `REVERT_TO_SOURCE` or `ABANDONED` with mandatory reason.
  3. `REVERT_TO_SOURCE` restores source posting/custody and records a reverse joining (order → `REVERTED_TO_SOURCE`).
  4. `ABANDONED` records a continuity break (`service_continuity_asserted=false`), raises an M09 disciplinary trigger, and sets pay status per decision (order → `ABANDONED`).
  5. The limbo-period pay treatment is recorded and signalled to M10.
- **Business Rules:** Abandonment is the only path that breaks service continuity (5.6-11 exception); revert-to-source re-uses joining mechanics in reverse; M09 trigger is a signal, not a proceeding (owned by M09).
- **Data Model References:** `joining_reports` (`status`), `transfer_orders` (`status`,custody), `sr_outbox` (M09/M10 signals), `audit_log`.
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
  | Components | `LateJoiningService`, `AbandonmentOrchestrator`, `TransferOrderStateService`, `DisciplinarySignalClient(M09)` |
  | Backend Flow | Detect overdue (FR-009) → `LATE_JOINING_REVIEW` → Authority decide → revert (restore source) or abandon (break continuity, M09 trigger, pay status) |
  | Data Operations | UPDATE `joining_reports`,`transfer_orders` (custody/status); INSERT `sr_outbox` (M09/M10),`audit_log` |
  | Validation | Grace breach; decision authz + reason; pay-status capture |
  | Authorization | HR queue; Transfer Authority decide |
  | State Changes & Side Effects | Order → `REVERTED_TO_SOURCE`/`ABANDONED`; M09 trigger; M10 pay status |
  | Failure Handling | M09/M10 via outbox retry; join-during-review cancels |
  | Dependencies | FR-009/010/012/015, M09, M10 |
  | Test Guidance | Limbo pay defined; revert restores source/custody; abandonment continuity break + M09 trigger |

---

### FR-TRJ-019 — Interactive Counselling Session `[v2 — new]`
- **Module:** M05-TRJ · Interactive Counselling
- **Primary Role(s):** Transfer Authority / Presiding Officer, HR Admin, Employee
- **User Story:** *As a Transfer Authority running a cadre counselling, I want candidates called in seniority/merit order to choose live from remaining vacancies with an immutable choice log, so allotment is observed, contestable, and defensible in a tribunal.*
- **Description:** For `drive_type=COUNSELLING`, a `counselling_session` is created with a per-candidate turn order (`SENIORITY`/`MERIT`). When a candidate's turn is live, the system **locks the candidate's available vacancies** (one live turn at a time), the candidate chooses (or passes/declines), and an **immutable `counselling_choices` row** is recorded by the presiding officer. The chosen vacancy converts to a `vacancy_reservation` and feeds order generation (FR-004). The batch path (FR-003) remains for `SENIORITY`/`MERIT`/`MANUAL` drives — the two coexist, selected by `drive_type` `[v2]`.
- **Acceptance Criteria:**
  1. Candidates are ordered by `turn_order_method`; only the current-turn candidate may choose.
  2. During a live turn the chosen-from vacancy set is locked; no concurrent allotment of the same vacancy.
  3. Each choice (`CHOSEN`/`PASSED`/`DECLINED`/`AUTO_PASS_TIMEOUT`/`ABSENT`) is recorded immutably with timestamp and recording officer.
  4. A turn times out after `turn_timeout_seconds` → `AUTO_PASS_TIMEOUT`.
  5. A `CHOSEN` vacancy becomes a `RESERVED` `vacancy_reservation`; the choice log is append-only and exportable.
- **Business Rules:** Candidates must pass FR-002; choice log is never edited/deleted (5.6-10); presiding officer records on behalf (observed); seniority ties broken deterministically by `service_no`.
- **Data Model References:** `counselling_sessions` `[v2]`, `counselling_choices` `[v2]`, `vacancy_positions`, `vacancy_reservations`, `transfer_drives`, `employees`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives/{id}/counselling-sessions` |
  | POST | `/api/v1/counselling-sessions/{id}/advance-turn` |
  | POST | `/api/v1/counselling-sessions/{id}/record-choice` |
  | GET | `/api/v1/counselling-sessions/{id}/choices` |
- **UI Behavior Notes:** Presiding console showing turn queue, live candidate, remaining vacancies (locked during turn), record-choice action, countdown timer; public choice-log view for transparency.
- **Edge Cases:** Candidate absent (`ABSENT`, turn advances); two officers recording simultaneously (single live turn lock); vacancy exhausted before a turn; session paused/resumed.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `CounsellingSessionService`, `TurnOrchestrator`, `VacancyLockManager` `[v2]`, `ChoiceLogWriter` (append-only), `PresidingConsole` |
  | Backend Flow | Build turn order → advance turn (lock vacancies for current candidate) → record choice (immutable) → create reservation → next turn |
  | Data Operations | INSERT `counselling_sessions`; append `counselling_choices`; `SELECT … FOR UPDATE` vacancy lock; INSERT `vacancy_reservations`; `audit_log` |
  | Validation | Single live turn; current-turn-only choice; timeout; tie-break |
  | Authorization | Presiding Officer/HR Admin record; employee views own turn |
  | State Changes & Side Effects | Session `SCHEDULED`→`IN_PROGRESS`→`COMPLETED`; reservations created |
  | Failure Handling | Officer disconnect → turn lock TTL; timeout auto-pass |
  | Dependencies | FR-002/003/004 |
  | Test Guidance | Single-live-turn lock; immutable choice log; timeout auto-pass; tie-break; reservation creation |

---

### FR-TRJ-020 — Order Proof-of-Service & Acknowledgement `[v2 — new]`
- **Module:** M05-TRJ · Proof-of-Service
- **Primary Role(s):** HR Officer, Employee, Transfer Authority, Auditor
- **User Story:** *As HR, I want recorded proof that the transfer order was served on the employee and (where possible) acknowledged, so relieve-by deadlines and non-compliance discipline rest on the served date, not the order date.*
- **Description:** On publication, the order is served through a `delivery_channel` (in-app/email/SMS/registered-post/hand-delivery/published-notice) and an `order_acknowledgements` row records `served_on_date`. The employee may acknowledge (`ACKNOWLEDGED`); non-acknowledgement after policy time, or returned registered post / published notice, yields `DEEMED_SERVED`; refusal yields `REFUSED`. `transfer_orders.served_on_date`/`acknowledged_at` mirror the canonical record, and **`relieve_by_date` enforcement references the served date** (5.6-15) `[v2]`.
- **Acceptance Criteria:**
  1. Publication creates an acknowledgement row with channel and `served_on_date`.
  2. Employee acknowledgement sets `ACKNOWLEDGED` + `acknowledged_at`.
  3. Non-ack within policy window / returned post / published notice → `DEEMED_SERVED` with reason; refusal → `REFUSED`.
  4. An order cannot enter `RELIEVING_IN_PROGRESS` without a `SERVED`/`DEEMED_SERVED`/`ACKNOWLEDGED` row (5.6-15).
  5. `relieve_by_date` is computed from `served_on_date`, not `order_date`.
- **Business Rules:** Registered-post/hand-delivery require a `proof_document_id`; deemed-served requires recorded reason; served date is the statutory basis for non-compliance.
- **Data Model References:** `order_acknowledgements` `[v2]`, `transfer_orders` (`served_on_date`,`acknowledged_at`,`relieve_by_date`), `documents`, `notifications`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/serve` |
  | POST | `/api/v1/transfers/orders/{id}/acknowledge` |
  | POST | `/api/v1/transfers/orders/{id}/deem-served` |
  | GET | `/api/v1/transfers/orders/{id}/service-record` |
- **UI Behavior Notes:** Service panel (channel selector, proof upload, served date); employee acknowledgement prompt on My Transfers; deemed-served action with reason; service-record timeline.
- **Edge Cases:** Employee on leave/unreachable (registered post → deemed); refusal to acknowledge; multiple delivery attempts; served before publish (blocked).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `OrderServiceController`, `AcknowledgementService`, `DeemedServedController`, `ServicePanel` |
  | Backend Flow | On publish create service record → notify → employee ack OR deemed/refused → set order served fields → compute relieve_by from served date |
  | Data Operations | INSERT/UPDATE `order_acknowledgements`,`transfer_orders` (served fields); `audit_log`; document ref |
  | Validation | Proof required for postal/hand; deemed reason; serve-after-publish only |
  | Authorization | Serve/deem: HR; acknowledge: employee (own) |
  | State Changes & Side Effects | `SERVED`→`ACKNOWLEDGED`/`DEEMED_SERVED`/`REFUSED`; relieve-by recomputed |
  | Failure Handling | Notification failure retried; postal proof upload retry |
  | Dependencies | FR-004/008 |
  | Test Guidance | Served-date precedence for relieve-by; deemed-served reasons; relieving blocked without service; refusal path |

---

### FR-TRJ-021 — Joining-Sequence & Inter-se Seniority Integrity `[v2 — new]`
- **Module:** M05-TRJ · Joining-Sequence & Seniority
- **Primary Role(s):** HR Officer (Destination), System, Transfer Authority, Auditor
- **User Story:** *As HR, I want a defensible inter-se joining order when several transferees join the same cadre/post, because joining-date order sets seniority that M06 consumes and that transfer litigation hinges on.*
- **Description:** On joining confirmation, assigns `joining_sequence_no` ordered by `reported_date` then `joining_time` (FN before AN) then a deterministic `inter_se_tiebreak_key` (default `service_no`) for joiners sharing (`dest_org_unit_id`,`dest_designation_id`,`joining_date`). The tuple is unique (5.6-14) and exposed to M06 so seniority computation is reproducible and contestable `[v2]`.
- **Acceptance Criteria:**
  1. Concurrent same-cadre/post joinings on a date receive distinct, contiguous `joining_sequence_no`.
  2. Ordering is `reported_date` → `joining_time` (FN<AN) → `inter_se_tiebreak_key`.
  3. The sequence tuple is unique per (`dest_org_unit_id`,`dest_designation_id`,`joining_date`).
  4. The sequence + tie-break key are exposed to M06.
  5. Authority may adjust sequence only with recorded justification (audited).
- **Business Rules:** Tie-break is deterministic (`service_no` default; policy-configurable); manual re-sequencing is Authority-only and audited; the sequence feeds M06 but seniority math is owned by M06.
- **Data Model References:** `joining_reports` (`joining_sequence_no`,`inter_se_tiebreak_key`), M06 (consumer), `audit_log`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/joining-sequence?office=&designation=&date=` |
  | POST | `/api/v1/joining-reports/{id}/resequence` |
- **UI Behavior Notes:** Destination HR joining-sequence grid for the date showing computed order; Authority re-sequence action with justification; M06 export indicator.
- **Edge Cases:** Same reported_date + same FN/AN + tie-break collision (impossible by `service_no` uniqueness); back-dated joining; re-sequencing after M06 consumption (compensating notice).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `JoiningSequencer`, `SeniorityFeedClient(M06)`, `SequenceGrid` |
  | Backend Flow | On confirm: compute sequence within (office,designation,date) with deterministic ordering → persist → feed M06 |
  | Data Operations | UPDATE `joining_reports` sequence fields (unique constraint); `audit_log` on resequence |
  | Validation | Uniqueness; deterministic ordering; resequence authz |
  | Authorization | System assign; Authority resequence |
  | State Changes & Side Effects | Sequence assigned; M06 fed |
  | Failure Handling | M06 feed via outbox retry; uniqueness violation → recompute |
  | Dependencies | FR-010, M06 |
  | Test Guidance | **Inter-se ordering determinism**; uniqueness; FN/AN precedence; resequence audit |

---

### FR-TRJ-022 — Government Quarters / Estate Retention & Licence-Fee Recovery `[v2 — new]`
- **Module:** M05-TRJ · Quarters / Estate
- **Primary Role(s):** Estate / Quarters Officer, HR Officer, Transfer Authority, Payroll Officer, Employee
- **User Story:** *As an estate officer, I want official-accommodation retention, vacation timelines, and licence-fee recovery modelled as a sub-process — not one checklist tick — so post-transfer accommodation is tracked and recovered statutorily.*
- **Description:** Models a `quarter_allotment` for transferees occupying official accommodation: retention-allowed flag (Authority-approved), `vacate_by_date`, vacation tracking, normal/penal `licence_fee_rate`, and a **licence-fee-recovery signal to M10** when accommodation is retained beyond entitlement `[v2]`. Linked to the `ESTATE_QUARTERS` clearance item (FR-006) but richer: clearance can be `CLEARED_WITH_DUES` with an active retention rather than blocking relieving `[v2]`.
- **Acceptance Criteria:**
  1. A quarter retention record can be created/approved with `vacate_by_date` and licence-fee rate.
  2. Retention beyond permissible period flips `penal_rate_applies=true` and status `OVERSTAY`.
  3. An overstay/retention raises a **licence-fee-recovery signal to M10** with reference.
  4. Vacation recording sets `VACATED` + `vacated_on`; closes the estate clearance dependency.
  5. The estate clearance item does not hard-block relieving when retention is approved (recovery tracked separately).
- **Business Rules:** Retention requires Authority approval; penal rate per policy after permissible months; licence-fee recovery is an M10 signal (recovery owned by M10); vacation reconciles the estate clearance item.
- **Data Model References:** `quarter_allotments` `[v2]`, `clearance_items` (ESTATE_QUARTERS), `sr_outbox` (M10 licence-fee signal), `transfer_orders`.
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
  | Components | `QuarterRetentionService`, `LicenceFeeSignalClient(M10)`, `EstateRegister` |
  | Backend Flow | Create/approve retention → vacate-by clock → overstay flips penal + M10 signal → vacation closes estate clearance |
  | Data Operations | INSERT/UPDATE `quarter_allotments`; UPDATE estate `clearance_items`; INSERT `sr_outbox` (M10); `audit_log` |
  | Validation | Authority approval; vacate-by ≥ LWD; penal-rate policy |
  | Authorization | Estate Officer record; Authority approve retention |
  | State Changes & Side Effects | `OCCUPIED`→`RETENTION_APPROVED`→`VACATION_DUE`→`VACATED`/`OVERSTAY`; M10 licence-fee recovery |
  | Failure Handling | M10 signal via outbox retry; overstay escalation |
  | Dependencies | FR-006/008, M10 |
  | Test Guidance | Retention non-blocking relieving; penal-rate flip; licence-fee recovery signal; vacation closes clearance |

---

## 7. UI Requirements

### 7.1 Screens & layouts
| Screen | Primary users | Key elements | States covered |
|---|---|---|---|
| Transfer Request Wizard | Employee, HR | Type selector (canonical taxonomy), details, grounds+docs (**sensitive uploads marked restricted**), eligibility banner, review | empty/loading/error/success/permission |
| My Transfers (self-service) | Employee | Status timeline, current order, **service-acknowledgement prompt**, relieving/joining tasks, **hold banner** | empty/loading/error |
| Transfer Orders Console | HR, Authority | Order list (filter status/office/class), composer (+`order_class`, distance band), approval timeline, **gapless number**, PDF viewer | all |
| Order Service Panel | HR, Employee | Channel selector, proof upload, served/ack/deemed-served | all |
| Drive Console | HR Admin, Authority | Stage stepper, candidate grid, batch progress, quarantine | all |
| Counselling Session Console | Presiding Officer, Employee | Turn queue, live candidate, **locked remaining vacancies**, record-choice, countdown, choice log | all |
| Counselling/Preferences | Employee | Drag-rank preferences, window countdown | empty/loading/error |
| Clearance Board | HR Source, Clearance/Estate Officers, Employee | Per-department cards, **SLA countdown + escalation badge**, dues entry, evidence upload, **deem-cleared (Authority)**, tracker | all incl. blocked |
| Charge Handover | Employee, Receiving Officer, Authority | Asset table, cash fields, note upload, accept/dispute, **under-protest** | all |
| Relieving Panel | HR Source, Authority | Readiness gauges, LWD picker, **deemed-relieve**, downstream signal preview (**pay-continuity**, custody) | all |
| In-Transit Register | HR, Auditor | Elapsed/limit bars, **custodian column**, overdue highlight, extend action | empty/loading |
| Joining Wizard | Employee, HR Dest | Report, charge assumption, confirm, transit summary, **joining-sequence**, late-joining banner | all |
| Late-Joining / Abandonment Queue | HR Dest, Authority | Review queue, revert-vs-abandon decision, pay-status selector | all |
| Representation & Holds Register | Employee, HR, Authority, Auditor | Filing form, hold banner, decision modal, holds list | all |
| Deputation Register | HR Admin, Authority | Tenure timeline, extension, repatriation action | all |
| Estate / Quarters Register | Estate Officer, Authority, Employee | Retention request/approval, vacate-by countdown, penal-rate, vacation recording | all |
| SR Reconciliation Console | SR Custodian | **Outbox PENDING/FAILED/DEAD_LETTERED**, retry, per-order SR timeline | all |
| Transfer Dashboard | Authority, Admin, Auditor | KPI cards, bottleneck chart, custody/violation/dead-letter exceptions, export; **map (Phase-2 flag)** | loading/empty/error |

### 7.2 Cross-cutting UI rules
- Mobile-first responsive; collapsible sidebar with menu icons + hamburger on small screens.
- WCAG 2.1 AA: keyboard navigation, focus order, ARIA labels, contrast ≥ 4.5:1.
- Dark mode via design tokens; no hardcoded colors.
- Every list paginated (≤ 100/page) with empty/loading/error states; destructive/forced actions confirmed with typed reason.
- Real fields and live data only — no skeleton placeholders.
- Toasts for async results; inline validation with field-level error from API envelope.
- Bilingual labels (English + regional) on statutory documents/orders.
- **Sensitive-ground documents render behind a restricted-access gate with an access-logged "reveal" action** `[v2]`.
- **Pay language is always "continued", never "stopped"** in transfer flows `[v2]`.

---

## 8. API & Integration

### 8.1 Conventions
REST under `/api/v1`; JWT bearer; RBAC + row-level scope; cursor/page pagination (max 100); idempotency keys on POST that trigger external signals (formula §5.2.15); ISO-8601 UTC; `DD-MMM-YYYY` display client-side. All `transfer_orders.status` mutations route through `TransferOrderStateService` (§16.6).

### 8.2 Error envelope & module error-code catalog
Canonical envelope: `{ "error": { "code", "message", "field" }, "requestId" }`.

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/payload invalid |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD violation |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | Generic conflict |
| TRJ_ACTIVE_TRANSFER_EXISTS | 409 | Employee already has active **substantive** order `[v2]` |
| TRJ_ELIGIBILITY_BLOCKED | 422 | Hard-block policy failure |
| TRJ_BAN_WINDOW_ACTIVE | 422 | Transfer falls in ban period |
| TRJ_CLEARANCE_INCOMPLETE | 409 | Relieving attempted before clearance/deemed |
| TRJ_HANDOVER_DISPUTED | 409 | Charge handover not accepted/under-protest |
| TRJ_NOT_IN_TRANSIT | 409 | Joining before relief |
| TRJ_DEPUTATION_CAP_EXCEEDED | 422 | Extension beyond max tenure |
| TRJ_SR_POST_FAILED | 503 | SR posting failed (retryable, outbox) |
| TRJ_VACANCY_FULL | 409 | Allotment/join to filled vacancy (incl. join-time re-check) `[v2]` |
| TRJ_DUAL_POSTING_BLOCKED | 409 | `[v2]` Dual/zero in-transit custody |
| TRJ_STAY_HOLD_ACTIVE | 409 | `[v2]` Forward transition blocked by active hold |
| TRJ_MUTUAL_PAIR_BLOCKED | 409 | `[v2]` Asymmetric mutual completion |
| TRJ_ORDER_NOT_SERVED | 409 | `[v2]` Relieving before proof-of-service |
| TRJ_NUMBER_SEQUENCE_LOCKED | 409 | `[v2]` Gapless number reservation contention (retry) |
| TRJ_COUNSELLING_TURN_VIOLATION | 409 | `[v2]` Choice attempted out of turn |
| TRJ_FORCED_ACTION_PRECONDITION | 409 | `[v2]` Forced action before SLA/escalation exhausted |
| TRJ_QUARTER_OVERSTAY | 422 | `[v2]` Accommodation retained beyond limit |
| RATE_LIMITED | 429 | Throttled |
| UPSTREAM_UNAVAILABLE | 503 | M01/M06/M09/M10/M12/M13/Calendar unavailable |
| INTERNAL_ERROR | 500 | Unexpected |

### 8.3 Integration points
| System | Direction | Purpose |
|---|---|---|
| M01 Employee Master | Read/Write | Validate transferee; update posting on join; reverse on revoke/abandon |
| M06 Promotion/Seniority | Read/Trigger | Promotion-linked trigger; **sanctioned-strength & seniority read-through** `[v2]`; **joining-sequence consumer** `[v2]` |
| M09 Disciplinary | Signal | `[v2]` Abandonment disciplinary trigger |
| M10 Payroll | Signal | **Pay-continuity** (not stop/start), **entitlement by transfer_type+ground** `[v2]`, LPC, dues recovery, **licence-fee recovery** `[v2]` |
| M12 Digital SR | Write (via `sr_outbox`) | SR events (order/relieve/join) with **continuity assertion** `[v2]` |
| M13 Documents | Read/Write | Order/clearance/handover/joining PDFs; **sensitive access class** for medical/spouse/compassionate `[v2]` |
| **Platform Calendar Service** | Read (contracted) | `[v2]` Regional working-day/holiday calendar for joining-time (no silent fallback) |
| Workflow engine | Read/Write | Approval routing |
| Notifications | Write | Lifecycle notifications |

**Calendar service contract `[v2]`:** `GET /calendar/working-days?from=&to=&region=` returns working-day count excluding regional holidays/weekends; unavailability returns `503` and joining-time computation is deferred (FR-009), never silently defaulted.

**M10 signal contract `[v2]`:** `PAY_CONTINUITY{employeeId, fromDate, custodyOrgUnit, continue:true}`, `ENTITLEMENT{employeeId, transferType, ground, distanceBand, joiningTimePayAdmissible}`, `LPC_REQUEST{...}`, `LICENCE_FEE_RECOVERY{employeeId, quarterRef, rate, penal}` — all idempotent via outbox key.

### 8.4 JSON examples
**Create transfer request — request**
```json
POST /api/v1/transfers/requests
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
**Relieving — pay-continuity signal (outbox payload) `[v2]`**
```json
{
  "outboxId": "ob-77a1",
  "targetSystem": "M10_PAYROLL",
  "eventType": "PAY_CONTINUITY",
  "idempotencyKey": "M10_PAYROLL:PAY_CONTINUITY:RELIEVING_ORDER:ro-0457:0",
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
**Issue relieving order — error (not served) `[v2]`**
```json
{
  "error": {
    "code": "TRJ_ORDER_NOT_SERVED",
    "message": "Order TO/2026/04/0457 has no recorded proof-of-service; relieving cannot begin.",
    "field": "servedOnDate"
  },
  "requestId": "req-9f2c..."
}
```
**Confirm joining — response (200) `[v2]`**
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
  "srEvent": { "type": "JOINED", "status": "PENDING", "idempotencyKey": "M12_SR:JOINED:TRANSFER_ORDER:to-0456:0" },
  "payContinuityResumed": true,
  "vacancyReservation": "FILLED_ON_JOIN"
}
```
**Deemed-clearance — request (forced action) `[v2]`**
```json
POST /api/v1/clearance/items/ci-0790-it/deem-cleared
{
  "forcedActionReason": "IT officer non-responsive past SLA and escalation to dept-head and Authority; no assets traceable to employee.",
  "forcedActionBy": "user-authority-01"
}
```

---

## 9. Non-Functional Requirements
| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; dashboard aggregates < 2s; bulk drive of 1,000 orders < 30 min (async); counselling turn record < 300ms. |
| Availability | 99.9% uptime; `sr_outbox` guarantees no data loss during M10/M12/M01 downtime. |
| Scalability | Horizontal scaling; batch/counselling jobs queue-based; supports 100k active employees, 20k transfers/year. |
| Security | OIDC/SSO + MFA; RBAC + row-level org scope; SoD invariants; OWASP ASVS; parameterised queries only; secrets via env. |
| Data integrity | All multi-step writes transactional; external signals via `sr_outbox` (idempotency-key formula); no orphan records; gapless statutory numbering; single-custodian invariant. |
| Auditability | Every state change in `audit_log` with before/after + actor + requestId; **forced actions, overrides, deemed-clearances, resequencing, and sensitive-document access carry dedicated reason+actor audit**; immutable SR events and counselling choice log. |
| Privacy/Compliance `[v2]` | DPDP Act 2023 alignment; **medical/spouse/compassionate evidence classified as DPDP sensitive category in M13 with restricted access and explicit access logging**; PII minimisation; statutory retention; no PII in logs. |
| Accessibility | WCAG 2.1 AA across all screens. |
| Observability | Structured logs; metrics (clearance time, SLA breaches, deemed-clearances, transit days, custody exceptions, outbox dead-letter rate, un-overridden violations); traces with requestId. |
| Resilience | RPO ≤ 15min, RTO ≤ 4h; retries with backoff; dead-letter + reconciliation for outbox. |
| i18n/L10n | Bilingual order templates; regional working-day calendar (contracted); locale dates/currency; timezone-aware display. |

### 9.x Privacy — sensitive-ground documents `[v2]`
Documents supporting `MEDICAL`/`SPOUSE`/`COMPASSIONATE` grounds (`sensitive_document_ids`, `sensitive_ground=true`) are stored in M13 under a **sensitive access class**: access restricted to the transferee, the deciding Transfer Authority, and HR officers with an explicit need; every read is access-logged with actor + requestId; such documents are excluded from general analytics and never rendered in non-restricted UI contexts.

---

## 10. Workflow & State Diagrams (state tables)

### 10.1 Transfer Order state table `[v2 — served, hold, custody, abandonment]`
| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| DRAFT | submit-for-approval | eligibility ≠ hard-block | PENDING_APPROVAL | workflow opened |
| PENDING_APPROVAL | approve | maker≠checker, re-eligibility pass | APPROVED | **gapless** order_no, PDF |
| PENDING_APPROVAL | reject | — | CANCELLED | notify |
| APPROVED | publish | PDF present | PUBLISHED | SR TRANSFER_ORDERED (outbox), clearance created, **service initiated** |
| PUBLISHED | serve/acknowledge | — | SERVED | `served_on_date`; relieve_by from served date |
| SERVED | start-relieving | served/deemed-served present | RELIEVING_IN_PROGRESS | — |
| any pre-join | hold | representation upheld / court stay | STAY_HOLD | `hold_active=true`; blocks transitions |
| STAY_HOLD | vacate | stay vacated/expired | (prior status) | `hold_active=false` |
| RELIEVING_IN_PROGRESS | issue-relieving / deemed-relief | clearance cleared/deemed + handover accepted/under-protest | RELIEVED | relieving order, **pay-continuity**, LPC, SR RELIEVED, **custody set**, reservation VACATED_ON_RELIEF |
| RELIEVED | enter-transit | — | IN_TRANSIT | transit counter; custodian owns headcount |
| IN_TRANSIT | confirm-joining | order in transit, reservation re-check, mutual pair ok | JOINED | joining report, **pay-continuity resume**, M01 update, joining-sequence, SR JOINED, reservation FILLED_ON_JOIN |
| IN_TRANSIT | late-joining review | transit > admissible+grace | (LATE_JOINING_REVIEW on report) | review queue |
| LATE_JOINING_REVIEW | revert | authority decide | REVERTED_TO_SOURCE | restore source posting/custody |
| LATE_JOINING_REVIEW | abandon | authority decide | ABANDONED | continuity break, M09 trigger, pay status |
| PUBLISHED/SERVED/RELIEVING_IN_PROGRESS | amend | pre-relief | AMENDED | supersede, new revision, SR correction |
| PUBLISHED/SERVED/RELIEVING_IN_PROGRESS | cancel | pre-relief | CANCELLED | reverse clearance/handover, release reservation |
| RELIEVED/IN_TRANSIT/JOINED | revoke | authority approve | REVOKED | compensating SR, pay/M01 reversal |

*(All transitions executed by `TransferOrderStateService`.)*

### 10.2 Clearance checklist / item state table `[v2 — SLA/deemed]`
| From | Event | Guard | To |
|---|---|---|---|
| OPEN | first item updated | — | IN_PROGRESS |
| item PENDING | SLA breach | escalation tier advances | (item escalated) |
| item PENDING/escalated | Authority deem | SLA+escalation exhausted | item DEEMED_CLEARED |
| IN_PROGRESS | item dues outstanding | — | BLOCKED |
| IN_PROGRESS | all items cleared | no dues | CLEARED |
| BLOCKED | dues recovery linked | recovery_ref set | CLEARED_WITH_DUES |
| IN_PROGRESS | all items cleared/deemed | ≥1 deemed | CLEARED_WITH_DEEMED |
| any | order cancelled | — | CANCELLED |

### 10.3 Joining report state table `[v2 — abandonment]`
| From | Event | Guard | To |
|---|---|---|---|
| DRAFT | submit | order IN_TRANSIT | SUBMITTED |
| SUBMITTED | HR verify | — | UNDER_VERIFICATION |
| UNDER_VERIFICATION | confirm | transit within admissible OR authority review done; reservation re-check ok | JOINED_CONFIRMED |
| UNDER_VERIFICATION | flag late | transit > admissible+grace | LATE_JOINING_REVIEW |
| LATE_JOINING_REVIEW | revert-to-source | authority decide | (report closed; order REVERTED_TO_SOURCE) |
| LATE_JOINING_REVIEW | abandon | authority decide | ABANDONED |
| LATE_JOINING_REVIEW | authority confirm | accepted | JOINED_CONFIRMED |

### 10.4 Representation / hold state table `[v2]`
| From | Event | Guard | To |
|---|---|---|---|
| FILED | review | — | UNDER_REVIEW |
| UNDER_REVIEW | uphold / court stay active | — | HOLD_ACTIVE |
| UNDER_REVIEW | reject | — | REJECTED |
| HOLD_ACTIVE | vacate/expire | stay order/expiry | VACATED |
| any | withdraw | filer withdraws | WITHDRAWN |

### 10.5 Vacancy reservation lifecycle `[v2]`
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

### 10.7 `sr_outbox` delivery state table `[v2]`
| From | Event | Guard | To |
|---|---|---|---|
| PENDING | dispatch | next_attempt_at ≤ now | IN_FLIGHT |
| IN_FLIGHT | success | target ack | DELIVERED |
| IN_FLIGHT | failure | attempt_count < max_attempts | FAILED (re-PENDING w/ backoff) |
| FAILED | exhausted | attempt_count = max_attempts | DEAD_LETTERED |

---

## 11. Notifications
| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Request submitted | Recommender, HR | In-app, email | TRJ_REQ_SUBMITTED |
| Eligibility blocked | Initiator | In-app | TRJ_ELIGIBILITY_BLOCKED |
| Order published | Transferee, source HR, dest HR | In-app, email, SMS | TRJ_ORDER_PUBLISHED |
| Order served / ack pending `[v2]` | Transferee | In-app, email, SMS | TRJ_ORDER_SERVED |
| Clearance item SLA breach / escalation `[v2]` | Officer, Dept Head, Authority | In-app, email | TRJ_CLEARANCE_ESCALATION |
| Deemed clearance granted `[v2]` | Transferee, source HR, officer | In-app, email | TRJ_DEEMED_CLEARED |
| Clearance with dues | Transferee, Accounts, source HR | In-app, email | TRJ_DUES_OUTSTANDING |
| Handover under protest `[v2]` | Transferee, acceptor, Authority, Accounts | In-app, email | TRJ_HANDOVER_PROTEST |
| Relieving order issued (**pay continued**) `[v2]` | Transferee, both offices, Payroll | In-app, email | TRJ_RELIEVED |
| In-transit overdue | Transferee, both offices, Authority | In-app, email | TRJ_TRANSIT_OVERDUE |
| Late-joining / abandonment review `[v2]` | Authority, HR Dest, (M09 on abandon) | In-app, email | TRJ_LATE_JOINING |
| Joining confirmed | Transferee, both offices, Payroll, SR | In-app, email | TRJ_JOINED |
| Stay-hold active / vacated `[v2]` | Transferee, both offices, Authority | In-app, email | TRJ_STAY_HOLD |
| Quarter overstay / licence-fee recovery `[v2]` | Transferee, Estate, Payroll | In-app, email | TRJ_QUARTER_OVERSTAY |
| SR/outbox dead-letter `[v2]` | SR Custodian | In-app, email | TRJ_SR_FAILED |
| Deputation repatriation due | HR Admin, Authority, deputee | In-app, email | TRJ_REPATRIATION_DUE |
| Counselling turn upcoming `[v2]` | Candidate | In-app, SMS | TRJ_COUNSELLING_TURN |
| Order amended/cancelled/revoked | Affected parties | In-app, email | TRJ_ORDER_CORRECTED |

Notification preferences are user-configurable; statutory notifications (order/serve/relieve/join/hold) cannot be opted out.

---

## 12. Reporting & Analytics
| Report | Description | Audience |
|---|---|---|
| Transfer Register | All orders by type/class/status/office with served & dates | HR, Authority, Auditor |
| Service-of-Order Compliance `[v2]` | Orders by served/deemed/refused; relieve-by vs served date | Authority, Auditor |
| Relieving Pendency | Orders served but not relieved beyond SLA | HR Source, Authority |
| Clearance Bottleneck | Avg clearance time, SLA-breach & deemed-clearance rates by department | HR Admin, Accounts |
| In-Transit / Overdue + Custody `[v2]` | Employees in transit, elapsed vs admissible, custodian integrity exceptions | HR, Authority |
| Joining Compliance & Sequence `[v2]` | Joinings by transit-admissibility; late/abandoned; inter-se sequence | Authority, Auditor |
| Representation & Holds `[v2]` | Active/decided representations, stay-holds, abandonments | Authority, Auditor |
| Estate Retention `[v2]` | Quarter retentions, overstays, licence-fee recovery | Estate, Authority |
| SR/Outbox Health `[v2]` | Outbox PENDING/FAILED/DEAD_LETTERED; SR delivered | SR Custodian |
| Policy Override Audit `[v2]` | Un-overridden vs overridden violations (for 0% KPI) | Authority, Auditor |
| Drive / Counselling Progress | Per-drive funnel; counselling choice log export | HR Admin |
| Deputation Tenure | Active deputations, due/overdue repatriations | HR Admin, Authority |
| Vacancy & Strength (read-through) `[v2]` | Sanctioned vs filled vs reserved vs vacant by office/cadre, with freshness | Authority |

All reports respect row-level scope, are paginated, exportable (CSV/PDF), and feed M14.

---

## 13. Migration & Launch

### 13.1 Data migration
- Import historical transfer/relieving/joining records into `transfer_orders`/`relieving_orders`/`joining_reports` with a `legacy_ref` tag; statuses normalised to terminal (`JOINED`/`CANCELLED`).
- Backfill in-flight transfers into the correct live state (relieved-but-not-joined → `IN_TRANSIT`) **and assign an in-transit custodian** `[v2]`.
- **Backfill `served_on_date` from legacy service registers; where unknown, mark `DEEMED_SERVED` with a migration reason** `[v2]`.
- Seed `transfer_policy_rules` (incl. `JOINING_TIME_PAY`), `transfer_ban_periods`, office clearance-department configs, **clearance SLAs, joining-time distance bands**, order templates, and **`order_number_sequences` initialised to the legacy high-water mark per office/year (no gaps)** `[v2]`.
- Reconcile legacy SR entries with M12 via `sr_outbox` compensating events; no duplicates (idempotency key).

### 13.2 Cutover & launch
- Dual-run period: legacy + HRMS for one transfer cycle; reconcile counts and **custody/continuity invariants** `[v2]`.
- Phased rollout: pilot offices → cadre-wise → org-wide; bulk-drive & counselling features enabled after pilot sign-off.
- Go/No-Go gates: SR/outbox health ≥ 99.9% in pilot; **zero custody-integrity and zero un-overridden-violation exceptions** `[v2]`; UAT sign-off by Transfer Authority + SR Custodian.
- Rollback: feature-flag disable of write paths; **outbox drains before cutover**; backups verified (RPO ≤ 15min).

### 13.3 Training & support
- Role-based guides (employee self-service, clearance/estate officer, HR, authority, presiding officer).
- In-app contextual help on each wizard; SR/outbox reconciliation runbook; **forced-action & hold runbook for Authorities** `[v2]`.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix
| FR | Entities (primary) | APIs | Dependencies | SR/signal event |
|---|---|---|---|---|
| FR-TRJ-001 | transfer_requests | /requests* | M01, M13(sensitive), workflow, FR-002 | — |
| FR-TRJ-002 | policy_rules, ban_periods | /eligibility, /override | M01, M06(strength read-through), FR-001 | — |
| FR-TRJ-003 | drives, preferences, vacancy_positions, vacancy_reservations | /drives*, /preferences, /allot | M06, FR-002/004/005/019 | — |
| FR-TRJ-004 | transfer_orders, order_number_sequences | /orders* | M12, M13, workflow, FR-002/003/006/011/012/020 | TRANSFER_ORDERED |
| FR-TRJ-005 | drives, orders, vacancy_reservations | /drives/* | FR-002/003/004/019 | (per order) |
| FR-TRJ-006 | clearance_checklists/items | /clearance* | M10, M13, FR-004/008/016 | — |
| FR-TRJ-007 | charge_handovers | /charge-handover* | FR-006/008/010/016 | — |
| FR-TRJ-008 | relieving_orders | /relieving-order* | M10, M12, M13, FR-006/007/009/012/015/016 | RELIEVED, PAY_CONTINUITY, LPC |
| FR-TRJ-009 | transfer_orders (transit) | /in-transit, /extend | Calendar svc, FR-008/010/015/018 | — |
| FR-TRJ-010 | joining_reports, charge_handovers, vacancy_reservations | /joining-report* | M01, M10, M12, FR-008/009/011/012/015/018/021 | JOINED, POSTING_UPDATE, PAY_CONTINUITY |
| FR-TRJ-011 | deputation_records | /deputations* | FR-002/004/008/010 | — |
| FR-TRJ-012 | sr_outbox, service_register_events | /sr*, /sr-reconciliation, /sr-outbox/{id}/retry | M12/M10/M01, FR-004/008/010/015 | all |
| FR-TRJ-013 | transfer_orders + dependents | /amend, /cancel, /revoke | M01, M10, M12, FR-004/006/008/010/012/015 | compensating |
| FR-TRJ-014 | all M05 entities (read) | /analytics*, /map*(Phase-2) | M14 | — |
| FR-TRJ-015 | transfer_orders(custody/continuity), relieving/joining | /custody, /entitlement | M10, M12, FR-008/010/012/018 | PAY_CONTINUITY, ENTITLEMENT |
| FR-TRJ-016 | clearance_items, charge_handovers, relieving_orders | /deem-cleared, /under-protest, /deemed-relieve | FR-006/007/008 | — |
| FR-TRJ-017 | transfer_representations | /representations*, /holds | M13, FR-004/008/010 | — |
| FR-TRJ-018 | joining_reports, transfer_orders | /late-joining, /revert-to-source, /abandon | M09, M10, FR-009/010/012/015 | M09 trigger, pay status |
| FR-TRJ-019 | counselling_sessions, counselling_choices | /counselling-sessions* | FR-002/003/004 | — |
| FR-TRJ-020 | order_acknowledgements | /serve, /acknowledge, /deem-served | FR-004/008, M13 | — |
| FR-TRJ-021 | joining_reports (sequence) | /joining-sequence, /resequence | M06, FR-010 | M06 feed |
| FR-TRJ-022 | quarter_allotments | /quarter-retention, /record-vacation | M10, FR-006/008 | LICENCE_FEE_RECOVERY |

### 14.2 Dependency / build order `[v2 — representation elevated to baseline, map deferred]`
1. **Foundation:** entity migrations; policy/ban/SLA/distance-band seed; **`order_number_sequences` seed**; order templates; **calendar service contract** wired.
2. **FR-TRJ-012** (`sr_outbox` — frozen contract) — prerequisite for all side effects.
3. **FR-TRJ-002** (eligibility, strength read-through) — prerequisite for 001/003/004.
4. **FR-TRJ-001** (request intake, sensitive docs).
5. **FR-TRJ-004** (orders, gapless numbering) + **FR-TRJ-020** (proof-of-service) → **FR-TRJ-006** (clearance + SLA), **FR-TRJ-007** (handover), **FR-TRJ-016** (forced actions).
6. **FR-TRJ-008** (relieving + pay-continuity) + **FR-TRJ-015** (service continuity & custody) → **FR-TRJ-009** (transit, calendar) → **FR-TRJ-010** (joining) + **FR-TRJ-021** (joining-sequence) + **FR-TRJ-018** (abandonment).
7. **FR-TRJ-017** (representation/stay-hold) — **baseline**, layered across order lifecycle.
8. **FR-TRJ-003/005/019** (counselling/drives) on 002/004.
9. **FR-TRJ-011** (deputation), **FR-TRJ-022** (estate), **FR-TRJ-013** (corrections), **FR-TRJ-014 analytics** (baseline) — **map view deferred to Phase-2**.

### 14.3 Parallel-agent plan `[v2 — single state-service owner]`
| Agent | Owns FRs | Shared contracts to honour |
|---|---|---|
| Agent A (Intake & Policy) | FR-TRJ-001, 002 | request/eligibility API + canonical enums; strength read-through client |
| Agent B (Orders, Numbering, Service, Drives, Counselling) | FR-TRJ-003, 004, 005, 019, 020 | order entity, **`order_number_sequences`**, `order_acknowledgements`, `vacancy_reservations`, `sr_outbox` writer |
| Agent C (Relieving, Clearance, Handover, Forced-Action) | FR-TRJ-006, 007, 008, 016, 022 | clearance/handover/relieving/quarter entities, M10 signal client (**consumes `TransferOrderStateService`, does not write status**) |
| Agent D (Transit, Joining, Continuity, Sequence, Abandonment) | FR-TRJ-009, 010, 015, 018, 021 | M01 client, M10 pay-continuity, calendar client, joining-sequence feed (**consumes `TransferOrderStateService`**) |
| Agent E (SR/Outbox, Deputation, Corrections, Representation, Analytics) | FR-TRJ-011, 012, 013, 017, 014 | `sr_outbox`, reversal orchestrator, representation/hold, read models |
| **Shared service (owned by Agent B, consumed by C/D/E)** | **`TransferOrderStateService`** | **Sole writer of `transfer_orders.status`** — eliminates the v1 shared-write conflict (Risk 5) |

Shared interface contracts (entities §5, error catalog §8.2, state tables §10, `sr_outbox` §5.2.15, `TransferOrderStateService` §16.6) are frozen before parallel work.

### 14.4 Final Reconciliation Table (0 unresolved gaps)
| Concern | Required | Provided | Status |
|---|---|---|---|
| All 16 sections present | Yes | §1–§16 (+§1A Amendments) | RESOLVED |
| 10–22 FRs each full structure + LLD | Yes | **22 FRs** §6 | RESOLVED |
| Module entities w/ fields + samples | Yes | **21 module entities** §5.2/§5.7 | RESOLVED |
| Shared entities reused not redefined | Yes | §5.4 references M01/M06/M09/M10/M12/M13/platform | RESOLVED |
| **Pay continuity (R1)** | Yes | FR-015; §5.6-11; pay-continuity signal | RESOLVED |
| **In-transit custody (R2)** | Yes | FR-015; §5.6-12; `in_transit_custody_org_unit_id` | RESOLVED |
| **M10 entitlement signal (R1/R9)** | Yes | FR-015; §8.3; `entitlement_ref` | RESOLVED |
| **Forced-action power (R3)** | Yes | FR-016; FR-006/007/008 | RESOLVED |
| **Deemed/escalation clearance (R3)** | Yes | FR-006; §10.2 | RESOLVED |
| **Representation/stay-hold (R4)** | Yes | FR-017; `STAY_HOLD`; `transfer_representations` | RESOLVED |
| **Abandonment path (R4)** | Yes | FR-018; `ABANDONED`/`REVERTED_TO_SOURCE` | RESOLVED |
| **Outbox field-spec (R5)** | Yes | §5.2.15; FR-012; idempotency formula | RESOLVED |
| **Single state-service (R5)** | Yes | §14.3; §16.6 | RESOLVED |
| **Vacancy lifecycle (R6)** | Yes | `vacancy_reservations`; §5.6-6; §10.5 | RESOLVED |
| **Strength read-through (R7)** | Yes | §5.2.7; §5.4; §5.6-13 | RESOLVED |
| **order_class / reframed §5.6-1 (R8)** | Yes | §5.2.2; §5.5; §5.6-1 | RESOLVED |
| **Calendar contract + distance bands (R10)** | Yes | §8.3; FR-009; §16.4 | RESOLVED |
| **Joining-sequence seniority (R11)** | Yes | FR-021; §5.6-14 | RESOLVED |
| **Proof-of-service (R12)** | Yes | FR-020; §5.6-15 | RESOLVED |
| **Gapless numbering (R13)** | Yes | FR-004; `order_number_sequences`; §5.6-17 | RESOLVED |
| **Mutual coupling relieve/join (R14)** | Yes | §5.6-5; FR-008/010; `mutual_pair_order_id` | RESOLVED |
| **Interactive counselling (clash)** | Yes | FR-019; `counselling_sessions`/`choices` | RESOLVED |
| **Sensitive docs ring-fence (R15)** | Yes | §9.x; §5.2.1; M13 sensitive class | RESOLVED |
| **Quarters/estate sub-process (R16)** | Yes | FR-022; `quarter_allotments` | RESOLVED |
| **Enum taxonomy (R17)** | Yes | §5.5 canonical taxonomy | RESOLVED |
| **Acceptance tests new invariants** | Yes | §16.8 | RESOLVED |
| **Domain Primer (clarity)** | Yes | §16.9; §15 | RESOLVED |
| **Map re-prioritised (R18)** | Yes | FR-014 Phase-2; §14.2 | RESOLVED |
| Error catalog + JSON examples | Yes | §8.2/§8.4 | RESOLVED |
| State tables | Yes | §10.1–§10.7 | RESOLVED |
| Notifications, Reporting, Migration | Yes | §11/§12/§13 | RESOLVED |
| Glossary, Appendices | Yes | §15/§16 | RESOLVED |
| Unresolved gaps | 0 | 0 | RESOLVED |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Transfer order | Sanctioned, numbered (gapless) statutory document moving an employee from source to destination office. |
| Order class | Classification of an order: `SUBSTANTIVE`, `ADDITIONAL_CHARGE`, `DEPUTATION`, `REPATRIATION`; only one substantive transition may be active per employee. |
| Proof-of-service | Recorded service of the order on the employee (channel + date) on which relieve-by deadlines rest. |
| Relieving | Formal release of an employee from the source office after clearance and handover (or deemed action). |
| No-dues / clearance | Departmental certification (configured departments) that no dues/assets are outstanding; may be cleared, with-dues, waived, or deemed-cleared. |
| Deemed clearance | Authority-granted clearance after SLA + escalation when an officer is non-responsive. |
| Charge handover/assumption | Transfer of duties, records, assets and cash from relinquishing to receiving officer; may be under protest. |
| Last Working Day (LWD) | Final day of duty at source; basis for transit computation (pay is continued, not stopped). |
| Forenoon / Afternoon (FN/AN) relieving | Whether the day counts as source duty or transit — load-bearing for pay and seniority (§16.9). |
| In-transit custody | The single office owning pay/attendance/headcount/discipline of an employee during `IN_TRANSIT`. |
| Service continuity | Treatment of the transit/joining-time period as continuous paid service with no break in qualifying service. |
| Joining time | Statutorily admissible working days (by distance band, contracted calendar) allowed to travel and join — paid. |
| Joining report | Document by which a transferee reports and assumes duty at destination, fixing the joining date. |
| Joining sequence | Inter-se order among same-cadre/post joiners on a date; sets seniority consumed by M06. |
| Representation / stay-order / retention hold | A filing that pauses an order (`STAY_HOLD`) pre-join. |
| Abandonment | Non-joining beyond grace; breaks continuity and triggers M09. |
| Transit period | Time between LWD and joining date; bounded by admissible joining time; paid. |
| Mutual transfer | Reciprocal exchange of two employees; coupled through approval, relieving and joining. |
| Deputation / Repatriation | Temporary posting to a borrowing org with defined tenure / return to lending org. |
| Ban/freeze period (MCC) | Window (e.g. election Model Code of Conduct) during which transfers are restricted. |
| Sanctioned strength | Authorised number of posts (owned by M06/M01; read-through by M05). |
| LPC | Last Pay Certificate issued by source payroll on relieving. |
| Imprest / DDO charge | Standing cash advance held by an officer / Drawing-and-Disbursing-Officer responsibilities handed over. |
| Licence fee | Rent for official accommodation; penal rate applies on overstay. |
| SR event | Append-only entry in the Digital Service Register (M12), posted via `sr_outbox`. |
| Outbox | Transactional outbox guaranteeing idempotent external-signal delivery (SR/M10/M01). |
| Counselling | Preference- or live-session-based allotment in a transfer drive. |
| Cadre / Officiating | Service group/stream / holding a higher post on an acting basis. |

## 16. Appendices

### 16.1 Sequence (happy path, narrative) `[v2]`
Request → eligibility pass (strength read-through) → recommend → Authority approve → **reserve-then-commit gapless order_no** + PDF → publish (SR TRANSFER_ORDERED via outbox, clearance created) → **serve order on employee + acknowledgement** → departments clear (SLA-bounded; deemed if needed) → handover accepted (or under-protest) → relieving order + LWD (**pay-continuity** + LPC, SR RELIEVED asserting no break, **custodian set**, reservation vacated) → IN_TRANSIT (paid joining-time clock, contracted calendar) → report at destination → charge assumption → confirm joining (**reservation re-check + fill**, pay-continuity resumes, M01 update, **joining-sequence assigned**, SR JOINED) — with representation/stay-holds and abandonment as first-class branches.

### 16.2 Office clearance-department default config
IT, LIBRARY, ACCOUNTS, STORES, ADVANCES, ESTATE_QUARTERS, HR — **configurable per office; an office may configure fewer (only configured departments generate items; zero departments → checklist auto-CLEARED)**; an office may add `OTHER` named departments.

### 16.3 Outbox & idempotency note `[v2]`
External signals (M10 pay-continuity/entitlement/LPC/licence-fee, M12 SR, M01 posting, M09 trigger) are written to `sr_outbox` (§5.2.15) in the same DB transaction as the local state change and dispatched asynchronously. **Idempotency key formula:** `{target_system}:{event_type}:{aggregate_type}:{aggregate_id}:{revision_no}`. Backoff is exponential to `max_attempts` (default 8); exhausted rows are `DEAD_LETTERED` (retained ≥ 180 days) and surfaced in the SR Reconciliation Console (FR-TRJ-012).

### 16.4 Joining-time by distance band `[v2]`
Joining time is computed from `joining_distance_band` against the **contracted Platform Calendar Service** (regional working days), not a flat `joining_time_days`. Seeded defaults (System-Administrator-configurable):
| Band | Indicative distance | Default joining time (working days) |
|---|---|---|
| LOCAL | same station | 0 |
| SHORT | < 200 km | 3 |
| MEDIUM | 200–500 km | 5 |
| LONG | 500–1000 km | 7 |
| OUTSTATION | > 1000 km / external | 10 + travel |

### 16.5 Open configuration parameters
Minimum-tenure months, near-retirement window, cooling period, **joining-time distance bands**, **clearance SLA hours + escalation tiers per department**, **dispute-resolution SLA**, **deemed-action policy**, deputation max tenure, drive preference window, **counselling turn timeout**, **order-number prefix templates per office**, **licence-fee normal/penal rates & permissible retention months**, **late-joining grace** — all System-Administrator-configurable with seeded defaults.

### 16.6 `TransferOrderStateService` contract `[v2]`
The **sole writer** of `transfer_orders.status`. Exposes guarded transition methods (`approve`, `publish`, `serve`, `hold`, `vacateHold`, `startRelieving`, `relieve`, `enterTransit`, `confirmJoining`, `revertToSource`, `abandon`, `amend`, `cancel`, `revoke`), each validating the §10.1 guards (incl. hold supremacy 5.6-16, served precedence 5.6-15, custody 5.6-12, mutual coupling 5.6-5) and writing `audit_log`. Agents C/D/E consume it; none writes the column directly — eliminating the v1 multi-writer conflict (Risk 5).

### 16.7 Gapless statutory numbering `[v2]`
Numbers are issued via **reserve-then-commit** on `order_number_sequences` (row-locked per `scope`/`office`/`fiscal_year`): (1) reserve `next_value` inside the order transaction; (2) on successful PDF render + commit, advance `next_value`; (3) on failure, the reserved value is **voided with an explicit audit row** so a gap-audit report shows zero unexplained gaps. Never "retry sequence on collision".

### 16.8 Acceptance tests for new invariants `[v2]`
| AT | Invariant | Oracle |
|---|---|---|
| AT-PAY-CONTINUITY | Relieve→join produces **no pay gap** | M10 receives one `PAY_CONTINUITY` (no `PAY_STOP`); no unpaid interval between LWD and joining_date |
| AT-CUSTODY | No dual/zero posting | While `IN_TRANSIT`, exactly one `in_transit_custody_org_unit_id`; headcount counts once; null/two → `TRJ_DUAL_POSTING_BLOCKED` |
| AT-ENTITLEMENT | Entitlement keyed by type+ground | Own-request vs administrative produce different `ENTITLEMENT` payloads |
| AT-DEEMED-CLEAR | Forced-action audit | `DEEMED_CLEARED` requires SLA+escalation exhausted, reason+actor recorded, queryable |
| AT-DEEMED-RELIEF | Deemed-relief unblocks | Relieving issuable with `deemed_relief=true` + reason; precondition 5.6-2 satisfied |
| AT-MUTUAL | Mutual coupling | Asymmetric completion blocked (`TRJ_MUTUAL_PAIR_BLOCKED`) at relieve/join |
| AT-SERVED | Served-date precedence | Relieving blocked without service (`TRJ_ORDER_NOT_SERVED`); relieve_by from served date |
| AT-GAPLESS | Gapless numbering under concurrency | 1000 concurrent orders → contiguous numbers, zero gaps/dups; voided reservations audited |
| AT-VACANCY | Join-time re-check | Cascading-vacancy double-fill blocked at join (`TRJ_VACANCY_FULL`) |
| AT-HOLD | Hold supremacy | Active `STAY_HOLD` blocks all forward transitions (`TRJ_STAY_HOLD_ACTIVE`) |
| AT-ABANDON | Continuity break recorded | `ABANDONED` sets `service_continuity_asserted=false` + M09 trigger + defined pay status |
| AT-SEQUENCE | Inter-se determinism | Same-date same-post joiners get distinct contiguous sequence by reported_date→FN/AN→service_no |
| AT-OVERRIDE | Un-overridden-violation KPI | Valid overrides NOT flagged as violations; un-overridden violations = 0 |
| AT-COUNSELLING | Single live turn | Out-of-turn choice → `TRJ_COUNSELLING_TURN_VIOLATION`; choice log immutable |
| AT-SENSITIVE | Sensitive-doc access logging | Every read of a sensitive-ground document writes an access-log row |
| AT-OUTBOX | Idempotent delivery | Duplicate dispatch deduped by key; dead-letter after max_attempts; reconciliation surfaces it |
| AT-LICENCE-FEE | Estate recovery | Overstay flips penal rate + emits `LICENCE_FEE_RECOVERY` to M10 |

### 16.9 Domain Primer `[v2]`
For implementers without Indian government HR background:
- **LPC (Last Pay Certificate):** statement from source payroll certifying pay drawn up to LWD; the destination needs it to start/continue salary correctly. M05 *requests* it; M10 *issues* it.
- **No-dues / clearance:** each department (IT, Library, Accounts, Stores, Advances, Estate) certifies the employee owes nothing (no unreturned laptop, books, advances, stores, accommodation). Required before relieving.
- **Imprest / DDO charge:** an **imprest** is a standing petty-cash advance an officer holds; a **DDO (Drawing & Disbursing Officer)** is responsible for drawing and disbursing government money. On transfer these must be reconciled and handed over.
- **MCC (Model Code of Conduct):** during elections, a ban window freezes transfers (a `transfer_ban_period`).
- **Cadre:** a defined service group/stream (e.g. Teaching, Ministerial); transfer drives are run cadre-wise.
- **Officiating:** holding a higher post on an acting basis pending regular promotion.
- **Forenoon / Afternoon (FN/AN) relieving — *why it matters*:** an employee relieved in the **forenoon** is treated as **not on duty at source that day** (the day counts toward transit), whereas **afternoon** relieving counts the day as **source duty**. This one bit therefore shifts the LWD/transit boundary, which affects **pay** (which office pays that day) and **seniority/joining-time** computation. It is load-bearing, not cosmetic — hence an explicit enum and acceptance coverage.
- **Deputation / Repatriation:** lending an employee to a borrowing organisation for a fixed tenure (deputation) and bringing them back (repatriation); modelled as co-existing `DEPUTATION`/`REPATRIATION` order classes.
- **Transit / joining time:** the paid period to travel and join; not unpaid dead time (a core v2 correction).

---
*End of M05-TRJ BRD v2.0*






