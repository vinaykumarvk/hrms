# PH-59A — Raise contract coverage: G06 succession + qualifying-service route exposure

## Objective
Deepen G06 coverage (36% → higher, second pass): expose the succession-planning and qualifying-service
surface as kernel routes over already-tested `careerSuccession` / `promotion` backing.

## Context
- Backing (`apps/api/src/modules/g06/`): `careerSuccessionService.createSuccessionPlan/addSuccessionCandidate/
  getSuccessionPlan/getCareerPath`; `promotionService.listPromotionOrders/computeQualifyingService
  (needs an active service-exclusion rule)/getQualifyingServiceSnapshot`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: duplicate candidate → PRECONDITION_FAILED; qualifying-service compute with an unknown
  exclusion rule → NOT_FOUND; snapshot read for an unknown snapshot → NOT_FOUND.
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 536/40.5% → 543/41%.

## Evidence required
- 7 routes in `g06.routes.ts`; `apps/api/test/ph59a-*.test.cjs` covering succession create→add→read, the
  promotion-order list, and the qualifying-service NOT_FOUND guards.
- `bash docs/spec/pipeline/checks/ph-59a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is repository-only (not on the service) — skip it and pick another real service method.
