# Full Review: G11 Pension/Retirement Projection Self-Service (FR-G11-15)

## Addendum 2026-07-14 (hr_admin cross-cutting SoD correction)

`PENSION_ACCESS_OVERRIDE_ROLES` in `pensionService.ts` no longer includes `hr_admin` — per an
explicit instruction from a later `hr_admin` role-capability audit ("hr_admin has no direct grants
in G11... a deliberate separation-of-duties boundary"), `hr_admin` was removed, leaving only
`pension_officer`/`system`. This is a stronger boundary than the G11 module BRD's own text implies
(§55 and several FRs' "Primary Role(s)" name "HR Admin" alongside Pension Officer without a
distinguishing flag) — the newer cross-cutting instruction supersedes that older, looser language
for this override set. This session's own `pension-projection-self-service.test.cjs` test that
asserted `hr_admin` as an override actor was updated to assert `pension_officer` instead (and to
additionally assert `hr_admin` is now correctly blocked). Full suite re-verified green after the
change. Verdict unchanged (PASS) — this is a scope-narrowing correction, not a defect in the
original feature.

## Verdict
**PASS (post-remediation)**

**Update 2026-07-13 (post-review verification):** F1 (input-validation bounds) and F2 (upper-bound
sanity) are fixed and re-verified — `pensionService.ts` `estimateBenefits()` now rejects
`qualifyingServiceMonths` outside `[0, 600]` and non-positive `emolumentsBaseCents` with
`VALIDATION_FAILED`, and the frontend carries matching `min`/`max` on both what-if number inputs
(`MyPensionEstimatePanel.tsx:119-129`). A dedicated regression test exists and passes:
"post-full-review fix — a nonsensical what-if (negative emoluments, out-of-range service) is
rejected, not silently clamped" (`pension-projection-self-service.test.cjs`, 6/6 pass). F3 is also
resolved — `docs/reviews/brd-coverage-g11-pension-projection-self-service-2026-07-13.md` already
names the pre-existing PDA/pensioner/disbursement tenantId/entityId leak explicitly in its Deferred
Gaps table. F4/F5 were pre-existing test-infra issues outside this feature's scope, not fixed (not
regressions from this work) — full repo-root test suite re-confirmed green (657/658 backend,
153/153 web, 29/29 e2e serial).

Original review text below, retained for evidence trail.

---

The headline permission-design claim (the reason this feature exists in its current shape) holds up completely under live adversarial testing. No cross-employee or privilege-escalation break was found. However, live probing found a genuine, unguarded input-validation gap in the new estimator that is a first for this session's exposure surface, plus two claim-accuracy issues (test-count and coverage-completeness) that should be corrected before this is called done.

## Scope
- Target: `apps/api/src/modules/g11/pensionService.ts` (`estimateBenefits`, `listMyCases`, `assertSelfOrOverride`), `apps/api/src/routes/g11.routes.ts` (2 new routes + `toWirePensionCase`), `apps/api/src/seed/testEmployeesSeed.ts` (`seedTestPensionEstimate`), `apps/web/src/modules/g11/MyPensionEstimatePanel.tsx`, `apps/web/src/app/session.ts`, `apps/web/src/App.tsx` routing.
- Selected path: light/standard hybrid — brownfield addition to an existing, heavily-populated module (G11 has ~26 routes across 7 service files); reviewed as a security-sensitive self-service surface given the session's established pattern of missed authorization gaps.
- Files reviewed in full: `pensionService.ts` (537 lines), `g11.routes.ts` (943 lines), `testEmployeesSeed.ts` (730 lines), `MyPensionEstimatePanel.tsx` (169 lines), `session.ts` (145 lines), `authorizationService.ts`, `auditService.ts`, `pensionBenefitRepository.ts` (compute engine + `computeSchemeBenefit`), plus a sub-agent read of all 6 sibling G11 service files (`pensionerLifecycleService.ts`, `pensionBenefitService.ts`, `pensionRevisionService.ts`, `pensionRuleService.ts`, `pensionDisbursementService.ts`, `pensionTreasuryService.ts`).
- Artefacts used: `docs/reviews/brd-coverage-g11-pension-projection-self-service-2026-07-13.md` (developer's own coverage report, cross-checked against live code).
- Live verification performed: `npm run build` (clean), `node --test apps/api/test/*.test.cjs` from repo root (656 pass / 1 skip, matches claim), `npm run web:test` (153/153, matches claim), `npm run typecheck` + `npm run web:typecheck` (clean), full Playwright suite (28/29 — one flaky pre-existing, unrelated test, see Finding F5), plus three custom ad-hoc `api.dispatch()` probe scripts covering: (1) all reachable G11 admin GET routes with only `g11.pension.self.read`, (2) role-name spoofing against `assertSelfOrOverride`, (3) boundary/negative/zero/huge numeric inputs to `estimateBenefits()`, (4) `monthsBetween()` before-joining-date behavior, (5) double-invocation of the seed function and double-boot of `createFoundationServices`.

## Checks run
| Check | Ran? | Result | Evidence |
|---|---|---|---|
| Backend build | Yes | Clean | `npm run build` — no tsc errors |
| Backend full test suite (repo root) | Yes | 656 pass / 1 skip / 0 fail | Matches developer claim exactly |
| Backend full test suite (run from `apps/api/`) | Yes | 18 unrelated failures | CWD-dependent artifact in pre-existing PH-06/10-14 evidence-file tests (they `readFileSync` relative paths like `docs/release/rollback-plan.md`) — not a regression, not G11-related; only reproduces when CWD ≠ repo root |
| `pension-projection-self-service.test.cjs` standalone | Yes | 5/5 pass | Matches claim |
| Web unit tests | Yes | 153/153 pass | Matches claim |
| Web/backend typecheck | Yes | Clean both | |
| Full Playwright suite | Yes | 28/29 pass | `critical.spec.ts:55` ("no horizontal overflow across viewports") fails in full-suite runs, passes standalone/isolated — pre-existing flake, file untouched by this session (`git diff` shows zero changes to `critical.spec.ts`) |
| Core permission-scoping claim (a): only 2 routes gated by `g11.pension.self.read` | Yes | TRUE | Static grep of all 39 `permission:` declarations in `g11.routes.ts`: exactly 2 use `g11.pension.self.read` (lines 139, 162), 10 use `g11.pension.read`, disjoint sets |
| Core permission-scoping claim (b)/(c): none of the ~20 admin routes reachable via `g11.pension.self.read` | Yes, live | TRUE | Live `api.dispatch()` probe against summary, pensioner-by-id, provisional-pension, all 7 rule-resolve tables, revision-batch-get, PDA-get, account-verifications-list, disbursements-list, life-certificates-list, pensioner-by-case — **every one returned 403** for an actor holding only `g11.pension.self.read` |
| `AuthorizationService.check` is exact-string, no hierarchy/prefix matching | Yes | Confirmed | `authorizationService.ts:11` — `actor.permissions.includes(permission)` exact match or `"*"` only; no substring/prefix logic exists anywhere that could make `self.read` imply `read` |
| Demo employee session grants only `g11.pension.self.read`, not `g11.pension.read` | Yes | Confirmed | `session.ts:16-25` — `DEMO_EMPLOYEE_PERMISSIONS` array; grepped whole repo, no other file references either permission string |
| `/admin/pension-retirement` route stays gated on `g11.pension.read`, unreachable to self-only session | Yes, live (unit + e2e) | Confirmed | `App.tsx:201`; Playwright regression guard test passes live |
| Role-name spoofing on `assertSelfOrOverride` | Yes, live | TRUE — only exact literals bypass | Probed `manager`, `admin`, `pension_admin`, `PENSION_OFFICER`, `Pension_Officer`, `HR_ADMIN`, `Hr_Admin`, `SYSTEM`, `System` — all correctly 403; only exact-case `hr_admin`, `pension_officer`, `system` succeed (positive control, 201) |
| No pre-existing G11 service has actor-vs-employeeId ownership check | Yes, via sub-agent full-file reads | TRUE | All 6 sibling files read in full; zero `actor.userId`/`actor.actorUserId` vs `employeeId` comparisons found. One `actor.userId` comparison exists (`pensionRevisionService.ts:164`) but is an unrelated maker-checker SoD gate (`batch.makerUserId === actor.userId`), not an ownership check |
| `estimateBenefits()` never persists / touches `this.cases` | Yes, live + static | Confirmed | Only one `this.cases.push` in the entire file (inside `createCase`, line 160); live test "an estimate never persists a pension case" passes; `AuditService.recordMutation` writes to a fully separate `auditEntries` array, never touches business-data arrays |
| `toWirePensionCase()` coverage — all `PensionCase`-returning routes | Yes | TRUE, 7 of 7 | `createCase`, `verifyService`, `computeBenefits`, `sanction`, `issuePpo`, `estimateBenefits` (wrapped for the case-shaped fields, though the estimate result itself has no tenantId to begin with), `listMyCases` all wrap through `toWirePensionCase` |
| Boundary/negative inputs to `estimateBenefits()` | Yes, live | **Gap found** | See Finding F1 |
| `monthsBetween()` negative-duration handling | Yes, live | Safe — clamped | `Math.max(0, monthsBetween(...))` at `pensionService.ts:348` neutralizes any negative auto-derived value; confirmed live with `asOf` before `dateOfJoining` under an added earlier rule window — returns `qualifyingServiceMonths: 0`, not negative |
| Seed idempotency (double seed-function call + double foundationServices boot) | Yes, live | Confirmed idempotent | Re-invoked `seedTestPensionEstimate` a second time against the same `services` object — no throw, rule row reused (`pen-pension-limit-rules-000001` both times); booted `createFoundationServices({seedTestEmployees:true})` twice in-process — no throw |
| `PayrollService` vs `PayrollEngineService` are genuinely separate stores | Yes | Confirmed | `payroll.getLastPayDrawn` reads `this.lastPayFeeds`, populated only by `PayrollService.disburseRun`; `PayrollEngineService` (used by `seedTestPayrollLifecycle`) is an entirely separate class/array — no shared state, no collision risk |
| Other G11 record types (`PenPda`, disbursement, pensioner, revision, gratuity/family-pension/commutation/provisional-pension) still leak `tenantId`/`entityId` on pre-existing admin routes | Yes, live | Confirmed leak exists, correctly out of this session's scope | Live probe: `POST/GET /api/v1/pension/pdas` both return `tenantId`/`entityId` in the body. Developer's own coverage doc frames the "no ownership check" gap but **does not mention this separate tenantId-leak gap at all** — see Finding F3 |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F1 | **HIGH** | Data integrity / input validation | `apps/api/src/modules/g11/pensionService.ts:317-379` (`estimateBenefits`), specifically lines 323-324, 348-349 | Caller-supplied `qualifyingServiceMonths` and `emolumentsBaseCents` are accepted with zero bounds validation, unlike every other write path in this module | **Live-verified.** Probed via `api.dispatch()` as a real employee actor: `qualifyingServiceMonths: -50` → HTTP 201 (silently treated as below-threshold, returns `SERVICE_GRATUITY_ONLY`/0 pension, no error); `emolumentsBaseCents: -8500000` (negative salary) → HTTP 201, returns `pensionCents: 900000` (the E35 *minimum* pension floor silently applied to a negative/nonsensical salary input, masking the bad input as a normal minimum-pension result); `emolumentsBaseCents: 0` → HTTP 201, same masking behavour. Root cause: `verifyService()` (the sibling admin path) explicitly validates `totalServiceMonths` must be a positive integer (`pensionService.ts:175-181`) before it ever reaches `computeSchemeBenefit`, and `computeBenefits()` only ever receives `emolumentsBaseCents` from trusted internal payroll data (`this.payroll.getLastPayDrawn`) — so the shared pure function `computeSchemeBenefit()` was never previously reachable with untrusted negative/zero inputs. `estimateBenefits()` is the first caller to pipe raw HTTP-body numbers into it unchecked. The frontend (`MyPensionEstimatePanel.tsx:116-130`) has no `min="0"` on either number input and no client-side guard, so a real user can trigger this from the browser. | Add the same validation `verifyService` already uses: reject `qualifyingServiceMonths < 0` and `emolumentsBaseCents <= 0` with `VALIDATION_FAILED` before calling `computeSchemeBenefit`, both when caller-supplied (currently zero checks) — the auto-derived path is already safe via `Math.max(0, ...)`. Add `min="0"` to both frontend number inputs as defense-in-depth. | Yes — implementation-only fix (add validation), no contract/BRD change needed since this is tightening an existing implicit invariant, not adding new behavior |
| F2 | LOW | Correctness / semantics | `apps/api/src/modules/g11/pensionService.ts:352-361` (`computeSchemeBenefit` call inside `estimateBenefits`) | A wildly large `qualifyingServiceMonths` (e.g. 999999999) is accepted and echoed back verbatim in the response as if it were a normal figure | Live-verified: `qualifyingServiceMonths: 999999999` → HTTP 201, `benefitOutcome: "FULL_PENSION"`, `qualifyingServiceMonths: 999999999` echoed in the response. Does not cause a monetary blow-up (OPS pension is flat 50%, not proportional to months, per BRD FR-05 AC1, so this is not a financial-integrity bug) but is a nonsensical value silently accepted and displayed to the user as "300 months of qualifying service" (per the panel's UI text) — an obviously wrong number that should be caught as an upper-bound sanity check (e.g. > employee's plausible max working lifetime in months). | Add an upper-bound sanity check (e.g. reject > 720 months / 60 years) alongside the F1 fix. Cosmetic/UX-quality issue, not a security or data-integrity break. | Yes, bundle with F1 |
| F3 | MEDIUM | Reporting completeness / traceability | `docs/reviews/brd-coverage-g11-pension-projection-self-service-2026-07-13.md` (developer's own coverage doc), Deferred Gaps section | The developer's coverage report documents the "no per-row ownership check on ~20 admin GET routes" gap in detail, but never mentions the separate, live-confirmed `tenantId`/`entityId` leak on non-`PensionCase` G11 record types (PDA, pensioner, disbursement, revision-batch, provisional-pension, gratuity/family-pension/commutation records) on pre-existing admin routes | **Live-verified the leak itself**: `POST /api/v1/pension/pdas` and `GET /api/v1/pension/pdas/{id}` both return `tenantId`/`entityId` in the response body verbatim. Static grep confirms `PenPda`, pensioner, disbursement, revision-batch, and benefit-record types all carry `tenantId`/`entityId` fields with no wire-stripping applied anywhere outside `toWirePensionCase` (which only covers `PensionCase`). This is a real, pre-existing (not introduced this session) leak — same class as findings in prior sessions' G05/G13 reviews — but the coverage doc is silent on it, discussing only the wire-leak fix it did make ("applied to all 7 PensionCase-returning routes") and a different gap (ownership checks). The task instructions specifically asked to verify the report "correctly frames [pre-existing leaks] as pre-existing/deferred rather than silently absent from the coverage report" — it is the latter. | Amend the coverage doc's Deferred Gaps table to add this as an explicitly named, flagged-but-out-of-scope item (mirroring how the ownership-check gap is already handled), so a future session doesn't have to rediscover it. This is a documentation-only fix, not a code fix — the underlying leak itself is legitimately out of this feature's scope (BRD-wise, "check my pension projection" doesn't touch PDA/disbursement routes) but should be named, not silent. | No — documentation/traceability amendment, not an implementation repair |
| F4 | LOW | Test-claim accuracy | Developer's summary vs. live re-run | Claimed backend test result "656/657, 1 pre-existing skip" is accurate only when run from the repo root; running `node --test apps/api/test/*.test.cjs` from inside `apps/api/` (a command a reviewer or CI step might reasonably use) produces 18 failures in unrelated PH-06/10-14 evidence-file tests due to CWD-relative `readFileSync` calls | Live-verified both ways: repo-root run = 656/657/0-fail (matches claim exactly); `apps/api/`-cwd run = 638/657/18-fail, all in pre-existing doc-evidence tests untouched by this session. Not a regression from this feature, but a pre-existing test-suite fragility that made the claim's reproducibility conditional on an unstated CWD assumption. | No code fix required for this feature; flag to the project's test-runner convention (tests should use a CWD-independent path resolution, e.g. relative to `__dirname` or a repo-root env var) as a cross-cutting improvement, unrelated to G11 | No — pre-existing test-infra issue, out of this feature's scope |
| F5 | LOW | Test-claim accuracy | Developer's summary "all e2e tests pass (29/29)" | Live full-suite Playwright run reproducibly (2 consecutive runs) produces 28/29 — `critical.spec.ts:55` ("authenticated shell is reachable without horizontal overflow across viewports") fails under full-suite execution but passes when run in isolation | Live-verified twice (both full-suite runs failed identically; isolated run of the same test passed). `git diff`/`git status` confirm `critical.spec.ts` has zero changes in this session's working tree — this is a pre-existing flake (likely a viewport/dev-server timing race under parallel-ish full-suite load), not caused by the new pension panel or route. The claimed "29/29" is not reproducible as stated. | No code fix required for G11; note the flake for whoever owns e2e infra. Re-run to confirm before treating any given "29/29" claim as ground truth. | No — pre-existing e2e flake, out of this feature's scope |

## Component substance check
| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyPensionEstimatePanel` | `apps/web/src/modules/g11/MyPensionEstimatePanel.tsx` | Scheme select, date input, 2 optional number what-if inputs, submit button | `client.runMyPensionEstimate()`, `client.listMyPensionCases()` | Real estimate result (benefit outcome, pension amount, qualifying months), real case list with empty/loading/error states | Real component, not a skeleton — has genuine form fields, live API wiring, and all four operational states (loading/error/empty/success) |

## Traceability impact
- FR-G11-15 (self-service estimate + track status): both ACs (AC1 non-binding/never-writes, AC2 what-if override) verified live, not just read in the diff.
- The permission-design decision (new `g11.pension.self.read` vs reusing broad `g11.pension.read`) is the single most consequential design choice in this feature, given it was explicitly built to address the G05/G13 review pattern — it is **fully verified correct** by live adversarial probing across every reachable admin route plus role-spoofing attempts. This is the strongest part of the submission.
- BRD coverage doc needs the F3 amendment (documentation-only) to stay honest about the full leak surface.

## Required amendments
- F3: amend `docs/reviews/brd-coverage-g11-pension-projection-self-service-2026-07-13.md` Deferred Gaps table to name the tenantId/entityId leak on non-PensionCase G11 record types explicitly (documentation change, not a code/contract change — no BRD/LLD amendment required since the underlying leak is pre-existing and out of this feature's stated scope).

## Verification commands
```bash
# Backend build + full suite (must run from repo root, not apps/api/)
npm run build
node --test apps/api/test/*.test.cjs

# Pension test file alone
node --test apps/api/test/pension-projection-self-service.test.cjs

# Web unit + typecheck
npm run web:typecheck
npm run web:test

# E2E (full suite; expect possible pre-existing critical.spec.ts:55 flake unrelated to G11)
npx playwright test --config apps/web/playwright.config.ts

# E2E (pension-specific only)
npx playwright test --config apps/web/playwright.config.ts apps/web/test/e2e/pension-projection-self-service.spec.ts
```

## Remaining risks
- **F1/F2 (HIGH/LOW)**: until fixed, a real employee can submit a negative or zero emoluments/qualifying-service figure through the self-service what-if form and receive a plausible-looking (if wrong) result rather than a clear rejection. This is not a security/authorization break (the self-vs-other scoping fully holds) and not exploitable for privilege escalation or data leakage — it is a data-quality / user-trust risk (a citizen-facing pension estimator returning a "minimum pension" figure for a garbage negative-salary input is a bad look even though no real data is corrupted, since `estimateBenefits()` never persists anything).
- **F3 (MEDIUM)**: the tenantId/entityId leak on PDA/pensioner/disbursement/revision routes is real and live-confirmed, but was already out of scope for this specific feature and requires a module-wide hardening pass (consistent with the G05 pattern from earlier this session) — tracked as a documentation gap, not a code defect to fix now.
- **F4/F5 (LOW)**: both are pre-existing test-infrastructure fragility (CWD-dependent doc-evidence tests; a flaky full-suite-only Playwright viewport test), not regressions caused by this feature, but they mean the developer's literal "656/657" and "29/29" claims are only reproducible under specific run conditions that weren't stated.
