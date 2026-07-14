# BRD Coverage Review — G03 Attendance Capture & Punch Regularization (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G03-attendance-and-leave-management.md` — **scoped subset only**
Scope decision (per the same principle confirmed for the G01 personal-details pass): this covers
only the FRs implementing "mark attendance / regularize punches — clock in/out, request correction
for missed punches." It does not cover FR-02 (holiday calendar, already built/seeded from the leave
work), FR-06 (overtime), FR-07 (WFH), FR-08 (on-duty/tour), FR-09 (comp-off), or FR-20
(fraud/anomaly detection) — those are separate, already-implemented-at-the-backend BRD requirements
not named in this use case.
Verdict: **GAPS-FOUND** (core use case now works end-to-end; one significant pre-existing
architectural deviation from the BRD is flagged, not silently fixed, matching the same judgment
call made for G02 self-service routing in the prior use case)

## In-scope requirements

| FR | Title |
|---|---|
| FR-01 | Shift & Roster Management (supporting; already implemented, not rebuilt) |
| FR-03 | Attendance Punch Ingestion (partial: manual self-capture built; biometric/device punch UI out of scope) |
| FR-04 | Daily Attendance Processing & Status (already implemented; exposed to the UI this session) |
| FR-05 | Missed-Punch Regularisation (the core of this use case) |

## What changed this session

- Backend: `apps/api/src/modules/g03/leaveService.ts` — added maker≠checker (SoD) enforcement to
  `regulariseAttendance()` (new `capturedByUserId` field on `AttendanceRecord`, override-role set,
  `SOD_VIOLATION` throw). `apps/api/src/routes/g03.routes.ts` — strips `capturedByUserId` from all
  3 wire responses that carry an `AttendanceRecord` (capture, regularise, derive-from-punches, list).
- Frontend: 2 new panels — `AttendanceCapturePanel.tsx` (employee self-service clock in/out +
  own history) and `AttendanceRegularizationPanel.tsx` (attendance-admin regularization queue) —
  wired into `apps/web/src/App.tsx`'s `/me/attendance-leave` route. Neither existed before this
  session; the route previously only rendered leave components.
- Client: `apps/web/src/api/hrmsClient.ts`/`fixtureHrmsClient.ts` — added `listAttendance`,
  `captureAttendance`, `regulariseAttendance` (none existed before).
- Bug fix: demo employee session (`apps/web/src/app/session.ts`) was missing
  `g03.attendance.capture` — added, so self-service clock in/out actually works for the demo user.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added one real missed-punch record (Sunita,
  2026-07-13, clocked in, never clocked out → `ANOMALY`/`MISSING_OUT`) so the regularization queue
  has genuine seeded data to act on, not an invented fixture.
- Tests: `apps/api/test/attendance-capture-regularization.test.cjs` (6 tests, real HTTP against
  `seedTestEmployees:true` data) and `apps/web/test/e2e/attendance-capture-regularization.spec.ts`
  (1 Playwright test: employee creates a real missed punch through the UI, a different
  attendance-admin session regularises it).

## Coverage Matrix

### FR-04 — Daily Attendance Processing, Sub-Day Allocation & Status

| Layer | Verdict | Evidence |
|---|---|---|
| DATA | EXISTS | `AttendanceRecord` (`leaveService.ts:110-123`) |
| API | EXISTS | `GET /api/v1/attendance/records`, `POST /api/v1/atl/attendance-captures` |
| UI | EXISTS (new this session) | `AttendanceCapturePanel.tsx` renders the employee's own history with status/anomaly/regularised flags |

Status-derivation precedence (HOLIDAY > ON_LEAVE > punch handling) was already implemented and
tested (`ph07-g03-attendance-payroll.test.cjs`, pre-existing); this session did not touch that logic,
only exposed it.

### FR-05 — Missed-Punch Regularisation

| AC | Verdict | Evidence |
|---|---|---|
| AC1 (raise only for own past days within window) | PARTIAL | Backdate window enforced (`WINDOW_EXPIRED`, tested), but see the "Accepted deviation" below — there is no "raise" step distinct from "regularise" |
| AC2 (approval enqueues recompute, no direct write) | **DEVIATION** | The implementation directly mutates `attendance.status = "REGULARISED"` in the same call that performs the "approval" — there is no separate raise-then-recompute step. A `JOB-G03-ATTENDANCE-RECOMPUTE` job run is still recorded (`leaveService.ts` regulariseAttendance), so downstream effects are tracked, but the two-step "enqueue recompute" model the BRD describes isn't literally what happens. |
| AC3 (rejected leaves attendance unchanged, reason logged) | PARTIAL | There is no "reject" verb at all — only regularise (accept) exists. A reason is required and audited on the accept path. Rejection isn't reachable because there's no pending state to reject *from*. |
| AC4 (monthly cap enforced) | DONE, TESTED | `REGULARISATION_LIMIT` (`leaveService.ts` regulariseAttendance); tested pre-existing (`ph07d-g03-payroll-feed.test.cjs`) and re-confirmed this session |
| AC5 (P05 captures before/after status) | DONE | `audit.recordMutation` call in `regulariseAttendance` |
| AC6 (locked period emits payroll_feed_adjustments) | DONE | Pre-existing, tested in `ph07d-g03-payroll-feed.test.cjs` |
| Business rule: "SoD by P02 (no self-approve)" | **REMEDIATED THIS SESSION** | Was `NOT_FOUND` — any actor holding `g03.attendance.regularise`, including the employee who captured the record (if they somehow also held that permission), could regularise it. Fixed: `capturedByUserId` tracking + `SOD_VIOLATION` gate, mirroring the bank-account fix from the prior use case. Tested. |

### FR-05 — Accepted deviation from the BRD's stated design (pre-existing, not introduced this session)

The BRD specifies regularisation as a **two-party P01 workflow**: "Employee submits a correction...
routed to manager on P01 (reporting-chain resolution)... on approval an FR-04 recompute is
enqueued" — with its own entity (`regularisation_requests`), its own API
(`POST /api/v1/atl/regularisations`, `POST /api/v1/atl/regularisations/{id}/decision`), and manager
(not flat-permission-admin) approval, exactly like leave.

**What's actually implemented** is a **single-step, flat-permission action**
(`POST /api/v1/atl/attendance-captures/{id}:regularise`, gated only by `g03.attendance.regularise`)
with no separate "submit" step, no `regularisation_requests` entity, and no P01/reporting-chain
routing. This is a **significant, pre-existing architectural gap** between the BRD and the code —
discovered, not introduced, in this session. Building the full two-party P01-routed workflow (a new
entity, a new state machine, new routes, reporting-chain resolution, a manager-facing "My Team"
inbox — essentially replicating the scope of what leave already has) is disproportionate to this
pass, matching the same judgment applied to the G02 self-service-routing deviation in the prior
use case. **This session's UI and tests honestly reflect the actual (flat, admin-side) implementation
rather than fabricating a two-step flow the backend doesn't support**, and closed the one gap that
was cheap and clearly in scope regardless of which design wins (the SoD self-approve gate). The
deeper "should this become a real P01 workflow like leave" question is flagged for a deliberate
decision, not resolved here.

### FR-03 — Attendance Punch Ingestion (partial scope)

The BRD's full FR-03 covers biometric/RFID/mobile-geo device punch ingestion
(`POST /api/v1/atl/attendance-punches`, device registration, dedup, anomaly flagging on ingest) —
already implemented and tested pre-existing (`ph15c-g03-attendance-ops.test.cjs`). This session
built a **manual self-service capture form** (`AttendanceCapturePanel`) using the simpler
`attendance-captures` endpoint (explicit in/out time entry), not a device-punch UI. This matches
what a remote/WFH employee without biometric hardware would realistically use, and is consistent
with how the pre-existing seed data already populates attendance (`testEmployeesSeed.ts` uses the
same `captureAttendance` path, not punch ingestion). Building a device-registration/punch-ingestion
UI was judged out of proportion for this use case (no named device hardware in the use case
description) and is not attempted here.

## Remediated Gaps (this session)

1. **Attendance-regularisation maker≠checker (SoD) enforcement** — real gap matching an explicit
   BRD business rule ("SoD by P02 (no self-approve)"), fixed and tested.
2. **Internal `capturedByUserId` field stripped from all wire responses** — applied proactively this
   time (the equivalent gap was only caught by review, not prevented, in the prior G01 pass).
3. **2 missing frontend panels** (clock in/out, regularization queue) — built, wired, tested
   end-to-end (backend + e2e), using a real seeded missed-punch record.
4. **Demo-session permission gap** (`g03.attendance.capture` missing) blocking self-service
   clock in/out — fixed.

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | FR | Size | Why deferred |
|---|---|---|---|
| Full P01-routed two-party regularisation workflow (submit → manager approve → recompute) | FR-05 AC2/AC3, business rules | XL | Pre-existing architectural deviation; would replicate leave's entire workflow scope. Flagged for a deliberate decision, not silently built or silently ignored. |
| Reject verb for regularisation | FR-05 AC3 | M | Not reachable without the two-party workflow above (there's no pending state to reject from) |
| Device/biometric punch-ingestion UI | FR-03 | L | Out of proportion; no device hardware named in this use case; manual capture achieves the same observable outcome for a self-service employee |

## Scorecard

```
LINE-ITEM COVERAGE (FR-05 ACs + 1 business rule; FR-04/FR-03 treated qualitatively above)
============================================================================================
Total FR-05 line items audited: 7 (6 ACs + 1 named business rule)
DONE:                            3 (AC4, AC5, AC6)
PARTIAL:                         2 (AC1, AC3)
DEVIATION (flagged):             1 (AC2)
REMEDIATED THIS SESSION:         1 (SoD business rule)
```

## Verdict: GAPS-FOUND

The observable use case — an employee can clock in/out and see their own attendance/anomaly status,
and an attendance admin (a genuinely different actor, enforced) can regularise a missed punch with a
reason — now works end-to-end against real seeded data, proven by backend and e2e tests. The
significant open item is architectural (BRD wants a P01-routed two-party workflow; the code has a
flat single-step action) and is explicitly flagged rather than either silently built (disproportionate
scope) or silently left undocumented.
