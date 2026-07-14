# Full Review: G05 Transfer Request Self-Service

## Update 2026-07-13 (post-review verification)

F-NEW-1 (HIGH) has been fixed: `getServiceRecord` in `apps/api/src/modules/g05/transferService.ts`
now takes `ActorContext` (was `TenantScope`), looks up the parent order via the existing
`requireOrder()` helper, and throws `FORBIDDEN` unless `order.employeeId === scope.userId` or the
actor holds a transfer-access override role/wildcard permission — the exact pattern this review
identified from `getOrder()`. The route (`g05.routes.ts:389`) now passes `context.actor` instead of
`context.scope`. Added a dedicated regression test (`transfer-request-self-service.test.cjs`,
"service-record read is ownership-gated") asserting 200 for the owner, 403 for a stranger holding
only `g05.transfer.read`, and 200 for an `hr_admin` override — full suite re-run at 11/11 for this
file, 658/659 for the full backend suite (1 pre-existing unrelated skip), `npm run build` clean.
F-NEW-2 (LOW, cosmetic error-mapping inconsistency) was left as-is per the review's own
recommendation (not a functional defect, would be a code-cleanup item on `TransferInitiateForm.tsx`
if ever revisited).

**Verdict: PASS (post-remediation)**

Original review text preserved below.

---

## Verdict
CONDITIONAL

One new HIGH-severity, live-verified ownership-scoping gap (`getServiceRecord`) was found that
was not caught by this feature's own prior `/full-review` pass (recorded in the BRD-coverage
doc as F1/F2, both already fixed). It is the same bug class (a `TenantScope`-typed read with no
per-employee filter) as the two findings that prior pass already remediated, just in a route that
sweep did not reach. Everything else reviewed — the self-scope enforcement pattern, wire-stripping
on the routes this session touched, the self-service UI, idempotency-key usage, ARIA labeling, and
component substance — passes.

## Scope
- **Target**: G05 Transfer Request Self-Service (`/me/transfers`) — the slice covering
  FR-G05-001 (raise transfer request, self/manager), FR-G05-003 (submit ranked preferences), and
  FR-G05-020 (acknowledge a served order), per the BRD-coverage doc's scope decision.
- **Selected path**: Light/standard hybrid — reviewing a already-implemented, already-reviewed-once
  self-service slice; no new implementation performed (report-only, per full-review no-fix default).
- **Files reviewed**:
  - `apps/api/src/modules/g05/transferService.ts` (diff: +99/-19 net)
  - `apps/api/src/modules/g05/counsellingVacancyService.ts` (diff: +13)
  - `apps/api/src/routes/g05.routes.ts` (diff: +305/-120, wire-stripping helpers + route wiring)
  - `apps/web/src/modules/g05/MyTransfersPanel.tsx` (new)
  - `apps/web/src/modules/g05/TransferInitiateForm.tsx` (reused as-is, read for reference)
  - `apps/web/src/App.tsx`, `apps/web/src/app/session.ts` (routing + demo-session permission wiring)
  - `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts` (G05-relevant slices)
  - `apps/api/test/transfer-request-self-service.test.cjs` (10 tests, all read)
  - `apps/web/test/e2e/transfer-request-self-service.spec.ts` (1 Playwright test, read)
- **Reference patterns consulted**: `apps/api/src/modules/g01/bankAccountService.ts` +
  `apps/api/src/routes/g01.routes.ts` (`toWireBankAccount`), `apps/api/src/modules/g03/leaveService.ts`,
  `apps/api/src/modules/g12/serviceRegisterService.ts` (`getTimeline`/`getEvent` self-scope pattern),
  `apps/web/src/modules/g07/MyTrainingPanel.tsx` (sibling self-service panel, same session).
- **Artefacts used**: `docs/reviews/brd-coverage-g05-transfer-request-self-service-2026-07-13.md`
  (dated 2026-07-13, read in full before this review; its documented F1-F5 findings and deferred
  gaps are treated as known and are not re-reported below except where this review found the fix
  incomplete).

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Read BRD-coverage doc for prior findings/deferrals | Yes | 3 remediated gaps (identity, list-scoping, wire-leak), 5 deferred/documented items (F3-F5, dual-permission quirk, joining-report gap, admin-flow exclusions) | `docs/reviews/brd-coverage-g05-transfer-request-self-service-2026-07-13.md` |
| Static diff review of `transferService.ts`/`counsellingVacancyService.ts`/`g05.routes.ts` | Yes | Consistent `assertSelfOrOverride`/`assertSelfOrManagerOrOverride` pattern; `toWireX()` helpers applied across all routes returning Order/Ack/Preference/Representation/RelievingOrder/JoiningReport/ChargeHandover shapes **except** `service-record` | `apps/api/src/routes/g05.routes.ts:383-392`; full diff at `git diff apps/api/src/modules/g05/ apps/api/src/routes/g05.routes.ts` |
| Live probe: self vs cross-employee on `listMyOrders`/`listOrders`/`getOrder` | Yes | PASS — 403 for stranger, 200 self-scoped for owner, hr_admin sees all | `apps/api/test/transfer-request-self-service.test.cjs` tests 1,3,4,10 (all green); independently re-run, see Verification commands |
| Live probe: self vs cross-employee on `acknowledgeOrder`/preferences submit+read | Yes | PASS — 403 stranger, 202/200 self, manager cannot bypass for preferences (per BRD, no manager row) | same test file, tests 6-7 |
| Live probe: `listRelievingOrders`/`listJoiningReports`/`listChargeHandovers`/`listRepresentations` cross-employee | Yes | PASS for relieving/joining (test 9); independently probed representations and charge-handovers with a fresh script — both correctly return empty for a stranger, not a leak | `/tmp/.../scratchpad/probe.cjs` probes 1-2, 7 (see Findings for probe transcript) |
| **New** live probe: `getServiceRecord` (`GET .../service-record`) cross-employee | Yes | **FAIL** — HTTP 200 with full acknowledgement payload returned to an unrelated employee holding only `g05.transfer.read` | Probe 6/7 output below; see Finding F-NEW-1 |
| Wire-leak live probe (`tenantId`/`entityId`/`workflowInstanceId` absent from responses) | Yes | PASS on all routes probed, including `approve`/`relieve-and-join`/`clearances` (post-F1-fix routes) | `apps/api/test/transfer-request-self-service.test.cjs` tests 2, 8 |
| `npm run build` (full TS project build) | Yes | PASS, no errors | command output empty (success) |
| `node --test apps/api/test/transfer-request-self-service.test.cjs` | Yes | PASS 10/10 | `# tests 10 / # pass 10 / # fail 0` |
| Full backend suite `node --test apps/api/test/*.test.cjs` | Yes (2 runs) | PASS 657/658 (1 pre-existing skip), reproducible across 2 runs | `# tests 658 / # pass 657 / # fail 0 / # skipped 1` (both runs identical) |
| `npm run web:typecheck` | Yes | PASS, no errors | command output empty (success) |
| UI/accessibility static review (label/id pairing, ARIA region naming, keyboard operability, aria-expanded) | Yes | PASS — matches sibling `MyTrainingPanel.tsx`/`TransferInitiateForm.tsx` conventions; no disclosure widgets present so `aria-expanded` N/A | `apps/web/src/modules/g05/MyTransfersPanel.tsx:79-121` |
| Component substance / anti-skeleton check on `MyTransfersPanel.tsx` | Yes | PASS — real API calls, real data rendering, real error/empty/loading states, real mutating action | see Component substance table |
| Playwright e2e spec review (`transfer-request-self-service.spec.ts`) | Yes (static only, not executed — no browser runtime in this session) | Exercises real UI submit → admin API approve → real UI acknowledge lifecycle | `apps/web/test/e2e/transfer-request-self-service.spec.ts:31-72` |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F-NEW-1 | HIGH/P1 | Security | `apps/api/src/routes/g05.routes.ts:383-391`, `apps/api/src/modules/g05/transferService.ts:1189-1193` | `GET /api/v1/transfers/orders/{id}/service-record` (`getServiceRecord`) has no per-employee ownership check — it is `TenantScope`-typed (not `ActorContext`-typed like the sibling reads fixed in the prior review pass) and returns the full acknowledgement record to any actor holding only `g05.transfer.read`, regardless of whose order it is. | Live-verified via `api.dispatch()`: an actor `sunita` (no relation to the order) and a second actor with a fully random `userId` both received `HTTP 200` with the complete `acknowledgement` body (`id`, `transferOrderId`, `employeeId: "emp-000008"`, `servedOnDate`, `deliveryChannel`, `acknowledgementStatus`) for Priya's transfer order, using only the `g05.transfer.read` permission that this session's own `session.ts` change just granted to the demo employee session. Route wired at `g05.routes.ts:389` passes `context.scope` (not `context.actor`) into a service method that never checks `scope.userId` against the order's `employeeId` — the same bug class as the BRD-coverage doc's F2, in a route that sweep did not reach. | Add the same `assertSelfOrOverride`-equivalent ownership check `getOrder`/`listOrders` already use: look up the parent order via `requireOrder`/`findOrder`, and gate on `order.employeeId === scope.userId \|\| isTransferAccessOverride(scope)` before returning the acknowledgement, mirroring the `listChargeHandovers` fix pattern at `transferService.ts:1363-1375`. Change the route to pass `context.actor` (already imported) instead of `context.scope`. | Yes — implementation-only fix, same shape as the already-applied `getOrder`/`listOrders` fix; no contract/requirements change needed. |
| F-NEW-2 | LOW/P3 | Quality | `apps/web/src/modules/g05/TransferInitiateForm.tsx:90` vs `apps/web/src/modules/g05/MyTransfersPanel.tsx:26,74` | Minor error-mapping inconsistency: `TransferInitiateForm` maps errors via `error.code` (the raw server error code) while `MyTransfersPanel` (new, this session) and its sibling `MyTrainingPanel`/`CounsellingConsole` map via `error.displayCode` (a getter on `HrmsApiError`). Both are legitimate properties, but the mix means the two G05 panels shown together on `/me/transfers` could theoretically render differently-cased/shaped codes for the same underlying error. | `apps/web/src/api/hrmsClient.ts:1743-1759` defines both `code` and a `displayCode` getter; `TransferInitiateForm.tsx:90` was not touched this session (pre-existing, reused as-is per the BRD-coverage doc) while `MyTransfersPanel.tsx` (new) follows the newer `displayCode` convention used by every other `My*Panel.tsx` built this session. | No action required to ship; if `TransferInitiateForm` is ever revisited, align it to `displayCode` for consistency with its new sibling panel on the same route. Not a functional defect — both properties resolve to a defined string in every observed path. | Not applicable — cosmetic consistency nit, not a bug; would be a code-cleanup item, not a review-repair item. |

Findings already known and intentionally not re-reported here (per the BRD-coverage doc's Deferred
Gaps table, dated the same day): the dual-permission quirk on `GET .../preferences`
(`g05.counselling.read` route + `g05.transfer.read` service check), the manager-raised-but-cannot-
self-view-via-`listMyOrders` gap (F3), the `auth-matrix.yaml` G05 action-code drift (F4), and the
absent standalone "submit joining report" self-service action. All four are recorded there as
deliberate deferrals with reasoning, not blind gaps, and none regressed in this review's live
checks.

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyTransfersPanel` | `apps/web/src/modules/g05/MyTransfersPanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` (props); no manual order-id entry | `client.listMyTransferOrders(employeeId)` on mount/refresh (`GET /api/v1/transfers/employees/{id}`); `client.acknowledgeTransferOrder(orderId, {acknowledgedAt}, idempotencyKey)` on button click (`POST .../acknowledge`) with a fresh `crypto.randomUUID()` idempotency key per attempt | Renders real order fields (`orderNo`, `fromOrgUnitId`/`toOrgUnitId`, `status`, `servedOnDate`/`acknowledgedAt`-derived status text) in a real `<ul>` list keyed by `order.id`; conditionally renders an `Acknowledge` button only when `servedOnDate` is set and `acknowledgedAt` is not — real state-driven conditional logic, not a static stub | **Real component** — full loading/error/empty/ready state machine, real mutating action with idempotency, no hard-coded/mock data paths |
| `TransferInitiateForm` (reused, not new) | `apps/web/src/modules/g05/TransferInitiateForm.tsx` | Controlled form fields (`employeeId`, org units, dates, reason) | `client.initiateTransferOrder(input, crypto.randomUUID())` on submit (`POST /api/v1/transfers/orders`) | Renders live validation errors, submit-in-flight state, and a real success message quoting the server-returned `orderNo` | **Real component** — pre-existing, generic enough for self-service reuse per the BRD-coverage doc; confirmed still functions as the initiator half of the `/me/transfers` route |

## Traceability impact

No new FR/AC coverage change from this review (report-only, no fixes applied). If F-NEW-1 is
repaired, it strengthens FR-G05-020's "X (ack own)" / proof-of-service AC — the acknowledgement
*record read* was the one sub-path of that AC not covered by the BRD-coverage doc's remediation
list, since that doc's coverage matrix only names `acknowledgeOrder` (the write), not
`getServiceRecord` (the read).

## Required amendments

None. F-NEW-1 is an implementation-only repair (same shape/pattern as the fixes already applied
to `getOrder`/`listChargeHandovers` in this same file) and does not require a requirements,
contract, or auth-matrix amendment — `g05.transfer.read` remains the correct permission gate; only
the missing ownership filter needs to be added, consistent with every sibling read this feature
already scopes.

## Verification commands

```bash
npm run build
node --test apps/api/test/transfer-request-self-service.test.cjs
node --test apps/api/test/*.test.cjs   # full backend suite
npm run web:typecheck
```

Results as run in this review: `build` clean; targeted suite 10/10; full suite 657/658 (1
pre-existing unrelated skip), reproduced across 2 consecutive runs with identical results;
`web:typecheck` clean.

Recommended additional regression test if F-NEW-1 is repaired (not yet written, per no-fix mode):
a test asserting `GET /api/v1/transfers/orders/{id}/service-record` returns 403 for a
non-owner/non-override actor and 200 for the owner or an override role, mirroring the existing
`listMyOrders`/`getOrder` tests in `transfer-request-self-service.test.cjs`.

## Remaining risks

- **F-NEW-1 (HIGH)** is a live, exploitable cross-employee PII read (acknowledgement/service-of-
  order status, including `servedOnDate` and delivery channel) reachable by any employee holding
  the ordinary `g05.transfer.read` permission — which, per `session.ts`, every self-service
  employee session now carries. This should be treated as a should-fix-before-next-release item;
  it is not a data-loss or write-path issue, so it does not block the self-service feature's core
  "raise/track/acknowledge" flow, which is otherwise sound.
- The five items already deferred in the BRD-coverage doc (manager read-visibility gap, dual-
  permission quirk, auth-matrix drift, joining-report self-action absence, admin-flow exclusions)
  remain open by design and are unaffected by this review.
- This review did not execute the Playwright e2e spec (no browser runtime available in this
  session) — it was reviewed statically only. Its assertions and flow are consistent with the
  panel's actual API surface and route wiring, but end-to-end browser execution was not re-verified
  here.
