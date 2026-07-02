# PH-06 Vertical Slice Implementation Plan

PH-06 proves that the PH-00 through PH-05 platform can drive real HRMS flows before the module waves start. It is split into five pipeline steps so the first four can use agentic gates and the final scale-up decision remains a human gate.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-06A | auto | Freeze vertical-slice plan, G03/G05 slice YAML, OpenAPI markers, pipeline wiring. | `bash docs/spec/pipeline/checks/ph-06a.sh` |
| PH-06B | auto | Implement G03 leave backend: balance reservation/debit, REPORTING_CHAIN workflow, P01 delegate, G04-ready SR outbox, P05/X.2 evidence. | `bash docs/spec/pipeline/checks/ph-06b.sh` |
| PH-06C | auto | Implement G05 transfer backend: POSITION_AUTHORITY workflow, PARALLEL_ALL_OF clearance, deemed clearance, G13 documents, G12 SR posting. | `bash docs/spec/pipeline/checks/ph-06c.sh` |
| PH-06D | auto | Add demo UI surfaces for leave and transfer slices using the PH-05 shell/client pattern. | `bash docs/spec/pipeline/checks/ph-06d.sh` |
| PH-06E | human gate | Run all PH-06 checks and prepare the verdict: continue module-wave build, narrow scope, or repair platform. | `bash docs/spec/pipeline/checks/ph-06e.sh` then approval token |

## Architecture Rules

- G03 is not a canonical Service Register writer. It creates a G04-ready outbox event; the SR append is attributed to source module `G04`.
- G05 is a canonical Service Register writer and posts `TRANSFER_JOINED` through G12 after approval, clearance, relieving, and joining.
- Approval routing comes from P01 resolver rules, not hardcoded assignee IDs:
  - G03 uses `REPORTING_CHAIN`.
  - G05 uses `POSITION_AUTHORITY` with `G05_TRANSFER_REVENUE`.
- Parallel clearance is represented as `WF-G05-CLEARANCE-PARALLEL_ALL_OF`; individual clearance branches must be `CLEARED` or `DEEMED_CLEARED` before joining.
- Every unsafe API route remains protected, requires `Idempotency-Key`, and is dispatched through `Authorization.check`.

## Evidence Required

- `apps/api/test/ph06-g03-leave.test.cjs`
- `apps/api/test/ph06-g05-transfer.test.cjs`
- `apps/api/test/ph06-vertical-slice-conformance.test.cjs`
- `apps/web/test/ph06-vertical-slices.test.cjs`
- `docs/spec/vertical-slice-g03-leave.yaml`
- `docs/spec/vertical-slice-g05-transfer.yaml`
- `docs/spec/ph-06-verdict.md`

## Human Gate

PH-06E is a human gate because the phase exit criterion includes the architecture decision to scale module build. The expected review question is: "Did the platform proof show enough P01/P02/P05/G01/G12/G13/X.1/X.2 integration to proceed to PH-07 through PH-10 module waves?"
