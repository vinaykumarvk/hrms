# PH-00C Workflow Platform Extraction

Status: minimum pure-core extraction complete, pending human gate before PH-00D.

Pinned PUDA commit: `cadf39739e6f27c17d44767ca61d1a362034ac64`.

Target repo: `/Users/n15318/workflow-platform`.

## Extracted Packages

| Package | Purpose |
|---|---|
| `@hrms-workflow/workflow-core` | Pure workflow primitives: assignment target resolution, guard/condition evaluation, action normalization, wait config resolution, fork/join config resolution, and workflow config validation. |
| `@hrms-workflow/workflow-test-kit` | Synthetic simple, wait, fork/join, and reference workflow fixtures used by conformance tests. |

## Provenance Map

| Extracted file | Source lineage | Extraction decision |
|---|---|---|
| `packages/workflow-core/src/assignments.ts` | `/Users/n15318/PUDA_workflow_engine/apps/api/src/work-queues.ts:1-72` at `cadf39739e6f27c17d44767ca61d1a362034ac64` | Lifted as pure queue/assignment behavior; renamed `authorityId` to neutral `scopeId`. |
| `packages/workflow-core/src/conditions.ts` | `/Users/n15318/PUDA_workflow_engine/apps/api/src/workflow.ts:258-314` | Lifted generic condition evaluation only. |
| `packages/workflow-core/src/actions.ts` | `/Users/n15318/PUDA_workflow_engine/apps/api/src/workflow.ts:316-533` | Lifted manual-action normalization and action visibility; domain action side effects stay in adapters. |
| `packages/workflow-core/src/pattern-config.ts` | `/Users/n15318/PUDA_workflow_engine/apps/api/src/workflow.ts:534-759` | Lifted wait, fork, and join config resolution; DB-backed wait persistence stays in PUDA/adapter. |
| `packages/workflow-core/src/config-validation.ts` | `/Users/n15318/PUDA_workflow_engine/apps/api/src/workflow-config-validation.ts:1-772` | Lifted generic validation subset: states, transitions, assignment, wait, fork, join, SLA, references. Document registry and PUDA-specific warnings stayed out. |
| `packages/workflow-test-kit/src/fixtures.ts` | New PH-00C synthetic fixtures | Covers the four PH-00B facade shapes without PUDA data or DB coupling. |

## Explicitly Not Extracted

- Database access, transactions, tasks persistence, wait rows, fork branch rows, and audit inserts.
- PUDA route normalization tables and office/queue constants.
- LAC, LOI, payment, public-notice, document-generation, and notification side effects.
- Full hierarchy/statutory authority resolution; this remains PH-01/PH-02 through the `approverResolver` SPI.
- PUDA application ARN semantics and service-pack/version publication workflow.

## Conformance Evidence

Workflow-platform check:

```bash
cd /Users/n15318/workflow-platform && npm run check
```

Result:

```text
workflow-core typecheck passed
workflow-core build passed
workflow-test-kit typecheck passed
workflow-test-kit build passed
2 test files passed, 7 tests passed
```

PUDA facade conformance:

```bash
bash docs/spec/pipeline/checks/ph-00b-conformance.sh
```

Result:

```text
2 test files passed, 14 tests passed
```

The PUDA conformance test now imports the extracted `workflow-core` and `workflow-test-kit` source for the simple, wait, fork/join, and reference shapes before exercising the PH-00B facade delegation ports.

## Domain-Leakage Result

The PH-00C gate scans `workflow-core` and `workflow-test-kit` source/test files for blocked PUDA/domain terms including `PUDA`, `LAC`, `LOI`, `payment`, `authority_id`, and `allottee`.

Result: clean.

## Caveats

- PH-00C is a minimum extraction, not the final engine split. Runtime DB-backed workflow execution still lives in PUDA.
- The PH-00B facade runtime remains pass-through. PH-00C consumes the extracted core in conformance fixtures and tests; production dependency wiring is deferred to PH-00D.
- The broader PUDA aggregate golden corpus remains a PH-00A caveat.
