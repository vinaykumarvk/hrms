/goal
  objective: Complete PH-07D - extend G03 attendance, leave, and payroll signal behavior.
  context:
    - docs/contracts/openapi/G03.yaml
    - apps/api/src/modules/g03/**
    - apps/api/src/routes/g03.routes.ts
    - apps/api/src/jobs/**
  constraints:
    - Payroll computation remains G10 scope; G03 only emits stable input signals.
    - Leave-to-SR posting must continue through G04.
    - Attendance regularisation must create recompute job evidence.
  freedom:
    - Add accrual, cancellation, attendance capture, regularisation, overtime, payroll signal APIs and tests.
  evidence_required:
    - apps/api/test/ph07-g03-attendance-payroll.test.cjs
    - `bash docs/spec/pipeline/checks/ph-07d.sh` GREEN
  escalate_when:
    - G03 needs payroll computation logic rather than input signals.
