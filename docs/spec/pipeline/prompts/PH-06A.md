/goal
  objective: PH-06A — THE PERSISTENCE SUBSTRATE. Replace the in-memory arrays behind the G03 and G05
    owned entities with Postgres-backed repositories consuming the frozen data model. This is the #1
    cross-cutting gap from docs/reviews/brd-coverage-audit-20260702.md: every module service runs on
    `private readonly xs: T[] = []` and docs/data-model/*.sql is entirely unconsumed by runtime.
  audit_gaps_closed:
    - "Persistence: services use in-memory arrays; the SQL data model is largely unconsumed" (audit, cross-cutting #1)
    - G03 owned entities with no repository: leave_types, leave_accrual_policies, leave_ledger(_entries), leave_reservations
    - G05 owned entities with no repository: transfer_requests, transfer_orders, clearance_checklists, clearance_items
  context:
    - docs/reviews/brd-coverage-audit-20260702.md          # what "done" must now mean
    - docs/data-model/03-G03-attendance-leave.sql          # frozen DDL: leave_types, leave_accrual_policies, leave_ledger_entries, leave_reservations, leave_balances(version)
    - docs/data-model/05-G05-transfer-relieving-joining.sql # frozen DDL: transfer_requests, transfer_orders, order_number_sequences, clearance_checklists, clearance_items
    - docs/data-model/00-platform-core.sql                 # shared core the module DDL references
    - apps/api/src/modules/g03/leaveService.ts , apps/api/src/modules/g05/transferService.ts
    - apps/api/src/platform/foundationServices.ts          # constructor wiring to extend
    - docs/spec/pipeline/checks/ph-02b.sh                  # throwaway initdb/pg_ctl cluster pattern (reused by the oracle)
  deliverables:
    - Add `pg` as a real dependency (package.json) and a pool/client module under apps/api/src/db/ that
      reads DATABASE_URL; no hardcoded localhost URLs in production paths (env-driven only).
    - Materialise the consumed DDL as ordered SQL migrations under apps/api/db/migrations/*.sql
      (a faithful subset of docs/data-model covering the eight tables above plus their core prerequisites)
      with a runner (apps/api/src/db/migrate.ts) that applies them idempotently.
    - Repository layer: apps/api/src/modules/g03/leaveRepository.ts and
      apps/api/src/modules/g05/transferRepository.ts exposing typed CRUD/query methods over those tables.
      leaveService.ts and transferService.ts must import and route their entity state through the
      repositories (an injectable in-memory *implementation of the same repository interface* may remain
      for unit tests, but the bare private arrays for these entities must be gone from the services).
    - Integration test apps/api/test/ph06-persistence.test.cjs: when DATABASE_URL is set it applies the
      migrations to that database and exercises, as >=3 real subtests, (a) leave_types + accrual-policy
      insert/read, (b) leave_reservations reserve->debit ledger flow with leave_balances.version bump,
      (c) transfer_orders + clearance_items round-trip. When DATABASE_URL is unset it must skip cleanly
      so `npm test` stays green without a database. The oracle runs it against a throwaway cluster and
      treats a skip-only run as RED — the subtests must genuinely execute.
  constraints:
    - Parameterised queries only ($1,$2,...) — never interpolate values into SQL strings.
    - Multi-step writes (reserve+ledger+balance, order+checklist) use a single transaction (BEGIN/COMMIT via a withTransaction helper).
    - Do not change the frozen DDL semantics; column/table names must match docs/data-model verbatim.
    - No production console.log; use existing audit/logging paths. No stack traces or internal paths in API responses.
    - Do NOT weaken, edit, or special-case any oracle under docs/spec/pipeline/checks/.
    - Do NOT touch docs/spec/pipeline/.state/ or approvals/.
    - Behavior of the existing green slice tests must be preserved (suite stays green).
  work_loops:
    - name: db substrate
      max_iterations: 4
      repeat_until: pg pool + migration runner exist, apps/api/db/migrations/*.sql create the eight owned
        tables (+ prerequisites) and apply clean to an empty database.
      steps: [add pg dep, write pool + withTransaction, extract migration SQL from docs/data-model, write runner]
    - name: repositories wired
      max_iterations: 6
      repeat_until: leaveRepository/transferRepository implemented with parameterised SQL; leaveService and
        transferService consume them; the bare in-memory arrays for the owned entities are removed;
        `npm run typecheck` and `npm test` pass.
      steps: [define repo interfaces, implement pg repos, port services, keep unit tests green]
    - name: integration proof
      max_iterations: 4
      repeat_until: ph06-persistence.test.cjs passes with >=3 executed subtests against a local throwaway
        postgres (initdb/pg_ctl) and skips cleanly without DATABASE_URL; `bash docs/spec/pipeline/checks/ph-06a.sh` is GREEN.
      steps: [write integration test, run against throwaway cluster, fix, run oracle]
  evidence_required:
    - apps/api/src/db/** , apps/api/db/migrations/*.sql , apps/api/src/modules/g03/leaveRepository.ts , apps/api/src/modules/g05/transferRepository.ts
    - apps/api/test/ph06-persistence.test.cjs run output (pass>=3, skipped=0 with DATABASE_URL)
    - `npm run typecheck` + `npm test` green; `bash docs/spec/pipeline/checks/ph-06a.sh` GREEN
  escalate_when:
    - The frozen DDL cannot support an existing service behavior without semantic change (record the exact column/constraint).
    - Postgres tooling (initdb/pg_ctl/psql 14) is unavailable on the runner.
    - Removing an in-memory array would break a cross-module consumer that PH-06A may not touch.
