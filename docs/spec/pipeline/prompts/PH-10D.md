/goal
  objective: Build the real G14 analytics engine. The audit found 5 read-only marker endpoints, one static metric
    card, and a 24-table DDL (docs/data-model/14-G14-dashboard-analytics.sql) that runtime never consumes.
    Implement: governed kpi_definitions with versioning and explicit activation (only one ACTIVE version computes;
    cross-version aggregation blocked per ERR-G14-XVER-AGG); mart refresh that CONSUMES the SQL layer —
    analytics_datamarts + datamart_refresh_logs and the seeded marts (MART_LEAVE, MART_ATTENDANCE, MART_APPRAISAL,
    MART_ESTABLISHMENT) driven by a registered JOB-G14-MART-* job, replacing the in-memory stand-in; k-anonymity
    small-cell suppression via suppression_policies (default min_cell_size_k = 5: any cell with fewer than 5 members
    is suppressed, with complementary suppression so totals cannot recover it — ERR-G14-SMALL-CELL); the
    analytics_scope_policies entity with maker-checker activation (ERR-G14-SCOPE-CHECKER); and bitemporal
    kpi_snapshots carrying valid_time + knowledge_time where restatements append superseding rows (is_superseded)
    and an as-of-knowledge query reproduces what was known at a past knowledge_time.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # "24-table DDL exists unconsumed; runtime in-memory"; 115/132 NOT_FOUND
    - docs/brd/v3/G14-dashboard-and-analytics.md       # E03 kpi_definitions, E04 kpi_snapshots (bitemporal), E09 analytics_datamarts,
                                                       #   E10 datamart_refresh_logs, E11 analytics_scope_policies, E24 suppression_policies;
                                                       #   ERR-G14-SMALL-CELL, ERR-G14-COMP-SUPPRESS, ERR-G14-SCOPE-CHECKER, ERR-G14-XVER-AGG, ERR-G14-ASOF-NA
    - docs/data-model/14-G14-dashboard-analytics.sql   # the 24 CREATE TABLE names the engine must consume
    - apps/api/src/modules/g14/analyticsService.ts     # in-memory stand-in to replace
    - apps/api/src/routes/g14.routes.ts , apps/api/src/jobs/jobService.ts , apps/api/src/modules/g03 g08   # mart sources
  constraints:
    - The engine binds to the DDL: table names, columns, and enums come from 14-G14-dashboard-analytics.sql — the
      oracle counts how many of the 24 DDL tables the g14 runtime actually references; a handful of camelCase
      lookalikes will not pass. Do not fork a parallel schema.
    - KPI lifecycle: DRAFT -> ACTIVE (activation is an explicit governed step); computing against a non-ACTIVE
      version fails; aggregating across kpi_version values raises ERR-G14-XVER-AGG; every snapshot is stamped with
      kpi_version + definition_hash.
    - Suppression is fail-closed and applied at the query boundary: a cohort of 4 must come back suppressed
      (ERR-G14-SMALL-CELL semantics or a suppressed-cell shape — never the raw count), and complementary suppression
      must prevent recovery by subtraction from totals.
    - Scope policies: creating/altering an analytics_scope_policies row requires a distinct checker to activate
      (ERR-G14-SCOPE-CHECKER when maker==checker); enforcement remains with P02, the entity declares scope.
    - Bitemporal: snapshots are append-only; a restatement appends a new row with fresh knowledge_time and marks the
      prior is_superseded; the as-of-knowledge query with an earlier knowledge_time returns the pre-restatement
      value; no as-of data -> ERR-G14-ASOF-NA. Never mutate a snapshot row.
    - Executed tests required: suppression NEGATIVE test with a 4-member cohort; bitemporal as-of-knowledge test
      (value before vs after restatement); scope maker-checker NEGATIVE test; refresh writing datamart_refresh_logs.
    - Parameterised queries; transactions; no console.log; no stack traces; read paths bounded/paginated.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: KPI definitions + bitemporal snapshots
      max_iterations: 7
      repeat_until: kpi_definitions carry versioning + activation; kpi_snapshots are append-only bitemporal rows
        (valid_time, knowledge_time, is_superseded, kpi_version, definition_hash) with a working as-of-knowledge query.
      steps: [kpi entity + versioning + activation, snapshot append + supersede, as-of-knowledge query]
    - name: Mart refresh + suppression + scope policies
      max_iterations: 8
      repeat_until: JOB-G14-MART-* refresh populates the DDL-named marts from module sources and logs to
        datamart_refresh_logs; queries pass through k-anonymity suppression (k=5 default, complementary); scope
        policies enforce maker-checker activation.
      steps: [mart refresh job over DDL tables, refresh logging, suppression at query boundary, scope policy entity + SoD]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains the 4-member-cohort suppression NEGATIVE test, the as-of-knowledge
        bitemporal test, and the ERR-G14-SCOPE-CHECKER NEGATIVE test; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-10d.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g14/** engine consuming the DDL table names; job registration for mart refresh
    - apps/api/test/*.test.cjs: suppression, bitemporal as-of, scope-SoD, refresh-log tests
    - `bash docs/spec/pipeline/checks/ph-10d.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A KPI's source contract (source_data_contracts) cannot be satisfied by an upstream module's current data —
      record the gap; do not fabricate mart rows.
    - Suppression policy parameters for a domain are absent from BRD/seed (default k=5; do not invent per-domain overrides).
