# PH-00A Verdict

Verdict: **wrap behind a P01 facade + reuse with enhancements**.

Confidence: **0.78**.

Do not copy PUDA workflow code directly into HRMS. Do not rebuild the workflow engine from scratch. The right move is to put a stable HRMS/P01 facade in front of PUDA workflow mechanics, add the missing hierarchy/authority resolver and SPIs, and only then extract a reusable package if the legal/provenance and golden-suite gates are clean.

## Why Not Reuse As-Is

PUDA's core routing is role/queue/designation based, not person-hierarchy based. Evidence:

- Queue key is `authority:orgUnit:level`: `apps/api/src/work-queues.ts:34-48`.
- Task creation writes `WORK_QUEUE` or `SYSTEM_ROLE`: `apps/api/src/workflow.ts:905-958`.
- Officer routing aligns designation to role and queue: `apps/api/src/officer-routing-reconciliation.ts:50-80`.
- Routing vocabulary scan: `role=64`, `queue=54`, `lane=10`, `designation=8`, while `hierarchy`, `reports_to`, `reporting_manager`, `manager_id`, `HOD`, and `reporting_officer` are all zero in the core route files.

HRMS/P01 requires reporting-chain, cost-centre head, and named individual resolution: `docs/platform-grounding/extracts/platform_spec.txt:28`. That missing Tier-0 resolver gates leave, regularisation, APAR, transfer, promotion, disciplinary, and many approval flows.

## Why Not Rebuild

PUDA already has substantial reusable workflow mechanics:

- Transition execution with row locking and role checks: `apps/api/src/workflow.ts:1158-1266`.
- Version pinning through `application.service_version`: `apps/api/src/workflow.ts:1196-1208`.
- Fork/join persistence: `apps/api/migrations/046_workflow_fork_join.sql:6-24`.
- Wait/pause/resume primitives: `apps/api/migrations/043_workflow_waits_and_waiting_states.sql:6-40`, `apps/api/src/workflow-waits.ts:49-180`.
- Validation and simulation: `apps/api/src/workflow-config-validation.ts:1-72`, `apps/api/src/workflow-simulation.ts:1-50`.
- Publish governance: `apps/api/migrations/096_workflow_config_publish_review.sql:1-38`.
- Focused golden tests: queue routing 6/6 passed; officer workflow UI behavior 22/22 passed.

Rebuilding would discard tested engine behavior and repeat risks that can be isolated behind a facade.

## Confidence Limiters

- Repository license/provenance is unclear; no repository LICENSE or package license fields were found.
- PUDA worktree is dirty at the pinned commit.
- The committed Vitest config fails under the default runtime with `ERR_REQUIRE_ESM`.
- Aggregate API golden run exposed two current failures before interruption: output template parity and branch-aware assignment alignment.
- HRMS tenant/entity isolation is stronger than PUDA's `authority_id` scoping.

## Ordered Enhancement Backlog

1. P01 facade contract and adapter shell.
2. HRMS hierarchy/statutory ApproverResolver SPI.
3. Generic delegation/acting-charge support inside resolver.
4. GuardProvider SPI for HRMS rules.
5. ActionAdapter split for SR, documents, notifications, payroll, audit.
6. Idempotency-key and workflow_actions/P05 audit mapping.
7. Tenant/entity scoping and config cascade.
8. Golden-suite stabilization on clean PUDA checkout and isolated DB.
9. License/provenance approval for shared package extraction.

Program decision: **Proceed to PH-00B facade design. Do not start HRMS module feature implementation until PH-00B proves G03 leave and G05 transfer/clearance through the facade.**
