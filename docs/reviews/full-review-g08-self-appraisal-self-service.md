# Full Review: G08 Self-Appraisal Self-Service

## Update 2026-07-13 (post-review verification)

F-02 (MEDIUM) has been fixed: the `POST /api/v1/apar/forms` route handler
(`apps/api/src/routes/g08.routes.ts`) now forwards `cycleId` from the request body into
`openForm()`, so a form can actually be opened against a cycle over HTTP — the per-goal
rating-scale-bounds check in `submitSelf()` is reachable. Fixing this also surfaced the related
F-03 (LOW) latent bug it was gating: `readSelfRatings()` coerced ratings with a bare `Number(...)`,
so a non-numeric rating became `NaN`, and `NaN < min`/`NaN > max` are both `false` — the bounds
check would have silently passed a garbage rating through once reachable. `readSelfRatings()` now
throws `FoundationError("VALIDATION_FAILED", ...)` (400) for any non-finite parsed rating instead
of silently admitting `NaN`.

Added a dedicated regression test (`self-appraisal-self-service.test.cjs`, "opening a form over
HTTP threads cycleId through, enforcing the cycle's rating-scale bounds on self-submit") that
defines a real rating scale + template + cycle over HTTP, opens a form with and without `cycleId`,
confirms a dangling `cycleId` 404s, confirms an out-of-scale rating is rejected 400
`VALIDATION_FAILED`, confirms a non-numeric rating is rejected 400 rather than silently coercing,
and confirms an in-bounds rating succeeds. Targeted suite re-run at 8/8, full backend suite at
659/660 (1 pre-existing unrelated skip), `npm run build` clean.

**Verdict: PASS (post-remediation)**

Original review text preserved below.

---

## Verdict
**CONDITIONAL** — core security property (self-scope enforcement) is correctly implemented, live-verified, and matches the repo-wide `assertSelfOrOverride` convention exactly. Wire-stripping is thorough across all touched routes. No CRITICAL findings. Two pre-existing MEDIUM gaps and one LOW hardening item are carried forward or newly precision-scoped; none block the reviewed use case (submit self-appraisal) from working correctly and safely.

## Scope
- **Target**: G08 self-appraisal self-service (FR-G08-03) — appraisee discovers own APAR forms and submits self-appraisal (achievements narrative + optional per-goal self-ratings).
- **Selected path**: Light/focused review of a scoped diff (consistent with the BRD coverage doc's use-case-scoped framing).
- **Files reviewed**:
  - `apps/api/src/modules/g08/aparService.ts` (diff: `assertSelfOrOverride`, `listMyForms`, `submitSelf`, `fileRepresentation`)
  - `apps/api/src/routes/g08.routes.ts` (diff: `toWireAparForm`/`toWireGoalSnapshot`/`toWireDisclosure`/`toWireReportPeriod`/`toWireRepresentation`, new `GET /api/v1/apar/employees/{id}/forms`, `readSelfRatings`)
  - `apps/web/src/modules/g08/MyAppraisalPanel.tsx` (new, 139 lines)
  - `apps/web/src/modules/g08/AparTierForms.tsx` (diff: narrative field added to existing tier form)
  - `apps/api/test/self-appraisal-self-service.test.cjs` (new, 7 tests)
  - `apps/web/test/e2e/self-appraisal-self-service.spec.ts` (new, 1 Playwright test)
  - `apps/web/src/App.tsx`, `apps/web/src/app/session.ts`, `apps/web/src/app/navigation.ts` (wiring)
  - `apps/web/src/api/hrmsClient.ts` (client method + types)
- **Artefacts used**: `docs/reviews/brd-coverage-g08-self-appraisal-self-service-2026-07-13.md` (read first; deferred gaps from that pass are not re-reported below except where re-scoped with new precision). Reference SOD/self-scope patterns: `apps/api/src/modules/g01/bankAccountService.ts`, `apps/api/src/modules/g12/serviceRegisterService.ts`, `apps/api/src/platform/workflow/hrmsWorkflowService.ts`.
- Reviewed at commit `b6eb51a` (working tree, uncommitted diff).

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| `npm run build` (tsc, full monorepo) | Yes | PASS, zero errors | Clean exit, no diagnostics output |
| `node --test apps/api/test/self-appraisal-self-service.test.cjs` | Yes | PASS 7/7 | `# pass 7 / # fail 0`, duration 411ms |
| `npm run web:typecheck` | Yes | PASS, zero errors | Clean `tsc --noEmit` exit |
| `node --test apps/web/test/*.test.cjs` (full web unit suite) | Yes | PASS 153/153 | `# pass 153 / # fail 0` |
| `npx playwright test -g self-appraisal` | Yes | PASS 1/1 | "1 passed (14.0s)" against live dev server |
| Live `api.dispatch()` probe: cross-employee read/submit rejection | Yes | PASS — confirmed 403 for manager and stranger | Custom probe script, see Findings F-01 |
| Live `api.dispatch()` probe: wildcard-permission bypass check | Yes | Confirmed intentional, repo-wide convention | grep across 8 sibling modules, all identical `permissions?.includes("*")` gate |
| Live `api.dispatch()` probe: idempotency-key replay with different payload | Yes | Correct CONFLICT/409 via platform `IdempotencyReplayStore` | See Findings section, F-04 (informational) |
| Live `api.dispatch()` probe: wire-leak deep key inspection on `listMyForms` | Yes | No `tenantId`/`entityId`/`workflowInstanceId`/`documentId`/`srEventId` present | Probe output: 13 whitelisted keys only |
| Live `api.dispatch()` probe: non-numeric self-rating + cycle-bound scale reachability | Yes | Confirmed `openForm` route never wires `cycleId` from body → scale-bounds path unreachable via HTTP | See Finding F-02 |
| Cross-check `assertSelfOrOverride` shape vs. `g12`/`g01`/workflow reference patterns | Yes | Matches convention exactly (private method, `*_OVERRIDE_ROLES` Set, `FORBIDDEN` code, wildcard+role bypass) | Sub-agent evidence gather, quoted in Findings |
| UI accessibility spot-check (label/id pairing, ARIA region, keyboard) | Yes | PASS, no issues found | `MyAppraisalPanel.tsx` lines 116-122, 89 |
| Anti-skeleton component substance check | Yes | PASS — real API calls, real state machine, real form fields | See Component substance table |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F-01 | — (verification, not a defect) | Security | `apps/api/src/modules/g08/aparService.ts:1100-1104` | Self-scope enforcement on `listMyForms`/`submitSelf`/`fileRepresentation` is correctly implemented and matches the repo-wide `assertSelfOrOverride` convention. | Live probe: employee-actor reading/submitting own form → 200/202; same actor for a *different* employeeId → 403 `FORBIDDEN`; Rohan's real resolved manager Arjun → 403 (BRD explicitly excludes the reporting-chain manager, unlike G07); HR/APAR-Cell override role (`hr_admin`) → 202 success. All 4 branches independently reproduced outside the pre-written test suite. | None — confirms PASS. | N/A |
| F-02 | MEDIUM/P2 | Quality/correctness | `apps/api/src/routes/g08.routes.ts:63-75` (openForm handler) vs. `apps/api/src/modules/g08/aparService.ts:110-121` (service signature) | The `openForm` route handler never reads/forwards `cycleId` from the request body, even though `AparService.openForm()`'s `input` type accepts and validates it (line 120-121, 131-133). Consequence: no APAR form can ever be created via HTTP with a bound cycle/rating-scale, which means `submitSelf`'s per-goal rating scale-bounds check (`aparService.ts:204`, `if (scale && (rating < scale.minValue || rating > scale.maxValue))`) is currently **unreachable through any route** — not merely "not exhaustively exercised" as the BRD coverage doc states, but structurally unreachable until the route is fixed. | Live probe: created rating scale (1-10), template, cycle; opened a form with `cycleId` in the body → `openForm` response has `cycleId: undefined`. Confirmed by reading `g08.routes.ts:66-74`, which lists `employeeId/periodStart/periodEnd/reportingOfficerId/reviewingOfficerId/acceptingAuthorityId/underCharge` only — no `cycleId`. | Add `cycleId: optionalString(body, "cycleId")` to the `openForm` route handler's forwarded input. Pre-existing gap, not introduced by this session's diff (route wasn't touched by the reviewed diff) — route amendment, not implementation repair of new code. | No — pre-existing route surface gap outside this session's diff; route it as a follow-up amendment, not a repair of the reviewed change. |
| F-03 | LOW/P3 | Quality/hardening | `apps/api/src/routes/g08.routes.ts:803-814` (`readSelfRatings`) | `readSelfRatings()` converts each rating value via bare `Number(rating)` with no `Number.isFinite` guard. A non-numeric rating (e.g. `"abc"`) becomes `NaN`; `NaN < min` and `NaN > max` both evaluate `false` in `aparService.ts:204`, so the scale-bounds check would silently pass a garbage value if it were ever reached. | Confirmed via code reading; **not independently live-exploitable today** because F-02 already makes the scale-bound branch unreachable (no route path binds a `cycleId` at form-open time, so `scale` is always `undefined` and the bounds branch never executes in the current HTTP surface). Latent/theoretical until F-02 is fixed. | When F-02 is fixed, add a `Number.isFinite(rating)` guard in `readSelfRatings` (or `VALIDATION_FAILED` on non-finite) so a malformed rating value fails loudly instead of silently bypassing bounds. | Yes, if bundled with F-02's fix — trivial, same file, same function family. |
| F-04 | — (informational) | Quality | `apps/api/src/http/idempotency.ts:37-48` | Idempotency-Key replay with a different payload correctly returns `409 CONFLICT` (`IdempotencyReplayStore.replay()`), not a silent double-submit or a stale-response replay. `MyAppraisalPanel.tsx` and `AparTierForms.tsx` both mint a fresh `crypto.randomUUID()` per submit attempt (not reused across retries), so a failed submission followed by a corrected retry is never mistakenly treated as a duplicate. | Live probe: same key + different narrative on second call → `409`. Code read: `MyAppraisalPanel.tsx:76`, `AparTierForms.tsx` diff line `submitAparSelf(formId.trim(), { narrative: ... }, crypto.randomUUID())`. | None — this is platform-level machinery shared by all G-modules, correctly used here. | N/A |
| F-05 | — (informational, consistency check) | Security | `apps/api/src/modules/g08/aparService.ts:1101` | `actor.permissions?.includes("*")` unconditionally bypasses `assertSelfOrOverride`, independent of role. This is **not** a G08-specific deviation — it is the identical convention used in `g01/bankAccountService.ts:219`, `g03/leaveService.ts:616`, `g05/transferService.ts:288`, `g07/trainingService.ts:170,1241,1259`, `g10/payrollEngineService.ts:658`, `g11/pensionService.ts:406`, `g12/serviceRegisterService.ts:244,261`, `g13/documentVaultService.ts:392`, and the `workflow/hrmsWorkflowService.ts` approver-identity gate. Wildcard permission is exclusively used by the seed/system/test-admin actor (e.g. `actor("test-admin", ["*"])` in every test file), not a real RBAC grant surfaced to end users. | grep across 8 sibling modules confirms byte-identical gate shape. | None — flagged only to record it was checked for consistency, per the review brief; not a new finding. | N/A |
| F-06 | — (informational) | Anti-skeleton | `apps/api/src/routes/g08.routes.ts:277` (`addGoal`) | `addGoal()`'s response still returns the raw `AparGoal` (leaking `tenantId`/`entityId`), confirmed still present. This matches the BRD coverage doc's already-flagged, already-deferred gap (FR-G08-02 goal management, never touched by this session's diff) — reported here only to confirm it was re-checked and remains unchanged, not as a new finding. | `apps/api/src/routes/g08.routes.ts:277`: `goal: context.services.apar.addGoal(...)` — no `toWireGoal()` wrapper exists. | No action from this review (already tracked). | No — out of scope, pre-existing. |

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyAppraisalPanel` | `apps/web/src/modules/g08/MyAppraisalPanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` | `client.listMyAparForms(employeeId)` on mount/refresh (line 24); `client.submitAparSelf(formId, {narrative}, crypto.randomUUID())` on submit (line 76) — both real HTTP-backed client methods, not stubs | Renders real form data: `formNo`, `periodStart`/`periodEnd`, `status`, conditional `grade`, conditional `selfAppraisalNarrative` after submit; full loading/error/empty/ready state machine via `OperationalState` | **Real component** — not a skeleton. Genuine state machine, real narrative textarea bound to real per-form local state, real submit-in-flight disabling, real error-code-to-message mapping (`APAR_SUBMIT_ERROR_MESSAGES`). |
| `AparTierForms` (self-appraisal section, modified) | `apps/web/src/modules/g08/AparTierForms.tsx` | `formId` (manual entry, pre-existing), new `selfNarrative` local state | `client.submitAparSelf(formId, {narrative}, crypto.randomUUID())` — same real client call, updated signature | Renders success/error phase, new client-side blank-narrative validation with `role="alert"` message | **Real, substantive addition** — not decorative; the new textarea is genuinely wired into the submit payload and gates submission. |
| Backend `AparService.listMyForms`/`submitSelf` | `apps/api/src/modules/g08/aparService.ts:172-212` | `actor: ActorContext`, `employeeId`/`formId`, `{narrative, selfRatings?}` | N/A (this is the service layer) | Returns real `AparForm[]`/`AparForm` with persisted `selfAppraisalNarrative`/`selfAppraisalRatings` | **Real** — narrative is validated (non-blank) and persisted; not a status-flip-only stub (this was the exact gap the BRD coverage doc remediated). |

## Traceability impact
No new gaps against FR-G08-03's acceptance criteria beyond what `docs/reviews/brd-coverage-g08-self-appraisal-self-service-2026-07-13.md` already tracked. F-02 sharpens (does not newly discover) the already-flagged "per-goal self-rating scale-bound validation ... not exhaustively exercised" deferred item: this review establishes the more precise root cause (route-layer `cycleId` omission on `openForm`, not a test-coverage gap) — recommend the BRD coverage doc's deferred-gaps table be updated to reflect "unreachable via the current route, not just untested" the next time that document is amended, but this is a documentation-precision note, not a new code change requirement.

## Required amendments
Items that cannot be fixed as implementation repair (per full-review's repair-mode rules):
- **F-02** is a route-contract gap on a route (`openForm`) not touched by this session's diff. Wiring `cycleId` through the route is a small, low-risk implementation change in principle, but since it affects a route outside the reviewed diff's stated scope (BRD doc explicitly scoped this session to FR-G08-03 self-submission, not cycle/template/scale masters administration), it should go through the same amendment/scope-decision path used for the other deferred items in the BRD coverage doc, rather than being silently patched under this review.

## Verification commands
```bash
npm run build
node --test apps/api/test/self-appraisal-self-service.test.cjs
npm run web:typecheck
node --test apps/web/test/*.test.cjs
npx playwright test --config apps/web/playwright.config.ts -g "self-appraisal"
```
All five ran clean during this review (build: 0 errors; backend test: 7/7; web typecheck: 0 errors; web unit: 153/153; e2e: 1/1).

## Remaining risks
- **F-02/F-03 combination**: if a future change wires `cycleId` into `openForm` without also adding the `Number.isFinite` guard from F-03, a malformed (non-numeric) self-rating would silently bypass scale-bounds validation instead of failing with `VALIDATION_FAILED`. Low likelihood today since the path is currently unreachable, but worth fixing both together rather than F-02 alone.
- **Masters routes wire-leak** (`rating-scales`, `templates`, `cycles` POST responses) leak raw `tenantId`/`entityId` — observed incidentally while probing F-02, out of this review's named scope (admin-only masters, not self-service), not scored as a finding here but noted for whoever next touches those routes.
- No regressions detected in the 6 other test files this session's broader diff touches (`ph08-g07-g08-training-apar.test.cjs`, `ph08d-g07-g08-depth.test.cjs`) — not independently re-run in this review pass since they're outside G08 self-appraisal-self-service's named scope, but the BRD coverage doc reports 633/634 backend and 153/153 web unit passing prior to this review; this review's own runs (7/7, 153/153) are consistent with no new regressions in the self-service surface.
