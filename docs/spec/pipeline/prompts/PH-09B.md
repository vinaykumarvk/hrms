/goal
  objective: Complete PH-09B - implement deterministic G10 payroll and benefits foundation.
  context:
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - docs/contracts/openapi/G10.yaml
    - docs/contracts/state-machines.yaml
    - apps/api/src/modules/g10/**
  constraints:
    - Use fixed-point integer money calculations only.
    - No live bank integration; use X.3 sandbox export marker only.
    - No payroll calculation without provenance and rule-version snapshots.
  freedom:
    - Add G10 service, route, wiring, and focused tests using existing in-memory foundation service patterns.
  evidence_required:
    - apps/api/src/modules/g10/payrollService.ts
    - apps/api/src/routes/g10.routes.ts
    - apps/api/test/ph09-g10-payroll.test.cjs
    - `bash docs/spec/pipeline/checks/ph-09b.sh` GREEN
  escalate_when:
    - Payroll formula requirements conflict with the current OpenAPI/state-machine contract.
