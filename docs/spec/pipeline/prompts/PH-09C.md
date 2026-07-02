/goal
  objective: Complete PH-09C - implement deterministic G11 retirement and pension foundation.
  context:
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - docs/contracts/openapi/G11.yaml
    - docs/contracts/state-machines.yaml
    - apps/api/src/modules/g11/**
  constraints:
    - Do not issue PPOs without locked service verification.
    - G11 must write separation and PPO events through G12 only.
    - Use G10 last-pay-drawn as the pension input; do not duplicate payroll facts.
  freedom:
    - Add G11 service, route, wiring, and focused tests using existing Service Register and Document Vault patterns.
  evidence_required:
    - apps/api/src/modules/g11/pensionService.ts
    - apps/api/src/routes/g11.routes.ts
    - apps/api/test/ph09-g11-pension.test.cjs
    - `bash docs/spec/pipeline/checks/ph-09c.sh` GREEN
  escalate_when:
    - Pension cannot be made deterministic from available G10/G12 inputs.
