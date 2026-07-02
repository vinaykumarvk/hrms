# PH-07 Verdict - Employee Transaction Wave

## Gate Decision

PH-07 is GREEN for agentic progression to PH-08.

The employee transaction wave now has executable coverage for G02 personal details, G03 attendance/leave/payroll-input signals, and G04 leave-to-Service-Register relay. The implementation keeps the PH-06 architecture rule intact: employee-facing modules may originate facts and workflow decisions, but Service Register ownership remains explicit and bounded.

## Scope Delivered

### G02 Personal Details

G02 implements a governed personal-details change workflow for employee-originated corrections. It supports request creation, sensitivity-based routing, evidence attachment through G13, approval, rejection, commit, and reversal. The important ownership decision is that G02 does not become the system of record for identity or directly post identity SR events. Display-name changes are committed through the G01 governed identity-change boundary, and the SR source remains `G01`.

This preserves the golden-record rule needed for government HRMS: self-service can initiate changes, but the employee master remains the authoritative owner.

### G03 Attendance, Leave, and Payroll Signals

G03 now covers the employee attendance and leave transaction base beyond the PH-06 proof slice. It includes leave accrual, balance reservation/debit, cancellation credit, attendance capture, anomaly detection, regularisation, overtime recording, and recompute job evidence.

G03 also emits `READY_FOR_G10` payroll-input signals. This is intentionally not payroll computation. PH-07 produces stable, auditable inputs that G10 can later consume, while preserving the boundary that G10 owns money calculation, deductions, arrears, bank file generation, and payroll approval.

### G04 Leave-to-SR Relay

G04 is now the reference integration owner for leave-to-SR posting. G03 emits leave facts; G04 owns relay, idempotency, reconciliation, failure handling, DLQ replay/discard, audit, and the final G12 ingest call.

The DLQ behavior is important for operational trust. Failed SR relay records are not silently lost, and replay/discard decisions are visible through API and tests.

## SR Conformance

PH-07 maintains SR conformance in three ways:

1. G02 identity commits route through G01, so identity-related SR entries remain owned by the employee master.
2. G03 leave approval/cancellation uses G04 relay instead of writing directly to G12.
3. G04 appends leave SR records to G12 with idempotency and reconciliation evidence.

The resulting source-module ownership is:

| Fact | Originating module | SR writer / owner |
|---|---|---|
| Personal-detail identity change | G02 workflow | G01 |
| Leave approval | G03 leave transaction | G04 |
| Leave cancellation | G03 leave transaction | G04 |
| Payroll-ready attendance/leave signal | G03 | Not posted to SR in PH-07; consumed later by G10 |

## Evidence

Primary implementation evidence:

- `apps/api/src/modules/g02/personalDetailsService.ts`
- `apps/api/src/modules/g03/leaveService.ts`
- `apps/api/src/modules/g04/leaveSrRelayService.ts`
- `apps/api/src/routes/g02.routes.ts`
- `apps/api/src/routes/g03.routes.ts`
- `apps/api/src/routes/g04.routes.ts`
- `apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx`
- `apps/web/src/modules/g03/LeaveWorkspace.tsx`
- `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx`

Primary test evidence:

- `apps/api/test/ph07-g02-personal-details.test.cjs`
- `apps/api/test/ph07-g03-attendance-payroll.test.cjs`
- `apps/api/test/ph07-g04-relay.test.cjs`
- `apps/web/test/ph07-employee-wave.test.cjs`

Gate evidence:

- `bash docs/spec/pipeline/checks/ph-07a.sh`
- `bash docs/spec/pipeline/checks/ph-07b.sh`
- `bash docs/spec/pipeline/checks/ph-07c.sh`
- `bash docs/spec/pipeline/checks/ph-07d.sh`
- `bash docs/spec/pipeline/checks/ph-07e.sh`
- `npm run check`
- `npm run web:check`

## Residual Caveats

- Stores remain in-memory, consistent with the prior PH-03 through PH-06 foundation. Persistence hardening is still a later phase concern.
- G03 emits `READY_FOR_G10` payroll signals only; G10 payroll computation is not implemented in PH-07.
- UI panels are proof surfaces backed by the HRMS fixture client. Backend API and service behavior are covered by executable tests.
- G04 relay proves DLQ, replay, discard, and reconciliation semantics in the current in-memory model. Operational retry scheduling and persistent outbox locking remain future hardening items.

## Recommendation

Proceed to PH-08. The PH-07 employee transaction wave is sufficiently implemented and tested to support the next statutory-administration module wave without reopening PH-06 architectural decisions.
