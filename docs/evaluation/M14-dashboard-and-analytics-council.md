# Adversarial Idea Evaluator — Council Report
## M14 Dashboard & Analytics BRD (v1.0) — Stress Test for World-Class Public-Sector HRMS

**Artefact under evaluation:** `/Users/n15318/hrms/docs/brd/v1/M14-dashboard-and-analytics.md`
**Shared context:** `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this Dashboard & Analytics BRD complete, correct, and world-class (role-based dashboards, workforce/operational/compliance analytics, self-service report builder, governed KPI definitions, analytics data-mart with RLS mirroring RBAC, predictive analytics) for a leading global organisation's HRMS with public-sector statutory needs — and what concrete changes make it bulletproof?
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → adopted improvements.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is, frankly, one of the strongest analytics BRDs I have reviewed against the Workday Prism / SuccessFactors People Analytics / Oracle OTBI bar. It does the three things most enterprise analytics programs get wrong, right, and up front. **First, governance of the metric layer.** The `kpi_definition` registry (E03) with versioning, a whitelisted aggregation DSL, maker-checker activation (DI rule 10, AC6 of FR-02), `dimensions_allowed`, sensitivity tiering, and the hard rule that every measure-bearing widget must bind to an ACTIVE KPI or saved report (DI rule 1) — this is exactly how you kill "the same KPI computed three ways." Most suites bolt governance on after the dashboards exist; here it is the spine.

**Second, security as a first-class data concern, not a UI afterthought.** RLS is non-bypassable (DI rule 3, FR-04 AC4 `RLS_SCOPE_UNRESOLVED`), the effective dataset is explicitly the *intersection* of capability grant and data scope (BR1/§3.2 note), embed tokens and NL query inherit the same RLS (FR-15 BR2), and there is a mandated automated scope-leak test matrix gating launch (FR-04 AC6, §13.4). That launch-gate is best-in-class — leakage is treated as a release blocker, not a bug.

**Third, freshness honesty.** FR-12 elevates `data_as_of` and staleness to a cross-cutting contract returned in every `dataFreshness` block, with fail-safe-to-not-fresh on health lookup failure and WCAG non-colour cues. Decision-makers are never silently fed stale numbers — a discipline even tier-1 suites fudge.

The public-sector layer is genuine, not cosmetic: reservation roster compliance, SR verification read-only from M12, sanctioned-vs-filled vacancy, retirement profiling, mandatory-training mandate tracking, and audit-grade exports with methodology footnotes. Predictive analytics is correctly fenced as **advisory** and never written back (DI rule 13). The traceability matrix, dependency graph, parallel-agent plan, and 0-gap reconciliation table make this buildable by a fleet. The architecture call — a governed mart layer rather than ad-hoc OLTP cross-joins — is the correct CQRS posture for 100k+ employees. This is a credible foundation; my fellow advisors will find edges, but the skeleton is sound.

### Advisor 2 — The Contrarian

The skeleton is sound; several load-bearing joints will fail under audit and adversary. Non-obvious failure modes:

**1. Aggregate differencing defeats RLS even with zero record leakage.** Small-cell suppression (k=5) is applied only to *drill-through and demographic breakdowns* (FR-10 AC6, §16.4). The KPI tiles themselves are not suppressed. In a 3-person sub-office, `HEADCOUNT_ACTIVE` + `ATTRITION_RATE` + a one-person delta between periods re-identifies the leaver and their reason. Differencing two overlapping scopes (this-month vs last-month, with-vs-without one unit) reconstructs individuals the RLS filter was meant to hide. The BRD has row-level security but **no complementary-suppression or minimum-aggregation-threshold rule on the metrics**. This is the risk the author missed.

**2. KPI definition drift is silently baked into trends.** `kpi_snapshot` (E04) stores `kpi_id` but **no `kpi_version`**. Re-version `ATTRITION_RATE` (change the denominator from headcount to FTE), and the trend line splices v1 and v2 snapshots under one `kpi_code` with no discontinuity marker. The "same number computed the same way" guarantee holds only forward, never across the historical series an executive actually stares at.

**3. Reconciliation tolerance 0 vs CDC lag is self-contradictory.** DI rule 11 / FR-03 AC5 flag the mart DEGRADED when a reconcilable count varies beyond tolerance (default 0). But marts are eventually consistent (30–60 min CDC). At almost any instant, mart headcount ≠ live source headcount. A literal 0 tolerance will paint half the estate DEGRADED permanently, training users to ignore the badge — destroying the freshness contract the BRD is so proud of.

**4. Predictive bias is unaddressed in a reservation-category context.** Attrition risk blends "leave patterns" and "promotion stagnation" (FR-13). In Indian public service, leave patterns proxy maternity, disability, and caste-correlated phenomena; promotion stagnation proxies reservation roster dynamics. The BRD mandates *explainability* but **no fairness/adverse-impact testing, no protected-attribute exclusion, and no prohibition on using a HIGH score against an individual**. "Advisory label" is not a control — a manager will act on it. This is a DPDP and constitutional-equality landmine.

**5. The access_log write-on-every-read is a performance and integrity bomb** (see Executor). And **RLS policy edits have no maker-checker** — the single most dangerous mutation in the system (`filter_expression` → `TRUE`) is an unchecked Sys Admin update (§3.2). One typo silently opens the enterprise.

### Advisor 3 — The First-Principles Thinker

Strip it to physics. **Question 1: separate analytics layer vs query the operational DB?** Correct call, but for a reason the BRD under-states: it is not mainly about performance, it is about *temporal semantics*. An OLTP row answers "what is true now"; analytics must answer "what was true as known on date X" — for audit, restatement, and statutory defensibility. The mart is right, but the BRD then **violates its own temporal logic**: `kpi_snapshot` is append-only and immutable (DI rule 12), yet FR-02 edge cases say "retroactive mart backfill triggers snapshot recompute." A backdated leave approval or a payroll correction changes a *historical* period's truth. You cannot both freeze the snapshot and restate it. The missing primitive is **bitemporality**: every snapshot needs a *valid-time* (period it describes) and a *knowledge-time* (when we knew it), so a correction creates a new knowledge-version rather than mutating or contradicting history. Without this, an auditor pulling "the June report" in June and again in September gets two different numbers with no reconciling lineage — fatal in government.

**Question 2: build vs embedded BI?** The BRD silently assumes "build everything." It specifies a custom DSL parser, a semantic layer, a materialised-view manager, a query compiler, a bursting engine, a scheduler, an NL-to-query intent resolver, and signed embed tokens. That is **re-implementing Superset/Metabase/Power-BI-Embedded from scratch**. The genuinely differentiated, must-build assets are: the *governed KPI registry*, the *RLS-into-every-query rewriter*, and the *freshness contract*. The commodity machinery (charting, scheduling, export rendering, embed) is a buy/adopt decision the BRD never surfaces as a choice. That is a hidden assumption worth tens of person-months.

**Hidden assumption 3: "sanctioned strength" has an owner.** Vacancy = sanctioned − filled (FR-05 BR1) presupposes an **establishment / position-management master** (posts, sanctioned strength, roster points). None of M01–M13 owns posts — they own *people*. The BRD references "establishment reference data" as if it exists. It does not. Position management is the missing upstream system of record; without it, vacancy and reservation compliance — the headline public-sector metrics — have no authoritative denominator.

### Advisor 4 — The Outsider

I am a department head, not a data engineer, and I will judge whether I can *trust and use* this. Mostly yes — and that is the point of a dashboard — but the document leaks complexity onto people who shouldn't carry it.

**Jargon that will not survive contact with a Secretary:** "watermark," "CDC," "semantic layer," "materialised view," "k-anonymity," "complementary suppression," "DELTA_PCT operator," "idempotent incremental load." These belong in the Data Engineer console, fine. But "is_partial," "DEGRADED," and "NO_DATA" will appear on *my* screen. The freshness chip story (green/amber/red + tooltip) is good; the *vocabulary* in the tooltip ("reconciliation variance / partial load") is not language a leader parses under time pressure. I need "Numbers are a day behind — payroll system still updating," not "DEGRADED: reconciliation variance > tolerance."

**Trust assumption the BRD makes and I won't grant for free:** that I will read and believe a predictive score labelled "Advisory." Real behaviour: a HIGH attrition badge next to a named officer *becomes* a decision input the moment I see it, label or not. The document treats the disclaimer as the control. It isn't. I need the *individual* score gated behind a deliberate action with a friction prompt, not surfaced on a hover.

**Complexity that will generate IT tickets despite the "no-IT-tickets" promise (G5):** the report builder is genuinely three-pane no-code, good. But "aggregated reports over RESTRICTED marts are permitted; detail-level requires authority" (FR-08 BR3) is a distinction I will get wrong constantly, hit `FIELD_NOT_PERMITTED`, and call IT. The rule is correct; the *explanation to me* is missing.

**What I actually want and don't clearly see:** a one-line plain-language "what this KPI means and what counts/doesn't" on every tile (the `description` exists in the model but the UI spec doesn't promise it on the tile), and a "why is this number different from what Payroll told me" reconciliation explainer. The 16-widget palette (HEATMAP, FUNNEL, MAP, GAUGE) is more chart types than any leader needs — that breadth is for the builder, not for me. Simplify the *consumption* surface even if the *authoring* surface stays rich.

### Advisor 5 — The Executor

Feasibility and sequencing. This is not one module; it is a **multi-quarter program riding on the completion of thirteen others.** §14.2 puts M14 last, correctly, but the dependency is harder than the graph admits: M14 reads stable *schemas/contracts* from M01–M13, and those modules are themselves in flight. **You cannot build MART_PAYROLL_COST against M10 until M10's "locked snapshot" object is contractually frozen.** The BRD's own edge cases admit "source module schema change breaks ETL." There is no **data-contract / versioned source-view** mechanism pinning what each source promises. That is the #1 schedule risk — silent upstream schema drift will break marts in production weekly.

**The write-amplification trap.** §8.1: "every data-returning call writes `analytics_access_log`." A single executive dashboard render fans out to ~8 widget queries; at 500 concurrent users (NFR) that is thousands of synchronous audit INSERTs/second contending with the read workload that must hit P95 < 2.5s. Audit-on-read is correct for compliance but must be **async/batched to an append-only store**, not inline. The BRD mandates the behaviour without the architecture to survive it.

**Sequencing reality (the Monday step):** do **not** start with dashboards. Start with the two foundation streams the whole edifice rests on — Stream A (FR-03 marts + FR-04 RLS). Concretely, Monday: (1) stand up the analytics schema and **one** mart end-to-end — `MART_HEADCOUNT` from M01 — with incremental load, watermark, and reconciliation; (2) write the **RLS query-rewriter and the scope-leak test harness first**, against that one mart, with the SELF/REPORTING_LINE/ORG_SUBTREE/ENTERPRISE matrix; (3) agree the **source data-contract** with the M01 team. If RLS + one mart + reconciliation isn't bulletproof, nothing above it can be trusted. Defer FR-15 (NL query + embed) and FR-13 (predictive) entirely to a later phase — they are the highest-effort, highest-risk, lowest-foundational items and are wrongly bundled as if co-equal.

**Dependencies under-specified:** CDC technology unnamed; LLM provider/hosting for NL query unnamed (a DPDP question — are HR prompts leaving the data centre?); position-management source for sanctioned strength absent; target-history/effective-dating absent so target-vs-actual is wrong for past periods. Buildable, yes — but not in the implied single pass, and not without three named dependencies the BRD treats as ambient.

---

## 2. Anonymous Peer Review

*(Advisors anonymised A–E; A=Proponent, B=Contrarian, C=First-Principles, D=Outsider, E=Executor.)*

**Reviewer 1 on B (Contrarian):**
- *Strongest:* The aggregate-differencing / complementary-suppression gap is the single most important finding — it shows RLS can be airtight at row level and still leak individuals through metric arithmetic. Genuinely non-obvious and audit-fatal.
- *Biggest blind spot:* B asserts default tolerance 0 is self-contradictory but doesn't separate *reconcilable-at-rest* (end-of-day batch vs source) from *reconcilable-live*. Some counts *should* be 0-tolerance at a defined watermark; B over-generalises.
- *Precise fix B missed:* tolerance should be **watermark-relative** (reconcile mart-at-watermark to source-as-of-same-watermark), not wall-clock.

**Reviewer 2 on C (First-Principles):**
- *Strongest:* Bitemporality. Naming the append-only-vs-restatement contradiction (DI rule 12 vs FR-02 backfill recompute) is the deepest correctness issue in the document and nobody else caught it.
- *Biggest blind spot:* C's "buy embedded BI" pitch underweights that the killer requirement — RLS injected into *every* query plus field-masking plus freshness — is exactly what off-the-shelf embedded BI does *worst*. Adopting a tool may *increase* the leakage surface, not reduce it.
- *Precise fix C missed:* specify a *hybrid* — buy charting/scheduling/export rendering, build the governed query/RLS/semantic core; don't frame it as all-or-nothing.

**Reviewer 3 on E (Executor):**
- *Strongest:* Audit-on-read write amplification, with concrete fan-out math, and the "build RLS + scope-leak harness before dashboards" Monday step. Operationally the most actionable advisor.
- *Biggest blind spot:* E says defer predictive (FR-13) entirely, but **retirement forecasting is deterministic** (DOB + rules) and is a top public-sector ask with near-zero model risk — it should ship early; only *attrition/succession ML* should defer. E conflated them.
- *Precise fix E missed:* split FR-13 into deterministic (ship) and probabilistic (defer + fairness-gate).

**Reviewer 4 on A (Proponent):**
- *Strongest:* Correctly identifies that governance-first (KPI registry as the spine) is what separates this from typical dashboard projects, and that the launch-gate scope-leak test is best-in-class.
- *Biggest blind spot:* A praises freshness honesty but doesn't notice the freshness contract is **undermined by the tolerance-0 reconciliation** (B) and by **append-only-vs-restatement** (C) — i.e., A's three pillars partly conflict with each other in the details.
- *Precise fix A missed:* the pillars need a consistency pass, not just individual praise.

**Reviewer 5 on D (Outsider):**
- *Strongest:* "The disclaimer is not the control" for predictive scores — reframes FR-13's advisory labelling from a compliance checkbox into a UX/behavioural-governance requirement (friction-gate individual scores).
- *Biggest blind spot:* D wants the consumption surface simplified but ignores that auditors and analytics admins *need* the DEGRADED/partial vocabulary; the answer is **role-adaptive language**, not blanket simplification.
- *Precise fix D missed:* dual-register copy — plain-language for leaders, technical for operators — keyed off role.

### What ALL FIVE missed (genuine)

1. **DPDP data-principal rights propagation.** When an employee's PII is corrected or erased in M01 (a DPDP right / a service-record correction), the **marts, `kpi_snapshot` history, `prediction_result`, `report_execution` artefacts in M13, and `analytics_access_log` retain stale or now-unlawful PII**. The BRD's append-only and "retain last good" rules have *no erasure/correction-propagation path* and no reconciliation against statutory retention overrides. No advisor caught that the entire analytics estate is a second uncontrolled copy of personal data with no rectification pipeline.

2. **Embed-token-in-URL and iframe trust boundary.** `GET /api/v1/analytics/embed/{token}` (FR-15) puts a bearer credential in a path — it leaks via referer headers, proxy logs, and browser history; combined with iframe embedding there is no stated CSP/frame-ancestors, anti-clickjacking, or token-revocation list. Everyone treated "scoped/signed/expiring" as sufficient; none flagged the transport and revocation gap.

---

## 3. Chairman Synthesis

### Agreements (high consensus)
- The **governed-KPI-registry-as-spine** and **RLS-as-intersection** architecture is correct and world-class (A, all).
- **RLS is necessary but not sufficient**: row-level filtering does not stop metric-level re-identification (B, echoed by C, D).
- **Foundations first**: marts (FR-03) + RLS (FR-04) + scope-leak harness must precede everything; NL/embed/ML predictive must defer (E, C, D).
- **The "advisory" label is not a control** for predictive outputs (D, B, peer-endorsed).

### Clashes
- **C vs Reviewer-2/A on build-vs-buy.** C wants to adopt embedded BI to avoid re-building Superset; the counter is that off-the-shelf BI is *weakest* exactly where this system is *strongest* (per-query RLS + masking + freshness). **Resolution → hybrid (see focused pass).**
- **E vs Reviewer-3 on deferring predictive.** Deterministic retirement forecasting should ship early; only probabilistic attrition/succession defer behind a fairness gate. **Resolution → split FR-13.**
- **B vs Reviewer-1 on tolerance 0.** Not wrong, just imprecise: tolerance must be **watermark-relative**, and may legitimately be 0 *at* a watermark. **Resolution → redefine reconciliation against the watermark, not wall-clock.**

### Blind spots (council-level)
- DPDP rectification/erasure propagation into the analytics estate (missed by all).
- Embed token transport security + revocation (missed by all).
- The three "pillars" (governance, RLS, freshness) have internal contradictions in the detail (append-only vs restatement; tolerance-0 vs CDC lag) — they were each praised in isolation but never reconciled with one another.

### Idea evolution
The BRD moves from *"governed, secure, fresh dashboards"* to *"a governed, secure, fresh, **temporally-honest, fairness-audited, and rectifiable** analytics estate, built foundations-first on a hybrid stack, with metric-level (not just row-level) privacy."* The added adjectives are the gap between "very good draft" and "bulletproof for government audit."

### Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|---|---|---|---|
| R1 | Re-identification via aggregate differencing / small denominators despite airtight RLS | **Critical** | B | Add complementary suppression + minimum-cell threshold (k) to KPI tiles/exports, not just drill-through; suppress or band small-denominator rates |
| R2 | KPI definition drift splices versions in one trend line | High | B | Add `kpi_version` (+ `definition_hash`) to `kpi_snapshot`; surface version-change markers on trends; block cross-version aggregation without a notice |
| R3 | Append-only snapshot vs retroactive restatement contradiction (no bitemporality) | **Critical** | C | Add valid-time + knowledge-time to snapshots; corrections create new knowledge-versions; "as-of-knowledge" report parameter for audit reproducibility |
| R4 | Predictive bias / adverse impact in reservation context; "advisory" treated as control | **Critical** | B, D | Mandatory fairness/adverse-impact testing, protected-attribute exclusion list, prohibited-use clause, human-friction gate on individual scores, model card per model |
| R5 | Audit-on-read write amplification breaks P95 at 500 concurrent users | High | E | Async/batched append to access_log; partitioned/append-only store; sampling for low-sensitivity VIEW events, full logging for RESTRICTED |
| R6 | RLS policy & embed-token mutation has no maker-checker (most dangerous change is unchecked) | **Critical** | B | Maker-checker + SoD on `rls_scope_policy` and embed-token issuance; "preview-as-role" diff + approval before activation; immutable change audit |
| R7 | Reconciliation tolerance 0 vs CDC lag floods DEGRADED, destroying freshness trust | High | B | Reconcile mart-at-watermark to source-as-of-same-watermark; per-KPI tolerance + grace; alert only on sustained variance |
| R8 | Sanctioned strength / position-management master has no owner among M01–M13 | High | C | Name/establish a position-establishment source of record (or formally scope it in); pin vacancy & reservation denominators to it |
| R9 | DPDP rectification/erasure not propagated to marts/snapshots/predictions/exports | **Critical** | Council | Add data-subject-change propagation pipeline; reconcile append-only with statutory retention + erasure overrides; mark/redact affected derived rows |
| R10 | Embed token in URL path + iframe with no CSP/revocation | High | Council | Move token to header/short-lived exchange; frame-ancestors/CSP; token revocation list + rotation; per-render re-validation |
| R11 | Source schema drift breaks ETL in production (no data contract) | High | E | Versioned source views / data contracts with each module; contract tests in CI; breaking-change alerts |
| R12 | NL-query misinterpretation produces confidently-wrong governed numbers | Med-High | B, D | Confidence threshold + "not sure, please pick" gating; log interpretation for audit; never answer below confidence; name + locate LLM (DPDP) |
| R13 | Targets/thresholds not effective-dated → wrong historical target-vs-actual | Medium | E | Add target/threshold history (effective-dated); benchmark against the target in force for that period |
| R14 | Mobile offline cache stores RESTRICTED PII on device | Medium | D, E | Encrypted cache, exclude RESTRICTED from offline, remote-wipe/expiry, no PII at rest on device |
| R15 | Over-scope for v1 (custom NL + embed + ML predictive + 16-widget palette) | Medium | C, E | Phase: ship deterministic core first; defer NL/embed/ML predictive; hybrid buy for commodity BI machinery |
| R16 | Consumption-surface jargon erodes leader trust/usability | Low-Med | D | Role-adaptive (dual-register) freshness/KPI copy; plain-language KPI definition on every tile |

### Recommendation
**Conditional GO to Gate A with mandatory amendments.** The architecture is fundamentally sound and ahead of typical practice; the defects are precise and fixable, not structural. Do **not** approve as-is: R1, R3, R4, R6, and R9 are each independently audit-fatal for a government system and must be resolved into BRD v2 before LLD. Re-sequence per the Executor (foundations + scope-leak harness first; split predictive; defer NL/embed). Resolve the build-vs-buy question explicitly as a hybrid.

### The One Thing To Do First
**Build the RLS query-rewriter and the automated scope-leak test matrix against one real mart (`MART_HEADCOUNT`) before any dashboard — and in the same stroke add metric-level small-cell/complementary suppression so the leak harness tests *aggregate* re-identification, not just row leakage.** Everything else in M14 is only as trustworthy as this layer, and the council's most dangerous finding (R1) lives precisely where row-level security ends and metric arithmetic begins.

---

## 4. Focused Second Pass — The Build-vs-Buy Fundamental Clash

The one fundamental clash worth a second pass: **C says adopt embedded BI to avoid rebuilding Superset; Reviewer-2/A say off-the-shelf BI is weakest exactly where this system must be strongest.**

Both are right about different layers, and the BRD's failure is treating the stack as monolithic. Decompose by *differentiation × risk*:

- **Must build (differentiated, security-critical, no off-the-shelf equivalent meets the bar):** the governed KPI registry + DSL/versioning (E03/E04, FR-02); the **RLS query-rewriter and field-masking** (FR-04); the freshness/`dataFreshness` contract (FR-12); the cross-module drill-through authz (FR-10); the access/audit ledger semantics (E16). These *are* the product. No BI tool injects org-subtree RLS + per-field masking + per-mart freshness into every query the way this BRD requires; bolting RLS onto Superset/Power BI typically widens the leak surface.
- **Should buy/adopt (commodity, undifferentiated, high build cost):** chart rendering, the grid/layout engine, PDF/XLSX/CSV export rendering, the cron scheduler, and possibly the NL-to-query LLM orchestration — provided they consume the governed semantic model and the RLS-rewritten queries *as inputs* and never reach the marts directly.

**Resolution:** v2 should state an explicit **hybrid architecture decision record**: the governed query/RLS/semantic/freshness core is built and owns *all* data access; presentation, export, scheduling, and charting are adopted libraries that receive already-scoped, already-masked, already-freshness-stamped result sets and never hold a database credential. This collapses the Executor's tens-of-person-months concern *and* preserves the Proponent's security posture. It also makes the embed and NL surfaces thin renderers over the same governed core, shrinking R10/R12.

---

## Adopted Improvements for BRD v2

1. **Metric-level privacy (complementary suppression).** Extend small-cell/k-anonymity (currently FR-10/§16.4) to **KPI tiles, charts, and exports**: suppress or band any value whose denominator/group size < configurable k, and apply complementary suppression so a suppressed cell cannot be recovered by subtracting visible totals across overlapping scopes/periods. Add error `SMALL_CELL_SUPPRESSED` handling to aggregate reads. *(R1)*

2. **Bitemporal snapshots.** Add `valid_time` (period described) and `knowledge_time`/`recorded_as_of` to `kpi_snapshot` (E04); restatements create a new knowledge-version rather than mutating or appending an inconsistent row. Add an **"as-of-knowledge" parameter** to report/KPI reads so an auditor can reproduce exactly what June's report showed in June. Reconcile this with DI rule 12 (append-only) and the FR-02 backfill-recompute edge case. *(R3)*

3. **Stamp KPI version on every snapshot.** Add `kpi_version` (and a `definition_hash`) FK on `kpi_snapshot`; render a version-change marker on any trend that crosses a definition change; block silent cross-version aggregation (warn + require acknowledgement). *(R2)*

4. **Predictive fairness governance (new sub-FR under FR-13).** Mandate, before a probabilistic model is activated: a **protected/correlated-attribute exclusion list** (caste/reservation category, gender, disability, maternity-linked leave proxies), documented **adverse-impact / disparate-impact testing** with thresholds, a published **model card** (`prediction_model` gains `fairness_assessment`, `protected_features_excluded`, `intended_use`, `prohibited_use`), and a **prohibited-use clause** that individual scores must not be used as the sole or primary basis for any administrative action. *(R4)*

5. **Friction-gate individual predictive scores.** Individual `prediction_result` rows (attrition/succession) are not surfaced on hover/tile; opening a named individual's score requires a deliberate action with a purpose prompt, RESTRICTED authority, and an `analytics_access_log` entry. Aggregate/banded risk distributions remain freely viewable to authorised scope. *(R4, D)*

6. **Split FR-13 by determinism.** Separate **deterministic retirement forecasting** (DOB + canonical rules — ship in foundation phase, low risk) from **probabilistic attrition/succession** (defer behind the fairness gate of item 4). Reflect in §14.2 dependency graph. *(E, Reviewer-3)*

7. **Maker-checker + SoD on RLS policy and embed tokens.** `rls_scope_policy` create/update and embed-token issuance route through the workflow engine with maker ≠ checker, a **"preview-as-role" diff** showing the before/after data exposure, and an immutable change audit. Add to DI rule 10 (currently only KPI/dashboard publication). *(R6)*

8. **Async, partitioned audit-on-read.** Re-spec §8.1 so `analytics_access_log` writes are **asynchronous/batched** to an append-only partitioned store off the read path; full-fidelity logging for RESTRICTED/EXPORT/DRILLTHROUGH/NL_QUERY, configurable sampling for low-sensitivity VIEW_DASHBOARD events. Add NFR for sustained write throughput at 500 concurrent users. *(R5)*

9. **Watermark-relative reconciliation.** Redefine DI rule 11 / FR-03 AC5: reconcile **mart-at-watermark vs source-as-of-the-same-watermark** (not wall-clock), with per-KPI tolerance and a sustained-variance grace window before flagging DEGRADED. Prevents permanent false DEGRADED from CDC lag. *(R7)*

10. **Name the establishment / position-management source of record.** Vacancy (FR-05) and reservation compliance (FR-07) depend on sanctioned strength and roster points that no current module owns. Either add a position/establishment master as a named upstream source (with a mart) or formally scope it into M14 with explicit ownership; pin vacancy/reservation denominators to it. *(R8)*

11. **DPDP rectification/erasure propagation pipeline (new FR).** On employee PII correction/erasure in M01 (or a DPDP data-principal request), propagate to marts, redact/restate affected `kpi_snapshot`/`prediction_result`, mark/expire affected `report_execution` artefacts in M13, and reconcile against statutory-retention overrides (record the legal basis when retention beats erasure). *(R9)*

12. **Harden embed transport.** Move embed credentials out of the URL path (header or short-lived code-exchange), add `Content-Security-Policy: frame-ancestors` allow-listing, anti-clickjacking headers, a **token revocation list + rotation**, and per-render re-validation of scope. *(R10)*

13. **Source data contracts.** Add a versioned **source-view / data-contract** layer between each module (M01–M13) and its marts, with contract tests in CI and breaking-change alerts, so upstream schema drift fails loudly in CI, not silently in production ETL. Name the CDC technology. *(R11)*

14. **NL-query confidence gating & provenance.** NL query must enforce a confidence threshold — below it, clarify/refuse rather than answer; log the resolved interpretation for audit of misinterpretation; and **name the LLM provider and hosting location** with an explicit DPDP assessment (do HR prompts/data leave the CGG data centre?). NL never answers a RESTRICTED metric without the same authority as in-app. *(R12)*

15. **Effective-dated targets & thresholds.** Add target/threshold history so `kpi_definition.target_value` and `alert_rule.threshold` are effective-dated; target-vs-actual and RAG status use the value **in force for the period being shown**, not today's value. *(R13)*

16. **Mobile/offline RESTRICTED-data policy.** FR-16: encrypted on-device cache, **exclude RESTRICTED fields/PII from offline caching**, enforce cache expiry and remote-wipe, and state it as an NFR/security rule. *(R14)*

17. **Hybrid build-vs-buy architecture decision record (new §4 sub-section).** State explicitly: build the governed query/RLS/semantic/freshness/audit **core** (owns all data access; only it holds DB credentials); adopt commodity libraries for charting, layout, export rendering, scheduling, and NL orchestration, which consume already-scoped/masked/freshness-stamped result sets and never touch marts directly. *(R15, build-vs-buy pass)*

18. **Phase the scope.** Re-sequence §14.2/§14.3 into explicit phases: **Phase 1 foundation** (FR-03 marts, FR-04 RLS + scope-leak harness + metric suppression, FR-02 KPI engine, FR-12 freshness, FR-01 dashboards, deterministic retirement); **Phase 2** (FR-05/06/07 suites, FR-08 builder, FR-09 export, FR-10 drill, FR-11 alerts, FR-14 benchmark); **Phase 3 advanced** (probabilistic predictive with fairness gate, FR-15 NL/embed, FR-16 briefing). Trim the consumption widget palette (defer MAP/FUNNEL) without trimming the authoring catalog. *(R15)*

19. **Role-adaptive (dual-register) language.** Freshness states and KPI explanations render in **plain language for leaders/employees** ("Numbers are a day behind — payroll still updating") and **technical language for operators/auditors** (DEGRADED/partial/watermark), keyed off role. Promise the plain-language `kpi_definition.description` on every consumer tile. *(R16, D)*

20. **Access-anomaly detection (best-in-class).** Add proactive anomaly detection over `analytics_access_log` (e.g., out-of-hours bulk export, scope-edge probing, unusual drill-through volume) raising alerts to Auditor/Analytics Admin — turning the audit ledger from forensic-only into preventive. *(world-class addition; B, council)*

21. **Reconciliation explainer for users.** Add a user-facing "why does this differ from the source?" panel that shows `data_as_of`, the watermark, and any in-flight correction — addressing the "headcount disagrees with payroll" problem the BRD's own §1.2 names as the core pain. *(D)*

---

*Council complete. 16 risks registered; 21 adopted improvements for BRD v2.*
