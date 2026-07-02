/goal
  objective: Complete PH-08E - implement G09 disciplinary case and punishment lifecycle.
  context:
    - apps/api/src/modules/g09/**
    - apps/api/src/routes/g09.routes.ts
    - docs/contracts/openapi/G09.yaml
    - docs/contracts/state-machines.yaml
  constraints:
    - Enforce competent disciplinary/appellate authority and no self-approval.
    - Keep charge, inquiry, penalty, appeal, and sealed/confidential routing auditable.
    - Post penalty and appeal SR effects only through G12.
  freedom:
    - Add G09 service, routes, tests, foundation wiring, security registry, and contract registry entries.
  evidence_required:
    - apps/api/test/ph08-g09-disciplinary.test.cjs
    - `bash docs/spec/pipeline/checks/ph-08e.sh` GREEN
  escalate_when:
    - Disciplinary authority competence remains ambiguous.
