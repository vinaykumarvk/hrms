# PH‑00 Candidate‑Set Reconciliation — plan list vs actual PUDA workflow assets

Sanity check of `docs/spec/phased-plan.yaml → source_artifacts.puda.extraction_candidates` against the real
`/Users/n15318/PUDA_workflow_engine` repo, done before running PH‑00A. **Verdict: the candidate set is
materially incomplete** — it captures the headline files but misses core runtime, ~15 migrations, the entire
existing test corpus, and most of the officer UI. One structural finding is decision‑critical (below).

## 1. Listed candidates — all 18 exist ✅
Every file in `extraction_candidates` was found (e.g., `workflow.ts` 2,625 lines, `WorkflowConfigConsole.tsx`
3,381 lines, `workflow.route-model.ts` 743, `workflow-simulation.ts` 677, plus the 7 listed migrations and the
`workflow-config/**` UI dir). No dead references.

## 2. Missing — core runtime source (ADD to `reusable-core` candidates)
These are production workflow‑runtime files not on the list; several are central to the PH‑00B facade:
- `apps/api/src/tasks.ts` — **task model** (the `act` / `queryTasks` surface — cannot define the facade without it)
- `apps/api/src/sla.ts`, `apps/api/src/sla-checker.ts` — **SLA runtime + escalation** (Tier‑1 C3/C4)
- `apps/api/src/workflow-waits.ts` — waiting/timer states (relevant to SLA pause/resume; C4)
- `apps/api/src/workflow-action-catalog.ts` — **stage action catalog** (core to the config model; D3/D4/D5)
- `apps/api/src/workflow-config-validation.ts` — publish/circular‑ref/assignee validation (E3, D2)
- `apps/api/src/workflow-routing-normalization.ts` — routing normalization
- `apps/api/src/workflow.static-loader.ts` — definition loading
- `apps/api/src/workflow-privacy.ts` — **visibility control** (nearest thing to sealed‑cover; C10)
- `apps/api/src/route-access.ts` — route/authorization gating (C9)
- `apps/api/src/domain-workflow-config.ts` — domain config bridge (classify: adapter vs core)
- `apps/api/src/workflow-diagnostics.ts` — diagnostics/evidence
- `apps/api/src/workflow.test-helpers.ts` — **test harness** (needed to run the golden corpus)
- `apps/api/src/workflow-payment-collections.ts` — likely PUDA‑domain (payments) → classify, probably adapter/excluded

## 3. Missing — migrations (ADD; workflow‑relevant, not on the list)
`036_task_arn_index`, `044_fix_application_state_constraint_after_waits`, `047_workflow_payment_collections`,
`070_workflow_version_evidence_pack` (audit evidence, D6), `077_domain_workflow_services`,
`090_parallel_reference_workflow_versions` (parallel, A3), **`109_lac_reader_delegation`** (delegation, C1),
`126/127_*finance_delegation` (delegation, C1), `133_workflow_foundation_returns_and_document_reviews`
(send‑back + doc review, C5/D5), `137/153/154/156/157/158_*` (workflow reference/review/lane lifecycle —
esp. **`154_drop_lane_from_queue_key`**, evidence of the queue/lane routing model), `161_approval_building_plan_engineering_routing`,
`164_workflow_routing_normalization_support`. The many `lac_*` / `land_pooling` / `election_*` migrations are
**domain** → keep excluded but tag them explicitly so the inventory shows they were considered.

## 4. Missing — the existing TEST CORPUS (54 workflow‑related test files) → use as ready‑made golden baselines
The Golden‑Behavior loop says "find or create" tests — here they mostly **already exist**. Point the loop at
them (run, don't re‑author). Highest‑value, mapped to capabilities:
- Engine/patterns: `workflow.group1‑simple‑linear` … `group8‑special`, `workflow.engine.integration`,
  `workflow.combinatorial.integration`, `workflow.path-walker.integration`, `workflow.internal-path-walker`,
  `workflow-branch-aware-stages` (A1/A4), **`workflow.group7-fork-join`** (A2/A3)
- SLA/waits: `sla.test`, `sla-checker` behavior, **`workflow.waits.integration`** (C4)
- Config governance: **`admin-workflow-config.in-flight`** (C6), `admin-workflow-config.publish-guard` (E1),
  `admin-workflow-config.concurrency` (E2), `admin-workflow-config.copy-and-make-active`, `workflow-config-validation` (E3)
- Routing/queues: `work-queues.test`, `officer-routing-reconciliation.test`, `workflow-routing-normalization.test`
- Privacy: `workflow-privacy.test` (C10) · Output/letters: `workflow.output-template-parity` (D5) · Certification: `workflow-service-pack-certification.test`
- Officer UI: `TaskDetail.workflow-engine-behavior.test`, `ServiceRoutingPreview.route-references.test`, `workflow-config/graph/WorkflowSwimlanes.test`

## 5. Missing — officer UI surfaces (ADD; classify reusable‑core vs adapter)
`apps/officer/src/ServiceRoutingPreview.tsx` (+css), `apps/officer/src/TaskDetail.*` (the "act" surface),
`apps/officer/src/workflow-config/graph/*` (WorkflowSwimlanes/GraphView/Node/Edge), `.../actor-cards/*`.
The listed `workflow-config/**` glob technically covers the dir, but the graph + task‑detail surfaces deserve
explicit classification because they define the admin/act UX the HRMS facade must preserve or replace.

## 6. 🔑 Decision‑critical finding — PUDA routes by **role/queue/lane**, not by **person‑hierarchy**
Evidence (route model + work‑queues + reconciliation source):

| Signal | Count | |
|---|---|---|
| `role` / `queue` / `lane` / `designation` | 84 / 60 / 13 / 10 | assignment is by **role → work‑queue / lane / designation** |
| `hierarchy` | 1 | — |
| `reports_to` / `reporting_manager` / `manager_id` / `HOD` / `reporting_officer` | 0 | **absent** |

Assignees are modelled as `actorSystemRoles: string[]` routed to queues like `GENERIC_OFFICER` / `PENDING_AT_CLERK`
(BFS over states), and migrations show `queue_map`, `staff_puda_queue_positions`, `drop_lane_from_queue_key`.

**Implication:** the engine core (state machine, transitions, tasks, queues, SLA, waits, config versioning +
publish governance, doc/letter generation, simulation, privacy) is **reusable**, but the **Tier‑0 dynamic
reporting/positional‑hierarchy resolver (gap rows B1/B2) is genuinely ABSENT** — and it gates ~65% of HRMS.
This makes the likely PH‑00B verdict **"reuse‑with‑enhancements,"** with the **hierarchy/authority resolver +
approver‑resolver SPI (B1/B2/D1) as the single critical‑path enhancement.** PH‑00A should confirm this as its
headline finding (matrix row B4) rather than let the agent rediscover it late.

## 7. Recommended edits to `phased-plan.yaml` before running PH‑00A
1. **Expand `extraction_candidates`** with §2 (runtime), §3 (migrations), §5 (UI), grouped as:
   `reusable-core-runtime`, `config-governance`, `sla-and-waits`, `officer-ui`, and add a `golden-test-corpus`
   list = §4 (so the Golden loop runs existing tests).
2. **Tag** the `lac_*` / `land_pooling` / `election_*` / `loi_*` / `payment` assets as `puda-domain-only`
   explicitly (considered‑and‑excluded), so the inventory shows completeness, not omission.
3. **Add the routing‑model question as a named PH‑00A deliverable** (matrix B4): "queue/lane vs
   person‑hierarchy — confirm, and size the resolver + SPI enhancement."
4. Point the **Golden‑Behavior loop at the existing 54‑file corpus** (run + pin), not "create."

**Bottom line:** the candidate set roughly doubles once runtime + migrations + tests + UI are included, and the
most important PH‑00A output is already foreshadowed — reuse the PUDA engine, and build the person‑hierarchy
resolver as the first enhancement.
