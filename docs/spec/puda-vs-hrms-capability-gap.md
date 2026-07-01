# PUDA Workflow Engine → HRMS/P01 Capability Gap Matrix (PH‑00A)

**Purpose:** score the *current* PUDA workflow engine against the workflow capabilities HRMS needs (the P01
target), so PH‑00B can make a leverage decision (reuse‑as‑is / reuse‑with‑enhancements / wrap‑behind‑facade /
rebuild). **Fill every `PUDA` and `Evidence` cell from the actual PUDA source — do not infer or leave blank.**

## How to fill (rules)
- **Scoring:** `PRESENT` (works for HRMS as‑is) · `PARTIAL` (exists but needs change) · `ABSENT` · `UNCLEAR`.
- **Evidence is mandatory** for any PRESENT/PARTIAL: cite `path:line` and/or a passing test. No prose‑only claims.
- **Effort:** S / M / L / XL for the enhancement to reach the HRMS need (leave `—` if PRESENT).
- The **`Look here`** column is a starting hint from the PH‑00A scan — confirm it, don't trust it.
- **Do not fix PUDA** while filling this; capture what is, not what should be.

**Target sources:** `docs/contracts/state-machines.yaml` (73 machines, patterns) · `docs/platform-grounding/extracts/platform_spec.txt` (§P01) · `docs/architecture.md`.

---

## Section A — Workflow patterns (from state-machines.yaml: SEQUENTIAL×83, PARALLEL_ALL_OF×11, DYNAMIC_APPROVER×3, CONDITIONAL×1, PARALLEL_ANY_OF×1)

| # | Pattern | HRMS need (example modules) | PUDA | Evidence (path:line / test) | Gap & enhancement | Effort | Look here |
|---|---|---|---|---|---|---|---|
| A1 | SEQUENTIAL multi‑stage | almost every approval (G02/G03/G05/G06/G08/G09) | `<TBD>` | | | | `workflow.group1-simple-linear.test.ts`, `workflow.ts` |
| A2 | PARALLEL_ALL_OF (join when all complete) | multi‑dept clearance/no‑dues (G05, G10/G11 FnF) | `<TBD>` | | | | `046_workflow_fork_join.sql`, `workflow.group7-fork-join.test.ts` |
| A3 | PARALLEL_ANY_OF (first‑wins, cancel losers) | any‑of approver sets | `<TBD>` | | | | `046_workflow_fork_join.sql`, `090_parallel_reference_workflow_versions.sql` |
| A4 | CONDITIONAL / decision‑matrix routing | value/threshold branch (G06 eligibility, G03 policy) | `<TBD>` | | | | `workflow.route-model.ts`, `workflow.group5-complex-branching.test.ts` |
| A5 | DYNAMIC_APPROVER (resolved at runtime) | committees/panels; hierarchy chains | `<TBD>` | | | | `workflow.route-model.ts`, `workflow-config-capabilities.ts` |

## Section B — Tier‑0: dynamic approver resolution (**the ~65% unlock — critical path**)

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort | Look here |
|---|---|---|---|---|---|---|---|
| B1 | **Reporting‑chain resolution** (L1→L2→…→HOD, vacancy/absence fallback) | leave/regularisation/personal‑details (G03,G02) | `<TBD>` | | | | `workflow.route-model.ts`, `officer-routing-reconciliation.ts`, `039_work_queue_routing_foundation.sql` |
| B2 | **Positional/statutory‑authority resolution** (Reporting/Reviewing/Accepting; Disciplinary/Appellate; Appointing/Cadre‑controlling) | APAR (G08), disciplinary (G09), promotion/transfer (G05/G06) | `<TBD>` | | | | `workflow.route-model.ts`, `workflow-config-capabilities.ts` |
| B3 | Cost‑centre / org‑unit‑head resolution | budget/dept approvals | `<TBD>` | | | | `039_work_queue_routing_foundation.sql` |
| B4 | **Resolution is queue/lane‑based vs person‑hierarchy‑based** — WHICH? (the pivotal question) | HRMS needs person‑hierarchy; PUDA appears queue/lane | `<TBD>` | | | | `154_drop_lane_from_queue_key.sql`, `107_lac_nayab_tehsildar_queue_map_restore.sql`, `179_staff_puda_queue_positions.sql`, `work-queues.ts` |

## Section C — Tier‑1: engine capabilities

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort | Look here |
|---|---|---|---|---|---|---|---|
| C1 | Delegation / acting‑charge / out‑of‑office | officers on leave; vacant posts (all) | `<TBD>` | | | | `109_lac_reader_delegation.sql`, `126/127_*finance_delegation.sql`, `tasks.reassignment.test.ts` |
| C2 | Committee / quorum + member recusal (SoD) | DPC (G06), inquiry (G09), calibration (G08) | `<TBD>` | | | | `workflow.route-model.ts` (verify), `workflow-config-capabilities.ts` |
| C3 | Parallel‑all‑of join + per‑branch SLA + **deemed‑clearance** | relieving/FnF clearance (G05/G10/G11) | `<TBD>` | | | | `046_workflow_fork_join.sql`, `sla.ts`, `sla-checker.ts` |
| C4 | **SLA pause/resume + statutory clocks + deemed‑outcomes** | disciplinary timelines (G09), deemed‑approval (G05) | `<TBD>` | | | | `sla.ts`, `sla-checker.ts`, `043_workflow_waits_and_waiting_states.sql`, `workflow-waits.ts`, `workflow.waits.integration.test.ts` |
| C5 | Send‑back / recall / re‑route to a prior stage | rejections & resubmission (all) | `<TBD>` | | | | `133_workflow_foundation_returns_and_document_reviews.sql`, `tasks.ts` |
| C6 | **In‑flight version pinning** (running instances unaffected by config change) | mid‑cycle appraisal, any long flow (G08, all) | `<TBD>` | | | | `admin-workflow-config.in-flight.test.ts`, `168_one_published_version_per_service.sql`, `096_workflow_config_publish_review.sql` |
| C7 | Effective‑dated config cascade (platform→tenant→entity→employee) | date‑effective gov policy | `<TBD>` | | | | `096_workflow_config_publish_review.sql`, `service-version.ts` |
| C8 | Idempotent stage advance (double‑click safety) | all | `<TBD>` | | | | `workflow.ts`, `tasks.ts` |
| C9 | Maker ≠ checker / no‑self‑approval hook | all (SoD) | `<TBD>` | | | | `route-access.ts`, `workflow-privacy.ts` |
| C10 | Sealed‑cover / confidential‑visibility overlay | adverse APAR (G08), disciplinary (G09) | `<TBD>` | | | | `workflow-privacy.ts`, `workflow-privacy.test.ts` |

## Section D — Tier‑2: integration SPIs (the seams HRMS attaches to)

| # | SPI | HRMS need | PUDA | Evidence | Gap & enhancement | Effort | Look here |
|---|---|---|---|---|---|---|---|
| D1 | **Approver‑resolver SPI** (engine calls out to an org/hierarchy resolver) | inject HRMS hierarchy (B1/B2) without editing flows | `<TBD>` | | | | `workflow.route-model.ts`, `officer-routing-reconciliation.ts` |
| D2 | Guard/predicate SPI (conditional stages call HRMS rules) | "no pending disciplinary", "APAR communicated", "qualifying service ≥ X" | `<TBD>` | | | | `workflow-config-validation.ts`, `workflow.route-model.ts` |
| D3 | Action / side‑effect SPI (on complete → post SR, update master, emit payroll input) | SR posting (G12), master update (G01) | `<TBD>` | | | | `workflow-action-catalog.ts`, `workflow.ts` |
| D4 | Form / data‑collection stage with entity write‑back (W.2) | change forms bound to HRMS entities | `<TBD>` | | | | `workflow-action-catalog.ts`, `domain-workflow-config.ts` |
| D5 | **Document/letter‑generation stage** (LoI ≈ HRMS orders/PPO — likely direct reuse) | transfer/promotion/penalty orders, PPO | `<TBD>` | | | | `workflow.output-template-parity.test.ts`, `workflow-action-catalog.ts` |
| D6 | Audit (P05) hook — mutation + decision evidence | tamper‑evident SR/audit | `<TBD>` | | | | `070_workflow_version_evidence_pack.sql`, `workflow-diagnostics.ts` |
| D7 | Notification (X.2) hook | approval/reminder/escalation notices | `<TBD>` | | | | `sla-checker.ts`, `tasks.ts` |

## Section E — Config governance & multi‑tenancy

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort | Look here |
|---|---|---|---|---|---|---|---|
| E1 | Versioned config + publish governance (W.1) | safe config change | `<TBD>` | | | | `096_workflow_config_publish_review.sql`, `admin-workflow-config.publish-guard.test.ts` |
| E2 | Concurrency‑safe config edit | multi‑admin editing | `<TBD>` | | | | `admin-workflow-config.concurrency.test.ts` |
| E3 | Config validation (circular‑ref, assignee, SLA present) | valid flows only | `<TBD>` | | | | `workflow-config-validation.ts`, `workflow-config-validation.test.ts` |
| E4 | **Multi‑tenancy scoping** (tenant_id/entity_id) — PUDA may be single‑authority | HRMS is multi‑tenant | `<TBD>` | | | | `002_complete_schema.sql`, `workflow.ts` |
| E5 | Config simulation / preview | test a flow before publish | `<TBD>` | | | | `workflow-simulation.ts`, `ServiceRoutingPreview.tsx` |

---

## Rollup (fill after the matrix)
- **PRESENT __ / PARTIAL __ / ABSENT __ / UNCLEAR __** (of ~34 capabilities).
- **Critical‑path gaps** (block ≥1 module and are non‑trivial): _list B‑row + any XL._
- **Biggest single question answered:** is PUDA routing queue/lane‑based or person‑hierarchy‑based? → _____ (B4). If queue/lane, the Tier‑0 resolver + D1 SPI is the primary enhancement, and it gates ~65% of HRMS.
- **PH‑00B recommendation:** reuse‑as‑is / reuse‑with‑enhancements / wrap‑behind‑facade / rebuild — **__** (confidence: __).
- **Enhancement backlog for PH‑00B/PH‑01** (ordered by module‑gating × effort): _____.
