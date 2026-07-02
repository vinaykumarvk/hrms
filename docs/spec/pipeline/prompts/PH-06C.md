/goal
  objective: PH-06C — take the G05 transfer backend from thin slice to BRD depth. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found: order numbers derived from orders.length+1
    (not gapless), no relieving order or last_working_day entity, no joining report entity or G01
    posting update on join, SR event codes that do not match the frozen G12 catalog (TRANSFER_JOINED,
    TRANSFER_RETAINED, TRANSFER_DEEMED_RELIEVED are not catalog codes), cancellation posted as a fresh
    event instead of the SR reversal envelope, and a hardcoded 3-item clearance array.
  audit_gaps_closed:
    - Gapless order numbering: consume the order_number_sequences entity with reserve-then-commit semantics
      (number reserved in the issuing transaction, committed on approval; no orders.length+1 arithmetic).
    - Relieving order entity (relieving_orders) carrying last_working_day, produced at relief.
    - Joining report entity (joining_reports); on join, update the employee's posting in G01 via a new
      EmployeeMasterService.applyTransferPosting(...) (org unit moves to toOrgUnitId, audited).
    - SR event codes per the frozen G12 catalog: TRANSFER (order issued), RELIEVING (relief),
      JOINING (joining report) — replacing TRANSFER_JOINED / TRANSFER_RETAINED / TRANSFER_DEEMED_RELIEVED.
      TRANSFER_CANCELLED / RELIEVING_CANCELLED / JOINING_CANCELLED remain valid catalog codes.
    - Cancellation posts through the SR reversal envelope (reverseFromSource / reversalOfEventId via
      /api/v1/sr/ingest/reversal semantics), not a bare new event.
    - Configurable clearance departments: clearance_checklists + clearance_items persisted, departments
      sourced from configuration (g05_clearance_department domain), replacing the hardcoded defaultClearances array.
  context:
    - docs/brd/v3/G05-transfer-relieving-joining-workflow.md   # entities, ERR-G05-*, SR codes
    - docs/data-model/05-G05-transfer-relieving-joining.sql    # transfer_requests, transfer_orders, order_number_sequences, clearance_checklists, clearance_items, relieving_orders(last_working_day), joining_reports
    - docs/brd/v3/G12-digital-service-register.md              # frozen sr_event_type catalog (TRANSFER/RELIEVING/JOINING/...)
    - apps/api/src/modules/g05/** (service + repository from PH-06A), apps/api/src/modules/g12/serviceRegisterService.ts
    - apps/api/src/modules/g01/employeeMasterService.ts , apps/api/src/routes/g05.routes.ts
  constraints:
    - SR eventTypeCode values must come from the frozen G12 catalog verbatim; emitting a non-catalog code is a defect.
    - Persist via the PH-06A repository/migration path (parameterised queries only; reserve-then-commit and
      relieve/join are multi-step writes -> transactions).
    - ERR-G05-RELIEVE-DATE / ERR-G05-CLEARANCE-INCOMPLETE style codes: use BRD-registered codes where a named one exists.
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: numbering + entities
      max_iterations: 5
      repeat_until: order_number_sequences reserve-then-commit issues gapless orderNo values;
        relieving_orders (with last_working_day) and joining_reports are persisted entities;
        clearance checklist/items are configuration-driven with the hardcoded array removed.
      steps: [sequence repo + reserve/commit, relieving/joining entities, configurable clearance departments]
    - name: SR catalog conformance + reversal + posting update
      max_iterations: 5
      repeat_until: G05 emits TRANSFER / RELIEVING / JOINING catalog codes; cancellation flows through the
        SR reversal envelope; join invokes EmployeeMasterService.applyTransferPosting and the employee's
        org unit reflects toOrgUnitId.
      steps: [remap event codes, wire reverseFromSource for cancel, implement applyTransferPosting]
    - name: tests + verify
      max_iterations: 4
      repeat_until: new tests in apps/api/test drive initiate->approve->clear->relieve->join asserting
        gapless sequential orderNo, RELIEVING + JOINING SR events, reversal-linked cancellation, and the
        G01 posting change; `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-06c.sh` GREEN.
      steps: [write behavior tests, run suites, run oracle, fix]
  freedom:
    - Sequence scoping (per year/entity/order type), checklist seeding, and route naming under
      /api/v1/transfers/** are yours to design within the frozen DDL.
    - Retention/deemed-relief may map to catalog codes plus payload detail rather than new event types.
  evidence_required:
    - apps/api/src/modules/g05/** diffs, employeeMasterService.applyTransferPosting, g05.routes.ts updates
    - tests asserting catalog codes, gapless numbering, reversal cancel, posting update
    - `npm run typecheck` + `npm test` green; ph-06c.sh GREEN
  escalate_when:
    - The frozen G12 catalog lacks a code required for retention/deemed-relief outcomes (needs a catalog amendment, not an invented code).
    - Gapless numbering cannot be made concurrency-safe within the current transaction helper.
