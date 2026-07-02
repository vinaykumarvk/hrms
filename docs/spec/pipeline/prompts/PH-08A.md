/goal
  objective: Build the PH-08 statutory wave's SHARED KERNELS as real, persisted, service-consumed engines:
    (1) the sanctioned_posts / establishment-strength register (G06 PPP-EST, the FR-015 backbone for vacancy,
    promotion and later recruitment maths) and (2) the qualifying_service_ledger + service_exclusion_rules
    (G06 PPP-QSL / FR-PPP-016, consumed by G06 eligibility now and G11 pension later), with a compute engine
    and snapshot lineage. The 2026-07-02 coverage audit found BOTH entirely absent: module services are
    in-memory happy-path slices and the docs/data-model SQL is unconsumed by runtime.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md        # why this re-baseline exists; prior oracle was a rubber stamp
    - docs/brd/v3/G06-promotion-posting-progression.md   # PPP-EST + PPP-QSL: field lists, VAL-G06-VACANCY-RECON,
                                                         # VAL-G06-QUOTA-SPLIT, VAL-G06-QUALSVC, domain error codes
    - docs/data-model/06-G06-promotion-posting-progression.sql   # authoritative DDL shapes for both kernels
    - apps/api/src/modules/g06/promotionService.ts       # current slice; must become a kernel CONSUMER
    - apps/api/src/platform/foundationServices.ts , apps/api/src/platform/types.ts   # DI wiring + FoundationError
  constraints:
    - PERSISTED, not in-memory: introduce a repository/persistence layer over a durable medium (file-backed
      store or embedded SQL mirroring the docs/data-model DDL shapes). If SQL is used: parameterised queries
      only, never interpolated strings. Multi-step writes (snapshot supersede, strength+vacancy updates) are
      transactional/atomic — no partially applied kernel state.
    - qualifying_service_ledger snapshots are append-only with lineage: is_current, superseding_snapshot_id,
      exclusion_breakdown_json. Recompute creates a superseding snapshot; history is never mutated.
    - service_exclusion_rules drive the compute: eol_counts_as_qualifying, dies_non_excluded,
      suspension_treatment, adhoc/deputation counting, break-in-service clock reset.
    - sanctioned_posts carries sanctioned_strength, filled_count, dr/promotion/ldce quota pcts and
      current_vacancies; reconciliation enforces strength arithmetic and quota split summing to 100.
    - Domain errors are THROWN with the BRD code as the error's `code` value (extend the error taxonomy while
      keeping the wire mapping): STRENGTH_INCONSISTENT, QUOTA_SPLIT_INVALID, VACANCY_NOT_RECONCILED.
      No details.marker indirection — tests must assert error.code === "<CODE>".
    - Maker≠checker SoD: register amendments and exclusion-rule changes record distinct maker/approver actors
      where the BRD requires it; the same actor may not both propose and approve a strength change.
    - No production console.log; no stack traces or internal paths in API error responses.
    - Do NOT weaken oracles: no edits to docs/spec/pipeline/checks/**, docs/spec/pipeline/phases.yaml,
      .state/**, approvals/**, or other phases' prompt files.
  work_loops:
    - name: persistence layer + establishment register
      max_iterations: 6
      repeat_until: durable repositories expose sanctioned_posts CRUD + reconcile; g06 vacancy maths read
        current_vacancies from the register (not a local array); STRENGTH_INCONSISTENT, QUOTA_SPLIT_INVALID and
        VACANCY_NOT_RECONCILED are thrown as error codes on bad register state.
      steps: [storage adapter, sanctioned_posts repository, reconcile + quota-split validation, wire g06 consumer]
    - name: QSL compute + exclusion rules
      max_iterations: 6
      repeat_until: qualifying_service_ledger compute produces net_qualifying_years from gross service minus
        rule-driven exclusions with a populated exclusion_breakdown_json; snapshots carry supersede lineage;
        g06 eligibility reads the current snapshot; a QSL read contract is exposed for later G11 consumption.
      steps: [service_exclusion_rules repository, compute engine, snapshot supersede lineage, g06 eligibility read]
    - name: verify
      max_iterations: 4
      repeat_until: apps/api/test/ph08a-establishment-qsl.test.cjs covers QSL compute (gross − exclusions = net),
        exclusion-rule treatments (EOL / dies-non / suspension), snapshot supersede lineage, store rehydrate
        durability (data survives re-opening the persistence layer), vacancy reconcile, and negative
        assert.throws for STRENGTH_INCONSISTENT and QUOTA_SPLIT_INVALID asserting error.code; `npm run typecheck`
        and `npm test` pass; `bash docs/spec/pipeline/checks/ph-08a.sh` reports GREEN.
      steps: [write tests, npm run typecheck, npm test, run ph-08a.sh, fix]
  evidence_required:
    - persistence layer + repositories referencing sanctioned_posts / qualifying_service_ledger /
      service_exclusion_rules under apps/api/src, consumed by apps/api/src/modules/g06
    - apps/api/test/ph08a-establishment-qsl.test.cjs with the named positive, durability and negative tests
    - `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-08a.sh` GREEN
  escalate_when:
    - The BRD/data-model leaves an exclusion treatment genuinely ambiguous after reading both sources.
    - Durable persistence cannot be introduced without breaking the PH-03..PH-07 suites.
    - The oracle demands an assertion that contradicts the BRD (never edit the check to pass — escalate).
