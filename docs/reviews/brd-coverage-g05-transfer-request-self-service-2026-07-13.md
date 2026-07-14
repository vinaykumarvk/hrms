# BRD Coverage Review — G05 Transfer Request Self-Service (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G05-transfer-relieving-joining-workflow.md` — **scoped subset only**
Scope decision (same principle as prior use cases 3-8): "request a transfer or view transfer
orders — submit preferences, track status." Covers the self-service slice of FR-G05-001 (raise a
transfer request), FR-G05-003 (submit ranked preferences during a counselling drive), and
FR-G05-020 (acknowledge a served order) — not clearance administration, deputation, quarter
retention, charge handover, mutual-transfer pairing/approval, joining-sequence administration,
counselling-session conduct, vacancy publication, or disposition/representation adjudication.

Verdict: **GAPS-FOUND** (three independent access-control gaps remediated — raising a request for
another employee, acknowledging on another employee's behalf, and a cross-employee order/
preference listing leak — plus the self-service surface itself, which did not exist before)

## In-scope requirement

**FR-G05-001** (self-service half: "C (own)" for the Employee row, "C (team)" for the reporting
manager, per BRD §3.2), **FR-G05-003** (preferences: "C (own)" for Employee), and **FR-G05-020**
(acknowledge: "X (ack own)" for Employee).

## What changed this session

- Backend: `apps/api/src/modules/g05/transferService.ts` —
  - `initiate()` had **zero** appraisee-identity check — any actor holding
    `g05.transfer.initiate` could raise a transfer request naming *any* employee, contradicting
    BRD §3.2 ("Raise transfer request: C (own)" for Employee, "C (team)" for the reporting
    manager only). Added `assertSelfOrManagerOrOverride()`: self, the actor's resolved
    REPORTING_CHAIN manager (reusing `AuthorityResolutionService`, injected as a new constructor
    dependency — the same mechanism `workflow.start()` already uses to route
    `WF-G05-TRANSFER-ORDER` approval), or an override role (`hr_admin`, `hr_src_officer`,
    `hr_dest_officer`, `system`).
  - `acknowledgeOrder()` only checked that the acknowledger was not the *serving* officer (an
    unrelated SoD rule) — it never checked the acknowledger *was* the transferee. Any actor
    holding `g05.transfer.acknowledge` (other than the specific serving officer) could acknowledge
    service on any employee's order, contradicting "X (ack own)". Added
    `assertSelfOrOverride()` (self or override role/wildcard).
  - `capturePreferences()`/`listPreferences()` (in `counsellingVacancyService.ts`) had the same
    zero-scoping gap for submitting/viewing ranked preferences on another employee's behalf during
    a counselling drive. Added a local `assertSelfOrOverride()` (self, `hr_admin`/`hr_src_officer`/
    `system` override — no manager row for this capability per BRD §3.2, unlike raising a request).
  - **CRITICAL, learned from this session's own G13 full-review**: `listOrders()` and `getOrder()`
    were tenant-scoped only, with no per-employee filter — the exact same over-exposure class the
    full-review caught in G13's `list()` after an initial fix missed it. Fixed proactively this
    time, before any review: both now return only the caller's own order(s) for non-override
    actors (Librarian/HR-Src/HR-Dest/HR-Admin/Auditor keep the BRD's plain "R"). Added
    `listMyOrders()` as the explicit self-service discovery method (mirrors `listMyDocuments`/
    `listMyForms`/`listMyNominations` from prior features), and retrofitted `listOrders`/`getOrder`
    with the same override-or-owner gate rather than leaving the general routes exploitable the
    way G13's `list()` was.
- Routes: `apps/api/src/routes/g05.routes.ts` — added `GET /api/v1/transfers/employees/{id}`.
  - **Wire-leak fix (same class fixed 6 times earlier this session)**: added `toWireOrder()`
    (strips `tenantId`/`entityId`/`workflowInstanceId`/`workflowTaskId`/
    `clearanceWorkflowInstanceId`/`orderNumberSequenceId`), `toWireAcknowledgement()`, and
    `toWirePreference()` (both strip `tenantId`/`entityId`), applied to every route returning a
    `TransferOrder`/`OrderAcknowledgement`/`TransferPreference`-shaped object: initiate, list,
    list-mine, serve, acknowledge, deem-served, service-record, capture-preferences,
    list-preferences. `resolverEvidence` was deliberately left un-stripped — a pre-existing HTTP
    test (`ph06-g05-transfer.test.cjs`) asserts it's present on the initiate response by design.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added `seedTestTransfer()`: one real
  PENDING_APPROVAL transfer order for Priya (Revenue → Assessment, both real PH-03 org units),
  routed to the real seeded `G05_TRANSFER_REVENUE` POSITION_AUTHORITY, so "track status" is
  reachable end-to-end against real seeded data.
- Bug fix (same class as prior features' permission-string mismatches): the demo employee session
  (`apps/web/src/app/session.ts`) had **no `g05.*` permissions at all** — the self-service
  surface would have been entirely unreachable through the real running app. Added
  `g05.transfer.read`, `g05.transfer.initiate`, `g05.transfer.acknowledge`,
  `g05.preference.submit`, and `g05.counselling.read` (the last needed because
  `GET .../preferences` is route-gated on `g05.counselling.read` while the underlying service
  method separately checks `g05.transfer.read` — a pre-existing dual-permission quirk in that one
  route, left as-is since fixing it is outside this scoping fix and not a security gap).
- Frontend: `MyTransfersPanel.tsx` (new) — lists only the employee's own transfer orders and lets
  them acknowledge a served order; wired into a **new** `/me/transfers` route alongside the
  pre-existing `TransferInitiateForm.tsx` (reused as-is, already generic enough for self-service
  since it already accepted an editable `employeeId` field). The pre-existing `/team/transfers`
  route (`TransferWorkspace`/`CounsellingConsole`) is untouched. `hrmsClient.ts`/
  `fixtureHrmsClient.ts` — added `listMyTransferOrders`, `acknowledgeTransferOrder`,
  `TransferAcknowledgeInput`/`TransferAcknowledgeResult` types, and `servedOnDate`/`acknowledgedAt`
  fields on `TransferOrderRecord`.
- Tests: `apps/api/test/transfer-request-self-service.test.cjs` (8 tests: seed produces a real
  pending order, wire-leak regression, self-vs-cross-employee 403 on the new list route, the
  general order list no longer cross-leaks, self/manager/stranger on initiate, self/stranger on
  acknowledge, self/stranger on preferences submit+read, hr_admin override) and
  `apps/web/test/e2e/transfer-request-self-service.spec.ts` (1 Playwright test — unlike prior
  features, the seed step here **is** the self-service action itself: the employee raises their
  own transfer request live through the UI form, an admin token approves it via direct API call
  — auto-serving it via the IN_APP channel — and the employee acknowledges it live through the UI).

## Post-review fix (full-review, CONDITIONAL — 2 HIGH findings)

The dispatched `/full-review` confirmed the `listOrders()`/`getOrder()` ownership-scoping fix (the
thing this session explicitly tried to apply proactively, having learned from the G13 review) held
up under live adversarial testing — but found two further HIGH findings in the *same feature*,
proving the "developer's completeness claim is wrong somewhere else" pattern from G07/G08/G13
still recurred here, just in different spots:

1. **Wire-leak retrofit was incomplete (F1).** 7 routes returning a `TransferOrder`/
   `TransferRepresentation`/`ChargeHandover`-shaped object were never wrapped in the new
   `toWireOrder()`/`toWireRepresentation()`/`toWireChargeHandover()` helpers: `approve`,
   `clearances:complete`, `clearances:deem`, `relieve-and-join`, `file-representation` +
   `list-representations`, `retain-on-representation`, `cancel`, `deem-relieved`, and all 4
   charge-handover routes (record/accept/dispute/under-protest) plus their list route. Live-
   verified by the reviewer: `POST .../approve` returned raw `tenantId`/`workflowInstanceId`/etc.
2. **The exact G13 cross-employee-listing bug recurred in sibling list methods (F2).**
   `listRelievingOrders()`, `listJoiningReports()`, and `listChargeHandovers()` were still
   `TenantScope`-typed with no ownership filter — the same shape as the pre-fix `listOrders()` bug,
   just never touched when that one was fixed. Live-verified: an unrelated employee holding only
   `g05.transfer.read` (the permission this session just granted the self-service demo session)
   retrieved another employee's relieving order, joining report, and charge handover in full.

Both fixed: added `toWireRepresentation()`/`toWireRelievingOrder()`/`toWireJoiningReport()`/
`toWireChargeHandover()` helpers and applied them (plus the pre-existing `toWireOrder()`/
`toWireAcknowledgement()`) to every route in the file returning one of these 5 shapes — this time
via a systematic grep across the whole file rather than the routes the original pass happened to
touch. `listRelievingOrders`/`listJoiningReports` now apply the same override-or-owner scoping as
`listOrders`; `listChargeHandovers` scopes to either party named on the handover (relinquisher via
the parent order, or the receiving employee) since a handover legitimately involves two people —
importantly, this list route never 404s on an unknown order id (matches this codebase's list-route
convention; a first attempt using `requireOrder()`'s throwing lookup broke a pre-existing kernel
smoke test, `ph54a-g05-transfer-reads-route.test.cjs`, and was corrected to a non-throwing lookup).

Verified: 2 new regression tests added to `transfer-request-self-service.test.cjs` (now 10 tests)
exercising the full approve → clearance → relieve-and-join lifecycle via real HTTP and asserting
no leaks at any step, plus a cross-employee relieving-order/joining-report visibility check. Full
backend suite 651/652 (1 pre-existing skip), web unit 153/153, and Playwright e2e 27/27 — all pass
with zero regressions.

The review's remaining findings — F3 (a manager who raises a request for a report cannot then see
it themselves via `listMyOrders`, since only `initiate()` has the manager-aware check) and F4/F5
(pre-existing `auth-matrix.yaml` drift and the dual-permission preference-read quirk) — are
recorded in Deferred Gaps below as product/documentation decisions rather than blind repairs.

## Coverage Matrix — FR-G05-001/003/020 (self-service scope)

| AC | Verdict | Evidence |
|---|---|---|
| Raise transfer request: C (own) / C (team) | **REMEDIATED THIS SESSION** | Was `NOT_FOUND` entirely; now enforced and tested: self ✅, real resolved manager ✅, unrelated employee ❌ (403), override role ✅ |
| P01 workflow routes PENDING_TRANSFER_AUTHORITY → APPROVED | DONE (pre-existing) | `initiate()`/`approve()`'s workflow routing untouched |
| Submit preferences / counselling choice: C (own) | **REMEDIATED THIS SESSION** | Was `NOT_FOUND`; now enforced: self ✅, unrelated employee ❌ (403), no manager bypass (per BRD) |
| Acknowledge served order: X (ack own) | **REMEDIATED THIS SESSION** | Only the maker≠checker SoD (server≠acknowledger) existed; the actual "own" restriction was missing entirely |
| Employee views only their own transfer orders/relieving-orders/joining-reports/handovers/representations (list) | **REMEDIATED THIS SESSION (initial pass proactive; sibling lists fixed post-review)** | `listOrders()`/`getOrder()` were fixed proactively and held up under full-review; `listRelievingOrders`/`listJoiningReports`/`listChargeHandovers`/`listRepresentations` had the identical unscoped bug and were fixed after the review caught it |
| Wire responses strip internal tenantId/entityId/workflowInstanceId | **REMEDIATED THIS SESSION (completed post-review)** | Initial pass covered 9 routes; full-review found 7 more (approve, clearance complete/deem, relieve-and-join, representation file/list/retain, cancel, deem-relieved, 4 charge-handover routes) — all now covered via a systematic whole-file grep |
| Self-service UI surface (`/me/transfers`) | **BUILT THIS SESSION** | Did not exist — only `/team/transfers` (an admin/HR surface) existed before |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| `GET .../drives/{id}/employees/{id}/preferences` requires both `g05.counselling.read` (route) and `g05.transfer.read` (service) — a pre-existing dual-permission quirk | S | Not a security gap (both are equally coarse read permissions, confirmed fails closed not open by full-review); fixing the inconsistency is a distinct route/service alignment change outside this scoping fix's named use case |
| A manager who successfully raises a transfer request for a direct report can never subsequently view it themselves via `listMyOrders`/`getOrder` — only `initiate()` uses the manager-aware `assertSelfOrManagerOrOverride`; the read paths use the plain `assertSelfOrOverride` | S | Fails closed (usability gap, not a security hole) — flagged by full-review as a real product decision: extend manager visibility to the read paths, or accept that only override roles can check on a request raised for someone else. Left for a requirements/product decision rather than silently widening the auth surface |
| `docs/contracts/auth-matrix.yaml`'s G05 action codes (`g05.transfer.sanction`, `g05.clearance.grant`, etc.) don't match any permission string actually used in code | S | Pre-existing documentation drift, unrelated to this session's changes; a contract-reconciliation pass, not a code defect |
| "Submit joining report" (FR-G05-021) has no distinct self-service action — a joining report is only ever created as a side effect of the HR-driven `relieveAndJoin()` | M | Building a standalone employee-initiated joining-confirmation action is a real feature gap, but a disproportionate build relative to this pass's named scope ("request a transfer... track status") |
| Deputation, quarter-retention, charge-handover, mutual-transfer, and counselling-session-conduct routes are untouched by the identity/wire fixes in this pass | — | Explicitly out of scope — these are HR/estate-officer/transfer-authority administrative flows, not named in "request a transfer... submit preferences... track status" |

## Scorecard

```
LINE-ITEM COVERAGE (FR-G05-001/003/020 self-service scope)
================================================================================
Total items audited:        7
DONE (pre-existing):         1 (P01 workflow routing)
REMEDIATED THIS SESSION:      5 (initiate, preferences, acknowledge, list-scoping, wire-leak)
BUILT THIS SESSION (net-new): 1 (the /me/transfers self-service surface itself)
```

## Verdict: GAPS-FOUND

The observable use case — an employee can raise their own transfer request (or have their real
resolved manager raise one for them), see only their own orders and preferences, and acknowledge
a served order, while nobody unrelated can do any of that on their behalf — now works end-to-end
against real seeded data and, for the first time, through the actual running app (the demo session
previously held zero `g05.*` permissions). This use case had the same class of over-exposure risk
this session's own G13 full-review caught after a first pass missed it (`list()`/`getOrder()`
returning every tenant record with no ownership filter); learning from that, both were fixed
proactively in the same pass as the identity checks rather than left for a subsequent review to
catch.
