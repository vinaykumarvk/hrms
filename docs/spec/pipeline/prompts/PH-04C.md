/goal
  objective: Implement PH-04 G12 Service Register and G13 Document Vault API route groups on top of the PH-04A API
    kernel and PH-03 services.
  context:
    - docs/spec/ph-04-api-contract-implementation-plan.md
    - docs/contracts/openapi/G12.yaml
    - docs/contracts/openapi/G13.yaml
    - docs/contracts/error-taxonomy.yaml
    - apps/api/src/http/**
    - apps/api/src/modules/g12/serviceRegisterService.ts
    - apps/api/src/modules/g13/documentVaultService.ts
    - apps/api/src/platform/foundationServices.ts
  constraints:
    - Implement only G12 and G13 route groups in this subphase.
    - G12 remains append-only; corrections, disputes, and reversals append records or use explicit service APIs.
    - G13 legal-hold/WORM retention must fail closed.
    - Unsafe POSTs require `Idempotency-Key`.
    - Every route is protected by P02 Authorization.check and emits `X-Correlation-Id`.
    - No storage/KMS/AV/eSign production integration in this phase; keep adapter seams.
  freedom:
    - Add route files under `apps/api/src/routes/g12.routes.ts` and `apps/api/src/routes/g13.routes.ts`.
    - Add DTO mappers and route smoke tests.
    - Add explicit "not implemented in PH-04" responses only when they are protected, audited, and covered by tests.
  work_loops:
    - name: G12 route group
      max_iterations: 5
      repeat_until: SR ingest, reversal, ingestion read, employee timeline, event read, corrigendum, dispute, and
        dispute-resolve routes are registered and tested for idempotency, semantic dedup, append-only behavior, and error envelopes.
      steps:
        - implement handlers against ServiceRegisterService
        - add idempotency replay/conflict tests
        - add semantic duplicate and reversal tests
    - name: G13 route group
      max_iterations: 5
      repeat_until: document create/list/detail/attach/version/checkin/supersede, legal hold placement/approval/release,
        retention read/extend routes are registered and tested for legal-hold and attachment behavior.
      steps:
        - implement handlers against DocumentVaultService
        - add document attach and legal-hold tests
        - verify protected route metadata
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-04C oracle is GREEN and no G12/G13 route bypasses the service layer.
      steps:
        - run `bash docs/spec/pipeline/checks/ph-04c.sh`
        - fix gaps
        - update manifest evidence
  evidence_required:
    - apps/api/src/routes/g12.routes.ts
    - apps/api/src/routes/g13.routes.ts
    - apps/api/test/ph04-g12-g13-routes.test.cjs
    - docs/spec/manifest.json records PH-04C
    - `bash docs/spec/pipeline/checks/ph-04c.sh` GREEN
  escalate_when:
    - A G12 route would require updating/deleting SR ledger entries.
    - A G13 route would allow disposal/release despite legal hold or WORM retention.
