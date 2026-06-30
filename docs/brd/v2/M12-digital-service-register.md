# Digital Employee Service Register (Digital SR) — HRMS Module BRD (v2.0)

**Module code:** M12-SR
**Program:** Enterprise HRMS — PeopleGov / HRMS Suite (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v2.0 (revised after adversarial council review of v1.0)
**Status:** Draft for review — v2 hardening pass
**Author persona:** Global HR/HCM domain expert (Workday / SAP SuccessFactors / Oracle HCM bar) honouring the public-sector statutory context
**Upstream contract:** `SHARED_FOUNDATION.md` (canonical entities, conventions, roles, technical defaults)
**Council inputs incorporated:** `/Users/n15318/hrms/docs/evaluation/M12-digital-service-register-council.md` — all 20 Adopted Improvements and Risk Register R1–R17.

> **Reading note (v2).** This BRD defines the **statutory system of record** for an employee's entire service lifecycle: the digital equivalent of the legally significant paper **Service Book**. The append-only ledger entity `service_register_events` is **OWNED BY THIS MODULE**; every other module writes to it through this module's governed ingestion contract and never mutates it directly. **What changed in v2:** the council established that a per-employee hash chain proves *presence-integrity and ordering* but **not completeness, not non-repudiation, and not insider-resistance**. v2 therefore re-frames the Digital SR around **four explicitly engineered guarantees — Integrity, Completeness, Non-repudiation, and Longevity — each backed by a named mechanism**: (1) a trusted **WORM / append-only substrate** plus the per-employee hash chain for cheap ordering and pinpoint divergence; (2) a **mandatory external anchor** (RFC 3161-timestamped Merkle root over chain heads, written to independent WORM) as the real root of insider-resistance; (3) a **hash-chained status sub-ledger** so the fields that decide which fact is legally operative are themselves tamper-evident; (4) a **completeness / gap register** that reconciles expected service events against recorded ones; (5) **qualified e-signatures, RFC 3161 trusted timestamps, PAdES-LTV / RFC 4998 evidence-record renewal, and a §65B / Bharatiya Sakshya Adhiniyam certificate** for admissibility and decades-long verifiability. The overstated v1 language ("blockchain-style", "structurally impossible", "100% complete") is **retracted** and replaced with these mechanisms.

---

## Section 1 — Executive Summary

### 1.1 Purpose

In a government HR context the **Service Register (Service Book)** is a legal instrument. Pension, gratuity, seniority, qualifying-service computation, increment dates, disciplinary record, and audit by statutory bodies (Accountant General / Audit) all depend on it being **complete, accurate, chronologically ordered, append-only, tamper-evident, and admissible in court decades later**. The traditional paper Service Book is fragile: pages are lost, entries are back-dated, corrections are made by overwriting, attestation signatures are forged, completeness is unprovable, and reconstruction after loss is impossible. The **Digital Employee Service Register (Digital SR)** replaces it with a defensible digital system-of-record that captures **every service life event** from appointment to retirement (and post-retirement archival), with provenance, completeness assurance, attestation, qualified signatures, long-term verifiability, and certified-extract generation.

### 1.2 Business problem

The paper service register suffers classic, audit-penalised failure modes: (a) **missing entries** — a promotion or LWP spell never recorded, surfacing as a pension shortfall decades later; (b) **silent tampering** — date-of-birth or date-of-joining altered to extend service; (c) **uncontrolled correction** — overwriting an entry with no trace of the original; (d) **unattested entries** — no proof the custodian or employee verified the record; (e) **no single source** — leave, pay, and disciplinary facts scattered across registers that disagree; (f) **irrecoverable loss** — fire/flood destroys the only copy; (g) **inadmissibility** — even a perfect record is worthless in a tribunal if its authenticity cannot be proven years after the signing officer's certificate expired. The Digital SR exists to make these failures **detectable, reconcilable, and legally defensible** — v2 explicitly separates the failures the hash chain *can* prevent (alteration, reordering) from those it cannot (absence, insider rewrite, non-repudiation, longevity), and engineers a distinct mechanism for each.

### 1.3 Solution overview

M12-SR delivers, across four engineered guarantees:

**Integrity (tamper-evidence within a trusted substrate)**
1. **Canonical SR event model & taxonomy** — a governed, versioned catalog (`sr_event_type`) covering every life event.
2. **Append-only ledger on a WORM / append-only substrate** — `service_register_events` is hash-chained per employee for cheap ordering proof and pinpoint divergence; the substrate (object-lock / DB-enforced append-only with the write principal segregated from any recompute-capable principal) is the *trust* layer, the chain is the *convenience* layer.
3. **Hash-chained status sub-ledger** (`sr_status_events`) — supersession, entry-status, and attestation-status transitions are themselves append-only and hash-chained, closing the v1 "mutable un-hashed status pointer" hole.
4. **Mandatory external anchor** (`sr_anchors`) — a periodic Merkle root over all per-employee chain heads, RFC 3161 trusted-timestamped and written to an independent WORM / notary; integrity verification compares heads to the anchor, defeating the privileged-insider and stale-restore threats.

**Completeness (presence assurance)**
5. **Completeness assurance & gap register** (`sr_expected_event_rule`, `sr_gap_register`) — models expected events per cadre/service rules (annual increment unless withheld, confirmation due, periodic-verification due, increment-cycle continuity) and reconciles them against recorded events, raising first-class `GAP_FLAGGED` findings with an employee-corroboration workflow.
6. **Governed, semantically-deduplicated ingestion contract** — idempotent, versioned, validated, provenance-stamped, with **semantic (per-fact) dedup keys** to prevent two modules double-recording one real-world fact (and double-counting qualifying service), plus a **source-driven reversal/cancellation** event for quashed orders.

**Non-repudiation (admissibility)**
7. **Qualified e-signatures + RFC 3161 trusted timestamps** on custodian attestation, employee verification, and extract signing; server-signing is **banned for statutory outputs** (permitted only for clearly-marked internal/provisional artefacts).
8. **§65B / Bharatiya Sakshya Adhiniyam certificate-of-authenticity generator** — every certified extract is accompanied by a machine-generated electronic-record authenticity certificate suitable for court production.
9. **Separation of duties + grievance/appeal escalation** — dual-custodian for routine corrigenda and FULL_SR extracts; a defined appeal path beyond custodian "uphold"; disputed status visible on extracts.

**Longevity (decades-long verifiability)**
10. **Long-term validation (LTV) & evidence-record renewal** (`sr_ltv_renewals`) — PAdES-LTV envelopes and an RFC 4998 evidence-record renewal job that re-timestamps and re-anchors before certificate/algorithm expiry; a crypto-migration procedure that re-anchors to a new algorithm without rewriting history.
11. **Offline / independent extract verification** — certified extracts verifiable against a published CA chain and an embedded anchor reference without calling the issuer's own endpoint; the QR becomes a convenience, not the sole root of trust.

**Operability shell (so real public-sector operators adopt rather than circumvent)**
12. **SR timeline & certified extract** with **purpose-driven redaction**; **bulk / assisted / nominee-heir verification**; **confidence-flagged legacy digitisation lane**; **bulk-corrigendum workflow**; **plain-language operator/citizen copy and grievance route**; custody/access control & access log; a **single authenticated pull-feed** for downstream modules (webhook/message-bus deferred); retention, archival, legal hold, cross-tenant chain continuity, and forensics.

### 1.4 Key outcomes & success metrics (v2 — claims corrected, mechanisms named)

| Outcome | Metric | Target | Backing mechanism (v2) |
|---|---|---|---|
| Record integrity | Hash-chain + status-chain verification pass rate | 100% (any break alarms) | FR-03/FR-04, `sr_status_events` |
| Insider / stale-restore resistance | Chain heads matching latest external anchor | 100% (mismatch = non-suppressible FAIL) | FR-04, `sr_anchors` (mandatory) |
| Completeness (presence) | **Gap-closure rate** = gaps resolved ÷ gaps detected | ≥ 98% within SLA (replaces the retracted "100% complete") | FR-17, `sr_gap_register` |
| Semantic non-duplication | Double-recorded real-world facts per 10,000 posts | 0 | FR-02 semantic dedup |
| Idempotent ingestion | Duplicate ledger entries per 10,000 posts | 0 | FR-02 |
| Attestation coverage | ACTIVE entries attested by custodian within SLA | ≥ 99% within 7 days | FR-07 |
| Periodic verification | Employees with completed current verification | ≥ 98% | FR-08 (bulk/assisted/heir) |
| Admissibility | Certified extracts with valid qualified signature + RFC 3161 timestamp + §65B certificate | 100% | FR-07/FR-10/FR-18 |
| Long-term verifiability | Signed extracts re-validated after cert/algorithm expiry via LTV renewal | 100% of in-scope corpus | FR-19, `sr_ltv_renewals` |
| Offline verifiability | Extracts verifiable against published CA chain without calling issuer | 100% | FR-11 |
| Correction discipline | Entries hard-deleted or overwritten | 0 (structurally forbidden) | §5.6 integrity rules |
| Legacy digitisation | Legacy books promoted with explicit confidence flag + provenance | 100% of in-scope cohort (no fabricated certainty) | FR-14 confidence lane |
| Auditability | SR views/prints recorded in access log | 100% | FR-12 (fail-closed) |

> **Retractions (v2).** The v1 claims "make these failures structurally impossible", "missing entries structurally impossible", "100% complete", and the "blockchain-style" framing are **withdrawn**. The chain delivers *tamper-detection within a trusted substrate*; insider-resistance comes from the **mandatory anchor**; completeness comes from the **gap register**; admissibility/longevity come from **qualified signatures + LTV + §65B certificate**.

### 1.5 Scope at a glance

**In scope:** SR event taxonomy; append-only hash-chained ledger on a WORM/append-only substrate; **hash-chained status sub-ledger**; **mandatory external anchoring**; ingestion contract/API (idempotent, versioned, **semantically deduplicated**, with **source-driven reversal**); ledger + status + anchor integrity verification & forensics; correction/annotation by supersession; **bulk corrigendum**; custodian attestation with qualified signatures + trusted timestamps; **separation of duties + grievance/appeal**; periodic + **bulk/assisted/nominee-heir** employee verification; **completeness assurance & gap register**; SR timeline view; certified true copy with qualified signing, **purpose-driven redaction**, **§65B certificate**, and **LTV/evidence-record renewal**; **offline-verifiable** QR; custody/access control & access log; **single authenticated pull-feed** subscriptions; bulk legacy digitisation with **confidence-flagged lane**; retention/archival/legal hold with **cross-tenant chain continuity** and **DR anchor reconciliation**; SR reporting & analytics.

**Out of scope (owned elsewhere):** employee master data and DOB/DOJ golden source (M01); the business workflows that *generate* events — leave (M03/M04), transfer (M05), promotion (M06), appraisal (M08), disciplinary (M09), payroll (M10), pension computation (M11); document byte storage (M13); cross-module dashboards (M14). M12 **records the statutory fact**; it does not run the originating business processes. **The per-cadre service rules consumed by the completeness model (FR-17) are referenced from M06/M10/service-rule masters; M12 evaluates expected-vs-recorded, it does not own the substantive promotion/increment rules.**

---

## Amendments (v1 → v2)

Every adopted council improvement is mapped to where and how it is incorporated. Risk IDs reference the council Risk Register (R1–R17).

| # | Adopted improvement (council) | Risk(s) mitigated | Incorporated in v2 (FR / entity / section) | How |
|---|---|---|---|---|
| 1 | Completeness assurance & gap register; retract "100% complete" | R1 (Critical) | **FR-17 (new)**; **E21 `sr_expected_event_rule`**, **E22 `sr_gap_register`**; §1.4 metric "gap-closure rate"; §12 | Expected-event model per cadre/service rules; reconciliation job `JOB-M12-GAPSCAN`; `GAP_FLAGGED` findings + corroboration workflow; metric corrected |
| 2 | Mandatory external anchoring | R2 (Critical), R12 | **FR-04 (amended)**; **E20 `sr_anchors`**; §4 (trust layers), §9 NFR-Integrity, §13.2 | Periodic Merkle root over chain heads, RFC 3161-timestamped to independent WORM; head-vs-anchor mismatch = non-suppressible FAIL; `JOB-M12-ANCHOR` |
| 3 | Hash-chained status sub-ledger | R3 (Critical) | **FR-03 / FR-04 (amended)**; **E19 `sr_status_events`**; §5.4, §5.6, §16.1 | Status/supersession transitions recorded as append-only hash-chained rows; pointers on E8 are derived & read-only; FR-04 verifies the status chain; mutable status still excluded from `entry_hash` |
| 4 | Engineer non-repudiation & admissibility; ban server-signed statutory outputs | R4 (High) | §4 (crypto), **FR-07 / FR-08 / FR-10 (amended)**; §9 NFR | Qualified e-sign via licensed CA mandatory for statutory signatures; RFC 3161 trusted timestamp on every ledger commit (`recorded_at` becomes trusted-time attestation); server-sign permitted only for marked internal/provisional artefacts |
| 5 | §65B / BSA certificate-of-authenticity generator | R4 (High) | **FR-18 (new)**; **E24 `sr_authenticity_certificates`**; FR-10 link | Machine-generated electronic-record authenticity certificate per extract citing hash, anchor reference, signer, chain-of-custody |
| 6 | Long-term validation (LTV) & evidence-record renewal | R5 (High) | **FR-19 (new)**; **E25 `sr_ltv_renewals`**; §16.1, §9 NFR-Retention | PAdES-LTV envelopes; RFC 4998 evidence-record renewal job `JOB-M12-LTV`; crypto-migration re-anchor procedure |
| 7 | Offline / independent verification | R15 (Medium) | **FR-11 (amended)** | Extract verifiable against published CA chain + embedded anchor reference without calling issuer; QR is convenience only |
| 8 | Separation of duties + grievance/appeal escalation | R6 (High) | §3 (amended), **FR-06 (amended)**, **FR-21 (new)**; **E23 `sr_appeals`**; FR-10 | Dual-custodian for routine corrigenda & FULL_SR extracts; appeal path beyond "uphold" to higher authority/tribunal; disputed status visible on extracts |
| 9 | Bulk / assisted / nominee-heir verification | R7 (High) | **FR-08 (amended)**; E12 fields | Bulk-confirm-with-exceptions surfacing changed/sensitive entries; assisted-verification path; nominee/legal-heir path for DEATH_IN_SERVICE |
| 10 | Confidence-flagged legacy lane | R8 (High) | **FR-14 (amended)**; §5.5 enums (`RECONSTRUCTED`, `LEGACY_UNVERIFIABLE`); E18 fields | New record/entry confidence statuses + mandatory provenance + employee corroboration; zero-tolerance only for promoted-as-attested facts |
| 11 | Source-driven reversal / cancellation event | R13 (Medium) | **FR-02 / FR-05 (amended)**; taxonomy (`*_CANCELLED`/`*_REVERSAL`); §16.2 | Cancellation ingestion event referencing original `source_reference_id` auto-spawns corrigendum/supersession workflow |
| 12 | Semantic (not just syntactic) deduplication | R10 (High) | **FR-02 / FR-14 (amended)**; E8/E13 `fact_key` field | Per-fact correlation keys; conflict detection in reconciliation; per-fact uniqueness for qualifying-service-bearing events |
| 13 | Bulk-corrigendum workflow | R14 (Medium) | **FR-20 (new)**; **E26 `sr_bulk_corrigendum_batch`**; FR-05 | Batch maker-checker with sampling-based approval for cadre-wide / pay-commission corrections; full per-entry audit retained |
| 14 | DPDP vs permanent retention resolution | R11 (Medium) | §4 (legal basis), §9 NFR-Privacy, §15 | States statutory-obligation lawful basis exempting ledger from erasure; maps data-principal correction → corrigendum flow; minimisation posture for sensitive categories |
| 15 | Cross-tenant / inter-department chain continuity | R16 (Medium) | §5 (amended), **FR-15 (amended)**; E8 `chain_origin`/`prior_chain_head_hash` | Chain hand-off rules on transfer; sequence continues with prior head linked as genesis reference; documented fork/continue policy |
| 16 | DR extended to anchor reconciliation | R12 (Medium) | §13.2 (amended), **FR-04 (amended)** | Restore procedure compares restored chain heads to external anchor to detect stale-restore; explicit restore gate |
| 17 | Purpose-driven extract redaction | (privacy) | **FR-10 (amended)**; E14 `redaction_policy` | Redaction by extract purpose (e.g., loan extract excludes disciplinary) enforced by P02 field-mask |
| 18 | Simplify subscriptions for launch | R17 (Low) | **FR-13 (amended)**; §5.5 enum note | Ship single authenticated pull-feed for M11/M06; defer WEBHOOK + MESSAGE_BUS + DLQ behind a documented real-time requirement |
| 19 | Crypto/admissibility decision & procurement first | R9 (High) | §13.1 (amended) — gated pre-FR-03 milestone | Crypto & Admissibility Decision Memo + CA/HSM/TSA/WORM confirmation as explicit gate before ledger code; canonicalisation + signature + LTV + anchor envelopes designed as one unit |
| 20 | Plain-language operator/citizen layer | (adoption) | §7 (amended), §11 (amended), §15 | Plain-language copy + grievance route for every `ERR-M12-*` / `MSG-M12-*`; operator playbook translating crypto/legal jargon; load-tested nightly-sweep SLA before NFR commitment |

> **Net structural deltas:** v1's **16 FRs** become **21 FRs** (FR-17 completeness/gap; FR-18 §65B certificate; FR-19 LTV/evidence-record renewal; FR-20 bulk corrigendum; FR-21 grievance/appeal — plus heavy amendments to FR-02/03/04/05/06/08/10/11/13/14/15). v1's **11 owned entities (E8–E18)** become **19 owned entities (E8–E26)** with 8 new: E19 `sr_status_events`, E20 `sr_anchors`, E21 `sr_expected_event_rule`, E22 `sr_gap_register`, E23 `sr_appeals`, E24 `sr_authenticity_certificates`, E25 `sr_ltv_renewals`, E26 `sr_bulk_corrigendum_batch`.

---

## Section 2 — Scope & Boundaries

### 2.1 In-scope capabilities

- A **versioned, effective-dated SR event taxonomy** (`sr_event_type`) defining every recordable life-event type, its required payload schema, qualifying-service semantics, attestation rules, **expected-cadence hints** (for completeness), and **fact-correlation rules** (for semantic dedup).
- An **append-only ledger** (`service_register_events`) on a **WORM / append-only substrate**, with per-employee monotonic sequencing and **SHA-256 hash-chaining** for ordering proof and pinpoint divergence.
- A **hash-chained status sub-ledger** (`sr_status_events`) so entry-status, attestation-status, and supersession-link transitions are themselves tamper-evident.
- A **mandatory external anchor** (`sr_anchors`): periodic Merkle root over per-employee chain heads, RFC 3161 trusted-timestamped, written to an independent WORM/notary store.
- A **governed ingestion contract** (idempotent, **semantically deduplicated**, versioned, schema-validated, provenance-stamped) with a **source-driven reversal/cancellation** path.
- **Ledger + status + anchor integrity verification** — on-demand and scheduled recomputation, with a forensic view that pinpoints any divergence and a head-vs-anchor check.
- **Completeness assurance & gap register** (`sr_expected_event_rule`, `sr_gap_register`) — expected-event modelling and reconciliation with employee corroboration.
- **Correction & annotation** by append-only supersession (`sr_corrections`), plus a **bulk-corrigendum** workflow (`sr_bulk_corrigendum_batch`).
- **Custodian attestation** with **qualified e-signatures + RFC 3161 timestamps**, the statutory **periodic employee verification** (`sr_attestations`, `sr_verification_cycles`) with **bulk/assisted/nominee-heir** paths, and **separation-of-duties + grievance/appeal** (`sr_appeals`).
- **SR timeline** and **certified true copy** (`sr_certified_extracts`) with qualified signature, **purpose-driven redaction**, **§65B/BSA certificate** (`sr_authenticity_certificates`), **LTV/evidence-record renewal** (`sr_ltv_renewals`), and **offline-verifiable** QR.
- **Custody & access control**: RBAC + row-level scoping + immutable **access log** (`sr_access_log`).
- **Event subscriptions** (`sr_subscriptions`) — a single authenticated pull-feed at launch.
- **Bulk legacy digitisation** with a **confidence-flagged lane** (`sr_legacy_digitisation_batch` / `sr_legacy_digitisation_record`).
- **Retention, archival, legal hold, cross-tenant chain continuity, and DR anchor reconciliation** on the permanent record.

### 2.2 Out-of-scope (explicit boundaries)

| Concern | Owner | M12 relationship |
|---|---|---|
| Employee master, DOB/DOJ golden source, employment status | M01-EPM | References `employees`; records *change events*; golden value lives in M01 |
| Substantive promotion/increment/service rules consumed by completeness model | M06 / M10 / service-rule master | M12 references the rules to compute **expected** events; it does not own them |
| Leave application/approval & leave→SR posting | M03 / M04 | Receives posted leave events via ingestion contract |
| Transfer / relieving / joining orders | M05-TRJ | Receives posting/transfer events (incl. cancellations) |
| Promotion / seniority computation | M06-PPP | Receives promotion events; emits seniority-relevant facts via pull-feed |
| Appraisal / APAR | M08-PAM | Receives appraisal-recorded events |
| Disciplinary charges, penalties, suspension | M09-DCP | Receives punishment/suspension events; **and reversal events when a penalty is quashed** |
| Payroll, pay-fixation computation | M10-PAY | Receives pay-fixation/increment events |
| Pension & qualifying-service computation | M11-PEN | **Consumes** SR (pull-feed/extract); pre-retirement verification gate; does not write computation back |
| Document byte storage / object store | M13-DMS | References `documents` for scans, orders, signed extracts |
| Cross-module analytics dashboards | M14-DAS | Exposes SR metrics & pull-feed |
| Auth / RBAC platform | Shared | Inherits OIDC/SSO + RBAC + row-level scoping |
| Licensed CA / HSM / RFC 3161 TSA / WORM substrate | Platform / external procurement | M12 **consumes**; availability is a gated pre-FR-03 dependency (§13.1) |

### 2.3 Feature Module Map

| Feature area | FRs | Primary collaborating modules |
|---|---|---|
| SR event taxonomy & payload schemas (incl. cadence + fact-correlation rules) | FR-01 | All source modules |
| Governed ingestion contract (idempotent, semantic-dedup, reversal) | FR-02 | M03/M04/M05/M06/M08/M09/M10 |
| Append-only hash-chained ledger + status sub-ledger | FR-03 | All source modules |
| Ledger + status + **anchor** integrity verification & forensics | FR-04, FR-16 | Auditor |
| Correction (corrigendum / supersession) | FR-05 | SR Custodian, source modules |
| Annotation, dispute & **appeal** entries | FR-06, FR-21 | SR Custodian, Employee, Appellate Authority |
| Custodian attestation (qualified signature) | FR-07 | SR Custodian |
| Periodic verification (bulk/assisted/heir) | FR-08 | Employee, Nominee/Heir, SR Custodian |
| SR timeline view | FR-09 | Employee, HR, Auditor |
| Certified true copy + qualified signing + redaction | FR-10 | SR Custodian, M13 |
| §65B / BSA certificate-of-authenticity | FR-18 | Courts, Auditor |
| LTV / evidence-record renewal | FR-19 | Auditor, M11 |
| Offline / QR verification of extracts | FR-11 | External verifiers, banks, courts |
| Custody, access control & access log | FR-12 | Auditor |
| Event subscriptions (single pull-feed) | FR-13 | M11, M06, M14 |
| Bulk legacy digitisation (confidence-flagged) | FR-14 | M13, HR data-entry, SR Custodian |
| Bulk corrigendum (cadre-wide) | FR-20 | SR Custodian, Appointing Authority |
| Completeness assurance & gap register | FR-17 | M06/M10 rules, Employee, Custodian |
| Retention, archival, legal hold, cross-tenant continuity, DR anchor | FR-15 | Auditor, M11 |
| Audit / forensics view & SR analytics | FR-16 | Auditor, M14 |

### 2.4 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit-everything:** every ingestion, attestation, correction, extract issuance, access, anchor write, gap finding, and digitisation promotion writes to `audit_log` (immutable) with actor, before/after, and `requestId`. The SR ledger is a *business* ledger; `audit_log` is the *operational* audit trail; `sr_anchors` is the *independent root of trust*.
- **Maker-checker:** any **manual** write to the statutory register routes through `workflow_instances`/`workflow_tasks` with maker ≠ checker. Routine corrigenda and FULL_SR extracts additionally require a **second custodian / independent reviewer** (separation of duties, FR-06/FR-10). Machine-to-machine ingestion is non-interactive but provenance-stamped, semantically deduplicated, and validated.
- **RBAC + row-level scoping** by `org_unit_id`; Auditor is read-only; Employee sees only their own SR; Appellate Authority sees appealed cases.
- **Pagination:** all list/timeline endpoints page/limit with hard max page size 100 (cursor paging).
- **Time/locale:** store UTC; display `DD-MMM-YYYY`; SR `event_date` is a legal date (no time) distinct from `recorded_at` — **and `recorded_at` is bound to an RFC 3161 trusted timestamp, not NTP** (v2).
- **Append-only:** the ledger and all SR sub-ledgers (status events, corrections, attestations, access log, ingestion log, anchors, gap register) are **never** soft- or hard-deleted; they carry `created_at`/`created_by` but no `updated_at`/`is_deleted`. Mutable configuration entities (taxonomy drafts, subscriptions, batch headers, expected-event rules) carry full audit fields.

### 2.5 Assumptions & dependencies

- Source modules authenticate with a service principal scoped to `sr.ingest.write` and emit events with a deterministic `Idempotency-Key` **and a `fact_key` for semantic dedup** (FR-02).
- M01 is the authoritative source for `employee_id` ↔ `service_no`; M12 denormalises `service_no` but treats M01 as golden.
- M13 provides durable, encrypted, **WORM/object-lock-capable** storage for scans, signed PDFs, order copies, and the anchor export.
- **A licensed government CA, an HSM, and an RFC 3161 Timestamp Authority (TSA) are confirmed before FR-03 is built (gated milestone §13.1).** If unavailable, this is an **escalation**, not a silent degradation to server-signing.
- A reliable scheduler exists for integrity sweeps, **anchor generation**, verification-cycle generation, **gap-scan**, **LTV renewal**, and pull-feed availability.
- The completeness model (FR-17) can read per-cadre service rules (increment cadence, confirmation window) from M06/M10 / a service-rule master.

---

## Section 3 — Roles & Permissions

### 3.1 Roles relevant to M12 (extends Shared Foundation §4; no contradictions)

- **Employee (Self-Service)** — views own SR timeline; participates in periodic verification (confirm/dispute, including **bulk-confirm-with-exceptions**); raises disputes and **appeals**; requests certified extracts; corroborates gap findings; cannot write ledger entries.
- **Nominee / Legal Heir** — for DEATH_IN_SERVICE / post-mortem pension cases, performs **assisted/heir verification** of the deceased employee's record under a controlled, identity-verified path (FR-08); read-scoped to that employee.
- **Reporting Manager** — views SR of direct reports (scoped, read-only); no write.
- **HR Officer / HR Admin** — initiates manual SR records that have no originating module (rare); prepares legacy digitisation batches (maker); runs data entry; **operates the assisted-verification path on behalf of low-literacy/no-device employees** with consent capture; cannot self-approve into the ledger.
- **SR Custodian / Registrar** — the statutory custodian: attests entries, approves corrections/annotations, promotes legacy batches (checker), issues certified extracts, manages access, owns the verification cycle and gap register. **Routine corrigenda and FULL_SR extracts require a second custodian (separation of duties).**
- **Second Custodian / Independent Reviewer** — co-signs routine corrigenda and FULL_SR extracts; cannot be the same individual as the initiating custodian (segregation of duties).
- **Appellate Authority** — a higher authority/tribunal role that hears **appeals** beyond a custodian "uphold" (FR-21); records binding outcomes that may spawn a corrigendum; read + decision, no direct ledger write.
- **Source Module (service principal)** — machine identity for M03/M04/M05/M06/M08/M09/M10 posting events (and reversals) via the ingestion contract; `sr.ingest.write` scope only.
- **Pension Officer** — read SR (full) + consume pull-feed/extract for terminal-benefit computation (M11); no write.
- **Auditor (read-only)** — full read across SR, status sub-ledger, anchors, access log, integrity/gap reports, and forensics; can trigger integrity verification and anchor checks; no write.
- **System Administrator** — manages SR taxonomy versions, expected-event rules, subscription registration, retention/legal-hold policy, **CA/HSM/TSA/anchor/LTV configuration**; **no** transactional self-approval; cannot author or attest ledger entries.

> **Platform RBAC mapping (RBAC Design v1.7).** The SR Custodian maps to the platform **Module-Admin tier** (entity-scoped). Elevated SR powers (legacy promotion, integrity verification, anchor management, bulk corrigendum) are **capability flags** (RBAC §4.3), grantable per user and audit-logged. **Separation-of-duties for corrigenda/FULL_SR extracts is enforced as a runtime maker≠checker≠second-custodian constraint, not merely a role label.** Resolution is deny-by-default with **multi-role INTERSECTION (most restrictive)** and the **PII Protection Ceiling** on DOB/national-ID, enforced by P02.

### 3.2 Permission matrix

| Capability / Action | Employee | Nominee/Heir | HR Officer | SR Custodian | 2nd Custodian | Appellate Auth | Source Module | Pension Officer | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|
| View own SR timeline | ✔ (self) | ✔ (decedent) | — | — | — | — | — | — | — | — |
| View any SR timeline (scoped) | — | — | R (scoped) | R | R | R (appealed) | — | R | R | — |
| Post event via ingestion contract | — | — | — | ✔ (manual) | — | — | ✔ (machine) | — | — | — |
| Post reversal/cancellation event | — | — | — | ✔ (manual) | — | — | ✔ (machine) | — | — | — |
| Attest entry (qualified signature) | — | — | — | ✔ | — | — | — | — | — | — |
| Initiate correction/corrigendum (maker) | — | — | ✔ | maker | — | — | system | — | — | — |
| Approve correction (checker) | — | — | — | ✔ | co-sign | — | — | — | — | — |
| Bulk corrigendum (batch maker-checker) | — | — | propose | maker | co-sign | — | — | — | — | — |
| Add annotation | — | — | maker | ✔ | — | — | — | — | — | — |
| Raise dispute on own entry | ✔ (self) | ✔ (decedent) | — | — | — | — | — | — | — | — |
| Raise appeal beyond uphold | ✔ (self) | ✔ (decedent) | — | — | — | hear/decide | — | — | — | — |
| Confirm periodic verification | ✔ (self) | ✔ (heir path) | assist | finalise | — | — | — | — | — | — |
| Bulk-confirm with exceptions | ✔ (self) | ✔ | assist | — | — | — | — | — | — | — |
| Corroborate gap finding | ✔ (self) | ✔ | assist | resolve | — | — | — | — | — | — |
| Issue certified extract (FULL_SR) | request | request | request | ✔ (sign) | co-sign | — | — | — | — | — |
| Verify certified extract (offline/QR) | ✔ (public) | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ |
| Generate §65B/BSA certificate | request | request | — | ✔ | — | — | — | — | R | — |
| View access log | — | — | — | R | — | — | — | — | R | R |
| Trigger integrity / anchor verification | — | — | — | ✔ | — | — | — | — | ✔ | — |
| View forensics view | — | — | — | R | — | R (appealed) | — | — | R | — |
| Prepare legacy digitisation batch (maker) | — | — | ✔ | maker | — | — | — | — | — | — |
| Promote legacy batch to ledger (checker) | — | — | — | ✔ | co-sign (confidence-flagged) | — | — | — | — | — |
| Manage SR taxonomy / expected-event rules | — | — | — | propose | — | — | — | — | — | ✔ |
| Approve/publish taxonomy version | — | — | — | ✔ | — | — | — | — | — | — |
| Manage subscriptions (pull-feed) | — | — | — | approve | — | — | — | — | — | ✔ |
| Manage retention / legal hold | — | — | — | propose | — | — | — | — | — | ✔ |
| Manage CA/HSM/TSA/anchor/LTV config | — | — | — | — | — | — | — | — | — | ✔ |

Legend: ✔ = perform; R = read; maker/checker/co-sign = segregation-of-duties split (maker ≠ checker ≠ second custodian enforced); — = no access. Every ✔ that writes to the statutory register writes to `audit_log` and (where manual) routes through the shared workflow engine.

---

## Section 4 — Shared Application Foundation

This module **inherits** the Shared Foundation §5 technical defaults verbatim and adds SR-specific posture. v2 hardens the cryptographic, anchoring, admissibility, and privacy postures per the council.

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) for the SR timeline, custodian console, verification UI, appeal console, gap-register console, and forensics view; REST API under `/api/v1/sr`; the ingestion contract is a versioned API (`/api/v1/sr/ingest`); PostgreSQL primary datastore for the ledger and sub-ledgers; **M13 WORM/object-lock storage** for scans, signed PDFs, and the anchor export. A background scheduler runs integrity sweeps, **anchor generation**, verification-cycle generation, **gap-scan**, **LTV renewal**, and pull-feed serving.
- **Auth:** OIDC/SSO + MFA for human roles; mutual-TLS + service JWT for source-module principals; RBAC + row-level scoping by `org_unit_id`. The ingestion principal holds only `sr.ingest.write`; it cannot read other employees' SR or issue extracts.
- **Trust layering (v2 — the four named layers).** The council's first-principles decomposition is adopted verbatim:
  1. **Substrate (trust layer):** the ledger is written to a **WORM / append-only substrate** — DB-level append-only enforcement (no UPDATE of content fields, no DELETE, via row-rules/triggers) **with the write principal segregated from any principal able to recompute hashes**, backed by object-lock for exported artefacts. This is the actual write-once guarantee.
  2. **Per-employee hash chain (convenience layer):** SHA-256 over a canonical, field-ordered serialization including `prev_event_hash`. Gives cheap ordering proof and pinpoint divergence. Per-row `hash_algorithm` and `ledger_version` enable crypto-agility. **This layer is *tamper-detection within a trusted substrate*, not standalone tamper-evidence** (v1 over-claim retracted).
  3. **Mandatory external anchor (insider-resistance layer):** a periodic Merkle root over all per-employee chain heads is **RFC 3161 trusted-timestamped and written to an independent WORM / notary store** (`sr_anchors`). FR-04 compares chain heads to the latest anchor; **head-vs-anchor mismatch is a non-suppressible FAIL**. This — not the chain — is what defeats a privileged insider who controls PostgreSQL and a stale restore that silently rewinds a corrigendum.
  4. **Qualified signatures + LTV (non-repudiation & longevity layer):** custodian attestation, employee verification, and extract signing use **qualified e-signatures via a licensed CA** with **RFC 3161 trusted timestamps**, wrapped in **PAdES-LTV** and renewed via **RFC 4998 evidence records** before certificate/algorithm expiry.
- **Hash-chained status sub-ledger (v2).** Because `entry_status`, `attestation_status`, and supersession links determine *which version of a fact is legally operative*, their transitions are recorded as append-only, hash-chained `sr_status_events` rows (per-employee status chain). The pointers on `service_register_events` are **derived projections, read-only at the application layer**. The content `entry_hash` still **excludes** mutable status (so status changes never break the content chain); instead the **status chain** carries its own tamper-evidence and is verified by FR-04. This resolves the council's "mutable un-hashed pointer" Critical finding without re-breaking the content chain.
- **Trusted time (v2).** `recorded_at` is no longer an NTP timestamp an insider can set; every ledger commit obtains an **RFC 3161 timestamp token** from the TSA over the entry hash, stored alongside the entry; the anchor batch is likewise timestamped. NTP remains only for operational logging.
- **Digital signing:** all **statutory** signed outputs (certified extracts, custodian attestations, verification confirmations) use **qualified e-signature (licensed CA) — server-signing is banned for statutory artefacts**. Server-signing is permitted **only** for clearly-marked internal/provisional artefacts (watermarked "PROVISIONAL — NOT A STATUTORY COPY") that must be re-issued once qualified signing is available. Signature metadata (signer, certificate serial, timestamp token, algorithm, LTV status) is stored.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "...", "details": {} }, "requestId": "..." }`; user-facing copy resolves via `ERR-M12-*` ids in **plain language** (§11/§15).
- **Inherited error codes:** VALIDATION_FAILED(422), UNAUTHENTICATED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), PRECONDITION_FAILED(412), RATE_LIMITED(429), INTERNAL(500), UPSTREAM_UNAVAILABLE(503). M12-specific codes are cataloged in Section 8.
- **Idempotency & semantic dedup:** ingestion writes carry a deterministic `Idempotency-Key`; the ledger dedupes **syntactically** on `(source_module, source_reference_id, source_event_version)` **and semantically** on `fact_key` (per-fact correlation key) for qualifying-service-bearing events, preventing two modules from double-recording one real-world fact.
- **Observability:** structured logs with `requestId` + `correlation_id`; metrics (ingestion rate, integrity status, **anchor freshness & head-match rate**, **gap-closure rate**, attestation backlog, verification completion, **LTV renewal backlog**, extract issuance, appeal backlog) exposed to M14.
- **Security/compliance:** OWASP ASVS; TLS 1.2+ in transit; AES-256 at rest; statutory **permanent** retention.
- **DPDP Act 2023 vs. permanent immutable retention (v2 — legal contradiction resolved).** The SR ledger is retained permanently under the **DPDP Act §17 / processing-necessary-for-legal-obligation lawful basis** (the statutory duty to maintain a service record for pension, audit, and litigation), which **exempts the ledger from the erasure right**. A data-principal **correction** request does **not** edit or delete a ledger row; it is **mapped onto the corrigendum flow (FR-05)** — the erroneous entry is superseded, the corrected fact appended, and both preserved. Sensitive categories (disciplinary PUNISHMENT/SUSPENSION, health-linked LEAVE) follow **data minimisation** in `payload` (statutory facts only, no clinical detail), least-privilege access, full access logging, and **purpose-driven redaction** in extracts (FR-10). The lawful-basis, retention, and minimisation posture is documented in §9 NFR-Privacy and §15.
- **NFR baseline:** P95 read/timeline API < 500ms; P95 ingestion write < 400ms (includes TSA round-trip budget); 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4h; WCAG 2.1 AA. **Nightly integrity-sweep + anchor SLA is set only after a load-test against the target tens-of-millions-of-rows population (§13.1, council Improvement 20).**

### 4.1 Alignment with the PrimeSoft HRMS platform deliverables

This BRD is authored against the program's **build contract** (`SHARED_FOUNDATION.md`) but is **harmonised with the delivered PrimeSoft HRMS platform** (Product Vision v2.6, Platform Specification v1.6, Foundation FS v1.7, RBAC Design v1.7, Document Management FS v1.3). Digital SR is a *consumer* of the platform's horizontal services (P01–P06, X.1–X.3).

**Multi-tenancy (P04).** Every SR entity carries `tenant_id`; all queries, jobs (X.1), and notifications (X.2) execute per-tenant. The per-employee chain is scoped to `(tenant_id, employee_id)`. **Cross-tenant / inter-department career mobility is now explicitly handled (FR-15):** on transfer to a different org unit/tenant, the chain **continues** (sequence does not fork) with the prior chain head recorded as a `prior_chain_head_hash` genesis reference on the first entry in the new scope, preserving an unbroken evidentiary link; cross-tenant content operations remain reserved to Platform Super Admin tooling only.

**Workflow engine (P01).** Manual maker-checker SR writes start a platform workflow. SR workflow codes (v2): `WF-M12-CORRIGENDUM`, `WF-M12-BULK-CORRIGENDUM`, `WF-M12-ANNOTATION`, `WF-M12-IDENTITY-CHANGE` (DOB/name — dual sign-off), `WF-M12-LEGACY-PROMOTE`, `WF-M12-MANUAL-EVENT`, `WF-M12-EXTRACT-DUAL` (FULL_SR extract dual-custodian), `WF-M12-APPEAL` (grievance escalation), `WF-M12-GAP-RESOLVE` (completeness corroboration).

**Authorization (P02).** Every SR endpoint calls `Authorization.check({ subject, action, resource_ref, fields })` with deny-by-default, multi-role INTERSECTION, PII Protection Ceiling (Tier-1 IDs: national-ID/Aadhaar, DOB), data-scope filter, and **field mask on serialization** (an over-broad query still cannot leak a masked field). **Purpose-driven extract redaction (FR-10) is enforced through the same P02 field-mask.** Out-of-scope records return 404-style non-existence, never a 403 leak. Separation-of-duties for corrigenda/FULL_SR extracts is a runtime maker≠checker≠second-custodian constraint.

**Audit & compliance (P05).** SR mutations write to the immutable `audit_log` via DB triggers (100% capture; PII masked; reading an SR/audit record is itself audited). Auth/permission events write to `security_audit_log`. **The SR ledger's hash-chain + status-chain + mandatory anchor realise and extend the platform's tamper-evidence proposal (OPEN-PLAT-03) at the statutory-record level**, with the chain head exported to WORM and independently timestamped.

**Background jobs (X.1).** SR schedulers (v2): `JOB-M12-INTEGRITY` (rolling chain + status-chain verification, FR-04), `JOB-M12-ANCHOR` (periodic Merkle-root anchor + RFC 3161 timestamp + WORM write, FR-04), `JOB-M12-VERIFY-GEN` (cycle generation, FR-08), `JOB-M12-GAPSCAN` (expected-vs-recorded reconciliation, FR-17), `JOB-M12-LTV` (PAdES-LTV / RFC 4998 evidence-record renewal, FR-19), `JOB-M12-FEED` (pull-feed materialisation, FR-13), `JOB-M12-RETENTION` (archival/legal-hold eligibility, FR-15). Each is idempotent (per-period run key), retries with exponential backoff, emits `JOB-FAIL → MSG-SYS-JOBFAIL` on terminal failure, runs per-tenant, and writes one audit row per run.

**API conventions (Foundation FS §1).** Platform envelope; `X-Correlation-Id` on every request; `Idempotency-Key` on unsafe POSTs (24h replay returns original); **cursor pagination** (`?limit=` default 25, max 100); five canonical UI states inherited by every SR screen.

**Migration (P06).** Legacy digitisation (FR-14) runs on the platform's **ETL+V** framework with permanent `legacy_source_id`, `migration_runs` ledger, three mandatory staging dry runs, and the legacy source kept read-only ≥ 4 weeks post-go-live. **v2:** reconciliation tolerance is **zero only for facts promoted as fully attested**; a **confidence-flagged lane** (`RECONSTRUCTED` / `LEGACY_UNVERIFIABLE`) lets digitisation proceed on illegible/contradictory books without fabricating certainty.

**Notifications (X.2).** SR notifications use `MSG-M12-*`; IN_APP + EMAIL fire in parallel for approvals; **statutory notifications are mandatory and not user-suppressible**; retries with backoff up to 5 attempts + DLQ; **all user-facing copy is plain-language** (§11, council Improvement 20).

**AI Chat Agent (P03).** The document-grounded assistant may answer SR questions backend-only, PII-stripped, informational only (never a ledger write/workflow), governed by P02 ceilings; query/response content not logged (metadata only).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| E1 | `employees` | Canonical (referenced) | M01 | Employee master; subject of SR entries |
| E2 | `org_units` | Canonical (referenced) | Shared | Org scoping for access control |
| E3 | `users` / `roles` / `tenants` | Canonical (referenced) | Shared / P04 | Identity, RBAC, and tenant scope |
| E4 | `audit_log` | Canonical (referenced) | Shared | Immutable operational audit trail |
| E5 | `notifications` | Canonical (referenced) | Shared | Outbound notifications |
| E6 | `documents` | Canonical (referenced) | M13 | Scans, order copies, signed extract PDFs, anchor export |
| E7 | `workflow_instances` / `workflow_tasks` | Canonical (referenced) | Shared | Maker-checker for manual SR writes/batches/appeals |
| **E8** | **`service_register_events`** | **M12-OWNED (canonical ledger)** | M12 | Append-only, hash-chained statutory SR ledger |
| **E9** | **`sr_event_type`** | **M12-owned** | M12 | Versioned taxonomy + payload schema + cadence + fact-correlation rules |
| **E10** | **`sr_corrections`** | **M12-owned** | M12 | Corrigendum / annotation / dispute / supersession records |
| **E11** | **`sr_attestations`** | **M12-owned** | M12 | Custodian/employee qualified signatures + timestamps |
| **E12** | **`sr_verification_cycles`** | **M12-owned** | M12 | Periodic + bulk/assisted/heir verification cycles |
| **E13** | **`sr_ingestion_requests`** | **M12-owned** | M12 | Append-only provenance/idempotency/semantic-dedup log |
| **E14** | **`sr_certified_extracts`** | **M12-owned** | M12 | Issued certified copies (signed, redacted, QR/offline-verifiable) |
| **E15** | **`sr_access_log`** | **M12-owned** | M12 | Append-only custody/access log |
| **E16** | **`sr_subscriptions`** | **M12-owned** | M12 | Downstream pull-feed subscriptions + cursor |
| **E17** | **`sr_legacy_digitisation_batch`** | **M12-owned** | M12 | Legacy digitisation batch header |
| **E18** | **`sr_legacy_digitisation_record`** | **M12-owned** | M12 | Staged legacy entry (with confidence flag) |
| **E19** | **`sr_status_events`** | **M12-owned (NEW v2)** | M12 | Append-only, hash-chained status/supersession sub-ledger |
| **E20** | **`sr_anchors`** | **M12-owned (NEW v2)** | M12 | External Merkle-root anchors (RFC 3161-timestamped, WORM) |
| **E21** | **`sr_expected_event_rule`** | **M12-owned (NEW v2)** | M12 | Expected-event model per cadre/service rules (completeness) |
| **E22** | **`sr_gap_register`** | **M12-owned (NEW v2)** | M12 | Detected completeness gaps + corroboration lifecycle |
| **E23** | **`sr_appeals`** | **M12-owned (NEW v2)** | M12 | Grievance/appeal escalation beyond custodian uphold |
| **E24** | **`sr_authenticity_certificates`** | **M12-owned (NEW v2)** | M12 | §65B / BSA electronic-record authenticity certificates |
| **E25** | **`sr_ltv_renewals`** | **M12-owned (NEW v2)** | M12 | PAdES-LTV / RFC 4998 evidence-record renewal events |
| **E26** | **`sr_bulk_corrigendum_batch`** | **M12-owned (NEW v2)** | M12 | Cadre-wide/pay-commission bulk corrigendum batch |

> v2 introduces **19 owned entities** (E8–E26; 8 new since v1) and references **7 canonical entities** (E1–E7). `service_register_events` (E8) is the program's canonical SR ledger, defined here; all other modules reference (not redefine) it.

### 5.2 Entity field tables & sample data

> Entities **E9–E18** retain their v1 field tables and sample rows unchanged except for the field additions called out below (E8, E13, E14, E18); they are not re-listed in full here to avoid redefinition — see v1 §5.2, which remains the field-level contract for those entities. **E8 is re-listed in full (amended). New entities E19–E26 are listed in full with sample rows.**

#### E8 — `service_register_events` (THE statutory ledger — M12-owned, append-only, hash-chained) — **amended v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `sr_event_id` | UUID PK | N | Immutable ledger entry id |
| `tenant_id` | UUID FK→tenants | N | Tenant scope; chain is per `(tenant_id, employee_id)` |
| `employee_id` | UUID FK→employees | N | Subject of the event |
| `service_no` | varchar(32) | N | Denormalised business key (golden in M01) |
| `sequence_no` | bigint | N | Monotonic per `employee_id` — the "page number" |
| `event_type_code` | varchar(48) FK→sr_event_type | N | e.g., `APPOINTMENT`, `PROMOTION`, `LWP_SPELL` |
| `event_category` | enum | N | See §5.5 |
| `event_title` | varchar(200) | N | Human-readable summary line |
| `event_description` | text | Y | Narrative detail |
| `event_date` | date | N | **Legal effective date** (no time) |
| `recorded_at` | timestamptz | N | When committed to the ledger (UTC) |
| `tsa_timestamp_token` | bytea/text | N | **NEW v2** — RFC 3161 timestamp token over `entry_hash` (trusted time) |
| `tsa_authority` | varchar(120) | Y | **NEW v2** — TSA identity / policy OID |
| `fact_key` | varchar(96) | Y | **NEW v2** — semantic per-fact correlation key (qualifying-service-bearing events) |
| `source_module` | varchar(16) | N | Provenance: M01..M14, `M12_MANUAL`, `M12_LEGACY` |
| `source_reference_id` | varchar(64) | Y | Originating order/transaction id |
| `source_event_version` | int | N | Source event schema/version (default 1) |
| `reverses_event_id` | UUID FK→self | Y | **NEW v2** — for a reversal/cancellation event, the entry it reverses |
| `order_no` | varchar(64) | Y | Government order/notification number |
| `order_date` | date | Y | Date of the order |
| `sanctioning_authority` | varchar(160) | Y | Authority that sanctioned the event |
| `payload` | jsonb | N | Structured, schema-validated event data |
| `qualifying_service_impact` | enum | N | QUALIFYING / NON_QUALIFYING / PARTIAL / NOT_APPLICABLE |
| `confidence_status` | enum | N | **NEW v2** — VERIFIED / RECONSTRUCTED / LEGACY_UNVERIFIABLE (default VERIFIED for live ingestion) |
| `entry_status` | enum | N | ACTIVE / SUPERSEDED / ANNOTATED — **derived projection from `sr_status_events` (read-only at app layer, v2)** |
| `attestation_status` | enum | N | UNATTESTED / ATTESTED / EMPLOYEE_VERIFIED / DISPUTED — **derived projection from `sr_status_events`** |
| `supersedes_event_id` | UUID FK→self | Y | If a corrigendum, the entry it supersedes |
| `superseded_by_event_id` | UUID FK→self | Y | **Derived projection from `sr_status_events`** |
| `chain_origin` | enum | N | **NEW v2** — GENESIS / CONTINUED (continued from a prior tenant/org chain on transfer) |
| `prior_chain_head_hash` | char(64) | Y | **NEW v2** — for `sequence_no=1` of a CONTINUED chain: the prior scope's chain-head hash (cross-tenant continuity) |
| `prev_event_hash` | char(64) | N | SHA-256 of the previous entry in this chain (`GENESIS` for first GENESIS-origin entry; prior head hash for CONTINUED) |
| `entry_hash` | char(64) | N | SHA-256 over canonical content + `prev_event_hash` (**excludes mutable status; see §16.1**) |
| `hash_algorithm` | varchar(16) | N | e.g., `SHA-256` (crypto-agility) |
| `ledger_version` | int | N | Canonicalisation version |
| `document_ids` | uuid[] | Y | Supporting documents (M13) |
| `ingestion_request_id` | UUID FK→sr_ingestion_requests | Y | The ingestion call that produced this entry |
| `is_legacy` | boolean | N | True if digitised from a paper service book |
| `legacy_batch_id` | UUID FK→sr_legacy_digitisation_batch | Y | Source digitisation batch |
| `legacy_source_id` | varchar(80) | Y | Permanent migration traceability/dedup key |
| `posted_by` | varchar(64) | N | Service principal or custodian who posted |
| `created_at` | timestamptz | N | Append timestamp (UTC) — **no `updated_at`, no `is_deleted`** |
| `created_by` | varchar(64) | N | Actor |

*Append-only. Content fields are immutable after commit. The status-bearing fields (`entry_status`, `attestation_status`, `superseded_by_event_id`) are **derived projections** materialised from the append-only, hash-chained `sr_status_events` (E19) — they are read-only at the application layer and never directly UPDATEd by business code; the materialiser is the only writer and runs in the same transaction as the corresponding `sr_status_events` append. `entry_hash` excludes these projections, so status changes never break the content chain, **and the status chain (E19) provides their tamper-evidence (v2).***

Sample data:

| sr_event_id | service_no | sequence_no | event_type_code | event_date | source_module | confidence_status | entry_status | attestation_status | qualifying_service_impact |
|---|---|---|---|---|---|---|---|---|---|
| sr…0001 | GOV-100245 | 1 | APPOINTMENT | 2008-07-14 | M01 | VERIFIED | ACTIVE | EMPLOYEE_VERIFIED | QUALIFYING |
| sr…0042 | GOV-100245 | 42 | PROMOTION | 2019-06-01 | M06 | VERIFIED | SUPERSEDED | ATTESTED | QUALIFYING |
| sr…0043 | GOV-100245 | 43 | PROMOTION_CORRIGENDUM | 2019-06-01 | M12_MANUAL | VERIFIED | ACTIVE | ATTESTED | QUALIFYING |
| sr…0119 | GOV-088120 | 7 | INCREMENT | 1996-07-01 | M12_LEGACY | RECONSTRUCTED | ACTIVE | UNATTESTED | QUALIFYING |

#### E9–E18 field additions (amendments only; full tables in v1 §5.2)

- **E9 `sr_event_type`** — add: `expected_cadence` jsonb (Y) — completeness hint (e.g., `{ "type":"ANNUAL", "month":7, "unless_event":"INCREMENT_WITHHELD" }`); `fact_correlation_rule` jsonb (Y) — how to derive `fact_key` + which `source_module`s may report the same fact; `supports_reversal` boolean (N, default false) — whether a `*_CANCELLED`/`*_REVERSAL` partner type exists.
- **E13 `sr_ingestion_requests`** — add: `fact_key` varchar(96) (Y) — semantic key supplied/derived; `semantic_dedup_result` enum (N) — NEW_FACT / SEMANTIC_DUPLICATE / SEMANTIC_CONFLICT; `conflicting_event_id` UUID (Y) — the prior entry on semantic conflict; `is_reversal` boolean (N, default false).
- **E14 `sr_certified_extracts`** — add: `redaction_policy` varchar(48) (Y) — purpose-driven redaction profile applied (e.g., `LOAN_EXCLUDE_DISCIPLINARY`); `redacted_categories` varchar[] (Y); `authenticity_certificate_id` UUID FK→sr_authenticity_certificates (Y); `ltv_status` enum (N) — NONE / LTV_APPLIED / LTV_RENEWED; `anchor_id` UUID FK→sr_anchors (Y) — anchor reference embedded for offline verification; `offline_bundle_document_id` UUID FK→documents (Y) — self-contained offline-verifiable bundle.
- **E18 `sr_legacy_digitisation_record`** — add: `confidence_status` enum (N) — VERIFIED / RECONSTRUCTED / LEGACY_UNVERIFIABLE; `corroboration_status` enum (N) — NOT_REQUIRED / PENDING_EMPLOYEE / CORROBORATED / UNCORROBORATED; `evidence_quality_note` text (Y) — faded-ink/missing-page best-evidence note.

#### E19 — `sr_status_events` (status/supersession sub-ledger — M12-owned, append-only, hash-chained) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `status_event_id` | UUID PK | N | Immutable status-transition id |
| `tenant_id` | UUID FK→tenants | N | Tenant scope |
| `employee_id` | UUID FK→employees | N | Owner of the status chain |
| `target_event_id` | UUID FK→service_register_events | N | The ledger entry whose status changed |
| `status_sequence_no` | bigint | N | Monotonic per `(tenant_id, employee_id)` status chain |
| `transition_kind` | enum | N | ENTRY_STATUS / ATTESTATION_STATUS / SUPERSESSION |
| `from_value` | varchar(32) | Y | Prior value (null on first) |
| `to_value` | varchar(32) | N | New value (e.g., ATTESTED, SUPERSEDED, DISPUTED) |
| `related_event_id` | UUID FK→service_register_events | Y | e.g., the corrigendum that caused SUPERSEDED |
| `reason_ref` | varchar(64) | Y | FK-ish to `sr_corrections`/`sr_attestations`/`sr_appeals` causing the change |
| `actor` | varchar(64) | N | Who/what caused the transition |
| `prev_status_hash` | char(64) | N | SHA-256 of prior status-chain entry (`GENESIS` for first) |
| `status_hash` | char(64) | N | SHA-256 over canonical status content + `prev_status_hash` |
| `hash_algorithm` | varchar(16) | N | e.g., `SHA-256` |
| `recorded_at` | timestamptz | N | Commit time (UTC) |
| `tsa_timestamp_token` | bytea/text | Y | RFC 3161 token over `status_hash` (high-sensitivity transitions) |
| `created_at`/`created_by` | std | | Append-only (no soft delete) |

Sample data:

| status_event_id | target_event_id | status_sequence_no | transition_kind | from_value | to_value | actor |
|---|---|---|---|---|---|---|
| se…01 | sr…0042 | 87 | ATTESTATION_STATUS | UNATTESTED | ATTESTED | custodian.rao |
| se…02 | sr…0042 | 88 | SUPERSESSION | ACTIVE | SUPERSEDED | custodian.rao |
| se…03 | sr…0030 | 89 | ATTESTATION_STATUS | ATTESTED | DISPUTED | emp.kumar |

#### E20 — `sr_anchors` (external Merkle-root anchors — M12-owned, append-only) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `anchor_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | Anchors are per-tenant |
| `anchor_seq` | bigint | N | Monotonic anchor sequence per tenant |
| `period_from` | timestamptz | N | Window of chain-head snapshot start |
| `period_to` | timestamptz | N | Window end |
| `merkle_root` | char(64) | N | Root over all `(employee_id → content chain head hash, status chain head hash)` leaves |
| `leaf_count` | bigint | N | Number of employee chains covered |
| `head_snapshot_digest` | char(64) | N | Digest of the ordered head list (for reconstruction) |
| `tsa_timestamp_token` | bytea/text | N | RFC 3161 token over `merkle_root` (trusted time) |
| `tsa_authority` | varchar(120) | N | TSA identity / policy OID |
| `worm_document_id` | UUID FK→documents | N | Immutable WORM export of the anchor + head list (M13 object-lock) |
| `external_notary_ref` | varchar(160) | Y | Optional independent notary/transparency-log reference |
| `prev_anchor_hash` | char(64) | N | Chains anchors together (`GENESIS` for first) |
| `anchor_hash` | char(64) | N | SHA-256 over canonical anchor content + `prev_anchor_hash` |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| anchor_id | anchor_seq | period_to | merkle_root | leaf_count | tsa_authority |
|---|---|---|---|---|---|
| an…01 | 1 | 2026-06-30T18:30:00Z | 7c4a…b1 | 412390 | CGG-TSA Policy 1.2.3 |
| an…02 | 2 | 2026-07-01T18:30:00Z | 9f10…ee | 412411 | CGG-TSA Policy 1.2.3 |
| an…03 | 3 | 2026-07-02T18:30:00Z | a3bd…07 | 412433 | CGG-TSA Policy 1.2.3 |

#### E21 — `sr_expected_event_rule` (completeness — expected-event model) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `rule_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `rule_code` | varchar(48) | N | e.g., `ANNUAL_INCREMENT`, `CONFIRMATION_DUE`, `PERIODIC_VERIFY_DUE` |
| `applies_to_cadre` | varchar[] | Y | Cadres in scope (null = all) |
| `expected_event_category` | enum | N | The category whose presence is expected |
| `cadence` | jsonb | N | Recurrence spec (e.g., annual on increment month; once N months after joining) |
| `suppressed_by_categories` | varchar[] | Y | Events that legitimately explain absence (e.g., INCREMENT_WITHHELD, SUSPENSION) |
| `source_rule_ref` | varchar(120) | Y | Pointer to M06/M10/service-rule master authority |
| `severity` | enum | N | INFO / WARN / CRITICAL (pension-affecting) |
| `status` | enum | N | DRAFT / PUBLISHED / RETIRED |
| `effective_from` | date | N | |
| `effective_to` | date | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Config entity |

Sample data:

| rule_id | rule_code | expected_event_category | cadence | suppressed_by_categories | severity |
|---|---|---|---|---|---|
| er…01 | ANNUAL_INCREMENT | INCREMENT | {"type":"ANNUAL","month":7} | {INCREMENT_WITHHELD,SUSPENSION,LWP_SPELL} | CRITICAL |
| er…02 | CONFIRMATION_DUE | CONFIRMATION | {"type":"ONCE","months_after_join":24} | {PROBATION_EXTENSION} | WARN |
| er…03 | PERIODIC_VERIFY_DUE | OTHER | {"type":"EVERY_N_YEARS","n":5} | {} | INFO |

#### E22 — `sr_gap_register` (detected completeness gaps + corroboration) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `gap_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `employee_id` | UUID FK→employees | N | |
| `rule_id` | UUID FK→sr_expected_event_rule | N | Rule that detected the gap |
| `expected_period_from` | date | N | Window the missing event was expected in |
| `expected_period_to` | date | N | |
| `expected_event_category` | enum | N | |
| `gap_status` | enum | N | GAP_FLAGGED / UNDER_REVIEW / EXPLAINED / CLOSED_RECORDED / CLOSED_FALSE_POSITIVE |
| `explanation_code` | varchar(48) | Y | e.g., WITHHELD, NOT_DUE, LEGACY_MISSING, RECORDED_LATE |
| `resolved_event_id` | UUID FK→service_register_events | Y | Entry created/located that closes the gap |
| `corroborated_by` | varchar(64) | Y | Employee/heir who corroborated |
| `severity` | enum | N | Inherited from rule (INFO/WARN/CRITICAL) |
| `detected_at` | timestamptz | N | |
| `closed_at` | timestamptz | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Process entity |

Sample data:

| gap_id | employee_id | rule_id | expected_period_from | gap_status | explanation_code | severity |
|---|---|---|---|---|---|---|
| gp…01 | emp…aa | er…01 | 1994-07-01 | GAP_FLAGGED | — | CRITICAL |
| gp…02 | emp…bb | er…02 | 2011-04-01 | EXPLAINED | NOT_DUE | WARN |
| gp…03 | emp…cc | er…01 | 2003-07-01 | CLOSED_RECORDED | RECORDED_LATE | CRITICAL |

#### E23 — `sr_appeals` (grievance/appeal escalation) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `appeal_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `employee_id` | UUID FK→employees | N | Appellant subject |
| `target_event_id` | UUID FK→service_register_events | Y | Entry under appeal (if entry-specific) |
| `source_dispute_id` | UUID FK→sr_corrections | Y | The upheld dispute being appealed |
| `appeal_reason` | text | N | Grounds of appeal |
| `appellate_authority` | varchar(64) | Y | Assigned higher authority/tribunal |
| `workflow_instance_id` | UUID FK→workflow_instances | Y | `WF-M12-APPEAL` |
| `status` | enum | N | RAISED / UNDER_APPEAL / UPHELD / OVERTURNED / REMANDED / WITHDRAWN |
| `decision_text` | text | Y | Binding outcome |
| `resulting_correction_id` | UUID FK→sr_corrections | Y | Corrigendum spawned if overturned |
| `decided_by` | varchar(64) | Y | |
| `decided_at` | timestamptz | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Process entity |

Sample data:

| appeal_id | employee_id | target_event_id | status | appellate_authority | resulting_correction_id |
|---|---|---|---|---|---|
| ap…01 | emp…aa | sr…0030 | OVERTURNED | Director (Appeals) | cr…07 |
| ap…02 | emp…bb | sr…0211 | UNDER_APPEAL | State Admin Tribunal | — |
| ap…03 | emp…cc | sr…0145 | UPHELD | Director (Appeals) | — |

#### E24 — `sr_authenticity_certificates` (§65B / BSA certificate-of-authenticity) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `certificate_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `extract_id` | UUID FK→sr_certified_extracts | N | The extract this certificate authenticates |
| `certificate_no` | varchar(48) | N | Human-readable (unique) |
| `statute_reference` | varchar(80) | N | e.g., `Bharatiya Sakshya Adhiniyam 2023 s.63` / `IT Act 2000 s.65B` |
| `content_digest` | char(64) | N | Digest of the certified electronic record (matches extract `content_digest`) |
| `anchor_id` | UUID FK→sr_anchors | N | Anchor proving the record's tamper-evident state at issue |
| `signer_identity` | varchar(160) | N | Custodian + certificate serial |
| `signing_certificate_serial` | varchar(80) | N | |
| `tsa_timestamp_token` | bytea/text | N | RFC 3161 token at certificate issue |
| `chain_of_custody` | jsonb | N | Provenance, ingestion source, attestation lineage, system identity, operator |
| `system_description` | text | N | Statement of the computer system producing the record (statutory requirement) |
| `document_id` | UUID FK→documents | N | Signed certificate PDF in M13 |
| `issued_at` | timestamptz | N | |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| certificate_id | extract_id | certificate_no | statute_reference | anchor_id |
|---|---|---|---|---|
| ce…01 | ex…01 | SR-65B-2026-000451 | BSA 2023 s.63 / IT Act s.65B | an…02 |
| ce…02 | ex…02 | SR-65B-2026-000452 | BSA 2023 s.63 | an…02 |
| ce…03 | ex…04 | SR-65B-2026-000460 | BSA 2023 s.63 | an…03 |

#### E25 — `sr_ltv_renewals` (PAdES-LTV / RFC 4998 evidence-record renewal) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `renewal_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `subject_type` | enum | N | EXTRACT / ATTESTATION / ANCHOR |
| `subject_id` | UUID | N | FK to the renewed artefact |
| `renewal_kind` | enum | N | LTV_INITIAL / ARCHIVE_TIMESTAMP / ALGORITHM_MIGRATION / RE_ANCHOR |
| `prior_algorithm` | varchar(16) | Y | e.g., `SHA-256` |
| `new_algorithm` | varchar(16) | Y | e.g., `SHA-384` |
| `evidence_record_ref` | varchar(160) | N | RFC 4998 ERS reference / archive timestamp id |
| `tsa_timestamp_token` | bytea/text | N | Fresh RFC 3161 token at renewal |
| `new_anchor_id` | UUID FK→sr_anchors | Y | Anchor re-issued on RE_ANCHOR / migration |
| `triggered_by` | enum | N | SCHEDULE / CERT_EXPIRY / ALGO_DEPRECATION / MANUAL |
| `renewed_at` | timestamptz | N | |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| renewal_id | subject_type | renewal_kind | prior_algorithm | new_algorithm | triggered_by |
|---|---|---|---|---|---|
| rn…01 | EXTRACT | ARCHIVE_TIMESTAMP | SHA-256 | SHA-256 | SCHEDULE |
| rn…02 | ANCHOR | ALGORITHM_MIGRATION | SHA-256 | SHA-384 | ALGO_DEPRECATION |
| rn…03 | EXTRACT | LTV_INITIAL | — | SHA-256 | MANUAL |

#### E26 — `sr_bulk_corrigendum_batch` (cadre-wide / pay-commission bulk corrigendum) — **NEW v2**

| Field | Type | Null | Notes |
|---|---|---|---|
| `bulk_batch_id` | UUID PK | N | |
| `tenant_id` | UUID FK→tenants | N | |
| `batch_no` | varchar(40) | N | Human-readable (unique) |
| `trigger_reference` | varchar(160) | N | e.g., Pay Commission GO no., cadre re-fixation order |
| `reason_code` | varchar(48) | N | e.g., PAY_COMMISSION_REVISION, SENIORITY_REFIXATION, COURT_DIRECTION |
| `target_selector` | jsonb | N | Criteria selecting affected entries (cadre, category, date range) |
| `target_count` | int | N | Entries selected for corrigendum |
| `sample_size` | int | N | Number sampled for checker approval |
| `sample_approved_count` | int | N | Approved in sample |
| `status` | enum | N | DRAFT / PREVIEW / SAMPLING_APPROVAL / APPROVED / APPLYING / APPLIED / REJECTED |
| `workflow_instance_id` | UUID FK→workflow_instances | Y | `WF-M12-BULK-CORRIGENDUM` |
| `applied_count` | int | N | Corrigenda actually appended |
| `failed_count` | int | N | Entries that failed (logged per-entry) |
| `applied_at` | timestamptz | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Process entity |

Sample data:

| bulk_batch_id | batch_no | reason_code | target_count | sample_size | status |
|---|---|---|---|---|---|
| bc…01 | BULK-2026-PC7-001 | PAY_COMMISSION_REVISION | 14820 | 200 | APPLIED |
| bc…02 | BULK-2026-SEN-002 | SENIORITY_REFIXATION | 640 | 64 | SAMPLING_APPROVAL |
| bc…03 | BULK-2026-CRT-003 | COURT_DIRECTION | 38 | 38 | APPROVED |

### 5.3 Relationship map (v2 additions in **bold**)

```
employees (M01) 1───∞ service_register_events (E8)            [subject of every entry]
employees (M01) 1───∞ sr_verification_cycles (E12)
service_register_events 1───∞ sr_status_events (E19)          [NEW — append-only status chain per employee]
service_register_events 1───∞ sr_corrections (E10)            [target_event_id]
service_register_events 1───0..1 service_register_events       [supersedes / superseded_by — corrigendum chain]
service_register_events 1───0..1 service_register_events       [reverses_event_id — NEW reversal/cancellation]
service_register_events ∞───1 sr_event_type (E9)
service_register_events ∞───0..1 sr_ingestion_requests (E13)  [provenance + fact_key semantic dedup]
sr_expected_event_rule (E21) 1───∞ sr_gap_register (E22)      [NEW — completeness gaps]
sr_gap_register ∞───1 employees ; 0..1 service_register_events [resolved_event_id]
sr_anchors (E20) — periodic Merkle root over per-employee {content head, status head}   [NEW — root of trust]
sr_certified_extracts (E14) 1───0..1 sr_authenticity_certificates (E24)  [NEW §65B]
sr_certified_extracts ∞───0..1 sr_anchors                    [NEW — embedded anchor ref for offline verify]
sr_ltv_renewals (E25) ∞───1 {extract|attestation|anchor}     [NEW — longevity]
sr_appeals (E23) ∞───1 employees ; 0..1 sr_corrections        [NEW — grievance escalation]
sr_bulk_corrigendum_batch (E26) 1───∞ sr_corrections          [NEW — bulk corrigenda]
sr_certified_extracts ∞───1 employees ; 1───1 documents (M13); 1───1 sr_attestations
sr_access_log ∞───1 employees
sr_subscriptions — single authenticated pull-feed over service_register_events change feed
sr_legacy_digitisation_batch 1───∞ sr_legacy_digitisation_record (confidence-flagged)
service_register_events ∞───∞ documents (M13)
every write ───∞ audit_log (shared) ; notifications (shared)
```

The **content hash chain** is self-referential on E8 (per `(tenant_id, employee_id)`, ordered by `sequence_no`). The **status hash chain** is self-referential on E19 (per `(tenant_id, employee_id)`, ordered by `status_sequence_no`). The **anchor chain** (E20) binds periodic Merkle roots over both heads, RFC 3161-timestamped to independent WORM — the external root of trust.

### 5.4 Ownership / reuse matrix (v2 additions appended)

| Entity | Owner | Writers | Readers |
|---|---|---|---|
| `service_register_events` (E8) | **M12** | **M12 ingestion only** (source modules + manual + legacy); status projections via materialiser | M01..M14, Employee (self), Auditor |
| `sr_status_events` (E19) | M12 | M12 status-materialiser only (FR-03/05/06/07/08) | Auditor, Custodian, FR-04 verifier |
| `sr_anchors` (E20) | M12 | `JOB-M12-ANCHOR` only | Auditor, Custodian, FR-04, extract offline-verify |
| `sr_expected_event_rule` (E21) | M12 | Sys Admin (draft), Custodian (publish) | `JOB-M12-GAPSCAN` |
| `sr_gap_register` (E22) | M12 | `JOB-M12-GAPSCAN`, Custodian, Employee (corroborate) | Custodian, Employee, Auditor, M11 |
| `sr_appeals` (E23) | M12 | Employee/Heir (raise), Appellate Authority (decide) | Custodian, Auditor, Appellate Authority |
| `sr_authenticity_certificates` (E24) | M12 | Custodian (issue) | Courts, Auditor, Employee |
| `sr_ltv_renewals` (E25) | M12 | `JOB-M12-LTV`, Sys Admin (migration) | Auditor, Custodian |
| `sr_bulk_corrigendum_batch` (E26) | M12 | Custodian (maker), 2nd Custodian (sampling approve) | Custodian, Auditor |
| *(E9–E18 unchanged from v1 §5.4)* | M12 | per v1 | per v1 |

### 5.5 Enum & reference catalog (v2 — additions/changes in **bold**)

| Enum | Values |
|---|---|
| `event_category` | APPOINTMENT, CONFIRMATION, PROMOTION, TRANSFER, POSTING, PAY, INCREMENT, LEAVE, TRAINING, AWARD, PUNISHMENT, SUSPENSION, DEPUTATION, IDENTITY, QUALIFICATION, SEPARATION, OTHER |
| `entry_status` | ACTIVE, SUPERSEDED, ANNOTATED *(derived from `sr_status_events`)* |
| `attestation_status` | UNATTESTED, ATTESTED, EMPLOYEE_VERIFIED, DISPUTED *(derived from `sr_status_events`)* |
| **`confidence_status`** | **VERIFIED, RECONSTRUCTED, LEGACY_UNVERIFIABLE** |
| `qualifying_service_impact` | QUALIFYING, NON_QUALIFYING, PARTIAL, NOT_APPLICABLE |
| `correction_type` | CORRIGENDUM, ANNOTATION, DISPUTE, DISPUTE_RESOLUTION, **REVERSAL_CORRIGENDUM, BULK_CORRIGENDUM** |
| `correction.decision` | PENDING, APPROVED, REJECTED |
| `attestation_kind` | CUSTODIAN_ATTEST, EMPLOYEE_VERIFY, EMPLOYEE_DISPUTE, EXTRACT_SIGN, **HEIR_VERIFY, ASSISTED_VERIFY** |
| **`signature_method`** | **PKI_QUALIFIED (statutory), OTP_CONFIRMED (employee verify, with audit trail), SERVER_SIGNED (internal/provisional ONLY — banned for statutory outputs)** |
| `cycle_type` | PERIODIC_5YR, PRE_RETIREMENT, AD_HOC, **HEIR_VERIFICATION** |
| `cycle.status` | OPEN, EMPLOYEE_REVIEW, **BULK_REVIEW**, DISPUTED, CUSTODIAN_REVIEW, COMPLETED, OVERDUE, **ASSISTED, HEIR_PENDING** |
| `ingestion.validation_result` | ACCEPTED, REJECTED, DUPLICATE_NOOP, **SEMANTIC_DUPLICATE_NOOP, SEMANTIC_CONFLICT** |
| **`status_event.transition_kind`** | **ENTRY_STATUS, ATTESTATION_STATUS, SUPERSESSION** |
| **`gap_status`** | **GAP_FLAGGED, UNDER_REVIEW, EXPLAINED, CLOSED_RECORDED, CLOSED_FALSE_POSITIVE** |
| **`appeal.status`** | **RAISED, UNDER_APPEAL, UPHELD, OVERTURNED, REMANDED, WITHDRAWN** |
| **`ltv.renewal_kind`** | **LTV_INITIAL, ARCHIVE_TIMESTAMP, ALGORITHM_MIGRATION, RE_ANCHOR** |
| **`bulk_corrigendum.status`** | **DRAFT, PREVIEW, SAMPLING_APPROVAL, APPROVED, APPLYING, APPLIED, REJECTED** |
| `extract.scope` | FULL_SR, DATE_RANGE, EVENT_CATEGORY, SINGLE_EVENT |
| **`extract.redaction_policy`** | **NONE, LOAN_EXCLUDE_DISCIPLINARY, PUBLIC_MINIMAL, PENSION_FULL, COURT_FULL** |
| `access.action` | VIEW_TIMELINE, VIEW_EVENT, PRINT, EXPORT, ISSUE_EXTRACT, VERIFY_INTEGRITY, **VERIFY_ANCHOR, GENERATE_65B** |
| **`subscription.delivery_mode`** | **PULL_FEED (launch). WEBHOOK, MESSAGE_BUS — DEFERRED behind a documented real-time requirement (FR-13)** |
| `subscription.status` | ACTIVE, PAUSED, RETIRED |
| `batch.status` | CREATED, SCANNING, DATA_ENTRY, DUAL_VERIFICATION, RECONCILIATION, READY_FOR_PROMOTION, PROMOTED, REJECTED |
| `record.match_status` | UNMATCHED, MATCHED, AMBIGUOUS |
| `record.verification_status` | PENDING, VERIFIED, DISCREPANCY |
| **`record.corroboration_status`** | **NOT_REQUIRED, PENDING_EMPLOYEE, CORROBORATED, UNCORROBORATED** |
| **`chain_origin`** | **GENESIS, CONTINUED** |
| `event_type.status` | DRAFT, PUBLISHED, RETIRED |
| `source_module` | M01..M14, M12_MANUAL, M12_LEGACY |

### 5.6 Data integrity rules (v2 — additions/changes in **bold**)

1. **Append-only ledger on a trusted substrate.** No `UPDATE` of content fields of `service_register_events`; no `DELETE`. Enforced by DB row-rule/trigger **on a WORM/append-only substrate with the write principal segregated from any recompute-capable principal**. Status-bearing fields are **derived projections written only by the status-materialiser** in the same transaction as the corresponding `sr_status_events` append; they remain **excluded** from `entry_hash`.
2. **Monotonic sequence.** `sequence_no` is unique and gap-free per `(tenant_id, employee_id)` under a per-employee advisory lock; the content chain is scoped to the same key. **On cross-tenant/org transfer the chain CONTINUES (does not fork): the first entry in the new scope has `chain_origin=CONTINUED` and `prior_chain_head_hash` = prior scope's content head, preserving an unbroken link (FR-15).**
3. **Content hash chain.** `prev_event_hash` of entry *n* equals `entry_hash` of entry *n-1* (`GENESIS` for a GENESIS-origin first entry; `prior_chain_head_hash` for a CONTINUED first entry). `entry_hash = SHA-256(canonical(content) || prev_event_hash)`. Any recomputed mismatch is a tamper alarm.
4. **Status hash chain (NEW).** Every status/supersession/attestation transition is an append-only `sr_status_events` row with `status_hash = SHA-256(canonical(status content) || prev_status_hash)`; the projected pointers on E8 must equal the latest status-chain value. FR-04 verifies the status chain alongside the content chain; **a status-chain break or a projection mismatch is a tamper alarm**.
5. **Mandatory external anchor (NEW).** `JOB-M12-ANCHOR` periodically computes a Merkle root over all `(employee → content head, status head)` leaves, obtains an RFC 3161 timestamp, and writes it to independent WORM (`sr_anchors`). **A current anchor MUST exist within the configured cadence; FR-04 compares live chain heads to the latest anchor and a mismatch is a non-suppressible FAIL.**
6. **Trusted time (NEW).** Each ledger commit and each anchor stores an RFC 3161 timestamp token; `recorded_at` is corroborated by the token. NTP alone is not accepted as commit time for statutory purposes.
7. **Idempotent + semantic dedup (AMENDED).** `(source_module, source_reference_id, source_event_version)` is unique (syntactic). **Additionally, for qualifying-service-bearing types, `fact_key` enforces per-fact uniqueness across modules: a second module reporting the same `fact_key` yields `SEMANTIC_DUPLICATE_NOOP` (no second entry) or `SEMANTIC_CONFLICT` (flagged for reconciliation), preventing double-counting (R10).**
8. **Payload validity / provenance / order & document mandates** — as v1 (`SR_PAYLOAD_INVALID`, `SR_SOURCE_NOT_ALLOWED`, order/doc mandates).
9. **Correction discipline.** A CORRIGENDUM creates a new ACTIVE entry and records a SUPERSESSION transition in `sr_status_events`; the original is preserved forever and superseded at most once (chain forward). **A REVERSAL/CANCELLATION ingestion event referencing the original `source_reference_id` auto-spawns the corrigendum/supersession workflow (R13).**
10. **Identity events.** IDENTITY-category events (name/DOB/gender) require `order_no`, supporting document, maker-checker; DOB changes require dual custodian sign-off; validated with `VAL-DOB`/`VAL-AADHAAR`/`VAL-PAN`; PII Protection Ceiling applies.
11. **Attestation gating + qualified signature (AMENDED).** An entry with `attestation_required=true` cannot be in a COMPLETED cycle or FULL_SR extract unless `attestation_status ∈ {ATTESTED, EMPLOYEE_VERIFIED}` (or explicitly annotated `LEGACY_UNVERIFIABLE`). **Statutory attestations/extracts MUST use a qualified e-signature (PKI_QUALIFIED); SERVER_SIGNED is rejected for statutory outputs.**
12. **Separation of duties (NEW).** Routine corrigenda and FULL_SR extract issuance require a **second custodian / independent reviewer** distinct from the maker (runtime maker≠checker≠second-custodian).
13. **Completeness reconciliation (NEW).** `JOB-M12-GAPSCAN` evaluates `sr_expected_event_rule` against recorded events and raises `sr_gap_register` findings; a CRITICAL (pension-affecting) gap blocks pre-retirement cycle completion (FR-08) until EXPLAINED or CLOSED.
14. **Extract binding & redaction (AMENDED).** `content_digest` binds the exact rendered content; **`redaction_policy` is applied by the P02 field-mask before digest computation; a redacted extract's digest covers the redacted rendering.** A live dispute/appeal on an included entry must be visible on the extract (no clean extract over a live dispute).
15. **Access logging (fail-closed).** Every read/print/export/extract/anchor-verify path writes `sr_access_log`; non-self access requires a stated `purpose`; a read fails if it cannot be logged.
16. **Referential integrity** — `employee_id` in M01; `document_ids` in M13; FK constraints enforced.
17. **Permanent retention + DPDP lawful basis (AMENDED).** No SR ledger/status/attestation/correction/access-log/anchor row is ever purged. Retention rests on the **legal-obligation lawful basis (DPDP §17)**; a data-principal correction maps to the corrigendum flow, never to erasure.
18. **DR anchor reconciliation (NEW).** After any restore, restored chain heads are compared to the latest external anchor; a stale restore (heads predating a known anchor) is a gated failure requiring re-application of missing corrigenda (FR-04/§13.2).

---

## Section 6 — Functional Requirements

> Each FR follows: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table. v2 adds FR-17–FR-21 and amends FR-02/03/04/05/06/08/10/11/13/14/15. FRs FR-01/07/09/12/16 are functionally unchanged (full structure retained).

### FR-01 — SR event taxonomy & payload schemas (governed, versioned) — *amended v2 (cadence + fact-correlation rules)*

- **ID:** FR-01
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (draft), SR Custodian (publish)
- **User Story:** *As an SR Custodian, I want a versioned, effective-dated catalog of every recordable service event type — with payload schema, provenance rules, expected-cadence hints, and fact-correlation rules — so that ingestion is deterministic, complete-checkable, and de-duplicable without code deployment.*

**Description.** The taxonomy (`sr_event_type`) defines each recordable life event with a JSON-Schema `payload_schema`, `allowed_source_modules` allowlist, order/document mandates, default qualifying-service impact, and attestation requirement. **v2 adds** `expected_cadence` (consumed by the completeness model FR-17), `fact_correlation_rule` (how `fact_key` is derived and which modules may report the same fact, FR-02 semantic dedup), and `supports_reversal` (whether a `*_CANCELLED`/`*_REVERSAL` partner type exists, FR-02/FR-05). Versions are immutable once PUBLISHED; changes create a new version. Maker (Sys Admin) drafts; checker (SR Custodian) publishes.

**Acceptance Criteria.**
1. A DRAFT type can be created/edited/deleted; a PUBLISHED type cannot be edited (only superseded by a new version or RETIRED).
2. Publishing requires SR Custodian approval (maker ≠ checker) and writes to `audit_log`.
3. No two PUBLISHED versions of the same `event_type_code` may have overlapping effective ranges (`SR_TYPE_OVERLAP`).
4. The catalog covers all 17 `event_category` values with at least one published type each at launch; **identity/reversal partner types are present for every reversible category**.
5. Ingestion resolves the type version effective at `event_date`; if none, rejects with `SR_TYPE_NOT_FOUND`.
6. **v2:** a type may declare `expected_cadence` and `fact_correlation_rule`; both are schema-validated at publish.

**Business Rules.**
- BR-01.1 `payload_schema` is valid JSON Schema; ingestion validates `payload`.
- BR-01.2 IDENTITY types set `is_identity_event=true` (extra controls FR-05/06).
- BR-01.3 `default_qualifying_impact` seeds the entry's `qualifying_service_impact` unless source overrides per a published rule.
- **BR-01.4 (v2)** `fact_correlation_rule` must name a deterministic key derivation; qualifying-service-bearing types MUST declare one (so semantic dedup can run).
- **BR-01.5 (v2)** `expected_cadence` references published `sr_expected_event_rule` codes; cadence without a backing rule is rejected.

**Data Model References.** `sr_event_type` (write), `sr_expected_event_rule` (ref), `audit_log`, `workflow_instances`.

**API References.** `POST /api/v1/sr/event-types` (create DRAFT); `POST /api/v1/sr/event-types/{code}/publish` (checker); `GET /api/v1/sr/event-types` (list/resolve, paginated).

**UI Behavior Notes.** Custodian console "Taxonomy" tab: list with status badges, JSON schema editor with validation, effective-date pickers, **cadence + correlation-rule editors**, publish gated to custodian, version diff view.

**Edge Cases.** Editing PUBLISHED → blocked (offer new version); overlapping ranges → `SR_TYPE_OVERLAP`; retiring a type still referenced → allowed (entries keep version pointer); **cadence referencing a retired rule → publish blocked.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `EventTypeService`, `JsonSchemaValidator`, `CadenceRuleValidator`, `EventTypeRepository` |
| Backend flow | Draft → maker submit → custodian approve → effective-range + cadence + correlation validation → publish |
| Data operations | INSERT/UPDATE DRAFT; INSERT new version on publish; SELECT effective version |
| Validation | Valid JSON Schema; non-overlapping ranges; category coverage; cadence/correlation backing |
| Authorization | `sr.taxonomy.draft` (admin), `sr.taxonomy.publish` (custodian) |
| State changes | DRAFT→PUBLISHED→RETIRED; audit_log append |
| Failure handling | Reject overlap/invalid; preserve DRAFT on failure |
| Dependencies | Workflow engine; FR-17 rules |
| Test guidance | Schema validation; publish maker-checker; no-overlap invariant; cadence backing |

---

### FR-02 — Governed ingestion contract / API (idempotent, **semantically deduplicated**, versioned, validated, provenance-stamped, **reversible**) — *amended v2*

- **ID:** FR-02
- **Module:** M12-SR
- **Primary Role(s):** Source Module (service principal), SR Custodian (manual ingestion)
- **User Story:** *As a source module, I want a single versioned idempotent API to post a service event (or a reversal of a quashed one) with provenance and a semantic fact key, so the statutory fact is recorded exactly once, validated, traceable, and never double-counted with another module's posting.*

**Description.** The ingestion contract (`POST /api/v1/sr/ingest`) is the **only** write path to the ledger. It accepts the v1 payload plus **v2 additions**: a `fact_key` (semantic per-fact correlation key) and a reversal envelope (`is_reversal`, `reverses_source_reference_id`). It validates provenance allowlist, payload schema, mandates, employee existence, performs **syntactic dedup** `(source_module, source_reference_id, source_event_version)` **and semantic dedup** on `fact_key`, then delegates to the append engine (FR-03). A reversal/cancellation event referencing a prior `source_reference_id` **auto-spawns the corrigendum/supersession workflow (FR-05)** instead of forcing manual re-entry. Every call is recorded in `sr_ingestion_requests` (ACCEPTED / REJECTED / DUPLICATE_NOOP / SEMANTIC_DUPLICATE_NOOP / SEMANTIC_CONFLICT).

**Acceptance Criteria.**
1. A first-time valid request creates exactly one ledger entry and returns its `sr_event_id`.
2. A repeat with the same syntactic key returns the original `sr_event_id` and records `DUPLICATE_NOOP`.
3. **v2:** a different syntactic key but matching `fact_key` for a qualifying-service-bearing fact records `SEMANTIC_DUPLICATE_NOOP` (no second entry) or, if facts disagree, `SEMANTIC_CONFLICT` (no entry; flagged for reconciliation, alerts custodian).
4. Invalid payload/provenance/missing-mandate rejects with a specific M12 code and records REJECTED; no entry created.
5. **v2:** a reversal event referencing an existing `source_reference_id` spawns a corrigendum workflow (FR-05) and is recorded; a reversal referencing an unknown reference rejects `SR_REVERSAL_TARGET_NOT_FOUND`.
6. Only principals with `sr.ingest.write` may call; module principals cannot read other employees' SR.

**Business Rules.**
- BR-02.1 `source_module` must be in the type's `allowed_source_modules`.
- BR-02.2 Manual custodian ingestion uses `source_module=M12_MANUAL` + maker-checker.
- BR-02.3 `event_date` may be back-dated but not beyond a configurable future tolerance (`SR_FUTURE_DATE`).
- BR-02.4 The contract is versioned with published sunset windows.
- **BR-02.5 (v2)** `fact_key` is derived per the type's `fact_correlation_rule`; for qualifying-service-bearing types it is mandatory (`SR_FACT_KEY_REQUIRED`).
- **BR-02.6 (v2)** A `SEMANTIC_CONFLICT` is never silently dropped; it creates a reconciliation task and notifies the custodian.

**Data Model References.** `sr_ingestion_requests` (write, incl. `fact_key`/`semantic_dedup_result`), `service_register_events` (append via FR-03), `sr_event_type`, `employees` (M01), `documents` (M13), `sr_corrections` (reversal spawn).

**API References.** `POST /api/v1/sr/ingest`; `POST /api/v1/sr/ingest/reversal`; `GET /api/v1/sr/ingest/{ingestion_request_id}`.

**UI Behavior Notes.** No end-user UI for machine ingestion. Manual ingestion is a custodian console form with type-driven dynamic fields, order/document fields, **a semantic-conflict resolution panel**, and maker-checker submit.

**Edge Cases.** At-least-once duplicate → DUPLICATE_NOOP; type not found for date → `SR_TYPE_NOT_FOUND`; employee not in M01 → `SR_EMPLOYEE_NOT_FOUND`; M01/M13 partial outage → `UPSTREAM_UNAVAILABLE` (retry-safe); **two modules post the same posting → second is SEMANTIC_DUPLICATE_NOOP**; **reversal of an already-superseded entry → resolves to latest ACTIVE successor.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IngestionController`, `IngestionValidator`, `ProvenanceGuard`, `SemanticDedupService`, `ReversalRouter`, `AppendEngine` (FR-03), `IngestionRepository` |
| Backend flow | Auth → resolve type version → validate payload/provenance/mandates → existence checks → syntactic dedup → **semantic dedup on `fact_key`** → (reversal? spawn FR-05) → append → record ingestion |
| Data operations | INSERT `sr_ingestion_requests`; INSERT `service_register_events` (FR-03) in one tx |
| Validation | Schema, allowlist, mandates, future-date, employee/doc existence, fact_key presence |
| Authorization | `sr.ingest.write`; manual also maker-checker |
| State changes | New entry; ingestion record; pull-feed event (FR-13); audit_log; possible reconciliation task |
| Failure handling | Validation→REJECTED; upstream→503; syntactic dup→DUPLICATE_NOOP; semantic dup→SEMANTIC_DUPLICATE_NOOP; semantic conflict→flagged |
| Dependencies | FR-01, FR-03, FR-05 (reversal), M01, M13 |
| Test guidance | Concurrent identical requests; per-code rejection; **two-module same-fact dedup**; reversal spawns corrigendum; back-dating tolerance |

---

### FR-03 — Append-only hash-chained ledger write **+ status sub-ledger** — *amended v2*

- **ID:** FR-03
- **Module:** M12-SR
- **Primary Role(s):** System (append engine), SR Custodian (observe)
- **User Story:** *As the HRMS, when an event is ingested, I want it appended to the employee's immutable, hash-chained ledger with a gap-free sequence and an RFC 3161 trusted timestamp, and I want every status change recorded on a parallel hash-chained status sub-ledger, so neither the fact nor its legally-operative status can be silently altered.*

**Description.** The append engine assigns the next `sequence_no` under a per-employee lock, canonicalises content, sets `prev_event_hash` (or `prior_chain_head_hash` for a CONTINUED chain), computes `entry_hash`, **obtains an RFC 3161 timestamp token over `entry_hash`**, and commits the row to the **WORM/append-only substrate**. **v2:** any status/supersession/attestation transition is written as an append-only, hash-chained `sr_status_events` row by the status-materialiser, which also refreshes the read-only projection on E8 — both in one transaction. Content is immutable post-commit; the content `entry_hash` excludes mutable status; the status chain carries status tamper-evidence.

**Acceptance Criteria.**
1. `sequence_no` is unique and gap-free per employee; concurrent appends serialise (no duplicate sequence).
2. `prev_event_hash` chains correctly; GENESIS for first GENESIS-origin entry; `prior_chain_head_hash` for CONTINUED.
3. `entry_hash` is reproducible from stored content + algorithm + ledger_version.
4. No code path can UPDATE content fields or DELETE a row (DB rule + substrate).
5. The hashed content excludes mutable status pointers.
6. **v2:** every status change creates exactly one `sr_status_events` row with a valid `status_hash`; the E8 projection equals the latest status-chain value.
7. **v2:** each committed entry carries a verifiable RFC 3161 timestamp token.

**Business Rules.**
- BR-03.1 Canonicalisation is deterministic and versioned via `ledger_version` (§16.1).
- BR-03.2 `hash_algorithm` stored per row (crypto-agility; migration re-anchors, never rewrites — FR-19).
- BR-03.3 Append happens in the same DB transaction as the ingestion record (FR-02).
- **BR-03.4 (v2)** The status-materialiser is the **only** writer of E8 status projections; business code never UPDATEs them directly.
- **BR-03.5 (v2)** TSA round-trip is inside the P95 < 400ms ingestion budget; on TSA timeout the entry commits with a deferred-timestamp flag and a retry job stamps it (never blocks the statutory record indefinitely; deferred state alarmed).

**Data Model References.** `service_register_events` (append), `sr_status_events` (append, NEW), `sr_ingestion_requests` (link).

**API References.** (internal) `AppendEngine.append()`; `StatusLedger.recordTransition()` — invoked by FR-02/05/06/07/08/14/20.

**UI Behavior Notes.** None directly; entries surface in the timeline (FR-09) with content-integrity and status-integrity badges.

**Edge Cases.** Concurrent appends → advisory lock serialises; SHA-256 collision (practically impossible) → documented; back-dated event appended at chain end (order = recording order); **TSA unavailable → deferred-timestamp + retry, alarmed; CONTINUED chain first entry binds prior scope head.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AppendEngine`, `Canonicalizer`, `HashChainService`, `StatusLedger` (NEW), `TsaClient` (NEW), `LedgerRepository` |
| Backend flow | Lock(employee) → next seq → fetch prior head → canonicalize → hash → TSA stamp → INSERT content row → (on status change) INSERT status row + refresh projection → release |
| Data operations | SELECT max(seq) FOR UPDATE; INSERT content row; INSERT status row; UPDATE projection (materialiser only) |
| Validation | Required fields; FK valid; hash computed; status-chain continuity |
| Authorization | Internal only |
| State changes | New ACTIVE entry; content chain extended; status chain extended; integrity metric |
| Failure handling | Tx rollback discards entry+ingestion+status; lock timeout→503; TSA timeout→deferred-stamp |
| Dependencies | PostgreSQL advisory locks; TSA; WORM substrate; FR-02 |
| Test guidance | 1000 parallel appends gap-free; content+status chain continuity; immutability (UPDATE/DELETE blocked); projection==status-chain head; TSA-deferral path |

---

### FR-04 — Ledger integrity verification **(content chain + status chain + mandatory anchor)** — *amended v2*

- **ID:** FR-04
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian, Auditor, System (scheduler)
- **User Story:** *As an Auditor, I want to recompute and verify both the content and status hash chains and to compare chain heads against the mandatory external anchor, so that tampering — including a privileged-insider rewrite or a stale restore — is detected and pinpointed.*

**Description.** Verification recomputes `entry_hash` and `prev_event_hash` linkage across an employee's content chain **and `status_hash` linkage across the status chain**, and **compares the live chain heads to the latest `sr_anchors` Merkle root** (verifying the anchor's RFC 3161 timestamp). It reports PASS or the exact divergent sequence. Scheduled sweeps (`JOB-M12-INTEGRITY`) run nightly over a rotating population; `JOB-M12-ANCHOR` produces anchors on cadence. A head-vs-anchor mismatch — the signature of an insider rewrite or stale restore — is a **non-suppressible FAIL**.

**Acceptance Criteria.**
1. On-demand verification returns PASS with verified counts, or FAIL with the first divergent `sequence_no`/`status_sequence_no` and expected vs. stored hash.
2. Scheduled sweeps cover 100% of the register over a configurable rolling window and alert on any FAIL.
3. Verification is read-only.
4. **v2:** the status chain is verified alongside the content chain; a status-chain break or projection mismatch is a FAIL.
5. **v2:** chain heads are compared to the latest anchor; **a head-vs-anchor mismatch (or a missing current anchor beyond cadence) is a non-suppressible FAIL** and opens a forensics case (FR-16).
6. **v2 (DR):** a post-restore verification compares restored heads to the external anchor; a stale restore is a gated failure (§13.2).
7. Results recorded with timestamp, scope, verifier, outcome.

**Business Rules.**
- BR-04.1 Verification uses per-row `hash_algorithm`/`ledger_version` for correct recomputation across migrations.
- BR-04.2 **(v2)** The anchor comparison is mandatory, not optional; anchor-store unavailability beyond a grace window is itself a FAIL (not SKIPPED).
- BR-04.3 Auditor and Custodian may trigger; no one may suppress a FAIL.
- **BR-04.4 (v2)** A FAIL distinguishes cause: CONTENT_CHAIN / STATUS_CHAIN / ANCHOR_MISMATCH / STALE_RESTORE, routing the right remediation.

**Data Model References.** `service_register_events` (read), `sr_status_events` (read), `sr_anchors` (read/compare), `audit_log`, `notifications`.

**API References.** `POST /api/v1/sr/integrity/verify`; `POST /api/v1/sr/integrity/verify-anchor`; `GET /api/v1/sr/integrity/runs`; `GET /api/v1/sr/anchors` (auditor).

**UI Behavior Notes.** Forensics view shows content + status + anchor integrity banners; FAIL drills to the divergent entry/transition with expected/stored hashes and the anchor it diverges from.

**Edge Cases.** Mixed `hash_algorithm` rows verified each with its own algorithm; legacy `ledger_version` verified under its canonicalisation; **anchor store down within grace → marked PENDING; beyond grace → FAIL; stale restore → STALE_RESTORE FAIL with the missing-corrigendum list.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IntegrityVerifier`, `StatusChainVerifier` (NEW), `AnchorClient` (NEW), `AlertService` |
| Backend flow | Load content chain → recompute → load status chain → recompute → compare heads to latest anchor → verify anchor TSA → first-divergence report → alert if FAIL |
| Data operations | SELECT content+status chains; SELECT anchor; INSERT audit; INSERT notification on FAIL |
| Validation | Recompute equality; linkage continuity (both chains); projection==status head; anchor match; anchor TSA valid |
| Authorization | `sr.integrity.verify` (custodian/auditor) |
| State changes | None to ledger; metric + possible alert + forensics case |
| Failure handling | Partial sweep → resume cursor; FAIL cannot be suppressed; anchor-down beyond grace → FAIL |
| Dependencies | FR-03 hashing; `sr_anchors`; TSA |
| Test guidance | Inject tampered content/status row → FAIL at correct seq; **insider full-chain rewrite caught by anchor mismatch**; stale restore caught; mixed-algorithm correctness; load-tested full-population sweep within window |

---

### FR-05 — Correction handling (corrigendum / supersession — never delete) — *amended v2 (reversal-driven; status sub-ledger)*

- **ID:** FR-05
- **Module:** M12-SR
- **Primary Role(s):** HR Officer (maker), SR Custodian (checker), Second Custodian (co-sign)
- **User Story:** *As an SR Custodian, when an entry is wrong (data-entry error, revised order, court direction, or a quashed source order), I want to issue a corrigendum that supersedes the original while preserving it forever, with a second custodian co-signing routine corrections, so the record is corrected without ever destroying history or resting on one person.*

**Description.** A correction never edits or deletes the original. A CORRIGENDUM creates a new ledger entry (FR-03) capturing corrected facts, links it via `sr_corrections` and a **SUPERSESSION transition in `sr_status_events`** (which sets the original's projected `entry_status=SUPERSEDED`). Maker proposes with `reason_code` + justification + documents; SR Custodian approves; **routine corrigenda additionally require a second custodian co-sign (separation of duties, R6)**. **v2:** a source-driven **REVERSAL/CANCELLATION** ingestion event (FR-02) auto-spawns this workflow as a `REVERSAL_CORRIGENDUM`.

**Acceptance Criteria.**
1. A corrigendum creates a new ACTIVE entry and records a SUPERSESSION transition; the original projects to SUPERSEDED with `superseded_by_event_id`.
2. The original remains readable, hash-valid, never deleted/edited.
3. Correction requires maker-checker; **routine corrigenda require a distinct second custodian co-sign**; maker cannot self-approve.
4. `reason_code`, free-text reason, and (for IDENTITY) a supporting document are mandatory.
5. The corrigendum payload is schema-validated exactly as ingestion.
6. **v2:** a reversal-driven corrigendum cites the originating `reverses_event_id` and source reference.

**Business Rules.**
- BR-05.1 An entry is superseded at most once; further correction supersedes the latest ACTIVE entry.
- BR-05.2 DOB/name corrigenda require dual custodian sign-off + govt order/court reference (`WF-M12-IDENTITY-CHANGE`); PII ceiling applies.
- BR-05.3 Correcting a qualifying-service impact re-emits to the pull-feed (FR-13) so M11 re-reads.
- **BR-05.4 (v2)** Separation-of-duties: maker ≠ checker ≠ second custodian for routine corrigenda (`WF-M12-CORRIGENDUM`).
- **BR-05.5 (v2)** Cadre-wide/pay-commission corrections route to the **bulk-corrigendum** workflow (FR-20), not one-by-one.

**Data Model References.** `sr_corrections`, `service_register_events` (append corrigendum), `sr_status_events` (SUPERSESSION), `workflow_instances`, `documents` (M13).

**API References.** `POST /api/v1/sr/events/{id}/corrigendum` (maker); `POST /api/v1/sr/corrections/{id}/approve` (checker); `POST /api/v1/sr/corrections/{id}/cosign` (second custodian).

**UI Behavior Notes.** Timeline entry shows "Superseded" badge linking to corrigendum; corrigendum shows "Corrects entry #N"; form pre-fills original values, requires reason/evidence; **co-sign step for routine corrigenda**.

**Edge Cases.** Correct an already-SUPERSEDED entry → redirect to latest ACTIVE successor; reject at checker → no ledger change, correction REJECTED; corrigendum on legacy entry → allowed, provenance marked; **reversal of unknown source ref → `SR_REVERSAL_TARGET_NOT_FOUND`.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CorrectionService`, `AppendEngine`, `StatusLedger`, `WorkflowAdapter` → P01 (`WF-M12-CORRIGENDUM`/`WF-M12-IDENTITY-CHANGE`), `SoDGuard` (NEW) |
| Backend flow | Maker submit → workflow → checker approve → second-custodian co-sign → append corrigendum → SUPERSESSION transition → notify subscribers |
| Data operations | INSERT `sr_corrections`; INSERT corrigendum entry; INSERT status transition |
| Validation | Reason/evidence; payload schema; single-supersession; identity dual sign-off; SoD distinctness |
| Authorization | maker `sr.correction.create`; checker `sr.correction.approve`; co-sign `sr.correction.cosign` |
| State changes | Original→SUPERSEDED (via status chain); new ACTIVE entry; pull-feed re-emit; audit_log |
| Failure handling | Reject → no ledger mutation; concurrency → re-resolve latest active |
| Dependencies | FR-03, workflow engine, FR-13, FR-02 (reversal), FR-20 (bulk) |
| Test guidance | Supersession via status chain; original immutability; identity dual sign-off; SoD enforced; reject path; reversal spawn |

---

### FR-06 — Annotation, dispute **& appeal-hook** entries — *amended v2*

- **ID:** FR-06
- **Module:** M12-SR
- **Primary Role(s):** Employee/Heir (dispute), HR Officer / SR Custodian (annotation/resolution), Appellate Authority (via FR-21)
- **User Story:** *As an employee, I want to dispute an entry I believe is wrong, and — if the custodian merely upholds it — to escalate to an independent appeal, so that a contested fact is never the final word of a single custodian.*

**Description.** Annotations attach statutory/contextual notes (`entry_status=ANNOTATED` via status chain) without changing the fact. Disputes let an employee (or heir) formally object; the custodian resolves with DISPUTE_RESOLUTION (UPHELD or CORRIGENDUM_ISSUED). **v2:** an UPHELD dispute is **appealable** to an independent Appellate Authority (FR-21); contested/disputed status is **visible on certified extracts** (no clean extract over a live dispute, R6). All are append-only `sr_corrections` rows; status transitions go through `sr_status_events`.

**Acceptance Criteria.**
1. An employee/heir can raise a DISPUTE on any ACTIVE entry of the in-scope SR with a reason; `attestation_status` → DISPUTED via status chain.
2. A custodian can ANNOTATE any entry (`entry_status` → ANNOTATED; content unchanged).
3. Dispute resolution records outcome (UPHELD / CORRIGENDUM_ISSUED) and notifies the disputant.
4. Annotations/disputes never modify original content or `entry_hash`.
5. Open disputes surface to the custodian queue and count in the verification cycle (FR-08).
6. **v2:** an UPHELD dispute exposes an "Appeal" action (FR-21); a live dispute/appeal renders on any extract that includes the entry.

**Business Rules.**
- BR-06.1 An entry may carry multiple annotations + a dispute history; all preserved.
- BR-06.2 A DISPUTED entry cannot be EMPLOYEE_VERIFIED until resolved.
- BR-06.3 Resolution by corrigendum reuses FR-05.
- **BR-06.4 (v2)** Appeal is available only after a custodian UPHELD; an OVERTURNED appeal spawns a corrigendum (FR-05/FR-21).

**Data Model References.** `sr_corrections`, `service_register_events` (status pointer via chain), `sr_status_events`, `sr_appeals` (FR-21), `notifications`.

**API References.** `POST /api/v1/sr/events/{id}/dispute`; `POST /api/v1/sr/events/{id}/annotate`; `POST /api/v1/sr/disputes/{id}/resolve`; `POST /api/v1/sr/disputes/{id}/appeal` (→ FR-21).

**UI Behavior Notes.** Timeline shows annotation chips and a "Disputed"/"Under appeal" badge; employee "Raise objection" and, after uphold, "Appeal" actions; custodian dispute queue with resolve dialog.

**Edge Cases.** Dispute an already-superseded entry → blocked, point to active successor; resolution requiring corrigendum → spawns FR-05; annotation by non-custodian → forbidden; **appeal before any uphold → blocked (`SR_APPEAL_NOT_ELIGIBLE`).**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AnnotationService`, `DisputeService`, `CorrectionService`, `AppealAdapter` (FR-21) |
| Backend flow | Raise/annotate → status transition → notify → (resolution) uphold or corrigendum → (uphold) enable appeal |
| Data operations | INSERT `sr_corrections`; INSERT status transition |
| Validation | Self/heir-only dispute; active-entry only; reason mandatory; appeal eligibility |
| Authorization | Employee/heir `sr.dispute.create`; custodian `sr.annotate`/`sr.dispute.resolve` |
| State changes | Status transition; notifications; possible FR-05/FR-21 spawn |
| Failure handling | Invalid target → 409; resolution race → idempotent |
| Dependencies | FR-05, FR-21, notifications |
| Test guidance | Dispute lifecycle; annotation immutability; verified-block-while-disputed; appeal eligibility gate; disputed visible on extract |

---

### FR-07 — Custodian attestation of entries **(qualified signature + trusted timestamp)** — *amended v2*

- **ID:** FR-07
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian
- **User Story:** *As an SR Custodian, I want to attest entries (singly or in batches) with my qualified digital signature and an RFC 3161 trusted timestamp, so the register carries legally non-repudiable proof that the responsible authority verified each fact.*

**Description.** Attestation records a custodian's signed confirmation. It computes a `signed_digest` over the entry snapshot, captures a **qualified PKI signature (mandatory for statutory attestation)** and an **RFC 3161 timestamp token**, and records an ATTESTATION_STATUS transition (`ATTESTED`) in the status chain. Batch attestation processes each entry to a discrete `sr_attestations` row. **v2:** `SERVER_SIGNED` is rejected for statutory attestation; if PKI is unavailable the attestation cannot be marked statutory — it is queued, alarmed, and surfaced as a backlog, never silently downgraded.

**Acceptance Criteria.**
1. Attesting an entry creates an `sr_attestations` row (CUSTODIAN_ATTEST) with a qualified signature + timestamp token and records an ATTESTED status transition.
2. A DISPUTED entry cannot be attested until resolved (`SR_ENTRY_DISPUTED`).
3. The signature binds exact entry content (`signed_digest`); later supersession does not invalidate the historical attestation.
4. Batch attestation isolates per-row failures.
5. Only the SR Custodian may attest; logged.
6. **v2:** statutory attestation requires `PKI_QUALIFIED`; a server-signed attempt is rejected (`SR_SIGNATURE_NOT_QUALIFIED`).

**Business Rules.**
- BR-07.1 Types with `attestation_required=true` must be attested before inclusion in extracts/verification.
- BR-07.2 **(v2, replaces v1)** Server-signed attestation is **not** a valid statutory attestation; PKI unavailability creates a backlog item, not a downgrade.
- BR-07.3 Re-attestation after a corrigendum attests the new ACTIVE entry.
- **BR-07.4 (v2)** Each attestation is LTV-eligible (FR-19) and gets an archive timestamp before cert expiry.

**Data Model References.** `sr_attestations` (incl. timestamp token), `service_register_events` (status via chain), `sr_status_events`, `audit_log`.

**API References.** `POST /api/v1/sr/events/{id}/attest`; `POST /api/v1/sr/attestations/batch`.

**UI Behavior Notes.** Custodian "Attestation queue": filter UNATTESTED, multi-select, **qualified-signature (PKI) step**, progress + per-row outcome; PKI-unavailable shows a clear backlog state (not a silent fallback).

**Edge Cases.** PKI device unavailable → entry stays UNATTESTED with backlog flag + alert (no server-sign); entry superseded mid-batch → skipped; disputed entry in batch → skipped (`SR_ENTRY_DISPUTED`).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AttestationService`, `QualifiedSignatureProvider` (PKI/HSM), `TsaClient`, `StatusLedger`, `AttestationRepository` |
| Backend flow | Snapshot → digest → qualified sign → TSA stamp → INSERT attestation → ATTESTED status transition |
| Data operations | INSERT `sr_attestations`; INSERT status transition |
| Validation | Not disputed; entry ACTIVE; role custodian; signature is PKI_QUALIFIED |
| Authorization | `sr.attest` (custodian) |
| State changes | attestation_status=ATTESTED (status chain); audit_log; LTV-eligible |
| Failure handling | PKI unavailable → backlog + alert (no downgrade); per-row isolation in batch |
| Dependencies | PKI/HSM, TSA, FR-03, FR-19 |
| Test guidance | Signature binds content; server-sign rejected for statutory; dispute-block; batch partial-failure isolation |

---

### FR-08 — Periodic employee service verification **+ bulk / assisted / nominee-heir paths** — *amended v2*

- **ID:** FR-08
- **Module:** M12-SR
- **Primary Role(s):** Employee, Nominee/Heir, HR Officer (assist), SR Custodian, System (scheduler)
- **User Story:** *As an employee verifying a long career, I want to bulk-confirm routine entries while the system surfaces only changed or sensitive ones for focused review; and where I am illiterate, have no device, or have died, I want an assisted or nominee-heir path — so verification protects my pension instead of blocking it or being rubber-stamped.*

**Description.** The scheduler generates verification cycles per statutory period (default 5 years; plus a mandatory pre-retirement cycle, and a **HEIR_VERIFICATION** cycle for DEATH_IN_SERVICE). **v2 adds three operability paths (R7):** (a) **bulk-confirm-with-exceptions** — the system risk-ranks and surfaces only entries that are *changed since last verification, sensitive (PUNISHMENT/SUSPENSION/IDENTITY), corrigendum-affected, or gap-flagged*; the employee bulk-confirms the rest and reviews exceptions individually; (b) **assisted verification** — an HR Officer operates the wizard on behalf of a low-literacy/no-device employee with explicit consent capture and an `ASSISTED_VERIFY` attestation kind; (c) **nominee/legal-heir verification** — for deceased employees, an identity-verified nominee/heir performs `HEIR_VERIFY`. CRITICAL gap-register findings (FR-17) must be EXPLAINED/CLOSED before a pre-retirement cycle can complete.

**Acceptance Criteria.**
1. The scheduler opens a cycle for each eligible employee at the period boundary with `events_in_scope` correctly counted.
2. **v2:** the cycle presents a bulk-confirm action plus a risk-surfaced exceptions list (changed/sensitive/corrigendum/gap); confirming requires acknowledging the exceptions, not every routine row.
3. Employee confirmation captures an `EMPLOYEE_VERIFY` attestation; confirmed entries → EMPLOYEE_VERIFIED.
4. Custodian finalisation requires all disputes resolved and **all CRITICAL gaps EXPLAINED/CLOSED**; captures a custodian attestation; cycle → COMPLETED.
5. Cycles past `due_date` become OVERDUE and notify employee + custodian + reporting manager.
6. **v2:** an assisted cycle records the assisting HR officer + consent; a heir cycle records the verified nominee/heir identity and relationship.
7. Pre-retirement cycle incomplete at retirement → blocks M11 pension finalisation with an explicit flag.

**Business Rules.**
- BR-08.1 A pre-retirement cycle is auto-created N months before superannuation; must complete before pension processing.
- BR-08.2 Disputed entries block COMPLETED until resolved.
- BR-08.3 Employee verification is a qualified/OTP-confirmed signature with full audit; **assisted/heir verifications additionally record the operator/heir identity and consent.**
- **BR-08.4 (v2)** Bulk-confirm cannot hide a sensitive/changed/gap entry — those are always individually surfaced (anti-rubber-stamp).
- **BR-08.5 (v2)** Heir eligibility requires nominee/heir identity verification against M11/M01 nominee records.

**Data Model References.** `sr_verification_cycles` (incl. assisted/heir fields), `sr_attestations`, `service_register_events` (EMPLOYEE_VERIFIED via status chain), `sr_gap_register` (FR-17), `notifications`.

**API References.** `GET /api/v1/sr/verification-cycles?employee_id=`; `POST /api/v1/sr/verification-cycles/{id}/bulk-confirm`; `POST /api/v1/sr/verification-cycles/{id}/confirm`; `POST /api/v1/sr/verification-cycles/{id}/assisted-confirm`; `POST /api/v1/sr/verification-cycles/{id}/heir-confirm`; `POST /api/v1/sr/verification-cycles/{id}/finalise`.

**UI Behavior Notes.** Employee "Verify my service record" wizard: period summary, **"Review N exceptions, then bulk-confirm M routine entries"** layout with a prominent exceptions panel, progress meter, qualified/OTP signature step. Assisted mode shows consent capture and operator banner; heir mode shows identity-verification and relationship capture. Mobile-first, plain-language, WCAG AA.

**Edge Cases.** Employee on long leave/unreachable → cycle stays OPEN, escalates; assisted path used with documented consent; new disputes during review → DISPUTED; pre-retirement incomplete at retirement → blocks M11; **deceased employee → HEIR_VERIFICATION cycle; no nominee on record → custodian proceeds with documented best-evidence note + gap flags retained.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `VerificationCycleScheduler`, `VerificationService`, `ExceptionRanker` (NEW), `AssistedVerificationService` (NEW), `HeirVerificationService` (NEW), `AttestationService`, `GapGate` (FR-17) |
| Backend flow | Generate cycle → risk-rank exceptions → employee/assisted/heir review → confirm (sign) → dispute/gap resolution → custodian finalise (sign) |
| Data operations | INSERT/UPDATE cycle; INSERT attestations; status transitions; read gap register |
| Validation | Exceptions acknowledged; disputes resolved; CRITICAL gaps closed before finalise; heir identity verified |
| Authorization | Employee `sr.verify.confirm`; HR `sr.verify.assist`; heir `sr.verify.heir`; custodian `sr.verify.finalise` |
| State changes | OPEN→(BULK_REVIEW/ASSISTED/HEIR_PENDING)→EMPLOYEE_REVIEW→(DISPUTED)→CUSTODIAN_REVIEW→COMPLETED/OVERDUE; pension gate |
| Failure handling | Overdue escalation; incomplete pre-retirement blocks M11; missing nominee → documented note |
| Dependencies | Scheduler, FR-06, FR-07, FR-17 gap gate, M11 gate, M11/M01 nominee records |
| Test guidance | Cycle generation; **exceptions always surfaced (anti-rubber-stamp)**; bulk-confirm correctness; assisted consent capture; heir identity gate; CRITICAL-gap finalise block; pension gate |

---

### FR-09 — SR timeline view (chronological, filterable) — *functionally unchanged; v2 badges added*

- **ID:** FR-09
- **Module:** M12-SR
- **Primary Role(s):** Employee (self), HR Officer, SR Custodian, Auditor, Pension Officer
- **User Story:** *As an authorised viewer, I want a chronological, filterable, paginated timeline with integrity, status, confidence, and dispute indicators, so I understand the full service history at a glance.*

**Description.** Renders `service_register_events` ordered by `event_date` (`sequence_no` tiebreak), filterable by category, date range, source module, attestation status, **confidence status**, and include/exclude superseded. Each row shows title, date, order reference, provenance, **content-integrity + status-integrity + confidence + dispute/appeal badges**, and links to documents and corrigendum/annotation chains. Every view writes `sr_access_log`.

**Acceptance Criteria.**
1. Timeline returns entries ordered by `event_date` desc, paginated (max 100/page).
2. Filters compose (category, date range, source, attestation, **confidence**, superseded toggle).
3. Each entry shows attestation badge, integrity indicator, **confidence badge (VERIFIED/RECONSTRUCTED/LEGACY_UNVERIFIABLE), and dispute/appeal badge**.
4. Superseded entries are visually distinct and link to corrigendum; corrigenda link back.
5. Every view writes `sr_access_log`; non-self access requires `purpose`.

**Business Rules.** BR-09.1 self/scoped/auditor visibility; BR-09.2 sensitive categories elevated to auditor; BR-09.3 default excludes SUPERSEDED unless toggled.

**Data Model References.** `service_register_events`, `sr_corrections`, `sr_status_events` (badges), `sr_access_log`, `documents`.

**API References.** `GET /api/v1/sr/employees/{id}/timeline`; `GET /api/v1/sr/events/{id}`.

**UI Behavior Notes.** Vertical year-grouped timeline; left-rail filters; cards with category icon, date, title, provenance pill, badges, expand for payload + documents; plain-language tooltips for "superseded", "reconstructed", "under appeal" (council Improvement 20). Empty/loading/error/permission states specified.

**Edge Cases.** Zero events → empty state; 300+ entries → virtualised list + pagination; cross-org HR out-of-scope → 403.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `TimelineController`, `TimelineQueryService`, `AccessLogger` |
| Backend flow | Authz + scope → query with filters → enrich badges (integrity/status/confidence/dispute) → log access → return page |
| Data operations | SELECT paginated; JOIN corrections/status; INSERT access_log |
| Validation | Filter params; page size ≤ 100; scope check |
| Authorization | self/scoped/auditor; `sr.timeline.read` |
| State changes | access_log append only |
| Failure handling | Out-of-scope → 403; missing employee → 404 |
| Dependencies | M13; FR-12 |
| Test guidance | Filter composition; pagination; access-log every view; RBAC scoping; badge correctness |

---

### FR-10 — Certified true copy generation **(qualified signing + purpose-driven redaction + dual custodian + §65B + LTV)** — *amended v2*

- **ID:** FR-10
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian (issue/sign), Second Custodian (co-sign FULL_SR), Employee/Pension Officer (request)
- **User Story:** *As an SR Custodian, I want to generate a certified true copy (full or scoped) as a qualified-signed, redaction-aware, offline-verifiable PDF accompanied by a §65B authenticity certificate, so it stands up officially for pension, loans, courts, and audits for decades.*

**Description.** On request, the system renders an ordered extract, **applies the purpose-driven `redaction_policy` via the P02 field-mask before digesting** (e.g., a `LOAN_EXCLUDE_DISCIPLINARY` extract omits PUNISHMENT/SUSPENSION), computes `content_digest`, generates a **qualified-signed** PDF (custodian PKI signature + RFC 3161 timestamp), wraps it in a **PAdES-LTV** envelope, embeds the latest **anchor reference** for offline verification (FR-11), stores it in M13, and records `sr_certified_extracts` with a unique `extract_no` + `qr_verification_token`. **FULL_SR extracts require a second custodian co-sign (SoD, R6).** A live dispute/appeal on any included entry is rendered on the copy. **A §65B/BSA authenticity certificate (FR-18) is generated alongside.** Extracts can be revoked but never deleted; an LTV renewal job (FR-19) keeps them verifiable.

**Acceptance Criteria.**
1. An extract renders selected entries in stable order with a `content_digest` binding the **redacted** rendering.
2. The PDF is **qualified-signed** (not server-signed) + RFC 3161 timestamped + PAdES-LTV; stored as a `document_id`; an `EXTRACT_SIGN` attestation recorded.
3. Each extract has a unique `extract_no`, embedded **offline-verifiable** QR + anchor reference (FR-11), and (on request/for statutory use) a linked **§65B certificate** (FR-18).
4. FULL_SR extracts include only attested/verified (or annotated-legacy) entries, exclude superseded unless requested, **and require a second custodian co-sign**.
5. **v2:** purpose-driven redaction omits the configured sensitive categories and lists them in `redacted_categories`; a live dispute/appeal renders on the copy.
6. Revoking sets `revoked=true` with reason; QR then reports REVOKED.

**Business Rules.**
- BR-10.1 Non-self requests require a stated `purpose`; access-logged.
- BR-10.2 A corrigendum to any included entry auto-revokes the prior extract and prompts re-issue.
- BR-10.3 Extract content reflects the ledger at `issued_at`; the digest pins it.
- BR-10.4 Reuses platform document services (M11): serial numbering, signer set (`VAL-M11-SIGNER`), letterhead, employee-vault storage, permanent retention class (`VAL-M11-RETENTION`). Bulk issuance runs as a background job.
- **BR-10.5 (v2)** Statutory extracts MUST be qualified-signed; server-signed "PROVISIONAL" copies are watermarked, non-statutory, and must be re-issued.
- **BR-10.6 (v2)** `redaction_policy` is enforced server-side by P02; the client cannot request un-redaction beyond its entitlement.
- **BR-10.7 (v2)** FULL_SR requires second-custodian co-sign before signing.

**Data Model References.** `sr_certified_extracts` (incl. redaction/anchor/LTV/certificate fields), `service_register_events` (read), `sr_attestations`, `sr_anchors` (ref), `sr_authenticity_certificates` (FR-18), `documents` (M13), `sr_access_log`.

**API References.** `POST /api/v1/sr/employees/{id}/extracts` (with `redaction_policy`, `purpose`); `POST /api/v1/sr/extracts/{id}/cosign`; `POST /api/v1/sr/extracts/{id}/revoke`; `GET /api/v1/sr/extracts/{id}`.

**UI Behavior Notes.** Custodian "Issue certified copy" dialog: scope + **purpose/redaction-policy selector** (with a preview showing what is excluded), preview, **co-sign step for FULL_SR**, qualified-sign step; result shows download + extract number + QR + §65B certificate link. Plain-language note on what a certified copy proves.

**Edge Cases.** Scope includes unattested mandatory-attest entries → blocked with list (or watermarked PROVISIONAL if policy allows); qualified signing fails → no extract persisted, retry; re-issue after corrigendum → old auto-revoked; **redaction policy exceeds requester entitlement → fields masked, not leaked; FULL_SR without a second custodian → blocked.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ExtractService`, `RedactionPolicyEngine` (P02 field-mask), `PdfRenderer`, `QualifiedSignatureProvider`, `TsaClient`, `LtvWrapper` (FR-19), `QrTokenService`, `AuthenticityCertService` (FR-18), `SoDGuard`, `ExtractRepository` |
| Backend flow | Gather entries → apply redaction (P02) → render → digest → co-sign (FULL_SR) → qualified sign + TSA + PAdES-LTV → embed anchor ref → store PDF (M13) → record extract + token → generate §65B → log |
| Data operations | SELECT entries; INSERT extract + attestation + §65B; M13 store |
| Validation | Attestation gating; scope params; purpose; redaction entitlement; SoD; qualified signature |
| Authorization | `sr.extract.issue` (custodian); `sr.extract.cosign` (2nd custodian); request by self/pension |
| State changes | New extract row; PDF in M13; §65B cert; access_log; possible prior-extract revoke |
| Failure handling | Sign/store failure → no persistence; revoke idempotent |
| Dependencies | M13, PKI, TSA, FR-11, FR-18, FR-19 |
| Test guidance | Digest binds redacted content; qualified-sign enforced; redaction entitlement; SoD on FULL_SR; revoke flow; dispute visible |

---

### FR-11 — **Offline / independent** QR verification of certified extracts — *amended v2*

- **ID:** FR-11
- **Module:** M12-SR
- **Primary Role(s):** External verifier (public), any authorised role
- **User Story:** *As a bank or court holding a certified extract, I want to verify it is authentic, current, and unrevoked — including offline, against a published CA chain and the embedded anchor reference — so I do not have to trust the issuer's own server's word.*

**Description.** v1's online QR endpoint is retained as a *convenience*. **v2 makes the extract independently verifiable (R15):** the signed PDF/offline bundle embeds the qualified signer's certificate chain (verifiable against the **published government CA chain**), the RFC 3161 timestamp token, the `content_digest`, and the **anchor reference** (`sr_anchors` Merkle root + TSA token) — so a third party can verify the signature, the timestamp, and that the record's chain head was anchored, **without calling the issuer**. The online endpoint additionally reports VALID / REVOKED / NOT_FOUND. Rate-limited and access-logged.

**Acceptance Criteria.**
1. **v2:** the extract bundle verifies offline: signature against published CA chain, timestamp against TSA cert, and `content_digest` against the embedded value — no issuer call required.
2. **v2:** the embedded anchor reference lets a verifier confirm the record's chain head was included in a timestamped anchor.
3. Scanning the QR (online) returns VALID + metadata + `content_digest`.
4. A revoked extract returns REVOKED with revocation date/reason category (online); offline bundles carry an issue-time validity and the holder is directed to the revocation list/CRL-style feed.
5. Unknown token → NOT_FOUND (no enumeration leak); endpoint rate-limited.
6. Public response never exposes full SR content beyond the minimal authenticity set; redacted categories are never revealed.

**Business Rules.**
- BR-11.1 Employee name partially masked unless verifier is authenticated/authorised.
- BR-11.2 No auth required for VALID/REVOKED/NOT_FOUND; content protected.
- BR-11.3 `content_digest` lets a holder confirm their PDF matches what was issued.
- **BR-11.4 (v2)** A published, signed **revocation feed** (CRL-style) lets offline verifiers check revocation without trusting an ad-hoc issuer response.

**Data Model References.** `sr_certified_extracts` (read by token; offline bundle), `sr_anchors` (embedded ref), `sr_access_log`.

**API References.** `GET /api/v1/sr/verify/{qr_verification_token}` (online convenience); `GET /api/v1/sr/revocation-feed` (signed, cacheable); offline bundle is self-contained in the PDF.

**UI Behavior Notes.** Lightweight public page: status banner (green VALID / red REVOKED / grey NOT_FOUND), extract number, issue date, masked name, scope, **"Verify offline" instructions** (CA chain + anchor), "digest matches your copy?" check. WCAG AA, mobile-first, plain-language.

**Edge Cases.** Token guessing → high-entropy tokens + rate limiting + uniform NOT_FOUND; authenticated viewer → fuller metadata (still not full content); expired `valid_until` → VALID-but-EXPIRED; **issuer offline → offline verification still succeeds against CA chain + anchor.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `PublicVerifyController`, `OfflineBundleBuilder` (NEW), `RevocationFeedPublisher` (NEW), `RateLimiter`, `MaskingService` |
| Backend flow | (online) resolve token → status → mask → respond → log; (offline) verifier checks signature/CA/TSA/anchor in the bundle |
| Data operations | SELECT by token; INSERT access_log; sign + publish revocation feed |
| Validation | Token format; rate limit; CA-chain validity (verifier side) |
| Authorization | Public (unauthenticated); content protected |
| State changes | access_log append; verification metric |
| Failure handling | Unknown → NOT_FOUND uniform; over-limit → 429 |
| Dependencies | FR-10 tokens; published CA chain; `sr_anchors` |
| Test guidance | **Offline verify against CA + anchor with issuer down**; no content leak; revoked/expired/not-found; enumeration resistance; revocation-feed signature |

---

### FR-12 — Custody, access control & access logging — *functionally unchanged (fail-closed)*

- **ID:** FR-12
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian, Auditor, System
- **User Story:** *As an Auditor, I want every access to a service register — view, print, export, extract, anchor-verify — recorded immutably with actor, purpose, and scope, so custody is provable and misuse detectable.*

**Description.** All read/print/export/extract/integrity/anchor paths funnel through an access-logging interceptor that writes `sr_access_log` (append-only) with actor, role, action, scope, purpose (required for non-self), IP, and `request_id`. RBAC + row-level scoping by `org_unit_id`. The custodian/auditor review trails per employee/actor and detect anomalies. Fail-closed: a read fails if it cannot be logged.

**Acceptance Criteria.**
1. Every VIEW/PRINT/EXPORT/ISSUE_EXTRACT/VERIFY/**VERIFY_ANCHOR/GENERATE_65B** action writes exactly one `sr_access_log` row.
2. Non-self access requires a non-empty `purpose` (`SR_PURPOSE_REQUIRED`).
3. Access denied (403) when actor lacks role/org-scope.
4. The access log is append-only.
5. Auditor can query by employee, actor, action, date range (paginated).

**Business Rules.** BR-12.1 self-access logged without purpose; BR-12.2 anomaly rules (e.g., one actor > N distinct employees/hour) alert; BR-12.3 sensitive-category access flagged for elevated audit.

**Data Model References.** `sr_access_log`, `audit_log`, `notifications`.

**API References.** `GET /api/v1/sr/access-log`.

**UI Behavior Notes.** Auditor/custodian "Access trail": filter by employee/actor/action/date; anomaly highlights; export; purpose prompt on non-self open.

**Edge Cases.** Access denied mid-bulk → logged as denial; high-volume legitimate access → anomaly rule tuned via config; service-principal reads logged with module identity.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AccessInterceptor` → P02 `Authorization.check` (scope + field mask + PII ceiling), `AccessLogRepository`, `AnomalyDetector` |
| Backend flow | Pre-handler `Authorization.check` → on success log to `sr_access_log` + `audit_log` → anomaly evaluate |
| Data operations | INSERT access_log; SELECT for trail |
| Validation | Purpose for non-self; scope; role |
| Authorization | `sr.accesslog.read` (auditor/custodian) |
| State changes | access_log append; possible alert |
| Failure handling | Denials logged; **log write failure fails the read (fail-closed)** |
| Dependencies | RBAC platform |
| Test guidance | Every path logged; purpose enforcement; fail-closed when log unavailable; anomaly trigger |

---

### FR-13 — Event subscriptions to downstream modules **(single authenticated pull-feed at launch)** — *amended v2 (simplified)*

- **ID:** FR-13
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (register), SR Custodian (approve), Subscriber modules
- **User Story:** *As the Pension module (M11), I want to pull authoritative SR change events for relevant categories from a single authenticated feed, so I consume facts reliably without M12 maintaining three delivery stacks for three internal consumers.*

**Description.** **v2 simplifies v1 (R17):** at launch, downstream modules consume a **single authenticated pull-feed** (`GET /api/v1/sr/feed?since_seq=`) with a per-subscriber durable cursor (`last_delivered_seq`); the feed is materialised by `JOB-M12-FEED`. **WEBHOOK and MESSAGE_BUS modes (and the DLQ apparatus) are deferred** behind a documented real-time requirement (e.g., a committed M14 real-time-dashboard SLA); the enum and entity retain the modes but only PULL_FEED is enabled. Corrigenda/reversals re-emit so consumers re-read corrected facts; subscribers dedupe by `sr_event_id`.

**Acceptance Criteria.**
1. A subscription registers for one or more `event_categories`; activation requires custodian approval.
2. Every committed append (and supersession/reversal) is available on the pull-feed to matching ACTIVE subscriptions, ordered by `sequence_no`.
3. The feed is authenticated (service JWT/mTLS) and resumable from the subscriber cursor.
4. Feed payloads carry `sr_event_id`, category, employee_id, and a content reference — **not** sensitive full payloads unless the subscriber is authorised (payload minimisation).
5. Subscribers dedupe by `sr_event_id`; corrigenda referenced to the superseded entry.
6. **v2:** WEBHOOK/MESSAGE_BUS registration is rejected (`SR_DELIVERY_MODE_DEFERRED`) until a documented requirement enables it.

**Business Rules.** BR-13.1 secrets via `secret_ref`; BR-13.2 PAUSED/RETIRED receive nothing; resumed replays from cursor; BR-13.3 payload minimisation — sensitive categories deliver references; **BR-13.4 (v2)** only PULL_FEED enabled at launch; mode changes are a documented config + capability flag.

**Data Model References.** `sr_subscriptions` (cursor), `service_register_events` (change feed), `audit_log`.

**API References.** `POST /api/v1/sr/subscriptions`; `POST /api/v1/sr/subscriptions/{id}/activate`; `GET /api/v1/sr/feed?since_seq=`.

**UI Behavior Notes.** Admin "Subscriptions" tab: list, register (module, categories — **mode fixed to PULL_FEED**), status, last-delivered cursor. WEBHOOK/MESSAGE_BUS shown as "Deferred" with a requirement note.

**Edge Cases.** Subscriber lag → resumes from cursor; duplicate consume → idempotent on `sr_event_id`; `ALL` category → receives every event; **attempt to register WEBHOOK → `SR_DELIVERY_MODE_DEFERRED`.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `FeedMaterialiser` (`JOB-M12-FEED`), `SubscriptionRepository`, `FeedController` |
| Backend flow | On append commit → feed cursor advances → subscriber pulls `since_seq` → authorised, minimised payload |
| Data operations | INSERT/UPDATE subscriptions; read feed by seq |
| Validation | Category validity; mode = PULL_FEED; auth |
| Authorization | admin register; custodian activate; `sr.feed.read` for pull |
| State changes | Cursor advance; audit |
| Failure handling | Subscriber resumes from cursor; no DLQ needed for pull |
| Dependencies | FR-03 append commit hook |
| Test guidance | At-least-once + idempotent consume; cursor replay; payload minimisation; deferred-mode rejection |

---

### FR-14 — Bulk legacy digitisation pipeline **(confidence-flagged lane + semantic dedup)** — *amended v2*

- **ID:** FR-14
- **Module:** M12-SR
- **Primary Role(s):** HR Officer (data entry / maker), SR Custodian (promote / checker), Employee/Heir (corroborate)
- **User Story:** *As an HR Officer digitising decades of fragile paper books, I want a confidence-flagged lane so an illegible or contradictory entry can still be captured honestly (as RECONSTRUCTED or LEGACY_UNVERIFIABLE) with provenance and employee corroboration, instead of stalling the whole programme on a zero-tolerance gate.*

**Description.** Legacy books are digitised in batches (`sr_legacy_digitisation_batch`): CREATED → SCANNING → DATA_ENTRY → DUAL_VERIFICATION (maker ≠ verifier) → RECONCILIATION → READY_FOR_PROMOTION → PROMOTED. **v2 (R8):** each staged record carries a `confidence_status` (VERIFIED / RECONSTRUCTED / LEGACY_UNVERIFIABLE) and a `corroboration_status`; **zero reconciliation tolerance applies only to facts promoted as fully attested (VERIFIED)**; RECONSTRUCTED/LEGACY_UNVERIFIABLE facts may promote with mandatory provenance, an evidence-quality note, and an employee/heir corroboration step, so the programme proceeds without fabricating certainty. Promotion appends with `is_legacy=true`, `confidence_status`, page reference, and scan linkage; **semantic dedup (`fact_key`) prevents re-promoting an already-recorded fact.** Promotion requires custodian (checker) approval; confidence-flagged promotions also require a second-custodian co-sign.

**Acceptance Criteria.**
1. A batch progresses through the defined states; each transition recorded and gated.
2. Each staged record requires dual verification before promotion.
3. Records must match an M01 `employee_id` (or AMBIGUOUS/UNMATCHED) before promotion; unmatched cannot promote.
4. Promotion appends entries with `is_legacy=true`, `confidence_status`, `legacy_batch_id`, `page_ref`, scan `document_id`, preserving original `event_date`.
5. **v2:** VERIFIED promotion requires discrepancy=0; RECONSTRUCTED/LEGACY_UNVERIFIABLE promotion requires provenance + evidence-quality note + corroboration plan + second-custodian co-sign.
6. **v2:** semantic dedup blocks re-promoting a fact already in the ledger (`fact_key`).

**Business Rules.**
- BR-14.1 Legacy entries appended in chronological `event_date` order where feasible; chain follows recording order.
- BR-14.2 **(v2, replaces v1)** Legacy entries default UNATTESTED; VERIFIED ones are flagged for custodian attestation; RECONSTRUCTED/LEGACY_UNVERIFIABLE ones are clearly badged and routed to employee/heir corroboration (FR-08/FR-17).
- BR-14.3 Every staged record links its source scan.
- **BR-14.4 (v2)** A LEGACY_UNVERIFIABLE fact never silently counts as a confirmed qualifying-service fact; pension (M11) sees the confidence flag.

**Data Model References.** `sr_legacy_digitisation_batch`, `sr_legacy_digitisation_record` (incl. confidence/corroboration fields), `service_register_events` (append via FR-03), `documents` (M13), `workflow_instances`.

**API References.** `POST /api/v1/sr/legacy/batches`; `POST /api/v1/sr/legacy/batches/{id}/records`; `POST /api/v1/sr/legacy/records/{id}/verify`; `POST /api/v1/sr/legacy/records/{id}/set-confidence`; `POST /api/v1/sr/legacy/batches/{id}/promote`.

**UI Behavior Notes.** Digitisation workbench: batch Kanban; split-screen scan + entry; verification compare; **confidence selector (VERIFIED / RECONSTRUCTED / LEGACY_UNVERIFIABLE) with mandatory evidence note**; reconciliation list; promote gated to custodian (+ co-sign for confidence-flagged). Plain-language operator guidance.

**Edge Cases.** Illegible scan/missing page → record flagged RECONSTRUCTED or LEGACY_UNVERIFIABLE with note (not blocked); AMBIGUOUS match → manual resolution before promote; **duplicate of an already-digitised/recorded fact → semantic dedup excludes; contradictory entries → best-evidence captured + corroboration flagged.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DigitisationService` (P06 ETL+V), `MasterMatcher`, `ReconciliationService`, `ConfidenceClassifier` (NEW), `SemanticDedupService`, `AppendEngine`, `WorkflowAdapter` → P01 (`WF-M12-LEGACY-PROMOTE`); writes `migration_runs` |
| Backend flow | Create → scan link → data entry → dual verify → set confidence → match/reconcile (zero-tolerance only for VERIFIED) → semantic dedup → custodian promote (+ co-sign for flagged) → bulk append with confidence + `legacy_source_id` |
| Data operations | INSERT batch/records; UPDATE statuses; bulk INSERT ledger on promote |
| Validation | Dual verification; master match; discrepancy=0 for VERIFIED; provenance+note for flagged; semantic dedup |
| Authorization | HR `sr.legacy.entry`; custodian `sr.legacy.promote`; 2nd custodian co-sign for flagged |
| State changes | Batch lifecycle; ledger appended (is_legacy + confidence); audit_log |
| Failure handling | Promotion atomic per batch; partial failure rolls back |
| Dependencies | M13 scans, M01 match, FR-03, FR-08/FR-17, workflow |
| Test guidance | Dual-verification; unmatched blocked; **confidence-flagged promotion path; semantic dedup of re-promote**; atomicity; provenance correctness |

---

### FR-15 — Retention, archival, legal hold **+ cross-tenant chain continuity + DR anchor reconciliation** — *amended v2*

- **ID:** FR-15
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (policy), SR Custodian (legal hold), Auditor
- **User Story:** *As a System Administrator, I want the SR retained permanently with post-retirement archival, legal hold, unbroken chains across inter-department transfers, and a DR procedure that detects a stale restore, so the statutory record is always available, continuous, and provably current.*

**Description.** The SR ledger and sub-ledgers are retained **permanently** under the DPDP legal-obligation lawful basis (§4/§9). After retirement/separation an SR moves to an archival tier while remaining fully readable and verifiable. Legal hold prevents tier movement. **v2 additions:** (a) **cross-tenant/inter-department chain continuity (R16)** — on transfer to a different org unit/tenant the chain CONTINUES (no fork): the first entry in the new scope is `chain_origin=CONTINUED` with `prior_chain_head_hash` binding the prior scope's head, so career mobility never breaks per-`(tenant,employee)` chaining; (b) **DR anchor reconciliation (R12)** — restore procedures compare restored chain heads against the latest external anchor to detect a stale restore that would silently rewind a corrigendum (FR-04/§13.2).

**Acceptance Criteria.**
1. No API/job/admin action can delete a `service_register_events`/status/attestation/correction/access-log/anchor row.
2. On separation/retirement the SR is archived but stays readable and verifiable.
3. Legal hold can be applied/released by the custodian; held SRs are excluded from tier movement and flagged.
4. Archived SRs remain available for extracts and pension consumption.
5. Retention policy changes are versioned/audited; none may permit ledger deletion.
6. **v2:** an inter-department/tenant transfer continues the chain with a `prior_chain_head_hash` link; integrity verification (FR-04) traverses the continuation.
7. **v2:** a restore is gated by anchor reconciliation; a stale restore is flagged with the missing-corrigendum list before the system is returned to service.

**Business Rules.** BR-15.1 archival is storage-tier only (never alters rows/hashes); BR-15.2 legal hold overrides archival + future retention changes; BR-15.3 post-retirement access follows RBAC + access logging; **BR-15.4 (v2)** chain continuation is the default on transfer (documented policy: continue, do not fork); **BR-15.5 (v2)** no restored chain re-enters service until its heads reconcile to the anchor.

**Data Model References.** `service_register_events` (continuity fields; archival metadata external), `sr_anchors` (DR reconciliation), `audit_log`, `employees` (M01 status trigger).

**API References.** `POST /api/v1/sr/employees/{id}/legal-hold`; `GET /api/v1/sr/retention-policy`; `POST /api/v1/sr/dr/reconcile-anchor` (restore gate).

**UI Behavior Notes.** Admin "Retention & legal hold" panel: deletion-prohibited policy view, per-employee hold toggle with reason, archived badge; **transfer-continuity indicator on the first CONTINUED entry; DR reconciliation report.**

**Edge Cases.** Deletion via any path → blocked + security event; archival of a held SR → blocked; re-employment after retirement → SR un-archives and continues appending (same chain); **transfer across tenants → continuation link; restore from a pre-corrigendum backup → STALE_RESTORE flagged, corrigenda re-applied before return to service.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RetentionPolicyService`, `ArchivalManager`, `LegalHoldService`, `ChainContinuityService` (NEW), `DrAnchorReconciler` (NEW) |
| Backend flow | Separation → mark archived → (hold check) → tier move; transfer → continuation link on next append; restore → anchor reconcile gate; deletion attempts rejected |
| Data operations | Metadata flags; partition move; INSERT audit; continuity fields on append; anchor compare on restore |
| Validation | Deletion always rejected; hold blocks tiering; continuation binds prior head; restore reconciles to anchor |
| Authorization | admin policy; custodian hold; `sr.retention.manage`; `sr.dr.reconcile` |
| State changes | Tier/archival flags; audit; no row deletion ever |
| Failure handling | Tiering retried; deletion attempt → security alert; stale restore → gated |
| Dependencies | Storage tiering; M01 status; `sr_anchors` |
| Test guidance | Deletion impossible; hold blocks archival; archived readable/verifiable; **cross-tenant continuity verified by FR-04; stale-restore detection** |

---

### FR-16 — Audit / forensics view & SR analytics — *functionally unchanged; v2 adds status-chain + anchor + gap lineage*

- **ID:** FR-16
- **Module:** M12-SR
- **Primary Role(s):** Auditor, SR Custodian
- **User Story:** *As an Auditor, I want a forensics view combining content + status integrity, anchor status, correction/supersession lineage, attestation/verification coverage, completeness gaps, and the access trail, so I can investigate suspected tampering and assess SR health.*

**Description.** Aggregates per employee/population: content + **status** chain integrity (FR-04), **anchor freshness and head-match status** (FR-04), supersession/correction lineage (FR-05/06), attestation/verification coverage (FR-07/08), **completeness gap findings (FR-17)**, and the access trail (FR-12). Supports point-in-time reconstruction, divergence drill-down, and analytics exposed to M14.

**Acceptance Criteria.**
1. Shows content + status integrity PASS/FAIL with divergent-entry drill-down, and anchor head-match status.
2. Reconstructs the SR as-of any past date (append order).
3. Surfaces complete correction/supersession lineage.
4. Reports attestation coverage, verification status, **gap-closure status**, and access anomalies.
5. Analytics aggregates exposed to M14 and exportable, respecting RBAC.

**Business Rules.** BR-16.1 point-in-time uses `recorded_at`/`sequence_no`; BR-16.2 forensics access is itself logged; BR-16.3 a FAIL cannot be closed without a recorded resolution note.

**Data Model References.** `service_register_events`, `sr_status_events`, `sr_anchors`, `sr_corrections`, `sr_attestations`/`sr_verification_cycles`, `sr_gap_register`, `sr_access_log`.

**API References.** `GET /api/v1/sr/forensics/employees/{id}`; `GET /api/v1/sr/forensics/as-of?date=`; `GET /api/v1/sr/analytics/summary`.

**UI Behavior Notes.** Forensics dashboard: content/status/anchor integrity banners, lineage graph, coverage + gap gauges, as-of date picker, access-anomaly list. Analytics cards feed M14.

**Edge Cases.** As-of before first entry → empty reconstruction; integrity FAIL during reconstruction → proceeds but flags affected segment; very large population analytics → precomputed/async.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ForensicsService`, `PointInTimeReconstructor`, `AnchorStatusReader`, `GapLineageReader`, `AnalyticsAggregator` |
| Backend flow | Gather content+status integrity + anchor status + lineage + coverage + gaps + access → assemble bundle; as-of filters by recorded_at |
| Data operations | SELECT across SR entities; aggregate queries |
| Validation | Date params; RBAC scope |
| Authorization | `sr.forensics.read` (auditor/custodian) |
| State changes | Read-only; access logged |
| Failure handling | Large queries async; partial-data flagged |
| Dependencies | FR-04/05/07/08/12/17; M14 |
| Test guidance | As-of correctness; lineage completeness; coverage + gap accuracy; access-logged forensics; anchor status surfaced |

---

### FR-17 — **Completeness assurance & gap register** — *NEW v2 (R1, Critical)*

- **ID:** FR-17
- **Module:** M12-SR
- **Primary Role(s):** System (scheduler), SR Custodian, Employee/Heir (corroborate)
- **User Story:** *As an SR Custodian, I want the system to model the events that *should* exist for each employee (per cadre/service rules) and reconcile them against what is recorded, so that a silently missing increment or confirmation is surfaced as a first-class finding decades before it becomes a pension shortfall — because the hash chain proves presence, not completeness.*

**Description.** This FR engineers the **completeness** guarantee the council found absent in v1. `sr_expected_event_rule` (E21) models expected events per cadre/service rules — annual increment unless withheld, confirmation due N months after joining, periodic-verification due, increment-cycle continuity. `JOB-M12-GAPSCAN` reconciles expected vs. recorded per employee, accounting for legitimate suppressors (INCREMENT_WITHHELD, SUSPENSION, LWP_SPELL), and raises `sr_gap_register` (E22) findings (`GAP_FLAGGED`). Findings carry severity (CRITICAL = pension-affecting). The custodian and employee/heir corroborate (`WF-M12-GAP-RESOLVE`): a gap is EXPLAINED (e.g., NOT_DUE/WITHHELD), CLOSED_RECORDED (the missing event is located/recorded via FR-02/FR-05/FR-14), or CLOSED_FALSE_POSITIVE. The v1 "100% complete / structurally impossible" claim is **retracted**; the success metric becomes a measurable **gap-closure rate**.

**Acceptance Criteria.**
1. Published `sr_expected_event_rule`s generate expected-event projections per in-scope employee.
2. `JOB-M12-GAPSCAN` runs per-tenant on schedule, reconciles expected vs. recorded honouring suppressors, and raises `GAP_FLAGGED` findings with severity.
3. A finding can be EXPLAINED, CLOSED_RECORDED (linking the resolving `sr_event_id`), or CLOSED_FALSE_POSITIVE, each with actor + reason.
4. CRITICAL (pension-affecting) gaps block pre-retirement cycle completion (FR-08) until resolved.
5. Employees/heirs can view and corroborate their own gaps; resolution is audit-logged.
6. The completeness report (§12) shows gap-closure rate by org_unit/cadre/severity.

**Business Rules.**
- BR-17.1 A gap is never auto-closed; closure requires explicit explanation/recording/false-positive with actor.
- BR-17.2 Suppressor events legitimately explain absence (no false gap when an increment was lawfully withheld).
- BR-17.3 The expected-event model **references** M06/M10/service-rule authority; it does not redefine substantive service rules.
- BR-17.4 A CLOSED_RECORDED gap must link a real ledger entry; recording uses the normal ingestion/correction/legacy paths (no special bypass).

**Data Model References.** `sr_expected_event_rule` (read), `sr_gap_register` (write), `service_register_events` (read/resolve), `workflow_instances` (`WF-M12-GAP-RESOLVE`), `notifications`.

**API References.** `GET /api/v1/sr/employees/{id}/gaps`; `POST /api/v1/sr/gaps/{id}/explain`; `POST /api/v1/sr/gaps/{id}/close`; `POST /api/v1/sr/gaps/{id}/corroborate`; `GET /api/v1/sr/gaps/summary`.

**UI Behavior Notes.** Custodian "Completeness / gaps" console: gap list by severity/age/org_unit with explain/close/record actions; employee self-service "Possible missing entries in your record" panel with plain-language guidance and a corroborate action; gap badges on the timeline (FR-09).

**Edge Cases.** Rule change mid-career (pay-commission) → expected projection effective-dated; employee with legitimate long suppressor → no false gaps; legacy-missing event with no evidence → EXPLAINED as LEGACY_MISSING with a documented note and confidence flag retained; **CRITICAL gap unresolved at retirement → pension gate holds with explicit reason.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ExpectedEventProjector`, `GapScanJob` (`JOB-M12-GAPSCAN`), `GapResolutionService`, `GapGate` (FR-08), `NotificationAdapter` |
| Backend flow | Project expected events (effective-dated rules) → reconcile vs. recorded honouring suppressors → raise findings → corroborate/resolve → gate pre-retirement |
| Data operations | SELECT rules + events; INSERT/UPDATE gap_register; read for gate |
| Validation | Suppressor handling; severity assignment; closure requires actor+reason+(recorded link) |
| Authorization | `sr.gap.read` (employee self/custodian/auditor); `sr.gap.resolve` (custodian) |
| State changes | GAP_FLAGGED→UNDER_REVIEW→EXPLAINED/CLOSED_RECORDED/CLOSED_FALSE_POSITIVE; pension gate input |
| Failure handling | Idempotent per-period scan; false positives closable; CRITICAL gaps block finalise |
| Dependencies | FR-01 cadence rules, M06/M10 service rules, FR-08 gate, FR-02/05/14 recording |
| Test guidance | Suppressor correctness (no false gap on lawful withholding); CRITICAL gate; effective-dated rule change; gap-closure metric; idempotent scan |

---

### FR-18 — **§65B / Bharatiya Sakshya Adhiniyam certificate-of-authenticity generator** — *NEW v2 (R4, High)*

- **ID:** FR-18
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian (issue), Courts/Auditor (consume)
- **User Story:** *As an SR Custodian producing a record for a tribunal, I want every certified extract accompanied by a machine-generated electronic-record authenticity certificate citing the hash, the anchor reference, the signer, and the chain of custody, so the document is admissible without a separate forensic exercise years later.*

**Description.** For any certified extract (FR-10), the system generates an `sr_authenticity_certificates` (E24) record and a signed certificate PDF that satisfies the statutory electronic-record authenticity requirement (IT Act 2000 §65B / Bharatiya Sakshya Adhiniyam 2023 §63): a statement describing the computer system that produced the output, the `content_digest`, the `anchor_id` (proving the record's tamper-evident state at issue), the qualified signer identity + certificate serial, the RFC 3161 timestamp, and a structured **chain of custody** (ingestion provenance, attestation lineage, supersession history, system identity, issuing operator). The certificate is itself qualified-signed and stored in M13.

**Acceptance Criteria.**
1. Every statutory certified extract can produce a §65B/BSA certificate referencing that extract's `content_digest` and `anchor_id`.
2. The certificate states the producing system, the chain of custody, the signer, and the trusted timestamp.
3. The certificate is qualified-signed and stored as a `document_id`; issuance is access-logged (`GENERATE_65B`).
4. The certificate `content_digest` matches the extract's `content_digest`; a mismatch blocks issuance.
5. The certificate cites the anchor that covered the record's chain head at issue (independently verifiable, FR-11).

**Business Rules.**
- BR-18.1 A §65B certificate is only issued for a qualified-signed (statutory) extract — never for a PROVISIONAL server-signed copy.
- BR-18.2 The chain-of-custody section is generated from ledger/provenance/attestation data, not free-typed.
- BR-18.3 The certificate is LTV-renewed alongside its extract (FR-19).

**Data Model References.** `sr_authenticity_certificates` (write), `sr_certified_extracts` (read), `sr_anchors` (ref), `sr_attestations`/`sr_ingestion_requests` (chain of custody), `documents` (M13), `sr_access_log`.

**API References.** `POST /api/v1/sr/extracts/{id}/authenticity-certificate`; `GET /api/v1/sr/authenticity-certificates/{id}`.

**UI Behavior Notes.** From the extract result, a "Generate §65B / BSA certificate" action; certificate preview shows system statement, digest, anchor reference, signer, custody chain; download. Plain-language explainer of what the certificate is for.

**Edge Cases.** Request for a PROVISIONAL extract → blocked (`SR_SIGNATURE_NOT_QUALIFIED`); digest mismatch (extract altered) → blocked + integrity alert; anchor not yet generated for the period → wait for next anchor or use the most recent covering anchor with a noted lag.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AuthenticityCertService`, `ChainOfCustodyBuilder`, `QualifiedSignatureProvider`, `TsaClient`, `CertRepository` |
| Backend flow | Validate extract is statutory → assemble system statement + custody chain + digest + anchor ref → qualified sign + TSA → store PDF → record cert → log |
| Data operations | SELECT extract + provenance + attestations + anchor; INSERT cert |
| Validation | Statutory extract; digest match; anchor coverage |
| Authorization | `sr.cert.generate` (custodian) |
| State changes | New cert row; PDF in M13; access_log |
| Failure handling | Provisional/digest-mismatch → blocked; sign failure → no persistence |
| Dependencies | FR-10, FR-11 (anchor), FR-19, M13, PKI/TSA |
| Test guidance | Custody chain completeness; digest binding; anchor reference; provisional rejection; admissibility-field coverage |

---

### FR-19 — **Long-term validation (LTV) & evidence-record renewal** — *NEW v2 (R5, High)*

- **ID:** FR-19
- **Module:** M12-SR
- **Primary Role(s):** System (scheduler), System Administrator (crypto migration), Auditor
- **User Story:** *As an Auditor opening a signed extract decades after the custodian's certificate expired and SHA-256 aged, I want it to still verify, because the system periodically re-timestamped and re-anchored it — so "verifiable decades later" is engineered, not asserted.*

**Description.** This FR engineers the **longevity** guarantee. Statutory signed artefacts (extracts, attestations, anchors) are wrapped in **PAdES-LTV** (embedding the full certificate chain, OCSP/CRL revocation data, and timestamp) at issue, and `JOB-M12-LTV` periodically applies **RFC 4998 evidence-record / archive timestamps** before certificate or algorithm expiry. A **crypto-migration procedure** (e.g., SHA-256 → SHA-384) re-anchors and re-timestamps existing chains **without rewriting history**: a new anchor over existing heads under the new algorithm, recorded in `sr_ltv_renewals` (E25), so old `entry_hash`es remain verifiable under their stored `hash_algorithm`/`ledger_version` while new evidence binds them forward.

**Acceptance Criteria.**
1. Each statutory signed extract/attestation is LTV-wrapped at issue (cert chain + revocation data + timestamp embedded).
2. `JOB-M12-LTV` identifies artefacts approaching cert/algorithm expiry and applies an archive timestamp, recording an `sr_ltv_renewals` row.
3. A crypto-migration produces a RE_ANCHOR/ALGORITHM_MIGRATION renewal: a new anchor over existing heads under the new algorithm; **no historical `entry_hash` is recomputed/overwritten**.
4. After renewal, an artefact still verifies (signature + at least one valid archive timestamp chain).
5. LTV renewal backlog is a monitored metric; overdue renewals alert.

**Business Rules.**
- BR-19.1 Renewal never alters the original signed bytes; it adds evidence layers.
- BR-19.2 Per-row `hash_algorithm`/`ledger_version` (FR-03) make mixed-algorithm verification deterministic across a migration.
- BR-19.3 A migration re-anchors but does not rewrite the ledger; FR-04 verifies each row under its own algorithm.
- BR-19.4 §65B certificates (FR-18) are renewed with their extracts.

**Data Model References.** `sr_ltv_renewals` (write), `sr_certified_extracts`/`sr_attestations`/`sr_anchors` (subjects), `documents` (M13).

**API References.** `POST /api/v1/sr/ltv/renew` (manual/migration); `GET /api/v1/sr/ltv/renewals`; `POST /api/v1/sr/crypto/migrate` (admin, re-anchor).

**UI Behavior Notes.** Admin "Crypto & LTV" panel: algorithm status, renewal backlog, migration wizard (preview impact, re-anchor, confirm), per-artefact LTV status badge. Auditor read view.

**Edge Cases.** TSA/CA unavailable during a renewal window → retry + backlog alert (artefact remains valid on its prior timestamp until renewed); algorithm deprecation announced → migration scheduled before deprecation date; **a never-renewed legacy artefact flagged for priority renewal.**

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `LtvWrapper`, `EvidenceRecordRenewer` (`JOB-M12-LTV`), `CryptoMigrationService`, `AnchorClient`, `RenewalRepository` |
| Backend flow | At issue → embed cert chain + revocation + timestamp; on schedule → archive-timestamp expiring artefacts; on migration → re-anchor heads under new algorithm + record renewal |
| Data operations | INSERT `sr_ltv_renewals`; new anchor on migration; update artefact LTV status |
| Validation | Renewal before expiry; no original-byte mutation; mixed-algorithm verification |
| Authorization | scheduler internal; `sr.crypto.migrate` (admin) |
| State changes | LTV status; new anchor; renewal records |
| Failure handling | TSA/CA down → retry + backlog; migration is additive (no rewrite) |
| Dependencies | TSA, CA, `sr_anchors`, FR-03 per-row algorithm |
| Test guidance | Verify after simulated cert expiry; mixed-algorithm verification post-migration; **no historical hash rewrite**; renewal backlog metric |

---

### FR-20 — **Bulk corrigendum workflow** — *NEW v2 (R14, Medium)*

- **ID:** FR-20
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian (maker), Second Custodian (sampling approve), Appointing Authority (trigger ref)
- **User Story:** *As an SR Custodian facing a pay-commission revision affecting 14,000 records, I want a batch corrigendum with sampling-based approval, so a routine cadre-wide event does not take months of one-by-one clicks while still keeping a full per-entry audit and supersession trail.*

**Description.** For cadre-wide / pay-commission / court-directed mass corrections, `sr_bulk_corrigendum_batch` (E26) selects affected entries by `target_selector` (cadre, category, date range), previews the proposed corrigenda, and routes a **sampling-based approval** (`WF-M12-BULK-CORRIGENDUM`): a statistically-sized sample is reviewed and co-signed by a second custodian; on approval the batch **applies per-entry corrigenda via FR-05** (each a real supersession with its own `sr_corrections` + `sr_status_events` rows), retaining full per-entry audit. Per-entry failures are logged and do not abort the batch; qualifying-service changes re-emit to the pull-feed.

**Acceptance Criteria.**
1. A batch selects affected entries by criteria and previews proposed corrigenda with a count.
2. A statistically-sized sample is presented for second-custodian review; approval is recorded.
3. On APPROVED, the batch applies one corrigendum per affected entry through the standard FR-05 path (real supersession, full per-entry audit).
4. Per-entry failures are logged (`failed_count`) and do not abort; the batch reports applied vs. failed.
5. Each applied corrigendum carries the batch reference and triggers pull-feed re-emit where qualifying service changes.
6. Maker ≠ sampling-approver (separation of duties).

**Business Rules.**
- BR-20.1 Bulk corrigenda are not a ledger bypass — each is a normal FR-05 supersession.
- BR-20.2 Sampling parameters (sample size, acceptance threshold) are configurable and recorded on the batch.
- BR-20.3 A failed entry is re-queued individually, never silently skipped.
- BR-20.4 IDENTITY-category changes are excluded from bulk (they require per-entry dual sign-off via FR-05).

**Data Model References.** `sr_bulk_corrigendum_batch` (write), `sr_corrections`/`service_register_events`/`sr_status_events` (per-entry via FR-05), `workflow_instances`, `audit_log`.

**API References.** `POST /api/v1/sr/bulk-corrigenda` (create + selector); `POST /api/v1/sr/bulk-corrigenda/{id}/preview`; `POST /api/v1/sr/bulk-corrigenda/{id}/sample-approve`; `POST /api/v1/sr/bulk-corrigenda/{id}/apply`.

**UI Behavior Notes.** Custodian "Bulk corrigendum" console: selector builder, impact preview (count + sample), sampling-approval view for second custodian, apply with progress + per-entry outcome list, downloadable applied/failed report. Plain-language consequence text before apply.

**Edge Cases.** Selector matches an IDENTITY entry → excluded with note; sample fails acceptance threshold → batch REJECTED, nothing applied; partial apply failure → failed entries listed + re-queued; concurrent single corrigendum on a targeted entry → per-entry FR-05 re-resolves latest active.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `BulkCorrigendumService`, `TargetSelectorEngine`, `SamplingApprovalService`, `CorrectionService` (FR-05), `WorkflowAdapter` (`WF-M12-BULK-CORRIGENDUM`) |
| Backend flow | Create + select → preview → sample → second-custodian approve → apply per-entry via FR-05 → report applied/failed |
| Data operations | INSERT bulk batch; per-entry INSERT corrections + corrigendum + status transition |
| Validation | Selector validity; sampling threshold; SoD; IDENTITY exclusion |
| Authorization | `sr.bulkcorr.create` (custodian); `sr.bulkcorr.approve` (2nd custodian) |
| State changes | DRAFT→PREVIEW→SAMPLING_APPROVAL→APPROVED→APPLYING→APPLIED/REJECTED; per-entry supersessions |
| Failure handling | Per-entry failure logged + re-queued; sample reject → no application |
| Dependencies | FR-05, workflow, FR-13 re-emit |
| Test guidance | Sampling approval gate; per-entry audit retained; IDENTITY exclusion; partial-failure isolation; SoD |

---

### FR-21 — **Grievance & appeal escalation** — *NEW v2 (R6, High)*

- **ID:** FR-21
- **Module:** M12-SR
- **Primary Role(s):** Employee/Heir (appellant), Appellate Authority (decide), SR Custodian (implement outcome)
- **User Story:** *As an employee whose dispute the custodian merely upheld, I want to escalate to an independent appellate authority whose decision binds the custodian, so a statutory record does not rest on one un-appealed role.*

**Description.** This FR engineers **separation of the final word** from the custodian. When a custodian UPHOLDS a dispute (FR-06), the appellant (employee or, for deceased cases, nominee/heir) may raise an appeal (`sr_appeals`, E23) to an independent **Appellate Authority** (a higher authority/tribunal) via `WF-M12-APPEAL`. The authority reviews the entry, lineage, and evidence (read-scoped) and records a binding outcome: UPHELD, OVERTURNED (auto-spawns a corrigendum via FR-05), REMANDED (back to custodian with directions), or WITHDRAWN. The appealed/contested status is visible on the timeline and on any certified extract that includes the entry (no clean extract over a live appeal).

**Acceptance Criteria.**
1. An appeal can be raised only after a custodian UPHELD a dispute on the in-scope SR.
2. The appeal routes to an assigned Appellate Authority via `WF-M12-APPEAL` with SLA timers.
3. The authority records a binding outcome (UPHELD/OVERTURNED/REMANDED/WITHDRAWN) with decision text.
4. An OVERTURNED outcome auto-spawns a corrigendum (FR-05) implementing the decision; the custodian cannot refuse it.
5. The entry shows an "Under appeal"/"Appeal decided" status on the timeline and on extracts.
6. The full appeal history is preserved and auditable.

**Business Rules.**
- BR-21.1 Appeal eligibility requires a prior custodian UPHOLD (`SR_APPEAL_NOT_ELIGIBLE` otherwise).
- BR-21.2 The Appellate Authority is independent of the custodian who upheld (segregation).
- BR-21.3 An OVERTURNED decision is binding; the resulting corrigendum cites the appeal id.
- BR-21.4 A live appeal renders on certified extracts (FR-10) and blocks marking the entry EMPLOYEE_VERIFIED until decided.

**Data Model References.** `sr_appeals` (write), `sr_corrections` (FR-06 source dispute; FR-05 resulting corrigendum), `service_register_events` (status via chain), `workflow_instances` (`WF-M12-APPEAL`), `notifications`.

**API References.** `POST /api/v1/sr/disputes/{id}/appeal`; `GET /api/v1/sr/appeals?employee_id=`; `POST /api/v1/sr/appeals/{id}/decide`; `POST /api/v1/sr/appeals/{id}/withdraw`.

**UI Behavior Notes.** Employee/heir "Appeal" action (post-uphold) with grounds capture; Appellate Authority console: appealed-case queue, entry + lineage + evidence review, decision form (outcome + binding text); timeline/extract "Under appeal" badge. Plain-language guidance on appeal rights (council Improvement 20).

**Edge Cases.** Appeal before any uphold → blocked; appellant deceased mid-appeal → heir continues; REMANDED → custodian re-decides with directions, re-appealable; OVERTURNED but corrigendum fails validation → flagged for custodian action, decision still binding.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AppealService`, `WorkflowAdapter` (`WF-M12-APPEAL`), `CorrectionService` (FR-05 on overturn), `StatusLedger`, `NotificationAdapter` |
| Backend flow | Post-uphold raise → assign authority → review → decide → (overturn) spawn corrigendum → status/extract reflects appeal |
| Data operations | INSERT/UPDATE `sr_appeals`; status transition; INSERT corrigendum on overturn |
| Validation | Eligibility (prior uphold); independence; binding-outcome handling |
| Authorization | appellant `sr.appeal.create`; authority `sr.appeal.decide` |
| State changes | RAISED→UNDER_APPEAL→UPHELD/OVERTURNED/REMANDED/WITHDRAWN; possible FR-05 spawn |
| Failure handling | Ineligible → 409; overturn-corrigendum failure → flagged, decision preserved |
| Dependencies | FR-06, FR-05, FR-10 (extract visibility), workflow |
| Test guidance | Eligibility gate; independence; binding overturn spawns corrigendum; appeal visible on extract; heir continuation |

---

## Section 7 — UI Requirements

### 7.1 Surfaces & layouts (v2 additions in **bold**)

| Surface | Primary role | Key elements | States covered |
|---|---|---|---|
| **SR Timeline (self-service)** | Employee | Year-grouped timeline; filters (category/date/status/**confidence**); entry cards with **content+status+confidence+dispute/appeal badges**; document links; "show superseded" toggle | empty / loading / error / permission / populated |
| **Custodian Console** | SR Custodian | Tabs: Attestation queue, Corrections, **Bulk corrigendum**, Taxonomy, Verification cycles, **Completeness/gaps**, Extracts, Subscriptions, Access trail, **Crypto & LTV** | per-tab empty/error/success |
| **Manual Record Event** | SR Custodian / HR | Type-driven dynamic form; order/document fields; **semantic-conflict panel**; maker-checker submit | validation / success / conflict |
| **Periodic Verification Wizard** | Employee / **Heir** / HR (assist) | Period summary; **"review N exceptions, bulk-confirm M routine"**; per-exception confirm/dispute; qualified/OTP signature; **assisted consent / heir identity capture** | in-progress / disputed / bulk / assisted / heir / complete |
| **Correction / Corrigendum** | HR / Custodian / **2nd Custodian** | Original vs. corrected diff; reason/evidence; approve + **co-sign** step | pending / approved / rejected |
| **Bulk Corrigendum Console** | Custodian / **2nd Custodian** | Selector builder; impact preview + sample; sampling approval; apply with per-entry outcome | draft / preview / sampling / applied / rejected |
| **Completeness / Gaps Console** | Custodian / Employee | Gap list by severity/age; explain/close/record; employee corroborate panel | empty / flagged / resolved |
| **Digitisation Workbench** | HR / Custodian | Batch Kanban; split scan + entry; verification compare; **confidence selector + evidence note**; reconciliation; promote (+co-sign) | each pipeline state |
| **Forensics Dashboard** | Auditor / Custodian | **Content + status + anchor** integrity banners; lineage graph; coverage + **gap** gauges; as-of picker; access anomalies | pass / fail / loading |
| **Certified Extract** | Custodian / **2nd Custodian** / Employee | Scope + **purpose/redaction-policy** picker (with exclusion preview); preview; **co-sign (FULL_SR)**; qualified-sign; download + QR + **§65B link** | gated / signed / revoked |
| **Appeal Console** | Employee/Heir / **Appellate Authority** | Post-uphold appeal action; appealed-case queue; lineage review; binding decision form | eligible / under-appeal / decided |
| **Crypto & LTV Panel** | Sys Admin / Auditor | Algorithm status; LTV renewal backlog; migration wizard (preview/re-anchor); per-artefact LTV badge | nominal / backlog / migrating |
| **Public Verification Page** | Public | Status banner; minimal metadata; **offline-verify (CA chain + anchor) instructions**; digest-match | valid / revoked / not-found / rate-limited |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA: keyboard navigation, focus order, ARIA labels, AA contrast, no colour-only status (badges carry text).
- Mobile-first: collapsible sidebar/hamburger; timeline and verification wizard fully usable on mobile.
- Dark mode via design tokens.
- Every list paginated (≤100), with empty/loading/error states; destructive/irreversible-looking actions (revoke, promote, apply bulk) confirm with explicit consequence text.
- Dates display `DD-MMM-YYYY`; provenance, integrity, and confidence always visible on entries.
- No skeleton-only screens: real fields, data, API calls, and states throughout.
- **Plain-language layer (v2, council Improvement 20).** Every crypto/legal term has a plain-language tooltip and help-panel translation: "corrigendum" → "official correction that keeps the original"; "supersession" → "replaced by a corrected entry"; "anchor" → "independent tamper-proof timestamp"; "reconstructed" → "re-entered from a faded/damaged page — please confirm"; "under appeal" → "you have challenged this to a higher authority". A role-appropriate **operator playbook** ships with the custodian console; a citizen help page explains what a certified copy and a §65B certificate prove. Grievance/appeal routes are surfaced in plain language wherever a dispute can be raised.

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/sr`; ingestion contract `/api/v1/sr/ingest` (separately versioned).
- **Cursor pagination** on all list/timeline endpoints (`?limit=` default 25, max 100; `cursor=`; `next_cursor`).
- All unsafe POSTs accept an `Idempotency-Key`; a repeat within 24h returns the original result.
- Every request carries/echoes `X-Correlation-Id`, written to every audit and log line.
- **Platform error envelope:** `{ "error": { "code", "message", "field", "details" } }`; user-facing copy resolves via plain-language `ERR-M12-*` ids.
- **Inherited standard codes:** `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500), `UPSTREAM_UNAVAILABLE` (503).

### 8.2 Error-code catalog (M12-specific; v1 codes retained, v2 additions in **bold**)

| Code | HTTP | Meaning |
|---|---|---|
| `SR_TYPE_NOT_FOUND` | 404 | No published event type effective for the given date |
| `SR_TYPE_OVERLAP` | 409 | Overlapping effective ranges on publish |
| `SR_PAYLOAD_INVALID` | 422 | Payload fails the type's JSON Schema |
| `SR_SOURCE_NOT_ALLOWED` | 403 | Source module not in the type's allowlist |
| `SR_EMPLOYEE_NOT_FOUND` | 404 | `employee_id` not in M01 |
| `SR_FUTURE_DATE` | 422 | `event_date` beyond future tolerance |
| `SR_DUPLICATE_EVENT` | 409 | Duplicate idempotency key (surfaced as `DUPLICATE_NOOP`) |
| **`SR_FACT_KEY_REQUIRED`** | 422 | Qualifying-service-bearing event missing semantic `fact_key` |
| **`SR_SEMANTIC_DUPLICATE`** | 409 | Same real-world fact already recorded (surfaced as `SEMANTIC_DUPLICATE_NOOP`) |
| **`SR_SEMANTIC_CONFLICT`** | 409 | Same `fact_key`, disagreeing facts — flagged for reconciliation |
| **`SR_REVERSAL_TARGET_NOT_FOUND`** | 404 | Reversal references an unknown `source_reference_id` |
| `SR_ENTRY_IMMUTABLE` | 409 | Attempt to edit/delete a ledger entry |
| `SR_ENTRY_SUPERSEDED` | 409 | Action invalid on a superseded entry |
| `SR_ENTRY_DISPUTED` | 409 | Attest/verify blocked by open dispute |
| `SR_ATTESTATION_REQUIRED` | 412 | Action needs prior attestation |
| **`SR_SIGNATURE_NOT_QUALIFIED`** | 422 | Server-signed signature rejected for a statutory output |
| `SR_INTEGRITY_FAILED` | 422 | Hash-chain verification failed |
| **`SR_STATUS_CHAIN_FAILED`** | 422 | Status sub-ledger verification failed |
| **`SR_ANCHOR_MISMATCH`** | 422 | Chain head does not match the external anchor (insider/stale-restore) |
| **`SR_ANCHOR_MISSING`** | 412 | No current anchor within cadence |
| `SR_PURPOSE_REQUIRED` | 422 | Non-self access without stated purpose |
| **`SR_REDACTION_REQUIRED`** | 412 | Requested scope exceeds redaction entitlement |
| `SR_EXTRACT_REVOKED` | 409 | Operation on a revoked extract |
| **`SR_SECOND_CUSTODIAN_REQUIRED`** | 412 | FULL_SR extract / routine corrigendum lacks a distinct co-signer |
| **`SR_APPEAL_NOT_ELIGIBLE`** | 409 | Appeal raised without a prior custodian uphold |
| **`SR_GAP_UNRESOLVED`** | 412 | CRITICAL completeness gap blocks pre-retirement finalisation |
| **`SR_DELIVERY_MODE_DEFERRED`** | 409 | WEBHOOK/MESSAGE_BUS subscription registered while deferred |
| `SR_LEGACY_UNMATCHED` | 409 | Promotion blocked: record not matched to master |
| `SR_LEGAL_HOLD_ACTIVE` | 409 | Tiering/change blocked by legal hold |
| **`SR_STALE_RESTORE`** | 409 | Restored chain heads predate the external anchor |
| `SR_DELETION_FORBIDDEN` | 403 | Any deletion attempt on the statutory ledger |

### 8.3 JSON examples

**Ingest an event with semantic fact key (request):**

```json
POST /api/v1/sr/ingest
Idempotency-Key: M06:ord-9912:v1
{
  "source_module": "M06",
  "source_reference_id": "ord-9912",
  "source_event_version": 1,
  "event_type_code": "PROMOTION",
  "employee_id": "8f3a...aa",
  "event_date": "2019-06-01",
  "fact_key": "EMP:8f3a...aa|CAT:PROMOTION|EFF:2019-06-01|POST:HEADMASTER",
  "order_no": "PROM/2019/9912",
  "order_date": "2019-05-20",
  "sanctioning_authority": "Director of Education",
  "payload": { "from_designation": "Asst. Teacher", "to_designation": "Headmaster", "pay_scale": "Level-9" },
  "document_ids": ["doc-aa11"],
  "qualifying_service_impact": "QUALIFYING"
}
```

**Ingest (success — with trusted timestamp):**

```json
{
  "sr_event_id": "sr-0042",
  "sequence_no": 42,
  "entry_hash": "9f2c...e1",
  "prev_event_hash": "1b77...c0",
  "tsa_timestamp_token": "MIIF...rfc3161",
  "attestation_status": "UNATTESTED",
  "validation_result": "ACCEPTED",
  "correlationId": "X-Correlation-Id: 9c1f-7781"
}
```

**Ingest (semantic duplicate — same fact from a second module):**

```json
{
  "sr_event_id": "sr-0042",
  "validation_result": "SEMANTIC_DUPLICATE_NOOP",
  "details": { "matched_fact_key": "EMP:8f3a...aa|CAT:PROMOTION|EFF:2019-06-01|POST:HEADMASTER" },
  "correlationId": "X-Correlation-Id: 9c1f-7790"
}
```

**Reversal (order quashed by tribunal):**

```json
POST /api/v1/sr/ingest/reversal
{
  "source_module": "M09",
  "reverses_source_reference_id": "case-557",
  "source_reference_id": "case-557-quash",
  "event_type_code": "MAJOR_PENALTY_REVERSAL",
  "employee_id": "8f3a...aa",
  "event_date": "2026-05-10",
  "order_no": "OA/4471/2026",
  "sanctioning_authority": "State Administrative Tribunal"
}
```
*Response spawns `WF-M12-CORRIGENDUM` and returns the correction id.*

**Integrity verify (FAIL — anchor mismatch):**

```json
{
  "error": {
    "code": "SR_ANCHOR_MISMATCH",
    "message": "Chain head for employee does not match the latest anchor — possible insider edit or stale restore.",
    "field": "employee_id",
    "details": { "cause": "ANCHOR_MISMATCH", "anchor_id": "an-02", "expected_head": "9f10...ee", "stored_head": "77aa...12" }
  },
  "requestId": "X-Correlation-Id: a1b2-3344"
}
```

**Public verification (valid — with offline hints):**

```json
GET /api/v1/sr/verify/3kQ9...tokn
{
  "status": "VALID",
  "extract_no": "SR-EXT-2026-000451",
  "issued_at": "2026-06-15",
  "employee_name_masked": "R**** K****",
  "scope": "FULL_SR",
  "redacted_categories": [],
  "event_count": 312,
  "content_digest": "a91f...77",
  "anchor_id": "an-02",
  "ca_chain_published_at": "https://gov-ca.example/cgg-chain.pem",
  "offline_verifiable": true
}
```

### 8.4 Integration map (v2 changes in **bold**)

| Counterparty | Direction | Mechanism |
|---|---|---|
| M03/M04 (leave) | inbound | Ingestion contract (leave spell events) |
| M05 (transfer) | inbound | Ingestion contract (posting/transfer/relieving/joining + **cancellations**) |
| M06 (promotion) | inbound + **pull-feed** | Ingestion + pull-feed subscription |
| M08 (appraisal) | inbound | Ingestion (appraisal-recorded) |
| M09 (disciplinary) | inbound | Ingestion (punishment/suspension + **reversal on quash**) |
| M10 (payroll) | inbound | Ingestion (pay-fixation/increment); **service-rule source for completeness (FR-17)** |
| M11 (pension) | outbound | **Pull-feed** + certified-extract consumption; pre-retirement verification + **CRITICAL-gap** gate; **nominee records for heir verification** |
| M01 (employee) | reference | Existence/identity checks; status triggers archival; cadre for expected-event rules |
| M13 (documents) | reference | Scans, order copies, signed extract PDFs, **anchor WORM export, §65B certificates** |
| M14 (analytics) | outbound | Analytics aggregates + pull-feed |
| **Licensed CA / HSM** | reference | **Qualified signatures (statutory)** |
| **RFC 3161 TSA** | reference | **Trusted timestamps on commits, anchors, signatures, LTV renewals** |
| **External WORM / notary** | outbound | **Anchor Merkle-root export (root of trust)** |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 timeline/read API < 500ms; P95 ingestion write < 400ms (**includes TSA round-trip budget; TSA timeout → deferred-stamp, never blocks the statutory record**); single-chain (content+status) verification < 1s typical; **full-population nightly sweep + anchor within a load-tested window (SLA committed only after a load test against the target tens-of-millions-of-rows population — council Improvement 20)** |
| **Availability** | 99.9% uptime; ingestion endpoint highly available (sources retry on 503 with idempotency); **TSA/CA degradation handled via deferred-stamp + backlog, not outage** |
| **Scalability** | Horizontal scale of read/ingestion; ledger + status sub-ledger partitioned by employee/time; anchors per-tenant; tens of millions of entries |
| **Durability** | RPO ≤ 15 min; RTO ≤ 4h; ledger permanent — backups + WAL archiving; **DR restore gated by anchor reconciliation (stale-restore detection, FR-04/§13.2)**; archival tier for retired cohorts |
| **Integrity** | SHA-256 content + status hash-chaining; 100% chain-verifiable; **mandatory external anchoring (RFC 3161-timestamped Merkle root to independent WORM) — head-vs-anchor mismatch is a non-suppressible FAIL**; deletion structurally forbidden; **WORM/append-only substrate with write-principal segregation** |
| **Non-repudiation** | **Qualified e-signatures (licensed CA) mandatory for statutory attestations/extracts; RFC 3161 trusted timestamps on commits/anchors/signatures; server-signing banned for statutory outputs** |
| **Longevity** | **PAdES-LTV envelopes + RFC 4998 evidence-record renewal (`JOB-M12-LTV`); crypto-migration re-anchors without rewriting history; §65B/BSA certificate on statutory extracts — signed records verifiable decades later** |
| **Completeness** | **Expected-event reconciliation (FR-17); measurable gap-closure rate (replaces "100% complete"); CRITICAL gaps gate pre-retirement finalisation** |
| **Security** | OWASP ASVS; TLS 1.2+; AES-256 at rest; least-privilege RBAC + org row-scoping; ingestion principal cannot read; fail-closed access logging; **separation of duties for corrigenda/FULL_SR extracts** |
| **Privacy (DPDP)** | **DPDP Act 2023: permanent retention on the legal-obligation lawful basis (§17) — ledger exempt from erasure; data-principal correction maps to the corrigendum flow; payload minimisation for sensitive categories (no clinical detail); purpose-driven extract redaction; masked public verification; full access trail** |
| **Auditability** | Every read/write/print/extract/anchor-verify logged; immutable `audit_log` + `sr_access_log` + status sub-ledger; forensics reconstruction |
| **Accessibility** | WCAG 2.1 AA across all UI; **plain-language layer + assisted/heir verification for low-literacy/no-device/deceased cases** |
| **Retention** | Permanent statutory retention; legal hold; no purge path; **cross-tenant chain continuity** |
| **Observability** | Metrics: ingestion rate, content+status integrity, **anchor freshness & head-match rate, gap-closure rate, LTV renewal backlog**, attestation backlog, verification completion, extract issuance, **appeal backlog**, subscription lag |
| **Compatibility** | Versioned ingestion contract with published sunset windows; per-row `hash_algorithm`/`ledger_version` for crypto migration that **re-anchors, never rewrites** |

---

## Section 10 — Workflow & State Diagrams (state tables)

### 10.1 Ledger entry lifecycle (`entry_status` / `attestation_status` — projected from `sr_status_events`)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | Ingest valid event | ACTIVE / UNATTESTED | Append + content hash-chain + RFC 3161 stamp (FR-03); status-chain genesis |
| ACTIVE / UNATTESTED | Custodian attest (qualified) | ACTIVE / ATTESTED | Attestation row + signed digest + timestamp (FR-07); ATTESTATION_STATUS transition |
| ACTIVE / ATTESTED | Employee/heir/assisted verify | ACTIVE / EMPLOYEE_VERIFIED | Cycle confirmation (FR-08) |
| ACTIVE / * | Employee/heir raises dispute | ACTIVE / DISPUTED | Dispute record (FR-06); ATTESTATION_STATUS transition |
| ACTIVE / DISPUTED | Dispute resolved (upheld) | ACTIVE / (prior) | Resolution note; **appeal now eligible (FR-21)** |
| ACTIVE / DISPUTED | Dispute/appeal → corrigendum | SUPERSEDED | New ACTIVE corrigendum (FR-05); SUPERSESSION transition |
| ACTIVE / * | Corrigendum / reversal / bulk corrigendum | SUPERSEDED | `superseded_by_event_id` (via status chain); new ACTIVE entry |
| ACTIVE / * | Annotation added | ANNOTATED (content unchanged) | Annotation record (FR-06) |
| any | Delete attempt | (rejected) | `SR_DELETION_FORBIDDEN` + security alert |

### 10.2 Correction (`sr_corrections.decision`) — *v2: + second-custodian co-sign*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Maker submits corrigendum | PENDING | Reason + evidence (identity ⇒ dual sign-off) |
| PENDING | Custodian approves + **2nd custodian co-signs** | APPROVED | maker ≠ checker ≠ 2nd custodian; appends corrigendum, supersedes original |
| PENDING | Custodian rejects | REJECTED | No ledger change |

### 10.3 Verification cycle (`sr_verification_cycles.status`) — *v2: + bulk/assisted/heir + gap gate*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Scheduler opens | OPEN | Period boundary / pre-retirement / DEATH ⇒ HEIR_PENDING |
| OPEN | Employee starts review | EMPLOYEE_REVIEW / BULK_REVIEW | exceptions risk-surfaced |
| OPEN | HR assists | ASSISTED | consent captured |
| HEIR_PENDING | Heir identity verified | EMPLOYEE_REVIEW | nominee/heir verified |
| EMPLOYEE_REVIEW/BULK_REVIEW | Dispute raised | DISPUTED | Routes to FR-06 |
| DISPUTED | Disputes resolved | CUSTODIAN_REVIEW | — |
| EMPLOYEE_REVIEW/BULK_REVIEW/ASSISTED | Confirm (sign) | CUSTODIAN_REVIEW | exceptions acknowledged |
| CUSTODIAN_REVIEW | Custodian finalises (sign) | COMPLETED | No open disputes; **all CRITICAL gaps EXPLAINED/CLOSED (FR-17)** |
| OPEN/EMPLOYEE_REVIEW/DISPUTED | Past due_date | OVERDUE | Escalation notifications |

### 10.4 Legacy digitisation batch (`batch.status`) — *v2: confidence-flagged*

| From | Event | To | Guard |
|---|---|---|---|
| CREATED | Scans linked | SCANNING | M13 documents attached |
| SCANNING | Transcription done | DATA_ENTRY | Staged records created |
| DATA_ENTRY | Records entered + **confidence set** | DUAL_VERIFICATION | — |
| DUAL_VERIFICATION | All verified (maker ≠ verifier) | RECONCILIATION | — |
| RECONCILIATION | VERIFIED facts discrepancy=0; flagged facts have provenance+note+corroboration plan | READY_FOR_PROMOTION | All matched to M01; semantic dedup clear |
| READY_FOR_PROMOTION | Custodian promotes (+ co-sign for flagged) | PROMOTED | maker-checker; bulk append (FR-03) |
| any | Custodian rejects | REJECTED | Reason recorded |

### 10.5 Certified extract (`extract`) — *v2: redaction + co-sign + §65B*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Generate + redact + (FULL_SR co-sign) + qualified-sign + LTV | ISSUED (revoked=false) | Attestation gating; redaction entitlement; signed PDF in M13; §65B available |
| ISSUED | Corrigendum to included entry / custodian revokes | REVOKED | Reason; QR + revocation feed report REVOKED |

### 10.6 Appeal (`appeal.status`) — *NEW v2*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Appellant raises (post-uphold) | RAISED | Prior custodian UPHELD required |
| RAISED | Authority assigned | UNDER_APPEAL | Independent of upholding custodian |
| UNDER_APPEAL | Authority decides | UPHELD / OVERTURNED / REMANDED | OVERTURNED ⇒ spawn corrigendum (FR-05) |
| UNDER_APPEAL | Appellant withdraws | WITHDRAWN | — |
| REMANDED | Custodian re-decides | (re-appealable) | Directions recorded |

### 10.7 Bulk corrigendum (`bulk_corrigendum.status`) — *NEW v2*

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Create + selector | DRAFT | — |
| DRAFT | Preview impact | PREVIEW | count + sample computed |
| PREVIEW | Submit for sampling approval | SAMPLING_APPROVAL | sample sized |
| SAMPLING_APPROVAL | 2nd custodian approves sample | APPROVED | maker ≠ approver; threshold met |
| SAMPLING_APPROVAL | Sample fails | REJECTED | nothing applied |
| APPROVED | Apply | APPLYING → APPLIED | per-entry FR-05; failures logged, not aborting |

---

## Section 11 — Notifications

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| New SR entry recorded | Ingestion ACCEPTED | Employee (digest), Custodian queue | In-app, optional email |
| **Semantic conflict** | `SEMANTIC_CONFLICT` on ingest | SR Custodian (reconciliation) | In-app |
| Entry requires attestation | UNATTESTED mandatory-attest | SR Custodian | In-app queue |
| **PKI unavailable (attestation backlog)** | Qualified signing unavailable | SR Custodian, Sys Admin | In-app (high) |
| Verification cycle opened | Scheduler opens cycle | Employee / **Heir** | In-app, email |
| Verification overdue | Past due_date | Employee, Custodian, Reporting Manager | In-app, email |
| **Completeness gap flagged** | `JOB-M12-GAPSCAN` finding | Employee, SR Custodian | In-app, email (CRITICAL) |
| **CRITICAL gap blocks pension** | Pre-retirement finalise blocked | Employee, Custodian, M11 | In-app, email |
| Dispute raised | Employee/heir disputes | SR Custodian | In-app |
| Dispute resolved | Custodian resolves | Employee | In-app, email |
| **Appeal raised / decided** | FR-21 transitions | Appellate Authority / Employee / Custodian | In-app, email |
| Corrigendum / reversal / bulk corrigendum issued | Correction approved/applied | Employee, M11 (pull-feed) | In-app + pull-feed |
| **Anchor mismatch / integrity FAIL** | FR-04 FAIL | SR Custodian, Auditor | In-app (high severity), email |
| Access anomaly | Anomaly rule triggers | SR Custodian, Auditor | In-app |
| Certified extract issued / revoked | FR-10 | Requestor, Employee | In-app, email (link) |
| **§65B certificate issued** | FR-18 | Requestor, Auditor | In-app |
| **LTV renewal backlog / crypto migration** | `JOB-M12-LTV` / migration | Sys Admin, Auditor | In-app |
| Legacy batch ready / promoted | Status transition | HR maker, Custodian | In-app |
| Pre-retirement verification due | N months before superannuation | Employee, Custodian, M11 | In-app, email |

**Platform alignment (X.2 / Foundation §5).** Each row maps to a plain-language `MSG-M12-*` id (e.g., `MSG-M12-ENTRY-RECORDED`, `MSG-M12-SEMCONFLICT`, `MSG-M12-ATTEST-DUE`, `MSG-M12-PKI-DOWN`, `MSG-M12-VERIFY-OPEN`, `MSG-M12-VERIFY-OVERDUE`, `MSG-M12-GAP-FLAGGED`, `MSG-M12-GAP-PENSION-BLOCK`, `MSG-M12-DISPUTE`, `MSG-M12-APPEAL`, `MSG-M12-CORRIGENDUM`, `MSG-M12-ANCHOR-FAIL`, `MSG-M12-EXTRACT-ISSUED`, `MSG-M12-65B-ISSUED`, `MSG-M12-LTV-BACKLOG`, `MSG-M12-PRERETIRE-VERIFY`); copy lives once in the Message Catalogue. **IN_APP + EMAIL in parallel** for approval-bearing events; **statutory notifications (verification due/overdue, integrity/anchor FAIL, CRITICAL gap, pre-retirement verification, appeal outcome) are mandatory and not user-suppressible**; non-urgent IN_APP supports digest mode and quiet-hours. Retry with exponential backoff up to 5 attempts + DLQ; every dispatch audit-logged. Sensitive content referenced, not embedded. **All user-facing copy is plain-language (council Improvement 20).** Optional Microsoft Teams actionable cards for SR approvals (additive channel, never the system of record).

---

## Section 12 — Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| **SR completeness & gap-closure** | Custodian, Auditor | Expected vs. recorded by category/org_unit/cadre; gaps by severity/age; **gap-closure rate (the v2 completeness metric)** |
| Attestation backlog | Custodian | UNATTESTED mandatory-attest by age/office; **PKI-unavailable backlog** |
| Verification completion | Custodian, HR | Cycles by status; overdue; pre-retirement readiness; **assisted/heir cycles** |
| **Integrity & anchor health** | Auditor | Content + status chains verified, FAIL findings, **anchor freshness & head-match rate, stale-restore events** |
| Access & anomaly | Auditor | Access volumes by actor/employee; flagged anomalies |
| Correction, dispute & appeal log | Auditor | Corrigenda (incl. bulk), annotations, disputes, **appeals with outcomes** |
| Digitisation progress | HR, Custodian | Batches by status; records verified/promoted; **confidence-flag distribution**; discrepancies |
| Extract issuance | Custodian | Extracts issued/revoked by purpose/redaction; **§65B certificates** |
| **Longevity / LTV** | Auditor, Sys Admin | LTV renewal backlog; crypto-migration status; artefacts re-validated post-expiry |
| Event volume analytics | M14 | Events by category/time/org_unit (feeds dashboards) |

Aggregates are exposed to M14 via `GET /api/v1/sr/analytics/summary` and the pull-feed; all respect RBAC and access logging. Exports are paginated/async for large populations.

---

## Section 13 — Migration & Launch

### 13.1 Migration approach — *v2: crypto/admissibility decision gated first (R9)*

> **GATE 0 (NEW v2 — before any ledger code, council §3.7 "the one thing to do first").** Produce the **Crypto & Admissibility Decision Memo** and **confirm availability of a licensed CA, an HSM, and an RFC 3161 TSA, plus WORM/object-lock at CGG Data Centre**. The hashing/canonicalisation, qualified-signature envelope, RFC 3161 timestamping, PAdES-LTV/RFC 4998 renewal, the mandatory anchor hook, and the §65B certificate are **designed as one unit** before FR-03 is built. If PKI/TSA/WORM is unavailable at launch, this is an **escalation**, not a silent degradation to server-signing. CA/HSM/TSA procurement runs **in parallel with FR-01 taxonomy seed** because empanelment is the schedule long pole.

Runs on the platform **P06 ETL+V** framework (idempotent, re-runnable), recorded in `migration_runs`, with **three mandatory staging dry runs**, **zero reconciliation tolerance for facts promoted as fully attested (VERIFIED)** — and a **confidence-flagged lane (RECONSTRUCTED / LEGACY_UNVERIFIABLE)** for illegible/contradictory books so the programme proceeds without fabricating certainty. Failed records logged with source row + violated rule; legacy source read-only ≥ 4 weeks post-go-live; permanent `legacy_source_id`. Sequenced after Wave 1 (M01 master + org structure).

1. **Crypto & admissibility (GATE 0):** CA/HSM/TSA/WORM confirmed; canonicalisation + signature + LTV + anchor envelopes finalised; **anchor hook mandatory in FR-03 from day one** (retrofitting it onto a populated ledger is a rewrite).
2. **Taxonomy + expected-event + fact-correlation seed (FR-01/FR-17):** publish the launch catalog (17 categories), **expected-event rules per cadre, and fact-correlation rules** — the completeness and semantic-dedup models exist **before** digitisation, not after (council Improvement 19/Executor sequencing).
3. **Master alignment:** confirm M01 golden source; build the legacy matcher and **semantic dedup keys**.
4. **Bulk legacy digitisation (FR-14):** prioritised cohorts (near-retirement first), scan → data entry → dual verify → **confidence-classify** → reconcile → custodian promote, with provenance, `legacy_source_id`, scan linkage.
5. **Genesis / continuation & chain bootstrap:** first appended entry uses `GENESIS`; transfers use CONTINUED + `prior_chain_head_hash`; **first anchor generated immediately after bootstrap** so heads are externally bound from the outset.
6. **Attestation backfill (FR-07):** custodian qualified-attests VERIFIED promoted entries or marks RECONSTRUCTED/LEGACY_UNVERIFIABLE for corroboration.
7. **Source-module cutover (FR-02):** enable ingestion principals for M03/M04/M05/M06/M08/M09/M10 with idempotent + semantic-dedup posting and reversal support; dual-write/verification window with M04 leave reconciliation.
8. **Pull-feed (FR-13):** register M11/M06/M14 pull-feed subscriptions before pension/seniority cutover.
9. **Gap scan + pre-retirement verification (FR-17/FR-08):** run `JOB-M12-GAPSCAN` and open cycles for the near-retirement cohort to surface gaps and validate digitised history before pension processing.

**Realistic build order (council Executor):** (1) crypto/key-custody/anchor/LTV spec + CA/TSA procurement ∥ FR-01/FR-17 seed; (2) FR-02/FR-03 ingestion + append with final canonicalisation + mandatory anchor hook; (3) FR-04 integrity + status-chain + anchor checks; (4) FR-09 timeline + FR-12 access log (first demoable user slice, builds trust early); (5) FR-05/06/07/08/21 correction/attestation/verification/appeal; (6) FR-10/11/18/19 extracts + offline verify + §65B + LTV; (7) FR-14 digitisation once the gap/confidence model exists; (8) FR-20 bulk corrigendum; (9) FR-13 single pull-feed last.

### 13.2 Launch readiness gates — *v2 additions in **bold***

| Gate | Criterion |
|---|---|
| **Crypto & admissibility (GATE 0)** | **CA/HSM/TSA/WORM confirmed; envelopes designed as one unit; no server-signing for statutory outputs** |
| Taxonomy + rules complete | All categories have published types; **expected-event + fact-correlation rules published** |
| Ingestion live | All source modules post idempotently + **semantically deduped**; 0 duplicate/double-counted entries in soak |
| Integrity green | 100% content + **status** chain verification on migrated population |
| **Anchor live** | **Anchors generated on cadence; 100% head-vs-anchor match; mismatch alarms wired** |
| Digitisation reconciled | VERIFIED cohort discrepancy=0; **flagged facts carry provenance + corroboration plan** |
| Verification piloted | Near-retirement cohort cycles completed; **assisted/heir paths exercised** |
| **Completeness piloted** | **`JOB-M12-GAPSCAN` run; CRITICAL gaps triaged; pension gate verified** |
| Admissibility | **Qualified-signed extract + RFC 3161 timestamp + §65B certificate produced and offline-verified** |
| Access & audit | Access logging fail-closed; forensics view operational |
| **DR validated (anchor)** | **Restore from backup verifies content + status chains AND reconciles heads against the external anchor (stale-restore detection)** |
| **Performance** | **Nightly sweep + anchor load-tested against target row volume; SLA committed from measured numbers** |

### 13.3 Rollback / contingency

- Ingestion is idempotent, semantically deduped, and append-only; a faulty source can be paused without data loss; replay resumes from the source.
- Digitisation promotion is atomic per batch; a bad batch is REJECTED, not partially promoted.
- No ledger deletion exists; correction-by-supersession (single, bulk, or reversal-driven) handles any post-launch error.
- **A stale restore is detected by anchor reconciliation and remediated by re-applying missing corrigenda before return to service; it never silently rewinds the record.**
- **If qualified signing/TSA degrades post-launch, statutory signing pauses (backlog + alert) rather than emitting legally-weak server-signed artefacts.**

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state tables)

| FR | Primary entities | Key APIs | State table |
|---|---|---|---|
| FR-01 Taxonomy (+cadence/correlation) | `sr_event_type`, `sr_expected_event_rule` | `/sr/event-types*` | §10 (config) |
| FR-02 Ingestion (+semantic dedup/reversal) | `sr_ingestion_requests`, `service_register_events` | `/sr/ingest`, `/sr/ingest/reversal` | 10.1 |
| FR-03 Append + content & status chains | `service_register_events`, `sr_status_events` | (internal append) | 10.1 |
| FR-04 Integrity (+status+anchor) | `service_register_events`, `sr_status_events`, `sr_anchors` | `/sr/integrity/*`, `/sr/anchors` | 10.1 |
| FR-05 Corrigendum/supersession (+co-sign/reversal) | `sr_corrections`, `service_register_events`, `sr_status_events` | `/sr/events/{id}/corrigendum` | 10.1, 10.2 |
| FR-06 Annotation/dispute/appeal-hook | `sr_corrections`, `sr_appeals` | `/sr/events/{id}/dispute|annotate` | 10.1 |
| FR-07 Attestation (qualified) | `sr_attestations`, `sr_status_events` | `/sr/events/{id}/attest` | 10.1 |
| FR-08 Verification (+bulk/assisted/heir) | `sr_verification_cycles`, `sr_attestations`, `sr_gap_register` | `/sr/verification-cycles/*` | 10.3 |
| FR-09 Timeline | `service_register_events`, `sr_access_log` | `/sr/employees/{id}/timeline` | — |
| FR-10 Certified extract (+redaction/co-sign) | `sr_certified_extracts`, `sr_attestations`, `documents` | `/sr/employees/{id}/extracts` | 10.5 |
| FR-11 Offline/QR verification | `sr_certified_extracts`, `sr_anchors` | `/sr/verify/{token}`, `/sr/revocation-feed` | 10.5 |
| FR-12 Custody/access | `sr_access_log` | `/sr/access-log` | — |
| FR-13 Subscriptions (pull-feed) | `sr_subscriptions`, `service_register_events` | `/sr/subscriptions/*`, `/sr/feed` | — |
| FR-14 Legacy digitisation (confidence) | `sr_legacy_digitisation_batch/record`, `service_register_events` | `/sr/legacy/*` | 10.4 |
| FR-15 Retention/hold/continuity/DR | `service_register_events`, `sr_anchors` | `/sr/.../legal-hold`, `/sr/dr/reconcile-anchor` | — |
| FR-16 Forensics/analytics | all SR entities | `/sr/forensics/*`, `/sr/analytics/summary` | — |
| **FR-17 Completeness/gap** | `sr_expected_event_rule`, `sr_gap_register` | `/sr/employees/{id}/gaps`, `/sr/gaps/*` | — |
| **FR-18 §65B/BSA certificate** | `sr_authenticity_certificates`, `sr_certified_extracts` | `/sr/extracts/{id}/authenticity-certificate` | 10.5 |
| **FR-19 LTV/evidence renewal** | `sr_ltv_renewals`, `sr_anchors` | `/sr/ltv/*`, `/sr/crypto/migrate` | — |
| **FR-20 Bulk corrigendum** | `sr_bulk_corrigendum_batch`, `sr_corrections` | `/sr/bulk-corrigenda/*` | 10.7 |
| **FR-21 Grievance/appeal** | `sr_appeals`, `sr_corrections` | `/sr/disputes/{id}/appeal`, `/sr/appeals/*` | 10.6 |

### 14.2 Dependency graph (build order)

```
GATE 0 (crypto/CA/HSM/TSA/WORM memo) ──→ FR-01 (taxonomy) + FR-17 (expected-event rules)
   └─→ FR-02 (ingestion + semantic dedup + reversal) → FR-03 (append + content & status chains + anchor hook)
            ├→ FR-04 (integrity + status + mandatory anchor)
            ├→ FR-05 (corrigendum + co-sign) → FR-06 (annotate/dispute) → FR-21 (appeal) → FR-20 (bulk corrigendum)
            ├→ FR-07 (qualified attest) → FR-08 (verification: bulk/assisted/heir; gap gate ← FR-17)
            ├→ FR-09 (timeline) → FR-12 (access log)
            ├→ FR-10 (extract + redaction + co-sign) → FR-11 (offline/QR) → FR-18 (§65B) → FR-19 (LTV)
            ├→ FR-13 (pull-feed)
            ├→ FR-14 (legacy digitisation, confidence-flagged; uses FR-03 + FR-17 model)
            ├→ FR-15 (retention/hold/continuity/DR anchor)
            └→ FR-16 (forensics/analytics, reads all)
```

### 14.3 Parallel-agent plan

| Track | FRs | Can parallelise after |
|---|---|---|
| **Crypto/admissibility foundation** | GATE 0 + FR-01 + FR-17 rules | first; gates everything |
| Core ledger | FR-02, FR-03 | after GATE 0 |
| Integrity, anchor & forensics | FR-04, FR-16 | after FR-03 |
| Correction, attestation, verification, appeal | FR-05, FR-06, FR-07, FR-08, FR-20, FR-21 | after FR-03 (FR-08 after FR-07/FR-17; FR-20 after FR-05; FR-21 after FR-06) |
| Read & custody | FR-09, FR-12 | after FR-03 |
| Extracts & admissibility | FR-10, FR-11, FR-18, FR-19 | after FR-07, FR-09 |
| Integration | FR-13 | after FR-03 |
| Migration | FR-14 | after FR-03 + FR-17 model |
| Retention & DR | FR-15 | after FR-04 (anchor) |
| Completeness | FR-17 | after FR-01; feeds FR-08 |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Status |
|---|---|---|
| Canonical SR event model & taxonomy (+cadence/correlation) | FR-01, E9, E21 | ✅ |
| Every life event (appointment…retirement, + reversals) | E9 catalog + `event_category` (17) + `*_REVERSAL` | ✅ |
| Append-only immutability + integrity (content chain) | FR-03, FR-04, §5.6 | ✅ |
| **Status tamper-evidence (status sub-ledger)** | **FR-03/FR-04, E19** | ✅ |
| **Mandatory external anchoring (insider/stale-restore resistance)** | **FR-04, E20, §4, §13.2** | ✅ |
| **Completeness assurance & gap register (R1)** | **FR-17, E21, E22; metric = gap-closure rate** | ✅ |
| Ingestion contract (idempotent, versioned, validated, provenance) | FR-02, E13 | ✅ |
| **Semantic (per-fact) deduplication (R10)** | **FR-02/FR-14, `fact_key`** | ✅ |
| **Source-driven reversal/cancellation (R13)** | **FR-02/FR-05, taxonomy** | ✅ |
| Correction (corrigendum/annotation, supersede, never delete) | FR-05, FR-06, E10 | ✅ |
| **Bulk corrigendum (R14)** | **FR-20, E26** | ✅ |
| **Separation of duties + grievance/appeal (R6)** | **§3, FR-06, FR-10, FR-21, E23** | ✅ |
| Attestation by custodian (**qualified signature, R4**) | FR-07, E11 | ✅ |
| Periodic verification (**+ bulk/assisted/heir, R7**) | FR-08, E12 | ✅ |
| SR view/timeline (chronological, filterable, printable) | FR-09 | ✅ |
| Digital signing & certified true copy (**+ redaction, qualified, co-sign**) | FR-10, E14 | ✅ |
| **§65B / BSA certificate-of-authenticity (R4)** | **FR-18, E24** | ✅ |
| **Long-term validation / evidence-record renewal (R5)** | **FR-19, E25, §16.1** | ✅ |
| **Offline/independent verification (R15)** | **FR-11** | ✅ |
| Custody & access control + access log | FR-12, E15 | ✅ |
| Retention (permanent + archival) **+ DPDP lawful basis (R11)** | FR-15, §4, §9, §15 | ✅ |
| **Cross-tenant/inter-department chain continuity (R16)** | **FR-15, E8 fields, §5** | ✅ |
| **DR anchor reconciliation (R12)** | **FR-04, §13.2** | ✅ |
| Bulk digitisation (**+ confidence-flagged lane, R8**) | FR-14, E17, E18 | ✅ |
| Verifiable ledger (re-scoped: substrate+chain+anchor+signatures) | FR-03/FR-04 + E19/E20; "blockchain-style" language retracted | ✅ |
| Event subscriptions (**single pull-feed at launch, R17**) | FR-13, E16 | ✅ |
| Audit/forensics view | FR-16 | ✅ |
| **Crypto/admissibility decision sequenced first (R9)** | **§13.1 GATE 0** | ✅ |
| **Plain-language operator/citizen layer + load-tested sweep SLA** | **§7.2, §11, §9, §13.2** | ✅ |
| All v1 owned entities (E8–E18) | retained (E8/E13/E14/E18 amended) | ✅ |
| New v2 owned entities (E19–E26) | E19–E26 defined with sample rows | ✅ |
| Multi-tenancy / P01 / P02 / P05 / X.1 / P06 / X.2 / P03 platform harmonisation | §4.1 | ✅ |
| All 20 council Adopted Improvements | Amendments table (post-§1) + FRs/entities above | ✅ |
| All council risks R1–R17 | Mapped in Amendments table + FRs | ✅ |

**Unresolved gaps: 0.** Every council Adopted Improvement (1–20) and every Risk Register item (R1–R17) is incorporated as a concrete requirement, control, entity, field, state, or section. Harmonised with the PrimeSoft HRMS platform deliverables (Product Vision v2.6, Platform Spec v1.6, Foundation FS v1.7, RBAC v1.7, Document Management FS v1.3).

---

## Section 15 — Glossary

| Term (plain-language gloss in parentheses) | Definition |
|---|---|
| **Service Register (SR) / Service Book** | The statutory, legally significant record of an employee's entire service history |
| **Digital SR** | The digital, append-only, tamper-evident, admissible equivalent of the paper service book (this module) |
| **Ledger entry** | A single immutable `service_register_events` row recording one life event |
| **Content hash chain** (tamper-detection within a trusted store) | Per-employee linked sequence where each entry binds the previous entry's hash; proves ordering and pinpoints divergence — *not* completeness or insider-resistance by itself |
| **Status sub-ledger** (tamper-proof history of an entry's status) | Append-only hash-chained `sr_status_events` recording supersession/attestation/status transitions, so the legally-operative status is itself tamper-evident |
| **External anchor** (independent tamper-proof timestamp of the whole register) | RFC 3161-timestamped Merkle root over all chain heads, written to independent WORM — the actual root of trust against a privileged insider or stale restore |
| **WORM / append-only substrate** | Write-once storage / DB enforcement (with the writer segregated from any hash-recompute principal) — the substrate guarantee under the chain |
| **Trusted timestamp (RFC 3161)** | A timestamp from an independent authority, not a server clock — proves *when* without trusting the operator |
| **Qualified e-signature** | A signature from a licensed CA that is legally valid under the IT Act / BSA — server-signing is not |
| **PAdES-LTV / RFC 4998 evidence record** (keep-it-verifiable-for-decades) | Long-term validation envelope + periodic re-timestamping so signed documents verify after certificates expire and algorithms age |
| **§65B / BSA certificate** (court-ready proof of authenticity) | A machine-generated electronic-record authenticity certificate suitable for court production |
| **Provenance** | The `source_module` + reference identifying which system recorded the event |
| **Semantic / fact key** (one real fact, one entry) | A per-fact correlation key preventing two modules from double-recording one real-world event |
| **Idempotency key** | Deterministic key ensuring an event is recorded exactly once despite retries |
| **Corrigendum** (official correction that keeps the original) | A correcting entry that supersedes an erroneous one without deleting it |
| **Bulk corrigendum** | Cadre-wide/pay-commission batch corrections with sampling-based approval |
| **Reversal / cancellation** | A source-driven event (e.g., a quashed order) that supersedes a prior entry |
| **Supersession** (replaced by a corrected entry) | Marking an entry SUPERSEDED while preserving it and pointing to its successor |
| **Annotation** | A statutory/contextual note attached to an entry without changing its content |
| **Attestation** | A qualified-signed confirmation (custodian or employee) of an entry's correctness |
| **Periodic verification** | The statutory (typically 5-yearly) employee review/confirmation of the SR |
| **Bulk-confirm with exceptions** | Verify routine entries in bulk while individually reviewing changed/sensitive/gap-flagged ones |
| **Assisted / heir verification** | Verification operated by HR for a low-literacy/no-device employee, or by a nominee/legal heir for a deceased one |
| **Completeness gap** (a possibly-missing entry) | A first-class finding that an expected event (e.g., an annual increment) appears unrecorded |
| **Appeal** (challenge to a higher authority) | Independent escalation beyond a custodian's "uphold" to an Appellate Authority |
| **Certified true copy / extract** | A qualified-signed, redaction-aware, offline-verifiable official copy of the SR |
| **Qualifying service** | Service counted toward pension; impacted by leave/suspension events |
| **Legal hold** | A flag preventing archival movement and marking an SR for litigation |
| **Confidence status** (how sure we are of a digitised entry) | VERIFIED / RECONSTRUCTED / LEGACY_UNVERIFIABLE flag on legacy-digitised facts |
| **SR Custodian / Registrar** | The accountable statutory custodian of the register |
| **Stale restore** | A backup restored from before a legitimate corrigendum — detected by anchor reconciliation |

---

## Section 16 — Appendices

### 16.1 Appendix A — Canonical hashing, status-chain, anchor & LTV specification (v2)

- **Content canonical (hashed into `entry_hash`):** `sr_event_id`, `tenant_id`, `employee_id`, `service_no`, `sequence_no`, `event_type_code`, `event_category`, `event_title`, `event_description`, `event_date`, `recorded_at`, `fact_key`, `reverses_event_id`, `source_module`, `source_reference_id`, `source_event_version`, `order_no`, `order_date`, `sanctioning_authority`, canonicalised `payload` (sorted keys), `qualifying_service_impact`, `confidence_status`, `is_legacy`, `legacy_batch_id`, `legacy_source_id`, `document_ids` (sorted), `chain_origin`, `prior_chain_head_hash`, `prev_event_hash`.
- **Excluded from `entry_hash`** (mutable projections — tamper-evidence provided by the status chain, NOT by re-hashing): `superseded_by_event_id`, `entry_status`, `attestation_status`.
- **Status-chain canonical (hashed into `status_hash`):** `status_event_id`, `tenant_id`, `employee_id`, `target_event_id`, `status_sequence_no`, `transition_kind`, `from_value`, `to_value`, `related_event_id`, `reason_ref`, `actor`, `recorded_at`, `prev_status_hash`. (This is how the council's "mutable un-hashed pointer" hole is closed without re-breaking the content chain on every status change.)
- **Algorithm:** `SHA-256` (per-row `hash_algorithm`/`ledger_version` for crypto-agility); JSON serialization with sorted keys, UTC ISO-8601 timestamps, dates `YYYY-MM-DD`, fixed numeric formatting.
- **Trusted time:** every content commit, status transition (high-sensitivity), and anchor obtains an **RFC 3161 timestamp token**; `recorded_at` is corroborated by the token, not NTP.
- **Genesis / continuation:** a GENESIS-origin first entry uses `prev_event_hash = "GENESIS"`; a CONTINUED first entry (cross-tenant/org transfer) uses `prev_event_hash = prior_chain_head_hash` (the prior scope's content head), preserving an unbroken evidentiary link.
- **Anchoring (MANDATORY, v2):** `JOB-M12-ANCHOR` periodically builds a Merkle tree whose leaves are `(employee_id → content head hash, status head hash)`, computes the root, obtains an RFC 3161 timestamp over the root, writes the root + ordered head list to an **independent WORM/notary** (`sr_anchors` + M13 object-lock), and chains anchors via `prev_anchor_hash`. FR-04 verifies live heads against the latest anchor; **a mismatch or a missing current anchor is a FAIL.**
- **LTV / evidence-record renewal (v2):** statutory signed artefacts are wrapped in **PAdES-LTV** (cert chain + OCSP/CRL + timestamp); `JOB-M12-LTV` applies **RFC 4998 archive timestamps** before cert/algorithm expiry; a crypto migration (e.g., SHA-256→SHA-384) **re-anchors heads under the new algorithm without recomputing or overwriting any historical `entry_hash`** — old rows verify under their stored algorithm, new evidence binds them forward.

### 16.2 Appendix B — Launch SR event-type catalog (illustrative; v2 adds reversal partners)

| Category | Example `event_type_code`s |
|---|---|
| APPOINTMENT | APPOINTMENT, RE_APPOINTMENT, AD_HOC_APPOINTMENT |
| CONFIRMATION | CONFIRMATION, PROBATION_EXTENSION, PROBATION_DECLARED |
| PROMOTION | PROMOTION, REVERSION, PROMOTION_CORRIGENDUM, **PROMOTION_CANCELLED** |
| TRANSFER / POSTING | TRANSFER, POSTING, RELIEVING, JOINING, MUTUAL_TRANSFER, **TRANSFER_CANCELLED** |
| PAY / INCREMENT | PAY_FIXATION, ANNUAL_INCREMENT, INCREMENT_WITHHELD, PAY_PROTECTION |
| LEAVE | EL_AVAILED, HPL_AVAILED, LWP_SPELL, EOL_SPELL, STUDY_LEAVE, MATERNITY_LEAVE, COMMUTED_LEAVE |
| TRAINING / QUALIFICATION | TRAINING_COMPLETED, QUALIFICATION_ADDED, DEPARTMENTAL_EXAM_PASSED |
| AWARD | AWARD, REWARD, COMMENDATION |
| PUNISHMENT / SUSPENSION | MINOR_PENALTY, MAJOR_PENALTY, SUSPENSION, SUSPENSION_REVOKED, CENSURE, **MAJOR_PENALTY_REVERSAL, MINOR_PENALTY_REVERSAL** (tribunal quash) |
| DEPUTATION | DEPUTATION, DEPUTATION_RETURN, FOREIGN_SERVICE |
| IDENTITY | NAME_CHANGE, DOB_CHANGE, GENDER_CHANGE |
| SEPARATION | RETIREMENT, VOLUNTARY_RETIREMENT, RESIGNATION, DISMISSAL, DEATH_IN_SERVICE |

### 16.3 Appendix C — Cross-module write responsibilities (v2)

| Source module | SR event types it posts (examples) |
|---|---|
| M01 | APPOINTMENT, CONFIRMATION, IDENTITY (golden change records) |
| M03/M04 | LEAVE spells (EL/HPL/LWP/EOL/STUDY/MATERNITY) |
| M05 | TRANSFER, POSTING, RELIEVING, JOINING, **TRANSFER_CANCELLED** |
| M06 | PROMOTION, REVERSION, POSTING, **PROMOTION_CANCELLED**; **service-rule source for increment/seniority cadence (FR-17)** |
| M08 | APPRAISAL_RECORDED (APAR summary) |
| M09 | MINOR/MAJOR_PENALTY, SUSPENSION, CENSURE, **PENALTY_REVERSAL (on quash)** |
| M10 | PAY_FIXATION, ANNUAL_INCREMENT, INCREMENT_WITHHELD; **increment-cadence source (FR-17)** |
| M11 | (consumer; reads SR via pull-feed/extract + pre-retirement + CRITICAL-gap gate; **provides nominee records for heir verification**) |
| M12 (this) | manual records, corrigenda (single/bulk/reversal), legacy digitisation, annotations, anchors, §65B certificates |

### 16.4 Appendix D — Resolved assumptions (v2 — v1 "open" items closed)

- **CA/HSM/TSA/WORM:** confirmed at **GATE 0** before FR-03; **no server-signed statutory fallback** (server-signing only for marked PROVISIONAL artefacts). *(Closes v1 "PKI/HSM availability; server-signed fallback".)*
- **Anchoring:** **mandatory**, not optional; head-vs-anchor mismatch is a FAIL. *(Closes v1 "external anchoring optional".)*
- **Completeness:** engineered via FR-17 expected-event reconciliation; success measured as gap-closure rate. *(Closes the retracted "100% complete" claim.)*
- **Status tamper-evidence:** provided by the hash-chained status sub-ledger (E19). *(Closes the "mutable un-hashed pointer" finding.)*
- **DPDP vs. permanent retention:** resolved on the legal-obligation lawful basis; correction → corrigendum, never erasure.
- **Cross-tenant continuity:** chain continues with `prior_chain_head_hash` link on transfer.
- **Verification cadence:** default 5 years; configurable per service rules; pre-retirement mandatory; heir path for DEATH_IN_SERVICE.
- **Future-date tolerance for `event_date`:** configurable (default 0 days).
- **Subscriptions:** single authenticated pull-feed at launch; WEBHOOK/MESSAGE_BUS deferred behind a documented real-time requirement.

---

*End of M12-SR BRD v2.0. Supersedes v1.0; all 20 council Adopted Improvements and Risk Register items R1–R17 incorporated. Final reconciliation: 0 unresolved gaps.*
