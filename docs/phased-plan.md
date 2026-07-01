# Government-HRMS — Dependency-Ordered Phased Build Plan

**Scope:** 14 government modules (G01–G14) on the existing PrimeSoft platform.
**Companion contract:** `docs/contracts/dependency-register.yaml` (machine-readable per-module dependencies).
**Grounded in:** `docs/brd/v3/*` · `docs/brd/PLATFORM_FOUNDATION.md` · `docs/brd/MODULE_RECONCILIATION.md` · `docs/data-model/README.md` (447-table validated schema, 15-file load order 00→14).

> **Non-greenfield rule.** Every module *consumes* platform engines P01–P06 / X.1–X.3 / W.1–W.3 by id and never re-authors them. The only things authored from scratch are the net-new statutory engines (SR ledger, pension, disciplinary due-process, qualifying-service, transfer/relieving/joining, seniority/promotion). This plan sequences *those* against the shared contracts.

---

## Critical path

```
Phase 0 Platform Core  →  G01 (Employee Master)  →  G12 (SR ingestion contract)
        →  G03 (Attendance & Leave)  →  G10 (Payroll)  →  G11 (Pension)  →  G14 (Analytics)
                              ▲                                    ▲
      SR writers G04 · G09 (Phase 3) ─────────────────────────────┘  (merge into G11)
```

**Why this is the critical path.** G11 (Retirement & Pension, **XL**, net-new) has the deepest hard-dependency fan-in in the whole program — its input-provenance gate cannot run until it can read verified service history (**G12**), leave/LWP (**G03**), leave→SR postings (**G04**), disciplinary/compulsory-retirement orders (**G09**) and last-pay-drawn (**G10**). G10 in turn needs G03; G12 needs G01; G01 needs platform core. G14 then closes the program because it reads everything (including G11's pension pipeline). Nothing finishes G11 faster than this chain, so it governs schedule. The two other **XL** modules (G06, G09) are *not* on the finishing critical path but are the highest-risk parallel work in Phase 3.

**Single-line critical-path module sequence:**
`Platform Core → G01 → G12 → G03 → G10 → G11 → G14` (with G04 + G09 merging into G11).

---

## Per-module effort / complexity

| Module | Name | Type | Tables | Effort | Note |
|---|---|---|---|---|---|
| G01 | Employee Profile Mgmt | extend | 32 | **L** | Heavy satellites (Aadhaar vault, history, consent) on M01 master |
| G02 | Personal Details Workflow | extend | 18 | **M** | Maker-checker configured on P01; not an SR writer |
| G03 | Attendance & Leave | extend | 31 | **L** | Public-sector leave types + govt holiday/shift on M04/M05 |
| G04 | Leave → SR Integration | net-new | 14 | **M** | Outbox/relay/reconcile/DLQ; first SR-writer to prove the contract |
| G05 | Transfer/Relieving/Joining | net-new | 21 | **L** | New order entities + P01 flows (W.1) |
| G06 | Promotion/Posting/Progression | net-new | 32 | **XL** | Seniority/DPC/MACP — statutory-complex, high parallel risk |
| G07 | Training & Skill Development | net-new | 37 | **L** | Largest table count but non-statutory; L&D on P01 + W.2 |
| G08 | Performance Appraisal (APAR) | extend | 23 | **L** | APAR form (W.2) + officer chain on M09 |
| G09 | Disciplinary Cases | net-new | 30 | **XL** | CCA due-process + SoD; SR-writer reference implementation |
| G10 | Payroll & Benefits | phase-2 | 27 | **L** | Extends PrimeSoft M06/M07; runs after Phase-2 platform live |
| G11 | Retirement & Pension | net-new | 34–35 | **XL** | Deepest fan-in; determinism engine gated on complete inputs |
| G12 | Digital SR (Digital SR) | net-new | 18 (+core) | **L** | Small surface but **contract-critical** — owns the SR write-port |
| G13 | Document Management | extend | 24 | **L** | Statutory doc classes/retention on M11 vault |
| G14 | Dashboard & Analytics | extend | 26 | **L** | Read-only marts over all sources; RLS = P02 |

Program totals: **447 tables · 1,907 FKs · 443 RLS tables · 700 enums** (validated end-to-end, `docs/data-model/README.md`).

---

## Phase 0 — Platform Core Schema & Platform-Service Readiness

**Goal.** Stand up the substrate every module builds on so no module re-authors an engine.

**Deliverables / modules.** `00-platform-core.sql` (35 tables): tenancy + data-layer scoping, RBAC v1.7 catalogue + `Authorization.check`, `employees` master, P01 workflow core (`workflows`/`workflow_instances`/`workflow_actions`), P05 dual audit (`audit_log`/`security_audit_log`, DB-trigger, immutable), **G12 SR ledger core** (`service_register_events`, append-only on P05), **G13 documents core**, notifications/jobs/`migration_runs`.

**Entry criteria.** PrimeSoft platform spec v1.6 available; empty target PostgreSQL cluster.

**Exit criteria.**
- `00-platform-core.sql` loads clean with `ON_ERROR_STOP=1`; seed data inserts.
- P01/P02/P03/P04/P05/P06 and X.1–X.3 / W.1–W.3 reachable via their service contracts (auth + idempotency-key + `X-Correlation-Id` + standard error envelope).
- P05 DB-trigger capture verified on a sample business table (INSERT/UPDATE/soft-DELETE → immutable row).
- Cursor pagination, `/api/v1` versioning, and the 8-code error table (`VALIDATION_FAILED 422`…) confirmed platform-wide.

**Parallelizable.** RBAC catalogue seeding, P01 pattern verification (Appendix D), P05 trigger tests, and notification-template registration can proceed in parallel once core DDL loads.

**Integration checkpoints.** RBAC deny-by-default proven; tenant-scope rejection (unscoped query returns no rows); SR ledger core append-only + P05 immutability.

**Mock/stub strategy.** None inbound — this *is* the substrate. External portals (treasury/DigiLocker/penny-drop) stubbed behind X.3 for later phases.

---

## Phase 1 — Foundational Systems of Record (G01, G12, G13)

**Goal.** Establish the three shared-contract owners: employee master (G01), SR ingestion contract (G12), documents vault (G13). Everything downstream references these by id.

**Modules.** **G01** Employee Profile Mgmt (L) · **G12** Digital SR (L, contract-critical) · **G13** Document Management (L).

**Entry criteria.** Phase 0 exit met.

**Exit criteria.**
- **G01:** gov master additions (`service_no`, `cadre`, `pay_scale_id`, posting history, Aadhaar vault, consent) live and effective-dated via `JOB-G01-EFFDATE`; **G01 posts identity/personal-data SR events** (`source_module=G01`) to the ledger successfully.
- **G12:** `POST /api/v1/sr/ingest` write-port live and conformance-tested — **idempotent, versioned, schema-validated, provenance-stamped, semantic-per-fact dedup, source-driven reversal**; event taxonomy + status sub-ledger + anchoring in place; ledger append-only + hash-chain (OPEN-PLAT-03) confirmed.
- **G13:** statutory document classes/retention/legal-hold on the M11 vault; collision-safe table names (`document_retention_policies`/`document_legal_holds`).

**Parallelizable.** All three build in parallel; G12 and G13 sit on Phase-0 core, and G01 extends the core master. **Sync point:** G12 needs G01 `subject_ref` identities and G01 needs the G12 write-port — co-develop the SR event contract for identity events; freeze it before Phase 3.

**Integration checkpoints.**
- **SR-contract conformance:** G01 identity-event round-trip through `POST /api/v1/sr/ingest`; idempotency replay returns original (409 on duplicate start).
- **Schema reconciliation:** G01↔G13 `retention_policies`/`legal_holds` collision resolved (owner-rename ratified).
- **RBAC:** SR Custodian/Registrar role + Document Admin capability flags registered as ADDITIONS (RBAC §4.3).

**Mock/stub strategy.** G13 subject linkage to G01 can start against a stubbed employee fixture; swap to live G01 before exit. SR writers of later phases are not yet present — the contract is validated with a synthetic writer harness.

---

## Phase 2 — Employee-Facing Transactional Base (G02, G03)

**Goal.** Layer the two highest-volume employee surfaces on the master: self-service change workflow and attendance/leave.

**Modules.** **G02** Personal Details Workflow (M) · **G03** Attendance & Leave (L).

**Entry criteria.** Phase 1 exit met (G01 master + G12 contract stable).

**Exit criteria.**
- **G02:** change-request maker-checker configured as P01 flows over governed G01 fields; on STATUTORY commit **G01 (not G02)** posts the SR event; G02 tracks posting status and retro-reconciliation.
- **G03:** public-sector leave types (EL/HPL/commuted/study) + govt holiday/shift/roster; leave ledger + attendance capture live; `VAL-LV`/`VAL-AT` wired.

**Parallelizable.** G02 and G03 are independent (both depend only on G01); build fully in parallel.

**Integration checkpoints.**
- **SR-contract conformance:** confirm G02 emits **no** SR write (R3 F2 remediation — G01 owns identity postings).
- **RBAC:** field-level `E·AR` request-change routing (G02) and Leave/Attendance Admin scoping (G03).
- **Schema reconciliation:** G02↔G03 `ix_delegations_*` index collision resolved (→ `ix_appr_delegations_*`).

**Mock/stub strategy.** G03 needs no downstream module. G02's downstream recompute acknowledgers (G10/G11/G06) are not built yet — stub the ack channel; G02 only tracks acknowledgement, it does not execute recompute.

---

## Phase 3 — SR Writers & Statutory Workflows (G04, G05, G06, G07, G08, G09)

**Goal.** Build the statutory workflow modules that write to the SR ledger. This is the widest parallel phase and carries the two remaining **XL** modules (G06, G09).

**Modules.** **G04** Leave→SR (M) · **G05** Transfer/Relieving/Joining (L) · **G06** Promotion/Posting/Progression (XL) · **G07** Training & Skill (L) · **G08** Performance/APAR (L) · **G09** Disciplinary (XL).

> **Note on membership.** The program brief's Phase-3 shortlist (G04/G05/G06/G08/G09) omitted **G07**; it belongs here — it is an SR-writing (schema `sr_outbox`), P01-driven L&D module whose only hard dependency is G01, so it parallelizes cleanly with the rest of Phase 3. G07 is **not** in G12's FR-01.B *canonical statutory* writer set — treat its SR posting as optional/non-statutory.

**Entry criteria.** Phase 1 (G01, G12) and Phase 2 (G03) exit met. **SR ingestion contract frozen.** G04 is sequenced *first* within the phase as the reference SR-writer that proves the contract end-to-end before the others fan out.

**Exit criteria.**
- Each SR writer (G04, G05, G06, G08, G09) posts its life-events via `POST /api/v1/sr/ingest` with the correct `source_module` stamp, passing idempotency + semantic-dedup + reversal conformance.
- **G04:** leave→SR outbox/relay/reconcile/DLQ closes the loop with G03 leave events.
- **G05:** transfer-order → relieving → joining P01 flows (W.1) with relieving/joining date consistency (`VAL-TRANSFER-ORDER`).
- **G06:** seniority list + DPC + MACP + sanctioned-post + qualifying-service; SR events emitted.
- **G08:** APAR form (W.2) + reporting/reviewing/accepting-officer chain (P01).
- **G09:** charge→reply→inquiry→penalty→appeal due-process with SoD (maker ≠ checker); reference SR-writer impl.
- **G07:** competency framework + training calendar/nomination/certification on P01 + W.2.

**Parallelizable.** All six run in parallel once G04 has validated the SR write-port. The heavy cross-references among them are **soft** (see mock strategy), so no build-order coupling inside the phase.

**Integration checkpoints.**
- **SR-contract conformance (gate):** every writer's events accepted; double-record prevention verified via semantic dedup (no double-counted qualifying service).
- **Schema reconciliation:** G04↔G12 `ix_sr_corr_*` collision resolved (→ `ix_g12_sr_corr_*`).
- **RBAC / SoD:** Disciplinary Authority, Inquiry Officer, Appointing Authority roles + SoD enforced by P01/P02; no self-approval.

**Mock/stub strategy (intra-phase soft deps).**
- **G06** reads G08 APAR ratings, G09 disciplinary status, G05 posting movement, G07 competency master → **stub with fixtures**; integrate live as each peer completes.
- **G05** reads G06 seniority/sanctioned strength and raises G10 pay signals → **stub** (G10 not built until Phase 4).
- **G09** orders are later consumed by G06 seniority recompute and G11 → downstream, no inbound stub needed.
- Document attachments (G05/G06/G08/G09) resolve against live **G13** (Phase 1).

---

## Phase 4 — Payroll & Pension (G10, G11)

**Goal.** Build the financial settlement spine: payroll (Phase-2 platform extension) then the pension engine that consumes the widest set of upstream facts.

**Modules.** **G10** Payroll & Benefits (L, phase-2) · **G11** Retirement & Pension (XL).

**Entry criteria.**
- Phase-2 platform modules (PrimeSoft M06 Payroll / M07 Statutory) live — **G10 is explicitly sequenced after them** (MODULE_RECONCILIATION.md §E), not authored as a parallel engine.
- G01, G03 exit met (G10 hard deps).
- For **G11**: G01, G12, G03, G04, G09, G10 all integrable — G11's input-provenance gate refuses to compute until service history is verifiably complete.

**Exit criteria.**
- **G10:** payroll run / deductions / loans / benefits / FnF on M06/M07 extension with public-sector pay scales; consumes G03 LOP/encashable and G06/G05 pay signals; posts payroll SR events (`source_module=G10`); emits cost journal (Finance ERP owns the GL).
- **G11:** deterministic pension/gratuity/commutation engine gated on a `SIGNED_OFF`/`LOCKED` service-verification with closed discrepancy ledger; OPS/NPS/UPS regimes; PPO (incl. provisional Rule-9) issued before pension commencement; pensioner master + lifecycle; separation/superannuation events posted to **G12** (`source_module=G11`); `calc_trace` persisted; disbursement over X.3 with penny-drop.

**Parallelizable.** G10 must lead; G11 begins entity/rule-table work in parallel but its benefit engines cannot pass the provenance gate until G10 supplies last-pay-drawn and the Phase-3 writers (G04/G09) are live. Rule-table authoring (DA/commutation/family-pension/gratuity) parallelizes with case-flow work inside G11.

**Integration checkpoints.**
- **SR-contract conformance:** G11 *reads* SR for qualifying-service verification **and** *writes* separation events — verify both directions.
- **RBAC:** Pension/Payroll Officer roles (module-admin analogues); SoD (maker ≠ sanctioning authority) enforced by P01/P02.
- **Migration (P06):** legacy service-register and pension data through ETL+V, 3 dry runs, waves, `<gov>_source_id` traceability.
- **NFR:** deterministic reproducibility (same inputs + snapshotted rule version → same output).

**Mock/stub strategy.** G11 can develop against **recorded fixtures** of G10 emoluments, G04 leave-SR postings, and G09 orders while those integrate; swap to live before the provenance gate is enabled. PDA/treasury, DigiLocker, death-registry/DBT run against **X.3 sandbox stubs** until UAT.

---

## Phase 5 — Analytics (G14)

**Goal.** Close the program with role-scoped dashboards and compliance analytics over all owned data.

**Module.** **G14** Dashboard & Analytics (L).

**Entry criteria.** All source modules (G01–G13) producing data; G11 pension pipeline emitting so the pension-liability/compliance marts are meaningful.

**Exit criteria.**
- Marts + KPI definitions + reports built read-only over G01–G13; **G14 never mutates source records** — drill-through opens the owning module's record view read-only.
- Public-sector KPIs live: SR completeness, pension pipeline, disciplinary aging, reservation-roster views.
- Row-level security enforced via **P02** (not a parallel scheme); dashboard LCP < 2.5 s on pre-aggregated marts; report APIs p95 < 1000 ms uncached / < 300 ms cached.

**Parallelizable.** Individual marts/dashboards parallelize by source domain; each can be built and shipped as its source stabilizes rather than waiting for all sources.

**Integration checkpoints.**
- **SR-contract conformance:** G14 as SR **consumer** (read-only) for compliance KPIs.
- **RBAC:** analytics scope-policy honors PII ceilings and five scoping dimensions; no leak of out-of-scope records.
- **Schema reconciliation:** mart source columns track owner renames from earlier phases.

**Mock/stub strategy.** Any not-yet-stable source is represented by a **stub mart** with the final column contract, swapped to live extract on source exit — lets G14 start in parallel with Phase 4 without blocking.

---

## Program integration disciplines (all phases)

- **SR contract conformance** is a per-phase gate for every writer (G01, G04, G05, G06, G08, G09, G10, G11) and the consumer (G14). One owner (G12); no forks.
- **Schema reconciliation** re-runs the full 00→14 load with `ON_ERROR_STOP=1` at each phase boundary; the four known collisions stay fixed (retention/legal-hold, `ix_delegations_*`, `ix_sr_corr_*`, G12 `documents` seed).
- **RBAC** additions are registered in RBAC §4.3 as new roles/flags with SoD enforced by P01/P02 — never a parallel access scheme.
- **Conflict resolution:** arbiter = **Lead Architect**; platform artefact governs on intent conflict; a blocked module is quarantined (mock its port) and does not freeze parallel work (see `dependency-register.yaml` → `conflict_resolution`).
