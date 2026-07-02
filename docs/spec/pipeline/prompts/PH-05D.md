/goal
  objective: Complete PH-05D - implement G01 employee, G12 Service Register, and G13 document foundation views in the HRMS UI.
  context:
    - docs/spec/ph-05-ui-implementation-plan.md
    - docs/contracts/openapi/G01.yaml
    - docs/contracts/openapi/G12.yaml
    - docs/contracts/openapi/G13.yaml
    - apps/api/src/routes/g01.routes.ts
    - apps/api/src/routes/g12.routes.ts
    - apps/api/src/routes/g13.routes.ts
    - apps/web/src/**
  constraints:
    - Read views only; do not implement module-specific transaction flows beyond document attachment UI states.
    - PII masking must be explicit in the UI.
    - SR timeline must preserve append-only semantics; do not present edit/delete affordances.
    - Legal hold and WORM/retention states must fail closed in the UI.
    - Do not use `any`, `as any`, production `console.log`, or hardcoded localhost URLs.
  freedom:
    - Use fixture-backed API client data that mirrors PH-04 responses.
    - Add focused tests for records views.
  work_loops:
    - name: Employee and SR views
      max_iterations: 4
      repeat_until: G01 employee profile and G12 SR timeline views render masked PII, status, sequence, hash, and provenance states.
      steps:
        - build employee list/detail/profile components
        - build SR timeline component
        - add tests for PII masking and append-only cues
    - name: Document views
      max_iterations: 4
      repeat_until: G13 document attachment, versions, legal-hold, and retention states are present and tested.
      steps:
        - build document list/detail components
        - build attachment and legal-hold panels
        - add tests for fail-closed retention states
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-05D oracle is GREEN and manifest evidence is recorded.
      steps:
        - run npm run web:check
        - run bash docs/spec/pipeline/checks/ph-05d.sh
        - fix gaps
  evidence_required:
    - apps/web/src/modules/g01/EmployeeProfile.tsx
    - apps/web/src/modules/g12/ServiceRegisterTimeline.tsx
    - apps/web/src/modules/g13/DocumentVaultView.tsx
    - apps/web/test/ph05-records.test.cjs
    - docs/spec/manifest.json records PH-05D
    - `bash docs/spec/pipeline/checks/ph-05d.sh` GREEN
  escalate_when:
    - UI needs an API surface not present in PH-04.
    - PII masking semantics are ambiguous.
    - SR edit/delete behavior is requested.
