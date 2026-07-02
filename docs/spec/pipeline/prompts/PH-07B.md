/goal
  objective: Complete PH-07B - implement G04 leave-to-Service-Register relay.
  context:
    - docs/spec/ph-07-employee-transaction-wave-plan.md
    - docs/contracts/openapi/G04.yaml
    - apps/api/src/modules/g04/**
    - apps/api/src/routes/g04.routes.ts
    - apps/api/src/modules/g03/**
    - apps/api/src/modules/g12/**
  constraints:
    - G04 must be the leave-to-SR reference relay.
    - Relay must be idempotent and DLQ replay/discard must be explicit.
    - G12 append-only invariants must remain unchanged.
  freedom:
    - Add G04 service, routes, tests, and G03 relay integration.
  evidence_required:
    - apps/api/src/modules/g04/leaveSrRelayService.ts
    - apps/api/src/routes/g04.routes.ts
    - apps/api/test/ph07-g04-relay.test.cjs
    - `bash docs/spec/pipeline/checks/ph-07b.sh` GREEN
  escalate_when:
    - Relay requires direct mutation of G12 outside the ingest port.
