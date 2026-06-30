# Adversarial Idea Evaluator — Council Report

## Subject
**BRD under review:** `docs/brd/v1/M08-performance-appraisal-management.md` (M08-PAM, v1.0)
**Shared context:** `docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Performance Appraisal Management BRD complete, correct, and world-class (goal-setting/OKR, APAR multi-tier workflow, ratings, calibration, representation against adverse remarks, feeds to promotion) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → adopted improvements.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is a genuinely strong BRD and, on most axes, ahead of a default Workday/SuccessFactors statutory implementation. Three things deserve credit.

First, **confidentiality by construction.** The tier-aware, server-side field projection (FR-M08-15, Appendix B) is the correct architecture — most government HRMS builds leak APAR content by hiding fields only in the UI. Returning fields as *absent* (not greyed) for unauthorised tiers, plus appending `ACCESS_DENIED` to an append-only `apar_disclosure_log`, is exactly how you survive an audit and a confidentiality-breach inquiry.

Second, **statutory integrity is modelled, not bolted on.** Append-only certification, `pre_calibration_grade` provenance, immutability after FINALISED except through a controlled representation/expunction path, idempotent outbox posting to M12 with corrective-event semantics (FR-M08-14 BR2) rather than destructive edits — this respects that a Service Register entry is a legal record. The separation-of-duties rule (appraisee ∉ {RO, RvO, AA}, all four distinct, enforced at the API layer) is correctly placed below the UI.

Third, **it unifies the two worlds the brief demanded.** Continuous feedback, check-ins, 360, OKR cascading and calibration sit alongside the three-tier APAR, integrity column, pen-picture, disclosure and representation. The grade roll-up is a single pure function reused by RO/RvO/AA (FR-M08-07 AC5) — that kills the classic defect where each tier computes the overall grade differently.

The traceability matrix, state tables, error catalog with module-specific codes, and the parallel-agent wave plan make this buildable by a fleet without drift. The "0 unresolved gaps" reconciliation is earned for the scope it set itself. My only caution to fellow advisors: do not mistake *more statutory edge-cases* for *the BRD being wrong* — the spine is sound; what follows is hardening, not rescue.

### Advisor 2 — The Contrarian

The spine is sound, which is why the failure modes that remain are the dangerous, non-obvious kind. Five.

**1. The calibration committee silently overrides the Accepting Authority — and that may be ultra vires.** In FR-M08-09, certified forms enter calibration and a committee *applies* a new `final_grade` after the AA has already certified. In a statutory APAR, the Accepting Authority is the final grading authority by service rule. A moderation committee mutating a certified grade is a legal authority problem, not a math problem: the officer can challenge "who downgraded me, under what power?" Calibration must be a *recommendation the competent authority ratifies*, or must run *before* certification. As written, this is the single biggest litigation exposure in the document, and the author treats it as a routine workflow.

**2. Forced distribution / bell-curve against an absolute statutory scale is gameable and possibly unlawful.** APAR grading is absolute (an officer earns "Outstanding" on merit), not relative. `FORCED_DISTRIBUTION` with a `target_distribution` invites ROs and committees to grade to the curve — the exact bias the analytics claim to detect. Government grading jurisprudence frowns on quota-driven downgrades.

**3. The author missed the Sealed Cover Procedure.** When an officer is under charge/disciplinary proceeding (M09) or whose promotion is sub judice, their APAR finalisation and the eligibility feed to M06 must be kept in a *sealed cover* and not acted upon until the proceeding concludes. The BRD has only a vague `hold` flag (FR-M08-01 BR4) and otherwise feeds M06 freely. This is a hard public-sector requirement and its absence will produce wrong promotion decisions.

**4. Multi-RO part-period reports don't exist.** The data model assumes one RO per form (`reporting_officer_id` singular). In reality an officer often has 2–3 ROs in a year; each writes a part-period report, and a "No Report Certificate" is issued where supervision was under the minimum period (typically 3 months). The whole model cannot represent this.

**5. Adverse remark built on anonymous 360.** 360 is "evidence in RO assessment" (FR-M08-11 AC4). If an adverse/below-benchmark remark rests on anonymous peer feedback the officer can never see or rebut, the representation is decided on undisclosed material — a natural-justice defect that gets the whole APAR set aside.

### Advisor 3 — The First Principles Thinker

Strip the document to its load-bearing assumption: **that one artefact — the `appraisal_forms` row — can be simultaneously a continuous-performance container and a statutory adjudicated record.** These two have opposite physics.

Continuous performance management is *open, fluid, employee-owned, cross-cycle*: objectives outlive a year, feedback flows freely, the point is development. The APAR is *closed, adjudicated, hierarchy-owned, confidential, append-only*: the point is a defensible legal grade with due process. The BRD bolts them to the same spine, and the seams show. `goals` carry `form_id NOT NULL` (E5) — so an objective cannot exist without an appraisal form, which means OKRs cannot span cycles or precede a cycle. That is continuous PM defeated by statutory data modelling. The right primitive is a goal/objective that lives at *employee × period* and is *snapshotted into* the form at lock — the form references goals, it doesn't own them.

The second hidden assumption is that **calibration is a stage of the form's life rather than a separate adjudicative act.** Putting CALIBRATION between AA_ACCEPTANCE and DISCLOSURE in one linear state machine is what creates Advisor 2's authority problem. First-principles, calibration is a *recommendation engine* whose output is an input to a grading authority — not a state the legal record passes through and emerges re-graded.

Third: the document frames "disclosure" as configurable for favourable APARs (FR-M08-08 BR1: "favourable APARs disclosed per cycle config"). The first principle of modern APAR jurisprudence is the opposite — *the entire report, including every grading, must be communicated to every officer.* Optionality here isn't flexibility; it's a latent non-compliance switch.

The framing question pairs "OKR" and "APAR" as if they compose. They *coexist* but must not *fuse*. The cleanest version of this module has two clearly separated subsystems sharing identity and analytics, with a one-way snapshot bridge. The current design fuses them and will pay for it at every adverse-remark dispute and every "why is my OKR locked to last year's form" complaint.

### Advisor 4 — The Outsider

I read this as someone who has to *operate* it, not architect it, and three things would stop me cold.

**The acronym fog is real.** RO, RvO, AA, APAR, KRA, KPI, OKR, PIP, 360, SR, DPC, benchmark, adverse, expunction, calibration, pen-picture, integrity column — a reporting officer in a district office has to know *which of three near-identical "officer" roles they are* and that they are blocked from acting if they are "any other tier in the same chain." The glossary helps, but the *workbench* must show each user, in plain language, "You are the Reviewing Officer for this report. You may agree or change the grade with a reason." There is no plain-language role-context requirement anywhere in Section 7.

**"Tier-aware field-level projection with lowest-privilege wins for multi-role callers" is correct and completely invisible to the person it protects.** A custodian who is also someone's RO will see different fields on different screens with no explanation. The BRD never requires the UI to *tell the user why content is absent* ("hidden until disclosure," "not visible to your tier"). Absent-not-greyed is good security and terrible UX unless paired with an honest reason banner.

**Hidden complexity the spec waves past:** "RvO == RO → require alternate (escalation, not silent collapse)" (FR-M08-05 BR3) and "apex officer chain truncates" — for a Secretary-level officer there may be *no* Reviewing or Accepting Authority above them. The rule "all four distinct" then *cannot be satisfied*, and the BRD has no answer. Operationally that means the most senior, most scrutinised officers can't be appraised by the system on day one.

Also: the officer who never clicks "acknowledge." The spec says "deemed-disclosed after a configured period." But a real human will say "I never saw it, so my appeal clock never started." The BRD doesn't say whether the representation window runs from *dispatch* or from *acknowledgement* — and that ambiguity is the first thing a grievance will exploit.

### Advisor 5 — The Executor

Feasibility-wise this is 18 entities, 16 FRs, five state machines, an outbox, a tier-projection library, a grade engine, and live integrations to M01/M05/M06/M07/M09/M12/M13/M14. That is a year of work for a strong squad, and the wave plan (Section 14.3) is mostly right but front-loads risk badly.

**Sequencing problem:** the wave plan builds calibration (W5) and 360/continuous (W2–W3) before it has proven the statutory core end-to-end. The thing that *must* work on day one for a government customer is: configure cycle → goals → self → RO/RvO/AA → disclose → represent → post to SR. Continuous feedback, 360, forced distribution and even calibration are *Phase 2* differentiators. I would feature-flag them (the BRD already lists feature flags in 13.4 — good) and cut them from the first cycle so the pilot department in 13.3 exercises the legally-required path under real deadlines.

**Monday step:** lock the grade-derivation contract and the tier-projection contract as standalone libraries with their own test suites *before any FR agent starts* — Section 14.3 says this but it must be a hard gate, because every assessment FR and the analytics FR depend on them; drift here corrupts everything.

**Dependency landmines I'd raise now:**
- M09 (disciplinary) is listed as a read boundary but the *sealed-cover* behaviour it implies (Advisor 2) is unspecified — that's a blocking integration, not a nice-to-have.
- M06 eligibility feed format is an upsert "by cycle"; the corrective-event path on post-representation grade change is described but the *contract M06 must honour* (re-open a DPC?) is out of scope here and undefined — cross-module risk.
- Bulk materialise "10k forms < 2 min async" and calibration over "≥5k forms" need the outbox and the projection guard to be performant on *every read*; tier projection on every field of every APAR at 200k scale is a real latency risk against the P95 < 500ms NFR.

**Estimate reality:** statutory core ~4 months; calibration done *correctly* (as ratified recommendation) +6 weeks; continuous/360 +6–8 weeks; analytics +4 weeks. Don't promise all of it for cycle one.

---

## 2. Anonymous Peer Review

*(Advisors anonymised A–E; mapping withheld. Each answers: strongest point & why; biggest blind spot; what ALL FIVE missed.)*

**Reviewer A**
- *Strongest:* The calibration-overrides-AA authority argument. It reframes a "workflow stage" as a *legal-power* defect, which is the kind of finding that changes the design rather than patching it. Highest leverage in the room.
- *Biggest blind spot (in another voice):* The Proponent treats "0 unresolved gaps" as substantive; it only means "0 gaps against the scope the BRD set itself." That's circular and lulls the reader.
- *All five missed:* **Bias-disparity analytics by protected attribute.** Everyone discussed rating bias as statistical skew per RO; nobody required adverse-rate / low-grade disparity analysis by gender/cadre/region (DPDP-safe aggregates). World-class HCM ships this; it's also the government's own equity obligation.

**Reviewer B**
- *Strongest:* The first-principles "two subsystems fused on one row" insight, with the concrete `goals.form_id NOT NULL` evidence. It explains *multiple* downstream symptoms from one root cause — the mark of a real diagnosis.
- *Biggest blind spot:* The Executor's "cut calibration to Phase 2" understates that calibration is partly *why* government buys this over paper. Cut *forced distribution* and *bell-curve*, keep *committee normalisation* as ratified recommendation — don't cut the whole capability.
- *All five missed:* **Digital signature / non-repudiation.** MFA step-up authenticates the session; it does not produce a legally-binding signed record. Statutory APARs need DSC/eSign per officer per tier. Nobody named it.

**Reviewer C**
- *Strongest:* The Outsider's "deemed-disclosure clock ambiguity." It's small but it's the exact crack litigation widens, and it's trivially fixable in spec — high return.
- *Biggest blind spot:* The Contrarian's multi-RO point is correct but undersized — it's not a field, it's a *structural* remodel (report-periods entity, partial weights, "No Report" certificate, grade aggregation across periods). Costed as a tweak, it will blow the estimate.
- *All five missed:* **Tamper-evidence is asserted, not engineered.** The BRD says `apar_disclosure_log` is "tamper-evident" (FR-M08-15 BR3) with no mechanism — no hash-chaining, no WORM, no external anchor. An auditor will ask "prove it wasn't altered," and "it's append-only in Postgres" is not an answer.

**Reviewer D**
- *Strongest:* The Proponent's recognition that the single shared roll-up function eliminates cross-tier grade drift. It's easy to overlook a thing that's *right*, and this one prevents a whole defect class.
- *Biggest blind spot:* The Outsider focuses on acronym UX but misses that the *role-context* problem is also a *security* problem: users who don't understand their tier will over-share APAR content through legitimate channels (email the PDF). Plain-language role context is a leak-prevention control, not just polish.
- *All five missed:* **Auto-escalation on tier default.** Public-sector rule: if an RO/RvO/AA fails to record within the window, the report is written/escalated by the next higher authority (or a "No Report due to RO" is recorded). The BRD has SLA reminders but no *automatic transfer of authoring right* on default — cycles will stall on a single non-responsive officer.

**Reviewer E**
- *Strongest:* The Contrarian's sealed-cover finding. It's a named statutory procedure with direct, wrong-outcome consequences (improper promotion), and it's simply absent. Concrete and severe.
- *Biggest blind spot:* The First-Principles "decouple goals from form" is architecturally right but risks over-correction — for the *statutory* report you still need an immutable goal snapshot at lock; the decoupling must be snapshot-on-lock, not live-reference, or you reintroduce mutability into the legal record.
- *All five missed:* **Right-of-deceased/transferred custody and retention-vs-erasure conflict.** Nobody addressed legal-heir/nominee access on death, or that statutory retention overrides the DPDP erasure right — both must be stated, or the module is caught between two laws.

---

## 3. Chairman Synthesis

### 3.1 Agreements (high consensus)
- The **architecture and statutory spine are strong** — confidentiality projection, append-only ledgers, separation of duties, outbox posting, single grade engine. This is hardening, not rescue.
- **Calibration as currently placed is the top risk** (3 of 5 advisors independently; reinforced in peer review): a committee mutating an AA-certified grade is a legal-authority defect, and forced distribution against an absolute scale compounds it.
- **The module fuses two systems that should be separated and bridged by snapshot** (continuous PM ↔ statutory APAR); the `goals.form_id NOT NULL` coupling is the concrete symptom.
- **Several named statutory procedures are simply absent:** sealed cover, multi-RO part-period reports / "No Report Certificate," auto-escalation on tier default, mandatory full disclosure, digital signature.
- **Scope should be phased**: statutory core first; continuous/360/forced-distribution behind flags.

### 3.2 Clashes
- **C1 (FUNDAMENTAL): Cut calibration vs. keep calibration.** The Executor wants it in Phase 2; Reviewer B warns it's a core buying reason. → Resolved in second pass (3.5).
- **C2: Decouple goals from the form.** First-Principles wants employee×period goals; Reviewer E warns this must not reintroduce mutability into the legal record. → Resolved: decouple ownership, but **snapshot-on-lock** an immutable copy into the form.
- **C3: How much statutory edge-casing is "world-class" vs "gold-plating"?** Proponent cautions against treating every edge case as a defect; Contrarian/Reviewers treat sealed-cover and multi-RO as mandatory. → Resolved: sealed-cover, multi-RO, full-disclosure, auto-escalation are **mandatory** (wrong-outcome / compliance failures); apex-chain and legal-heir are **required but configurable**; forced distribution is **removable**.

### 3.3 Blind spots the whole council shares (from peer review)
- Bias-disparity analytics by protected attribute (equity obligation + best-in-class).
- Digital signature / non-repudiation (DSC/eSign) distinct from MFA.
- Tamper-evidence engineered (hash-chain/WORM), not asserted.
- Auto-escalation transfer of authoring right on tier default.
- Deceased/heir custody + retention-vs-DPDP-erasure legal basis.

### 3.4 Idea evolution
The BRD started as "a unified continuous + statutory appraisal module with a linear state machine through calibration." It should evolve into: **two clearly separated subsystems** (continuous performance; statutory APAR) sharing identity, analytics, and a *snapshot-on-lock* bridge; with **calibration repositioned as a ratified recommendation** feeding the grading authority rather than a state the legal record passes through; **statutory procedures (sealed cover, multi-RO part-periods, auto-escalation, full disclosure, DSC) added as first-class**; and **forced ranking removed** in favour of committee normalisation. Phase 1 ships the statutory core; continuous/360 follow behind flags.

### 3.5 Focused second pass on the FUNDAMENTAL clash (C1: calibration)
The clash dissolves once "calibration" is split into two questions the BRD currently conflates:
1. **Authority** — *who may change a certified grade?* Only a competent grading authority, never a committee acting on its own. → Calibration produces `calibration_recommendations`; the AA (or designated competent authority) **ratifies** before any grade changes; if calibration runs *before* AA certification, the AA simply certifies the calibrated value. Either way the legal mutation is always an authority's act, logged with step-up + DSC.
2. **Method** — *relative or absolute?* Statutory grading is absolute. → Keep `COMMITTEE_REVIEW` and `NORMALISATION` (surfacing comparability and outliers for the authority to consider); **remove/disable `FORCED_DISTRIBUTION` and default-off `BELL_CURVE`**; treat target distributions as *diagnostic*, never as an enforced quota.

This satisfies the Executor (calibration can ship, scoped and safe), Reviewer B (the capability survives), and the Contrarian/First-Principles (no ultra-vires grade change, no unlawful forced ranking). **Adopt.**

### 3.6 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Calibration committee mutates AA-certified grade without competent authority — ultra vires; adverse-remark litigation | Critical | Contrarian / First-Principles | Reposition as ratified recommendation; AA/competent authority ratifies with step-up + DSC; or calibrate pre-certification |
| R2 | Forced distribution / bell-curve against absolute statutory scale — gaming + unlawful quota downgrades | High | Contrarian | Remove `FORCED_DISTRIBUTION`; default-off `BELL_CURVE`; target distributions diagnostic-only |
| R3 | Sealed Cover Procedure absent — APARs finalised / eligibility fed to M06 for officers under charge → wrong promotions | Critical | Contrarian / Reviewer E | New sealed-cover state + M09 integration; block finalise/feed until proceeding concludes |
| R4 | Multi-RO part-period reports & "No Report Certificate" unmodelled — cannot represent reality of officer with 2–3 ROs/year | High | Contrarian / Reviewer C | Report-period sub-entity; per-period RO/grade; min-supervision rule; aggregate to final grade |
| R5 | Adverse remark resting on anonymous 360 / undisclosed evidence — natural-justice defect sets APAR aside | High | Contrarian | Adverse/below-benchmark entries must cite disclosable evidence; anonymous 360 cannot be sole basis |
| R6 | Goals coupled to single form (`form_id NOT NULL`) — defeats continuous/cross-cycle PM; mutability risk if loosened naively | High | First-Principles / Reviewer E | Employee×period goal ownership; immutable snapshot-on-lock into form |
| R7 | Disclosure optional for favourable APARs — non-compliance with full-disclosure jurisprudence | High | First-Principles | Mandatory full-APAR disclosure; remove configurability of favourable non-disclosure |
| R8 | Deemed-disclosure clock ambiguity (dispatch vs acknowledgement) — representation timing disputes | Medium | Outsider / Reviewer C | Define clock start explicitly; deemed-disclosure still opens window; record dispatch + (optional) ack timestamps |
| R9 | Auto-escalation on tier default missing — single non-responsive officer stalls cycle | High | Reviewer D | SLA engine transfers authoring right to next higher authority / records "No Report due to RO" |
| R10 | No digital signature / non-repudiation — MFA ≠ legally signed record | High | Reviewer B | DSC/eSign per tier on certify, disclosure ack, expunction |
| R11 | Tamper-evidence asserted, not engineered | Medium | Reviewer C | Hash-chained append-only log + WORM/external anchor; verification endpoint |
| R12 | Apex-officer chain truncation — "all four distinct" unsatisfiable for top officers | Medium | Outsider | Config rule for truncated chains (designated reviewing/accepting tiers, or recorded single-tier) |
| R13 | Bias-disparity by protected attribute not analysed (equity obligation) | Medium | Reviewer A | Add DPDP-safe disparity analytics (adverse-rate by gender/cadre/region, min-N suppressed) |
| R14 | Tier-projection on every field at 200k scale vs P95 < 500ms | Medium | Executor | Projection caching, column-level pre-computation, load-test gate before GA |
| R15 | Deceased/heir custody + retention-vs-DPDP-erasure conflict unresolved | Medium | Reviewer E | Legal-heir/nominee access path; state statutory-retention-overrides-erasure legal basis |
| R16 | Over-scope: continuous/360/calibration shipped with statutory core → pilot risk | Medium | Executor | Feature-flag and phase; pilot the statutory path first |
| R17 | Role-context invisible to users → mis-sharing of confidential content | Medium | Outsider / Reviewer D | Plain-language tier banner + "why hidden" reason; treat as leak-prevention control |
| R18 | Cycle errata: config error (e.g., wrong threshold) mid-cycle forces every case through representation | Low | Contrarian | Controlled cycle-correction/re-derivation workflow with audit |

### 3.7 Recommendation
**Adopt with mandatory revisions before build.** The BRD is fundamentally sound and clearly above a default statutory implementation, but it must not be built as-is on three points that produce wrong legal outcomes or litigation: (R1) calibration authority, (R3) sealed cover, and (R7) full disclosure — these are blocking. (R2, R4, R5, R6, R9, R10) are required for "world-class + statutory." The remainder are hardening that should be scheduled, not skipped. Phase the build: statutory core first, differentiators behind flags.

### 3.8 The One Thing To Do First
**Re-architect calibration as a ratified recommendation and split the form's grade authority from the moderation act** — i.e., resolve R1 in the data model and state machine now (new `calibration_recommendations`, AA/competent-authority ratification with step-up + DSC, remove forced ranking). It is the highest-severity, highest-litigation, hardest-to-retrofit defect, and fixing it first also forces the cleaner first-principles separation (R6) and the digital-signature control (R10) into the design while they are still cheap.

---

## Adopted Improvements for BRD v2

1. **Reposition calibration as a ratified recommendation.** Add entity `calibration_recommendations` (proposed grade + rationale + committee vote) distinct from any applied grade; a certified `final_grade` may change only by the AA/competent authority ratifying with MFA step-up **and** digital signature, or by running calibration *before* AA certification. No committee may mutate a certified grade autonomously. (R1)
2. **Remove `FORCED_DISTRIBUTION`; default-off `BELL_CURVE`.** Keep `COMMITTEE_REVIEW` and `NORMALISATION`; make `target_distribution` diagnostic-only (never an enforced quota); state explicitly that statutory grading is absolute, not relative. (R2)
3. **Add the Sealed Cover Procedure.** New form state `SEALED_COVER` and a `sealed_cover` flag driven by M09 disciplinary/charge status; while sealed, block finalisation and **suppress the M06 eligibility feed**; on proceeding conclusion, release or act per outcome. Codify in the state machine and the M09 boundary contract. (R3)
4. **Model multi-RO part-period reports.** New sub-entity `appraisal_report_periods` (period dates, RO, part-period grade/remarks, supervision-months); add a minimum-supervision rule and a **"No Report Certificate"** path when supervision < threshold; define how part-period grades aggregate to the form's provisional grade. Make `reporting_officer_id` resolve through periods rather than a single column. (R4)
5. **Natural-justice guard on adverse remarks.** Business rule: an adverse or below-benchmark remark must be substantiated by **disclosable** evidence; anonymous 360 or visibility-restricted continuous feedback **cannot be the sole basis** of an adverse entry. (R5)
6. **Decouple goals/OKRs from the form; snapshot on lock.** Own goals at `employee × cycle/period` (allow cross-cycle objectives, parentless drafting before a form exists); on goal-lock, write an **immutable snapshot** into the form so the statutory record stays append-only. Relax `goals.form_id` to nullable with a `form_goal_snapshots` link. (R6)
7. **Mandatory full-APAR disclosure.** Remove the "favourable APARs disclosed per cycle config" optionality (FR-M08-08 BR1); the **entire** report including every grading is disclosed to every officer; only the *channel/timing* is configurable, never *whether*. (R7)
8. **Clarify the disclosure/representation clock.** Define explicitly whether the statutory representation window runs from **dispatch** or **acknowledgement**; record both `disclosed_at` and `acknowledged_at`; confirm deemed-disclosure (non-acknowledgement after configured period) still opens the representation window, with the chosen clock-start documented per jurisdiction. (R8)
9. **Auto-escalation on tier default.** Extend the SLA engine so that if an RO/RvO/AA misses the statutory window, authoring right transfers to the next higher authority (or a "No Report due to RO/RvO" is recorded) — not just a reminder. Add to the form state machine and notifications. (R9)
10. **Digital signature / non-repudiation.** Require DSC/eSign (distinct from MFA step-up) on RO/RvO/AA certification, disclosure acknowledgement, calibration ratification, and expunction; store signature metadata on `appraisal_assessments` / `apar_disclosure_log`. (R10)
11. **Engineer tamper-evidence.** Specify hash-chaining of `apar_disclosure_log` (and SR events) with periodic external anchoring and a verification endpoint; replace the bare "tamper-evident" assertion in FR-M08-15 BR3. (R11)
12. **Apex-officer chain handling.** Add an explicit, configurable rule for truncated chains (top-of-hierarchy officers with no RvO/AA): designated alternate tiers or a recorded single-tier appraisal — never a silent failure of "all four distinct." (R12)
13. **Bias-disparity analytics.** Add to FR-M08-16 a DPDP-safe disparity view: adverse-rate, below-benchmark-rate and grade-mean by gender/cadre/region/RO over time (min-N suppressed), and a rater-leniency/central-tendency model across cycles — not just single-cycle skew. (R13)
14. **Tier-projection performance gate.** Add NFR + load-test acceptance: tier-aware field projection must hold P95 < 500ms at 200k employees via projection caching / column pre-computation; make this a GA gate. (R14)
15. **Deceased/heir custody and retention-vs-erasure.** Add a legal-heir/nominee access path on death/retirement and a stated legal basis that statutory retention overrides the DPDP erasure right; cover in FR-M08-15. (R15)
16. **Phase the scope.** Mark continuous feedback (FR-10), 360 (FR-11), and calibration (FR-09, scoped per #1–2) as feature-flagged Phase-2 differentiators; Phase-1 GA is the statutory core (cycle → goals → self → RO/RvO/AA → disclose → represent → post to SR). Update Section 14.3 waves and 13.3 pilot accordingly. (R16)
17. **Plain-language role context + "why hidden" reasons.** Require the assessment workbench to state each user's tier in plain language and to show a reason banner where confidential fields are absent ("hidden until disclosure," "not visible to your tier"); treat as a confidentiality leak-prevention control in Section 7. (R17)
18. **Cycle errata workflow.** Add a controlled cycle-correction/re-derivation path for configuration errors discovered mid-cycle (e.g., wrong adverse threshold), with audit and re-notification — instead of forcing every affected case through representation. (R18)
19. **Probation appraisal semantics.** Flesh out `cycle_type = PROBATION`: confirmation-recommendation / extension outcome, feed to M01/M12, differentiated from the annual APAR flow (currently the enum exists but the behaviour does not).
20. **Representation escalation ladder + external reference.** Define the statutory disposal deadline for the competent authority, the condonation authority for late filings, and a flag/handoff when a representation is rejected and the officer seeks an external tribunal (e.g., CAT) reference — closing the appeal chain rather than ending at "REJECTED."
21. **Clarify weightage policy semantics.** State explicitly whether `DEVELOPMENT` goals and competencies sit **inside or outside** the 100% sum and exactly how the goal-vs-competency split rolls into the final grade (FR-M08-07 / `weightage_policy`), removing the current ambiguity.
22. **Broaden conflict-of-interest/recusal.** Extend self/chain exclusion for calibration committee members and adjudicating authorities to declared COI (e.g., spouse, close relation, same direct prior posting), with a recorded recusal rather than only structural self/chain checks.
23. **Dual-control on irreversible actions.** Require a second-person approval (in addition to MFA step-up) for retention **disposal** and **confidentiality downgrade**, given both are irreversible/sensitive under the data-integrity rules.
