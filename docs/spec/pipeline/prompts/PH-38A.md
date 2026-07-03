# PH-38A — Raise contract coverage: APAR calibration route exposure

## Objective
Raise measured contract coverage (user-directed workstream) by exposing the APAR **calibration lifecycle**
as kernel routes. The backing service methods already exist and are tested at the service level
(`ph16e-g07-g08-depth`); this tranche wires them to the HTTP kernel and ratchets the PH-37 floor.

## Context
- Backing: `apps/api/src/modules/g08/aparService.ts` — `createCalibrationSession`,
  `proposeCalibrationRecommendation`, `ratifyCalibrationRecommendation` (SoD), `applyCalibrationAdjustment`
  (fail-closed `ERR-G08-RATIFY`), `calibrationDistributionDiagnostic` (read-only, never blocks).
- Routes: `apps/api/src/routes/g08.routes.ts` (RouteDefinition[] + `routes.forEach(kernel.register)`).
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes to game the ratchet.** Every new route must wire a real, tested backing method and
  be exercised by an API test that dispatches through the kernel.
- Preserve the SoD and fail-closed guards (a committee member cannot ratify; apply requires RATIFIED).
- Raise the ratchet floor in the report + `ph37a` test + `ph-37a.sh` together (392/29.6% → 397/30%).

## Evidence required
- 5 calibration routes in `g08.routes.ts`; `apps/api/test/ph38a-*.test.cjs` covering the happy path +
  the `ERR-G08-RATIFY` fail-closed path.
- `bash docs/spec/pipeline/checks/ph-38a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN
  at the raised floor; typecheck + full suite green.

## Escalate when
- A backing method turns out to be a stub (then it is not eligible for route exposure — pick another).
