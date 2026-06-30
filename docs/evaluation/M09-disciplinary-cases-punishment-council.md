# Adversarial Idea Evaluator — Council Report
## M09-DCP — Employee Disciplinary Cases and Punishment Management BRD (v1.0)

**Artefact under review:** `/Users/n15318/hrms/docs/brd/v1/M09-disciplinary-cases-punishment.md`
**Shared context:** `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this disciplinary-cases-and-punishment BRD complete, correct, and world-class (due-process workflow: charge-sheet, inquiry, penalty, appeal; natural-justice safeguards; statutory timelines; SR posting; effects on pay/promotion/pension) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → adopted improvements.
**Benchmark bar:** Workday/SuccessFactors/Oracle HCM case-management discipline + Indian public-service quasi-judicial due process (CCS (CCA) Rules 1965, Article 311 of the Constitution, CVC/UPSC consultation regime, CCS (Pension) Rule 9, POSH Act 2013).

---

## Part 1 — The Five Advisors

### Advisor A — The Proponent

This BRD is, frankly, the strongest of the disciplinary-module specs I have seen produced from a generic HCM baseline. It does not merely digitise a workflow; it encodes the *legal theory* of a quasi-judicial process. Three things deserve explicit praise.

First, the **due-process chain is enforced as data, not as documentation**. DI-3 ("no penalty without process") makes a `PENALTY` order structurally impossible unless a served charge-sheet, a defence (or recorded ex-parte), and — for major penalties — a concluded inquiry report and closed show-cause all exist. DI-4 ("show-cause ⊇ order") blocks the single most common appeal-winning defect: a penalty heavier than what was proposed. These are the two errors that set aside the most real-world orders, and they are caught at write time with named codes (`DUE_PROCESS_INCOMPLETE`, `PENALTY_EXCEEDS_PROPOSED`). That is genuinely world-class.

Second, the **natural-justice safeguards are sequenced correctly**. The disagreement-memo flow (FR-009) correctly forces the DA to serve tentative reasons before upgrading a "not-proved" finding — a subtlety (post-*Yoginath Bagde*/*Punjab National Bank* jurisprudence) that most vendors miss entirely, returning `NATURAL_JUSTICE_VIOLATION` if skipped.

Third, **integrity and confidentiality are first-class**. SHA-256 evidence sealing (DI-7), read-audit on sealed records, whistle-blower hard-hide (DI-9), field-level service gating (charged officer sees only `is_served=true`), and an append-only timeline give the legal defensibility the executive summary promises.

The interim-measures handling is also mature: deemed suspension on >48h detention, subsistence floor/ceiling [25,75], scheduled review tasks, and outbox-based payroll emission so a cross-module failure never rolls back a lawful order. The appeal/revision/review trio with limitation + condonation and superseding SR events closes the loop. Build this as written and you have a defensible, auditable, timely system. My only counsel: protect this core from scope-creep — the bones are correct.

### Advisor B — The Contrarian

The proponent admires the locks while three doors stand open. These are not edge cases; each is a published, repeatable reason penalty orders are quashed.

**1. Authority competence is unmodelled — and this voids dismissals.** Article 311(1) bars removal/dismissal by an authority *subordinate to the appointing authority*. The BRD lets any `disciplinary_authority_id` pass any `penalty_type`. There is no competence matrix mapping (cadre × penalty class) → empowered authority, and no guard. A `DISMISSAL` signed by an incompetent DA is void *ab initio* — the most catastrophic defect possible — and this spec cannot detect it.

**2. The "dispense with inquiry" and mandatory-consultation paths simply don't exist.** Article 311(2) second proviso permits (indeed requires) skipping inquiry on criminal conviction, where inquiry is "not reasonably practicable," or on security grounds — *with recorded reasons*. Conversely, central major-penalty cases require **UPSC consultation** and, for vigilance cases, **CVC first/second-stage advice** *before* the final order. The model has `complaint_source=CVC` but no consultation entity and no guard. An order passed without mandatory UPSC consultation is routinely set aside. Both the lawful shortcut and the lawful brake are missing.

**3. The right to inspect listed documents/witnesses is absent.** Rule 14(3)/(4) gives the charged officer a right to a *list of documents and witnesses* and to *inspect* them. Denial is a textbook natural-justice breach. The model stores exhibits but records no "list supplied / inspection afforded" event. The procedural defect that wins the most inquiries is invisible here.

**The risk the author missed entirely: notification is being conflated with legal service.** `service_mode` includes `EMAIL`, and the same email channel carries informational `notifications`. In most jurisdictions email is *not* valid service of a charge-sheet; relying on it makes service challengeable and the whole proceeding voidable. Add to this: **subsistence allowance is paid with no `non_employment_certificate` gate** (statutorily required — pay it without the certificate and you create recoverable overpayments and audit paras), and the **90-day suspension-review/charge-memo rule** (*Ajay Kumar Choudhary*) has a review *task* but no deemed-revocation consequence. Evidence tampering is well guarded; *procedural* tampering with the record of service and consultation is not.

### Advisor C — The First Principles Thinker

Strip this to its primitives. A disciplinary case is: *a contested factual claim, adjudicated by an empowered authority, through a procedure whose validity is itself justiciable.* The BRD models the first and third primitives superbly and the second barely at all — and that asymmetry is the framing flaw.

**Hidden assumption #1: one delinquent per case.** `disciplinary_cases.charged_employee_id` is singular. Real misconduct is frequently collusive — a sanctioning officer, a verifying officer, a beneficiary — tried in *common proceedings* before one IO on one set of evidence. The current model forces N parallel cases that cannot share an inquiry, witnesses, exhibits, or order, duplicating evidence and inviting inconsistent findings. The atom should arguably be the *proceeding*, with one-or-more *charged officers* attached.

**Hidden assumption #2: the procedure is statically linear.** §12.1 hard-codes INTAKE→…→CLOSED. But the document elsewhere insists everything is *configurable to the deploying jurisdiction*. These contradict. A truly first-principles design separates the **invariant kernel** (charge → opportunity-to-defend → reasoned finding → proportionate penalty → appeal) from the **jurisdiction-specific overlay** (which consultations, which authority competence, which timelines, dispense-with-inquiry conditions). Right now statutory specifics are smeared across enums and DI-rules as if universal, while the genuinely universal natural-justice kernel is mixed in with CCS-specific assumptions. A configurable *procedure-template* per case_type would let the same engine serve a corporate code of conduct and a government conduct-rule regime — which is exactly the "global HCM + public-sector" dual mandate the shared foundation demands.

**Hidden assumption #3: suspension is a stage.** It is not — it is a *parallel interim status*. The BRD says so ("SUSPENSION (parallel)") then lists SUSPENSION as a linear `case_stage`. That ontological confusion will produce real state-machine bugs.

Reframe: model **competence**, **consultation**, and **procedure-template** as first-class configurable entities, and the system becomes both more correct *and* more general — the rare case where rigour and reach point the same way.

### Advisor D — The Outsider

I run HR systems for a large multinational. Reading this, two reactions: it is obviously expert, and it is obviously written for one country's civil service — which is a problem for a spec that claims a "leading global organisation" bar.

The vocabulary is dense and untranslated. "Articles of charge," "statement of imputation," "disagreement memo," "ex-parte," "suo-motu," "nemo judex in causa sua," "condonation of delay," "CCS(CCA) Rule 14," "subsistence allowance." A glossary exists (good), but the *data model itself* hard-bakes these. If a Singaporean or German subsidiary runs this, "show-cause," "compulsory retirement," and the 45-day appeal limitation are simply wrong defaults, and there is no seam to swap them. The BRD says values are configurable, but the *concepts* (e.g. a mandatory disagreement memo, a UPSC-shaped consultation) are not parameterised — they are assumed present.

Complexity worry: 21 entities, 30+ enums, 12 integrity rules, 14 error codes, 16 FRs. Much is justified by the legal weight. But a frontline HR officer just wants to "raise a case, charge someone, hold a hearing, decide, let them appeal." The risk is that the **everyday minor-penalty case** (a censure for unauthorised absence) is buried under machinery built for the rare corruption dismissal. I would want an explicit *fast lane*: minor-track, admitted-charge, single-officer cases should traverse maybe four screens, not the full stepper. The BRD gestures at this (ADMITS_ALL → direct penalty) but the UI inventory shows one heavyweight workbench for all.

Two plain-language gaps that will bite untrained users: nowhere does the spec say what the charged officer is *told they are entitled to* (defence assistant, document inspection, personal hearing) in their own portal — the Charged-Officer Portal is described as a document-list, not a rights-and-deadlines guide. And "harassment" is a single enum value, yet anyone outside this jurisdiction knows sexual-harassment cases need a *different* committee and procedure entirely. Make the obvious things obvious.

### Advisor E — The Executor

Feasibility is good — the entity model, APIs, state tables, outbox pattern and parallel-agent plan (Tracks A–H) are buildable largely as written. My concern is *sequencing and dependency truth*, because several "0 gaps" claims hide build-blocking unknowns.

**Critical-path dependency the plan understates: the authority/competence and consultation reference data.** Track D (Decision/appeal) cannot correctly gate `finalise` without (a) a competence matrix and (b) a consultation register — neither of which is a defined entity, so neither is in Track A's data model. As written, Track D will ship a finalise endpoint that *appears* to enforce due process but silently permits void orders. That is worse than a missing feature; it is a false safety signal. This must be pulled into the foundation (Track A) before any decision logic.

**The SLA/clock-pause is asserted but unspecified.** FR-016 mentions "paused clock during stays" and stage re-entry on remit, but there is no pause/resume ledger, no rule for *which* events pause *which* SLA, and no recomputation of `expected_closure_date` after condonation or de novo. Build this naively and every appealed/remitted case will show false breaches, destroying the dashboard's credibility on day one. Needs an explicit SLA-pause event model in Track G.

**Idempotency keys are required at the API but their lifecycle is undefined** — who mints them, how long they're retained, dedup window. Without that, the outbox "no duplicate effects" guarantee (the thing protecting payroll from double recovery) is unproven. Define a dedup store and TTL.

**Monday-morning step:** do *not* start with intake screens. Start by writing two reference tables and their seed data — `authority_competence` (cadre × penalty_class × empowered_authority_level) and a `procedure_template`/consultation config — and a single failing test: "a DISMISSAL finalised by a non-appointing authority returns `AUTHORITY_NOT_COMPETENT`." If that test can be made to pass, the spec's central legal promise is real. Everything else is plumbing around it.

---

## Part 2 — Anonymous Peer Review

*(Advisors anonymised A–E exactly as above. Each reviewer answers: strongest point & why; biggest blind spot; what ALL FIVE missed.)*

**Reviewer 1**
- *Strongest:* B (Contrarian). The authority-competence/Article 311(1) gap is the single highest-severity finding — it converts the spec's flagship claim ("legally defensible orders") into a false guarantee for exactly the gravest penalties. Concrete and verifiable.
- *Biggest blind spot:* A (Proponent) praises DI-3 as the due-process guarantee without noticing DI-3 checks *stage existence*, not *authority competence or mandatory consultation* — so A overstates how "bulletproof" the chain is.
- *All five missed:* No one addressed **proportionality of penalty** as a reviewable dimension. Orders are also quashed for penalty *shockingly disproportionate* to the misconduct (Wednesbury/*proportionality* review). Nothing records a proportionality rationale or flags outliers.

**Reviewer 2**
- *Strongest:* C (First Principles). Separating an invariant natural-justice kernel from a jurisdiction overlay is the only insight that resolves the global-vs-public-sector tension structurally rather than by piling on fields.
- *Biggest blind spot:* D (Outsider) wants a simpler fast lane but underestimates that even a "simple" censure can be appealed; simplification of the *UI* must not simplify the *audit chain*.
- *All five missed:* **Cross-module concurrency / transfer of jurisdiction.** If the charged officer is transferred (M05) or promoted mid-proceeding, *which* org_unit/DA is competent, and does the case follow? No one raised the employee-lifecycle race against an 18-month proceeding.

**Reviewer 3**
- *Strongest:* E (Executor). Identifying that Track D will ship a *false safety signal* (a finalise endpoint that looks compliant but isn't) is the most actionable build-risk; it reorders the plan.
- *Biggest blind spot:* B lists many statutory voids but doesn't prioritise; an implementer can't tell which one to fix first (it is competence — but B doesn't say so).
- *All five missed:* **Abatement and the deceased/retired employee order_type.** `order_type` has only PENALTY/EXONERATION/DROP_PROCEEDINGS; death-abates-proceedings is an edge-case note with no terminal state, leaving cases stuck.

**Reviewer 4**
- *Strongest:* B again — the notification-vs-legal-service conflation is a subtle, non-obvious, high-impact defect the author genuinely missed, and it taints *every* served artefact, not one screen.
- *Biggest blind spot:* A treats the append-only `audit_log` as sufficient for legal defensibility, but does not ask whether it is *cryptographically chained*; an append-only table an admin can still mutate at the DB layer is weaker evidence than a hash-chained ledger.
- *All five missed:* **POSH / sexual-harassment divergence.** Harassment is one enum value, but POSH-Act cases require an Internal Committee with mandated composition and timelines *replacing* the IO route. Treating it as ordinary misconduct is a compliance defect for a whole category.

**Reviewer 5**
- *Strongest:* C. The "suspension is a parallel status, not a stage" catch is small to state but exposes a real state-machine contradiction already visible in §12.1.
- *Biggest blind spot:* D frames density as a usability problem; the deeper issue C names is that the density is *un-parameterised*, so D's translation worry is actually C's overlay worry.
- *All five missed:* **Digital signing / DSC of orders.** Everyone said "signed PDF," nobody required a Digital Signature Certificate / eSign with timestamp and signatory identity binding — without which the "signed order" is not legally a signed order in a government context.

---

## Part 3 — Chairman Synthesis

### 3.1 Points of agreement (strong consensus)
1. The **due-process *sequence*** (DI-3, DI-4, disagreement memo, show-cause subset, evidence sealing, confidentiality, outbox propagation) is genuinely best-in-class and must be preserved intact.
2. **Authority competence (Article 311(1))** is the highest-severity omission — multiple reviewers independently elevated it. The spec's headline promise fails precisely for dismissals/removals.
3. **Mandatory external consultation (UPSC/CVC) and the lawful "dispense-with-inquiry" path** are both absent; both are order-voiding when mishandled.
4. The statutory regime is **hard-baked, not parameterised**, undermining the "global organisation" claim (C and D converge here).
5. **Suspension is mis-modelled as a linear stage** rather than a parallel interim status — an acknowledged internal contradiction.

### 3.2 Clashes
- **Simplify (D) vs. Rigour (A/B):** D wants a four-screen fast lane; A/B warn against thinning the audit chain. *Resolution:* simplify the **UI path** for minor/admitted/single-officer cases while keeping the **same** integrity rules and audit ledger underneath — UI altitude, not legal altitude.
- **One linear procedure (current spec / implicit A) vs. configurable template (C):** This is the one **fundamental** clash and is addressed in the focused second pass below.

### 3.3 Blind spots the whole council (initially) shared
- **Penalty proportionality** as a recorded, reviewable rationale (Reviewer 1).
- **Mid-proceeding employee-lifecycle races** — transfer/promotion/retirement changing competent authority (Reviewer 2).
- **Terminal states for abatement/deceased** (Reviewer 3).
- **Cryptographically chained audit ledger**, not merely "append-only" (Reviewer 4).
- **POSH/ICC divergence** for harassment (Reviewer 4).
- **DSC/eSign** legal signing of orders (Reviewer 5).

### 3.4 Idea evolution
The proposal moves from *"a correct linear due-process workflow for one civil-service regime"* to *"a configurable quasi-judicial case engine with an invariant natural-justice kernel, a jurisdiction overlay (competence + consultation + timelines + dispense-with-inquiry), multi-respondent proceedings, and legally-grade signing/service/audit."* The core is kept; the rigidity, the competence/consultation voids, and the service/signing weaknesses are repaired.

### 3.5 Focused second pass — the FUNDAMENTAL clash (linear procedure vs. configurable template)

The instinct to fully generalise into a rules-engine is a real over-engineering hazard (the global guidelines warn against speculative configurability). But a total hard-code fails the stated dual mandate. The synthesis is a **two-layer model**, which is *less* code than a sprawl of jurisdiction-specific `if` branches:

- **Invariant kernel (always enforced, not configurable):** notice of charge → genuine opportunity to defend → reasoned finding on evidence → penalty proportionate and not exceeding what was put to the person → independent appeal. These map to existing DI-3/DI-4 plus new proportionality and competence checks. Never parameterise these *away*.
- **Jurisdiction overlay (a `procedure_template` per case_type/jurisdiction, reference data):** required consultations and their sequence (UPSC/CVC/none/ICC), authority-competence matrix, statutory timelines and floors, dispense-with-inquiry conditions, valid service modes, appeal limitation. Seed the CCS(CCA) template as the default; a corporate template is just different reference data.

This resolves C↔current-spec without the rules-engine sprawl D fears: one engine, one kernel, swappable overlay. Recommendation: adopt the two-layer model but cap initial configurability at the overlay items the council named — do **not** build a generic BPM designer.

### 3.6 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|------|----------|----------------|------------|
| R1 | Order signed by authority not competent for that penalty class (Art. 311(1)) → void *ab initio* | Critical | B / E | Add `authority_competence` reference entity (cadre × penalty_class × authority level) + `AUTHORITY_NOT_COMPETENT` guard at finalise (new DI rule) |
| R2 | Final order without mandatory UPSC/CVC consultation → set aside | Critical | B | Add `case_consultations` entity + guard blocking finalise until required consultations recorded/closed per procedure_template |
| R3 | No lawful "dispense with inquiry" path (Art. 311(2) provisos: conviction / not practicable / security) | High | B | Add `inquiry_dispensation` (reason-coded, authority-recorded) state allowing penalty without inquiry under guarded conditions |
| R4 | Right to inspect listed documents/witnesses not recorded → natural-justice breach | High | B | Add document/witness list-supplied + inspection-afforded events (FR-007) as a defence-stage gate |
| R5 | Email/notification treated as legal service of charge-sheet/order | High | B | Separate `legal_service` record from informational `notifications`; restrict valid `service_mode` per procedure_template; flag EMAIL as non-statutory by default |
| R6 | Subsistence paid without non-employment certificate; 90-day review has no consequence | High | B | Add `non_employment_certificate` gate to subsistence payment; add deemed-review/auto-flag when charge-memo not served within statutory window |
| R7 | Single-delinquent model cannot run common/joint proceedings | High | C | Introduce `case_respondents` (1..N charged officers per proceeding) sharing inquiry/evidence; or documented decision to keep 1:1 with linkage |
| R8 | Statutory regime hard-baked; fails global-org configurability mandate | High | C / D | Two-layer model: invariant kernel + `procedure_template` overlay (consultations, competence, timelines, service modes, limitation) |
| R9 | Suspension modelled as linear stage yet declared parallel → state bugs | Medium | C | Model suspension as parallel interim status flag on case, not a `case_stage`; correct §12.1 |
| R10 | SLA pause/resume on stay/remit/condonation unspecified → false breaches | Medium | E | Add explicit `sla_pause_events` ledger + recompute `expected_closure_date` on de novo/condonation/stay |
| R11 | Idempotency-key lifecycle undefined → outbox dedup unproven (double recovery risk) | Medium | E | Define idempotency store, mint rules, dedup window/TTL; test double-finalise + double post-to-SR |
| R12 | No penalty-proportionality rationale / outlier flag | Medium | Reviewer 1 | Require `proportionality_reasoning` on order; analytics flag penalty-vs-misconduct outliers |
| R13 | Mid-proceeding transfer/promotion/retirement changes competent authority; no handling | Medium | Reviewer 2 | Add case-jurisdiction transfer event; re-resolve competent DA; freeze promotion via sealed-cover; Rule 9 four-year-bar + sanction guard for retirees |
| R14 | No terminal state for abatement (deceased) | Low/Med | Reviewer 3 | Add `order_type=ABATED` + case_status `ABATED`; auto-stop SLAs and downstream effects |
| R15 | Audit "append-only" not cryptographically tamper-evident | Medium | Reviewer 4 | Hash-chain `audit_log`/timeline (prev-hash linkage) for court-grade evidence |
| R16 | POSH/sexual-harassment cases routed through ordinary IO, not ICC | High | Reviewer 4 | Add ICC-procedure template for HARASSMENT (committee composition, timelines) feeding the penalty stage |
| R17 | "Signed PDF" without DSC/eSign + timestamp + signatory binding | Medium | Reviewer 5 | Mandate DSC/eSign on charge-sheet, orders, inquiry report; store signatory identity + timestamp |
| R18 | Departmental inquiry not stayable pending parallel criminal trial on same facts | Medium | B / C | Add inquiry `STAYED` sub-state with reason + SLA pause when `criminal_case_ref` active |
| R19 | Charged-officer portal lists documents but not rights/deadlines/entitlements | Low | D | Add rights-and-deadlines panel (defence assistant, inspection, personal hearing, appeal limitation) to portal |
| R20 | Recovery-penalty caps (≤1/3 pay, instalments, not beyond retirement except DCRG) unvalidated | Medium | B | Add recovery-cap validation rules on `penalty_items` |

### 3.7 Recommendation

**Conditional GO — strong core, fix the legality layer before build.** The natural-justice *sequence* is best-in-class and should be frozen. But the BRD's flagship claim ("legally defensible orders that withstand judicial review") is currently *false for the gravest penalties* because authority competence, mandatory consultation, dispense-with-inquiry, document-inspection, and legal-service-vs-notification are unmodelled. These are not enhancements; they are the difference between a defensible order and a void one. Adopt the two-layer (kernel + overlay) model to satisfy the global-org mandate without a rules-engine sprawl, and add the multi-respondent, POSH, signing, and SLA-pause items. Do **not** expand into a generic BPM designer — cap configurability at the named overlay items.

### 3.8 The One Thing To Do First

Build the **`authority_competence` reference entity and its finalise-time guard**, seeded for the default jurisdiction, and prove it with one failing-then-passing test: *a `DISMISSAL` finalised by an authority subordinate to the appointing authority must return `AUTHORITY_NOT_COMPETENT` and be impossible to persist.* This is the highest-severity, most concrete, and most foundational gap (R1); it also forces the competence/consultation reference data into Track A where every downstream decision guard depends on it. Until that test passes, the spec's central legal promise is unproven.

---

## Adopted Improvements for BRD v2

1. **Add `authority_competence` reference entity** (cadre/level × `penalty_class` × empowered authority level) and a new integrity rule **DI-13: penalty competence** — finalising any `penalty_items` row requires the `passed_by` authority to be competent for that penalty class; otherwise return new error `AUTHORITY_NOT_COMPETENT` (409). Enforces Article 311(1). *(R1)*
2. **Add `case_consultations` entity** (consultation_type ∈ UPSC / CVC_FIRST_STAGE / CVC_SECOND_STAGE / ICC / LEGAL / NONE; status; advice_document_id; received_date) and **DI-14**: finalise is blocked until every consultation required by the case's `procedure_template` is recorded and closed. New error `CONSULTATION_PENDING`. *(R2)*
3. **Add a lawful "dispense-with-inquiry" path** — entity/state `inquiry_dispensation` with reason code (CRIMINAL_CONVICTION / NOT_REASONABLY_PRACTICABLE / SECURITY_OF_STATE), recorded authority and reasons; permits a guarded penalty order without a full inquiry, satisfying DI-3's major-penalty branch via this documented exception. *(R3)*
4. **Add the document/witness-list + inspection right** to FR-007: a charged officer must be supplied a list of relied-upon documents/witnesses and afforded inspection; record `list_supplied_date` and `inspection_afforded_date`; the inquiry cannot proceed to evidence without them (new guard). *(R4)*
5. **Separate legal service from notification.** Introduce a `legal_service` record (mode, date, proof_document_id, served_by) distinct from the informational `notifications` ledger; restrict statutorily-valid `service_mode` values per `procedure_template`; mark `EMAIL` as non-statutory service by default. *(R5)*
6. **Subsistence correctness:** add `non_employment_certificate_received` (BOOLEAN + date) as a precondition for subsistence payment events to M10; add automatic flag/escalation and a `deemed_review` when a charge-memo is not served within the statutory suspension-review window (Ajay Kumar Choudhary 90-day rule). *(R6)*
7. **Support common/joint proceedings:** introduce `case_respondents` (1..N charged officers per proceeding) so one inquiry, witness set, exhibit set, and order can cover co-delinquents with article-wise per-respondent findings — or, if 1:1 is retained, add explicit `related_case_id` linkage and consistency checks. *(R7)*
8. **Adopt the two-layer procedure model:** add a `procedure_template` reference entity (per case_type/jurisdiction) carrying required consultations, competence matrix reference, statutory timelines/floors, valid service modes, appeal limitation, and dispense-with-inquiry conditions; keep the natural-justice kernel (DI-3/DI-4/proportionality/competence) invariant and non-configurable. Seed CCS(CCA) as default; corporate regimes become alternate templates. *(R8)*
9. **Fix the suspension ontology:** model suspension as a **parallel interim status** (boolean/status on the case + the `suspensions` entity) rather than a linear `case_stage`; remove `SUSPENSION` from the linear stage sequence in §12.1 and represent it as an orthogonal track. *(R9)*
10. **Add an SLA pause/resume model:** new `sla_pause_events` (reason ∈ STAY / REMIT / CONDONATION / CONSULTATION / CRIMINAL_STAY; from/to) and recomputation of `expected_closure_date` and `sla_target_at` on de novo, condonation, and stays — preventing false breach reporting. *(R10)*
11. **Define idempotency-key lifecycle:** specify minting (client vs server), a dedup store, and a retention/TTL window for `Idempotency-Key` on suspension, finalise, and post-to-SR; add tests for double-finalise and double post-to-SR producing exactly one effect. *(R11)*
12. **Require penalty proportionality rationale:** add `proportionality_reasoning` (TEXT, mandatory) to `penalty_orders` and an analytics outlier flag (penalty severity vs misconduct_category/precedent) in FR-016, supporting proportionality/Wednesbury review. *(R12)*
13. **Handle mid-proceeding jurisdiction changes:** add a case-jurisdiction-transfer event that re-resolves the competent DA when the charged officer is transferred/promoted (M05/M06); add a **sealed-cover** mechanism to freeze promotion recommendations while proceedings are pending; add a Rule 9 **four-year time-bar** guard and required government/President sanction for proceedings against retired employees. *(R13)*
14. **Add abatement terminal handling:** extend `order_type` with `ABATED` and `case_status` with `ABATED`; on charged-officer death, auto-close the case, stop SLAs, and suppress downstream penalty effects. *(R14)*
15. **Make the audit ledger court-grade:** hash-chain `audit_log` and `case_timeline_events` (each row stores the prior row's hash) so tamper-evidence is cryptographic, not merely "append-only by policy"; expose a verify endpoint. *(R15)*
16. **Add a POSH/ICC procedure template** for `misconduct_category=HARASSMENT`: model an Internal Committee (composition, presiding officer, external member, timelines) whose report feeds the penalty stage in place of the ordinary IO route, satisfying POSH Act 2013. *(R16)*
17. **Mandate digital signing:** require DSC/eSign with trusted timestamp and bound signatory identity on charge-sheets, inquiry reports, show-cause notices, and orders; store signature metadata on `case_documents`/order records (not merely "signed PDF"). *(R17)*
18. **Add an inquiry `STAYED` sub-state** with reason and automatic SLA pause when a parallel criminal trial on the same facts is active (`criminal_case_ref` set), preventing prejudice and false SLA breaches. *(R18)*
19. **Upgrade the Charged-Officer Portal** to a rights-and-deadlines surface: surface entitlements (defence assistant, document inspection, personal hearing, appeal limitation countdown) and statutory deadlines, not just a served-document list. *(R19)*
20. **Validate recovery-penalty caps:** add rules on `penalty_items` for RECOVERY/FINE — instalment limits, ceiling relative to pay (e.g. ≤1/3), and no recovery beyond retirement except from DCRG — surfaced as validation before downstream emit. *(R20)*
21. **Add a personal-hearing record** (entity or sub-record) for show-cause and appeal stages, since the right to a personal hearing is referenced as an edge case but not modelled, and its denial is challengeable.
22. **Add a fast-lane UI path** for minor-track / admitted / single-respondent cases (≈4 screens) that reuses the *same* integrity rules and audit chain — simplifying the common case without thinning legal defensibility (resolves the simplify-vs-rigour clash at UI altitude only).
23. **Block DA-as-complainant/witness bias:** extend DI-2 so the Disciplinary Authority cannot also be the complainant or a witness on the same case (nemo judex in causa sua), not only that the charged officer cannot be IO/PO/DA.
24. **Disclose adverse PI material when relied upon:** clarify that while the preliminary-inquiry report is normally not served, any PI material *relied upon as evidence* in the inquiry must be disclosed to the charged officer, with a served/relied-upon flag — closing a subtle natural-justice gap in DI-9/§3.3.
