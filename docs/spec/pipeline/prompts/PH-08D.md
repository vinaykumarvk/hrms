/goal
  objective: Complete PH-08D - implement G07 training/certification and G08 APAR.
  context:
    - apps/api/src/modules/g07/**
    - apps/api/src/modules/g08/**
    - apps/api/src/routes/g07.routes.ts
    - apps/api/src/routes/g08.routes.ts
    - docs/contracts/openapi/G07.yaml
    - docs/contracts/openapi/G08.yaml
  constraints:
    - G07 SR posting is optional and only for significant certifications.
    - G08 sealed-cover forms must suppress G06 feed until release.
    - APAR final grade posts only via G12.
  freedom:
    - Add services, routes, tests, foundation wiring, and route/security registry entries.
  evidence_required:
    - apps/api/test/ph08-g07-g08-training-apar.test.cjs
    - `bash docs/spec/pipeline/checks/ph-08d.sh` GREEN
  escalate_when:
    - Sealed-cover suppression cannot be proved by test.
