# BRD Coverage Review — G03 Attendance and Leave Management

Date: 2026-07-02
BRD under review: `docs/brd/v3/G03-attendance-and-leave-management.md`
Verdict: **FAIL — leave/attendance proof slice implemented, full BRD not yet implemented**

## Scope

The G03 BRD defines 23 functional requirements from `FR-01` through `FR-23` (`docs/brd/v3/G03-attendance-and-leave-management.md:1075`, `docs/brd/v3/G03-attendance-and-leave-management.md:1333`). It covers a full time-and-absence product: shifts, rosters, holidays, biometric/mobile punches, daily attendance processing, regularisation, overtime, WFH/OD/tour, comp-off, leave configuration, accruals, leave approval, cancellation, backdating/conflicts, year close, encashment, payroll feed, self-service, delegation, anomaly review, biometric/geo consent, sanction-based leave counters, and advanced absence features.

## Evidence Base

Executable implementation found:

- Single backend service file: `apps/api/src/modules/g03/leaveService.ts`.
- Single route file: `apps/api/src/routes/g03.routes.ts`.
- Single G03 web module: `apps/web/src/modules/g03/LeaveWorkspace.tsx`.
- Service implements in-memory leave application submission, P01 reporting-chain workflow start, balance reservation, approval, rejection, delegation, cancellation, accrual, attendance capture, attendance regularisation, overtime signal, and payroll signal listing (`apps/api/src/modules/g03/leaveService.ts:83`, `apps/api/src/modules/g03/leaveService.ts:503`).
- Routes expose leave applications, leave decision, leave balance, leave-SR outbox, leave accruals, attendance capture, attendance regularisation, overtime, and payroll signals (`apps/api/src/routes/g03.routes.ts:17`, `apps/api/src/routes/g03.routes.ts:194`).
- Tests cover leave submit/approve/delegate/SR handoff, API leave submit/approve, accrual, cancellation, attendance regularisation, overtime, and payroll signals (`apps/api/test/ph06-g03-leave.test.cjs:32`, `apps/api/test/ph07-g03-attendance-payroll.test.cjs:32`, `apps/api/test/ph07-g03-attendance-payroll.test.cjs:77`).
- UI renders a proof card for leave approval evidence, not a full attendance/leave workspace (`apps/web/src/modules/g03/LeaveWorkspace.tsx:9`, `apps/web/src/modules/g03/LeaveWorkspace.tsx:49`).

Specification/design coverage found:

- OpenAPI covers the full G03 contract and declares the current implemented minimum route set separately from the broader endpoint surface (`docs/contracts/openapi/G03.yaml:33`, `docs/contracts/openapi/G03.yaml:45`, `docs/contracts/openapi/G03.yaml:56`, `docs/contracts/openapi/G03.yaml:104`).
- SQL data model states G03 is the time-and-absence system of record and covers the full schema surface (`docs/data-model/03-G03-attendance-leave.sql:5`, `docs/data-model/03-G03-attendance-leave.sql:10`).
- SQL defines broad schema support for shifts, rosters, holidays, devices, DPDP consent, punches, leave types, accrual policies, leave ledger, leave applications, attendance daily, regularisation, overtime, exceptions, comp-off, payroll feed, adjustments, and encashment (`docs/data-model/03-G03-attendance-leave.sql:196`, `docs/data-model/03-G03-attendance-leave.sql:943`).

## Coverage Matrix

| Requirement | BRD Evidence | Executable Evidence | Status |
|---|---:|---:|---|
| FR-01 Shift & Roster Management | `docs/brd/v3/G03-attendance-and-leave-management.md:1075`; schema `docs/data-model/03-G03-attendance-leave.sql:196`, `docs/data-model/03-G03-attendance-leave.sql:227`; contract `docs/contracts/openapi/G03.yaml:112` | No shift/roster runtime routes in `apps/api/src/routes/g03.routes.ts:17`-`194` | **GAP** |
| FR-02 Holiday Calendar Management | `docs/brd/v3/G03-attendance-and-leave-management.md:1093`; schema `docs/data-model/03-G03-attendance-leave.sql:254`, `docs/data-model/03-G03-attendance-leave.sql:277`; contract `docs/contracts/openapi/G03.yaml:200` | No holiday calendar runtime | **GAP** |
| FR-03 Attendance Punch Ingestion | `docs/brd/v3/G03-attendance-and-leave-management.md:1111`; schema `docs/data-model/03-G03-attendance-leave.sql:394`; contract `docs/contracts/openapi/G03.yaml:368` | Runtime has simplified attendance capture (`apps/api/src/modules/g03/leaveService.ts:317`) but no biometric/RFID/mobile-geo batch ingestion, idempotent device source, consent/geofence validation, or anomaly flags | **PARTIAL** |
| FR-04 Daily Attendance Processing | `docs/brd/v3/G03-attendance-and-leave-management.md:1131`; schema `docs/data-model/03-G03-attendance-leave.sql:708`; contract `docs/contracts/openapi/G03.yaml:407` | No daily processing writer or sub-day allocation; simplified attendance records only | **GAP** |
| FR-05 Missed-Punch Regularisation | `docs/brd/v3/G03-attendance-and-leave-management.md:1150`; schema `docs/data-model/03-G03-attendance-leave.sql:768`; route `apps/api/src/routes/g03.routes.ts:148` | Simplified regularise method exists and emits recompute job/payroll signal (`apps/api/src/modules/g03/leaveService.ts:337`); no request lifecycle/P01 approval/doc support | **PARTIAL** |
| FR-06 Overtime Capture & Approval | `docs/brd/v3/G03-attendance-and-leave-management.md:1168`; schema `docs/data-model/03-G03-attendance-leave.sql:796`; route `apps/api/src/routes/g03.routes.ts:161` | Runtime records positive overtime directly as payroll signal (`apps/api/src/modules/g03/leaveService.ts:358`); no P01 approval, policy rate, comp-off conversion, duplicate-date prevention | **PARTIAL** |
| FR-07 Work-From-Home | `docs/brd/v3/G03-attendance-and-leave-management.md:1177`; schema exceptions `docs/data-model/03-G03-attendance-leave.sql:820`; contract tag present | No WFH runtime | **GAP** |
| FR-08 On-Duty/Tour/Outdoor Duty | `docs/brd/v3/G03-attendance-and-leave-management.md:1185`; schema exceptions `docs/data-model/03-G03-attendance-leave.sql:820` | No OD/tour runtime | **GAP** |
| FR-09 Comp-Off Earning and Redemption | `docs/brd/v3/G03-attendance-and-leave-management.md:1193`; schema `docs/data-model/03-G03-attendance-leave.sql:855`; contract `docs/contracts/openapi/G03.yaml:649` | No comp-off ledger runtime; overtime does not create COMP_OFF credits | **GAP** |
| FR-10 Leave-Type and Accrual Policy Configuration | `docs/brd/v3/G03-attendance-and-leave-management.md:1200`; schema `docs/data-model/03-G03-attendance-leave.sql:457`, `docs/data-model/03-G03-attendance-leave.sql:494`; contract `docs/contracts/openapi/G03.yaml:705` | No leave-type/policy config runtime | **GAP** |
| FR-11 Accrual Engine and Leave-Balance Ledger | `docs/brd/v3/G03-attendance-and-leave-management.md:1215`; schema `docs/data-model/03-G03-attendance-leave.sql:538`, `docs/data-model/03-G03-attendance-leave.sql:567`; route `apps/api/src/routes/g03.routes.ts:107` | Simplified manual accrual and in-memory ledger exist (`apps/api/src/modules/g03/leaveService.ts:299`, `apps/api/src/modules/g03/leaveService.ts:416`); no scheduled accrual engine, rounding/proration/policy-driven ledger | **PARTIAL** |
| FR-12 Leave Application and Approval | `docs/brd/v3/G03-attendance-and-leave-management.md:1231`; schema `docs/data-model/03-G03-attendance-leave.sql:604`; route `apps/api/src/routes/g03.routes.ts:20`; service `apps/api/src/modules/g03/leaveService.ts:100` | Core proof slice implemented: reservation, P01 reporting chain, approval, ledger debit, G04 outbox, G12 SR, notification, tests | **PARTIAL** |
| FR-13 Leave Cancellation and Modification | `docs/brd/v3/G03-attendance-and-leave-management.md:1251`; route decision branch `apps/api/src/routes/g03.routes.ts:74`; service `apps/api/src/modules/g03/leaveService.ts:255` | Full cancellation of approved leave exists with SR reversal and payroll signal; no withdrawal, partial modification, past/locked-period checks | **PARTIAL** |
| FR-14 Backdated Leave and Team Calendar Conflicts | `docs/brd/v3/G03-attendance-and-leave-management.md:1259`; contract conflict/team-calendar endpoints `docs/contracts/openapi/G03.yaml:1153`, `docs/contracts/openapi/G03.yaml:1191` | No backdate policy/team calendar/conflict detection runtime | **GAP** |
| FR-15 Leave-Year Close | `docs/brd/v3/G03-attendance-and-leave-management.md:1267`; state machine `docs/contracts/state-machines.yaml:247`; contract `docs/contracts/openapi/G03.yaml:1222` | No year-close simulate/commit runtime | **GAP** |
| FR-16 Leave Encashment | `docs/brd/v3/G03-attendance-and-leave-management.md:1275`; schema `docs/data-model/03-G03-attendance-leave.sql:943`; contract `docs/contracts/openapi/G03.yaml:1306` | No encashment runtime | **GAP** |
| FR-17 Attendance/Leave to Payroll Feed | `docs/brd/v3/G03-attendance-and-leave-management.md:1282`; schema `docs/data-model/03-G03-attendance-leave.sql:886`, `docs/data-model/03-G03-attendance-leave.sql:916`; route `apps/api/src/routes/g03.routes.ts:180` | Runtime emits simplified `READY_FOR_G10` signals (`apps/api/src/modules/g03/leaveService.ts:73`, `apps/api/src/modules/g03/leaveService.ts:427`); no pay-period feed generation, locking, G10 ack, failed/retry, adjustment tables | **PARTIAL** |
| FR-18 Self-Service Surface and Notifications | `docs/brd/v3/G03-attendance-and-leave-management.md:1290`; UI `apps/web/src/modules/g03/LeaveWorkspace.tsx:9` | Proof card only; no self-service punch/apply/cancel/balance/manager inbox workflow. Notifications exist for submit/approve/delegate only (`apps/api/src/modules/g03/leaveService.ts:152`, `apps/api/src/modules/g03/leaveService.ts:245`) | **PARTIAL/GAP** |
| FR-19 Approval Delegation and Out-of-Office Routing | `docs/brd/v3/G03-attendance-and-leave-management.md:1298`; service delegate `apps/api/src/modules/g03/leaveService.ts:166` | Manual delegate on a leave application exists; no delegation records, scope/window/SLA auto-route/expiry/revoke APIs | **PARTIAL** |
| FR-20 Time-Fraud and Punch Anomaly Review | `docs/brd/v3/G03-attendance-and-leave-management.md:1306`; schema anomaly enums `docs/data-model/03-G03-attendance-leave.sql:187` | Attendance capture marks simple missing-punch anomaly (`apps/api/src/modules/g03/leaveService.ts:320`); no fraud review case lifecycle, SoD reviewer, valid/fraud decisions, payroll reconciliation surfacing | **PARTIAL/GAP** |
| FR-21 DPDP Biometric/Geo Consent | `docs/brd/v3/G03-attendance-and-leave-management.md:1314`; schema `docs/data-model/03-G03-attendance-leave.sql:331`; contract `docs/contracts/openapi/G03.yaml:1734` | No consent grant/withdraw/fallback/purge/DPO runtime | **GAP** |
| FR-22 Sanction-Based Leave Entitlement Counters | `docs/brd/v3/G03-attendance-and-leave-management.md:1322`; contract `docs/contracts/openapi/G03.yaml:1859` | No entitlement counter runtime | **GAP** |
| FR-23 Forecast, Mass-Leave, Blackout, Return-to-Work | `docs/brd/v3/G03-attendance-and-leave-management.md:1329`; contract `docs/contracts/openapi/G03.yaml:1924`, `docs/contracts/openapi/G03.yaml:1954` | No forecast/mass-leave/blackout/return-to-work runtime | **GAP** |

## User-Facing Coverage

The BRD requires Me/My Team/Admin workspaces for leave applications, balances, attendance, punches, rosters, calendars, approvals, regularisation, overtime, comp-off, year close, encashment, payroll feed, delegations, anomalies, consents, entitlements, and advanced absence actions (`docs/brd/v3/G03-attendance-and-leave-management.md:1338`, `docs/brd/v3/G03-attendance-and-leave-management.md:1362`). Current UI is a static proof card with leave approval facts and evidence markers (`apps/web/src/modules/g03/LeaveWorkspace.tsx:23`, `apps/web/src/modules/g03/LeaveWorkspace.tsx:48`).

## Test Coverage Assessment

Existing tests are useful but narrow:

- Leave workflow/G04 SR handoff/API path is tested in `apps/api/test/ph06-g03-leave.test.cjs:32` and `apps/api/test/ph06-g03-leave.test.cjs:72`.
- Accrual/cancellation/payroll signal path is tested in `apps/api/test/ph07-g03-attendance-payroll.test.cjs:32`.
- Attendance regularisation/overtime/API payroll signals are tested in `apps/api/test/ph07-g03-attendance-payroll.test.cjs:57` and `apps/api/test/ph07-g03-attendance-payroll.test.cjs:77`.
- No automated tests were found for shifts, rosters, holiday calendars, punch ingestion devices/geo/consent, daily attendance processing, WFH/OD/tour, comp-off redemption, leave config, policy accrual, year close, encashment, locked payroll feed, self-service UI, delegation records, anomaly review, DPDP consent, entitlement counters, forecast, mass leave, blackout, or return-to-work.

Validation baseline captured during this review:

- `npm test` passed: 125/125 API tests.
- `npm run web:test` passed: 32/32 web tests.
- These green checks validate the implemented proof slices; they do not close the G03 BRD gaps listed here.

## Critical Gaps

| Gap ID | Severity | Gap | Evidence |
|---|---|---|---|
| G03-COV-001 | Critical | OpenAPI/schema define a complete attendance and leave product, but runtime implements only a reduced in-memory proof slice. | Broad OpenAPI tags `docs/contracts/openapi/G03.yaml:56`-`104`; runtime routes `apps/api/src/routes/g03.routes.ts:17`-`194`; service `apps/api/src/modules/g03/leaveService.ts:83`-`503` |
| G03-COV-002 | Critical | Attendance core is incomplete: no shifts/rosters/holidays/punch ingestion/daily rollup, so leave/payroll behavior is not grounded in real attendance facts. | BRD FR-01..FR-04 `docs/brd/v3/G03-attendance-and-leave-management.md:1075`-`1145`; missing from route file `apps/api/src/routes/g03.routes.ts:17`-`194` |
| G03-COV-003 | High | Public-sector leave policy features are absent: comp-off, leave configuration, policy accrual, year close, encashment, entitlement counters, forecast/mass leave/blackout/return-to-work. | BRD FR-09..FR-11 and FR-15..FR-16 and FR-22..FR-23 `docs/brd/v3/G03-attendance-and-leave-management.md:1193`-`1228`, `docs/brd/v3/G03-attendance-and-leave-management.md:1267`-`1279`, `docs/brd/v3/G03-attendance-and-leave-management.md:1322`-`1333` |
| G03-COV-004 | High | Privacy/fraud controls for biometric/geo attendance are absent. | BRD FR-20/FR-21 `docs/brd/v3/G03-attendance-and-leave-management.md:1306`, `docs/brd/v3/G03-attendance-and-leave-management.md:1314`; schema exists `docs/data-model/03-G03-attendance-leave.sql:331`, `docs/data-model/03-G03-attendance-leave.sql:187` |
| G03-COV-005 | High | UI is not a usable G03 workspace. | BRD UI `docs/brd/v3/G03-attendance-and-leave-management.md:1338`; UI file `apps/web/src/modules/g03/LeaveWorkspace.tsx:9`-`49` |

## Scorecard

| Category | Score | Notes |
|---|---:|---|
| BRD line-item implementation | 8 / 23 FRs materially touched | FR-03, 05, 06, 11, 12, 13, 17, 18, 19, 20 are partial; most policy/admin/privacy surfaces are gaps |
| API contract conformance | Low to medium | Implemented route surface is much smaller than OpenAPI |
| Data model coverage | High as design artefact | SQL covers most entities; runtime does not use the schema |
| Backend behavior | Medium for proof slice | Leave approval and attendance/payroll signal slices work |
| Frontend behavior | Low | Static proof card only |
| Automated tests | Medium for proof slice, low for full BRD | Tests cover core proof slices only |

Overall status: **Not release-complete for G03.** The current implementation is a valuable vertical slice, not the full attendance and leave module.

## Recommended Remediation Path

1. Keep the existing leave approval/G04 payroll-signal tests as regression baseline.
2. Build attendance foundations next: shifts, rosters, holidays, punch ingestion, daily processing.
3. Expand leave policy runtime: leave types, policies, accrual engine, ledger read/adjustment, comp-off.
4. Add compliance controls: biometric/geo consent, anomaly review, delegation records.
5. Add payroll feed locking/ack/adjustments before encashment/year close.
6. Replace the proof-card UI with Me/My Team/Admin workflows and behavioral tests.

