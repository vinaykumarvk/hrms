# Leave Management Integration with Digital Service Register — HRMS Module BRD (v2.0)

**Module code:** M04-LSR
**Program:** Enterprise HRMS — PeopleGov / HRMS Suite (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v2.0
**Status:** Revised — council-hardened (supersedes v1.0)
**Author persona:** Global HR/HCM domain expert (Workday / SAP SuccessFactors / Oracle HCM bar) honouring the public-sector statutory context
**Upstream contract:** `SHARED_FOUNDATION.md` (canonical entities, conventions, roles, technical defaults)
**Change basis:** Adversarial council report `docs/evaluation/M04-leave-sr-integration-council.md` — all 21 Adopted Improvements and Risk Register R1–R18 incorporated.

> **Reading note.** This BRD is the **integration / contract layer** between **M03 Attendance & Leave Management** (the *source* of approved leave events and the leave ledger) and **M12 Digital Employee Service Register** (the *target* append-only statutory ledger). It does **not** redefine the canonical shared entities (`employees`, `service_register_events`, `audit_log`, `notifications`, `documents`, `workflow_instances`/`workflow_tasks`); it references them and adds only the **integration-specific** entities required for reliable, auditable, **exactly-once-effect** posting, reconciliation, correction/reversal, and statutory annotation.

> **v2 framing.** v2 keeps the v1 skeleton and its best-in-class **statutory-semantics layer** (append-only corrections + link table, versioned effective-dated mapping catalog, mapping-sourced qualifying-service rules, PRE_PENSION gate, evidence pack) and **hardens** it: a stable `leave_spell_lineage_id`, a contracted-and-conformance-tested M12 write port, a stuck-`IN_FLIGHT` lease reaper, partitioned in-order delivery with correction-ordering guards, state-aware reconciliation, an `EXCLUDED_NON_SR` disposition, signed capture payloads with source↔outbox integrity reconciliation, provisional migrated entries, right-sized throughput, a demoted (optional) circuit breaker, and a signed pre-pension completeness certificate.

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Digital Service Register (Digital SR, owned by **M12**) is the **statutory system of record** for an employee's entire service lifecycle. In a government HR context, the Service Register is a legal document: pension, seniority, increments, qualifying-service computation, and audit by the Accountant General all depend on it being **complete, accurate, append-only, and tamper-evident**. Leave — especially **long leave, Leave Without Pay (LWP / EOL), study leave, and suspension-as-leave** — directly affects **qualifying service for pension**, **increment dates**, and **seniority**. Therefore every leave spell that is *approved* in M03 must become a **permanent, immutable SR entry** in M12, and every *cancellation or amendment* of that leave must produce a **correcting SR entry** (the SR is never hard-edited).

**M04-LSR is the integration that guarantees this.** It is not a leave system and not the SR itself; it is the **reliable, idempotent, reconciled, monitorable bridge** that maps leave domain events to statutory SR entries with **exactly-once *effect*** (defined precisely in §1.6), full **replay**, automated **drift detection**, and explicit **failure handling** (retry / dead-letter / manual intervention).

### 1.2 Business problem

Without a formal integration contract, leave-to-SR posting is typically done by manual data entry or fragile point-to-point calls, producing the classic failure modes that auditors penalise: **missing SR entries** (approved leave never recorded), **duplicate entries** (double-posting on retries), **drift** (leave ledger and SR disagree on LWP days), **orphaned corrections** (a leave was cancelled but the SR still shows it as availed), **silent loss** (a posting failed — or a worker crashed mid-flight — and nobody noticed), and **broken lineage** (an amended spell can no longer be tied back to its original). Each corrupts qualifying-service and pension computation years later, when the error is expensive to fix and the original approver has retired.

### 1.3 Solution overview

M04-LSR delivers:

1. **Stable spell lineage** — a `leave_spell_lineage_id` sourced from M03, stable across approve → amend → cancel, threaded through the outbox, posting log, every SR entry, correction links, and reconciliation findings; it is the **primary join key** for net-effective resolution, duplicate/orphan detection, pension totalling, and evidence-chain reconstruction.
2. **Canonical event mapping** — a governed, versioned, **statutorily-cited** table that maps each leave type / spell outcome to exactly one SR entry type **or an explicit `EXCLUDED_NON_SR` disposition** (e.g., `EARNED_LEAVE_AVAILED`, `LWP_SPELL`, `STUDY_LEAVE`, `LEAVE_CANCELLED_CORRECTION`, or no-op for non-SR casual leave).
3. **Transactional outbox with signed capture** — leave-approval events are captured in the same database transaction as the leave-ledger write in M03's bounded context, with an HMAC-signed payload so M04 can verify provenance; a **source-ledger ↔ outbox integrity reconciliation** catches any capture loss.
4. **Idempotent, exactly-once-effect posting** — a partitioned, in-order relay drains the outbox and posts to M12 with a stable, **mapping-version-independent dedupe key**, so retries, concurrency, and remaps never double-post.
5. **Stuck-in-flight lease reaper** — a visibility-timeout sweeper returns crashed `IN_FLIGHT` events to retry-eligible, closing the silent-loss path.
6. **Retry with backoff + dead-letter queue (DLQ)** — transient failures retry; poison messages quarantine for human resolution. A circuit breaker is an **optional Phase-2 enhancement**; bounded retry + DLQ + a manual relay-pause are the core controls.
7. **State-aware reconciliation engine** — scheduled and on-demand comparison of the M03 leave ledger against M12 SR entries that **excludes legitimately pending/quarantined events** and **matches on lineage with correction chains resolved** before raising findings.
8. **Correction & reversal handling through the same outbox machinery** — cancelled/amended leave posts an append-only correcting/reversing SR entry (ordered after its original) that references the original by lineage, preserving the immutable chain; `sr_correction_link` is reconcilable from M12-stored identity.
9. **Tiered qualifying-service governance** — LWP / long-leave spells are flagged **non-qualifying** (or partially qualifying per cited rule); routine corrections auto-post but are flagged and post-audited, while any qualifying-service change **after pension processing has started is a hard maker-checker gate**.
10. **Contracted M12 port** — a bilateral write-port spec with a dedupe-key retention window ≥ the maximum replay/backfill horizon (7 years), `correlationId` + `leave_spell_lineage_id` persisted and indexed, and a **CI conformance test** that proves dedupe holds.
11. **Historical digitisation with provisional entries** — bulk migration of legacy leave into the SR carrying a `PROVISIONAL` confidence flag and mandatory statutory rule citation, excluded from final pension computation until SR-Custodian adjudicated.
12. **Pre-pension completeness certificate** — a signed, checksummed evidence artefact asserting zero open HIGH/CRITICAL findings and full lineage for an employee, consumable as M11's gate input.
13. **Integration monitoring dashboard & operating model** — real-time health, lag, DLQ depth, reconciliation status, SLA alerts, plus a defined IntegOps on-call rota and tiered resolution SLAs.

### 1.4 Key outcomes & success metrics

| Outcome | Metric | Target |
|---|---|---|
| No lost leave events | Outbox events posted to SR / outbox events created | 100% (eventually) |
| No silent in-flight loss | Stranded `IN_FLIGHT` rows older than lease window | 0 (reaper-recovered) |
| Capture completeness | M03 ledger SR-affecting decisions with matching outbox row | 100% (integrity recon) |
| No double-posting | Duplicate SR entries detected per 10,000 postings | 0 |
| Timely posting | P95 lag from leave approval to SR-entry confirmation | ≤ 5 minutes |
| Lineage integrity | Amended/cancelled spells resolvable to their original via lineage | 100% |
| Drift control | Open reconciliation findings older than tiered SLA | 0 |
| Correction integrity | Cancelled/amended leaves with matching, linked correction entry | 100% |
| Pension correctness | Qualifying-service discrepancies surfaced before pension processing | 100% pre-flagged + certificate |
| Operability | DLQ items resolved within tiered SLA | ≥ 99% within SLA |

### 1.5 Scope at a glance

**In scope:** signed event capture from M03, source↔outbox integrity reconciliation, mapping (incl. exclusion disposition + rule citations), partitioned in-order posting to M12, lease/reaper, dedupe/idempotency, retry/DLQ, state-aware reconciliation, correction/reversal through the outbox, tiered qualifying-service governance, statutory annotations, historical digitisation with provisional entries, pre-pension completeness certificate, monitoring dashboard + operating model, replay/backfill, and the M12 port bilateral contract + conformance test.
**Out of scope (owned elsewhere):** leave policy/accrual/application/approval (M03); the SR ledger schema and its UI (M12); pension computation (M11); seniority list maintenance (M06); document storage (M13). M04 *references* and *coordinates* these; it does not own them.

### 1.6 Reliability guarantee — stated precisely (R10)

M04 does **not** promise raw "exactly-once delivery." It promises **exactly-once *effect***: **at-least-once delivery + idempotent dedupe at M12**, *conditional on the M12 port contract* (FR-16). One logical leave event yields exactly one SR entry despite retries, concurrent workers, crashes, and replays — **provided** M12 honours the contracted dedupe-key retention window (≥ 7 years) and persists the dedupe key, `correlationId`, and `leave_spell_lineage_id`. This caveat is repeated in the NFRs (§9), the glossary (§15), and the M12 contract (FR-16); it must not be softened to bare "exactly-once" in any downstream artefact, demo, or auditor communication.

---

## Amendments (v1 → v2)

Every council Adopted Improvement (AI-#) and its source Risk (R#) is mapped to where it is incorporated.

| AI-# | Risk | Improvement | Incorporated in v2 |
|---|---|---|---|
| AI-1 | R3 | Add `leave_spell_lineage_id` stable across approve/amend/cancel; primary join key | §1.3(1), §1.6; E8/E10/E13/E14 new field; §5.6 rule 11; FR-01/03/06/08/09; Appendix A & C |
| AI-2 | R1 | Stuck-in-flight reaper: `claimed_at`/lease + visibility-timeout sweeper + alert | **New FR-15**; E8 fields `claimed_at`,`lease_expires_at`; state table 10.1 (`IN_FLIGHT → lease-expired → FAILED`); §9; §11 |
| AI-3 | R2 | M12 SR write-port bilateral spec + CI conformance test (retention ≥ 7y, indexed `correlationId`+lineage, append-only, `LSR_SR_CONFLICT`) | **New FR-16**; **new E19 `port_conformance_run`**; §2.5 (assumption → signed dependency); §8.5 |
| AI-4 | R7 | Decide & document capture architecture; if polling add source↔outbox reconciliation | §2.5 decision; FR-01 ACs made testable; **new FR-17**; **new E20 `capture_integrity_finding`** |
| AI-5 | R4 | Persist pinned `mapping_version` on outbox at first claim | E8 field `pinned_mapping_version`; FR-03 BR-03.2; state table 10.1 |
| AI-6 | R4 | Redefine dedupe key off `mapping_version` (lineage + event_type + event_sequence); remap = explicit correction | FR-03 BR-03.1; E8 `event_sequence`,`dedupe_key`; Appendix A (rewritten) |
| AI-7 | R5 | Per-employee/lineage partitioned in-order claiming + correction-not-eligible-until-original-POSTED guard + `BLOCKED_AWAITING_ORIGINAL` status | FR-03; **new E18 `relay_partition_lease`**; outbox status enum; state table 10.1 |
| AI-8 | R6 | Reconciliation outbox/DLQ-state-aware; match on lineage with chains resolved; pending/quarantined bucket | FR-06 (rewritten ACs/BRs); Appendix C (rewritten); E12 `pending_excluded_count` |
| AI-9 | R8 | Explicit `EXCLUDED_NON_SR` disposition; resolve BR-01.1 vs rule-5 contradiction | E9 `disposition` enum; FR-02; FR-01 BR-01.1; §5.6 rule 5 |
| AI-10 | R9 | Route corrections through the same outbox+idempotency; `sr_correction_link` recoverable from M12 identity; recon check | FR-08 (rewritten); FR-06 finding `CORRECTION_WITHOUT_LINK`; §5.6 rule 6 |
| AI-11 | R10 | Restate "exactly-once" as exactly-once-effect conditional on M12 contract | §1.6; §9 Reliability; §15 Glossary |
| AI-12 | R11 | Tier maker-checker for corrections; hard gate qualifying-service change after pension start | FR-08 BR-08.4; FR-09 BR-09.3 (blocking); state table 10.6; §11 |
| AI-13 | R12 | Right-size throughput NFRs (low thousands/day; burst on migration) | §9 Throughput; removed 50/s-500/s figures |
| AI-14 | R13 | Demote circuit breaker to optional/Phase-2; core = bounded retry + DLQ + manual pause | FR-04 (rewritten); §9; state table 10.5 marked optional |
| AI-15 | R14 | Deterministic backfill identity from lineage + business key | FR-12 BR-12.1; Appendix A |
| AI-16 | R15 | Migrated entries `PROVISIONAL` + mandatory rule_ref + excluded from pension until adjudicated | FR-11 (new ACs/fields); E16 `confidence`,`adjudication_state`,`statutory_rule_ref` |
| AI-17 | R16 | Resolve straddling-spell rule: split into per-effective-range SR sub-entries | FR-02 BR-02.4; FR-09 edge cases; E9 `straddle_handling` |
| AI-18 | R17 | Sign capture payload (HMAC) + constrain outbox writers + periodic outbox↔ledger integrity recon | FR-01 BR-01.4; E8 `payload_signature`; **FR-17**; §4 security posture |
| AI-19 | R10/Outsider | Mandatory statutory rule citations in mapping catalog, surfaced in evidence pack | E9 `statutory_rule_ref` (NOT NULL for SR-posting rows); FR-02 AC-6; FR-14 |
| AI-20 | R18 | Define IntegOps operating model: tiered resolution SLA + on-call/escalation | §11.1 (new); §13.5 (new); FR-13 |
| AI-21 | Proponent | Pre-pension completeness certificate as a signed, checksummed M11 gate input | **New FR-18**; **new E21 `prepension_certificate`**; FR-09/FR-14 |

> **Net change:** FRs grow **14 → 18** (added FR-15 reaper, FR-16 M12 port contract & conformance, FR-17 source↔outbox integrity, FR-18 pre-pension certificate). Owned entities grow **10 → 14** (E8–E17 retained + new E18 `relay_partition_lease`, E19 `port_conformance_run`, E20 `capture_integrity_finding`, E21 `prepension_certificate`). Referenced canonical/source entities unchanged at 7 (E1–E7).

## Section 2 — Scope & Boundaries

### 2.1 In-scope capabilities

- **Signed capture** of **approved**, **cancelled**, and **amended** leave domain events from M03 via a transactional outbox written inside M03's transaction, with an HMAC-signed payload and a stable `leave_spell_lineage_id`.
- **Source-ledger ↔ outbox integrity reconciliation** to detect capture loss (FR-17).
- A **governed event-mapping catalog** (leave type + spell semantics → SR entry type **or `EXCLUDED_NON_SR`**, qualifying-service rule, **mandatory statutory rule citation**), versioned and effective-dated, with per-effective-range split handling for straddling spells.
- A **partitioned, in-order, idempotent posting relay** to M12's SR write port with exactly-once *effect* and correction-ordering guards.
- A **stuck-in-flight lease reaper** (FR-15).
- **Retry, backoff, and dead-letter** handling for posting failures; an **optional** circuit breaker (Phase-2) plus a manual relay-pause.
- **State-aware reconciliation** (scheduled + on-demand) between the M03 leave ledger and M12 SR, lineage-keyed, excluding pending/quarantined events, with finding classification (MISSING_SR / DUPLICATE_SR / DIVERGENT_FIELD / ORPHAN_CORRECTION / UNMAPPED_LEAVE / **CORRECTION_WITHOUT_LINK**) and remediation actions.
- **Correction & reversal** posting for cancelled/amended leave through the **same outbox/idempotency machinery** (append-only, references original by lineage).
- **Tiered qualifying-service / pension impact governance** (LWP, EOL, study leave, suspension) emitted on SR entries and consumable by M11.
- **Historical leave digitisation** into the SR with provenance, **provisional/confidence handling**, mandatory rule citation, batch validation, and post-load reconciliation.
- **Statutory annotations** (increment deferral, seniority effect, probation extension) attached to SR entries.
- **Pre-pension completeness certificate** (FR-18), monitoring dashboard, alerting, IntegOps operating model, and **replay/backfill** tooling.
- The **M12 SR write-port bilateral contract + CI conformance test** (FR-16).

### 2.2 Out-of-scope (explicit boundaries)

| Concern | Owner | M04 relationship |
|---|---|---|
| Leave types, accrual, balances, application, multi-level approval, **lineage-id issuance** | M03-ATL | Consumes approved/cancelled/amended events; reads M03-issued `leave_spell_lineage_id` |
| SR ledger storage, SR entry schema, SR custodian UI, SR immutability + **dedupe** enforcement | M12-SR | Posts entries via M12 write port (contracted in FR-16); never edits SR rows directly |
| Pension & qualifying-service computation | M11-PEN | Provides qualifying-service flags + pre-pension certificate via SR; does not compute pension |
| Seniority list generation | M06-PPP | Provides seniority-impact annotation; does not maintain lists |
| Document/object storage | M13-DMS | References `documents` for legacy scan provenance |
| Authentication / RBAC platform | Shared | Inherits OIDC/SSO + RBAC |

### 2.3 Feature Module Map

| Feature area | FRs | Primary collaborating modules |
|---|---|---|
| Signed event capture (transactional outbox) | FR-01 | M03 (source) |
| Event mapping catalog (disposition + rule citation + straddle) | FR-02 | M03, M12 |
| Partitioned idempotent posting relay (exactly-once effect) | FR-03 | M12 (target) |
| Retry, backoff & dead-letter (optional breaker) | FR-04 | — |
| DLQ triage & manual resolution | FR-05 | M12 |
| State-aware reconciliation engine | FR-06 | M03, M12 |
| Reconciliation remediation | FR-07 | M03, M12 |
| Correction & reversal posting (via outbox) | FR-08 | M03, M12 |
| Tiered qualifying-service / pension impact flags | FR-09 | M11, M12 |
| Statutory annotations (increment/seniority/probation) | FR-10 | M06, M12 |
| Historical leave digitisation (provisional) | FR-11 | M03, M12, M13 |
| Replay & backfill tooling (deterministic identity) | FR-12 | M12 |
| Integration monitoring dashboard + operating model | FR-13 | M14 |
| Integration audit & evidence pack | FR-14 | Auditor, M12 |
| **Stuck-in-flight lease reaper** | **FR-15** | — |
| **M12 SR write-port contract & conformance test** | **FR-16** | M12 |
| **Source-ledger ↔ outbox integrity reconciliation** | **FR-17** | M03 |
| **Pre-pension completeness certificate** | **FR-18** | M11, Auditor |

### 2.4 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit-everything:** every posting, claim, reap, retry, DLQ move, reconciliation finding, correction, certificate, and replay writes to `audit_log` (immutable) with actor, before/after, and `requestId`.
- **Maker-checker:** any *manual* SR posting, correction, DLQ resolution that writes to the statutory register, historical batch promotion, **or any qualifying-service change after pension processing has started** routes through `workflow_instances`/`workflow_tasks` with maker ≠ checker.
- **RBAC + row-level scoping** by `org_unit_id`; Auditor is read-only across all M04 surfaces.
- **Pagination:** all list endpoints page/limit with hard max 100.
- **Time/locale:** store UTC; display `DD-MMM-YYYY`; INR money formatting where relevant.
- **Soft-delete** on mutable config entities; **append-only** on all ledgers (outbox is consume-marked, never deleted; posting log, reconciliation log, DLQ history, correction links, certificates are append-only).

### 2.5 Assumptions, decisions & dependencies

**D-1 — Capture architecture decision (resolves R7, AI-4).** The `leave_event_outbox` is written **inside M03's own database transaction** (transactional-outbox-in-source pattern), as a shared outbox table that M03 writes (in its tx) and M04 reads. This is the **preferred and adopted** architecture: it preserves the "no lost events" guarantee without a cross-service distributed transaction. If, for any deployment, M03 cannot host the outbox write in-transaction, the **fallback is M04 polling M03's ledger**, and in that case **FR-17 (source-ledger ↔ outbox integrity reconciliation) is mandatory** to detect capture loss. FR-01's acceptance criteria are written to be testable under the adopted (in-tx) architecture, with FR-17 as the compensating control either way.

**D-2 — Lineage issuance (R3, AI-1).** M03 issues a `leave_spell_lineage_id` that is **stable across the approve → amend(s) → cancel lifecycle of a single leave spell**. Each event additionally carries a monotonically increasing `event_sequence` within the lineage. M04 treats lineage as the primary identity for matching, dedupe, correction linking, and reconciliation.

**D-3 — M12 port is contracted, not assumed (R2, AI-3).** M12 exposes an **idempotent SR write port** accepting a `dedupe_key` and returning the created `sr_event_id`. This is governed by a **signed bilateral contract** (FR-16) specifying: dedupe-key retention ≥ 7 years (≥ max replay/backfill horizon), mandatory persistence + indexing of `dedupe_key`, `correlationId`, and `leave_spell_lineage_id` on the SR entry, append-only immutability, and the exact `LSR_SR_CONFLICT` semantics. A **CI conformance test** proves dedupe holds across the retention window before any live posting is enabled.

**D-4 — Other dependencies.** M11 reads qualifying-service flags + the pre-pension certificate from SR entries (pull) or subscribes to SR change events (push); a reliable scheduler (cron/quartz) exists for reconciliation, relay sweeps, and the reaper; clock sync (NTP) across services for lag measurement, lease expiry, and effective-dating.

---

## Section 3 — Roles & Permissions

### 3.1 Roles relevant to M04 (extends Shared Foundation §4; no contradictions)

- **Integration Operator (IntegOps)** — M04-specific operational role: monitors the dashboard, triages DLQ, triggers replay/backfill, runs on-demand reconciliation, and **owns the on-call rota and tiered-SLA response** (§11.1). *Cannot* author SR entries that bypass maker-checker.
- **SR Custodian / Registrar** — M12 statutory custodian; the **checker** for any manual/correcting SR posting initiated via M04, the approver of historical digitisation batches, **the adjudicator of provisional migrated entries**, and the **signer of the pre-pension completeness certificate**.
- **HR Officer / HR Admin** — initiates manual reconciliation remediation requests and historical batch preparation (maker).
- **Pension Officer** — consumes qualifying-service flags and the pre-pension certificate; read access to impact reports.
- **Auditor (read-only)** — full read on all M04 ledgers, findings, conformance runs, certificates, and the audit trail; no writes.
- **System Administrator** — manages event-mapping catalog versions, retry/SLA/lease/reaper configuration, scheduler settings, and registers M12 port conformance runs; **no** transactional self-approval; cannot resolve own DLQ items into SR.
- **Employee (Self-Service)** — *indirect only*: sees the SR-reflected status of their own leave through M12's employee view; no direct M04 access.

### 3.2 Permission matrix

| Capability / Action | Employee | HR Officer | IntegOps | SR Custodian | Pension Officer | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|
| View integration dashboard | — | R | R/W (ack) | R | R | R | R |
| View posting log | — | R (scoped) | R | R | R (scoped) | R | R |
| Trigger on-demand reconciliation | — | — | ✔ | ✔ | — | — | — |
| View reconciliation findings | — | R | R | R | R | R | R |
| Initiate remediation (maker) | — | ✔ | ✔ | — | — | — | — |
| Approve remediation / SR write (checker) | — | — | — | ✔ | — | — | — |
| Triage / annotate DLQ item | — | — | ✔ | R | — | R | — |
| Resolve DLQ → SR (maker→checker) | — | maker | maker | checker | — | — | — |
| Trigger replay / backfill | — | — | ✔ | approve | — | — | — |
| Acknowledge reaped-in-flight alert | — | — | ✔ | R | — | R | — |
| Manage event-mapping catalog (draft) | — | — | — | — | — | — | ✔ |
| Approve/publish mapping version | — | — | — | ✔ | — | — | — |
| Configure retry/SLA/lease/scheduler | — | — | propose | — | — | — | ✔ |
| Register/run M12 port conformance test | — | — | propose | R | — | R | ✔ |
| Prepare historical batch (maker) | — | ✔ | ✔ | — | — | — | — |
| Approve/promote historical batch (checker) | — | — | — | ✔ | — | — | — |
| Adjudicate provisional migrated entry | — | propose | — | ✔ | R | R | — |
| Issue/sign pre-pension certificate | — | — | propose | ✔ (sign) | R | R | — |
| Hard-gate qualifying-service change post-pension-start | — | maker | maker | checker | initiate | R | — |
| Export audit evidence pack | — | R | R | R | R | ✔ | R |

Legend: ✔ = perform; R = read; R/W (ack) = read + acknowledge alerts; — = no access. All ✔ that write to the statutory SR enforce **maker ≠ checker** and write to `audit_log`.

---

## Section 4 — Shared Application Foundation

This module **inherits** the Shared Foundation §5 technical defaults verbatim and adds integration-specific posture.

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) for the monitoring/triage console; REST API under `/api/v1` for management surfaces; the **posting relay** is a backend worker (Node/TypeScript or Java Spring) driven by a scheduler, claiming work **per-partition (per `employee_id`/lineage) in-order** rather than by naive global row-lock; PostgreSQL primary datastore (outbox, posting log, reconciliation log, DLQ, mappings, partition leases, conformance runs, certificates); message infrastructure is **DB-backed transactional outbox** (preferred for exactly-once-effect with the relational store) with an optional broker bridge only if the program later standardises one.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level scoping by `org_unit_id`. The M12 write port is called with a service principal that has **append-only SR-write** scope and is audited.
- **Capture integrity (R17, AI-18):** the M03 capture payload is **HMAC-signed** with a shared capture key; M04 verifies the signature before posting and rejects unsigned/forged payloads (`LSR_SIGNATURE_INVALID`). Only the M03 source principal holds `lsr.outbox.write`; FR-17 reconciles the outbox against the M03 ledger as an independent integrity check.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Inherited error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503). M04-specific codes are cataloged in Section 8.
- **Idempotency:** all SR write calls carry a deterministic, **mapping-version-independent** `dedupe_key` (= the `Idempotency-Key` header); M12 must dedupe on it and retain it ≥ 7 years (FR-16).
- **Observability:** structured logs with `requestId` + `correlation_id` + `leave_spell_lineage_id` threaded end-to-end; metrics (lag, throughput, DLQ depth, reaped-in-flight count, error rate, recon pending/quarantined buckets) exposed to M14.
- **Security/compliance:** OWASP ASVS; TLS 1.2+ in transit; encryption at rest; DPDP Act 2023 alignment (leave reason categories may be sensitive — PII minimisation: M04 carries only the SR-relevant fields, never medical detail); full audit trail; statutory retention.
- **NFR baseline:** P95 management API < 500ms; relay P95 posting lag ≤ 5 min; 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4h; WCAG 2.1 AA for console. Throughput right-sized in §9.

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| E1 | `employees` | Canonical (referenced) | M01 | Employee master; subject of SR entries |
| E2 | `service_register_events` | Canonical (referenced, written via M12 port) | M12 | Append-only statutory SR ledger (target); carries `dedupe_key`, `correlationId`, `leave_spell_lineage_id` |
| E3 | `audit_log` | Canonical (referenced) | Shared | Immutable audit trail |
| E4 | `notifications` | Canonical (referenced) | Shared | Outbound notifications |
| E5 | `documents` | Canonical (referenced) | M13 | Legacy scan provenance for digitisation |
| E6 | `workflow_instances` / `workflow_tasks` | Canonical (referenced) | Shared | Maker-checker for manual SR writes/batches/post-pension gates |
| E7 | `leave_ledger_entries` | Source (referenced, read-only from M04) | M03 | Approved/cancelled/amended leave spells; issues `leave_spell_lineage_id` |
| **E8** | **`leave_event_outbox`** | **M04-owned** | M04 | Transactional outbox of leave domain events (signed, lineage-keyed, leased) |
| **E9** | **`sr_event_mapping`** | **M04-owned** | M04 | Versioned mapping: leave type/spell → SR entry type **or `EXCLUDED_NON_SR`** + rules + statutory citation |
| **E10** | **`sr_posting_log`** | **M04-owned** | M04 | Append-only record of every posting attempt & outcome |
| **E11** | **`sr_dead_letter`** | **M04-owned** | M04 | Quarantined poison events awaiting resolution |
| **E12** | **`reconciliation_run`** | **M04-owned** | M04 | A reconciliation execution header |
| **E13** | **`reconciliation_finding`** | **M04-owned** | M04 | A single drift/mismatch finding + remediation state |
| **E14** | **`sr_correction_link`** | **M04-owned** | M04 | Links a correcting/reversing SR entry to its original |
| **E15** | **`historical_leave_batch`** | **M04-owned** | M04 | Digitisation batch header (legacy leave load) |
| **E16** | **`historical_leave_record`** | **M04-owned** | M04 | A staged legacy leave record (with confidence/adjudication) |
| **E17** | **`integration_config`** | **M04-owned** | M04 | Retry/SLA/lease/breaker/scheduler settings (effective-dated) |
| **E18** | **`relay_partition_lease`** | **M04-owned** | M04 | Per-partition (employee/lineage) in-order processing lease |
| **E19** | **`port_conformance_run`** | **M04-owned** | M04 | M12 SR write-port bilateral-contract conformance test result |
| **E20** | **`capture_integrity_finding`** | **M04-owned** | M04 | Source-ledger ↔ outbox integrity reconciliation finding |
| **E21** | **`prepension_certificate`** | **M04-owned** | M04 | Signed, checksummed pre-pension completeness certificate |

> M04 introduces **14 owned entities** (E8–E21) and references **7 canonical/source entities** (E1–E7).

### 5.2 Field tables (M04-owned entities) + sample data

#### E8 — `leave_event_outbox`

| Field | Type | Null | Notes |
|---|---|---|---|
| `outbox_id` | UUID PK | N | |
| `correlation_id` | UUID | N | Stable id of the leave domain event |
| `leave_spell_lineage_id` | UUID | N | **(v2)** M03-issued, stable across approve/amend/cancel; primary join key |
| `event_sequence` | int | N | **(v2)** Monotonic within lineage (approve=1, amend=2, …) |
| `employee_id` | UUID FK→employees | N | Subject; also the default `partition_key` |
| `partition_key` | varchar(64) | N | **(v2)** Serialisation key (default = employee_id) for in-order claiming |
| `leave_ledger_entry_id` | UUID FK→leave_ledger_entries | N | Source spell |
| `event_type` | enum | N | LEAVE_APPROVED / LEAVE_CANCELLED / LEAVE_AMENDED |
| `leave_type_code` | varchar(32) | N | e.g., EL, HPL, LWP, EOL, STUDY, MATERNITY, CASUAL |
| `spell_start` | date | N | |
| `spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | Calendar/qualifying day count from M03 |
| `prior_outbox_id` | UUID | Y | For amendments/cancellations, references the original event |
| `payload` | jsonb | N | Frozen snapshot of source fields needed for mapping/posting |
| `payload_signature` | varchar(128) | N | **(v2)** HMAC of payload signed by M03 capture key (R17) |
| `dedupe_key` | varchar(128) | Y | **(v2)** `hash(lineage + ':' + event_type + ':' + event_sequence)`; mapping-version-independent |
| `pinned_mapping_version` | int | Y | **(v2)** Resolved once at first claim; never recomputed across retries |
| `status` | enum | N | PENDING / **BLOCKED_AWAITING_ORIGINAL** / IN_FLIGHT / POSTED / FAILED / DEAD_LETTERED / EXCLUDED |
| `claimed_at` | timestamptz | Y | **(v2)** Lease start; null when not claimed |
| `lease_expires_at` | timestamptz | Y | **(v2)** Visibility timeout; reaper recovers expired IN_FLIGHT |
| `available_at` | timestamptz | N | Earliest time relay may pick (backoff) |
| `attempt_count` | int | N | Default 0 |
| `created_at` | timestamptz | N | |
| `created_by` | varchar | N | Source service principal |

*Append-only intent: rows are status-updated by the relay/reaper; never deleted.*

Sample data:

| outbox_id | lineage_id | event_seq | event_type | leave_type_code | days_count | status | pinned_mv | attempt |
|---|---|---|---|---|---|---|---|---|
| 6f1a…01 | lin…aa | 1 | LEAVE_APPROVED | EL | 10.0 | POSTED | 3 | 1 |
| 6f1a…02 | lin…bb | 1 | LEAVE_APPROVED | LWP | 121.0 | IN_FLIGHT | 3 | 2 |
| 6f1a…03 | lin…aa | 2 | LEAVE_CANCELLED | EL | 10.0 | BLOCKED_AWAITING_ORIGINAL | 3 | 0 |
| 6f1a…04 | lin…cc | 1 | LEAVE_APPROVED | CASUAL | 1.0 | EXCLUDED | — | 0 |

#### E9 — `sr_event_mapping`

| Field | Type | Null | Notes |
|---|---|---|---|
| `mapping_id` | UUID PK | N | |
| `mapping_version` | int | N | Monotonic per ruleset |
| `leave_type_code` | varchar(32) | N | Match key |
| `event_type` | enum | N | APPROVED/CANCELLED/AMENDED |
| `spell_predicate` | jsonb | Y | Optional conditions (e.g., days_count ≥ 120 ⇒ LONG_LEAVE) |
| `disposition` | enum | N | **(v2)** POST_SR / EXCLUDED_NON_SR — distinguishes "deliberately not posted" from "missing mapping" (R8) |
| `sr_entry_type` | varchar(48) | Y | Target SR entry type (M12 vocabulary); NULL when disposition=EXCLUDED_NON_SR |
| `qualifying_service_rule` | enum | Y | QUALIFYING / NON_QUALIFYING / PARTIAL / RULE_REF (NULL for EXCLUDED) |
| `qualifying_rule_ref` | varchar(64) | Y | Reference to statutory rule for PARTIAL |
| `statutory_rule_ref` | varchar(120) | N* | **(v2)** Human-readable rule citation (e.g., "CCS (Leave) Rules 1972 r.43"); **NOT NULL for POST_SR rows** (R10/AI-19) |
| `straddle_handling` | enum | N | **(v2)** SPLIT_BY_EFFECTIVE / PIN_TO_SPELL_START — resolves FR-02↔FR-09 conflict (R16) |
| `annotation_template` | text | Y | Template for statutory annotation text |
| `effective_from` | date | N | |
| `effective_to` | date | Y | Null = open |
| `status` | enum | N | DRAFT / PUBLISHED / RETIRED |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Audit fields |

Sample data:

| mapping_id | ver | leave_type_code | event_type | disposition | sr_entry_type | qual_rule | statutory_rule_ref | status |
|---|---|---|---|---|---|---|---|---|
| m1…01 | 3 | EL | APPROVED | POST_SR | EARNED_LEAVE_AVAILED | QUALIFYING | CCS(Leave) r.26 | PUBLISHED |
| m1…02 | 3 | LWP | APPROVED | POST_SR | LWP_SPELL | NON_QUALIFYING | CCS(Leave) r.43-A | PUBLISHED |
| m1…03 | 3 | CASUAL | APPROVED | EXCLUDED_NON_SR | — | — | Casual leave non-SR (admin) | PUBLISHED |

#### E10 — `sr_posting_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `posting_id` | UUID PK | N | |
| `outbox_id` | UUID FK→leave_event_outbox | N | |
| `correlation_id` | UUID | N | |
| `leave_spell_lineage_id` | UUID | N | **(v2)** Threaded for chain/recon reconstruction |
| `event_sequence` | int | N | **(v2)** |
| `dedupe_key` | varchar(128) | N | **(v2)** Mapping-version-independent; = M12 Idempotency-Key |
| `mapping_id` | UUID FK→sr_event_mapping | N | Mapping version used (pinned) |
| `sr_event_id` | UUID | Y | Returned by M12 on success (FK→service_register_events) |
| `sr_entry_type` | varchar(48) | N | |
| `attempt_no` | int | N | |
| `outcome` | enum | N | SUCCESS / RETRYABLE_FAILURE / PERMANENT_FAILURE / DUPLICATE_NOOP |
| `http_status` | int | Y | From M12 |
| `error_code` | varchar(48) | Y | M12 or M04 error code |
| `error_detail` | text | Y | |
| `latency_ms` | int | Y | |
| `posted_at` | timestamptz | N | |
| `posted_by` | varchar | N | Service principal or actor (manual) |

*Append-only.*

Sample data:

| posting_id | lineage_id | dedupe_key | sr_event_id | outcome | attempt_no | latency_ms |
|---|---|---|---|---|---|---|
| p…01 | lin…aa | k:linaa:APPR:1 | sr…77 | SUCCESS | 1 | 142 |
| p…02 | lin…bb | k:linbb:APPR:1 | — | RETRYABLE_FAILURE | 1 | 5012 |
| p…03 | lin…bb | k:linbb:APPR:1 | sr…78 | DUPLICATE_NOOP | 3 | 88 |

#### E11 — `sr_dead_letter`

| Field | Type | Null | Notes |
|---|---|---|---|
| `dlq_id` | UUID PK | N | |
| `outbox_id` | UUID FK | N | |
| `correlation_id` | UUID | N | |
| `leave_spell_lineage_id` | UUID | N | **(v2)** |
| `failure_class` | enum | N | MAPPING_MISSING / VALIDATION_REJECT / UPSTREAM_DOWN / DATA_CONFLICT / SIGNATURE_INVALID / UNKNOWN |
| `last_error_code` | varchar(48) | N | |
| `last_error_detail` | text | Y | |
| `attempts_exhausted` | int | N | |
| `state` | enum | N | OPEN / IN_REVIEW / RESOLVED_REPLAYED / RESOLVED_DISCARDED |
| `assigned_to` | UUID FK→users | Y | |
| `resolution_workflow_id` | UUID FK→workflow_instances | Y | Maker-checker for SR write |
| `resolution_note` | text | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | std | | |

Sample data:

| dlq_id | lineage_id | failure_class | last_error_code | state | attempts_exhausted |
|---|---|---|---|---|---|
| d…01 | lin…dd | MAPPING_MISSING | LSR_MAPPING_NOT_FOUND | OPEN | 5 |
| d…02 | lin…ee | UPSTREAM_DOWN | UPSTREAM_UNAVAILABLE | IN_REVIEW | 8 |
| d…03 | lin…ff | SIGNATURE_INVALID | LSR_SIGNATURE_INVALID | OPEN | 1 |

#### E12 — `reconciliation_run`

| Field | Type | Null | Notes |
|---|---|---|---|
| `run_id` | UUID PK | N | |
| `run_type` | enum | N | SCHEDULED / ON_DEMAND / PRE_PENSION / **SOURCE_OUTBOX_INTEGRITY** |
| `scope` | jsonb | N | Filters: org_unit, date range, employee set |
| `leave_records_examined` | int | N | |
| `sr_entries_examined` | int | N | |
| `pending_excluded_count` | int | N | **(v2)** Events legitimately PENDING/in-backoff/DEAD_LETTERED excluded from MISSING (R6) |
| `findings_count` | int | N | |
| `status` | enum | N | RUNNING / COMPLETED / FAILED |
| `started_at` | timestamptz | N | |
| `completed_at` | timestamptz | Y | |
| `triggered_by` | UUID FK→users | Y | Null for scheduled |

Sample data:

| run_id | run_type | leave_examined | sr_examined | pending_excluded | findings | status |
|---|---|---|---|---|---|---|
| r…01 | SCHEDULED | 12840 | 12835 | 4 | 1 | COMPLETED |
| r…02 | PRE_PENSION | 41 | 41 | 0 | 0 | COMPLETED |
| r…03 | SOURCE_OUTBOX_INTEGRITY | 12840 | — | — | 0 | COMPLETED |

#### E13 — `reconciliation_finding`

| Field | Type | Null | Notes |
|---|---|---|---|
| `finding_id` | UUID PK | N | |
| `run_id` | UUID FK→reconciliation_run | N | |
| `employee_id` | UUID FK→employees | N | |
| `correlation_id` | UUID | Y | If linkable to a leave event |
| `leave_spell_lineage_id` | UUID | Y | **(v2)** Primary match key; chains resolved before diffing |
| `finding_type` | enum | N | MISSING_SR / DUPLICATE_SR / DIVERGENT_FIELD / ORPHAN_CORRECTION / UNMAPPED_LEAVE / **CORRECTION_WITHOUT_LINK** |
| `severity` | enum | N | LOW / MEDIUM / HIGH / CRITICAL |
| `leave_snapshot` | jsonb | Y | Source side |
| `sr_snapshot` | jsonb | Y | Target side (net-effective after chain resolution) |
| `divergent_fields` | jsonb | Y | Field-level diff |
| `remediation_state` | enum | N | OPEN / REMEDIATION_PROPOSED / APPROVED / APPLIED / WAIVED |
| `remediation_workflow_id` | UUID FK→workflow_instances | Y | |
| `created_at`/`updated_at`/`updated_by` | std | | |

Sample data:

| finding_id | finding_type | severity | lineage_id | remediation_state |
|---|---|---|---|---|
| f…01 | MISSING_SR | HIGH | lin…12 | OPEN |
| f…02 | DUPLICATE_SR | CRITICAL | lin…34 | REMEDIATION_PROPOSED |
| f…03 | CORRECTION_WITHOUT_LINK | HIGH | lin…56 | OPEN |

#### E14 — `sr_correction_link`

| Field | Type | Null | Notes |
|---|---|---|---|
| `link_id` | UUID PK | N | |
| `original_sr_event_id` | UUID FK→service_register_events | N | The entry being corrected/reversed |
| `correcting_sr_event_id` | UUID FK→service_register_events | N | The new append-only entry |
| `leave_spell_lineage_id` | UUID | N | **(v2)** Recoverable from M12-stored lineage even if local insert lost (R9) |
| `correction_type` | enum | N | REVERSAL / AMENDMENT / SUPERSEDE |
| `reason_code` | varchar(48) | N | LEAVE_CANCELLED / LEAVE_AMENDED / RECON_FIX / MIGRATION_FIX |
| `correlation_id` | UUID | Y | Triggering leave event |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| link_id | correction_type | reason_code | lineage_id | original→correcting |
|---|---|---|---|---|
| l…01 | REVERSAL | LEAVE_CANCELLED | lin…aa | sr…77 → sr…90 |
| l…02 | AMENDMENT | LEAVE_AMENDED | lin…bb | sr…78 → sr…91 |
| l…03 | SUPERSEDE | RECON_FIX | lin…cc | sr…80 → sr…92 |

#### E15 — `historical_leave_batch`

| Field | Type | Null | Notes |
|---|---|---|---|
| `batch_id` | UUID PK | N | |
| `batch_label` | varchar(120) | N | e.g., "Office X legacy leave 1995-2010" |
| `source_type` | enum | N | PAPER_SCAN / LEGACY_SYSTEM / SPREADSHEET |
| `source_document_id` | UUID FK→documents | Y | Provenance |
| `records_total` | int | N | |
| `records_valid` | int | N | |
| `records_rejected` | int | N | |
| `status` | enum | N | STAGED / VALIDATED / APPROVED / POSTED / PARTIALLY_POSTED / REJECTED |
| `approval_workflow_id` | UUID FK→workflow_instances | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | std | | |

Sample data:

| batch_id | batch_label | source_type | records_total | records_valid | status |
|---|---|---|---|---|---|
| b…01 | Office-X legacy 1995-2010 | PAPER_SCAN | 1450 | 1438 | VALIDATED |
| b…02 | Legacy HRMS dump 2011-2018 | LEGACY_SYSTEM | 9802 | 9790 | POSTED |
| b…03 | Spreadsheet Dept-Y | SPREADSHEET | 230 | 198 | PARTIALLY_POSTED |

#### E16 — `historical_leave_record`

| Field | Type | Null | Notes |
|---|---|---|---|
| `record_id` | UUID PK | N | |
| `batch_id` | UUID FK→historical_leave_batch | N | |
| `employee_id` | UUID FK→employees | Y | Resolved during validation |
| `leave_spell_lineage_id` | UUID | Y | **(v2)** Deterministically derived for migrated identity |
| `service_no_raw` | varchar(64) | N | As-keyed; resolved to employee_id |
| `leave_type_code` | varchar(32) | N | Mapped from legacy code |
| `spell_start`/`spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | |
| `qualifying_flag` | enum | Y | Derived via mapping |
| `statutory_rule_ref` | varchar(120) | Y | **(v2)** Mandatory before posting a qualifying-service migrated entry (R15) |
| `confidence` | enum | N | **(v2)** HIGH / MEDIUM / LOW — drives provisional flag |
| `adjudication_state` | enum | N | **(v2)** PROVISIONAL / ADJUDICATED_CONFIRMED / ADJUDICATED_REJECTED |
| `validation_state` | enum | N | PENDING / VALID / REJECTED |
| `reject_reason` | varchar(120) | Y | |
| `posted_sr_event_id` | UUID | Y | After posting |
| `created_at`/`created_by` | std | | |

Sample data:

| record_id | service_no_raw | leave_type_code | confidence | adjudication_state | validation_state |
|---|---|---|---|---|---|
| h…01 | EMP-1995-1123 | EL | HIGH | ADJUDICATED_CONFIRMED | VALID |
| h…02 | EMP-2001-0457 | LWP | LOW | PROVISIONAL | VALID |
| h…03 | EMP-9999-XXXX | STUDY | LOW | PROVISIONAL | REJECTED |

#### E17 — `integration_config`

| Field | Type | Null | Notes |
|---|---|---|---|
| `config_id` | UUID PK | N | |
| `key` | varchar(64) | N | e.g., max_retries, backoff_base_ms, lease_timeout_ms, reaper_interval_ms, posting_sla_minutes, breaker_enabled |
| `value` | jsonb | N | |
| `effective_from` | timestamptz | N | |
| `effective_to` | timestamptz | Y | |
| `updated_by` | varchar | N | |
| `created_at`/`updated_at` | std | | |

Sample data:

| config_id | key | value | effective_from |
|---|---|---|---|
| cfg…01 | max_retries | 8 | 2026-01-01 |
| cfg…02 | lease_timeout_ms | 120000 | 2026-01-01 |
| cfg…03 | breaker_enabled | false | 2026-01-01 |

#### E18 — `relay_partition_lease` *(new in v2 — R5/AI-7)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `lease_id` | UUID PK | N | |
| `partition_key` | varchar(64) | N | Unique active lease per partition (employee/lineage) |
| `owner_worker_id` | varchar(64) | N | Relay instance holding the partition |
| `acquired_at` | timestamptz | N | |
| `lease_expires_at` | timestamptz | N | Visibility timeout; reaper reclaims expired |
| `last_processed_sequence` | int | Y | Highest `event_sequence` processed in-order for the partition |
| `status` | enum | N | ACTIVE / RELEASED / EXPIRED |
| `created_at`/`updated_at` | std | | |

Sample data:

| lease_id | partition_key | owner_worker_id | last_processed_seq | status |
|---|---|---|---|---|
| pl…01 | emp-12 | relay-a-7 | 2 | ACTIVE |
| pl…02 | emp-34 | relay-b-3 | 1 | ACTIVE |
| pl…03 | emp-56 | relay-a-7 | 5 | EXPIRED |

#### E19 — `port_conformance_run` *(new in v2 — R2/AI-3)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `conformance_id` | UUID PK | N | |
| `contract_version` | varchar(32) | N | M12 port contract version exercised |
| `dedupe_retention_days` | int | N | Asserted retention (must be ≥ 2557 ≈ 7y) |
| `indexes_verified` | jsonb | N | `{dedupe_key:true, correlationId:true, lineage:true}` |
| `append_only_verified` | boolean | N | UPDATE/DELETE on SR rejected |
| `dedupe_replay_verified` | boolean | N | Repeat post at retention horizon returns original sr_event_id |
| `result` | enum | N | PASS / FAIL |
| `evidence_checksum` | varchar(64) | N | SHA-256 of the conformance evidence bundle |
| `run_at` | timestamptz | N | |
| `run_by` | varchar | N | CI principal / Sys Admin |

Sample data:

| conformance_id | contract_version | dedupe_retention_days | result | run_at |
|---|---|---|---|---|
| pc…01 | 1.0 | 2557 | PASS | 2026-06-25 |
| pc…02 | 1.0 | 365 | FAIL | 2026-06-20 |
| pc…03 | 1.1 | 2922 | PASS | 2026-06-29 |

#### E20 — `capture_integrity_finding` *(new in v2 — R7/R17/AI-4/AI-18)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `integrity_id` | UUID PK | N | |
| `run_id` | UUID FK→reconciliation_run | N | A SOURCE_OUTBOX_INTEGRITY run |
| `employee_id` | UUID FK→employees | N | |
| `leave_ledger_entry_id` | UUID | Y | M03 ledger row missing/extra outbox coverage |
| `leave_spell_lineage_id` | UUID | Y | |
| `finding_type` | enum | N | LEDGER_WITHOUT_OUTBOX / OUTBOX_WITHOUT_LEDGER / SIGNATURE_MISMATCH |
| `severity` | enum | N | LOW / MEDIUM / HIGH / CRITICAL |
| `state` | enum | N | OPEN / BACKFILLED / WAIVED |
| `detail` | jsonb | Y | |
| `created_at`/`updated_at`/`updated_by` | std | | |

Sample data:

| integrity_id | finding_type | severity | state | lineage_id |
|---|---|---|---|---|
| ci…01 | LEDGER_WITHOUT_OUTBOX | HIGH | BACKFILLED | lin…77 |
| ci…02 | SIGNATURE_MISMATCH | CRITICAL | OPEN | lin…78 |
| ci…03 | OUTBOX_WITHOUT_LEDGER | MEDIUM | WAIVED | lin…79 |

#### E21 — `prepension_certificate` *(new in v2 — AI-21)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `certificate_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | Retiring employee |
| `run_id` | UUID FK→reconciliation_run | N | The PRE_PENSION run it certifies |
| `open_high_critical_findings` | int | N | Must be 0 to issue a PASS certificate |
| `total_non_qualifying_days` | numeric(8,1) | N | Net non-qualifying days from SR leave entries |
| `lineage_complete` | boolean | N | All lineages resolvable end-to-end |
| `provisional_entries_remaining` | int | N | Must be 0 (all adjudicated) for PASS |
| `result` | enum | N | PASS / FAIL |
| `checksum` | varchar(64) | N | SHA-256 over the certified evidence bundle |
| `signed_by` | UUID FK→users | N | SR Custodian signer |
| `signed_at` | timestamptz | N | |
| `consumed_by_m11_at` | timestamptz | Y | When M11 gated on it |

Sample data:

| certificate_id | employee_id | open_hc_findings | non_qual_days | provisional_remaining | result |
|---|---|---|---|---|---|
| cert…01 | emp…12 | 0 | 121.0 | 0 | PASS |
| cert…02 | emp…34 | 2 | 45.0 | 1 | FAIL |
| cert…03 | emp…56 | 0 | 0.0 | 0 | PASS |

### 5.3 Relationship map

```
employees (M01) 1───* leave_ledger_entries (M03) 1───1 leave_event_outbox (M04)   [lineage_id, signed payload]
leave_event_outbox  ──claim──► relay_partition_lease (per partition, in-order)
leave_event_outbox 1───* sr_posting_log ─────► service_register_events (M12)  [dedupe_key, lineage on SR]
leave_event_outbox 1───0..1 sr_dead_letter
sr_event_mapping (versioned, cited, disposition) ──used-by──► sr_posting_log
reconciliation_run 1───* reconciliation_finding   (lineage-keyed; pending/quarantined excluded)
reconciliation_run(SOURCE_OUTBOX_INTEGRITY) 1───* capture_integrity_finding ──► leave_ledger_entries
service_register_events ◄──original── sr_correction_link ──correcting──► service_register_events  [lineage recoverable]
historical_leave_batch 1───* historical_leave_record (confidence/adjudication) ──posts──► service_register_events
reconciliation_run(PRE_PENSION) 1───1 prepension_certificate ──gate-input──► M11
port_conformance_run ──gates──► live posting enablement (M12 contract)
documents (M13) ◄──provenance── historical_leave_batch
workflow_instances (shared) ──governs──► dlq resolution, recon remediation, historical promotion, manual corrections, post-pension qualifying gate
audit_log (shared) ◄──writes── every M04 state change
```

### 5.4 Ownership / reuse matrix

| Entity | Owner | M04 access | Written by M04? |
|---|---|---|---|
| employees | M01 | Read | No |
| leave_ledger_entries (+ lineage_id) | M03 | Read | No (consumes events) |
| service_register_events | M12 | Write via port + Read | Yes (append-only, via M12 port) |
| audit_log | Shared | Append | Yes |
| notifications | Shared | Append | Yes |
| documents | M13 | Read | No |
| workflow_* | Shared | Read/Write tasks | Yes |
| leave_event_outbox … prepension_certificate (E8–E21) | M04 | Full | Yes |

### 5.5 Enum catalog

| Enum | Values |
|---|---|
| `outbox.event_type` | LEAVE_APPROVED, LEAVE_CANCELLED, LEAVE_AMENDED |
| `outbox.status` | PENDING, **BLOCKED_AWAITING_ORIGINAL**, IN_FLIGHT, POSTED, FAILED, DEAD_LETTERED, **EXCLUDED** |
| `mapping.disposition` | **POST_SR, EXCLUDED_NON_SR** |
| `mapping.qualifying_service_rule` | QUALIFYING, NON_QUALIFYING, PARTIAL, RULE_REF |
| `mapping.straddle_handling` | **SPLIT_BY_EFFECTIVE, PIN_TO_SPELL_START** |
| `mapping.status` | DRAFT, PUBLISHED, RETIRED |
| `posting.outcome` | SUCCESS, RETRYABLE_FAILURE, PERMANENT_FAILURE, DUPLICATE_NOOP |
| `dlq.failure_class` | MAPPING_MISSING, VALIDATION_REJECT, UPSTREAM_DOWN, DATA_CONFLICT, **SIGNATURE_INVALID**, UNKNOWN |
| `dlq.state` | OPEN, IN_REVIEW, RESOLVED_REPLAYED, RESOLVED_DISCARDED |
| `recon.run_type` | SCHEDULED, ON_DEMAND, PRE_PENSION, **SOURCE_OUTBOX_INTEGRITY** |
| `recon.finding_type` | MISSING_SR, DUPLICATE_SR, DIVERGENT_FIELD, ORPHAN_CORRECTION, UNMAPPED_LEAVE, **CORRECTION_WITHOUT_LINK** |
| `recon.severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `recon.remediation_state` | OPEN, REMEDIATION_PROPOSED, APPROVED, APPLIED, WAIVED |
| `correction.type` | REVERSAL, AMENDMENT, SUPERSEDE |
| `correction.reason_code` | LEAVE_CANCELLED, LEAVE_AMENDED, RECON_FIX, MIGRATION_FIX |
| `batch.source_type` | PAPER_SCAN, LEGACY_SYSTEM, SPREADSHEET |
| `batch.status` | STAGED, VALIDATED, APPROVED, POSTED, PARTIALLY_POSTED, REJECTED |
| `hist_record.validation_state` | PENDING, VALID, REJECTED |
| `hist_record.confidence` | **HIGH, MEDIUM, LOW** |
| `hist_record.adjudication_state` | **PROVISIONAL, ADJUDICATED_CONFIRMED, ADJUDICATED_REJECTED** |
| `partition_lease.status` | **ACTIVE, RELEASED, EXPIRED** |
| `conformance.result` | **PASS, FAIL** |
| `integrity.finding_type` | **LEDGER_WITHOUT_OUTBOX, OUTBOX_WITHOUT_LEDGER, SIGNATURE_MISMATCH** |
| `integrity.state` | **OPEN, BACKFILLED, WAIVED** |
| `certificate.result` | **PASS, FAIL** |

### 5.6 Data integrity rules

1. **Outbox uniqueness:** `(leave_spell_lineage_id, event_sequence)` is unique — one outbox row per logical event occurrence in a spell's lifecycle; `(correlation_id, event_type)` remains a secondary uniqueness guard. **(v2: lineage+sequence is now the canonical identity.)**
2. **Dedupe determinism, mapping-version-independent (R4):** `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]`; M12 dedupes on it. A repeat call returns `DUPLICATE_NOOP` with the original `sr_event_id`. `mapping_version` is **excluded** from the dedupe key; an intentional remap is an explicit **correction** (new SR entry via `sr_correction_link`), never a silently-new post.
3. **Pinned mapping version (R4):** `pinned_mapping_version` is resolved once at first claim and persisted on the outbox row; the relay never recomputes it across retries.
4. **Append-only ledgers:** `sr_posting_log`, `sr_correction_link`, `prepension_certificate`, `audit_log`, and `service_register_events` are never updated/deleted; `leave_event_outbox` rows are status-mutated but never deleted.
5. **No hard SR edit:** M04 must never UPDATE or DELETE a `service_register_events` row; corrections are *new* entries linked via `sr_correction_link`.
6. **Mapping coverage & exclusion (R8):** every `(leave_type_code, event_type)` reaching the relay must resolve to exactly one PUBLISHED mapping effective at the relevant date. A `POST_SR` disposition with no resolvable target ⇒ DLQ `MAPPING_MISSING`; an `EXCLUDED_NON_SR` disposition ⇒ outbox `EXCLUDED` (deliberate no-op, **never DLQ'd**). Absence of any mapping for an SR-affecting type ⇒ DLQ `MAPPING_MISSING` (never a silent drop).
7. **Correction integrity & linkage (R9):** a `LEAVE_CANCELLED`/`LEAVE_AMENDED` event must produce a correction entry referencing the original by lineage; corrections flow through the same outbox/idempotency machinery; `sr_correction_link` is recoverable from M12-stored `leave_spell_lineage_id`. An SR correction entry without a local link reconciles as `CORRECTION_WITHOUT_LINK`. If the original SR entry cannot be found, raise `ORPHAN_CORRECTION` rather than posting an unlinked correction.
8. **Ordering guard (R5):** a correction event (`LEAVE_CANCELLED`/`LEAVE_AMENDED`) is **not posting-eligible** until its original spell entry is `POSTED`; until then it holds outbox status `BLOCKED_AWAITING_ORIGINAL`. Events for one `partition_key` are processed in `event_sequence` order.
9. **Lease & reaper (R1):** a claimed row carries `claimed_at` and `lease_expires_at`; the reaper returns expired `IN_FLIGHT` rows to retry-eligible (`FAILED`), increments `attempt_count`, and emits an alert. No `IN_FLIGHT` row may be stranded beyond `lease_timeout`.
10. **Bounded retries:** `attempt_count ≤ max_retries (config)`; on exhaustion ⇒ move to `sr_dead_letter` and set outbox `DEAD_LETTERED`.
11. **Lineage threading (R3):** `leave_spell_lineage_id` is mandatory and immutable on outbox, posting log, DLQ, correction link, reconciliation/integrity findings, every SR entry posted, and the pre-pension certificate; it is the primary join key for all matching and totalling. A captured event without a lineage id is rejected `LSR_LINEAGE_MISSING`.
12. **Capture provenance (R17):** every outbox row carries a valid `payload_signature`; an invalid/missing signature is rejected (`LSR_SIGNATURE_INVALID`) and recorded as a `capture_integrity_finding` of type `SIGNATURE_MISMATCH`.
13. **Provisional migrated entries (R15):** migrated SR entries with `confidence < HIGH` are flagged `PROVISIONAL`, require a `statutory_rule_ref`, and are **excluded from final pension computation** until `ADJUDICATED_CONFIRMED`.
14. **Conformance gate (R2):** live posting may be enabled only when the latest `port_conformance_run` for the active contract version is `PASS` with `dedupe_retention_days ≥ 2557`.
15. **Effective-dated config/mapping:** only one PUBLISHED mapping version per `(leave_type_code, event_type)` may be effective at any date; overlapping effective ranges are rejected at publish.
16. **FK respect:** all FKs to `employees`, `service_register_events`, `documents`, `workflow_instances` must reference existing, non-deleted rows.

---

## Section 6 — Functional Requirements

> Each FR follows: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table.

---

### FR-01 — Capture approved leave events via signed transactional outbox

- **ID:** FR-01
- **Module:** M04-LSR
- **Primary Role(s):** System (M03 source service principal), IntegOps (observe)
- **User Story:** *As the HRMS, when a leave application is approved (or cancelled/amended) in M03, I want the event captured durably and signed in the same transaction as the leave-ledger write — carrying a stable spell lineage — so that no leave event can ever be lost, forged, or untraceable before reaching the Service Register.*

**Description.** On a terminal leave decision in M03 (`LEAVE_APPROVED`, `LEAVE_CANCELLED`, `LEAVE_AMENDED`), an outbox row is written **atomically inside M03's database transaction** (decision D-1). The row carries the M03-issued `leave_spell_lineage_id` (stable across the spell lifecycle), a monotonic `event_sequence`, a frozen `payload` snapshot, and an HMAC `payload_signature`. M04 reads the outbox; M03 never calls M12 directly. FR-17 independently reconciles outbox coverage against the M03 ledger.

**Acceptance Criteria.**
1. Every approved/cancelled/amended SR-affecting leave commit produces exactly one outbox row in the same DB transaction (verified under the adopted in-tx architecture: no committed leave decision without a corresponding outbox row; the inverse is checked by FR-17).
2. If the transaction rolls back, neither the ledger nor the outbox row persists.
3. The outbox `payload` is an immutable snapshot; subsequent edits to the source spell do not mutate it.
4. `(leave_spell_lineage_id, event_sequence)` uniqueness is enforced; duplicate emission is a no-op.
5. New outbox rows default to `status=PENDING` (or `BLOCKED_AWAITING_ORIGINAL` for a correction whose original is not yet POSTED), `available_at=now()`, `attempt_count=0`.
6. Every captured row carries a non-null `leave_spell_lineage_id` and a valid `payload_signature`; a missing lineage is rejected `LSR_LINEAGE_MISSING`, an invalid signature `LSR_SIGNATURE_INVALID`.

**Business Rules.**
- BR-01.1 **(v2, resolves R8)** Outbox capture occurs for all leave types that resolve to a `POST_SR` mapping. Leave types that resolve to `EXCLUDED_NON_SR` (e.g., casual leave) are still captured but immediately set to outbox `EXCLUDED` (deliberate no-op) — they are **never DLQ'd as MAPPING_MISSING**. Only an SR-affecting type with *no* mapping dead-letters.
- BR-01.2 Amendments/cancellations reuse the spell's `leave_spell_lineage_id`, increment `event_sequence`, and set `prior_outbox_id`. *(v2: lineage is stable; correlation_id may differ per event but lineage does not.)*
- BR-01.3 The source principal is recorded in `created_by`.
- BR-01.4 **(v2, R17)** The capture payload is HMAC-signed by the M03 capture key; only the `lsr.outbox.write` principal may insert outbox rows.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Insert (write) |
| `leave_ledger_entries` (M03) | Read snapshot source + lineage_id |
| `sr_event_mapping` | Resolve disposition at capture (POST_SR vs EXCLUDED_NON_SR) |
| `audit_log` | Append capture event |

**API References.**

| API | Purpose |
|---|---|
| Internal outbox write (within M03 tx) | Atomic, signed capture |
| `GET /api/v1/lsr/outbox` | IntegOps observability (paginated) |

**UI Behavior Notes.** No end-user UI; outbox visible read-only in the monitoring console as the "Inbound queue" panel with status counts (incl. EXCLUDED and BLOCKED_AWAITING_ORIGINAL buckets).

**Edge Cases.**
- Duplicate event emission (at-least-once source) → `(lineage, sequence)` unique constraint makes it idempotent.
- M03 emits an event for an SR-affecting leave type with no mapping → captured anyway; fails later into DLQ (never dropped).
- Casual/non-SR leave → captured then `EXCLUDED` (no DLQ flood).
- Forged/unsigned payload → rejected and raised as `SIGNATURE_MISMATCH` integrity finding (FR-17).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `OutboxWriter` (in M03 tx boundary/shared lib), `PayloadSigner`, `DispositionResolver`, `OutboxRepository` |
| Backend flow | M03 commits ledger + signed outbox row in one tx → resolve disposition → row visible to relay poll |
| Data operations | INSERT into `leave_event_outbox`; SELECT snapshot + lineage of source spell |
| Validation | Required fields present; enum valid; `(lineage,sequence)` unique; signature valid; lineage non-null |
| Authorization | Source service principal with `lsr.outbox.write` scope |
| State changes & side effects | New PENDING/BLOCKED/EXCLUDED outbox row; audit_log append |
| Failure handling | Tx rollback discards both writes; unique violation → no-op; bad signature/lineage → reject |
| Dependencies | M03 ledger schema + lineage issuance; shared DB transaction; FR-02 disposition |
| Test guidance | Atomic commit/rollback; duplicate emission idempotent; payload immutability; signature verify; EXCLUDED path |

---

### FR-02 — Governed event-mapping catalog (disposition + qualifying rule + statutory citation)

- **ID:** FR-02
- **Module:** M04-LSR
- **Primary Role(s):** System Administrator (author DRAFT), SR Custodian (approve/publish)
- **User Story:** *As an SR Custodian, I want a versioned, effective-dated catalog that maps each leave type/spell condition either to the correct statutory SR entry type (with qualifying-service rule and a cited statutory authority) or to an explicit non-SR exclusion, so that posting is deterministic, auditable, citable, and changeable without code deployment.*

**Description.** The catalog (`sr_event_mapping`) defines, per `(leave_type_code, event_type[, spell_predicate])`, a **disposition** (`POST_SR` or `EXCLUDED_NON_SR`); for `POST_SR`, the target `sr_entry_type`, the `qualifying_service_rule`, a **mandatory `statutory_rule_ref`** citation, a `straddle_handling` rule, an optional `annotation_template`, and an effective-date range. Versions are immutable once PUBLISHED; changes create a new version. Maker (Sys Admin) drafts; checker (SR Custodian) publishes.

**Acceptance Criteria.**
1. A DRAFT mapping can be created, edited, and deleted; a PUBLISHED mapping cannot be edited (only superseded by a new version or RETIRED).
2. Publishing requires SR Custodian approval (maker ≠ checker).
3. No two PUBLISHED mappings for the same `(leave_type_code, event_type)` may have overlapping effective ranges (rejected at publish with `LSR_MAPPING_OVERLAP`).
4. The relay resolves the mapping effective at the relevant date; if a `POST_SR` mapping is absent for an SR-affecting type, the event dead-letters as `MAPPING_MISSING`; an `EXCLUDED_NON_SR` disposition yields a deliberate no-op (`EXCLUDED`).
5. Every publish/retire writes to `audit_log` with version and actor.
6. **(v2, R10/AI-19)** Every `POST_SR` mapping has a non-null `statutory_rule_ref`; publish is rejected (`VALIDATION_ERROR`, field `statutory_rule_ref`) if missing. The citation is surfaced in the audit evidence pack (FR-14).

**Business Rules.**
- BR-02.1 `spell_predicate` may classify long leave (e.g., `days_count ≥ 120 ⇒ LONG_LEAVE`) and route LWP/EOL to `NON_QUALIFYING`.
- BR-02.2 The qualifying rule on the resulting SR entry is sourced solely from the mapping (single source of truth).
- BR-02.3 Mapping versions are referenced (pinned) in `sr_posting_log.mapping_id` for traceability.
- BR-02.4 **(v2, resolves R16)** A spell that straddles a mapping rule-change effective date is handled per `straddle_handling`: the adopted default `SPLIT_BY_EFFECTIVE` splits the spell into per-effective-range SR sub-entries (each cited); `PIN_TO_SPELL_START` is available where statute requires whole-spell treatment. FR-09 consumes the same rule — no contradiction remains.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_event_mapping` | CRUD (draft) / publish |
| `workflow_instances` | Maker-checker for publish |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/mappings` | Create draft |
| `PUT /api/v1/lsr/mappings/{id}` | Edit draft |
| `POST /api/v1/lsr/mappings/{id}/publish` | Submit for approval |
| `GET /api/v1/lsr/mappings` | List (effective-date filter) |

**UI Behavior Notes.** Admin "Mapping Catalog" screen: list with version, status, disposition, effective range, statutory citation; diff view between versions; publish action gated by role; predicate builder for spell conditions; straddle-handling selector; mandatory citation field.

**Edge Cases.**
- Legacy leave type with no modern equivalent → map to generic `LEGACY_LEAVE_AVAILED` with citation and annotation.
- Casual/non-SR leave → `EXCLUDED_NON_SR` disposition (no DLQ).
- Spell straddling a rule change → `SPLIT_BY_EFFECTIVE` sub-entries.
- Attempt to retire a mapping with in-flight events → allowed; in-flight postings retain their pinned `mapping_version`.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `MappingService`, `MappingResolver`, `StraddleSplitter`, `MappingPublishWorkflow` |
| Backend flow | Draft → submit → checker approves → PUBLISHED with overlap + citation validation |
| Data operations | INSERT/UPDATE (draft only); INSERT new version on change |
| Validation | Overlap check; predicate schema; disposition/enum validity; citation non-null for POST_SR |
| Authorization | Sys Admin (draft), SR Custodian (publish) |
| State changes & side effects | Version status transitions; audit append |
| Failure handling | Overlap → `LSR_MAPPING_OVERLAP`; missing citation → VALIDATION_ERROR; publish-by-non-checker → FORBIDDEN |
| Dependencies | M12 SR entry-type vocabulary; workflow engine |
| Test guidance | Overlap matrix; resolver-by-date; immutability; citation enforcement; straddle split correctness; EXCLUDED disposition |

---

### FR-03 — Partitioned, idempotent posting relay with exactly-once effect

- **ID:** FR-03
- **Module:** M04-LSR
- **Primary Role(s):** System (relay worker), IntegOps (monitor)
- **User Story:** *As the integration, I want a relay that drains the outbox per-partition in spell-lineage order and posts each event to the M12 SR write port exactly once — using a stable, mapping-version-independent dedupe key, and never posting a correction before its original — so that retries, concurrency, and remaps never create duplicate or out-of-order statutory entries.*

**Description.** The relay claims work **per `partition_key` (employee/lineage)**: it acquires a `relay_partition_lease`, then processes that partition's eligible events strictly in `event_sequence` order. For each event it pins/reads `pinned_mapping_version`, computes the deterministic `dedupe_key` (lineage + event_type + event_sequence — **excluding mapping_version**), and calls M12's idempotent SR write port with `dedupe_key` as the `Idempotency-Key`. On success it records `sr_event_id`, marks the outbox `POSTED`, advances `last_processed_sequence`, and appends to `sr_posting_log`. A correction event remains `BLOCKED_AWAITING_ORIGINAL` until its original spell entry is `POSTED`. M12 dedupes on the key, so a repeat returns the original `sr_event_id` as `DUPLICATE_NOOP`. The lease + `lease_expires_at` make crashed in-flight work recoverable (FR-15).

**Acceptance Criteria.**
1. Each successfully posted event results in exactly one `service_register_events` row (verified by reconciliation).
2. Concurrent relay instances never post the same partition's events twice (partition lease + dedupe key); events within a partition are posted in `event_sequence` order.
3. A replayed/duplicated call to M12 with the same `dedupe_key` returns the original `sr_event_id` and is logged `DUPLICATE_NOOP` (no second SR row), **including after a mapping remap** (the dedupe key is mapping-version-independent).
4. A `LEAVE_CANCELLED`/`LEAVE_AMENDED` event is not posted while its original spell entry is not yet `POSTED` (status `BLOCKED_AWAITING_ORIGINAL`).
5. Posting latency (claim→confirm) is recorded; P95 ≤ 5 minutes under normal load.
6. Every attempt (success or failure) appends a `sr_posting_log` row carrying lineage and dedupe key.
7. `pinned_mapping_version` is resolved once at first claim, persisted on the outbox row, and never recomputed across retries.

**Business Rules.**
- BR-03.1 **(v2, R4)** `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]`; `mapping_version` is **not** part of the key. An intentional remap is posted as an explicit correction (FR-08), never as a silently-new post.
- BR-03.2 **(v2, R4)** The relay pins the mapping version at first claim into `pinned_mapping_version` and records `mapping_id` in the posting log; it is immutable across retries.
- BR-03.3 **(v2, R5/R1)** Outbox transitions: PENDING → IN_FLIGHT (on claim, sets `claimed_at`/`lease_expires_at`) → POSTED (success) | FAILED (retryable / lease-expired via reaper) | DEAD_LETTERED (exhausted); BLOCKED_AWAITING_ORIGINAL → PENDING when the original reaches POSTED.
- BR-03.4 **(v2, R5)** Events are claimed and processed per partition in `event_sequence` order; a partition is processed by at most one worker at a time (lease).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Claim + status update + lease |
| `relay_partition_lease` | Per-partition in-order claim |
| `sr_posting_log` | Append attempt |
| `sr_event_mapping` | Resolve + pin |
| `service_register_events` (M12) | Write via port |

**API References.**

| API | Purpose |
|---|---|
| `POST {M12}/api/v1/sr/events` (Idempotency-Key = dedupe_key) | Append SR entry |
| `GET /api/v1/lsr/postings` | Posting log (paginated) |

**UI Behavior Notes.** Console "Posting log" panel: searchable by lineage/correlation_id/employee, outcome filter, latency column, link to SR entry; partition/lease view showing in-order progress.

**Edge Cases.**
- M12 returns 200 but relay crashes before marking POSTED → lease expires → reaper (FR-15) re-enqueues → re-post with same key → `DUPLICATE_NOOP`, then marks POSTED (self-heals).
- M12 returns ambiguous timeout → treat as RETRYABLE; dedupe guarantees safety on retry.
- Correction arrives before its original (unordered source) → held `BLOCKED_AWAITING_ORIGINAL` until original POSTED (no false ORPHAN_CORRECTION).
- Mapping remapped mid-retry → key unchanged (mapping-version-independent); no duplicate.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `PartitionedRelayWorker`, `PartitionLeaseManager`, `SrPostingClient`, `DedupeKeyFactory`, `OrderingGuard`, `OutboxClaimRepository` |
| Backend flow | Acquire partition lease → select oldest-eligible by sequence → pin mapping → build dedupe key → ordering guard → POST to M12 → record outcome → advance sequence → renew/release lease |
| Data operations | UPDATE outbox status/lease; UPDATE partition lease; INSERT posting_log; read mapping |
| Validation | Payload completeness; mapping resolved; key deterministic; original POSTED before correction |
| Authorization | Relay service principal `sr.events.write` (append-only) |
| State changes & side effects | New SR entry (M12); outbox POSTED; lease advance; metrics emitted |
| Failure handling | Retryable→FR-04; permanent→DLQ; ambiguous→retry; crash→FR-15 reaper |
| Dependencies | M12 idempotent write port (FR-16); scheduler; config (FR-04); partition lease |
| Test guidance | Crash-after-success replay; concurrency double-claim; in-order per-partition; remap-no-duplicate; correction-before-original held |

---

### FR-04 — Retry with backoff & dead-letter (circuit breaker optional / Phase-2)

- **ID:** FR-04
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), Sys Admin (configure), IntegOps (observe)
- **User Story:** *As the integration, I want transient failures retried with exponential backoff, a manual relay-pause for sustained outages, and poison events quarantined to a dead-letter store after exhausting retries, so that upstream outages self-heal and unrecoverable events are never silently lost — without over-engineering a circuit breaker for a single downstream.*

**Description.** Failures are classified retryable (UPSTREAM_UNAVAILABLE, timeouts, 5xx, RATE_LIMITED) vs permanent (VALIDATION_REJECT, MAPPING_MISSING, DATA_CONFLICT, SIGNATURE_INVALID). Retryable failures increment `attempt_count`, set `available_at = now + backoff(attempt)`, and keep status FAILED until the next claim. **Core controls are bounded retry + DLQ + a manual relay-pause override.** A **circuit breaker is an optional Phase-2 enhancement** (config `breaker_enabled`, default false): for a single downstream, bounded retry + DLQ + manual pause already cover the outage case. On exhausting `max_retries`, the event moves to `sr_dead_letter` and outbox becomes DEAD_LETTERED. A modest rate-limit/back-pressure protects M12 during migration bursts.

**Acceptance Criteria.**
1. Retryable failures retry up to `max_retries` (config) with exponential backoff + jitter.
2. Permanent failures dead-letter immediately (no pointless retries).
3. Exhausted retries create exactly one `sr_dead_letter` row and set outbox DEAD_LETTERED.
4. A manual relay-pause halts posting without data loss; resume re-drains the durable outbox.
5. All retries/DLQ moves append to `sr_posting_log` and `audit_log`.
6. **(v2, R12/R13)** A rate-limit caps posting throughput to protect M12 during bursts; the circuit breaker, when `breaker_enabled=true`, trips at the configured threshold, pauses posting, and raises a CRITICAL alert (optional path; state table 10.5).

**Business Rules.**
- BR-04.1 Backoff: `available_at = now + base * 2^(attempt-1) + jitter`, capped at a max delay.
- BR-04.2 Failure classification is centralised and config-tunable; `SIGNATURE_INVALID` is permanent.
- BR-04.3 **(v2)** The circuit breaker is optional and OFF by default; the **manual relay-pause** is the core outage control and is always available.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Update attempt/status/available_at |
| `sr_dead_letter` | Insert on exhaustion |
| `sr_posting_log` | Append |
| `integration_config` | Read retry/backoff/rate-limit/breaker_enabled |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` | List DLQ |
| `PUT /api/v1/lsr/config` | Update retry/SLA/rate-limit/breaker (Sys Admin) |
| `POST /api/v1/lsr/relay/pause` · `POST /api/v1/lsr/relay/resume` | Manual relay-pause override |

**UI Behavior Notes.** Dashboard shows DLQ depth, retry histogram, relay paused/running state, and (if enabled) breaker state; config screen for thresholds and `breaker_enabled` toggle.

**Edge Cases.**
- Thundering herd after outage → jitter + rate-limit spread retries.
- Permanent error misclassified as retryable → bounded by `max_retries` then DLQ.
- Sustained M12 outage → operator uses manual relay-pause; resume self-heals.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RetryPolicy`, `FailureClassifier`, `RateLimiter`, `RelayPauseSwitch`, `DeadLetterService`, `CircuitBreaker (optional)` |
| Backend flow | On failure → classify → (retryable: schedule backoff) | (permanent/exhausted: DLQ); manual pause halts claims |
| Data operations | UPDATE outbox; INSERT dlq; INSERT posting_log |
| Validation | attempt_count ≤ max_retries; classification deterministic |
| Authorization | Relay principal; Sys Admin for config; IntegOps for pause |
| State changes & side effects | Outbox FAILED/DEAD_LETTERED; pause state; optional breaker; alerts |
| Failure handling | DLQ guarantees no silent loss; manual pause prevents cascade |
| Dependencies | config; notifications; scheduler |
| Test guidance | Backoff math; classifier (incl. signature); exhaustion→DLQ; pause/resume; rate-limit; optional breaker trip |

---

### FR-05 — Dead-letter triage & maker-checker resolution

- **ID:** FR-05
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps / HR Officer (maker), SR Custodian (checker)
- **User Story:** *As an Integration Operator, I want to triage dead-lettered events, diagnose the cause, fix the root issue, and replay or discard them under maker-checker control, so that every quarantined leave event is resolved with full auditability.*

**Description.** DLQ items are listed with `failure_class`, last error, lineage, and snapshots. An operator can assign, investigate, and choose **Replay** (after fixing mapping/data/signature) or **Discard** (with justification). Replaying re-enqueues the original outbox row (resets to PENDING, preserves the lineage-based dedupe key). Any resolution that results in an SR write runs through maker-checker (IntegOps maker → SR Custodian checker).

**Acceptance Criteria.**
1. DLQ items are filterable by failure_class, severity, org_unit, age, lineage.
2. Replay re-enqueues with the same (lineage-based) dedupe key (no duplicate risk).
3. Discard requires a justification and SR Custodian approval; the item moves to RESOLVED_DISCARDED.
4. Resolution transitions and approvals are audited with actor and timestamp.
5. A DLQ item resolved as RESOLVED_REPLAYED is closed only after the replayed event reaches POSTED.

**Business Rules.**
- BR-05.1 Replay must not bypass mapping coverage — a `MAPPING_MISSING` item is only replayable after a covering `POST_SR` mapping is published.
- BR-05.2 Discard never deletes data; the row is retained as RESOLVED_DISCARDED with reason.
- BR-05.3 SR-writing resolutions require maker ≠ checker.
- BR-05.4 **(v2)** A `SIGNATURE_INVALID` item is only replayable after the payload is re-captured/re-signed by M03 (not operator-editable).

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_dead_letter` | Update state/assignment/resolution |
| `leave_event_outbox` | Re-enqueue on replay |
| `workflow_instances` | Maker-checker |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` | List |
| `POST /api/v1/lsr/dlq/{id}/assign` | Assign |
| `POST /api/v1/lsr/dlq/{id}/replay` | Replay (creates workflow) |
| `POST /api/v1/lsr/dlq/{id}/discard` | Discard (creates workflow) |

**UI Behavior Notes.** DLQ triage board (Kanban: Open / In review / Resolved); detail drawer with leave vs SR snapshot, error history, replay/discard actions; checker approval inbox.

**Edge Cases.**
- Replay after the source leave was further amended → outbox payload is frozen; if stale, operator discards and lets the newer (higher-sequence) event flow.
- Bulk replay after a fixed mapping → batch action with single workflow approval per batch.
- Checker rejects replay → item returns to IN_REVIEW with rejection note.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DlqService`, `ReplayService`, `DlqResolutionWorkflow` |
| Backend flow | Assign → investigate → replay/discard → workflow → on approve apply |
| Data operations | UPDATE dlq; UPDATE outbox (replay); INSERT workflow tasks |
| Validation | Mapping coverage before replay; justification for discard; re-sign for signature class |
| Authorization | Maker (IntegOps/HR), checker (SR Custodian) |
| State changes & side effects | DLQ state; outbox re-enqueue; audit |
| Failure handling | Failed replay re-enters retry/DLQ; rejected workflow reverts state |
| Dependencies | FR-02 (mapping), FR-03 (relay), workflow engine |
| Test guidance | Replay idempotency; discard audit; maker-checker enforcement; bulk replay; signature-class block |

---

### FR-06 — State-aware reconciliation engine (drift detection)

- **ID:** FR-06
- **Module:** M04-LSR
- **Primary Role(s):** System (scheduled), IntegOps / SR Custodian (on-demand)
- **User Story:** *As an SR Custodian, I want scheduled and on-demand reconciliation comparing the M03 leave ledger against the M12 Service Register — keyed on spell lineage, with correction chains resolved and legitimately pending/quarantined events excluded — so that real missing, duplicate, or divergent entries are detected without a flood of false positives.*

**Description.** A reconciliation run loads the leave ledger and SR entries for a scope (org_unit, date range, employee set, or `PRE_PENSION`) and compares them **by `leave_spell_lineage_id`**, resolving SR correction chains to net-effective before diffing. It **excludes** events that are legitimately `PENDING`, in backoff, `BLOCKED_AWAITING_ORIGINAL`, or `DEAD_LETTERED` from `MISSING_SR` (counting them in `pending_excluded_count` as an informational bucket). It classifies findings: `MISSING_SR`, `DUPLICATE_SR`, `DIVERGENT_FIELD` (after chain resolution), `ORPHAN_CORRECTION`, `UNMAPPED_LEAVE`, and **`CORRECTION_WITHOUT_LINK`** (an SR correction entry with no local `sr_correction_link`).

**Acceptance Criteria.**
1. A run records counts examined on both sides, `pending_excluded_count`, and zero or more findings.
2. **(v2, R6)** MISSING_SR is raised only for SR-affecting leave with no POSTED entry that is **not** currently PENDING/backoff/blocked/dead-lettered.
3. DUPLICATE_SR is raised when >1 net-effective SR entry shares a lineage's dedupe/business key.
4. **(v2, R6)** DIVERGENT_FIELD is computed **after** resolving correction chains and matching on lineage (amended spells are not falsely flagged).
5. `PRE_PENSION` runs can be triggered for an employee/cohort and feed FR-18 certificate.
6. **(v2, R9)** `CORRECTION_WITHOUT_LINK` is raised when M12 holds a correction entry whose local `sr_correction_link` is missing (recoverable from M12-stored lineage).
7. Reconciliation is read-only against M03 and M12 (never mutates SR directly).

**Business Rules.**
- BR-06.1 Scheduled full reconciliation runs at least daily; incremental (since last run) hourly.
- BR-06.2 Severity: MISSING_SR/DUPLICATE_SR/ORPHAN_CORRECTION/CORRECTION_WITHOUT_LINK = HIGH/CRITICAL; DIVERGENT_FIELD = MEDIUM; cosmetic = LOW. Near-retirement MISSING_SR is escalated (tiered SLA, §11.1).
- BR-06.3 Findings are deduplicated across runs (same issue not re-created if still OPEN).
- BR-06.4 **(v2)** Matching is lineage-first; business-key matching is a fallback only when lineage is absent (legacy/migrated).

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_run` | Insert header (+ pending_excluded_count) |
| `reconciliation_finding` | Insert findings (lineage-keyed) |
| `leave_event_outbox` | Read status to exclude pending/quarantined |
| `sr_dead_letter` | Read to exclude dead-lettered |
| `leave_ledger_entries` (M03) | Read |
| `service_register_events` (M12) | Read |
| `sr_correction_link` | Resolve chains; detect missing links |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/reconciliation/runs` | Trigger on-demand/pre-pension |
| `GET /api/v1/lsr/reconciliation/runs/{id}` | Run status + summary (+ pending bucket) |
| `GET /api/v1/lsr/reconciliation/findings` | List findings (paginated) |

**UI Behavior Notes.** "Reconciliation" screen: run history, trigger button (scope picker), findings table with type/severity filters, an informational "pending/quarantined" panel distinct from findings, side-by-side leave/SR diff viewer with chain resolution shown.

**Edge Cases.**
- Leave correctly sitting in DLQ → counted in pending bucket, **not** MISSING_SR.
- Amended spell → matched on lineage; net-effective compared; no false DIVERGENT.
- Leave posted but SR later corrected → match latest net-effective via correction links.
- In-flight events at run time → excluded from MISSING (informational).
- Large cohort → run is chunked and resumable.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationEngine`, `LineageMatcher`, `ChainResolver`, `StateAwareFilter`, `FieldDiffer`, `FindingDeduper` |
| Backend flow | Load scope → index both sides by lineage → exclude pending/quarantined → resolve chains → match → classify → persist findings + pending bucket |
| Data operations | Bulk read M03/M12 + outbox/DLQ state; INSERT run + findings |
| Validation | Scope bounds; pagination on reads |
| Authorization | IntegOps/SR Custodian (trigger); system (scheduled) |
| State changes & side effects | New run + findings; no SR mutation |
| Failure handling | Partial run → status FAILED with checkpoint; resumable |
| Dependencies | M03 read; M12 read; correction links (FR-08); outbox/DLQ state |
| Test guidance | Seeded drift fixtures; pending-excluded; amended-not-divergent; correction-without-link; dedupe across runs; pre-pension scope |

---

### FR-07 — Reconciliation remediation (maker-checker correction)

- **ID:** FR-07
- **Module:** M04-LSR
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker)
- **User Story:** *As an SR Custodian, I want each reconciliation finding to drive a controlled remediation — re-post a missing entry, supersede a duplicate, correct a divergent field, or relink an unlinked correction via an append-only correction — so that drift is closed without ever hard-editing the statutory register.*

**Description.** From a finding, an operator proposes a remediation: **MISSING_SR → re-enqueue/post**; **DUPLICATE_SR → supersede the surplus entry**; **DIVERGENT_FIELD → append an AMENDMENT correction**; **ORPHAN_CORRECTION → link or void**; **CORRECTION_WITHOUT_LINK → reconstruct the link from M12-stored lineage**; **UNMAPPED_LEAVE → create mapping then replay**. All SR-affecting remediations are maker-checker, produce `sr_correction_link` entries where applicable, and transition the finding to APPLIED (or WAIVED with justification).

**Acceptance Criteria.**
1. Each finding type has a defined remediation action set; selecting one creates a workflow.
2. No remediation performs an UPDATE/DELETE on `service_register_events`; corrections are appended.
3. Duplicate remediation marks the surplus entry void via a SUPERSEDE correction linking original→correcting.
4. On checker approval the action applies and the finding becomes APPLIED; rejection returns it to OPEN.
5. WAIVED findings require a justification and are retained for audit.
6. **(v2)** CORRECTION_WITHOUT_LINK remediation reconstructs `sr_correction_link` from the M12-stored `leave_spell_lineage_id` without posting a new SR entry.

**Business Rules.**
- BR-07.1 Remediation reason codes: RECON_FIX (and MIGRATION_FIX for batch-origin findings).
- BR-07.2 The applied correction must reference the finding, the lineage, and the original SR entry.
- BR-07.3 After APPLIED, a verification re-check confirms the finding no longer reproduces.

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_finding` | Update remediation_state |
| `sr_correction_link` | Insert/reconstruct |
| `service_register_events` (M12) | Append correction via port |
| `workflow_instances` | Maker-checker |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/findings/{id}/remediate` | Propose remediation (workflow) |
| `POST /api/v1/lsr/findings/{id}/waive` | Waive with justification |
| `GET /api/v1/lsr/findings/{id}` | Detail |

**UI Behavior Notes.** Finding detail with recommended action, proposed correction preview (before/after), approve/reject (checker), waive with reason.

**Edge Cases.**
- Concurrent remediation of the same finding → optimistic lock; second attempt sees state change.
- Remediation that itself fails posting → returns to OPEN, surfaces error.
- Divergent field actually correct in SR (source wrong) → route fix to M03, waive SR-side.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RemediationService`, `CorrectionPoster`, `LinkReconstructor`, `RemediationWorkflow`, `VerificationRecheck` |
| Backend flow | Propose → workflow → on approve apply correction via M12 port (or relink) → re-check |
| Data operations | INSERT/reconstruct correction_link; append SR entry; UPDATE finding |
| Validation | Action valid for finding type; append-only enforced |
| Authorization | Maker (HR/IntegOps), checker (SR Custodian) |
| State changes & side effects | Finding APPLIED/WAIVED; new SR correction or relink; audit |
| Failure handling | Apply failure → finding OPEN + error; reject → OPEN |
| Dependencies | FR-06 findings; FR-08 correction posting; workflow |
| Test guidance | Per-finding-type remediation; append-only assertion; relink-from-lineage; re-check closes finding |

---

### FR-08 — Correction & reversal posting via the outbox (append-only)

- **ID:** FR-08
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), SR Custodian (governs)
- **User Story:** *As the integration, when a previously posted leave is cancelled or amended, I want to post an append-only correcting or reversing SR entry — through the same outbox/idempotency machinery, ordered after its original, and linked by lineage — so that the Service Register reflects the truth without ever being hard-edited and without leaving unlinked corrections.*

**Description.** A `LEAVE_CANCELLED` event posts a **REVERSAL** SR entry; a `LEAVE_AMENDED` event posts an **AMENDMENT** SR entry with corrected spell/qualifying values. **(v2, R9)** Corrections flow through the **same outbox + dedupe-key path** as primary posts (not a separate non-atomic two-system write). Both create an `sr_correction_link` keyed by `leave_spell_lineage_id`; because the lineage is also persisted on the M12 SR entry, a lost local link is **recoverable** and reconciled (FR-06 `CORRECTION_WITHOUT_LINK`). The original entry remains intact; statutory readers follow the chain to net-effective. **(v2, R5)** A correction is not posting-eligible until its original is `POSTED`.

**Acceptance Criteria.**
1. A cancellation posts a REVERSAL entry linked to the original; the original is never deleted/edited.
2. An amendment posts an AMENDMENT entry capturing corrected values, linked to the original by lineage.
3. If the original SR entry cannot be located after its event is POSTED, the relay raises `ORPHAN_CORRECTION` rather than posting an unlinked correction.
4. The net-effective state of a leave (after chain resolution) is queryable by lineage.
5. Correction posting is idempotent (same lineage-based dedupe-key rule) and ordered after the original.
6. **(v2, R9)** `sr_correction_link` is recoverable from M12-stored lineage; a missing link is detected by reconciliation, not silently lost.

**Business Rules.**
- BR-08.1 Correction type derives from event_type via mapping (CANCELLED→REVERSAL, AMENDED→AMENDMENT).
- BR-08.2 Reason code is set (LEAVE_CANCELLED/LEAVE_AMENDED/RECON_FIX/MIGRATION_FIX).
- BR-08.3 Corrections to qualifying-service must re-emit the qualifying flag (FR-09) so M11 sees the corrected effect.
- BR-08.4 **(v2, R11)** Maker-checker is **tiered**: routine REVERSAL/AMENDMENT corrections auto-post (system principal) but are **flagged and post-audited**; **any** qualifying-service change after pension processing has started for the employee is a **hard maker-checker gate** (blocking — see FR-09 BR-09.3, state table 10.6), not merely an alert.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Source correction event (same machinery) |
| `service_register_events` (M12) | Append correction |
| `sr_correction_link` | Insert link (lineage-keyed) |
| `sr_posting_log` | Append |
| `workflow_instances` | Hard gate (post-pension qualifying change) |

**API References.**

| API | Purpose |
|---|---|
| `POST {M12}/api/v1/sr/events` | Append correction (Idempotency-Key = dedupe_key) |
| `GET /api/v1/lsr/corrections?lineageId={id}` | Resolve chain |

**UI Behavior Notes.** SR entry view shows a correction chain timeline: original → reversal/amendment with reason, lineage, and link to leave event; post-pension qualifying changes show a blocking approval banner.

**Edge Cases.**
- Multiple sequential amendments → a chain of AMENDMENT entries; net-effective = latest.
- Cancellation of an already-amended leave → REVERSAL referencing the latest effective entry.
- Original posted by historical digitisation (FR-11) → correction links to the migrated entry by lineage.
- Local link insert fails after SR append → recoverable from M12 lineage; reconciled as CORRECTION_WITHOUT_LINK.
- Qualifying change after pension start → blocked pending maker-checker.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CorrectionResolver`, `CorrectionPoster (outbox path)`, `ChainResolver`, `PostPensionGate` |
| Backend flow | Locate original by lineage → ensure original POSTED → post correction via outbox/dedupe → link → log; if post-pension qualifying change → route to maker-checker |
| Data operations | Append SR entry; INSERT correction_link; INSERT posting_log |
| Validation | Original exists & POSTED; correction type valid; dedupe key; post-pension gate |
| Authorization | Relay principal (routine); SR Custodian (post-pension hard gate) |
| State changes & side effects | New SR correction; chain updated; qualifying flag re-emitted |
| Failure handling | Original missing → ORPHAN_CORRECTION; lost link → CORRECTION_WITHOUT_LINK recon |
| Dependencies | FR-03, FR-09, M12 port |
| Test guidance | Cancel/amend chain; orphan detection; net-effective; idempotency; lost-link recovery; post-pension hard gate |

---

### FR-09 — Tiered qualifying-service & pension impact flags (LWP / long leave)

- **ID:** FR-09
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), Pension Officer (consume), SR Custodian (govern)
- **User Story:** *As a Pension Officer, I want every leave SR entry to carry a precise, statutorily-cited qualifying-vs-non-qualifying service flag, with rule-straddling spells split correctly, and any post-pension-start change hard-gated — so that qualifying-service and pension computation in M11 are correct, auditable, and protected from silent change.*

**Description.** When posting (FR-03) or correcting (FR-08), the relay attaches the `qualifying_service_rule`, `statutory_rule_ref`, and any apportionment from the mapping to the SR entry. LWP/EOL reduce qualifying service; long-leave spells beyond a threshold are flagged per cited rule. **(v2, R16)** A spell straddling a rule-change effective date is split into per-effective-range SR sub-entries (mapping `straddle_handling=SPLIT_BY_EFFECTIVE`). A `PRE_PENSION` reconciliation (FR-06) plus the completeness certificate (FR-18) verify flags before pension processing. **(v2, R11)** Any qualifying-service change after pension processing has started is a hard maker-checker gate.

**Acceptance Criteria.**
1. Every leave SR entry carries an explicit qualifying flag (QUALIFYING/NON_QUALIFYING/PARTIAL with rule ref) and a `statutory_rule_ref` citation.
2. LWP/EOL spells post as NON_QUALIFYING by default mapping.
3. PARTIAL spells carry the apportionment basis (`qualifying_rule_ref`).
4. Corrections re-emit the corrected qualifying effect.
5. M11 can retrieve, for an employee, the total non-qualifying days derived from SR leave entries (lineage-totalled); the figure reconciles to the leave ledger.
6. **(v2, R16)** A rule-straddling spell produces per-effective-range sub-entries, each cited; their day-sums equal the original spell.
7. **(v2, R11)** A qualifying-service change after pension processing has begun is blocked pending maker-checker approval (not merely alerted).

**Business Rules.**
- BR-09.1 The qualifying rule and citation are sourced only from the published mapping (no ad-hoc computation in M04).
- BR-09.2 Long-leave threshold and apportionment are config/mapping driven, not hardcoded.
- BR-09.3 **(v2, R11)** Any change to qualifying effect after pension processing has started for the employee triggers a **hard maker-checker gate** (blocking control, state table 10.6) — extending the v1 CRITICAL alert into a block; the alert is still emitted to M11.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (M12) | Carries qualifying flag + citation + lineage |
| `sr_event_mapping` | Source of rule, citation, straddle handling |
| `reconciliation_run` (PRE_PENSION) | Verify |
| `workflow_instances` | Post-pension hard gate |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/qualifying-impact` | Non-qualifying days summary for M11 |
| `POST /api/v1/lsr/reconciliation/runs` (PRE_PENSION) | Pre-pension verification |

**UI Behavior Notes.** Pension-impact report per employee: timeline of qualifying vs non-qualifying spells, total non-qualifying days, citations, split sub-entries, drill-down to SR entries; post-pension change shows blocking approval state.

**Edge Cases.**
- Spell straddling a rule-change date → split by effective dates into cited sub-entries.
- Retrospective LWP regularisation → posts AMENDMENT correcting qualifying flag.
- Suspension later treated as duty → correction flips NON_QUALIFYING→QUALIFYING with audit (hard-gated if post-pension-start).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `QualifyingFlagResolver`, `StraddleSplitter`, `QualifyingImpactReport`, `PostPensionGate`, `PensionAlertEmitter` |
| Backend flow | On post/correct → attach flag+citation from mapping → split if straddling → expose summary API → gate post-pension changes |
| Data operations | Write flag/citation on SR entry; aggregate read for summary |
| Validation | Flag present; rule ref for PARTIAL; citation present; sums reconcile; gate enforced |
| Authorization | Pension Officer read; relay write; SR Custodian for gated changes |
| State changes & side effects | SR entry flag; block + alert on post-processing change |
| Failure handling | Missing rule → DLQ MAPPING_MISSING |
| Dependencies | FR-02, FR-03, FR-08, M11 |
| Test guidance | LWP non-qualifying; partial apportionment; straddle split sums; M11 reconciliation total; post-pension hard gate |

---

### FR-10 — Statutory annotations (increment / seniority / probation effect)

- **ID:** FR-10
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), SR Custodian / HR Officer (govern), M06 (consume)
- **User Story:** *As an SR Custodian, I want leave SR entries to carry machine-readable statutory annotations (increment deferral, seniority effect, probation extension) where the leave triggers them, so that downstream seniority and increment processing act on authoritative, cited data rather than manual interpretation.*

**Description.** Certain leave statutorily defers the next increment date, affects seniority, or extends probation. The mapping's `annotation_template` produces a structured annotation on the SR entry (e.g., `{type: INCREMENT_DEFERRAL, days: 90, rule_ref: "CCS(Leave) r.X"}`). Annotations are consumed by M06 and visible in the SR. Annotations follow corrections (an amended leave updates its annotation via a new correction entry, lineage-linked).

**Acceptance Criteria.**
1. Leave types configured with an annotation template produce structured annotations on the SR entry.
2. Annotation includes type, quantum, and statutory rule reference.
3. Amendments/cancellations re-emit corrected annotations via correction entries.
4. M06 can query annotations affecting increment/seniority for an employee.
5. No annotation is produced where the mapping does not configure one (no spurious effects).

**Business Rules.**
- BR-10.1 Annotation quantum derives from mapping rule (e.g., increment deferral = non-qualifying days) — config-driven.
- BR-10.2 Annotations are advisory data to M06; M06 owns the seniority/increment decision.
- BR-10.3 Annotation changes are auditable and chained with corrections by lineage.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (M12) | Carries annotation |
| `sr_event_mapping` | Annotation template + citation |
| `sr_correction_link` | Annotation updates |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/annotations` | Annotations for M06 |

**UI Behavior Notes.** SR entry shows annotation chips (e.g., "Increment deferred 90 days · CCS(Leave) r.X"); progression report lists annotation impacts.

**Edge Cases.**
- Overlapping annotations from consecutive spells → aggregated by M06; M04 emits each per spell.
- Annotation rule changes retroactively → correction re-emits.
- Leave affecting increment but not seniority → only the configured annotation type emitted.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AnnotationRenderer`, `AnnotationApi` |
| Backend flow | On post/correct → render annotation from template → attach to SR entry |
| Data operations | Write annotation; read for M06 |
| Validation | Template schema; quantum computed; rule ref present |
| Authorization | Relay write; M06/HR read |
| State changes & side effects | SR annotation; correction chain |
| Failure handling | Template error → DLQ VALIDATION_REJECT |
| Dependencies | FR-02, FR-08, M06 |
| Test guidance | Annotation rendering; correction re-emit; M06 query |

---

### FR-11 — Historical leave digitisation into SR (provisional / adjudicated)

- **ID:** FR-11
- **Module:** M04-LSR
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker / adjudicator)
- **User Story:** *As an SR Custodian, I want legacy paper/electronic leave history loaded into the Service Register through a validated, provenance-tracked batch pipeline — with low-confidence entries flagged PROVISIONAL, cited, and excluded from pension until I adjudicate them — so that historical leave correctly contributes to qualifying service without risking wrong pensions from uncertain scans.*

**Description.** Legacy leave is staged as `historical_leave_record` rows under a `historical_leave_batch`. Validation resolves `service_no_raw`→`employee_id`, derives a deterministic `leave_spell_lineage_id`, maps legacy codes via FR-02, derives qualifying flags + `statutory_rule_ref`, assigns a `confidence`, and flags rejects. After SR Custodian approval, valid records post to the SR as migrated entries with `MIGRATION` provenance and source `document_id`. **(v2, R15)** Records with `confidence < HIGH` post as `PROVISIONAL` and are **excluded from final pension computation** until `ADJUDICATED_CONFIRMED` by the SR Custodian. Post-load reconciliation confirms parity.

**Acceptance Criteria.**
1. A batch can be created from a source with `documents` provenance and staged records.
2. Validation classifies each record VALID/REJECTED with reason and assigns a `confidence`; counts roll up to the batch.
3. Posting requires SR Custodian batch approval (maker ≠ checker).
4. Posted historical entries are append-only, idempotent (re-running a batch does not duplicate), and carry MIGRATION provenance and lineage.
5. Post-load reconciliation (FR-06) runs automatically and reports parity/findings.
6. **(v2, R15)** A migrated qualifying-service entry requires a non-null `statutory_rule_ref`; `confidence < HIGH` entries are `PROVISIONAL`, excluded from pension totals (FR-09/FR-18) until adjudicated; adjudication (confirm/reject) is recorded and audited.

**Business Rules.**
- BR-11.1 **(v2, R14)** Idempotency for migration uses the deterministic `leave_spell_lineage_id` derived from `(employee_id, leave_type, spell_start, spell_end, batch lineage)`, so a later genuine M03 emission for the same spell dedupes instead of double-posting.
- BR-11.2 Rejected records never post; they remain for correction and re-validation.
- BR-11.3 Migrated entries are flagged distinctly (provenance MIGRATION) so audit can separate migrated vs live-captured history.
- BR-11.4 **(v2, R15)** No PROVISIONAL entry contributes to a PASS pre-pension certificate (FR-18).

**Data Model References.**

| Entity | Use |
|---|---|
| `historical_leave_batch` | Header |
| `historical_leave_record` | Staged records (confidence/adjudication) |
| `documents` (M13) | Provenance |
| `service_register_events` (M12) | Append migrated entries |
| `reconciliation_run` | Post-load parity |
| `workflow_instances` | Batch approval + adjudication |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/historical/batches` | Create batch |
| `POST /api/v1/lsr/historical/batches/{id}/validate` | Validate (assign confidence) |
| `POST /api/v1/lsr/historical/batches/{id}/approve` | Approve (checker) |
| `POST /api/v1/lsr/historical/batches/{id}/post` | Post valid records |
| `POST /api/v1/lsr/historical/records/{id}/adjudicate` | Confirm/reject a PROVISIONAL entry |
| `GET /api/v1/lsr/historical/batches/{id}` | Status |

**UI Behavior Notes.** Batch wizard: import → validation report (valid/reject + confidence) → checker approval → post → reconciliation summary; provisional-entry adjudication queue; editable reject grid; mandatory citation field.

**Edge Cases.**
- Duplicate legacy record across batches → deterministic lineage prevents double posting.
- Employee not found (pre-system retiree) → REJECTED with reason; escalate to M01.
- Partial spell with unclear qualifying status → PROVISIONAL + held for SR Custodian adjudication.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `BatchIngestService`, `RecordValidator`, `ConfidenceScorer`, `MigrationPoster`, `BatchApprovalWorkflow`, `AdjudicationService` |
| Backend flow | Stage → validate (confidence) → approve → post (idempotent, provisional) → reconcile → adjudicate |
| Data operations | INSERT batch/records; append SR entries; INSERT recon run; UPDATE adjudication |
| Validation | Employee resolution; mapping coverage; citation present; date sanity; duplicate detection via lineage |
| Authorization | Maker (HR/IntegOps), checker/adjudicator (SR Custodian) |
| State changes & side effects | Batch status; SR migrated entries (provisional); adjudication; audit |
| Failure handling | Per-record failure → PARTIALLY_POSTED; rejects retained |
| Dependencies | FR-02, FR-06, FR-18, M12, M13 |
| Test guidance | Idempotent re-post; deterministic lineage dedupe vs live event; provisional exclusion; adjudication; provenance; post-load parity |

---

### FR-12 — Replay & backfill tooling (deterministic identity)

- **ID:** FR-12
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps (operate), SR Custodian (approve)
- **User Story:** *As an Integration Operator, I want safe, audited replay and backfill tools (by event, time window, or employee) whose backfilled events derive a deterministic lineage-based identity, so that after a fix or outage I can re-drive events to the SR without creating duplicates — even if a genuine M03 emission for the same spell arrives later.*

**Description.** Replay re-enqueues selected outbox events; backfill generates outbox events for source leave never captured. **(v2, R14)** Backfilled events derive `leave_spell_lineage_id` (and thus the dedupe key) deterministically from the business key, so a later genuine M03 emission dedupes rather than double-posts. Both rely on dedupe so re-posting is safe. Bulk operations are previewed (dry-run count), require SR Custodian approval for SR-writing scope, and are fully audited.

**Acceptance Criteria.**
1. Replay by id/filter/time-window re-enqueues matching events with original (lineage-based) dedupe keys.
2. Backfill detects source leave with no outbox row and generates capture events with deterministic lineage.
3. A dry-run preview shows affected count before execution.
4. Bulk SR-writing replay/backfill requires SR Custodian approval.
5. Replays/backfills are idempotent — re-running produces no duplicate SR entries.
6. **(v2, R14)** A backfilled event and a later genuine M03 event for the same spell resolve to the same lineage/dedupe key and do not double-post.

**Business Rules.**
- BR-12.1 **(v2, R14)** Backfill identity: `leave_spell_lineage_id` is derived deterministically from `(employee_id, leave_type, spell_start, spell_end)` (and batch lineage for migration), matching what M03 would issue; the dedupe key follows.
- BR-12.2 Replay never mutates the original payload (frozen snapshot preserved).
- BR-12.3 Backfill is bounded by an explicit scope and approved before execution; every replayed/backfilled item links to the operation id for audit.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Re-enqueue / create backfill rows |
| `sr_posting_log` | Append |
| `workflow_instances` | Approval for bulk |
| `audit_log` | Append operation |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/replay` (dry_run flag) | Replay by scope |
| `POST /api/v1/lsr/backfill` (dry_run flag) | Backfill missing |

**UI Behavior Notes.** "Replay / Backfill" tool: scope builder, dry-run preview with counts, approval gate, progress tracker.

**Edge Cases.**
- Replay window overlaps in-flight events → dedupe makes overlap safe.
- Backfill for leave that should not affect SR → filtered by `EXCLUDED_NON_SR` disposition.
- Massive backfill → chunked, rate-limited to protect M12, resumable.
- Backfill then genuine M03 emission → same lineage → no duplicate.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReplayService`, `BackfillScanner`, `DeterministicLineageDeriver`, `BulkOpWorkflow`, `OpProgressTracker` |
| Backend flow | Scope → derive identity → dry-run → approve → execute (chunked, idempotent) |
| Data operations | UPDATE/INSERT outbox; INSERT posting_log |
| Validation | Scope bounds; mapping coverage; approval present; deterministic lineage |
| Authorization | IntegOps operate; SR Custodian approve |
| State changes & side effects | Re-enqueued events; SR entries (idempotent); audit |
| Failure handling | Per-item failure → retry/DLQ; resumable on crash |
| Dependencies | FR-03, FR-04, workflow |
| Test guidance | Idempotent replay/backfill; deterministic-lineage dedupe vs live; dry-run accuracy; chunk resume; approval enforcement |

---

### FR-13 — Integration monitoring dashboard & operating model

- **ID:** FR-13
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps, SR Custodian, Auditor (read), Sys Admin
- **User Story:** *As an Integration Operator, I want a real-time dashboard of integration health — queue depth, posting lag, success/error rates, DLQ depth, reaped-in-flight count, reconciliation status, and an explicit on-call/SLA operating model — so that accountable people detect and act on problems before they affect statutory data.*

**Description.** A console summarising: inbound outbox by status (incl. EXCLUDED, BLOCKED_AWAITING_ORIGINAL), posting throughput and P95 lag, error rate by code, DLQ depth and age, **reaped-in-flight count**, recon pending/quarantined bucket, last reconciliation result and open findings by severity, relay paused/running, optional breaker state, and historical batch progress. **(v2, R18)** Configurable SLA thresholds raise notifications and map to a defined IntegOps on-call rota and tiered resolution SLAs (§11.1). Feeds M14.

**Acceptance Criteria.**
1. Dashboard shows live counts for outbox statuses, postings, DLQ, reaped-in-flight, findings, relay/breaker state.
2. Posting lag P95 and success rate are charted over selectable windows.
3. SLA breaches (lag, DLQ depth/age, open HIGH/CRITICAL findings, reaped-in-flight) raise alerts routed per the operating model.
4. All panels are RBAC-scoped (Auditor read-only; org_unit scoping for HR).
5. Metrics are exported to M14 Dashboard & Analytics.
6. **(v2, R18)** Each alert class shows its owner, on-call routing, and resolution-SLA tier (e.g., near-retirement MISSING_SR = expedited).

**Business Rules.**
- BR-13.1 Thresholds are config-driven (`integration_config`).
- BR-13.2 Alerts are deduplicated and escalate by severity per the on-call rota.
- BR-13.3 Dashboard is read-only except acknowledge-alert actions (IntegOps).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_dead_letter`, `reconciliation_run/finding`, `historical_leave_batch`, `relay_partition_lease` | Aggregate reads |
| `integration_config` | Thresholds |
| `notifications` | Alerts |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dashboard/summary` | Aggregated KPIs |
| `GET /api/v1/lsr/dashboard/metrics` | Time-series |
| `POST /api/v1/lsr/alerts/{id}/ack` | Acknowledge |

**UI Behavior Notes.** Cards (queue/lag/DLQ/reaped/breaker), trend charts, findings-by-severity, batch progress, on-call/SLA panel; empty/loading/error states; alert banner with ack.

**Edge Cases.**
- No data yet → empty-state guidance.
- Metric pipeline lag → "as of" timestamp shown.
- Alert storm during outage → grouped alert.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DashboardAggregator`, `MetricsService`, `AlertEvaluator`, `OnCallRouter`, React console |
| Backend flow | Aggregate queries + cached metrics → summary/timeseries APIs → alert routing |
| Data operations | Read-only aggregates; INSERT notifications on breach |
| Validation | Window bounds; RBAC scope |
| Authorization | Role-scoped read; IntegOps ack |
| State changes & side effects | Alert notifications; ack state |
| Failure handling | Stale cache → show "as of"; degrade gracefully |
| Dependencies | All M04 ledgers; M14; notifications |
| Test guidance | Aggregation correctness; threshold breach alert; reaped-in-flight surfacing; on-call routing; RBAC scoping; empty/error states |

---

### FR-14 — Integration audit & evidence pack

- **ID:** FR-14
- **Module:** M04-LSR
- **Primary Role(s):** Auditor (read/export), SR Custodian
- **User Story:** *As an Auditor, I want to retrieve, for any employee or time window, the complete provable chain from leave decision to SR entry (including lineage, corrections, statutory citations, reconciliations, DLQ resolutions, and the pre-pension certificate), so that I can certify statutory completeness and integrity.*

**Description.** Produces an exportable, immutable evidence pack joining, **by `leave_spell_lineage_id`**: source leave event → outbox → posting log → SR entry (and correction chain) → mapping `statutory_rule_ref` citations → any reconciliation/integrity findings/remediations → DLQ history → pre-pension certificate. Supports per-employee, per-batch, and per-time-window queries; export is read-only, watermarked, checksummed, and itself audited.

**Acceptance Criteria.**
1. For a given employee, the full leave→SR chain (incl. corrections, by lineage) is reconstructable and exportable.
2. The pack lists any reconciliation/integrity findings and their resolution state for the scope.
3. DLQ items and their resolutions in scope are included.
4. Export action is audited (who, when, scope).
5. The pack is tamper-evident (hash/checksum) and read-only.
6. **(v2)** The pack includes the mapping `statutory_rule_ref` citations for each posted entry and the latest pre-pension certificate (FR-18) where applicable.

**Business Rules.**
- BR-14.1 Auditor access is read-only across all M04 data, including audit_log.
- BR-14.2 Exports carry a generation timestamp, scope, and integrity checksum.
- BR-14.3 PII minimisation: leave reason detail is excluded unless statutorily required.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_correction_link`, `service_register_events`, `sr_event_mapping`, `reconciliation_finding`, `capture_integrity_finding`, `sr_dead_letter`, `prepension_certificate`, `audit_log` | Read/join by lineage |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/audit/chain?employeeId=` | Reconstruct chain (lineage) |
| `POST /api/v1/lsr/audit/export` | Generate evidence pack |

**UI Behavior Notes.** Audit explorer: timeline visualisation of leave→SR→correction chain by lineage with citations; export button (PDF/CSV/JSON) with checksum.

**Edge Cases.**
- Very long service history → paginated/chunked export.
- Chain with multiple corrections → full lineage rendered.
- Missing link (pre-integration) → flagged as "no integration record (migrated)".

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AuditChainBuilder`, `EvidencePackExporter`, `ChecksumService` |
| Backend flow | Join across ledgers by lineage/employee → render → export + checksum |
| Data operations | Read-only joins; INSERT audit_log for export |
| Validation | Scope bounds; RBAC (Auditor) |
| Authorization | Auditor/SR Custodian read; export audited |
| State changes & side effects | Audit_log export record only |
| Failure handling | Partial data → annotate gaps; never fabricate |
| Dependencies | All M04 ledgers; M12; audit_log; FR-18 |
| Test guidance | Chain reconstruction by lineage; citation inclusion; checksum integrity; export audit; gap annotation |

---

### FR-15 — Stuck-in-flight lease reaper *(new in v2 — R1/AI-2)*

- **ID:** FR-15
- **Module:** M04-LSR
- **Primary Role(s):** System (reaper sweeper), IntegOps (observe/ack)
- **User Story:** *As the integration, I want a sweeper that detects `IN_FLIGHT` events whose processing lease has expired (e.g., the relay crashed mid-post) and returns them to retry-eligible with an alert, so that no event is ever silently stranded between claim and outcome.*

**Description.** When the relay claims an event it sets `claimed_at` and `lease_expires_at = now + lease_timeout`. A scheduled reaper periodically finds `IN_FLIGHT` rows whose `lease_expires_at` has passed, returns them to `FAILED` (retry-eligible), increments `attempt_count`, releases any stale `relay_partition_lease`, appends to `sr_posting_log`, and emits a metric + alert. Because posting is idempotent (lineage dedupe key), a re-post of an event that actually reached M12 returns `DUPLICATE_NOOP` and then marks POSTED.

**Acceptance Criteria.**
1. An `IN_FLIGHT` row with an expired lease is returned to retry-eligible within one reaper interval.
2. Reaping increments `attempt_count`, releases stale partition leases, and never exceeds `max_retries` (then DLQ).
3. A re-post of an event that previously succeeded at M12 returns `DUPLICATE_NOOP` (no duplicate SR entry).
4. Every reap appends a `sr_posting_log` row and raises a metric + alert (`reaped_in_flight_count`).
5. The state transition `IN_FLIGHT → (lease expired) → FAILED` is recorded (state table 10.1).

**Business Rules.**
- BR-15.1 `lease_timeout` and `reaper_interval` are config-driven (`integration_config`).
- BR-15.2 Reaping is safe under idempotency; the reaper never posts to M12 directly — it only re-enqueues.
- BR-15.3 A row reaped repeatedly up to `max_retries` dead-letters with class `UNKNOWN`/`UPSTREAM_DOWN` as classified.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Find expired IN_FLIGHT; reset to FAILED |
| `relay_partition_lease` | Release stale lease |
| `sr_posting_log` | Append reap event |
| `integration_config` | lease_timeout / reaper_interval |
| `notifications` | Reaped alert |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/outbox?status=IN_FLIGHT&leaseExpired=true` | Observe stranded rows |
| (internal) reaper sweep job | Scheduled recovery |

**UI Behavior Notes.** Dashboard card "Reaped in-flight (last 24h)"; alert banner when > 0; drill-down list with lineage and attempt count.

**Edge Cases.**
- Relay alive but slow (lease too short) → lease renewal extends `lease_expires_at`; reaper only acts on truly expired leases.
- Event reaped after genuine M12 success → re-post `DUPLICATE_NOOP` → POSTED (self-heal).
- Mass reap after node crash → bounded by rate-limit; spread by jitter.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `InFlightReaper`, `LeaseRenewer`, `PartitionLeaseManager` |
| Backend flow | Scheduled sweep → select expired IN_FLIGHT → reset FAILED + attempt++ → release partition lease → log + alert |
| Data operations | UPDATE outbox; UPDATE/DELETE partition lease; INSERT posting_log; INSERT notification |
| Validation | Lease expiry check; attempt_count ≤ max_retries |
| Authorization | Reaper service principal |
| State changes & side effects | Outbox FAILED; metric `reaped_in_flight_count`; alert |
| Failure handling | Persistent failure → DLQ after max_retries |
| Dependencies | FR-03 (lease), FR-04 (retry/DLQ), scheduler, config |
| Test guidance | Crash-mid-post recovery; lease renewal vs expiry; idempotent re-post; max_retries→DLQ; partition lease release |

---

### FR-16 — M12 SR write-port bilateral contract & CI conformance test *(new in v2 — R2/AI-3)*

- **ID:** FR-16
- **Module:** M04-LSR
- **Primary Role(s):** Sys Admin / IntegOps (register/run), SR Custodian + M12 owner (sign), Auditor (read)
- **User Story:** *As the integration owner, I want the M12 SR write port governed by a signed bilateral contract with an automated CI conformance test, so that the exactly-once-effect guarantee rests on a verified dependency rather than an assumption — and live posting cannot be enabled until conformance passes.*

**Description.** The M12 write port is specified as a **signed bilateral contract** and exercised by a **CI conformance test** recorded as `port_conformance_run`. The contract mandates: dedupe-key **retention ≥ 7 years** (≥ max replay/backfill horizon); persistence **and indexing** of `dedupe_key`, `correlationId`, and `leave_spell_lineage_id` on each SR entry; **append-only** immutability (UPDATE/DELETE rejected); exact `LSR_SR_CONFLICT` semantics; and a stable `sr_event_id` returned on both first post and duplicate no-op. Live posting is **gated** on the latest conformance run being PASS for the active contract version (data integrity rule 14).

**Acceptance Criteria.**
1. A `port_conformance_run` records `dedupe_retention_days`, index verification, append-only verification, and dedupe-replay verification with a PASS/FAIL result and evidence checksum.
2. A run with `dedupe_retention_days < 2557` (≈7y) results in FAIL.
3. A dedupe-replay test posts the same `dedupe_key` after simulating the retention horizon and verifies the original `sr_event_id` is returned (no second SR row).
4. An append-only test verifies UPDATE/DELETE on an SR entry is rejected.
5. Live posting cannot be enabled unless the latest run for the active contract version is PASS.
6. The contract version and conformance result are surfaced in the audit evidence pack (FR-14) and dashboard (FR-13).

**Business Rules.**
- BR-16.1 The conformance test runs in CI on every contract version change and on a scheduled cadence.
- BR-16.2 A FAIL blocks enabling/continuing live posting; IntegOps is alerted CRITICAL.
- BR-16.3 The contract is signed by both M04 (SR Custodian) and M12 owners; changes follow an amendment workflow.

**Data Model References.**

| Entity | Use |
|---|---|
| `port_conformance_run` | Insert run result |
| `integration_config` | Live-posting enablement gate |
| `audit_log` | Append |
| `notifications` | FAIL alert |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/port/conformance/runs` | Trigger a conformance run (CI/Sys Admin) |
| `GET /api/v1/lsr/port/conformance/runs` | List results (paginated) |
| `GET /api/v1/lsr/port/conformance/runs/{id}` | Result detail + checksum |

**UI Behavior Notes.** "Port Conformance" admin screen: contract version, last run result, retention days, index/append-only/replay checkmarks, evidence checksum, live-posting-gate status badge.

**Edge Cases.**
- M12 dedupe window shorter than replay horizon → FAIL → posting gate stays closed; remediated by M12 before go-live.
- Contract version bump without re-run → gate treats as not-conformant until a PASS run exists.
- Conformance evidence tampered → checksum mismatch flagged.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ConformanceRunner`, `DedupeReplayProbe`, `AppendOnlyProbe`, `IndexVerifier`, `EnablementGate` |
| Backend flow | Run probes against M12 port → record result + checksum → set/clear live-posting gate |
| Data operations | INSERT port_conformance_run; UPDATE config gate |
| Validation | retention ≥ 2557d; indexes present; append-only; dedupe replay |
| Authorization | Sys Admin/CI run; SR Custodian + M12 sign |
| State changes & side effects | Gate open/closed; alert on FAIL |
| Failure handling | FAIL blocks posting; CRITICAL alert |
| Dependencies | M12 port; config; notifications |
| Test guidance | Retention-too-short FAIL; dedupe-replay PASS; append-only reject; gate enforcement; checksum integrity |

---

### FR-17 — Source-ledger ↔ outbox integrity reconciliation *(new in v2 — R7/R17/AI-4/AI-18)*

- **ID:** FR-17
- **Module:** M04-LSR
- **Primary Role(s):** System (scheduled), IntegOps / SR Custodian (review)
- **User Story:** *As an SR Custodian, I want a periodic integrity reconciliation between the M03 leave ledger and the M04 outbox — including capture-signature verification — so that any capture loss or forged event is detected and remediated, regardless of whether the outbox is written in M03's transaction or by polling.*

**Description.** A `SOURCE_OUTBOX_INTEGRITY` reconciliation run compares M03's leave ledger (SR-affecting decisions) against `leave_event_outbox` coverage and verifies each row's `payload_signature`. It raises `capture_integrity_finding`s: `LEDGER_WITHOUT_OUTBOX` (capture loss → backfill via FR-12), `OUTBOX_WITHOUT_LEDGER` (spurious/forged → investigate), and `SIGNATURE_MISMATCH` (tampered/forged payload). This is the compensating control that makes the capture guarantee robust under either capture architecture (decision D-1) and closes the fraudulent-entry vector.

**Acceptance Criteria.**
1. A run compares M03 SR-affecting ledger entries against outbox coverage by lineage and reports findings.
2. `LEDGER_WITHOUT_OUTBOX` is raised for any SR-affecting ledger entry with no outbox row; remediable by deterministic backfill (FR-12).
3. `OUTBOX_WITHOUT_LEDGER` is raised for any outbox row with no matching ledger entry.
4. `SIGNATURE_MISMATCH` is raised for any outbox row failing HMAC verification.
5. Findings carry severity; near-retirement gaps are escalated (tiered SLA).
6. Runs are scheduled (at least daily) and on-demand; read-only against M03.

**Business Rules.**
- BR-17.1 Matching is by `leave_spell_lineage_id` (fallback business key for legacy).
- BR-17.2 `SIGNATURE_MISMATCH` is CRITICAL and blocks posting of the affected event (DLQ `SIGNATURE_INVALID`).
- BR-17.3 Backfill remediation of `LEDGER_WITHOUT_OUTBOX` uses deterministic lineage (FR-12 BR-12.1) so it dedupes with any later genuine emission.

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_run` (SOURCE_OUTBOX_INTEGRITY) | Header |
| `capture_integrity_finding` | Findings |
| `leave_ledger_entries` (M03) | Read |
| `leave_event_outbox` | Coverage + signature verify |
| `audit_log` / `notifications` | Append / alert |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/integrity/runs` | Trigger integrity reconciliation |
| `GET /api/v1/lsr/integrity/findings` | List integrity findings (paginated) |

**UI Behavior Notes.** "Capture Integrity" panel: run history, findings by type/severity, one-click backfill (FR-12) for LEDGER_WITHOUT_OUTBOX, signature-mismatch alerts.

**Edge Cases.**
- Polling-mode deployment (fallback of D-1) → this FR is the primary loss-detection control.
- In-tx deployment → this FR is a defense-in-depth integrity check.
- Forged outbox row (compromised writer) → SIGNATURE_MISMATCH CRITICAL.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IntegrityReconEngine`, `SignatureVerifier`, `LedgerOutboxMatcher`, `BackfillTrigger` |
| Backend flow | Load M03 ledger + outbox by lineage → diff coverage → verify signatures → persist findings → alert |
| Data operations | Bulk read M03 + outbox; INSERT run + integrity findings |
| Validation | Lineage match; HMAC verify; scope bounds |
| Authorization | System (scheduled); IntegOps/SR Custodian (trigger/review) |
| State changes & side effects | New findings; backfill enqueue; CRITICAL alert on signature mismatch |
| Failure handling | Partial run → resumable checkpoint |
| Dependencies | M03 ledger read; FR-01 signature; FR-12 backfill |
| Test guidance | Ledger-without-outbox→backfill; outbox-without-ledger; signature-mismatch CRITICAL; polling-mode loss detection |

---

### FR-18 — Pre-pension completeness certificate *(new in v2 — AI-21)*

- **ID:** FR-18
- **Module:** M04-LSR
- **Primary Role(s):** SR Custodian (sign), Pension Officer / M11 (consume), Auditor (read)
- **User Story:** *As a Pension Officer, I want a signed, checksummed certificate asserting that an employee's leave→SR record is complete — zero open HIGH/CRITICAL findings, full lineage, no remaining provisional entries — so that M11 can gate pension processing on a provable contract rather than a dashboard status.*

**Description.** After a `PRE_PENSION` reconciliation (FR-06) for an employee/cohort, M04 produces a `prepension_certificate` asserting: zero open HIGH/CRITICAL reconciliation **and** integrity findings, complete lineage (all spells resolvable end-to-end), zero remaining `PROVISIONAL` migrated entries, and the net total non-qualifying days. A PASS certificate is **signed by the SR Custodian** and carries a checksum over the certified evidence bundle. M11 consumes it as a hard gate input; a FAIL certificate lists blocking items.

**Acceptance Criteria.**
1. A certificate is generated only from a completed PRE_PENSION run for the scope.
2. PASS requires `open_high_critical_findings = 0`, `lineage_complete = true`, and `provisional_entries_remaining = 0`; otherwise FAIL with the blocking list.
3. A PASS certificate is signed by an SR Custodian (maker-checker: generated by system/HR maker, signed by Custodian) and checksummed.
4. The certificate records `total_non_qualifying_days` reconciled to the leave ledger.
5. M11 can retrieve the latest certificate for an employee; consumption is timestamped (`consumed_by_m11_at`).
6. The certificate is append-only, tamper-evident, and included in the audit evidence pack (FR-14).

**Business Rules.**
- BR-18.1 No PROVISIONAL migrated entry may be present for a PASS (FR-11 BR-11.4).
- BR-18.2 A certificate is invalidated (superseded by a new run) if any new HIGH/CRITICAL finding arises before pension processing completes.
- BR-18.3 Any qualifying-service change after a certificate is consumed triggers the FR-09 post-pension hard gate and certificate re-issue.

**Data Model References.**

| Entity | Use |
|---|---|
| `prepension_certificate` | Insert (append-only) |
| `reconciliation_run` (PRE_PENSION) | Source |
| `reconciliation_finding` / `capture_integrity_finding` | Gate inputs |
| `historical_leave_record` | Provisional check |
| `workflow_instances` | Custodian sign |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/prepension/certificates` | Generate (from a PRE_PENSION run) |
| `POST /api/v1/lsr/prepension/certificates/{id}/sign` | SR Custodian sign |
| `GET /api/v1/lsr/prepension/certificates?employeeId=` | M11 retrieves latest |

**UI Behavior Notes.** "Pre-Pension Certificate" screen: per-employee status (PASS/FAIL), blocking-item list, sign action (Custodian), checksum, M11 consumption timestamp; export to evidence pack.

**Edge Cases.**
- Open HIGH finding → FAIL certificate with remediation links (FR-07).
- Remaining provisional entry → FAIL until adjudicated (FR-11).
- New finding after sign but before pension completion → certificate invalidated, re-run required.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CertificateGenerator`, `GateEvaluator`, `ChecksumService`, `CertificateSignWorkflow` |
| Backend flow | From PRE_PENSION run → evaluate gates → compute totals → checksum → Custodian sign → expose to M11 |
| Data operations | INSERT prepension_certificate; read findings/provisional |
| Validation | Gate criteria; totals reconcile; signer authority |
| Authorization | System/HR generate; SR Custodian sign; M11/Pension read |
| State changes & side effects | New certificate; consumption timestamp; audit |
| Failure handling | FAIL lists blockers; invalidation on new finding |
| Dependencies | FR-06, FR-09, FR-11, FR-17, M11 |
| Test guidance | PASS/FAIL gate logic; provisional-blocks-pass; checksum integrity; invalidation on new finding; M11 consumption |

---

## Section 7 — UI Requirements

The M04 surface is an **operational console** (not an end-user app). Screens (React + Tailwind + shadcn/ui, WCAG 2.1 AA, dark-mode, responsive, full empty/loading/error/permission states):

1. **Integration Dashboard** (FR-13) — KPI cards (outbox by status incl. EXCLUDED/BLOCKED, posting P95 lag, success rate, DLQ depth/age, **reaped-in-flight count**, recon pending/quarantined bucket, relay paused/running, optional breaker state), trend charts, findings-by-severity, batch progress, **on-call/SLA panel**, alert banner with acknowledge.
2. **Posting Log** (FR-03) — searchable table (lineage_id, correlation_id, employee, outcome, latency, SR link), filters, detail drawer; partition/lease in-order progress view.
3. **DLQ Triage Board** (FR-05) — Kanban (Open/In review/Resolved), detail drawer with leave-vs-SR snapshot and error history, replay/discard actions, checker approval inbox; signature-class items flagged not operator-editable.
4. **Reconciliation** (FR-06/07) — run history, trigger with scope picker, findings table with side-by-side diff viewer (chain-resolved), **pending/quarantined informational panel**, remediation proposal preview, approve/reject/waive.
5. **Mapping Catalog** (FR-02) — versioned list with disposition (POST_SR/EXCLUDED_NON_SR), effective-date, status, **statutory citation**, version diff, predicate builder, straddle-handling selector, publish gate.
6. **Historical Digitisation** (FR-11) — batch wizard (import → validation report incl. confidence → approval → post → reconciliation summary), **provisional-entry adjudication queue**, editable reject grid, mandatory citation field.
7. **Replay / Backfill** (FR-12) — scope builder, dry-run preview, approval gate, progress tracker.
8. **Audit Explorer** (FR-14) — leave→SR→correction chain timeline by lineage with citations, export with checksum.
9. **Port Conformance** (FR-16) — contract version, last run result, retention days, index/append-only/replay checks, evidence checksum, live-posting-gate badge.
10. **Capture Integrity** (FR-17) — integrity run history, findings by type/severity, one-click backfill, signature-mismatch alerts.
11. **Pre-Pension Certificate** (FR-18) — per-employee PASS/FAIL, blocking-item list, sign action, checksum, M11 consumption status.
12. **Configuration** (FR-04/13/15) — retry/backoff/**lease/reaper**/SLA threshold settings, `breaker_enabled` toggle, relay pause/resume (Sys Admin / IntegOps).

**Cross-cutting UI rules:** all destructive/SR-writing actions show a confirm modal and route to maker-checker; every list is paginated (max 100); all timestamps display `DD-MMM-YYYY HH:mm` in user TZ; lineage_id, correlation_id and sr_event_id are click-to-copy; toasts for async actions; no skeleton-only screens (real data, fields, states).

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/lsr`; M12 calls to `{M12_BASE}/api/v1/sr`.
- Auth: Bearer JWT (OIDC); RBAC + org_unit row scoping.
- Idempotency: SR writes carry `Idempotency-Key` = the **mapping-version-independent `dedupe_key`**.
- Pagination: `?page=&limit=` (max 100) or cursor; responses include `pageInfo`.
- Canonical error envelope (Shared Foundation): `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.

### 8.2 Error-code catalog

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid request (inherited) |
| AUTH_REQUIRED | 401 | Missing/invalid token (inherited) |
| FORBIDDEN | 403 | RBAC / maker-checker / SoD violation (inherited) |
| NOT_FOUND | 404 | Entity not found (inherited) |
| CONFLICT | 409 | State/optimistic-lock conflict (inherited) |
| RATE_LIMITED | 429 | Throttled / back-pressure (inherited) |
| INTERNAL_ERROR | 500 | Unexpected (inherited) |
| UPSTREAM_UNAVAILABLE | 503 | M12 SR port unreachable (inherited; retryable) |
| LSR_MAPPING_NOT_FOUND | 422 | No published POST_SR mapping for an SR-affecting (leave_type, event_type) |
| LSR_MAPPING_OVERLAP | 409 | Overlapping effective ranges at publish |
| LSR_SR_CONFLICT | 409 | M12 rejected due to conflicting SR state |
| LSR_ORPHAN_CORRECTION | 422 | Correction has no locatable original entry |
| LSR_IDEMPOTENT_DUPLICATE | 200 | Duplicate detected; original sr_event_id returned (no-op) |
| LSR_DLQ_REPLAY_BLOCKED | 409 | Replay blocked (e.g., mapping still missing / signature unfixed) |
| LSR_BATCH_VALIDATION_FAILED | 422 | Historical batch has rejected records blocking post |
| LSR_CIRCUIT_OPEN | 503 | Posting paused by optional circuit breaker |
| LSR_RELAY_PAUSED | 503 | **(v2)** Posting paused by manual relay-pause override |
| LSR_SCOPE_TOO_LARGE | 400 | Replay/backfill/recon scope exceeds bound |
| LSR_LINEAGE_MISSING | 422 | **(v2)** Captured event lacks `leave_spell_lineage_id` |
| LSR_SIGNATURE_INVALID | 403 | **(v2)** Capture payload HMAC verification failed |
| LSR_BLOCKED_AWAITING_ORIGINAL | 409 | **(v2)** Correction not posting-eligible until original POSTED |
| LSR_PORT_NOT_CONFORMANT | 409 | **(v2)** Live posting gate closed: no passing M12 conformance run |
| LSR_PROVISIONAL_ENTRY | 409 | **(v2)** Operation blocked by an unadjudicated provisional migrated entry |
| LSR_CERTIFICATE_FAILED | 422 | **(v2)** Pre-pension certificate FAIL (blocking items remain) |

### 8.3 JSON examples

**Post SR entry (relay → M12) — mapping-version-independent dedupe key:**
```http
POST /api/v1/sr/events
Idempotency-Key: k:linaa:LEAVE_APPROVED:1
Authorization: Bearer <relay-jwt>
```
```json
{
  "employeeId": "emp-12",
  "leaveSpellLineageId": "lin-aa",
  "eventSequence": 1,
  "srEntryType": "EARNED_LEAVE_AVAILED",
  "sourceModule": "M04-LSR",
  "correlationId": "c0de-aa",
  "spell": { "start": "2026-04-01", "end": "2026-04-10", "days": 10.0 },
  "qualifyingServiceRule": "QUALIFYING",
  "statutoryRuleRef": "CCS (Leave) Rules 1972 r.26",
  "annotations": [],
  "provenance": { "type": "LIVE_CAPTURE", "mappingVersion": 3 }
}
```
**Success:**
```json
{ "srEventId": "sr-77", "status": "CREATED", "requestId": "req-9001" }
```
**Idempotent duplicate (incl. after remap — key unchanged):**
```json
{ "srEventId": "sr-77", "status": "DUPLICATE_NOOP", "code": "LSR_IDEMPOTENT_DUPLICATE", "requestId": "req-9002" }
```

**Correction not yet eligible (ordering guard):**
```json
{ "error": { "code": "LSR_BLOCKED_AWAITING_ORIGINAL", "message": "Correction for lineage lin-aa seq 2 held until original (seq 1) is POSTED", "field": "eventSequence" }, "requestId": "req-9050" }
```

**Port conformance FAIL (retention too short):**
```json
{ "conformanceId": "pc-02", "contractVersion": "1.0", "dedupeRetentionDays": 365, "result": "FAIL", "blocking": "retention < 2557d", "requestId": "req-9075" }
```

**Trigger pre-pension reconciliation:**
```json
POST /api/v1/lsr/reconciliation/runs
{ "runType": "PRE_PENSION", "scope": { "employeeIds": ["emp-12"] } }
```
```json
{ "runId": "r-03", "status": "RUNNING", "requestId": "req-9100" }
```

**Reconciliation finding (MISSING_SR — pending excluded):**
```json
{
  "findingId": "f-01", "runId": "r-01", "employeeId": "emp-12",
  "leaveSpellLineageId": "lin-12",
  "findingType": "MISSING_SR", "severity": "HIGH",
  "leaveSnapshot": { "leaveType": "EL", "start": "2026-04-01", "end": "2026-04-10" },
  "srSnapshot": null, "remediationState": "OPEN",
  "note": "Not currently PENDING/backoff/DLQ", "requestId": "req-9200"
}
```

**Pre-pension certificate (PASS):**
```json
{
  "certificateId": "cert-01", "employeeId": "emp-12", "runId": "r-03",
  "result": "PASS", "openHighCriticalFindings": 0, "lineageComplete": true,
  "provisionalEntriesRemaining": 0, "totalNonQualifyingDays": 121.0,
  "checksum": "sha256:9f2c…", "signedBy": "custodian-7", "requestId": "req-9400"
}
```

**Mapping overlap error:**
```json
{ "error": { "code": "LSR_MAPPING_OVERLAP", "message": "Effective range overlaps published version 3 for (EL, APPROVED)", "field": "effective_from" }, "requestId": "req-9300" }
```

### 8.4 Integration points

| Direction | Counterparty | Contract |
|---|---|---|
| Inbound | M03 | Signed transactional outbox of leave events (in-DB); issues `leave_spell_lineage_id` |
| Outbound | M12 | **Contracted** idempotent SR write port (FR-16) + SR read API |
| Outbound | M11 | Qualifying-impact summary API / SR flags + **pre-pension certificate (FR-18)** |
| Outbound | M06 | Annotations API |
| Outbound | M14 | Metrics/KPI export |
| Bi-dir | M13 | Document provenance reference |
| Outbound | Notifications | Alerts/SLA breach, reaped-in-flight, conformance FAIL, signature mismatch |

### 8.5 M12 SR write-port bilateral contract (FR-16 summary)

| Clause | Requirement |
|---|---|
| Dedupe key | Accept `Idempotency-Key` = `dedupe_key`; persist + **index** it on the SR entry |
| Retention | Dedupe-key retention ≥ **2557 days (7y)** ≥ max replay/backfill horizon |
| Identity persistence | Persist + index `correlationId` and `leave_spell_lineage_id` on each SR entry |
| Immutability | Append-only; UPDATE/DELETE rejected |
| Duplicate semantics | Return original `sr_event_id` + `DUPLICATE_NOOP` on repeat key |
| Conflict semantics | `LSR_SR_CONFLICT` (409) on genuine state conflict |
| Conformance | CI test (`port_conformance_run`) must PASS before live-posting gate opens |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Relay P95 posting lag (approval→SR confirm) ≤ 5 min; management API P95 < 500ms; reconciliation of 100k records < 30 min; reaper interval ≤ 2 min. |
| Throughput/Scalability **(v2, R12)** | Right-sized to realistic government volume: **low thousands of leave decisions/day** sustained, with **bursts only during migration/backfill**. Horizontal relay workers use **per-partition (employee/lineage) in-order claiming**. A modest burst ceiling + **rate-limit/back-pressure** protects M12 during migration. The v1 50/s-sustained / 500/s-burst figures are **removed** as fantasy-scale. |
| Reliability **(v2, R10/R11)** | **Exactly-once *effect*** = at-least-once delivery + idempotent dedupe, **conditional on the M12 port contract (FR-16)**; no event loss (durable outbox + lease reaper FR-15 + source↔outbox integrity FR-17); RPO ≤ 15 min, RTO ≤ 4h; 99.9% uptime. |
| Consistency | Eventual consistency between leave ledger and SR with bounded lag; state-aware reconciliation closes residual drift without false positives. |
| Availability/Resilience **(v2, R13)** | Core: bounded retry + DLQ + **manual relay-pause**. Circuit breaker is an **optional Phase-2 enhancement** (`breaker_enabled`, default off). |
| Ordering **(v2, R5)** | Per-partition in-order delivery; a correction is never posted before its original is POSTED. |
| Security **(v2, R17)** | OIDC/SSO+MFA; RBAC + org_unit scoping; relay principal limited to append-only SR write; **HMAC-signed capture payloads** with constrained outbox writers; TLS 1.2+; encryption at rest; OWASP ASVS. |
| Privacy | DPDP Act 2023 alignment; PII minimisation (no medical/leave-reason detail in M04 payloads); audit retains only SR-relevant fields. |
| Auditability | Every state change in audit_log; append-only ledgers; statutory citations on every posted entry; tamper-evident evidence packs + certificates. |
| Observability | Structured logs with requestId + correlation_id + **lineage_id**; metrics (lag, throughput, DLQ depth, **reaped-in-flight**, recon pending bucket, error rate, breaker/pause state, conformance result). |
| Maintainability | Mapping & config changes without redeploy; versioned mappings; pinned mapping version per event. |
| Accessibility | Console WCAG 2.1 AA; keyboard/focus; dark mode. |
| Data retention | Ledgers retained per statutory schedule; **dedupe-key + DLQ history retained ≥ 7 years** (aligned to FR-16 retention and max replay horizon). |

---

## Section 10 — Workflow & State Diagrams (state tables)

### 10.1 Outbox event lifecycle *(v2: lease/reaper, blocked-awaiting-original, excluded)*

| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | SR-affecting leave approved/cancelled/amended in M03 | PENDING | Signed outbox row written in tx (FR-01) |
| (none) | Non-SR leave (EXCLUDED_NON_SR disposition) | EXCLUDED | Deliberate no-op; never DLQ'd (R8) |
| (none) | Correction whose original not yet POSTED | BLOCKED_AWAITING_ORIGINAL | Ordering guard (R5) |
| BLOCKED_AWAITING_ORIGINAL | Original reaches POSTED | PENDING | Now posting-eligible |
| PENDING | Relay claims (per-partition, in-order) | IN_FLIGHT | Partition lease; `claimed_at`/`lease_expires_at` set; mapping pinned |
| IN_FLIGHT | M12 success | POSTED | sr_event_id stored; posting_log SUCCESS |
| IN_FLIGHT | Retryable failure | FAILED | attempt++; available_at=backoff |
| IN_FLIGHT | **Lease expired (reaper, FR-15)** | FAILED | attempt++; partition lease released; alert (R1) |
| FAILED | available_at reached | IN_FLIGHT | Re-claim |
| IN_FLIGHT | Permanent failure | DEAD_LETTERED | DLQ row created |
| FAILED | attempt_count > max_retries | DEAD_LETTERED | DLQ row created |
| DEAD_LETTERED | Replay (resolved) | PENDING | Same (lineage) dedupe key (FR-05/12) |

### 10.2 DLQ item lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Assign | IN_REVIEW | Operator assigned |
| IN_REVIEW | Replay (approved) | RESOLVED_REPLAYED | Mapping coverage / re-sign present; closed after POSTED |
| IN_REVIEW | Discard (approved) | RESOLVED_DISCARDED | Justification required |
| IN_REVIEW | Checker rejects | IN_REVIEW | Rejection note |

### 10.3 Reconciliation finding lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Propose remediation | REMEDIATION_PROPOSED | Maker action → workflow |
| REMEDIATION_PROPOSED | Checker approves | APPROVED | Maker ≠ checker |
| APPROVED | Apply succeeds + re-check clean | APPLIED | Correction appended / link reconstructed |
| APPROVED | Apply fails | OPEN | Error surfaced |
| OPEN/PROPOSED | Waive | WAIVED | Justification required |

### 10.4 Historical batch lifecycle *(v2: provisional adjudication)*

| Current | Event | Next | Guard |
|---|---|---|---|
| STAGED | Validate | VALIDATED | Records classified + confidence assigned |
| VALIDATED | Checker approves | APPROVED | Maker ≠ checker |
| APPROVED | Post (all valid succeed) | POSTED | Idempotent (deterministic lineage); low-confidence → PROVISIONAL |
| APPROVED | Post (some fail) | PARTIALLY_POSTED | Failed retained |
| STAGED/VALIDATED | Reject batch | REJECTED | Justification |
| (record) PROVISIONAL | Custodian adjudicates | ADJUDICATED_CONFIRMED / ADJUDICATED_REJECTED | Citation present; pension-eligible only when confirmed |

### 10.5 Circuit-breaker state *(v2: OPTIONAL / Phase-2, off by default)*

| Current | Event | Next |
|---|---|---|
| (disabled) | `breaker_enabled=false` | n/a — core controls = retry + DLQ + manual pause |
| CLOSED | Consecutive failures ≥ threshold | OPEN (alert) |
| OPEN | Cooldown elapsed | HALF_OPEN |
| HALF_OPEN | Probe succeeds | CLOSED |
| HALF_OPEN | Probe fails | OPEN |

### 10.6 Post-pension qualifying-change hard gate *(new in v2 — R11)*

| Current | Event | Next | Guard |
|---|---|---|---|
| Qualifying change requested, pension not started | Auto-post correction (flagged, post-audited) | POSTED | Routine tier (FR-08 BR-08.4) |
| Qualifying change requested, **pension processing started** | Route to maker-checker | GATE_PENDING | Hard block; CRITICAL alert to M11 |
| GATE_PENDING | SR Custodian approves | APPLIED | Maker ≠ checker; certificate re-issued (FR-18) |
| GATE_PENDING | Rejected | BLOCKED | Change not applied; logged |

### 10.7 Port conformance gate *(new in v2 — R2)*

| Current | Event | Next |
|---|---|---|
| GATE_CLOSED | Conformance run PASS (retention ≥ 7y) | GATE_OPEN (live posting enabled) |
| GATE_OPEN | New contract version without re-run | GATE_CLOSED |
| GATE_OPEN/CLOSED | Conformance run FAIL | GATE_CLOSED (CRITICAL alert) |

---

## Section 11 — Notifications

### 11.1 IntegOps operating model & tiered resolution SLAs *(new in v2 — R18/AI-20)*

Accountability for stranded statutory events is explicit:

- **On-call rota:** IntegOps maintains a 24×5 on-call rota (business-day) with a named primary and escalation secondary; SR Custodian is the statutory escalation point.
- **Ownership:** DLQ aging, reaped-in-flight alerts, port-conformance FAIL, signature-mismatch, and reconciliation HIGH/CRITICAL findings each have a named owner role and escalation path.
- **Tiered resolution SLAs:**

| Condition | Tier | Resolution SLA |
|---|---|---|
| `MISSING_SR` / capture loss for a **near-retirement** employee | Expedited | Within **4 business hours** |
| Open HIGH/CRITICAL reconciliation/integrity finding (general) | High | Within **2 business days** |
| DLQ item (general) | Standard | ≥ 99% within **2 business days** |
| Reaped-in-flight alert > 0 | Investigate | Acknowledge within **1 hour**; root-cause within 1 business day |
| Port conformance FAIL | Critical | Block live posting; remediate before any go-live/continuation |
| `SIGNATURE_MISMATCH` (possible forgery) | Critical | Immediate investigation; affected event quarantined |

### 11.2 Notification catalog

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| Posting SLA breach | P95 lag > threshold | IntegOps | Dashboard alert + email |
| **Reaped-in-flight detected** | Reaper recovers stranded IN_FLIGHT | IntegOps | Dashboard + email |
| Relay paused/resumed | Manual override | IntegOps, Sys Admin | Dashboard + email |
| Circuit breaker OPEN (if enabled) | Breaker trips | IntegOps, Sys Admin | Email + push |
| DLQ item created | Event dead-lettered | IntegOps | Dashboard + email (batched) |
| DLQ depth threshold | Depth > config | IntegOps, SR Custodian | Email |
| HIGH/CRITICAL finding | Reconciliation finding | SR Custodian, IntegOps | Email |
| **Near-retirement MISSING_SR** | Expedited-tier finding | IntegOps (primary), SR Custodian | Email + push |
| **Capture signature mismatch** | FR-17 SIGNATURE_MISMATCH | SR Custodian, IntegOps, Security | CRITICAL email + push |
| **Port conformance FAIL** | FR-16 run FAIL | IntegOps, Sys Admin, SR Custodian | CRITICAL email + push |
| Pre-pension finding open | PRE_PENSION run finds drift | Pension Officer, SR Custodian | Email |
| **Pre-pension certificate FAIL** | FR-18 blocking items | Pension Officer, SR Custodian | Email |
| Remediation needs approval | Maker submitted | SR Custodian | Workflow inbox + email |
| Batch approval / adjudication needed | Historical batch validated / provisional entry | SR Custodian | Workflow inbox |
| **Qualifying change after pension start** | FR-09 hard gate | M11 / Pension Officer, SR Custodian | CRITICAL email + push (blocking) |
| Mapping published | Catalog version published | IntegOps, Auditor | In-app |

All notifications write to the shared `notifications` ledger; deduplicated and severity-escalated per the operating model.

---

## Section 12 — Reporting & Analytics

| Report | Description | Consumer |
|---|---|---|
| Integration health KPI | Lag, throughput, success rate, DLQ depth, **reaped-in-flight**, pause/breaker state | IntegOps, M14 |
| Reconciliation summary | Findings by type/severity/age; closure rate; pending/quarantined bucket | SR Custodian, Auditor |
| **Capture integrity report** | LEDGER_WITHOUT_OUTBOX / OUTBOX_WITHOUT_LEDGER / SIGNATURE_MISMATCH by severity | SR Custodian, Security, Auditor |
| Qualifying-service impact | Per-employee non-qualifying days from SR leave entries (lineage-totalled, cited) | Pension Officer, M11 |
| Correction ledger report | All reversals/amendments with reasons, lineage, citations | Auditor, SR Custodian |
| Historical digitisation progress | Batches posted/partial/rejected; **provisional vs adjudicated**; coverage % | HR, SR Custodian |
| DLQ aging & resolution SLA | Open/resolved DLQ by age and class against tiered SLA | IntegOps |
| **Port conformance history** | Conformance runs, retention days, PASS/FAIL, gate status | Sys Admin, Auditor |
| **Pre-pension certificate register** | PASS/FAIL certificates, signers, M11 consumption | Pension Officer, SR Custodian, Auditor |
| Audit evidence pack | Full leave→SR chain export with checksum + citations | Auditor |
| Mapping change history | Version timeline, effective ranges, citations | Auditor, Sys Admin |

All reports respect RBAC + org_unit scoping; exportable (CSV/PDF/JSON); feed M14 for cross-module analytics.

---

## Section 13 — Migration & Launch

### 13.1 Migration

1. **M12 port contract first (R2):** sign the FR-16 bilateral contract and run the CI conformance test to PASS (retention ≥ 7y) — **before any live posting is enabled**.
2. **Mapping seed:** author and publish the initial `sr_event_mapping` catalog covering all live leave types + legacy codes, with **dispositions and mandatory statutory citations** (FR-02), reviewed by SR Custodian.
3. **Config seed:** load `integration_config` (max_retries, backoff, **lease_timeout, reaper_interval**, rate-limit, SLA, `breaker_enabled=false`).
4. **Capture integrity baseline (R7/R17):** run FR-17 source↔outbox integrity reconciliation; backfill any gaps with deterministic lineage.
5. **Backfill live gap:** for leave approved before integration go-live but not yet in SR, run audited backfill (FR-12) with deterministic lineage.
6. **Historical digitisation:** ingest legacy leave via batches (FR-11) prioritised by near-retirement cohorts; low-confidence entries post PROVISIONAL and are adjudicated.
7. **Baseline reconciliation:** run full state-aware reconciliation; resolve all HIGH/CRITICAL findings to zero before declaring SR complete for a cohort; issue pre-pension certificates (FR-18) for retiring cohorts.

### 13.2 Launch / rollout

- **Phase 0 (shadow):** relay posts to a staging SR; reconciliation compares; no production writes; conformance test green.
- **Phase 1 (pilot org_unit):** enable live posting for one office **only after R1–R8 mitigations are in place** (reaper, pinned mapping version, dedupe-key off mapping_version, partitioned in-order + ordering guard, state-aware recon, EXCLUDED disposition, capture integrity, M12 contract); monitor lag/DLQ/reaped/findings for 2 weeks.
- **Phase 2 (cohort rollout):** expand by org_unit; backfill + historical digitisation per cohort.
- **Phase 3 (steady state):** all leave events post live; scheduled reconciliation + integrity recon continuous; pre-pension certificate a mandatory M11 gate.

### 13.3 Cutover acceptance gates

- M12 port conformance run PASS (retention ≥ 7y); live-posting gate open.
- Zero unresolved HIGH/CRITICAL reconciliation **and** capture-integrity findings for the cohort.
- DLQ empty or all items resolved; zero stranded IN_FLIGHT (reaper clean).
- Mapping catalog fully covers live + legacy leave types with dispositions + citations.
- Evidence pack + pre-pension certificate reproducible for sampled employees.

### 13.4 Rollback

- Posting relay can be paused (manual relay-pause; optional breaker) without data loss (outbox durable); resume re-drains. No SR rollback (append-only) — errors corrected via FR-08 corrections, never deletion.

### 13.5 Operating-model readiness *(new in v2 — R18)*

- IntegOps on-call rota staffed and documented; escalation paths to SR Custodian and Security defined.
- Tiered resolution SLAs (§11.1) configured as dashboard thresholds and alert routes.
- Runbooks for reaped-in-flight, conformance FAIL, signature mismatch, and near-retirement MISSING_SR.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state tables → tests)

| FR | Primary entities | Key APIs | State table | Test focus |
|---|---|---|---|---|
| FR-01 | leave_event_outbox | outbox write, GET outbox | 10.1 | Atomic signed capture, lineage, EXCLUDED, idempotent emission |
| FR-02 | sr_event_mapping | mappings CRUD/publish | — | Overlap, disposition, citation, straddle, resolve-by-date |
| FR-03 | outbox, partition_lease, posting_log, SR | POST sr/events, GET postings | 10.1 | Exactly-once effect, in-order, remap-no-dup, ordering guard |
| FR-04 | outbox, dead_letter, config | GET dlq, PUT config, relay pause | 10.1, 10.5 | Backoff, classify, manual pause, optional breaker, exhaustion |
| FR-05 | dead_letter, outbox, workflow | dlq assign/replay/discard | 10.2 | Replay idempotency, maker-checker, signature-class block |
| FR-06 | reconciliation_run/finding | recon runs/findings | 10.3 | Pending-excluded, lineage match, correction-without-link |
| FR-07 | finding, correction_link, SR | findings remediate/waive | 10.3 | Append-only fix, relink-from-lineage, re-check |
| FR-08 | correction_link, outbox, SR | POST sr/events, corrections | 10.6 | Reversal/amend chain, orphan, lost-link recovery, post-pension gate |
| FR-09 | SR, mapping, recon, workflow | qualifying-impact, PRE_PENSION | 10.6 | LWP non-qual, partial, straddle split, post-pension hard gate |
| FR-10 | SR, mapping, correction_link | annotations | — | Annotation render + citation, re-emit |
| FR-11 | historical_batch/record, SR, documents | batches validate/approve/post/adjudicate | 10.4 | Deterministic lineage dedupe, provisional, adjudication |
| FR-12 | outbox, posting_log, workflow | replay, backfill | 10.1 | Deterministic-lineage idempotent backfill, dry-run |
| FR-13 | all ledgers, partition_lease, config, notifications | dashboard summary/metrics, ack | 10.5 | Aggregation, reaped surfacing, on-call routing, RBAC |
| FR-14 | all ledgers, certificate, audit_log | audit chain/export | — | Chain by lineage, citations, certificate, checksum |
| FR-15 | outbox, partition_lease, posting_log | GET outbox (lease expired) | 10.1 | Crash recovery, lease renew vs expire, idempotent re-post |
| FR-16 | port_conformance_run, config | port conformance runs | 10.7 | Retention FAIL, dedupe-replay, append-only, gate enforcement |
| FR-17 | reconciliation_run, capture_integrity_finding | integrity runs/findings | — | Ledger-without-outbox, signature mismatch, polling-mode loss |
| FR-18 | prepension_certificate, recon, findings | certificates generate/sign | 10.6 | PASS/FAIL gates, provisional-blocks, checksum, invalidation |

### 14.2 Dependency graph

```
M12 port contract (FR-16) ──gates──► live posting
M03 ──(signed outbox)──► FR-01 ──► FR-03 ──► M12 (SR)
                          FR-02 ──► FR-03, FR-08, FR-09, FR-10
                          FR-03 ──► FR-04 ──► FR-05 ; FR-03 ──► FR-15 (reaper)
                          FR-01 ──► FR-17 (capture integrity) ──► FR-12 (backfill)
                          FR-06 ──► FR-07 ──► FR-08
                          FR-08 ──► FR-09 ──► M11
                          FR-09/FR-06 ──► FR-18 (certificate) ──► M11 gate
                          FR-10 ──► M06
                          FR-11 ──► FR-06, FR-18, M12, M13
                          FR-12 ──► FR-03
                          FR-13, FR-14 ──► all (read)
```

### 14.3 Parallel-agent build plan

| Track | FRs | Can start when | Parallelism |
|---|---|---|---|
| **Pre-0. Contracts** | **FR-16** (M12 port), capture decision D-1, lineage issuance D-2 | Week 1 (on paper) | **Blocking — must land before live posting** |
| A. Capture & mapping | FR-01, FR-02, FR-17 | Foundation + lineage ready | Parallel |
| B. Posting core | FR-03, FR-04, **FR-15** | After A + FR-16 PASS | Sequential after A; reaper + pinned-version before any live posting |
| C. DLQ & replay | FR-05, FR-12 | After B | Parallel with D |
| D. Reconciliation | FR-06, FR-07 | After B (needs posting_log + outbox state) | Parallel with C |
| E. Corrections & statutory | FR-08, FR-09, FR-10 | After B/D | Parallel internally |
| F. Historical | FR-11 | After B, D | Parallel |
| G. Certificate | FR-18 | After D, E, F | After pension-relevant data |
| H. Console & audit | FR-13, FR-14 | After C–G provide data | Last |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement theme | Covered by | Status |
|---|---|---|
| Canonical event mapping (disposition + citation + straddle) | FR-02 | ✅ |
| Eventing/queue (signed transactional outbox) | FR-01 | ✅ |
| Stable spell lineage join key | FR-01/03/06/08 + §5.6 r.11 | ✅ |
| Idempotent posting / exactly-once **effect** | FR-03 | ✅ |
| Mapping-version-independent dedupe key | FR-03 BR-03.1, Appendix A | ✅ |
| Partitioned in-order delivery + ordering guard | FR-03 | ✅ |
| Stuck-in-flight reaper | FR-15 | ✅ |
| Retry / dead-letter (breaker optional) | FR-04, FR-05 | ✅ |
| State-aware reconciliation (drift, no false positives) | FR-06 | ✅ |
| Reconciliation remediation (incl. relink) | FR-07 | ✅ |
| Correction & reversal via outbox (append-only, linked) | FR-08 | ✅ |
| Long-leave & LWP qualifying flags (tiered, cited; M11) | FR-09 | ✅ |
| Post-pension qualifying hard gate | FR-09, 10.6 | ✅ |
| Statutory annotations (increment/seniority) | FR-10 | ✅ |
| Historical digitisation (provisional, deterministic lineage) | FR-11 | ✅ |
| Replay / backfill (deterministic identity) | FR-12 | ✅ |
| Monitoring dashboard + operating model | FR-13, §11.1 | ✅ |
| Integration audit / evidence + citations | FR-14 | ✅ |
| M12 SR write-port contract + conformance | FR-16 | ✅ |
| Source-ledger ↔ outbox integrity + signed capture | FR-17 | ✅ |
| Pre-pension completeness certificate | FR-18 | ✅ |
| M03 (source) reference | FR-01, FR-06, FR-17 | ✅ |
| M12 (target) reference | FR-03, FR-08, FR-16 | ✅ |
| Integration-specific entities | E8–E21 | ✅ |
| Shared entities reused | §5.4 | ✅ |
| All council Adopted Improvements AI-1…AI-21 | Amendments table | ✅ |
| All Risk Register items R1…R18 | Amendments table + FRs | ✅ |

**Unresolved gaps: 0.**

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| Digital SR | Statutory append-only Service Register (M12), system of record for service events. |
| Transactional outbox | Pattern: write events to a DB table in the same tx as the domain change, drained by a relay — guarantees no lost events. **(v2: written in M03's tx; signed.)** |
| **Leave spell lineage id** | M03-issued identifier stable across approve→amend→cancel of one spell; the primary join key for matching, dedupe, correction linking, and reconciliation. |
| **Event sequence** | Monotonic counter within a lineage (approve=1, amend=2, …). |
| Dedupe key | **(v2)** Deterministic, **mapping-version-independent** key `hash(lineage:event_type:event_sequence)` used as the M12 `Idempotency-Key`. |
| **Exactly-once effect** | At-least-once delivery + idempotent dedupe at M12, **conditional on the M12 port contract (FR-16)** — one logical event yields one SR entry. Not bare "exactly-once delivery." |
| Dead-letter (DLQ) | Quarantine store for events that exhausted retries or hit permanent errors. |
| **Lease / reaper** | A visibility timeout on a claimed event; the reaper (FR-15) recovers crashed IN_FLIGHT events. |
| **Partition** | Per-employee/lineage serialisation unit ensuring in-order posting. |
| Reconciliation | State-aware comparison of leave ledger (M03) vs SR (M12) to detect drift, excluding legitimately pending/quarantined events. |
| **Capture integrity reconciliation** | FR-17 comparison of M03 ledger vs outbox + signature verification. |
| Drift | Divergence between source and target (missing/duplicate/divergent entries). |
| Correction / reversal | Append-only SR entry that amends or nullifies a prior entry (SR never hard-edited). |
| **Disposition** | Mapping outcome: POST_SR or **EXCLUDED_NON_SR** (deliberate non-posting, not DLQ). |
| Qualifying service | Service period counting toward pension; LWP/EOL typically non-qualifying. |
| LWP / EOL | Leave Without Pay / Extraordinary Leave — generally non-qualifying. |
| **Statutory rule ref** | Human-readable citation (e.g., CCS (Leave) Rules) mandatory on every POST_SR mapping. |
| Annotation | Structured statutory note on an SR entry (e.g., increment deferral). |
| **Provisional entry** | A low-confidence migrated SR entry excluded from pension until SR-Custodian adjudicated. |
| **Pre-pension certificate** | Signed, checksummed artefact asserting completeness; M11 gate input (FR-18). |
| Backfill | Generating capture events for source leave never previously captured, with **deterministic lineage**. |
| Replay | Re-driving existing events to the SR safely via dedupe. |
| Circuit breaker | **Optional (Phase-2)** mechanism that pauses posting during sustained upstream failure; core control is the manual relay-pause. |

---

## Section 16 — Appendices

### Appendix A — Dedupe & backfill identity derivation *(v2 — R4/R14)*

- **Live dedupe key (mapping-version-independent):**
  `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]`.
  M12 stores + indexes the key on the SR entry and rejects/no-ops duplicates (retention ≥ 7y, FR-16). **`mapping_version` is excluded** so a republish mid-retry cannot change the key; an intentional remap is posted as an explicit **correction** (FR-08), never a silently-new post.
- **Pinned mapping version:** `pinned_mapping_version` is resolved once at first claim and persisted on the outbox row; recorded as `mapping_id` in `sr_posting_log`.
- **Backfill / migration identity:** `leave_spell_lineage_id` is derived deterministically from `(employee_id, leave_type, spell_start, spell_end[, batch lineage])`, matching what M03 would issue — so a backfilled event and a later genuine M03 emission resolve to the same key and dedupe instead of double-posting.

### Appendix B — Failure classification reference *(v2)*

| Source signal | Class | Action |
|---|---|---|
| 503 / timeout / connection reset | RETRYABLE (UPSTREAM_DOWN) | Backoff retry |
| 429 | RETRYABLE (rate) | Backoff retry |
| 5xx | RETRYABLE | Backoff retry |
| Lease expired mid-flight | RETRYABLE (reaped, FR-15) | Reset to FAILED + attempt++ + alert |
| 422 LSR_MAPPING_NOT_FOUND (SR-affecting) | PERMANENT (MAPPING_MISSING) | DLQ immediately |
| EXCLUDED_NON_SR disposition | NOT A FAILURE | Outbox EXCLUDED (no-op) |
| 400 VALIDATION_ERROR | PERMANENT (VALIDATION_REJECT) | DLQ immediately |
| 403 LSR_SIGNATURE_INVALID | PERMANENT (SIGNATURE_INVALID) | DLQ + integrity finding (FR-17) |
| 409 LSR_SR_CONFLICT | PERMANENT (DATA_CONFLICT) | DLQ; recon |
| 409 LSR_BLOCKED_AWAITING_ORIGINAL | HELD (ordering) | Wait until original POSTED |
| 200 LSR_IDEMPOTENT_DUPLICATE | SUCCESS (no-op) | Mark POSTED |

### Appendix C — State-aware reconciliation matching algorithm *(v2 — R6)*

1. Index leave ledger by **`leave_spell_lineage_id`** (fallback business key `(employee_id, leave_type, spell_start, spell_end)` only for legacy/migrated without lineage).
2. Index SR leave entries by lineage / dedupe key; **resolve correction chains to net-effective**.
3. **Subtract events legitimately in `PENDING` / backoff / `BLOCKED_AWAITING_ORIGINAL` / `DEAD_LETTERED`** (counted in `pending_excluded_count`) — these are **not** `MISSING_SR`.
4. Left-anti-join remaining leave→SR ⇒ `MISSING_SR`; grouping >1 net-effective per lineage ⇒ `DUPLICATE_SR`; matched-after-chain-resolution with field diff ⇒ `DIVERGENT_FIELD`; corrections lacking originals ⇒ `ORPHAN_CORRECTION`; SR correction with no local link ⇒ `CORRECTION_WITHOUT_LINK`; leave types absent from mapping ⇒ `UNMAPPED_LEAVE`.
5. Dedupe against still-OPEN findings; persist new findings with snapshots and lineage.

### Appendix D — Sample correction chain *(by lineage)*

`EARNED_LEAVE_AVAILED (sr-78, 10d, lineage lin-bb, seq 1)` → amended to 7d → relay holds `BLOCKED_AWAITING_ORIGINAL` until sr-78 POSTED → posts `LEAVE_AMENDED AMENDMENT (sr-91, net 7d, lin-bb, seq 2)` linked via `sr_correction_link (l-02, AMENDMENT, LEAVE_AMENDED, lineage lin-bb)`. Net-effective resolver (keyed on `lin-bb`) returns sr-91. Pension/seniority readers follow the chain to the latest effective entry. If the local link insert had failed, FR-06 detects `CORRECTION_WITHOUT_LINK` and FR-07 reconstructs it from the M12-stored lineage.

### Appendix E — M12 port conformance test outline *(v2 — R2/FR-16)*

1. **Retention probe:** assert configured dedupe-key retention ≥ 2557 days; FAIL otherwise.
2. **Dedupe-replay probe:** post key K → get sr-X; simulate retention-horizon age; re-post K → assert sr-X returned + `DUPLICATE_NOOP` (no second row).
3. **Index probe:** assert `dedupe_key`, `correlationId`, `leave_spell_lineage_id` are persisted and queryable/indexed on the SR entry.
4. **Append-only probe:** attempt UPDATE/DELETE on an SR entry → assert rejected.
5. **Conflict probe:** post a genuinely conflicting state → assert `LSR_SR_CONFLICT` (409).
6. Record result + evidence checksum in `port_conformance_run`; gate live posting on PASS.

### Appendix F — Open items / future enhancements

- Optional broker (Kafka) bridge if the program later standardises event streaming (current design is DB-outbox with per-partition in-order claiming; broker-optional).
- ML-assisted anomaly detection on posting lag/drift patterns (feed to FR-13).
- Self-service employee view of "leave reflected in SR" (delegated to M12 employee surface).

---

*End of M04-LSR BRD v2.0 — council-hardened. All 21 Adopted Improvements (AI-1…AI-21) and Risk Register items (R1…R18) incorporated; see the Amendments (v1 → v2) table and the Final Reconciliation Table.*






