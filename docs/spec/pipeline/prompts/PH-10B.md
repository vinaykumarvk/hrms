/goal
  objective: Complete PH-10B - implement read-only G14 analytics marts and dashboard APIs.
  context:
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - docs/contracts/openapi/G14.yaml
    - apps/api/src/modules/g14/**
    - apps/api/src/routes/g14.routes.ts
  constraints:
    - G14 must be read-only and must not mutate source modules.
    - Analytics responses must use P02/RLS scope and suppress PII.
    - Every analytics read must be audited.
  freedom:
    - Add G14 service, routes, wiring, and focused tests using existing in-memory service patterns.
  evidence_required:
    - apps/api/src/modules/g14/analyticsService.ts
    - apps/api/src/routes/g14.routes.ts
    - apps/api/test/ph10-g14-analytics.test.cjs
    - `bash docs/spec/pipeline/checks/ph-10b.sh` GREEN
  escalate_when:
    - G14 cannot satisfy read-only analytics without changing source-module contracts.
