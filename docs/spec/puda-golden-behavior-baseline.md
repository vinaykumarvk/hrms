# PUDA Golden Behavior Baseline (PH-00A)

Pinned PUDA commit: `cadf39739e6f27c17d44767ca61d1a362034ac64`.

Scope: characterize current behavior only. No PUDA code was changed. Tests were run against the existing local checkout; the long API aggregate run was not completed because it was slow, touched the local test DB path, and already exposed failures. This baseline is decision-grade for reuse strategy, not release-grade for extraction.

## Test Harness Finding

The committed API test command does not currently start cleanly under the default Node 22/Vitest path:

```text
npm --workspace apps/api run test -- ... --reporter=verbose
failed to load config from apps/api/vitest.config.ts
Error [ERR_REQUIRE_ESM]: require() of ES Module node_modules/std-env/dist/index.mjs not supported.
```

For characterization only, I used a temporary Vitest config under `/tmp` and Node `v20.11.1`. The workaround was not committed.

## Focused Green Fixtures

### Queue Routing

Command:

```bash
PATH="$HOME/.nvm/versions/node/v20.11.1/bin:$PATH" \
node /Users/n15318/PUDA_workflow_engine/node_modules/vitest/vitest.mjs run \
  src/work-queues.test.ts \
  --root /Users/n15318/PUDA_workflow_engine/apps/api \
  --config /tmp/hrms-empty-vitest.config.mjs \
  --reporter=verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
Covered behavior:
- lane-less queue key with wildcard org unit
- lane-less queue key from authority, level and org unit
- queue-based assignments without a lane
- legacy role-based states
- queue-routed task labels
```

This is the cleanest golden fixture for B4: PUDA routing is queue/role based.

### Officer Workflow UI Behavior

Command:

```bash
PATH="$HOME/.nvm/versions/node/v20.11.1/bin:$PATH" \
node /Users/n15318/PUDA_workflow_engine/node_modules/vitest/vitest.mjs run \
  src/TaskDetail.workflow-engine-behavior.test.ts \
  src/workflow-config/graph/WorkflowSwimlanes.test.ts \
  --root /Users/n15318/PUDA_workflow_engine/apps/officer \
  --config /tmp/hrms-officer-vitest.config.mjs \
  --reporter=verbose
```

Result:

```text
Test Files  2 passed (2)
Tests       22 passed (22)
Covered behavior:
- swimlane grouping by role and queue
- query/document behavior in officer task detail
- query remarks separated from approval comments
- citizen query response document grouping
```

## Aggregate API Corpus Baseline

Command group: the 22 API test files listed in `docs/spec/phased-plan.yaml -> meta.source_artifacts.puda.golden_test_corpus`.

Status before manual interrupt:

```text
Test Files  2 failed | 3 passed (22)
Tests       2 failed | 63 passed (71)
```

Completed green subsets observed in that run:

```text
workflow.engine.integration.test.ts: 27/27 passed
workflow.path-walker.integration.test.ts: 20/20 passed
work-queues.test.ts: 6/6 passed
admin-workflow-config.publish-guard.test.ts: 5/5 passed before interrupt
```

Failures observed:

```text
workflow.output-template-parity.test.ts
  Output template parity failures:
  transfer_of_letter_of_intent/CLOSE_APPROVED missing template file
  transfer_of_letter_of_intent_to_be/templates/loi_transfer_approval.html
  transfer_of_letter_of_intent/CLOSE_REJECTED missing template file
  transfer_of_letter_of_intent_to_be/templates/loi_transfer_rejection.html

workflow-branch-aware-stages.test.ts
  keeps workflow assignments aligned to the LAC department reassignment
  expected 'PUDA__LAC__REVENUE' to be 'PUDA_LAC'
```

## Baseline Interpretation

- Strong evidence for reusable core mechanics: sequential transition execution, path walking, queue routing, fork/join schema, waits, config validation, publish governance, simulation, and officer UI primitives.
- Not green enough for package extraction: test harness startup is fragile, aggregate run has two current failures, and DB isolation needs to be explicit before PH-00B CI gates.
- The failures are PUDA-domain/template/routing-alignment failures, not evidence that the workflow engine should be rebuilt.
