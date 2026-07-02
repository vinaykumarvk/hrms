# PUDA Workflow Engine -> HRMS/P01 Capability Gap Matrix (PH-00A)

Purpose: score the current PUDA workflow engine against the HRMS/P01 target so PH-00B can decide whether to reuse as-is, reuse with enhancements, wrap behind a facade, or rebuild.

Evidence rule used in this pass: every PRESENT/PARTIAL/ABSENT decision cites PUDA path:line, HRMS target path:line, or a command/test result captured in `docs/spec/puda-golden-behavior-baseline.md`. PUDA was not edited.

Pinned PUDA commit: `cadf39739e6f27c17d44767ca61d1a362034ac64`.

Target anchors:
- HRMS/P01 requires idempotent approve/reject/sendBack/advance/delegate/cancel/query and workflow action/audit writes: `docs/contracts/state-machines.yaml:9-14`, `docs/platform-grounding/extracts/platform_spec.txt:31-33`.
- HRMS/P01 pattern semantics include SEQUENTIAL, PARALLEL_ALL_OF, PARALLEL_ANY_OF, CONDITIONAL, DYNAMIC_APPROVER: `docs/contracts/state-machines.yaml:20-21`, `docs/platform-grounding/extracts/platform_spec.txt:27`.
- HRMS/P01 approver resolution requires named role, reporting-chain position, named individual, and cost-centre head: `docs/platform-grounding/extracts/platform_spec.txt:28`.

## Section A - Workflow Patterns

| # | Pattern | HRMS need | PUDA | Evidence | Gap & enhancement | Effort |
|---|---|---|---|---|---|---|
| A1 | SEQUENTIAL multi-stage | G02/G03/G05/G06/G08/G09 approvals | PRESENT | `apps/api/src/workflow.ts:1158-1266` executes transitions with state/actor/role checks; `workflow.engine.integration.test.ts` passed 27/27 in aggregate baseline. | Map facade verbs to PUDA transition IDs and normalize error envelope. | S |
| A2 | PARALLEL_ALL_OF | Clearance/no-dues and service verification | PRESENT | Fork/join persistence supports `completion_mode IN ('ALL','AT_LEAST')`: `apps/api/migrations/046_workflow_fork_join.sql:6-24`; HRMS uses ALL_OF for G05 and G11: `docs/contracts/state-machines.yaml:337-349`, `docs/contracts/state-machines.yaml:863-873`. | Expose as P01 facade pattern and add HRMS branch naming conventions. | S |
| A3 | PARALLEL_ANY_OF | Any-of approver sets, loser cancellation | PARTIAL | PUDA supports `AT_LEAST` joins: `apps/api/src/workflow.ts:49-64`, `apps/api/migrations/046_workflow_fork_join.sql:13-16`; branch cancel function exists in transition flow: `apps/api/src/workflow.ts:1092-1115` (observed in source scan). | HRMS needs explicit first-wins semantics and deterministic loser-cancel audit per `docs/platform-grounding/extracts/platform_spec.txt:27`. | M |
| A4 | CONDITIONAL / decision-matrix routing | Eligibility/threshold branches | PRESENT | Transition guard evaluates conditions at advance time: `apps/api/src/workflow.ts:1268-1294`; route model builds branch paths without DB: `apps/api/src/workflow.route-model.ts:1-10`. | Lift PUDA guard syntax into facade contract and bind HRMS predicates through D2. | S |
| A5 | DYNAMIC_APPROVER | Runtime hierarchy, committees, authority chains | PARTIAL | PUDA dynamically routes to role/queue targets: `apps/api/src/work-queues.ts:50-82`; HRMS requires runtime reporting-chain and cost-centre resolution: `docs/platform-grounding/extracts/platform_spec.txt:28`. | Add ApproverResolver SPI and HRMS hierarchy/authority resolver. | L |

## Section B - Tier-0 Dynamic Approver Resolution

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort |
|---|---|---|---|---|---|---|
| B1 | Reporting-chain resolution | Leave, regularisation, personal-detail approvals | ABSENT | HRMS G03 explicitly requires reporting-chain routing: `docs/contracts/state-machines.yaml:171-181`. PUDA routing vocabulary scan over `workflow.route-model.ts`, `work-queues.ts`, and `officer-routing-reconciliation.ts`: `reports_to=0`, `reporting_manager=0`, `manager_id=0`, `HOD=0`, `hierarchy=0`; PUDA creates tasks by work queue/system role: `apps/api/src/workflow.ts:905-958`. | Build HRMS `reportingChain(employee, asOfDate, fallbackPolicy)` resolver behind D1. | L |
| B2 | Positional/statutory-authority resolution | APAR, disciplinary, promotion, transfer | ABSENT | HRMS needs statutory/reporting/reviewing/accepting authorities: `docs/platform-grounding/extracts/platform_spec.txt:28`; PUDA has designation-to-role/queue mapping, not statutory HR authority: `apps/api/src/officer-routing-reconciliation.ts:50-80`. | Build authority matrix resolver with effective dating and vacancy/acting fallback. | L |
| B3 | Cost-centre / org-unit-head resolution | Budget/dept approvals | PARTIAL | PUDA has org-unit queue addressing: `apps/api/migrations/039_work_queue_routing_foundation.sql:37-61`, `apps/api/src/work-queues.ts:34-48`; HRMS needs the person holding head authority, not only an org queue: `docs/platform-grounding/extracts/platform_spec.txt:28`. | Add org-unit head resolver that returns concrete assignee candidates. | M |
| B4 | Queue/lane vs person-hierarchy routing | Decide core reuse boundary | PRESENT (queue/role model confirmed, not HR hierarchy) | Current PUDA queue key is `authority:orgUnit:level`: `apps/api/src/work-queues.ts:34-48`; lane was removed from the queue key: `apps/api/migrations/154_drop_lane_from_queue_key.sql:1-7`; vocabulary scan: `role=64`, `queue=54`, `lane=10`, `designation=8`, hierarchy/reporting terms all zero. | This confirms facade must inject HRMS hierarchy resolution rather than copying PUDA routing as-is. | L |

## Section C - Tier-1 Engine Capabilities

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort |
|---|---|---|---|---|---|---|
| C1 | Delegation / acting-charge / out-of-office | Vacant posts, officers on leave | PARTIAL | PUDA has LAC reader delegation only: `apps/api/migrations/109_lac_reader_delegation.sql:23-52`; HRMS needs generic approval delegation per P01: `docs/platform-grounding/extracts/platform_spec.txt:33-34`. | Generalize to `DelegationProvider` used by ApproverResolver. | M |
| C2 | Committee / quorum + member recusal | DPC, inquiry, calibration | PARTIAL | PUDA supports parallel branches and role chains: `apps/api/migrations/046_workflow_fork_join.sql:34-45`, `apps/api/src/workflow.route-model.ts:627-640`; HRMS promotion requires quorum/panel semantics: `docs/contracts/state-machines.yaml:422-424`. | Add committee membership, quorum, recusal, and SoD validations outside the core engine. | L |
| C3 | Parallel all-of join + branch SLA + deemed-clearance | Relieving and FnF clearance | PARTIAL | Parallel join exists: `apps/api/migrations/046_workflow_fork_join.sql:6-24`; SLA breach detection exists: `apps/api/src/sla-checker.ts:25-47`; HRMS needs deemed clearance after SLA exhaustion: `docs/contracts/state-machines.yaml:337-349`. | Compose branch SLA with deemed-outcome policy and audit event. | M |
| C4 | SLA pause/resume + statutory clocks + deemed outcomes | Disciplinary timelines, deemed approval | PARTIAL | Wait states can pause and resume SLA: `apps/api/migrations/043_workflow_waits_and_waiting_states.sql:6-40`, `apps/api/src/workflow-waits.ts:49-180`; SLA checker emits audit/notifications: `apps/api/src/sla-checker.ts:90-115`. | Add statutory clock types, pause reasons, and configured breach/deemed outputs. | M |
| C5 | Send-back / recall / reroute to prior stage | Rejections and resubmission | PARTIAL | Query/return route construction exists: `apps/api/src/workflow.route-model.ts:665-742`; query action validates pending query state: `apps/api/src/workflow.ts:2051-2070`. | Normalize sendBack/recall semantics and enforce one P01 action row. | M |
| C6 | In-flight version pinning | Long-running appraisal/disciplinary flows | PRESENT | Application pins `service_version`: `apps/api/migrations/002_complete_schema.sql:216-235`; transition loads the pinned version: `apps/api/src/workflow.ts:1196-1208`; migration states in-flight keeps original version: `apps/api/migrations/168_one_published_version_per_service.sql:9-15`. | Map to HRMS workflow-instance version field. | S |
| C7 | Effective-dated config cascade | Platform -> tenant -> entity -> employee policies | PARTIAL | PUDA active version resolves by effective dates: `apps/api/src/service-version.ts:3-28`; HRMS requires cascade and overrides: `docs/platform-grounding/extracts/platform_spec.txt:17-19`, `docs/platform-grounding/extracts/platform_spec.txt:57`. | Add HRMS config cascade before calling PUDA/facade. | M |
| C8 | Idempotent stage advance | Double-click/retry safety | PARTIAL | PUDA locks application rows with `FOR UPDATE`: `apps/api/src/workflow.ts:1176-1185`; HRMS target requires idempotency key semantics: `docs/platform-grounding/extracts/platform_spec.txt:20`, `docs/platform-grounding/extracts/platform_spec.txt:30`. | Add facade idempotency key and action de-duplication. | M |
| C9 | Maker != checker / no-self-approval hook | SoD across approvals | PARTIAL | Config publish roles separate submit/approve capabilities: `apps/api/src/workflow-config-capabilities.ts:24-35`, `apps/api/src/workflow-config-capabilities.ts:91-135`; HRMS SoD invariant is broader: `docs/contracts/state-machines.yaml:31-35`. | Central SoD guard SPI for all approval actions. | M |
| C10 | Sealed-cover / confidential visibility overlay | APAR adverse entries, disciplinary confidentiality | PARTIAL | PUDA masks PII on open workflow tasks: `apps/api/src/workflow-privacy.ts:1-18`, `apps/api/src/workflow-privacy.ts:120-148`; HRMS W.1 requires confidential roles/visibility: `docs/platform-grounding/extracts/platform_spec.txt:88-96`. | Add stage-level visibility rules and sealed-cover status. | M |

## Section D - Tier-2 Integration SPIs

| # | SPI | HRMS need | PUDA | Evidence | Gap & enhancement | Effort |
|---|---|---|---|---|---|---|
| D1 | Approver-resolver SPI | Inject HRMS hierarchy without editing every flow | ABSENT | PUDA resolves assignment inside engine from state fields: `apps/api/src/work-queues.ts:50-82`; no external resolver hook was found in routing scan; HRMS requires reporting-chain/cost-centre mechanisms: `docs/platform-grounding/extracts/platform_spec.txt:28`. | Define `resolveApprovers(context, rule)` facade SPI; PUDA adapter can translate resolved users to tasks/queues. | L |
| D2 | Guard/predicate SPI | HRMS rules such as no pending disciplinary | PARTIAL | PUDA validates and evaluates static workflow conditions: `apps/api/src/workflow-config-validation.ts:208-240`, `apps/api/src/workflow.ts:1268-1294`. | Add external guard provider with typed HRMS predicates and evidence payload. | M |
| D3 | Action / side-effect SPI | SR posting, master update, payroll input | PARTIAL | PUDA action catalog has core/document/payment/notification/LAC owners: `apps/api/src/workflow-action-catalog.ts:1-58`; execution is still hardcoded with LAC branches: `apps/api/src/workflow.ts:1926-2025`. | Move hardcoded actions behind `WorkflowActionAdapter`. | L |
| D4 | Form / data-collection stage with write-back | HRMS entity-bound forms | PARTIAL | HRMS W.2 requires form binding/write-back: `docs/platform-grounding/extracts/platform_spec.txt:97-99`; PUDA exposes task UI/form metadata on states: `apps/api/src/workflow.ts:12-24`. | Add typed form adapter and HRMS entity write-back contract. | M |
| D5 | Document/letter generation | Orders, PPOs, penalty letters | PARTIAL | PUDA action catalog has document/output generation: `apps/api/src/workflow-action-catalog.ts:31-44`; current aggregate baseline failed template parity for two LoI transfer templates. | Reuse rendering pattern behind HRMS document adapter; fix/avoid PUDA-specific template gaps. | M |
| D6 | Audit (P05) hook | Tamper-evident workflow/action evidence | PARTIAL | PUDA persists workflow version evidence packs: `apps/api/migrations/070_workflow_version_evidence_pack.sql:4-27`; waits and SLA insert audit events: `apps/api/src/workflow-waits.ts:134-150`, `apps/api/src/sla-checker.ts:90-95`. | Map to HRMS P05 DB-trigger/audit substrate and workflow_actions ledger. | M |
| D7 | Notification (X.2) hook | Approval, reminder, escalation notices | PARTIAL | SLA checker inserts notifications: `apps/api/src/sla-checker.ts:97-105`; workflow LAC actions call notifications directly: `apps/api/src/workflow.ts:2020-2023`. | Replace direct notification calls with X.2 adapter. | S |

## Section E - Config Governance & Multi-tenancy

| # | Capability | HRMS need | PUDA | Evidence | Gap & enhancement | Effort |
|---|---|---|---|---|---|---|
| E1 | Versioned config + publish governance | Safe W.1 change lifecycle | PRESENT | Maker-checker publish review table: `apps/api/migrations/096_workflow_config_publish_review.sql:1-38`; focused aggregate run showed five publish-guard tests passed before interruption. | Keep governance model; add HRMS approval policy. | S |
| E2 | Concurrency-safe config edit | Multi-admin editing | UNCLEAR | `admin-workflow-config.concurrency.test.ts` is in corpus, but the long aggregate run was interrupted before a completed concurrency verdict. | Re-run under normalized test config and capture exact results before PH-00B build gate. | M |
| E3 | Config validation | Reject invalid flows | PRESENT | Validation covers state/transition/wait/fork/join primitives: `apps/api/src/workflow-config-validation.ts:1-72`; assignment validation checks task states: `apps/api/src/workflow-config-validation.ts:181-193`. | Add HRMS resolver-rule validation after D1. | S |
| E4 | Multi-tenancy scoping | tenant_id/entity_id isolation | PARTIAL | PUDA application scope is `authority_id`: `apps/api/migrations/002_complete_schema.sql:216-235`; HRMS requires tenant/entity isolation on every business table: `docs/platform-grounding/extracts/platform_spec.txt:17`. | Put PUDA behind HRMS tenant/entity-scoped repositories or add tenant/entity columns in extracted package. | L |
| E5 | Config simulation / preview | Test flow before publish | PRESENT | Simulation report and graph/path checks exist: `apps/api/src/workflow-simulation.ts:1-50`, `apps/api/src/workflow-simulation.ts:98-120`, `apps/api/src/workflow-simulation.ts:178-212`. | Add HRMS resolver and SPI simulations. | S |

## Rollup

- PRESENT 8 / PARTIAL 19 / ABSENT 3 / UNCLEAR 1 (31 rows in the current template).
- Critical-path gaps: B1 reporting-chain resolver, B2 statutory-authority resolver, D1 ApproverResolver SPI, E4 tenant/entity isolation, C7 HRMS config cascade, C8 idempotency-key semantics.
- Biggest question answered: PUDA routing is queue/role/designation based, not person-hierarchy based. B4 is confirmed by source lines and vocabulary scan.
- PH-00B recommendation: **wrap behind facade + reuse with enhancements**.
- Confidence: **0.78**. The reusable core is evidenced by source and green focused tests; confidence is capped by unclear repository license/provenance, dirty PUDA worktree, committed Vitest config startup failure, two aggregate golden failures, and the absent Tier-0 HRMS hierarchy resolver.

## Ordered PH-00B/PH-01 Backlog

1. Define P01 facade and SPIs: `startInstance`, `advance`, `approve`, `reject`, `sendBack`, `delegate`, `cancel`, `query`, `ApproverResolver`, `GuardProvider`, `ActionAdapter`, `FormAdapter`.
2. Build HRMS hierarchy/statutory-authority resolver behind D1; prove with G03 leave and G05 transfer/clearance synthetic fixtures.
3. Move PUDA hardcoded actions/document/notification/payment/LAC hooks behind adapters.
4. Add facade idempotency key and HRMS audit/action ledger mapping.
5. Add tenant/entity scoping and config cascade at the facade/repository boundary.
6. Normalize PUDA test command and re-run the complete golden corpus against an isolated DB.
7. Resolve repository license/provenance before extracting any shared package.
