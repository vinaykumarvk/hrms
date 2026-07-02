# P01 Workflow Platform Tests (PH-01)

Status: implemented for contract-freeze gate.

## Current Executable Checks

```bash
cd /Users/n15318/workflow-platform && npm run check
```

Expected current result:

```text
8 test files passed, 18 tests passed
```

```bash
bash docs/spec/pipeline/checks/ph-00e.sh
```

Expected current result:

```text
PH-00E gate GREEN
```

```bash
bash docs/spec/pipeline/checks/ph-01.sh
```

Expected result:

```text
PH-01 gate GREEN
```

Latest local result:

```text
PH-01 gate GREEN; YAML/OpenAPI/schema checks passed, PH-00D schema-load regression passed, PH-00B facade regression passed.
```

## Contract Assertions

PH-01 freezes the following test obligations:

| Area | Assertion |
|---|---|
| Schema load | `docs/data-model/00-platform-core.sql` through `14-G14-dashboard-analytics.sql` loads into disposable PostgreSQL. |
| Runtime tables | `workflow_idempotency_records`, `workflow_resolution_snapshots`, `workflow_tasks`, `workflow_waits`, `workflow_fork_executions`, `workflow_fork_branches`, and `workflow_references` exist and are tenant-scoped. |
| P01 OpenAPI | `/api/v1/workflows` contract parses as OpenAPI 3.x and all internal refs resolve. |
| Task/action separation | `workflow_tasks` is P01-owned actionable work-item state; `workflow_actions` is immutable decision history. |
| Resolver replay | Resolver snapshots store enough evidence to explain historical decisions without re-reading today's hierarchy. |
| Domain isolation | Reusable packages and HRMS adapter do not import PUDA/LAC/LoI domain code. |

## PH-02 Test Backlog

PH-02 must turn the authority-resolution contract into data-backed tests:

- reporting-chain L1/L2/skip-level resolution;
- statutory authority resolution by cadre/org/as-of date;
- vacant-manager fallback;
- delegation and acting-charge precedence;
- self-approval and recusal denial;
- ambiguity fail-closed;
- historical replay after hierarchy correction.
