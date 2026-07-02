/goal
  objective: Complete PH-07C - implement G02 personal details workflow.
  context:
    - docs/contracts/openapi/G02.yaml
    - apps/api/src/modules/g02/**
    - apps/api/src/routes/g02.routes.ts
    - apps/api/src/modules/g01/**
    - apps/api/src/modules/g13/**
  constraints:
    - G02 must not directly write identity SR events.
    - Commit and reversal must use G01-owned governed change behavior.
    - Evidence documents must go through G13.
  freedom:
    - Add G02 service, routes, and tests.
  evidence_required:
    - apps/api/src/modules/g02/personalDetailsService.ts
    - apps/api/src/routes/g02.routes.ts
    - apps/api/test/ph07-g02-personal-details.test.cjs
    - `bash docs/spec/pipeline/checks/ph-07c.sh` GREEN
  escalate_when:
    - Required G01 commit behavior is missing or would require G02 to become an SR writer.
