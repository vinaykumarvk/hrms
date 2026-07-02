# PH-07 Employee Transaction Wave Plan

PH-07 builds the employee-facing transaction base after PH-06 proved the workflow platform with G03 and G05 vertical slices.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-07A | auto | Freeze PH-07 detailed plan, pipeline prompts/checks, and OpenAPI binding markers for G02/G03/G04. | `bash docs/spec/pipeline/checks/ph-07a.sh` |
| PH-07B | auto | Build G04 as the leave-to-Service-Register relay with idempotent relay, reconciliation, DLQ replay/discard, and audit evidence. | `bash docs/spec/pipeline/checks/ph-07b.sh` |
| PH-07C | auto | Build G02 personal details workflow with sensitivity routing, evidence documents, approve/commit/reverse, and G01-owned SR posting. | `bash docs/spec/pipeline/checks/ph-07c.sh` |
| PH-07D | auto | Extend G03 with accrual, cancellation, attendance capture, regularisation recompute, overtime, anomaly state, and `READY_FOR_G10` payroll signals. | `bash docs/spec/pipeline/checks/ph-07d.sh` |
| PH-07E | auto | Add UI proof, conformance verdict, manifest evidence, full API/web regression. | `bash docs/spec/pipeline/checks/ph-07e.sh` |

## Scope Rules

- G02 must not write identity SR events directly. It commits and reverses display-name changes through G01-owned `governedIdentityChange`, so the SR source module remains `G01`.
- G04 is the reference writer for leave-to-SR integration. G03 creates leave facts; G04 relays them to G12 with idempotency and DLQ handling.
- G03 payroll outputs are contract-ready signals only. G10 remains the payroll computation owner.
- The PH-07 implementation remains in-memory, consistent with PH-03 through PH-06, until persistence hardening is scheduled.

## Evidence

- `apps/api/test/ph07-g02-personal-details.test.cjs`
- `apps/api/test/ph07-g03-attendance-payroll.test.cjs`
- `apps/api/test/ph07-g04-relay.test.cjs`
- `apps/web/test/ph07-employee-wave.test.cjs`
- `docs/spec/ph-07-verdict.md`
