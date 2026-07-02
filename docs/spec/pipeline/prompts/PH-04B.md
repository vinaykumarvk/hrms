/goal
  objective: Rebuild the P01 WORKFLOW and G01 EMPLOYEE route groups as real behaviour. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found G01 has only reads (no CREATE — FR-EPM-001),
    governed-change :approve/:reject are echo stubs, the /changes feed is hardcoded to [], and workflow
    lacks task-level claim/approve/reject/delegate routes. Close exactly those gaps; the re-baselined
    oracle asserts them and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - docs/brd/v3/G01-employee-profile-management.md   # FR-EPM-001 ACs, outbox_events, ERR-G01-* codes
    - docs/contracts/openapi/G01.yaml , docs/contracts/openapi/P01-workflow.yaml , docs/contracts/error-taxonomy.yaml
    - apps/api/src/routes/g01.routes.ts , apps/api/src/routes/p01-workflow.routes.ts
    - apps/api/src/modules/g01/** , apps/api/src/platform/workflow/**
    - apps/api/test/ph04-p01-g01-routes.test.cjs
    - docs/spec/pipeline/checks/ph-04b.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - No POST /api/v1/employees. FR-EPM-001 requires create with mandatory-field validation, service_no
      generation, employment_status=ACTIVE, and a PROFILE_CREATED event written to the outbox in the same
      unit of work.
    - g01.routes.ts:95/:105 — :approve/:reject handlers echo `decision: "APPROVED"|"REJECTED"` without
      touching any service. Approve must commit the governed change (state transition PENDING->APPROVED,
      apply the field change, post the SR event to G12); reject must transition to REJECTED with reason.
    - g01.routes.ts:25/:65 — /api/v1/employees/changes and {id}/governed-changes return `items: []`
      hardcoded. The changes feed must read a real outbox (PROFILE_CREATED and governed-change events),
      paginated by the kernel cursor helper.
    - p01-workflow.routes.ts acts only on instances. Add task routes under /api/v1/workflow/tasks/{task_id}
      for claim, approve, reject, delegate, delegating to the workflow service (real state mutations).
  constraints:
    - Emit only registered error codes: canonical kernel codes plus ERR-G01-* from
      docs/contracts/error-taxonomy.yaml (e.g. ERR-G01-STALE for row_version conflicts, ERR-G01-GOVLOCK
      for raw writes to governed fields, ERR-G01-INVARIANT). Request a taxonomy amendment rather than
      inventing codes.
    - All unsafe routes are protected, carry a permission, and use requiresIdempotencyKey with the PH-04A
      replay store. Multi-step writes (create + outbox row, approve + SR post) share one transaction
      boundary / unit of work.
    - Sanitized envelope only — no stack traces or internal paths; no production console.log;
      parameterised queries only; secrets via env.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: g01 routes+module, p01 workflow routes (+minimal workflow service additions for
      task actions), tests. G12/G13 route work is PH-04C.
  work_loops:
    - name: G01 employee create + outbox feed
      max_iterations: 6
      repeat_until: POST /api/v1/employees validates FR-EPM-001 mandatory fields, generates service_no,
        writes PROFILE_CREATED to an outbox consumed by GET /api/v1/employees/changes (cursor-paginated,
        no `items: []` literal anywhere in g01.routes.ts), and {id}/governed-changes lists real requests.
      steps: [add create service path + validation + service_no, add outbox append, back both feeds with
        service reads through pageItems]
    - name: governed-change decisions + workflow task actions
      max_iterations: 6
      repeat_until: :approve/:reject call module service logic (state transition, SR post to G12 on
        approve, reason captured on reject; no bare decision echo remains), and
        /api/v1/workflow/tasks/{task_id} claim/approve/reject/delegate routes mutate workflow state via
        the service with authority evidence.
      steps: [implement approve/reject in employeeMasterService, wire SR posting, add task action routes,
        extend hrmsWorkflowService for claim/delegate at task grain]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph04-p01-g01-routes.test.cjs exercises create, /changes feed content after create,
        approve->SR effect, reject->reason, and task claim; `npm run -s typecheck` and `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-04b.sh` prints GREEN.
      steps: [write behaviour tests, npm run -s typecheck, npm test, run the oracle, fix and repeat]
  evidence_required:
    - apps/api/src/routes/g01.routes.ts , apps/api/src/routes/p01-workflow.routes.ts ,
      apps/api/src/modules/g01/** diffs
    - apps/api/test/ph04-p01-g01-routes.test.cjs with a passing `npm test` run
    - GREEN output of `bash docs/spec/pipeline/checks/ph-04b.sh` captured in the phase log
  escalate_when:
    - FR-EPM-001 dedup/blocking rules cannot be implemented deterministically from the BRD (state the
      precise ambiguity; do not silently skip the AC).
    - Approve-path SR posting conflicts with G12 ingest contracts in a way that needs a contract amendment.
    - A needed ERR-G01-* code is not in the taxonomy — request amendment, never invent.
