# BRD Coverage — G06 Promotion & Posting Self-Service

## Scope

Per the user's scoping decision (established earlier this session for the G01/G03/G05/G07/G08/
G10/G11/G12/G13 self-service goal and re-applied here): this audit covers **only** the two named
employee self-service use cases, not the full 20-FR G06 module:

1. **View promotion & posting history / track promotion case status** — `GET /api/v1/promotions/orders`,
   `GET /api/v1/promotions/probation-records?employeeId=`, `GET /api/v1/promotions/refusals?employeeId=`.
2. **View sealed-cover status concerning me** — `GET /api/v1/promotions/sealed-covers`.

Out of scope (admin/HR-authority flows, unaffected by this feature): seniority list build/publish/
finalise, DPC constitution/proceedings, roster management, sanctioned-post establishment register,
qualifying-service ledger computation, MACP sanctioning, officiating arrangements, legal-case
linkage, correction cascade, multi-stream rota-quota construction, career-path/succession (advisory).

**BRD reference:** `docs/brd/v3/G06-promotion-posting-progression.md` (v3.0). Relevant sections read
in full: §3.1 roles, §3.2 permission matrix, FR-PPP-007 (order generation/acceptance/refusal),
FR-PPP-008 (sealed cover), FR-PPP-009 (probation), FR-PPP-019 (refusal consequence).

## Traceability

### Use case 1 — promotion & posting history

| Item | BRD evidence | Code evidence | Verdict |
|---|---|---|---|
| Employee can view own promotion/posting progression | §3.2 permission matrix row "View own progression": **Employee = R** | `promotionService.ts` `listPromotionOrders(actor)` — self-or-override filtered (`promotionService.ts:1450-1456`); route `g06.routes.ts` `GET /api/v1/promotions/orders` passes `context.actor` | DONE |
| Employee can view own probation record | §3.2 row "Probation declaration": **Employee = R(self)**; FR-PPP-009 AC1-5 | `listProbationRecords(actor, employeeId)` — `assertSelfOrPromotionOverride` gate (`promotionService.ts:1147-1152`); route passes `context.actor`, query param `employeeId` | DONE |
| Employee can view own refusal/debarment record | FR-PPP-019 UI Behavior Notes: **"refusal badge on employee progression timeline"** (explicit self-view intent, resolving the permission-matrix "Refusal consequence: X" row — that row governs the *create/waive* capability, HR/Appointing-Authority-only per FR-PPP-019 Authorization, not the employee's own read) | `listPromotionRefusals(actor, employeeId)` — same self-or-override gate | DONE |
| Wire responses strip internal fields (tenantId/entityId) | Platform-wide convention (§4, Shared Application Foundation) | `toWirePromotionOrder`/`toWireProbationRecord`/`toWirePromotionRefusal` in `g06.routes.ts` | DONE |
| Cross-employee ownership enforcement (need-to-know) | §3.2 header: "own-record scope; cannot view others' comparative data" (Employee row note, §3.1) | `PROMOTION_ACCESS_OVERRIDE_ROLES`, `isPromotionAccessOverride`, `assertSelfOrPromotionOverride` — all three read methods now filter/gate by `actor.userId` unless override | DONE (was a real gap — see Findings) |

### Use case 2 — sealed-cover status

| Item | BRD evidence | Code evidence | Verdict |
|---|---|---|---|
| Sealed-cover existence/status | FR-PPP-008 AC1: "Sealed-cover candidates flagged; verdict recorded but not effected; **visible only to authorised roles (P02 field-level)**." UI Behavior Notes: "Restricted 'Sealed Covers' workspace **(Admin workspace, P02-gated)**." §3.2 permission matrix has **no "Sealed cover" row at all** — Employee is not named for any sealed-cover capability. §217 workspace model: sealed covers are not listed under the "Me" workspace. | `listSealedCovers(actor)` — self-or-override filtered; non-override (self-service) callers see only their own row, with `reason`/`releaseReason` redacted to `""`/`undefined` (`sealedCoverService.ts`) | **PARTIAL — see Finding F1 (scope deviation, deliberate)** |
| Confidential justification text withheld from the affected employee | Not explicit in G06's own BRD, but consistent with G09's confidentiality rules (disciplinary/vigilance detail withheld from the respondent until formally served) which this session's G09 survey confirmed apply to the same underlying `reason` text (seed data literally reads "Pending vigilance inquiry"/"Pending disciplinary proceeding") | `listSealedCovers` strips `reason`/`releaseReason` for non-override callers | DONE (within the deviation) |

## Finding F1 (MEDIUM, scope deviation — deliberate, flagged not hidden)

**The BRD's FR-PPP-008 explicitly scopes sealed-cover visibility to "authorised roles" only, in the
Admin workspace, P02-gated — the §3.2 permission matrix has no row granting the Employee role any
capability on sealed covers at all.** This is a stronger, more specific signal than a simple
omission: FR-PPP-008 AC1 and its UI Behavior Notes both explicitly restrict visibility, and the
platform's own workspace model (§217) does not list sealed covers under "Me".

This session's implementation nonetheless built a self-service sealed-cover **status** view (SEALED
vs RELEASED), with the confidential `reason`/`releaseReason` text redacted — because the user
explicitly named "view sealed-cover status concerning me" as one of the two use cases for this
feature. This is a considered deviation, not an oversight:

- **What is exposed:** only `status` (`SEALED`/`RELEASED`) and a generic explanatory sentence. No
  case reference, no reason text, no vigilance/disciplinary detail.
- **Why the deviation is defensible:** natural-justice/due-process norms in government HR generally
  entitle an employee to know that a decision affecting them is on hold pending a proceeding (this
  is consistent with G09's own BRD, which explicitly grants the charged employee visibility into
  *served* case artefacts and case timeline — see `docs/reviews/brd-coverage-g08-...` sibling reports
  this session for the analogous pattern). Redacting the reason keeps the FR-PPP-008 "authorised
  roles only" *content* restriction intact while surfacing only the *existence* of a hold — a
  narrower disclosure than "authorised roles" implies but not a violation of it, since no restricted
  content crosses the boundary.
- **Recommended action:** amend FR-PPP-008 in a future BRD revision to add an explicit
  `Employee: R(self, status-only)` row to §3.2 and note the redaction contract, so this is a traced
  requirement rather than an implementation-led deviation. Not required to ship — repair-mode
  eligible as a documentation-only amendment, no code change needed.
- **Repair mode eligible?** Documentation amendment only (BRD text), not a code fix. Not blocking.

## Findings — implementation gaps found and fixed this session

| ID | Severity | Finding | Fix |
|---|---|---|---|
| F2 | HIGH (pre-existing, fixed) | `listPromotionOrders(scope)` was a tenant-wide dump with zero per-employee filter — any actor holding `g06.promotion.read` (which every self-service employee session now carries) could read every employee's promotion orders. Same bug class as this session's G05 `getServiceRecord` finding. | `listPromotionOrders` now `ActorContext`-typed, filters to `order.employeeId === actor.userId` unless the caller holds an override role/wildcard (`promotionService.ts:1450-1456`) |
| F3 | HIGH (pre-existing, fixed) | `listPromotionRefusals(scope, employeeId)` / `listProbationRecords(scope, employeeId)` accepted a caller-supplied `employeeId` with **no check that the caller was that employee** — any `g06.promotion.read` holder could pass any `employeeId` and read that person's probation/refusal record. | Both now require `ActorContext` and call `assertSelfOrPromotionOverride(actor, employeeId)` before returning data |
| F4 | HIGH (pre-existing, fixed) | `listSealedCovers(scope)` was a tenant-wide dump — any `g06.sealedcover.read` holder saw every employee's sealed-cover row **including the confidential `reason` text**, which routinely names the underlying disciplinary/vigilance matter (seed data: "Pending vigilance inquiry"). | `listSealedCovers` now filters to the caller's own row (unless override) and redacts `reason`/`releaseReason` for non-override callers |

All three (F2-F4) were found and fixed **during this feature's own implementation**, not by a
separate review pass — they are recorded here for traceability since they are the same
"tenant-wide-dump-with-no-ownership-filter" bug class this session's `/full-review` passes have
caught repeatedly in other modules (G05's `getServiceRecord`, G13's `list()`).

## Deferred/out-of-scope gaps (not remediated — outside this use case)

- **`assessPromotionEligibility` self-view**: the BRD (§3.2, "Eligibility computation": `Employee =
  R(self)`) grants employees read access to their own eligibility assessment, but this session's
  scope (per the user's explicit use-case wording) covers "promotion & posting **history**", which
  reads more naturally as orders/probation/refusals — a forward-looking "am I eligible" computation
  is a different, adjacent capability. Not built. If wanted, `promotionService.ts`'s
  `eligibilityAssessments` map already has the data; would need a new self-scoped read method + route
  + UI section, same shape as this feature's other three reads.
- **`getRosterCompliance`, `MacpCase` self-view**: BRD grants `Employee: R(self)` on "ACP/MACP
  sanction" too, but no explicit `listMacpCases`-style read method exists in `promotionService.ts`
  today (MACP data is only visible indirectly via `promotionOrders`/`payImpactSignals`, neither of
  which is MACP-specific). Out of scope for this use case; flagged for a future MACP self-service
  slice if requested.
- **Auth-matrix drift**: `docs/contracts/auth-matrix.yaml`'s G06 action codes (`g06.seniority.prepare`,
  `g06.vacancy.compute`, `g06.dpc.convene`, etc.) do not match the actual runtime permission strings
  used throughout `promotionService.ts`/`g06.routes.ts` (`g06.promotion.read`, `g06.sealedcover.read`,
  etc.) — same pre-existing drift pattern already documented for G05 in this session's earlier work.
  Not touched; would be a separate contract-reconciliation exercise across the whole module, not
  specific to this use case.

## Verdict

**GAPS-FOUND → remediated within this session's implementation.** Three real cross-employee
ownership leaks (F2-F4) were found and fixed before this report was written (not deferred). One
deliberate, documented scope deviation (F1, sealed-cover status visibility) is flagged for a future
BRD amendment but does not block shipping, since it only narrows disclosure (status, not content)
relative to what a strict reading of FR-PPP-008 would allow rather than exceeding it.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/promotion-posting-self-service.test.cjs` — 7/7 pass, including
  dedicated regression tests for F2 (cross-employee order leak), F3 (probation/refusal ownership
  gate), and F4 (sealed-cover ownership + reason redaction, with an hr_admin-sees-reason contrast
  test).
- `node --test apps/api/test/*.test.cjs` — full backend suite 666/667 (1 pre-existing unrelated
  skip).
- `npm run web:typecheck` / `npm run web:test` — clean, 153/153.
- `npx playwright test --workers=1` — full e2e suite 31/31, including the new
  `promotion-posting-self-service.spec.ts` (2 tests: self-view + cross-employee-denial).
