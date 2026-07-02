/goal
  objective: Complete PH-05A - create the HRMS web app scaffold and typed PH-04 API client foundation for the core UI.
  context:
    - docs/spec/ph-05-ui-implementation-plan.md
    - docs/spec/phased-plan.yaml
    - docs/spec/ph-04-verdict.md
    - apps/api/src/openapi/contractRegistry.ts
    - apps/api/src/routes/**
    - package.json
  constraints:
    - PH-04D must be approved before this phase runs; do not bypass the API-freeze gate.
    - Do not implement G03/G05 module logic.
    - Do not hardcode localhost URLs in production paths.
    - Do not add TypeScript `any` or `as any`.
    - Do not add production `console.log`.
    - Do not create a landing page; the first screen must be the operational HRMS shell.
  freedom:
    - Choose the minimum React + TypeScript + Vite structure that fits the repo.
    - Use local shadcn-style primitives if dependency installation is not appropriate.
    - Add web scripts to root package.json.
  work_loops:
    - name: Web scaffold
      max_iterations: 4
      repeat_until: apps/web has a buildable React/TypeScript app with route shell placeholder, styles, tsconfig, and build/test scripts.
      steps:
        - inspect root package scripts and TypeScript config
        - create apps/web scaffold
        - wire root web scripts
        - run web typecheck/build
    - name: API client foundation
      max_iterations: 4
      repeat_until: A typed API client references PH-04 route families and supports fixture mode without hardcoded production localhost.
      steps:
        - define route constants from PH-04
        - define client error/correlation/idempotency handling
        - add fixture adapter for PH-05 UI tests
        - add API-client tests
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-05A oracle is GREEN and manifest evidence is recorded.
      steps:
        - run npm run web:check
        - run bash docs/spec/pipeline/checks/ph-05a.sh
        - fix gaps
  evidence_required:
    - apps/web/package.json or root package.json web scripts
    - apps/web/src/api/hrmsClient.ts
    - apps/web/src/api/fixtureHrmsClient.ts
    - apps/web/src/main.tsx
    - apps/web/src/App.tsx
    - apps/web/test/ph05-api-client.test.cjs
    - docs/spec/manifest.json records PH-05A
    - `bash docs/spec/pipeline/checks/ph-05a.sh` GREEN
  escalate_when:
    - PH-04 API surface must change.
    - Frontend dependency installation would introduce an unapproved production dependency.
    - The web scaffold cannot be checked by an executable oracle.
    - A destructive or irreversible change is required.
