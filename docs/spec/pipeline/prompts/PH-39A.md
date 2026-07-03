# PH-39A — Raise contract coverage: APAR PIP + probation route exposure

## Objective
Continue the coverage workstream: expose the APAR **PIP lifecycle**, **probation-confirmation**, and two
APAR **read** endpoints as kernel routes over already-tested `aparService` backing, and ratchet the floor.

## Context
- Backing (`apps/api/src/modules/g08/aparService.ts`, tested at `ph16e-g07-g08-depth`):
  `createPip` (one open PIP/employee), `updatePipMilestone`, `closePip`, `openProbationConfirmation`,
  `decideProbation` (cumulative extension cap), `listReportPeriods`, `listGoalSnapshots`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- JSON clients send numbers as numbers: read numeric body fields with a number-or-numeric-string helper,
  not `requiredString`.
- Preserve guards: PIP requires ≥1 milestone + no existing open PIP; probation extension enforces the cap.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 397/30% → 404/30.5%.

## Evidence required
- 7 routes in `g08.routes.ts`; `apps/api/test/ph39a-*.test.cjs` covering PIP happy path, probation
  extend-cap + confirm, and the read endpoints.
- `bash docs/spec/pipeline/checks/ph-39a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or the cap/guard semantics are ambiguous (record the assumption).
