# PH-00B Facade Boundary Recommendation

Recommendation: build a P01-compatible workflow facade first, backed by PUDA adapters, before extracting any shared module. The facade should be top-down from the HRMS/P01 contract, not bottom-up from PUDA route names.

Pinned PUDA commit assessed: `cadf39739e6f27c17d44767ca61d1a362034ac64`.

## Facade Surface

| P01 method / SPI | PUDA disposition | Evidence | PH-00B adapter hook |
|---|---|---|---|
| `startInstance` | needs-adapter | HRMS contract requires `WorkflowEngine.startInstance`: `docs/platform-grounding/extracts/platform_spec.txt:31-33`; PUDA has `application.service_version` and workflow state execution, but no clean exported P01 start surface in the inspected core. | `WorkflowInstanceRepository.create(subjectRef, workflowCode, context, resolvedVersion)` |
| `advance` | PUDA-satisfies with adapter | PUDA `executeTransition` advances transitions: `apps/api/src/workflow.ts:1158-1266`. | `TransitionAdapter.advance(instanceId, transitionCode, actor, idempotencyKey)` |
| `approve` | PUDA-satisfies with adapter | Approval tail is modeled as officer role action: `apps/api/src/workflow.route-model.ts:567-601`. | Normalize to `approve(instanceId, decisionPayload)` -> PUDA transition/action. |
| `reject` | PUDA-satisfies with adapter | Rejection tail is modeled: `apps/api/src/workflow.route-model.ts:604-624`. | Normalize rejection reason, audit action, and terminal mapping. |
| `sendBack` | needs-adapter | Query/return path exists: `apps/api/src/workflow.route-model.ts:665-742`; HRMS requires send-back to prior stage: `docs/platform-grounding/extracts/platform_spec.txt:29`. | `sendBack(instanceId, targetStage, reason)` with route validation. |
| `delegate` | needs-adapter | PUDA has LAC reader delegation only: `apps/api/migrations/109_lac_reader_delegation.sql:23-52`; HRMS requires generic delegation: `docs/platform-grounding/extracts/platform_spec.txt:33-34`. | `DelegationProvider` included in ApproverResolver. |
| `cancel` | needs-adapter | PUDA has terminal/cancel patterns in engine, but no P01-normalized cancel surface found. | `cancel(instanceId, reason, actor)` with branch/task cleanup and audit. |
| `query` | PUDA-satisfies with adapter | Query action validation exists: `apps/api/src/workflow.ts:2051-2070`; TaskDetail query behavior passed in focused UI tests. | Normalize query payload, unlocked fields/docs, and citizen response stage. |
| `listTasks/queryTasks` | PUDA-satisfies with adapter | PUDA task assignment by queue/role exists: `apps/api/src/workflow.ts:905-958`, `apps/api/src/work-queues.ts:50-82`. | HRMS task API must accept tenant/entity/person scope and return P01 task DTO. |
| `ApproverResolver` SPI | new-required | PUDA resolves queue/system-role assignment from workflow state: `apps/api/src/work-queues.ts:50-82`; HRMS requires reporting-chain/cost-centre resolution: `docs/platform-grounding/extracts/platform_spec.txt:28`. | `resolve(rule, subject, actor, asOfDate) -> approver candidates + evidence`. |
| `GuardProvider` SPI | needs-adapter | PUDA static conditions exist: `apps/api/src/workflow.ts:1268-1294`. | `evaluate(predicateCode, context) -> allow/deny/evidence`. |
| `ActionAdapter` SPI | needs-adapter | PUDA action execution mixes core and LAC side effects: `apps/api/src/workflow.ts:1926-2025`. | Register action handlers by owner: SR, document, notification, payroll, audit. |
| `FormAdapter` SPI | needs-adapter | HRMS W.2 requires entity binding/write-back: `docs/platform-grounding/extracts/platform_spec.txt:97-99`; PUDA has task UI metadata: `apps/api/src/workflow.ts:12-24`. | `loadForm`, `validateSubmission`, `writeBack`. |
| `AuditAdapter` SPI | needs-adapter | PUDA emits audit/evidence records: `apps/api/migrations/070_workflow_version_evidence_pack.sql:4-27`, `apps/api/src/workflow-waits.ts:134-150`. | Map every facade action to P05/workflow_actions. |
| `NotificationAdapter` SPI | needs-adapter | PUDA direct notification writes/calls exist: `apps/api/src/sla-checker.ts:97-105`, `apps/api/src/workflow.ts:2020-2023`. | Route to HRMS X.2 templates and delivery log. |

## Boundary Shape

Keep three layers:

1. `workflow-facade` contract: HRMS/P01 DTOs, idempotency, auth scope, tenant/entity scoping, method names.
2. `puda-workflow-adapter`: translates facade calls to PUDA transition/config/task primitives at the pinned commit lineage.
3. `hrms-spi-providers`: hierarchy/authority resolver, guard predicates, actions, forms, audit, notification, documents.

The facade must not expose PUDA queue keys, LAC action names, service-pack paths, `authority_id` as tenant identity, or raw `service_version` semantics. These are adapter internals.

## PH-00B Exit Criteria

PH-00B is ready only when:

- The P01 facade contract is frozen in `docs/spec/workflow-platform-contract.yaml` and `docs/contracts/openapi/P01-workflow.yaml`.
- Existing PUDA workflow/task behavior can be called through an additive facade shim without editing `workflow.ts` or `tasks.ts`.
- Focused conformance covers simple transitions, waits, fork/join context preservation, and department references.
- No code is extracted into a shared workflow package; that remains PH-00C.
- License/provenance and full aggregate-golden cleanup are recorded as human-gate caveats before extraction.

The earlier G03 reporting-chain and G05 transfer-clearance proofs are now assigned to later phases:

- PH-01/PH-02: hierarchy/statutory authority resolver data and SPI implementation.
- PH-06: G03 Leave and G05 Transfer vertical slices through the enhanced platform.
