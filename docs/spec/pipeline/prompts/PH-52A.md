# PH-52A — Raise contract coverage: G06 sanctioned-post route exposure

## Objective
Continue the coverage workstream into G06 (29.1%): expose the FR-015 sanctioned-posts establishment
lifecycle (register / revise / reconcile, reads + vacancy computation) as kernel routes over already-tested
`promotion` backing.

## Context
- Backing (`apps/api/src/modules/g06/promotionService.ts`): `registerSanctionedPost` / `reviseSanctionedPost`
  (maker≠checker SoD; quota-split validation), `reconcileSanctionedPost` (STRENGTH_INCONSISTENT guard),
  `getSanctionedPost`, `listSanctionedPosts`, `getVacancyComputation`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: maker cannot self-approve (FORBIDDEN 403); filled_count > sanctioned_strength fails
  closed (STRENGTH_INCONSISTENT 409); quota split must sum to 100.
- Money/strength are integers; do not reshape the vacancy arithmetic.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 489/37% → 495/37.4%.

## Evidence required
- 6 routes in `g06.routes.ts`; `apps/api/test/ph52a-*.test.cjs` covering register→revise→reconcile→reads,
  the SoD 403, and the STRENGTH_INCONSISTENT 409.
- `bash docs/spec/pipeline/checks/ph-52a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
