/goal
  objective: Complete PH-08B - extend G05 to full statutory transfer administration scope.
  context:
    - apps/api/src/modules/g05/transferService.ts
    - apps/api/src/routes/g05.routes.ts
    - docs/contracts/openapi/G05.yaml
    - docs/contracts/state-machines.yaml
  constraints:
    - Preserve existing PH-06 transfer order, clearance, and joining behavior.
    - Post transfer statutory facts only via G12.
    - Do not edit SR ledger rows directly.
  freedom:
    - Add representation, retention, cancellation, deemed relief, documents, audit, notifications, routes, and focused tests.
  evidence_required:
    - apps/api/test/ph08-g05-transfer-full.test.cjs
    - `bash docs/spec/pipeline/checks/ph-08b.sh` GREEN
  escalate_when:
    - Existing PH-06 G05 tests regress.
