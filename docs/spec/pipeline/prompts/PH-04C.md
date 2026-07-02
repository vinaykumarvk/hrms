/goal
  objective: Rebuild the G12 SERVICE REGISTER and G13 DOCUMENT route groups as real behaviour. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found the G12 timeline returns every event with
    next_cursor:null hardcoded, reversal ignores the BRD is_reversal envelope, and G13 lacks the
    :fetch?intent=VIEW|DOWNLOAD contract (FR-G13-016) and DI-14 attach-target validation. Close exactly
    those gaps; the re-baselined oracle asserts them and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - docs/brd/v3/G12-digital-service-register.md      # is_reversal, reverses_source_reference_id, SR_* codes
    - docs/brd/v3/G13-document-management-secure-storage.md   # FR-G13-016 fetch contract, DI-14, ERR-G13-* codes
    - docs/contracts/openapi/G12.yaml , docs/contracts/openapi/G13.yaml , docs/contracts/error-taxonomy.yaml
    - apps/api/src/routes/g12.routes.ts , apps/api/src/routes/g13.routes.ts
    - apps/api/src/modules/g12/serviceRegisterService.ts , apps/api/src/modules/g13/documentVaultService.ts
    - apps/api/test/ph04-g12-g13-routes.test.cjs
    - docs/spec/pipeline/checks/ph-04c.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - g12.routes.ts:83 — GET /api/v1/sr/employees/{id}/timeline calls getTimeline() then returns ALL items
      with `next_cursor: null` hardcoded. It must page through the kernel cursor helper (limit clamp 100,
      computed next_cursor, stable ordering by sequence).
    - POST /api/v1/sr/ingest/reversal does not consume the BRD reversal envelope. It must accept
      `is_reversal` + `reverses_source_reference_id`, locate the reversed event, and emit
      SR_REVERSAL_TARGET_NOT_FOUND when the referenced source_reference_id is unknown.
    - G13 has no fetch route. Implement GET /api/v1/documents/{id}:fetch with a REQUIRED intent=VIEW|DOWNLOAD
      query (FR-G13-016 R2): missing/invalid intent -> ERR-G13-FETCH_INTENT_REQUIRED (VALIDATION_FAILED);
      VIEW returns a short-TTL audited render descriptor (no raw blob), DOWNLOAD returns the file grant only
      with the DOWNLOAD right; the two response shapes must differ structurally.
    - documents:attach validates existence only. DI-14: a DELETED, DISPOSED, or ORPHANED document must be
      rejected with ERR-G13-DOCUMENT_NOT_ATTACHABLE (CONFLICT) before any link is written.
  constraints:
    - Emit only registered codes: canonical kernel codes plus the SR_* / ERR-G13-* entries in
      docs/contracts/error-taxonomy.yaml (SR_REVERSAL_TARGET_NOT_FOUND, SR_ENTRY_IMMUTABLE,
      ERR-G13-FETCH_INTENT_REQUIRED, ERR-G13-DOCUMENT_NOT_ATTACHABLE, ERR-G13-DOCUMENT_DISPOSED).
      Request a taxonomy amendment rather than inventing codes.
    - The SR ledger stays append-only: reversal appends a linked reversal event; never mutate or delete
      prior events. Preserve existing hash-chain and idempotency/dedup behaviour (srSemanticDedup tests
      must stay green).
    - Unsafe routes protected + permission + Idempotency-Key via the PH-04A replay store. Sanitized
      envelope only; no production console.log; parameterised queries only; secrets via env.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: g12/g13 routes+modules and their tests. G01/P01 fixes are PH-04B; kernel changes are PH-04A.
  work_loops:
    - name: G12 timeline paging + reversal envelope
      max_iterations: 5
      repeat_until: the timeline route pages via the cursor helper with computed next_cursor (no
        `next_cursor: null` literal in g12.routes.ts) and a follow-up call with the returned cursor yields
        the next window; reversal consumes is_reversal + reverses_source_reference_id and unknown targets
        raise SR_REVERSAL_TARGET_NOT_FOUND.
      steps: [wire pageItems into timeline, thread cursor through getTimeline, extend reversal payload
        parsing + target lookup, emit taxonomy codes]
    - name: G13 fetch intent + DI-14 attach guard
      max_iterations: 5
      repeat_until: GET /api/v1/documents/{id}:fetch exists; missing intent raises
        ERR-G13-FETCH_INTENT_REQUIRED; VIEW and DOWNLOAD return structurally different bodies; attach
        rejects DELETED/DISPOSED/ORPHANED targets with ERR-G13-DOCUMENT_NOT_ATTACHABLE.
      steps: [add fetch route + intent validation, implement view-descriptor vs download-grant responses,
        add status guard inside documentVaultService.attach]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph04-g12-g13-routes.test.cjs exercises two-page timeline paging, is_reversal success
        and unknown-target failure, intent=VIEW vs DOWNLOAD vs missing, and DI-14 rejection;
        `npm run -s typecheck` and `npm test` pass; `bash docs/spec/pipeline/checks/ph-04c.sh` prints GREEN.
      steps: [write behaviour tests, npm run -s typecheck, npm test, run the oracle, fix and repeat]
  evidence_required:
    - apps/api/src/routes/g12.routes.ts , apps/api/src/routes/g13.routes.ts , modules/g12+g13 diffs
    - apps/api/test/ph04-g12-g13-routes.test.cjs with a passing `npm test` run
    - GREEN output of `bash docs/spec/pipeline/checks/ph-04c.sh` captured in the phase log
  escalate_when:
    - The reversal contract in G12.yaml conflicts with the BRD envelope fields (needs contract amendment,
      not a silent choice).
    - The VIEW render path genuinely requires the deferred KMS/watermark engines — deliver the audited
      descriptor contract and record the caveat instead of stubbing a raw blob.
    - A needed SR_*/ERR-G13-* code is missing from the taxonomy — request amendment, never invent.
