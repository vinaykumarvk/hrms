# Done Report — Self-Service Use Cases 2–10 (Test Coverage, Data Seeding, Bug Remediation, BRD Coverage, Full Review)

**Date:** 2026-07-13
**Path:** standard (per-feature: light/standard hybrid — reviewing/extending already-partially-built self-service surfaces on stable contracts, not greenfield)

## Objective

For each of the 9 named self-service use cases below, in order: prepare test cases against real
seeded data (no mocks/hard-coded fixtures), assess and seed any missing supporting data, fix bugs
and remediate gaps, run `/brd-coverage` scoped to the named use case, remediate any gaps found,
cycle coverage→remediation until clean, then run `/full-review` and fix any bugs found. The goal is
complete once this process has run for all 9 features.

| # | Use case | Module |
|---|---|---|
| 2 | View/update personal details — contact info, address, bank account, dependents/nominees, emergency contacts | G01/G02 |
| 3 | Mark attendance / regularize punches | G03 |
| 4 | View payslips and payroll history | G10 |
| 5 | Access service register / employment history | G12 |
| 6 | Apply for training / view nominations | G07 |
| 7 | Submit self-appraisal (APAR/PMS) | G08 |
| 8 | Access personal documents (secure vault) | G13 |
| 9 | Request a transfer / view transfer orders | G05 |
| 10 | Check pension/retirement projections | G11 |

**Scope decision (user-confirmed):** BRD coverage was scoped to each named use case, not the full
module BRD (e.g. G01/G02's full 48-FR set). Disproportionate architectural gaps found along the way
were flagged, not silently built or silently hidden — each is recorded in its feature's BRD-coverage
or full-review doc under Deferred Gaps / Remaining risks.

## Summary

All 9 features already had partial-to-complete self-service implementations on this branch
(pre-dating this goal's active work, then substantially built out during it, including a mid-session
process crash that lost conversational state but not filesystem state — recovered by re-verifying
ground truth against the repo rather than trusting memory). For each feature this goal:

1. Wrote/confirmed backend integration tests against `seedTestEmployees: true` real data (6 seeded
   test employees + the 2 base PH-03 fixtures) — no mocked services in any backend test.
2. Wrote/confirmed a real-browser Playwright e2e spec exercising the actual UI, actual local API
   bridge, and (where relevant) a second persona (finance/attendance-admin/hr-admin) for the
   maker-checker half of the flow.
3. Found and fixed real bugs (see table below).
4. Produced a `docs/reviews/brd-coverage-<slug>-2026-07-13.md` for each feature, remediated every
   finding, and re-verified until clean.
5. Produced a `docs/reviews/full-review-<slug>.md` for each feature (verdict PASS or
   CONDITIONAL→PASS after remediation), verified via live `api.dispatch()` probes, not just static
   reading.

**Net result: all 9 features are PASS.** Two were originally shipped CONDITIONAL by their
independent full-review pass and are now PASS (post-remediation) after fixing genuine bugs the
review found (G05, G08); one (G13) had only optional LOW findings, one of which was fixed anyway.

## Cross-cutting security pattern established and applied consistently

Two patterns, first established in the prior leave-lifecycle goal on this branch, were replicated
by hand across every module touched this session:

- **Self-or-override scoping**: `actor.userId !== employeeId` throws `FORBIDDEN` unless the actor
  holds `permissions.includes("*")` or a role in a per-module override set (`hr_admin`,
  `finance_admin`, `attendance_admin`, etc.). Applied to G01 bank accounts, G03 attendance capture/
  regularisation, G05 transfer orders/service-record, G07 nominations, G08 APAR forms, G10 payslips,
  G11 pension estimates, G12 service-register timeline/event, G13 documents.
- **Maker≠checker (SOD)**: a maker-identity field (`submittedByUserId`, `capturedByUserId`) set on
  write; the approval/regularisation action throws `SOD_VIOLATION` if the same actor is both maker
  and checker, unless an override role applies. Applied to G01 bank-account approval and G03
  attendance regularisation.
- **Wire-stripping**: `toWireX()` route helpers strip internal-only fields (`tenantId`, `entityId`,
  `runId`, `workflowInstanceId`, `calcTrace`, maker-identity fields) before any self-service response
  reaches the wire. Applied across all 9 modules' self-service read/write routes.

## Bugs found and fixed (by feature)

| Feature | Bug | Fix |
|---|---|---|
| G01 (2) | `approveBankAccount()` had no maker≠checker gate; missing `toWireBankAccount()` wire-stripping | Added `submittedByUserId` + `BANK_APPROVAL_OVERRIDE_ROLES` + `SOD_VIOLATION` check; added wire-stripping at 5 response sites |
| G03 (3) | `regulariseAttendance()` had no maker≠checker gate; capture/regularise/list responses leaked internal fields | Added `capturedByUserId` + `ATTENDANCE_REGULARISE_OVERRIDE_ROLES` + `SOD_VIOLATION` check; added `toWireAttendance()` |
| G05 (9) | **HIGH** — `GET /api/v1/transfers/orders/{id}/service-record` had no per-employee ownership check at all (`TenantScope`-typed, route passed `context.scope` not `context.actor`); any actor holding only `g05.transfer.read` could read any other employee's acknowledgement/service-of-order PII | `getServiceRecord()` now `ActorContext`-typed, gates on `order.employeeId === scope.userId \|\| isTransferAccessOverride(scope)` via `requireOrder()`, mirroring `getOrder()`; route now passes `context.actor` |
| G08 (7) | **MEDIUM** — `POST /api/v1/apar/forms` never forwarded `cycleId` from the request body, making the per-goal rating scale-bounds check in `submitSelf()` structurally unreachable via any real HTTP call; **LOW** — `readSelfRatings()` coerced with bare `Number(...)`, so a non-numeric rating silently became `NaN`, and `NaN < min`/`NaN > max` are both `false`, which would have bypassed the bounds check once reachable | Route now forwards `cycleId`; `readSelfRatings()` now throws `VALIDATION_FAILED` (400) for any non-finite parsed rating instead of admitting `NaN` |
| G13 (8) | LOW — panel's error-message map omitted `FORBIDDEN`/`ERR-G13-INTEGRITY_FAILED`, falling through to a generic message | Added both codes to `DOCUMENT_FETCH_ERROR_MESSAGES` |
| G11 (10) | `estimateBenefits()` accepted out-of-range/non-integer `qualifyingServiceMonths` and non-positive `emolumentsBaseCents` | Added integer/range validation (`VALIDATION_FAILED`); added matching `min`/`max` on the web form inputs |
| G07 (6), G10 (4), G12 (5) | Full-review found the fixes already applied in the diff (pre-crash work); independently re-verified via live probe, no new bugs found | — |

Every fix above shipped with a dedicated regression test (backend `.test.cjs`, HTTP-level via
`api.dispatch()`), re-run green after the fix, plus a full-suite re-run to confirm zero regression.

## Data seeded

Extended `apps/api/src/seed/testEmployeesSeed.ts` (in-flight file, built up across this goal and the
prior leave goal) to cover every feature's real data needs, including:

- 6 test employees (Rohan/GOV-100301 … Priya/GOV-100306) with real `reportingManagerId` chains,
  service history, and tenure spread needed to clear module-specific eligibility gates.
- A real seeded PENDING_APPROVAL G05 transfer order (Priya) routed to a real authority.
- A real seeded missed-punch attendance anomaly (Sunita) for G03 regularisation testing.
- A real seeded open G08 APAR form (Rohan) routed through the real P02 workflow.
- `seedTestPayrollLifecycle()` — runs the real G10 payroll engine lifecycle (enrol → create run →
  snapshot → compute → approve → lock) end-to-end for Arjun, producing a real PUBLISHED payslip.
- G13 document + security-clearance fixtures (`seedTestDocumentClearance()`).
- G12 service-register timeline entries with real event types.

No mocked or hard-coded test data was used for any backend integration test; `fixtureHrmsClient.ts`
mocks exist only for isolated frontend unit tests, not the Playwright e2e specs, which run against
the real local API bridge.

## Changed files (features 2–10 only; excludes the prior leave-lifecycle goal's files)

```
Backend services
M  apps/api/src/modules/g01/bankAccountService.ts
M  apps/api/src/modules/g03/leaveService.ts               (attendance capture/regularisation)
M  apps/api/src/modules/g05/counsellingVacancyService.ts
M  apps/api/src/modules/g05/transferService.ts
M  apps/api/src/modules/g07/trainingService.ts
M  apps/api/src/modules/g08/aparService.ts
M  apps/api/src/modules/g10/payrollEngineService.ts
M  apps/api/src/modules/g11/pensionService.ts
M  apps/api/src/modules/g12/serviceRegisterService.ts
M  apps/api/src/modules/g12/srIntegrityService.ts
M  apps/api/src/modules/g13/documentVaultService.ts

Backend routes
M  apps/api/src/routes/g01.routes.ts
M  apps/api/src/routes/g03.routes.ts
M  apps/api/src/routes/g05.routes.ts
M  apps/api/src/routes/g07.routes.ts
M  apps/api/src/routes/g08.routes.ts
M  apps/api/src/routes/g10.routes.ts
M  apps/api/src/routes/g11.routes.ts
M  apps/api/src/routes/g12.routes.ts
M  apps/api/src/routes/g13.routes.ts

Backend tests
A  apps/api/test/personal-details-self-service.test.cjs
A  apps/api/test/attendance-capture-regularization.test.cjs
A  apps/api/test/payslip-self-service.test.cjs
A  apps/api/test/service-register-self-service.test.cjs
A  apps/api/test/training-nomination-self-service.test.cjs
A  apps/api/test/self-appraisal-self-service.test.cjs
A  apps/api/test/personal-documents-self-service.test.cjs
A  apps/api/test/transfer-request-self-service.test.cjs
A  apps/api/test/pension-projection-self-service.test.cjs
M  apps/api/test/ph08-g07-g08-training-apar.test.cjs
M  apps/api/test/ph08d-g07-g08-depth.test.cjs

Web panels (new)
A  apps/web/src/modules/g01/EmployeeAddressesPanel.tsx
A  apps/web/src/modules/g01/EmployeeBankAccountsPanel.tsx
A  apps/web/src/modules/g01/EmployeeEmergencyContactsPanel.tsx
A  apps/web/src/modules/g01/EmployeeNomineesPanel.tsx
A  apps/web/src/modules/g03/AttendanceCapturePanel.tsx
A  apps/web/src/modules/g03/AttendanceRegularizationPanel.tsx
A  apps/web/src/modules/g05/MyTransfersPanel.tsx
A  apps/web/src/modules/g07/MyTrainingPanel.tsx
A  apps/web/src/modules/g08/MyAppraisalPanel.tsx
A  apps/web/src/modules/g10/MyPayslipsPanel.tsx
A  apps/web/src/modules/g11/MyPensionEstimatePanel.tsx
A  apps/web/src/modules/g13/MyDocumentsPanel.tsx

Web plumbing
M  apps/web/src/App.tsx                        (routing for all 9 panels)
M  apps/web/src/app/navigation.ts               (nav entries for all 9 modules)
M  apps/web/src/app/session.ts                  (demo-session permission grants)
M  apps/web/src/api/hrmsClient.ts               (types/methods for all 9 modules)
M  apps/web/src/api/fixtureHrmsClient.ts
M  apps/web/src/modules/g07/TrainingNominationForm.tsx
M  apps/web/src/modules/g08/AparTierForms.tsx
M  apps/web/src/styles.css

Web e2e tests (new)
A  apps/web/test/e2e/personal-details-self-service.spec.ts
A  apps/web/test/e2e/attendance-capture-regularization.spec.ts
A  apps/web/test/e2e/payslip-self-service.spec.ts
A  apps/web/test/e2e/service-register-self-service.spec.ts
A  apps/web/test/e2e/training-nomination-self-service.spec.ts
A  apps/web/test/e2e/self-appraisal-self-service.spec.ts
A  apps/web/test/e2e/personal-documents-self-service.spec.ts
A  apps/web/test/e2e/transfer-request-self-service.spec.ts
A  apps/web/test/e2e/pension-projection-self-service.spec.ts
M  apps/web/test/ph08f-statutory-ui.test.cjs
M  apps/web/test/ui-remediation-critical.test.cjs
M  apps/web/test/ui-remediation-modules.test.cjs

Data / contracts
A  apps/api/src/seed/testEmployeesSeed.ts        (shared with the prior leave goal; extended here)
M  docs/contracts/auth-matrix.yaml                (g01.bank.approve entry)
M  tools/local-api-server.mjs

Reports
A  docs/reviews/brd-coverage-g01-personal-details-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g03-attendance-punch-regularization-2026-07-13.md
A  docs/reviews/brd-coverage-g05-transfer-request-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g07-training-nomination-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g08-self-appraisal-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g10-payslip-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g11-pension-projection-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g12-service-register-self-service-2026-07-13.md
A  docs/reviews/brd-coverage-g13-personal-documents-self-service-2026-07-13.md
A  docs/reviews/full-review-g01-personal-details-self-service.md
A  docs/reviews/full-review-g03-attendance-punch-regularization.md
A  docs/reviews/full-review-g05-transfer-request-self-service.md
A  docs/reviews/full-review-g07-training-nomination-self-service.md
A  docs/reviews/full-review-g08-self-appraisal-self-service.md
A  docs/reviews/full-review-g10-payslip-self-service.md
A  docs/reviews/full-review-g11-pension-projection-self-service.md
A  docs/reviews/full-review-g12-service-register-self-service.md
A  docs/reviews/full-review-g13-personal-documents-self-service.md
A  docs/reviews/self-service-use-cases-2-10-2026-07-13.md     (this report)
```

## Checks run and results (final full pass, whole accumulated diff)

| Check | Result |
|---|---|
| `npm run check` (typecheck + build + full backend suite) | **659 pass, 0 fail, 1 pre-existing skip** (of 660) |
| `npm run web:check` (web typecheck + build + web unit tests) | **153 pass, 0 fail** |
| `npx playwright test` (full suite, 4 workers, default) | 28/29 pass; 1 flake (`critical.spec.ts` horizontal-overflow check) |
| `npx playwright test --workers=1` (same suite, serial) | **29/29 pass** — confirms the parallel-worker failure above is a CPU-contention timing flake, not a regression. This exact test was already documented as a pre-existing parallel-only flake in the prior leave-lifecycle goal's done report, before this goal's work began. |
| Per-feature targeted backend suites | All green at time of each feature's completion (see individual full-review docs for exact counts) |
| Per-feature Playwright specs | All exercised via real browser + real local API bridge (not mocked), each asserting both the golden path and a cross-employee-denial path where applicable |

## Traceability

- Each feature's `docs/reviews/brd-coverage-<slug>-2026-07-13.md` traces its use case to the relevant
  BRD FR/AC rows and records what was fixed vs. deliberately deferred, with reasoning.
- Each feature's `docs/reviews/full-review-<slug>.md` records verdict, checks run, findings (with
  file:line evidence), component-substance verification (anti-skeleton), and remaining risks. Two
  (G05, G08) were updated post-remediation from CONDITIONAL to PASS with an "Update 2026-07-13" note
  documenting exactly what was fixed, preserving the original review text below a separator. G13 was
  updated with a minor UX-completeness note (verdict unchanged, already PASS).
- `docs/contracts/auth-matrix.yaml` was amended only where a real gap existed (G01 bank approval);
  every other module's existing contract rows were matched, not changed.

## Caveats — resolved, accepted, or deferred

**Resolved (this goal):**
- G05 HIGH cross-employee PII read on transfer service-records.
- G08 MEDIUM unreachable validation branch + the LOW NaN-bypass bug it was gating.
- G01/G03 maker≠checker gaps on bank-account approval and attendance regularisation.
- G11 out-of-range pension estimate inputs.
- G13 incomplete error-message coverage (minor UX completeness).

**Accepted (documented, deliberately out of scope per the use-case-scoped BRD coverage decision):**
- G12 `getStatusChain`/`getEntryChain` remain `TenantScope`-typed (used by system integrity jobs,
  legitimately cross-employee); the one direct route exposing this (`GET /status-chain`) shares the
  same permission-only gate as those jobs. Documented in the G12 BRD-coverage doc.
- G05: manager-raised-but-cannot-self-view-via-`listMyOrders` gap, `auth-matrix.yaml` G05 action-code
  naming drift, dual-permission quirk on preferences read, absent standalone joining-report
  self-action. Documented in the G05 BRD-coverage doc.
- G13: 11 non-`DocumentRecord` routes' wire-leak (out of this use case's scope),
  `grantSecurityClearance` idempotency gap, unrouted legacy `DocumentVaultView.tsx`. Documented in
  the G13 BRD-coverage doc.
- G13 F1 (actor-trust reads `context.actor.actorUserId` rather than kernel-derived
  `context.scope.actorUserId`) — not live-exploitable through any real caller path today (the dev
  HTTP bridge hardcodes them equal), flagged as a latent footgun for future hardening, not urgent.
- G13 F3 (403-vs-404 enumeration signal on document existence) — standard low-severity signal,
  explicitly a judgment call the review recommended accepting.
- The dev-only HTTP bridge (`tools/local-api-server.mjs`) decodes bearer tokens without signature
  verification (commented "NOT for production use" in-repo) — every self-scope/SOD guarantee
  described in this goal's reports is a real, tested control against any server-issued
  `ActorContext`, not yet a hard boundary end-to-end until a signed auth layer exists. This is a
  pre-existing, whole-repo condition, not specific to any of the 9 features.

**Deferred:** none beyond the above — every item above already has an owner/location recorded in its
feature's report; none are silently left undocumented.

## Remaining risks

- In-memory repositories: all seeded data (employees, transfer orders, APAR forms, payslip runs,
  documents) is process-lifetime only, consistent with the rest of this system's existing tests/dev
  server — not a regression introduced by this goal.
- The unsigned dev-token caveat above applies uniformly across all 9 features' self-scope/SOD
  guarantees; it is a whole-repo, pre-existing condition and was flagged consistently in every
  feature's full-review doc rather than re-litigated per feature.
- The `critical.spec.ts` horizontal-overflow Playwright test is flaky specifically under 4-worker
  parallel execution (CPU contention delays a layout reflow before the assertion runs); it is not a
  real UI defect (29/29 pass serially) and is not caused by this goal's changes (documented as
  pre-existing in the prior leave-lifecycle goal's done report).
