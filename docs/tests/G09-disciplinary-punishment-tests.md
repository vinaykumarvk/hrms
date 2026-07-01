# G09 — Disciplinary Cases and Punishment — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | G09 — Disciplinary Cases and Punishment Management (DCP) |
| Version under test | API 3.0.0 (OpenAPI `docs/contracts/openapi/G09.yaml`), BRD v3 (`docs/brd/v3/G09-disciplinary-cases-punishment.md`) |
| Scope | Full statutory due-process engine: complaint → preliminary inquiry → suspension (+subsistence) → charge-sheet → defence → inquiry (IO/PO/witnesses/evidence/daily-order-sheets) → inquiry report → disagreement memo → show-cause → penalty/exoneration → appeal. Plus natural-justice safeguards, SoD, statutory timelines & SLA pause/resume, minor vs major penalty, authority competence, dispense-with-inquiry, personal hearing, sealed cover, multi-respondent, POSH/ICC, retiree/abatement, hash-chained audit, and the E2E SR posting to `/sr/ingest` with downstream effects to G06/G10/G11. |
| Out of scope | Internal implementation of G12 SR ledger, G06/G10/G11 execution logic (asserted only at the G09 emission boundary / by reference), P01 workflow engine internals, P02/P05 platform internals (asserted via observable behaviour). |
| Traceability | Every TC declares `Traces-to` = FR-G09-NNN and/or the acceptance criterion / DI integrity rule (DI-1…DI-29) / state-machine transition / ERR-G09-* code / auth-matrix action it exercises. Section 3 gives the FR→TC matrix (0 gaps). |

### 1.1 Test environment & data assumptions

- **Multi-tenant.** All requests carry a bearer token bound to a tenant (`org`/department scope). Row-level scoping (P02) applies: cases, documents, and vault items are visible only within the actor's authorised scope; `403`/`404` never leak the existence of out-of-scope records (P02 scope-safety).
- **Platform API conventions (Foundation §4).** Bearer auth; `X-Correlation-Id` present on every response; cursor pagination (`limit` default 25 / max 100, `cursor` → `next_cursor`); `Idempotency-Key` header on state-changing POSTs (24h replay), **required** on the propagating actions SUSPENSION order, ORDER finalise, POST_TO_SR, and APPEAL decide; canonical error envelope `{ error: { code, message, correlation_id, field? } }`.
- **Wire-code mapping** (error-taxonomy §2): VALIDATION_FAILED=422, UNAUTHENTICATED=401, FORBIDDEN=403, NOT_FOUND=404, CONFLICT=409, PRECONDITION_FAILED=412, RATE_LIMITED=429, INTERNAL=500. Every ERR-G09-* asserted below resolves to exactly one of these.
- **Personas / roles** (auth-matrix G09): `disciplinary_authority` (DA — MFA), `inquiry_officer` (IO), `presenting_officer` (PO), `appellate_authority`, `vigilance_officer` (VO), `icc_presiding`, `icc_member`, `sr_custodian`, plus `employee` (charged officer) and a `defence_assistant`. SoD invariants (DI-2): for one case the persons holding DA, IO, PO and each witness are mutually distinct, and the DA must not be the complainant or a witness; a charged respondent can never be IO/PO/DA on their own case.
- **Confidentiality.** TIER-3 masking (P02): confidential-source/whistle-blower identity (`is_confidential_source`), vigilance scoring, PI reports and sealed-cover contents are hard-hidden except VO/DA per action gates. IO/PO cannot view vigilance scoring or sealed-cover. Relied-upon material must nonetheless be disclosed to the charged officer before a finding rests on it (DI-9).
- **Seed templates.** `tpl-ccs` (standard CCS template: subsistence floor/ceiling [25,75], `valid_service_modes_json` = {BY_HAND, REGISTERED_POST, AFFIXTURE}, EMAIL non-statutory, appeal limitation 45 days, mandatory consultation UPSC for MAJOR on Group-A), `tpl-posh` (HARASSMENT → ICC route, external member mandatory), and a mis-configured/ambiguous template `tpl-bad` for DI-17 negatives.
- **Seed actors/cases.** Group-A officer `emp-3001` (major track), Group-C officer `emp-3002` (minor track), retiree `emp-3009`, deceased-during-proceeding `emp-3010`, POSH respondent `emp-3004`, joint respondents `emp-3005/emp-3006`. DA `emp-9001` (competent for major), DA `emp-9002` (competent minor only), appellate `emp-9500`.
- **Assertion oracle.** Negatives assert the exact `error.code` **and** HTTP status. Positives assert resulting entity `status`/`stage`, side effects (SR event id, downstream effect rows, SLA recompute), and audit-chain continuity.

---

## 2. Test cases

### FR-G09-001 — Complaint Registration & Triage

| Field | Value |
|---|---|
| **TC-G09-001** | Traces-to: FR-001 AC1, DI-2. Type: Functional. |
| Title | Register a complaint and triage FILE_CASE opens a case with pinned template + resolved competent DA |
| Preconditions | VO authenticated; subject `emp-3001` has no open case. |
| Test data | `POST /dcp/complaints` body: subjectId=emp-3001, misconduct_category=FINANCIAL_IRREGULARITY, source=DEPARTMENTAL; then `POST /dcp/complaints/{id}/triage` decision=FILE_CASE, procedure_template_id=tpl-ccs. |
| Steps | 1. Register complaint. 2. Triage FILE_CASE. |
| Expected | 201 complaint; 200 triage → case created, `case_status=INTAKE`→`PRELIMINARY_INQUIRY` per transition, `procedure_template_id=tpl-ccs` pinned, competent DA resolved. `X-Correlation-Id` present. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-002** | Traces-to: FR-001 edge, ERR-G09-DUPLICATE-COMPLAINT. Type: Negative. |
| Title | Duplicate open complaint/case for same subject is rejected |
| Preconditions | An open case already exists for `emp-3001`. |
| Test data | `POST /dcp/complaints` subjectId=emp-3001, same allegation. |
| Steps | 1. Register second complaint for the same subject. |
| Expected | 409 `ERR-G09-DUPLICATE-COMPLAINT`. List `GET /dcp/complaints?subjectId=emp-3001` dedups against the open case. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-003** | Traces-to: FR-001 (v2 edge), DI-2, ERR-G09-DA-BIAS-CONFLICT. Type: Natural-Justice. |
| Title | Triage resolving DA to the complainant is blocked (nemo judex in causa sua) |
| Preconditions | Complaint whose complainant = the person who would resolve as competent DA. |
| Test data | Triage FILE_CASE where resolved DA == complainant employee id. |
| Steps | 1. Triage. |
| Expected | 409 `ERR-G09-DA-BIAS-CONFLICT`; no case opened. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-004** | Traces-to: FR-001, ERR-G09-DA-NOT-RESOLVED. Type: Negative. |
| Title | Triage where no competent DA can be resolved is rejected |
| Preconditions | Subject cadre has no configured competent authority. |
| Test data | Triage FILE_CASE, cadre with empty `authority_competence`. |
| Steps | 1. Triage. |
| Expected | 422 `ERR-G09-DA-NOT-RESOLVED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-005** | Traces-to: FR-001 edge, ERR-G09-PROCEDURE-TEMPLATE-INVALID, DI-17. Type: Negative. |
| Title | Triage with ambiguous/no procedure template is rejected |
| Preconditions | `tpl-bad` (ambiguous overlay) selectable. |
| Test data | Triage with no resolvable template / `tpl-bad`. |
| Steps | 1. Triage. |
| Expected | 422 `ERR-G09-PROCEDURE-TEMPLATE-INVALID`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-006** | Traces-to: FR-001 edge. Type: Functional. |
| Title | HARASSMENT category routes to ICC (POSH) template on triage |
| Preconditions | VO authenticated; subject `emp-3004`. |
| Test data | Complaint misconduct_category=HARASSMENT; triage FILE_CASE. |
| Steps | 1. Register. 2. Triage. |
| Expected | Case pinned to `tpl-posh`; case flagged POSH/ICC route (feeds FR-023). |
| Priority | P2 |

### FR-G09-002 — Preliminary (Fact-Finding) Inquiry

| Field | Value |
|---|---|
| **TC-G09-007** | Traces-to: FR-002 AC, state `PRELIMINARY_INQUIRY`. Type: Functional. |
| Title | Order PI, update progress, submit report with PROCEED_MAJOR recommendation advances to CHARGE |
| Preconditions | Case in `PRELIMINARY_INQUIRY`. |
| Test data | `POST /dcp/cases/{caseId}/preliminary-inquiries`; `PATCH /dcp/preliminary-inquiries/{id}`; `POST .../submit` recommendation=PROCEED_MAJOR. |
| Steps | 1. Order PI. 2. Update. 3. Submit. |
| Expected | 201/200 chain; on submit, case eligible to move `PRELIMINARY_INQUIRY→CHARGE` (guard recommendation ∈ {PROCEED_MAJOR,PROCEED_MINOR}). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-008** | Traces-to: FR-002, transition PI→CLOSED(DROPPED). Type: State-Transition. |
| Title | PI recommends DROP and DA closes the case as DROPPED |
| Preconditions | PI submitted with recommendation=DROP. |
| Test data | Submit recommendation=DROP; DA approves closure. |
| Steps | 1. Submit DROP. 2. Close. |
| Expected | Case `CLOSED (DROPPED)`; no charge-sheet allowed thereafter. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-009** | Traces-to: FR-002 + DI-9 (AI-24). Type: Confidentiality. |
| Title | PI report is confidential (VO/DA only) but adverse PI material relied-upon must be disclosable |
| Preconditions | PI report exists with confidential source. |
| Test data | `GET` PI/report as IO vs as DA/VO; flag a PI exhibit `relied_upon=true`. |
| Steps | 1. IO reads PI report. 2. DA/VO read. 3. Mark relied_upon PI material without `disclosed_to_charged`. |
| Expected | IO gets masked/`403 ERR-G09-CONFIDENTIALITY-DENIED` on source identity; VO/DA see it; a finding resting on relied-upon-but-undisclosed PI material later triggers `ERR-G09-NATURAL-JUSTICE-VIOLATION` (see TC-G09-041). |
| Priority | P1 |

### FR-G09-003 — Suspension, Subsistence & Review

| Field | Value |
|---|---|
| **TC-G09-010** | Traces-to: FR-003 AC, DI-8, propagating action. Type: Functional/E2E-Flow. |
| Title | Order suspension within subsistence bounds queues SR SUSPENSION event and sets is_under_suspension |
| Preconditions | Case open; DA authenticated; `Idempotency-Key` supplied. |
| Test data | `POST /dcp/cases/{caseId}/suspensions` subsistence_rate_pct=50 (∈[25,75]). |
| Steps | 1. Order suspension. |
| Expected | 201 suspension `status=ACTIVE`; case `is_under_suspension=true` (parallel track, not a stage node); one SR `SUSPENSION` event queued to `/sr/ingest`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-011** | Traces-to: FR-003, DI-8, ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS. Type: Boundary/Negative. |
| Title | Subsistence rate outside template floor/ceiling is rejected |
| Preconditions | Template floor/ceiling [25,75]. |
| Test data | (a) subsistence_rate_pct=24; (b) =76; (c) boundary =25 and =75 accepted. |
| Steps | 1. Order suspension at 24. 2. At 76. 3. At 25. 4. At 75. |
| Expected | (a)(b) 422 `ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS`; (c)(d) 201 accepted (inclusive bounds). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-012** | Traces-to: FR-003 AC, DI-16, ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED. Type: Negative/Data-Integrity. |
| Title | Subsistence payment to G10 blocked until Non-Employment Certificate recorded |
| Preconditions | Active suspension, NEC not yet furnished. |
| Test data | Attempt subsistence disbursal event before NEC; then `POST /dcp/suspensions/{id}/non-employment-certificate`. |
| Steps | 1. Trigger subsistence payment pre-NEC. 2. Record NEC. 3. Retry. |
| Expected | 1 → 422 `ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED`; after NEC, subsistence payment to G10 unblocked (DI-16). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-013** | Traces-to: FR-003 (v2 edge), DI-16, suspension SM deemed_review. Type: State-Transition. |
| Title | Charge-memo not served within 90 days sets deemed_review_flag and escalates |
| Preconditions | Suspension ACTIVE; `charge_memo_due_date` = now-1 day, no valid service. |
| Test data | Run SLA/deemed-review evaluation. |
| Steps | 1. Advance clock past 90-day window. |
| Expected | `deemed_review_flag=true`, escalation raised; suspension remains ACTIVE (self-loop side-effect). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-014** | Traces-to: FR-003 AC, revise/revoke. Type: Functional/E2E-Flow. |
| Title | Revise subsistence within bounds, then revoke suspension emits SUSPENSION_REVOKED |
| Preconditions | Active suspension. |
| Test data | `POST .../revise-subsistence` to 60; `POST .../revoke` reason recorded. |
| Steps | 1. Revise. 2. Revoke. |
| Expected | Rate=60; revoke → `status=REVOKED`, clears is_under_suspension, `SUSPENSION_REVOKED` SR event queued; G10+G01 events emitted. |
| Priority | P2 |

### FR-G09-004 — Charge-Sheet / Articles of Charge

| Field | Value |
|---|---|
| **TC-G09-015** | Traces-to: FR-004 AC, charge_sheet SM DRAFT→ISSUED, DI-28. Type: Functional. |
| Title | Draft charge-sheet with ≥1 article, issue with DSC/eSign renders PDF |
| Preconditions | Case at CHARGE. |
| Test data | `POST /dcp/cases/{caseId}/charge-sheets` with 2 articles of charge; `POST /dcp/charge-sheets/{id}/issue` signature_type=DSC. |
| Steps | 1. Draft. 2. Issue. |
| Expected | 201 DRAFT; issue → `ISSUED`, PDF rendered, `signed_at`/`signatory_id` bound (DI-28). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-016** | Traces-to: FR-004, DI-28, ERR-G09-SIGNATURE-REQUIRED. Type: Negative. |
| Title | Issuing a charge-sheet without DSC/eSign is rejected |
| Preconditions | Draft charge-sheet. |
| Test data | Issue with no `signature_type`. |
| Steps | 1. Issue unsigned. |
| Expected | 422 `ERR-G09-SIGNATURE-REQUIRED`; remains DRAFT. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-017** | Traces-to: FR-004, charge_sheet SM ISSUED→SERVED, DI-15. Type: State-Transition. |
| Title | Serve charge-sheet by a statutorily-valid mode moves case CHARGE→DEFENCE |
| Preconditions | Charge-sheet ISSUED. |
| Test data | `POST /dcp/charge-sheets/{id}/serve` service_mode=BY_HAND. |
| Steps | 1. Serve. |
| Expected | 200 `SERVED`; case advances `CHARGE→DEFENCE`; defence window computed from valid service (DI-15). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-018** | Traces-to: FR-004/FR-021, DI-15, ERR-G09-INVALID-SERVICE-MODE. Type: Negative. |
| Title | Serving via a non-statutory mode (EMAIL) is rejected |
| Preconditions | Charge-sheet ISSUED; template EMAIL non-statutory. |
| Test data | Serve service_mode=EMAIL. |
| Steps | 1. Serve by EMAIL. |
| Expected | 409 `ERR-G09-INVALID-SERVICE-MODE`; no valid service recorded; defence clock not started. |
| Priority | P1 |

### FR-G09-005 — Defence Statement + Rights Surface

| Field | Value |
|---|---|
| **TC-G09-019** | Traces-to: FR-005 AC. Type: Functional. |
| Title | Submit written statement of defence within window |
| Preconditions | Case at DEFENCE; within window. |
| Test data | `POST /dcp/charge-sheets/{id}/defence` statement + annexures. |
| Steps | 1. Submit defence. |
| Expected | 201 defence; charge-sheet `SERVED→RESPONDED`; case eligible for INQUIRY_SETUP (major) or ORDER (minor admit). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-020** | Traces-to: FR-005, ERR-G09-DEFENCE-WINDOW-CLOSED. Type: Negative/Boundary. |
| Title | Defence after due date without a granted extension is rejected |
| Preconditions | Defence window elapsed; no extension. |
| Test data | Submit defence after due date. |
| Steps | 1. Submit late. |
| Expected | 409 `ERR-G09-DEFENCE-WINDOW-CLOSED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-021** | Traces-to: FR-005, extension. Type: Functional/Boundary. |
| Title | Extension request extends the window; defence then accepted within extended window |
| Preconditions | Window near expiry. |
| Test data | `POST /dcp/charge-sheets/{id}/extension-request`; submit defence within new window. |
| Steps | 1. Request extension. 2. Submit within extended window. |
| Expected | 200 extension recorded; 201 defence accepted (no DEFENCE-WINDOW-CLOSED). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-022** | Traces-to: FR-005 (v2, AI-21), FR-025. Type: Functional. |
| Title | Rights surface exposes live deadlines; requesting a personal hearing sets flag |
| Preconditions | Charged officer authenticated (self scope). |
| Test data | `GET /dcp/cases/{id}/my-rights`; set requests_personal_hearing=true. |
| Steps | 1. Read rights surface. |
| Expected | 200 rights + limitation/deadline countdown; `requests_personal_hearing=true` feeds FR-025. |
| Priority | P2 |

### FR-G09-006 — Appointment of IO / PO (or ICC)

| Field | Value |
|---|---|
| **TC-G09-023** | Traces-to: FR-006 AC, DI-2, transition INQUIRY_SETUP→INQUIRY. Type: Functional/Natural-Justice. |
| Title | Appoint distinct IO, PO and Defence Assistant |
| Preconditions | Case at INQUIRY_SETUP; IO≠PO≠DA≠witnesses. |
| Test data | `POST /dcp/inquiries/{inquiryId}/appointments` IO=emp-7001, PO=emp-7002, DA_assist=emp-7003. |
| Steps | 1. Appoint. |
| Expected | 201 appointment; actors mutually distinct (DI-2); case → INQUIRY. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-024** | Traces-to: FR-006, DI-2, ERR-G09-ACTOR-CONFLICT. Type: Negative/Natural-Justice. |
| Title | Appointing IO who is also the PO/DA/witness or the charged respondent is rejected |
| Preconditions | Case with DA=emp-9001. |
| Test data | (a) IO=PO; (b) IO=DA; (c) IO=charged emp-3001; (d) PO=a listed witness. |
| Steps | 1. Attempt each conflicting appointment. |
| Expected | Each → 409 `ERR-G09-ACTOR-CONFLICT`; no appointment persisted. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-025** | Traces-to: FR-006, recuse/object. Type: Functional. |
| Title | Objection then recusal replaces an appointed officer |
| Preconditions | IO appointed. |
| Test data | `POST /dcp/appointments/{id}/object` reason; `POST /dcp/appointments/{id}/recuse` reason + replacement. |
| Steps | 1. Object. 2. Recuse/replace. |
| Expected | 200 objection recorded; 200 recusal → replacement appointed, still DI-2 distinct. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-026** | Traces-to: FR-006/FR-023, ERR-G09-ICC-PROCEDURE-REQUIRED. Type: Negative. |
| Title | POSH (HARASSMENT) case cannot appoint a plain IO — ICC composition required |
| Preconditions | Case pinned to `tpl-posh`. |
| Test data | Appoint a single IO (no ICC constitution / no external member). |
| Steps | 1. Attempt IO appointment. |
| Expected | 409 `ERR-G09-ICC-PROCEDURE-REQUIRED`. |
| Priority | P1 |

### FR-G09-007 — Conduct of Departmental Inquiry

| Field | Value |
|---|---|
| **TC-G09-027** | Traces-to: FR-007 AC, DI-24, inquiry SM NOT_STARTED→IN_PROGRESS. Type: Functional. |
| Title | Record supply list + inspection afforded, then add hearing / daily order sheet |
| Preconditions | IO appointed. |
| Test data | `POST /dcp/inquiries/{id}/supply-list` (list_supplied_date, inspection_afforded_date); `POST .../hearings` daily order sheet. |
| Steps | 1. Record supply/inspection. 2. Add hearing. |
| Expected | 200 supply recorded (gate opened); 201 hearing; inquiry → IN_PROGRESS. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-028** | Traces-to: FR-007, DI-24, ERR-G09-INSPECTION-NOT-AFFORDED. Type: Negative/Natural-Justice. |
| Title | Examining a witness / admitting an exhibit before inspection afforded is blocked |
| Preconditions | Inquiry with `inspection_afforded_date` NULL. |
| Test data | `POST /dcp/inquiries/{id}/witnesses`; `POST .../exhibits`. |
| Steps | 1. Add witness pre-inspection. 2. Admit exhibit pre-inspection. |
| Expected | Each → 409 `ERR-G09-INSPECTION-NOT-AFFORDED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-029** | Traces-to: FR-007, DI-7, ERR-G09-EVIDENCE-TAMPERED. Type: Data-Integrity. |
| Title | Admitting/reading an exhibit whose content_hash mismatches is blocked |
| Preconditions | Inspection afforded; exhibit uploaded with content_hash H1; stored bytes altered. |
| Test data | Admit/read exhibit whose recomputed hash ≠ stored. |
| Steps | 1. Admit tampered exhibit. |
| Expected | 409 `ERR-G09-EVIDENCE-TAMPERED`. Clean exhibit admits with hash verified. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-030** | Traces-to: FR-007, DI-9, ERR-G09-NATURAL-JUSTICE-VIOLATION. Type: Natural-Justice. |
| Title | Admitting a relied-upon exhibit not disclosed to the charged officer is flagged/blocked at finding time |
| Preconditions | Inspection afforded. |
| Test data | Admit exhibit `relied_upon=true`, `disclosed_to_charged=false`; later a report finding rests on it. |
| Steps | 1. Admit undisclosed relied-upon exhibit. 2. Submit report finding resting on it. |
| Expected | Report/penalty resting on relied-not-disclosed material → 409 `ERR-G09-NATURAL-JUSTICE-VIOLATION` (DI-9). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-031** | Traces-to: FR-007, inquiry SM IN_PROGRESS→EX_PARTE. Type: State-Transition. |
| Title | Declare inquiry ex-parte after no-show threshold with proof of notice |
| Preconditions | Charged officer absent past threshold; notices served. |
| Test data | `POST /dcp/inquiries/{id}/declare-ex-parte` with proof-of-notice refs. |
| Steps | 1. Declare ex-parte. |
| Expected | 200 → inquiry EX_PARTE (proof of notice recorded). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-032** | Traces-to: FR-007/FR-024, DI-18, inquiry SM IN_PROGRESS→STAYED. Type: State-Transition. |
| Title | Criminal-parallel stay pauses SLA; resume recomputes targets |
| Preconditions | Inquiry IN_PROGRESS. |
| Test data | `POST /dcp/inquiries/{id}/stay` action=STAY reason=CRIMINAL_STAY; later action=RESUME. |
| Steps | 1. Stay. 2. Resume. |
| Expected | Stay → inquiry STAYED, open `sla_pause_events`, `sla_status=PAUSED`, no breach; resume → back to IN_PROGRESS, `sla_target_at`/`expected_closure_date` recomputed by adding paused duration (DI-18). |
| Priority | P1 |

### FR-G09-008 — Inquiry Report & Findings

| Field | Value |
|---|---|
| **TC-G09-033** | Traces-to: FR-008 AC, DI-25/DI-28, inquiry SM →CONCLUDED. Type: Functional. |
| Title | Submit signed inquiry report with every article/respondent finding present |
| Preconditions | Inquiry IN_PROGRESS/EX_PARTE; inspection afforded. |
| Test data | `POST /dcp/inquiries/{id}/report` with findings for all articles × respondents, DSC-signed. |
| Steps | 1. Submit report. |
| Expected | 201 report; inquiry → CONCLUDED; case → INQUIRY_REPORT. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-034** | Traces-to: FR-008, DI-25, ERR-G09-INCOMPLETE-FINDINGS. Type: Negative/Data-Integrity. |
| Title | Report missing an article/respondent finding is rejected |
| Preconditions | 2 articles, 2 respondents; report omits one finding. |
| Test data | Submit report with a missing finding. |
| Steps | 1. Submit incomplete report. |
| Expected | 422 `ERR-G09-INCOMPLETE-FINDINGS`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-035** | Traces-to: FR-008, DI-28, ERR-G09-SIGNATURE-REQUIRED. Type: Negative. |
| Title | Unsigned inquiry report cannot conclude |
| Preconditions | Report drafted without signature. |
| Test data | Submit report with no `signature_type`. |
| Steps | 1. Submit unsigned. |
| Expected | 422 `ERR-G09-SIGNATURE-REQUIRED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-036** | Traces-to: FR-008 AC, service. Type: Functional. |
| Title | Serve inquiry report copy for representation |
| Preconditions | Report CONCLUDED. |
| Test data | `POST /dcp/inquiry-reports/{id}/serve` mode=BY_HAND. |
| Steps | 1. Serve report. |
| Expected | 200 valid service recorded; case → DA_CONSIDERATION. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-037** | Traces-to: FR-008, inquiry SM CONCLUDED→DE_NOVO, DI-18. Type: State-Transition. |
| Title | DA remits report for de-novo inquiry; SLA pause REMIT applied |
| Preconditions | Report CONCLUDED. |
| Test data | `POST /dcp/inquiry-reports/{id}/remit` reasons. |
| Steps | 1. Remit. |
| Expected | 200 remitted; inquiry → DE_NOVO; `sla_pause_events(REMIT)` opened. |
| Priority | P2 |

### FR-G09-009 — Disagreement Memo

| Field | Value |
|---|---|
| **TC-G09-038** | Traces-to: FR-009 AC. Type: Functional. |
| Title | DA issues disagreement memo, serves it, records officer representation |
| Preconditions | Report served; DA differs from IO finding. |
| Test data | `POST /dcp/inquiry-reports/{id}/disagreement-memo`; `.../serve`; `.../representation`. |
| Steps | 1. Issue memo. 2. Serve. 3. Record representation. |
| Expected | 201 memo; 200 served; 200 representation recorded; case may proceed SHOW_CAUSE/ORDER. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-039** | Traces-to: FR-009 BR, DI-9/natural justice. Type: Natural-Justice. |
| Title | Penalty on a not-proved article without a served disagreement memo is blocked |
| Preconditions | Article found NOT_PROVED by IO; DA wants to penalise; no memo served. |
| Test data | Attempt to finalise penalty on the not-proved article without memo. |
| Steps | 1. Finalise penalty on not-proved article, no memo. |
| Expected | 409 `ERR-G09-NATURAL-JUSTICE-VIOLATION`. |
| Priority | P1 |

### FR-G09-010 — Show-Cause Notice

| Field | Value |
|---|---|
| **TC-G09-040** | Traces-to: FR-010 AC, DI-15, transition SHOW_CAUSE→ORDER. Type: Functional. |
| Title | Issue show-cause with proposed penalty set, serve, record representation |
| Preconditions | Major track; case at DA_CONSIDERATION/CONSULTATION cleared. |
| Test data | `POST /dcp/cases/{caseId}/show-cause` proposed={WITHHOLD_INCREMENT}; `.../serve`; `.../representation`. |
| Steps | 1. Issue. 2. Serve. 3. Representation. |
| Expected | 201/200 chain; proposed penalty set stored (constrains final order per DI-4). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-041** | Traces-to: FR-010/FR-025, DI-29. Type: Functional. |
| Title | Personal hearing on show-cause recorded (grant); order references hearing |
| Preconditions | Officer requested personal hearing at SHOW_CAUSE. |
| Test data | `POST /dcp/show-cause/{id}/personal-hearing` granted=true, minutes. |
| Steps | 1. Record hearing. |
| Expected | 201 hearing; subsequent order references hearing id (DI-29). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-042** | Traces-to: FR-010/FR-025, DI-29. Type: Negative/Natural-Justice. |
| Title | Denying a requested personal hearing without denial_reason is rejected |
| Preconditions | Officer requested hearing. |
| Test data | Record personal-hearing granted=false, no `denial_reason`. |
| Steps | 1. Record denial without reason. |
| Expected | 422 (validation on `denial_reason` required, DI-29). |
| Priority | P2 |

### FR-G09-011 — Penalty Order & Exoneration

| Field | Value |
|---|---|
| **TC-G09-043** | Traces-to: FR-011 AC, penalty_order SM DRAFT→DRAFT_SIGNED→FINALISED, DI-3/4/13/14/20/22/28. Type: E2E-Flow. |
| Title | Full happy path: draft → sign → finalise a MAJOR penalty passing all legality gates |
| Preconditions | Charge served, defence present, inquiry concluded, show-cause responded, consultation CLOSED, competent DA, proportionality reasoning present, `Idempotency-Key` supplied. |
| Test data | `POST /dcp/cases/{caseId}/orders` items={REDUCTION}; `POST /dcp/orders/{id}/sign` DSC; `POST /dcp/orders/{id}/finalise`. |
| Steps | 1. Draft. 2. Sign. 3. Finalise. |
| Expected | 201 DRAFT; 200 DRAFT_SIGNED; 200 FINALISED (immutable speaking order); case → SR_POSTING. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-044** | Traces-to: FR-011, DI-3, ERR-G09-DUE-PROCESS-INCOMPLETE. Type: Negative/State-Transition. |
| Title | Cannot finalise a MAJOR penalty before required prior stages / no lawful dispensation |
| Preconditions | No concluded inquiry and no approved dispensation. |
| Test data | Finalise MAJOR penalty. |
| Steps | 1. Finalise prematurely. |
| Expected | 409 `ERR-G09-DUE-PROCESS-INCOMPLETE`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-045** | Traces-to: FR-011, DI-3, ERR-G09-INVALID-STATE-TRANSITION. Type: State-Transition. |
| Title | Cannot penalise before show-cause is issued/responded (major track) |
| Preconditions | Case at DA_CONSIDERATION; no show-cause on major track. |
| Test data | Draft+finalise penalty skipping SHOW_CAUSE. |
| Steps | 1. Finalise without show-cause. |
| Expected | 409 — order finalise blocked; `ERR-G09-INVALID-STATE-TRANSITION` (or `ERR-G09-DUE-PROCESS-INCOMPLETE` where mapped) — cannot-penalise-before-show-cause. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-046** | Traces-to: FR-011/FR-018, DI-13, ERR-G09-AUTHORITY-NOT-COMPETENT. Type: Authorization/Negative. |
| Title | Finalise blocked when signing authority not competent for penalty class (Art. 311(1)) |
| Preconditions | DA `emp-9002` competent minor only; order proposes DISMISSAL. |
| Test data | Finalise DISMISSAL order signed by emp-9002. |
| Steps | 1. Finalise. |
| Expected | 409 `ERR-G09-AUTHORITY-NOT-COMPETENT`; no persistence; `competence_verified=false`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-047** | Traces-to: FR-011/FR-019, DI-14, ERR-G09-CONSULTATION-PENDING. Type: Negative. |
| Title | Finalise blocked while a mandatory consultation (UPSC/CVC) is not CLOSED |
| Preconditions | Template marks UPSC mandatory; consultation OPEN. |
| Test data | Finalise order. |
| Steps | 1. Finalise. |
| Expected | 409 `ERR-G09-CONSULTATION-PENDING`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-048** | Traces-to: FR-011, DI-20, ERR-G09-PROPORTIONALITY-REASONING-REQUIRED. Type: Negative. |
| Title | Finalise blocked when proportionality_reasoning is empty |
| Preconditions | All other gates pass; reasoning blank. |
| Test data | Finalise with empty `proportionality_reasoning`. |
| Steps | 1. Finalise. |
| Expected | 422 `ERR-G09-PROPORTIONALITY-REASONING-REQUIRED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-049** | Traces-to: FR-011, DI-4, ERR-G09-PENALTY-EXCEEDS-PROPOSED. Type: Negative/Natural-Justice. |
| Title | Order penalty exceeding the show-cause proposed set (enhancement) is rejected |
| Preconditions | Show-cause proposed {WITHHOLD_INCREMENT}; order proposes DISMISSAL. |
| Test data | Finalise DISMISSAL. |
| Steps | 1. Finalise beyond proposed. |
| Expected | 409 `ERR-G09-PENALTY-EXCEEDS-PROPOSED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-050** | Traces-to: FR-011, DI-22, ERR-G09-RECOVERY-CAP-EXCEEDED. Type: Boundary/Negative. |
| Title | RECOVERY item beyond 1/3-pay monthly cap / beyond retirement (non-DCRG) is rejected |
| Preconditions | Recovery cap = 1/3 pay. |
| Test data | (a) monthly deduction > 1/3 pay; (b) recovery_beyond_retirement without DCRG source; (c) exactly 1/3 accepted. |
| Steps | 1. Finalise each. |
| Expected | (a)(b) 422 `ERR-G09-RECOVERY-CAP-EXCEEDED`; (c) accepted at cap boundary. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-051** | Traces-to: FR-011, DI-28, ERR-G09-SIGNATURE-REQUIRED. Type: Negative. |
| Title | Finalise an unsigned order is rejected |
| Preconditions | Order DRAFT (not signed). |
| Test data | Finalise without prior sign. |
| Steps | 1. Finalise unsigned. |
| Expected | 422 `ERR-G09-SIGNATURE-REQUIRED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-052** | Traces-to: FR-011/FR-021, ERR-G09-SIGNATURE-INVALID. Type: Negative. |
| Title | Signing with an unverifiable signature is rejected (namespaced code) |
| Preconditions | DSC verification fails. |
| Test data | `POST /dcp/orders/{id}/sign` with invalid cert. |
| Steps | 1. Sign with bad cert. |
| Expected | 409 `ERR-G09-SIGNATURE-INVALID` (distinct from G12/G13 collisions). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-053** | Traces-to: FR-011, DI-6, ERR-G09-ORDER-IMMUTABLE. Type: Data-Integrity. |
| Title | Editing a finalised order or its items is blocked |
| Preconditions | Order FINALISED/SERVED. |
| Test data | Attempt to modify order/penalty_items. |
| Steps | 1. Edit finalised order. |
| Expected | 409 `ERR-G09-ORDER-IMMUTABLE`; changes only via appeal producing `revised_order_id`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-054** | Traces-to: FR-011, DI-19, ERR-G09-IDEMPOTENCY-CONFLICT. Type: Data-Integrity. |
| Title | Double-finalise with same key = one effect; same key + different fingerprint = conflict |
| Preconditions | Order signed; `Idempotency-Key`=K1. |
| Test data | (a) finalise K1; (b) replay finalise K1 same body; (c) K1 with different body. |
| Steps | 1. Finalise. 2. Replay. 3. Replay-mismatch. |
| Expected | (a) 200 finalised; (b) 200 same snapshot, no second effect; (c) 409 `ERR-G09-IDEMPOTENCY-CONFLICT`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-055** | Traces-to: FR-011, DI-19. Type: API-Contract/Negative. |
| Title | Finalise without required Idempotency-Key header is rejected |
| Preconditions | Order signed. |
| Test data | `POST /dcp/orders/{id}/finalise` no `Idempotency-Key`. |
| Steps | 1. Finalise without header. |
| Expected | 422 validation (Idempotency-Key required on this propagating action). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-056** | Traces-to: FR-011 BR-3 (exoneration path), FR-008. Type: Functional. |
| Title | Full not-proved on all articles → exoneration order (no penalty) |
| Preconditions | Report finds all articles NOT_PROVED. |
| Test data | Draft order order_type=EXONERATION; finalise. |
| Steps | 1. Draft exoneration. 2. Finalise. |
| Expected | 200 exoneration; no penalty items; back-pay settlement signalled to G10 where suspension existed. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-057** | Traces-to: FR-011/FR-018, competence-check preview. Type: API-Contract. |
| Title | Competence preview reports empowered level vs proposed max penalty class |
| Preconditions | Draft order exists. |
| Test data | `GET /dcp/orders/{id}/competence-check`. |
| Steps | 1. Preview. |
| Expected | 200 `CompetenceCheckResult` with resolved empowered level and proposed max class; matches finalise-time guard. |
| Priority | P3 |

### FR-G09-013 — SR Posting & Downstream Effects (E2E)

| Field | Value |
|---|---|
| **TC-G09-058** | Traces-to: FR-013 AC1-2, DI-10, E2E. Type: E2E-Flow. |
| Title | E2E: MAJOR penalty order finalise → G09 posts MAJOR_PENALTY to /sr/ingest → effects fan out to G06/G10/G11 |
| Preconditions | Order FINALISED (REDUCTION + WITHHOLD_PROMOTION items); `Idempotency-Key`=P1. |
| Test data | `POST /dcp/orders/{id}/post-to-sr` (façade → relays to `POST /api/v1/sr/ingest` MAJOR_PENALTY); `GET /dcp/orders/{id}/downstream-status`. |
| Steps | 1. Post to SR. 2. Read downstream status. |
| Expected | One SR `MAJOR_PENALTY` event appended (DI-10, at most one non-superseded); effect events: WITHHOLD_INCREMENT/REDUCTION→G06+G10, WITHHOLD_PROMOTION→G06; downstream-status shows per-module queued/done; `sr_event_id`/`downstream_event_id` correlation stored; case → CLOSED. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-059** | Traces-to: FR-013 AC2, E2E. Type: E2E-Flow. |
| Title | E2E: MINOR penalty posts MINOR_PENALTY to SR with minor-track effects |
| Preconditions | Minor-track order finalised (CENSURE / WITHHOLD_INCREMENT). |
| Test data | Post-to-SR MINOR_PENALTY. |
| Steps | 1. Post to SR. |
| Expected | SR `MINOR_PENALTY`/`CENSURE` event; correct downstream effects; no major-only effects (e.g. no G11 dismissal effect). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-060** | Traces-to: FR-013 AC2, E2E. Type: E2E-Flow. |
| Title | E2E: DISMISSAL/REMOVAL/CR posts to SR and fans to G11 (pension) |
| Preconditions | DISMISSAL order finalised (competent DA). |
| Test data | Post-to-SR MAJOR_PENALTY (DISMISSAL). |
| Steps | 1. Post to SR. |
| Expected | SR event appended; REMOVAL/DISMISSAL/CR → G11 effect emitted; employee lifecycle SUSPENDED/TERMINATED effect signalled (by reference; G11 executes). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-061** | Traces-to: FR-013 AC3, DI-19, ERR-G09-IDEMPOTENCY-CONFLICT. Type: Data-Integrity. |
| Title | Double post-to-SR with same key = exactly one effect; mismatch fingerprint = conflict |
| Preconditions | Order finalised; `Idempotency-Key`=P1. |
| Test data | (a) post P1; (b) replay P1; (c) P1 different body. |
| Steps | 1. Post. 2. Replay. 3. Replay-mismatch. |
| Expected | (a) SR appended; (b) stored snapshot, no second SR event / no duplicate downstream; (c) 409 `ERR-G09-IDEMPOTENCY-CONFLICT`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-062** | Traces-to: FR-013 AC (dedup on source tuple + fact_key). Type: API-Contract/Data-Integrity. |
| Title | /sr/ingest deduplicates on (source_module, source_reference_id, source_event_version)+fact_key |
| Preconditions | SR ingest reachable. |
| Test data | Submit same `srIngest` payload twice; then a semantic duplicate (same fact_key) for a qualifying-service type. |
| Steps | 1. Ingest. 2. Re-ingest identical. 3. Ingest semantic dup. |
| Expected | 201 with `ingestionStatus` = appended, then idempotent no-op / semantic-duplicate no-op; ledger has one effective event. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-063** | Traces-to: FR-013 AC/edge, BR-3. Type: Data-Integrity. |
| Title | G12 unavailable: order stays valid, outbox retains and retries (no rollback) |
| Preconditions | SR ingest returns 500/timeout. |
| Test data | Post-to-SR while G12 down; then recover. |
| Steps | 1. Post (G12 down). 2. Read status. 3. Recover + re-trigger (idempotent). |
| Expected | Order remains FINALISED; downstream-status shows `failed-retry`; on recovery, single effect applied (no duplicate). |
| Priority | P2 |

### FR-G09-012 — Appeal / Revision / Review

| Field | Value |
|---|---|
| **TC-G09-064** | Traces-to: FR-012 AC, appeal SM FILED→ADMITTED, DI-5. Type: Functional. |
| Title | File and admit an appeal within limitation |
| Preconditions | Order SERVED; within 45-day limitation. |
| Test data | `POST /dcp/orders/{orderId}/appeals`; `POST /dcp/appeals/{id}/admit`. |
| Steps | 1. File. 2. Admit. |
| Expected | 201 FILED; 200 ADMITTED (within limitation). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-065** | Traces-to: FR-012, DI-5, ERR-G09-APPEAL-TIME-BARRED. Type: Negative/Boundary. |
| Title | Time-barred appeal rejected unless condonation granted |
| Preconditions | Appeal filed after limitation. |
| Test data | (a) admit without condonation; (b) admit with `condonation_granted=true`. |
| Steps | 1. Admit late no-condonation. 2. Admit late with condonation. |
| Expected | (a) 409 `ERR-G09-APPEAL-TIME-BARRED` (→ REJECTED); (b) 200 ADMITTED + `sla_pause_events(CONDONATION)`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-066** | Traces-to: FR-012/FR-018, DI-13, appeal SM →DECIDED. Type: Authorization/State-Transition. |
| Title | Appellate authority must differ from DA and be competent to decide |
| Preconditions | Appeal ADMITTED; `Idempotency-Key` supplied. |
| Test data | (a) decide by DA (=original) ; (b) decide by competent appellate emp-9500. |
| Steps | 1. Decide as DA. 2. Decide as appellate. |
| Expected | (a) 409 `ERR-G09-AUTHORITY-NOT-COMPETENT` / SoD violation (authority == DA); (b) 200 DECIDED, reasoning recorded. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-067** | Traces-to: FR-012 AC4, FR-013, penalty_order SM SERVED→SET_ASIDE/MODIFIED. Type: E2E-Flow. |
| Title | Appeal SET_ASIDE/MODIFIED posts a superseding SR event + reversal/adjustment effects |
| Preconditions | Appeal ADMITTED; original SR event exists. |
| Test data | Decide SET_ASIDE; separately decide MODIFIED (revised order). |
| Steps | 1. Decide SET_ASIDE. 2. (other case) Decide MODIFIED. |
| Expected | SET_ASIDE → superseding SR event + `*_REVERSAL` effects to G06/G10/G11; MODIFIED → revised order created + adjustment events; idempotent. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-068** | Traces-to: FR-012, enhancement rule. Type: Natural-Justice. |
| Title | Appellate enhancement of penalty requires a fresh show-cause |
| Preconditions | Appeal UNDER_REVIEW; appellate contemplates enhancement. |
| Test data | Decide with enhanced penalty without fresh show-cause. |
| Steps | 1. Decide enhancement without show-cause. |
| Expected | Blocked (natural-justice/`ERR-G09-PENALTY-EXCEEDS-PROPOSED` semantics); enhancement allowed only after fresh show-cause. |
| Priority | P2 |

### FR-G09-014 — Document Evidence Vault

| Field | Value |
|---|---|
| **TC-G09-069** | Traces-to: FR-014 AC, DI-7. Type: Functional/Data-Integrity. |
| Title | Add, list (paginated) and hash-verified download of a vault document |
| Preconditions | Case exists; DA/IO scoped. |
| Test data | `POST /dcp/cases/{caseId}/documents`; `GET .../documents?limit=25`; `GET /dcp/documents/{id}/download`. |
| Steps | 1. Add. 2. List. 3. Download. |
| Expected | 201 linked; list paginated with `next_cursor`; download returns signed URL, content_hash verified, access audited. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-070** | Traces-to: FR-014, pagination contract. Type: API-Contract/Boundary. |
| Title | Vault list honours limit default 25 / max 100 and cursor paging |
| Preconditions | >100 vault items. |
| Test data | `?limit=100` then `?limit=101`; walk `next_cursor`. |
| Steps | 1. limit=100. 2. limit=101. 3. Follow cursor to last page. |
| Expected | limit=100 OK; limit=101 clamped/422 per contract; last page `next_cursor=null`. |
| Priority | P3 |

### FR-G09-015 — Integrity Register & Vigilance + Sealed Cover

| Field | Value |
|---|---|
| **TC-G09-071** | Traces-to: FR-015, auth g09.complaint.screen, TIER-3. Type: Authorization/Confidentiality. |
| Title | Only Vigilance Officer/DA can view confidential-source identity & vigilance scoring |
| Preconditions | Case with `is_confidential_source=true`. |
| Test data | Read integrity register/source as IO, PO, employee vs VO/DA. |
| Steps | 1. Read as IO/PO/employee. 2. Read as VO/DA. |
| Expected | IO/PO/employee → source identity masked / `403 ERR-G09-CONFIDENTIALITY-DENIED`; VO/DA → visible. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-072** | Traces-to: FR-015/FR-026, sealed-cover, cross-module G06. Type: Confidentiality. |
| Title | Under G09 charge, employee record sealed; promotion feed suppressed; released on conclusion |
| Preconditions | Charge raised (pre-final); G06 reviewing authority reads clearance. |
| Test data | G06 `clearance-attest` read while sealed; conclude case + signed release. |
| Steps | 1. G06 reads during seal. 2. Conclude + release. |
| Expected | During seal: SEALED_COVER, promotion feed suppressed, sealed-cover contents hidden; after signed release: unsealed, prior status resumed. |
| Priority | P2 |

### FR-G09-016 — SLA / Analytics / Proportionality

| Field | Value |
|---|---|
| **TC-G09-073** | Traces-to: FR-016 AC, SLA targets. Type: Functional. |
| Title | Per-stage SLA targets computed from template; AT_RISK/BREACHED raised with escalation |
| Preconditions | Case progressing; stage target near/over. |
| Test data | Advance clock to AT_RISK then BREACHED. |
| Steps | 1. Read SLA timeline near target. 2. Cross target. |
| Expected | AT_RISK then BREACHED with escalation; timeline events hash-chained. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-074** | Traces-to: FR-016, DI-20, proportionality analytics. Type: Functional. |
| Title | Proportionality outlier view flags severity vs misconduct/precedent |
| Preconditions | Finalised penalties dataset. |
| Test data | `GET` proportionality analytics. |
| Steps | 1. Read analytics. |
| Expected | Outlier penalties flagged; feeds G14; no penalty modified by analytics. |
| Priority | P3 |

### FR-G09-017 — Procedure Template & Jurisdiction Overlay

| Field | Value |
|---|---|
| **TC-G09-075** | Traces-to: FR-017, DI-17. Type: Functional. |
| Title | Template overlay configures consultations/timelines/service modes/limitation; kernel unaffected |
| Preconditions | Admin authenticated. |
| Test data | Create template overlay; open a case; verify decision guards read overlay values. |
| Steps | 1. Configure overlay. 2. Open case. 3. Exercise a guarded action. |
| Expected | Overlay values honoured (valid_service_modes, limitation, competence ref); natural-justice kernel (DI-2/3/4/9/13/14/20) still enforced. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-076** | Traces-to: FR-017, DI-17, ERR-G09-PROCEDURE-TEMPLATE-INVALID. Type: Negative. |
| Title | Template attempting to parameterise away a kernel invariant / ambiguous overlay is rejected |
| Preconditions | Admin. |
| Test data | Save `tpl-bad` disabling DI-13 competence or with ambiguous mapping. |
| Steps | 1. Save invalid template. |
| Expected | 422 `ERR-G09-PROCEDURE-TEMPLATE-INVALID`; kernel cannot be switched off. |
| Priority | P2 |

### FR-G09-018 — Authority Competence Matrix

| Field | Value |
|---|---|
| **TC-G09-077** | Traces-to: FR-018, DI-13. Type: Functional. |
| Title | Competence matrix resolves empowered level per cadre & penalty class |
| Preconditions | `authority_competence` seeded. |
| Test data | Resolve competence for emp-9001 (major) and emp-9002 (minor) on Group-A DISMISSAL. |
| Steps | 1. Resolve for both. |
| Expected | emp-9001 competent; emp-9002 not competent for DISMISSAL; DISMISSAL/REMOVAL/CR requires authority not subordinate to appointing authority. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-078** | Traces-to: FR-018, DI-13, multiple penalties. Type: Boundary. |
| Title | Multiple penalties of different classes resolve competence to the highest class |
| Preconditions | Order with {WITHHOLD_INCREMENT (minor), REDUCTION (major)}. |
| Test data | Competence check + finalise by DA competent only for minor. |
| Steps | 1. Finalise mixed-class order as minor-only DA. |
| Expected | 409 `ERR-G09-AUTHORITY-NOT-COMPETENT` (competence judged at highest class). |
| Priority | P2 |

### FR-G09-019 — Statutory Consultation Management

| Field | Value |
|---|---|
| **TC-G09-079** | Traces-to: FR-019, DI-14, case SM →CONSULTATION. Type: Functional. |
| Title | Open, then CLOSE (or WAIVE with reasons) a mandatory consultation unblocks finalise |
| Preconditions | Template UPSC mandatory. |
| Test data | Open consultation UPSC; close it; then finalise. |
| Steps | 1. Open. 2. Close. 3. Finalise. |
| Expected | While OPEN finalise blocked (see TC-G09-047); after CLOSED/WAIVED-with-reasons, finalise proceeds. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-080** | Traces-to: FR-019/FR-024, DI-18. Type: State-Transition. |
| Title | Awaiting external advice pauses the SLA clock |
| Preconditions | Consultation OPEN. |
| Test data | Observe SLA during open consultation; close and resume. |
| Steps | 1. Open consultation. 2. Read SLA. 3. Close. |
| Expected | Stage `sla_status=PAUSED` with `sla_pause_events(CONSULTATION)`; on close, targets recomputed. |
| Priority | P2 |

### FR-G09-020 — Dispense-with-Inquiry

| Field | Value |
|---|---|
| **TC-G09-081** | Traces-to: FR-020, DI-23. Type: Functional. |
| Title | Approved dispensation with valid template reason lets FR-011 finalise MAJOR penalty without inquiry |
| Preconditions | Template permits reason_code; dispensation APPROVED with speaking reasons. |
| Test data | Create dispensation reason=IMPRACTICABLE_INQUIRY; approve; finalise MAJOR penalty. |
| Steps | 1. Create+approve dispensation. 2. Finalise. |
| Expected | Case routes DISPENSED→ORDER; finalise satisfies DI-3 major branch via DI-23; order finalised. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-082** | Traces-to: FR-020, DI-23, ERR-G09-INQUIRY-DISPENSATION-INVALID. Type: Negative. |
| Title | Dispensation reason not permitted by template is rejected |
| Preconditions | Template disallows the chosen reason. |
| Test data | Create dispensation with disallowed reason_code. |
| Steps | 1. Create dispensation. |
| Expected | 422 `ERR-G09-INQUIRY-DISPENSATION-INVALID`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-083** | Traces-to: FR-020, DI-23, ERR-G09-DUE-PROCESS-INCOMPLETE. Type: Negative. |
| Title | Finalise without inquiry and without an APPROVED dispensation is rejected |
| Preconditions | No inquiry; dispensation PROPOSED (not approved). |
| Test data | Finalise MAJOR penalty. |
| Steps | 1. Finalise. |
| Expected | 409 `ERR-G09-DUE-PROCESS-INCOMPLETE`. |
| Priority | P1 |

### FR-G09-021 — Legal Service & DSC/eSign

| Field | Value |
|---|---|
| **TC-G09-084** | Traces-to: FR-021, DI-15. Type: Functional. |
| Title | Valid legal service starts statutory windows; informational notification does not |
| Preconditions | Charge-sheet ISSUED. |
| Test data | Serve REGISTERED_POST (`is_statutorily_valid=true`); separately send a notification. |
| Steps | 1. Serve valid mode. 2. Send notification only. |
| Expected | Windows compute from the valid `legal_service_records` row; a notification alone never constitutes service (DI-15). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-085** | Traces-to: FR-021, DI-28, artefacts. Type: Data-Integrity. |
| Title | Charge-sheet/report/show-cause/order cannot reach served/finalised without DSC/eSign binding |
| Preconditions | Each artefact unsigned. |
| Test data | Attempt serve/finalise on each unsigned artefact. |
| Steps | 1. Serve/finalise each unsigned. |
| Expected | 422 `ERR-G09-SIGNATURE-REQUIRED` for each (signature_type + signatory_id + signed_at required). |
| Priority | P1 |

### FR-G09-022 — Multi-Respondent Proceedings

| Field | Value |
|---|---|
| **TC-G09-086** | Traces-to: FR-022, DI-25. Type: Functional/Data-Integrity. |
| Title | Common proceeding: per-respondent article findings; order/exoneration per ACTIVE respondent |
| Preconditions | Joint respondents emp-3005, emp-3006 sharing inquiry. |
| Test data | Report with article-wise findings for both; finalise per-respondent orders. |
| Steps | 1. Submit joint report. 2. Finalise per respondent. |
| Expected | Both respondents have findings; each ACTIVE respondent gets an order/exoneration. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-087** | Traces-to: FR-022, DI-25, ERR-G09-RESPONDENT-UNRESOLVED. Type: Negative. |
| Title | Closing a case with an unresolved active respondent is blocked |
| Preconditions | One respondent penalised, the other unresolved/ACTIVE. |
| Test data | Attempt case close. |
| Steps | 1. Close case. |
| Expected | 409 `ERR-G09-RESPONDENT-UNRESOLVED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-088** | Traces-to: FR-022 edge, severance. Type: Functional. |
| Title | Severing a respondent requires recorded reasons |
| Preconditions | Joint proceeding. |
| Test data | Sever emp-3006 without reasons, then with reasons. |
| Steps | 1. Sever no-reason. 2. Sever with reason. |
| Expected | 1 → validation error; 2 → SEVERED with recorded reasons. |
| Priority | P3 |

### FR-G09-023 — POSH / ICC Procedure

| Field | Value |
|---|---|
| **TC-G09-089** | Traces-to: FR-023, ICC composition, external member. Type: Functional/Authorization. |
| Title | Constitute ICC with presiding + members incl. mandatory external member; ICC report feeds penalty stage |
| Preconditions | POSH case `tpl-posh`. |
| Test data | Appoint icc_presiding + icc_member(s) with `icc_external_member=true`; submit ICC report. |
| Steps | 1. Constitute ICC. 2. Submit ICC report. |
| Expected | 201 ICC constituted (members mutually distinct); ICC report (signed) feeds FR-008/FR-011. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-090** | Traces-to: FR-023, ERR-G09-ICC-PROCEDURE-REQUIRED. Type: Negative. |
| Title | ICC constituted without external member is rejected |
| Preconditions | POSH case. |
| Test data | Constitute ICC with `icc_external_member=false`. |
| Steps | 1. Constitute without external member. |
| Expected | 409 `ERR-G09-ICC-PROCEDURE-REQUIRED`. |
| Priority | P1 |

### FR-G09-024 — SLA Pause / Resume

| Field | Value |
|---|---|
| **TC-G09-091** | Traces-to: FR-024, DI-18, ERR-G09-SLA-PAUSE-INVALID. Type: Negative/State-Transition. |
| Title | Resume without an open pause is rejected |
| Preconditions | No open `sla_pause_events` for the stage. |
| Test data | `POST /dcp/inquiries/{id}/stay` action=RESUME with no active pause. |
| Steps | 1. Resume with no pause. |
| Expected | 409 `ERR-G09-SLA-PAUSE-INVALID`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-092** | Traces-to: FR-024, DI-18. Type: Data-Integrity. |
| Title | Paused stage never shows a false breach; resume adds paused duration to targets |
| Preconditions | Stage paused across its would-be breach time. |
| Test data | Pause; advance clock past original target; resume. |
| Steps | 1. Pause. 2. Cross original target. 3. Resume. |
| Expected | No BREACHED during pause; on resume, `sla_target_at` shifted by paused duration. |
| Priority | P2 |

### FR-G09-025 — Personal Hearing Record

| Field | Value |
|---|---|
| **TC-G09-093** | Traces-to: FR-025, DI-29, appeal-stage hearing. Type: Functional. |
| Title | Personal hearing at appeal stage recorded; appeal decision references it |
| Preconditions | Appeal ADMITTED, hearing requested. |
| Test data | Record appeal personal hearing granted=true; decide appeal referencing hearing. |
| Steps | 1. Record hearing. 2. Decide. |
| Expected | Hearing recorded; appeal decision references hearing id (DI-29). |
| Priority | P2 |

### FR-G09-026 — Jurisdiction Transfer / Sealed Cover / Retiree

| Field | Value |
|---|---|
| **TC-G09-094** | Traces-to: FR-026, DI-1, jurisdiction re-resolution. Type: State-Transition. |
| Title | Mid-proceeding transfer re-resolves competent DA; cadre snapshot stays stable for competence |
| Preconditions | Case in INQUIRY; G05 transfer event. |
| Test data | Trigger transfer; observe DA re-resolution. |
| Steps | 1. Transfer. |
| Expected | DA re-resolved for new jurisdiction; `case_respondents` cadre snapshot preserved (FR-018); stage regression only via recorded authority (DI-1). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-095** | Traces-to: FR-026, DI-27, ERR-G09-RETIREE-PROCEEDING-BARRED. Type: Negative/Boundary. |
| Title | Retiree proceeding beyond the Rule 9 four-year bar or without sanction is rejected |
| Preconditions | Retiree emp-3009; event >4 years old or no `retiree_sanction_ref`. |
| Test data | (a) proceed with event 4y+1d old; (b) proceed without sanction ref; (c) within bar + sanction. |
| Steps | 1. Proceed (a). 2. Proceed (b). 3. Proceed (c). |
| Expected | (a)(b) 409 `ERR-G09-RETIREE-PROCEEDING-BARRED`; (c) allowed with `is_retiree_case=true`. |
| Priority | P1 |

### FR-G09-027 — Hash-Chained Audit & Verification

| Field | Value |
|---|---|
| **TC-G09-096** | Traces-to: FR-027, DI-21, OPEN-PLAT-03. Type: Data-Integrity. |
| Title | Timeline chain verifies (row_hash/prev_hash); tampering raises AUDIT-CHAIN-BROKEN |
| Preconditions | Case with several timeline events. |
| Test data | Run verify; then tamper one `case_timeline_events` row; re-verify. |
| Steps | 1. Verify (clean). 2. Tamper. 3. Verify. |
| Expected | 1 → chain valid; 3 → 409 `ERR-G09-AUDIT-CHAIN-BROKEN`. Ledgers are insert-only (DI-12). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-097** | Traces-to: FR-027/P05 + OPEN-PLAT-03, DI-6/DI-12. Type: Data-Integrity/Immutability. |
| Title | Immutability via P05: attempts to update/delete audit or finalised-order rows fail |
| Preconditions | Finalised order + audit rows exist. |
| Test data | Attempt UPDATE/DELETE on `audit_log`, `case_timeline_events`, finalised `penalty_orders`. |
| Steps | 1. Attempt each mutation. |
| Expected | All blocked (P05 DB-trigger immutability, 7-yr retention); order edit → `ERR-G09-ORDER-IMMUTABLE`; append-only ledgers reject update/delete. |
| Priority | P1 |

### FR-G09-028 — Abatement on Death

| Field | Value |
|---|---|
| **TC-G09-098** | Traces-to: FR-028, DI-26, SM →ABATED. Type: State-Transition. |
| Title | Charged-officer death abates case/respondent; SLAs stop; SR records abatement |
| Preconditions | Case in progress for emp-3010; death proof supplied. |
| Test data | Record death event. |
| Steps | 1. Record death. |
| Expected | Case/respondent → ABATED; SLAs stop; downstream penalty effects suppressed; abatement SR event recorded (FR-013). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-099** | Traces-to: FR-028, DI-26, ERR-G09-CASE-ABATED. Type: Negative. |
| Title | Finalising a penalty on an abated case/respondent is rejected |
| Preconditions | Respondent ABATED. |
| Test data | Finalise penalty order for abated respondent. |
| Steps | 1. Finalise. |
| Expected | 409 `ERR-G09-CASE-ABATED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-100** | Traces-to: FR-022+FR-028, DI-25/DI-26. Type: Data-Integrity. |
| Title | In a joint proceeding, death abates only that respondent; others continue |
| Preconditions | Joint respondents; one dies. |
| Test data | Record death of emp-3006; continue against emp-3005. |
| Steps | 1. Abate one. 2. Proceed against other. |
| Expected | emp-3006 ABATED (effects suppressed); emp-3005 proceeds to order normally. |
| Priority | P2 |

### Cross-cutting — Authorization, Confidentiality, API-Contract

| Field | Value |
|---|---|
| **TC-G09-101** | Traces-to: Foundation §4 auth. Type: Authorization/API-Contract. |
| Title | Unauthenticated and malformed-token requests are rejected |
| Preconditions | None / expired token. |
| Test data | Call protected endpoints with no bearer / expired bearer. |
| Steps | 1. No token. 2. Expired token. |
| Expected | 401 `UNAUTHENTICATED`; `X-Correlation-Id` present; no data leak. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-102** | Traces-to: auth-matrix g09.charge.initiate/penalty.impose, DI-2 SoD. Type: Authorization. |
| Title | Role gating: IO/PO/employee cannot initiate charges or impose penalty |
| Preconditions | Non-DA personas authenticated. |
| Test data | IO calls charge-sheet draft; PO calls order finalise; employee calls suspension. |
| Steps | 1. Each forbidden call. |
| Expected | 403 `FORBIDDEN`; DA-only actions enforced; MFA required for DA charge/penalty. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-103** | Traces-to: FR-013 auth g09.sr.post, SoD maker≠checker. Type: Authorization. |
| Title | SR posting enforces maker≠checker (SR write SoD) |
| Preconditions | DA and sr_custodian personas. |
| Test data | Same principal attempts both maker and checker of SR write. |
| Steps | 1. Attempt self-maker-checker SR post. |
| Expected | 403/409 SoD violation; SR write requires distinct maker/checker. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-104** | Traces-to: P02 scope-safety. Type: Confidentiality/Authorization. |
| Title | Out-of-tenant/out-of-scope case is not disclosed (403/404 do not leak existence) |
| Preconditions | Case belongs to another tenant/scope. |
| Test data | `GET /dcp/cases/{id}` for out-of-scope id. |
| Steps | 1. Read out-of-scope case. |
| Expected | 404 `NOT_FOUND` (or 403) — never reveals whether the record exists (multi-tenant isolation). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-105** | Traces-to: sealed-cover, documents download. Type: Confidentiality. |
| Title | Sealed/confidential vault document download denied to non-privileged roles |
| Preconditions | Sealed-cover document. |
| Test data | `GET /dcp/documents/{id}/download` as IO/employee vs DA. |
| Steps | 1. Download as IO/employee. 2. Download as DA. |
| Expected | Non-privileged → 403 `ERR-G09-CONFIDENTIALITY-DENIED`; DA → signed URL, audited. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-106** | Traces-to: Foundation §4, error envelope + correlation. Type: API-Contract. |
| Title | Every response carries X-Correlation-Id and the canonical error envelope on failures |
| Preconditions | Any endpoint. |
| Test data | Trigger a 422 and a 200. |
| Steps | 1. Success call. 2. Validation-failing call. |
| Expected | Both carry `X-Correlation-Id`; error body = `{ error: { code, message, correlation_id, field? } }`; code ∈ platform wire set or ERR-G09-*. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-107** | Traces-to: Foundation §4 rate limiting. Type: API-Contract/Boundary. |
| Title | Rate-limited caller receives 429 |
| Preconditions | Exceed configured rate. |
| Test data | Burst calls beyond limit. |
| Steps | 1. Exceed rate. |
| Expected | 429 `RATE_LIMITED`; retry metadata present; no partial state change. |
| Priority | P3 |

| Field | Value |
|---|---|
| **TC-G09-108** | Traces-to: FR-001/002/004… case SM invalid transitions. Type: State-Transition/Negative. |
| Title | Illegal stage jumps are rejected (e.g. INTAKE→ORDER, CHARGE→CLOSED skip) |
| Preconditions | Case at INTAKE. |
| Test data | Attempt to draft/finalise order directly from INTAKE; attempt charge-sheet before triage. |
| Steps | 1. Jump INTAKE→ORDER. 2. Charge before triage. |
| Expected | 409 `ERR-G09-INVALID-STATE-TRANSITION`; case_stage advances only along the machine (DI-1). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G09-109** | Traces-to: DI-11 referential integrity. Type: Data-Integrity. |
| Title | Actions on non-existent parents / soft-deleted parents are rejected |
| Preconditions | Non-existent caseId; a soft-deleted case. |
| Test data | `POST /dcp/cases/{bad}/charge-sheets`; add child under soft-deleted parent. |
| Steps | 1. Child under missing parent. 2. Child under soft-deleted parent. |
| Expected | 404 `NOT_FOUND`; soft-deleted parent blocks new children (FK/DI-11). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G09-110** | Traces-to: FR-003/011 propagating actions, DI-19 header requirement. Type: API-Contract/Idempotency. |
| Title | Propagating POSTs require Idempotency-Key; 24h replay returns original result |
| Preconditions | Suspension order + order finalise + post-to-SR + appeal decide. |
| Test data | Omit key on each; then valid key replayed within 24h. |
| Steps | 1. Omit key on each propagating POST. 2. Replay valid key. |
| Expected | Missing key → 422; replayed key within window → original stored result, no duplicate effect. |
| Priority | P1 |

---

## 3. Traceability matrix (FR → TC ids)

| FR | Title | TC ids |
|---|---|---|
| FR-G09-001 | Complaint Registration & Triage | TC-G09-001, 002, 003, 004, 005, 006, 108 |
| FR-G09-002 | Preliminary Inquiry | TC-G09-007, 008, 009 |
| FR-G09-003 | Suspension, Subsistence & Review | TC-G09-010, 011, 012, 013, 014, 110 |
| FR-G09-004 | Charge-Sheet / Articles of Charge | TC-G09-015, 016, 017, 018, 108 |
| FR-G09-005 | Defence Statement + Rights Surface | TC-G09-019, 020, 021, 022 |
| FR-G09-006 | Appointment IO/PO/ICC | TC-G09-023, 024, 025, 026 |
| FR-G09-007 | Conduct of Inquiry | TC-G09-027, 028, 029, 030, 031, 032 |
| FR-G09-008 | Inquiry Report & Findings | TC-G09-033, 034, 035, 036, 037 |
| FR-G09-009 | Disagreement Memo | TC-G09-038, 039 |
| FR-G09-010 | Show-Cause Notice | TC-G09-040, 041, 042 |
| FR-G09-011 | Penalty Order & Exoneration | TC-G09-043, 044, 045, 046, 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057 |
| FR-G09-012 | Appeal / Revision / Review | TC-G09-064, 065, 066, 067, 068, 093 |
| FR-G09-013 | SR Posting & Downstream Effects | TC-G09-058, 059, 060, 061, 062, 063, 067, 103, 110 |
| FR-G09-014 | Document Evidence Vault | TC-G09-069, 070, 105 |
| FR-G09-015 | Integrity Register & Vigilance + Sealed Cover | TC-G09-071, 072 |
| FR-G09-016 | SLA / Analytics / Proportionality | TC-G09-073, 074 |
| FR-G09-017 | Procedure Template & Overlay | TC-G09-075, 076, 005 |
| FR-G09-018 | Authority Competence Matrix | TC-G09-046, 077, 078 |
| FR-G09-019 | Statutory Consultation Management | TC-G09-047, 079, 080 |
| FR-G09-020 | Dispense-with-Inquiry | TC-G09-081, 082, 083 |
| FR-G09-021 | Legal Service & DSC/eSign | TC-G09-018, 052, 084, 085 |
| FR-G09-022 | Multi-Respondent Proceedings | TC-G09-086, 087, 088, 100 |
| FR-G09-023 | POSH / ICC Procedure | TC-G09-026, 089, 090 |
| FR-G09-024 | SLA Pause / Resume | TC-G09-032, 080, 091, 092 |
| FR-G09-025 | Personal Hearing Record | TC-G09-041, 042, 093 |
| FR-G09-026 | Jurisdiction / Sealed Cover / Retiree | TC-G09-072, 094, 095 |
| FR-G09-027 | Hash-Chained Audit & Verification | TC-G09-096, 097 |
| FR-G09-028 | Abatement on Death | TC-G09-098, 099, 100 |
| Cross-cutting (auth/confidentiality/API/state/integrity) | — | TC-G09-101, 102, 103, 104, 105, 106, 107, 108, 109, 110 |

**FR coverage: 28 of 28 FRs mapped — 0 gaps.**

### Error-code coverage (all 32 ERR-G09-* exercised)

| Error code | HTTP | TC | | Error code | HTTP | TC |
|---|---|---|---|---|---|---|
| ERR-G09-DUPLICATE-COMPLAINT | 409 | 002 | | ERR-G09-CONSULTATION-PENDING | 409 | 047 |
| ERR-G09-DA-NOT-RESOLVED | 422 | 004 | | ERR-G09-INQUIRY-DISPENSATION-INVALID | 422 | 082 |
| ERR-G09-DA-BIAS-CONFLICT | 409 | 003 | | ERR-G09-INVALID-SERVICE-MODE | 409 | 018 |
| ERR-G09-INVALID-STATE-TRANSITION | 409 | 045,108 | | ERR-G09-SIGNATURE-REQUIRED | 422 | 016,035,051,085 |
| ERR-G09-ACTOR-CONFLICT | 409 | 024 | | ERR-G09-SIGNATURE-INVALID | 409 | 052 |
| ERR-G09-DEFENCE-WINDOW-CLOSED | 409 | 020 | | ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED | 422 | 012 |
| ERR-G09-INSPECTION-NOT-AFFORDED | 409 | 028 | | ERR-G09-PROPORTIONALITY-REASONING-REQUIRED | 422 | 048 |
| ERR-G09-INCOMPLETE-FINDINGS | 422 | 034 | | ERR-G09-RECOVERY-CAP-EXCEEDED | 422 | 050 |
| ERR-G09-NATURAL-JUSTICE-VIOLATION | 409 | 030,039 | | ERR-G09-ICC-PROCEDURE-REQUIRED | 409 | 026,090 |
| ERR-G09-PENALTY-EXCEEDS-PROPOSED | 409 | 049,068 | | ERR-G09-RESPONDENT-UNRESOLVED | 409 | 087 |
| ERR-G09-DUE-PROCESS-INCOMPLETE | 409 | 044,083 | | ERR-G09-RETIREE-PROCEEDING-BARRED | 409 | 095 |
| ERR-G09-AUTHORITY-NOT-COMPETENT | 409 | 046,066,078 | | ERR-G09-CASE-ABATED | 409 | 099 |
| ERR-G09-SLA-PAUSE-INVALID | 409 | 091 | | ERR-G09-IDEMPOTENCY-CONFLICT | 409 | 054,061 |
| ERR-G09-AUDIT-CHAIN-BROKEN | 409 | 096 | | ERR-G09-PROCEDURE-TEMPLATE-INVALID | 422 | 005,076 |
| ERR-G09-ORDER-IMMUTABLE | 409 | 053,097 | | ERR-G09-APPEAL-TIME-BARRED | 409 | 065 |
| ERR-G09-EVIDENCE-TAMPERED | 409 | 029 | | ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS | 422 | 011 |

All 32 ERR-G09-* codes covered.

---

## 4. Coverage summary

### By type (primary type per TC)

| Type | Count | TC ids |
|---|---|---|
| Functional | 22 | 001, 006, 007, 014, 015, 019, 023, 025, 027, 036, 038, 040, 056, 069, 073, 075, 077, 079, 081, 084, 089, 093 |
| Boundary | 5 | 011, 020, 021, 050, 070 |
| Negative | 18 | 002, 004, 005, 016, 018, 035, 042, 044, 051, 055, 076, 082, 083, 087, 090, 091, 095, 099 |
| Authorization | 8 | 046, 066, 071, 089, 101, 102, 103, 104 |
| Confidentiality | 6 | 009, 072, 105, (071), (104), (105) → 009, 072, 104, 105 + masking in 071 |
| Natural-Justice | 7 | 003, 024, 028, 030, 039, 049, 068 |
| State-Transition | 12 | 008, 013, 017, 031, 032, 037, 045, 080, 094, 098, 108, 110 |
| Data-Integrity | 12 | 029, 034, 053, 054, 061, 062, 063, 086, 092, 096, 097, 109, 100 |
| API-Contract | 7 | 057, 062, 070, 106, 107, 110, 055 |
| E2E-Flow | 6 | 010, 043, 058, 059, 060, 067 |

(Some TCs carry a secondary type; the matrix above assigns each TC to its dominant classification. Total distinct TCs = 110.)

### By priority

| Priority | Count |
|---|---|
| P1 (critical — due-process kernel, competence, SoD, idempotency, E2E, immutability, confidentiality) | 55 |
| P2 (important — stage transitions, service, analytics, multi-respondent, POSH, SLA) | 42 |
| P3 (secondary — previews, pagination edges, rate limiting, severance) | 13 |
| **Total** | **110** |

### Emphasis check (due-process integrity)

- Complaint → PI → suspension(+subsistence) → charge-sheet → defence → inquiry (IO/PO/witnesses/exhibits/daily-order-sheets) → report → show-cause → penalty → appeal: covered end-to-end (TC-001…067).
- Natural justice: disclose relied-upon material before penalty (030, 039, 009); DA ≠ complainant/witness/IO/PO SoD (003, 024, 102).
- Statutory timelines + SLA pause/resume: 013, 032, 073, 080, 091, 092, 110.
- Minor vs major penalty, competence: 043, 046, 059, 077, 078.
- Dispensation-with-inquiry: 081, 082, 083. Personal hearing: 041, 042, 093. Sealed cover: 072, 105. Multi-respondent: 086, 087, 088, 100.
- E2E SR posting MINOR/MAJOR/SUSPENSION → /sr/ingest → G06/G10/G11: 010, 058, 059, 060, 067; idempotency 054, 061, 110.
- State-transition invalid incl. cannot-penalise-before-show-cause: 045, 108. Immutability via P05 + OPEN-PLAT-03: 053, 096, 097. Idempotency-keyed actions: 054, 055, 061, 110.
