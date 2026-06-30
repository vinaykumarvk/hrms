# Adversarial Council Review — M12 Digital Employee Service Register (Digital SR) BRD v1.0

**Artefact under review:** `/Users/n15318/hrms/docs/brd/v1/M12-digital-service-register.md`
**Shared context:** `/Users/n15318/hrms/docs/brd/SHARED_FOUNDATION.md`
**Framed question:** Is this statutory system-of-record (append-only hash-chained ledger, governed event ingestion, corrigendum/annotation, attestation & periodic verification, certified extracts, legacy digitisation) complete, correct, and world-class for a leading global organisation's HRMS with public-sector statutory needs? What is missing, wrong, risky, over-engineered, or below best-in-class — and what concrete changes make it bulletproof?
**Method:** Five independent advisors → anonymous peer review (A–E) → chairman synthesis → adopted improvements for v2.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This BRD is the strongest module in the program and is genuinely close to best-in-class. Three design decisions deserve protection. First, the **separation of the business ledger (`service_register_events`) from the operational `audit_log`** is exactly right: most teams conflate the two and then cannot answer "what did the record legally say" separately from "who touched the system." Second, **correction-by-supersession with a forward-pointing corrigendum chain** is the correct resolution of the immutability-versus-accuracy dilemma — it mirrors how government corrigenda actually work on paper (a new notification superseding an old one) and never destroys evidence. Third, the **idempotent, provenance-stamped ingestion contract** with `(source_module, source_reference_id, source_event_version)` dedup and a frozen `request_payload` in `sr_ingestion_requests` gives true exactly-once semantics and a defensible provenance story per entry.

Beyond those, the BRD anticipates features that lesser specs forget: **per-row `hash_algorithm` and `ledger_version`** for crypto-agility; **point-in-time reconstruction** in the forensics view (FR-16) using `recorded_at`/`sequence_no`; a **pre-retirement verification gate** that blocks M11 pension finalisation until the record is confirmed — that single gate prevents the most expensive class of pension dispute; and **fail-closed access logging** (a read fails if it cannot be logged), which is the correct posture for a custody system. The 17-category taxonomy with effective-dated JSON-Schema payloads makes ingestion deterministic and changeable without redeployment — a Workday-grade configuration discipline.

The platform harmonisation (P01 workflow, P02 authorization with PII ceiling, P05 dual audit, P06 ETL+V migration, X.1 jobs) is consistent and not hand-waved. My recommendation: keep the architecture intact, resist the temptation to rip out the hash chain, and spend v2 effort hardening the three things the chain cannot do by itself — proving completeness, surviving an insider with database control, and standing up in court decades later. The bones are world-class; the connective tissue to legal admissibility and long-term cryptographic survival is what remains.

### Advisor 2 — The Contrarian

The headline claim — "make these failures structurally impossible" — is **false for the most important failure**, and the author missed it. A per-employee hash chain proves that *present* entries have not been altered or reordered. It proves **nothing about completeness.** If M06 never emits a promotion, or a clerk simply never records a 1994 LWP spell, the chain is perfectly valid and the entry is silently absent — surfacing as a pension shortfall exactly as today. The success metric "Service events recorded vs. events occurred: 100%" has **no enforcing mechanism** behind it. This is the single largest gap: the system can prove tamper-evidence but cannot prove the record is whole. There is no gap register, no expected-event reconciliation (e.g., an annual increment expected each year unless explicitly withheld), no source-of-truth count reconciliation.

Second non-obvious failure: the **mutable, un-hashed status pointers.** `entry_status`, `attestation_status`, and `superseded_by_event_id` are deliberately excluded from the hash so status transitions don't break the chain (§5.6, Appendix A). But that means an insider can flip an ACTIVE entry to SUPERSEDED, un-supersede a corrigendum, or downgrade EMPLOYEE_VERIFIED to UNATTESTED, and **integrity verification still passes.** The supersession graph and attestation state — the very things that determine which version of a fact is legally operative — are not tamper-evident.

Third: **the anchor is optional.** A DBA or anyone with write access to PostgreSQL can rewrite an entire employee chain from genesis, recompute every `entry_hash`, and pass internal verification. Hash-chaining only defends against partial/uncoordinated edits; against a privileged insider who controls the store it is theatre unless an **external, independent anchor** binds chain heads at a cadence. Optional anchoring = optional integrity against the one adversary who matters.

Fourth: **legal admissibility and non-repudiation are asserted, not engineered.** "Server-signed fallback" is not a valid electronic signature under the IT Act 2000 §3A; `OTP_CONFIRMED` employee verification is weak non-repudiation; there is no §65B / Bharatiya Sakshya Adhiniyam certificate of authenticity, no RFC 3161 trusted timestamping (NTP is not trusted time — an insider sets `recorded_at`), and no long-term validation (LTV/PAdES, RFC 4998 ERS) so a signed extract becomes unverifiable once the custodian's certificate expires in a few years — let alone the "decades after the officer retired" the BRD promises. Finally: the **custodian is a single point of trust** — attests, resolves disputes, issues extracts, and promotes legacy, with only a dispute-then-uphold dead end and no grievance escalation. A statutory record cannot rest on one un-appealed role.

### Advisor 3 — The First Principles Thinker

Strip away the vocabulary and ask: what property is actually required? **Tamper-evidence, ordering proof, non-repudiation, completeness, and decades-long verifiability of a government record.** Now ask which of those the hash chain delivers. It delivers cheap local integrity verification and ordering proof, and it pinpoints divergence. It does **not** deliver completeness, non-repudiation, or insider-resistance — those come from completely different mechanisms. So the chain is *necessary-cheap* but radically *insufficient*, and the BRD's "blockchain-style" framing hides that.

The hidden assumption is the classic one: **that the party able to write the ledger is distinct from the party able to recompute its hashes.** In a single-tenant government database, that assumption is false — whoever can `INSERT` can usually `UPDATE` and recompute. A hash chain is only as trustworthy as the write-once-ness of the substrate and the externality of the verification root. Therefore the first-principles architecture is not "hash chain OR WORM+signed audit" — it is a **layering**: (1) WORM/object-lock or DB-level append-only enforcement as the substrate guarantee; (2) the per-employee hash chain for cheap ordering and pinpoint verification; (3) a **mandatory** external anchor — a periodic Merkle root over all chain heads, RFC 3161 timestamped and written to independent WORM/a notary — for insider-resistance; (4) qualified e-signatures with LTV for non-repudiation and admissibility. The BRD has (2), asserts (1) and (4) loosely, and makes (3) optional. Invert the emphasis: the chain is the *convenience* layer; the anchor and WORM are the *trust* layer.

Is the chain over-engineered relative to WORM + signed periodic digest? No — it is cheap and it adds genuine value (ordering, pinpoint divergence). But it is **mis-sold**: it is presented as the source of tamper-evidence when it is merely the source of cheap tamper-*detection within a trusted substrate.* Separately, two things *are* over-built for the actual consumer set: **three subscription delivery modes** (WEBHOOK + PULL_FEED + MESSAGE_BUS) for ~3 internal consumers, and the full HMAC/cursor/DLQ pub-sub apparatus where a single authenticated pull-feed plus the certified extract would satisfy M11/M06/M14. Spend that complexity budget on completeness and admissibility instead.

### Advisor 4 — The Outsider

I am the Accountant General's auditor, an 8th-grade-educated clerk in a district office, and a retiring teacher in a village — the three people this system actually serves — and I do not speak your language. "Corrigendum," "supersession," "genesis sentinel," "Merkle root," "canonical serialization," "HMAC," "advisory lock," "WORM," "PAdES-LTV" — none of this means anything to the custodian who must operate it or the employee who must trust it. The BRD designs a beautiful machine and assumes mature operators; the public-sector reality is the opposite.

Concrete worries. **The pre-retirement verification wizard asks an employee to confirm or dispute up to 312 entries one by one** (sample `vc…03`). A 58-year-old verifying a 40-year career through a per-row mobile wizard will rubber-stamp it — defeating the purpose — or never finish it, blocking their own pension. Where is bulk-confirm-with-exceptions? Where is the **assisted-verification path** for employees with no smartphone, no literacy, or who are deceased (a DEATH_IN_SERVICE case has no employee to verify — who confirms, the nominee/legal heir? Unaddressed)? **The "zero reconciliation tolerance on dated/statutory facts"** assumption (FR-14, §13.1) collides with the physical reality of legacy books: faded ink, missing pages, contradictory entries. Zero tolerance means the program stalls; you need a "best-evidence, confidence-flagged, employee-corroborated" lane, not a binary gate.

The **QR "public verification"** assumes a citizen scans a code and a government server says "VALID." But the verifier (the government) is also the party who could tamper — calling the suspect's own server to ask "are you honest?" is not independent assurance, and offline verification against a published CA chain is what a bank or court actually needs. **The whole ingestion story assumes every source module reliably emits idempotent events with deterministic keys** — optimistic for a fleet of government modules of varying maturity; what happens when M09 posts a punishment, then the order is quashed by a tribunal, and M09 has no "cancel" event? Finally, the jargon leaks into error codes and notifications (`SR_ENTRY_DISPUTED`, `MSG-M12-PRERETIRE-VERIFY`) — fine for engineers, but the user-facing copy, the operator training, and the grievance route in plain language are the difference between a system that is trusted and one that is feared.

### Advisor 5 — The Executor

Feasibility is good but the **sequencing is wrong in two places, and two upstream dependencies can sink the timeline.** First dependency risk: the BRD *assumes* "a government PKI/HSM is available" and silently degrades to server-signing if not — but in most state-government rollouts the PKI/CA onboarding is the *long pole* (months of empanelment), and server-signing is not legally a signature. You cannot discover this in month 8. **Monday's first step is not coding — it is a 1-page crypto/admissibility decision memo**: confirm the licensed CA, HSM, and an RFC 3161 timestamp authority; if unavailable, escalate, because the ledger's hashing/canonicalisation and the signature/LTV envelope must be designed *together* before FR-03 is built. Retrofitting LTV and anchoring onto a live ledger is a rewrite.

Second sequencing error: FR-01 (taxonomy) is correctly first, but **the completeness/gap model and the legacy data-quality lane must be designed before FR-14 digitisation starts**, not after. The BRD schedules digitisation in migration step 3 with "zero tolerance," which will halt at the first illegible page; teams will then invent ad-hoc workarounds that corrupt provenance. Define the confidence/gap status first.

Realistic build order inside the existing dependency graph: (1) crypto + key-custody + anchor + LTV spec and CA/TSA procurement in parallel with FR-01 taxonomy seed; (2) FR-02/FR-03 ingestion + append with the *final* canonicalisation and a mandatory anchor hook from day one; (3) FR-04 integrity + the new status-tamper check; (4) FR-09 timeline + FR-12 access log as the first user-visible slice (demoable, builds trust early); (5) FR-05/06/07/08 correction/attestation/verification; (6) FR-10/11 extracts with offline-verifiable signatures; (7) FR-14 digitisation once the gap model exists; (8) FR-13 subscriptions last, scoped to one pull-feed initially. Throughput note: bulk legacy promote appends hundreds of entries per employee under a per-employee advisory lock — fine functionally, but plan the digitisation cohort batches and the integrity-sweep window against tens of millions of rows; get a load-test number before committing the nightly-sweep SLA. Dependencies to put on the risk board now: CA/HSM/TSA availability, source-module idempotency maturity, M01 golden-source readiness (Wave 1), and storage object-lock/WORM availability at CGG Data Centre.

---

## 2. Anonymous Peer Review (A–E)

> Advisors anonymised and shuffled. Each reviewer answers: (1) strongest contribution and why; (2) biggest blind spot, precisely; (3) what ALL FIVE missed.

**Reviewer A**
1. *Strongest:* The completeness/silent-missing-entry critique. It punctures the BRD's headline claim with a single, verifiable observation (the metric has no enforcing mechanism) and reframes the whole module's value proposition. This is the highest-leverage finding in the council.
2. *Biggest blind spot:* The same advisor under-weights how hard expected-event reconciliation is in practice — "an increment expected each year unless withheld" requires modelling service rules per cadre/pay-commission, which is a substantial sub-system, not a checkbox. The critique is right but cheap on the cost of the fix.
3. *All five missed:* **Re-employment, deputation-return, and inter-department transfer of the chain.** §FR-15 edge case says re-employment "un-archives and continues appending (same chain)" — but if an employee moves to a different tenant/department, who owns the chain, and does the `sequence_no`/genesis continue or fork? Cross-tenant career mobility versus per-`(tenant_id, employee_id)` chaining is unresolved.

**Reviewer B**
1. *Strongest:* The layered first-principles architecture (substrate WORM → cheap hash chain → mandatory external anchor → qualified signatures with LTV). It correctly diagnoses that the chain is the convenience layer, not the trust layer, and gives a concrete ordering. This is the cleanest mental model produced.
2. *Biggest blind spot:* It dismisses the three subscription modes as over-engineering without checking whether M14 analytics genuinely needs a message bus for volume — the "simplify to one pull-feed" recommendation may be right for launch but could be a false economy if real-time dashboards are a committed requirement. Needs a usage check, not an assertion.
3. *All five missed:* **Backup/restore as a silent integrity-rewinder.** A restore from a backup taken *before* a legitimate corrigendum yields an internally-consistent chain that passes verification but is *stale* — the corrigendum vanishes and nothing flags it except an external anchor. This strengthens the mandatory-anchor case and belongs in DR (§13/NFR) explicitly, yet no advisor stated it.

**Reviewer C**
1. *Strongest:* The operator/citizen reality check — the 312-entry verification wizard, the illiterate/deceased employee, the non-independent self-hosted QR. These are the findings that decide whether the system is *adopted* versus *circumvented*, which no amount of cryptography fixes.
2. *Biggest blind spot:* Slightly conflates UX friction with design defect — bulk-confirm-with-exceptions is a real gap, but "employees will rubber-stamp" is true of any attestation system; the deeper fix (risk-ranked surfacing of *changed/sensitive* entries for focused review) isn't named.
3. *All five missed:* **DPDP Act correction/erasure rights versus permanent immutable retention.** The BRD claims DPDP alignment and permanent no-purge retention in the same breath without stating the statutory-obligation legal basis that exempts the ledger from erasure, or how a data-principal correction request maps to the corrigendum flow. This is a live legal contradiction.

**Reviewer D**
1. *Strongest:* The mutable-unhashed-status-pointer finding. It is subtle, specific, code-level, and devastating: the fields that decide which fact is legally operative are exactly the ones excluded from tamper-evidence. A pure-integrity reader would never catch this.
2. *Biggest blind spot:* The fix is left vague ("hash the status changes too"), and naively hashing mutable status back into `entry_hash` would re-break the chain on every transition — the advisor flags the disease but the prescribed cure would reintroduce the original problem the exclusion was designed to solve.
3. *All five missed:* **Cross-source semantic duplication.** Idempotency is per `(source_module, source_reference_id)`. If M01 records a POSTING and M05 also records the same posting, that is two valid ledger entries for one real-world fact, with no semantic reconciliation — a completeness *and* an over-counting risk (qualifying service double-counted). Dedup is syntactic only.

**Reviewer E**
1. *Strongest:* The procurement/sequencing realism — CA/HSM/TSA as the long pole, and "Monday is a decision memo, not code." This is the finding most likely to save the actual schedule, because it surfaces a months-long dependency that is invisible in the FR list.
2. *Biggest blind spot:* It treats server-signing purely as a schedule risk; it under-states that shipping *any* server-signed statutory extract creates a corpus of legally weak documents that must later be re-signed/re-issued — a remediation liability, not just a deferral.
3. *All five missed:* **Mass/bulk corrigenda.** A pay-commission revision or a cadre-wide seniority re-fixation generates thousands of corrections at once. The corrigendum flow is strictly one-entry, one maker-checker, custodian-approved. There is no bulk-correction workflow with sampling-based approval, so a routine government event would take months of manual clicks.

---

## 3. Chairman Synthesis

### 3.1 Points of agreement (high-confidence)
- The **architecture is sound and worth preserving**; this is the best-specified module in the program (all advisors).
- **Completeness is unproven and overstated** — the chain secures presence-integrity, not absence. The "100% complete / structurally impossible" claims must be retracted and replaced with an actual mechanism (A, B, D + Contrarian).
- **External anchoring must be mandatory, not optional** — it is the only defence against the privileged-insider and stale-restore threats (B, E, First Principles, Contrarian).
- **Legal admissibility is asserted, not engineered** — needs qualified signatures, trusted timestamping, LTV, and a §65B/BSA certificate; server-signing is not an acceptable statutory fallback (Contrarian, Executor, Reviewer E).
- **The custodian is an over-concentrated single point of trust** and needs separation-of-duties plus a grievance/appeal escalation (Contrarian, Outsider).

### 3.2 Genuine clashes
- **C1 (FUNDAMENTAL): Keep vs. de-emphasise the hash chain.** First Principles says the chain is cheap-and-keep but must be subordinated to WORM+anchor; the Proponent wants it protected as the centrepiece; the Contrarian calls the current framing "theatre." *(Resolved in second pass below.)*
- **C2: Subscriptions — three modes vs. one.** First Principles/Reviewer B call WEBHOOK+PULL_FEED+MESSAGE_BUS over-engineering; resolution depends on whether M14 has a committed real-time requirement. *Verdict: ship one pull-feed for M11/M06; defer the bus behind a documented requirement.*
- **C3: Zero reconciliation tolerance vs. legacy reality.** Migration policy demands zero tolerance; Outsider/Executor say it stalls the program. *Verdict: zero tolerance for **promoted-as-attested** facts, but add a confidence-flagged, employee-corroborated lane plus an explicit gap status so digitisation proceeds without fabricating certainty.*

### 3.3 Collective blind spots (what all five under-saw, surfaced in peer review)
1. Cross-tenant / inter-department **chain ownership and continuity** (Reviewer A).
2. **Backup/restore as a silent integrity-rewinder** that only an anchor detects (Reviewer B).
3. **DPDP correction/erasure rights vs. permanent immutable retention** legal contradiction (Reviewer C).
4. **Cross-source semantic duplication** (syntactic-only idempotency) (Reviewer D).
5. **Mass/bulk corrigenda** for pay-commission/cadre-wide events (Reviewer E).

### 3.4 Idea evolution
The proposal evolves from *"a cryptographically tamper-evident ledger"* to *"a defensible statutory system-of-record with four explicit guarantees — integrity, completeness, non-repudiation, and longevity — each backed by a named mechanism."* Integrity gains a mandatory anchor and a status-tamper check; completeness gains a gap register and expected-event reconciliation; non-repudiation gains qualified signatures, trusted timestamps, and offline verification; longevity gains LTV/evidence-record renewal and crypto-agility that actually re-anchors. Around it, an operability shell — bulk verification, assisted/heir verification, grievance escalation, bulk corrigenda — makes it usable by real public-sector operators.

### 3.5 Risk Register

| # | Risk | Severity | Source advisor | Mitigation |
|---|---|---|---|---|
| R1 | Silent missing entries — chain proves integrity not completeness; "100% complete" claim has no mechanism | **Critical** | Contrarian / Rev A | New FR: gap register + expected-event reconciliation (e.g., annual increment, confirmation due, periodic verification) per cadre/service rules; flag absences as first-class entries |
| R2 | Privileged insider / DBA rewrites a whole chain from genesis; internal verify still passes | **Critical** | Contrarian / First Principles | Make external anchoring **mandatory**: periodic Merkle root over all chain heads, RFC 3161 timestamped, written to independent WORM/notary; verify against anchor in FR-04 |
| R3 | Mutable, un-hashed status pointers (`entry_status`, `attestation_status`, `superseded_by`) are tamper-invisible | **Critical** | Reviewer D | Move status to an append-only, hash-chained **status-event sub-ledger** derived into the pointer; FR-04 verifies the status chain too (do *not* fold mutable status into `entry_hash`) |
| R4 | Legal admissibility/non-repudiation asserted not engineered; server-signing not a valid IT-Act signature | **High** | Contrarian / Executor | Mandatory qualified e-sign (licensed CA) + RFC 3161 TSA; §65B/BSA certificate-of-authenticity generator; ban server-signed statutory extracts (provisional-internal only, clearly marked) |
| R5 | Long-term verifiability fails — certs expire, SHA-256 ages; signed extracts unverifiable in years/decades | **High** | Contrarian / First Principles | PAdES-LTV / RFC 4998 evidence-record renewal job; re-anchor + re-timestamp on crypto migration; archival timestamp refresh schedule |
| R6 | Custodian over-concentration; dispute dead-ends at "uphold" with no appeal | **High** | Contrarian / Outsider | Separation of duties (dual-custodian for routine corrigenda/extracts where feasible); defined grievance/appeal escalation to a higher authority/tribunal; disputed-status visible on extracts |
| R7 | Pre-retirement verification UX (300+ entries, illiterate/deceased employees) blocks pensions or gets rubber-stamped | **High** | Outsider / Rev C | Bulk-confirm-with-exceptions surfacing changed/sensitive entries; assisted-verification path; nominee/legal-heir verification for DEATH cases |
| R8 | "Zero reconciliation tolerance" stalls legacy digitisation against illegible/contradictory books | **High** | Outsider / Executor | Confidence-flagged legacy lane (`RECONSTRUCTED`/`LEGACY_UNVERIFIABLE` status) + employee corroboration; zero tolerance only for promoted-as-attested facts |
| R9 | CA/HSM/TSA procurement is the schedule long pole; discovered too late forces ledger rewrite | **High** | Executor | Day-1 crypto/admissibility decision memo; design hashing + signature + LTV envelope together before FR-03; procure CA/HSM/TSA in parallel with FR-01 |
| R10 | Cross-source semantic duplication — two modules post the same real-world fact; qualifying service double-counted | **High** | Reviewer D | Semantic dedup keys / event-correlation rules; conflict-detection in reconciliation; per-fact (not per-source) uniqueness for qualifying-service-bearing events |
| R11 | DPDP correction/erasure rights vs. permanent immutable retention — unstated legal contradiction | **Medium** | Reviewer C | State statutory-obligation legal basis exempting the ledger from erasure; map data-principal correction requests to the corrigendum flow explicitly |
| R12 | Backup/restore silently rewinds away legitimate corrigenda; internal verify passes | **Medium** | Reviewer B | DR procedure compares restored chain heads against the external anchor; restore-time integrity-and-anchor reconciliation gate (already partly in §13.2 DR gate — extend to anchor) |
| R13 | Source order cancelled/quashed after SR posting; no source-driven reversal/cancel event path | **Medium** | Outsider | Define cancellation/reversal ingestion event referencing original `source_reference_id`, auto-spawning corrigendum workflow |
| R14 | Mass/bulk corrigenda (pay-commission, cadre re-fixation) infeasible one-by-one | **Medium** | Reviewer E | Bulk-correction workflow with batch maker-checker and sampling-based approval; full per-entry audit retained |
| R15 | Self-hosted QR verification is not independent assurance | **Medium** | Outsider / First Principles | Offline-verifiable signed extracts (verify against published CA chain without calling issuer); anchor reference embedded for third-party verification |
| R16 | Cross-tenant/inter-department career mobility vs. per-`(tenant,employee)` chain | **Medium** | Reviewer A | Define chain hand-off/continuation rules on transfer; document whether sequence forks or continues; preserve prior chain head as genesis link |
| R17 | Subscription stack (3 modes, HMAC/DLQ/cursor) over-built for ~3 internal consumers | **Low** | First Principles / Rev B | Launch one authenticated pull-feed; defer webhook/message-bus behind a documented real-time requirement |

### 3.6 Recommendation

**Conditional GO, with a v2 hardening pass before build of FR-03.** The architecture is approved and should not be re-litigated. The BRD must, however, (a) retract the overstated completeness/immutability claims and back them with real mechanisms, (b) promote external anchoring, qualified signatures, trusted timestamping, and LTV from optional/asserted to mandatory-engineered, (c) close the status-tamper and semantic-duplication holes, and (d) add the operability shell (bulk/assisted/heir verification, grievance escalation, bulk corrigenda, confidence-flagged legacy). Resolve the CA/HSM/TSA dependency before FR-03 is built, because the hashing, signing, and LTV envelopes must be designed as one unit. None of this is a redesign; it is the difference between a system that is *cryptographically clever* and one that is *legally bulletproof*.

### 3.7 The One Thing To Do First

**Write the one-page Crypto & Admissibility Decision Memo and confirm the CA / HSM / RFC 3161 TSA / WORM availability — before any ledger code.** Everything downstream (canonicalisation, the mandatory anchor hook, qualified-signature envelope, LTV renewal, the §65B certificate) is determined by these choices, and all of them are prohibitively expensive to retrofit onto a populated statutory ledger. If the answer is "no PKI at launch," that is an escalation, not a silent degradation to server-signing.

### 3.8 Focused second pass — the fundamental clash (C1: the hash chain)

The Proponent, Contrarian, and First Principles Thinker disagree on the chain's status. Reconciliation: **all three are compatible once the trust boundary is stated.** Within a *trusted, append-only substrate* (WORM/object-lock or DB-enforced append-only with the write principal segregated from any recompute-capable principal), the per-employee hash chain is a cheap, valuable layer that gives ordering proof and pinpoint divergence — keep it (Proponent wins on retention). But the chain must be **re-labelled and re-scoped**: it is *tamper-detection within a trusted substrate*, not standalone *tamper-evidence* (Contrarian wins on framing). And its trustworthiness must be *rooted externally* via a mandatory anchor, making the anchor — not the chain — the actual source of insider-resistance (First Principles wins on architecture). **Resolution:** retain the chain; delete the "blockchain-style / structurally impossible" language; add the mandatory external anchor and the WORM/append-only substrate as named, required trust layers; and verify the status sub-ledger alongside the content chain. No advisor's core position is discarded; the clash dissolves once "tamper-evidence" is decomposed into substrate + chain + anchor + signatures.

---

## Adopted Improvements for BRD v2

1. **Add FR-17 "Completeness assurance & gap register."** Model expected events per cadre/service rules (annual increment unless withheld, confirmation due, periodic verification due, increment-cycle continuity) and reconcile against recorded events; record detected absences as first-class `GAP_FLAGGED` entries with employee-corroboration workflow. Retract the "missing entries structurally impossible / 100% complete" claims and replace the success metric with a measurable gap-closure rate.

2. **Make external anchoring mandatory (amend §4 / FR-04 / NFR).** Periodic Merkle root over all per-employee chain heads, RFC 3161 trusted-timestamped and written to an independent WORM/notary store; FR-04 verification compares chain heads to the latest anchor, and head-vs-anchor mismatch is a non-suppressible FAIL.

3. **Add a hash-chained status sub-ledger (amend FR-03/FR-04/§5.4).** Record `entry_status`, `attestation_status`, and supersession-link transitions as append-only, hash-chained `sr_status_events` rows; derive the (now read-only) pointers on `service_register_events` from it. FR-04 verifies the status chain alongside the content chain. Do **not** fold mutable status into `entry_hash`.

4. **Engineer non-repudiation & admissibility (amend §4 / FR-07 / FR-08 / FR-10).** Mandatory qualified e-signatures via a licensed CA for custodian attestation, employee verification, and extract signing; RFC 3161 trusted timestamps on every ledger commit (`recorded_at` becomes a trusted-time attestation, not NTP). Ban server-signed *statutory* outputs — permit only for clearly-marked internal/provisional artefacts.

5. **Add a §65B / Bharatiya Sakshya Adhiniyam certificate-of-authenticity generator (new FR / extend FR-10).** Every certified extract is accompanied by a machine-generated electronic-record authenticity certificate suitable for court production, citing hash, anchor reference, signer, and chain-of-custody.

6. **Add long-term validation (LTV) and evidence-record renewal (new FR / amend §16.1, NFR-Retention).** PAdES-LTV envelopes and an RFC 4998 evidence-record renewal job that re-timestamps and re-anchors before certificate/algorithm expiry, so signed extracts remain verifiable for decades; define the crypto-migration procedure that re-anchors a chain to a new algorithm without rewriting history.

7. **Define offline / independent verification (amend FR-11).** Certified extracts must be verifiable offline against a published CA chain and an embedded anchor reference, not solely by calling the issuer's own QR endpoint; the QR becomes a convenience, not the sole root of trust.

8. **Add separation-of-duties and a grievance/appeal escalation (amend §3 / FR-06 / FR-08).** Dual-custodian (or custodian + independent reviewer) for routine corrigenda and FULL_SR extract issuance; a defined appeal path beyond custodian "uphold" to a higher authority/tribunal; contested/disputed status must be visible on certified extracts (no clean extract over a live dispute).

9. **Add bulk/assisted/heir verification (amend FR-08).** Bulk-confirm-with-exceptions that risk-surfaces changed/sensitive entries for focused review; an assisted-verification path for low-literacy/no-device employees; a nominee/legal-heir verification path for DEATH_IN_SERVICE and post-mortem pension cases.

10. **Add a confidence-flagged legacy lane (amend FR-14 / §5.5 enums).** New record/entry statuses `RECONSTRUCTED` and `LEGACY_UNVERIFIABLE` with mandatory provenance and employee corroboration; restrict "zero reconciliation tolerance" to facts promoted as fully attested, allowing digitisation to proceed without fabricating certainty.

11. **Add a source-driven reversal/cancellation event (amend FR-02/FR-05/taxonomy).** A cancellation ingestion event referencing the original `source_reference_id` (e.g., order quashed by tribunal) that auto-spawns the corrigendum/supersession workflow, instead of forcing manual re-entry.

12. **Add semantic (not just syntactic) deduplication (amend FR-02 / FR-14).** Event-correlation/semantic keys to detect the same real-world fact posted by two modules; conflict detection in reconciliation; per-fact uniqueness for qualifying-service-bearing events to prevent double-counting.

13. **Add a bulk-corrigendum workflow (new FR / amend FR-05).** Batch maker-checker with sampling-based approval for cadre-wide/pay-commission corrections, retaining full per-entry audit and supersession.

14. **Resolve DPDP vs. permanent retention (amend §4 / NFR-Privacy / §15).** State the statutory-obligation legal basis exempting the ledger from erasure; map data-principal correction requests onto the corrigendum flow; document the lawful-basis and minimisation posture for sensitive categories (disciplinary, health-linked leave).

15. **Define cross-tenant / inter-department chain continuity (amend §5 / FR-15).** Rules for chain hand-off on transfer between org units/tenants — whether `sequence_no` continues or forks, and how the prior chain head links as a genesis reference — so career mobility does not break per-`(tenant,employee)` chaining.

16. **Extend DR to anchor reconciliation (amend §13.2 / FR-04).** Restore procedures must compare restored chain heads against the external anchor to detect stale-restore (a backup predating a legitimate corrigendum); add it as an explicit launch/restore gate.

17. **Add purpose-driven extract redaction (amend FR-10).** Redaction policy by extract purpose (e.g., a loan-verification extract excludes disciplinary/punishment categories) layered on the existing scope selection, enforced by the P02 field-mask.

18. **Simplify subscriptions for launch (amend FR-13).** Ship a single authenticated pull-feed for M11/M06; defer WEBHOOK and MESSAGE_BUS modes (and the DLQ apparatus) behind a documented real-time requirement from M14 — reduce launch complexity, reinvest in completeness and admissibility.

19. **Sequence the crypto/admissibility decision and procurement first (amend §13.1).** Make the Crypto & Admissibility Decision Memo and CA/HSM/TSA/WORM confirmation an explicit, gated pre-FR-03 milestone; design canonicalisation + signature + LTV + anchor envelopes as one unit before ledger code is written.

20. **Plain-language operator/citizen layer (amend §7 / §11).** Plain-language user-facing copy and grievance route for all `ERR-M12-*` / `MSG-M12-*` strings; an operator playbook translating crypto/legal jargon (corrigendum, anchor, supersession) into role-appropriate guidance; and a load-tested SLA for the nightly integrity sweep against tens-of-millions of rows before committing the NFR.
