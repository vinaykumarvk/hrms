/goal
  objective: Close the remaining G05 transfer-administration gaps found by the 2026-07-02 coverage audit.
    The current g05 slice does initiate→order→clearance→relieve/join→SR only. Missing and now required:
    (1) charge_handovers incl. handover UNDER_PROTEST and the dispute path (ERR-G05-HANDOVER-DISPUTED),
    (2) joining-time / transit entitlement computed by distance band (joining_time_days, VAL-G05-JTIME),
    (3) deputation_records with tenure caps (ERR-G05-DEPUTATION-CAP) and repatriation on cap/recall,
    (4) order_acknowledgements / served-on proof with deemed service (DEEMED_SERVED) and the served gate —
        relieving/effecting an unserved order throws ERR-G05-NOT-SERVED,
    (5) government quarter retention with the penal-rent flip on overstay (ERR-G05-QUARTER-OVERSTAY).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md        # G05 row: 19 of 34 capabilities NOT_FOUND
    - docs/brd/v3/G05-transfer-relieving-joining-workflow.md   # FR-G05-007/009/011/020/022, ERR-G05-*, VAL-G05-*
    - docs/data-model/05-G05-transfer-relieving-joining.sql    # DDL shapes: charge_handovers, deputation_records,
                                                               # order_acknowledgements, quarter_allotments
    - apps/api/src/modules/g05/transferService.ts , apps/api/src/routes/g05.routes.ts   # current slice to extend
    - apps/api/src/platform/  (foundationServices, types)      # DI + error taxonomy; PH-08A persistence layer
  constraints:
    - Persist the new entities through the PH-08A repository/persistence layer (durable medium), honouring
      the docs/data-model DDL shapes. If SQL: parameterised queries only. Handover + relieve and
      acknowledgement + effect sequences are transactional — no half-applied transfer state.
    - Domain errors are THROWN with the BRD code as the error's `code` value: ERR-G05-HANDOVER-DISPUTED,
      ERR-G05-DEPUTATION-CAP, ERR-G05-NOT-SERVED, ERR-G05-QUARTER-OVERSTAY. Tests assert
      error.code === "<CODE>"; no details.marker indirection.
    - Deemed service follows the BRD served-on rules (elapsed statutory window ⇒ DEEMED_SERVED, recorded with
      basis + timestamps); it must be evidence-backed data, not a silently defaulted flag.
    - Joining time derives from the BRD distance-band table; band boundaries live in data (rule rows or a
      config entity), not hardcoded magic numbers scattered through the service.
    - Maker≠checker SoD where the BRD requires it: the relieving/issuing authority acting on an order must be
      a different actor from the employee acknowledging/handing over; deputation repatriation approval is not
      the initiating actor.
    - Preserve existing PH-06/PH-07 transfer behaviour; post statutory facts only via G12.
    - No production console.log; no stack traces or internal paths in API error responses.
    - Do NOT weaken oracles: no edits to docs/spec/pipeline/checks/**, docs/spec/pipeline/phases.yaml,
      .state/**, approvals/**, or other phases' prompt files.
  work_loops:
    - name: handover + served-on + deemed service
      max_iterations: 6
      repeat_until: charge_handovers support normal and UNDER_PROTEST completion with dispute recording;
        order_acknowledgements capture served-on proof; deemed service flips to DEEMED_SERVED per rule; the
        relieve/effect path throws ERR-G05-NOT-SERVED for unserved orders.
      steps: [charge_handovers repo+service, protest/dispute path, order_acknowledgements, deemed-service rule, served gate]
    - name: transit bands + deputation + quarters
      max_iterations: 6
      repeat_until: joining_time_days computed from distance band; deputation_records enforce tenure caps with
        ERR-G05-DEPUTATION-CAP and support repatriation; quarter retention flips to penal rent on overstay per
        BRD with ERR-G05-QUARTER-OVERSTAY.
      steps: [distance-band rule data + compute, deputation_records + cap + repatriation, quarter retention + penal flip]
    - name: verify
      max_iterations: 4
      repeat_until: apps/api/test/ph08b-g05-administration.test.cjs covers under-protest handover, distance-band
        joining-time computation, deemed service reaching DEEMED_SERVED, quarter penal flip, deputation lifecycle,
        and negative assert.throws for ERR-G05-NOT-SERVED and ERR-G05-DEPUTATION-CAP asserting error.code;
        `npm run typecheck` and `npm test` pass; `bash docs/spec/pipeline/checks/ph-08b.sh` reports GREEN.
      steps: [write tests, npm run typecheck, npm test, run ph-08b.sh, fix]
  evidence_required:
    - extended apps/api/src/modules/g05 + routes with the five capability areas persisted via repositories
    - apps/api/test/ph08b-g05-administration.test.cjs with the named positive and negative tests
    - `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-08b.sh` GREEN
  escalate_when:
    - The BRD distance-band table or deemed-service window is genuinely ambiguous after reading FR-G05-009/020.
    - A required entity shape conflicts between the BRD and docs/data-model DDL (amend via spec workflow, not code guess).
    - The oracle demands an assertion that contradicts the BRD (never edit the check to pass — escalate).
