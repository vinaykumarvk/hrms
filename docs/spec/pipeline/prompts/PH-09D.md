/goal
  objective: Complete PH-09D - prove G10/G11 integration, SoD, provenance, and upstream-impact controls.
  context:
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - apps/api/src/modules/g10/payrollService.ts
    - apps/api/src/modules/g11/pensionService.ts
    - apps/api/test/ph09-compensation-integration.test.cjs
  constraints:
    - Do not bypass maker-checker controls in tests.
    - Do not weaken provenance gates to make integration tests pass.
    - No live financial endpoints.
  freedom:
    - Add cross-module tests and small service hooks needed for deterministic integration evidence.
  evidence_required:
    - apps/api/test/ph09-compensation-integration.test.cjs
    - `bash docs/spec/pipeline/checks/ph-09d.sh` GREEN
  escalate_when:
    - SoD or provenance gates block valid use cases without a documented exception path.
