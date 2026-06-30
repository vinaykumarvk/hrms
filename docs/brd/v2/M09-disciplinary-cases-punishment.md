# Employee Disciplinary Cases and Punishment Management — HRMS Module BRD (v2.0)

**Module code:** M09-DCP
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite")
**Document version:** v2.0 (revised; supersedes v1.0)
**Status:** Baseline for build — legality layer hardened per Council Report
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM) layered on public-sector statutory due-process (CCS (CCA) Rules 1965, Article 311 of the Constitution, CVC/UPSC consultation regime, CCS (Pension) Rule 9, POSH Act 2013).
**Shared contract:** This BRD consumes and does **not** redefine the canonical entities, roles, conventions, and technical defaults in [`SHARED_FOUNDATION.md`](../SHARED_FOUNDATION.md).
**Revision basis:** Adversarial Council Report `/Users/n15318/hrms/docs/evaluation/M09-disciplinary-cases-punishment-council.md` — all 24 Adopted Improvements and every High/Critical Risk Register item incorporated (see §1.6 Amendments).

---

## 1. Executive Summary

### 1.1 Purpose

The Employee Disciplinary Cases and Punishment Management module (**M09-DCP**) digitises the **end-to-end disciplinary lifecycle** of a public-sector / government employer, from the first receipt of a complaint or detection of misconduct through preliminary inquiry, optional suspension, framing of articles of charge, departmental inquiry, penalty imposition, and statutory appeal / revision / review — concluding with an immutable posting of the outcome (punishment **or** exoneration) into the Digital Service Register (M12).

The module exists to guarantee that **every** disciplinary proceeding satisfies the **principles of natural justice** (audi alteram partem — the right to be heard; nemo judex in causa sua — no one a judge in their own cause), is conducted by an **authority competent to impose the penalty**, observes **mandatory external consultation** (UPSC/CVC/ICC) where the regime requires it, respects **statutory timelines** (with lawful clock-pauses), preserves a **cryptographically tamper-evident audit trail**, and produces **legally and digitally signed** orders that withstand departmental appeal and judicial review.

### 1.2 Business context

Disciplinary action against a government servant is a **quasi-judicial** process. A procedural defect — a denied opportunity to defend, an inquiry officer who is also a witness, a charge-sheet served after a barred period, a penalty exceeding what was proposed in the show-cause, **an order signed by an authority not competent to impose it (Article 311(1)), or a final order passed without mandatory UPSC/CVC consultation** — routinely results in penalty orders being set aside on appeal or by tribunals/courts, with consequential financial liability (back-wages, restoration of seniority, pension re-computation). Today these cases are run on paper files that are slow, opaque, prone to loss, and impossible to audit at scale.

M09-DCP converts this risk-laden manual process into a **controlled, time-bound, fully audited, two-layer workflow** — an **invariant natural-justice kernel** (charge → genuine opportunity to defend → reasoned finding on evidence → proportionate penalty within what was proposed, by a competent authority → independent appeal) wrapped in a **configurable jurisdiction overlay** (`procedure_template`: required consultations, authority-competence matrix, statutory timelines, valid service modes, appeal limitation, dispense-with-inquiry conditions). Seed reference data ships the CCS(CCA) regime as the default; a corporate code of conduct or a foreign-subsidiary regime is simply a different template.

### 1.3 Module objectives

| # | Objective | Measure of success |
|---|-----------|--------------------|
| O1 | Enforce due process and natural justice at every transition | 100% of penalty orders carry a complete, sequential, hash-chained audit chain; 0 stage-skips |
| O2 | Track statutory and internal SLAs per stage with lawful pause/resume | Real-time SLA dashboard; escalation on breach; ≥ 95% of stages closed within SLA; 0 false breaches on stayed/remitted cases |
| O3 | Guarantee confidentiality and integrity of case records | Field-level RBAC, sealed evidence vault, cryptographically chained immutable audit on every action |
| O4 | Produce legally defensible, competently-signed orders | Each penalty order traces to valid legal service, recorded defence, inquiry finding (or lawful dispensation), show-cause (major), **competent authority**, **completed mandatory consultation**, **proportionality reasoning**, and a **DSC/eSign signature** |
| O5 | Propagate outcomes to dependent modules accurately and idempotently | Penalty/exoneration posted exactly-once to M12 SR; effects flowed to M06/M10/M11; 0 duplicate downstream effects |
| O6 | Provide case analytics, vigilance oversight & proportionality review | Caseload, ageing, penalty-mix, appeal-overturn, vigilance-clearance, and penalty-proportionality-outlier dashboards |
| O7 | Serve a configurable, global + public-sector mandate | Same engine runs CCS(CCA), POSH/ICC, and corporate templates by swapping overlay reference data — no code fork |

### 1.4 Scope summary

In scope: complaint intake, preliminary inquiry, suspension & subsistence allowance (with non-employment-certificate gate and Ajay-Kumar-Choudhary deemed review), charge-sheet (articles of charge / statement of imputations), statement of defence, **document/witness list supply and inspection**, appointment of Inquiry Officer (IO) & Presenting Officer (PO), **POSH Internal Committee route**, conduct of departmental inquiry (witnesses, exhibits, daily order sheets, ex-parte, **criminal-parallel STAY**), **lawful dispense-with-inquiry path**, inquiry report & findings, disagreement memo, **mandatory external consultation (UPSC/CVC/ICC/legal)**, **authority-competence verification**, minor/major penalty determination, show-cause on proposed penalty, **personal hearing**, penalty order & exoneration (**with proportionality reasoning, recovery caps, and digital signing**), appeal / revision / review, SR posting and downstream effects (idempotent), evidence vault, integrity register, vigilance clearance, **mid-proceeding jurisdiction transfer / sealed-cover / retiree proceedings**, **abatement on death**, SLA tracking with **pause/resume**, **court-grade hash-chained audit**, **procedure-template configuration**, and analytics.

Out of scope (owned elsewhere, integrated here): the SR ledger itself (M12), payroll execution of recoveries/subsistence (M10), pension re-computation engine (M11), seniority list recomputation (M06), the physical document store (M13), identity/SSO and the DSC/eSign trust service (platform), and external court/police case systems (reference-linked only).

### 1.5 Key outcomes

A complete, confidential, time-bound, audit-grade, **competence- and consultation-gated**, **digitally signed** disciplinary case system, configurable across jurisdictions, that an enterprise/government HR organisation can rely on for **defensible** penalty orders that withstand judicial review, **transparent** ageing, and **accurate, exactly-once** downstream propagation of consequences.

### 1.6 Amendments (v1 → v2)

The following table maps **every** Council "Adopted Improvement for BRD v2" (and the High/Critical Risk it mitigates) to where and how it is incorporated. AI = Adopted Improvement number; R = Risk Register id.

| AI / R | Improvement | Severity | Incorporated in v2 (where / how) |
|---|---|---|---|
| AI-1 / R1 | `authority_competence` reference entity + DI-13 penalty-competence guard; error `AUTHORITY_NOT_COMPETENT` (Art. 311(1)) | Critical | New entity **E23 `authority_competence`** (§5.2); **DI-13** (§5.6); **FR-M09-018** (competence matrix + finalise-time guard); error code §10.3; state guard §12.4 |
| AI-2 / R2 | `case_consultations` entity + DI-14; finalise blocked until required consultations closed; error `CONSULTATION_PENDING` (UPSC/CVC) | Critical | New entity **E24 `case_consultations`** (§5.2); **DI-14** (§5.6); **FR-M09-019**; error §10.3; gate in FR-011 finalise |
| AI-3 / R3 | Lawful "dispense-with-inquiry" path (`inquiry_dispensations`, reason-coded) — Art. 311(2) provisos | High | New entity **E25 `inquiry_dispensations`** (§5.2); **DI-23** (§5.6); **FR-M09-020**; satisfies DI-3 major branch via documented exception |
| AI-4 / R4 | Document/witness list supplied + inspection afforded right; inquiry cannot proceed to evidence without it | High | Fields on `inquiry_proceedings` (`list_supplied_date`, `inspection_afforded_date`); **DI-24** (§5.6); amended **FR-M09-007**; error `INSPECTION_NOT_AFFORDED` |
| AI-5 / R5 | Separate `legal_service` record from informational `notifications`; valid `service_mode` per template; EMAIL non-statutory by default | High | New entity **E26 `legal_service_records`** (§5.2); **DI-15** (§5.6); **FR-M09-021**; valid modes carried on `procedure_templates` |
| AI-6 / R6 | Subsistence: `non_employment_certificate_received` gate; deemed-review / auto-flag on 90-day charge-memo lapse (Ajay Kumar Choudhary) | High | Fields on `suspensions` (`non_employment_certificate_received`, `nec_received_date`, `charge_memo_due_date`, `deemed_review_flag`); **DI-16** (§5.6); amended **FR-M09-003** |
| AI-7 / R7 | Common/joint proceedings — `case_respondents` (1..N) sharing inquiry/evidence; per-respondent article findings | High | New entity **E27 `case_respondents`** (§5.2); **DI-25** (§5.6); **FR-M09-022**; `charge_articles` finding moved to per-respondent grain |
| AI-8 / R8 | Two-layer model: `procedure_template` overlay (consultations, competence ref, timelines, service modes, limitation, dispensation); kernel invariant | High | New entity **E22 `procedure_templates`** (§5.2); **DI-17** (§5.6); **FR-M09-017**; `procedure_template_id` on `disciplinary_cases` |
| AI-9 / R9 | Suspension = parallel interim status, not a linear stage; remove SUSPENSION from §12.1 | Medium | `disciplinary_cases.is_under_suspension`/`suspension_status` flag; **SUSPENSION removed from linear `case_stage`** (§5.5, §12.1); orthogonal track §12.7 |
| AI-10 / R10 | `sla_pause_events` ledger + recompute `expected_closure_date`/`sla_target_at` on stay/remit/condonation/consultation/criminal-stay | Medium | New entity **E28 `sla_pause_events`** (§5.2); **DI-18** (§5.6); **FR-M09-024**; amended FR-016 |
| AI-11 / R11 | Idempotency-key lifecycle (mint, dedup store, TTL); double-finalise / double post-to-SR ⇒ exactly one effect | Medium | New entity **E30 `idempotency_keys`** (§5.2); **DI-19** (§5.6); §10.1 lifecycle; amended **FR-M09-013**; error `IDEMPOTENCY_CONFLICT` |
| AI-12 / R12 | Mandatory `proportionality_reasoning` on `penalty_orders` + analytics outlier flag | Medium | Field on **E16** (§5.2); **DI-20** (§5.6); amended **FR-M09-011** + **FR-M09-016**; error `PROPORTIONALITY_REASONING_REQUIRED` |
| AI-13 / R13 | Mid-proceeding jurisdiction transfer (re-resolve DA), sealed-cover promotion freeze, Rule 9 four-year-bar + sanction for retirees | Medium | `case_jurisdiction_transfer` timeline event + fields; **DI-27** (§5.6); **FR-M09-026**; sealed-cover flag feeds M06 |
| AI-14 / R14 | Abatement terminal handling: `order_type=ABATED`, `case_status=ABATED`; auto-stop SLA + suppress effects on death | Low/Med | Enum extensions (§5.5); **DI-26** (§5.6); **FR-M09-028**; state §12.1 |
| AI-15 / R15 | Court-grade hash-chained `audit_log`/`case_timeline_events` (prev-hash linkage) + verify endpoint | Medium | `row_hash`/`prev_hash` on **E19** (§5.2); **DI-21** (§5.6); **FR-M09-027**; verify API §10 |
| AI-16 / R16 | POSH/ICC procedure template for HARASSMENT — Internal Committee composition/timelines feeding penalty stage | High | `procedure_templates` ICC variant; `inquiry_appointments` ICC roles; **FR-M09-023**; error `ICC_PROCEDURE_REQUIRED` |
| AI-17 / R17 | DSC/eSign with trusted timestamp + bound signatory identity on charge-sheets, reports, notices, orders | Medium | Signature fields on `penalty_orders`/`legal_service_records`/`case_documents`; **DI-28** (§5.6); **FR-M09-021**; error `SIGNATURE_REQUIRED` |
| AI-18 / R18 | Inquiry `STAYED` sub-state + auto SLA pause when parallel criminal trial active | Medium | `inquiry_status=STAYED` (§5.5); fields on `inquiry_proceedings`; amended **FR-M09-007**; pause reason `CRIMINAL_STAY` (FR-024) |
| AI-19 / R19 | Charged-Officer Portal → rights-and-deadlines surface (entitlements + limitation countdown) | Low | Amended **FR-M09-005** UI; §7.1 portal redesign; §7.3 rights panel |
| AI-20 / R20 | Recovery-penalty caps (≤1/3 pay, instalments, not beyond retirement except DCRG) validated pre-emit | Medium | **DI-22** (§5.6); amended **FR-M09-011**; error `RECOVERY_CAP_EXCEEDED` |
| AI-21 | Personal-hearing record for show-cause and appeal stages | — | New entity **E29 `personal_hearings`** (§5.2); **DI-29** (§5.6); **FR-M09-025**; amended FR-010/FR-012 |
| AI-22 | Fast-lane UI path (≈4 screens) for minor/admitted/single-respondent — same integrity rules | — | §7.4 Fast-lane; reuses all DI rules & audit chain (UI altitude only) |
| AI-23 | Extend DI-2: DA cannot also be complainant or witness (nemo judex in causa sua) | — | **DI-2** extended (§5.6); checked in FR-001/FR-006/FR-018 |
| AI-24 | Disclose adverse PI material when relied upon as evidence; served/relied-upon flag | — | **DI-9** extended (§5.6); amended **FR-M09-002**/**FR-M09-007**; `relied_upon`/`disclosed` flags on `inquiry_exhibits` |

**Net deltas:** FRs 16 → **28** (added FR-017…FR-028); module entities 21 → **30** (added E22…E30); integrity rules DI-1…DI-12 → **DI-1…DI-29**; module error codes 14 → **30**; state tables 6 → **9**; sample data and Final Reconciliation updated to **0 gaps**.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Area | Feature | FR(s) |
|------|---------|-------|
| Intake | Complaint / source-of-misconduct registration & triage | FR-M09-001 |
| Fact-finding | Preliminary (fact-finding) inquiry (+ adverse-material disclosure) | FR-M09-002 |
| Interim action | Suspension (parallel status), revocation, subsistence + NEC gate, deemed review | FR-M09-003 |
| Charge | Charge-sheet / articles of charge / statement of imputations | FR-M09-004 |
| Defence | Employee's written statement of defence; admission/denial; rights surface | FR-M09-005 |
| Inquiry setup | Appointment of Inquiry Officer & Presenting Officer | FR-M09-006 |
| Inquiry conduct | Hearings, witnesses, exhibits, daily order sheets, ex-parte, inspection right, STAY | FR-M09-007 |
| Inquiry close | Inquiry report & findings (proved / not proved) | FR-M09-008 |
| DA consideration | Disagreement memo & disciplinary authority decision | FR-M09-009 |
| Natural justice | Show-cause on proposed penalty (major penalty / enhancement) | FR-M09-010 |
| Outcome | Penalty order (minor/major) & exoneration; proportionality; recovery caps | FR-M09-011 |
| Remedies | Appeal / revision / review | FR-M09-012 |
| Propagation | SR posting & downstream effects (M06/M10/M11/M12) — idempotent | FR-M09-013 |
| Records | Document evidence vault (link to M13) | FR-M09-014 |
| Oversight | Integrity register & vigilance clearance status | FR-M09-015 |
| Governance | SLA / statutory-timeline tracking & case analytics | FR-M09-016 |
| Configuration | Procedure-template & jurisdiction overlay (two-layer model) | FR-M09-017 |
| Legality | Authority-competence matrix & finalise-time competence guard | FR-M09-018 |
| Legality | Statutory consultation management (UPSC/CVC/ICC/legal) | FR-M09-019 |
| Legality | Dispense-with-inquiry (Article 311(2) provisos) | FR-M09-020 |
| Legality | Legal service of documents & digital signing (DSC/eSign) | FR-M09-021 |
| Scale | Common/joint (multi-respondent) proceedings | FR-M09-022 |
| Compliance | POSH / Internal Committee procedure | FR-M09-023 |
| Governance | SLA pause/resume & clock management | FR-M09-024 |
| Natural justice | Personal hearing record (show-cause / appeal) | FR-M09-025 |
| Lifecycle | Mid-proceeding jurisdiction transfer, sealed cover & retiree proceedings | FR-M09-026 |
| Integrity | Court-grade hash-chained audit & verification | FR-M09-027 |
| Lifecycle | Abatement on death / terminal handling | FR-M09-028 |

### 2.2 Common Capabilities (inherited, applied module-wide)

- **Maker-checker / workflow engine** (`workflow_instances` / `workflow_tasks`) for every stage transition that changes statutory state.
- **Segregation of duties (extended):** maker ≠ checker; the Disciplinary Authority (DA), Inquiry Officer (IO), Presenting Officer (PO), and any witness must be **mutually distinct** persons; **the DA may not also be the complainant or a witness** (DI-2, nemo judex in causa sua); no self-approval.
- **Two-layer procedure model:** an invariant natural-justice **kernel** plus a configurable **`procedure_template`** overlay; the kernel is never parameterised away (DI-17).
- **Competence & consultation gating:** finalise is blocked unless the signing authority is competent for the penalty class (DI-13) and all template-required consultations are closed (DI-14).
- **Cryptographically tamper-evident audit** (`audit_log` + hash-chained `case_timeline_events`) on every create/update/transition/view-of-sealed-record (DI-21).
- **Legal service ≠ notification:** statutory service is recorded in `legal_service_records` with proof; the `notifications` ledger is informational only (DI-15).
- **Digital signing:** statutory artefacts carry DSC/eSign signature metadata (DI-28).
- **Document handling** via M13 (`documents`) — versioned, encrypted, access-controlled objects referenced by metadata.
- **Notifications** via shared `notifications` ledger (in-app + email + optional SMS).
- **Idempotency:** state-changing propagating posts are deduplicated through `idempotency_keys` with a defined TTL (DI-19).
- **Pagination** on all list endpoints (page/limit, hard max 100).
- **Localisation:** UTC storage, `DD-MMM-YYYY` display, INR money formatting.
- **RBAC + row-level org scoping**, extended in §3 with field-level confidentiality controls.

### 2.3 Boundaries & integration points

| Boundary | Direction | Contract |
|----------|-----------|----------|
| M01-EPM (employees) | read | Charged employee(s), complainant, IO/PO identity, designation, cadre, org_unit, employment_status |
| M05-TRJ (transfers) | read (event) | Mid-proceeding transfer triggers jurisdiction re-resolution (FR-026) |
| M06-PPP | write (event) + read | Reduction in rank, withholding of promotion, seniority re-fixation; **sealed-cover** promotion freeze |
| M10-PAY | write (event) | Suspension → subsistence (NEC-gated); recovery (capped); pay reduction; promotion/increment withholding |
| M11-PEN | write (event) | Pension cut/withholding; effect of removal/dismissal/CR; retiree-proceeding flags; Rule 9 |
| M12-SR (service_register_events) | write (append-only, idempotent) | Suspension, penalty, exoneration, appeal outcome, abatement events |
| M13-DMS | read/write | Evidence vault objects, charge-sheet/order PDFs (DSC-signed) |
| M14-DAS | read | KPI feed incl. proportionality-outlier dashboard |
| Platform DSC/eSign trust service | call | Sign + verify trusted timestamp and signatory identity binding |
| Platform | read | Auth/SSO/MFA, roles, org tree |

### 2.4 Explicit non-goals

- M09 does **not** compute payroll, pension, or seniority figures; it emits **events** that the owning module executes.
- M09 does **not** store document binaries; it stores references to M13 objects.
- M09 does **not** operate the DSC/eSign Certifying Authority; it calls the platform trust service and stores returned signature metadata.
- Criminal prosecution case management (police/court FIR tracking) is **linked** (reference fields) and can **STAY** an inquiry, but is not executed here.
- M09 is **not** a generic BPM designer; configurability is **capped** at the named overlay items in `procedure_templates` (DI-17).

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict)

| Role | Description | Source |
|------|-------------|--------|
| Employee (Charged Officer / Respondent) | The government servant facing proceedings; restricted self-service view of own case + rights/deadlines surface | Shared |
| Complainant / Reporting Source | Raises a complaint; limited view of own complaint status | Shared (Employee/Manager) |
| Vigilance Officer | Screens complaints, maintains integrity register & vigilance clearance | M09 |
| Disciplinary Authority (DA) | Competent authority who initiates charges, considers inquiry report, imposes penalty (competence verified, DI-13) | Shared (Appointing/Disciplinary Authority) |
| Inquiry Officer (IO) | Conducts the departmental inquiry impartially | Shared (M09-specific) |
| Presenting Officer (PO) | Presents the case on behalf of the department before the IO | M09 |
| Internal Committee (ICC) Member / Presiding Officer / External Member | POSH Internal Committee for HARASSMENT cases (replaces IO route) | M09 (POSH) |
| Defence Assistant (DA-Asst) | Person assisting the charged officer | M09 |
| Disciplinary Case Manager / HR-DCP Admin | Operates the case workbench, drafts artefacts, manages SLAs | Shared (HR Admin) |
| Consulting Authority Liaison | Records UPSC/CVC/legal consultation references and advice | M09 |
| Appellate Authority | Decides appeals | M09 |
| Reviewing / Revising Authority | Exercises suo-motu review/revision | M09 |
| Auditor (read-only) | Cross-module read + audit access, no write; can run audit-chain verify | Shared |
| System Administrator | Config, reference data, RBAC, **procedure_templates & authority_competence** seed; no transactional self-approval | Shared |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve/Decide, X=No access)

| Capability | Employee (Charged) | Complainant | Vigilance Officer | DA | IO | PO | DCP Admin | Appellate Auth | Reviewing Auth | Auditor | SysAdmin |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Register complaint | X | C | C | C | X | X | C | X | X | X | X |
| Triage / screen complaint | X | X | C/A | A | X | X | U | X | X | R | X |
| Order preliminary inquiry | X | X | C | A | X | X | C | X | X | R | X |
| Order/revoke suspension | X | X | R | A | X | X | C | X | X | R | X |
| Issue charge-sheet | X | X | R | A | X | C(draft) | C(draft) | X | X | R | X |
| Submit statement of defence | C | X | X | R | R | R | R | X | X | R | X |
| Supply doc/witness list & afford inspection | R(own) | X | R | A | C/U | C | U | X | X | R | X |
| Appoint IO/PO / constitute ICC | X | X | R | A | X | X | C | X | X | R | X |
| Conduct inquiry / record hearings | R(own) | X | R | R | C/U | C(evidence) | U | X | X | R | X |
| Stay inquiry (criminal parallel) | X | X | R | A | C(request) | X | U | X | X | R | X |
| Submit inquiry report | X | X | R | R | C/A | R | R | X | X | R | X |
| Record disagreement memo | X | X | X | C/A | R | X | U | X | X | R | X |
| Record statutory consultation (UPSC/CVC/ICC/legal) | X | X | C/U | A | X | X | C/U | X | X | R | X |
| Record dispense-with-inquiry | X | X | R | A | X | X | C(draft) | X | X | R | X |
| Issue show-cause notice | R(own) | X | R | A | X | X | C(draft) | X | X | R | X |
| Hold / record personal hearing | R(own) | X | R | C/A | X | X | U | A | A | R | X |
| Pass penalty / exoneration order | R(own) | X | R | A | X | X | C(draft) | X | X | R | X |
| Sign order (DSC/eSign) | X | X | X | A | X | X | X | A | A | R | X |
| File appeal | C | X | X | R | X | X | R | R | X | R | X |
| Decide appeal | X | X | X | R | X | X | R | A | X | R | X |
| Suo-motu review/revision | X | X | X | R | X | X | R | X | A | R | X |
| Post to Service Register | X | X | X | A | X | X | C | X | X | R | X |
| Maintain integrity/vigilance register | X | X | C/U | R | X | X | R | X | X | R | X |
| Manage evidence vault | R(own, served only) | X | R | R | C/U | C/U | C/U | R | R | R | X |
| Verify audit chain | X | X | R | R | X | X | R | X | X | A | A |
| View case analytics | X | X | R | R | X | X | R | R | R | R | X |
| Configure `procedure_templates` / `authority_competence` / SLA matrix | X | X | X | X | X | X | X | X | X | X | C/U |

### 3.3 Field-level confidentiality rules

- The **charged officer** may read **only** artefacts that have been **formally served** (via `legal_service_records`) on them (charge-sheet, inquiry report copy, show-cause, orders) and never the preliminary inquiry report, vigilance notes, sealed-cover contents, or DA's internal deliberation — **except** any PI/sealed material **relied upon as evidence** in the inquiry, which **must** be disclosed (DI-9 extended; `relied_upon=true ⇒ disclosed=true`).
- **Complainant identity** is masked from the charged officer unless the case type mandates disclosure; whistle-blower protection flag (`is_confidential_source`) hard-hides identity from all roles except Vigilance Officer and DA.
- IO/PO/ICC cannot view the **vigilance register** scoring, the DA's draft penalty reasoning, or **sealed-cover** promotion contents.
- All reads of sealed/confidential records are logged with hash-chained `view` audit events (read-audit).
- Consultation advice (UPSC/CVC) is restricted to DA, Vigilance, Consulting-Authority Liaison and Auditor; not served on the charged officer unless relied upon as the basis for the penalty.

---

## 4. Shared Application Foundation

This module **inherits** §5 of `SHARED_FOUNDATION.md` in full:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST `/api/v1`; PostgreSQL; encrypted object storage (M13) for binaries; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level org scoping; **plus** field-level confidentiality (§3.3), **step-up MFA** for penalty/appeal decisions, and **DSC/eSign** for statutory signing.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503); module-specific codes in §10.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full hash-chained audit trail, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500 ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min, RTO ≤ 4h.

**Reused canonical entities (referenced, not redefined):** `employees`, `users`, `org_units`, `designations`/`cadres`/`pay_scales`, `roles`/`permissions`, `service_register_events` (M12), `documents` (M13), `notifications`, `audit_log`, `workflow_instances` / `workflow_tasks`.

**Two-layer design principle (binding):** the natural-justice **kernel** — (1) notice of charge by valid service, (2) genuine opportunity to defend incl. document/witness inspection, (3) reasoned finding on recorded evidence, (4) penalty **proportionate** and **not exceeding** what was put to the person, **by a competent authority**, after **mandatory consultation**, (5) independent appeal — is enforced in code and is **non-configurable**. The **overlay** (`procedure_templates`, `authority_competence`) is reference data. No generic workflow designer is built (anti-over-engineering cap, DI-17).

---

## 5. Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Owner | Purpose | New in v2 |
|---|--------|------|-------|---------|:--:|
| E1 | `disciplinary_cases` | Module | M09 | Master case record (the file) | — |
| E2 | `case_complaints` | Module | M09 | Source-of-misconduct / complaint intake records | — |
| E3 | `preliminary_inquiries` | Module | M09 | Fact-finding inquiry before formal charges | — |
| E4 | `suspensions` | Module | M09 | Suspension / revocation / subsistence allowance (NEC + deemed review) | — |
| E5 | `charge_sheets` | Module | M09 | Memorandum of charges (articles of charge container) | — |
| E6 | `charge_articles` | Module | M09 | Individual article of charge + statement of imputation | — |
| E7 | `defence_statements` | Module | M09 | Charged officer's written statement of defence | — |
| E8 | `inquiry_proceedings` | Module | M09 | The departmental inquiry instance (+ STAY, inspection) | — |
| E9 | `inquiry_appointments` | Module | M09 | IO / PO / Defence Assistant / ICC appointments | — |
| E10 | `inquiry_hearings` | Module | M09 | Daily order sheets / hearing log | — |
| E11 | `inquiry_witnesses` | Module | M09 | Listed/examined witnesses (prosecution & defence) | — |
| E12 | `inquiry_exhibits` | Module | M09 | Documentary/material evidence (vault items; relied-upon/disclosed) | — |
| E13 | `inquiry_reports` | Module | M09 | IO/ICC findings (article-wise per respondent) | — |
| E14 | `disagreement_memos` | Module | M09 | DA disagreement with IO findings | — |
| E15 | `show_cause_notices` | Module | M09 | Notice on proposed penalty | — |
| E16 | `penalty_orders` | Module | M09 | Final order (penalty/exoneration/drop/abated) + proportionality + signature | — |
| E17 | `penalty_items` | Module | M09 | Individual penalty(ies) imposed (recovery caps) | — |
| E18 | `appeals` | Module | M09 | Appeal / revision / review applications & decisions | — |
| E19 | `case_timeline_events` | Module | M09 | SLA-tracked stage events (hash-chained ledger) | — |
| E20 | `vigilance_records` | Module | M09 | Integrity register & vigilance clearance status | — |
| E21 | `case_documents` | Module | M09 (link) | Join between case artefacts and M13 `documents` (+ signature) | — |
| **E22** | `procedure_templates` | Module | M09 | Jurisdiction overlay: consultations, competence ref, timelines, service modes, limitation, dispensation conditions | ✔ |
| **E23** | `authority_competence` | Module | M09 | (cadre/level × penalty_class) → empowered authority level matrix | ✔ |
| **E24** | `case_consultations` | Module | M09 | UPSC/CVC/ICC/legal consultation records gating finalise | ✔ |
| **E25** | `inquiry_dispensations` | Module | M09 | Lawful dispense-with-inquiry (Art. 311(2) provisos) | ✔ |
| **E26** | `legal_service_records` | Module | M09 | Statutory legal service (mode, proof, served_by) distinct from notifications | ✔ |
| **E27** | `case_respondents` | Module | M09 | 1..N charged officers per proceeding (common/joint proceedings) | ✔ |
| **E28** | `sla_pause_events` | Module | M09 | Clock pause/resume ledger (stay/remit/condonation/consultation/criminal) | ✔ |
| **E29** | `personal_hearings` | Module | M09 | Personal-hearing record (show-cause / appeal stages) | ✔ |
| **E30** | `idempotency_keys` | Module | M09 | Dedup store for propagating posts (mint, TTL) | ✔ |
| — | `employees`, `org_units`, `designations`/`cadres`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_*` | Shared | M01/M12/M13/platform | Referenced, not redefined | — |

### 5.2 Full field tables

> v2-added/changed fields are marked **(v2)**.

#### E1 — `disciplinary_cases`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `case_id` | UUID PK | N | |
| `case_no` | VARCHAR(40) UNIQUE | N | Human key, e.g. `DCP/2026/000123` |
| `charged_employee_id` | UUID FK→employees | N | **Primary** respondent (legacy 1:1 anchor; full set in `case_respondents`) |
| `org_unit_id` | UUID FK→org_units | N | Owning office (row-level scope) |
| `procedure_template_id` | UUID FK→procedure_templates | N | **(v2)** Jurisdiction overlay governing this case (AI-8) |
| `jurisdiction_code` | VARCHAR(20) | N | **(v2)** e.g. `CCS_CCA`, `POSH_ICC`, `CORP_INDIA` |
| `case_type` | ENUM `case_type` | N | MAJOR_PENALTY_TRACK / MINOR_PENALTY_TRACK / VIGILANCE / ADMINISTRATIVE |
| `misconduct_category` | ENUM `misconduct_category` | N | See enum catalog |
| `is_posh_case` | BOOLEAN | N | **(v2)** True ⇒ ICC route (AI-16) |
| `case_status` | ENUM `case_status` | N | State machine (§12); now incl. `ABATED` |
| `current_stage` | ENUM `case_stage` | N | INTAKE…CLOSED (SUSPENSION removed — now parallel) **(v2)** |
| `is_under_suspension` | BOOLEAN | N | **(v2)** Parallel interim status flag (AI-9) |
| `suspension_status` | ENUM `suspension_status` | Y | **(v2)** Echo of active suspension (parallel track) |
| `disciplinary_authority_id` | UUID FK→employees | N | Competent DA (verified vs `authority_competence`) |
| `is_jurisdiction_transferred` | BOOLEAN | N | **(v2)** True if DA re-resolved mid-proceeding (AI-13) |
| `is_sealed_cover` | BOOLEAN | N | **(v2)** Promotion frozen pending proceedings (AI-13) |
| `is_retiree_case` | BOOLEAN | N | **(v2)** Subject retired; Rule 9 guard applies (AI-13) |
| `retiree_sanction_ref` | VARCHAR(120) | Y | **(v2)** President/Govt sanction reference for retiree proceedings |
| `is_confidential` | BOOLEAN | N | Default true |
| `is_confidential_source` | BOOLEAN | N | Whistle-blower protection |
| `vigilance_flag` | BOOLEAN | N | Routed through Vigilance |
| `criminal_case_ref` | VARCHAR(80) | Y | Linked FIR/court ref (active ⇒ may STAY inquiry, AI-18) |
| `statutory_basis` | VARCHAR(120) | N | Rule cited (e.g. CCS(CCA) Rule 14) |
| `date_initiated` | DATE | N | |
| `expected_closure_date` | DATE | Y | SLA target (recomputed on pause/resume, AI-10) |
| `actual_closure_date` | DATE | Y | |
| `abatement_reason` | TEXT | Y | **(v2)** Set when `case_status=ABATED` (AI-14) |
| `outcome_summary` | TEXT | Y | Filled at closure |
| `created_at`/`updated_at` | TIMESTAMPTZ | N | |
| `created_by`/`updated_by` | UUID | N | |
| `is_deleted` | BOOLEAN | N | Soft delete |

#### E2 — `case_complaints`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `complaint_id` | UUID PK | N | |
| `complaint_no` | VARCHAR(40) UNIQUE | N | |
| `case_id` | UUID FK→disciplinary_cases | Y | Null until promoted to a case |
| `subject_employee_id` | UUID FK→employees | N | Alleged delinquent |
| `source_type` | ENUM `complaint_source` | N | INTERNAL / PUBLIC / ANONYMOUS / AUDIT / MEDIA / CVC / SUO_MOTU |
| `complainant_id` | UUID FK→employees | Y | Null if external/anonymous |
| `complainant_name_ext` | VARCHAR(160) | Y | External complainant |
| `is_anonymous` | BOOLEAN | N | |
| `received_date` | DATE | N | |
| `allegation_summary` | TEXT | N | |
| `triage_decision` | ENUM `triage_decision` | Y | FILE_CASE / PRELIMINARY_INQUIRY / CLOSE_NO_ACTION / TRANSFER_AGENCY |
| `triage_remarks` | TEXT | Y | |
| `triaged_by` | UUID FK→employees | Y | |
| `triaged_at` | TIMESTAMPTZ | Y | |
| audit fields | | | created/updated/by/is_deleted |

#### E3 — `preliminary_inquiries`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `pi_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `pi_officer_id` | UUID FK→employees | N | Fact-finding officer |
| `ordered_by` | UUID FK→employees | N | DA/Vigilance |
| `ordered_date` | DATE | N | |
| `due_date` | DATE | N | SLA |
| `status` | ENUM `pi_status` | N | ORDERED / IN_PROGRESS / SUBMITTED / CLOSED |
| `findings_summary` | TEXT | Y | |
| `recommendation` | ENUM `pi_recommendation` | Y | PROCEED_MAJOR / PROCEED_MINOR / DROP / ADMIN_ADVICE |
| `report_document_id` | UUID FK→documents | Y | Confidential — not served (unless relied upon, DI-9) |
| `contains_relied_material` | BOOLEAN | N | **(v2)** True if any PI material later relied upon ⇒ must disclose (AI-24) |
| `submitted_at` | TIMESTAMPTZ | Y | |
| audit fields | | | |

#### E4 — `suspensions`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `suspension_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `employee_id` | UUID FK→employees | N | |
| `suspension_type` | ENUM `suspension_type` | N | ORDERED / DEEMED (detention>48h) / CONTINUED |
| `order_no` | VARCHAR(40) UNIQUE | N | |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | Null while active |
| `status` | ENUM `suspension_status` | N | ACTIVE / REVOKED / EXTENDED / DEEMED_REVOKED |
| `subsistence_rate_pct` | NUMERIC(5,2) | N | e.g. 50.00 first 3 months |
| `non_employment_certificate_received` | BOOLEAN | N | **(v2)** Precondition for subsistence payment to M10 (AI-6) |
| `nec_received_date` | DATE | Y | **(v2)** Date NEC furnished |
| `charge_memo_due_date` | DATE | Y | **(v2)** 90-day window (Ajay Kumar Choudhary) for charge-memo service |
| `deemed_review_flag` | BOOLEAN | N | **(v2)** Auto-set when charge-memo not served within window ⇒ review/auto-revoke escalation (AI-6) |
| `subsistence_revision_due` | DATE | Y | 90/180-day review |
| `review_committee_due` | DATE | Y | Statutory review board |
| `payroll_event_id` | UUID | Y | Correlation to M10 |
| `revoked_reason` | TEXT | Y | |
| `order_document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E5 — `charge_sheets`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `charge_sheet_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `charge_sheet_no` | VARCHAR(40) UNIQUE | N | |
| `penalty_track` | ENUM `penalty_track` | N | MINOR / MAJOR |
| `issued_by` | UUID FK→employees | N | DA |
| `issued_date` | DATE | Y | Set on serve |
| `signature_type` | ENUM `signature_type` | Y | **(v2)** DSC / ESIGN (AI-17) |
| `signatory_id` | UUID FK→employees | Y | **(v2)** Bound signer identity |
| `signed_at` | TIMESTAMPTZ | Y | **(v2)** Trusted timestamp |
| `legal_service_id` | UUID FK→legal_service_records | Y | **(v2)** Valid statutory service (AI-5) |
| `defence_due_date` | DATE | Y | Statutory window (from valid service date) |
| `status` | ENUM `charge_sheet_status` | N | DRAFT / ISSUED / SERVED / RESPONDED / WITHDRAWN |
| `document_id` | UUID FK→documents | Y | Signed PDF |
| `withdrawn_reason` | TEXT | Y | |
| audit fields | | | |

#### E6 — `charge_articles`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `article_id` | UUID PK | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `article_no` | INT | N | Ordinal within sheet |
| `article_text` | TEXT | N | The charge |
| `statement_of_imputation` | TEXT | N | Facts supporting the charge |
| `rule_violated` | VARCHAR(160) | N | Conduct rule reference |
| audit fields | | | |
| *(finding moved to per-respondent grain — see `case_respondents` / `inquiry_reports`; legacy `finding`/`finding_reason` retained for single-respondent cases for backward compatibility)* **(v2)** | | | |
| `finding` | ENUM `article_finding` | Y | PROVED / NOT_PROVED / PARTLY_PROVED (single-respondent legacy) |
| `finding_reason` | TEXT | Y | |

#### E7 — `defence_statements`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `defence_id` | UUID PK | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `respondent_id` | UUID FK→case_respondents | Y | **(v2)** Which respondent (joint proceedings, AI-7) |
| `submitted_by` | UUID FK→employees | N | Charged officer |
| `plea` | ENUM `defence_plea` | N | ADMITS_ALL / DENIES_ALL / PARTIAL / NO_RESPONSE |
| `statement_text` | TEXT | Y | |
| `requests_oral_inquiry` | BOOLEAN | N | |
| `requests_defence_assistant` | BOOLEAN | N | |
| `requests_personal_hearing` | BOOLEAN | N | **(v2)** Surfaced entitlement (AI-19/AI-21) |
| `extension_requested_days` | INT | Y | |
| `submitted_at` | TIMESTAMPTZ | Y | |
| `is_ex_parte_assumed` | BOOLEAN | N | True if no response within window |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E8 — `inquiry_proceedings`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `inquiry_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `charge_sheet_id` | UUID FK→charge_sheets | N | |
| `inquiry_route` | ENUM `inquiry_route` | N | **(v2)** ORDINARY_IO / ICC_POSH / DISPENSED (AI-3/AI-16) |
| `status` | ENUM `inquiry_status` | N | NOT_STARTED / IN_PROGRESS / EX_PARTE / STAYED / CONCLUDED / DE_NOVO **(v2: STAYED)** |
| `list_supplied_date` | DATE | Y | **(v2)** Date list of relied documents/witnesses supplied (AI-4) |
| `inspection_afforded_date` | DATE | Y | **(v2)** Date inspection afforded; gate before evidence (AI-4) |
| `commenced_date` | DATE | Y | |
| `concluded_date` | DATE | Y | |
| `due_date` | DATE | Y | SLA (e.g. 6 months) |
| `is_ex_parte` | BOOLEAN | N | |
| `is_stayed` | BOOLEAN | N | **(v2)** Stayed pending criminal trial (AI-18) |
| `stay_reason` | TEXT | Y | **(v2)** Reason + criminal_case_ref |
| `stay_from`/`stay_to` | DATE | Y | **(v2)** Stay window (SLA pause source) |
| `de_novo_of_inquiry_id` | UUID FK self | Y | Fresh inquiry link |
| audit fields | | | |

#### E9 — `inquiry_appointments`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `appointment_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `role_type` | ENUM `inquiry_role` | N | INQUIRY_OFFICER / PRESENTING_OFFICER / DEFENCE_ASSISTANT / ICC_PRESIDING / ICC_MEMBER / ICC_EXTERNAL_MEMBER **(v2: ICC roles, AI-16)** |
| `officer_id` | UUID FK→employees | Y | Internal person |
| `external_name` | VARCHAR(160) | Y | External IO / ICC external member / counsel if permitted |
| `is_external_member` | BOOLEAN | N | **(v2)** POSH mandatory external NGO/expert member |
| `appointed_by` | UUID FK→employees | N | DA |
| `appointed_date` | DATE | N | |
| `status` | ENUM `appointment_status` | N | ACTIVE / RECUSED / REPLACED / OBJECTED |
| `recusal_reason` | TEXT | Y | Bias/conflict objection handling |
| audit fields | | | |

#### E10 — `inquiry_hearings` (daily order sheet)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hearing_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `hearing_no` | INT | N | Sequential |
| `scheduled_date` | TIMESTAMPTZ | N | |
| `held_date` | TIMESTAMPTZ | Y | |
| `outcome` | ENUM `hearing_outcome` | N | HELD / ADJOURNED / NO_SHOW_CHARGED / NO_SHOW_PO / EX_PARTE_RECORDED |
| `daily_order_text` | TEXT | N | Minutes / order sheet content |
| `next_hearing_date` | TIMESTAMPTZ | Y | |
| `recorded_by` | UUID FK→employees | N | IO |
| `attendees_json` | JSONB | Y | Present parties |
| audit fields | | | |

#### E11 — `inquiry_witnesses`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `witness_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `side` | ENUM `witness_side` | N | PROSECUTION / DEFENCE |
| `witness_employee_id` | UUID FK→employees | Y | If internal |
| `witness_name_ext` | VARCHAR(160) | Y | External |
| `is_listed_for_inspection` | BOOLEAN | N | **(v2)** Part of supplied witness list (AI-4) |
| `examination_status` | ENUM `witness_status` | N | LISTED / EXAMINED / CROSS_EXAMINED / DROPPED |
| `deposition_text` | TEXT | Y | |
| `examined_on_hearing_id` | UUID FK→inquiry_hearings | Y | |
| audit fields | | | |

#### E12 — `inquiry_exhibits`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `exhibit_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `exhibit_marker` | VARCHAR(20) | N | e.g. `P-1`, `D-3` |
| `side` | ENUM `witness_side` | N | PROSECUTION / DEFENCE |
| `description` | TEXT | N | |
| `document_id` | UUID FK→documents | N | Vault item (M13) |
| `source_is_pi` | BOOLEAN | N | **(v2)** Sourced from preliminary inquiry material |
| `relied_upon` | BOOLEAN | N | **(v2)** Relied upon as evidence (AI-24) |
| `disclosed_to_charged` | BOOLEAN | N | **(v2)** Must be true when `relied_upon=true` (DI-9) |
| `is_listed_for_inspection` | BOOLEAN | N | **(v2)** Part of supplied document list (AI-4) |
| `admitted` | BOOLEAN | Y | Admitted into evidence |
| `objection_text` | TEXT | Y | |
| `sealed` | BOOLEAN | N | Sealed vault flag |
| `content_hash` | VARCHAR(64) | N | SHA-256 integrity seal |
| audit fields | | | |

#### E13 — `inquiry_reports`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `report_id` | UUID PK | N | |
| `inquiry_id` | UUID FK→inquiry_proceedings | N | |
| `submitted_by` | UUID FK→employees | N | IO / ICC Presiding Officer |
| `submitted_date` | DATE | N | |
| `overall_finding` | ENUM `overall_finding` | N | ALL_PROVED / NONE_PROVED / MIXED |
| `findings_json` | JSONB | N | **(v2)** Per-respondent × per-article finding grid (AI-7) |
| `analysis_text` | TEXT | N | Reasoning & appreciation of evidence |
| `report_document_id` | UUID FK→documents | N | |
| `signature_type` | ENUM `signature_type` | Y | **(v2)** DSC/ESIGN (AI-17) |
| `signed_at` | TIMESTAMPTZ | Y | **(v2)** |
| `served_on_charged_date` | DATE | Y | Copy served for representation |
| `legal_service_id` | UUID FK→legal_service_records | Y | **(v2)** Valid service of report copy |
| `status` | ENUM `report_status` | N | SUBMITTED / SERVED / UNDER_DA_REVIEW / ACCEPTED / REMITTED |
| audit fields | | | |

#### E14 — `disagreement_memos`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `memo_id` | UUID PK | N | |
| `report_id` | UUID FK→inquiry_reports | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `issued_by` | UUID FK→employees | N | DA |
| `tentative_disagreement` | TEXT | N | DA's reasons differing from IO |
| `articles_affected_json` | JSONB | N | Which articles/respondents, revised view |
| `served_date` | DATE | Y | Served for representation |
| `legal_service_id` | UUID FK→legal_service_records | Y | **(v2)** |
| `representation_due_date` | DATE | Y | |
| `representation_text` | TEXT | Y | Charged officer's response |
| `status` | ENUM `memo_status` | N | ISSUED / SERVED / RESPONDED / FINALISED |
| audit fields | | | |

#### E15 — `show_cause_notices`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `notice_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `notice_no` | VARCHAR(40) UNIQUE | N | |
| `respondent_id` | UUID FK→case_respondents | Y | **(v2)** Per respondent (AI-7) |
| `proposed_penalty_json` | JSONB | N | Penalty(ies) tentatively proposed |
| `issued_by` | UUID FK→employees | N | DA |
| `issued_date` | DATE | N | |
| `served_date` | DATE | Y | |
| `legal_service_id` | UUID FK→legal_service_records | Y | **(v2)** |
| `response_due_date` | DATE | N | |
| `representation_text` | TEXT | Y | |
| `personal_hearing_id` | UUID FK→personal_hearings | Y | **(v2)** If personal hearing held (AI-21) |
| `responded_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM `notice_status` | N | ISSUED / SERVED / RESPONDED / NO_RESPONSE / CLOSED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E16 — `penalty_orders`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `order_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `order_no` | VARCHAR(40) UNIQUE | N | |
| `respondent_id` | UUID FK→case_respondents | Y | **(v2)** Per-respondent order in joint proceedings (AI-7) |
| `order_type` | ENUM `order_type` | N | PENALTY / EXONERATION / DROP_PROCEEDINGS / **ABATED (v2, AI-14)** |
| `passed_by` | UUID FK→employees | N | DA |
| `competence_verified` | BOOLEAN | N | **(v2)** True only if `passed_by` competent for max penalty class (DI-13, AI-1) |
| `competence_authority_level` | VARCHAR(40) | Y | **(v2)** Resolved empowered level at finalise |
| `order_date` | DATE | N | |
| `effective_date` | DATE | Y | |
| `reasoning_text` | TEXT | N | Speaking order |
| `proportionality_reasoning` | TEXT | N | **(v2)** Mandatory: why penalty is proportionate to misconduct (DI-20, AI-12) |
| `is_speaking_order` | BOOLEAN | N | Must be true to finalise |
| `signature_type` | ENUM `signature_type` | Y | **(v2)** DSC / ESIGN (AI-17) |
| `signatory_id` | UUID FK→employees | Y | **(v2)** Bound signer |
| `signed_at` | TIMESTAMPTZ | Y | **(v2)** Trusted timestamp |
| `signature_ref` | VARCHAR(128) | Y | **(v2)** CA/eSign transaction reference |
| `served_date` | DATE | Y | |
| `legal_service_id` | UUID FK→legal_service_records | Y | **(v2)** Valid service of order |
| `sr_event_id` | UUID FK→service_register_events | Y | M12 correlation |
| `status` | ENUM `order_status` | N | DRAFT / FINALISED / SERVED / STAYED / SET_ASIDE / MODIFIED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E17 — `penalty_items`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `penalty_item_id` | UUID PK | N | |
| `order_id` | UUID FK→penalty_orders | N | |
| `penalty_type` | ENUM `penalty_type` | N | See enum catalog (minor/major) |
| `penalty_class` | ENUM `penalty_class` | N | MINOR / MAJOR |
| `duration_months` | INT | Y | e.g. withholding increment for N months |
| `is_cumulative` | BOOLEAN | Y | Increment withholding cumulative effect |
| `recovery_amount` | NUMERIC(14,2) | Y | For recovery penalties |
| `recovery_instalments` | INT | Y | **(v2)** Number of instalments (cap rule, AI-20) |
| `recovery_monthly_cap_pct` | NUMERIC(5,2) | Y | **(v2)** ≤ 1/3 of pay default (DI-22) |
| `recovery_beyond_retirement` | BOOLEAN | Y | **(v2)** Only from DCRG if true (DI-22) |
| `reduction_to_designation_id` | UUID FK→designations | Y | Reduction in rank target |
| `pension_effect` | ENUM `pension_effect` | Y | NONE / WITHHELD / REDUCED_PCT |
| `pension_effect_value` | NUMERIC(5,2) | Y | % if reduced |
| `downstream_event_id` | UUID | Y | Correlation to M06/M10/M11 |
| audit fields | | | |

#### E18 — `appeals`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `appeal_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `order_id` | UUID FK→penalty_orders | N | Order under challenge |
| `remedy_type` | ENUM `remedy_type` | N | APPEAL / REVISION / REVIEW |
| `filed_by` | UUID FK→employees | Y | Charged officer (null for suo-motu) |
| `filed_date` | DATE | N | |
| `limitation_due_date` | DATE | N | Statutory limitation (per template, e.g. 45 days) |
| `is_time_barred` | BOOLEAN | N | |
| `condonation_granted` | BOOLEAN | Y | Delay condonation |
| `authority_id` | UUID FK→employees | N | Appellate/Reviewing authority (≠ DA) |
| `authority_competence_verified` | BOOLEAN | N | **(v2)** Appellate authority competent (DI-13) |
| `grounds_text` | TEXT | Y | |
| `personal_hearing_id` | UUID FK→personal_hearings | Y | **(v2)** Personal hearing in appeal (AI-21) |
| `decision` | ENUM `appeal_decision` | Y | UPHELD / SET_ASIDE / MODIFIED / ENHANCED / REMITTED / REJECTED |
| `decision_reasoning` | TEXT | Y | |
| `decided_date` | DATE | Y | |
| `revised_order_id` | UUID FK→penalty_orders | Y | If modified |
| `status` | ENUM `appeal_status` | N | FILED / ADMITTED / UNDER_REVIEW / DECIDED / REJECTED |
| `document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E19 — `case_timeline_events` (hash-chained ledger)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `event_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `stage` | ENUM `case_stage` | N | |
| `event_type` | ENUM `timeline_event_type` | N | STAGE_ENTERED / STAGE_COMPLETED / SLA_BREACH / ESCALATION / SLA_PAUSE / SLA_RESUME / JURISDICTION_TRANSFER / NOTE **(v2 additions)** |
| `event_at` | TIMESTAMPTZ | N | |
| `sla_target_at` | TIMESTAMPTZ | Y | |
| `sla_status` | ENUM `sla_status` | N | ON_TRACK / AT_RISK / BREACHED / PAUSED / N_A **(v2: PAUSED)** |
| `actor_id` | UUID FK→employees | Y | |
| `notes` | TEXT | Y | |
| `seq_no` | BIGINT | N | **(v2)** Monotonic per case |
| `prev_hash` | VARCHAR(64) | Y | **(v2)** SHA-256 of prior row (hash chain, DI-21, AI-15) |
| `row_hash` | VARCHAR(64) | N | **(v2)** SHA-256 over canonical row + prev_hash |
| (append-only; no soft delete) | | | |

#### E20 — `vigilance_records`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `vigilance_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `case_id` | UUID FK→disciplinary_cases | Y | Linked case if any |
| `clearance_status` | ENUM `vigilance_clearance` | N | CLEAR / WITHHELD / UNDER_PROCEEDINGS / NOT_CLEAR |
| `integrity_grade` | ENUM `integrity_grade` | Y | DOUBTFUL / SATISFACTORY |
| `sealed_cover_flag` | BOOLEAN | N | **(v2)** Promotion held in sealed cover (AI-13) |
| `valid_from` | DATE | N | |
| `valid_to` | DATE | Y | |
| `reason` | TEXT | Y | |
| `updated_by` | UUID FK→employees | N | Vigilance Officer |
| audit fields | | | |

#### E21 — `case_documents` (link to M13)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `case_document_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `artefact_type` | ENUM `artefact_type` | N | COMPLAINT / PI_REPORT / CHARGE_SHEET / DEFENCE / EXHIBIT / INQUIRY_REPORT / SHOW_CAUSE / ORDER / APPEAL / CONSULTATION / SERVICE_PROOF **(v2 additions)** |
| `entity_ref_id` | UUID | Y | The originating row (polymorphic) |
| `document_id` | UUID FK→documents | N | M13 object |
| `is_served` | BOOLEAN | N | Visible to charged officer if true |
| `is_sealed` | BOOLEAN | N | Sealed vault |
| `signature_type` | ENUM `signature_type` | Y | **(v2)** DSC/ESIGN on the artefact (AI-17) |
| `signed_at` | TIMESTAMPTZ | Y | **(v2)** |
| `content_hash` | VARCHAR(64) | N | SHA-256 |
| audit fields | | | |

#### E22 — `procedure_templates` **(v2, AI-8)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `template_id` | UUID PK | N | |
| `template_code` | VARCHAR(40) UNIQUE | N | e.g. `CCS_CCA_2026`, `POSH_ICC`, `CORP_INDIA` |
| `jurisdiction_code` | VARCHAR(20) | N | |
| `applies_to_case_type` | ENUM `case_type` | Y | Null = any |
| `applies_to_misconduct` | ENUM `misconduct_category` | Y | e.g. HARASSMENT ⇒ POSH_ICC |
| `required_consultations_json` | JSONB | N | Ordered list incl. type & trigger (e.g. UPSC for major; CVC for vigilance) |
| `competence_matrix_ref` | VARCHAR(40) | N | Logical key into `authority_competence` set |
| `valid_service_modes_json` | JSONB | N | Statutorily valid modes; EMAIL excluded by default (AI-5) |
| `timelines_json` | JSONB | N | Per-stage SLA floors/targets (non-shortenable floor) |
| `appeal_limitation_days` | INT | N | e.g. 45 |
| `subsistence_floor_pct`/`subsistence_ceiling_pct` | NUMERIC(5,2) | N | Default 25 / 75 |
| `dispensation_conditions_json` | JSONB | N | Allowed Art. 311(2) provisos (AI-3) |
| `inquiry_route_default` | ENUM `inquiry_route` | N | ORDINARY_IO / ICC_POSH |
| `is_active` | BOOLEAN | N | |
| audit fields | | | |

#### E23 — `authority_competence` **(v2, AI-1, R1)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `competence_id` | UUID PK | N | |
| `competence_set_code` | VARCHAR(40) | N | Matches template `competence_matrix_ref` |
| `subject_cadre` | VARCHAR(60) | N | Cadre/grade of the charged officer |
| `penalty_class` | ENUM `penalty_class` | N | MINOR / MAJOR |
| `penalty_type` | ENUM `penalty_type` | Y | Null = any of class; specific for DISMISSAL/REMOVAL |
| `min_authority_level` | VARCHAR(40) | N | e.g. `APPOINTING_AUTHORITY`, `HEAD_OF_DEPT`, `>=APPOINTING` |
| `requires_not_subordinate_to_appointing` | BOOLEAN | N | Art. 311(1) — dismissal/removal cannot be by authority subordinate to appointing authority |
| `notes` | TEXT | Y | |
| audit fields | | | |

#### E24 — `case_consultations` **(v2, AI-2, R2)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `consultation_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `respondent_id` | UUID FK→case_respondents | Y | Per respondent if applicable |
| `consultation_type` | ENUM `consultation_type` | N | UPSC / CVC_FIRST_STAGE / CVC_SECOND_STAGE / ICC / LEGAL / NONE |
| `status` | ENUM `consultation_status` | N | REQUIRED / REQUESTED / RECEIVED / CLOSED / WAIVED |
| `is_mandatory` | BOOLEAN | N | Derived from `procedure_templates` |
| `requested_date` | DATE | Y | |
| `received_date` | DATE | Y | |
| `advice_summary` | TEXT | Y | |
| `advice_document_id` | UUID FK→documents | Y | Confidential advice |
| `is_advice_relied_upon` | BOOLEAN | N | If basis of penalty ⇒ disclose (DI-9) |
| `waiver_reason` | TEXT | Y | If WAIVED, recorded reasons |
| audit fields | | | |

#### E25 — `inquiry_dispensations` **(v2, AI-3, R3)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `dispensation_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `respondent_id` | UUID FK→case_respondents | Y | |
| `reason_code` | ENUM `dispensation_reason` | N | CRIMINAL_CONVICTION / NOT_REASONABLY_PRACTICABLE / SECURITY_OF_STATE |
| `recorded_reasons` | TEXT | N | Mandatory speaking reasons (Art. 311(2) proviso) |
| `authority_id` | UUID FK→employees | N | Authority dispensing (competent) |
| `supporting_ref` | VARCHAR(120) | Y | Conviction/order/security note reference |
| `approved_date` | DATE | N | |
| `status` | ENUM `dispensation_status` | N | PROPOSED / APPROVED / REJECTED |
| audit fields | | | |

#### E26 — `legal_service_records` **(v2, AI-5, R5)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `service_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `artefact_type` | ENUM `artefact_type` | N | CHARGE_SHEET / INQUIRY_REPORT / SHOW_CAUSE / ORDER / DISAGREEMENT_MEMO |
| `entity_ref_id` | UUID | N | The served artefact row |
| `respondent_id` | UUID FK→case_respondents | Y | |
| `service_mode` | ENUM `service_mode` | N | IN_PERSON / REGD_POST / SUBSTITUTED / PUBLICATION / EMAIL (EMAIL non-statutory unless template allows) |
| `is_statutorily_valid` | BOOLEAN | N | Computed vs template `valid_service_modes_json` |
| `served_date` | DATE | N | Date of valid service (drives reply windows) |
| `served_by` | UUID FK→employees | N | |
| `proof_document_id` | UUID FK→documents | Y | AD card / acknowledgement / publication proof |
| `remarks` | TEXT | Y | |
| audit fields | | | |

#### E27 — `case_respondents` **(v2, AI-7, R7)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `respondent_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | Common proceeding shares one case + one inquiry |
| `employee_id` | UUID FK→employees | N | A charged co-delinquent |
| `respondent_role_in_misconduct` | VARCHAR(80) | Y | e.g. sanctioning / verifying / beneficiary |
| `subject_cadre` | VARCHAR(60) | N | Snapshot for competence resolution |
| `disciplinary_authority_id` | UUID FK→employees | N | Competent DA for this respondent (may differ) |
| `status` | ENUM `respondent_status` | N | ACTIVE / EXONERATED / PENALISED / ABATED / SEVERED |
| `is_primary` | BOOLEAN | N | The `disciplinary_cases.charged_employee_id` anchor |
| audit fields | | | |

#### E28 — `sla_pause_events` **(v2, AI-10, R10)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `pause_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `stage` | ENUM `case_stage` | N | Stage whose clock is paused |
| `reason` | ENUM `sla_pause_reason` | N | STAY / REMIT / CONDONATION / CONSULTATION / CRIMINAL_STAY |
| `paused_from` | TIMESTAMPTZ | N | |
| `resumed_at` | TIMESTAMPTZ | Y | Null while paused |
| `paused_by` | UUID FK→employees | N | |
| `source_ref_id` | UUID | Y | Originating appeal/stay/consultation/criminal ref |
| `recompute_applied` | BOOLEAN | N | `expected_closure_date`/`sla_target_at` recomputed on resume |
| audit fields (append-only) | | | |

#### E29 — `personal_hearings` **(v2, AI-21)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hearing_id` | UUID PK | N | |
| `case_id` | UUID FK→disciplinary_cases | N | |
| `respondent_id` | UUID FK→case_respondents | Y | |
| `stage` | ENUM `case_stage` | N | SHOW_CAUSE / APPEAL |
| `requested` | BOOLEAN | N | Charged officer requested |
| `granted` | BOOLEAN | N | If denied, reasons required (DI-29) |
| `denial_reason` | TEXT | Y | |
| `scheduled_date` | TIMESTAMPTZ | Y | |
| `held_date` | TIMESTAMPTZ | Y | |
| `presided_by` | UUID FK→employees | Y | DA / Appellate authority |
| `minutes_text` | TEXT | Y | |
| `minutes_document_id` | UUID FK→documents | Y | |
| audit fields | | | |

#### E30 — `idempotency_keys` **(v2, AI-11, R11)**

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `idempotency_key` | VARCHAR(80) PK | N | Client- or server-minted (UUID + scope) |
| `scope` | ENUM `idempotency_scope` | N | SUSPENSION / ORDER_FINALISE / POST_TO_SR / APPEAL_DECIDE |
| `case_id` | UUID FK→disciplinary_cases | Y | |
| `request_fingerprint` | VARCHAR(64) | N | SHA-256 of canonical request body |
| `first_seen_at` | TIMESTAMPTZ | N | |
| `response_snapshot_json` | JSONB | Y | Stored result for replay |
| `status` | ENUM `idempotency_status` | N | IN_PROGRESS / COMPLETED |
| `expires_at` | TIMESTAMPTZ | N | TTL (default 7 days) |
| (insert-once; pruned after TTL) | | | |

### 5.3 Relationship map

```
employees (M01) 1──* disciplinary_cases *──1 org_units (M01)
disciplinary_cases *──1 procedure_templates                         (v2: overlay)
disciplinary_cases 1──* case_respondents *──1 employees             (v2: multi-respondent)
disciplinary_cases 1──* case_complaints
disciplinary_cases 1──* preliminary_inquiries
disciplinary_cases 1──* suspensions                                 (parallel interim track, v2)
disciplinary_cases 1──* charge_sheets 1──* charge_articles
charge_sheets 1──* defence_statements *──0..1 case_respondents      (v2: per respondent)
charge_sheets 1──1 inquiry_proceedings 1──* inquiry_appointments    (IO/PO or ICC, v2)
inquiry_proceedings 1──* inquiry_hearings
inquiry_proceedings 1──* inquiry_witnesses
inquiry_proceedings 1──* inquiry_exhibits *──1 documents (M13)
inquiry_proceedings 1──1 inquiry_reports 1──0..1 disagreement_memos
disciplinary_cases 1──0..* inquiry_dispensations                    (v2: dispense-with-inquiry)
disciplinary_cases 1──* case_consultations                          (v2: UPSC/CVC/ICC/legal)
disciplinary_cases 1──* show_cause_notices 0..1──1 personal_hearings(v2)
disciplinary_cases 1──* penalty_orders 1──* penalty_items
penalty_orders *──1 authority_competence (resolved at finalise)     (v2: competence guard)
penalty_orders 1──* appeals 0..1──1 personal_hearings               (v2)
appeals 0..1──1 penalty_orders (revised)
penalty_orders / charge_sheets / show_cause / reports *──1 legal_service_records (v2)
penalty_orders 1──0..1 service_register_events (M12)
disciplinary_cases 1──* case_timeline_events (hash-chained)          (v2)
disciplinary_cases 1──* sla_pause_events                            (v2)
disciplinary_cases 1──* case_documents *──1 documents (M13)
employees 1──* vigilance_records 0..1──1 disciplinary_cases
propagating posts *──1 idempotency_keys                             (v2)
```

### 5.4 Ownership / reuse matrix

| Entity | Owned by | Read by | Written by |
|--------|----------|---------|-----------|
| E1–E30 (case entities) | M09 | M09, M14 (KPI), Auditor | M09 roles per §3 |
| `procedure_templates`, `authority_competence` (E22/E23) | M09 | M09 decision guards, Auditor | SysAdmin only (reference data) |
| `employees` | M01 | M09 | M01 only |
| `org_units` / `designations` / `cadres` | M01 | M09 | M01 only |
| `service_register_events` | M12 | M09 | M09 (append SR event, idempotent), M12 |
| `documents` | M13 | M09 | M09 (via M13 API), M13 |
| `notifications` | platform | M09 | M09 (informational only — never legal service) |
| `audit_log` | platform | Auditor, M09 | M09 (append on every action; module mirror hash-chained in E19) |
| `workflow_*` | platform | M09 | M09 |
| Payroll/pension/seniority effects | M10/M11/M06 | M09 (status echo) | M09 emits event; owning module executes |
| DSC/eSign trust service | platform | M09 | M09 calls; stores signature metadata |

### 5.5 Enum & reference catalog

| Enum | Values |
|------|--------|
| `case_type` | MAJOR_PENALTY_TRACK, MINOR_PENALTY_TRACK, VIGILANCE, ADMINISTRATIVE |
| `misconduct_category` | FINANCIAL_IRREGULARITY, CORRUPTION, NEGLIGENCE, INSUBORDINATION, ABSENCE_UNAUTHORISED, MORAL_TURPITUDE, MISUSE_OF_OFFICE, DATA_BREACH, HARASSMENT, OTHER |
| `case_status` | OPEN, INQUIRY, DECISION_PENDING, PENALTY_IMPOSED, EXONERATED, DROPPED, UNDER_APPEAL, **ABATED (v2)**, CLOSED *(SUSPENDED_PENDING removed as a status; suspension is now the parallel `is_under_suspension` flag, v2)* |
| `case_stage` | INTAKE, PRELIMINARY_INQUIRY, CHARGE, DEFENCE, INQUIRY_SETUP, INQUIRY, INQUIRY_REPORT, DA_CONSIDERATION, CONSULTATION **(v2)**, SHOW_CAUSE, ORDER, SR_POSTING, APPEAL, CLOSED *(**SUSPENSION removed** from linear sequence — parallel track, v2)* |
| `complaint_source` | INTERNAL, PUBLIC, ANONYMOUS, AUDIT, MEDIA, CVC, SUO_MOTU |
| `triage_decision` | FILE_CASE, PRELIMINARY_INQUIRY, CLOSE_NO_ACTION, TRANSFER_AGENCY |
| `pi_status` | ORDERED, IN_PROGRESS, SUBMITTED, CLOSED |
| `pi_recommendation` | PROCEED_MAJOR, PROCEED_MINOR, DROP, ADMIN_ADVICE |
| `suspension_type` | ORDERED, DEEMED, CONTINUED |
| `suspension_status` | ACTIVE, REVOKED, EXTENDED, DEEMED_REVOKED |
| `penalty_track` | MINOR, MAJOR |
| `service_mode` | IN_PERSON, REGD_POST, EMAIL, SUBSTITUTED, PUBLICATION |
| `charge_sheet_status` | DRAFT, ISSUED, SERVED, RESPONDED, WITHDRAWN |
| `article_finding` | PROVED, NOT_PROVED, PARTLY_PROVED |
| `defence_plea` | ADMITS_ALL, DENIES_ALL, PARTIAL, NO_RESPONSE |
| `inquiry_route` | **(v2)** ORDINARY_IO, ICC_POSH, DISPENSED |
| `inquiry_status` | NOT_STARTED, IN_PROGRESS, EX_PARTE, **STAYED (v2)**, CONCLUDED, DE_NOVO |
| `inquiry_role` | INQUIRY_OFFICER, PRESENTING_OFFICER, DEFENCE_ASSISTANT, **ICC_PRESIDING (v2)**, **ICC_MEMBER (v2)**, **ICC_EXTERNAL_MEMBER (v2)** |
| `appointment_status` | ACTIVE, RECUSED, REPLACED, OBJECTED |
| `hearing_outcome` | HELD, ADJOURNED, NO_SHOW_CHARGED, NO_SHOW_PO, EX_PARTE_RECORDED |
| `witness_side` | PROSECUTION, DEFENCE |
| `witness_status` | LISTED, EXAMINED, CROSS_EXAMINED, DROPPED |
| `overall_finding` | ALL_PROVED, NONE_PROVED, MIXED |
| `report_status` | SUBMITTED, SERVED, UNDER_DA_REVIEW, ACCEPTED, REMITTED |
| `memo_status` | ISSUED, SERVED, RESPONDED, FINALISED |
| `notice_status` | ISSUED, SERVED, RESPONDED, NO_RESPONSE, CLOSED |
| `order_type` | PENALTY, EXONERATION, DROP_PROCEEDINGS, **ABATED (v2)** |
| `order_status` | DRAFT, FINALISED, SERVED, STAYED, SET_ASIDE, MODIFIED |
| `penalty_type` | CENSURE, WITHHOLD_INCREMENT, WITHHOLD_PROMOTION, RECOVERY, REDUCTION_IN_RANK, COMPULSORY_RETIREMENT, REMOVAL, DISMISSAL, FINE, WARNING |
| `penalty_class` | MINOR, MAJOR |
| `pension_effect` | NONE, WITHHELD, REDUCED_PCT |
| `remedy_type` | APPEAL, REVISION, REVIEW |
| `appeal_decision` | UPHELD, SET_ASIDE, MODIFIED, ENHANCED, REMITTED, REJECTED |
| `appeal_status` | FILED, ADMITTED, UNDER_REVIEW, DECIDED, REJECTED |
| `timeline_event_type` | STAGE_ENTERED, STAGE_COMPLETED, SLA_BREACH, ESCALATION, **SLA_PAUSE (v2)**, **SLA_RESUME (v2)**, **JURISDICTION_TRANSFER (v2)**, NOTE |
| `sla_status` | ON_TRACK, AT_RISK, BREACHED, **PAUSED (v2)**, N_A |
| `vigilance_clearance` | CLEAR, WITHHELD, UNDER_PROCEEDINGS, NOT_CLEAR |
| `integrity_grade` | DOUBTFUL, SATISFACTORY |
| `artefact_type` | COMPLAINT, PI_REPORT, CHARGE_SHEET, DEFENCE, EXHIBIT, INQUIRY_REPORT, SHOW_CAUSE, ORDER, APPEAL, **CONSULTATION (v2)**, **SERVICE_PROOF (v2)**, **DISAGREEMENT_MEMO (v2)** |
| `signature_type` **(v2)** | DSC, ESIGN |
| `consultation_type` **(v2)** | UPSC, CVC_FIRST_STAGE, CVC_SECOND_STAGE, ICC, LEGAL, NONE |
| `consultation_status` **(v2)** | REQUIRED, REQUESTED, RECEIVED, CLOSED, WAIVED |
| `dispensation_reason` **(v2)** | CRIMINAL_CONVICTION, NOT_REASONABLY_PRACTICABLE, SECURITY_OF_STATE |
| `dispensation_status` **(v2)** | PROPOSED, APPROVED, REJECTED |
| `respondent_status` **(v2)** | ACTIVE, EXONERATED, PENALISED, ABATED, SEVERED |
| `sla_pause_reason` **(v2)** | STAY, REMIT, CONDONATION, CONSULTATION, CRIMINAL_STAY |
| `idempotency_scope` **(v2)** | SUSPENSION, ORDER_FINALISE, POST_TO_SR, APPEAL_DECIDE |
| `idempotency_status` **(v2)** | IN_PROGRESS, COMPLETED |

**Penalty classification reference (statutory):**

| Penalty | Class | Typical downstream effect |
|---------|-------|---------------------------|
| Censure | MINOR | SR entry only |
| Warning / Fine | MINOR | SR entry; fine → M10 recovery (capped, DI-22) |
| Withholding of increment(s) | MINOR (MAJOR if cumulative effect) | M10 pay, M06 progression |
| Withholding of promotion | MAJOR | M06 |
| Recovery from pay of loss caused | MINOR/MAJOR | M10 recovery (≤1/3 pay; instalments; DCRG-only beyond retirement, DI-22) |
| Reduction to lower stage/rank | MAJOR | M06 seniority, M10 pay |
| Compulsory retirement | MAJOR (Art. 311(1) competence) | M11 pension (reduced) |
| Removal from service | MAJOR (Art. 311(1) competence) | M11 |
| Dismissal from service | MAJOR (Art. 311(1) competence) | M11 (disqualifies future govt employment) |

### 5.6 Data integrity rules

1. **DI-1 Stage monotonicity:** `case_stage` may only advance along the state machine (§12); regression requires a `REMITTED`/`DE_NOVO`/appeal/jurisdiction-transfer event with recorded authority.
2. **DI-2 Distinct actors (extended, AI-23):** for a given `case_id`, the persons holding DA, IO, PO, and each witness must be **mutually distinct**; **the DA must not also be the complainant or a witness** on the same case (nemo judex in causa sua); a charged respondent can never be IO/PO/DA on their own case. DB constraint + service check.
3. **DI-3 No penalty without process:** a `penalty_orders` row of `order_type=PENALTY` requires valid legal service of a `charge_sheet`, a `defence_statements` row (or `is_ex_parte_assumed=true`), and — for `penalty_class=MAJOR` — a concluded `inquiry_reports` **or an approved `inquiry_dispensations`** (DI-23) and a responded/closed `show_cause_notices`.
4. **DI-4 Show-cause ⊇ order:** penalties in a finalised order must be a **subset** of the penalties proposed in the related show-cause (no enhancement beyond proposed without fresh show-cause).
5. **DI-5 Limitation guard:** `appeals.is_time_barred` is computed from `limitation_due_date` (per template); a time-barred appeal can be `ADMITTED` only if `condonation_granted=true`.
6. **DI-6 Immutability after finalise:** once `penalty_orders.status` ∈ {FINALISED, SERVED}, the order and its `penalty_items` are read-only; changes only via appeal/revision producing a new `revised_order_id`.
7. **DI-7 Evidence seal:** every `inquiry_exhibits`/`case_documents` row stores `content_hash`; mismatch on read raises `EVIDENCE_TAMPERED`.
8. **DI-8 Subsistence floor/ceiling:** `subsistence_rate_pct` ∈ [template floor, ceiling] (default [25, 75]); must be reviewed before `subsistence_revision_due`.
9. **DI-9 Confidentiality (extended, AI-24):** rows with `is_confidential_source=true` never expose complainant identity outside Vigilance Officer/DA. **However, any PI/sealed/consultation material `relied_upon=true` as evidence MUST be disclosed to the charged officer (`disclosed_to_charged=true`)** before a finding can rest on it; violation raises `NATURAL_JUSTICE_VIOLATION`.
10. **DI-10 SR posting once:** at most one non-superseded `service_register_events` per finalised order; supersession only via appeal outcome.
11. **DI-11 Referential integrity:** all FKs enforced; soft-deleted parents block new children.
12. **DI-12 Append-only ledgers:** `case_timeline_events`, `sla_pause_events`, and `audit_log` are insert-only; no update/delete.
13. **DI-13 Penalty competence (v2, AI-1, R1):** finalising any `penalty_items` row requires `passed_by` to be competent for that penalty class/type per `authority_competence` for the respondent's cadre. For DISMISSAL/REMOVAL/CR, the authority must **not be subordinate to the appointing authority** (Art. 311(1)). Otherwise return `AUTHORITY_NOT_COMPETENT` (409) and refuse persistence. `competence_verified` must be true to finalise.
14. **DI-14 Mandatory consultation (v2, AI-2, R2):** finalise is blocked until every `case_consultations` row that the case's `procedure_template` marks mandatory is `CLOSED` (or `WAIVED` with reasons). Otherwise `CONSULTATION_PENDING` (409).
15. **DI-15 Legal service validity (v2, AI-5, R5):** statutory reply windows and downstream deadlines compute **only** from a `legal_service_records` row whose `is_statutorily_valid=true` (mode ∈ template `valid_service_modes_json`). EMAIL is non-statutory by default. Informational `notifications` never constitute service.
16. **DI-16 Subsistence correctness (v2, AI-6, R6):** a subsistence payment event to M10 requires `non_employment_certificate_received=true`. If a charge-memo is not validly served by `charge_memo_due_date` (90-day window), set `deemed_review_flag=true` and escalate for review/possible revocation.
17. **DI-17 Kernel invariance (v2, AI-8, R8):** the natural-justice kernel (DI-2/3/4/9/13/14/20) is enforced for **all** templates and cannot be parameterised away; `procedure_templates` may only configure the named overlay items. No generic BPM/rules designer.
18. **DI-18 SLA pause/resume integrity (v2, AI-10, R10):** while an open `sla_pause_events` row exists for a stage, that stage's `sla_status=PAUSED` and no breach is raised; on resume, `sla_target_at`/`expected_closure_date` are recomputed by adding the paused duration.
19. **DI-19 Idempotency dedup (v2, AI-11, R11):** a propagating post (SUSPENSION, ORDER_FINALISE, POST_TO_SR, APPEAL_DECIDE) with a previously-seen `idempotency_key` + matching fingerprint returns the stored result and produces **no** second effect; mismatching fingerprint on a seen key returns `IDEMPOTENCY_CONFLICT` (409). Keys expire per TTL.
20. **DI-20 Proportionality reasoning (v2, AI-12, R12):** a `PENALTY` order cannot be finalised unless `proportionality_reasoning` is non-empty; analytics flags outliers (penalty severity vs misconduct/precedent).
21. **DI-21 Hash-chained audit (v2, AI-15, R15):** each `case_timeline_events` row stores `prev_hash` (prior row's `row_hash`) and a computed `row_hash`; the verify endpoint recomputes the chain and raises `AUDIT_CHAIN_BROKEN` on any mismatch.
22. **DI-22 Recovery caps (v2, AI-20, R20):** for RECOVERY/FINE items, monthly deduction ≤ `recovery_monthly_cap_pct` (default 1/3 of pay), instalments bounded, and no recovery beyond retirement except from DCRG (`recovery_beyond_retirement` ⇒ DCRG source); violation `RECOVERY_CAP_EXCEEDED` (422).
23. **DI-23 Dispensation guard (v2, AI-3, R3):** a penalty without an inquiry is lawful only if an `inquiry_dispensations` row is `APPROVED` with a valid `reason_code` permitted by the template and recorded speaking reasons; else `DUE_PROCESS_INCOMPLETE`.
24. **DI-24 Inspection afforded (v2, AI-4, R4):** an inquiry cannot record substantive evidence (witness examination/exhibit admission) unless `list_supplied_date` and `inspection_afforded_date` are set; else `INSPECTION_NOT_AFFORDED` (409).
25. **DI-25 Multi-respondent consistency (v2, AI-7, R7):** in common proceedings, every `case_respondents` row gets article-wise findings; an order/exoneration must exist per ACTIVE respondent before the case closes; severance (`SEVERED`) requires recorded reasons.
26. **DI-26 Abatement terminal (v2, AI-14, R14):** on charged-officer death, the case/respondent moves to `ABATED`; SLAs stop, downstream penalty effects are suppressed, and no further penalty order may be finalised for that respondent.
27. **DI-27 Retiree proceedings (v2, AI-13, R13):** proceedings against a retired employee require `is_retiree_case=true`, a recorded `retiree_sanction_ref`, and must respect the Rule 9 **four-year** event bar; failing the bar/sanction returns `RETIREE_PROCEEDING_BARRED` (409).
28. **DI-28 Digital signing (v2, AI-17, R17):** charge-sheets, inquiry reports, show-cause notices, and orders cannot reach a served/finalised state without `signature_type` ∈ {DSC, ESIGN}, a bound `signatory_id`, and `signed_at`; else `SIGNATURE_REQUIRED` (422).
29. **DI-29 Personal-hearing record (v2, AI-21):** where a personal hearing is requested at SHOW_CAUSE/APPEAL, a `personal_hearings` row must record grant/denial; denial requires `denial_reason`; an order/appeal decision references the hearing where held.

### 5.7 Sample data (2–3 rows per module entity)

**`disciplinary_cases`**

| case_id | case_no | charged_employee_id | procedure_template_id | case_type | misconduct_category | case_status | current_stage | is_under_suspension | disciplinary_authority_id |
|---|---|---|---|---|---|---|---|---|---|
| 8f1c…01 | DCP/2026/000101 | emp-3001 | tpl-ccs | MAJOR_PENALTY_TRACK | FINANCIAL_IRREGULARITY | INQUIRY | INQUIRY | false | emp-9001 |
| 8f1c…02 | DCP/2026/000102 | emp-3002 | tpl-ccs | MINOR_PENALTY_TRACK | ABSENCE_UNAUTHORISED | PENALTY_IMPOSED | CLOSED | false | emp-9002 |
| 8f1c…04 | DCP/2026/000104 | emp-3004 | tpl-posh | MAJOR_PENALTY_TRACK | HARASSMENT | INQUIRY | INQUIRY | false | emp-9003 |

**`case_complaints`**

| complaint_id | complaint_no | case_id | subject_employee_id | source_type | is_anonymous | received_date | triage_decision |
|---|---|---|---|---|---|---|---|
| c-001 | CMP/2026/501 | 8f1c…01 | emp-3001 | AUDIT | false | 2026-02-01 | FILE_CASE |
| c-002 | CMP/2026/502 | 8f1c…03 | emp-3003 | CVC | false | 2026-02-25 | PRELIMINARY_INQUIRY |
| c-004 | CMP/2026/504 | 8f1c…04 | emp-3004 | INTERNAL | false | 2026-03-15 | FILE_CASE |

**`preliminary_inquiries`**

| pi_id | case_id | pi_officer_id | ordered_date | due_date | status | recommendation | contains_relied_material |
|---|---|---|---|---|---|---|---|
| pi-01 | 8f1c…03 | emp-7001 | 2026-02-26 | 2026-03-26 | SUBMITTED | PROCEED_MAJOR | true |
| pi-02 | 8f1c…01 | emp-7002 | 2026-02-02 | 2026-03-02 | CLOSED | PROCEED_MAJOR | false |

**`suspensions`**

| suspension_id | case_id | employee_id | suspension_type | order_no | effective_from | status | subsistence_rate_pct | non_employment_certificate_received | charge_memo_due_date | deemed_review_flag |
|---|---|---|---|---|---|---|---|---|---|---|
| sus-01 | 8f1c…03 | emp-3003 | ORDERED | SUS/2026/77 | 2026-03-01 | ACTIVE | 50.00 | true | 2026-05-30 | false |
| sus-02 | 8f1c…01 | emp-3001 | DEEMED | SUS/2026/41 | 2026-02-11 | REVOKED | 50.00 | false | 2026-05-11 | true |

**`charge_sheets`**

| charge_sheet_id | case_id | charge_sheet_no | penalty_track | issued_date | signature_type | legal_service_id | defence_due_date | status |
|---|---|---|---|---|---|---|---|---|
| cs-01 | 8f1c…01 | CS/2026/201 | MAJOR | 2026-03-05 | DSC | ls-01 | 2026-03-23 | RESPONDED |
| cs-02 | 8f1c…02 | CS/2026/202 | MINOR | 2026-01-10 | ESIGN | ls-02 | 2026-01-22 | RESPONDED |

**`charge_articles`**

| article_id | charge_sheet_id | article_no | article_text (abbrev) | rule_violated | finding |
|---|---|---|---|---|---|
| ar-01 | cs-01 | 1 | Sanctioned payment without verification | CCS(Conduct) Rule 3 | PROVED |
| ar-02 | cs-01 | 2 | Failed to maintain devolution records | CCS(Conduct) Rule 3(1)(ii) | PARTLY_PROVED |
| ar-03 | cs-02 | 1 | Unauthorised absence 12 days | CCS(Conduct) Rule 3 | PROVED |

**`defence_statements`**

| defence_id | charge_sheet_id | respondent_id | submitted_by | plea | requests_personal_hearing | is_ex_parte_assumed |
|---|---|---|---|---|---|---|
| def-01 | cs-01 | resp-01 | emp-3001 | DENIES_ALL | true | false |
| def-02 | cs-02 | resp-02 | emp-3002 | ADMITS_ALL | false | false |

**`inquiry_proceedings`**

| inquiry_id | case_id | charge_sheet_id | inquiry_route | status | list_supplied_date | inspection_afforded_date | is_stayed | due_date |
|---|---|---|---|---|---|---|---|---|
| inq-01 | 8f1c…01 | cs-01 | ORDINARY_IO | IN_PROGRESS | 2026-04-02 | 2026-04-04 | false | 2026-10-01 |
| inq-04 | 8f1c…04 | cs-04 | ICC_POSH | IN_PROGRESS | 2026-03-25 | 2026-03-28 | false | 2026-09-25 |

**`inquiry_appointments`**

| appointment_id | inquiry_id | role_type | officer_id | is_external_member | appointed_date | status |
|---|---|---|---|---|---|---|
| ap-01 | inq-01 | INQUIRY_OFFICER | emp-6001 | false | 2026-03-25 | ACTIVE |
| ap-02 | inq-01 | PRESENTING_OFFICER | emp-6002 | false | 2026-03-25 | ACTIVE |
| ap-04 | inq-04 | ICC_EXTERNAL_MEMBER | (ext) | true | 2026-03-20 | ACTIVE |

**`inquiry_hearings`**

| hearing_id | inquiry_id | hearing_no | scheduled_date | outcome | next_hearing_date |
|---|---|---|---|---|---|
| h-01 | inq-01 | 1 | 2026-04-05T10:00Z | HELD | 2026-04-19T10:00Z |
| h-02 | inq-01 | 2 | 2026-04-19T10:00Z | ADJOURNED | 2026-05-03T10:00Z |

**`inquiry_witnesses`**

| witness_id | inquiry_id | side | witness_employee_id | is_listed_for_inspection | examination_status |
|---|---|---|---|---|---|
| w-01 | inq-01 | PROSECUTION | emp-7010 | true | CROSS_EXAMINED |
| w-02 | inq-01 | DEFENCE | emp-7011 | true | EXAMINED |

**`inquiry_exhibits`**

| exhibit_id | inquiry_id | exhibit_marker | side | source_is_pi | relied_upon | disclosed_to_charged | sealed |
|---|---|---|---|---|---|---|---|
| ex-01 | inq-01 | P-1 | PROSECUTION | true | true | true | true |
| ex-02 | inq-01 | D-1 | DEFENCE | false | true | true | true |

**`inquiry_reports`**

| report_id | inquiry_id | submitted_by | submitted_date | overall_finding | signature_type | status |
|---|---|---|---|---|---|---|
| rep-01 | inq-01 | emp-6001 | 2026-08-20 | MIXED | DSC | UNDER_DA_REVIEW |

**`disagreement_memos`**

| memo_id | report_id | issued_by | served_date | legal_service_id | status |
|---|---|---|---|---|---|
| dm-01 | rep-01 | emp-9001 | 2026-09-01 | ls-05 | SERVED |

**`show_cause_notices`**

| notice_id | case_id | notice_no | respondent_id | issued_date | response_due_date | personal_hearing_id | status |
|---|---|---|---|---|---|---|---|
| sc-01 | 8f1c…01 | SCN/2026/301 | resp-01 | 2026-09-20 | 2026-10-05 | ph-01 | RESPONDED |

**`penalty_orders`**

| order_id | case_id | order_no | respondent_id | order_type | competence_verified | proportionality_reasoning | signature_type | is_speaking_order | status |
|---|---|---|---|---|---|---|---|---|---|
| po-01 | 8f1c…02 | ORD/2026/401 | resp-02 | PENALTY | true | "Censure proportionate to 12-day absence; first offence" | ESIGN | true | SERVED |
| po-02 | 8f1c…01 | ORD/2026/402 | resp-01 | PENALTY | true | "Withholding + recovery proportionate to financial loss of ₹1.5L" | DSC | true | FINALISED |

**`penalty_items`**

| penalty_item_id | order_id | penalty_type | penalty_class | duration_months | recovery_amount | recovery_monthly_cap_pct | recovery_beyond_retirement |
|---|---|---|---|---|---|---|---|
| pi-it-01 | po-01 | CENSURE | MINOR | null | null | null | null |
| pi-it-02 | po-02 | WITHHOLD_INCREMENT | MAJOR | 24 | null | null | null |
| pi-it-03 | po-02 | RECOVERY | MAJOR | null | 150000.00 | 33.33 | false |

**`appeals`**

| appeal_id | case_id | order_id | remedy_type | filed_date | limitation_due_date | is_time_barred | authority_competence_verified | decision | status |
|---|---|---|---|---|---|---|---|---|---|
| ap-app-01 | 8f1c…02 | po-01 | APPEAL | 2026-02-20 | 2026-03-18 | false | true | UPHELD | DECIDED |
| ap-app-02 | 8f1c…01 | po-02 | APPEAL | 2026-11-30 | 2026-11-26 | true | true | null | FILED |

**`case_timeline_events`** (hash-chained)

| event_id | case_id | stage | event_type | event_at | sla_status | seq_no | prev_hash | row_hash |
|---|---|---|---|---|---|---|---|---|
| te-01 | 8f1c…01 | CHARGE | STAGE_COMPLETED | 2026-03-23T00:00Z | ON_TRACK | 12 | a91f… | 7c02… |
| te-02 | 8f1c…01 | INQUIRY | SLA_PAUSE | 2026-06-10T00:00Z | PAUSED | 18 | 7c02… | b4d1… |

**`vigilance_records`**

| vigilance_id | employee_id | case_id | clearance_status | integrity_grade | sealed_cover_flag | valid_from |
|---|---|---|---|---|---|---|
| vr-01 | emp-3003 | 8f1c…03 | UNDER_PROCEEDINGS | DOUBTFUL | true | 2026-03-01 |
| vr-02 | emp-3010 | null | CLEAR | SATISFACTORY | false | 2026-01-01 |

**`case_documents`**

| case_document_id | case_id | artefact_type | document_id | is_served | signature_type | content_hash |
|---|---|---|---|---|---|---|
| cd-01 | 8f1c…01 | CHARGE_SHEET | doc-5001 | true | DSC | 5a1c… |
| cd-02 | 8f1c…01 | PI_REPORT | doc-5002 | false | null | 9b22… |
| cd-03 | 8f1c…01 | ORDER | doc-5003 | true | DSC | c771… |

**`procedure_templates`** (v2)

| template_id | template_code | jurisdiction_code | applies_to_misconduct | appeal_limitation_days | inquiry_route_default |
|---|---|---|---|---|---|
| tpl-ccs | CCS_CCA_2026 | CCS_CCA | null | 45 | ORDINARY_IO |
| tpl-posh | POSH_ICC | POSH_ICC | HARASSMENT | 90 | ICC_POSH |
| tpl-corp | CORP_INDIA | CORP_INDIA | null | 30 | ORDINARY_IO |

**`authority_competence`** (v2)

| competence_id | competence_set_code | subject_cadre | penalty_class | penalty_type | min_authority_level | requires_not_subordinate_to_appointing |
|---|---|---|---|---|---|---|
| ac-01 | CCS_DEFAULT | GROUP_B | MAJOR | DISMISSAL | APPOINTING_AUTHORITY | true |
| ac-02 | CCS_DEFAULT | GROUP_B | MINOR | null | HEAD_OF_DEPT | false |
| ac-03 | CCS_DEFAULT | GROUP_A | MAJOR | REMOVAL | APPOINTING_AUTHORITY | true |

**`case_consultations`** (v2)

| consultation_id | case_id | consultation_type | status | is_mandatory | received_date |
|---|---|---|---|---|---|
| con-01 | 8f1c…01 | CVC_FIRST_STAGE | CLOSED | true | 2026-02-20 |
| con-02 | 8f1c…01 | UPSC | RECEIVED | true | 2026-09-30 |
| con-04 | 8f1c…04 | ICC | CLOSED | true | 2026-09-10 |

**`inquiry_dispensations`** (v2)

| dispensation_id | case_id | reason_code | authority_id | status | approved_date |
|---|---|---|---|---|---|
| dsp-01 | 8f1c…05 | CRIMINAL_CONVICTION | emp-9001 | APPROVED | 2026-04-10 |
| dsp-02 | 8f1c…06 | NOT_REASONABLY_PRACTICABLE | emp-9002 | PROPOSED | 2026-05-02 |

**`legal_service_records`** (v2)

| service_id | case_id | artefact_type | service_mode | is_statutorily_valid | served_date | served_by |
|---|---|---|---|---|---|---|
| ls-01 | 8f1c…01 | CHARGE_SHEET | REGD_POST | true | 2026-03-08 | emp-8001 |
| ls-02 | 8f1c…02 | CHARGE_SHEET | IN_PERSON | true | 2026-01-12 | emp-8002 |
| ls-09 | 8f1c…07 | ORDER | EMAIL | false | 2026-06-01 | emp-8003 |

**`case_respondents`** (v2)

| respondent_id | case_id | employee_id | respondent_role_in_misconduct | subject_cadre | disciplinary_authority_id | status | is_primary |
|---|---|---|---|---|---|---|---|
| resp-01 | 8f1c…01 | emp-3001 | sanctioning officer | GROUP_B | emp-9001 | ACTIVE | true |
| resp-02 | 8f1c…02 | emp-3002 | sole | GROUP_C | emp-9002 | PENALISED | true |
| resp-05 | 8f1c…01 | emp-3005 | verifying officer | GROUP_C | emp-9001 | ACTIVE | false |

**`sla_pause_events`** (v2)

| pause_id | case_id | stage | reason | paused_from | resumed_at | recompute_applied |
|---|---|---|---|---|---|---|
| sp-01 | 8f1c…01 | INQUIRY | CONSULTATION | 2026-06-10T00:00Z | 2026-09-30T00:00Z | true |
| sp-02 | 8f1c…05 | INQUIRY | CRIMINAL_STAY | 2026-04-15T00:00Z | null | false |

**`personal_hearings`** (v2)

| hearing_id | case_id | respondent_id | stage | requested | granted | held_date | presided_by |
|---|---|---|---|---|---|---|---|
| ph-01 | 8f1c…01 | resp-01 | SHOW_CAUSE | true | true | 2026-10-01T10:00Z | emp-9001 |
| ph-02 | 8f1c…02 | resp-02 | APPEAL | true | false | null | emp-9100 |

**`idempotency_keys`** (v2)

| idempotency_key | scope | case_id | status | first_seen_at | expires_at |
|---|---|---|---|---|---|
| idem-finalise-po02 | ORDER_FINALISE | 8f1c…01 | COMPLETED | 2026-10-12T09:00Z | 2026-10-19T09:00Z |
| idem-sr-po02 | POST_TO_SR | 8f1c…01 | COMPLETED | 2026-10-12T09:05Z | 2026-10-19T09:05Z |

---

## 6. Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table. FR-001…016 are carried from v1 with v2 amendments marked **(v2)**; FR-017…028 are new in v2.

---

### FR-M09-001 — Complaint / Source-of-Misconduct Registration & Triage

- **Module:** M09-DCP
- **Primary Role(s):** Complainant, Vigilance Officer, DCP Admin, Disciplinary Authority

**User Story:** As a Vigilance Officer, I want to register and triage every complaint or detected source of misconduct so that only substantiated matters proceed to a formal case while all sources remain auditable.

**Description:** Captures complaints from internal, public, anonymous, audit, media, CVC, or suo-motu sources, deduplicates against existing cases for the same subject, and supports a triage decision (file case / order preliminary inquiry / close with no action / transfer to another agency). On `FILE_CASE`, the correct **`procedure_template`** is resolved (by jurisdiction + misconduct; HARASSMENT ⇒ POSH/ICC) and the **competent DA** is resolved and competence-checked. Anonymous and whistle-blower sources are handled with identity protection.

**Acceptance Criteria:**
1. A complaint can be registered with a unique `complaint_no`, mandatory `allegation_summary` and `subject_employee_id` (or external subject reference).
2. Anonymous complaints are accepted with `complainant_id` null and `is_anonymous=true`; whistle-blower flag hides identity per DI-9.
3. The system surfaces existing open cases/complaints for the same subject before allowing a new case (duplicate guard).
4. Triage records a `triage_decision`, `triaged_by`, `triaged_at`, and remarks; `FILE_CASE` creates a `disciplinary_cases` row in `OPEN`/`INTAKE`, resolves and stamps `procedure_template_id` and `jurisdiction_code` **(v2)**, and creates the primary `case_respondents` row **(v2)**.
5. **(v2)** On `FILE_CASE` the resolved DA must not be the complainant or a witness (DI-2); HARASSMENT sets `is_posh_case=true` and selects the ICC template.
6. Every action writes to hash-chained `audit_log` and a `case_timeline_events` entry once a case exists.

**Business Rules:**
- BR-1: Only Vigilance Officer or DA may set `triage_decision`.
- BR-2: `CLOSE_NO_ACTION` requires remarks and DA concurrence for vigilance-flagged complaints.
- BR-3: Promotion to a case requires a competent `disciplinary_authority_id` resolvable from org hierarchy and `authority_competence`.
- BR-4 **(v2):** Template resolution is mandatory; if no template matches jurisdiction+misconduct, `PROCEDURE_TEMPLATE_INVALID` (422).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_complaints` | create/triage |
| `disciplinary_cases` | created on FILE_CASE (+ template/jurisdiction) |
| `case_respondents` | primary respondent created **(v2)** |
| `procedure_templates` | resolve overlay **(v2)** |
| `vigilance_records` | optional link |
| `case_timeline_events` | timeline |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/complaints` | Register complaint |
| GET | `/api/v1/dcp/complaints?subjectId=` | List/dedup |
| POST | `/api/v1/dcp/complaints/{id}/triage` | Triage decision (resolves template + DA) |

**UI Behavior Notes:** Intake form with source-type selector; anonymous toggle hides complainant fields; a live "existing matters for this employee" panel; triage drawer with decision radio + remarks; **(v2)** auto-resolved template + DA shown with competence badge before confirm.

**Edge Cases:** Subject is a non-employee/contractor (external subject ref); subject already retired (route to retiree-proceeding path FR-026, M11 advisory); same allegation re-submitted (merge); **(v2)** DA resolves to the complainant ⇒ block with `DA_BIAS_CONFLICT`; HARASSMENT routes to ICC template.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ComplaintIntakeForm`, `DuplicateGuardPanel`, `TriageDrawer`, `TemplateResolverBadge`; services `ComplaintService`, `TriageService`, `TemplateResolver`, `CompetenceResolver` |
| Backend Flow | Validate → dedup query → persist complaint → on FILE_CASE: resolve template (jurisdiction+misconduct) → resolve+verify DA competence + DI-2 bias → open case + primary respondent in txn → emit hash-chained timeline + audit |
| Data Operations | INSERT `case_complaints`; conditional INSERT `disciplinary_cases`, `case_respondents`, `case_timeline_events`; INSERT `audit_log` |
| Validation | Required summary/subject; enum checks; anonymous ⇒ complainant null; CLOSE_NO_ACTION ⇒ remarks; template resolvable; DA ≠ complainant/witness |
| Authorization | RBAC: register (Complainant/Vigilance/Admin); triage (Vigilance/DA) |
| State Changes & Side Effects | FILE_CASE ⇒ case `INTAKE`; notification to DA; vigilance flag sets `clearance_status=UNDER_PROCEEDINGS` |
| Failure Handling | Dup ⇒ 409 `DUPLICATE_COMPLAINT`; missing DA ⇒ 422 `DA_NOT_RESOLVED`; no template ⇒ 422 `PROCEDURE_TEMPLATE_INVALID`; DA is complainant ⇒ 409 `DA_BIAS_CONFLICT` |
| Dependencies | M01 (employees), `procedure_templates`, `authority_competence`, notifications, audit |
| Test Guidance | Dedup; anonymity masking; template resolution; DA-bias block; triage→case+respondent txn |

---

### FR-M09-002 — Preliminary (Fact-Finding) Inquiry

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Vigilance Officer, PI Officer, DCP Admin

**User Story:** As a Disciplinary Authority, I want to order a preliminary inquiry so that I can decide, on facts, whether formal charges are warranted and on which track.

**Description:** Orders a confidential fact-finding inquiry, assigns a PI officer, tracks an SLA, and records findings with a recommendation. The PI report is confidential and **normally** not served — **but any PI material later relied upon as evidence in the inquiry must be disclosed to the charged officer (`relied_upon ⇒ disclosed`, DI-9, AI-24)**.

**Acceptance Criteria:**
1. DA/Vigilance can order a PI with `pi_officer_id`, `ordered_date`, and `due_date`.
2. PI status transitions ORDERED → IN_PROGRESS → SUBMITTED → CLOSED.
3. On submission a `recommendation` and confidential `report_document_id` are required.
4. PI report is stored with `is_served=false` and excluded from the charged officer's view (DI-9/§3.3).
5. **(v2)** If PI material is marked `relied_upon=true` as an exhibit, the system forces `disclosed_to_charged=true` before any finding can rest on it; `contains_relied_material` is set on the PI.
6. SLA breach raises a timeline `SLA_BREACH` + escalation notification.

**Business Rules:**
- BR-1: PI officer ≠ subject; PI officer should not later be IO on the same case (warn + override-with-reason).
- BR-2: `DROP` recommendation requires DA approval and closes the case with `DROPPED` if no charges.
- BR-3: PI is optional for clear-cut minor matters (skippable to charge).
- BR-4 **(v2):** PI material relied upon but not disclosed blocks finding (`NATURAL_JUSTICE_VIOLATION`).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `preliminary_inquiries` | create/update |
| `disciplinary_cases` | stage update |
| `inquiry_exhibits` | relied/disclosed flags **(v2)** |
| `case_documents` | sealed PI report |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/preliminary-inquiries` | Order PI |
| PATCH | `/api/v1/dcp/preliminary-inquiries/{id}` | Update progress |
| POST | `/api/v1/dcp/preliminary-inquiries/{id}/submit` | Submit report |

**UI Behavior Notes:** PI order modal; officer picker excluding subject; SLA countdown chip; confidential report uploader; recommendation selector gated to submission; **(v2)** "relied-upon material" panel that warns disclosure is mandatory.

**Edge Cases:** PI officer recuses (reassign); evidence suggests criminal angle (set `criminal_case_ref`, route TRANSFER_AGENCY); PI exceeds SLA (auto-escalation); **(v2)** PI material relied upon at inquiry triggers a disclosure task.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PIOrderModal`, `PIWorkbench`, `SLABadge`, `ReliedMaterialPanel`; `PreliminaryInquiryService` |
| Backend Flow | Validate authority → create PI → state machine guard → on submit attach sealed doc + recommendation → update case stage; on relied-upon mark, enforce disclosure gate |
| Data Operations | INSERT/UPDATE `preliminary_inquiries`; INSERT sealed `case_documents`; UPDATE `disciplinary_cases.current_stage`; UPDATE `inquiry_exhibits.disclosed_to_charged` |
| Validation | due_date > ordered_date; officer ≠ subject; submit requires recommendation + doc; relied ⇒ disclosed |
| Authorization | Order: DA/Vigilance; Submit: PI officer |
| State Changes & Side Effects | Case → `PRELIMINARY_INQUIRY`; DROP ⇒ case `DROPPED`; notifications to DA |
| Failure Handling | Invalid transition ⇒ 409 `INVALID_STATE_TRANSITION`; missing doc ⇒ 422; relied-not-disclosed ⇒ 409 `NATURAL_JUSTICE_VIOLATION` |
| Dependencies | M13 (sealed doc), notifications, SLA engine (FR-016) |
| Test Guidance | Confidentiality (charged officer cannot fetch PI report); relied-upon disclosure gate; SLA breach |

---

### FR-M09-003 — Suspension (Parallel Status), Subsistence Allowance & Review

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, Payroll Officer (downstream)

**User Story:** As a Disciplinary Authority, I want to place an employee under suspension (or record deemed suspension) and manage subsistence allowance so that interim action is lawful, payroll-correct, periodically reviewed, and does not stall the main proceeding.

**Description:** **(v2)** Suspension is modelled as a **parallel interim status** on the case (`is_under_suspension`/`suspension_status`), **not a linear stage** — the charge/inquiry track proceeds concurrently. Issues suspension orders (ordered/deemed/continued), sets subsistence within statutory bounds, **gates the subsistence payment event on a non-employment certificate (DI-16)**, schedules mandatory periodic review, **auto-flags a deemed review when the charge-memo is not served within the 90-day window (Ajay Kumar Choudhary, DI-16)**, emits a payroll event to M10, and supports revocation.

**Acceptance Criteria:**
1. A suspension order sets `effective_from`, `subsistence_rate_pct` ∈ [template floor, ceiling], sets case `is_under_suspension=true` (parallel) **(v2)**, and updates `employees.employment_status=SUSPENDED` via M01 event.
2. Deemed suspension auto-creates a record when detention > 48h is recorded.
3. **(v2)** The subsistence payment event to M10 is emitted **only** when `non_employment_certificate_received=true`; otherwise the payment is held and flagged.
4. A subsistence review task is scheduled before `subsistence_revision_due` (default 90 days) and a review-board task before `review_committee_due` (default 180 days).
5. **(v2)** If a valid charge-memo is not served by `charge_memo_due_date` (90 days), set `deemed_review_flag=true`, raise escalation, and surface auto-revocation review.
6. Revocation sets `status=REVOKED`, `effective_to`, and emits M10 + M01 events; an SR event is appended for suspension and revocation (FR-013).

**Business Rules:**
- BR-1: Subsistence rate revision blocked outside [floor, ceiling] (DI-8).
- BR-2: Suspension during inquiry cannot exceed configured limit without documented extension.
- BR-3: Period-of-suspension treatment decided at final order, not at revocation.
- BR-4 **(v2):** No subsistence disbursement without NEC (DI-16).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `suspensions` | create/update (NEC, deemed review) |
| `disciplinary_cases` | parallel status flag **(v2)** |
| `service_register_events` | SR posting |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/suspensions` | Order suspension (`Idempotency-Key`) |
| POST | `/api/v1/dcp/suspensions/{id}/non-employment-certificate` | Record NEC **(v2)** |
| POST | `/api/v1/dcp/suspensions/{id}/revise-subsistence` | Revise rate |
| POST | `/api/v1/dcp/suspensions/{id}/revoke` | Revoke |

**UI Behavior Notes:** Suspension order form with rate slider bounded to template floor/ceiling; **(v2)** NEC status chip that blocks payment until received; review-due reminders on case header; deemed-review banner when 90-day window lapses; revocation drawer with reason + pay-treatment note. Suspension shown as a **parallel ribbon**, not a stepper step.

**Edge Cases:** Employee retires during suspension (FR-026 retiree path); deemed suspension where detention later quashed; subsistence not revised in time (AT_RISK then escalation); **(v2)** NEC never furnished (payment held indefinitely, flagged); charge-memo lapses 90 days (deemed review).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SuspensionOrderForm`, `NECPanel`, `SubsistenceReviewPanel`, `DeemedReviewBanner`; `SuspensionService`, `PayrollEventEmitter` |
| Backend Flow | Validate bounds → persist suspension in txn → set parallel case flag → emit M01 status event + M12 SR event → schedule review tasks → emit M10 subsistence event **only if NEC received** → scheduled job sets `deemed_review_flag` on 90-day lapse |
| Data Operations | INSERT/UPDATE `suspensions`; UPDATE `disciplinary_cases.is_under_suspension/suspension_status`; INSERT `service_register_events`; INSERT `workflow_tasks` |
| Validation | rate within template bounds; effective_to > effective_from; deemed needs detention proof; NEC for payment |
| Authorization | DA only; step-up MFA |
| State Changes & Side Effects | Case parallel flag set; employee → SUSPENDED; subsistence begins (post-NEC); SR event |
| Failure Handling | Out of bounds ⇒ 422 `SUBSISTENCE_OUT_OF_BOUNDS`; payment without NEC ⇒ 422 `NON_EMPLOYMENT_CERT_REQUIRED`; M10/M01 down ⇒ outbox retry (`UPSTREAM_UNAVAILABLE`) |
| Dependencies | M01, M10, M12, workflow engine, idempotency store |
| Test Guidance | Bound checks; NEC gate; deemed-review on lapse; parallel-flag (not stage); outbox retry; SR idempotency |

---

### FR-M09-004 — Charge-Sheet / Articles of Charge (Statement of Imputations)

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, Presenting Officer (draft)

**User Story:** As a Disciplinary Authority, I want to frame and serve a digitally-signed charge-sheet with distinct articles of charge so that each charged officer knows precisely what they must answer.

**Description:** Builds a memorandum of charges with one or more articles; selects penalty track; **generates a DSC/eSign-signed PDF (M13, DI-28)**; records **valid legal service via `legal_service_records` (DI-15)** with mode and computes the statutory defence-reply window from the valid-service date. **(v2)** In common proceedings, the charge-sheet maps to multiple `case_respondents`.

**Acceptance Criteria:**
1. A charge-sheet requires at least one `charge_articles` row; each article requires text, imputation, and rule.
2. Penalty track (MINOR/MAJOR) determines downstream path.
3. **(v2)** On issue, a **DSC/eSign-signed** PDF is produced (`signature_type`, `signatory_id`, `signed_at`); without a signature the sheet cannot be served (`SIGNATURE_REQUIRED`).
4. **(v2)** Service is recorded as a `legal_service_records` row; `defence_due_date` computes **only** from a `is_statutorily_valid=true` service (EMAIL non-statutory by default); invalid mode ⇒ `INVALID_SERVICE_MODE`.
5. The served charge-sheet is visible to the charged officer (`is_served=true`).

**Business Rules:**
- BR-1: A charge-sheet cannot be served before active suspension review obligations are satisfied (warn-only).
- BR-2: Withdrawal requires reason and DA approval; a withdrawn sheet cannot host an inquiry.
- BR-3: Articles uniquely numbered and immutable after service (amendment ⇒ supplementary charge-sheet).
- BR-4 **(v2):** Valid service mode must be in the template `valid_service_modes_json`.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `charge_sheets` | create/issue/serve (+ signature) |
| `charge_articles` | articles |
| `legal_service_records` | valid service **(v2)** |
| `case_respondents` | mapped respondents **(v2)** |
| `case_documents` | served signed PDF |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/charge-sheets` | Draft |
| POST | `/api/v1/dcp/charge-sheets/{id}/issue` | Issue + DSC/eSign + generate PDF |
| POST | `/api/v1/dcp/charge-sheets/{id}/serve` | Record legal service |

**UI Behavior Notes:** Article builder (repeatable rows), rule-violated lookup, track selector, PDF preview, **(v2)** sign-with-DSC/eSign step, service-recording panel showing only template-valid modes and an EMAIL "non-statutory" warning, auto-computed reply due-date.

**Edge Cases:** Substituted/published service when employee absconds; supplementary charges after inquiry begins (de novo/addendum); multilingual charge-sheet; **(v2)** attempt to serve unsigned sheet ⇒ blocked; EMAIL chosen where not permitted ⇒ blocked.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ChargeSheetBuilder`, `ArticleEditor`, `SignStep`, `ServiceRecorder`; `ChargeSheetService`, `PdfRenderer`, `SigningService`, `LegalServiceService` |
| Backend Flow | Validate articles → persist draft → issue: render PDF via M13, call DSC/eSign trust service, lock articles → serve: create `legal_service_records`, compute validity + due-date, mark served, notify |
| Data Operations | INSERT `charge_sheets`,`charge_articles`; INSERT `legal_service_records`; INSERT `case_documents`(served, signed); UPDATE case stage |
| Validation | ≥1 article; unique article_no; signature present before serve; valid service mode |
| Authorization | Draft: PO/Admin; Issue/Serve: DA |
| State Changes & Side Effects | Case → `CHARGE` then `DEFENCE`; article immutability lock; defence task created |
| Failure Handling | Unsigned serve ⇒ 422 `SIGNATURE_REQUIRED`; invalid mode ⇒ 409 `INVALID_SERVICE_MODE`; PDF render fail ⇒ 503 retain DRAFT |
| Dependencies | M13, DSC/eSign trust service, notifications, `procedure_templates` |
| Test Guidance | Article immutability; signature gate; valid-service computation; EMAIL non-statutory block |

---

### FR-M09-005 — Employee's Written Statement of Defence (+ Rights & Deadlines Surface)

- **Module:** M09-DCP
- **Primary Role(s):** Employee (Charged Officer), DCP Admin

**User Story:** As a charged officer, I want to submit my statement of defence and clearly see my entitlements and deadlines so that my side is on record and I can exercise my rights.

**Description:** Self-service submission of the defence (plea, statement, requests for oral inquiry, defence assistant, **personal hearing**). **(v2)** The Charged-Officer Portal is upgraded to a **rights-and-deadlines surface**: it shows entitlements (defence assistant, document/witness inspection, personal hearing, appeal limitation countdown) and statutory deadlines — not just a served-document list (AI-19). If no response within the valid window, an ex-parte assumption is recorded.

**Acceptance Criteria:**
1. The charged officer can submit a defence against a **validly served** charge-sheet before `defence_due_date`.
2. Plea selection is mandatory; partial admissions can be article-wise.
3. Requesting an oral inquiry forces the major-track inquiry path (escalation logged).
4. If `defence_due_date` passes with no submission, `is_ex_parte_assumed=true` is set automatically.
5. An extension request routes to DA for approval and, if granted, updates `defence_due_date`.
6. **(v2)** The portal renders a rights panel and a live limitation/deadline countdown; requesting a personal hearing records `requests_personal_hearing=true` (feeds FR-025).

**Business Rules:**
- BR-1: Defence editable until submitted; immutable thereafter (corrigendum via new statement).
- BR-2: ADMITS_ALL on minor track allows DA to proceed directly to penalty without inquiry (still a speaking, signed order).
- BR-3: Only the charged officer (or authorised assistant) may submit.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `defence_statements` | create |
| `charge_sheets` | status → RESPONDED |
| `inquiry_proceedings` | path decision |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/charge-sheets/{id}/defence` | Submit defence |
| POST | `/api/v1/dcp/charge-sheets/{id}/extension-request` | Request extension |
| GET | `/api/v1/dcp/cases/{id}/my-rights` | Rights & deadlines surface **(v2)** |

**UI Behavior Notes:** Charged-officer portal showing only served documents; **(v2)** a **Rights & Deadlines** panel (entitlements + countdowns), plea radio per article, statement editor, checkboxes for oral inquiry / defence assistant / personal hearing; locked after submit.

**Edge Cases:** Employee on leave/hospitalised (extension); ex-parte then late submission (DA discretion); employee disputes valid service (objection record referencing `legal_service_records`).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DefencePortal`, `RightsAndDeadlinesPanel`, `PleaSelector`, `ExtensionRequestDialog`; `DefenceService`, `ExParteScheduler`, `RightsService` |
| Backend Flow | Verify valid service + window open → persist defence → set charge_sheet RESPONDED → decide path; scheduled job sets ex-parte on lapse; rights service composes entitlements + deadlines from case/template |
| Data Operations | INSERT `defence_statements`; UPDATE `charge_sheets.status`; conditional create `inquiry_proceedings` |
| Validation | Valid service exists; window open; plea required; submitter = charged officer/assistant |
| Authorization | Charged officer self only; field-level served-doc visibility |
| State Changes & Side Effects | Case → `INQUIRY_SETUP` (inquiry) or `ORDER` (minor admit); ex-parte flag on lapse |
| Failure Handling | Submit after due-date ⇒ 409 `DEFENCE_WINDOW_CLOSED` (unless extension); not validly served ⇒ 403 |
| Dependencies | scheduler, notifications, `procedure_templates` |
| Test Guidance | Window enforcement; ex-parte auto-flag; oral-inquiry escalation; rights surface accuracy |

---

### FR-M09-006 — Appointment of Inquiry Officer & Presenting Officer (or ICC Constitution)

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin

**User Story:** As a Disciplinary Authority, I want to appoint an impartial Inquiry Officer and Presenting Officer (or constitute a POSH Internal Committee) so that the inquiry is conducted fairly and at arm's length.

**Description:** Appoints IO and PO (ORDINARY_IO route) or **constitutes an ICC (ICC_POSH route) for HARASSMENT cases (AI-16)** with mandated composition (presiding officer, members, **external member**), enforcing distinct-actor and conflict-of-interest rules (DI-2, incl. DA ≠ complainant/witness), supports recusal/objection/replacement, and permits a defence assistant.

**Acceptance Criteria:**
1. IO, PO, DA, complainant, witnesses, and the charged officer must be mutually distinct (DI-2); violations blocked with `ACTOR_CONFLICT`.
2. The charged officer may raise a bias objection against the IO; the DA records a reasoned decision (uphold ⇒ replace).
3. Replacement preserves appointment history (old row `REPLACED`, new row `ACTIVE`).
4. A defence assistant nomination is recorded subject to eligibility rules.
5. **(v2)** For `is_posh_case`, the system enforces ICC composition (≥1 `ICC_EXTERNAL_MEMBER`, a presiding officer); missing composition ⇒ `ICC_PROCEDURE_REQUIRED`.
6. Appointment notifications are sent to all parties.

**Business Rules:**
- BR-1: IO should not have been the PI officer or a witness (hard block on witness; warn on PI officer).
- BR-2: External IO/ICC external member permitted/required per template.
- BR-3: At most one ACTIVE IO and one ACTIVE PO per ordinary inquiry; ICC has exactly one presiding officer.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_appointments` | create/replace (IO/PO or ICC roles) |
| `inquiry_proceedings` | created/linked (route) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{inquiryId}/appointments` | Appoint IO/PO/DA-Asst or constitute ICC |
| POST | `/api/v1/dcp/appointments/{id}/recuse` | Recuse/replace |
| POST | `/api/v1/dcp/appointments/{id}/object` | Raise objection |

**UI Behavior Notes:** Officer pickers with inline conflict warnings; **(v2)** ICC constitution panel enforcing composition with external-member slot; objection workflow card; appointment history timeline.

**Edge Cases:** IO transferred/retires mid-inquiry (replace + de novo decision); charged officer demands legal counsel (allowed only if PO legally trained — config); **(v2)** POSH case without external member ⇒ blocked.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AppointmentPanel`, `ICCConstitutionPanel`, `ConflictChecker`, `ObjectionDialog`; `AppointmentService` |
| Backend Flow | Validate distinct-actor & conflicts (incl. DA bias) → set route → for POSH enforce ICC composition → create inquiry (if absent) → persist appointments → notify; objection → DA decision → optional replace txn |
| Data Operations | INSERT/UPDATE `inquiry_appointments`; INSERT `inquiry_proceedings` |
| Validation | DI-2 distinctness incl. DA; one ACTIVE IO/PO; witness-conflict block; ICC composition |
| Authorization | DA appoints; charged officer objects |
| State Changes & Side Effects | Case → `INQUIRY_SETUP`→`INQUIRY`; notifications |
| Failure Handling | Conflict ⇒ 409 `ACTOR_CONFLICT`; POSH missing composition ⇒ 409 `ICC_PROCEDURE_REQUIRED` |
| Dependencies | M01, notifications, `procedure_templates` |
| Test Guidance | Distinct-actor incl. DA; ICC composition; objection→replacement audit chain |

---

### FR-M09-007 — Conduct of Departmental Inquiry (Hearings, Witnesses, Exhibits, Inspection, Ex-Parte, Stay)

- **Module:** M09-DCP
- **Primary Role(s):** Inquiry Officer / ICC, Presenting Officer, Charged Officer / Defence Assistant

**User Story:** As an Inquiry Officer, I want to supply the document/witness list, afford inspection, schedule hearings, examine witnesses, admit exhibits, maintain daily order sheets, and (where a parallel criminal trial exists) stay the inquiry, so that it is complete, fair, and fully documented.

**Description:** Runs the oral inquiry. **(v2)** Before substantive evidence, the IO must **supply the list of relied-upon documents/witnesses and afford inspection (`list_supplied_date`, `inspection_afforded_date`; DI-24, AI-4)**. Manages witnesses, exhibits (sealed, hashed, **relied/disclosed flags**), daily order sheets, ex-parte after due notice, and **(v2)** a **STAYED** sub-state with automatic SLA pause when a criminal trial on the same facts is active (AI-18).

**Acceptance Criteria:**
1. **(v2)** The IO records `list_supplied_date` and `inspection_afforded_date`; witness examination/exhibit admission is blocked until both are set (`INSPECTION_NOT_AFFORDED`).
2. The IO can schedule a hearing, record outcome, and a mandatory daily order text.
3. Witnesses (both sides) listed and depositions recorded with examination status; cross-examination opportunity afforded.
4. Exhibits added with marker, side, description, sealed reference, `content_hash` (DI-7), and **(v2)** `relied_upon`/`disclosed_to_charged` (DI-9).
5. Ex-parte: after configured no-shows with proof of notice, the IO may set the inquiry `EX_PARTE`.
6. **(v2)** When `criminal_case_ref` is active and prejudice is shown, the IO (with DA approval) sets `STAYED` with reason, creating an `sla_pause_events(CRIMINAL_STAY)`; resume lifts the pause.
7. Every action writes hash-chained `audit_log` and timeline.

**Business Rules:**
- BR-1: Fair opportunity to cross-examine; ex-parte requires documented notice.
- BR-2: Exhibits cannot be deleted once admitted (only marked objected); seal immutable.
- BR-3: Hearing scheduling respects reasonable-notice config.
- BR-4 **(v2):** Evidence relied upon must be disclosed (DI-9); inspection must precede evidence (DI-24).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_hearings` | hearings |
| `inquiry_witnesses` | witnesses (listed-for-inspection) |
| `inquiry_exhibits` | exhibits/vault (relied/disclosed) |
| `inquiry_proceedings` | status/ex-parte/stay/inspection |
| `sla_pause_events` | criminal stay pause **(v2)** |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{id}/supply-list` | Record list supplied + inspection **(v2)** |
| POST | `/api/v1/dcp/inquiries/{id}/hearings` | Add hearing/order sheet |
| POST | `/api/v1/dcp/inquiries/{id}/witnesses` | Add/examine witness |
| POST | `/api/v1/dcp/inquiries/{id}/exhibits` | Admit exhibit |
| POST | `/api/v1/dcp/inquiries/{id}/declare-ex-parte` | Ex-parte order |
| POST | `/api/v1/dcp/inquiries/{id}/stay` | Stay/resume (criminal parallel) **(v2)** |

**UI Behavior Notes:** Inquiry workbench with **inspection-gate banner**, hearing calendar, daily-order-sheet editor, witness register, exhibit list with seal + relied/disclosed indicators, ex-parte gated on no-show count, **(v2)** stay control with reason + criminal ref.

**Edge Cases:** Witness hostile; exhibit authenticity challenged (objection recorded); charged officer attends late after ex-parte (IO may recall); hash mismatch ⇒ `EVIDENCE_TAMPERED`; **(v2)** evidence attempted before inspection ⇒ blocked; stay with no criminal ref ⇒ rejected.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `InquiryWorkbench`, `InspectionGate`, `HearingScheduler`, `WitnessRegister`, `ExhibitVault`, `ExParteDialog`, `StayDialog`; `InquiryService`, `EvidenceSealService`, `SlaPauseService` |
| Backend Flow | Validate IO ownership → enforce inspection gate → persist hearing/witness/exhibit → compute content_hash → ex-parte requires threshold+notice → stay creates pause event |
| Data Operations | INSERT `inquiry_hearings`/`inquiry_witnesses`/`inquiry_exhibits`; UPDATE `inquiry_proceedings`; INSERT `sla_pause_events` |
| Validation | Inspection set before evidence; mandatory daily-order; reasonable-notice; ex-parte threshold; hash; relied⇒disclosed |
| Authorization | IO records; PO adds prosecution evidence; charged officer/assistant adds defence evidence; DA approves stay |
| State Changes & Side Effects | Inquiry IN_PROGRESS/EX_PARTE/STAYED; SLA pause on stay; timeline + audit |
| Failure Handling | Inspection missing ⇒ 409 `INSPECTION_NOT_AFFORDED`; hash mismatch ⇒ 409 `EVIDENCE_TAMPERED`; ex-parte without threshold ⇒ 422 |
| Dependencies | M13 (sealed vault), SLA engine, notifications |
| Test Guidance | Inspection gate; ex-parte threshold; exhibit hash + relied/disclosed; criminal stay pause |

---

### FR-M09-008 — Inquiry Report & Findings

- **Module:** M09-DCP
- **Primary Role(s):** Inquiry Officer / ICC, Disciplinary Authority

**User Story:** As an Inquiry Officer, I want to submit a reasoned, signed inquiry report with article-wise (per-respondent) findings so that the DA can decide on the evidence.

**Description:** The IO/ICC records **per-respondent, article-wise findings** (`findings_json`) with reasoning, an overall finding, and a **DSC/eSign-signed report (DI-28)**. A copy is **validly served (DI-15)** on each charged officer for representation before DA consideration.

**Acceptance Criteria:**
1. The IO must record a finding for **every** article **for every active respondent** before submitting (DI-25).
2. The report requires `analysis_text`, `findings_json`, and a **signed** `report_document_id` **(v2)**.
3. On submission the inquiry is `CONCLUDED` and the case moves to `DA_CONSIDERATION` (or `CONSULTATION` if mandatory consultation pending).
4. A copy of the report is validly served on each charged officer with a representation window.
5. Findings write back to the per-respondent finding grid.

**Business Rules:**
- BR-1: A report cannot be submitted for an inquiry not IN_PROGRESS/EX_PARTE.
- BR-2: Findings must be supported by recorded evidence (advisory completeness check).
- BR-3: The DA may remit for further inquiry (`REMITTED`) with reasons.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_reports` | create/serve (signed, findings_json) |
| `case_respondents` | per-respondent findings |
| `inquiry_proceedings` | CONCLUDED |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{id}/report` | Submit signed report |
| POST | `/api/v1/dcp/inquiry-reports/{id}/serve` | Serve copy (legal service) |
| POST | `/api/v1/dcp/inquiry-reports/{id}/remit` | DA remits |

**UI Behavior Notes:** Report composer with per-respondent × per-article finding grid, reasoning editor, evidence-coverage hints, sign-and-submit (DSC/eSign); serve action; DA remit drawer.

**Edge Cases:** Mixed findings; IO replaced (new IO submits on record); report contradicts admitted plea (flagged); **(v2)** multi-respondent partial findings.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `InquiryReportComposer`, `FindingGrid`; `InquiryReportService`, `SigningService` |
| Backend Flow | Validate all-articles-all-respondents findings → sign → persist report + write-back in txn → conclude inquiry → serve copy + representation task |
| Data Operations | INSERT `inquiry_reports`; UPDATE finding grid, `inquiry_proceedings.status`, case stage |
| Validation | All findings present (DI-25); analysis + signed doc required |
| Authorization | Submit: IO/ICC; serve/remit: DA |
| State Changes & Side Effects | Inquiry CONCLUDED; case `DA_CONSIDERATION`/`CONSULTATION`; representation window |
| Failure Handling | Missing findings ⇒ 422 `INCOMPLETE_FINDINGS`; unsigned ⇒ 422 `SIGNATURE_REQUIRED`; wrong state ⇒ 409 |
| Dependencies | M13, DSC/eSign, notifications |
| Test Guidance | All-articles/all-respondents guard; signature; finding write-back; remit |

---

### FR-M09-009 — Disagreement Memo & Disciplinary Authority Consideration

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Charged Officer

**User Story:** As a Disciplinary Authority, when I disagree with the IO's findings, I want to issue a disagreement memo and give the charged officer a chance to represent so that my differing view is procedurally valid.

**Description:** Records the DA's consideration; where the DA disagrees (especially upgrading not-proved to proved), a disagreement memo with tentative reasons is **validly served (DI-15)** on the charged officer, who may respond before finalisation.

**Acceptance Criteria:**
1. The DA can accept the report (→ consultation/show-cause/penalty path) or record a disagreement memo.
2. A disagreement memo requires `tentative_disagreement` and `articles_affected_json`.
3. The memo is served (legal service) with a representation window; response recorded.
4. Final consideration after representation moves the case forward (`FINALISED`).
5. Disagreement upgrading a finding to "proved" must be served before any penalty (natural justice).

**Business Rules:**
- BR-1: The DA cannot impose a penalty on a not-proved article without first serving a disagreement memo and considering the representation.
- BR-2: Memo immutable after serve.
- BR-3: Full agreement with not-proved on all articles ⇒ exoneration path (FR-011).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `disagreement_memos` | create/serve/respond |
| `inquiry_reports` | status |
| `legal_service_records` | valid service **(v2)** |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiry-reports/{id}/disagreement-memo` | Issue memo |
| POST | `/api/v1/dcp/disagreement-memos/{id}/serve` | Serve (legal service) |
| POST | `/api/v1/dcp/disagreement-memos/{id}/representation` | Record response |

**UI Behavior Notes:** Report-consideration screen with accept/disagree toggle; per-article revised-view editor; serve + representation tracking.

**Edge Cases:** Partial disagreement; representation raises new evidence (remit); no representation within window (proceed on record).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DAConsiderationScreen`, `DisagreementEditor`; `DisagreementService` |
| Backend Flow | DA reviews report → accept (advance) or create memo → serve + representation task → finalise after response/lapse |
| Data Operations | INSERT/UPDATE `disagreement_memos`; INSERT `legal_service_records`; UPDATE `inquiry_reports.status`, case stage |
| Validation | Memo requires reasons + affected articles; serve before penalty on upgraded findings |
| Authorization | DA only |
| State Changes & Side Effects | Case → `CONSULTATION`/`SHOW_CAUSE`/`ORDER`; notifications |
| Failure Handling | Penalty on not-proved without memo ⇒ 409 `NATURAL_JUSTICE_VIOLATION` |
| Dependencies | notifications, M13 |
| Test Guidance | Upgrade-without-memo block; representation window |

---

### FR-M09-010 — Show-Cause Notice on Proposed Penalty

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Charged Officer

**User Story:** As a Disciplinary Authority, I want to issue a show-cause notice setting out the penalty I propose so that the employee can represent (and seek a personal hearing) before I finalise it.

**Description:** Issues a show-cause notice with tentatively proposed penalty(ies) on the major track (or where enhancement is contemplated), records **valid service (DI-15)** and representation, **supports a personal hearing (FR-025, AI-21)**, and constrains the final order to the proposed set (DI-4).

**Acceptance Criteria:**
1. A show-cause notice records `proposed_penalty_json`, issue/serve dates, and `response_due_date`.
2. The charged officer's representation is recorded (or `NO_RESPONSE` on lapse).
3. The final penalty order's penalties must be a subset of the proposed penalties (DI-4); enhancement requires fresh show-cause.
4. Major-track penalties cannot be finalised without a closed show-cause (DI-3).
5. **(v2)** A requested personal hearing is recorded in `personal_hearings`; denial requires reasons (DI-29).

**Business Rules:**
- BR-1: Minor-penalty track does not require a separate show-cause (per config).
- BR-2: Proposed penalty must be a recognised `penalty_type` valid for the case.
- BR-3: Notice immutable after serve.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `show_cause_notices` | create/serve/respond |
| `personal_hearings` | hearing **(v2)** |
| `penalty_items` | (validated subset) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/show-cause` | Issue notice |
| POST | `/api/v1/dcp/show-cause/{id}/serve` | Serve (legal service) |
| POST | `/api/v1/dcp/show-cause/{id}/representation` | Record response |
| POST | `/api/v1/dcp/show-cause/{id}/personal-hearing` | Record personal hearing **(v2)** |

**UI Behavior Notes:** Proposed-penalty selector (multi), reasoning, serve panel, representation capture, due-date countdown, **(v2)** personal-hearing scheduler.

**Edge Cases:** Employee seeks personal hearing (record grant/denial); representation persuades DA to drop/reduce; no response (proceed on record).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ShowCauseComposer`, `ProposedPenaltyPicker`, `PersonalHearingScheduler`; `ShowCauseService`, `PersonalHearingService` |
| Backend Flow | Validate proposed penalties → persist notice → serve (legal service) + response task → optional personal hearing → close → carry proposed set into order validation |
| Data Operations | INSERT/UPDATE `show_cause_notices`; INSERT `personal_hearings`; UPDATE case stage |
| Validation | Valid penalty types; due-date; subset enforced at order time; hearing grant/denial reasons |
| Authorization | DA only; step-up MFA |
| State Changes & Side Effects | Case → `SHOW_CAUSE`→`ORDER`; notifications |
| Failure Handling | Major order without closed show-cause ⇒ 409; enhancement ⇒ 409 `PENALTY_EXCEEDS_PROPOSED`; hearing denied without reason ⇒ 422 `PERSONAL_HEARING_DENIED` |
| Dependencies | notifications, personal hearings |
| Test Guidance | Subset enforcement; lapse handling; personal-hearing record |

---

### FR-M09-011 — Penalty Order & Exoneration (Competence, Consultation, Proportionality, Recovery Caps, Signing)

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority

**User Story:** As a Disciplinary Authority, I want to pass a reasoned, proportionate, competently-signed final order so that the case concludes lawfully and withstands judicial review.

**Description:** Produces the final speaking order. **(v2)** Finalise is now gated by the full legality layer: **authority competence (DI-13)**, **mandatory consultation closed (DI-14)**, **proportionality reasoning (DI-20)**, **recovery caps (DI-22)**, and **DSC/eSign signing (DI-28)** — in addition to v1 due-process (DI-3) and subset (DI-4) checks. The order is finalised, validly served, made immutable (DI-6), and posted to the SR idempotently (FR-013).

**Acceptance Criteria:**
1. An order requires `reasoning_text`, `proportionality_reasoning` **(v2)**, and `is_speaking_order=true` to finalise.
2. Penalty order requires the full due-process chain (DI-3 — including lawful dispensation where applicable), subset constraint (DI-4), **competence verification (DI-13)**, and **closed mandatory consultations (DI-14)** **(v2)**.
3. Each `penalty_items` row sets type-appropriate parameters; **(v2)** RECOVERY/FINE items are validated against caps (DI-22).
4. **(v2)** The order is signed via DSC/eSign (`signature_type`, `signatory_id`, `signed_at`, `signature_ref`) before finalise; unsigned ⇒ `SIGNATURE_REQUIRED`.
5. On finalise, the order and items become read-only (DI-6); an idempotent SR posting is triggered (FR-013).
6. Exoneration sets case/respondent `EXONERATED`, restores `employment_status` (if suspended), clears vigilance status, and lifts sealed cover.

**Business Rules:**
- BR-1: Major penalties (reduction/CR/removal/dismissal) require step-up MFA **and** competence verification (Art. 311(1)).
- BR-2: Penalty effective date defaults to service date unless lawfully retrospective with reasons.
- BR-3: Period-of-suspension treatment decided in this order.
- BR-4 **(v2):** Recovery beyond retirement only from DCRG; monthly recovery ≤ cap.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `penalty_orders` | create/finalise (proportionality, signature, competence) |
| `penalty_items` | penalties (recovery caps) |
| `authority_competence` | competence resolve **(v2)** |
| `case_consultations` | consultation gate **(v2)** |
| `disciplinary_cases` | status |
| `service_register_events` | (via FR-013) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/orders` | Draft order + items |
| POST | `/api/v1/dcp/orders/{id}/sign` | DSC/eSign **(v2)** |
| POST | `/api/v1/dcp/orders/{id}/finalise` | Finalise (immutable, `Idempotency-Key`) |
| POST | `/api/v1/dcp/orders/{id}/serve` | Record legal service |

**UI Behavior Notes:** Order composer with penalty-item builder (type-driven fields + recovery-cap validators), reasoning + **proportionality** editors, **competence & consultation checklist** (green only when satisfied), speaking-order checklist, **sign (DSC/eSign)** then finalise with MFA, serve panel.

**Edge Cases:** Multiple penalties of different classes (competence resolved to the **highest** class); recovery exceeding cap (validation); exoneration after long suspension (back-pay settlement to M10); **(v2)** employee deceased before order ⇒ abate (FR-028); incompetent DA ⇒ block.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `OrderComposer`, `PenaltyItemBuilder`, `LegalityChecklist`, `SignStep`, `FinaliseDialog`; `PenaltyOrderService`, `CompetenceService`, `ConsultationGate`, `RecoveryCapValidator`, `SigningService`, `DownstreamEffectEmitter` |
| Backend Flow | Validate DI-3/DI-4 → resolve & verify competence (DI-13) → verify consultations closed (DI-14) → validate recovery caps (DI-22) → require proportionality (DI-20) → sign (DI-28) → finalise: lock, MFA, set status → trigger idempotent SR posting + downstream |
| Data Operations | INSERT `penalty_orders`,`penalty_items`; UPDATE case status; INSERT `service_register_events`; emit M06/M10/M11 events |
| Validation | DI-3, DI-4, DI-6, DI-13, DI-14, DI-20, DI-22, DI-28; type-specific parameter checks |
| Authorization | DA only; step-up MFA for major; competent authority |
| State Changes & Side Effects | Case → `PENALTY_IMPOSED`/`EXONERATED`/`DROPPED`; immutability; downstream effects; vigilance update; sealed-cover lift on exoneration |
| Failure Handling | Incomplete chain ⇒ 409 `DUE_PROCESS_INCOMPLETE`; incompetent ⇒ 409 `AUTHORITY_NOT_COMPETENT`; consultation pending ⇒ 409 `CONSULTATION_PENDING`; no proportionality ⇒ 422 `PROPORTIONALITY_REASONING_REQUIRED`; recovery cap ⇒ 422 `RECOVERY_CAP_EXCEEDED`; unsigned ⇒ 422 `SIGNATURE_REQUIRED`; edit after finalise ⇒ 409 `ORDER_IMMUTABLE` |
| Dependencies | M06, M10, M11, M12, M13, DSC/eSign, MFA, `authority_competence`, `case_consultations` |
| Test Guidance | Competence guard (DISMISSAL by subordinate authority blocked); consultation gate; proportionality; recovery caps; immutability; subset; signed-finalise |

---

### FR-M09-012 — Appeal / Revision / Review

- **Module:** M09-DCP
- **Primary Role(s):** Charged Officer, Appellate Authority, Reviewing/Revising Authority

**User Story:** As a penalised employee, I want to appeal within the statutory limitation; and as an appellate/reviewing authority, I want to decide the appeal so that errors are corrected and outcomes propagate.

**Description:** Manages post-order remedies — appeal, revision, suo-motu review — with limitation tracking (per template), condonation, **personal hearing (FR-025)**, decision recording, and generation of a revised order. **(v2)** Condonation creates an `sla_pause_events(CONDONATION)`; the appellate authority's competence is verified (DI-13); enhancement requires fresh show-cause.

**Acceptance Criteria:**
1. An appeal can be filed against a finalised/served order; `limitation_due_date` computed from the template (default 45 days).
2. Late appeals flagged `is_time_barred`; admission requires `condonation_granted=true` (creates SLA pause **(v2)**).
3. The authority records a decision with reasoning; `MODIFIED` creates a `revised_order_id`.
4. `ENHANCED` requires a fresh show-cause before finalisation (natural justice).
5. Decision propagates: SR supersession (FR-013) and downstream reversal/adjustment (M06/M10/M11).
6. **(v2)** Appellate authority ≠ DA and competence verified; personal hearing recorded where held.

**Business Rules:**
- BR-1: Appeal authority ≠ DA who passed the order.
- BR-2: One pending appeal per order; revision/review may follow.
- BR-3: `SET_ASIDE` restores prior status and reverses downstream effects.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `appeals` | create/decide |
| `personal_hearings` | hearing **(v2)** |
| `sla_pause_events` | condonation pause **(v2)** |
| `penalty_orders` | challenged/revised |
| `service_register_events` | supersession |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/orders/{orderId}/appeals` | File appeal/revision/review |
| POST | `/api/v1/dcp/appeals/{id}/admit` | Admit (with condonation) |
| POST | `/api/v1/dcp/appeals/{id}/decide` | Record decision (`Idempotency-Key`) |

**UI Behavior Notes:** Appeal-filing form with limitation indicator; authority decision screen with decision selector, **competence badge**, personal-hearing scheduler, revised-order link; enhancement triggers show-cause sub-flow.

**Edge Cases:** Time-barred without condonation (reject); enhancement without show-cause (block); multiple remedies in sequence; appeal pending while recovery deducted (hold/refund with M10).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AppealForm`, `AppealDecisionScreen`; `AppealService`, `OrderRevisionService`, `CompetenceService`, `SlaPauseService` |
| Backend Flow | Compute limitation → file → admit (condonation guard + pause) → verify authority competence → decide → on MODIFIED create revised order, on ENHANCED require fresh show-cause → propagate SR + downstream (idempotent) |
| Data Operations | INSERT/UPDATE `appeals`; conditional INSERT revised `penalty_orders`; INSERT superseding `service_register_events`; INSERT `sla_pause_events`/`personal_hearings` |
| Validation | DI-5 limitation; authority ≠ DA + competent (DI-13); enhancement ⇒ show-cause exists |
| Authorization | File: charged officer; decide: Appellate/Reviewing authority; step-up MFA |
| State Changes & Side Effects | Case → `UNDER_APPEAL` then resolved; downstream reversal/adjustment |
| Failure Handling | Time-barred admit ⇒ 409 `APPEAL_TIME_BARRED`; incompetent authority ⇒ 409 `AUTHORITY_NOT_COMPETENT`; enhance without show-cause ⇒ 409 |
| Dependencies | M06, M10, M11, M12, MFA, personal hearings, SLA pause |
| Test Guidance | Limitation/condonation pause; set-aside reversal; enhancement guard; competence |

---

### FR-M09-013 — Service Register Posting & Downstream Effects (Idempotent)

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, SR Custodian (M12)

**User Story:** As a Disciplinary Authority, I want every concluded outcome posted exactly-once to the Digital SR and propagated to payroll, seniority, and pension so that the statutory record and entitlements are accurate with no duplicate effects.

**Description:** Appends an immutable SR event and emits idempotent effect events to M06/M10/M11. **(v2)** Uses the defined **`idempotency_keys` lifecycle (DI-19, AI-11)** — keys minted server-side per scope, deduplicated against a store with a TTL, guaranteeing exactly-once effects even on double-finalise / double post-to-SR. Outbox/retry for reliability; supersession on appeal.

**Acceptance Criteria:**
1. On order finalise (and appeal decision), an SR event is appended with order reference (DI-10).
2. Penalty-type-specific downstream events are emitted (WITHHOLD_INCREMENT/REDUCTION → M06+M10; RECOVERY → M10; CR/REMOVAL/DISMISSAL → M11; WITHHOLD_PROMOTION → M06).
3. **(v2)** Emission is idempotent via `idempotency_keys`; a replayed key returns the stored result and produces no second effect; mismatched fingerprint on a seen key ⇒ `IDEMPOTENCY_CONFLICT`.
4. Appeal `SET_ASIDE`/`MODIFIED` posts a superseding SR event and reversal/adjustment events.
5. Correlation IDs stored (`downstream_event_id`, `sr_event_id`).

**Business Rules:**
- BR-1: SR events append-only (supersession only).
- BR-2: Effects emitted only after order finalisation/serve.
- BR-3: Cross-module failures must not roll back the valid order (eventual consistency via outbox).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `service_register_events` | append (M12) |
| `idempotency_keys` | dedup store **(v2)** |
| `penalty_orders` / `penalty_items` | source + correlation |
| `appeals` | supersession source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/orders/{id}/post-to-sr` | Trigger SR posting (idempotent, `Idempotency-Key`) |
| GET | `/api/v1/dcp/orders/{id}/downstream-status` | View propagation status |

**UI Behavior Notes:** Propagation status panel showing SR event id and per-module effect status (queued/done/failed-retry); manual re-trigger (idempotent) for stuck items.

**Edge Cases:** M12 unavailable (outbox retains, retries); duplicate trigger (key dedup); partial downstream success (per-effect status); reduction target designation invalid (validation before emit).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PropagationStatusPanel`; `SrPostingService`, `OutboxDispatcher`, `EffectMapper`, `IdempotencyService` |
| Backend Flow | On finalise → check/mint idempotency key (TTL) → if seen+match return snapshot; else write outbox entries (SR + per-effect) → dispatcher posts to M12/M06/M10/M11 → record correlation ids → persist response snapshot |
| Data Operations | INSERT `service_register_events`; INSERT/UPDATE `idempotency_keys`; INSERT outbox rows; UPDATE correlations |
| Validation | Effect mapping completeness; key uniqueness + fingerprint match; target refs valid |
| Authorization | DA/Admin trigger; system dispatcher service-account |
| State Changes & Side Effects | Case → `SR_POSTING`→`CLOSED`; SR ledger appended; downstream executed by owners |
| Failure Handling | Upstream down ⇒ outbox + backoff + alert; duplicate key match ⇒ replay snapshot; key mismatch ⇒ 409 `IDEMPOTENCY_CONFLICT` |
| Dependencies | M12, M06, M10, M11, idempotency store |
| Test Guidance | Double-finalise ⇒ one SR event; double post-to-SR ⇒ one effect; outbox retry; supersession; per-effect status |

---

### FR-M09-014 — Document Evidence Vault (Link to M13)

- **Module:** M09-DCP
- **Primary Role(s):** IO, PO, DCP Admin, DA, Auditor (read)

**User Story:** As an Inquiry Officer, I want a sealed, tamper-evident, digitally-signed evidence vault for all case artefacts so that integrity and confidentiality are guaranteed and provable.

**Description:** Centralises all case artefacts as references to encrypted M13 objects, each with SHA-256 `content_hash`, served/sealed flags, **(v2)** signature metadata, and full read-audit. Served items are visible to the charged officer; sealed items restricted; relied-upon evidence must be disclosed (DI-9).

**Acceptance Criteria:**
1. Every artefact upload creates a `case_documents` link with `artefact_type`, `document_id`, `content_hash`, served/sealed flags, and **(v2)** signature metadata where the artefact is signed.
2. Reads of sealed documents recorded as hash-chained `view` audit events.
3. On retrieval, the stored `content_hash` is re-verified; mismatch raises `EVIDENCE_TAMPERED` and alerts.
4. The charged officer can list/download only `is_served=true` artefacts (plus relied-upon disclosed evidence).
5. Vault listing filterable by artefact type and paginated.

**Business Rules:**
- BR-1: Vault items never hard-deleted; supersession/versioning via M13.
- BR-2: Sealing irreversible without DA authorisation and audit.
- BR-3: Confidential-source artefacts inherit DI-9 masking.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_documents` | links (+ signature) |
| `inquiry_exhibits` | exhibit subset |
| `documents` (M13) | binaries |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{caseId}/documents` | Add artefact link |
| GET | `/api/v1/dcp/cases/{caseId}/documents` | List vault (RBAC-filtered) |
| GET | `/api/v1/dcp/documents/{id}/download` | Download (hash-verified, audited) |

**UI Behavior Notes:** Vault explorer grouped by artefact type; seal/served/**signed**/integrity badges; charged-officer view shows only served + disclosed items.

**Edge Cases:** Large files (chunked upload via M13); hash mismatch (block + alert); cross-case shared exhibit (separate links).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `EvidenceVaultExplorer`, `IntegrityBadge`, `SignatureBadge`; `CaseDocumentService`, `HashVerifier` |
| Backend Flow | Upload via M13 → compute hash → persist link (+ signature meta) → on download verify hash + RBAC + write view-audit |
| Data Operations | INSERT `case_documents`; SELECT with RBAC filter; INSERT `audit_log`(view) |
| Validation | artefact_type enum; hash present; served/sealed/disclosed rules |
| Authorization | RBAC + field-level served visibility; sealed restricted |
| State Changes & Side Effects | Read-audit on sealed; alert on tamper |
| Failure Handling | M13 down ⇒ 503; hash mismatch ⇒ 409 `EVIDENCE_TAMPERED` |
| Dependencies | M13, audit |
| Test Guidance | Hash verify; served+disclosed visibility; read-audit on sealed |

---

### FR-M09-015 — Integrity Register & Vigilance Clearance (+ Sealed Cover)

- **Module:** M09-DCP
- **Primary Role(s):** Vigilance Officer, DA, HR (consumers across modules)

**User Story:** As a Vigilance Officer, I want to maintain each employee's integrity grade, vigilance clearance, and sealed-cover status so that promotions, deputations, retirements, and empanelment can be gated on a reliable signal.

**Description:** Maintains a per-employee vigilance record (clearance status, integrity grade, **(v2)** sealed-cover flag) driven by case lifecycle, and exposes a clearance API consumed by M06/M11. **(v2)** When proceedings are pending, M06 promotion recommendations are held in **sealed cover** (AI-13).

**Acceptance Criteria:**
1. Filing/charging sets `clearance_status=UNDER_PROCEEDINGS`; exoneration sets `CLEAR` and lifts sealed cover.
2. A penalty may set `integrity_grade=DOUBTFUL` for a configured period.
3. A clearance lookup API returns current status with validity window (RBAC-gated).
4. Manual override by Vigilance Officer with mandatory reason and audit.
5. **(v2)** `sealed_cover_flag` is set when proceedings pending and surfaced to M06.
6. All status changes write hash-chained `audit_log` and effective-dated history.

**Business Rules:**
- BR-1: Transitions driven by case events; manual override by Vigilance Officer only.
- BR-2: `NOT_CLEAR`/`UNDER_PROCEEDINGS`/sealed-cover blocks promotion in M06.
- BR-3: Status has validity dates; expired DOUBTFUL auto-reverts to SATISFACTORY review.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `vigilance_records` | create/update (+ sealed cover) |
| `disciplinary_cases` | event source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/vigilance/{employeeId}` | Clearance lookup |
| POST | `/api/v1/dcp/vigilance/{employeeId}` | Update/override status |

**UI Behavior Notes:** Vigilance register grid with status chips, **sealed-cover badge**, validity; employee clearance card; override drawer with reason.

**Edge Cases:** Multiple concurrent cases (most-restrictive wins); clearance during pending appeal (UNDER_PROCEEDINGS retained); retiring employee clearance for pension (M11 consumes).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `VigilanceRegister`, `ClearanceCard`, `OverrideDrawer`; `VigilanceService` |
| Backend Flow | Subscribe to case events → derive status (most-restrictive) + sealed-cover → upsert effective-dated record → serve clearance API |
| Data Operations | INSERT/UPDATE `vigilance_records`; INSERT `audit_log` |
| Validation | Override requires reason + Vigilance role; validity window consistency |
| Authorization | Read: RBAC (M06/M11 service + Vigilance/DA); write: Vigilance Officer |
| State Changes & Side Effects | Status + sealed-cover drive M06 promotion gate, M11 pension clearance |
| Failure Handling | Concurrent updates ⇒ most-restrictive resolver; 409 on stale write |
| Dependencies | M06, M11, audit |
| Test Guidance | Event-driven derivation; most-restrictive; sealed-cover; override audit |

---

### FR-M09-016 — SLA / Statutory-Timeline Tracking, Proportionality Analytics & Case Analytics

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, DA, Vigilance Officer, Auditor

**User Story:** As a Disciplinary Case Manager, I want each stage tracked against statutory/internal SLAs with lawful pause/resume and escalation, plus analytics including a penalty-proportionality outlier view, so that proceedings are timely and oversight is data-driven.

**Description:** Computes per-stage SLA targets from the template matrix, records hash-chained timeline events, honours **SLA pause/resume (FR-024, DI-18)** so stayed/remitted/consulted cases never show false breaches, raises AT_RISK/BREACHED with escalation, and powers analytics — caseload, ageing, bottlenecks, penalty mix, exoneration rate, appeal-overturn rate, cycle time, and **(v2)** a **penalty-proportionality outlier** view (penalty severity vs misconduct/precedent, AI-12) — feeding M14.

**Acceptance Criteria:**
1. On entering each stage, an `sla_target_at` is computed from the template matrix and a `STAGE_ENTERED` timeline event written.
2. A scheduled evaluator marks `AT_RISK` and `BREACHED` (skipping `PAUSED` stages, DI-18), emitting escalation notifications.
3. The analytics endpoint returns aggregated KPIs with filters and pagination.
4. Ageing buckets (0–30/31–90/91–180/180+) computed per open case.
5. **(v2)** A proportionality-outlier report flags orders whose penalty class is unusually severe for the misconduct vs precedent.
6. Timeline is append-only, hash-chained, and immutable (DI-12/DI-21).

**Business Rules:**
- BR-1: SLA matrix is template-configurable per stage/case_type; statutory floors cannot be shortened.
- BR-2: Breach escalations route up the authority hierarchy.
- BR-3: Analytics respect confidentiality (aggregates only for non-privileged viewers).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_timeline_events` | SLA events (hash-chained) |
| `sla_pause_events` | pause windows **(v2)** |
| `disciplinary_cases` | stage/expected_closure |
| `penalty_orders` | proportionality analytics **(v2)** |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/cases/{id}/timeline` | Case timeline |
| GET | `/api/v1/dcp/analytics/summary` | KPI aggregates |
| GET | `/api/v1/dcp/analytics/ageing` | Ageing buckets |
| GET | `/api/v1/dcp/analytics/proportionality-outliers` | Proportionality outliers **(v2)** |

**UI Behavior Notes:** Case header SLA ribbon (on-track/at-risk/breached/**paused**); analytics dashboard with KPI tiles, ageing chart, bottleneck chart, penalty-mix, overturn-rate, and **proportionality-outlier** visuals; export.

**Edge Cases:** Stage re-entry after remit/appeal (new SLA window, prior timeline preserved); paused clock during stays (SLA pause); time-zone-correct elapsed computation.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SLARibbon`, `AnalyticsDashboard`, `AgeingChart`, `ProportionalityOutlierPanel`; `SlaEngine`, `AnalyticsService` |
| Backend Flow | On stage transition compute target + write hash-chained event → evaluator updates sla_status (skip PAUSED) + escalates → analytics aggregates via materialised view incl. proportionality model |
| Data Operations | INSERT `case_timeline_events`; SELECT aggregates; INSERT `notifications` on breach |
| Validation | Template floor respected; pause handling; bucket boundaries |
| Authorization | Detail: DA/Admin/Vigilance; aggregates: Auditor; M14 service-account |
| State Changes & Side Effects | sla_status updates; escalation notifications; M14 feed |
| Failure Handling | Evaluator failure ⇒ retry + alert; stale read-model ⇒ refresh |
| Dependencies | scheduler, notifications, M14, `sla_pause_events`, `procedure_templates` |
| Test Guidance | Target computation; at-risk/breach with pause skip; ageing; proportionality outlier correctness |

---

### FR-M09-017 — Procedure Template & Jurisdiction Overlay (Two-Layer Model) **(v2, AI-8, R8)**

- **Module:** M09-DCP
- **Primary Role(s):** System Administrator (configure), all decision guards (consume)

**User Story:** As a System Administrator, I want to configure a procedure template per jurisdiction/case-type so that the same engine can run CCS(CCA), POSH/ICC, and corporate regimes without code changes, while the natural-justice kernel stays invariant.

**Description:** Defines the configurable **overlay** — required consultations and sequence, competence-matrix reference, statutory timelines/floors, valid service modes, appeal limitation, subsistence bounds, and dispense-with-inquiry conditions. The **kernel** (DI-2/3/4/9/13/14/20) is enforced for every template and is not configurable (DI-17). Seeds CCS(CCA) as default.

**Acceptance Criteria:**
1. A template is created/edited with all overlay fields; activation requires SysAdmin.
2. Case creation resolves exactly one active template by jurisdiction + (case_type / misconduct); HARASSMENT ⇒ ICC template.
3. Decision guards (FR-011/018/019/020/021/024) read overlay values from the case's template.
4. Kernel rules cannot be disabled by any template (DI-17); attempts are rejected at config validation.
5. EMAIL is excluded from valid service modes by default and must be explicitly added to be statutory.

**Business Rules:**
- BR-1: Exactly one active template per (jurisdiction, case_type/misconduct) selector.
- BR-2: Statutory floors in `timelines_json` cannot be shortened by case-level config.
- BR-3: Templates are reference data — never edited within an open case's lifecycle retroactively (version pinned at case creation).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `procedure_templates` | CRUD (SysAdmin) |
| `authority_competence` | referenced by `competence_matrix_ref` |
| `disciplinary_cases` | `procedure_template_id` pinned |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/admin/procedure-templates` | List templates |
| POST | `/api/v1/dcp/admin/procedure-templates` | Create template |
| PUT | `/api/v1/dcp/admin/procedure-templates/{id}` | Update/activate |

**UI Behavior Notes:** Admin template editor with sections for consultations, competence ref, timelines, service modes, limitation, subsistence bounds, dispensation conditions; a read-only "kernel rules (always on)" panel.

**Edge Cases:** No matching template at case creation (`PROCEDURE_TEMPLATE_INVALID`); template edited mid-case (new cases only; open cases keep pinned version); conflicting active selectors (validation blocks activation).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `TemplateEditor`, `KernelRulesPanel`; `ProcedureTemplateService`, `TemplateResolver` |
| Backend Flow | Validate overlay (kernel not disabled) → persist/activate → resolver pins template at case creation → guards read pinned template |
| Data Operations | INSERT/UPDATE `procedure_templates`; read at case creation |
| Validation | Single active selector; floors honoured; kernel invariance (DI-17) |
| Authorization | SysAdmin only |
| State Changes & Side Effects | Template activation; case pinning |
| Failure Handling | No match ⇒ 422 `PROCEDURE_TEMPLATE_INVALID`; kernel-disable attempt ⇒ 422 `VALIDATION_ERROR` |
| Dependencies | `authority_competence` |
| Test Guidance | Resolution by jurisdiction/misconduct; pinning; kernel invariance; EMAIL-default-excluded |

---

### FR-M09-018 — Authority Competence Matrix & Finalise-Time Competence Guard **(v2, AI-1, R1)**

- **Module:** M09-DCP
- **Primary Role(s):** System Administrator (seed), DA / Appellate Authority (gated)

**User Story:** As the system, I must verify that the authority signing a penalty is competent for that penalty class/type so that no order is void for incompetence under Article 311(1).

**Description:** Maintains the `authority_competence` matrix ((cadre × penalty_class/type) → empowered authority level, with the Art. 311(1) not-subordinate-to-appointing rule for dismissal/removal/CR) and enforces it at order finalise and appeal decision (DI-13). **This is the highest-priority legality control (Council "One Thing To Do First").**

**Acceptance Criteria:**
1. SysAdmin can seed/maintain the matrix per competence set referenced by templates.
2. At finalise, the system resolves the respondent's cadre + the max penalty class/type and checks `passed_by`'s authority level; sets `competence_verified` and `competence_authority_level`.
3. **A `DISMISSAL` finalised by an authority subordinate to the appointing authority returns `AUTHORITY_NOT_COMPETENT` (409) and cannot persist** (the canonical failing-then-passing test).
4. Appeal decisions verify the appellate authority's competence (DI-13).
5. Every competence decision is recorded in the hash-chained audit.

**Business Rules:**
- BR-1: For multi-penalty orders, competence is resolved to the **highest** penalty class/type.
- BR-2: DISMISSAL/REMOVAL/CR require not-subordinate-to-appointing-authority.
- BR-3: Competence is verified against the cadre snapshot on `case_respondents` (stable across transfers).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `authority_competence` | matrix (seed/consume) |
| `penalty_orders` | `competence_verified`, `competence_authority_level` |
| `case_respondents` | cadre snapshot |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/admin/authority-competence` | List matrix |
| POST | `/api/v1/dcp/admin/authority-competence` | Seed/update entry |
| GET | `/api/v1/dcp/orders/{id}/competence-check` | Pre-finalise competence preview |

**UI Behavior Notes:** Admin matrix grid (cadre × class/type → level); order composer **competence badge** (green/red) with the resolving rule shown; finalise disabled until green.

**Edge Cases:** Cadre changes by promotion mid-case (snapshot used); no matrix entry for cadre/class (`AUTHORITY_NOT_COMPETENT`, fail-safe deny); delegated authority (modelled as authority level).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `CompetenceMatrixGrid`, `CompetenceBadge`; `CompetenceService` |
| Backend Flow | Resolve cadre + max penalty → lookup matrix → evaluate level + not-subordinate rule → set flags or reject |
| Data Operations | SELECT `authority_competence`; UPDATE `penalty_orders` competence fields |
| Validation | Matrix entry exists; level satisfied; Art. 311(1) rule |
| Authorization | Seed: SysAdmin; consume: finalise/appeal guards |
| State Changes & Side Effects | Blocks finalise/appeal when not competent |
| Failure Handling | 409 `AUTHORITY_NOT_COMPETENT`; fail-safe deny on missing entry |
| Dependencies | M01 (appointing authority resolution), `procedure_templates` |
| Test Guidance | **Canonical:** DISMISSAL by subordinate authority blocked; highest-class resolution; missing-entry deny |

---

### FR-M09-019 — Statutory Consultation Management (UPSC / CVC / ICC / Legal) **(v2, AI-2, R2)**

- **Module:** M09-DCP
- **Primary Role(s):** Vigilance Officer, Consulting Authority Liaison, DA

**User Story:** As a DA, I must record and close all mandatory external consultations before finalising so that the order is not set aside for want of consultation.

**Description:** Manages `case_consultations` whose required set is derived from the case's template (e.g. UPSC for central major penalties, CVC first/second-stage for vigilance, ICC for POSH). Finalise is blocked until every mandatory consultation is `CLOSED` (or `WAIVED` with reasons) (DI-14). Consultation advice relied upon as the basis of the penalty must be disclosed (DI-9).

**Acceptance Criteria:**
1. On entering DA consideration, the system pre-creates `REQUIRED` consultations from the template.
2. Each consultation transitions REQUIRED → REQUESTED → RECEIVED → CLOSED (or WAIVED with reasons).
3. Finalise is blocked with `CONSULTATION_PENDING` until all mandatory consultations are CLOSED/WAIVED.
4. Advice documents are confidential; if `is_advice_relied_upon=true`, disclosure to the charged officer is required.
5. A new `case_stage=CONSULTATION` is entered when mandatory consultations are outstanding; an SLA pause (`CONSULTATION`) applies while awaiting external advice.

**Business Rules:**
- BR-1: Mandatory set derived from template; WAIVER requires recorded reasons and competent authority.
- BR-2: CVC second-stage (post-inquiry) precedes final order in vigilance cases.
- BR-3: Awaiting external advice pauses the SLA clock (FR-024).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_consultations` | CRUD/transition |
| `procedure_templates` | required set |
| `sla_pause_events` | consultation pause |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/cases/{id}/consultations` | List required/recorded |
| POST | `/api/v1/dcp/cases/{id}/consultations` | Record/request |
| POST | `/api/v1/dcp/consultations/{id}/close` | Close/receive advice |
| POST | `/api/v1/dcp/consultations/{id}/waive` | Waive (reasons) |

**UI Behavior Notes:** Consultation checklist on the DA consideration screen with status chips; advice uploader (confidential); "blocks finalise" indicator; pause banner while awaiting.

**Edge Cases:** Consultation advice contrary to DA view (record + reasoned departure); waiver mis-used (audited); ICC report doubles as consultation in POSH.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ConsultationChecklist`, `AdviceUploader`; `ConsultationService`, `SlaPauseService` |
| Backend Flow | Derive required set → manage transitions → pause SLA while awaiting → gate finalise until closed/waived |
| Data Operations | INSERT/UPDATE `case_consultations`; INSERT `sla_pause_events` |
| Validation | Mandatory closure; waiver reasons; relied⇒disclosed |
| Authorization | Liaison/Vigilance record; DA closes/waives |
| State Changes & Side Effects | Case → `CONSULTATION`; finalise gate |
| Failure Handling | Finalise with pending ⇒ 409 `CONSULTATION_PENDING` |
| Dependencies | `procedure_templates`, FR-024, M13 |
| Test Guidance | Required-set derivation; finalise gate; pause; relied-advice disclosure |

---

### FR-M09-020 — Dispense-with-Inquiry (Article 311(2) Provisos) **(v2, AI-3, R3)**

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority

**User Story:** As a DA, in the limited lawful circumstances where an inquiry is dispensable, I want to record a reason-coded dispensation so that a penalty can be imposed without a full inquiry without violating due process.

**Description:** Models the lawful shortcut: a reason-coded `inquiry_dispensations` row (CRIMINAL_CONVICTION / NOT_REASONABLY_PRACTICABLE / SECURITY_OF_STATE) with recorded speaking reasons and a competent authority. An APPROVED dispensation satisfies the DI-3 major-penalty inquiry branch via documented exception (DI-23); the reason must be permitted by the template.

**Acceptance Criteria:**
1. A dispensation requires `reason_code` permitted by the template, `recorded_reasons`, and a competent `authority_id`.
2. Status transitions PROPOSED → APPROVED/REJECTED; only APPROVED satisfies DI-23.
3. With an APPROVED dispensation, FR-011 may finalise a penalty without a concluded inquiry (other kernel checks still apply).
4. CRIMINAL_CONVICTION requires a `supporting_ref` (conviction order).
5. Every dispensation is audited and timelined; the inquiry route is set to DISPENSED.

**Business Rules:**
- BR-1: Reason code must be in the template `dispensation_conditions_json`.
- BR-2: Dispensation does not waive competence (DI-13), consultation (DI-14), proportionality (DI-20), or signing (DI-28).
- BR-3: SECURITY_OF_STATE dispensation requires the empowered authority's recorded satisfaction.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_dispensations` | create/approve |
| `inquiry_proceedings` | route DISPENSED |
| `procedure_templates` | allowed conditions |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/dispensation` | Propose dispensation |
| POST | `/api/v1/dcp/dispensations/{id}/approve` | Approve/reject |

**UI Behavior Notes:** Dispensation drawer with reason-code selector (template-filtered), reasons editor, supporting-ref field, approval action with MFA.

**Edge Cases:** Reason not permitted by template (reject); dispensation later challenged (full audit available); conviction set aside on appeal (reopen path).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DispensationDrawer`; `DispensationService` |
| Backend Flow | Validate reason vs template + competence → persist PROPOSED → approve sets route DISPENSED → FR-011 reads APPROVED to satisfy DI-23 |
| Data Operations | INSERT/UPDATE `inquiry_dispensations`; UPDATE `inquiry_proceedings.inquiry_route` |
| Validation | Reason permitted; reasons present; supporting_ref for conviction |
| Authorization | Competent DA; MFA |
| State Changes & Side Effects | Route DISPENSED; enables guarded penalty |
| Failure Handling | Invalid reason ⇒ 422 `INQUIRY_DISPENSATION_INVALID`; penalty without approved dispensation/inquiry ⇒ 409 `DUE_PROCESS_INCOMPLETE` |
| Dependencies | `procedure_templates`, FR-011 |
| Test Guidance | Template-permitted reasons; DI-23 satisfaction; kernel checks still enforced |

---

### FR-M09-021 — Legal Service of Documents & Digital Signing (DSC/eSign) **(v2, AI-5, AI-17, R5, R17)**

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, DA, Process Server

**User Story:** As the system, I must record statutorily-valid legal service separately from informational notifications and require digital signatures on statutory artefacts so that service and signing are legally sound.

**Description:** Provides the `legal_service_records` lifecycle (mode, validity vs template, served_by, proof) distinct from the `notifications` ledger (DI-15), and the DSC/eSign signing service binding signatory identity + trusted timestamp on charge-sheets, inquiry reports, show-cause notices, and orders (DI-28). EMAIL is non-statutory by default.

**Acceptance Criteria:**
1. A legal-service record captures mode, served_date, served_by, and proof; `is_statutorily_valid` computed against the template valid modes.
2. Statutory reply/limitation windows compute only from valid service (DI-15); informational notifications never constitute service.
3. Charge-sheets, reports, show-cause notices, and orders cannot be served/finalised without DSC/eSign metadata (DI-28).
4. Signing calls the platform trust service and stores `signature_type`, `signatory_id`, `signed_at`, `signature_ref`.
5. EMAIL service is flagged non-statutory unless the template explicitly permits it.

**Business Rules:**
- BR-1: Valid modes are template-driven; SUBSTITUTED/PUBLICATION permitted when the officer absconds.
- BR-2: Signatory identity must match the authority empowered for the artefact.
- BR-3: Service proof is stored as an M13 object with hash.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `legal_service_records` | service lifecycle |
| `case_documents` / `penalty_orders` / `charge_sheets` | signature metadata |
| `procedure_templates` | valid modes |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/legal-service` | Record legal service |
| POST | `/api/v1/dcp/sign/{artefactType}/{id}` | DSC/eSign an artefact |
| GET | `/api/v1/dcp/sign/{artefactType}/{id}/verify` | Verify signature |

**UI Behavior Notes:** Service recorder showing only valid modes + EMAIL "non-statutory" warning; sign step with DSC token / eSign OTP flow; signature-verified badge on artefacts.

**Edge Cases:** Absconding officer (substituted/publication); signature service down (retain DRAFT, retry); revoked certificate (verify fails → block).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ServiceRecorder`, `SignStep`, `SignatureBadge`; `LegalServiceService`, `SigningService` |
| Backend Flow | Record service → compute validity vs template → set windows; sign → call trust service → store metadata; verify on demand |
| Data Operations | INSERT `legal_service_records`; UPDATE signature fields on artefacts |
| Validation | Mode validity; signatory empowerment; proof present |
| Authorization | DA/Admin/Server per artefact |
| State Changes & Side Effects | Windows computed; served/finalised states gated on signature |
| Failure Handling | Invalid mode ⇒ 409 `INVALID_SERVICE_MODE`; unsigned ⇒ 422 `SIGNATURE_REQUIRED`; verify fail ⇒ 409 `SIGNATURE_INVALID` |
| Dependencies | DSC/eSign trust service, M13, `procedure_templates` |
| Test Guidance | Valid-service window computation; EMAIL non-statutory; signing gate; verify |

---

### FR-M09-022 — Common / Joint (Multi-Respondent) Proceedings **(v2, AI-7, R7)**

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, DCP Admin, IO

**User Story:** As a DA handling collusive misconduct, I want to try co-delinquents in common proceedings sharing one inquiry, witnesses, and evidence so that findings are consistent and effort is not duplicated.

**Description:** Introduces `case_respondents` (1..N charged officers per case) so one inquiry, witness set, and exhibit set cover co-delinquents, with **per-respondent, article-wise findings** and **per-respondent orders/exoneration** (DI-25). Each respondent may have a different competent DA; severance is supported with reasons.

**Acceptance Criteria:**
1. A case can hold multiple `case_respondents`; one is `is_primary`.
2. One inquiry, witness set, and exhibit set are shared; findings are recorded per respondent × article.
3. Show-cause, personal hearing, and penalty orders are issued per respondent.
4. The case cannot close until every ACTIVE respondent has an order/exoneration/abatement (DI-25).
5. Severance (`SEVERED`) requires recorded reasons and spins off a linked case.

**Business Rules:**
- BR-1: Per-respondent competent DA resolved from cadre (DI-13).
- BR-2: Shared evidence is disclosed to all respondents (DI-9).
- BR-3: Inconsistent findings across respondents on identical evidence are flagged for review.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_respondents` | 1..N respondents |
| `inquiry_reports` | per-respondent findings_json |
| `penalty_orders` / `show_cause_notices` / `personal_hearings` | `respondent_id` |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/respondents` | Add respondent |
| POST | `/api/v1/dcp/respondents/{id}/sever` | Sever (reasons) |
| GET | `/api/v1/dcp/cases/{id}/respondents` | List respondents + status |

**UI Behavior Notes:** Respondent roster panel; per-respondent finding grid and order tabs; severance action; consistency-flag indicator.

**Edge Cases:** A respondent exonerated while others penalised; respondent dies (abate that respondent only, FR-028); respondent transferred (re-resolve DA, FR-026).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `RespondentRoster`, `PerRespondentFindingGrid`; `RespondentService` |
| Backend Flow | Add respondents → share inquiry → record per-respondent findings → per-respondent orders → close only when all resolved |
| Data Operations | INSERT/UPDATE `case_respondents`; per-respondent rows on orders/show-cause/reports |
| Validation | All-respondent resolution before close (DI-25); per-respondent competence |
| Authorization | DA/Admin |
| State Changes & Side Effects | Respondent status transitions; severance spins linked case |
| Failure Handling | Close with unresolved respondent ⇒ 409 `RESPONDENT_UNRESOLVED`; conflicting actor ⇒ 409 `ACTOR_CONFLICT` |
| Dependencies | FR-007/008/010/011, FR-026, FR-028 |
| Test Guidance | Shared inquiry; per-respondent findings/orders; close gate; severance |

---

### FR-M09-023 — POSH / Internal Committee Procedure **(v2, AI-16, R16)**

- **Module:** M09-DCP
- **Primary Role(s):** Internal Committee (Presiding Officer, Members, External Member), DA

**User Story:** As an organisation handling a sexual-harassment complaint, I want the case routed through a POSH Internal Committee with mandated composition and timelines so that it complies with the POSH Act 2013 instead of the ordinary IO route.

**Description:** For `misconduct_category=HARASSMENT` (`is_posh_case=true`), the case uses the **ICC_POSH** template: an Internal Committee is constituted (presiding officer who is a senior woman, members, and ≥1 external member from an NGO/expert) and conducts the inquiry under POSH timelines (e.g. 90-day inquiry, 10-day report); the ICC report feeds the penalty stage in place of the ordinary IO route (AI-16). Confidentiality and anti-retaliation are heightened.

**Acceptance Criteria:**
1. HARASSMENT cases resolve the ICC template and set `inquiry_route=ICC_POSH`.
2. ICC constitution enforces composition (presiding officer + ≥1 external member); missing ⇒ `ICC_PROCEDURE_REQUIRED`.
3. POSH-specific timelines apply (configurable in the template) and feed SLA tracking.
4. The ICC report (signed) feeds FR-008/FR-011 as the inquiry finding.
5. Heightened confidentiality: complainant identity protected; anti-retaliation flag on the case.

**Business Rules:**
- BR-1: External member is mandatory for ICC quorum.
- BR-2: Conciliation (if opted by complainant) is recorded before inquiry; no monetary settlement as basis of conciliation.
- BR-3: ICC findings follow the same kernel (competence, consultation if any, proportionality, signing).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `inquiry_appointments` | ICC roles |
| `inquiry_proceedings` | route ICC_POSH |
| `procedure_templates` | POSH timelines/composition |
| `inquiry_reports` | ICC report |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/inquiries/{id}/icc` | Constitute ICC |
| POST | `/api/v1/dcp/inquiries/{id}/conciliation` | Record conciliation (optional) |

**UI Behavior Notes:** ICC constitution panel with external-member slot; POSH confidentiality banner; conciliation record; POSH timeline ribbon.

**Edge Cases:** Complainant opts for conciliation then withdraws (resume inquiry); respondent and complainant in same reporting line (heightened safeguards); cross-organisation external member.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ICCConstitutionPanel`, `ConciliationRecord`, `POSHConfidentialityBanner`; `ICCService` |
| Backend Flow | Resolve ICC template → constitute committee (validate composition) → optional conciliation → ICC inquiry (reuses FR-007/008) → report feeds penalty stage |
| Data Operations | INSERT `inquiry_appointments` (ICC); UPDATE `inquiry_proceedings.inquiry_route` |
| Validation | Composition (external member); POSH timelines; confidentiality |
| Authorization | DA constitutes; ICC conducts |
| State Changes & Side Effects | ICC route; heightened confidentiality |
| Failure Handling | Missing composition ⇒ 409 `ICC_PROCEDURE_REQUIRED` |
| Dependencies | `procedure_templates`, FR-006/007/008/011 |
| Test Guidance | ICC composition; POSH timelines; report-feeds-penalty; confidentiality |

---

### FR-M09-024 — SLA Pause/Resume & Clock Management **(v2, AI-10, AI-18, R10, R18)**

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, DA, SLA engine (system)

**User Story:** As a Case Manager, I want the SLA clock to pause lawfully during stays, remits, condonation, consultation, and criminal stays so that the dashboard never shows false breaches.

**Description:** Provides the `sla_pause_events` ledger and recomputation logic (DI-18). When a pause reason occurs (STAY / REMIT / CONDONATION / CONSULTATION / CRIMINAL_STAY), the affected stage's `sla_status=PAUSED`; on resume, `sla_target_at` and `expected_closure_date` are recomputed by adding the paused duration. Integrates with FR-007 (criminal stay), FR-008/009 (remit), FR-012 (condonation), FR-019 (consultation).

**Acceptance Criteria:**
1. A pause event records stage, reason, `paused_from`, `paused_by`, and source ref.
2. While paused, the SLA evaluator raises no breach for that stage (DI-18).
3. On resume, `resumed_at` is set and targets recomputed (`recompute_applied=true`).
4. The timeline records `SLA_PAUSE`/`SLA_RESUME` events (hash-chained).
5. Overlapping pauses for the same stage are coalesced; the dashboard shows total paused duration.

**Business Rules:**
- BR-1: Only defined reasons may pause; each pause has a single owning source.
- BR-2: Pauses are append-only (DI-12); a resume is a new field, not a deletion.
- BR-3: Statutory floors still apply to active (unpaused) time.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `sla_pause_events` | pause/resume ledger |
| `case_timeline_events` | pause/resume events |
| `disciplinary_cases` | recomputed `expected_closure_date` |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/sla/pause` | Open a pause |
| POST | `/api/v1/dcp/cases/{id}/sla/resume` | Resume (recompute) |
| GET | `/api/v1/dcp/cases/{id}/sla/pauses` | List pause windows |

**UI Behavior Notes:** SLA ribbon shows `PAUSED` with reason and elapsed paused time; resume action recomputes and displays new targets.

**Edge Cases:** Resume before pause (rejected); multiple concurrent reasons (each tracked, dashboard sums distinct windows); pause spanning stage change (carried to new stage where applicable).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SLAPauseControl`, `PausedRibbon`; `SlaPauseService`, `SlaEngine` |
| Backend Flow | Open pause → set stage PAUSED → evaluator skips → resume sets resumed_at + recompute targets + timeline events |
| Data Operations | INSERT `sla_pause_events`; UPDATE `disciplinary_cases.expected_closure_date`; INSERT `case_timeline_events` |
| Validation | Defined reasons; no resume without open pause; recompute correctness |
| Authorization | DA/Admin; system for auto pauses (criminal stay/consultation) |
| State Changes & Side Effects | sla_status PAUSED/resumed; targets recomputed |
| Failure Handling | Resume without pause ⇒ 409 `SLA_PAUSE_INVALID` |
| Dependencies | FR-016, FR-007/008/012/019 |
| Test Guidance | No false breach while paused; recompute on resume; coalesced overlaps |

---

### FR-M09-025 — Personal Hearing Record (Show-Cause / Appeal) **(v2, AI-21)**

- **Module:** M09-DCP
- **Primary Role(s):** Disciplinary Authority, Appellate Authority, Charged Officer

**User Story:** As a charged officer, I want a recorded personal hearing at the show-cause/appeal stage so that my right to be heard in person is honoured and provable; and as the authority, I want to record grant/denial with reasons.

**Description:** Models `personal_hearings` for SHOW_CAUSE and APPEAL stages — request, grant/denial (with reasons), schedule, minutes — referenced by the relevant show-cause/appeal record (DI-29). Denial of a requested hearing requires recorded reasons and is challengeable.

**Acceptance Criteria:**
1. A charged officer's request is recorded (`requested=true`).
2. The authority grants or denies; denial requires `denial_reason` (DI-29).
3. If granted, schedule and minutes (optionally a signed minutes document) are recorded.
4. The show-cause/appeal references the hearing (`personal_hearing_id`).
5. Hearing actions are audited and timelined.

**Business Rules:**
- BR-1: A personal hearing cannot be silently skipped where requested at show-cause/appeal.
- BR-2: Minutes are immutable once finalised.
- BR-3: The presiding authority must be the DA (show-cause) or appellate authority (appeal).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `personal_hearings` | request/grant/hold |
| `show_cause_notices` / `appeals` | reference |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/personal-hearings` | Request/record |
| POST | `/api/v1/dcp/personal-hearings/{id}/decision` | Grant/deny (reasons) |
| POST | `/api/v1/dcp/personal-hearings/{id}/minutes` | Record minutes |

**UI Behavior Notes:** Personal-hearing scheduler with grant/deny + reasons; minutes editor; reference shown on show-cause/appeal screens.

**Edge Cases:** Officer requests but does not attend (record no-show); hearing adjourned; denial later challenged on appeal.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PersonalHearingScheduler`, `MinutesEditor`; `PersonalHearingService` |
| Backend Flow | Record request → authority decision (deny ⇒ reasons) → schedule → hold + minutes → link to show-cause/appeal |
| Data Operations | INSERT/UPDATE `personal_hearings`; UPDATE referencing record |
| Validation | Denial reasons (DI-29); presiding authority correct; minutes immutability |
| Authorization | DA/Appellate authority; charged officer requests |
| State Changes & Side Effects | Linked to show-cause/appeal; timeline |
| Failure Handling | Deny without reason ⇒ 422 `PERSONAL_HEARING_DENIED` |
| Dependencies | FR-010, FR-012 |
| Test Guidance | Grant/deny reasons; minutes; linkage |

---

### FR-M09-026 — Mid-Proceeding Jurisdiction Transfer, Sealed Cover & Retiree Proceedings **(v2, AI-13, R13)**

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, Disciplinary Authority, Vigilance Officer

**User Story:** As a Case Manager, when a charged officer is transferred, promoted, or retires mid-proceeding, I want the competent authority re-resolved, promotion frozen via sealed cover, and the Rule 9 time-bar/sanction enforced so that the proceeding stays valid against lifecycle changes.

**Description:** Handles employee-lifecycle races against long proceedings: a **jurisdiction-transfer** event re-resolves the competent DA (from M05/M06 changes) and records `JURISDICTION_TRANSFER` in the timeline; **sealed cover** freezes M06 promotion recommendations while proceedings are pending; **retiree proceedings** enforce the CCS (Pension) Rule 9 **four-year event bar** plus required government/President sanction (DI-27).

**Acceptance Criteria:**
1. On a transfer/promotion event for a charged officer, the system re-resolves the competent DA, updates `disciplinary_cases.disciplinary_authority_id` (and per-respondent), and records a `JURISDICTION_TRANSFER` timeline event.
2. While proceedings are pending, M06 promotion is held in **sealed cover** (`vigilance_records.sealed_cover_flag`, `disciplinary_cases.is_sealed_cover`); exoneration lifts it, penalty resolves it per rules.
3. Retiree proceedings require `is_retiree_case=true`, a recorded `retiree_sanction_ref`, and that the misconduct event be within the Rule 9 four-year bar; failing ⇒ `RETIREE_PROCEEDING_BARRED`.
4. The cadre snapshot on `case_respondents` remains stable for competence (FR-018).
5. All changes are audited and timelined.

**Business Rules:**
- BR-1: Competence re-resolution uses the cadre snapshot, not the post-promotion cadre.
- BR-2: Sealed cover is mandatory for pending major-penalty proceedings during a promotion cycle.
- BR-3: Retiree proceedings without sanction or beyond four years are barred.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `disciplinary_cases` | DA, sealed-cover, retiree flags |
| `case_respondents` | per-respondent DA, cadre snapshot |
| `vigilance_records` | sealed-cover flag (M06) |
| `case_timeline_events` | JURISDICTION_TRANSFER |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/jurisdiction-transfer` | Re-resolve DA |
| POST | `/api/v1/dcp/cases/{id}/sealed-cover` | Set/lift sealed cover |
| POST | `/api/v1/dcp/cases/{id}/retiree-proceeding` | Mark retiree + sanction |

**UI Behavior Notes:** Jurisdiction-transfer banner with old/new DA; sealed-cover badge feeding M06; retiree-proceeding panel with sanction ref and four-year-bar check.

**Edge Cases:** Multiple transfers; promotion due during proceedings (sealed cover); employee retires day before order (retiree path); event older than four years (barred).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `JurisdictionTransferBanner`, `SealedCoverBadge`, `RetireeProceedingPanel`; `JurisdictionService`, `SealedCoverService`, `RetireeGuard` |
| Backend Flow | On M05/M06 event → re-resolve DA → record event; set sealed cover while pending; on retiree mark, enforce Rule 9 + sanction |
| Data Operations | UPDATE `disciplinary_cases`/`case_respondents`; UPDATE `vigilance_records.sealed_cover_flag`; INSERT timeline |
| Validation | Cadre-snapshot competence; sanction present; four-year bar |
| Authorization | DA/Admin/Vigilance |
| State Changes & Side Effects | DA changed; promotion frozen; retiree gate |
| Failure Handling | Barred retiree ⇒ 409 `RETIREE_PROCEEDING_BARRED`; missing sanction ⇒ 422 |
| Dependencies | M05, M06, M11, FR-015, FR-018 |
| Test Guidance | DA re-resolution; sealed-cover gate; Rule 9 bar + sanction |

---

### FR-M09-027 — Court-Grade Hash-Chained Audit & Verification **(v2, AI-15, R15)**

- **Module:** M09-DCP
- **Primary Role(s):** Auditor, System Administrator, all writers (implicit)

**User Story:** As an Auditor, I want the audit/timeline ledger to be cryptographically tamper-evident (not merely append-only by policy) so that the record is court-grade evidence.

**Description:** Each `case_timeline_events` row stores `seq_no`, `prev_hash` (prior row's `row_hash`), and a computed `row_hash` over the canonical row + prev_hash (DI-21). A verify endpoint recomputes the chain per case and detects any mutation. The platform `audit_log` is mirrored into this chained ledger for module-critical events.

**Acceptance Criteria:**
1. Every timeline insert computes `row_hash` from the canonical row content + `prev_hash`.
2. The chain is per-case, monotonic by `seq_no`.
3. A verify endpoint recomputes the chain and returns OK or the first broken `seq_no`.
4. Any DB-layer mutation of a row is detected on verify (`AUDIT_CHAIN_BROKEN`).
5. Verification is available to Auditor/SysAdmin and is itself audited.

**Business Rules:**
- BR-1: The ledger is insert-only (DI-12); no updates/deletes.
- BR-2: Hash algorithm is SHA-256 over a canonical serialization.
- BR-3: Verification does not expose confidential field values (hashes only).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `case_timeline_events` | `seq_no`/`prev_hash`/`row_hash` |
| `audit_log` | mirrored critical events |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/dcp/cases/{id}/audit/verify` | Verify chain |
| GET | `/api/v1/dcp/cases/{id}/audit/chain` | Chain metadata (hashes) |

**UI Behavior Notes:** Audit-integrity card on case detail showing "chain verified" / "broken at seq N"; Auditor verify action.

**Edge Cases:** Concurrent inserts (seq_no allocated transactionally); migration backfill (genesis hash); chain break detection on tamper.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AuditIntegrityCard`; `HashChainService`, `AuditVerifyService` |
| Backend Flow | On insert: allocate seq_no, read prev row_hash, compute row_hash in txn; verify: recompute chain, compare |
| Data Operations | INSERT `case_timeline_events` (chained); SELECT for verify |
| Validation | Monotonic seq; hash correctness |
| Authorization | Verify: Auditor/SysAdmin |
| State Changes & Side Effects | None (read for verify) |
| Failure Handling | Mismatch ⇒ 409 `AUDIT_CHAIN_BROKEN` with first broken seq |
| Dependencies | platform audit |
| Test Guidance | Chain continuity; tamper detection; concurrent insert ordering |

---

### FR-M09-028 — Abatement on Death / Terminal Handling **(v2, AI-14, R14)**

- **Module:** M09-DCP
- **Primary Role(s):** DCP Admin, Disciplinary Authority

**User Story:** As a Case Manager, when a charged officer dies during proceedings, I want the case (or that respondent) to abate cleanly so that SLAs stop and no penalty effects flow.

**Description:** Adds the terminal abatement path: on charged-officer death (M01 `employment_status=DECEASED`), the case/respondent moves to `ABATED` (`order_type=ABATED`, `case_status=ABATED`), SLAs stop, downstream penalty effects are suppressed, and no further penalty order may be finalised for that respondent (DI-26). Pension/terminal benefits proceed unaffected by abated proceedings.

**Acceptance Criteria:**
1. On death detection (or manual record with proof), the case/respondent is set to `ABATED` with `abatement_reason`.
2. An `ABATED` order is recorded (terminal); no PENALTY order can be finalised thereafter (DI-26).
3. Open SLAs stop (pause/close); no breach raised post-abatement.
4. Any queued downstream penalty effects are suppressed/cancelled.
5. An SR event records abatement (FR-013) for the statutory record.

**Business Rules:**
- BR-1: Abatement is irreversible (subject to correction if death recorded in error, via audited reversal).
- BR-2: In multi-respondent cases, only the deceased respondent abates; others continue.
- BR-3: Abatement does not by itself decide pension — M11 applies its own rules.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `disciplinary_cases` | `case_status=ABATED`, reason |
| `case_respondents` | respondent ABATED |
| `penalty_orders` | `order_type=ABATED` |
| `service_register_events` | abatement event |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dcp/cases/{id}/abate` | Record abatement |
| POST | `/api/v1/dcp/respondents/{id}/abate` | Abate one respondent |

**UI Behavior Notes:** Abatement action with proof-of-death upload; abated badge; SLA ribbon shows stopped; downstream effects shown suppressed.

**Edge Cases:** Death recorded in error (audited reversal); death after order finalised but before service (record per rules); abatement in joint proceedings (single respondent).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AbatementAction`, `AbatedBadge`; `AbatementService` |
| Backend Flow | Detect/record death → set ABATED → stop SLAs → suppress queued effects → append SR abatement event |
| Data Operations | UPDATE `disciplinary_cases`/`case_respondents`; INSERT `penalty_orders`(ABATED); INSERT `service_register_events` |
| Validation | Death proof; no penalty post-abatement (DI-26) |
| Authorization | DA/Admin |
| State Changes & Side Effects | Case/respondent ABATED; SLA stop; effects suppressed |
| Failure Handling | Penalty finalise on abated ⇒ 409 `CASE_ABATED` |
| Dependencies | M01, M11, FR-013, FR-016 |
| Test Guidance | Abatement stops SLA; suppresses effects; multi-respondent isolation |

---

## 7. UI Requirements

### 7.1 Screen inventory

| Screen | Primary roles | Key elements |
|--------|---------------|--------------|
| Disciplinary Case Workbench (list) | DCP Admin, DA, Vigilance | Filterable/paginated case list, status & SLA chips (incl. PAUSED), quick-create, **fast-lane launcher** |
| Case Detail (360°) | DA, IO, PO, Admin | Stage stepper (suspension as **parallel ribbon**), hash-chained timeline, parties/**respondent roster**, artefacts, actions, **legality checklist** (competence/consultation/proportionality/signature) |
| Complaint Intake & Triage | Vigilance, Admin | Source form, dedup panel, triage drawer, **template + DA competence badge** |
| Suspension Manager | DA, Admin | Order form, subsistence slider (template bounds), **NEC chip**, deemed-review banner, review reminders |
| Charge-Sheet Builder | DA, PO, Admin | Article editor, track selector, **DSC/eSign sign step**, PDF preview, **legal-service recorder** (valid modes only) |
| Charged-Officer Portal | Employee | **Rights & Deadlines surface** (entitlements + limitation countdown), served + disclosed documents only, defence submission, personal-hearing request, appeal filing |
| Inquiry Workbench | IO, PO, ICC | **Inspection gate**, hearing calendar, daily order sheet, witness register, exhibit vault (relied/disclosed), ex-parte, **stay control** |
| ICC Workbench | ICC | Composition panel, POSH timeline ribbon, conciliation record, confidentiality banner |
| Inquiry Report Composer | IO/ICC, DA | Per-respondent × per-article finding grid, reasoning, sign, serve/remit |
| DA Consideration & Consultation | DA, Liaison | Accept/disagree, **consultation checklist**, advice uploader |
| Order Composer | DA | Penalty-item builder (recovery-cap validators), reasoning + **proportionality** editors, legality checklist, sign + finalise (MFA) |
| Appeal/Review Console | Employee, Appellate/Reviewing Auth | Filing, limitation indicator, **competence badge**, personal-hearing scheduler, decision screen |
| Evidence Vault Explorer | IO, PO, DA, Auditor | Grouped artefacts, seal/served/**signed**/integrity badges, **audit-integrity card** |
| Vigilance Register | Vigilance Officer | Status grid, **sealed-cover badge**, clearance card, override |
| Admin Configuration | SysAdmin | **Procedure-template editor**, **authority-competence matrix**, SLA matrix |
| Analytics Dashboard | DA, Admin, Auditor | KPI tiles, ageing/bottleneck/penalty-mix charts, **proportionality-outlier** panel |

### 7.2 Cross-cutting UI rules

- Real fields, real data, real states — no skeleton placeholders. Every screen defines **empty / loading / error / success / permission-denied / offline** states.
- WCAG 2.1 AA: keyboard navigation, focus order, contrast, ARIA labels on all interactive controls.
- Confidentiality: charged-officer views render **only** served + relied-upon-disclosed artefacts; masked complainant identity where flagged.
- Destructive/finalising actions (finalise order, declare ex-parte, post to SR, abate) use confirm dialogs, **DSC/eSign**, and step-up MFA where specified.
- Dates display `DD-MMM-YYYY`; money in INR; all timestamps localised from UTC.
- All lists paginated (max 100/page) with server-side filter/sort.

### 7.3 Rights & Deadlines surface (Charged-Officer Portal) **(v2, AI-19)**

The portal's primary panel is a **rights-and-deadlines guide**, not a document list:
- **Entitlements:** right to a defence assistant; right to a list of relied documents/witnesses and to **inspect** them; right to a **personal hearing** at show-cause/appeal; right to **appeal** within limitation.
- **Deadlines (live countdowns):** defence reply due; representation windows (inquiry report, disagreement memo, show-cause); **appeal limitation** countdown after an order is served.
- **Status:** current stage, whether suspension is active (parallel), whether an inquiry is stayed.
- All entitlements link to the action (request assistant, request inspection, request hearing, file appeal). Denials of requested rights show the recorded reason.

### 7.4 Fast-lane UI path **(v2, AI-22)**

For **minor-track, admitted-charge, single-respondent** cases, a condensed ≈4-screen flow is offered — (1) Intake/Charge, (2) Defence (ADMITS_ALL), (3) Order (proportionality + sign), (4) SR posting. The fast lane is **UI altitude only**: it invokes the **same** services and enforces **every** integrity rule (DI-2/3/4/13/14/20/22/28) and the **same** hash-chained audit chain — it merely hides stages that do not apply (no inquiry, no show-cause where config permits for minor admitted). It never thins legal defensibility.

---

## 8. (Reserved — merged into §6 LLDs)

*Low-Level Design is provided inline per FR in §6 as required by the authoring standard.*

---

## 9. (Reserved — see §6 and §10)

*Detailed backend flows are in each FR's LLD; API specifics follow in §10.*

---

## 10. API & Integration

### 10.1 Conventions & idempotency lifecycle **(v2)**

- Base path `/api/v1/dcp`; JSON; OIDC JWT bearer; RBAC + row-level + field-level enforcement.
- All list endpoints paginated: `?page=&limit=` (max 100), returning `{ data, page, limit, total }`.
- **Idempotency lifecycle (DI-19, AI-11):** state-changing propagating posts (`/suspensions`, `/orders/{id}/finalise`, `/orders/{id}/post-to-sr`, `/appeals/{id}/decide`) **require** an `Idempotency-Key` header. The server records the key in `idempotency_keys` with a `request_fingerprint` (SHA-256 of canonical body), `scope`, `status`, and `expires_at` (**TTL = 7 days**). Re-sending a known key + matching fingerprint **replays the stored response** with no second effect; a known key with a **different** fingerprint returns `IDEMPOTENCY_CONFLICT` (409). Keys may be client-minted (UUID) or server-minted if absent; expired keys are pruned.
- **Digital signing:** statutory artefacts are signed via `/sign/{artefactType}/{id}` (DSC/eSign) and verifiable via `/verify`.

### 10.2 Canonical error envelope

```json
{
  "error": { "code": "AUTHORITY_NOT_COMPETENT", "message": "Signing authority is subordinate to the appointing authority for a DISMISSAL penalty (Article 311(1)).", "field": "passed_by" },
  "requestId": "req-7f3a9c20"
}
```

### 10.3 Error-code catalog (module-specific, in addition to shared codes)

| Code | HTTP | Meaning | New v2 |
|------|------|---------|:--:|
| `DUPLICATE_COMPLAINT` | 409 | Open complaint/case already exists for subject | |
| `DA_NOT_RESOLVED` | 422 | Competent disciplinary authority not resolvable | |
| `DA_BIAS_CONFLICT` | 409 | DA is also complainant/witness (DI-2) | ✔ |
| `INVALID_STATE_TRANSITION` | 409 | Stage/status transition not allowed | |
| `ACTOR_CONFLICT` | 409 | DA/IO/PO/witness not mutually distinct | |
| `DEFENCE_WINDOW_CLOSED` | 409 | Defence submitted after due date without extension | |
| `INSPECTION_NOT_AFFORDED` | 409 | Evidence recorded before document/witness inspection (DI-24) | ✔ |
| `INCOMPLETE_FINDINGS` | 422 | Inquiry report missing an article/respondent finding | |
| `NATURAL_JUSTICE_VIOLATION` | 409 | Penalty on not-proved without memo; or relied-not-disclosed material (DI-9) | |
| `PENALTY_EXCEEDS_PROPOSED` | 409 | Order penalty not subset of show-cause (DI-4) | |
| `DUE_PROCESS_INCOMPLETE` | 409 | Required prior stage missing / no lawful dispensation (DI-3/DI-23) | |
| `AUTHORITY_NOT_COMPETENT` | 409 | Signing authority not competent for penalty class/type (DI-13, Art. 311(1)) | ✔ |
| `CONSULTATION_PENDING` | 409 | Mandatory UPSC/CVC/ICC consultation not closed (DI-14) | ✔ |
| `INQUIRY_DISPENSATION_INVALID` | 422 | Dispensation reason not permitted by template (DI-23) | ✔ |
| `INVALID_SERVICE_MODE` | 409 | Service mode not statutorily valid per template (DI-15) | ✔ |
| `SIGNATURE_REQUIRED` | 422 | Artefact lacks DSC/eSign (DI-28) | ✔ |
| `SIGNATURE_INVALID` | 409 | Signature verification failed | ✔ |
| `NON_EMPLOYMENT_CERT_REQUIRED` | 422 | Subsistence payment without NEC (DI-16) | ✔ |
| `PROPORTIONALITY_REASONING_REQUIRED` | 422 | Order finalise without proportionality reasoning (DI-20) | ✔ |
| `RECOVERY_CAP_EXCEEDED` | 422 | Recovery beyond cap/instalment/retirement rule (DI-22) | ✔ |
| `ICC_PROCEDURE_REQUIRED` | 409 | POSH case missing ICC composition (AI-16) | ✔ |
| `RESPONDENT_UNRESOLVED` | 409 | Case close with an unresolved active respondent (DI-25) | ✔ |
| `RETIREE_PROCEEDING_BARRED` | 409 | Retiree proceeding beyond four-year bar or without sanction (DI-27) | ✔ |
| `CASE_ABATED` | 409 | Penalty finalise on an abated case/respondent (DI-26) | ✔ |
| `SLA_PAUSE_INVALID` | 409 | Resume without an open pause (DI-18) | ✔ |
| `IDEMPOTENCY_CONFLICT` | 409 | Known idempotency key with mismatched fingerprint (DI-19) | ✔ |
| `AUDIT_CHAIN_BROKEN` | 409 | Hash-chain verification failed (DI-21) | ✔ |
| `PROCEDURE_TEMPLATE_INVALID` | 422 | No/ambiguous procedure template (DI-17) | ✔ |
| `ORDER_IMMUTABLE` | 409 | Edit attempted on finalised order (DI-6) | |
| `APPEAL_TIME_BARRED` | 409 | Appeal beyond limitation without condonation (DI-5) | |
| `EVIDENCE_TAMPERED` | 409 | content_hash mismatch (DI-7) | |
| `SUBSISTENCE_OUT_OF_BOUNDS` | 422 | Subsistence rate outside template bounds (DI-8) | |
| `PERSONAL_HEARING_DENIED` | 422 | Requested personal hearing denied without reasons (DI-29) | ✔ |
| `CONFIDENTIALITY_DENIED` | 403 | Attempt to access sealed/confidential artefact | |

### 10.4 Representative request/response examples

**Competence-blocked finalise (POST `/orders/{id}/finalise`)**

```json
// 409 Conflict
{
  "error": { "code": "AUTHORITY_NOT_COMPETENT", "message": "A DISMISSAL must be passed by an authority not subordinate to the appointing authority (Article 311(1)).", "field": "passed_by" },
  "requestId": "req-8810ab12"
}
```

**Finalise order (POST `/orders/{id}/finalise`, `Idempotency-Key` required)**

```json
// 200 OK
{
  "orderId": "po-02",
  "status": "FINALISED",
  "competenceVerified": true,
  "consultationsClosed": true,
  "proportionalityReasoning": "Withholding + recovery proportionate to ₹1.5L loss; first major lapse.",
  "signature": { "type": "DSC", "signatoryId": "emp-9001", "signedAt": "2026-10-12T09:00:00Z" },
  "penalties": [
    { "type": "WITHHOLD_INCREMENT", "class": "MAJOR", "durationMonths": 24 },
    { "type": "RECOVERY", "class": "MAJOR", "recoveryAmount": 150000.00, "monthlyCapPct": 33.33 }
  ],
  "srPosting": "QUEUED"
}
```

**Idempotent replay (same `Idempotency-Key`, same body)**

```json
// 200 OK (replayed snapshot — no second effect)
{ "orderId": "po-02", "status": "FINALISED", "replayed": true }
```

**Record legal service (POST `/legal-service`)**

```json
// request
{ "artefactType": "CHARGE_SHEET", "entityRefId": "cs-01", "serviceMode": "EMAIL", "servedDate": "2026-03-08" }
// 409 Conflict
{ "error": { "code": "INVALID_SERVICE_MODE", "message": "EMAIL is not a statutorily valid service mode for template CCS_CCA_2026.", "field": "serviceMode" }, "requestId": "req-22f1" }
```

**Verify audit chain (GET `/cases/{id}/audit/verify`)**

```json
{ "caseId": "8f1c…01", "verified": true, "events": 47, "lastSeqNo": 47 }
```

**Consultation gate (POST `/orders/{id}/finalise`)**

```json
// 409 Conflict
{ "error": { "code": "CONSULTATION_PENDING", "message": "UPSC consultation must be CLOSED before finalising a major penalty.", "field": "consultations" }, "requestId": "req-99c0" }
```

### 10.5 Integration contracts

| Target | Trigger | Payload essence | Reliability |
|--------|---------|-----------------|-------------|
| M12 SR | order finalise, suspension, appeal, **abatement** | event_type, employee_id, order_ref, effective_date | append-only, **idempotent (key)** |
| M10 PAY | suspension (**NEC-gated**), recovery (**capped**), reduction, withhold-increment | employee_id, effect_type, amount/%/effective_date | outbox + retry, idempotent |
| M11 PEN | CR/removal/dismissal, pension cut, **retiree** | employee_id, effect_type, value | outbox + retry |
| M06 PPP | reduction in rank, withhold promotion, **sealed cover** | employee_id, designation/seniority effect, sealed_cover_flag | outbox + retry |
| M05 TRJ | transfer (inbound) | employee_id, new org_unit ⇒ **jurisdiction transfer** | event consume |
| M13 DMS | all artefacts (**signed**) | object upload, hash, signature metadata | synchronous + retry |
| DSC/eSign trust service | sign/verify | artefact hash, signatory, timestamp | synchronous |
| M14 DAS | analytics incl. **proportionality outliers** | KPI read feed | read-only |

---

## 11. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | P95 API < 500 ms; analytics aggregates via materialised views refreshed ≤ 15 min; competence/consultation checks add ≤ 50 ms to finalise |
| Availability | 99.9% uptime; RPO ≤ 15 min, RTO ≤ 4h |
| Scalability | Horizontal scaling; handle 100k+ active cases and multi-respondent proceedings; paginated everywhere |
| Security | OWASP ASVS L2; TLS 1.2+; encryption at rest; step-up MFA for major penalties/appeals; **DSC/eSign** for statutory signing; field-level confidentiality |
| Privacy | DPDP Act 2023 alignment; PII minimisation; whistle-blower protection; **POSH heightened confidentiality**; masked exports |
| Auditability | **Cryptographically hash-chained** `case_timeline_events` + immutable `audit_log`; verify endpoint; read-audit on sealed records |
| Integrity | SHA-256 evidence sealing; immutable finalised orders; **exactly-once** outbox propagation via idempotency keys |
| Legality | Competence guard (Art. 311(1)), mandatory-consultation gate, lawful dispensation, valid-service vs notification separation enforced server-side |
| Accessibility | WCAG 2.1 AA across all screens incl. Rights & Deadlines surface and fast lane |
| Retention | Statutory retention of disciplinary records (lifelong + post-service per schedule); legal-hold support; signed-artefact + signature-metadata retention |
| Observability | Structured logs (no PII values), metrics on SLA breaches/pauses, competence/consultation blocks, propagation failures; traces with requestId |
| Configurability | Two-layer overlay only (`procedure_templates`/`authority_competence`); kernel non-configurable; **no generic BPM designer** |
| Localisation | UTC storage; `DD-MMM-YYYY`; INR; i18n-ready labels |

---

## 12. Workflow & State Diagrams (State Tables)

### 12.1 Case lifecycle (`case_status` × `case_stage`) — suspension removed from linear sequence **(v2)**

| Current stage | Event | Next stage | Guard |
|---------------|-------|-----------|-------|
| INTAKE | triage FILE_CASE / order PI | PRELIMINARY_INQUIRY or CHARGE | competent DA resolved (DI-13); template pinned; DA ≠ complainant (DI-2) |
| PRELIMINARY_INQUIRY | PI recommends proceed | CHARGE | recommendation ∈ {PROCEED_MAJOR, PROCEED_MINOR} |
| PRELIMINARY_INQUIRY | PI recommends drop | CLOSED (DROPPED) | DA approval |
| CHARGE | charge-sheet **validly served** (DI-15) + **signed** (DI-28) | DEFENCE | legal_service valid; signature present |
| DEFENCE | defence submitted / window lapse | INQUIRY_SETUP (major) or ORDER (minor admit) or **DISPENSED→ORDER** | path rule / approved dispensation (DI-23) |
| INQUIRY_SETUP | IO/PO appointed or ICC constituted | INQUIRY | distinct actors (DI-2); ICC composition (AI-16) |
| INQUIRY | inspection afforded → report submitted | INQUIRY_REPORT | DI-24; all findings (DI-25) |
| INQUIRY | criminal parallel | INQUIRY (STAYED) | stay + SLA pause (DI-18) |
| INQUIRY_REPORT | served + DA reviews | DA_CONSIDERATION | report served (DI-15) |
| DA_CONSIDERATION | mandatory consultation outstanding | CONSULTATION | template-required consultations (DI-14) |
| DA_CONSIDERATION / CONSULTATION | disagreement / accept | SHOW_CAUSE or ORDER | natural-justice + consultations closed |
| SHOW_CAUSE | representation / lapse / personal hearing | ORDER | major track; DI-29 |
| ORDER | order finalised | SR_POSTING | DI-3, DI-4, DI-13, DI-14, DI-20, DI-22, DI-28 satisfied |
| SR_POSTING | propagation done (idempotent) | CLOSED | SR appended (DI-10/DI-19) |
| CLOSED | appeal filed | APPEAL | within limitation/condoned (DI-5) |
| APPEAL | decision | CLOSED (resolved) | authority ≠ DA + competent (DI-13) |
| (any active) | charged officer dies | **ABATED** | death proof (DI-26) |

**Parallel track (not a stage):** `is_under_suspension` may be true across INTAKE…ORDER concurrently; see §12.7.

### 12.2 Charge-sheet state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| DRAFT | issue (sign) | ISSUED | ≥1 article, PDF rendered, **DSC/eSign** (DI-28) |
| ISSUED | serve | SERVED | **valid legal service** (DI-15) |
| SERVED | defence submitted | RESPONDED | within/after window |
| DRAFT/ISSUED | withdraw | WITHDRAWN | DA + reason |

### 12.3 Inquiry state table (+ STAYED) **(v2)**

| State | Event | Next | Guard |
|-------|-------|------|-------|
| NOT_STARTED | inspection afforded + first hearing | IN_PROGRESS | IO/ICC appointed; DI-24 |
| IN_PROGRESS | no-show threshold + notice | EX_PARTE | proof of notice |
| IN_PROGRESS | criminal parallel active | STAYED | stay reason + SLA pause (DI-18) |
| STAYED | criminal disposed / prejudice gone | IN_PROGRESS | resume (recompute SLA) |
| IN_PROGRESS / EX_PARTE | report submitted (signed) | CONCLUDED | all findings/respondents (DI-25); DI-28 |
| CONCLUDED | DA remit | DE_NOVO | DA reasons (SLA pause REMIT) |

### 12.4 Order state table (+ competence/consultation/signing) **(v2)**

| State | Event | Next | Guard |
|-------|-------|------|-------|
| DRAFT | sign | DRAFT (signed) | DSC/eSign (DI-28) |
| DRAFT (signed) | finalise | FINALISED | DI-3/4/13/14/20/22, speaking order, MFA |
| FINALISED | serve | SERVED | valid legal service (DI-15) |
| SERVED | appeal set-aside | SET_ASIDE | appeal decision |
| SERVED | appeal modify | MODIFIED | revised order created |
| FINALISED/SERVED | court/appellate stay | STAYED | stay order recorded (SLA pause) |
| (any) | charged officer dies | (order_type ABATED) | DI-26 |

### 12.5 Appeal state table

| State | Event | Next | Guard |
|-------|-------|------|-------|
| FILED | admit | ADMITTED | within limitation or condoned (DI-5); condonation ⇒ SLA pause |
| FILED | reject (time-barred) | REJECTED | no condonation |
| ADMITTED | review | UNDER_REVIEW | authority ≠ DA + competent (DI-13) |
| UNDER_REVIEW | decide | DECIDED | reasoning recorded; enhancement ⇒ fresh show-cause |

### 12.6 Suspension state table (parallel track) **(v2)**

| State | Event | Next | Guard |
|-------|-------|------|-------|
| ACTIVE | NEC received | ACTIVE (paying) | subsistence event emitted only post-NEC (DI-16) |
| ACTIVE | charge-memo not served in 90 days | ACTIVE (deemed_review) | `deemed_review_flag=true` + escalation (DI-16) |
| ACTIVE | extend | EXTENDED | documented extension |
| ACTIVE | revoke | REVOKED | reason + events emitted |
| ACTIVE | deemed revoke (detention quashed) | DEEMED_REVOKED | proof |

### 12.7 Suspension parallel-status model **(v2)**

Suspension is an **orthogonal status flag** (`disciplinary_cases.is_under_suspension` + `suspension_status`), **not** a node in the linear `case_stage` sequence. The charge/inquiry/order track and the suspension track advance independently; revocation/exoneration clears the flag. This corrects the v1 ontological conflation (Risk R9).

### 12.8 SLA pause/resume state table **(v2)**

| State | Event | Next | Guard |
|-------|-------|------|-------|
| RUNNING | pause (STAY/REMIT/CONDONATION/CONSULTATION/CRIMINAL_STAY) | PAUSED | valid reason; open pause row |
| PAUSED | resume | RUNNING | `resumed_at` set; targets recomputed (DI-18) |
| PAUSED | (evaluator tick) | PAUSED | no breach raised while paused |

### 12.9 Consultation state table **(v2)**

| State | Event | Next | Guard |
|-------|-------|------|-------|
| REQUIRED | request | REQUESTED | derived mandatory from template |
| REQUESTED | advice received | RECEIVED | advice document |
| RECEIVED | close | CLOSED | DA closes; finalise unblocked |
| REQUIRED/REQUESTED | waive | WAIVED | recorded reasons + competent authority |

---

## 13. Notifications

| Event | Recipients | Channel | Template essence |
|-------|-----------|---------|------------------|
| Complaint filed (post-triage FILE_CASE) | DA, Vigilance | in-app, email | Case {case_no} opened |
| PI ordered / due / breached | PI officer, DA | in-app, email | PI {pi_id} status |
| Suspension order / **NEC pending** / subsistence review due | Employee, Payroll, DA | in-app, email | Suspension effective {date}; NEC required |
| **Deemed-review triggered (90-day lapse)** | DA, Admin, escalation auth | in-app, email | Charge-memo not served; review suspension |
| Charge-sheet **validly served** | Charged officer | in-app, email | Reply by {defence_due_date} (informational; not legal service) |
| Defence window closing (T-3/T-1) | Charged officer | in-app, email, SMS | Submit defence reminder |
| **Document/witness list supplied; inspection afforded** | Charged officer | in-app, email | Inspect by {date} |
| IO/PO appointed / **ICC constituted** | IO, PO, charged officer | in-app, email | Appointment / ICC notice |
| Hearing scheduled / adjourned | IO, PO, charged officer, defence assistant | in-app, email | Hearing on {date} |
| Ex-parte declared / **inquiry stayed/resumed** | Charged officer, DA | in-app, email | Ex-parte / stay status |
| Inquiry report served | Charged officer | in-app, email | Represent by {date} |
| Disagreement memo served | Charged officer | in-app, email | Represent by {date} |
| **Consultation requested / received / closed** | DA, Liaison, Vigilance | in-app, email | {type} consultation {status} |
| Show-cause served / **personal hearing scheduled** | Charged officer | in-app, email | Respond by {date}; hearing {date} |
| Penalty/exoneration/**abatement** order served | Charged officer, Payroll/Pension/Seniority owners | in-app, email | Order {order_no} |
| **Competence/consultation block at finalise** | DA, Admin | in-app | Finalise blocked: {reason} |
| Appeal filed / decided | Charged officer, Appellate authority, DA | in-app, email | Appeal {status} |
| SLA at-risk / breach / **paused** | DA, Admin, escalation authority | in-app, email | Stage {stage} {sla_status} |
| **Sealed cover set/lifted** | DA, Vigilance, M06 | in-app | Promotion sealed cover {status} |
| Propagation failure / **idempotency replay** | DCP Admin | in-app, email | Effect to {module} failed/retried |
| **Audit chain verification failure** | Auditor, SysAdmin | in-app, email | Chain broken at seq {n} |

All notifications recorded in the shared `notifications` ledger; confidentiality rules (§3.3) applied. **Notifications are informational only and never constitute legal service (DI-15).**

---

## 14. Reporting & Analytics

| Report / KPI | Description | Consumers |
|--------------|-------------|-----------|
| Caseload & status mix | Open/closed by status (incl. ABATED), case_type, org_unit | DA, Admin, M14 |
| Ageing buckets | 0–30/31–90/91–180/180+ days per open case (pause-adjusted) | DA, Admin |
| Stage bottleneck analysis | Avg time per stage; SLA breach hotspots (excl. paused) | Admin, Auditor |
| Penalty mix | Distribution by penalty_type/class | DA, M14 |
| **Penalty proportionality outliers (v2)** | Orders flagged where penalty severity is unusual vs misconduct/precedent (AI-12) | DA, Auditor, M14 |
| Exoneration rate | Exonerated ÷ concluded | Auditor, M14 |
| Appeal overturn rate | Set-aside+modified ÷ appeals decided | Auditor, M14 |
| Average cycle time | Initiation → closure (pause-adjusted) | DA, M14 |
| Suspension register | Active suspensions, **NEC pending**, deemed-review, subsistence reviews overdue | Payroll, DA |
| **Competence/consultation block log (v2)** | Finalise attempts blocked by competence/consultation | Auditor, Admin |
| **Legal-service validity audit (v2)** | Artefacts served by non-statutory mode | Auditor |
| Vigilance clearance dashboard | Clearance status distribution; doubtful-integrity & **sealed-cover** lists | Vigilance, M06/M11 |
| SLA compliance | % stages within SLA (pause-aware) | Admin, Auditor |
| **Audit-integrity report (v2)** | Hash-chain verification status per case | Auditor, SysAdmin |

Reports respect confidentiality (aggregates only for non-privileged viewers; no complainant PII; POSH heightened). All export endpoints paginated/streamed and audited.

---

## 15. Migration & Launch

### 15.1 Data migration

| Step | Action |
|------|--------|
| M-1 | Inventory legacy disciplinary files; classify by stage |
| M-2 | Map legacy statuses → `case_status`/`case_stage`; **load reference data first: `procedure_templates` (CCS/POSH/corporate), `authority_competence` matrix, SLA matrix, conduct rules** |
| M-3 | Migrate open cases with pinned template + current stage + key artefacts (scanned to M13 with hashes **and signature metadata where available**); closed cases as historical |
| M-4 | Reconstruct hash-chained timeline where dates known (genesis hash for backfill); mark unknowns `N_A`; backfill `case_respondents` (1:1 default) |
| M-5 | Link suspensions/penalties to existing M10/M11/M06 effects without re-triggering (migration flag suppresses re-emit; idempotency keys seeded) |
| M-6 | Reconciliation report: counts by status, orphan checks, hash verification, **competence-matrix coverage check**, **template-resolution coverage check** |

### 15.2 Cutover & launch

- **Build order honours the Council "One Thing To Do First":** seed `authority_competence` + `procedure_templates` and prove the canonical failing-then-passing test (`DISMISSAL` by subordinate authority ⇒ `AUTHORITY_NOT_COMPETENT`) before any decision logic ships.
- Dual-run period: new intake on M09; legacy frozen read-only.
- Idempotency/migration flag prevents duplicate downstream effects during backfill.
- Pilot with one department (incl. one POSH case and one multi-respondent case); validate competence/consultation/service/signing guards and SR posting before org-wide rollout.
- Rollback plan: migration is additive; legacy retained until sign-off.

### 15.3 Launch readiness checklist

- `authority_competence` and `procedure_templates` seeded and approved; **canonical competence test green**.
- RBAC + field-level confidentiality verified; step-up MFA + **DSC/eSign** active.
- SLA matrix, consultation requirements, valid service modes loaded per template.
- Integration smoke tests with M05/M06/M10/M11/M12/M13 + DSC/eSign trust service green.
- Hash-chained audit verify endpoint validated; idempotency double-finalise/double-post tests pass.
- Accessibility (WCAG 2.1 AA), Rights & Deadlines surface, and confidentiality views validated.

---

## 16. Traceability / Dependency / Parallel-Agent Plan

### 16.1 Requirements ↔ entities ↔ APIs traceability matrix

| FR | Entities | Key APIs | Dependencies | State tables |
|----|----------|----------|--------------|--------------|
| FR-M09-001 | case_complaints, disciplinary_cases, case_respondents, procedure_templates | /complaints, /triage | M01, templates, competence, audit | §12.1 |
| FR-M09-002 | preliminary_inquiries, inquiry_exhibits | /preliminary-inquiries | M13, SLA | §12.1 |
| FR-M09-003 | suspensions | /suspensions, /non-employment-certificate | M01, M10, M12 | §12.6/12.7 |
| FR-M09-004 | charge_sheets, charge_articles, legal_service_records | /charge-sheets | M13, DSC/eSign, templates | §12.2 |
| FR-M09-005 | defence_statements | /defence, /my-rights | scheduler | §12.1 |
| FR-M09-006 | inquiry_appointments, inquiry_proceedings | /appointments, /icc | M01, templates | §12.3 |
| FR-M09-007 | inquiry_hearings, inquiry_witnesses, inquiry_exhibits, sla_pause_events | /hearings,/witnesses,/exhibits,/supply-list,/stay | M13, SLA | §12.3 |
| FR-M09-008 | inquiry_reports, case_respondents | /report | M13, DSC/eSign | §12.3 |
| FR-M09-009 | disagreement_memos, legal_service_records | /disagreement-memo | notifications | §12.1 |
| FR-M09-010 | show_cause_notices, personal_hearings | /show-cause | notifications | §12.1 |
| FR-M09-011 | penalty_orders, penalty_items, authority_competence, case_consultations | /orders,/sign,/finalise | M06/M10/M11/M12/M13, MFA, DSC/eSign | §12.4 |
| FR-M09-012 | appeals, personal_hearings, sla_pause_events | /appeals | M06/M10/M11/M12 | §12.5 |
| FR-M09-013 | service_register_events, idempotency_keys, penalty_orders | /post-to-sr | M12/M06/M10/M11 | §12.4 |
| FR-M09-014 | case_documents, inquiry_exhibits | /documents | M13 | — |
| FR-M09-015 | vigilance_records | /vigilance | M06/M11 | — |
| FR-M09-016 | case_timeline_events, sla_pause_events | /timeline,/analytics | scheduler, M14 | all |
| FR-M09-017 | procedure_templates, authority_competence | /admin/procedure-templates | — | §12.1 |
| FR-M09-018 | authority_competence, penalty_orders, case_respondents | /admin/authority-competence,/competence-check | M01 | §12.4 |
| FR-M09-019 | case_consultations, sla_pause_events | /consultations | templates, M13 | §12.9 |
| FR-M09-020 | inquiry_dispensations, inquiry_proceedings | /dispensation | templates | §12.1 |
| FR-M09-021 | legal_service_records, case_documents, penalty_orders | /legal-service,/sign,/verify | DSC/eSign, M13, templates | §12.2/12.4 |
| FR-M09-022 | case_respondents, inquiry_reports, penalty_orders | /respondents | FR-007/008/011 | §12.1 |
| FR-M09-023 | inquiry_appointments, inquiry_proceedings, procedure_templates | /icc,/conciliation | FR-006/007/008/011 | §12.3 |
| FR-M09-024 | sla_pause_events, case_timeline_events | /sla/pause,/sla/resume | FR-016 | §12.8 |
| FR-M09-025 | personal_hearings, show_cause_notices, appeals | /personal-hearings | FR-010/012 | — |
| FR-M09-026 | disciplinary_cases, case_respondents, vigilance_records | /jurisdiction-transfer,/sealed-cover,/retiree-proceeding | M05/M06/M11 | §12.1 |
| FR-M09-027 | case_timeline_events, audit_log | /audit/verify,/audit/chain | platform audit | — |
| FR-M09-028 | disciplinary_cases, case_respondents, penalty_orders, service_register_events | /abate | M01/M11/M12 | §12.1/12.4 |

### 16.2 Dependency / build order

1. **Foundation (Track A first — Council "One Thing"):** entities E1–E30; **`procedure_templates` + `authority_competence` reference data + competence guard test**; RBAC + field-level confidentiality; hash-chained audit/timeline ledgers; idempotency store.
2. **Intake chain:** FR-001 → FR-002 → FR-003.
3. **Charge & defence:** FR-021 (service/signing) → FR-004 → FR-005.
4. **Inquiry:** FR-006 (+FR-023 ICC) → FR-007 → FR-008 → FR-009; FR-022 multi-respondent; FR-020 dispensation; FR-024 SLA pause.
5. **Decision:** FR-019 (consultation) + FR-018 (competence) gate → FR-010 (+FR-025 hearing) → FR-011.
6. **Propagation:** FR-013 (idempotent; consumed by FR-011/FR-012).
7. **Remedies:** FR-012.
8. **Lifecycle/integrity:** FR-026 (jurisdiction/sealed-cover/retiree), FR-027 (audit verify), FR-028 (abatement).
9. **Cross-cutting:** FR-014 (vault), FR-015 (vigilance), FR-016 (SLA/analytics), FR-017 (template admin) — parallelisable once foundation exists.

### 16.3 Parallel-agent plan

| Track | Agent scope | Can start after |
|-------|-------------|-----------------|
| A | Data model + migrations (E1–E30) + **competence/template reference data + canonical competence test** | — |
| B | Intake + suspension (FR-001/002/003) | A |
| C | Charge/defence/inquiry (FR-004–009, FR-020, FR-022, FR-023) | A |
| D | Decision/appeal (FR-010/011/012) + **competence (018) + consultation (019)** gates | A, C |
| E | Propagation/outbox + **idempotency** (FR-013) | A, integration stubs |
| F | Vault + vigilance + **sealed cover** (FR-014/015/026) | A |
| G | SLA + **pause/resume** + analytics + **proportionality** (FR-016/024) | A |
| H | UI shell + screens + **Rights surface + fast lane** (§7) | A, contracts |
| I | **Legal service + DSC/eSign** (FR-021) | A |
| J | **Audit hash-chain + verify** (FR-027), **abatement** (FR-028), **template admin** (FR-017) | A |

### 16.4 Final reconciliation table (0 unresolved gaps)

| Area | Required | Provided | Gap |
|------|----------|----------|-----|
| FRs (target) | yes | **28** (FR-001…028) | 0 |
| Module entities with field tables | all | **30** (E1…E30) | 0 |
| Sample data (2–3 rows/entity) | all module entities | **30** | 0 |
| Enum catalog | complete (incl. v2 enums) | yes | 0 |
| Integrity rules | defined | **DI-1…DI-29** | 0 |
| LLD per FR | each FR | **28** | 0 |
| State tables | core + new lifecycles | **9** (§12.1–12.9) | 0 |
| Error-code catalog | module-specific | **30** codes | 0 |
| API JSON examples | representative | **6** | 0 |
| Notifications | lifecycle-wide | **20+** events | 0 |
| Reporting/analytics | KPIs (incl. proportionality, audit-integrity) | **13** | 0 |
| Migration/launch | plan (competence-first) | yes | 0 |
| Roles & permission matrix | complete (incl. ICC/Liaison) | yes | 0 |
| Downstream integration (M05/M06/M10/M11/M12/M13/M14 + DSC/eSign) | mapped | yes | 0 |
| Shared-foundation reuse (no redefinition) | required | honoured | 0 |
| **Council Adopted Improvements (24) incorporated** | all | **24/24** (see §1.6) | 0 |
| **Risk Register High/Critical mitigations (R1–R8, R16)** | all | concrete FRs/DI/controls | 0 |
| **Risk Register Medium/Low (R9–R15, R17–R20)** | all | concrete FRs/DI/controls | 0 |

**Result: 0 unresolved gaps.**

---

## 17. Glossary

| Term | Definition |
|------|------------|
| Article of Charge | A specific, numbered allegation the employee must answer |
| Statement of Imputation | The facts and circumstances supporting an article of charge |
| Charge-sheet (Memorandum of Charges) | Formal document framing the articles of charge |
| Disciplinary Authority (DA) | Authority competent to initiate proceedings and impose penalties (competence verified, DI-13) |
| Inquiry Officer (IO) | Impartial officer who conducts the departmental inquiry |
| Presenting Officer (PO) | Officer presenting the department's case before the IO |
| Internal Committee (ICC) | POSH committee (presiding officer, members, external member) replacing the IO route for harassment cases |
| Defence Assistant | Person assisting the charged officer in the inquiry |
| Daily Order Sheet | Dated minutes/record of each hearing |
| Ex-parte | Proceeding conducted in the absence of the charged officer after due notice |
| Disagreement Memo | DA's recorded reasons for differing from the IO's findings |
| Show-cause Notice | Notice giving the employee an opportunity to represent against a proposed penalty |
| Personal Hearing | An in-person hearing at show-cause/appeal, recorded with grant/denial reasons |
| Authority Competence | Whether an authority is empowered to impose a given penalty class/type (Article 311(1)) |
| Mandatory Consultation | UPSC/CVC/ICC/legal advice required before final order, per jurisdiction |
| Dispense-with-Inquiry | Lawful omission of inquiry under Article 311(2) provisos with recorded reasons |
| Legal Service | Statutorily valid delivery of an artefact (distinct from informational notification) |
| DSC / eSign | Digital Signature Certificate / electronic signature binding signatory + timestamp |
| Procedure Template | Configurable jurisdiction overlay (consultations, competence, timelines, service modes, limitation, dispensation) |
| Natural-Justice Kernel | The invariant, non-configurable fair-process rules enforced for every template |
| Non-Employment Certificate (NEC) | Certificate that a suspended employee is not otherwise employed; precondition for subsistence |
| Deemed Review | Auto-flag when a charge-memo is not served within the 90-day suspension-review window |
| Sealed Cover | Mechanism freezing promotion recommendations while proceedings are pending |
| Abatement | Termination of proceedings on the charged officer's death |
| SLA Pause/Resume | Lawful stopping/recomputation of the timeline clock during stays/remits/consultation/criminal stay |
| Idempotency Key | Token guaranteeing a propagating action produces exactly one effect |
| Hash-Chained Audit | Tamper-evident ledger where each row binds the prior row's hash |
| Minor / Major Penalty | Lesser vs severe penalties (see §5.5 classification) |
| Compulsory Retirement / Removal / Dismissal | Major penalties (require Art. 311(1) competence) |
| Subsistence Allowance | Reduced pay during suspension |
| Vigilance Clearance | Status indicating absence/presence of pending disciplinary/vigilance matters |
| Suo-motu | Action taken by an authority on its own motion |
| De novo Inquiry | A fresh inquiry ordered when the prior inquiry is defective |
| Limitation / Condonation | Statutory appeal window / acceptance of a late appeal for sufficient cause |
| Speaking Order / Proportionality | A reasoned order; reasoning that the penalty fits the misconduct |
| Rule 9 (Pension) | Bar/sanction regime for proceedings against retired employees (four-year event bar) |

---

## 18. Appendices

### Appendix A — SLA matrix (default CCS template, configurable; pause-aware)

| Stage | Default SLA | At-risk threshold | Pausable by |
|-------|-------------|-------------------|-------------|
| INTAKE/Triage | 15 days | 80% | — |
| Preliminary inquiry | 30 days | 80% | CRIMINAL_STAY |
| Charge-sheet framing | 30 days | 80% | — |
| Defence reply window | 15 days | — (statutory) | — |
| Inquiry conclusion | 180 days | 80% | STAY, CRIMINAL_STAY, REMIT |
| Inquiry report → DA decision | 30 days | 80% | — |
| Consultation (UPSC/CVC) | 60 days | 80% | CONSULTATION |
| Show-cause response | 15 days | — | — |
| Order issuance | 30 days | 80% | CONSULTATION |
| SR posting & propagation | 7 days | 80% | — |
| Appeal limitation | 45 days | — (statutory) | CONDONATION |

### Appendix B — Penalty → downstream effect map

| Penalty | M06 | M10 | M11 | M12 | Competence (Art. 311(1)) |
|---------|-----|-----|-----|-----|--------------------------|
| Censure / Warning | — | — | — | SR entry | Minor authority |
| Fine | — | recovery (capped) | — | SR entry | Minor authority |
| Withholding increment | progression | pay | — | SR entry | Per matrix |
| Withholding promotion | seniority/promotion | — | — | SR entry | Per matrix |
| Recovery | — | recovery (≤1/3, DCRG beyond retirement) | — | SR entry | Per matrix |
| Reduction in rank | seniority/designation | pay | — | SR entry | Appointing-level |
| Compulsory retirement | — | final pay | pension (reduced) | SR entry | **Not subordinate to appointing** |
| Removal | — | final settlement | pension rules | SR entry | **Not subordinate to appointing** |
| Dismissal | — | final settlement | disqualification | SR entry | **Not subordinate to appointing** |

### Appendix C — Confidentiality classification

| Artefact | Default visibility |
|----------|--------------------|
| Complaint (confidential source) | Vigilance, DA only |
| Preliminary inquiry report | DA, Vigilance, Admin (never charged officer) — **except material relied upon as evidence (must be disclosed, DI-9)** |
| Consultation advice (UPSC/CVC) | DA, Vigilance, Liaison, Auditor — disclosed if relied upon |
| Charge-sheet / inquiry report copy / show-cause / orders | Served → charged officer (via legal service) |
| Sealed exhibits | IO/ICC, PO, DA, Auditor; charged officer per admission/disclosure |
| Vigilance scoring / DA deliberation / sealed cover | DA, Vigilance only |
| POSH case material | Heightened confidentiality; ICC + DA only |

### Appendix D — Procedure-template seed examples

| Template | Consultations | Inquiry route | Valid service modes | Appeal limitation |
|----------|---------------|---------------|---------------------|-------------------|
| CCS_CCA_2026 | CVC (vigilance), UPSC (central major) | ORDINARY_IO | IN_PERSON, REGD_POST, SUBSTITUTED, PUBLICATION | 45 days |
| POSH_ICC | ICC report | ICC_POSH | IN_PERSON, REGD_POST | 90 days |
| CORP_INDIA | LEGAL (optional) | ORDINARY_IO | IN_PERSON, REGD_POST, EMAIL (permitted) | 30 days |

### Appendix E — Council Risk Register → v2 disposition

| Risk | Severity | Disposition in v2 |
|------|----------|-------------------|
| R1 Authority competence | Critical | FR-018 + DI-13 + `authority_competence` + `AUTHORITY_NOT_COMPETENT` |
| R2 Mandatory consultation | Critical | FR-019 + DI-14 + `case_consultations` + `CONSULTATION_PENDING` |
| R3 Dispense-with-inquiry | High | FR-020 + DI-23 + `inquiry_dispensations` |
| R4 Document/witness inspection | High | FR-007 + DI-24 + `INSPECTION_NOT_AFFORDED` |
| R5 Legal service vs notification | High | FR-021 + DI-15 + `legal_service_records` |
| R6 Subsistence NEC + 90-day review | High | FR-003 + DI-16 |
| R7 Common/joint proceedings | High | FR-022 + DI-25 + `case_respondents` |
| R8 Two-layer configurability | High | FR-017 + DI-17 + `procedure_templates` |
| R9 Suspension parallel status | Medium | §12.7 + parallel flags (SUSPENSION removed from stage) |
| R10 SLA pause/resume | Medium | FR-024 + DI-18 + `sla_pause_events` |
| R11 Idempotency lifecycle | Medium | FR-013 + DI-19 + `idempotency_keys` + §10.1 |
| R12 Proportionality | Medium | FR-011/016 + DI-20 |
| R13 Jurisdiction/sealed-cover/retiree | Medium | FR-026 + DI-27 |
| R14 Abatement | Low/Med | FR-028 + DI-26 |
| R15 Hash-chained audit | Medium | FR-027 + DI-21 |
| R16 POSH/ICC | High | FR-023 + ICC template |
| R17 DSC/eSign | Medium | FR-021 + DI-28 |
| R18 Inquiry STAYED | Medium | FR-007 + FR-024 (CRIMINAL_STAY) |
| R19 Rights-and-deadlines portal | Low | FR-005 + §7.3 |
| R20 Recovery caps | Medium | FR-011 + DI-22 |

### Appendix F — Assumptions & caveats

- Statutory windows (defence reply, limitation, subsistence review, consultation) are seeded as template defaults and **configurable**; the engine enforces a non-shortenable statutory floor and an invariant kernel (DI-17).
- The penalty taxonomy, authority hierarchy, and competence matrix are reference data resolved from org configuration (M01/org_units), `authority_competence`, and the conduct-rules master.
- DSC/eSign is provided by a platform trust service; M09 stores returned signature metadata and verifies on demand.
- Criminal-proceeding linkage is reference-only and may STAY an inquiry; integration with external court/police systems is out of scope.
- The two-layer model deliberately **caps** configurability at the named overlay items; no generic BPM/rules designer is built (anti-over-engineering, per Council §3.5).















