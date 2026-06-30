# Adversarial Council Review — M10 Payroll & Benefits Management BRD (v1.0)

**Artefact under review:** `docs/brd/v1/M10-payroll-and-benefits.md`
**Shared context:** `docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Payroll & Benefits BRD complete, correct, and world-class (salary structure, run engine, arrears, statutory deductions/TDS/GPF/NPS, loans, benefits, bank disbursement, reconciliation, immutability) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class — and what makes it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → focused second pass → adopted improvements.
**Date:** 2026-06-30

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is, frankly, one of the stronger payroll BRDs I have seen authored outside a commercial HCM vendor. It gets the *spine* of audit-grade payroll right, and it gets it right on purpose, not by accident.

Three things elevate it above typical government RFP fare. First, **determinism as a first-class contract** (G1, NFR "Determinism", FR-04/AC2): the run engine is defined as a pure function of (structure version, effective rate tables, inputs, prior balances), with `calc_trace` JSONB on every payslip line. That single decision makes the system defensible in audit and in litigation — you can reproduce any rupee. Second, **immutability with a disciplined correction calculus** (FR-16, Appendix 16.4): locked runs never mutate; corrections flow only through arrears (FR-10), supplementary/off-cycle (FR-11), or recovery (FR-09), each referencing the original run. This is exactly how Workday and SAP treat finalised results, and most in-house government systems get it catastrophically wrong by allowing "just fix the payslip." Third, **the three-way tie-out gate** (FR-15, data integrity rule #1–#4, #10) wired as a *hard* precondition to approval, with SoD baked into the data model (`approved_by ≠ created_by`, `signed_by ≠ run creator`).

The **parallel/what-if run** (FR-18) is genuinely best-in-class and rare in public-sector builds: modelling a DA revision's cost-to-org before committing it is the kind of capability that wins Finance's trust. Effective-dated rate tables that auto-trigger retrospective arrears (FR-02 → FR-10) directly solve the single most painful government payroll reality — DA notified months late.

The statutory surface is credibly scoped: GPF vs NPS by DOJ, PT slabs, TDS with old/new regime, Form-16/24Q, net-pay protection with an explicit recovery priority (Appendix 16.3). The author clearly understands that government payroll is a *rules engine* problem, not a CRUD problem. The bones are world-class; my colleagues will find soft tissue to attack, but the skeleton holds.

### Advisor 2 — The Contrarian (non-obvious failure modes)

The skeleton holds; the parts that move money at scale are where it breaks. Eight specific failure modes:

**1. Double-payment on resend — the unmissed catastrophe.** FR-14 LLD says "gateway timeout → 503, idempotent resend." An `Idempotency-Key` protects *your* endpoint; it does **not** protect the *bank's* ledger. Real failure: file transmits, bank credits all accounts, the ack channel times out, your operator hits resend, second file credits everyone again. The BRD has no bank-side unique batch reference, no positive debit-reconciliation against the treasury account before resend, and no "we believe this may already be processed — confirm" guard. At 50,000 employees this is a career-ending duplicate disbursement. **This is the risk the author most under-specified.**

**2. The bank-file total is internally contradictory.** Data integrity rule #4: `bank_disbursements.total_amount = Σ payslip.net_pay (FINAL)` and `record_count = count(net>0)`. But FR-14/BR1 *excludes* invalid/missing-account payees before transmission. So file total < run net total whenever any account is invalid — the stated invariant is violated by design. There is no suspense/hold ledger for the withheld net of excluded employees, and no reconciliation that `disbursed + withheld + failed = run net`. Money goes missing from the tie-out.

**3. Rounding residue is unowned.** Each component rounds half-up to the rupee (16.2). Σ(rounded statutory) ≠ round(Σ), and per-employee NPS/GPF rounding pennies, summed across 50k employees, will be rejected by NSDL-CRA / GPF remittance reconciliation. There is no rounding-adjustment component to absorb residue and no remittance tolerance policy.

**4. `cumulative_ytd` is a mutable scalar — a YTD-corruption bomb.** `deductions.cumulative_ytd` is a single updatable column "updated idempotently per run." But regular + arrears + off-cycle all hit the same YTD, and a *reopen* (FR-16) re-runs a locked period. A mutable accumulator cannot be safely reversed; YTD will drift and Form-16/24Q will not tie. YTD must be *derived* from an immutable per-line ledger, never stored mutably.

**5. TDS is a black box hiding non-compliance.** "projected_tax" appears with no surcharge, no 4% cess, no marginal relief, no standard deduction, no 87A rebate, no Section 89(1)/Form-10E mechanics (only "relief reflected"), no previous-employer income (Form 12B) for mid-year joiners. **Perquisites are entirely absent** — and the BRD itself grants concessional HBA loans (FR-08), whose interest subsidy is a taxable perquisite under Rule 3. The system computes the loan but never taxes the perquisite: built-in under-deduction.

**6. Reopen-after-lock leaves orphaned immutable payslips.** Lock sets `is_immutable=true`; reopen → re-run. What happens to the first locked payslips? `payslip.status` has REVERSED but the supersession/versioning and the diff-audit ("what changed between lock-1 and lock-2") are unspecified.

**7. Net-pay protection floor is undefined and ignores attachment-specific exemption.** "Protected minimum/floor" is referenced five times, quantified zero times. Court attachments carry their own statutory exemption (CPC s.60) independent of a flat floor.

**8. Concurrency.** Nothing forbids two FINAL runs for one cycle started by two officers — `Idempotency-Key` guards retries, not distinct callers. Need a single-in-flight-run constraint per cycle.

### Advisor 3 — The First Principles Thinker

Strip it down. What is payroll, fundamentally? It is a **deterministic function over time-versioned facts that produces an irreversible money movement and a set of statutory liabilities.** The BRD nails the first clause and the irreversibility clause. It under-builds the *liabilities* clause — and that omission reveals a hidden assumption.

**Build vs configurable engine vs buy.** The BRD chose "configurable rule engine" (formula DSL, versioned `pay_rules`, effective-dated `rate_tables`) — correct for this context. A pure *buy* (Workday/SF) fails the public-sector statutory shape (pay matrix, GPF, SR events, DDO sanction). A pure *build with hardcoded rules* fails the "DA changes retrospectively" reality. The configurable-engine choice is right. **But the safe-expression DSL is a build-vs-buy decision smuggled in at component level.** A homegrown formula evaluator with "whitelisted tokens" is a security and correctness surface that teams routinely get wrong (circular refs are noted; but operator precedence, decimal semantics, null propagation, and DSL versioning vs rule versioning are not). First-principles question: is the DSL earning its keep versus a fixed library of parameterised calc strategies (FIXED/PERCENT/SLAB/FORMULA already exist as `calc_method`)? The FORMULA escape hatch may be 5% of value at 50% of risk.

**The hidden assumption.** The BRD assumes **payroll ends at "produce a remittance schedule and a bank file."** Re-derive from first principles: the organisation's obligation does not end when it *computes* TDS/GPF/NPS — it ends when it has *deposited* those amounts to the government, captured the challan/CIN, met the statutory deadline, and *posted the journal to the books*. The BRD models the deduction (FR-06) and the schedule (FR-17) but **not the remittance as a tracked, reconciled liability** (challan number, deposit date, late-deposit interest u/s 201/234E) and **not the GL posting** beyond a vague "cost journal export." That is the difference between a payroll *calculator* and a payroll *system of record*. Everything downstream — Form-16 Part A from TRACES, audit, year-end — depends on the deposited-and-matched fact, not the computed fact.

Second hidden assumption: **one employee = one pay event per period in one org unit.** Mid-month transfer between DDOs (M05 exists!) breaks this; who pays, split payslip, which control account? Unmodelled.

### Advisor 4 — The Outsider

I am not a payroll specialist. I read this as an intelligent person who will *use* and *fund* the system. Reactions:

It is dense but mostly honest dense — the acronyms (GPF, NPS, PT, TDS, LWP, DDO, LTC, PRAN) are at least in the glossary, which many specs forget. Good.

But several places assume I already know the *consequences* of a rule. Example: "net_pay ≥ 0 ... excess recovery rolls forward and is flagged." As a department head I'd ask: rolls forward *to where, for how long, visible to whom*? Is there a screen where I see "this employee has ₹X of un-recovered deductions queued"? It is asserted as an invariant but not surfaced as a managed backlog with an owner.

"Subsistence allowance only" for suspended employees (FR-04 edge case) is dropped in as if obvious. To an outsider — and to a suspended employee's union — this is a *huge* deal with its own escalating rules (e.g., enhanced after N months). It is mentioned but not specified. Same with "dies-non." These are the cases that generate grievances and litigation, and they get one parenthetical each.

The **what-if run** I love conceptually but as a non-expert I can't tell from the spec whether the comparison output is something I can actually *act on* (export to a board paper?) or a developer's diff. "Delta highlighting" is jargon for "we'll figure out the UI later."

Complexity smell: **four bank file formats** (NACH, FIXED_WIDTH, ISO20022, CUSTOM) for what §2.4 says is a single treasury per deployment. That's three formats I'm paying to build and certify that nobody will use on day one. Pick the one the treasury accepts; keep the strategy seam, drop the speculative formats.

Finally, as the person signing off: where is the **full-and-final settlement** of someone who *leaves*? I see arrears, loans, gratuity-accrual, TDS-settlement scattered across FRs, but no single "this person is leaving on the 15th, here is their last cheque after notice-pay recovery, loan settlement, leave encashment, and gratuity" screen. Every employee eventually exits; that flow shouldn't be a treasure hunt across five FRs.

### Advisor 5 — The Executor

Feasibility and sequencing. The build order (§14.2) and parallel-agent plan (§14.3) are sane: config (FR-01/02) → structures (FR-03) → inputs/deductions → engine (FR-04) → controls → output. I'd ship in that order. But several dependencies are mis-sequenced or under-resourced for a *real* delivery:

**1. The engine (FR-04) is on the critical path and is the riskiest single component, yet TDS (FR-07) is sequenced last (stream F / step 8).** TDS is the highest-defect, highest-compliance-risk calculation and it feeds reconciliation and Form-16. Deferring it means the first "real" reconciliation happens late, after the engine is frozen. Pull a TDS spike forward into stream B.

**2. Migration YTD load (§13.1) is the silent killer.** "Load FY-to-date earnings/deductions/TDS for mid-year cutover." If the new system models YTD as a mutable scalar (see Contrarian #4) and migration seeds it wrong, every Form-16 is wrong and you find out in Q4. The 2-cycle parallel run (§13.2) is good but must reconcile **YTD and statutory totals**, not just monthly net — the BRD says this once; make it a gate.

**3. Bank certification is a long-pole external dependency** treated as a checklist item (§13.4 "bank file format certified with bank in test"). Treasury/NACH certification cycles take weeks and need a DSC/HSM signing path — which the BRD doesn't specify (it has `checksum` + `signed_by`, not a cryptographic signature). Start this in week 1, not at launch readiness.

**4. The Monday-morning first step:** stand up `pay_components` + `pay_rules` + `rate_tables` with the DSL evaluator and a golden-set of ~20 real employees whose legacy payslips you already have, and prove byte-for-byte reproduction of last month. Everything else is downstream of "can we reproduce a known-good payslip?" If the DSL can't, kill the DSL early.

**5. Under-specified for build:** net-pay-protection floor value, subsistence-allowance rules, FnF flow, remittance-liability lifecycle, perquisite valuation. Each is a "we'll clarify in LLD" trap that will stall a coding agent. They need numbers/rules now or explicit AMBIGUITY tickets.

Estimate: the happy-path monthly run is ~60% of effort; the 40% the BRD soft-pedals (arrears cascade, TDS depth, disbursement reversal/suspense, remittance loop, FnF) is where schedules die.

---

## 2. Anonymous Peer Review

Advisors anonymised as **A** (Proponent), **B** (Contrarian), **C** (First Principles), **D** (Outsider), **E** (Executor).

**Reviewer 1 on A —** *Strongest:* A correctly identifies that determinism + immutability + three-way tie-out is the load-bearing trio, and that the correction calculus (arrears/supplementary/recovery, never edit) is what separates this from amateur payroll. That is the right thing to praise and it's real. *Biggest blind spot:* A treats "produces a remittance schedule" as completion; A never asks whether the money was actually deposited and posted. A admires the calculation and ignores the liability lifecycle — the same gap C names precisely.

**Reviewer 2 on B —** *Strongest:* The double-payment-on-resend analysis (#1) and the bank-file-total contradiction (#2) are concrete, exploitable, and tied to specific BRD lines (FR-14 LLD, integrity rule #4). These are the two findings most likely to cause real financial loss. *Biggest blind spot:* B is laser-focused on the disbursement edge and the YTD scalar, but B implicitly accepts the *organisational* boundary of the system — B never challenges that payroll should also own the deposited-vs-deducted reconciliation; B fixes the calculator, C reframes the system.

**Reviewer 3 on C —** *Strongest:* The reframing that "payroll ends at deposited-and-posted, not computed" is the single most valuable idea in the council — it converts a vague "FR-17 generates schedules" into a missing entity (`statutory_remittances` with challan/CIN/deadline/penalty) and a missing GL-posting model. Highest leverage. *Biggest blind spot:* C waves at the DSL ("5% of value, 50% of risk") but offers no decision criterion; killing the FORMULA escape hatch could remove a genuinely needed capability (complex conditional allowances). C diagnoses but under-prescribes on build-vs-buy at the DSL level.

**Reviewer 4 on D —** *Strongest:* D surfaces the **full-and-final settlement** gap, which all the specialists buried — a glaring best-in-class omission an HCM buyer would flag in the first demo. D also rightly attacks the four-bank-format over-engineering. The naïve-user lens caught real things. *Biggest blind spot:* D underweights statutory correctness (perquisites, surcharge) because they're invisible to a casual reader — the most expensive defects are the ones D can't see.

**Reviewer 5 on E —** *Strongest:* E's insistence that migration YTD load + 2-cycle parallel reconciliation of *statutory totals* is the silent killer, and that bank DSC certification is a week-1 long-pole, is exactly the delivery wisdom that turns a good spec into a shipped system. The "reproduce a known-good payslip on Monday" first step is perfect. *Biggest blind spot:* E accepts the FR list as the scope and sequences within it; E doesn't push back that two *missing* FRs (remittance lifecycle, FnF) belong in the plan, so E's estimate is optimistic by exactly the work nobody scoped.

**What ALL FIVE missed (genuine):** Every advisor reasoned about correctness *within a pay period* and reversibility *of a run*, but none addressed **temporal authority and data-staleness across modules at compute time** — specifically, there is **no point-in-time consistency contract between M10 and its upstreams (M01 master, M03 attendance, M06 fixation, M09 recovery)**. The BRD freezes M10's *own* inputs at cutoff, but it never specifies *as-of-when* it reads the employee master, bank account, scheme (GPF/NPS), or org-unit. If an employee's bank account in M01 changes between cutoff and disbursement, which account is paid? If M06 issues a fixation order *after* cutoff but *before* lock, is it in or out? The whole system is built on "deterministic function of versioned facts" — but the *upstream* facts (M01/M03/M06/M09) are not themselves snapshotted with an effective-as-of timestamp into the run. Determinism is only as good as the snapshot boundary, and that boundary is defined for M10-owned data and silent for the cross-module data that actually identifies *who* gets paid *how much* into *which account*. That is the collective blind spot.

---

## 3. Chairman Synthesis

### 3.1 Agreements (high confidence)

- The architectural spine — determinism, immutability, correction calculus, three-way tie-out, SoD-in-the-schema, effective-dated rates, what-if runs — is genuinely world-class and should be preserved verbatim.
- The system stops one step short of being a payroll *system of record*: it computes liabilities but does not track them through **actual remittance (challan/CIN/deadline/penalty)** or **GL posting**. (C, A-by-omission, E)
- **Disbursement integrity is the highest financial risk**: double-payment on resend and the suspense/excluded-account gap, plus the self-contradictory bank-file-total invariant. (B, partially C)
- **TDS is under-specified to the point of compliance risk**: missing perquisites (esp. concessional-loan perquisite the BRD itself creates), surcharge/cess/marginal-relief, 89(1)/10E, previous-employer income. (B, D-by-omission)
- **Full-and-final settlement** is a missing first-class flow. (D)
- Over-engineering: four bank formats from day one. (D)

### 3.2 Clashes

- **DSL: keep or cut?** C and E lean toward shrinking/killing the FORMULA escape hatch (risk); A values its configurability. **Resolution (second pass below):** keep the DSL but constrain and version it; do not remove — the public-sector allowance zoo needs conditional logic.
- **Scope boundary:** B fixes the existing FRs; C/D/E argue two new FRs (remittance lifecycle, FnF) must be added. **Resolution:** add them — they are not gold-plating, they are the parts of the legal obligation the BRD currently externalises.

### 3.3 Blind Spots Collected

Cross-module point-in-time snapshot contract (all five); remittance-as-liability + GL posting (C); double-payment/suspense (B); perquisites & TDS depth (B); FnF (D); YTD-as-ledger not scalar (B); net-pay floor & attachment exemption value (B); multi-state PT key (B, implied); reopen/payslip-supersession audit (B); concurrency single-in-flight run (B); subsistence-allowance rules (D, E); mid-month inter-DDO transfer split (C).

### 3.4 Idea Evolution

The BRD evolves from **"an audit-grade payroll calculator with disbursement"** to **"an audit-grade payroll system of record that proves money was correctly computed, correctly paid, correctly remitted to the State, and correctly booked — from a defined cross-module snapshot, through to every employee's exit."** The spine doesn't change; three rings are added around it: (1) a *snapshot boundary* upstream, (2) a *remittance + GL liability loop* downstream of computation, (3) *exit and edge-life* completeness (FnF, subsistence, suspense).

### 3.5 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Duplicate disbursement on idempotent resend after gateway timeout (bank already credited) | **Critical** | B | Bank-side unique batch reference + mandatory debit/positive-pay reconciliation against treasury account before any resend; "suspected-processed" guard state; no resend without confirmed non-debit |
| R2 | Bank-file-total invariant (#4) contradicts excluded-account exclusion (FR-14/BR1) — money falls out of tie-out | **Critical** | B | Introduce `disbursement_holds`/suspense ledger; redefine invariant: `disbursed + held(excluded) + failed = run net`; nothing leaves reconciliation silently |
| R3 | `cumulative_ytd` mutable scalar corrupts on arrears/off-cycle/reopen; Form-16/24Q won't tie | **Critical** | B | Derive YTD from immutable `payslip_lines` ledger (statutory YTD = sum over FY); never store mutable accumulator; reopen creates superseding payslip version |
| R4 | Statutory liability never tracked to actual deposit (challan/CIN/deadline/penalty); no GL posting | **High** | C | New FR + `statutory_remittances` entity and `gl_journal` posting model; close deducted→deposited→matched loop with late-interest u/s 201/234E |
| R5 | TDS missing perquisites (incl. self-created concessional-loan perquisite), surcharge, cess, marginal relief, 89(1)/10E, Form 12B | **High** | B, D | Expand FR-07: perquisite valuation component/entity (Rule 3), full slab→surcharge→cess→relief pipeline, Form-10E, previous-employer income capture |
| R6 | No cross-module point-in-time snapshot of M01/M03/M06/M09 facts into the run | **High** | Council (all) | Define snapshot-as-of contract; persist snapshotted employee/bank/scheme/org facts onto run/payslip; specify post-cutoff order handling |
| R7 | Full-and-final settlement not a first-class flow | **High** | D | New FR: consolidated FnF run (notice pay, loan settlement, leave encashment, gratuity, final TDS) netting to last payment, with M11 handoff |
| R8 | Net-pay protection floor undefined; court-attachment exemption (CPC s.60) not modelled | **High** | B | Specify configurable floor + per-attachment statutory exemption math; surface "rolled-forward un-recovered" as a managed, owned backlog |
| R9 | Rounding residue unowned; per-employee statutory pennies rejected by CRA/GPF reconciliation | Medium | B | Rounding-adjustment component to absorb residue; documented remittance tolerance; round-then-reconcile policy |
| R10 | Reopen leaves orphaned immutable payslips; no supersession/version-diff audit | Medium | B | Define payslip versioning on reopen (REVERSED→new version), lock-to-lock diff in audit_log |
| R11 | Concurrency: two FINAL runs per cycle by different users | Medium | B | Single-in-flight-run DB constraint per cycle; cycle-level advisory lock |
| R12 | PT modelled without state dimension (multi-state employees in one entity) | Medium | B | Add `state` to PT_SLAB key; resolve PT by work-state |
| R13 | Subsistence allowance / dies-non rules asserted, not specified | Medium | D, E | Specify subsistence computation (initial %, escalation after N months) and dies-non no-pay-no-service handling |
| R14 | DSL evaluator correctness/security (precedence, decimals, nulls, DSL versioning) | Medium | C, E | Constrain DSL; pin decimal semantics; version the DSL grammar independently of rule versions; property-test |
| R15 | Bank file "signed" via checksum, not cryptographic signature (treasury needs DSC/HSM) | Medium | E | Specify DSC/HSM digital signature + verification; checksum is integrity, not authenticity |
| R16 | Mid-month inter-DDO transfer: ambiguous payer/split payslip | Medium | C | Define split-period payslip or single-DDO-of-record rule for transfer month |
| R17 | Over-engineering: 4 bank formats day-one | Low | D | Ship the treasury's format; retain strategy seam; defer others |
| R18 | Migration YTD seed errors surface only at year-end Form-16 | High (delivery) | E | Gate cutover on 2-cycle parallel reconciliation of YTD + statutory totals, not just net |
| R19 | Overpayment recovery may be legally barred (Rafiq Masih) for certain grades/retirees | Low | B | Add legal-eligibility check/flag before scheduling overpayment recovery |

### 3.6 Recommendation

**Proceed to Gate A conditionally.** The BRD is fundamentally sound and well above typical public-sector standard; do **not** rewrite it. Approve the spine and require a focused v2 amendment that (a) closes the two Critical disbursement/YTD integrity defects (R1–R3), (b) adds the missing liability/exit rings (R4, R5, R7), (c) defines the cross-module snapshot contract (R6), and (d) fills the under-specified numbers (R8, R13) so coding agents don't stall. Items R9–R19 are tractable as v2 line-edits. This is a "tighten and extend," not a "redo."

### 3.7 Focused Second Pass — the one FUNDAMENTAL clash

**Clash: does payroll's boundary end at "compute + disburse + produce schedule," or does it extend to "remit-to-State + post-to-GL"?** This is fundamental because it determines whether two new FRs and entities enter scope.

*Argument for the narrow boundary (implicit in v1, defended on A's behalf):* §2.3 explicitly scopes GL posting "Export only — Finance posts in ERP/treasury," and remittance *execution* arguably belongs to treasury. Adding deposit tracking risks scope creep into accounting.

*Argument for the wider boundary (C, E, D):* The BRD already commits to "zero statutory-deadline misses" (G2) and "statutory deadline tracking" (NFR Compliance, FR-17/BR3). You **cannot** guarantee a deadline you do not track to *actual deposit*. Form-16 Part A is the *deposited* TDS (TRACES), not the deducted TDS; without the challan/CIN match, Form-16 (FR-17/AC1) is unverifiable. The narrow boundary makes the BRD's own success criteria unprovable.

**Chairman ruling:** The wider boundary wins, but *surgically*. M10 does **not** become a general ledger. It adds a thin **statutory-remittance liability tracker** (deduction → schedule → challan/CIN/deposit-date/deadline/late-interest → matched) and a **payroll cost-journal posting record** (the structured export object with a posted/acknowledged status), stopping at the boundary where Finance's ERP takes over. This satisfies G2 and FR-17 without absorbing accounting. The export-only GL note in §2.3 is amended to "export + posting-status tracking," not full GL ownership.

---

## Adopted Improvements for BRD v2

1. **Add FR-M10-19 "Statutory Remittance & Liability Tracking"** with a new entity `statutory_remittances` (scheme, period, deducted_total, employer_total, challan_no/CIN, deposit_date, statutory_due_date, late_interest, status: ACCRUED→DEPOSITED→MATCHED→OVERDUE). Close the deducted→deposited→matched loop; compute late-deposit interest (u/s 201/234E). FR-17 schedules feed this; Form-16 Part A derives from MATCHED remittances, not raw deductions.

2. **Add FR-M10-20 "Full-and-Final Settlement (FnF)"**: a consolidated separation run that nets notice-pay recovery, unrecovered loan principal+interest, leave encashment, final-month pay, gratuity (handoff/settlement with M11), and final TDS true-up into a single last payment, with its own reconciliation and SoD. Add `fnf_settlements` entity (or a run_type FNF on `payroll_cycles`).

3. **Fix the disbursement double-payment risk (R1):** require a bank-side unique batch reference and a mandatory **debit/positive-pay reconciliation against the treasury account before any resend**; add a `bank_disbursements.status` value `SUSPECTED_PROCESSED`; forbid resend until confirmed non-debit. Replace "idempotent resend" wording in FR-14 with this controlled flow.

4. **Resolve the bank-file-total contradiction (R2):** add a `disbursement_holds` (suspense) ledger for excluded/invalid-account net pay; redefine data integrity rule #4 as `Σ disbursed + Σ held + Σ failed = run net_total`; nothing leaves the tie-out silently. Held amounts are a tracked, owned backlog with re-disbursement workflow.

5. **Convert YTD from mutable scalar to derived ledger (R3):** remove reliance on `deductions.cumulative_ytd` as the source of truth; define statutory/tax YTD as the immutable sum over `payslip_lines` for the FY (across regular+arrears+off-cycle). Keep `cumulative_ytd` only as a cached, recomputable projection. Guarantees Form-16/24Q tie-out and safe reopen.

6. **Add taxable-perquisites modelling (R5):** new component category `PERQUISITE` and an entity/section for perquisite valuation (Rule 3) — explicitly including the **concessional/interest-free loan perquisite** generated by FR-08 HBA/vehicle loans, and employer-provided accommodation (license-fee). Wire perquisite value into FR-07 taxable income.

7. **Deepen the TDS pipeline in FR-07 (R5):** specify the full chain — gross taxable → standard deduction → chapter-VI-A → slab tax (regime-correct) → **surcharge (with marginal relief)** → **4% health & education cess** → **87A rebate** → relief u/s 89(1) via **Form-10E**; add capture of **previous-employer income (Form 12B)** for mid-year joiners. Replace the opaque `projected_tax` with a documented, traceable computation.

8. **Define the cross-module point-in-time snapshot contract (R6):** specify *as-of* semantics for reading M01 (employee/bank/PAN), M03 (attendance), M06 (fixation), M09 (recovery), and org_unit; persist the snapshotted facts onto the run/payslip so determinism extends to upstream data. Define explicit rules for orders arriving after cutoff but before lock (in → next cycle/arrears).

9. **Specify the net-pay protection floor and attachment exemption (R8):** make the protected-minimum a configurable value (per cadre/jurisdiction); model court-attachment statutory exemption (CPC s.60) independently of the flat floor; surface "rolled-forward un-recovered deductions" as a managed backlog screen with an owner and ageing.

10. **Add a rounding-adjustment component and tolerance policy (R9):** a designated component absorbs Σ(rounded)−round(Σ) residue per payslip so gross/net tie exactly; document a remittance reconciliation tolerance for per-employee statutory pennies against CRA/GPF.

11. **Define reopen payslip-versioning and lock-to-lock audit (R10):** on reopen, original payslips move to REVERSED and a new payslip *version* is produced; persist a structured diff (what changed, by whom, why) in `audit_log`; YTD recomputes from the surviving version set.

12. **Add a single-in-flight-run constraint per cycle (R11):** DB-level/advisory lock preventing two concurrent FINAL (or conflicting DRAFT/FINAL) runs for the same cycle; surface a clear conflict error.

13. **Add a state dimension to professional tax (R12):** extend `rate_tables` PT_SLAB key with work-state; resolve PT by the employee's state of posting (supports multi-state within one legal entity).

14. **Specify subsistence-allowance and dies-non rules (R13):** subsistence computation for suspended employees (initial percentage, escalation after a configured duration) and dies-non (no pay / no service) handling, as explicit business rules in FR-04/FR-06 rather than parenthetical edge cases.

15. **Constrain and version the formula DSL (R14):** pin decimal/null/precedence semantics; version the DSL grammar independently of rule versions; restrict the FORMULA escape hatch to vetted, property-tested expressions; document the security model beyond "whitelisted tokens." Keep the DSL (do not remove) but bound its risk.

16. **Replace checksum-only signing with a cryptographic signature (R15):** specify DSC/HSM digital signature of the bank file with verification on transmit and on ack; retain checksum as integrity, add signature as authenticity/non-repudiation. Reflect this in §13 launch readiness as a week-1 long-pole.

17. **Define mid-month inter-DDO transfer payment rule (R16):** either split-period payslips across the two DDOs or a single "DDO-of-record for the transfer month" rule; ensure the bank file and control account attribute correctly.

18. **Add a payroll cost-journal posting record and status (R4/§2.3 amendment):** structured `gl_journal` export object with `POSTED/ACKNOWLEDGED` status from Finance ERP; amend §2.3 from "export only" to "export + posting-status tracking" (without M10 becoming a general ledger).

19. **Remove bank-format over-engineering (R17):** ship only the treasury-accepted format; retain the `FileFormatStrategy` seam; mark ISO20022/CUSTOM as deferred/future rather than day-one build-and-certify.

20. **Strengthen migration/cutover gating (R18):** make the 2-cycle parallel run reconcile **YTD accumulators and per-scheme statutory totals to zero variance** (not just monthly net) an explicit Gate before go-live; treat mid-year YTD seed as a verified, signed-off dataset.

21. **Add an overpayment-recovery legal-eligibility check (R19):** before scheduling overpayment recovery, flag legally-barred cases (e.g., low-grade/retired employees per Rafiq Masih line of rulings) for explicit authority decision; record justification (extends FR-09/BR2).

22. **Define the arrears dependent-allowance cascade (supports R5/FR-10):** explicitly state that a retrospective basic-pay change recomputes all dependent components (DA, HRA, TPT, NPS, GPF) in computation order for each historical month, and that the arrear's TDS delta flows through the corrected YTD ledger and Form-10E relief.

23. **Add leave-encashment as an explicit benefit/earning rule (supports R7/D):** model encashment computation (eligible leave balance × per-day basis, with caps and taxability) feeding regular pay, FnF, or off-cycle — currently only referenced as an "interplay" edge case.

24. **Surface the "rolled-forward / un-disbursed / held" backlogs as first-class reporting (D):** add register/report views for un-recovered deductions, suspense-held net pay, and overdue remittances so Finance and Audit can see managed exceptions, not just invariants asserted in prose.
