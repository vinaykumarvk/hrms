# PH-00D Workflow Platform Governance

Status: implemented for PH-00D, agentic gate enabled before PH-00E.

Target repo: `/Users/n15318/workflow-platform`.

## Package Ownership

| Package | PH-00D responsibility |
|---|---|
| `@hrms-workflow/workflow-core` | Pure workflow primitives from PH-00C. No persistence, no domain side effects. |
| `@hrms-workflow/workflow-postgres` | Tenant-aware persistence contracts for instances, actions, idempotency, tasks, waits, forks, references, and approver-resolution snapshots. |
| `@hrms-workflow/workflow-config` | Workflow configuration lifecycle: draft, validation, review, publish, deprecate, evidence packs, and active-version pinning. |
| `@hrms-workflow/workflow-resolvers` | `ApproverResolver` SPI, initial `WORK_QUEUE` resolver, and HRMS hook port interfaces. |
| `@hrms-workflow/adapters-hrms` | Stub HRMS hooks for employee, position/authority, org-unit, document, notification, audit, and Service Register side effects. |
| `@hrms-workflow/workflow-test-kit` | Synthetic workflow fixtures for simple, wait, fork/join, and reference shapes. |

## Persistence Governance

The reusable persistence boundary is tenant-aware and RLS-compatible:

- Every repository call receives an explicit `TenantScope`.
- Missing tenant scope is rejected.
- In-flight workflow instances pin `workflow_id` and `pinned_version`.
- Unsafe calls use idempotency keys and request hashes.
- Task, wait, fork/join, reference, and resolution-snapshot records are durable.
- Approver resolution snapshots preserve immutable evidence: configured rule, candidates, selected assignees, fallback flag, and route evidence.

PH-00D includes an in-memory contract implementation for deterministic package tests. The live SQL-backed implementation can now be written against the same interfaces without changing module callers.

## Config Governance

The config lifecycle is:

```text
DRAFT -> PENDING_REVIEW -> ACTIVE -> DEPRECATED
```

Activation is immediate for new workflow instances. Existing instances continue on the pinned version they started on. Each published config has an evidence pack with:

- `configHash`
- validation status and issue/warning codes
- reviewer and publisher identity
- superseded version, where applicable

## Resolver And Hook Governance

PH-00D defines the SPI, not the full government hierarchy resolver.

Implemented now:

- `ApproverResolver`
- `WorkQueueApproverResolver`
- employee lookup hook
- position/statutory authority hook
- org-unit hook
- document generation hook
- notification hook
- audit hook
- Service Register outbox hook

Deferred:

- reporting-chain resolver
- statutory authority matrix resolver
- delegation policy resolver
- committee/quorum resolver
- sealed-cover/confidential routing

Those belong to PH-01/PH-02 and should implement the SPI without leaking HRMS domain rules into `workflow-core`.

## Schema Governance

`docs/data-model/00-platform-core.sql` now owns the P01 durable execution tables:

- `workflow_idempotency_records`
- `workflow_resolution_snapshots`
- `workflow_tasks`
- `workflow_waits`
- `workflow_fork_executions`
- `workflow_fork_branches`
- `workflow_references`

All are tenant-scoped and included in the platform RLS tenant-isolation block.

## Verification

Package check:

```bash
cd /Users/n15318/workflow-platform && npm run check
```

Result:

```text
6 test files passed, 16 tests passed
```

Schema load:

```bash
bash docs/spec/pipeline/checks/ph-00d.sh
```

The gate starts a disposable local PostgreSQL instance and loads `docs/data-model/00-platform-core.sql` through `14-G14-dashboard-analytics.sql`.

Result:

```text
full 00->14 schema load passed
```
