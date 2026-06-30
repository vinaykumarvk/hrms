# Adversarial Idea Evaluator — Council Report
## M03 Attendance & Leave Management BRD (v1.0)

**Artefact under review:** `docs/brd/v1/M03-attendance-and-leave-management.md`
**Shared context:** `docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Attendance & Leave Management BRD complete, correct, and world-class (time capture, shifts/rosters, leave types & accrual, balance ledger, approvals, payroll/SR feeds) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class, and what concrete changes make it bulletproof?
**Benchmark bar:** Workday / SAP SuccessFactors / Oracle HCM, layered on Indian public-sector (CCS Leave Rules) statutory needs.
**Date:** 2026-06-30

---

## Part 1 — The Five Advisors (independent passes)

### Advisor 1 — The Proponent

This is a genuinely strong, build-ready BRD that sits well above the typical government-tender artefact and is close to the HCM-suite bar on structure. Its core architectural decision — an **append-only `leave_balance_ledger` as the single source of truth with `leave_balances` as a reconciled projection** (E15/E14, integrity rule §5.6.1) — is exactly what Workday and Oracle HCM do internally, and it is the single most important thing to get right in any leave engine. The discipline is consistent: every mutating path (`AVAIL`, `AVAIL_REVERSAL`, `ENCASHMENT`, `LAPSE`, `CARRY_FORWARD`, `HPL_CONVERSION`, `ADJUSTMENT`) writes a signed entry with `balance_after`, and corrections are compensating entries, never updates. That is auditor-grade.

The **transactional approval contract** in FR-12 (§5.6.6) — ledger debit + balance update + application status + attendance flip + SR enqueue + notification in one DB transaction — is precisely the atomicity a payroll-feeding system needs. The **year-close SIMULATED→COMMITTED dry-run** (FR-15) with idempotency per (year, scope) is best-in-class; many commercial suites lack a true dry-run with a downloadable reconciliation report.

Public-sector fidelity is strong: HPL/Commuted/CCL/Maternity/Paternity/Study/Sabbatical/LWP are catalogued (Appendix A), retirement encashment is capped at 300 EL days, SR posting is correctly delegated to M04 (never written directly), and the payroll feed locks the period after export with next-period adjustment semantics (FR-17) — the correct way to prevent retroactive pay drift.

Operational maturity shows in the right places: idempotent punch ingestion via `UNIQUE(device_id, source_ref)`, geofence rejection, clock-skew tolerance, soft-reserve to prevent oversubscription, maker-checker on adjustments, and an observability NFR that explicitly alerts on `LEDGER_RECON_MISMATCH` and SR/feed backlog. The traceability table and parallel-agent build plan mean this can actually be parcelled to a fleet of coding agents. The bones are world-class; the gaps below are refinements on a sound skeleton, not a rebuild.

### Advisor 2 — The Contrarian (non-obvious failure modes)

The polish hides several latent defects that will surface as money and audit problems.

1. **The soft-reserve is a phantom.** FR-12, the state table, and the API example (`"softReserved": 2.5`) all depend on a balance hold at submission — but **no entity or column stores it.** `leave_balances` has no `reserved` field, and the append-only ledger has no `RESERVE` entry type. With concurrent applications, two requests each read `available = current − 0`, both pass, both approve, and the balance goes negative or oversubscribes. This is a textbook **lost-update race** and the BRD has no concurrency control (no row lock, no optimistic version) on the balance debit. Ledger drift is not hypothetical here; it is designed-in.

2. **Half-day leave breaks the one-status-per-day model.** `attendance_daily.status` is a single ENUM and `UNIQUE(employee_id, attendance_date)` enforces one row. An employee on `FIRST_HALF` leave who works the afternoon is simultaneously half-`ON_LEAVE` and half-`PRESENT`. The model cannot represent it, so `present_days` (0.5) and `lwp`/leave accounting for that day will be miscomputed in the payroll feed (FR-17). Half-day is mentioned everywhere but **never reconciled with the daily-status schema.**

3. **Commuted leave debits the wrong pot.** Commuted Leave is its own `leave_type` (COMMUTED) yet statutorily debits **2 HPL days per 1 commuted day** (Appendix A, glossary). There is no rule linking an `AVAIL` against COMMUTED to a 2× debit of HPL balance. As written, the engine debits a COMMUTED balance that has no accrual source. Encashment and HPL exhaustion will be wrong.

4. **Retirement encashment under-counts.** Under CCS rules, the 300-day cap is met from EL **and**, on shortfall, the cash-equivalent of HPL — but HPL is flagged `is_encashable=false` with no retirement exception. Retirees will be short-changed, which in government means litigation.

5. **Retroactive recompute vs. locked payroll.** Roster/holiday edits "trigger attendance recompute for affected days" (FR-01/02 LLD). If those days are in an EXPORTED/locked period (FR-17), recompute either silently corrupts a fed period or is silently dropped. The interaction is unspecified — a reconciliation landmine.

6. **The risk the author missed: accrual rounding and proration drift.** `accrual_quantity` is `NUMERIC(5,2)` and proration is `ATTENDANCE_PRORATED`/`SERVICE_LENGTH`, but **no rounding rule** is defined (round up, down, nearest 0.5, banker's). Across 50k employees and mid-year joiners/leavers, undefined rounding produces thousands of half-day discrepancies and unreconcilable year-close totals. Define the rounding mode and the leave-year definition (calendar vs. financial) explicitly.

### Advisor 3 — The First Principles Thinker

Strip the BRD to its primitives and one framing error stands out: **it forces two fundamentally different kinds of absence through one balance-ledger paradigm.**

There are really two paradigms here. (a) **Balance-based leave** — CL, EL, HPL, Comp-off: there is a quantity, it accrues, it depletes, it must reconcile to a ledger. (b) **Sanction-based / entitlement leave** — Maternity (180), Paternity (15), CCL (730 career), Study, Sabbatical, LWP: there is **no meaningful "balance."** Maternity is `is_accruable=false`, so its `leave_balances` row is permanently 0, and the BRD has to special-case "negative balance allowed for advance types" (rule §5.6.2) to make the ledger swallow a paradigm it was not built for. That special-casing is the smell. A cleaner model: balance-based types reconcile to the ledger; sanction-based types are governed by **entitlement counters** (career quota, per-event cap, surviving-children eligibility) and a sanction record, not a debit against a phantom balance. The current model will keep sprouting exceptions ("except for advance types", "except retirement HPL") until the invariant is meaningless.

A second hidden assumption: **a "day" is the atomic unit.** But the system already admits halves (`day_units` 0.5) and minutes (worked_minutes, OT). The daily-status ENUM (one label per day) is a lossy projection over a richer reality (a day can be part-leave, part-present, part-OD). The simpler, more honest primitive is a **per-day allocation set** that sums to ≤ 1.0 across statuses, with the single ENUM kept only as a display rollup. That dissolves the half-day contradiction the Contrarian found and the OD-on-half-day and WFH-half-day cases too.

Third, the **`leave_year` is asserted as a single INT** but the domain has at least two calendars (CL/EL on calendar year; some entitlements on financial year; CCL/Maternity on career/event). The assumption "one year axis" is doing unexamined work. Name the year-basis per leave type.

Net: the engine is well-built for paradigm (a). It is bolting paradigm (b) and sub-day allocation onto it by exception. Separating those two concerns now is cheaper than patching them in production.

### Advisor 4 — The Outsider

As someone who does not live in HR systems, most of this is impressively legible — but a few places hide assumptions behind jargon that a new employee, an auditor, or a non-Indian reviewer cannot decode.

- **"Sandwich rule"** appears in the glossary, FR-02, and FR-12 as a configurable toggle, but the actual behaviour ("a holiday or weekly-off falling between two leave days is or isn't counted as leave") is never stated as a rule with a worked example. Whether it is configured per-leave-type or globally is ambiguous (CL and EL treat sandwiched holidays differently in real government practice). A reader cannot tell what the system will actually do.
- **"SAT2","SAT4"** weekly-off codes are used in sample data with no legend. Second and fourth Saturday? Or the 2nd and 4th of the month? An implementer will guess.
- **"Soft-reserve"** is defined but, as the Contrarian noted, has no home — so a reader who tries to trace it finds nothing.
- **"LTC"** appears as an `encashment_type` value and in a one-line business rule ("in-service encashment may need LTC linkage") but is otherwise undefined. An outsider has no idea LTC = Leave Travel Concession, that it has its own 10-day/60-career-day EL-encashment rule, and there is no entity for it. It is jargon pointing at nothing.
- **"Commuted leave 2:1"** — the ratio is stated but the mechanism (which balance is touched) is invisible.
- The **`processing_run_id`** and **RH election** are referenced (FR-04 stores it; FR-02 "UPSERT RH election") but neither has a table in the entity inventory — a reader following the data model hits dead references.

Complexity smell: 20 new entities, 18 FRs, ~30 error codes is a lot, and most of it is justified — but the BRD never gives a **one-paragraph "how a single leave day flows end to end"** narrative. A newcomer must reverse-engineer the flow from twelve scattered tables. One worked example (apply → reserve → approve → ledger → attendance → SR → payroll) would cut onboarding time enormously and expose the soft-reserve gap immediately. The jargon is mostly correct; the problem is the undefined terms are exactly the ones tied to money (commuted, LTC, encashment shortfall, sandwich).

### Advisor 5 — The Executor

Feasibility is good — this is parcelable to parallel agents and the build plan (§14.3) is sane. But several items will stall a team in week one because they are referenced without being specified.

**Blockers / dangling references (fix before coding):**
- **No `attendance_processing_runs` table** though `processing_run_id` is a column and runs are described. Track A cannot build FR-04 cleanly.
- **No `rh_elections` table** though FR-02 does "UPSERT RH election" with a cap. Blocks FR-02 acceptance criterion 4.
- **No soft-reserve persistence** (FR-12). Track C cannot implement AC-2/edge cases deterministically.
- **No config/parameter entity** for the nine tunables in Appendix C (windows, caps, thresholds). They are "configurable" with nowhere to configure them. Either a `module_config` table or per-policy fields are needed.
- **No approver-delegation entity** despite SLA-escalation and "escalate to next approver" (FR-18). When a manager is on leave, the approval routing matrix (§10.6) has no fallback — every leave to that team jams.

**Sequencing risks:**
- FR-04 depends on FR-12 (leave→ON_LEAVE) and FR-12's attendance flip depends on FR-04 existing — a soft cycle. Define FR-04 as the single writer of `attendance_daily` and have FR-12 enqueue a recompute rather than writing status directly, or the two tracks will collide on the same rows.
- Year-close (FR-15) and accrual (FR-11) share the ledger and balances; their ordering vs. the Jan/Jul EL credit and vs. encashment-before-lapse must be pinned, or COMMITTED runs will be non-deterministic.

**The Monday step:** Hold a 90-minute data-model review to (1) add the five missing entities (`attendance_processing_runs`, `rh_elections`, `leave_reservations`, `module_config`, `approval_delegations`), (2) add a `dependents/children` source for CCL/Maternity eligibility, and (3) write one end-to-end worked example. Everything else can proceed in parallel after that. Estimated effort to make v2 bulletproof: ~1 week of spec work, no architectural rework — the ledger core is sound.

---

## Part 2 — Anonymous Peer Review (labelled A–E)

> Advisors anonymised; each reviewer answers (1) strongest contribution & why, (2) biggest blind spot precisely, (3) what ALL FIVE missed.

**Reviewer of A (the optimistic pass):**
1. Strongest: correctly identifies the ledger-as-source-of-truth + projection as the load-bearing decision and credits the dry-run year-close — these are the two things that distinguish this from a tender doc.
2. Blind spot: treats "transactional approval" as fully solved, but never asks *what the transaction reads* — it endorses atomicity while missing that the balance read it debits against has no concurrency guard. Praises the contract without checking the precondition.
3. (deferred to common-miss below)

**Reviewer of B (the failure-mode pass):**
1. Strongest: the soft-reserve-is-a-phantom finding and the half-day-vs-single-status contradiction — both are concrete, code-level, and money-affecting, and both are invisible in the BRD's own reconciliation table that claims "0 gaps."
2. Blind spot: frames everything as a defect to patch and does not step back to the structural cause (B would add a `reserved` column; it never asks whether sanction-leave belongs in the balance model at all). Tactical, not structural.
3. (deferred)

**Reviewer of C (the first-principles pass):**
1. Strongest: the two-paradigms insight (balance-based vs. sanction-based leave) reframes a dozen scattered exceptions as one design choice — the highest-leverage observation in the council.
2. Blind spot: elegant but light on migration cost — separating the paradigms touches E12–E18 and the year-close; C asserts "cheaper now than later" without acknowledging it reopens already-"resolved" entities and the parallel-build plan.
3. (deferred)

**Reviewer of D (the legibility pass):**
1. Strongest: catches the undefined money-terms (commuted 2:1 mechanism, LTC, sandwich rule) — precisely the ambiguities that cause wrong payments, and the observation that the dangling terms cluster around money is sharp.
2. Blind spot: stops at "define the term" and does not cost the consequence — e.g. an undefined sandwich rule is not just unclear, it changes `total_days`, the ledger debit, and the payroll feed. Treats clarity as cosmetic rather than financial.
3. (deferred)

**Reviewer of E (the execution pass):**
1. Strongest: the missing-entity list (`attendance_processing_runs`, `rh_elections`, `leave_reservations`, `module_config`, `approval_delegations`, `dependents`) and the FR-04↔FR-12 soft-cycle — actionable, Monday-ready, and exposes that the "0 unresolved gaps" table is wrong.
2. Blind spot: scopes the fix as "~1 week, no architectural rework," implicitly siding against C's paradigm split; if C is right, E's estimate is optimistic.
3. (deferred)

**What ALL FIVE missed (genuine):**
**Biometric/template data governance and consent under DPDP 2023.** The whole council debated balances, races, and entities, but none flagged that **biometric templates and continuous geo-location are "sensitive personal data"** whose collection, storage location (device vs. server), retention, and **employee consent** carry specific DPDP obligations for a government data fiduciary. The BRD says "no PII in push payloads" and "geo minimised," but never addresses biometric template governance, consent capture, a lawful basis for mandatory biometric attendance, or a non-biometric fallback for employees who refuse/cannot enrol — and never addresses **time-fraud controls** (liveness, photo-on-punch, impossible-travel/same-second anomaly detection) beyond a single "GPS spoofing → flag + review" line. For a government system this is both a compliance exposure and a fraud exposure, and it is entirely absent. Secondarily, all five missed that **no leave/attendance data-retention-and-purge schedule** is specified despite the NFR claiming "retention per statutory schedule" — the schedule itself is never given.

---

## Part 3 — Chairman Synthesis

### 3.1 Points of agreement
- The **ledger-as-source-of-truth + reconciled projection** core is correct and world-class; do not touch it.
- The **soft-reserve has no persistence** and the balance debit has **no concurrency control** — unanimous, highest-confidence defect.
- **Half-day leave is incompatible** with the single-status-per-day model; the per-day allocation idea resolves it.
- Several **referenced-but-undefined entities** exist (`processing_run_id`, RH election, soft-reserve, config params, delegation) — the "0 gaps" reconciliation table is therefore inaccurate.
- **Money-terms are under-specified**: commuted 2:1 mechanism, LTC, sandwich rule, retirement HPL encashment shortfall.

### 3.2 Clashes
- **Patch vs. re-frame (B/E vs. C):** Is the sanction-leave problem fixed by adding columns/rules (B, E: ~1 week, no rework) or by separating balance-based from sanction-based leave (C: structural, reopens entities)? See focused second pass below.
- **Scope of effort (E vs. C):** E's "no architectural rework" estimate is only valid if C's reframing is declined.

### 3.3 Blind spots (council-level)
- **DPDP biometric/geo consent, lawful basis, non-biometric fallback, and retention/purge schedule** — missed by all five; material for a government fiduciary.
- **Time-fraud / buddy-punching controls** beyond a single GPS-spoof line — below best-in-class.

### 3.4 Idea evolution
v1 is a strong, ledger-disciplined engine optimised for balance-based leave and clean payroll/SR integration. v2 should (a) make the soft-reserve and concurrency control real, (b) make a "day" a sub-day allocation rather than a single label, (c) cleanly separate sanction/entitlement leave from balance leave, (d) close the dangling entities, (e) specify the money-rules (commuted, LTC, sandwich, retirement HPL), and (f) add the DPDP/biometric/anti-fraud layer. None of this disturbs the ledger core; it hardens the edges that touch money and law.

### 3.5 Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Soft-reserve has no persistence; concurrent approvals cause lost-update → negative/oversubscribed balance | Critical | Contrarian / Executor | Add `leave_reservations` entity (or `reserved` column) + optimistic-lock/version on balance debit; reservation netted into `available` |
| R2 | Half-day leave incompatible with single `attendance_daily.status`; wrong present/LWP in payroll feed | High | Contrarian / First-Principles | Per-day allocation set (sum ≤ 1.0) with status ENUM as display rollup; add `day_fraction` to daily |
| R3 | Accrual proration/rounding undefined → cross-employee drift, unreconcilable year-close | High | Contrarian | Define rounding mode (e.g. nearest 0.5, with carry of fractional remainder) + leave-year basis per type |
| R4 | Commuted leave 2:1 HPL debit not modelled → wrong HPL exhaustion & encashment | High | Contrarian / Outsider | Add debit-ratio rule linking COMMUTED avail to 2× HPL ledger debit |
| R5 | Retirement encashment ignores HPL shortfall make-up to reach 300 days → underpayment/litigation | High | Contrarian | Add retirement encashment rule: EL then HPL cash-equivalent up to statutory cap |
| R6 | Retroactive roster/holiday recompute vs. locked payroll period → silent corruption or dropped correction | High | Contrarian / Executor | Recompute must detect locked period and emit next-period adjustment, never overwrite fed days |
| R7 | Sanction/entitlement leave forced through balance ledger via exceptions → eroding invariants | Medium-High | First-Principles | Introduce entitlement counters (career quota, per-event cap, eligibility) for MAT/PAT/CCL/STUDY/SAB/LWP |
| R8 | Dangling entities (`attendance_processing_runs`, `rh_elections`, soft-reserve, config, delegation) | Medium-High | Executor / Outsider | Add the five missing entities; correct the "0 gaps" reconciliation table |
| R9 | DPDP: no biometric/geo consent, lawful basis, non-biometric fallback, or retention/purge schedule | High | Council (all missed) | Add consent capture, lawful-basis statement, non-biometric fallback, explicit retention/purge schedule |
| R10 | Time-fraud / buddy-punching controls minimal (spoof = flag only) | Medium-High | Contrarian / Council | Add liveness/photo-on-punch option, device-to-employee binding, impossible-travel & duplicate-second anomaly detection |
| R11 | No approver delegation / out-of-office → approvals jam when manager absent | Medium | Executor | Add `approval_delegations` + auto-route-to-delegate in routing matrix |
| R12 | LTC encashment referenced (enum + rule) but undefined (10-day/60-career rule, no entity) | Medium | Outsider | Either fully specify LTC encashment rule/entity or remove the enum value |
| R13 | Sandwich rule behaviour & per-type configurability unspecified → wrong `total_days`/pay | Medium | Outsider | State sandwich rule per leave type with worked example; bind to `total_days` computation |
| R14 | CCL/Maternity statutory eligibility (surviving children, 730-day career quota, child age) not modelled | Medium | First-Principles | Add dependents/children source + career-quota counter; enforce at apply-time |
| R15 | FR-04↔FR-12 soft cycle; two writers of `attendance_daily` | Medium | Executor | Make FR-04 sole writer; FR-12 enqueues recompute |
| R16 | Night-shift/midnight date-bucketing of UTC punch into local `attendance_date` underspecified | Low-Medium | First-Principles / Proponent | Specify punch→attendance_date derivation rule (shift-anchored local date) |
| R17 | Comp-off dual source of truth (COMPOFF leave_type vs `comp_off_ledger`) | Low-Medium | Contrarian | Designate `comp_off_ledger` as sole comp-off balance; COMPOFF leave_type is redemption vehicle only |
| R18 | `sum(leave_application_days.day_units)` not constrained to equal `total_days` | Low | First-Principles | Add integrity rule/trigger asserting equality |
| R19 | Advance-EL clawback on mid-period resignation/transfer not addressed | Low | First-Principles | Add clawback rule (negative ledger entry / payroll recovery) on exit before earning |

### 3.6 Recommendation
**Proceed to build on the existing ledger core — it is sound — but gate coding behind a v2 spec pass that closes R1–R9.** R1 (soft-reserve + concurrency) and R2 (half-day allocation) are correctness-critical and must be resolved before any of Track C (leave core) is parcelled out. R9/R10 (DPDP + anti-fraud) must be resolved before device integration. The remaining items can be addressed in parallel as the relevant tracks start. No architectural rework is required; this is hardening, not rebuilding.

### 3.7 Focused second pass — the one fundamental clash (patch vs. re-frame)

The clash is whether sanction/entitlement leave (MAT/PAT/CCL/STUDY/SAB/LWP) should be (B/E) patched into the balance ledger with rules and columns, or (C) separated into an entitlement paradigm.

**Resolution — a pragmatic split.** C is right about the *concept* but the *cost* matters, so adopt a **hybrid that keeps one ledger but adds an entitlement layer**:
- Keep the single `leave_balance_ledger` for **all** types (it remains the audit spine and one reconciliation path — preserves C's correctness and E's low cost).
- For sanction-based types, add an **`leave_entitlements` counter** (career/event quota, eligibility predicates, surviving-children) that the apply-time validator checks *instead of* a positive accruable balance, and let the ledger record the avail as informational debits without a "negative balance" exception. This removes the `is_accruable=false` + "negative allowed" smell (C's objection) without reopening the entire model (E's constraint). Net effort: ~2–3 days beyond E's estimate, not a rebuild. **Both wings of the council are satisfied;** the invariant ("every balance change is a ledger entry") survives, and sanction leave is governed by quotas/eligibility rather than a phantom positive balance.

---

## Adopted Improvements for BRD v2

1. **Add a `leave_reservations` entity** (employee, leave_type, leave_year, application_id, reserved_units, status RESERVED/RELEASED/CONSUMED) to give the soft-reserve real persistence; net reserved units into the `available` figure shown in `balancePreview`. *(R1)*
2. **Add concurrency control on every balance debit** — optimistic version column on `leave_balances` (or `SELECT … FOR UPDATE` on the balance row) so two concurrent approvals cannot both pass the balance check; add integrity rule and a test for the lost-update race. *(R1)*
3. **Replace single-status-per-day with a per-day allocation:** add `day_fraction` and allow multiple allocations summing to ≤ 1.0 per (employee, date) across statuses (e.g. 0.5 ON_LEAVE + 0.5 PRESENT); keep `attendance_daily.status` as a derived display rollup; fix `present_days`/LWP computation in FR-17 accordingly. *(R2)*
4. **Define accrual rounding and proration explicitly** — rounding mode (e.g. nearest 0.5 with fractional-remainder carry), proration formula for mid-year join/exit, and the **leave-year basis per leave type** (calendar vs. financial); add a worked proration example. *(R3)*
5. **Model Commuted Leave 2:1 debit** — add a `debit_ratio` and `debits_against_leave_type_id` on `leave_types`/policy so availing 1 COMMUTED day posts a 2-day `AVAIL` debit against HPL balance in the ledger. *(R4)*
6. **Add the retirement-encashment shortfall rule** — at RETIREMENT, encash EL up to cap, then HPL cash-equivalent to make up the 300-day statutory ceiling; add a retirement exception to `is_encashable` for HPL and the corresponding ledger/feed entries. *(R5)*
7. **Specify recompute-vs-locked-period behaviour** — any retroactive roster/holiday/regularisation recompute touching an EXPORTED/locked payroll period must NOT overwrite fed days; it emits a next-period adjustment record; add error/flow and a test. *(R6)*
8. **Introduce a `leave_entitlements` counter** for sanction-based types (career quota e.g. CCL 730 days, per-event cap, surviving-children eligibility) checked at apply-time, removing the `is_accruable=false` + negative-balance special case while keeping all events in the ledger. *(R7, R14)*
9. **Add `attendance_processing_runs` entity** (run_id, scope, date_range, status, counts, started/finished) so `attendance_daily.processing_run_id` resolves to a real table. *(R8)*
10. **Add `rh_elections` entity** (employee, calendar_id, holiday_id, leave_year) to back FR-02 RH election and cap enforcement. *(R8)*
11. **Add a `module_config` entity** (or per-policy fields) to hold the nine Appendix-C tunables (regularisation window/cap, backdate window, comp-off validity, RH cap, conflict threshold, CF/encash caps, clock skew) with scope and effective-dating. *(R8)*
12. **Add `approval_delegations` entity** (delegator, delegate, from/to dates, scope) and update the §10.6 routing matrix to auto-route to a delegate when the primary approver is absent or SLA-breached. *(R11)*
13. **Add a dependents/children source** (or reference M01) for CCL/Maternity eligibility (surviving children, child age/disability), enforced at apply-time. *(R14)*
14. **Add DPDP biometric & geo governance:** explicit lawful basis for mandatory biometric/geo capture, consent capture record, a **non-biometric fallback** (RFID/manual/OTP) for non-enrolled or refusing employees, biometric-template storage location statement (device vs. server), and an explicit **data retention & purge schedule** for punches, geo, and leave records. *(R9)*
15. **Strengthen anti-fraud controls:** optional liveness/photo-on-punch, device-to-employee binding, and anomaly detection (impossible travel between consecutive punches, duplicate same-second punches, mismatched geo); add `flagged_for_review` status and a review workflow. *(R10)*
16. **Resolve LTC:** either fully specify the LTC encashment rule (10 days EL per LTC block, 60-day career cap, LTC linkage) with a supporting field/entity, or remove `LTC` from `encashment_type` to avoid a dangling concept. *(R12)*
17. **Specify the sandwich rule per leave type** with a worked example, and bind it deterministically to `total_days` computation in FR-12 (and to `is_non_working` in `leave_application_days`). *(R13)*
18. **Make FR-04 the sole writer of `attendance_daily`;** FR-12/05/07/08 enqueue a recompute rather than writing status directly, removing the FR-04↔FR-12 soft cycle. *(R15)*
19. **Specify the punch→`attendance_date` derivation** (shift-anchored local date for night shifts spanning midnight) and re-frame the "DST not applicable" note as an explicit, revisitable assumption for multi-timezone portability. *(R16)*
20. **Designate `comp_off_ledger` as the single source of truth for comp-off balance;** the COMPOFF `leave_type` is a redemption vehicle only (no parallel `leave_balances` row), removing the dual-source ambiguity. *(R17)*
21. **Add integrity rule:** `SUM(leave_application_days.day_units) = leave_applications.total_days`, enforced by trigger/validator with a test. *(R18)*
22. **Add advance-EL clawback** on mid-period resignation/transfer/death before the credited leave is earned (negative ledger entry or payroll recovery), and define accrual treatment during SUSPENDED/dies-non periods. *(R19)*
23. **Add a single end-to-end worked example** ("one leave day: apply → reserve → approve → ledger debit → attendance → SR post → payroll feed → year-close") to the BRD to anchor onboarding and expose flow gaps. *(Outsider)*
24. **Correct the §14.4 reconciliation table** — it currently asserts "0 unresolved gaps" while several referenced entities/mechanisms are undefined; update it to reflect the v2 additions so traceability is honest. *(Executor)*
25. **Add best-in-class absence features** sized to value: balance "what-if" forecast on a future date, organisation-wide shutdown/mass-leave apply, leave blackout/freeze periods, and a return-to-work/fitness-certificate workflow after long medical leave. *(Proponent / best-in-class bar)*
