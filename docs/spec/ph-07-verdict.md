# PH-07 Verdict — Employee Transaction Wave (Coverage Delta)

**Date:** 2026-07-02 · **Branch:** ph02-rerun · **Baseline:** `docs/reviews/brd-coverage-audit-20260702.md`
**Sub-phases covered:** PH-07A (G01 satellites), PH-07B (G04 statutory relay), PH-07C (G02 workflow depth),
PH-07D (G03 payroll feed), PH-07E (employee-wave UI + this verdict).

## What this verdict is — and is not

The baseline audit found the build to be thin happy-path slices: across ~1,400 BRD line items,
roughly ~120 CONFIRMED (~9%) and ~1,170 NOT_FOUND (~84%), with every module's web surface a
read-only summary card. PH-07A–E closed a **specific, bounded set** of those gaps in the employee
wave (G01/G02/G03/G04). This verdict claims **only** that delta. It does **not** claim BRD
completeness for any module; the remaining NOT_FOUND accounting below stays open and owned by
later phases. No formal line-item re-audit has been run since 2026-07-02 — the delta rows cite
the implementing code and tests directly, and the "closed" counts are item-level tallies of those
cited closures, not a fresh 14-auditor sweep.

## Per-module coverage delta vs `brd-coverage-audit-20260702`

| Module | Audit baseline (items / CONFIRMED / NOT_FOUND) | Closed by PH-07 (evidence) | Still NOT_FOUND (owning phase) |
|---|---|---|---|
| G01 Employee Profile | ~180 / ~12 / ~158 | ~14 items. PH-07A satellites: contacts/addresses/dependents CRUD (`apps/api/src/routes/g01.routes.ts:124-247`; `apps/api/src/modules/g01/employeeMasterService.ts:563` addContact, `:808` addDependent), employee_attribute_history spine + timeline (`g01.routes.ts:248-262`, `employeeMasterService.ts:279`), outbox changes feed (`g01.routes.ts:26-33`). PH-07E UI: add-contact and add-dependent forms with onSubmit + canonical states (`apps/web/src/modules/g01/EmployeeContactsPanel.tsx:71,125`; `apps/web/src/modules/g01/EmployeeDependentsPanel.tsx:83,147`). Tests: `apps/api/test/ph07a-g01-satellites.test.cjs`, `apps/web/test/ph07e-employee-wave-ui.test.cjs`. | ~144 items remain NOT_FOUND: service events/exit lifecycle, org-unit administration, photo/biometrics, bulk onboarding, most JOB-G01-* and notification templates, SQL persistence (in-memory repositories only). Owners: PH-08A binding + PH-10C hardening; persistence cut across PH-10C. |
| G02 Personal-Details Workflow | 118 / 14 / 88 | ~16 items. PH-07C depth: field_sensitivity_catalog + approval_matrix_config consumed (`apps/api/src/modules/g02/personalDetailsRepository.ts`), SoD maker≠checker ERR-G02-SOD (`apps/api/src/modules/g02/personalDetailsService.ts:371`), mandatory decision comment ERR-REASON-REQ (`:457-463`), RETURNED/sendBack (`:184`), resubmit same requestNo +revision (`:210`), withdraw (`:252`), P02-masked per-field diff (`:276`; route `apps/api/src/routes/g02.routes.ts:93-101`). PH-07E UI: change-request editor form (`apps/web/src/modules/g02/ChangeRequestEditor.tsx:65,107`), approver queue with approve/reject/send-back + mandatory-comment guard (`apps/web/src/modules/g02/ChangeRequestApproverQueue.tsx:58-83`), masked diff view rendering server values verbatim (`apps/web/src/modules/g02/ChangeRequestDiffView.tsx:29,74`). Tests: `apps/api/test/ph07c-g02-workflow-depth.test.cjs`, `apps/web/test/ph07e-employee-wave-ui.test.cjs`. | ~72 items remain NOT_FOUND: full field catalogue beyond displayName/pan/aadhaarMasked, delegation/SLA/escalation in the G02 flow, bulk verification, DPDP consent artefacts, notifications X.2 coverage, persistence. Owners: PH-08A binding; workflow depth PH-10C. |
| G03 Attendance & Leave | 118 / 9 / 97 | ~13 items. PH-07D payroll feed: payroll_attendance_feed generate/lock/read (`apps/api/src/routes/g03.routes.ts:292-343`), PERIOD_ALREADY_LOCKED lock guard (`apps/api/src/modules/g03/leaveService.ts:936`), locked-period adjustments, day-status derivation ON_LEAVE/HOLIDAY/HALF_DAY (`leaveService.ts:921`), regularisation WINDOW_EXPIRED. PH-07E UI: `SelfServiceSummary` fetching live balances + recent applications through the client (`apps/web/src/modules/g03/SelfServiceSummary.tsx:16`), alongside the PH-06D apply form and approver inbox. Tests: `apps/api/test/ph07d-g03-payroll-feed.test.cjs`, `apps/web/test/ph07e-employee-wave-ui.test.cjs`. | ~84 items remain NOT_FOUND: shift/roster management, biometric device integration, LTC/special leave types, encashment, compensatory-off lifecycle, JOB-G03-* accrual scheduling, tour/OD flows, persistence. Owners: PH-08A binding; payroll consumption of the feed is PH-09B (G10). |
| G04 Leave↔SR Integration | 62 / 8 / 48 | ~10 items. PH-07B statutory relay: leave_spell_lineage id (`apps/api/src/modules/g04/leaveSrRelayService.ts:20`), monotonic event_sequence, payload signature + tamper rejection ERR-G04-SIGNATURE-INVALID (`leaveSrRelayService.ts:12`), exponential backoff / available_at scheduling (`:32-33,126-127`), sr_dead_letter entity, reconciliation findings MISSING_SR / ORPHAN_CORRECTION (`:86`), sr_correction_link. Tests: `apps/api/test/ph07b-g04-statutory-relay.test.cjs`. PH-07E adds no G04 UI (relay is operator-facing; existing `apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx` summary retained). | ~38 items remain NOT_FOUND: persistent outbox with row locking, scheduled relay job registration (JOB-G04-*), operational replay console UI, alerting/notification hooks, §65B-grade evidence chain. Owners: PH-10C hardening; ops console PH-10E. |

## Wave conformance evidence (PH-07E)

- All four suites green on this branch: `npm run typecheck`, `npm test` (**171 API tests pass, 0 fail**),
  `npm run web:typecheck`, `npm run web:test` (**81 web tests pass**).
- Upstream oracles re-checked GREEN: `docs/spec/pipeline/checks/ph-07a.sh` … `ph-07d.sh`, plus the
  PH-07E re-greps (attribute history, outbox, lineage, signature error, ERR-G02-SOD, ERR-REASON-REQ,
  PERIOD_ALREADY_LOCKED, ON_LEAVE) — no PH-07A–D closure regressed.
- All new UI fetches through the injected `HrmsClient` (`apps/web/src/api/hrmsClient.ts`), with the
  fixture client extended in parallel (`apps/web/src/api/fixtureHrmsClient.ts`). Forms are controlled
  with real onSubmit handlers; loading/empty/error states use the canonical `OperationalState`.
  Masked diff values render exactly as the API returns them — never reconstructed client-side.

## Known defects recorded (not repaired here)

- The G02 list route and several G03 list routes return `items.slice(limit)` without a real
  `next_cursor` (`apps/api/src/routes/g02.routes.ts:46-51`) — bounded but not truly cursor-paged.
  Owning phase: PH-10C hardening. Left as-is per the "do not repair API defects here" constraint.
- All stores remain in-memory; the SQL data model under `docs/data-model/` is still unconsumed by
  runtime. This caps every CONFIRMED above at "behaviourally proven in-memory".

## Recommendation

Park PH-07 for **human gate review**. The employee wave now has real interactive surfaces and the
statutory relay/workflow depth the audit demanded, but G01/G02/G03/G04 remain far from BRD-complete
(~338 items still NOT_FOUND across the four modules by this accounting). Proceed to PH-08 only with
that residue explicitly carried forward in the PH-08A contract-binding plan.
