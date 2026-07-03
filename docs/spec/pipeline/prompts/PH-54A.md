# PH-54A — Raise contract coverage: G05 transfer/counselling read route exposure

## Objective
Deepen G05 coverage (64% → higher): expose the transfer and counselling read surface (vacancy positions,
reservations, preferences, mutual orders, charge-handovers, relieving/joining reports) as kernel routes over
already-tested backing.

## Context
- Backing (`apps/api/src/modules/g05/`): `counsellingVacancyService.getVacancyPosition/getReservation/
  listReservations/listPreferences/getMutualOrder/listMutualOrders`; `transferService.listChargeHandovers/
  listRelievingOrders/listJoiningReports`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: get-by-id reads fail closed on unknown subjects (NOT_FOUND 404).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 504/38.1% → 513/38.8%.

## Evidence required
- 9 routes in `g05.routes.ts`; `apps/api/test/ph54a-*.test.cjs` covering the list reads (200 arrays) and
  the get-by-id NOT_FOUND guards.
- `bash docs/spec/pipeline/checks/ph-54a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
