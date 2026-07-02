/goal
  objective: Take G06 promotion/seniority/DPC/MACP from the audited thin slice (seniority→DPC quorum→order→SR)
    to BRD depth. Required by the 2026-07-02 coverage audit (87 of 108 items NOT_FOUND):
    (1) eligibility engine reading the PH-08A qualifying_service_ledger, with the APAR-usability gate
        (VAL-G06-APAR-USABLE / APAR_NOT_USABLE: adverse APAR counts only if communicated and representation
        DISPOSED or N/A),
    (2) zone-of-consideration with the pinned slab (IN_ZONE / EXTENDED_ZONE / OUT_OF_ZONE on the crucial date),
    (3) reservation_rosters + roster_points (point_number, reserved_for, adjusted_against_category) with
        own-merit migration — reserved candidate selected on own merit occupies a UR point with
        adjusted_against_category=GEN, else OWN_MERIT_MIGRATION_REQUIRED,
    (4) refusal consequences: promotion_refusals with debarment window (debarment_until, macp_clock_effect);
        re-consideration inside the window throws EMPLOYEE_DEBARRED,
    (5) probation lifecycle auto-created when a promotion order is effected (probation_records, ON_PROBATION,
        scheduled_end = start + months),
    (6) real domain error CODES emitted — the audit found only generic codes with marker strings. QUORUM_NOT_MET,
        PANEL_CONFLICT_OF_INTEREST, SENIORITY_LIST_NOT_FINAL must be thrown `code` values,
    (7) sub-judice stay blocks effecting an order: ENTITY_SUB_JUDICE (negative test required),
    (8) reconcile the audit-flagged broken rename in apps/web/src/modules/g06 (module reported exporting `ln`
        while the file declares PromotionWorkspace) — verify on this branch and ensure the module exports
        PromotionWorkspace, App.tsx imports it, and `npm run web:typecheck` passes.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - docs/brd/v3/G06-promotion-posting-progression.md   # §5.6 integrity rules, §9.4 domain codes, roster/refusal/probation entities
    - docs/data-model/06-G06-promotion-posting-progression.sql
    - apps/api/src/modules/g06/promotionService.ts , apps/api/src/routes/g06.routes.ts
    - apps/api/src/platform/  + the PH-08A kernels (sanctioned_posts, qualifying_service_ledger repositories)
    - apps/web/src/modules/g06/PromotionWorkspace.tsx , apps/web/src/App.tsx
  constraints:
    - Persist new entities via the PH-08A persistence layer honouring the DDL shapes; parameterised queries only
      if SQL; DPC verdict + order + roster-point occupation + probation creation are transactional.
    - Domain errors are THROWN with the BRD code as the error's `code` value: QUORUM_NOT_MET,
      PANEL_CONFLICT_OF_INTEREST, SENIORITY_LIST_NOT_FINAL, ENTITY_SUB_JUDICE, EMPLOYEE_DEBARRED,
      OWN_MERIT_MIGRATION_REQUIRED, APAR_NOT_USABLE. Tests assert error.code === "<CODE>";
      no details.marker indirection (replace, do not keep, marker-based assertions for these paths).
    - Maker≠checker SoD: DPC members are distinct from candidates (PANEL_CONFLICT_OF_INTEREST); order approval
      is not the case initiator; MACP effect respects the BRD cap (≤3 upgradations, promotions reduce entitlement).
    - Eligibility MUST read net qualifying service from the QSL current snapshot — no re-derivation inside g06.
    - No production console.log; no stack traces or internal paths in API error responses.
    - Do NOT weaken oracles: no edits to docs/spec/pipeline/checks/**, docs/spec/pipeline/phases.yaml,
      .state/**, approvals/**, or other phases' prompt files.
  work_loops:
    - name: eligibility + zone + domain codes
      max_iterations: 6
      repeat_until: eligibility engine reads QSL + APAR-usability gate; zone-of-consideration slab pins the
        candidate set on the crucial date; QUORUM_NOT_MET / PANEL_CONFLICT_OF_INTEREST / SENIORITY_LIST_NOT_FINAL
        thrown as error codes on their BRD conditions.
      steps: [QSL read in eligibility, APAR gate, zone slab, replace marker errors with domain codes]
    - name: roster + refusal + probation + sub-judice
      max_iterations: 6
      repeat_until: reservation_rosters/roster_points enforce category occupation with own-merit migration;
        promotion_refusals create the debarment window and EMPLOYEE_DEBARRED blocks re-consideration; effecting
        an order auto-creates probation_records; ENTITY_SUB_JUDICE blocks effecting a stayed entity.
      steps: [roster entities + point occupation, own-merit migration, refusal + debarment, probation on effect, sub-judice gate]
    - name: web reconcile + verify
      max_iterations: 4
      repeat_until: g06 web module cleanly exports PromotionWorkspace (no stray `ln` export) and web:typecheck
        passes; apps/api/test/ph08c-g06-depth.test.cjs covers eligibility-from-QSL, roster own-merit, refusal
        debarment, probation auto-creation, and negatives asserting error.code for QUORUM_NOT_MET,
        PANEL_CONFLICT_OF_INTEREST, SENIORITY_LIST_NOT_FINAL, EMPLOYEE_DEBARRED and ENTITY_SUB_JUDICE;
        `npm run typecheck` + `npm test` + `npm run web:typecheck` pass; ph-08c.sh GREEN.
      steps: [fix web export if broken, write tests, run typecheck/test/web:typecheck, run ph-08c.sh, fix]
  evidence_required:
    - deepened apps/api/src/modules/g06 + routes; roster/refusal/probation entities persisted
    - apps/api/test/ph08c-g06-depth.test.cjs with the named positive and negative tests
    - `npm run typecheck`, `npm test`, `npm run web:typecheck` green; `bash docs/spec/pipeline/checks/ph-08c.sh` GREEN
  escalate_when:
    - Zone slab sizes or debarment durations are genuinely ambiguous after reading the BRD.
    - Roster semantics conflict between BRD and DDL (amend via spec workflow, not code guess).
    - The oracle demands an assertion that contradicts the BRD (never edit the check to pass — escalate).
