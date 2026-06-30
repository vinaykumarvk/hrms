# Adversarial Idea Evaluator — Council Report

**Subject:** M04-LSR — Leave Management Integration with Digital Service Register (BRD v1.0)
**Framed question:** Is this Leave-to-SR integration BRD complete, correct, and world-class (idempotent exactly-once posting, transactional outbox, reconciliation, correction/reversal into an append-only SR, qualifying-service flags, dead-letter/replay) for a leading global organisation's HRMS? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?
**Method:** Karpathy LLM-Council + structured adversarial debate — 5 independent advisors → anonymous peer review → chairman synthesis → adopted improvements.
**Date:** 2026-06-30

---

## Part 1 — The Five Advisors

### Advisor 1 — The Proponent

This BRD is genuinely above the line for a government HRMS and competitive with how Workday/SuccessFactors model statutory integrations. It correctly identifies that the Service Register is a *legal* artefact and that leave-to-SR posting is an integration-reliability problem, not a CRUD problem. The strongest decisions:

- **Transactional outbox + deterministic idempotency key + delegated dedupe at M12.** This is the textbook exactly-once-effect pattern, and the BRD threads `correlation_id` end-to-end, pins `mapping_version` in the key, and logs every attempt to an append-only `sr_posting_log`. The crash-after-success self-heal edge case (FR-03 edge 1) is explicitly handled — most in-house integrations miss exactly this.
- **Append-only correction model.** Refusing to ever `UPDATE`/`DELETE` `service_register_events`, and instead posting `REVERSAL`/`AMENDMENT`/`SUPERSEDE` entries linked via `sr_correction_link`, with a net-effective chain resolver, is exactly right for a tamper-evident statutory ledger and for audit by the Accountant General.
- **Versioned, effective-dated mapping catalog** with maker (Sys Admin) ≠ checker (SR Custodian), no-overlap-at-publish enforcement, and "no silent drop → DLQ MAPPING_MISSING." Changing statutory mapping without a code deploy is best-in-class.
- **PRE_PENSION reconciliation as a gate** before M11 processing, plus the `qualifying_service_rule` sourced *only* from the mapping (single source of truth), directly protects pension correctness — the highest-value outcome.
- **Operational maturity:** DLQ with maker-checker resolution, replay/backfill with dry-run + approval, shadow→pilot→cohort rollout, evidence pack with checksum, and a real monitoring console with SLA alerting.

The data model is coherent (10 owned entities, clean ownership matrix, full enum catalog, sample rows), state tables are explicit, and the failure-classification appendix is concrete. For a public-sector build this is a strong, buildable v1. My only caution: it is strong *on paper* — several guarantees are asserted rather than contracted with the systems M04 does not own.

### Advisor 2 — The Contrarian (non-obvious failure modes)

The reliability story has real holes once you stop reading the happy path.

1. **Stuck `IN_FLIGHT` rows (the silent loss the author missed).** The relay claims a row, sets `IN_FLIGHT`, calls M12, then crashes before recording the outcome. `SELECT … FOR UPDATE SKIP LOCKED` releases the row lock on crash, but the *status* stays `IN_FLIGHT`. The claim query looks for `PENDING`/retry-eligible `FAILED` rows — it will never re-pick an `IN_FLIGHT` row. That event is now permanently stranded: not posted, not retried, not dead-lettered, invisible to DLQ. There is **no lease/visibility-timeout reaper** anywhere in FR-03/FR-04 or the state table (10.1). This is the single most dangerous omission because it is *silent* — exactly the failure auditors penalise.

2. **Idempotency key breaks under remap → duplicate SR entry.** The key includes `mapping_version`, and Appendix A *intends* a remap to "produce a new logical post." But a DLQ'd event (e.g., `MAPPING_MISSING`) that is replayed after a covering mapping is published computes a **different** key than any earlier attempt — and if a degraded earlier attempt had actually reached M12, you now get two SR entries under two keys. Worse, `mapping_version` is "pinned at claim time" (BR-03.2) but is **not persisted on the outbox row**; across FAILED→re-claim cycles the relay recomputes it, so a republish mid-retry silently changes the key. Exactly-once is not preserved across mapping changes.

3. **No ordering guarantee → spurious ORPHAN_CORRECTION and wrong net-effective state.** Multiple horizontal workers + SKIP LOCKED means `LEAVE_AMENDED`/`LEAVE_CANCELLED` for a spell can be posted **before** the `LEAVE_APPROVED` they correct. FR-08 then can't find the original → false `ORPHAN_CORRECTION`; or the chain resolver returns the wrong net-effective entry. Nothing serialises events for the same employee/spell, and nothing blocks a correction until its original is `POSTED`.

4. **Reconciliation false positives will swamp operators.** Appendix C left-anti-joins leave→SR to raise `MISSING_SR`, but does not subtract events that are *legitimately* `PENDING`, in backoff, or dead-lettered. Any leave correctly sitting in DLQ is reported as `MISSING_SR`. And because amendments **mutate the business key** (spell dates change), business-key matching produces `DIVERGENT_FIELD` noise on every amended leave. The "drift findings older than 7 days = 0" target is unachievable if the detector cries wolf.

5. **The MAPPING_MISSING contradiction = a DLQ flood.** Rule 5 says any unmapped `(leave_type, event_type)` dead-letters as `MAPPING_MISSING`, but BR-01.1 says non-SR leave (casual leave) is "filtered by mapping coverage, not dropped." These are mutually exclusive: every casual-leave approval would create an outbox row that dead-letters. There is no explicit `EXCLUDED/NON_SR` mapping outcome to distinguish "deliberately not posted" from "missing mapping."

6. **Correction posting is a non-atomic two-system write.** FR-08 appends an SR entry in M12 **and** inserts `sr_correction_link` in M04. If the SR append succeeds and the local link insert fails, the correction is unlinked → it reconciles as `DUPLICATE_SR`/`ORPHAN_CORRECTION`. Corrections don't clearly flow through the same outbox/idempotency machinery as primary posts, so their reliability is weaker than the path they're meant to fix.

### Advisor 3 — The First-Principles Thinker

Strip it down: the actual requirement is "every approved/cancelled/amended leave spell deterministically and provably contributes its correct qualifying-service effect to the statutory register, once, forever." Two hidden assumptions deserve challenge.

**Hidden assumption A: M03 and M04 share a transaction/database.** The entire "no lost events" guarantee (FR-01 AC-1/AC-2) requires the outbox row to be written *in the same DB transaction* as M03's ledger commit. The BRD admits in §2.5 this needs "a shared outbox table M04 reads." If M03 and M04 are independent services with independent databases (the normal microservice assumption, and what "bounded context" implies), **there is no shared transaction** and the foundational guarantee evaporates — you fall back to dual-write, the exact problem the outbox is supposed to solve. The honest architecture is: **the outbox belongs inside M03's bounded context**, written by M03 in M03's transaction, and M04 is purely the *relay + reconciliation + statutory-semantics* layer. As written, M04 "owning" `leave_event_outbox` while requiring M03's transaction to write it is a boundary violation that will surface as either (a) tight DB coupling or (b) a quietly lossy capture step. This needs to be stated as an explicit architectural decision, not an "or."

**Hidden assumption B: a bespoke point-to-point relay is the right model.** Is it? For one source (M03) and one target (M12), a DB-outbox relay is *simpler and more debuggable* than standing up Kafka — so the broker-optional stance is correct and I'd defend it against premature event-bus enthusiasm. **However**, the deeper first-principles question is whether M04 should exist as a separate module at all, versus M12 exposing an idempotent ingest port and M03 posting to it directly with the outbox in M03. The value M04 adds that justifies separateness is the **statutory-semantics layer** (mapping catalog, qualifying-service rules, annotations, correction chains, reconciliation, evidence) — that is real and worth a module. But everything in M04 that is *generic reliability plumbing* (outbox, retry, breaker) is arguably commodity that belongs in a shared integration library, not re-specified per module. The BRD conflates "the statutory bridge" (genuinely novel, keep) with "a reliable-messaging framework" (commodity, don't reinvent).

One more: exactly-once is **delegated entirely to M12's dedupe**, which M04 does not own and has not contracted. From first principles, M04 cannot *guarantee* a property it has outsourced to an uncontracted dependency.

### Advisor 4 — The Outsider

A smart HR director or auditor reading this would hit a wall of jargon that hides unanswered questions: "transactional outbox," "SKIP LOCKED," "circuit half-opens after cooldown," "left-anti-join," "DUPLICATE_NOOP." None of this tells a Registrar what they actually need to know: *if a clerk approves leave today, when does it appear in my Register, who do I call when it doesn't, and how do I prove to the Accountant General that nothing was lost?* The BRD has the machinery but buries the human accountability.

Concrete clarity gaps an outsider would flag:

- **Who is accountable for a stuck integration?** The dashboard shows DLQ depth and breaker state, but the operating model — an on-call rota, an SLA that says "a MISSING_SR for a near-retirement employee is fixed within X hours" — isn't there. "IntegOps" is a role with no staffing or escalation-time commitment.
- **"Exactly-once" is over-promised language.** The system delivers *at-least-once with dedupe*, i.e., exactly-once *effect conditional on M12*. Telling auditors "exactly-once" without the caveat is a credibility risk when the first duplicate appears.
- **Maker-checker is applied inconsistently and unexplained.** A routine `LEAVE_AMENDED` auto-posts an `AMENDMENT` that changes qualifying service with **no human approval** (FR-08, system principal), yet fixing the *same field* via reconciliation (FR-07) requires SR Custodian sign-off. An outsider rightly asks: why does the automated path get to silently change a pension-affecting figure when the manual path doesn't?
- **Complexity that may not be needed:** circuit breaker *and* retry/backoff *and* DLQ *and* reconciliation *and* replay *and* backfill, plus a throughput NFR of **50 events/sec sustained, 500/sec burst** — that is ~4.3 million events/day. A whole state's civil service does not approve millions of leave applications a day; this is fantasy-scale capacity that will justify infrastructure nobody needs. Right-size the NFR to real volume (likely a few thousand leave decisions/day) and reconsider whether the circuit breaker earns its operational cost for a single downstream.
- **Plain-language SR semantics missing:** "qualifying vs non-qualifying" and "increment deferral 90 days" are rendered as machine annotations but there's no statement of *which government rule* (CCS Leave Rules / state service rules) each mapping implements. An auditor will ask for the rule citation, not a `qualifying_rule_ref` string.

### Advisor 5 — The Executor

Feasibility is good; the BRD is buildable. But the build plan (14.3) front-loads risk in the wrong order and a few dependencies are not landable as written.

- **Hard external dependency that gates everything: the M12 idempotent write port contract.** §2.5 *assumes* M12 "exposes an idempotent SR write port accepting an idempotency key, returns `sr_event_id`, persists `correlationId`, and enforces append-only." Nothing in M04 works without this, yet it is an assumption, not a signed bilateral contract with a **dedupe-key retention window** and conformance tests. **Monday step #1 is not code — it is locking the M12 port spec** (idempotency semantics, key retention ≥ max replay age, `correlationId` persisted+indexed, error codes for `LSR_SR_CONFLICT`). If M12's dedupe window is shorter than the 7-year DLQ replay horizon, a late replay double-posts. This is the critical-path item.
- **Second dependency: the M03 capture mechanism.** Resolve First-Principles assumption A before building FR-01: is the outbox in M03's transaction (preferred) or is M04 polling M03's ledger (lossy)? FR-01's acceptance criteria are untestable until this is decided.
- **Sequencing fix:** Track B (posting core) must include the **stuck-IN_FLIGHT reaper** and **persisted pinned mapping_version** before any live posting, or the pilot will strand events. Reconciliation (Track D) cannot be validated until the relay emits real `sr_posting_log` data and until recon is made *outbox/DLQ-state-aware* (else it false-positives in the pilot).
- **Realistic ordering:** with horizontal workers + SKIP LOCKED, you need a partition key (serialise per `employee_id` or per leave-spell lineage) and a "don't post a correction before its original is POSTED" guard. This is a non-trivial relay change; budget for it now, not after the pilot finds duplicates.
- **Effort estimate:** the statutory-semantics core (FR-01/02/03/04/08/09) is ~1 quarter with a 3-engineer team *if* M12/M03 contracts land in week 1. Reconciliation + historical digitisation (FR-06/07/11) is a second quarter — the historical paper-scan resolution (`service_no_raw`→`employee_id` for pre-system retirees) is the long pole and will need M01 + manual SR-Custodian adjudication; don't let it block live posting.
- **Backfill correctness gap:** FR-12 backfill "generates capture events" with a *fabricated* `correlation_id` outside any M03 transaction. Define how backfilled `correlation_id` is derived deterministically from the business key, or a later genuine M03 emission double-posts. This is a foot-gun for the go-live migration.

---

## Part 2 — Anonymous Peer Review

*(Advisors relabelled A–E and shuffled. Each reviews the others.)*

**Reviewer A**
1. *Strongest analysis:* The Contrarian's stuck-`IN_FLIGHT` catch — it is a concrete, falsifiable, silent-loss bug with a clear mechanism (status stays IN_FLIGHT, claim query never re-picks it), and it directly contradicts the BRD's headline "no event loss" claim.
2. *Biggest blind spot:* The Contrarian lists six failure modes but proposes no priority or detection strategy — which one fails first in the pilot? (Answer: reconciliation false positives, because they appear on day one at volume.)
3. *What all five missed:* see consolidated note below.

**Reviewer B**
1. *Strongest:* The First-Principles challenge to the M03/M04 shared-transaction assumption — it shows the *foundational* guarantee may be vapour depending on an architecture decision the BRD never makes, which subsumes several of the Contrarian's symptoms.
2. *Biggest blind spot:* First-Principles is comfortable keeping DB-outbox over a broker but doesn't address how the relay achieves **ordering** without a partition key — a broker would at least give per-key ordering for free, which weakens the "broker-optional is obviously right" stance.
3. *What all five missed:* see below.

**Reviewer C**
1. *Strongest:* The Executor's insistence that Monday's step is contracting the M12 port, not writing code — correctly identifies that the entire exactly-once claim is delegated to an uncontracted dependency, and ties it to a concrete failure (replay age > dedupe window).
2. *Biggest blind spot:* The Executor under-weights the **historical digitisation legal risk** — posting decades-old leave into a statutory pension-affecting register from paper scans is not just a long pole, it is a *correctness and liability* hazard (wrong qualifying days → wrong pension) that deserves its own controls, not just "manual adjudication."
3. *What all five missed:* see below.

**Reviewer D**
1. *Strongest:* The Outsider's point that "exactly-once" is over-promised language and that maker-checker is applied inconsistently — both are credibility/governance issues a Registrar and auditor will actually raise, and both are cheap to fix.
2. *Biggest blind spot:* The Outsider calls the throughput NFR fantasy and the circuit breaker possibly redundant, but doesn't acknowledge burst scenarios — a *historical backfill or cohort migration* genuinely can push thousands of events/minute, so some burst capacity and back-pressure to protect M12 is warranted (just not 500/sec steady).
3. *What all five missed:* see below.

**Reviewer E**
1. *Strongest:* The Proponent's framing that the *statutory-semantics layer* is the real value and is best-in-class — important because it keeps the critique from throwing out a genuinely strong design; the fixes should harden, not redesign.
2. *Biggest blind spot:* The Proponent accepts the BRD's guarantees at face value ("self-heals," "exactly-once," "no loss") without noticing they are asserted, not contracted or tested — precisely the gap the other four exploit.
3. *What all five missed:* see below.

**Consolidated "what ALL FIVE missed" (genuine):**
No advisor addressed the **`correlation_id` / leave-spell-lineage modelling inconsistency**. Data-integrity rule 1 says amendments get a **new** `correlation_id` with `prior_outbox_id`; but reconciliation (FR-06/Appendix C) and the correction chain (FR-08) match and link by `correlation_id` *and* by business key `(employee_id, leave_type, spell_start, spell_end)` — and **amendments mutate spell_start/spell_end**. So an amended leave has neither a stable `correlation_id` (it changed) nor a stable business key (dates changed) to tie the `AMENDMENT` SR entry back to the original spell. There is **no stable `leave_spell_lineage_id`** threaded through approve→amend→cancel. Every downstream guarantee — net-effective resolution, duplicate detection, orphan detection, pension impact totalling, evidence-chain reconstruction — silently depends on a join key that the model lets drift. This is the load-bearing modelling defect underneath the Contrarian's ordering/false-positive symptoms and the Executor's backfill correlation-id concern, and none of the five named it directly.

---

## Part 3 — Chairman Synthesis

### Agreements (high consensus)
- The **statutory-semantics layer is genuinely best-in-class** and should be preserved: append-only corrections + link table, versioned effective-dated mapping catalog, mapping-sourced qualifying-service rules, PRE_PENSION gate, evidence pack. Hardening, not redesign.
- The headline reliability guarantees ("no loss," "exactly-once," "self-heals") are **asserted, not contracted or tested** against M03 and M12 — the two systems M04 does not own.
- The reliability plumbing has **concrete, fixable gaps** (stuck IN_FLIGHT, ordering, idempotency-under-remap, recon false positives) rather than fatal flaws.

### Clashes
- **Broker-optional (First-Principles: keep DB-outbox) vs ordering (Reviewer B: a broker gives per-key ordering free).** Resolved below.
- **Circuit breaker: over-engineering (Outsider) vs warranted back-pressure for migration bursts (Reviewer D).** Resolved: keep simple back-pressure/rate-limit to protect M12; demote the full breaker to optional/Phase-2 since for a single downstream, bounded retry + DLQ + the relay-pause override already cover the outage case.
- **Maker-checker asymmetry: necessary automation (auto-corrections must not require human gating at volume) vs governance risk (silent pension-affecting changes).** Resolved: tier it — routine reversals/amendments auto-post but are *flagged and post-audited*; any qualifying-service flip after pension processing has started requires approval (the BRD already alerts CRITICAL here — extend to a hard gate).

### Blind spots (newly surfaced)
1. **No stable `leave_spell_lineage_id`** (the unanimous miss) — the join key drifts across amendments.
2. **No M12/M03 bilateral contract + conformance test** — exactly-once is delegated to an uncontracted dependency with no specified dedupe-key retention window.
3. **Stuck-`IN_FLIGHT` reaper** absent — a silent-loss path.
4. **Recon not outbox/DLQ-state-aware** — guaranteed false positives.
5. **`MAPPING_MISSING` vs non-SR-leave contradiction** — DLQ flood for casual leave.

### Idea evolution
The proposal evolves from *"a reliable bespoke relay that guarantees exactly-once posting"* to *"a statutory-semantics bridge that (a) makes its source/target guarantees explicit, contracted, and conformance-tested, (b) threads a stable spell-lineage identity, and (c) hardens the relay against the three classic outbox bugs — stuck in-flight, key drift under remap, and unordered corrections — while right-sizing the generic plumbing it should not be reinventing."* Same skeleton, materially more bulletproof.

### Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Stuck `IN_FLIGHT` rows after relay crash → silent loss, invisible to DLQ | Critical | Contrarian | Add a `claimed_at`/lease with a visibility-timeout reaper that returns expired `IN_FLIGHT` rows to retry-eligible; alert on reaped rows. |
| R2 | Exactly-once delegated to uncontracted M12; dedupe window < replay age → duplicate SR entries | Critical | Executor / First-Principles | Sign a bilateral M12 port contract: idempotency-key retention ≥ max replay age (7y), `correlationId` persisted+indexed, conformance tests in CI. |
| R3 | No stable spell-lineage key; amendments mutate both `correlation_id` and business key → broken net-effective/dup/orphan resolution | Critical | Peer review (all-missed) | Introduce `leave_spell_lineage_id` (from M03, stable across approve/amend/cancel); join recon and corrections on it. |
| R4 | Idempotency key changes under remap / unpinned `mapping_version` → duplicate posting on replay | High | Contrarian | Persist pinned `mapping_version` on the outbox row at first claim; exclude `mapping_version` from the *dedupe* key (use lineage+event-sequence) and treat intentional remap as an explicit correction, not a new post. |
| R5 | No ordering: corrections posted before originals → false ORPHAN_CORRECTION / wrong net-effective | High | Contrarian / Executor | Partition the relay by `employee_id`/lineage for in-order delivery; guard: a correction is not eligible until its original is `POSTED`. |
| R6 | Reconciliation false positives (legitimate PENDING/DLQ shown as MISSING; amended spells shown as DIVERGENT) | High | Contrarian | Make recon outbox/DLQ-state-aware (subtract in-flight/dead-lettered); resolve correction chains and match on lineage before diffing. |
| R7 | M03/M04 shared-transaction assumption may be false → lossy capture | High | First-Principles | Decide and document: outbox lives in M03's tx (preferred) or M04 polls — and if polling, add source-ledger↔outbox reconciliation. |
| R8 | `MAPPING_MISSING` DLQ flood from non-SR leave (casual) | High | Contrarian | Add explicit `EXCLUDED_NON_SR` mapping outcome; only truly unmapped SR-affecting types dead-letter. |
| R9 | Correction posting non-atomic (SR append in M12 + link in M04) → unlinked corrections | Medium | Contrarian | Route corrections through the same outbox/idempotency machinery; make `sr_correction_link` recoverable from M12-stored `correlationId`/lineage; reconcile links. |
| R10 | "Exactly-once" over-promised; auditor credibility risk | Medium | Outsider | Restate as "exactly-once effect (at-least-once + idempotent dedupe), conditional on M12 contract R2"; document the guarantee precisely. |
| R11 | Maker-checker asymmetry: silent auto-correction of pension-affecting qualifying service | Medium | Outsider | Tier the controls: auto-post routine corrections but post-audit + flag; hard-gate any qualifying-service change after pension processing has begun. |
| R12 | Throughput NFR (50/s sustained, 500/s burst) fantasy-scale → over-provisioned infra | Medium | Outsider | Right-size to real volume (low thousands/day); keep modest burst + rate-limit/back-pressure to protect M12 during migration. |
| R13 | Circuit breaker adds operational complexity (stuck-open incidents) for a single downstream | Low | Outsider | Demote full breaker to optional/Phase-2; ship bounded-retry + DLQ + manual relay-pause first. |
| R14 | Backfill fabricates `correlation_id` outside M03 tx → later genuine emission double-posts | Medium | Executor | Derive backfill identity deterministically from `leave_spell_lineage_id`/business key so it dedupes with any future live event. |
| R15 | Historical paper-scan digitisation → wrong qualifying days → wrong pension (liability) | Medium | Peer review (C) | Treat migrated qualifying-service entries as provisional until SR-Custodian adjudicated; rule-citation required; separate confidence flag. |
| R16 | Mapping-by-`spell_start` (FR-02) contradicts split-by-effective-date (FR-09) for straddling spells | Low | Contrarian | Define one rule: split a rule-straddling spell into per-effective-range SR sub-entries (or pin to spell_start) — pick one, remove the contradiction. |
| R17 | M03 (or compromised source) writes outbox directly → fraudulent statutory/pension entries | Medium | Outsider | Authenticate/sign the capture payload; constrain who may write the outbox; reconcile outbox against M03 ledger as an integrity check. |
| R18 | No on-call/SLA operating model for stranded statutory events (esp. near-retirement) | Low | Outsider | Define IntegOps rota + tiered resolution SLAs (near-retirement MISSING_SR = expedited). |

### Recommendation
**Proceed — conditional GO.** The design is fundamentally sound and the statutory-semantics layer is a keeper. It is *not* yet bulletproof: it has three Critical issues (R1–R3) that are silent-correctness hazards, all fixable without redesign. Gate live posting (Phase 1 pilot) behind R1–R8. Do **not** soften the language or ship "exactly-once" until R2's M12 contract is signed and conformance-tested.

### The One Thing To Do First
**Lock the M12 SR write-port contract and the M03 capture mechanism — on paper, before any code.** Specifically: M12 idempotency-key retention ≥ 7 years (≥ max replay/backfill horizon), `correlationId` **and** a new `leave_spell_lineage_id` persisted and indexed on the SR entry, append-only enforced, plus a CI conformance test that proves dedupe holds across that window. Everything M04 claims — exactly-once, replay safety, reconciliation, evidence chains — collapses if this contract is assumed rather than guaranteed.

### Focused second pass — the one fundamental clash
**DB-outbox vs ordering.** First-Principles is right that a broker is overkill for one source/one target, and the BRD's broker-optional stance should hold. But Reviewer B is right that the relay then *owns* ordering, which the current SKIP-LOCKED design abandons. Resolution: keep the DB-outbox, and add a lightweight **per-`employee_id` (or per-lineage) partitioned claim** — workers claim a whole partition's oldest-eligible event and process that partition serially, preserving approve→amend→cancel order without a broker. This resolves the clash with the cheaper technology and directly mitigates R5. No fundamental redesign is warranted.

---

## Adopted Improvements for BRD v2

1. **Add `leave_spell_lineage_id` (new field, stable across approve/amend/cancel).** Sourced from M03, carried on `leave_event_outbox`, `sr_posting_log`, every SR entry, and `reconciliation_finding`. Make it the primary join key for net-effective resolution, duplicate/orphan detection, pension totalling, and evidence-chain reconstruction. (R3)
2. **New FR: Stuck-in-flight reaper.** Add `claimed_at` (and lease/visibility-timeout) to `leave_event_outbox`; a sweeper returns `IN_FLIGHT` rows whose lease expired to retry-eligible, increments `attempt_count`, and emits a metric/alert. Add the `IN_FLIGHT → (lease expired) → FAILED` transition to state table 10.1. (R1)
3. **New contract artefact: M12 SR write-port bilateral spec + CI conformance test.** Specify idempotency-key retention window ≥ max replay/backfill age (7y), mandatory persistence + indexing of `correlationId` and `leave_spell_lineage_id`, append-only enforcement, and the exact `LSR_SR_CONFLICT` semantics. Move this from §2.5 "assumption" to a signed dependency. (R2)
4. **Decide and document the capture architecture.** State explicitly whether `leave_event_outbox` is written inside M03's transaction (preferred) or M04 polls M03's ledger. If polling, add a new FR: **source-ledger ↔ outbox reconciliation** to catch capture loss. Update §2.5 and FR-01 acceptance criteria to be testable. (R7)
5. **Persist the pinned `mapping_version` on the outbox row at first claim** (new field `pinned_mapping_version`), and resolve it once — never recompute across retries. (R4)
6. **Redefine the dedupe key off `mapping_version`.** Base the idempotency/dedupe key on `leave_spell_lineage_id + event_type + event_sequence`; treat an intentional remap as an explicit **correction** (new SR entry via `sr_correction_link`), never as a silently-new post under a new key. Update Appendix A. (R4)
7. **Add per-`employee_id`/per-lineage partitioned, in-order relay claiming**, replacing naive SKIP-LOCKED row claim, plus a hard guard: a `LEAVE_CANCELLED`/`LEAVE_AMENDED` event is not posting-eligible until its original spell entry is `POSTED`. Add a new outbox status or guard for "blocked-awaiting-original." (R5)
8. **Make reconciliation outbox/DLQ-state-aware.** Appendix C must exclude events legitimately `PENDING`, in backoff, or `DEAD_LETTERED` from `MISSING_SR`, and must resolve correction chains and match on `leave_spell_lineage_id` before raising `DIVERGENT_FIELD`. Add an informational "pending/quarantined" bucket distinct from findings. (R6)
9. **Add explicit `EXCLUDED_NON_SR` mapping outcome** to `sr_event_mapping.sr_entry_type`/a new disposition enum. Resolve the BR-01.1 vs rule-5 contradiction: only unmapped *SR-affecting* `(leave_type, event_type)` dead-letters as `MAPPING_MISSING`; deliberately excluded leave is recorded as no-op, not DLQ'd. (R8)
10. **Route correction posting through the same outbox + idempotency machinery as primary posting**, and make `sr_correction_link` recoverable/reconcilable from M12-stored `correlationId`/lineage so a partial two-system write cannot leave an unlinked correction. Add a recon check for "SR correction entry without link." (R9)
11. **Restate the reliability guarantee precisely.** Replace bare "exactly-once" with "exactly-once *effect* = at-least-once delivery + idempotent dedupe, conditional on the M12 contract (Improvement 3)." Update Executive Summary, NFRs, and Glossary. (R10)
12. **Tier maker-checker for corrections.** Routine auto-posted reversals/amendments proceed without gating but are flagged and post-audited; **any** qualifying-service change after pension processing has started becomes a hard maker-checker gate (extend the existing CRITICAL alert in BR-09.3 into a blocking control). (R11)
13. **Right-size throughput NFRs** to realistic government volume (low thousands of leave decisions/day; bursts during migration only). Keep a modest burst ceiling plus rate-limiting/back-pressure to protect M12; remove the 50/s-sustained, 500/s-burst figures. (R12)
14. **Demote the circuit breaker to optional / Phase-2.** Ship bounded retry + DLQ + manual relay-pause override first; document the breaker as an enhancement, not core. Mark state table 10.5 accordingly. (R13)
15. **Define deterministic backfill identity.** FR-12 backfilled events derive `correlation_id`/key from `leave_spell_lineage_id` + business key so a later genuine M03 emission dedupes instead of double-posting. Add to BR-12.x. (R14)
16. **Add migrated-entry provisional/confidence handling.** Historical `service_register_events` from paper scans carry a confidence/`PROVISIONAL` flag until SR-Custodian adjudicated, require a statutory `rule_ref` citation for qualifying-service, and are excluded from final pension computation until confirmed. New AC on FR-11. (R15)
17. **Resolve the straddling-spell rule conflict** between FR-02 (resolve by `spell_start`) and FR-09 (split by effective date). Pick one — recommended: split a rule-straddling spell into per-effective-range SR sub-entries — and remove the contradiction from both FRs. (R16)
18. **Authenticate/sign the capture payload and constrain outbox writers.** Add payload integrity (signature/HMAC) so M04 can verify a captured event genuinely originated from M03, plus periodic outbox↔M03-ledger integrity reconciliation, closing the fraudulent-statutory-entry vector. (R17)
19. **Add statutory rule citations to the mapping catalog.** Extend `sr_event_mapping` with a mandatory human-readable rule reference (e.g., CCS Leave Rule / state service rule) for every qualifying-service and annotation outcome, surfaced in the audit evidence pack. (R10/Outsider)
20. **Define the IntegOps operating model.** Add to Section 11/13 a tiered resolution SLA (e.g., near-retirement `MISSING_SR` expedited within hours), an on-call/escalation path, and ownership for breaker-open and DLQ-aging incidents. (R18)
21. **Add a "pre-pension completeness certificate" output** to FR-09/FR-14: a signed, checksummed evidence artefact asserting zero open HIGH/CRITICAL findings and full lineage for the employee, consumable as M11's gate input — making the PRE_PENSION reconciliation a provable contract rather than a status. (Proponent strength, hardened)
