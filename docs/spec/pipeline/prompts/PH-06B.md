/goal
  objective: Complete PH-06B - implement and verify the G03 leave backend vertical slice.
  context:
    - docs/spec/vertical-slice-g03-leave.yaml
    - docs/contracts/state-machines.yaml
    - docs/contracts/openapi/G03.yaml
    - apps/api/src/platform/**
    - apps/api/src/modules/g01/**
    - apps/api/src/modules/g12/**
    - apps/api/src/modules/g03/**
    - apps/api/src/routes/**
  constraints:
    - G03 must not become a canonical SR writer; SR posting must be represented as sourceModule G04 through a G04-ready outbox.
    - Approval routing must use P01 REPORTING_CHAIN resolver evidence.
    - Unsafe routes must remain protected and idempotency-key guarded.
  freedom:
    - Add service, routes, route registry wiring, and focused tests.
    - Use in-memory stores consistent with PH-03/PH-04 services.
  evidence_required:
    - apps/api/src/modules/g03/leaveService.ts
    - apps/api/src/routes/g03.routes.ts
    - apps/api/test/ph06-g03-leave.test.cjs
    - `bash docs/spec/pipeline/checks/ph-06b.sh` GREEN
  escalate_when:
    - Leave approval cannot post a G04-attributed SR event through existing G12 conformance.
    - P01 delegate breaks subsequent approval behavior.
