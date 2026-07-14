# Full Review: G07 Training Nomination Self-Service

## Addendum 2026-07-14 (hr_admin cross-cutting SoD correction)

`NOMINATION_OVERRIDE_ROLES`/`COMPLETION_OVERRIDE_ROLES` in `trainingService.ts` no longer include
`hr_admin` — per an explicit instruction from a later `hr_admin` role-capability audit ("hr_admin
has no direct grants in G07 — owned by ld_officer/ld_manager"), `hr_admin` was removed, leaving
`ld_manager`/`ld_officer`/`system` (and `trainer` for completion recording). Full backend suite
(42/42 G07-relevant tests, plus the full 680-test suite) re-verified green after the change — no
existing test relied on a bare `hr_admin`-role (non-wildcard) actor for G07 override access.
Verdict unchanged (PASS) — this is a scope-narrowing correction, not a defect in the original
feature.

## Verdict
PASS (post-remediation)

**Update 2026-07-13 (post-review verification):** F1 (wire leak) is fixed and re-verified —
`toWireSession()`/`toWireNomination()` helpers now exist in `apps/api/src/routes/g07.routes.ts:12-25`
and are applied at both read routes. A live `api.dispatch()` probe against
`GET /api/v1/training/sessions` confirmed only `id`/`programCode`/`title`/`capacity`/`enrolled`/`status`
are returned (no `tenantId`/`entityId`); the nominations route's `Omit<TrainingNomination,
"tenantId" | "entityId" | "workflowInstanceId">` return type structurally guarantees the same for
that route. F2 was already noted as resolved-by-F1 in the original review. Full backend suite
re-confirmed green (657/658, 1 pre-existing skip).

Original review text below, retained for evidence trail.

---

One CRITICAL-class anti-pattern (wire leak of internal fields, empirically confirmed) is present but is data-exposure/hardening in nature rather than a broken workflow or auth bypass — all authorization and identity checks verified correct. Ships only after the wire-stripping gap is remediated (or explicitly risk-accepted), per the project's own established pattern for this exact class of issue (G01/G03/G10/G12).

## Scope
- target: "Apply for training / view nominations" self-service use case (G07)
- selected path: light/standard (brownfield addition to an existing module, self-or-override authorization pattern reused from 4 prior fixes this session)
- files reviewed:
  - `apps/api/src/modules/g07/trainingService.ts` (full file, 1285 lines)
  - `apps/api/src/routes/g07.routes.ts` (full file, 663 lines)
  - `apps/api/src/platform/foundationServices.ts` (TrainingService construction site)
  - `apps/api/src/platform/workflow/hrmsWorkflowService.ts` (full file — `act()`/`actOnInstance()`)
  - `apps/web/src/modules/g07/MyTrainingPanel.tsx` (new)
  - `apps/web/src/modules/g07/TrainingNominationForm.tsx`
  - `apps/web/src/App.tsx` (route wiring, lines 150-199)
  - `apps/web/src/app/session.ts` (permission grant)
  - `apps/web/src/api/hrmsClient.ts` (types + methods, lines 1078-1127, 1194-1195, 1617-1619)
  - `apps/web/src/api/fixtureHrmsClient.ts` (fixture reshape + consumers, lines 637-640, 1402-1422)
  - `apps/api/src/seed/testEmployeesSeed.ts` (`seedTestTraining`, lines 585-596)
  - `apps/api/test/training-nomination-self-service.test.cjs` (full file, 5 tests)
  - `apps/web/test/e2e/training-nomination-self-service.spec.ts` (full file, 1 test)
  - `apps/api/test/ph08-g07-g08-training-apar.test.cjs`, `apps/api/test/ph08d-g07-g08-depth.test.cjs` (pre-existing callers of `nominate()`/`completeNomination()`, spot-checked for blast radius)
- artefacts used: `docs/reviews/brd-coverage-g07-training-nomination-self-service-2026-07-13.md` (pre-existing known-gaps register, consulted to avoid re-reporting no-dup-check / no-budget-integration / no-withdrawal-flow as new findings)

## Checks run
| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Full API test suite | Yes | 625 pass, 1 pre-existing skip, 0 fail, out of 626 | `node --test apps/api/test/*.test.cjs` → `# pass 625 # fail 0 # skipped 1` |
| TypeScript build/typecheck | Yes | Clean, no errors | `npm run build` (`npx tsc -p tsconfig.json`) exits with no output/errors |
| Blast-radius spot check: pre-existing `nominate()`/`completeNomination()` callers | Yes | Both use wildcard `permissions: ["*"]` actors | `ph08-g07-g08-training-apar.test.cjs:11-23` `actor()` has `permissions: ["*"]`; `ph08d-g07-g08-depth.test.cjs:18-30` `actor()` has `permissions: ["*"]` |
| `approveNomination()` identity enforcement (architectural read) | Yes | `HrmsWorkflowService.act()` enforces `isResolvedAssignee`/`isOverrideActor` for APPROVE/REJECT/SEND_BACK regardless of calling module | `hrmsWorkflowService.ts:107-115` |
| `approveNomination()` identity enforcement (empirical) | Yes | Self-approval → 403; unrelated stranger → 403; real resolved manager → 202 | Live `api.dispatch()` probe, see Findings evidence below |
| `assertCanNominate` / `workflow.start()` as-of date agreement | Yes | Both hardcode `"2026-07-02"` | `trainingService.ts:172` (listMyNominations), `trainingService.ts:195` (workflow.start asOf), `trainingService.ts:249` (assertCanNominate resolve asOf) |
| `listSessions()`/`listMyNominations()` wire-leak check | Yes | CONFIRMED: `tenantId`, `entityId` leak via both; `workflowInstanceId` additionally leaks via `listMyNominations()` | Live `api.dispatch()` probe, see Findings evidence below |
| Fixture `trainingSessions` reshape blast radius | Yes | Only 2 consumers besides the definition: `nominateForTraining` (uses `.capacity`/`.id`, both pre-existing fields) and `listTrainingSessions` (spreads whole object); `TrainingWorkspace.tsx` does not reference session list fields | `grep -n "trainingSessions" apps/web/src/api/fixtureHrmsClient.ts` → 3 hits total (def + 2 uses); `grep` for session field usage in `TrainingWorkspace.tsx` → no hits |
| TrainingService single construction site | Yes | Confirmed, one call site | `foundationServices.ts:428-438` |
| UI review (MyTrainingPanel substance) | Yes | Real API calls, real states, real rendering — see Component substance check | `MyTrainingPanel.tsx:11-98` |
| Label/id pairing on TrainingNominationForm | Yes | Unchanged, correctly paired | `TrainingNominationForm.tsx:88-96`, `97-105` (`htmlFor="g07-session-id"`/`id="g07-session-id"`, `htmlFor="g07-employee-id"`/`id="g07-employee-id"`) |
| ARIA region naming | Yes | Both panel and form use `aria-label`, matched by Playwright `getByRole("region", {name: ...})` | `MyTrainingPanel.tsx:53` (`aria-label="G07 my training"`), `TrainingNominationForm.tsx:80` (`aria-label="G07 training nomination"`), confirmed consumed in `training-nomination-self-service.spec.ts:48,55` |
| session.ts permission-string fix | Yes | `g07.nomination.submit` present (matches runtime check), not the old `g07.training.nominate` | `apps/web/src/app/session.ts:21` |
| BRD-coverage cross-reference (no re-reporting known gaps) | Yes | No-dup-check, no-budget-integration, no-withdrawal-flow confirmed already documented | `docs/reviews/brd-coverage-g07-training-nomination-self-service-2026-07-13.md` (exists) |

## Findings
| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F1 | CRITICAL/P0 | Security (data exposure) | `apps/api/src/modules/g07/trainingService.ts:163` (`listSessions`), `:177` (`listMyNominations`) | Both new read methods return raw internal rows via shallow spread (`{ ...session }` / `{ ...nomination }`) with no wire-stripping helper, unlike the `toWireX()` pattern established for this exact class of issue in G01/G03/G10/G12 this session. `TrainingNomination` additionally carries `workflowInstanceId` (an internal workflow-engine primary key) which is not meant for client consumption. | Live `api.dispatch()` probe against `GET /api/v1/training/sessions` returned `{"id":"training-session-000001","tenantId":"11111111-...","entityId":"22222222-...","programCode":"PROG-LEAD-101",...}`; `GET /api/v1/training/employees/{id}/nominations` returned `{"id":"training-nomination-000001","tenantId":"...","entityId":"...","nominationNo":"TN/00001","sessionId":"...","employeeId":"...","status":"APPROVED","workflowInstanceId":"workflow-000004"}`. Both `tenantId`/`entityId`/`workflowInstanceId` are absent from the client-side `TrainingSessionView`/`TrainingNominationView` TS interfaces (`hrmsClient.ts:1083-1105`), so the type layer silently disagrees with the real wire shape — an unaware client parsing the JSON receives untyped extra fields. | Add `toWireSession()`/`toWireNomination()` helpers in `trainingService.ts` that strip `tenantId`, `entityId`, and (for nominations) `workflowInstanceId` before returning from `listSessions()`/`listMyNominations()`; apply consistently to any other new/modified read paths that reuse these interfaces. | Yes — implementation-only fix, no contract/LLD change (mirrors an already-applied pattern in sibling modules) |
| F2 | LOW/P3 | Quality (type accuracy) | `apps/web/src/api/hrmsClient.ts:1083-1105` | `TrainingSessionView`/`TrainingNominationView` TS interfaces omit fields (`tenantId`, `entityId`, `workflowInstanceId`) that the live server response actually includes, per F1. This is a symptom of the same root cause as F1 — once F1 is fixed, the types become accurate by construction and no separate edit is needed here. | Same live probe evidence as F1. | No action needed beyond fixing F1 (fixing F1 makes the wire shape match the existing type declarations; do not widen the TS interfaces to declare the leaked fields). | N/A (resolved by F1) |

No other CRITICAL/HIGH findings. Everything else checked (self-or-override authorization logic, date consistency between nominate-eligibility and approval-routing resolution, approveNomination's reliance on the shared workflow-identity gate, fixture reshape blast radius, UI substance, accessibility, permission-string fix) verified correct with no discrepancy from the author's claims.

## Component substance check
| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| MyTrainingPanel | `apps/web/src/modules/g07/MyTrainingPanel.tsx` | `client`, `employeeId`, `refreshToken` (props); no internal form state | `client.listTrainingSessions()`, `client.listMyTrainingNominations(employeeId)` via `Promise.all` in a real `useEffect`, re-fetches on `refreshToken` change | Real: session title/programCode/status/enrolled/capacity/id per row; nomination number/status/waitlist position per row; explicit loading/error/empty/ready states via `OperationalState` | Real substance — not a skeleton. Genuine network calls, real list rendering, all four required states present. |
| TrainingNominationForm | `apps/web/src/modules/g07/TrainingNominationForm.tsx` | `client`, `defaultEmployeeId`, `initialPhase`, `onSubmitted` (new prop this session) | `client.nominateForTraining(...)` on submit | Real: client-side validation errors, server error-code-to-message mapping, success message with real nomination number/capacity/waitlist feedback; `onSubmitted?.()` correctly wired to trigger parent refetch (verified via `bump` passed from `App.tsx:188`) | Real substance — pre-existing component; the new `onSubmitted` callback is additive and does not regress the existing submit/error/success flow. |

## Traceability impact
- New routes `GET /api/v1/training/sessions` and `GET /api/v1/training/employees/{id}/nominations` are now live and covered by `apps/api/test/training-nomination-self-service.test.cjs` (5 tests, all passing) and one Playwright e2e test.
- `docs/reviews/brd-coverage-g07-training-nomination-self-service-2026-07-13.md` already documents the known BRD gaps (no dup-check, no budget integration, no withdrawal/waitlist-promotion) — this review does not duplicate those.
- F1 should be logged against the same traceability line item that tracked the equivalent fix in G01/G03/G10/G12, since it is the same finding class recurring in a 5th module.

## Required amendments
None. F1 is an implementation-only repair (add a stripping helper); it does not require a requirements, contract, or LLD amendment — the wire shape for these fields was never specified to include internal ids, so removing them brings the implementation in line with the implicit (and, in sibling modules, explicit) contract.

## Verification commands
```bash
# Full API suite (must stay at 625 pass / 1 skip / 0 fail after any repair)
npm run build && node --test apps/api/test/*.test.cjs

# Typecheck
npx tsc -p tsconfig.json --noEmit

# Re-run the live wire-shape probe after adding toWireSession()/toWireNomination():
# GET /api/v1/training/sessions and GET /api/v1/training/employees/{id}/nominations
# should no longer include tenantId/entityId/workflowInstanceId in the JSON body.

# Web e2e (requires local dev server per project convention)
npx playwright test apps/web/test/e2e/training-nomination-self-service.spec.ts --config apps/web/playwright.config.ts
```

## Remaining risks
- F1 (wire leak) is the only blocking risk; it is a hardening/data-exposure issue, not an auth-bypass — no unauthorized actor gains capability from the leaked `workflowInstanceId`/`tenantId`/`entityId` today (all reads remain scope- and self-or-override-gated), but leaking internal primary keys/tenancy ids is inconsistent with the pattern this same session established as required in 4 sibling modules, and could aid an attacker chaining calls against internal ids in future.
- Pre-existing, already-flagged and out-of-scope-for-this-review: no `UNIQUE(session, employee)` duplicate-nomination check, no budget-commit integration, no withdrawal/waitlist-promotion flow (all documented in the BRD-coverage artefact; a passing test explicitly demonstrates the duplicate-nomination gap at `training-nomination-self-service.test.cjs:85-87`).
- The hardcoded `"2026-07-02"` as-of date recurs in three places in `trainingService.ts` (`assertCanNominate`, `listMyNominations`, `workflow.start()`); all three agree today, but any future edit to one without the others would silently desync "who can nominate" from "who approves" — worth a shared constant if this file is touched again (not raised as a numbered finding since it is speculative/preventive, not a present bug).
