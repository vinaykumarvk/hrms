# Full Review: G14 Personal Dashboard Self-Service

## Update 2026-07-14 (post-review remediation)

Both findings from this review are resolved:

- **F2 (full suite count discrepancy)**: root-caused to a same-session `hr_admin` cross-cutting
  SoD correction (removing `hr_admin` from G06/G07/G09/G11's override-role sets) that broke six
  pre-existing tests in those modules' own test files. All six were updated to assert the correct
  dedicated statutory role (`promotion_officer`/`disciplinary_authority`/`pension_officer`) instead
  of `hr_admin`, and to additionally assert `hr_admin` is now correctly blocked. Full backend suite
  re-verified green: 679/680 (1 pre-existing unrelated skip).
- **F3 (self-service permission reachable the org-wide executive dashboard)**: fixed by splitting
  the personal-dashboard route onto its own permission, `g14.analytics.read.self`, distinct from
  the org-wide `g14.analytics.read` the executive-dashboard/KPI/cohort routes use.
  `getMyDashboard()`'s `authorization.check()` now checks the new permission; `getDashboard()` (and
  every other admin-facing G14 route) is unchanged and still requires `g14.analytics.read`. The
  demo employee session and the `/me/dashboard` route/nav entry were updated to grant/require
  `g14.analytics.read.self` instead. Added a dedicated regression test
  (`personal-dashboard-self-service.test.cjs`, "F3 — holding only the self-service permission does
  not reach the org-wide executive dashboard") proving an actor with only the new permission gets
  403 on `GET /api/v1/analytics/dashboards/executive-readiness` and 200 on their own dashboard.

Full verification re-run: `npm run build` clean; `personal-dashboard-self-service.test.cjs` 5/5;
full backend suite 679/680; `npm run web:typecheck`/`web:test` clean (153/153); full Playwright
e2e suite 35/35 (`--workers=1`).

**Verdict: PASS (post-remediation)**

Original review text preserved below.

---

## Verdict
CONDITIONAL

G14's own implementation is sound: every ownership-scoping enforcement point (dashboard
composition, underlying `getBalance`, underlying `listMyAttendance`) live-verified via
`api.dispatch()` probes beyond the existing 4-test suite — 19 additional adversarial probes
covering query-string parameter injection, role near-misses (`manager`, `line_manager`,
`team_manager`, `reporting_manager`, case-sensitivity variants, `hr_admin_readonly`), the
reporting-chain-manager exception tested in both directions (real manager of a *different*
employee correctly denied; real manager of *their own* report correctly allowed; peers sharing
the same manager correctly denied; report-reads-manager reverse direction correctly denied) — all
passed with no bypass found. `MyDashboardPanel.tsx` has real substance, not a skeleton. F1 from
the BRD-coverage doc is confirmed fixed and holding under this review's additional probing.

The verdict is CONDITIONAL, not PASS, for two reasons outside G14's own diff but inside this
review's required checks:

1. **F2 (HIGH, cross-cutting, not introduced by G14)**: the full backend suite is **672/679**,
   not the 678/679 the BRD-coverage doc's Verification section claims — 6 pre-existing failures in
   `disciplinary-case-self-service.test.cjs` (3), `personal-dashboard...` unrelated files
   (`pension-projection-self-service.test.cjs` embedding a G11 pension override-role assertion),
   and `promotion-posting-self-service.test.cjs`/sealed-cover tests, all failing because a
   same-session "hr_admin capability audit" removed `hr_admin` from G06/G09/G11's override-role
   sets while those modules' own committed tests still assert `hr_admin` gets 200. This is not a
   G14 regression (G14's own `LEAVE_READ_OVERRIDE_ROLES` correctly keeps `hr_admin`, and G14's own
   4/4 tests pass), but it means the BRD-coverage doc's "full backend suite 678/679" verification
   claim is inaccurate against the actual current tree state, which this review was asked to
   independently confirm.
2. **F3 (MEDIUM, pre-existing, confirmed live, worth recording)**: the `workspace.admin` /
   `workspace.me` split that keeps a self-service employee out of `/admin/analytics` is enforced
   **only in the frontend** (`apps/web/src/App.tsx`'s `renderRoute`, gated on
   `workspace.${workspace}` before the route switch). At the **API layer**, `g14.analytics.read`
   alone is sufficient to call `GET /api/v1/analytics/dashboards/executive-readiness` (the
   org-wide executive dashboard) directly — confirmed live, see Findings. This is a pre-existing,
   repo-wide architectural pattern (permission strings are deliberately reused across `/me` and
   `/admin` views per the BRD-coverage doc's own note), not something this G14 change introduced,
   but the task explicitly asked to verify this boundary live and it does not hold at the API
   layer — only in the UI.

## Scope
- **Target**: G14 Personal Dashboard Self-Service (`/me/dashboard`) — the thin read composing own
  leave balance + own attendance summary via `GET /api/v1/analytics/employees/{id}/dashboard`,
  deliberately not touching the G14 KPI/mart/datamart engine, per the BRD-coverage doc's scope
  decision.
- **Selected path**: Light/standard hybrid — reviewing an already-implemented, already-audited
  self-service slice; no new implementation performed (report-only, per full-review no-fix
  default).
- **Files reviewed**:
  - `apps/api/src/modules/g03/leaveService.ts` (diff: `LEAVE_READ_OVERRIDE_ROLES`; hardened
    `getBalance(actor, employeeId, ...)` — was `getBalance(scope, ...)` with zero ownership check
    (F1); `isLeaveReadOverride`/`assertSelfOrLeaveReadOverride` using `AuthorityResolutionService`
    for the reporting-chain-manager exception; new `listMyAttendance(actor, employeeId)`, same
    gate; unrelated in the same diff — `ATTENDANCE_REGULARISE_OVERRIDE_ROLES` SoD maker/checker
    gate on `regulariseAttendance`, out of this review's G14 scope but confirmed not to interact
    with the dashboard read path)
  - `apps/api/src/platform/foundationServices.ts` (wires `AuthorityResolutionService` into
    `LeaveService`'s constructor; wires `LeaveService` into `AnalyticsService`'s constructor; test
    employee seeding — `seedTestEmployees` option — used to build the live probe fixtures below)
  - `apps/api/src/modules/g14/analyticsService.ts` (new `PersonalDashboard` interface; new
    `getMyDashboard(actor, employeeId)` composing `leave.getBalance` + `leave.listMyAttendance`
    under a single `g14.analytics.read` check, delegating ownership enforcement to `LeaveService`
    rather than duplicating it)
  - `apps/api/src/routes/g03.routes.ts` (leave-balances route now passes `context.actor`, not
    `context.scope`, into the hardened `getBalance`; unrelated `toWireAttendance` wire-stripping
    helper in the same diff for the SoD `capturedByUserId` field, out of G14 scope)
  - `apps/api/src/routes/g14.routes.ts` (new `GET /api/v1/analytics/employees/{id}/dashboard`
    route, `g14.analytics.read` permission, same string the existing admin
    `/api/v1/analytics/dashboards/executive-readiness` route uses)
  - `apps/web/src/modules/g14/MyDashboardPanel.tsx` (new self-service panel)
  - `apps/web/src/api/hrmsClient.ts` / `apps/web/src/api/fixtureHrmsClient.ts` (new
    `PersonalDashboardView` type, `getMyDashboard` method)
  - `apps/web/src/App.tsx`, `apps/web/src/app/navigation.ts`, `apps/web/src/app/session.ts` (new
    `/me/dashboard` route + nav entry + demo session `g14.analytics.read` permission)
  - `apps/api/test/personal-dashboard-self-service.test.cjs` (4 backend tests)
  - `apps/web/test/e2e/personal-dashboard-self-service.spec.ts` (2 Playwright tests)
- **Artefacts used**:
  `docs/reviews/brd-coverage-g14-personal-dashboard-self-service-2026-07-14.md` (read in full
  before this review; its F1 HIGH finding — `LeaveService.getBalance` had zero ownership check —
  and the design note on the reporting-chain-manager exception are treated as known and not
  re-reported below except where this review found the fix incomplete — it is not).
  `docs/reviews/full-review-g09-disciplinary-case-self-service.md` consulted as the reference
  report structure. `apps/api/src/platform/authority-resolution/authorityResolutionService.ts`
  read directly to confirm `REPORTING_CHAIN` resolution semantics (uses
  `employee_job_assignments.reporting_manager_id`, falls back to `positions.reports_to_position_id`
  chain walk). `apps/api/src/seed/testEmployeesSeed.ts` read directly to identify a real,
  non-shared manager relationship (Arjun manages Rohan only; Sunita/Meera/Devika/Priya all report
  to the pre-existing PH-03 manager) usable to probe the "manager of a different employee" case
  precisely.

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Read BRD-coverage doc for prior findings/deferrals | Yes | 1 remediated finding (F1, HIGH) + 1 net-new-capability note (F2) + 1 design note (reporting-chain exception) | `docs/reviews/brd-coverage-g14-personal-dashboard-self-service-2026-07-14.md` |
| Static diff review of `leaveService.ts`/`analyticsService.ts`/routes | Yes | Consistent self-or-override-or-reporting-chain-manager pattern; `getMyDashboard` correctly delegates ownership enforcement to `LeaveService` rather than duplicating a second gate | `apps/api/src/modules/g14/analyticsService.ts:162-186` |
| Read `AuthorityResolutionService.resolveReportingChain` directly | Yes | Confirmed real resolution: `employee_job_assignments.reporting_manager_id` primary source, `positions.reports_to_position_id` chain-walk fallback — not role-name matching of any kind | `apps/api/src/platform/authority-resolution/authorityResolutionService.ts:189-216` |
| Live probe: existing regression suite | Yes | PASS 4/4 | `apps/api/test/personal-dashboard-self-service.test.cjs` |
| **New** live probe: stranger (no reporting relationship) denied dashboard | Yes | PASS 403 | scratchpad `g14-probe.js` check 1 |
| **New** live probe: stranger denied via `employeeId` query-param spoofing on `/api/v1/atl/leave-balances` | Yes | PASS 403 | scratchpad `g14-probe.js` check 2 |
| **New** live probe: stranger denied calling `listMyAttendance` directly with a spoofed `employeeId` | Yes | PASS — throws `FORBIDDEN` | scratchpad `g14-probe.js` check 3 |
| **New** live probe: actor merely holding role `"manager"` (no real reporting-chain link) denied | Yes | PASS 403 | scratchpad `g14-probe.js` check 4 |
| **New** live probe: near-miss role strings (`line_manager`, `team_manager`, `reporting_manager`, `hr_admin_readonly`, `leave_admin_readonly`, `HR_ADMIN`, `LEAVE_ADMIN` case variants) | Yes | PASS — none treated as override; case-sensitive exact match only | scratchpad `g14-probe.js` checks 4b (7 sub-checks) |
| **New** live probe: real resolved manager (Arjun) reads his actual direct report's (Rohan) dashboard | Yes | PASS 200 — reporting-chain exception correctly grants access to the real relationship | scratchpad `g14-probe.js` check 5 |
| **New** live probe (critical): the same manager (Arjun) attempts to read an **unrelated** employee's (Sunita's) dashboard using the reporting-chain exception — Arjun manages Rohan, not Sunita | Yes | PASS 403 — confirms the exception is scoped per-subject-employee via `resolve({subjectEmployeeId})`, not a blanket "any manager may read any report" grant | scratchpad `g14-probe.js` check 6 |
| **New** live probe: same check at the `LeaveService.getBalance` call site directly (bypassing the dashboard composition layer) | Yes | PASS — throws `FORBIDDEN` | scratchpad `g14-probe.js` check 6b |
| **New** live probe: reverse direction — the report (Rohan) attempts to read his manager's (Arjun's) dashboard | Yes | PASS 403 — a reporting-chain edge is not bidirectional access | scratchpad `g14-probe.js` check 7 |
| **New** live probe: two peers (Sunita, Meera) sharing the same manager attempt to read each other's dashboards | Yes | PASS 403 — a shared manager does not grant peer-to-peer access | scratchpad `g14-probe.js` check 8 |
| **New** live probe: the actual shared manager (PH-03 manager) reads a real report's (Sunita's) dashboard | Yes | PASS 200 | scratchpad `g14-probe.js` check 9 |
| **New** live probe: actor with no roles at all, holding only `g14.analytics.read`, denied | Yes | PASS 403 | scratchpad `g14-probe.js` check 10 |
| **New** live probe: does `g14.analytics.read` alone grant the **admin** org-wide route (`/api/v1/analytics/dashboards/executive-readiness`) at the API layer? | Yes | **200 — yes, it does.** The `workspace.admin` separation exists only in `apps/web/src/App.tsx`'s frontend route guard, not as a distinct backend permission/authorization check | scratchpad `g14-probe.js` check 11; independently re-confirmed in `g14-workspace-check.js` |
| Nav/session/route wiring cross-check | Yes | `/me/dashboard` nav entry requires `g14.analytics.read`; demo session grants it but does **not** grant `workspace.admin`, so the `/admin/analytics` UI route is blocked client-side | `apps/web/src/app/navigation.ts:36`, `apps/web/src/app/session.ts:16-28`, `apps/web/src/App.tsx:180-184` |
| `MyDashboardPanel.tsx` component-substance / anti-skeleton check | Yes | PASS — real `useEffect`-driven fetch via `client.getMyDashboard(employeeId)`, real `loading`/`error`/`ready` state machine, real data rendering (leave balance figures, attendance figures), refetches on `refreshToken` change, no hard-coded/mock data | `apps/web/src/modules/g14/MyDashboardPanel.tsx:31-81` |
| `npm run build` | Yes | PASS, clean | command output empty (success) |
| `node --test apps/api/test/personal-dashboard-self-service.test.cjs` | Yes | PASS 4/4 | `# tests 4 / # pass 4 / # fail 0` |
| Full backend suite `node --test apps/api/test/*.test.cjs` | Yes | **FAIL 672/679** (6 failing, 1 pre-existing unrelated skip) — see Findings F2 | `# tests 679 / # pass 672 / # fail 6 / # skipped 1`, reproduced twice |
| `npm run web:typecheck` | Yes | PASS, no errors | command output empty (success) |
| `npm run web:test` | Yes | PASS 153/153 | `# tests 153 / # pass 153 / # fail 0` |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F2 | HIGH | Test suite integrity (cross-cutting, not G14-caused) | `apps/api/test/disciplinary-case-self-service.test.cjs:74-121,182`; `apps/api/test/pension-projection-self-service.test.cjs`; `apps/api/test/promotion-posting-self-service.test.cjs`; sealed-cover test | The BRD-coverage doc's Verification section claims "full backend suite 678/679 (1 pre-existing unrelated skip)". Live re-run of `node --test apps/api/test/*.test.cjs` (twice, reproducibly) shows **672/679, 6 failing**. Root cause: a same-session, in-flight "hr_admin capability audit" removed `hr_admin` from G06/G09/G11's `*_ACCESS_OVERRIDE_ROLES` sets (comments: "Post-hr_admin-goal SoD correction: hr_admin deliberately excluded"), but those modules' own already-committed test files still assert `hr_admin` gets 200. G14's own diff is unaffected — `LEAVE_READ_OVERRIDE_ROLES` correctly retains `hr_admin`, and G14's own 4/4 tests pass. | `node --test apps/api/test/*.test.cjs` output: `not ok 26/27/30` (G09), `not ok 59` (G11), `not ok 621/624` (G06); confirmed standalone with `node --test apps/api/test/disciplinary-case-self-service.test.cjs` → 5/8 (3 fail), reproducible | Not a G14 fix — route to whichever goal owns the hr_admin capability audit: either restore `hr_admin` to G06/G09/G11's override sets, or update those modules' tests/BRD-coverage docs to match the new SoD boundary. Out of this review's implementation-repair scope (touches other modules' contracts, not G14). | No (cross-module scope; requires amendment decision, not a G14 implementation repair) |
| F3 | MEDIUM | Authorization / defense-in-depth | `apps/web/src/App.tsx:180-184` (frontend-only gate); `apps/api/src/routes/g14.routes.ts:30-34` (no backend gate) | The `workspace.admin` vs `workspace.me` separation that is supposed to keep a self-service employee out of the org-wide `/admin/analytics` executive dashboard is enforced **only in the React shell**. At the API layer, any actor holding `g14.analytics.read` (which the demo employee session now has, to support `/me/dashboard`) can call `GET /api/v1/analytics/dashboards/executive-readiness` directly and get a 200 with the full org-wide dashboard payload — confirmed live. | scratchpad `g14-probe.js` check 11 (200); independently reconfirmed in `g14-workspace-check.js` (200) | This is a pre-existing, repo-wide pattern (every module in this session reuses one permission string across `/me` and `/admin` views, per the BRD-coverage doc's own note), not introduced by G14 — but granting `g14.analytics.read` to a self-service demo session for the first time (previously no employee-facing UI used this permission) is the first point where this gap becomes reachable by a real self-service actor rather than only an admin actor. Recommend either a distinct `g14.analytics.read.self` permission for the personal-dashboard route, or a backend-side check equivalent to `workspace.admin` on the executive-readiness route, so the boundary is not UI-only. | Yes, if `--fix high+`/`--fix all` is requested — but treat as a policy decision (new permission string vs. backend workspace check) rather than a pure bug fix; flagging for explicit decision rather than silently repairing. |

No new findings on the G14 ownership-gate logic itself — all 19 additional adversarial probes
(including the reporting-chain-manager exception tested in both directions and against an
unrelated employee) passed with no bypass found. F1 from the BRD-coverage doc (`getBalance` zero
ownership check) is confirmed fixed and holding.

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyDashboardPanel` | `apps/web/src/modules/g14/MyDashboardPanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` (props) | `client.getMyDashboard(employeeId)` — single real call, no mock data | Real `<dl>` rendering of `leaveBalance.availableBalance`/`currentBalance`/`leaveYear`/`leaveTypeId` and `attendanceSummary.presentDays`/`totalRecords`/`regularisedDays`, all sourced from the live response, not hard-coded | **Real component** — full `loading`/`error`/`ready` state machine (`MyDashboardState` discriminated union), refetches on `employeeId`/`refreshToken` change via `useEffect` dependency array, mount-guard (`mounted` flag) against stale-state races, real error-code surfacing (`HrmsApiError.displayCode`) |

## Traceability impact

No traceability changes required from this review — it is report-only. The BRD-coverage doc's
traceability table remains accurate for G14's own scope. F2 is a cross-module test/contract
inconsistency that does not change G14's own BRD traceability but does mean the BRD-coverage doc's
Verification section for G14 should be corrected to reflect the actual full-suite count (672/679,
not 678/679) — recommend a follow-up amendment to that doc's Verification section, not a rewrite
of its Findings/Traceability tables (those remain correct).

## Required amendments

- **F2**: requires a decision at the level of the "hr_admin capability audit" goal (whichever
  session/goal made that repo-wide SoD decision), not a G14-scoped implementation repair: either
  restore `hr_admin` to `PENSION_ACCESS_OVERRIDE_ROLES` / `PROMOTION_ACCESS_OVERRIDE_ROLES` /
  `SEALED_COVER_ACCESS_OVERRIDE_ROLES` / `DISCIPLINARY_ACCESS_OVERRIDE_ROLES`, or amend
  `disciplinary-case-self-service.test.cjs`, `pension-projection-self-service.test.cjs`,
  `promotion-posting-self-service.test.cjs` and their sealed-cover coverage plus the
  previously-PASSed `full-review-g09-disciplinary-case-self-service.md` verdict to match the new
  SoD boundary.
- **F3**: requires a policy decision — add a distinct self-scoped permission string
  (`g14.analytics.read.self` or similar) or add a backend-side `workspace.admin`-equivalent check
  on the executive-readiness route — before this can be closed as a pure implementation repair.

## Verification commands

```bash
npm run build
node --test apps/api/test/personal-dashboard-self-service.test.cjs
node --test apps/api/test/*.test.cjs   # full backend suite
npm run web:typecheck
npm run web:test
```

Results as run in this review: `build` clean; targeted suite 4/4; **full backend suite 672/679, 6
failing (not the 678/679 the BRD-coverage doc claims)** — see F2; `web:typecheck` clean; `web:test`
153/153. Additionally, one ad hoc adversarial `api.dispatch()` script (not part of the committed
test suite) ran 19/19 pass — covering parameter injection, role/permission near-misses, and both
directions of the reporting-chain-manager exception including the critical "manager of a different
employee" case.

## Remaining risks

- **F2** leaves 6 tests red in the full suite across three other modules (G06, G09, G11). This
  does not block G14 specifically, but it means "run the full backend suite" cannot currently be
  used as a clean regression gate for *any* feature merged on top of this branch until resolved.
- **F3** is a real defense-in-depth gap that predates this feature but becomes newly reachable by
  a self-service actor now that `g14.analytics.read` is granted to an employee-level demo session
  for the first time. No org-wide/aggregate/cohort data was observed to leak through the personal
  dashboard route itself (`getMyDashboard` only ever returns `leaveBalance`/`attendanceSummary`
  scoped to the requested `employeeId`, and that `employeeId` is itself gated) — the risk is
  specifically that the same session token can also reach the *separate* executive-readiness
  endpoint by calling it directly (not through the UI), bypassing the `workspace.admin` UI gate
  entirely.
- The Playwright e2e spec (`personal-dashboard-self-service.spec.ts`) was reviewed statically only
  (no browser runtime available in this session); its assertions and flow are consistent with the
  panel's actual API surface and route wiring, but end-to-end browser execution was not
  independently re-verified here.
- This review's 19-probe adversarial script is not committed to the repository (ad hoc
  verification only); the existing 4-test suite already covers the primary self/stranger/override
  contrast, but does not cover the "manager of a different employee" or "reverse direction" or
  "peer sharing the same manager" cases this review added — consider promoting at least the
  "manager of a different employee" case (probe 6) into the committed suite, since it is the single
  most important adversarial case for the reporting-chain-manager exception's whole design
  rationale.
