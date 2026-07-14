# Full Review: G12 Service Register Self-Service

## Verdict
PASS (post-remediation)

**Update 2026-07-13 (post-review verification):** F1 (the `getEvent()` IDOR) is fixed and
re-verified — `serviceRegisterService.ts:255-266` now applies the identical self-scope guard as
`getTimeline()`, and `g12.routes.ts`'s `requireSrEvent()` threads `context.actor` (not
`context.scope`). A dedicated regression test exists and passes: "GET /api/v1/sr/events/{id}
enforces the same self-scope as the timeline (was live-exploitable before this fix)"
(`service-register-self-service.test.cjs`, 5/5 pass). F2 (wire-field convention) and F3
(`getStatusChain`/`getEntryChain` still scope-only) are both already explicitly named in
`docs/reviews/brd-coverage-g12-service-register-self-service-2026-07-13.md`'s gap table — the same
"pre-existing, out of this specific self-service scope, flagged not silently dropped" treatment
applied to the analogous G11 PDA-leak finding. F4/F5 are judgment/documentation-only, non-blocking
per the original review. Full backend suite re-confirmed green (657/658, 1 pre-existing skip).

Original review text below, retained for evidence trail.

---

The self-scope fix on `getTimeline()` is correctly implemented, live-verified, and does not regress any of its 20 known call sites (18 test files + 2 production call sites + 2 unwired `.test.ts` files). However, an analogous, independently-confirmed-live IDOR remains open on `GET /api/v1/sr/events/{id}` (`getEvent()`), and the wire response leaks internal `tenantId`/`entityId` linkage fields inconsistently with this session's own `toWireX()` precedent. Neither blocks the specific fix under review from being safe to ship, but both are real, evidenced gaps that should not be treated as settled.

## Scope
- target: G12 Service Register self-service timeline fix (`getTimeline` self-scope enforcement) + App.tsx wiring fix + supporting seed/test additions
- selected path: light (focused security fix + wiring fix on a stable contract, per CLAUDE.md process classification)
- files reviewed:
  - `apps/api/src/modules/g12/serviceRegisterService.ts`
  - `apps/api/src/modules/g12/srIntegrityService.ts`
  - `apps/api/src/routes/g12.routes.ts`
  - `apps/web/src/App.tsx`
  - `apps/web/src/modules/g12/ServiceRegisterTimeline.tsx`
  - `apps/api/src/seed/testEmployeesSeed.ts`
  - `apps/api/test/service-register-self-service.test.cjs` (new)
  - `apps/web/test/e2e/service-register-self-service.spec.ts` (new)
  - `apps/api/src/modules/g04/leaveSrRelayService.ts` (blast-radius check, not modified this session)
  - `apps/api/src/platform/types.ts` (`ActorContext`/`TenantScope` definitions)
  - Comparator files: `apps/api/src/routes/g01.routes.ts`, `apps/api/src/routes/g03.routes.ts`, `apps/api/src/routes/g10.routes.ts`, `apps/web/src/modules/g10/MyPayslipsPanel.tsx`
- artefacts used: `docs/reviews/brd-coverage-g12-service-register-self-service-2026-07-13.md` (pre-existing, same session); `docs/contracts/auth-matrix.yaml` (checked for `g12.sr.*` permission bindings — found to use different action-code naming than the route permission strings, a pre-existing drift not attributable to this fix)

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Full backend suite independently re-run | Yes | 619 pass / 1 skip / 0 fail | `node --test apps/api/test/*.test.cjs` output: `# tests 620 / # pass 619 / # fail 0 / # skipped 1` — matches author's claim |
| `npm run build` (typecheck) | Yes | Clean | No tsc errors |
| Spot-check 3 different `getTimeline` test fixtures not mentioned by author | Yes | All 3 use `permissions: ["*"]` | `apps/api/test/ph08-g09-disciplinary.test.cjs:11-23`, `apps/api/test/ph09-g11-pension.test.cjs:20-32`, `apps/api/test/ph16d-g05-counselling-vacancy-mutual.test.cjs:26-38` |
| Enumerate all `getTimeline(` call sites (not trusting author's "~25" count) | Yes | 20 sites found (18 test files, 2 production call sites in `srIntegrityService.ts`/`leaveSrRelayService.ts`, 2 unwired `.test.ts` files) | `grep -rn "getTimeline(" apps/api/test/*.test.cjs apps/api/src/modules/**/*.ts` |
| Check production (non-test) `getTimeline` callers for actor-vs-scope mismatch | Yes | Clean — `leaveSrRelayService.reconcile(scope)` (route-wired) never calls `getTimeline`; only `runReconciliation(actor,...)` does, and that method is not wired to any route | `apps/api/src/routes/g04.routes.ts:41` calls `reconcile(context.scope)`; `runReconciliation` has zero route references (`grep -n "runReconciliation" apps/api/src/routes/*.ts` empty) |
| Compile + run the 2 colocated `.test.ts` files not in `npm test` | Yes | Both pass | `node --test dist/apps/api/src/modules/g01/g01ToG12SrIngest.test.js dist/apps/api/src/modules/g12/srSemanticDedup.test.js` → `# pass 2 / # fail 0` |
| Confirm those 2 `.test.ts` files' `scope` variables are really `ActorContext` (not a type-hole) | Yes | Confirmed — misleading variable name only | `apps/api/src/modules/g12/srSemanticDedup.test.ts:34-40` `function actor(): ActorContext` returns full actor with `permissions:["*"]`, assigned to a local named `scope` |
| Live-test the FORBIDDEN path via `api.dispatch()` (not just trust the 4 new tests) | Yes | Reproduced: cross-employee access → `403 FORBIDDEN` | Ad hoc script against `dist/apps/api/src` (removed after use); own access 200, cross-employee 403, hr_admin override 200 |
| Check whether `toView()` strips internal fields before the wire | Yes | Does NOT strip anything — `tenantId`/`entityId` reach the wire verbatim | `serviceRegisterService.ts:369-371`; live response body confirmed `tenantId`, `entityId` present |
| Confirm/deny the `getEvent()` vulnerability claim | Yes — CONFIRMED LIVE | Rohan (non-owner) fetched Meera's SR event via `GET /api/v1/sr/events/{id}` and received `200` with the full event body | `serviceRegisterService.ts:254-258` (no self-scope check); `g12.routes.ts:629-635` `requireSrEvent` passes `context.scope` only; live repro returned status 200 |
| Check `getStatusChain()` in `srIntegrityService.ts` for the same scope-vs-actor issue flagged for `getTimeline` | Yes | Confirmed inconsistency in the same function, but not a regression from this session | `srIntegrityService.ts:508,519,524` — `issueCertifiedExtract(actor, scope, input)` uses `actor` for `getTimeline` (line 519, this session's fix) but `scope` for `getStatusChain` (line 524); `getStatusChain` itself has never had a self-scope check |
| Compare `toWireX()` pattern consistency across the 3 referenced prior fixes | Yes | Inconsistent: bank account / attendance strip only the maker-id field and leave `tenantId`/`entityId` on the wire; payslip additionally strips `tenantId`/`entityId`/`runId`/`calcTrace` | `g01.routes.ts:13-16`, `g03.routes.ts:10-13` vs. `g10.routes.ts:12-27` |
| UI: verify `ServiceRegisterTimeline.tsx` renders correctly with threaded identity | Yes | Renders real loading/error/empty/ready states, ARIA region, pagination, hash-chain display; only one production call site (`App.tsx:183`), which now always supplies `employeeId` | `apps/web/src/modules/g12/ServiceRegisterTimeline.tsx:69-141`; `App.tsx:183` |
| Judge the "kept fallback, unlike MyPayslipsPanel" reasoning | Yes | Reasoning partially holds (multiple legit non-self viewer roles exist per FR-09) but the fallback is not currently exercised by any second call site — it is speculative reuse-proofing, and being optional (not required) reintroduces the exact silent-wrong-employee risk class this fix just corrected, should a future call site omit the prop | `ServiceRegisterTimeline.tsx:61-67` (`employeeId?: string`) vs. `MyPayslipsPanel.tsx:25-30` (`employeeId: string`, required, with an explicit "no safe fallback" comment) |
| Test rigor: are the 4 new backend tests + 2 e2e tests meaningful? | Yes | Meaningful — real HTTP dispatch, real seeded data, assert both allow and 403-deny paths, not tautological | `apps/api/test/service-register-self-service.test.cjs:36-67`; `apps/web/test/e2e/service-register-self-service.spec.ts:54-72` |
| Seed change isolation/idempotency | Yes | Opt-in only, default boot unaffected, idempotent re-run confirmed | `node --test apps/api/test/seed-five-employees.test.cjs` → 4/4 pass |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F1 | HIGH/P1 | Security | `apps/api/src/modules/g12/serviceRegisterService.ts:254-258`; `apps/api/src/routes/g12.routes.ts:629-635` | `getEvent()` has the identical missing-self-scope gap `getTimeline()` had, and is live-exploitable today via `GET /api/v1/sr/events/{id}` | Live repro: actor `rohan` (no override role, no wildcard) fetched employee `meera`'s SR event by id and received `200` with the full event body including payload | Apply the same `actor`/override-role check used in `getTimeline()` to `getEvent()`, and thread `context.actor` through `requireSrEvent()` in `g12.routes.ts` (also used by the corrigendum/dispute/dispute-resolution write-annotation routes, which read-before-write via this same helper) | Yes — implementation-only fix, same pattern already established in this session |
| F2 | MEDIUM/P2 | Security | `apps/api/src/modules/g12/serviceRegisterService.ts:369-371` (`toView`) | The SR timeline wire response includes `tenantId` and `entityId` verbatim (internal multi-tenancy linkage fields), with no stripping, inconsistent with the `toWirePayslipRecord()` precedent set in this same session which explicitly strips `tenantId`/`entityId` as "internal-only fields" | Live response body confirmed `tenantId: "11111111-…"` and `entityId: "22222222-…"` present in `items[0]`; `g10.routes.ts:12-14` comment calls the identical fields "internal... with no business meaning to an employee" | Decide one convention and apply it consistently: either (a) treat `tenantId`/`entityId` as acceptable wire fields everywhere (matching `toWireBankAccount`/`toWireAttendance`, in which case no G12 change needed and the payslip route's stripping was the outlier), or (b) add a `toWireSrEvent()` at the G12 route layer to strip them, matching payslip. This is a repo-wide convention decision, not solely a G12 bug — recommend an amendment/decision, not a silent fix in either direction | Conditionally — the SR-specific piece is implementation-level, but the convention question should be settled once, not per-module |
| F3 | MEDIUM/P2 | Quality/Consistency | `apps/api/src/modules/g12/srIntegrityService.ts:508,519,524` | `issueCertifiedExtract()` now correctly uses `actor` for `getTimeline` (this session's fix) but still uses `scope` for `getStatusChain` two lines below, in the same function, over the same employeeId | `srIntegrityService.ts:519` (`this.serviceRegister.getTimeline(actor, input.employeeId)`) vs. `524` (`this.serviceRegister.getStatusChain(scope, input.employeeId)`) | Not a regression — `getStatusChain` never had self-scope enforcement, so this is a pre-existing gap surfaced by the adjacent fix, not introduced by it. `g12.sr.extract.issue` also has no static role binding found in the repo (permissions appear caller-supplied), so exploitability is lower priority than F1. Recommend adding the same self-or-override check to `getStatusChain`/`getEntryChain` in a follow-up, tracked alongside F1 | Yes, when scheduled — same pattern, low risk |
| F4 | LOW/P3 | UI / Judgment | `apps/web/src/modules/g12/ServiceRegisterTimeline.tsx:61-67` | The documented reasoning for keeping the optional `employeeId` fallback (vs. `MyPayslipsPanel`'s required prop) is plausible but not fully proven: there is currently no second call site that uses the fallback, so it is speculative future-proofing rather than an active reuse need, and being optional (not required) preserves the exact "silent wrong-employee default" risk class this fix just corrected | `grep -rn "ServiceRegisterTimeline" apps/web/src` shows exactly one production call site (`App.tsx:183`), which now always supplies `employeeId`; the prop remains `employeeId?: string`, so a future omission would compile silently | No action required now (judgment-only, does not block). If/when a team-facing SR viewer call site is added, consider whether it can pass its own explicit employeeId (in which case the prop could become required, matching `MyPayslipsPanel`) rather than relying on the fallback | No — judgement/taste finding, routed to release/UX gate per evidence rules, not blocking |
| F5 | LOW/P3 | Documentation | `docs/contracts/auth-matrix.yaml:1357-1406` vs. route permission strings (e.g., `g12.sr.extract.issue`, `g12.sr.read`) | The auth-matrix action codes for G12 (`g12.sr.append`, `g12.extract.certify`, `g12.sr.read_full`, etc.) do not match the actual permission strings enforced in `g12.routes.ts` (`g12.sr.ingest`, `g12.sr.extract.issue`, `g12.sr.read`) | `grep -n "g12\." docs/contracts/auth-matrix.yaml` vs. `grep -n "permission:" apps/api/src/routes/g12.routes.ts` | Pre-existing drift, not introduced or worsened by this session's diff. Flag for a contracts-generator pass, out of scope for this fix | No — contract amendment, not implementation repair |

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `ServiceRegisterTimeline` | `apps/web/src/modules/g12/ServiceRegisterTimeline.tsx` | `client`, `employeeId` (now correctly threaded from session), `pageSize`, `initialState` | `client.getServiceRegisterTimeline(employeeId, {limit, cursor})` — real cursor pagination | Renders sequence no., event type code, event date, source module, entryHash/previousHash prefixes, load-more affordance, loading/error/empty/ready states, ARIA `region` labeled "Service Register timeline" | Real, substantive component — no skeleton concerns |

## Traceability impact

- `docs/reviews/brd-coverage-g12-service-register-self-service-2026-07-13.md` (pre-existing, same session) already documents BR-09.1 remediation and explicitly flags the `getEvent()` gap as "a real, analogous gap worth a fast-follow" — this review's live reproduction (F1) upgrades that from a documented-but-unverified claim to an independently confirmed, exploitable finding. No change needed to that document's content, but F1 should be tracked to closure rather than left open indefinitely.
- No BRD/contract/state-machine amendment is required for F1's fix (same pattern as the already-approved `getTimeline` fix). F2 (wire field convention) touches a cross-cutting decision that may warrant a guideline note if the project wants one canonical convention for `tenantId`/`entityId` on wire responses.

## Required amendments

None strictly required to ship the reviewed diff (the `getTimeline` self-scope fix and App.tsx wiring fix are both correct and safe in isolation). However:
- F1 should be scheduled as a fast-follow fix (implementation-only, same pattern, low risk).
- F2 should be resolved as a one-time convention decision (guideline or contract note) rather than fixed ad hoc per module, to avoid a third inconsistent variant appearing in a future G-module fix.

## Verification commands

```bash
npm run build
node --test apps/api/test/*.test.cjs
node --test dist/apps/api/src/modules/g01/g01ToG12SrIngest.test.js dist/apps/api/src/modules/g12/srSemanticDedup.test.js
node --test apps/api/test/service-register-self-service.test.cjs
node --test apps/api/test/seed-five-employees.test.cjs
```

## Remaining risks

- F1 (`getEvent()` IDOR) is live and exploitable by any actor holding `g12.sr.read` today, including plain employees, against any other employee's individual SR event. It is not exercised by the current UI, but it is a directly callable API route with no UI gate protecting it.
- The corrigendum/dispute/dispute-resolution write routes read their target event via the same vulnerable `requireSrEvent()`/`getEvent()` helper before writing — an actor without SR-read authorization over that employee could still learn the event's content as a side effect of attempting a write action gated by a different permission (`g12.sr.corrigendum`/`g12.sr.dispute`), if such an actor holds that permission but not `g12.sr.read` scope over that employee. This was not separately load-tested but follows directly from F1's mechanism.
- No `sr_access_log` audit-on-read exists (already flagged, pre-existing, not new) — combined with F1, there is currently no audit trail of who viewed which employee's individual SR events via the vulnerable route.
- The wire-field-stripping convention (F2) is inconsistent across 3 modules fixed in this same session; a 4th module fixed independently in the future is likely to pick a third variant unless a single convention is written down.
