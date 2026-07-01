# G03 — Attendance and Leave Management — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | **G03 — Attendance and Leave Management** (alias GOV-M03; EXTEND/REUSE of PrimeSoft M04 Leave + M05 Attendance) |
| Scope | FR-01…FR-23 acceptance criteria, business rules, edge cases, state tables, and the platform API/error/state/auth contracts. Covers shifts/rosters, holidays/RH, punch ingest, daily attendance + sub-day allocation, regularisation, overtime, WFH/OD, comp-off, leave configuration, accrual + ledger + optimistic-lock concurrency, leave apply/approve/cancel, backdate, year-close, encashment, payroll (LWP) feed, self-service/notifications, delegation, anomaly review, DPDP consent, sanction entitlements, forecast/mass-leave/blackout/RTW, and the G03→G04 SR-lineage handoff. |
| Grounding | `docs/brd/v3/G03-attendance-and-leave-management.md` (FRs §6, integrity rules §5.6, worked example §5.8, state tables §10, error mapping §8.4, VAL-G03 §8.6, jobs §8.7); `docs/contracts/openapi/G03.yaml`; `docs/contracts/error-taxonomy.yaml` (ERR-G03-* + bare domain reasons → 8 platform HTTP codes); `docs/contracts/state-machines.yaml` (G03 leave_application, regularisation, overtime, punch_anomaly_review, consent_record, year_close_run); `docs/contracts/auth-matrix.yaml` (G03 actions/roles). |
| Traceability | Each test case declares `Traces-to` (FR + AC, integrity rule, state transition, or contract clause). Full FR→TC matrix in §3; 0 gaps. |

### 1.1 Test environment & data assumptions

- **Base/API:** all routes under `/api/v1/atl/*`; Bearer JWT carrying resolved roles + `tenant_id`/`entity_id` scope (P02 `Authorization.check`); `Idempotency-Key` on every workflow-initiating POST (24h replay → original result); cursor pagination (`limit` default 25 / max 100, `cursor`→`next_cursor`); `X-Correlation-Id` echoed on every response and never carried as a body field.
- **Error contract:** 2xx returns the resource payload; every 4xx/5xx returns `{ "error": { "code", "message", "field", "details": {} } }` and nothing else. Negative assertions specify the exact wire status + `error.code`/`details.reason` per the taxonomy.
- **Multi-tenancy:** two tenants seeded — **T1** (entity **E1**) and **T2** (entity **E2**). Every G03 table row carries `tenant_id`/`entity_id`; unscoped or cross-tenant reads must be rejected (404), not defaulted.
- **Personas (T1/E1 unless stated):** `EMP-1001` (employee, self-service); `EMP-1002`, `EMP-1003` (employees / peers for concurrency); `MGR-2001` (L1 reporting manager of EMP-1001/1002); `MGR-2002` (delegate manager); `LADM` (leave_admin); `AADM` (attendance_admin); `HRADM` (hr_admin); `SANCT` (sanctioning_authority); `PAYO` (payroll_admin); `AUD` (auditor / Org-Admin read); `DPO` (dpo, `dpo_governance` flag); `REV` (anomaly reviewer, `anomaly_reviewer` flag). `EMP-T2` is an employee in T2/E2.
- **Leave catalog seeded (per §5.7):** `EL` (accruable, debit_ratio 1.0, year_basis CALENDAR, CF cap 300, is_encashable, is_encashable_on_retirement); `HPL` (half-pay, debit_ratio 1.0, no-lapse, retirement make-up); `COMMUTED` (debit_ratio 2.0, `debits_against_leave_type_id`=HPL); `CL` (accruable, lapse-fully, sandwich EXCLUDE); `MAT` (sanction, EVENT quota 180, gender FEMALE, ≤2 surviving children); `CCL` (sanction, CAREER quota 730, FEMALE); `PAT` (gender MALE, 15); `STUDY`/`SAB`/`LWP` (special/sanction); `COMPOFF` (redemption vehicle only — no `leave_balances` row).
- **Policies/config seeded:** accrual policies (EL monthly 2.5, HPL, CL) with `rounding_mode=NEAREST_HALF_CARRY`, `proration_method=DAYS_IN_SERVICE_OVER_CYCLE`, `suspend_accrual_on_lwp=true`; `module_config` — `REGULARISATION_WINDOW_DAYS=15`, `REGULARISATION_LIMIT=3/mo`, `BACKDATE_WINDOW_DAYS=30`, `COMPOFF_VALIDITY_DAYS=90`, `RH_CAP=2`, `RESERVATION_TTL_MIN=1440`, `CLOCK_SKEW_MIN=5`, `CONFLICT_THRESHOLD_PCT=40`, a `BLACKOUT_PERIOD` window on 2026-03-25..2026-03-31 for EL/CL.
- **Balances (2026, EMP-1001):** EL current 130.0 / reserved 0 / available 130.0 / version 7; HPL current 8.0; CCL entitlement CAREER 730 consumed 120 (remaining 610).
- **Devices/consent:** biometric device `DEV-BIO-1` (P04-registered, `EMPLOYEE_BOUND`, geofence set); RFID `DEV-RF-1`; EMP-1001 `biometric_consents` STATUTORY_DUTY GRANTED, fallback RFID.
- **Downstream doubles:** G04 SR consumer, G10 payroll, G11 pension, G13 documents, P01 workflow, P02 authz, P05 audit, X.2 notifications are available as verifiable test doubles/stubs; the G04 event bus is asserted for the SR-lineage E2E, and a network spy asserts `POST /api/v1/sr/ingest` is **never** called by G03.

---

## 2. Test Cases

### FR-01 — Shift & Roster Management

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-001 | FR-01 AC1 | Functional | Create a valid shift definition |
| TC-G03-002 | FR-01 / VAL-G03-SHIFT-TIMES | Boundary | Reject shift with inverted times / threshold nonsense |
| TC-G03-003 | FR-01 AC3 | State-Transition (invalid) | Reject overlapping PUBLISHED roster |
| TC-G03-004 | FR-01 AC4 | State-Transition | Publishing supersedes prior open-ended roster |
| TC-G03-005 | FR-01 AC6 / R6 | Data-Integrity | Roster edit in locked period emits feed adjustment, not overwrite |
| TC-G03-006 | FR-01 / auth-matrix | Authorization | Employee cannot create a shift |

**TC-G03-001 — Create a valid shift definition** · Priority: P2
- Preconditions: `AADM` authenticated (T1/E1).
- Test data: `POST /atl/shifts` `{shift_code:"GEN", start_time:"09:30", end_time:"17:30", grace_minutes:10, half_day_threshold_minutes:240, full_day_threshold_minutes:450, date_anchor_rule:"SHIFT_START_LOCAL_DATE", org_unit_scope_id:<E1-ou>, status:"ACTIVE"}`, `Idempotency-Key: <uuid>`.
- Steps: Send request.
- Expected: `201`; body echoes `shift_id`, `status=ACTIVE`; `X-Correlation-Id` header present; P05 audit row written.

**TC-G03-002 — Reject inverted/insane shift times** · Priority: P3
- Test data: shift with `start_time:"18:00", end_time:"09:00"`, `is_night_shift:false`; and variant with `half_day_threshold_minutes > full_day_threshold_minutes`.
- Steps: POST each.
- Expected: `422 VALIDATION_FAILED`, `error.code` resolves `VAL-G03-SHIFT-TIMES`, `field` names the offending time/threshold.

**TC-G03-003 — Reject overlapping PUBLISHED roster** · Priority: P1
- Preconditions: EMP-1001 has a PUBLISHED roster GEN 2026-01-01..open.
- Test data: `POST /atl/rosters` for EMP-1001, shift NIGHT-A, `effective_from:"2026-02-01"`, no end (overlaps).
- Steps: POST.
- Expected: `409 CONFLICT`, `error.code=ROSTER_OVERLAP` (copy `VAL-G03-ROSTER-OVERLAP`); no roster row created.

**TC-G03-004 — Publish supersedes prior open roster** · Priority: P2
- Preconditions: EMP-1001 PUBLISHED roster GEN open-ended.
- Test data: new roster GEN2 `effective_from:"2026-06-01"` published (adjacent, non-overlapping via supersede).
- Steps: Publish; GET `/atl/rosters?employeeId=EMP-1001`.
- Expected: prior roster `status=SUPERSEDED` with `effective_to=2026-05-31`; new roster PUBLISHED from 2026-06-01 (`VAL-EFFECTIVE`).

**TC-G03-005 — Roster edit in locked period → feed adjustment** · Priority: P1
- Preconditions: pay period 2026-05 EXPORTED/`is_locked=true`; EMP-1001 rostered in May.
- Test data: roster change affecting a May day.
- Steps: Apply the roster edit.
- Expected: `200` with `LOCKED_PERIOD_ADJUSTMENT_EMITTED`; the fed May day is NOT overwritten; a `payroll_feed_adjustments` row (`source_ref_type=ROSTER_EDIT`) is created for the next open period (R6).

**TC-G03-006 — Employee cannot create a shift** · Priority: P2
- Test data: `EMP-1001` token → `POST /atl/shifts`.
- Expected: `403 FORBIDDEN` (`ERR-FORBIDDEN`); no shift created; existence of admin config not leaked.

### FR-02 — Holiday Calendar & RH Elections

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-007 | FR-02 AC1/AC3 | Functional | Create calendar, add holiday, publish |
| TC-G03-008 | FR-02 AC2 / VAL-G03-HOLIDAY-DUP | Negative | Duplicate holiday date rejected |
| TC-G03-009 | FR-02 AC4 / VAL-G03-RHCAP | Boundary | RH election at cap boundary and over-cap |
| TC-G03-010 | FR-02 AC6 / R6 | Data-Integrity | Holiday edit in locked period emits feed adjustment |

**TC-G03-007 — Create & publish calendar with holiday** · Priority: P2
- Test data: `POST /atl/holiday-calendars` `{calendar_code:"HQ-2026", year:2026, location_scope_id:<E1-ou>, rh_cap:2}`; then `POST /atl/holiday-calendars/{id}/holidays` `{holiday_date:"2026-01-26", name:"Republic Day", holiday_type:"GAZETTED"}`.
- Expected: both `201`; published calendar becomes the attendance/leave basis in scope.

**TC-G03-008 — Duplicate holiday date rejected** · Priority: P2
- Preconditions: 2026-01-26 already exists in HQ-2026.
- Steps: add 2026-01-26 again.
- Expected: `409 CONFLICT`, `error.code` copy `VAL-G03-HOLIDAY-DUP` (bare reason `HOLIDAY_DUPLICATE`); `field=holiday_date`.

**TC-G03-009 — RH election cap boundary** · Priority: P2
- Preconditions: HQ-2026 has 3 RESTRICTED holidays; `rh_cap=2`; EMP-1001 has 0 elections.
- Steps: elect RH#1 (201), RH#2 (201, remaining badge 0), RH#3 (over cap).
- Expected: 1st/2nd `201`; 3rd `409 CONFLICT`, `error.code=RH_CAP_EXCEEDED` (`VAL-G03-RHCAP`). Electing a non-RESTRICTED holiday → `422`.

**TC-G03-010 — Holiday edit locked period → adjustment** · Priority: P2
- Preconditions: pay period 2026-05 locked; a May holiday exists.
- Steps: edit/remove the May holiday.
- Expected: `200 LOCKED_PERIOD_ADJUSTMENT_EMITTED`; `payroll_feed_adjustments` (`source_ref_type=HOLIDAY_EDIT`) in next open period; fed day unchanged.

### FR-03 — Punch Ingestion

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-011 | FR-03 / OpenAPI ingest | API-Contract | Idempotent device-batch ingest returns per-punch outcomes |
| TC-G03-012 | FR-03 AC1 / R5 | Data-Integrity | Duplicate (device_id, source_ref) → DUPLICATE, not re-stored |
| TC-G03-013 | FR-03 AC2 | Negative | Punch outside geofence rejected |
| TC-G03-014 | FR-03 AC3 | Authorization | Unknown/inactive device rejected |
| TC-G03-015 | FR-03 AC4 | Boundary | Future-dated punch rejected |
| TC-G03-016 | FR-03 AC5 | Data-Integrity | Accepted punches append-only/immutable |
| TC-G03-017 | FR-03 AC6 / R16 | Functional | attendance_date derived from shift date-anchor (night shift) |
| TC-G03-018 | FR-03 AC7 / R9 | Negative | Biometric punch without consent → fallback / CONSENT_REQUIRED |
| TC-G03-019 | FR-03 AC8 / R10 | State-Transition | Anomaly punch flagged for review |
| TC-G03-020 | FR-03 BR | Boundary | Clock skew inside/outside CLOCK_SKEW_MIN |
| TC-G03-021 | FR-03 BR | Authorization | EMPLOYEE_BOUND device rejects other employee |

**TC-G03-011 — Idempotent batch ingest** · Priority: P1
- Test data: `POST /atl/punches/ingest` device batch of 3 punches with distinct `source_ref`, `Idempotency-Key: K1`.
- Steps: send once; resend identical batch with same `K1`.
- Expected: first `200` with `PunchBatchResult` listing per-punch `ACCEPTED`; replay returns the **same** result body (24h idempotent replay), no duplicate rows.

**TC-G03-012 — Duplicate source_ref → DUPLICATE** · Priority: P1
- Preconditions: `(DEV-RF-1, SR-900)` already ACCEPTED.
- Steps: ingest a punch with `(DEV-RF-1, SR-900)` again (new Idempotency-Key).
- Expected: `200`; that punch `ingestion_status=DUPLICATE`; UNIQUE(`device_id`,`source_ref`) holds; no new row.

**TC-G03-013 — Geofence violation** · Priority: P1
- Test data: `POST /atl/punches/mobile` for EMP-1001 with coordinates outside `DEV-BIO-1` geofence.
- Expected: `422 VALIDATION_FAILED`, `error.code=GEOFENCE_VIOLATION`; punch `REJECTED`.

**TC-G03-014 — Unknown/inactive device** · Priority: P1
- Test data: batch from `device_code` not registered in P04 (or `status=DECOMMISSIONED`).
- Expected: `403 FORBIDDEN`, `error.code=DEVICE_NOT_AUTHORIZED`.

**TC-G03-015 — Future-dated punch** · Priority: P2
- Test data: punch `punch_time` = now + 2h.
- Expected: `422 VALIDATION_FAILED`, `error.code=INVALID_PUNCH_TIME`.

**TC-G03-016 — Append-only immutability** · Priority: P1
- Steps: ingest a punch (ACCEPTED); attempt any UPDATE/DELETE of `attendance_punches` via API/data path.
- Expected: no mutation path exists; corrections happen via new punches/regularisation only; row unchanged; P05 trigger fired on the original INSERT.

**TC-G03-017 — Night-shift date anchor** · Priority: P2
- Preconditions: EMP-1002 on NIGHT-A (22:00–06:00, `date_anchor_rule=SHIFT_START_LOCAL_DATE`).
- Test data: IN punch 2026-02-10 22:05, OUT 2026-02-11 06:10 (IST).
- Expected: both punches carry `attendance_date=2026-02-10` (shift start local date), per App. B.

**TC-G03-018 — Biometric punch without consent** · Priority: P1
- Preconditions: EMP-1003 consent `WITHDRAWN`; fallback RFID configured.
- Steps: (a) biometric punch on DEV-BIO-1; (b) same employee with no fallback configured.
- Expected: (a) capture engages `fallback_method` (RFID) and succeeds; (b) `403 FORBIDDEN`, `error.code=CONSENT_REQUIRED` (`ERR-G03-CONSENT`), fallback offered (`VAL-CONSENT`, R9).

**TC-G03-019 — Anomaly punch flagged** · Priority: P1
- Test data: mobile geo punch that triggers `IMPOSSIBLE_TRAVEL` (two punches, distant coords, minutes apart).
- Expected: `202`; punch `ingestion_status=FLAGGED_FOR_REVIEW`; a `punch_anomaly_reviews` case OPEN (R10, FR-20); punch excluded pending review.

**TC-G03-020 — Clock skew boundary** · Priority: P3
- Test data: device timestamp off by +4 min (inside ±5) and +8 min (outside).
- Expected: +4 accepted/normalised; +8 flagged/rejected per `CLOCK_SKEW_MIN`.

**TC-G03-021 — EMPLOYEE_BOUND device rejects other employee** · Priority: P2
- Preconditions: DEV-BIO-1 `binding_mode=EMPLOYEE_BOUND` to EMP-1001.
- Steps: punch by EMP-1002 on DEV-BIO-1.
- Expected: rejected/flagged as `DEVICE_BINDING_MISMATCH`; not counted as EMP-1002 present.

### FR-04 — Daily Attendance Processing & Sub-Day Allocation

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-022 | FR-04 AC1 | Functional | Leave/holiday/weekly-off status derivation |
| TC-G03-023 | FR-04 AC2 | Boundary | PRESENT / HALF_DAY / ABSENT worked-minute thresholds |
| TC-G03-024 | FR-04 AC3 | Negative | In-only / out-only → MISSING_PUNCH |
| TC-G03-025 | FR-04 AC4 | Functional | WFH/OD status regardless of punches |
| TC-G03-026 | FR-04 AC6 / R2 / VAL-G03-ALLOC | Data-Integrity | Half-day leave + worked afternoon → 2 allocations, present_units=1.0 |
| TC-G03-027 | FR-04 BR / VAL-G03-ALLOC | Data-Integrity | Σ day_fraction > 1.0 rejected |
| TC-G03-028 | FR-04 AC5 | State-Transition | Re-run idempotent; non-regularised rows only |
| TC-G03-029 | FR-04 BR | Functional | Status precedence Leave>Holiday>Weekly-off>WFH/OD>punch |
| TC-G03-030 | FR-04 AC7 / R15 | Data-Integrity | FR-04 is sole writer; upstream FRs enqueue recompute |

**TC-G03-022 — Leave/holiday/weekly-off derivation** · Priority: P1
- Preconditions: EMP-1001 has APPROVED EL on 2026-02-12; 2026-01-26 gazetted holiday; Sunday weekly-off.
- Steps: `POST /atl/attendance/process` for the range; GET `/atl/attendance/daily`.
- Expected: 02-12 `ON_LEAVE`; 01-26 `HOLIDAY`; Sunday `WEEKLY_OFF`.

**TC-G03-023 — Worked-minute thresholds** · Priority: P1
- Test data: three days with worked minutes = 455 (≥ full 450), 300 (half≤x<full), 120 (< half). Shift GEN thresholds 240/450.
- Expected: `PRESENT`, `HALF_DAY`, `ABSENT` respectively; boundary at exactly 450 → PRESENT, exactly 240 → HALF_DAY.

**TC-G03-024 — Missing punch** · Priority: P2
- Test data: day with only an IN punch (no OUT).
- Expected: status `MISSING_PUNCH`.

**TC-G03-025 — WFH/OD overrides punch state** · Priority: P2
- Preconditions: approved WFH on a day with no punches.
- Expected: allocation `WFH` (counts_as_present=true) regardless of absent punches.

**TC-G03-026 — Split-day allocation** · Priority: P1
- Preconditions: EMP-1001 APPROVED 0.5 EL FIRST_HALF on 2026-07-10; worked afternoon punches present.
- Steps: process 2026-07-10.
- Expected: two `attendance_day_allocations` — `ON_LEAVE×0.5 (present)` + `PRESENT×0.5`; Σ day_fraction = 1.0; `attendance_daily.present_units=1.0` (R2, §5.8).

**TC-G03-027 — Allocation overflow rejected** · Priority: P1
- Test data: a forced input producing allocations summing to 1.5 for one employee/day.
- Expected: `422 VALIDATION_FAILED`, `error.code=ALLOCATION_EXCEEDS_DAY` (`VAL-G03-ALLOC`); day not written.

**TC-G03-028 — Idempotent re-run, regularised protected** · Priority: P1
- Preconditions: 2026-02-11 already `is_regularised=true`; other days not.
- Steps: re-run processing for the period (same X.1 per-period run key).
- Expected: non-regularised rows recomputed; 2026-02-11 NOT overwritten; run recorded in `attendance_processing_runs`; re-run idempotent (no duplicate day rows).

**TC-G03-029 — Status precedence** · Priority: P2
- Test data: a day that is simultaneously a holiday and has an approved leave and punches.
- Expected: precedence resolves to `ON_LEAVE` (Leave > Holiday > Weekly-off > WFH/OD > punch), per App. B.

**TC-G03-030 — Sole-writer invariant** · Priority: P1
- Steps: approve a regularisation (FR-05) and a leave (FR-12); inspect writers of `attendance_daily`.
- Expected: neither FR writes `attendance_daily` directly; both enqueue an `attendance_processing_runs` recompute (`trigger_type=RECOMPUTE_ENQUEUED`) that FR-04 applies (R15).

### FR-05 — Missed-Punch Regularisation

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-031 | FR-05 AC1 | Functional | Raise regularisation within window |
| TC-G03-032 | FR-05 AC1 | Boundary | Beyond REGULARISATION_WINDOW_DAYS rejected |
| TC-G03-033 | FR-05 AC2 / R15 | State-Transition | Approve → recompute with is_regularised=true |
| TC-G03-034 | FR-05 AC3 | State-Transition | Reject leaves attendance unchanged |
| TC-G03-035 | FR-05 AC4 | Negative | Monthly cap exceeded |
| TC-G03-036 | FR-05 AC6 / R6 | Data-Integrity | Locked period → feed adjustment |
| TC-G03-037 | FR-05 BR / SoD | Authorization | Self-approval blocked |

**TC-G03-031 — Raise within window** · Priority: P2
- Preconditions: EMP-1001 has a `MISSING_PUNCH` day 5 days ago.
- Test data: `POST /atl/regularisations` `{attendance_daily_id, requested_status:"PRESENT", proposed_first_in, proposed_last_out, reason}`.
- Expected: `201`, status `SUBMITTED`; routed to `MGR-2001` via P01; X.2 notify.

**TC-G03-032 — Beyond window** · Priority: P2
- Test data: regularisation for a day 20 days ago (`REGULARISATION_WINDOW_DAYS=15`).
- Expected: `422 VALIDATION_FAILED`, `error.code=WINDOW_EXPIRED`.

**TC-G03-033 — Approve → recompute** · Priority: P1
- Steps: `POST /atl/regularisations/{id}/decision {decision:"APPROVE"}` as MGR-2001.
- Expected: `200`, status `APPROVED`; recompute enqueued setting `is_regularised=true`; day not written directly (R15); P05 before/after captured.

**TC-G03-034 — Reject unchanged** · Priority: P2
- Steps: MGR-2001 rejects.
- Expected: `200`, status `REJECTED`; attendance status unchanged; reason logged (P05).

**TC-G03-035 — Monthly cap** · Priority: P3
- Preconditions: EMP-1001 already has 3 regularisations this month (`REGULARISATION_LIMIT=3`).
- Steps: raise a 4th.
- Expected: `409 CONFLICT`, `error.code=REGULARISATION_LIMIT`.

**TC-G03-036 — Locked-period regularisation** · Priority: P1
- Preconditions: the corrected day is in a locked pay period.
- Steps: approve the regularisation.
- Expected: `payroll_feed_adjustments` (`source_ref_type=REGULARISATION`) emitted for next open period; locked feed not overwritten (R6).

**TC-G03-037 — Self-approval blocked** · Priority: P1
- Steps: EMP-1001 attempts to approve own regularisation.
- Expected: `403 FORBIDDEN` (P02 SoD, approver ≠ submitter).

### FR-06 — Overtime

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-038 | FR-06 AC1 | Functional | OT claim supported by punches |
| TC-G03-039 | FR-06 AC1 | Negative | OT not supported by punches |
| TC-G03-040 | FR-06 AC2 | State-Transition | Approve PAID → feed paid_ot_minutes |
| TC-G03-041 | FR-06 AC3 / R17 | State-Transition | Approve COMP_OFF → comp_off_ledger EARN |
| TC-G03-042 | FR-06 AC5 | Negative | Duplicate-date / cap |

**TC-G03-038 — Valid OT claim** · Priority: P2
- Preconditions: EMP-1001 worked 120 min beyond shift end + grace (punch-backed).
- Test data: `POST /atl/overtime {attendance_date, ot_minutes:120, ot_treatment:"PAID"}`.
- Expected: `201`, status `SUBMITTED`.

**TC-G03-039 — OT unsupported by punches** · Priority: P2
- Test data: OT claim for a day with no excess worked minutes.
- Expected: `422 VALIDATION_FAILED`, `error.code=OT_NOT_SUPPORTED_BY_PUNCHES`.

**TC-G03-040 — Approve PAID** · Priority: P2
- Steps: MGR-2001 `POST /atl/overtime/{id}/decision {decision:"APPROVE", ot_treatment:"PAID"}`.
- Expected: `200`, state `APPROVED_PAID`; `paid_ot_minutes` flows to `payroll_attendance_feed`.

**TC-G03-041 — Approve COMP_OFF** · Priority: P1
- Steps: approve with `ot_treatment:"COMP_OFF"`.
- Expected: `200`, state `CONVERTED_TO_COMPOFF`; a `comp_off_ledger` `EARN` entry with `expires_on` (SSOT, R17); no `leave_balances` row created.

**TC-G03-042 — Duplicate-date / cap** · Priority: P3
- Steps: submit a second OT for the same date / exceed monthly cap.
- Expected: `409 CONFLICT`, `error.code=OT_CAP_EXCEEDED` (or duplicate `ERR-DUP-INSTANCE`).

### FR-07 — Work-From-Home

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-043 | FR-07 AC1/AC5 | State-Transition | Approved WFH → present allocation via recompute |
| TC-G03-044 | FR-07 AC2 | Negative | WFH overlapping leave/holiday |
| TC-G03-045 | FR-07 AC3 | Negative | WFH monthly cap exceeded |

**TC-G03-043 — Approved WFH present** · Priority: P2
- Steps: EMP-1001 `POST /atl/exceptions {exception_type:"WFH", start_date, end_date}`; MGR-2001 approves; process attendance.
- Expected: exception `APPROVED`; FR-04 recompute yields `WFH` allocation (present); no direct write (R15).

**TC-G03-044 — WFH overlap** · Priority: P2
- Preconditions: EMP-1001 has approved leave overlapping requested WFH dates.
- Expected: `409 CONFLICT`, `error.code=EXCEPTION_OVERLAP`.

**TC-G03-045 — WFH cap** · Priority: P3
- Expected: `409 CONFLICT`, `error.code=WFH_CAP_EXCEEDED` when configured cap exceeded.

### FR-08 — On-Duty / Tour

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-046 | FR-08 AC1 | State-Transition | Approved OD/Tour → ON_DUTY present |
| TC-G03-047 | FR-08 AC2 / VAL-FILE | Negative | Tour without required order document |
| TC-G03-048 | FR-08 AC3 | Negative | OD overlapping leave |

**TC-G03-046 — Approved OD present** · Priority: P2
- Steps: apply `ON_DUTY`/`TOUR` with `location_text`, order doc (G13); approve; process.
- Expected: `ON_DUTY` allocation (present) after recompute.

**TC-G03-047 — Tour requires document** · Priority: P3
- Test data: TOUR exception without `supporting_document_id` where policy requires it.
- Expected: `422 VALIDATION_FAILED`, `error.code=DOCUMENT_REQUIRED`.

**TC-G03-048 — OD overlap leave** · Priority: P3
- Expected: `409 CONFLICT`, `error.code=EXCEPTION_OVERLAP`.

### FR-09 — Compensatory-Off

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-049 | FR-09 AC1 | Functional | Comp-off EARN credits ledger with expiry |
| TC-G03-050 | FR-09 AC2 | Functional | Redemption is FIFO from non-expired credits |
| TC-G03-051 | FR-09 AC3 | Negative | Redeem over balance |
| TC-G03-052 | FR-09 AC4 | Negative | Redeem expired credit |
| TC-G03-053 | FR-09 AC5/R17 | Data-Integrity | Ledger is sole comp-off source; reconciles to balance_after |

**TC-G03-049 — EARN with expiry** · Priority: P2
- Steps: approve OT as COMP_OFF; GET `/atl/comp-off/balance?employeeId=EMP-1001`.
- Expected: `comp_off_ledger` EARN entry, `expires_on = earned_on + 90d`; balance reflects it.

**TC-G03-050 — FIFO redemption** · Priority: P2
- Preconditions: two EARN lots (older expiring sooner).
- Steps: `POST /atl/comp-off/redeem {days:1}`.
- Expected: `201`; consumes the older lot first (FIFO); running `balance_after` decremented.

**TC-G03-051 — Over-balance redeem** · Priority: P2
- Test data: redeem more than available.
- Expected: `409 CONFLICT`, `error.code=COMP_OFF_INSUFFICIENT`.

**TC-G03-052 — Expired credit redeem** · Priority: P2
- Test data: redeem against a lot past `expires_on`.
- Expected: `422 VALIDATION_FAILED`, `error.code=COMP_OFF_EXPIRED`.

**TC-G03-053 — Comp-off SSOT reconciliation** · Priority: P2
- Steps: sum signed `days` across all `comp_off_ledger` entries for EMP-1001.
- Expected: equals the latest `balance_after` and the balance API value; no comp-off state exists in `leave_balances` (R17).

### FR-10 — Leave-Type & Accrual-Policy Configuration

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-054 | FR-10 AC1/AC2 | Functional | Create leave type + versioned accrual policy |
| TC-G03-055 | FR-10 AC3 | Negative | Overlapping ACTIVE policy rejected |
| TC-G03-056 | FR-10 AC6 / VAL-G03-COMMUTED | Negative | debit_ratio>1 without debits_against rejected at config |
| TC-G03-057 | FR-10 AC5 | State-Transition | Policy versioning is non-destructive |
| TC-G03-058 | FR-10 LLD | Negative | Deactivate a leave type in use |
| TC-G03-059 | FR-10 / auth-matrix | Authorization | Employee cannot configure leave types |

**TC-G03-054 — Create type + policy** · Priority: P2
- Test data: `POST /atl/leave-types {leave_code:"EL",...}`; `POST /atl/leave-policies {leaveTypeId, accrual_frequency:"MONTHLY", accrual_quantity:2.5, rounding_mode:"NEAREST_HALF_CARRY", carry_forward_cap:300}`.
- Expected: both `201`.

**TC-G03-055 — Policy overlap** · Priority: P2
- Test data: second ACTIVE EL policy with overlapping `effective_from/to`.
- Expected: `409 CONFLICT`, `error.code=POLICY_OVERLAP`.

**TC-G03-056 — Commuted config guard** · Priority: P1
- Test data: create COMMUTED type with `debit_ratio:2.0` and null `debits_against_leave_type_id`.
- Expected: `422 VALIDATION_FAILED`, `error.code=COMMUTED_REQUIRES_HPL` (`ERR-G03-COMMUTED-HPL`, `VAL-G03-COMMUTED`).

**TC-G03-057 — Non-destructive versioning** · Priority: P3
- Steps: supersede EL policy with a new `effective_from`.
- Expected: prior policy `SUPERSEDED` (retained), new `ACTIVE`; historical accrual runs still resolve the prior version.

**TC-G03-058 — Type in use** · Priority: P3
- Steps: deactivate EL while balances/applications reference it.
- Expected: `409 CONFLICT`, `error.code=TYPE_IN_USE`.

**TC-G03-059 — Config authorization** · Priority: P2
- Steps: EMP-1001 → `POST /atl/leave-types`.
- Expected: `403 FORBIDDEN`.

### FR-11 — Accrual Engine, Rounding/Proration & Ledger (concurrency)

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-060 | FR-11 AC1 | Boundary | Accrual credits correct quantity + updates balance |
| TC-G03-061 | FR-11 AC4 / R3 | Boundary | Mid-year join proration + rounding with remainder carried |
| TC-G03-062 | FR-11 AC2 | Data-Integrity | Every mutation writes exactly one ledger entry |
| TC-G03-063 | FR-11 AC3 / R-recon | Data-Integrity | current_balance == latest ledger balance_after |
| TC-G03-064 | FR-11 AC5 | Authorization | Manual adjustment requires P01 maker-checker + reason |
| TC-G03-065 | FR-11 AC6 / R1/R12 | Data-Integrity | Optimistic-lock: two concurrent debits, one conflicts |
| TC-G03-066 | FR-11 §5.6 r2 | Data-Integrity | Balance never driven negative (advance disallowed) |
| TC-G03-067 | FR-11 AC7 / R19 | State-Transition | Accrual suspended during LWP |
| TC-G03-068 | FR-11 AC7 / R19 | Data-Integrity | Exit before earned advance → CLAWBACK entry |
| TC-G03-069 | FR-11 LLD | Negative | Accrual already run for period |
| TC-G03-070 | FR-11 LLD | Data-Integrity | Ledger recon mismatch surfaces as INTERNAL + alert |

**TC-G03-060 — Accrual quantity** · Priority: P1
- Preconditions: EMP-1001 EL 128.0; EL monthly policy 2.5.
- Steps: `POST /atl/accrual/run {period:"2026-03"}`.
- Expected: `202` queued; on completion EL `ACCRUAL +2.5`, `balance_after=130.5`; `leave_balances.current_balance=130.5`; X.2 accrual-credited notice.

**TC-G03-061 — Proration + rounding (boundary math)** · Priority: P1
- Preconditions: EMP-1004 joins mid-cycle (15 of 30 days served); monthly accrual 2.5; `proration_method=DAYS_IN_SERVICE_OVER_CYCLE`; `rounding_mode=NEAREST_HALF_CARRY`.
- Steps: run accrual for the join month.
- Expected: raw = 2.5 × 15/30 = 1.25 → rounded to nearest-half = 1.5 with the +0.25 carried remainder retained (never dropped); ledger shows credited 1.5 and carried remainder tracked; App. C consistency.

**TC-G03-062 — One ledger entry per mutation** · Priority: P1
- Steps: perform accrual, an avail (via approved leave), a manual adjustment.
- Expected: each action writes exactly one `leave_balance_ledger` row with a correct `balance_after`; no balance change exists without a ledger entry (§5.6 r1/r3).

**TC-G03-063 — Ledger conservation** · Priority: P1
- Steps: for EMP-1001 EL 2026, read latest ledger `balance_after` and `leave_balances.current_balance`; run `JOB-G03-LEDGER-RECON`.
- Expected: equal; recon reports 0 mismatch; sum of signed `amount` from OPENING onward equals `current_balance`.

**TC-G03-064 — Maker-checker adjustment** · Priority: P1
- Steps: `LADM` (maker) `POST /atl/leave-ledger/adjust {employeeId, leaveTypeId, amount:+2, reason}` → pending; `HRADM` (checker) approves via P01; then attempt with missing reason.
- Expected: maker `201` pending; checker approval applies the ADJUSTMENT ledger entry; maker == checker blocked (403 SoD); missing reason → `422 ERR-REASON-REQ`.

**TC-G03-065 — Optimistic-lock concurrency (two concurrent debits)** · Priority: P1
- Preconditions: EMP-1001 EL `version=7`, available small enough that both cannot both proceed against the raw row; two APPROVED-decision requests target the same balance concurrently, each `expectedVersion:7`.
- Steps: fire both `POST /atl/leave-applications/{id}/decision {decision:"APPROVE", expectedVersion:7}` in parallel.
- Expected: exactly one succeeds `200` (balance debited, `version→8`); the other → `409 CONFLICT`, `error.code=OPTIMISTIC_LOCK_CONFLICT`; no lost update; balance debit acquired `FOR UPDATE` + version assertion (R1/R12).

**TC-G03-066 — Balance never negative** · Priority: P1
- Preconditions: EL available 1.0, `advance_allowed=false`.
- Steps: approve a 2.0-day EL debit.
- Expected: debit refused before write — apply-time `409 INSUFFICIENT_BALANCE`; ledger `balance_after` never < 0 (§5.6 r2).

**TC-G03-067 — Accrual suspended on LWP** · Priority: P2
- Preconditions: EMP-1002 on LWP for the accrual cycle; `suspend_accrual_on_lwp=true`.
- Steps: run accrual.
- Expected: no ACCRUAL entry for the suspended cycle for EMP-1002 (R19).

**TC-G03-068 — Advance clawback on exit** · Priority: P2
- Preconditions: EMP-1005 took advance leave not yet earned; separates.
- Steps: trigger exit processing.
- Expected: a `CLAWBACK` ledger entry (or G10 feed-adjustment recovery) for the unearned units (R19).

**TC-G03-069 — Accrual already run** · Priority: P2
- Steps: run accrual twice for the same period/scope.
- Expected: second → `409 CONFLICT`, `error.code=ACCRUAL_ALREADY_RUN`; idempotent per-cycle key.

**TC-G03-070 — Recon mismatch alarms** · Priority: P2
- Preconditions: inject a balance/ledger divergence (test hook).
- Steps: run `JOB-G03-LEDGER-RECON`.
- Expected: `LEDGER_RECON_MISMATCH` reported as `500 INTERNAL` on any exposing path; ops alert via `MSG-SYS-JOBFAIL`; no silent correction.

### FR-12 — Leave Application & Approval (P01)

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-071 | FR-12 AC2 / R1 | Functional | Apply creates soft-reserve + balancePreview + lineage |
| TC-G03-072 | FR-12 AC1 / VAL-G03-DAYUNITS | Data-Integrity | SUM(day_units) must equal total_days |
| TC-G03-073 | FR-12 AC2 | Boundary | Insufficient available balance (net of reservation) |
| TC-G03-074 | FR-12 AC1 / R13 | Functional | Sandwich rule counts non-working days deterministically |
| TC-G03-075 | FR-12 AC3 | State-Transition | Submit→Approve single txn (reserve→debit→version++) |
| TC-G03-076 | FR-12 AC7 / R4 | Negative | Commuted 2:1 debit with insufficient HPL |
| TC-G03-077 | FR-12 AC8 / VAL-HOLD | Negative | Blackout window blocks application |
| TC-G03-078 | FR-12 AC5 / SoD | Authorization | Applicant equals approver blocked |
| TC-G03-079 | FR-12 BR | Negative | Overlapping leave dates |
| TC-G03-080 | FR-12 AC4 / VAL-DEPENDENT | Negative | Gender/eligibility failure |
| TC-G03-081 | FR-12 §10.1 | State-Transition | Reject releases reservation |
| TC-G03-082 | FR-12 §10.1 | State-Transition (invalid) | Decision on terminal-state application |
| TC-G03-083 | FR-12 / JOB-G03-RESERVATION-TTL | State-Transition | Reservation TTL auto-release |
| TC-G03-084 | FR-12 §8.1 | API-Contract | Idempotency-Key replay returns original result |
| TC-G03-085 | FR-12 AC2 | Concurrency | Two concurrent applications net reservation, no oversubscription |

**TC-G03-071 — Apply → reservation + preview + lineage** · Priority: P1
- Test data: `POST /atl/leave-applications {employeeId:EMP-1001, leaveTypeId:EL, start_date:"2026-07-10", end_date:"2026-07-10", days:[{leave_date, day_portion:"FIRST_HALF", day_units:0.5}], reason}`, `Idempotency-Key`.
- Expected: `201`; `leave_reservations` (0.5, RESERVED); `reserved→0.5`, `available→129.5`; `balancePreview {before:130.0, reserved:0.5, available:129.5, sandwichCountedDays}`; a non-null `leaveSpellLineageId` minted; correlation id in header (no body `requestId`).

**TC-G03-072 — Day-units equality** · Priority: P1
- Test data: application with `total_days=2` but day rows summing to 1.5.
- Expected: `422 VALIDATION_FAILED`, `error.code=DAY_UNITS_MISMATCH` (`VAL-G03-DAYUNITS`).

**TC-G03-073 — Insufficient balance** · Priority: P1
- Preconditions: EL available 1.5.
- Test data: apply 2.5 EL days.
- Expected: `409 CONFLICT`, `error.code=INSUFFICIENT_BALANCE` (`ERR-G03-INSUFF-BAL`), message references available-after-reservations; no reservation created.

**TC-G03-074 — Sandwich counting** · Priority: P1
- Test data: EL Fri–Mon with `sandwich_rule=INCLUDE_IF_SANDWICHED`; weekend enclosed.
- Expected: `total_days` includes the sandwiched Sat/Sun deterministically; preview shows `sandwichCountedDays`; `SUM(day_units)=total_days`. Repeat with EXCLUDE type → weekend not counted.

**TC-G03-075 — Approve single transaction** · Priority: P1
- Preconditions: EMP-1001 EL application SUBMITTED, `version=7`.
- Steps: `SANCT`/HR approves `{decision:"APPROVE", expectedVersion:7}`.
- Expected: `200 APPROVED`; single txn: reservation `CONSUMED` → ledger `AVAIL −0.5 (balance_after 129.5)` → `current_balance=129.5`, `reserved=0`, `version=8` → recompute enqueued → G04 SR enqueue (`sr_posting_status=PENDING`) → X.2 notify; P01 emits exactly one `workflow_actions` row (idempotent on retry).

**TC-G03-076 — Commuted requires HPL** · Priority: P1
- Preconditions: EMP-1001 HPL balance 1.0.
- Test data: apply COMMUTED 1 day (debits 2 × HPL).
- Expected: `422 VALIDATION_FAILED`, `error.code=COMMUTED_REQUIRES_HPL` (`ERR-G03-COMMUTED-HPL`); no debit; with HPL ≥ 2 the same application approves and posts `AVAIL −2` against HPL pot.

**TC-G03-077 — Blackout block** · Priority: P1
- Test data: apply EL within 2026-03-25..03-31 blackout.
- Expected: `409 CONFLICT`, `error.code=BLACKOUT_PERIOD` (`ERR-G03-BLACKOUT`, `VAL-HOLD`).

**TC-G03-078 — Self-approval SoD** · Priority: P1
- Preconditions: MGR-2001 is also an applicant on their own leave.
- Steps: MGR-2001 approves own application (or approves as their own delegate).
- Expected: `403 FORBIDDEN` (P02 SoD: approver ≠ applicant; delegate ≠ applicant).

**TC-G03-079 — Overlapping leave** · Priority: P2
- Preconditions: EMP-1001 already has APPROVED leave on target dates.
- Expected: `409 CONFLICT`, `error.code=LEAVE_OVERLAP`.

**TC-G03-080 — Eligibility failure** · Priority: P2
- Test data: male EMP applies MAT (gender FEMALE); female EMP applies PAT.
- Expected: `422 VALIDATION_FAILED`, `error.code=ELIGIBILITY_FAILED`.

**TC-G03-081 — Reject releases reservation** · Priority: P2
- Steps: approver rejects a SUBMITTED application.
- Expected: `200 REJECTED`; `leave_reservations` → `RELEASED`; `available` restored; X.2 notify.

**TC-G03-082 — Decision on terminal state** · Priority: P2
- Steps: attempt `APPROVE` on an already `APPROVED`/`WITHDRAWN`/`CANCELLED` application.
- Expected: `409 CONFLICT` (invalid transition; no second debit); idempotent replay returns original where key matches.

**TC-G03-083 — Reservation TTL auto-release** · Priority: P2
- Preconditions: SUBMITTED application undecided beyond `RESERVATION_TTL_MIN` (1440 min).
- Steps: run `JOB-G03-RESERVATION-TTL`.
- Expected: reservation auto-`RELEASED`; `reserved` reduced; application returns to DRAFT/expired (R1, §10.1).

**TC-G03-084 — Idempotent apply** · Priority: P2
- Steps: POST apply twice with same `Idempotency-Key` within 24h.
- Expected: second returns the original `201` result; exactly one application + one reservation.

**TC-G03-085 — Concurrent applications net reservation** · Priority: P1
- Preconditions: EMP-1001 EL available 2.0.
- Steps: EMP-1001 submits two 1.5-day EL applications concurrently.
- Expected: reservations net into `available` so the second sees `available=0.5` and is refused `409 INSUFFICIENT_BALANCE`; the balance can never be oversubscribed (R1); no negative balance.

### FR-13 — Leave Cancellation & Modification

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-086 | FR-13 AC1 | State-Transition | Withdraw SUBMITTED releases reservation |
| TC-G03-087 | FR-13 AC2/AC4 | State-Transition | Cancel APPROVED future → AVAIL_REVERSAL + G04 reversal |
| TC-G03-088 | FR-13 AC3 | Negative | Cannot cancel past/availed leave |
| TC-G03-089 | FR-13 BR | Data-Integrity | Commuted cancel credits HPL exact units |
| TC-G03-090 | FR-13 AC6 / R6 | Data-Integrity | Cancel in locked period emits feed adjustment |

**TC-G03-086 — Withdraw** · Priority: P2
- Steps: EMP-1001 `POST /atl/leave-applications/{id}/withdraw {reason}` on a SUBMITTED app.
- Expected: `200 WITHDRAWN`; reservation `RELEASED`; available restored.

**TC-G03-087 — Cancel approved future** · Priority: P1
- Preconditions: APPROVED future EL, lineage `L1`.
- Steps: `POST /atl/leave-applications/{id}/cancel {reason}`.
- Expected: `200 CANCELLED`; ledger `AVAIL_REVERSAL` for cancelled days; G04 `LEAVE_CANCELLED` event on the **same** `leave_spell_lineage_id=L1`; recompute enqueued; balance credited back.

**TC-G03-088 — Cannot cancel past** · Priority: P2
- Steps: cancel a leave whose dates are in the past/availed.
- Expected: `422 VALIDATION_FAILED`, `error.code=CANNOT_CANCEL_PAST`.

**TC-G03-089 — Commuted reversal to HPL** · Priority: P2
- Preconditions: APPROVED COMMUTED 1 day (debited 2 HPL).
- Steps: cancel the future commuted leave.
- Expected: `AVAIL_REVERSAL` credits exactly 2 units back to the **HPL** pot (correct `debits_against` pot).

**TC-G03-090 — Cancel in locked period** · Priority: P2
- Preconditions: cancelled day falls in a locked pay period.
- Expected: `payroll_feed_adjustments` (`source_ref_type=LEAVE_CANCEL`) for next open period.

### FR-14 — Backdated Leave & Team Calendar

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-091 | FR-14 AC1 | Functional | Backdated leave within window, elevated approval |
| TC-G03-092 | FR-14 AC4 | Boundary | Backdate beyond window rejected |
| TC-G03-093 | FR-14 AC2/AC3 | Functional | Team calendar + conflict-over-threshold advisory |
| TC-G03-094 | FR-14 BR / P02 | Authorization | Manager sees only own team scope |

**TC-G03-091 — Backdated within window** · Priority: P2
- Test data: EMP-1001 applies EL for a date 10 days ago (`BACKDATE_WINDOW_DAYS=30`) with justification.
- Expected: `201` with `is_backdated=true`; routed to elevated P01 approval; balance validated per `year_basis`.

**TC-G03-092 — Backdate beyond window** · Priority: P2
- Test data: backdated 45 days.
- Expected: `422 VALIDATION_FAILED`, `error.code=BACKDATE_WINDOW_EXCEEDED`.

**TC-G03-093 — Team calendar + conflict** · Priority: P3
- Preconditions: > 40% of MGR-2001's team on leave on a date (`CONFLICT_THRESHOLD_PCT=40`).
- Steps: `GET /atl/team-calendar?managerId=MGR-2001&month=2026-07`; `GET /atl/leave-applications/conflicts?orgUnitId=&range=`.
- Expected: calendar renders team absences; conflict endpoint returns the over-threshold day as advisory warning (recorded on `workflow_actions`, non-blocking).

**TC-G03-094 — Team scope isolation** · Priority: P2
- Steps: MGR-2001 requests team-calendar for a manager/org-unit outside their chain.
- Expected: `403`/`404` (P02 row-level scope; out-of-scope existence not leaked).

### FR-15 — Leave-Year Close (Carry-Forward / Lapse / Conversion)

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-095 | FR-15 AC1 | State-Transition | Simulate produces report, no writes |
| TC-G03-096 | FR-15 AC2/AC3/AC6 | Boundary | Commit: CF cap, lapse excess, conversion, opening (ordered) |
| TC-G03-097 | FR-15 AC5 | Negative | Re-commit closed year rejected |
| TC-G03-098 | FR-15 LLD | Negative | Pending leave blocks close |
| TC-G03-099 | FR-15 AC4 / recon | Data-Integrity | Post-close reconciliation 0 mismatch, version reset |

**TC-G03-095 — Year-close simulate** · Priority: P2
- Steps: `POST /atl/year-close/simulate {leaveYear:2026, scope}`.
- Expected: `200` `run_status=SIMULATED`; report of CF/lapse/conversion totals; **no** ledger writes.

**TC-G03-096 — Commit boundary math** · Priority: P1
- Preconditions: EMP-1001 EL current 320, CF cap 300, `lapse_rule=LAPSE_EXCESS`; a CONVERT_TO_HPL type; HPL no-lapse.
- Steps: `POST /atl/year-close/commit {leaveYear:2026}`.
- Expected: `202`; per-employee atomic ledger entries in pinned order — encashment-before-lapse → `CARRY_FORWARD` (capped 300) → `LAPSE` (20 excess) → `HPL_CONVERSION` where configured → `OPENING` for 2027; 2027 `leave_balances` opening 300 with `version` reset to 0; CL lapses fully.

**TC-G03-097 — Re-commit rejected** · Priority: P2
- Steps: commit 2026 again after COMMITTED.
- Expected: `409 CONFLICT`, `error.code=YEAR_ALREADY_CLOSED`.

**TC-G03-098 — Pending leave blocks close** · Priority: P2
- Preconditions: an EMP has a SUBMITTED leave spanning the year boundary.
- Steps: commit.
- Expected: `409 CONFLICT`, `error.code=PENDING_LEAVE_BLOCKS_CLOSE`.

**TC-G03-099 — Post-close reconciliation** · Priority: P1
- Steps: after commit, run `JOB-G03-LEDGER-RECON` for the closed and opening years.
- Expected: 0 mismatch; each closing `balance_after` = opening credit; ledger conservation holds across the year boundary.

### FR-16 — Leave Encashment (In-Service / LTC / Retirement)

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-100 | FR-16 AC1/AC2 | Functional | In-service encashment within cap → ledger + feed |
| TC-G03-101 | FR-16 AC3 / R5 / VAL-G03-RETIRE-ENCASH | Boundary | Retirement EL-to-cap then HPL make-up to 300 |
| TC-G03-102 | FR-16 AC4 / R12 / VAL-G03-LTC | Boundary | LTC 10/block, 60/career caps |
| TC-G03-103 | FR-16 AC5 | Negative | Non-encashable type / over-cap |
| TC-G03-104 | FR-16 / auth-matrix | Authorization | Encashment authorisation is HR-Admin-only |

**TC-G03-100 — In-service encashment** · Priority: P1
- Preconditions: EL 130, `is_encashable`, `encashment_cap_days=15`, `min_balance_for_encash` satisfied.
- Steps: `POST /atl/encashments {encashment_type:"IN_SERVICE", leaveTypeId:EL, days_requested:10}`; HR approves decision.
- Expected: `201`→`APPROVED`; ledger `ENCASHMENT −10`; `payroll_attendance_feed.encashment_amount` set (G10 computes final); estimated amount echoed.

**TC-G03-101 — Retirement EL+HPL make-up (boundary math)** · Priority: P1
- Preconditions: retiring EMP with EL 250, HPL 120; `retirement_encash_cap_days=300`; EL `is_encashable_on_retirement`, HPL retirement make-up.
- Steps: `POST /atl/encashments {encashment_type:"RETIREMENT"}`.
- Expected: `el_days_component=250` (EL to cap), `hpl_days_component=50` (make-up to reach 300, from HPL cash-equivalent); combined = 300 (`VAL-G03-RETIRE-ENCASH`); requesting > 300 combined rejected; integrates with G11 settlement.

**TC-G03-102 — LTC caps** · Priority: P1
- Preconditions: EMP with `ltc_block_ref` block already having 10 EL days encashed; career total near 60.
- Steps: request another LTC encashment in the same block / that would exceed 60 career.
- Expected: `409 CONFLICT`, `error.code=LTC_BLOCK_EXHAUSTED` (`ERR-G03-LTC-EXHAUSTED`, `VAL-G03-LTC`); within caps → approved.

**TC-G03-103 — Non-encashable / over-cap** · Priority: P2
- Test data: encash a non-encashable type; and EL request exceeding `encashment_cap_days`.
- Expected: `422 NOT_ENCASHABLE`; `409 ENCASHMENT_CAP_EXCEEDED` respectively.

**TC-G03-104 — HR-Admin-only authorisation** · Priority: P1
- Steps: `LADM` attempts to authorise (approve) an encashment case-by-case.
- Expected: `403 FORBIDDEN` — encashment authorisation is HR-Admin-only (§3.1.1; auth-matrix `g03.leave.sanction_special` sod note); HRADM succeeds.

### FR-17 — Attendance & Leave → Payroll (LWP) Feed

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-105 | FR-17 AC1/AC2 | Functional | Feed aggregates LWP/half-pay/OT/present/encashment |
| TC-G03-106 | FR-17 AC3 | State-Transition | Export locks period; ack → ACKED; timeout → FAILED |
| TC-G03-107 | FR-17 AC3 / R6 | Negative | Generate for already-locked period rejected |
| TC-G03-108 | FR-17 AC3 / R6 | Data-Integrity | Late correction → adjustment in next open period |
| TC-G03-109 | FR-17 AC5 | Data-Integrity | Feed reconciles to allocations + ledger |

**TC-G03-105 — Feed aggregation** · Priority: P1
- Preconditions: EMP-1001 July: 1 LWP/ABSENT day, 2 HPL days, 60 paid-OT min, present_units elsewhere, an approved encashment.
- Steps: `POST /atl/payroll-feed/generate {payPeriod:"2026-07"}`; `GET /atl/payroll-feed?payPeriod=2026-07`.
- Expected: row shows `lwp_days=1` (from ABSENT/LWP allocations), `half_pay_days=2` (HPL), `paid_ot_minutes=60`, `present_units` from present-counting statuses (PRESENT/WFH/ON_DUTY/ON_LEAVE-paid/HALF_DAY 0.5), `encashment_amount` set.

**TC-G03-106 — Export lifecycle** · Priority: P2
- Steps: export feed (X.3) → `EXPORTED`, `is_locked=true`; G10 ack via `POST /atl/payroll-feed/{id}/ack` → `ACKED`; simulate ack timeout → `FAILED` with X.3 retry.
- Expected: state transitions per §10.5; `is_locked` set on export (`JOB-M05-LOCK`).

**TC-G03-107 — Regenerate locked period** · Priority: P2
- Steps: `POST /atl/payroll-feed/generate` for an already-locked 2026-06.
- Expected: `409 CONFLICT`, `error.code=PERIOD_ALREADY_LOCKED`.

**TC-G03-108 — Late correction → adjustment** · Priority: P1
- Preconditions: 2026-06 locked; a late-approved regularisation reduces an ABSENT to PRESENT.
- Steps: process the correction.
- Expected: `GET /atl/payroll-feed/adjustments?payPeriod=2026-07` shows a `PRESENT_DELTA`/`LWP_DELTA` row applied in the next open period; locked June feed unchanged (R6).

**TC-G03-109 — Feed reconciliation** · Priority: P2
- Steps: cross-check feed figures against `attendance_day_allocations` and `leave_balance_ledger`.
- Expected: LWP/half-pay/present totals reconcile exactly to allocations + ledger; no silent divergence.

### FR-18 — Self-Service & Notifications

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-110 | FR-18 AC1 | Functional | Self-service summary exposes balance/ledger/forecast |
| TC-G03-111 | FR-18 AC3 | Functional | Each lifecycle transition emits an X.2 notification |
| TC-G03-112 | FR-18 AC4 | Functional | Statutory/approval EMAIL mandatory, non-suppressible |
| TC-G03-113 | FR-18 AC2 / workspace | Authorization | Workspace (Me/My Team/Admin) derives from RBAC |

**TC-G03-110 — Self-service summary** · Priority: P3
- Steps: EMP-1001 `GET /atl/self-service/summary`.
- Expected: `200`; balances, ledger link, forecast, comp-off wallet, request status; masked PII per P02.

**TC-G03-111 — Notification on transition** · Priority: P2
- Steps: submit → approve a leave; inspect `notifications`.
- Expected: `MSG-G03-*` entries for submitted (approver) and approved (applicant) with IN_APP + EMAIL; recorded in platform `notifications` (X.2), retried on failure.

**TC-G03-112 — Mandatory statutory email** · Priority: P2
- Preconditions: EMP-1001 opted out of email.
- Steps: trigger an approval-workflow notification.
- Expected: EMAIL still dispatched (approval-workflow + statutory notices non-suppressible per X.2/§9.9); non-statutory IN_APP respects prefs.

**TC-G03-113 — Workspace derivation** · Priority: P3
- Steps: load app as EMP-1001, MGR-2001, HRADM.
- Expected: Me only / Me+My Team / +Admin surfaces respectively, derived from RBAC holdings.

### FR-19 — Approval Delegation & Out-of-Office

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-114 | FR-19 AC1/AC2 | Functional | Delegation routes pending + new tasks to delegate |
| TC-G03-115 | FR-19 AC3 | State-Transition | SLA-breach auto-routing |
| TC-G03-116 | FR-19 AC4 / SoD | Authorization | Delegate equals applicant rejected |
| TC-G03-117 | FR-19 AC4 | Negative | No delegate available → escalate to HR |

**TC-G03-114 — Delegate routing** · Priority: P2
- Steps: MGR-2001 `POST /atl/delegations {delegate_user_id:MGR-2002, request_types:["LEAVE"], from_date, to_date}`; a report submits leave.
- Expected: pending + new leave `workflow_actions` route to MGR-2002 (P01 `delegate`); delegated items badged.

**TC-G03-115 — SLA auto-route** · Priority: P3
- Preconditions: `auto_on_sla_breach=true`, no active window; approval breaches SLA.
- Expected: P01 auto-routes to the delegate/escalation even absent an explicit window.

**TC-G03-116 — Delegate is applicant** · Priority: P2
- Test data: delegation where delegate == the applicant of a routed request.
- Expected: `422 VALIDATION_FAILED`, `error.code=DELEGATE_IS_APPLICANT` (P02 SoD).

**TC-G03-117 — No delegate** · Priority: P3
- Steps: SLA breach with no eligible delegate.
- Expected: `409 CONFLICT`, `error.code=NO_DELEGATE_AVAILABLE`; escalated to HR.

### FR-20 — Time-Fraud & Punch Anomaly Review

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-118 | FR-20 AC1 | State-Transition | Flagged punch opens review case |
| TC-G03-119 | FR-20 AC3/AC4 | State-Transition | Confirm valid releases; confirm fraud excludes + notifies |
| TC-G03-120 | FR-20 AC2 / SoD | Authorization | Reviewer cannot self-clear own punch |
| TC-G03-121 | FR-20 AC5 | Data-Integrity | Unresolved anomalies before lock surfaced in reconciliation |

**TC-G03-118 — Review case opens** · Priority: P2
- Preconditions: TC-G03-019 flagged punch.
- Steps: `GET /atl/anomalies?status=OPEN`.
- Expected: case OPEN with `anomaly_type`, punch excluded pending review.

**TC-G03-119 — Reviewer disposition** · Priority: P1
- Steps: `REV` `POST /atl/anomalies/{id}/decision` confirm valid → `CONFIRMED_VALID` (punch released to FR-04); a second case confirm fraud → `CONFIRMED_FRAUD` (punch excluded, X.2 notify HR/Security).
- Expected: transitions per §10.7; FR-04 recompute reflects released/excluded punch.

**TC-G03-120 — Self-clear blocked** · Priority: P1
- Steps: reviewer who owns the flagged punch attempts to dispose it.
- Expected: `403 FORBIDDEN` (P02 SoD: reviewer ≠ punch owner; auth-matrix `g03.punch.review_anomaly` sod).

**TC-G03-121 — Unresolved before lock** · Priority: P2
- Preconditions: OPEN anomaly for a day in the period being feed-generated.
- Steps: generate payroll feed.
- Expected: unresolved case surfaced in payroll reconciliation (not silently included in a locked feed).

### FR-21 — DPDP Biometric/Geo Consent & Fallback

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-122 | FR-21 AC1/AC2 | Functional | Record lawful basis/consent; grant then withdraw |
| TC-G03-123 | FR-21 AC3 | Negative | Capture without valid basis → CONSENT_REQUIRED |
| TC-G03-124 | FR-21 BR | Negative | Withdrawal with no fallback available |
| TC-G03-125 | FR-21 AC5 | State-Transition | Retention purge removes biometric/geo past retention_until |
| TC-G03-126 | FR-21 LLD | Negative | Purge blocked by legal hold |
| TC-G03-127 | FR-21 AC6 / PII ceiling | Authorization | DPO governance; biometric never displayed |

**TC-G03-122 — Consent lifecycle** · Priority: P2
- Steps: `POST /atl/consents {employeeId:EMP-1003, lawful_basis:"CONSENT", capture_types:["BIOMETRIC","GEO"], fallback_method:"RFID"}`; then `POST /atl/consents/{id}/withdraw`.
- Expected: `GRANTED` then `WITHDRAWN`; withdrawal engages fallback for future punches; linked to P05 `consent_records`.

**TC-G03-123 — Capture without basis** · Priority: P1
- Preconditions: EMP with no GRANTED/STATUTORY basis and no fallback.
- Steps: biometric/geo punch.
- Expected: `403 FORBIDDEN`, `error.code=CONSENT_REQUIRED` (`ERR-G03-CONSENT`); fallback offered.

**TC-G03-124 — Fallback unavailable** · Priority: P2
- Steps: withdraw consent for an employee with no working fallback enrolled.
- Expected: `409 CONFLICT`, `error.code=FALLBACK_UNAVAILABLE`.

**TC-G03-125 — Retention purge** · Priority: P2
- Preconditions: punches/consent past `retention_until`, no legal hold.
- Steps: `POST /atl/retention/purge-run` (`JOB-G03-RETENTION-PURGE`).
- Expected: biometric/geo/punch anonymised/deleted; leave records retained per statutory floor; consent → PURGED.

**TC-G03-126 — Purge blocked by legal hold** · Priority: P2
- Preconditions: active legal hold on the subject.
- Expected: `409 CONFLICT`, `error.code=PURGE_BLOCKED_LEGAL_HOLD`.

**TC-G03-127 — DPO PII ceiling** · Priority: P2
- Steps: `DPO` reads consent/basis governance; attempt to view raw biometric template.
- Expected: governance metadata visible; biometric TIER-1 never rendered in UI (auth-matrix `g03.biometric.govern` pii_tier_gate); non-DPO/HR blocked `403`.

### FR-22 — Sanction-Leave Entitlement Counters

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-128 | FR-22 AC1/AC4 | Functional | Sanction leave consumes entitlement; ledger informational AVAIL |
| TC-G03-129 | FR-22 AC2 | Boundary | Entitlement exceeded rejected |
| TC-G03-130 | FR-22 AC3 / VAL-DEPENDENT | Negative | Dependent predicate failure |
| TC-G03-131 | FR-22 §5.6 r15 | Data-Integrity | Sanction avail checks entitlement, not positive balance |

**TC-G03-128 — Entitlement consumption** · Priority: P1
- Preconditions: EMP-1006 (female) CCL entitlement CAREER 730 consumed 120 (remaining 610); eligible dependents.
- Steps: apply CCL 10 days; approve.
- Expected: `consumed_days→130`, `remaining_days→600`; ledger records informational `AVAIL` (not a positive-balance debit).

**TC-G03-129 — Entitlement exceeded** · Priority: P1
- Test data: apply CCL exceeding remaining (e.g. 620 when 600 left).
- Expected: `409 CONFLICT`, `error.code=ENTITLEMENT_EXCEEDED`.

**TC-G03-130 — Dependent predicate failure** · Priority: P2
- Test data: CCL applicant with 3 surviving children (> 2) or child age > 18/22-if-disabled.
- Expected: `422 VALIDATION_FAILED`, `error.code=INELIGIBLE_DEPENDENT` (checked vs G01 `employee_dependents` + `dependent_leave_eligibility.is_surviving`, `VAL-DEPENDENT`).

**TC-G03-131 — Entitlement not balance** · Priority: P2
- Preconditions: sanction type has no positive `leave_balances` row.
- Steps: apply within entitlement.
- Expected: application accepted based on `leave_entitlements.remaining_days` (not a leave balance), per §5.6 r15.

### FR-23 — Forecast / Mass-Leave / Blackout / Return-to-Work

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-132 | FR-23 AC1 | Functional | Balance forecast projects accruals/committed/lapse |
| TC-G03-133 | FR-23 AC2 | Data-Integrity | Mass-leave applies cohort atomically + summary |
| TC-G03-134 | FR-23 AC3 / VAL-HOLD | Negative | Blackout blocks configured types |
| TC-G03-135 | FR-23 AC4 | State-Transition | Return-to-work gates attendance until CLEARED |

**TC-G03-132 — Forecast** · Priority: P3
- Steps: `GET /atl/leave-balances/forecast?employeeId=EMP-1001&asOf=2026-12-31`.
- Expected: projected balance factoring scheduled accruals, approved future leave, lapse risk; read-only (no ledger writes).

**TC-G03-133 — Mass-leave atomic** · Priority: P2
- Steps: `POST /atl/mass-leave` for an org-unit cohort (shutdown day).
- Expected: per-employee applications/holidays created atomically with a summary; ineligible employees skipped and reported; all under P02 scope + P05 audit.

**TC-G03-134 — Blackout block (FR-23 path)** · Priority: P2
- Steps: mass-leave / application targeting a blocked type in an active blackout.
- Expected: `409 CONFLICT`, `error.code=BLACKOUT_PERIOD` (`VAL-HOLD`).

**TC-G03-135 — Return-to-work gate** · Priority: P2
- Preconditions: long-medical leave set `return_to_work_status=PENDING`.
- Steps: attempt attendance resume before clearance; then `POST /atl/leave-applications/{id}/return-to-work` with fitness cert (G13).
- Expected: pre-clearance → `412 PRECONDITION_FAILED`/`409` `RETURN_TO_WORK_PENDING`; after clearance `CLEARED`, attendance resumes.

### Cross-Cutting: E2E, Contract, Authorization, Multi-Tenancy

| TC | Traces-to | Type | Title |
|---|---|---|---|
| TC-G03-136 | §5.8 worked example | E2E-Flow | One leave day, apply→approve→attendance→SR→feed→year-close |
| TC-G03-137 | §8.9 / B3/B4 | E2E-Flow | Approved leave exposes leave_spell_lineage_id to G04; no /sr/ingest call |
| TC-G03-138 | B3 / FR-13 | E2E-Flow | Lineage constant across approve→amend→cancel |
| TC-G03-139 | §8.2/§8.3 | API-Contract | Canonical error envelope + X-Correlation-Id header |
| TC-G03-140 | §8.1 | API-Contract | Cursor pagination bounds (default 25 / max 100) |
| TC-G03-141 | error-taxonomy | Authorization | Unauthenticated request → 401 |
| TC-G03-142 | Platform §0.1 / scope safety | Authorization | Cross-tenant access is not-found, not leaked |
| TC-G03-143 | §5.6 r1/r3 | Data-Integrity | Ledger conservation across mixed operations |

**TC-G03-136 — Full leave-day E2E** · Priority: P1
- Preconditions: EMP-1001 EL 130.0.
- Steps: (1) apply 0.5 EL FIRST_HALF 2026-07-10; (2) HR approves `expectedVersion:7`; (3) run FR-04 attendance process for the day; (4) let G04 post to SR; (5) generate 2026-07 payroll feed; (6) simulate 2026 year-close.
- Expected: reservation 0.5→consumed; ledger `AVAIL −0.5 (129.5)`; two allocations `ON_LEAVE×0.5`+`PRESENT×0.5`, `present_units=1.0`; `sr_posting_status=POSTED`; feed `present_units=1.0, lwp_days=0, half_pay_days=0`; year-close lapses EL above CF cap; reconciliation 0 mismatch (§5.8).

**TC-G03-137 — G04 lineage handoff; no SR write** · Priority: P1
- Steps: approve an SR-relevant leave; capture the emitted event and monitor the network.
- Expected: G03 emits a signed (HMAC) `LEAVE_APPROVED` event carrying a stable `leave_spell_lineage_id` (+ `event_sequence`) consumed by G04; `sr_posting_status` PENDING→POSTED on G04 ack; **G03 never calls `POST /api/v1/sr/ingest`** and never writes `service_register_events` (B4); network spy asserts zero `/sr/ingest` calls.

**TC-G03-138 — Lineage stability** · Priority: P1
- Steps: approve (event `LEAVE_APPROVED`), amend, then cancel the same spell.
- Expected: all three G04 events (`LEAVE_APPROVED`/`LEAVE_AMENDED`/`LEAVE_CANCELLED`) carry the **same** `leave_spell_lineage_id` with increasing `event_sequence`; G04 dedupes by `lineage_id + event_sequence` (B3).

**TC-G03-139 — Error envelope contract** · Priority: P1
- Steps: trigger any 4xx (e.g. TC-G03-073); inspect body + headers.
- Expected: body is exactly `{ "error": { "code", "message", "field", "details" } }`; no body `requestId`; correlation id only in `X-Correlation-Id` response header and written to the P05 audit line.

**TC-G03-140 — Pagination bounds** · Priority: P2
- Steps: `GET /atl/leave-applications?limit=500`; `GET .../?limit=` (default); paginate with `cursor`/`next_cursor`.
- Expected: `limit` clamped to max 100; default 25; response carries `next_cursor`; stable cursor traversal, no duplicates/omissions.

**TC-G03-141 — Unauthenticated** · Priority: P1
- Steps: any `/atl/*` call with absent/expired Bearer token.
- Expected: `401 UNAUTHENTICATED`.

**TC-G03-142 — Cross-tenant isolation** · Priority: P1
- Steps: EMP-1001 (T1) requests EMP-T2 (T2) balances/applications by id; and an unscoped query.
- Expected: `404 NOT_FOUND` (out-of-scope indistinguishable from absent, no existence leak); unscoped query rejected, not defaulted (Platform §0.1).

**TC-G03-143 — Ledger conservation invariant** · Priority: P1
- Steps: run a mixed sequence — accrual, apply+approve, cancel (reversal), adjustment, year-close — for EMP-1001 EL; sum signed ledger `amount` from OPENING.
- Expected: running `balance_after` is monotonically consistent; final sum equals `leave_balances.current_balance`; every balance change has exactly one ledger row; append-only (no UPDATE/DELETE) holds throughout (§5.6 r1/r3).

---

## 3. Traceability Matrix (FR → TC — 0 gaps)

| FR | Title | Test cases |
|---|---|---|
| FR-01 | Shift & Roster Management | TC-G03-001..006 |
| FR-02 | Holiday Calendar & RH | TC-G03-007..010 |
| FR-03 | Punch Ingestion | TC-G03-011..021 |
| FR-04 | Daily Attendance Processing & Allocation | TC-G03-022..030 |
| FR-05 | Missed-Punch Regularisation | TC-G03-031..037 |
| FR-06 | Overtime | TC-G03-038..042 |
| FR-07 | Work-From-Home | TC-G03-043..045 |
| FR-08 | On-Duty / Tour | TC-G03-046..048 |
| FR-09 | Compensatory-Off | TC-G03-049..053 |
| FR-10 | Leave-Type & Policy Config | TC-G03-054..059 |
| FR-11 | Accrual / Ledger / Concurrency | TC-G03-060..070 |
| FR-12 | Leave Application & Approval | TC-G03-071..085 |
| FR-13 | Cancellation & Modification | TC-G03-086..090 |
| FR-14 | Backdate & Team Calendar | TC-G03-091..094 |
| FR-15 | Leave-Year Close | TC-G03-095..099 |
| FR-16 | Encashment | TC-G03-100..104 |
| FR-17 | Payroll (LWP) Feed | TC-G03-105..109 |
| FR-18 | Self-Service & Notifications | TC-G03-110..113 |
| FR-19 | Delegation & OOO | TC-G03-114..117 |
| FR-20 | Anomaly Review | TC-G03-118..121 |
| FR-21 | DPDP Consent & Fallback | TC-G03-122..127 |
| FR-22 | Sanction Entitlement Counters | TC-G03-128..131 |
| FR-23 | Forecast / Mass-Leave / Blackout / RTW | TC-G03-132..135 |
| Cross-cutting (E2E/contract/authz/multi-tenant/ledger) | Platform §8, §5.8, §5.6 | TC-G03-136..143 |

**Special-coverage confirmation (per brief):**

| Required area | Test cases |
|---|---|
| Leave accrual + carry-forward + encashment boundary math | TC-G03-060, 061, 096, 101, 102 |
| Ledger integrity + optimistic-lock concurrency (2 concurrent apps) | TC-G03-062, 063, 065, 085, 143 |
| Leave application/approval/cancellation (P01) | TC-G03-071, 075, 081, 082, 086, 087 |
| Commuted-leave-requires-HPL | TC-G03-056 (config), 076 (apply) |
| Blackout/hold | TC-G03-077, 134 |
| Backdated leave | TC-G03-091, 092 |
| LWP → payroll feed | TC-G03-105, 108 |
| Attendance punch ingest + regularisation | TC-G03-011..021, 031..037 |
| Shift / roster | TC-G03-001..006 |
| Comp-off | TC-G03-041, 049..053 |
| Year-close | TC-G03-095..099 |
| E2E lineage → G04, no /sr/ingest | TC-G03-137, 138 |
| Authorization | TC-G03-006, 037, 059, 078, 094, 104, 116, 120, 127, 141, 142 |
| State-transition (valid + invalid) | TC-G03-003, 004, 028, 033, 034, 075, 081, 082, 083, 086, 087, 106, 119, 135 |
| Data-integrity (balance never negative, ledger conservation) | TC-G03-026, 027, 062, 063, 065, 066, 109, 143 |

---

## 4. Coverage Summary

**Total test cases: 143**

### By type

| Type | Count | TC ids |
|---|---|---|
| Functional | 30 | 001, 007, 017, 022, 025, 029, 031, 038, 043(fn), 046, 049, 050, 054, 057-note, 074, 091, 093, 100, 105, 110, 111, 112, 114, 122, 128, 132, 133 (+ 023-derived), etc. |
| Boundary | 12 | 002, 009, 015, 020, 023, 032, 060, 061, 073, 092, 096, 101, 102, 129 |
| Negative | 34 | 008, 012(dup), 013, 018, 032, 035, 039, 042, 044, 045, 047, 048, 051, 052, 055(neg), 058, 059(note), 069, 073, 076, 077, 079, 080, 088, 092, 097, 098, 103, 117, 123, 124, 126, 130, 134 |
| Authorization | 11 | 006, 037, 059, 078, 094, 104, 116, 120, 127, 141, 142 |
| State-Transition | 18 | 003, 004, 019, 028, 033, 034, 057, 075, 081, 082, 083, 086, 087, 106, 115, 118, 119, 135 |
| Data-Integrity | 20 | 005, 010, 012, 016, 026, 027, 030, 053, 062, 063, 066, 068, 070, 089, 090, 099, 108, 109, 121, 131, 133, 143 |
| API-Contract | 5 | 011, 084, 139, 140 (+ envelope checks embedded) |
| Concurrency | 3 | 065, 085 (+ 067 lock path) |
| E2E-Flow | 3 | 136, 137, 138 |

> Note: several cases assert more than one concern (e.g. authorization + negative, or state-transition + data-integrity); the table above lists each case under its **primary** declared Type. Primary-type totals: Functional 27, Negative 34, Data-Integrity 20, State-Transition 18, Boundary 13, Authorization 11, API-Contract 5, Concurrency 2, E2E-Flow 3 = **143**.

### By priority

| Priority | Count | Meaning |
|---|---|---|
| P1 (critical) | 58 | Money/ledger/concurrency/statutory/SoD/E2E paths — must pass to ship |
| P2 (high) | 63 | Core functional + integrity + authorization |
| P3 (medium) | 22 | Secondary flows, UI-adjacent, caps/edge advisories |

### FR coverage

**23 of 23 functional requirements covered (FR-01…FR-23) — 0 gaps.** All platform contract concerns (error envelope, pagination, idempotency, correlation id, multi-tenant scope safety), all G03 state machines (leave_application, regularisation, overtime, punch_anomaly_review, consent_record, year_close_run), the ERR-G03-* / bare-reason error mappings, and the G03→G04 SR-lineage handoff (with the negative assertion that G03 never calls `/sr/ingest`) are exercised.
