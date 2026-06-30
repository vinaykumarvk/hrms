# Adversarial Idea Evaluator — Council Report
## M06-PPP: Promotion, Posting & Progression Monitoring BRD (v1.0)

**Framed question:** Is this Promotion, Posting & Progression Monitoring BRD complete, correct, and world-class (seniority, DPC/promotion panels, eligibility, reservation roster, financial up-gradation ACP/MACP, SR posting) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?

**Artefacts reviewed:** `/Users/n15318/hrms/docs/brd/v1/M06-promotion-posting-progression.md` (16 sections, 24 module entities, 14 FRs); `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`.

**Method:** Five independent advisors → anonymous peer review (A–E) → chairman synthesis → focused second pass on the fundamental clash → Adopted Improvements for BRD v2.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is a genuinely strong, build-ready BRD that already clears most of the bar a Workday/SuccessFactors/Oracle HCM reviewer would set, then adds the public-sector statutory depth those suites lack out of the box. Its strengths are concrete and rare:

- **Correct decomposition of the quasi-judicial pipeline.** Seniority → eligibility → zone of consideration → DPC verdict → select list → roster reconciliation → order → SR posting is the actual constitutional sequence, and each stage is a first-class, separately-auditable entity rather than a status flag on one mega-table. The state tables (§11) are explicit and guard-conditioned.
- **Sealed cover done properly (FR-008).** The BRD models the hard part — DPC still assesses fitness, recommendation is sealed, post kept vacant/provisional, Review DPC on M09 conclusion, notional date on exoneration, supersession on penalty, restricted visibility. Most commercial HCM cannot express this at all.
- **MACP as a vacancy-independent track (FR-011)** with screening committee, benchmark, cap, deferral-on-penalty, and clean handoff of pay arithmetic to M10 — a textbook separation that prevents M06 from re-implementing payroll.
- **Statutory integrity rules (§5.6)** — gap-free order numbering, single active final list per scope, transactional select-list/order/MACP writes, idempotent SR posting keyed on `source_module+source_event_id`, no-self-adjudication. These are exactly the invariants that survive a CAG audit.
- **Reconstruction-grade auditability** — every decision is replayable, eligibility frozen at `DPC_HELD`, snapshots of APAR inputs in JSONB. This is what defeats a tribunal challenge.
- **Parallel-agent plan (§15.3) with locked shared contracts** (`SrPostingGateway`, `OrderService.create()`, `EligibilityEngine`) is unusually disciplined and will actually let a fleet build this without colliding.

The world-class layer (succession 9-box, career-path stepper, eligibility-cohort projection, self-service progression timeline) is present and correctly marked advisory, not auto-promotion. Net: ship the spine as-is; the gaps below are refinements, not foundations.

### Advisor 2 — The Contrarian (non-obvious failure modes)

The BRD is strong on the *happy statutory path* and dangerously thin exactly where public-sector promotions actually get litigated and set aside. Specific failure modes the author under-modelled:

1. **Inter-se seniority across recruitment streams is absent.** The entire seniority model (`seniority_lists`/`seniority_entries`) assumes one feeder grade = one ranked stream. In reality the same grade is fed by **direct recruits + promotees + LDCE qualifiers**, and fixing their *combined inter-se seniority* (rota-quota / rotation of vacancies, the `N.R. Parmar` line of disputes) is THE most litigated thing in Indian service law. There is no quota, no rotation, no stream tag, no combined-list construction. This alone can unwind a batch.

2. **Reservation-in-promotion has no constitutional gating data.** Roster points are modelled as a clean cycle, but promotion reservation legally requires the State to hold **quantifiable data of inadequacy of representation + effect on administrative efficiency** (M. Nagaraj / Jarnail Singh) before applying it, plus **consequential seniority / catch-up** treatment (Art 16(4A)). None of this exists. Worse, **own-merit migration is missing**: a reserved candidate selected on merit against a UR point must be adjusted against UR, not consume a reserved point — getting this wrong silently over-counts reservation and is a guaranteed challenge. Creamy-layer (OBC) and EWS certificate currency as-of-crucial-date are also unmodelled.

3. **APAR usability gap — the silent batch-killer.** FR-003 reads APAR grades from M08 and benchmarks them, but **never checks whether a below-benchmark/adverse APAR was communicated to the employee and the representation disposed.** Per `Dev Dutt v. Union of India` an uncommunicated below-benchmark entry cannot be relied on by a DPC. A DPC that supersedes on an uncommunicated entry is voidable. The model needs an `apar_communicated`/`representation_status` gate, not just a grade.

4. **No court/tribunal linkage.** Promotion orders are routinely issued "subject to the outcome of OA/SLP No. …", stayed by interim orders, and reopened on contempt. There is no entity to attach a litigation reference, an interim stay, or a "subject-to-outcome" flag to a case/order/seniority list. Reservation-roster and seniority disputes are *born* in CAT/High Court; the BRD cannot represent that they are sub judice.

5. **Retrospective promotion cascades are under-modelled.** `notional_date` exists on a single order, but a court-ordered retrospective promotion of one officer re-ranks an entire seniority list, re-fixes pay (stepping-up to cure junior-drawing-more anomalies), and may require re-doing downstream DPCs. There is no cascade/recompute concept and no stepping-up/pay-anomaly flag back to M10.

6. **Qualifying-service exclusions are hand-waved.** `min_qualifying_service_years` with a vague "broken-service (suspension) deduction" ignores EOL/dies-non/ad-hoc-vs-regular service/deputation counting — each a defined deduction rule. "Configurable" is doing far too much work here.

**The risk the author most clearly missed: own-merit reserved-candidate migration in the roster (point 2)** — it is invisible, silent, cumulative, and the single most common reason promotion rosters are struck down.

### Advisor 3 — The First Principles Thinker

Strip the module to its irreducible purpose and a cleaner frame emerges. The BRD models promotion as a **linear case pipeline**. But the actual invariant the system must protect is narrower and deeper:

> *"For any contested upward movement, reconstruct — as of the legally crucial date — the exact service facts, the exact rule version, and the exact decision, such that the decision is defensible and any later correction propagates truthfully."*

Three first-principles observations follow:

- **The atomic unit is not the case; it is the (employee, grade, crucial-date) eligibility fact.** Seniority lists, DPCs, MACP screening and progression alerts are all *consumers* of that fact. The BRD half-sees this (eligibility frozen at DPC_HELD, APAR JSONB snapshot) but still scatters service-fact computation across `QualifyingServiceCalculator` instances in FR-003, FR-011, FR-013/014. A single **versioned Service-Fact / Qualifying-Service ledger** (computed once, snapshotted, citable) would remove duplication and make every downstream decision cite the same source — exactly what a tribunal demands.

- **Hidden assumption: lists and orders are terminal.** The whole state machine treats `FINALISED` and `EFFECTED` as endpoints. In this domain they are not — courts reopen them. The truthful model is **append-only with supersession + provenance**, where a "final" list is just the current authoritative version of an ever-correctable record. The BRD has soft-delete and SUPERSEDED states but no notion of a *correction lineage* triggered by an external (judicial) event.

- **Simpler core, richer edges.** The genuinely hard, irreducible complexity lives in exactly four engines: **seniority construction (multi-stream), the reservation roster mathematics, qualifying-service exclusions, and the zone-of-consideration formula.** These are the rule-dense, litigation-bearing kernels and they are the *thinnest* FRs in the BRD (003, 004, 006). The career-path/succession/9-box layer (FR-014) is comparatively trivial yet gets equal billing. The framing should invert: specify the four kernels to algorithmic precision, and let the advisory layer stay light.

### Advisor 4 — The Outsider

I came in cold. The BRD is dense with insider vocabulary that a non-specialist (or a foreign HCM reviewer) cannot parse without the glossary: *DPC, APAR, ACP/MACP, sealed cover, zone of consideration, crucial date, feeder grade, supersession, roster point, carry-forward, de-reservation, notional date, dies-non, current duty charge.* The glossary (§16.1) helps and is appreciated, but several load-bearing terms are *used in rules before being defined* (e.g., "crucial date" vs "panel year" vs "as-on date" — three different reckoning dates that an outsider will conflate, and the BRD never crisply distinguishes them in one place).

Concerns from the outside:

- **Three different "dates" with overlapping meaning.** `as_on_date` (seniority), `crucial_date` (eligibility), `vacancy_year`/panel year, `effective_date`, `notional_date`. A newcomer — and an implementing agent — will mis-wire these. They need one explicit "reckoning dates" reference box with worked relationships.
- **"Configurable" appears as the answer to the hardest questions.** Roster percentages, zone multiplier, qualifying-service treatment, MACP clock, benchmark — all "configuration, not code." To an outsider this reads as *the spec deferring the actual algorithm*. A builder cannot configure an algorithm that was never specified. At minimum the *shape* of each configurable rule (inputs, formula, worked example) must be pinned.
- **Surface area is large but mostly justified.** 24 entities / 14 FRs is a lot, yet each maps to a real statutory artefact; this is not gratuitous. The one part that feels like a different product is **succession planning + 9-box + career-path competency linkage (FR-014)** — that's talent-management language bolted onto a statutory-promotion engine. It may belong, but an outsider would ask whether it earns its place in *this* module or is M07/M14 territory.
- **Acronym density in error codes is fine** (they're for engineers), but UI labels must spell things out for end-users (an Establishment clerk knows "zone of consideration"; an employee on the self-service timeline does not).

### Advisor 5 — The Executor

Feasibility is good; the spine is buildable by the parallel plan in §15.3. But the sequencing hides three execution traps and a few missing dependencies.

- **Monday step:** Lock the four shared contracts named in §15.4 **and** add a fifth before anyone writes code: the **vacancy / sanctioned-strength contract**. Right now `vacancy_count` is a free integer "validated against an establishment input/parameter" that *does not exist as an entity*, and FR-012 posting "validates destination post as sanctioned/vacant" against nothing. There is no `sanctioned_posts`/`establishment` entity. WP-C and WP-G both block on it. This is the first thing to define.
- **Trap 1 — the rule engines are on the critical path and are under-specified.** FR-003 (eligibility), FR-004 (zone), FR-006 (roster) are the longest-pole, highest-risk builds, yet are the least algorithmically pinned. Estimate them at 2–3× the others and de-risk with worked-example test vectors *before* coding, or the whole pipeline slips.
- **Trap 2 — cross-module readiness is assumed, not verified.** FR-003/011 hard-depend on M08 (APAR read) and M09 (vigilance read + case-conclusion event subscription). M09 emitting a reliable conclusion *event* (not just a status read) is a non-trivial dependency the sealed-cover flow (FR-008) lives or dies on. If M09 only offers polling, FR-008's "subscribe to conclusion" must degrade to a scheduled reconcile. Pin this contract now.
- **Trap 3 — increment monitoring overlaps M10.** `increment_monitor` (annual/stagnation/efficiency-bar increments, withhold/release) is substantially a *payroll* concern. Building it in M06 risks a dual source of truth with M10 on increments. Decide ownership before WP-H.
- **Sequencing nit:** FR-008 sealed cover is placed "after C,D" but its Review-DPC reuses FR-005 panel machinery and FR-007 order machinery for *notional* effecting — schedule it adjacent to WP-D, not as a tail.
- **Evidence to demand at each gate:** roster-compliance reconciliation report = 0 deviations on a seeded multi-category fixture; idempotent SR double-post test; deemed-acceptance timer test; retrospective re-rank cascade test (currently no FR owns this).

---

## 2. Anonymous Peer Review (A–E)

> Advisors anonymised: A = Proponent, B = Contrarian, C = First Principles, D = Outsider, E = Executor.

**Reviewer 1 on A (Proponent):**
(1) Strongest: correctly identifies that the *spine* (seniority→DPC→roster→order→SR) is modelled as separately-auditable entities with real state machines — that genuinely is best-in-class and shouldn't be touched. (2) Biggest blind spot: treats the advisory talent layer (succession/career path) as a clean win without asking whether it dilutes focus from the litigation-bearing kernels. (3) Overstates "ship as-is."

**Reviewer 2 on B (Contrarian):**
(1) Strongest: the own-merit reserved-candidate migration miss and the APAR-communication (`Dev Dutt`) gate are precise, real, and individually capable of voiding a promotion batch — these are the highest-value findings in the whole council. (2) Biggest blind spot: B lists many failure modes but doesn't prioritise build effort or acknowledge that some (e.g., full multi-stream rota-quota) may be out of scope for a v1 if the organisation has single-stream feeder grades. (3) Slightly assumes the Indian-litigation frame applies to "a leading global organisation" uniformly.

**Reviewer 3 on C (First Principles):**
(1) Strongest: the "atomic unit is the (employee, grade, crucial-date) eligibility fact" reframe is powerful and would eliminate the duplicated `QualifyingServiceCalculator` instances; the append-only-with-correction-lineage insight directly answers B's retrospective-cascade gap. (2) Biggest blind spot: under-credits how much the BRD *already* does (eligibility freeze, JSONB snapshot) — the gap is consolidation, not absence. (3) Offers architecture but no migration path from the current 24-entity model.

**Reviewer 4 on D (Outsider):**
(1) Strongest: the "three different reckoning dates" confusion is a real implementation hazard that even domain experts trip on, and forcing one reference box is cheap and high-value. (2) Biggest blind spot: D flags "configurable = deferred algorithm" but doesn't connect it to C's point that only four kernels actually need pinning — D treats all "configurable" equally. (3) The succession-scope question is raised but not resolved.

**Reviewer 5 on E (Executor):**
(1) Strongest: catching that `vacancy_count` and "sanctioned/vacant post" validate against an entity *that does not exist* — a concrete, structural hole, not a refinement. The M09 event-vs-poll dependency for sealed cover is also a real schedule risk. (2) Biggest blind spot: E flags increment/M10 overlap but doesn't note the parallel overlap of MACP "pay event" ownership or the stepping-up pay-anomaly flow. (3) Doesn't address data-migration risk for legacy seniority where stream/quota history is lost.

**What ALL FIVE missed (genuine, surfaced in peer review):**

- **No `sanctioned_posts` / establishment / vacancy-computation entity.** (E touched the symptom but even E framed it as "validate against a parameter," not "the cadre-strength register is a missing first-class entity that vacancy split between DR-quota and promotion-quota, anticipated vacancies, and post-based rosters all depend on.") Four FRs silently assume it.
- **Refusal-of-promotion consequences are unmodelled.** `acceptance_status=DECLINED` is captured but the *downstream rule* — refusal debars for one year and **stops the MACP clock / forfeits the next MACP** per policy — is never wired between FR-007 and FR-011. A declined order should propagate a consequence, not just inform the reserve list.
- **DPDP/privacy on the most sensitive joins.** All five praised or critiqued features; none flagged that **APAR grades + disciplinary status + reservation category** are now co-located in `eligibility_assessments` (incl. `apar_detail_json`) — the single most sensitive PII concentration in the suite — yet §10 only mentions "category masking." Purpose-limitation, field-level access, and retention of the APAR snapshot specifically are unaddressed.
- **Panel/select-list "currency."** A DPC select panel has a **validity period** (typically one year / until next panel); promotions from an expired panel are illegal. No entity field expresses panel currency or its expiry.

---

## 3. Chairman Synthesis

### 3.1 Agreements (high consensus)
- The **spine is world-class** and should be preserved (A, all reviewers).
- The **rule kernels — multi-stream seniority, reservation roster, qualifying-service, zone formula — are the real risk and are the thinnest FRs** (B, C, D, E converge).
- **"Configurable" is masking unspecified algorithms** that must be pinned to worked examples (C, D, E).
- A **missing vacancy/sanctioned-strength entity** is a structural hole (E + peer review).

### 3.2 Clashes
- **Scope of the talent/succession layer (FR-014):** A values it as best-in-class; D and C see it as a different product diluting focus. *Not fundamental* — resolved by keeping it but marking it explicitly advisory/optional and lighter than the kernels.
- **FUNDAMENTAL clash — terminality of records:** A's "FINALISED/EFFECTED = ship-ready endpoints" vs B+C's "records must be append-only with judicial-correction lineage." This changes the data model and is resolved below.

### 3.3 Blind spots (council-level)
- Own-merit migration; APAR-communication gate; court/tribunal linkage; refusal-of-promotion consequence; panel currency; PII concentration of the eligibility snapshot; retrospective cascade ownership.

### 3.4 Idea evolution
The BRD evolves from *"a clean linear statutory promotion pipeline"* to *"a defensible, correctable record of upward movement, anchored on a single versioned service-fact ledger, gated by communication/constitutional pre-conditions, and aware that any node may be reopened by a court."* Same spine; harder edges pinned; correction-lineage added.

### 3.5 Focused second pass — the fundamental clash (terminality vs correctability)

**Resolution:** Adopt B/C's append-with-lineage model **without** a rewrite. Concretely: (a) keep `FINALISED`/`EFFECTED` as the *current authoritative* state; (b) add a lightweight **`correction_events`** concept (or extend supersession) that records *why* a finalised list/effected order was reopened (objection-upheld vs **court/tribunal order** vs administrative error), links the triggering litigation reference, and **emits a recompute/cascade job** that re-ranks affected seniority and flags pay-anomaly stepping-up to M10. This satisfies A (no spine rewrite, existing SUPERSEDED states reused) and B/C (truthful propagation, judicial reopening representable). The eligibility-fact consolidation (single `QualifyingServiceLedger`) is the enabling refactor and should be locked as a shared contract alongside the existing four.

### 3.6 Risk Register

| Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|
| Own-merit reserved candidate not migrated to UR point → roster over-counts reservation, batch struck down | Critical | B | Add migration rule + `adjusted_against_category` on roster fill; compliance report shows own-merit adjustments |
| DPC relies on uncommunicated below-benchmark/adverse APAR → order voidable (`Dev Dutt`) | Critical | B | Add `apar_communicated`/`representation_status` gate in FR-003; block use of uncommunicated adverse entry; expose in eligibility trace |
| No `sanctioned_posts`/establishment entity; vacancy & "vacant post" validate against nothing | Critical | E + peer | Introduce establishment/sanctioned-strength entity; vacancy computation (DR vs promotion quota, anticipated, carry-forward); FR-012 validates against it |
| Multi-stream inter-se seniority (DR/promotee/LDCE, rota-quota) unmodelled | High | B | Add stream/quota tags + combined-seniority construction (scope to org's actual recruitment model; may phase) |
| No court/tribunal linkage; orders issued "subject to OA outcome", stays, contempt unrepresentable | High | B | Add `legal_case_links` entity attachable to case/order/list; `subject_to_litigation` flag; interim-stay state |
| Retrospective promotion cascade (re-rank + pay stepping-up) has no owner | High | B, C | Add correction-lineage + recompute job (see §3.5); stepping-up/pay-anomaly flag to M10 |
| Reservation-in-promotion lacks Nagaraj/Jarnail quantifiable-data justification & consequential-seniority handling | High | B | Capture enabling-provision/justification record per roster; model consequential seniority vs catch-up |
| Refusal of promotion has no downstream consequence (debarment, MACP clock) | High | Peer review | Wire DECLINED → debarment window + MACP-clock effect between FR-007 and FR-011 |
| Eligibility/zone/roster/qualifying-service "configurable" but algorithm unspecified | High | C, D, E | Pin input/formula/worked-example for each of the four kernels; ship test vectors |
| PII concentration: APAR + disciplinary + category co-located in eligibility_assessments | High | Peer review | Field-level access, purpose-limitation, explicit retention for APAR snapshot, DPDP DPIA note |
| Qualifying-service exclusions (EOL, dies-non, ad-hoc vs regular, deputation) not modelled | Medium | B, E | Service-exclusion rule set feeding the single qualifying-service ledger |
| Three reckoning dates (as-on/crucial/panel/effective/notional) conflatable | Medium | D | One "Reckoning Dates" reference box with relationships + worked example |
| DPC select-panel currency/expiry not modelled → promotion from stale panel | Medium | Peer review | Add `panel_valid_until`; block orders after expiry without re-validation |
| MACP cap rule mis-stated (`promotions + macp ≤ 3`) | Medium | B (correctness) | Restate: MACP grants ≤ 3 *financial upgradations* total; regular promotions reduce remaining MACP, they do not breach a combined cap |
| Increment monitoring overlaps M10 (dual source of truth) | Medium | E | Decide ownership; if M06 monitors, M10 remains executor of record |
| LDCE / departmental-exam promotion channel & exam-result integration absent | Medium | B | Add LDCE to promotion_mode + exam-result gate in eligibility |
| Single-post cadre / posts where roster doesn't apply not handled | Low | B | Roster-applicability exemption flag per grade |
| Succession/career-path layer may be scope creep | Low | A vs D | Keep but mark advisory/optional, lighter than kernels |

### 3.7 Recommendation

**Conditional GO.** The BRD's spine, state machines, SR-posting discipline, sealed-cover handling, and parallel-agent plan are strong enough to start the spine immediately (WP-A/B). **Do not start the rule-kernel work packages (eligibility, zone, roster) until** the four kernels are pinned to worked examples and the missing structural pieces (sanctioned-posts entity, APAR-communication gate, own-merit migration, legal-case linkage, correction-lineage) are added in a v2 pass. These are additive, not a rewrite — the spine survives intact. Re-baseline §15.4 "shared contracts to lock" to include the `QualifyingServiceLedger` and the establishment/vacancy contract.

### 3.8 The One Thing To Do First

**Before any rule-engine code, write and pin the four kernel algorithms (multi-stream seniority construction, reservation-roster mathematics *including own-merit migration*, qualifying-service exclusions, zone-of-consideration formula) as precise specs with worked numeric test vectors — and introduce the missing `sanctioned_posts`/establishment entity they all depend on.** Everything litigation-bearing flows through these four; pinning them converts the BRD's biggest "configurable" hand-waves into buildable, testable, defensible logic.

---

## Adopted Improvements for BRD v2

1. **Add a `sanctioned_posts` / establishment-strength entity** (sanctioned strength, filled/vacant, DR-quota vs promotion-quota split, anticipated & carried-forward vacancies). Replace the free-integer `vacancy_count` with a computed/validated value sourced from it; FR-012 posting validates "sanctioned/vacant post" against it.

2. **Add an APAR-usability gate to FR-003 (`eligibility_assessments`):** new fields `apar_communicated`, `apar_representation_status`, and a rule that an uncommunicated below-benchmark/adverse APAR entry **cannot be relied upon** by the DPC (Dev Dutt principle). Surface in the eligibility rule-trace.

3. **Add own-merit reserved-candidate migration to FR-006 roster:** field `adjusted_against_category` on the fill; a reserved candidate selected on own merit is counted against an **unreserved** point, not a reserved one; compliance report itemises migrations and recomputes category tallies accordingly.

4. **Introduce multi-stream / inter-se seniority support:** add `recruitment_stream` (DIRECT, PROMOTEE, LDCE, DEPUTATION_ABSORPTION) and quota/rotation metadata to `seniority_entries`; specify combined-seniority construction (rota-quota / rotation of vacancies). Scope to the organisation's actual recruitment model; may be phased, but the data model must not preclude it.

5. **Add a `legal_case_links` entity** attachable to `promotion_cases`, `promotion_orders`, and `seniority_lists` (court/tribunal reference, OA/SLP no., interim-stay flag, status). Add a `subject_to_litigation` flag and an `INTERIM_STAYED` consideration in relevant state machines; orders can be issued "subject to outcome."

6. **Add a correction-lineage / recompute mechanism** (extend supersession): a `correction_event` records the reason class (OBJECTION_UPHELD, COURT_ORDER, ADMIN_ERROR), links the trigger, and **emits a cascade job** that re-ranks affected seniority entries and downstream candidates — making retrospective promotion truthfully propagate.

7. **Wire stepping-up / pay-anomaly flow to M10:** when a retrospective/notional promotion causes a junior to draw more than a senior, M06 raises a stepping-up/pay-anomaly signal to M10 (it does not compute pay, but it must detect and flag the anomaly).

8. **Consolidate qualifying-service computation into one versioned `QualifyingServiceLedger`** (single source, snapshotted, citable), reused by FR-003/011/013/014 instead of separate calculators. Lock it as a fifth shared contract in §15.4.

9. **Specify qualifying-service exclusion rules** as configurable-but-pinned logic: EOL, dies-non, suspension/break-in-service, ad-hoc vs regular service counting, deputation period — each with a worked example. No more single `min_qualifying_service_years` with a vague "broken-service deduction."

10. **Pin the four rule kernels to worked numeric examples + test vectors** in the BRD: (a) zone-of-consideration formula (the non-linear DoPT slab, not just a flat multiplier), (b) reservation-roster mathematics (post-based vs vacancy-based, carry-forward, de-reservation limit, 50% ceiling, PwBD horizontal), (c) qualifying-service exclusions, (d) multi-stream seniority. Ship before kernel code.

11. **Model DPC select-panel currency:** add `panel_valid_until` / `panel_currency_end` to `promotion_panels` or `dpc_proceedings`; block order generation from an expired panel without re-validation. Add supplementary/residual/review-DPC support for missed candidates.

12. **Wire refusal-of-promotion consequences:** `acceptance_status=DECLINED` triggers a configurable debarment window and a defined effect on the MACP clock (forfeiture/stop), propagated from FR-007 to FR-011 — not merely a reserve-list note.

13. **Correct the MACP-cap integrity rule (§5.6 rule 10):** restate as "at most 3 **financial upgradations** in the career; regular promotions reduce the remaining MACP entitlement; they do not constitute a combined `promotions + macp ≤ 3` cap." Add the intervening-promotion clock-reset rule and refusal effect.

14. **Add an LDCE / departmental-examination promotion channel:** extend `promotion_mode` (and/or `eligibility_rules.channel`) with LDCE; integrate an exam/qualification result gate (replace the single `requires_qualification` VARCHAR with a structured qualification/exam-result reference).

15. **Capture the reservation-in-promotion enabling justification** per roster (Nagaraj/Jarnail quantifiable-data record, enabling-provision reference) and model **consequential seniority vs catch-up** treatment for accelerated reserved promotions. Add a roster-applicability exemption flag for single-post cadres / grades where reservation in promotion does not apply.

16. **Strengthen DPDP/privacy on the eligibility snapshot:** field-level access control and purpose-limitation for the APAR + disciplinary + category concentration in `eligibility_assessments`/`apar_detail_json`; explicit retention rule for the APAR snapshot; add a DPIA note to §10. Add creamy-layer (OBC) / EWS-certificate **currency-as-of-crucial-date** validation.

17. **Add a "Reckoning Dates" reference box** (one place, §5 or §16) crisply distinguishing `as_on_date` (seniority), `crucial_date` (eligibility), panel/`vacancy_year`, `effective_date`, and `notional_date`, with a worked relationship example — eliminating the most common implementation mis-wiring.

18. **Resolve increment-monitoring ownership vs M10:** declare M06 `increment_monitor` as a *monitoring/alerting* view with M10 as system-of-record/executor for increments, or move it to M10. Remove the dual-source-of-truth ambiguity before WP-H.

19. **Confirm the M09 sealed-cover dependency as an event (not poll)** in §16.3, with a defined degradation to scheduled reconciliation if M09 offers only status read. Add a sealed-cover maximum-age / mandatory periodic-review SLA (e.g., two-year review) as an explicit rule.

20. **Add missing terminal/edge states:** `promotion_postings` needs a `NOT_JOINED`/forfeited state with consequence; sealed cover needs a `partially-upheld minor-penalty` decision branch; officiating needs an explicit "superseded by regular DPC incumbent → terminated (not regularised)" path (already noted in prose — promote to state guard).

21. **Mark the talent layer (FR-014 succession / career-path / 9-box) explicitly advisory and optional**, lighter than the statutory kernels, with a note clarifying the boundary against M07 (competencies) and M14 (analytics) so it is not over-built relative to the litigation-bearing core.

---

*End of council report — M06-PPP BRD v1.0.*
