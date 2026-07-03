# PH-64A — Net-new implementation: G01 FR-EPM-006 education register

## Objective
Implement the FR-EPM-006 education register **end-to-end** — new backing (third net-new tranche).

## Context
- Contract: `docs/contracts/openapi/G01.yaml` `Education` schema + `/employees/{id}/education` (GET/POST/PATCH/
  DELETE); BRD `docs/brd/v3/G01-employee-profile-management.md` FR-EPM-006.

## What to build
- `apps/api/src/modules/g01/educationService.ts` — repository + `InMemoryEducationRepository` +
  `EducationService` (list/add/update/remove).
- Single-highest invariant: within one employee, AT MOST ONE ACTIVE record may carry `is_highest=true`.
  The service maintains it — promoting a record auto-demotes the prior highest (not a rejection).
- `year_of_passing` validation (1950–2100); optimistic locking on update (row_version → CONFLICT 409);
  soft-delete (INACTIVE) that also clears is_highest.
- Wire `services.education` in `foundationServices.ts`; register the 4 routes in `g01.routes.ts`.

## Constraints
- **Real behavior, no stubs.** The single-highest auto-demotion, optimistic lock, and soft-delete must work.
- Every mutation audited (P05); reads validate the employee exists (NOT_FOUND).

## Evidence required
- `apps/api/test/ph64a-*.test.cjs` covering the single-highest invariant (add/promote auto-demotes),
  year-of-passing 400, optimistic-lock 409, and soft-delete clearing is_highest.
- `bash docs/spec/pipeline/checks/ph-64a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- The contract's is_highest semantics are ambiguous (record the assumption in the service doc comment).
