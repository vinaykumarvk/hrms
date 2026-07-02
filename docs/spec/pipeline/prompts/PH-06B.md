/goal
  objective: PH-06B — take the G03 leave backend from thin happy-path slice to BRD depth for the core
    application lifecycle. The audit (docs/reviews/brd-coverage-audit-20260702.md) scored G03 at 9/118
    CONFIRMED: no leave-type/accrual-policy config entities, generic CONFLICT instead of named errors,
    no overlap check, no withdraw/partial-cancel, no holiday calendar, no eligibility/entitlement gates,
    and the leave_balances.version field never used for optimistic locking.
  audit_gaps_closed:
    - FR-10 Leave-Type & Accrual-Policy Configuration: leave_types + leave_accrual_policies entities exist
      and drive submission validation (today leaveTypeId is a free string and opening balance is hardcoded 30).
    - Named errors: INSUFFICIENT_BALANCE (today: generic CONFLICT "Leave balance is insufficient") and
      LEAVE_OVERLAP for date-overlapping applications of the same employee (today: no check at all).
    - FR-13 Leave Cancellation & Modification: withdraw of a SUBMITTED application (-> WITHDRAWN, reservation
      released) and partial cancellation of an APPROVED spell (remaining days credited, ledger entries emitted).
    - FR-02 Holiday calendar: holiday_calendars/holidays consumed so totalDays excludes holidays for
      non-holiday-counting leave types.
    - Eligibility/entitlement checks at submit: ELIGIBILITY_FAILED and ENTITLEMENT_EXCEEDED per leave type.
    - Optimistic locking: balance mutations take an expected version and raise OPTIMISTIC_LOCK_CONFLICT on mismatch.
  context:
    - docs/brd/v3/G03-attendance-and-leave-management.md   # FR-02, FR-10, FR-13; named error codes in section 8
    - docs/data-model/03-G03-attendance-leave.sql          # leave_types, leave_accrual_policies, holiday_calendars, holidays, leave_balances.version
    - apps/api/src/modules/g03/**                          # service + repository from PH-06A
    - apps/api/src/routes/g03.routes.ts , apps/api/src/http/errors.ts
    - apps/api/test/ph06-g03-leave.test.cjs                # existing slice test that must stay green
  constraints:
    - Error codes must be the BRD-named codes above, surfaced through FoundationError/ErrorEnvelope; do not invent synonyms.
    - Persist new entities through the PH-06A repository/migration path (parameterised queries only; transactions for multi-step writes).
    - Do not change approved workflow/state-machine semantics (WITHDRAWN is reachable only from SUBMITTED).
    - No production console.log; no stack traces or internal paths in API responses.
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: config entities + validation gates
      max_iterations: 5
      repeat_until: leave_types + leave_accrual_policies are persisted and consumed at submit; unknown leave
        type is rejected; accrual follows the policy; ELIGIBILITY_FAILED and ENTITLEMENT_EXCEEDED are enforced.
      steps: [repo + routes for leave-type/policy config, wire submit-time validation, seed defaults]
    - name: named errors + overlap + holidays + optimistic lock
      max_iterations: 5
      repeat_until: INSUFFICIENT_BALANCE replaces the generic CONFLICT, LEAVE_OVERLAP blocks overlapping
        spells, holiday_calendars adjust totalDays, and OPTIMISTIC_LOCK_CONFLICT fires on stale version.
      steps: [overlap query, holiday-aware day count, version-checked balance writes]
    - name: FR-13 withdraw + partial cancel + tests
      max_iterations: 5
      repeat_until: withdraw (SUBMITTED->WITHDRAWN, reservation released) and partial cancellation of an
        APPROVED spell (partial CANCELLATION_CREDIT + corrected G04 relay) are exposed via g03 routes; new
        tests in apps/api/test drive the behavior and assert LEAVE_OVERLAP, INSUFFICIENT_BALANCE, withdraw,
        partial cancel and OPTIMISTIC_LOCK_CONFLICT; `npm run typecheck` + `npm test` green;
        `bash docs/spec/pipeline/checks/ph-06b.sh` GREEN.
      steps: [implement withdraw/partial-cancel, add routes, write behavior tests, run suites + oracle]
  freedom:
    - Repository method shapes, seed data content, and route naming for the new endpoints (keep them under
      the existing /api/v1/atl/** namespace) are yours to design.
    - Holiday-counting semantics per leave type may be modelled as a leave_types flag if the BRD grain allows.
    - You may refactor within apps/api/src/modules/g03 as needed; adjacent modules only via their public services.
  evidence_required:
    - apps/api/src/modules/g03/** diffs; g03.routes.ts routes for withdraw, partial cancel, leave-type config
    - tests under apps/api/test asserting each named error is thrown by real behavior (not string echoes)
    - `npm run typecheck` + `npm test` green; ph-06b.sh GREEN
  escalate_when:
    - A BRD rule conflicts with the frozen DDL or an approved state machine (record the exact clause).
    - Partial cancellation cannot be expressed without altering the G04 relay contract.
