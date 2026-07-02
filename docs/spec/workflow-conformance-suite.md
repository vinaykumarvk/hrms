# Workflow Conformance Suite (PH-00E)

Status: implemented and GREEN for the PH-00 agentic gate.

Target package: `/Users/n15318/workflow-platform`.
Pinned PUDA source: `/Users/n15318/PUDA_workflow_engine` at `cadf39739e6f27c17d44767ca61d1a362034ac64`.

## Scope

PH-00E proves that the extracted platform package can be used through adapters without changing PUDA runtime behavior and without placing HRMS domain rules into `workflow-core`.

It intentionally does not claim the full PUDA aggregate golden corpus is release-grade. PH-00A recorded that the aggregate corpus has local harness and PUDA-domain failures. PH-00E uses the reusable workflow shapes that PH-00A identified as platform mechanics:

- simple approval
- wait/timer state
- fork/join clearance
- department/reference state

## PUDA Adapter Conformance

Implemented package:

- `/Users/n15318/workflow-platform/packages/adapters-puda/src/conformance.ts`
- `/Users/n15318/workflow-platform/packages/adapters-puda/test/conformance.test.ts`

The adapter validates each reusable PUDA shape through `@hrms-workflow/workflow-core`:

- `simple` -> config validation and transition summary
- `wait` -> config validation plus wait snapshot extraction
- `fork_join` -> config validation plus fork/join branch extraction
- `reference` -> config validation and transition summary

Expected result:

```text
simple      PASS
wait        PASS
fork_join   PASS
reference   PASS
```

## HRMS Synthetic Conformance

Implemented package:

- `/Users/n15318/workflow-platform/packages/adapters-hrms/src/synthetic-flow.ts`
- `/Users/n15318/workflow-platform/packages/adapters-hrms/test/synthetic-flow.test.ts`

The synthetic HRMS conformance path runs the platform packages together:

- `workflow-config` publishes a workflow and pins the active version.
- `workflow-postgres` in-memory repository starts instances and records tasks/actions.
- `workflow-resolvers` resolves a queue assignment with immutable evidence.
- `adapters-hrms` stubs audit and notification hooks.

Expected result:

```text
start       PASS
approve     PASS
reject      PASS
sendBack    PASS
audit hook calls: 3
notification hook calls: 3
resolution evidence captured: true
```

## Verification Commands

```bash
cd /Users/n15318/workflow-platform && npm run check
cd /Users/n15318/workflow-platform && npm --workspace @hrms-workflow/adapters-puda run test
cd /Users/n15318/workflow-platform && npm --workspace @hrms-workflow/adapters-hrms run test
bash docs/spec/pipeline/checks/ph-00e.sh
```

Latest local result:

```text
workflow-platform: 8 test files passed, 18 tests passed
adapters-puda: 1 test file passed, 1 test passed
adapters-hrms: 2 test files passed, 2 tests passed
PH-00E gate: GREEN
```

## Boundary Result

The conformance suite supports an internal HRMS build on the extracted platform package. It does not authorize copying or distributing PUDA source code while repository license/provenance remains unclear. Any external productization or direct PUDA code extraction remains a critical human/legal gate.
