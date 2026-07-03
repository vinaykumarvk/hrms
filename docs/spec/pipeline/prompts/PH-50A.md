# PH-50A — Raise contract coverage: G03 leave/attendance route exposure

## Objective
Continue the coverage workstream into G03 (40.2%): expose leave year-close simulate, leave encashment,
mass-leave, and punch-review / attendance-exception reads as kernel routes over already-tested backing.

## Context
- Backing (`apps/api/src/modules/g03/`): `leaveYearCloseService.simulateYearClose/encashLeave (cap +
  NOT_ENCASHABLE guards)/listEncashments`; `leaveBlackoutMassService.applyMassLeave (≥1 member; blackout
  guard)`; `punchAnomalyService.resolveReview (SoD)/getReview`; `attendanceExceptionService.listExceptions`.
  (`listActiveBlackouts` is repository-only — do not route it.)
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: encashment cap (ENCASHMENT_CAP_EXCEEDED), mass-leave ≥1 member (VALIDATION_FAILED),
  resolve non-existent review → NOT_FOUND.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 475/35.9% → 482/36.4%.

## Evidence required
- 7 routes in `g03.routes.ts`; `apps/api/test/ph50a-*.test.cjs` covering year-close simulate, encashment
  (+ cap 4xx), mass-leave (+ empty-member 400), and punch-review/exception reads.
- `bash docs/spec/pipeline/checks/ph-50a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
