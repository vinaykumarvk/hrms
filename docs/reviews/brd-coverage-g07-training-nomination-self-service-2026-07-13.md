# BRD Coverage Review — G07 Training Nomination Self-Service (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G07-training-skill-development.md` — **scoped subset only**
Scope decision (same principle as prior use cases): "apply for training / view nominations —
browse available programs, nominate or get nominated, track completion." Covers FR-G07-009
(nomination & approval) and the self-service-relevant slice of FR-G07-007/010 (catalog browse,
completion outcome) — not skill taxonomy/competency modeling (FR-001–004), training calendar/budget
admin (FR-006), full attendance-capture/kiosk/offline flows (FR-010's non-outcome ACs), assessment/
Kirkpatrick evaluation (FR-011), campaigns (FR-017), vendor empanelment (FR-019), sponsorship/bond
(FR-020), or external credentials (FR-018).

Verdict: **GAPS-FOUND** (the core security gap — no scope check on who can nominate/complete on
whose behalf — is remediated across nominate + a newly-added self-service read; one pre-existing
BRD-cited business rule, session-uniqueness, is flagged, not fixed)

## In-scope requirement

**FR-G07-009 — Nomination & Multi-Level Approval Workflow** (self-service half: AC1's self/manager/
L&D scoping, plus the completion-outcome authorization drawn from FR-G07-010)

## What changed this session

- Backend: `apps/api/src/modules/g07/trainingService.ts` —
  - `nominate()` had **zero** scoping — any actor holding `g07.nomination.submit` could nominate
    *any* employee, contradicting BRD AC1 ("An employee can self-nominate; a manager can nominate
    reports; L&D/HR can nominate anyone in scope"). Added `assertCanNominate()`: self, or the
    actor is the target's resolved REPORTING_CHAIN manager (reusing
    `AuthorityResolutionService`, the same mechanism the adjacent `workflow.start()` call already
    uses to route L1 approval — so "can nominate" and "who approves" agree), or an override role
    (`ld_manager`, `ld_officer`, `hr_admin`, `system`), or wildcard.
  - `completeNomination()` had **zero** scoping either — any actor with `g07.nomination.complete`
    could mark any nomination passed/failed, including the nominee marking their own. BRD
    FR-G07-010's authorization model ("Trainer own session; L&D any") never contemplates
    self-completion. Added `assertCanRecordCompletion()`: override role only (`trainer`,
    `ld_manager`, `ld_officer`, `hr_admin`, `system`, or wildcard) — the nominee can never
    self-attest their own outcome.
  - **`approveNomination()` needed no fix** — it already routes through
    `HrmsWorkflowService.actOnInstance()`, which this session's *first* platform-wide fix (from
    the leave-approval use case) already protects with resolved-approver enforcement. Verified
    empirically (a non-approver actor is rejected with `FORBIDDEN`) before assuming a fix was
    needed here — the initial survey's claim that this method was unprotected was incorrect; it
    didn't account for the earlier session-wide fix.
  - Added `listSessions()` and `listMyNominations()` — **neither existed in any form before this
    session**, not even without scoping. There was no way for an employee to browse programs or
    see their own nomination history at all; only `POST` (nominate/approve/complete) and one
    admin-aggregate `GET /summary` existed.
  - `TrainingService`'s constructor gained an `AuthorityResolutionService` dependency (wired in
    `foundationServices.ts`); the only call site, confirmed via grep.
- Routes: `apps/api/src/routes/g07.routes.ts` — added `GET /api/v1/training/sessions` and
  `GET /api/v1/training/employees/{id}/nominations`.
- Frontend: `MyTrainingPanel.tsx` (new) — browse sessions + track my nominations; wired into a
  **new** `/me/training` route (previously training only existed at `/team/training`, a
  manager/admin summary+nominate-anyone surface, left unchanged). `TrainingNominationForm.tsx`
  gained an `onSubmitted` callback so the self-service page refreshes after a nomination.
- Client: `hrmsClient.ts`/`fixtureHrmsClient.ts` — added `listTrainingSessions`,
  `listMyTrainingNominations`, `TrainingSessionView` type.
- Bug fix (same class as the leave-module one from earlier this session): the demo employee
  session (`apps/web/src/app/session.ts`) granted `g07.training.nominate`, but the actual runtime
  permission checked everywhere in the code is `g07.nomination.submit` — the demo employee could
  never nominate (self or otherwise) through the real running app before this fix.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added one open session ("Leadership
  Fundamentals") and one real self-nomination-then-approval for Devika, so "browse programs" and
  "track completion" have genuine seeded data.
- Tests: `apps/api/test/training-nomination-self-service.test.cjs` (6 tests, real HTTP against
  `seedTestEmployees:true` data — including a positive case proving a manager CAN nominate their
  real resolved report, and a dedicated wire-leak regression test) and
  `apps/web/test/e2e/training-nomination-self-service.spec.ts` (1 Playwright test, builds its own
  session via direct API call to avoid the shared seed-flag ripple risk documented in the G10
  coverage report).

## Post-review fix (full-review F1, CRITICAL)

The dispatched `/full-review` found both new routes (`GET /api/v1/training/sessions`,
`GET /api/v1/training/employees/{id}/nominations`) leaked internal `tenantId`/`entityId` (and the
nominations route additionally leaked `workflowInstanceId`, an internal P01 linkage id) on the
wire — the same recurring anti-pattern fixed 4 times earlier this session in other modules. Fixed
by adding `toWireSession()`/`toWireNomination()` stripping helpers in `g07.routes.ts`, applied to
the 2 new routes and retrofitted onto the 3 pre-existing nominate/approve/complete routes for
consistency. Verified: full backend suite 626/627 (1 pre-existing skip) with zero regressions, a
new dedicated regression test asserting the fields are absent from both routes' responses, plus a
full web unit (153/153) and Playwright e2e (24/24) pass with zero regressions.

## Coverage Matrix — FR-G07-009 (self-service scope)

| AC | Verdict | Evidence |
|---|---|---|
| AC1 (self-nominate / manager-nominates-reports / L&D-nominates-anyone) | **REMEDIATED THIS SESSION** | Was `NOT_FOUND` entirely (flat permission only); now enforced and tested: self ✅, real resolved manager ✅, unrelated employee ❌ (403), override role ✅ |
| AC2 (P01 routes PENDING_L1→PENDING_L2→APPROVED) | DONE (pre-existing) | `approveNomination()`'s workflow routing untouched; already protected by this session's earlier platform-wide P01 approver-identity fix |
| AC3 (capacity decrement, atomic; WAITLISTED with position) | DONE (pre-existing) | `approveNomination()` capacity logic untouched |
| AC4 (budget commit on approval) | NOT_FOUND / out of scope | No budget-commit logic found in `approveNomination()`; FR-016 budget integration not exercised by this use case |
| AC5 (withdrawal frees a seat, promotes waitlist) | NOT_FOUND / out of scope | No withdraw endpoint found for training nominations (unlike leave/attendance); not named in this use case |
| AC6 (P05-audited waitlist promotion) | N/A | Depends on AC5 |
| Business rule: `nominated_by ≠ approver` (SoD) | DONE (pre-existing) | Covered by the same P01 platform fix as AC2 |
| Business rule: `UNIQUE(session, employee)` | **NOT_FOUND — flagged, not fixed** | Confirmed by direct test: a second nomination for the same (session, employee) pair succeeds (201) rather than 409. Pre-existing gap, unrelated to the scoping fix; a data-integrity concern (duplicate enrolment/waitlist entries) rather than an access-control one. Deferred — fixing it well means auditing the nominate() precondition logic and is a distinct, self-contained change. |
| FR-G07-010 authorization ("Trainer own session; L&D any" — never the nominee) | **REMEDIATED THIS SESSION** | Was `NOT_FOUND`; now enforced (nominee 403, `ld_officer` 202) |
| Browse available programs (FR-G07-007 read slice) | **BUILT THIS SESSION** | `listSessions()` + `GET /api/v1/training/sessions` + `MyTrainingPanel` — none existed before |
| Track completion / nomination history | **BUILT THIS SESSION** | `listMyNominations()` + `GET /api/v1/training/employees/{id}/nominations` + `MyTrainingPanel` — none existed before |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| `UNIQUE(session, employee)` not enforced | S | Pre-existing, distinct data-integrity gap unrelated to the access-control fix; a real BRD business rule, not silently ignored |
| Budget commit/insufficient-budget block (AC4) | M | Depends on FR-016 budget module integration, out of this use case's named scope |
| Withdrawal + waitlist promotion (AC5/AC6) | M | Not named in "apply for training / view nominations... track completion"; no withdraw endpoint exists for training at all today |

## Scorecard

```
LINE-ITEM COVERAGE (FR-G07-009 self-service scope + FR-G07-010 authorization)
================================================================================
Total items audited:        9 (6 ACs + 2 business rules + FR-010 authorization)
DONE (pre-existing):         3 (AC2, AC3, SoD business rule)
REMEDIATED THIS SESSION:      2 (AC1, FR-010 authorization)
BUILT THIS SESSION (net-new): 2 (browse programs, track completion — no prior read surface at all)
NOT_FOUND (deferred):         2 (UNIQUE constraint, budget/withdrawal — the latter two out of scope)
```

## Verdict: GAPS-FOUND

The observable use case — an employee can browse open training sessions, self-nominate (and a real
manager can nominate their real reports, verified against the resolved reporting chain, not a
guess), see their nomination history and status, while an unrelated employee is blocked and only a
trainer/L&D/admin role can record a pass/fail outcome — now works end-to-end against real seeded
data. This use case had the *least* pre-existing self-service surface of the 6 covered so far this
session (no read routes existed in any form), making this the largest net-new build alongside the
scoping fix. The duplicate-nomination integrity gap and budget/withdrawal flows are explicitly
listed as out of this pass's scope rather than silently absent.
