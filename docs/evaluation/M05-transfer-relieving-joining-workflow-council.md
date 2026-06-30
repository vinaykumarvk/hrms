# Adversarial Idea Evaluator — Council Report
## M05-TRJ — Employee Transfer, Relieving and Joining Workflow (BRD v1.0)

**Framed question:** Is this Transfer, Relieving and Joining Workflow BRD complete, correct, and world-class (transfer orders, clearance/no-dues, charge handover, joining, transit status, SR posting) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?

**Inputs reviewed:** `/Users/n15318/hrms/docs/brd/v1/M05-transfer-relieving-joining-workflow.md`, `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`

---

## Part 1 — Five Advisors (independent)

### Advisor 1 — The Proponent

This is a genuinely strong, build-ready BRD that already clears most of the "world-class" bar. The lifecycle is modelled end-to-end and the state machine is coherent: `DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → RELIEVING_IN_PROGRESS → RELIEVED → IN_TRANSIT → JOINED`, with amend/cancel/revoke branches that correctly distinguish pre-relief from post-relief corrective actions. Few public-sector HRMS specs get the *transit* concept explicit at all; this one makes `IN_TRANSIT` a first-class state with an in-transit register, joining-time computation, and overdue escalation (FR-TRJ-009). That alone puts it ahead of most legacy HRMS deployments.

The integration discipline is excellent. M05 correctly declares itself a *writer* to M12 (SR) and M01 (posting), a *signaller* to M10 (pay-stop/start/LPC), and a *referencer* to M13 (documents), with a transactional-outbox pattern (§16.3, FR-TRJ-012) for guaranteed delivery and idempotency keys to prevent duplicate SR events. The ownership/reuse matrix (§5.4) and the "0 unresolved gaps" reconciliation table (§14.4) show the author thought hard about not re-defining shared entities — exactly what the SHARED_FOUNDATION demands.

The statutory texture is real, not cosmetic: ban/freeze windows with `exception_grounds`, protected categories (spouse/medical/differently-abled/near-retirement/single-parent), `enforcement` modes (`HARD_BLOCK`/`SOFT_WARN`/`REQUIRE_OVERRIDE`), sanctioned-strength guards, and an override path gated to Transfer Authority with mandatory justification. Bulk drives (FR-TRJ-005) with partial-failure isolation and resumable batch jobs are a credible answer to annual cadre movements at scale. Segregation of duties is asserted everywhere (initiator ≠ approver, transferee-exclusion, clearance officer ≠ transferee).

The data integrity rules (§5.6) — one active order per employee, relieving/joining preconditions, date monotonicity, mutual symmetry, no-orphan clearance, SR immutability — are the kind of invariants that prevent the exact paper-process failures the Executive Summary cites. This is a confident, professional baseline. The gaps that remain are refinements on a sound architecture, not foundational rework.

### Advisor 2 — The Contrarian

The headline KPI — "≥ 99% transfers with continuous pay (no break)" — is **contradicted by the BRD's own pay model**, and nobody on the author's side noticed. FR-TRJ-008 signals **pay-stop at Last Working Day**; FR-TRJ-010 signals **pay-start at joining date**. The interval between them is precisely the transit/joining-time period. So the design *guarantees* an unpaid gap equal to transit for every single transfer. In public service, **joining time is paid** (the employee draws joining-time pay, and admissible transit is paid leave/duty). The spec stops pay at LWD and never models joining-time pay or transit-period pay continuity. This is the missed risk: the system will mechanically create the pay gap it exists to eliminate.

**In-transit ownership is undefined.** M01 posting is updated only on join. During `IN_TRANSIT` the employee still carries the *source* `org_unit_id`, yet is "relieved." Which office owns them for payroll, attendance, leave, headcount, and disciplinary jurisdiction? The risk is **dual posting** (both offices count the head, double-budgeting a sanctioned post) or **zero posting** (neither does, employee vanishes from strength). There is no `in_transit_custody` rule.

**Disputed handover is a hostage mechanism.** FR-TRJ-007: "Disputed handover blocks relieving until resolved" — with no Authority override, no time-bound resolution, no handover-under-protest. A vindictive successor, an unreconciled imprest, or a missing asset can trap an employee at source indefinitely, breaking the relieve-by deadline and any onward joining. The same flaw exists in clearance: one non-responsive Clearance Officer blocks `CLEARED` forever; reminders exist but **no deemed-clearance or escalation-grant**.

**Non-joining / stay orders are unmodelled.** Govt transfers are routinely challenged — CAT/court **stay orders**, employee **representations**, retention requests. The BRD has `LATE_JOINING_REVIEW` but no stay-hold state, no representation entity, no "abandonment → revert to source / disciplinary (M09)" path. An employee relieved then never joining sits in permanent `IN_TRANSIT` limbo with pay stopped and no posting — the worst possible outcome, completely unhandled.

**Bulk-drive concurrency:** `vacancy_positions.filled_count`/`vacant_count` never specify *when* a post becomes vacant (order? relief? join?). In a 1,000-order drive with **cascading vacancies** (A vacates a post B is allotted to), this ambiguity causes double-allotment at join time, not just at allotment.

### Advisor 3 — The First Principles Thinker

Strip the module to its irreducible truth: a transfer is **the controlled transfer of accountability for a person and a post from one custodian office to another, across a gap in time.** Everything else — orders, clearance, handover, SR events — is machinery to make that custody transfer *auditable and reversible*. Judged against that frame, two framing assumptions are wrong.

**First, the "one active order per employee" invariant (§5.6-1) conflates the person with the post.** A person can legitimately hold a *substantive* posting and simultaneously hold *additional/current charge* of a second vacant post; can be on deputation (one order) and be repatriated (a second order that must co-exist during overlap); can be promotion-transferred while still relieving a prior move. The real invariant isn't "one order per person" — it's "**one active *substantive* posting transition per person**," with additional-charge and deputation as distinct, co-existable order classes. As written, the rule will block valid government realities.

**Second, the spec models pay as a binary stop/start switch.** First principles: pay is *continuous service with a custody handoff*, not two events. The correct primitive is a **service-continuity ledger** where LWD and joining-date are boundary markers but the transit period is *paid duty/leave*, and the SR records **no break in qualifying service**. The current design treats the gap as dead time, which is why the pay KPI is unreachable.

**Hidden assumption: that allotment is a batch computation.** Real cadre transfers in government are an **interactive counselling event** — candidates called in seniority order, choosing live from *remaining* vacancies, with on-the-spot, legally-recorded choices. The BRD's `allotment_method = PREFERENCE/SENIORITY/MERIT` is an offline sort. That is a simpler *and weaker* model than reality; it cannot represent the contested, observed, real-time allotment that transfer litigation hinges on. A simpler-but-correct framing: model a **counselling session** with a vacancy lock during each candidate's turn and an immutable choice log.

**A simplification the author missed:** `vacancy_positions` re-stores `sanctioned_strength`/`filled_count` — data M01/M06 already own. That is a second source of truth that *will* drift. M05 should read strength, not duplicate it.

### Advisor 4 — The Outsider

I read this as someone who has never worked in an Indian government HR office, and large parts assume knowledge the BRD never gives. **"LPC," "no-dues," "imprest," "DDO charge," "MCC," "cadre," "officiating," "repatriation," "forenoon/afternoon relieving"** — these are thrown around as if universal. A bilingual order template is promised but the *spec itself* is monolingual jargon. If a Workday-trained implementer builds this, they will mis-model half of it because the domain weight of each term is invisible.

**"Forenoon / Afternoon" relieving (`FORENOON`/`AFTERNOON`)** appears with no explanation of *why it matters* — it determines whether the day counts as duty at source or transit, which affects pay and seniority. That load-bearing rule is hidden in an enum.

**The enum set is confusingly redundant.** `transfer_type` contains both `REQUEST` and `TRANSFER_ON_REQUEST` and `COMPASSIONATE`; `ground` *also* contains `REQUEST` and `COMPASSIONATE`; `priority_category` overlaps again with `PROTECTED_SPOUSE`/`MEDICAL`. A reader cannot tell when something is a *type*, a *ground*, or a *priority*. This will produce inconsistent data capture across the five parallel agents.

**Complexity that isn't justified to a newcomer:** FR-TRJ-014 ships a geographic map with `geo_lat/geo_lng` per vacancy. For a v1 whose core problem is "pay gaps and lost no-dues forms," a live vacancy *map* reads as gold-plating. Why is mapping in the baseline build while *representation against a transfer* — surely more central — is absent?

**Unstated assumptions an outsider trips on:** that every office has the same six clearance departments (IT, Library, Accounts, Stores, Advances, Estate) — many small offices have none of these; that a "successor" exists to receive charge (often there is none); that medical/spouse proof documents can sit in the generic M13 store (these are **sensitive health/family data** that a privacy reviewer would ring-fence). None of this is wrong per se, but a newcomer cannot tell what is a firm rule versus an unexamined default. The BRD needs a "domain primer" box and a clarified, non-overlapping classification model before five agents build divergent interpretations of the same words.

### Advisor 5 — The Executor

Feasibility is good; sequencing is mostly right (§14.2 puts eligibility and SR-outbox before orders, which is correct). But several **Monday-morning blockers** are buried.

**Dependency truth:** M05 cannot pay-continue or compute joining time without **M10 entitlement rules** (TTA/transfer grant/joining-time-pay differ for own-request vs admin transfers) and without a **holiday/working-day calendar service** (FR-TRJ-009 assumes one; §FR-009 failure-handling silently defaults to "Sat/Sun + national holidays," which will be *wrong* for regional calendars and produce disputed transit math). Neither dependency has a contract. These are hard external blockers, not internal work.

**The outbox is underspecified for build.** §16.3 and FR-TRJ-012 describe the pattern but there is **no `outbox` table field spec** in §5.2 (it's named in data-model references but never defined), no dead-letter retention, no idempotency-key formula. Five parallel agents (B, C, D, E) all depend on "the SR outbox client" as a frozen contract — yet it isn't actually written down to the field level. That is the single highest-risk integration gap for parallel delivery.

**Sequencing problem in the parallel-agent plan (§14.3):** Agent C (Relieving) and Agent D (Transit & Joining) both write `transfer_orders.status` and both call M10. Without a single owner of the `transfer_orders` state-transition service, you get merge conflicts and contradictory guards. Recommend a shared `TransferOrderStateService` owned by one agent and consumed by others.

**Concrete Monday step:** freeze three contracts *first* — (1) the `outbox` table + idempotency-key spec, (2) the M10 signal contract including **pay-continuity/joining-time-pay and entitlement-by-transfer-type**, not just stop/start, and (3) the working-day calendar service interface. Until those three exist, FR-008/009/010/012 cannot be built without rework.

**Testability:** the "0% ban/tenure violation at issue" KPI is testable, but the override path means the real metric is "0% *un-overridden* violations" — the acceptance test must assert the override audit trail, or QA will mark valid overrides as failures. Bulk-drive perf (1,000 orders < 30 min) is testable; partial-failure quarantine is testable. Good. But there is **no acceptance test for the pay-gap KPI** because the pay model that would satisfy it doesn't exist yet.

---

## Part 2 — Anonymous Peer Review

*(Advisors anonymised A–E; A=Proponent, B=Contrarian, C=First Principles, D=Outsider, E=Executor)*

**Reviewer 1**
1. *Strongest:* B — the pay-stop-at-LWD vs pay-start-at-join contradiction is a real, falsifying defect against a stated KPI, not a style note. It would survive UAT and surface as live underpayment.
2. *Biggest blind spot:* A treats the "0 gaps" reconciliation table as evidence of completeness when it only proves *structural* completeness (sections present), not *semantic* correctness — A never tested an invariant against a real scenario.
3. *All five missed:* none addresses **inter-se seniority assignment on joining** when several transferees join the same cadre/post — joining-date order sets seniority (M06 consumes it), and the spec gives no tie-break or joining-sequence integrity, which is a frequent litigation trigger.

**Reviewer 2**
1. *Strongest:* C — reframing "one active order per employee" as "one substantive transition" dissolves a constraint that would otherwise block additional-charge and deputation overlap, which are everyday government cases.
2. *Biggest blind spot:* E is contract-obsessed and under-weights the *human* process — E never flags that interactive counselling (C's point) breaks E's tidy batch sequencing.
3. *All five missed:* **proof-of-service / acknowledgement of the transfer order.** "Relieve-by" deadlines and non-compliance discipline depend on when the order was *served on and acknowledged by* the employee — there is no served-date or acknowledgement entity anywhere.

**Reviewer 3**
1. *Strongest:* B again — in-transit ownership (dual/zero posting) is the kind of defect that corrupts headcount and budget reports silently for years.
2. *Biggest blind spot:* D dismisses the vacancy map as gold-plating but doesn't notice the deeper duplication C caught (sanctioned-strength dual source of truth) — D critiques surface complexity, C critiques structural complexity.
3. *All five missed:* **government quarters/estate** beyond a single clearance tick — retention of official accommodation post-transfer, vacation timelines, and licence-fee recovery are statutory and money-bearing; the BRD reduces them to one `ESTATE_QUARTERS` checklist line.

**Reviewer 4**
1. *Strongest:* E — the observation that the outbox is referenced as a frozen contract but never field-specified is the highest *delivery* risk for a five-agent parallel build.
2. *Biggest blind spot:* A's optimism: the integration discipline A praises is real at the *naming* level but, as E shows, not at the *field* level — A mistook a table of references for a contract.
3. *All five missed:* **idempotency and gapless statutory numbering under failure.** Govt order numbers must often be gapless per office per year; "retry sequence on collision" can leave gaps or duplicates across retries — a compliance defect none of the five fully pinned down.

**Reviewer 5**
1. *Strongest:* C's counselling-session reframing — it is the difference between a system that *records* allotments and one that can *defend* them in a tribunal.
2. *Biggest blind spot:* B lists many failure modes but offers no single mechanism that resolves several at once (a forced-relief/deemed-action Authority power would close disputed-handover, non-responsive-clearance, and source-refuses-to-relieve together).
3. *All five missed:* **mutual-transfer coupling beyond approval.** §5.6-5 makes mutual *approval* atomic, but relieving and joining are not coupled — if one half clears and the other's clearance stalls, you get an asymmetric exchange (one post double-filled, one double-vacant). No advisor caught the post-approval mutual coupling gap.

---

## Part 3 — Chairman Synthesis

### Agreements (high consensus)
- The BRD is a **strong, professional, build-ready baseline** with excellent integration framing, a coherent lifecycle state machine, and real statutory texture. (All five.)
- **Pay continuity is broken by design** — pay-stop at LWD / pay-start at join guarantees the gap the KPI forbids. (B, C, E; endorsed by all reviewers.)
- **Disputed handover and non-responsive clearance are unbounded blockers** needing an Authority forced-action / deemed mechanism. (B, with R5 generalising it.)
- **The SR outbox is a named-but-unspecified contract** — the top parallel-delivery risk. (E, R4.)

### Clashes
- **D vs C on complexity:** D calls the vacancy map gold-plating; C says the real over-engineering is the duplicated sanctioned-strength store. *Resolution:* both are right but different — defer the map's priority, and fix the strength duplication regardless. Not fundamental.
- **E vs C on counselling (FUNDAMENTAL):** E's clean batch sequencing assumes offline allotment; C says real counselling is an interactive, contested event. This is a genuine architectural fork — see focused second pass.

### Blind spots the whole council shares (surfaced in peer review)
- Inter-se **seniority on joining-date order** (R1).
- **Proof-of-service / acknowledgement** of the transfer order (R2).
- **Government quarters/estate** as a money-bearing sub-process, not one checklist tick (R3).
- **Gapless statutory order numbering** under retry/failure (R4).
- **Mutual-transfer coupling** at relieve/join, not just approval (R5).

### Idea Evolution
The proposal evolves from "a clean transfer-lifecycle recorder" to "a **custody-and-continuity engine**": (1) pay/service modelled as *continuous with a custody handoff* rather than stop/start; (2) an explicit **in-transit custody owner**; (3) an **Authority forced-action power** (deemed-relief, deemed-clearance, handover-under-protest) that unblocks the human-conflict failure modes as one mechanism; (4) a **representation/stay-order hold** state reflecting government reality; (5) counselling modelled as an **interactive session** for contestable allotment. These five shifts convert a structurally-complete BRD into a statutorily-defensible one.

### Focused Second Pass — the one FUNDAMENTAL clash (batch vs interactive counselling)
E's concern (sequencing/feasibility) and C's concern (legal defensibility) are reconcilable. Resolution: **keep the batch `allotment_method` for SENIORITY/MERIT/MANUAL drives** (e.g., ministerial cadres allotted purely by seniority — no live event needed), and **add an optional `COUNSELLING` session model** (already hinted by `drive_type = COUNSELLING` and `drive.status = COUNSELLING`) for cadres that require live, observed allotment. A `counselling_sessions` entity with per-candidate turn order, a vacancy lock during a candidate's turn, and an immutable choice log gives C's defensibility *without* destroying E's batch path for the cases that don't need it. The two models coexist, selected by `drive_type`. This is additive, not a rewrite.

### Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| 1 | Pay-stop at LWD / pay-start at join guarantees an unpaid transit gap, contradicting the ≥99% no-gap KPI | Critical | B / C | Model joining-time pay & paid transit; signal M10 for *continuity* + entitlement, not bare stop/start; SR records "no break in service" |
| 2 | In-transit employee has undefined org/payroll/headcount ownership (dual or zero posting) | Critical | B | Add explicit `in_transit_custody` rule + field; define which office owns pay/attendance/headcount during `IN_TRANSIT` |
| 3 | Disputed handover / non-responsive clearance can block relieving indefinitely | High | B / R5 | Authority forced-action: deemed-clearance after SLA+escalation, handover-under-protest, time-bound dispute resolution |
| 4 | Non-joining / abandonment / court stay unmodelled — permanent IN_TRANSIT limbo | High | B | Add `STAY_HOLD` + representation entity; abandonment path → revert-to-source / M09 disciplinary linkage |
| 5 | SR `outbox` referenced as frozen contract but never field-specified | High | E / R4 | Define `outbox` table fields, idempotency-key formula, dead-letter retention before parallel build |
| 6 | Cascading-vacancy double-allotment: when a post becomes "vacant" is undefined | High | B | Define vacancy state transition (vacant on relief, filled on join); transactional re-check at join, not only allotment |
| 7 | `vacancy_positions` duplicates M01/M06 sanctioned strength → drift | Medium | C / R3 | Make strength read-through from M01/M06 with reconciliation; M05 stores only drive-scoped reservation |
| 8 | "One active order per employee" blocks valid additional-charge / deputation overlap | Medium | C | Reframe to "one active *substantive* transition"; allow co-existing additional-charge & deputation order classes |
| 9 | No M10 entitlement contract (TTA/transfer-grant/joining-time differ by transfer_type) | Medium | E | Add entitlement signal keyed on transfer_type & ground; own-request vs admin distinction |
| 10 | Working-day/holiday calendar dependency uncontracted; silent wrong default | Medium | E | Define calendar service contract incl. regional calendars; remove silent Sat/Sun fallback |
| 11 | Inter-se seniority on joining-date order has no tie-break / sequence integrity | Medium | R1 | Capture joining sequence + deterministic tie-break; expose to M06 |
| 12 | No proof-of-service / acknowledgement of transfer order | Medium | R2 | Add served-on-date + acknowledgement entity; basis for relieve-by enforcement |
| 13 | Gapless statutory order numbering not guaranteed under retry/failure | Medium | R4 | Reserve-then-commit numbering with gap audit; per-office/per-year sequence policy |
| 14 | Mutual transfer coupled only at approval, not relieve/join | Medium | R5 | Couple mutual pair through relieving & joining; block asymmetric completion |
| 15 | Sensitive medical/spouse/compassionate docs in generic M13 store | Medium | D | Ring-fence sensitive-ground documents with restricted access class (DPDP sensitive category) |
| 16 | Government quarters/estate reduced to one checklist tick | Low/Med | R3 | Model quarter retention/vacation timeline + licence-fee recovery signal to M10 |
| 17 | Enum redundancy (REQUEST vs TRANSFER_ON_REQUEST; type/ground/priority overlap) | Low | D / R-consensus | Collapse/clarify into orthogonal classification; one canonical taxonomy |
| 18 | Vacancy map (FR-014) prioritised over more central representation flow | Low | D | Re-prioritise: map is enhancement; representation is baseline |

### Recommendation
**Adopt with mandatory revisions before build-freeze.** The BRD is structurally world-class but has **two Critical defects (pay continuity, in-transit custody)** that would cause live underpayment and corrupted headcount, plus **one Critical delivery risk (unspecified outbox)** that blocks the five-agent parallel plan. None require a rewrite — all are additive entities, fields, states, and contracts on a sound spine. Fix risks 1–6 before freezing contracts; fix 7–14 in BRD v2; schedule 15–18.

### The One Thing To Do First
**Replace the binary pay-stop/pay-start model with a service-continuity + joining-time-pay model, and define the in-transit custody owner in the same stroke.** These two are the same root defect — the BRD treats transit as dead time owned by no one. Fixing it makes the no-gap KPI achievable, fixes headcount/budget integrity, and forces the M10 entitlement contract (risk 9) and SR "no break in service" assertion to be written. Everything else is refinement on top.

---

## Adopted Improvements for BRD v2

1. **Replace pay-stop/pay-start with a service-continuity model.** Model the transit/joining-time period as *paid duty/leave*; signal M10 for pay *continuity* across the handoff rather than a stop at LWD and a start at join. Add a `joining_time_pay_admissible` rule and ensure the SR `JOINED`/`RELIEVED` events assert **no break in qualifying service**. (Risk 1)

2. **Add an explicit in-transit custody rule and field.** New `transfer_orders.in_transit_custody_org_unit_id` (or equivalent) defining which office owns the employee for payroll, attendance, leave, headcount, and disciplinary jurisdiction during `IN_TRANSIT`; add an integrity rule preventing dual or zero posting. (Risk 2)

3. **Add a joining-time-pay & transfer-entitlement signal to the M10 contract**, keyed on `transfer_type` and `ground` (own-request vs administrative differ in TTA, transfer grant, and joining-time admissibility). Extend §8.3 integration and §5.2.2 with an entitlement reference. (Risks 1, 9)

4. **Introduce an Authority "forced-action" power** as a single mechanism: `deemed_clearance` (after SLA + escalation chain dept-officer → dept-head → Authority), `handover_under_protest`, and `deemed_relief`/`stand_relieved`. Add a `forced_action_reason` + approver audit on the relevant entities. This closes disputed-handover, non-responsive-clearance, and source-refuses-to-relieve in one stroke. (Risk 3)

5. **Add deemed/escalation clearance to FR-TRJ-006:** per-item SLA with escalation tiers and an auto- or Authority-granted `WAIVED/DEEMED_CLEARED` state so one non-responsive officer cannot block relieving indefinitely. (Risk 3)

6. **Add a representation / stay-order hold state.** New `STAY_HOLD` order status and a `transfer_representations` entity (type: REPRESENTATION/COURT_STAY/RETENTION_REQUEST, authority, document, decision) that can pause an order at any pre-join stage with full audit. (Risk 4)

7. **Add a non-joining / abandonment path.** Define handling for an employee who never joins beyond grace: `LATE_JOINING_REVIEW → REVERT_TO_SOURCE` (re-join at source as a reverse joining) or **disciplinary linkage to M09**, with pay status defined for the limbo period. (Risk 4)

8. **Fully field-specify the `outbox` table in §5.2** (id, aggregate ref, event_type, payload, idempotency_key, status, attempt_count, next_attempt_at, dead_lettered_at, created_at) and define the idempotency-key formula and dead-letter retention. Freeze this contract before parallel build. (Risk 5)

9. **Introduce a single `TransferOrderStateService`** owned by one agent and consumed by C and D, as the only writer of `transfer_orders.status`; update §14.3 parallel-agent plan to remove the shared-write conflict. (Risk 5, sequencing)

10. **Define the vacancy lifecycle explicitly:** a post becomes `vacant` on **relieving** at source and `filled` on **joining** at destination; add a transactional re-check of `vacant_count > 0` at **join** time (not only at allotment) to prevent cascading-vacancy double-fill in bulk drives. (Risk 6)

11. **Make `vacancy_positions` strength read-through.** Remove `sanctioned_strength`/`filled_count` as a second source of truth; read from M01/M06 with a reconciliation job, keeping only drive-scoped reservation state in M05. (Risk 7)

12. **Reframe integrity rule §5.6-1** from "one active order" to "**one active *substantive* posting transition**," and add `order_class` (SUBSTANTIVE / ADDITIONAL_CHARGE / DEPUTATION / REPATRIATION) so additional-charge and deputation can legitimately co-exist with a substantive posting. (Risk 8)

13. **Add a working-day/holiday calendar service contract** (regional-calendar aware) as a named dependency in §8.3; remove the silent "Sat/Sun + national holidays" fallback in FR-TRJ-009 and replace with an explicit configured-calendar requirement. Compute joining time by **distance band** per §16.4, not a flat `joining_time_days`. (Risk 10)

14. **Capture joining-sequence integrity for seniority.** Record the joining order/timestamp and a deterministic tie-break (e.g., by `service_no`) and expose it to M06; add an integrity rule so concurrent same-cadre joinings produce a defensible inter-se order. (Risk 11)

15. **Add order proof-of-service & acknowledgement.** New fields/entity for `served_on_date`, `acknowledged_at`, and delivery channel; make relieve-by enforcement and non-compliance discipline reference the served date, not the order date. (Risk 12)

16. **Guarantee gapless statutory numbering.** Replace "retry sequence on collision" with a reserve-then-commit numbering scheme, per-office/per-year sequence policy, and a gap-audit report; document in §16. (Risk 13)

17. **Couple mutual transfers through relieving and joining**, not just approval (§5.6-5). Add an integrity rule preventing asymmetric completion (one half joined while the other's clearance stalls), with a paired-progress guard. (Risk 14)

18. **Add a `COUNSELLING` interactive-session model** alongside the batch allotment: new `counselling_sessions` entity with per-candidate turn order (by seniority/merit), a vacancy lock during a candidate's turn, and an immutable choice log — selected when `drive_type = COUNSELLING`; retain batch allotment for SENIORITY/MERIT/MANUAL drives. (Fundamental clash resolution)

19. **Ring-fence sensitive-ground documents.** Classify medical/spouse/compassionate supporting documents as a DPDP sensitive category in M13 with restricted access and explicit access logging; note in §9 Privacy. (Risk 15)

20. **Model government quarters/estate as a sub-process,** not one checklist line: retention-allowed flag, vacation-by date, and a licence-fee-recovery signal to M10 when accommodation is retained post-transfer. (Risk 16)

21. **Rationalise the enum taxonomy.** Collapse `REQUEST`/`TRANSFER_ON_REQUEST` duplication, and define orthogonal axes: `transfer_type` (mechanism), `ground` (justification), `priority_category` (protection) with a clear catalog note so the five agents capture data consistently. (Risk 17)

22. **Add acceptance tests for the new invariants**, especially: pay-continuity/no-gap (now testable post-improvement 1), in-transit custody (no dual/zero posting), deemed-clearance/forced-relief audit, mutual-pair coupling, and "0% *un-overridden* ban/tenure violations" (assert the override audit trail so valid overrides aren't flagged as failures). (Risks 1, 2, 3, 14; testability)

23. **Add a "Domain Primer" appendix** defining LPC, no-dues, imprest/DDO charge, MCC, cadre, officiating, forenoon/afternoon relieving, deputation/repatriation — and explicitly state *why forenoon/afternoon relieving matters* (it sets whether the day counts as source duty vs transit, affecting pay and seniority). (Outsider/clarity)

24. **Re-prioritise FR-TRJ-014 mapping** as a Phase-2 enhancement and elevate the representation/stay-order flow (improvement 6) into the baseline build order in §14.2. (Risk 18)

---
*End of council report — M05-TRJ BRD v1.0*
