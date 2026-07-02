/goal
  objective: PH-07A — employee wave substrate: G01 satellite persistence and the transactional outbox
    backbone. The audit (docs/reviews/brd-coverage-audit-20260702.md) scored G01 at ~12/180 CONFIRMED and
    flagged cross-cutting gaps this phase owns: the employee record has no contacts/addresses/dependents
    satellites and no attribute-history spine, outbox_events is absent from runtime, and the
    /api/v1/employees/changes feed is hardcoded to return an empty items array.
  audit_gaps_closed:
    - employee_attribute_history spine: every governed employee attribute mutation appends an append-only
      history row (attribute, old/new value, actor, effective date) persisted via the repository layer.
    - Satellite entities persisted and exposed through G01 service + routes: employee_contacts,
      employee_addresses, employee_dependents (frozen names from docs/data-model/01-G01-employee-profile.sql).
    - Transactional outbox backbone: outbox_events written in the SAME transaction as the mutating write
      (employee mutations, satellite changes), with a monotonically ordered cursor.
    - Real change feed: GET /api/v1/employees/changes reads outbox_events with an ordered cursor
      (?cursor=... / next_cursor) instead of the hardcoded `items: []`; same for the per-employee
      governed-changes route.
  context:
    - docs/brd/v3/G01-employee-profile-management.md       # satellite + history + outbox requirements
    - docs/data-model/01-G01-employee-profile.sql          # employee_contacts, employee_addresses, employee_attribute_history, outbox_events (E33)
    - apps/api/src/modules/g01/employeeMasterService.ts , apps/api/src/routes/g01.routes.ts  # hardcoded [] at the changes handlers
    - apps/api/src/db/** , apps/api/db/migrations/**       # PH-06A persistence substrate to extend
    - apps/api/src/platform/foundationServices.ts
  constraints:
    - Outbox emission must be transactional with the source write (one BEGIN/COMMIT) — an outbox row without
      its mutation, or a mutation without its outbox row, is a defect.
    - Feed ordering is total and stable (sequence/cursor column), and pagination is bounded (limit + next_cursor).
    - Parameterised queries only; frozen table/column names verbatim from the data model.
    - P02 masking rules still apply to any attribute values exposed via history or feed payloads.
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: satellites + history persistence
      max_iterations: 5
      repeat_until: employee_contacts / employee_addresses / employee_dependents CRUD and the
        employee_attribute_history append path are implemented through the repository + migrations and
        surfaced on g01 routes; masked fields stay masked.
      steps: [migrations for satellite tables, g01 repository methods, service + route wiring]
    - name: transactional outbox + feed
      max_iterations: 5
      repeat_until: outbox_events rows are written in the same transaction as employee/satellite mutations;
        GET /api/v1/employees/changes serves ordered, cursor-paginated events from the outbox and the
        hardcoded empty responses are gone.
      steps: [outbox table + repo, transactional emit inside mutations, cursor feed handler]
    - name: outbox feed test + verify
      max_iterations: 4
      repeat_until: a test in apps/api/test proves (a) a mutation produces exactly one outbox event, (b) the
        changes feed returns events in cursor order across pages, (c) events survive a re-read with the same
        cursor (stable ordering); `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-07a.sh` GREEN.
      steps: [write outbox/cursor tests, run suites, run oracle, fix]
  freedom:
    - Outbox event payload schema (within the frozen outbox_events columns), cursor encoding, and satellite
      route naming under /api/v1/employees/** are yours to design.
    - Whether satellites reuse one generic repository or per-entity repositories is your choice.
    - History granularity for non-governed attributes may be deferred if recorded in the evidence notes.
  evidence_required:
    - apps/api/src/modules/g01/** diffs, g01.routes.ts real changes feed, outbox migration + repository
    - apps/api/test outbox/cursor feed test
    - `npm run typecheck` + `npm test` green; ph-07a.sh GREEN
  escalate_when:
    - The frozen outbox_events DDL cannot express the required ordering guarantee.
    - Transactional emission is impossible for a mutation path that PH-07A may not restructure.
