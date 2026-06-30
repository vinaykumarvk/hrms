# Leave Management Integration with Digital Service Register — Government HRMS Module BRD (G04, v3.0 · platform-grounded)

**Module code:** G04 (alias `M04-LSR`; `GOV-M04`)
**Program:** Government HRMS — public-sector configuration & extension of the **PrimeSoft HRMS platform** (Master BRD v2.1 · Vision v2.6 · Platform Spec v1.6 · RBAC v1.7 · Foundation FS v1.6)
**Document version:** v3.0 (platform re-grounded)
**Status:** Re-grounded — supersedes v2.0; preserves all v2 council-hardening (21 Adopted Improvements, Risk Register R1–R18) and re-anchors every mechanism onto platform services.
**Upstream contracts:** `PLATFORM_FOUNDATION.md` (authoritative build contract) · `MODULE_RECONCILIATION.md` (this module's row §A; convention overrides §C; net-new entity register §D)
**Relationship (confirmed from reconciliation §A/§D):** **NET-NEW (gov-specific)** integration — PrimeSoft has no leave→statutory-ledger analogue. It nonetheless **RUNS ON platform services** (X.1 jobs runner, X.3 integration framework, P01 workflow, P02 RBAC, P05 audit substrate, P06 migration, X.2 notifications) and **feeds the net-new G12 Service Register ledger** (which itself runs on the P05 audit/immutability substrate).

> **Reading note.** This BRD is the **integration / contract layer** between **G03 Attendance & Leave Management** (the *source* of approved leave events; G03 aligns to PrimeSoft **M04 Leave** + **M05 Attendance** per reconciliation §A — it issues the leave ledger and the spell lineage) and **G12 Digital Employee Service Register** (the *target* append-only statutory ledger, a **net-new gov ledger running on P05**, per reconciliation §C/§D). It does **not** redefine platform-provided entities (`audit_log`/`security_audit_log` via **P05**, `notifications` via **X.2**, `workflows`/`workflow_instances`/`workflow_actions` via **P01**, `documents` via **G13**/PrimeSoft M11, `integration_credentials` via **P04**, `migration_runs` via **P06**); it **references** them by service id and adds only the **integration-specific** entities required for reliable, auditable, **exactly-once-effect** posting, reconciliation, correction/reversal, and statutory annotation. It does **not** invent a shared `service_register_events` platform table — that ledger is **owned by G12** and written through a G12 write port governed by the **X.3 integration framework**.

> **v3 framing.** v3 keeps the entire v2 skeleton and its best-in-class **statutory-semantics layer** (append-only corrections + link table, versioned effective-dated mapping catalog, mapping-sourced qualifying-service rules, pre-pension gate, evidence pack, lease reaper, contracted-and-conformance-tested G12 write port, source↔outbox integrity reconciliation, provisional migrated entries, signed capture payloads) and **re-grounds** every mechanism in platform terms: the transactional-outbox **relay/reaper/reconciliation jobs register on the X.1 jobs runner** (idempotent per-period run key, retry exponential backoff ×3, per-tenant isolation, terminal failure → `JOB-FAIL` → `MSG-SYS-JOBFAIL`) as `JOB-G04-*`; the G12 SR write port is reached as an **X.3 outbound integration** (circuit-breaking, outbound-call idempotency, payload versioning, per-integration error mapping, credentials from P04); the SR target is the **G12 ledger on the P05 audit substrate** (DB-trigger captured, immutable, ≥ 7-yr, hash-chain tracks OPEN-PLAT-03); every entity carries **`tenant_id`/`entity_id`** with data-layer scoping; authz is **P02 `Authorization.check`**; maker-checker is **P01**; notifications are **X.2** (`MSG-G04-*`); the platform **API conventions + 8-code error table** (`VALIDATION_FAILED` 422, `CONFLICT` 409, `PRECONDITION_FAILED` 412, …), **`Idempotency-Key`**, **cursor pagination**, and **`X-Correlation-Id`** header replace the invented conventions.

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Digital Service Register (Digital SR, owned by **G12**) is the **statutory system of record** for an employee's entire service lifecycle. It is a **net-new government ledger running on the platform's P05 audit/immutability substrate** (DB-trigger capture, immutable, ≥ 7-yr retention, hash-chain tamper-evidence tracking OPEN-PLAT-03) — **not** a PrimeSoft platform primitive (reconciliation §C). In a government HR context the Service Register is a legal document: pension, seniority, increments, qualifying-service computation, and audit by the Accountant General all depend on it being **complete, accurate, append-only, and tamper-evident**. Leave — especially **long leave, Leave Without Pay (LWP / EOL), study leave, and suspension-as-leave** — directly affects **qualifying service for pension**, **increment dates**, and **seniority**. Therefore every leave spell that is *approved* in G03 must become a **permanent, immutable SR entry** in G12, and every *cancellation or amendment* of that leave must produce a **correcting SR entry** (the SR is never hard-edited; corrections are new P05-captured rows).

**G04 is the integration that guarantees this.** It is not a leave system and not the SR itself; it is the **reliable, idempotent, reconciled, monitorable bridge** that maps leave domain events to statutory SR entries with **exactly-once *effect*** (defined precisely in §1.6), full **replay**, automated **drift detection**, and explicit **failure handling** (retry / dead-letter / manual intervention) — expressed throughout in platform terms (X.1 jobs, X.3 outbound calls, P01/P02/P05).

### 1.2 Business problem

Without a formal integration contract, leave-to-SR posting is typically done by manual data entry or fragile point-to-point calls, producing the classic failure modes that auditors penalise: **missing SR entries** (approved leave never recorded), **duplicate entries** (double-posting on retries), **drift** (leave ledger and SR disagree on LWP days), **orphaned corrections** (a leave was cancelled but the SR still shows it as availed), **silent loss** (a posting failed — or a worker crashed mid-flight — and nobody noticed), and **broken lineage** (an amended spell can no longer be tied back to its original). Each corrupts qualifying-service and pension computation years later, when the error is expensive to fix and the original approver has retired.

### 1.3 Solution overview

G04 delivers:

1. **Stable spell lineage** — a `leave_spell_lineage_id` sourced from G03, stable across approve → amend → cancel, threaded through the outbox, posting log, every SR entry, correction links, and reconciliation findings; the **primary join key** for net-effective resolution, duplicate/orphan detection, pension totalling, and evidence-chain reconstruction.
2. **Canonical event mapping** — a governed, versioned, **statutorily-cited** catalog mapping each leave type / spell outcome to exactly one **G12-published `event_type_code`** **or an explicit `EXCLUDED_NON_SR` disposition** (the G12-published G04 codes are verbatim `EL_AVAILED`, `HPL_AVAILED`, `COMMUTED_LEAVE`, `STUDY_LEAVE`, `MATERNITY_LEAVE`, `LWP_SPELL`, `EOL_SPELL`; cancellations use the published `*_CANCELLED` partner type via the `is_reversal=true` envelope, not a free-form correction code; non-SR casual leave is a no-op). Authored as a configured catalog with `VAL-G04-*` rules; publish runs maker-checker on **P01**.
3. **Transactional outbox with signed capture** — leave-approval events captured in the same database transaction as the leave-ledger write in G03's bounded context, HMAC-signed for provenance; a **source-ledger ↔ outbox integrity reconciliation** (a `JOB-G04-INTEGRITY` X.1 job) catches any capture loss.
4. **Idempotent, exactly-once-effect posting** — a partitioned, in-order relay (`JOB-G04-RELAY` on the X.1 runner) drains the outbox and posts to G12 through the **X.3 integration framework** with a stable, **mapping-version-independent dedupe key** as the outbound `Idempotency-Key`, so retries, concurrency, and remaps never double-post.
5. **Stuck-in-flight lease reaper** — a visibility-timeout sweeper (`JOB-G04-REAPER`) returns crashed `IN_FLIGHT` events to retry-eligible, closing the silent-loss path.
6. **Retry with backoff + dead-letter queue (DLQ)** — transient failures retry with backoff; poison messages quarantine for human resolution. **X.3 supplies circuit-breaking** for the G12 downstream; bounded per-event retry + DLQ + a manual relay-pause are the core module controls.
7. **State-aware reconciliation engine** — scheduled (`JOB-G04-RECON`) and on-demand comparison of the G03 leave ledger against G12 SR entries that **excludes legitimately pending/quarantined events** and **matches on lineage with correction chains resolved** before raising findings.
8. **Correction & reversal handling through the same outbox machinery** — cancelled/amended leave posts an append-only correcting/reversing SR entry (ordered after its original) referencing the original by lineage, preserving the immutable chain; `sr_correction_link` is reconcilable from G12-stored identity.
9. **Tiered qualifying-service governance** — LWP / long-leave spells flagged **non-qualifying** (or partially qualifying per cited rule); routine corrections auto-post but are flagged and post-audited, while any qualifying-service change **after pension processing has started is a hard maker-checker gate** on P01.
10. **Contracted G12 SR write port (X.3 outbound)** — a bilateral write-port spec with a dedupe-key retention window ≥ the maximum replay/backfill horizon (7 years, aligned to P05's ≥ 7-yr retention), `correlationId` + `leave_spell_lineage_id` persisted and indexed, and a **CI conformance test** proving dedupe holds; the call runs on X.3 (credential from P04, payload versioning, error mapping).
11. **Historical digitisation with provisional entries** — bulk migration of legacy leave into the SR on the **P06 ETL+V toolkit** (3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability), carrying a `PROVISIONAL` confidence flag and mandatory statutory rule citation, excluded from final pension computation until SR-Custodian adjudicated.
12. **Pre-pension completeness certificate** — a signed, checksummed evidence artefact asserting zero open HIGH/CRITICAL findings and full lineage for an employee, consumable as G11's gate input.
13. **Integration monitoring dashboard & operating model** — real-time health, lag, DLQ depth, reconciliation status, SLA alerts (via X.2), plus a defined IntegOps on-call rota and tiered resolution SLAs; metrics export to **G14** (PrimeSoft M16 Analytics).

### 1.4 Key outcomes & success metrics

| Outcome | Metric | Target |
|---|---|---|
| No lost leave events | Outbox events posted to SR / outbox events created | 100% (eventually) |
| No silent in-flight loss | Stranded `IN_FLIGHT` rows older than lease window | 0 (reaper-recovered) |
| Capture completeness | G03 ledger SR-affecting decisions with matching outbox row | 100% (integrity recon) |
| No double-posting | Duplicate SR entries detected per 10,000 postings | 0 |
| Timely posting | P95 lag from leave approval to SR-entry confirmation | ≤ 5 minutes |
| Lineage integrity | Amended/cancelled spells resolvable to their original via lineage | 100% |
| Drift control | Open reconciliation findings older than tiered SLA | 0 |
| Correction integrity | Cancelled/amended leaves with matching, linked correction entry | 100% |
| Pension correctness | Qualifying-service discrepancies surfaced before pension processing | 100% pre-flagged + certificate |
| Operability | DLQ items resolved within tiered SLA | ≥ 99% within SLA |
| Audit completeness (P05) | SR + integration mutations captured by DB-trigger | 100%, zero gaps |

### 1.5 Scope at a glance

**In scope:** signed event capture from G03, source↔outbox integrity reconciliation, mapping (incl. exclusion disposition + rule citations), partitioned in-order posting to G12 over X.3, lease/reaper, dedupe/idempotency, retry/DLQ, state-aware reconciliation, correction/reversal through the outbox, tiered qualifying-service governance, statutory annotations, historical digitisation (on P06) with provisional entries, pre-pension completeness certificate, monitoring dashboard + operating model, replay/backfill, and the G12 SR write-port bilateral contract + conformance test (FR-16).
**Out of scope (owned elsewhere):** leave policy/accrual/application/approval (**G03** → PrimeSoft M04/M05); the SR ledger schema, immutability substrate, and SR UI (**G12** on P05); pension computation (**G11**); seniority list maintenance (**G06**); document storage (**G13** → PrimeSoft M11); platform engines themselves (P01–P06, X.1–X.3, W.1–W.3). G04 *references* and *coordinates* these; it does not own them.

### 1.6 Reliability guarantee — stated precisely (R10)

G04 does **not** promise raw "exactly-once delivery." It promises **exactly-once *effect***: **at-least-once delivery + idempotent dedupe at G12**, *conditional on the G12 port contract* (FR-16). One logical leave event yields exactly one SR entry despite retries, concurrent workers, crashes, and replays — **provided** G12 honours the contracted dedupe-key retention window (≥ 7 years, aligned to P05 ≥ 7-yr retention) and persists the dedupe key, `correlationId`, and `leave_spell_lineage_id` on the SR entry. The outbound idempotency is doubly anchored: the **X.3 integration framework guarantees idempotency of the outbound call**, and **G12 persists the dedupe key** for the statutory horizon. This caveat is repeated in the NFRs (§9), the glossary (§15), and the G12 contract (FR-16); it must not be softened to bare "exactly-once" in any downstream artefact, demo, or auditor communication.

---

## Amendments (v2 → v3: platform re-grounding)

Every change is a **re-grounding** — no v2 capability, FR, entity, business rule, or risk mitigation is removed. The table maps each platform-alignment change to where it lands.

| # | v2 (invented `SHARED_FOUNDATION`) | v3 (platform-grounded) | Source | Landed in |
|---|---|---|---|---|
| RG-1 | Module code `M04-LSR` | **`G04`** (`GOV-M04`); collision-free with PrimeSoft `Mxx`/platform `Pxx` | Reconciliation §B | Title, all FR headers, all ids |
| RG-2 | Source module **M03**; target **M12**; pension **M11**; seniority **M06**; docs **M13**; analytics **M14** | **G03** (≈ PrimeSoft M04 Leave + M05 Attendance), **G12** SR ledger, **G11**, **G06**, **G13** (≈ PrimeSoft M11), **G14** (≈ PrimeSoft M16) | Reconciliation §A/§B | §1, §2, §5, §8, all FRs |
| RG-3 | `service_register_events` as **shared platform entity** | **Net-new G12 ledger on the P05 audit substrate** (DB-trigger, immutable, ≥7-yr, hash-chain OPEN-PLAT-03); G04 writes it only via the G12 write port | Reconciliation §C/§D | §1.1, §5.1, FR-03/08/16 |
| RG-4 | Bespoke relay/reaper/recon "backend workers driven by a scheduler" | **X.1 jobs runner** registration (`JOB-G04-RELAY/REAPER/RECON/INTEGRITY/CONFORMANCE/DLQ-SLA`), idempotent per-period run key, retry backoff ×3, per-tenant isolation, `JOB-FAIL → MSG-SYS-JOBFAIL` | Platform §X.1; Foundation §4 | §4, FR-03/06/15/16/17, §10.1 |
| RG-5 | Point-to-point HTTP to M12 + "optional Phase-2 circuit breaker" | **X.3 integration framework** outbound call: circuit-breaking (platform-provided), outbound idempotency, payload versioning, per-integration error mapping, credentials from **P04** | Platform §X.3, §P04 | §4, FR-03/04/16, §8.4 |
| RG-6 | Invented `audit_log` "shared" single table | **P05 dual log** (`audit_log` + `security_audit_log`), **DB-trigger capture**, immutable, ≥7-yr; G04 never defines its own audit table | Platform §P05; Reconciliation §C | §4, §5.1, every FR audit row |
| RG-7 | `workflow_instances` / `workflow_tasks` "shared engine" | **P01** `WorkflowEngine` (`workflows`/`workflow_instances`/`workflow_actions`); maker-checker = configured P01 flow; SoD enforced by P01/P02 | Platform §P01; Reconciliation §C | §3, §4, §5, FR-02/05/07/08/09/11/18 |
| RG-8 | Error codes `VALIDATION_ERROR(400)`, `AUTH_REQUIRED(401)`, `UPSTREAM_UNAVAILABLE(503)`; envelope `{…,requestId}` | Platform **8-code table** (`VALIDATION_FAILED` 422, `UNAUTHENTICATED` 401, `CONFLICT` 409, `PRECONDITION_FAILED` 412, `RATE_LIMITED` 429, `INTERNAL` 500, …), envelope `{error:{code,message,field,details}}` + **`X-Correlation-Id`** header; `LSR_*` → `ERR-G04-*` | Foundation §1; Reconciliation §C | §4.1, §8.1/§8.2 |
| RG-9 | `Idempotency-Key` ad-hoc; pagination "page/limit or cursor, max 100" | **`Idempotency-Key`** on unsafe POSTs (24h replay → `CONFLICT`); **cursor pagination only** (`limit` default 25 / max 100, `next_cursor`) | Foundation §1; Reconciliation §C | §4, §8.1 |
| RG-10 | Multi-tenancy omitted | **`tenant_id`/`entity_id` non-nullable on every G04 entity**; unscoped query rejected; data-layer scoping | Platform §0.1; Reconciliation §C | §4, §5.2 (all entities) |
| RG-11 | Invented role list (IntegOps, SR Custodian, Pension Officer, Auditor, Sys Admin) | **RBAC v1.7 ADDITIONS**: IntegOps & SR Custodian as **new roles + capability flags**; Pension Officer ≈ Payroll-Admin-class role; Auditor → Org-Admin read + entitlement; Sys Admin → Org/Platform Admin; SoD by P01/P02 | RBAC §6.6; Reconciliation §C | §3 |
| RG-12 | Notifications to a custom `notifications` ledger | **X.2 infrastructure** (`IN_APP`+`EMAIL` parallel, statutory = mandatory/non-suppressible, retry ×5 + DLQ); templates `MSG-G04-*` / `MSG-SYS-JOBFAIL` by id (Foundation §5); W.3 recipient config | Platform §X.2; BRD §9.9 | §4, §11 |
| RG-13 | Historical digitisation "batch pipeline" bespoke | **P06 Migration Toolkit** (ETL+V, 3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability) | Platform §P06; Reconciliation §D | FR-11, §13.1 |
| RG-14 | NFR `99.9%`, `RPO ≤ 15 min` | Platform baseline **99.5%/month, RPO < 1 h, RTO < 4 h**; p95 < 500 ms & WCAG 2.1 AA already align | Vision §2.9; BRD §7 | §4, §9 |
| RG-15 | `VAL-*` rules implied/restated | Cite Foundation `VAL-*` by id; author only module-unique **`VAL-G04-*`** and register in Foundation §2 | Foundation §2/§7 | §4, FR-02 |
| RG-16 | Effective-dated mapping/config "on save" | Effective-dating uses the platform mechanism (staged, applied by job); config cascade `platform→tenant→entity→employee`, in-flight version pinning | Platform §0.3, §3.3 | FR-02, FR-04 |
| RG-17 | Console architecture self-specified (React/Tailwind) | Behaviour + NFR specified; physical stack is an engineering choice **within the platform logical architecture**; canonical UI-state standard (empty/loading/error/no-permission/partial-data; masked fields per RBAC; `E·AR` request-change) | Reconciliation §C; Foundation §3 | §4, §7 |
| RG-18 | New `## Alignment with PrimeSoft Platform` + this `## Amendments (v2→v3)` table + platform rows in Final Reconciliation | Mandated by Foundation §9.6 | §Alignment, §14.4 |

> **Net change:** zero FRs removed or weakened (still **FR-01 … FR-18**); **14 owned entities** (E8–E21) retained, now each carrying `tenant_id`/`entity_id`; **referenced** entities re-pointed from invented "shared" tables to **platform services** (P01/P05/X.2/P04/P06) and **sibling gov modules** (G01/G03/G11/G12/G13/G14). All v1→v2 council improvements (AI-1…AI-21, R1…R18) remain in force — see the preserved Amendments (v1 → v2) table below.

## Amendments (v1 → v2) — preserved from v2

Every council Adopted Improvement (AI-#) and its source Risk (R#) remains incorporated; the v3 landing column adds the platform service it now runs on.

| AI-# | Risk | Improvement | Incorporated (v2) | v3 platform landing |
|---|---|---|---|---|
| AI-1 | R3 | `leave_spell_lineage_id` stable across approve/amend/cancel; primary join key | §1.3(1); E8/E10/E13/E14 field; FR-01/03/06/08/09 | unchanged (G03-issued) |
| AI-2 | R1 | Stuck-in-flight reaper + lease + visibility-timeout sweeper + alert | FR-15; E8 lease fields; §10.1 | reaper = **`JOB-G04-REAPER`** on X.1 |
| AI-3 | R2 | G12 write-port bilateral spec + CI conformance test (retention ≥7y, indexed `correlationId`+lineage, append-only) | FR-16; E19; §8.5 | port call on **X.3**; G12 on **P05**; `JOB-G04-CONFORMANCE` |
| AI-4 | R7 | Capture architecture decision + source↔outbox reconciliation | D-1; FR-17; E20 | recon = **`JOB-G04-INTEGRITY`** on X.1 |
| AI-5 | R4 | Persist pinned `mapping_version` at first claim | E8 `pinned_mapping_version`; §10.1 | unchanged |
| AI-6 | R4 | Dedupe key off `mapping_version` (lineage+event_type+event_sequence) | FR-03 BR-03.1; Appendix A | = X.3 outbound `Idempotency-Key`; G12-persisted ≥7y |
| AI-7 | R5 | Per-employee/lineage partitioned in-order claim + ordering guard | FR-03; E18; status enum | unchanged |
| AI-8 | R6 | Reconciliation outbox/DLQ-state-aware; lineage match; pending bucket | FR-06; Appendix C; E12 | recon = **`JOB-G04-RECON`** on X.1 |
| AI-9 | R8 | Explicit `EXCLUDED_NON_SR` disposition | E9 `disposition`; FR-02 | unchanged |
| AI-10 | R9 | Corrections via same outbox+idempotency; `sr_correction_link` recoverable | FR-08; FR-06 `CORRECTION_WITHOUT_LINK` | G12-stored lineage on P05 |
| AI-11 | R10 | Restate "exactly-once" as exactly-once-effect conditional on G12 contract | §1.6; §9; §15 | + X.3 outbound idempotency |
| AI-12 | R11 | Tier maker-checker; hard gate qualifying change after pension start | FR-08 BR-08.4; FR-09 BR-09.3; §10.6 | hard gate = **P01** flow; SoD by P02 |
| AI-13 | R12 | Right-size throughput (low thousands/day; burst on migration) | §9 Throughput | unchanged |
| AI-14 | R13 | Circuit breaker optional; core = retry + DLQ + manual pause | FR-04; §10.5 | breaker now **platform-provided via X.3** |
| AI-15 | R14 | Deterministic backfill identity from lineage + business key | FR-12 BR-12.1; Appendix A | unchanged |
| AI-16 | R15 | Migrated entries `PROVISIONAL` + rule_ref + excluded until adjudicated | FR-11; E16 | migration on **P06** |
| AI-17 | R16 | Straddling-spell split into per-effective-range SR sub-entries | FR-02 BR-02.4; FR-09; E9 | unchanged |
| AI-18 | R17 | Sign capture payload (HMAC) + constrain writers + outbox↔ledger recon | FR-01 BR-01.4; E8 `payload_signature`; FR-17 | unchanged; integrity job on X.1 |
| AI-19 | R10 | Mandatory statutory rule citations in mapping, surfaced in evidence pack | E9 `statutory_rule_ref`; FR-02 AC-6; FR-14 | unchanged |
| AI-20 | R18 | IntegOps operating model: tiered SLA + on-call/escalation | §11.1; §13.5; FR-13 | alerts via **X.2**; metrics to **G14** |
| AI-21 | Proponent | Pre-pension completeness certificate as signed M11 gate input | FR-18; E21 | gate input to **G11** |

## Amendments (v3 → v3.1: cross-module remediation)

Surgical alignment to the **G12-frozen SR ingestion contract** (REMEDIATION.md D1/D2; R1 findings F-01..F-04, F-07). G04 is the confirmed **leave→SR writer** (G03 feeds G04 via `leave_spell_lineage_id`; G03 does not post to SR). No FR removed; the SR write mechanism is re-pointed onto the canonical G12 contract.

| # | Finding | v3 (pre) | v3.1 (remediated) | Landed in |
|---|---|---|---|---|
| RM-1 | F-01 write-port URL | `POST {G12}/api/v1/sr/events` | Canonical **`POST /api/v1/sr/ingest`** (+ `/api/v1/sr/ingest/reversal`) — G12's only ledger write path; G04-local trigger endpoints are façades that **relay to `/api/v1/sr/ingest`** | D-3, §4 wording, FR-03/FR-08 API, §8.1, §8.3, §8.5, traceability, Appendix D |
| RM-2 | F-07 event codes | `EARNED_LEAVE_AVAILED`, free-form `LWP`, `LEAVE_CANCELLED_CORRECTION` | Cite the **verbatim G12-published G04 codes** `EL_AVAILED`, `HPL_AVAILED`, `COMMUTED_LEAVE`, `STUDY_LEAVE`, `MATERNITY_LEAVE`, `LWP_SPELL`, `EOL_SPELL` (LWP availed posts as `LWP_SPELL`) | §1.3(2), E9 field + sample, E10, §8.3, Appendix D |
| RM-3 | F-02/F-03 dedup + fact_key | Per-writer `dedupe_key` only; no canonical tuple; no `fact_key` | Populate G12 tuple `(source_module="G04", source_reference_id, source_event_version)` **and** mandatory **`fact_key`** (per `fact_correlation_rule`; missing ⇒ `SR_FACT_KEY_REQUIRED`); `leave_spell_lineage_id` kept as business correlation; explicit `tenant_id`+`entity_id` | D-3, E10 fields, integrity rule 2, §8.3, §8.5 |
| RM-4 | F-04 reversal taxonomy | G04-local `AMENDMENT`/`REVERSAL`-by-lineage verbs | **G12 reversal envelope** `is_reversal=true` + `reverses_source_reference_id` (+ published `*_CANCELLED` partner type); supersede-not-delete; G12 auto-spawns corrigendum | FR-08 desc/AC/BR-08.1, FR-08 API, §8.3, Appendix D |
| RM-5 | D5 G03↔G04 key | Lineage stated, signed-capture shape implicit | Confirmed correlation key = **`leave_spell_lineage_id`** (G04's key, G03-exposed); aligned the signed-capture HMAC shape G04 consumes to what G03 emits | D-2 |

## Section 2 — Scope & Boundaries

### 2.1 In-scope capabilities

- **Signed capture** of **approved**, **cancelled**, and **amended** leave domain events from **G03** via a transactional outbox written inside G03's transaction, with an HMAC-signed payload and a stable `leave_spell_lineage_id`.
- **Source-ledger ↔ outbox integrity reconciliation** (`JOB-G04-INTEGRITY`) to detect capture loss (FR-17).
- A **governed event-mapping catalog** (leave type + spell semantics → SR entry type **or `EXCLUDED_NON_SR`**, qualifying-service rule, **mandatory statutory rule citation**), versioned and effective-dated, with per-effective-range split handling for straddling spells; publish maker-checker on **P01**.
- A **partitioned, in-order, idempotent posting relay** (`JOB-G04-RELAY`) to G12's SR write port over **X.3** with exactly-once *effect* and correction-ordering guards.
- A **stuck-in-flight lease reaper** (`JOB-G04-REAPER`, FR-15).
- **Retry, backoff, and dead-letter** handling for posting failures; **X.3-provided circuit-breaking** plus a manual relay-pause.
- **State-aware reconciliation** (`JOB-G04-RECON` + on-demand) between the G03 leave ledger and G12 SR, lineage-keyed, excluding pending/quarantined events, with finding classification (MISSING_SR / DUPLICATE_SR / DIVERGENT_FIELD / ORPHAN_CORRECTION / UNMAPPED_LEAVE / **CORRECTION_WITHOUT_LINK**) and remediation.
- **Correction & reversal** posting for cancelled/amended leave through the **same outbox/idempotency machinery** (append-only, references original by lineage).
- **Tiered qualifying-service / pension impact governance** (LWP, EOL, study leave, suspension) emitted on SR entries and consumable by **G11**.
- **Historical leave digitisation** into the SR on the **P06** toolkit with provenance, **provisional/confidence handling**, mandatory rule citation, batch validation, and post-load reconciliation.
- **Statutory annotations** (increment deferral, seniority effect, probation extension) attached to SR entries, consumed by **G06**.
- **Pre-pension completeness certificate** (FR-18), monitoring dashboard, alerting (**X.2**), IntegOps operating model, and **replay/backfill** tooling.
- The **G12 SR write-port bilateral contract + CI conformance test** (FR-16) on **X.3**.

### 2.2 Out-of-scope (explicit boundaries)

| Concern | Owner | G04 relationship |
|---|---|---|
| Leave types, accrual, balances, application, multi-level approval, **lineage-id issuance** | **G03** (≈ PrimeSoft M04 Leave + M05 Attendance) | Consumes approved/cancelled/amended events; reads G03-issued `leave_spell_lineage_id` |
| SR ledger storage, SR entry schema, immutability substrate, SR custodian UI, **dedupe** enforcement | **G12** (net-new ledger on **P05**) | Posts entries via G12 write port (X.3, contracted in FR-16); never edits SR rows directly |
| Pension & qualifying-service computation | **G11** | Provides qualifying-service flags + pre-pension certificate via SR; does not compute pension |
| Seniority list generation | **G06** | Provides seniority-impact annotation; does not maintain lists |
| Document/object storage | **G13** (≈ PrimeSoft M11) | References `documents` for legacy scan provenance |
| Authentication / RBAC / authorization | **P02** + RBAC v1.7 | Inherits OIDC/SSO+MFA, model-driven enforcement via `Authorization.check` |
| Audit & immutability substrate | **P05** | DB-trigger dual-log; G04 appends nothing custom |
| Workflow / maker-checker | **P01** | Configured flows; SoD enforced by engine |
| Background-job execution | **X.1** | Registers `JOB-G04-*`; runner owns scheduling/retry/isolation |
| Outbound integration plumbing | **X.3** | Circuit-breaking, idempotency, payload versioning, error mapping |
| Notifications | **X.2** + W.3 | Channels/retry/templates by `MSG-*` id |
| Legacy data migration | **P06** | ETL+V, dry runs, `migration_runs` |

### 2.3 Feature Module Map

| Feature area | FRs | Primary collaborating modules / services |
|---|---|---|
| Signed event capture (transactional outbox) | FR-01 | G03 (source) |
| Event mapping catalog (disposition + rule citation + straddle) | FR-02 | G03, G12; P01 (publish) |
| Partitioned idempotent posting relay (exactly-once effect) | FR-03 | G12 (target); **X.1** (job), **X.3** (call) |
| Retry, backoff & dead-letter (X.3 breaker) | FR-04 | **X.3**, **X.1** |
| DLQ triage & manual resolution | FR-05 | G12; **P01** |
| State-aware reconciliation engine | FR-06 | G03, G12; **X.1** |
| Reconciliation remediation | FR-07 | G03, G12; **P01** |
| Correction & reversal posting (via outbox) | FR-08 | G03, G12; **X.3**, **P01** |
| Tiered qualifying-service / pension impact flags | FR-09 | G11, G12; **P01** |
| Statutory annotations (increment/seniority/probation) | FR-10 | G06, G12 |
| Historical leave digitisation (provisional) | FR-11 | G03, G12, G13; **P06**, **P01** |
| Replay & backfill tooling (deterministic identity) | FR-12 | G12; **X.1**, **P01** |
| Integration monitoring dashboard + operating model | FR-13 | G14; **X.2** |
| Integration audit & evidence pack | FR-14 | Auditor, G12; **P05** |
| **Stuck-in-flight lease reaper** | **FR-15** | **X.1** |
| **G12 SR write-port contract & conformance test** | **FR-16** | G12; **X.3** |
| **Source-ledger ↔ outbox integrity reconciliation** | **FR-17** | G03; **X.1** |
| **Pre-pension completeness certificate** | **FR-18** | G11, Auditor; **P01** |

### 2.4 Common Capabilities (inherited from the PrimeSoft platform, applied here)

- **Audit-everything (P05):** every posting, claim, reap, retry, DLQ move, reconciliation finding, correction, certificate, and replay is captured by the **P05 DB-trigger** into `audit_log` (immutable, ≥7-yr); auth/permission/admin events go to `security_audit_log`. G04 defines **no** custom audit table.
- **Maker-checker (P01):** any *manual* SR posting, correction, DLQ resolution that writes to the statutory register, historical batch promotion, **or any qualifying-service change after pension processing has started** routes through a **configured P01 flow** (`workflows`/`workflow_instances`/`workflow_actions`) with maker ≠ checker; **SoD enforced by P01/P02**, not re-coded.
- **RBAC + row-level scoping (P02):** every endpoint calls `Authorization.check`; data-layer scoping by the five RBAC dimensions (reporting chain · `org_unit` · UAG · contribution level · entity); Auditor is read-only across all G04 surfaces; field masking applied on serialization.
- **Multi-tenancy (Platform §0.1):** every G04 entity carries `tenant_id` (+ `entity_id` where entity-scoped); a query without a resolvable tenant scope is **rejected**, not defaulted to "all".
- **Pagination:** **cursor only** — `?limit=` (default 25, max 100) + `cursor=`; response carries `next_cursor`.
- **Idempotency:** unsafe POSTs accept `Idempotency-Key` (24h replay → `CONFLICT`/`ERR-DUP-INSTANCE`); SR write calls additionally carry the statutory **`dedupe_key`** as the X.3 outbound idempotency key, persisted ≥7y by G12.
- **Time/locale:** store UTC; display `DD-MMM-YYYY`; INR formatting where relevant.
- **Soft-delete** on mutable config entities; **append-only** on all ledgers (outbox is consume-marked, never deleted; posting log, reconciliation log, DLQ history, correction links, certificates are append-only; SR is P05-immutable).
- **Canonical UI-state standard (Foundation §3):** empty / loading / error / no-permission / partial-data states; masked fields per RBAC; `E·AR` request-change pattern for approval-required fields.

### 2.5 Assumptions, decisions & dependencies

**D-1 — Capture architecture decision (resolves R7, AI-4).** The `leave_event_outbox` is written **inside G03's own database transaction** (transactional-outbox-in-source pattern), as a shared outbox table that G03 writes (in its tx) and G04 reads. This is the **preferred and adopted** architecture: it preserves the "no lost events" guarantee without a cross-service distributed transaction. If, for any deployment, G03 cannot host the outbox write in-transaction, the **fallback is G04 polling G03's ledger** (a `JOB-G04-INTEGRITY`-driven poll), and in that case **FR-17 is mandatory** to detect capture loss. FR-01's acceptance criteria are written to be testable under the adopted (in-tx) architecture, with FR-17 as the compensating control either way. Note: G03's leave ledger aligns to PrimeSoft **M04 Leave** + **M05 Attendance** (reconciliation §A); G04 references those source entities and does **not** fork them.

**D-2 — Lineage issuance (R3, AI-1; reconciliation §D5 G03↔G04 handoff).** The confirmed correlation key from G03 is **`leave_spell_lineage_id`** (G04's key) — G03 exposes it on the approved/cancelled/amended leave event, **stable across the approve → amend(s) → cancel lifecycle** of a single spell. Each event additionally carries a monotonically increasing `event_sequence`. The **signed-capture shape G04 consumes matches what G03 emits**: an HMAC-signed payload carrying `leave_spell_lineage_id`, `event_sequence`, `leave_type_code`, spell window, and `days_count` (verified per `VAL-G04-SIG`, FR-01 BR-01.4). G04 treats lineage as the **business correlation identity** for matching, correction linking, and reconciliation, while the canonical G12 dedup tuple `(source_module, source_reference_id, source_event_version)` is also populated on every ingest call (D-3).

**D-3 — G12 port is contracted, not assumed (R2, AI-3).** G12 exposes the **single canonical idempotent SR write port — `POST /api/v1/sr/ingest`** (with `POST /api/v1/sr/ingest/reversal` for the reversal envelope) — the **only** ledger write path. It accepts the G12 syntactic dedup tuple `(source_module, source_reference_id, source_event_version)` (G04 sends `source_module="G04"`), the **mandatory `fact_key`** semantic-dedup field (these are qualifying-service-bearing events, so a missing `fact_key` is rejected `SR_FACT_KEY_REQUIRED`), explicit `tenant_id`+`entity_id`, and returns the created `sr_event_id`. The call is an **X.3 outbound integration** (circuit-breaking, outbound idempotency, payload versioning, per-integration error mapping; credentials from **P04** `integration_credentials`). It is governed by a **signed bilateral contract** (FR-16) specifying: dedup-tuple + `fact_key` retention ≥ 7 years (≥ max replay/backfill horizon, aligned to P05 ≥7-yr); mandatory persistence + indexing of the dedup tuple, `fact_key`, `correlationId`, and `leave_spell_lineage_id` (the G03 business correlation key) on the SR entry; **append-only** immutability (intrinsic to the **P05 substrate** G12 runs on — DB-trigger, no UPDATE/DELETE); and exact `ERR-G04-SR-CONFLICT` semantics. A **CI conformance test** (`JOB-G04-CONFORMANCE` / `port_conformance_run`) proves dedupe holds across the retention window before any live posting is enabled.

**D-4 — Other dependencies.** **G11** reads qualifying-service flags + the pre-pension certificate from SR entries (pull) or subscribes to SR change events (push); the **X.1 jobs runner** drives reconciliation, relay sweeps, and the reaper (no bespoke scheduler); clock sync (NTP) across services for lag measurement, lease expiry, and effective-dating; **G12** runs on the **P05 audit substrate** so SR immutability/tamper-evidence (hash-chain OPEN-PLAT-03) is inherited, not re-built.

---

## Section 3 — Roles & Permissions

### 3.1 Roles relevant to G04 — expressed as RBAC v1.7 ADDITIONS (RBAC §6.6; no parallel scheme)

Per reconciliation §C and `PLATFORM_FOUNDATION.md` §6.6, government statutory actors are **new roles + capability flags ADDED** to the RBAC v1.7 taxonomy (registered in RBAC §2.2/§4.3), never an invented parallel role list. SoD (maker ≠ checker, no self-approval) is **enforced by P01/P02**.

- **Integration Operator (IntegOps)** — **new entity-scoped operational role** (module-admin pattern, analogous to a configured-content/ops admin), with capability flags `g04.relay.pause`, `g04.dlq.triage`, `g04.replay.trigger`, `g04.recon.trigger`. Monitors the dashboard, triages DLQ, triggers replay/backfill, runs on-demand reconciliation, and **owns the on-call rota and tiered-SLA response** (§11.1). *Cannot* author SR entries that bypass maker-checker (P02 deny-by-default + SoD).
- **SR Custodian / Registrar** — **new entity-scoped role + capability flag on the G12 SR ledger** (`g12.sr.custodian`, mirrors the Document-Admin pattern; runs on the P05 substrate). The **checker** for any manual/correcting SR posting initiated via G04, the approver of historical digitisation batches, the **adjudicator of provisional migrated entries**, and the **signer of the pre-pension completeness certificate** (`g04.prepension.sign`).
- **HR Officer / HR Admin** — maps to existing **`hr_admin`** (RBAC §2.2 superset operational role); initiates manual reconciliation remediation and historical batch preparation (maker).
- **Pension Officer** — **new entity-scoped module-admin role** (analogous to **Payroll Admin**, RBAC §2.2); consumes qualifying-service flags and the pre-pension certificate; read access to impact reports; **MFA required** (high-privilege statutory role, Platform §3.1).
- **Auditor (read-only)** — **mapped to existing Org-Admin audit access + a time-bound read-only entitlement** (RBAC §3.2; P05 `Audit.query`/`Audit.export`). **No** parallel "Auditor" role with write capability. Full read on all G04 ledgers, findings, conformance runs, certificates, and the audit trail.
- **System Administrator** — **mapped to Org Admin / Platform Super Admin** (RBAC §2.1). Manages the event-mapping catalog versions (via W.2 forms + maker), retry/SLA/lease/reaper configuration (config cascade), `JOB-G04-*` schedules, and registers G12 port conformance runs; **no transactional self-approval**; cannot resolve own DLQ items into SR.
- **Employee (Self-Service)** — existing **Employee** role, *indirect only*: sees the SR-reflected status of their own leave through G12's employee view; no direct G04 access. PII ceiling applies.

All new roles/flags are **registered in RBAC §2.2/§4.3** via the working-group process (RBAC §14); the **PII Protection Ceiling overrides everything upward** (RBAC §6).

### 3.2 Permission matrix (enforced by P02 `Authorization.check`)

| Capability / Action | Employee | HR Officer (`hr_admin`) | IntegOps | SR Custodian | Pension Officer | Auditor (Org-Admin read + entitlement) | Sys Admin (Org/Platform Admin) |
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
| Register/run G12 port conformance test | — | — | propose | R | — | R | ✔ |
| Prepare historical batch (maker) | — | ✔ | ✔ | — | — | — | — |
| Approve/promote historical batch (checker) | — | — | — | ✔ | — | — | — |
| Adjudicate provisional migrated entry | — | propose | — | ✔ | R | R | — |
| Issue/sign pre-pension certificate | — | — | propose | ✔ (sign) | R | R | — |
| Hard-gate qualifying-service change post-pension-start | — | maker | maker | checker | initiate | R | — |
| Export audit evidence pack (P05 `Audit.export`) | — | R | R | R | R | ✔ | R |

Legend: ✔ = perform; R = read; R/W (ack) = read + acknowledge alerts; — = no access. Every ✔ that writes to the statutory SR enforces **maker ≠ checker** via **P01** and is captured by the **P05** DB-trigger. `Authorization.check` resolution order applies: deny-by-default → role grant → multi-role intersection → entitlement → capability flag → PII ceiling → scope filter → field mask.

---

## Section 4 — Shared Application Foundation (platform-grounded)

This module **consumes** the PrimeSoft platform contracts by id (Platform §5; Foundation §1) and adds only integration-specific posture. It does **not** re-author any engine.

- **Architecture & runtime.** G04 specifies **behaviour and NFR**, not framework (reconciliation §C). The operational **monitoring/triage console** is a web surface meeting the canonical UI-state standard (Foundation §3) and WCAG 2.1 AA; REST management APIs sit under **`/api/v1`** (Foundation §1). The **posting relay, reaper, reconciliation, integrity, and conformance** sweeps are **background jobs registered on the X.1 runner** (not a bespoke scheduler), each claiming work **per-partition (per `employee_id`/lineage) in-order**. The primary datastore holds the G04-owned entities (outbox, posting log, reconciliation log, DLQ, mappings, partition leases, conformance runs, certificates); the message substrate is the **DB-backed transactional outbox** drained by `JOB-G04-RELAY`.
- **Background jobs (X.1; Foundation §4).** Each G04 job registers `{ job_id, schedule(cron/tz), tenant_scope }` against the runner and inherits the **shared runner standard**: idempotent (per-period run key), **retry exponential backoff ×3**, **per-tenant isolation**, period lock where it mutates balances/closes a period, run audit row, and terminal failure → **`JOB-FAIL` → `MSG-SYS-JOBFAIL`** to the owning-module admin + platform ops. Registered jobs (cadence/logic in this module FS; index in Foundation §4):

  | Job id | Purpose | Cadence (module FS) |
  |---|---|---|
  | `JOB-G04-RELAY` | Drain outbox → post to G12 (per-partition, in-order) | frequent (e.g. every 1–2 min) |
  | `JOB-G04-REAPER` | Recover stranded `IN_FLIGHT` (expired lease) → retry-eligible (FR-15) | ≤ 2 min |
  | `JOB-G04-RECON` | State-aware reconciliation (full daily / incremental hourly, FR-06) | daily + hourly |
  | `JOB-G04-INTEGRITY` | Source-ledger ↔ outbox integrity + signature verify (FR-17) | ≥ daily |
  | `JOB-G04-CONFORMANCE` | Scheduled G12 port conformance probe (FR-16) | on contract change + scheduled |
  | `JOB-G04-DLQ-SLA` | DLQ aging / tiered-SLA breach evaluation → X.2 alerts | hourly |

- **Outbound integration (X.3).** All calls to the **G12 SR write port** and SR read API run on the **X.3 integration framework**: **circuit-breaking** (this supersedes the v2 "optional Phase-2 breaker" — it is platform-provided), **idempotency of outbound calls** (the `dedupe_key` is the outbound `Idempotency-Key`), **payload versioning** (SR payload schema version negotiated per FR-16 contract), and **per-integration error mapping** (G12 fault codes → `ERR-G04-*`). Credentials are sourced from **P04 `integration_credentials`** (encrypted, rotated, per-integration scoped).
- **Auth (P02; Platform §0.2, §3.1).** Bearer-token (JWT) session carries resolved roles + tenant/entity scope; permissions resolved **per request** by `Authorization.check`. OIDC/SSO + MFA (MFA mandatory for high-privilege statutory roles — SR Custodian, Pension Officer). The G12 write port is called with a **service principal** holding append-only SR-write scope and audited.
- **Capture integrity (R17, AI-18).** The G03 capture payload is **HMAC-signed**; G04 verifies the signature before posting and rejects unsigned/forged payloads (`ERR-G04-SIGNATURE-INVALID`). Only the G03 source principal holds `g04.outbox.write`; FR-17 (`JOB-G04-INTEGRITY`) reconciles the outbox against the G03 ledger as an independent integrity check; signature-mismatch events go to `security_audit_log` (P05).
- **Audit (P05).** Every mutation on a G04 business table fires the **platform DB-trigger** writing one immutable `audit_log` row (PII masked); auth/permission events go to `security_audit_log`. G04 defines no `audit_log`; reading an audit row is itself audited; retention ≥ 7 years; tamper-evidence tracks **OPEN-PLAT-03** (hash-chaining) rather than a parallel mechanism.
- **Canonical error envelope (Foundation §1; reconciliation §C).**

  ```json
  { "error": { "code": "VALIDATION_FAILED", "message": "…", "field": "…", "details": { } } }
  ```

  2xx returns the resource; the correlation id is carried in the **`X-Correlation-Id` response header**, not a body `requestId`.
- **Standard error codes (Foundation §1.2).** `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500). No 503 in the standard table — upstream G12 unavailability is handled by **X.3 mapping + retry**, surfaced as `PRECONDITION_FAILED` (gate not met) or `INTERNAL` + `ERR-LOADFAIL` to UI. Module-unique codes are `ERR-G04-*` (§8.2), registered in the Foundation catalogue.
- **Validation (Foundation §2/§7).** Cite shared `VAL-*` ids (`VAL-EFFECTIVE`, `VAL-DATE`, `VAL-ENUM`, `VAL-COMMENT`, `VAL-FILE`, `VAL-REQUIRED`, `VAL-MASTER-UNIQUE`); author only module-unique `VAL-G04-*` and register in Foundation §2:

  | Id | Rule |
  |---|---|
  | `VAL-G04-DEDUPE` | `dedupe_key` derivation is deterministic + mapping-version-independent |
  | `VAL-G04-LINEAGE` | every captured/posted row carries a non-null `leave_spell_lineage_id` |
  | `VAL-G04-MAPCOVER` | one PUBLISHED mapping per `(leave_type_code, event_type)` effective at a date; no overlap |
  | `VAL-G04-CITATION` | `statutory_rule_ref` NOT NULL for every `POST_SR` mapping |
  | `VAL-G04-ORDER` | correction not posting-eligible until original `POSTED` |
  | `VAL-G04-SIG` | outbox `payload_signature` HMAC verifies |
  | `VAL-G04-CONFORM` | live-posting gate requires a PASS `port_conformance_run` (retention ≥ 2557d) |

- **Idempotency & pagination (Foundation §1).** Unsafe POSTs accept `Idempotency-Key` (24h replay → `CONFLICT`); SR writes additionally carry the **mapping-version-independent `dedupe_key`** as the X.3 outbound key (G12-persisted ≥7y). Lists use **cursor pagination** (`limit` default 25 / max 100, `next_cursor`).
- **Effective-dating & config cascade (Platform §0.3, §3.3).** Mapping & integration-config changes are **versioned**, validated on save, follow the cascade `platform default → tenant → entity → employee`, and **in-flight instances continue on the version they started with** (in-flight version pinning — directly reused for `pinned_mapping_version`).
- **Observability (Platform §0.5).** Structured logs with `X-Correlation-Id` + `leave_spell_lineage_id` threaded end-to-end; metrics (lag, throughput, DLQ depth, reaped-in-flight, recon pending/quarantined buckets, error rate, X.3 breaker state, conformance result) exported to **G14**.
- **Security/compliance.** OWASP ASVS; TLS 1.2+; encryption at rest; **DPDP Act 2023** alignment (leave reason categories may be sensitive — PII minimisation: G04 carries only SR-relevant fields, never medical detail); statutory retention; PII masked in audit per RBAC tiers.
- **NFR baseline (Vision §2.9; BRD §7 — reconciliation §C override).** Standard API p95 < 500 ms @ 300 concurrent; read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; **uptime 99.5%/month**; **RTO < 4 h · RPO < 1 h**; audit completeness 100%; WCAG 2.1 AA; relay P95 posting lag ≤ 5 min. Throughput right-sized in §9.

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| E1 | `employees` | Referenced | **G01** (≈ PrimeSoft M01) | Employee master; subject of SR entries; carries `service_no`, `cadre`, `pay_scale` (gov additions) |
| E2 | `service_register_events` | Referenced (written via G12 port) | **G12** (net-new ledger on **P05**) | Append-only statutory SR ledger (target); P05 DB-trigger captured, immutable; carries `dedupe_key`, `correlationId`, `leave_spell_lineage_id` |
| E3 | `audit_log` / `security_audit_log` | Referenced | **P05** | Immutable dual audit trail (DB-trigger); G04 appends nothing custom |
| E4 | `notifications` | Referenced | **X.2** | Outbound notifications (templates `MSG-G04-*` by id) |
| E5 | `documents` | Referenced | **G13** (≈ PrimeSoft M11) | Legacy scan provenance for digitisation |
| E6 | `workflows` / `workflow_instances` / `workflow_actions` | Referenced | **P01** | Maker-checker for manual SR writes / batches / post-pension gates (SoD by P01/P02) |
| E7 | `leave_ledger_entries` | Source (read-only) | **G03** (≈ PrimeSoft M04/M05) | Approved/cancelled/amended leave spells; issues `leave_spell_lineage_id` |
| E7b | `integration_credentials` / `migration_runs` | Referenced | **P04** / **P06** | G12 port credentials; legacy-migration ledger |
| **E8** | **`leave_event_outbox`** | **G04-owned** | G04 | Transactional outbox of leave domain events (signed, lineage-keyed, leased) |
| **E9** | **`sr_event_mapping`** | **G04-owned** | G04 | Versioned mapping: leave type/spell → SR entry type **or `EXCLUDED_NON_SR`** + rules + statutory citation |
| **E10** | **`sr_posting_log`** | **G04-owned** | G04 | Append-only record of every posting attempt & outcome |
| **E11** | **`sr_dead_letter`** | **G04-owned** | G04 | Quarantined poison events awaiting resolution |
| **E12** | **`reconciliation_run`** | **G04-owned** | G04 | A reconciliation execution header |
| **E13** | **`reconciliation_finding`** | **G04-owned** | G04 | A single drift/mismatch finding + remediation state |
| **E14** | **`sr_correction_link`** | **G04-owned** | G04 | Links a correcting/reversing SR entry to its original |
| **E15** | **`historical_leave_batch`** | **G04-owned** | G04 | Digitisation batch header (legacy leave load; runs on P06) |
| **E16** | **`historical_leave_record`** | **G04-owned** | G04 | A staged legacy leave record (confidence/adjudication; `<gov>_source_id`) |
| **E17** | **`integration_config`** | **G04-owned** | G04 | Retry/SLA/lease/scheduler settings (effective-dated, config cascade) |
| **E18** | **`relay_partition_lease`** | **G04-owned** | G04 | Per-partition (employee/lineage) in-order processing lease |
| **E19** | **`port_conformance_run`** | **G04-owned** | G04 | G12 SR write-port bilateral-contract conformance test result |
| **E20** | **`capture_integrity_finding`** | **G04-owned** | G04 | Source-ledger ↔ outbox integrity finding |
| **E21** | **`prepension_certificate`** | **G04-owned** | G04 | Signed, checksummed pre-pension completeness certificate |

> G04 introduces **14 owned entities** (E8–E21) — **each carrying non-null `tenant_id` and (where entity-scoped) `entity_id`** with data-layer scoping — and **references** platform/sibling-module entities (E1–E7b). It does **not** define `service_register_events`, `audit_log`, `notifications`, `workflow_*`, `documents`, `integration_credentials`, or `migration_runs` (platform-provided / sibling-owned).

### 5.2 Field tables (G04-owned entities) + sample data

> **Common columns (all E8–E21):** `tenant_id` UUID NOT NULL, `entity_id` UUID (NOT NULL where entity-scoped) — both enforced at the data layer (Platform §0.1); standard audit columns are captured by the **P05 DB-trigger**, not redefined per entity.

#### E8 — `leave_event_outbox`

| Field | Type | Null | Notes |
|---|---|---|---|
| `outbox_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | Data-layer scoped |
| `correlation_id` | UUID | N | Stable id of the leave domain event (= `X-Correlation-Id`) |
| `leave_spell_lineage_id` | UUID | N | G03-issued, stable across approve/amend/cancel; primary join key |
| `event_sequence` | int | N | Monotonic within lineage (approve=1, amend=2, …) |
| `employee_id` | UUID FK→`employees` (G01) | N | Subject; default `partition_key` |
| `partition_key` | varchar(64) | N | Serialisation key (default = employee_id) for in-order claiming |
| `leave_ledger_entry_id` | UUID FK→`leave_ledger_entries` (G03) | N | Source spell |
| `event_type` | enum | N | LEAVE_APPROVED / LEAVE_CANCELLED / LEAVE_AMENDED |
| `leave_type_code` | varchar(32) | N | EL, HPL, LWP, EOL, STUDY, MATERNITY, CASUAL … |
| `spell_start` / `spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | Calendar/qualifying day count from G03 |
| `prior_outbox_id` | UUID | Y | Original for amendments/cancellations |
| `payload` | jsonb | N | Frozen snapshot of source fields |
| `payload_signature` | varchar(128) | N | HMAC of payload signed by G03 capture key (R17) |
| `dedupe_key` | varchar(128) | Y | `hash(lineage:event_type:event_sequence)`; mapping-version-independent; = X.3 outbound `Idempotency-Key` |
| `pinned_mapping_version` | int | Y | Resolved once at first claim (in-flight version pinning) |
| `status` | enum | N | PENDING / BLOCKED_AWAITING_ORIGINAL / IN_FLIGHT / POSTED / FAILED / DEAD_LETTERED / EXCLUDED |
| `claimed_at` | timestamptz | Y | Lease start |
| `lease_expires_at` | timestamptz | Y | Visibility timeout; reaper recovers expired IN_FLIGHT |
| `available_at` | timestamptz | N | Earliest relay pick (backoff) |
| `attempt_count` | int | N | Default 0 |
| `created_at` / `created_by` | std | | Source service principal (`g04.outbox.write`) |

*Append-only intent: rows are status-updated by the relay/reaper; never deleted. All mutations captured by P05 DB-trigger.*

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
| `tenant_id` / `entity_id` | UUID | N | Config cascade-scoped |
| `mapping_version` | int | N | Monotonic per ruleset (in-flight pinning) |
| `leave_type_code` | varchar(32) | N | Match key |
| `event_type` | enum | N | APPROVED/CANCELLED/AMENDED |
| `spell_predicate` | jsonb | Y | e.g. days_count ≥ 120 ⇒ LONG_LEAVE |
| `disposition` | enum | N | POST_SR / EXCLUDED_NON_SR (R8) |
| `sr_entry_type` | varchar(48) | Y | Target G12-published `event_type_code` (verbatim: `EL_AVAILED`/`HPL_AVAILED`/`COMMUTED_LEAVE`/`STUDY_LEAVE`/`MATERNITY_LEAVE`/`LWP_SPELL`/`EOL_SPELL`); NULL when EXCLUDED |
| `qualifying_service_rule` | enum | Y | QUALIFYING / NON_QUALIFYING / PARTIAL / RULE_REF |
| `qualifying_rule_ref` | varchar(64) | Y | Statutory rule for PARTIAL |
| `statutory_rule_ref` | varchar(120) | N* | Citation (e.g. "CCS (Leave) Rules 1972 r.43"); **NOT NULL for POST_SR** (`VAL-G04-CITATION`) |
| `straddle_handling` | enum | N | SPLIT_BY_EFFECTIVE / PIN_TO_SPELL_START (R16) |
| `annotation_template` | text | Y | Statutory annotation template |
| `effective_from` | date | N | `VAL-EFFECTIVE` |
| `effective_to` | date | Y | Null = open |
| `status` | enum | N | DRAFT / PUBLISHED / RETIRED |
| `created_*`/`updated_*`/`is_deleted` | std | | Soft-delete on draft; P05 captured |

Sample data:

| mapping_id | ver | leave_type_code | event_type | disposition | sr_entry_type | qual_rule | statutory_rule_ref | status |
|---|---|---|---|---|---|---|---|---|
| m1…01 | 3 | EL | APPROVED | POST_SR | EL_AVAILED | QUALIFYING | CCS(Leave) r.26 | PUBLISHED |
| m1…02 | 3 | LWP | APPROVED | POST_SR | LWP_SPELL | NON_QUALIFYING | CCS(Leave) r.43-A | PUBLISHED |
| m1…03 | 3 | CASUAL | APPROVED | EXCLUDED_NON_SR | — | — | Casual leave non-SR (admin) | PUBLISHED |

#### E10 — `sr_posting_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `posting_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `outbox_id` | UUID FK→`leave_event_outbox` | N | |
| `correlation_id` | UUID | N | |
| `leave_spell_lineage_id` | UUID | N | G03 business correlation key (persisted on the SR entry too) |
| `event_sequence` | int | N | |
| `source_module` | varchar(8) | N | Explicit provenance — always `"G04"` (G12 `allowed_source_modules` check) |
| `source_reference_id` | varchar(128) | N | Canonical dedup tuple member — `{leave_spell_lineage_id}:{event_type}` |
| `source_event_version` | int | N | Canonical dedup tuple member — = `event_sequence` (monotonic per lineage) |
| `fact_key` | varchar(128) | N | Semantic dedup; derived per the event type's `fact_correlation_rule` (G12 FR-01); required (else `SR_FACT_KEY_REQUIRED`) |
| `dedupe_key` | varchar(128) | N | X.3 outbound `Idempotency-Key` header value (mapping-version-independent); the persisted dedup contract is the tuple above |
| `mapping_id` | UUID FK→`sr_event_mapping` | N | Pinned version used |
| `sr_event_id` | UUID | Y | Returned by G12 on success |
| `sr_entry_type` | varchar(48) | N | G12-published `event_type_code` (e.g. `EL_AVAILED`, `LWP_SPELL`) |
| `attempt_no` | int | N | |
| `outcome` | enum | N | SUCCESS / RETRYABLE_FAILURE / PERMANENT_FAILURE / DUPLICATE_NOOP |
| `http_status` | int | Y | From G12 (mapped via X.3) |
| `error_code` | varchar(48) | Y | G12 or `ERR-G04-*` |
| `error_detail` | text | Y | |
| `latency_ms` | int | Y | |
| `posted_at` | timestamptz | N | |
| `posted_by` | varchar | N | Service principal or actor (manual) |

*Append-only.* Sample:

| posting_id | lineage_id | dedupe_key | sr_event_id | outcome | attempt_no | latency_ms |
|---|---|---|---|---|---|---|
| p…01 | lin…aa | k:linaa:APPR:1 | sr…77 | SUCCESS | 1 | 142 |
| p…02 | lin…bb | k:linbb:APPR:1 | — | RETRYABLE_FAILURE | 1 | 5012 |
| p…03 | lin…bb | k:linbb:APPR:1 | sr…78 | DUPLICATE_NOOP | 3 | 88 |

#### E11 — `sr_dead_letter`

| Field | Type | Null | Notes |
|---|---|---|---|
| `dlq_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `outbox_id` | UUID FK | N | |
| `correlation_id` | UUID | N | |
| `leave_spell_lineage_id` | UUID | N | |
| `failure_class` | enum | N | MAPPING_MISSING / VALIDATION_REJECT / UPSTREAM_DOWN / DATA_CONFLICT / SIGNATURE_INVALID / UNKNOWN |
| `last_error_code` | varchar(48) | N | |
| `last_error_detail` | text | Y | |
| `attempts_exhausted` | int | N | |
| `state` | enum | N | OPEN / IN_REVIEW / RESOLVED_REPLAYED / RESOLVED_DISCARDED |
| `assigned_to` | UUID | Y | |
| `resolution_workflow_id` | UUID FK→`workflow_instances` (P01) | Y | Maker-checker for SR write |
| `resolution_note` | text | Y | |
| `created_*`/`updated_*` | std | | |

Sample:

| dlq_id | lineage_id | failure_class | last_error_code | state | attempts_exhausted |
|---|---|---|---|---|---|
| d…01 | lin…dd | MAPPING_MISSING | ERR-G04-MAPPING-NOT-FOUND | OPEN | 5 |
| d…02 | lin…ee | UPSTREAM_DOWN | ERR-G04-SR-UNAVAILABLE | IN_REVIEW | 8 |
| d…03 | lin…ff | SIGNATURE_INVALID | ERR-G04-SIGNATURE-INVALID | OPEN | 1 |

#### E12 — `reconciliation_run`

| Field | Type | Null | Notes |
|---|---|---|---|
| `run_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `run_type` | enum | N | SCHEDULED / ON_DEMAND / PRE_PENSION / SOURCE_OUTBOX_INTEGRITY |
| `scope` | jsonb | N | org_unit, date range, employee set |
| `leave_records_examined` | int | N | |
| `sr_entries_examined` | int | N | |
| `pending_excluded_count` | int | N | Legitimately PENDING/backoff/blocked/DEAD_LETTERED excluded from MISSING (R6) |
| `findings_count` | int | N | |
| `status` | enum | N | RUNNING / COMPLETED / FAILED |
| `started_at` / `completed_at` | timestamptz | N/Y | |
| `triggered_by` | UUID | Y | Null for scheduled (X.1 job) |

Sample:

| run_id | run_type | leave_examined | sr_examined | pending_excluded | findings | status |
|---|---|---|---|---|---|---|
| r…01 | SCHEDULED | 12840 | 12835 | 4 | 1 | COMPLETED |
| r…02 | PRE_PENSION | 41 | 41 | 0 | 0 | COMPLETED |
| r…03 | SOURCE_OUTBOX_INTEGRITY | 12840 | — | — | 0 | COMPLETED |

#### E13 — `reconciliation_finding`

| Field | Type | Null | Notes |
|---|---|---|---|
| `finding_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `run_id` | UUID FK→`reconciliation_run` | N | |
| `employee_id` | UUID FK→`employees` | N | |
| `correlation_id` | UUID | Y | |
| `leave_spell_lineage_id` | UUID | Y | Primary match key; chains resolved before diffing |
| `finding_type` | enum | N | MISSING_SR / DUPLICATE_SR / DIVERGENT_FIELD / ORPHAN_CORRECTION / UNMAPPED_LEAVE / CORRECTION_WITHOUT_LINK |
| `severity` | enum | N | LOW / MEDIUM / HIGH / CRITICAL |
| `leave_snapshot` / `sr_snapshot` | jsonb | Y | Source / net-effective target |
| `divergent_fields` | jsonb | Y | Field-level diff |
| `remediation_state` | enum | N | OPEN / REMEDIATION_PROPOSED / APPROVED / APPLIED / WAIVED |
| `remediation_workflow_id` | UUID FK→`workflow_instances` (P01) | Y | |
| `created_*`/`updated_*` | std | | |

Sample:

| finding_id | finding_type | severity | lineage_id | remediation_state |
|---|---|---|---|---|
| f…01 | MISSING_SR | HIGH | lin…12 | OPEN |
| f…02 | DUPLICATE_SR | CRITICAL | lin…34 | REMEDIATION_PROPOSED |
| f…03 | CORRECTION_WITHOUT_LINK | HIGH | lin…56 | OPEN |

#### E14 — `sr_correction_link`

| Field | Type | Null | Notes |
|---|---|---|---|
| `link_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `original_sr_event_id` | UUID FK→`service_register_events` (G12) | N | Entry being corrected/reversed |
| `correcting_sr_event_id` | UUID FK→`service_register_events` (G12) | N | New append-only entry |
| `leave_spell_lineage_id` | UUID | N | Recoverable from G12-stored lineage (R9) |
| `correction_type` | enum | N | REVERSAL / AMENDMENT / SUPERSEDE |
| `reason_code` | varchar(48) | N | LEAVE_CANCELLED / LEAVE_AMENDED / RECON_FIX / MIGRATION_FIX |
| `correlation_id` | UUID | Y | |
| `created_*` | std | | Append-only |

Sample:

| link_id | correction_type | reason_code | lineage_id | original→correcting |
|---|---|---|---|---|
| l…01 | REVERSAL | LEAVE_CANCELLED | lin…aa | sr…77 → sr…90 |
| l…02 | AMENDMENT | LEAVE_AMENDED | lin…bb | sr…78 → sr…91 |
| l…03 | SUPERSEDE | RECON_FIX | lin…cc | sr…80 → sr…92 |

#### E15 — `historical_leave_batch` *(runs on P06 ETL+V)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `batch_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `batch_label` | varchar(120) | N | |
| `source_type` | enum | N | PAPER_SCAN / LEGACY_SYSTEM / SPREADSHEET |
| `source_document_id` | UUID FK→`documents` (G13) | Y | Provenance |
| `migration_run_id` | UUID FK→`migration_runs` (P06) | Y | P06 ledger linkage |
| `records_total`/`records_valid`/`records_rejected` | int | N | |
| `status` | enum | N | STAGED / VALIDATED / APPROVED / POSTED / PARTIALLY_POSTED / REJECTED |
| `approval_workflow_id` | UUID FK→`workflow_instances` (P01) | Y | |
| `created_*`/`updated_*` | std | | |

Sample:

| batch_id | batch_label | source_type | records_total | records_valid | status |
|---|---|---|---|---|---|
| b…01 | Office-X legacy 1995-2010 | PAPER_SCAN | 1450 | 1438 | VALIDATED |
| b…02 | Legacy HRMS dump 2011-2018 | LEGACY_SYSTEM | 9802 | 9790 | POSTED |
| b…03 | Spreadsheet Dept-Y | SPREADSHEET | 230 | 198 | PARTIALLY_POSTED |

#### E16 — `historical_leave_record`

| Field | Type | Null | Notes |
|---|---|---|---|
| `record_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `batch_id` | UUID FK→`historical_leave_batch` | N | |
| `employee_id` | UUID FK→`employees` | Y | Resolved during validation |
| `leave_spell_lineage_id` | UUID | Y | Deterministically derived (migrated identity) |
| `gov_source_id` | varchar(64) | N | **P06 traceability** (`<gov>_source_id` pattern, reconciliation §C) |
| `service_no_raw` | varchar(64) | N | As-keyed; resolved to employee_id |
| `leave_type_code` | varchar(32) | N | Mapped from legacy code |
| `spell_start`/`spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | |
| `qualifying_flag` | enum | Y | Derived via mapping |
| `statutory_rule_ref` | varchar(120) | Y | Mandatory before posting a qualifying migrated entry (R15) |
| `confidence` | enum | N | HIGH / MEDIUM / LOW |
| `adjudication_state` | enum | N | PROVISIONAL / ADJUDICATED_CONFIRMED / ADJUDICATED_REJECTED |
| `validation_state` | enum | N | PENDING / VALID / REJECTED |
| `reject_reason` | varchar(120) | Y | |
| `posted_sr_event_id` | UUID | Y | After posting |
| `created_*` | std | | |

Sample:

| record_id | service_no_raw | leave_type_code | confidence | adjudication_state | validation_state |
|---|---|---|---|---|---|
| h…01 | EMP-1995-1123 | EL | HIGH | ADJUDICATED_CONFIRMED | VALID |
| h…02 | EMP-2001-0457 | LWP | LOW | PROVISIONAL | VALID |
| h…03 | EMP-9999-XXXX | STUDY | LOW | PROVISIONAL | REJECTED |

#### E17 — `integration_config` *(effective-dated; config cascade platform→tenant→entity→employee)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `config_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `key` | varchar(64) | N | max_retries, backoff_base_ms, lease_timeout_ms, reaper_interval_ms, posting_sla_minutes, x3_breaker_threshold, live_posting_gate |
| `value` | jsonb | N | |
| `effective_from` | timestamptz | N | |
| `effective_to` | timestamptz | Y | |
| `updated_by` | varchar | N | |
| `created_*`/`updated_*` | std | | |

Sample:

| config_id | key | value | effective_from |
|---|---|---|---|
| cfg…01 | max_retries | 8 | 2026-01-01 |
| cfg…02 | lease_timeout_ms | 120000 | 2026-01-01 |
| cfg…03 | live_posting_gate | closed | 2026-01-01 |

#### E18 — `relay_partition_lease` *(R5/AI-7)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `lease_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `partition_key` | varchar(64) | N | Unique active lease per partition |
| `owner_worker_id` | varchar(64) | N | X.1 job instance holding the partition |
| `acquired_at` / `lease_expires_at` | timestamptz | N | Visibility timeout; reaper reclaims expired |
| `last_processed_sequence` | int | Y | Highest in-order `event_sequence` processed |
| `status` | enum | N | ACTIVE / RELEASED / EXPIRED |
| `created_*`/`updated_*` | std | | |

Sample:

| lease_id | partition_key | owner_worker_id | last_processed_seq | status |
|---|---|---|---|---|
| pl…01 | emp-12 | relay-a-7 | 2 | ACTIVE |
| pl…02 | emp-34 | relay-b-3 | 1 | ACTIVE |
| pl…03 | emp-56 | relay-a-7 | 5 | EXPIRED |

#### E19 — `port_conformance_run` *(R2/AI-3)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `conformance_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `contract_version` | varchar(32) | N | G12 port contract version (X.3 payload version) |
| `dedupe_retention_days` | int | N | Must be ≥ 2557 (≈7y; aligns to P05 ≥7-yr) |
| `indexes_verified` | jsonb | N | `{dedupe_key:true, correlationId:true, lineage:true}` |
| `append_only_verified` | boolean | N | UPDATE/DELETE rejected (intrinsic to P05 substrate) |
| `dedupe_replay_verified` | boolean | N | Repeat post at horizon returns original sr_event_id |
| `result` | enum | N | PASS / FAIL |
| `evidence_checksum` | varchar(64) | N | SHA-256 of evidence bundle |
| `run_at` / `run_by` | timestamptz / varchar | N | CI principal / Sys Admin / `JOB-G04-CONFORMANCE` |

Sample:

| conformance_id | contract_version | dedupe_retention_days | result | run_at |
|---|---|---|---|---|
| pc…01 | 1.0 | 2557 | PASS | 2026-06-25 |
| pc…02 | 1.0 | 365 | FAIL | 2026-06-20 |
| pc…03 | 1.1 | 2922 | PASS | 2026-06-29 |

#### E20 — `capture_integrity_finding` *(R7/R17/AI-4/AI-18)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `integrity_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `run_id` | UUID FK→`reconciliation_run` | N | A SOURCE_OUTBOX_INTEGRITY run |
| `employee_id` | UUID FK→`employees` | N | |
| `leave_ledger_entry_id` | UUID | Y | G03 ledger row |
| `leave_spell_lineage_id` | UUID | Y | |
| `finding_type` | enum | N | LEDGER_WITHOUT_OUTBOX / OUTBOX_WITHOUT_LEDGER / SIGNATURE_MISMATCH |
| `severity` | enum | N | LOW / MEDIUM / HIGH / CRITICAL |
| `state` | enum | N | OPEN / BACKFILLED / WAIVED |
| `detail` | jsonb | Y | |
| `created_*`/`updated_*` | std | | SIGNATURE_MISMATCH also → `security_audit_log` (P05) |

Sample:

| integrity_id | finding_type | severity | state | lineage_id |
|---|---|---|---|---|
| ci…01 | LEDGER_WITHOUT_OUTBOX | HIGH | BACKFILLED | lin…77 |
| ci…02 | SIGNATURE_MISMATCH | CRITICAL | OPEN | lin…78 |
| ci…03 | OUTBOX_WITHOUT_LEDGER | MEDIUM | WAIVED | lin…79 |

#### E21 — `prepension_certificate` *(AI-21)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `certificate_id` | UUID PK | N | |
| `tenant_id` / `entity_id` | UUID | N | |
| `employee_id` | UUID FK→`employees` | N | Retiring employee |
| `run_id` | UUID FK→`reconciliation_run` | N | The PRE_PENSION run certified |
| `open_high_critical_findings` | int | N | Must be 0 for PASS |
| `total_non_qualifying_days` | numeric(8,1) | N | Net from SR leave entries |
| `lineage_complete` | boolean | N | All lineages resolvable |
| `provisional_entries_remaining` | int | N | Must be 0 for PASS |
| `result` | enum | N | PASS / FAIL |
| `checksum` | varchar(64) | N | SHA-256 over evidence bundle |
| `signed_by` | UUID | N | SR Custodian signer (`g04.prepension.sign`) |
| `signed_at` | timestamptz | N | |
| `consumed_by_g11_at` | timestamptz | Y | When G11 gated on it |

Sample:

| certificate_id | employee_id | open_hc_findings | non_qual_days | provisional_remaining | result |
|---|---|---|---|---|---|
| cert…01 | emp…12 | 0 | 121.0 | 0 | PASS |
| cert…02 | emp…34 | 2 | 45.0 | 1 | FAIL |
| cert…03 | emp…56 | 0 | 0.0 | 0 | PASS |

### 5.3 Relationship map

```
employees (G01) 1───* leave_ledger_entries (G03) 1───1 leave_event_outbox (G04)   [lineage_id, signed payload, tenant_id]
leave_event_outbox  ──claim──► relay_partition_lease (per partition, in-order)
leave_event_outbox 1───* sr_posting_log ──X.3 call──► service_register_events (G12 on P05)  [dedupe_key, lineage on SR]
leave_event_outbox 1───0..1 sr_dead_letter
sr_event_mapping (versioned, cited, disposition) ──used-by──► sr_posting_log
reconciliation_run 1───* reconciliation_finding   (lineage-keyed; pending/quarantined excluded)
reconciliation_run(SOURCE_OUTBOX_INTEGRITY) 1───* capture_integrity_finding ──► leave_ledger_entries (G03)
service_register_events ◄──original── sr_correction_link ──correcting──► service_register_events  [lineage recoverable]
historical_leave_batch (P06) 1───* historical_leave_record (confidence/adjudication) ──posts──► service_register_events (G12)
reconciliation_run(PRE_PENSION) 1───1 prepension_certificate ──gate-input──► G11
port_conformance_run ──gates──► live posting enablement (G12 contract via X.3)
documents (G13) ◄──provenance── historical_leave_batch
workflows/workflow_instances/workflow_actions (P01) ──governs──► dlq resolution, recon remediation, historical promotion, manual corrections, post-pension qualifying gate
audit_log / security_audit_log (P05, DB-trigger) ◄──captures── every G04 state change
notifications (X.2) ◄──MSG-G04-*── alerts/SLA breach/reaped/conformance/signature
```

### 5.4 Ownership / reuse matrix

| Entity | Owner | G04 access | Written by G04? |
|---|---|---|---|
| employees | G01 (≈ M01) | Read | No |
| leave_ledger_entries (+ lineage_id) | G03 (≈ M04/M05) | Read | No (consumes events) |
| service_register_events | G12 (on P05) | Write via X.3 port + Read | Yes (append-only, via G12 port) |
| audit_log / security_audit_log | P05 | DB-trigger capture | No (platform-captured) |
| notifications | X.2 | Append via `MSG-G04-*` | Yes (via X.2) |
| documents | G13 (≈ M11) | Read | No |
| workflows/instances/actions | P01 | Start/advance/approve | Yes (via P01) |
| integration_credentials / migration_runs | P04 / P06 | Read / write run | Via P04/P06 |
| leave_event_outbox … prepension_certificate (E8–E21) | G04 | Full (tenant-scoped) | Yes |

### 5.5 Enum catalog

| Enum | Values |
|---|---|
| `outbox.event_type` | LEAVE_APPROVED, LEAVE_CANCELLED, LEAVE_AMENDED |
| `outbox.status` | PENDING, BLOCKED_AWAITING_ORIGINAL, IN_FLIGHT, POSTED, FAILED, DEAD_LETTERED, EXCLUDED |
| `mapping.disposition` | POST_SR, EXCLUDED_NON_SR |
| `mapping.qualifying_service_rule` | QUALIFYING, NON_QUALIFYING, PARTIAL, RULE_REF |
| `mapping.straddle_handling` | SPLIT_BY_EFFECTIVE, PIN_TO_SPELL_START |
| `mapping.status` | DRAFT, PUBLISHED, RETIRED |
| `posting.outcome` | SUCCESS, RETRYABLE_FAILURE, PERMANENT_FAILURE, DUPLICATE_NOOP |
| `dlq.failure_class` | MAPPING_MISSING, VALIDATION_REJECT, UPSTREAM_DOWN, DATA_CONFLICT, SIGNATURE_INVALID, UNKNOWN |
| `dlq.state` | OPEN, IN_REVIEW, RESOLVED_REPLAYED, RESOLVED_DISCARDED |
| `recon.run_type` | SCHEDULED, ON_DEMAND, PRE_PENSION, SOURCE_OUTBOX_INTEGRITY |
| `recon.finding_type` | MISSING_SR, DUPLICATE_SR, DIVERGENT_FIELD, ORPHAN_CORRECTION, UNMAPPED_LEAVE, CORRECTION_WITHOUT_LINK |
| `recon.severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `recon.remediation_state` | OPEN, REMEDIATION_PROPOSED, APPROVED, APPLIED, WAIVED |
| `correction.type` | REVERSAL, AMENDMENT, SUPERSEDE |
| `correction.reason_code` | LEAVE_CANCELLED, LEAVE_AMENDED, RECON_FIX, MIGRATION_FIX |
| `batch.source_type` | PAPER_SCAN, LEGACY_SYSTEM, SPREADSHEET |
| `batch.status` | STAGED, VALIDATED, APPROVED, POSTED, PARTIALLY_POSTED, REJECTED |
| `hist_record.validation_state` | PENDING, VALID, REJECTED |
| `hist_record.confidence` | HIGH, MEDIUM, LOW |
| `hist_record.adjudication_state` | PROVISIONAL, ADJUDICATED_CONFIRMED, ADJUDICATED_REJECTED |
| `partition_lease.status` | ACTIVE, RELEASED, EXPIRED |
| `conformance.result` | PASS, FAIL |
| `integrity.finding_type` | LEDGER_WITHOUT_OUTBOX, OUTBOX_WITHOUT_LEDGER, SIGNATURE_MISMATCH |
| `integrity.state` | OPEN, BACKFILLED, WAIVED |
| `certificate.result` | PASS, FAIL |

### 5.6 Data integrity rules

1. **Outbox uniqueness:** `(tenant_id, leave_spell_lineage_id, event_sequence)` is unique — one outbox row per logical event occurrence; `(correlation_id, event_type)` is a secondary guard. Lineage+sequence is the canonical identity.
2. **Dedupe determinism, mapping-version-independent (R4):** `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]` is the **X.3 outbound `Idempotency-Key`** header value. The **persisted dedup contract is G12's canonical tuple `(source_module="G04", source_reference_id={leave_spell_lineage_id}:{event_type}, source_event_version=event_sequence)`** plus the mandatory semantic `fact_key` (per the type's `fact_correlation_rule`); G12 dedupes + persists the tuple, `fact_key`, and `leave_spell_lineage_id` (≥7y). A repeat returns `DUPLICATE_NOOP` with the original `sr_event_id`. `mapping_version` is **excluded** from all dedup identity; an intentional remap is an explicit **correction** (FR-08), never a silently-new post (`VAL-G04-DEDUPE`).
3. **Pinned mapping version (R4):** `pinned_mapping_version` is resolved once at first claim and persisted (platform in-flight version pinning, §0.3); never recomputed across retries.
4. **Append-only ledgers:** `sr_posting_log`, `sr_correction_link`, `prepension_certificate`, and `service_register_events` (P05-immutable) are never updated/deleted; `leave_event_outbox` rows are status-mutated but never deleted; all mutations captured by the **P05 DB-trigger**.
5. **No hard SR edit:** G04 never issues UPDATE/DELETE on a `service_register_events` row (the P05 substrate rejects it); corrections are *new* entries linked via `sr_correction_link`.
6. **Mapping coverage & exclusion (R8; `VAL-G04-MAPCOVER`):** every `(leave_type_code, event_type)` reaching the relay must resolve to exactly one PUBLISHED mapping effective at the relevant date. A `POST_SR` with no resolvable target ⇒ DLQ `MAPPING_MISSING`; an `EXCLUDED_NON_SR` ⇒ outbox `EXCLUDED` (deliberate no-op, never DLQ'd). Absence of any mapping for an SR-affecting type ⇒ DLQ `MAPPING_MISSING` (never a silent drop).
7. **Correction integrity & linkage (R9):** a `LEAVE_CANCELLED`/`LEAVE_AMENDED` event must produce a correction referencing the original by lineage through the same outbox/idempotency machinery; `sr_correction_link` is recoverable from G12-stored lineage. An SR correction without a local link reconciles as `CORRECTION_WITHOUT_LINK`; an original that cannot be found raises `ORPHAN_CORRECTION`.
8. **Ordering guard (R5; `VAL-G04-ORDER`):** a correction is **not posting-eligible** until its original spell entry is `POSTED` (status `BLOCKED_AWAITING_ORIGINAL`). Events for one `partition_key` are processed in `event_sequence` order.
9. **Lease & reaper (R1):** a claimed row carries `claimed_at`/`lease_expires_at`; the reaper (`JOB-G04-REAPER`) returns expired `IN_FLIGHT` rows to retry-eligible, increments `attempt_count`, and emits an X.2 alert. No `IN_FLIGHT` row stranded beyond `lease_timeout`.
10. **Bounded retries:** `attempt_count ≤ max_retries (config)`; on exhaustion ⇒ `sr_dead_letter` + outbox `DEAD_LETTERED`. (This is per-event module logic; the X.1 runner additionally retries the *job* ×3.)
11. **Lineage threading (R3; `VAL-G04-LINEAGE`):** `leave_spell_lineage_id` is mandatory and immutable on outbox, posting log, DLQ, correction link, findings, every SR entry, and the certificate; primary join key. A captured event without lineage is rejected `ERR-G04-LINEAGE-MISSING`.
12. **Capture provenance (R17; `VAL-G04-SIG`):** every outbox row carries a valid `payload_signature`; invalid/missing ⇒ rejected (`ERR-G04-SIGNATURE-INVALID`) and recorded as `capture_integrity_finding` `SIGNATURE_MISMATCH` (+ `security_audit_log`).
13. **Provisional migrated entries (R15):** migrated SR entries with `confidence < HIGH` are `PROVISIONAL`, require a `statutory_rule_ref`, and are excluded from final pension computation until `ADJUDICATED_CONFIRMED`.
14. **Conformance gate (R2; `VAL-G04-CONFORM`):** live posting is enabled only when the latest `port_conformance_run` for the active contract version is `PASS` with `dedupe_retention_days ≥ 2557`.
15. **Effective-dated config/mapping:** only one PUBLISHED mapping version per `(leave_type_code, event_type)` may be effective at any date (`VAL-EFFECTIVE`); overlapping ranges rejected at publish.
16. **FK respect & tenancy:** all FKs reference existing, non-deleted rows; every G04 row carries a resolvable `tenant_id` (+ `entity_id` where entity-scoped); unscoped queries are rejected (Platform §0.1).

---

## Section 6 — Functional Requirements

> Each FR follows: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table. All FRs run on the platform services named in `## Alignment with PrimeSoft Platform`.

---

### FR-01 — Capture approved leave events via signed transactional outbox

- **ID:** FR-01
- **Module:** G04
- **Primary Role(s):** System (G03 source service principal), IntegOps (observe)
- **User Story:** *As the HRMS, when a leave application is approved (or cancelled/amended) in G03, I want the event captured durably and signed in the same transaction as the leave-ledger write — carrying a stable spell lineage — so that no leave event can ever be lost, forged, or untraceable before reaching the Service Register.*

**Description.** On a terminal leave decision in G03 (`LEAVE_APPROVED`, `LEAVE_CANCELLED`, `LEAVE_AMENDED`), an outbox row is written **atomically inside G03's database transaction** (decision D-1). The row carries the G03-issued `leave_spell_lineage_id`, a monotonic `event_sequence`, a frozen `payload` snapshot, an HMAC `payload_signature`, and `tenant_id`/`entity_id`. G04 reads the outbox; G03 never calls G12 directly. FR-17 (`JOB-G04-INTEGRITY`) independently reconciles outbox coverage against the G03 ledger. Every mutation is captured by the **P05 DB-trigger**.

**Acceptance Criteria.**
1. Every approved/cancelled/amended SR-affecting leave commit produces exactly one outbox row in the same DB transaction (no committed leave decision without an outbox row; inverse checked by FR-17).
2. If the transaction rolls back, neither the ledger nor the outbox row persists.
3. The outbox `payload` is an immutable snapshot; subsequent edits to the source spell do not mutate it.
4. `(tenant_id, leave_spell_lineage_id, event_sequence)` uniqueness is enforced; duplicate emission is a no-op.
5. New rows default to `status=PENDING` (or `BLOCKED_AWAITING_ORIGINAL` for a correction whose original is not yet POSTED), `available_at=now()`, `attempt_count=0`.
6. Every row carries a non-null `leave_spell_lineage_id`, `tenant_id`, and a valid `payload_signature`; a missing lineage is rejected `ERR-G04-LINEAGE-MISSING` (422), an invalid signature `ERR-G04-SIGNATURE-INVALID` (403), an unscoped insert rejected (Platform §0.1).

**Business Rules.**
- BR-01.1 **(resolves R8)** Capture occurs for all leave types that resolve to a `POST_SR` mapping. `EXCLUDED_NON_SR` types (e.g. casual leave) are captured but immediately set to outbox `EXCLUDED` (deliberate no-op) — never DLQ'd. Only an SR-affecting type with *no* mapping dead-letters.
- BR-01.2 Amendments/cancellations reuse the spell's `leave_spell_lineage_id`, increment `event_sequence`, set `prior_outbox_id`.
- BR-01.3 The source principal (`g04.outbox.write`) is recorded in `created_by`.
- BR-01.4 **(R17)** The payload is HMAC-signed by the G03 capture key; only the `g04.outbox.write` principal may insert outbox rows (P02 scope).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Insert (write) |
| `leave_ledger_entries` (G03) | Read snapshot source + lineage_id |
| `sr_event_mapping` | Resolve disposition at capture (POST_SR vs EXCLUDED_NON_SR) |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| Internal outbox write (within G03 tx) | Atomic, signed capture |
| `GET /api/v1/lsr/outbox` (cursor) | IntegOps observability |

**UI Behavior Notes.** No end-user UI; outbox visible read-only in the monitoring console "Inbound queue" panel with status counts (incl. EXCLUDED and BLOCKED_AWAITING_ORIGINAL buckets); canonical empty/loading/error states.

**Edge Cases.**
- Duplicate event emission (at-least-once source) → `(lineage, sequence)` unique constraint makes it idempotent.
- SR-affecting leave type with no mapping → captured anyway; fails later into DLQ (never dropped).
- Casual/non-SR leave → captured then `EXCLUDED` (no DLQ flood).
- Forged/unsigned payload → rejected, raised as `SIGNATURE_MISMATCH` integrity finding (FR-17) + `security_audit_log`.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `OutboxWriter` (G03 tx boundary/shared lib), `PayloadSigner`, `DispositionResolver`, `OutboxRepository` |
| Backend flow | G03 commits ledger + signed outbox row in one tx → resolve disposition → row visible to `JOB-G04-RELAY` |
| Data operations | INSERT `leave_event_outbox`; SELECT snapshot + lineage of source spell |
| Validation | `VAL-G04-LINEAGE`, `VAL-G04-SIG`, `VAL-ENUM`, `(lineage,sequence)` unique; tenant scope |
| Authorization | P02: source principal `g04.outbox.write` |
| State changes & side effects | New PENDING/BLOCKED/EXCLUDED row; P05 DB-trigger audit |
| Failure handling | Tx rollback discards both writes; unique violation → no-op; bad signature/lineage → reject |
| Dependencies | G03 ledger schema + lineage issuance; shared DB tx; FR-02 disposition |
| Test guidance | Atomic commit/rollback; duplicate emission idempotent; payload immutability; signature verify; EXCLUDED path; tenant isolation |

---

### FR-02 — Governed event-mapping catalog (disposition + qualifying rule + statutory citation)

- **ID:** FR-02
- **Module:** G04
- **Primary Role(s):** System Administrator (author DRAFT), SR Custodian (approve/publish via P01)
- **User Story:** *As an SR Custodian, I want a versioned, effective-dated catalog mapping each leave type/spell condition either to the correct statutory SR entry type (with qualifying-service rule and cited authority) or to an explicit non-SR exclusion, so that posting is deterministic, auditable, citable, and changeable without code deployment.*

**Description.** The catalog (`sr_event_mapping`) defines, per `(leave_type_code, event_type[, spell_predicate])`, a **disposition** (`POST_SR`/`EXCLUDED_NON_SR`); for `POST_SR`, the target `sr_entry_type`, the `qualifying_service_rule`, a **mandatory `statutory_rule_ref`** (`VAL-G04-CITATION`), a `straddle_handling` rule, an optional `annotation_template`, and an effective-date range (`VAL-EFFECTIVE`). Versions are immutable once PUBLISHED (platform in-flight version pinning); changes create a new version. Maker (Sys Admin) drafts via a **W.2 form**; checker (SR Custodian) publishes via a **configured P01 maker-checker flow** (SoD by P01/P02).

**Acceptance Criteria.**
1. A DRAFT mapping can be created, edited, soft-deleted; a PUBLISHED mapping cannot be edited (only superseded or RETIRED).
2. Publishing requires SR Custodian approval through P01 (maker ≠ checker, enforced by engine).
3. No two PUBLISHED mappings for the same `(leave_type_code, event_type)` may overlap effective ranges (rejected at publish `ERR-G04-MAPPING-OVERLAP` / 409, `VAL-G04-MAPCOVER`).
4. The relay resolves the mapping effective at the relevant date; absent `POST_SR` mapping for an SR-affecting type ⇒ DLQ `MAPPING_MISSING`; `EXCLUDED_NON_SR` ⇒ `EXCLUDED` no-op.
5. Every publish/retire is captured by the P05 DB-trigger with version and actor.
6. **(R10/AI-19)** Every `POST_SR` mapping has a non-null `statutory_rule_ref`; publish rejected (`VALIDATION_FAILED` 422, field `statutory_rule_ref`) if missing; the citation surfaces in the evidence pack (FR-14).

**Business Rules.**
- BR-02.1 `spell_predicate` may classify long leave (e.g. days_count ≥ 120 ⇒ LONG_LEAVE) and route LWP/EOL to `NON_QUALIFYING`.
- BR-02.2 The qualifying rule on the SR entry is sourced solely from the mapping (single source of truth).
- BR-02.3 Mapping versions are pinned in `sr_posting_log.mapping_id`.
- BR-02.4 **(resolves R16)** A spell straddling a rule-change date is handled per `straddle_handling`: default `SPLIT_BY_EFFECTIVE` splits into per-effective-range SR sub-entries (each cited); `PIN_TO_SPELL_START` where statute requires whole-spell treatment. FR-09 consumes the same rule.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_event_mapping` | CRUD (draft) / publish |
| `workflow_instances` (P01) | Maker-checker for publish |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/mappings` | Create draft (`Idempotency-Key`) |
| `PUT /api/v1/lsr/mappings/{id}` | Edit draft |
| `POST /api/v1/lsr/mappings/{id}/publish` | Submit for P01 approval |
| `GET /api/v1/lsr/mappings` | List (cursor, effective-date filter) |

**UI Behavior Notes.** Admin "Mapping Catalog" (W.2-bound): list with version, status, disposition, effective range, statutory citation; version diff; publish action gated by P02; predicate builder; straddle-handling selector; mandatory citation field; no-permission state for non-checkers.

**Edge Cases.**
- Legacy leave type with no modern equivalent → map to `LEGACY_LEAVE_AVAILED` with citation + annotation.
- Casual/non-SR leave → `EXCLUDED_NON_SR`.
- Spell straddling a rule change → `SPLIT_BY_EFFECTIVE` sub-entries.
- Retire a mapping with in-flight events → allowed; in-flight postings retain pinned `mapping_version`.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `MappingService`, `MappingResolver`, `StraddleSplitter`, P01 publish flow |
| Backend flow | Draft → submit → P01 checker approves → PUBLISHED with overlap + citation validation |
| Data operations | INSERT/UPDATE (draft only); INSERT new version on change |
| Validation | `VAL-G04-MAPCOVER`, `VAL-G04-CITATION`, `VAL-EFFECTIVE`, `VAL-ENUM` |
| Authorization | P02: Sys Admin (draft), SR Custodian (publish) |
| State changes & side effects | Version transitions; P05 capture |
| Failure handling | Overlap → `ERR-G04-MAPPING-OVERLAP`; missing citation → `VALIDATION_FAILED`; publish-by-non-checker → `FORBIDDEN` |
| Dependencies | G12 SR entry-type vocabulary; P01 |
| Test guidance | Overlap matrix; resolver-by-date; immutability; citation enforcement; straddle split; EXCLUDED disposition |

---

### FR-03 — Partitioned, idempotent posting relay with exactly-once effect

- **ID:** FR-03
- **Module:** G04
- **Primary Role(s):** System (`JOB-G04-RELAY` worker), IntegOps (monitor)
- **User Story:** *As the integration, I want a relay that drains the outbox per-partition in spell-lineage order and posts each event to the G12 SR write port exactly once — using a stable, mapping-version-independent dedupe key over the X.3 framework, never posting a correction before its original — so that retries, concurrency, and remaps never create duplicate or out-of-order statutory entries.*

**Description.** The relay runs as **`JOB-G04-RELAY` on the X.1 runner** (idempotent per-period run key, per-tenant isolation). It claims work **per `partition_key`**: acquires a `relay_partition_lease`, processes that partition's eligible events strictly in `event_sequence` order. For each event it pins/reads `pinned_mapping_version`, computes the deterministic `dedupe_key` (lineage + event_type + event_sequence — **excluding mapping_version**), and calls G12's idempotent SR write port **through the X.3 integration framework** with `dedupe_key` as the outbound `Idempotency-Key`. On success it records `sr_event_id`, marks the outbox `POSTED`, advances `last_processed_sequence`, appends `sr_posting_log`. A correction stays `BLOCKED_AWAITING_ORIGINAL` until its original entry is `POSTED`. G12 dedupes on the key, so a repeat returns the original `sr_event_id` as `DUPLICATE_NOOP`. The lease + `lease_expires_at` make crashed in-flight work recoverable (FR-15). **X.3 circuit-breaking** protects against sustained G12 outage.

**Acceptance Criteria.**
1. Each successfully posted event results in exactly one `service_register_events` row (verified by reconciliation).
2. Concurrent relay instances never post the same partition's events twice (partition lease + dedupe key); events within a partition post in `event_sequence` order.
3. A replayed/duplicated call to G12 with the same `dedupe_key` returns the original `sr_event_id`, logged `DUPLICATE_NOOP` (no second row), **including after a mapping remap** (dedupe key is mapping-version-independent).
4. A `LEAVE_CANCELLED`/`LEAVE_AMENDED` event is not posted while its original entry is not yet `POSTED` (status `BLOCKED_AWAITING_ORIGINAL`).
5. Posting latency (claim→confirm) recorded; P95 ≤ 5 min under normal load.
6. Every attempt appends a `sr_posting_log` row carrying lineage and dedupe key.
7. `pinned_mapping_version` resolved once at first claim (in-flight pinning), persisted, never recomputed.
8. **(v3)** The job is registered on X.1; a terminal job failure emits `JOB-FAIL → MSG-SYS-JOBFAIL`; the X.3 breaker state is observable.

**Business Rules.**
- BR-03.1 **(R4)** `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]`; `mapping_version` not in the key; an intentional remap is an explicit correction (FR-08).
- BR-03.2 **(R4)** The relay pins the mapping version at first claim and records `mapping_id`; immutable across retries.
- BR-03.3 **(R5/R1)** Outbox transitions: PENDING → IN_FLIGHT (claim sets lease) → POSTED | FAILED (retryable/lease-expired) | DEAD_LETTERED (exhausted); BLOCKED_AWAITING_ORIGINAL → PENDING when original POSTED.
- BR-03.4 **(R5)** Events claimed/processed per partition in `event_sequence` order; one worker per partition (lease).
- BR-03.5 **(v3)** The outbound call uses X.3 (credential from P04, payload version per FR-16 contract, error mapping G12→`ERR-G04-*`).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Claim + status update + lease |
| `relay_partition_lease` | Per-partition in-order claim |
| `sr_posting_log` | Append attempt |
| `sr_event_mapping` | Resolve + pin |
| `service_register_events` (G12) | Write via X.3 port |

**API References.**

| API | Purpose |
|---|---|
| `POST {G12}/api/v1/sr/ingest` (X.3; `Idempotency-Key` = dedupe_key; canonical tuple + `fact_key` + `source_module="G04"` in body) | Append SR entry — G12's only ledger write path |
| `GET /api/v1/lsr/postings` (cursor) | Posting log |

**UI Behavior Notes.** Console "Posting log": searchable by lineage/correlation_id/employee, outcome filter, latency column, link to SR entry; partition/lease in-order progress view; X.3 breaker badge.

**Edge Cases.**
- G12 returns 200 but relay crashes before marking POSTED → lease expires → `JOB-G04-REAPER` re-enqueues → re-post same key → `DUPLICATE_NOOP` → POSTED (self-heals).
- G12 ambiguous timeout → RETRYABLE; dedupe guarantees safety.
- Correction arrives before its original → held `BLOCKED_AWAITING_ORIGINAL` (no false ORPHAN_CORRECTION).
- Mapping remapped mid-retry → key unchanged; no duplicate.
- Sustained G12 outage → X.3 breaker opens; events stay durable in outbox.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `PartitionedRelayWorker` (`JOB-G04-RELAY`), `PartitionLeaseManager`, `SrPostingClient` (X.3), `DedupeKeyFactory`, `OrderingGuard` |
| Backend flow | Acquire lease → select oldest-eligible by sequence → pin mapping → build dedupe key → ordering guard → X.3 POST to G12 → record outcome → advance sequence → renew/release lease |
| Data operations | UPDATE outbox status/lease; UPDATE partition lease; INSERT posting_log; read mapping |
| Validation | Payload completeness; mapping resolved; `VAL-G04-DEDUPE`; `VAL-G04-ORDER` |
| Authorization | P02: relay principal `sr.events.write` (append-only) |
| State changes & side effects | New SR entry (G12); outbox POSTED; lease advance; metrics → G14 |
| Failure handling | Retryable→FR-04; permanent→DLQ; ambiguous→retry; crash→FR-15; X.3 breaker on outage; `JOB-FAIL`→`MSG-SYS-JOBFAIL` |
| Dependencies | G12 idempotent write port (FR-16); X.1 runner; X.3; config; partition lease |
| Test guidance | Crash-after-success replay; concurrency double-claim; in-order per-partition; remap-no-duplicate; correction-before-original held; breaker trip |

---

### FR-04 — Retry with backoff & dead-letter (circuit-breaking via X.3)

- **ID:** FR-04
- **Module:** G04
- **Primary Role(s):** System (relay), Sys Admin (configure), IntegOps (observe)
- **User Story:** *As the integration, I want transient failures retried with exponential backoff, a manual relay-pause for sustained outages, platform circuit-breaking on the G12 downstream, and poison events quarantined to a dead-letter store after exhausting retries, so that upstream outages self-heal and unrecoverable events are never silently lost.*

**Description.** Failures are classified retryable (G12 unavailable/timeouts/5xx, `RATE_LIMITED`) vs permanent (`VALIDATION_REJECT`, `MAPPING_MISSING`, `DATA_CONFLICT`, `SIGNATURE_INVALID`). Retryable failures increment `attempt_count`, set `available_at = now + backoff(attempt)`, keep status FAILED until the next claim. **Core controls are bounded per-event retry + DLQ + a manual relay-pause override; circuit-breaking for the G12 downstream is supplied by the X.3 integration framework** (the v2 "optional Phase-2 breaker" is now platform-provided, not module-built). On exhausting `max_retries`, the event moves to `sr_dead_letter` and outbox becomes DEAD_LETTERED. A modest rate-limit/back-pressure protects G12 during migration bursts. The X.1 runner also retries the *job* ×3 and emits `JOB-FAIL → MSG-SYS-JOBFAIL` on terminal job failure.

**Acceptance Criteria.**
1. Retryable failures retry up to `max_retries` (config) with exponential backoff + jitter.
2. Permanent failures dead-letter immediately (no pointless retries).
3. Exhausted retries create exactly one `sr_dead_letter` row and set outbox DEAD_LETTERED.
4. A manual relay-pause halts posting without data loss; resume re-drains the durable outbox.
5. All retries/DLQ moves append to `sr_posting_log` and are P05-captured.
6. **(v3, R12/R13)** A rate-limit caps throughput to protect G12 during bursts; the **X.3 circuit-breaker** trips at the framework threshold, pauses posting, and raises a CRITICAL alert via X.2 (state table 10.5).

**Business Rules.**
- BR-04.1 Backoff: `available_at = now + base * 2^(attempt-1) + jitter`, capped.
- BR-04.2 Failure classification is centralised and config-tunable; `SIGNATURE_INVALID` is permanent; G12 fault codes are mapped to classes via X.3 per-integration error mapping.
- BR-04.3 **(v3)** Circuit-breaking is provided by X.3; the **manual relay-pause** is the module-level outage control and is always available.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Update attempt/status/available_at |
| `sr_dead_letter` | Insert on exhaustion |
| `sr_posting_log` | Append |
| `integration_config` | Read retry/backoff/rate-limit/x3_breaker_threshold |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` (cursor) | List DLQ |
| `PUT /api/v1/lsr/config` | Update retry/SLA/rate-limit (Sys Admin) |
| `POST /api/v1/lsr/relay/pause` · `POST /api/v1/lsr/relay/resume` | Manual relay-pause |

**UI Behavior Notes.** Dashboard shows DLQ depth, retry histogram, relay paused/running state, X.3 breaker state; config screen for thresholds.

**Edge Cases.**
- Thundering herd after outage → jitter + rate-limit spread retries.
- Permanent error misclassified as retryable → bounded by `max_retries` then DLQ.
- Sustained G12 outage → X.3 breaker opens + operator may relay-pause; resume self-heals.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RetryPolicy`, `FailureClassifier`, `RateLimiter`, `RelayPauseSwitch`, `DeadLetterService`, X.3 circuit-breaker (framework) |
| Backend flow | On failure → classify → (retryable: schedule backoff) | (permanent/exhausted: DLQ); manual pause halts claims; X.3 breaker on sustained failure |
| Data operations | UPDATE outbox; INSERT dlq; INSERT posting_log |
| Validation | attempt_count ≤ max_retries; classification deterministic |
| Authorization | P02: relay principal; Sys Admin config; IntegOps pause |
| State changes & side effects | Outbox FAILED/DEAD_LETTERED; pause state; X.3 breaker; X.2 alerts |
| Failure handling | DLQ guarantees no silent loss; manual pause + X.3 breaker prevent cascade |
| Dependencies | config; X.2; X.1 runner; X.3 |
| Test guidance | Backoff math; classifier (incl. signature); exhaustion→DLQ; pause/resume; rate-limit; X.3 breaker trip |

---

### FR-05 — Dead-letter triage & maker-checker resolution

- **ID:** FR-05
- **Module:** G04
- **Primary Role(s):** IntegOps / HR Officer (maker), SR Custodian (checker via P01)
- **User Story:** *As an Integration Operator, I want to triage dead-lettered events, diagnose the cause, fix the root issue, and replay or discard them under maker-checker control, so that every quarantined leave event is resolved with full auditability.*

**Description.** DLQ items list `failure_class`, last error, lineage, snapshots. An operator can assign, investigate, and choose **Replay** (after fixing mapping/data/signature) or **Discard** (with justification). Replay re-enqueues the original outbox row (resets to PENDING, preserves the lineage-based dedupe key). Any resolution that results in an SR write runs through a **configured P01 maker-checker flow** (IntegOps maker → SR Custodian checker; SoD by P01/P02).

**Acceptance Criteria.**
1. DLQ items filterable by failure_class, severity, org_unit, age, lineage (cursor pagination).
2. Replay re-enqueues with the same (lineage-based) dedupe key (no duplicate risk).
3. Discard requires justification and SR Custodian approval; item moves to RESOLVED_DISCARDED.
4. Resolution transitions and approvals are P05-captured with actor and timestamp.
5. A DLQ item resolved RESOLVED_REPLAYED is closed only after the replayed event reaches POSTED.

**Business Rules.**
- BR-05.1 Replay must not bypass mapping coverage — a `MAPPING_MISSING` item is only replayable after a covering `POST_SR` mapping is published.
- BR-05.2 Discard never deletes data; row retained RESOLVED_DISCARDED with reason.
- BR-05.3 SR-writing resolutions require maker ≠ checker (P01).
- BR-05.4 A `SIGNATURE_INVALID` item is only replayable after the payload is re-captured/re-signed by G03 (not operator-editable).

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_dead_letter` | Update state/assignment/resolution |
| `leave_event_outbox` | Re-enqueue on replay |
| `workflow_instances` (P01) | Maker-checker |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` | List (cursor) |
| `POST /api/v1/lsr/dlq/{id}/assign` | Assign |
| `POST /api/v1/lsr/dlq/{id}/replay` | Replay (starts P01 instance) |
| `POST /api/v1/lsr/dlq/{id}/discard` | Discard (starts P01 instance) |

**UI Behavior Notes.** DLQ triage board (Kanban Open/In review/Resolved); detail drawer with leave-vs-SR snapshot, error history, replay/discard; P01 checker approval inbox; signature-class items flagged not operator-editable.

**Edge Cases.**
- Replay after the source leave was further amended → frozen payload; if stale, operator discards and lets the newer (higher-sequence) event flow.
- Bulk replay after a fixed mapping → batch action with single P01 approval per batch (P01 bulk-queue actions).
- Checker rejects replay → item returns IN_REVIEW with rejection note.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DlqService`, `ReplayService`, P01 resolution flow |
| Backend flow | Assign → investigate → replay/discard → P01 → on approve apply |
| Data operations | UPDATE dlq; UPDATE outbox (replay); P01 actions |
| Validation | Mapping coverage before replay; justification (`VAL-COMMENT`); re-sign for signature class |
| Authorization | P02 + P01 SoD: maker (IntegOps/HR), checker (SR Custodian) |
| State changes & side effects | DLQ state; outbox re-enqueue; P05 capture |
| Failure handling | Failed replay re-enters retry/DLQ; rejected workflow reverts state |
| Dependencies | FR-02, FR-03, P01 |
| Test guidance | Replay idempotency; discard audit; maker-checker enforcement; bulk replay; signature-class block |

---

### FR-06 — State-aware reconciliation engine (drift detection)

- **ID:** FR-06
- **Module:** G04
- **Primary Role(s):** System (`JOB-G04-RECON`), IntegOps / SR Custodian (on-demand)
- **User Story:** *As an SR Custodian, I want scheduled and on-demand reconciliation comparing the G03 leave ledger against the G12 Service Register — keyed on spell lineage, with correction chains resolved and legitimately pending/quarantined events excluded — so that real missing, duplicate, or divergent entries are detected without a flood of false positives.*

**Description.** A reconciliation run (scheduled via `JOB-G04-RECON` on X.1, or on-demand) loads the leave ledger and SR entries for a scope (org_unit, date range, employee set, or `PRE_PENSION`) and compares them **by `leave_spell_lineage_id`**, resolving SR correction chains to net-effective before diffing. It **excludes** events legitimately `PENDING`, in backoff, `BLOCKED_AWAITING_ORIGINAL`, or `DEAD_LETTERED` from `MISSING_SR` (counting them in `pending_excluded_count`). It classifies findings: `MISSING_SR`, `DUPLICATE_SR`, `DIVERGENT_FIELD`, `ORPHAN_CORRECTION`, `UNMAPPED_LEAVE`, `CORRECTION_WITHOUT_LINK`. Reads of G12 use the X.3 SR read API.

**Acceptance Criteria.**
1. A run records counts examined on both sides, `pending_excluded_count`, and zero or more findings.
2. **(R6)** MISSING_SR raised only for SR-affecting leave with no POSTED entry that is **not** currently PENDING/backoff/blocked/dead-lettered.
3. DUPLICATE_SR raised when >1 net-effective SR entry shares a lineage's dedupe/business key.
4. **(R6)** DIVERGENT_FIELD computed **after** resolving correction chains and matching on lineage.
5. `PRE_PENSION` runs can be triggered for an employee/cohort and feed FR-18.
6. **(R9)** `CORRECTION_WITHOUT_LINK` raised when G12 holds a correction entry whose local `sr_correction_link` is missing (recoverable from G12-stored lineage).
7. Reconciliation is read-only against G03 and G12 (never mutates SR).
8. **(v3)** Scheduled runs execute as `JOB-G04-RECON` (per-tenant isolation; `JOB-FAIL → MSG-SYS-JOBFAIL` on terminal failure).

**Business Rules.**
- BR-06.1 Scheduled full reconciliation runs ≥ daily; incremental hourly (X.1 cadence).
- BR-06.2 Severity: MISSING_SR/DUPLICATE_SR/ORPHAN_CORRECTION/CORRECTION_WITHOUT_LINK = HIGH/CRITICAL; DIVERGENT_FIELD = MEDIUM; cosmetic = LOW. Near-retirement MISSING_SR escalated (tiered SLA, §11.1).
- BR-06.3 Findings deduplicated across runs (same issue not re-created if still OPEN).
- BR-06.4 Matching lineage-first; business-key fallback only when lineage absent (legacy/migrated).

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_run` | Insert header (+ pending_excluded_count) |
| `reconciliation_finding` | Insert findings (lineage-keyed) |
| `leave_event_outbox` / `sr_dead_letter` | Read status to exclude pending/quarantined |
| `leave_ledger_entries` (G03) / `service_register_events` (G12) | Read |
| `sr_correction_link` | Resolve chains; detect missing links |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/reconciliation/runs` | Trigger on-demand/pre-pension (`Idempotency-Key`) |
| `GET /api/v1/lsr/reconciliation/runs/{id}` | Run status + summary |
| `GET /api/v1/lsr/reconciliation/findings` | List findings (cursor) |

**UI Behavior Notes.** "Reconciliation" screen: run history, trigger (scope picker), findings table with type/severity filters, informational pending/quarantined panel distinct from findings, side-by-side leave/SR diff with chain resolution shown.

**Edge Cases.**
- Leave correctly in DLQ → counted in pending bucket, not MISSING_SR.
- Amended spell → matched on lineage; net-effective compared; no false DIVERGENT.
- Leave posted but SR later corrected → match latest net-effective via correction links.
- In-flight events at run time → excluded from MISSING (informational).
- Large cohort → run chunked and resumable.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationEngine` (`JOB-G04-RECON`), `LineageMatcher`, `ChainResolver`, `StateAwareFilter`, `FieldDiffer`, `FindingDeduper` |
| Backend flow | Load scope → index both sides by lineage → exclude pending/quarantined → resolve chains → match → classify → persist |
| Data operations | Bulk read G03/G12 + outbox/DLQ state; INSERT run + findings |
| Validation | Scope bounds; cursor pagination on reads |
| Authorization | P02: IntegOps/SR Custodian (trigger); system (scheduled) |
| State changes & side effects | New run + findings; no SR mutation; P05 capture |
| Failure handling | Partial run → status FAILED with checkpoint; resumable; `JOB-FAIL` on terminal |
| Dependencies | G03 read; G12 read (X.3); correction links (FR-08); outbox/DLQ state; X.1 |
| Test guidance | Seeded drift fixtures; pending-excluded; amended-not-divergent; correction-without-link; dedupe across runs; pre-pension scope |

---

### FR-07 — Reconciliation remediation (maker-checker correction)

- **ID:** FR-07
- **Module:** G04
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker via P01)
- **User Story:** *As an SR Custodian, I want each reconciliation finding to drive a controlled remediation — re-post a missing entry, supersede a duplicate, correct a divergent field, or relink an unlinked correction via an append-only correction — so that drift is closed without ever hard-editing the statutory register.*

**Description.** From a finding, an operator proposes a remediation: **MISSING_SR → re-enqueue/post**; **DUPLICATE_SR → supersede the surplus entry**; **DIVERGENT_FIELD → append an AMENDMENT correction**; **ORPHAN_CORRECTION → link or void**; **CORRECTION_WITHOUT_LINK → reconstruct the link from G12-stored lineage**; **UNMAPPED_LEAVE → create mapping then replay**. All SR-affecting remediations run a **configured P01 maker-checker flow**, produce `sr_correction_link` entries where applicable, and transition the finding to APPLIED (or WAIVED with justification).

**Acceptance Criteria.**
1. Each finding type has a defined remediation action set; selecting one starts a P01 instance.
2. No remediation performs UPDATE/DELETE on `service_register_events` (P05-immutable); corrections are appended.
3. Duplicate remediation marks the surplus entry void via a SUPERSEDE correction linking original→correcting.
4. On checker approval the action applies and the finding becomes APPLIED; rejection returns it to OPEN.
5. WAIVED findings require justification and are retained for audit (P05).
6. CORRECTION_WITHOUT_LINK remediation reconstructs `sr_correction_link` from the G12-stored `leave_spell_lineage_id` without posting a new SR entry.

**Business Rules.**
- BR-07.1 Remediation reason codes: RECON_FIX (MIGRATION_FIX for batch-origin findings).
- BR-07.2 The applied correction references the finding, the lineage, and the original SR entry.
- BR-07.3 After APPLIED, a verification re-check confirms the finding no longer reproduces.

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_finding` | Update remediation_state |
| `sr_correction_link` | Insert/reconstruct |
| `service_register_events` (G12) | Append correction via X.3 port |
| `workflow_instances` (P01) | Maker-checker |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/findings/{id}/remediate` | Propose remediation (P01) |
| `POST /api/v1/lsr/findings/{id}/waive` | Waive with justification |
| `GET /api/v1/lsr/findings/{id}` | Detail |

**UI Behavior Notes.** Finding detail with recommended action, proposed correction preview (before/after), P01 approve/reject (checker), waive with reason.

**Edge Cases.**
- Concurrent remediation of the same finding → optimistic lock; second attempt sees state change (`CONFLICT` 409).
- Remediation that itself fails posting → returns to OPEN, surfaces error.
- Divergent field actually correct in SR (source wrong) → route fix to G03, waive SR-side.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RemediationService`, `CorrectionPoster` (X.3), `LinkReconstructor`, P01 flow, `VerificationRecheck` |
| Backend flow | Propose → P01 → on approve apply correction via G12 port (or relink) → re-check |
| Data operations | INSERT/reconstruct correction_link; append SR entry; UPDATE finding |
| Validation | Action valid for finding type; append-only enforced |
| Authorization | P02 + P01 SoD: maker (HR/IntegOps), checker (SR Custodian) |
| State changes & side effects | Finding APPLIED/WAIVED; new SR correction or relink; P05 capture |
| Failure handling | Apply failure → finding OPEN + error; reject → OPEN |
| Dependencies | FR-06 findings; FR-08 correction posting; P01 |
| Test guidance | Per-finding-type remediation; append-only assertion; relink-from-lineage; re-check closes finding |

---

### FR-08 — Correction & reversal posting via the outbox (append-only)

- **ID:** FR-08
- **Module:** G04
- **Primary Role(s):** System (relay), SR Custodian (governs via P01)
- **User Story:** *As the integration, when a previously posted leave is cancelled or amended, I want to post an append-only correcting or reversing SR entry — through the same outbox/idempotency machinery, ordered after its original, and linked by lineage — so that the Service Register reflects the truth without ever being hard-edited and without leaving unlinked corrections.*

**Description.** Corrections use the **G12 reversal envelope, not a G04-local correction verb**: a `LEAVE_CANCELLED` event posts to `POST {G12}/api/v1/sr/ingest/reversal` with `is_reversal=true` + `reverses_source_reference_id` (the original spell's `source_reference_id`) and the published **`*_CANCELLED`** partner `event_type_code` (e.g. `EL_AVAILED → EL_AVAILED_CANCELLED`); a `LEAVE_AMENDED` event reverses the superseded spell entry (`is_reversal=true` + `reverses_source_reference_id`) and posts the corrected spell as a fresh forward entry, so G12 **auto-spawns the corrigendum/supersession** rather than G04 defining an `AMENDMENT`/`REVERSAL` verb. **(R9)** Corrections flow through the **same outbox + dedup path** (X.3 outbound) as primary posts, carry the canonical tuple (`source_module="G04"`) + `fact_key`, and **supersede — never delete/edit**. Both create an `sr_correction_link` keyed by `leave_spell_lineage_id`; because lineage + `reverses_source_reference_id` are also persisted on the G12 SR entry (P05-immutable), a lost local link is **recoverable** and reconciled (FR-06 `CORRECTION_WITHOUT_LINK`). The original entry remains intact; statutory readers follow the chain to net-effective. **(R5)** A correction is not posting-eligible until its original is `POSTED`. **(R11)** Any qualifying-service change after pension processing has started is a **hard P01 maker-checker gate**.

**Acceptance Criteria.**
1. A cancellation posts an `is_reversal=true` envelope (with `reverses_source_reference_id` + published `*_CANCELLED` type) that supersedes the original; the original is never deleted/edited (P05 substrate).
2. An amendment reverses the superseded entry via `reverses_source_reference_id` and posts the corrected values as a fresh forward entry, linked to the original by lineage.
3. If the original SR entry cannot be located after its event is POSTED, the relay raises `ORPHAN_CORRECTION` rather than posting an unlinked correction.
4. The net-effective state of a leave (after chain resolution) is queryable by lineage.
5. Correction posting is idempotent (same lineage-based dedupe-key rule, X.3 outbound) and ordered after the original.
6. `sr_correction_link` is recoverable from G12-stored lineage; a missing link is detected by reconciliation.

**Business Rules.**
- BR-08.1 Corrections are emitted as the **G12 reversal envelope** (`is_reversal=true` + `reverses_source_reference_id` + published `*_CANCELLED` partner type), not a G04-owned `REVERSAL`/`AMENDMENT` verb; G12 auto-spawns the corrigendum. (`sr_correction_link.correction_type` is retained only as a local audit label.)
- BR-08.2 Reason code is set (LEAVE_CANCELLED/LEAVE_AMENDED/RECON_FIX/MIGRATION_FIX).
- BR-08.3 Corrections to qualifying-service re-emit the qualifying flag (FR-09) so G11 sees the corrected effect.
- BR-08.4 **(R11)** Maker-checker is **tiered**: routine reversal-envelope corrections auto-post (system principal) but are **flagged and post-audited**; **any** qualifying-service change after pension processing has started for the employee is a **hard P01 maker-checker gate** (blocking — see FR-09 BR-09.3, state table 10.6), not merely an alert.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Source correction event (same machinery) |
| `service_register_events` (G12) | Append correction via X.3 |
| `sr_correction_link` | Insert link (lineage-keyed) |
| `sr_posting_log` | Append |
| `workflow_instances` (P01) | Hard gate (post-pension qualifying change) |

**API References.**

| API | Purpose |
|---|---|
| `POST {G12}/api/v1/sr/ingest/reversal` (X.3; `is_reversal=true` + `reverses_source_reference_id`; `Idempotency-Key` = dedupe_key) | Post reversal envelope (supersede-not-delete) |
| `GET /api/v1/lsr/corrections?lineageId={id}` | Resolve chain |

**UI Behavior Notes.** SR entry view shows a correction chain timeline: original → reversal/amendment with reason, lineage, link to leave event; post-pension qualifying changes show a blocking P01 approval banner.

**Edge Cases.**
- Multiple sequential amendments → chain of AMENDMENT entries; net-effective = latest.
- Cancellation of an already-amended leave → REVERSAL referencing the latest effective entry.
- Original posted by historical digitisation (FR-11) → correction links to the migrated entry by lineage.
- Local link insert fails after SR append → recoverable from G12 lineage; reconciled CORRECTION_WITHOUT_LINK.
- Qualifying change after pension start → blocked pending P01 maker-checker.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CorrectionResolver`, `CorrectionPoster` (outbox path, X.3), `ChainResolver`, `PostPensionGate` (P01) |
| Backend flow | Locate original by lineage → ensure original POSTED → post correction via outbox/dedupe (X.3) → link → log; post-pension qualifying change → P01 gate |
| Data operations | Append SR entry; INSERT correction_link; INSERT posting_log |
| Validation | Original exists & POSTED; correction type valid; `VAL-G04-DEDUPE`; `VAL-G04-ORDER`; post-pension gate |
| Authorization | P02: relay principal (routine); SR Custodian (post-pension hard gate via P01) |
| State changes & side effects | New SR correction; chain updated; qualifying flag re-emitted; P05 capture |
| Failure handling | Original missing → ORPHAN_CORRECTION; lost link → CORRECTION_WITHOUT_LINK recon |
| Dependencies | FR-03, FR-09, G12 port (X.3), P01 |
| Test guidance | Cancel/amend chain; orphan detection; net-effective; idempotency; lost-link recovery; post-pension hard gate |

---

### FR-09 — Tiered qualifying-service & pension impact flags (LWP / long leave)

- **ID:** FR-09
- **Module:** G04
- **Primary Role(s):** System (relay), Pension Officer (consume), SR Custodian (govern via P01)
- **User Story:** *As a Pension Officer, I want every leave SR entry to carry a precise, statutorily-cited qualifying-vs-non-qualifying service flag, with rule-straddling spells split correctly, and any post-pension-start change hard-gated — so that qualifying-service and pension computation in G11 are correct, auditable, and protected from silent change.*

**Description.** When posting (FR-03) or correcting (FR-08), the relay attaches the `qualifying_service_rule`, `statutory_rule_ref`, and any apportionment from the mapping to the SR entry. LWP/EOL reduce qualifying service; long-leave spells beyond a threshold are flagged per cited rule. **(R16)** A spell straddling a rule-change date is split into per-effective-range SR sub-entries (`straddle_handling=SPLIT_BY_EFFECTIVE`). A `PRE_PENSION` reconciliation (FR-06) plus the completeness certificate (FR-18) verify flags before pension processing. **(R11)** Any qualifying-service change after pension processing has started is a hard **P01** maker-checker gate.

**Acceptance Criteria.**
1. Every leave SR entry carries an explicit qualifying flag (QUALIFYING/NON_QUALIFYING/PARTIAL with rule ref) and a `statutory_rule_ref`.
2. LWP/EOL spells post NON_QUALIFYING by default mapping.
3. PARTIAL spells carry the apportionment basis (`qualifying_rule_ref`).
4. Corrections re-emit the corrected qualifying effect.
5. G11 can retrieve, for an employee, the total non-qualifying days derived from SR leave entries (lineage-totalled); the figure reconciles to the leave ledger.
6. **(R16)** A rule-straddling spell produces per-effective-range sub-entries, each cited; their day-sums equal the original spell.
7. **(R11)** A qualifying-service change after pension processing has begun is blocked pending P01 maker-checker (not merely alerted).

**Business Rules.**
- BR-09.1 The qualifying rule and citation are sourced only from the published mapping (no ad-hoc computation in G04).
- BR-09.2 Long-leave threshold and apportionment are config/mapping driven, not hardcoded.
- BR-09.3 **(R11)** Any change to qualifying effect after pension processing has started triggers a **hard P01 maker-checker gate** (blocking, state table 10.6) — extending the v1 CRITICAL alert into a block; the X.2 alert is still emitted to G11.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (G12) | Carries qualifying flag + citation + lineage |
| `sr_event_mapping` | Source of rule, citation, straddle handling |
| `reconciliation_run` (PRE_PENSION) | Verify |
| `workflow_instances` (P01) | Post-pension hard gate |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/qualifying-impact` | Non-qualifying days summary for G11 |
| `POST /api/v1/lsr/reconciliation/runs` (PRE_PENSION) | Pre-pension verification |

**UI Behavior Notes.** Pension-impact report per employee: timeline of qualifying vs non-qualifying spells, total non-qualifying days, citations, split sub-entries, drill-down to SR entries; post-pension change shows blocking P01 approval state.

**Edge Cases.**
- Spell straddling a rule-change date → split by effective dates into cited sub-entries.
- Retrospective LWP regularisation → posts AMENDMENT correcting qualifying flag.
- Suspension later treated as duty → correction flips NON_QUALIFYING→QUALIFYING with audit (hard-gated if post-pension-start).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `QualifyingFlagResolver`, `StraddleSplitter`, `QualifyingImpactReport`, `PostPensionGate` (P01), `PensionAlertEmitter` (X.2) |
| Backend flow | On post/correct → attach flag+citation from mapping → split if straddling → expose summary API → P01-gate post-pension changes |
| Data operations | Write flag/citation on SR entry; aggregate read for summary |
| Validation | Flag present; rule ref for PARTIAL; citation present; sums reconcile; gate enforced |
| Authorization | P02: Pension Officer read; relay write; SR Custodian for gated changes |
| State changes & side effects | SR entry flag; block + X.2 alert on post-processing change |
| Failure handling | Missing rule → DLQ MAPPING_MISSING |
| Dependencies | FR-02, FR-03, FR-08, G11, P01 |
| Test guidance | LWP non-qualifying; partial apportionment; straddle split sums; G11 reconciliation total; post-pension hard gate |

---

### FR-10 — Statutory annotations (increment / seniority / probation effect)

- **ID:** FR-10
- **Module:** G04
- **Primary Role(s):** System (relay), SR Custodian / HR Officer (govern), G06 (consume)
- **User Story:** *As an SR Custodian, I want leave SR entries to carry machine-readable statutory annotations (increment deferral, seniority effect, probation extension) where the leave triggers them, so that downstream seniority and increment processing act on authoritative, cited data rather than manual interpretation.*

**Description.** Certain leave statutorily defers the next increment date, affects seniority, or extends probation. The mapping's `annotation_template` produces a structured annotation on the SR entry (e.g., `{type: INCREMENT_DEFERRAL, days: 90, rule_ref: "CCS(Leave) r.X"}`). Annotations are consumed by **G06** and visible in the SR. Annotations follow corrections (an amended leave updates its annotation via a new correction entry, lineage-linked).

**Acceptance Criteria.**
1. Leave types configured with an annotation template produce structured annotations on the SR entry.
2. Annotation includes type, quantum, and statutory rule reference.
3. Amendments/cancellations re-emit corrected annotations via correction entries.
4. G06 can query annotations affecting increment/seniority for an employee.
5. No annotation is produced where the mapping does not configure one (no spurious effects).

**Business Rules.**
- BR-10.1 Annotation quantum derives from mapping rule (e.g. increment deferral = non-qualifying days) — config-driven.
- BR-10.2 Annotations are advisory data to G06; G06 owns the seniority/increment decision.
- BR-10.3 Annotation changes are P05-captured and chained with corrections by lineage.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (G12) | Carries annotation |
| `sr_event_mapping` | Annotation template + citation |
| `sr_correction_link` | Annotation updates |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/annotations` | Annotations for G06 (cursor) |

**UI Behavior Notes.** SR entry shows annotation chips (e.g. "Increment deferred 90 days · CCS(Leave) r.X"); progression report lists annotation impacts.

**Edge Cases.**
- Overlapping annotations from consecutive spells → aggregated by G06; G04 emits each per spell.
- Annotation rule changes retroactively → correction re-emits.
- Leave affecting increment but not seniority → only the configured annotation type emitted.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AnnotationRenderer`, `AnnotationApi` |
| Backend flow | On post/correct → render annotation from template → attach to SR entry |
| Data operations | Write annotation; read for G06 |
| Validation | Template schema; quantum computed; rule ref present |
| Authorization | P02: relay write; G06/HR read |
| State changes & side effects | SR annotation; correction chain; P05 capture |
| Failure handling | Template error → DLQ VALIDATION_REJECT |
| Dependencies | FR-02, FR-08, G06 |
| Test guidance | Annotation rendering; correction re-emit; G06 query |

---

### FR-11 — Historical leave digitisation into SR (provisional / adjudicated, on P06)

- **ID:** FR-11
- **Module:** G04
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker / adjudicator via P01)
- **User Story:** *As an SR Custodian, I want legacy paper/electronic leave history loaded into the Service Register through the platform migration toolkit — with low-confidence entries flagged PROVISIONAL, cited, and excluded from pension until I adjudicate them — so that historical leave correctly contributes to qualifying service without risking wrong pensions from uncertain scans.*

**Description.** Legacy leave is migrated on the **P06 ETL+V toolkit** (Extract → Validate → Transform → Load → Verify, 3 mandatory staging dry runs, waves, `migration_runs` ledger). Records are staged as `historical_leave_record` rows under a `historical_leave_batch`, each carrying a `gov_source_id` (P06 `<gov>_source_id` traceability pattern). Validation resolves `service_no_raw`→`employee_id`, derives a deterministic `leave_spell_lineage_id`, maps legacy codes via FR-02, derives qualifying flags + `statutory_rule_ref`, assigns `confidence`, and flags rejects. After SR Custodian approval (P01), valid records post to the SR as migrated entries with `MIGRATION` provenance and source `document_id` (G13). **(R15)** Records with `confidence < HIGH` post `PROVISIONAL` and are **excluded from final pension computation** until `ADJUDICATED_CONFIRMED`. Post-load reconciliation confirms parity.

**Acceptance Criteria.**
1. A batch can be created from a source with `documents` (G13) provenance and staged records linked to a `migration_runs` row (P06).
2. Validation classifies each record VALID/REJECTED with reason and assigns `confidence`; counts roll up to the batch.
3. Posting requires SR Custodian batch approval (P01, maker ≠ checker).
4. Posted historical entries are append-only, idempotent (re-running a batch does not duplicate), and carry MIGRATION provenance, lineage, and `gov_source_id`.
5. Post-load reconciliation (FR-06) runs automatically and reports parity/findings.
6. **(R15)** A migrated qualifying-service entry requires a non-null `statutory_rule_ref`; `confidence < HIGH` entries are `PROVISIONAL`, excluded from pension totals (FR-09/FR-18) until adjudicated; adjudication is recorded and P05-captured.

**Business Rules.**
- BR-11.1 **(R14)** Migration idempotency uses the deterministic `leave_spell_lineage_id` derived from `(employee_id, leave_type, spell_start, spell_end, batch lineage)`, so a later genuine G03 emission dedupes instead of double-posting.
- BR-11.2 Rejected records never post; retained for correction and re-validation (P06 logs source row + violated rule).
- BR-11.3 Migrated entries flagged distinctly (provenance MIGRATION) so audit separates migrated vs live-captured.
- BR-11.4 **(R15)** No PROVISIONAL entry contributes to a PASS pre-pension certificate (FR-18).

**Data Model References.**

| Entity | Use |
|---|---|
| `historical_leave_batch` / `historical_leave_record` | Header / staged records |
| `migration_runs` (P06) / `documents` (G13) | Migration ledger / provenance |
| `service_register_events` (G12) | Append migrated entries (X.3) |
| `reconciliation_run` | Post-load parity |
| `workflow_instances` (P01) | Batch approval + adjudication |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/historical/batches` | Create batch |
| `POST /api/v1/lsr/historical/batches/{id}/validate` | Validate (assign confidence) |
| `POST /api/v1/lsr/historical/batches/{id}/approve` | Approve (P01 checker) |
| `POST /api/v1/lsr/historical/batches/{id}/post` | Post valid records |
| `POST /api/v1/lsr/historical/records/{id}/adjudicate` | Confirm/reject a PROVISIONAL entry |
| `GET /api/v1/lsr/historical/batches/{id}` | Status |

**UI Behavior Notes.** Batch wizard: import → validation report (valid/reject + confidence) → P01 approval → post → reconciliation summary; provisional-entry adjudication queue; editable reject grid; mandatory citation field.

**Edge Cases.**
- Duplicate legacy record across batches → deterministic lineage prevents double posting.
- Employee not found (pre-system retiree) → REJECTED with reason; escalate to G01.
- Partial spell with unclear qualifying status → PROVISIONAL + held for SR Custodian adjudication.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `BatchIngestService` (P06 ETL+V), `RecordValidator`, `ConfidenceScorer`, `MigrationPoster` (X.3), P01 approval flow, `AdjudicationService` |
| Backend flow | Stage (P06) → validate (confidence) → P01 approve → post (idempotent, provisional) → reconcile → adjudicate |
| Data operations | INSERT batch/records; append SR entries; INSERT recon run; UPDATE adjudication; `migration_runs` |
| Validation | Employee resolution; mapping coverage; citation present; date sanity; duplicate detection via lineage |
| Authorization | P02 + P01 SoD: maker (HR/IntegOps), checker/adjudicator (SR Custodian) |
| State changes & side effects | Batch status; SR migrated entries (provisional); adjudication; P05 capture |
| Failure handling | Per-record failure → PARTIALLY_POSTED; rejects retained (P06 dry-run gate) |
| Dependencies | FR-02, FR-06, FR-18, G12, G13, P06, P01 |
| Test guidance | Idempotent re-post; deterministic lineage dedupe vs live event; provisional exclusion; adjudication; provenance; post-load parity |

---

### FR-12 — Replay & backfill tooling (deterministic identity)

- **ID:** FR-12
- **Module:** G04
- **Primary Role(s):** IntegOps (operate), SR Custodian (approve via P01)
- **User Story:** *As an Integration Operator, I want safe, audited replay and backfill tools (by event, time window, or employee) whose backfilled events derive a deterministic lineage-based identity, so that after a fix or outage I can re-drive events to the SR without creating duplicates — even if a genuine G03 emission for the same spell arrives later.*

**Description.** Replay re-enqueues selected outbox events; backfill generates outbox events for source leave never captured. **(R14)** Backfilled events derive `leave_spell_lineage_id` (and thus the dedupe key) deterministically from the business key, so a later genuine G03 emission dedupes rather than double-posts. Both rely on dedupe (X.3 outbound idempotency + G12 persistence) so re-posting is safe. Bulk operations are previewed (dry-run count), require SR Custodian approval (P01) for SR-writing scope, and are fully P05-captured. Large backfills run chunked under the X.1 runner.

**Acceptance Criteria.**
1. Replay by id/filter/time-window re-enqueues matching events with original (lineage-based) dedupe keys.
2. Backfill detects source leave with no outbox row and generates capture events with deterministic lineage.
3. A dry-run preview shows affected count before execution.
4. Bulk SR-writing replay/backfill requires SR Custodian approval (P01).
5. Replays/backfills are idempotent — re-running produces no duplicate SR entries.
6. **(R14)** A backfilled event and a later genuine G03 event for the same spell resolve to the same lineage/dedupe key and do not double-post.

**Business Rules.**
- BR-12.1 **(R14)** Backfill identity: `leave_spell_lineage_id` derived deterministically from `(employee_id, leave_type, spell_start, spell_end)` (and batch lineage for migration), matching what G03 would issue; the dedupe key follows.
- BR-12.2 Replay never mutates the original payload (frozen snapshot preserved).
- BR-12.3 Backfill is bounded by an explicit scope and approved (P01) before execution; every replayed/backfilled item links to the operation id for audit.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Re-enqueue / create backfill rows |
| `sr_posting_log` | Append |
| `workflow_instances` (P01) | Approval for bulk |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/replay` (dry_run flag, `Idempotency-Key`) | Replay by scope |
| `POST /api/v1/lsr/backfill` (dry_run flag) | Backfill missing |

**UI Behavior Notes.** "Replay / Backfill" tool: scope builder, dry-run preview with counts, P01 approval gate, progress tracker.

**Edge Cases.**
- Replay window overlaps in-flight events → dedupe makes overlap safe.
- Backfill for leave that should not affect SR → filtered by `EXCLUDED_NON_SR`.
- Massive backfill → chunked (X.1), rate-limited to protect G12, resumable.
- Backfill then genuine G03 emission → same lineage → no duplicate.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReplayService`, `BackfillScanner`, `DeterministicLineageDeriver`, P01 bulk-op flow, `OpProgressTracker` |
| Backend flow | Scope → derive identity → dry-run → P01 approve → execute (chunked, idempotent) |
| Data operations | UPDATE/INSERT outbox; INSERT posting_log |
| Validation | Scope bounds (`ERR-G04-SCOPE-TOO-LARGE`); mapping coverage; approval present; deterministic lineage |
| Authorization | P02 + P01: IntegOps operate; SR Custodian approve |
| State changes & side effects | Re-enqueued events; SR entries (idempotent); P05 capture |
| Failure handling | Per-item failure → retry/DLQ; resumable on crash |
| Dependencies | FR-03, FR-04, P01, X.1 |
| Test guidance | Idempotent replay/backfill; deterministic-lineage dedupe vs live; dry-run accuracy; chunk resume; approval enforcement |

---

### FR-13 — Integration monitoring dashboard & operating model

- **ID:** FR-13
- **Module:** G04
- **Primary Role(s):** IntegOps, SR Custodian, Auditor (read), Sys Admin
- **User Story:** *As an Integration Operator, I want a real-time dashboard of integration health — queue depth, posting lag, success/error rates, DLQ depth, reaped-in-flight count, reconciliation status, and an explicit on-call/SLA operating model — so that accountable people detect and act on problems before they affect statutory data.*

**Description.** A console summarising: inbound outbox by status (incl. EXCLUDED, BLOCKED_AWAITING_ORIGINAL), posting throughput and P95 lag, error rate by code, DLQ depth and age, **reaped-in-flight count**, recon pending/quarantined bucket, last reconciliation result and open findings by severity, relay paused/running, **X.3 breaker state**, and historical batch progress. **(R18)** Configurable SLA thresholds raise **X.2** notifications and map to a defined IntegOps on-call rota and tiered resolution SLAs (§11.1). Metrics feed **G14** (≈ PrimeSoft M16 Analytics).

**Acceptance Criteria.**
1. Dashboard shows live counts for outbox statuses, postings, DLQ, reaped-in-flight, findings, relay/breaker state.
2. Posting lag P95 and success rate are charted over selectable windows.
3. SLA breaches (lag, DLQ depth/age, open HIGH/CRITICAL findings, reaped-in-flight) raise X.2 alerts routed per the operating model.
4. All panels are P02 RBAC-scoped (Auditor read-only; org_unit scoping for HR; field masks on serialization).
5. Metrics exported to G14.
6. **(R18)** Each alert class shows its owner, on-call routing, and resolution-SLA tier (e.g. near-retirement MISSING_SR = expedited).

**Business Rules.**
- BR-13.1 Thresholds are config-driven (`integration_config`).
- BR-13.2 Alerts deduplicated and escalate by severity per the on-call rota (X.2 dedup/throttle).
- BR-13.3 Dashboard read-only except acknowledge-alert actions (IntegOps).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_dead_letter`, `reconciliation_run/finding`, `historical_leave_batch`, `relay_partition_lease` | Aggregate reads |
| `integration_config` | Thresholds |
| `notifications` (X.2) | Alerts |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dashboard/summary` | Aggregated KPIs |
| `GET /api/v1/lsr/dashboard/metrics` | Time-series |
| `POST /api/v1/lsr/alerts/{id}/ack` | Acknowledge |

**UI Behavior Notes.** Cards (queue/lag/DLQ/reaped/breaker), trend charts, findings-by-severity, batch progress, on-call/SLA panel; canonical empty/loading/error states; alert banner with ack.

**Edge Cases.**
- No data yet → empty-state guidance.
- Metric pipeline lag → "as of" timestamp shown.
- Alert storm during outage → grouped alert (X.2 dedup).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DashboardAggregator`, `MetricsService`, `AlertEvaluator`, `OnCallRouter` (X.2/W.3), web console |
| Backend flow | Aggregate queries + cached metrics → summary/timeseries APIs → X.2 alert routing |
| Data operations | Read-only aggregates; X.2 notification on breach |
| Validation | Window bounds; P02 RBAC scope |
| Authorization | P02: role-scoped read; IntegOps ack |
| State changes & side effects | Alert notifications; ack state |
| Failure handling | Stale cache → show "as of"; degrade gracefully (`ERR-LOADFAIL`) |
| Dependencies | All G04 ledgers; G14; X.2 |
| Test guidance | Aggregation correctness; threshold breach alert; reaped-in-flight surfacing; on-call routing; RBAC scoping; empty/error states |

---

### FR-14 — Integration audit & evidence pack

- **ID:** FR-14
- **Module:** G04
- **Primary Role(s):** Auditor (read/export), SR Custodian
- **User Story:** *As an Auditor, I want to retrieve, for any employee or time window, the complete provable chain from leave decision to SR entry (including lineage, corrections, statutory citations, reconciliations, DLQ resolutions, and the pre-pension certificate), so that I can certify statutory completeness and integrity.*

**Description.** Produces an exportable, immutable evidence pack joining, **by `leave_spell_lineage_id`**: source leave event → outbox → posting log → SR entry (and correction chain) → mapping `statutory_rule_ref` citations → any reconciliation/integrity findings/remediations → DLQ history → pre-pension certificate. The G12 SR side and the **P05 `audit_log`** trail are read via the **P05 `Audit.query`/`Audit.export`** contract (read is itself audited; PII masked per viewer tier). Supports per-employee, per-batch, and per-time-window queries; export is read-only, watermarked, checksummed, and itself P05-captured.

**Acceptance Criteria.**
1. For a given employee, the full leave→SR chain (incl. corrections, by lineage) is reconstructable and exportable.
2. The pack lists any reconciliation/integrity findings and their resolution state for the scope.
3. DLQ items and their resolutions in scope are included.
4. Export action is P05-captured (who, when, scope) via `Audit.export`.
5. The pack is tamper-evident (hash/checksum) and read-only; SR rows are P05-immutable (hash-chain OPEN-PLAT-03).
6. The pack includes the mapping `statutory_rule_ref` citations for each posted entry and the latest pre-pension certificate (FR-18).

**Business Rules.**
- BR-14.1 Auditor access is read-only across all G04 data, including the P05 `audit_log` (via Org-Admin read + entitlement, RBAC §3.2).
- BR-14.2 Exports carry a generation timestamp, scope, and integrity checksum.
- BR-14.3 PII minimisation: leave reason detail excluded unless statutorily required; audit PII masked per RBAC tier.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_correction_link`, `service_register_events` (G12), `sr_event_mapping`, `reconciliation_finding`, `capture_integrity_finding`, `sr_dead_letter`, `prepension_certificate`, `audit_log` (P05) | Read/join by lineage |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/audit/chain?employeeId=` | Reconstruct chain (lineage) |
| `POST /api/v1/lsr/audit/export` | Generate evidence pack (P05 `Audit.export`) |

**UI Behavior Notes.** Audit explorer: timeline visualisation of leave→SR→correction chain by lineage with citations; export button (PDF/CSV/JSON) with checksum.

**Edge Cases.**
- Very long service history → paginated/chunked export.
- Chain with multiple corrections → full lineage rendered.
- Missing link (pre-integration) → flagged "no integration record (migrated)".

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AuditChainBuilder`, `EvidencePackExporter`, `ChecksumService` (P05 `Audit.export`) |
| Backend flow | Join across ledgers by lineage/employee → render → export + checksum (read audited) |
| Data operations | Read-only joins; P05 export record |
| Validation | Scope bounds; P02 RBAC (Auditor) |
| Authorization | P02: Auditor/SR Custodian read; export audited |
| State changes & side effects | P05 export record only |
| Failure handling | Partial data → annotate gaps; never fabricate |
| Dependencies | All G04 ledgers; G12; P05; FR-18 |
| Test guidance | Chain reconstruction by lineage; citation inclusion; checksum integrity; export audit; gap annotation |

---

### FR-15 — Stuck-in-flight lease reaper *(R1/AI-2)*

- **ID:** FR-15
- **Module:** G04
- **Primary Role(s):** System (`JOB-G04-REAPER`), IntegOps (observe/ack)
- **User Story:** *As the integration, I want a sweeper that detects `IN_FLIGHT` events whose processing lease has expired (e.g. the relay crashed mid-post) and returns them to retry-eligible with an alert, so that no event is ever silently stranded between claim and outcome.*

**Description.** When the relay claims an event it sets `claimed_at` and `lease_expires_at = now + lease_timeout`. The reaper runs as **`JOB-G04-REAPER` on the X.1 runner** (≤ 2 min cadence, per-tenant isolation), finds `IN_FLIGHT` rows whose `lease_expires_at` has passed, returns them to `FAILED` (retry-eligible), increments `attempt_count`, releases any stale `relay_partition_lease`, appends `sr_posting_log`, and emits a metric + **X.2** alert. Because posting is idempotent (lineage dedupe key, X.3 outbound), a re-post of an event that actually reached G12 returns `DUPLICATE_NOOP` then marks POSTED.

**Acceptance Criteria.**
1. An `IN_FLIGHT` row with an expired lease is returned to retry-eligible within one reaper interval.
2. Reaping increments `attempt_count`, releases stale partition leases, and never exceeds `max_retries` (then DLQ).
3. A re-post of an event that previously succeeded at G12 returns `DUPLICATE_NOOP` (no duplicate SR entry).
4. Every reap appends a `sr_posting_log` row and raises a metric + X.2 alert (`reaped_in_flight_count`).
5. The state transition `IN_FLIGHT → (lease expired) → FAILED` is recorded (state table 10.1).
6. **(v3)** A terminal reaper-job failure emits `JOB-FAIL → MSG-SYS-JOBFAIL`.

**Business Rules.**
- BR-15.1 `lease_timeout` and `reaper_interval` are config-driven (`integration_config`).
- BR-15.2 Reaping is safe under idempotency; the reaper never posts to G12 directly — it only re-enqueues.
- BR-15.3 A row reaped repeatedly up to `max_retries` dead-letters with class `UNKNOWN`/`UPSTREAM_DOWN` as classified.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Find expired IN_FLIGHT; reset to FAILED |
| `relay_partition_lease` | Release stale lease |
| `sr_posting_log` | Append reap event |
| `integration_config` | lease_timeout / reaper_interval |
| `notifications` (X.2) | Reaped alert |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/outbox?status=IN_FLIGHT&leaseExpired=true` | Observe stranded rows |
| (internal) `JOB-G04-REAPER` | Scheduled recovery on X.1 |

**UI Behavior Notes.** Dashboard card "Reaped in-flight (last 24h)"; alert banner when > 0; drill-down list with lineage and attempt count.

**Edge Cases.**
- Relay alive but slow (lease too short) → lease renewal extends `lease_expires_at`; reaper only acts on truly expired leases.
- Event reaped after genuine G12 success → re-post `DUPLICATE_NOOP` → POSTED (self-heal).
- Mass reap after node crash → bounded by rate-limit; spread by jitter.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `InFlightReaper` (`JOB-G04-REAPER`), `LeaseRenewer`, `PartitionLeaseManager` |
| Backend flow | Scheduled sweep (X.1) → select expired IN_FLIGHT → reset FAILED + attempt++ → release partition lease → log + X.2 alert |
| Data operations | UPDATE outbox; UPDATE/DELETE partition lease; INSERT posting_log; X.2 notification |
| Validation | Lease expiry check; attempt_count ≤ max_retries |
| Authorization | P02: reaper service principal |
| State changes & side effects | Outbox FAILED; metric `reaped_in_flight_count`; X.2 alert |
| Failure handling | Persistent failure → DLQ after max_retries; `JOB-FAIL` on terminal |
| Dependencies | FR-03 (lease), FR-04 (retry/DLQ), X.1 runner, config |
| Test guidance | Crash-mid-post recovery; lease renewal vs expiry; idempotent re-post; max_retries→DLQ; partition lease release |

---

### FR-16 — G12 SR write-port bilateral contract & CI conformance test *(R2/AI-3; on X.3)*

- **ID:** FR-16
- **Module:** G04
- **Primary Role(s):** Sys Admin / IntegOps (register/run), SR Custodian + G12 owner (sign), Auditor (read)
- **User Story:** *As the integration owner, I want the G12 SR write port governed by a signed bilateral contract with an automated CI conformance test, so that the exactly-once-effect guarantee rests on a verified dependency rather than an assumption — and live posting cannot be enabled until conformance passes.*

**Description.** The G12 write port is a **net-new gov ledger endpoint running on the P05 audit substrate** (DB-trigger, immutable, ≥7-yr), reached as an **X.3 outbound integration** (circuit-breaking, outbound idempotency, payload versioning, credentials from P04). It is specified as a **signed bilateral contract** and exercised by a **CI conformance test** (`JOB-G04-CONFORMANCE`) recorded as `port_conformance_run`. The contract mandates: dedupe-key **retention ≥ 7 years** (≥ max replay/backfill horizon, aligned to P05 ≥7-yr); persistence + **indexing** of `dedupe_key`, `correlationId`, and `leave_spell_lineage_id` on each SR entry; **append-only** immutability (intrinsic to P05 — UPDATE/DELETE rejected); exact `ERR-G04-SR-CONFLICT` (409) semantics; payload-version negotiation (X.3); and a stable `sr_event_id` returned on both first post and duplicate no-op. Live posting is **gated** on the latest conformance run being PASS (data integrity rule 14, `VAL-G04-CONFORM`).

**Acceptance Criteria.**
1. A `port_conformance_run` records `dedupe_retention_days`, index verification, append-only verification, and dedupe-replay verification with PASS/FAIL and evidence checksum.
2. A run with `dedupe_retention_days < 2557` (≈7y) results in FAIL.
3. A dedupe-replay test posts the same `dedupe_key` after simulating the retention horizon and verifies the original `sr_event_id` is returned (no second row).
4. An append-only test verifies UPDATE/DELETE on an SR entry is rejected (P05 substrate).
5. Live posting cannot be enabled unless the latest run for the active contract version is PASS.
6. The contract version and conformance result surface in the audit evidence pack (FR-14) and dashboard (FR-13).

**Business Rules.**
- BR-16.1 The conformance test runs in CI on every contract/payload version change and on a scheduled cadence (`JOB-G04-CONFORMANCE`).
- BR-16.2 A FAIL blocks enabling/continuing live posting; IntegOps alerted CRITICAL via X.2.
- BR-16.3 The contract is signed by both G04 (SR Custodian) and G12 owners; changes follow an amendment workflow (P01).

**Data Model References.**

| Entity | Use |
|---|---|
| `port_conformance_run` | Insert run result |
| `integration_config` | Live-posting enablement gate |
| `audit_log` (P05) / `notifications` (X.2) | Capture / FAIL alert |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/port/conformance/runs` | Trigger a conformance run (CI/Sys Admin) |
| `GET /api/v1/lsr/port/conformance/runs` | List results (cursor) |
| `GET /api/v1/lsr/port/conformance/runs/{id}` | Result detail + checksum |

**UI Behavior Notes.** "Port Conformance" admin screen: contract/payload version, last run result, retention days, index/append-only/replay checkmarks, evidence checksum, live-posting-gate badge.

**Edge Cases.**
- G12 dedupe window shorter than replay horizon → FAIL → posting gate stays closed; remediated by G12 before go-live.
- Contract version bump without re-run → gate treats as not-conformant until a PASS run exists.
- Conformance evidence tampered → checksum mismatch flagged.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ConformanceRunner` (`JOB-G04-CONFORMANCE`), `DedupeReplayProbe`, `AppendOnlyProbe`, `IndexVerifier`, `EnablementGate` |
| Backend flow | Run probes against G12 port (X.3) → record result + checksum → set/clear live-posting gate |
| Data operations | INSERT port_conformance_run; UPDATE config gate |
| Validation | retention ≥ 2557d; indexes present; append-only; dedupe replay; `VAL-G04-CONFORM` |
| Authorization | P02: Sys Admin/CI run; SR Custodian + G12 sign |
| State changes & side effects | Gate open/closed; X.2 alert on FAIL |
| Failure handling | FAIL blocks posting (`ERR-G04-PORT-NOT-CONFORMANT`); CRITICAL alert |
| Dependencies | G12 port; X.3; config; X.2; X.1 |
| Test guidance | Retention-too-short FAIL; dedupe-replay PASS; append-only reject; gate enforcement; checksum integrity |

---

### FR-17 — Source-ledger ↔ outbox integrity reconciliation *(R7/R17/AI-4/AI-18)*

- **ID:** FR-17
- **Module:** G04
- **Primary Role(s):** System (`JOB-G04-INTEGRITY`), IntegOps / SR Custodian (review)
- **User Story:** *As an SR Custodian, I want a periodic integrity reconciliation between the G03 leave ledger and the G04 outbox — including capture-signature verification — so that any capture loss or forged event is detected and remediated, regardless of whether the outbox is written in G03's transaction or by polling.*

**Description.** A `SOURCE_OUTBOX_INTEGRITY` reconciliation run (scheduled via **`JOB-G04-INTEGRITY` on X.1**, ≥ daily; on-demand) compares G03's leave ledger (SR-affecting decisions) against `leave_event_outbox` coverage and verifies each row's `payload_signature`. It raises `capture_integrity_finding`s: `LEDGER_WITHOUT_OUTBOX` (capture loss → backfill via FR-12), `OUTBOX_WITHOUT_LEDGER` (spurious/forged → investigate), `SIGNATURE_MISMATCH` (tampered/forged payload → `security_audit_log`). This is the compensating control that makes the capture guarantee robust under either capture architecture (D-1) and closes the fraudulent-entry vector.

**Acceptance Criteria.**
1. A run compares G03 SR-affecting ledger entries against outbox coverage by lineage and reports findings.
2. `LEDGER_WITHOUT_OUTBOX` raised for any SR-affecting ledger entry with no outbox row; remediable by deterministic backfill (FR-12).
3. `OUTBOX_WITHOUT_LEDGER` raised for any outbox row with no matching ledger entry.
4. `SIGNATURE_MISMATCH` raised for any outbox row failing HMAC verification (+ `security_audit_log`).
5. Findings carry severity; near-retirement gaps escalated (tiered SLA).
6. Runs are scheduled (`JOB-G04-INTEGRITY`, ≥ daily) and on-demand; read-only against G03.

**Business Rules.**
- BR-17.1 Matching by `leave_spell_lineage_id` (fallback business key for legacy).
- BR-17.2 `SIGNATURE_MISMATCH` is CRITICAL and blocks posting of the affected event (DLQ `SIGNATURE_INVALID`).
- BR-17.3 Backfill remediation of `LEDGER_WITHOUT_OUTBOX` uses deterministic lineage (FR-12 BR-12.1) so it dedupes with any later genuine emission.

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_run` (SOURCE_OUTBOX_INTEGRITY) | Header |
| `capture_integrity_finding` | Findings |
| `leave_ledger_entries` (G03) | Read |
| `leave_event_outbox` | Coverage + signature verify |
| `audit_log`/`security_audit_log` (P05) / `notifications` (X.2) | Capture / alert |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/integrity/runs` | Trigger integrity reconciliation |
| `GET /api/v1/lsr/integrity/findings` | List integrity findings (cursor) |

**UI Behavior Notes.** "Capture Integrity" panel: run history, findings by type/severity, one-click backfill (FR-12) for LEDGER_WITHOUT_OUTBOX, signature-mismatch alerts.

**Edge Cases.**
- Polling-mode deployment (fallback of D-1) → this FR is the primary loss-detection control.
- In-tx deployment → defense-in-depth integrity check.
- Forged outbox row (compromised writer) → SIGNATURE_MISMATCH CRITICAL.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IntegrityReconEngine` (`JOB-G04-INTEGRITY`), `SignatureVerifier`, `LedgerOutboxMatcher`, `BackfillTrigger` |
| Backend flow | Load G03 ledger + outbox by lineage → diff coverage → verify signatures → persist findings → X.2 alert |
| Data operations | Bulk read G03 + outbox; INSERT run + integrity findings |
| Validation | Lineage match; HMAC verify (`VAL-G04-SIG`); scope bounds |
| Authorization | P02: system (scheduled); IntegOps/SR Custodian (trigger/review) |
| State changes & side effects | New findings; backfill enqueue; CRITICAL alert + `security_audit_log` on signature mismatch |
| Failure handling | Partial run → resumable checkpoint; `JOB-FAIL` on terminal |
| Dependencies | G03 ledger read; FR-01 signature; FR-12 backfill; X.1 |
| Test guidance | Ledger-without-outbox→backfill; outbox-without-ledger; signature-mismatch CRITICAL; polling-mode loss detection |

---

### FR-18 — Pre-pension completeness certificate *(AI-21)*

- **ID:** FR-18
- **Module:** G04
- **Primary Role(s):** SR Custodian (sign via P01), Pension Officer / G11 (consume), Auditor (read)
- **User Story:** *As a Pension Officer, I want a signed, checksummed certificate asserting that an employee's leave→SR record is complete — zero open HIGH/CRITICAL findings, full lineage, no remaining provisional entries — so that G11 can gate pension processing on a provable contract rather than a dashboard status.*

**Description.** After a `PRE_PENSION` reconciliation (FR-06) for an employee/cohort, G04 produces a `prepension_certificate` asserting: zero open HIGH/CRITICAL reconciliation **and** integrity findings, complete lineage, zero remaining `PROVISIONAL` migrated entries, and the net total non-qualifying days. A PASS certificate is **signed by the SR Custodian** (capability flag `g04.prepension.sign`, via a configured P01 sign flow) and carries a checksum over the certified evidence bundle. **G11** consumes it as a hard gate input; a FAIL certificate lists blocking items.

**Acceptance Criteria.**
1. A certificate is generated only from a completed PRE_PENSION run for the scope.
2. PASS requires `open_high_critical_findings = 0`, `lineage_complete = true`, `provisional_entries_remaining = 0`; otherwise FAIL with the blocking list.
3. A PASS certificate is signed by an SR Custodian (P01 maker-checker: generated by system/HR maker, signed by Custodian) and checksummed.
4. The certificate records `total_non_qualifying_days` reconciled to the leave ledger.
5. G11 can retrieve the latest certificate for an employee; consumption timestamped (`consumed_by_g11_at`).
6. The certificate is append-only, tamper-evident, P05-captured, and included in the audit evidence pack (FR-14).

**Business Rules.**
- BR-18.1 No PROVISIONAL migrated entry may be present for a PASS (FR-11 BR-11.4).
- BR-18.2 A certificate is invalidated (superseded by a new run) if any new HIGH/CRITICAL finding arises before pension processing completes.
- BR-18.3 Any qualifying-service change after a certificate is consumed triggers the FR-09 post-pension hard gate (P01) and certificate re-issue.

**Data Model References.**

| Entity | Use |
|---|---|
| `prepension_certificate` | Insert (append-only) |
| `reconciliation_run` (PRE_PENSION) | Source |
| `reconciliation_finding` / `capture_integrity_finding` | Gate inputs |
| `historical_leave_record` | Provisional check |
| `workflow_instances` (P01) | Custodian sign |
| `audit_log` (P05) | DB-trigger capture |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/prepension/certificates` | Generate (from a PRE_PENSION run) |
| `POST /api/v1/lsr/prepension/certificates/{id}/sign` | SR Custodian sign (P01) |
| `GET /api/v1/lsr/prepension/certificates?employeeId=` | G11 retrieves latest |

**UI Behavior Notes.** "Pre-Pension Certificate" screen: per-employee PASS/FAIL, blocking-item list, sign action (Custodian), checksum, G11 consumption timestamp; export to evidence pack.

**Edge Cases.**
- Open HIGH finding → FAIL certificate with remediation links (FR-07).
- Remaining provisional entry → FAIL until adjudicated (FR-11).
- New finding after sign but before pension completion → certificate invalidated, re-run required.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CertificateGenerator`, `GateEvaluator`, `ChecksumService`, P01 sign flow |
| Backend flow | From PRE_PENSION run → evaluate gates → compute totals → checksum → P01 Custodian sign → expose to G11 |
| Data operations | INSERT prepension_certificate; read findings/provisional |
| Validation | Gate criteria; totals reconcile; signer authority (capability flag) |
| Authorization | P02 + P01: system/HR generate; SR Custodian sign; G11/Pension read |
| State changes & side effects | New certificate; consumption timestamp; P05 capture |
| Failure handling | FAIL lists blockers; invalidation on new finding |
| Dependencies | FR-06, FR-09, FR-11, FR-17, G11, P01 |
| Test guidance | PASS/FAIL gate logic; provisional-blocks-pass; checksum integrity; invalidation on new finding; G11 consumption |

---
## Section 7 — UI Requirements

The G04 surface is an **operational console** (not an end-user app), built **within the platform logical architecture** (physical stack is an engineering choice, reconciliation §C) and honouring the **canonical UI-state standard** (Foundation §3: empty / loading / error / no-permission / partial-data; masked fields per RBAC; `E·AR` request-change pattern), WCAG 2.1 AA, dark-mode, responsive (375/768/1280 px; touch ≥ 44×44). Screens:

1. **Integration Dashboard** (FR-13) — KPI cards (outbox by status incl. EXCLUDED/BLOCKED, posting P95 lag, success rate, DLQ depth/age, **reaped-in-flight count**, recon pending/quarantined bucket, relay paused/running, **X.3 breaker state**), trend charts, findings-by-severity, batch progress, **on-call/SLA panel**, X.2 alert banner with acknowledge.
2. **Posting Log** (FR-03) — searchable table (lineage_id, correlation_id, employee, outcome, latency, SR link), filters, detail drawer; partition/lease in-order progress view.
3. **DLQ Triage Board** (FR-05) — Kanban (Open/In review/Resolved), detail drawer with leave-vs-SR snapshot and error history, replay/discard actions, P01 checker approval inbox; signature-class items flagged not operator-editable.
4. **Reconciliation** (FR-06/07) — run history, trigger with scope picker, findings table with side-by-side diff viewer (chain-resolved), **pending/quarantined informational panel**, remediation proposal preview, P01 approve/reject/waive.
5. **Mapping Catalog** (FR-02) — versioned list with disposition (POST_SR/EXCLUDED_NON_SR), effective-date, status, **statutory citation**, version diff, predicate builder, straddle-handling selector, P01 publish gate (W.2-bound form).
6. **Historical Digitisation** (FR-11) — batch wizard (import → validation report incl. confidence → P01 approval → post → reconciliation summary) on **P06**, **provisional-entry adjudication queue**, editable reject grid, mandatory citation field.
7. **Replay / Backfill** (FR-12) — scope builder, dry-run preview, P01 approval gate, progress tracker.
8. **Audit Explorer** (FR-14) — leave→SR→correction chain timeline by lineage with citations, export with checksum (P05 `Audit.export`).
9. **Port Conformance** (FR-16) — contract/payload version, last run result, retention days, index/append-only/replay checks, evidence checksum, live-posting-gate badge.
10. **Capture Integrity** (FR-17) — integrity run history, findings by type/severity, one-click backfill, signature-mismatch alerts.
11. **Pre-Pension Certificate** (FR-18) — per-employee PASS/FAIL, blocking-item list, sign action, checksum, G11 consumption status.
12. **Configuration** (FR-04/13/15) — retry/backoff/**lease/reaper**/SLA threshold settings, relay pause/resume (Sys Admin / IntegOps); X.3 breaker thresholds.

**Cross-cutting UI rules:** all destructive/SR-writing actions show a confirm modal and route to a **P01** maker-checker flow; every list uses **cursor pagination** (max 100); all timestamps display `DD-MMM-YYYY HH:mm` in user TZ; lineage_id, correlation_id and sr_event_id are click-to-copy; toasts for async actions; **masked fields per RBAC** (P02 serialization mask); no skeleton-only screens (real data, fields, states).

---

## Section 8 — API & Integration

### 8.1 Conventions (platform-adopted — Foundation §1; reconciliation §C)

- Base path `/api/v1/lsr` (G04 management surface). All ledger writes go to G12's **single canonical write-port `{G12_BASE}/api/v1/sr/ingest`** (and `/api/v1/sr/ingest/reversal`) over **X.3** (credentials from P04) — never `/api/v1/sr/events` or a direct table INSERT. Any G04-local trigger endpoint is an internal façade that **relays to `POST /api/v1/sr/ingest`**.
- **Versioning:** all endpoints under `/api/v1`; breaking changes ship under a new major prefix; additive fields non-breaking.
- **Auth:** Bearer JWT (OIDC/SSO+MFA); endpoints never re-implement permission logic — they call **P02 `Authorization.check`**; row scoping by the five RBAC dimensions.
- **Idempotency:** unsafe POSTs accept an **`Idempotency-Key`** header (repeat within 24h returns the original result → `CONFLICT`); SR write calls additionally carry the **mapping-version-independent `dedupe_key`** as the **X.3 outbound idempotency key** (G12-persisted ≥7y).
- **Pagination:** **cursor only** — `?limit=` (default 25, max 100) + `cursor=`; response carries `next_cursor`. Offset/page paging not used.
- **Sorting/filtering:** `?sort=field:asc|desc`, field filters per endpoint.
- **Correlation id:** every request carries/assigned **`X-Correlation-Id`**, echoed in the response header and threaded to every P05 audit + log line (not a body `requestId`).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "...", "details": { } } }`.

### 8.2 Error-code catalog (platform 8-code table + `ERR-G04-*`)

**Standard (Foundation §1.2 — cited, not restated):** `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500). No 503 — upstream G12 unavailability is handled by **X.3** retry/breaker and surfaced as `PRECONDITION_FAILED` (gate) or `INTERNAL` + `ERR-LOADFAIL` to UI (reconciliation §C).

**Module-unique `ERR-G04-*` (registered in Foundation §5):**

| Code | HTTP | Meaning |
|---|---|---|
| `ERR-G04-MAPPING-NOT-FOUND` | 422 (`VALIDATION_FAILED`) | No published POST_SR mapping for an SR-affecting (leave_type, event_type) |
| `ERR-G04-MAPPING-OVERLAP` | 409 (`CONFLICT`) | Overlapping effective ranges at publish |
| `ERR-G04-SR-CONFLICT` | 409 (`CONFLICT`) | G12 rejected due to conflicting SR state |
| `ERR-G04-ORPHAN-CORRECTION` | 422 (`VALIDATION_FAILED`) | Correction has no locatable original entry |
| `ERR-G04-IDEMPOTENT-DUPLICATE` | 200 | Duplicate detected; original sr_event_id returned (no-op) |
| `ERR-G04-DLQ-REPLAY-BLOCKED` | 409 (`CONFLICT`) | Replay blocked (mapping still missing / signature unfixed) |
| `ERR-G04-BATCH-VALIDATION-FAILED` | 422 (`VALIDATION_FAILED`) | Historical batch has rejected records blocking post |
| `ERR-G04-RELAY-PAUSED` | 412 (`PRECONDITION_FAILED`) | Posting paused by manual relay-pause override |
| `ERR-G04-SR-UNAVAILABLE` | 412/500 | G12 SR port unreachable (X.3 mapped; retryable; not a public 503) |
| `ERR-G04-SCOPE-TOO-LARGE` | 422 (`VALIDATION_FAILED`) | Replay/backfill/recon scope exceeds bound |
| `ERR-G04-LINEAGE-MISSING` | 422 (`VALIDATION_FAILED`) | Captured event lacks `leave_spell_lineage_id` |
| `ERR-G04-SIGNATURE-INVALID` | 403 (`FORBIDDEN`) | Capture payload HMAC verification failed |
| `ERR-G04-BLOCKED-AWAITING-ORIGINAL` | 409 (`CONFLICT`) | Correction not posting-eligible until original POSTED |
| `ERR-G04-PORT-NOT-CONFORMANT` | 412 (`PRECONDITION_FAILED`) | Live posting gate closed: no passing G12 conformance run |
| `ERR-G04-PROVISIONAL-ENTRY` | 409 (`CONFLICT`) | Operation blocked by an unadjudicated provisional migrated entry |
| `ERR-G04-CERTIFICATE-FAILED` | 422 (`VALIDATION_FAILED`) | Pre-pension certificate FAIL (blocking items remain) |

> **Override note (reconciliation §C):** v2's `VALIDATION_ERROR(400)`→`VALIDATION_FAILED(422)`; `AUTH_REQUIRED(401)`→`UNAUTHENTICATED`; `UPSTREAM_UNAVAILABLE(503)`/`LSR_CIRCUIT_OPEN(503)` dropped (X.3 handles upstream + breaker; surfaced as 412/500); `LSR_*`→`ERR-G04-*`; envelope `requestId` body field → `X-Correlation-Id` header.

### 8.3 JSON examples

**Post SR entry (relay → G12 canonical ingest over X.3) — canonical dedup tuple + mandatory `fact_key`:**
```http
POST /api/v1/sr/ingest
Idempotency-Key: k:linaa:LEAVE_APPROVED:1
Authorization: Bearer <relay-jwt>
X-Correlation-Id: c0de-aa
```
```json
{
  "tenantId": "t-001", "entityId": "e-dir-07",
  "employeeId": "emp-12",
  "sourceModule": "G04",
  "sourceReferenceId": "lin-aa:LEAVE_APPROVED",
  "sourceEventVersion": 1,
  "factKey": "EL_AVAILED:emp-12:2026-04-01:2026-04-10",
  "leaveSpellLineageId": "lin-aa",
  "eventSequence": 1,
  "eventTypeCode": "EL_AVAILED",
  "correlationId": "c0de-aa",
  "spell": { "start": "2026-04-01", "end": "2026-04-10", "days": 10.0 },
  "qualifyingServiceRule": "QUALIFYING",
  "statutoryRuleRef": "CCS (Leave) Rules 1972 r.26",
  "annotations": [],
  "provenance": { "type": "LIVE_CAPTURE", "mappingVersion": 3, "payloadVersion": "1.1" }
}
```
**Success (201):** `{ "srEventId": "sr-77", "status": "CREATED" }` (correlation id in `X-Correlation-Id` response header)

**Post reversal envelope (cancellation → G12 reversal port):**
```http
POST /api/v1/sr/ingest/reversal
Idempotency-Key: k:linaa:LEAVE_CANCELLED:2
```
```json
{
  "tenantId": "t-001", "entityId": "e-dir-07", "employeeId": "emp-12",
  "sourceModule": "G04",
  "sourceReferenceId": "lin-aa:LEAVE_CANCELLED",
  "sourceEventVersion": 2,
  "isReversal": true,
  "reversesSourceReferenceId": "lin-aa:LEAVE_APPROVED",
  "eventTypeCode": "EL_AVAILED_CANCELLED",
  "factKey": "EL_AVAILED:emp-12:2026-04-01:2026-04-10",
  "leaveSpellLineageId": "lin-aa",
  "correlationId": "c0de-ab"
}
```

**Idempotent duplicate (incl. after remap — key unchanged):**
```json
{ "srEventId": "sr-77", "status": "DUPLICATE_NOOP", "code": "ERR-G04-IDEMPOTENT-DUPLICATE" }
```

**Correction not yet eligible (ordering guard, 409):**
```json
{ "error": { "code": "ERR-G04-BLOCKED-AWAITING-ORIGINAL", "message": "Correction for lineage lin-aa seq 2 held until original (seq 1) is POSTED", "field": "eventSequence", "details": { "lineage": "lin-aa", "seq": 2 } } }
```

**Port conformance FAIL (retention too short):**
```json
{ "conformanceId": "pc-02", "contractVersion": "1.0", "dedupeRetentionDays": 365, "result": "FAIL", "blocking": "retention < 2557d" }
```

**Reconciliation finding (MISSING_SR — pending excluded):**
```json
{
  "findingId": "f-01", "runId": "r-01", "employeeId": "emp-12",
  "leaveSpellLineageId": "lin-12",
  "findingType": "MISSING_SR", "severity": "HIGH",
  "leaveSnapshot": { "leaveType": "EL", "start": "2026-04-01", "end": "2026-04-10" },
  "srSnapshot": null, "remediationState": "OPEN",
  "note": "Not currently PENDING/backoff/DLQ"
}
```

**Pre-pension certificate (PASS):**
```json
{
  "certificateId": "cert-01", "employeeId": "emp-12", "runId": "r-03",
  "result": "PASS", "openHighCriticalFindings": 0, "lineageComplete": true,
  "provisionalEntriesRemaining": 0, "totalNonQualifyingDays": 121.0,
  "checksum": "sha256:9f2c…", "signedBy": "custodian-7"
}
```

**Mapping overlap error (409):**
```json
{ "error": { "code": "ERR-G04-MAPPING-OVERLAP", "message": "Effective range overlaps published version 3 for (EL, APPROVED)", "field": "effective_from" } }
```

### 8.4 Integration points

| Direction | Counterparty | Contract / platform service |
|---|---|---|
| Inbound | **G03** (≈ M04/M05) | Signed transactional outbox of leave events (in-DB); issues `leave_spell_lineage_id` |
| Outbound | **G12** (on P05) | **Contracted** idempotent SR write port (FR-16) over **X.3** (circuit-breaking, idempotency, payload versioning; creds P04) + SR read API |
| Outbound | **G11** | Qualifying-impact summary API / SR flags + **pre-pension certificate (FR-18)** |
| Outbound | **G06** | Annotations API |
| Outbound | **G14** (≈ M16) | Metrics/KPI export |
| Bi-dir | **G13** (≈ M11) | Document provenance reference |
| Outbound | **X.2** | Alerts/SLA breach, reaped-in-flight, conformance FAIL, signature mismatch (`MSG-G04-*`) |
| Infra | **X.1** | `JOB-G04-*` registration (relay/reaper/recon/integrity/conformance/dlq-sla) |
| Infra | **P05** | Audit capture (DB-trigger) + `Audit.query`/`Audit.export` |
| Infra | **P01** | Maker-checker flows (`startInstance`/`advance`/`approve`/`reject`/`sendBack`) |
| Infra | **P06** | Legacy leave migration (ETL+V, `migration_runs`) |

### 8.5 G12 SR write-port bilateral contract (FR-16 summary)

| Clause | Requirement |
|---|---|
| Endpoint | **`POST /api/v1/sr/ingest`** (+ `POST /api/v1/sr/ingest/reversal`) — G12's only ledger write path; no `/api/v1/sr/events`, no direct INSERT |
| Transport | **X.3 outbound integration** — circuit-breaking, outbound idempotency, payload versioning, per-integration error mapping; credentials from **P04 `integration_credentials`** |
| Dedup tuple | Persist + validate the canonical `(source_module="G04", source_reference_id, source_event_version)` tuple; `Idempotency-Key` header = `dedupe_key` |
| `fact_key` | **Mandatory** semantic-dedup field (qualifying-service-bearing events); derived per the type's `fact_correlation_rule`; missing ⇒ `SR_FACT_KEY_REQUIRED` |
| Scoping | `tenant_id` + `entity_id` explicit required fields on the ingest payload (hashed into G12 `entry_hash`) |
| Retention | Dedupe-key retention ≥ **2557 days (7y)** ≥ max replay/backfill horizon (aligned to P05 ≥7-yr) |
| Identity persistence | Persist + index `correlationId` and `leave_spell_lineage_id` on each SR entry |
| Immutability | Append-only; UPDATE/DELETE rejected (**intrinsic to the P05 substrate** G12 runs on; DB-trigger captured) |
| Duplicate semantics | Return original `sr_event_id` + `DUPLICATE_NOOP` on repeat key |
| Conflict semantics | `ERR-G04-SR-CONFLICT` (409) on genuine state conflict |
| Conformance | CI test (`port_conformance_run` / `JOB-G04-CONFORMANCE`) must PASS before the live-posting gate opens |

---

## Section 9 — Non-Functional Requirements (platform baseline)

| Category | Requirement |
|---|---|
| Performance | Relay P95 posting lag (approval→SR confirm) ≤ 5 min; management API p95 < 500 ms @ 300 concurrent; read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; reconciliation of 100k records < 30 min; reaper interval ≤ 2 min. |
| Throughput/Scalability **(R12)** | Right-sized to realistic government volume: **low thousands of leave decisions/day** sustained, **bursts only during migration/backfill**. Horizontal relay workers (`JOB-G04-RELAY`) use **per-partition (employee/lineage) in-order claiming**; a modest burst ceiling + rate-limit/back-pressure protects G12. The v1 50/s-500/s figures are removed as fantasy-scale. |
| Reliability **(R10/R11)** | **Exactly-once *effect*** = at-least-once delivery + idempotent dedupe, **conditional on the G12 port contract (FR-16)** and the **X.3 outbound idempotency**; no event loss (durable outbox + `JOB-G04-REAPER` + `JOB-G04-INTEGRITY`); **RPO < 1 h, RTO < 4 h; uptime 99.5%/month** (platform baseline, reconciliation §C). |
| Consistency | Eventual consistency between leave ledger and SR with bounded lag; state-aware reconciliation closes residual drift without false positives. |
| Availability/Resilience **(R13)** | Core: bounded retry + DLQ + **manual relay-pause**; **circuit-breaking provided by X.3** (platform), not a module-built optional breaker. |
| Ordering **(R5)** | Per-partition in-order delivery; a correction is never posted before its original is POSTED. |
| Security **(R17)** | OIDC/SSO+MFA (MFA mandatory for SR Custodian / Pension Officer); **P02** RBAC + org_unit scoping; relay principal limited to append-only SR write; **HMAC-signed capture payloads** with constrained outbox writers; TLS 1.2+; encryption at rest; OWASP ASVS. |
| Privacy | DPDP Act 2023 alignment; PII minimisation (no medical/leave-reason detail in G04 payloads); audit PII masked per RBAC tier; right-to-erasure only for non-statutory data (statutory retention floor applies). |
| Auditability | **P05 DB-trigger** captures every mutation (100%, zero gaps); append-only ledgers; statutory citations on every posted entry; tamper-evident evidence packs + certificates; SR tamper-evidence tracks **OPEN-PLAT-03** (hash-chain). |
| Observability | Structured logs with `X-Correlation-Id` + `leave_spell_lineage_id`; metrics (lag, throughput, DLQ depth, **reaped-in-flight**, recon pending bucket, error rate, X.3 breaker state, conformance result) → **G14**. |
| Maintainability | Mapping & config changes without redeploy (config cascade + in-flight version pinning); pinned mapping version per event. |
| Accessibility | Console WCAG 2.1 AA; keyboard/focus; dark mode; responsive 375/768/1280. |
| Data retention | Ledgers retained per statutory schedule; **dedupe-key + DLQ history retained ≥ 7 years** (aligned to FR-16 + P05 retention). |

---

## Section 10 — Workflow & State Diagrams (state tables)

### 10.1 Outbox event lifecycle *(lease/reaper, blocked-awaiting-original, excluded)*

| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | SR-affecting leave approved/cancelled/amended in G03 | PENDING | Signed outbox row written in tx (FR-01); P05 capture |
| (none) | Non-SR leave (EXCLUDED_NON_SR disposition) | EXCLUDED | Deliberate no-op; never DLQ'd (R8) |
| (none) | Correction whose original not yet POSTED | BLOCKED_AWAITING_ORIGINAL | Ordering guard (R5) |
| BLOCKED_AWAITING_ORIGINAL | Original reaches POSTED | PENDING | Now posting-eligible |
| PENDING | `JOB-G04-RELAY` claims (per-partition, in-order) | IN_FLIGHT | Partition lease; `claimed_at`/`lease_expires_at` set; mapping pinned |
| IN_FLIGHT | G12 success (X.3) | POSTED | sr_event_id stored; posting_log SUCCESS |
| IN_FLIGHT | Retryable failure | FAILED | attempt++; available_at=backoff |
| IN_FLIGHT | **Lease expired (`JOB-G04-REAPER`, FR-15)** | FAILED | attempt++; partition lease released; X.2 alert (R1) |
| FAILED | available_at reached | IN_FLIGHT | Re-claim |
| IN_FLIGHT | Permanent failure | DEAD_LETTERED | DLQ row created |
| FAILED | attempt_count > max_retries | DEAD_LETTERED | DLQ row created |
| DEAD_LETTERED | Replay (resolved, P01) | PENDING | Same (lineage) dedupe key (FR-05/12) |

### 10.2 DLQ item lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Assign | IN_REVIEW | Operator assigned |
| IN_REVIEW | Replay (P01 approved) | RESOLVED_REPLAYED | Mapping coverage / re-sign present; closed after POSTED |
| IN_REVIEW | Discard (P01 approved) | RESOLVED_DISCARDED | Justification required |
| IN_REVIEW | Checker rejects | IN_REVIEW | Rejection note |

### 10.3 Reconciliation finding lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Propose remediation | REMEDIATION_PROPOSED | Maker action → P01 |
| REMEDIATION_PROPOSED | Checker approves | APPROVED | Maker ≠ checker (P01/P02) |
| APPROVED | Apply succeeds + re-check clean | APPLIED | Correction appended / link reconstructed |
| APPROVED | Apply fails | OPEN | Error surfaced |
| OPEN/PROPOSED | Waive | WAIVED | Justification required |

### 10.4 Historical batch lifecycle *(P06; provisional adjudication)*

| Current | Event | Next | Guard |
|---|---|---|---|
| STAGED | Validate (P06) | VALIDATED | Records classified + confidence assigned; dry-run gate |
| VALIDATED | Checker approves (P01) | APPROVED | Maker ≠ checker |
| APPROVED | Post (all valid succeed) | POSTED | Idempotent (deterministic lineage); low-confidence → PROVISIONAL |
| APPROVED | Post (some fail) | PARTIALLY_POSTED | Failed retained (P06 source-row log) |
| STAGED/VALIDATED | Reject batch | REJECTED | Justification |
| (record) PROVISIONAL | Custodian adjudicates | ADJUDICATED_CONFIRMED / ADJUDICATED_REJECTED | Citation present; pension-eligible only when confirmed |

### 10.5 G12 downstream circuit-breaker state *(provided by X.3)*

| Current | Event | Next |
|---|---|---|
| CLOSED | Consecutive failures ≥ X.3 threshold | OPEN (X.2 alert) |
| OPEN | Cooldown elapsed | HALF_OPEN |
| HALF_OPEN | Probe succeeds | CLOSED |
| HALF_OPEN | Probe fails | OPEN |

*Breaking is platform-supplied via the X.3 integration framework; the module-level core control remains bounded retry + DLQ + manual relay-pause.*

### 10.6 Post-pension qualifying-change hard gate *(R11; on P01)*

| Current | Event | Next | Guard |
|---|---|---|---|
| Qualifying change requested, pension not started | Auto-post correction (flagged, post-audited) | POSTED | Routine tier (FR-08 BR-08.4) |
| Qualifying change requested, **pension processing started** | Route to P01 maker-checker | GATE_PENDING | Hard block; CRITICAL X.2 alert to G11 |
| GATE_PENDING | SR Custodian approves | APPLIED | Maker ≠ checker; certificate re-issued (FR-18) |
| GATE_PENDING | Rejected | BLOCKED | Change not applied; logged (P05) |

### 10.7 Port conformance gate *(R2; FR-16)*

| Current | Event | Next |
|---|---|---|
| GATE_CLOSED | Conformance run PASS (retention ≥ 7y) | GATE_OPEN (live posting enabled) |
| GATE_OPEN | New contract/payload version without re-run | GATE_CLOSED |
| GATE_OPEN/CLOSED | Conformance run FAIL | GATE_CLOSED (CRITICAL X.2 alert) |

---

## Section 11 — Notifications (on X.2)

All notifications run on the **X.2 infrastructure** (`IN_APP` + `EMAIL` in parallel; **EMAIL for statutory/approval notifications is mandatory and non-suppressible**, BRD §9.9; retry exponential backoff up to 5 attempts + DLQ; dedup/throttle/digest; every dispatch audit-logged). Templates are referenced by **`MSG-G04-*`** id (Foundation §5), never inlined; recipient/channel resolution is **W.3** config. System job-failure alerts use the shared **`MSG-SYS-JOBFAIL`** (X.1 `JOB-FAIL`).

### 11.1 IntegOps operating model & tiered resolution SLAs *(R18/AI-20)*

- **On-call rota:** IntegOps maintains a 24×5 on-call rota (business-day) with named primary + escalation secondary; SR Custodian is the statutory escalation point.
- **Ownership:** DLQ aging (`JOB-G04-DLQ-SLA`), reaped-in-flight alerts, port-conformance FAIL, signature-mismatch, and reconciliation HIGH/CRITICAL findings each have a named owner role and escalation path.
- **Tiered resolution SLAs:**

| Condition | Tier | Resolution SLA |
|---|---|---|
| `MISSING_SR` / capture loss for a **near-retirement** employee | Expedited | Within **4 business hours** |
| Open HIGH/CRITICAL reconciliation/integrity finding (general) | High | Within **2 business days** |
| DLQ item (general) | Standard | ≥ 99% within **2 business days** |
| Reaped-in-flight alert > 0 | Investigate | Acknowledge within **1 hour**; root-cause within 1 business day |
| Port conformance FAIL | Critical | Block live posting; remediate before any go-live/continuation |
| `SIGNATURE_MISMATCH` (possible forgery) | Critical | Immediate investigation; affected event quarantined; `security_audit_log` |

### 11.2 Notification catalog (`MSG-G04-*` ids via X.2/W.3)

| Event (`MSG-G04-*`) | Trigger | Recipients | Channel |
|---|---|---|---|
| Posting SLA breach | P95 lag > threshold | IntegOps | Dashboard + email |
| **Reaped-in-flight detected** | `JOB-G04-REAPER` recovers stranded IN_FLIGHT | IntegOps | Dashboard + email |
| Relay paused/resumed | Manual override | IntegOps, Sys Admin | Dashboard + email |
| G12 circuit-breaker OPEN | X.3 breaker trips | IntegOps, Sys Admin | Email + push |
| DLQ item created | Event dead-lettered | IntegOps | Dashboard + email (batched/digest) |
| DLQ depth threshold | Depth > config (`JOB-G04-DLQ-SLA`) | IntegOps, SR Custodian | Email |
| HIGH/CRITICAL finding | Reconciliation finding | SR Custodian, IntegOps | Email |
| **Near-retirement MISSING_SR** | Expedited-tier finding | IntegOps (primary), SR Custodian | Email + push |
| **Capture signature mismatch** | FR-17 SIGNATURE_MISMATCH | SR Custodian, IntegOps, Security | CRITICAL email + push |
| **Port conformance FAIL** | FR-16 run FAIL | IntegOps, Sys Admin, SR Custodian | CRITICAL email + push |
| Pre-pension finding open | PRE_PENSION run finds drift | Pension Officer, SR Custodian | Email |
| **Pre-pension certificate FAIL** | FR-18 blocking items | Pension Officer, SR Custodian | Email |
| Remediation needs approval | Maker submitted (P01) | SR Custodian | Workflow inbox + email |
| Batch approval / adjudication needed | Historical batch validated / provisional entry | SR Custodian | Workflow inbox |
| **Qualifying change after pension start** | FR-09 hard gate (P01) | G11 / Pension Officer, SR Custodian | CRITICAL email + push (blocking) |
| Mapping published | Catalog version published | IntegOps, Auditor | In-app |
| **Scheduled job failed** (`MSG-SYS-JOBFAIL`) | Any `JOB-G04-*` terminal failure | Owning-module admin + platform ops | Email (X.1 JOB-FAIL) |

All dispatches are X.2-audited; deduplicated and severity-escalated per the operating model.

---

## Section 12 — Reporting & Analytics (feeds G14)

| Report | Description | Consumer |
|---|---|---|
| Integration health KPI | Lag, throughput, success rate, DLQ depth, **reaped-in-flight**, pause/X.3-breaker state | IntegOps, G14 |
| Reconciliation summary | Findings by type/severity/age; closure rate; pending/quarantined bucket | SR Custodian, Auditor |
| **Capture integrity report** | LEDGER_WITHOUT_OUTBOX / OUTBOX_WITHOUT_LEDGER / SIGNATURE_MISMATCH by severity | SR Custodian, Security, Auditor |
| Qualifying-service impact | Per-employee non-qualifying days from SR leave entries (lineage-totalled, cited) | Pension Officer, G11 |
| Correction ledger report | All reversals/amendments with reasons, lineage, citations | Auditor, SR Custodian |
| Historical digitisation progress | Batches posted/partial/rejected; **provisional vs adjudicated**; coverage % | HR, SR Custodian |
| DLQ aging & resolution SLA | Open/resolved DLQ by age and class against tiered SLA | IntegOps |
| **Port conformance history** | Conformance runs, retention days, PASS/FAIL, gate status | Sys Admin, Auditor |
| **Pre-pension certificate register** | PASS/FAIL certificates, signers, G11 consumption | Pension Officer, SR Custodian, Auditor |
| Audit evidence pack | Full leave→SR chain export with checksum + citations (P05 `Audit.export`) | Auditor |
| Mapping change history | Version timeline, effective ranges, citations | Auditor, Sys Admin |

All reports respect **P02** RBAC + org_unit scoping and field masks; exportable (CSV/PDF/JSON); feed **G14** (≈ PrimeSoft M16) for cross-module analytics.

---

## Section 13 — Migration & Launch

### 13.1 Migration (on P06)

1. **G12 port contract first (R2):** sign the FR-16 bilateral contract and run the CI conformance test (`JOB-G04-CONFORMANCE`) to PASS (retention ≥ 7y) — **before any live posting is enabled**.
2. **Mapping seed:** author and publish the initial `sr_event_mapping` catalog covering all live leave types + legacy codes, with **dispositions and mandatory statutory citations** (FR-02), reviewed by SR Custodian (P01).
3. **Config seed:** load `integration_config` (max_retries, backoff, **lease_timeout, reaper_interval**, rate-limit, SLA, `live_posting_gate=closed`).
4. **Capture integrity baseline (R7/R17):** run FR-17 (`JOB-G04-INTEGRITY`) source↔outbox integrity; backfill any gaps with deterministic lineage.
5. **Backfill live gap:** for leave approved before integration go-live but not yet in SR, run audited backfill (FR-12) with deterministic lineage.
6. **Historical digitisation (P06):** ingest legacy leave via the **P06 ETL+V toolkit** (3 dry runs, waves, `migration_runs`, `<gov>_source_id`) prioritised by near-retirement cohorts; low-confidence entries post PROVISIONAL and are adjudicated.
7. **Baseline reconciliation:** run full state-aware reconciliation; resolve all HIGH/CRITICAL findings to zero before declaring SR complete for a cohort; issue pre-pension certificates (FR-18) for retiring cohorts.

### 13.2 Launch / rollout

- **Phase 0 (shadow):** relay posts to a staging SR; reconciliation compares; no production writes; conformance test green.
- **Phase 1 (pilot org_unit/entity):** enable live posting for one office **only after R1–R8 mitigations are in place** (reaper, pinned mapping version, dedupe-key off mapping_version, partitioned in-order + ordering guard, state-aware recon, EXCLUDED disposition, capture integrity, G12 contract); monitor lag/DLQ/reaped/findings for 2 weeks.
- **Phase 2 (cohort rollout):** expand by org_unit/entity; backfill + historical digitisation per cohort.
- **Phase 3 (steady state):** all leave events post live; scheduled reconciliation + integrity recon continuous (X.1); pre-pension certificate a mandatory G11 gate.

### 13.3 Cutover acceptance gates

- G12 port conformance run PASS (retention ≥ 7y); live-posting gate open.
- Zero unresolved HIGH/CRITICAL reconciliation **and** capture-integrity findings for the cohort.
- DLQ empty or all items resolved; zero stranded IN_FLIGHT (reaper clean).
- Mapping catalog fully covers live + legacy leave types with dispositions + citations.
- Evidence pack + pre-pension certificate reproducible for sampled employees.
- All `JOB-G04-*` registered on X.1 and green (no `MSG-SYS-JOBFAIL`).

### 13.4 Rollback

- Posting relay can be paused (manual relay-pause; X.3 breaker) without data loss (outbox durable); resume re-drains. No SR rollback (P05 append-only) — errors corrected via FR-08 corrections, never deletion.

### 13.5 Operating-model readiness *(R18)*

- IntegOps on-call rota staffed and documented; escalation paths to SR Custodian and Security defined.
- Tiered resolution SLAs (§11.1) configured as dashboard thresholds and X.2 alert routes (W.3).
- Runbooks for reaped-in-flight, conformance FAIL, signature mismatch, and near-retirement MISSING_SR.

---
## Alignment with PrimeSoft Platform

Per Foundation §9.6, every FR is mapped to the platform service(s) it runs on, and the one `GAP (gov-specific)` surface G04 authors is named. **G04 is a NET-NEW gov-specific integration (reconciliation §A/§D)** — it authors integration business logic but **runs entirely on platform engines** and **feeds the net-new G12 SR ledger** (which itself runs on P05). It re-implements **no** engine.

### FR → platform service map

| FR | Runs on (platform services) | Sibling gov modules | Notes |
|---|---|---|---|
| FR-01 Signed capture | P05 (audit DB-trigger), P02 (authz) | G03 (source) | Outbox written in G03 tx; HMAC sign |
| FR-02 Mapping catalog | P01 (publish maker-checker), W.2 (form), P05 | G03, G12 | `VAL-G04-*`; in-flight version pinning |
| FR-03 Posting relay | **X.1** (`JOB-G04-RELAY`), **X.3** (outbound call), P02, P05 | G12 (target) | Exactly-once effect; dedupe = X.3 idempotency key |
| FR-04 Retry/DLQ | **X.3** (circuit-breaking), X.1, P05 | — | Breaker platform-provided |
| FR-05 DLQ triage | **P01** (maker-checker), P02, P05 | G12 | SoD by engine |
| FR-06 Reconciliation | **X.1** (`JOB-G04-RECON`), X.3 (SR read), P05 | G03, G12 | State-aware, lineage-keyed |
| FR-07 Remediation | **P01**, X.3, P05 | G03, G12 | Append-only corrections |
| FR-08 Correction/reversal | X.3 (outbound), **P01** (post-pension gate), P05 | G03, G12 | Same outbox machinery |
| FR-09 Qualifying flags | **P01** (hard gate), X.2 (alert), P05 | G11, G12 | Cited; straddle split |
| FR-10 Annotations | P05 | G06, G12 | Mapping-templated |
| FR-11 Historical digitisation | **P06** (ETL+V), **P01** (approval), X.3, P05 | G03, G12, G13 | `migration_runs`, `<gov>_source_id` |
| FR-12 Replay/backfill | X.1 (chunked), **P01** (approval), P05 | G12 | Deterministic lineage |
| FR-13 Dashboard/operating model | **X.2** (alerts), P02 (scoped), → G14 | G14 | Metrics export |
| FR-14 Audit/evidence pack | **P05** (`Audit.query`/`Audit.export`) | G12, Auditor | Read is audited |
| FR-15 Lease reaper | **X.1** (`JOB-G04-REAPER`), X.2, P05 | — | ≤2 min sweep |
| FR-16 G12 port contract & conformance | **X.3** (transport), X.1 (`JOB-G04-CONFORMANCE`), P04 (creds), P05 | G12 (on P05) | Gate on PASS |
| FR-17 Source↔outbox integrity | **X.1** (`JOB-G04-INTEGRITY`), P05 (`security_audit_log`), X.2 | G03 | Signature verify |
| FR-18 Pre-pension certificate | **P01** (sign), P05 | G11, Auditor | G11 gate input |

### Platform services consumed (by id)

| Service | How G04 uses it |
|---|---|
| **P01 Workflow Engine** | All maker-checker (mapping publish, DLQ resolution, remediation, batch approval/adjudication, post-pension qualifying gate, certificate sign) as configured flows; SoD enforced by engine; in-flight version pinning |
| **P02 RBAC & Authorization.check** | Every endpoint; deny-by-default → role → intersection → entitlement → capability flag → PII ceiling → scope → field mask |
| **P04 Tenant & Org Admin** | `integration_credentials` for the G12 X.3 port (encrypted, rotated, scoped) |
| **P05 Audit & Compliance Log** | DB-trigger capture of all G04 + SR mutations (dual log, immutable, ≥7-yr); `Audit.query`/`Audit.export` for the evidence pack; tamper-evidence tracks OPEN-PLAT-03 |
| **P06 Migration Toolkit** | Historical leave digitisation (ETL+V, 3 dry runs, waves, `migration_runs`, `<gov>_source_id`) |
| **X.1 Background Jobs runner** | `JOB-G04-RELAY/REAPER/RECON/INTEGRITY/CONFORMANCE/DLQ-SLA` (idempotent per-period key, backoff ×3, per-tenant isolation, `JOB-FAIL → MSG-SYS-JOBFAIL`) |
| **X.2 Notification Infrastructure** | All alerts (`MSG-G04-*`); statutory = mandatory/non-suppressible; retry ×5 + DLQ; W.3 recipient config |
| **X.3 Integration Framework** | The G12 SR write-port outbound call: circuit-breaking, outbound idempotency, payload versioning, per-integration error mapping |
| **W.2 Form Definitions** | Mapping-catalog authoring form (validation by `VAL-*` id) |
| **W.3 Notification Configuration** | Recipient/channel/escalation resolution for `MSG-G04-*` |
| **RBAC v1.7** | IntegOps & SR Custodian as new roles + capability flags; Pension Officer ≈ Payroll-Admin-class; Auditor → Org-Admin read + entitlement; Sys Admin → Org/Platform Admin |
| **Foundation §2/§4/§5** | `VAL-G04-*`, `JOB-G04-*`, `MSG-G04-*`, `ERR-G04-*` registered in the Foundation indexes; shared `VAL-*`/`ERR-*`/`MSG-SYS-*` cited |

### `GAP (gov-specific)` surface authored by G04

| Surface | What G04 authors | Runs on |
|---|---|---|
| **Leave→SR integration logic** (`sr_leave_posting` family, E8–E21) | Outbox capture, mapping, idempotent posting, reconciliation, corrections, qualifying-service governance, historical digitisation, certificate | P01 + P05 + X.1 + X.3 + P06 (reconciliation §D) |
| `VAL-G04-*` rules | DEDUPE, LINEAGE, MAPCOVER, CITATION, ORDER, SIG, CONFORM | Foundation §2 registry |

> The **G12 SR ledger** itself is **not** authored by G04 — it is the net-new statutory engine owned by **G12**, running on the **P05** substrate; G04 only **writes to it** through the contracted X.3 port (FR-16) and **reads** it for reconciliation/evidence.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state tables → platform services → tests)

| FR | Primary entities | Key APIs | State table | Platform svc | Test focus |
|---|---|---|---|---|---|
| FR-01 | leave_event_outbox | outbox write, GET outbox | 10.1 | P05, P02 | Atomic signed capture, lineage, EXCLUDED, idempotent emission, tenant isolation |
| FR-02 | sr_event_mapping | mappings CRUD/publish | — | P01, W.2, P05 | Overlap, disposition, citation, straddle, resolve-by-date |
| FR-03 | outbox, partition_lease, posting_log, SR | POST sr/ingest, GET postings | 10.1 | X.1, X.3, P02, P05 | Exactly-once effect, in-order, remap-no-dup, ordering guard, breaker |
| FR-04 | outbox, dead_letter, config | GET dlq, PUT config, relay pause | 10.1, 10.5 | X.3, X.1, P05 | Backoff, classify, manual pause, X.3 breaker, exhaustion |
| FR-05 | dead_letter, outbox, workflow | dlq assign/replay/discard | 10.2 | P01, P05 | Replay idempotency, maker-checker, signature-class block |
| FR-06 | reconciliation_run/finding | recon runs/findings | 10.3 | X.1, X.3, P05 | Pending-excluded, lineage match, correction-without-link |
| FR-07 | finding, correction_link, SR | findings remediate/waive | 10.3 | P01, X.3, P05 | Append-only fix, relink-from-lineage, re-check |
| FR-08 | correction_link, outbox, SR | POST sr/ingest/reversal, corrections | 10.6 | X.3, P01, P05 | Reversal envelope chain, orphan, lost-link recovery, post-pension gate |
| FR-09 | SR, mapping, recon, workflow | qualifying-impact, PRE_PENSION | 10.6 | P01, X.2, P05 | LWP non-qual, partial, straddle split, G11 reconciliation total, post-pension hard gate |
| FR-10 | SR, mapping, correction_link | annotations | — | P05 | Annotation render + citation, re-emit |
| FR-11 | historical_batch/record, SR, documents, migration_runs | batches validate/approve/post/adjudicate | 10.4 | P06, P01, X.3, P05 | Deterministic lineage dedupe, provisional, adjudication, source-id |
| FR-12 | outbox, posting_log, workflow | replay, backfill | 10.1 | X.1, P01, P05 | Deterministic-lineage idempotent backfill, dry-run |
| FR-13 | all ledgers, partition_lease, config, notifications | dashboard summary/metrics, ack | 10.5 | X.2, P02, G14 | Aggregation, reaped surfacing, on-call routing, RBAC |
| FR-14 | all ledgers, certificate, audit_log | audit chain/export | — | P05 | Chain by lineage, citations, certificate, checksum |
| FR-15 | outbox, partition_lease, posting_log | GET outbox (lease expired) | 10.1 | X.1, X.2, P05 | Crash recovery, lease renew vs expire, idempotent re-post |
| FR-16 | port_conformance_run, config | port conformance runs | 10.7 | X.3, X.1, P04, P05 | Retention FAIL, dedupe-replay, append-only, gate enforcement |
| FR-17 | reconciliation_run, capture_integrity_finding | integrity runs/findings | — | X.1, P05 | Ledger-without-outbox, signature mismatch, polling-mode loss |
| FR-18 | prepension_certificate, recon, findings | certificates generate/sign | 10.6 | P01, P05 | PASS/FAIL gates, provisional-blocks, checksum, invalidation |

### 14.2 Dependency graph

```
G12 port contract (FR-16, X.3) ──gates──► live posting
G03 ──(signed outbox)──► FR-01 ──► FR-03 (JOB-G04-RELAY, X.3) ──► G12 (SR on P05)
                          FR-02 ──► FR-03, FR-08, FR-09, FR-10
                          FR-03 ──► FR-04 ──► FR-05 (P01) ; FR-03 ──► FR-15 (JOB-G04-REAPER)
                          FR-01 ──► FR-17 (JOB-G04-INTEGRITY) ──► FR-12 (backfill)
                          FR-06 (JOB-G04-RECON) ──► FR-07 (P01) ──► FR-08
                          FR-08 ──► FR-09 ──► G11
                          FR-09/FR-06 ──► FR-18 (certificate, P01) ──► G11 gate
                          FR-10 ──► G06
                          FR-11 (P06) ──► FR-06, FR-18, G12, G13
                          FR-12 ──► FR-03
                          FR-13 (X.2→G14), FR-14 (P05) ──► all (read)
```

### 14.3 Parallel-agent build plan

| Track | FRs | Can start when | Parallelism |
|---|---|---|---|
| **Pre-0. Contracts** | **FR-16** (G12 port on X.3), capture decision D-1, lineage issuance D-2, `JOB-G04-*` registration | Week 1 (on paper) | **Blocking — must land before live posting** |
| A. Capture & mapping | FR-01, FR-02, FR-17 | Platform (P01/P02/P05) + G03 lineage ready | Parallel |
| B. Posting core | FR-03, FR-04, **FR-15** | After A + FR-16 PASS + X.1/X.3 wired | Sequential after A; reaper + pinned-version before any live posting |
| C. DLQ & replay | FR-05, FR-12 | After B | Parallel with D |
| D. Reconciliation | FR-06, FR-07 | After B (needs posting_log + outbox state) | Parallel with C |
| E. Corrections & statutory | FR-08, FR-09, FR-10 | After B/D | Parallel internally |
| F. Historical | FR-11 | After B, D; P06 toolkit ready | Parallel |
| G. Certificate | FR-18 | After D, E, F | After pension-relevant data |
| H. Console & audit | FR-13, FR-14 | After C–G provide data; X.2/G14 wired | Last |

### 14.4 Final Reconciliation Table (0 unresolved gaps — incl. platform rows)

| Requirement theme | Covered by | Status |
|---|---|---|
| Canonical event mapping (disposition + citation + straddle) | FR-02 | ✅ |
| Eventing/queue (signed transactional outbox) | FR-01 | ✅ |
| Stable spell lineage join key | FR-01/03/06/08 + §5.6 r.11 | ✅ |
| Idempotent posting / exactly-once **effect** | FR-03 | ✅ |
| Mapping-version-independent dedupe key | FR-03 BR-03.1, Appendix A | ✅ |
| Partitioned in-order delivery + ordering guard | FR-03 | ✅ |
| Stuck-in-flight reaper | FR-15 | ✅ |
| Retry / dead-letter | FR-04, FR-05 | ✅ |
| State-aware reconciliation (no false positives) | FR-06 | ✅ |
| Reconciliation remediation (incl. relink) | FR-07 | ✅ |
| Correction & reversal via outbox (append-only, linked) | FR-08 | ✅ |
| Long-leave & LWP qualifying flags (tiered, cited; G11) | FR-09 | ✅ |
| Post-pension qualifying hard gate | FR-09, 10.6 | ✅ |
| Statutory annotations (increment/seniority) | FR-10 | ✅ |
| Historical digitisation (provisional, deterministic lineage) | FR-11 | ✅ |
| Replay / backfill (deterministic identity) | FR-12 | ✅ |
| Monitoring dashboard + operating model | FR-13, §11.1 | ✅ |
| Integration audit / evidence + citations | FR-14 | ✅ |
| G12 SR write-port contract + conformance | FR-16 | ✅ |
| Source-ledger ↔ outbox integrity + signed capture | FR-17 | ✅ |
| Pre-pension completeness certificate | FR-18 | ✅ |
| **G03 (source) reference (≈ PrimeSoft M04/M05; not forked)** | FR-01, FR-06, FR-17; §2.2 | ✅ |
| **G12 (target) — net-new ledger on P05, not invented platform entity** | FR-03, FR-08, FR-16; §1.1, §5.1 | ✅ |
| **Module re-coded to G04 (no `Mxx` collision)** | Title, all FRs | ✅ |
| **`tenant_id`/`entity_id` on every owned entity + data-layer scoping** | §5.2 (E8–E21), §5.6 r.16 | ✅ |
| **Maker-checker on P01 (`workflow_actions`), SoD by P01/P02** | §2.4, §3, FR-02/05/07/08/09/11/18 | ✅ |
| **Authz via P02 `Authorization.check`** | §3.2, §4, every FR | ✅ |
| **Audit on P05 dual-log (DB-trigger), no custom audit_log** | §2.4, §4, §5.1 | ✅ |
| **Jobs on X.1 (`JOB-G04-*`, JOB-FAIL→MSG-SYS-JOBFAIL)** | §4, FR-03/06/15/16/17, §10.1 | ✅ |
| **Outbound G12 call on X.3 (breaker/idempotency/payload version)** | §4, FR-03/04/16, §8.4/§8.5 | ✅ |
| **Notifications on X.2 (`MSG-G04-*`, statutory non-suppressible)** | §11 | ✅ |
| **Historical migration on P06 (ETL+V, migration_runs, source-id)** | FR-11, §13.1 | ✅ |
| **Platform error table + envelope + `X-Correlation-Id` + cursor pagination + Idempotency-Key** | §4.1, §8.1/§8.2 | ✅ |
| **RBAC v1.7 ADDITIONS (IntegOps/SR Custodian roles + flags; Auditor/Sys Admin mapped)** | §3.1 | ✅ |
| **NFR baseline (99.5%/mo, RPO<1h, RTO<4h, WCAG 2.1 AA)** | §4, §9 | ✅ |
| **`VAL-G04-*` authored & registered; shared `VAL-*` cited** | §4, FR-02 | ✅ |
| **`## Alignment with PrimeSoft Platform` (FR→service map) present** | §Alignment | ✅ |
| **`## Amendments (v2 → v3)` table present** | §Amendments (v2→v3) | ✅ |
| Integration-specific entities | E8–E21 (tenant-scoped) | ✅ |
| Platform/sibling entities referenced (not redefined) | §5.4 | ✅ |
| All council Adopted Improvements AI-1…AI-21 | Amendments (v1→v2) table | ✅ |
| All Risk Register items R1…R18 | Amendments (v1→v2) table + FRs | ✅ |

**Unresolved gaps: 0** (including all platform-grounding rows).

---
## Section 15 — Glossary

| Term | Definition |
|---|---|
| Digital SR | Statutory append-only Service Register (**G12**), system of record for service events; a **net-new gov ledger running on the P05 audit substrate** (DB-trigger, immutable, ≥7-yr, hash-chain OPEN-PLAT-03), not a platform primitive. |
| Transactional outbox | Pattern: write events to a DB table in the same tx as the domain change, drained by a relay job — guarantees no lost events. Written in G03's tx; signed. |
| **Leave spell lineage id** | G03-issued identifier stable across approve→amend→cancel of one spell; the primary join key for matching, dedupe, correction linking, and reconciliation. |
| **Event sequence** | Monotonic counter within a lineage (approve=1, amend=2, …). |
| Dedupe key | Deterministic, **mapping-version-independent** key `hash(lineage:event_type:event_sequence)` used as the **X.3 outbound `Idempotency-Key`** and persisted ≥7y by G12. |
| **Exactly-once effect** | At-least-once delivery + idempotent dedupe at G12, **conditional on the G12 port contract (FR-16)** and X.3 outbound idempotency — one logical event yields one SR entry. Not bare "exactly-once delivery." |
| Dead-letter (DLQ) | Quarantine store for events that exhausted retries or hit permanent errors. |
| **Lease / reaper** | A visibility timeout on a claimed event; the reaper (`JOB-G04-REAPER`, FR-15) recovers crashed IN_FLIGHT events. |
| **Partition** | Per-employee/lineage serialisation unit ensuring in-order posting. |
| Reconciliation | State-aware comparison of leave ledger (G03) vs SR (G12) to detect drift, excluding legitimately pending/quarantined events; runs as `JOB-G04-RECON`. |
| **Capture integrity reconciliation** | FR-17 (`JOB-G04-INTEGRITY`) comparison of G03 ledger vs outbox + signature verification. |
| Drift | Divergence between source and target (missing/duplicate/divergent entries). |
| Correction / reversal | Append-only SR entry that amends or nullifies a prior entry (SR never hard-edited; P05 substrate rejects UPDATE/DELETE). |
| **Disposition** | Mapping outcome: POST_SR or **EXCLUDED_NON_SR** (deliberate non-posting, not DLQ). |
| Qualifying service | Service period counting toward pension; LWP/EOL typically non-qualifying. |
| LWP / EOL | Leave Without Pay / Extraordinary Leave — generally non-qualifying. |
| **Statutory rule ref** | Human-readable citation (e.g. CCS (Leave) Rules) mandatory on every POST_SR mapping (`VAL-G04-CITATION`). |
| Annotation | Structured statutory note on an SR entry (e.g. increment deferral); consumed by G06. |
| **Provisional entry** | A low-confidence migrated SR entry excluded from pension until SR-Custodian adjudicated. |
| **Pre-pension certificate** | Signed, checksummed artefact asserting completeness; G11 gate input (FR-18). |
| Backfill | Generating capture events for source leave never previously captured, with **deterministic lineage**. |
| Replay | Re-driving existing events to the SR safely via dedupe. |
| Circuit breaking | Protection against sustained G12 downstream failure; **provided by the X.3 integration framework** (platform), not a module-built breaker. The module core control is the manual relay-pause. |
| **X.1 / X.2 / X.3** | Platform Background-Jobs runner / Notification Infrastructure / Integration Framework consumed by G04. |
| **P01 / P02 / P05 / P06** | Platform Workflow Engine / RBAC enforcement / Audit substrate / Migration Toolkit consumed by G04. |
| **G03 / G11 / G12 / G06 / G13 / G14** | Gov modules: Attendance & Leave (source, ≈ M04/M05) / Pension / SR ledger / Promotion-Seniority / Documents (≈ M11) / Analytics (≈ M16). |

---

## Section 16 — Appendices

### Appendix A — Dedupe & backfill identity derivation *(R4/R14)*

- **Live dedupe key (mapping-version-independent):**
  `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]`.
  It is the **X.3 outbound `Idempotency-Key`**; G12 stores + indexes it on the SR entry and rejects/no-ops duplicates (retention ≥7y, FR-16; aligned to P05 ≥7-yr). **`mapping_version` is excluded** so a republish mid-retry cannot change the key; an intentional remap is posted as an explicit **correction** (FR-08), never a silently-new post.
- **Pinned mapping version:** `pinned_mapping_version` is resolved once at first claim and persisted (platform in-flight version pinning, §0.3); recorded as `mapping_id` in `sr_posting_log`.
- **Backfill / migration identity:** `leave_spell_lineage_id` is derived deterministically from `(employee_id, leave_type, spell_start, spell_end[, batch lineage])`, matching what G03 would issue — so a backfilled event and a later genuine G03 emission resolve to the same key and dedupe instead of double-posting. Migration runs carry the P06 `<gov>_source_id`.

### Appendix B — Failure classification reference *(X.3 error mapping)*

| Source signal (G12 via X.3) | Class | Action |
|---|---|---|
| G12 unreachable / timeout / connection reset | RETRYABLE (UPSTREAM_DOWN) | Backoff retry; X.3 breaker may open |
| `RATE_LIMITED` (429) | RETRYABLE (rate) | Backoff retry |
| 5xx | RETRYABLE | Backoff retry |
| Lease expired mid-flight | RETRYABLE (reaped, FR-15) | Reset to FAILED + attempt++ + X.2 alert |
| `ERR-G04-MAPPING-NOT-FOUND` (422, SR-affecting) | PERMANENT (MAPPING_MISSING) | DLQ immediately |
| EXCLUDED_NON_SR disposition | NOT A FAILURE | Outbox EXCLUDED (no-op) |
| `VALIDATION_FAILED` (422) | PERMANENT (VALIDATION_REJECT) | DLQ immediately |
| `ERR-G04-SIGNATURE-INVALID` (403) | PERMANENT (SIGNATURE_INVALID) | DLQ + integrity finding (FR-17) + `security_audit_log` |
| `ERR-G04-SR-CONFLICT` (409) | PERMANENT (DATA_CONFLICT) | DLQ; recon |
| `ERR-G04-BLOCKED-AWAITING-ORIGINAL` (409) | HELD (ordering) | Wait until original POSTED |
| `ERR-G04-IDEMPOTENT-DUPLICATE` (200) | SUCCESS (no-op) | Mark POSTED |

### Appendix C — State-aware reconciliation matching algorithm *(R6)*

1. Index leave ledger by **`leave_spell_lineage_id`** (fallback business key `(employee_id, leave_type, spell_start, spell_end)` only for legacy/migrated without lineage).
2. Index SR leave entries by lineage / dedupe key; **resolve correction chains to net-effective**.
3. **Subtract events legitimately in `PENDING` / backoff / `BLOCKED_AWAITING_ORIGINAL` / `DEAD_LETTERED`** (counted in `pending_excluded_count`) — these are **not** `MISSING_SR`.
4. Left-anti-join remaining leave→SR ⇒ `MISSING_SR`; grouping >1 net-effective per lineage ⇒ `DUPLICATE_SR`; matched-after-chain-resolution with field diff ⇒ `DIVERGENT_FIELD`; corrections lacking originals ⇒ `ORPHAN_CORRECTION`; SR correction with no local link ⇒ `CORRECTION_WITHOUT_LINK`; leave types absent from mapping ⇒ `UNMAPPED_LEAVE`.
5. Dedupe against still-OPEN findings; persist new findings with snapshots and lineage. Scheduled execution is `JOB-G04-RECON` on X.1.

### Appendix D — Sample correction chain *(by lineage)*

`EL_AVAILED (sr-78, 10d, lineage lin-bb, source_reference_id lin-bb:LEAVE_APPROVED, seq 1)` → amended to 7d → relay holds `BLOCKED_AWAITING_ORIGINAL` until sr-78 POSTED → posts the G12 reversal envelope `is_reversal=true, reverses_source_reference_id=lin-bb:LEAVE_APPROVED` (`EL_AVAILED_CANCELLED`) then the corrected forward entry `EL_AVAILED (sr-91, net 7d, lin-bb, seq 2)` to `/api/v1/sr/ingest/reversal` over X.3, linked via `sr_correction_link (l-02, lineage lin-bb)`. Net-effective resolver (keyed on `lin-bb`) returns sr-91. Pension/seniority readers follow the chain to the latest effective entry. If the local link insert had failed, FR-06 detects `CORRECTION_WITHOUT_LINK` and FR-07 reconstructs it from the G12-stored lineage + `reverses_source_reference_id`.

### Appendix E — G12 port conformance test outline *(R2/FR-16)*

1. **Retention probe:** assert configured dedupe-key retention ≥ 2557 days; FAIL otherwise.
2. **Dedupe-replay probe:** post key K → get sr-X; simulate retention-horizon age; re-post K → assert sr-X returned + `DUPLICATE_NOOP` (no second row).
3. **Index probe:** assert `dedupe_key`, `correlationId`, `leave_spell_lineage_id` are persisted and queryable/indexed on the SR entry.
4. **Append-only probe:** attempt UPDATE/DELETE on an SR entry → assert rejected (intrinsic to the P05 substrate).
5. **Conflict probe:** post a genuinely conflicting state → assert `ERR-G04-SR-CONFLICT` (409).
6. **Payload-version probe:** assert the X.3 payload version negotiated matches the active contract.
7. Record result + evidence checksum in `port_conformance_run` (`JOB-G04-CONFORMANCE`); gate live posting on PASS.

### Appendix F — Open items / future enhancements

- Optional broker (Kafka) bridge if the programme later standardises event streaming (current design is DB-outbox with per-partition in-order claiming on X.1; broker-optional).
- ML-assisted anomaly detection on posting lag/drift patterns (feed to FR-13 / G14).
- Self-service employee view of "leave reflected in SR" (delegated to G12's employee surface).
- Track **OPEN-PLAT-03** (audit hash-chaining) for the SR tamper-evidence requirement rather than inventing a parallel mechanism.

---

*End of G04 BRD v3.0 — platform re-grounded. All v2 council-hardening (21 Adopted Improvements AI-1…AI-21, Risk Register R1…R18) is preserved and re-anchored onto the PrimeSoft platform (P01/P02/P04/P05/P06, X.1/X.2/X.3, W.2/W.3, RBAC v1.7, Foundation conventions). The integration is NET-NEW (gov-specific) but runs entirely on platform engines and feeds the net-new G12 SR ledger on the P05 substrate. See the Amendments (v2 → v3) table, the Alignment with PrimeSoft Platform section, and the Final Reconciliation Table (0 unresolved gaps, including platform rows).*
