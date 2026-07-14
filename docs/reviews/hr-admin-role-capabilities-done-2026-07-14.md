# Done Report — hr_admin Role Capabilities: Test Coverage, SoD Remediation, Gap Remediation

**Date:** 2026-07-14
**Path:** standard (per-module: test/remediate against runtime, on stable contracts — not greenfield)

## Objective

For every `hr_admin` (HR Administrator) capability named across G01, G02, G03, G04, G05, G08
(flag only), G10, G12, G13, G14 in the user's goal message, test it against the real runtime and
remediate every gap: permission-string drift, missing capability-flag enforcement, and entirely
unbuilt capabilities. Additionally: correct a stated architectural boundary — `hr_admin` must have
**no direct grants** in G06 (promotion), G07 (training), G09 (disciplinary), or G11 (pension),
which stay with their dedicated statutory roles (a deliberate separation-of-duties boundary) — and
verify the cross-cutting P01 workflow-resolver override list and Tier-1/Tier-2 PII visibility
claims.

## Scope decisions (user-confirmed via `AskUserQuestion`, all three "(Recommended)" options)

1. **Permission-naming drift**: test against actual runtime permission strings, not the user's
   naming — document every mismatch as a finding rather than renaming code.
2. **SoD correction**: remove `hr_admin` from the G06/G07/G09/G11 override-role sets to enforce the
   stated boundary, then re-run the full test suite to catch and fix any regressions.
3. **Unbuilt capabilities**: build thin-but-real versions (real service method + route + test +
   capability-flag check) rather than stubs or skeletons.

## Summary

Ten sub-tasks were run in sequence, each producing a `docs/reviews/brd-coverage-<gN>-hr-admin-capabilities-2026-07-14.md`
report (G01–G05 individually, G08/G10/G12/G13/G14 combined) plus one cross-cutting report
(`hr-admin-cross-cutting-boundaries-2026-07-14.md`). Every module was tested against the real
runtime via `createFoundationServices()` (in-memory backend, real seeded PH-03/test-employee data),
never mocked.

**Net result:** every named capability across all 10 modules is now tested, correctly
capability-flag-gated, and traceable to a runtime permission string. The SoD boundary is now
enforced in code (previously contradicted by code added earlier in this same session). Eight
capabilities that had no implementation at all now have thin, real, tested implementations. Zero
regressions in the full backend (705 tests) or frontend (153 tests) suites, and one genuine
pre-existing bug (`LeaveService.approve()` non-atomicity) was discovered, flagged, and left
unfixed as out of scope for this goal (documented below).

## Capability coverage by module

| Module | Capabilities audited | Outcome |
|---|---|---|
| G01 Employee Profile | `epm.employee.manage`, PII unmask read/write (`g01.employee.pii.correct`, new), `g01.bank.approve` re-verify, BGV review (new `BackgroundVerificationService`, `bgv_reviewer` flag) | 2 new capabilities built, rest verified |
| G02 Personal Details Workflow | fraud-signal review (`fraud_reviewer` flag added), grievance/DSR adjudication (`grievance_officer` flag added) | 2 flag-enforcement gaps fixed |
| G03 Attendance & Leave | special-leave final sanction (new `sanctionSpecialLeave`), punch-anomaly review (`anomaly_reviewer` flag added), biometric consent/retention governance (new `BiometricGovernanceService`, `dpo_governance` flag) | 2 new capabilities built, 1 flag-enforcement gap fixed |
| G04 Leave-SR Integration | dead-letter replay/discard, reconciliation run (`g04_dlq_ops` flag added to 3 methods) | 1 flag-enforcement gap fixed (3 methods) |
| G05 Transfer/Relieving/Joining | clearance grant (`g05_clearance_officer` flag added to 2 methods), estate/quarter disposition (`g05_estate_officer` flag added to 3 methods) | 2 flag-enforcement gaps fixed (5 methods) |
| G08 (flag only) | APAR sealed-cover release / confidentiality downgrade dual-control (`g08_dual_control` flag added) | 1 flag-enforcement gap fixed |
| G10 | FnF settlement sanction + pay stages (new `sanctionFnfSettlement`/`payFnfSettlement`, additive to existing compute/approve) | 2 new capabilities built |
| G12 | `g12.sr.append` → `g12.sr.ingest` | Verified, already correctly gated |
| G13 | `g13.document.store` → `g13.document.create` + `g13.retention.class.define`; `g13.letter.author`/letter_admin (new `LetterTemplateService`) | 1 new capability built, 1 verified |
| G14 | `g14.dashboard.view` → `g14.analytics.read`; `g14.report.build` (new report-definition/build/schedule methods) | 1 new capability built, 1 verified |
| Cross-cutting | P01 override-role list, Tier-1/Tier-2 PII visibility | Verified against runtime, no change needed |

## SoD boundary correction (G06/G07/G09/G11)

The user's instruction stated `hr_admin` has **no direct grants** in G06/G07/G09/G11. The initial
6-agent survey found this boundary was contradicted in code: `hr_admin` was present in the G06 and
G09 override-role sets (added earlier this session, during Initiative A's self-service build-out)
and pre-existing in G07 and G11. Per the user's confirmed choice, removed `hr_admin` from all four
modules' override-role sets:

- `promotionService.ts` / `sealedCoverService.ts` (G06): `PROMOTION_ACCESS_OVERRIDE_ROLES` /
  `SEALED_COVER_ACCESS_OVERRIDE_ROLES` → `{"promotion_officer", "system"}`.
- `trainingService.ts` (G07): `NOMINATION_OVERRIDE_ROLES` → `{"ld_manager", "ld_officer", "system"}`;
  `COMPLETION_OVERRIDE_ROLES` → `{"trainer", "ld_manager", "ld_officer", "system"}`.
- `disciplinaryService.ts` (G09): `DISCIPLINARY_ACCESS_OVERRIDE_ROLES` →
  `{"disciplinary_authority", "system"}`.
- `pensionService.ts` (G11): `PENSION_ACCESS_OVERRIDE_ROLES` → `{"pension_officer", "system"}`.

This broke 6 pre-existing tests that had explicitly asserted `hr_admin` as a valid override actor
(written earlier this session, before the boundary was stated). Fixed each to assert the corrected
behavior: `hr_admin` now gets `FORBIDDEN`/empty-filtered results, and the correct dedicated role
succeeds. Full suite re-run confirmed no further regressions.

**Known tension, documented not silently overridden:** the G06/G09/G11 module BRDs (`docs/brd/v3/`)
contain older language naming "HR Officer (Promotion Desk)", "HR-DCP Admin", and an unconditioned
"HR Admin" primary role respectively — all conflicting with the corrected boundary. Per the user's
twice-confirmed instruction (original message + `AskUserQuestion` selection), the newer instruction
was treated as authoritative and the tension recorded in
`docs/reviews/hr-admin-cross-cutting-boundaries-2026-07-14.md` and in code comments, rather than
re-asking or silently deferring to the older BRD text.

## Bugs found and fixed

| # | Module | Bug | Fix |
|---|---|---|---|
| 1 | G06/G07/G09/G11 | `hr_admin` held override access contradicting the stated SoD boundary | Removed from all 4 override-role sets; 6 dependent tests corrected |
| 2 | G02 | `adjudicateDataSubjectRequest` had no `grievance_officer` flag check | Added; signature widened from `TenantScope` to `ActorContext` to support the role check |
| 3 | G02 | `reviewRiskSignal` had no `fraud_reviewer` flag check | Added |
| 4 | G03 | `resolveReview` (punch anomaly) had no `anomaly_reviewer` flag check | Added |
| 5 | G04 | `replayDeadLetter`/`discardDeadLetter`/`runReconciliation` had no `g04_dlq_ops` flag check | Added to all 3 |
| 6 | G05 | `completeClearance`/`deemClearance` had no `g05_clearance_officer` flag check | Added |
| 7 | G05 | `approveQuarterRetention`/`flagQuarterOverstay`/`recordQuarterVacation` had no `g05_estate_officer` flag check | Added (deliberately not on the employee-initiated `requestQuarterRetention`) |
| 8 | G08 | `releaseSealedCover` (confidentiality downgrade) had no dual-control check | Added `g08_dual_control` flag check |

## Bugs found and flagged, not fixed (out of scope)

- **`LeaveService.approve()` non-atomicity** (discovered while building the G03 special-leave test):
  `approve()` mutates `application.status = "APPROVED"` before its G04 outbox/SR-posting calls,
  which check `g04.relay.write`. If that permission check throws, the application is left
  `APPROVED` in memory despite the method having thrown — a partial-write bug independent of this
  goal's scope. Documented in `docs/reviews/brd-coverage-g03-hr-admin-capabilities-2026-07-14.md`.

## New capabilities built (previously entirely unimplemented)

1. G01 `g01.employee.pii.correct` — `EmployeeMasterService.correctPii()`.
2. G01 BGV review — new `BackgroundVerificationService` (`recordBgvResult`/`reviewBgvResult`/`listBgvRecords`).
3. G03 `sanctionSpecialLeave` — final-sanction stage for statutorily-gated leave types.
4. G03 biometric governance — new `BiometricGovernanceService` (consent, retention policy, purge).
5. G10 FnF sanction stage — `sanctionFnfSettlement`.
6. G10 FnF pay stage — `payFnfSettlement`.
7. G13 letter authoring — new `LetterTemplateService` (template CRUD, merge-field generation via the
   existing document vault, certify with generator≠certifier SoD).
8. G14 report builder — new report-definition/build/schedule methods on `AnalyticsService`, reusing
   the existing mart-card infrastructure (distribution scheduling is recorded, not executed — no
   cron runner exists in this in-memory backend).

## Test files produced

- `apps/api/test/hr-admin-g01-employee-profile.test.cjs` (6 tests)
- `apps/api/test/hr-admin-g02-personal-details-workflow.test.cjs` (3 tests)
- `apps/api/test/hr-admin-g03-attendance-leave.test.cjs` (3 tests)
- `apps/api/test/hr-admin-g04-leave-sr-integration.test.cjs` (3 tests)
- `apps/api/test/hr-admin-g05-transfer-relieving-joining.test.cjs` (3 tests)
- `apps/api/test/hr-admin-g08-g10-g12-g13-g14-remaining.test.cjs` (8 tests)
- 6 pre-existing tests corrected for the SoD boundary fix (in `promotion-posting-self-service.test.cjs`,
  `disciplinary-case-self-service.test.cjs`, `pension-projection-self-service.test.cjs`)

No new web UI was built for this goal (it targets the `hr_admin` administrative capability surface,
not a new employee-facing self-service feature) — consistent with the "thin version" scope decision
and with the capabilities themselves being predominantly backend administrative actions.

## Verification

- `npm run build` — clean throughout, re-verified after every change.
- `node --test apps/api/test/*.test.cjs` — 705/706 pass (1 pre-existing unrelated skip), zero
  regressions, run after every module's changes and again as the final consolidated pass.
- `npm run check` (typecheck + build + full backend suite) — clean, 705/706 pass.
- `npm run web:check` — clean, 153/153 pass.

## Reports produced

- `docs/reviews/brd-coverage-g01-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/brd-coverage-g02-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/brd-coverage-g03-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/brd-coverage-g04-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/brd-coverage-g05-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/brd-coverage-g08-g10-g12-g13-g14-hr-admin-capabilities-2026-07-14.md`
- `docs/reviews/hr-admin-cross-cutting-boundaries-2026-07-14.md`
- Addenda added to `docs/reviews/full-review-g06-promotion-posting-self-service.md`,
  `full-review-g07-training-nomination-self-service.md`,
  `full-review-g09-disciplinary-case-self-service.md`,
  `full-review-g11-pension-projection-self-service.md` recording the SoD correction.
- This report.

## Remaining risks / caveats

- **`LeaveService.approve()` non-atomicity** (see above) — real, pre-existing, out of scope; needs
  its own fix (likely: compute the G04 permission check before mutating `status`, or wrap the
  mutation and downstream calls in a single transactional boundary).
- **Report distribution scheduling is recorded, not executed** — `scheduleReport()` persists a
  cron expression and recipient list but there is no scheduler/cron runner in this in-memory
  backend to actually dispatch reports. Consistent with "thin version" scope; flagged for whoever
  builds a real job-scheduling backend later.
- **Module-BRD text for G06/G09/G11 still names the old (now-incorrect) hr_admin grants** — not
  edited as part of this goal (a BRD amendment was out of scope for a test/remediate goal); the
  tension is documented, not resolved at the BRD level.
- `.ts` co-located test files noted as not wired into `npm run check` in earlier work on this
  branch remains a pre-existing, undocumented-elsewhere gap; not touched by this goal.
