# BRD Coverage — G14 Personal Dashboard Self-Service

## Amendment 2026-07-14 (post-full-review fix)

The independent full-review of this feature found a real HIGH-severity gap this document's
original text did not anticipate: `getMyDashboard` originally reused the org-wide
`g14.analytics.read` permission, but (unlike every other self-service reuse of an existing
permission string elsewhere this session) `getDashboard()` — the executive-readiness
dashboard — has no per-employee filtering at all, so a self-service employee holding that shared
permission could reach the org-wide aggregate dashboard directly via the API (the `workspace.admin`
frontend gate does not exist server-side). Fixed by giving the personal dashboard its own
permission, `g14.analytics.read.self`, distinct from `g14.analytics.read`. See
`docs/reviews/full-review-g14-personal-dashboard-self-service.md`'s "Update 2026-07-14" section for
full detail.

## Scope

Per the user's scoping decision (thin personal dashboard, reusing existing G03 leave/attendance
data directly, skipping the new KPI/mart/datamart engine the rest of G14 runs on): this audit
covers only `GET /api/v1/analytics/employees/{id}/dashboard` — own leave balance + own attendance
summary.

**BRD reference:** `docs/brd/v3/G14-dashboard-and-analytics.md` (v3.0). §3.1 role table: "Employee
(Self-Service): View own personal dashboard; no aggregate/other-employee data." §3.2 permission
matrix: "Own personal dashboard: R" for every role including Employee. FR-01 (§934-968) describes
the full dashboard-authoring engine (`dashboard`/`dashboard_widget`/`saved_view` entities,
KPI/saved-report bindings, P01-gated publication) — none of that machinery is in scope here; this
feature satisfies the narrower "Employee: R own personal dashboard" row only.

## Traceability

| Item | BRD evidence | Code evidence | Verdict |
|---|---|---|---|
| Employee can view own personal dashboard | §3.1/§3.2: "View own personal dashboard" — R for Employee | New `AnalyticsService.getMyDashboard(actor, employeeId)`; route `GET /api/v1/analytics/employees/{id}/dashboard` | DONE |
| No aggregate/other-employee data | §3.1: "no aggregate/other-employee data" | Composes only `LeaveService.getBalance`/`listMyAttendance`, both self-or-override gated — no mart/KPI/cohort data touched | DONE |
| Cross-employee ownership enforcement | Same "own... no other-employee data" language | `LEAVE_READ_OVERRIDE_ROLES`, `assertSelfOrLeaveReadOverride` in `leaveService.ts`, applied to both underlying reads | DONE (was a real gap — see Findings) |

## Findings — implementation gaps found and fixed this session

| ID | Severity | Finding | Fix |
|---|---|---|---|
| F1 | HIGH, pre-existing | `LeaveService.getBalance(scope, employeeId, ...)` had **no ownership check at all** — any actor holding `g03.leave.read` (which every self-service employee session already carries) could read any employee's leave balance by passing an arbitrary `employeeId` query parameter on the pre-existing `GET /api/v1/atl/leave-balances` route. Same bug class as every other "tenant-wide read with a caller-supplied employeeId and no ownership check" finding this session (G05, G06, G09). | `getBalance` now `ActorContext`-typed, gated by `assertSelfOrLeaveReadOverride` |
| F2 | N/A (net-new, not a gap) | No self-scoped attendance-summary read existed at all — `LeaveService.listAttendance(scope)` is a tenant-wide admin bulk list with no employee filter, unsuitable for self-service reuse as-is. | New `listMyAttendance(actor, employeeId)`, self-or-override gated, filters `listAttendance`'s result by `employeeId` |

Both were necessary preconditions for building this self-service dashboard safely — found and
fixed during this feature's own implementation, consistent with the pattern established
repeatedly this session.

**Scope note on the self-or-override design**: unlike every other module's override set this
session (which only ever includes `hr_admin`/a dedicated statutory role/`system`), leave-balance
and attendance-summary reads also permit the employee's actual resolved reporting-chain manager
(`AuthorityResolutionService.resolve({mechanism: "REPORTING_CHAIN"})`), not just role-based
override. This was required to avoid regressing three pre-existing tests in
`leave-lifecycle-all-types.test.cjs` that have a manager check a direct report's balance
immediately after deciding their leave application — an established, legitimate usage pattern
predating this feature. This mirrors the exact `assertSelfOrManagerOrOverride` pattern already
used in G05's `transferService.ts`, not a new invention.

## Deferred/out-of-scope gaps (not remediated — outside this use case)

- **`saved_view` personalisation** (BRD E05, FR-01 AC4): "a user can save a personal saved_view
  and set it default." Not built — this thin dashboard has no widget/layout state to save against.
- **The full dashboard-authoring engine** (FR-01: `dashboard`/`dashboard_widget` entities, KPI/
  saved-report bindings, P01-gated publication): explicitly out of scope per the user's "thin"
  scoping decision. The existing `AnalyticsEngineService`/`AnalyticsService` machinery (KPI
  definitions, bitemporal snapshots, k-anonymity cohort suppression) remains untouched and
  continues to serve the admin/executive dashboard surface exactly as before.
- **Auth-matrix permission-string drift**: this route reuses the existing `g14.analytics.read`
  permission (same string the admin executive-dashboard route uses) rather than a dedicated
  self-scoped permission — consistent with the established convention throughout this session
  (reuse one permission string for both admin and self views, self-scope via service logic, e.g.
  G05's `g05.transfer.read`). `docs/contracts/auth-matrix.yaml` was not consulted/amended for this
  narrow addition; the pre-existing, already-documented G14 action-code drift (see the
  cross-cutting `hr_admin` capability survey now informing the next goal) is unaffected by this
  change.

## Verdict

**GAPS-FOUND → remediated within this session's implementation.** One real, pre-existing
cross-employee leave-balance leak (F1) was found and fixed before this report was written. No
unremediated gaps block shipping.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/personal-dashboard-self-service.test.cjs` — 4/4 pass, including
  dedicated regression tests for F1 (cross-employee dashboard denial) and direct-call proof that
  both underlying reads (`getBalance`/`listMyAttendance`) are independently ownership-gated.
- `node --test apps/api/test/*.test.cjs` — full backend suite 678/679 (1 pre-existing unrelated
  skip), including the 3 pre-existing `leave-lifecycle-all-types.test.cjs` tests that exercise the
  manager-reads-a-report's-balance pattern (still pass — confirms the reporting-chain exception is
  correctly wired, not just the strict self-only case).
- `npm run web:typecheck` / `npm run web:test` — clean, 153/153.
- `npx playwright test --workers=1` — full e2e suite 35/35, including the new
  `personal-dashboard-self-service.spec.ts` (2 tests: self-view + unrelated-employee-denial).
