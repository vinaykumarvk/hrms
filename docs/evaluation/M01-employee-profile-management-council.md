# Adversarial Council Evaluation — M01 Employee Profile Management BRD (v1.0)

**Artefact under evaluation:** `docs/brd/v1/M01-employee-profile-management.md`
**Shared context:** `docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Employee Profile Management BRD complete, correct, and world-class for a leading global organisation's HRMS (with public-sector statutory needs)? What is missing, wrong, risky, over-engineered, or below best-in-class — and what concrete changes would make it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → focused second pass → adopted improvements.
**Date:** 2026-06-30

---

## Chairman's Verdict (read this first)

This is an **unusually strong, genuinely buildable BRD** — top-decile for a public-sector HRMS and in several places (position management, effective dating, field-level access policy, outbox SR events, reversible dedup, consumption-API-as-SSOT) it is at honest Workday/SuccessFactors parity. It would pass most government procurement bars today.

It is **not yet bulletproof**, and the gaps cluster in three places that are precisely where a leading global organisation is judged:

1. **Indian statutory compliance is asserted, not engineered.** "DPDP-aligned" and "Aadhaar tokenised" are claims, not designs. The Aadhaar Act 2016 / UIDAI Data Vault, DPDP consent-notice-grievance-DPO-breach mechanics, the retention-vs-erasure conflict, and category/PwD/DOB-change statutory processes are missing or hand-waved.
2. **A few correctness/architecture defects are load-bearing.** Cross-module FK re-pointing during merge violates the bounded-context boundary the whole BRD is built on; personal attributes (name/gender/category/marital status) are overwritten instead of effective-dated; positions are not effective-dated (Pay-Commission revisions become unreconstructable); and a wrong FR cross-reference (§3 cites FR-012 for field access; it is FR-013).
3. **One business rule is arguably unlawful and one target is unrealistic.** A data-quality `BLOCKED` flag that excludes an employee from payroll can amount to withholding a government servant's lawful salary; and the 99.5%-VALID-on-first/second-pass migration target is fantasy against paper service books.

Recommendation: **PROCEED to v2 with mandatory revisions**, not a rewrite. Fix the compliance engineering, the merge boundary, attribute history, the payroll-blocking rule, and migration realism. The council's consolidated hand-off is the **Adopted Improvements for BRD v2** list at the end (22 items).

---

## Advisor Responses

### Advisor A — The Proponent (the VC who backed it)

I backed this because it does the one thing most HR platforms never get right: it treats the employee record as a **product with a contract**, not a table. FR-019 (consumption API + change feed + etag/conditional-GET + point-in-time) plus the build instruction "do not write a second employee master" is exactly the discipline that lets 13 downstream modules ship in parallel without identity drift. That is the moat. Every competing in-house government HR build fails here — payroll keeps its own name spelling, pension keeps its own DOB — and this BRD structurally forbids it.

The **position model is the second moat**. Separating `positions` (sanctioned posts, strength, `reports_to_position_id`) from `employee_job_assignments` is Workday's core insight and is rare in Indian public-sector systems that conflate person and post. It gives you vacancy analytics, org-chart-from-positions, and clean transfer/promotion semantics (M05/M06 just write assignments) for free.

The **effective-dating + point-in-time + outbox** trio is best-in-class plumbing. The exclusion-constraint on overlapping assignments, the "one current substantive assignment" invariant, and the transactional outbox for SR events mean the system can defend any past state to an auditor or a pension tribunal — a genuine differentiator in a litigation-heavy government context.

The **privacy surface is a moat masquerading as compliance**: a server-side field-access policy engine (FULL/MASKED/HIDDEN), fail-closed default, break-glass with reason capture, and self-visibility control is SuccessFactors Role-Based-Permission-class. Most teams bolt masking onto the frontend and fail an audit; this puts it in the read path for both UI and API.

Opportunity missed: this team has built an MDM-grade identity spine and is under-monetising it. The dedup/merge engine, the change feed, and the completeness/DQ scoring could be packaged as a **workforce data-quality observability product** sold to other states. They've also left **employee experience** on the table — the self-service view is read-only; a guided "verify-your-own-profile" campaign with the completeness ring would crush data-quality KPIs at near-zero cost. Fund it.

### Advisor B — The Contrarian (assume a fatal flaw)

The fatal flaw is that **the BRD claims compliance it has not designed, and the claim will fail the first audit.**

Start with Aadhaar. "Verhoeff validation + tokenised" is not Aadhaar compliance. The **Aadhaar Act 2016 and UIDAI's Aadhaar Data Vault circular** require that the Aadhaar number be stored only in a separate, hardened **Aadhaar Data Vault keyed by a Reference Key**, that storage be lawful (registered AUA/KUA or explicit statutory basis), and that biometric authentication be tightly restricted. The BRD stores Aadhaar in **two** places (`employees.national_id` *and* `employee_identity_documents` of type AADHAAR), neither described as a vault, and pairs it with face photos and a `biometric_template_ref` for "attendance recognition." That is exactly the high-risk processing UIDAI and the DPDP rules single out. DPDP does **not** override the Aadhaar Act; asserting "DPDP-aligned" does nothing for Aadhaar.

DPDP itself is asserted, not built. There is **no consent/notice ledger, no Consent Manager hook, no Data Protection Officer role, no grievance/redress workflow, no breach-notification workflow to the Data Protection Board, and no reconciliation of the right-to-erasure against statutory retention.** Export (FR-016) is one of seven data-principal rights; the other six are absent. Government bodies have *some* exemption under DPDP §17, but as an **employer** processing employee data the exemption is narrow and untested — designing as if exempt is the risk.

Second-order failure: **break-glass is a data-exfiltration channel with a checkbox.** Reveal is "logged with reason" but there is no rate limit, no volume anomaly detection, no second-person approval, and the digest goes to a privacy officer *after the fact*. A single HR Admin can reveal 50,000 Aadhaar/bank numbers in an afternoon with the canned reason "payroll exception." The audit will show it neatly — after the breach.

Third: the **completeness `BLOCKED` → payroll exclusion** rule (FR-014 BR) is a legal landmine. Denying or delaying a government servant's salary because a photo or an unverified field is missing is challengeable as unlawful withholding of wages; courts and tribunals will not accept "the data-quality flag told payroll to skip you."

The risk the author most likely missed: **merge re-points foreign keys across other modules' tables** (FR-015 Data Operations: "bulk UPDATE FKs across satellites *and dependent modules' references*"). M01 reaching into M10/M11/M12 schemas to repoint employee_id destroys the bounded-context boundary the entire document is built on — and the "undo after downstream consumption" edge case proves the author already senses it's broken.

### Advisor C — The First Principles Thinker

Strip it to the question the system actually answers: *"Who is this person, what post do they hold today, and what did they hold on any given date — defensibly?"* Judged against that, two framing assumptions are doing silent work and one is wrong.

**Right framing:** modelling **post ≠ person** (positions vs assignments) and **state-as-of-time** (effective dating) are the correct primitives. Everything good in the BRD falls out of those two choices. Keep them.

**Wrong framing — the asymmetry of history.** The BRD effective-dates *job/org/address* but **overwrites person attributes**: `name`, `gender`, `marital_status`, `category` (SC/ST/OBC/EWS), `disability`, `religion` live as mutable columns on `employees` with no version history. This is incoherent with the document's own thesis. In a public-sector context these are the *most* consequential historical facts: a **category** at recruitment fixes a reservation-roster point for a career; a **DOB** governs the retirement date and is the single most litigated field in Indian government service; a **name change** (marriage, or the Transgender Persons Act 2019 right) must be tied to a gazette notification and an effective date. If a position assignment deserves a tamper-evident timeline, a category or DOB change deserves one far more. The hidden assumption — "personal attributes don't change, or their history doesn't matter" — is simply false for this domain.

**Simpler approach available, and the BRD over-builds elsewhere.** The general principle should be *one* effective-dated-attribute mechanism, not three (job assignments are versioned, addresses are versioned-by-hand with valid_from/to, custom fields are not versioned at all, core attributes not at all). A single `employee_attribute_history` spine (attribute_path, value, effective_from/to, change_reason, source, gazette_ref) would unify it and *replace* some of the bespoke machinery. Conversely, the **custom-fields + dynamic-form + per-field-policy-matrix** engine is a lot of build for v1 of a government rollout where the field set is statutorily fixed; that configurability is speculative until a second tenant exists.

**The assumption that should be challenged out loud:** that **completeness/quality can gate downstream operations.** A measurement (score) should never become a control (block payroll). Conflating the two couples data hygiene to the disbursement of wages — a category error. Score and nudge; never block pay.

### Advisor D — The Outsider (zero domain context)

I don't work in HR, so I'm flagging everything I had to guess at — because if I have to guess, so will an implementing agent.

- **Acronym wall, no anchor.** PAN, Aadhaar, IFSC, PRAN, UIDAI, GPF/CPF/NPS, APAR, cadre, "officiating," "substantive," "lien," "creamy layer," "4-eyes," "break-glass," "Verhoeff." The glossary covers a third of these. Several (PRAN, cadre, officiating, additional-charge) appear in enums and rules with no definition. An agent will mis-implement what it can't define.
- **The number doesn't add up on its face.** §5.1 says "M01-owned entities (18)" then lists E1–E20 and a footnote says "20 tables across 18 conceptual entities (E20 is a pair)." I counted; the reconciliation between 18, 19, and 20 took me three reads. If the author needs a footnote to explain the count, simplify the count.
- **A cross-reference is wrong.** §3 and §4.3 say field-level access is **FR-EPM-012**. The actual field-access FR is **FR-EPM-013**; FR-012 is custom fields. I only caught it because I read linearly. An agent wiring "the policy in FR-012" will wire the wrong thing.
- **"800 ms to assemble 20 tables, apply a policy per field, mask, and write an audit row" — for every view, at 500,000 employees.** Nobody told me how. "Read-optimised" and "parallel section fetch" are adjectives, not a design. Where is the read model?
- **Two homes for one secret.** Aadhaar appears as `employees.national_id` *and* as an `employee_identity_documents` row. Which is the truth? If I update one, does the other change? Unspecified.
- **A name must have a last name (`last_name NOT NULL`).** I was told to design for a global organisation, but I've seen Indian records with a single name and no surname. A NOT NULL surname will reject real people on day one. Is that intended?
- **"It blocks payroll" is stated like a feature.** From the outside, a system that can silently stop someone's salary because a checkbox is unticked sounds less like a feature and more like a complaint waiting to happen.
- **Everything is "✅ Resolved, 0 unresolved gaps."** A 2,500-line spec with zero open issues reads as *under-reviewed*, not *complete*. The one honest section (Appendix E, four assumptions) is the most credible page in the document.

### Advisor E — The Executor (what do we build Monday?)

The dependency map is sound: **FR-019 (consumption API) + FR-013 (field access) + FR-001 (create)** first, contracts frozen before parallel tracks. I'd ship exactly that as Sprint 1. But several "✅ Resolved" items will detonate in build and migration.

**Migration is mis-scoped and the targets are fiction.** Public-sector legacy data is paper service books, three spellings per person, missing DOB/DOJ, no Aadhaar/PAN for staff who joined in the 1990s. Your schema has **hard NOT NULL on `dob`, `gender`, `last_name`, `date_of_joining`** and a CHECK that DOB makes the person ≥18 at joining. Real legacy rows **will not satisfy these**, so the importer's binary VALID/ERROR model converts most of your population to ERROR on pass one — and "≥99.5% VALID on first or second pass" is unreachable. You need a third state: **PROVISIONAL/QUARANTINE** — committed under a relaxed migration profile, DQ-flagged, login-disabled, with a manual remediation queue — or migration stalls for months. Decide this Monday; it changes the schema (nullable-during-migration) and the importer.

**The merge cannot repoint other modules' rows.** As written, `MergeService` does "bulk UPDATE FKs across … dependent modules' references." M01 does not own M10/M11/M12 tables and must not write them. The buildable design is: M01 merges *its own* satellites, soft-deletes the loser, emits **`RECORDS_MERGED` with `{survivor_id, loser_id}` on the change feed**, and **every consumer re-points itself** (or all modules read `employee_id` through an identity-alias table M01 owns: `employee_id_aliases(loser_id → survivor_id)`). The alias table also fixes "undo after downstream consumption." Pick the alias approach; it's less coordination.

**The denormalisation trigger is a footgun.** Keeping `employees.designation_id/org_unit_id/reporting_manager_id` in sync with the current assignment via a DB trigger, *while* back-dated corrections rewrite history *and* an outbox fires, is three stateful mechanisms fighting over one row. Do the sync in the service layer inside the same transaction, explicitly, and test it; don't bury it in a trigger.

**Concurrency is asserted, not specified.** FR-003/008/009 say "version check" / "last-writer" and the API shows an `etag`, but **no entity has a `row_version` column**. Add `row_version INT` (or `xmin`) to every mutable table and define `409 CONFLICT` on mismatch, or the 4-eyes and primary-demotion flows race.

**Audit-on-read will blow the P95.** "Every restricted read writes audit_log" inside a path with a 500 ms P95 and 14 machine consumers hammering the consumption API means synchronous inserts on the hot path. Move audit to an async sink (queue/outbox), or the SLO and the audit requirement are mutually exclusive.

Sequencing reality: **positions need effective dating before the 7th-CPC-style mass pay-scale revision** ever runs — retrofitting history onto `positions` after go-live is brutal. Build it in now.

---

## Anonymous Peer Review

Responses are labelled **A** (Proponent), **B** (Contrarian), **C** (First Principles), **D** (Outsider), **E** (Executor).

**Reviewer 1 reviewing for strongest / blind spot / shared miss**
- **Strongest:** **B.** The Aadhaar-Act-vs-DPDP distinction and the two-homes-for-Aadhaar catch are specific, correct, and legally load-bearing — not generic privacy hand-wringing.
- **Biggest blind spot:** B treats *everything* as fatal; by crying "fatal flaw" on five different things it dilutes the one that's genuinely architectural (cross-module merge). Severity triage is missing.
- **What ALL FIVE missed:** the **deceased-employee → family-pension identity** problem. On DECEASED, data-subject rights and benefit entitlement pass to legal heirs/nominees, and a *new* family-pensioner record often must be created and linked. No advisor named it; the BRD only "locks self-service."

**Reviewer 2**
- **Strongest:** **C.** The "history asymmetry" insight (job effective-dated, person overwritten) reframes the whole data model and is the highest-leverage single correction.
- **Biggest blind spot:** C proposes collapsing to one attribute-history spine but doesn't acknowledge the migration/performance cost of unifying three mechanisms mid-stream — easy to say, expensive to retrofit.
- **What ALL FIVE missed:** **optimistic-vs-statutory locking of DOB and category as one-time, governed, evidence-bound changes.** Everyone says "version them"; nobody specifies the *governed change process* (single permissible alteration, time window, documentary proof, approving authority) that Indian service rules mandate.

**Reviewer 3**
- **Strongest:** **E.** It is the only response that turns critique into Monday-buildable decisions (alias table, PROVISIONAL state, row_version, async audit) and catches the positions-effective-dating sequencing trap.
- **Biggest blind spot:** E is implementation-deep but accepts the feature scope as given — it never asks whether the custom-field engine or completeness-blocking should exist at all (C and the Outsider did).
- **What ALL FIVE missed:** **the change-feed event backbone is undefined** (Kafka? DB-polled outbox? retention? replay window? dead-letter?). With 14 consumers and tombstones, this is an architecture decision masquerading as a `GET` endpoint.

**Reviewer 4**
- **Strongest:** **D.** The Outsider produced the most *actionable* defects despite zero domain context: the wrong FR cross-reference (012 vs 013), the mononym/`last_name NOT NULL` rejection, and the "0 unresolved gaps = under-reviewed" smell are all real and cheap to fix.
- **Biggest blind spot:** D, lacking domain context, can't tell gold-plating from necessity — it flags the custom-field engine as "complex" without weighing that an SSOT serving 14 modules has a real case for some configurability.
- **What ALL FIVE missed:** **transliteration / phonetic search across scripts.** Global search is "by name/service_no," but `name_local` exists and Indian names span scripts and spellings; without phonetic/transliterated search the directory and dedup both under-match. No one raised it.

**Reviewer 5**
- **Strongest:** **A.** Even as the booster, A correctly identifies the *durable* moats (contract-first SSOT, post≠person, server-side masking) — and a review that can't name what to protect produces a worse v2 than one that can.
- **Biggest blind spot:** A's optimism skips the legal exposure entirely (Aadhaer Act, wage-withholding) and mistakes "we built an MDM engine" for "we built a *compliant* MDM engine."
- **What ALL FIVE missed:** **category/EWS/OBC certificate validity and PwD UDID/percentage.** Category is captured as a static enum, but non-creamy-layer/EWS certificates **expire annually** and PwD benefits need ≥40% on a UDID card. Everyone debated *history* of category; no one caught that even the *current* value needs a certificate entity with validity and a benefit-percentage.

---

## Second Pass — Focused Resolution of the Fundamental Clash

Two clashes are fundamental (the right answer changes what v2 must do). I resolve both.

### Clash 1 — Should the data-quality `BLOCKED` flag exclude an employee from payroll? (C/B/D: no; FR-014 as written: yes)

**Resolution: No — split "block" into two different controls.** The author conflated *data trust* with *payment authority*. There are two legitimate needs hiding in one flag:

1. **Pay cannot be sent where it has nowhere lawful to go.** A *verified primary salary account* is a genuine precondition for *electronic disbursement* — not because data is "incomplete," but because there is no valid destination. This is a **specific, bank-detail gate owned by payroll (M10)**, expressed as a typed reason (`NO_VERIFIED_BANK`), with a manual/cheque fallback so wages are never simply withheld.
2. **Everything else (missing photo, unverified education, low completeness %) must never touch pay.** It generates **nudges and DQ register entries**, full stop.

So v2 replaces "BLOCKED gates payroll" with: completeness/DQ is **advisory only**; M10 independently enforces its own *disbursement-readiness* checks (verified bank present, no active hold) and always has a non-electronic fallback. This removes the unlawful-withholding exposure (B) and the measurement-as-control category error (C) while preserving the real safeguard.

### Clash 2 — Build the full configurable/dedup/point-in-time platform in v1, or phase it? (A/E: build the spine now; C/D: some of it is speculative)

**Resolution: Build the spine, defer the speculative surface — and the dividing line is "does a downstream module or a statute consume it in v1?"**

- **Must be v1 (a consumer/statute depends on it):** consumption API + field access + create + position management **with positions effective-dated** + effective-dated *core person attributes* + dedup-via-alias-table + separation/lifecycle + migration with a PROVISIONAL state. These are load-bearing for M02–M14 or for compliance.
- **Defer to phase 2 (no v1 consumer):** the **custom-field + dynamic-form engine** (statutory field set is fixed at launch; one tenant), the **reversible-merge UI undo** beyond the alias mechanism, and the **completeness *scoring weights* configurability** (ship one fixed weighting). C and D are right that these are speculative configurability; A and E are right that the *identity/position/privacy spine* is not negotiable.

This is not a contradiction once you separate "platform spine" (build) from "configurability surface" (defer). v2 should phase explicitly rather than declaring all 19 FRs equally "Resolved."

---

## Risk Register

| # | Risk | Severity | Source Advisor(s) | Mitigation |
|---|------|----------|-------------------|------------|
| R1 | Aadhaar stored without UIDAI Aadhaar Data Vault / Reference-Key architecture and lawful basis; stored in two places; paired with facial biometric | **Critical** | B, D | Single Aadhaar Data Vault keyed by Reference Key; remove `employees.national_id` duplication; document AUA/KUA or statutory basis; isolate biometric processing with its own purpose/consent |
| R2 | Merge re-points FKs in other modules' tables — bounded-context violation; undo-after-consumption unsolved | **Critical** | B, E | M01-owned `employee_id_aliases(loser→survivor)`; merge emits `RECORDS_MERGED`; consumers resolve via alias; alias makes undo safe |
| R3 | DQ `BLOCKED` flag excludes employee from payroll = unlawful wage-withholding / measurement-as-control | **Critical** | B, C, D | Completeness/DQ advisory only; move disbursement gating to M10 (`NO_VERIFIED_BANK`) with non-electronic fallback |
| R4 | DPDP rights/governance unbuilt: no consent-notice ledger, DPO role, grievance, breach-notification, erasure-vs-retention reconciliation | **High** | B | Add Data Privacy & Rights FR: consent/notice ledger, 6 data-principal rights, DPO role, grievance workflow, breach-notification workflow, retention/legal-hold engine |
| R5 | Core person attributes (name, gender, marital status, **category**, **DOB**, disability, religion) overwritten, not effective-dated | **High** | C | Unified `employee_attribute_history` spine; effective-dated with change_reason/source/gazette_ref |
| R6 | DOB and category lack a *governed* one-time change process (statutory in Indian service rules) | **High** | Reviewer 2 | Governed-change workflow: single/limited alteration, documentary proof, approving authority, audit, SR event |
| R7 | Break-glass reveal has no rate limit / anomaly detection / pre-approval — mass-exfiltration channel | **High** | B | Volume caps, anomaly alerts, optional 4-eyes for bulk/special-category reveals, real-time (not digest) alerting on thresholds |
| R8 | Migration targets (99.5% VALID pass 1–2) infeasible vs paper legacy; hard NOT NULL/CHECK reject real rows | **High** | E, D | PROVISIONAL/QUARANTINE record state + relaxed migration validation profile + remediation queue; nullable-during-migration columns |
| R9 | `positions` not effective-dated — Pay-Commission/reclassification history unreconstructable | **High** | C, E | Effective-date the `positions` table (pay_scale, title, reports_to, strength) |
| R10 | Audit-on-read synchronous in <500 ms P95 path with 14 consumers | **Medium** | E | Async audit sink (queue/outbox); sampling/aggregation for high-volume machine reads |
| R11 | 360° (20 tables + per-field policy + mask + audit) at 500k with no defined read model | **Medium** | D, E | Define CQRS/materialised read projection; cache resolved policy per role |
| R12 | Denormalisation via DB trigger conflicts with back-dated corrections + outbox | **Medium** | E | Service-layer sync inside the transaction; remove trigger |
| R13 | No optimistic-lock column despite "version check"/etag claims | **Medium** | E | Add `row_version` to every mutable table; 409 on mismatch |
| R14 | Change-feed event backbone undefined (transport, retention, replay, DLQ, ordering) | **Medium** | Reviewer 3 | Specify backbone (e.g., DB-polled outbox or Kafka), retention/replay window, dead-letter, ordering guarantee |
| R15 | `last_name NOT NULL` rejects mononym (single-name) employees | **Medium** | D | Configurable name model; allow single legal name; `last_name` nullable with a "single-name" flag |
| R16 | Deceased → family-pension identity/heir record + data-rights transfer unhandled | **Medium** | Reviewer 1 | Define DECEASED downstream: legal-heir/nominee linkage, family-pensioner record creation hook to M11, data-rights succession |
| R17 | Category (EWS/OBC) certificate validity/expiry and PwD UDID/percentage not modelled | **Medium** | Reviewer 5 | Add certificate sub-entity: type, number, issuing authority, valid_from/to, percentage (PwD), creamy-layer status; expiry alerts |
| R18 | Wrong FR cross-reference (§3/§4.3 cite FR-012 for field access; it is FR-013); entity count 18/19/20 confusing | **Low** | D | Correct references; restate entity count once, cleanly |
| R19 | No phonetic/transliteration search across scripts; dedup/directory under-match Indian names | **Low** | Reviewer 4 | Phonetic + transliteration search on name/`name_local`; feed dedup matcher |
| R20 | High-risk non-bank changes (PAN, Aadhaar, category, DOB, pension nominee) lack 4-eyes that bank enjoys | **Low** | C, B | Extend maker-checker/4-eyes to a configurable set of high-risk fields, not bank-only |
| R21 | "0 unresolved gaps / all ✅ Resolved" overstates confidence | **Low** | D | Replace with an honest open-issues register; keep Appendix-E candour |
| R22 | Foreign nationals/consultants without PAN/Aadhaar; `official_email` not unique | **Low** | D, B | Conditional statutory-ID requirement by nationality/employment_type; unique constraint on official_email |

**Severity tally: 22 risks (3 Critical, 6 High, 6 Medium, 7 Low).**

---

## Where the Council Agrees

- The **spine is excellent**: contract-first SSOT, post≠person positions, effective dating, outbox, server-side field masking. Protect these in v2.
- **Compliance is the weakest dimension** relative to the document's own ambitions — asserted, not engineered (Aadhaar, DPDP rights, retention/erasure).
- The **cross-module merge** is a genuine architectural defect, not a nit.
- **Personal-attribute history** is the single highest-leverage data-model correction.
- The **migration plan is optimistic** to the point of being a schedule risk.

## Where the Council Clashes

- **Scope/over-engineering:** A/E want the full platform; C/D see speculative configurability (custom fields, weighting). *Resolved in Second Pass: build spine, defer surface.*
- **Payroll blocking:** FR-014 asserts it; B/C/D reject it. *Resolved: advisory-only; gate disbursement in M10.*
- **Severity discipline:** B's "everything is fatal" vs the others' triage. *Resolved by the risk register.*

## Blind Spots Caught (by peer review, missed by all five advisors)

1. **Deceased → family-pension/legal-heir identity and data-rights succession** (R16).
2. **Governed one-time DOB/category change process** distinct from mere versioning (R6).
3. **Change-feed event backbone** is undefined architecture (R14).
4. **Phonetic/transliteration search** across scripts (R19).
5. **Category certificate validity + PwD UDID/percentage** — even the *current* value needs a certificate entity (R17).

## Idea Evolution (v1 → v2 in one line)

From *"a beautifully engineered MDM spine that claims compliance"* to *"a beautifully engineered MDM spine that engineers compliance, versions the facts that matter, and never lets a data flag withhold a wage."*

## The One Thing To Do First

**Replace the cross-module merge with an M01-owned `employee_id_aliases` table and a `RECORDS_MERGED` feed event — and freeze that, the field-access contract, and the consumption-API shape *before* any parallel track starts.** It is the only Critical risk that is also a frozen public contract: get it wrong and all 13 downstream modules inherit a broken identity-resolution boundary that is near-impossible to retrofit. Everything else can be corrected per-module; this cannot.

---

## Adopted Improvements for BRD v2

1. **Add an `employee_id_aliases(loser_id → survivor_id, merged_at, mergeable_back_until)` entity owned by M01.** Rewrite FR-015 so merge consolidates only M01 satellites, soft-deletes the loser, writes an alias, and emits `RECORDS_MERGED{survivor_id, loser_id}` on the change feed. Remove all "update FKs across dependent modules' references." Consumers resolve identity via alias. (R2)
2. **Add an Aadhaar Data Vault design.** Store the Aadhaar number only in a separate hardened vault keyed by a Reference Key; `employees`/`employee_identity_documents` hold only the masked value + reference key. Remove the duplicate `employees.national_id` Aadhaar copy. Document the lawful basis (AUA/KUA or statute) and DPDP/Aadhaar-Act controls explicitly. (R1)
3. **Isolate biometric and facial-photo processing** with its own purpose declaration, consent/notice, restricted role, and retention — separate from general profile photos; state that no raw biometric template is stored in M01 and that facial-recognition use for attendance is a distinct, consented purpose. (R1)
4. **Add FR-EPM-020 — Data Privacy, Consent & Data-Principal Rights:** consent/notice ledger; the six DPDP rights beyond export (access, correction, erasure, grievance, nomination, withdrawal); a **Data Protection Officer** role; a **grievance/redress workflow**; and a **personal-data-breach notification workflow** to the Data Protection Board with timelines. (R4)
5. **Add FR-EPM-021 — Retention, Legal Hold & Erasure:** a retention-policy entity (per record class/statutory schedule), an **archival/retained state**, a **legal-hold** flag (blocks purge for disciplinary/litigation/pension), and explicit reconciliation of right-to-erasure **against** statutory retention (retention wins where lawful; document precedence). (R4)
6. **Change the data-quality `BLOCKED` rule to advisory-only.** Completeness/DQ never blocks payroll. Move disbursement gating to M10 as a specific `NO_VERIFIED_BANK` precondition with a non-electronic fallback so wages are never withheld for data hygiene. (R3)
7. **Add a unified `employee_attribute_history` spine** that effective-dates core person attributes — `name`, `gender`, `marital_status`, `category`, `dob`, `disability`, `religion` — with `effective_from/to`, `change_reason`, `source`, and `gazette_ref`. Stop overwriting these on `employees`. (R5)
8. **Add a governed-change workflow for DOB and category** (and other statutorily-controlled fields): limited/one-time alteration, mandatory documentary proof (`document_id`), named approving authority, full audit, and an SR event. (R6)
9. **Effective-date the `positions` entity** (pay_scale_id, title, reports_to, sanctioned_count, status) so Pay-Commission/reclassification history is reconstructable. (R9)
10. **Harden break-glass:** per-user/per-window volume caps, anomaly detection, real-time alerting on thresholds (not just a digest), and optional 4-eyes for bulk or special-category reveals. (R7)
11. **Add a PROVISIONAL/QUARANTINE record state and a relaxed migration-validation profile** with a manual remediation queue; make migration-affected columns nullable-during-migration; replace the 99.5%-VALID target with a realistic, staged data-quality glide path. (R8)
12. **Add `row_version` (optimistic-lock) to every mutable entity** and define `409 CONFLICT` on mismatch; make the API `etag` derive from it. Replace vague "last-writer"/"version check" language. (R13)
13. **Specify the change-feed event backbone:** transport (DB-polled outbox or streaming), ordering guarantee, retention/replay window, cursor semantics, tombstones, and dead-letter handling. (R14)
14. **Move audit-on-read off the hot path** to an async sink; define sampling/aggregation for high-volume machine consumer reads so the <500 ms P95 and full-audit requirements coexist. (R10)
15. **Define a CQRS/materialised read projection for the 360° view** and resolved-policy caching; replace "read-optimised/parallel fetch" adjectives with an actual read-model design and a stated latency budget at 500k records. (R11)
16. **Replace the denormalisation DB trigger with explicit service-layer sync** inside the assignment transaction; specify behaviour under back-dated corrections. (R12)
17. **Make the name model configurable and allow mononyms:** `last_name` nullable with a single-legal-name flag; support `name_local` and a display-name policy. (R15)
18. **Define DECEASED downstream handling:** legal-heir/nominee linkage, creation hook for a family-pensioner record in M11, and data-rights succession to heirs under DPDP. (R16)
19. **Add a certificate sub-entity** for category (EWS/OBC non-creamy-layer) and PwD: type, number, issuing authority, `valid_from/to`, disability percentage, creamy-layer status, with expiry alerts feeding completeness/DQ. (R17)
20. **Extend maker-checker/4-eyes** from bank-only to a configurable high-risk field set (PAN, Aadhaar, category, DOB, pension nominee). (R20)
21. **Add phonetic + transliteration search** over `first/last_name` and `name_local`, and feed the same matcher into the dedup engine; handle foreign nationals/consultants without PAN/Aadhaar via conditional statutory-ID rules; add a unique constraint on `official_email`. (R19, R22)
22. **Fix correctness/credibility defects:** correct the FR cross-reference (field access is **FR-013**, not FR-012, in §3 and §4.3); state the entity count once cleanly; and replace "0 unresolved gaps / all ✅ Resolved" with an honest open-issues register, **explicitly phasing** must-have-v1 FRs vs deferred configurability (custom-field engine, weighting configurability, merge-undo UI). (R18, R21, and Second-Pass Clash 2)

---

*End of council evaluation — 22 risks registered; 22 adopted improvements for BRD v2.*
