# Full Review: G06 Promotion & Posting Self-Service

## Addendum 2026-07-14 (hr_admin cross-cutting SoD correction)

`PROMOTION_ACCESS_OVERRIDE_ROLES`/`SEALED_COVER_ACCESS_OVERRIDE_ROLES` in `promotionService.ts`/
`sealedCoverService.ts` no longer include `hr_admin` — per an explicit instruction from a later
`hr_admin` role-capability audit ("hr_admin has no direct grants in G06... a deliberate
separation-of-duties boundary"), `hr_admin` was removed from this module's override sets, leaving
only `promotion_officer`/`system`. This session's own two `promotion-posting-self-service.test.cjs`
tests that asserted `hr_admin` as an override actor were updated to assert `promotion_officer`
instead (and to additionally assert `hr_admin` is now correctly blocked). Full suite re-verified
green after the change. Verdict unchanged (PASS) — this is a scope-widening correction, not a
defect in the original feature.

## Verdict
PASS

Every ownership-scoping enforcement point (promotion orders, probation records, refusals,
sealed-cover status) live-verified via `api.dispatch()` probes beyond the existing 7-test suite —
15 additional adversarial probes covering query-param manipulation, role near-misses, case
sensitivity, module-scoped wildcard permissions, and multi-role combinations — all passed with no
bypass found. Reason/releaseReason redaction on `listSealedCovers` is correct for every non-override
caller tested, including an actor holding an unrelated role with no override role. No new findings.
The three prior findings (F2-F4) documented in the BRD-coverage doc remain correctly fixed, and the
one deliberate scope deviation (F1) is unchanged and does not require action.

## Scope
- **Target**: G06 Promotion & Posting Self-Service (`/me/promotions`) — the slice covering (1) view
  own promotion/posting history (orders, probation, refusals) and (2) view own sealed-cover status
  (redacted), per the BRD-coverage doc's scope decision. Admin DPC/seniority/roster/MACP-write flows
  are explicitly out of scope.
- **Selected path**: Light/standard hybrid — reviewing an already-implemented, already-reviewed-once
  self-service slice; no new implementation performed (report-only, per full-review no-fix default).
- **Files reviewed**:
  - `apps/api/src/modules/g06/promotionService.ts` (diff: +41/-13; `PROMOTION_ACCESS_OVERRIDE_ROLES`,
    `isPromotionAccessOverride`, `assertSelfOrPromotionOverride`, hardened `listPromotionOrders`/
    `listPromotionRefusals`/`listProbationRecords`)
  - `apps/api/src/modules/g06/sealedCoverService.ts` (diff: +23/-4; `SEALED_COVER_ACCESS_OVERRIDE_ROLES`,
    `isSealedCoverAccessOverride`, hardened `listSealedCovers` with ownership filter + redaction)
  - `apps/api/src/routes/g06.routes.ts` (diff: +41/-9; `toWirePromotionOrder`/`toWireProbationRecord`/
    `toWirePromotionRefusal`/`toWireSealedCover` wire-stripping helpers; 4 reads now pass `context.actor`)
  - `apps/api/src/seed/testEmployeesSeed.ts` (new; `seedTestPromotion`, `seedTestSealedCover`)
  - `apps/api/src/platform/foundationServices.ts` (diff: +70/-1; wires the 2 new seed calls)
  - `apps/web/src/modules/g06/MyPromotionPanel.tsx` (new self-service panel, read-only)
  - `apps/web/src/api/hrmsClient.ts` / `apps/web/src/api/fixtureHrmsClient.ts` (new types + client methods)
  - `apps/web/src/App.tsx`, `apps/web/src/app/navigation.ts`, `apps/web/src/app/session.ts` (new
    `/me/promotions` route + nav + demo permissions)
  - `apps/api/test/promotion-posting-self-service.test.cjs` (7 backend tests, read)
  - `apps/web/test/e2e/promotion-posting-self-service.spec.ts` (2 Playwright tests, read)
  - `apps/api/test/seed-five-employees.test.cjs` (new; updated document-count expectation for Sunita)
- **Artefacts used**: `docs/reviews/brd-coverage-g06-promotion-posting-self-service-2026-07-13.md`
  (read in full before this review; its documented F2-F4 findings — three cross-employee ownership
  leaks found and fixed during implementation — and F1 (deliberate scope deviation: sealed-cover
  status visibility exceeds a strict reading of FR-PPP-008) are treated as known and not re-reported
  below except where this review found the fix incomplete). `docs/reviews/full-review-g05-transfer-
  request-self-service.md` consulted as the reference report structure and as the sibling pattern
  for the ownership-gate/wire-stripping convention this feature follows.

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Read BRD-coverage doc for prior findings/deferrals | Yes | 3 remediated cross-employee leaks (F2-F4), 1 deliberate scope deviation (F1, documentation-only, not blocking) | `docs/reviews/brd-coverage-g06-promotion-posting-self-service-2026-07-13.md` |
| Static diff review of `promotionService.ts`/`sealedCoverService.ts`/`g06.routes.ts` | Yes | Consistent `assertSelfOrPromotionOverride`/override-role-Set pattern on all 4 self-service reads; `toWireX()` helpers applied to all 4 routes | `apps/api/src/routes/g06.routes.ts` lines with `toWirePromotionOrder`/`toWireProbationRecord`/`toWirePromotionRefusal`/`toWireSealedCover` |
| Live probe: existing regression suite (F2-F4 coverage) | Yes | PASS 7/7 | `apps/api/test/promotion-posting-self-service.test.cjs` |
| **New** live probe: query-param manipulation (`employeeId`/`userId`/`actorUserId` injected as extraneous query on `orders`; `employeeId` omitted to test default fallback) | Yes | PASS — no bypass; stranger sees 0 items in every variant | scratchpad probe script, checks 1-3 |
| **New** live probe: near-miss override role strings (`hr_admin_junior`, `promotion_officer_readonly`) | Yes | PASS — not treated as override; ordinary self-scoping applies | scratchpad probe, checks 5-6 |
| **New** live probe: case-sensitivity of role match (`HR_ADMIN` vs `hr_admin`) | Yes | PASS — case-sensitive `Set` match; `HR_ADMIN` is NOT an override | scratchpad probe, check 8 |
| **New** live probe: module-scoped wildcard permission (`g06.sealedcover.*`) vs literal `"*"` | Yes | PASS — only literal `"*"` triggers override; `g06.sealedcover.*` does not | scratchpad probe, check 9 |
| **New** live probe: multi-role actor (one override role among several) | Yes | PASS — any-of semantics confirmed intentional (override triggers), consistent with `hr_admin` acting on behalf of another employee elsewhere in the system | scratchpad probe, check 7 |
| **New** live probe: unrelated role + no override role on sealed-cover read | Yes | PASS — sees only own row, `reason`/`releaseReason` redacted | scratchpad probe, checks 6, 8 (renumbered in script) |
| **New** live probe: `employeeId` query param on sealed-covers route ignored as a filter override | Yes | PASS — route does not even accept an `employeeId` param on this endpoint; ownership filter is unconditional | scratchpad probe, check 10 |
| **New** live probe: self-service actor without `g06.sealedcover.place` cannot call `placeSealedCover` (rules out reason leaking back via the create-echo path) | Yes | PASS — 403; demo employee session (`session.ts`) only grants `g06.promotion.read`/`g06.sealedcover.read`, never `.place`/`.release` | scratchpad probe, check 12; `apps/web/src/app/session.ts:24` |
| Reason-redaction correctness re-check at the repository layer (`promotionDepthRepository.listRefusals`/`listProbations`) | Yes | Repository methods filter by `employeeId` param + tenant scope only — the ownership boundary is correctly enforced one layer up, in the service's `assertSelfOrPromotionOverride` gate before the repository call, not duplicated/bypassed | `apps/api/src/modules/g06/promotionDepthRepository.ts:287-301` |
| `MyPromotionPanel.tsx` component-substance / anti-skeleton check | Yes | PASS — real `Promise.all` of 4 live API calls, real loading/error/empty/ready state machine, real conditional rendering (probation/refusals sections only render when non-empty), `reason` never rendered even though present as an (empty) field on the wire type | `apps/web/src/modules/g06/MyPromotionPanel.tsx:17-143` |
| `npm run build` | Yes | PASS, clean | command output empty (success) |
| `node --test apps/api/test/promotion-posting-self-service.test.cjs` | Yes | PASS 7/7 | `# tests 7 / # pass 7 / # fail 0` |
| Full backend suite `node --test apps/api/test/*.test.cjs` | Yes | PASS 666/667 (1 pre-existing unrelated skip) | `# tests 667 / # pass 666 / # fail 0 / # skipped 1` |
| `npm run web:typecheck` | Yes | PASS, no errors | command output empty (success) |
| `npm run web:test` | Yes | PASS 153/153 | `# tests 153 / # pass 153 / # fail 0` |
| Seed idempotency: `seedTestPromotion`/`seedTestSealedCover` invoked a second time against an already-seeded live services instance | Yes | PASS — order count stayed 1, sealed-cover count stayed 1 after a repeat call | scratchpad idempotency script |
| Seed realism: confirm `issuePromotionOrders` genuinely creates a real document (not a shortcut explaining the `seed-five-employees.test.cjs` document-count change) | Yes | Confirmed — `issuePromotionOrders` calls `this.documentVault.createDocument(...)` + `attach(...)` for every issued order, a real cross-module side effect, not a stub | `apps/api/src/modules/g06/promotionService.ts:1022-1034` |
| Playwright e2e spec review (`promotion-posting-self-service.spec.ts`) | Yes (static only, not executed — no browser runtime in this session) | Exercises the real DPC lifecycle via HTTP, then the real UI panel via a real session token; second test independently re-confirms cross-employee denial through the raw API | `apps/web/test/e2e/promotion-posting-self-service.spec.ts:93-123` |

## Findings

No new findings. All 15 adversarial live probes passed; the reason-redaction logic is sound for
every tested caller shape; `MyPromotionPanel.tsx` has real substance; the seed functions are
realistic (full DPC lifecycle, real cross-module document creation) and idempotent.

Findings already known and intentionally not re-reported here (per the BRD-coverage doc):

- **F1 (MEDIUM, deliberate scope deviation)** — sealed-cover status visibility for the affected
  employee exceeds a strict reading of FR-PPP-008's "authorised roles only" language. Documented,
  reasoned, not blocking. Confirmed unchanged: `reason`/`releaseReason` are still redacted for every
  non-override caller in every probe run this review performed.
- **F2-F4 (HIGH, pre-existing, fixed during implementation)** — tenant-wide dumps with no
  per-employee filter on `listPromotionOrders`, `listPromotionRefusals`/`listProbationRecords`, and
  `listSealedCovers`. Re-verified fixed and holding under this review's additional adversarial
  probes (role near-misses, case sensitivity, query-param injection, module-scoped wildcards) — none
  of which were part of the original 7-test regression suite.

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyPromotionPanel` | `apps/web/src/modules/g06/MyPromotionPanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` (props) | `client.listMyPromotionOrders()`, `client.listMyProbationRecords(employeeId)`, `client.listMyPromotionRefusals(employeeId)`, `client.listSealedCovers()` — 4 real calls via `Promise.all` on mount/refresh | Real `<ul>` lists keyed by record id for orders/probation/refusals; probation and refusals sections conditionally render only when non-empty (real state-driven logic, not static markup); sealed-cover section renders status with a generic confidentiality note only when `SEALED`, never the `reason` field (which is always `""` on the wire for this caller) | **Real component** — full loading/error/empty/ready state machine (`MyPromotionState` discriminated union), no hard-coded/mock data paths, no write actions (correctly read-only per the use case) |

## Verification commands

```bash
npm run build
node --test apps/api/test/promotion-posting-self-service.test.cjs
node --test apps/api/test/*.test.cjs   # full backend suite
npm run web:typecheck
npm run web:test
```

Results as run in this review: `build` clean; targeted suite 7/7; full backend suite 666/667 (1
pre-existing unrelated skip); `web:typecheck` clean; `web:test` 153/153. Additionally, a 15-probe
adversarial `api.dispatch()` script (not part of the committed test suite — ad hoc verification for
this review) ran 15/15 pass, covering query-param manipulation, role/permission near-misses, case
sensitivity, and multi-role combinations across all four self-service reads. A separate idempotency
script confirmed `seedTestPromotion`/`seedTestSealedCover` produce no duplicate records on a second
invocation against an already-seeded live services instance.

## Remaining risks

- The Playwright e2e spec was reviewed statically only (no browser runtime available in this
  session) — its assertions and flow are consistent with the panel's actual API surface and route
  wiring, but end-to-end browser execution was not re-verified here.
- F1 (sealed-cover status visibility scope deviation) remains open by design, pending a future BRD
  amendment to add an explicit `Employee: R(self, status-only)` row to §3.2 — documentation-only,
  not a code risk.
- The pre-existing `auth-matrix.yaml` G06 action-code drift (noted in the BRD-coverage doc) remains
  unaddressed; out of scope for this use case and unrelated to the ownership-gate fixes reviewed here.
- This review's 15-probe adversarial script is not committed to the repository (ad hoc verification
  only); the existing 7-test suite already covers the primary self/stranger/override contrast for
  each read, so no regression-test gap is left uncovered by this review's additional probing.
