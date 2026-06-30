# Adversarial Idea Evaluator — Council Report
## M02-EPDM — Employee Personal Details Modification Workflow (BRD v1.0)

**Framed question:** Is this Employee Personal Details Modification Workflow BRD complete, correct, and world-class (maker-checker, field-level sensitivity, audit, SR posting) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?

**Inputs reviewed:** `docs/brd/v1/M02-personal-details-modification-workflow.md` (1941 lines, 16 FRs, 12 module entities) and `docs/brd/SHARED_FOUNDATION.md`.

**Benchmark bar:** Workday, SAP SuccessFactors, Oracle HCM business-process / maker-checker patterns, layered over Indian public-sector statutory practice (service book / DOB-alteration jurisprudence, reservation/caste rules, DPDP Act 2023, Aadhaar/UIDAI handling, gazette evidence).

---

## 1. The Five Advisors

### Advisor A — The Proponent

This is, frankly, a top-decile module BRD. It correctly frames M02 as a **change-control layer in front of M01**, not an owner of the data — the single most important architectural decision, and it holds the line consistently (ownership matrix §5.4, "M02 never writes the SR ledger schema directly"). The separation of *correction vs update* with effective-dating (FR-008) is exactly the distinction that prevents the pension/seniority disputes named in the business problem, and it is rarely modelled this cleanly even in commercial suites.

The governance spine is genuinely strong: field-level sensitivity catalog (E5) as **data not code**, a versioned approval matrix (E6/E7) with org-scope precedence, snapshot-immune routing for in-flight requests (FR-012 BR1), and a DB-level SoD constraint (§5.6 rule 1) rather than service-only enforcement. The idempotency discipline is best-in-class: `commit_idempotency_key`, `+':SR'` posting key, stale-value hash guard, saga/outbox for the M01 boundary (§10.4). Append-only ledgers for approvals, e-signatures, SLA events and SR events give real audit defensibility.

The statutory wiring is thoughtful: STATUTORY tier forces evidence + e-sign + senior sanction + SR posting, with a reconciliation report (FR-016 BR3) that surfaces any committed statutory item not yet posted to M12 — closing the "statutorily complete" loop that most teams forget. SLA pause/resume semantics, escalation that *changes who acts but never the route* (FR-007 BR2), and "breach never auto-approves" (BR3) are mature touches.

Operationally it is buildable now: 16 numbered FRs each with an LLD table, a parallel-agent workstream plan, error catalog with M02-specific codes, sample data per entity, and a phased rollout (LOW→HIGH→STATUTORY→bulk) that de-risks launch. The KPI table is outcome-anchored. A team handed this could start Monday. My only caution: the document's confidence ("Unresolved gaps: 0") is its own risk — see my colleagues. But as a foundation, this is world-class scaffolding that needs hardening, not redesign.

### Advisor B — The Contrarian (non-obvious failure modes)

The maker-checker is solid against the *naive* fraud. It is porous against the *realistic* ones, and there is one attack chain the author missed entirely.

**Missed risk — the contact-channel takeover chain.** `alternate_phone` is LOW and `auto_apply_on_low` can commit it with **no human approval and no notice to the old number**. Phone/email are MFA-recovery and OTP channels. HIGH bank-account approval permits **OTP e-sign** (FR-015, `sign_method=OTP`). So: a hijacked self-service session silently repoints the phone (LOW, auto-applied), then initiates a bank-account change whose approver OTP — or the requester step-up — flows to the attacker-controlled number. Salary diverted. Every individual control "passed." The defect is treating auth-bearing contact fields as LOW and allowing weak e-sign methods on financial changes.

**Payroll diversion via HR_ON_BEHALF with no data-subject notice.** Notifications go to the *requester*. When HR is the requester (HR_ON_BEHALF), the **employee whose bank account changed is never told**. A single malicious HR officer (or a two-officer collusion ring that trivially satisfies maker≠checker) reroutes an employee's salary and the victim has no signal. World-class systems force out-of-band notice to the data subject and a confirmation/objection window for changes to *their* record.

**Deceased/retired records are ungated.** No FR checks `employment_status`. A change request against a DECEASED employee's bank account = family-pension diversion; against a RETIRED employee = terminal-benefit fraud. This is the highest-value fraud target and it's wide open.

**National ID self-service substitution.** `self_service_editable` defaults true and the seed doesn't mark `national_id` HR-only. Letting an employee self-edit their Aadhaar/PAN to *someone else's* number is identity substitution. SoD doesn't catch it — the maker legitimately owns the record.

**No fraud/velocity signals.** No detection of the same new bank account across multiple employees (mule), changes clustered before payroll cutoff or just before separation, or burst of changes from one device. Collusion rings and last-week-before-exit theft are invisible.

**Audit immutability is asserted, not enforced** — no hash-chaining/WORM. A DBA can rewrite "immutable" history. For a statutory system that is the audit gap that voids the whole control.

### Advisor C — The First Principles Thinker

Strip it down. The essential object here is *a proposed mutation to a governed record, gated by policy, evidenced, signed, applied once, and mirrored to statutory ledgers.* The BRD models that well. Three framing questions.

**(1) Is M02 the right boundary, or is it secretly a platform service?** Almost nothing in FR-002/004/007/012/013/015 is *personal-details-specific* — it's a generic governed-change engine. M05 (transfers), M06 (promotions), M09 (penalties) all need the same maker-checker-over-master pattern. Building it inside M02 risks four divergent re-implementations across the suite. First-principles answer: M02's approval/sensitivity/delegation/e-sign machinery should be a **shared Change-Control Service** that M02 *configures*, exactly as it already reuses `workflow_*`. The BRD half-commits (reuses the workflow engine) but then adds heavy M02-local approval semantics. Decide this now or pay for it across 14 modules.

**(2) Hidden assumption: M01 is a cooperative, idempotent, versioned write target.** The entire commit story (FR-010, saga/outbox) assumes M01 exposes `applyFieldChange(item, effectiveDate, changeType)` with a version token *and accepts effective-dated/temporal writes*. M01 is being built in parallel. If M01 stores a scalar current value with no temporal model, "correction effective from 1990" is unrepresentable and the marquee feature collapses. This assumption is buried in §2.4 and Appendix D, not elevated to a blocking dependency.

**(3) Simpler model for "correction."** The retro-impact story is asymmetric: SR posting is tracked, reconciled and retried; the payroll/pension retro event (the thing that actually *causes* the disputes the BRD exists to prevent) is **fire-and-forget** to M10/M11. If you believe corrections matter, the downstream recomputation must be a *tracked, acknowledged, reconciled* outcome — same rigor as SR posting — or you've governed the easy half and left the consequential half open-loop.

One more: "highest-sensitivity wins" bundling is the right default, but it means the system's behaviour on a *mixed* request is "treat all-or-nothing at the top tier." That's correct for safety but should be a *stated principle*, not an emergent property.

### Advisor D — The Outsider (jargon / hidden assumptions / unexplained complexity)

A newcomer (or a build agent) hits a wall of domain jargon that the glossary only partly clears. "**Sanction**" is used as a *positive* approval verb (grant authority) — in plain English it reads as *penalty*; an agent could invert the semantics. "**Gazette notification**," "**cadre**," "**APAR**," "**recommend→sanction chain**," "**VERIFY vs APPROVE node**" — the difference between a VERIFY node (checks a document) and an APPROVE node (authorizes the change) is load-bearing for routing but explained only by inference. "**Saga/outbox**" is dropped in §4.3 and §10.4 as if universally understood.

The **`name` vs `first_name`/`last_name` contradiction** is a concrete trap. The shared `employees` master (Shared Foundation §2) has `first_name` and `last_name`. The M02 catalog seed and sample data govern a single field `name`. A build agent will wire `change_request_items.field_key = "name"` to a field that doesn't exist in M01. Same for `national_id`/`pan` — Shared Foundation lists `pan`/`national_id`; the catalog uses `national_id` and `category_caste` (M01 has `cadre`, not `category_caste`). **These field-key mismatches will break commit at integration.**

Unexplained complexity: **four e-sign methods** (OTP, PKI/DSC, Aadhaar, PASSWORD_REAUTH) with no statement of which is legally sufficient for what — and "password re-auth" is presented as an e-signature when it provides *no* non-repudiation. A reader can't tell if it's a real signature or a checkbox. **`field_group` is overloaded**: it's both a taxonomy (DEMOGRAPHIC/CONTACT/…) and includes "STATUTORY," which is *also* a sensitivity value — so `dob` is shown with `field_group = STATUTORY` and `sensitivity = STATUTORY`, conflating two orthogonal axes. And **integrity rule 11 contradicts FR-010**: rule 11 says an item can't reach COMMITTED without SR `POSTED`, while FR-010/011 say the request is COMMITTED *first* and SR is posted asynchronously after. Which is true? A builder must guess.

### Advisor E — The Executor (feasibility, sequencing, Monday-morning)

Buildable, but the "0 unresolved gaps" reconciliation table (§14.4) is the trap. It lists M01/M12/M13/e-sign/business-calendar contracts as "**Resolved**" when they are **agreed in prose, not implemented** — and M01/M12 are being built *in parallel*. That's not resolved; it's a critical-path dependency wearing a green badge. False confidence here will stall workstream F (commit) and the entire statutory path.

**Critical path:** A (schema + config seed + field catalog) → C (routing + approval) → F (commit + SR), where F is gated on the real M01 `applyFieldChange` and M12 `postServiceRegisterEvent`. D (evidence + e-sign) needs the e-sign provider and M13 scan-status. Nothing statutory ships until M01 supports **temporal/effective-dated writes** — confirm that capability *first*, because if it's absent the correction model needs redesign, not patching.

**Monday-morning steps (in order):**
1. Lock the **M01 field-key registry** and resolve `name`→`first_name`/`last_name`, `category_caste`→`cadre`/category, `national_id`/`pan`. One afternoon; unblocks everything; prevents an integration-day fire.
2. Get a **written M01 commit contract** including effective-dated write + version token + idempotency semantics. Until signed, treat F as blocked, not resolved.
3. Build A: schema E1–E12, seed catalog and the single mandatory global matrix, with the SoD DB constraint and audit hash-chaining from day one (retrofitting tamper-evidence later is painful).
4. Stand up the **business-calendar service** (Assumption A5) or descope SLA to calendar-days for P1 — don't let an unbuilt dependency block the approval engine.

**Sequencing fixes:** Phase the over-built parts. Templates (FR-014), delegation (FR-013), bulk 50k-row async (FR-009) and "any-one" parallel topology are P3/P4 — they add surface area and test load while the security gaps above are unaddressed. Pull the security hardening (data-subject notice, status gating, contact-channel reclassification, e-sign method policy) *forward* into P1/P2; push the convenience features back. Estimate: the BRD as written is ~realistic for the happy path but under-budgets the fraud-hardening and the cross-module retro-impact closed loop, which are the parts auditors will actually test.

---

## 2. Anonymous Peer Review

*(Advisors anonymised A–E as above; each reviewer names the strongest contribution, the biggest blind spot, and what everyone missed.)*

**Reviewer 1 →**
- **Strongest:** B's contact-channel takeover chain — it composes three "individually safe" controls into a real exploit; that's the kind of finding that justifies a council.
- **Biggest blind spot (B):** B is all offense, no prioritisation — lists eight risks without telling the sponsor which one bleeds money first (it's the HR_ON_BEHALF silent bank change).
- **All five missed:** **Grievance/objection rights.** DPDP and basic fairness require the data subject to be able to *contest* a change made to their record. No FR gives the employee a dispute path.

**Reviewer 2 →**
- **Strongest:** C's reframing of M02 as a latent platform service — it's the only structural critique and it affects all 14 modules.
- **Biggest blind spot (C):** C's "make it a shared service" is architecturally right but operationally late — re-platforming mid-program may be costlier than accepting controlled duplication; C doesn't weigh that.
- **All five missed:** **Reversal / break-glass.** Once COMMITTED, the only path is "a new corrective request" — there is no fast, elevated *reversal* for a wrong bank account caught hours before payroll. That's an operational hole everyone walked past.

**Reviewer 3 →**
- **Strongest:** D's concrete field-key contradictions (`name`, `category_caste`, `national_id`) — cheap to fix, catastrophic if missed, and verifiable today.
- **Biggest blind spot (D):** D treats jargon and naming as equal-weight to the rule-11-vs-FR-010 contradiction, which is a genuine *logic* defect, not a wording nit, and deserved escalation.
- **All five missed:** **ReDoS / config-injection via `validation_regex`.** Admin-entered regex stored and executed server-side is an availability and injection vector; no validation/limit is specified.

**Reviewer 4 →**
- **Strongest:** E's exposure of "0 gaps = false confidence" and the M01 temporal-write dependency — the single most likely cause of a blown milestone.
- **Biggest blind spot (E):** E sequences well but accepts the correction model as feasible without forcing the question "does M01 even support effective-dated history?" — E flags it but doesn't make it a hard gate.
- **All five missed:** **Public-sector DOB hard-rule.** Indian service jurisprudence generally *bars* DOB alteration after a service window / near retirement. The BRD only "flags for extra scrutiny" (FR-008 BR2) — it should *hard-block* per a configurable statutory rule, with a separate legal process. World-class public-sector compliance, missed by all.

**Reviewer 5 →**
- **Strongest:** A's articulation of the idempotency + append-only + saga discipline — it correctly identifies what's already best-in-class so the council hardens rather than rewrites.
- **Biggest blind spot (A):** A's optimism papers over that the *statutory completeness* claim depends on downstream modules that are fire-and-forget (payroll/pension retro), which A doesn't notice.
- **All five missed:** **Caste/category and gender are treated as generic STATUTORY fields.** Caste change is a known public-sector fraud needing *authority-portal verification* (not just an uploaded certificate) and freezes promotion eligibility (M06); gender needs a dignity-aware path distinguishing data-error correction from gender-identity recognition (NALSA / Transgender Persons Act 2019). All five used "STATUTORY = gazette + e-sign + sanction" as a blunt instrument.

---

## 3. Chairman Synthesis

### 3.1 Agreements (high consensus)
- The **architecture is sound and the boundary (change-control layer, not data owner) is correct.** Hardening, not redesign.
- **Idempotency, append-only ledgers, saga/outbox, snapshot-immune routing** are genuinely best-in-class and should be preserved.
- **The "0 unresolved gaps" claim is the document's most dangerous sentence** — cross-module contracts are *agreed*, not *implemented*.
- **Field-key naming must be reconciled with the M01 master before any build** (`name`, `category_caste`, `national_id`/`pan`).

### 3.2 Clashes
- **C (make it a shared platform service) vs Reviewer-2/E (re-platforming mid-program is costly).** Real tension.
- **A's "buildable Monday" optimism vs E's "F is blocked on an unbuilt, possibly-incapable M01."**
- **Proponent's "statutorily complete" vs C's "the consequential downstream half is open-loop."**

### 3.3 Blind spots the council caught (that the BRD missed)
1. Contact-channel takeover chain (LOW auto-apply phone + OTP e-sign).
2. Silent HR_ON_BEHALF change with **no data-subject notification/objection window**.
3. **No `employment_status` gating** — deceased/retired record fraud.
4. **National-ID self-service substitution** (default `self_service_editable=true`).
5. **No fraud/velocity/mule detection.**
6. **Audit immutability asserted, not cryptographically enforced.**
7. **Payroll/pension retro impact is fire-and-forget** while SR posting is reconciled — asymmetric rigor.
8. **No reversal / break-glass** for a committed erroneous change.
9. **DOB statutory hard-block** (not just "extra scrutiny").
10. **Caste authority-portal verification + promotion freeze; dignity-aware gender path.**
11. **Integrity-rule-11 vs FR-010 contradiction** (item COMMITTED before vs after SR posting).
12. **`validation_regex` ReDoS/injection.**
13. **`new_value NOT NULL`** prevents legitimately clearing a field (e.g., removing a middle name).
14. **No requester step-up MFA** for initiating HIGH/STATUTORY self-service changes.

### 3.4 Idea evolution
The BRD started world-class on *governance plumbing* and below-par on *adversarial fraud resistance and cross-module closed-loops*. The council's net move: **keep the engine, add an adversary model.** Specifically — (a) treat auth-bearing contact fields and financial fields as security-critical, not convenience; (b) make the *data subject* a first-class notified/empowered party, not just the requester; (c) gate by `employment_status`; (d) close the downstream retro loop with the same reconciliation rigor already applied to M12; (e) demote "0 gaps" to an honest dependency register and elevate the M01 temporal-write capability to a hard gate; (f) phase convenience features (templates/delegation/bulk/any-one) behind the security hardening.

### 3.5 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Contact-channel takeover chain (LOW auto-apply phone/email + OTP e-sign → account/salary takeover) | Critical | B | Reclassify auth-bearing contact fields to MEDIUM+notice; notify OLD channel on change; bar OTP-to-changed-number; forbid OTP/password e-sign for FINANCIAL/STATUTORY |
| R2 | Silent HR_ON_BEHALF change to employee's bank/PII with no data-subject notice | Critical | B | Mandatory out-of-band notice to data subject on any HR-initiated change to their record + objection/confirmation window before financial credit |
| R3 | No `employment_status` gating → deceased/retired record fraud (family pension/terminal benefits) | Critical | B | Hard gate by status; deceased/retired changes route to a special, elevated path; block self-service on non-ACTIVE |
| R4 | M01 may not support effective-dated/temporal writes → correction model unbuildable | Critical | C/E | Hard pre-build gate: confirm M01 `applyFieldChange` temporal capability + version token before committing to FR-008/010 |
| R5 | National-ID self-service substitution (identity fraud) | High | B | Default `self_service_editable=false` for `national_id`/`pan`; HR-only + UIDAI/PAN re-verification |
| R6 | Audit log immutability asserted, not enforced | High | B | Hash-chained, WORM/append-only audit + e-sign ledger; periodic integrity verification |
| R7 | Payroll/pension retro impact fire-and-forget → the very disputes M02 exists to prevent | High | C | Track/reconcile/acknowledge downstream retro events with same rigor as SR posting (status, retry, reconciliation report) |
| R8 | "0 unresolved gaps" false confidence; parallel-built M01/M12 contracts unverified | High | E | Recast §14.4 as dependency register with states AGREED/IMPLEMENTED/VERIFIED; block F until VERIFIED |
| R9 | Field-key mismatches (`name`, `category_caste`, `national_id`) break commit at integration | High | D | Reconcile catalog field-keys to M01 registry before build; add composite/structured fields (first/last name) |
| R10 | No fraud/velocity/mule detection (same new bank across employees; pre-payroll/pre-exit spikes) | High | B | Add fraud-signal/risk-scoring FR; flag duplicate bank accounts, last-N-days-before-separation changes, device/velocity anomalies |
| R11 | DOB altered near retirement contrary to statutory rule | High | Rev-4 | Configurable hard-block rule (service-window / pre-retirement bar); separate legal process, not "extra scrutiny" |
| R12 | Caste/category change fraud + uncontrolled seniority impact | High | Rev-5 | Authority-portal certificate verification; freeze promotion eligibility (M06) pending; structured evidence-to-value attestation |
| R13 | No reversal / break-glass for committed erroneous change before payroll | High | Rev-2 | Emergency reversal FR with elevated authority + full audit + reversing SR event |
| R14 | No employee grievance/objection right (DPDP/fairness) | High | Rev-1 | Add data-subject objection/grievance FR; grievance officer; objection pauses or reverses |
| R15 | Integrity-rule-11 vs FR-010 contradiction (COMMITTED vs SR order) | Medium | D | Resolve canonical sequence: commit M01 → item `COMMITTED` → SR `PENDING`→`POSTED`; fix rule 11 wording |
| R16 | No requester step-up MFA on initiating sensitive self-service changes | Medium | B | Require step-up re-auth to *initiate* HIGH/STATUTORY self-service requests |
| R17 | `validation_regex` ReDoS / config injection | Medium | Rev-3 | Validate/limit admin regex (length, complexity, timeout); safe-regex library |
| R18 | DPDP erasure rights vs 7-year statutory retention conflict; Aadhaar storage limits | Medium | C | Explicit legal-basis/retention-override statement; tokenize Aadhaar (data vault), don't store full ID in change items; field-level keys + crypto-shred policy |
| R19 | `new_value NOT NULL` blocks legitimate field clearing | Low | Rev-3 | Allow nullable new_value with explicit `CLEAR` intent flag |
| R20 | Over-built features (templates, delegation, 50k bulk, any-one topology) inflate P1 scope/test load | Low | E | Phase to P3/P4; pull security hardening into P1/P2 |
| R21 | M02 approval machinery duplicates across M05/M06/M09 (divergence risk) | Medium | C | Decide now: extract shared Change-Control Service or accept controlled duplication with shared contract tests |

### 3.6 Focused second pass — the one fundamental clash

**Clash:** C says "M02 is secretly a platform service — make the approval/sensitivity/delegation/e-sign engine shared across modules"; Reviewer-2/E say "re-platforming mid-program may cost more than controlled duplication."

**Resolution (folded in):** Do **not** re-platform now, but do **not** let the divergence calcify either. The pragmatic synthesis: keep M02 as the *first consumer*, but (1) define the approval/sensitivity/delegation/e-sign semantics behind a **module-agnostic interface and contract test suite** from day one (the catalog and matrix tables are already generic), and (2) record an explicit architecture decision that M05/M06/M09 will consume the *same* engine. This preserves E's schedule (no rewrite) while honouring C's structural point (no four divergent re-implementations). Cost: a thin interface seam and shared contract tests now; benefit: optional extraction later without surgery. This becomes Adopted Improvement #20.

### 3.7 Recommendation

**PROCEED to v2 — conditional.** The architecture is keep-worthy and largely best-in-class on plumbing; it is *not* yet bulletproof on adversarial fraud, data-subject rights, public-sector statutory hard-rules, and cross-module closed-loops. v2 must (a) add the adversary/data-subject model (R1–R3, R5, R10, R14, R16), (b) convert the optimistic contract claims into a verified dependency gate with the M01 temporal-write capability as a hard precondition (R4, R8, R9), (c) close the downstream retro loop (R7), enforce audit tamper-evidence (R6), and add reversal/break-glass (R13), and (d) honour public-sector specifics for DOB/caste/gender (R11, R12). Phase convenience features behind this hardening (R20).

### 3.8 The One Thing To Do First

**Reconcile the M01 field-key registry AND obtain a written, versioned M01 commit contract that explicitly confirms effective-dated/temporal writes — before any commit-path code is written.** This single step (a) eliminates the integration-day field-key break (R9), (b) validates that the marquee correction/effective-dating feature is even representable in M01 (R4), and (c) honestly resets the "0 gaps" claim (R8). Everything statutory depends on it; it is cheap to do and catastrophic to skip.

---

## Adopted Improvements for BRD v2

1. **Reclassify auth-bearing contact fields.** Move `alternate_phone`, primary phone and email from LOW to MEDIUM (minimum: explicit human approval + notification), disable `auto_apply_on_low` for any field usable in authentication/OTP recovery, and **notify the OLD contact value** whenever a contact channel changes (anti-takeover).
2. **Mandatory data-subject notification + objection window.** Add a business rule and notification: any change to an employee's record initiated by someone else (HR_ON_BEHALF / BULK) triggers out-of-band notice to the *employee*; for FINANCIAL changes, hold the first downstream credit until a configurable confirmation/objection window elapses.
3. **Add `employment_status` gating.** New business rule: requests are blocked or specially routed based on M01 `employment_status`; non-ACTIVE (RETIRED/DECEASED/SUSPENDED/TERMINATED) records cannot be self-service-edited and route to an elevated, status-specific path (esp. bank/nominee for deceased → family-pension controls).
4. **Default `national_id`/`pan` to HR-only with re-verification.** Set `self_service_editable=false` in the seed for national ID / PAN; require HR initiation plus UIDAI/PAN authority re-verification; never permit pure self-service identity-number substitution.
5. **E-signature method policy by tier.** New rule: PASSWORD_REAUTH is not a legal e-signature and is excluded from FINANCIAL/STATUTORY nodes; FINANCIAL (bank) requires PKI/DSC or Aadhaar e-Sign (strong, non-OTP-to-changed-number); STATUTORY requires PKI/DSC or Aadhaar e-Sign. Remove password re-auth as an attribution method.
6. **Requester step-up MFA.** New control: initiating a HIGH/STATUTORY self-service change requires a fresh step-up re-authentication, independent of approver e-sign.
7. **New FR — Fraud & anomaly signals.** Add an FR for risk-scoring/fraud detection: flag the same new bank account across multiple employees (mule), changes within N days before separation or before a payroll cutoff, device/velocity anomalies, and surface a fraud-review queue and report.
8. **Tamper-evident audit.** Specify hash-chained, append-only/WORM `audit_log` and `esignatures` with periodic integrity verification; state the mechanism, not just "immutable."
9. **Close the downstream retro loop.** Make the `governed-field-changed`/`retro_impact` event to M10/M11 a **tracked, acknowledged, reconciled** outcome (status, retry, dead-letter, reconciliation report) with the same rigor as SR posting — so corrections actually trigger and confirm pay/pension/seniority recomputation.
10. **Reconcile field-keys to the M01 master.** Replace/clarify `name` → structured `first_name`/`last_name` (or a composite with sub-items), align `category_caste` with M01's actual cadre/category field, and align `national_id`/`pan`. Add a field-key registry section binding catalog keys to M01 keys.
11. **Recast §14.4 as an honest dependency register.** Replace "Resolved / 0 unresolved gaps" with states `AGREED / IMPLEMENTED / VERIFIED`; add an explicit **hard gate**: workstream F (commit) and the statutory path cannot start until the M01 commit contract — including **effective-dated/temporal write capability and version token** — is VERIFIED in staging.
12. **DOB statutory hard-block.** Convert FR-008 BR2 from "flag for scrutiny" to a configurable **hard rule**: DOB alteration barred after a service window / within a pre-retirement window, requiring a separate legal/administrative process (not the standard route).
13. **Caste/category controls.** Add authority-portal certificate verification (not just document upload), a structured evidence-to-value attestation by the verifier, and an automatic **promotion-eligibility freeze (M06)** flag pending verification.
14. **Dignity-aware gender path.** Distinguish *gender-marker data-error correction* from *gender-identity recognition* (NALSA / Transgender Persons Act 2019); define an appropriate, non-gazette evidence path and privacy handling for the latter.
15. **New FR — Emergency reversal / break-glass.** Add a fast, elevated-authority reversal for a committed erroneous change (esp. bank account before payroll), with full audit, dual authorization, and a reversing SR event for statutory items.
16. **New FR — Data-subject grievance/objection.** Add an employee dispute path (DPDP-aligned): the data subject can object to or contest a change to their record; objection pauses commit or triggers reversal; route to a grievance officer.
17. **Resolve the commit/SR sequencing contradiction.** Fix integrity rule 11 to match FR-010/011: canonical order is M01 commit → item `COMMITTED` → SR `PENDING` → `POSTED/FAILED` (statutory completeness tracked separately, not blocking COMMITTED). State it once, unambiguously.
18. **Harden `validation_regex` and allow field clearing.** Validate admin-entered regex (length/complexity/timeout, safe-regex library) to prevent ReDoS; make `change_request_items.new_value` nullable with an explicit `CLEAR`/`REMOVE` intent flag so fields (e.g., middle name) can be legitimately emptied.
19. **DPDP/Aadhaar data-handling statement.** Add explicit legal-basis + retention-override reconciling DPDP erasure rights with the 7-year statutory retention; tokenize Aadhaar via a data vault (do not store full national ID in `change_request_items`); specify field-level keys, KMS/rotation and a crypto-shred policy.
20. **Architecture decision — shared Change-Control seam.** Record that M02's approval/sensitivity/delegation/e-sign engine is module-agnostic and exposed behind an interface + contract-test suite, with M05/M06/M09 designated future consumers — enabling later extraction to a shared Change-Control Service without rewrite (no re-platforming now).
21. **Glossary & semantics hardening.** Define VERIFY-vs-APPROVE-vs-SANCTION nodes explicitly (and flag that "sanction" = grant, not penalty), define saga/outbox, gazette, cadre; separate the overloaded `field_group` taxonomy from the `sensitivity` axis so STATUTORY is only a sensitivity value, never a group.
22. **Re-phase the rollout.** Pull security hardening (items 1–6, 8) into P1/P2; push templates (FR-014), delegation (FR-013), 50k-row async bulk (FR-009) and "any-one" parallel topology to P3/P4 to reduce early scope and test load.
23. **Delegation privilege clarity.** State explicitly that a delegate must *independently* satisfy the node's `required_role` (no privilege elevation via delegation), and add a security report for attempted SoD violations and admin/config (privileged) actions.
