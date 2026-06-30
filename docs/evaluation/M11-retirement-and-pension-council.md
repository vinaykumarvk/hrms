# Adversarial Idea Evaluator — Council Report

## Module M11-PEN — Retirement and Pension Management BRD (v1.0)

**Artefact under review:** `/Users/n15318/hrms/docs/brd/v1/M11-retirement-and-pension.md`
**Shared context:** `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Retirement and Pension Management BRD complete, correct, and world-class (separation types, qualifying-service computation, pension/commutation/gratuity/family-pension calc, PPO, OPS vs NPS, pensioner lifecycle incl. life certificate, treasury integration) for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class — and what concrete changes make it bulletproof?
**Council date:** 2026-06-30
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → focused second pass on the fundamental clash.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is, frankly, the strongest module BRD in the suite, and it is close to best-in-class on the dimensions that matter most for pension. Three design decisions deserve explicit praise.

**First, the determinism-plus-trace-plus-rule-version triad.** Every benefit engine is framed as a pure function of (verified service, emoluments snapshot, scheme, effective-dated rule tables, beneficiary data), with a persisted `calc_trace` JSONB and a `rule_version_ref`. This is exactly how Workday and Oracle HCM defend benefit math against audit objection: you can re-derive any rupee years later against the rules that were in force. The immutability-by-supersession policy (Appendix 16.4 — SANCTIONED calc, ISSUED/ACTIVE PPO, APPLIED revision are append-only; corrections create linked revisions) is the correct audit-grade pattern and is rare to see specified this cleanly.

**Second, the no-break continuity engineering.** G1 ("first pension authorised on/before the day after retirement for 100% of cases") backed by anticipatory pension (FR-03), a 1–2-year lead pipeline (FR-01 forecasting → FR-03 pre-retirement), and a first-pension disbursement instruction timed to commencement (FR-14 AC4) is a genuine operational design, not a slogan. Public-sector pensioners suffer most from the gap between retirement and first pension; this BRD attacks it structurally.

**Third, lifecycle completeness.** All six separation types, family-pension conversion on pensioner death (IR8), LC/Jeevan Pramaan with mandatory physical/video-KYC fallback, restoration of the commuted portion on schedule, and a grievance loop that auto-creates from disbursement failures (FR-16 AC3) — this is a full cradle-to-grave-and-beyond model. The SoD discipline (maker ≠ checker on sanction *and* PPO authorisation, SysAdmin barred from sanctioning cases they touch) is enforced at IR and state-guard level, not just asserted.

The data model is coherent (21 owned entities, clean ownership/reuse matrix, 13 integrity rules, sample rows for every key entity), the error catalog is specific (`COMMUTATION_EXCEEDS_LIMIT`, `RECOVERY_EXCEEDS_PROTECTION`, `SCHEME_MISMATCH`), and the migration section actually plans a parallel DA-revision tie-out. This is buildable today. My fear is not that the team builds the wrong thing — it is that two or three statutory specifics (below) are quietly wrong and will produce confidently-wrong numbers.

### Advisor 2 — The Contrarian (non-obvious failure modes)

The BRD's greatest danger is that it is *deterministic and traceable* — which means it will compute wrong answers with total confidence and a beautiful audit trail. Here are the failure modes the author under-weighted.

**1. The enhanced-family-pension window is conflated and will miscalculate (correctness bug, not a gap).** FR-08's description and `enhanced_to` note ("7 yrs / age-67 rule") apply *one* window to *both* paths. Statutorily these differ: death **in service** → enhanced rate for **10 years** with **no** age cap (post-2013 CCS amendment); death **after retirement** → enhanced for **7 years or up to age 67/the date the deceased would have superannuated, whichever earlier**. The model has a single `enhanced_to` with a single rule. Result: every death-in-service family pension steps down too early — systematic underpayment to bereaved families, the single most litigated and politically toxic error class.

**2. Proportionate pension for short service is an obsolete formula.** FR-05 AC1 and `pension_fraction` ("proportionate below the threshold") encode the pre-2006 model. Under current CCS Pension Rules, ≥10 years qualifying = a flat 50% of emoluments (no proportionate reduction); <10 years = **no pension at all, only a one-time service gratuity**. The BRD has no `SERVICE_GRATUITY` type (gratuity_type is only RETIREMENT/DEATH). So an employee with 8 years' service is either wrongly given a proportionate pension or falls through a hole. This is a missed benefit *type*, not just a parameter.

**3. NPS is treated as a hollow DC scheme — but government NPS is not.** FR-05 says M11 "does not compute a defined-benefit pension" for NPS and emits only indicative annuity/lump-sum. This ignores (a) **CCS (Implementation of NPS) Rules 2021**, under which a government NPS employee's family on death-in-service or on invalidation is entitled to a *default* benefit equivalent to OPS family/invalid pension; and (b) the **Unified Pension Scheme (UPS), effective 01-Apr-2025**, giving opted-in NPS employees an assured payout (≈50% of last-12-month average pay). A 2026 government BRD that has no UPS and no NPS-death-default benefit will misroute and under-serve a growing cohort. `pension_scheme` ENUM (OPS, NPS) literally cannot represent UPS.

**4. Pensioner-death fraud has no proactive control.** LC suspension (IR10) is *passive* — it catches a missing certificate a year late, by which time 6–12 months of pension may have been drawn into a deceased pensioner's account by family. There is no death-registry / Aadhaar-DBT reconciliation, no dormancy/anomaly detection, no structured **overpayment-recovery-from-estate** entity. The "death reported late" edge case in FR-12 has no home in the data model.

**5. Commuted-value reduction timing is unstated.** Pension is reduced from the **date of receipt of commuted value**, and restoration is 15 years from *that* date — not the retirement date. `restoration_due_date` is computed from "commutation date," but commutation date vs reduction date vs retirement date are not disambiguated. Migrated pensioners with unknown commutation dates will restore on the wrong day.

**The risk the author missed entirely:** **family-pension eligibility is determined by a rule-defined *family*, not by *nomination*.** The BRD routes FAMILY_PENSION through `nominees_beneficiaries` (benefit_scope = FAMILY_PENSION). A nominee for gratuity/GPF is a freely chosen person; the family-pension recipient is the statutorily-ranked spouse/child/parent — you cannot nominate your pension away. Conflating these will produce illegal family-pension payments to nominated non-family persons and miss eligible family members who were never "nominated." This needs a separate `family_members` register (Form 3/Form 14).

### Advisor 3 — The First Principles Thinker

Strip this module to its load-bearing assumption and everything rests on one beam: **the input service history is complete and correct.** The BRD even says it (Exec Summary: benefits are "derived from verified service history in M12 … leave balances from M03 … evaluated against versioned rule tables"). The entire value proposition — determinism, reproducibility, no-break, audit-defence — is *conditional* on that beam holding.

It will not hold, and the BRD treats the failure as an edge case rather than the central problem.

Consider what "garbage in, deterministic garbage out" means here. The qualifying-service engine (FR-04) deducts non-qualifying spells pulled from M03/M04/M09. But the correctness of a deduction depends on data that legacy systems frequently never captured at the needed granularity: whether an EOL spell was on *medical* grounds (qualifying) or otherwise (non-qualifying) — BR1 flags this dependency but the leave source may simply not carry the reason code; whether a suspension period was later regularised as duty; whether a pre-digitisation break was condoned by an order that exists only on paper. A *deterministic* engine fed an EOL spell with a missing reason code will silently treat it under the default policy and produce a confidently wrong qualifying-service total — which then propagates into pension *and* gratuity *and* family pension. The determinism is not a safeguard; it is an *amplifier* of upstream data defects.

So the framing is subtly wrong. The BRD frames M11 as a **computation** problem ("make the rules explicit and the math reproducible"). The harder, prior problem is a **data-provenance and reconciliation** problem ("prove the service record is complete and every spell is correctly classified *before* you compute"). World-class pension processing (and the DoPPW *Bhavishya* model it should benchmark against) front-loads an **e-SR completeness and discrepancy-resolution stage** with explicit attestations, not a single `sr_verified` boolean. The BRD has `sr_verified` as a binary gate and `verification_notes` as free text — far too thin for the thing the whole module depends on.

Second hidden assumption: that **M11 is the paymaster that computes the exact monthly amount**. In Indian practice, many pensioners are paid via bank **CPPCs** that themselves compute and apply Dearness Relief on the basic in the PPO. If that is the operating model, FR-13's "DA revision across the pensioner population" is redundant or actively conflicting work. The BRD never states whether M11 *authorises a basic pension and lets the PDA apply relief*, or *computes the full monthly figure and instructs it*. That single unspecified assumption changes FR-13, FR-14, and the NFR batch sizing materially. (See Chairman second pass.)

### Advisor 4 — The Outsider

I am not a pension officer, and reading this told me the authors are — which is both the strength and the problem. The density of unexplained statutory jargon is extreme: *dies-non*, *reckonable half-years*, *commutation factor by age-next-birthday*, *enhanced family pension window*, *weightage*, *no-dues*, *anticipatory vs provisional*, *DCRG*, *PDA/CPPC*. The Glossary helps, but a citizen — the actual end-user of FR-15's self-service portal and FR-12's LC submission — will not read a glossary. A widow navigating the "compassionate fast-track" death-in-service flow at the worst moment of her life is the true acceptance test, and nothing in the BRD is written from her seat.

Concrete worries an outsider sees immediately:

- **The estimator (FR-15) speaks in the system's language, not the user's.** "Commuted value," "residual pension," "reckonable half-years" on a slider. A best-in-class estimator says *"If you take ₹22.4 lakh now, your monthly pension drops from ₹56,000 to ₹33,600, and it returns to ₹56,000 in October 2041."* The data exists; the framing doesn't.

- **No one has told me what the pensioner actually *has to do*, and when.** The pensioner-facing surface is a set of API verbs (submit LC, report death, raise grievance). Where is the plain-language *annual calendar* — "your life certificate is due in November; here are four ways to submit it; here is what happens if you miss it"? IR10 silently suspends the pension; from the outside that looks like the government stopped paying with no warning. The notification table helps, but suspension is a financial shock to an 80-year-old.

- **"Family pension conversion on death" assumes the family knows to report the death and how.** The flow is built for the officer (`:report-death`), not the grieving relative. Who tells the bank? Who tells M11? What does the family do on day one? This is unowned.

- **Complexity smell:** the system has *anticipatory* pension, *provisional* implied, *revised*, *superseded*, *restored*, *converted*, *transferred*, *ceased* — and a citizen is expected to track their "case state machine" (FR-15 AC4). Mirroring the internal state machine to the citizen is engineer-think. They need three words: *In progress / Approved / Being paid.*

The module is statutorily impressive and humanly opaque. For a "world-class" bar, the human layer is below standard.

### Advisor 5 — The Executor

Can this be built, in what order, and what is the Monday-morning step? Mostly yes — the dependency graph (§14.2) and parallel-agent plan (§14.3) are credible and correctly sequenced (foundation → eligibility → benefit engines → family/settlement → PPO → lifecycle → ops → self-service → analytics). But several execution-blocking unknowns are buried as "assumptions," and the schedule will hit them hard.

**Blocking dependency #1 — the rule tables don't exist yet, and nothing computes without them.** Every benefit engine reads effective-dated master data: DA rates, commutation factors by age, family-pension rates, gratuity ceilings (with the DA-linked 25% auto-step), retirement ages by cadre, minimum/maximum pension, half-year rounding rules. The BRD treats these as "configurable, version-controlled" (Assumptions) but provides **no schema for the rule tables themselves** — they are referenced (`rule_version_ref`) but never modelled as entities. You cannot build FR-05/06/07 against a TEXT reference to a table that has no definition. **This is the critical path and it is invisible in the entity inventory.**

**Blocking dependency #2 — the PDA/treasury interface contract.** FR-14 says "agreed format … pluggable." There is no format, no field list, no acknowledgement schema, no error taxonomy from the bank/treasury side. Integration with an external paymaster is the single highest-risk, longest-lead item in any pension build (real-world: 4–9 months of bank coordination). It must start in week 1, in parallel, or it becomes the launch-blocker.

**Blocking dependency #3 — upstream readiness.** FR-04 depends on M03/M04 leave-spell data carrying reason codes and M12 service being gap-free. If M12/M03 are themselves being built (they are — same suite), M11's eligibility stream cannot integration-test until they land. The plan assumes these as stable reads; they are moving targets.

**Sequencing reality:** Streams C (benefit engines) and the rule-table foundation must precede *everything user-visible*. FR-15's estimator "reuses FR-05/06/07 in dry-run" — good reuse, but it means the estimator cannot ship before the engines are correct, so the much-demoed self-service portal is *late* in the schedule, not early. Manage that expectation now.

**The Monday step:** stand up the **effective-dated rule-table entities and load + sign-off the actual government rule values** (DA, factors, rates, ceilings, ages, min/max), and in parallel **open the PDA interface-contract workstream**. Until those two exist, the benefit engines are unbuildable and the disbursement path is undefined. Everything else can wait a week; these cannot.

---

## 2. Anonymous Peer Review

*Five reviewers (A–E), each blind to authorship, answer: (1) strongest contribution & why; (2) biggest blind spot, precisely; (3) what ALL FIVE missed.*

### Reviewer A
1. **Strongest:** The Contrarian. The enhanced-family-pension window conflation and the "proportionate pension is obsolete / no SERVICE_GRATUITY type" findings are *correctness* bugs with line-level evidence, not opinions — they will produce wrong rupee figures, which is the whole risk surface.
2. **Biggest blind spot:** The Contrarian lists fraud and UPS but doesn't connect them to the data model strongly enough — e.g., the UPS gap means the `pension_scheme` ENUM is structurally wrong, which is a one-line schema fix with huge downstream impact that deserved top billing.
3. **All five missed:** **Tax.** Nobody computed TDS / income-tax treatment on the terminal settlement — taxable vs exempt gratuity (₹20 lakh cap), commuted-pension exemption, leave-encashment exemption, TDS on arrears under 89(1) relief. FR-09 produces gross/net with *recoveries* but no *tax*. A real settlement is wrong without it.

### Reviewer B
1. **Strongest:** The First Principles Thinker. "Determinism amplifies upstream data defects" reframes the entire module: the BRD's headline virtue (reproducible math) is worthless if the `sr_verified` boolean rubber-stamps a defective service record. That is the deepest insight in the room.
2. **Biggest blind spot:** First Principles gestures at "an e-SR completeness stage" but doesn't specify it as a concrete artefact (discrepancy ledger, attestation set, condonation register), so the fix is directional, not implementable.
3. **All five missed:** **Concurrency/ordering of revisions on a single pensioner.** When a pay-commission re-fixation, a DA revision, an 80+ age increment, and a commuted-portion restoration all hit the same pensioner around the same effective date, the *order of application* changes the rupee result (DA must apply on the re-fixed basic; restoration changes the base). The BRD lists it as an edge case (FR-13) but defines no deterministic ordering rule — ironic for a determinism-obsessed module.

### Reviewer C
1. **Strongest:** The Executor. Naming the unmodelled **rule-table entities** as the invisible critical path is the most actionable finding — it converts a vague "configurable master data" assumption into "you literally cannot build the engines." The PDA-contract lead-time point is equally schedule-saving.
2. **Biggest blind spot:** The Executor accepts the build *order* but doesn't challenge whether the 17-FR scope should be *phased for launch* — e.g., grievance/analytics (FR-16/17) could be post-launch, letting the team de-risk the statutory core first. No MVP cut proposed.
3. **All five missed:** **Provisional pension for pending departmental/judicial proceedings at retirement is a distinct statutory state, not just "withhold gratuity."** Under CCS Rule 9, a retiree with pending proceedings gets *provisional pension* and **fully withheld** DCRG until the proceedings conclude, with possible recovery thereafter. The BRD has ANTICIPATORY (timing) but no PROVISIONAL (proceedings) PPO type/state — a missed first-class concept that M09 linkage demands.

### Reviewer D
1. **Strongest:** The Outsider. For a BRD that claims "world-class … self-service, mobile," the observation that the entire pensioner/citizen surface is written in officer-jargon and mirrors the internal state machine is a legitimate below-best-in-class verdict that the four statutory-focused reviewers would otherwise have waved through.
2. **Biggest blind spot:** The Outsider underrates that *some* opacity is statutory and unavoidable (a PPO is a legal instrument). The critique would land harder if it distinguished "jargon we can hide behind plain language" from "legal terms that must remain."
3. **All five missed:** **Bank-account verification before first credit (penny-drop / account-name match).** FR-14 validates "account validity" abstractly, but the catastrophic, common real-world error is paying a correct amount into a *wrong or mistyped account*. No pre-credit verification (penny-drop, IFSC/name match, or NPCI mapper check) is specified — a best-in-class control that prevents the most expensive operational failure.

### Reviewer E
1. **Strongest:** The Proponent — but as a *baseline*, not a defence. Its value is establishing that the spine (determinism + immutability + SoD + no-break + lifecycle) is genuinely sound, so the council's job is surgical correction, not redesign. That calibration prevents over-reaction to the Contrarian's list.
2. **Biggest blind spot:** The Proponent praises G2 ("byte-identical re-run") without noticing it is a hostage to fortune: "beneficial-of-both" emoluments, floating DA timing, and external NPS/UPS figures make literal byte-identity unachievable; the goal should be "identical *given the snapshotted rule version and inputs*," which the body already implies but the goal overclaims.
3. **All five missed:** **Dual family pension and the two-eligible-children/twins cases.** Where both spouses are government servants, the survivor can draw **two** family pensions subject to a cap; twins/multiple eligible children can draw simultaneously per rule. The BRD asserts "only one beneficiary draws at a time" (FR-08 BR2) — which is *wrong* as an absolute and will under-pay legitimate dual/twin claimants.

---

## 3. Chairman Synthesis

### 3.1 Points of Agreement
- **The spine is sound and genuinely near best-in-class:** determinism + `calc_trace` + `rule_version_ref`, immutability-by-supersession, SoD enforced at IR/guard level, anticipatory-pension no-break engineering, all six separation types, full pensioner lifecycle with DLC + fallback. No advisor wants a redesign.
- **The risk is precision, not architecture:** several *statutory specifics* are wrong or missing and will yield confidently-wrong numbers with a clean audit trail — the worst failure class for pension.
- **Two foundations are unmodelled and on the critical path:** the **effective-dated rule-table entities** and the **PDA/treasury interface contract**. Both must start week 1.
- **The whole module rests on service-record/leave-data quality;** `sr_verified` (boolean) + `verification_notes` (free text) is too thin for the thing everything depends on.
- **The citizen/human layer is below the "world-class" bar** the BRD sets for itself.

### 3.2 Clashes
- **Proponent vs Contrarian/First Principles on "deterministic = trustworthy."** Resolved: determinism is necessary but *amplifies* upstream defects; it is a defence only when paired with a rigorous input-provenance stage. Both are right at different layers.
- **Outsider vs Reviewer D on jargon.** Resolved: separate immutable legal terms (PPO, commutation) from hideable jargon; add a plain-language presentation layer over an unchanged statutory core.
- **FUNDAMENTAL CLASH (second pass below): Is M11 the paymaster or the authoriser?** First Principles and Executor surface that FR-13 (compute DA across population) and FR-14 (instruct exact amounts) silently assume M11 computes the full monthly figure — but the Indian CPPC model has banks apply Dearness Relief on the basic in the PPO. This is not a detail; it reshapes FR-13, FR-14, and NFR batch sizing.

### 3.3 Blind Spots the Whole Council Initially Shared (now surfaced)
- **Tax/TDS** on terminal benefits (Reviewer A).
- **Revision ordering/concurrency** on a single pensioner (Reviewer B).
- **Provisional pension (Rule 9, pending proceedings)** as a first-class state (Reviewer C).
- **Pre-credit bank-account verification (penny-drop)** (Reviewer D).
- **Dual family pension / twins** simultaneous payment (Reviewer E).

### 3.4 Idea Evolution
**v1 belief:** "A deterministic, traceable, rule-versioned benefit engine across all separation types and a full pensioner lifecycle is world-class."
**Evolved belief:** "Determinism is the *floor*, not the achievement. World-class pension requires (a) a rigorous service-record/input-provenance gate *before* computation, (b) statutorily *correct* rule specifics — enhanced-window split, service gratuity, UPS/NPS-death defaults, dual family pension, provisional pension, tax — not just a generic engine, (c) an explicit paymaster-vs-authoriser model, (d) modelled rule-table entities and a concrete PDA contract as the foundation, (e) proactive death/fraud and pre-credit verification controls, and (f) a plain-language human layer over the statutory core."

### 3.5 Risk Register

| # | Risk | Severity | Source Advisor / Reviewer | Mitigation |
|---|------|----------|---------------------------|------------|
| R1 | Enhanced family pension window conflated (death-in-service = 10 yrs no age cap vs after-retirement = 7 yrs/age-67) → systematic underpayment to bereaved families | **Critical** | Contrarian | Split into two rule-driven windows keyed on separation path; add `enhanced_basis` + separate window params; test both paths |
| R2 | Obsolete proportionate-pension formula; no SERVICE_GRATUITY for <10 yrs qualifying | **Critical** | Contrarian / Rev A | Set flat 50% for ≥10 yrs; add `SERVICE_GRATUITY` gratuity_type and the <10-yr branch; deprecate proportionate fraction |
| R3 | `pension_scheme` ENUM cannot represent **UPS**; NPS-death/invalidation default benefit (CCS-NPS Rules 2021) absent → misrouting of a growing cohort | **Critical** | Contrarian / Rev A | Add `UPS` to scheme ENUM; add NPS-death/invalidation default-benefit branch (OPS-equivalent family/invalid pension); add UPS assured-payout calc + opt-in flag |
| R4 | Family pension routed through *nominees* not the rule-defined *family* → illegal payments / missed eligible family | **Critical** | Contrarian | Add separate `family_members` register (Form 3/14); drive family-pension eligibility from it, not `nominees_beneficiaries` |
| R5 | Service record/leave-quality dependency under-controlled (`sr_verified` boolean only) → deterministic-but-wrong qualifying service propagates to 3 benefits | **Critical** | First Principles / Rev B | Add an e-SR completeness/discrepancy-resolution stage: discrepancy ledger, per-spell reason-code attestation, condonation register, multi-point sign-off before CALCULATION |
| R6 | Paymaster-vs-authoriser model unspecified → FR-13/FR-14 may duplicate or conflict with bank CPPC relief computation | **Critical** | First Principles / Executor | Decide and document the disbursement model explicitly (see second pass); branch FR-13/14 accordingly |
| R7 | Rule-table entities unmodelled (referenced only via `rule_version_ref` TEXT) → benefit engines unbuildable | **Critical** | Executor / Rev C | Model effective-dated rule-table entities (DA, commutation factors, FP rates, gratuity ceiling w/ DA-step, retirement ages, min/max, rounding); load + sign off values |
| R8 | PDA/treasury interface "pluggable" but undefined → longest-lead integration becomes launch-blocker | **High** | Executor | Open PDA interface-contract workstream week 1: field list, ack schema, error taxonomy, sandbox, penny-drop |
| R9 | No proactive pensioner-death/fraud control; no overpayment-recovery-from-estate entity | **High** | Contrarian | Add death-registry/Aadhaar-DBT reconciliation job, anomaly/dormancy detection, `pension_overpayment_recoveries` entity, "pension drawn after death" exception report |
| R10 | Provisional pension (Rule 9, pending proceedings) not a first-class state; gratuity-withhold logic too thin | **High** | Rev C | Add `PROVISIONAL` ppo_type/state; fully-withhold DCRG until proceedings conclude; M09-linkage guard |
| R11 | Commuted-value reduction/restoration timing ambiguous (commutation vs reduction vs retirement date) | **High** | Contrarian | Define `commutation_payment_date`/`reduction_effective_date`; compute restoration = reduction date + 15 yrs; handle unknown migrated dates |
| R12 | No tax/TDS on terminal settlement (gratuity ₹20L cap, commutation exemption, leave-encashment exemption, 89(1) arrears relief) | **High** | Rev A | Add tax-computation step to FR-09; capture taxable/exempt splits and TDS lines |
| R13 | No deterministic ordering of concurrent revisions/restoration/age-increment on one pensioner | **High** | Rev B | Define mandatory application order (pay-commission re-fix → restoration → DA → age increment); make it part of the determinism contract |
| R14 | Dual family pension and twins/multiple eligible children blocked by absolute "one beneficiary at a time" | **Medium** | Rev E | Replace BR2 absolute with rule: allow dual family pension (with cap) and simultaneous twin/eligible-children shares per rule |
| R15 | No pre-credit bank-account verification (penny-drop / name-IFSC match) | **Medium** | Rev D | Add account-verification control before first disbursement; block on mismatch |
| R16 | Citizen/self-service surface in officer-jargon; mirrors internal state machine | **Medium** | Outsider / Rev D | Plain-language layer: 3-state citizen tracker, outcome-framed estimator, LC calendar, bereavement guide; keep legal terms only where statutory |
| R17 | G2 "byte-identical re-run" overclaims given beneficial-of-both/external NPS figures | **Low** | Rev E | Reword to "identical given snapshotted rule version + inputs"; exclude external/indicative NPS figures from the determinism guarantee |
| R18 | No structured prior-service / military-service addition (only VRS `weightage_years`) | **Medium** | First Principles (edge) | Add structured counted-prior-service input (ex-servicemen, prior temp/central/state service with pro-forma) distinct from VRS weightage |

### 3.6 Recommendation
**Conditional GO for Gate A, with a mandatory statutory-correctness amendment pass before any benefit-engine build.** The architecture, data spine, SoD, immutability, lifecycle, and traceability are sound and should not be reopened. But seven Critical findings (R1–R7) are either wrong rupee math or unbuildable foundations — they must be fixed in BRD v2 *before* FR-04/05/07/08 are implemented, because they change formulas, ENUMs, and entity definitions. Treat R1–R4 (correctness), R5 (input provenance), R7 (rule tables) as v2 blockers; R6 (paymaster model) as a decision to be recorded this week; R8 (PDA contract) as a parallel workstream starting now.

### 3.7 The One Thing To Do First
**Model and populate the effective-dated rule-table entities, and in the same artefact resolve the paymaster-vs-authoriser decision (R6/R7).** Nothing computes without the rule tables, and the paymaster decision determines whether FR-13/FR-14 even exist in their current form. These two together unblock every benefit engine and the entire disbursement path; they are the genuine critical path that §14.2 hides.

### 3.8 Focused Second Pass — The Fundamental Clash: Paymaster vs Authoriser

The unresolved structural question: **does M11 compute and instruct each pensioner's exact monthly amount (paymaster), or authorise a basic-pension PPO and let an external PDA/bank-CPPC apply Dearness Relief and pay (authoriser)?**

- **If paymaster:** FR-13 (DA revision across 100k pensioners in 30 min) and FR-14 (exact-amount instructions, monthly batch <10 min) are correct as written, and M11 owns the full liability and arrears computation. This maximises control and audit-determinism but requires M11 to mirror every relief change the moment it is notified and to reconcile against bank credits at line level.
- **If authoriser (CPPC model):** the PPO carries the *basic* pension and the relief formula; the bank applies DA and computes monthly. Then FR-13's population-wide DA recompute is largely **redundant or conflicting** — M11 would instead *notify* a relief order and reconcile, not recompute every line. NFR batch sizing changes drastically (you transmit orders, not 100k computed lines).

**Chairman ruling:** The BRD must state the model explicitly per PDA type, and it is almost certainly **hybrid**: M11 is the *authoriser of record and arrears/terminal-payment paymaster*, while *monthly relief* may be applied by the PDA where the PDA is a CPPC bank, or by M11 where the PDA is a treasury that pays exactly what it is told. Action: add a `pda_disbursement_model` attribute (M11_COMPUTES_FULL vs PDA_APPLIES_RELIEF) to the PDA/`pda_id` reference, and branch FR-13 (recompute-and-instruct vs notify-relief-order-and-reconcile) and FR-14 on it. Without this, FR-13/FR-14 are built against an assumption no stakeholder has confirmed, and the first live DA cycle after launch is where it will fail.

---

## Adopted Improvements for BRD v2

1. **Split the enhanced family-pension window by path.** Death-in-service → enhanced rate for **10 years, no age cap**; death-after-retirement → enhanced for **7 years or up to age 67 / would-be superannuation, whichever earlier**. Add `enhanced_basis` (IN_SERVICE / AFTER_RETIREMENT) and separate window parameters to `family_pension_records`; add tests for both step-downs. (R1)

2. **Replace the obsolete proportionate-pension model and add Service Gratuity.** For ≥10 years qualifying = flat 50% of emoluments; for <10 years = no pension, only a one-time **service gratuity**. Add `SERVICE_GRATUITY` to the `gratuity_type` ENUM and the <10-year branch in FR-05/FR-07; rewrite FR-05 AC1. (R2)

3. **Add UPS and government-NPS death/invalidation defaults.** Extend `pension_scheme` ENUM to **{OPS, NPS, UPS}**; add a UPS assured-payout calculation (≈50% of last-12-month average pay) with an opt-in flag; add the CCS-NPS Rules 2021 default-benefit branch giving NPS employees' families OPS-equivalent family/invalid pension on death-in-service/invalidation. Rewrite FR-05 AC4 and Appendix 16.5. (R3)

4. **Separate the family-members register from nominees.** Add a `family_members` entity (Form 3/Form 14 family details) and drive family-pension eligibility/hierarchy from it; restrict `nominees_beneficiaries` to gratuity/GPF/leave-encashment. Update IR8, FR-08, and the relationship map. (R4)

5. **Add an e-SR completeness & discrepancy-resolution stage before CALCULATION.** Introduce a `service_verification` artefact with a discrepancy ledger, per-non-qualifying-spell reason-code attestation, a condonation register (orders, not free text), and multi-point sign-off; gate CALCULATION on it instead of a lone `sr_verified` boolean. (R5)

6. **Record the paymaster-vs-authoriser model explicitly.** Add `pda_disbursement_model` (M11_COMPUTES_FULL / PDA_APPLIES_RELIEF) to the PDA reference; branch FR-13 (recompute-and-instruct vs notify-relief-order-and-reconcile) and FR-14 accordingly; update NFR batch sizing assumptions. (R6, second pass)

7. **Model the effective-dated rule-table entities.** Add first-class entities for DA/Dearness-Relief rates, commutation factors by age, family-pension rates, gratuity ceiling (with the DA-linked 25% auto-step), retirement ages by cadre, minimum/maximum pension, and rounding rules — each effective-dated and versioned — so `rule_version_ref` points to real rows. Load and sign off the actual government values. (R7)

8. **Define the PDA/treasury interface contract.** Specify the disbursement file/API field list, acknowledgement schema, bank/treasury-side error taxonomy, retry/re-route semantics, and a sandbox tie-out; open this as a week-1 parallel workstream. (R8)

9. **Add proactive death-detection and overpayment recovery.** Add a death-registry/Aadhaar-DBT reconciliation job, payment-anomaly/dormancy detection, a `pension_overpayment_recoveries` entity, and a "pension drawn after death" exception report; define recovery-from-estate/legal-heir workflow. (R9)

10. **Add Provisional Pension (Rule 9) as a first-class concept.** Add `PROVISIONAL` to `ppo_type` and a provisional-pension state for retirees with pending departmental/judicial proceedings; fully withhold DCRG until conclusion with post-decision recovery; wire the M09 linkage guard. (R10)

11. **Disambiguate commutation/restoration timing.** Add `commutation_payment_date` / `reduction_effective_date`; compute `restoration_due_date` = reduction date + statutory period (15 yrs); define handling for migrated pensioners with unknown dates. (R11)

12. **Add tax/TDS to terminal settlement (FR-09).** Capture taxable/exempt splits for gratuity (₹20L cap), commuted-pension exemption, and leave-encashment exemption; compute TDS lines and Section 89(1) relief on arrears; surface net-of-tax payout. (R12)

13. **Define a deterministic revision-application order.** Mandate: pay-commission re-fixation → commuted-portion restoration → DA/Dearness-Relief → age-based additional pension; make ordering part of the determinism contract and a tested invariant when multiple events share an effective date. (R13)

14. **Allow dual family pension and simultaneous twin/eligible-children shares.** Replace FR-08 BR2's absolute "one beneficiary at a time" with rules permitting dual family pension (with the prescribed cap) and concurrent shares for twins/multiple eligible children per rule. (R14)

15. **Add pre-credit bank-account verification.** Mandate penny-drop / name-IFSC (NPCI mapper) verification before the first disbursement to any account; block on mismatch via a new validation in FR-14. (R15)

16. **Add a plain-language citizen layer.** Replace the internal state machine on FR-15 with a 3-state citizen tracker (In progress / Approved / Being paid); make the estimator outcome-framed ("take ₹X now, pension drops to ₹Y, restores in MMM-YYYY"); add an LC annual calendar and a step-by-step bereavement/death-reporting guide for families. (R16)

17. **Reword the determinism goal (G2).** Change "byte-identical re-run" to "identical results given the snapshotted rule version and verified inputs," and explicitly exclude external/indicative NPS/UPS-annuity figures from the determinism guarantee. (R17)

18. **Add structured counted prior service.** Add a structured input for counted prior/military service (ex-servicemen, prior temporary/central/state service with pro-forma rules), distinct from VRS `weightage_years`, feeding qualifying service in FR-04. (R18)

19. **Add an Audit-Objection tracking entity (world-class control).** Model AG/internal-audit objections against pension cases with response/closure workflow and linkage to the case and `calc_trace`; surface in the Audit & Compliance Register (§12). Turns the stated "audit objection traceability" goal into a built capability.

20. **Add digital-delivery integrations for the e-PPO (best-in-class).** Push the signed e-PPO and revision orders to **DigiLocker** and link PPO ↔ Aadhaar/PRAN; benchmark the pre-retirement workflow against the DoPPW *Bhavishya* model in the migration/launch plan.

21. **Auto-revise the gratuity ceiling on DA milestones.** Encode the rule that the gratuity statutory ceiling steps up 25% whenever DA crosses each 50% threshold; tie FR-07 to the rule-table entity so the ceiling self-revises rather than relying on manual master-data edits. (supports R7)
