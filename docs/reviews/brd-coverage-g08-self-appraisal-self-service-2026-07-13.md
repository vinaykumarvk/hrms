# BRD Coverage Review — G08 Self-Appraisal Self-Service (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G08-performance-appraisal-management.md` — **scoped subset only**
Scope decision (same principle as prior use cases 3-6): "submit self-appraisal (APAR/PMS) —
annual performance review self-assessment." Covers FR-G08-03 (self-appraisal submission) — not
goal/OKR management (FR-G08-02), RO/RvO tier assessment (FR-G08-04/05), disclosure (FR-G08-08),
representations (FR-G08-09), calibration (FR-G08-10/11), sealed-cover (FR-G08-06/07 admin side),
multi-RO aggregation (FR-G08-18), PIP/probation (FR-G08-19/21), 360-feedback (FR-G08-22), digital
signatures (FR-G08-14/15), or cycle/template/scale masters administration.

Verdict: **GAPS-FOUND** (both the access-control gap and the missing self-assessment content
capture are remediated; per-goal self-rating scale-bound validation is best-effort given no
seeded rating-scale binding, flagged not exhaustively exercised)

## In-scope requirement

**FR-G08-03 — Self-Appraisal Submission** (appraisee: record achievements narrative + per-goal
self-ratings; submit moves the form from GOALS_PENDING to RO_ASSESSMENT)

## What changed this session

- Backend: `apps/api/src/modules/g08/aparService.ts` —
  - `submitSelf()` had **zero** appraisee-identity check — any actor holding
    `g08.apar.self.submit` could submit *any* employee's self-appraisal, including their own
    reporting officer submitting on the appraisee's behalf. This contradicts BRD S3.2's
    permission matrix (appraisee has C/R/U on their own APAR only — not even a resolved manager).
    Added `assertSelfOrOverride()`: self, or an HR/APAR-Cell override role (`hr_admin`,
    `performance_admin`, `system` — BRD S2's "HR/APAR Cell = HR Admin + Performance Admin" role
    mapping), or wildcard. Unlike G07's nomination fix, this deliberately does **not** admit the
    resolved reporting-chain manager — the BRD scopes self-appraisal C/R/U to the appraisee alone.
  - `fileRepresentation()` had the same zero-scoping gap (any permission holder could file a
    representation on any appraisee's behalf); fixed with the same `assertSelfOrOverride()` call,
    even though representation filing itself is out of this use case's named scope — it shares
    the exact vulnerability class and the fix is a one-line, zero-risk addition in the same file.
  - `submitSelf()` previously recorded **no self-appraisal content at all** — it only flipped
    `form.status`, with no narrative or self-ratings, despite BRD AC2 explicitly requiring
    "Achievements narrative mandatory (VAL-REQUIRED); per-goal self-ratings within scale bounds."
    This was a genuine content gap, not just an access-control one: an employee could "submit"
    self-appraisal with zero actual self-assessment recorded. Added a required `narrative` input
    (VALIDATION_FAILED if blank) and an optional `selfRatings` map (validated against the form's
    real goals — VALIDATION_FAILED on an unknown goal id — and, when the form's cycle resolves a
    rating scale, against that scale's min/max bounds). Stored as new `AparForm` fields
    `selfAppraisalNarrative`/`selfAppraisalRatings` (mirrors how `grade`/`sealedCover` already
    live inline on the form rather than a separate table).
  - Added `listMyForms()` — **did not exist in any form before this session**; there was no way
    for an employee to discover their own APAR forms at all (only the tier-action POST routes and
    one admin-aggregate `GET /summary` existed). Appraisee-self or override-role only — deliberately
    narrower than G07's `listMyNominations()`, which also let a manager view their reports': BRD
    S3.2 gives the appraisee R on their own form, not a "my team's appraisals" view (that already
    exists at `/team/apar` via the RO/RvO tier actions).
- Routes: `apps/api/src/routes/g08.routes.ts` — added `GET /api/v1/apar/employees/{id}/forms`;
  updated `:submit-self` to read `narrative`/`selfRatings` from the request body.
  - **Wire-leak fix (same class found and fixed 5 times earlier this session)**: every route
    returning an `AparForm` (`openForm`, `submitSelf`, `recordReporting`, `recordReview`,
    `accept`, `releaseSealedCover`) returned the raw object, leaking `tenantId`, `entityId`,
    `workflowInstanceId`, `documentId`, and `srEventId`. Added `toWireAparForm()` and applied it
    to all 6 pre-existing routes plus the 1 new route, for consistency within the same file/type.
- Frontend: `MyAppraisalPanel.tsx` (new) — lists the appraisee's own APAR forms and lets them
  submit self-appraisal (with a narrative field) directly from any GOALS_PENDING form, no manual
  form-id entry required; wired into a **new** `/me/apar` route (previously APAR only existed at
  `/team/apar`, a tier-action surface requiring manual form-id entry and — per the nav config —
  not even reachable from the "Me" workspace tab a plain employee session grants). Also added a
  narrative textarea to the pre-existing `AparTierForms.tsx` self-appraisal form, since its
  `submitAparSelf()` call now requires one too.
- Client: `hrmsClient.ts`/`fixtureHrmsClient.ts` — added `listMyAparForms`, `AparSelfAppraisalInput`
  type, `periodStart`/`periodEnd`/`selfAppraisalNarrative`/`selfAppraisalRatings` on `AparFormView`;
  updated `submitAparSelf()`'s signature (and both its real and fixture implementations) to take
  the narrative/self-ratings input.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added one open (GOALS_PENDING, no goals) APAR
  form for Rohan, reported on by his real resolved manager Arjun, so "submit self-appraisal" has
  a real seeded form to submit against end-to-end.
- Tests: `apps/api/test/self-appraisal-self-service.test.cjs` (6 tests, real HTTP against
  `seedTestEmployees:true` data) and `apps/web/test/e2e/self-appraisal-self-service.spec.ts` (1
  Playwright test, builds its own form via direct API call against the PH-03 fixture identity to
  avoid the shared seed-flag ripple risk documented in the G10 coverage report). Updated 2
  pre-existing backend test call sites and 2 pre-existing web unit test call sites that called the
  old 2-arg `submitSelf`/`submitAparSelf` signature.

## Post-review fix (full-review, HIGH)

The dispatched `/full-review` found the wire-leak retrofit was incomplete: 4 of the routes that
return `AparForm` (`:lock-goals`, `:disclose`, `:post-sr`, `:aggregate-grade`) were never wrapped
in `toWireAparForm()` despite the coverage claim of "applied to all 7 routes" — live-verified by
the reviewer via `api.dispatch()`, these leaked `tenantId`/`entityId`/`workflowInstanceId` on every
one. The reviewer also found the same leak on the nested sub-objects these routes return
alongside the form (`FormGoalSnapshot`, `DisclosureLogEntry`, `AparReportPeriod`), and on
`fileRepresentation()`'s `AparRepresentation` (touched this session for the identity fix, so
in-scope for the same retrofit). Fixed by adding `toWireGoalSnapshot()`/`toWireDisclosure()`/
`toWireReportPeriod()`/`toWireRepresentation()` helpers alongside `toWireAparForm()` and applying
all five to their respective routes. `addGoal()`'s raw `AparGoal` response (leaking
`tenantId`/`entityId`) is a distinct, pre-existing leak on a route never touched this session
(goal management, FR-G08-02) — left as a flagged, deferred pre-existing gap rather than expanding
scope further, consistent with the G12 precedent of documenting such conventions rather than
silently fixing everything adjacent.

Verified: added a 7th backend test exercising the full lifecycle (open → add goal → lock-goals →
self-submit → report → review → accept → disclose → post-sr → add report-period →
aggregate-grade) via real HTTP, asserting no internal id leaks at any step. Full backend suite
633/634 (1 pre-existing skip), web unit 153/153, and Playwright e2e 25/25 — all pass with zero
regressions.

## Coverage Matrix — FR-G08-03 (self-appraisal submission scope)

| AC | Verdict | Evidence |
|---|---|---|
| AC1 (submittable only when GOALS_PENDING and goals — if any — are locked/snapshotted) | DONE (pre-existing) | `requireStatus`/goals-locked precondition untouched; still enforced |
| AC2 (achievements narrative mandatory; per-goal self-ratings within scale bounds) | **REMEDIATED THIS SESSION** | Was entirely absent (status-flip only, no content); now `narrative` required (400 if blank/missing) and `selfRatings` validated against real goal ids + rating-scale bounds when a scale is resolvable |
| AC3 (submission timestamps, SUBMITTED, advances to RO_ASSESSMENT) | DONE (pre-existing) | Status transition untouched; `selfAppraisalNarrative`/`selfAppraisalRatings` now also persisted |
| AC4 (RO can RETURN with comments; appraisee resubmits) | NOT_FOUND / out of scope | No `:return` action exists for the RO tier in this codebase at all; not named in this use case |
| AC5 (self-appraisal read-only to appraisee once RO begins assessment) | DONE (pre-existing) | `requireStatus(form, "GOALS_PENDING")` on `submitSelf()` already makes a second submit impossible once the form has moved to RO_ASSESSMENT |
| Appraisee C/R/U on own APAR only (BRD S3.2 permission matrix) | **REMEDIATED THIS SESSION** | Was `NOT_FOUND` entirely; now enforced on `submitSelf()`, `fileRepresentation()`, and the new `listMyForms()` — self ✅, HR/APAR-Cell override ✅, even the real resolved RO ❌ (403) |
| Appraisee can discover/browse own APAR forms | **BUILT THIS SESSION** | `listMyForms()` + `GET /api/v1/apar/employees/{id}/forms` + `MyAppraisalPanel` + `/me/apar` route — none existed before |
| Wire responses strip internal tenant/workflow/document linkage ids | **REMEDIATED THIS SESSION** | All 7 AparForm-returning routes now go through `toWireAparForm()` |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| RO `:return` action (AC4) | M | No return-to-appraisee action exists anywhere in the RO tier today; a distinct workflow-stage addition, not named in "submit self-appraisal" |
| Per-goal self-rating scale-bound validation is only exercised when a cycle/rating-scale is actually bound to the form | S | The seeded demo form has no `cycleId` (BRD doesn't require one to submit self-appraisal at all — goals are optional pre-lock); the bound-check path is implemented and unit-reachable in principle but not covered by a dedicated seeded fixture with a bound scale in this pass |
| `recordReporting()`/`recordReview()`/`accept()` (RO/RvO/AA tiers) have no explicit appraisee-identity guard — they rely solely on RBAC permission assignment never granting an employee their own RO/RvO/AA permission | S | Pre-existing (unchanged by this session's diff, confirmed via `git diff HEAD`), and defense-in-depth only — today's role tables never grant an employee `g08.apar.report`/`.review`/`.accept`. Flagged by full-review as a latent hardening gap, not a live exploit; out of this use case's named scope (self-appraisal submission, not RO/RvO/AA tiers) |
| `addGoal()`'s `AparGoal` response leaks raw `tenantId`/`entityId` | S | Same bug class as the routes just fixed, but on a route (`FR-G08-02` goal management) never touched this session — flagged rather than silently expanding scope, consistent with the G12 precedent |

## Scorecard

```
LINE-ITEM COVERAGE (FR-G08-03 self-appraisal submission scope)
================================================================================
Total items audited:        8 (5 ACs + BRD permission matrix + discovery + wire hygiene)
DONE (pre-existing):         3 (AC1, AC3 partial/status-transition, AC5)
REMEDIATED THIS SESSION:      3 (AC2 content capture, appraisee-only scoping, wire-leak fix)
BUILT THIS SESSION (net-new): 1 (form discovery — no prior read surface at all)
NOT_FOUND (deferred):         1 (RO :return action — out of this use case's scope)
```

## Verdict: GAPS-FOUND

The observable use case — an employee can see their own open APAR form, record an achievements
narrative (mandatory, per AC2) and submit their self-appraisal, moving the form to the reporting
officer's desk, while nobody else (not even their real resolved manager) can submit or view it on
their behalf unless they hold an HR/APAR-Cell override role — now works end-to-end against real
seeded data. This use case had **no self-service read surface at all** before this session (only
tier-action POST routes with manual form-id entry existed), and its core write action recorded no
actual appraisal content — both are now real. The RO-return workflow stage is out of this pass's
named scope and explicitly listed rather than silently absent.
