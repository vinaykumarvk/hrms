# BRD Coverage Review — G11 Pension/Retirement Projection Self-Service (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G11-retirement-and-pension.md` — **scoped subset only**
Scope decision (same principle as prior use cases 3-9): "check pension/retirement projections —
for employees nearing retirement, view estimated benefits." Covers the self-service estimator
half of FR-G11-15 (Retirement Self-Service Portal & Benefit Estimators / What-If) — not separation
case management, qualifying-service computation/SR verification, commutation/gratuity/family-
pension admin engines, PPO issuance, pension revision batches, rule-table administration, pensioner
lifecycle (life certificates/death/family conversion), disbursement/PDA/treasury integration,
grievances, audit objections, or the LC-calendar/bereavement-guide slices of FR-G11-15 itself.

Verdict: **GAPS-FOUND** (the entire self-service estimator did not exist — no route, no self-vs-
other authorization anywhere in the module, no frontend, no session permission; all built this
session, with a deliberately narrow new permission to avoid the cross-employee exposure class this
session's own G05/G13 full-reviews caught)

## In-scope requirement

**FR-G11-15 AC1/AC2** (self-service scope): "estimators label results indicative/non-binding
(`is_binding=false`) and never write to the live case"; "what-if can vary commutation fraction,
emoluments, and date, recomputing all headline figures." Plus a minimal "track status" surface
for an employee who already has a real pension case.

## What changed this session

- Backend: `apps/api/src/modules/g11/pensionService.ts` —
  - Added `estimateBenefits()` — a genuinely non-binding what-if estimator. It reuses the exact
    same scheme-branch calculator (`computeSchemeBenefit()`, the pure function the live
    `computeBenefits()` case-bound flow also calls) but never touches `this.cases` or persists
    any row, satisfying AC1 literally rather than by convention. Qualifying service defaults to
    (employee's real date of joining → the requested `asOf` date) when not supplied; emoluments
    default to the employee's real G10 last-drawn-pay feed (`PayrollService.getLastPayDrawn`)
    when not supplied — both overridable per-call for the AC2 what-if (vary commutation fraction/
    emoluments/date).
  - Added `listMyCases()` — self-service "track status" discovery, mirroring the `listMyX()`
    pattern from every prior feature this session (G07/G08/G13/G05).
  - Added `assertSelfOrOverride()`/`PENSION_ACCESS_OVERRIDE_ROLES` (`hr_admin`, `pension_officer`,
    `system`) — this module had **zero** self-vs-other authorization anywhere before this session;
    every existing admin method (`createCase`, `verifyService`, `computeBenefits`, `sanction`,
    `issuePpo`, and the pensioner-lifecycle/benefit/revision/rule services) only ever checked a
    coarse RBAC permission, never `actor.userId` against the case/pensioner's `employeeId`. Those
    admin methods are deliberately left as-is (out of this pass's named scope — they require
    elevated permissions the self-service session never holds; see Deferred Gaps), but the two new
    self-service methods enforce ownership from the start.
  - **Deliberate permission design decision, informed by this session's own G05/G13 full-review
    findings**: the new methods check a distinct `g11.pension.self.read` permission, NOT the
    existing `g11.pension.read` that gates ~20 admin GET routes module-wide (case reads, pensioner
    reads, disbursement/PDA reads, etc. — none of which have a per-row ownership check). Granting
    the broad `g11.pension.read` to the self-service demo session would have immediately exposed
    every one of those unscoped admin routes to the plain employee — the exact cross-employee
    exposure class this session's G05 and G13 full-reviews both found when a shared permission was
    granted to a self-service actor without checking what else it unlocked. Using a new, narrower
    permission avoids repeating that mistake a third time.
- Routes: `apps/api/src/routes/g11.routes.ts` — added `POST /api/v1/pension/estimates` and
  `GET /api/v1/pension/employees/{id}/cases`.
  - **Wire-leak fix (same class fixed 7 times earlier this session)**: this module had no
    `toWireX()` helper at all. Added `toWirePensionCase()` (strips `tenantId`/`entityId`) and
    applied it to the 2 new routes plus all 5 pre-existing routes returning a `PensionCase`
    (create, verify-service, compute, sanction, issue-ppo) — enumerated via a grep of every
    `pensionCase:` occurrence in the file, not assumed complete from memory.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added `seedTestPensionEstimate()`: real E30
  (rounding) and E35 (pension-limit) rule rows, plus a full `PayrollService` salary-structure →
  run → disburse lifecycle for Arjun (a **separate** substrate from the `PayrollEngineService` the
  G10 payslip self-service feature seeded earlier — the two payroll services are independent
  in-memory stores with no shared data), so `estimateBenefits()` has real last-drawn-pay to default
  from rather than requiring every caller to supply a fixture number.
- Bug fix (same class as prior features): the demo employee session
  (`apps/web/src/app/session.ts`) had **zero** `g11.*` permissions — added
  `g11.pension.self.read` only (deliberately not the broad `g11.pension.read`, per the reasoning
  above).
- Frontend: `MyPensionEstimatePanel.tsx` (new) — a what-if form (scheme, projection date, optional
  qualifying-service/emoluments overrides) showing the non-binding result, plus a "My Pension
  Cases" tracker; wired into a **new** `/me/pension` route (the pre-existing `/admin/pension-
  retirement` route — `PensionWorkspace`/`PensionCaseConsole` — is untouched and remains on the
  broad `g11.pension.read` permission, confirmed still inaccessible to the self-service session by
  a dedicated e2e regression test). `hrmsClient.ts`/`fixtureHrmsClient.ts` — added
  `runMyPensionEstimate`, `listMyPensionCases`, `PensionSelfEstimateInput`/`PensionSelfEstimateResult`
  types (kept distinct from the pre-existing case-bound `estimatePensionBenefits`/
  `PensionEstimateInput` to avoid confusing the two different endpoints).
- Tests: `apps/api/test/pension-projection-self-service.test.cjs` (5 tests: self-estimate using
  real seeded last-drawn pay, non-binding — never creates a case, what-if variation + cross-
  employee 403, self-vs-cross-employee 403 + hr_admin override on the cases list, asOf validation)
  and `apps/web/test/e2e/pension-projection-self-service.spec.ts` (2 Playwright tests: an employee
  runs a real what-if estimate live through the UI — seeding only the tenant-wide E35/E36 rule
  rows via direct API call, since the estimator's own what-if design means no per-employee seed
  data is required when emoluments/qualifying-service are supplied directly; and a regression
  guard confirming the pre-existing admin console remains inaccessible to the self-service session).

## Post-review fix (full-review, CONDITIONAL)

The dispatched `/full-review` was, notably, the first review this session where the headline
design decision (the new narrow `g11.pension.self.read` permission, deliberately kept separate
from the broad `g11.pension.read` that gates ~20 unscoped admin routes) held up completely under
live adversarial testing — the reviewer built the backend and probed every reachable admin GET
route with an actor holding only the new permission; all returned 403. It did find one real HIGH
finding:

**`estimateBenefits()` accepted caller-supplied `qualifyingServiceMonths`/`emolumentsBaseCents`
with zero bounds validation.** Live-verified by the reviewer: a negative `emolumentsBaseCents`
(e.g. -85,00,000) returned `201` with `pensionCents` silently clamped to the E35 minimum-pension
floor — a nonsensical input reported back as an ordinary successful result rather than rejected.
Root cause: `computeSchemeBenefit()` is a shared pure function previously only ever fed trusted
internal payroll data; this self-service estimator is the first caller to pipe raw HTTP-body
numbers into it, and the trust boundary shifted without new validation at the new entry point.

Fixed: `qualifyingServiceMonths` must now be an integer in [0, 600] (50 years) when supplied;
`emolumentsBaseCents` must be a positive integer when supplied — both reject with
`VALIDATION_FAILED` rather than silently clamping. Added matching `min`/`max` HTML attributes to
the frontend form fields. Verified: 1 new regression test (6 sub-cases: negative/zero emoluments,
negative/absurd/non-integer service months) added to
`pension-projection-self-service.test.cjs` (now 6 tests). Full backend suite 657/658 (1
pre-existing skip), web unit 153/153, and Playwright e2e 29/29 — all pass with zero regressions.

The review's remaining findings — a LOW absurd-value-echo case (now closed by the same bound), a
MEDIUM observation that pre-existing PDA/pensioner/disbursement/revision-batch admin routes still
leak `tenantId`/`entityId` (the same pre-existing class already flagged in the Deferred Gaps table
below, now made explicit), and LOW notes on test-count reproducibility under different working
directories/parallel-run flakiness unrelated to this session's changes — are recorded rather than
requiring further code changes.

## Coverage Matrix — FR-G11-15 (self-service estimator scope)

| AC | Verdict | Evidence |
|---|---|---|
| AC1 (non-binding, never writes to a live case) | **BUILT THIS SESSION** | Verified by a dedicated test: running an estimate leaves `listMyCases()` empty — no case row is ever created |
| AC2 (what-if varies qualifying service / emoluments / date) | **BUILT THIS SESSION** | All three are optional overrides on `estimateBenefits()`; a dedicated test proves varying them changes the computed pension |
| Self-vs-other scoping (estimate for self, or an override role) | **BUILT THIS SESSION** | Did not exist anywhere in the module before; net-new `assertSelfOrOverride()` |
| Wire responses strip internal tenantId/entityId | **REMEDIATED THIS SESSION** | Module had no wire-stripping at all; now applied to all 7 `PensionCase`-returning routes |
| Self-service UI surface (`/me/pension`) | **BUILT THIS SESSION** | Did not exist — only `/admin/pension-retirement` (an admin/HR surface) existed before |
| Track status (own pension case, if any) | **BUILT THIS SESSION** | `listMyCases()` + route + UI list — none of this existed before |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| No G11 admin method (`createCase`, `verifyService`, `computeBenefits`, `sanction`, `issuePpo`, pensioner-lifecycle/benefit/revision services) has a per-row ownership check — only coarse RBAC permission | L | Pre-existing across the entire module, not introduced this session; these all require elevated permissions (`g11.case.create`, `g11.pension.compute`, `g11.pension.sanction`, etc.) the self-service session never holds, so there is no cross-employee exposure via the *new* surface. A full retrofit across ~14 service files and ~26 routes is a module-wide hardening pass disproportionate to "check pension projections," not a scoped self-service fix |
| FR-G11-15's LC annual calendar (AC6) and bereavement guide (AC7) are not built | M | Both are distinct, separately-named sub-features of FR-G11-15 requiring their own data model (LC due dates, family-member reporting flow) — not named in "check pension/retirement projections... view estimated benefits" |
| `estimateBenefits()`'s qualifying-service default (date of joining → asOf) is a simple month count, not a real qualifying-service computation (which would exclude penalty periods, unpaid leave, etc. per FR-G11-04) | S | A real qualifying-service computation depends on a full G12 SR ledger + G03 leave-deduction pipeline per employee that isn't seeded/wired for this pass; the estimator already lets the caller override with a real verified figure when one exists (from a live case's `serviceVerification`), and defaults are clearly framed as non-binding approximations, not authoritative figures |
| Pre-existing admin routes for other G11 record types (`PenPensioner`, PDA registrations, disbursements, revision batches, provisional-pension, account-verifications) still return raw `tenantId`/`entityId` — confirmed live by full-review | S | Same bug class as the `PensionCase` leak just fixed, but on record types this pass never touched (out of the named self-service scope); flagged explicitly here since full-review asked for it by name, not left implicit under the broader "no ownership check" gap above |

## Scorecard

```
LINE-ITEM COVERAGE (FR-G11-15 self-service estimator scope)
================================================================================
Total items audited:        6
BUILT THIS SESSION (net-new): 5 (AC1, AC2, self-vs-other scoping, UI surface, track status)
REMEDIATED THIS SESSION:      1 (wire-leak, module had none before)
```

## Verdict: GAPS-FOUND

The self-service "check my pension projection" surface did not exist in any form before this
session — no route, no authorization model beyond coarse RBAC, no frontend, and no session
permission to reach it even if it had existed. All of FR-G11-15's core self-service AC1/AC2
estimator behavior is now built and reuses the exact same statutory calculation function the live
admin case-computation flow uses, so a self-service estimate and a real case computation will
never silently diverge in their arithmetic. The permission design deliberately avoided reusing the
module's single broad `g11.pension.read` permission — informed directly by this session's own
G05 and G13 full-reviews, both of which found that granting a shared, unscoped permission to a
self-service actor exposed sibling admin routes with no per-row ownership check. The remaining gap
is the sheer size of the rest of the G11 module (14 services, ~26 admin routes) never having had
ownership checks at all — correctly out of scope for "view my own estimated benefits," and flagged
rather than silently left implying the whole module is now self-service-safe.
