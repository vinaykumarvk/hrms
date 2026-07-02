/goal
  objective: PH-07D — G03 attendance, leave and payroll signals become a real payroll feed. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found: payroll signals are an in-memory list with no
    feed entity or period lock, attendance day status is only PRESENT/ANOMALY(/REGULARISED), and
    regularisation has no time window or cap.
  audit_gaps_closed:
    - payroll_attendance_feed entity (FR-17): per-employee per-period feed rows persisted with a period
      lock; exporting/locking a period marks it locked, and any further signal for that period raises
      PERIOD_ALREADY_LOCKED on direct write.
    - Locked-period adjustments: a post-lock change (e.g. approved leave cancellation inside a locked
      period) does not mutate the locked feed row — it emits an adjustment record
      (payroll_feed_adjustments / LOCKED_PERIOD_ADJUSTMENT_EMITTED) targeting the next open period.
    - Attendance day statuses beyond the stub: derivation produces ON_LEAVE (approved leave spell covers
      the day), HOLIDAY (holiday calendar), and HALF_DAY (half-day leave/short attendance) in addition to
      PRESENT/ABSENT/anomaly handling.
    - Regularisation discipline: requests outside the configured backdate window raise WINDOW_EXPIRED,
      and a per-period cap on regularisations is enforced.
  context:
    - docs/brd/v3/G03-attendance-and-leave-management.md   # FR-17 feed + lock; g03_attendance_status values; WINDOW_EXPIRED
    - docs/data-model/03-G03-attendance-leave.sql          # payroll_attendance_feed, payroll_feed_adjustments, attendance_daily, attendance_lock_periods
    - apps/api/src/modules/g03/**                          # service + repository (PH-06A/06B state)
    - apps/api/src/routes/g03.routes.ts
  constraints:
    - Codes verbatim from the BRD: PERIOD_ALREADY_LOCKED, WINDOW_EXPIRED, LOCKED_PERIOD_ADJUSTMENT_EMITTED
      (as the emitted adjustment marker/audit action); status values verbatim from g03_attendance_status
      (ON_LEAVE, HOLIDAY, HALF_DAY, ...).
    - Persist feed + adjustments via the repository/migration path; parameterised queries; lock-check +
      write (or adjustment emission) is transactional.
    - A locked feed row is immutable — adjustments are separate records, never in-place edits.
    - Do not regress the PH-06B leave behavior or existing slice tests.
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: feed + period lock
      max_iterations: 5
      repeat_until: payroll_attendance_feed rows are generated from signals/attendance per period; locking a
        period blocks direct writes with PERIOD_ALREADY_LOCKED; post-lock changes emit adjustment records
        into the next open period.
      steps: [feed entity + generation, lock entity + guard, adjustment emission path]
    - name: day statuses + regularisation window
      max_iterations: 5
      repeat_until: attendance day derivation yields ON_LEAVE / HOLIDAY / HALF_DAY from leave spells and the
        holiday calendar; regularisation enforces the backdate window (WINDOW_EXPIRED) and per-period cap.
      steps: [status derivation joining leave + holidays, window/cap validation]
    - name: tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains a feed lock test (write into locked period -> PERIOD_ALREADY_LOCKED,
        then adjustment emitted), status derivation coverage for ON_LEAVE/HOLIDAY/HALF_DAY, and a
        WINDOW_EXPIRED negative; `npm run typecheck` + `npm test` green;
        `bash docs/spec/pipeline/checks/ph-07d.sh` GREEN.
      steps: [write lock + derivation + window tests, run suites, run oracle, fix]
  freedom:
    - Feed generation trigger (on-demand vs job-driven), window/cap configuration source, and derivation
      order of precedence for a day matching multiple sources are yours to design within the BRD rules.
    - Half-day representation may reuse leave_application_days grain if the DDL supports it.
  evidence_required:
    - apps/api/src/modules/g03/** diffs, feed/lock/adjustment migrations, g03.routes.ts feed/lock routes
    - tests: locked-period negative + adjustment emission, day-status derivation, WINDOW_EXPIRED negative
    - `npm run typecheck` + `npm test` green; ph-07d.sh GREEN
  escalate_when:
    - Feed semantics conflict with the frozen DDL (e.g. lock granularity) — record the exact column.
    - Day-status derivation needs roster/shift data that no phase has yet seeded.
