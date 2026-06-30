# Adversarial Council Review — M07 Training & Skill Development Management BRD

**Artefact:** `/Users/n15318/hrms/docs/brd/v1/M07-training-skill-development.md` (v1.0)
**Shared context:** `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Training & Skill Development BRD complete, correct, and world-class (competency framework, skill-gap, calendar/nominations, LMS integration, certification, evaluation) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class — and what concrete changes make it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → focused second pass → adopted improvements.

---

## 1. The Five Advisors

### Advisor A — The Proponent

This BRD is, on its own terms, unusually complete and genuinely build-ready. It does what most HCM learning specs never manage: it closes the loop end-to-end — competency taxonomy → role competency models → employee skill inventory → gap analysis reconciled with appraisal (M08) and statutory mandates → training needs → annual plan/budget → catalog → sessions → maker-checker nominations → attendance → pre/post + Kirkpatrick L1–L4 → certification with validity/renewal → SR posting → budget actuals. The traceability matrix (§15.1), the parallel-agent wave plan (§15.2), and the Final Reconciliation Table (§15.4) make this directly executable by a fleet of agents.

The public-sector rigour is real and not bolted on: append-only ledgers (`skill_assessments`, `training_assessments`, `training_feedback`, `cpd_records`, SR events), segregation-of-duties expressed as concrete invariants (`nominated_by ≠ approver`, budget `approved_by ≠ cost creator`), idempotent SR/LMS/payroll integration with explicit retry/FAILED states, and a mandatory-training rule (`MANDATORY_CANNOT_BE_CANCELLED`) that encodes statutory obligation as a state guard. The data-integrity rules (§5.6) are the kind of thing usually discovered in production — capacity invariants, budget non-overcommit, proficiency-ordering non-negativity, and "only VALIDATED skills close a gap" are all correctly stated.

World-class HCM features are present, not aspirational hand-waving: learning paths, gap-driven recommendations, CPD credit ledger, skills marketplace (opt-in, DPDP-aware), SCORM/xAPI sync with idempotency keys, and feature flags for the riskier capabilities. The error catalog, JSON examples, notification matrix, and 12-report analytics list show the author thought about operations, not just the happy path.

This is comfortably above the bar set by a typical SuccessFactors/Cornerstone implementation spec for a government client. My recommendation: approve for build with targeted amendments. The gaps that follow are refinements on a strong foundation, not foundational rework. The single highest-value thing the document already gets right — and which most government L&D systems get wrong — is making statutory compliance and SR posting first-class, idempotent, and auditable rather than an afterthought.

### Advisor B — The Contrarian (non-obvious failure modes)

The document's polish hides five failure modes that will surface 12–18 months post-launch, plus one the author missed entirely.

**1. Competency-model maintenance burden becomes "framework rot."** The model machinery (models, items, weights, critical flags, five-level scope precedence, versioning, effective dating) is elegant — and nobody will keep it current for 200k employees across hundreds of designations. There is no review cadence, no `next_review_date`, no owner-accountability, no staleness alarm. A competency model published 2026-04-01 and never revisited silently produces *confidently wrong* gap analyses that then feed promotion (M06) and appraisal (M08). A stale framework is worse than none: it manufactures false precision.

**2. Skill-data staleness is structurally unmanaged for the majority of skills.** Only `is_compliance_skill` rows get `default_validity_months` and nightly expiry. A self-or-manager-validated "PostgreSQL L3" from 2026 counts toward closing a gap *forever*. There is no decay, no re-validation interval, no "last validated" freshness on non-compliance skills. Gap analysis (FR-004) trusts indefinitely-stale VALIDATED skills — the engine's inputs rot while its outputs look authoritative.

**3. The SCORM integration is architecturally mis-modelled.** SCORM 1.2/2004 has **no server-to-server completion push** — its run-time API lives client-side *inside the hosting LMS*; there is no "SCORM webhook." FR-015 and §10.4 describe a SCORM webhook that cannot exist as drawn. Real integration is either (a) you host SCORM yourself and need a content player + sequencing engine, or (b) you poll the LMS reporting API, or (c) you stand up an xAPI **LRS**. There is no LRS entity, no content-hosting decision, and no single-vs-multi-LMS stance. This FR will fail first contact with a real LMS.

**4. Certification validity is tracked but not *enforced*, and external/professional certs have no home.** Expiry fires a notification and nothing else — no auto re-nomination to the renewal program, no linkage that blocks a lapsed-mandatory-cert holder from a sensitive duty. And `certifications.training_program_id` is nullable but there is **no FR to capture externally-acquired credentials** (PMP, CISA, a statutory licence) with issuer verification — a glaring hole for a workforce whose service register must record significant qualifications regardless of who delivered them.

**5. Training-ROI proof is asserted as a KPI but not instrumented.** Kirkpatrick L4 is a free-form `responses_json` with no linkage to actual business KPIs in M14, no cost-per-outcome, no ROI computation — yet "world-class" and the §1.5 metrics imply it. L3 "manager-observed behaviour change at T+90" (Appendix C) is operationally fictional in a 200k-person government org; it will be blank in production.

**The risk the author missed — mandatory-compliance at scale has no campaign engine.** Cyber-security awareness is mandatory for everyone, validity 12 months. That is ~200k nominations/year that must be created, scheduled into capacity-bounded sessions (the sample session caps at 500), tracked, escalated, and renewed *on a rolling annual cycle*. FR-009 nominates **one employee at a time**. There is no bulk/campaign nomination, no auto-wave scheduling, no rolling-renewal orchestration. The system's single most important statutory job — getting everyone through annual mandatory training — is the one workflow it cannot perform at volume.

### Advisor C — The First-Principles Thinker

Strip the BRD to its job-to-be-done and you find **two different products fused at equal weight**, which is the document's central framing error.

Product 1 is **statutory**: every employee completes mandated training within a window; significant trainings/qualifications land in the Digital SR append-only and immutably; auditors can prove it. This must be bulletproof, simple, and high-volume. Its natural primitives are *programs, mandatory flags, completion, certificates, SR events, and campaigns*. It barely needs a competency model at all.

Product 2 is **developmental**: a competency taxonomy, role models, weighted gap scoring, learning paths, recommendations, a skills marketplace. This is genuinely valuable but is a maturity journey, not a launch requirement, and its value is realised only if the framework is continuously curated.

The hidden assumption binding them is: *"managers and L&D will maintain competency models and validate skills for the whole workforce."* In a government context where promotion is substantially seniority-driven (M06 is literally "seniority, promotions, progression"), the behavioural incentive to maintain a competency framework is weak. So the heavy machinery — five-level scope precedence (DESIGNATION>ROLE>CADRE>ORG_UNIT>GENERIC), `NUMERIC(5,2)` competency weights, versioned models — is built on an assumption of curatorial effort that the surrounding system does not reward. That is the classic over-engineering trap: maximum sophistication on the axis least likely to be fed real data.

Reframed correctly, the question is not "is the competency framework complete?" but "**what is the minimum framework that makes statutory compliance bulletproof, and how do we phase developmental competency so it earns its keep before it ossifies?**" Concretely: ship Product 1 fully at launch (it is the statutory obligation and the source SoW's spine — service register, compliance). Ship Product 2's *skeleton* (taxonomy + skill self-declaration + simple critical/non-critical gap) and defer weighted scoring, marketplace, and AI recommendation until there is evidence the framework is being curated. The BRD already feature-flags marketplace/recommendations/LMS — extend that discipline to the *weighted competency model* itself.

One more first-principles correction: weighted gap scoring presumes the organisation can defend, to an auditor or an aggrieved employee passed over for promotion, *why competency X carries weight 1.4 and Y carries 0.8*. In a public body that defensibility burden is high. Binary `is_critical` is defensible; arbitrary decimal weights are an appeal waiting to happen. Simpler is not just cheaper here — it is more legally robust.

### Advisor D — The Outsider

I am a smart non-specialist, and this document repeatedly assumes I am already inside the L&D priesthood.

**Jargon without a runway.** "Kirkpatrick L1–L4," "SCORM 1.2/2004," "xAPI/Tin Can," "CPD," "cadre," "APAR," "maker-checker," "Kirkpatrick L4 results linkage." The glossary helps, but the *operational* meaning is missing where it matters most. What does an L&D Officer actually *do* to capture "L3 behaviour change at T+90"? Email 200k managers a survey? The BRD treats L3/L4 as if data appears; in reality these are the levels every organisation abandons. State plainly that L3/L4 are *optional, sampled, programme-level* — or you are specifying a feature that ships empty and looks broken.

**Assumptions about who can even log in.** The whole e-learning/SSO/self-assessment/marketplace edifice assumes every employee has a `users` principal, an SSO identity, a device, and the literacy to self-rate against an abstract "Awareness→Expert" descriptor. In a government workforce that includes field staff, depots, and clerical cadres, a large fraction may have no individual login. Who self-assesses for them? Who launches their e-learning? The BRD has no "proxy/kiosk/assisted" mode and no offline attendance sync despite listing an "offline" UI state.

**Complexity the user will feel.** 28 entities, ~25 enums, polymorphic `marked_by`/`assessed_by` pointing at *either* employees *or* trainers. An employee opening "My Skills & Growth" faces a taxonomy, proficiency meters, a gap radar, recommendations, CPD totals, and a marketplace toggle — that is a dashboard designed by the people who built the data model, not for the clerk who has to use it. The cognitive load of self-assessing against descriptors like "Proficient vs Advanced" with no concrete behavioural anchor will produce noise, and that noise feeds promotion-adjacent analytics.

**Unexplained leaps.** "Significant trainings post to SR" — what makes a training "significant"? It is buried in Appendix D, not in the FR. "Trainer must have matching expertise (warning, not block)" — why even capture it then? "Banker's rounding, INR" appears once with no rule for who reconciles paise differences. These are the small ambiguities that become support tickets.

The kindest thing I can say: the document is internally consistent and well-organised. The unkindest: it is written by experts, for experts, about a workforce that is not expert — and that gap is itself a project risk.

### Advisor E — The Executor

Feasibility is mostly good; the sequencing is sane; but there are concrete blockers and a few data-model defects that will stop an agent cold.

**Hard blockers — undefined integration contracts.** Three "hard" dependencies are *named but not specified*: the M08 appraisal-development-gap feed schema, the M12 SR training-event schema/shape, and the M01 joiner-event payload. FR-004, FR-013, and FR-016 cannot be implemented past stubs without these contracts. "Degraded mode when M08 is down" is good, but you still need the *shape* of the data when it is up. Action: pin these three contracts before Wave 4/6, or those waves stall.

**Data-model defects (will fail validation):**
- `competency_models.scope_type` allows `ROLE`, but the table has `designation_id`, `cadre`, `org_unit_id` and **no `role_id` column**. AC FR-002.1 ("exactly one scope key matches the scope_type") is unsatisfiable for ROLE. Either add `role_id` FK or drop ROLE from the enum.
- Enum naming drift between layers: `skill_gap_items.source` = {MODEL, APPRAISAL, MANDATE} vs `training_needs.source` = {GAP_ANALYSIS, APPRAISAL, MANDATORY, …}. MODEL≠GAP_ANALYSIS, MANDATE≠MANDATORY. An agent wiring "convert gap item → need" will mis-map. Normalise.
- Polymorphic FKs `marked_by`/`assessed_by` → "employees/trainers" violate referential integrity (external trainers are not employees). Needs an `actor_type` discriminator or a unified `actors` view.
- NFR inconsistency: Scalability says 200k employees; Performance says "gap-analysis batch for **10k** employees < 30 min." At 200k that is ~10 hours of batch — unacceptable for a nightly window. Restate the perf target at true scale or specify incremental/streaming recompute.

**Sequencing / Monday step.** The wave plan is reasonable, but the *highest-statutory-risk* path (mandatory compliance + SR posting) is split across Wave 1 (budget), Wave 6 (posting). Pull the statutory spine forward. Monday: (1) stand up masters FR-001 + program catalog FR-007; (2) implement the mandatory-compliance + certification + SR-posting thin slice end-to-end on a pilot department *before* building the competency/marketplace breadth. Prove the statutory loop, then scale features.

**Operational gaps that bite in delivery:** no campaign/bulk-nomination tooling (Advisor B's missed risk — I confirm it from a build view: there is no batch enroll API; `POST /induction:enroll` is event-driven for joiners only); no external-trainer/vendor empanelment or procurement linkage (public-sector training procurement is a real workflow); no service-bond/sponsorship model for study-leave/deputation training (cost has TRAVEL/REIMBURSEMENT but no obligation tracking). These are not edge cases in government — they are core.

---

## 2. Anonymous Peer Review

*Each reviewer saw the five analyses unlabelled (A–E) and answered three questions.*

**Reviewer 1**
- *Strongest:* **B (Contrarian).** The SCORM-webhook critique is a hard technical fact, not an opinion — it invalidates a drawn integration and is the kind of thing that fails in week one. Combined with the missed "mandatory-at-scale campaign" gap, B does the most to prevent a confident-but-broken launch.
- *Biggest blind spot:* B asserts framework rot but offers no concrete control (no `review_date`, no staleness metric) — diagnosis without prescription.
- *What all five under-weighted:* none of them costed the **content-authoring and content-hosting** problem. SCORM packages and assessment item banks have to be *authored, versioned, and hosted* — there is no content/asset model at all.

**Reviewer 2**
- *Strongest:* **C (First Principles).** The "two products fused" reframing is the most actionable single idea in the pack; it reorganises the whole roadmap and de-risks launch.
- *Biggest blind spot:* C is cavalier about deferring the competency framework — M08/M06 *already consume* gap data per the BRD, so you cannot defer the gap primitive entirely without breaking sibling modules. The phasing needs a compatibility contract.
- *What all five missed:* **accessibility of assessment content** — WCAG is asserted for screens but pre/post tests and SCORM content are themselves user-facing and frequently inaccessible; no requirement covers them.

**Reviewer 3**
- *Strongest:* **E (Executor).** It is the only analysis that found *falsifiable* defects (the missing `role_id`, the enum drift, the 10k-vs-200k NFR contradiction). Those are immediately fixable and unambiguous.
- *Biggest blind spot:* E treats undefined cross-module contracts as a local fix; in reality M07 cannot unilaterally define the M12 SR event schema — that is an M12 negotiation and a programme-governance dependency, not a Wave-4 task.
- *What all five missed:* **data-subject rights at exit** — when an employee retires/resigns, what happens to self-assessed skills, anonymous feedback authorship, and marketplace presence? DPDP retention/erasure for *learning* PII is unaddressed.

**Reviewer 4**
- *Strongest:* **D (Outsider).** It surfaced the population the spec forgets — non-login field/clerical staff — which is existential for government coverage metrics. If 30% of staff can't log in, the 98% mandatory-completion KPI is unreachable by design.
- *Biggest blind spot:* D under-credits how much the BRD *did* get right (idempotency, SoD, append-only); the tone risks dismissing a strong spec.
- *What all five missed:* **trainer/venue calendar at multi-tenant scale and timezone** — conflict detection is specified, but nothing addresses recurring slots, holidays calendars per state, or the fact that "RUNNING when start date reached" ignores multi-day partial attendance correction windows.

**Reviewer 5**
- *Strongest:* **A (Proponent)** as ballast — it correctly anchors that this is a refine-not-rebuild situation and prevents the council from over-rotating into a teardown.
- *Biggest blind spot:* A's optimism glosses the SCORM defect and the campaign gap, both of which are launch-blocking, not "refinements."
- *What all five missed:* **the budget dimension mismatch** — budgets are keyed by `skill_category_id`, plans/needs by `competency_id`, costs by session/nomination. Reconciliation across three different dimensions is asserted (§5.6 rule 7) but not mechanically defined; variance reporting will not tie out cleanly.

---

## 3. Chairman Synthesis

### 3.1 Agreements (high-confidence, cross-advisor)
1. The BRD is strong, internally consistent, and genuinely build-ready — refine, don't rebuild (A, all reviewers).
2. The SCORM/LMS integration as drawn is technically wrong and launch-blocking; needs an LRS/poll/content-hosting decision (B, E, R1, R5).
3. Mandatory-compliance at scale has no campaign/bulk-nomination engine — the single most important statutory workflow cannot run at volume (B, E confirmed).
4. Skill/competency data staleness is structurally unmanaged for non-compliance skills and for the models themselves (B, C).
5. Several concrete data-model defects exist (missing `role_id`, enum drift, polymorphic FKs, 10k-vs-200k NFR) (E, R3).
6. Cross-module integration contracts (M08 gap feed, M12 SR event, M01 joiner) are named but unspecified — a programme-governance dependency (E, R3).

### 3.2 Clashes
- **Defer the competency framework (C) vs. siblings already consume it (R2).** Real tension: M06/M08 read gap data, so the *primitive* cannot be deferred even if the *sophistication* (weights, marketplace, AI) can.
- **"Refinement" (A) vs. "launch-blocking" (B/E).** The SCORM defect and campaign gap are not refinements; A under-weighted them.
- **Heavy weights are over-engineering (C) vs. world-class expectation (implicit A).** Decimal competency weights add legal-defensibility risk in a public body with limited curatorial capacity.

### 3.3 Blind spots the whole council nearly missed (genuine)
- **No content/asset model.** SCORM packages, assessment item banks, course materials beyond a `document_id` — no authoring, versioning, or hosting entity (R1).
- **Accessibility of *content* (tests, SCORM), not just screens** (R2).
- **DPDP at employee exit** — retention/erasure of learning PII, anonymous-feedback authorship, marketplace presence (R3).
- **Budget-dimension mismatch** — category vs competency vs session; reconciliation won't tie out (R5).
- **Non-login workforce** — proxy/kiosk/assisted capture; offline attendance sync (D, R4).

### 3.4 Idea evolution
The council moved from "is the framework complete?" to "**is the statutory spine bulletproof and high-volume, and is the developmental layer phased so it earns trust before it ossifies?**" The strongest synthesis is C's two-product split, *constrained* by R2's compatibility note: ship the gap *primitive* (binary critical/non-critical) at launch for sibling compatibility; phase weighted scoring, marketplace, and AI recommendation behind the existing feature flags and behind *evidence of curation*. Fix the SCORM model and add a campaign engine because those are the actual statutory job.

### 3.5 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| 1 | SCORM "webhook" integration is architecturally impossible as drawn; LMS sync fails on first integration | Critical | B, E | Replace with explicit model: host content via LRS for xAPI **or** poll LMS reporting API for SCORM; add `lms_content_package`/LRS entity; decide single-vs-multi-LMS; correct FR-015 + §10.4 |
| 2 | No campaign/bulk-nomination engine; annual mandatory training for ~200k cannot be orchestrated | Critical | B, E | Add FR + `training_campaign`/`campaign_target` entities: bulk nominate by org/cadre/designation, auto-wave into capacity-bounded sessions, rolling-renewal scheduler, escalation |
| 3 | Cross-module contracts (M08 gap feed, M12 SR event, M01 joiner) unspecified | High | E, R3 | Pin contract schemas with M08/M12/M01 owners before Waves 4/6; add to dependency register; treat as programme governance, not local fix |
| 4 | Competency-model "framework rot" — no review cadence/ownership/staleness alarm | High | B, C | Add `review_due_date`, `owner_id`, and a staleness report; block FINALIZED gap analysis on models past review-due (warn) |
| 5 | Skill-data staleness for non-compliance skills counts toward gaps forever | High | B | Add `last_validated_at` + configurable `revalidation_interval_months`; "stale" flag excludes/discounts skill from gap closure |
| 6 | Certification validity tracked but not enforced; no external/professional cert capture | High | B | Add renewal auto re-nomination; add FR for externally-acquired credentials with issuer + verification + SR posting |
| 7 | Data-model defects: missing `role_id`, enum drift (MODEL/MANDATE vs GAP_ANALYSIS/MANDATORY), polymorphic FKs | High | E, R3 | Add `role_id` or drop ROLE; normalise source enums; add `actor_type` discriminator or `actors` view |
| 8 | NFR contradiction: 200k scale vs 10k gap-batch target | High | E | Restate perf at true scale; specify incremental/event-driven gap recompute, not full nightly batch |
| 9 | Non-login / field workforce cannot self-assess, launch e-learning, or be reached — KPIs unreachable | High | D, R4 | Add proxy/kiosk/assisted mode; offline attendance capture + sync; define coverage denominator excluding non-eligible |
| 10 | Training ROI / Kirkpatrick L3–L4 asserted but not instrumented; ship empty | Medium | B, D | Reframe L3/L4 as optional, sampled, programme-level; link L4 to named M14 business KPIs; add cost-per-completion metric; drop fictional per-employee T+90 |
| 11 | Decimal competency weights create legal-defensibility risk in public body | Medium | C | Default to binary critical/non-critical at launch; make weighted scoring a feature-flagged Phase-2 capability |
| 12 | No content/asset authoring-hosting-versioning model | Medium | R1 | Add content/asset entity (item banks, SCORM packages, versions); or explicitly scope content hosting to external LMS with a stated contract |
| 13 | DPDP retention/erasure at employee exit for learning PII undefined | Medium | R3 | Add retention/erasure rules for self-assessments, anonymous-feedback authorship, marketplace presence on RETIRED/RESIGNED |
| 14 | Budget dimension mismatch (category vs competency vs session) — variance won't reconcile | Medium | R5 | Define one canonical reconciliation dimension; map plan/need/cost to budget key explicitly with a worked example |
| 15 | No vendor/external-trainer empanelment or service-bond/sponsorship model | Medium | E | Add trainer/vendor empanelment + procurement linkage; add study-leave/deputation sponsorship with service-obligation tracking |
| 16 | Content & assessment accessibility (WCAG) covers screens, not tests/SCORM | Low | R2 | Extend accessibility NFR to assessment content and hosted/authored e-learning |

### 3.6 Focused second pass — the one fundamental clash

**Clash:** Defer the competency framework (C) vs. siblings already consume gap data (R2).

**Resolution.** These reconcile cleanly once you separate *primitive* from *sophistication*. M06/M08 need a stable **gap primitive**: "for employee E against model M, here are the competencies with a positive gap, each flagged critical or not." That contract must exist at launch. What M06/M08 do **not** need is weighted decimal scoring, AI-generated learning paths, or a skills marketplace. Therefore:

- **Launch (non-negotiable, sibling-compatible):** taxonomy + skill self-declaration + manager validation + binary-critical gap analysis + the published gap contract M06/M08 consume.
- **Phase 2 (feature-flagged, gated on evidence of curation):** weighted scoring, recommendation engine, marketplace, CPD targets.

This honours C's "don't over-build the unfed axis" *and* R2's "don't break the siblings." The gap contract becomes a first-class, versioned artefact — which also discharges Risk #3 for the M08 direction. No remaining fundamental clash.

### 3.7 Recommendation

**APPROVE for build, conditional on v2 amendments.** This is a strong, refine-not-rebuild BRD. Two items are launch-blocking and must be fixed before the relevant waves start: the SCORM/LMS integration model (Risk #1) and the mandatory-compliance campaign engine (Risk #2). The data-model defects (Risk #7, #8) are cheap and must be fixed before code generation. Everything else is high-value hardening that can be staged.

### 3.8 The One Thing To Do First

**Build and prove the statutory spine end-to-end on one pilot department before building breadth:** masters (FR-001) → program catalog (FR-007) → a **campaign-based** mandatory-compliance enrolment → completion → certification → idempotent SR posting (FR-012/016), with the M12 SR-event contract pinned first. If that thin, high-volume, statutory loop works and reconciles in audit, the rest of the module is incremental. If it doesn't, no amount of competency-framework sophistication matters.

---

## Adopted Improvements for BRD v2

1. **Replace the SCORM "webhook" model with a real integration architecture.** Add a `learning_record_store`/`lms_content_package` entity; specify xAPI via an LRS *or* SCORM via LMS-reporting-API polling (not a server push); state the single-vs-multi-LMS decision and content-hosting ownership. Rewrite FR-015 acceptance criteria and the §10.4 webhook example accordingly.
2. **Add a Mandatory-Compliance Campaign engine (new FR-TSD-017).** New entities `training_campaign` and `campaign_target`; bulk-nominate by org-unit/cadre/designation; auto-wave participants into capacity-bounded sessions; rolling annual-renewal scheduler; campaign-level escalation and completion dashboard. Add `POST /api/v1/training-campaigns` and `:enroll-batch`.
3. **Fix `competency_models` ROLE scope.** Add a `role_id UUID FK→roles` column, or remove `ROLE` from `scope_type`. Make AC FR-002.1 satisfiable for every enum value.
4. **Normalise source enums across layers.** Align `skill_gap_items.source` with `training_needs.source` (MODEL→GAP_ANALYSIS or vice-versa; MANDATE→MANDATORY) so gap-item→need conversion maps 1:1. Document the mapping table.
5. **Eliminate polymorphic FKs.** Replace `marked_by`/`assessed_by` "employees/trainers" with an `actor_type` discriminator (EMPLOYEE|TRAINER) plus the matching id, or introduce a unified `actors` reference view; restore referential integrity.
6. **Restate performance NFR at true scale and switch to incremental gap recompute.** Replace "10k employees < 30 min" with a 200k-scale target; specify event-driven/incremental gap recomputation on skill-change events instead of a full nightly batch.
7. **Add non-compliance skill freshness.** New fields `employee_skills.last_validated_at` and `skills.revalidation_interval_months`; a nightly "stale skill" flag; gap analysis discounts or excludes stale skills from gap closure with a configurable policy.
8. **Add competency-model governance.** New fields `competency_models.review_due_date` and `owner_id`; a staleness report; warn (not block) when FINALIZED gap analysis is computed against a model past its review-due date.
9. **Publish a versioned Gap Contract for M06/M08.** Define the exact schema M06/M08 consume (employee, model, gap competencies, critical flag); register it as a first-class integration artefact; this is the launch-required gap primitive.
10. **Phase the developmental layer behind evidence of curation.** Default gap scoring to **binary critical/non-critical** at launch; move decimal `weight`-based scoring, the recommendation engine, and the skills marketplace to feature-flagged Phase 2 gated on framework-maintenance metrics. (Reduces legal-defensibility and over-engineering risk.)
11. **Add external/professional certification capture (extend FR-TSD-012).** Allow employee/L&D to record externally-acquired credentials (licence/PMP/CISA) with `issuing_body`, verification status, evidence document, and SR-posting eligibility independent of an internal program.
12. **Enforce certification validity, don't just notify.** On expiry of a mandatory cert, auto-create a renewal training need + (campaign) re-nomination; expose a "lapsed-mandatory" flag consumable by sensitive-duty/posting checks (M06).
13. **Reframe Kirkpatrick L3/L4 and instrument ROI.** Mark L3/L4 as optional, sampled, programme-level (not per-employee T+90); link L4 `responses_json` to named M14 business KPIs; add a `cost_per_completion` / cost-per-outcome metric to the budget/analytics layer.
14. **Pin the M12 SR-event and M01 joiner-event contracts.** Add concrete event schemas to the dependency register and the integration table (§10.5) before Waves 4/6; do not leave "significant training" SR shape undefined.
15. **Promote the "significant training" definition into the FR.** Move Appendix D criteria into FR-TSD-016 as an explicit, configurable rule set with `is_significant` resolution logic; make it auditable.
16. **Add proxy / kiosk / assisted mode and offline attendance sync.** Support skill-assessment, e-learning launch, and attendance capture for non-login field/clerical staff; define offline attendance buffering and sync; define the compliance-coverage denominator (who is in-scope vs exempt).
17. **Add a content & assessment-item model.** Entity for item banks, SCORM/xAPI package versions, and course assets with versioning and accessibility metadata — or explicitly delegate content hosting to the external LMS with a documented contract.
18. **Resolve the budget-dimension mismatch.** Choose one canonical reconciliation key (recommend org-unit + FY, with category/competency as reporting dimensions only); add a worked reconciliation example to §5.6 rule 7 so variance reports tie out.
19. **Add vendor/external-trainer empanelment and procurement linkage.** Capture empanelment status, contract reference, and procurement approval for external providers; tie external `training_costs` to an empanelled vendor.
20. **Add sponsorship / study-leave / deputation with service-obligation tracking.** Model long-duration sponsored training (degrees, deputation) with sponsorship cost, service-bond duration, and obligation-breach handling; link reimbursement to the bond — a core public-sector requirement.
21. **Add DPDP retention/erasure for learning PII at exit.** Define what happens to self-assessments, anonymous-feedback authorship, marketplace presence, and skill inventory when an employee becomes RETIRED/RESIGNED/TERMINATED; honour statutory-retention overrides for SR-posted records.
22. **Add behavioural anchors to proficiency levels and self-assessment guidance.** Require concrete descriptors per `proficiency_levels.descriptor` and per competency so self-assessment produces signal, not noise; add inline help in the "My Skills" UI.
23. **Extend accessibility NFR to content.** State that pre/post assessments and hosted/authored e-learning content meet WCAG 2.1 AA, not only the application screens.
24. **Add explicit waitlist position and fairness audit.** Persist waitlist position (not only `waitlist_count`); log FIFO promotion decisions to `audit_log` so seat allocation in over-subscribed mandatory sessions is auditable.
25. **Resequence the build plan around the statutory spine.** Reorder waves so mandatory-compliance + certification + SR posting (pilot department, campaign-based) is the first end-to-end slice proven, ahead of competency-model breadth, marketplace, and recommendations.
