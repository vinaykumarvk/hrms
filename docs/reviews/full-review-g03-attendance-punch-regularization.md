# Full Review: G03 Attendance Capture & Punch Regularization

## Verdict
**PASS** (no CRITICAL or HIGH findings; three MEDIUM and two LOW findings recorded, none blocking)

## Scope
- **Target**: G03 attendance self-service capture + FR-05 punch regularisation, this session's maker!=checker (SoD) hardening pass.
- **Selected path**: light (SoD hardening on an existing brownfield engine + two new self-service UI panels).
- **Files reviewed**:
  - `apps/api/src/modules/g03/leaveService.ts` (SoD gate, `AttendanceRecord.capturedByUserId`, `ATTENDANCE_REGULARISE_OVERRIDE_ROLES`)
  - `apps/api/src/modules/g01/bankAccountService.ts` (reference SoD convention)
  - `apps/api/src/modules/g03/attendanceOpsService.ts` (`deriveAttendanceFromPunches`)
  - `apps/api/src/routes/g03.routes.ts` (`toWireAttendance`, all 4 attendance response sites)
  - `apps/api/src/http/errors.ts`, `apps/api/src/platform/types.ts` (error-code → HTTP status taxonomy)
  - `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts` (types + client methods, fixture parity)
  - `apps/web/src/modules/g03/AttendanceCapturePanel.tsx`, `AttendanceRegularizationPanel.tsx` (new)
  - `apps/web/src/modules/g01/EmployeeBankAccountsPanel.tsx` (reference UI pattern)
  - `apps/web/src/app/OperationalStates.tsx`, `apps/web/src/App.tsx`, `apps/web/src/app/session.ts`
  - `apps/api/src/seed/testEmployeesSeed.ts`
  - `apps/api/test/attendance-capture-regularization.test.cjs`, `apps/web/test/e2e/attendance-capture-regularization.spec.ts`
- **Artefacts used**: `docs/reviews/brd-coverage-g03-attendance-punch-regularization-2026-07-13.md` (read for the pre-accepted P01-workflow-vs-flat-action scope decision; not re-litigated here).

## Checks run
| Check | Ran? | Result | Evidence |
|---|---|---|---|
| `npm run build` (tsc, full repo) | Yes | Pass, 0 errors | Clean `npx tsc -p tsconfig.json` exit |
| `npm run web:typecheck` | Yes | Pass, 0 errors | Clean `npx tsc -p apps/web/tsconfig.json --noEmit` exit |
| API test suite (`node --test apps/api/test/*.test.cjs`) | Yes | 609 pass / 1 pre-existing skip / 0 fail | 610 total, `attendance-capture-regularization.test.cjs` 6/6 pass |
| Playwright e2e (`attendance-capture-regularization.spec.ts`) | Yes | 1/1 pass | `1 passed (13.1s)` |
| Live `api.dispatch()` probe: `capturedByUserId` leak on capture/regularise/list | Yes (via existing test) | Pass — never present | `attendance-capture-regularization.test.cjs` lines 105, 124, 128 |
| Live `api.dispatch()` probe: `capturedByUserId` leak on `attendance-punches:derive-day` (route not covered by the existing suite) | Yes (ad hoc probe) | Pass — never present, incl. a full in/out PRESENT day | Scratchpad probe, device registered, punch-in 09:15 + punch-out 17:45 → derived `status: "PRESENT"`, response object has no `capturedByUserId` key |
| SoD pattern consistency vs G01 bank-account reference | Yes | Consistent shape (override-role set, same-actor check, `SOD_VIOLATION` throw); one documentation gap found | See F-1 |
| Error-code → HTTP-status cross-check (`WINDOW_EXPIRED`, `REGULARISATION_LIMIT`, `SOD_VIOLATION`) vs UI assumptions | Yes | UI maps by error **code string** (`displayCode`), not HTTP status, so the "422 vs 409" distinction cannot cause a UI bug here | `apps/api/src/http/errors.ts` lines 61 (409 `REGULARISATION_LIMIT`), 26 (403 `SOD_VIOLATION`), 157 (422 `WINDOW_EXPIRED`); `hrmsClient.ts` `HrmsApiError.displayCode` getter (line 1595) |
| Fixture/backend SoD parity (`fixtureHrmsClient.ts`) | Yes | Drift found, undocumented (unlike the G01 fixture) | See F-2 |
| React state-machine parity vs `EmployeeBankAccountsPanel`/`EmployeeContactsPanel` | Yes | Matches (loading/error/empty/ready + idle/submitting/success/error) | Both new panels use identical state union shapes |
| Anti-skeleton check | Yes | Both panels make real API calls and render real fetched data | See Component substance table |
| Accessibility spot-check (label/id pairing, ARIA region naming, dynamic aria-label uniqueness) | Yes | Pass, one minor observation | See F-4 |
| BRD coverage / cross-FR review | Skipped | N/A | Already covered by the referenced brd-coverage doc for this feature; the documented P01-workflow-vs-flat-action gap is out of scope per task instructions |

## Findings
| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F-1 | MEDIUM | Security (documentation) | `apps/api/src/modules/g03/leaveService.ts:602-616` | The attendance SoD gate lacks the CAVEAT comment that the G01 bank-account reference carries, explaining that `actor.roles`/`permissions` are self-declared under the dev-only HTTP bridge (`tools/local-api-server.mjs`) and this is not yet a hard security boundary end-to-end. | Compare to `apps/api/src/modules/g01/bankAccountService.ts:203-212`, which has an 8-line CAVEAT docblock directly above `approveBankAccount`; `leaveService.ts` has only a one-line comment at line 176-178 describing the override-role convention, no caveat about token-signature trust. This is the same pre-existing platform-wide caveat noted in the task brief, not a new vulnerability — but the asymmetry means a future reader of `leaveService.ts` alone won't learn the limitation that a reader of `bankAccountService.ts` would. | Add the same CAVEAT paragraph (or a one-line pointer to `bankAccountService.ts`'s comment) above `regulariseAttendance`. | Yes — implementation-only doc comment, no contract/spec change. |
| F-2 | MEDIUM | Quality / Fixture parity | `apps/web/src/api/fixtureHrmsClient.ts:964-973` | `regulariseAttendance` in the fixture client silently does not enforce (or even acknowledge) the SoD gate, unlike the G01 bank-account fixture's `approveBankAccount`, which carries an explicit `NOTE:` comment (lines 869-874) directing SoD-dependent tests to the real API. | `fixtureHrmsClient.ts` lines 964-973 unconditionally sets `status: "REGULARISED"` regardless of which actor "submits" — no comment, no reference to the real gate, no pointer to the tests that do exercise it. This is the exact drift pattern the G01 review previously caught and the G01 fixture was fixed to document. | Add the same style of `NOTE:` comment above `regulariseAttendance` (and ideally `captureAttendance`, since it sets no `capturedByUserId` equivalent either) pointing to `attendance-capture-regularization.test.cjs` as the SoD-authoritative test. | Yes — comment-only fixture change. |
| F-3 | LOW | Quality / Error UX | `apps/web/src/modules/g03/AttendanceRegularizationPanel.tsx:12-16` | `REGULARISE_ERROR_MESSAGES` does not include an entry for `SOD_VIOLATION`, even though it is a real, reachable error code from `regulariseAttendance` (thrown at `leaveService.ts:612`) and is exercised by the test suite. A self-approve attempt therefore falls through to the generic fallback string `"The regularisation could not be recorded."` instead of a specific explanation. | `REGULARISE_ERROR_MESSAGES` keys: `FORBIDDEN`, `WINDOW_EXPIRED`, `REGULARISATION_LIMIT` only (lines 12-16); `describeRegulariseError` fallback at line 19; SoD throw confirmed live via `attendance-capture-regularization.test.cjs:107-114` returning `SOD_VIOLATION`. Not a functional bug — the action still fails closed — but the UI message is less informative than it could be for a realistic failure mode (an employee attempting to self-regularise their own capture). | Add `SOD_VIOLATION: "You captured this attendance day yourself; a different authorised user must regularise it."` to the dictionary. | Yes — string literal only. |
| F-4 | LOW | Quality / Type accuracy | `apps/web/src/api/hrmsClient.ts:813-816` vs `apps/api/src/routes/g03.routes.ts:269-278` | The `AttendanceRegulariseResult` TypeScript type declares only `{ attendance: AttendanceRecordView }`, but the actual wire response from `POST .../:regularise` is `{ ...result, attendance: toWireAttendance(result.attendance) }`, where `result` also carries `job`, and optionally `signal`/`adjustment` from `LeaveService.regulariseAttendance`'s return shape. The declared client type is a strict subset of the real payload. | `g03.routes.ts:277`: `return accepted({ ...result, attendance: toWireAttendance(result.attendance) });` — `result`'s type per `leaveService.ts:607` is `{ attendance; job: JobRun; signal?: PayrollSignal; adjustment?: PayrollFeedAdjustment }`. `hrmsClient.ts` types only `attendance`. | Not a runtime bug (TS structural typing tolerates extra wire fields silently) but is technically inaccurate. Extend `AttendanceRegulariseResult` to include the optional `job`/`signal`/`adjustment` fields, or explicitly comment that only `attendance` is consumed client-side and the rest is intentionally untyped/ignored. | Yes — additive type change, no behavior change. |
| F-5 | LOW | Accessibility (observation, not a defect) | `apps/web/src/modules/g03/AttendanceRegularizationPanel.tsx:118` | The per-row form's `aria-label` is built from `record.attendanceDate` + `record.employeeId` (not `record.id`), e.g. `"Regularise 2026-07-12 for emp-000003"`. This is valid and unique today because attendance is captured at most once per (employeeId, attendanceDate) pair, but the uniqueness is incidental (derived from business-rule invariants elsewhere) rather than guaranteed by the label construction itself. | `AttendanceRegularizationPanel.tsx:118`: `aria-label={`Regularise ${record.attendanceDate} for ${record.employeeId}`}`. Compare `id={`g03-regularise-reason-${record.id}`}` (line 122), which uses the guaranteed-unique record id. | No action required for current correctness; if a future schema change ever allowed multiple attendance rows per employee/day (e.g., split-shift), this label would silently collide. Optionally switch the aria-label to also include `record.id` for defense-in-depth. | Yes, if desired — cosmetic. |

No CRITICAL or HIGH findings. The `capturedByUserId` non-leak claim was independently verified live across all 4 wire sites (capture, regularise, list, derive-day), including a code path (`derive-day`) not covered by the checked-in test suite.

## Component substance check
| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `AttendanceCapturePanel` | `apps/web/src/modules/g03/AttendanceCapturePanel.tsx` | Date, clock-in time, clock-out time (native `<input type="date">`/`<input type="time">`) | `client.listEmployees()`, `client.listAttendance()`, `client.captureAttendance(...)` with real idempotency key (`crypto.randomUUID()`) | Renders real fetched attendance history (date, status, in/out times, anomaly code, regularised flag) from live API/fixture data, not placeholder text | Real, substantive — not a skeleton |
| `AttendanceRegularizationPanel` | `apps/web/src/modules/g03/AttendanceRegularizationPanel.tsx` | Free-text reason per row, submitted per-record | `client.listAttendance()` (filtered client-side for ANOMALY/anomalyCode), `client.regulariseAttendance(id, reason, idempotencyKey)` | Renders the real anomaly queue (date, employeeId, anomaly code, in/out times) from live data; list updates (row disappears) after a real regularise call round-trips | Real, substantive — not a skeleton |

## Traceability impact
- No new FRs introduced; this is a hardening pass on the existing FR-05 regularisation flow (SoD control) plus first-time UI exposure of already-tested backend capabilities (FR-03/FR-04 capture, FR-05 regularise). The documented BRD gap (flat single-step action vs P01 two-party workflow) remains as previously recorded in `docs/reviews/brd-coverage-g03-attendance-punch-regularization-2026-07-13.md` — not re-flagged here per task instructions.
- `docs/reviews/brd-coverage-g03-attendance-punch-regularization-2026-07-13.md` should be cross-linked from this report (and vice versa) for future readers, but no content change to that file is required.

## Required amendments
None. All findings (F-1 through F-5) are implementation-only repairs (comments, a dictionary entry, a type extension) — none require a requirements, contract, LLD, or state-machine amendment.

## Verification commands
```bash
# Full build (TypeScript compile across the repo)
npm run build

# Web typecheck
npm run web:typecheck

# API test suite (includes the 6 new attendance SoD/anomaly tests)
node --test apps/api/test/*.test.cjs
node --test apps/api/test/attendance-capture-regularization.test.cjs

# Playwright e2e (real login + real API round-trip, not fixture-backed)
npx playwright test --config apps/web/playwright.config.ts apps/web/test/e2e/attendance-capture-regularization.spec.ts
```

## Remaining risks
- **Pre-existing, platform-wide (not new to this feature)**: `tools/local-api-server.mjs` decodes bearer tokens without signature verification in local/dev mode, so `actor.roles`/`actor.permissions` — and therefore both the bank-account and attendance SoD gates — are only as trustworthy as the caller-supplied claims until a real signature-verified auth layer is wired in. This is the same caveat already documented in `bankAccountService.ts`; F-1 above only flags that the *comment* documenting it is missing from `leaveService.ts`, not that the underlying exposure is new or attendance-specific.
- **Documented, out of scope for this review**: the BRD's two-party P01 reporting-chain regularisation workflow vs. the shipped flat permission-gated action — tracked in `docs/reviews/brd-coverage-g03-attendance-punch-regularization-2026-07-13.md` as a deliberate scope decision, not re-raised as a fresh finding here.
- **Fixture drift (F-2)**: until fixed, any future contributor writing a fixture-backed (non-API) test for attendance regularisation could be misled into believing SoD is enforced in that mock, mirroring the exact class of drift previously caught in the G01 bank-account fixture — low likelihood given the existing e2e/API tests already correctly exercise the real service, but worth closing for consistency.
