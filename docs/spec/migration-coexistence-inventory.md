# Migration And Coexistence Inventory (PH-00E)

Status: implemented for PH-00 gate decision.

## Current Runtime Split

| Area | Current owner | PH-00 coexistence decision |
|---|---|---|
| Existing PUDA workflows | `/Users/n15318/PUDA_workflow_engine` | Remain on original PUDA runtime. No behavior change in PH-00. |
| PUDA facade proof | `apps/api/src/p01-workflow-facade.ts` | Additive boundary only; delegates to PUDA-like ports. |
| Reusable workflow mechanics | `/Users/n15318/workflow-platform/packages/workflow-core` | Clean platform subset with no DB, PUDA domain code, or HRMS rules. |
| Persistence/config/resolver SPI | `workflow-postgres`, `workflow-config`, `workflow-resolvers` | Reusable platform contracts and in-memory conformance implementation. |
| HRMS side effects | `packages/adapters-hrms` | Hook stubs only until PH-01/PH-03 wire real HRMS services. |
| PUDA shape parity | `packages/adapters-puda` | Adapter conformance against four reusable shapes; not a direct copy of PUDA runtime. |

## Historical Workflow Cases

PH-00 does not migrate historical PUDA workflow instances. Existing cases remain in the PUDA application tables and continue to be served by the original runtime.

Before any future migration, the implementation must inventory:

- in-flight workflow instance identifiers and current state
- current task assignees/queues
- wait/timer rows
- fork/join branch completion rows
- document/reference rows
- audit/action history
- idempotency or duplicate action evidence
- source tenant/authority scope and target HRMS tenant/entity scope

## Pending Case Strategy

For PH-01 through PH-06, the safe coexistence model is:

- PUDA pending cases stay in PUDA.
- New HRMS workflow cases use P01 platform contracts and HRMS adapters.
- No live case moves between runtimes without a dedicated migration phase and reconciliation report.
- The facade remains the compatibility boundary for PUDA behavior; HRMS modules must not import PUDA/LAC/LoI domain code.

## Critical Holds

The agentic gate can advance internal HRMS development only under these restrictions:

- no external distribution/productization of PUDA-derived code until provenance/legal ownership is cleared;
- no destructive migration of PUDA or HRMS workflow data without human approval;
- no auth/RBAC/RLS weakening while adding P01 platform tables or adapters;
- no conversion of historical PUDA cases until a separate migration plan is approved.

## PH-00 To PH-01 Handoff

PH-01 may proceed with platform hardening and P01 contract freeze. It must keep hierarchy/statutory authority routing behind the `ApproverResolver` SPI and must not start broad HRMS module coding before the later G03/G05 vertical-slice gate.
