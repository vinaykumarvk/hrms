# Done Report — Leave Application & Approval Lifecycle (Test Coverage, Seed Data, Bug Remediation)

**Date:** 2026-07-13
**Path:** standard (see `docs/spec/process-classification.md`)

## Objective

Different types of leave (EL, CL, HPL, SL, CCL) can be submitted by an employee and approved by
their resolved supervisor end-to-end, proven by backend integration tests and a frontend
(unit + Playwright e2e) test, backed by seeded supervisor, leave-calendar (holiday), and
leave-entitlement data. Bugs/gaps found in the process were fixed so the full lifecycle passes.

## Summary

The G03 leave module (submit/approve/reject/delegate/withdraw/cancel, 5 leave types, REPORTING_CHAIN
approval routing, balance ledger, G04 SR relay) was already implemented and unit-proven on this
branch. This work focused on (1) evaluating what supporting data/config leave approval actually
needs, (2) seeding it, (3) writing lifecycle test coverage across all 5 leave types on both backend
and frontend, and (4) fixing two real bugs found during that evaluation — one of them a genuine
authorization gap.

## What was found and fixed

1. **Authorization gap (security-relevant): approver identity was never enforced.**
   `HrmsWorkflowService.actOnInstance()`/`act()` let *any* actor holding the `g03.leave.approve`
   permission approve or reject *any* employee's leave application — not just their own reports.
   Confirmed against `docs/contracts/auth-matrix.yaml` (`g03.leave.approve_standard`, `scope: team`,
   `sod: "approver != applicant"`) and BRD FR-12/§10.6. This affected every module routed through the
   shared P01 workflow platform (G02, G03, G05, G06, G07 — ~17 call sites), not just leave.
   User was asked and chose the platform-wide fix over a leave-only or defer-only option.
   **Fix:** `apps/api/src/platform/workflow/hrmsWorkflowService.ts` now requires, for APPROVE/REJECT/
   SEND_BACK, that the acting user's identity (`actor.userId`, the same convention
   `apps/web/src/app/session.ts` already uses — an employee's session `sub` claim is its employeeId)
   matches one of the resolution's individually-named `selectedAssignees`, **or** the actor holds an
   org-wide override role (`hr_admin`, `leave_admin`, `hrbp`, `sanctioning_authority`,
   `transfer_authority`, `system`) or wildcard `*` permission. All 585 pre-existing backend tests
   already used wildcard/`hr_admin` actors, so this shipped with **zero pre-existing test breakage**;
   4 new tests (`apps/api/test/workflow-approver-identity.test.cjs`) prove the negative case
   (non-assignee blocked with `FORBIDDEN`), the positive case (real resolved manager can approve),
   and the override case (hr_admin can approve on behalf of the resolved approver).

2. **Frontend permission-string bug: the demo employee session could not submit leave.**
   `apps/web/src/app/session.ts` granted the demo employee session `g03.leave.apply`, but every
   actual runtime check (`apps/api/src/routes/g03.routes.ts`, `LeaveService.submit()`, and
   `LeaveApplyForm.tsx`'s own error-message map) requires `g03.leave.submit`. Clicking "Submit
   application" as the demo employee would have failed with a 403 in the real running app. Fixed the
   one-line mismatch. Caught by manually walking the real login → apply → approve flow in a browser
   (Playwright), not by the pre-existing string-marker web unit tests, which don't exercise runtime
   behavior.

## Data/configuration evaluated and seeded

Extended the existing (uncommitted, in-flight) `apps/api/src/seed/testEmployeesSeed.ts`:

- **Supervisor data:** already present (5 test employees with `reportingManagerId` wired into
  `AuthorityResolutionService`, REPORTING_CHAIN-resolvable). Added a 6th employee (Priya Nair,
  GOV-100306, ~9yr tenure) because none of the existing fixtures cleared the Study Leave (SL) leave
  type's 60-month `minServiceMonths` eligibility gate — without her, SL could never be exercised
  end-to-end without inventing service history ad hoc in every test.
- **Leave calendar:** `seedTestLeaveCalendar()` (new) seeds a 2026 gazetted-holiday set (Republic
  Day, Independence Day, Gandhi Jayanti, Diwali, Christmas) via the real `LeaveService.addHoliday()`
  path, wired into `foundationServices.ts` alongside the existing opt-in `seedTestEmployees` flag.
  Proves the FR-02 holiday-aware day-counting distinction (`countsHolidays` true vs false) is
  reachable in a running app, not just a synthetic unit test.
- **Leave entitlements:** the leave-type catalog (`ph03LeaveTypes()`) already configures all 5 types
  (EL, CL, HPL, SL, CCL) with accrual policies and caps; this was config-complete already. What was
  missing was an employee who could actually clear SL's eligibility gate (fixed above) and coverage
  proving CCL's `entitlementCapDays` (15) is enforced independently of its much larger opening
  balance (60).

## Tests written

- `apps/api/test/workflow-approver-identity.test.cjs` (4 tests) — platform-wide identity enforcement.
- `apps/api/test/leave-lifecycle-all-types.test.cjs` (6 tests) — submit+approve/reject across EL, CL,
  HPL, SL, CCL; holiday-aware day counting both ways; entitlement-cap enforcement; every decision made
  by the actor's real resolved approver (not a wildcard actor), per the new enforcement.
- `apps/api/test/seed-five-employees.test.cjs` (extended, not new) — updated for the 6th employee,
  added SL-eligibility and holiday-calendar assertions.
- `apps/web/test/e2e/leave-lifecycle.spec.ts` (1 Playwright test) — real browser, real login as the
  demo employee (GOV-100246), real leave-apply form submission, session switch to the actual resolved
  supervisor identity, real approve click through `LeaveApproverInbox`, asserts the item leaves the
  pending list.
- Manual HTTP smoke test (not committed, ad hoc verification) against `tools/local-api-server.mjs`
  with `HRMS_SEED_TEST_EMPLOYEES=1`: submitted Rohan's EL spanning the seeded 2026-08-15 holiday
  (confirmed `totalDays: 3`, holiday counted per EL's `countsHolidays: true`), confirmed a
  non-manager's approve attempt returns `FORBIDDEN`, confirmed Rohan's real manager (Arjun) approves
  successfully end-to-end including the G04 outbox/SR relay.

## Changed files

```
M  apps/api/src/index.ts                                    (+1, export testEmployeesSeed)
M  apps/api/src/platform/foundationServices.ts               (+41, wire seedTestEmployees + seedTestLeaveCalendar)
M  apps/api/src/platform/workflow/hrmsWorkflowService.ts     (+40, approver-identity enforcement)
M  apps/web/src/app/session.ts                               (1-line permission-string fix)
M  tools/local-api-server.mjs                                (log-message update, 6 employees)
A  apps/api/src/seed/testEmployeesSeed.ts                    (extended in-flight file: 6th employee + holiday calendar)
A  apps/api/test/leave-lifecycle-all-types.test.cjs           (new)
A  apps/api/test/seed-five-employees.test.cjs                 (extended in-flight file)
A  apps/api/test/workflow-approver-identity.test.cjs          (new)
A  apps/web/test/e2e/leave-lifecycle.spec.ts                  (new)
A  docs/spec/process-classification.md                        (new)
```

## Checks run and results

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | clean |
| `node --test apps/api/test/*.test.cjs` | **595 pass, 0 fail, 1 pre-existing skip** (of 596) |
| `npm run web:typecheck` | clean |
| `npm run web:build` | clean |
| `node --test apps/web/test/*.test.cjs` | **153 pass, 0 fail** |
| `npx playwright test` (full suite, serial) | **17 pass, 0 fail** (1 unrelated flake under parallel workers, confirmed pre-existing and not caused by this change — passes reliably serial) |
| Manual HTTP smoke test via `local-api-server.mjs` | submit → block-non-approver → approve, all correct |

## Traceability

- Contracts consulted and matched, not amended: `docs/contracts/auth-matrix.yaml`,
  `docs/contracts/state-machines.yaml`, `docs/contracts/openapi/G03.yaml`.
- No BRD/contract changes required — the fix implements what `auth-matrix.yaml` already specified
  (`scope: team`) but the code hadn't enforced.
- `docs/spec/manifest.json` (the large multi-phase PUDA/PH-xx pipeline tracker) was deliberately left
  untouched — it tracks a separate, much larger initiative with an 80-phase structure; this leave
  testing/remediation work doesn't correspond to a phase in it, and grafting an ad hoc entry onto that
  structure risked more than it helped. `docs/spec/process-classification.md` is the traceability
  record for this piece of work.

## Caveats — resolved, accepted, or deferred

- **Resolved:** approver-identity enforcement gap (platform-wide fix, tested).
- **Resolved:** demo employee leave-submit permission-string bug.
- **Accepted (known, scoped-out) limitation:** delegation (`LeaveService.delegate()`) does not
  re-point the workflow task's resolved-assignee set. A delegate who is not the original resolved
  assignee and not an override role would currently be blocked from approving a delegated task by the
  new enforcement, because `HrmsWorkflowService.act()` only consults `task.resolution.selectedAssignees`
  and has no record of `application.delegatedToEmployeeId`. This is a pre-existing architectural gap
  (delegation was already only leaveService-level bookkeeping, not a platform re-assignment) that
  predates this change; fixing it is a distinct feature (platform-level delegate-aware assignee
  resolution) outside this goal's scope and was not requested. Flagging it here rather than silently
  leaving it undocumented.
- **Deferred:** the naming drift between `docs/contracts/auth-matrix.yaml` (`g03.leave.apply`,
  `g03.leave.approve_standard`, `g03.leave.sanction_special`) and the actual runtime permission
  strings used throughout the code (`g03.leave.submit`, `g03.leave.approve`) is real and
  pre-existing, but reconciling it would mean touching the permission string in every route, service
  call site, and the ~30 backend tests that already agree with each other on the code-side naming —
  a much larger, separate contract-amendment exercise. Only the one place where this drift actually
  broke a real user flow (the demo employee session) was fixed.

## Remaining risks

- In-memory repositories mean seeded data (leave calendar, entitlements, the 6 test employees) is
  process-lifetime only, not persisted — consistent with how the rest of this system's tests/dev
  server already work; not a regression introduced here.
- The Playwright suite has one pre-existing flaky test (`critical.spec.ts` horizontal-overflow check)
  under the default 4-worker parallel run; it is unrelated to leave and passes reliably serially.
